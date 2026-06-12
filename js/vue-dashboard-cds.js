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
    const pin      = Session.pin;
    const semaine  = getISOWeek();
    const paramMap = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
    const quarter  = paramMap.QuarterActif || 'Q1';

    // ── CA / objectif ──
    const obj = objectifs.find(o => Number(o.PIN_CDS) === pin);
    let caRealise = 0, caObjectif = 0;
    if (Session.voitTout()) {
      objectifs.forEach(o => {
        caRealise += Number(o[`${quarter}_CA_Realise`] || 0);
        caObjectif += Number(o[`${quarter}_Obj_Revise`] || o[`${quarter}_Obj_Initial`] || 0);
      });
    } else if (obj) {
      caRealise  = Number(obj[`${quarter}_CA_Realise`] || 0);
      caObjectif = Number(obj[`${quarter}_Obj_Revise`] || obj[`${quarter}_Obj_Initial`] || 0);
    }
    const pct  = caObjectif > 0 ? Math.round(caRealise / caObjectif * 100) : 0;
    const pace = pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK';

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
      .sort((a, b) => parseAmount(b.CA_FY25) - parseAmount(a.CA_FY25))
      .slice(0, 5);

    // ── Activité semaine ──
    const visitesSem = visites.filter(v => this._estMoi(v.PIN_CDS) && v.Semaine_ISO === semaine).length;
    const appelsSem  = appels.filter(a => this._estMoi(a.PIN_CDS) && a.Semaine_ISO === semaine).length;
    const objVisites = Number(paramMap.ObjVisitesCDS || 8);
    const objAppels  = Number(paramMap.ObjAppelsSemaine || 10);

    // ── Top 5 relances ──
    const top5 = mesComptes
      .filter(c => ['REACTIVER', 'REACTIVER_URGENT', 'CHURN'].some(f => String(c.STATUT_COMPTE || '').toUpperCase().includes(f)))
      .sort((a, b) => parseAmount(b.CA_FY25) - parseAmount(a.CA_FY25))
      .slice(0, 5);

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
      return getISOWeek(d);
    });
    const activiteSemaines = semaines6.map(sem => ({
      sem,
      visites: visites.filter(v => this._estMoi(v.PIN_CDS) && v.Semaine_ISO === sem).length,
      appels:  appels.filter(a => this._estMoi(a.PIN_CDS) && a.Semaine_ISO === sem).length,
    }));

    // ── Ma base prospects (assignés, non archivés) ──
    const POT = { Fort: 0, Moyen: 1, Faible: 2 };
    const mesProspects = prospects
      .filter(p => this._estMoi(p.PIN_CDS_Assigne))
      .filter(p => !['ARCHIVE', 'INTEGRE'].includes(String(p.STATUT_EMPOWER || '').toUpperCase()))
      .sort((a, b) => (POT[a.POTENTIEL] ?? 1) - (POT[b.POTENTIEL] ?? 1));

    return {
      semaine, quarter, caRealise, caObjectif, pct, pace,
      comptesRouges, nextStepsDepasses, leadsATraiter,
      visitesAujourdhui, comptesAReactiver,
      visitesSem, appelsSem, objVisites, objAppels,
      top5, nbComptes: mesComptes.length, primesEstimees,
      activiteSemaines, mesProspects,
    };
  },

  // ── Graphique SVG : activité hebdomadaire (barres visites + appels) ──
  _svgActivite(data) {
    if (!data || !data.length) return '';
    const maxVal = Math.max(...data.flatMap(d => [d.visites, d.appels]), 1);
    const W = 300, H = 84, BASE = H - 18, PAD = 2;
    const slotW = (W - PAD * 2) / data.length;
    const bw    = Math.max(3, Math.floor(slotW / 2) - 3);
    const scl   = (BASE - 14) / maxVal;

    const bars = data.map((d, i) => {
      const x  = PAD + i * slotW;
      const hV = d.visites > 0 ? Math.max(3, Math.round(d.visites * scl)) : 0;
      const hA = d.appels  > 0 ? Math.max(3, Math.round(d.appels  * scl)) : 0;
      return `
        <rect x="${x}" y="${BASE - hV}" width="${bw}" height="${hV}" fill="#0050FF" rx="2" opacity=".85"/>
        <rect x="${x + bw + 2}" y="${BASE - hA}" width="${bw}" height="${hA}" fill="#FF6D68" rx="2" opacity=".85"/>
        <text x="${x + slotW / 2 - 1}" y="${H - 2}" text-anchor="middle" font-size="9" fill="#626264">${d.sem.replace('S', '')}</text>
        ${d.visites ? `<text x="${x + bw/2}" y="${BASE - hV - 2}" text-anchor="middle" font-size="8" fill="#0050FF">${d.visites}</text>` : ''}
        ${d.appels  ? `<text x="${x + bw + 2 + bw/2}" y="${BASE - hA - 2}" text-anchor="middle" font-size="8" fill="#FF6D68">${d.appels}</text>` : ''}
      `;
    }).join('');

    return `
      <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
           style="width:100%;height:auto;display:block;margin:10px 0 4px">
        ${bars}
        <rect x="2" y="2" width="8" height="8" fill="#0050FF" rx="1"/>
        <text x="13" y="10" font-size="9" fill="#626264">Visites</text>
        <rect x="68" y="2" width="8" height="8" fill="#FF6D68" rx="1"/>
        <text x="79" y="10" font-size="9" fill="#626264">Appels</text>
      </svg>`;
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
    const potCoul   = { Fort: '#00b27e', Moyen: '#f59e0b', Faible: '#626264' };

    app.innerHTML = `
      <!-- Héro navy -->
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

        <!-- GRAPHIQUE ACTIVITÉ 6 SEMAINES -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📊 Activité — 6 dernières semaines</div>
          ${this._svgActivite(d.activiteSemaines)}
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--c-text-2);margin-top:4px;padding:0 2px">
            <span>Semaine ${d.activiteSemaines[0]?.sem || '—'}</span>
            <span>Semaine en cours : <strong>${d.visitesSem}v · ${d.appelsSem}a</strong></span>
          </div>
        </div>

        <!-- VISITES PLANIFIÉES AUJOURD'HUI -->
        <div class="bloc-fiche">
          <div class="bloc-titre">
            📅 Planning visites aujourd'hui
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
                  <button class="btn-lien" onclick="event.stopPropagation();VueVisites.ouvrirCR('${v.ID_Visite}');Router.aller('#/questionnaire')" style="font-size:11px;margin-left:auto">✍️ CR →</button>
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
            📋 Ma base prospects
            <span class="badge-compteur">${d.mesProspects.length}</span>
            <button class="btn-lien" onclick="Router.aller('#/phoning');setTimeout(()=>VuePhoning.setMode&&VuePhoning.setMode('LISTE'),600)" style="margin-left:auto;font-size:12px">Phoning liste →</button>
          </div>
          ${d.mesProspects.slice(0, 5).map(p => `
            <div class="relance-ligne">
              <div class="relance-nom">${p.Nom_Compte}</div>
              <div class="relance-meta">
                ${p.POTENTIEL ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;background:${potCoul[p.POTENTIEL]||'#888'};color:#fff">${p.POTENTIEL}</span>` : ''}
                ${p.Ville ? `<span style="font-size:11px;color:var(--c-text-2)">📍 ${p.Ville}</span>` : ''}
                <span style="margin-left:auto;display:flex;gap:6px">
                  <button class="btn-lien" style="font-size:11px" onclick="Router.aller('#/phoning/${p.ID_Prospect}')">📞</button>
                  <button class="btn-lien" style="font-size:11px" onclick="Router.aller('#/empower-tracker')">📋</button>
                </span>
              </div>
            </div>`).join('')}
          ${d.mesProspects.length > 5 ? `
            <div style="font-size:12px;color:var(--c-primary);text-align:center;padding:6px 0;cursor:pointer"
                 onclick="Router.aller('#/empower-tracker')">
              +${d.mesProspects.length - 5} autres prospects → voir le Tracker
            </div>` : ''}
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
          <button class="raccourci" onclick="Router.aller('#/visites')">📅<span>Planning visites</span></button>
          <button class="raccourci" onclick="Router.aller('#/phoning')">📞<span>Phoning</span></button>
          <button class="raccourci" onclick="Router.aller('#/empower-tracker')">▤<span>Tracker leads</span></button>
          <button class="raccourci" onclick="Router.aller('#/comptes-historiques')">🏢<span>Base comptes</span></button>
          <button class="raccourci" onclick="Router.aller('#/objectifs')">🎯<span>Objectifs</span></button>
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
