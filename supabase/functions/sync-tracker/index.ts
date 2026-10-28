// sync-tracker v7 — v6 (fix source_import→origine + CDS nom→pin + Actif→statut) + authentification (10/2026) :
// session ADMIN ou CHANNEL_MANAGER obligatoire (la v6 n'en exigeait aucune : n'importe qui pouvait relancer
// l'import et réécrire les statuts des leads depuis le classeur).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TRACKER_SHEET_ID = Deno.env.get('TRACKER_SHEET_ID') || '1MTXhJkWMSDtOW-5vhC5uCyE6S8cnHzel3IC9g5fEkjY'
const GOOGLE_SA_KEY = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
const CORS = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization' }

// CDS nom → PIN
const CDS_PIN: Record<string,number> = {
  'tadjidine':1000,'lyes':4001,'mehdi':4002,'johanne':4003,'alexandra':5000,'flavie':5001
}

async function getGoogleToken(saKeyJson: string): Promise<string> {
  const sa = JSON.parse(saKeyJson)
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
  const si = `${enc({alg:'RS256',typ:'JWT'})}.${enc(payload)}`
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g,'').replace(/\n/g,'')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign'])
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(si))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
  const r = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${si}.${sig}` })
  const j = await r.json()
  if (!j.access_token) throw new Error(`Google auth: ${JSON.stringify(j)}`)
  return j.access_token
}

function norm(s: string) { return s.normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'') }

function mapCol(h: string): string | null {
  const n = norm(h)
  const MAP: Record<string,string> = {
    'REVENDEUR':'nom_compte','NOM_COMPTE':'nom_compte','NOM':'nom_compte','ENSEIGNE':'nom_compte','COMPTE':'nom_compte','NOM_REVENDEUR':'nom_compte',
    'ID_PROSPECT':'id_prospect_gas','ID_PROSPECT_GAS':'id_prospect_gas',
    'VILLE':'ville','CODE_POSTAL':'code_postal','CP':'code_postal','DEPARTEMENT':'departement','DEPT':'departement',
    'TEL':'tel','TELEPHONE':'tel','EMAIL':'email','MAIL':'email',
    'CANAL':'canal','CHANNEL':'canal','CANAL_D_ENVOI_PACK':'canal',
    'SECTEUR':'secteur','TYPE_REVENDEUR':'secteur','TYPE':'secteur','SEGMENT':'secteur',
    'CDS':'nom_cds','NOM_CDS':'nom_cds','COMMERCIAL':'nom_cds','RESPONSABLE':'nom_cds',
    'ORIGINE':'origine','SOURCE':'origine',
    'ACTIF':'statut','STATUT':'statut','STATUT_EMPOWER':'statut',
    'POTENTIEL':'potentiel','POTENTIAL':'potentiel',
    'NOTE':'note','NOTES':'note','COMMENTAIRE':'note','BLOCAGE':'note',
    'WELCOME_PACK_ENVOYE':'welcome_pack_envoye','WELCOME_PACK':'welcome_pack_envoye',
    'DATE_ENVOI_WELCOME_PACK':'welcome_pack_date','WELCOME_PACK_DATE':'welcome_pack_date','DATE_PACK':'welcome_pack_date',
    'DATE_PROCHAINE_ACTION':'date_relance','PROCHAINE_ACTION':'date_relance','DATE_PROCHAINE_ACTION_2':'date_relance',
    'DATE_SAISIE':'date_saisie','DATE_IMPORT':'date_saisie','DATE_CREATION':'date_saisie','DATE':'date_saisie',
    'FLAG_ACTION':'flag_alerte','FLAG_ALERTE':'flag_alerte','ALERTE':'flag_alerte',
    'ID_COMPTE':'id_compte_gas',
  }
  return MAP[n] || null
}

// Normalise le statut depuis le champ 'Actif' du sheet
function normaliserStatut(val: string): string {
  const v = val.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  if (v.includes('integr')) return 'INTEGRE'
  if (v.includes('cree') || v.includes('crée') || v.includes('compte')) return 'COMPTE_CREE'
  if (v.includes('cours')) return 'EN_COURS'
  if (v.includes('actif')) return 'EN_COURS'
  if (v.includes('assigne') || v.includes('assigné')) return 'ASSIGNE'
  if (v.includes('archive') || v.includes('archivé')) return 'ARCHIVE'
  return 'SAISIE'
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const nonEmpty = rows[i].filter(c => c && c.trim()).length
    if (nonEmpty >= 3) return i
  }
  return 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const h = { ...CORS, 'Content-Type': 'application/json' }

  // ── Authentification : session ADMIN ou CHANNEL_MANAGER (jeton dans le corps JSON) ──
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  let corps: any = {}
  if (req.method === 'POST') { try { corps = await req.json() } catch { /* corps vide */ } }
  const { data: sess } = await supabase.rpc('esi_session_info', { p_token: String(corps?.token || '') })
  const su = sess?.[0]
  if (!su || !su.actif || !su.token_expiry || Number(su.token_expiry) < Date.now())
    return new Response(JSON.stringify({ ok:false, error:'Session invalide ou expirée' }), { status:403, headers:h })
  if (!['ADMIN', 'CHANNEL_MANAGER'].includes(su.role))
    return new Response(JSON.stringify({ ok:false, error:'Accès réservé aux administrateurs et channel managers' }), { status:403, headers:h })

  if (!GOOGLE_SA_KEY) return new Response(JSON.stringify({ ok:false, error:'GOOGLE_SERVICE_ACCOUNT_KEY manquant' }), { status:400, headers:h })

  try {
    const token = await getGoogleToken(GOOGLE_SA_KEY)

    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${TRACKER_SHEET_ID}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${token}` } })
    const metaJson = await metaRes.json()
    if (!metaRes.ok || !metaJson.sheets) return new Response(JSON.stringify({ ok:false, google_status:metaRes.status, google_error:metaJson?.error?.message }), { status:403, headers:h })

    const tabs: string[] = metaJson.sheets.map((s: {properties:{title:string}}) => s.properties.title)
    const tabName = tabs.find(t => /saisie/i.test(t)) || tabs[0]

    const dataRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${TRACKER_SHEET_ID}/values/${encodeURIComponent(tabName)}?majorDimension=ROWS`, { headers: { Authorization: `Bearer ${token}` } })
    const dataJson = await dataRes.json()
    if (!dataRes.ok || !dataJson.values) throw new Error(`Lecture '${tabName}': ${JSON.stringify(dataJson)}`)

    const rows: string[][] = dataJson.values
    if (rows.length < 2) return new Response(JSON.stringify({ ok:false, error:`Onglet '${tabName}' vide` }), { status:404, headers:h })

    const headerRowIdx = findHeaderRow(rows)
    const hdrs = rows[headerRowIdx]
    const colMap = hdrs.map(hd => mapCol(hd))
    const dataRows = rows.slice(headerRowIdx + 1)

    const toUpsert: Record<string,unknown>[] = []
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rec: Record<string,unknown> = { origine: 'ESI_TRACKER', updated_at: new Date().toISOString() }
      for (let c = 0; c < colMap.length; c++) {
        const dbCol = colMap[c]; if (!dbCol) continue
        const val = (row[c] || '').trim(); if (!val) continue
        if (dbCol === 'nom_cds') {
          rec.nom_cds = val
          // Résoudre PIN depuis le nom du CDS
          const pin = CDS_PIN[val.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()]
          if (pin) rec.pin_cds_assigne = pin
        } else if (dbCol === 'statut') {
          rec.statut = normaliserStatut(val)
        } else if (dbCol === 'welcome_pack_envoye') {
          rec.welcome_pack_envoye = ['TRUE','OUI','1','YES','OUI'].includes(val.toUpperCase())
        } else if (['date_relance','date_saisie','welcome_pack_date'].includes(dbCol)) {
          const d = new Date(val); if (!isNaN(d.getTime())) rec[dbCol] = d.toISOString()
        } else {
          rec[dbCol] = val
        }
      }
      if (!rec.nom_compte) continue
      if (!rec.id_prospect_gas) rec.id_prospect_gas = `TRACK_${norm(String(rec.nom_compte)).slice(0,20)}_${i+1}`
      if (!rec.statut) rec.statut = 'SAISIE'
      toUpsert.push(rec)
    }

    let upserted = 0
    for (let i = 0; i < toUpsert.length; i += 100) {
      const { error } = await supabase.from('leads').upsert(toUpsert.slice(i,i+100), { onConflict: 'id_prospect_gas' })
      if (error) throw new Error(`Upsert batch ${i}: ${error.message}`)
      upserted += Math.min(100, toUpsert.length - i)
    }

    const { count } = await supabase.from('leads').select('*', { count:'exact', head:true })
    return new Response(JSON.stringify({
      ok: true, tab: tabName,
      header_row: headerRowIdx,
      lignes_lues: dataRows.length,
      upserted, total_leads: count,
      colonnes_ignorees: hdrs.filter((_,i) => !colMap[i]),
      message: `Import OK — ${upserted} leads depuis '${tabName}' · ${count} total en base`
    }), { status:200, headers:h })

  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ ok:false, error:msg }), { status:500, headers:h })
  }
})
