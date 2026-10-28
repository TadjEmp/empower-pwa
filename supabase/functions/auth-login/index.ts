import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const MAX_TENTATIVES = 8
const VERROU_MS = 15 * 60 * 1000 // 15 minutes

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => ('0' + b.toString(16)).slice(-2)).join('')
}

function randomHex() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let body = {}
  try { body = await req.json() } catch {
    return Response.json({ ok: false, erreur: 'JSON invalide' }, { headers: CORS, status: 400 })
  }

  const { email, motdepasse } = body
  if (!email || !motdepasse)
    return Response.json({ ok: false, erreur: 'Email et mot de passe requis' }, { headers: CORS, status: 400 })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  )

  try {
    const emailNorm = String(email).trim().toLowerCase()
    const { data: users, error } = await sb.from('utilisateurs')
      .select('email,hash,salt,pin,nom,role,actif,droits,failed_attempts,locked_until')
      .eq('email', emailNorm)
      .limit(1)
    if (error) return Response.json({ ok: false, erreur: error.message }, { headers: CORS, status: 500 })
    if (!users || users.length === 0)
      return Response.json({ ok: false, erreur: 'Email ou mot de passe incorrect' }, { headers: CORS, status: 401 })

    const u = users[0]
    if (!u.actif) return Response.json({ ok: false, erreur: 'Compte désactivé' }, { headers: CORS, status: 403 })

    if (u.locked_until && Number(u.locked_until) > Date.now()) {
      const minutes = Math.ceil((Number(u.locked_until) - Date.now()) / 60000)
      return Response.json({ ok: false, erreur: `Trop de tentatives échouées, réessayez dans ${minutes} min` }, { headers: CORS, status: 429 })
    }

    const hash = await sha256(motdepasse + u.salt)
    if (hash !== u.hash) {
      const tentatives = (u.failed_attempts || 0) + 1
      const patch = { failed_attempts: tentatives }
      if (tentatives >= MAX_TENTATIVES) patch.locked_until = Date.now() + VERROU_MS
      await sb.from('utilisateurs').update(patch).eq('email', emailNorm)
      return Response.json({ ok: false, erreur: 'Email ou mot de passe incorrect' }, { headers: CORS, status: 401 })
    }

    const token  = randomHex()
    const expiry = Date.now() + 8 * 3600 * 1000
    await sb.from('utilisateurs').update({ token, token_expiry: expiry, failed_attempts: 0, locked_until: null }).eq('email', emailNorm)

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
