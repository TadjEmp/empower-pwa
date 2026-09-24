# Fonctions métier par domaine

Détail des fonctionnalités réelles, vue par vue, pour comprendre ce que chaque écran doit permettre de faire dans la refonte.

---

## Comptes revendeurs (`vue-comptes.js`, `vue-fiche-compte.js`, `vue-comptes-historiques.js`)

- **Liste des comptes actifs** assignés au commercial connecté (ou tous les comptes pour Manager/Channel) : recherche, filtres (statut, canal Empower/grossiste, commercial, trimestre), tri, statut calculé automatiquement (actif / à réactiver / silencieux) avec niveau de priorité (rouge/orange/vert).
- **Fiche compte** : coordonnées éditables, historique des visites/appels, attribution du commercial (réservée Manager/Channel), activation/désactivation du statut "Empower", suppression douce (soft delete, historique conservé, pas de perte de données).
- **Historique CA** : CA réalisé FY25/FY26 + trimestre courant FY27, croisé avec une base historique de vente (Sell-In), filtrable par statut (à réactiver / perdu / inactif / actif).
- Vue en lecture seule pour le rôle Responsable Channel.

## Tracker — pipeline de qualification de leads (`vue-pipeline.js`)

- Workflow de qualification : **Saisie → Assigné → En cours → Compte créé → Intégré / Archivé**.
- Saisie d'un nouveau lead (tous rôles, y compris Externe), attribution à un commercial (Manager/Channel uniquement), changement de statut, archivage avec motif obligatoire.
- **Création automatique d'un compte** à partir d'un lead qualifié (transition "Compte créé").
- Déclaration de commande, marquage "Welcome Pack envoyé".
- Alertes automatiques : lead sans activité depuis un certain délai, sans contact depuis 45 jours.
- Export Excel / CSV du pipeline.

## Phoning — appels sortants (`vue-phoning.js`)

- Workflow en 3 phases : **préparation de l'appel → appel en cours → post-appel (qualification)**.
- Base d'appel = comptes existants uniquement (jamais de prospects bruts non qualifiés).
- **Assistance IA pendant l'appel** :
  - Génération d'un script d'accroche personnalisé avant l'appel.
  - Enregistrement vocal (30s max), transcription automatique, puis qualification automatique de l'appel par IA (type d'appel, résumé, frein identifié, concurrent cité, produit évoqué, score d'intérêt, action recommandée, date de relance, signaux d'alerte).
- Possibilité de créer un lead au Tracker directement depuis un appel.
- Planning des appels (créer / modifier / supprimer un appel planifié, lancer un appel planifié).
- Journal des appels (historique) — seul mode accessible au rôle Responsable Channel.
- Export du journal d'appels.

## Visites terrain (`vue-visites.js`, `vue-visites-fdv.js`, `vue-questionnaire.js`)

