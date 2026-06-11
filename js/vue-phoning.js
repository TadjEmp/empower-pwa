// ═══════════════════════════════════════
//  vue-phoning.js — Module Phoning IA v7
//  Pré-appel (script Groq) → Enregistrement 30s →
//  Qualification auto → Post-appel → 📞_PHONING
//  Cible : 🏢_COMPTES ou 📋_PROSPECTS
//  v7 : liste prospects dédiée + archivage résultat (intéressé / non intéressé)
// ═══════════════════════════════════════

window.VuePhoning = {

  state: null,

  _etatInitial() {
    return {
      phase: 'PRE',
      chargement: true, envoiEnCours: false,
      comptes: [], prospects: [],
      typeSource: 'EXISTANT', cible: null,
      mode: 'APPEL',           // APPEL | LISTE | HISTORIQUE
      filtreListe: 'TOUS',     // TOUS | A_APPELER | RAPPEL | NON_JOIGNABLE
      recherche: '', script: '', scriptEnCours: false,
      enregistre: false, transcription: '', qualif: null,
      d: {
        objectif: '', accroche: '',
        statutAppel: '', interetEmpower: '', frein: '',
        prochaineAction: '', dateRappel: '', note: '',
        resultatProspect: '',
      },
      // R5 — historique appels + edit/delete
      journal: [],
      journalChargement: false,
      modalEditAppel: null,
      confirmDeleteAppelId: null,
      // EX-2 — extraction
      extractOuvert: false,
      extractFiltres: { debut: '', fin: '', cds: 'TOUS', resultat: 'TOUS' },
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

  // Prospects actifs triés pour la liste de phoning
  get listeProspectsTriee() {
    const auj = new Date().toISOString().slice(0, 10);
    const potOrdre = { Fort: 0, Moyen: 1, Faible: 2 };
    const EXCLUS = ['ARCHIVE', 'INTEGRE'];

    let l = this.state.prospects.filter(p =>
      !EXCLUS.includes(String(p.STATUT_EMPOWER || '').toUpperCase())
    );

    const f = this.state.filtreListe;
    if (f === 'A_APPELER') {
      l = l.filter(p => String(p.Flag_traite).toUpperCase() !== 'TRUE');
    } else if (f === 'RAPPEL') {
      l = l.filter(p => p.Date_prochaine_action && String(p.Date_prochaine_action).slice(0, 10) <= auj);
    } else if (f === 'NON_JOIGNABLE') {
      l = l.filter(p => {
        const s = String(p.STATUT_EMPOWER || '').toUpperCase();
        return s === 'NON_JOIGNABLE';
      });
    }

    return l.sort((a, b) => {
      // 1. Rappels échus en premier
      const aRap = a.Date_prochaine_action && String(a.Date_prochaine_action).slice(0, 10) <= auj ? 0 : 1;
      const bRap = b.Date_prochaine_action && String(b.Date_prochaine_action).slice(0, 10) <= auj ? 0 : 1;
      if (aRap !== bRap) return aRap - bRap;
      // 2. Non traités avant traités
      const aT = String(a.Flag_traite).toUpperCase() === 'TRUE' ? 1 : 0;
      const bT = String(b.Flag_traite).toUpperCase() === 'TRUE' ? 1 : 0;
      if (aT !== bT) return aT - bT;
      // 3. Par potentiel Fort > Moyen > Faible
      return (potOrdre[a.POTENTIEL] ?? 1) - (potOrdre[b.POTENTIEL] ?? 1);
    });
  },

  setSource(s)  { this.state.typeSource = s; this.state.cible = null; this.state.recherche = ''; this.render(); },
  setMode(m)    {
    this.state.mode = m;
    if (m === 'LISTE') this.state.typeSource = 'PROSPECT';
    if (m === 'HISTORIQUE') this._chargerJournal();
    this.render();
  },
  setFiltreListe(f) { this.state.filtreListe = f; this.render(); },

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

  // Sélectionner un prospect depuis la liste et passer directement à l'appel
  choisirEtDemarrer(idx) {
    const p = this.listeProspectsTriee[idx];
    if (!p) return;
    this.state.cible = p;
    this.state.typeSource = 'PROSPECT';
    this.state.mode = 'APPEL';
    this.state.phase = 'CALL';
    this.render();
  },

  _renderSuggestions() {
    const zone = document.getElementById('ph-suggestions');
    if (!zone) return;
    const estProspect = this.state.typeSource === 'PROSPECT';
    const potCoul = { Fort: 'var(--c-success)', Moyen: 'var(--c-warning)', Faible: 'var(--c-text-2)' };

    if (estProspect && this.state.recherche.length >= 2 && this.suggestions.length === 0) {
      zone.innerHTML = `
        <div style="padding:10px;font-size:13px;color:var(--c-text-2);text-align:center">
          Aucun prospect trouvé<br>
          <button class="btn-secondaire" style="margin-top:8px;font-size:12px"
            onclick="Router.aller('#/empower-tracker')">➕ Créer "${this.state.recherche}" dans le Tracker →</button>
        </div>`;
      return;
    }

    zone.innerHTML = this.suggestions.map((c, i) => `
      <div class="q-arbre-btn" style="margin-top:4px" onclick="VuePhoning.choisirCible(${i})">
        <div style="display:flex;align-items:center;gap:8px">
          <strong>${c.Nom_Compte}</strong>
          ${estProspect && c.POTENTIEL ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;background:${potCoul[c.POTENTIEL]||'#888'};color:#fff">${c.POTENTIEL}</span>` : ''}
        </div>
        <span style="color:var(--c-text-2);font-size:12px">
          ${c.Ville || '—'}
          ${estProspect && c.Note_initiale ? ' · ' + String(c.Note_initiale).slice(0, 40) : ''}
        </span>
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
    // Information RGPD avant 1er enregistrement (Section 10 V2.1)
    const key = 'esi_rgpd_phoning_ok';
    if (!localStorage.getItem(key)) {
      const ok = confirm('ℹ️ Information RGPD\n\nConformément au RGPD :\n• Aucun fichier audio ne sera stocké côté serveur\n• Seule la transcription textuelle sera conservée dans les notes d\'appel\n• L\'audio est traité en mémoire et immédiatement effacé\n\nEn continuant, vous acceptez cette condition.');
      if (!ok) return;
      localStorage.setItem(key, '1');
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
          const d = this.state.d;
          if (!d.frein) d.frein = q.frein_detecte || '';
          if (!d.prochaineAction) d.prochaineAction = q.action_recommandee || '';
          if (q.deadline_action_jours && !d.dateRappel) {
            d.dateRappel = new Date(Date.now() + q.deadline_action_jours * 86400000).toISOString().slice(0, 10);
          }
          d.note = (d.note ? d.note + '\n' : '') + (q.resume || txt);
          // Auto-suggestion résultat prospect depuis score IA
          if (this.state.typeSource === 'PROSPECT' && !d.resultatProspect) {
            if (q.score >= 4)      d.resultatProspect = 'INTERESSE';
            else if (q.score <= 1) d.resultatProspect = 'NON_INTERESSE';
            else                   d.resultatProspect = 'RAPPELER';
          }
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

  // ── Enregistrement final + archivage prospect ──
  async valider() {
    if (this.state.envoiEnCours) return;
    const s = this.state, d = s.d, c = s.cible;
    if (!d.statutAppel) { Toast.afficher('Indiquez le statut de l\'appel', 'warning'); return; }
    s.envoiEnCours = true;
    this.render();
    const estProspect = s.typeSource === 'PROSPECT';
    const idCible = estProspect ? c.ID_Prospect : c.ID_Compte;

    try {
      // 1. Ligne 📞_PHONING
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

      // 2. Mise à jour fiche
      if (estProspect) {
        const maj = { Date_prochaine_action: d.dateRappel, Flag_traite: 'TRUE' };
        const res = d.resultatProspect;

        if (res === 'NON_INTERESSE') {
          // Archivage définitif
          maj.STATUT_EMPOWER = 'ARCHIVE';
          maj.FLAG_ACTION = 'ARCHIVE';
          maj.Note_initiale = (c.Note_initiale ? c.Note_initiale + '\n' : '')
            + `[NON_INTERESSE ${new Date().toISOString().slice(0, 10)}]${d.frein ? ' · ' + d.frein : ''}`;
        } else if (res === 'INTERESSE') {
          // Avancement pipeline vers EN_COURS
          maj.STATUT_EMPOWER = 'EN_COURS';
          maj.FLAG_ACTION = 'EN_COURS';
        } else if (res === 'NON_JOIGNABLE' || res === 'RAPPELER') {
          // Reste en pipeline, rappel planifié
          maj.Flag_traite = 'FALSE';
        }

        await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', idCible, maj);
        // Sync état local
        const local = s.prospects.find(p => p.ID_Prospect === idCible);
        if (local) Object.assign(local, maj);
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
        Statut_Avant: c.STATUT_COMPTE || c.Statut || c.STATUT_EMPOWER || '',
        Statut_Apres: d.resultatProspect || d.statutAppel,
        Resum_IA: s.qualif?.resume || d.note.slice(0, 120),
        GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });

      const msgResultat = {
        INTERESSE:      '✅ Lead avancé <strong>EN COURS</strong> dans le Tracker',
        NON_INTERESSE:  '🗄️ Prospect <strong>archivé</strong> (non intéressé)',
        NON_JOIGNABLE:  '📵 Rappel planifié · prospect non joignable',
        RAPPELER:       '🔔 Rappel planifié',
      }[d.resultatProspect] || '';

      document.getElementById('app').innerHTML = `
        <div class="visite-succes">
          <div class="succes-icone">📞</div>
          <h2>Appel enregistré</h2>
          <p class="succes-duree">${c.Nom_Compte}</p>
          <div class="succes-recap">
            <div>${d.statutAppel} · Intérêt EMPOWER : ${d.interetEmpower || '—'}</div>
            ${msgResultat ? `<div>${msgResultat}</div>` : ''}
            ${d.prochaineAction ? `<div>🎯 ${d.prochaineAction}${d.dateRappel ? ' — ' + dateRelative(d.dateRappel) : ''}</div>` : ''}
            ${s.qualif?.resume ? `<div>🤖 ${s.qualif.resume}</div>` : ''}
          </div>
          <div class="succes-btns">
            <button class="btn-primaire" onclick="Router.aller('#/dashboard')">← Dashboard</button>
            ${estProspect
              ? `<button class="btn-secondaire" onclick="VuePhoning.init();VuePhoning.setMode('LISTE')">📋 Reprendre la liste</button>`
              : `<button class="btn-secondaire" onclick="VuePhoning.init()">📞 Nouvel appel</button>`}
          </div>
        </div>`;
    } catch(e) {
      s.envoiEnCours = false;
      this.render();
      Toast.afficher('❌ Erreur : ' + e.message, 'erreur', 5000);
    }
  },

  // ── R5 : Journal des appels (chargement) ──
  async _chargerJournal() {
    this.state.journalChargement = true;
    this.render();
    try {
      const data = await SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING');
      this.state.journal = data
        .filter(a => String(a.deleted || '').toUpperCase() !== 'TRUE')
        .filter(a => Session.voitTout() || Number(a.PIN_CDS) === Session.pin)
        .sort((a, b) => (b.Date || '').localeCompare(a.Date || ''))
        .slice(0, 100);
    } catch(e) { Toast.afficher('❌ Chargement journal : ' + e.message, 'erreur'); }
    this.state.journalChargement = false;
    this.render();
  },

  // ── R5 : Édition appel ──
  ouvrirEditAppel(id) {
    const a = this.state.journal.find(x => x.ID_Appel === id);
    if (!a) return;
    if (!Session.voitTout() && Number(a.PIN_CDS) !== Session.pin) {
      Toast.afficher('Vous ne pouvez modifier que vos propres appels', 'warning'); return;
    }
    this.state.modalEditAppel = {
      id,
      date:           (a.Date || '').slice(0, 10),
      compte:         a.Reseller || '',
      statut:         a.Statut_Appel || '',
      interet:        a.Interet_EMPOWER || '',
      frein:          a.Frein_Principal || '',
      prochaineAction: a.Prochaine_Action || '',
      dateRappel:     a.Date_Rappel || '',
      note:           a.Note || '',
    };
    this.render();
  },

  fermerEditAppel() { this.state.modalEditAppel = null; this.render(); },

  async sauvegarderEditAppel(e) {
    e.preventDefault();
    const m = this.state.modalEditAppel;
    try {
      const maj = {
        Statut_Appel:     m.statut,
        Interet_EMPOWER:  m.interet,
        Frein_Principal:  m.frein,
        Prochaine_Action: m.prochaineAction,
        Date_Rappel:      m.dateRappel,
        Note:             m.note,
      };
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📞_PHONING', m.id, maj);
      const local = this.state.journal.find(a => a.ID_Appel === m.id);
      if (local) Object.assign(local, maj);
      this.state.modalEditAppel = null;
      Toast.afficher('✅ Appel modifié', 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  // ── R5 : Suppression appel (soft delete) ──
  demanderSuppressionAppel(id) {
    const a = this.state.journal.find(x => x.ID_Appel === id);
    if (!a) return;
    if (!Session.voitTout() && Number(a.PIN_CDS) !== Session.pin) {
      Toast.afficher('Vous ne pouvez supprimer que vos propres appels', 'warning'); return;
    }
    this.state.confirmDeleteAppelId = id;
    this.render();
  },

  async confirmerSuppressionAppel() {
    const id = this.state.confirmDeleteAppelId;
    if (!id) return;
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📞_PHONING', id, {
        deleted:    'TRUE',
        deleted_at: new Date().toISOString(),
        deleted_by: Session.nom,
      });
      this.state.journal = this.state.journal.filter(a => a.ID_Appel !== id);
      this.state.confirmDeleteAppelId = null;
      Toast.afficher('🗑️ Appel supprimé (soft delete)', 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  annulerSuppressionAppel() { this.state.confirmDeleteAppelId = null; this.render(); },

  // ── EX-2 : Extraction phoning ──
  ouvrirExtraction()  { this.state.extractOuvert = true; this._chargerJournal(); },
  fermerExtraction()  { this.state.extractOuvert = false; this.render(); },

  exporterPhoning() {
    const f    = this.state.extractFiltres;
    const data = this.state.journal.filter(a => {
      const date = (a.Date || '').slice(0, 10);
      if (f.debut && date < f.debut) return false;
      if (f.fin   && date > f.fin)   return false;
      if (f.cds !== 'TOUS' && String(a.PIN_CDS) !== f.cds) return false;
      if (f.resultat !== 'TOUS' && a.Statut_Appel !== f.resultat) return false;
      return true;
    });
    if (!data.length) { Toast.afficher('Aucun appel pour ces filtres', 'warning'); return; }

    const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fn = `PHONING_${f.debut || 'debut'}_${f.fin || 'fin'}_${ts}.csv`;

    const rows = data.map(a => ({
      ID_Appel:          a.ID_Appel || '',
      Date:              (a.Date || '').slice(0, 10),
      Semaine_ISO:       a.Semaine_ISO || '',
      CDS:               a.Nom_CDS || '',
      PIN_CDS:           a.PIN_CDS || '',
      Compte:            a.Reseller || '',
      Canal:             a.Canal || '',
      Statut_Appel:      a.Statut_Appel || '',
      Interet_EMPOWER:   a.Interet_EMPOWER || '',
      Frein_Principal:   a.Frein_Principal || '',
      Prochaine_Action:  a.Prochaine_Action || '',
      Date_Rappel:       a.Date_Rappel || '',
      Transcription:     a.Transcription || '',
      Note:              a.Note || '',
    }));

    generateCSV(rows, fn);
    this.state.extractOuvert = false;
    this.render();
  },

  // ── R5 : Vue journal des appels ──
  _renderJournal() {
    const s = this.state;
    if (s.journalChargement) {
      return '<div style="padding:32px;text-align:center;color:var(--c-text-2)">Chargement du journal…</div>';
    }
    if (!s.journal.length) {
      return '<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucun appel enregistré.</div>';
    }
    const COUL = { Répondu: 'var(--c-success)', Répondeur: 'var(--c-warning)', Occupé: 'var(--c-warning)', 'Faux numéro': 'var(--c-danger)', Refus: 'var(--c-danger)' };
    return `<div class="q-champs">
      ${s.journal.map(a => {
        const peutModif = Session.voitTout() || Number(a.PIN_CDS) === Session.pin;
        const coul = COUL[a.Statut_Appel] || 'var(--c-text-2)';
        return `
        <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:11px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-size:11px;color:var(--c-text-2)">${(a.Date || '').slice(0, 10)}</span>
            <strong style="font-size:14px;flex:1">${a.Reseller || '—'}</strong>
            <span style="font-size:11px;font-weight:700;color:${coul}">${a.Statut_Appel || '—'}</span>
          </div>
          ${a.Interet_EMPOWER ? `<div style="font-size:12px;color:var(--c-text-2)">Intérêt : ${a.Interet_EMPOWER}</div>` : ''}
          ${a.Frein_Principal ? `<div style="font-size:12px;color:var(--c-text-2)">Frein : ${a.Frein_Principal}</div>` : ''}
          ${a.Note ? `<div style="font-size:12px;font-style:italic;color:var(--c-text-2);margin-top:4px">${String(a.Note).slice(0, 80)}${a.Note.length > 80 ? '…' : ''}</div>` : ''}
          ${peutModif ? `
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn-secondaire" style="padding:5px 10px;font-size:12px;width:auto"
                    onclick="VuePhoning.ouvrirEditAppel('${a.ID_Appel}')">✏️ Modifier</button>
            <button class="btn-secondaire" style="padding:5px 10px;font-size:12px;width:auto;color:var(--c-danger);border-color:var(--c-danger)"
                    onclick="VuePhoning.demanderSuppressionAppel('${a.ID_Appel}')">🗑️</button>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  },

  // ── Modal édition appel ──
  _renderModalEditAppel() {
    const m = this.state.modalEditAppel;
    if (!m) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.fermerEditAppel()">
      <div class="modal">
        <h3>✏️ Modifier l'appel — ${m.compte}</h3>
        <form onsubmit="VuePhoning.sauvegarderEditAppel(event)">
          <label>Statut appel
            <div class="q-chips">
              ${['Répondu','Répondeur','Occupé','Faux numéro','Refus'].map(o =>
                `<button type="button" class="q-chip ${m.statut === o ? 'active' : ''}"
                  onclick="VuePhoning.state.modalEditAppel.statut='${o}';VuePhoning.render()">${o}</button>`
              ).join('')}
            </div>
          </label>
          <label>Intérêt EMPOWER
            <div class="q-chips">
              ${['Fort','Moyen','Faible','Aucun','Déjà inscrit'].map(o =>
                `<button type="button" class="q-chip ${m.interet === o ? 'active' : ''}"
                  onclick="VuePhoning.state.modalEditAppel.interet='${o}';VuePhoning.render()">${o}</button>`
              ).join('')}
            </div>
          </label>
          <label>Frein principal
            <input class="q-input" value="${m.frein}"
                   oninput="VuePhoning.state.modalEditAppel.frein=this.value"/></label>
          <label>Prochaine action
            <input class="q-input" value="${m.prochaineAction}"
                   oninput="VuePhoning.state.modalEditAppel.prochaineAction=this.value"/></label>
          <label>Date rappel
            <input type="date" class="q-input" value="${m.dateRappel}"
                   onchange="VuePhoning.state.modalEditAppel.dateRappel=this.value"/></label>
          <label>Note
            <textarea class="q-textarea" rows="3"
                      oninput="VuePhoning.state.modalEditAppel.note=this.value">${m.note}</textarea></label>
          <div class="modal-btns">
            <button type="button" onclick="VuePhoning.fermerEditAppel()">Annuler</button>
            <button type="submit" class="btn-primaire">💾 Enregistrer</button>
          </div>
        </form>
      </div>
    </div>`;
  },

  // ── Confirmation suppression appel ──
  _renderConfirmDeleteAppel() {
    if (!this.state.confirmDeleteAppelId) return '';
    const a = this.state.journal.find(x => x.ID_Appel === this.state.confirmDeleteAppelId);
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.annulerSuppressionAppel()">
      <div class="modal" style="max-width:360px">
        <h3 style="color:var(--c-danger)">🗑️ Supprimer cet appel ?</h3>
        <p style="font-size:14px;margin:12px 0"><strong>${a ? a.Reseller : ''}</strong> — ${a ? (a.Date || '').slice(0, 10) : ''}</p>
        <p style="font-size:12px;color:var(--c-text-2)">Suppression logique uniquement — la ligne est conservée en base.</p>
        <div class="modal-btns">
          <button onclick="VuePhoning.annulerSuppressionAppel()">Annuler</button>
          <button class="btn-primaire" style="background:var(--c-danger)"
                  onclick="VuePhoning.confirmerSuppressionAppel()">🗑️ Confirmer</button>
        </div>
      </div>
    </div>`;
  },

  // ── EX-2 : Panneau extraction CSV ──
  _renderExtraction() {
    if (!this.state.extractOuvert) return '';
    const f   = this.state.extractFiltres;
    const cnt = this.state.journal.filter(a => {
      const date = (a.Date || '').slice(0, 10);
      if (f.debut && date < f.debut) return false;
      if (f.fin   && date > f.fin)   return false;
      if (f.cds !== 'TOUS' && String(a.PIN_CDS) !== f.cds) return false;
      if (f.resultat !== 'TOUS' && a.Statut_Appel !== f.resultat) return false;
      return true;
    }).length;

    const cdsUniq = [...new Set(this.state.journal.map(a => a.PIN_CDS).filter(Boolean))];
    const cdsList = cdsUniq.map(pin => {
      const a = this.state.journal.find(x => String(x.PIN_CDS) === String(pin));
      return { pin: String(pin), nom: a?.Nom_CDS || `PIN ${pin}` };
    });

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.fermerExtraction()">
      <div class="modal" style="max-width:420px">
        <h3>📤 Extraction — Suivi phoning</h3>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <label style="flex:1">Date début
            <input type="date" value="${f.debut}"
                   onchange="VuePhoning.state.extractFiltres.debut=this.value;VuePhoning.render()"/></label>
          <label style="flex:1">Date fin
            <input type="date" value="${f.fin}"
                   onchange="VuePhoning.state.extractFiltres.fin=this.value;VuePhoning.render()"/></label>
        </div>
        <label>Commercial
          <select onchange="VuePhoning.state.extractFiltres.cds=this.value;VuePhoning.render()">
            <option value="TOUS" ${f.cds === 'TOUS' ? 'selected' : ''}>Tous</option>
            ${cdsList.map(c => `<option value="${c.pin}" ${f.cds === c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
          </select>
        </label>
        <label>Résultat
          <select onchange="VuePhoning.state.extractFiltres.resultat=this.value;VuePhoning.render()">
            <option value="TOUS" ${f.resultat === 'TOUS' ? 'selected' : ''}>Tous</option>
            ${['Répondu','Répondeur','Occupé','Faux numéro','Refus'].map(r =>
              `<option value="${r}" ${f.resultat === r ? 'selected' : ''}>${r}</option>`
            ).join('')}
          </select>
        </label>
        <div style="background:var(--c-bg);border-radius:var(--radius-sm);padding:12px;text-align:center;margin:12px 0;border:1px solid var(--c-border)">
          <span style="font-size:22px;font-weight:800;color:var(--c-primary)">${cnt}</span>
          <span style="font-size:13px;color:var(--c-text-2);margin-left:6px">appel(s) trouvé(s)</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondaire" style="flex:1" onclick="VuePhoning.fermerExtraction()">Fermer</button>
          <button class="btn-primaire" style="flex:2" onclick="VuePhoning.exporterPhoning()"
                  ${cnt === 0 ? 'disabled' : ''}>📥 Exporter CSV</button>
        </div>
      </div>
    </div>`;
  },

  // ── RENDER ──
  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement du module phoning…</div>';
      return;
    }
    const s = this.state;
    const TITRES = { PRE: 'Phoning', CALL: 'Appel en cours', POST: 'Post-appel' };
    const peutExtraire = Session.voitTout();

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="${s.phase === 'PRE' ? 'history.back()' : 'VuePhoning.init()'}" class="btn-retour">←</button>
        <h1>📞 ${s.mode === 'HISTORIQUE' ? 'Journal appels' : TITRES[s.phase]}</h1>
        <div style="display:flex;gap:6px">
          ${peutExtraire ? `<button class="btn-retour" title="Extraction CSV" onclick="VuePhoning.ouvrirExtraction()">📤</button>` : ''}
          ${s.cible ? `<span class="badge-compteur">${s.cible.Nom_Compte.slice(0, 14)}</span>` : ''}
        </div>
      </header>
      <div class="q-contenu avec-nav">
        ${s.mode === 'HISTORIQUE' ? this._renderJournal() : this['_phase' + s.phase]()}
      </div>
      ${NavBar('phoning')}
      ${this._renderModalEditAppel()}
      ${this._renderConfirmDeleteAppel()}
      ${this._renderExtraction()}
    `;
    if (s.mode !== 'HISTORIQUE') this._renderSuggestions();
  },

  _phasePRE() {
    const s = this.state, d = s.d;
    const silence = this._semainesSilence();

    const modeTabs = `
      <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface);margin-bottom:16px">
        ${[['APPEL','☎️ Appel'],['LISTE','📋 Liste'],['HISTORIQUE','📖 Journal']].map(([v, l]) => `
          <button type="button" style="flex:1;padding:9px;border:none;border-radius:4px;font-weight:600;font-size:12px;cursor:pointer;
            ${s.mode === v ? 'background:var(--c-title);color:#fff' : 'background:transparent;color:var(--c-text-2)'}"
            onclick="VuePhoning.setMode('${v}')">${l}</button>`).join('')}
      </div>`;

    if (s.mode === 'LISTE') return modeTabs + this._renderListeProspects();

    return `<div class="q-champs">
      ${modeTabs}
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
        <div class="q-recap-ligne"><span>Statut</span><strong>${s.cible.STATUT_COMPTE || s.cible.STATUT_EMPOWER || s.cible.Statut || '—'}</strong></div>
        ${s.cible.POTENTIEL ? `<div class="q-recap-ligne"><span>Potentiel</span><strong>${s.cible.POTENTIEL}</strong></div>` : ''}
        ${silence !== null ? `<div class="q-recap-ligne"><span>Silence</span><strong>${silence} semaine(s)</strong></div>` : ''}
        ${s.cible.Tel ? `<div class="q-recap-ligne"><span>Téléphone</span><strong><a class="lien-tel" href="tel:${String(s.cible.Tel).replace(/\s/g, '')}">${s.cible.Tel}</a></strong></div>` : ''}
        ${s.cible.CA_FY25 ? `<div class="q-recap-ligne"><span>CA FY25</span><strong>${formatEuro(s.cible.CA_FY25)}</strong></div>` : ''}
        ${s.cible.Note_initiale ? `<div style="font-size:12px;color:var(--c-text-2);padding-top:6px;font-style:italic">${String(s.cible.Note_initiale).slice(0, 100)}</div>` : ''}
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

  // ── Liste de phoning prospects ──
  _renderListeProspects() {
    const s = this.state;
    const auj = new Date().toISOString().slice(0, 10);
    const EXCLUS = ['ARCHIVE', 'INTEGRE'];
    const actifs = s.prospects.filter(p => !EXCLUS.includes(String(p.STATUT_EMPOWER || '').toUpperCase()));
    const liste  = this.listeProspectsTriee;
    const potCoul = { Fort: 'var(--c-success)', Moyen: 'var(--c-warning)', Faible: 'var(--c-text-2)' };

    const nTotal    = actifs.length;
    const nAAppeler = actifs.filter(p => String(p.Flag_traite).toUpperCase() !== 'TRUE').length;
    const nRappel   = actifs.filter(p => p.Date_prochaine_action && String(p.Date_prochaine_action).slice(0, 10) <= auj).length;

    const filtres = { TOUS: 'Tous', A_APPELER: 'À appeler', RAPPEL: 'Rappel dû', NON_JOIGNABLE: 'Non joignable' };

    return `<div class="q-champs">
      <!-- Compteurs -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <div style="flex:1;background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:var(--c-title)">${nTotal}</div>
          <div style="font-size:11px;color:var(--c-text-2)">Total actifs</div>
        </div>
        <div style="flex:1;background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:var(--c-primary)">${nAAppeler}</div>
          <div style="font-size:11px;color:var(--c-text-2)">À appeler</div>
        </div>
        <div style="flex:1;background:var(--c-surface);border:1.5px solid ${nRappel ? 'var(--c-danger)' : 'var(--c-border)'};border-radius:var(--radius-sm);padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:${nRappel ? 'var(--c-danger)' : 'var(--c-text-2)'}">${nRappel}</div>
          <div style="font-size:11px;color:var(--c-text-2)">Rappels dus</div>
        </div>
      </div>

      <!-- Filtres -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        ${Object.entries(filtres).map(([f, l]) => `
          <button class="btn-filtre ${s.filtreListe === f ? 'actif' : ''}"
                  onclick="VuePhoning.setFiltreListe('${f}')">${l}</button>`).join('')}
      </div>

      <!-- Cartes prospects -->
      ${liste.length === 0
        ? '<div style="padding:24px;text-align:center;color:var(--c-text-2)">Aucun prospect pour ce filtre</div>'
        : liste.map((p, i) => {
            const rappelDu = p.Date_prochaine_action && String(p.Date_prochaine_action).slice(0, 10) <= auj;
            const nonTraite = String(p.Flag_traite).toUpperCase() !== 'TRUE';
            const origineLabel = (p.ORIGINE || '').replace('Import_PROSPECTS_', '').replace(/_/g, ' ');
            return `
          <div style="background:var(--c-surface);border:1.5px solid ${rappelDu ? 'var(--c-danger)' : 'var(--c-border)'};border-radius:var(--radius-sm);padding:12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:15px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.Nom_Compte}</span>
              ${p.POTENTIEL ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${potCoul[p.POTENTIEL]||'#888'};color:#fff;flex-shrink:0">${p.POTENTIEL}</span>` : ''}
              ${nonTraite ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:var(--c-primary);color:#fff;flex-shrink:0">À appeler</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--c-text-2);margin-bottom:6px">
              ${p.Ville ? `📍 ${p.Ville}` : ''}${origineLabel ? ` · ${origineLabel}` : ''}
              ${rappelDu && p.Date_prochaine_action ? ` · ⏰ <span style="color:var(--c-danger);font-weight:600">${dateRelative(p.Date_prochaine_action)}</span>` : ''}
            </div>
            ${p.Note_initiale ? `<div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px;font-style:italic">${String(p.Note_initiale).slice(0, 80)}${String(p.Note_initiale).length > 80 ? '…' : ''}</div>` : ''}
            ${p.Tel ? `<div style="font-size:13px;margin-bottom:8px"><a class="lien-tel" href="tel:${String(p.Tel).replace(/\s/g,'')}">📞 ${p.Tel}</a></div>` : ''}
            <button class="btn-primaire" style="width:100%;font-size:13px;padding:10px"
                    onclick="VuePhoning.choisirEtDemarrer(${i})">📞 Démarrer l'appel</button>
          </div>`;
          }).join('')
      }

      <button class="btn-secondaire" style="width:100%;margin-top:8px"
              onclick="Router.aller('#/empower-tracker')">➕ Ajouter un prospect dans le Tracker</button>
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
      <button type="button" class="btn-primaire" style="${s.enregistre ? 'background:var(--c-danger)' : ''}"
              onclick="VuePhoning.toggleEnregistrement()">
        ${s.enregistre ? '⏹ Arrêter l\'enregistrement' : '⏺ Enregistrer le résumé (30s)'}
      </button>
      <button type="button" class="btn-secondaire" onclick="VuePhoning.passerAuPost()">Passer la dictée → saisie manuelle</button>
    </div>`;
  },

  _phasePOST() {
    const s = this.state, d = s.d;
    const estProspect = s.typeSource === 'PROSPECT';
    const infoResultat = {
      INTERESSE:     '✅ Le lead sera avancé <strong>EN COURS</strong> dans le Tracker',
      NON_INTERESSE: '🗄️ Le prospect sera <strong>archivé</strong> définitivement',
      NON_JOIGNABLE: '📵 Rappel planifié · statut conservé',
      RAPPELER:      '🔔 Rappel planifié à la date choisie',
    }[d.resultatProspect] || 'Sélectionnez un résultat pour archiver automatiquement';

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

      ${estProspect ? `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:12px;margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.04em;margin-bottom:8px">📋 RÉSULTAT DU PROSPECT</div>
        ${this._r('resultatProspect', ['INTERESSE', 'RAPPELER', 'NON_JOIGNABLE', 'NON_INTERESSE'])}
        <div style="font-size:11px;color:var(--c-text-2);margin-top:6px">${infoResultat}</div>
      </div>` : ''}

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
