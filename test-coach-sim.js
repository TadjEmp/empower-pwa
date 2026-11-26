// test-coach-sim.js — Catalogue (marge) et moteur de l'Assistant commercial
const assert = require('assert');
const C = require('./js/catalogue.js');
const M = require('./js/coach-moteur.js');
const ORIG = JSON.parse(JSON.stringify(C.produits));
let n = 0; const ok = (nom, f) => { f(); n++; console.log('  ok  ' + nom); };

ok('marge : panier 6 Deluxe5 + 4 Standard + 3 NSB10 (PDF exemple)', () => {
  const r = C.comparer([['n360-del5', 6], ['n360-std', 4], ['nsb-10', 3]]);
  assert.strictEqual(Math.round(r.empower.marge), 549); assert.strictEqual(r.empower.pct, 70.1);
  assert.strictEqual(Math.round(r.grossiste.marge), 308); assert.strictEqual(Math.round(r.gain), 241);
});
ok('marge : PVP HT = TTC / 1,20', () => assert.strictEqual(Math.round(C.pvpHT(C.par('n360-std')) * 100) / 100, 33.33));
ok('marge : produit sans PA Empower exclu et signalé, jamais inventé', () => {
  const r = C.calculer([['n360-plat20', 2], ['n360-std', 1]], 'pa_empower');
  assert.deepStrictEqual(r.manquants, ['Norton 360 Platinum 20']); assert.strictEqual(r.licences, 1);
  const c = C.comparer([['n360-plat20', 2], ['n360-std', 1]]);
  assert.deepStrictEqual(c.exclus, ['Norton 360 Platinum 20']);
});
ok('marge : quantité nulle, négative ou texte ignorée', () => assert.strictEqual(C.calculer([['n360-std', -3], ['n360-std', 'x'], ['inconnu', 5]], 'pa_empower').licences, 0));
ok('marge : offre volume -20 % sur le PA dès 10 licences (option)', () => {
  const a = C.calculer([['n360-std', 10]], 'pa_empower'), b = C.calculer([['n360-std', 10]], 'pa_empower', { volume: true });
  assert.strictEqual(Math.round(b.cout * 100) / 100, Math.round(a.cout * 0.8 * 100) / 100);
  const c = C.calculer([['n360-std', 9]], 'pa_empower', { volume: true }); assert.strictEqual(c.cout, C.calculer([['n360-std', 9]], 'pa_empower').cout);
});
ok('reste au palier Actif', () => { assert.strictEqual(C.resteAuPalier(233.25), 766.75); assert.strictEqual(C.resteAuPalier(1200), 0); });

