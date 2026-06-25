# CLAUDE.md — PhoneOS × Google Sheets
## Instructions maître pour Claude Code

> Ce fichier est le **point d'entrée unique** pour tout ce qui concerne l'intégration Google Sheets dans l'app PhoneOS (repo `TadjEmp/empower-pwa`).
> Claude Code doit lire ce fichier en premier et s'y référer pour toute tâche liée aux comptes, leads, CA, et profils commerciaux.

---

## 1. SOURCE DE VÉRITÉ — Google Sheet

```
URL    : https://docs.google.com/spreadsheets/d/16wtW_0hV3zFAYPTZfwyJ1_5dFPJsuNgLDrcqt-OG-4A/edit
ID     : 16wtW_0hV3zFAYPTZfwyJ1_5dFPJsuNgLDrcqt-OG-4A
Onglets: FY25 | FY26 | FY27
Rôle   : Base de données principale des comptes revendeurs, attributions commerciales, CA FY25/26/27
```

**Règle absolue :** Toute donnée de compte, lead, commercial ou CA doit être lue ET écrite dans ce Sheet. Jamais de données hardcodées.

---

## 2. ARCHITECTURE DE L'INTÉGRATION

```
┌─────────────────────────────────────────────────────────┐
│              Google Sheet (source de vérité)            │
│  FY25 | FY26 | FY27 — colonnes dynamiques en en-têtes  │
└──────────────────────┬──────────────────────────────────┘
                       │ GET (lecture) / POST (écriture)
                       ▼
┌─────────────────────────────────────────────────────────┐
│         backend/Code.gs (Google Apps Script)            │
│  Web App déployée — URL stockée dans phoneos-sheets.js  │
│  doGet()  → getLeads / getKPIs / getCommercials         │
│  doPost() → updateLead / addLead / logCall / declareCA  │
└──────────────────────┬──────────────────────────────────┘
                       │ fetch() JSON
                       ▼
┌─────────────────────────────────────────────────────────┐
│         js/phoneos-sheets.js (connecteur client)        │
│  SheetsAPI.getLeads()   → charge les comptes            │
│  SheetsAPI.addLead()    → écrit une nouvelle ligne      │
│  SheetsAPI.declareCA()  → met à jour une colonne CA     │
│  SheetsAPI.logCall()    → sync fin d'appel              │
│  initDashboardKPIs()    → alimente les KPI cards        │
│  openDeclareCaModal()   → modal déclaration CA          │
│  openAddLeadModal()     → modal ajout lead              │
│  syncCallToSheet()      → hook fin d'appel phoning      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│     Vues PhoneOS (js/vue-*.js + index.html)             │
│  vue-comptes.js         → liste des comptes depuis Sheet│
│  vue-fiche-compte.js    → fiche detail + bouton CA      │
│  vue-phoning.js         → sync call → Sheet             │
│  vue-dashboard-cds.js   → KPIs depuis Sheet             │
│  vue-dashboard-manager  → vue manager avec filtre comm  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. COLONNES DU SHEET (à respecter exactement)

Les en-têtes du Sheet sont les **clés exactes** utilisées dans le code JS et le Apps Script.
Ne jamais renommer une colonne sans mettre à jour les deux fichiers.

| Colonne (en-tête exact) | Type | Description |
|---|---|---|
| `Raison Sociale` | Texte | Nom du revendeur |
| `Code Client` | Texte | ID unique (ex: CLI-00142) — clé primaire |
| `Commercial` | Texte | Nom du commercial attribué (ex: JOHANNE) |
| `Distributeur` | Texte | INGRAM / TECH DATA / ARROW / DIRECT |
| `CA FY25` | Nombre | CA réalisé FY25 (€ HT) |
| `CA FY26` | Nombre | CA réalisé FY26 (€ HT) |
| `CA FY27 Q1` | Nombre | CA déclaré Q1 FY27 |
| `CA FY27 Q2` | Nombre | CA déclaré Q2 FY27 |
| `CA FY27 Q3` | Nombre | CA déclaré Q3 FY27 |
| `CA FY27 Q4` | Nombre | CA déclaré Q4 FY27 |
| `CA Déclaré` | Nombre | CA total déclaré FY27 (somme ou saisie directe) |
| `Statut Empower` | Texte | NOUVEAU / INTERESSE / A_RAPPELER / NRP / VENTE_CONCLUE / PERDU |
| `Score Empower` | Nombre | 0 à 9 |
| `Dernier Appel` | Date | JJ/MM/AAAA |
| `Durée Appel` | Texte | ex: 3m 12s |
| `Date Rappel` | Date | AAAA-MM-JJ |
| `Téléphone` | Texte | +33 X XX XX XX XX |
| `Email` | Texte | contact@enseigne.fr |
| `Notes` | Texte | Compte-rendu d'appel libre |

---

## 4. FICHIERS À MODIFIER / CRÉER

### Fichiers existants à patcher

#### `js/vue-comptes.js`
**Objectif :** Charger la liste des comptes depuis le Sheet au lieu des données mock.

```js
// AVANT (mock / localStorage)
const comptes = getLocalComptes();

