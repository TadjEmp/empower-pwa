// ═══════════════════════════════════════
//  vue-visites-fdv.js — Section 9 cahier des charges
//  Vue consolidée des visites de la force de vente pour Channel (lecture seule).
//  Liste des commerciaux → clic → visites classées par jour → clic → détail complet.
// ═══════════════════════════════════════

window.VueVisitesFDV = {

  state: { chargement: true, erreur: null, visites: [], commercialSelectionne: null },

  async init() {
    this.state = { chargement: true, erreur: null, visites: [], commercialSelectionne: null };
    this.render();
    try {
      const visites = await SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES');
      this.state.visites = (visites || []).filter(v => String(v.deleted || '').toUpperCase() !== 'TRUE');
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
    this.state.visites.forEach(v => {
      const pin = String(v.PIN_CDS || '');
      if (!pin) return;
      if (!map.has(pin)) map.set(pin, { pin, nom: resolveCDS(v.PIN_CDS || v.Nom_CDS), visites: [] });
      map.get(pin).visites.push(v);
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
        ${pin ? `<button class="btn-retour" onclick="VueVisitesFDV.retour()">←</button>` : ''}
        <h1>Visites FDV</h1>
      </header>
      <div class="dash-body avec-nav" style="padding:12px">
        ${pin ? this._renderDetailCommercial(pin) : this._renderListeCommerciaux()}
      </div>
      ${NavBar('visites_fdv')}
    `;
  },

  // ── Bloc 5 refonte desktop : comparatif rapide par commercial ──
  _resumeVisites(visites) {
    const norm = s => String(s || '').toLowerCase();
    const realisees = visites.filter(v => norm(v.Statut_Visite) === 'réalisée').length;
    const planifiees = visites.filter(v => ['planifiée', 'planifiee'].includes(norm(v.Statut_Visite))).length;
    const manquees = visites.filter(v => norm(v.Statut_Visite) === 'manquée').length;
    return { total: visites.length, realisees, planifiees, manquees };
  },

  _renderListeCommerciaux() {
    const groupes = this._grouperParCommercial();
    if (!groupes.length) return `<div class="vide-liste">Aucune visite enregistrée par la force de vente.</div>`;
    return groupes.map(g => {
      const r = this._resumeVisites(g.visites);
      return `
      <div class="carte-visite" style="cursor:pointer" onclick="VueVisitesFDV.selectionnerCommercial('${g.pin}')">
        <div class="cv-nom">${g.nom}</div>
        <div class="cv-type">${r.total} visite${r.total > 1 ? 's' : ''} · <span style="color:var(--c-success)">${r.realisees} réalisée${r.realisees > 1 ? 's' : ''}</span> · <span style="color:var(--c-primary)">${r.planifiees} planifiée${r.planifiees > 1 ? 's' : ''}</span>${r.manquees ? ` · <span style="color:var(--c-danger)">${r.manquees} manquée${r.manquees > 1 ? 's' : ''}</span>` : ''}</div>
      </div>`;
    }).join('');
  },

  _renderDetailCommercial(pin) {
    const g = this._grouperParCommercial().find(x => x.pin === pin);
    if (!g) return `<div class="vide-liste">Commercial introuvable.</div>`;
    const tri = [...g.visites].sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
    return `
      <p style="font-size:13px;color:var(--c-text-2);margin-bottom:10px">${g.nom} — ${tri.length} visite(s), classées par jour</p>
      ${tri.map(v => this._renderVisiteDetail(v)).join('')}
    `;
  },

  _flatJSON(val) {
    if (!val) return '';
    try {
      const p = typeof val === 'string' ? JSON.parse(val) : val;
      if (Array.isArray(p)) return p.join(', ');
      return Object.values(p || {}).filter(Boolean).join(', ');
    } catch { return String(val); }
  },

  _renderVisiteDetail(v) {
    const freins = this._flatJSON(v.Freins_JSON);
    const grossistes = this._flatJSON(v.Grossistes_JSON);
    return `
      <details style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);margin-bottom:10px;overflow:hidden">
        <summary style="padding:11px 14px;font-size:13px;font-weight:700;cursor:pointer;color:var(--c-title);
                        list-style:none;background:var(--c-surface);display:flex;justify-content:space-between;gap:8px;align-items:center">
          <span>${v.Nom_Compte || (v.ID_Cible === 'HORS_BASE' ? '❄️ Visite à froid' : '—')}</span>
          <span style="font-size:11px;color:var(--c-text-2);font-weight:400;white-space:nowrap">${v.Date || '—'} · ${v.Heure || ''}</span>
        </summary>
        <div style="padding:10px 14px 14px">
          <div class="id-ligne"><span>Statut</span><strong>${v.Statut_Visite || '—'}</strong></div>
          <div class="id-ligne"><span>Type</span><strong>${v.Type_Visite || '—'}</strong></div>
          <div class="id-ligne"><span>Résultat</span><strong>${v.Resultat_Visite || '—'}</strong></div>
          <div class="id-ligne"><span>Interlocuteur</span><strong>${v.Interlocuteur_Nom || '—'}${v.Interlocuteur_Fonction ? ' (' + v.Interlocuteur_Fonction + ')' : ''}</strong></div>
          <div class="id-ligne"><span>Réceptivité</span><strong>${v.Slider_Receptivite != null && v.Slider_Receptivite !== '' ? v.Slider_Receptivite + '/5' : '—'}</strong></div>
          ${freins ? `<div class="id-ligne"><span>Freins</span><strong>${freins}</strong></div>` : ''}
          ${grossistes ? `<div class="id-ligne"><span>Grossistes</span><strong>${grossistes}</strong></div>` : ''}
          ${v.Prochaine_Action_Texte ? `<div class="id-ligne"><span>Prochaine action</span><strong>${v.Prochaine_Action_Texte}</strong></div>` : ''}
          ${v.Note_Privee ? `<div style="margin-top:8px;padding:8px;background:var(--c-bg);border-radius:var(--radius-sm);font-size:12px;color:var(--c-text-2)">${v.Note_Privee}</div>` : ''}
        </div>
      </details>`;
  },
};
