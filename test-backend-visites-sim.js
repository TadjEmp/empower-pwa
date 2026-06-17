// ═══════════════════════════════════════
//  test-backend-visites-sim.js — Sprint 1 GAS
//  V1 : _ecrire force Statut_Visite = planifiée   (CDC T6.1)
//  V2 : _synchroniserVisite → réalisée + notifs    (CDC T6.3)
//  V3 : _lireDashboard renvoie visitesAujourdhui    (CDC T6.6)
// ═══════════════════════════════════════
// NB : pas de 'use strict' — eval direct non-strict pour que les
// déclarations `function _x()` de Code.gs fuitent dans ce scope module
// et que la réassignation `_x = mock` soit vue par les appels internes.
global.window = global;

const fs   = require('fs');
const path = require('path');

// ── Mocks GAS au chargement ──────────────────────────────────────────────────
let _setValueCalls = [];                 // {row, col, value}
const _mkRange = (row, col) => ({
  getValues: () => _mkRange._headerProvider ? [_mkRange._headerProvider()] : [[]],
  setValue: (v) => { _setValueCalls.push({ row, col, value: v }); },
});

global.ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: (t) => ({ _t: t, setMimeType: () => ({ _t: t }) }),
};
global.SpreadsheetApp = { flush: () => {} };
global.CacheService = {
  getScriptCache: () => ({ get: () => null, put: () => {} }),
};
global.Utilities = {
  formatDate: () => '2026-06-17',        // today fixe pour le test V3
};
global.PropertiesService = {
  getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
};

// ── Charger le source ────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, 'backend/Code.gs'), 'utf8');
eval(src);

// ── Override des helpers (réassignation des bindings issus de l'eval) ─────────
let _notifs = [], _majCalls = [];
_notifier = (pin, type, msg, id) => { _notifs.push({ pin, type, msg, id }); };
_log      = () => {};
// _json renvoie l'objet brut pour pouvoir l'inspecter
_json     = (d) => d;

// ── Framework assertion ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { console.log(`  ✅  ${name}`); passed++; }
  else { console.error(`  ❌  ÉCHEC : ${name}${detail ? '\n       → ' + detail : ''}`); failed++; }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  SIMULATION BACKEND VISITES — Code.gs Sprint 1');
console.log('══════════════════════════════════════════════════════\n');

// ════════════════════════════════════════════════════════════════════════════
// T-V1 : _ecrire(🗺️_VISITES) sans Statut_Visite → force 'planifiée'
// ════════════════════════════════════════════════════════════════════════════
console.log('─── V1 : _ecrire force Statut_Visite = planifiée (CDC T6.1) ───');

const HEADERS_VIS = ['ID_Visite', 'Date', 'PIN_CDS', 'Statut_Visite', 'Source_Visite'];
function mockSheetEcrire(headers) {
  const rows = [];
  return {
    getLastColumn: () => headers.length,
    getRange: (row, col, nr, nc) => {
      if (row === 1) return { getValues: () => [headers] };  // lecture entête
      return {
        setValue: (v) => { _setValueCalls.push({ row, col, value: v }); },
        getValues: () => [[]],
      };
    },
    appendRow: (r) => { rows.push(r); },
    getLastRow: () => rows.length + 1,    // +1 pour la ligne d'entête
    _rows: rows,
  };
}

// V1a — visite SANS statut → doit forcer planifiée
_setValueCalls = [];
let shVis = mockSheetEcrire(HEADERS_VIS);
_getSpreadsheet = () => ({ getSheetByName: () => shVis });

let rEcrire = _ecrire({
  fichier: 'EMPOWER_MDB', onglet: '🗺️_VISITES',
  donnee: { ID_Visite: 'VIS_A', Date: '2026-06-17', PIN_CDS: 9999 },  // pas de Statut_Visite
});