// APRÈS (Sheet)
async function loadComptes() {
  const commercial = Session.get('commercial'); // nom du commercial connecté
  const fy = 'FY27';
  const data = await SheetsAPI.getLeads({ fy, commercial });
  renderComptesList(data.leads);
}
window.addEventListener('DOMContentLoaded', loadComptes);
```

#### `js/vue-fiche-compte.js`
**Objectif :** Ajouter le bouton "Déclarer CA" sur chaque fiche revendeur.

```js
// Dans renderFicheCompte(compte), ajouter dans le HTML généré :
const btnCA = `
  <button onclick="openDeclareCaModal('${compte['Code Client']}', '${compte['Raison Sociale']}', 'FY27')"
    class="btn-declare-ca">
    <span class="material-symbols-outlined">euro</span>
    Déclarer CA
  </button>`;
```

#### `js/vue-phoning.js`
**Objectif :** Synchroniser le compte-rendu d'appel vers le Sheet à la sauvegarde.

```js
// Dans saveCall() ou équivalent, après la sauvegarde locale :
async function saveCall() {
  // ... (code existant de sauvegarde locale) ...
  const codeClient = state.currentLead?.['Code Client'];
  if (codeClient) {
    await syncCallToSheet(codeClient, 'FY27');
  }
}
```

#### `js/vue-dashboard-cds.js` et `js/vue-dashboard-manager.js`
**Objectif :** Charger les KPIs depuis le Sheet au démarrage.

```js
// En haut du DOMContentLoaded de chaque dashboard :
window.addEventListener('DOMContentLoaded', async () => {
  await initDashboardKPIs(); // injecte dans les éléments kpi-ca-fy27, kpi-actifs-fy27, etc.
  // ... reste du code existant ...
});
```

#### `js/vue-dashboard-manager.js`
**Objectif :** Filtrer les leads par commercial via le Sheet.

```js
// Ajouter le sélecteur commercial dynamique :
await renderCommercialSelector('commercial-selector-container', async (commercial) => {
  const data = await SheetsAPI.getLeads({ fy: 'FY27', commercial });
  renderLeadsTable(data.leads);
});
```

### Fichier backend à déployer manuellement

#### `backend/Code.gs` → Google Apps Script
> Ce fichier NE PEUT PAS être déployé automatiquement.
> Il doit être copié-collé dans le Google Apps Script du Sheet.
> Voir la section 6 (Déploiement) pour les étapes exactes.

---

## 5. RÈGLES DE DÉVELOPPEMENT POUR CLAUDE CODE

### Lecture de données
- **Toujours** utiliser `SheetsAPI.getLeads({ fy, commercial })` pour charger les comptes
- **Jamais** hardcoder une liste de commerciaux — utiliser `SheetsAPI.getCommercials()`
- Les en-têtes du Sheet sont dynamiques — utiliser `SheetsAPI.getHeaders(fy)` si besoin de les inspecter
- Toujours prévoir un état de chargement (`loading`) et un état d'erreur (`error`) dans le rendu

### Écriture de données
- **Identifier** un compte par son `Code Client` (jamais par la Raison Sociale seule)
- `declareCA(fy, codeClient, periode, montant)` → met à jour la colonne `CA FY27 Qx` ou `CA Déclaré`
- `addLead(fy, lead)` → toujours inclure `Raison Sociale` + `Commercial` + `Statut Empower: 'NOUVEAU'`
- `logCall(fy, codeClient, callData)` → déclenché **automatiquement** à chaque fin d'appel validé

### Session commerciale
- Le nom du commercial connecté est disponible via `Session.get('commercial')` (voir `js/session.js`)
- Toutes les vues CDS (commercial) doivent filtrer automatiquement par commercial connecté
- Les vues Manager doivent afficher tous les commerciaux avec filtre optionnel

### Gestion du FY
- FY courant : **FY27** (juin 2026)
- Permettre de naviguer entre FY25 / FY26 / FY27 via un sélecteur dans les vues historiques
- Le FY est passé en paramètre à toutes les fonctions SheetsAPI

### Toast & feedback
- Toujours afficher un toast après écriture dans le Sheet (succès en vert `#2D9E6B`, erreur en rouge `#ba1a1a`)
- Utiliser l'élément `#save-toast` existant ou `js/toast.js`
- En cas d'erreur Sheets, logger en console ET afficher le message dans le toast

