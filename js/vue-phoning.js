// ═══════════════════════════════════════
//  vue-phoning.js — Module Phoning IA v9
//  BUG-09 : planning-first workflow
//  ÉTAPE 1 → planning · ÉTAPE 2 → lancer appel · ÉTAPE 3 → questionnaire
//  Base phoning : uniquement 🏢_COMPTES (jamais PROSPECTS ni leads bruts)
// ═══════════════════════════════════════

window.VuePhoning = {

  state: null,
  sessionAppels: 0, // Bloc 6 — compteur d'appels de la session (hors state : survit aux re-init())

  // Bloc 3 §3 — questionnaire EMPOWER (compte déjà onboardé) : références Norton
  // et opérations commerciales, sélection non obligatoire.
  NORTON_PRODUITS: [
    'Norton 360 · 1 poste', 'Norton 360 · 3 postes', 'Norton 360 · 5 postes', 'Norton 360 · 10 postes',
    'Norton 360 Gamer', 'Norton Small Business', 'Norton VPN', 'Norton Utilities',
  ],
  OP_COMMERCIALES: ['2+1', '1+1', '-50%', '-70%'],

  // Toggle générique pour les sélections multiples (widget QuestionnaireBranching.chipsMultiSelect).
  toggleMultiSelect(champ, valeur) {
    const arr = this.state.d[champ] || [];
    const idx = arr.indexOf(valeur);
    if (idx === -1) arr.push(valeur); else arr.splice(idx, 1);
    this.render();
  },

  _etatInitial() {
    return {
      phase: 'PRE',
      chargement: true, envoiEnCours: false,
      comptes: [], tousComptes: [], prospects: [], cdsListe: [],
      typeSource: 'EXISTANT', cible: null,
      mode: 'BASE',            // BASE | PLANNING | APPEL | HISTORIQUE
      filtreListe: 'TOUS',
      recherche: '', rechercheBase: '', filtreCDSBase: 'TOUS', script: '', scriptEnCours: false,
      enregistre: false, transcription: '', qualif: null,
      froidsMode: false,
      froidsFields: { nom: '', dept: '', ville: '', tel: '', email: '', adresse: '' },
      brouillonSauvegarde: false,
      d: {
        objectif: '', accroche: '',
        statutAppel: '', interetEmpower: '', frein: '',
        prochaineAction: '', dateRappel: '', note: '',
        resultatProspect: '',
        // BLOC 3 — post-appel comptes
        commandeAnnoncee: '', montantEstime: '', statutFinal: '',
        // F1 — Appel à froid questionnaire
        typeAppel: '', interetScore: 0, concurrentActuel: '', potentielEstime: '',
        // Qualification pendant appel (PhoneOS)
        statutCallPills: '',
        empowerQ: [false, false, false, false, false],
        // Bloc 3 §3 — questionnaire EMPOWER (compte déjà onboardé) : sélection
        // non obligatoire, stockée dans phoning.questionnaire_json.
        norton360: [], opCommerciale: [],
      },
      // Wizard pas-à-pas de la phase CALL (1 = Résultat & Qualification, 2 = Notes & Ressources)
      callStep: 1,
      geminiAnalyse: null, geminiEnCours: false,
      // BUG-09 — planning phoning
      planning: [],
      planningChargement: false,
      formPlanif: null,        // null = fermé; objet = formulaire ouvert
      filtrePlanning: 'SEMAINE', // SEMAINE | MOIS | TOUS
      idPlanifEnCours: null,   // ID_Appel du plan lancé
      commercialSelectionne: null, // groupement planning par commercial (Manager/Channel)
      // R5 — historique appels + edit/delete
      journal: [],
      journalChargement: false,
      modalEditAppel: null,
      confirmDeleteAppelId: null,
      // Bloc 3 §4 — Rapport Phoning intégré : sous-vue Jour/Semaine/Historique
      // au sein du Journal (remplace l'ancien onglet séparé vue-phoning-fdv.js).
      journalVue: 'semaine', journalDate: dateISOLocale(),
      // EX-2 — extraction
      extractOuvert: false,
      extractFiltres: { debut: '', fin: '', cds: 'TOUS', resultat: 'TOUS' },
      // Bloc 6 — file d'appels courante (pour "Appel suivant" depuis l'écran de succès)
      _fileAppels: null, _fileAppelsIdx: -1,
      appelDebutTs: null,
    };
  },

  async init(idCible = null) {
    this._arreterTimerAppel(); // Bloc 6 — évite un timer orphelin si on quitte un appel en cours
    this.state = this._etatInitial();
    // Bloc 3 §4 — Alexandra atterrit directement sur le Journal (ex-Rapport
    // Phoning), seul mode auquel elle a accès (cf. setMode()).
    if (Session.role === 'CHANNEL_MANAGER') this.state.mode = 'HISTORIQUE';
    this.render();
    try {
      const [comptes, planning, cdsApi, prospects] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING'),
        SheetsAPI.lireCDS(),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
      ]);
      // Base des prospects pour l'appel (sourceListe/suggestions PROSPECT) —
      // manquait jusqu'ici : state.prospects restait toujours vide.
      this.state.prospects = prospects.filter(p => Session.voitTout() || !p.PIN_CDS_Assigne || Number(p.PIN_CDS_Assigne) === Session.pin);
      // Roster complet — un commercial sans appel (Journal) ou sans visite
      // (Visites FDV) ne doit pas disparaître de la liste par commercial.
      this._rosterComplet = Array.isArray(cdsApi) ? cdsApi : []; // Bug2 — pour notifs dynamiques
      this.state.cdsListe = this._rosterComplet
        .filter(c => ['CDS', 'ADMIN'].includes(String(c.role).toUpperCase()));
      // BUG-09 + BLOC 3 : base phoning = comptes attribués au CDS,
      // restreinte aux comptes HISTORIQUES (STATUT_COMPTE RÉACTIVER ou ACTIF).
      const STATUTS_PHONING = ['REACTIVER', 'RÉACTIVER', 'ACTIF'];
      const estHistorique = c => {
        const st = String(c.STATUT_COMPTE || '').trim().toUpperCase();
        // Pas de statut renseigné → on garde (compte historique par défaut).
        return st === '' || STATUTS_PHONING.includes(st);
      };
      this.state.tousComptes = comptes; // tous comptes pour recherche planning (y compris ESI)
      this.state.comptes = comptes.filter(c =>
        (Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin) &&
        estHistorique(c)
      );
      // Planning = appels planifiés non supprimés du CDS courant
      this.state.planning = planning
        .filter(a =>
          String(a.deleted || '').toUpperCase() !== 'TRUE' &&
          String(a.Statut_Appel || '').toLowerCase() === 'planifié' &&
          (Session.voitTout() || Number(a.PIN_CDS) === Session.pin)
        )
        .sort((a, b) => (a.Date_Planifiee || '').localeCompare(b.Date_Planifiee || ''));
      // Si idCible passé (depuis fiche compte OU depuis un lead Tracker), ouvrir
      // le formulaire de planification pré-rempli. Le bouton "Planifier appel"
      // du Tracker (vue-pipeline.js) route vers #/phoning/:id avec un ID_Prospect,
      // qui ne matche jamais 🏢_COMPTES — d'où la recherche en second recours
      // dans 📋_PROSPECTS via _resoudreCible() (sinon le formulaire ne s'ouvrait
      // jamais pour un lead).
      if (idCible) {
        const resolu = this._resoudreCible(idCible, comptes, this.state.prospects);
        // Bloc replanification (07/2026) — contexte posé par
        // VueVisites.planifierSuiviAppel() juste avant la navigation vers
        // #/phoning/:id ; consommé une seule fois ici, jamais persisté au-delà.
        const suivi = window._suiviActionOrigine;
        window._suiviActionOrigine = null;
        if (resolu) {
          this.state.formPlanif = {
            idCompte: resolu.id, nomCompte: resolu.nom,
            datePlanifiee: '', objectif: '', note: suivi?.note || '',
            idActionOrigine: suivi?.idVisite || '',
          };
        }
      }
      this._restaurerBrouillon();
      this.state.chargement = false;
      this.render();
      // Chargé systématiquement (pas seulement en mode Journal) — alimente aussi
      // les KPI cards de l'onglet Base (Bloc 3 §1/§5).
      this._chargerJournal();
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
    const auj = dateISOLocale();
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

  // ── Module 3 : Draft localStorage ──
  _CLE_BROUILLON: 'esi_phoning_brouillon',

  _sauvegarderBrouillon() {
    const s = this.state;
    const b = { objectif: s.d.objectif, accroche: s.d.accroche, recherche: s.recherche,
                froidsFields: s.froidsFields, froidsMode: s.froidsMode };
    try { localStorage.setItem(this._CLE_BROUILLON, JSON.stringify(b)); s.brouillonSauvegarde = true; } catch {}
  },

  _restaurerBrouillon() {
    try {
      const raw = localStorage.getItem(this._CLE_BROUILLON);
      if (!raw) return;
      const b = JSON.parse(raw);
      if (b.objectif || b.froidsMode || (b.froidsFields && b.froidsFields.nom)) {
        this.state.d.objectif = b.objectif || '';
        this.state.d.accroche = b.accroche || '';
        this.state.recherche  = b.recherche || '';
        this.state.froidsFields = b.froidsFields || { nom: '', dept: '', ville: '', tel: '', email: '', adresse: '' };
        this.state.froidsMode   = !!b.froidsMode;
        this.state.brouillonSauvegarde = true;
      }
    } catch {}
  },

  _effacerBrouillon() {
    try { localStorage.removeItem(this._CLE_BROUILLON); } catch {}
    if (this.state) this.state.brouillonSauvegarde = false;
  },

  setSource(s)  { this.state.typeSource = s; this.state.cible = null; this.state.recherche = ''; this.render(); },
  setMode(m) {
    // Bloc 3 §4 — Alexandra (CHANNEL_MANAGER) reste cantonnée au Journal lecture
    // seule (elle n'a jamais eu accès à Planning/Base — ex-Visites/Phoning/Primes
    // "raw CDS", cf. permissions.js) : seul l'ancien onglet Rapport Phoning séparé
    // lui était ouvert, désormais fusionné ici.
    if (Session.role === 'CHANNEL_MANAGER' && m !== 'HISTORIQUE') return;
    this.state.mode = m;
    if (m === 'HISTORIQUE') this._chargerJournal();
    this.render();
  },

  demarrerAppelDirect() {
    this.state.cible      = null;
    this.state.typeSource = 'EXISTANT';
    this.state.mode       = 'APPEL';
    this.state.phase      = 'PRE';
    this.state.recherche  = '';
    this.state.geminiAnalyse = null;
    Object.assign(this.state.d, { objectif:'', accroche:'', statutAppel:'', interetEmpower:'', frein:'', prochaineAction:'', dateRappel:'', note:'', commandeAnnoncee:'', montantEstime:'', statutFinal:'', typeAppel:'', interetScore:0, concurrentActuel:'', potentielEstime:'', statutCallPills:'', empowerQ:[false,false,false,false,false], norton360:[], opCommerciale:[] });
    this._trackerAjoute = false; this._modalAjoutTracker = null;
    this.render();
  },

  demarrerAppelCompte(idCompte, _depuisFile = false) {
    const c = this.state.comptes.find(x => String(x.ID_Compte) === String(idCompte));
    if (!c) { Toast.afficher('Compte introuvable', 'warning'); return; }
    // Bloc 6 — file d'appels (permet "Appel suivant" depuis l'écran de succès) :
    // capturée seulement au premier appel de la session, pas ré-écrasée quand
    // appelSuivant() ré-invoque cette fonction pour l'élément suivant.
    if (!_depuisFile) {
      let liste = this.state.comptes;
      const q = this.state.rechercheBase ? normaliserNom(this.state.rechercheBase) : '';
      if (q.length >= 2) liste = liste.filter(x => normaliserNom(x.Nom_Compte).includes(q) || normaliserNom(x.Ville || '').includes(q));
      this.state._fileAppels = liste;
      this.state._fileAppelsIdx = liste.findIndex(x => String(x.ID_Compte) === String(idCompte));
    }
    this.state.cible      = c;
    this.state.typeSource = 'EXISTANT';
    this.state.mode       = 'APPEL';
    this.state.phase      = 'CALL';   // accès direct depuis Base — pas de friction PRE
    this.state.callStep   = 1;
    this.state.recherche  = c.Nom_Compte;
    this.state.geminiAnalyse = null;
    Object.assign(this.state.d, { objectif:'Prospection Empower', accroche:'', statutAppel:'', interetEmpower:'', frein:'', prochaineAction:'', dateRappel:'', note:'', commandeAnnoncee:'', montantEstime:'', statutFinal:'', typeAppel:'', interetScore:0, concurrentActuel:'', potentielEstime:'', statutCallPills:'', empowerQ:[false,false,false,false,false], norton360:[], opCommerciale:[] });
    this._trackerAjoute = false; this._modalAjoutTracker = null;
    this._demarrerTimerAppel();
    this.render();
  },

  // Bloc 3 §2 — "Saisie post appel" : renseigner un appel déjà passé (hors app),
  // sans passer par la phase CALL chronométrée. Va directement en phase POST.
  demarrerSaisiePostAppel(idCompte) {
    const c = this.state.comptes.find(x => String(x.ID_Compte) === String(idCompte));
    if (!c) { Toast.afficher('Compte introuvable', 'warning'); return; }
    this.state.cible      = c;
    this.state.typeSource = 'EXISTANT';
    this.state.mode       = 'APPEL';
    this.state.phase      = 'POST';
    this.state.recherche  = c.Nom_Compte;
    this.state.geminiAnalyse = null;
    Object.assign(this.state.d, { objectif:'Prospection Empower', accroche:'', statutAppel:'', interetEmpower:'', frein:'', prochaineAction:'', dateRappel:'', note:'', commandeAnnoncee:'', montantEstime:'', statutFinal:'', typeAppel:'', interetScore:0, concurrentActuel:'', potentielEstime:'', statutCallPills:'', empowerQ:[false,false,false,false,false], norton360:[], opCommerciale:[] });
    this._trackerAjoute = false; this._modalAjoutTracker = null;
    this.render();
  },

  // ── Bloc 6 refonte desktop : timer temps réel pendant l'appel ──
  _demarrerTimerAppel() {
    this.state.appelDebutTs = Date.now();
    if (this._timerAppelId) return; // déjà actif — évite les doublons si render() rappelé
    this._timerAppelId = setInterval(() => {
      const el = document.getElementById('phoning-timer-appel');
      if (!el || !this.state.appelDebutTs) return;
      const sec = Math.floor((Date.now() - this.state.appelDebutTs) / 1000);
      el.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }, 1000);
  },
  _arreterTimerAppel() {
    if (this._timerAppelId) { clearInterval(this._timerAppelId); this._timerAppelId = null; }
  },

  // ── Bloc 6 refonte desktop : enchaîner directement sur le prochain appel ──
  appelSuivant() {
    const file = this.state._fileAppels;
    const idx  = this.state._fileAppelsIdx;
    if (!file || idx === -1 || idx + 1 >= file.length) {
      Toast.afficher('Plus de compte à appeler dans cette liste', 'info');
      this.init();
      return;
    }
    const suivant = file[idx + 1];
    this.state._fileAppelsIdx = idx + 1;
    this.demarrerAppelCompte(suivant.ID_Compte, true);
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

  // ── Bug2 — Ajout au Tracker Empower depuis un appel intéressé (parité avec
  // vue-questionnaire.js/ouvrirAjoutTracker, jusque-là totalement absent en Phoning) ──
  _modalAjoutTracker: null,
  _trackerAjoute: false,
  _ajoutTrackerEnCours: false,

  _destinatairesAlerteTracker() {
    const pins = (this._rosterComplet || [])
      .filter(u => ['ADMIN', 'CHANNEL_MANAGER'].includes(String(u.role).toUpperCase()))
      .map(u => Number(u.pin));
    return [...new Set(pins.length ? pins : [1000, 5000])];
  },

  ouvrirAjoutTracker() {
    const c = this.state.cible;
    this._modalAjoutTracker = {
      nomCompte:   c?.Nom_Compte || '',
      adresse:     c?.Adresse || '',
      ville:       c?.Ville || '',
      departement: c?.Departement || '',
      tel:         c?.Tel || '',
      email:       c?.Email || '',
      contactNom:      c?.CONTACT_NOM || '',
      contactFonction: c?.CONTACT_FONCTION || '',
    };
    this._rafraichirZoneTracker();
  },

  fermerAjoutTracker() { this._modalAjoutTracker = null; this._rafraichirZoneTracker(); },

  forcerAjoutTracker() {
    this._modalAjoutTracker.doublonExistant = null;
    this._modalAjoutTracker._forcerDoublon = true;
    this.confirmerAjoutTracker();
  },

  _rafraichirZoneTracker() {
    const zone = document.getElementById('ph-zone-tracker');
    if (zone) zone.innerHTML = this._renderZoneTracker();
  },

  async confirmerAjoutTracker() {
    const m = this._modalAjoutTracker;
    if (!m || !m.nomCompte.trim()) { Toast.afficher('Nom du compte requis', 'warning'); return; }

    const normNom = normaliserNom(m.nomCompte);
    const dejaCompte = this.state.comptes.find(c => normaliserNom(c.Nom_Compte) === normNom);
    const dejaLead   = this.state.prospects.find(p => normaliserNom(p.Nom_Compte) === normNom);
    const doublon = dejaCompte || dejaLead;
    if (doublon && !m._forcerDoublon) {
      this._modalAjoutTracker.doublonExistant = { ...doublon, _typeDoublon: dejaCompte ? 'compte' : 'lead' };
      this._rafraichirZoneTracker();
      return;
    }
    if (this._ajoutTrackerEnCours) return;
    this._ajoutTrackerEnCours = true;
    this._rafraichirZoneTracker();
    try {
      const lead = {
        ID_Prospect: genId('PROS'),
        Nom_Compte: m.nomCompte, Adresse: m.adresse, Ville: m.ville, Departement: m.departement,
        Tel: m.tel, Email: m.email,
        PIN_CDS_Assigne: Session.pin, Nom_CDS: Session.nom,
        STATUT_EMPOWER: 'SAISIE', FLAG_ACTION: 'SAISIE',
        Source_Import: 'ESI_PHONING', ORIGINE: 'PHONING',
        Flag_traite: 'FALSE', Flag_converti: 'FALSE',
        CONTACT_NOM: m.contactNom, CONTACT_FONCTION: m.contactFonction,
        Note_initiale: `Ajouté depuis appel téléphonique du ${dateISOLocale()} (intérêt EMPOWER : ${this.state.d.interetEmpower || '—'}).`,
        Date_Import: dateISOLocale(),
        Timestamp: new Date().toISOString(),
      };
      await SheetsAPI.ecrire('EMPOWER_MDB', '📋_PROSPECTS', lead);
      this.state.prospects.unshift(lead);
      for (const dest of this._destinatairesAlerteTracker()) {
        SheetsAPI.ecrire('EMPOWER_MDB', '🔔_NOTIFS', {
          ID_Notif: genId('NOTIF'), Date_Envoi: new Date().toISOString(),
          PIN_Destinataire: dest, Type_Notif: 'NOUVEAU_LEAD',
          Message: `🎯 Nouveau lead depuis appel téléphonique (${Session.nom}) : ${m.nomCompte}`,
          ID_Cible: lead.ID_Prospect, Statut_Lu: false, Timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
      this._modalAjoutTracker = null;
      this._trackerAjoute = true;
      Toast.afficher(`✅ Ajouté au Tracker : ${m.nomCompte}`, 'succes', 5000);
      this._rafraichirZoneTracker();
    } catch(e) {
      Toast.afficher('❌ ' + e.message, 'erreur');
    } finally {
      this._ajoutTrackerEnCours = false;
    }
  },

  // Bouton + modal, regroupés dans une seule zone rafraîchissable sans
  // toucher au reste de l'écran de succès post-appel.
  _renderZoneTracker() {
    const interesse = ['Fort', 'Moyen'].includes(this.state.d.interetEmpower);
    if (!interesse) return '';
    return `
      <button type="button" class="btn-primaire" style="margin-top:10px;width:100%"
              onclick="VuePhoning.ouvrirAjoutTracker()" ${this._trackerAjoute ? 'disabled' : ''}>
        ${this._trackerAjoute ? '✅ Ajouté au Tracker Empower' : '➕ Ajouter au Tracker Empower'}
      </button>
      ${this._renderModalAjoutTracker()}`;
  },

  _renderModalAjoutTracker() {
    const m = this._modalAjoutTracker;
    if (!m) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.fermerAjoutTracker()">
      <div class="modal">
        <h3>Ajouter au Tracker Empower</h3>
        ${m.doublonExistant ? `
        <div style="background:color-mix(in srgb,var(--c-warning) 12%,transparent);border:1px solid var(--c-warning);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
          <div style="font-weight:700;color:var(--c-warning);margin-bottom:6px">Ce nom existe déjà — ${m.doublonExistant._typeDoublon === 'compte' ? 'compte actif' : 'lead Tracker'}</div>
          <div style="font-size:13px;margin-bottom:10px"><strong>${m.doublonExistant.Nom_Compte}</strong></div>
          <button class="btn-primaire" style="width:100%;font-size:12px" onclick="VuePhoning.forcerAjoutTracker()">Ajouter quand même</button>
        </div>` : ''}
        <p style="font-size:13px;color:var(--c-text-2);margin-bottom:12px">Relire les informations avant création du lead (statut initial : SAISIE).</p>
        <label>Nom de l'enseigne *
          <input required value="${m.nomCompte}"
                 oninput="VuePhoning._modalAjoutTracker.nomCompte=this.value"/></label>
        <label>Adresse
          <input value="${m.adresse}"
                 oninput="VuePhoning._modalAjoutTracker.adresse=this.value"/></label>
        <div style="display:flex;gap:8px">
          <label style="flex:1">Département
            <input placeholder="ex : 75" maxlength="3" value="${m.departement}"
                   oninput="VuePhoning._modalAjoutTracker.departement=this.value"/></label>
          <label style="flex:2">Ville
            <input placeholder="ex : Paris" value="${m.ville}"
                   oninput="VuePhoning._modalAjoutTracker.ville=this.value"/></label>
        </div>
        <label>Téléphone <span style="color:var(--c-text-2);font-weight:400">(optionnel)</span>
          <input type="tel" value="${m.tel}"
                 oninput="VuePhoning._modalAjoutTracker.tel=this.value"/></label>
        <label>Email <span style="color:var(--c-text-2);font-weight:400">(optionnel)</span>
          <input type="email" value="${m.email}"
                 oninput="VuePhoning._modalAjoutTracker.email=this.value"/></label>
        <div class="modal-btns">
          <button type="button" onclick="VuePhoning.fermerAjoutTracker()">Annuler</button>
          <button type="button" class="btn-primaire"
                  onclick="VuePhoning.confirmerAjoutTracker()" ${this._ajoutTrackerEnCours ? 'disabled' : ''}>
            ${this._ajoutTrackerEnCours ? 'Ajout…' : 'Ajouter au Tracker'}
          </button>
        </div>
      </div>
    </div>`;
  },

  // Sélectionner un prospect → BLOC 3 : passer par l'ÉTAPE 1 (objectif) avant l'appel
  choisirEtDemarrer(idx) {
    const p = this.listeProspectsTriee[idx];
    if (!p) return;
    this.state.cible = p;
    this.state.typeSource = 'PROSPECT';
    this.state.mode = 'APPEL';
    this.state.phase = 'PRE';   // planification obligatoire (objectif) avant CALL
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

  // BLOC 3 — pré-remplissage : dernier produit commandé (tolérant aux noms de colonnes).
  _dernierProduit() {
    const c = this.state.cible;
    if (!c) return '';
    const v = c.Dernier_Produit || c.Dernier_produit || c.DERNIER_PRODUIT
           || c.Dernier_NSB || c.Produit_Dernier || '';
    const s = String(v).trim();
    return (!s || /^(undefined|null|nan)$/i.test(s)) ? '' : s;
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
    const s = this.state;
    // objectif non bloquant — défaut silencieux si vide
    if (!String(s.d.objectif || '').trim()) s.d.objectif = 'Prospection Empower';
    if (s.froidsMode) {
      if (!s.froidsFields.nom.trim()) { Toast.afficher('Nom de l\'enseigne requis', 'warning'); return; }
      // tel facultatif — warning uniquement
      if (!s.froidsFields.tel.trim()) Toast.afficher('Téléphone non renseigné', 'warning');
      // Créer une cible virtuelle pour le flux CALL/POST
      s.cible = {
        ID_Compte: 'FROID_' + Date.now(),
        Nom_Compte: s.froidsFields.nom.trim(),
        Tel: s.froidsFields.tel.trim(),
        Email: s.froidsFields.email.trim(),
        Adresse: s.froidsFields.adresse.trim(),
        Ville: s.froidsFields.ville.trim(),
        Departement: s.froidsFields.dept.trim(),
        STATUT_COMPTE: 'FROID',
        _isFroid: true,
      };
    } else {
      if (!s.cible) { Toast.afficher('Sélectionnez un compte', 'warning'); return; }
    }
    s.phase = 'CALL';
    s.callStep = 1;
    this._demarrerTimerAppel();
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
          if (!d.frein) d.frein = q.freindetecte || '';
          if (!d.prochaineAction) d.prochaineAction = q.actionrecommandee || '';
          if (q.deadlineactionjours && !d.dateRappel) {
            d.dateRappel = dateISOLocale(new Date(Date.now() + q.deadlineactionjours * 86400000));
          }
          d.note = (d.note ? d.note + '\n' : '') + (q.resume || txt);
          // Auto-suggestion résultat prospect depuis score IA
          if (this.state.typeSource === 'PROSPECT' && !d.resultatProspect) {
            if (q.score >= 4)      d.resultatProspect = 'INTERESSE';
            else if (q.score <= 1) d.resultatProspect = 'NON_INTERESSE';
            else                   d.resultatProspect = 'RAPPELER';
          }
          Toast.afficher(`✅ Qualifié : ${q.typeappel || '—'} · score ${q.score ?? '—'}/5`, 'succes', 4000);
        } catch(e) { Toast.afficher('❌ IA : ' + e.message, 'erreur'); }
        const _d = this.state.d;
        if (_d.statutCallPills && !_d.statutAppel) _d.statutAppel = _d.statutCallPills;
        this._arreterTimerAppel();
        this.state.phase = 'POST';
        this.render();
      });
    } catch(e) {
      this.state.enregistre = false;
      this.render();
      Toast.afficher('🎙️ Micro inaccessible : ' + e.message, 'erreur');
    }
  },

  passerAuPost() {
    const d = this.state.d;
    // Pré-remplir statutAppel depuis les pills si déjà cliqué pendant l'appel
    if (d.statutCallPills && !d.statutAppel) d.statutAppel = d.statutCallPills;
    this._arreterTimerAppel();
    this.state.phase = 'POST';
    this.render();
  },

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
        Date: dateISOLocale(),
        Semaine_ISO: FiscalWeeks.codeDe(),
        PIN_CDS: Session.pin, Nom_CDS: Session.nom,
        ID_Cible: idCible, Reseller: c.Nom_Compte,
        Type_Appel: d.typeAppel || '',
        Statut_Appel: d.statutAppel,
        Interet_EMPOWER: d.interetEmpower,
        Interet_Score: d.typeAppel === 'Appel_Froid' ? (d.interetScore || null) : null,
        Questionnaire_JSON: JSON.stringify({
          interet_score:     d.interetScore || 0,
          concurrent_actuel: d.concurrentActuel || '',
          potentiel_estime:  d.potentielEstime || '',
          gemini_analyse:    s.geminiAnalyse || '',
          empower_score:     (d.empowerQ || []).reduce((acc, v, i) => acc + (v ? [1,2,1,2,3][i] : 0), 0),
          empower_q:         d.empowerQ || [],
          statut_call:       d.statutCallPills || '',
          // Bloc 3 §3 — sélection Norton 360/Op commerciale (compte EMPOWER, facultatif)
          norton360:         d.norton360 || [],
          op_commerciale:    d.opCommerciale || [],
        }),
        Frein_Principal: d.frein,
        Prochaine_Action: d.prochaineAction,
        Date_Rappel: d.dateRappel,
        Commande_Annoncee: estProspect ? '' : (d.commandeAnnoncee || ''),
        Montant_Estime: estProspect ? null : ((typeof parseCA !== "undefined" ? parseCA(d.montantEstime) : null) ?? null),
        Statut_Final: estProspect ? (d.resultatProspect || '') : (d.statutFinal || ''),
        Note: [d.note, s.qualif ? `[IA ${s.qualif.typeappel} · ${s.qualif.score}/5]` : ''].filter(Boolean).join('\n'),
        Timestamp: new Date().toISOString(),
      });

      // 1b. BLOC 6 — alertes score Groq (post-appel)
      const _score = Number(s.qualif?.score) || 0;
      const _notif = (dest, type, msg) => SheetsAPI.ecrire('EMPOWER_MDB', '🔔_NOTIFS', {
        ID_Notif: genId('NOTIF'), Date_Envoi: new Date().toISOString(),
        PIN_Destinataire: dest, Type_Notif: type,
        Message: msg, ID_Cible: idCible, Statut_Lu: false,
        Timestamp: new Date().toISOString(),
      }).catch(() => {});
      if (_score >= 4) {
        // Score ≥ 4 → CDS concerné + Tadjidine (1000)
        const dests = [...new Set([Session.pin, 1000])];
        for (const dest of dests) await _notif(dest, 'SCORE_GROQ', `Score IA ${_score}/5 · ${c.Nom_Compte}`);
      }
      // Lead sourcé par Alexandra (channel) + score ≥ 2 → Alexandra (5000)
      if (_score >= 2 && estProspect && String(c.ORIGINE || '').toUpperCase().includes('ALEXANDRA')) {
        await _notif(5000, 'SCORE_GROQ_CHANNEL', `Score IA ${_score}/5 · lead ${c.Nom_Compte}`);
      }

      // 2. Mise à jour fiche
      if (estProspect) {
        const maj = { Date_prochaine_action: d.dateRappel, Flag_traite: 'TRUE' };
        const res = d.resultatProspect;

        if (res === 'NON_INTERESSE') {
          // Archivage définitif
          maj.STATUT_EMPOWER = 'ARCHIVE';
          maj.FLAG_ACTION = 'ARCHIVE';
          maj.Note_initiale = (c.Note_initiale ? c.Note_initiale + '\n' : '')
            + `[NON_INTERESSE ${dateISOLocale()}]${d.frein ? ' · ' + d.frein : ''}`;
        } else if (res === 'INTERESSE') {
          // Avancement pipeline vers EN_COURS
          maj.STATUT_EMPOWER = 'EN_COURS';
          maj.FLAG_ACTION = 'EN_COURS';
        } else if (res === 'NON_JOIGNABLE' || res === 'RAPPELER') {
          // Reste en pipeline, rappel planifié
          maj.Flag_traite = 'FALSE';
        } else if (res === 'A_VISITER') {
          // Prospect à visiter sur le terrain — conservé en pipeline, marqué A_VISITER
          maj.FLAG_ACTION = 'A_VISITER';
          maj.STATUT_EMPOWER = 'A_VISITER';
          maj.Flag_traite = 'FALSE';
        }

        await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', idCible, maj);
        // Sync état local
        const local = s.prospects.find(p => p.ID_Prospect === idCible);
        if (local) Object.assign(local, maj);
      } else if (!c._isFroid) {
        // Appel sur compte existant — mise à jour de la fiche compte
        const majCompte = {
          Date_Derniere_Action: dateISOLocale(),
          Type_Derniere_Action: 'Appel',
          Prochaine_Action: d.prochaineAction,
          Date_Prochaine_Action: d.dateRappel || null,
        };
        // BLOC 3 — statut final aligné sur le vocabulaire réel (EN_COURS/INTEGRE/ARCHIVE)
        if (['EN_COURS', 'INTEGRE', 'ARCHIVE'].includes(d.statutFinal)) {
          majCompte.STATUT_COMPTE = d.statutFinal;
        }
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', idCible, majCompte);
        // Sync état local
        const localC = s.comptes.find(x => String(x.ID_Compte) === String(idCible));
        if (localC) Object.assign(localC, majCompte);
      }

      // 2b. Marquer l'appel planifié comme réalisé (BUG-09)
      if (s.idPlanifEnCours) {
        try {
          await SheetsAPI.mettreAJour('EMPOWER_MDB', '📞_PHONING', s.idPlanifEnCours, {
            Statut_Appel: 'réalisé',
          });
        } catch(_) { /* non bloquant */ }
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
        INTERESSE:      'Lead avancé <strong>EN COURS</strong> dans le Tracker',
        NON_INTERESSE:  'Prospect <strong>archivé</strong> (non intéressé)',
        NON_JOIGNABLE:  'Rappel planifié · prospect non joignable',
        RAPPELER:       'Rappel planifié',
        A_VISITER:      'Prospect marqué <strong>À VISITER</strong> — planifier une visite terrain',
      }[d.resultatProspect] || '';

      this._effacerBrouillon();
      this.sessionAppels++; // Bloc 6 — compteur de session
      const aUnSuivant = s._fileAppels && s._fileAppelsIdx > -1 && s._fileAppelsIdx + 1 < s._fileAppels.length;
      document.getElementById('app').innerHTML = `
        <div class="visite-succes">
          <div class="succes-icone"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
          <h2>Appel enregistré</h2>
          <p class="succes-duree">${c.Nom_Compte}</p>
          <p class="succes-duree">📞 ${this.sessionAppels} appel${this.sessionAppels > 1 ? 's' : ''} cette session</p>
          <div class="succes-recap">
            <div>${d.statutAppel} · Intérêt EMPOWER : ${d.interetEmpower || '—'}</div>
            ${msgResultat ? `<div>${msgResultat}</div>` : ''}
            ${!estProspect && d.commandeAnnoncee && d.commandeAnnoncee !== 'Non'
              ? `<div>Commande ${d.commandeAnnoncee.toLowerCase()}${parseCA(d.montantEstime) !== null ? ' · ≈ ' + fmtCA(d.montantEstime) + ' €' : ''}</div>` : ''}
            ${!estProspect && d.statutFinal ? `<div>Statut final : ${d.statutFinal}</div>` : ''}
            ${d.prochaineAction ? `<div>${d.prochaineAction}${d.dateRappel ? ' — ' + dateRelative(d.dateRappel) : ''}</div>` : ''}
            ${s.qualif?.resume ? `<div>${s.qualif.resume}</div>` : ''}
          </div>
          <div id="ph-zone-tracker">${this._renderZoneTracker()}</div>
          <div class="succes-btns">
            ${aUnSuivant ? `<button class="btn-primaire" style="background:var(--c-success)" onclick="VuePhoning.appelSuivant()">☎ Appel suivant →</button>` : ''}
            <button class="btn-primaire" onclick="Router.aller('#/dashboard')">← Dashboard</button>
            <button class="btn-secondaire" onclick="VuePhoning.init()">Retour au planning</button>
          </div>
        </div>`;
    } catch(e) {
      s.envoiEnCours = false;
      this.render();
      Toast.afficher('❌ Erreur : ' + e.message, 'erreur', 5000);
    }
  },

  // ── Bloc 3 §1/§5 — KPI cards "Aujourd'hui" sur l'onglet Base (pattern
  //    .ch-stats généralisé) : nombre d'appels, réussis, sans réponse,
  //    intéressés, commandes acceptées — de mon activité du jour. ──
  _renderKpiBase() {
    const auj = dateISOLocale();
    const mesAppelsAuj = (this.state.journal || []).filter(a =>
      Number(a.PIN_CDS) === Session.pin && (a.Date || '').slice(0, 10) === auj
    );
    const stats = {
      total:       mesAppelsAuj.length,
      reussis:     mesAppelsAuj.filter(a => a.Statut_Appel === 'Répondu').length,
      sansReponse: mesAppelsAuj.filter(a => a.Statut_Appel === 'Répondeur').length,
      interesses:  mesAppelsAuj.filter(a => ['Fort', 'Moyen'].includes(a.Interet_EMPOWER)).length,
      commandes:   mesAppelsAuj.filter(a => a.Commande_Annoncee === 'Oui').length,
    };
    return `
      <div class="ch-stats" style="border-radius:var(--radius-sm);margin-bottom:12px">
        <div class="ch-stat"><div class="ch-stat-val">${stats.total}</div><div class="ch-stat-lbl">Appels</div></div>
        <div class="ch-stat bleu"><div class="ch-stat-val">${stats.reussis}</div><div class="ch-stat-lbl">Réussis</div></div>
        <div class="ch-stat coral"><div class="ch-stat-val">${stats.sansReponse}</div><div class="ch-stat-lbl">Sans réponse</div></div>
        <div class="ch-stat"><div class="ch-stat-val">${stats.interesses}</div><div class="ch-stat-lbl">Intéressés</div></div>
        <div class="ch-stat"><div class="ch-stat-val">${stats.commandes}</div><div class="ch-stat-lbl">Commandes</div></div>
      </div>`;
  },

  // ── Mode BASE : liste des comptes à appeler ──
  _renderBaseComptes() {
    const s = this.state;
    const _tabs = () => `
      <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface);margin-bottom:14px">
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('PLANNING')">Planning</button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:var(--c-title);color:#fff">
          Base (${s.comptes.length})
        </button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('HISTORIQUE')">Journal</button>
      </div>`;

    if (!s.comptes.length) {
      return `<div class="q-champs">${_tabs()}<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucun compte attribué.</div></div>`;
    }

    return `<div class="q-champs">
      ${_tabs()}
      ${this._renderKpiBase()}
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input class="q-input" placeholder="🔍 Filtrer mes comptes…" value="${s.rechercheBase || ''}"
               oninput="VuePhoning.setRechercheBase(this.value)" style="flex:2"/>
        ${Session.voitTout() ? `
        <select class="q-input" style="flex:1" onchange="VuePhoning.setFiltreCDSBase(this.value)">
          <option value="TOUS">Tous CDS</option>
          ${s.cdsListe.map(c => `<option value="${c.pin}" ${s.filtreCDSBase == c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
        </select>` : ''}
      </div>
      <div id="ph-base-grid">${this._renderBaseGrid()}</div>
    </div>`;
  },

  // Recherche/filtre "Base" : ne met à jour que la grille (#ph-base-grid), pas
  // tout le render() — sinon l'input texte est détruit/recréé à chaque frappe
  // et perd le focus/curseur (cf. pattern déjà utilisé par setRecherche/_renderSuggestions).
  setRechercheBase(v) {
    this.state.rechercheBase = v;
    const zone = document.getElementById('ph-base-grid');
    if (zone) zone.innerHTML = this._renderBaseGrid();
  },

  // Filtre par commercial (Manager/Admin/Channel) — même principe que le
  // filtre CDS de l'onglet Comptes (vue-comptes.js), absent jusqu'ici en Base.
  setFiltreCDSBase(pin) {
    this.state.filtreCDSBase = pin;
    const zone = document.getElementById('ph-base-grid');
    if (zone) zone.innerHTML = this._renderBaseGrid();
  },

  _renderBaseGrid() {
    const s = this.state;
    let liste = s.comptes;
    if (Session.voitTout() && s.filtreCDSBase !== 'TOUS') {
      liste = liste.filter(c => String(c.PIN_CDS_Assigne) === String(s.filtreCDSBase));
    }
    const q = s.rechercheBase ? normaliserNom(s.rechercheBase) : '';
    if (q.length >= 2) liste = liste.filter(c => normaliserNom(c.Nom_Compte).includes(q) || normaliserNom(c.Ville || '').includes(q));

    if (liste.length === 0) return '<div style="padding:24px;text-align:center;color:var(--c-text-2)">Aucun résultat</div>';
    return `<div class="phoning-base-grid">` + liste.map(c => {
      const statut = c.STATUT_COMPTE || '—';
      const silence = (() => { const ref = c.Date_Derniere_Action; return ref ? Math.floor((Date.now() - new Date(ref).getTime()) / (7*86400000)) : null; })();
      return `
    <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:11px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-weight:700;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.Nom_Compte}</span>
        ${c.CANAL ? `<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:var(--c-bg);border:1px solid var(--c-border);color:var(--c-text-2)">${c.CANAL}</span>` : ''}
      </div>
      <div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">
        ${c.Ville ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${c.Ville}` : ''}
        ${statut !== '—' ? ` · ${statut}` : ''}
        ${silence !== null ? ` · <span style="color:${silence > 4 ? 'var(--c-danger)' : 'var(--c-text-2)'}">${silence}s silence</span>` : ''}
      </div>
      <div style="display:flex;gap:8px">
        ${c.Tel ? `<a class="btn-secondaire" style="flex:1;font-size:12px;text-decoration:none;text-align:center;padding:8px" href="tel:${String(c.Tel).replace(/\s/g,'')}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${c.Tel}</a>` : ''}
        <button class="btn-primaire" style="flex:2;font-size:12px;padding:8px"
                onclick="VuePhoning.demarrerAppelCompte('${c.ID_Compte}')">▶ Démarrer l'appel</button>
        <button class="btn-secondaire" style="flex:2;font-size:12px;padding:8px"
                onclick="VuePhoning.demarrerSaisiePostAppel('${c.ID_Compte}')" title="Renseigner un appel déjà passé">📝 Saisie post appel</button>
        <button class="btn-secondaire" style="flex:1;font-size:12px;padding:8px"
                onclick="VuePhoning.ouvrirFormPlanif('${c.ID_Compte}')" title="Planifier un appel pour ce compte (apparaît dans Planning)">📅</button>
      </div>
    </div>`;
      }).join('') + `</div>`;
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
    if (Session.role !== 'ADMIN' && Number(a.PIN_CDS) !== Session.pin) {
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
    if (Session.role !== 'ADMIN' && Number(a.PIN_CDS) !== Session.pin) {
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

    const ts = dateISOLocale().replace(/-/g, '');
    const fn = `PHONING_${f.debut || 'debut'}_${f.fin || 'fin'}_${ts}.csv`;

    const rows = data.map(a => {
      // BLOC 10 — Extraire score Groq et concurrent depuis Questionnaire_JSON
      let scoreGroq = a.Interet_Score || '';
      let concurrentGroq = a.Concurrent_Actuel || '';
      let resumeIA = '';
      try {
        if (a.Questionnaire_JSON) {
          const qj = JSON.parse(a.Questionnaire_JSON);
          scoreGroq      = qj.interet_score ?? scoreGroq;
          concurrentGroq = qj.concurrent_actuel || qj.concurrent || concurrentGroq;
          resumeIA       = qj.gemini_analyse || '';
        }
      } catch(_) {}
      return {
        ID_Appel:          a.ID_Appel || '',
        Date:              (a.Date || '').slice(0, 10),
        Semaine_ISO:       a.Semaine_ISO || '',
        CDS:               resolveCDS(a.PIN_CDS || a.Nom_CDS) || '',
        Compte:            a.Reseller || '',
        Type_Appel:        a.Type_Appel || '',
        Statut_Appel:      a.Statut_Appel || '',
        Interet_EMPOWER:   a.Interet_EMPOWER || '',
        Score_Groq:        scoreGroq !== '' ? scoreGroq : '',
        Frein_Principal:   a.Frein_Principal || '',
        Concurrent_Actuel: concurrentGroq || '',
        Resume_IA:         resumeIA || '',
        Prochaine_Action:  a.Prochaine_Action || '',
        Date_Rappel:       a.Date_Rappel || '',
        Commande_Annoncee: a.Commande_Annoncee || '',
        Montant_Estime:    a.Montant_Estime != null && a.Montant_Estime !== '' ? a.Montant_Estime : '',
        Statut_Final:      a.Statut_Final || '',
        Note:              a.Note || '',
        Timestamp:         a.Timestamp || '',
      };
    });

    generateCSV(rows, fn);
    this.state.extractOuvert = false;
    this.render();
  },

  // ── R5 : Vue journal des appels ──
  _renderJournal() {
    const s = this.state;
    const tabs = `
      <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface);margin-bottom:14px">
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('PLANNING')">Planning</button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('BASE')">Base (${s.comptes.length})</button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:var(--c-title);color:#fff">
          Journal
        </button>
      </div>`;
    if (s.journalChargement) {
      return `<div class="q-champs">${tabs}<div style="padding:32px;text-align:center;color:var(--c-text-2)">Chargement du journal…</div></div>`;
    }
    // Bloc 3 §4 — Rapport Phoning intégré : Manager/Admin voient les sessions
    // groupées par commercial tant qu'aucun n'est choisi (même pattern que
    // Planning, cf. _grouperParCommercialPlanning) — remplace l'ancien onglet
    // séparé vue-phoning-fdv.js.
    if (Session.voitTout() && !s.commercialSelectionne) {
      return `<div class="q-champs">${tabs}${this._renderCartesCommerciauxJournal()}</div>`;
    }
    return `<div class="q-champs">${tabs}
      ${Session.voitTout() ? this._boutonRetourCommerciauxPlanning() : ''}
      ${this._renderSousOngletsJournal()}
    </div>`;
  },

  // ── Bloc 3 §4 — cartes par commercial pour le Journal (Manager/Admin) ──
  _renderCartesCommerciauxJournal() {
    const map = new Map();
    // Amorce avec tous les commerciaux actifs (0 appel affiché explicitement),
    // pas seulement ceux qui ont déjà au moins une ligne dans le journal.
    this.state.cdsListe.forEach(c => {
      const pin = String(c.pin);
      map.set(pin, { pin, nom: resolveCDS(c.pin) !== '—' ? resolveCDS(c.pin) : c.nom, total: 0, dernier: null });
    });
    this.state.journal.forEach(a => {
      const pin = String(a.PIN_CDS || '');
      if (!pin) return;
      if (!map.has(pin)) map.set(pin, { pin, nom: resolveCDS(a.PIN_CDS || a.Nom_CDS), total: 0, dernier: null });
      const g = map.get(pin);
      g.total++;
      const d = (a.Date || '').slice(0, 10);
      if (d && (!g.dernier || d > g.dernier)) g.dernier = d;
    });
    const groupes = [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    if (!groupes.length) return `<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucun appel enregistré.</div>`;
    return groupes.map(g => `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;cursor:pointer"
           onclick="VuePhoning.selectionnerCommercialPlanning('${g.pin}')">
        <div style="font-weight:700;font-size:15px;color:var(--c-title)">${g.nom}</div>
        <div style="font-size:12px;color:var(--c-text-2);margin-top:2px">
          ${g.total} appel${g.total > 1 ? 's' : ''} · dernier ${g.dernier ? dateRelative(g.dernier) : '—'}
        </div>
      </div>`).join('');
  },

  setJournalVue(v) { this.state.journalVue = v; this.render(); },
  journalPrecedent() {
    const d = new Date(this.state.journalDate);
    d.setDate(d.getDate() - (this.state.journalVue === 'semaine' ? 7 : 1));
    this.state.journalDate = dateISOLocale(d);
    this.render();
  },
  journalSuivant() {
    const d = new Date(this.state.journalDate);
    d.setDate(d.getDate() + (this.state.journalVue === 'semaine' ? 7 : 1));
    this.state.journalDate = dateISOLocale(d);
    this.render();
  },

  // Appels du commercial sélectionné (Manager) ou de soi-même (CDS, déjà
  // filtré à l'origine par _chargerJournal()).
  _appelsCommercialJournal() {
    const pin = this.state.commercialSelectionne;
    return pin ? this.state.journal.filter(a => String(a.PIN_CDS || '') === String(pin)) : this.state.journal;
  },

  _journalAppelsPeriode() {
    const appels = this._appelsCommercialJournal();
    if (this.state.journalVue === 'historique') return appels;
    if (this.state.journalVue === 'jour') {
      const iso = this.state.journalDate;
      return appels.filter(a => (a.Date || '').slice(0, 10) === iso);
    }
    // semaine : lundi → dimanche de journalDate
    const d = new Date(this.state.journalDate);
    const lundi = new Date(d);
    lundi.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const debut = dateISOLocale(lundi);
    const finD = new Date(lundi); finD.setDate(lundi.getDate() + 6);
    const fin = dateISOLocale(finD);
    return appels.filter(a => { const dt = (a.Date || '').slice(0, 10); return dt >= debut && dt <= fin; });
  },

  // ── Bloc 3 §4 — sous-onglets Jour/Semaine/Historique + KPI cards (pattern
  //    .ch-stats généralisé, cf. Bloc 3 §1) + liste détaillée. ──
  _renderSousOngletsJournal() {
    const s = this.state;
    const appels = this._journalAppelsPeriode();
    const stats = {
      total:       appels.length,
      reussis:     appels.filter(a => a.Statut_Appel === 'Répondu').length,
      sansReponse: appels.filter(a => a.Statut_Appel === 'Répondeur').length,
      interesses:  appels.filter(a => ['Fort', 'Moyen'].includes(a.Interet_EMPOWER)).length,
      commandes:   appels.filter(a => a.Commande_Annoncee === 'Oui').length,
    };
    const dateLbl = s.journalVue === 'jour'
      ? new Date(s.journalDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      : `Semaine du ${s.journalDate}`;
    const COUL = { Répondu: 'var(--c-success)', Répondeur: 'var(--c-warning)', Occupé: 'var(--c-warning)', 'Faux numéro': 'var(--c-danger)', Refus: 'var(--c-danger)' };

    return `
      <div class="tabs-premium" style="margin-bottom:10px">
        <button class="tab-btn-premium ${s.journalVue === 'jour' ? 'actif' : ''}" onclick="VuePhoning.setJournalVue('jour')">Jour</button>
        <button class="tab-btn-premium ${s.journalVue === 'semaine' ? 'actif' : ''}" onclick="VuePhoning.setJournalVue('semaine')">Semaine</button>
        <button class="tab-btn-premium ${s.journalVue === 'historique' ? 'actif' : ''}" onclick="VuePhoning.setJournalVue('historique')">Historique</button>
      </div>
      ${s.journalVue !== 'historique' ? `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <button class="btn-filtre" style="width:auto;padding:6px 10px" onclick="VuePhoning.journalPrecedent()">←</button>
        <span style="font-size:13px;font-weight:600;flex:1;text-transform:capitalize">${dateLbl}</span>
        <button class="btn-filtre" style="width:auto;padding:6px 10px" onclick="VuePhoning.journalSuivant()">→</button>
      </div>` : ''}
      <div class="ch-stats" style="margin-bottom:12px">
        <div class="ch-stat"><div class="ch-stat-val">${stats.total}</div><div class="ch-stat-lbl">Appels</div></div>
        <div class="ch-stat bleu"><div class="ch-stat-val">${stats.reussis}</div><div class="ch-stat-lbl">Réussis</div></div>
        <div class="ch-stat coral"><div class="ch-stat-val">${stats.sansReponse}</div><div class="ch-stat-lbl">Sans réponse</div></div>
        <div class="ch-stat"><div class="ch-stat-val">${stats.interesses}</div><div class="ch-stat-lbl">Intéressés</div></div>
        <div class="ch-stat"><div class="ch-stat-val">${stats.commandes}</div><div class="ch-stat-lbl">Commandes</div></div>
      </div>
      ${appels.length === 0 ? `<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucun appel pour cette période.</div>` : appels.map(a => {
        // Alexandra (CHANNEL_MANAGER) : lecture seule, jamais d'édition de données CDS brutes.
        const peutModif = Session.role === 'ADMIN' || Number(a.PIN_CDS) === Session.pin;
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
          ${a.Note ? `<div style="font-size:12px;font-style:italic;color:var(--c-text-2);margin-top:4px">${String(a.Note).slice(0, 80)}${String(a.Note).length > 80 ? '…' : ''}</div>` : ''}
          ${peutModif ? `
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn-secondaire" style="padding:5px 10px;font-size:12px;width:auto"
                    onclick="VuePhoning.ouvrirEditAppel('${a.ID_Appel}')">Modifier</button>
            <button class="btn-secondaire" style="padding:5px 10px;font-size:12px;width:auto;color:var(--c-danger);border-color:var(--c-danger)"
                    onclick="VuePhoning.demanderSuppressionAppel('${a.ID_Appel}')">✕</button>
          </div>` : ''}
        </div>`;
      }).join('')}
    `;
  },

  // ── Modal édition appel ──
  _renderModalEditAppel() {
    const m = this.state.modalEditAppel;
    if (!m) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.fermerEditAppel()">
      <div class="modal">
        <h3>Modifier l'appel — ${m.compte}</h3>
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
            <button type="submit" class="btn-primaire">Enregistrer</button>
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
      // Bloc 9 : jamais de PIN affiché → resolveCDS pour le libellé commercial.
      const nom = a?.Nom_CDS || (window.resolveCDS ? resolveCDS(pin) : '—');
      return { pin: String(pin), nom: (nom && nom !== '—') ? nom : 'Commercial' };
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
                  ${cnt === 0 ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Exporter CSV</button>
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
    const TITRES = { PRE: 'Préparer l\'appel', CALL: 'Appel en cours', POST: 'Post-appel' };
    const peutExtraire = Session.voitTout();
    const backAction = (s.mode === 'PLANNING' || s.mode === 'HISTORIQUE')
      ? 'history.back()'
      : 'VuePhoning.setMode(\'PLANNING\')';
    const titre = s.mode === 'PLANNING' ? 'Planning phoning'
      : s.mode === 'HISTORIQUE' ? 'Journal appels'
      : TITRES[s.phase];

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="${backAction}" class="btn-retour">←</button>
        <h1>${titre}</h1>
        <div style="display:flex;gap:6px">
          ${peutExtraire ? `<button class="btn-retour" title="Extraction CSV" onclick="VuePhoning.ouvrirExtraction()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
          ${s.cible && s.mode === 'APPEL' ? `<span class="badge-compteur">${s.cible.Nom_Compte.slice(0, 14)}</span>` : ''}
        </div>
      </header>
      <!-- Bloc 3 §1/§5 — desktop dense pour les modes liste/pilotage (Planning,
           Base, Journal) ; le flux d'appel (PRE/CALL/POST) reste centré et
           focalisé, cf. commentaire questionnaire.css. -->
      <div class="q-contenu avec-nav ${['PLANNING','BASE','HISTORIQUE'].includes(s.mode) ? 'q-contenu-large' : ''}">
        ${s.mode === 'PLANNING'    ? this._renderPlanning()
        : s.mode === 'BASE'        ? this._renderBaseComptes()
        : s.mode === 'HISTORIQUE'  ? this._renderJournal()
        : this['_phase' + s.phase]()}
      </div>
      ${(s.mode === 'BASE' || s.mode === 'PLANNING' || s.mode === 'HISTORIQUE') && Session.role !== 'CHANNEL_MANAGER' ? `<button class="fab" onclick="VuePhoning.demarrerAppelDirect()" title="Créer un appel (base ou à froid)" style="bottom:140px">＋</button>` : ''}
      ${NavBar('phoning')}
      ${this._renderModalEditAppel()}
      ${this._renderConfirmDeleteAppel()}
      ${this._renderExtraction()}
      ${this._renderFormPlanif()}
    `;
    if (s.mode === 'APPEL') this._renderSuggestions();
  },

  _phasePRE() {
    const s = this.state, d = s.d;
    const silence = this._semainesSilence();

    return `<div class="q-champs">
      ${s.brouillonSauvegarde ? `<div style="font-size:11px;color:var(--c-text-2);display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 10px;background:var(--c-bg);border-radius:var(--radius-sm)">
        Brouillon sauvegardé
        <button type="button" style="margin-left:auto;font-size:11px;padding:2px 8px;border:1px solid var(--c-border);border-radius:4px;background:none;cursor:pointer;color:var(--c-danger)"
                onclick="VuePhoning._effacerBrouillon();VuePhoning.render()">Effacer</button>
      </div>` : ''}
      <!-- Module 3 : toggle Compte existant / Appel à froid -->
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <button type="button" class="btn-filtre ${!s.froidsMode ? 'actif' : ''}"
                onclick="VuePhoning.state.froidsMode=false;VuePhoning.render()">Compte existant</button>
        <button type="button" class="btn-filtre ${s.froidsMode ? 'actif' : ''}"
                onclick="VuePhoning.state.froidsMode=true;VuePhoning.render()">❄️ Appel à froid</button>
      </div>
      ${s.froidsMode ? `
        <label class="q-label">Nom de l'enseigne *
          <input class="q-input" required placeholder="ex : MICRO PLUS INFORMATIQUE" value="${s.froidsFields.nom}"
                 oninput="VuePhoning.state.froidsFields.nom=this.value;VuePhoning._sauvegarderBrouillon()"/></label>
        <div style="display:flex;gap:8px">
          <label class="q-label" style="flex:1">Département *
            <input class="q-input" placeholder="75" maxlength="3" required value="${s.froidsFields.dept}"
                   oninput="VuePhoning.state.froidsFields.dept=this.value;VuePhoning._sauvegarderBrouillon()"/></label>
          <label class="q-label" style="flex:2">Ville *
            <input class="q-input" placeholder="Paris" required value="${s.froidsFields.ville}"
                   oninput="VuePhoning.state.froidsFields.ville=this.value;VuePhoning._sauvegarderBrouillon()"/></label>
        </div>
        <label class="q-label">Téléphone *
          <input class="q-input" type="tel" required placeholder="01 23 45 67 89" value="${s.froidsFields.tel}"
                 oninput="VuePhoning.state.froidsFields.tel=this.value;VuePhoning._sauvegarderBrouillon()"/></label>
        <label class="q-label">Email <span style="font-size:11px;font-weight:400">(optionnel)</span>
          <input class="q-input" type="email" placeholder="contact@enseigne.fr" value="${s.froidsFields.email}"
                 oninput="VuePhoning.state.froidsFields.email=this.value;VuePhoning._sauvegarderBrouillon()"/></label>
        <label class="q-label">Adresse <span style="font-size:11px;font-weight:400">(optionnel)</span>
          <input class="q-input" placeholder="12 rue de la Paix, 75001 Paris" value="${s.froidsFields.adresse}"
                 oninput="VuePhoning.state.froidsFields.adresse=this.value;VuePhoning._sauvegarderBrouillon()"/></label>
        <div style="font-size:11px;color:var(--c-text-2);margin:-4px 0 10px;padding:6px;background:var(--c-bg);border-radius:var(--radius-sm)">
          ❄️ Appel à froid : non enregistré dans la base prospects. Enregistré uniquement dans le journal phoning.
        </div>
      ` : `
      ${s.idPlanifEnCours && s.cible ? `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--c-title)">${s.cible.Nom_Compte}</div>
          <div style="font-size:12px;color:var(--c-text-2)">Appel planifié — objectif : ${d.objectif || '—'}</div>
        </div>
      </div>` : ''}
      <label class="q-label">Compte à appeler
        <input class="q-input" placeholder="🔍 Rechercher…" value="${s.recherche}"
               oninput="VuePhoning.setRecherche(this.value)" autocomplete="off"/>
      </label>
      <div id="ph-suggestions"></div>
      ${s.cible ? `<div class="q-recap">
        <div class="q-recap-ligne"><span>Statut</span><strong>${s.cible.STATUT_COMPTE || s.cible.STATUT_EMPOWER || s.cible.Statut || '—'}</strong></div>
        ${s.cible.POTENTIEL ? `<div class="q-recap-ligne"><span>Potentiel</span><strong>${s.cible.POTENTIEL}</strong></div>` : ''}
        <div class="q-recap-ligne"><span>Silence</span><strong>${silence !== null ? silence + ' semaine(s)' : '—'}</strong></div>
        <div class="q-recap-ligne"><span>Dernier produit</span><strong>${this._dernierProduit() || '—'}</strong></div>
        <div class="q-recap-ligne"><span>CA FY26</span><strong>${(() => { const f = fmtCA(s.cible.CA_FY26); return f === '—' ? '—' : f + ' €'; })()}</strong></div>
        ${s.cible.Tel ? `<div class="q-recap-ligne"><span>Téléphone</span><strong><a class="lien-tel" href="tel:${String(s.cible.Tel).replace(/\s/g, '')}">${s.cible.Tel}</a></strong></div>` : ''}
        ${s.cible.Note_initiale ? `<div style="font-size:12px;color:var(--c-text-2);padding-top:6px;font-style:italic">${String(s.cible.Note_initiale).slice(0, 100)}</div>` : ''}
      </div>` : ''}
      `}
      <label class="q-label">Objectif de l'appel *
        <input class="q-input" placeholder="ex : relancer commande Q2" value="${d.objectif}"
               oninput="VuePhoning.set('objectif', this.value);VuePhoning._sauvegarderBrouillon()"/></label>

      ${!s.froidsMode ? `
      <button type="button" class="btn-secondaire" onclick="VuePhoning.genererScript()"
              ${s.scriptEnCours ? 'disabled' : ''}>
        ${s.scriptEnCours ? '🤖 Génération…' : '🤖 Générer un script d\'accroche IA'}
      </button>
      ${s.script ? '<div class="q-recap"><h3>📜 Script suggéré</h3>' +
        '<p style="font-size:13px;line-height:1.6;white-space:pre-wrap">' + s.script + '</p></div>' : ''}
      ` : ''}

      ${s.froidsMode && !s.froidsFields.nom.trim()
        ? `<div style="font-size:11px;color:var(--c-text-2);text-align:center;margin-top:4px">Renseignez le nom de l'enseigne pour continuer.</div>`
        : (!s.froidsMode && !s.cible
            ? `<div style="font-size:11px;color:var(--c-text-2);text-align:center;margin-top:4px">Sélectionnez un compte pour activer l'appel.</div>`
            : '')
      }
      <button type="button" class="btn-primaire" onclick="VuePhoning.demarrerAppel()"
              ${(s.froidsMode ? !s.froidsFields.nom.trim() : !s.cible)
                ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>Démarrer l'appel →</button>
    </div>`;
  },

  // ── Liste de phoning prospects ──
  _renderListeProspects() {
    const s = this.state;
    const auj = dateISOLocale();
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
              ${p.Ville ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${p.Ville}` : ''}${origineLabel ? ` · ${origineLabel}` : ''}
              ${rappelDu && p.Date_prochaine_action ? ` · <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--c-danger)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:2px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span style="color:var(--c-danger);font-weight:600">${dateRelative(p.Date_prochaine_action)}</span>` : ''}
            </div>
            ${p.Note_initiale ? `<div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px;font-style:italic">${String(p.Note_initiale).slice(0, 80)}${String(p.Note_initiale).length > 80 ? '…' : ''}</div>` : ''}
            ${p.Tel ? `<div style="font-size:13px;margin-bottom:8px"><a class="lien-tel" href="tel:${String(p.Tel).replace(/\s/g,'')}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${p.Tel}</a></div>` : ''}
            <button class="btn-primaire" style="width:100%;font-size:13px;padding:10px"
                    onclick="VuePhoning.choisirEtDemarrer(${i})">Démarrer l'appel</button>
          </div>`;
          }).join('')
      }

      <button class="btn-secondaire" style="width:100%;margin-top:8px"
              onclick="Router.aller('#/empower-tracker')">➕ Ajouter un prospect dans le Tracker</button>
    </div>`;
  },

  _phaseCALL() {
    const s = this.state, d = s.d, c = s.cible;

    const PILLS = [
      { lbl: 'Intéressé',      col: 'var(--c-success)' },
      { lbl: 'Vente conclue',  col: 'var(--c-primary)' },
      { lbl: 'À rappeler',     col: 'var(--c-warning)'  },
      { lbl: 'NRP',            col: 'var(--c-text-2)'   },
      { lbl: 'Pas intéressé',  col: 'var(--c-danger)'   },
    ];

    // Compte déjà onboardé Empower (via window.estEmpower, source unique du
    // statut EMPOWER — cf. utils.js) → questionnaire de SUIVI plutôt que
    // d'onboarding : ça n'a pas de sens de redemander "Accord pour créer le
    // compte Empower ?" à un revendeur qui l'a déjà. Ne s'applique qu'aux
    // comptes existants (typeSource EXISTANT) — un prospect/appel à froid n'a
    // par définition pas encore de compte, l'onboarding reste la bonne grille.
    const dejaOnboarde = s.typeSource === 'EXISTANT' && window.estEmpower(c);

    const EQ = dejaOnboarde ? [
      { label: 'Utilise activement son compte Empower ?',                 pts: 1 },
      { label: 'Satisfait du programme (revshare, renouvellements) ?',    pts: 2 },
      { label: 'Aucun blocage technique ou de facturation signalé ?',     pts: 1 },
      { label: 'Intéressé pour étendre Empower à d\'autres postes ?',     pts: 2 },
      { label: 'Nouvelle commande Empower envisagée ce trimestre ?',      pts: 3 },
    ] : [
      { label: 'Connaît le portail Empower Norton ?',        pts: 1 },
      { label: 'Intéressé par 25% récurrents sur 3 ans ?',   pts: 2 },
      { label: 'A accès internet pour commander en ligne ?', pts: 1 },
      { label: 'Accord pour créer le compte Empower ?',      pts: 2 },
      { label: 'Commande test Empower planifiée ?',          pts: 3 },
    ];
    const eqArr = d.empowerQ || [false,false,false,false,false];
    const eqScore = EQ.reduce((acc, q, i) => acc + (eqArr[i] ? q.pts : 0), 0);
    const eqPct   = Math.round((eqScore / 9) * 100);
    const maturite = dejaOnboarde
      ? (eqScore <= 2 ? { lbl: 'À RÉACTIVER', col: 'var(--c-text-2)', bg: 'rgba(154,171,184,.12)' }
       : eqScore <= 5 ? { lbl: 'ENGAGÉ',      col: '#f59e0b',          bg: 'rgba(245,158,11,.10)'  }
       :                { lbl: 'AMBASSADEUR 🌟', col: 'var(--c-success)', bg: 'rgba(45,158,107,.10)' })
      : (eqScore <= 2 ? { lbl: 'FROID',    col: 'var(--c-text-2)', bg: 'rgba(154,171,184,.12)' }
       : eqScore <= 5 ? { lbl: 'CHAUD',    col: '#f59e0b',          bg: 'rgba(245,158,11,.10)'  }
       :                { lbl: 'BRÛLANT 🔥', col: 'var(--c-danger)',  bg: 'rgba(186,26,26,.08)'   });

    const OBJECTIONS = [
      { cat: '🎯 Image & Positionnement', col: 'var(--c-danger)', items: [
        { q: 'Norton c\'est grand public — pas pour les professionnels', r: 'Norton protège 500 millions d\'appareils dont de très nombreuses TPE/PME. La suite 360 couvre VPN, dark web monitoring et gestionnaire de mots de passe. C\'est une marque que vos clients reconnaissent déjà — ce qui réduit votre temps de vente.' },
        { q: 'On propose déjà Kaspersky / ESET / Bitdefender', r: 'Empower ne vous demande pas d\'abandonner votre gamme — c\'est une ligne de revenus complémentaire. La différence clé : 25% de revshare sur 3 ans de renouvellements automatiques, sans action de votre part.' },
        { q: 'Nos clients sont trop petits pour ce type de produit', r: 'C\'est exactement le cœur de cible Empower — les TPE avec 1 à 10 postes, souvent non équipés. Norton 360 démarre à moins de 30€/an par poste, s\'installe en 5 minutes, et le client renouvelle en ligne tout seul.' },
      ]},
      { cat: '💰 Concurrence & Prix', col: '#b45309', items: [
        { q: 'D\'autres concurrents sont moins chers à l\'achat', r: 'Le prix d\'achat n\'est que la première ligne. Sur 50 clients à 40€/an, vous touchez 1 500€/an de revenus passifs sans stock ni relance — aucun concurrent low-cost ne propose ça.' },
        { q: 'D\'autres concurrents proposent aussi du revshare', r: 'Le revshare Empower est 100% automatique — Norton traque les renouvellements et vous crédite directement sur le portail, même sur les upgrades. Pas de déclaration manuelle, pas de paperasse, pas de condition cachée.' },
      ]},
      { cat: '🔧 Expérience & Technique', col: '#3b82f6', items: [
        { q: 'Norton ralentit les PC — mes clients se plaignent', r: 'C\'est une réputation des années 2010 — depuis le rachat par Gen Digital, le moteur a été entièrement refondu. AV-Test le place parmi les moins gourmands du marché. Si un client a un problème, les revendeurs Empower ont un support technique prioritaire.' },
        { q: 'On installe du gratuit — Windows Defender, Avast…', r: 'Windows Defender ne couvre ni VPN, ni dark web, ni gestionnaire de mots de passe. Avec Norton Empower vous touchez 25% récurrents et intervenez moins souvent en urgence sur des incidents d\'infection.' },
        { q: 'Nos clients utilisent déjà Microsoft 365 Defender', r: 'Microsoft Defender couvre uniquement les appareils Windows gérés en entreprise — pas les postes persos, pas les Macs, pas les mobiles. Norton couvre tous les appareils avec un seul abonnement. C\'est complémentaire, et vous êtes payé sur ce complément.' },
      ]},
      { cat: '⚙️ Friction & Process', col: 'var(--c-primary)', items: [
        { q: 'Obliger le client à créer un compte — trop contraignant', r: 'La création de compte prend moins de 2 minutes — email + mot de passe. Et c\'est ce compte qui déclenche votre revshare sur 3 ans : sans compte client, pas de commission récurrente.' },
        { q: 'Pas le temps de se former à un nouveau programme', r: 'L\'inscription Empower prend moins de 2 minutes en ligne, le portail est en français. Je vous envoie le lien maintenant — vous avez votre premier accès dans l\'heure, sans engagement.' },
        { q: 'On n\'a pas de technicien dédié pour déployer ça', r: 'Empower ne nécessite aucun déploiement centralisé — chaque client installe lui-même en quelques clics avec un lien que vous lui envoyez par email. Pas de serveur, pas de mise à jour manuelle.' },
        { q: 'Besoin de valider avec notre DSI / responsable IT', r: 'Je vous envoie une fiche technique et un argumentaire DSI prêts à l\'emploi. Donnez-moi votre email et je vous l\'envoie dans l\'heure. On planifie un point de suivi dans 15 jours.' },
      ]},
      { cat: '📊 Marché & Demande', col: 'var(--c-success)', items: [
        { q: 'On n\'a pas de demande client pour ce type de produit', r: 'La demande n\'existe pas parce qu\'elle n\'est pas encore activée — aucun client ne demande spontanément un antivirus. Norton fournit des outils marketing prêts à l\'emploi pour créer cette demande.' },
        { q: 'Clients dans des secteurs réglementés (santé, juridique)', r: 'Norton 360 intègre nativement le chiffrement des fichiers sensibles, le VPN et la surveillance des fuites — des fonctions utiles en environnement médical ou juridique. La conformité RGPD est documentée et certifiable.' },
      ]},
      { cat: '🕐 Confiance & Timing', col: '#6b7e8c', items: [
        { q: 'Norton a été racheté — je ne sais pas si la marque tient', r: 'Gen Digital est l\'une des plus grandes entreprises de cybersécurité au monde avec 500M de clients actifs — Norton, Avast, AVG et LifeLock sont tous sous le même toit. Le portail Empower est maintenu et mis à jour activement.' },
        { q: 'On est en pleine restructuration — mauvais timing', r: 'C\'est justement en période de restructuration qu\'une ligne de revenus passifs est la plus précieuse — elle rentre sans générer de charge supplémentaire. L\'inscription prend 2 minutes et ne vous engage à rien.' },
        { q: 'Mes clients associent Norton à des popups intrusives', r: 'Cette image date des versions packagées avec les PC dans les années 2000. Le Norton actuel n\'a plus aucun modèle publicitaire intrusif. Une démonstration de 5 minutes suffit à changer la perception.' },
        { q: 'On vend uniquement du physique en boutique', r: 'Le flux Empower est 100% compatible avec le modèle boutique — vous remettez un code d\'activation en caisse, le client crée son compte depuis chez lui, et votre commission tombe automatiquement.' },
        { q: 'Je préfère des marques locales ou européennes', r: 'Norton respecte le RGPD et ses serveurs européens traitent les données des clients EU. Et aucune marque européenne ne propose un programme revshare à 25% sur 3 ans avec tracking automatique.' },
        { q: 'Nos clients renouvellent pas — ils réinstallent à chaque fois', r: 'C\'est précisément ce que le compte client Empower règle — le renouvellement est automatique via la CB enregistrée, sans intervention de votre part. Vous touchez la commission pendant 3 ans.' },
      ]},
    ];

    // Wizard pas-à-pas (2 étapes) au lieu d'un seul écran à scroller — la
    // qualification (pills + checklist /9) puis les notes/ressources sont
    // maintenant deux étapes distinctes avec navigation Suivant/Précédent,
    // même convention que VueQuestionnaire (.q-nav-fixe).
    const ETAPES_CALL = ['Résultat & Qualification', 'Notes & Ressources'];
    const etapeIdx = s.callStep === 2 ? 1 : 0;

    const etape1 = `
      <!-- Pills résultat -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--c-text-2);letter-spacing:.05em;text-transform:uppercase;margin-bottom:7px">Résultat de l'appel</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${PILLS.map(p => `
            <button type="button"
              onclick="VuePhoning.state.d.statutCallPills='${p.lbl}';VuePhoning.state.d.statutAppel='${p.lbl}';VuePhoning.render()"
              style="font-size:12px;font-weight:700;padding:6px 12px;border-radius:99px;cursor:pointer;transition:all .15s;
                     border:1.5px solid ${p.col};
                     background:${d.statutCallPills === p.lbl ? p.col : 'transparent'};
                     color:${d.statutCallPills === p.lbl ? '#fff' : p.col}">
              ${p.lbl}
            </button>`).join('')}
        </div>
      </div>

      <!-- Questionnaire Empower /9 -->
      <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:11px;font-weight:700;color:var(--c-text-2);letter-spacing:.05em;text-transform:uppercase">${dejaOnboarde ? 'Suivi Empower' : 'Qualification Empower'}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:14px;font-weight:800;color:var(--c-title)">${eqScore} / 9</span>
            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:${maturite.bg};color:${maturite.col};border:1px solid ${maturite.col}20">● ${maturite.lbl}</span>
          </div>
        </div>
        <div style="height:4px;background:var(--c-border);border-radius:2px;margin-bottom:12px;overflow:hidden">
          <div style="height:4px;width:${eqPct}%;background:${maturite.col};border-radius:2px;transition:width .3s"></div>
        </div>
        ${EQ.map((q, i) => `
          <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:var(--radius-sm);cursor:pointer;margin-bottom:6px;transition:all .15s;
                         border:1.5px solid ${eqArr[i] ? 'rgba(45,158,107,.4)' : 'var(--c-border)'};
                         background:${eqArr[i] ? 'rgba(45,158,107,.06)' : 'var(--c-bg)'}">
            <input type="checkbox" ${eqArr[i] ? 'checked' : ''}
                   onchange="VuePhoning.state.d.empowerQ[${i}]=this.checked;VuePhoning.render()"
                   style="width:16px;height:16px;margin-top:2px;accent-color:var(--c-success);flex-shrink:0;cursor:pointer"/>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:${eqArr[i] ? 'var(--c-success)' : 'var(--c-title)'}">${q.label}</div>
              <div style="font-size:10px;color:var(--c-text-2);font-weight:500;margin-top:2px">${q.pts} pt${q.pts > 1 ? 's' : ''}${q.pts === 3 ? ' ⭐' : ''}</div>
            </div>
          </label>`).join('')}
      </div>`;

    const etape2 = `
      <!-- Notes pendant l'appel -->
      <label class="q-label">Notes d'appel
        <textarea class="q-textarea" rows="3" placeholder="Objections rencontrées, nom interlocuteur, points clés…"
                  oninput="VuePhoning.set('note', this.value)">${d.note}</textarea>
      </label>

      <!-- Bloc 20 objections -->
      <details style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);margin-bottom:14px;overflow:hidden">
        <summary style="padding:11px 14px;font-size:13px;font-weight:700;cursor:pointer;color:var(--c-title);
                        display:flex;align-items:center;gap:8px;list-style:none;background:var(--c-surface)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          20 objections — scripts de réponse
        </summary>
        <div style="padding:8px 12px 12px">
          ${OBJECTIONS.map(cat => `
            <div style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;display:inline-block;margin:10px 0 7px;letter-spacing:.04em;background:${cat.col}15;color:${cat.col}">${cat.cat}</div>
            ${cat.items.map(obj => `
              <details style="border:1px solid var(--c-border);border-radius:6px;margin-bottom:5px;overflow:hidden">
                <summary style="padding:8px 11px;font-size:12px;font-weight:600;cursor:pointer;background:var(--c-bg);
                                color:var(--c-title);list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px">
                  <span style="flex:1">&ldquo;${obj.q}&rdquo;</span>
                  <span style="color:var(--c-text-2);font-size:10px;flex-shrink:0">→ script</span>
                </summary>
                <div style="padding:10px 12px;background:var(--c-surface);border-left:3px solid var(--c-primary)">
                  <p style="font-size:12px;line-height:1.65;color:var(--c-text);margin:0 0 8px">${obj.r}</p>
                  <button type="button"
                          onclick="(function(btn,txt){navigator.clipboard.writeText(txt).then(()=>{btn.textContent='✓ Copié';btn.style.color='var(--c-success)';setTimeout(()=>{btn.textContent='Copier';btn.style.color=''},1500)})})(this,'${obj.r.replace(/'/g, '’').replace(/"/g, '“')}')"
                          style="font-size:11px;color:var(--c-text-2);background:none;border:none;cursor:pointer;padding:0">Copier</button>
                </div>
              </details>`).join('')}
          `).join('')}
        </div>
      </details>

      <!-- Enregistrement vocal IA -->
      <div style="border-top:1px solid var(--c-border);padding-top:12px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px">
        <button type="button" class="${s.enregistre ? 'btn-primaire' : 'btn-secondaire'}"
                style="${s.enregistre ? 'background:var(--c-danger);border-color:var(--c-danger)' : ''}"
                onclick="VuePhoning.toggleEnregistrement()">
          ${s.enregistre ? '⏹ Arrêter l\'enregistrement (IA)' : '⏺ Enregistrer résumé vocal (IA — 30s)'}
        </button>
        ${s.enregistre ? '<p style="font-size:11px;color:var(--c-text-2);text-align:center;margin:0">Résumez l\'échange à voix haute — l\'IA transcrira et qualifiera automatiquement.</p>' : ''}
      </div>`;

    return `<div class="q-champs">

      <!-- Fiche contact pendant l'appel -->
      <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-weight:700;font-size:16px;color:var(--c-title)">${c?.Nom_Compte || '—'}</div>
          <div style="display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:var(--c-primary);font-variant-numeric:tabular-nums">
            <span style="width:7px;height:7px;border-radius:50%;background:var(--c-danger);animation:pulse-appel 1.4s infinite"></span>
            <span id="phoning-timer-appel">00:00</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${c?.Tel ? `<a class="lien-tel" href="tel:${String(c.Tel).replace(/\s/g,'')}">📞 ${c.Tel}</a>` : '<span style="font-size:12px;color:var(--c-text-2)">Pas de téléphone enregistré</span>'}
          ${c?.Email ? `<span style="font-size:12px;color:var(--c-text-2)">✉ ${c.Email}</span>` : ''}
          ${(c?.Adresse || c?.Ville) ? `<span style="font-size:12px;color:var(--c-text-2)">📍 ${[c.Adresse, c.Ville].filter(Boolean).join(' · ')}</span>` : ''}
          ${(c?.CANAL || c?.CA_FY26) ? `<span style="font-size:11px;color:var(--c-text-2)">${[c?.CANAL, c?.CA_FY26 ? 'CA FY26 : ' + fmtCA(c.CA_FY26) + ' €' : ''].filter(Boolean).join(' · ')}</span>` : ''}
        </div>
      </div>

      <!-- Barre de progression étape (Bloc — wizard pas-à-pas Phoning) -->
      <div style="font-size:11px;color:var(--c-text-2);font-weight:600;margin-bottom:6px">Étape ${etapeIdx + 1}/${ETAPES_CALL.length} · ${ETAPES_CALL[etapeIdx]}</div>
      <div style="height:6px;background:var(--c-border);border-radius:3px;margin-bottom:14px;overflow:hidden">
        <div style="height:100%;width:${(etapeIdx + 1) / ETAPES_CALL.length * 100}%;background:var(--c-cta);transition:width .3s ease"></div>
      </div>

      ${s.callStep === 2 ? etape2 : etape1}
    </div>

    <div class="q-nav-fixe">
      ${s.callStep === 2
        ? `<button class="btn-q-nav btn-q-precedent" onclick="VuePhoning.setCallStep(1)">← Précédent</button>
           <button class="btn-q-nav btn-q-suivant" onclick="VuePhoning.passerAuPost()">Saisie post-appel →</button>`
        : `<button class="btn-q-nav btn-q-suivant" style="flex:1" onclick="VuePhoning.setCallStep(2)">Suivant →</button>`
      }
    </div>`;
  },

  setCallStep(n) { this.state.callStep = n; this.render(); },

  _phasePOST() {
    const s = this.state, d = s.d;
    const estProspect = s.typeSource === 'PROSPECT';
    const estFroid = d.typeAppel === 'Appel_Froid';
    const infoResultat = {
      INTERESSE:     'Le lead sera avancé <strong>EN COURS</strong> dans le Tracker',
      NON_INTERESSE: 'Le prospect sera <strong>archivé</strong> définitivement',
      NON_JOIGNABLE: 'Rappel planifié · statut conservé',
      RAPPELER:      'Rappel planifié à la date choisie',
    }[d.resultatProspect] || 'Sélectionnez un résultat pour archiver automatiquement';

    const statutsAppel = estFroid
      ? ['Intéressé', 'Non intéressé', 'Rappel', 'Faux numéro']
      : ['Répondu', 'Répondeur', 'Occupé', 'Faux numéro', 'Refus'];

    const scoreStars = score => Array.from({length:5}, (_, i) => `
      <button type="button" style="font-size:22px;background:none;border:none;cursor:pointer;padding:2px;line-height:1;color:${i < score ? '#f59e0b' : 'var(--c-border)'}"
              onclick="VuePhoning.state.d.interetScore=${i+1};VuePhoning.render()">★</button>`
    ).join('');

    return `<div class="q-champs">
      ${s.qualif ? `<div class="q-recap">
        <h3>🤖 Qualification IA</h3>
        <div class="q-recap-ligne"><span>Type</span><strong>${s.qualif.typeappel || '—'}</strong></div>
        <div class="q-recap-ligne"><span>Score</span><strong>${s.qualif.score ?? '—'}/5</strong></div>
        ${s.qualif.freindetecte ? `<div class="q-recap-ligne"><span>Frein</span><strong>${s.qualif.freindetecte}</strong></div>` : ''}
        ${s.qualif.concurrentdetecte ? `<div class="q-recap-ligne"><span>Concurrent</span><strong>${s.qualif.concurrentdetecte}</strong></div>` : ''}
        <p style="font-size:13px;margin-top:8px">${s.qualif.resume || ''}</p>
      </div>` : ''}
      ${s.transcription ? `<details style="font-size:12px;color:var(--c-text-2)">
        <summary>Transcription brute</summary><p>${s.transcription}</p></details>` : ''}

      <!-- F1 — Type d'appel -->
      <label class="q-label">Type d'appel
        <div class="q-chips">
          ${['Relance','Appel_Froid','RDV'].map(o => `
            <button type="button" class="q-chip ${d.typeAppel === o ? 'active' : ''}"
                    onclick="VuePhoning.setR('typeAppel','${o}')">${o.replace('_', ' ')}</button>`).join('')}
        </div>
      </label>

      <!-- F1 — Questionnaire Appel Froid (conditionnel) -->
      ${estFroid ? `
      <div style="background:var(--c-surface);border:2px solid var(--c-primary);border-radius:var(--radius-sm);padding:14px;margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.05em;margin-bottom:12px">❄️ QUESTIONNAIRE APPEL À FROID</div>

        <label class="q-label" style="margin-top:0">Score d'intérêt EMPOWER (1-5)
          <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
            ${scoreStars(d.interetScore)}
            <span style="font-size:12px;color:var(--c-text-2);margin-left:8px">${d.interetScore > 0 ? d.interetScore + '/5' : 'Non noté'}</span>
          </div>
        </label>

        <label class="q-label">Concurrent actuel
          <input class="q-input" placeholder="ex : Bitdefender, ESET, pas de solution…"
                 value="${d.concurrentActuel}"
                 oninput="VuePhoning.state.d.concurrentActuel=this.value"/>
        </label>

        <label class="q-label">Potentiel estimé
          <div class="q-chips">
            ${['Fort','Moyen','Faible'].map(o => `
              <button type="button" class="q-chip ${d.potentielEstime === o ? 'active' : ''}"
                      onclick="VuePhoning.setR('potentielEstime','${o}')">${o}</button>`).join('')}
          </div>
        </label>

        <!-- Analyse Gemini -->
        ${s.geminiAnalyse ? `
        <div style="background:linear-gradient(135deg,var(--c-bg) 0%,rgba(0,80,255,.04) 100%);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:12px;margin-top:10px">
          <div style="font-size:11px;font-weight:700;color:var(--c-primary);margin-bottom:8px">Analyse Gemini</div>
          <div style="font-size:13px;line-height:1.65;white-space:pre-wrap;color:var(--c-text)">${s.geminiAnalyse}</div>
        </div>` : ''}

        <button type="button" class="btn-secondaire" style="width:100%;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:8px"
                onclick="VuePhoning.analyserAvecGemini()"
                ${s.geminiEnCours ? 'disabled' : ''}>
          ${s.geminiEnCours
            ? 'Analyse Gemini…'
            : (s.geminiAnalyse ? 'Relancer l\'analyse Gemini' : 'Analyser avec Gemini')}
        </button>
      </div>` : ''}

      <label class="q-label">Statut de l'appel ${this._r('statutAppel', statutsAppel)}</label>
      <label class="q-label">Intérêt EMPOWER ${this._r('interetEmpower', ['Fort', 'Moyen', 'Faible', 'Aucun', 'Déjà inscrit'])}</label>

      ${estProspect ? `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:12px;margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.04em;margin-bottom:8px">RÉSULTAT DU PROSPECT</div>
        ${this._r('resultatProspect', ['INTERESSE', 'RAPPELER', 'NON_JOIGNABLE', 'NON_INTERESSE', 'A_VISITER'])}
        <div style="font-size:11px;color:var(--c-text-2);margin-top:6px">${infoResultat}</div>
      </div>` : `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:12px;margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.04em;margin-bottom:8px">SUITE COMMERCIALE</div>
        <label class="q-label" style="margin-top:0">Commande annoncée ${this._r('commandeAnnoncee', ['Oui', 'À confirmer', 'Non'])}</label>
        ${d.commandeAnnoncee && d.commandeAnnoncee !== 'Non' ? `
        <label class="q-label">Montant estimé (€)
          <input class="q-input" type="text" inputmode="decimal" placeholder="ex : 1 500"
                 value="${d.montantEstime}" oninput="VuePhoning.set('montantEstime', this.value)"/>
          ${d.montantEstime ? `<span style="font-size:11px;color:var(--c-text-2)">${fmtCA(d.montantEstime) === '—' ? 'Montant invalide → —' : '≈ ' + fmtCA(d.montantEstime) + ' €'}</span>` : ''}
        </label>` : ''}
        <label class="q-label">Statut final ${this._r('statutFinal', ['EN_COURS', 'INTEGRE', 'ARCHIVE'])}</label>
      </div>
      ${window.estEmpower(s.cible) ? `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:12px;margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.04em;margin-bottom:8px">RÉFÉRENCES NORTON — compte EMPOWER (facultatif)</div>
        <label class="q-label" style="margin-top:0">Produits qui intéressent le revendeur
          ${window.QuestionnaireBranching.chipsMultiSelect({ champ: 'norton360', options: this.NORTON_PRODUITS, valeurs: d.norton360, onToggle: 'VuePhoning.toggleMultiSelect' })}
        </label>
        <label class="q-label">Opération commerciale envisagée
          ${window.QuestionnaireBranching.chipsMultiSelect({ champ: 'opCommerciale', options: this.OP_COMMERCIALES, valeurs: d.opCommerciale, onToggle: 'VuePhoning.toggleMultiSelect' })}
        </label>
      </div>` : ''}
      `}

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

  // ── BUG-09 : Planning phoning ──────────────────────────────────────────────

  // ── Groupement du planning par commercial (Manager/Channel) — même pattern
  //    que VueVisites._grouperParCommercial / _renderCartesCommerciaux. ──
  _grouperParCommercialPlanning(liste) {
    const map = new Map();
    (liste || []).forEach(a => {
      const pin = String(a.PIN_CDS || '');
      if (!map.has(pin)) map.set(pin, { pin, nom: resolveCDS(a.PIN_CDS || a.Nom_CDS), appels: [] });
      map.get(pin).appels.push(a);
    });
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  },

  _renderCartesCommerciauxPlanning(liste) {
    const groupes = this._grouperParCommercialPlanning(liste);
    const auj = dateISOLocale();
    if (!groupes.length) {
      return `<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucun appel planifié pour cette période.</div>`;
    }
    return groupes.map(g => {
      const enRetard = g.appels.filter(a => (a.Date_Planifiee || '').slice(0, 10) < auj).length;
      return `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;cursor:pointer"
           onclick="VuePhoning.selectionnerCommercialPlanning('${g.pin}')">
        <div style="font-weight:700;font-size:15px;color:var(--c-title)">${g.nom}</div>
        <div style="font-size:12px;color:var(--c-text-2);margin-top:2px">
          ${g.appels.length} appel${g.appels.length > 1 ? 's' : ''} planifié${g.appels.length > 1 ? 's' : ''}
          ${enRetard ? ` · <span style="color:var(--c-danger);font-weight:700">${enRetard} en retard</span>` : ''}
        </div>
      </div>`;
    }).join('');
  },

  _boutonRetourCommerciauxPlanning() {
    return `<button class="btn-secondaire" style="width:auto;padding:6px 12px;font-size:12px;margin-bottom:10px" onclick="VuePhoning.retourCommerciauxPlanning()">← Tous les commerciaux</button>`;
  },

  selectionnerCommercialPlanning(pin) { this.state.commercialSelectionne = pin; this.render(); },
  retourCommerciauxPlanning() { this.state.commercialSelectionne = null; this.render(); },

  _renderPlanning() {
    const s = this.state;
    if (s.planningChargement) return '<div class="spinner-centre">Chargement planning…</div>';

    const auj  = dateISOLocale();
    const now  = auj;
    // Calcule début de semaine (lundi) et fin de mois courant
    const dateD = new Date(auj);
    const jourSemaine = dateD.getDay() === 0 ? 6 : dateD.getDay() - 1;
    dateD.setDate(dateD.getDate() - jourSemaine);
    const debutSemaine = dateD.toISOString().slice(0, 10);
    const finMois = new Date(dateD.getFullYear(), dateD.getMonth() + 2, 0).toISOString().slice(0, 10);

    let liste = s.planning;
    if (s.filtrePlanning === 'SEMAINE') {
      const finSemaine = new Date(debutSemaine);
      finSemaine.setDate(finSemaine.getDate() + 6);
      const fs = finSemaine.toISOString().slice(0, 10);
      liste = liste.filter(a => {
        const d = (a.Date_Planifiee || '').slice(0, 10);
        return d >= debutSemaine && d <= fs;
      });
    } else if (s.filtrePlanning === 'MOIS') {
      liste = liste.filter(a => {
        const d = (a.Date_Planifiee || '').slice(0, 10);
        return d >= auj.slice(0, 7) + '-01' && d <= finMois;
      });
    }

    const badges = {
      'planifié': { bg: 'var(--c-primary)', lbl: 'Planifié' },
      'en_cours': { bg: 'var(--c-warning)', lbl: 'En cours' },
    };

    // Groupement par commercial (Manager/Channel), même pattern que Planning
    // Visites (vue-visites.js) — audit UX § "Vues Manager les plus pauvres".
    const groupeActif = Session.voitTout() && !s.commercialSelectionne;
    if (s.commercialSelectionne) liste = liste.filter(a => String(a.PIN_CDS || '') === s.commercialSelectionne);

    const listeHtml = groupeActif
      ? this._renderCartesCommerciauxPlanning(liste)
      : `${s.commercialSelectionne ? this._boutonRetourCommerciauxPlanning() : ''}
        ${liste.length === 0
          ? `<div style="padding:32px;text-align:center;color:var(--c-text-2)">
               <div style="font-size:32px;margin-bottom:8px">📭</div>
               <div style="font-size:14px">Aucun appel planifié pour cette période</div>
               <div style="font-size:12px;margin-top:4px">Cliquez "Planifier un appel" pour en créer un.</div>
             </div>`
          : liste.map(a => {
              const estPasse = (a.Date_Planifiee || '').slice(0, 10) < now;
              const badge = badges[String(a.Statut_Appel || '').toLowerCase()] || badges['planifié'];
              return `
            <div style="background:var(--c-surface);border:1.5px solid ${estPasse ? 'var(--c-danger)' : 'var(--c-border)'};border-radius:var(--radius-sm);padding:12px;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="font-weight:700;font-size:15px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.Reseller || a.Nom_Compte || '—'}</span>
                ${Session.voitTout() ? `<span style="font-size:11px;color:var(--c-text-2);flex-shrink:0">${resolveCDS(a.PIN_CDS || a.Nom_CDS)}</span>` : ''}
                <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${badge.bg};color:#fff;flex-shrink:0">${badge.lbl}</span>
              </div>
              <div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">
                ${a.Date_Planifiee ? a.Date_Planifiee.slice(0, 16).replace('T', ' ') : '—'}
                ${estPasse ? ' <span style="color:var(--c-danger);font-weight:700">· En retard</span>' : ''}
                ${a.Objectif_Appel ? ` · ${a.Objectif_Appel}` : ''}
              </div>
              ${a.Note_Preparation ? `<div style="font-size:12px;color:var(--c-text-2);font-style:italic;margin-bottom:8px">${String(a.Note_Preparation).slice(0, 80)}</div>` : ''}
              <div style="display:flex;gap:8px">
                <button class="btn-primaire" style="flex:2;font-size:13px;padding:9px"
                        onclick="VuePhoning.lancerAppelPlanifie('${a.ID_Appel}')">
                  Lancer l'appel
                </button>
                <button class="btn-secondaire" style="flex:1;font-size:13px;padding:9px"
                        onclick="VuePhoning.supprimerPlanif('${a.ID_Appel}')">🗑</button>
              </div>
            </div>`;
            }).join('')
        }`;

    return `<div class="q-champs">
      <!-- Tabs navigation -->
      <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface);margin-bottom:14px">
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:var(--c-title);color:#fff">
          Planning
        </button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('BASE')">Base (${s.comptes.length})</button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('HISTORIQUE')">Journal</button>
      </div>

      <!-- Actions rapides -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn-primaire" style="flex:1"
                onclick="VuePhoning.ouvrirFormPlanif()">
          Planifier un appel
        </button>
        <button class="btn-secondaire" style="flex:1"
                onclick="VuePhoning.demarrerAppelDirect()">
          Appel direct
        </button>
      </div>

      <!-- Filtres temporels -->
      <div style="display:flex;gap:6px;margin-bottom:14px">
        ${[['SEMAINE','Cette semaine'],['MOIS','Ce mois'],['TOUS','Tous']].map(([v, l]) => `
          <button class="btn-filtre ${s.filtrePlanning === v ? 'actif' : ''}"
                  onclick="VuePhoning.setFiltrePlanning('${v}')">${l}</button>`).join('')}
      </div>

      <!-- Liste des appels planifiés (ou cartes commerciaux si Manager/Channel) -->
      ${listeHtml}
    </div>`;
  },

  _renderFormPlanif() {
    const s = this.state;
    if (!s.formPlanif) return '';
    const f = s.formPlanif;

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.fermerFormPlanif()">
      <div class="modal" style="max-width:440px">
        <h3>Planifier un appel</h3>

        <!-- Toggle mode -->
        <div class="q-chips" style="margin-bottom:12px">
          <button type="button" class="q-chip ${!f.modeFroid ? 'active' : ''}"
                  onclick="VuePhoning.state.formPlanif.modeFroid=false;VuePhoning.render()">🏢 Compte existant</button>
          <button type="button" class="q-chip ${f.modeFroid ? 'active' : ''}"
                  onclick="VuePhoning.state.formPlanif.modeFroid=true;VuePhoning.render()">❄️ Appel à froid</button>
        </div>

        ${!f.modeFroid ? `
        <label class="q-label">Compte à appeler
          ${f.idCompte
            ? `<div style="padding:10px;background:var(--c-bg);border-radius:var(--radius-sm);font-weight:700;border:1.5px solid var(--c-primary)">${f.nomCompte}
                 <button type="button" onclick="VuePhoning.state.formPlanif.idCompte=null;VuePhoning.state.formPlanif.nomCompte='';VuePhoning.render()"
                         style="float:right;background:none;border:none;cursor:pointer;color:var(--c-text-2)">✕</button>
               </div>`
            : `<input class="q-input" placeholder="🔍 Rechercher un compte…" id="planif-recherche"
                     value="${f.rechercheCompte || ''}"
                     oninput="VuePhoning._rechercherPlanif(this.value)" autocomplete="off"/>
               <div id="planif-suggestions"></div>`
          }
        </label>
        ` : `
        <label class="q-label">Nom de l'enseigne *
          <input class="q-input" placeholder="ex : Informatique Plus" value="${f.froidNom || ''}"
                 oninput="VuePhoning.state.formPlanif.froidNom=this.value"/>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label class="q-label">Département
            <input class="q-input" placeholder="ex : 75" value="${f.froidDept || ''}"
                   oninput="VuePhoning.state.formPlanif.froidDept=this.value"/>
          </label>
          <label class="q-label">Ville
            <input class="q-input" placeholder="ex : Paris" value="${f.froidVille || ''}"
                   oninput="VuePhoning.state.formPlanif.froidVille=this.value"/>
          </label>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label class="q-label">Téléphone
            <input class="q-input" type="tel" placeholder="06…" value="${f.froidTel || ''}"
                   oninput="VuePhoning.state.formPlanif.froidTel=this.value"/>
          </label>
          <label class="q-label">Email
            <input class="q-input" type="email" placeholder="contact@…" value="${f.froidEmail || ''}"
                   oninput="VuePhoning.state.formPlanif.froidEmail=this.value"/>
          </label>
        </div>
        `}

        <label class="q-label">Date et heure prévues
          <input type="datetime-local" class="q-input"
                 value="${f.datePlanifiee || ''}"
                 onchange="VuePhoning.state.formPlanif.datePlanifiee=this.value"/>
        </label>

        <label class="q-label">Objectif de l'appel
          <div class="q-chips" style="flex-wrap:wrap">
            ${['Relance CA','Info produit','Prise de commande','Prospection','Autre'].map(o => `
              <button type="button" class="q-chip ${f.objectif === o ? 'active' : ''}"
                      onclick="VuePhoning.state.formPlanif.objectif='${o}';VuePhoning.render()">${o}</button>`).join('')}
          </div>
        </label>

        <label class="q-label">Note de préparation
          <textarea class="q-textarea" rows="3" placeholder="Contexte, historique, points à aborder…"
                    oninput="VuePhoning.state.formPlanif.note=this.value">${f.note || ''}</textarea>
        </label>

        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="btn-secondaire" style="flex:1" onclick="VuePhoning.fermerFormPlanif()">Annuler</button>
          <button class="btn-primaire" style="flex:2" onclick="VuePhoning.sauvegarderPlanif()"
                  ${s.envoiEnCours ? 'disabled' : ''}>
            ${s.envoiEnCours ? 'Enregistrement…' : 'Planifier l\'appel'}
          </button>
        </div>
      </div>
    </div>`;
  },

  _rechercherPlanif(v) {
    this.state.formPlanif.rechercheCompte = v;
    const zone = document.getElementById('planif-suggestions');
    if (!zone) return;
    if (!v || v.length < 2) { zone.innerHTML = ''; return; }
    const q = normaliserNom(v);
    const baseRecherche = this.state.tousComptes || this.state.comptes;
    const matches = baseRecherche.filter(c => normaliserNom(c.Nom_Compte).includes(q)).slice(0, 6);
    zone.innerHTML = matches.map(c => `
      <div class="q-arbre-btn" style="margin-top:4px" onclick="VuePhoning._choisirComptePlanif('${c.ID_Compte}','${c.Nom_Compte.replace(/'/g, "\\'")}')">
        <strong>${c.Nom_Compte}</strong>
        <span style="color:var(--c-text-2);font-size:12px">${c.Ville || '—'}</span>
      </div>`).join('');
  },

  // Bloc A (07/2026) — résout un ID_Cible générique (compte OU lead Tracker)
  // vers l'objet complet. Centralisé pour que init() et lancerAppelPlanifie()
  // partagent la même logique de repli comptes→prospects — avant ce fix,
  // seul init() la connaissait ; lancerAppelPlanifie() ne cherchait que dans
  // comptes et échouait ("Compte introuvable") pour tout appel planifié
  // depuis un lead Tracker.
  _resoudreCible(idCible, comptes, prospects) {
    const c = (comptes || []).find(x => String(x.ID_Compte) === String(idCible));
    if (c) return { type: 'COMPTE', obj: c, id: c.ID_Compte, nom: c.Nom_Compte };
    const p = (prospects || []).find(x => String(x.ID_Prospect) === String(idCible));
    if (p) return { type: 'PROSPECT', obj: p, id: p.ID_Prospect, nom: p.Nom_Compte };
    return null;
  },

  _choisirComptePlanif(id, nom) {
    if (!this.state.formPlanif) return;
    this.state.formPlanif.idCompte = id;
    this.state.formPlanif.nomCompte = nom;
    this.render();
  },

  ouvrirFormPlanif(idCompte = null) {
    const allC = this.state.tousComptes || this.state.comptes;
    const c = idCompte ? allC.find(x => String(x.ID_Compte) === String(idCompte)) : null;
    this.state.formPlanif = {
      idCompte: c ? c.ID_Compte : null,
      nomCompte: c ? c.Nom_Compte : '',
      rechercheCompte: '',
      datePlanifiee: '',
      objectif: '',
      note: '',
      modeFroid: false,
      froidNom: '', froidDept: '', froidVille: '', froidTel: '', froidEmail: '',
      idActionOrigine: '',
    };
    this.render();
  },

  fermerFormPlanif() { this.state.formPlanif = null; this.render(); },

  async sauvegarderPlanif() {
    const f = this.state.formPlanif;
    if (!f) return;
    if (!f.datePlanifiee) { Toast.afficher('Indiquez la date prévue', 'warning'); return; }
    if (f.modeFroid) {
      if (!f.froidNom.trim()) { Toast.afficher('Indiquez le nom de l\'enseigne', 'warning'); return; }
    } else {
      if (!f.idCompte) { Toast.afficher('Sélectionnez un compte', 'warning'); return; }
    }
    this.state.envoiEnCours = true;
    this.render();
    try {
      const allC = this.state.tousComptes || this.state.comptes;
      const c = f.modeFroid ? null : allC.find(x => String(x.ID_Compte) === String(f.idCompte));
      const record = {
        ID_Appel: genId('APPEL'),
        Date_Planifiee: f.datePlanifiee,
        Date: dateISOLocale(),
        Semaine_ISO: FiscalWeeks.codeDe(),
        PIN_CDS: Session.pin, Nom_CDS: Session.nom,
        ID_Cible: f.modeFroid ? '' : f.idCompte,
        Reseller: f.modeFroid ? f.froidNom : (c ? c.Nom_Compte : f.nomCompte),
        Statut_Appel: 'planifié',
        Objectif_Appel: f.objectif,
        Note_Preparation: f.note,
        ID_Action_Origine: f.idActionOrigine || '',
        Timestamp: new Date().toISOString(),
        ...(f.modeFroid ? {
          Nom_Enseigne: f.froidNom,
          Departement: f.froidDept,
          Ville: f.froidVille,
          Telephone: f.froidTel,
          Email_Contact: f.froidEmail,
        } : {}),
      };
      await SheetsAPI.ecrire('EMPOWER_MDB', '📞_PHONING', record);
      this.state.planning.push(record);
      this.state.planning.sort((a, b) => (a.Date_Planifiee || '').localeCompare(b.Date_Planifiee || ''));
      this.state.formPlanif = null;
      Toast.afficher('✅ Appel planifié', 'succes');
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
    this.state.envoiEnCours = false;
    this.render();
  },

  lancerAppelPlanifie(id) {
    const plan = this.state.planning.find(a => a.ID_Appel === id);
    if (!plan) { Toast.afficher('Appel introuvable', 'warning'); return; }
    // Appel à froid planifié (pas de compte en base)
    if (!plan.ID_Cible && (plan.Nom_Enseigne || plan.Reseller)) {
      const cibleFroide = {
        _isFroid: true,
        ID_Compte: null,
        Nom_Compte: plan.Nom_Enseigne || plan.Reseller,
        Ville: plan.Ville || '',
        Tel: plan.Telephone || '',
        Email: plan.Email_Contact || '',
        Departement: plan.Departement || '',
      };
      this.state.cible          = cibleFroide;
      this.state.typeSource     = 'FROID';
      this.state.froidsMode     = true;
      this.state.froidsFields   = { nom: cibleFroide.Nom_Compte, dept: cibleFroide.Departement, ville: cibleFroide.Ville, tel: cibleFroide.Tel, email: cibleFroide.Email, adresse: '' };
      this.state.idPlanifEnCours = id;
      this.state.mode           = 'APPEL';
      this.state.phase          = 'PRE';
      this.state.d.objectif     = plan.Objectif_Appel || '';
      this.render();
      return;
    }
    const allC = this.state.tousComptes || this.state.comptes;
    const resolu = this._resoudreCible(plan.ID_Cible, allC, this.state.prospects);
    if (!resolu) { Toast.afficher('Compte introuvable — vérifiez vos comptes attribués', 'warning'); return; }
    this.state.cible          = resolu.obj;
    this.state.typeSource     = resolu.type === 'PROSPECT' ? 'PROSPECT' : 'EXISTANT';
    this.state.idPlanifEnCours = id;
    this.state.mode           = 'APPEL';
    this.state.phase          = 'PRE';
    this.state.d.objectif     = plan.Objectif_Appel || '';
    this.state.recherche      = resolu.nom;
    this.render();
  },

  async supprimerPlanif(id) {
    if (!confirm('Supprimer cet appel planifié ?')) return;
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📞_PHONING', id, {
        deleted: 'TRUE', deleted_at: dateISOLocale(), deleted_by: Session.nom,
      });
      this.state.planning = this.state.planning.filter(a => a.ID_Appel !== id);
      Toast.afficher('🗑 Appel supprimé', 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  setFiltrePlanning(f) { this.state.filtrePlanning = f; this.render(); },

  // ── F1 : Analyse Gemini du questionnaire appel à froid ──
  async analyserAvecGemini() {
    const s = this.state, d = s.d, c = s.cible;
    if (!c) return;
    s.geminiEnCours = true;
    this.render();
    try {
      const ctx = `Tu es un assistant commercial expert en distribution IT/cybersécurité (Norton France). Tu analyses des appels commerciaux terrain et fournis des recommandations opérationnelles.`;
      const stars = d.interetScore > 0 ? '★'.repeat(d.interetScore) + '☆'.repeat(5 - d.interetScore) : '—';
      const prompt = `Analyse cet appel commercial et donne une recommandation précise :

Compte : ${c.Nom_Compte || '—'} (${c.Ville || '—'} · canal ${c.CANAL || '—'})
Type d'appel : ${d.typeAppel || '—'}
Intérêt EMPOWER déclaré : ${d.interetEmpower || '—'}
Score d'intérêt (1-5) : ${d.interetScore || '—'}/5 ${stars}
Frein principal : ${d.frein || '—'}
Concurrent actuel : ${d.concurrentActuel || 'non renseigné'}
Potentiel estimé : ${d.potentielEstime || '—'}
Statut de l'appel : ${d.statutAppel || '—'}
Notes : ${d.note || 'aucune'}

Fournis exactement :
1. BILAN (2 lignes max — ce qui a bien/mal fonctionné)
2. PROCHAINE ACTION (1 action concrète + délai suggéré)
3. ARGUMENT CLÉ (1-2 phrases adaptées au frein et concurrent détectés)

Ton : direct, professionnel, actionnable. Français. 150 mots max.`;
      s.geminiAnalyse = await GeminiAPI._appeler(prompt, ctx);
    } catch(e) {
      const msg = String(e.message).includes('404')
        ? 'Gemini indisponible (404) — vérifiez la clé Gemini dans Admin → Paramètres'
        : '❌ Gemini : ' + e.message;
      Toast.afficher(msg, 'erreur');
      s.geminiAnalyse = null;
    }
    s.geminiEnCours = false;
    this.render();
  },
};
