# Sécurisation de l'accès aux données : plan d'application

## Constat (28/10/2026)
- Toutes les tables métier (`comptes`, `leads`, `visites`, `phoning`, `actions`, `notifs`, `fiches_froides`...) étaient lisibles et modifiables avec la seule clé publique, sans connexion.
- Critique : `anon` pouvait écrire `utilisateurs.token` et `token_expiry` (politique `USING true`). Poser un jeton sur le compte d'un administrateur donnait accès à la fonction `admin-users`.

## Étapes (dans cet ordre)
1. **Migration `securite_1`** : retire l'écriture anonyme sur `utilisateurs` (aucun code client ne l'utilise). Aucune dépendance côté application. À appliquer en premier.
2. **Déployer cette PR** (le navigateur envoie `x-esi-token`, vérifie la session). Sans effet tant que `securite_2` n'est pas appliquée : `verifierSession` ne déconnecte jamais si la fonction n'existe pas.
3. **Migration `securite_2`** : fonction `esi_session_valide()` + politiques RESTRICTIVES `session_requise`. Sans jeton valide, plus aucun accès ; avec jeton valide, comportement inchangé.
4. Vérifier : application connectée (listes remplies), requête avec la clé publique seule (doit renvoyer `[]`).

## Retour arrière
Chaque fichier de migration contient ses commandes de retour arrière en bas. Pour `securite_2` : supprimer les politiques `session_requise` (une commande).

## Limites connues
- Une connexion sur un second appareil remplace le jeton du premier (un seul jeton par utilisateur dans `utilisateurs`) : le premier appareil est déconnecté à sa prochaine vérification (retour sur l'onglet ou 2 minutes). Évolution possible : table `sessions` (plusieurs jetons).
- Tous les utilisateurs connectés voient les mêmes données qu'avant ; la limitation par rôle ou par commercial est une étape ultérieure.
- Stockage des photos (`storage.objects`, insertion `anon`) : à traiter à part.
- Le jeton est stocké en clair dans `utilisateurs.token` ; hachage et durée de vie plus courte à étudier.


---

## État au 29/10/2026
- `securite_1` : **appliquée** (écriture anonyme sur `utilisateurs` fermée).
- `securite_2` + client `x-esi-token` : **appliqués** (accès aux données sur session valide).
- `securite_3` (sessions multiples) : **appliquée**, avec les edge functions `auth-login` v4, `admin-users` v4, `ai-proxy` v7, `sync-sellin-semaines` v3, `sync-sellin` v14 et `sync-tracker` v7 (appels sans jeton refusés en 403).
- `securite_4` : **appliquée** (envoi de photos réservé aux sessions, jetons en clair migrés puis purgés, droits `utilisateurs` resserrés) ; `auth-login` v5 et `admin-users` v5 : hachage PBKDF2, mise à niveau à la connexion.
- `securite_5` (lot 1) : **appliquée** — visibilité par rôle sur `comptes` et `leads` (admin/channel manager : tout ; CDS : ses lignes + non attribuées). Testé : CDS 4001 voit 102 comptes (64 + 38 non attribués) et 25 leads ; channel manager 323 et 109 ; faux jeton 0.
- `securite_6` (lot 2) : **appliquée** — visites, phoning, actions, fiches_froides. Testé : CDS 4001 voit 30 visites, 0 appel, 14 actions, 14 fiches ; channel manager voit tout (309 / 148 / 370 / 186) ; faux jeton 0.
- `securite_7` (lot 3) : **appliquée** — objectifs_primes (lecture admin/CM/CDS pour sa ligne ; écriture admin et CDS pour sa ligne), notifs et vues_filtres (chacun les siennes, admin toutes). Testé : CDS 1 objectif et 3 notifs, ne peut modifier aucune ligne d'un autre ; CM 4 objectifs, 61 notifs, aucune modification ; faux jeton 0.
- `securite_8` : **appliquée** — anciens PIN (PIN_ADMIN, PIN_CHANNEL, PIN_MANAGER, PINS_CDS) masqués dans `params`.
- Non traité : `a_contacter_report`, `attributions_historique`, `sellin_agregats`, `sellin_imports`, `sellin_semaines` (lecture ouverte à toute session).
- Reste à contrôler à la main : connexion sur deux appareils, déconnexion d'un seul, synchronisation, IA.

## Étape 3 : sessions multiples (securite_3)
Constats supplémentaires pendant l'inventaire des consommateurs du jeton :
- `sync-tracker` et `sync-sellin` (service_role, `verify_jwt` désactivé) **n'exigeaient aucune authentification** : n'importe qui avec la clé publique pouvait relancer l'import du tracker (réécriture des statuts des leads) ou envoyer ses propres lignes de CA. Désormais : session ADMIN ou CHANNEL_MANAGER obligatoire (jeton dans le corps JSON).
- `ai-proxy` n'était pas versionné : sa source est maintenant dans le dépôt.

Contenu :
- table `sessions` (un jeton par appareil, **haché SHA-256**), plafond de 10 appareils par utilisateur ;
- `esi_session_info(token)` : identité d'un jeton (table `sessions`, puis ancien `utilisateurs.token`) ; les sessions actuelles restent valables jusqu'à leur expiration, personne n'est déconnecté par la migration ;
- `esi_creer_session`, `esi_fermer_session` (déconnexion d'un seul appareil) ;
- `esi_session_valide()` et les 4 fonctions métier à jeton (`reattribuer_compte`, `reporter_a_contacter`, `enregistrer_push`, `supprimer_push`) lisent `esi_session_info` ;
- edge functions : `auth-login` (crée une session, action `logout`), `admin-users`, `ai-proxy`, `sync-sellin-semaines`, `sync-sellin`, `sync-tracker`.

### Ordre d'application (chaque étape est compatible avec la précédente)
1. Migration `securite_3` (les anciens jetons continuent de fonctionner).
2. Déployer `auth-login`, `admin-users`, `ai-proxy`, `sync-sellin-semaines`.
3. Fusionner cette PR (le client envoie le jeton aux fonctions de synchro, ferme la session serveur à la déconnexion).
4. Déployer `sync-sellin` et `sync-tracker` (elles refusent alors les appels sans jeton : le client à jour en envoie un).
5. Contrôler : connexion sur deux appareils, déconnexion d'un seul, synchronisation, IA.

### Retour arrière
Voir le bas du fichier de migration ; redéployer les versions précédentes des fonctions (historique Supabase).
