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