const cot = (o) => Object.assign({ id: 'k1', libelle: 'Rentrée', canaux: ['td', 'ingram'], debut: '2026-11-01', fin: '2026-11-30', remise_pct: 20, prix: {}, actif: true }, o);
ok('cotation active : remise % sur le PA grossiste, la marge grossiste monte, le gain Empower baisse', () => {
  const l = [['n360-std', 4]]; const sans = C.comparer(l, { date: '2026-10-15' });
  C.definir(null, [cot()]);
  const avec = C.comparer(l, { date: '2026-11-04' });
  assert.strictEqual(avec.grossiste.detail[0].pa, 20); assert.strictEqual(sans.grossiste.detail[0].pa, 25);
  assert.ok(avec.gain < sans.gain); assert.deepStrictEqual(avec.cotations, ['Rentrée']);
  assert.strictEqual(avec.empower.cout, sans.empower.cout);
});
ok('cotation : hors période, désactivée ou autre canal = sans effet ; bornes incluses', () => {
  const l = [['n360-std', 1]];
  C.definir(null, [cot()]);
  assert.strictEqual(C.comparer(l, { date: '2026-10-31' }).grossiste.detail[0].pa, 25); assert.strictEqual(C.comparer(l, { date: '2026-12-01' }).grossiste.detail[0].pa, 25);
  assert.strictEqual(C.comparer(l, { date: '2026-11-01' }).grossiste.detail[0].pa, 20); assert.strictEqual(C.comparer(l, { date: '2026-11-30' }).grossiste.detail[0].pa, 20);
  C.definir(null, [cot({ actif: false })]); assert.strictEqual(C.comparer(l, { date: '2026-11-04' }).grossiste.detail[0].pa, 25);
  C.definir(null, [cot({ canaux: ['ingram'] })]);
  assert.strictEqual(C.comparer(l, { date: '2026-11-04', grossiste: 'pa_td' }).grossiste.detail[0].pa, 25);
  assert.strictEqual(C.comparer(l, { date: '2026-11-04', grossiste: 'pa_ingram' }).grossiste.detail[0].pa, 20);
});
ok('cotation : prix coté explicite prioritaire, la plus basse l\'emporte, sansCotation la neutralise', () => {
  C.definir(null, [cot({ id: 'a', libelle: 'A', remise_pct: 10 }), cot({ id: 'b', libelle: 'B', remise_pct: null, prix: { 'n360-std': 15 } })]);
  const r = C.calculer([['n360-std', 1], ['n360-del3', 1]], 'pa_td', { date: '2026-11-04' });
  assert.strictEqual(r.detail[0].pa, 15); assert.strictEqual(r.detail[0].cotation, 'B'); assert.strictEqual(r.detail[1].cotation, 'A');
  assert.strictEqual(C.calculer([['n360-std', 1]], 'pa_td', { date: '2026-11-04', sansCotation: true }).detail[0].pa, 25);
  assert.strictEqual(C.calculer([['n360-std', 1]], 'pa_empower', { date: '2026-11-04' }).detail[0].pa, 11.61);
  C.definir(null, []);
});
ok('prix de la base : un prix modifié dans les Réglages change le calcul', () => {
  const copie = C.produits.map(p => Object.assign({}, p, p.id === 'n360-std' ? { pa_empower: 10 } : {}));
  C.definir(copie); assert.strictEqual(C.calculer([['n360-std', 1]], 'pa_empower').detail[0].pa, 10);
  assert.strictEqual(C.source(), 'base');
});

ok('offre 2+1 : licences offertes revendables, coût sur les seules achetées ; comparaison à nombre de licences égal', () => {
  C.definir(JSON.parse(JSON.stringify(ORIG)), []);
  const o = { offre: { type: 'xy', achetees: 2, offertes: 1 } };
  const r = C.calculer([['n360-std', 4]], 'pa_empower', o);
  assert.strictEqual(r.detail[0].offertes, 2); assert.strictEqual(r.licences, 6); assert.strictEqual(r.ca, 199.95); assert.strictEqual(r.cout, 46.44); assert.strictEqual(r.marge, 153.51);
  const c = C.comparer([['n360-std', 4]], o); assert.strictEqual(c.grossiste.licences, 6); assert.strictEqual(c.grossiste.cout, 150); assert.strictEqual(c.gain, 103.56);
  assert.strictEqual(C.calculer([['n360-std', 1]], 'pa_empower', o).detail[0].offertes, 0);
});
ok('offre remise : baisse le PA Empower, plafonnée à 90 %, remplace l\'offre volume', () => {
  C.definir(JSON.parse(JSON.stringify(ORIG)), []);
  const a = C.calculer([['n360-std', 10]], 'pa_empower'), b = C.calculer([['n360-std', 10]], 'pa_empower', { offre: { type: 'remise', taux: 0.1 }, volume: true });
  assert.strictEqual(b.detail[0].pa, 10.45); assert.ok(b.marge > a.marge);
  assert.strictEqual(C.calculer([['n360-std', 1]], 'pa_empower', { offre: { type: 'remise', taux: 5 } }).detail[0].pa, 1.16);
});