const svColIdx = HEADERS_VIS.indexOf('Statut_Visite') + 1;  // 1-based
const forced = _setValueCalls.find(c => c.col === svColIdx && c.value === 'planifiée');
ok('Visite sans statut → setValue("planifiée") sur colonne Statut_Visite',
   !!forced, `setValueCalls: ${JSON.stringify(_setValueCalls)}`);
ok('_ecrire renvoie ok:true', rEcrire?.ok === true, JSON.stringify(rEcrire));

// V1b — visite AVEC statut explicite → ne PAS écraser
_setValueCalls = [];
shVis = mockSheetEcrire(HEADERS_VIS);
_getSpreadsheet = () => ({ getSheetByName: () => shVis });
_ecrire({
  fichier: 'EMPOWER_MDB', onglet: '🗺️_VISITES',
  donnee: { ID_Visite: 'VIS_B', Statut_Visite: 'réalisée', PIN_CDS: 9999 },
});
const overwrite = _setValueCalls.find(c => c.col === svColIdx);
ok('Visite avec statut explicite → AUCUN forçage (pas d\'écrasement)',
   !overwrite, `setValueCalls: ${JSON.stringify(_setValueCalls)}`);

// V1c — autre onglet (📋_PROSPECTS) → pas de logique visite
_setValueCalls = [];
const HEADERS_PROS = ['ID_Prospect', 'NomCompte', 'STATUT_EMPOWER', 'PIN_CDS_Assigne'];
let shPros = mockSheetEcrire(HEADERS_PROS);
_getSpreadsheet = () => ({ getSheetByName: () => shPros });
_notifs = [];
_ecrire({
  fichier: 'EMPOWER_MDB', onglet: '📋_PROSPECTS',
  donnee: { ID_Prospect: 'P1', NomCompte: 'Acme' },  // pas de STATUT_EMPOWER
});
const forcedProsStatut = _setValueCalls.find(c => c.value === 'A_TRAITER');
ok('📋_PROSPECTS sans statut → STATUT_EMPOWER forcé A_TRAITER (régression OK)',
   !!forcedProsStatut, `setValueCalls: ${JSON.stringify(_setValueCalls)}`);
ok('📋_PROSPECTS → notifie managers 1000 + 5000 (régression OK)',
   _notifs.some(n => n.pin === 1000) && _notifs.some(n => n.pin === 5000),
   `notifs: ${JSON.stringify(_notifs)}`);

// ════════════════════════════════════════════════════════════════════════════
// T-V2 : _synchroniserVisite → mettreAJour réalisée + notifs managers
// ════════════════════════════════════════════════════════════════════════════
console.log('\n─── V2 : _synchroniserVisite (CDC T6.3) ───');

_majCalls = []; _notifs = [];
_mettreAJour = (args) => { _majCalls.push(args); return { ok: true }; };

let rSync = _synchroniserVisite({
  id: 'VIS_PLANIF_42', resultat: '✅ Positif', note: 'RAS', duree: 30, photoUrl: 'http://x/p.jpg',
}, { pin: 9999 });

const maj = _majCalls[0];
ok('_mettreAJour appelé sur 🗺️_VISITES', maj?.onglet === '🗺️_VISITES', JSON.stringify(maj));
ok('ID_Visite transmis (VIS_PLANIF_42)', maj?.id === 'VIS_PLANIF_42', `id: ${maj?.id}`);
ok('Statut_Visite = réalisée dans champs', maj?.champs?.Statut_Visite === 'réalisée',
   JSON.stringify(maj?.champs));
ok('Resultat_Visite transmis (colonne réelle)', maj?.champs?.Resultat_Visite === '✅ Positif',
   JSON.stringify(maj?.champs));
ok('Note_Privee transmise (colonne réelle)', maj?.champs?.Note_Privee === 'RAS');
ok('Duree_Minutes transmise (colonne réelle)', maj?.champs?.Duree_Minutes === 30);
ok('Photo_URL transmise (colonne réelle)', maj?.champs?.Photo_URL === 'http://x/p.jpg');
ok('Notifie managers 1000 + 5000 (VISITE_REALISEE)',
   _notifs.filter(n => n.type === 'VISITE_REALISEE').some(n => n.pin === 1000) &&
   _notifs.filter(n => n.type === 'VISITE_REALISEE').some(n => n.pin === 5000),
   `notifs: ${JSON.stringify(_notifs)}`);
