// ═══════════════════════════════════════
//  vue-dashboard-cds.js — Dashboard CDS V2.1 (B2)
//  Sources : 🏢_COMPTES · 🗺️_VISITES · 📞_PHONING ·
//            🎯_OBJECTIFS_PRIMES · 📋_PROSPECTS · ⚙️_PARAMS
// ═══════════════════════════════════════

window.VueDashboardCDS = {

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

    // ── Visites planifiées aujourd'hui ──
    // 🗺️_VISITES : colonnes 'Date' et 'Heure' (Code.gs HEADERS_MDB)
    const aujourd = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const visitesAujourdhui = visites.filter(v => {
      if (!this._estMoi(v.PIN_CDS)) return false;
      const statut = String(v.Statut_Visite || 'planifiée').toLowerCase();
      if (statut !== 'planifiée' && statut !== 'planifiee') return false;
      const dv = v.Date ? String(v.Date).slice(0, 10) : '';
      return dv === aujourd;
    });

    // ── Comptes historiques à réactiver (prioritaires) ──
    const comptesAReactiver = mesComptes
      .filter(c => {
        const s = String(c.STATUT_COMPTE || '').toUpperCase();
        return s.includes('REACTIVER') || s === 'CHURN';
      })
      .sort((a, b) => parseAmount(b.CA_FY25) - parseAmount(a.CA_FY25))
      .slice(0, 5);

    // ── Activité semaine ──
    // ⚙️_PARAMS réels : ObjVisitesCDS (8) et ObjAppelsSemaine (10)
    const visitesSem = visites.filter(v => this._estMoi(v.PIN_CDS) && v.Semaine_ISO === semaine).length;
    const appelsSem  = appels.filter(a => this._estMoi(a.PIN_CDS) && a.Semaine_ISO === semaine).length;
    const objVisites = Number(paramMap.ObjVisitesCDS || paramMap.ObjVisitesSemaine || 8);
    const objAppels  = Number(paramMap.ObjAppelsSemaine || 10);

    // ── Top 5 relances urgentes ──
    const top5 = mesComptes
      .filter(c => ['REACTIVER', 'REACTIVER_URGENT', 'CHURN'].some(f => String(c.STATUT_COMPTE || '').toUpperCase().includes(f)))
      .sort((a, b) => parseAmount(b.CA_FY25) - parseAmount(a.CA_FY25))
      .slice(0, 5);

    // Estimation prime Axe 1 (aperçu rapide — détail dans #/primes)
    const primesEstimees = (() => {
      const p = caObjectif > 0 ? caRealise / caObjectif * 100 : 0;
      if (p >= 120) return { montant: 500, label: '≥120% · P2+P3 hors plafond' };
      if (p >= 100) return { montant: 400, label: '100-119% · Palier P2' };
      if (p >= 80)  return { montant: 200, label: '80-99% · Palier P1' };
      return { montant: 0, label: `${Math.round(p)}% — seuil P1 à 80%` };
    })();

    return {
      semaine, quarter, caRealise, caObjectif, pct, pace,
      comptesRouges, nextStepsDepasses, leadsATraiter,
      visitesAujourdhui, comptesAReactiver,
      visitesSem, appelsSem, objVisites, objAppels,
      top5, nbComptes: mesComptes.length, primesEstimees,
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
        <div class="dash-hero-titre">Bonjour ${Session.nom || '—'} 👋
          <button class="btn-deco" onclick="Session.deconnecter();Router.aller('#/login')" title="Déconnexion">⏻</button>
        </div>
        <div class="dash-hero-tuiles">
          <div class="hero-tuile">
            <div class="hero-tuile-lbl">🎯 Objectif ${d.quarter}</div>
            <div class="hero-tuile-val">${formatEUR(d.caRealise)} <span style="font-size:12px;font-weight:400;color:#A8C8FF">/ ${formatEUR(d.caObjectif)}</span></div>
            <div class="hero-barre"><div class="hero-barre-fill" style="width:${Math.min(d.pct, 100)}%"></div></div>
            <div class="hero-tuile-sous">${PACE.lbl} · ${d.pct}%</div>
          </div>
          <div class="hero-tuile">
            <div class="hero-tuile-lbl">📅 Visites aujourd'hui</div>
            <div class="hero-tuile-val">${d.visitesAujourdhui.length} <span style="font-size:12px;font-weight:400;color:#A8C8FF">planifiée(s)</span></div>
            <div class="hero-tuile-sous">📈 ${d.visitesSem}/${d.objVisites} cette semaine · ${d.nbComptes} comptes</div>
          </div>
        </div>
      </div>

      <div class="dash-body avec-nav">

        <!-- VISITES PLANIFIÉES AUJOURD'HUI -->
        <div class="bloc-fiche">
          <div class="bloc-titre">
            📅 Visites planifiées aujourd'hui
            ${d.visitesAujourdhui.length ? `<span class="badge-compteur">${d.visitesAujourdhui.length}</span>` : ''}
            <button class="btn-lien" onclick="Router.aller('#/visites/planning')" style="margin-left:auto;font-size:12px">Voir planning →</button>
          </div>
          ${d.visitesAujourdhui.length === 0
            ? `<div class="pas-de-donnees">Aucune visite planifiée aujourd'hui
               <br><button class="btn-primaire" style="margin-top:8px" onclick="Router.aller('#/visites/planning')">+ Planifier une visite</button>
               </div>`
            : d.visitesAujourdhui.slice(0, 4).map(v => `
              <div class="relance-ligne" onclick="Router.aller('#/visites/cr/${v.ID_Visite || ''}')">
                <div class="relance-nom">${v.Nom_Compte || v.ID_Compte || '—'}</div>
                <div class="relance-meta">
                  <span class="statut-pill" style="background:var(--c-primary-10,#e6eeff);color:var(--c-primary)">planifiée</span>
                  ${v.Heure ? `<span style="font-size:12px;color:var(--c-text-2)">${v.Heure}</span>` : ''}
                </div>
              </div>`).join('')
          }
        </div>

        <!-- LEADS EMPOWER À TRAITER -->
        ${d.leadsATraiter.length > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">
            🎯 Leads EMPOWER à traiter
            <span class="badge-rouge badge-priorite">${d.leadsATraiter.length}</span>
            <button class="btn-lien" onclick="Router.aller('#/empower-tracker')" style="margin-left:auto;font-size:12px">Voir tracker →</button>
          </div>
          ${d.leadsATraiter.slice(0, 3).map(p => `
            <div class="relance-ligne" onclick="Router.aller('#/empower-tracker')">
              <div class="relance-nom">${p.Nom_Prospect || p.Nom_Compte || '—'}</div>
              <div class="relance-meta">
                <span class="statut-pill statut-reactiver">${p.Statut_Lead || 'À traiter'}</span>
                ${p.Date_Assignation ? `<span style="font-size:11px;color:var(--c-text-2)">${p.Date_Assignation}</span>` : ''}
              </div>
            </div>`).join('')}
          ${d.leadsATraiter.length > 3 ? `<div style="font-size:12px;color:var(--c-primary);text-align:center;padding:6px 0;cursor:pointer" onclick="Router.aller('#/empower-tracker')">+${d.leadsATraiter.length - 3} autres leads →</div>` : ''}
        </div>` : ''}

        <!-- COMPTES HISTORIQUES À RÉACTIVER -->
        ${d.comptesAReactiver.length > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">
            🏢 Comptes à réactiver
            <span class="badge-compteur">${d.comptesAReactiver.length}</span>
            <button class="btn-lien" onclick="Router.aller('#/comptes-historiques')" style="margin-left:auto;font-size:12px">Voir historiques →</button>
          </div>
          ${d.comptesAReactiver.slice(0, 3).map(c => `
            <div class="relance-ligne" onclick="Router.aller('#/comptes-historiques')">
              <div class="relance-nom">${c.Nom_Compte}</div>
              <div class="relance-meta">
                <span class="statut-pill statut-reactiver">${c.STATUT_COMPTE}</span>
                <strong>${formatEUR(c.CA_FY25)}</strong>
              </div>
            </div>`).join('')}
        </div>` : ''}

        <!-- ALERTES -->
        ${nbAlertes > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">⚠️ Alertes <span class="badge-rouge badge-priorite">${nbAlertes}</span></div>
          <div class="dash-alertes">
            ${d.comptesRouges.length ? `<div class="alerte-ligne" onclick="Router.aller('#/comptes')">🔴 <strong>${d.comptesRouges.length}</strong> compte(s) sans action récente</div>` : ''}
            ${d.nextStepsDepasses.length ? `<div class="alerte-ligne" onclick="Router.aller('#/comptes')">⏰ <strong>${d.nextStepsDepasses.length}</strong> next step(s) dépassé(s)</div>` : ''}
          </div>
        </div>` : ''}

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
              <div class="activite-lbl">Leads</div>
            </div>
          </div>
        </div>

        <!-- PRIMES ESTIMÉES (Axe 1) -->
        ${!Session.voitTout() ? `
        <div class="bloc-fiche" style="cursor:pointer" onclick="Router.aller('#/primes')">
          <div class="bloc-titre">🏆 Primes estimées ${d.quarter}
            <button class="btn-lien" style="margin-left:auto;font-size:12px">Détail →</button>
          </div>
          <div class="pace-chiffres">
            <strong style="color:var(--c-cta)">${d.primesEstimees.montant} €</strong>
            <span style="font-size:12px">Axe 1 · ${d.primesEstimees.label}</span>
          </div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:6px">Estimation Axe 1 uniquement — cliquez pour le détail complet (Axes 2 & 3 inclus).</p>
        </div>` : ''}

        <!-- RACCOURCIS -->
        <div class="dash-raccourcis">
          <button class="raccourci" onclick="Router.aller('#/visites/planning')">📅<span>Nouvelle visite</span></button>
          <button class="raccourci" onclick="Router.aller('#/empower-tracker')">▤<span>Tracker</span></button>
          <button class="raccourci" onclick="Router.aller('#/comptes-historiques')">🏢<span>Historiques</span></button>
          <button class="raccourci" onclick="Router.aller('#/phoning')">📞<span>Logger appel</span></button>
          <button class="raccourci" onclick="Router.aller('#/primes')">🏆<span>Mes primes</span></button>
          ${Session.estManager() ? `
          <button class="raccourci" onclick="Router.aller('#/manager')">👥<span>Vue équipe</span></button>
          <button class="raccourci" onclick="Router.aller('#/admin')">⚙️<span>Admin</span></button>` : ''}
        </div>
      </div>
      ${NavBar('home')}
    `;
  },
};
