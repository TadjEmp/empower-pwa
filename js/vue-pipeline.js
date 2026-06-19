// ═══════════════════════════════════════
//  vue-pipeline.js — EMPOWER TRACKER V2.2 (BUG-01)
//  Workflow : SAISIE → ASSIGNE → EN_COURS → COMPTE_CREE → INTEGRE / ARCHIVE
//  CHANNEL_MANAGER (Alexandra, Flavie) + ADMIN : saisie, attribution, avancement
//  CDS : lecture + avancement de ses propres leads
//  Source : 📋_PROSPECTS · ⚙️_PARAMS (liste CDS dynamique)
// ═══════════════════════════════════════

window.VuePipeline = {

  STATUTS: [
    { id: 'SAISIE',      lbl: 'À traiter',    coul: 'var(--c-primary)' },
    { id: 'ASSIGNE',     lbl: 'Assigné',      coul: 'var(--c-accent)' },
    { id: 'EN_COURS',    lbl: 'En cours',     coul: 'var(--c-warning)' },
    { id: 'COMPTE_CREE', lbl: 'Compte créé',  coul: '#9333ea' },
    { id: 'INTEGRE',     lbl: 'Intégré ✅',   coul: 'var(--c-success)' },
    { id: 'ARCHIVE',     lbl: 'Archivé',      coul: 'var(--c-text-2)' },
  ],

  // BLOC 1 : 4004 Anthony retiré du fallback · V5 BUG1 : Alexandra (5000) ajoutée
  CDS_FALLBACK: [ { pin: 4001, nom: 'Lyes' }, { pin: 4002, nom: 'Mehdi' }, { pin: 4003, nom: 'Johanne' }, { pin: 1000, nom: 'Tadjidine' }, { pin: 5000, nom: 'Alexandra' } ],
  CDS: [],

  LIMITE_COL: 20,

  state: null,
  modeAffichage: 'kanban', // 'kanban' | 'table'

  // BLOCS 7 & 3.2 — valeurs channel disponibles (calculées à l'init)
  CHANNELS: [],

  _chargerCDS(params, objectifs, cdsApi) {
    // V5 BUG1 — source de vérité = lireCDS (backend). Inclut Alexandra (5000).
    // GARANTIE ABSOLUE : si l'API est indisponible, fallback codé en dur (5 entrées).
    // Ne dépend plus de ⚙️_PARAMS (évite tout bug de cache IDB ou PINS_CDS erronée).
    if (Array.isArray(cdsApi) && cdsApi.length) {
      this.CDS = cdsApi.map(c => ({ pin: Number(c.pin), nom: String(c.nom) }));
    } else {
      const NOMS = { 1000:'Tadjidine', 4001:'Lyes', 4002:'Mehdi', 4003:'Johanne', 5000:'Alexandra' };
      const nomMap = {};
      (objectifs || []).forEach(o => {
        const pin = Number(o.PIN_CDS), nom = String(o.Nom_CDS || '').trim();
        if (pin && nom) nomMap[pin] = nom;
      });
      this.CDS = [1000, 4001, 4002, 4003, 5000].map(pin => ({ pin, nom: nomMap[pin] || NOMS[pin] }));
    }
    // Synchronise _CDS_REGISTRY pour resolveCDS() dans toute l'app
    this.CDS.forEach(c => { window._CDS_REGISTRY[String(c.pin)] = c.nom; });
  },

  // ── Droits (Bloc 4) ──
  // Voir tous les leads : ADMIN + CHANNEL_MANAGER (Alexandra). CDS : ses propres leads. EXTERNE (Flavie) : saisie.
  _voitTous()    { return Session.voitTout(); },
  // Attribuer / avancer / éditer un lead : ADMIN uniquement. Alexandra (CHANNEL_MANAGER) = lecture seule.
  _peutAssigner(){ return Session.estManager() || Session.estChannel(); },
  // Saisir un nouveau lead : ADMIN + CHANNEL_MANAGER (Alexandra) + CDS (commercial terrain).
  _peutSaisir()  { return Session.estManager() || Session.estChannel() || Session.estCDS(); },
  // Lecture seule (Alexandra) : voit tout mais ne peut rien modifier hormis la saisie.
  _lectureSeule(){ return Session.estChannel(); },

  async init() {
    this.state = {
      leads: [], chargement: true, envoiEnCours: false,
      recherche: '', filtreCDS: 'TOUS', filtrePotentiel: 'TOUS',
      filtreStatut: 'TOUS', filtreAlerte: 'TOUS', filtreOrigine: 'TOUS',
      filtreChannel: 'TOUS', // BLOC 7
      colonnesEtendues: {},
      modal: null,
      exportOuvert: false,
      exportFiltres: { debut: '', fin: '', periode: 'MOIS' },
    };
    this.render();
    try {
      const [raw, params, objectifs, cdsApi] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lireCDS(), // V5 BUG1 — liste CDS dynamique (inclut Alexandra)
      ]);
      this._chargerCDS(params, objectifs, cdsApi);
      initCDSRegistry(objectifs); // BUG-02 : peuple le registre global

      // BLOC 7 — extraire la liste des channels disponibles
      const channelsVus = new Set();
      raw.forEach(p => { if (p.CANAL) channelsVus.add(String(p.CANAL).trim()); });
      this.CHANNELS = [...channelsVus].sort();

      // TRACKER : tous les leads attribués au CDS (ou tous pour ADMIN/CHANNEL_MANAGER)
      this.state.leads = raw
        // Exclure imports base Flavie + BASE_PROSPECTS_RELANCER + prospects hors-base Visites.
        // Le backend exclut déjà FLAVIE/BASE pour non-admin ; ce filtre couvre aussi l'admin.
        .filter(p => {
          const src = String(p.Source_Import || '').toUpperCase();
          return !src.includes('FLAVIE') && src !== 'BASE_PROSPECTS_RELANCER' && src !== 'ESI_VISITE_FROID';
        })
        // BLOC 4.2 : exclure les leads soft-deleted
        .filter(p => String(p.Flag_traite || '').toUpperCase() !== 'DELETED'
                  && String(p.deleted   || '').toUpperCase() !== 'TRUE')
        // BLOC 5 : exclure les comptes déjà convertis (Flag_converti=TRUE) pour CDS/CHANNEL_MANAGER
        .filter(p => {
          if (Session.estManager()) return true; // ADMIN voit tout
          return String(p.Flag_converti || '').toUpperCase() !== 'TRUE';
        })
        .map(p => ({ ...p, _statut: this._statutDe(p) }))
        // BLOC 5 : dédoublonnage par Nom_Compte normalisé — garde le premier (ordre source)
        .filter((p, _i, arr) => {
          const k = normaliserNom(p.Nom_Compte);
          return arr.findIndex(x => normaliserNom(x.Nom_Compte) === k) === _i;
        })
        // ADMIN + CHANNEL_MANAGER : tous les leads. CDS : uniquement les siens.
        .filter(p => this._voitTous() || Number(p.PIN_CDS_Assigne) === Session.pin)
        // BLOC 3.2 : Alexandra voit uniquement les leads actifs (hors INTEGRE/ARCHIVE) par défaut
        .filter(p => {
          if (!Session.estChannel()) return true;
          return p._statut !== 'INTEGRE' && p._statut !== 'ARCHIVE';
        });
      this.state.chargement = false;
      this.render();
    } catch(e) {
      if (!this.CDS.length) this.CDS = this.CDS_FALLBACK;
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  // Statut pipeline — STATUT_EMPOWER prioritaire, sinon déduit des flags historiques
  // v5.0 M3 — A_TRAITER (backend) = SAISIE (colonne kanban "À traiter")
  _statutDe(p) {
    const s = String(p.STATUT_EMPOWER || '').toUpperCase();
    if (s === 'A_TRAITER') return 'SAISIE';
    if (this.STATUTS.some(x => x.id === s)) return s;
    if (String(p.Flag_converti).toUpperCase() === 'TRUE') return 'INTEGRE';
    if (p.PIN_CDS_Assigne) {
      return String(p.Flag_traite).toUpperCase() === 'TRUE' ? 'EN_COURS' : 'ASSIGNE';
    }
    return 'SAISIE';
  },

  get leadsFiltres() {
    let l = this.state.leads;
    const q = normaliserNom(this.state.recherche);
    if (q) l = l.filter(p => normaliserNom(p.Nom_Compte).includes(q) || normaliserNom(p.Ville || '').includes(q));
    if (this.state.filtreCDS !== 'TOUS') l = l.filter(p => String(p.PIN_CDS_Assigne) === String(this.state.filtreCDS));
    if (this.state.filtrePotentiel !== 'TOUS') l = l.filter(p => String(p.POTENTIEL || '').toLowerCase() === String(this.state.filtrePotentiel).toLowerCase());
    if (this.state.filtreStatut !== 'TOUS') l = l.filter(p => p._statut === this.state.filtreStatut);
    if (this.state.filtreOrigine !== 'TOUS') l = l.filter(p => String(p.ORIGINE || '').toLowerCase() === String(this.state.filtreOrigine).toLowerCase());
    if (this.state.filtreAlerte === 'WP_RETARD') l = l.filter(p => this._retardWelcomePack(p));
    if (this.state.filtreAlerte === 'WP_ENVOYE') l = l.filter(p => !!p.WELCOME_PACK_DATE);
    if (this.state.filtreAlerte === 'ACTION_DUE') l = l.filter(p => p.Date_prochaine_action && estDepassee(p.Date_prochaine_action));
    // BLOC 7 — filtre channel
    if (this.state.filtreChannel !== 'TOUS') l = l.filter(p => String(p.CANAL || '').trim() === this.state.filtreChannel);
    return l;
  },

  _nomCDS(pin) { return resolveCDS(pin); }, // BUG-02 : délègue au helper global

  _labelFlag(flag) {
    const MAP = {
      'SAISIE':               '🆕 Nouveau',
      'A_RELANCER':           '🔔 À relancer',
      'EN_COURS':             '▶️ En cours',
      'A_RAPPELER':           '📅 À rappeler',
      'INTERESSE':            '✅ Intéressé',
      'WELCOME_PACK_ENVOYE':  '📦 WP envoyé',
      'COMPTE_CREE':          '🏢 Compte créé',
      'NON_INTERESSE':        '❌ Non intéressé',
      'PERDU':                '🗄 Perdu',
    };
    return MAP[String(flag || '').toUpperCase()] || flag || '—';
  },

  // Origines distinctes présentes dans les leads (case-insensitive, libellé d'affichage = 1ère occurrence)
  _originesDistinctes() {
    const vues = new Map();
    this.state.leads.forEach(p => {
      const o = String(p.ORIGINE || '').trim();
      if (o && !vues.has(o.toLowerCase())) vues.set(o.toLowerCase(), o);
    });
    return [...vues.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  },

  _retardWelcomePack(p) {
    if (p._statut !== 'COMPTE_CREE' || p.WELCOME_PACK_DATE) return false;
    const ref = p.Timestamp || p.Date_Import;
    return ref && (Date.now() - new Date(ref).getTime()) / 86400000 > 14;
  },

  // ── Actions ──
  ouvrirLead(id) {
    this.state.modal = { type: 'lead', lead: this.state.leads.find(l => String(l.ID_Prospect) === String(id)) };
    this.render();
  },
  ouvrirSaisie() { this.state.modal = { type: 'saisie' }; this.render(); },
  fermerModal()  { this.state.modal = null; this.render(); },

  async iaAppeler(slot, leadId) {
    const lead = this.state.leads.find(l => String(l.ID_Prospect) === String(leadId));
    if (!lead) return;
    const zone = document.getElementById('ia-zone');
    if (!zone) return;
    const LABELS = { T01: '🔍 Analyse', T02: '📋 Préparation visite', T04: '✉️ Email', T05: '📝 Résumé CR' };
    zone.style.display = 'block';
    zone.style.color = 'var(--c-text-2)';
    zone.textContent = `⏳ ${LABELS[slot] || slot} en cours…`;
    try {
      let texte;
      if (slot === 'T01') texte = await GeminiAPI.t01_analyser(lead);
      else if (slot === 'T02') texte = await GeminiAPI.t02_preparerVisite(lead);
      else if (slot === 'T04') texte = await GeminiAPI.t04_email(lead);
      else if (slot === 'T05') texte = await GeminiAPI.t05_resumeCR(lead);
      zone.style.color = 'var(--c-text)';
      zone.textContent = texte || '(réponse vide)';
    } catch (e) {
      zone.style.color = 'var(--c-danger)';
      zone.textContent = '❌ ' + e.message;
    }
  },

  async deplacer(id, statut) {
    const lead = this.state.leads.find(l => String(l.ID_Prospect) === String(id));
    if (!lead) return;
    const champs = { STATUT_EMPOWER: statut };
    if (statut === 'COMPTE_CREE' && !lead.WELCOME_PACK_DATE) champs.WELCOME_PACK_DATE = dateISOLocale();
    if (statut === 'INTEGRE') {
      champs.Flag_converti = 'TRUE';
      if (!lead.PREMIERE_COMMANDE_DATE) champs.PREMIERE_COMMANDE_DATE = dateISOLocale();
    }
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', id, champs);
      Object.assign(lead, champs, { _statut: statut });
      this.state.modal = null;
      Toast.afficher(`✅ ${lead.Nom_Compte} → ${this.STATUTS.find(s => s.id === statut).lbl}`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  async attribuer(id, pin) {
    const lead = this.state.leads.find(l => String(l.ID_Prospect) === String(id));
    if (!lead || !pin) return;
    try {
      const r = await fetch(SheetsAPI.BASE_URL, {
        method: 'POST', redirect: 'follow',
        // Pas de Content-Type → requête simple, évite le préflight CORS (Apps Script ne gère pas OPTIONS)
        body: JSON.stringify({ action: 'attribuerLead', token: SheetsAPI.TOKEN, id, cdsPin: Number(pin), cdsNom: this._nomCDS(pin) }),
      }).then(x => x.json());
      if (!r.ok) throw new Error(r.erreur);
      await SheetsAPI.viderCache('EMPOWER_MDB', '📋_PROSPECTS');
      Object.assign(lead, { PIN_CDS_Assigne: Number(pin), STATUT_EMPOWER: 'ASSIGNE', _statut: 'ASSIGNE' });
      this.state.modal = null;
      Toast.afficher(`🎯 ${lead.Nom_Compte} → ${this._nomCDS(pin)}`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  async saisirLead(e) {
    e.preventDefault();
    if (this.state.envoiEnCours) return;
    const v = id => document.getElementById(id)?.value?.trim() || '';
    if (!v('nl-nom')) { Toast.afficher('Nom du prospect requis', 'warning'); return; }

    // Capturer TOUS les champs AVANT render() — render() vide les inputs du DOM
    const nomSaisi = v('nl-nom').toUpperCase();
    const vals = {
      ville: v('nl-ville'), cp: v('nl-cp'), tel: v('nl-tel'), email: v('nl-email'),
      canal: v('nl-canal'), note: v('nl-note'), dateAction: v('nl-date-action'),
      potentiel: v('nl-potentiel'), origine: v('nl-origine'),
      contact: v('nl-contact'), fonction: v('nl-fonction'),
      cdsSelect: v('nl-cds-assigne'),
    };

    // GEM-T02 — Détection doublon avant création
    try {
      const existants = [...this.state.leads, ...[]];
      const rawRes = await GeminiAPI.gemT02_detectionDoublon(nomSaisi, existants);
      const res = safeJSON(rawRes);
      if (res?.doublon_probable && res.score > 70) {
        const confirmer = confirm(
          `⚠️ Doublon probable détecté !\n\nCompte similaire existant : "${res.nom_similaire}"\nSimilarité : ${res.score}%\n${res.explication||''}\n\nContinuer quand même la création ?`
        );
        if (!confirmer) { return; }
      }
    } catch { /* GEM-T02 optionnel — on continue si erreur */ }

    // BLOC 4.1 — attribution directe à la création
    // Admin/Channel : choisit dans le select. CDS : auto-assigné à lui-même.
    const cdsAssignePin = this._peutAssigner() ? (vals.cdsSelect || '')
                        : Session.estCDS()      ? String(Session.pin)
                        : '';
    const statutInit    = cdsAssignePin ? 'ASSIGNE' : 'SAISIE';

    const lead = {
      ID_Prospect: genId('PROS'),
      Nom_Compte: nomSaisi, Ville: vals.ville, Code_Postal: vals.cp,
      Tel: vals.tel, Email: vals.email,
      PIN_CDS_Assigne: cdsAssignePin ? Number(cdsAssignePin) : '',
      Source_Import: 'ESI_PIPELINE',
      FLAG_ACTION: statutInit, CANAL: vals.canal,
      Note_initiale: vals.note, Date_prochaine_action: vals.dateAction,
      Flag_traite: 'FALSE', Flag_converti: 'FALSE',
      Date_Import: dateISOLocale(),
      Timestamp: new Date().toISOString(),
      STATUT_EMPOWER: statutInit, POTENTIEL: vals.potentiel,
      ORIGINE: vals.origine, CONTACT_NOM: vals.contact, CONTACT_FONCTION: vals.fonction,
    };

    this.state.envoiEnCours = true;
    this.render();

    try {
      await SheetsAPI.ecrire('EMPOWER_MDB', '📋_PROSPECTS', lead);
      this.state.leads.unshift({ ...lead, _statut: statutInit });
      // BLOC 4.3 — si CDS attribué à la création : déclencher alerte J0 (préserve les triggers existants)
      if (cdsAssignePin) {
        fetch(SheetsAPI.BASE_URL, {
          method: 'POST', redirect: 'follow',
          body: JSON.stringify({ action: 'attribuerLead', token: SheetsAPI.TOKEN,
            id: lead.ID_Prospect, cdsPin: Number(cdsAssignePin),
            cdsNom: this._nomCDS(cdsAssignePin) }),
        }).catch(() => {}); // non bloquant
      }
      this.state.modal = null;
      Toast.afficher(`✅ Lead créé${cdsAssignePin ? ' → ' + this._nomCDS(cdsAssignePin) : ''} : ` + lead.Nom_Compte, 'succes');

      // GEM-T01 — Enrichissement automatique post-création (asynchrone, non bloquant)
      GeminiAPI.gemT01_enrichirLead(lead).then(raw => {
        const enrichi = safeJSON(raw);
        if (!enrichi) return;
        const maj = {};
        if (enrichi.potentiel && !lead.POTENTIEL)       maj.POTENTIEL = enrichi.potentiel;
        if (enrichi.canal_probable && !lead.CANAL)       maj.CANAL = enrichi.canal_probable;
        if (enrichi.type_revendeur_probable)             maj.Type_Revendeur = enrichi.type_revendeur_probable;
        if (enrichi.angle_approche)                      maj.Note_initiale = (lead.Note_initiale ? lead.Note_initiale + '\n' : '') + '[IA] ' + enrichi.angle_approche;
        if (Object.keys(maj).length) {
          SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', lead.ID_Prospect, maj).then(() => {
            Object.assign(lead, maj);
            const local = this.state.leads.find(l => l.ID_Prospect === lead.ID_Prospect);
            if (local) Object.assign(local, maj);
            Toast.afficher(`✨ Lead enrichi par Gemini (potentiel : ${maj.POTENTIEL||lead.POTENTIEL})`, 'info', 3000);
            this.render();
          }).catch(() => {});
        }
      }).catch(() => {});
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
    this.state.envoiEnCours = false;
    this.render();
  },

  etendre(statut) {
    this.state.colonnesEtendues[statut] = true;
    this.render();
  },

  setMode(m) { this.modeAffichage = m; this.render(); },

  setRecherche: debounce(function(v) {
    VuePipeline.state.recherche = v;
    // Quand on tape une recherche, on affiche tout pour ne rien masquer
    if (v) VuePipeline.state.colonnesEtendues = { SAISIE:true, ASSIGNE:true, EN_COURS:true, COMPTE_CREE:true, INTEGRE:true, ARCHIVE:true };
    else    VuePipeline.state.colonnesEtendues = {};
    VuePipeline.render();
  }, 250),

  // ── RENDER ──
  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      // v5.0 M5 — skeleton kanban remplace le spinner bloquant
      app.innerHTML = `<div style="padding:16px">${skeletonKanban()}</div>`;
      return;
    }
    const leads = this.leadsFiltres;
    const voitTous = this._voitTous();      // filtres par CDS (ADMIN + CHANNEL_MANAGER)
    const peutSaisir = this._peutSaisir();   // bouton nouveau lead
    const lectureSeule = this._lectureSeule(); // Alexandra
    const cdsList = this.CDS.length ? this.CDS : this.CDS_FALLBACK;

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>EMPOWER TRACKER</h1>
        <span class="badge-compteur">${leads.length} leads</span>
        ${lectureSeule ? '<span class="badge-compteur" style="background:var(--c-text-2);color:#fff" title="Vue lecture seule">👁 Lecture seule</span>' : ''}
      </header>

      <!-- Toggle Kanban / Table — tabs premium -->
      <div style="padding:10px 12px 0;background:var(--c-surface);border-bottom:1px solid var(--c-border)">
        <div class="tabs-premium">
          <button class="tab-btn-premium ${this.modeAffichage === 'kanban' ? 'actif' : ''}"
                  onclick="VuePipeline.setMode('kanban')">
            📋 Kanban <span class="tab-num">${leads.length}</span>
          </button>
          <button class="tab-btn-premium ${this.modeAffichage === 'table' ? 'actif' : ''}"
                  onclick="VuePipeline.setMode('table')">
            ☰ Tableau
          </button>
        </div>
      </div>

      <div class="barre-filtres">
        <input type="search" placeholder="🔍 Rechercher un prospect…" value="${this.state.recherche}"
               style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;width:100%"
               oninput="VuePipeline.setRecherche(this.value)"/>
        <div class="filtres-statut">
          ${voitTous ? `
          <select onchange="VuePipeline.state.filtreCDS=this.value;VuePipeline.render()">
            <option value="TOUS">👥 Tous CDS</option>
            ${cdsList.map(c => `<option value="${c.pin}" ${String(this.state.filtreCDS) == String(c.pin) ? 'selected' : ''}>${this._nomCDS(c.pin)}</option>`).join('')}
          </select>` : ''}
          <select onchange="VuePipeline.state.filtreStatut=this.value;VuePipeline.render()">
            <option value="TOUS">Tous statuts</option>
            ${this.STATUTS.map(s => `<option value="${s.id}" ${this.state.filtreStatut === s.id ? 'selected' : ''}>${s.lbl}</option>`).join('')}
          </select>
          <select onchange="VuePipeline.state.filtrePotentiel=this.value;VuePipeline.render()">
            <option value="TOUS">Tout potentiel</option>
            ${['Fort', 'Moyen', 'Faible'].map(p => `<option ${this.state.filtrePotentiel === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
          <select onchange="VuePipeline.state.filtreAlerte=this.value;VuePipeline.render()">
            <option value="TOUS">Toutes alertes</option>
            <option value="WP_RETARD" ${this.state.filtreAlerte==='WP_RETARD'?'selected':''}>⚠️ WP J+14 dépassé</option>
            <option value="WP_ENVOYE" ${this.state.filtreAlerte==='WP_ENVOYE'?'selected':''}>📦 Welcome Pack envoyé</option>
            <option value="ACTION_DUE" ${this.state.filtreAlerte==='ACTION_DUE'?'selected':''}>⏰ Action en retard</option>
          </select>
          ${voitTous ? `
          <select onchange="VuePipeline.state.filtreOrigine=this.value;VuePipeline.render()">
            <option value="TOUS">Toutes origines</option>
            ${this._originesDistinctes().map(o => `<option value="${o}" ${String(this.state.filtreOrigine).toLowerCase()===String(o).toLowerCase()?'selected':''}>${o}</option>`).join('')}
          </select>` : ''}
          ${/* BLOC 7 — filtre channel */ this.CHANNELS.length > 1 ? `
          <select onchange="VuePipeline.state.filtreChannel=this.value;VuePipeline.render()">
            <option value="TOUS">Tous canaux</option>
            ${this.CHANNELS.map(c => `<option value="${c}" ${this.state.filtreChannel===c?'selected':''}>${c}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>

      ${this.modeAffichage === 'kanban' ? `
      <p style="font-size:11px;color:var(--c-text-2);text-align:center;padding:6px">← Glisser pour voir les statuts →</p>

      ${this.state.leads.length === 0 ? `
        <div class="vide" style="text-align:center;padding:40px 20px;color:var(--c-text-2)">
          <div style="font-size:32px;margin-bottom:12px">📭</div>
          <div style="font-weight:700;color:var(--c-title);margin-bottom:6px">Aucun lead à traiter</div>
          <div style="font-size:13px">Aucun lead assigné à votre compte. Les leads importés apparaissent ici une fois attribués.</div>
        </div>` : ''}

      <div class="kanban">
        ${this.STATUTS.map(st => {
          const col = leads
            .filter(l => l._statut === st.id)
            .sort((a, b) => {
              const aA = this._retardWelcomePack(a) ? 0 : 1;
              const bA = this._retardWelcomePack(b) ? 0 : 1;
              if (aA !== bA) return aA - bA;
              const scoreOf = l => {
                if (l.Slider_Receptivite) return Number(l.Slider_Receptivite) || 0;
                if (l.SCORE_ENGAGEMENT)   return Number(l.SCORE_ENGAGEMENT) || 0;
                const pot = { 'Fort': 3, 'Moyen': 2, 'Faible': 1 };
                return pot[l.POTENTIEL] || 0;
              };
              const scoreDiff = scoreOf(b) - scoreOf(a);
              if (scoreDiff !== 0) return scoreDiff;
              const dateOf = l => new Date(l.Date_prochaine_action || l.Timestamp || l.Date_Import || 0).getTime();
              return dateOf(b) - dateOf(a);
            });
          const etendue = !!this.state.colonnesEtendues[st.id];
          const affichees = etendue ? col : col.slice(0, this.LIMITE_COL);
          const masques = col.length - affichees.length;
          return `
          <div class="kanban-col">
            <div class="kanban-col-head">
              <span class="kanban-dot" style="background:${st.coul}"></span>
              <span class="kanban-col-titre">${st.lbl}</span>
              <span class="badge-compteur">${col.length}</span>
            </div>
            ${affichees.map(l => `
              <div class="kanban-carte ${this._retardWelcomePack(l) ? 'kanban-alerte' : ''}"
                   onclick="VuePipeline.ouvrirLead('${l.ID_Prospect}')">
                <div class="kanban-carte-nom">${l.Nom_Compte}</div>
                <div class="kanban-carte-meta">
                  ${l.POTENTIEL ? `<span class="pot-pill pot-${(l.POTENTIEL||'').toLowerCase()}">${l.POTENTIEL}</span>` : ''}
                  ${l.CANAL ? `<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:var(--c-bg);border:1px solid var(--c-border);color:var(--c-text-2);white-space:nowrap">${l.CANAL}</span>` : ''}
                </div>
                <div class="kanban-carte-meta" style="margin-top:3px">
                  <span style="color:var(--c-text-2);font-size:11px">👤 ${this._nomCDS(l.PIN_CDS_Assigne)}</span>
                  ${l.FLAG_ACTION && l.FLAG_ACTION !== 'SAISIE' ? `<span style="font-size:10px;color:var(--c-primary);font-weight:700">${this._labelFlag(l.FLAG_ACTION)}</span>` : ''}
                </div>
                ${l.Note_initiale ? `<div class="kanban-carte-note">${String(l.Note_initiale).slice(0, 60)}</div>` : ''}
                ${this._retardWelcomePack(l) ? '<div class="kanban-carte-note" style="color:var(--c-danger);font-weight:600">⚠️ Welcome Pack J+14 dépassé</div>' : ''}
                ${this._alerteSansActivite(l) ? '<div class="kanban-carte-note" style="color:var(--c-warning);font-weight:600">⏳ Sans activité >7j</div>' : ''}
                <div class="kanban-carte-pied" style="display:flex;align-items:center;gap:4px">
                  ${l.Date_prochaine_action
                    ? `<span style="color:${estDepassee(l.Date_prochaine_action) ? 'var(--c-danger)' : 'var(--c-text-2)'}">⏰ ${dateRelative(l.Date_prochaine_action)}</span>`
                    : `<span>🕐 ${dateRelative(l.Timestamp || l.Date_Import)}</span>`}
                  <span class="kanban-voir" style="margin-left:auto">Voir →</span>
                </div>
              </div>`).join('')}
            ${masques > 0 ? `
              <div class="kanban-voir-plus" onclick="VuePipeline.etendre('${st.id}')">
                +${masques} autres · voir tous
              </div>` : ''}
            ${col.length === 0 ? '<div class="kanban-vide">—</div>' : ''}
          </div>`;
        }).join('')}
      </div>` : this._renderTableau(leads, voitTous)}

      ${peutSaisir ? '<button class="fab" onclick="VuePipeline.ouvrirSaisie()" title="Nouveau lead" style="bottom:140px">＋</button>' : ''}
      ${(Session.estManager() || Session.estChannel()) ? `<button class="fab" onclick="VuePipeline.ouvrirExport()" title="Export Excel" style="bottom:210px;background:var(--c-success);font-size:18px">📥</button>` : ''}
      ${NavBar('tracker')}
      ${this._renderModal()}
      ${this._renderPanneauExport()}
    `;
  },

  _renderTableau(leads, voitTous) {
    if (leads.length === 0) return `
      <div class="vide" style="text-align:center;padding:40px 20px;color:var(--c-text-2)">
        <div style="font-size:32px;margin-bottom:12px">📭</div>
        <div style="font-weight:700;color:var(--c-title);margin-bottom:6px">Aucun résultat</div>
      </div>`;

    const statutLabel = id => (this.STATUTS.find(s => s.id === id) || {}).lbl || id;
    return `
      <div class="desktop-table-wrap avec-nav" style="margin:12px">
        <table class="desktop-table-data-view">
          <thead><tr>
            <th>Compte</th>
            <th>Canal</th>
            <th>Statut</th>
            <th>Potentiel</th>
            ${voitTous ? '<th>CDS</th>' : ''}
            <th>Action</th>
            <th>Source</th>
            <th style="min-width:80px">Actions</th>
          </tr></thead>
          <tbody>
            ${leads.map(l => `<tr>
              <td class="compte-nom" onclick="VuePipeline.ouvrirLead('${l.ID_Prospect}')" style="cursor:pointer">
                ${l.Nom_Compte}
                ${this._retardWelcomePack(l) ? '<span style="margin-left:4px;color:var(--c-danger);font-size:11px;font-weight:700">⚠️ WP</span>' : ''}
              </td>
              <td style="font-size:12px;color:var(--c-text-2)">${l.CANAL || '—'}</td>
              <td>
                <span class="statut-pill statut-${(l._statut||'').toLowerCase()}" style="font-size:10px">
                  ${statutLabel(l._statut)}
                </span>
              </td>
              <td>
                ${l.POTENTIEL ? `<span class="pot-pill pot-${(l.POTENTIEL||'').toLowerCase()}">${l.POTENTIEL}</span>` : '—'}
              </td>
              ${voitTous ? `<td style="font-size:12px">${this._nomCDS(l.PIN_CDS_Assigne)}</td>` : ''}
              <td style="font-size:12px;color:${l.Date_prochaine_action && estDepassee(l.Date_prochaine_action) ? 'var(--c-danger)' : 'var(--c-text-2)'}">
                ${l.Date_prochaine_action ? dateRelative(l.Date_prochaine_action) : '—'}
              </td>
              <td style="font-size:11px;color:var(--c-text-2)">${(l.ORIGINE||'—').replace('Import_','').replace(/_/g,' ')}</td>
              <td>
                <button class="btn-visiter" style="padding:4px 10px;font-size:12px"
                        onclick="VuePipeline.ouvrirLead('${l.ID_Prospect}')">Voir →</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  _renderModal() {
    const m = this.state.modal;
    if (!m) return '';
    if (m.type === 'saisie') {
      return `
      <div class="modal-overlay" onclick="if(event.target===this)VuePipeline.fermerModal()">
        <div class="modal">
          <h3>➕ Nouveau lead EMPOWER</h3>
          <p style="font-size:12px;color:var(--c-text-2);margin:-4px 0 12px">Renseigne le prospect identifié — plus tu donnes d'infos, plus l'IA enrichira la fiche automatiquement (potentiel, canal, angle d'approche).</p>
          <form onsubmit="VuePipeline.saisirLead(event)">

            <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.05em;margin-bottom:6px">IDENTIFICATION</div>
            <label>Enseigne / Raison sociale *
              <input id="nl-nom" required placeholder="ex : MICRO PLUS INFORMATIQUE — en majuscules"/></label>
            <div style="display:flex;gap:10px">
              <label style="flex:2">Ville
                <input id="nl-ville" placeholder="ex : Lyon"/></label>
              <label style="flex:1">Code postal
                <input id="nl-cp" inputmode="numeric" placeholder="69000"/></label>
            </div>
            <label>Canal de vente
              <select id="nl-canal">
                <option value="IT">IT Revendeur</option>
                <option value="Grande Surface">Grande Surface (Drive / Leclerc)</option>
                <option value="Retail">Retail / Boutique</option>
                <option value="Grossiste">Grossiste / Distributeur</option>
                <option value="Autre">Autre</option>
              </select>
            </label>

            <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.05em;margin:10px 0 6px">CONTACT</div>
            <div style="display:flex;gap:10px">
              <label style="flex:2">Nom du contact
                <input id="nl-contact" placeholder="ex : Jean Martin"/></label>
              <label style="flex:2">Fonction
                <input id="nl-fonction" placeholder="ex : Gérant, Acheteur…"/></label>
            </div>
            <div style="display:flex;gap:10px">
              <label style="flex:1">Téléphone
                <input id="nl-tel" inputmode="tel" placeholder="06 xx xx xx xx"/></label>
              <label style="flex:1">Email
                <input id="nl-email" type="email" placeholder="contact@…"/></label>
            </div>

            <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.05em;margin:10px 0 6px">QUALIFICATION</div>
            <div style="display:flex;gap:10px">
              <label style="flex:1">Potentiel estimé
                <select id="nl-potentiel">
                  <option value="Fort">🔴 Fort — > 30 000 €/an</option>
                  <option value="Moyen" selected>🟡 Moyen — 10-30 k€/an</option>
                  <option value="Faible">⚪ Faible — < 10 000 €/an</option>
                </select>
              </label>
              <label style="flex:1">Prochaine action
                <input type="date" id="nl-date-action"/></label>
            </div>
            <label>Source du lead
              <select id="nl-origine">
                <option value="Alexandra">Alexandra — saisie directe</option>
                <option value="FDV">FDV — force de vente terrain</option>
                <option value="Web">Web — site / formulaire</option>
                <option value="Recommandation">Recommandation client</option>
                <option value="Salon">Salon / Événement</option>
                <option value="Autre">Autre</option>
              </select>
            </label>
            ${/* BLOC 4.1 — attribution directe à la création */ this._peutAssigner() ? `
            <label>Attribuer à un CDS (optionnel)
              <select id="nl-cds-assigne">
                <option value="">— Non attribué pour l'instant —</option>
                ${(this.CDS.length ? this.CDS : this.CDS_FALLBACK).map(c => `<option value="${c.pin}">${this._nomCDS(c.pin)}</option>`).join('')}
              </select>
            </label>` : ''}
            <label>Notes de qualification
              <textarea id="nl-note" rows="4"
                        placeholder="Exemple : revendeur IT 5 boutiques — déjà utilisateur Norton Home / rencontré au salon IT Partners en nov. 2024 — intérêt confirmé pour EMPOWER pack revendeur — demande démo avant signature — bloquer sur le prix à date. Contact : Jean Martin (gérant), disponible le matin."></textarea>
            </label>

            <div class="modal-btns">
              <button type="button" onclick="VuePipeline.fermerModal()">Annuler</button>
              <button type="submit" class="btn-primaire" ${this.state.envoiEnCours ? 'disabled' : ''}>
                ${this.state.envoiEnCours ? '⏳ Création en cours…' : '✅ Créer le lead'}</button>
            </div>
          </form>
        </div>
      </div>`;
    }
    // Fiche lead : info complète + édition inline + IA Gemini
    const l = m.lead;
    if (!l) return '';
    // Droits Bloc 4 : ADMIN gère tout ; CDS édite/avance SES leads ; Alexandra (CHANNEL_MANAGER) = lecture seule ; EXTERNE = saisie seule.
    const peutAssigner = this._peutAssigner();   // attribution CDS → ADMIN uniquement
    const peutEditer = Session.estManager() || (Session.estCDS() && Number(l.PIN_CDS_Assigne) === Session.pin); // suivi + avancement
    const cdsList = this.CDS.length ? this.CDS : this.CDS_FALLBACK;
    const statut = this.STATUTS.find(s => s.id === l._statut);
    const FLAGS = ['SAISIE','A_RELANCER','EN_COURS','A_RAPPELER','INTERESSE','WELCOME_PACK_ENVOYE','NON_INTERESSE','PERDU'];

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePipeline.fermerModal()">
      <div class="modal">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">
          <div style="flex:1">
            <h3 style="margin:0 0 4px">${l.Nom_Compte}</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <span class="status-badge status-${(l._statut||'').toLowerCase()}">${statut?.lbl||l._statut}</span>
              ${l.POTENTIEL ? `<span class="pot-pill pot-${(l.POTENTIEL||'').toLowerCase()}">${l.POTENTIEL}</span>` : ''}
              ${l.CANAL ? `<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:var(--c-bg);border:1px solid var(--c-border);color:var(--c-text-2)">${l.CANAL}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Infos lead complètes -->
        <div class="q-recap" style="margin-bottom:12px">
          <div class="q-recap-ligne"><span>CDS assigné</span><strong>${this._nomCDS(l.PIN_CDS_Assigne)}</strong></div>
          ${l.Ville || l.Code_Postal ? `<div class="q-recap-ligne"><span>Localisation</span><strong>${l.Ville || '—'} ${l.Code_Postal||''}</strong></div>` : ''}
          ${l.Tel ? `<div class="q-recap-ligne"><span>Téléphone</span><strong><a class="lien-tel" href="tel:${String(l.Tel).replace(/\s/g, '')}">${l.Tel}</a></strong></div>` : ''}
          ${l.Email ? `<div class="q-recap-ligne"><span>Email</span><strong>${l.Email}</strong></div>` : ''}
          ${l.CONTACT_NOM ? `<div class="q-recap-ligne"><span>Contact</span><strong>${l.CONTACT_NOM}${l.CONTACT_FONCTION ? ' · ' + l.CONTACT_FONCTION : ''}</strong></div>` : ''}
          <div class="q-recap-ligne"><span>Dernière relance</span><strong>${l.Date_prochaine_action ? dateRelative(l.Date_prochaine_action) : (l.Date_Import ? dateRelative(l.Date_Import) : '—')}</strong></div>
          <div class="q-recap-ligne"><span>Action en cours</span><strong>${this._labelFlag(l.FLAG_ACTION)}</strong></div>
          ${l.ORIGINE ? `<div class="q-recap-ligne"><span>Source</span><strong style="font-size:11px">${l.ORIGINE.replace('Import_','').replace(/_/g,' ')}</strong></div>` : ''}
          ${l.WELCOME_PACK_DATE ? `<div class="q-recap-ligne"><span>Welcome Pack</span><strong>${l.WELCOME_PACK_DATE}</strong></div>` : ''}
          ${l.PREMIERE_COMMANDE_DATE ? `<div class="q-recap-ligne"><span>1ère commande</span><strong>${l.PREMIERE_COMMANDE_DATE}</strong></div>` : ''}
          <div class="q-recap-ligne"><span>Créé le</span><strong>${l.Date_Import ? dateRelative(l.Date_Import) : '—'}</strong></div>
        </div>

        <!-- Mise à jour suivi (édition réservée : ADMIN ou CDS propriétaire) -->
        ${peutEditer ? `
        <div style="margin-bottom:12px;padding:12px;background:var(--c-bg);border-radius:var(--radius-sm);border:1px solid var(--c-border)">
          <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.04em;margin-bottom:8px">📝 MISE À JOUR SUIVI</div>

          <div style="display:flex;gap:8px;margin-bottom:8px">
            <label style="flex:1;font-size:12px;color:var(--c-text-2)">Statut
              <select id="lead-statut-select" style="width:100%;margin-top:3px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:7px;font-size:13px">
                ${this.STATUTS.map(s => `<option value="${s.id}" ${l._statut === s.id ? 'selected' : ''}>${s.lbl}</option>`).join('')}
              </select>
            </label>
            <label style="flex:1;font-size:12px;color:var(--c-text-2)">Action réalisée
              <select id="lead-flag" style="width:100%;margin-top:3px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:7px;font-size:13px">
                ${FLAGS.map(f => `<option value="${f}" ${String(l.FLAG_ACTION||'').toUpperCase() === f ? 'selected' : ''}>${this._labelFlag(f)}</option>`).join('')}
              </select>
            </label>
          </div>

          <label style="font-size:12px;color:var(--c-text-2)">Prochaine action
            <input type="date" id="lead-date-action" class="q-input" style="margin-top:3px"
                   value="${l.Date_prochaine_action ? String(l.Date_prochaine_action).slice(0,10) : ''}"/>
          </label>

          <label style="font-size:12px;color:var(--c-text-2);margin-top:8px;display:block">Compte-rendu / Note
            <textarea id="lead-note" class="q-textarea" rows="2" style="margin-top:3px"
                      placeholder="Décris ce qui a été fait ou le résultat de l'échange…"></textarea>
          </label>

          <button class="btn-primaire" style="width:100%;margin-top:8px;font-size:13px"
                  onclick="VuePipeline.mettreAJourLead('${l.ID_Prospect}')">✅ Enregistrer la mise à jour</button>
        </div>` : ''}

        <!-- Historique complet -->
        ${l.Note_initiale ? `
        <details style="margin-bottom:12px">
          <summary style="font-size:12px;font-weight:600;color:var(--c-text-2);cursor:pointer;padding:4px 0">📋 Historique complet</summary>
          <div style="margin-top:6px;font-size:12px;line-height:1.6;white-space:pre-wrap;color:var(--c-text-2);padding:8px;background:var(--c-bg);border-radius:var(--radius-sm);border:1px solid var(--c-border)">${String(l.Note_initiale).replace(/</g,'&lt;')}</div>
        </details>` : ''}

        ${peutAssigner ? `
        <label style="margin-bottom:8px">Attribuer à un CDS
          <select id="attr-cds" onchange="VuePipeline.attribuer('${l.ID_Prospect}', this.value)">
            <option value="">— choisir —</option>
            ${cdsList.map(c => `<option value="${c.pin}" ${Number(l.PIN_CDS_Assigne) === c.pin ? 'selected' : ''}>${this._nomCDS(c.pin)}</option>`).join('')}
          </select>
        </label>` : ''}

        ${peutEditer ? `
        <label style="margin-bottom:6px">Avancer dans le pipeline</label>
        <div class="q-chips" style="flex-wrap:wrap">
          ${this.STATUTS.filter(s => s.id !== l._statut && s.id !== 'ARCHIVE').map(s => `
            <button type="button" class="q-chip" onclick="VuePipeline.deplacer('${l.ID_Prospect}','${s.id}')">${s.lbl}</button>`).join('')}
          <button type="button" class="q-chip" style="background:var(--c-text-2)" onclick="VuePipeline.deplacer('${l.ID_Prospect}','ARCHIVE')">🗄 Archiver</button>
        </div>` : ''}

        <!-- IA Gemini — slots T01/T02/T04/T05 -->
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--c-border)">
          <div style="font-size:11px;color:var(--c-text-2);margin-bottom:6px;font-weight:700;letter-spacing:.04em">✨ ASSISTANT IA GEMINI</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button class="btn-secondaire" style="font-size:12px;padding:8px;text-align:left"
                    onclick="VuePipeline.iaAppeler('T01','${l.ID_Prospect}')">🔍 Analyser</button>
            <button class="btn-secondaire" style="font-size:12px;padding:8px;text-align:left"
                    onclick="VuePipeline.iaAppeler('T02','${l.ID_Prospect}')">📋 Préparer visite</button>
            <button class="btn-secondaire" style="font-size:12px;padding:8px;text-align:left"
                    onclick="VuePipeline.iaAppeler('T04','${l.ID_Prospect}')">✉️ Email prospect</button>
            <button class="btn-secondaire" style="font-size:12px;padding:8px;text-align:left"
                    onclick="VuePipeline.iaAppeler('T05','${l.ID_Prospect}')">📝 Résumé CR</button>
          </div>
          <div id="ia-zone"
               style="display:none;margin-top:10px;font-size:12px;line-height:1.6;
                      padding:10px 12px;background:var(--c-bg);border-radius:var(--radius-sm);
                      white-space:pre-wrap;border:1px solid var(--c-border);color:var(--c-text)"></div>
        </div>

        <div class="modal-btns" style="flex-wrap:wrap;gap:8px">
          <button type="button" onclick="VuePipeline.fermerModal()">Fermer</button>
          ${/* BLOC 4.2 — bouton suppression avec contrôle d'accès */
            (Session.estManager() || Session.estChannel() || Number(l.PIN_CDS_Assigne) === Session.pin)
            ? `<button type="button"
                style="background:var(--c-danger,#e53935);color:#fff;border:none;border-radius:var(--radius-sm);padding:10px 18px;cursor:pointer;font-size:13px"
                onclick="VuePipeline.supprimerLead('${l.ID_Prospect}')">🗑 Supprimer</button>`
            : ''}
          <button type="button" class="btn-primaire" onclick="Router.aller('#/phoning')">📞 Planifier appel</button>
        </div>
      </div>
    </div>`;
  },

  async mettreAJourLead(id) {
    const noteTexte = (document.getElementById('lead-note')?.value || '').trim();
    const date      = document.getElementById('lead-date-action')?.value || '';
    const flag      = document.getElementById('lead-flag')?.value || '';
    const nouveauStatut = document.getElementById('lead-statut-select')?.value || '';
    const lead = this.state.leads.find(l => String(l.ID_Prospect) === String(id));
    if (!lead) return;

    // Construire l'entrée de log datée
    const jourStr = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const entreeLog = `[${jourStr} — ${Session.nom}] ${this._labelFlag(flag)}${noteTexte ? ' : ' + noteTexte : ''}`;
    const noteFinale = entreeLog + (lead.Note_initiale ? '\n---\n' + lead.Note_initiale : '');

    const champs = {
      Note_initiale: noteFinale,
      Date_prochaine_action: date,
      FLAG_ACTION: flag,
    };

    if (nouveauStatut && nouveauStatut !== lead._statut) {
      champs.STATUT_EMPOWER = nouveauStatut;
      if (nouveauStatut === 'COMPTE_CREE' && !lead.WELCOME_PACK_DATE) champs.WELCOME_PACK_DATE = dateISOLocale();
      if (nouveauStatut === 'INTEGRE') {
        champs.Flag_converti = 'TRUE';
        if (!lead.PREMIERE_COMMANDE_DATE) champs.PREMIERE_COMMANDE_DATE = dateISOLocale();
      }
    }

    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', id, champs);
      Object.assign(lead, champs);
      if (nouveauStatut) lead._statut = nouveauStatut;
      this.state.modal = null;
      Toast.afficher(`✅ ${lead.Nom_Compte} mis à jour`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  // ── BLOC 4.2 — Suppression douce d'un lead ──────────────────
  // Droits : CDS = ses propres leads / ADMIN + CHANNEL_MANAGER = tous
  async supprimerLead(id) {
    const lead = this.state.leads.find(l => String(l.ID_Prospect) === String(id));
    if (!lead) return;

    // Contrôle accès côté front (le backend re-vérifie aussi)
    const peutSuppr = Session.estManager() || Session.estChannel()
                   || Number(lead.PIN_CDS_Assigne) === Session.pin;
    if (!peutSuppr) { Toast.afficher('❌ Droits insuffisants', 'erreur'); return; }

    const ok = confirm(`Confirmer la suppression de "${lead.Nom_Compte}" ?\n\nCette action est irréversible.`);
    if (!ok) return;

    try {
      const r = await fetch(SheetsAPI.BASE_URL, {
        method: 'POST', redirect: 'follow',
        body: JSON.stringify({ action: 'supprimerLead', token: SheetsAPI.TOKEN, id }),
      }).then(x => x.json());
      if (!r.ok) throw new Error(r.erreur);
      // Retirer du state local immédiatement
      this.state.leads = this.state.leads.filter(l => String(l.ID_Prospect) !== String(id));
      this.state.modal = null;
      await SheetsAPI.viderCache('EMPOWER_MDB', '📋_PROSPECTS');
      Toast.afficher(`🗑 ${lead.Nom_Compte} supprimé`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },
  // ── Module 8 : Alerte sans activité >7 jours ──
  _alerteSansActivite(l) {
    // Alerte uniquement sur les leads EN_COURS ou ASSIGNE (pas ARCHIVE/INTEGRE)
    if (['ARCHIVE', 'INTEGRE', 'SAISIE'].includes(l._statut)) return false;
    const ref = l.Date_prochaine_action || l.Timestamp || l.Date_Import;
    if (!ref) return true;
    return (Date.now() - new Date(ref).getTime()) / 86400000 > 7;
  },

  // ── Module 9 : Export Excel ADMIN + CHANNEL_MANAGER ──
  ouvrirExport()  { this.state.exportOuvert = true; this.render(); },
  fermerExport()  { this.state.exportOuvert = false; this.render(); },

  _colonnesExport() {
    return [
      { key: 'Nom_Compte',          label: 'Nom',          cat: 'Identité' },
      { key: 'Ville',               label: 'Ville',        cat: 'Identité' },
      { key: 'CANAL',               label: 'Canal',        cat: 'Identité' },
      { key: 'POTENTIEL',           label: 'Potentiel',    cat: 'Scoring' },
      { key: 'STATUT_EMPOWER',      label: 'Statut',       cat: 'Pipeline' },
      { key: 'FLAG_ACTION',         label: 'Flag action',  cat: 'Pipeline' },
      { key: '_cdsNom',             label: 'CDS',          cat: 'Pipeline' },
      { key: 'Date_prochaine_action', label: 'Prochaine action', cat: 'Activité' },
      { key: 'Note_initiale',       label: 'Notes',        cat: 'Activité' },
      { key: 'WELCOME_PACK_DATE',   label: 'Welcome Pack', cat: 'Activité' },
      { key: 'PREMIERE_COMMANDE_DATE', label: 'Première commande', cat: 'Résultats' },
      { key: 'ORIGINE',             label: 'Origine',      cat: 'Identité' },
      { key: 'Timestamp',           label: 'Date création', cat: 'Identité' },
    ];
  },

  exporterExcel() {
    if (typeof XLSX === 'undefined') {
      Toast.afficher('❌ Bibliothèque Excel non chargée (SheetJS)', 'erreur');
      return;
    }
    const f = this.state.exportFiltres;
    const colonnes = this._colonnesExport();
    const colonnesActives = document.querySelectorAll('#export-col-chk:checked');
    const colKeys = new Set(colonnesActives.length
      ? [...colonnesActives].map(el => el.value)
      : colonnes.map(c => c.key));

    let data = [...this.state.leads];
    if (f.debut) data = data.filter(l => (l.Timestamp||l.Date_Import||'').slice(0,10) >= f.debut);
    if (f.fin)   data = data.filter(l => (l.Timestamp||l.Date_Import||'').slice(0,10) <= f.fin);

    if (!data.length) { Toast.afficher('Aucun lead pour cette période', 'warning'); return; }

    const header = colonnes.filter(c => colKeys.has(c.key)).map(c => c.label);
    const rows = data.map(l => {
      const enriched = { ...l, _cdsNom: this._nomCDS(l.PIN_CDS_Assigne) };
      return colonnes.filter(c => colKeys.has(c.key)).map(c => {
        const v = enriched[c.key];
        if (v === undefined || v === null || v === '') return '';
        if (c.key.startsWith('Date') || c.key.endsWith('_DATE') || c.key === 'Timestamp') {
          const d = new Date(v);
          return isNaN(d.getTime()) ? v : d.toLocaleDateString('fr-FR');
        }
        return String(v);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    const today = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `EMPOWER_Leads_${today}.xlsx`);
    this.fermerExport();
    Toast.afficher('✅ Export Excel téléchargé', 'succes');
  },

  _renderPanneauExport() {
    if (!this.state.exportOuvert) return '';
    const f = this.state.exportFiltres;
    const colonnes = this._colonnesExport();
    const cats = [...new Set(colonnes.map(c => c.cat))];
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePipeline.fermerExport()">
      <div class="modal" style="max-width:440px">
        <h3>📥 Export Excel — EMPOWER Leads</h3>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <label style="flex:1">Date début
            <input type="date" value="${f.debut}" onchange="VuePipeline.state.exportFiltres.debut=this.value;VuePipeline.render()"/></label>
          <label style="flex:1">Date fin
            <input type="date" value="${f.fin}" onchange="VuePipeline.state.exportFiltres.fin=this.value;VuePipeline.render()"/></label>
        </div>
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:700;color:var(--c-text-2);margin-bottom:8px;text-transform:uppercase">Colonnes à exporter</div>
          ${cats.map(cat => `
          <div style="margin-bottom:6px">
            <div style="font-size:11px;color:var(--c-text-2);margin-bottom:4px">${cat}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${colonnes.filter(c => c.cat === cat).map(c => `
              <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:3px 8px;border:1px solid var(--c-border);border-radius:4px;background:var(--c-bg)">
                <input type="checkbox" id="export-col-chk" value="${c.key}" checked style="margin:0"/> ${c.label}
              </label>`).join('')}
            </div>
          </div>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--c-text-2);margin-bottom:10px;padding:8px;background:var(--c-bg);border-radius:var(--radius-sm)">
          ${this.state.leads.length} lead(s) total · CDS: non visible dans ce rôle
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondaire" style="flex:1" onclick="VuePipeline.fermerExport()">Annuler</button>
          <button class="btn-primaire" style="flex:2;background:var(--c-success)" onclick="VuePipeline.exporterExcel()">📥 Télécharger .xlsx</button>
        </div>
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px;text-align:center">Export côté client · aucune donnée envoyée au serveur</p>
      </div>
    </div>`;
  },

};