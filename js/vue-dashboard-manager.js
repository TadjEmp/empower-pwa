// ═══════════════════════════════════════
//  vue-dashboard-manager.js — Vue équipe v9 — BUG-07 contraste · BUG-08 saisie CA
//  Graphiques SVG inline : pipeline funnel + per-CDS CA bars
//  BLOC 4 : Home ALEXANDRA (CHANNEL_MANAGER) — vue onboarding lecture seule dédiée
// ═══════════════════════════════════════

window.VueDashboardManager = {

  state: null,

  async init() {
    if (!Session.voitTout()) { Router.aller('#/dashboard'); return; }
    // BLOC 4 — Alexandra (CHANNEL_MANAGER) a une home onboarding dédiée, lecture seule.
    if (Session.estChannel && Session.estChannel()) { return this.initChannel(); }
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

  // ════════════════════════════════════════════════════════════════
  //  BLOC 4 — HOME ALEXANDRA (CHANNEL_MANAGER) — LECTURE SEULE
  //  Aucune donnée sell-in brute, aucun CA/volume/prix détaillé.
  // ════════════════════════════════════════════════════════════════
  async initChannel() {
    this.state = { chargement: true, dc: null };
    this.render();
    try {
      const [prospects, objectifs, params] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
      ]);
      // BUG-07 : peuple le registre CDS avant le calcul des taux par CDS
      if (typeof initCDSRegistry === 'function') initCDSRegistry(objectifs);
      this.state.dc = this._calculerChannel({ prospects, objectifs, params });
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  _calculerChannel({ prospects, objectifs, params }) {
    const norm = v => String(v || '').trim().toUpperCase();
    const now  = Date.now();
    // BUG-07 : quarter dynamique depuis PARAMS
    const paramMap = Object.fromEntries((params || []).map(p => [p.Parametre, p.Valeur]));
    const quarter  = paramMap.QuarterActif || 'Q1';

    // Exclure imports base Flavie/BASE_PROSPECTS_RELANCER + hors-base Visites, non supprimés.
    const leads = prospects.filter(p => {
      const src = norm(p.Source_Import);
      return norm(p.Flag_traite) !== 'DELETED' &&
        !src.includes('FLAVIE') && src !== 'BASE_PROSPECTS_RELANCER' && src !== 'ESI_VISITE_FROID';
    });

    // ── Compteurs pipeline par STATUT_EMPOWER (vocabulaire réel) ──
    // Traiter = ASSIGNE + SAISIE · En cours = EN_COURS (+ COMPTE_CREE) · Intégré = INTEGRE · Archivé = ARCHIVE
    let cTraiter = 0, cEnCours = 0, cIntegre = 0, cArchive = 0;
    leads.forEach(p => {
      const s = norm(p.STATUT_EMPOWER);
      if (s === 'ASSIGNE' || s === 'SAISIE')       cTraiter++;
      else if (s === 'EN_COURS' || s === 'COMPTE_CREE') cEnCours++;
      else if (s === 'INTEGRE')                     cIntegre++;
      else if (s === 'ARCHIVE')                     cArchive++;
    });
    const compteurs = [
      { id: 'TRAITER',  lbl: 'À traiter', n: cTraiter, coul: '#0050FF' },
      { id: 'EN_COURS', lbl: 'En cours',  n: cEnCours, coul: '#f59e0b' },
      { id: 'INTEGRE',  lbl: 'Intégré',   n: cIntegre, coul: '#00b27e' },
      { id: 'ARCHIVE',  lbl: 'Archivé',   n: cArchive, coul: '#626264' },
    ];

    // ── Taux d'intégration par CDS (%) — assignés vs intégrés ──
    // Regroupement par prénom résolu (jamais de PIN affiché).
    const parCDS = {};
    leads.forEach(p => {
      const pinOuNom = p.PIN_CDS_Assigne || p.Nom_CDS;
      const prenom   = resolveCDS(pinOuNom);
      if (prenom === '—') return;           // lead non assigné → exclu du taux
      if (!parCDS[prenom]) parCDS[prenom] = { nom: prenom, assignes: 0, integres: 0 };
      parCDS[prenom].assignes++;
      if (norm(p.STATUT_EMPOWER) === 'INTEGRE' || norm(p.Flag_converti) === 'TRUE') parCDS[prenom].integres++;
    });
    const tauxParCDS = Object.values(parCDS)
      .map(c => ({ ...c, taux: c.assignes > 0 ? Math.round(c.integres / c.assignes * 100) : 0 }))
      .sort((a, b) => b.taux - a.taux);

    // ── CA réalisé par CDS avec LABEL SOURCE visible (sell-in / saisie manuelle) ──
    // Lecture seule. Pas de sell-in brut, pas de détail volumes/prix.
    const caParCDS = (objectifs || []).map(o => {
      const prenom = resolveCDS(o.PIN_CDS || o.Nom_CDS);
      if (prenom === '—') return null;
      // détecte une saisie manuelle via la note "[Manuel]" posée par Tadjidine (BUG-08)
      const noteQ = ['Q1','Q2','Q3','Q4']
        .map(q => String(o[`${q}_Note_Saisie`] || ''))
        .join(' ');
      const manuel = /\[manuel\]/i.test(noteQ);
      // BUG-07 : utiliser le quarter actif dynamique, pas Q1 hardcodé
      const caBrut = parseCA(
        o[`${quarter}_CA_Realise`] ?? o.FY27_CA_Realise ?? o.CA_Realise
      );
      return {
        nom: prenom,
        ca: caBrut,
        caStr: fmtCA(caBrut),
        source: manuel ? 'saisie manuelle' : 'sell-in',
      };
    }).filter(Boolean)
      .sort((a, b) => (b.ca ?? -1) - (a.ca ?? -1));

    // ── 10 derniers leads INTEGRE ──
    const dateRef = p =>
      p.PREMIERE_COMMANDE_DATE || p.Date_prochaine_action || p.Timestamp || p.Date_Import || '';
    const derniersIntegres = leads
      .filter(p => norm(p.STATUT_EMPOWER) === 'INTEGRE')
      .map(p => ({
        nom:    p.Nom_Compte || '—',
        cds:    resolveCDS(p.PIN_CDS_Assigne || p.Nom_CDS),
        origine: p.ORIGINE || '—',
        date:   dateRef(p),
      }))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 10);

    // ── Alerte Welcome Pack : WELCOME_PACK_DATE vide & ancienneté ≥ J14 ──
    const ancienneteJours = p => {
      const ref = p.Date_Import || p.Timestamp || p.Date_prochaine_action;
      const t = ref ? new Date(ref).getTime() : 0;
      return t ? Math.floor((now - t) / 86400000) : null;
    };
    const alerteWelcome = leads
      .filter(p => {
        const s = norm(p.STATUT_EMPOWER);
        if (s === 'ARCHIVE') return false;
        const wp = String(p.WELCOME_PACK_DATE || '').trim();
        if (wp) return false;                 // Welcome Pack déjà envoyé
        const age = ancienneteJours(p);
        return age !== null && age >= 14;
      })
      .map(p => ({
        nom: p.Nom_Compte || '—',
        cds: resolveCDS(p.PIN_CDS_Assigne || p.Nom_CDS),
        jours: ancienneteJours(p),
      }))
      .sort((a, b) => (b.jours || 0) - (a.jours || 0));

    // ── Leads ARCHIVE / blocage ──
    const leadsArchive = leads
      .filter(p => norm(p.STATUT_EMPOWER) === 'ARCHIVE')
      .map(p => ({
        nom:  p.Nom_Compte || '—',
        cds:  resolveCDS(p.PIN_CDS_Assigne || p.Nom_CDS),
        note: String(p.NOTE_BLOCAGE || p.Note_Blocage || p.FLAG_ACTION || '').trim() || '—',
      }));

    const totalPipeline   = cTraiter + cEnCours + cIntegre + cArchive;
    const tauxIntegration = (totalPipeline - cArchive) > 0
      ? Math.round(cIntegre / (totalPipeline - cArchive) * 100) : 0;

    return {
      compteurs, tauxParCDS, caParCDS, derniersIntegres,
      alerteWelcome, leadsArchive, totalPipeline, tauxIntegration,
    };
  },

  _calculer({ objectifs, visites, appels, prospects, comptes, params }) {
    const paramMap   = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
    const quarter    = paramMap.QuarterActif || 'Q1';
    const semaine    = getISOWeek();
    const seuilRouge = Number(paramMap.SEUIL_ROUGE_JOURS || 5);

    // Périmètre pipeline : exclure imports base + hors-base Visites + supprimés
    const norm = v => String(v || '').trim().toUpperCase();
    const leadsTracker = prospects.filter(p => {
      const src = norm(p.Source_Import);
      return norm(p.Flag_traite) !== 'DELETED' &&
        !src.includes('FLAVIE') && src !== 'BASE_PROSPECTS_RELANCER' && src !== 'ESI_VISITE_FROID';
    });

    // Le manager est aussi commercial terrain : il figure dans la perf équipe.
    const equipe = objectifs.map(o => {
      const pin    = Number(o.PIN_CDS);
      const ca     = Number(o[`${quarter}_CA_Realise`] || 0);
      const obj    = Number(o[`${quarter}_Obj_Revise`] || o[`${quarter}_Obj_Initial`] || 0);
      const pct    = obj > 0 ? Math.round(ca / obj * 100) : 0;
      // BLOC 5 — référence FY26 : annuel ÷ 4 pour comparer au quarter actif
      const caFY26Annual = Number(o.FY26_CA_Realise || o.CA_FY26 || 0);
      const caFY26 = caFY26Annual > 0 ? Math.round(caFY26Annual / 4) : 0;
      return {
        pin, nom: o.Nom_CDS, ca, obj, pct, caFY26,
        pace:       pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK',
        visitesSem: visites.filter(v => Number(v.PIN_CDS) === pin && v.Semaine_ISO === semaine).length,
        appelsSem:  appels.filter(a => Number(a.PIN_CDS) === pin && a.Semaine_ISO === semaine).length,
        leadsEnCours: leadsTracker.filter(p =>
          Number(p.PIN_CDS_Assigne) === pin &&
          !['ARCHIVE','INTEGRE'].includes(String(p.STATUT_EMPOWER||'').toUpperCase())
        ).length,
      };
    });

    // ── Alertes équipe ──
    const now = Date.now();
    const leadsBloques = leadsTracker.filter(p => {
      if (['ARCHIVE','INTEGRE'].includes(String(p.STATUT_EMPOWER||'').toUpperCase())) return false;
      const ref = p.Date_prochaine_action || p.Timestamp || p.Date_Import;
      return p.PIN_CDS_Assigne && ref && (now - new Date(ref).getTime()) / 86400000 > 7;
    });
    const comptesRouges = comptes.filter(c => {
      const d = c.Date_Derniere_Action ? new Date(c.Date_Derniere_Action).getTime() : 0;
      return d && (now - d) / 86400000 > seuilRouge;
    });

    const integres        = leadsTracker.filter(p => String(p.Flag_converti).toUpperCase() === 'TRUE').length;
    const assignes        = leadsTracker.filter(p => p.PIN_CDS_Assigne).length;
    const tauxIntegration = assignes > 0 ? Math.round(integres / assignes * 100) : 0;
    const caTotal         = equipe.reduce((s, e) => s + e.ca, 0);
    const objTotal        = equipe.reduce((s, e) => s + e.obj, 0);
    const caFY26Total     = equipe.reduce((s, e) => s + (e.caFY26 || 0), 0);

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
      n: leadsTracker.filter(p => String(p.STATUT_EMPOWER || '').toUpperCase() === id).length,
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
      tauxIntegration, integres, assignes, caTotal, objTotal, caFY26Total,
      pctTotal: objTotal > 0 ? Math.round(caTotal / objTotal * 100) : 0,
      pipelineStages, activiteEquipe,
    };
  },

  exporterCOPIL() { window.print(); },

  // BUG-08 : enregistre le CA réalisé sur la ligne objectif du CDS
  async saisirCA() {
    const pin     = Number(document.getElementById('saisie-ca-cds')?.value);
    const quarter = document.getElementById('saisie-ca-quarter')?.value;
    const valStr  = document.getElementById('saisie-ca-valeur')?.value;
    const note    = document.getElementById('saisie-ca-note')?.value || '';
    const fb      = document.getElementById('saisie-ca-feedback');
    if (!pin || !quarter || !valStr) {
      if (fb) { fb.style.color = 'var(--c-danger)'; fb.textContent = '⚠️ Remplissez CDS, quarter et CA.'; }
      return;
    }
    const val = parseAmount(valStr);
    if (val > 500000) {
      if (fb) { fb.style.color = 'var(--c-danger)'; fb.textContent = '⚠️ Montant aberrant (> 500 000 €).'; }
      return;
    }
    if (fb) { fb.style.color = 'var(--c-text-2)'; fb.textContent = '⏳ Enregistrement…'; }
    try {
      const objectifs = await SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES');
      const ligne = objectifs.find(o => Number(o.PIN_CDS) === pin);
      if (!ligne) throw new Error('CDS introuvable dans objectifs');
      const champ = `${quarter}_CA_Realise`;
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES', String(ligne.PIN_CDS), {
        [champ]: val,
        ...(note ? { [`${quarter}_Note_Saisie`]: `[Manuel] ${note}` } : {}),
      });
      await SheetsAPI.viderCache('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES');
      if (fb) { fb.style.color = 'var(--c-success)'; fb.textContent = `✅ CA ${quarter} de ${resolveCDS(pin)} mis à jour : ${formatEuro(val)}`; }
      Toast.afficher(`✅ CA ${quarter} — ${resolveCDS(pin)} : ${formatEuro(val)}`, 'succes');
      // Rafraîchit le dashboard après 1.5s
      setTimeout(() => this.init(), 1500);
    } catch(e) {
      if (fb) { fb.style.color = 'var(--c-danger)'; fb.textContent = '❌ ' + e.message; }
    }
  },

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
        <text x="${barW + 8}" y="${y + 16}" font-size="12" fill="var(--c-title)">
          <tspan font-weight="700" fill="${s.coul}">${s.n}</tspan>
          <tspan fill="var(--c-text-2)"> ${s.lbl}</tspan>
        </text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
                 style="width:100%;height:auto;display:block;margin-top:10px">${bars}</svg>`;
  },

  // ── SVG : barres CA par CDS ──
  _svgCaEquipe(equipe) {
    const maxVal = Math.max(...equipe.map(e => Math.max(e.ca, e.obj, e.caFY26 || 0)), 1);
    const W    = 290;
    const ROW  = 52;
    const H    = equipe.length * ROW + 4;
    const PACE_COL = { ON_TRACK: '#00b27e', WATCH: '#f59e0b', AT_RISK: '#FA0000' };
    const bars = equipe.map((e, i) => {
      const wObj   = Math.max(4, Math.round(e.obj / maxVal * 210));
      const wCA    = e.ca > 0 ? Math.max(4, Math.round(e.ca / maxVal * 210)) : 0;
      const wFY26  = e.caFY26 > 0 ? Math.max(4, Math.round(e.caFY26 / maxVal * 210)) : 0;
      const y      = i * ROW + 2;
      const col    = PACE_COL[e.pace];
      const pctStr = `${e.pct}%`;
      const xPct   = wObj + 6;
      const caInside = wCA > 40;
      const caX      = wCA > 20 ? wCA - 4 : xPct + pctStr.length * 6 + 6;
      const caAnchor = wCA > 20 ? 'end' : 'start';
      return `
        <text x="0" y="${y + 11}" font-size="11" font-weight="700" fill="var(--c-title)">${e.nom.toUpperCase()}</text>
        <rect x="0" y="${y + 15}" width="${wObj}" height="12" fill="var(--c-border)" rx="3"/>
        <rect x="0" y="${y + 15}" width="${wCA}"  height="12" fill="${col}"   rx="3" opacity=".88"/>
        <text x="${xPct}" y="${y + 25}" font-size="10" fill="var(--c-title)" font-weight="700">${pctStr}</text>
        <text x="${caX}" y="${y + 24}" font-size="9" fill="${caInside ? '#fff' : '#0E0D30'}" text-anchor="${caAnchor}">${formatEUR(e.ca)}</text>
        ${wFY26 > 0 ? `
        <rect x="0" y="${y + 32}" width="${wFY26}" height="8" fill="none" stroke="#9333ea" stroke-width="1.5" stroke-dasharray="3 2" rx="2"/>
        <text x="${wFY26 + 4}" y="${y + 40}" font-size="9" fill="#9333ea">FY26 ${formatEUR(e.caFY26)}</text>` : ''}
      `;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
                 style="width:100%;height:auto;display:block;margin-top:8px">
      ${bars}
    </svg>`;
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
        <rect x="${x}" y="${BASE - hV}" width="${bw}" height="${hV}" fill="var(--c-primary)" rx="2" opacity=".8"/>
        <rect x="${x + bw + 2}" y="${BASE - hA}" width="${bw}" height="${hA}" fill="var(--c-cta)" rx="2" opacity=".8"/>
        <text x="${x + slotW / 2 - 1}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--c-title)">${d.sem.replace('S', '')}</text>
      `;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
                 style="width:100%;height:auto;display:block;margin-top:8px">
      ${bars}
      <rect x="2" y="2" width="8" height="8" fill="var(--c-primary)" rx="1"/>
      <text x="13" y="10" font-size="9" fill="var(--c-text-2)">Visites équipe</text>
      <rect x="90" y="2" width="8" height="8" fill="var(--c-cta)" rx="1"/>
      <text x="101" y="10" font-size="9" fill="var(--c-text-2)">Appels équipe</text>
    </svg>`;
  },

  // ── BLOC 4 : rendu HOME ALEXANDRA (onboarding, lecture seule) ──
  renderChannel() {
    const app = document.getElementById('app');
    const dc  = this.state.dc;
    const dateFr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const badgeSource = src =>
      `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;vertical-align:middle;
        ${src === 'saisie manuelle'
          ? 'background:#FFF1EC;color:#C2410C'
          : 'background:#E8F0FF;color:#0050FF'}">${src}</span>`;

    app.innerHTML = `
      <header class="header-vue no-print" style="display:flex;align-items:center;justify-content:space-between">
        <h1>Onboarding EMPOWER</h1>
        <div style="display:flex;gap:6px">
          <button class="btn-retour" title="Actualiser"
                  onclick="SheetsAPI.viderCache('EMPOWER_MDB','📋_PROSPECTS').then(()=>VueDashboardManager.initChannel())">🔄</button>
          <button class="btn-deco" onclick="Session.deconnecter();Router.aller('#/login')" title="Déconnexion">⏻</button>
        </div>
      </header>

      <div class="dash-body avec-nav">
        <p class="dash-date" style="color:var(--c-text-2);font-family:Montserrat,sans-serif;font-size:13px">${dateFr} · Suivi FY27</p>

        <!-- COMPTEURS PIPELINE -->
        <div class="stat-tuiles">
          ${dc.compteurs.map(c => `
            <div class="stat-tuile" style="border-top:3px solid ${c.coul}">
              <div class="stat-tuile-lbl">${c.lbl}</div>
              <div class="stat-tuile-val" style="color:${c.coul}">${c.n}</div>
            </div>`).join('')}
        </div>

        <!-- TAUX INTÉGRATION GLOBAL -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📋 Pipeline onboarding</div>
          <p style="font-size:13px;color:var(--c-text-2);margin:0">
            <strong style="color:var(--c-text)">${dc.totalPipeline}</strong> lead(s) au total ·
            taux d'intégration global : <strong style="color:var(--c-success)">${dc.tauxIntegration}%</strong>
          </p>
          <button class="btn-lien no-print" onclick="Router.aller('#/empower-tracker')"
                  style="font-size:12px;margin-top:8px">Voir le Tracker →</button>
        </div>

        <!-- TAUX INTÉGRATION PAR CDS -->
        <div class="bloc-fiche">
          <div class="bloc-titre">🎯 Taux d'intégration par CDS</div>
          ${dc.tauxParCDS.length ? `
          <div class="tableau-equipe">
            <div class="te-ligne te-head" style="grid-template-columns:1.4fr 1.4fr 0.7fr"><span>CDS</span><span>Intégrés / Assignés</span><span>Taux</span></div>
            ${dc.tauxParCDS.map(c => {
              const col = c.taux >= 50 ? 'pace-ok' : c.taux >= 30 ? 'pace-watch' : 'pace-risk';
              return `
              <div class="te-ligne" style="grid-template-columns:1.4fr 1.4fr 0.7fr">
                <span><strong>${c.nom}</strong></span>
                <span>${c.integres} / ${c.assignes}</span>
                <span class="pace-badge ${col}">${c.taux}%</span>
              </div>`;
            }).join('')}
          </div>` : '<div class="pas-de-donnees">Aucun lead assigné.</div>'}
        </div>

        <!-- CA RÉALISÉ (label source visible) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">💶 CA réalisé par CDS</div>
          <p style="font-size:11px;color:var(--c-text-2);margin:0 0 10px">
            Valeur saisie par Tadjidine — source indiquée pour chaque CDS.
          </p>
          ${dc.caParCDS.length ? `
          <div class="tableau-equipe">
            ${dc.caParCDS.map(c => `
              <div class="te-ligne" style="grid-template-columns:1fr auto auto;gap:8px">
                <span><strong>${c.nom}</strong></span>
                <span style="font-size:13px">${c.caStr === '—' ? '—' : c.caStr + ' €'}</span>
                <span>${badgeSource(c.source)}</span>
              </div>`).join('')}
          </div>` : '<div class="pas-de-donnees">Aucune donnée CA.</div>'}
        </div>

        <!-- 10 DERNIERS LEADS INTÉGRÉS -->
        <div class="bloc-fiche">
          <div class="bloc-titre">✅ 10 derniers leads intégrés</div>
          ${dc.derniersIntegres.length ? `
          <div class="tableau-equipe">
            <div class="te-ligne te-head" style="grid-template-columns:1.5fr 1fr 1fr"><span>Compte</span><span>CDS</span><span>Origine</span></div>
            ${dc.derniersIntegres.map(l => `
              <div class="te-ligne" style="grid-template-columns:1.5fr 1fr 1fr">
                <span><strong>${l.nom}</strong></span>
                <span>${l.cds}</span>
                <span style="font-size:11px;color:var(--c-text-2)">${l.origine}</span>
              </div>`).join('')}
          </div>` : '<div class="pas-de-donnees">Aucun lead intégré pour le moment.</div>'}
        </div>

        <!-- ALERTE WELCOME PACK -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📦 Welcome Pack non envoyé (≥ J14)</div>
          ${dc.alerteWelcome.length ? `
          <div class="dash-alertes">
            ${dc.alerteWelcome.map(l => `
              <div class="alerte-ligne">
                📦 <strong>${l.nom}</strong> — ${l.cds} · <span style="color:var(--c-danger)">${l.jours} j sans Welcome Pack</span>
              </div>`).join('')}
          </div>` : '<div class="pas-de-donnees">Aucun lead en alerte Welcome Pack 🎉</div>'}
        </div>

        <!-- LEADS ARCHIVÉS / BLOCAGE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">🗄️ Leads archivés / bloqués</div>
          ${dc.leadsArchive.length ? `
          <div class="tableau-equipe">
            <div class="te-ligne te-head" style="grid-template-columns:1.5fr 1fr 1.5fr"><span>Compte</span><span>CDS</span><span>Motif</span></div>
            ${dc.leadsArchive.map(l => `
              <div class="te-ligne" style="grid-template-columns:1.5fr 1fr 1.5fr">
                <span><strong>${l.nom}</strong></span>
                <span>${l.cds}</span>
                <span style="font-size:11px;color:var(--c-text-2)">${l.note}</span>
              </div>`).join('')}
          </div>` : '<div class="pas-de-donnees">Aucun lead archivé.</div>'}
        </div>

        <!-- RACCOURCIS LECTURE SEULE -->
        <div class="dash-raccourcis no-print">
          <button class="raccourci" onclick="Router.aller('#/empower-tracker')">📊<span>Tracker</span></button>
          <button class="raccourci" onclick="Router.aller('#/comptes')">🏢<span>Comptes</span></button>
        </div>
      </div>
      ${NavBar('home')}
    `;
  },

  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = `<div style="padding:20px">${skeletonKPI(4)}${skeletonListe(4)}</div>`;
      return;
    }
    // BLOC 4 — vue dédiée Alexandra
    if (this.state.dc) { return this.renderChannel(); }
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
        <p class="dash-date" style="color:var(--c-text-2);font-family:Montserrat,sans-serif;font-size:13px">${dateFr} · ${d.semaine} · ${d.quarter} FY27</p>

        <!-- TUILES STATS -->
        <div class="stat-tuiles">
          <div class="stat-tuile">
            <div class="stat-tuile-lbl">CA total ${d.quarter}</div>
            <div class="stat-tuile-val">${formatEuro(d.caTotal)}</div>
            <div style="font-size:11px;color:var(--c-text-2);margin-top:2px">/ ${formatEuro(d.objTotal)} obj. · <strong style="color:${d.pctTotal>=100?'var(--c-success)':d.pctTotal>=80?'var(--c-warning)':'var(--c-danger)'}">${d.pctTotal}%</strong></div>
          </div>
          ${d.caFY26Total > 0 ? `
          <div class="stat-tuile" style="border-top:3px solid #9333ea">
            <div class="stat-tuile-lbl" style="color:#9333ea">📊 Réf. FY26/trim.</div>
            <div class="stat-tuile-val" style="color:#9333ea">${formatEuro(d.caFY26Total)}</div>
            <div style="font-size:11px;color:var(--c-text-2);margin-top:2px">CA annuel ÷ 4 équipe</div>
          </div>` : ''}
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
          <div style="display:flex;gap:16px;font-size:11px;color:var(--c-text-2);margin-top:8px;flex-wrap:wrap">
            <span><span style="display:inline-block;width:10px;height:10px;background:#E8E8ED;border-radius:2px;vertical-align:middle"></span> Objectif</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#00b27e;border-radius:2px;vertical-align:middle"></span> On Track</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;vertical-align:middle"></span> Watch</span>
            <span><span style="display:inline-block;width:10px;height:10px;background:#FA0000;border-radius:2px;vertical-align:middle"></span> At Risk</span>
            <span><span style="display:inline-block;width:10px;height:8px;border:1.5px dashed #9333ea;border-radius:2px;vertical-align:middle"></span> FY26 réf./trim.</span>
          </div>
        </div>

        <!-- TABLEAU CDS -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Détail performance par CDS</div>
          <div class="tableau-equipe">
            <div class="te-ligne te-head" style="grid-template-columns:1.2fr 1.4fr 0.6fr 0.8fr 0.4fr 0.4fr 0.4fr">
              <span>CDS</span><span>CA / OBJ</span><span>%</span><span style="color:#9333ea">FY26/trim</span><span>📅</span><span>📞</span><span>🎯</span>
            </div>
            ${d.equipe.map(e => `
            <div class="te-ligne" style="cursor:pointer;grid-template-columns:1.2fr 1.4fr 0.6fr 0.8fr 0.4fr 0.4fr 0.4fr" onclick="Router.aller('#/comptes?cds=${e.pin}')">
              <span><strong>${PACE[e.pace].lbl} ${e.nom}</strong></span>
              <span style="font-size:12px">${formatEuro(e.ca)} / ${formatEuro(e.obj)}</span>
              <span class="pace-badge ${PACE[e.pace].cls}">${e.pct}%</span>
              <span style="font-size:11px;color:#9333ea">${e.caFY26 > 0 ? formatEuro(e.caFY26) : '—'}</span>
              <span>${e.visitesSem}</span>
              <span>${e.appelsSem}</span>
              <span>${e.leadsEnCours}</span>
            </div>`).join('')}
          </div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">📅 visites ${d.semaine} · 📞 appels ${d.semaine} · 🎯 leads actifs · <span style="color:#9333ea">FY26/trim = CA FY26 annuel ÷ 4</span></p>
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

        <!-- BUG-08 : SAISIE CA RÉALISÉ À DATE -->
        <div class="bloc-fiche no-print">
          <div class="bloc-titre">📝 Saisie CA réalisé à date</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">Renseignez le CA terrain pour un CDS — la valeur remplace le sell-in du quarter sélectionné.</p>
          <div style="display:grid;gap:10px">
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <label style="flex:1;min-width:120px;font-size:13px">CDS
                <select id="saisie-ca-cds" style="width:100%;margin-top:4px;padding:8px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm)">
                  ${d.equipe.map(e => `<option value="${e.pin}">${e.nom}</option>`).join('')}
                </select>
              </label>
              <label style="flex:1;min-width:100px;font-size:13px">Quarter
                <select id="saisie-ca-quarter" style="width:100%;margin-top:4px;padding:8px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm)">
                  ${['Q1','Q2','Q3','Q4'].map(q => `<option value="${q}" ${q === d.quarter ? 'selected' : ''}>${q} FY27</option>`).join('')}
                </select>
              </label>
            </div>
            <label style="font-size:13px">CA réalisé (€)
              <input id="saisie-ca-valeur" type="number" min="0" step="0.01" placeholder="ex : 18500"
                     style="width:100%;margin-top:4px;padding:8px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);font-size:15px"/>
            </label>
            <label style="font-size:13px">Commentaire (facultatif)
              <input id="saisie-ca-note" type="text" placeholder="ex : Sell-in S24 confirmé"
                     style="width:100%;margin-top:4px;padding:8px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm)"/>
            </label>
            <button class="btn-primaire" onclick="VueDashboardManager.saisirCA()" style="padding:12px">
              💾 Enregistrer le CA
            </button>
            <div id="saisie-ca-feedback" style="font-size:13px;min-height:18px"></div>
          </div>
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
