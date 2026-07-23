// ═══════════════════════════════════════
//  dashboard-activite.js — Camemberts visites/appels + CA cumulé, mutualisés
//  entre VueDashboardCDS (Admin/CDS) et VueDashboardManager (Channel) — cf.
//  Bloc 1 §2 : "possibilité pour Admin / Channel / Manager d'avoir la vue
//  consolidée de tous les commerciaux". Logique unique, cf. audit Bloc 4.
// ═══════════════════════════════════════

// ── Calcul pur : camemberts + CA hebdo, à partir des données brutes déjà
//    chargées par la vue appelante (comptes/visites/appels/objectifs/params).
//    Utilise Session.voitTout()/FilterState directement — aucune vue n'a
//    besoin de dupliquer cette logique, seulement de fournir `raw`. ──
function calculerCamembertsActivite(raw) {
  const { comptes, visites, appels, objectifs, params } = raw;
  const filtres  = FilterState.get();
  const paramMap = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
  const quarter  = filtres.quarter || paramMap.QuarterActif || 'Q1';
  const semaineSeule = filtres.semaine || null;

  const matchFiltre = (pinChamp) => {
    if (filtres.pinCommercial) return Number(pinChamp) === Number(filtres.pinCommercial);
    return Session.voitTout() || Number(pinChamp) === Session.pin;
  };
  const dansPeriode = (semaineIso) => {
    const s = String(semaineIso || '');
    if (!s.startsWith(quarter + '-')) return false;
    return semaineSeule ? s === semaineSeule : true;
  };

  const visitesFiltrees = visites.filter(v => !v.deleted && matchFiltre(v.PIN_CDS) && dansPeriode(v.Semaine_ISO));
  // Bloc Phoning (07/2026) — un appel planifié pas encore réalisé ne compte pas.
  const appelsFiltres   = appels.filter(a => !a.deleted && matchFiltre(a.PIN_CDS) && dansPeriode(a.Semaine_ISO) && estAppelRealise(a));

  // Vue consolidée (aucun commercial choisi, rôle Admin/Channel) → répartition
  // par commercial. Vue personnelle (CDS, ou commercial choisi) → par statut.
  const consolide = Session.voitTout() && !filtres.pinCommercial;
  const COULEURS = ['#0050FF', '#FF6D68', '#00b27e', '#f59e0b', '#9333ea', '#626264'];

  const parCommercial = (lignes, ns) => {
    const parPin = new Map();
    lignes.forEach(l => {
      const pin = Number(l.PIN_CDS) || 0;
      parPin.set(pin, (parPin.get(pin) || 0) + 1);
    });
    return [...parPin.entries()].map(([pin, value], i) => ({
      label: window.resolveCDS(pin), value, color: COULEURS[i % COULEURS.length],
      onclick: `${ns}.setCommercialCamembert(${pin})`,
    }));
  };
  const parStatut = (lignes, champStatut, libelles) => {
    const parS = new Map();
    lignes.forEach(l => {
      const s = String(l[champStatut] || '').toLowerCase() || 'autre';
      parS.set(s, (parS.get(s) || 0) + 1);
    });
    return [...parS.entries()].map(([s, value], i) => ({
      label: libelles[s] || s, value, color: COULEURS[i % COULEURS.length],
    }));
  };

  return {
    quarter, semaineSeule, filtres, consolide, objectifs, comptes,
    // camembertVisites/camembertAppels sont construits par la vue appelante
    // (elle connaît son propre `ns` pour les onclick) via _segmentsVisites/_segmentsAppels.
    _visitesFiltrees: visitesFiltrees, _appelsFiltres: appelsFiltres,
    _parCommercial: parCommercial, _parStatut: parStatut,
  };
}

// Construit les segments visites/appels pour un `ns` (nom de vue) donné —
// séparé de calculerCamembertsActivite() car les onclick doivent connaître
// le nom de la vue qui les rend (VueDashboardCDS vs VueDashboardManager).
function segmentsCamembertsActivite(f, ns) {
  const camembertVisites = f.consolide
    ? f._parCommercial(f._visitesFiltrees, ns)
    : f._parStatut(f._visitesFiltrees, 'Statut_Visite', { realisee: 'Réalisées', planifiee: 'Planifiées', en_cours: 'En cours', manquee: 'Manquées', annulee: 'Annulées' });
  const camembertAppels = f.consolide
    ? f._parCommercial(f._appelsFiltres, ns)
    : f._parStatut(f._appelsFiltres, 'Statut_Appel', { interesse: 'Intéressé', a_rappeler: 'À rappeler', nrp: 'NRP', pas_interesse: 'Pas intéressé', vente_conclue: 'Vente conclue' });
  return { camembertVisites, camembertAppels };
}

