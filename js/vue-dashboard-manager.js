// ═══════════════════════════════════════
//  vue-dashboard-manager.js — Vue équipe (Tadjidine)
//  Sources : 🎯_OBJECTIFS_PRIMES · 🗺️_VISITES · 📞_PHONING ·
//            📋_PROSPECTS · 🏢_COMPTES · ⚙️_PARAMS
//  + Export COPIL (impression / PDF)
// ═══════════════════════════════════════

window.VueDashboardManager = {

  state: null,

  async init() {
    if (!Session.voitTout()) { Router.aller('#/dashboard'); return; }
    this.state = { chargement: true, d: null };
    this.render();
    try {
      const [objectifs, visites, appels, prospects, comptes, params] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES'),
        SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING'),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
      ]);
      this.state.d = this._calculer({ objectifs, visites, appels, prospects, comptes, params });
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  _calculer({ objectifs, visites, appels, prospects, comptes, params }) {
    const paramMap = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
    const quarter  = paramMap.QuarterActif || 'Q1';
    const semaine  = getISOWeek();
    const seuilRouge = Number(paramMap.SEUIL_ROUGE_JOURS || 5);

    const equipe = objectifs.map(o => {
      const pin = Number(o.PIN_CDS);
      const ca  = Number(o[`${quarter}_CA_Realise`] || 0);
      const obj = Number(o[`${quarter}_Obj_Revise`] || o[`${quarter}_Obj_Initial`] || 0);
      const pct = obj > 0 ? Math.round(ca / obj * 100) : 0;
      return {
        pin, nom: o.Nom_CDS, ca, obj, pct,
        pace: pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK',
        visitesSem: visites.filter(v => Number(v.PIN_CDS) === pin && v.Semaine_ISO === semaine).length,
        appelsSem:  appels.filter(a => Number(a.PIN_CDS) === pin && a.Semaine_ISO === semaine).length,
        leadsEnCours: prospects.filter(p => Number(p.PIN_CDS_Assigne) === pin && String(p.Flag_converti).toUpperCase() !== 'TRUE').length,
      };
    });

    // Alertes équipe
    const now = Date.now();
    const leadsBloques = prospects.filter(p => {
      if (String(p.Flag_converti).toUpperCase() === 'TRUE') return false;
      const ref = p.Date_prochaine_action || p.Timestamp || p.Date_Import;
      return p.PIN_CDS_Assigne && ref && (now - new Date(ref).getTime()) / 86400000 > 7;
    });
    const comptesRouges = comptes.filter(c => {
      const d = c.Date_Derniere_Action ? new Date(c.Date_Derniere_Action).getTime() : 0;
      return d && (now - d) / 86400000 > seuilRouge;
    });
    const integres = prospects.filter(p => String(p.Flag_converti).toUpperCase() === 'TRUE').length;
    const assignes = prospects.filter(p => p.PIN_CDS_Assigne).length;
    const tauxIntegration = assignes > 0 ? Math.round(integres / assignes * 100) : 0;

    const caTotal  = equipe.reduce((s, e) => s + e.ca, 0);
    const objTotal = equipe.reduce((s, e) => s + e.obj, 0);

    return { quarter, semaine, equipe, leadsBloques, comptesRouges, tauxIntegration,
             integres, assignes, caTotal, objTotal,
             pctTotal: objTotal > 0 ? Math.round(caTotal / objTotal * 100) : 0 };
  },

  exporterCOPIL() { window.print(); },

  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement vue équipe…</div>';
      return;
    }
    const d = this.state.d;
    const PACE = {
      ON_TRACK: { lbl: '🟢', cls: 'pace-ok' }, WATCH: { lbl: '🟡', cls: 'pace-watch' }, AT_RISK: { lbl: '🔴', cls: 'pace-risk' },
    };
    const dateFr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    app.innerHTML = `
      <header class="header-vue no-print">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Vue équipe</h1>
        <button class="btn-retour" onclick="VueDashboardManager.exporterCOPIL()" title="Export COPIL PDF">🖨️</button>
      </header>

      <div class="dash-body copil-print avec-nav">
        <div class="print-only" style="display:none">
          <h1>COPIL ESI — ${d.semaine} FY27</h1>
          <p>${dateFr} · Empower Sales Intelligence · Norton France</p>
        </div>
        <p class="dash-date">${dateFr} · ${d.semaine} · ${d.quarter} FY27</p>

        <!-- TUILES STATS (design dashboard_norton_fy27) -->
        <div class="stat-tuiles">
          <div class="stat-tuile"><div class="stat-tuile-lbl">Total CA</div><div class="stat-tuile-val">${formatEuro(d.caTotal)}</div></div>
          <div class="stat-tuile bleu"><div class="stat-tuile-lbl">Leads assignés</div><div class="stat-tuile-val">${d.assignes}</div></div>
          <div class="stat-tuile ciel"><div class="stat-tuile-lbl">Intégrés</div><div class="stat-tuile-val">${d.integres}</div></div>
        </div>

        <!-- CONSOLIDÉ -->
        <div class="bloc-fiche dash-pace">
          <div class="bloc-titre">Équipe — Pace CA ${d.quarter}
            <span class="pace-badge ${d.pctTotal >= 100 ? 'pace-ok' : d.pctTotal >= 80 ? 'pace-watch' : 'pace-risk'}">${d.pctTotal}%</span>
          </div>
          <div class="pace-chiffres">
            <strong>${formatEuro(d.caTotal)}</strong><span>/ ${formatEuro(d.objTotal)}</span>
          </div>
          <div class="pace-barre"><div class="pace-barre-fill ${d.pctTotal >= 100 ? 'pace-ok' : d.pctTotal >= 80 ? 'pace-watch' : 'pace-risk'}" style="width:${Math.min(d.pctTotal, 100)}%"></div></div>
        </div>

        <!-- TABLEAU CDS -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Performance par CDS</div>
          <div class="tableau-equipe">
            <div class="te-ligne te-head">
              <span>CDS</span><span>CA / OBJ</span><span>%</span><span>📋</span><span>📞</span><span>🎯</span>
            </div>
            ${d.equipe.map(e => `
            <div class="te-ligne">
              <span><strong>${PACE[e.pace].lbl} ${e.nom}</strong></span>
              <span>${formatEuro(e.ca)} / ${formatEuro(e.obj)}</span>
              <span class="pace-badge ${PACE[e.pace].cls}">${e.pct}%</span>
              <span>${e.visitesSem}</span>
              <span>${e.appelsSem}</span>
              <span>${e.leadsEnCours}</span>
            </div>`).join('')}
          </div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">📋 visites ${d.semaine} · 📞 appels ${d.semaine} · 🎯 leads en cours</p>
        </div>

        <!-- PERFORMANCE PAR CDS — barres (design dashboard_norton_fy27) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Performance par CDS — % objectif ${d.quarter}</div>
          <div class="perf-cds">
            ${d.equipe.map(e => `
            <div>
              <div class="perf-ligne-lbl"><span>${e.nom.toUpperCase()}</span><span>${e.pct}%</span></div>
              <div class="perf-barre"><div class="perf-barre-fill" style="width:${Math.min(e.pct, 100)}%"></div></div>
            </div>`).join('')}
          </div>
        </div>

        <!-- ALERTES ÉQUIPE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Alertes équipe</div>
          <div class="dash-alertes">
            ${d.equipe.filter(e => e.pace !== 'ON_TRACK').map(e => `
              <div class="alerte-ligne">${PACE[e.pace].lbl} <strong>${e.nom}</strong> — ${e.pct}% de l'objectif ${d.quarter}</div>`).join('')}
            ${d.leadsBloques.length ? `<div class="alerte-ligne no-print" onclick="Router.aller('#/pipeline')">⏳ <strong>${d.leadsBloques.length}</strong> lead(s) sans action > 7 jours</div>` : ''}
            ${d.comptesRouges.length ? `<div class="alerte-ligne no-print" onclick="Router.aller('#/comptes')">🔴 <strong>${d.comptesRouges.length}</strong> compte(s) en retard d'action</div>` : ''}
            ${!d.leadsBloques.length && !d.comptesRouges.length && d.equipe.every(e => e.pace === 'ON_TRACK') ? '<div class="pas-de-donnees">Aucune alerte 🎉</div>' : ''}
          </div>
        </div>

        <!-- PIPELINE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Pipeline EMPOWER</div>
          <div class="dash-activite">
            <div class="activite-item"><div class="activite-val">${d.assignes}</div><div class="activite-lbl">Leads assignés</div></div>
            <div class="activite-item"><div class="activite-val">${d.integres}</div><div class="activite-lbl">Intégrés</div></div>
            <div class="activite-item">
              <div class="activite-val" style="color:${d.tauxIntegration < 30 ? 'var(--c-danger)' : 'var(--c-success)'}">${d.tauxIntegration}%</div>
              <div class="activite-lbl">Taux intégration</div>
            </div>
          </div>
        </div>

        <!-- RACCOURCIS -->
        <div class="dash-raccourcis no-print">
          <button class="raccourci" onclick="Router.aller('#/pipeline')">📊<span>Pipeline</span></button>
          <button class="raccourci" onclick="Router.aller('#/comptes')">🏢<span>Tous les comptes</span></button>
          <button class="raccourci" onclick="Router.aller('#/reactiver')">🔄<span>À réactiver</span></button>
          <button class="raccourci" onclick="Router.aller('#/admin')">⚙️<span>Administration</span></button>
        </div>
      </div>
      ${NavBar('home')}
    `;
  },
};