ok('trimestre : 4 nov. 2026 = Q3 semaine 4, 26 jours écoulés sur 91', () => {
  const t = M.trimestre(new Date(2026, 10, 4));
  assert.strictEqual(t.quarter, 'Q3'); assert.strictEqual(t.semaine, 4); assert.strictEqual(t.ecoule, 27); assert.strictEqual(t.pct, 30);
  assert.strictEqual(t.finISO, '2027-01-07'); assert.ok(t.semainesRestantes > 9 && t.semainesRestantes < 10);
});
ok('trimestre : hors référentiel → null, quarter imposé accepté', () => {
  assert.strictEqual(M.trimestre(new Date(2028, 0, 1)), null); assert.strictEqual(M.trimestre(new Date(2028, 0, 1), 'Q1').quarter, 'Q1');
});
ok('trajectoire : statuts au rythme / à surveiller / décrochage / sans objectif', () => {
  const tri = { quarter: 'Q3', pct: 30, semainesRestantes: 9.3 };
  const o = (pin, ca, obj) => ({ PIN_CDS: pin, Nom_CDS: 'C' + pin, Q3_CA_Realise: ca, Q3_Obj_Initial: obj });
  const t = M.trajectoire([o(1, 3000, 9000), o(2, 2000, 9000), o(3, 500, 9000), o(4, 100, 0)], tri);
  assert.deepStrictEqual(t.map(x => x.statut), ['rythme', 'surveiller', 'decrochage', 'sans_objectif']);
  assert.strictEqual(t[0].pct, 33); assert.strictEqual(t[2].reste, 8500); assert.strictEqual(t[2].parSemaine, Math.ceil(8500 / 9.3));
  const rev = M.trajectoire([{ PIN_CDS: 5, Q3_Obj_Revise: '10000', Q3_Obj_Initial: '9000', Q3_CA_Realise: '1 500,50' }], tri);
  assert.strictEqual(rev[0].obj, 10000); assert.strictEqual(rev[0].ca, 1500.5);
});
ok('trajectoire : agrégat équipe', () => {
  const tri = { pct: 30, semainesRestantes: 10 }; const a = M.agreger([{ obj: 100, ca: 20 }, { obj: 100, ca: 40 }], tri);
  assert.strictEqual(a.pct, 30); assert.strictEqual(a.statut, 'rythme'); assert.strictEqual(a.parSemaine, 14);
});

