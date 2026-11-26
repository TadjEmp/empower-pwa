import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const MIN_MOTDEPASSE = 12
const ROLES = ['ADMIN', 'CDS', 'CHANNEL_MANAGER', 'EXTERNE']
// Doit rester aligné avec Permissions.LIBELLES (js/permissions.js).
const SECTIONS = [
  'home', 'tracker', 'historiques', 'phoning', 'visites', 'visites_fdv',
  'objectifs', 'primes', 'comptes', 'manager', 'reporting', 'reporting_cds',
  'admin', 'questionnaire', 'photos', 'mailing', 'a_contacter', 'territoires',
  'admin_primes', 'admin_baremes', 'admin_reporting', 'coach', 'kit',
]

// Hachage des mots de passe : PBKDF2-SHA256 (210 000 itérations), format « pbkdf2$<itérations>$<hex> ».
// Les anciens hachages (SHA-256 simple, 64 caractères hexa) restent acceptés et sont remplacés à la connexion suivante.
const PBKDF2_ITER = 210000
async function pbkdf2(motdepasse, salt, iter = PBKDF2_ITER) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(motdepasse), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter }, cle, 256)
  return Array.from(new Uint8Array(bits)).map(b => ('0' + b.toString(16)).slice(-2)).join('')
}
async function hasherMotdepasse(motdepasse, salt) {
  return `pbkdf2$${PBKDF2_ITER}$${await pbkdf2(motdepasse, salt)}`
}

function randomHex() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
}

