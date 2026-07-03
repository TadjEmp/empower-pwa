// ═══════════════════════════════════════
//  vue-phoning-fdv.js — Section 9 cahier des charges
//  Vue consolidée des appels de la force de vente pour Channel (lecture seule).
//  Liste des commerciaux → clic → appels classés par jour → clic → détail complet.
// ═══════════════════════════════════════

window.VuePhoningFDV = {

  state: { chargement: true, erreur: null, appels: [], commercialSelectionne: null },

  async init() {
    this.state = { chargement: true, erreur: null, appels: [], commercialSelectionne: null };
    this.render();
    try {
      const appels = await SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING');
      this.state.appels = (appels || []).filter(a => String(a.deleted || '').toUpperCase() !== 'TRUE');
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      this.state.erreur = e.message;
      this.render();
    }
  },

  _grouperParCommercial() {
    const map = new Map();
    this.state.appels.forEach(a => {
      const pin = String(a.PIN_CDS || '');
      if (!pin) return;
      if (!map.has(pin)) map.set(pin, { pin, nom: resolveCDS(a.PIN_CDS || a.Nom_CDS), appels: [] });
      map.get(pin).appels.push(a);
    });
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  },

  selectionnerCommercial(pin) { this.state.commercialSelectionne = pin; this.render(); },
  retour() { this.state.commercialSelectionne = null; this.render(); },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = `<div style="padding:20px">${skeletonListe(6)}</div>`;
      return;
    }
    if (this.state.erreur) {
      app.innerHTML = `<div class="erreur">Erreur : ${this.state.erreur}</div>`;
      return;
    }
    const pin = this.state.commercialSelectionne;
    app.innerHTML = `
      <header class="header-vue">
        ${pin ? `<button class="btn-retour" onclick="VuePhoningFDV.retour()">←</button>` : ''}
        <h1>Phoning FDV</h1>
      </header>
      <div class="dash-body avec-nav" style="padding:12px">
        ${pin ? this._renderDetailCommercial(pin) : this._renderListeCommerciaux()}
      </div>
      ${NavBar('phoning_fdv')}
    `;
  },

  _renderListeCommerciaux() {
    const groupes = this._grouperParCommercial();
    if (!groupes.length) return `<div class="vide-liste">Aucun appel enregistré par la force de vente.</div>`;
    return groupes.map(g => `
      <div class="carte-appel" style="cursor:pointer" onclick="VuePhoningFDV.selectionnerCommercial('${g.pin}')">
        <div class="cv-nom">${g.nom}</div>
        <div class="cv-type">${g.appels.length} appel${g.appels.length > 1 ? 's' : ''}</div>
      </div>`).join('');
  },

  _renderDetailCommercial(pin) {
    const g = this._grouperParCommercial().find(x => x.pin === pin);
    if (!g) return `<div class="vide-liste">Commercial introuvable.</div>`;
    const tri = [...g.appels].sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
    return `
      <p style="font-size:13px;color:var(--c-text-2);margin-bottom:10px">${g.nom} — ${tri.length} appel(s), classés par jour</p>
      ${tri.map(a => this._renderAppelDetail(a)).join('')}
    `;
  },

  _renderAppelDetail(a) {
    const nom = a.Reseller || a.Nom_Enseigne || '—';
    return `
      <details style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);margin-bottom:10px;overflow:hidden">
        <summary style="padding:11px 14px;font-size:13px;font-weight:700;cursor:pointer;color:var(--c-title);
                        list-style:none;background:var(--c-surface);display:flex;justify-content:space-between;gap:8px;align-items:center">
          <span>${nom}</span>
          <span style="font-size:11px;color:var(--c-text-2);font-weight:400;white-space:nowrap">${a.Date || '—'}</span>
        </summary>
        <div style="padding:10px 14px 14px">
          <div class="id-ligne"><span>Statut appel</span><strong>${a.Statut_Appel || '—'}</strong></div>
          <div class="id-ligne"><span>Type</span><strong>${a.Type_Appel || '—'}</strong></div>
          <div class="id-ligne"><span>Intérêt EMPOWER</span><strong>${a.Interet_EMPOWER || '—'}${a.Interet_Score ? ' (' + a.Interet_Score + '/5)' : ''}</strong></div>
          ${a.Frein_Principal ? `<div class="id-ligne"><span>Frein principal</span><strong>${a.Frein_Principal}</strong></div>` : ''}
          ${a.Prochaine_Action ? `<div class="id-ligne"><span>Prochaine action</span><strong>${a.Prochaine_Action}</strong></div>` : ''}
          ${a.Commande_Annoncee ? `<div class="id-ligne"><span>Commande annoncée</span><strong>${a.Commande_Annoncee}${a.Montant_Estime ? ' — ' + a.Montant_Estime + ' €' : ''}</strong></div>` : ''}
          ${a.Note ? `<div style="margin-top:8px;padding:8px;background:var(--c-bg);border-radius:var(--radius-sm);font-size:12px;color:var(--c-text-2)">${a.Note}</div>` : ''}
        </div>
      </details>`;
  },
};
