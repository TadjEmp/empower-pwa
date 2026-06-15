// ═══════════════════════════════════════
//  vue-visites.js — Module VISITES v6
//  R5 : edit + soft delete + dupliquer
//  EX-1 : extraction CSV filtrée (Manager / Alexandra)
//  Source : 🗺️_VISITES · 🏢_COMPTES uniquement (R1 : plus de PROSPECTS)
// ═══════════════════════════════════════

window.VueVisites = {

  // Bloc 3 : vocabulaire statuts aligné spec — Planifiée / En cours / Réalisée / Annulée
  STATUTS: ['planifiée', 'en cours', 'réalisée', 'annulée'],
  STATUT_COULEURS: {
    'planifiée': 'var(--c-primary)',
    'en cours':  'var(--c-warning)',
    'réalisée':  'var(--c-success)',
    'annulée':   'var(--c-text-2)',
    // tolérance ancien libellé en base
    'reportée':  'var(--c-warning)',
  },
  // libellés d'affichage (capitalisés, jamais undefined)
  _labelStatut(s) {
    const v = (s || 'planifiée').toLowerCase();
    const map = {
      'planifiée': 'Planifiée', 'en cours': 'En cours',
      'réalisée': 'Réalisée', 'annulée': 'Annulée', 'reportée': 'Reportée',
    };
    return map[v] || (v.charAt(0).toUpperCase() + v.slice(1)) || '—';
  },

  state: {
    sousVue: 'planning',
    visites: [],
    chargement: true,
    erreur: null,
    dateVue: null,
    modeVue: 'jour',
    visitePlanifiee: null,
    modalPlanif: false,
    comptes: [],
    formPlanif: {},
    // R5 — edit / delete
    modalEdition: null,
    confirmDeleteId: null,
    // EX-1 — extraction
    extractOuvert: false,
    extractFiltres: { debut: '', fin: '', statut: 'TOUS', cds: 'TOUS' },
  },

  async init(sousVue = 'planning', param = null) {
    this.state.sousVue = sousVue;
    this.state.visitePlanifiee = param ? this._trouverVisite(param) : null;
    this.state.chargement = true;
    this.state.dateVue = this.state.dateVue || dateISOLocale();
    this._resetFormPlanif();
    this.render();

    try {
      // R1 : on ne charge plus 📋_PROSPECTS — uniquement 🏢_COMPTES
      const [visites, comptes] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES'),
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
      ]);
      this.state.visites = visites
        .filter(v => String(v.deleted || '').toUpperCase() !== 'TRUE')
        .filter(v => Session.voitTout() || Number(v.PIN_CDS) === Session.pin);
      this.state.comptes = comptes
        .filter(c => Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin)
        .map(c => this._enrichirCompte(c));

      if (param && sousVue === 'cr') {
        this.state.visitePlanifiee = this.state.visites.find(v => v.ID_Visite === param) || null;
      }
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      this.state.erreur = e.message;
      this.render();
    }
  },

  _trouverVisite(id) {
    return (this.state.visites || []).find(v => v.ID_Visite === id) || null;
  },

  // ── Bloc 3 : SCORE RELANCE (URGENT → STANDARD) + données fiche compte ──
  _semainesSilence(c) {
    const ref = c.Date_Derniere_Action || c['Date_dernière_action'] ||
                c.PREMIERE_COMMANDE_DATE || c.Date_Derniere_Commande || '';
    if (!ref) return null;
    const t = new Date(ref).getTime();
    if (isNaN(t)) return null;
    const w = Math.floor((Date.now() - t) / (7 * 86400000));
    return w >= 0 ? w : null;
  },

  _enrichirCompte(c) {
    const statut  = String(c.STATUT_COMPTE || c.FLAG_ACTION || '').toUpperCase();
    const urgent  = statut.includes('URGENT') || statut.includes('CHURN');
    const facteur = urgent ? 2.0 : (statut.includes('REACTIVER') ? 1.0 : 0.5);
    const caFy26  = parseCA(c.CA_FY26);
    const silence = this._semainesSilence(c);
    // score relance = poids statut + ancienneté silence (relances anciennes prioritaires)
    const score   = facteur * 100 + (silence || 0);
    return {
      ID_Compte:     c.ID_Compte || '',
      Nom_Compte:    c.Nom_Compte || '—',
      Ville:         c.Ville || '',
      CANAL:         c.CANAL || '',
      caFy26,                                   // number|null
      potentiel:     c.POTENTIEL || c.Priorite || '—',
      hasEmpower:    String(c.HAS_EMPOWER || '').toUpperCase() === 'TRUE',
      silence,                                  // number|null
      urgent,
      score,
      _raw:          c,
    };
  },

  // comptes triés pour le sélecteur de planification (URGENT → STANDARD)
  get comptesTries() {
    return [...this.state.comptes].sort((a, b) => (b.score || 0) - (a.score || 0));
  },

  // mini fiche compte (Bloc 3 : CA FY26, dernier Q, semaines silence, POTENTIEL)
  _ficheCompteSelectionne(idCompte) {
    if (!idCompte) return '';
    const c = this.state.comptes.find(x => x.ID_Compte === idCompte);
    if (!c) return '';
    const dernierQ = parseCA(c._raw.CA_Q1FY27);
    const cell = (lbl, val) =>
      `<div style="flex:1;min-width:80px"><div style="font-size:10px;color:var(--c-text-2);text-transform:uppercase">${lbl}</div><div style="font-size:13px;font-weight:700">${val}</div></div>`;
    return `
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin:-4px 0 10px;padding:10px;background:var(--c-bg);border-radius:var(--radius-sm);border:1px solid var(--c-border)">
        ${cell('CA FY26', fmtCA(c.caFy26))}
        ${cell('Dernier Q', dernierQ != null ? fmtCA(dernierQ) : '—')}
        ${cell('Silence', c.silence != null ? c.silence + ' sem.' : '—')}
        ${cell('Potentiel', c.potentiel || '—')}
        ${c.urgent ? `<div style="flex-basis:100%;font-size:11px;color:var(--c-danger);font-weight:700">🔴 Relance URGENTE</div>` : ''}
      </div>`;
  },

  _resetFormPlanif() {
    const now = new Date();
    this.state.formPlanif = {
      date:  dateISOLocale(now),
      heure: '09:00',
      typeVisite: 'SUIVI_ACTIF',
      idCible: '', nomCible: '',
      horsBase: false, nomLibre: '',
      commentairePrep: '',
      prochaineEtape: '',
      // BLOC 1 — recherche dans le déroulé base commerciale
      rechercheCompte: '',
    };
  },

  get visitesJour() {
    return this.state.visites
      .filter(v => (v.Date || v.Date_Planif || '').slice(0, 10) === this.state.dateVue)
      .sort((a, b) => (a.Heure || '').localeCompare(b.Heure || ''));
  },

  get visitesSemaine() {
    const d = new Date(this.state.dateVue);
    const lundi = new Date(d);
    lundi.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const jours = Array.from({ length: 7 }, (_, i) => {
      const j = new Date(lundi);
      j.setDate(lundi.getDate() + i);
      return dateISOLocale(j);
    });
    return jours.map(iso => ({
      iso,
      label: new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
      visites: this.state.visites
        .filter(v => (v.Date || v.Date_Planif || '').slice(0, 10) === iso)
        .sort((a, b) => (a.Heure || '').localeCompare(b.Heure || '')),
    }));
  },

  // ── Bloc 3 : historique des visites réalisées ──
  get visitesRealisees() {
    return this.state.visites
      .filter(v => (v.Statut_Visite || '').toLowerCase() === 'réalisée')
      .sort((a, b) => (b.Date || b.Date_Planif || '').localeCompare(a.Date || a.Date_Planif || ''));
  },

  get nbPlanifAujourdHui() {
    const today = dateISOLocale();
    return this.state.visites.filter(v =>
      (v.Date || v.Date_Planif || '').slice(0, 10) === today &&
      (v.Statut_Visite || 'planifiée') === 'planifiée'
    ).length;
  },

  // ── Navigation dates ──
  jourPrecedent() {
    const d = new Date(this.state.dateVue);
    d.setDate(d.getDate() - (this.state.modeVue === 'semaine' ? 7 : 1));
    this.state.dateVue = dateISOLocale(d);
    this.render();
  },
  jourSuivant() {
    const d = new Date(this.state.dateVue);
    d.setDate(d.getDate() + (this.state.modeVue === 'semaine' ? 7 : 1));
    this.state.dateVue = dateISOLocale(d);
    this.render();
  },
  allerAujourdhui() {
    this.state.dateVue = dateISOLocale();
    this.render();
  },
  setModeVue(mode) { this.state.modeVue = mode; this.render(); },

  // ── Bloc 3 : passage Planifiée → En cours (déverrouille le questionnaire) ──
  async demarrerVisite(idVisite) {
    const v = this.state.visites.find(x => x.ID_Visite === idVisite);
    if (!v) { Toast.afficher('Visite introuvable', 'warning'); return; }
    if (!Session.voitTout() && Number(v.PIN_CDS) !== Session.pin) {
      Toast.afficher('Vous ne pouvez démarrer que vos propres visites', 'warning'); return;
    }
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🗺️_VISITES', idVisite, { Statut_Visite: 'en cours' });
      v.Statut_Visite = 'en cours';
      Toast.afficher('▶️ Visite en cours — questionnaire déverrouillé', 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  // ── Compte-rendu (Bloc 3 : accessible SEULEMENT si Statut_Visite = "En cours") ──
  ouvrirCR(idVisite) {
    const v = this.state.visites.find(x => x.ID_Visite === idVisite);
    if (!v) { Toast.afficher('Visite introuvable', 'warning'); return; }
    const statut = (v.Statut_Visite || 'planifiée').toLowerCase();
    if (statut !== 'en cours') {
      Toast.afficher('Démarrez la visite ("En cours") avant de remplir le questionnaire', 'warning');
      return;
    }
    this.state.visitePlanifiee = v;
    if (window.VueQuestionnaire) {
      VueQuestionnaire.init(v.ID_Cible || null);
      VueQuestionnaire._visitePlanifiee = v;
    }
    Router.aller(`#/questionnaire${v.ID_Cible ? '/' + v.ID_Cible : ''}`);
  },

  // ── Planifier ──
  ouvrirModal()  { this.state.modalPlanif = true; this.render(); },
  fermerModal()  { this.state.modalPlanif = false; this.render(); },

  setCible(id, nom) {
    this.state.formPlanif.idCible  = id;
    this.state.formPlanif.nomCible = nom;
    this.render();
  },

  async planifier(e) {
    e.preventDefault();
    const f = this.state.formPlanif;
    const nomFinal = f.horsBase ? (f.nomLibre || '').trim() : f.nomCible;
    if (!nomFinal) { Toast.afficher(f.horsBase ? 'Indiquez le nom du compte' : 'Sélectionnez un compte', 'warning'); return; }

    // BLOC 4 — Détection doublon avant enregistrement
    const idCibleCheck = f.horsBase ? 'HORS_BASE' : f.idCible;
    const doublon = this.state.visites.find(v =>
      String(v.deleted || '').toUpperCase() !== 'TRUE' &&
      (f.horsBase
        ? (v.Source_Visite === 'HORS_BASE' && normaliserNom(v.Nom_Compte) === normaliserNom(nomFinal))
        : v.ID_Cible === idCibleCheck) &&
      (v.Date || v.Date_Planif || '').slice(0, 10) === f.date &&
      String(v.PIN_CDS) === String(Session.pin) &&
      v.Type_Visite === f.typeVisite
    );
    if (doublon) {
      Toast.afficher(`⚠️ Visite déjà planifiée pour "${nomFinal}" le ${f.date} (${this._labelStatut(doublon.Statut_Visite)}) — doublon bloqué`, 'warning');
      return;
    }

    try {
      const visite = {
        ID_Visite:              genId('VIS'),
        Date:                   f.date,
        Heure:                  f.heure,
        Semaine_ISO:            getISOWeek(new Date(f.date)),
        PIN_CDS:                Session.pin,
        Nom_CDS:                Session.nom,
        ID_Cible:               f.horsBase ? 'HORS_BASE' : f.idCible,
        Nom_Compte:             nomFinal,
        Source_Visite:          f.horsBase ? 'HORS_BASE' : 'ESI_V21',
        Type_Visite:            f.typeVisite,
        Statut_Visite:          'planifiée',
        Note_Privee:            f.commentairePrep,
        Prochaine_Action_Texte: f.prochaineEtape,
        Timestamp:              new Date().toISOString(),
      };
      await SheetsAPI.ecrire('EMPOWER_MDB', '🗺️_VISITES', visite);
      this.state.visites.unshift(visite);
      this.state.dateVue = f.date;
      this.state.modalPlanif = false;
      Toast.afficher(`✅ Visite planifiée — ${nomFinal} le ${f.date}`, 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  // ── R5 : Édition ──
  ouvrirEdition(idVisite) {
    const v = this.state.visites.find(x => x.ID_Visite === idVisite);
    if (!v) return;
    if (!Session.voitTout() && Number(v.PIN_CDS) !== Session.pin) {
      Toast.afficher('Vous ne pouvez modifier que vos propres visites', 'warning'); return;
    }
    this.state.modalEdition = {
      id:              idVisite,
      date:            (v.Date || v.Date_Planif || '').slice(0, 10),
      heure:           v.Heure || '',
      typeVisite:      v.Type_Visite || 'SUIVI_ACTIF',
      nomCible:        v.Nom_Compte || '',
      commentairePrep: v.Note_Privee || v.Commentaire_Prep || '',
      prochaineEtape:  v.Prochaine_Action_Texte || '',
      statut:          v.Statut_Visite || 'planifiée',
    };
    this.render();
  },

  fermerEdition() { this.state.modalEdition = null; this.render(); },

  async sauvegarderEdition(e) {
    e.preventDefault();
    const m = this.state.modalEdition;
    try {
      const maj = {
        Date:                   m.date,
        Heure:                  m.heure,
        Type_Visite:            m.typeVisite,
        Statut_Visite:          m.statut,
        Note_Privee:            m.commentairePrep,
        Prochaine_Action_Texte: m.prochaineEtape,
        Semaine_ISO:            getISOWeek(new Date(m.date)),
      };
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🗺️_VISITES', m.id, maj);
      const local = this.state.visites.find(v => v.ID_Visite === m.id);
      if (local) Object.assign(local, maj);
      this.state.modalEdition = null;
      this.state.dateVue = m.date;
      Toast.afficher('✅ Visite modifiée', 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  // ── R5 : Suppression (soft delete) ──
  demanderSuppression(idVisite) {
    const v = this.state.visites.find(x => x.ID_Visite === idVisite);
    if (!v) return;
    if (!Session.voitTout() && Number(v.PIN_CDS) !== Session.pin) {
      Toast.afficher('Vous ne pouvez supprimer que vos propres visites', 'warning'); return;
    }
    this.state.confirmDeleteId = idVisite;
    this.render();
  },

  async confirmerSuppression() {
    const id = this.state.confirmDeleteId;
    if (!id) return;
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🗺️_VISITES', id, {
        deleted:    'TRUE',
        deleted_at: new Date().toISOString(),
        deleted_by: Session.nom,
      });
      this.state.visites = this.state.visites.filter(v => v.ID_Visite !== id);
      this.state.confirmDeleteId = null;
      Toast.afficher('🗑️ Visite supprimée', 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  annulerSuppression() { this.state.confirmDeleteId = null; this.render(); },

  // ── R5 : Dupliquer ──
  async dupliquerVisite(idVisite) {
    const v = this.state.visites.find(x => x.ID_Visite === idVisite);
    if (!v) return;
    const d7 = new Date();
    d7.setDate(d7.getDate() + 7);
    const dateDup = dateISOLocale(d7);

    // BLOC 4 — Anti-doublon pour la duplication
    const doublonDup = this.state.visites.find(x =>
      String(x.deleted || '').toUpperCase() !== 'TRUE' &&
      x.ID_Cible === (v.ID_Cible || '') &&
      (x.Date || x.Date_Planif || '').slice(0, 10) === dateDup &&
      String(x.PIN_CDS) === String(Session.pin)
    );
    if (doublonDup) {
      Toast.afficher(`⚠️ Une visite pour "${v.Nom_Compte}" le ${dateDup} existe déjà — duplication annulée`, 'warning');
      return;
    }

    const dup = {
      ID_Visite:              genId('VIS'),
      Date:                   dateDup,
      Heure:                  v.Heure || '09:00',
      Semaine_ISO:            getISOWeek(d7),
      PIN_CDS:                Session.pin,
      Nom_CDS:                Session.nom,
      ID_Cible:               v.ID_Cible || '',
      Nom_Compte:             v.Nom_Compte || '',
      Type_Visite:            v.Type_Visite || 'SUIVI_ACTIF',
      Statut_Visite:          'planifiée',
      Source_Visite:          'ESI_V21_DUP',
      Note_Privee:            v.Note_Privee || '',
      Prochaine_Action_Texte: v.Prochaine_Action_Texte || '',
      Timestamp:              new Date().toISOString(),
    };
    try {
      await SheetsAPI.ecrire('EMPOWER_MDB', '🗺️_VISITES', dup);
      this.state.visites.unshift(dup);
      this.state.dateVue = dateDup;
      Toast.afficher(`📋 Visite dupliquée → ${dateDup}`, 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  // ── Synchroniser ──
  async synchroniser() {
    Toast.afficher('🔄 Synchronisation…', 'info', 3000);
    try {
      await SheetsAPI.viderCache('EMPOWER_MDB', '🗺️_VISITES');
      await this.init(this.state.sousVue);
      Toast.afficher('✅ Visites synchronisées', 'succes');
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  // ── EX-1 : Extraction CSV (Manager + Alexandra) ──
  ouvrirExtraction()  { this.state.extractOuvert = true; this.render(); },
  fermerExtraction()  { this.state.extractOuvert = false; this.render(); },

  _matchExtraction(v) {
    const f = this.state.extractFiltres;
    const date = (v.Date || v.Date_Planif || '').slice(0, 10);
    if (f.debut && date < f.debut) return false;
    if (f.fin   && date > f.fin)   return false;
    if (f.statut !== 'TOUS' &&
        (v.Statut_Visite || 'planifiée').toLowerCase() !== f.statut.toLowerCase()) return false;
    if (f.cds !== 'TOUS' && String(v.PIN_CDS) !== f.cds) return false;
    return true;
  },

  get extractionCount() {
    return this.state.visites.filter(v => this._matchExtraction(v)).length;
  },

  exporterVisites() {
    const f = this.state.extractFiltres;
    const data = this.state.visites.filter(v => this._matchExtraction(v));
    if (!data.length) { Toast.afficher('Aucune visite pour ces filtres', 'warning'); return; }

    const debut = f.debut || 'debut';
    const fin   = f.fin   || 'fin';
    const ts    = dateISOLocale().replace(/-/g, '');
    const fn    = `VISITES_${debut}_${fin}_${ts}.csv`;

    const rows = data.map(v => ({
      ID_Visite:        v.ID_Visite || '',
      Date:             (v.Date || v.Date_Planif || '').slice(0, 10),
      Heure:            v.Heure || '',
      Semaine_ISO:      v.Semaine_ISO || '',
      CDS:              resolveCDS(v.PIN_CDS || v.Nom_CDS) || '',
      Compte:           v.Nom_Compte || '',
      ID_Cible:         v.ID_Cible || '',
      Type_Visite:      v.Type_Visite || '',
      Statut:           this._labelStatut(v.Statut_Visite),
      Canal:            v.Canal || '',
      Interlocuteur:    v.Interlocuteur || '',
      Commande_Prise:   v.Commande_Prise || '',
      Produit_Discute:  v.Produit_Principal || '',
      Frein:            v.Frein_Principal || '',
      Engagement:       v.Niveau_Engagement || '',
      Prochaine_Action: v.Prochaine_Action_Texte || '',
      Date_Prochain:    v.Date_Prochain_Contact || '',
      Resume_IA:        v.Resume_IA || '',
      Note:             v.Note_Privee || '',
      Photo_URL:        v.Photo_URL || '',
      GPS:              (v.GPS_Lat && v.GPS_Lng) ? `${v.GPS_Lat},${v.GPS_Lng}` : '',
      Timestamp:        v.Timestamp || '',
    }));

    generateCSV(rows, fn);
    this.state.extractOuvert = false;
    this.render();
  },

  // ── Carte visite (R5 : boutons edit/delete/dupliquer) ──
  _carteVisite(v) {
    const statut = (v.Statut_Visite || 'planifiée').toLowerCase();
    const coul   = this.STATUT_COULEURS[statut] || 'var(--c-text-2)';
    const isPlanif    = statut === 'planifiée' || statut === 'reportée';
    const isEnCours   = statut === 'en cours';
    const peutModif   = Session.voitTout() || Number(v.PIN_CDS) === Session.pin;
    const cdsNom = Session.voitTout() ? resolveCDS(v.PIN_CDS || v.Nom_CDS) : '';

    return `
      <div class="carte-visite" style="border-left:4px solid ${coul}">
        <div class="cv-head">
          <span class="cv-heure">${v.Heure || '—'}</span>
          <span class="cv-statut" style="color:${coul}">${this._labelStatut(statut)}</span>
        </div>
        <div class="cv-nom">${v.Nom_Compte || '—'}</div>
        ${v.Type_Visite ? `<div class="cv-type">${String(v.Type_Visite).replace(/_/g,' ')}</div>` : ''}
        ${cdsNom && cdsNom !== '—' ? `<div class="cv-type" style="color:var(--c-text-2);font-size:11px">👤 ${cdsNom}</div>` : ''}
        ${(v.Note_Privee || v.Commentaire_Prep) ? `<div class="cv-note">📝 ${(v.Note_Privee || v.Commentaire_Prep).slice(0, 80)}</div>` : ''}
        <div class="cv-actions" style="gap:6px;flex-wrap:wrap">
          ${isPlanif ? `
            <button class="btn-primaire" style="padding:8px 14px;font-size:13px;width:auto"
                    onclick="VueVisites.demarrerVisite('${v.ID_Visite}')">
              ▶️ Démarrer
            </button>` : ''}
          ${isEnCours ? `
            <button class="btn-primaire" style="padding:8px 14px;font-size:13px;width:auto"
                    onclick="VueVisites.ouvrirCR('${v.ID_Visite}')">
              ✍️ Compte-rendu
            </button>` : ''}
          ${(!isPlanif && !isEnCours) ? `
            <button class="btn-secondaire" style="padding:6px 12px;font-size:12px;width:auto"
                    onclick="Router.aller('#/compte/${v.ID_Cible || ''}')">
              📋 Fiche compte
            </button>` : ''}
          ${peutModif ? `
            <button class="btn-secondaire" title="Modifier" style="padding:6px 11px;font-size:13px;width:auto"
                    onclick="VueVisites.ouvrirEdition('${v.ID_Visite}')">✏️</button>
            <button class="btn-secondaire" title="Dupliquer (J+7)" style="padding:6px 11px;font-size:13px;width:auto"
                    onclick="VueVisites.dupliquerVisite('${v.ID_Visite}')">📋+</button>
            <button class="btn-secondaire" title="Supprimer" style="padding:6px 11px;font-size:13px;width:auto;color:var(--c-danger);border-color:var(--c-danger)"
                    onclick="VueVisites.demanderSuppression('${v.ID_Visite}')">🗑️</button>
          ` : ''}
        </div>
      </div>`;
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement du planning…</div>';
      return;
    }
    if (this.state.erreur) {
      app.innerHTML = `<div class="erreur">Erreur : ${this.state.erreur}
        <br><br><button class="btn-secondaire" onclick="VueVisites.init()">Réessayer</button></div>`;
      return;
    }

    const today      = dateISOLocale();
    const estAujd    = this.state.dateVue === today;
    const dateLbl    = new Date(this.state.dateVue + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    let contenu = '';
    if (this.state.modeVue === 'historique') {
      const hist = this.visitesRealisees;
      contenu = hist.length === 0
        ? `<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucune visite réalisée pour l'instant.</div>`
        : `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
             <span style="font-size:13px;color:var(--c-text-2)">${hist.length} visite(s) réalisée(s)</span>
             <button class="btn-secondaire" style="width:auto;padding:6px 12px;font-size:12px" onclick="VueVisites.ouvrirExtraction()">📤 Export CSV</button>
           </div>
           ${hist.map(v => this._carteVisite(v)).join('')}`;
    } else if (this.state.modeVue === 'jour') {
      const vj = this.visitesJour;
      contenu = vj.length === 0
        ? `<div style="padding:32px;text-align:center;color:var(--c-text-2)">
             Aucune visite ce jour.
             <br><button class="btn-secondaire" style="margin-top:16px;width:auto;padding:10px 20px"
                         onclick="VueVisites.ouvrirModal()">+ Planifier une visite</button>
           </div>`
        : vj.map(v => this._carteVisite(v)).join('');
    } else {
      const semaine = this.visitesSemaine;
      contenu = `
        <div class="planning-semaine">
          ${semaine.map(j => `
            <div class="planning-jour ${j.iso === today ? 'planning-jour-today' : ''}"
                 onclick="VueVisites.state.dateVue='${j.iso}';VueVisites.state.modeVue='jour';VueVisites.render()">
              <div class="pj-label">${j.label}</div>
              <div class="pj-count">${j.visites.length ? j.visites.length + 'v' : ''}</div>
              ${j.visites.slice(0, 3).map(v => `
                <div class="pj-item" style="border-left:3px solid ${this.STATUT_COULEURS[v.Statut_Visite || 'planifiée']}">
                  <span class="pj-heure">${v.Heure || '—'}</span>
                  <span class="pj-nom">${(v.Nom_Compte || '').slice(0, 14)}</span>
                </div>`).join('')}
              ${j.visites.length > 3 ? `<div class="pj-plus">+${j.visites.length - 3}</div>` : ''}
            </div>
          `).join('')}
        </div>`;
    }

    // Bloc 3 : export historique accessible aux CDS (sur leurs propres visites, déjà filtrées)
    // + Managers/Admin (toute l'équipe). Tout le monde a donc le bouton.
    const peutExtraire = true;

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Visites</h1>
        <div style="display:flex;gap:6px">
          ${peutExtraire ? `<button class="btn-retour" onclick="VueVisites.ouvrirExtraction()" title="Extraction CSV">📤</button>` : ''}
          <button class="btn-retour" onclick="VueVisites.synchroniser()" title="Synchroniser">🔄</button>
          <button class="btn-retour" onclick="VueVisites.ouvrirModal()" title="Planifier">＋</button>
        </div>
      </header>

      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--c-surface);border-bottom:1px solid var(--c-border)">
        <button class="btn-filtre ${this.state.modeVue === 'jour' ? 'actif' : ''}" onclick="VueVisites.setModeVue('jour')">Jour</button>
        <button class="btn-filtre ${this.state.modeVue === 'semaine' ? 'actif' : ''}" onclick="VueVisites.setModeVue('semaine')">Semaine</button>
        <button class="btn-filtre ${this.state.modeVue === 'historique' ? 'actif' : ''}" onclick="VueVisites.setModeVue('historique')">Historique</button>
        ${this.state.modeVue !== 'historique' ? `
        <div style="margin-left:auto;display:flex;align-items:center;gap:6px">
          <button class="btn-retour" onclick="VueVisites.jourPrecedent()">‹</button>
          <span style="font-size:13px;font-weight:600;white-space:nowrap">${this.state.modeVue === 'jour' ? dateLbl : 'Semaine en cours'}</span>
          <button class="btn-retour" onclick="VueVisites.jourSuivant()">›</button>
          ${!estAujd ? `<button class="btn-filtre" style="font-size:11px;padding:4px 8px" onclick="VueVisites.allerAujourdhui()">Auj.</button>` : ''}
        </div>` : ''}
      </div>

      <div class="avec-nav" style="padding:12px">
        ${contenu}
      </div>

      ${NavBar('visites')}
      ${this._renderModal()}
      ${this._renderModalEdition()}
      ${this._renderConfirmDelete()}
      ${this._renderExtraction()}
    `;
  },

  // ── Modal planification (R1 : uniquement comptes) ──
  _renderModal() {
    if (!this.state.modalPlanif) return '';
    const f = this.state.formPlanif;
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueVisites.fermerModal()">
      <div class="modal">
        <h3>📅 Planifier une visite</h3>
        <form onsubmit="VueVisites.planifier(event)">
          <!-- Toggle compte existant / à froid -->
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button type="button" class="btn-filtre ${!f.horsBase ? 'actif' : ''}"
                    onclick="VueVisites.state.formPlanif.horsBase=false;VueVisites.render()">
              🏢 Compte existant
            </button>
            <button type="button" class="btn-filtre ${f.horsBase ? 'actif' : ''}"
                    onclick="VueVisites.state.formPlanif.horsBase=true;VueVisites.render()">
              ❄️ À froid / Hors base
            </button>
          </div>
          ${f.horsBase
            ? `<label>Nom du compte *
                 <input required placeholder="ex : MICRO PLUS INFORMATIQUE" value="${f.nomLibre || ''}"
                        oninput="VueVisites.state.formPlanif.nomLibre=this.value"/>
               </label>
               <div style="font-size:11px;color:var(--c-text-2);margin:-6px 0 10px;padding:6px 10px;background:var(--c-bg);border-radius:var(--radius-sm)">
                 💡 Ce compte n'est pas dans la base. La visite sera enregistrée — vous pourrez l'ajouter dans le Tracker après si besoin.
               </div>`
            : (() => {
              // BLOC 1 — Base commerciale : champ de recherche + déroulé scrollable trié par nom
              const q = normaliserNom(f.rechercheCompte || '');
              const comptesFiltres = q.length >= 2
                ? this.comptesTries.filter(c => normaliserNom(c.Nom_Compte).includes(q) || normaliserNom(c.Ville || '').includes(q))
                : [...this.state.comptes].sort((a, b) => (a.Nom_Compte || '').localeCompare(b.Nom_Compte || '', 'fr'));
              return `
               <label>🔍 Rechercher dans ma base
                 <input placeholder="Nom du compte ou ville…" value="${f.rechercheCompte || ''}"
                        oninput="VueVisites.state.formPlanif.rechercheCompte=this.value;VueVisites.render()"
                        style="margin-bottom:6px"/>
               </label>
               <label>Compte * <span style="font-size:11px;color:var(--c-text-2);font-weight:400">${q.length >= 2 ? comptesFiltres.length + ' résultat(s)' : 'trié par nom · 🔴 urgents en tête si filtré'}</span>
                 <select required size="6" style="height:140px"
                         onchange="VueVisites.setCible(this.value, this.options[this.selectedIndex].dataset.nom)">
                   <option value="">— sélectionner —</option>
                   ${comptesFiltres.map(c =>
                     `<option value="${c.ID_Compte}" data-nom="${c.Nom_Compte}" ${f.idCible === c.ID_Compte ? 'selected' : ''}>${c.urgent ? '🔴 ' : ''}${c.Nom_Compte}${c.Ville ? ' — ' + c.Ville : ''}${c.silence != null ? ' · ' + c.silence + 's' : ''}</option>`
                   ).join('')}
                 </select>
               </label>
               ${this._ficheCompteSelectionne(f.idCible)}`;
            })()
          }
          <div style="display:flex;gap:10px">
            <label style="flex:2">Date *
              <input type="date" required value="${f.date}"
                     onchange="VueVisites.state.formPlanif.date=this.value"/></label>
            <label style="flex:1">Heure
              <input type="time" value="${f.heure}"
                     onchange="VueVisites.state.formPlanif.heure=this.value"/></label>
          </div>
          <label>Type de visite
            <select onchange="VueVisites.state.formPlanif.typeVisite=this.value">
              <option value="SUIVI_ACTIF">Suivi actif</option>
              <option value="PROSPECTION_FROIDE">Prospection froide</option>
              <option value="ONBOARDING_EMPOWER">Onboarding EMPOWER</option>
              <option value="REACTIVER">Réactivation</option>
            </select>
          </label>
          <label>Préparation / contexte
            <textarea rows="2" placeholder="Points à aborder, historique, contexte de la visite…"
              oninput="VueVisites.state.formPlanif.commentairePrep=this.value">${f.commentairePrep || ''}</textarea>
          </label>
          <label>Prochaine étape prévue
            <input placeholder="ex : présenter offre NSB, démo produit, signature…" value="${f.prochaineEtape || ''}"
                   oninput="VueVisites.state.formPlanif.prochaineEtape=this.value"/></label>
          <div class="modal-btns">
            <button type="button" onclick="VueVisites.fermerModal()">Annuler</button>
            <button type="submit" class="btn-primaire">📅 Planifier</button>
          </div>
        </form>
      </div>
    </div>`;
  },

  // ── Modal édition (R5) ──
  _renderModalEdition() {
    const m = this.state.modalEdition;
    if (!m) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueVisites.fermerEdition()">
      <div class="modal">
        <h3>✏️ Modifier la visite</h3>
        <form onsubmit="VueVisites.sauvegarderEdition(event)">
          <div style="display:flex;gap:10px">
            <label style="flex:2">Date *
              <input type="date" required value="${m.date}"
                     onchange="VueVisites.state.modalEdition.date=this.value"/></label>
            <label style="flex:1">Heure
              <input type="time" value="${m.heure}"
                     onchange="VueVisites.state.modalEdition.heure=this.value"/></label>
          </div>
          <label>Type de visite
            <select onchange="VueVisites.state.modalEdition.typeVisite=this.value">
              ${['SUIVI_ACTIF','PROSPECTION_FROIDE','ONBOARDING_EMPOWER','REACTIVER'].map(t =>
                `<option value="${t}" ${m.typeVisite === t ? 'selected' : ''}>${t.replace(/_/g,' ')}</option>`
              ).join('')}
            </select>
          </label>
          <label>Statut
            <select onchange="VueVisites.state.modalEdition.statut=this.value">
              ${this.STATUTS.map(s =>
                `<option value="${s}" ${(m.statut || '').toLowerCase() === s ? 'selected' : ''}>${this._labelStatut(s)}</option>`
              ).join('')}
            </select>
          </label>
          <label>Notes / préparation
            <textarea rows="3" oninput="VueVisites.state.modalEdition.commentairePrep=this.value">${m.commentairePrep}</textarea>
          </label>
          <label>Prochaine étape
            <input value="${m.prochaineEtape}"
                   oninput="VueVisites.state.modalEdition.prochaineEtape=this.value"/></label>
          <div class="modal-btns">
            <button type="button" onclick="VueVisites.fermerEdition()">Annuler</button>
            <button type="submit" class="btn-primaire">💾 Enregistrer</button>
          </div>
        </form>
      </div>
    </div>`;
  },

  // ── Confirmation suppression (R5) ──
  _renderConfirmDelete() {
    if (!this.state.confirmDeleteId) return '';
    const v = this.state.visites.find(x => x.ID_Visite === this.state.confirmDeleteId);
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueVisites.annulerSuppression()">
      <div class="modal" style="max-width:360px">
        <h3 style="color:var(--c-danger)">🗑️ Supprimer cette visite ?</h3>
        <p style="font-size:14px;margin:12px 0"><strong>${v ? v.Nom_Compte : ''}</strong> — ${v ? (v.Date || '').slice(0, 10) : ''}</p>
        <p style="font-size:12px;color:var(--c-text-2)">La visite sera marquée "supprimée" en base (soft delete) et n'apparaîtra plus dans les listes. Aucune suppression physique.</p>
        <div class="modal-btns">
          <button onclick="VueVisites.annulerSuppression()">Annuler</button>
          <button class="btn-primaire" style="background:var(--c-danger)"
                  onclick="VueVisites.confirmerSuppression()">🗑️ Confirmer la suppression</button>
        </div>
      </div>
    </div>`;
  },

  // ── EX-1 : Panneau extraction CSV ──
  _renderExtraction() {
    if (!this.state.extractOuvert) return '';
    const f   = this.state.extractFiltres;
    const cnt = this.extractionCount;

    // liste CDS pour filtre (voitTout uniquement)
    const cdsUniq = [...new Set(this.state.visites.map(v => v.PIN_CDS).filter(Boolean))];
    const cdsList = cdsUniq.map(pin => {
      const nom = resolveCDS(pin);
      return { pin: String(pin), nom: nom && nom !== '—' ? nom : 'Autre' };
    });

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueVisites.fermerExtraction()">
      <div class="modal" style="max-width:420px">
        <h3>📤 Extraction — Suivi des visites</h3>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <label style="flex:1">Date début
            <input type="date" value="${f.debut}"
                   onchange="VueVisites.state.extractFiltres.debut=this.value;VueVisites.render()"/></label>
          <label style="flex:1">Date fin
            <input type="date" value="${f.fin}"
                   onchange="VueVisites.state.extractFiltres.fin=this.value;VueVisites.render()"/></label>
        </div>
        ${Session.voitTout() ? `
        <label>Commercial
          <select onchange="VueVisites.state.extractFiltres.cds=this.value;VueVisites.render()">
            <option value="TOUS" ${f.cds === 'TOUS' ? 'selected' : ''}>Tous</option>
            ${cdsList.map(c => `<option value="${c.pin}" ${f.cds === c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
          </select>
        </label>` : ''}
        <label>Statut
          <select onchange="VueVisites.state.extractFiltres.statut=this.value;VueVisites.render()">
            <option value="TOUS" ${f.statut === 'TOUS' ? 'selected' : ''}>Tous</option>
            ${this.STATUTS.map(s => `<option value="${s}" ${f.statut === s ? 'selected' : ''}>${this._labelStatut(s)}</option>`).join('')}
          </select>
        </label>
        <div style="background:var(--c-bg);border-radius:var(--radius-sm);padding:12px;text-align:center;margin:12px 0;border:1px solid var(--c-border)">
          <span style="font-size:22px;font-weight:800;color:var(--c-primary)">${cnt}</span>
          <span style="font-size:13px;color:var(--c-text-2);margin-left:6px">visite(s) trouvée(s)</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondaire" style="flex:1" onclick="VueVisites.fermerExtraction()">Fermer</button>
          <button class="btn-primaire" style="flex:2" onclick="VueVisites.exporterVisites()"
                  ${cnt === 0 ? 'disabled' : ''}>📥 Exporter CSV</button>
        </div>
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px;text-align:center">Séparateur ; · UTF-8 BOM · Compatible Excel FR</p>
      </div>
    </div>`;
  },
};
