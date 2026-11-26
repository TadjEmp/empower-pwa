// ═══════════════════════════════════════
//  vue-pilotage.js — Refresh ESI : écran « Pilotage » (Où agir aujourd'hui ?)
//  Structure de la maquette V1 Cockpit / Figma : fil d'Ariane, filtres de contexte, KPI cliquables
//  (chacun mène à la liste qui l'explique), file « Actions prioritaires » et « Synthèse d'équipe ».
//  Données réelles, mêmes sources et mêmes règles que Phoning, À contacter et Vue équipe ; lecture seule.
//  Un CDS ne voit que son périmètre ; le CA/objectif est masqué pour le Channel manager (comme la Vue équipe).
// ═══════════════════════════════════════
window.VuePilotage = {
  state: null,

  _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _norm(v) { return String(v || '').trim().toUpperCase(); },
  _fmt(d) { const s = String(d || '').slice(0, 10); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : 'n.c.'; },

  async init() {
    this.state = { chargement: true, erreur: null, d: null, vue: null };
    this.render();
    try {
      const L = t => SheetsAPI.lire('EMPOWER_MDB', t, { nocache: true });
      if (Session.estExterne()) {
        // Fournisseur de leads : uniquement ses leads et la base des comptes (aucune visite, aucun sell-in, aucun objectif).
        const [leads, comptes] = await Promise.all([L('LEADS'), L('COMPTES')]);
        this._raw = { comptes };
        this.state.ext = this._calculerExterne(leads);
        this.state.chargement = false; this.state.maj = new Date(); this.render();
        return;
      }
      const [leads, appels, visites, objectifs, params, comptes] = await Promise.all([
        L('LEADS'), L('PHONING'), L('VISITES'), L('OBJECTIFS_PRIMES'), SheetsAPI.lire('EMPOWER_MDB', 'PARAMS'), L('COMPTES'),
      ]);
      this._raw = { comptes, visites, appels, objectifs, params };
      // Le trimestre actif s'applique à l'ouverture de l'écran ; le choix manuel ensuite est conservé.
      if (!this._qInit) { const qa = (params || []).find(p => p.Parametre === 'QuarterActif'); if (qa && qa.Valeur) FilterState.set({ quarter: qa.Valeur }); this._qInit = true; }
      if (window.AContacter) { try { await AContacter.charger(); } catch (e) {} }
      this.state.d = this._calculer({ leads, appels, visites, objectifs, params });
      this.state.chargement = false;
    } catch (e) { this.state.chargement = false; this.state.erreur = e.message || String(e); }
    this.state.vue = this.state.vue || (Session.voitTout() ? 'manager' : 'commercial');
    this.state.maj = new Date();
    this.render();
  },

  _calculer({ leads, appels, visites, objectifs, params }) {
    const norm = this._norm;
    const voitTout = Session.voitTout();
    const mien = pin => voitTout || Number(pin) === Number(Session.pin);
    const auj = new Date().toISOString().slice(0, 10);
    const paramMap = Object.fromEntries((params || []).map(p => [p.Parametre, p.Valeur]));
    const quarter = paramMap.QuarterActif || 'Q1';

    // Périmètre « pipeline » : mêmes exclusions que la Vue équipe (imports base, hors-base, supprimés).
    const pipe = (leads || []).filter(p => {
      const src = norm(p.Source_Import);
      return norm(p.Flag_traite) !== 'DELETED' && !src.includes('FLAVIE') && src !== 'BASE_PROSPECTS_RELANCER' && src !== 'ESI_VISITE_FROID' && mien(p.PIN_CDS_Assigne);
    });
    const ouverts = pipe.filter(p => !['ARCHIVE', 'INTEGRE'].includes(norm(p.STATUT_EMPOWER)));
    const integres = pipe.filter(p => norm(p.STATUT_EMPOWER) === 'INTEGRE');
    const sansAction = ouverts.filter(p => !p.Date_prochaine_action);
    const echus = ouverts.filter(p => p.Date_prochaine_action && String(p.Date_prochaine_action).slice(0, 10) <= auj)
      .sort((a, b) => String(a.Date_prochaine_action).localeCompare(String(b.Date_prochaine_action)));
    const echus48 = echus.filter(p => (Date.now() - new Date(String(p.Date_prochaine_action).slice(0, 10)).getTime()) > 172800000);

    const dansSem = d => { try { return FiscalWeeks.dansSemaineCalendaire(d); } catch (e) { return false; } };
    const v7 = (visites || []).filter(v => !v.deleted && mien(v.PIN_CDS) && dansSem(v.Date));
    const a7 = (appels || []).filter(a => mien(a.PIN_CDS) && dansSem(a.Date) && (typeof estAppelRealise !== 'function' || estAppelRealise(a)));

    const ac = window.AContacter ? AContacter.visibles() : [];

    // CA / objectif du trimestre actif (absent pour le Channel manager)
    let ca = null;
    if (!(Session.estChannel && Session.estChannel())) {
      const obs = (objectifs || []).filter(o => mien(o.PIN_CDS));
      const sCa = obs.reduce((t, o) => t + Number(o[`${quarter}_CA_Realise`] || 0), 0);
      const sObj = obs.reduce((t, o) => t + Number(o[`${quarter}_Obj_Revise`] || o[`${quarter}_Obj_Initial`] || 0), 0);
      ca = { ca: sCa, obj: sObj, pct: sObj > 0 ? Math.round(sCa / sObj * 100) : null, quarter };
    }

    // Synthèse d'équipe : charge par commercial (descriptive, sans classement)
    const equipe = voitTout ? (objectifs || []).map(o => {
      const pin = Number(o.PIN_CDS);
      const mesOuv = ouverts.filter(p => Number(p.PIN_CDS_Assigne) === pin);
      const mesEch = echus.filter(p => Number(p.PIN_CDS_Assigne) === pin);
      return {
        pin, nom: o.Nom_CDS || ('PIN ' + pin), ouverts: mesOuv.length, echus: mesEch.length,
        acontacter: ac.filter(r => Number(r.PIN_CDS_Assigne) === pin).length,
        act: v7.filter(v => Number(v.PIN_CDS) === pin).length + a7.filter(a => Number(a.PIN_CDS) === pin).length,
      };
    }) : [];

    return { ouverts, integres, sansAction, echus, echus48, v7, a7, ac, ca, equipe, quarter, auj };
  },

  // KPI : libellé, valeur, précision, destination (la liste qui explique la valeur)
  _kpis(d) {
    const k = [
      { l: 'Leads ouverts', v: d.ouverts.length, s: `${d.sansAction.length} sans prochaine action`, to: '#/empower-tracker' },
      { l: 'Rappels échus', v: d.echus.length, s: d.echus.length ? `dont ${d.echus48.length} depuis plus de 48 h` : 'aucun en retard', to: '#/phoning', alerte: d.echus.length > 0 },
      { l: 'Activités · 7 jours', v: d.v7.length + d.a7.length, s: `${d.a7.length} appels · ${d.v7.length} visites`, to: '#/visites' },
      { l: 'À contacter', v: d.ac.length, s: 'comptes à relancer', to: '#/a-contacter' },
      { l: 'Empower activés', v: d.integres.length, s: 'leads intégrés', to: '#/empower-tracker' },
    ];
    if (d.ca) k.push({ l: `Sell-in / objectif ${d.quarter}`, v: d.ca.pct == null ? 'n.c.' : d.ca.pct + ' %', s: d.ca.obj ? `${Math.round(d.ca.ca).toLocaleString('fr-FR')} € sur ${Math.round(d.ca.obj).toLocaleString('fr-FR')} €${window.Atterrissage ? ' · ' + Atterrissage.texte(d.ca.ca, d.ca.obj, d.quarter) : ''}` : 'objectif non renseigné', to: '#/objectifs' });
    return k;
  },

  // Actions prioritaires : règles lisibles (rappel échu, puis compte à contacter), pas de score opaque
  _kpiHtml(k) {
    const E = this._esc;
    return `<button class="pilo-kpi${k.alerte ? ' alerte' : ''}" onclick="Router.aller('${k.to}')">
          <span class="pilo-kpi-l">${E(k.l)}</span><strong>${E(k.v)}</strong><small>${E(k.s)}</small><i aria-hidden="true">›</i>
        </button>`;
  },

  _actions(d) {
    const E = this._esc;
    const rap = d.echus.slice(0, 6).map(p => {
      const parMail = /mail/i.test(String(p.MODE_CONTACT || '')) && p.Email;
      return {
      ico: parMail ? 'mail' : 'tel', titre: parMail ? 'Écrire' : 'Rappeler', nom: p.Nom_Compte || p.Enseigne || p.ID_Prospect || 'Lead', lieu: p.Ville || '',
      quand: this._fmt(p.Date_prochaine_action), raison: 'Rappel en retard', late: true,
      to: parMail ? 'mailto:' + p.Email : (p.ID_Compte || p.ID_Prospect) ? '#/phoning/' + encodeURIComponent(p.ID_Compte || p.ID_Prospect) : '#/phoning',
    }; });
    const aco = d.ac.slice(0, Math.max(0, 8 - rap.length)).map(r => ({
      ico: 'visite', titre: r.Axe === 'P1' ? 'Relancer un compte onboardé' : 'Convertir un compte qui commande',
      nom: r.Nom_Compte, lieu: r.Ville || '', quand: r.Jours != null ? r.Jours + ' j' : '', raison: r.Axe === 'P1' ? 'Onboardé sans commande' : 'A commandé, pas encore Empower',
      to: r.ID_Compte ? '#/compte/' + encodeURIComponent(r.ID_Compte) : '#/a-contacter',
    }));
    return [...rap, ...aco].map(a => `
      <button class="pilo-task" onclick="${a.to.startsWith('mailto:') ? `location.href='${E(a.to)}'` : `Router.aller('${E(a.to)}')`}">
        <span class="pilo-task-ico${a.late ? ' late' : ''}">${a.ico === 'tel' ? '☎' : a.ico === 'mail' ? '✉' : '⌂'}</span>
        <span class="pilo-task-main"><strong>${E(a.titre)}</strong><span>${E(a.nom)}${a.lieu ? ' · ' + E(a.lieu) : ''}</span></span>
        <span class="pilo-task-why"><span class="${a.late ? 'late' : ''}">${E(a.quand)}</span><small>${E(a.raison)}</small></span>
        <span class="pilo-chev" aria-hidden="true">›</span>
      </button>`).join('');
  },

  _equipe(d) {
    const E = this._esc;
    if (!d.equipe.length) return '<p class="pilo-vide">Aucun commercial dans le périmètre.</p>';
    const max = Math.max(1, ...d.equipe.map(m => m.ouverts));
    return d.equipe.map(m => `
      <button class="pilo-member" onclick="Router.aller('#/empower-tracker')">
        <span class="pilo-avatar">${E((m.nom || '?').charAt(0).toUpperCase())}</span>
        <span class="pilo-member-main"><strong>${E(m.nom)}</strong>
          <span>${m.ouverts} leads ouverts · ${m.echus ? `<span class="late">${m.echus} en retard</span>` : 'à jour'} · ${m.act} activités 7 j</span>
          <span class="pilo-bar"><i style="width:${Math.round(m.ouverts / max * 100)}%"></i></span></span>
        <span class="pilo-chev" aria-hidden="true">›</span>
      </button>`).join('') + '<p class="pilo-note">Synthèse descriptive, sans classement ni score opaque.</p>';
  },

  // ── Graphiques (décisions Pilotage fusionné) : filtres partagés avec les donuts via FilterState ──
  setQuarterCamembert(q) { FilterState.set({ quarter: q }); this.render(); },
  setCommercialCamembert(pin) { FilterState.set({ pinCommercial: pin ? Number(pin) : null }); this.render(); },
  toggleSemaineCamembert() { FilterState.set({ semaine: FilterState.get().semaine ? null : FiscalWeeks.codeDe() }); this.render(); },

  _barres(lignes, drill) {
    const E = this._esc, max = Math.max(1, ...lignes.map(l => l.v));
    return lignes.length ? `<div data-tipzone>` + lignes.map(l => `
      <button class="pilo-hbar" data-tip="${E(l.l)}\n${E(l.tip || l.txt)}" onclick="Router.aller('${drill}')">
        <span class="pilo-hbar-l">${E(l.l)}</span>
        <span class="pilo-hbar-t"><i style="width:${Math.max(2, Math.round(l.v / max * 100))}%;background:${l.c || '#343F48'}"></i></span>
        <b>${E(l.txt)}</b></button>`).join('') + `</div>` : '<p class="pilo-vide">Pas de donnée sur la période.</p>';
  },

  _graphiques(f) {
    const E = this._esc, raw = this._raw, eur = n => Math.round(n).toLocaleString('fr-FR') + ' €';
    const channel = Session.estChannel && Session.estChannel();
    const mien = pin => Session.voitTout() || Number(pin) === Number(Session.pin);
    const pinF = f.filtres.pinCommercial;
    const dansPerim = pin => pinF ? Number(pin) === Number(pinF) : mien(pin);
    const qf = f.quarter + 'FY27';
    const G = { activite: [], ventes: [], portefeuille: [], objectifs: [] };

    // Visites par type (période et commercial des filtres)
    const parType = {};
    f._visitesFiltrees.forEach(v => { const brut = String(v.Type_Visite || 'Non renseigné').trim() || 'Non renseigné', t = brut.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()); parType[t] = (parType[t] || 0) + 1; });
    const types = Object.entries(parType).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v, txt: v + (v > 1 ? ' visites' : ' visite') }));
    G.activite.push(`<section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Visites · ${E(f.quarter)}</span><h3>Visites par type</h3></div></div>${this._barres(types, '#/visites')}</section>`);

    if (!channel) {
      // Sell-in par canal de commande (Empower / Grossiste) : somme des comptes du périmètre
      const comptes = (raw.comptes || []).filter(c => dansPerim(c.PIN_CDS_Assigne));
      const tot = comptes.reduce((t, c) => t + CACanal.valeur(c, qf, 'TOUS'), 0);
      const emp = comptes.reduce((t, c) => t + CACanal.valeur(c, qf, 'EMPOWER'), 0);
      const seg = [{ label: 'Empower', value: Math.round(emp), color: '#343F48' }, { label: 'Grossiste', value: Math.max(0, Math.round(tot - emp)), color: '#B8BEC4' }];
      G.ventes.push(`<section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Sell-in · ${E(f.quarter)}</span><h3>Répartition par canal de commande</h3></div></div>
        <div class="pilo-donut">${window.svgDonut(seg, { size: 140, centreValeur: tot ? Math.round(emp / tot * 100) + ' %' : 'n.c.', centreLabel: 'Empower' })}
        <div class="pilo-leg">${seg.map(x => `<div data-tip="${E(x.label)}\n${eur(x.value)}"><i style="background:${x.color}"></i><span>${E(x.label)}</span><b>${eur(x.value)}</b></div>`).join('')}</div></div></section>`);

      // Comptes par canal (portefeuille) : Empower / Grossiste, cliquable vers Comptes
      const nEmp = comptes.filter(c => String(c.CANAL || c.Canal || '').toUpperCase() === 'EMPOWER').length;
      const seg2 = [{ label: 'Empower', value: nEmp, color: '#343F48' }, { label: 'Grossiste', value: Math.max(0, comptes.length - nEmp), color: '#B8BEC4' }];
      G.portefeuille.push(`<section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Portefeuille</span><h3>Comptes selon leur canal</h3></div><button class="pilo-lien" onclick="Router.aller('#/comptes')">Voir les comptes ›</button></div>
        <div class="pilo-donut">${window.svgDonut(seg2, { size: 140, centreValeur: comptes.length, centreLabel: 'Comptes' })}
        <div class="pilo-leg">${seg2.map(x => `<div data-tip="${E(x.label)}\n${x.value} comptes"><i style="background:${x.color}"></i><span>${E(x.label)}</span><b>${x.value}</b></div>`).join('')}</div></div></section>`);

      // Sell-in par trimestre et commercial + atteinte vs objectif
      const obs = (raw.objectifs || []).filter(o => dansPerim(o.PIN_CDS));
      const Q = ['Q1', 'Q2', 'Q3', 'Q4'];
      const lignesQ = Q.map(q => ({ l: q, v: obs.reduce((t, o) => t + Number(o[q + '_CA_Realise'] || 0), 0) })).map(x => ({ ...x, txt: eur(x.v), c: x.l === f.quarter ? '#343F48' : '#B8BEC4' }));
      G.ventes.push(`<section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Sell-in · FY27</span><h3>Par trimestre</h3></div></div>${this._barres(lignesQ, '#/objectifs')}</section>`);
      const att = obs.map(o => { const ca = Number(o[f.quarter + '_CA_Realise'] || 0), ob = Number(o[f.quarter + '_Obj_Revise'] || o[f.quarter + '_Obj_Initial'] || 0), pct = ob > 0 ? Math.round(ca / ob * 100) : 0; return { l: o.Nom_CDS || ('PIN ' + o.PIN_CDS), v: Math.min(pct, 150), txt: pct + ' %', c: pct >= 100 ? '#12805C' : pct >= 80 ? '#8A4B00' : '#C93A34' }; });
      G.objectifs.push(`<section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Objectifs · ${E(f.quarter)}</span><h3>Atteinte par commercial</h3></div></div>${this._barres(att, '#/objectifs')}<p class="pilo-note">Vert ≥ 100 %, ambre ≥ 80 %, rouge sous 80 %.</p></section>`);
    }
    if (!channel) {
      const comptes = (raw.comptes || []).filter(c => dansPerim(c.PIN_CDS_Assigne));
      // Tracker Empower : comptes Empower activés (1re commande en sell-in) vs non activés, par commercial
      const emp = comptes.filter(c => window.estEmpower(c));
      const parPin = {};
      emp.forEach(c => { const k = Number(c.PIN_CDS_Assigne) || 0; (parPin[k] = parPin[k] || { a: 0, n: 0 })[FlagsCanal.active(c) ? 'a' : 'n']++; });
      const maxT = Math.max(1, ...Object.values(parPin).map(x => x.a + x.n));
      const nomDe = pin => pin ? window.resolveCDS(pin) : 'Non attribué';
      const lignesT = Object.entries(parPin).sort((a, b) => (b[1].a + b[1].n) - (a[1].a + a[1].n)).map(([pin, x]) => `
        <button class="pilo-stack" onclick="VueComptes.state.filtreEmpower='EMPOWER';Router.aller('#/comptes')">
          <span class="pilo-hbar-l">${E(nomDe(Number(pin)))}</span>
          <span class="pilo-stack-t" style="width:${Math.round((x.a + x.n) / maxT * 100)}%">
            <i class="a" style="flex:${x.a}" data-tip="${E(nomDe(Number(pin)))}\nActivés (1re commande) : ${x.a}"></i><i class="n" style="flex:${x.n}" data-tip="${E(nomDe(Number(pin)))}\nNon activés : ${x.n}"></i></span>
          <b>${x.a}/${x.a + x.n}</b></button>`).join('');
      const nA = emp.filter(c => FlagsCanal.active(c)).length;
      G.portefeuille.push(`<section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Tracker Empower · nourri par le sell-in</span><h3>Comptes activés vs non activés</h3></div></div>
        ${window.renderJaugeActivation(comptes, { sansCarte: true })}
        <div data-tipzone>${lignesT || '<p class="pilo-vide">Aucun compte Empower.</p>'}</div>
        <p class="pilo-leg2"><span class="flag flag-act">${FlagsCanal.ICO.ok}Activé</span><span class="flag flag-noact">${FlagsCanal.ICO.no}Non activé</span></p></section>`);

      // Comptes ayant commandé par trimestre (sell-in), avec les premiers noms au survol
      const Qs = ['Q1', 'Q2', 'Q3', 'Q4'];
      const cmd = Qs.map(q => { const l = comptes.filter(c => CACanal.valeur(c, q + 'FY27', 'TOUS') > 0); return { l: q + (q === f.quarter ? ' (en cours)' : ''), v: l.length, txt: l.length + ' comptes', tip: l.length + ' comptes ont commandé' + (l.length ? '\n' + l.slice(0, 5).map(c => c.Nom_Compte).join(', ') + (l.length > 5 ? '…' : '') : ''), c: q === f.quarter ? '#343F48' : '#B8BEC4' }; });
      const fy = comptes.filter(c => Qs.some(q => CACanal.valeur(c, q + 'FY27', 'TOUS') > 0)).length;
      cmd.push({ l: 'FY27', v: fy, txt: fy + ' comptes', tip: fy + ' comptes distincts ont commandé sur FY27', c: '#5B7A99' });
      G.ventes.push(`<section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Sell-in · comptes ayant commandé</span><h3>Par trimestre et sur FY27</h3></div></div>${this._barres(cmd, '#/comptes')}</section>`);

      // Sell-in par trimestre ET par commercial (colonnes groupées)
      if (Session.voitTout()) {
        const obs = (raw.objectifs || []).filter(o => dansPerim(o.PIN_CDS));
        const Q = ['Q1', 'Q2', 'Q3', 'Q4'], teintes = ['#343F48', '#5B7A99', '#8C9BB8', '#B8BEC4', '#6B7580'];
        const maxV = Math.max(1, ...obs.flatMap(o => Q.map(q => Number(o[q + '_CA_Realise'] || 0))));
        const W = 320, H = 150, gw = (W - 20) / Q.length, bw = Math.max(6, (gw - 10) / Math.max(1, obs.length));
        const cols = Q.map((q, qi) => obs.map((o, oi) => { const v = Number(o[q + '_CA_Realise'] || 0), h = Math.round(v / maxV * (H - 34)); return `<rect x="${(10 + qi * gw + 4 + oi * bw).toFixed(1)}" y="${H - 18 - h}" width="${(bw - 2).toFixed(1)}" height="${Math.max(h, 1)}" rx="2" fill="${teintes[oi % teintes.length]}" tabindex="0" data-tip="${E(o.Nom_CDS || '')}\n${q} : ${eur(v)}"/>`; }).join('') + `<text x="${(10 + qi * gw + gw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="#6B7580">${q}</text>`).join('');
        G.ventes.push(`<section class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Sell-in · FY27</span><h3>Par trimestre et par commercial</h3></div></div>
          <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Sell-in par trimestre et par commercial" data-tipzone>${cols}</svg>
          <div class="pilo-leg pilo-leg-row">${obs.map((o, i) => `<div><i style="background:${teintes[i % teintes.length]}"></i><span>${E(o.Nom_CDS || '')}</span></div>`).join('')}</div></section>`);
      }
    }
    const grille = l => l.length ? `<div class="pilo-grille pilo-grille-g">${l.join('')}</div>` : '';
    return {
      activite: `<div class="pilo-filtres-gr">${window.renderBlocCamemberts(f, raw, 'VuePilotage')}</div>${grille(G.activite)}`,
      ventes: `${grille(G.ventes)}${channel ? '' : window.renderBlocCAHebdo(f, 'VuePilotage', eur)}`,
      portefeuille: grille(G.portefeuille), objectifs: grille(G.objectifs),
    };
  },

  // Filtres partagés par tous les onglets : trimestre, semaine en cours, commercial (FilterState)
  _barreFiltres(f) {
    return `<div class="pilo-filtres-glob dash-filtres-camembert" role="group" aria-label="Période et commercial">
      ${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `<button class="btn-filtre ${f.quarter === q ? 'actif' : ''}" onclick="VuePilotage.setQuarterCamembert('${q}')">${q}</button>`).join('')}
      <button class="btn-filtre ${f.semaineSeule ? 'actif' : ''}" onclick="VuePilotage.toggleSemaineCamembert()">Semaine en cours</button>
      ${Session.voitTout() ? `<select aria-label="Commercial" onchange="VuePilotage.setCommercialCamembert(this.value)"><option value="">Vue consolidée</option>${((this._raw && this._raw.objectifs) || []).map(o => `<option value="${o.PIN_CDS}" ${Number(f.filtres.pinCommercial) === Number(o.PIN_CDS) ? 'selected' : ''}>${this._esc(window.resolveCDS(o.PIN_CDS))}</option>`).join('')}</select>` : ''}
    </div>`;
  },
  setVue(v) { this.state.vue = v; this.render(); },
  setOnglet(o) { this.state.onglet = o; this.render(); },
  _ONGLETS: [['activite', 'Activité'], ['ventes', 'Ventes'], ['portefeuille', 'Portefeuille'], ['objectifs', 'Objectifs'], ['historique', 'Historique']],

  // Objectifs de fin d'année : contacts renseignés (31/12/2026), entonnoir Empower et paliers (séminaire).
  _jaugesObjectifs(manager, part) {
    const cs = ((this._raw && this._raw.comptes) || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE');
    if (!cs.length || !window.ContactsObjectif) return '';
    const E = this._esc, st = ContactsObjectif.stats(cs);
    const emp = cs.filter(c => window.estEmpower(c)), act = emp.filter(c => window.FlagsCanal.active(c));
    const contactesEmp = emp.filter(c => ContactsObjectif.etat(c).contact).length;
    const pal = ['DORMANT', 'EVEIL', 'ACTIF', 'AMBASSADEUR'].map(k => [Paliers.PALIERS[k], emp.filter(c => Paliers.palier(c).cle === k).length]);
    const barre = (n, tot, col) => `<div style="height:10px;border-radius:5px;background:var(--c-border);overflow:hidden"><div style="height:100%;width:${tot ? Math.round(n / tot * 100) : 0}%;background:${col}"></div></div>`;
    const aFaire = cs.filter(c => !ContactsObjectif.etat(c).contact).length;
    const entonnoir = [['Comptes Empower', emp.length, '#343F48'], ['Contact renseigné', contactesEmp, '#8A949E'], ['Première commande', act.length, '#FF6D68']];
    const sC = `<section class="cs-jauge" aria-label="Contacts renseignés">
        <div class="bloc-titre" style="margin-bottom:8px">Suivi du remplissage des comptes · objectif 31/12/2026</div>
        ${ContactsObjectif.renderSuivi(cs)}
        <button class="cs-puce" style="margin-top:10px" onclick="VueComptes.state.filtreFiche='A_COMPLETER';Router.aller('#/comptes')">${aFaire} fiche${aFaire > 1 ? 's' : ''} à compléter ›</button>
      </section>`;
    const sE = manager ? `<section class="cs-jauge" aria-label="Entonnoir Empower">
        <div class="bloc-titre" style="margin-bottom:8px">Entonnoir Empower et paliers</div>
        ${entonnoir.map(([l, n, col]) => `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${E(l)}</span><strong>${n}</strong></div>${barre(n, emp.length, col)}</div>`).join('')}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">${pal.map(([p, n]) => `<span class="palier-badge" style="--pc:${p.couleur}">${E(p.lib)} ${n}</span>`).join('')}</div>
        <p class="pilo-vide" style="margin-top:8px;font-size:12px">${emp.length - act.length} comptes Empower sans commande : à relancer. Seuils : Éveil sous 1 000 €, Actif dès 1 000 €, Ambassadeur dès 3 000 € de CA Empower FY27.</p>
      </section>` : `<section class="cs-jauge" aria-label="À faire aujourd'hui">
        <div class="bloc-titre" style="margin-bottom:8px">À faire aujourd’hui</div>
        <p style="font-size:13px;margin:0 0 8px">${aFaire} fiche${aFaire > 1 ? 's' : ''} sans contact joignable. Visez ${Math.min(aFaire, 3)} fiche${Math.min(aFaire, 3) > 1 ? 's' : ''} par visite.</p>
        <p style="font-size:13px;margin:0">${emp.length - act.length} compte${emp.length - act.length > 1 ? 's' : ''} Empower sans première commande à relancer.</p>
      </section>`;
    return `<div class="cs-jauges">${part === 'entonnoir' ? sE : part === 'contacts' ? sC : sC + sE}</div>`;
  },

  // Compteur de la base contacts : avancement, échéance 31/12/2026, cadence par semaine, répartition par commercial.
  _bandeauContacts(manager) {
    const cs = ((this._raw && this._raw.comptes) || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE');
    if (!cs.length || !window.ContactsObjectif) return '';
    const E = this._esc, st = ContactsObjectif.stats(cs), nom = p => (window.resolveCDS ? window.resolveCDS(p) : p);
    const urgent = st.jours <= 60;
    const lignes = manager ? st.parCds.filter(x => x.pin).map(x => `<div style="display:flex;align-items:center;gap:10px;font-size:12px;margin-top:7px">
        <span style="flex:0 0 96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${E(nom(x.pin))}</span>
        <span style="flex:1;height:8px;border-radius:4px;background:var(--c-border);overflow:hidden"><span style="display:block;height:100%;width:${x.pct}%;background:#FF6D68"></span></span>
        <span style="flex:0 0 110px;text-align:right;white-space:nowrap;color:var(--c-text-2)">${x.contact} / ${x.tot} · reste ${x.tot - x.contact}</span></div>`).join('') : '';
    return `<section class="pilo-panneau" aria-label="Base contacts" style="margin:12px 0">
      <div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Axe focus · base contacts</span><h3>Remplir la base avant le 31/12/2026</h3></div>
        <button class="pilo-lien" onclick="VueComptes.state.filtreFiche='A_COMPLETER';Router.aller('#/comptes')">${st.reste} fiche${st.reste > 1 ? 's' : ''} à compléter ›</button></div>
      <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:center">
        <div style="flex:1;min-width:240px">
          <div style="font-size:30px;font-weight:800;line-height:1">${st.contact}<span style="font-size:15px;font-weight:600;color:var(--c-text-2)"> / ${st.tot} · ${st.pct} %</span></div>
          <div style="height:10px;border-radius:5px;background:var(--c-border);overflow:hidden;margin-top:10px"><div style="height:100%;width:${st.pct}%;background:#FF6D68"></div></div>
          <div style="font-size:13px;margin-top:8px"><strong>J-${st.jours}</strong> · <strong>${st.parSemaine}</strong> fiche${st.parSemaine > 1 ? 's' : ''} par semaine pour atteindre 100 %${urgent ? ' · échéance proche' : ''}</div>
        </div>
        ${lignes ? `<div style="flex:1.4;min-width:260px">${lignes}</div>` : ''}
      </div></section>`;
  },

  // ── Cockpit de trajectoire (manager) : qui est en retard sur le trimestre et que faire ──
  // Réalisé / objectif des commerciaux contre le rythme du trimestre fiscal, alertes du séminaire, coaching suggéré (règles lisibles).
  _cockpit(d) {
    const E = this._esc, M = window.CoachMoteur, raw = this._raw, eur = n => Math.round(n).toLocaleString('fr-FR') + ' €';
    const tri = M && M.trimestre(new Date());
    if (!tri) return '<p class="pilo-vide">Le trimestre en cours est hors du calendrier fiscal chargé : trajectoire indisponible.</p>';
    const COUL = { rythme: '#1E7B55', surveiller: '#343F48', decrochage: '#FF6D68', sans_objectif: '#B8C1C9' };
    const LIB = { rythme: 'Au rythme', surveiller: 'À surveiller', decrochage: 'Décrochage', sans_objectif: 'Objectif absent' };
    const comptes = (raw.comptes || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE');
    const ctx = window.VueCoach ? VueCoach._ctx() : null;
    const trajs = M.trajectoire(raw.objectifs || [], tri);
    const al = ctx ? M.alertes({ leads: d.ouverts, comptes }, ctx) : [];
    const ligne = t => `<div class="pilo-hbar" style="cursor:default"><span class="pilo-hbar-l">${E(t.nom)}</span>
        <span class="pilo-hbar-t"><i style="width:${t.pct == null ? 0 : Math.min(100, Math.max(2, t.pct))}%;background:${COUL[t.statut]}"></i></span><b>${t.pct == null ? 'n.c.' : t.pct + ' %'}</b></div>
        <div class="pilo-note" style="margin:-2px 0 8px">${t.obj > 0 ? `${eur(t.ca)} sur ${eur(t.obj)} · ${LIB[t.statut]}${t.statut !== 'rythme' && t.obj > 0 ? ` · ${eur(t.parSemaine)} par semaine pour finir` : ''}` : 'Objectif non renseigné (Administration › Objectifs)'}</div>`;
    const retard = trajs.filter(t => t.statut === 'surveiller' || t.statut === 'decrochage');
    const coaching = retard.map(t => {
      const pin = t.pin, mon = d.equipe.find(m => m.pin === pin) || {};
      const cptes = comptes.filter(c => Number(c.PIN_CDS_Assigne) === pin);
      const diag = M.diagnostic(t, { ouverts: mon.ouverts || 0, activite7: mon.act || 0, integres: d.integres.filter(p => Number(p.PIN_CDS_Assigne) === pin).length,
        sansAdresse: ctx ? cptes.filter(c => !ctx.adresseOk(c)).length : 0, echus: mon.echus || 0 });
      return `<div class="pilo-panneau"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">${E(LIB[t.statut])}</span><h3>${E(t.nom)}</h3></div></div>
        <p style="margin:0 0 10px;font-size:13px">${E(diag)}</p><button class="pilo-lien" onclick="Router.aller('#/empower-tracker')">Voir son pipeline ›</button></div>`;
    }).join('');
    const A = al.length ? al.map(a => `<div class="pilo-task" style="cursor:default"><span class="pilo-task-main"><strong>${E(a.titre)}</strong></span><button class="pilo-lien" onclick="Router.aller('${a.to}')">${E(a.action)} ›</button></div>`).join('') : '<p class="pilo-vide">Aucune alerte : tout est dans les règles.</p>';
    return `<div class="pilo-grille"><section class="pilo-panneau" aria-label="Trajectoire du trimestre"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Trajectoire ${E(tri.quarter)} · rythme attendu ${tri.pct} %</span><h3>Réalisé contre objectif</h3></div></div>
        ${trajs.length ? trajs.map(ligne).join('') : '<p class="pilo-vide">Aucun objectif chargé.</p>'}
        <p class="pilo-note">Vert : au rythme. Gris : jusqu'à 15 points de retard. Corail : décrochage. Semaine ${tri.semaine} sur 13.</p></section>
      <section class="pilo-panneau" aria-label="Alertes de la semaine"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Alertes de la semaine</span><h3>Règles du séminaire</h3></div>
        ${Permissions.peut(Session.role, 'coach') ? `<button class="pilo-lien" onclick="Router.aller('#/coach')">Ouvrir le Coach ›</button>` : ''}</div>${A}</section></div>
      ${coaching ? `<div class="pilo-grille pilo-grille-g">${coaching}</div>` : '<p class="pilo-note" style="margin-top:12px">Aucun commercial en retard sur le rythme du trimestre.</p>'}`;
  },

  // ── Fournisseur de leads (EXTERNE) : son activité propre, rien d'autre ──
  // Ses leads = ceux qu'il a saisis (PIN_Channel) ou, pour l'historique, dont l'origine porte son prénom (même règle que le Tracker).
  _calculerExterne(leads) {
    const norm = this._norm, prenom = String(Session.nom || '').trim().split(/\s+/)[0].toLowerCase();
    const mes = (leads || []).filter(l => norm(l.Flag_traite) !== 'DELETED' && (Number(l.PIN_Channel) === Number(Session.pin) || (!!prenom && String(l.ORIGINE || '').trim().toLowerCase() === prenom)));
    const st = l => norm(l.STATUT_EMPOWER || l.FLAG_ACTION);
    const appele = l => !!String(l.Date_Derniere_Action || '').slice(0, 10) || !['', 'SAISIE'].includes(st(l));
    const dateSaisie = l => String(l.Date_Import || l.Timestamp || '').slice(0, 10);
    const il7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const inscrits = mes, appeles = mes.filter(appele), actives = mes.filter(l => st(l) === 'INTEGRE');
    const attribues = mes.filter(l => l.PIN_CDS_Assigne), enCours = mes.filter(l => ['EN_COURS', 'COMPTE_CREE'].includes(st(l)));
    const sansSuite = mes.filter(l => st(l) === 'ARCHIVE'), aTraiter = mes.filter(l => !appele(l) && st(l) !== 'ARCHIVE');
    const recents = mes.slice().sort((a, b) => dateSaisie(b).localeCompare(dateSaisie(a))).slice(0, 8);
    return { inscrits, appeles, actives, attribues, enCours, sansSuite, aTraiter, recents, ins7: inscrits.filter(l => dateSaisie(l) >= il7).length, dateSaisie, appele, st };
  },

  _renderExterne() {
    const E = this._esc, x = this.state.ext, tot = x.inscrits.length, pct = n => tot ? Math.round(n / tot * 100) : 0;
    const prenom = String(Session.nom || '').split(' ')[0];
    const heure = this.state.maj ? this.state.maj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    const carte = (l, v, sous, to) => `<button class="pilo-kpi" onclick="Router.aller('${to || '#/empower-tracker'}')"><span class="pilo-kpi-l">${E(l)}</span><strong>${E(v)}</strong><small>${E(sous)}</small><i aria-hidden="true">›</i></button>`;
    const kpis = [
      carte('Leads inscrits', tot, `${x.ins7} sur 7 jours`),
      carte('Leads appelés', x.appeles.length, `${pct(x.appeles.length)} % de mes leads · ${x.aTraiter.length} à traiter`),
      carte('Leads activés', x.actives.length, `${pct(x.actives.length)} % · ${x.enCours.length} en cours`),
    ].join('');
    const barre = (l, n, col) => `<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${E(l)}</span><strong>${n}</strong></div><div style="height:10px;border-radius:5px;background:var(--c-border);overflow:hidden"><div style="height:100%;width:${pct(n)}%;background:${col}"></div></div></div>`;
    const entonnoir = `<section class="pilo-panneau" aria-label="Parcours de mes leads"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Mes leads</span><h3>Du lead inscrit au compte activé</h3></div></div>
      ${tot ? barre('Inscrits', tot, '#343F48') + barre('Attribués à un commercial', x.attribues.length, '#8A949E') + barre('Appelés', x.appeles.length, '#5B7A99') + barre('Activés Empower', x.actives.length, '#FF6D68') : '<p class="pilo-vide">Aucun lead inscrit pour le moment.</p>'}</section>`;
    const lib = { SAISIE: 'À traiter', ASSIGNE: 'Assigné', EN_COURS: 'En cours', COMPTE_CREE: 'Compte créé', INTEGRE: 'Activé', ARCHIVE: 'Archivé' };
    const recents = `<section class="pilo-panneau" aria-label="Mes derniers leads"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Mes derniers leads</span><h3>Où en sont-ils ?</h3></div><button class="pilo-lien" onclick="Router.aller('#/empower-tracker')">Tout voir ›</button></div>
      ${x.recents.map(l => `<button class="pilo-task" onclick="Router.aller('#/empower-tracker')"><span class="pilo-task-main"><strong>${E(l.Nom_Compte || l.Enseigne || 'Lead')}</strong><span>${E(l.Ville || '')}${x.dateSaisie(l) ? ' · inscrit le ' + E(this._fmt(x.dateSaisie(l))) : ''}</span></span><span class="pilo-task-why"><span>${E(lib[x.st(l)] || x.st(l) || 'À traiter')}</span><small>${x.appele(l) ? 'Appelé' : 'Pas encore appelé'}</small></span><span class="pilo-chev" aria-hidden="true">›</span></button>`).join('') || '<p class="pilo-vide">Aucun lead inscrit pour le moment.</p>'}</section>`;
    const cs = ((this._raw && this._raw.comptes) || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE');
    const base = cs.length && window.ContactsObjectif ? `<section class="pilo-panneau" aria-label="Base des comptes"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Base des comptes · objectif 31/12/2026</span><h3>Comptes renseignés</h3></div></div>${ContactsObjectif.renderSuivi(cs)}</section>` : '';
    return `<div class="pilo-contexte"><nav class="pilo-ariane" aria-label="Fil d'Ariane"><span>Pilotage</span><i>›</i><strong>Mon activité</strong></nav></div>
      <div class="pilo-intro"><h2>Bonjour ${E(prenom)}, voici votre activité</h2><p>Vos leads et la base des comptes</p></div>
      <p class="pilo-fraicheur">Données actualisées aujourd’hui à ${heure} · <button onclick="VuePilotage.init()">Actualiser</button></p>
      <div class="pilo-kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpis}</div>
      <div class="pilo-grille">${entonnoir}${recents}</div>
      <div class="pilo-grille pilo-grille-seul">${base}</div>`;
  },

  render() {
    const s = this.state, app = document.getElementById('app');
    if (!s || !app) return;
    const E = this._esc, role = Session.voitTout();
    const entete = `<header class="header-vue"><h1>Pilotage</h1></header>`;
    let corps;
    if (s.chargement) corps = '<p class="pilo-vide">Chargement…</p>';
    else if (s.erreur) corps = `<div class="erreur">Erreur : ${E(s.erreur)}</div>`;
    else if (Session.estExterne() && s.ext) corps = this._renderExterne();
    else {
      const d = s.d, manager = role && s.vue === 'manager';
      const prenom = String(Session.nom || '').split(' ')[0];
      const heure = s.maj ? s.maj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
      const kpis = this._kpis(d), ids = ['Rappels échus', 'Activités · 7 jours'];
      const kpisHaut = kpis.filter(k => ids.includes(k.l) || /^Sell-in/.test(k.l)), kpisReste = kpis.filter(k => !kpisHaut.includes(k));
      if (kpisHaut.length < 3) { const ac = kpis.find(k => k.l === 'À contacter'); if (ac) { kpisHaut.push(ac); kpisReste.splice(kpisReste.indexOf(ac), 1); } }
      const channel = Session.estChannel && Session.estChannel();
      const onglets = this._ONGLETS.filter(([k]) => !(channel && k === 'ventes'));
      if (manager && !channel && window.CoachMoteur) onglets.unshift(['trajectoire', 'Trajectoire']);
      const onglet = onglets.some(([k]) => k === s.onglet) ? s.onglet : onglets[0][0];
      const fGlob = this._raw ? window.calculerCamembertsActivite(this._raw) : null;
      const g = fGlob ? this._graphiques(fGlob) : { activite: '', ventes: '', portefeuille: '', objectifs: '' };
      const kr = kpisReste.length ? `<div class="pilo-kpis">${kpisReste.map(k => this._kpiHtml(k)).join('')}</div>` : '';
      const equipeBloc = manager ? `<section class="pilo-panneau" aria-label="Synthèse d'équipe"><div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Synthèse d’équipe</span><h3>Charge et points d’attention</h3></div></div>${this._equipe(d)}</section>` : '';
      const contenu = { trajectoire: onglet === 'trajectoire' ? this._cockpit(d) : '', activite: kr + g.activite, ventes: g.ventes, portefeuille: this._jaugesObjectifs(manager, 'entonnoir') + g.portefeuille, objectifs: this._jaugesObjectifs(manager, 'contacts') + g.objectifs, historique: onglet === 'historique' && window.PilotageHistorique ? PilotageHistorique.html() : '' }[onglet];
      corps = `
      <div class="pilo-contexte">
        <nav class="pilo-ariane" aria-label="Fil d'Ariane"><span>Pilotage</span><i>›</i><strong>Synthèse</strong></nav>
        ${role ? `<div class="pilo-seg" role="group" aria-label="Profil de lecture">
          <button class="${manager ? 'actif' : ''}" onclick="VuePilotage.setVue('manager')">Manager</button>
          <button class="${!manager ? 'actif' : ''}" onclick="VuePilotage.setVue('commercial')">Commercial</button></div>` : ''}
      </div>
      <div class="pilo-intro">
        <h2>${manager ? 'Où agir aujourd’hui ?' : `Bonjour ${E(prenom)}, voici vos priorités`}</h2>
        <p>${manager ? 'Vue manager · ' + (d.equipe.length || '') + ' commerciaux' : 'Votre activité terrain'} · trimestre ${E(d.quarter)}</p>
        ${window.Permissions && Permissions.peut(Session.role, 'coach') ? '<button class="pilo-lien" onclick="Router.aller(\'#/coach\')">Ouvrir le Coach ›</button>' : ''}
      </div>
      <p class="pilo-fraicheur">Données actualisées aujourd’hui à ${heure} · <button onclick="VuePilotage.init()">Actualiser</button></p>
      <div class="pilo-kpis" style="grid-template-columns:repeat(${Math.max(1, Math.min(4, kpisHaut.length))},minmax(0,1fr))">${kpisHaut.map(k => this._kpiHtml(k)).join('')}</div>
      ${this._bandeauContacts(manager)}
      <div class="pilo-grille${equipeBloc ? '' : ' pilo-grille-seul'}">
        <section class="pilo-panneau" aria-label="Actions prioritaires">
          <div class="pilo-panneau-t"><div><span class="pilo-eyebrow">Actions prioritaires</span><h3>${manager ? 'À faire par l’équipe' : 'Mes actions du jour'}</h3></div>
            <button class="pilo-lien" onclick="Router.aller('#/a-contacter')">Tout voir ›</button></div>
          ${this._actions(d) || '<p class="pilo-vide">Rien d’urgent : aucun rappel échu ni compte à contacter.</p>'}
        </section>
        ${equipeBloc}
      </div>
      <style>.pilo-filtres-glob{margin:0 0 12px}.pilo [role=tabpanel] .dash-filtres-camembert,.pilo [role=tabpanel] .dash-camembert-actif-pin{display:none}.pilo-onglets{display:flex;gap:6px;overflow-x:auto;margin:18px 0 12px;padding-bottom:2px;scrollbar-width:none}.pilo-onglets::-webkit-scrollbar{display:none}
        .pilo-onglets button{flex:0 0 auto;padding:9px 16px;border:0;border-radius:999px;background:var(--c-surface-2,rgba(52,63,72,.07));color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
        .pilo-onglets button[aria-selected=true]{background:#343F48;color:#fff}.pilo-onglets .pilo-onglet-n{margin-left:6px;opacity:.7;font-weight:500}</style>
      ${fGlob && onglet !== 'trajectoire' && onglet !== 'historique' ? this._barreFiltres(fGlob) : ''}
      <div class="pilo-onglets" role="tablist" aria-label="Thèmes du pilotage">${onglets.map(([k, l]) => `<button role="tab" aria-selected="${k === onglet}" onclick="VuePilotage.setOnglet('${k}')">${l}</button>`).join('')}</div>
      <div role="tabpanel">${contenu}</div>`;
    }
    app.innerHTML = `${entete}${NavBar('home')}${Session.estExterne() ? '' : (window.FusionTabs ? FusionTabs.pilotage() : '')}<div class="pilo">${corps}</div>`;
  },
};
