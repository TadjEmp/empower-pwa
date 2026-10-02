// sync-sellin-semaines v1 — Lot 2 (10/2026)
// Signal « dernière semaine de commande SELL IN » par compte, depuis les onglets
// « REVENDEURS AU DETAIL Qn » du fichier SELL IN (lu dans le navigateur via SheetJS).
// Indépendant de sync-sellin (CA) : n'écrit que sellin_semaines / sellin_imports /
// sellin_alias et 3 colonnes de comptes (sellin_*). Ne crée JAMAIS de compte.
//
// POST { token, action?: 'import' (défaut) | 'alias',
//        import : { detail: [{ onglet, rows }], fichier, dry_run?, force? }
//        alias  : { nom, compteId } }
// Auth : token de session (utilisateurs.token), rôles ADMIN / CHANNEL_MANAGER.
// Idempotent : chaque import REMPLACE les lignes des trimestres présents dans le fichier
// (le fichier est un cumul du trimestre : W13 remplace W12). Upsert puis purge de l'ancien import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseDetail, agregerSemaines, dernierSignal, normalizeName, estNomProche, type Semaine } from './detail.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const ROLES = ['ADMIN', 'CHANNEL_MANAGER']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, erreur: 'Méthode non autorisée' }, 405)
  let body: any = {}
  try { body = await req.json() } catch { return json({ ok: false, erreur: 'JSON invalide' }, 400) }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Auth : même contrôle que admin-users, rôles élargis au channel manager ──
  if (!body.token) return json({ ok: false, erreur: 'Token manquant' }, 403)
  const { data: us } = await sb.from('utilisateurs').select('pin,role,actif,token_expiry').eq('token', body.token).limit(1)
  const u = us?.[0]
  if (!u || !u.actif || !u.token_expiry || Number(u.token_expiry) < Date.now()) return json({ ok: false, erreur: 'Session invalide ou expirée' }, 403)
  if (!ROLES.includes(u.role)) return json({ ok: false, erreur: 'Accès réservé aux administrateurs et channel managers' }, 403)

  try {
    // Recalcule et écrit le flag des comptes concernés (tous si ids = null).
    async function recalculerFlags(ids: string[] | null) {
      // Pagination : PostgREST plafonne à 1000 lignes par requête.
      const lignes: any[] = []
      for (let from = 0; ; from += 1000) {
        let q = sb.from('sellin_semaines').select('quarter,semaine,ca_eur,commercial_sellin,compte_id').not('compte_id', 'is', null).order('id').range(from, from + 999)
        if (ids) q = q.in('compte_id', ids)
        const { data, error } = await q
        if (error) throw new Error('lecture sellin_semaines: ' + error.message)
        lignes.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      const parCompte = new Map<string, any[]>()
      // dernierSignal() regroupe par « norm » : on lui passe l'id du compte comme clé.
      for (const r of lignes) { const a = parCompte.get(r.compte_id) || []; a.push({ norm: r.compte_id, quarter: r.quarter, semaine: r.semaine, ca_eur: Number(r.ca_eur), commercial_sellin: r.commercial_sellin || '' }); parCompte.set(r.compte_id, a) }
      let n = 0
      for (const [compteId, rows] of parCompte) {
        const best = dernierSignal(rows).get(compteId)
        if (!best) continue
        const { error: e } = await sb.from('comptes').update({
          sellin_dernier_quarter: best.quarter, sellin_derniere_semaine: best.semaine, sellin_commercial: best.commercial || null,
        }).eq('id', compteId)
        if (!e) n++
      }
      return n
    }

    // ── Action : rattacher un nom SELL IN à un compte (alias) ──
    if (body.action === 'alias') {
      const norm = normalizeName(body.nom || '')
      if (!norm || !body.compteId) return json({ ok: false, erreur: 'nom et compteId requis' }, 400)
      const { error } = await sb.from('sellin_alias').upsert({ nom_norm: norm, compte_id: body.compteId, cree_par: u.pin }, { onConflict: 'nom_norm' })
      if (error) throw new Error('alias: ' + error.message)
      await sb.from('sellin_semaines').update({ compte_id: body.compteId }).eq('reseller_norm', norm)
      const flags = await recalculerFlags([body.compteId])
      return json({ ok: true, flags })
    }

    // ── Action : import ──
    const detail: { onglet: string; rows: unknown[][] }[] = Array.isArray(body.detail) ? body.detail : []
    if (!detail.length) return json({ ok: false, erreur: 'Aucun onglet « REVENDEURS AU DETAIL » reçu' }, 400)
    const dryRun = !!body.dry_run

    const parTrimestre = new Map<string, Semaine[]>()
    const ignorees: Record<string, number> = {}
    for (const d of detail) {
      const p = parseDetail(d.onglet, d.rows)
      parTrimestre.set(p.quarter, agregerSemaines(p.quarter, p.lignes))
      ignorees[p.quarter] = p.ignorees
    }

    // Garde-fou : refuser un fichier plus ancien que celui déjà chargé (sauf force).
    const resume: Record<string, any> = {}
    for (const [quarter, sem] of parTrimestre) {
      const semaineMax = Math.max(...sem.map(s => s.semaine))
      const { data: ex } = await sb.from('sellin_semaines').select('semaine').eq('quarter', quarter).order('semaine', { ascending: false }).limit(1)
      const dejaMax = ex?.[0]?.semaine ?? 0
      if (semaineMax < dejaMax && !body.force) {
        return json({ ok: false, erreur: `FICHIER_PLUS_ANCIEN : ${quarter} est déjà chargé jusqu'à la semaine ${dejaMax}, ce fichier s'arrête à ${semaineMax}`, code: 'FICHIER_PLUS_ANCIEN', quarter, dejaMax, semaineMax }, 409)
      }
      resume[quarter] = { semaine_max: semaineMax, revendeurs: new Set(sem.map(s => s.norm)).size, lignes: sem.length, ignorees: ignorees[quarter],
        ca_total: Math.round(sem.reduce((t, s) => t + s.ca_eur, 0) * 100) / 100 }   // contrôle : doit égaler la somme « Local Value » de l'onglet
    }

    // ── Rapprochement : alias → nom normalisé exact → à valider (jamais de création) ──
    const [{ data: comptes }, { data: alias }] = await Promise.all([
      sb.from('comptes').select('id,nom_compte').or('deleted.is.null,deleted.eq.false').range(0, 4999),
      sb.from('sellin_alias').select('nom_norm,compte_id'),
    ])
    const parNom = new Map<string, string>()
    for (const c of comptes || []) parNom.set(normalizeName(c.nom_compte), c.id)
    const parAlias = new Map<string, string>((alias || []).map((a: any) => [a.nom_norm, a.compte_id]))
    const nomCompte = new Map<string, string>((comptes || []).map((c: any) => [c.id, c.nom_compte]))

    const compteDe = new Map<string, string | null>()
    const nonMatcher: any[] = []
    const vus = new Set<string>()
    for (const sem of parTrimestre.values()) for (const s of sem) {
      if (vus.has(s.norm)) continue
      vus.add(s.norm)
      const id = parAlias.get(s.norm) || parNom.get(s.norm) || null
      compteDe.set(s.norm, id)
      if (!id) {
        const candidats = [...parNom.entries()].filter(([n]) => estNomProche(s.norm, n)).slice(0, 5).map(([, cid]) => ({ id: cid, nom: nomCompte.get(cid) }))
        nonMatcher.push({ reseller: s.reseller, norm: s.norm, raison: candidats.length ? 'QUASI_DOUBLON' : 'INCONNU', candidats })
      }
    }

    // Contrôle des montants : CA du fichier qui n'est rattaché à AUCUN compte (à traiter via la file « À valider »).
    for (const [quarter, sem] of parTrimestre) {
      resume[quarter].ca_non_rapproche = Math.round(sem.filter(s => !compteDe.get(s.norm)).reduce((t, s) => t + s.ca_eur, 0) * 100) / 100
      resume[quarter].ca_rapproche = Math.round((resume[quarter].ca_total - resume[quarter].ca_non_rapproche) * 100) / 100
    }

    if (dryRun) {
      return json({ ok: true, dry_run: true, trimestres: resume, revendeurs: vus.size, rapproches: vus.size - nonMatcher.length, nonMatcher })
    }

    // ── Écriture : remplace les lignes de chaque trimestre présent (idempotent) ──
    let semaineMaxGlobal = 0
    for (const [quarter, sem] of parTrimestre) {
      const { data: imp, error: ie } = await sb.from('sellin_imports').insert({
        fichier: body.fichier || null, quarter, semaine_max: resume[quarter].semaine_max, nb_lignes: sem.length,
        nb_revendeurs: resume[quarter].revendeurs, nb_non_matches: nonMatcher.length, auteur_pin: u.pin,
      }).select('id').single()
      if (ie) throw new Error('sellin_imports: ' + ie.message)
      const rows = sem.map(s => ({
        reseller: s.reseller, reseller_norm: s.norm, quarter, semaine: s.semaine, ca_eur: s.ca_eur, unites: s.unites,
        commercial_sellin: s.commercial_sellin || null, compte_id: compteDe.get(s.norm) || null, import_id: imp.id,
      }))
      // Upsert d'abord, purge des lignes de l'ancien import ensuite : si l'écriture échoue
      // en cours de route, les données précédentes du trimestre ne sont jamais perdues.
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from('sellin_semaines').upsert(rows.slice(i, i + 200), { onConflict: 'reseller_norm,quarter,semaine' })
        if (error) throw new Error('écriture sellin_semaines: ' + error.message)
      }
      const { error: de } = await sb.from('sellin_semaines').delete().eq('quarter', quarter).neq('import_id', imp.id)
      if (de) throw new Error('purge ancien import: ' + de.message)
      semaineMaxGlobal = Math.max(semaineMaxGlobal, resume[quarter].semaine_max)
    }
    const flags = await recalculerFlags([...new Set([...compteDe.values()].filter(Boolean) as string[])])
    await sb.from('params').upsert([
      { parametre: 'SELLIN_SEMAINE_MAX', valeur: String(semaineMaxGlobal), description: 'Dernière semaine SELL IN chargée (semaine du trimestre)' },
      { parametre: 'SELLIN_SEMAINES_DATE', valeur: new Date().toISOString(), description: 'Date du dernier import SELL IN par semaine' },
    ], { onConflict: 'parametre' })

    return json({ ok: true, trimestres: resume, revendeurs: vus.size, rapproches: vus.size - nonMatcher.length, comptes_flagues: flags, nonMatcher })
  } catch (e) {
    return json({ ok: false, erreur: e instanceof Error ? e.message : String(e) }, 500)
  }
})