---

## 6. DÉPLOIEMENT APPS SCRIPT (étape manuelle obligatoire)

Ces étapes sont à faire **une seule fois** par le propriétaire du Sheet :

```
1. Ouvrir → https://docs.google.com/spreadsheets/d/16wtW_0hV3zFAYPTZfwyJ1_5dFPJsuNgLDrcqt-OG-4A
2. Menu → Extensions → Apps Script
3. Supprimer le contenu existant (function myFunction...)
4. Copier-coller intégralement le contenu de backend/Code.gs
5. Cliquer Enregistrer (Ctrl+S)
6. Cliquer Déployer → Nouveau déploiement
7. Cliquer ⚙ → Application Web
8. Remplir :
   - Description       : PhoneOS API v1
   - Exécuter en tant que : Moi
   - Accès             : Tout le monde (même anonyme)
9. Cliquer Déployer → Autoriser l'accès
10. Copier l'URL (format : https://script.google.com/macros/s/XXXXX/exec)
11. Ouvrir js/phoneos-sheets.js ligne 15
12. Remplacer la valeur de APPS_SCRIPT_URL par l'URL copiée
13. Committer le changement sur main
```

**Test de validation :**
Ouvrir dans le navigateur :
```
https://script.google.com/macros/s/XXXXX/exec?action=getKPIs
```
Doit retourner :
```json
{
  "FY25": { "ca": 0, "actifs": 0, "inactifs": 0, "total": 0 },
  "FY26": { "ca": 0, "actifs": 0, "inactifs": 0, "total": 0 },
  "FY27": { "ca": 0, "actifs": 0, "inactifs": 0, "total": 0 }
}
```

---

## 7. ÉLÉMENTS HTML ATTENDUS DANS LES VUES

Claude Code doit vérifier que ces IDs existent dans les vues correspondantes :

| ID HTML | Vue | Alimenté par |
|---|---|---|
| `#kpi-ca-fy27` | Dashboard CDS + Manager | `initDashboardKPIs()` |
| `#kpi-ca-fy26` | Dashboard Manager | `initDashboardKPIs()` |
| `#kpi-actifs-fy27` | Dashboard CDS + Manager | `initDashboardKPIs()` |
| `#kpi-inactifs-fy27` | Dashboard CDS | `initDashboardKPIs()` |
| `#kpi-total-leads` | Dashboard Manager | `initDashboardKPIs()` |
| `#commercial-selector-container` | Dashboard Manager | `renderCommercialSelector()` |
| `#save-toast` | Vue Phoning | `syncCallToSheet()` |
| `#comptes-list` | Vue Comptes | `SheetsAPI.getLeads()` |

Si un ID est manquant dans une vue, Claude Code doit l'ajouter au bon endroit dans le HTML généré par la vue.

---

## 8. FLUX UTILISATEUR COMPLET À IMPLÉMENTER

### Flux 1 — Commercial ouvre son dashboard
```
Connexion → Session.set('commercial', 'JOHANNE')
         → DOMContentLoaded
         → SheetsAPI.getLeads({ fy: 'FY27', commercial: 'JOHANNE' })
         → Rendu de la liste des comptes attribués
         → initDashboardKPIs() → affichage CA / actifs / inactifs
```

### Flux 2 — Commercial passe un appel
```
Clic sur un compte → chargement fiche compte (Code Client)
                  → appel en cours (timer, statut, notes)
                  → clic "Terminer & Enregistrer"
                  → saveCall() → sync locale
                  → syncCallToSheet(codeClient, 'FY27') → Apps Script
                  → Sheet mis à jour : Dernier Appel, Statut, Score, Notes, Date Rappel
                  → Toast : "✓ Compte-rendu synchronisé dans Google Sheets"
```

