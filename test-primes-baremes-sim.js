/* Test de non-régression et de raccordement : node test-primes-baremes-sim.js [js/vue-primes.js] [js/primes-baremes.js] */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const origPath = process.argv[2] || 'js/vue-primes.js', extPath = process.argv[3] || 'js/primes-baremes.js';
let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

function creerDom() {
  const d = { statut: null, texts: [], zone: { innerHTML: '' }, jauge: { innerHTML: '' } };
  const chips = { insertAdjacentHTML: (pos, html) => { d.statut = html; } };
  const app = { querySelector: s => (s === '.q-chips' ? chips : null), innerHTML: '' };
  d.document = {
    getElementById: id => id === 'app' ? app : id === 'bareme-statut' ? (d.statut ? { remove: () => { d.statut = null; } } : null)
      : id === 'simu-resultat' ? d.zone : id === 'simu-jauge' ? d.jauge : null,
    createTreeWalker: () => { let i = 0; return { nextNode: () => d.texts[i++] || null }; },
  };
  return d;
}
function charger(opts = {}) {
  const dom = creerDom();
  const appels = [];
  const ctx = {
    document: dom.document, location: { pathname: opts.chemin || '/primes', hash: '' },
    Session: opts.session === null ? { token: null, estCDS: () => false, pin: 1000 } : { token: 'tok', estCDS: () => false, pin: 1000 },
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON: 'anon',
    parseCA: v => Number(v) || 0, fmtCA: v => String(v), console, setTimeout, clearTimeout, AbortController,
    fetch: opts.fetch ? (u, o) => { appels.push({ u, o }); return opts.fetch(u, o); } : (u, o) => { appels.push({ u, o }); return Promise.reject(new Error('réseau')); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(origPath, 'utf8'), ctx);
  const V = ctx.window.VuePrimes;
  V.state = { chargement: false, quarter: 'Q2', objectifs: [], nsb: [], prospects: [] };
  let rendus = 0;
  V.render = function () { rendus++; };
  V.init = async function () { this.state = { chargement: false, quarter: 'Q2', objectifs: this.state ? this.state.objectifs : [], nsb: [], prospects: [] }; };
  return { V, ctx, dom, appels, rendus: () => rendus, charger: () => vm.runInContext(fs.readFileSync(extPath, 'utf8'), ctx) };
}
const grille = () => {
  const cas = [];
  for (const pin of [1000, 4001, 4002, 4003, 9999]) for (const q of ['Q1', 'Q2', 'Q3', 'Q4'])
    for (const [ca, obj] of [[0, 0], [0, 1000], [799, 1000], [800, 1000], [999.9, 1000], [1000, 1000], [1199, 1000], [1200, 1000], [2500, 1000]])
      for (const nsb of [0, 4, 5, 7, 8, 11, 12, 15]) for (const emp of [0, 2, 3, 5, 6, 9]) cas.push({ pin, q, ca, obj, nsb, emp });
  return cas;
};
const dates = { Q1: '2026-05-10', Q2: '2026-08-10', Q3: '2026-11-10', Q4: '2027-02-10' };
function etat(c) {
  const o = { PIN_CDS: c.pin }; o[`${c.q}_CA_Realise`] = c.ca; o[`${c.q}_Obj_Initial`] = c.obj;
  const nsb = [];
  for (let i = 0; i < c.nsb; i++) nsb.push({ PIN_CDS: c.pin, Produit: 'NSB', Date: dates[c.q], Valid_Manager: 'OUI' });
  for (let i = 0; i < c.emp; i++) nsb.push({ PIN_CDS: c.pin, Produit: i % 2 ? 'EMPOWER_FLAVIE' : 'EMPOWER_TERRAIN', Date: dates[c.q], Valid_Manager: 'OUI' });
  nsb.push({ PIN_CDS: c.pin, Produit: 'NSB', Date: dates[c.q], Valid_Manager: 'NON' });
  return { chargement: false, quarter: c.q, objectifs: [o], nsb, prospects: [] };
}

/* A. Non-régression : barème par défaut = ancien calcul, sur toute la grille */
{
  const t = charger({ session: null });
  const cas = grille();
  const avant = cas.map(c => { t.V.state = etat(c); return JSON.stringify([t.V.calculer(c.pin, c.q), t.V.bonusManager(c.q), t.V._jaugePaliers(c.ca / (c.obj || 1) * 100)]); });
  const simAvant = [0, 790, 800, 1000, 1200, 3000].map(v => { t.V.state = etat({ pin: 1000, q: 'Q2', ca: 0, obj: 1000, nsb: 0, emp: 0 }); t.V.simuler(v); return t.dom.zone.innerHTML + t.dom.jauge.innerHTML; });
  t.charger();
  const apres = cas.map(c => { t.V.state = etat(c); return JSON.stringify([t.V.calculer(c.pin, c.q), t.V.bonusManager(c.q), t.V._jaugePaliers(c.ca / (c.obj || 1) * 100)]); });
  const simApres = [0, 790, 800, 1000, 1200, 3000].map(v => { t.V.state = etat({ pin: 1000, q: 'Q2', ca: 0, obj: 1000, nsb: 0, emp: 0 }); t.V.simuler(v); return t.dom.zone.innerHTML + t.dom.jauge.innerHTML; });
  eq(avant.length > 1000, true, 'grille large');
  for (let i = 0; i < cas.length; i++) if (avant[i] !== apres[i]) assert.fail('Régression au cas ' + JSON.stringify(cas[i]) + '\n' + avant[i] + '\n' + apres[i]);
  n += cas.length;
  eq(JSON.stringify(simAvant), JSON.stringify(simApres), 'simulateur identique');
  eq(t.V.PLAFOND, 700, 'plafond par défaut');
  eq(t.appels.length, 0, 'aucun appel réseau sans init');
}

/* B. Barème serveur */
const custom = () => ({ a1: { p1: 50, p2: 90, p3: 110, m1: 100, m2: 300, mp3: 50 }, nsb: { m1: 20, m2: 40, s: { T: [2, 4], L: [8, 12], M: [5, 8], J: [5, 8] } }, emp: { s1: 2, s2: 4, m1: 10, m2: 20 }, plafond: 250, bonus: 500 });
const reponse = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const attendre = () => new Promise(r => setTimeout(r, 5));
(async () => {
  {
    const t = charger({ fetch: (u, o) => { const b = JSON.parse(o.body); return reponse(200, { ok: true, configuration: { exercice: 'FY27', trimestre: b.trimestre, revision: b.trimestre === 'Q2' ? 3 : 1, bareme: b.trimestre === 'Q2' ? custom() : { a1: { p1: 80, p2: 100, p3: 120, m1: 200, m2: 400, mp3: 100 }, nsb: { m1: 75, m2: 150, s: { T: [8, 12], L: [8, 12], M: [5, 8], J: [5, 8] } }, emp: { s1: 3, s2: 6, m1: 50, m2: 75 }, plafond: 700, bonus: 300 } } }); } });
    t.charger();
    await t.V.init(); await attendre();
    eq(t.appels.length, 4, '4 trimestres chargés');
    for (const a of t.appels) {
      const b = JSON.parse(a.o.body);
      ok(a.u.endsWith('/functions/v1/primes-baremes'), 'url');
      eq(b.token, 'tok', 'jeton transmis'); eq(b.action, 'get'); eq(b.exercice, 'FY27'); ok(['Q1', 'Q2', 'Q3', 'Q4'].includes(b.trimestre)); ok(!('motdepasse' in b), 'pas de mot de passe');
    }
    eq(t.rendus(), 1, 're-rendu sur la page primes');
    t.V.state = etat({ pin: 1000, q: 'Q2', ca: 1200, obj: 1000, nsb: 4, emp: 4 });
    const r = t.V.calculer(1000, 'Q2');
    eq(r.axe1, 300, 'axe 1 serveur'); eq(r.axe2, 40, 'NSB serveur T [2,4]'); eq(r.axe3, 20, 'Empower serveur'); eq(r.p3, 50, 'P3 serveur');
    eq(r.total, 250 + 50, 'plafond 250 appliqué + P3 hors plafond');
    eq(t.V.PLAFOND, 250, 'plafond dynamique');
    t.V.state = etat({ pin: 9999, q: 'Q2', ca: 1000, obj: 1000, nsb: 5, emp: 0 });
    eq(t.V.calculer(9999, 'Q2').s1, 5, 'seuil NSB inconnu = [5,8]');
    t.V.state = etat({ pin: 1000, q: 'Q1', ca: 1000, obj: 1000, nsb: 0, emp: 0 });
    eq(t.V.calculer(1000, 'Q1').axe1, 400, 'Q1 inchangé');
    t.V.state = etat({ pin: 1000, q: 'Q2', ca: 1000, obj: 1000, nsb: 0, emp: 0 });
    eq(t.V.bonusManager('Q2').montant, 500, 'bonus serveur');
    t.V.simuler(1100); ok(t.dom.zone.innerHTML.includes('350 € de prime Axe 1') && t.dom.zone.innerHTML.includes('dont 50 € P3'), 'simulateur serveur');
    ok(t.V._jaugePaliers(95).includes('90-109%'), 'jauge serveur');
    t.dom.texts = [{ nodeValue: '<80% : 0 € · 80-99% : 200 € · 100-119% : 400 € · ≥120% : 400 € + 100 € bonus P3' }, { nodeValue: '≥2 cmd/Q : 75 € · ≥4 cmd/Q : 150 €' }, { nodeValue: '≥3 comptes/Q : 50 € · ≥6 comptes/Q : 75 €, Seuls' }, { nodeValue: '/ 10 € équipe, +300 €/Q si collectif atteint (max 1\u202f200 €/an)' }, { nodeValue: '+300 €' }];
    t.V.render();
    eq(t.dom.texts[0].nodeValue, '<50% : 0 € · 50-89% : 100 € · 90-109% : 300 € · ≥110% : 300 € + 50 € bonus P3');
    eq(t.dom.texts[1].nodeValue, '≥2 cmd/Q : 20 € · ≥4 cmd/Q : 40 €');
    eq(t.dom.texts[2].nodeValue, '≥2 comptes/Q : 10 € · ≥4 comptes/Q : 20 €, Seuls');
    eq(t.dom.texts[3].nodeValue, '/ 10 € équipe, +500 €/Q si collectif atteint (max 2000 €/an)');
    eq(t.dom.texts[4].nodeValue, '+500 €');
    ok(t.dom.statut.includes('révision 3 (serveur)'), 'statut serveur');
  }
  {
    const t = charger({ chemin: '/comptes', fetch: () => reponse(200, { ok: true, configuration: { revision: 1, bareme: custom() } }) });
    t.charger(); await t.V.init(); await attendre();
    eq(t.rendus(), 0, 'pas de re-rendu hors page primes');
  }
  for (const [nom, f] of [['réseau coupé', () => Promise.reject(new Error('réseau'))], ['403', () => reponse(403, { ok: false, erreur: 'Accès aux primes non autorisé' })], ['barème invalide', () => reponse(200, { ok: true, configuration: { revision: 1, bareme: { a1: {} } } })], ['jeton expiré', () => reponse(401, { ok: false, erreur: 'Session invalide ou expirée' })]]) {
    const t = charger({ fetch: f });
    t.charger(); await t.V.init(); await attendre();
    t.V.state = etat({ pin: 1000, q: 'Q2', ca: 1000, obj: 1000, nsb: 0, emp: 0 });
    eq(t.V.calculer(1000, 'Q2').axe1, 400, 'barème par défaut si ' + nom);
    eq(t.V.PLAFOND, 700, 'plafond par défaut si ' + nom);
    t.V.render();
    ok(t.dom.statut && t.dom.statut.includes('Barème par défaut'), 'statut visible si ' + nom);
  }
  {
    const t = charger({ session: null });
    t.charger(); await t.V.init(); await attendre();
    eq(t.appels.length, 0, 'pas de requête sans session');
    t.V.render(); ok(t.dom.statut.includes('non synchronisé'), 'statut sans session');
  }
  console.log(n + ' contrôles barèmes : OK');
})().catch(e => { console.error(e); process.exit(1); });
