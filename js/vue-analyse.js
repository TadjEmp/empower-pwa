// ═══════════════════════════════════════
//  vue-analyse.js — Analyse et objectifs : graphiques interactifs + rapport PDF paysage
//  Sources : COMPTES, OBJECTIFS_PRIMES, PARAMS (SheetsAPI). Périmètre : ADMIN/CHANNEL = tout, CDS = ses comptes.
//  Règle « activé » (unifiée le 4 nov. 2026, FlagsCanal.active) : compte Empower onboardé ayant passé une première commande
//  (CA Empower > 0 sur au moins une période ; le signal sell-in « dernière semaine » ne compte plus).
//  Graphiques : survol = infobulle, clic = détail dessous. Rapport : sections cochées → impression PDF A4 paysage.
// ═══════════════════════════════════════

window.VueAnalyse = {

  COUL: { Empower: '#343F48', Grossiste: '#FF6D68', 'À qualifier': '#8A949E', actif: '#343F48', inactif: '#C9D0D6' },
  PERIODES: ['FY25', 'FY26', 'Q1FY27', 'Q2FY27', 'Q3FY27', 'Q4FY27'],
  state: { chargement: true, erreur: null, comptes: [], objectifs: [], quarter: 'Q1', onglet: 'vue', sel: null, visites: [], leads: [] },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  // Compte Empower onboardé ? / activé (première commande Empower passée) ?
  estOnboarde(c) { return window.estEmpower ? estEmpower(c) : false; },
  estActive(c) {
    return this.estOnboarde(c) && window.FlagsCanal.active(c);
  },

  async init() {
    Object.assign(this.state, { chargement: true, erreur: null, sel: null });
    this.render();
    try {
      const [comptes, objectifs, params, visites, leads] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', 'COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', 'OBJECTIFS_PRIMES').catch(() => []),
        SheetsAPI.lire('EMPOWER_MDB', 'PARAMS').catch(() => []),
        SheetsAPI.lire('EMPOWER_MDB', 'VISITES').catch(() => []),
        SheetsAPI.lire('EMPOWER_MDB', 'LEADS').catch(() => []),
      ]);
      const ok = r => !String(r.deleted || '').toUpperCase().includes('TRUE');
      const mien = pin => Session.voitTout() || Number(pin) === Session.pin;
      this.state.comptes = (comptes || []).filter(ok).filter(c => mien(c.PIN_CDS_Assigne));
      this.state.objectifs = (objectifs || []).filter(o => mien(o.PIN_CDS));
      this.state.visites = (visites || []).filter(ok).filter(v => mien(v.PIN_CDS));
      this.state.leads = (leads || []).filter(ok).filter(l => Session.voitTout() || Number(l.PIN_CDS_Assigne) === Session.pin);
      const pm = Object.fromEntries((params || []).map(p => [p.Parametre, p.Valeur]));
      this.state.quarter = pm.QuarterActif || 'Q1';
    } catch (e) { this.state.erreur = e.message; }
    this.state.chargement = false;
    this.render();
  },

  _nom(pin) { return pin ? window.resolveCDS(pin) : 'Non attribué'; },

  // ── Données agrégées ──
  _canaux() {
    const n = { Empower: [], Grossiste: [], 'À qualifier': [] };
    this.state.comptes.forEach(c => { const k = (window.Canaux && Canaux.normaliser(c.CANAL)) || 'À qualifier'; (n[k] || n['À qualifier']).push(c); });
    return n;
  },
  _tracker() {
    const g = {};
    this.state.comptes.filter(c => this.estOnboarde(c)).forEach(c => {
      const k = c.PIN_CDS_Assigne || 0; const o = (g[k] = g[k] || { actif: [], inactif: [] });
      (this.estActive(c) ? o.actif : o.inactif).push(c);
    });
    return g;
  },
  _objectifs() {
    const q = this.state.quarter, P = window.parseCA || Number;
    return this.state.objectifs.map(o => {
      const ca = P(o[q + '_CA_Realise']) || 0, obj = P(o[q + '_Obj_Revise'] || o[q + '_Obj_Initial']) || 0;
      return { pin: o.PIN_CDS, nom: o.Nom_CDS || this._nom(o.PIN_CDS), ca, obj, pct: obj > 0 ? ca / obj * 100 : 0 };
    }).sort((a, b) => b.pct - a.pct);
  },

  // ── Graphiques (SVG, interactifs) ──
  _donut() {
    const d = this._canaux(), cles = Object.keys(d), tot = cles.reduce((s, k) => s + d[k].length, 0) || 1;
    let a0 = -Math.PI / 2; const R = 80, r = 50;
    const arcs = cles.filter(k => d[k].length).map(k => {
      const a1 = a0 + (d[k].length / tot) * Math.PI * 2 - (d[k].length === tot ? 0.0001 : 0), big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => `${100 + rad * Math.cos(a)},${100 + rad * Math.sin(a)}`;
      const path = `M${p(R, a0)} A${R},${R} 0 ${big} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${big} 0 ${p(r, a0)}Z`; a0 = a1;
      return `<path d="${path}" fill="${this.COUL[k]}" tabindex="0" role="button" data-sel="canal:${k}" data-tip="${k} : ${d[k].length} compte${d[k].length > 1 ? 's' : ''} (${Math.round(d[k].length / tot * 100)} %)" aria-label="${k} : ${d[k].length} compte${d[k].length > 1 ? 's' : ''}"/>`;
    }).join('');
    const leg = cles.map(k => `<li><span style="background:${this.COUL[k]}"></span>${k} <strong>${d[k].length}</strong></li>`).join('');
    return `<div class="an-donut"><svg viewBox="0 0 200 200" role="group" aria-label="Comptes par canal">${arcs}<text x="100" y="98" text-anchor="middle" font-size="22" font-weight="700">${tot}</text><text x="100" y="116" text-anchor="middle" font-size="10">comptes</text></svg><ul class="an-leg">${leg}</ul></div>`;
  },
  _tracker_svg() {
    const g = this._tracker(), pins = Object.keys(g).sort((a, b) => (g[b].actif.length + g[b].inactif.length) - (g[a].actif.length + g[a].inactif.length));
    if (!pins.length) return '<p class="an-vide">Aucun compte Empower onboardé dans ce périmètre.</p>';
    const max = Math.max(...pins.map(p => g[p].actif.length + g[p].inactif.length)), W = 420;
    const lignes = pins.map((p, i) => {
      const a = g[p].actif.length, n = g[p].inactif.length, y = 8 + i * 34, sc = (W - 130) / max;
      return `<text x="0" y="${y + 17}" font-size="12">${this._esc(this._nom(Number(p)))}</text>
        <rect x="100" y="${y}" width="${Math.max(a * sc, 0)}" height="24" fill="${this.COUL.actif}" rx="8" tabindex="0" role="button" data-sel="trk:${p}:actif" data-tip="${this._esc(this._nom(Number(p)))} : ${a} activé${a > 1 ? 's' : ''} (1re commande passée)" aria-label="${a} activés"/>
        <rect x="${100 + a * sc}" y="${y}" width="${Math.max(n * sc, 0)}" height="24" fill="${this.COUL.inactif}" rx="8" tabindex="0" role="button" data-sel="trk:${p}:inactif" data-tip="${this._esc(this._nom(Number(p)))} : ${n} non activé${n > 1 ? 's' : ''} (pas encore de commande)" aria-label="${n} non activés"/>
        <text x="${104 + (a + n) * sc}" y="${y + 17}" font-size="12">${a}/${a + n}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${pins.length * 34 + 10}" role="group" aria-label="Tracker Empower">${lignes}</svg>
      <ul class="an-leg"><li><span style="background:${this.COUL.actif}"></span>Activés (1re commande passée)</li><li><span style="background:${this.COUL.inactif}"></span>Non activés</li></ul>`;
  },
  _obj_svg() {
    const o = this._objectifs(); if (!o.length) return '<p class="an-vide">Aucun objectif pour ce trimestre.</p>';
    const W = 420, sc = (W - 150) / Math.max(120, ...o.map(x => x.pct));
    return `<svg viewBox="0 0 ${W} ${o.length * 34 + 22}" role="group" aria-label="Atteinte des objectifs ${this.state.quarter}">
      ${o.map((x, i) => { const y = 8 + i * 34; return `<text x="0" y="${y + 17}" font-size="12">${this._esc(x.nom)}</text>
        <rect x="100" y="${y}" width="${Math.max(x.pct * sc, 1)}" height="24" rx="3" fill="${x.pct >= 100 ? this.COUL.actif : x.pct >= 80 ? '#6B7580' : '#FF6D68'}" tabindex="0" role="button" data-sel="obj:${x.pin}" data-tip="${this._esc(x.nom)} : ${Math.round(x.pct)} % (${Math.round(x.ca)} € / ${Math.round(x.obj)} €)" aria-label="${Math.round(x.pct)} %"/>
        <text x="${104 + x.pct * sc}" y="${y + 17}" font-size="12">${Math.round(x.pct)} %</text>`; }).join('')}
      <line x1="${100 + 100 * sc}" x2="${100 + 100 * sc}" y1="0" y2="${o.length * 34 + 8}" stroke="currentColor" stroke-dasharray="3 3" opacity=".5"/>
      <text x="${100 + 100 * sc}" y="${o.length * 34 + 20}" font-size="10" text-anchor="middle">objectif</text></svg>`;
  },

  _detail() {
    const s = this.state.sel; if (!s) return '';
    const [t, a, b] = s.split(':'); let titre = '', l = [];
    if (t === 'canal') { l = this._canaux()[a] || []; titre = `Comptes ${a}`; }
    if (t === 'trk') { l = (this._tracker()[a] || {})[b] || []; titre = `${this._nom(Number(a))} · ${b === 'actif' ? 'activés' : 'non activés'}`; }
    if (t === 'obj') { return `<div class="an-det"><h3>${this._esc(this._nom(Number(a)))}</h3><p><a href="#/objectifs">Ouvrir Objectifs</a>${window.Permissions && Permissions.peut(Session.role, ['primes', 'admin_primes']) ? ' · <a href="#/primes">Primes</a>' : ''}</p></div>`; }
    return `<div class="an-det"><h3>${this._esc(titre)} (${l.length})</h3><ul>${l.slice(0, 60).map(c => `<li><a href="#/compte/${encodeURIComponent(c.ID_Compte || c._uuid)}">${this._esc(c.Nom_Compte)}</a> <span>${this._esc(c.Ville || '')}</span></li>`).join('')}</ul>${l.length > 60 ? `<p>60 premiers sur ${l.length}.</p>` : ''}</div>`;
  },

  _bloc(id, titre, corps) { return `<section class="an-card" data-bloc="${id}"><h2>${titre}</h2>${corps}</section>`; },
  _blocs() {
    return { canaux: this._bloc('canaux', 'Comptes par canal', this._donut()), tracker: this._bloc('tracker', 'Tracker Empower : activés / non activés', this._tracker_svg()), objectifs: this._bloc('objectifs', `Atteinte des objectifs ${this.state.quarter}`, this._obj_svg()) };
  },

  // ── Rapport (gabarit validé du refresh) : format, période, blocs, photos ; pages A4 paysage ──
  // Pages : couverture · blocs cochés (1 page chacun) · synthèse et prochaines actions.
  BLOCS: [
    ['visites', 'Visites de la semaine + photos', 'Liste datée, type de visite, photos terrain'],
    ['sellin', 'Sell-in par quarter / FY, par commercial et par compte', 'Barres par quarter, comptes ayant commandé'],
    ['atteinte', 'Atteinte % vs objectifs', 'Jauges par commercial'],
    ['portefeuille', 'Comptes par canal + pipeline + carte', 'Camembert, étapes, couverture des départements'],
  ],
  PERIODES_RAPPORT: ['Semaine fiscale', 'Quarter', 'FY27'],
  QUARTERS: { Q1: ['2026-04-01', '2026-06-30'], Q2: ['2026-07-01', '2026-09-30'], Q3: ['2026-10-01', '2026-12-31'], Q4: ['2027-01-01', '2027-03-31'] },

  _x() { const s = this.state; return s.rap || (s.rap = { fmt: 'PDF', per: 'Semaine fiscale', blocs: ['visites', 'sellin', 'atteinte', 'portefeuille'], photos: true }); },
  _fmt(n) { return Math.round(Number(n) || 0).toLocaleString('fr-FR'); },
  _libellePeriode() {
    const r = this._x(), q = this.state.quarter;
    if (r.per === 'Quarter') return q + ' FY27';
    if (r.per === 'FY27') return 'FY27 (avril 2026 à mars 2027)';
    try { return 'Semaine fiscale ' + (window.FiscalWeeks ? FiscalWeeks.labelDe() : 'en cours'); } catch (e) { return 'Semaine fiscale en cours'; }
  },
  _dansPeriode(d) {
    const r = this._x(), s = String(d || '').slice(0, 10); if (!s) return false;
    if (r.per === 'Quarter') { const b = this.QUARTERS[this.state.quarter]; return !!b && s >= b[0] && s <= b[1]; }
    if (r.per === 'FY27') return s >= '2026-04-01' && s <= '2027-03-31';
    try { return window.FiscalWeeks ? FiscalWeeks.dansSemaineCalendaire(s) : false; } catch (e) { return false; }
  },

  // ── Rapport : un seul objet de données (D) alimente le PDF et le PPTX (prompt 09 : mêmes chiffres) ──
  // Charte : Ardoise 343F48, Rouge signal FF1209, Corail FF6D68, gris clair EEF0F1, gris moyen B8BEC4, texte 424242, Montserrat.
  // Interdits : traits droits (filets, bordures, soulignements), tirets longs et demi-cadratins (valeur absente : « N/A »).
  CH: { ardoise: '343F48', rouge: 'FF1209', corail: 'FF6D68', clair: 'EEF0F1', moyen: 'B8BEC4', texte: '424242' },
  _san(t) { return String(t == null || String(t).trim() === '' ? 'N/A' : t).replace(/\s*[–—]\s*/g, ', '); },
  _init(nom) { return String(nom || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?'; },
  _typeVisite(t) { const m = String(t || '').trim().toLowerCase().replace(/_/g, ' '); return m ? m[0].toUpperCase() + m.slice(1) : ''; },
  _numerique(lignes, i) { return lignes.length > 0 && lignes.every(l => /^[\d\s\u202f\u00a0.,%€]+$/.test(String(l[i]))); },
  _s(n, un, plus) { return n > 1 ? plus : un; },

  _donneesRapport() {
    const s = this.state, r = this._x(), P = window.parseCA || Number, qs = ['Q1', 'Q2', 'Q3', 'Q4'];
    const v = (s.visites || []).filter(x => this._dansPeriode(x.Date || x.Date_Planif)).sort((a, b) => String(b.Date || '').localeCompare(String(a.Date || '')));
    const photos = r.photos ? v.flatMap(x => String(x.Photo_URL || '').split(' | ').map(u => u.trim()).filter(Boolean).slice(0, 1).map(u => ({ u, c: x.Nom_Compte || '' }))).slice(0, 3) : [];
    const parCom = s.objectifs.map(o => { const q = qs.map(k => Math.round(P(o[k + '_CA_Realise']) || 0)); return { nom: o.Nom_CDS || this._nom(o.PIN_CDS), q, tot: q.reduce((a, b) => a + b, 0) }; });
    const parQ = qs.map((q, i) => parCom.reduce((t, x) => t + x.q[i], 0)); // somme des cellules affichées : le tableau et l'histogramme concordent
    const tot = c => qs.reduce((t, q) => t + (Number(c['CA_' + q + 'FY27']) || 0), 0);
    const top = s.comptes.filter(c => tot(c) > 0).sort((a, b) => tot(b) - tot(a)).slice(0, 8).map(c => ({ compte: c.Nom_Compte, com: this._nom(c.PIN_CDS_Assigne), ca: Math.round(tot(c)) }));
    const att = this._objectifs().map(x => ({ nom: x.nom, ca: Math.round(x.ca), obj: Math.round(x.obj), pct: Math.round(x.pct) }));
    const sumCa = att.reduce((a, x) => a + x.ca, 0), sumObj = att.reduce((a, x) => a + x.obj, 0);
    const can = this._canaux(), canaux = Object.keys(can).filter(k => can[k].length).map(k => [k, can[k].length]);
    const lead = {}; (s.leads || []).forEach(l => { const k = String(l.STATUT_EMPOWER || l.FLAG_ACTION || 'SAISIE'); lead[k] = (lead[k] || 0) + 1; });
    const deps = new Set(s.comptes.map(c => (window.VueTerritoires && VueTerritoires._dep) ? VueTerritoires._dep(c.Departement, c.Code_Postal) : null).filter(Boolean)).size;
    const t = this._tracker(), act = Object.values(t).reduce((n, g) => n + g.actif.length, 0), non = Object.values(t).reduce((n, g) => n + g.inactif.length, 0);
    const sous = att.filter(x => x.pct < 80).map(x => x.nom);
    return {
      periode: this._libellePeriode(), quarter: s.quarter, date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      auteur: Session.nom || 'ESI', perimetre: Session.voitTout() ? 'équipe' : 'personnel', qs,
      visites: { n: v.length, comptes: new Set(v.map(x => x.Nom_Compte)).size, commerciaux: new Set(v.map(x => x.PIN_CDS || x.Nom_CDS)).size,
        lignes: v.slice(0, 6).map(x => [String(x.Date || x.Date_Planif || '').slice(0, 10), window.resolveCDS(x.PIN_CDS || x.Nom_CDS), x.Nom_Compte, this._typeVisite(x.Type_Visite)]), photos },
      sellin: { parQ, total: parQ.reduce((a, b) => a + b, 0), parCom, top },
      atteinte: { lignes: att, ca: sumCa, obj: sumObj, pct: sumObj > 0 ? Math.round(sumCa / sumObj * 100) : 0, ok: att.filter(x => x.pct >= 100).length },
      portefeuille: { canaux, total: canaux.reduce((a, [, n]) => a + n, 0), leads: Object.keys(lead).sort().map(k => [k, lead[k]]), deps },
      synthese: { act, non, sous },
    };
  },

  // Contrôle des totaux recalculés par code (QA 5)
  _qaChiffres(D) {
    const err = [], S = D.sellin, A = D.atteinte, Pf = D.portefeuille;
    // Recalcul depuis les données brutes (tolérance : un arrondi par ligne affichée)
    const P = window.parseCA || Number;
    D.qs.forEach((q, i) => { const brut = this.state.objectifs.reduce((a, o) => a + (P(o[q + '_CA_Realise']) || 0), 0); if (Math.abs(brut - S.parQ[i]) > S.parCom.length / 2 + 1) err.push(`Total ${q} incohérent (${Math.round(brut)} contre ${S.parQ[i]})`); });
    if (S.parCom.reduce((a, x) => a + x.tot, 0) !== S.total) err.push('Total sell-in incohérent');
    if (Pf.total !== this.state.comptes.length) err.push(`Canaux (${Pf.total}) différent du nombre de comptes (${this.state.comptes.length})`);
    A.lignes.forEach(x => { if (x.obj > 0 && Math.abs(Math.round(x.ca / x.obj * 100) - x.pct) > 1) err.push('Pourcentage incohérent : ' + x.nom); });
    return err;
  },

  // Plan des slides (25 maximum) : titre = conclusion, sous-titre rouge, capsule de valeur, notes de l'orateur
  _slides(D) {
    const r = this._x(), f = n => this._fmt(n), sl = [], S = D.sellin, V = D.visites, A = D.atteinte, Pf = D.portefeuille, Y = D.synthese;
    const ajoute = o => sl.push(o);
    if (r.blocs.includes('visites')) {
      ajoute({ kind: 'visites', bloc: 'Visites', titre: V.n ? `${V.n} visite${this._s(V.n, '', 's')} sur la période` : 'Aucune visite sur la période',
        concl: V.n ? `${V.comptes} compte${this._s(V.comptes, '', 's')} rencontré${this._s(V.comptes, '', 's')} par ${V.commerciaux} commercia${V.commerciaux > 1 ? 'ux' : 'l'}` : 'Planifier les visites de la période', capsule: `${V.n} visite${this._s(V.n, '', 's')}`,
        notes: `Message : l'activité terrain de ${D.periode}. Chiffre : ${V.n} visites. Question au public : quels comptes manquent à cette liste ?` });
    }
    if (r.blocs.includes('sellin')) {
      const mx = Math.max(...S.parQ), best = S.total ? D.qs[S.parQ.indexOf(mx)] : null;
      ajoute({ kind: 'sellin', bloc: 'Sell-in', titre: S.total ? `${f(S.total)} € de CA réalisé` : 'Aucun CA réalisé en FY27', concl: best ? `Meilleur quarter : ${best} (${f(mx)} €)` : 'Données de sell-in à renseigner', capsule: `${f(S.total)} €`,
        notes: `Message : le sell-in par quarter et par commercial. Chiffre : ${f(S.total)} € cumulés. Question au public : quel quarter peut encore rattraper l'objectif ?` });
      if (S.top.length) ajoute({ kind: 'top', bloc: 'Sell-in', titre: `${S.top.length} compte${this._s(S.top.length, '', 's')} portent le sell-in`, concl: `Premier compte : ${S.top[0].compte} (${f(S.top[0].ca)} €)`, capsule: `${f(S.top[0].ca)} €`,
        notes: `Message : les comptes qui portent le CA. Chiffre : ${f(S.top[0].ca)} € pour le premier. Question au public : comment reproduire ces commandes ailleurs ?` });
    }
    if (r.blocs.includes('atteinte')) {
      const L = A.lignes, parts = Math.max(1, Math.ceil(L.length / 5));
      for (let i = 0; i < parts; i++) ajoute({ kind: 'atteinte', bloc: 'Atteinte', lignes: L.slice(i * 5, i * 5 + 5), titre: L.length ? `${A.pct} % de l'objectif ${D.quarter}` : `Aucun objectif ${D.quarter}`,
        concl: L.length ? `${A.ok} commercia${A.ok > 1 ? 'ux' : 'l'} à 100 % ou plus sur ${L.length}${parts > 1 ? ` (page ${i + 1}/${parts})` : ''}` : 'Objectifs à saisir', capsule: `${A.pct} %`,
        notes: `Message : où en est chaque commercial face à son objectif. Chiffre : ${A.pct} % en moyenne pondérée. Question au public : qui accompagner en priorité ?` });
    }
    if (r.blocs.includes('portefeuille')) {
      ajoute({ kind: 'portefeuille', bloc: 'Portefeuille', titre: `${Pf.total} compte${this._s(Pf.total, '', 's')} en portefeuille`, concl: `${Pf.deps} département${this._s(Pf.deps, '', 's')} couvert${this._s(Pf.deps, '', 's')} sur 96`, capsule: `${Pf.deps} / 96`,
        notes: `Message : la répartition par canal, le pipeline et la couverture. Chiffre : ${Pf.deps} départements. Question au public : quels départements ouvrir en premier ?` });
    }
    ajoute({ kind: 'synthese', bloc: 'Synthèse', titre: `${Y.act} compte${this._s(Y.act, '', 's')} Empower activé${this._s(Y.act, '', 's')}`, concl: Y.non ? `${Y.non} sur ${Y.act + Y.non} à relancer pour une première commande` : 'Aucune relance de première commande',
      capsule: `${Y.act} / ${Y.act + Y.non}`, notes: `Message : ce qui est activé et ce qui reste à faire. Chiffre : ${Y.act} activés. Question au public : quelle action décide-t-on aujourd'hui ?`,
      lignes: [`${Y.act} compte${this._s(Y.act, '', 's')} Empower activé${this._s(Y.act, '', 's')} (première commande passée), ${Y.non} non activé${this._s(Y.non, '', 's')}.`,
        Y.non ? `Prochaine action : relancer ${Y.non > 1 ? 'les ' + Y.non + ' comptes Empower onboardés' : 'le compte Empower onboardé'} sans première commande.` : 'Aucun compte Empower en attente de première commande.',
        Y.sous.length ? `Objectif sous 80 % : ${Y.sous.join(', ')}. Point d'accompagnement à prévoir.` : 'Aucun commercial sous 80 % de son objectif.'] });
    return sl.slice(0, 24);
  },

  // Contrôle qualité automatique : caractères interdits, lignes droites, tailles de police
  _qaTextes(textes) { return textes.filter(t => /[–—]/.test(t)).map(t => 'Tiret interdit dans : ' + t.slice(0, 50)); },
  _qaHtml(html) {
    const e = [];
    html = html.replace(/<div class="logos">[\s\S]*?<\/div>/, ''); // les logos de marque (tracés du logo Norton) ne sont pas du décor
    if (/[–—]/.test(html)) e.push('Tiret long ou demi-cadratin dans le HTML');
    if (/(?<!box-sizing:)border(?!-radius|-spacing|-collapse:separate)/i.test(html)) e.push('Bordure dans le CSS');
    if (/<hr|<line|<polyline|text-decoration|underline|outline(?!-offset)/i.test(html)) e.push('Ligne droite ou soulignement dans le HTML');
    return e;
  },

  // Passe finale sur le XML du PPTX : supprime tout contour (aplats seuls) puis vérifie lignes, connecteurs, tirets, polices < 12 pt
  async _finaliserPptx(buf) {
    const zip = await JSZip.loadAsync(buf), err = [];
    for (const nom of Object.keys(zip.files).filter(n => /^ppt\/(slides|charts|notesSlides|slideMasters|slideLayouts|notesMasters|theme)\/[^/]+\.xml$/.test(n))) {
      let x = (await zip.file(nom).async('string')).replace(/<a:buChar char="[\u2013\u2014]"\/>/g, '<a:buChar char="\u2022"/>');
      x = x.replace(/<a:ln\b[^>]*\/>/g, '<a:ln><a:noFill/></a:ln>').replace(/<a:ln\b[^>]*>[\s\S]*?<\/a:ln>/g, '<a:ln><a:noFill/></a:ln>');
      if (/[\u2013\u2014]/.test(x)) err.push('Tiret interdit : ' + nom);
      if (/<p:cxnSp|prst="line"|<c:majorGridlines|<c:minorGridlines/.test(x)) err.push('Ligne droite : ' + nom);
      if (/\su="(?!none)/.test(x)) err.push('Soulignement : ' + nom);
      if (/\ssz="(\d{3,4})"/.test(x) && [...x.matchAll(/\ssz="(\d+)"/g)].some(m => Number(m[1]) < 1200)) err.push('Police sous 12 pt : ' + nom);
      zip.file(nom, x);
    }
    if (err.length) throw new Error('Contrôle qualité PPTX : ' + err[0]);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  },
  _telecharger(blob, nom) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },

  // ── PDF : rendu dans js/rapport-export.js (gabarit V3) ──
  genererPDF() {
    const r = this._x(); if (!this.BLOCS.some(x => r.blocs.includes(x[0]))) { if (window.Toast) Toast.afficher('Coche au moins un bloc', 'erreur'); return; }
    const D = this._donneesRapport(), slides = this._slides(D), html = this._htmlRapport(D, slides);
    const err = [...this._qaChiffres(D), ...this._qaHtml(html)];
    if (err.length) { if (window.Toast) Toast.afficher('Contrôle qualité : ' + err[0], 'erreur'); console.error('QA rapport', err); return; }
    if (!window.Visionneuse) { if (window.Toast) Toast.afficher('Visionneuse indisponible, rechargez la page', 'erreur'); return; }
    Visionneuse.html(html, { titre: 'Rapport' });   // aperçu dans l'application ; « Imprimer / PDF » au bouton, « Fermer » toujours visible
  },

  render() {
    const app = document.getElementById('app'), s = this.state; if (!app) return;
    const entete = `<header class="header-vue"><button onclick="Router.retour()" class="btn-retour" aria-label="Retour">←</button><h1>Analyse et objectifs</h1></header>${NavBar(window.hebergeParAdmin && hebergeParAdmin() ? 'admin' : 'analyse')}${typeof FusionTabs === 'function' ? (window.hebergeParAdmin && hebergeParAdmin() ? FusionTabs.administration() : FusionTabs.pilotage()) : ''}`;
    if (s.chargement) { app.innerHTML = entete + '<p style="padding:16px">Chargement…</p>'; return; }
    if (s.erreur) { app.innerHTML = entete + `<p style="padding:16px">Erreur : ${this._esc(s.erreur)}</p>`; return; }
    const b = this._blocs();
    const onglets = [['vue', 'Vue d’ensemble'], ['rapport', 'Rapport']].map(([k, l]) => `<button class="tab-btn-premium ${s.onglet === k ? 'actif' : ''}" data-onglet="${k}">${l}</button>`).join('');
    const R = this._x(), pg = this._pagesRapport();
    const corps = s.onglet === 'rapport' ? `<section class="an-card"><div class="eyebrow" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Reporting · à la demande</div><h2 style="font-size:20px">Exporter un rapport</h2>
        <div class="an-xg"><div><h3>Format</h3><div class="an-seg">${['PDF', 'PPT'].map(f => `<button data-xf="${f}" class="${R.fmt === f ? 'on' : ''}">${f}</button>`).join('')}</div>
          <h3 style="margin-top:14px">Période</h3><div class="an-seg">${this.PERIODES_RAPPORT.map(p => `<button data-xp="${p}" class="${R.per === p ? 'on' : ''}">${p}</button>`).join('')}</div>
          <h3 style="margin-top:14px">Blocs à inclure</h3>${this.BLOCS.map(x => `<label class="an-xb"><input type="checkbox" data-xb="${x[0]}" ${R.blocs.includes(x[0]) ? 'checked' : ''}><span><b>${x[1]}</b><small>${x[2]}</small></span></label>`).join('')}
          <label class="an-xb"><input type="checkbox" data-xph ${R.photos ? 'checked' : ''}><span><b>Inclure les photos des visites</b><small>Photos rattachées aux visites de la période</small></span></label></div>
          <div><h3>Aperçu en direct · ${R.fmt} · ${pg.length} pages</h3><div id="an-live" class="an-live" aria-live="polite"><div class="an-live-in"><iframe id="an-live-f" title="Aperçu du rapport" sandbox="allow-same-origin"></iframe></div></div>
            <p class="an-live-leg">${pg.map((t, i) => `${i + 1}. ${t}`).join(' · ')}</p>
            <p style="font-size:12px;opacity:.75;margin-top:10px">Gabarit du refresh : paysage (A4 en PDF, 16:9 en PPT), couleurs Marvesting (anthracite, corail), logos Marvesting et Norton Empower.</p></div></div>
        <button class="btn-primaire" id="an-pdf" style="margin-top:14px">Générer le ${R.fmt}</button>
        <p style="font-size:11px;opacity:.7;margin-top:8px">PDF : la fenêtre d’impression s’ouvre, choisis « Enregistrer au format PDF ». PPT : fichier .pptx 16:9 téléchargé (bibliothèque pptxgenjs 3.12.0, chargée à la demande).</p></section>`
      : `<div class="an-grid">${b.canaux}${b.tracker}${b.objectifs}</div>${this._detail()}`;
    app.innerHTML = `<style>
      .an{padding:12px 16px 90px}.an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.an-card{background:var(--bg-surface,#fff);border:1px solid var(--border-strong,#d5dade);border-radius:12px;padding:12px}
      .an-card h2{font-size:15px;margin:0 0 8px}.an-card svg{width:100%;height:auto}.an-card path,.an-card rect{cursor:pointer;outline-offset:2px}.an-card path:focus-visible,.an-card rect:focus-visible{stroke:#FF6D68;stroke-width:2}
      .an-donut{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.an-donut svg{width:170px;flex:none}.an-leg{display:flex;flex-wrap:wrap;gap:10px 14px;list-style:none;padding:0;margin:8px 0 0;font-size:12px}
      .an-leg span{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}.an-det{margin-top:12px;background:var(--bg-surface,#fff);border:1px solid var(--border-strong,#d5dade);border-radius:12px;padding:12px}
      .an-det ul{list-style:none;padding:0;margin:0}.an-det li{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-strong,#e3e6e9);font-size:13px}.an-det li span{opacity:.6}
      .an-xg{display:grid;grid-template-columns:minmax(300px,1.1fr) 1fr;gap:24px;margin-top:14px}@media(max-width:800px){.an-xg{grid-template-columns:1fr}}
      .an-seg{display:flex;gap:6px;flex-wrap:wrap}.an-seg button{padding:7px 14px;border-radius:999px;border:1px solid var(--border-strong,#ccd);background:transparent;color:inherit;font:inherit}.an-seg button.on{background:#FF6D68;border-color:#FF6D68;color:#fff}.an-seg button:disabled{opacity:.45;cursor:not-allowed}
      .an-xb{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--border-strong,#e3e6e9);cursor:pointer}.an-xb b{display:block;font-size:13px}.an-xb small{opacity:.65}
      .an-xp{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.an-pg{background:var(--bg-warm-white,#f2f4f5);border-radius:10px;padding:8px;aspect-ratio:16/10;position:relative;display:flex;flex-direction:column;gap:5px}.an-pg span{position:absolute;right:8px;top:6px;font-size:10px;font-weight:800;opacity:.5}.an-pg i{display:block;height:6px;background:#c9d0d6;border-radius:3px}.an-pg small{margin-top:auto;font-size:10px}
      .an-live{border:1px solid var(--border-strong,#d5dade);border-radius:10px;background:#EEF0F1;overflow:auto;max-height:560px;min-height:120px}.an-live-in{transform-origin:0 0;overflow:hidden}.an-live iframe{border:0;display:block;background:#fff;transform-origin:0 0}.an-live-leg{font-size:11px;opacity:.7;margin-top:6px}
      .an-vide{font-size:13px;opacity:.7}#an-tip{position:fixed;z-index:2000;pointer-events:none;background:#343F48;color:#fff;font-size:12px;padding:6px 9px;border-radius:6px;display:none;max-width:240px}</style>
      ${entete}<div class="an"><div style="display:flex;gap:8px;margin-bottom:10px">${onglets}</div>${corps}</div><div id="an-tip" role="tooltip"></div>`;
    this._bind(app);
    if (s.onglet === 'rapport') this._apercuLive(app);
  },

  // Aperçu en direct : le vrai HTML du PDF (même gabarit et mêmes chiffres que l'export), recalculé à chaque modification des options.
  _apercuLive(app) {
    const box = app.querySelector('#an-live'), f = app.querySelector('#an-live-f'); if (!box || !f) return;
    const R = this._x();
    if (!this.BLOCS.some(x => R.blocs.includes(x[0]))) { box.innerHTML = '<p class="an-vide" style="padding:12px">Coche au moins un bloc pour voir l’aperçu.</p>'; return; }
    let html;
    try { const D = this._donneesRapport(); html = this._htmlRapport(D, this._slides(D)); }
    catch (e) { box.innerHTML = `<p class="an-vide" style="padding:12px">Aperçu indisponible : ${this._esc(e.message || e)}</p>`; return; }
    const inner = box.querySelector('.an-live-in'), W = 1123, k = Math.min(1, (box.clientWidth || 520) / W);
    f.style.width = W + 'px'; f.style.height = '794px'; f.style.transform = `scale(${k})`;
    inner.style.width = Math.round(W * k) + 'px'; inner.style.height = Math.round(794 * k) + 'px';
    f.onload = () => { try {
      // Le cadre n'exécute aucun script : le masquage des photos cassées (onerror du PDF) est reproduit ici
      [...f.contentDocument.images].forEach(im => { const cache = () => { if (im.parentNode) im.parentNode.style.display = 'none'; }; im.addEventListener('error', cache); if (im.complete && !im.naturalWidth) cache(); });
      const h = f.contentDocument.documentElement.scrollHeight; f.style.height = h + 'px'; inner.style.height = Math.round(h * k) + 'px'; } catch (e) { /* hauteur par défaut */ } };
    f.srcdoc = html;
  },

  _bind(app) {
    const s = this.state, tip = app.querySelector('#an-tip');
    const montre = (e, t) => { tip.textContent = t; tip.style.display = 'block'; tip.style.left = Math.min(e.clientX + 12, innerWidth - 250) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; };
    app.querySelectorAll('[data-tip]').forEach(el => {
      el.onmousemove = e => montre(e, el.dataset.tip); el.onmouseleave = () => { tip.style.display = 'none'; };
      el.onfocus = () => { const r = el.getBoundingClientRect(); montre({ clientX: r.left + r.width / 2, clientY: r.top }, el.dataset.tip); }; el.onblur = () => { tip.style.display = 'none'; };
    });
    app.querySelectorAll('[data-sel]').forEach(el => {
      const go = () => { s.sel = s.sel === el.dataset.sel ? null : el.dataset.sel; this.render(); };
      el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    app.querySelectorAll('[data-onglet]').forEach(b => b.onclick = () => { s.onglet = b.dataset.onglet; this.render(); });
    const R = this._x();
    app.querySelectorAll('[data-xf]').forEach(b => b.onclick = () => { if (!b.disabled) { R.fmt = b.dataset.xf; this.render(); } });
    app.querySelectorAll('[data-xp]').forEach(b => b.onclick = () => { R.per = b.dataset.xp; this.render(); });
    app.querySelectorAll('[data-xb]').forEach(c => c.onchange = () => { R.blocs = c.checked ? [...new Set([...R.blocs, c.dataset.xb])] : R.blocs.filter(x => x !== c.dataset.xb); this.render(); });
    app.querySelectorAll('[data-xph]').forEach(c => c.onchange = () => { R.photos = c.checked; this.render(); });
    const pdf = app.querySelector('#an-pdf'); if (pdf) pdf.onclick = () => (this._x().fmt === 'PPT' ? this.genererPPT() : this.genererPDF());
  },
};
