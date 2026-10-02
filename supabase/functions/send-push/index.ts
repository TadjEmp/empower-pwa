// send-push v1 — Lot 6 (10/2026) : notifications push (Web Push / VAPID).
// Appelée UNIQUEMENT par le déclencheur SQL notify_push() (pg_net) à chaque insertion dans `notifs`.
// Protégée par un secret partagé (push_config.secret) dans l'en-tête x-push-secret.
// POST { pin, title?, body, url?, tag? } → envoie à tous les appareils actifs du PIN.
// Appareils expirés (404/410) : supprimés. Les clés VAPID vivent dans push_config (service_role uniquement).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, erreur: 'Méthode non autorisée' }, 405)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: cfgRows, error: cfgErr } = await sb.from('push_config').select('cle,valeur')
  if (cfgErr) return json({ ok: false, erreur: 'config illisible' }, 500)
  const cfg: Record<string, string> = Object.fromEntries((cfgRows || []).map((r: any) => [r.cle, r.valeur]))
  const recu = req.headers.get('x-push-secret') || ''
  if (!cfg.secret || recu.length !== cfg.secret.length || recu !== cfg.secret) return json({ ok: false, erreur: 'Accès refusé' }, 403)

  let body: any
  try { body = await req.json() } catch { return json({ ok: false, erreur: 'JSON invalide' }, 400) }
  const pin = Number(body.pin)
  if (!pin || !body.body) return json({ ok: false, erreur: 'pin et body requis' }, 400)

  const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('pin_cds', pin).eq('actif', true)
  if (!subs || !subs.length) return json({ ok: true, envoyes: 0, appareils: 0 })

  webpush.setVapidDetails(cfg.vapid_sujet, cfg.vapid_public, cfg.vapid_private)
  const payload = JSON.stringify({ title: body.title || 'EMPOWER', body: String(body.body).slice(0, 160), url: body.url || '#/dashboard', tag: body.tag || 'empower' })

  let envoyes = 0, expires = 0
  const erreurs: string[] = []
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'normal' })
      envoyes++
      await sb.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id)
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) { expires++; await sb.from('push_subscriptions').delete().eq('id', s.id) }
      else erreurs.push(`${e && e.statusCode ? e.statusCode : ''} ${String(e && e.message || e).slice(0, 120)}`.trim())
    }
  }))
  return json({ ok: true, appareils: subs.length, envoyes, expires, erreurs })
})
