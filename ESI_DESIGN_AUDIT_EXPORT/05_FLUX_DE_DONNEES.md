# Flux de données et synchronisation

⚠️ Ce document décrit l'architecture **réellement en production**, vérifiée par lecture du code. Elle diffère de celle documentée dans `CLAUDE.md` — voir `00_README_CLAUDE_DESIGN.md` section 4.

---

## 1. Backend réel : Supabase (pas Google Sheets)

L'application communique avec un backend **Supabase** (base de données PostgreSQL + fonctions serveur "Edge Functions" + stockage de fichiers), via un fichier client unique : `js/api.js`.

- Ce fichier expose un objet global historiquement nommé `SheetsAPI` (nom conservé depuis une ancienne version sur Google Sheets, mais il ne s'agit plus de Sheets du tout).
- Fonctions principales : lecture de données, écriture, mise à jour, liste des commerciaux actifs, agrégats pour le dashboard, mise à jour du CA déclaré, envoi de photo, connexion utilisateur.
- Une table de correspondance interne traduit les anciens noms d'"onglets" (hérités de l'époque Google Sheets, avec emojis) vers les vraies tables de la base de données (comptes, prospects/leads, visites, appels, actions, notifications, paramètres, commandes, objectifs/primes, agrégats de ventes, utilisateurs) — un vestige de la migration qui reste invisible pour l'utilisateur final mais explique certains noms internes dans le code.

## 2. Code legacy présent mais **non exécuté**

Deux éléments existent toujours dans le dépôt mais ne sont **pas chargés par l'application** et ne fonctionnent pas :
- `js/phoneos-sheets.js` : ancien connecteur Google Apps Script, absent de la liste des scripts chargés par `index.html`, avec une URL de service jamais configurée (valeur d'exemple non remplacée).
- `backend/Code.gs` : ancien backend Google Apps Script, à déployer manuellement sur un Google Sheet — ce déploiement ne semble jamais avoir été activé en production actuelle.

Ces fichiers documentent un fonctionnement passé et **ne doivent pas être utilisés comme référence** pour comprendre le comportement actuel de l'application. Ils restent dans le dépôt à titre historique.

## 3. Mode hors-ligne (réellement implémenté, à deux niveaux)

### a) Service Worker (`sw.js`)
- Stratégie **"réseau d'abord"** pour le cœur applicatif (HTML/CSS/JS) : l'app tente toujours de récupérer la dernière version en ligne, et ne retombe sur le cache local qu'en cas d'échec réseau — objectif : que chaque utilisateur ait le code à jour sans manipulation.
- Stratégie **"cache d'abord"** uniquement pour les ressources immuables (images, icônes, polices).
- Les requêtes d'écriture (tout ce qui n'est pas une simple lecture) ne sont jamais interceptées par le cache — elles passent toujours par le réseau ou par la file d'attente décrite ci-dessous.

### b) Cache de données + file d'attente (dans `js/api.js`, stockage local du navigateur)
- Les dernières données lues sont mises en cache localement avec une durée de vie de **30 minutes**.
- En cas de perte réseau, la lecture sert automatiquement la dernière version en cache plutôt que d'échouer.
- **Les écritures ne sont jamais perdues** : si le réseau est indisponible (ou après plusieurs tentatives infructueuses), la mutation (nouveau lead, appel loggé, CA déclaré, modification de compte...) est placée dans une **file d'attente locale**, avec un message clair affiché à l'utilisateur ("sauvegardé hors-ligne, sera synchronisé"). Au retour du réseau, la file est rejouée automatiquement dans l'ordre, avec un message de progression puis de résultat.
- C'est une vraie stratégie "offline-first", pas un simple cache technique — point fort à conserver/mettre en valeur dans la refonte (ex. via l'indicateur de statut de synchronisation déjà présent dans le design system).

### c) Autres usages de stockage local (sans rapport avec le réseau)
- Session utilisateur (persistance de connexion).
- État des filtres partagé entre certaines vues.
- Brouillons de formulaire (anti-perte de saisie pendant une prise de photo).
- Une liste de "prospects à froid" saisie uniquement en local, **jamais synchronisée** vers le serveur par conception (fonctionnalité volontairement locale).
- Préférences d'affichage (densité du Kanban, colonnes visibles d'un tableau, repli de la sidebar).

## 4. Comment l'interface se met à jour après une action

Il n'y a pas de framework réactif : chaque vue régénère son propre contenu HTML. Trois mécanismes coexistent :

1. **Mise à jour optimiste locale** : après une écriture réussie, les données déjà en mémoire sont mises à jour directement (sans recharger tout depuis le serveur), puis l'écran se redessine immédiatement — donne une sensation de réactivité instantanée.
2. **Invalidation de cache ciblée** : certaines écritures déclenchent en plus la purge du cache local de la table concernée, pour forcer une lecture fraîche au prochain accès (sécurité en complément du point 1).
3. **Petit bus d'événements interne** : quand une action est faite depuis un écran (ex. un appel loggé depuis Phoning) et concerne un élément affiché dans un autre écran resté ouvert (ex. le Kanban du Tracker), un événement interne notifie cet autre écran pour qu'il se mette à jour localement sans recharger — ça permet au Kanban de refléter en direct une action faite ailleurs dans l'app.
4. **Notifications secondaires non bloquantes** : certaines écritures annexes (historisation, notifications) sont envoyées "au mieux" et n'empêchent jamais l'action principale de réussir si elles échouent.
5. **Rafraîchissement périodique global** : le centre de notifications interroge le serveur toutes les 60 secondes pour détecter de nouveaux événements, indépendamment des actions de l'utilisateur.

## 5. Assistance IA — flux technique

- Les fonctionnalités IA (texte et voix) passent par une fonction serveur unique côté Supabase, jamais par un appel direct depuis le navigateur vers un fournisseur d'IA externe.
- Les clés des services d'IA sont stockées et utilisées **côté serveur uniquement** — aucune clé n'est présente dans le code exécuté par le navigateur.
- L'audio enregistré pour la transcription vocale n'est jamais conservé côté serveur (traitement en mémoire uniquement).

## 6. Éléments exclus de cet export par précaution

Pour respecter la confidentialité, les éléments suivants (présents dans le code source mais non nécessaires à un audit UX/UI) n'ont **pas** été recopiés dans cette documentation :
- Identifiants et clé publique de connexion au backend (présents en dur dans `js/api.js`).
- Identifiant du classeur Google historique (présent dans les fichiers legacy Google Sheets/Apps Script).
- Toute donnée de contact réelle (téléphone, email) qui pourrait apparaître dans des exemples de code.

Aucune clé secrète de fournisseur IA n'a été trouvée en dur dans le code — elles sont gérées côté serveur, ce qui est une bonne pratique déjà en place.
