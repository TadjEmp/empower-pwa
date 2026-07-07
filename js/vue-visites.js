// ═══════════════════════════════════════
//  vue-visites.js — Module VISITES v6
//  R5 : edit + soft delete + dupliquer
//  EX-1 : extraction CSV filtrée (Manager / Alexandra)
//  Source : 🗺️_VISITES · 🏢_COMPTES uniquement (R1 : plus de PROSPECTS)
// ═══════════════════════════════════════

window.VueVisites = {

  // Bloc 3 + M6/P6-2 : vocabulaire statuts — Planifiée / En cours / Réalisée / Manquée / Annulée
  STATUTS: ['planifiée', 'en cours', 'réalisée', 'manquée', 'annulée'],
  STATUT_COULEURS: {
    'planifiée': 'var(--c-primary)',   // 🟡 jaune
    'en cours':  'var(--c-warning)',   // 🔵 bleu
    'réalisée':  'var(--c-success)',   // 🟢 vert
    'manquée':   'var(--c-danger)',    // 🔴 rouge — date passée sans synchro
    'annulée':   'var(--c-text-2)',
    // tolérance ancien libellé en base
    'reportée':  'var(--c-warning)',
  },
  // libellés d'affichage (capitalisés, jamais undefined)
  _labelStatut(s) {
    const v = (s || 'planifiée').toLowerCase();
    const map = {
      'planifiée': 'Planifiée', 'en cours': 'En cours',
      'réalisée': 'Réalisée', 'manquée': 'Manquée', 'annulée': 'Annulée', 'reportée': 'Reportée',
    };
    return map[v] || (v.charAt(0).toUpperCase() + v.slice(1)) || '—';
  },

  // ── M6/P6-3 : statut EFFECTIF affiché ──
  // Une visite encore "planifiée" mais dont la date est passée est affichée
  // "manquée" (🔴) au chargement — détection à la volée, SANS écrire en base
  // (réversible : si on replanifie à une date future, elle redevient planifiée).
  _statutEffectif(v) {
    const s = (v.Statut_Visite || 'planifiée').toLowerCase();
    if (s === 'planifiée') {
      const d = (v.Date || v.Date_Planif || '').slice(0, 10);
      if (d && d < dateISOLocale()) return 'manquée';
    }
    return s;
  },

  state: {
    sousVue: 'planning',
    visites: [],
    chargement: true,
    erreur: null,
    dateVue: null,
    modeVue: 'jour',
    // Section 2 cahier des charges — planning groupé par commercial (Manager/Channel)
    commercialSelectionne: null,
    visitePlanifiee: null,
    modalPlanif: false,
    comptes: [],
    formPlanif: {},
    // R5 — edit / delete
    modalEdition: null,
    confirmDeleteId: null,
    // EX-1 — extraction
    extractOuvert: false,
    extractOnglet: 'visites',
    extractFiltres: { debut: '', fin: '', statut: 'TOUS', cds: 'TOUS' },
    // Bloc 9 refonte desktop — fiche compte en panneau docké (split-view),
    // même traitement que VueComptes.ouvrirFiche (≥900px uniquement).
    ficheDockee: null, ficheDockeeChargement: false,
  },

  // ── Bloc 9 — fiche compte : docké sur desktop, plein écran sur mobile ──
  ouvrirFiche(idCompte) {
    if (!idCompte) return;
    if (window.innerWidth < 900) { Router.aller('#/compte/' + idCompte); return; }
    this.state.ficheDockee = idCompte;
    this.state.ficheDockeeChargement = true;
    this.render();
    VueFicheCompte._chargerDonnees(idCompte)
      .then(() => { this.state.ficheDockeeChargement = false; this.render(); })
      .catch(e => {
        this.state.ficheDockeeChargement = false;
        Toast.afficher('❌ ' + e.message, 'erreur');
        this.state.ficheDockee = null;
        this.render();
      });
  },
  fermerFicheDockee() {
    this.state.ficheDockee = null;
    this.render();
  },
  _renderFicheDockee() {
    if (this.state.ficheDockeeChargement) {
      return `
        <div class="modal-overlay modal-docked" onclick="if(event.target===this)VueVisites.fermerFicheDockee()">
          <div class="modal modal-docked-panel">
            <div class="spinner-centre">Chargement de la fiche…</div>
          </div>
        </div>`;
    }
    const c = VueFicheCompte.state.compte;
    return `
      <div class="modal-overlay modal-docked" onclick="if(event.target===this)VueVisites.fermerFicheDockee()">
        <div class="modal modal-docked-panel" style="overflow-y:auto">
          <div class="bloc-titre" style="position:sticky;top:0;background:var(--c-surface);z-index:1;padding-bottom:8px">
            ${c.Nom_Compte}
            <button class="btn-lien" style="margin-left:auto;font-size:13px" onclick="VueVisites.fermerFicheDockee()">✕ Fermer</button>
          </div>
          ${VueFicheCompte.renderContenuFiche()}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="btn-action btn-visite" style="width:auto;flex:1" onclick="Router.aller('#/questionnaire/${c.ID_Compte}')">📋 Visite</button>
            <button class="btn-action btn-appel" style="width:auto;flex:1" onclick="Router.aller('#/phoning/${c.ID_Compte}')">📞 Appeler</button>
            <button class="btn-action" style="width:auto;flex:1;background:var(--c-text-2);color:#fff" onclick="VueFicheCompte.ouvrirRapportPhoning()">📊 Rapport</button>
          </div>
          ${VueFicheCompte.state.modalRapportPhoning ? VueFicheCompte._renderModalRapportPhoning() : ''}
        </div>
      </div>`;
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
      const nbVisitesPlanif = this.state.visites.filter(v =>
        ['planifiée', 'planifiee', 'en cours'].includes((v.Statut_Visite || 'planifiée').toLowerCase())
      ).length;
      if (window.updateNavBadge) updateNavBadge('visites', nbVisitesPlanif);
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

  // ── M6/P6-5 : prospects "à froid" mémorisés en localStorage UNIQUEMENT ──
  // Jamais écrits dans 📋_PROSPECTS. Réutilisables d'une visite à l'autre via
  // datalist, sans polluer la base prospects ni déclencher les alertes managers.
  _CLE_FROID: 'esi_prospects_froid',
  _lireProspectsFroid() {
    try { return JSON.parse(localStorage.getItem(this._CLE_FROID) || '[]'); }
    catch { return []; }
  },
  _memoriserProspectFroid(nom) {
    const n = (nom || '').trim();
    if (!n) return;
    const liste = this._lireProspectsFroid();
    if (!liste.some(x => normaliserNom(x) === normaliserNom(n))) {
      liste.push(n);
      try { localStorage.setItem(this._CLE_FROID, JSON.stringify(liste.slice(-100))); } catch {}
    }
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
    const score   = facteur * 100 + (silence || 0);
    // Dériver département depuis Code_Postal si la colonne Departement est vide
    const dept = c.Departement || c.departement
      || (c.Code_Postal ? String(c.Code_Postal).slice(0, 2) : '')
      || (c.code_postal ? String(c.code_postal).slice(0, 2) : '');
    return {
      ID_Compte:     c.ID_Compte || '',
      Nom_Compte:    c.Nom_Compte || '—',
      Ville:         c.Ville || '',
      Departement:   dept,
      Tel:           c.Tel || '',
      Email:         c.Email || '',
      CANAL:         c.CANAL || '',
      caFy26,
      potentiel:     c.POTENTIEL || c.Priorite || '—',
      hasEmpower:    String(c.HAS_EMPOWER || '').toUpperCase() === 'TRUE',
      silence,
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
        ${c.urgent ? `<div style="flex-basis:100%;font-size:11px;color:var(--c-danger);font-weight:700">Relance URGENTE</div>` : ''}
      </div>`;
  },

  _resetFormPlanif() {
    const now = new Date();
    this.state.formPlanif = {
      date:  dateISOLocale(now),
      heure: '09:00',
      dureeVisite: '60',
      objectifVisite: '',
      typeVisite: 'SUIVI_ACTIF',
      idCible: '', nomCible: '',
      horsBase: false, nomLibre: '',
      // Champs prospect à froid (M1 + M7)
      adresseLibre: '', deptLibre: '', villeLibre: '', telLibre: '', emailLibre: '',
      commentairePrep: '',
      prochaineEtape: '',
      rechercheCompte: '',
      rechercheDept: '',
    };
  },

  // ── M7 : Conversion visite à froid → compte actif ──
  _modalConversion: null,

  ouvrirConversion(idVisite) {
    const v = this.state.visites.find(x => x.ID_Visite === idVisite);
    if (!v) return;
    this._modalConversion = {
      idVisite,
      nomCompte: v.Nom_Compte || '',
      departement: v.Departement || '',
      ville: v.Ville || '',
      tel: v.Tel || '',
      email: v.Email || '',
      canal: v.Canal || 'REVENDEUR',
      note: '',
    };
    this.render();
  },

  fermerConversion() { this._modalConversion = null; this.render(); },

  forcerConversion() {
    this._modalConversion.doublonExistant = null;
    this._modalConversion._forcerDoublon = true;
    this.confirmerConversion();
  },

  async confirmerConversion() {
    const m = this._modalConversion;
    if (!m || !m.nomCompte.trim()) { Toast.afficher('Nom du compte requis', 'warning'); return; }
    // Anti-doublon
    const normNom = normaliserNom(m.nomCompte);
    const dejaLa = this.state.comptes.find(c => normaliserNom(c.Nom_Compte) === normNom);
    if (dejaLa && !m._forcerDoublon) {
      this._modalConversion.doublonExistant = dejaLa;
      this.render();
      return;
    }
    if (this._conversionEnCours) return;
    this._conversionEnCours = true;
    this.render();
    try {
      const idCompte = genId('CPT');
      const aujourd = dateISOLocale();
      await SheetsAPI.ecrire('EMPOWER_MDB', '🏢_COMPTES', {
        ID_Compte:      idCompte,
        Nom_Compte:     m.nomCompte,
        Departement:    m.departement,
        Ville:          m.ville,
        Tel:            m.tel,
        Email:          m.email,
        CANAL:          m.canal,
        PIN_CDS_Assigne: Session.pin,
        Nom_CDS:        Session.nom,
        STATUT_COMPTE:  'ACTIF',
        Source_Import:  'VISITE_FROID_CONVERTI',
        ID_Visite_Origine: m.idVisite,
        Badge_Visite_Froid: 'TRUE',
        Note_Initiale:  m.note,
        Date_Import:    aujourd,
        Timestamp:      new Date().toISOString(),
      });
      // Marquer la visite comme convertie
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🗺️_VISITES', m.idVisite, {
        Flag_Converti: 'TRUE',
        ID_Cible: idCompte,
      });
      const vLocal = this.state.visites.find(v => v.ID_Visite === m.idVisite);
      if (vLocal) { vLocal.Flag_Converti = 'TRUE'; vLocal.ID_Cible = idCompte; }
      // Notifications PIN 1000 (Tadjidine) + PIN 5000 (Alexandra)
      for (const dest of [1000, 5000]) {
        SheetsAPI.ecrire('EMPOWER_MDB', '🔔_NOTIFS', {
          ID_Notif: genId('NOTIF'), Date_Envoi: new Date().toISOString(),
          PIN_Destinataire: dest, Type_Notif: 'CONVERSION_FROID',
          Message: `Nouveau compte actif créé depuis visite à froid : ${m.nomCompte}`,
          ID_Cible: idCompte, Statut_Lu: false, Timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
      this._modalConversion = null;
      Toast.afficher(`✅ Compte actif créé : ${m.nomCompte}`, 'succes', 5000);
      this.render();
    } catch(e) {
      Toast.afficher('❌ ' + e.message, 'erreur');
    } finally {
      this._conversionEnCours = false;
    }
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
    // M6/P6-1 — grille semaine = 5 colonnes Lun→Ven (week-end exclu)
    const jours = Array.from({ length: 5 }, (_, i) => {
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

  // ── Section 2 cahier des charges : groupement du planning par commercial ──
  // (Manager/Channel uniquement — réutilisé identiquement par jour/semaine/historique)
  _grouperParCommercial(liste) {
    const map = new Map();
    (liste || []).forEach(v => {
      const pin = String(v.PIN_CDS || '');
      if (!map.has(pin)) map.set(pin, { pin, nom: resolveCDS(v.PIN_CDS || v.Nom_CDS), visites: [] });
      map.get(pin).visites.push(v);
    });
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  },

  selectionnerCommercial(pin) {
    this.state.commercialSelectionne = pin;
    this.render();
  },

  retourCommerciaux() {
    this.state.commercialSelectionne = null;
    this.render();
  },

  // liste de cartes "commercial" pour la période/mode courant
  _renderCartesCommerciaux(liste) {
    const groupes = this._grouperParCommercial(liste);
    if (!groupes.length) {
      return `<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucune visite pour l'instant.</div>`;
    }
    return groupes.map(g => `
      <div class="carte-visite" style="cursor:pointer" onclick="VueVisites.selectionnerCommercial('${g.pin}')">
        <div class="cv-nom">${g.nom}</div>
        <div class="cv-type">${g.visites.length} visite${g.visites.length > 1 ? 's' : ''}</div>
      </div>`).join('');
  },

  _boutonRetourCommerciaux() {
    return `<button class="btn-secondaire" style="width:auto;padding:6px 12px;font-size:12px;margin-bottom:10px" onclick="VueVisites.retourCommerciaux()">← Tous les commerciaux</button>`;
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
    // FIX-D : _visitePlanifiee posé AVANT Router.aller() ; le router appellera
    // VueQuestionnaire.init() une seule fois — pas de double-init.
    if (window.VueQuestionnaire) {
      VueQuestionnaire._visitePlanifiee = v;
      VueQuestionnaire._isHorsBase = false; // réinitialiser l'état
    }
    // Pour les visites à froid, on passe sans paramètre d'ID pour éviter la
    // recherche impossible d'un compte 'HORS_BASE' ; l'init détectera _visitePlanifiee.
    const estFroid = v.ID_Cible === 'HORS_BASE' || v.Source_Visite === 'ESI_VISITE_FROID';
    Router.aller(estFroid ? '#/questionnaire' : `#/questionnaire/${v.ID_Cible}`);
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
    // BUG2 — anti multi-soumission : verrou de ré-entrée immédiat
    if (this._enCours) return;
    const f = this.state.formPlanif;
    const nomFinal = f.horsBase ? (f.nomLibre || '').trim() : f.nomCible;
    if (!nomFinal) { Toast.afficher(f.horsBase ? 'Indiquez le nom du compte' : 'Sélectionnez un compte', 'warning'); return; }

    // BLOC 4 — Détection doublon avant enregistrement
    const idCibleCheck = f.horsBase ? 'HORS_BASE' : f.idCible;
    const doublon = this.state.visites.find(v =>
      String(v.deleted || '').toUpperCase() !== 'TRUE' &&
      (f.horsBase
        ? ((v.Source_Visite === 'HORS_BASE' || v.Source_Visite === 'ESI_VISITE_FROID') && normaliserNom(v.Nom_Compte) === normaliserNom(nomFinal))
        : v.ID_Cible === idCibleCheck) &&
      (v.Date || v.Date_Planif || '').slice(0, 10) === f.date &&
      String(v.PIN_CDS) === String(Session.pin) &&
      v.Type_Visite === f.typeVisite
    );
    if (doublon) {
      Toast.afficher(`⚠️ Visite déjà planifiée pour "${nomFinal}" le ${f.date} (${this._labelStatut(doublon.Statut_Visite)}) — doublon bloqué`, 'warning');
      return;
    }

    // BUG2 — désactivation du bouton + état de chargement jusqu'à résolution
    const btn = e.submitter || (e.target && e.target.querySelector('button[type="submit"]'));
    this._enCours = true;
    if (btn) { btn.disabled = true; btn.dataset._lbl = btn.textContent; btn.textContent = '⏳ Enregistrement…'; }

    try {
      // M6/P6-5 — prospect à froid : mémorisé en localStorage UNIQUEMENT,
      // jamais écrit dans 📋_PROSPECTS (évite de polluer la base + alertes managers).
      // Si le nom correspond déjà à un compte connu de la base, on relie la visite
      // à ce compte réel ; sinon la cible reste HORS_BASE.
      let idCibleFinal = f.idCible;
      let sourceVisite = 'ESI_V21';
      if (f.horsBase) {
        sourceVisite = 'ESI_VISITE_FROID';
        const dejaLa = this.state.comptes.find(c => normaliserNom(c.Nom_Compte) === normaliserNom(nomFinal));
        idCibleFinal = dejaLa ? dejaLa.ID_Compte : 'HORS_BASE';
        this._memoriserProspectFroid(nomFinal);
      }

      const visite = {
        ID_Visite:              genId('VIS'),
        Date:                   f.date,
        Heure:                  f.heure,
        Duree_Prevue:           f.dureeVisite || '60',
        Semaine_ISO:            getISOWeek(new Date(f.date)),
        PIN_CDS:                Session.pin,
        Nom_CDS:                Session.nom,
        ID_Cible:               idCibleFinal || 'HORS_BASE',
        Nom_Compte:             nomFinal,
        Source_Visite:          sourceVisite,
        Type_Visite:            f.typeVisite,
        Objectif_Visite:        f.objectifVisite || '',
        Statut_Visite:          'planifiée',
        // Prospect à froid : infos de contact stockées sur la visite
        Adresse:                f.horsBase ? (f.adresseLibre || '') : '',
        Departement:            f.horsBase ? (f.deptLibre || '') : '',
        Ville:                  f.horsBase ? (f.villeLibre || '') : '',
        Tel:                    f.horsBase ? (f.telLibre || '') : '',
        Email:                  f.horsBase ? (f.emailLibre || '') : '',
        Note_Privee:            f.commentairePrep,
        Prochaine_Action_Texte: f.prochaineEtape,
        Timestamp:              new Date().toISOString(),
      };
      await SheetsAPI.ecrire('EMPOWER_MDB', '🗺️_VISITES', visite);
      this.state.visites.unshift(visite);
      // BUG3 — la cible devient un vrai compte sélectionné (sans perdre la saisie)
      f.horsBase = false;
      f.idCible  = idCibleFinal;
      f.nomCible = nomFinal;
      this.state.dateVue = f.date;
      this.state.modalPlanif = false;
      Toast.afficher(
        sourceVisite === 'ESI_VISITE_FROID'
          ? `✅ Visite à froid planifiée — ${nomFinal} le ${f.date}`
          : `✅ Visite planifiée — ${nomFinal} le ${f.date}`,
        'succes'
      );
      this.render();
    } catch(err) {
      Toast.afficher('❌ ' + err.message, 'erreur');
      // réactive le bouton pour permettre une nouvelle tentative
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset._lbl || 'Planifier'; }
    } finally {
      this._enCours = false;
    }
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
        deleted:    true,
        deleted_at: new Date().toISOString(),
        deleted_by: Session.pin,
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
        this._statutEffectif(v) !== f.statut.toLowerCase()) return false;
    if (f.cds !== 'TOUS' && String(v.PIN_CDS) !== f.cds) return false;
    return true;
  },

  get extractionCount() {
    return this.state.visites.filter(v => this._matchExtraction(v)).length;
  },

  // Export XLSX visites — réservé ADMIN + CHANNEL_MANAGER (Bloc 5)
  async exporterVisites() {
    if (!Session.voitTout()) {
      Toast.afficher('Export réservé aux profils Direction et Admin', 'warning'); return;
    }
    // Auto-fetch si appelé hors de la vue Visites (ex: depuis le dashboard manager)
    if (!this.state.visites || !this.state.visites.length) {
      Toast.afficher('Chargement des visites…', 'info', 2000);
      const raw = await SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES');
      this.state.visites = (raw || [])
        .filter(v => String(v.deleted || '').toUpperCase() !== 'TRUE')
        .filter(v => Session.voitTout() || Number(v.PIN_CDS) === Session.pin);
    }
    const f = this.state.extractFiltres;
    const data = this.state.visites.filter(v => this._matchExtraction(v));
    if (!data.length) { Toast.afficher('Aucune visite pour ces filtres', 'warning'); return; }

    const debut = f.debut || 'debut';
    const fin   = f.fin   || 'fin';
    const ts    = dateISOLocale().replace(/-/g, '');

    // Aplatir Questionnaire_JSON dans les colonnes
    const flatQJSON = (v) => {
      if (!v.Questionnaire_JSON) return {};
      try {
        const q = typeof v.Questionnaire_JSON === 'string'
          ? JSON.parse(v.Questionnaire_JSON) : v.Questionnaire_JSON;
        return (q && typeof q === 'object') ? q : {};
      } catch { return {}; }
    };

    const flatFreins = (v) => {
      if (!v.Freins_JSON) return '';
      try {
        const f2 = typeof v.Freins_JSON === 'string' ? JSON.parse(v.Freins_JSON) : v.Freins_JSON;
        if (Array.isArray(f2)) return f2.join(', ');
        return Object.values(f2 || {}).filter(Boolean).join(', ');
      } catch { return String(v.Freins_JSON || ''); }
    };

    const rows = data.map(v => {
      const qj = flatQJSON(v);
      return {
        'Commercial':           resolveCDS(v.PIN_CDS || v.Nom_CDS) || '',
        'Revendeur':            v.Nom_Compte || '',
        'Email revendeur':      v.Email || '',
        'Date':                 (v.Date || v.Date_Planif || '').slice(0, 10),
        'Heure':                v.Heure || '',
        'Statut':               this._labelStatut(v.Statut_Visite),
        'Type visite':          v.Type_Visite || '',
        'Interlocuteur':        v.Interlocuteur || v.Interlocuteur_Nom || '',
        'Fonction':             v.Interlocuteur_Fonction || '',
        'Objectif visite':      v.Objectifs_Visite || v.Objectif_Visite || '',
        'Résultat visite':      v.Resultat_Visite || '',
        'Type revendeur':       v.Type_Revendeur || '',
        'Arbre EMPOWER':        v.Arbre_EMPOWER_Statut || '',
        'Concurrent':           v.Concurrent_Actuel || '',
        'Marketing présent':    v.Marketing_Present === true || v.Marketing_Present === 'TRUE' ? 'Oui' : v.Marketing_Present === false || v.Marketing_Present === 'FALSE' ? 'Non' : '',
        'Supports marketing':   v.Marketing_Supports || '',
        'Freins':               flatFreins(v),
        'Prochaine action':     v.Prochaine_Action_Texte || v.Prochaine_Action || '',
        'Date prochaine action': v.Prochaine_Action_Date ? (v.Prochaine_Action_Date + '').slice(0, 10) : '',
        'Note préparation':     v.Commentaire_Prep || '',
        'Note privée':          v.Note_Privee || '',
        ...Object.fromEntries(Object.entries(qj).map(([k, val]) => [
          'Q_' + k.replace(/[^a-zA-Z0-9]/g, '_'), String(val ?? ''),
        ])),
        'GPS':                  (v.GPS_Lat && v.GPS_Lng) ? `${v.GPS_Lat},${v.GPS_Lng}` : '',
        'ID Visite':            v.ID_Visite || '',
      };
    });

    if (typeof XLSX === 'undefined') {
      Toast.afficher('Bibliothèque XLSX non chargée', 'error'); return;
    }
    const wb  = XLSX.utils.book_new();
    const ws  = XLSX.utils.json_to_sheet(rows);
    // Largeurs colonnes auto (~20 chars)
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Visites');
    XLSX.writeFile(wb, `VISITES_${debut}_${fin}_${ts}.xlsx`);
    Toast.afficher(`Export XLSX : ${rows.length} visite(s)`, 'succes');
    this.state.extractOuvert = false;
    this.render();
  },

  // ── Rapport de visite : rendu questionnaire complet (Bloc 3) ──
  // Visible par : propriétaire CDS, ADMIN (PIN 1000), CHANNEL_MANAGER (PIN 5000/5001/5002)
  _peutVoirRapport(v) {
    if (!Session) return false;
    if (Session.voitTout()) return true;
    return Number(v.PIN_CDS) === Session.pin;
  },

  _rapportVisite(v) {
    if (!this._peutVoirRapport(v)) return '';

    // Champs questionnaire individuels
    const champs = [
      { lbl: 'Interlocuteur',    val: v.Interlocuteur || v.Interlocuteur_Nom },
      { lbl: 'Fonction',         val: v.Interlocuteur_Fonction },
      { lbl: 'Objectif',         val: v.Objectifs_Visite || v.Objectif_Visite },
      { lbl: 'Résultat',         val: v.Resultat_Visite },
      { lbl: 'Type revendeur',   val: v.Type_Revendeur },
      { lbl: 'Arbre EMPOWER',    val: v.Arbre_EMPOWER_Statut },
      { lbl: 'Concurrent',       val: v.Concurrent_Actuel },
      { lbl: 'Marketing',        val: v.Marketing_Present === true || v.Marketing_Present === 'TRUE' ? 'Oui' : v.Marketing_Present === false || v.Marketing_Present === 'FALSE' ? 'Non' : v.Marketing_Present },
      { lbl: 'Supports',         val: v.Marketing_Supports },
      { lbl: 'Prochaine action', val: v.Prochaine_Action_Texte || v.Prochaine_Action },
      { lbl: 'Date action',      val: v.Prochaine_Action_Date ? new Date(v.Prochaine_Action_Date).toLocaleDateString('fr-FR') : null },
      { lbl: 'Note prép.',       val: v.Commentaire_Prep || v.Note_Privee },
    ].filter(c => c.val !== null && c.val !== undefined && String(c.val).trim() !== '');

    // Questionnaire JSON (champs libres du formulaire)
    let qjson = [];
    if (v.Questionnaire_JSON) {
      try {
        const parsed = typeof v.Questionnaire_JSON === 'string'
          ? JSON.parse(v.Questionnaire_JSON) : v.Questionnaire_JSON;
        if (parsed && typeof parsed === 'object') {
          qjson = Object.entries(parsed)
            .filter(([, val]) => val !== null && val !== undefined && String(val).trim() !== '')
            .map(([key, val]) => ({ lbl: key.replace(/_/g, ' '), val: String(val) }));
        }
      } catch {}
    }

    // Freins
    let freins = '';
    if (v.Freins_JSON) {
      try {
        const f = typeof v.Freins_JSON === 'string' ? JSON.parse(v.Freins_JSON) : v.Freins_JSON;
        if (Array.isArray(f) && f.length) freins = f.join(', ');
        else if (f && typeof f === 'object') freins = Object.values(f).filter(Boolean).join(', ');
      } catch { freins = String(v.Freins_JSON); }
    }

    const allChamps = [...champs, ...(freins ? [{ lbl: 'Freins', val: freins }] : []), ...qjson];
    if (!allChamps.length) return '';

    const id = 'rapport_' + (v.ID_Visite || '').replace(/[^a-z0-9]/gi, '');

    return `
      <details class="cv-rapport" id="${id}">
        <summary class="cv-rapport-toggle">Rapport de visite</summary>
        <div class="cv-rapport-body">
          ${allChamps.map(c => `
            <div class="cv-rapport-ligne">
              <span class="cv-rapport-lbl">${c.lbl}</span>
              <span class="cv-rapport-val">${String(c.val).replace(/\n/g,'<br>')}</span>
            </div>`).join('')}
        </div>
      </details>`;
  },

  // ── Carte visite (R5 : boutons edit/delete/dupliquer) ──
  _carteVisite(v) {
    const statut = (v.Statut_Visite || 'planifiée').toLowerCase();
    // M6/P6-3 — couleur + libellé sur le statut EFFECTIF (planifiée passée → manquée 🔴),
    // mais les actions restent pilotées par le statut RÉEL (une visite manquée
    // reste démarrable / replanifiable).
    const statutEff = this._statutEffectif(v);
    const coul   = this.STATUT_COULEURS[statutEff] || 'var(--c-text-2)';
    const isPlanif    = statut === 'planifiée' || statut === 'reportée';
    const isEnCours   = statut === 'en cours';
    const estManquee  = statutEff === 'manquée';
    const peutModif   = Session.voitTout() || Number(v.PIN_CDS) === Session.pin;
    const cdsNom = Session.voitTout() ? resolveCDS(v.PIN_CDS || v.Nom_CDS) : '';

    return `
      <div class="carte-visite" style="border-left:4px solid ${coul}">
        <div class="cv-head">
          <span class="cv-heure">${v.Heure || '—'}</span>
          <span class="cv-statut" style="color:${coul}">${this._labelStatut(statutEff)}</span>
        </div>
        <div class="cv-nom">${v.Nom_Compte || '—'}</div>
        ${v.Type_Visite ? `<div class="cv-type">${String(v.Type_Visite).replace(/_/g,' ')}</div>` : ''}
        ${cdsNom && cdsNom !== '—' ? `<div class="cv-type" style="color:var(--c-text-2);font-size:11px">${cdsNom}</div>` : ''}
        ${(v.Note_Privee || v.Commentaire_Prep) ? `<div class="cv-note">${(v.Note_Privee || v.Commentaire_Prep).slice(0, 80)}</div>` : ''}
        ${statut === 'réalisée' ? this._rapportVisite(v) : ''}
        <div class="cv-actions" style="gap:6px;flex-wrap:wrap">
          ${isPlanif ? `
            <button class="btn-primaire" style="padding:8px 14px;font-size:13px;width:auto${estManquee ? ';background:var(--c-danger)' : ''}"
                    onclick="VueVisites.demarrerVisite('${v.ID_Visite}')">
              ${estManquee ? 'Rattraper' : 'Démarrer'}
            </button>` : ''}
          ${isEnCours ? `
            <button class="btn-primaire" style="padding:8px 14px;font-size:13px;width:auto"
                    onclick="VueVisites.ouvrirCR('${v.ID_Visite}')">
              Compte-rendu
            </button>` : ''}
          ${statut === 'réalisée' && (v.Source_Visite === 'ESI_VISITE_FROID' || v.Source_Visite === 'HORS_BASE') && String(v.Flag_Converti || '').toUpperCase() !== 'TRUE' ? `
            <button class="btn-primaire" style="padding:8px 14px;font-size:13px;width:auto;background:var(--c-success)"
                    onclick="VueVisites.ouvrirConversion('${v.ID_Visite}')">
              Créer compte actif
            </button>` : ''}
          ${statut === 'réalisée' && String(v.Flag_Converti || '').toUpperCase() === 'TRUE' ? `
            <span style="font-size:11px;color:var(--c-success);font-weight:700">Compte actif créé</span>
          ` : ''}
          ${(!isPlanif && !isEnCours && v.ID_Cible !== 'HORS_BASE' && v.Source_Visite !== 'ESI_VISITE_FROID') ? `
            <button class="btn-secondaire" style="padding:6px 12px;font-size:12px;width:auto"
                    onclick="VueVisites.ouvrirFiche('${v.ID_Cible || ''}')">
              Fiche compte
            </button>` : ''}
          ${peutModif ? `
            <button class="btn-secondaire" title="Modifier" style="padding:10px 14px;font-size:15px;width:auto"
                    onclick="VueVisites.ouvrirEdition('${v.ID_Visite}')">✏</button>
            <button class="btn-secondaire" title="Dupliquer (J+7)" style="padding:10px 14px;font-size:13px;width:auto"
                    onclick="VueVisites.dupliquerVisite('${v.ID_Visite}')">+1</button>
            <button class="btn-secondaire" title="Supprimer" style="padding:10px 14px;font-size:15px;width:auto;color:var(--c-danger);border-color:var(--c-danger)"
                    onclick="VueVisites.demanderSuppression('${v.ID_Visite}')">✕</button>
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

    // Section 2 cahier des charges — Manager/Channel : planning groupé par commercial,
    // tant qu'aucun commercial n'est "ouvert". Un CDS ne voit que ses propres visites
    // (comportement inchangé, pas de groupement car un seul commercial = lui-même).
    const groupeActif = Session.voitTout() && !this.state.commercialSelectionne;

    let contenu = '';
    if (this.state.modeVue === 'historique') {
      const hist = this.visitesRealisees;
      if (groupeActif) {
        contenu = this._renderCartesCommerciaux(hist);
      } else {
        const histFiltre = this.state.commercialSelectionne
          ? hist.filter(v => String(v.PIN_CDS || '') === this.state.commercialSelectionne)
          : hist;
        contenu = histFiltre.length === 0
          ? `<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucune visite réalisée pour l'instant.</div>`
          : `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
               <span style="font-size:13px;color:var(--c-text-2)">${histFiltre.length} visite(s) réalisée(s)</span>
               <button class="btn-secondaire" style="width:auto;padding:6px 12px;font-size:12px" onclick="VueVisites.ouvrirExtraction()">📤 Export CSV</button>
             </div>
             ${histFiltre.map(v => this._carteVisite(v)).join('')}`;
        if (this.state.commercialSelectionne) contenu = this._boutonRetourCommerciaux() + contenu;
      }
    } else if (this.state.modeVue === 'jour') {
      const vj = this.visitesJour;
      if (groupeActif) {
        contenu = this._renderCartesCommerciaux(vj);
      } else {
        const vjFiltre = this.state.commercialSelectionne
          ? vj.filter(v => String(v.PIN_CDS || '') === this.state.commercialSelectionne)
          : vj;
        contenu = vjFiltre.length === 0
          ? `<div style="padding:32px;text-align:center;color:var(--c-text-2)">
               Aucune visite ce jour.
               <br><button class="btn-secondaire" style="margin-top:16px;width:auto;padding:10px 20px"
                           onclick="VueVisites.ouvrirModal()">+ Planifier une visite</button>
             </div>`
          : vjFiltre.map(v => this._carteVisite(v)).join('');
        if (this.state.commercialSelectionne) contenu = this._boutonRetourCommerciaux() + contenu;
      }
    } else if (groupeActif) {
      contenu = this._renderCartesCommerciaux(this.visitesSemaine.flatMap(j => j.visites));
    } else {
      const semaine = this.visitesSemaine.map(j => ({
        ...j,
        visites: this.state.commercialSelectionne
          ? j.visites.filter(v => String(v.PIN_CDS || '') === this.state.commercialSelectionne)
          : j.visites,
      }));
      // Densité desktop (Bloc 5) : plus d'aperçus par jour quand la largeur le permet
      const maxParJour = window.innerWidth >= 900 ? 8 : 3;
      contenu = `
        ${this.state.commercialSelectionne ? this._boutonRetourCommerciaux() : ''}
        <div class="planning-semaine">
          ${semaine.map(j => `
            <div class="planning-jour ${j.iso === today ? 'planning-jour-today' : ''}"
                 onclick="VueVisites.state.dateVue='${j.iso}';VueVisites.state.modeVue='jour';VueVisites.render()">
              <div class="pj-label">${j.label}</div>
              <div class="pj-count">${j.visites.length ? j.visites.length + 'v' : ''}</div>
              ${j.visites.slice(0, maxParJour).map(v => `
                <div class="pj-item" style="border-left:3px solid ${this.STATUT_COULEURS[this._statutEffectif(v)] || 'var(--c-text-2)'}">
                  <span class="pj-heure">${v.Heure || '—'}</span>
                  <span class="pj-nom">${(v.Nom_Compte || '').slice(0, 14)}</span>
                </div>`).join('')}
              ${j.visites.length > maxParJour ? `<div class="pj-plus">+${j.visites.length - maxParJour}</div>` : ''}
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
          ${peutExtraire ? `<button class="btn-retour" onclick="VueVisites.ouvrirExtraction()" title="Extraction CSV"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
          <button class="btn-retour" onclick="VueVisites.synchroniser()" title="Synchroniser"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg></button>
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
      ${this._renderModalConversion()}
      ${this.state.ficheDockee ? this._renderFicheDockee() : ''}
    `;
  },

  // ── Modal planification (R1 : uniquement comptes) ──
  _renderModal() {
    if (!this.state.modalPlanif) return '';
    const f = this.state.formPlanif;
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueVisites.fermerModal()">
      <div class="modal">
        <h3>Planifier une visite</h3>
        <form onsubmit="VueVisites.planifier(event)">
          <!-- D3 — Section Enseigne / Cible -->
          <div class="modal-section-sep">Enseigne / Cible</div>
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button type="button" class="btn-filtre ${!f.horsBase ? 'actif' : ''}"
                    onclick="VueVisites.state.formPlanif.horsBase=false;VueVisites.render()">
              Compte existant
            </button>
            <button type="button" class="btn-filtre ${f.horsBase ? 'actif' : ''}"
                    onclick="VueVisites.state.formPlanif.horsBase=true;VueVisites.render()">
              ❄️ À froid / Hors base
            </button>
          </div>
          ${f.horsBase
            ? `<label>Nom de l'enseigne *
                 <input required placeholder="ex : MICRO PLUS INFORMATIQUE" value="${f.nomLibre || ''}"
                        list="froid-suggestions" autocomplete="off"
                        oninput="VueVisites.state.formPlanif.nomLibre=this.value"/>
                 <datalist id="froid-suggestions">
                   ${this._lireProspectsFroid().map(n => `<option value="${n}">`).join('')}
                 </datalist>
               </label>
               <label>Adresse <span style="font-weight:400;font-size:11px;color:var(--c-text-2)">(optionnel)</span>
                 <input placeholder="ex : 12 rue du Commerce" value="${f.adresseLibre || ''}"
                        oninput="VueVisites.state.formPlanif.adresseLibre=this.value"/></label>
               <div style="display:flex;gap:8px">
                 <label style="flex:1">Département
                   <input placeholder="ex : 75" maxlength="3" value="${f.deptLibre || ''}"
                          oninput="VueVisites.state.formPlanif.deptLibre=this.value"/></label>
                 <label style="flex:2">Ville
                   <input placeholder="ex : Paris" value="${f.villeLibre || ''}"
                          oninput="VueVisites.state.formPlanif.villeLibre=this.value"/></label>
               </div>
               <label>Téléphone <span style="font-weight:400;font-size:11px;color:var(--c-text-2)">(optionnel)</span>
                 <input type="tel" placeholder="ex : 01 23 45 67 89" value="${f.telLibre || ''}"
                        oninput="VueVisites.state.formPlanif.telLibre=this.value"/></label>
               <label>Email <span style="font-weight:400;font-size:11px;color:var(--c-text-2)">(optionnel)</span>
                 <input type="email" placeholder="contact@enseigne.fr" value="${f.emailLibre || ''}"
                        oninput="VueVisites.state.formPlanif.emailLibre=this.value"/></label>
               <div style="font-size:11px;color:var(--c-text-2);margin:-4px 0 10px;padding:6px 10px;background:var(--c-bg);border-radius:var(--radius-sm)">
                 Hors base : mémorisé sur cet appareil. Après la visite, vous pourrez créer ce compte dans la base.
               </div>`
            : (() => {
              // Module 2 — Recherche par nom/ville ET par département
              const q     = normaliserNom(f.rechercheCompte || '');
              const qDept = (f.rechercheDept || '').trim().toLowerCase();
              const actif = q.length >= 2 || qDept.length >= 1;
              const comptesFiltres = actif
                ? this.comptesTries.filter(c => {
                    const nomOk  = q.length >= 2 ? (normaliserNom(c.Nom_Compte).includes(q) || normaliserNom(c.Ville || '').includes(q)) : true;
                    const deptOk = qDept.length >= 1 ? (
                      (c.Departement || '').startsWith(qDept) ||
                      normaliserNom(c.Ville || '').includes(qDept)
                    ) : true;
                    return nomOk && deptOk;
                  })
                : [...this.state.comptes].sort((a, b) => (a.Nom_Compte || '').localeCompare(b.Nom_Compte || '', 'fr'));
              const aucunDept = qDept.length >= 1 && comptesFiltres.length === 0;
              return `
               <div style="display:flex;gap:6px;margin-bottom:6px">
                 <label style="flex:1;margin-bottom:0">🔍 Nom / Ville
                   <input placeholder="Nom ou ville…" value="${f.rechercheCompte || ''}"
                          oninput="VueVisites.state.formPlanif.rechercheCompte=this.value;VueVisites.render()"/>
                 </label>
                 <label style="flex:0 0 70px;margin-bottom:0">Dept
                   <input placeholder="75…" maxlength="3" value="${f.rechercheDept || ''}"
                          oninput="VueVisites.state.formPlanif.rechercheDept=this.value;VueVisites.render()"/>
                 </label>
               </div>
               ${aucunDept ? `
               <div style="font-size:12px;color:var(--c-text-2);padding:8px;background:var(--c-bg);border-radius:var(--radius-sm);margin-bottom:8px">
                 Aucun compte dans ce département.
                 <button type="button" class="btn-secondaire" style="font-size:11px;padding:4px 8px;margin-left:6px;width:auto"
                         onclick="VueVisites.state.formPlanif.horsBase=true;VueVisites.render()">
                   ❄️ Créer une visite à froid
                 </button>
               </div>` : ''}
               <label>Compte * <span style="font-size:11px;color:var(--c-text-2);font-weight:400">${actif ? comptesFiltres.length + ' résultat(s)' : 'trié par nom'}</span>
                 <select required size="7" style="height:180px"
                         onchange="VueVisites.setCible(this.value, this.options[this.selectedIndex].dataset.nom)">
                   <option value="">— sélectionner —</option>
                   ${comptesFiltres.map(c =>
                     `<option value="${c.ID_Compte}" data-nom="${c.Nom_Compte}" ${f.idCible === c.ID_Compte ? 'selected' : ''}>${c.urgent ? '! ' : ''}${c.Nom_Compte}${c.Departement ? ' [' + c.Departement + ']' : ''}${c.Ville ? ' — ' + c.Ville : ''}${c.silence != null ? ' · ' + c.silence + 's' : ''}</option>`
                   ).join('')}
                 </select>
               </label>
               ${this._ficheCompteSelectionne(f.idCible)}`;
            })()
          }
          <!-- D3 — Section Planification -->
          <div class="modal-section-sep">Planification</div>
          <label>Objectif de la visite *
            <select required onchange="VueVisites.state.formPlanif.objectifVisite=this.value">
              <option value="" ${!f.objectifVisite ? 'selected' : ''}>— choisir —</option>
              ${['Présentation offre EMPOWER','Suivi commande','Démo produit','Signature contrat','Onboarding EMPOWER','Réactivation','Prospection froide','Récupérer CA perdu','Formation revendeur','Autre'].map(o =>
                `<option value="${o}" ${f.objectifVisite === o ? 'selected' : ''}>${o}</option>`
              ).join('')}
            </select>
          </label>
          <div style="display:flex;gap:10px">
            <label style="flex:2">Date *
              <input type="date" required value="${f.date}"
                     onchange="VueVisites.state.formPlanif.date=this.value"/></label>
            <label style="flex:1">Heure
              <input type="time" value="${f.heure}"
                     onchange="VueVisites.state.formPlanif.heure=this.value"/></label>
            <label style="flex:1">Durée
              <select onchange="VueVisites.state.formPlanif.dureeVisite=this.value">
                ${[['30','30 min'],['60','1h'],['90','1h30'],['120','2h']].map(([v,l]) =>
                  `<option value="${v}" ${(f.dureeVisite||'60')===v?'selected':''}>${l}</option>`
                ).join('')}
              </select>
            </label>
          </div>
          <label>Type de visite
            <select onchange="VueVisites.state.formPlanif.typeVisite=this.value">
              ${[['SUIVI_ACTIF','Suivi actif'],['PROSPECTION_FROIDE','Prospection froide'],['ONBOARDING_EMPOWER','Onboarding EMPOWER'],['REACTIVER','Réactivation']].map(([v,l]) =>
                `<option value="${v}" ${f.typeVisite===v?'selected':''}>${l}</option>`
              ).join('')}
            </select>
          </label>
          <!-- D3 — Section Préparation -->
          <div class="modal-section-sep">Préparation</div>
          <label>Préparation / contexte
            <textarea rows="2" placeholder="Points à aborder, historique, contexte…"
              oninput="VueVisites.state.formPlanif.commentairePrep=this.value">${f.commentairePrep || ''}</textarea>
          </label>
          <label>Prochaine étape prévue
            <input placeholder="ex : présenter offre NSB, démo produit…" value="${f.prochaineEtape || ''}"
                   oninput="VueVisites.state.formPlanif.prochaineEtape=this.value"/></label>
          <div class="modal-btns">
            <button type="button" onclick="VueVisites.fermerModal()">Annuler</button>
            <button type="submit" class="btn-primaire">Planifier</button>
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
        <h3>Modifier la visite</h3>
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
            <button type="submit" class="btn-primaire">Enregistrer</button>
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
        <h3 style="color:var(--c-danger)">Supprimer cette visite ?</h3>
        <p style="font-size:14px;margin:12px 0"><strong>${v ? v.Nom_Compte : ''}</strong> — ${v ? (v.Date || '').slice(0, 10) : ''}</p>
        <p style="font-size:12px;color:var(--c-text-2)">La visite sera marquée "supprimée" en base (soft delete) et n'apparaîtra plus dans les listes. Aucune suppression physique.</p>
        <div class="modal-btns">
          <button onclick="VueVisites.annulerSuppression()">Annuler</button>
          <button class="btn-primaire" style="background:var(--c-danger)"
                  onclick="VueVisites.confirmerSuppression()">Confirmer la suppression</button>
        </div>
      </div>
    </div>`;
  },

  // ── M7 : Modal conversion visite à froid → compte actif ──
  _renderModalConversion() {
    const m = this._modalConversion;
    if (!m) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueVisites.fermerConversion()">
      <div class="modal">
        <h3>Créer comme compte actif</h3>
        ${m.doublonExistant ? `
        <div style="background:color-mix(in srgb,var(--c-warning) 12%,transparent);border:1px solid var(--c-warning);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
          <div style="font-weight:700;color:var(--c-warning);margin-bottom:6px">Ce compte existe déjà dans la base</div>
          <div style="font-size:13px;margin-bottom:10px"><strong>${m.doublonExistant.Nom_Compte}</strong> — ${m.doublonExistant.STATUT_COMPTE || '—'} · ${m.doublonExistant.CANAL || '—'}</div>
          <div style="display:flex;gap:8px">
            <button class="btn-secondaire" style="flex:1;font-size:12px"
                    onclick="VueVisites.fermerConversion();Router.aller('#/compte/${m.doublonExistant.ID_Compte}')">👁️ Voir la fiche</button>
            <button class="btn-primaire" style="flex:1;font-size:12px"
                    onclick="VueVisites.forcerConversion()">Créer quand même</button>
          </div>
        </div>` : ''}
        <p style="font-size:13px;color:var(--c-text-2);margin-bottom:12px">Saisir les informations du compte. Il sera ajouté à votre base avec le statut ACTIF.</p>
        <label>Nom de l'enseigne *
          <input required value="${m.nomCompte}"
                 oninput="VueVisites._modalConversion.nomCompte=this.value"/></label>
        <div style="display:flex;gap:8px">
          <label style="flex:1">Département
            <input placeholder="ex : 75" maxlength="3" value="${m.departement}"
                   oninput="VueVisites._modalConversion.departement=this.value"/></label>
          <label style="flex:2">Ville
            <input placeholder="ex : Paris" value="${m.ville}"
                   oninput="VueVisites._modalConversion.ville=this.value"/></label>
        </div>
        <label>Téléphone
          <input type="tel" value="${m.tel}"
                 oninput="VueVisites._modalConversion.tel=this.value"/></label>
        <label>Email
          <input type="email" value="${m.email}"
                 oninput="VueVisites._modalConversion.email=this.value"/></label>
        <label>Canal
          <select onchange="VueVisites._modalConversion.canal=this.value">
            ${['REVENDEUR','VAR','RETAILER','DISTRIBUTEUR','AUTRE'].map(c =>
              `<option value="${c}" ${m.canal===c?'selected':''}>${c}</option>`
            ).join('')}
          </select>
        </label>
        <label>Note
          <textarea rows="2" placeholder="Contexte de la conversion…"
                    oninput="VueVisites._modalConversion.note=this.value">${m.note}</textarea></label>
        <div style="font-size:11px;color:var(--c-success);padding:8px;background:color-mix(in srgb,var(--c-success) 10%,transparent);border-radius:var(--radius-sm);margin-bottom:10px">
          Un badge "Créé depuis visite à froid" sera attaché à ce compte. Tadjidine + Alexandra seront notifiés.
        </div>
        <div class="modal-btns">
          <button type="button" onclick="VueVisites.fermerConversion()">Annuler</button>
          <button type="button" class="btn-primaire" style="background:var(--c-success)"
                  onclick="VueVisites.confirmerConversion()" ${this._conversionEnCours ? 'disabled' : ''}>
            ${this._conversionEnCours ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </div>
    </div>`;
  },

  // ── EX-1 : Panneau extraction XLSX (Bloc 5) — Direction + Admin uniquement ──
  _renderExtraction() {
    if (!this.state.extractOuvert) return '';
    if (!Session.voitTout()) return '';

    const f   = this.state.extractFiltres;
    const cnt = this.extractionCount;
    const ong = this.state.extractOnglet || 'visites';

    const cdsUniq = [...new Set(this.state.visites.map(v => v.PIN_CDS).filter(Boolean))];
    const cdsList = cdsUniq.map(pin => {
      const nom = resolveCDS(pin);
      return { pin: String(pin), nom: nom && nom !== '—' ? nom : 'Autre' };
    });

    const tabs = [
      { id: 'visites', lbl: 'Visites' },
      { id: 'tracker', lbl: 'Tracker' },
      { id: 'archives', lbl: 'Comptes archivés' },
    ];

    const tabBar = `<div style="display:flex;gap:0;margin-bottom:14px;border-bottom:2px solid var(--c-border)">
      ${tabs.map(t => `<button onclick="VueVisites.state.extractOnglet='${t.id}';VueVisites.render()"
        style="flex:1;padding:8px 4px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:${ong===t.id?'700':'500'};color:${ong===t.id?'var(--c-primary)':'var(--c-text-2)'};border-bottom:${ong===t.id?'2px solid var(--c-primary)':'2px solid transparent'};margin-bottom:-2px">${t.lbl}</button>`).join('')}
    </div>`;

    let corps = '';
    if (ong === 'visites') {
      corps = `
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <label style="flex:1">Début<input type="date" value="${f.debut}" onchange="VueVisites.state.extractFiltres.debut=this.value;VueVisites.render()"/></label>
          <label style="flex:1">Fin<input type="date" value="${f.fin}" onchange="VueVisites.state.extractFiltres.fin=this.value;VueVisites.render()"/></label>
        </div>
        <label>Commercial
          <select onchange="VueVisites.state.extractFiltres.cds=this.value;VueVisites.render()">
            <option value="TOUS" ${f.cds==='TOUS'?'selected':''}>Tous</option>
            ${cdsList.map(c=>`<option value="${c.pin}" ${f.cds===c.pin?'selected':''}>${c.nom}</option>`).join('')}
          </select>
        </label>
        <label>Statut
          <select onchange="VueVisites.state.extractFiltres.statut=this.value;VueVisites.render()">
            <option value="TOUS" ${f.statut==='TOUS'?'selected':''}>Tous</option>
            ${this.STATUTS.map(s=>`<option value="${s}" ${f.statut===s?'selected':''}>${this._labelStatut(s)}</option>`).join('')}
          </select>
        </label>
        <div style="background:var(--c-bg);border-radius:var(--radius-sm);padding:12px;text-align:center;margin:12px 0;border:1px solid var(--c-border)">
          <span style="font-size:22px;font-weight:800;color:var(--c-primary)">${cnt}</span>
          <span style="font-size:13px;color:var(--c-text-2);margin-left:6px">visite(s)</span>
        </div>
        <button class="btn-primaire" onclick="VueVisites.exporterVisites()" ${cnt===0?'disabled':''} style="width:100%">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Exporter XLSX — Visites + Questionnaires</button>`;
    } else if (ong === 'tracker') {
      corps = `
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <label style="flex:1">Début<input type="date" value="${f.debut}" onchange="VueVisites.state.extractFiltres.debut=this.value;VueVisites.render()"/></label>
          <label style="flex:1">Fin<input type="date" value="${f.fin}" onchange="VueVisites.state.extractFiltres.fin=this.value;VueVisites.render()"/></label>
        </div>
        <p style="font-size:13px;color:var(--c-text-2);margin:8px 0 12px">Pipeline commercial avec statuts, CA et prochaines actions.</p>
        <button class="btn-primaire" onclick="VueVisites.exporterTracker()" style="width:100%">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Exporter XLSX — Tracker</button>`;
    } else {
      corps = `
        <p style="font-size:13px;color:var(--c-text-2);margin:8px 0 12px">Tous les comptes avec statut "Archivé" (perdus / hors cible).</p>
        <button class="btn-primaire" onclick="VueVisites.exporterComptesArchives()" style="width:100%">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Exporter XLSX — Comptes archivés</button>`;
    }

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueVisites.fermerExtraction()">
      <div class="modal" style="max-width:440px">
        <h3 style="margin-bottom:12px">Export XLSX — Direction</h3>
        ${tabBar}
        ${corps}
        <button class="btn-secondaire" onclick="VueVisites.fermerExtraction()" style="width:100%;margin-top:10px">Fermer</button>
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px;text-align:center">Format .xlsx · Compatible Excel, Google Sheets, LibreOffice</p>
      </div>
    </div>`;
  },

  // Export XLSX Tracker (Bloc 5)
  async exporterTracker() {
    if (!Session.voitTout()) { Toast.afficher('Accès réservé Direction/Admin', 'warning'); return; }
    Toast.afficher('Récupération du Tracker…', 'info');
    try {
      const data = await SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS');
      if (!data || !data.length) { Toast.afficher('Aucune donnée Tracker', 'warning'); return; }
      const f = this.state.extractFiltres;
      const rows = data
        .filter(p => {
          if (!f.debut && !f.fin) return true;
          const d = (p.Date_Creation_Compte || p.Date_Attribution || '').slice(0, 10);
          if (f.debut && d < f.debut) return false;
          if (f.fin   && d > f.fin)   return false;
          return true;
        })
        .map(p => ({
          'Commercial':         resolveCDS(p.PIN_CDS_Assigne) || p.Nom_CDS || '',
          'Compte':             p.Nom_Compte || '',
          'Ville':              p.Ville || '',
          'Statut':             p.STATUT_EMPOWER || '',
          'Potentiel':          p.POTENTIEL || '',
          'Canal':              p.CANAL || '',
          'Secteur':            p.SECTEUR || '',
          'Origine':            p.ORIGINE || '',
          'Date attribution':   (p.Date_Attribution || '').slice(0, 10),
          'Date création compte': (p.Date_Creation_Compte || '').slice(0, 10),
          'Date relance':       (p.Date_Relance || '').slice(0, 10),
          'Prochaine action':   (p.Date_prochaine_action || '').slice(0, 10),
          'Note initiale':      p.Note_initiale || '',
        }));
      if (!rows.length) { Toast.afficher('Aucune donnée pour ces filtres', 'warning'); return; }
      if (typeof XLSX === 'undefined') { Toast.afficher('Bibliothèque XLSX non chargée', 'error'); return; }
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 22 }));
      XLSX.utils.book_append_sheet(wb, ws, 'Tracker');
      const ts = dateISOLocale().replace(/-/g, '');
      XLSX.writeFile(wb, `TRACKER_${ts}.xlsx`);
      Toast.afficher(`Export XLSX : ${rows.length} ligne(s)`, 'succes');
    } catch(e) {
      Toast.afficher('Erreur export Tracker : ' + (e.message || e), 'error');
    }
  },

  // Export XLSX Comptes archivés (Bloc 5)
  async exporterComptesArchives() {
    if (!Session.voitTout()) { Toast.afficher('Accès réservé Direction/Admin', 'warning'); return; }
    Toast.afficher('Récupération des comptes archivés…', 'info');
    try {
      const data = await SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES');
      const archives = (data || []).filter(c =>
        (c.Statut || c.statut_compte || '').toLowerCase().startsWith('archiv')
      );
      if (!archives.length) { Toast.afficher('Aucun compte archivé', 'warning'); return; }
      const rows = archives.map(c => ({
        'Compte':               c.Nom_Compte || '',
        'Ville':                c.Ville || '',
        'Adresse':              c.Adresse || '',
        'Code postal':          c.Code_Postal || '',
        'Canal':                c.CANAL || '',
        'Secteur':              c.SECTEUR || '',
        'CDS assigné':          resolveCDS(c.PIN_CDS_Assigne || c.Nom_CDS) || '',
        'CA FY25':              c.CA_FY25 || '',
        'CA FY26':              c.CA_FY26 || '',
        'CA Q1 FY27':           c.CA_Q1FY27 || '',
        'Dernière action':      (c.Date_Derniere_Action || '').slice(0, 10),
        'Type dernière action':  c.Type_Derniere_Action || '',
        'Prochaine action':     c.Prochaine_Action || '',
        'Note initiale':        c.Note_Initiale || '',
        'ID Compte':            c.ID_Compte || '',
      }));
      if (typeof XLSX === 'undefined') { Toast.afficher('Bibliothèque XLSX non chargée', 'error'); return; }
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 22 }));
      XLSX.utils.book_append_sheet(wb, ws, 'Comptes archivés');
      const ts = dateISOLocale().replace(/-/g, '');
      XLSX.writeFile(wb, `COMPTES_ARCHIVES_${ts}.xlsx`);
      Toast.afficher(`Export XLSX : ${archives.length} compte(s) archivé(s)`, 'succes');
    } catch(e) {
      Toast.afficher('Erreur export comptes : ' + (e.message || e), 'error');
    }
  },
};
