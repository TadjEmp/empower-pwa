/* Vue équipe (manager) : mise en page SaaS alignée sur Pilotage (KPI, panneaux, listes, graphiques au survol).
   Les calculs restent dans VueDashboardManager._calculer ; ce fichier ne fait que le rendu. */
(function () {
  const M = window.VueDashboardManager; if (!M) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eur = n => (window.formatEuro ? formatEuro(n) : Math.round(n) + ' €');
  const ico = p => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const I = {
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    link: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  };
  const pctCls = p => (p >= 100 ? 'ok' : p >= 80 ? 'mid' : 'risk');
  const colPace = p => (p >= 100 ? '#343F48' : p >= 80 ? '#6B7580' : '#FF6D68');

  Object.assign(M, {
    _htmlEquipe(d) {
      const dateFr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const vis = d.equipe.reduce((s, e) => s + e.visitesSem, 0), app = d.equipe.reduce((s, e) => s + e.appelsSem, 0);
      const nRisk = d.equipe.filter(e => e.pace === 'AT_RISK').length;

      const kpis = [
        { l: 'CA total ' + d.quarter, v: eur(d.caTotal), s: `sur ${eur(d.objTotal)} d'objectif${window.Atterrissage ? ' · ' + Atterrissage.texte(d.caTotal, d.objTotal, d.quarter) : ''}`, go: '#/objectifs' },
        { l: 'Atteinte objectif', v: d.pctTotal + ' %', s: nRisk ? `${nRisk} commercial${nRisk > 1 ? 'aux' : ''} à risque` : 'Équipe dans la trajectoire', go: '#/objectifs', alerte: d.pctTotal < 80 },
        { l: 'Leads pipeline', v: d.assignes, s: `${d.integres} intégré${d.integres > 1 ? 's' : ''}, ${d.tauxIntegration} % de taux`, go: '#/empower-tracker' },
        { l: 'Activité semaine', v: `${vis} · ${app}`, s: 'visites · appels', go: '#/visites' },
        { l: 'Comptes en retard', v: d.comptesRouges.length, s: "d'action au-delà du seuil", go: '#/comptes', alerte: d.comptesRouges.length > 0 },
        { l: 'Visites manquées', v: d.visitesManquees.length, s: 'planifiées non réalisées', go: '#/visites', alerte: d.visitesManquees.length > 0 },
      ].map(k => `<button class="pilo-kpi${k.alerte ? ' alerte' : ''}" onclick="Router.aller('${k.go}')"><span class="pilo-kpi-l">${k.l}</span><strong>${k.v}</strong><small>${k.s}</small><i>›</i></button>`).join('');

      const membres = d.equipe.map(e => `<button class="pilo-member eq-membre" onclick="Router.aller('#/comptes?cds=${e.pin}')" data-tip="${esc(e.nom)}&#10;${eur(e.ca)} sur ${eur(e.obj)} (${e.pct} %)">
          ${window.avatarCDS ? avatarCDS(e.pin, 34) : `<span class="pilo-avatar">${esc((e.nom || '?')[0])}</span>`}
          <span class="pilo-member-main"><b>${esc(e.nom)}</b><span class="pilo-bar"><i style="width:${Math.min(100, e.pct)}%;background:${colPace(e.pct)}"></i></span><span>${eur(e.ca)} sur ${eur(e.obj)}${e.caFY26 > 0 ? ` · réf. FY26 ${eur(e.caFY26)}` : ''}</span></span>
          <span class="eq-pct ${pctCls(e.pct)}">${e.pct} %</span>
          <span class="eq-chips"><em>${e.visitesSem} vis.</em><em>${e.appelsSem} app.</em><em>${e.leadsEnCours} leads</em><em title="Visites réalisées ${d.quarter} au résultat positif ou statut Empower avancé">Transfo ${e.tauxTransfo === null ? 'n.c.' : e.tauxTransfo + ' %'}</em></span>
        </button>`).join('');

      const al = [];
      d.equipe.filter(e => e.pace !== 'ON_TRACK').forEach(e => al.push({ t: e.nom, s: `${e.pct} % de l'objectif ${d.quarter}`, ic: I.alert, late: e.pace === 'AT_RISK', go: `#/comptes?cds=${e.pin}` }));
      if (d.leadsBloques.length) al.push({ t: `${d.leadsBloques.length} lead${d.leadsBloques.length > 1 ? 's' : ''} sans action`, s: 'depuis plus de 7 jours', ic: I.clock, late: true, go: '#/empower-tracker' });
      if (d.comptesRouges.length) al.push({ t: `${d.comptesRouges.length} compte${d.comptesRouges.length > 1 ? 's' : ''} en retard`, s: "d'action, à relancer", ic: I.clock, late: true, go: '#/comptes' });
      if (d.visitesManquees.length) al.push({ t: `${d.visitesManquees.length} visite${d.visitesManquees.length > 1 ? 's' : ''} manquée${d.visitesManquees.length > 1 ? 's' : ''}`, s: 'à replanifier', ic: I.pin, go: '#/visites' });
      if (d.comptesNonAttribues.length) al.push({ t: `${d.comptesNonAttribues.length} compte${d.comptesNonAttribues.length > 1 ? 's' : ''} non attribué${d.comptesNonAttribues.length > 1 ? 's' : ''}`, s: 'dont créés par Sell-In', ic: I.users, js: "VueComptes.state.filtreStatut='SANS_CDS';Router.aller('#/comptes')" });
      const alertes = al.map(a => `<button class="pilo-task" onclick="${a.js || `Router.aller('${a.go}')`}"><span class="pilo-task-ico${a.late ? ' late' : ''}">${ico(a.ic)}</span><span class="pilo-task-main"><b>${esc(a.t)}</b><span>${esc(a.s)}</span></span><span class="pilo-chev">›</span></button>`).join('');

      const mxF = Math.max(1, ...d.pipelineStages.map(s => s.n));
      const funnel = d.pipelineStages.map(s => `<div class="pilo-hbar" data-tip="${esc(s.lbl)}&#10;${s.n} lead${s.n > 1 ? 's' : ''}" tabindex="0"><span class="pilo-hbar-l">${esc(s.lbl)}</span><span class="pilo-hbar-t"><i style="width:${s.n ? Math.max(3, s.n / mxF * 100) : 0}%;background:${s.coul}"></i></span><b>${s.n}</b></div>`).join('');

      const filtre = this.state.filtrePipelineFroidCDS || null, ligne = filtre ? d.pipelineFroidParCDS.find(c => c.pin === filtre) : null, tot = ligne || d.pipelineFroidTotal;
      const LBL = { PROSPECTION_FROIDE: 'Prospection froide', SUIVI_ACTIF: 'Suivi actif', ONBOARDING_EMPOWER: 'Onboarding Empower' }, COUL = { PROSPECTION_FROIDE: '#8C9BB8', SUIVI_ACTIF: '#FF6D68', ONBOARDING_EMPOWER: '#343F48' };
      const mxP = Math.max(1, ...Object.keys(LBL).map(t => tot[t] || 0));
      const froid = Object.keys(LBL).map(t => `<div class="pilo-hbar" data-tip="${LBL[t]}&#10;${tot[t] || 0} visite${(tot[t] || 0) > 1 ? 's' : ''}" tabindex="0"><span class="pilo-hbar-l">${LBL[t]}</span><span class="pilo-hbar-t"><i style="width:${tot[t] ? Math.max(3, tot[t] / mxP * 100) : 0}%;background:${COUL[t]}"></i></span><b>${tot[t] || 0}</b></div>`).join('');

      // Activité équipe sur 6 semaines : colonnes groupées interactives
      const A = d.activiteEquipe, mxA = Math.max(1, ...A.flatMap(x => [x.visites, x.appels])), W = 360, H = 150, base = 120, sl = W / A.length;
      const cols = A.map((x, i) => { const hv = Math.round(x.visites / mxA * 92), ha = Math.round(x.appels / mxA * 92), x0 = i * sl + sl / 2;
        return `<g data-tip="${esc(x.sem)}&#10;${x.visites} visite${x.visites > 1 ? 's' : ''}, ${x.appels} appel${x.appels > 1 ? 's' : ''}" tabindex="0"><rect x="${i * sl}" y="0" width="${sl}" height="${H}" fill="transparent"/>
          <rect x="${x0 - 15}" y="${base - Math.max(hv, 3)}" width="13" height="${Math.max(hv, 3)}" rx="6" fill="#343F48"/><rect x="${x0 + 2}" y="${base - Math.max(ha, 3)}" width="13" height="${Math.max(ha, 3)}" rx="6" fill="#FF6D68"/>
          <text x="${x0}" y="${base + 18}" text-anchor="middle" font-size="11" fill="currentColor">${esc(String(x.sem).replace(/^.*-/, ''))}</text><text x="${x0 - 8}" y="${base - Math.max(hv, 3) - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${x.visites}</text><text x="${x0 + 9}" y="${base - Math.max(ha, 3) - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${x.appels}</text></g>`; }).join('');
      const activite = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Activité équipe sur 6 semaines" data-tipzone>${cols}</svg>
        <div class="pilo-leg pilo-leg-row" style="flex-direction:row;gap:16px;margin-top:8px"><div><i style="background:#343F48"></i>Visites</div><div><i style="background:#FF6D68"></i>Appels</div></div>`;

      const sel = 'width:100%;margin-top:4px;padding:9px 10px;border:1px solid var(--border-medium);border-radius:10px;font:inherit;background:var(--bg-surface);color:inherit';
      const saisie = `<details class="eq-details"><summary>Saisir le CA réalisé à date</summary>
          <p class="pilo-note">La valeur remplace le sell-in du quarter sélectionné pour le commercial choisi.</p>
          <div class="eq-form"><label>Commercial<select id="saisie-ca-cds" style="${sel}">${d.equipe.map(e => `<option value="${e.pin}">${esc(e.nom)}</option>`).join('')}</select></label>
          <label>Quarter<select id="saisie-ca-quarter" style="${sel}">${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `<option value="${q}" ${q === d.quarter ? 'selected' : ''}>${q} FY27</option>`).join('')}</select></label>
          <label>CA réalisé (€)<input id="saisie-ca-valeur" type="number" min="0" step="0.01" placeholder="18500" style="${sel}"></label>
          <label>Commentaire<input id="saisie-ca-note" type="text" placeholder="Sell-in S24 confirmé" style="${sel}"></label></div>
          <button class="btn-primaire" onclick="VueDashboardManager.saisirCA()" style="margin-top:12px">Enregistrer le CA</button><div id="saisie-ca-feedback" style="font-size:13px;min-height:18px;margin-top:8px"></div></details>`;

      const liens = [['Visites', '#/visites', 'Export CSV filtré'], ['Phoning', '#/phoning', 'Journal des appels'], ['Exports', '#/admin', '7 exports thématiques'], ['Mailing', '#/mailing', 'Campagnes'], ['Historiques', '#/comptes-historiques', 'Comptes passés'], ['Objectifs', '#/objectifs', 'Suivi des objectifs']]
        .map(([t, h, s]) => `<button class="eq-lien" onclick="Router.aller('${h}')"><b>${t}</b><span>${s}</span></button>`).join('');

      return `<div class="pilo eq">
        <div class="print-only" style="display:none"><h1>COPIL ESI, ${d.semaine} FY27</h1><p>${dateFr} · Empower Sales Intelligence · Norton France</p></div>
        <div class="pilo-contexte"><div class="pilo-ariane"><span>Pilotage</span><span>›</span><strong>Équipe</strong></div>
          <button class="pilo-lien no-print" onclick="VueDashboardManager.exporterCOPIL()" aria-label="Exporter le COPIL en PDF">${ico(I.print)} Exporter le COPIL</button></div>
        <div class="pilo-intro"><h2>Vue équipe</h2><p>${dateFr} · ${d.semaine} · ${d.quarter} FY27</p></div>
        <div class="pilo-kpis" style="margin-top:14px">${kpis}</div>
        <div class="pilo-grille">
          <section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">CA ${d.quarter}</span><h3>Performance par commercial</h3></div><button class="pilo-lien" onclick="Router.aller('#/objectifs')">Objectifs ›</button></div>${membres || '<p class="pilo-vide">Aucun objectif renseigné.</p>'}
            <p class="pilo-note">Vis. et app. : semaine ${d.semaine}. Transfo : part des visites réalisées ${d.quarter} au résultat positif ou à statut Empower avancé.</p></section>
          <div><section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Alertes</span><h3>À traiter par l'équipe</h3></div></div>${alertes || '<p class="pilo-vide">Aucune alerte active.</p>'}<div id="ns-alerte">${window.NonSuivis ? NonSuivis.htmlAlerte() : ''}</div></section>
            <section class="pilo-panneau no-print" style="margin-top:14px"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Assistant IA</span><h3>Synthèse hebdo</h3></div></div><p class="pilo-note" style="margin:0 0 10px">Gemini analyse les chiffres de la semaine et rédige bilan, alertes et recommandations.</p>
              <button id="btn-gem07" class="btn-secondaire" onclick="VueDashboardManager.syntheseHebdo()">Générer la synthèse</button><div id="gem07-zone" style="display:none;margin-top:12px;font-size:13px;line-height:1.7;white-space:pre-wrap;padding:12px;background:var(--c-control);border-radius:10px"></div></section></div>
        </div>
        <div class="pilo-grille pilo-grille-g">
          <section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Pipeline</span><h3>Leads par statut</h3></div><button class="pilo-lien" onclick="Router.aller('#/empower-tracker')">Tracker ›</button></div>${funnel}<p class="pilo-note">Taux d'intégration : <b>${d.tauxIntegration} %</b></p></section>
          <section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Terrain</span><h3>Visites par type</h3></div>
            <select onchange="VueDashboardManager.filtrerPipelineFroid(this.value?Number(this.value):null)" style="padding:6px 10px;border:1px solid var(--border-medium);border-radius:10px;font:inherit;font-size:12px;background:var(--bg-surface);color:inherit"><option value="">Toute l'équipe</option>${d.equipe.map(e => `<option value="${e.pin}" ${filtre === e.pin ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select></div>${froid}</section>
          <section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Activité</span><h3>6 dernières semaines</h3></div></div>${activite}</section>
          <section class="pilo-panneau no-print"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Données</span><h3>Saisie du CA</h3></div></div>${saisie}</section>
        </div>
        <section class="pilo-panneau no-print" style="margin-top:14px"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Extraction et reporting</span><h3>Accès rapides</h3></div></div><div class="eq-liens">${liens}</div></section>
      </div>`;
    },
  });
})();
