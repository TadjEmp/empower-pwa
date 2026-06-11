// ═══════════════════════════════════════
//  vue-dashboard-manager.js — Vue équipe v7
//  Graphiques SVG inline : pipeline funnel + per-CDS CA bars
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
    const paramMap   = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
    const quarter    = paramMap.QuarterActif || 'Q1';
    const semaine    = getISOWeek();
    const seuilRouge = Number(paramMap.SEUIL_ROUGE_JOURS || 5);

    const equipe = objectifs.map(o => {
      const pin = Number(o.PIN_CDS);
      const ca  = Number(o[`${quarter}_CA_Realise`] || 0);
      const obj = Number(o[`${quarter}_Obj_Revise`] || o[`${quarter}_Obj_Initial`] || 0);
      const pct = obj > 0 ? Math.round(ca / obj * 100) : 0;
      return {
        pin, nom: o.Nom_CDS, ca, obj, pct,
        pace:       pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK',
        visitesSem: visites.filter(v => Number(v.PIN_CDS) === pin && v.Semaine_ISO === semaine).length,
        appelsSem:  appels.filter(a => Number(a.PIN_CDS) === pin && a.Semaine_ISO === semaine).length,
        leadsEnCours: prospects.filter(p =>
          Number(p.PIN_CDS_Assigne) === pin &&
          !['ARCHIVE','INTEGRE'].includes(String(p.STATUT_EMPOWER||'').toUpperCase())
        ).length,
      };
    });

    // ── Alertes équipe ──
    const now = Date.now();
    const leadsBloques = prospects.filter(p => {
      if (['ARCHIVE','INTEGRE'].includes(String(p.STATUT_EMPOWER||'').toUpperCase())) return false;
      const ref = p.Date_prochaine_action || p.Timestamp || p.Date_Import;
      return p.PIN_CDS_Assigne && ref && (now - new Date(ref).getTime()) / 86400000 > 7;
    });
    const comptesRouges = comptes.filter(c => {
      const d = c.Date_Derniere_Action ? new Date(c.Date_Derniere_Action).getTime() : 0;
      return d && (now - d) / 86400000 > seuilRouge;
    });

    const integres        = prospects.filter(p => String(p.Flag_converti).toUpperCase() === 'TRUE').length;
    const assignes        = prospects.filter(p => p.PIN_CDS_Assigne).length;
    const tauxIntegration = assignes > 0 ? Math.round(integres / assignes * 100) : 0;
    const caTotal         = equipe.reduce((s, e) => s + e.ca, 0);
    const objTotal        = equipe.reduce((s, e) => s + e.obj, 0);

    // ── Entonnoir pipeline par statut ──
    const STAT_LABELS = {
      SAISIE: 'À traiter', ASSIGNE: 'Assignés', EN_COURS: 'En cours',
      COMPTE_CREE: 'Compte créé', INTEGRE: 'Intégrés',
    };
    const STAT_COULEURS = {
      SAISIE: '#0050FF', ASSIGNE: '#4D9EFF', EN_COURS: '#f59e0b',
      COMPTE_CREE: '#9333ea', INTEGRE: '#00b27e',
    };
    const pipelineStages = Object.entries(STAT_LABELS).map(([id, lbl]) => ({
      id, lbl, coul: STAT_COULEURS[id],
      n: prospects.filter(p => String(p.STATUT_EMPOWER || '').toUpperCase() === id).length,
    }));

    // ── Activité semaine par CDS (6 dernières semaines) ──
    const semaines6 = Array.from({length: 6}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (5 - i) * 7);
      return getISOWeek(d);
    });
    const activiteEquipe = semaines6.map(sem => ({
      sem,
      visites: visites.filter(v => v.Semaine_ISO === sem).length,
      appels:  appels.filter(a => a.Semaine_ISO === sem).length,
    }));

    return {
      quarter, semaine, equipe, leadsBloques, comptesRouges,
      tauxIntegration, integres, assignes, caTotal, objTotal,
      pctTotal: objTotal > 0 ? Math.round(caTotal / objTotal * 100) : 0,
      pipelineStages, activiteEquipe,
    };
  },

  exporterCOPIL() { window.print(); },

  async syntheseHebdo() {
    const btn = document.getElementById('btn-gem07');
    const zone = document.getElementById('gem07-zone');
    if (!btn || !zone) return;
    btn.disabled = true; btn.textContent = '⏳ Gemini génère…';
    zone.style.display = 'block';
    zone.textContent = '⏳ Analyse de la semaine en cours…';
    try {
      const texte = await GeminiAPI.gem07_syntheseHebdo(this.state.d);
      zone.style.color = 'var(--c-text)';
      zone.textContent = texte || '(réponse vide)';
      Toast.afficher('✅ Synthèse hebdo générée', 'succes');
    } catch(e) {
      zone.style.color = 'var(--c-danger)';
      zone.textContent = '❌ ' + e.message;
    } finally {
      btn.disabled = false; btn.textContent = '✨ Synthèse hebdo IA';
    }
  },

  // ── SVG : entonnoir pipeline ──
  _svgFunnel(stages) {
    const max  = Math.max(...stages.map(s => s.n), 1);
    const W    = 290;
    const ROW  = 36;
    const H    = stages.length * ROW + 4;
    const bars = stages.map((s, i) => {
      const barW = s.n > 0 ? Math.max(8, Math.round(s.n / max * 200)) : 2;
      const y    = i * ROW + 2;
      return `
        <rect x="0" y="${y}" width="${barW}" height="24" fill="${s.coul}" rx="3" opacity=".9"/>
        <text x="${barW + 8}" y="${y + 16}" font-size="12" fill="#0E0D30">
          <tspan font-weight="700" fill="${s.coul}">${s.n}</tspan>
          <tspan fill="#626264"> ${s.lbl}</tspan>
        </text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
                 style="width:100%;height:auto;display:block;margin-top:10px">${bars}</svg>`;
  },

  // ── SVG : barres CA par CDS ──
  _svgCaEquipe(equipe) {
    const maxVal = Math.max(...equipe.map(e => Math.max(e.ca, e.obj)), 1);
    const W    = 290;
    const ROW  = 46;
    const H    = equipe.length * ROW + 4;
    const PACE_COL = { ON_TRACK: '#00b27e', WATCH: '#f59e0b', AT_RISK: '#FA0000' };
    const bars = equipe.map((e, i) => {
      const wObj = Math.max(4, Math.round(e.obj / maxVal * 210));
      const wCA  = e.ca > 0 ? Math.max(4, Math.round(e.ca / maxVal * 210)) : 0;
      const y    = i * ROW + 2;
      const col  = PACE_COL[e.pace];
      return `
        <text x="0" y="${y + 11}" font-size="11" font-weight="700" fill="#0E0D30">${e.nom.toUpperCase()}</text>
        <rect x="0" y="${y + 15}" width="${wObj}" height="14" fill="#E8E8ED" rx="3"/>
        <rect x="0" y="${y + 15}" width="${wCA}"  height="14" fill="${col}"   rx="3" opacity=".88"/>
        <text x="${wObj + 6}" y="${y + 26}" font-size="10" fill="${col}" font-weight="700">${e.pct}%</text>
        <text x="${wCA > 20 ? wCA - 4 : wCA + 4}" y="${y + 25}" font-size="9" fill="${wCA > 40 ? '#fff' : col}" text-anchor="${wCA > 20 ? 'end' : 'start'}">${formatEUR(e.ca)}</text>
      `;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
                 style="width:100%;height:auto;display:block;margin-top:8px">${bars}</svg>`;
  },

  // ── SVG : activité équipe 6 semaines ──
  _svgActiviteEquipe(data) {
    if (!data || !data.length) return '';
    const max  = Math.max(...data.flatMap(d => [d.visites, d.appels]), 1);
    const W    = 290;
    const H    = 80;
    const BASE = H - 18;
    const PAD  = 2;
    const slotW = (W - PAD * 2) / data.length;
    const bw    = Math.max(3, Math.floor(slotW / 2) - 3);
    const scl   = (BASE - 10) / max;
    const bars  = data.map((d, i) => {
      const x  = PAD + i * slotW;
      const hV = d.visites > 0 ? Math.max(3, Math.round(d.visites * scl)) : 0;
      const hA = d.appels  > 0 ? Math.max(3, Math.round(d.appels  * scl)) : 0;
      return `
        <rect x="${x}" y="${BASE - hV}" width="${bw}" height="${hV}" fill="#0050FF" rx="2" opacity=".8"/>
        <rect x="${x + bw + 2}" y="${BASE - hA}" width="${bw}" height="${hA}" fill="#FF6D68" rx="2" opacity=".8"/>
        <text x="${x + slotW / 2 - 1}" y="${H - 2}" text-anchor="middle" font-size="9" fill="#626264">${d.sem.replace('S', '')}</text>
      `;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
                 style="width:100%;height:auto;display:block;margin-top:8px">
      ${bars}
      <rect x="2" y="2" width="8" height="8" fill="#0050FF" rx="1"/>
      <text x="13" y="10" font-size="9" fill="#626264">Visites équipe</text>
      <rect x="90" y="2" width="8" height="8" fill="#FF6D68" rx="1"/>
      <text x="101" y="10" font-size="9" fill="#626264">Appels équipe</text>
    </svg>`;
  },

  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement vue équipe…</div>';
      return;
    }
    const d      = this.state.d;
    const PACE   = {
      ON_TRACK: { lbl: '🟢', cls: 'pace-ok' },
      WATCH:    { lbl: '🟡', cls: 'pace-watch' },
      AT_RISK:  { lbl: '🔴', cls: 'pace-risk' },
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

        <!-- TUILES STATS -->
        <div class="stat-tuiles">
          <div class="stat-tuile">
            <div class="stat-tuile-lbl">CA total ${d.quarter}</div>
            <div class="stat-tuile-val">${formatEuro(d.caTotal)}</div>
            <div style="font-size:11px;color:var(--c-text-2);margin-top:2px">/ ${formatEuro(d.objTotal)} obj. · <strong style="color:${d.pctTotal>=100?'var(--c-success)':d.pctTotal>=80?'var(--c-warning)':'var(--c-danger)'}">${d.pctTotal}%</strong></div>
          </div>
          <div class="stat-tuile bleu">
            <div class="stat-tuile-lbl">Leads pipeline</div>
            <div class="stat-tuile-val">${d.assignes}</div>
            <div style="font-size:11px;color:#A8C8FF;margin-top:2px">${d.integres} intégrés · ${d.tauxIntegration}% taux</div>
          </div>
          <div class="stat-tuile ciel">
            <div class="stat-tuile-lbl">Activité semaine</div>
            <div class="stat-tuile-val">${d.equipe.reduce((s,e)=>s+e.visitesSem,0)}v · ${d.equipe.reduce((s,e)=>s+e.appelsSem,0)}a</div>
            <div style="font-size:11px;margin-top:2px">visites · appels</div>
          </div>
        </div>

        <!-- PACE CONSOLIDÉ -->
        <div class="bloc-fiche dash-pace">
          <div class="bloc-titre">Équipe — Pace CA ${d.quarter}
            <span class="pace-badge ${d.pctTotal >= 100 ? 'pace-ok' : d.pctTotal >= 80 ? 'pace-watch' : 'pace-risk'}">${d.pctTotal}%</span>
          </div>
          <div class="pace-chiffres">
            <strong>${formatEuro(d.caTotal)}</strong><span>/ ${formatEuro(d.objTotal)}</span>
          </div>
          <div class="pace-barre"><div class="pace-barre-fill ${d.pctTotal >= 100 ? 'pace-ok' : d.pctTotal >= 80 ? 'pace-watch' : 'pace-risk'}" style="width:${Math.min(d.pctTotal, 100)}%"></div></div>
        </div>

        <!-- GRAPHIQUE CA PAR CDS (SVG) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📊 CA réalisé vs objectif par CDS — ${d.quarter}</div>
          ${this._svgCaEquipe(d.equipe)}
          <div style="display:flex;gap:16px;font-size:11px;color:var(--c-text-2);margin-top:8px">
            <span><span style="display:inline-block;width:10px;height:10px;background:#E8E8ED;border-radius:2px;vertical-align:middle"></span> Objectif</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#00b27e;border-radius:2px;vertical-align:middle"></span> On Track</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;vertical-align:middle"></span> Watch</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#FA0000;border-radius:2px;vertical-align:middle"></span> At Risk</span>
          </div>
        </div>

        <!-- TABLEAU CDS -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Détail performance par CDS</div>
          <div class="tableau-equipe">
            <div class="te-ligne te-head">
              <span>CDS</span><span>CA / OBJ</span><span>%</span><span>📅</span><span>📞</span><span>🎯</span>
            </div>
            ${d.equipe.map(e => `
            <div class="te-ligne" onclick="Router.aller('#/comptes?cds=${e.pin}')" style="cursor:pointer">
              <span><strong>${PACE[e.pace].lbl} ${e.nom}</strong></span>
              <span style="font-size:12px">${formatEuro(e.ca)} / ${formatEuro(e.obj)}</span>
              <span class="pace-badge ${PACE[e.pace].cls}">${e.pct}%</span>
              <span>${e.visitesSem}</span>
              <span>${e.appelsSem}</span>
              <span>${e.leadsEnCours}</span>
            </div>`).join('')}
          </div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">📅 visites ${d.semaine} · 📞 appels ${d.semaine} · 🎯 leads actifs</p>
        </div>

        <!-- ENTONNOIR PIPELINE EMPOWER (SVG) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📋 Entonnoir pipeline EMPOWER</div>
          ${this._svgFunnel(d.pipelineStages)}
          <div style="display:flex;gap:12px;margin-top:10px;flex-wrap:wrap">
            <button class="btn-lien" onclick="Router.aller('#/empower-tracker')" style="font-size:12px">Voir le Tracker →</button>
            <span style="font-size:11px;color:var(--c-text-2)">Taux intégration : <strong>${d.tauxIntegration}%</strong></span>
          </div>
        </div>

        <!-- GRAPHIQUE ACTIVITÉ ÉQUIPE (SVG) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📈 Activité équipe — 6 semaines</div>
          ${this._svgActiviteEquipe(d.activiteEquipe)}
        </div>

        <!-- ALERTES ÉQUIPE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">⚠️ Alertes équipe</div>
          <div class="dash-alertes">
            ${d.equipe.filter(e => e.pace !== 'ON_TRACK').map(e => `
              <div class="alerte-ligne">${PACE[e.pace].lbl} <strong>${e.nom}</strong> — ${e.pct}% de l'objectif ${d.quarter}</div>`).join('')}
            ${d.leadsBloques.length ? `<div class="alerte-ligne no-print" onclick="Router.aller('#/empower-tracker')">⏳ <strong>${d.leadsBloques.length}</strong> lead(s) sans action > 7 jours</div>` : ''}
            ${d.comptesRouges.length ? `<div class="alerte-ligne no-print" onclick="Router.aller('#/comptes')">🔴 <strong>${d.comptesRouges.length}</strong> compte(s) en retard d'action</div>` : ''}
            ${!d.leadsBloques.length && !d.comptesRouges.length && d.equipe.every(e => e.pace === 'ON_TRACK') ? '<div class="pas-de-donnees">Aucune alerte 🎉</div>' : ''}
          </div>
        </div>

        <!-- GEM-07 Synthèse hebdo équipe -->
        <div class="bloc-fiche no-print">
          <div class="bloc-titre">✨ Assistant IA — Synthèse hebdo équipe</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:10px">Gemini analyse les KPIs de la semaine et génère un bilan, alertes, tendances et recommandations.</p>
          <button id="btn-gem07" class="btn-secondaire" onclick="VueDashboardManager.syntheseHebdo()">✨ Synthèse hebdo IA</button>
          <div id="gem07-zone"
               style="display:none;margin-top:12px;font-size:13px;line-height:1.7;
                      white-space:pre-wrap;padding:12px;background:var(--c-bg);
                      border-radius:var(--radius-sm);border:1px solid var(--c-border)"></div>
        </div>

        <!-- EX-5 : EXTRACTION & REPORTING -->
        <div class="bloc-fiche no-print">
          <div class="bloc-titre">📤 Extraction & Reporting</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">Sélectionnez une période et lancez l'export filtré.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn-secondaire" style="flex:1;min-width:120px;padding:14px 10px;text-align:center"
                    onclick="Router.aller('#/visites')">
              <div style="font-size:20px;margin-bottom:4px">📋</div>
              <div style="font-size:12px;font-weight:700">Visites</div>
              <div style="font-size:11px;color:var(--c-text-2)">Export CSV filtré</div>
            </button>
            <button class="btn-secondaire" style="flex:1;min-width:120px;padding:14px 10px;text-align:center"
                    onclick="Router.aller('#/phoning')">
              <div style="font-size:20px;margin-bottom:4px">📞</div>
              <div style="font-size:12px;font-weight:700">Phoning</div>
              <div style="font-size:11px;color:var(--c-text-2)">Journal des appels</div>
            </button>
            <button class="btn-secondaire" style="flex:1;min-width:120px;padding:14px 10px;text-align:center"
                    onclick="Router.aller('#/admin')">
              <div style="font-size:20px;margin-bottom:4px">📦</div>
              <div style="font-size:12px;font-weight:700">Exports CSV</div>
              <div style="font-size:11px;color:var(--c-text-2)">7 exports thématiques</div>
            </button>
          </div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:10px">
            💡 Dans Visites / Phoning, utilisez le bouton 📤 en haut à droite pour filtrer par période.
          </p>
        </div>

        <!-- RACCOURCIS MANAGER -->
        <div class="dash-raccourcis no-print">
          <button class="raccourci" onclick="Router.aller('#/empower-tracker')">📊<span>Pipeline</span></button>
          <button class="raccourci" onclick="Router.aller('#/comptes-historiques')">🏢<span>Historiques</span></button>
          <button class="raccourci" onclick="Router.aller('#/phoning')">📞<span>Phoning</span></button>
          <button class="raccourci" onclick="Router.aller('#/objectifs')">🎯<span>Objectifs</span></button>
          <button class="raccourci" onclick="Router.aller('#/admin')">📥<span>Exports</span></button>
          <button class="raccourci" onclick="Router.aller('#/admin')">⚙️<span>Admin</span></button>
        </div>
      </div>
      ${NavBar('home')}
    `;
  },
};
