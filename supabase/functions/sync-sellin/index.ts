// sync-sellin v12 — verify_jwt: false
// v11 : accepte des lignes envoyées par le navigateur (POST { rows: string[][] }, header en rows[0]),
//       repli Google Sheets sans `rows`. Agrégation Q1→Q4 FY27.
// v13 : alias manuels (sellin_alias) + CUMUL par compte (deux noms vers un même compte s'additionnent).
// v12 (10/2026) — CORRECTION DU CA EXISTANT :
//  - clé de regroupement INSENSIBLE à la casse/accents/espaces (normalizeName). Avant : « infotech26 » et
//    « INFOTECH26 » étaient deux revendeurs → CA compté deux fois, et le dernier pivot écrasait les comptes.
//  - PURGE : le fichier est la source complète (historique FY25→FY27). Les lignes `sellin` des trimestres
//    présents dans le fichier qui n'y figurent plus (ou qui sont des variantes de casse) sont supprimées ;
//    idem `sellin_agregats` pour les revendeurs absents du fichier. Les trimestres absents du fichier ne sont pas touchés.
//  - `dry_run: true` : calcule et renvoie le plan (suppressions, rapprochements) sans rien écrire.
//  - Contrôle : totaux par trimestre renvoyés (ca_par_trimestre) pour comparaison avec le fichier.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SELLIN_SHEET_ID = '1ppi2pJihOaDLXApSfSuHJVSCCvevHPTQaotyr40unT0'
const GOOGLE_SA_KEY = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')

const FY27_QUARTERS = ['Q1FY27', 'Q2FY27', 'Q3FY27', 'Q4FY27'] as const
const CORS = { 'Access-Control-Allow-Origin': '*' }
const jres = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