// null = droits par défaut du rôle ; sinon tableau de sections connues, dédoublonné.
function normaliserDroits(droits, role) {
  if (role === 'ADMIN' || droits === undefined || droits === null) return { ok: true, valeur: null }
  if (!Array.isArray(droits)) return { ok: false, erreur: 'Droits invalides' }
  const inconnus = droits.filter(d => !SECTIONS.includes(d))
  if (inconnus.length) return { ok: false, erreur: `Sections inconnues : ${inconnus.join(', ')}` }
  if (droits.length === 0) return { ok: false, erreur: 'Au moins une section doit être cochée' }
  return { ok: true, valeur: [...new Set(droits)] }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let body = {}
  try { body = await req.json() } catch {
    return Response.json({ ok: false, erreur: 'JSON invalide' }, { headers: CORS, status: 400 })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  )

  const { action, token } = body

  async function verifierAdmin() {
    if (!token) return { ok: false, erreur: 'Token manquant' }
    const { data, error } = await sb.rpc('esi_session_info', { p_token: token })
    if (error || !data || data.length === 0) return { ok: false, erreur: 'Session invalide' }
    const u = data[0]
    if (!u.actif) return { ok: false, erreur: 'Compte désactivé' }
    if (!u.token_expiry || Number(u.token_expiry) < Date.now()) return { ok: false, erreur: 'Session expirée' }
    if (u.role !== 'ADMIN') return { ok: false, erreur: 'Accès réservé aux administrateurs' }
    return { ok: true, pin: u.pin }
  }

  // Lot 5 : il doit toujours rester au moins un ADMIN actif (hors l'utilisateur ciblé).
  async function autresAdminsActifs(pinExclu) {
    const { data } = await sb.from('utilisateurs').select('pin').eq('role', 'ADMIN').eq('actif', true).neq('pin', pinExclu)
    return (data || []).length
  }
  async function tracer(type, auteurPin, resume) {
    try {
      await sb.from('actions').insert({ type_action: type, source: 'ESI_ADMIN', pin_cds: auteurPin, nom_compte: resume })
    } catch { /* trace non bloquante */ }
  }
  const refus = (msg, status = 400) => Response.json({ ok: false, erreur: msg }, { headers: CORS, status })

  try {
    const auth = await verifierAdmin()
    if (!auth.ok) return Response.json({ ok: false, erreur: auth.erreur }, { headers: CORS, status: 403 })

    if (action === 'list') {
      const { data, error } = await sb.from('utilisateurs')
        .select('pin,nom,email,role,actif,droits').order('pin')
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
      return Response.json({ ok: true, utilisateurs: data || [] }, { headers: CORS })
    }

    if (action === 'create') {
      const { email, motdepasse, pin, nom, role } = body
      if (!email || !motdepasse || !pin || !nom || !role)
        return Response.json({ ok: false, erreur: 'Champs requis manquants' }, { headers: CORS, status: 400 })
      if (!ROLES.includes(role))
        return Response.json({ ok: false, erreur: 'Rôle inconnu' }, { headers: CORS, status: 400 })
      if (String(motdepasse).length < MIN_MOTDEPASSE)
        return Response.json({ ok: false, erreur: `Mot de passe trop court (${MIN_MOTDEPASSE} caractères min)` }, { headers: CORS, status: 400 })
      const d = normaliserDroits(body.droits, role)
      if (!d.ok) return Response.json({ ok: false, erreur: d.erreur }, { headers: CORS, status: 400 })
      const emailNorm = String(email).trim().toLowerCase()
      const { data: existant } = await sb.from('utilisateurs')
        .select('id').or(`email.eq.${emailNorm},pin.eq.${pin}`).limit(1)
      if (existant && existant.length > 0)
        return Response.json({ ok: false, erreur: 'Email ou PIN déjà utilisé' }, { headers: CORS, status: 409 })
      const salt = randomHex()
      const hash = await hasherMotdepasse(motdepasse, salt)
      const { error } = await sb.from('utilisateurs').insert({
        email: emailNorm, hash, salt, pin, nom, role, actif: true, droits: d.valeur,
      })
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
      return Response.json({ ok: true }, { headers: CORS })
    }

    if (action === 'updateDroits') {
      const { targetPin } = body
      if (!targetPin) return Response.json({ ok: false, erreur: 'Paramètres manquants' }, { headers: CORS, status: 400 })
      const { data: cible } = await sb.from('utilisateurs').select('role').eq('pin', targetPin).limit(1)
      if (!cible || cible.length === 0) return Response.json({ ok: false, erreur: 'Utilisateur introuvable' }, { headers: CORS, status: 404 })
      const d = normaliserDroits(body.droits, cible[0].role)
      if (!d.ok) return Response.json({ ok: false, erreur: d.erreur }, { headers: CORS, status: 400 })
      const { error } = await sb.from('utilisateurs').update({ droits: d.valeur }).eq('pin', targetPin)
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
      return Response.json({ ok: true }, { headers: CORS })
    }

    if (action === 'updateRole') {
      const { targetPin, role } = body
      if (!targetPin || !role) return Response.json({ ok: false, erreur: 'Paramètres manquants' }, { headers: CORS, status: 400 })
      if (!ROLES.includes(role)) return Response.json({ ok: false, erreur: 'Rôle inconnu' }, { headers: CORS, status: 400 })
      const { data: cibleRole } = await sb.from('utilisateurs').select('role,actif').eq('pin', targetPin).limit(1)
      if (!cibleRole || cibleRole.length === 0) return refus('Utilisateur introuvable', 404)
      if (cibleRole[0].role === 'ADMIN' && role !== 'ADMIN') {
        if (targetPin === auth.pin) return refus('Impossible de retirer son propre rôle administrateur')
        if (cibleRole[0].actif && await autresAdminsActifs(targetPin) === 0) return refus('Dernier administrateur actif : son rôle ne peut pas être modifié')
      }
      // Changer de rôle repart des droits par défaut du nouveau rôle.
      const { error } = await sb.from('utilisateurs').update({ role, droits: null }).eq('pin', targetPin)
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
      return Response.json({ ok: true }, { headers: CORS })
    }

    if (action === 'toggleActif') {
      const { targetPin, actif } = body
      if (!targetPin || typeof actif !== 'boolean') return Response.json({ ok: false, erreur: 'Paramètres manquants' }, { headers: CORS, status: 400 })
      if (targetPin === auth.pin) return Response.json({ ok: false, erreur: 'Impossible de désactiver son propre compte' }, { headers: CORS, status: 400 })
      if (actif === false) {
        const { data: cibleAct } = await sb.from('utilisateurs').select('role,actif').eq('pin', targetPin).limit(1)
        if (cibleAct && cibleAct[0] && cibleAct[0].role === 'ADMIN' && cibleAct[0].actif && await autresAdminsActifs(targetPin) === 0)
          return refus('Dernier administrateur actif : impossible de le désactiver')
      }
      const { error } = await sb.from('utilisateurs').update({ actif }).eq('pin', targetPin)
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
      return Response.json({ ok: true }, { headers: CORS })
    }

    // Lot 5 : suppression définitive d'un accès (ADMIN seul ; jamais soi-même ni le dernier administrateur actif).
    // Les comptes, leads, visites et appels rattachés au PIN ne sont pas supprimés : seul l'accès à l'application disparaît.
    if (action === 'delete') {
      const { targetPin } = body
      if (!targetPin) return refus('Paramètres manquants')
      if (body.confirmation !== true) return refus('Confirmation requise')
      if (targetPin === auth.pin) return refus('Impossible de supprimer son propre compte')
      const { data: cibleSup } = await sb.from('utilisateurs').select('pin,nom,email,role,actif').eq('pin', targetPin).limit(1)
      if (!cibleSup || cibleSup.length === 0) return refus('Utilisateur introuvable', 404)
      const c = cibleSup[0]
      if (c.role === 'ADMIN' && c.actif && await autresAdminsActifs(targetPin) === 0)
        return refus('Dernier administrateur actif : impossible de le supprimer')
      const { error } = await sb.from('utilisateurs').delete().eq('pin', targetPin)
      if (error) {
        if (error.code === '23503') return refus('Cet utilisateur a modifié des barèmes de primes : désactivez son accès plutôt que de le supprimer', 409)
        return refus(error.message, 500)
      }
      await tracer('USER_SUPPRIME', auth.pin, `${c.nom} (${c.role}, PIN ${c.pin}) supprimé`)
      return Response.json({ ok: true }, { headers: CORS })
    }

    // Modification du nom et de l'e-mail d'un accès existant (ADMIN seul). Le PIN et le rôle ne changent pas ici.
    if (action === 'updateProfil') {
      const { targetPin } = body
      const nom = String(body.nom ?? '').trim()
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!targetPin || !nom || !email) return refus('Nom et e-mail requis')
      if (nom.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return refus('Nom ou e-mail invalide')
      const { data: cibleP } = await sb.from('utilisateurs').select('pin').eq('pin', targetPin).limit(1)
      if (!cibleP || cibleP.length === 0) return refus('Utilisateur introuvable', 404)
      const { data: pris } = await sb.from('utilisateurs').select('pin').eq('email', email).neq('pin', targetPin).limit(1)
      if (pris && pris.length > 0) return refus('Cet e-mail est déjà utilisé', 409)
      const { error } = await sb.from('utilisateurs').update({ nom, email }).eq('pin', targetPin)
      if (error) return refus(error.message, 500)
      await tracer('USER_MODIFIE', auth.pin, `PIN ${targetPin} : nom et e-mail mis à jour`)
      return Response.json({ ok: true }, { headers: CORS })
    }

    if (action === 'resetPassword') {
      const { targetPin, nouveauMotdepasse } = body
      if (!targetPin || !nouveauMotdepasse) return Response.json({ ok: false, erreur: 'Paramètres manquants' }, { headers: CORS, status: 400 })
      if (String(nouveauMotdepasse).length < MIN_MOTDEPASSE)
        return Response.json({ ok: false, erreur: `Mot de passe trop court (${MIN_MOTDEPASSE} caractères min)` }, { headers: CORS, status: 400 })
      const salt = randomHex()
      const hash = await hasherMotdepasse(nouveauMotdepasse, salt)
      const { error } = await sb.from('utilisateurs').update({ hash, salt }).eq('pin', targetPin)
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
      // Les sessions ouvertes avec l'ancien mot de passe sont fermées (sauf celles de l'administrateur qui agit sur son propre compte).
      if (targetPin !== auth.pin) await sb.from('sessions').delete().eq('pin', targetPin)
      await tracer('MDP_REINITIALISE', auth.pin, `PIN ${targetPin} : mot de passe réinitialisé`)
      return Response.json({ ok: true }, { headers: CORS })
    }

    // Purge RGPD : supprime les appels et visites d'un commercial (ADMIN seul, confirmation explicite, action tracée).
    if (action === 'purgerDonnees') {
      const pin = Number(body.pinCDS)
      if (!Number.isInteger(pin) || pin <= 0) return refus('Commercial invalide')
      if (body.confirmation !== true) return refus('Confirmation requise')
      const { data: cible } = await sb.from('utilisateurs').select('pin,nom').eq('pin', pin).limit(1)
      if (!cible || cible.length === 0) return refus('Utilisateur introuvable', 404)
      const ph = await sb.from('phoning').delete({ count: 'exact' }).eq('pin_cds', pin)
      if (ph.error) return refus(ph.error.message, 500)
      const vi = await sb.from('visites').delete({ count: 'exact' }).eq('pin_cds', pin)
      if (vi.error) return refus(vi.error.message, 500)
      const n = (ph.count ?? 0) + (vi.count ?? 0)
      await tracer('PURGE_RGPD', auth.pin, `${cible[0].nom} (PIN ${pin}) : ${ph.count ?? 0} appels et ${vi.count ?? 0} visites supprimés`)
      return Response.json({ ok: true, lignesSupprimees: n }, { headers: CORS })
    }

    // Réglages partagés modifiables par l'admin (liste blanche : jamais les clés d'API ni les PIN).
    if (action === 'setParam') {
      const REGLAGES: Record<string, string> = {
        AFFICHER_LECLERC: 'Afficher les magasins Leclerc dans les comptes (true/false)',
        COACH_EXTERNE_COMPTES: 'Coach : recherche de comptes pour le profil Externe (JSON : actif, champs)',
      }
      const CHAMPS_EXTERNE = ['id', 'nom_compte', 'ville', 'code_postal', 'departement', 'canal', 'secteur', 'has_empower', 'statut_compte', 'nom_cds', 'tel', 'email', 'contact_nom', 'contact_fonction', 'adresse']
      const { cle } = body
      let { valeur } = body
      if (!REGLAGES[cle]) return Response.json({ ok: false, erreur: 'Réglage inconnu ou valeur invalide' }, { headers: CORS, status: 400 })
      if (cle === 'COACH_EXTERNE_COMPTES') {
        let v: any = null
        try { v = typeof valeur === 'string' ? JSON.parse(valeur) : valeur } catch { /* refus ci-dessous */ }
        if (!v || typeof v.actif !== 'boolean' || !Array.isArray(v.champs) || v.champs.some((c: unknown) => !CHAMPS_EXTERNE.includes(c as string)))
          return Response.json({ ok: false, erreur: 'Réglage inconnu ou valeur invalide' }, { headers: CORS, status: 400 })
        valeur = JSON.stringify({ actif: v.actif, champs: [...new Set(v.champs)] })
      } else if (!['true', 'false'].includes(String(valeur))) {
        return Response.json({ ok: false, erreur: 'Réglage inconnu ou valeur invalide' }, { headers: CORS, status: 400 })
      }
      const { error } = await sb.from('params').upsert({ parametre: cle, valeur: String(valeur), description: REGLAGES[cle] }, { onConflict: 'parametre' })
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
      return Response.json({ ok: true }, { headers: CORS })
    }

    return Response.json({ ok: false, erreur: `Action inconnue: ${action}` }, { headers: CORS, status: 400 })

  } catch (e) {
    return Response.json({ ok: false, erreur: e.message || 'Erreur interne' }, { headers: CORS, status: 500 })
  }
})
