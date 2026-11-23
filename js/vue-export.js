// ═══════════════════════════════════════════════════════════════════════
//  vue-export.js : export Excel de la base comptes et du Tracker, avec choix des colonnes
//  Écran « Administration > Export » (ADMIN, CHANNEL_MANAGER, EXTERNE). Lecture seule.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  const KEY = 'esi_export_cols_v1';
  const E = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ca = v => (window.parseCA ? window.parseCA(v) : Number(v)) || 0;
  const dateFr = v => { if (!v) return ''; const d = new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR'); };
  const LIBST = { actif: 'Actif', a_reactiver: 'À réactiver', silencieux: 'Silencieux' };

  const COLS = {
    comptes: [
      { id: 'id', lib: 'Réf. compte', def: true, val: c => c.ID_Compte },
      { id: 'nom', lib: 'Nom du compte', def: true, val: c => c.Nom_Compte },
      { id: 'adresse', lib: 'Adresse', def: true, val: c => c.Adresse },
      { id: 'cp', lib: 'Code postal', def: true, val: c => c.Code_Postal },
      { id: 'ville', lib: 'Ville', def: true, val: c => c.Ville },
      { id: 'dep', lib: 'Département', val: c => c.Departement },
      { id: 'tel', lib: 'Téléphone', def: true, val: c => c.Tel },
      { id: 'email', lib: 'E-mail', def: true, val: c => c.Email },
      { id: 'contact', lib: 'Nom du contact', val: c => c.Contact_Nom },
      { id: 'fonction', lib: 'Fonction du contact', val: c => c.Contact_Fonction },
      { id: 'site', lib: 'Site web', val: c => c.Site_Web },
      { id: 'canal', lib: 'Canal', def: true, val: c => c.CANAL },
      { id: 'secteur', lib: 'Secteur', val: c => c.SECTEUR },
      { id: 'empower', lib: 'Empower', def: true, val: c => (window.estEmpower && window.estEmpower(c)) ? 'Oui' : 'Non' },
      { id: 'statut', lib: 'Statut (selon commandes)', def: true, val: c => LIBST[window.getStatutCompte(c)] },
      { id: 'fy25', lib: 'CA FY25', def: true, num: true, val: c => ca(c.CA_FY25) },
      { id: 'fy26', lib: 'CA FY26', def: true, num: true, val: c => ca(c.CA_FY26) },
      { id: 'fy27', lib: 'CA FY27 (cumul)', def: true, num: true, val: c => window.caFY27Cumul(c) || 0 },
      { id: 'q1', lib: 'CA Q1 FY27', num: true, val: c => ca(c.CA_Q1FY27) },
      { id: 'q2', lib: 'CA Q2 FY27', num: true, val: c => ca(c.CA_Q2FY27) },
      { id: 'q3', lib: 'CA Q3 FY27', num: true, val: c => ca(c.CA_Q3FY27) },
      { id: 'q4', lib: 'CA Q4 FY27', num: true, val: c => ca(c.CA_Q4FY27) },
      { id: 'cds', lib: 'Commercial', val: c => window.resolveCDS && window.resolveCDS(c.PIN_CDS_Assigne) !== 'n.c.' ? window.resolveCDS(c.PIN_CDS_Assigne) : '' },
      { id: 'temp', lib: 'Température', val: c => window.CT ? CT.libTemp(CT.tempOf(c)) : '' },
      { id: 'structures', lib: 'Structures et contacts', val: (c, ctx) => ctx.ctResume ? ctx.ctResume('compte', c.ID_Compte) : '' },
      { id: 'tracker', lib: 'Au Tracker', def: true, val: (c, ctx) => ctx.trackerIds.has(String(c.ID_Compte || '')) ? 'Oui' : 'Non' },
    ],
    tracker: [
      { id: 'ref', lib: 'Réf. ESI', def: true, val: l => l.ID_Prospect },
      { id: 'nom', lib: 'Nom du compte', def: true, val: l => l.Nom_Compte },
      { id: 'adresse', lib: 'Adresse', def: true, val: l => l.Adresse },
      { id: 'cp', lib: 'Code postal', def: true, val: l => l.Code_Postal },
      { id: 'ville', lib: 'Ville', def: true, val: l => l.Ville },
      { id: 'contact', lib: 'Nom du contact', def: true, val: l => l.CONTACT_NOM },
      { id: 'fonction', lib: 'Fonction', val: l => l.CONTACT_FONCTION },
      { id: 'tel', lib: 'Téléphone', def: true, val: l => l.Tel },
      { id: 'email', lib: 'E-mail', def: true, val: l => l.Email },
      { id: 'canal', lib: 'Canal', def: true, val: l => l.CANAL },
      { id: 'potentiel', lib: 'Potentiel', def: true, val: l => l.POTENTIEL },
      { id: 'temp', lib: 'Température', val: l => window.CT ? CT.libTemp(CT.tempOf(l)) : '' },
      { id: 'structures', lib: 'Structures et contacts', val: (l, ctx) => ctx.ctResume ? ctx.ctResume('lead', l.ID_Prospect) : '' },
      { id: 'origine', lib: 'Origine', val: l => l.ORIGINE },
      { id: 'note', lib: 'Note initiale', val: l => l.Note_initiale },
      { id: 'statut', lib: 'Statut', def: true, val: l => l.STATUT_EMPOWER },
      { id: 'cds', lib: 'Commercial assigné', def: true, val: l => l.PIN_CDS_Assigne && window.resolveCDS ? window.resolveCDS(l.PIN_CDS_Assigne) : '' },
      { id: 'saisie', lib: 'Date de saisie', val: l => dateFr(l.Date_Import || l.Timestamp) },
      { id: 'attribution', lib: "Date d'attribution", val: l => dateFr(l.Date_Attribution) },
      { id: 'prochaine', lib: 'Prochaine action', val: l => dateFr(l.Date_prochaine_action) },
      { id: 'derniere', lib: 'Dernière action', val: l => dateFr(l.Date_Derniere_Action) },
      { id: 'creation', lib: 'Compte créé le', val: l => dateFr(l.Date_Creation_Compte) },
      { id: 'integre', lib: 'Intégré le', val: l => dateFr(l.Date_Integration) },
      { id: 'motif', lib: "Motif d'archivage", val: l => l.Motif_Archive },
    ],
  };

  const V = window.VueExportBase = {
    state: { source: 'comptes', choix: { comptes: null, tracker: null }, comptes: [], leads: [], trackerIds: new Set(), charge: false, erreur: '', enCours: false },

    _choix(src) {
      const s = this.state;
      if (!s.choix[src]) s.choix[src] = new Set(COLS[src].filter(c => c.def).map(c => c.id));
      return s.choix[src];
    },
    _memoriser() {
      try { localStorage.setItem(KEY, JSON.stringify({ comptes: [...this._choix('comptes')], tracker: [...this._choix('tracker')], source: this.state.source })); } catch (e) { /* mémoire locale indisponible */ }
    },
    _restaurer() {
      try {
        const m = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!m) return;
        ['comptes', 'tracker'].forEach(k => { if (Array.isArray(m[k])) this.state.choix[k] = new Set(m[k].filter(id => COLS[k].some(c => c.id === id))); });
        if (m.source === 'comptes' || m.source === 'tracker') this.state.source = m.source;
      } catch (e) { /* ignoré */ }
    },

    async init() {
      this._restaurer();
      this.state.charge = false; this.state.erreur = '';
      this.render();
      try {
        const [comptes, leads] = await Promise.all([
          SheetsAPI.lire('EMPOWER_MDB', 'COMPTES', { nocache: true }),
          SheetsAPI.lire('EMPOWER_MDB', 'LEADS', { nocache: true }).catch(() => []),
        ]);
        let cs = (comptes || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE');
        let afficher = false;
        try { afficher = await SheetsAPI.afficherLeclerc(); } catch (e) { /* masqué par défaut */ }
        if (!afficher) cs = cs.filter(c => !/leclerc/i.test(String(c.Nom_Compte || '')));
        this.state.comptes = cs;
        this.state.leads = leads || [];
        this.state.trackerIds = new Set(this.state.leads.filter(l => String(l.STATUT_EMPOWER || '').toUpperCase() !== 'ARCHIVE').map(l => String(l.ID_Compte_Gas || '')).filter(Boolean));
        this.state.charge = true;
      } catch (e) { this.state.erreur = e.message || String(e); }
      this.render();
    },

    setSource(s) { this.state.source = s; this._memoriser(); this.render(); },
    basculer(id) { const c = this._choix(this.state.source); c.has(id) ? c.delete(id) : c.add(id); this._memoriser(); this.render(); },
    tout(v) { const src = this.state.source, c = this._choix(src); c.clear(); if (v) COLS[src].forEach(x => c.add(x.id)); this._memoriser(); this.render(); },

    async exporter() {
      const s = this.state, src = s.source, cols = COLS[src].filter(c => this._choix(src).has(c.id));
      if (!cols.length) { Toast.afficher('Choisissez au moins une colonne', 'erreur'); return; }
      if (!window.XLSX) { Toast.afficher('Bibliothèque Excel indisponible (connexion requise)', 'erreur'); return; }
      const lignes = src === 'comptes' ? s.comptes : s.leads;
      const ctx = { trackerIds: s.trackerIds };
      // Lot 8 : résumé « structures et contacts » (une lecture groupée, seulement si la colonne est cochée et la migration appliquée)
      if (window.CT && CT.actif() && cols.some(c => c.id === 'structures')) { try { ctx.ctResume = await CT.resumes(); } catch (e) { /* colonne laissée vide */ } }
      const data = lignes.map(r => { const o = {}; cols.forEach(c => { const v = c.val(r, ctx); o[c.lib] = v == null ? '' : v; }); return o; });
      const ws = XLSX.utils.json_to_sheet(data, { header: cols.map(c => c.lib) });
      ws['!cols'] = cols.map(c => ({ wch: Math.max(c.lib.length + 2, c.num ? 12 : 18) }));
      if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, src === 'comptes' ? 'Base comptes' : 'Base Tracker');
      const d = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `ESI_${src === 'comptes' ? 'base_comptes' : 'base_tracker'}_${d}.xlsx`);
      Toast.afficher(`${data.length} lignes exportées (${cols.length} colonnes)`, 'succes');
    },

    render() {
      const app = document.getElementById('app'); if (!app) return;
      const s = this.state, src = s.source, ch = this._choix(src);
      const nb = src === 'comptes' ? s.comptes.length : s.leads.length;
      const blocCols = COLS[src].map(c => `<label class="export-col"><input type="checkbox" ${ch.has(c.id) ? 'checked' : ''} onchange="VueExportBase.basculer('${c.id}')"> ${E(c.lib)}</label>`).join('');
      app.innerHTML = `
        <header class="header-vue">
          <button onclick="Router.retour()" class="btn-retour">←</button>
          <h1>Export des données</h1>
        </header>
        <div class="dash-body avec-nav"><div class="dash-col-main">
          <div class="bloc-fiche">
            <div class="bloc-titre">Quelle base exporter ?</div>
            <div class="filtres-flags" style="gap:8px;flex-wrap:wrap">
              <button class="btn-filtre ${src === 'comptes' ? 'actif' : ''}" onclick="VueExportBase.setSource('comptes')">Base comptes</button>
              <button class="btn-filtre ${src === 'tracker' ? 'actif' : ''}" onclick="VueExportBase.setSource('tracker')">Base Tracker</button>
            </div>
            <p style="font-size:12px;color:var(--c-text-2);margin:8px 0 0">${s.charge ? `${nb} lignes disponibles pour votre profil.` : (s.erreur ? 'Chargement impossible : ' + E(s.erreur) : 'Chargement…')}</p>
          </div>
          <div class="bloc-fiche">
            <div class="bloc-titre">Colonnes à inclure (${ch.size}/${COLS[src].length})</div>
            <div style="display:flex;gap:8px;margin-bottom:10px">
              <button class="btn-filtre" onclick="VueExportBase.tout(true)">Tout cocher</button>
              <button class="btn-filtre" onclick="VueExportBase.tout(false)">Tout décocher</button>
            </div>
            <div class="export-cols">${blocCols}</div>
          </div>
          <button class="btn-primaire export-go" ${s.charge ? '' : 'disabled'} onclick="VueExportBase.exporter()">Exporter en Excel</button>
        </div></div>
        ${NavBar('admin')}
      `;
    },
  };
})();
