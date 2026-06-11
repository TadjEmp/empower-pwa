// ═══════════════════════════════════════
//  vue-objectifs.js — SUIVI DES OBJECTIFS V2.1 (B6)
//  Sources : 🎯_OBJECTIFS_PRIMES · ⚙️_PARAMS
//  Manager : saisie CA réalisé par CDS · mise à jour en direct
// ═══════════════════════════════════════

window.VueObjectifs = {

  state: {
    chargement: true, erreur: null,
    objectifs: [], params: {},
    quarter: null, semaine: null,
    modalSaisie: false,
    formSaisie: {},   // { [ID_Objectif]: montant_saisi }
    saving: false,
  },

  async init() {
    this.state.chargement = true;
    this.state.erreur = null;
    this.render();
    try {
      const [objectifs, params] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
      ]);
      const paramMap = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
      this.state.objectifs  = objectifs;
      this.state.params     = paramMap;
      this.state.quarter    = paramMap.QuarterActif || 'Q1';
      this.state.semaine    = getISOWeek();
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      this.state.erreur = e.message;
      this.render();
    }
  },

  _donneesCDS(pin) {
    const q = this.state.quarter;
    const o = this.state.objectifs.find(x => Number(x.PIN_CDS) === pin) || {};
    const ca  = parseAmount(o[`${q}_CA_Realise`] || 0);
    const obj = parseAmount(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`] || 0);
    const pct = obj > 0 ? Math.round(ca / obj * 100) : 0;
    const numSem   = parseInt((this.state.semaine || 'S01').replace('S', ''), 10) || 1;
    const semDansQ = Math.min(numSem, 13);
    const projection = semDansQ > 0 ? Math.round(ca / semDansQ * 13) : 0;
    const ecart = obj - ca;
    const pace  = pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK';
    return { ca, obj, pct, projection, ecart, pace, id: o.ID_Objectif || '' };
  },

  _barreProgression(pct, pace) {
    const couleur = pace === 'ON_TRACK' ? 'var(--c-success)' : pace === 'WATCH' ? 'var(--c-warning)' : 'var(--c-danger)';
    return `<div style="height:8px;background:var(--c-border);border-radius:4px;overflow:hidden;margin-top:6px">
      <div style="height:100%;width:${Math.min(pct, 100)}%;background:${couleur};transition:width .4s ease"></div>
    </div>`;
  },

  // ── Ouvrir modal saisie sell-in (Manager uniquement) ──
  ouvrirModalSaisie() {
    const q   = this.state.quarter;
    const frm = {};
    this.state.objectifs.forEach(o => {
      frm[o.ID_Objectif] = parseAmount(o[`${q}_CA_Realise`] || 0);
    });
    this.state.formSaisie = frm;
    this.state.modalSaisie = true;
    this.render();
  },
  fermerModalSaisie() { this.state.modalSaisie = false; this.render(); },

  async sauvegarderSaisie(e) {
    e.preventDefault();
    if (this.state.saving) return;
    this.state.saving = true;
    const q   = this.state.quarter;
    const champ = `${q}_CA_Realise`;
    let ok = 0, err = 0;
    try {
      for (const [id, montant] of Object.entries(this.state.formSaisie)) {
        const valeur = parseAmount(montant);
        try {
          await SheetsAPI.mettreAJour('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES', id, { [champ]: valeur });
          // Mettre à jour en mémoire
          const ligne = this.state.objectifs.find(o => o.ID_Objectif === id);
          if (ligne) ligne[champ] = valeur;
          ok++;
        } catch { err++; }
      }
      Toast.afficher(err === 0
        ? `✅ ${ok} objectif(s) mis à jour`
        : `⚠️ ${ok} OK · ${err} erreur(s)`,
        err === 0 ? 'succes' : 'warning');
    } finally {
      this.state.saving    = false;
      this.state.modalSaisie = false;
      this.render();
    }
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement des objectifs…</div>';
      return;
    }
    if (this.state.erreur) {
      app.innerHTML = `<div class="erreur">Erreur : ${this.state.erreur}
        <br><br><button class="btn-secondaire" onclick="VueObjectifs.init()">Réessayer</button></div>`;
      return;
    }

    const q          = this.state.quarter;
    const estManager = Session.voitTout();

    const renderCDS = (pin, nom) => {
      const d = this._donneesCDS(pin);
      const PACE_LBL = { ON_TRACK: '🟢 ON TRACK', WATCH: '🟡 WATCH', AT_RISK: '🔴 AT RISK' };
      return `
        <div class="bloc-fiche">
          ${nom ? `<div class="bloc-titre">${nom}
            <span class="pace-badge ${d.pace === 'ON_TRACK' ? 'pace-ok' : d.pace === 'WATCH' ? 'pace-watch' : 'pace-risk'}">${PACE_LBL[d.pace]}</span>
          </div>` : ''}
          <div class="pace-chiffres">
            <strong>${formatEUR(d.ca)}</strong>
            <span>/ ${formatEUR(d.obj)} — ${q}</span>
          </div>
          ${this._barreProgression(d.pct, d.pace)}
          <div style="display:flex;gap:12px;margin-top:10px;flex-wrap:wrap">
            <div class="stat-mini"><div>${d.pct}%</div><div>Atteinte</div></div>
            <div class="stat-mini"><div>${formatEUR(d.projection)}</div><div>Projection Q1</div></div>
            <div class="stat-mini" style="color:${d.ecart > 0 ? 'var(--c-danger)' : 'var(--c-success)'}">
              <div>${d.ecart > 0 ? '-' : '+'}${formatEUR(Math.abs(d.ecart))}</div>
              <div>Écart</div>
            </div>
          </div>
        </div>`;
    };

    let corps = '';
    if (estManager) {
      const CDS      = this.state.objectifs.map(o => ({ pin: Number(o.PIN_CDS), nom: o.Nom_CDS }));
      const totalCA  = CDS.reduce((s, c) => s + this._donneesCDS(c.pin).ca,  0);
      const totalObj = CDS.reduce((s, c) => s + this._donneesCDS(c.pin).obj, 0);
      const pctTotal = totalObj > 0 ? Math.round(totalCA / totalObj * 100) : 0;
      const paceTotal = pctTotal >= 100 ? 'ON_TRACK' : pctTotal >= 80 ? 'WATCH' : 'AT_RISK';
      corps = `
        <div class="bloc-fiche">
          <div class="bloc-titre">Équipe — ${q}
            <span class="pace-badge ${paceTotal === 'ON_TRACK' ? 'pace-ok' : paceTotal === 'WATCH' ? 'pace-watch' : 'pace-risk'}">${pctTotal}%</span>
            <button class="btn-lien" style="margin-left:auto;font-size:13px" onclick="VueObjectifs.ouvrirModalSaisie()">
              📥 Saisir CA Réalisé
            </button>
          </div>
          <div class="pace-chiffres"><strong>${formatEUR(totalCA)}</strong><span>/ ${formatEUR(totalObj)}</span></div>
          ${this._barreProgression(pctTotal, paceTotal)}
        </div>
        ${CDS.map(c => renderCDS(c.pin, c.nom)).join('')}
      `;
    } else {
      corps = renderCDS(Session.pin, null);
    }

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Suivi des Objectifs</h1>
        <span class="badge-compteur">${q} · ${this.state.semaine}</span>
      </header>
      <div class="avec-nav dash-body" style="padding:12px">
        <p style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">
          Quarter actif : <strong>${q}</strong> FY27 · ${this.state.semaine}
        </p>
        ${corps}
      </div>
      ${NavBar('objectifs')}
      ${this._renderModal()}
    `;
  },

  _renderModal() {
    if (!this.state.modalSaisie) return '';
    const q    = this.state.quarter;
    const rows = this.state.objectifs.map(o => {
      const id  = o.ID_Objectif;
      const val = this.state.formSaisie[id] ?? '';
      return `
        <label style="flex-direction:row;align-items:center;gap:10px;margin-bottom:10px">
          <span style="min-width:90px;font-weight:600">${o.Nom_CDS}</span>
          <input type="number" min="0" step="0.01" placeholder="0.00"
                 value="${val}"
                 oninput="VueObjectifs.state.formSaisie['${id}']=this.value"
                 style="flex:1;padding:8px 10px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);font-size:14px"/>
          <span style="font-size:11px;color:var(--c-text-2)">€</span>
        </label>`;
    }).join('');

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueObjectifs.fermerModalSaisie()">
      <div class="modal">
        <h3>📥 Saisir CA Réalisé — ${q} FY27</h3>
        <p style="font-size:12px;color:var(--c-text-2);margin-bottom:14px">
          Saisissez le CA réalisé cumulé (€) par CDS pour le quarter ${q}.
          Source : SELL IN W${new Date().toISOString().slice(0,10).split('-')[1] || ''}.
        </p>
        <form onsubmit="VueObjectifs.sauvegarderSaisie(event)">
          ${rows}
          <div class="modal-btns">
            <button type="button" onclick="VueObjectifs.fermerModalSaisie()">Annuler</button>
            <button type="submit" class="btn-primaire" ${this.state.saving ? 'disabled' : ''}>
              ${this.state.saving ? '⏳ Enregistrement…' : '💾 Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>`;
  },
};
