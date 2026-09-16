# ESI — Empower Sales Intelligence
## Introduction pour Claude Design

Ce dossier est un export d'audit technique et fonctionnel de l'application **ESI (Empower Sales Intelligence)**, préparé pour toi (Claude Design), afin que tu puisses **auditer l'UX/UI, comprendre les flux métier et produire une maquette de refonte** — sans avoir besoin d'accéder au code source ni de modifier l'application en production.

Toutes les informations ci-dessous proviennent d'un **audit du code réel** (pas de spécifications théoriques). Quand une fonctionnalité décrite dans une ancienne documentation n'existe pas réellement dans le code, c'est signalé explicitement — voir la section 4 ci-dessous, c'est important.

---

## 1. Qu'est-ce que ESI ?

- **Nom complet** : ESI — Empower Sales Intelligence (nom historique de code : *PhoneOS*, encore visible dans certains commentaires/fichiers).
- **Type d'application** : CRM commercial terrain, en **Progressive Web App** (SPA HTML/CSS/JS "vanilla", sans framework front-end — pas de React/Vue/Angular, pas de bundler).
- **Objectif métier** : piloter la prospection et le développement commercial de revendeurs IT dans le cadre du programme **Norton Empower** — gestion des comptes revendeurs, qualification et suivi de leads (pipeline), appels sortants (phoning), visites terrain, objectifs commerciaux, primes, alertes et notifications.
- **Éditeur / contexte** : outil interne développé pour une force de vente externalisée (prestataire Norton), marque déposée "Marvesting" visible sur l'écran de démarrage.

---

## 2. Utilisateurs et rôles réels

Le code définit **exactement 4 rôles système** (valeur du champ `role`, table `utilisateurs`) :

| Rôle (valeur code) | Profil type | Ce qu'il voit / peut faire |
|---|---|---|
| `CDS` | **Chef de Secteur** (commercial terrain) | Ses propres comptes, prospects, visites, appels, objectifs, primes. Accès terrain complet (phoning, visites, questionnaire, tracker). |
| `ADMIN` | **Manager commercial** | Voit tout (tous les commerciaux), administration complète (utilisateurs, intégrations IA, synchronisation des données, exports, RGPD), validation des primes. |
| `CHANNEL_MANAGER` | **Responsable Channel / Fournisseur de leads** | Vue consolidée équipe en lecture quasi-seule sur les comptes, apporteur de leads (saisie tracker), accès à l'administration (exports/leads) mais pas aux clés API ni à la gestion des utilisateurs. Ne fait pas de prospection terrain elle-même. |
| `EXTERNE` | **Apporteur d'affaires externe** | Accès très restreint : uniquement le Tracker (saisie de leads). |

