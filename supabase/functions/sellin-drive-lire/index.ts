// sellin-drive-lire v2 (6/11/2026) : lit le Google Sheet Sell In PARTAGÉ PAR LIEN (lecture seule) et renvoie ses lignes.
// Aucun compte de service Google : l'export CSV public (gviz) suffit. Le navigateur n'y accède pas directement (pas de CORS),
// d'où cette fonction. Elle n'écrit rien : l'import reste celui de sync-sellin et sync-sellin-semaines (mêmes contrôles, même purge confirmée).
// Réservée aux sessions ADMIN / CHANNEL_MANAGER. L'identifiant du Sheet est fixe (ci-dessous).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// v2 (6/11/2026) : identifiant fixe. Un ancien secret SELLIN_SHEET_ID pointait vers un autre fichier (« Onglet DATA introuvable »).
const SHEET_ID = '1LyGE0-fdFKNYtIxA143HCjE9SxDF52ux1Ao7YbLzijY'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const jres = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

// gviz renvoie le PREMIER onglet quand le nom n'existe pas : on contrôle donc l'en-tête attendu.
const ONGLET_DATA = { nom: '\u{1F4E5} DATA FY25-FY26-FY27', entete: 'QUARTER' }
const ONGLETS_DETAIL = ['REVENDEURS AU DETAIL Q1', 'REVENDEURS AU DETAIL Q2', 'REVENDEURS AU DETAIL Q3', 'REVENDEURS AU DETAIL Q4']

function parseCsv(txt: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (q) {
      if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

async function lireOnglet(nom: string): Promise<string[][] | null> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nom)}`
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok) return null
  const t = await r.text()
  if (t.trimStart().startsWith('<')) return null // page HTML : Sheet non partagé par lien
  return parseCsv(t)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  try {
    if (req.method !== 'POST') return jres({ ok: false, error: 'Méthode non autorisée' }, 405)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let corps: any = {}
    try { corps = await req.json() } catch { /* corps vide */ }
    const { data: sess } = await sb.rpc('esi_session_info', { p_token: String(corps?.token || '') })
    const su = sess?.[0]
    if (!su || !su.actif || !su.token_expiry || Number(su.token_expiry) < Date.now()) return jres({ ok: false, error: 'Session invalide ou expirée' }, 403)
    if (!['ADMIN', 'CHANNEL_MANAGER'].includes(su.role)) return jres({ ok: false, error: 'Accès réservé aux administrateurs et channel managers' }, 403)

    const data = await lireOnglet(ONGLET_DATA.nom)
    if (!data || data.length < 2 || String(data[0][0]).trim().toUpperCase() !== ONGLET_DATA.entete)
      return jres({ ok: false, error: 'Onglet DATA introuvable : le Google Sheet doit être partagé « toute personne disposant du lien » en lecture.' }, 502)

    const detail: { onglet: string; rows: string[][] }[] = []
    for (const nom of ONGLETS_DETAIL) {
      const rows = await lireOnglet(nom)
      if (rows && rows.length > 1 && /RESELLER NAME/i.test(rows[0].join('|'))) detail.push({ onglet: nom, rows })
    }
    return jres({ ok: true, sheet_id: SHEET_ID, lignes_data: data.length - 1, data, detail })
  } catch (e) {
    return jres({ ok: false, error: (e as Error).message || 'Erreur interne' }, 500)
  }
})
