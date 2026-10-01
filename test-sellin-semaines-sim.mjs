// ═══════════════════════════════════════
//  test-sellin-semaines-sim.mjs — Lot 2 : lecture des onglets « REVENDEURS AU DETAIL »,
//  montants, semaines, signal « dernière semaine ».
//  Exécution : node --experimental-strip-types --no-warnings test-sellin-semaines-sim.mjs
// ═══════════════════════════════════════
import { nombre, parseDetail, agregerSemaines, dernierSignal, ordreQuarter, quarterDepuisOnglet, estNomProche, normalizeName }
  from './supabase/functions/sync-sellin-semaines/detail.ts'
let ok = 0, ko = 0
const t = (nom, fn) => { try { fn(); ok++; console.log('  ✅', nom) } catch (e) { ko++; console.log('  ❌', nom, '→', e.message) } }
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`) }
const H = ['FY', 'WEEK', 'RESELLER NAME', 'SKU', 'SKU Description', 'Units', 'Local Value', 'PARTNER TYPE', 'PARTNER NAME', 'COMMERCIAL', 'PRODUCT']
const L = (fy, week, nom, units, val, com = 'JOHANNE') => [fy, week, nom, '1', 'X', units, val, '', '', com, '']

console.log('\nMontants')
t('nombre : formats FR/EN, milliers, négatifs', () => {
  eq([nombre('1 234,56 €'), nombre('1 234,56'), nombre('1.234,56'), nombre('1,234.56'), nombre('34.83'), nombre('12,5'), nombre(133.32)],
     [1234.56, 1234.56, 1234.56, 1234.56, 34.83, 12.5, 133.32])
  eq([nombre('-12,5'), nombre('(12,50)'), nombre('−12,5'), nombre(''), nombre(null), nombre('abc')], [-12.5, -12.5, -12.5, 0, 0, 0])
})
t('les montants d\'un même (revendeur, semaine) sont additionnés au centime', () => {
  const p = parseDetail('REVENDEURS AU DETAIL Q2', [H, L(2027, '12', 'Aci Informatique', 3, '34,83'), L(2027, '12', 'ACI  INFORMATIQUE', 1, '11,61'), L(2027, '11', 'ACI INFORMATIQUE', 2, 20)])
  const a = agregerSemaines(p.quarter, p.lignes)
  eq(a.length, 2); eq(a.find(x => x.semaine === 12).ca_eur, 46.44); eq(a.find(x => x.semaine === 12).unites, 4)
  eq(a.reduce((s, x) => s + x.ca_eur, 0), 66.44, 'total conservé')
})
t('texte formaté (raw:false) et valeurs réelles donnent le même total', () => {
  const reel = parseDetail('REVENDEURS AU DETAIL Q2', [H, L(2027, 1, 'A', 1, 133.32), L(2027, 2, 'B', 1, 25)])
  const txt  = parseDetail('REVENDEURS AU DETAIL Q2', [H, L('2027', '1', 'A', '1', '133.32'), L('2027', '2', 'B', '1', '25')])
  eq(reel.lignes.reduce((s, l) => s + l.ca, 0), txt.lignes.reduce((s, l) => s + l.ca, 0))
})

console.log('\nTrimestre / semaines')
t('trimestre déduit du nom d\'onglet + FY', () => {
  eq(quarterDepuisOnglet('REVENDEURS AU DETAIL Q2', 2027), 'Q2FY27'); eq(quarterDepuisOnglet('REVENDEURS AU DETAIL Q3', '2027'), 'Q3FY27')
  eq(quarterDepuisOnglet('BRUT SELL IN Q2', 2027), null, 'les onglets BRUT sont ignorés')
})
t('WEEK texte (Q2) ou entier (Q1) ; lignes sans semaine valide ignorées et comptées', () => {
  const p = parseDetail('REVENDEURS AU DETAIL Q1', [H, L(2027, 1, 'A', 1, 10), L(2027, '12', 'B', 1, 10), L(2027, '', 'C', 1, 10), L(2027, 'x', 'D', 1, 10), L(2027, 99, 'E', 1, 10)])
  eq(p.lignes.map(l => l.semaine), [1, 12]); eq(p.ignorees, 3)
})
t('colonnes retrouvées par nom (Q1 et Q2 diffèrent) ; colonne manquante → erreur claire', () => {
  const h1 = ['FY', 'WEEK', 'RESELLER NAME', 'SKU', 'SKU Description', 'Units', 'Local Value', 'BOOKINGS NAME', 'PARTNER', 'COMMERCIAL', 'PRODUCT']
  eq(parseDetail('REVENDEURS AU DETAIL Q1', [h1, L(2027, 1, 'A', 1, 10)]).lignes.length, 1)
  let err = ''; try { parseDetail('REVENDEURS AU DETAIL Q2', [['FY', 'WEEK'], [2027, 1]]) } catch (e) { err = e.message }
  if (!/colonne manquante/.test(err)) throw new Error('erreur attendue : ' + err)
})
t('W13 : le cumul remplace W12, le signal avance', () => {
  const w12 = agregerSemaines('Q2FY27', parseDetail('REVENDEURS AU DETAIL Q2', [H, L(2027, 12, 'A', 1, 10)]).lignes)
  const w13 = agregerSemaines('Q2FY27', parseDetail('REVENDEURS AU DETAIL Q2', [H, L(2027, 12, 'A', 1, 10), L(2027, 13, 'A', 1, 5)]).lignes)
  eq(dernierSignal(w12).get('A').semaine, 12); eq(dernierSignal(w13).get('A').semaine, 13)
})

console.log('\nSignal « dernière semaine »')
const S = (q, sem, ca, norm = 'A', com = 'LYES') => ({ norm, quarter: q, semaine: sem, ca_eur: ca, commercial_sellin: com })
t('plus grand (trimestre, semaine) avec CA > 0 ; Q2 S1 > Q1 S12', () => {
  eq(dernierSignal([S('Q1FY27', 12, 10), S('Q2FY27', 1, 10), S('Q2FY27', 5, 10)]).get('A'), { quarter: 'Q2FY27', semaine: 5, commercial: 'LYES' })
  eq(dernierSignal([S('Q1FY27', 12, 10), S('Q2FY27', 1, 10)]).get('A').quarter, 'Q2FY27')
})
t('un avoir ou un CA nul n\'est pas un signal', () => {
  eq(dernierSignal([S('Q2FY27', 3, 10), S('Q2FY27', 9, -5), S('Q2FY27', 10, 0)]).get('A').semaine, 3)
  eq(dernierSignal([S('Q2FY27', 9, -5)]).size, 0)
})
t('passage de FY : Q1FY28 > Q4FY27', () => { eq(ordreQuarter('Q1FY28') > ordreQuarter('Q4FY27'), true) })
t('commercial = signal NON SUIVI conservé', () => { eq(dernierSignal([S('Q2FY27', 2, 10, 'A', 'NON SUIVI')]).get('A').commercial, 'NON SUIVI') })

console.log('\nRapprochement')
t('noms proches proposés, noms éloignés non', () => {
  eq([estNomProche(normalizeName('GRF Informatique'), 'GRF INFORMATIQUE SARL'), estNomProche('SODILUC', 'EXPERT IMBERT')], [true, false])
  eq(normalizeName('  Étab. Caumès '), 'ETAB. CAUMES')
})

console.log(`\n${ko ? '🔴' : '🟢'} ${ok} ✅ passés | ${ko} ❌ échoués\n`)
process.exit(ko ? 1 : 0)
