// ═══════════════════════════════════════
//  groq.js — IA Groq : Whisper STT + LLM (B11 — proxy Apps Script)
//  SÉCURITÉ : clé GROQ_API_KEY dans PropertiesService côté Apps Script.
//  Audio jamais stocké côté serveur — traité en mémoire uniquement.
// ═══════════════════════════════════════

const GroqAPI = {
  STT_MODEL:      'whisper-large-v3',
  LLM_MODEL:      'llama3-70b-8192',
  TEMPERATURE:    0.3,
  RECORD_SECONDS: 30,
  _mediaRecorder: null,
  _chunks: [],

  SYSTEM_PROMPT: `Tu es l'assistant commercial IA de l'équipe Norton France (Impact Sales Marketing).
Tu aides les CDS terrain (TADJIDINE, LYES, JOHANNE, MEHDI) à qualifier leurs appels revendeurs IT français.

CONTEXTE MÉTIER :
- Programme Sell-In Norton FY27 + Programme EMPOWER (partenariat revendeur IT récurrent)
- Distributeurs : Ingram Micro, TD SYNNEX
- Gamme : Antivirus Plus · 360 Standard · 360 Deluxe 3D/5D · 360 Premium · 360 Advanced · 360 for Gamers · Norton Small Business (NSB) · Avast Business Hub
- EMPOWER = portail EmpowerReseller.Norton.com · marge +25% sur 3 ans · licences récurrentes

TYPE D'APPEL (à détecter automatiquement) :
1. RÉACTIVATION_SELL_IN → revendeur silencieux >8 semaines sur Ingram/TD SYNNEX
2. RELANCE_SELL_IN → revendeur actif, relance commande
3. ONBOARDING_EMPOWER → prospect pipeline Alexandra/Flavie, pas encore sur Empower
4. SUIVI_EMPOWER → compte EMPOWER existant à accompagner (blocage, 1ère commande, upsell)

CONCURRENTS TERRAIN FRANCE : ESET · Kaspersky · Bitdefender · Malwarebytes · Sophos · Avast Business · McAfee Trellix · Trend Micro · CoffieSoft

CONTRE-ARGUMENTS VALIDÉS :
- "Pas le temps" → Formation EMPOWER 30 min à distance, sans contrainte horaire
- "Trop cher" → Marge récurrente +25% via EMPOWER sur 3 ans, ROI prouvé
- "Travaille avec concurrent" → Norton grand public + TPE, complémentaire non substituable
- "Mauvaise expérience plateforme" → Support dédié nouveau portail 2025, accompagnement CDS
- "Pas de demande client" → NSB clé en main TPE 1-20 postes, ESD zéro rupture

RÉPONSE FORMAT JSON STRICT :
{
  "type_appel": "RÉACTIVATION_SELL_IN | RELANCE_SELL_IN | ONBOARDING_EMPOWER | SUIVI_EMPOWER",
  "resume": "max 3 phrases : ce que le client a dit · frein · intention",
  "frein_detecte": "...",
  "concurrent_detecte": "...",
  "produit_detecte": "...",
  "score": 1,
  "action_recommandee": "action unique précise pour le CDS",
  "deadline_action_jours": 7,
  "alerte_cds": false,
  "alerte_welcome_pack": false,
  "alerte_next_step": false
}
Réponds UNIQUEMENT avec le JSON, sans texte autour.`,

  // ── La clé est côté Apps Script — jamais dans le navigateur ──
  estConfigure() { return Session.estConnecte(); },

  async sauverCle(cle) {
    const r = await fetch(SheetsAPI.BASE_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setGroqKey', token: SheetsAPI.TOKEN, cle }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok) throw new Error(data.erreur || 'Erreur');
    return true;
  },

  // ── Enregistrement micro 30s max ──
  async demarrerEnregistrement(onStop) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._chunks = [];
    this._mediaRecorder = new MediaRecorder(stream);
    this._mediaRecorder.ondataavailable = e => this._chunks.push(e.data);
    this._mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      onStop(new Blob(this._chunks, { type: this._mediaRecorder.mimeType }));
    };
    this._mediaRecorder.start();
    setTimeout(() => this.arreterEnregistrement(), this.RECORD_SECONDS * 1000);
  },

  arreterEnregistrement() {
    if (this._mediaRecorder && this._mediaRecorder.state === 'recording') {
      this._mediaRecorder.stop();
    }
  },

  // ── STT Whisper via proxy Apps Script ──
  // Audio converti en base64 côté client → Apps Script appelle Groq
  // → seule la transcription est retournée, l'audio n'est jamais stocké
  async transcrire(blob) {
    if (!this.estConfigure()) throw new Error('Non connecté');
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => res(reader.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    });
    const r = await fetch(SheetsAPI.BASE_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:   'groqSTT',
        token:    SheetsAPI.TOKEN,
        audio:    base64,
        mimeType: blob.type || 'audio/webm',
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok) throw new Error(data.erreur || 'Erreur STT');
    return data.texte || '';
  },

  // ── LLM via proxy Apps Script ──
  async _chat(messages, jsonMode = true) {
    if (!this.estConfigure()) throw new Error('Non connecté');
    const r = await fetch(SheetsAPI.BASE_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:      'groqLLM',
        token:       SheetsAPI.TOKEN,
        model:       this.LLM_MODEL,
        temperature: this.TEMPERATURE,
        messages,
        jsonMode,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok) throw new Error(data.erreur || 'Erreur LLM');
    return data.texte || '';
  },

  async qualifier(transcription, contexte = {}) {
    const ctx = Object.entries(contexte).filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`).join(' · ');
    const content = await this._chat([
      { role: 'system', content: this.SYSTEM_PROMPT },
      { role: 'user', content: `CONTEXTE COMPTE : ${ctx || 'inconnu'}\n\nTRANSCRIPTION / NOTES :\n${transcription}` },
    ]);
    const parsed = safeJSON(content);
    if (!parsed) throw new Error('Réponse IA non parsable');
    return parsed;
  },

  async genererScript(contexte = {}) {
    const ctx = Object.entries(contexte).filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`).join(' · ');
    return this._chat([
      { role: 'system', content: this.SYSTEM_PROMPT },
      { role: 'user', content: `Génère un script d'accroche téléphonique court (4 phrases max, ton direct et pro) pour ce compte : ${ctx}. Réponds en texte simple, pas en JSON.` },
    ], false);
  },
};
