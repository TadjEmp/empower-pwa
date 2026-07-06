// ═══════════════════════════════════════
//  vue-phoning-fdv.js — Section 9 cahier des charges
//  Vue consolidée des appels de la force de vente pour Manager/Channel (lecture seule).
//  Sélecteur de commercial persistant + modes Jour / Semaine / Historique.
//
//  Convention "réussi" vs "sans réponse" (résumé hebdo/jour) :
//  Statut_Appel === 'NRP' → sans réponse ; tout autre statut renseigné → réussi
//  (cohérent avec les pills de résultat d'appel de vue-phoning.js:1125-1131).
// ═══════════════════════════════════════

window.VuePhoningFDV = {

  state: {
    chargement: true, erreur: null, appels: [],
    commercialFiltre: '',      // '' = tous les commerciaux
    modeVue: 'semaine',        // 'jour' | 'semaine' | 'historique'
    dateVue: dateISOLocale(),
  },

  async init() {
    this.state = {
      chargement: true, erreur: null, appels: [],
      commercialFiltre: '', modeVue: 'semaine', dateVue: dateISOLocale(),
    };
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

  // ── Sélecteur de commercial (persistant entre les modes jour/semaine/historique) ──
  _commerciaux() {
    const map = new Map();
    this.state.appels.forEach(a => {
      const pin = String(a.PIN_CDS || '');
      if (!pin || map.has(pin)) return;
      map.set(pin, { pin, nom: resolveCDS(a.PIN_CDS || a.Nom_CDS) });
    });
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  },

  setCommercial(pin) { this.state.commercialFiltre = pin; this.render(); },
  setModeVue(mode)   { this.state.modeVue = mode; this.render(); },

  _appelsFiltres() {
    const pin = this.state.commercialFiltre;
    return pin ? this.state.appels.filter(a => String(a.PIN_CDS || '') === pin) : this.state.appels;
  },

  // ── Navigation de date (±1 jour en mode 'jour', ±7 jours en mode 'semaine') ──
  precedent() {
    const d = new Date(this.state.dateVue);
    d.setDate(d.getDate() - (this.state.modeVue === 'semaine' ? 7 : 1));
    this.state.dateVue = dateISOLocale(d);
    this.render();
  },
  suivant() {
    const d = new Date(this.state.dateVue);
    d.setDate(d.getDate() + (this.state.modeVue === 'semaine' ? 7 : 1));
    this.state.dateVue = dateISOLocale(d);
    this.render();
  },

  // ── Résumé (total / réussis / sans réponse) pour une liste d'appels donnée ──
  _resume(appels) {
    const total = appels.length;
    const sansReponse = appels.filter(a => String(a.Statut_Appel || '').toUpperCase() === 'NRP').length;
    const reussis = appels.filter(a => a.Statut_Appel && String(a.Statut_Appel).toUpperCase() !== 'NRP').length;
    return { total, reussis, sansReponse };
  },

  _renderResume(r) {
    return `
      <div class="ch-stats" style="border-radius:var(--radius);margin-bottom:12px">
        <div class="ch-stat"><div class="ch-stat-val">${r.total}</div><div class="ch-stat-lbl">Appels</div></div>
        <div class="ch-stat bleu"><div class="ch-stat-val">${r.reussis}</div><div class="ch-stat-lbl">Réussis</div></div>
        <div class="ch-stat coral"><div class="ch-stat-val">${r.sansReponse}</div><div class="ch-stat-lbl">Sans réponse</div></div>
      </div>`;
  },

  // ── Mode Semaine : grille Lun→Ven avec résumé global puis détail par jour ──
  get semaineAppels() {
    const d = new Date(this.state.dateVue);
    const lundi = new Date(d);
    lundi.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const jours = Array.from({ length: 5 }, (_, i) => {
      const j = new Date(lundi);
      j.setDate(lundi.getDate() + i);
      return dateISOLocale(j);
    });
    const filtres = this._appelsFiltres();
    return jours.map(iso => ({
      iso,
      label: new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
      appels: filtres.filter(a => (a.Date || '').slice(0, 10) === iso)
                     .sort((a, b) => (a.Date || '').localeCompare(b.Date || '')),
    }));
  },

  _renderModeSemaine() {
    const semaine = this.semaineAppels;
    const tousAppels = semaine.flatMap(j => j.appels);
    const today = dateISOLocale();
    return `
      ${this._renderResume(this._resume(tousAppels))}
      <div class="planning-semaine">
        ${semaine.map(j => `
          <div class="planning-jour ${j.iso === today ? 'planning-jour-today' : ''}">
            <div class="pj-label">${j.label}</div>
            <div class="pj-count">${j.appels.length} appel${j.appels.length > 1 ? 's' : ''}</div>
            ${j.appels.slice(0, 3).map(a => `
              <div class="pj-item">
                <span class="pj-heure">${resolveCDS(a.PIN_CDS || a.Nom_CDS).slice(0, 3)}</span>
                <span class="pj-nom">${a.Reseller || a.Nom_Enseigne || '—'} · ${a.Statut_Appel || '—'}</span>
              </div>`).join('')}
            ${j.appels.length > 3 ? `<div class="pj-plus">+${j.appels.length - 3}</div>` : ''}
          </div>`).join('')}
      </div>`;
  },

  // ── Mode Jour : activité détaillée d'une seule journée ──
  _renderModeJour() {
    const iso = this.state.dateVue;
    const appels = this._appelsFiltres()
      .filter(a => (a.Date || '').slice(0, 10) === iso)
      .sort((a, b) => (a.Date || '').localeCompare(b.Date || ''));
    const dateLbl = new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return `
      <p style="font-size:13px;color:var(--c-text-2);margin-bottom:10px;text-transform:capitalize">${dateLbl}</p>
      ${this._renderResume(this._resume(appels))}
      ${appels.length === 0 ? `<div class="vide-liste">Aucun appel ce jour-là.</div>`
        : appels.map(a => this._renderAppelDetail(a)).join('')}
    `;
  },

  // ── Mode Historique : liste chronologique complète (filtrée par commercial) ──
  _renderModeHistorique() {
    const appels = [...this._appelsFiltres()].sort((a, b) => new Date(b.Date || 0) - new Date(a.Date || 0));
    return `
      ${this._renderResume(this._resume(appels))}
      ${appels.length === 0 ? `<div class="vide-liste">Aucun appel enregistré.</div>`
        : appels.map(a => this._renderAppelDetail(a)).join('')}
    `;
  },

  _renderAppelDetail(a) {
    const nom = a.Reseller || a.Nom_Enseigne || '—';
    return `
      <details style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);margin-bottom:10px;overflow:hidden">
        <summary style="padding:11px 14px;font-size:13px;font-weight:700;cursor:pointer;color:var(--c-title);
                        list-style:none;background:var(--c-surface);display:flex;justify-content:space-between;gap:8px;align-items:center">
          <span>${nom} <span style="font-weight:400;color:var(--c-text-2);font-size:11px">· ${resolveCDS(a.PIN_CDS || a.Nom_CDS)}</span></span>
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
    const mode = this.state.modeVue;
    const commerciaux = this._commerciaux();
    const dateLbl = new Date(this.state.dateVue + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

    app.innerHTML = `
      <header class="header-vue">
        <h1>Phoning — Rapport</h1>
      </header>
      <div class="dash-body avec-nav" style="padding:12px">
        <div class="barre-filtres" style="padding:0 0 12px">
          <div class="tabs-premium">
            <button class="tab-btn-premium ${mode === 'jour' ? 'actif' : ''}" onclick="VuePhoningFDV.setModeVue('jour')">Jour</button>
            <button class="tab-btn-premium ${mode === 'semaine' ? 'actif' : ''}" onclick="VuePhoningFDV.setModeVue('semaine')">Semaine</button>
            <button class="tab-btn-premium ${mode === 'historique' ? 'actif' : ''}" onclick="VuePhoningFDV.setModeVue('historique')">Historique</button>
          </div>
          <div class="filtres-statut" style="margin-top:8px">
            <select onchange="VuePhoningFDV.setCommercial(this.value)">
              <option value="">Tous les commerciaux</option>
              ${commerciaux.map(c => `<option value="${c.pin}" ${this.state.commercialFiltre === c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
            </select>
            ${mode !== 'historique' ? `
              <button class="btn-filtre" style="width:auto;padding:6px 10px" onclick="VuePhoningFDV.precedent()">←</button>
              <span style="font-size:13px;font-weight:600;white-space:nowrap">${mode === 'jour' ? dateLbl : 'Semaine en cours'}</span>
              <button class="btn-filtre" style="width:auto;padding:6px 10px" onclick="VuePhoningFDV.suivant()">→</button>
            ` : ''}
          </div>
        </div>
        ${mode === 'semaine' ? this._renderModeSemaine()
        : mode === 'jour' ? this._renderModeJour()
        : this._renderModeHistorique()}
      </div>
      ${NavBar('phoning_fdv')}
    `;
  },
};
