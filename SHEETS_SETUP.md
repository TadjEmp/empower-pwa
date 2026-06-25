# PhoneOS × Google Sheets — Guide de connexion

## Spreadsheet
- **ID** : `16wtW_0hV3zFAYPTZfwyJ1_5dFPJsuNgLDrcqt-OG-4A`
- **Onglets attendus** : `FY25`, `FY26`, `FY27`

## Colonnes attendues dans chaque onglet

| Colonne | Type | Description |
|---|---|---|
| Raison Sociale | Texte | Nom du revendeur |
| Code Client | Texte | Identifiant unique (ex: CLI-00142) |
| Commercial | Texte | Nom du commercial (ex: JOHANNE) |
| Distributeur | Texte | INGRAM / TECH DATA / ARROW / DIRECT |
| CA FY25 | Nombre | CA réalisé FY25 |
| CA FY26 | Nombre | CA réalisé FY26 |
| CA FY27 Q1 | Nombre | CA déclaré Q1 FY27 |
| CA FY27 Q2 | Nombre | CA déclaré Q2 FY27 |
| CA FY27 Q3 | Nombre | CA déclaré Q3 FY27 |
| CA FY27 Q4 | Nombre | CA déclaré Q4 FY27 |
| CA Déclaré | Nombre | CA total déclaré FY27 |
| Statut Empower | Texte | NOUVEAU / INTERESSE / A_RAPPELER / NRP / VENTE_CONCLUE |
| Score Empower | Nombre | 0 à 9 |
| Dernier Appel | Date | JJ/MM/AAAA |
| Durée Appel | Texte | ex: 3m 12s |
| Date Rappel | Date | AAAA-MM-JJ |
| Téléphone | Texte | +33 X XX XX XX XX |
| Email | Texte | contact@enseigne.fr |
| Notes | Texte | Notes d'appel libres |

## Déploiement Apps Script (5 minutes)

### Étape 1 — Ouvrir Apps Script
1. Ouvrir le Google Sheet
2. **Extensions → Apps Script**
3. Supprimer le contenu par défaut
4. Coller le contenu de `backend/Code.gs`
5. **Enregistrer** (Ctrl+S)

### Étape 2 — Déployer
1. **Déployer → Nouveau déploiement**
2. Cliquer sur l'icône ⚙ → **Application Web**
3. Description : `PhoneOS API v1`
4. Exécuter en tant que : **Moi**
5. Accès : **Tout le monde (même anonyme)**
6. Cliquer **Déployer**
7. **Copier l'URL** (format : `https://script.google.com/macros/s/XXX.../exec`)

### Étape 3 — Brancher l'URL dans PhoneOS
Ouvrir `js/phoneos-sheets.js`, ligne 15 :
```js
const APPS_SCRIPT_URL = 'COLLER_ICI_URL_APPS_SCRIPT_APRES_DEPLOIEMENT';
```
Remplacer par votre URL de déploiement.

### Étape 4 — Tester la connexion
Ouvrir dans le navigateur :
```
https://script.google.com/macros/s/XXX.../exec?action=getKPIs
```
Doit retourner un JSON avec FY25, FY26, FY27.

## Intégration dans les vues HTML

### Ajouter le script dans chaque vue
```html
<script src="js/phoneos-sheets.js"></script>
```

### Vue Phoning — sync fin d'appel
```js
async function saveCall() {
  // ... code existant ...
  await syncCallToSheet('CODE_CLIENT_DU_LEAD', 'FY27');
}
```

### Vue Dashboard — KPIs en temps réel
```js
window.addEventListener('DOMContentLoaded', () => initDashboardKPIs());
```

### Bouton Nouveau Lead (n'importe quelle vue)
```html
<button onclick="openAddLeadModal('FY27')">+ Nouveau Lead</button>
```

### Bouton Déclarer CA sur une fiche
```html
<button onclick="openDeclareCaModal('CLI-00142', 'Micromania Grenoble', 'FY27')">
  Déclarer CA
</button>
```

## Architecture
```
Google Sheet (source de vérité)
        ↕ GET / POST JSON
Google Apps Script Web App (backend/Code.gs)
        ↕ fetch()
PhoneOS HTML (js/phoneos-sheets.js)
```
