// coach-chat : chatbot du Coach (tous profils, Externe compris).
// Le navigateur envoie l'historique ; la fonction vérifie la session, charge catalogue et comptes selon le rôle,
// laisse le modèle appeler des outils (prix, marge, comptes) et renvoie une réponse avec ses sources.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { creerCatalogue } from './calcul.mjs'
import { dialogue, perimetreComptes, nettoyerRecherche } from './coach.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const MODELES = ['gemini-2.5-flash', 'gemini-3.5-flash-lite']   // un modèle retiré (404) est simplement ignoré
const rep = (corps: unknown, status = 200) => Response.json(corps, { headers: CORS, status })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  let body: any = {}
  try { body = await req.json() } catch { return rep({ ok: false, erreur: 'JSON invalide' }, 400) }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let roleVu = ''
  try {
    // Session : jeton émis par auth-login, lu via esi_session_info (même contrôle que ai-proxy).
    if (!body.token) return rep({ ok: false, erreur: 'Session requise' }, 401)
    const { data: s, error: es } = await sb.rpc('esi_session_info', { p_token: body.token })
    if (es || !s || !s.length) return rep({ ok: false, erreur: 'Session invalide' }, 401)
    const u = s[0]
    if (!u.actif) return rep({ ok: false, erreur: 'Compte désactivé' }, 401)
    if (!u.token_expiry || Number(u.token_expiry) < Date.now()) return rep({ ok: false, erreur: 'Session expirée' }, 401)
    const role: string = u.role, pin = u.pin
    roleVu = role
    if (!['ADMIN', 'CHANNEL_MANAGER', 'CDS', 'EXTERNE'].includes(role)) return rep({ ok: false, erreur: 'Profil non autorisé' }, 403)

    // Taille et fréquence (comme ai-proxy) : 30 questions / 10 min, 300 / jour par utilisateur.
    const brut = JSON.stringify(body.messages ?? '')
    if (brut.length > 24000) return rep({ ok: false, erreur: 'Conversation trop volumineuse' }, 413)
    const il = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
    const [r10, rJ] = await Promise.all([
      sb.from('ai_usage').select('id', { count: 'exact', head: true }).eq('pin', pin).eq('action', 'coach').gte('created_at', il(10)),
      sb.from('ai_usage').select('id', { count: 'exact', head: true }).eq('pin', pin).eq('action', 'coach').gte('created_at', il(1440)),
    ])
    if ((r10.count ?? 0) >= 30 || (rJ.count ?? 0) >= 300) return rep({ ok: false, erreur: 'Limite d\'utilisation atteinte, réessayez plus tard' }, 429)
    await sb.from('ai_usage').insert({ pin, action: 'coach' })

    const { data: cle } = await sb.from('params').select('valeur').eq('parametre', 'GEMINI_API_KEY').maybeSingle()
    if (!cle?.valeur) return rep({ ok: false, erreur: 'Assistant non configuré' })

    // Catalogue des Réglages (source unique des prix).
    const [pr, co, rg] = await Promise.all([
      sb.from('catalogue_produits').select('*').eq('actif', true).order('ordre'),
      sb.from('catalogue_cotations').select('*'),
      sb.from('params').select('valeur').eq('parametre', 'COACH_EXTERNE_COMPTES').maybeSingle(),
    ])
    const num = (v: unknown) => (v == null ? null : Number(v))
    const produits = (pr.data ?? []).map((r: any) => ({ id: r.produit_id, famille: r.famille, nom: r.nom, appareils: r.appareils,
      pvp_ttc: num(r.pvp_ttc), pa_empower: num(r.pa_empower), pa_td: num(r.pa_td), pa_ingram: num(r.pa_ingram) }))
    const cotations = (co.data ?? []).map((r: any) => ({ id: r.id, libelle: r.libelle, canaux: r.canaux || [], debut: String(r.debut).slice(0, 10), fin: String(r.fin).slice(0, 10),
      remise_pct: num(r.remise_pct), prix: r.prix || {}, actif: r.actif !== false }))
    const catalogue = creerCatalogue({ produits, cotations })

    let perimetre = perimetreComptes(role, pin, rg.data?.valeur)
    // Admin / channel manager : s'ils ont choisi un commercial dans le Coach, la recherche de comptes est limitée à ses comptes (jamais de mélange entre commerciaux).
    const pp = String(body.perimetre_pin ?? '').replace(/\D/g, '').slice(0, 6)
    if ((role === 'ADMIN' || role === 'CHANNEL_MANAGER') && pp && perimetre.autorise) perimetre = { ...perimetre, pin: pp }

    // Comptes : lecture avec la clé de service, donc le périmètre est appliqué ici (jamais côté modèle).
    async function chercherComptes(f: any, per: any, limite: number) {
      let q = sb.from('comptes').select(per.champs.map((c: string) => c === 'id' ? 'id' : c).join(',') + ',deleted,pin_cds_assigne').neq('deleted', true).limit(limite)
      if (per.pin) q = q.eq('pin_cds_assigne', per.pin)
      if (f.texte) q = q.or(`nom_compte.ilike.%${f.texte}%,ville.ilike.%${f.texte}%,contact_nom.ilike.%${f.texte}%`)
      if (f.ville) q = q.ilike('ville', `%${f.ville}%`)
      if (f.departement) q = q.eq('departement', f.departement)
      if (f.statut) q = q.ilike('statut_compte', `%${f.statut}%`)
      if (f.canal) q = q.ilike('canal', `%${f.canal}%`)
      if (f.empower === true) q = q.ilike('has_empower', 'oui')
      if (f.empower === false) q = q.not('has_empower', 'ilike', 'oui')
      const { data, error } = await q.order('nom_compte')
      if (error) throw new Error('lecture comptes')
      return data ?? []
    }

    async function appelerModele(payload: any) {
      const corps = JSON.stringify({ ...payload, generationConfig: { temperature: 0.3, maxOutputTokens: 900 } })
      let dernier = 0, dernierDetail = ''
      for (const m of MODELES) {
        for (let essai = 0; essai < 2; essai++) {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle!.valeur }, body: corps })
          if (r.status === 429 || r.status === 503) { dernier = 429; await new Promise(ok => setTimeout(ok, 1500)); continue }   // quota par minute ou forte demande (503) : une courte pause puis un second essai
          if (!r.ok) {
            const txt = (await r.text()).slice(0, 300)
            console.error('coach-chat modèle', m, r.status, txt)
            if (r.status === 404) { dernierDetail = m + ' ' + r.status + ' ' + txt; break }   // modèle absent : on passe au suivant
            const err: any = new Error('Modèle ' + r.status); err.detail = m + ' ' + r.status + ' ' + txt; throw err
          }
          const d = await r.json()
          return d.candidates?.[0]?.content ?? { parts: [] }
        }
      }
      const fin: any = new Error(dernier === 429 ? 'Quota du modèle épuisé' : 'Modèle indisponible'); fin.detail = dernierDetail; throw fin
    }

    const prenom = nettoyerRecherche(body.prenom).slice(0, 30)
    const out = await dialogue({ messages: body.messages, role, prenom, faits: body.faits, ctx: { catalogue, perimetre, chercherComptes }, appelerModele })
    return rep(out)
  } catch (e: any) {
    const m = String(e?.message || '')
    console.error('coach-chat', m.slice(0, 300))
    if (m.startsWith('Quota du modèle')) return rep({ ok: false, erreur: 'L\'assistant est très sollicité en ce moment, réessayez dans une minute.', code: 'quota' }, 503)
    const code = m.startsWith('Modèle ') ? m.slice(0, 12) : m === 'lecture comptes' ? 'comptes' : 'interne'
    return rep({ ok: false, erreur: 'Assistant momentanément indisponible', code, ...(roleVu === 'ADMIN' ? { detail: String(e?.detail || '').slice(0, 300) } : {}) }, 500)
  }
})
