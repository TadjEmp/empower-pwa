// base-comptes-sync v1 (6/11/2026) : branche l'app sur le Google Sheet « BASE COMPTES ACTIFS - MATCHES ET ENRICHIS ».
//  - action « lire » (ADMIN / CHANNEL_MANAGER) : lit le Sheet partagé par lien (export CSV gviz, lecture seule), met à jour base_comptes,
//    rattache les comptes et complète les champs VIDES des comptes (jamais d'écrasement), via la fonction SQL esi_sync_base_comptes.
//  - action « ajouter_lead » (toute session active) : à la création d'un lead, ajoute la ligne dans base_comptes et, si le webhook
//    Google Apps Script est configuré (secrets BASE_SHEET_WEBHOOK_URL et BASE_SHEET_CLE), l'écrit aussi dans le Sheet. Le lead est relu
//    côté serveur : le navigateur n'envoie que son identifiant.
// Aucun identifiant Google dans l'app : l'écriture passe par un script Apps Script déployé par le propriétaire du Sheet.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SHEET_ID = Deno.env.get('BASE_SHEET_ID') || '1WTX15OZmwNk5MF41MOSWXogCCz_b7Zk-j4UksX2zSvg'
const ONGLET = 'Comptes Actifs Enrichis'
const WEBHOOK = Deno.env.get('BASE_SHEET_WEBHOOK_URL') || ''
const CLE = Deno.env.get('BASE_SHEET_CLE') || ''
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const jres = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

function parseCsv(txt: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

// Colonnes du Sheet (B..L) : commercial, société, type, adresse, code postal, ville, téléphone, e-mail, site web, contact, statut.
// Le CSV gviz peut perdre l'en-tête de certaines colonnes : on lit par position, à partir de la ligne qui suit « Commercial Attribué ».
function lignesBase(csv: string[][]) {
  const i0 = csv.findIndex(r => /commercial/i.test(String(r[1] || '')) && /soci/i.test(String(r[2] || '')))
  if (i0 < 0) return null
  const cp = (v: string) => { const t = String(v || '').trim(); return /^\d{1,5}$/.test(t) ? t.padStart(5, '0') : t }
  const out: Record<string, string>[] = []
  for (const r of csv.slice(i0 + 1)) {
    const nom = String(r[2] || '').trim(); if (!nom) continue
    out.push({ commercial: String(r[1] || '').trim(), nom, type_compte: String(r[3] || '').trim(), adresse: String(r[4] || '').trim(), code_postal: cp(r[5]),
      ville: String(r[6] || '').trim(), tel: String(r[7] || '').trim(), email: String(r[8] || '').trim(), site_web: String(r[9] || '').trim(),
      contact_principal: String(r[10] || '').trim(), statut: String(r[11] || '').trim() })
  }
  return out
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
    const action = String(corps?.action || 'lire')

    if (action === 'lire') {
      if (!['ADMIN', 'CHANNEL_MANAGER'].includes(su.role)) return jres({ ok: false, error: 'Accès réservé aux administrateurs et channel managers' }, 403)
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(ONGLET)}`, { redirect: 'follow' })
      const t = r.ok ? await r.text() : ''
      if (!t || t.trimStart().startsWith('<')) return jres({ ok: false, error: 'Google Sheet illisible : il doit être partagé « toute personne disposant du lien » en lecture.' }, 502)
      const lignes = lignesBase(parseCsv(t))
      if (!lignes || lignes.length < 10) return jres({ ok: false, error: 'Structure du Google Sheet inattendue (en-tête « Commercial Attribué / Société » introuvable ou trop peu de lignes).' }, 502)
      const { data, error } = await sb.rpc('esi_sync_base_comptes', { p_rows: lignes })
      if (error) return jres({ ok: false, error: error.message }, 500)
      return jres({ ok: true, lignes_sheet: lignes.length, ...data })
    }

    if (action === 'ajouter_lead') {
      const { data: lead } = await sb.from('leads').select('id, nom_compte, adresse, code_postal, ville, tel, email, contact_nom, pin_cds_assigne').eq('id_prospect_gas', String(corps?.lead_id || '')).maybeSingle()
      if (!lead || !lead.nom_compte) return jres({ ok: false, error: 'Lead introuvable' }, 404)
      let commercial = 'NON SUIVI'
      if (lead.pin_cds_assigne) {
        const { data: u } = await sb.from('utilisateurs').select('nom').eq('pin', lead.pin_cds_assigne).maybeSingle()
        if (u?.nom) commercial = String(u.nom).trim().split(/\s+/)[0].toUpperCase()
      }
      const ligne = { commercial, nom: String(lead.nom_compte).trim(), type_compte: 'REVENDEUR', adresse: lead.adresse || '', code_postal: lead.code_postal || '', ville: lead.ville || '',
        tel: lead.tel || '', email: lead.email || '', site_web: '', contact_principal: lead.contact_nom || '', statut: 'A COMPLETER' }
      const { data, error } = await sb.rpc('esi_sync_base_comptes', { p_rows: [ligne] })
      if (error) return jres({ ok: false, error: error.message }, 500)
      let ecrit = false, raison = ''
      if (!WEBHOOK || !CLE) raison = 'Écriture dans le Google Sheet non configurée (webhook Apps Script absent)'
      else {
        try {
          const w = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ cle: CLE, action: 'ajouter', ligne }), redirect: 'follow' })
          const j = await w.json().catch(() => ({}))
          ecrit = !!j.ok; raison = ecrit ? (j.deja ? 'Déjà présent dans le Sheet' : '') : (j.error || `Webhook HTTP ${w.status}`)
        } catch (e) { raison = (e as Error).message }
      }
      return jres({ ok: true, base: data, ecrit, raison })
    }
    return jres({ ok: false, error: 'Action inconnue' }, 400)
  } catch (e) {
    return jres({ ok: false, error: (e as Error).message || 'Erreur interne' }, 500)
  }
})