- Planification de visite (date, compte), démarrage de visite, **compte-rendu structuré en 9 étapes** (identification, profil du revendeur, objectifs de la visite, checklist terrain, freins identifiés — avec argumentaires pré-écrits pour 7 freins courants, concurrents cités, grossistes cités, résultat et suite à donner, validation).
- Détection automatique du statut "manquée" si une visite planifiée est passée sans compte-rendu.
- Prise de photo intégrée (avec brouillon auto-sauvegardé pour ne pas perdre la saisie si l'appareil est mis en arrière-plan pendant la photo), géolocalisation, dictée vocale pour les notes.
- **Alerte automatique** au(x) Responsable(s) Channel si un intérêt "Empower" est détecté pendant la visite (création possible d'un lead directement depuis le compte-rendu).
- Suppression douce, duplication de visite, planification d'un suivi (visite ou appel).
- **Vue consolidée "Visites FDV"** (Responsable Channel) : lecture seule sur les visites de toute la force de vente, groupées par commercial, avec le détail complet de chaque visite.
- Export CSV réservé aux profils Direction/Admin.

## Objectifs (`vue-objectifs.js`)

- Suivi du CA réalisé vs objectif, par commercial et par trimestre fiscal, sur **3 axes** : CA, ventes NSB (produits spécifiques), intégration de comptes Empower.
- Saisie/révision des objectifs réservée à Manager/Channel.
- Déclaration de CA réalisé par trimestre.
- Vue Manager avec détail par commercial + vue "radar" de synthèse.

## Primes (`vue-primes.js`)

- Calcul trimestriel des primes selon un plan d'incentive à 3 axes (CA vs objectif, NSB, comptes Empower intégrés) + bonus manager, avec un plafond par trimestre.
- Paliers configurables par commercial (seuils personnalisés).
- Déclaration d'onboarding (intégration Empower), en attente de validation Manager.
- Règle UX explicite dans le code : **aucun identifiant interne (PIN) n'est affiché** dans cette vue — seulement les noms.

## Dashboards (`dashboard-activite.js` module partagé, `vue-dashboard-cds.js`, `vue-dashboard-manager.js`)

- **Dashboard commercial (CDS)** : KPI d'activité (CA, visites, appels), camemberts de répartition, top comptes, base de prospects, alertes, raccourcis vers Objectifs/Primes/Historique.
- **Mode Reporting** (même vue, filtre différent) : comparatif CA réalisé/objectif trimestre par trimestre.
- **Dashboard Manager / "Vue équipe" ("COPIL")** : funnel pipeline consolidé, CA par commercial (avec distinction source automatique "Sell-In" vs saisie manuelle), taux d'intégration Empower, alertes transverses. **Export PDF** de cette vue via impression navigateur, formaté comme un document de comité de pilotage.
- **Home dédiée Responsable Channel** : lecture seule, focalisée sur l'onboarding, sans donnée commerciale brute.

## Alertes et notifications (`notif-center.js` + logique transverse)

- Pas de vue dédiée : les alertes vivent dans les dashboards (cartes) et dans le Tracker (règles automatiques : sans activité, sans contact 45 jours).
- **Centre de notifications** (composant global, cloche) : liste des notifications non lues de l'utilisateur connecté, avec navigation contextuelle au clic (vers la fiche compte ou le Tracker selon le type d'événement) et marquage automatique comme lue.
- Types de notification observés : nouveau lead, lead assigné, changement de statut, statut archivé/en cours/intégré, compte créé, visite réalisée, conversion d'un prospect froid, score de qualification IA disponible.

## Administration (`vue-admin.js`)

- **Utilisateurs** : création, changement de rôle, activation/désactivation, réinitialisation de mot de passe (réservé ADMIN).
- **Intégrations IA** : configuration et test des clés d'API des assistants IA (réservé ADMIN — les clés elles-mêmes sont stockées et utilisées côté serveur, jamais exposées au navigateur).
- **Synchronisation** : import et synchronisation de la base Sell-In (fichier externe de ventes).
- **Exports** : exports de données multi-thématiques (CSV).
- **RGPD** : consultation de la matrice de permissions, purge de données par commercial.
- **Journal d'audit** : historique des actions.
- **Maintenance** : vidage du cache applicatif.
- **Détection de doublons** et **audit de qualité des données** (comptes/leads en double ou incomplets).
- **Espace dédié Responsable Channel** : exports, gestion de ses leads, suivi — sans accès aux sections utilisateurs/clés API.

## Assistance IA transverse (`gemini.js`, `groq.js`)

Deux assistants IA, appelés via un proxy serveur (aucune clé API dans le navigateur) :

- **Analyse et rédaction** (texte) : profil synthétique d'un prospect, préparation de plan de visite (objectifs, points clés, réponses aux objections), rédaction d'email de prospection, structuration d'un compte-rendu à partir de notes brutes, synthèse hebdomadaire d'équipe pour le Manager, enrichissement automatique d'un lead à la saisie (type de revendeur, canal, potentiel), détection de doublon avant création d'un lead.
- **Voix et qualification d'appel** : transcription automatique de l'enregistrement d'un appel (l'audio n'est jamais stocké côté serveur), qualification automatique de l'appel (type, résumé, score, action recommandée, alertes), génération de script d'accroche téléphonique.

Ces fonctionnalités IA sont intégrées **dans le flux naturel** de Phoning, Questionnaire, Tracker et Dashboard Manager — pas dans un module "assistant" séparé.
