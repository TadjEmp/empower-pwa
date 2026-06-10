// ═══════════════════════════════════════
//  vue-phoning.js — Module Phoning IA
//  Pré-appel (script Groq) → Enregistrement 30s →
//  Qualification auto → Post-appel → 📞_PHONING
//  Cible : 🏢_COMPTES ou 📋_PROSPECTS
// ═══════════════════════════════════════

const VuePhoning = {

  state: null,

  _etatInitial() {
    return {
      phase: 'PRE',                 // PRE | CALL | POST
      chargement: true, envoiEnCours: false,
      comptes: [], prospects: [],
      typeSource: 'EXISTANT', cible: null,
      recherche: '', script: '', scriptEnCours: false,
      enregistre: false, transcription: '', qualif: null,
      d: {
        objectif: '', accroche: '',
        statutAppel: '', interetEmpower: '', frein: '',
        prochaineAction: '', dateRappel: '', note: '',
      },
    };
  },

  async init(idCible = null) {
    this.state = this._etatInitial();
    this.render();
    try {
      const [comptes, prospects] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
      ]);
      this.state.comptes   = comptes.filter(c => Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin);
      this.state.prospects = prospects.filter(p => Session.voitTout() || !p.PIN_CDS_Assigne || Number(p.PIN_CDS_Assigne) === Session.pin);
      if (idCible) {
        const c = comptes.find(x => String(x.ID_Compte) === String(idCible));
        const p = !c && prospects.find(x => String(x.ID_Prospect) === String(idCible));
        if (c) { this.state.cible = c; this.state.typeSource = 'EXISTANT'; }
        if (p) { this.state.cible = p; this.state.typeSource = 'PROSPECT'; }
        if (this.state.cible) this.state.recherche = this.state.cible.Nom_Compte;
      }
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  get sourceListe() { return this.state.typeSource === 'EXISTANT' ? this.state.comptes : this.state.prospects; },
  get suggestions() {
    const q = normaliserNom(this.state.recherche);
    if (q.length < 2) return [];
    return this.sourceListe.filter(c => normaliserNom(c.Nom_Compte).includes(q)).slice(0, 6);
  },

  setSource(s) { this.state.typeSource = s; this.state.cible = null; this.state.recherche = ''; this.render(); },
  setRecherche(v) {
    this.state.recherche = v;
    if (this.state.cible && v !== this.state.cible.Nom_Compte) this.state.cible = null;
    this._renderSuggestions();
  },
  choisirCible(i) {
    this.state.cible = this.suggestions[i];
    this.state.recherche = this.state.cible.Nom_Compte;
    this.render();
  },
  _renderSuggestions() {
    const zone = document.getElementById('ph-suggestions');
    if (!zone) return;
    zone.innerHTML = this.suggestions.map((c, i) => `
      <div class="q-arbre-btn" style="margin-top:4px" onclick="VuePhoning.choisirCible(${i})">
        <strong>${c.Nom_Compte}</strong>
        <span style="color:var(--c-text-2);font-size:12px"> · ${c.Ville || '—'}</span>
      </div>`).join('');
  },

  set(c, v)  { this.state.d[c] = v; },
  setR(c, v) { this.state.d[c] = v; this.render(); },

  _semainesSilence() {
    const c = this.state.cible;
    const ref = c?.Date_Derniere_Action || c?.Date_dernière_action;
    if (!ref) return null;
    return Math.floor((Date.now() - new Date(ref).getTime()) / (7 * 86400000));
  },

  // ── Script d'accroche IA ──
  async genererScript() {
    if (!this.state.cible) { Toast.afficher('Sélectionnez un compte d\'abord', 'warning'); return; }
    if (!GroqAPI.estConfigure()) {
      const k = prompt('Clé API Groq (gsk_…) :');
      if (!k) return;
      GroqAPI.setKey(k);
    }
    this.state.scriptEnCours = true;
    this.render();
    try {
      const c = this.state.cible;
      this.state.script = await GroqAPI.genererScript({
        compte: c.Nom_Compte, statut: c.STATUT_COMPTE || c.Statut,
        canal: c.CANAL, semaines_silence: this._semainesSilence(),
        ca_fy25: c.CA_FY25, objectif_appel: this.state.d.objectif,
      });
    } catch(e) { Toast.afficher('❌ IA : ' + e.message, 'erreur'); }
    this.state.scriptEnCours = false;
    this.render();
  },

  demarrerAppel() {
    if (!this.state.cible) { Toast.afficher('Sélectionnez un compte', 'warning'); return; }
    this.state.phase = 'CALL';
    this.render();
  },

  // ── Enregistrement + qualification ──
  async toggleEnregistrement() {
    if (this.state.enregistre) { GroqAPI.arreterEnregistrement(); return; }
    if (!GroqAPI.estConfigure()) {
      const k = prompt('Clé API Groq (gsk_…) :');
      if (!k) return;
      GroqAPI.setKey(k);
    }
    try {
      this.state.enregistre = true;
      this.render();
      await GroqAPI.demarrerEnregistrement(async blob => {
        this.state.enregistre = false;
        this.render();
        Toast.afficher('🤖 Transcription + qualification…', 'info', 4000);
        try {
          const txt = await GroqAPI.transcrire(blob);
          this.state.transcription = txt;
          const c = this.state.cible;
          const q = await GroqAPI.qualifier(txt, {
            compte: c.Nom_Compte, statut: c.STATUT_COMPTE || c.Statut,
            semaines_silence: this._semainesSilence(),
          });
          this.state.qualif = q;
          // Pré-remplissage post-appel depuis l'IA
          const d = this.state.d;
          if (!d.frein) d.frein = q.frein_detecte || '';
          if (!d.prochaineAction) d.prochaineAction = q.action_recommandee || '';
          if (q.deadline_action_jours && !d.dateRappel) {
            d.dateRappel = new Date(Date.now() + q.deadline_action_jours * 86400000).toISOString().slice(0, 10);
          }
          d.note = (d.note ? d.note + '\n' : '') + (q.resume || txt);
          Toast.afficher(`✅ Qualifié : ${q.type_appel} · score ${q.score}/5`, 'succes', 4000);
        } catch(e) { Toast.afficher('❌ IA : ' + e.message, 'erreur'); }
        this.state.phase = 'POST';
        this.render();
      });
    } catch(e) {
      this.state.enregistre = false;
      this.render();
      Toast.afficher('🎙️ Micro inaccessible : ' + e.message, 'erreur');
    }
  },

  passerAuPost() { this.state.phase = 'POST'; this.render(); },

  // ── Enregistrement final ──
  async valider() {
    if (this.state.envoiEnCours) return;
    const s = this.state, d = s.d, c = s.cible;
    if (!d.statutAppel) { Toast.afficher('Indiquez le statut de l\'appel', 'warning'); return; }
    s.envoiEnCours = true;
    this.render();
    const estProspect = s.typeSource === 'PROSPECT';
    const idCible = estProspect ? c.ID_Prospect : c.ID_Compte;

    try {
      // 1. Ligne 📞_PHONING (colonnes réelles v4.1)
      await SheetsAPI.ecrire('EMPOWER_MDB', '📞_PHONING', {
        ID_Appel: genId('APPEL'),
        Date: new Date().toISOString().slice(0, 10),
        Semaine_ISO: getISOWeek(),
        PIN_CDS: Session.pin, Nom_CDS: Session.nom,
        ID_Cible: idCible, Reseller: c.Nom_Compte,
        Statut_Appel: d.statutAppel,
        Interet_EMPOWER: d.interetEmpower,
        Frein_Principal: d.frein,
        Prochaine_Action: d.prochaineAction,
        Date_Rappel: d.dateRappel,
        Note: [d.note, s.qualif ? `[IA ${s.qualif.type_appel} · ${s.qualif.score}/5]` : ''].filter(Boolean).join('\n'),
        Timestamp: new Date().toISOString(),
      });

      // 2. Maj fiche
      if (estProspect) {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', idCible, {
          Date_prochaine_action: d.dateRappel, Flag_traite: 'TRUE',
        });
      } else {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', idCible, {
          Date_Derniere_Action: new Date().toISOString().slice(0, 10),
          Type_Derniere_Action: 'Appel',
          Prochaine_action: d.prochaineAction,
          Date_prochaine_action: d.dateRappel,
        });
      }

      // 3. Log 📊_ACTIONS
      await SheetsAPI.ecrire('EMPOWER_MDB', '📊_ACTIONS', {
        ID_Action: genId('ACT'), Date_Action: new Date().toISOString(),
        Type_Action: 'Appel', Source: 'ESI', PIN_CDS: Session.pin,
        Nom_Compte: c.Nom_Compte,
        Statut_Avant: c.STATUT_COMPTE || c.Statut || '',
        Statut_Apres: d.statutAppel,
        Resum_IA: s.qualif?.resume || d.note.slice(0, 120),
        GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });

      document.getElementById('app').innerHTML = `
        <div class="visite-succes">
          <div class="succes-icone">📞</div>
          <h2>Appel enregistré</h2>
          <p class="succes-duree">${c.Nom_Compte}</p>
          <div class="succes-recap">
            <div>${d.statutAppel} · Intérêt EMPOWER : ${d.interetEmpower || '—'}</div>
            ${d.prochaineAction ? `<div>🎯 ${d.prochaineAction}${d.dateRappel ? ' — ' + dateRelative(d.dateRappel) : ''}</div>` : ''}
            ${s.qualif?.resume ? `<div>🤖 ${s.qualif.resume}</div>` : ''}
          </div>
          <div class="succes-btns">
            <button class="btn-primaire" onclick="Router.aller('#/dashboard')">← Dashboard</button>
            <button class="btn-secondaire" onclick="VuePhoning.init()">📞 Nouvel appel</button>
          </div>
        </div>`;
    } catch(e) {
      s.envoiEnCours = false;
      this.render();
      Toast.afficher('❌ Erreur : ' + e.message, 'erreur', 5000);
    }
  },

  // ── RENDER ──
  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement du module phoning…</div>';
      return;
    }
    const s = this.state;
    const TITRES = { PRE: 'Pré-appel', CALL: 'Appel en cours', POST: 'Post-appel' };

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="${s.phase === 'PRE' ? 'history.back()' : 'VuePhoning.init()'}" class="btn-retour">←</button>
        <h1>📞 ${TITRES[s.phase]}</h1>
        ${s.cible ? `<span class="badge-compteur">${s.cible.Nom_Compte.slice(0, 16)}</span>` : ''}
      </header>
      <div class="q-contenu avec-nav">${this['_phase' + s.phase]()}</div>
      ${NavBar('phoning')}
    `;
    this._renderSuggestions();
  },

  _phasePRE() {
    const s = this.state, d = s.d;
    const silence = this._semainesSilence();
    return `<div class="q-champs">
      <label class="q-label">Type de base
        <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface)">
          ${[['EXISTANT', 'Base historique'], ['PROSPECT', 'Base prospects']].map(([v, l]) => `
            <button type="button" style="flex:1;padding:9px;border:none;border-radius:4px;font-weight:600;font-size:14px;cursor:pointer;
              ${s.typeSource === v ? 'background:var(--c-title);color:#fff' : 'background:transparent;color:var(--c-text-2)'}"
              onclick="VuePhoning.setSource('${v}')">${l}</button>`).join('')}
        </div>
      </label>
      <label class="q-label">Compte à appeler
        <input class="q-input" placeholder="🔍 Rechercher…" value="${s.recherche}"
               oninput="VuePhoning.setRecherche(this.value)" autocomplete="off"/>
      </label>
      <div id="ph-suggestions"></div>
      ${s.cible ? `<div class="q-recap">
        <div class="q-recap-ligne"><span>Statut</span><strong>${s.cible.STATUT_COMPTE || s.cible.Statut || '—'}</strong></div>
        ${silence !== null ? `<div class="q-recap-ligne"><span>Silence</span><strong>${silence} semaine(s)</strong></div>` : ''}
        ${s.cible.Tel ? `<div class="q-recap-ligne"><span>Téléphone</span><strong><a class="lien-tel" href="tel:${String(s.cible.Tel).replace(/\s/g, '')}">${s.cible.Tel}</a></strong></div>` : ''}
        ${s.cible.CA_FY25 ? `<div class="q-recap-ligne"><span>CA FY25</span><strong>${formatEuro(s.cible.CA_FY25)}</strong></div>` : ''}
      </div>` : ''}
      <label class="q-label">Objectif de l'appel
        <input class="q-input" placeholder="ex : relancer commande Q2" value="${d.objectif}" oninput="VuePhoning.set('objectif', this.value)"/></label>

      <button type="button" class="btn-secondaire" onclick="VuePhoning.genererScript()"
              ${s.scriptEnCours ? 'disabled' : ''}>
        ${s.scriptEnCours ? '🤖 Génération…' : '🤖 Générer un script d\'accroche IA'}
      </button>
      ${s.script ? `<div class="q-recap"><h3>📜 Script suggéré</h3>
        <p style="font-size:13px;line-height:1.6;white-space:pre-wrap">${s.script}</p></div>` : ''}

      <button type="button" class="btn-primaire" onclick="VuePhoning.demarrerAppel()">📞 Démarrer l'appel →</button>
    </div>`;
  },

  _phaseCALL() {
    const s = this.state;
    return `<div class="q-champs" style="align-items:center;text-align:center;padding-top:24px">
      <div style="font-size:48px">${s.enregistre ? '🔴' : '🎙️'}</div>
      <p class="q-intro">${s.enregistre
        ? 'Enregistrement en cours… (30s max — résumez l\'échange à voix haute)'
        : 'Pendant ou juste après l\'appel, enregistrez un résumé vocal de 30s.\nL\'IA transcrira et qualifiera automatiquement.'}</p>
      ${s.cible?.Tel ? `<a class="btn-secondaire" style="text-decoration:none;text-align:center"
        href="tel:${String(s.cible.Tel).replace(/\s/g, '')}">📞 Composer ${s.cible.Tel}</a>` : ''}
      <button type="button" class="${s.enregistre ? 'btn-primaire' : 'btn-primaire'}" style="${s.enregistre ? 'background:var(--c-danger)' : ''}"
              onclick="VuePhoning.toggleEnregistrement()">
        ${s.enregistre ? '⏹ Arrêter l\'enregistrement' : '⏺ Enregistrer le résumé (30s)'}
      </button>
      <button type="button" class="btn-secondaire" onclick="VuePhoning.passerAuPost()">Passer la dictée → saisie manuelle</button>
    </div>`;
  },

  _phasePOST() {
    const s = this.state, d = s.d;
    return `<div class="q-champs">
      ${s.qualif ? `<div class="q-recap">
        <h3>🤖 Qualification IA</h3>
        <div class="q-recap-ligne"><span>Type</span><strong>${s.qualif.type_appel}</strong></div>
        <div class="q-recap-ligne"><span>Score</span><strong>${s.qualif.score}/5</strong></div>
        ${s.qualif.frein_detecte ? `<div class="q-recap-ligne"><span>Frein</span><strong>${s.qualif.frein_detecte}</strong></div>` : ''}
        ${s.qualif.concurrent_detecte ? `<div class="q-recap-ligne"><span>Concurrent</span><strong>${s.qualif.concurrent_detecte}</strong></div>` : ''}
        <p style="font-size:13px;margin-top:8px">${s.qualif.resume || ''}</p>
      </div>` : ''}
      ${s.transcription ? `<details style="font-size:12px;color:var(--c-text-2)">
        <summary>Transcription brute</summary><p>${s.transcription}</p></details>` : ''}

      <label class="q-label">Statut de l'appel ${this._r('statutAppel', ['Répondu', 'Répondeur', 'Occupé', 'Faux numéro', 'Refus'])}</label>
      <label class="q-label">Intérêt EMPOWER ${this._r('interetEmpower', ['Fort', 'Moyen', 'Faible', 'Aucun', 'Déjà inscrit'])}</label>
      <label class="q-label">Frein principal
        <input class="q-input" placeholder="ex : Prix" value="${d.frein}" oninput="VuePhoning.set('frein', this.value)"/></label>
      <label class="q-label">Prochaine action
        <input class="q-input" placeholder="ex : Rappel J+14, envoi comparatif" value="${d.prochaineAction}" oninput="VuePhoning.set('prochaineAction', this.value)"/></label>
      <label class="q-label">Date de rappel
        <input type="date" class="q-input" value="${d.dateRappel}" onchange="VuePhoning.set('dateRappel', this.value)"/></label>
      <label class="q-label">Note
        <textarea class="q-textarea" rows="4" oninput="VuePhoning.set('note', this.value)">${d.note}</textarea></label>

      <button type="button" class="btn-primaire" onclick="VuePhoning.valider()"
              ${s.envoiEnCours ? 'disabled' : ''}>
        ${s.envoiEnCours ? 'Enregistrement…' : '✓ Enregistrer l\'appel'}
      </button>
    </div>`;
  },

  _r(champ, options) {
    return `<div class="q-chips">${options.map(o => `
      <button type="button" class="q-chip ${this.state.d[champ] === o ? 'active' : ''}"
              onclick="VuePhoning.setR('${champ}','${o}')">${o}</button>`).join('')}</div>`;
  },
};
