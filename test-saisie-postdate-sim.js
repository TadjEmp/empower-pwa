// Saisie post-date : une visite rétroactive ne passe jamais en « manquée » ; une visite classique si.
const fs = require('fs');
const src = fs.readFileSync('js/vue-visites.js', 'utf8');
const ecrits = [];
const win = {};
const ctx = {
  window: win, document: {}, console,
  dateISOLocale: () => '2026-10-28',
  SheetsAPI: { mettreAJour: async (...a) => { ecrits.push(a); } },
  Session: { pin: 1000, voitTout: () => false },
  debounce: f => f, FiscalWeeks: {}, FichesFroides: {}, Toast: { afficher() {} }, Router: {},
};
new Function(...Object.keys(ctx), src + '\n;window.__V = window.VueVisites;')(...Object.values(ctx));
const V = win.__V || win.VueVisites;
let ok = 0, ko = 0;
const t = (n, c) => { c ? ok++ : ko++; console.log((c ? '✓ ' : '✗ ') + n); };

V.state = { visites: [
  { ID_Visite: 'A', Date: '2026-09-07', Statut_Visite: 'planifiée', Saisie_Retroactive: true },
  { ID_Visite: 'B', Date: '2026-09-07', Statut_Visite: 'planifiée' },
  { ID_Visite: 'C', Date: '2026-09-07', Statut_Visite: 'planifiée', Saisie_Retroactive: 'TRUE' },
  { ID_Visite: 'D', Date: '2026-11-03', Statut_Visite: 'planifiée' },
]};
t('rétro (booléen) reste planifiée à l\'affichage', V._statutEffectif(V.state.visites[0]) === 'planifiée');
t('rétro (TRUE texte) reste planifiée', V._statutEffectif(V.state.visites[2]) === 'planifiée');
t('visite classique passée → manquée', V._statutEffectif(V.state.visites[1]) === 'manquée');
t('visite future → planifiée', V._statutEffectif(V.state.visites[3]) === 'planifiée');
V._persisterVisitesManquees();
t('persistance : seule la visite classique est écrite « manquée »', ecrits.length === 1 && ecrits[0][2] === 'B');
t('rétro non modifiée', V.state.visites[0].Statut_Visite === 'planifiée' && V.state.visites[2].Statut_Visite === 'planifiée');
V.state.formPlanif = { date: '2026-10-01', saisieRetro: false }; V.render = () => {};
V.changerDatePlanif('2026-09-07'); t('date passée → case cochée', V.state.formPlanif.saisieRetro === true);
V.changerDatePlanif('2026-11-03'); t('date future → case décochée', V.state.formPlanif.saisieRetro === false);
console.log(`${ok}/${ok + ko}`); process.exit(ko ? 1 : 0);