// CA cumulé (Bloc 1 §3) — cf. commentaire détaillé dans vue-dashboard-cds.js
// historique : caRealiseQ est le cumul RÉALISÉ À CE JOUR, pas un total de fin
// de trimestre — la courbe s'arrête à la semaine fiscale en cours, pas de
// projection inventée au-delà.
function calculerCAHebdo(f) {
  const { comptes, objectifs, quarter, filtres } = f;
  const CA = v => (typeof window.parseCA === 'function' ? (window.parseCA(v) ?? 0) : Number(v) || 0);
  const pinPourCA = filtres.pinCommercial || (Session.voitTout() ? null : Session.pin);
  let caRealiseQ = 0, caFY26Q4 = 0;
  if (pinPourCA) {
    const o = objectifs.find(o => Number(o.PIN_CDS) === Number(pinPourCA));
    caRealiseQ = o ? CA(o[`${quarter}_CA_Realise`]) : 0;
    const mesComptesPin = comptes.filter(c => Number(c.PIN_CDS_Assigne) === Number(pinPourCA));
    caFY26Q4 = mesComptesPin.reduce((s, c) => s + CA(c.CA_FY26), 0) / 4;
  } else {
    caRealiseQ = objectifs.reduce((s, o) => s + CA(o[`${quarter}_CA_Realise`]), 0);
    caFY26Q4 = comptes.reduce((s, c) => s + CA(c.CA_FY26), 0) / 4;
  }
  const semaineActuelle = FiscalWeeks.semaineDe();
  const semaineCourante = (semaineActuelle && semaineActuelle.quarter === quarter) ? semaineActuelle.semaine : 13;
  const caHebdo = FiscalWeeks.semainesDuQuarter(quarter).map((s, i) => {
    const semaineIdx = i + 1;
    const projete = semaineIdx > semaineCourante;
    const fracFY27 = Math.min(semaineIdx, semaineCourante) / semaineCourante;
    return {
      wk: s.label,
      fy27: projete ? null : Math.round(caRealiseQ * fracFY27),
      fy26: Math.round(caFY26Q4 * (semaineIdx / 13)),
      projete,
    };
  });
  return { caHebdo, caRealiseQ };
}