### Flux 3 — Commercial déclare un CA
```
Sur la fiche compte → clic "Déclarer CA"
                    → openDeclareCaModal(codeClient, raisonSociale, 'FY27')
                    → sélection période (Q1/Q2/Q3/Q4/Total)
                    → saisie montant €
                    → clic "Valider"
                    → SheetsAPI.declareCA('FY27', codeClient, 'Q2', 12500)
                    → Apps Script → Sheet colonne "CA FY27 Q2" = 12500
                    → Toast : "✓ CA Q2 de 12 500 € synchronisé"
```

### Flux 4 — Commercial ajoute un lead
```
Bouton "+" n'importe quelle vue → openAddLeadModal('FY27')
                                → saisie : Raison Sociale, Commercial, Distrib, Tel, Email
                                → clic "Ajouter"
                                → SheetsAPI.addLead('FY27', lead)
                                → Apps Script → Sheet : nouvelle ligne ajoutée
                                → Toast : "✓ Nom ajouté dans le Sheet FY27"
                                → Rechargement de la liste
```

### Flux 5 — Manager filtre par commercial
```
Dashboard Manager → renderCommercialSelector('commercial-selector-container', cb)
                 → dropdown alimenté depuis Sheet (liste dédupliquée colonne Commercial)
                 → sélection "JOHANNE"
                 → SheetsAPI.getLeads({ fy: 'FY27', commercial: 'JOHANNE' })
                 → re-rendu du tableau avec les comptes de JOHANNE uniquement
```

---

## 9. CHECKLIST DE VALIDATION

Avant tout commit sur main, Claude Code doit vérifier :

- [ ] `js/phoneos-sheets.js` est inclus dans `index.html` avant les autres `vue-*.js`
- [ ] `APPS_SCRIPT_URL` dans `phoneos-sheets.js` est remplacé (non vide, non placeholder)
- [ ] `vue-comptes.js` charge les leads depuis `SheetsAPI.getLeads()` et non depuis des données mock
- [ ] `vue-phoning.js` appelle `syncCallToSheet()` dans la fonction de sauvegarde d'appel
- [ ] `vue-fiche-compte.js` expose le bouton "Déclarer CA" avec le bon `codeClient`
- [ ] `vue-dashboard-cds.js` appelle `initDashboardKPIs()` au chargement
- [ ] `vue-dashboard-manager.js` appelle `renderCommercialSelector()` et `initDashboardKPIs()`
- [ ] Tous les états de chargement (skeleton / spinner) sont présents lors des appels Sheets
- [ ] Les erreurs Sheets sont affichées dans les toasts (jamais silencieuses)
- [ ] `backend/Code.gs` est à jour avec la dernière version dans le repo

---

## 10. RÉFÉRENCES FICHIERS DU REPO

```
empower-pwa/
├── CLAUDE.md                    ← ce fichier (point d'entrée)
├── SHEETS_SETUP.md              ← guide déploiement Apps Script
├── index.html                   ← app shell PWA
├── backend/
│   └── Code.gs                  ← Apps Script à coller dans Google Sheet
├── js/
│   ├── phoneos-sheets.js        ← connecteur Sheets (SheetsAPI + modals)
│   ├── session.js               ← Session.get('commercial')
│   ├── vue-comptes.js           ← liste comptes ← Sheet
│   ├── vue-fiche-compte.js      ← fiche + bouton CA
│   ├── vue-phoning.js           ← appel + sync call → Sheet
│   ├── vue-dashboard-cds.js     ← dashboard commercial ← Sheet KPIs
│   ├── vue-dashboard-manager.js ← dashboard manager ← Sheet all commercials
│   ├── vue-comptes-historiques.js ← historique FY25/FY26
│   ├── vue-pipeline.js          ← pipeline deals
│   ├── vue-objectifs.js         ← objectifs CA par commercial
│   └── api.js                   ← API locale (à coupler avec Sheets)
└── css/
    └── styles.css
```

---

## 11. NOTE FINALE POUR CLAUDE CODE

Lorsque tu travailles sur ce repo :

1. **Toujours lire ce fichier en premier** avant de modifier un fichier vue-*.js
2. **Le Sheet est la source de vérité** — ne jamais dupliquer les données en dur dans le code
3. **Les colonnes du Sheet sont les clés JS** — respecter la casse exacte (ex: `'Raison Sociale'` pas `'raison_sociale'`)
4. **Le Code Client est la clé primaire** — toujours l'utiliser pour identifier un compte (jamais l'index de ligne)
5. **Toujours tester avec `?action=getLeads&fy=FY27`** après chaque modification du Apps Script
6. **Ne jamais redéployer le Apps Script automatiquement** — uniquement via l'interface Google Apps Script (manuel)