ok('Renvoie le résultat de _mettreAJour', rSync?.ok === true, JSON.stringify(rSync));

// V2b — id manquant → erreur propre
_majCalls = [];
let rSyncErr = _synchroniserVisite({ resultat: 'x' }, { pin: 9999 });
ok('id manquant → erreur, pas d\'appel _mettreAJour',
   rSyncErr?.ok === false && _majCalls.length === 0, JSON.stringify(rSyncErr));

// ════════════════════════════════════════════════════════════════════════════
// T-V3 : _lireDashboard renvoie visitesAujourdhui
// ════════════════════════════════════════════════════════════════════════════
console.log('\n─── V3 : _lireDashboard → visitesAujourdhui (CDC T6.6) ───');

// Mock multi-onglets pour _lireDashboard
const SHEETS = {
  '🏢_COMPTES':  { headers: ['CA_Q1FY27', 'STATUT_COMPTE', 'PIN_CDS_Assigne'], rows: [] },
  '📋_PROSPECTS':{ headers: ['STATUT_EMPOWER','PREMIERE_COMMANDE_DATE','ORIGINE','Source_Import','Flag_traite','PIN_CDS_Assigne'], rows: [] },
  '📞_PHONING':  { headers: ['PIN_CDS'], rows: [] },
  '🗺️_VISITES': {
    headers: ['ID_Visite', 'Date', 'PIN_CDS', 'Statut_Visite'],
    rows: [
      ['V1', '2026-06-17', 9999, 'planifiée'],  // aujourd'hui + planifiée + mon PIN → compte
      ['V2', '2026-06-17', 9999, 'réalisée'],   // aujourd'hui mais réalisée → NON
      ['V3', '2026-06-16', 9999, 'planifiée'],  // hier → NON
      ['V4', '2026-06-17', 8888, 'planifiée'],  // aujourd'hui mais autre PIN → NON (si CDS)
    ],
  },
};
function mockSheetLire(def) {
  return {
    getLastRow: () => def.rows.length + 1,
    getDataRange: () => ({ getValues: () => [def.headers, ...def.rows] }),
  };
}
_getSpreadsheet = () => ({
  getSheetByName: (nom) => SHEETS[nom] ? mockSheetLire(SHEETS[nom]) : null,
});

// Cas CDS (PIN 9999) → 1 visite aujourd'hui (V1)
let dashCDS = _lireDashboard({ pin: 9999, role: 'CDS' });
ok('Réponse contient le champ cards.visitesAujourdhui',
   dashCDS?.cards && 'visitesAujourdhui' in dashCDS.cards, JSON.stringify(dashCDS?.cards));
ok('CDS 9999 → visitesAujourdhui = 1 (V1 seule : aujourd\'hui + planifiée + mon PIN)',
   dashCDS?.cards?.visitesAujourdhui === 1,
   `valeur: ${dashCDS?.cards?.visitesAujourdhui}`);

// Cas Manager (voit tout) → V1 + V4 (les 2 planifiées du jour, tous PIN)
let dashMgr = _lireDashboard({ pin: 1000, role: 'ADMIN' });
ok('ADMIN → visitesAujourdhui = 2 (V1 + V4, tout le portefeuille équipe)',
   dashMgr?.cards?.visitesAujourdhui === 2,
   `valeur: ${dashMgr?.cards?.visitesAujourdhui}`);

// ── Résumé ───────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
const icon = failed === 0 ? '🟢' : '🔴';
console.log(`  ${icon}  ${passed} ✅ passés  |  ${failed} ❌ échoués`);
console.log('══════════════════════════════════════════════════════\n');
process.exit(failed > 0 ? 1 : 0);