// ── Graphique SVG : CA hebdo cumulé FY27 vs FY26 (W1→W13, semaines Norton
//    réelles) — la portion au-delà de la semaine fiscale en cours n'est pas
//    dessinée (donnée future inconnue), pas de projection inventée. ──
function svgCAHebdo(data) {
  if (!data || !data.length) return '';
  const maxVal = Math.max(...data.flatMap(d => [d.fy27, d.fy26]).filter(v => v !== null), 1);
  const W = 300, H = 96, PADL = 4, PADR = 4, TOP = 16, BASE = H - 16;
  const n = data.length;
  const xOf = i => PADL + (i * (W - PADL - PADR) / (n - 1));
  const yOf = v => BASE - (v / maxVal) * (BASE - TOP);

  const ligne = (key, color) => {
    const pts = data
      .map((d, i) => (d[key] !== null && d[key] !== undefined) ? `${xOf(i).toFixed(1)},${yOf(d[key]).toFixed(1)}` : null)
      .filter(Boolean).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  };
  const fy27Vals = data.map(d => d.fy27);
  const dernierIdx = fy27Vals.lastIndexOf(fy27Vals.filter(v => v !== null).pop());
  const marqueur = dernierIdx >= 0
    ? `<circle cx="${xOf(dernierIdx).toFixed(1)}" cy="${yOf(data[dernierIdx].fy27).toFixed(1)}" r="3" fill="#0050FF"/>`
    : '';
  const labels = data.map((d, i) =>
    (i % 2 === 0)
      ? `<text x="${xOf(i).toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="8" fill="#626264">${d.wk}</text>`
      : ''
  ).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         style="width:${W}px;max-width:100%;height:auto;display:block;margin:8px 0 4px">
      ${ligne('fy26', '#9aa0a6')}
      ${ligne('fy27', '#0050FF')}
      ${marqueur}
      ${labels}
      <rect x="4" y="2" width="8" height="8" fill="#0050FF" rx="1"/>
      <text x="15" y="10" font-size="9" fill="#1a1a1a">CA FY27 (à ce jour)</text>
      <rect x="102" y="2" width="8" height="8" fill="#9aa0a6" rx="1"/>
      <text x="113" y="10" font-size="9" fill="#626264">CA FY26 (réf.)</text>
    </svg>`;
}

// ── Bloc HTML complet camemberts + filtres — `ns` = nom de la vue appelante
//    (VueDashboardCDS ou VueDashboardManager), utilisé pour les onclick. ──
function renderBlocCamemberts(f, raw, ns) {
  const { camembertVisites, camembertAppels } = segmentsCamembertsActivite(f, ns);
  return `
  <div class="bloc-fiche">
    <div class="bloc-titre">Répartition activité — ${f.quarter}${f.semaineSeule ? ' · ' + f.semaineSeule.split('-')[1] : ''}</div>
    <div class="dash-filtres-camembert">
      ${['Q1','Q2','Q3','Q4'].map(q => `<button class="btn-filtre ${f.quarter === q ? 'actif' : ''}" onclick="${ns}.setQuarterCamembert('${q}')">${q}</button>`).join('')}
      <button class="btn-filtre ${f.semaineSeule ? 'actif' : ''}" onclick="${ns}.toggleSemaineCamembert()">Semaine en cours</button>
      ${Session.voitTout() ? `
      <select onchange="${ns}.setCommercialCamembert(this.value)">
        <option value="">Vue consolidée</option>
        ${(raw.objectifs || []).map(o => `<option value="${o.PIN_CDS}" ${Number(f.filtres.pinCommercial) === Number(o.PIN_CDS) ? 'selected' : ''}>${window.resolveCDS(o.PIN_CDS)}</option>`).join('')}
      </select>` : ''}
    </div>
    ${f.filtres.pinCommercial ? `<div class="dash-camembert-actif-pin">👤 ${window.resolveCDS(f.filtres.pinCommercial)}<button onclick="${ns}.setCommercialCamembert('')">✕ retirer</button></div>` : ''}
    <div class="dash-camemberts-grid">
      <div class="dash-camembert-bloc">
        ${window.svgDonut(camembertVisites, { centreValeur: camembertVisites.reduce((s,x)=>s+x.value,0), centreLabel: 'Visites' })}
        ${window.legendeDonut(camembertVisites)}
      </div>
      <div class="dash-camembert-bloc">
        ${window.svgDonut(camembertAppels, { centreValeur: camembertAppels.reduce((s,x)=>s+x.value,0), centreLabel: 'Appels' })}
        ${window.legendeDonut(camembertAppels)}
      </div>
    </div>
    ${f.consolide ? `<div style="font-size:11px;color:var(--c-text-2);margin-top:8px">Cliquez un secteur pour filtrer sur ce commercial</div>` : ''}
  </div>`;
}

// ── Bloc HTML CA cumulé — même `ns`, `fmtEUR` fourni par la vue appelante. ──
function renderBlocCAHebdo(f, ns, fmtEUR) {
  const { caHebdo, caRealiseQ } = calculerCAHebdo(f);
  return `
  <div class="bloc-fiche">
    <div class="bloc-titre">CA cumulé ${f.quarter} FY27 vs FY26${f.filtres.pinCommercial ? ' · ' + window.resolveCDS(f.filtres.pinCommercial) : ''}</div>
    ${svgCAHebdo(caHebdo)}
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--c-text-2);margin-top:2px;padding:0 2px">
      <span>W1 → W13 · courbe arrêtée à la semaine en cours</span>
      <span>FY27 à ce jour : <strong style="color:var(--c-primary)">${fmtEUR(caRealiseQ)}</strong></span>
    </div>
  </div>`;
}

window.calculerCamembertsActivite = calculerCamembertsActivite;
window.renderBlocCamemberts = renderBlocCamemberts;
window.renderBlocCAHebdo = renderBlocCAHebdo;