async function getGoogleAccessToken(saKeyJson: string): Promise<string> {
  const sa = JSON.parse(saKeyJson)
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
  const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const header = { alg: 'RS256', typ: 'JWT' }
  const signingInput = `${enc(header)}.${enc(payload)}`
  const pemKey = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\n/g, '')
  const keyDer = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const jwt = `${signingInput}.${sigB64}`
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Google auth failed: ${JSON.stringify(json)}`)
  return json.access_token
}

async function readSellInSheet(token: string, sheetId: string): Promise<{ rows: string[][]; sheetName: string }> {
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`, { headers: { Authorization: `Bearer ${token}` } })
  const meta = await metaRes.json()
  if (!metaRes.ok) throw new Error(`Sheet meta failed (${metaRes.status}): ${JSON.stringify(meta)}`)
  const sheets = meta.sheets || []
  const dataSheet = sheets.find((s: { properties: { title: string } }) => s.properties.title.includes('DATA FY') || s.properties.title.includes('\u{1F4E5}'))
  const sheetName = dataSheet?.properties?.title || '\u{1F4E5} DATA FY25-FY26-FY27'
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}?majorDimension=ROWS`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const json = await res.json()
  if (!json.values) throw new Error(`Sheet read failed: ${JSON.stringify(json)}`)
  return { rows: json.values as string[][], sheetName }
}

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Nombre FR/EN tolérant (« 1 234,56 € », « 1.234,56 », « 1,234.56 », « (12,50) », « −12,5 »).
function cleanNumber(raw: unknown): number {
  if (typeof raw === 'number') return isFinite(raw) ? raw : 0
  let s = String(raw ?? '').replace(/[€\s  ]/g, '').replace(/−/g, '-')
  if (!s) return 0
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  const ip = s.lastIndexOf('.'), ic = s.lastIndexOf(',')
  if (ip >= 0 && ic >= 0) s = ip > ic ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  else if (ic >= 0) s = s.replace(/,/g, '.')
  const n = parseFloat(s)
  return isFinite(n) ? (neg ? -n : n) : 0
}

function calcFlag(caFy25: number, caFy26: number, caFy27ByQuarter: Record<string, number>): string {
  const caFy27Total = Object.values(caFy27ByQuarter).reduce((s, v) => s + v, 0)
  if (caFy27Total > 0) return 'ACTIF'
  if (caFy26 > 0) return 'REACTIVER'
  if (caFy25 > 0) return 'CHURN'
  return 'INACTIF'
}

function getCurrentWeekLabel(): string {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
  return `W${weekNum}-${now.getFullYear()}`
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}
function estNomProche(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true
  return (1 - levenshtein(a, b) / (Math.max(a.length, b.length) || 1)) >= 0.8
}

// PostgREST plafonne à 1000 lignes par requête : lecture paginée.
async function lireTout(supabase: any, table: string, colonnes: string): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(colonnes).order('id').range(from, from + 999)
    if (error) throw new Error(`lecture ${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

Deno.serve(async (req) => {
  const startTime = Date.now()
  const semaine = getCurrentWeekLabel()
  if (req.method === 'OPTIONS') return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } })

  try {
    if (req.method !== 'POST' && req.method !== 'GET') return jres({ error: 'Method not allowed' }, 405)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    let rows: string[][]
    let sourceLabel: string
    let bodyRows: string[][] | null = null
    let dryRun = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (Array.isArray(body?.rows) && body.rows.length > 1) bodyRows = body.rows
        dryRun = !!body?.dry_run
      } catch { /* body vide/non-JSON → repli Sheets */ }
    }
    if (bodyRows) {
      rows = bodyRows
      sourceLabel = 'upload navigateur'
    } else {
      if (!GOOGLE_SA_KEY) return jres({ ok: false, error: 'GOOGLE_SERVICE_ACCOUNT_KEY manquant (et aucun fichier envoyé)' }, 400)
      const token = await getGoogleAccessToken(GOOGLE_SA_KEY)
      const read = await readSellInSheet(token, SELLIN_SHEET_ID)
      rows = read.rows
      sourceLabel = `Google Sheet (${read.sheetName})`
    }
    if (rows.length < 2) return jres({ ok: false, error: 'Données Sell-In vides' }, 404)

    const headers = rows[0].map(h => (h || '').trim().toUpperCase())
    const colIdx = { quarter: headers.indexOf('QUARTER'), reseller: headers.indexOf('RESELLER'), channel: headers.indexOf('CHANNEL'), caEur: headers.indexOf('CA_EUR') }
    if (colIdx.quarter < 0 || colIdx.reseller < 0 || colIdx.caEur < 0) throw new Error(`Colonnes manquantes. Headers: ${headers.join(', ')}`)

    // ── Pivot : clé = nom NORMALISÉ ; `display` = 1ʳᵉ graphie rencontrée dans le fichier ──
    type ResellerData = { display: string; byQuarter: Record<string, number>; channel: string }
    const pivot: Record<string, ResellerData> = {}
    const fileQuarters = new Set<string>()
    const caParTrimestre: Record<string, number> = {}
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const quarter = (row[colIdx.quarter] || '').toString().trim().toUpperCase()
      const reseller = (row[colIdx.reseller] || '').toString().trim()
      const channel = colIdx.channel >= 0 ? (row[colIdx.channel] || 'REVENDEUR').toString().trim() : 'REVENDEUR'
      const ca = cleanNumber(row[colIdx.caEur])
      if (!reseller || !quarter || ca === 0) continue
      const norm = normalizeName(reseller)
      if (!norm) continue
      if (!pivot[norm]) pivot[norm] = { display: reseller, byQuarter: {}, channel }
      pivot[norm].byQuarter[quarter] = (pivot[norm].byQuarter[quarter] || 0) + ca
      fileQuarters.add(quarter)
      caParTrimestre[quarter] = (caParTrimestre[quarter] || 0) + ca
    }

    type AggRow = { norm: string; reseller: string; canal: string; caFy25: number; caFy26: number; caFy27ByQuarter: Record<string, number>; flagBrut: string }
    const agregats: AggRow[] = []
    const sellinRows: Array<{ reseller: string; quarter: string; ca_eur: number; canal: string; semaine_sync: string }> = []
    const fileKeys = new Set<string>()          // `${reseller}|${quarter}` exacts écrits
    for (const [norm, data] of Object.entries(pivot)) {
      let caFy25 = 0, caFy26 = 0
      const caFy27ByQuarter: Record<string, number> = {}
      for (const [quarter, ca] of Object.entries(data.byQuarter)) {
        sellinRows.push({ reseller: data.display, quarter, ca_eur: Math.round(ca * 100) / 100, canal: data.channel, semaine_sync: semaine })
        fileKeys.add(`${data.display}|${quarter}`)
        if (quarter.includes('FY25')) caFy25 += ca
        else if (quarter.includes('FY26')) caFy26 += ca
        else if ((FY27_QUARTERS as readonly string[]).includes(quarter)) caFy27ByQuarter[quarter] = (caFy27ByQuarter[quarter] || 0) + ca
      }
      agregats.push({
        norm, reseller: data.display, canal: data.channel,
        caFy25: Math.round(caFy25 * 100) / 100, caFy26: Math.round(caFy26 * 100) / 100, caFy27ByQuarter,
        flagBrut: calcFlag(caFy25, caFy26, caFy27ByQuarter),
      })
    }

    // ── Plan de purge (lecture seule) ──
    const sellinExistant = await lireTout(supabase, 'sellin', 'id,reseller,quarter,ca_eur')
    const purgeSellin = sellinExistant.filter(r => fileQuarters.has(String(r.quarter).toUpperCase()) && !fileKeys.has(`${r.reseller}|${r.quarter}`))
    const displays = new Set(agregats.map(a => a.reseller))
    const agregatsExistants = await lireTout(supabase, 'sellin_agregats', 'id,reseller')
    const purgeAgregats = agregatsExistants.filter(r => !displays.has(r.reseller))
    const round2 = (n: number) => Math.round(n * 100) / 100
    const planPurge = {
      sellin: purgeSellin.length, sellin_ca: round2(purgeSellin.reduce((s, r) => s + Number(r.ca_eur || 0), 0)),
      sellin_detail: purgeSellin.slice(0, 40).map(r => `${r.reseller}|${r.quarter}=${r.ca_eur}`),
      agregats: purgeAgregats.length, agregats_detail: purgeAgregats.slice(0, 40).map(r => r.reseller),
    }

    // ── Rapprochement comptes (nom normalisé exact ; quasi-doublon → à valider ; sinon création non attribuée) ──
    const comptesList = await lireTout(supabase, 'comptes', 'id,nom_compte,deleted')
    const compteMap = new Map<string, string>()
    for (const c of comptesList) if (!c.deleted) compteMap.set(normalizeName(c.nom_compte || ''), c.id)

    if (dryRun) {
      const aCreer = agregats.filter(a => !compteMap.has(a.norm) && ![...compteMap.keys()].some(n => estNomProche(a.norm, n))).map(a => a.reseller)
      const quasi = agregats.filter(a => !compteMap.has(a.norm) && [...compteMap.keys()].some(n => estNomProche(a.norm, n))).map(a => a.reseller)
      return jres({ ok: true, dry_run: true, source: sourceLabel, revendeurs: agregats.length, lignes_sellin: sellinRows.length,
        ca_par_trimestre: Object.fromEntries(Object.entries(caParTrimestre).sort().map(([q, v]) => [q, round2(v)])),
        purge: planPurge, comptes_existants_rapproches: agregats.filter(a => compteMap.has(a.norm)).length, comptes_a_creer: aCreer, quasi_doublons: quasi })
    }

    // ── Écritures : upsert d'abord, purge ensuite (jamais de perte si l'écriture échoue en route) ──
    const BATCH = 200
    let totalSellinUpserted = 0
    for (let i = 0; i < sellinRows.length; i += BATCH) {
      const { error } = await supabase.from('sellin').upsert(sellinRows.slice(i, i + BATCH), { onConflict: 'reseller,quarter' })
      if (error) throw new Error(`sellin upsert: ${error.message}`)
      totalSellinUpserted += Math.min(BATCH, sellinRows.length - i)
    }
    for (let i = 0; i < purgeSellin.length; i += BATCH) {
      const { error } = await supabase.from('sellin').delete().in('id', purgeSellin.slice(i, i + BATCH).map(r => r.id))
      if (error) throw new Error(`sellin purge: ${error.message}`)
    }

    const { error: aggErr } = await supabase.from('sellin_agregats').upsert(agregats.map(a => ({
      reseller: a.reseller, canal: a.canal, ca_fy25: a.caFy25, ca_fy26: a.caFy26,
      ca_q1fy27: round2(a.caFy27ByQuarter['Q1FY27'] || 0), ca_q2fy27: round2(a.caFy27ByQuarter['Q2FY27'] || 0),
      ca_q3fy27: round2(a.caFy27ByQuarter['Q3FY27'] || 0), ca_q4fy27: round2(a.caFy27ByQuarter['Q4FY27'] || 0),
      flag_brut: a.flagBrut, semaine_sync: semaine, updated_at: new Date().toISOString(),
    })), { onConflict: 'reseller' })
    if (aggErr) throw new Error(`sellin_agregats upsert: ${aggErr.message}`)
    for (let i = 0; i < purgeAgregats.length; i += BATCH) {
      const { error } = await supabase.from('sellin_agregats').delete().in('id', purgeAgregats.slice(i, i + BATCH).map(r => r.id))
      if (error) throw new Error(`sellin_agregats purge: ${error.message}`)
    }

    // ── Alias manuels (sellin_alias, nom normalisé « simple » = majuscules/espaces) : ex. « GRF Informatique » → « GRF INFORMATIQUE SARL » ──
    const normAlias = (n: string) => String(n ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
    const { data: aliasRows } = await supabase.from('sellin_alias').select('nom_norm,compte_id')
    const aliasMap = new Map<string, string>((aliasRows || []).map((a: any) => [a.nom_norm, a.compte_id]))

    // ── 1) Résolution revendeur → compte ; 2) CUMUL par compte (deux noms vers un même compte = SOMME, jamais écrasement) ──
    type NonMatch = { reseller: string; raison: string; candidats?: string[] }
    const nonMatcher: NonMatch[] = []
    const comptesCrees: string[] = []
    type Cumul = { caFy25: number; caFy26: number; q: Record<string, number>; aggs: AggRow[] }
    const parCompte = new Map<string, Cumul>()
    const cumuler = (id: string, agg: AggRow) => {
      const c = parCompte.get(id) || { caFy25: 0, caFy26: 0, q: {}, aggs: [] }
      c.caFy25 += agg.caFy25; c.caFy26 += agg.caFy26
      for (const [q, v] of Object.entries(agg.caFy27ByQuarter)) c.q[q] = (c.q[q] || 0) + v
      c.aggs.push(agg); parCompte.set(id, c)
    }
    for (const agg of agregats) {
      const existant = compteMap.get(agg.norm) || aliasMap.get(normAlias(agg.reseller))
      if (existant) { cumuler(existant, agg); continue }
      const candidats = [...compteMap.entries()].filter(([nom]) => estNomProche(agg.norm, nom)).map(([, id]) => id)
      if (candidats.length) { nonMatcher.push({ reseller: agg.reseller, raison: 'QUASI_DOUBLON', candidats }); continue }
      const { data: nouveau, error: insErr } = await supabase.from('comptes').insert({
        nom_compte: agg.reseller, canal: agg.canal, pin_cds_assigne: null, source_import: 'SYNC_SELLIN',
      }).select('id').single()
      if (insErr || !nouveau) { nonMatcher.push({ reseller: agg.reseller, raison: 'ERREUR_CREATION: ' + (insErr?.message || 'inconnue') }); continue }
      compteMap.set(agg.norm, nouveau.id)
      comptesCrees.push(agg.reseller)
      cumuler(nouveau.id, agg)
    }
    let comptesMaj = 0
    for (const [compteId, c] of parCompte) {
      const majCA = {
        ca_fy25: round2(c.caFy25), ca_fy26: round2(c.caFy26),
        ca_q1fy27: round2(c.q['Q1FY27'] || 0), ca_q2fy27: round2(c.q['Q2FY27'] || 0),
        ca_q3fy27: round2(c.q['Q3FY27'] || 0), ca_q4fy27: round2(c.q['Q4FY27'] || 0),
        statut_compte: calcFlag(c.caFy25, c.caFy26, c.q), date_sync_sellin: new Date().toISOString(), semaine_sync: semaine,
      }
      const { error: cErr } = await supabase.from('comptes').update(majCA).eq('id', compteId)
      if (cErr) { nonMatcher.push({ reseller: c.aggs.map(a => a.reseller).join(' + '), raison: 'ERREUR_MAJ: ' + cErr.message }); continue }
      comptesMaj++
      for (const a of c.aggs) await supabase.from('sellin_agregats').update({ compte_id: compteId }).eq('reseller', a.reseller)
    }

    if (comptesCrees.length || nonMatcher.length) {
      const { data: destinataires } = await supabase.from('utilisateurs').select('pin').eq('actif', true).in('role', ['ADMIN', 'CHANNEL_MANAGER'])
      const messages: string[] = []
      if (comptesCrees.length) messages.push(`🏢 ${comptesCrees.length} nouveau(x) compte(s) créé(s) via Sell-In, non attribué(s) — à attribuer à un CDS`)
      if (nonMatcher.filter(n => n.raison === 'QUASI_DOUBLON').length) messages.push(`⚠️ ${nonMatcher.filter(n => n.raison === 'QUASI_DOUBLON').length} revendeur(s) Sell-In ressemblent à un compte existant — à valider manuellement`)
      const message = messages.join(' · ')
      const notifRows = (destinataires || []).map((u: any) => ({
        id_notif_gas: `NOTIF_${Date.now()}_${u.pin}`, date_envoi: new Date().toISOString(), pin_destinataire: u.pin,
        type_notif: 'SYNC_SELLIN_COMPTES', message, id_cible: null, statut_lu: false,
      }))
      if (notifRows.length) await supabase.from('notifs').insert(notifRows)
    }

    const result = {
      ok: true, semaine, source: sourceLabel, revendeurs: agregats.length, lignes_sellin: totalSellinUpserted,
      comptes_maj: comptesMaj, comptes_crees: comptesCrees.length, ca_par_cds: {} as Record<string, Record<string, number>>,
      ca_par_trimestre: Object.fromEntries(Object.entries(caParTrimestre).sort().map(([q, v]) => [q, round2(v)])),
      purge: { sellin: purgeSellin.length, sellin_ca: planPurge.sellin_ca, agregats: purgeAgregats.length },
      nonMatcher, duree_ms: Date.now() - startTime,
      message: `Sync OK (${sourceLabel}) — ${agregats.length} revendeurs · ${comptesMaj} comptes MAJ · ${comptesCrees.length} créé(s) · ${nonMatcher.length} à valider · ${purgeSellin.length} ligne(s) obsolète(s) purgée(s) — ${semaine}`,
    }

    const { data: objectifs } = await supabase.from('objectifs_primes').select('id, pin_cds')
    const caPinResults: Record<string, Record<string, number>> = {}
    for (const obj of objectifs || []) {
      const pin = Number(obj.pin_cds)
      const { data: caData } = await supabase.from('comptes').select('ca_q1fy27, ca_q2fy27, ca_q3fy27, ca_q4fy27').eq('pin_cds_assigne', pin)
      const totals = { q1: 0, q2: 0, q3: 0, q4: 0 }
      for (const c of caData || []) {
        totals.q1 += Number(c.ca_q1fy27) || 0; totals.q2 += Number(c.ca_q2fy27) || 0
        totals.q3 += Number(c.ca_q3fy27) || 0; totals.q4 += Number(c.ca_q4fy27) || 0
      }
      caPinResults[String(pin)] = { q1: round2(totals.q1), q2: round2(totals.q2), q3: round2(totals.q3), q4: round2(totals.q4) }
      await supabase.from('objectifs_primes').update({
        q1_ca_realise: caPinResults[String(pin)].q1, q2_ca_realise: caPinResults[String(pin)].q2,
        q3_ca_realise: caPinResults[String(pin)].q3, q4_ca_realise: caPinResults[String(pin)].q4,
      }).eq('id', obj.id)
    }
    result.ca_par_cds = caPinResults

    await supabase.from('params').upsert([
      { parametre: 'DATE_SYNC_SELLIN', valeur: new Date().toISOString(), description: 'Dernière sync Sell-In' },
      { parametre: 'SEMAINE_SYNC', valeur: semaine, description: 'Dernière semaine synchronisée' },
      { parametre: 'COMPTES_MAJ', valeur: String(comptesMaj), description: 'Nb comptes mis à jour' },
      { parametre: 'REVENDEURS_SYNC', valeur: String(agregats.length), description: 'Nb revendeurs Sell-In' },
      { parametre: 'SELLIN_SOURCE', valeur: sourceLabel, description: 'Source de la dernière sync Sell-In' },
    ], { onConflict: 'parametre' })

    return jres(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync-sellin ERROR:', message)
    return jres({ ok: false, error: message }, 500)
  }
})
