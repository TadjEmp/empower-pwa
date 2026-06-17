// ═══════════════════════════════════════
//  test-sprint2-sim.js — Frontend Visites
//  P6-1 : Vue Semaine = 5 colonnes (Lun→Ven)
//  P6-2 : statut 'manquée' + couleur danger
//  P6-3 : _statutEffectif (planifiée passée → manquée 🔴)
//  P6-5 : prospect à froid → localStorage, JAMAIS dans 📋_PROSPECTS
// ═══════════════════════════════════════
global.window = global;

// ── localStorage mock ────────────────────────────────────────────────────────
const _ls = {};
global.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
};

// ── Date "aujourd'hui" figée = 2026-06-17 ────────────────────────────────────
const TODAY = '2026-06-17';
global.dateISOLocale = (d) => {
  if (!d) return TODAY;
  // formate une Date réelle (utilisé par visitesSemaine)
  const dt = (d instanceof Date) ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

// ── Capture des appels SheetsAPI ─────────────────────────────────────────────
let _ecrireCalls = [];
global.SheetsAPI = {
  ecrire:      async (f, o, d) => { _ecrireCalls.push({ f, o, d }); return { ok: true }; },
  mettreAJour: async () => ({ ok: true }),
  viderCache:  async () => {},
  lire:        async () => [],
};
global.Session = {
  pin: 9999, nom: 'Test CDS', token: 'tok',
  voitTout: () => false, estCDS: () => true,
};
global.Toast        = { afficher: () => {} };
global.Router       = { aller: () => {} };
global.NavBar       = () => '';
global.genId        = (p) => `${p}_TEST`;
global.getISOWeek   = () => 'W25';
global.normaliserNom= (s) => (s || '').toLowerCase().trim();
global.resolveCDS   = () => 'CDS Test';
global.parseCA      = (v) => parseFloat(v) || null;
global.fmtCA        = (v) => (v ? `${v}€` : '—');
global.formatMontant= (v) => v;
global.generateCSV  = () => {};
let _lastHtml = '';
global.document = {
  getElementById: (id) => id === 'app'
    ? { get innerHTML() { return _lastHtml; }, set innerHTML(v) { _lastHtml = v; } }
    : null,
};

// ── Charger le source ────────────────────────────────────────────────────────
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(__dirname, 'js/vue-visites.js'), 'utf8'));
VueVisites.render = () => {};   // silencer

// ── Framework assertion ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { console.log(`  ✅  ${name}`); passed++; }
  else { console.error(`  ❌  ÉCHEC : ${name}${detail ? '\n       → ' + detail : ''}`); failed++; }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  SIMULATION SPRINT 2 — vue-visites.js');
console.log('══════════════════════════════════════════════════════\n');

// ── P6-2 : vocabulaire ───────────────────────────────────────────────────────
console.log('─── P6-2 : statut manquée présent (vocabulaire + couleur) ───');
ok('STATUTS contient "manquée"', VueVisites.STATUTS.includes('manquée'),
   JSON.stringify(VueVisites.STATUTS));
ok('STATUT_COULEURS["manquée"] = var(--c-danger) (rouge)',
   VueVisites.STATUT_COULEURS['manquée'] === 'var(--c-danger)',
   VueVisites.STATUT_COULEURS['manquée']);
ok('_labelStatut("manquée") = "Manquée"', VueVisites._labelStatut('manquée') === 'Manquée');

// ── P6-3 : _statutEffectif ───────────────────────────────────────────────────
console.log('\n─── P6-3 : _statutEffectif (planifiée passée → manquée) ───');
ok('planifiée + date passée (hier) → manquée',
   VueVisites._statutEffectif({ Statut_Visite: 'planifiée', Date: '2026-06-16' }) === 'manquée');
ok('planifiée + date future (demain) → planifiée',
   VueVisites._statutEffectif({ Statut_Visite: 'planifiée', Date: '2026-06-18' }) === 'planifiée');
ok('planifiée + aujourd\'hui → planifiée (PAS manquée)',
   VueVisites._statutEffectif({ Statut_Visite: 'planifiée', Date: TODAY }) === 'planifiée');
ok('réalisée + date passée → réalisée (jamais manquée)',
   VueVisites._statutEffectif({ Statut_Visite: 'réalisée', Date: '2026-06-10' }) === 'réalisée');
