// ═══════════════════════════════════════
//  test-notifs-sim.js — Centre de notifications (Sprint 3)
//  N3-2 : badge compteur · N3-3 : panneau · N3-4 : marquage lu
// ═══════════════════════════════════════
global.window = global;

// ── DOM minimal : #notif-center + createElement/appendChild ──────────────────
const _elements = {};
function _mkEl(id) {
  return { id: id || '', innerHTML: '', appendChild() {}, };
}
global.document = {
  getElementById: (id) => _elements[id] || null,
  createElement: () => _mkEl(),
  body: { appendChild(el) { if (el && el.id) _elements[el.id] = el; } },
};

let _majCalls = [];
global.SheetsAPI = {
  mettreAJour: async (f, o, id, c) => { _majCalls.push({ f, o, id, c }); return { ok: true }; },
};
global.Session = { pin: 9999, nom: 'Test', voitTout: () => false };

const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(__dirname, 'js/notif-center.js'), 'utf8'));

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { console.log(`  ✅  ${name}`); passed++; }
  else { console.error(`  ❌  ÉCHEC : ${name}${detail ? '\n       → ' + detail : ''}`); failed++; }
}
const html = () => (_elements['notif-center'] ? _elements['notif-center'].innerHTML : '');

console.log('\n══════════════════════════════════════════════════════');
console.log('  SIMULATION NOTIFS — notif-center.js');
console.log('══════════════════════════════════════════════════════\n');

const ROWS = [
  { ID_Notif: 'N1', PIN_Destinataire: 9999, Type_Notif: 'NOUVEAU_LEAD',   Message: 'Lead A', Statut_Lu: 'NON', Timestamp: '2026-06-17T09:00:00Z' },
  { ID_Notif: 'N2', PIN_Destinataire: 9999, Type_Notif: 'VISITE_REALISEE',Message: 'Visite B', Statut_Lu: 'NON', Timestamp: '2026-06-17T10:00:00Z' },
  { ID_Notif: 'N3', PIN_Destinataire: 9999, Type_Notif: 'INFO',           Message: 'Déjà lue', Statut_Lu: 'OUI', Timestamp: '2026-06-17T08:00:00Z' },
  { ID_Notif: 'N4', PIN_Destinataire: 8888, Type_Notif: 'INFO',           Message: 'Autre CDS', Statut_Lu: 'NON', Timestamp: '2026-06-17T11:00:00Z' },
];

// ── N3-2 : badge compteur ────────────────────────────────────────────────────
console.log('─── N3-2 : badge compteur ───');
NotifCenter.majDepuisRows(ROWS);
ok('Compteur = 2 (N1+N2 ; exclut lue N3 et autre PIN N4)', NotifCenter.compteur === 2,
   `compteur: ${NotifCenter.compteur}`);
ok('Badge "2" rendu dans la cloche', html().includes('nc-badge') && html().includes('>2<'),
   html().slice(0, 160));
ok('Tri antichronologique (N2 plus récent en tête)',
   NotifCenter.liste[0].ID_Notif === 'N2', NotifCenter.liste.map(n => n.ID_Notif).join(','));

// ── N3-3 : panneau déroulant ─────────────────────────────────────────────────
console.log('\n─── N3-3 : panneau déroulant ───');
ok('Panneau fermé par défaut (pas de nc-overlay)', !html().includes('nc-overlay'));
NotifCenter.basculer();
ok('Après basculer() → panneau ouvert (nc-overlay présent)', html().includes('nc-overlay'));
ok('Panneau liste les 2 messages non lus', html().includes('Lead A') && html().includes('Visite B'));
ok('Panneau n\'affiche PAS la notif déjà lue (N3)', !html().includes('Déjà lue'));
ok('Bouton "Tout marquer lu" présent', html().includes('marquerToutesLues'));
NotifCenter.fermer();
ok('Après fermer() → panneau fermé', !html().includes('nc-overlay'));

// ── N3-4 : marquage lu ───────────────────────────────────────────────────────
console.log('\n─── N3-4 : marquage lu ───');
(async () => {
  _majCalls = [];
  await NotifCenter.marquerLue('N1');
  ok('marquerLue(N1) → SheetsAPI.mettreAJour(🔔_NOTIFS, N1, {Statut_Lu:OUI})',
     _majCalls.length === 1 && _majCalls[0].o === '🔔_NOTIFS' &&
     _majCalls[0].id === 'N1' && _majCalls[0].c.Statut_Lu === 'OUI',
     JSON.stringify(_majCalls));
  ok('Compteur décrémenté à 1 après marquage', NotifCenter.compteur === 1,
     `compteur: ${NotifCenter.compteur}`);
  ok('N1 retiré de la liste locale', !NotifCenter.liste.some(n => n.ID_Notif === 'N1'));

  // marquer toutes lues
  _majCalls = [];
  NotifCenter.majDepuisRows(ROWS);   // reset à 2 non lues
  await NotifCenter.marquerToutesLues();
  ok('marquerToutesLues → 2 appels mettreAJour (N1+N2)',
     _majCalls.length === 2 && _majCalls.every(c => c.c.Statut_Lu === 'OUI'),
     JSON.stringify(_majCalls.map(c => c.id)));
  ok('Compteur = 0 après tout marquer lu', NotifCenter.compteur === 0);
  ok('Badge disparait quand compteur = 0', !html().includes('nc-badge'));

  // session absente → cloche masquée
  global.Session = { pin: null };
  NotifCenter.majDepuisRows(ROWS);
  ok('Hors session → centre vidé (cloche masquée)', html() === '');

  console.log('\n══════════════════════════════════════════════════════');
  const icon = failed === 0 ? '🟢' : '🔴';
  console.log(`  ${icon}  ${passed} ✅ passés  |  ${failed} ❌ échoués`);
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
})();
