// ═══════════════════════════════════════
//  test-visites-sim.js — Simulation tests
//  BUG 1 : freins cochables (onclick valide)
//  BUG 2 : Statut_Visite réalisée après validation
// ═══════════════════════════════════════
'use strict';

// ── Globals browser nécessaires ─────────────────────────────────────────────
global.window = global;

// Capture TOUS les appels (plusieurs par valider())
let _ecrireCalls = [], _mettreAJourCalls = [], _viderCacheArgs = [];
let _ecrireArgs  = null, _mettreAJourArgs = null; // compatibilité anciens tests

const _resetCalls = () => {
  _ecrireCalls = []; _mettreAJourCalls = [];
  _ecrireArgs  = null; _mettreAJourArgs = null;
  _viderCacheArgs = [];
};

global.SheetsAPI = {
  ecrire:      async (f, o, d)    => {
    const r = { f, o, d }; _ecrireCalls.push(r); _ecrireArgs = r; return { ok: true };
  },
  mettreAJour: async (f, o, id, c)=> {
    const r = { f, o, id, c }; _mettreAJourCalls.push(r); _mettreAJourArgs = r; return { ok: true };
  },
  viderCache:  async (f, o)       => { _viderCacheArgs.push({ f, o }); return; },
  lire:        async ()           => [],
  uploadPhoto: async ()           => ({ url: 'http://mock/photo.jpg' }),
};
global.Session = {
  token:'tok', expiry: Date.now()+3600000,
  pin: 9999, nom:'Test CDS', role:'CDS',
  voitTout:()=>false, estManager:()=>false,
  estCDS:()=>true,    estChannel:()=>false,
};
global.Toast   = { afficher: () => {} };
global.Router  = { aller:    () => {} };
global.GroqAPI = {};

// ── Utilitaires app simulés ──────────────────────────────────────────────────
global.genId         = (p) => `${p}_TEST`;
global.getISOWeek    = ()  => 'W25';
global.dateISOLocale = ()  => '2026-06-17';
global.normaliserNom = (s) => (s||'').toLowerCase();
global.resolveCDS    = ()  => 'CDS Test';
global.formatEuro    = (v) => `${v}€`;
global.dateRelative  = (s) => s;
global.parseCA       = (v) => parseFloat(v)||null;
global.fmtCA         = (v) => v?`${v}€`:'—';

// DOM minimal — capture innerHTML pour les tests écran succès
let _lastHtml = '';
global.document = {
  getElementById: (id) => id === 'app'
    ? { get innerHTML() { return _lastHtml; }, set innerHTML(v) { _lastHtml = v; } }
    : null,
};

// ── Charger le code source ───────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');
const src  = fs.readFileSync(
  path.join(__dirname, 'js/vue-questionnaire.js'), 'utf8'
);
eval(src);

