import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let body: any = {}
  try { body = await req.json() } catch {
    return Response.json({ ok: false, erreur: 'JSON invalide' }, { headers: CORS, status: 400 })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  async function getKey(parametre: string): Promise<string | null> {
    const { data } = await sb.from('params').select('valeur').eq('parametre', parametre).single()
    return data?.valeur ?? null
  }

  async function setKey(parametre: string, valeur: string, description: string) {
    await sb.from('params').upsert({ parametre, valeur, description }, { onConflict: 'parametre' })
  }

  // Toute action nécessite une session utilisateur active (token émis par auth-login) :
  // ai-proxy est appelable par quiconque possède la clé anon publique sinon.
  // La session est lue via esi_session_info (table sessions, jetons hachés, + anciens jetons).
  async function verifierSession() {
    const { token } = body
    if (!token) return { ok: false, erreur: 'Session requise' }
    const { data, error } = await sb.rpc('esi_session_info', { p_token: token })
    if (error || !data || data.length === 0) return { ok: false, erreur: 'Session invalide' }
    const u = data[0]
    if (!u.actif) return { ok: false, erreur: 'Compte désactivé' }
    if (!u.token_expiry || Number(u.token_expiry) < Date.now()) return { ok: false, erreur: 'Session expirée' }
    return { ok: true, pin: u.pin, role: u.role }
  }

  // Essaie chaque modèle jusqu'à réussite (fallback automatique si 429)
  async function callGemini(apiKey: string, contents: any[]): Promise<{ ok: boolean; texte?: string; erreur?: string }> {
    const payload = JSON.stringify({
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
    })
    for (const model of GEMINI_MODELS) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: payload,
        },
      )
      if (r.status === 429) continue  // quota épuisé → essai modèle suivant
      if (!r.ok) {
        const err = await r.text()
        return { ok: false, erreur: `Gemini ${model} ${r.status}: ${err.slice(0, 300)}` }
      }
      const data = await r.json()
      const texte = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      return { ok: true, texte }
    }
    return { ok: false, erreur: 'Quota Gemini épuisé sur tous les modèles. Réessaie demain ou active la facturation Google AI Studio.' }
  }

  const { action } = body

  try {
    const session = await verifierSession()
    if (!session.ok) return Response.json({ ok: false, erreur: session.erreur }, { headers: CORS, status: 401 })

    if (action === 'setGeminiKey' || action === 'setGroqKey') {
      if (session.role !== 'ADMIN')
        return Response.json({ ok: false, erreur: 'Accès réservé aux administrateurs' }, { headers: CORS, status: 403 })
      const { cle } = body
      if (!cle) return Response.json({ ok: false, erreur: 'Clé manquante' }, { headers: CORS, status: 400 })
      if (action === 'setGeminiKey') await setKey('GEMINI_API_KEY', cle, 'Clé API Google Gemini')
      else await setKey('GROQ_API_KEY', cle, 'Clé API Groq (Whisper + LLaMA)')
      return Response.json({ ok: true }, { headers: CORS })
    }

    if (action === 'gemini') {
      const { prompt, contexte } = body
      const apiKey = await getKey('GEMINI_API_KEY')
      if (!apiKey) return Response.json({ ok: false, erreur: 'Clé Gemini non configurée' }, { headers: CORS })

      const contents: any[] = []
      if (contexte) contents.push({ role: 'user', parts: [{ text: `[SYSTÈME] ${contexte}` }] })
      contents.push({ role: 'user', parts: [{ text: prompt }] })

      const result = await callGemini(apiKey, contents)
      return Response.json(result, { headers: CORS })
    }

    if (action === 'groqSTT') {
      const { audio, mimeType } = body
      const apiKey = await getKey('GROQ_API_KEY')
      if (!apiKey) return Response.json({ ok: false, erreur: 'Clé Groq non configurée' }, { headers: CORS })

      const binaryStr = atob(audio)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

      const ext = (mimeType || '').includes('mp4') ? 'mp4' : (mimeType || '').includes('ogg') ? 'ogg' : 'webm'
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: mimeType || 'audio/webm' }), `audio.${ext}`)
      form.append('model', 'whisper-large-v3')
      form.append('language', 'fr')
      form.append('response_format', 'text')

      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: form,
      })
      if (!r.ok) {
        const err = await r.text()
        return Response.json({ ok: false, erreur: `Groq STT ${r.status}: ${err.slice(0, 200)}` }, { headers: CORS })
      }
      return Response.json({ ok: true, texte: (await r.text()).trim() }, { headers: CORS })
    }

    if (action === 'groqLLM') {
      const { model, temperature, messages, jsonMode } = body
      const apiKey = await getKey('GROQ_API_KEY')
      if (!apiKey) return Response.json({ ok: false, erreur: 'Clé Groq non configurée' }, { headers: CORS })

      const payload: any = {
        model: model || 'llama-3.3-70b-versatile',
        temperature: temperature ?? 0.3,
        messages,
        max_tokens: 1024,
      }
      if (jsonMode) payload.response_format = { type: 'json_object' }

      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const err = await r.text()
        return Response.json({ ok: false, erreur: `Groq LLM ${r.status}: ${err.slice(0, 200)}` }, { headers: CORS })
      }
      const data = await r.json()
      return Response.json({ ok: true, texte: data.choices?.[0]?.message?.content ?? '' }, { headers: CORS })
    }

    return Response.json({ ok: false, erreur: `Action inconnue: ${action}` }, { headers: CORS })

  } catch (e: any) {
    return Response.json({ ok: false, erreur: e.message || 'Erreur interne' }, { headers: CORS, status: 500 })
  }
})
