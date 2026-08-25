// ═══════════════════════════════════════
//  vue-dashboard-cds.js — Dashboard CDS V2.1 (B2) v9
//  Graphiques activité SVG + vue "Ma base prospects"
// ═══════════════════════════════════════

window.VueDashboardCDS = {

  state: { chargement: true, donnees: null, erreur: null },

  async init() {
    this.state.chargement = true;
    this.state.erreur = null;
    this.render();
    try {
      const [comptes, visites, appels, objectifs, prospects, params, notifs] = await Promise.all([
        // Bloc B (07/2026) — nocache : cards KPI Accueil (visites/appels/statuts
        // comptes) restaient jusqu'à 30 min périmées après une activité terrain.
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES', { nocache: true }),
        SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES', { nocache: true }),
        SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING', { nocache: true }),
        // nocache : objectifs_primes.Qx_CA_Realise est mis à jour par la synchro
        // Sell-In (sync-sellin) depuis le poste ADMIN — sans nocache, le
        // Reporting CDS pouvait rester figé jusqu'à 30 min après une synchro
        // faite ailleurs (07/2026).
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES', { nocache: true }),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
        SheetsAPI.lire('EMPOWER_MDB', '🔔_NOTIFS').catch(() => []),
      ]);
      // Conservé brut pour recalculer les camemberts/CA cumulé au changement de
      // filtre (Quarter/commercial) sans re-fetch réseau — cf. _donneesFiltrables.
      this._raw = { comptes, visites, appels, objectifs, params };
      this.state.donnees = this._calculer({ comptes, visites, appels, objectifs, prospects, params, notifs });
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

  _contexteReporting() { return window.location.hash.includes('/reporting-cds'); },

  // ── Bloc 2 §1 — Reporting personnel : comparatif Q1→Q4 (CA réalisé vs
  //    objectif, par trimestre), que l'Accueil ne montre pas (il n'affiche
  //    que le quarter actuellement filtré). Réutilise this._raw déjà chargé
  //    par init() — aucun nouveau fetch réseau. ──
  _renderReporting() {
    const app = document.getElementById('app');
    const raw = this._raw;
    const CA = v => (typeof window.parseCA === 'function' ? (window.parseCA(v) ?? 0) : Number(v) || 0);
    const fmtEUR = v => {
      const s = (typeof window.fmtCA === 'function') ? window.fmtCA(v) : null;
      return (s && s !== '—') ? `${s} €` : '—';
    };
    const o = raw.objectifs.find(x => Number(x.PIN_CDS) === Session.pin) || {};
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
      const ca  = CA(o[`${q}_CA_Realise`]);
      const obj = CA(o[`${q}_Obj_Revise`]) || CA(o[`${q}_Obj_Initial`]);
      const pct = obj > 0 ? Math.round(ca / obj * 100) : 0;
      const pace = pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK';
      return { q, ca, obj, pct, pace };
    });
    const caFY27Total = quarters.reduce((s, x) => s + x.ca, 0);
    const objFY27Total = quarters.reduce((s, x) => s + x.obj, 0);
    const PACE_BADGE = { ON_TRACK: 'pace-ok', WATCH: 'pace-watch', AT_RISK: 'pace-risk' };
    const PACE_LBL   = { ON_TRACK: 'ON TRACK', WATCH: 'WATCH', AT_RISK: 'AT RISK' };
    const dateFr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const f = window.calculerCamembertsActivite ? window.calculerCamembertsActivite(raw) : null;

    app.innerHTML = `
      <header class="dash-page-header">
        <div class="dash-ph-left">
          <div class="dash-ph-title">Reporting — ${Session.nom || '—'}</div>
          <div class="dash-ph-date">${dateFr}</div>
        </div>
      </header>
      <div class="dash-body avec-nav">
        <div class="dash-col-main">
          <div class="bloc-fiche">
            <div class="bloc-titre">FY27 — Q1 → Q4
              <span class="badge-compteur">${fmtEUR(caFY27Total)} / ${fmtEUR(objFY27Total)}</span>
            </div>
            <div class="tableau-equipe">
              <div class="te-ligne te-head" style="grid-template-columns:0.6fr 1.4fr 0.6fr 0.8fr">
                <span>Quarter</span><span>CA / Objectif</span><span>%</span><span>Pace</span>
              </div>
              ${quarters.map(x => `
              <div class="te-ligne" style="grid-template-columns:0.6fr 1.4fr 0.6fr 0.8fr;cursor:pointer"
                   onclick="FilterState.set({quarter:'${x.q}'});Router.aller('#/objectifs')" title="Voir le détail dans Objectifs">
                <span><strong>${x.q}</strong></span>
                <span style="font-size:12px">${fmtEUR(x.ca)} / ${fmtEUR(x.obj)}</span>
                <span style="font-weight:700">${x.obj > 0 ? x.pct + '%' : '—'}</span>
                <span class="pace-badge ${PACE_BADGE[x.pace]}">${x.obj > 0 ? PACE_LBL[x.pace] : '—'}</span>
              </div>`).join('')}
            </div>
            <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">Cliquez un trimestre pour le détail complet (axes NSB/Onboarding) dans Objectifs.</p>
          </div>

          ${f ? window.renderBlocCamemberts(f, raw, 'VueDashboardCDS') : ''}
          ${f ? window.renderBlocCAHebdo(f, 'VueDashboardCDS', fmtEUR) : ''}

          <div class="bloc-fiche">
            <div class="bloc-titre">Aller plus loin</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn-secondaire" style="flex:1;min-width:140px" onclick="Router.aller('#/objectifs')">📊 Détail Objectifs</button>
              <button class="btn-secondaire" style="flex:1;min-width:140px" onclick="Router.aller('#/primes')">🏅 Mes Primes</button>
              <button class="btn-secondaire" style="flex:1;min-width:140px" onclick="Router.aller('#/comptes-historiques')">📁 Historique CA</button>
            </div>
          </div>
        </div>
      </div>
      ${NavBar('reporting_cds')}
    `;
  },

  // Camemberts/CA cumulé mutualisés avec VueDashboardManager — cf.
  // js/dashboard-activite.js (Bloc 4 anti-duplication).
  setQuarterCamembert(q) { FilterState.set({ quarter: q }); this.render(); },
  setCommercialCamembert(pin) { FilterState.set({ pinCommercial: pin ? Number(pin) : null }); this.render(); },
  toggleSemaineCamembert() { FilterState.set({ semaine: FilterState.get().semaine ? null : FiscalWeeks.codeDe() }); this.render(); },
  _donneesFiltrables() { return this._raw ? window.calculerCamembertsActivite(this._raw) : null; },

  // Routage Type_Notif -> route contextuelle : délègue à NotifCenter._route (source
  // unique, cf. notif-center.js) au lieu d'une copie maintenue séparément.
  _routeNotif(typeNotif, idCible) {
    return window.NotifCenter ? NotifCenter._route(typeNotif, idCible) : '#/dashboard';
  },

  _calculer({ comptes, visites, appels, objectifs, prospects, params, notifs }) {
    const pin      = Session.pin;
    const semaine  = FiscalWeeks.codeDe();
    const paramMap = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
    const quarter  = paramMap.QuarterActif || 'Q1';
    const CA = v => (typeof window.parseCA === 'function' ? (window.parseCA(v) ?? 0) : Number(v) || 0);

    // ── CA / objectif (trimestre en cours) ──
    const obj = objectifs.find(o => Number(o.PIN_CDS) === pin);
    let caRealise = 0, caObjectif = 0;
    if (Session.voitTout()) {
      objectifs.forEach(o => {
        caRealise += CA(o[`${quarter}_CA_Realise`]);
        caObjectif += CA(o[`${quarter}_Obj_Revise`]) || CA(o[`${quarter}_Obj_Initial`]);
      });
    } else if (obj) {
      caRealise  = CA(obj[`${quarter}_CA_Realise`]);
      caObjectif = CA(obj[`${quarter}_Obj_Revise`]) || CA(obj[`${quarter}_Obj_Initial`]);
    }
    const pct  = caObjectif > 0 ? Math.round(caRealise / caObjectif * 100) : 0;
    const pace = pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK';
    // CA FY27 cumulé : somme des 4 trimestres (Q1+Q2+Q3+Q4), pour le KPI annuel
    const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
    const caRealiseFY27 = Session.voitTout()
      ? objectifs.reduce((s, o) => s + QUARTERS.reduce((sq, q) => sq + CA(o[`${q}_CA_Realise`]), 0), 0)
      : (obj ? QUARTERS.reduce((sq, q) => sq + CA(obj[`${q}_CA_Realise`]), 0) : 0);
    // PACE annuel : CA FY27 cumulé vs objectif FY27
    const caFY27Obj = Session.voitTout()
      ? objectifs.reduce((s, o) => s + CA(o.FY27_Obj), 0)
      : (obj ? CA(obj.FY27_Obj) : 0);
    const pctAnnuel = caFY27Obj > 0 ? Math.round(caRealiseFY27 / caFY27Obj * 100) : 0;

    // ── Comptes & alertes ──
    const mesComptes        = comptes.filter(c => this._estMoi(c.PIN_CDS_Assigne));
    const seuilJours        = Number(paramMap.SeuilJoursSansAction || 5);
    const now               = Date.now();
    const comptesRouges     = mesComptes.filter(c => {
      const d = c.Date_Derniere_Action ? new Date(c.Date_Derniere_Action).getTime() : 0;
      return d && (now - d) / 86400000 > seuilJours && String(c.Flag_converti) !== 'TRUE';
    });
    const nextStepsDepasses = mesComptes.filter(c => estDepassee(c.Date_prochaine_action));
    // Uniquement les leads créés via ESI_PIPELINE (pas les 1674 imports bruts)
    const leadsATraiter     = prospects.filter(p =>
      String(p.Source_Import || '').trim() === 'ESI_PIPELINE' &&
      this._estMoi(p.PIN_CDS_Assigne) && String(p.Flag_traite) !== 'TRUE'
    );

    // ── Visites planifiées aujourd'hui ──
    const aujourd = dateISOLocale();
    const visitesAujourdhui = visites.filter(v => {
      if (!this._estMoi(v.PIN_CDS)) return false;
      const statut = String(v.Statut_Visite || 'planifiée').toLowerCase();
      if (statut !== 'planifiée' && statut !== 'planifiee') return false;
      return (v.Date || '').slice(0, 10) === aujourd;
    });

    // ── Comptes à réactiver ──
    const comptesAReactiver = mesComptes
      .filter(c => {
        const s = String(c.STATUT_COMPTE || '').toUpperCase();
        return s.includes('REACTIVER') || s === 'CHURN';
      })
      .sort((a, b) => CA(b.CA_FY26 ?? b['CA FY26 €'] ?? b.CA_FY25) - CA(a.CA_FY26 ?? a['CA FY26 €'] ?? a.CA_FY25))
      .slice(0, 5);

    // ── Activité semaine ──
    const visitesSem = visites.filter(v => this._estMoi(v.PIN_CDS) && v.Semaine_ISO === semaine).length;
    // Bloc Phoning (07/2026) — un appel planifié pas encore réalisé ne compte pas.
    const appelsSem  = appels.filter(a => this._estMoi(a.PIN_CDS) && a.Semaine_ISO === semaine && estAppelRealise(a)).length;
    const objVisites = Number(paramMap.ObjVisitesCDS || 8);
    const objAppels  = Number(paramMap.ObjAppelsSemaine || 10);

    // ── Top 5 relances urgentes (score / priorité) ──
    const prioRang = { URGENT: 0, HAUTE: 1, HAUT: 1, MOYENNE: 2, MOYEN: 2, BASSE: 3, STANDARD: 4 };
    const top5 = mesComptes
      .filter(c => ['REACTIVER', 'REACTIVER_URGENT', 'CHURN'].some(f => String(c.STATUT_COMPTE || '').toUpperCase().includes(f)))
      .sort((a, b) => {
        const ra = prioRang[String(a.Priorite || '').toUpperCase()] ?? 5;
        const rb = prioRang[String(b.Priorite || '').toUpperCase()] ?? 5;
        if (ra !== rb) return ra - rb;
        return CA(b.CA_FY26 ?? b['CA FY26 €'] ?? b.CA_FY25) - CA(a.CA_FY26 ?? a['CA FY26 €'] ?? a.CA_FY25);
      })
      .slice(0, 5);

    // ── Top 5 comptes actifs (CA_Q1FY27 > 0) ──
    const top5Actifs = mesComptes
      .map(c => ({ c, q1: CA(c.CA_Q1FY27 ?? c['CA Q1FY27 €']) }))
      .filter(x => x.q1 > 0)
      .sort((a, b) => b.q1 - a.q1)
      .slice(0, 5)
      .map(x => ({
        nom:  x.c.Nom_Compte || x.c.ID_Compte || '—',
        ville: x.c.Ville || '',
        caQ1: x.q1,
        statut: String(x.c.STATUT_COMPTE || '').toUpperCase() || '—',
      }));

    // Le graphique CA hebdo (W1→W13) est désormais calculé par _donneesFiltrables()
    // au moment du render, pas ici — cf. Bloc 1 §3 (filtres Quarter/commercial).
    const caFY26Mes = mesComptes.reduce((s, c) => s + CA(c.CA_FY26 ?? c['CA FY26 €']), 0);
    const caFY26Q   = caFY26Mes / 4; // base trimestrielle FY26 (4 quarters) — encore utilisé plus bas

    // ── Alertes actives lues depuis 🔔_NOTIFS (PIN_Destinataire = pin) ──
    const mesNotifs = (Array.isArray(notifs) ? notifs : [])
      .filter(n => Number(n.PIN_Destinataire) === pin)
      // N3-4 — non-lu = Statut_Lu false (boolean Supabase)
      .filter(n => !n.Statut_Lu)
      .sort((a, b) => {
        const ta = new Date(a.Timestamp || a.Date_Envoi || 0).getTime() || 0;
        const tb = new Date(b.Timestamp || b.Date_Envoi || 0).getTime() || 0;
        return tb - ta;
      })
      .slice(0, 6)
      .map(n => ({
        message: String(n.Message || '').trim() || '—',
        type:    String(n.Type_Notif || '').trim() || '—',
        cible:   String(n.ID_Cible || '').trim(),
      }));

    // ── Primes estimées Axe 1 ──
    const primesEstimees = (() => {
      const p = caObjectif > 0 ? caRealise / caObjectif * 100 : 0;
      if (p >= 120) return { montant: 500, label: '≥120% · P2+P3 hors plafond' };
      if (p >= 100) return { montant: 400, label: '100-119% · Palier P2' };
      if (p >= 80)  return { montant: 200, label: '80-99% · Palier P1' };
      return { montant: 0, label: `${Math.round(p)}% — seuil P1 à 80%` };
    })();

    // ── Activité 6 dernières semaines (graphique) ──
    const semaines6 = Array.from({length: 6}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (5 - i) * 7);
      return FiscalWeeks.codeDe(d);
    });
    const activiteSemaines = semaines6.map(sem => ({
      sem,
      visites: visites.filter(v => this._estMoi(v.PIN_CDS) && v.Semaine_ISO === sem).length,
      appels:  appels.filter(a => this._estMoi(a.PIN_CDS) && a.Semaine_ISO === sem && estAppelRealise(a)).length,
    }));

    // ── Ma base prospects (assignés, non archivés, hors imports base) ──
    const POT = { Fort: 0, Moyen: 1, Faible: 2 };
    const mesProspects = prospects
      .filter(p => { const src = String(p.Source_Import || '').toUpperCase(); return !src.includes('FLAVIE') && src !== 'BASE_PROSPECTS_RELANCER' && src !== 'ESI_VISITE_FROID'; })
      .filter(p => this._estMoi(p.PIN_CDS_Assigne))
      .filter(p => !['ARCHIVE', 'INTEGRE'].includes(String(p.STATUT_EMPOWER || '').toUpperCase()))
      .sort((a, b) => (POT[a.POTENTIEL] ?? 1) - (POT[b.POTENTIEL] ?? 1));

    return {
      semaine, quarter, caRealise, caObjectif, pct, pace,
      caFY27Obj, pctAnnuel, caRealiseFY27,
      caFY26Mes, caFY26Q, // BLOC 5 — référence FY26 pour comparaison
      comptesRouges, nextStepsDepasses, leadsATraiter,
      visitesAujourdhui, comptesAReactiver,
      visitesSem, appelsSem, objVisites, objAppels,
      top5, top5Actifs, mesNotifs,
      nbComptes: mesComptes.length, primesEstimees,
      activiteSemaines, mesProspects,
    };
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = `<div style="padding:16px">${skeletonKPI(2)}${skeletonListe(5)}</div>`;
      return;
    }
    if (this.state.erreur) {
      app.innerHTML = `<div class="erreur">Erreur : ${this.state.erreur}
        <br><br><button class="btn-secondaire" onclick="VueDashboardCDS.init()">Réessayer</button></div>`;
      return;
    }
    // Bloc 2 §1 — Reporting personnel CDS : même vue/données que l'Accueil,
    // rendu différent (analyse structurée plutôt que cockpit du jour) — même
    // principe que VueDashboardManager._contexteReporting(), sans dupliquer
    // les widgets déjà présents sur l'Accueil (camemberts/CA cumulé, déjà
    // filtrables par quarter/semaine/commercial depuis Phase 1).
    if (this._contexteReporting()) return this._renderReporting();
    const d = this.state.donnees;
    const f = this._donneesFiltrables();
    // BLOC 9 : CA via fmtCA → '—' si invalide/NaN, jamais de valeur incohérente
    const fmtEUR = v => {
      const s = (typeof window.fmtCA === 'function') ? window.fmtCA(v) : null;
      return (s && s !== '—') ? `${s} €` : '—';
    };
    const dateFr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const PACE = {
      ON_TRACK: { lbl: 'ON TRACK', cls: 'pace-ok' },
      WATCH:    { lbl: 'WATCH',    cls: 'pace-watch' },
      AT_RISK:  { lbl: 'AT RISK',  cls: 'pace-risk' },
    }[d.pace];
    const nbAlertes = d.comptesRouges.length + d.nextStepsDepasses.length + d.leadsATraiter.length;
    const potCoul   = { Fort: '#00b27e', Moyen: '#f59e0b', Faible: '#626264' };

    // ── Delta vs semaine précédente (Bloc 2 refonte desktop — audit UX §
    //    "Home / cockpit") : activiteSemaines couvre déjà 6 semaines glissantes,
    //    donc l'avant-dernière entrée est la semaine précédente réelle — pas de
    //    donnée inventée, on n'affiche un delta que là où on a l'historique. ──
    const semPrec = d.activiteSemaines[d.activiteSemaines.length - 2] || { visites: 0, appels: 0 };
    const deltaPill = (valeur) => {
      if (valeur === 0) return { txt: '= vs sem. dern.', bg: 'var(--c-bg)', color: 'var(--c-text-2)' };
      const signe = valeur > 0 ? '+' : '';
      return valeur > 0
        ? { txt: `▲ ${signe}${valeur} vs sem. dern.`, bg: 'rgba(45,158,107,.10)', color: 'var(--c-success)' }
        : { txt: `▼ ${valeur} vs sem. dern.`, bg: 'rgba(217,48,37,.08)', color: 'var(--c-danger)' };
    };
    const deltaVisites = deltaPill(d.visitesSem - semPrec.visites);
    const deltaAppels  = deltaPill(d.appelsSem  - semPrec.appels);

    const initiales = (Session.nom || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    app.innerHTML = `
      <!-- Header desktop Oltega — masqué mobile (CSS) -->
      <header class="dash-page-header">
        <div class="dash-ph-left">
          <div class="dash-ph-title">Bonjour, ${Session.nom || '—'}</div>
          <div class="dash-ph-date">${dateFr} · ${d.semaine}</div>
        </div>
        <div class="dash-ph-right">
          <span class="dash-ph-pace ${PACE.cls}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            ${PACE.lbl} · ${d.pct}% objectif
          </span>
          ${nbAlertes > 0 ? `<button onclick="Router.aller('#/comptes')" style="position:relative;border:none;background:var(--c-bg);border-radius:99px;padding:7px 10px;cursor:pointer;display:flex;align-items:center;border:1.5px solid var(--c-border)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:var(--c-danger);color:#fff;border-radius:50%;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${nbAlertes}</span>
          </button>` : ''}
          <div class="dash-ph-avatar" title="Déconnexion" onclick="Session.deconnecter();Router.aller('#/login')">${initiales}</div>
        </div>
      </header>

      <!-- Héro navy (mobile uniquement — masqué ≥900px via CSS) -->
      <div class="dash-hero">
        <div class="dash-hero-cycle">Cycle FY27 · ${d.semaine} · ${dateFr}</div>
        <div class="dash-hero-titre">Bonjour ${Session.nom || '—'}
          <button class="btn-deco" onclick="Session.deconnecter();Router.aller('#/login')" title="Déconnexion"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>
        </div>
        <div class="dash-hero-tuiles">
          <div class="hero-tuile">
            <div class="hero-tuile-lbl">Objectif ${d.quarter} FY27</div>
            <div class="hero-tuile-val">${fmtEUR(d.caRealise)} <span style="font-size:12px;font-weight:400;color:#A8C8FF">/ ${fmtEUR(d.caObjectif)}</span></div>
            <div class="hero-barre"><div class="hero-barre-fill" style="width:${Math.min(d.pct, 100)}%"></div></div>
            <div class="hero-tuile-sous">${PACE.lbl} · ${d.pct}% atteinte · PACE annuel ${d.pctAnnuel}%</div>
            <!-- BLOC 5 — CA FY26 référence + objectif annuel FY27 -->
            <div style="margin-top:6px;font-size:11px;color:#A8C8FF;display:flex;gap:12px">
              <span>Réf. FY26 : <strong style="color:#fff">${fmtEUR(d.caFY26Q)}/trim.</strong></span>
              <span>OBJ FY27 : <strong style="color:#fff">${fmtEUR(d.caFY27Obj)}</strong></span>
            </div>
          </div>
          <div class="hero-tuile">
            <div class="hero-tuile-lbl">Visites aujourd'hui</div>
            <div class="hero-tuile-val">${d.visitesAujourdhui.length} <span style="font-size:12px;font-weight:400;color:#A8C8FF">planifiée(s)</span></div>
            <div class="hero-tuile-sous">${d.visitesSem}/${d.objVisites} cette semaine · ${d.nbComptes} comptes</div>
          </div>
        </div>
      </div>

      <!-- KPI grid 4 cartes façon DASHBOARD_W09 -->
      <div class="kpi-grid-layout">
        ${kpiCard({ label: 'Comptes', value: d.nbComptes, accent: 'primary', onclick: "Router.aller('#/comptes')" })}
        ${kpiCard({ label: 'Visites sem.', value: `${d.visitesSem}/${d.objVisites}`, accent: d.visitesSem >= d.objVisites ? 'teal' : 'amber', onclick: "Router.aller('#/visites')", pills: [deltaVisites] })}
        ${kpiCard({ label: 'Appels sem.', value: `${d.appelsSem}/${d.objAppels}`, accent: d.appelsSem >= d.objAppels ? 'teal' : 'coral', onclick: "Router.aller('#/phoning')", pills: [deltaAppels] })}
        ${kpiCard({ label: 'Leads actifs', value: d.leadsATraiter.length, accent: d.leadsATraiter.length > 0 ? 'indigo' : 'teal', onclick: "Router.aller('#/empower-tracker')" })}
      </div>

      <div class="dash-body avec-nav">
        <div class="dash-col-main">

        <!-- CAMEMBERTS DYNAMIQUES VISITES/APPELS + CA CUMULÉ — Bloc 1 §2/§3
             (mutualisés avec VueDashboardManager, cf. js/dashboard-activite.js) -->
        ${window.renderBlocCamemberts(f, this._raw, 'VueDashboardCDS')}
        ${window.renderBlocCAHebdo(f, 'VueDashboardCDS', fmtEUR)}

        <!-- TOP 5 COMPTES ACTIFS + TOP 5 RELANCES — sous-grille 2 colonnes desktop large -->
        <div class="dash-grid-2col">
        ${d.top5Actifs.length > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">
            Top 5 comptes actifs ${d.quarter}FY27
            <span class="badge-compteur">${d.top5Actifs.length}</span>
            <button class="btn-lien" onclick="Router.aller('#/comptes-historiques')" style="margin-left:auto;font-size:12px">Base comptes →</button>
          </div>
          ${d.top5Actifs.map(c => `
            <div class="relance-ligne" onclick="Router.aller('#/comptes-historiques')">
              <div class="relance-nom">${c.nom}</div>
              <div class="relance-meta">
                ${c.ville ? `<span style="font-size:11px;color:var(--c-text-2)">${c.ville}</span>` : ''}
                <span style="font-size:10px;color:var(--c-text-2)">${c.statut}</span>
                <strong style="margin-left:auto;color:var(--c-success)">${fmtEUR(c.caQ1)}</strong>
              </div>
            </div>`).join('')}
        </div>` : ''}

        <!-- TOP 5 RELANCES URGENTES (score / priorité) -->
        ${d.top5.length > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">
            Top 5 relances urgentes
            <span class="badge-rouge badge-priorite">${d.top5.length}</span>
            <button class="btn-lien" onclick="Router.aller('#/comptes-historiques')" style="margin-left:auto;font-size:12px">Réactiver →</button>
          </div>
          ${d.top5.map(c => `
            <div class="relance-ligne" onclick="Router.aller('#/comptes-historiques')">
              <div class="relance-nom">${c.Nom_Compte || c.ID_Compte || '—'}</div>
              <div class="relance-meta">
                <span class="statut-pill statut-reactiver">${String(c.STATUT_COMPTE || '—').toUpperCase()}</span>
                ${c.Priorite ? `<span style="font-size:11px;font-weight:700;color:var(--c-cta)">${String(c.Priorite).toUpperCase()}</span>` : ''}
                <strong style="margin-left:auto">${fmtEUR(c.CA_FY26 ?? c['CA FY26 €'] ?? c.CA_FY25)}</strong>
              </div>
            </div>`).join('')}
        </div>` : ''}
        </div><!-- /dash-grid-2col -->

        <!-- ALERTES ACTIVES (🔔_NOTIFS) -->
        ${d.mesNotifs.length > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">Alertes actives <span class="badge-rouge badge-priorite">${d.mesNotifs.length}</span></div>
          <div class="dash-alertes">
            ${d.mesNotifs.map(n => `
              <div class="alerte-ligne" onclick="Router.aller('${this._routeNotif(n.type, n.cible)}')">
                <span style="font-size:10px;font-weight:700;color:var(--c-primary);text-transform:uppercase">${n.type}</span>
                <span style="margin-left:6px">${n.message}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- VISITES PLANIFIÉES AUJOURD'HUI -->
        <div class="bloc-fiche">
          <div class="bloc-titre">
            Planning visites aujourd'hui
            ${d.visitesAujourdhui.length ? `<span class="badge-compteur">${d.visitesAujourdhui.length}</span>` : ''}
            <button class="btn-lien" onclick="Router.aller('#/visites')" style="margin-left:auto;font-size:12px">Planning complet →</button>
          </div>
          ${d.visitesAujourdhui.length === 0
            ? `<div class="pas-de-donnees">Aucune visite planifiée aujourd'hui
               <br><button class="btn-primaire" style="margin-top:8px" onclick="Router.aller('#/visites')">+ Planifier une visite</button>
               </div>`
            : d.visitesAujourdhui.slice(0, 4).map(v => `
              <div class="relance-ligne" onclick="Router.aller('#/visites/cr/${v.ID_Visite || ''}')">
                <div class="relance-nom">${v.Nom_Compte || v.ID_Compte || '—'}</div>
                <div class="relance-meta">
                  <span class="statut-pill" style="background:var(--c-primary-10,#e6eeff);color:var(--c-primary)">planifiée</span>
                  ${v.Heure ? `<span style="font-size:12px;color:var(--c-text-2)">${v.Heure}</span>` : ''}
                  <button class="btn-lien" onclick="event.stopPropagation();VueVisites.ouvrirCR('${v.ID_Visite}')" style="font-size:11px;margin-left:auto">CR →</button>
                </div>
              </div>`).join('')
          }
        </div>

        <!-- LEADS EMPOWER À TRAITER + MA BASE PROSPECTS — sous-grille 2 colonnes desktop large -->
        <div class="dash-grid-2col">
        ${d.leadsATraiter.length > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">
            Leads EMPOWER à traiter
            <span class="badge-rouge badge-priorite">${d.leadsATraiter.length}</span>
            <button class="btn-lien" onclick="Router.aller('#/empower-tracker')" style="margin-left:auto;font-size:12px">Tracker →</button>
          </div>
          ${d.leadsATraiter.slice(0, 3).map(p => `
            <div class="relance-ligne" onclick="Router.aller('#/empower-tracker')">
              <div class="relance-nom">${p.Nom_Prospect || p.Nom_Compte || '—'}</div>
              <div class="relance-meta">
                <span class="statut-pill statut-reactiver">${p.STATUT_EMPOWER || 'Assigné'}</span>
                ${p.POTENTIEL ? `<span style="font-size:11px;font-weight:700;color:${potCoul[p.POTENTIEL]||'#888'}">${p.POTENTIEL}</span>` : ''}
              </div>
            </div>`).join('')}
          ${d.leadsATraiter.length > 3 ? `<div style="font-size:12px;color:var(--c-primary);text-align:center;padding:6px 0;cursor:pointer" onclick="Router.aller('#/empower-tracker')">+${d.leadsATraiter.length - 3} autres leads →</div>` : ''}
        </div>` : ''}

        <!-- MA BASE PROSPECTS -->
        ${d.mesProspects.length > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">
            Ma base prospects
            <span class="badge-compteur">${d.mesProspects.length}</span>
            <button class="btn-lien" onclick="Router.aller('#/phoning');setTimeout(()=>VuePhoning.setMode&&VuePhoning.setMode('LISTE'),600)" style="margin-left:auto;font-size:12px">Phoning liste →</button>
          </div>
          ${d.mesProspects.slice(0, 5).map(p => `
            <div class="relance-ligne">
              <div class="relance-nom">${p.Nom_Compte || p.Nom_Prospect || p.ID_Prospect || '—'}</div>
              <div class="relance-meta">
                ${p.POTENTIEL ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;background:${potCoul[p.POTENTIEL]||'#888'};color:#fff">${p.POTENTIEL}</span>` : ''}
                ${p.Ville ? `<span style="font-size:11px;color:var(--c-text-2)">${p.Ville}</span>` : ''}
                <span style="margin-left:auto;display:flex;gap:6px">
                  <button class="btn-lien" style="font-size:11px;display:flex;align-items:center;gap:3px" onclick="Router.aller('#/phoning/${p.ID_Prospect}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
                  <button class="btn-lien" style="font-size:11px;display:flex;align-items:center;gap:3px" onclick="Router.aller('#/empower-tracker')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></button>
                </span>
              </div>
            </div>`).join('')}
          ${d.mesProspects.length > 5 ? `
            <div style="font-size:12px;color:var(--c-primary);text-align:center;padding:6px 0;cursor:pointer"
                 onclick="Router.aller('#/empower-tracker')">
              +${d.mesProspects.length - 5} autres prospects → voir le Tracker
            </div>` : ''}
        </div>` : ''}
        </div><!-- /dash-grid-2col -->

        </div><!-- /dash-col-main -->

        <div class="dash-col-side">
        <!-- COMPTES HISTORIQUES À RÉACTIVER -->
        ${d.comptesAReactiver.length > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">
            Comptes à réactiver
            <span class="badge-compteur">${d.comptesAReactiver.length}</span>
            <button class="btn-lien" onclick="Router.aller('#/comptes-historiques')" style="margin-left:auto;font-size:12px">Voir historiques →</button>
          </div>
          ${d.comptesAReactiver.slice(0, 3).map(c => `
            <div class="relance-ligne" onclick="Router.aller('#/comptes-historiques')">
              <div class="relance-nom">${c.Nom_Compte || c.ID_Compte || '—'}</div>
              <div class="relance-meta">
                <span class="statut-pill statut-reactiver">${String(c.STATUT_COMPTE || '—').toUpperCase()}</span>
                <strong>${fmtEUR(c.CA_FY26 ?? c['CA FY26 €'] ?? c.CA_FY25)}</strong>
              </div>
            </div>`).join('')}
        </div>` : ''}

        <!-- ALERTES -->
        ${nbAlertes > 0 ? `
        <div class="bloc-fiche">
          <div class="bloc-titre">Alertes <span class="badge-rouge badge-priorite">${nbAlertes}</span></div>
          <div class="dash-alertes">
            ${d.comptesRouges.length ? `<div class="alerte-ligne" onclick="Router.aller('#/comptes')"><strong>${d.comptesRouges.length}</strong> compte(s) sans action récente</div>` : ''}
            ${d.nextStepsDepasses.length ? `<div class="alerte-ligne" onclick="Router.aller('#/comptes')"><strong>${d.nextStepsDepasses.length}</strong> next step(s) dépassé(s)</div>` : ''}
          </div>
        </div>` : ''}

        <!-- ACTIVITÉ SEMAINE ──  compteurs + objectifs -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Activité ${d.semaine}</div>
          <div class="dash-activite">
            <div class="activite-item">
              <div class="activite-val" style="color:${d.visitesSem >= d.objVisites ? 'var(--c-success)' : 'inherit'}">${d.visitesSem}<span>/${d.objVisites}</span></div>
              <div class="activite-lbl">Visites</div>
              <div style="width:100%;height:3px;background:var(--c-border);border-radius:99px;margin-top:4px">
                <div style="height:3px;border-radius:99px;background:${d.visitesSem >= d.objVisites ? 'var(--c-success)' : 'var(--c-primary)'};width:${Math.min(d.visitesSem/d.objVisites*100,100)}%"></div>
              </div>
            </div>
            <div class="activite-item">
              <div class="activite-val" style="color:${d.appelsSem >= d.objAppels ? 'var(--c-success)' : 'inherit'}">${d.appelsSem}<span>/${d.objAppels}</span></div>
              <div class="activite-lbl">Appels</div>
              <div style="width:100%;height:3px;background:var(--c-border);border-radius:99px;margin-top:4px">
                <div style="height:3px;border-radius:99px;background:${d.appelsSem >= d.objAppels ? 'var(--c-success)' : 'var(--c-cta)'};width:${Math.min(d.appelsSem/d.objAppels*100,100)}%"></div>
              </div>
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
          <div class="bloc-titre">Primes estimées ${d.quarter}
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
          <button class="raccourci" onclick="Router.aller('#/visites')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>Planning visites</span></button>
          <button class="raccourci" onclick="Router.aller('#/phoning')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>Phoning</span></button>
          <button class="raccourci" onclick="Router.aller('#/empower-tracker')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span>Tracker leads</span></button>
          <button class="raccourci" onclick="Router.aller('#/comptes-historiques')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg><span>Base comptes</span></button>
          <button class="raccourci" onclick="Router.aller('#/objectifs')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg><span>Objectifs</span></button>
          <button class="raccourci" onclick="Router.aller('#/primes')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg><span>Mes primes</span></button>
          ${Session.estManager() ? `
          <button class="raccourci" onclick="Router.aller('#/manager')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Vue équipe</span></button>
          <button class="raccourci" onclick="Router.aller('#/admin')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/></svg><span>Admin</span></button>` : ''}
        </div>
        </div><!-- /dash-col-side -->
      </div>
      <button title="+ Planifier une visite" class="dash-fab"
              onclick="VueVisites.ouvrirModal();Router.aller('#/visites')"
              style="position:fixed;bottom:calc(var(--safe-bottom, 0px) + 80px);right:16px;width:56px;height:56px;border-radius:50%;background:var(--c-primary);color:#fff;font-size:28px;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4);z-index:1000;display:flex;align-items:center;justify-content:center;line-height:1">+</button>
      ${NavBar('home')}
    `;
  },
};
