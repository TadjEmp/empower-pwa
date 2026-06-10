// ═══════════════════════════════════════
//  vue-dashboard-cds.js — Dashboard CDS
//  Sources : 🏢_COMPTES · 🗺️_VISITES · 📞_PHONING ·
//            🎯_OBJECTIFS_PRIMES · 📋_PROSPECTS · ⚙️_PARAMS
// ═══════════════════════════════════════

const VueDashboardCDS = {

  state: { chargement: true, donnees: null, erreur: null },

  async init() {
    this.state.chargement = true;
    this.state.erreur = null;
    this.render();
    try {
      const [comptes, visites, appels, objectifs, prospects, params] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES'),
        SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING'),
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
      ]);
      this.state.donnees = this._calculer({ comptes, visites, appels, objectifs, prospects, params });
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      this.state.erreur = e.message;
      this.render();
    }
  },

  _estMoi(pinChamp) {
    return Session.voitTout() || Number(pinChamp) === Session.pin;
  },

  _calculer({ comptes, visites, appels, objectifs, prospects, params }) {
    const pin       = Session.pin;
    const semaine   = getISOWeek();
    const paramMap  = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
    const quarter   = paramMap.QuarterActif || 'Q1';

    // ── Pace CA quarter ──
    const obj = objectifs.find(o => Number(o.PIN_CDS) === pin)
             || (Session.voitTout() ? null : null);
    let caRealise = 0, caObjectif = 0;
    if (Session.voitTout()) {
      // Manager : consolidé équipe
      objectifs.forEach(o => {
        caRealise += Number(o[`${quarter}_CA_Realise`] || 0);
        caObjectif += Number(o[`${quarter}_Obj_Revise`] || o[`${quarter}_Obj_Initial`] || 0);
      });
    } else if (obj) {
      caRealise  = Number(obj[`${quarter}_CA_Realise`] || 0);
      caObjectif = Number(obj[`${quarter}_Obj_Revise`] || obj[`${quarter}_Obj_Initial`] || 0);
    }
    // Seuils PACE alignés sur la grille incentives FY27 (PDF Option D3)
    const pct = caObjectif > 0 ? Math.round(caRealise / caObjectif * 100) : 0;
    const pace = pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK';

    // ── Mes comptes ──
    const mesComptes = comptes.filter(c => this._estMoi(c.PIN_CDS_Assigne));

    // ── Alertes ──
    const seuilJours = Number(paramMap.SeuilJoursSansAction || 5);
    const now = Date.now();
    const comptesRouges = mesComptes.filter(c => {
      const d = c.Date_Derniere_Action ? new Date(c.Date_Derniere_Action).getTime() : 0;
      return d && (now - d) / 86400000 > seuilJours && String(c.Flag_converti) !== 'TRUE';
    });
    const nextStepsDepasses = mesComptes.filter(c => estDepassee(c.Date_prochaine_action));
    const leadsATraiter = prospects.filter(p =>
      this._estMoi(p.PIN_CDS_Assigne) && String(p.Flag_traite) !== 'TRUE'
    );

    // ── Activité semaine ──
    const visitesSem = visites.filter(v => this._estMoi(v.PIN_CDS) && v.Semaine_ISO === semaine).length;
    const appelsSem  = appels.filter(a => this._estMoi(a.PIN_CDS) && a.Semaine_ISO === semaine).length;
    const objVisites = Number(paramMap.ObjVisitesSemaine || 10);
    const objAppels  = Number(paramMap.ObjAppelsSemaine || 15);

    // ── Top 5 relances urgentes ──
    const top5 = mesComptes
      .filter(c => ['REACTIVER', 'REACTIVER_URGENT', 'CHURN'].some(f => String(c.STATUT_COMPTE || '').toUpperCase().includes(f)))
      .sort((a, b) => Number(b.CA_FY25 || 0) - Number(a.CA_FY25 || 0))
      .slice(0, 5);

    return {
      semaine, quarter, caRealise, caObjectif, pct, pace,
      comptesRouges, nextStepsDepasses, leadsATraiter,
      visitesSem, appelsSem, objVisites, objAppels,
      top5, nbComptes: mesComptes.length,
    };
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement du dashboard…</div>';
      return;
    }
    if (this.state.erreur) {
      app.innerHTML = `<div class="erreur">Erreur : ${this.state.erreur}
        <br><br><button class="btn-secondaire" onclick="VueDashboardCDS.init()">Réessayer</button></div>`;
      return;
    }
    const d = this.state.donnees;
    const dateFr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const PACE = {
      ON_TRACK: { lbl: '🟢 ON TRACK', cls: 'pace-ok' },
      WATCH:    { lbl: '🟡 WATCH',    cls: 'pace-watch' },
      AT_RISK:  { lbl: '🔴 AT RISK',  cls: 'pace-risk' },
    }[d.pace];
    const nbAlertes = d.comptesRouges.length + d.nextStepsDepasses.length + d.leadsATraiter.length;

    app.innerHTML = `
      <!-- Héro navy — design interface_cds_norton_fy27 -->
      <div class="dash-hero">
        <div class="dash-hero-cycle">Cycle FY27 · ${d.semaine} · ${dateFr}</div>
        <div class="dash-hero-titre">Bonjour ${Session.nom} 👋
          <button class="btn-deco" onclick="Session.deconnecter();Router.aller('#/login')" title="Déconnexion">⏻</button>
        </div>
        <div class="dash-hero-tuiles">
          <div class="hero-tuile">
            <div class="hero-tuile-lbl">🎯 Objectif ${d.quarter}</div>
            <div class="hero-tuile-val">${formatEuro(d.caRealise)} <span style="font-size:12px;font-weight:400;color:#A8C8FF">/ ${formatEuro(d.caObjectif)}</span></div>
            <div class="hero-barre"><div class="hero-barre-fill" style="width:${Math.min(d.pct, 100)}%"></div></div>
            <div class="hero-tuile-sous">${PACE.lbl} · ${d.pct}%</div>
          </div>
          <div class="hero-tuile">
            <div class="hero-tuile-lbl">🕐 Visites</div>
            <div class="hero-tuile-val">${d.visitesSem} <span style="font-size:12px;font-weight:400;color:#A8C8FF">cette sem.</span></div>
            <div class="hero-tuile-sous">📈 obj ${d.objVisites} / sem · ${d.nbComptes} comptes</div>
          </div>
        </div>
      </div>

      <div class="dash-body avec-nav">

        <!-- ALERTES -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Priorités du jour ${nbAlertes ? `<span class="badge-rouge badge-priorite">${nbAlertes}</span>` : '✅'}</div>
          ${nbAlertes === 0 ? '<div class="pas-de-donnees">Aucune alerte — tout est à jour 🎉</div>' : `
          <div class="dash-alertes">
            ${d.comptesRouges.length ? `<div class="alerte-ligne" onclick="Router.aller('#/comptes')">🔴 <strong>${d.comptesRouges.length}</strong> compte(s) sans action récente</div>` : ''}
            ${d.nextStepsDepasses.length ? `<div class="alerte-ligne" onclick="Router.aller('#/comptes')">⏰ <strong>${d.nextStepsDepasses.length}</strong> next step(s) dépassé(s)</div>` : ''}
            ${d.leadsATraiter.length ? `<div class="alerte-ligne" onclick="Router.aller('#/reactiver')">🎯 <strong>${d.leadsATraiter.length}</strong> lead(s) à traiter</div>` : ''}
          </div>`}
        </div>

        <!-- ACTIVITÉ SEMAINE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Activité ${d.semaine}</div>
          <div class="dash-activite">
            <div class="activite-item">
              <div class="activite-val">${d.visitesSem}<span>/${d.objVisites}</span></div>
              <div class="activite-lbl">Visites</div>
            </div>
            <div class="activite-item">
              <div class="activite-val">${d.appelsSem}<span>/${d.objAppels}</span></div>
              <div class="activite-lbl">Appels</div>
            </div>
            <div class="activite-item">
              <div class="activite-val">${d.leadsATraiter.length}</div>
              <div class="activite-lbl">Leads en cours</div>
            </div>
          </div>
        </div>

        <!-- TOP 5 RELANCES -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Top 5 relances urgentes</div>
          ${d.top5.length === 0 ? '<div class="pas-de-donnees">Aucune relance urgente</div>'
            : d.top5.map(c => `
            <div class="relance-ligne" onclick="Router.aller('#/compte/${c.ID_Compte}')">
              <div class="relance-nom">${c.Nom_Compte}</div>
              <div class="relance-meta">
                <span class="statut-pill statut-reactiver">${c.STATUT_COMPTE}</span>
                <strong>${formatEuro(c.CA_FY25)}</strong>
              </div>
            </div>`).join('')}
        </div>

        <!-- RACCOURCIS -->
        <div class="dash-raccourcis">
          <button class="raccourci" onclick="Router.aller('#/comptes')">🏢<span>Mes comptes</span></button>
          <button class="raccourci" onclick="Router.aller('#/questionnaire')">📋<span>Nouvelle visite</span></button>
          <button class="raccourci" onclick="Router.aller('#/reactiver')">🔄<span>À réactiver</span></button>
          <button class="raccourci" onclick="Router.aller('#/phoning')">📞<span>Logger appel</span></button>
          <button class="raccourci" onclick="Router.aller('#/primes')">🏆<span>Mes primes</span></button>
          ${Session.voitTout() ? `
          <button class="raccourci" onclick="Router.aller('#/pipeline')">📊<span>Pipeline</span></button>` : ''}
          ${Session.estManager() ? `
          <button class="raccourci" onclick="Router.aller('#/manager')">👥<span>Vue équipe</span></button>
          <button class="raccourci" onclick="Router.aller('#/admin')">⚙️<span>Admin</span></button>` : ''}
        </div>
      </div>
      ${NavBar('home')}
    `;
  },
};
