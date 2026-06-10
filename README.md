# EMPOWER PWA — Stack Frontend v4.1
## Structure des fichiers

```
empower-pwa/
├── index.html          → Point d'entrée SPA
├── manifest.json       → Config PWA installable
├── sw.js               → Service Worker (offline)
├── css/
│   ├── base.css        → Variables, reset, splash, login
│   ├── components.css  → Badges, filtres, FAB, graphique CA
│   ├── comptes.css     → Vue liste comptes + fiche compte
│   ├── questionnaire.css → Questionnaire terrain 6 étapes
│   └── reactiver.css   → Vue comptes à réactiver
└── js/
    ├── utils.js          → genId, normaliserNom, formatEuro, getISOWeek…
    ├── session.js        → Gestion session PIN (localStorage 8h)
    ├── api.js            → Couche API : cache IDB, retry ×3, queue offline
    ├── toast.js          → Notifications toast
    ├── router.js         → Routeur hash-based
    ├── app.js            → Boot + SW registration
    ├── vue-login.js      → Écran connexion PIN
    ├── vue-comptes.js    → Liste Mes Comptes (filtrée par PIN CDS)
    ├── vue-fiche-compte.js → Fiche compte + modal appel
    ├── vue-questionnaire.js → Questionnaire visite 6 étapes
    └── vue-reactiver.js  → Comptes dormants à réactiver
```

## 🔧 Configuration requise

### 1. API Google Apps Script
Dans `js/api.js`, remplacer :
```js
BASE_URL: 'https://script.google.com/macros/s/REMPLACER_PAR_TON_DEPLOYMENT_ID/exec'
```

### 2. Routes disponibles
| Hash | Vue | Auth |
|------|-----|------|
| `#/login` | VueLogin | Non |
| `#/comptes` | VueComptes | Oui |
| `#/compte/:id` | VueFicheCompte | Oui |
| `#/questionnaire` | VueQuestionnaire | Oui |
| `#/questionnaire/:id` | VueQuestionnaire (pré-rempli) | Oui |
| `#/reactiver` | VueReactiver | Oui |

### 3. PINs configurés (PARAMS MDB)
| PIN | Nom | Rôle |
|-----|-----|------|
| 4001 | Mehdi | CDS |
| 4002 | Lyes | CDS |
| 4003 | Johanne | CDS |
| 1000 | Tadjidine | Manager (voit tout) |
| 3000 | Flavie | Admin/Phoning |

### 4. Jointure V17 ↔ EMPOWER MDB
La jointure se fait par `normaliserNom()` (UPPER + trim + espaces).
Clé V17 : colonne `RESELLER`
Clé MDB  : colonne `NomCompte`

### 5. Déploiement
```bash
# Héberger les fichiers sur n'importe quel serveur statique
# Ex : Netlify Drop, GitHub Pages, ou dossier Google Drive (lien public)
```

## 📱 Installation PWA
Ouvrir dans Chrome mobile → "Ajouter à l'écran d'accueil"
L'app fonctionne hors-ligne grâce au Service Worker + cache IndexedDB.

---
Généré par Perplexity · EMPOWER v4.1 FY27 · Marvesting
