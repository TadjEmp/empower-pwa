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
  'admin', 'questionnaire', 'photos', 'mailing', 'a_contacter',
]

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => ('0' + b.toString(16)).slice(-2)).join('')
}

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
function egal(a, b) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
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
      // Changer de rôle repart des droits par défaut du nouveau rôle.
      const { error } = await sb.from('utilisateurs').update({ role, droits: null }).eq('pin', targetPin)
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
      return Response.json({ ok: true }, { headers: CORS })
    }

    if (action === 'toggleActif') {
      const { targetPin, actif } = body
      if (!targetPin || typeof actif !== 'boolean') return Response.json({ ok: false, erreur: 'Paramètres manquants' }, { headers: CORS, status: 400 })
      if (targetPin === auth.pin) return Response.json({ ok: false, erreur: 'Impossible de désactiver son propre compte' }, { headers: CORS, status: 400 })
      const { error } = await sb.from('utilisateurs').update({ actif }).eq('pin', targetPin)
      if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
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
      return Response.json({ ok: true }, { headers: CORS })
    }

    return Response.json({ ok: false, erreur: `Action inconnue: ${action}` }, { headers: CORS, status: 400 })

  } catch (e) {
    return Response.json({ ok: false, erreur: e.message || 'Erreur interne' }, { headers: CORS, status: 500 })
  }
})
