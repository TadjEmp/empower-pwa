// ═══════════════════════════════════════
//  vue-visites.js — Module VISITES V2.1
//  Sous-vues : planning (vue jour/semaine) · cr (compte-rendu)
//  Flux nominal : Planifier → Planning → Sélectionner → Compte-rendu
//  Source : 🗺️_VISITES (Statut_Visite : planifiée/réalisée/reportée/annulée)
//  Implémentation complète : B5 — stub fonctionnel B1
// ═══════════════════════════════════════

window.VueVisites = {

  STATUTS: ['planifiée', 'réalisée', 'reportée', 'annulée'],
  STATUT_COULEURS: {
    'planifiée': 'var(--c-primary)',
    'réalisée':  'var(--c-success)',
    'reportée':  'var(--c-warning)',
    'annulée':   'var(--c-text-2)',
  },

  state: {
    sousVue: 'planning',   // planning | cr
    visites: [],
    chargement: true,
    erreur: null,
    dateVue: null,         // date affichée (ISO string)
    modeVue: 'jour',       // jour | semaine
    visitePlanifiee: null, // visite sélectionnée pour le CR
    modalPlanif: false,    // modal "planifier une visite"
    comptes: [],
    prospects: [],
    formPlanif: {},
  },

  async init(sousVue = 'planning', param = null) {
    this.state.sousVue = sousVue;
    this.state.visitePlanifiee = param ? this._trouverVisite(param) : null;
    this.state.chargement = true;
    this.state.dateVue = this.state.dateVue || new Date().toISOString().slice(0, 10);
    this._resetFormPlanif();
    this.render();

    try {
      const [visites, comptes, prospects] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES'),
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
      ]);
      this.state.visites   = visites.filter(v => Session.voitTout() || Number(v.PIN_CDS) === Session.pin);
      this.state.comptes   = comptes.filter(c => Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin);
      this.state.prospects = prospects.filter(p => Session.voitTout() || Number(p.PIN_CDS_Assigne) === Session.pin);

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

  _resetFormPlanif() {
    const now = new Date();
    this.state.formPlanif = {
      date:  now.toISOString().slice(0, 10),
      heure: '09:00',
      typeVisite: 'SUIVI_ACTIF',
      idCible: '', nomCible: '',
      commentairePrep: '',
      prochaineEtape: '',
    };
  },

  // ── Visites du jour sélectionné ──
  get visitesJour() {
    return this.state.visites
      .filter(v => (v.Date || v.Date_Planif || '').slice(0, 10) === this.state.dateVue)
      .sort((a, b) => (a.Heure || '').localeCompare(b.Heure || ''));
  },

  // ── Visites de la semaine (lundi → dimanche) ──
  get visitesSemaine() {
    const d = new Date(this.state.dateVue);
    const lundi = new Date(d);
    lundi.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const jours = Array.from({ length: 7 }, (_, i) => {
      const j = new Date(lundi);
      j.setDate(lundi.getDate() + i);
      return j.toISOString().slice(0, 10);
    });
    return jours.map(iso => ({
      iso,
      label: new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
      visites: this.state.visites
        .filter(v => (v.Date || v.Date_Planif || '').slice(0, 10) === iso)
        .sort((a, b) => (a.Heure || '').localeCompare(b.Heure || '')),
    }));
  },

  get nbPlanifAujourdHui() {
    const today = new Date().toISOString().slice(0, 10);
    return this.state.visites.filter(v =>
      (v.Date || v.Date_Planif || '').slice(0, 10) === today &&
      (v.Statut_Visite || 'planifiée') === 'planifiée'
    ).length;
  },

  // ── Navigation dates ──
  jourPrecedent() {
    const d = new Date(this.state.dateVue);
    d.setDate(d.getDate() - (this.state.modeVue === 'semaine' ? 7 : 1));
    this.state.dateVue = d.toISOString().slice(0, 10);
    this.render();
  },
  jourSuivant() {
    const d = new Date(this.state.dateVue);
    d.setDate(d.getDate() + (this.state.modeVue === 'semaine' ? 7 : 1));
    this.state.dateVue = d.toISOString().slice(0, 10);
    this.render();
  },
  allerAujourdhui() {
    this.state.dateVue = new Date().toISOString().slice(0, 10);
    this.render();
  },
  setModeVue(mode) { this.state.modeVue = mode; this.render(); },

  // ── Ouvrir compte-rendu depuis une visite planifiée ──
  ouvrirCR(idVisite) {
    const v = this.state.visites.find(x => x.ID_Visite === idVisite);
    if (!v) { Toast.afficher('Visite introuvable', 'warning'); return; }
    this.state.visitePlanifiee = v;
    // Pré-remplir le questionnaire depuis la visite planifiée
    if (window.VueQuestionnaire) {
      VueQuestionnaire.init(v.ID_Cible || null);
      VueQuestionnaire._visitePlanifiee = v;
    }
    Router.aller(`#/questionnaire${v.ID_Cible ? '/'+v.ID_Cible : ''}`);
  },

  // ── Planifier une visite ──
  ouvrirModal() { this.state.modalPlanif = true; this.render(); },
  fermerModal()  { this.state.modalPlanif = false; this.render(); },

  setCible(id, nom) {
    this.state.formPlanif.idCible  = id;
    this.state.formPlanif.nomCible = nom;
    this.render();
  },

  async planifier(e) {
    e.preventDefault();
    const f = this.state.formPlanif;
    if (!f.nomCible) { Toast.afficher('Sélectionnez un compte ou prospect', 'warning'); return; }
    try {
      const visite = {
        ID_Visite:             genId('VIS'),
        Date:                  f.date,
        Heure:                 f.heure,
        Semaine_ISO:           getISOWeek(new Date(f.date)),
        PIN_CDS:               Session.pin,
        Nom_CDS:               Session.nom,
        ID_Cible:              f.idCible,
        Nom_Compte:            f.nomCible,
        Type_Visite:           f.typeVisite,
        Statut_Visite:         'planifiée',
        Source_Visite:         'ESI_V21',
        Note_Privee:           f.commentairePrep,
        Prochaine_Action_Texte: f.prochaineEtape,
        Timestamp:             new Date().toISOString(),
      };
      await SheetsAPI.ecrire('EMPOWER_MDB', '🗺️_VISITES', visite);
      this.state.visites.unshift(visite);
      this.state.dateVue = f.date;
      this.state.modalPlanif = false;
      Toast.afficher(`✅ Visite planifiée — ${f.nomCible} le ${f.date}`, 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  // ── Synchroniser (import visites terrain réalisées) ──
  async synchroniser() {
    Toast.afficher('🔄 Synchronisation en cours…', 'info', 3000);
    try {
      await SheetsAPI.viderCache('EMPOWER_MDB', '🗺️_VISITES');
      await this.init(this.state.sousVue);
      Toast.afficher('✅ Visites synchronisées', 'succes');
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  _carteVisite(v) {
    const statut = v.Statut_Visite || 'planifiée';
    const coul   = this.STATUT_COULEURS[statut] || 'var(--c-text-2)';
    const isPlanif = statut === 'planifiée';
    return `
      <div class="carte-visite" style="border-left:4px solid ${coul}">
        <div class="cv-head">
          <span class="cv-heure">${v.Heure || '—'}</span>
          <span class="cv-statut" style="color:${coul}">${statut}</span>
        </div>
        <div class="cv-nom">${v.Nom_Compte || '—'}</div>
        ${v.Type_Visite ? `<div class="cv-type">${v.Type_Visite}</div>` : ''}
        ${(v.Note_Privee || v.Commentaire_Prep) ? `<div class="cv-note">📝 ${v.Note_Privee || v.Commentaire_Prep}</div>` : ''}
        ${isPlanif ? `
        <div class="cv-actions">
          <button class="btn-primaire" style="padding:8px 14px;font-size:13px;width:auto"
                  onclick="VueVisites.ouvrirCR('${v.ID_Visite}')">
            ✍️ Saisir compte-rendu
          </button>
        </div>` : `
        <div class="cv-actions">
          <button class="btn-secondaire" style="padding:6px 12px;font-size:12px;width:auto"
                  onclick="Router.aller('#/compte/${v.ID_Cible || ''}')">
            📋 Voir fiche
          </button>
        </div>`}
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

    const today = new Date().toISOString().slice(0, 10);
    const estAujourdHui = this.state.dateVue === today;
    const dateLbl = new Date(this.state.dateVue + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long'
    });

    let contenu = '';
    if (this.state.modeVue === 'jour') {
      const vj = this.visitesJour;
      contenu = `
        ${vj.length === 0
          ? `<div style="padding:32px;text-align:center;color:var(--c-text-2)">
               Aucune visite planifiée ce jour.<br>
               <button class="btn-secondaire" style="margin-top:16px;width:auto;padding:10px 20px"
                       onclick="VueVisites.ouvrirModal()">+ Planifier une visite</button>
             </div>`
          : vj.map(v => this._carteVisite(v)).join('')}
      `;
    } else {
      const semaine = this.visitesSemaine;
      contenu = `
        <div class="planning-semaine">
          ${semaine.map(j => `
            <div class="planning-jour ${j.iso === today ? 'planning-jour-today' : ''}"
                 onclick="VueVisites.state.dateVue='${j.iso}';VueVisites.state.modeVue='jour';VueVisites.render()">
              <div class="pj-label">${j.label}</div>
              <div class="pj-count">${j.visites.length ? j.visites.length+'v' : ''}</div>
              ${j.visites.slice(0,3).map(v => `
                <div class="pj-item" style="border-left:3px solid ${this.STATUT_COULEURS[v.Statut_Visite||'planifiée']}">
                  <span class="pj-heure">${v.Heure||'—'}</span>
                  <span class="pj-nom">${(v.Nom_Compte||'').slice(0,14)}</span>
                </div>`).join('')}
              ${j.visites.length > 3 ? `<div class="pj-plus">+${j.visites.length-3}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Visites</h1>
        <div style="display:flex;gap:6px">
          <button class="btn-retour" onclick="VueVisites.synchroniser()" title="Synchroniser">🔄</button>
          <button class="btn-retour" onclick="VueVisites.ouvrirModal()" title="Planifier">＋</button>
        </div>
      </header>

      <!-- Mode vue -->
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--c-surface);border-bottom:1px solid var(--c-border)">
        <button class="btn-filtre ${this.state.modeVue==='jour'?'actif':''}" onclick="VueVisites.setModeVue('jour')">Jour</button>
        <button class="btn-filtre ${this.state.modeVue==='semaine'?'actif':''}" onclick="VueVisites.setModeVue('semaine')">Semaine</button>
        <div style="margin-left:auto;display:flex;align-items:center;gap:6px">
          <button class="btn-retour" onclick="VueVisites.jourPrecedent()">‹</button>
          <span style="font-size:13px;font-weight:600;white-space:nowrap">${this.state.modeVue==='jour' ? dateLbl : 'Semaine en cours'}</span>
          <button class="btn-retour" onclick="VueVisites.jourSuivant()">›</button>
          ${!estAujourdHui ? `<button class="btn-filtre" style="font-size:11px;padding:4px 8px" onclick="VueVisites.allerAujourdhui()">Auj.</button>` : ''}
        </div>
      </div>

      <!-- Contenu planning -->
      <div class="avec-nav" style="padding:12px">
        ${contenu}
      </div>

      ${NavBar('visites')}
      ${this._renderModal()}
    `;
  },

  _renderModal() {
    if (!this.state.modalPlanif) return '';
    const f = this.state.formPlanif;
    const suggestions = [...this.state.comptes, ...this.state.prospects]
      .slice(0, 100)
      .map(c => `<option value="${c.ID_Compte||c.ID_Prospect}" data-nom="${c.Nom_Compte}">${c.Nom_Compte} — ${c.Ville||''}</option>`)
      .join('');

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueVisites.fermerModal()">
      <div class="modal">
        <h3>📅 Planifier une visite</h3>
        <form onsubmit="VueVisites.planifier(event)">
          <label>Compte / Prospect *
            <select id="vp-cible" required
                    onchange="VueVisites.setCible(this.value, this.options[this.selectedIndex].dataset.nom)">
              <option value="">— sélectionner —</option>
              <optgroup label="Mes comptes">${this.state.comptes.slice(0,200).map(c=>`<option value="${c.ID_Compte}" data-nom="${c.Nom_Compte}">${c.Nom_Compte}</option>`).join('')}</optgroup>
              <optgroup label="Prospects">${this.state.prospects.slice(0,100).map(p=>`<option value="${p.ID_Prospect}" data-nom="${p.Nom_Compte}">${p.Nom_Compte}</option>`).join('')}</optgroup>
            </select>
          </label>
          <div style="display:flex;gap:10px">
            <label style="flex:2">Date *
              <input type="date" required value="${f.date}" onchange="VueVisites.state.formPlanif.date=this.value"/></label>
            <label style="flex:1">Heure
              <input type="time" value="${f.heure}" onchange="VueVisites.state.formPlanif.heure=this.value"/></label>
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
            <textarea rows="2" placeholder="Points à aborder, historique…"
              oninput="VueVisites.state.formPlanif.commentairePrep=this.value">${f.commentairePrep}</textarea>
          </label>
          <label>Prochaine étape prévue
            <input placeholder="ex : présenter offre NSB" value="${f.prochaineEtape}"
                   oninput="VueVisites.state.formPlanif.prochaineEtape=this.value"/></label>
          <div class="modal-btns">
            <button type="button" onclick="VueVisites.fermerModal()">Annuler</button>
            <button type="submit" class="btn-primaire">📅 Planifier</button>
          </div>
        </form>
      </div>
    </div>`;
  },
};