const base = { now: new Date(2026, 10, 4), estEmpower: c => c.emp, active: c => c.act, localise: c => !!c.CP, dernierContact: c => c.dc || null, pin: 1 };
const C0 = (id, o) => Object.assign({ ID_Compte: id, Nom_Compte: 'Cpt ' + id, PIN_CDS_Assigne: 1, emp: true, act: false }, o);
ok('ciblage : exclut activés, grossistes, supprimés et autres commerciaux', () => {
  const r = M.cibles([C0('a'), C0('b', { act: true }), C0('c', { emp: false }), C0('d', { deleted: 'TRUE' }), C0('e', { PIN_CDS_Assigne: 2 })], base);
  assert.deepStrictEqual(r.map(x => x.id), ['a']);
});
ok('ciblage : fiche localisée + contact récent + CA historique passent devant ; confiance et raisons', () => {
  const r = M.cibles([C0('froid'), C0('chaud', { CP: '31000', dc: '2026-11-02', CA_FY26: '1 600' })], base);
  assert.strictEqual(r[0].id, 'chaud'); assert.strictEqual(r[0].confiance, 'haute'); assert.strictEqual(r[1].confiance, 'faible');
  assert.ok(r[0].raisons.some(x => /dernier contact il y a 2 j/.test(x))); assert.ok(r[1].raisons.includes('jamais contacté'));
  assert.ok(r[0].score >= 0 && r[0].score <= 100);
});
ok('ciblage : sans filtre pin = tout le périmètre ; limite n', () => {
  const l = [1, 2, 3, 4, 5, 6, 7].map(i => C0('x' + i, { PIN_CDS_Assigne: i % 2 + 1 }));
  assert.strictEqual(M.cibles(l, Object.assign({}, base, { pin: null }), 3).length, 3); assert.strictEqual(M.cibles(l, Object.assign({}, base, { pin: null }), 10).length, 7);
});
const ctxA = Object.assign({}, base, { palier: c => ({ cle: c.pal || 'DORMANT' }), caEmpower: c => c.ca || 0, adresseOk: c => !!c.Adresse, depuisOnboarding: c => c.onb == null ? null : c.onb });
ok('alertes : 48 h, sans commande 14 j, proches du palier, sans adresse', () => {
  const d = { leads: [{ Date_prochaine_action: '2026-10-30' }, { Date_prochaine_action: '2026-11-03' }, { Date_prochaine_action: '' }],
              comptes: [C0('a', { onb: 20 }), C0('b', { pal: 'EVEIL', ca: 900, act: true, Adresse: 'x' }), C0('c', { pal: 'EVEIL', ca: 400, act: true, Adresse: 'x' })] };
  const a = M.alertes(d, ctxA); const m = Object.fromEntries(a.map(x => [x.id, x.n]));
  assert.deepStrictEqual(m, { hors48: 1, sans_cmd: 1, proches: 1, sans_adresse: 1 });
  assert.strictEqual(a[0].id, 'hors48'); assert.strictEqual(a[0].niveau, 'haute');
});
ok('alertes : démarrage (2 à 13 j après onboarding, non activé) → starter pack', () => {
  const a = M.alertes({ leads: [], comptes: [C0('a', { onb: 1 }), C0('b', { onb: 2 }), C0('c', { onb: 13 }), C0('d', { onb: 14 }), C0('e', { onb: 5, act: true })] }, ctxA);
  const x = a.find(y => y.id === 'demarrage'); assert.ok(x); assert.strictEqual(x.n, 2); assert.strictEqual(x.to, '#/kit');
  const p = M.planSemaine([], a, {}); assert.ok(p.some(i => i.id === 'starter' && i.to === '#/kit'));
});
ok('alertes : rien à signaler = liste vide', () => assert.deepStrictEqual(M.alertes({ leads: [], comptes: [] }, ctxA), []));
ok('plan : 5 actions max, auto-coché quand la donnée le prouve', () => {
  const cs = M.cibles([C0('a', { CP: '31000' }), C0('b', { CP: '64000' }), C0('c', { CP: '75000' })], base);
  const al = [{ id: 'hors48', n: 2 }, { id: 'proches', n: 3 }, { id: 'sans_adresse', n: 40 }];
  const p = M.planSemaine(cs, al, { faitCompte: c => c.ID_Compte === cs[0].id, adressesCompletees: 3 });
  assert.strictEqual(p.length, 5); assert.strictEqual(p[0].fait, true); assert.strictEqual(p[1].fait, false); assert.strictEqual(p.find(x => x.id === 'adresses').fait, true);
  assert.strictEqual(p.find(x => x.id === 'adresses').texte, 'Compléter 3 adresses');
});
ok('diagnostic : règles lisibles', () => {
  assert.match(M.diagnostic({ statut: 'decrochage' }, { ouverts: 5, activite7: 9, integres: 0 }), /closing/);
  assert.match(M.diagnostic({ statut: 'decrochage' }, { sansAdresse: 11 }), /adresses/);
  assert.match(M.diagnostic({ statut: 'sans_objectif' }, {}), /non renseigné/);
});
ok('alertes : devis sans suite (≥ 7 j, compte non actif, aucune action plus récente) et business review Ambassadeur', () => {
  const cs = [C0('a', { Nom_Compte: 'Alpha', Adresse: 'x', Date_Derniere_Action: '2026-10-01' }), C0('b', { Nom_Compte: 'Beta', Adresse: 'x', Date_Derniere_Action: '2026-10-30' }),
              C0('c', { Nom_Compte: 'Gamma', Adresse: 'x', act: true }), C0('d', { Nom_Compte: 'Delta', Adresse: 'x', pal: 'AMBASSADEUR', ca: 3500, act: true })];
  const devis = [{ date: '2026-10-20', nom: 'Alpha' }, { date: '2026-10-20', nom: 'Beta' }, { date: '2026-10-20', nom: 'Gamma' }, { date: '2026-11-02', nom: 'Alpha' }, { date: '2026-05-01', nom: 'Alpha' }];
  const a = M.alertes({ leads: [], comptes: cs, devis }, ctxA); const m = Object.fromEntries(a.map(x => [x.id, x.n]));
  assert.strictEqual(m.devis, 1); assert.deepStrictEqual(a.find(x => x.id === 'devis').noms, ['Alpha']);
  assert.strictEqual(m.ambassadeurs, 1);
});
ok('plan : devis et business review entrent dans le plan', () => {
  const p = M.planSemaine([], [{ id: 'devis', n: 2, noms: ['Alpha', 'Beta'] }, { id: 'ambassadeurs', n: 1 }], {});
  assert.strictEqual(p[0].texte, 'Relancer 2 devis sans suite'); assert.strictEqual(p[0].detail, 'Alpha, Beta'); assert.match(p[1].texte, /business review/);
});
console.log(n + ' tests OK');
