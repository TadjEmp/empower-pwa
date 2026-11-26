// test-admin-prix-sim.js — Réglages › Prix et cotations (AdminPrix) avec base simulée
global.window = global;
const assert = require('assert'); let n = 0; const ok = async (nom, f) => { await f(); n++; console.log('  ok  ' + nom); };
const calls = []; const toasts = []; let rendus = 0; let insertErr = null;
const C = require('./js/catalogue.js');
const rows = C.produits.map((p, i) => ({ produit_id: p.id, famille: p.famille, nom: p.nom, appareils: p.appareils, pvp_ttc: p.pvp_ttc, pa_empower: p.pa_empower, pa_td: p.pa_td, pa_ingram: p.pa_ingram, sku_td: p.sku_td, sku_ingram: p.sku_ingram, ordre: i }));
let cots = [];
const q = (t) => { const o = { _t: t, _op: null, select() { this._op = this._op || 'select'; return this; }, eq(c, v) { this._eq = [c, v]; return this._op === 'select' ? this : this._fin(); }, order() { return this; }, single() { return Promise.resolve(this._res); },
  update(v) { this._op = 'update'; this._v = v; return this; }, insert(v) { this._op = 'insert'; this._v = v; this._res = insertErr ? { error: insertErr } : { data: Object.assign({ id: 'new1', created_at: 'x' }, v), error: null }; cots.push(Object.assign({ id: 'new1' }, v)); return this; },
  delete() { this._op = 'delete'; return this; },
  _fin() { if (this._op === 'update' && this._t === 'catalogue_produits') Object.assign(rows.find(r => r.produit_id === this._eq[1]), this._v); if (this._op === 'update' && this._t === 'catalogue_cotations') Object.assign(cots.find(r => r.id === this._eq[1]), this._v); if (this._op === 'delete') cots = cots.filter(r => r.id !== this._eq[1]); calls.push({ t: this._t, op: this._op, v: this._v, eq: this._eq }); return Promise.resolve({ error: null }); },
  then(res) { if (this._op === 'select') return Promise.resolve({ data: this._t === 'catalogue_produits' ? rows : cots, error: null }).then(res); return Promise.resolve(this._res || { error: null }).then(res); } };
  return o; };
global.SheetsAPI = { _sb: { from: t => q(t) }, ecrire: async () => ({ ok: true }) };
global.Session = { pin: 1000, estManager: () => true, estChannel: () => false };
global.Toast = { afficher: (m, t) => toasts.push([m, t]) };
global.genId = p => p + '1'; global.VueAdmin = { render: () => { rendus++; } };
global.confirm = () => true;
require('./js/admin-prix.js');
const P = window.AdminPrix;
(async () => {
  await P.charger();
  await ok('affichage : tableau des 16 produits, aucune cotation, éditable', () => {
    const h = P.html(); assert.strictEqual((h.match(/<tr><td><strong>/g) || []).length, 16); assert.match(h, /Aucune cotation en cours/); assert.match(h, /onchange="AdminPrix.majPrix\('n360-std','pa_td'/);
  });
  await ok('majPrix : écrit le bon champ, ignore l’inchangé, refuse un montant invalide', async () => {
    calls.length = 0; await P.majPrix('n360-std', 'pa_td', '24,5');
    assert.deepStrictEqual(calls.map(c => [c.op, c.v.pa_td, c.eq[1]]), [['update', 24.5, 'n360-std']]); assert.strictEqual(C.par('n360-std').pa_td, 24.5);
    calls.length = 0; await P.majPrix('n360-std', 'pa_td', '24.5'); assert.strictEqual(calls.length, 0);
    await P.majPrix('n360-std', 'pa_td', 'abc'); assert.strictEqual(calls.length, 0); assert.match(toasts.at(-1)[0], /invalide/);
    await P.majPrix('n360-std', 'pvp_ttc', '0'); assert.strictEqual(calls.length, 0);
    await P.majPrix('n360-prem10', 'pa_empower', '30'); assert.strictEqual(C.par('n360-prem10').pa_empower, 30);
    await P.majPrix('n360-prem10', 'pa_empower', ''); assert.strictEqual(C.par('n360-prem10').pa_empower, null);
  });
  await ok('ajouter : validations (nom, période, canaux, remise ou prix)', async () => {
    const b = P.brouillon; calls.length = 0;
    await P.ajouter(); assert.match(toasts.at(-1)[0], /nom/);
    b('libelle', 'Rentrée'); await P.ajouter(); assert.match(toasts.at(-1)[0], /période/);
    b('debut', '2026-11-10'); b('fin', '2026-11-01'); await P.ajouter(); assert.match(toasts.at(-1)[0], /après le début/);
    b('fin', '2026-11-30'); b('td', false); b('ingram', false); await P.ajouter(); assert.match(toasts.at(-1)[0], /canal/);
    b('td', true); await P.ajouter(); assert.match(toasts.at(-1)[0], /remise/);
    b('remise', '95'); await P.ajouter(); assert.match(toasts.at(-1)[0], /entre 1 et 90/);
    assert.strictEqual(calls.filter(c => c.op === 'insert').length, 0);
  });
  await ok('ajouter : enregistre, remet le formulaire à zéro, la cotation joue sur les calculs', async () => {
    P.brouillon('remise', '20'); P.brouillonPrix('n360-del3', '28,9');
    await P.ajouter(); assert.match(toasts.at(-1)[0], /enregistrée/);
    const ins = cots[0]; assert.deepStrictEqual([ins.libelle, ins.canaux, ins.debut, ins.fin, ins.remise_pct, ins.prix], ['Rentrée', ['td'], '2026-11-10', '2026-11-30', 20, { 'n360-del3': 28.9 }]);
    assert.strictEqual(P.state.brouillon.libelle, '');
    const r = C.calculer([['n360-std', 1], ['n360-del3', 1]], 'pa_td', { date: '2026-11-15' });
    assert.strictEqual(r.detail[0].pa, 19.6); assert.strictEqual(r.detail[1].pa, 28.9);   // 24,5 x 0,8 ; prix coté
    assert.strictEqual(C.calculer([['n360-std', 1]], 'pa_td', { date: '2026-12-01' }).detail[0].pa, 24.5);
    assert.match(P.html(), /Du 10\/11\/2026 au 30\/11\/2026/); assert.match(P.html(), /-20 %/);
  });
  await ok('basculer et supprimer', async () => {
    calls.length = 0; await P.basculer('new1'); assert.strictEqual(calls[0].v.actif, false);
    await P.supprimer('new1'); assert.strictEqual(calls.at(-1).op, 'delete');
  });
  await ok('lecture seule pour un commercial : pas de champs ni de formulaire', () => {
    Session.estManager = () => false; const h = P.html(); assert.ok(!/AdminPrix.majPrix/.test(h)); assert.ok(!/Enregistrer la cotation/.test(h)); assert.match(h, /Lecture seule/);
  });
  await ok('échappement : un nom de cotation hostile est neutralisé', () => {
    Session.estManager = () => true; P.state.cotations = [{ id: 'z', libelle: '<img src=x onerror=alert(1)>', canaux: ['td'], debut: '2026-01-01', fin: '2026-01-02', remise_pct: 10, prix: {}, actif: true }];
    assert.ok(!/<img src=x/.test(P.html())); assert.match(P.html(), /&lt;img/);
  });
  console.log(n + ' tests OK');
})().catch(e => { console.error(e); process.exit(1); });
