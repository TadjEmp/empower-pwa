// Fonctions pures du Lot 2 (testables sous Node ≥ 22 avec --experimental-strip-types).

export type Ligne = { reseller: string; norm: string; semaine: number; ca: number; unites: number; commercial: string }
export type Semaine = { reseller: string; norm: string; quarter: string; semaine: number; ca_eur: number; unites: number; commercial_sellin: string }

export function normalizeName(name: string): string {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

// Nombre FR/EN tolérant, y compris montants ≥ 1000 formatés par Excel :
// « 1 234,56 € », « 1.234,56 », « 1,234.56 », « (12,50) » (négatif), « −12,5 », 12.5.
// Règle : si les deux séparateurs sont présents, le DERNIER est la décimale ; si un seul
// virgule → décimale (usage FR) ; un seul point → décimale.
export function nombre(raw: unknown): number {
  if (typeof raw === 'number') return isFinite(raw) ? raw : 0
  let s = String(raw ?? '').replace(/[€\s\u00a0\u202f]/g, '').replace(/\u2212/g, '-')
  if (!s) return 0
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  const ip = s.lastIndexOf('.'), ic = s.lastIndexOf(',')
  if (ip >= 0 && ic >= 0) s = ip > ic ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  else if (ic >= 0) s = s.replace(/,/g, '.')
  const n = parseFloat(s)
  return isFinite(n) ? (neg ? -n : n) : 0
}

// « REVENDEURS AU DETAIL Q2 » + FY 2027 → « Q2FY27 ». null si l'onglet n'est pas un onglet détail.
export function quarterDepuisOnglet(onglet: string, fy: unknown): string | null {
  const m = /REVENDEURS\s+AU\s+DETAIL\s+Q([1-4])\b/i.exec(onglet || '')
  if (!m) return null
  const an = parseInt(String(fy ?? '').trim(), 10)
  if (!isFinite(an)) return null
  return `Q${m[1]}FY${String(an % 100).padStart(2, '0')}`
}

// rows[0] = en-têtes. Colonnes retrouvées PAR NOM (Q1 et Q2 n'ont pas les mêmes colonnes annexes).
export function parseDetail(onglet: string, rows: unknown[][]): { quarter: string; lignes: Ligne[]; ignorees: number } {
  if (!rows || rows.length < 2) throw new Error(`Onglet « ${onglet} » vide`)
  const h = rows[0].map(x => String(x ?? '').trim().toUpperCase())
  const idx = { fy: h.indexOf('FY'), week: h.indexOf('WEEK'), reseller: h.indexOf('RESELLER NAME'),
                units: h.indexOf('UNITS'), valeur: h.indexOf('LOCAL VALUE'), commercial: h.indexOf('COMMERCIAL') }
  for (const [k, v] of Object.entries(idx)) if (v < 0) throw new Error(`Onglet « ${onglet} » : colonne manquante (${k}). En-têtes : ${h.join(', ')}`)
  const quarter = quarterDepuisOnglet(onglet, rows.find((r, i) => i > 0 && r[idx.fy] !== undefined && r[idx.fy] !== '')?.[idx.fy])
  if (!quarter) throw new Error(`Onglet « ${onglet} » : trimestre non déterminable`)
  const lignes: Ligne[] = []
  let ignorees = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const reseller = String(r[idx.reseller] ?? '').trim()
    const semaine = parseInt(String(r[idx.week] ?? '').trim(), 10)   // texte en Q2, entier en Q1
    if (!reseller || !isFinite(semaine) || semaine < 1 || semaine > 14) { if (reseller || r.some(c => c !== '' && c != null)) ignorees++; continue }
    lignes.push({ reseller, norm: normalizeName(reseller), semaine, ca: nombre(r[idx.valeur]), unites: Math.round(nombre(r[idx.units])),
                  commercial: String(r[idx.commercial] ?? '').trim().toUpperCase() })
  }
  return { quarter, lignes, ignorees }
}

// Une ligne par (revendeur, semaine) : CA et unités sommés ; commercial = le plus fréquent.
export function agregerSemaines(quarter: string, lignes: Ligne[]): Semaine[] {
  const map = new Map<string, Semaine & { _c: Map<string, number> }>()
  for (const l of lignes) {
    const k = `${l.norm}|${l.semaine}`
    let s = map.get(k)
    if (!s) { s = { reseller: l.reseller, norm: l.norm, quarter, semaine: l.semaine, ca_eur: 0, unites: 0, commercial_sellin: '', _c: new Map() }; map.set(k, s) }
    s.ca_eur += l.ca; s.unites += l.unites
    if (l.commercial) s._c.set(l.commercial, (s._c.get(l.commercial) || 0) + 1)
  }
  return [...map.values()].map(({ _c, ...s }) => ({
    ...s, ca_eur: Math.round(s.ca_eur * 100) / 100,
    commercial_sellin: [..._c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
  }))
}

// Q2FY27 → 272 ; sert à comparer deux couples (trimestre, semaine) entre eux.
export function ordreQuarter(q: string): number {
  const m = /^Q([1-4])FY(\d{2})$/.exec(q || '')
  return m ? parseInt(m[2], 10) * 10 + parseInt(m[1], 10) : 0
}

// Dernier signal par revendeur : plus grand (trimestre, semaine) avec CA NET > 0.
export function dernierSignal(semaines: Pick<Semaine, 'norm' | 'quarter' | 'semaine' | 'ca_eur' | 'commercial_sellin'>[]) {
  const best = new Map<string, { quarter: string; semaine: number; commercial: string }>()
  for (const s of semaines) {
    if (!(s.ca_eur > 0)) continue
    const cur = best.get(s.norm)
    if (!cur || ordreQuarter(s.quarter) > ordreQuarter(cur.quarter) ||
        (s.quarter === cur.quarter && s.semaine > cur.semaine)) {
      best.set(s.norm, { quarter: s.quarter, semaine: s.semaine, commercial: s.commercial_sellin })
    }
  }
  return best
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

export function estNomProche(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true
  return (1 - levenshtein(a, b) / (Math.max(a.length, b.length) || 1)) >= 0.8
}