ok('en cours + date passée → en cours (jamais manquée)',
   VueVisites._statutEffectif({ Statut_Visite: 'en cours', Date: '2026-06-10' }) === 'en cours');
ok('sans statut + date passée → manquée (défaut planifiée)',
   VueVisites._statutEffectif({ Date: '2026-06-01' }) === 'manquée');

// carte visite : libellé rouge "Manquée" rendu
const carte = VueVisites._carteVisite({
  ID_Visite: 'V1', Statut_Visite: 'planifiée', Date: '2026-06-16', PIN_CDS: 9999, Nom_Compte: 'Acme',
});
ok('Carte d\'une visite passée affiche "Manquée"', carte.includes('Manquée'), carte.slice(0, 200));
ok('Carte manquée : bouton "Rattraper" (action reste possible)', carte.includes('Rattraper'));
ok('Carte manquée : bordure rouge (var(--c-danger))', carte.includes('var(--c-danger)'));

// ── P6-1 : Vue Semaine 5 colonnes ────────────────────────────────────────────
console.log('\n─── P6-1 : Vue Semaine = 5 colonnes (Lun→Ven) ───');
VueVisites.state.dateVue = TODAY;       // mercredi 17 juin 2026
VueVisites.state.visites = [];
const semaine = VueVisites.visitesSemaine;
ok('visitesSemaine renvoie 5 jours (week-end exclu)', semaine.length === 5,
   `longueur: ${semaine.length}`);

// ── P6-5 : prospect à froid → localStorage, pas de Sheets ────────────────────
console.log('\n─── P6-5 : prospect à froid en localStorage uniquement ───');
ok('localStorage vide au départ', VueVisites._lireProspectsFroid().length === 0);

VueVisites._memoriserProspectFroid('MICRO PLUS');
VueVisites._memoriserProspectFroid('micro plus');   // doublon (casse) → ignoré
VueVisites._memoriserProspectFroid('DARTY TERNES');
const froid = VueVisites._lireProspectsFroid();
ok('2 prospects mémorisés (dédup casse-insensible)', froid.length === 2,
   JSON.stringify(froid));
ok('Persisté sous la clé esi_prospects_froid', !!_ls['esi_prospects_froid']);

// planifier() une visite à froid → AUCUNE écriture 📋_PROSPECTS
(async () => {
  _ecrireCalls = [];
  VueVisites.state.visites  = [];
  VueVisites.state.comptes  = [];
  VueVisites._resetFormPlanif();
  VueVisites.state.formPlanif.horsBase   = true;
  VueVisites.state.formPlanif.nomLibre   = 'NOUVEAU FROID SARL';
  VueVisites.state.formPlanif.date       = TODAY;
  VueVisites.state.formPlanif.typeVisite = 'PROSPECTION_FROIDE';

  const fakeEvent = { preventDefault: () => {}, submitter: null, target: { querySelector: () => null } };
  await VueVisites.planifier(fakeEvent);

  const ecritProspect = _ecrireCalls.find(c => c.o === '📋_PROSPECTS');
  const ecritVisite   = _ecrireCalls.find(c => c.o === '🗺️_VISITES');
  ok('Visite à froid → AUCUNE écriture dans 📋_PROSPECTS',
     !ecritProspect, `appels ecrire: [${_ecrireCalls.map(c => c.o).join(', ')}]`);
  ok('Visite à froid → écriture dans 🗺️_VISITES (la visite existe bien)',
     !!ecritVisite, `appels ecrire: [${_ecrireCalls.map(c => c.o).join(', ')}]`);
  ok('Visite à froid → ID_Cible = HORS_BASE', ecritVisite?.d?.ID_Cible === 'HORS_BASE',
     `ID_Cible: ${ecritVisite?.d?.ID_Cible}`);
  ok('Visite à froid → Source_Visite = ESI_VISITE_FROID',
     ecritVisite?.d?.Source_Visite === 'ESI_VISITE_FROID');
  ok('Nom à froid ajouté au localStorage après planification',
     VueVisites._lireProspectsFroid().some(n => normaliserNom(n) === 'nouveau froid sarl'),
     JSON.stringify(VueVisites._lireProspectsFroid()));

  // ── Résumé ─────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  const icon = failed === 0 ? '🟢' : '🔴';
  console.log(`  ${icon}  ${passed} ✅ passés  |  ${failed} ❌ échoués`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
})();