> ⚠️ Anonymisation : les prénoms réels des commerciaux (codés en dur à certains endroits du code, ex. listes d'attribution) ont été remplacés dans cette documentation par des libellés génériques (**Commercial A/B/C**, **Manager**, **Responsable Channel**). La structure des rôles, elle, est fidèle au code.

Une "matrice de permissions" (RBAC) définit précisément, pour chaque rôle, quelles routes/sections sont accessibles — voir `01_ARCHITECTURE_APPLICATION.md`.

---

## 3. Contraintes de terrain à respecter dans la refonte

- **Deux surfaces d'usage** : web desktop (poste manager/admin) et web app mobile (terrain, PWA "Ajouter à l'écran d'accueil"). Le code applique un seul breakpoint pivot principal à **900px** (mobile = bottom-nav + cartes, desktop = sidebar fixe + tableaux).
- **Usage rapide par des commerciaux terrain** : connexion par identifiants (email/mot de passe, session persistée 8h), saisie d'appel/visite pensée pour un minimum d'étapes (workflow phoning en 3 phases : préparation → appel → post-appel ; visite en formulaire multi-étapes avec brouillon auto-sauvegardé pour survivre à une prise de photo en cours de saisie).
- **Réseau terrain parfois instable — mode offline RÉELLEMENT implémenté** (pas un vœu pieu) :
  - Un **Service Worker** met en cache l'app (stratégie "network-first" pour le code, pour toujours servir la dernière version en ligne ; "cache-first" pour les images/fonts).
  - Une **couche de cache + file d'attente IndexedDB** (dans `js/api.js`) sert les dernières données lues si hors-ligne (cache 30 minutes), et **met en file d'attente les écritures** (nouveau lead, appel loggé, CA déclaré, etc.) si le réseau est coupé — elles sont rejouées automatiquement au retour du réseau, avec un toast de confirmation. Aucune saisie n'est perdue en théorie.
  - Un indicateur visuel de statut de synchronisation existe déjà dans le design system (`.sync-indicator` : en ligne / en attente / synchro en cours / erreur / hors-ligne) — à conserver ou réinterpréter dans la refonte, c'est un besoin métier réel, pas cosmétique.

---

## 4. ⚠️ Point d'attention majeur : ne pas se fier à CLAUDE.md pour l'architecture technique

Le dépôt contient un fichier `CLAUDE.md` qui décrit une architecture **Google Sheets + Google Apps Script**. **Cette architecture est obsolète et n'est plus utilisée en production.**

Constat vérifié dans le code :
- Le connecteur `js/phoneos-sheets.js` et le backend `backend/Code.gs` (Apps Script) existent toujours dans le dépôt mais **ne sont pas chargés par l'application** (absents de `index.html`), et leur URL de déploiement n'a jamais été configurée (placeholder non rempli).
- L'application réelle utilise **Supabase** (PostgreSQL + Edge Functions + Storage) comme backend, via `js/api.js`. Un objet global `SheetsAPI` existe toujours dans ce fichier (nom historique conservé), mais il ne parle plus du tout à Google Sheets — il expose des méthodes (`lire`, `ecrire`, `mettreAJour`, `lireCDS`, `lireDashboard`, `mettreAJourCA`, `uploadPhoto`, `login`...) qui interrogent des tables Postgres.
- De même, l'élément `#save-toast` et la fonction `syncCallToSheet()` documentés dans CLAUDE.md n'existent que dans le code legacy non exécuté — le vrai mécanisme de feedback utilisateur est `Toast.afficher()` (`js/toast.js`), utilisé partout dans l'app réelle.

**Pour ton audit UX/UI, ignore CLAUDE.md concernant l'architecture de données** et réfère-toi aux documents de ce dossier (notamment `05_FLUX_DE_DONNEES.md`), qui décrivent le fonctionnement réel constaté dans le code.

---

## 5. Règle de design pour la refonte

Expérience **CRM premium** : très lisible, sobre, professionnelle — **à l'opposé d'une esthétique "générée par IA" ou "template SaaS générique"**. L'app s'adresse à des commerciaux terrain pressés (pas de fioritures qui ralentissent la lecture) et à des managers qui pilotent la performance (données denses mais hiérarchisées).

Constat utile pour la refonte : le code actuel superpose **deux design systems en cascade CSS** (un système "chaud" avec ombres/radius généreux, recouvert en dernier par une couche de surcharge "V7" plus sobre à filets fins, sans ombre). Le rendu visuel actuel est donc un hybride non unifié — détail dans `03_STYLES_DESIGN_TOKENS.md`. C'est une des raisons de cet audit : produire une base visuelle cohérente.

---

## 6. Sommaire du dossier

| Fichier | Contenu |
|---|---|
| `00_README_CLAUDE_DESIGN.md` | Ce document — vue d'ensemble |
| `01_ARCHITECTURE_APPLICATION.md` | Routes, rôles, arborescence de navigation, vues absentes/fusionnées |
| `02_COMPOSANTS_UI.md` | Inventaire des composants UI partagés, système Kanban, modales, tableaux, exports |
| `03_STYLES_DESIGN_TOKENS.md` | Design tokens, fichiers CSS, responsive, absence de dark mode |
| `04_FONCTIONS_METIER.md` | Fonctions métier par domaine (comptes, tracker, phoning, visites, objectifs, primes, IA, admin) |
| `05_FLUX_DE_DONNEES.md` | Architecture de données réelle (Supabase), mode offline, synchronisation, re-render |
| `06_DONNEES_EXEMPLE_ANONYMISEES.md` | Exemples de données et d'énumérations métier (statuts, rôles, KPI) — anonymisés, à usage de maquettage |

---

## 7. Ce qui n'a volontairement pas été inclus dans cet export

Conformément à la consigne de confidentialité :
- Aucune clé API, token, URL de service authentifiée, ou identifiant de connexion.
- Aucune donnée personnelle réelle (téléphone, email, notes de comptes réels).
- Aucun export commercial brut.
- Les prénoms réels de commerciaux visibles dans le code (utilisés comme identifiants de démonstration/configuration) ont été anonymisés dans cette documentation.

Si tu as besoin d'un détail technique plus précis pour une zone spécifique de l'UI, demande — un nouvel audit ciblé peut être fait sans exposer de données sensibles.
