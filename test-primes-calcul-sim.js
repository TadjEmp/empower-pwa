/* Lot 4 : tests chiffrés du calcul des primes FY27 (règles du plan D3). node test-primes-calcul-sim.js */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

function charger() {
  const ctx = {
    document: { getElementById: () => null, createTreeWalker: () => ({ nextNode: () => null }) },
    location: { pathname: '/primes', hash: '' }, Session: { token: null, estCDS: () => false, pin: 1000 },
    SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON: 'a', parseCA: v => Number(v) || 0, fmtCA: v => String(v),
    console, setTimeout, clearTimeout, AbortController, fetch: () => Promise.reject(new Error('réseau')),
  };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/vue-primes.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('js/primes-baremes.js', 'utf8'), ctx);
  return ctx.VuePrimes;
}
const V = charger();
const nsb = (pin, k, produit = 'NSB', date = '2026-05-10') => Array.from({ length: k }, () => ({ PIN_CDS: pin, Produit: produit, Valid_Manager: 'OUI', Date: date }));
const calc = (pin, { ca = 0, obj = 100000, nsbValid = 0, emp = 0 } = {}) => {
  V.state = {
    objectifs: [{ PIN_CDS: pin, Q1_CA_Realise: ca, Q1_Obj_Revise: obj }],
    nsb: [...nsb(pin, nsbValid), ...nsb(pin, emp, 'EMPOWER_TERRAIN')], prospects: [], quarter: 'Q1',
  };
  return V.calculer(pin, 'Q1');
};

// AXE 1 : <80 % : 0 · 80-99 % : 200 · 100-119 % : 400 · ≥120 % : 400 + 100 (P3 hors plafond)
for (const [ca, axe1, p3] of [[0, 0, 0], [79999, 0, 0], [80000, 200, 0], [99999, 200, 0], [100000, 400, 0], [119999, 400, 0], [120000, 400, 100], [250000, 400, 100]]) {
  const r = calc(4002, { ca }); eq([r.axe1, r.p3, r.total], [axe1, p3, axe1 + p3], `axe1 ca=${ca}`);
}
// objectif nul : jamais de prime (pas de division par zéro)
eq(calc(4002, { ca: 50000, obj: 0 }).total, 0, 'objectif nul');
// AXE 2 : seuils par commercial. Mehdi/Johanne 5 et 8 · Tadjidine/Lyes 8 et 12 ; 75 puis 150
for (const [pin, k, axe2] of [[4002, 4, 0], [4002, 5, 75], [4002, 7, 75], [4002, 8, 150], [4003, 5, 75], [1000, 7, 0], [1000, 8, 75], [1000, 11, 75], [1000, 12, 150], [4001, 12, 150]]) {
  eq(calc(pin, { nsbValid: k }).axe2, axe2, `axe2 pin=${pin} nsb=${k}`);
}
// NSB non validées : ne comptent pas
V.state = { objectifs: [], nsb: Array.from({ length: 9 }, () => ({ PIN_CDS: 4002, Produit: 'NSB', Valid_Manager: 'NON', Date: '2026-05-10' })), prospects: [], quarter: 'Q1' };
const att = V.calculer(4002, 'Q1'); eq([att.axe2, att.nsbValid, att.nsbAttente], [0, 0, 9], 'NSB non validées');
// NSB hors trimestre : ne comptent pas
V.state = { objectifs: [], nsb: nsb(4002, 9, 'NSB', '2026-08-10'), prospects: [], quarter: 'Q1' };
eq(V.calculer(4002, 'Q1').axe2, 0, 'NSB hors trimestre');
// AXE 3 : Empower intégrés ≥3 : 50 · ≥6 : 75
for (const [k, axe3] of [[2, 0], [3, 50], [5, 50], [6, 75], [9, 75]]) eq(calc(4002, { emp: k }).axe3, axe3, `axe3 emp=${k}`);
// Cumul maximum : 400 + 150 + 75 = 625 sous le plafond 700, puis P3 100 hors plafond = 725
eq(calc(4002, { ca: 130000, nsbValid: 8, emp: 6 }).total, 725, 'cumul maximum');
eq(calc(4002, { ca: 85000, nsbValid: 5, emp: 3 }).total, 200 + 75 + 50, 'cumul intermédiaire');
eq(V.PLAFOND, 700, 'plafond par défaut');
// Bonus manager : +300 si le collectif atteint l'objectif cumulé
V.state = { objectifs: [{ PIN_CDS: 1000, Q1_CA_Realise: 60000, Q1_Obj_Revise: 50000 }, { PIN_CDS: 4001, Q1_CA_Realise: 40000, Q1_Obj_Revise: 50000 }], nsb: [], prospects: [], quarter: 'Q1' };
eq(V.bonusManager('Q1').montant, 300, 'bonus atteint (100 000 / 100 000)');
V.state.objectifs[1].Q1_CA_Realise = 39999; eq(V.bonusManager('Q1').montant, 0, 'bonus non atteint');
V.state.objectifs = []; eq(V.bonusManager('Q1').montant, 0, 'bonus sans objectif');
console.log(`${n} contrôles calcul des primes : OK`);
