# Architecture de l'application — routes, rôles, navigation

Source : `js/router.js`, `js/permissions.js`, `js/session.js`, `index.html`. Routeur **hash-based** (`#/...`), sans framework, pas de pile de navigation propre à l'app (le "retour arrière" s'appuie sur `window.history.back()`, avec repli sur `#/dashboard`).

Garde d'accès à deux niveaux sur chaque route protégée :
1. **Authentification** : `Session.estConnecte()` (token + expiration 8h, stocké en local) — sinon redirection vers `#/login`.
2. **Autorisation (RBAC)** : `Permissions.routeAutorisee(role, hash)` — sinon redirection vers la première route autorisée pour ce rôle.

Transitions d'écran : View Transitions API si supportée par le navigateur et si l'utilisateur n'a pas activé "réduire les animations" ; sinon changement direct sans animation.

---

## 1. Table des routes réelles

| Route (hash) | Vue rendue | Rôles autorisés | Remarque |
|---|---|---|---|
| `#/login` | Connexion | Public | Email + mot de passe, reset de mot de passe intégré |
| `#/dashboard` | Accueil (vue différente selon le rôle) | ADMIN, CDS, CHANNEL_MANAGER | CDS/ADMIN → dashboard terrain classique ; CHANNEL_MANAGER → home dédiée en lecture seule |
| `#/reporting-cds` | Accueil, mode "analyse" | ADMIN, CDS | Comparatif CA réalisé/objectif par trimestre |
| `#/empower-tracker` | Tracker (pipeline de leads) | ADMIN, CDS, CHANNEL_MANAGER, EXTERNE | Seule route accessible au rôle EXTERNE |
| `#/comptes` | Comptes actifs | ADMIN, CDS | Lecture seule pour CHANNEL_MANAGER si elle y accède via un lien direct |
| `#/compte/:id` | Fiche compte | ADMIN, CDS | Détail + édition + historique |
| `#/comptes-historiques` | Historique CA (FY25/FY26/FY27) | ADMIN, CDS | Croisement avec l'historique Sell-In |
| `#/phoning`, `#/phoning/:id` | Phoning (appels sortants) | ADMIN, CDS, CHANNEL_MANAGER | CHANNEL_MANAGER atterrit directement en mode "Journal" (lecture) |
| `#/visites`, `#/visites/planning`, `#/visites/cr/:id` | Visites terrain | ADMIN, CDS | Sous-vues (planning / compte-rendu) gérées par un seul fichier, pas des routes séparées |
| `#/visites-fdv` | Visites — vue consolidée équipe | CHANNEL_MANAGER | Lecture seule stricte (aucune fonction d'écriture) |
| `#/questionnaire`, `#/questionnaire/:id` | Questionnaire de visite (compte-rendu) | ADMIN, CDS | Formulaire multi-étapes |
| `#/objectifs` | Objectifs | ADMIN, CDS, CHANNEL_MANAGER | Saisie des objectifs réservée à ADMIN/CHANNEL_MANAGER |
| `#/primes` | Primes | ADMIN, CDS | Calcul des primes trimestrielles |
| `#/photos` | Mes photos | ADMIN, CDS, CHANNEL_MANAGER | Galerie des photos prises en visite |
| `#/manager` | Vue équipe (dite "COPIL") | ADMIN, CHANNEL_MANAGER | Funnel pipeline, CA par commercial, export PDF |
| `#/admin` | Administration | ADMIN, CHANNEL_MANAGER | Back-office : utilisateurs, intégrations IA, synchro, exports, RGPD, journal |
| `#/pipeline` | — | — | Redirection silencieuse vers `#/empower-tracker` (ancienne URL) |
| `#/reactiver` | — | — | Redirection silencieuse vers `#/comptes-historiques` (ancienne URL) |
| route inconnue | — | — | Redirection vers `#/login` |

### Matrice de permissions (par rôle, sections accessibles)

- **ADMIN** : Accueil, Tracker, Historique, Phoning, Visites, Objectifs, Primes, Comptes, Vue équipe, Admin, Questionnaire, Reporting, Photos *(tout)*
- **CDS** : Accueil, Tracker, Historique, Phoning, Visites, Objectifs, Primes, Questionnaire, Comptes, Photos, Reporting personnel
- **CHANNEL_MANAGER** : Accueil, Tracker, Comptes (lecture), Objectifs, Photos, Admin (section restreinte), Visites-FDV (lecture), Phoning (lecture/journal), Reporting équipe
- **EXTERNE** : Tracker uniquement (saisie de leads)

---

## 2. Arborescence de navigation (telle qu'exposée à l'utilisateur)

```text
Accueil (#/dashboard)
├── Mon activité (KPI CA / visites / appels, camemberts)
├── Alertes actives (sans contact +45j, relances)
├── Actions prioritaires / raccourcis
└── [Onglets fusionnés "Accueil" — voir note FusionTabs] Reporting personnel

Tracker — Empower Tracker (#/empower-tracker)
├── Vue Kanban (pipeline de leads, 6 statuts)
├── Vue Tableau (tri, pagination, sélection multiple — desktop uniquement)
├── Filtres (commercial, potentiel, statut, alerte, origine, canal)
├── Fiche lead (panneau détail docké desktop / plein écran mobile)
│   ├── Avancer le statut (boutons, pas de glisser-déposer)
│   ├── Attribuer à un commercial
│   ├── Créer le compte correspondant
│   └── Archiver (avec motif)
└── Export Excel / CSV

Comptes (#/comptes, #/compte/:id, #/comptes-historiques)
├── Comptes actifs (liste + recherche + filtres + tri)
├── Fiche compte
│   ├── Coordonnées (édition)
│   ├── Attribution du commercial (réservé Manager/Channel)
│   ├── Activation/désactivation Empower
│   ├── Historique visites/appels
│   └── Suppression (soft delete, historique conservé)
└── Historique CA (FY25 / FY26 / FY27, jointure avec données Sell-In)

Phoning (#/phoning, #/phoning/:id)
├── Base (liste des comptes à appeler)
├── Planning (appels planifiés)
├── Appel en cours (préparation → appel avec IA assistée → post-appel/qualification)
└── Journal (historique des appels — seul mode visible pour Responsable Channel)

Visites (#/visites, #/visites/planning, #/visites/cr/:id)
├── Planning (jour/semaine, groupé par commercial pour Manager/Channel)
├── Démarrer une visite / Compte-rendu (→ Questionnaire)
├── Édition / duplication / planifier un suivi
└── Visites FDV (#/visites-fdv) — vue consolidée équipe, lecture seule (Channel)

Questionnaire (#/questionnaire/:id) — formulaire de visite en 9 étapes
Identification → Profil revendeur → Objectifs visite → Checklist terrain →
Freins identifiés → Concurrents → Grossistes → Résultat & suite → Validation

Performance [regroupement UX — voir FusionTabs]
├── Objectifs (#/objectifs) — CA / NSB / Onboarding Empower, par trimestre
└── Primes (#/primes) — calcul trimestriel selon plan d'incentive

Mon Planning [regroupement UX — voir FusionTabs]
├── Photos (#/photos)
└── Visites FDV (#/visites-fdv, Channel)

Vue équipe / "COPIL" (#/manager) — ADMIN + CHANNEL_MANAGER
├── Funnel pipeline
├── CA par commercial (source Sell-In vs saisie manuelle)
├── Taux d'intégration
├── Alertes "sans contact"
└── Export PDF (impression navigateur, titré "COPIL ESI")

Administration (#/admin) — ADMIN + CHANNEL_MANAGER (sections différentes)
├── Objectifs (config)
├── Utilisateurs (CRUD, réservé ADMIN)
├── Intégrations IA (clés Groq/Gemini, réservé ADMIN)
├── Synchronisation (import/synchro données Sell-In)
├── Exports
├── RGPD (matrice de permissions, purge de données)
├── Journal d'audit
├── Maintenance (vidage cache)
└── Espace Channel dédié : Exports / Leads / Suivi (Responsable Channel)
```

---

## 3. Vues mentionnées dans une ancienne spécification, statut réel dans le code

| Vue recherchée | Statut réel |
|---|---|
| **COPIL** | N'est PAS une route/vue séparée. C'est le nom donné au contenu de la "Vue équipe" (`#/manager`) exporté en PDF via impression navigateur. |
| **Flavie** | N'est PAS un rôle ni une vue. C'était historiquement une personne associée au rôle aujourd'hui porté par le "Responsable Channel" (CHANNEL_MANAGER) ; son nom ne subsiste que dans des valeurs de données legacy (sources d'import filtrées). |
| **Tutoriel** | Absent du code. Aucune route, aucun composant d'onboarding/walkthrough. |
| **Profil** | Absent en tant que page dédiée "Mon profil". Le rôle de l'utilisateur connecté est affiché en pied de sidebar ; le changement de mot de passe se fait via le flux de connexion/reset. |
| **Équipe** | Présent comme libellé d'onglet uniquement (pointe vers `#/manager`), pas de route ni de fichier séparé. |
| **Planning** | Présent comme regroupement UX d'onglets ("Planning" → Visites, Photos, Visites FDV), pas de vue autonome. |
| **Alertes** | Pas de vue/route dédiée. Existe comme concept transverse : cartes "alertes actives" dans le dashboard + alertes automatiques dans le Tracker + centre de notifications (cloche). |

> Note UX : le code regroupe déjà certains onglets via un mécanisme appelé `FusionTabs` (ex. Objectifs + Primes → "Performance" ; Photos + Visites FDV → "Mon Planning"). C'est une consolidation de navigation déjà entamée côté code — à prendre en compte pour ne pas revenir en arrière dans la refonte, sauf si l'audit UX identifie que ce regroupement est lui-même à revoir.

---

## 4. Rôles système et démarrage de session

- Connexion par email + mot de passe (plus de PIN seul historiquement, le PIN reste un identifiant métier interne de filtrage).
- Session persistée 8h.
- Au démarrage (`js/app.js`) : initialisation de la couche de données (cache + réseau) → restauration de session → initialisation du routeur → enregistrement du Service Worker → si connecté, démarrage des services de session (centre de notifications, polling toutes les 60s pour les nouvelles notifications).
- Écran de démarrage (splash) : logo Norton animé + "EMPOWER SALES INTELLIGENCE — Outil de pilotage terrain" + logo partenaire.
