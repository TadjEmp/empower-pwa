// ═══════════════════════════════════════
//  groq.js — IA Groq : Whisper STT + LLM (B11 — proxy Edge Function ai-proxy)
//  SÉCURITÉ : clé GROQ_API_KEY dans la table params (côté serveur).
//  Audio jamais stocké côté serveur — traité en mémoire uniquement.
// ═══════════════════════════════════════

const GroqAPI = {
  STT_MODEL:      'whisper-large-v3',
  LLM_MODEL:      'llama-3.3-70b-versatile',
  TEMPERATURE:    0.3,
  RECORD_SECONDS: 30,
  _mediaRecorder: null,
  _chunks: [],

  SYSTEM_PROMPT: `Tu es l'assistant commercial IA de l'équipe Norton France — Impact Sales Marketing (ISM).
Tu analyses les appels terrain des CDS (TADJIDINE, LYES, JOHANNE, MEHDI)
et les contacts onboarding d'ALEXANDRA (Channel Manager — sourcing & attribution).

CONTEXTE MÉTIER :
  Programme Sell-In Norton FY27 | Programme EMPOWER (marge 25% récurrente 3 ans)
  Distributeurs : Ingram Micro, TD SYNNEX
  Gamme : Antivirus Plus, 360 Standard, 360 Deluxe 3D/5D, 360 Premium,
           360 Advanced, 360 for Gamers, NSB, Avast Business Hub
  EMPOWER : portail EmpowerReseller.Norton.com — marge 25% sur 3 ans, licences récurrentes

TYPES D'APPEL — détecter automatiquement :
  1. REACTIVATION_SELLIN  → revendeur silencieux ≥8 semaines Ingram/TD SYNNEX
  2. RELANCE_SELLIN       → revendeur actif, relance commande
  3. ONBOARDING_EMPOWER   → prospect pipeline Alexandra, pas encore sur Empower
  4. SUIVI_EMPOWER        → compte Empower existant (blocage / 1ère commande / upsell)

CONTRE-ARGUMENTS VALIDÉS :
  - "Pas le temps"             → Formation EMPOWER 30 min à distance, sans contrainte horaire
  - "Trop cher"                → Marge récurrente 25% via EMPOWER sur 3 ans, ROI prouvé
  - "Travaille avec concurrent"→ Norton grand public/TPE, complémentaire non substituable
  - "Mauvaise expérience"      → Support dédié, nouveau portail 2025, accompagnement CDS
  - "Pas de demande client"    → NSB clé en main TPE 1-20 postes, ESD zéro rupture

CONCURRENTS TERRAIN :
  ESET, Kaspersky, Bitdefender, Malwarebytes, Sophos,
  Avast Business, McAfee, Trellix, Trend Micro, CoffieSoft

RÈGLES DE SCORING (score 1 à 5) :
  1 = Froid, aucun intérêt
  2 = Écoute passive, pas d'engagement
  3 = Intéressé, frein identifié mais surmontable
  4 = Prêt à commander ou s'inscrire sur EMPOWER
  5 = Commande annoncée ou inscription EMPOWER confirmée

RÈGLES D'ALERTE :
  alertecds         = true si score ≥ 3 ET type ONBOARDING_EMPOWER
  alerteflavie      = false (déprécié — sourcing repris par Alexandra, cf. alertealexandra)
  alertealexandra   = true si nouveau potentiel détecté non encore dans pipeline
  alertewelcomepack = true si score ≥ 3 ET welcome pack non encore envoyé
  alertenextstep    = true si prochaine action détectée avec deadline ≤ 7 jours

RÉPONSE — FORMAT JSON STRICT (aucun texte en dehors du JSON) :
{
  "typeappel": "REACTIVATION_SELLIN|RELANCE_SELLIN|ONBOARDING_EMPOWER|SUIVI_EMPOWER",
  "resume": "max 3 phrases — ce que le client a dit, frein principal, intention",
  "freindetecte": "texte libre ou null",
  "concurrentdetecte": "nom concurrent ou null",
  "produitdetecte": "produit mentionné ou null",
  "score": 1,
  "actionrecommandee": "1 action unique, précise, réalisable par le CDS dans les 7 jours",
  "deadlineactionjours": 7,
  "alertecds": false,
  "alerteflavie": false,
  "alertealexandra": false,
  "alertewelcomepack": false,
  "alertenextstep": false
}`,

  // ── La clé est côté serveur (params table) — jamais dans le navigateur ──
  estConfigure() { return Session.estConnecte(); },

  async sauverCle(cle) {
    const r = await fetch(SheetsAPI.BASE_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON },
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

  // ── STT Whisper via proxy Edge Function ──
  // Audio converti en base64 côté client → Edge Function appelle Groq
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
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON },
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

  // ── LLM via proxy Edge Function ──
  async _chat(messages, jsonMode = true) {
    if (!this.estConfigure()) throw new Error('Non connecté');
    const r = await fetch(SheetsAPI.BASE_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPABASE_ANON },
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