// ── Framework assertion minimal ──────────────────────────────────────────────
let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✅  ${name}`);
    passed++;
  } else {
    console.error(`  ❌  ÉCHEC : ${name}${detail ? '\n       → ' + detail : ''}`);
    failed++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log('  SIMULATION VISITES — vue-questionnaire.js v8');
console.log('══════════════════════════════════════════════════════\n');

// ── Bloc T1 : Freins — HTML onclick valide ────────────────────────────────
console.log('─── T1 : Freins — attribut onclick sans guillemets doubles (BUG 1) ───');

VueQuestionnaire.state = VueQuestionnaire._etatInitial();
VueQuestionnaire.state.chargement = false;
VueQuestionnaire.state.etape = 4;

const html4 = VueQuestionnaire._etape4();

// Extraire tous les attributs onclick="..."
const onclicks = [...html4.matchAll(/onclick="([^"]*)"/g)].map(m => m[1]);
ok(`${VueQuestionnaire.FREINS.length} boutons freins trouvés`,
   onclicks.length === VueQuestionnaire.FREINS.length,
   `trouvé ${onclicks.length}`);

onclicks.forEach((oc, i) => {
  const freinId = VueQuestionnaire.FREINS[i].id;
  ok(`Frein ${i+1} : onclick sans guillemets doubles parasites`,
     !oc.includes('"'),
     `onclick="${oc}"`);
  ok(`Frein ${i+1} : appelle toggleListe('freins', ...)`,
     oc.includes("toggleListe('freins',"),
     oc.slice(0, 70));
});

// ── Bloc T2 : toggleListe — ajoute / retire ──────────────────────────────
console.log('\n─── T2 : toggleListe — ajout/retrait d\'un frein ───');

const frein0 = VueQuestionnaire.FREINS[0].id;
VueQuestionnaire.render = () => {}; // silencer render

VueQuestionnaire.toggleListe('freins', frein0);
ok('Frein 1 ajouté dans state.d.freins',
   VueQuestionnaire.state.d.freins.includes(frein0),
   frein0);

VueQuestionnaire.toggleListe('freins', frein0);
ok('Frein 1 retiré de state.d.freins (toggle OFF)',
   !VueQuestionnaire.state.d.freins.includes(frein0));

VueQuestionnaire.toggleListe('freins', VueQuestionnaire.FREINS[2].id);
VueQuestionnaire.toggleListe('freins', VueQuestionnaire.FREINS[5].id);
ok('Deux freins différents cochés simultanément',
   VueQuestionnaire.state.d.freins.length === 2);

// ── Bloc T3 : valider() nouvelle visite → Statut_Visite réalisée ─────────
console.log('\n─── T3 : valider() visite NOUVELLE — Statut_Visite = \'réalisée\' (BUG 2) ───');

(async () => {
  _resetCalls();

  VueQuestionnaire.state            = VueQuestionnaire._etatInitial();
  VueQuestionnaire.state.chargement = false;
  VueQuestionnaire._visitePlanifiee = null;          // PAS de visite planifiée
  VueQuestionnaire.state.cible      = { ID_Compte:'CPT_001', Nom_Compte:'Acme SA' };
  VueQuestionnaire.state.typeSource = 'EXISTANT';
  VueQuestionnaire.state.gps        = { lat:'', lng:'' };
  VueQuestionnaire.state.photos     = [];
  VueQuestionnaire.state.debut      = Date.now();
  const d = VueQuestionnaire.state.d;
  d.resultatVisite     = '✅ Positif';
  d.prochaineAction    = 'Rappel';
  d.empowerPartenaire  = 'OUI';
  d.empowerInteresse   = '';
  VueQuestionnaire.render = () => {};

  await VueQuestionnaire.valider();

  // ecrire est appelé plusieurs fois (🗺️_VISITES puis 📊_ACTIONS) — on cible le bon
  const ecritVisite = _ecrireCalls.find(c => c.o === '🗺️_VISITES');
  const majVisite   = _mettreAJourCalls.find(c => c.o === '🗺️_VISITES');

  ok('SheetsAPI.ecrire(🗺️_VISITES) appelé pour nouvelle visite',
     !!ecritVisite,
     `appels ecrire: [${_ecrireCalls.map(c=>c.o).join(', ')}]`);
  ok('Statut_Visite = \'réalisée\' dans la nouvelle visite',
     ecritVisite?.d?.Statut_Visite === 'réalisée',
     `trouvé: "${ecritVisite?.d?.Statut_Visite}"`);
  ok('mettreAJour sur 🗺️_VISITES NON appelé (nouvelle visite → ecrire)',
     !majVisite,
     `appels mettreAJour: [${_mettreAJourCalls.map(c=>c.o).join(', ')}]`);

  // ── Bloc T4 : valider() visite PLANIFIÉE → mettreAJour réalisée ──────
  console.log('\n─── T4 : valider() visite PLANIFIÉE — mettreAJour Statut_Visite = \'réalisée\' ───');
  _resetCalls();

  VueQuestionnaire.state            = VueQuestionnaire._etatInitial();
  VueQuestionnaire.state.chargement = false;
  VueQuestionnaire._visitePlanifiee = { ID_Visite:'VIS_PLANIF_001', Source_Visite:'ESI_V21' };
  VueQuestionnaire.state.cible      = { ID_Compte:'CPT_002', Nom_Compte:'Beta Corp' };
  VueQuestionnaire.state.typeSource = 'EXISTANT';
  VueQuestionnaire.state.gps        = { lat:'48.85', lng:'2.35' };
  VueQuestionnaire.state.photos     = [];
  VueQuestionnaire.state.debut      = Date.now();
  const d2 = VueQuestionnaire.state.d;
  d2.resultatVisite     = '🟡 Mitigé';
  d2.prochaineAction    = 'RDV';
  d2.empowerPartenaire  = 'NON';
  d2.empowerInteresse   = 'NON';
  VueQuestionnaire.render = () => {};

  await VueQuestionnaire.valider();

  // mettreAJour est appelé plusieurs fois (🗺️_VISITES puis 🏢_COMPTES) — on cible le bon
  const majVis = _mettreAJourCalls.find(c => c.o === '🗺️_VISITES');
  const ecritP = _ecrireCalls.find(c => c.o === '🗺️_VISITES');

  ok('SheetsAPI.mettreAJour(🗺️_VISITES) appelé (visite planifiée)',
     !!majVis,
     `appels mettreAJour: [${_mettreAJourCalls.map(c=>c.o).join(', ')}]`);
  ok('ID original VIS_PLANIF_001 conservé',
     majVis?.id === 'VIS_PLANIF_001',
     `id trouvé: "${majVis?.id}"`);
  ok('Statut_Visite = \'réalisée\' dans mettreAJour(🗺️_VISITES)',
     majVis?.c?.Statut_Visite === 'réalisée',
     `trouvé: "${majVis?.c?.Statut_Visite}"`);
  ok('ecrire(🗺️_VISITES) NON appelé pour visite planifiée (→ mettreAJour)',
     !ecritP,
     `appels ecrire: [${_ecrireCalls.map(c=>c.o).join(', ')}]`);

  // ── Bloc T5 : _renderSucces → bouton sync navigue vers historique ────
  console.log('\n─── T5 : Bouton sync écran succès → modeVue=historique ───');

  VueQuestionnaire.state           = VueQuestionnaire._etatInitial();
  VueQuestionnaire.state.chargement= false;
  VueQuestionnaire.state.cible     = { Nom_Compte:'Acme SA' };
  VueQuestionnaire._isHorsBase     = false;
  _lastHtml                        = '';

  VueQuestionnaire._renderSucces(15, false);

  const syncBtn = _lastHtml.match(/onclick="([^"]*synchroniser[^"]*)"/)?.[1] || '';
  ok('Bouton sync présent dans écran succès',
     syncBtn.length > 0,
     'bouton non trouvé');
  ok('Bouton sync : modeVue=\'historique\' assigné en premier',
     syncBtn.startsWith("VueVisites.state.modeVue='historique'"),
     syncBtn.slice(0, 80));
  ok('Bouton sync : appelle VueVisites.synchroniser()',
     syncBtn.includes('VueVisites.synchroniser()'));
  ok('Bouton sync : navigue vers #/visites',
     syncBtn.includes("Router.aller('#/visites')"));

  // ── Bloc T6 : VueVisites — visitesRealisees filtre correctement ──────
  console.log('\n─── T6 : VueVisites.visitesRealisees — filtre vert ───');

  // Charger vue-visites.js
  const srcV = fs.readFileSync(path.join(__dirname, 'js/vue-visites.js'), 'utf8');
  // Mocks supplémentaires pour vue-visites
  global.NavBar        = () => '';
  global.formatMontant = (v) => v;
  eval(srcV);

  const visitesMock = [
    { ID_Visite:'V1', Statut_Visite:'réalisée', PIN_CDS: 9999, deleted:'' },
    { ID_Visite:'V2', Statut_Visite:'planifiée', PIN_CDS: 9999, deleted:'' },
    { ID_Visite:'V3', Statut_Visite:'', PIN_CDS: 9999, deleted:'' },
    { ID_Visite:'V4', Statut_Visite:'réalisée', PIN_CDS: 8888, deleted:'' },
    { ID_Visite:'V5', Statut_Visite:'réalisée', PIN_CDS: 9999, deleted:'TRUE' },
    { ID_Visite:'V6', Statut_Visite:'Réalisée', PIN_CDS: 9999, deleted:'' }, // casse majuscule
  ];
  VueVisites.state.visites = visitesMock.filter(v =>
    String(v.deleted || '').toUpperCase() !== 'TRUE' &&
    (Session.voitTout() || Number(v.PIN_CDS) === Session.pin)
  );

  const realisees = VueVisites.visitesRealisees;
  ok('visitesRealisees : visites réalisées du CDS (IDs V1+V6)',
     realisees.length === 2 &&
     realisees.some(v => v.ID_Visite === 'V1') &&
     realisees.some(v => v.ID_Visite === 'V6'),
     `IDs trouvés: ${realisees.map(v=>v.ID_Visite).join(', ')}`);
  ok('visitesRealisees : exclut planifiée (V2)',
     !realisees.some(v => v.ID_Visite === 'V2'));
  ok('visitesRealisees : exclut visite sans statut (V3 — ancienne format)',
     !realisees.some(v => v.ID_Visite === 'V3'));
  ok('visitesRealisees : exclut autre CDS (V4)',
     !realisees.some(v => v.ID_Visite === 'V4'));
  ok('visitesRealisees : exclut deleted=TRUE (V5)',
     !realisees.some(v => v.ID_Visite === 'V5'));

  // ── Résumé final ─────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  const icon = failed === 0 ? '🟢' : '🔴';
  console.log(`  ${icon}  ${passed} ✅ passés  |  ${failed} ❌ échoués`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
})();
