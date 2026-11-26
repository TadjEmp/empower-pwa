import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Limitation des échecs (lot 6 / M3) : fenêtre glissante de 15 min, comptée par (e-mail + IP), par IP et par e-mail.
// Le compte n'est plus verrouillé « pour tout le monde » après 8 échecs : l'attaquant bloque sa propre IP, pas l'utilisateur légitime.
// Le plafond global par e-mail (50) ne sert qu'à freiner un essai distribué. Mêmes règles et même message que l'e-mail existe ou non.
const FENETRE_MS = 15 * 60 * 1000
const MAX_PAIRE = 8
const MAX_IP = 30
const MAX_EMAIL = 50

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let body: any = {}
  try { body = await req.json() } catch {
    return Response.json({ ok: false, erreur: 'JSON invalide' }, { headers: CORS, status: 400 })
  }

  const sbService = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  )

  // Déconnexion : supprime la session de CET appareil (les autres restent connectés).
  if (body.action === 'logout') {
    await sbService.rpc('esi_fermer_session', { p_token: String(body.token || '') })
    return Response.json({ ok: true }, { headers: CORS })
  }

  // Mot de passe oublié : aucun e-mail n'est envoyé (pas de messagerie configurée). La demande prévient les administrateurs
  // (notification), qui fixent un nouveau mot de passe dans Administration. La réponse est identique que l'e-mail existe ou non.
  if (body.action === 'demandeReset') {
    const reponse = Response.json({ ok: true, message: "Si cette adresse est connue, les administrateurs ont été prévenus et vous communiqueront un nouveau mot de passe." }, { headers: CORS })
    try {
      const mail = String(body.email || '').trim().toLowerCase().slice(0, 200)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return reponse
      const depuis = new Date(Date.now() - 3600 * 1000).toISOString()
      const { count: nTotal } = await sbService.from('notifs').select('id', { count: 'exact', head: true }).eq('type_notif', 'DEMANDE_MDP').gte('date_envoi', depuis)
      if ((nTotal ?? 0) >= 30) return reponse                                   // plafond global : pas d'inondation des administrateurs
      const { data: u } = await sbService.from('utilisateurs').select('pin,nom,email,actif').eq('email', mail).limit(1)
      if (!u || !u.length || !u[0].actif) return reponse
      const { count: deja } = await sbService.from('notifs').select('id', { count: 'exact', head: true }).eq('type_notif', 'DEMANDE_MDP').eq('id_cible', mail).gte('date_envoi', depuis)
      if ((deja ?? 0) > 0) return reponse                                        // une demande par heure et par personne
      const { data: admins } = await sbService.from('utilisateurs').select('pin').eq('role', 'ADMIN').eq('actif', true)
      const lignes = (admins || []).map((a: any) => ({
        id_notif_gas: 'NOTIF_' + crypto.randomUUID().slice(0, 12), pin_destinataire: a.pin, type_notif: 'DEMANDE_MDP',
        message: `Demande de nouveau mot de passe : ${u[0].nom} (${mail}). À traiter dans Administration, Utilisateurs.`,
        id_cible: mail, statut_lu: false, date_envoi: new Date().toISOString(),
      }))
      if (lignes.length) await sbService.from('notifs').insert(lignes)
    } catch { /* réponse neutre dans tous les cas */ }
    return reponse
  }

  const { email, motdepasse } = body
  if (!email || !motdepasse)
    return Response.json({ ok: false, erreur: 'Email et mot de passe requis' }, { headers: CORS, status: 400 })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  )

  try {
    const emailNorm = String(email).trim().toLowerCase().slice(0, 200)
    const ip = (req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'inconnue').trim().slice(0, 64)
    const depuis = new Date(Date.now() - FENETRE_MS).toISOString()
    const compter = async (col: string, val: string, avec?: [string, string]) => {
      let q = sb.from('login_echecs').select('id', { count: 'exact', head: true }).eq(col, val).gte('created_at', depuis)
      if (avec) q = q.eq(avec[0], avec[1])
      return (await q).count ?? 0
    }
    const [nPaire, nIp, nEmail] = await Promise.all([compter('email', emailNorm, ['ip', ip]), compter('ip', ip), compter('email', emailNorm)])
    if (nPaire >= MAX_PAIRE || nIp >= MAX_IP || nEmail >= MAX_EMAIL)
      return Response.json({ ok: false, erreur: 'Trop de tentatives échouées, réessayez dans quelques minutes' }, { headers: CORS, status: 429 })

    const { data: users, error } = await sb.from('utilisateurs')
      .select('email,hash,salt,pin,nom,role,actif,droits')
      .eq('email', emailNorm)
      .limit(1)
    if (error) return Response.json({ ok: false, erreur: 'Erreur interne' }, { headers: CORS, status: 500 })

    // E-mail inconnu : même coût de calcul que pour un compte réel (pas de différence de temps de réponse).
    const u = users && users.length ? users[0] : null
    let valide = false
    if (!u) {
      await pbkdf2(String(motdepasse), 'sel-factice-esi')
    } else if (typeof u.hash === 'string' && u.hash.startsWith('pbkdf2$')) {
      const [, iter, attendu] = u.hash.split('$')
      valide = egal(await pbkdf2(String(motdepasse), u.salt, Number(iter)), attendu)
    } else {
      valide = egal(await sha256(motdepasse + u.salt), String(u.hash))
    }
    if (!u || !valide) {
      await sb.from('login_echecs').insert({ email: emailNorm, ip })
      if (Math.random() < 0.05) await sb.from('login_echecs').delete().lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      return Response.json({ ok: false, erreur: 'Email ou mot de passe incorrect' }, { headers: CORS, status: 401 })
    }
    // Compte désactivé : annoncé seulement à qui connaît le bon mot de passe.
    if (!u.actif) return Response.json({ ok: false, erreur: 'Compte désactivé' }, { headers: CORS, status: 403 })

    const token  = randomHex()
    const expiry = Date.now() + 8 * 3600 * 1000
    // Une session par appareil (jeton haché côté base) : se connecter ici ne déconnecte plus les autres appareils.
    const { error: errSession } = await sb.rpc('esi_creer_session', {
      p_pin: Number(u.pin), p_token: token, p_expire: expiry, p_ua: req.headers.get('user-agent') || '',
    })
    if (errSession) return Response.json({ ok: false, erreur: 'Session non créée' }, { headers: CORS, status: 500 })
    const patch2: any = { failed_attempts: 0, locked_until: null }  // colonnes conservées, plus utilisées pour le verrouillage
    if (!String(u.hash).startsWith('pbkdf2$')) patch2.hash = await hasherMotdepasse(motdepasse, u.salt)   // mise à niveau du hachage
    await sb.from('utilisateurs').update(patch2).eq('email', emailNorm)
    await sb.from('login_echecs').delete().eq('email', emailNorm).eq('ip', ip)

    return Response.json({
      ok: true, token, expiry,
      utilisateur: {
        email: u.email, pin: Number(u.pin), nom: u.nom, role: u.role,
        droits: Array.isArray(u.droits) ? u.droits : null,
      },
    }, { headers: CORS })
  } catch (e) {
    return Response.json({ ok: false, erreur: e.message || 'Erreur interne' }, { headers: CORS, status: 500 })
  }
})
