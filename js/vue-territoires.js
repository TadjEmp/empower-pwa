// ═══════════════════════════════════════
//  vue-territoires.js — Carte des territoires (droit « territoires »)
//  Variante B « Densité » validée : calques Revendeurs / N° de départements / Activés / Visites,
//  teinte par commercial du secteur (hachuré si partagé), bulles de compteur, filtres région,
//  département, commercial, canal, leads ; panneau « Alimentation de la carte », liste groupée
//  par département puis commune, fiche du compte sélectionné, réaffectation du secteur (ADMIN/Channel).
//  Localisation : code postal → département (js/contacts-geo.js), sans service externe.
//  Sources : COMPTES, LEADS, VISITES (SheetsAPI), secteurs_cp ; géométrie : js/france-deps.js (window.FR).
//  Périmètre : ADMIN / CHANNEL_MANAGER = tout ; CDS = ses comptes et visites ;
//  EXTERNE = tous les comptes et leads, SANS aucune visite.
// ═══════════════════════════════════════

window.VueTerritoires = {

  REG: { '11': 'Île-de-France', '24': 'Centre-Val de Loire', '27': 'Bourgogne-Franche-Comté', '28': 'Normandie',
         '32': 'Hauts-de-France', '44': 'Grand Est', '52': 'Pays de la Loire', '53': 'Bretagne', '75': 'Nouvelle-Aquitaine',
         '76': 'Occitanie', '84': 'Auvergne-Rhône-Alpes', '93': 'Provence-Alpes-Côte d’Azur', '94': 'Corse' },

  // Couleur stable par commercial (même logique que les avatars du pipeline)
  COULEURS: { 1000: '#5B7391', 4001: '#C49A4A', 4002: '#8E7BB0', 4003: '#5E9C8E' },
  _couleur(pin) { return this.COULEURS[Number(pin)] || '#343F48'; },

  // Le plein écran ajoute une entrée d'historique : « retour » (bouton, geste, Échap) le ferme sans quitter la vue.
  _basculerPlein(rerender) {
    const s = this.state, h = window.history;
    if (!s.plein) { h.pushState({ ...(h.state || {}), terrPlein: true }, '', window.location.href); s.plein = true; rerender(); }
    else if (h.state && h.state.terrPlein) h.back();
    else { s.plein = false; rerender(); }
  },
  state: { chargement: true, erreur: null, comptes: [], leads: [], visites: [], secteurs: [], reg: '', dep: '', calque: 'rev',
           plein: false, com: '', src: '', canal: '', avecLeads: false, sel: '', ville: '', nonLoc: false, points: true, z: 1, cx: null, cy: null, _zk: '' },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  // Code département depuis un champ Departement ou un code postal ; null si illisible.
  _dep(dep, cp) { return window.ESI_GEO.depDe({ Departement: dep, Code_Postal: cp }); },

  async init() {
    this.state.chargement = true; this.state.erreur = null;
    if (Session.estExterne()) { if (this.state.calque === 'vis') this.state.calque = 'rev'; }
    this.render();
    try {
      const sb = SheetsAPI._sb;
      const [comptes, leads, visites, sect, baseLue] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', 'COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', 'LEADS').catch(() => []),
        Session.estExterne() ? Promise.resolve([]) : SheetsAPI.lire('EMPOWER_MDB', 'VISITES').catch(() => []),
        sb ? sb.from('secteurs_cp').select('*').eq('portee', 'DEPARTEMENT').eq('statut', 'ACTIF').then(r => r.data || []).catch(() => []) : [],
        SheetsAPI.lire('EMPOWER_MDB', 'base_comptes', { nocache: true }).catch(() => []),
      ]);
      const ok = r => !String(r.deleted || '').toUpperCase().includes('TRUE');
      const monPerimetre = pin => Session.voitTout() || Session.estExterne() || Number(pin) === Session.pin;
      // Base des comptes actifs enrichie : sert de liste de référence (filtre « Listing ») et de source de localisation.
      const base = Array.isArray(baseLue) ? baseLue : [];
      const dansBase = new Set(base.map(b => b.compte_id).filter(Boolean).map(String));
      this.state.comptes = (comptes || []).filter(ok).filter(c => monPerimetre(c.PIN_CDS_Assigne)).map(c => {
        const e = window.ContactsObjectif.etat(c);
        return { base: dansBase.has(String(c._uuid)), id: c.ID_Compte || c._uuid, nom: c.Nom_Compte, ville: c.Ville, pin: c.PIN_CDS_Assigne, canal: c.CANAL,
                 cp: c.Code_Postal, dep: this._dep(c.Departement, c.Code_Postal), empower: !!window.estEmpower(c),
                 active: !!(window.estEmpower(c) && window.FlagsCanal.active(c)), adresse: e.adresse, fiche: e.pct,
                 palier: window.Paliers.palier(c), raw: c };
      });
      // Lignes de la base sans compte rattaché dans l'application : points « base seule » (sans fiche à ouvrir).
      const pinDe = nom => { const k = String(nom || '').trim().toUpperCase(), reg = window._CDS_REGISTRY || {};
        const p = Object.keys(reg).find(x => String(reg[x]).trim().toUpperCase().split(/\s+/)[0] === k); return p ? Number(p) : null; };
      base.filter(b => !b.compte_id).forEach(b => {
        const pin = pinDe(b.commercial); if (!(Session.voitTout() || Session.estExterne() || (pin != null && pin === Session.pin))) return;
        this.state.comptes.push({ baseSeule: true, base: true, id: 'base:' + b.id, nom: b.nom, ville: b.ville, pin, canal: b.type_compte, cp: b.code_postal,
          dep: this._dep(null, b.code_postal), empower: /^(empower|mi2)$/i.test(String(b.type_compte || '')), active: false, adresse: !!String(b.adresse || '').trim(), fiche: 0, raw: null });
      });
      this.state.leads = (leads || []).filter(ok).filter(l => Session.voitTout() || Session.estExterne() || !l.PIN_CDS_Assigne || Number(l.PIN_CDS_Assigne) === Session.pin)
        .map(l => ({ id: l.ID_Prospect || l._uuid, nom: l.Nom_Compte, ville: l.Ville, pin: l.PIN_CDS_Assigne, canal: l.CANAL,
                     cp: l.Code_Postal, dep: this._dep(l.Departement, l.Code_Postal), lead: true }));
      this.state.visites = (visites || []).filter(ok).filter(v => monPerimetre(v.PIN_CDS))
        .map(v => ({ pin: v.PIN_CDS, date: String(v.Date || v.Date_Planif || '').slice(0, 10), dep: this._dep(v.Departement, null) }));
      this.state.secteurs = sect;
    } catch (e) { this.state.erreur = e.message; }
    this.state.chargement = false;
    this.render();
  },

  // ── Données filtrées ──────────────────────────────────────────────────
  _estCanal(r) { return /^empower$/i.test(String(r.canal || '')); },
  _lignes() {
    const s = this.state;
    const l = s.comptes.concat(s.avecLeads ? s.leads : []);
    return l.filter(c => (!s.com || String(c.pin) === s.com)
      && (!s.src || (s.src === 'BASE' ? c.base : (!c.base && !c.lead)))
      && (!s.ville || this._cleVille(c.ville) === s.ville)
      && (!s.canal || (s.canal === 'EMPOWER' ? this._estCanal(c) : !this._estCanal(c))));
  },
  _visitesF() { const s = this.state; return s.visites.filter(v => !s.com || String(v.pin) === s.com); },
  _pinsDep(code) { return this.state.secteurs.filter(x => x.code === code).map(x => Number(x.pin_cds)).filter(Boolean); },

  _dataDeps() {
    const par = {};
    const get = c => (par[c] = par[c] || { comptes: 0, empower: 0, actives: 0, leads: 0, visites: 0 });
    this._lignes().forEach(c => { if (!c.dep) return; const o = get(c.dep); if (c.lead) o.leads++; else { o.comptes++; if (c.empower) o.empower++; if (c.active) o.actives++; } });
    this._visitesF().forEach(v => { if (v.dep) get(v.dep).visites++; });
    return par;
  },
  _valeur(o) {
    const s = this.state; if (!o) return 0;
    return s.calque === 'vis' ? o.visites : s.calque === 'act' ? o.actives : o.comptes + o.leads;
  },

  // ── Carte ─────────────────────────────────────────────────────────────
  _bbox(d) {
    const n = (d.match(/-?\d+\.?\d*/g) || []).map(Number); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    n.forEach((v, i) => { if (i % 2 === 0) { x0 = Math.min(x0, v); x1 = Math.max(x1, v); } else { y0 = Math.min(y0, v); y1 = Math.max(y1, v); } });
    return [x0, y0, x1 - x0, y1 - y0];
  },
  _viewBox() {
    const s = this.state, deps = window.FR.deps; let b = [0, 0, window.FR.w, window.FR.h];
    const scope = deps.filter(d => (!s.reg || d.r === s.reg) && (!s.dep || d.c === s.dep));
    if ((s.reg || s.dep) && scope.length) {
      const bs = scope.map(d => d._b || (d._b = this._bbox(d.d)));
      const x0 = Math.min(...bs.map(v => v[0])), y0 = Math.min(...bs.map(v => v[1])),
            x1 = Math.max(...bs.map(v => v[0] + v[2])), y1 = Math.max(...bs.map(v => v[1] + v[3]));
      b = [x0, y0, x1 - x0, y1 - y0];
    }
    const pad = Math.max(b[2], b[3]) * .12 + 1; let [x, y, w, h] = [b[0] - pad, b[1] - pad, b[2] + 2 * pad, b[3] + 2 * pad];
    const ar = window.FR.w / window.FR.h;
    if (w / h < ar) { const nw = h * ar; x -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y -= (nh - h) / 2; h = nh; }
    const z = Math.max(1, Math.min(10, s.z || 1));
    if (z > 1) {
      const nw = w / z, nh = h / z, mx = s.cx == null ? x + w / 2 : s.cx, my = s.cy == null ? y + h / 2 : s.cy;
      const cx = Math.min(x + w - nw / 2, Math.max(x + nw / 2, mx)), cy = Math.min(y + h - nh / 2, Math.max(y + nh / 2, my));
      s.cx = cx; s.cy = cy; return [cx - nw / 2, cy - nh / 2, nw, nh];
    }
    s.cx = null; s.cy = null;
    return [x, y, w, h];
  },

  // Points revendeurs : uniquement quand la lecture le permet (département choisi, région ou zoom suffisant), jamais sur la vue nationale
  _pointsVisibles() { return !!this.state.points; },
  // Position exacte : coordonnées GPS de la fiche projetées sur la carte (calage vérifié sur les fiches géolocalisées),
  // acceptées seulement si le point tombe bien dans le département de la fiche ; sinon placement au département.
  _gps(c, dep) {
    const r = c.raw || {}, la = parseFloat(r.GPS_Lat ?? r.latitude), lo = parseFloat(r.GPS_Lng ?? r.longitude);
    if (!isFinite(la) || !isFinite(lo) || !dep) return null;
    const pt = [6.7 * (lo + 5.15), 10.2 * (51.1 - la)];
    const rings = dep._rings || (dep._rings = dep.d.split('M').filter(Boolean).map(r => r.split('L').map(q => q.split(',').map(Number))));
    let dans = false;
    rings.forEach(rg => { for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) { const [xi, yi] = rg[i], [xj, yj] = rg[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) dans = !dans; } });
    return dans ? pt : null;
  },
  // Commune normalisée (sans accents ni casse) : sert de clé de filtre.
  _cleVille(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); },
  // Précision de localisation d'un compte et provenance de l'information (aucune position n'est inventée) :
  //   gps = coordonnées de la fiche ; commune = ville et code postal connus, point placé au département ;
  //   dep = département connu par le code postal seul ; aucune = à localiser.
  _precision(c) {
    const r = c.raw || {}, d = c.dep ? window.FR.deps.find(x => x.c === c.dep) : null;
    const src = r.Source_Import || r.source_import || (c.lead ? 'Lead du Tracker' : '');
    if (!c.dep) return { n: 'aucune', lib: 'À localiser', det: 'Code postal à renseigner', src };
    if (d && this._gps(c, d)) return { n: 'gps', lib: 'Position exacte', det: 'Coordonnées GPS de la fiche', src };
    if (c.ville) return { n: 'commune', lib: 'Commune connue', det: `${c.ville}${c.adresse ? ', adresse saisie' : ''} : point placé au département`, src };
    return { n: 'dep', lib: 'Département', det: 'Département déduit du code postal', src };
  },
  _couleurPoint(c) { return c.lead ? '#3E8E9B' : c.active ? '#343F48' : c.empower ? '#7B8A97' : '#C2CAD1'; },
  _points(par, vb, sc) {
    const s = this.state; if (!this._pointsVisibles()) return { svg: '', deps: new Set(), n: 0, plus: 0 };
    const [vx, vy, vw, vh] = vb, parDep = {};
    this._lignes().forEach(c => { if (c.dep) (parDep[c.dep] = parDep[c.dep] || []).push(c); });
    const rd = 2.6 * sc, MAX = 30, deps = new Set(); let svg = '', n = 0, plus = 0;
    window.FR.deps.forEach(d => {
      if (s.reg && d.r !== s.reg) return; if (s.dep && d.c !== s.dep) return;
      if (d.cx < vx - 4 || d.cx > vx + vw + 4 || d.cy < vy - 4 || d.cy > vy + vh + 4) return;
      const l = parDep[d.c]; if (!l || !l.length) return;
      deps.add(d.c);
      // Ordre stable : activés d'abord, puis Empower, grossistes, leads ; spirale régulière autour du centre du département
      const tri = l.slice().sort((a, b) => (b.active - a.active) || (b.empower - a.empower) || (a.lead ? 1 : 0) - (b.lead ? 1 : 0) || String(a.nom).localeCompare(String(b.nom)));
      const exacts = [], approx = [];
      tri.forEach(c => { const g = this._gps(c, d); (g ? exacts : approx).push([c, g]); });
      const pos = exacts.map(([c, g]) => [c, g[0], g[1], true]);
      approx.slice(0, Math.max(0, MAX - pos.length)).forEach(([c], i) => { const r = rd * 2.3 * Math.sqrt(i + .6), a = i * 2.39996; pos.push([c, d.cx + r * Math.cos(a), d.cy + r * Math.sin(a), false]); });
      pos.forEach(([c, x, y, exact]) => {
        const sel = String(s.sel) === String(c.id);
        const tip = `${c.nom}${c.lead ? ' (lead)' : ''}\n${c.ville || 'Ville n.c.'} · ${d.c}\n${c.lead ? 'Lead' : c.active ? 'Revendeur activé' : c.empower ? 'Empower, pas encore activé' : 'Grossiste'}\n${c.base ? 'Dans la base enrichie\n' : ''}${this._precision(c).lib}${exact ? '' : ' (point au département)'}`;
        svg += `<circle class="terr-pt-m" data-pt="${c.lead || c.baseSeule ? '' : this._esc(c.id)}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(sel ? rd * 1.7 : rd).toFixed(3)}" fill="${sel ? 'var(--terr-sel)' : this._couleurPoint(c)}" stroke="${c.base && !sel ? '#343F48' : '#fff'}" stroke-width="${(rd * (c.base && !sel ? .5 : .35)).toFixed(3)}" data-tip="${this._esc(tip)}"></circle>`;
        n++;
      });
      if (tri.length > pos.length) {
        plus += tri.length - pos.length;
        svg += `<text x="${(d.cx).toFixed(2)}" y="${(d.cy + rd * 2.3 * Math.sqrt(Math.max(approx.length, 1) + .6) + rd * 3).toFixed(2)}" font-size="${(rd * 3).toFixed(3)}" text-anchor="middle" class="dcode" pointer-events="none">+${tri.length - pos.length}</text>`;
      }
    });
    return { svg, deps, n, plus };
  },

  _carte(par) {
    const s = this.state, deps = window.FR.deps, vb = this._viewBox(), [vx, vy, vw, vh] = vb;
    const sc = Math.max(vw / window.FR.w * .5, .05), pts = this._points(par, vb, sc), tot = Math.max(1, ...deps.map(d => this._valeur(par[d.c])));
    const paths = deps.map(d => {
      const o = par[d.c] || {}, v = this._valeur(o), pins = this._pinsDep(d.c);
      const dim = (s.reg && d.r !== s.reg) || (s.dep && d.c !== s.dep) || (s.com && pins.length && !pins.includes(Number(s.com)));
      const sel = s.dep === d.c;
      let fill = 'var(--terr-vide)', op = 1;
      if (pins.length > 1) { fill = 'url(#terr-hach)'; }
      else if (pins.length === 1) { fill = this._couleur(pins[0]); op = s.calque === 'num' ? .28 : (v ? Math.min(.35 + .6 * v / tot, .95) : .14); }
      else if (v) { fill = 'var(--terr-fill)'; op = .18 + .72 * v / tot; }
      if (sel) { fill = 'var(--terr-sel)'; op = this._pointsVisibles() ? .16 : 1; }
      const noms = pins.map(p => window.resolveCDS(p)).join(', ') || 'secteur non attribué';
      const blanche = s.calque === 'act' && pins.length && !v;
      const tip = `${d.n} (${d.c})\nSecteur : ${noms}\n${o.comptes || 0} compte${(o.comptes || 0) > 1 ? 's' : ''} · ${o.empower || 0} Empower · ${o.actives || 0} activé${(o.actives || 0) > 1 ? 's' : ''}` +
        `${s.avecLeads ? `\n${o.leads || 0} lead${(o.leads || 0) > 1 ? 's' : ''}` : ''}${Session.estExterne() ? '' : `\n${o.visites || 0} visite${(o.visites || 0) > 1 ? 's' : ''}`}` +
        `${blanche ? '\nZone blanche : aucun revendeur activé' : ''}\n${sel ? 'Cliquer pour revenir à la région' : 'Cliquer pour zoomer'}`;
      return `<path d="${d.d}" data-dep="${d.c}" tabindex="0" role="button" aria-label="${this._esc(d.n)} (${d.c}), ${v} ${this._libCalque()}"
        class="${dim ? 'dim' : ''}" fill="${fill}" fill-opacity="${dim ? Math.min(op, .12) : op}"
        stroke="${blanche ? 'var(--terr-sel)' : 'var(--terr-trait)'}" stroke-width="${blanche ? .5 : .25}" ${blanche ? 'stroke-dasharray="1.4 1"' : ''}
        data-tip="${this._esc(tip)}"></path>`;
    }).join('');
    // Numéros de départements : calque dédié au national ; empilés au-dessus du compteur dès le zoom région
    const zoom = !!(s.reg || s.dep);
    const montrerCodes = s.calque === 'num' || zoom;
    const montrerBulles = s.calque !== 'num';
    const codes = montrerCodes ? deps.filter(d => (!s.reg || d.r === s.reg) && (!s.dep || d.c === s.dep) && !pts.deps.has(d.c)).map(d => {
      const v = this._valeur((par)[d.c]), dy = (montrerBulles && v) ? -5.2 * sc : 1.4 * sc;
      return `<text class="dcode" x="${d.cx.toFixed(2)}" y="${(d.cy + dy).toFixed(2)}" font-size="${(zoom ? 8 : 5.2) * sc}" text-anchor="middle" pointer-events="none">${d.c}</text>`;
    }).join('') : '';
    const bulles = montrerBulles ? deps.filter(d => (!s.reg || d.r === s.reg) && (!s.dep || d.c === s.dep) && !pts.deps.has(d.c)).map(d => {
      const v = this._valeur(par[d.c]); if (!v) return '';
      return `<g transform="translate(${d.cx.toFixed(2)} ${d.cy.toFixed(2)}) scale(${sc.toFixed(4)})" pointer-events="none">
        <circle r="${v > 99 ? 4.6 : 3.8}" fill="var(--terr-bulle)" stroke="#fff" stroke-width=".8"/>
        <text y="2.1" font-size="5.6" font-weight="800" text-anchor="middle" fill="#fff">${v}</text></g>`;
    }).join('') : '';
    return `<svg viewBox="${[vx, vy, vw, vh].map(v => v.toFixed(1)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Carte des départements" class="terr-svg" data-tipzone>
      <defs><pattern id="terr-hach" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="2.2" fill="#8A949E"/><rect width="1" height="2.2" fill="#E1E5E8"/></pattern></defs>
      ${paths}${codes}${bulles}<path id="terr-hov" d=""></path>${pts.svg}</svg>`;
  },
  _libCalque() { return { rev: 'revendeur(s)', num: 'revendeur(s)', act: 'activé(s)', vis: 'visite(s)' }[this.state.calque]; },

  // ── Panneaux ──────────────────────────────────────────────────────────
  _perimetreDeps() {
    const s = this.state;
    return new Set(window.FR.deps.filter(d => (!s.reg || d.r === s.reg) && (!s.dep || d.c === s.dep)).map(d => d.c));
  },
  _dansPerimetre() { const deps = this._perimetreDeps(); return this._lignes().filter(c => c.dep && deps.has(c.dep)); },

  _cartesCommerciaux() {
    const s = this.state, deps = this._perimetreDeps(), g = {};
    this._visitesF().filter(v => v.dep && deps.has(v.dep)).forEach(v => {
      const o = (g[v.pin] = g[v.pin] || { n: 0, last: '', deps: {} });
      o.n++; if (v.date > o.last) o.last = v.date; o.deps[v.dep] = (o.deps[v.dep] || 0) + 1;
    });
    const noms = Object.keys(g).sort((a, b) => g[b].n - g[a].n);
    if (!noms.length) return `<p class="terr-vide-msg">Aucune visite localisée dans ce périmètre.</p>`;
    const fd = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'n.c.';
    return noms.map(p => `<article class="terr-card" style="background:var(--bg-surface,#fff)"><h3><i class="terr-pt" style="background:${this._couleur(p)};margin-right:6px"></i>${this._esc(window.resolveCDS(p))}</h3>
      <div class="terr-n">${g[p].n} <span>visite${g[p].n > 1 ? 's' : ''}</span></div>
      <div class="terr-sub">Dernière : ${fd(g[p].last)}</div>
      <div class="terr-sub">${Object.keys(g[p].deps).sort().map(d => `${d} (${g[p].deps[d]})`).join(' · ')}</div></article>`).join('');
  },

  // Panneau « Alimentation de la carte » : d'où vient la localisation de chaque revendeur
  _alimentation() {
    const s = this.state, base = this._lignes().filter(c => !c.lead);
    const adr = base.filter(c => c.dep && c.adresse).length, cp = base.filter(c => c.dep && !c.adresse).length, nl = base.filter(c => !c.dep).length, tot = base.length || 1;
    const seg = (n, col, lib) => `<i style="width:${n / tot * 100}%;background:${col}" title="${lib} : ${n}"></i>`;
    const liste = s.nonLoc ? `<ul class="terr-liste" style="margin-top:8px">${base.filter(c => !c.dep).slice(0, 60).map(c => `<li>${c.baseSeule ? `<strong>${this._esc(c.nom)}</strong>` : `<a href="#/compte/${encodeURIComponent(c.id)}">${this._esc(c.nom)}</a>`}<span>${this._esc(c.ville || 'Ville inconnue')} · code postal à renseigner</span></li>`).join('')}</ul>${nl > 60 ? `<p class="terr-sub">60 premiers sur ${nl}.</p>` : ''}` : '';
    return `<section class="terr-panneau" aria-label="Alimentation de la carte"><div class="terr-eyebrow">Alimentation de la carte</div>
      <h2>${base.length} compte${base.length > 1 ? 's' : ''}, ${base.length - nl} placé${base.length - nl > 1 ? 's' : ''}</h2>
      <div class="terr-stk">${seg(adr, '#343F48', 'Adresse complète')}${seg(cp, '#8A949E', 'Code postal seul')}${seg(nl, '#C93A34', 'À localiser')}</div>
      <div class="terr-cl"><span><i style="background:#343F48"></i>Adresse complète ${adr}</span><span><i style="background:#8A949E"></i>Département par code postal ${cp}</span><span><i style="background:#C93A34"></i>À localiser ${nl}</span></div>
      <p class="terr-sub" style="margin-top:8px">Précision : ${(() => { const k = { gps: 0, commune: 0, dep: 0, aucune: 0 }; base.forEach(c => { k[this._precision(c).n]++; }); return `${k.gps} position${k.gps > 1 ? 's' : ''} exacte${k.gps > 1 ? 's' : ''} (GPS), ${k.commune} commune${k.commune > 1 ? 's' : ''} connue${k.commune > 1 ? 's' : ''}, ${k.dep} au département seul, ${k.aucune} à localiser`; })()}.</p>
      <p class="terr-sub" style="margin-top:8px">Chaque code postal saisi dans une fiche compte, lead ou contact place automatiquement le revendeur dans son département. Aucun point n’est inventé.</p>
      ${nl ? `<button class="terr-lien" data-nonloc="1">${s.nonLoc ? 'Masquer' : `Voir les ${nl} comptes à localiser`}</button>` : ''}${liste}</section>`;
  },

  _zonesBlanches() {
    const par = this._dataDeps(), suivis = new Set(this.state.secteurs.map(x => x.code));
    const blanches = [...suivis].filter(c => !(par[c] && par[c].actives)).sort();
    if (!blanches.length) return '';
    return `<p class="terr-sub" style="margin:6px 0 0"><strong>${blanches.length}</strong> département${blanches.length > 1 ? 's' : ''} suivi${blanches.length > 1 ? 's' : ''} sans revendeur activé : ${blanches.slice(0, 14).join(', ')}${blanches.length > 14 ? '…' : ''}</p>`;
  },

  _fiche() {
    const s = this.state; if (!s.sel) return '';
    const c = s.comptes.find(x => String(x.id) === String(s.sel)); if (!c) return '';
    const d = window.FR.deps.find(x => x.c === c.dep);
    return `<section class="terr-panneau" aria-label="Compte sélectionné"><div class="terr-eyebrow">Compte sélectionné</div>
      <h2>${this._esc(c.nom)}</h2>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0">${window.FlagsCanal.html(c.raw)} ${window.Paliers.badgePalier(c.raw)}</div>
      <dl class="terr-dl"><dt>Localisation</dt><dd>${this._esc(c.ville || 'n.c.')}${c.dep ? ' · ' + c.dep + (d ? ' ' + this._esc(d.n) : '') : ' · à localiser'}</dd>
        <dt>Précision</dt><dd>${this._esc(this._precision(c).lib)} · ${this._esc(this._precision(c).det)}</dd>
        ${this._precision(c).src ? `<dt>Provenance</dt><dd>${this._esc(this._precision(c).src)}</dd>` : ''}
        <dt>Commercial</dt><dd>${this._esc(window.resolveCDS(c.pin))}</dd>
        <dt>Fiche</dt><dd>${window.ContactsObjectif.pastille(c.raw)} ${c.fiche} %</dd></dl>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><a class="terr-btn" href="#/compte/${encodeURIComponent(c.id)}">Ouvrir la fiche</a>
      ${c.adresse ? '' : `<a class="terr-btn terr-btn-p" href="#/compte/${encodeURIComponent(c.id)}">Compléter la fiche</a>`}</div></section>`;
  },

  // Cartes de visite : visibles pour tous les rôles (ADMIN, CDS, Channel, Externe)
  _cartesVisite() {
    if (!window.EquipeContacts) return '';
    const s = this.state, deps = this._perimetreDeps();
    let pins = [];
    if (s.com) pins = [Number(s.com)];
    else { const set = new Set(); deps.forEach(c => this._pinsDep(c).forEach(p => set.add(Number(p)))); pins = [...set]; }
    pins = pins.filter(p => EquipeContacts.parPin(p)).sort((a, b) => a - b);
    // Alexandra (source les leads) n'accompagne que les périmètres qui ont un commercial attribué ; sinon : « À attribuer ».
    const alex = pins.length && (Session.estChannel() || Session.estExterne() || s.avecLeads) ? EquipeContacts.PERSONNES.find(x => x.pin == null) : null;
    if (!pins.length && !s.dep) return '';
    const lieu = s.dep ? s.dep : s.reg ? this.REG[s.reg] : 'France';
    return `<section class="terr-panneau" aria-label="Cartes de visite"><div class="terr-eyebrow">Commercial${pins.length > 1 ? 'aux' : ''} · ${this._esc(lieu)}</div>
      ${pins.map(p => EquipeContacts.carteDuCommercial(p)).join('')}${alex ? EquipeContacts.carte(alex) : ''}
      ${pins.length ? '' : '<p class="terr-sub">À attribuer : aucun chef de secteur sur ce périmètre.</p>'}</section>`;
  },

  _secteur() {
    const s = this.state; if (!s.dep) return '';
    const pins = this._pinsDep(s.dep), edit = window.AdminSecteurs && AdminSecteurs.peutEditer && AdminSecteurs.peutEditer();
    const lignes = s.secteurs.filter(x => x.code === s.dep);
    const liste = (window.VueFicheCompte ? VueFicheCompte.CDS_ASSIGNABLES : []);
    const d = window.FR.deps.find(x => x.c === s.dep);
    return `<section class="terr-panneau" aria-label="Secteur du département"><div class="terr-eyebrow">Secteur · ${s.dep} ${this._esc(d ? d.n : '')}</div>
      <h2>${pins.length ? pins.map(p => this._esc(window.resolveCDS(p))).join(' et ') : 'À attribuer'}</h2>
      ${pins.length ? '' : '<p class="terr-sub">Département sans chef de secteur' + (edit ? ' : choisissez-le ci-dessous (historisé).' : '.') + '</p>'}
      ${pins.length > 1 ? '<p class="terr-sub">Département partagé : les leads restent à attribuer manuellement.</p>' : ''}
      ${edit ? `<label class="terr-sub" style="display:block;margin-top:8px">${!lignes.length ? 'Attribuer ce département' : 'Réaffecter ' + (lignes.length > 1 ? 'le principal' : 'ce département')} (historisé)
        <select id="terr-realloc" style="margin-top:4px;width:100%"><option value="">Choisir un commercial…</option>${liste.map(x => `<option value="${x.pin}">${this._esc(x.nom)}</option>`).join('')}</select></label>` : ''}
      </section>`;
  },

  async _reaffecter(pin) {
    const s = this.state, ligne = s.secteurs.find(x => x.code === s.dep); if (!s.dep || !pin) return;
    let avant = ligne ? ligne.pin_cds : null;
    if (ligne) {
      const { error } = await SheetsAPI._sb.from('secteurs_cp').update({ pin_cds: Number(pin), maj_par: Number(Session.pin), updated_at: new Date().toISOString() }).eq('id', ligne.id);
      if (error) { Toast.afficher('Modification refusée : ' + error.message, 'erreur'); return; }
      ligne.pin_cds = Number(pin);
    } else {   // département à attribuer : première attribution = nouvelle ligne de secteur
      const { data, error } = await SheetsAPI._sb.from('secteurs_cp').insert({ portee: 'DEPARTEMENT', code: s.dep, pin_cds: Number(pin), statut: 'ACTIF', partage: false, note: 'Attribué depuis Territoires', maj_par: Number(Session.pin) }).select();
      if (error) { Toast.afficher('Attribution refusée : ' + error.message, 'erreur'); return; }
      s.secteurs.push((data && data[0]) || { portee: 'DEPARTEMENT', code: s.dep, pin_cds: Number(pin), statut: 'ACTIF' });
    }
    if (window.AdminSecteurs && AdminSecteurs._tracer) AdminSecteurs._tracer(`DEPARTEMENT ${s.dep} : ${avant ?? 'aucun'} → ${pin} (carte)`);
    Toast.afficher(`Département ${s.dep} réaffecté à ${window.resolveCDS(pin)}`, 'succes');
    this.render();
  },

  _liste() {
    const s = this.state, l = this._dansPerimetre().filter(c => !c.lead || s.avecLeads);
    const parDep = {}; l.forEach(c => { (parDep[c.dep] = parDep[c.dep] || []).push(c); });
    const nomDep = c => { const d = window.FR.deps.find(x => x.c === c); return d ? d.n : ''; };
    const ligne = c => `<li class="${String(s.sel) === String(c.id) ? 'sel' : ''}">${c.baseSeule ? `<strong>${this._esc(c.nom)}</strong>` : `<a href="#/compte/${encodeURIComponent(c.id)}" data-sel="${this._esc(c.id)}">${this._esc(c.nom)}${c.lead ? ' <em>(lead)</em>' : ''}</a>`}
        <span>${c.base ? '<em>Base</em> ·' : ''} ${c.baseSeule ? '' : window.Paliers.badgePalier(c.raw || {})} ${this._estCanal(c) ? 'Empower' : 'Grossiste'} · ${this._esc(window.resolveCDS(c.pin))} ${c.raw ? window.ContactsObjectif.pastille(c.raw) : ''}</span></li>`;
    const blocs = Object.keys(parDep).sort().slice(0, 40).map(dp => {
      const parVille = {}; parDep[dp].forEach(c => { (parVille[c.ville || 'Ville inconnue'] = parVille[c.ville || 'Ville inconnue'] || []).push(c); });
      return `<div class="terr-grp"><button class="terr-grp-t" data-dep-go="${dp}"><span>${dp} · ${this._esc(nomDep(dp))}</span><span>${parDep[dp].length} ›</span></button>
        ${s.dep ? Object.keys(parVille).sort().map(v => `<button type="button" class="terr-ville" data-ville="${this._esc(this._cleVille(v === 'Ville inconnue' ? '' : v))}" aria-pressed="${s.ville && s.ville === this._cleVille(v)}" title="Filtrer la carte sur cette commune" style="width:100%;border:0;background:none;font:inherit;cursor:pointer;text-align:left"><span>${this._esc(v)}</span><span>${parVille[v].length}</span></button><ul class="terr-liste">${parVille[v].slice(0, 80).map(ligne).join('')}</ul>`).join('') : ''}</div>`;
    }).join('');
    return `<section aria-label="Comptes du périmètre" id="terr-liste" tabindex="-1"><h2>${s.dep ? 'Communes et comptes' : 'Départements et comptes'} (${l.length})</h2>
      <p class="terr-sub">${s.dep ? 'Un clic sur une commune filtre la carte et la liste sur cette commune.' : 'Liste liée à la carte : un clic sur un département zoome.'}</p>
      ${s.ville ? `<button class="terr-chip" data-ville-off="1" aria-label="Retirer le filtre commune">Commune : ${this._esc(s.ville)} ✕</button>` : ''}${blocs || '<p class="terr-vide-msg">Aucun compte dans ce périmètre.</p>'}</section>`;
  },

  render() {
    const app = document.getElementById('app'), s = this.state;
    if (!app) return;
    if (s.chargement) { app.innerHTML = '<div class="header-vue"><button onclick="Router.retour()" class="btn-retour" aria-label="Retour">←</button><h1>Territoires</h1></div><p style="padding:16px">Chargement…</p>'; return; }
    if (s.erreur) { app.innerHTML = `<div class="header-vue"><button onclick="Router.retour()" class="btn-retour" aria-label="Retour">←</button><h1>Territoires</h1></div><p style="padding:16px">Erreur : ${this._esc(s.erreur)}</p>`; return; }
    const zk = s.reg + '|' + s.dep; if (s._zk !== zk) { s._zk = zk; s.z = 1; s.cx = null; s.cy = null; s.ville = ''; }
    const par = this._dataDeps();
    const regs = Object.keys(this.REG).filter(r => window.FR.deps.some(d => d.r === r));
    const deps = window.FR.deps.filter(d => !s.reg || d.r === s.reg).slice().sort((a, b) => a.c.localeCompare(b.c));
    const maxLeg = Math.max(1, ...Object.values(par).map(x => this._valeur(x)));
    const pinsFiltre = [...new Set(s.comptes.map(c => String(c.pin || '')).filter(Boolean))].sort();
    s.plein = !!(window.history.state && window.history.state.terrPlein);
    const calques = [['rev', 'Revendeurs'], ['num', 'N° de départements'], ['act', 'Activés Empower']].concat(Session.estExterne() ? [] : [['vis', 'Visites']]);
    app.innerHTML = `<style>
      .terr{--terr-fill:#343F48;--terr-sel:#FF6D68;--terr-vide:#F7FAFB;--terr-trait:#fff;--terr-bulle:#343F48;--terr-fond:#F1F3F4;--terr-mer:#DCEAEE;padding:12px 16px 80px}
      @media (prefers-color-scheme:dark){.terr{--terr-vide:#2c3a41;--terr-trait:#14181c;--terr-fond:#1f262c;--terr-mer:#17252b}}
      .terr-bar{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;align-items:center}.terr-bar select{padding:8px 10px;border-radius:8px;border:0;background:var(--terr-fond);color:inherit;font:inherit}
      .terr-chip{padding:6px 12px;border-radius:999px;border:0;background:var(--terr-fond);color:inherit;font:inherit;font-size:13px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
      .terr-chip[aria-pressed=true]{background:#343F48;color:#fff}
      .terr-chip i{width:10px;height:10px;border-radius:50%;display:inline-block}
      .terr-seg{display:inline-flex;border-radius:10px;overflow:hidden;background:var(--terr-fond)}.terr-seg button{padding:7px 12px;border:0;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
      .terr-seg button[aria-pressed=true]{background:#343F48;color:#fff}
      .terr-ws{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:start}@media(max-width:900px){.terr-ws{grid-template-columns:1fr}}
      .terr-map{position:relative;background:var(--terr-mer);border-radius:14px;padding:8px;overflow:hidden}.terr-svg{width:100%;max-height:70vh;display:block;touch-action:none;cursor:grab}.terr-svg.drag{cursor:grabbing}
      .terr-svg .terr-pt-m{cursor:pointer;transition:r .12s}.terr-svg .terr-pt-m:hover{opacity:.8}
      .terr-svg path{cursor:pointer;outline:none;transition:fill-opacity .15s}.terr-svg path:focus-visible{stroke:#FF6D68;stroke-width:.8}
      .terr-svg #terr-hov{fill:none;stroke:#FF6D68;stroke-width:.9;stroke-linejoin:round;pointer-events:none;opacity:0;transition:opacity .08s}.terr-svg #terr-hov.on{opacity:1}
      .terr-svg .dcode{fill:var(--c-title,#1c2228);font-weight:700;paint-order:stroke;stroke:var(--bg-surface,#fff);stroke-width:.6}
      .terr.plein .terr-map{position:fixed;inset:0;z-index:1000;border-radius:0;padding:16px}.terr.plein .terr-svg{height:calc(100vh - 80px);max-height:none}
      .terr-tools{position:absolute;top:10px;right:10px;display:flex;gap:6px}.terr-tools button{min-width:34px;height:34px;border-radius:8px;border:0;box-shadow:0 2px 8px rgba(0,0,0,.12);background:var(--bg-surface,#fff);color:inherit;cursor:pointer}
      .terr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
      .terr-card,.terr-panneau{border:0;border-radius:14px;padding:14px;background:var(--terr-fond);margin-bottom:12px}
      .terr .vc,.terr .bloc-fiche{border:0;background:var(--bg-surface,#fff);box-shadow:0 1px 6px rgba(0,0,0,.06);margin:8px 0 0}.terr .bloc-fiche{padding:0;box-shadow:none;background:transparent}.terr .bloc-fiche>.bloc-titre{display:none}
      .terr-card h3{margin:0 0 4px;font-size:14px}.terr-n{font-size:26px;font-weight:700}.terr-n span{font-size:13px;font-weight:400}
      .terr-panneau h2{margin:2px 0 6px;font-size:16px}.terr-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.65;font-weight:700}
      .terr-sub{font-size:12px;opacity:.75;margin-top:2px}.terr-liste{list-style:none;padding:0;margin:0}.terr-liste li{display:flex;flex-direction:column;padding:8px 10px;border-radius:8px}.terr-liste li:nth-child(odd){background:rgba(52,63,72,.04)}.terr-liste li.sel{background:rgba(255,109,104,.14)}
      .terr-liste li span{font-size:12px;opacity:.8;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.terr-liste a{font-weight:600;text-decoration:none;color:inherit}
      .terr-grp-t{width:100%;display:flex;justify-content:space-between;padding:9px 10px;margin-top:6px;border:0;border-radius:8px;background:rgba(52,63,72,.08);color:inherit;font:inherit;font-weight:700;cursor:pointer}
      .terr-ville{display:flex;justify-content:space-between;font-size:12px;font-weight:700;opacity:.7;padding:8px 2px 2px}
      .terr-stk{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--terr-vide)}.terr-stk i{display:block}
      .terr-cl{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:6px}.terr-cl i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px}
      .terr-lien{background:none;border:0;color:var(--c-primary,#4A5A78);font:inherit;font-size:12px;cursor:pointer;padding:6px 0;text-decoration:underline}
      .terr-btn{padding:8px 12px;border-radius:8px;border:0;background:rgba(52,63,72,.08);text-decoration:none;color:inherit;font-size:13px}.terr-btn-p{background:#FF6D68;color:#fff}
      .terr-dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px;margin:0}.terr-dl dt{opacity:.65}.terr-dl dd{margin:0;font-weight:600}
      .terr-legende{display:flex;flex-wrap:wrap;align-items:center;gap:12px;font-size:11px;padding:6px 8px 0;opacity:.85}.terr-legende span{display:inline-flex;align-items:center;gap:5px}.terr-legende i{width:11px;height:11px;border-radius:3px;display:inline-block}.terr-ctn{display:flex;align-items:center;gap:8px;margin-top:6px}.terr-pt{width:10px;height:10px;border-radius:50%;display:inline-block}
      .terr-skip{position:absolute;left:-999px}.terr-skip:focus{left:8px;top:8px;background:#fff;padding:6px 10px;z-index:10}
      .terr-net{background:#fff3cd;color:#664d03;padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:8px}
      .fiche-meter{display:inline-block;width:46px;height:6px;border-radius:3px;background:var(--c-border,#dde);overflow:hidden;vertical-align:middle}.fiche-meter i{display:block;height:100%}
      .palier-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--pc) 14%,transparent);color:var(--pc)}
      .terr h2{font-size:15px}
    </style>
    <div class="header-vue"><button onclick="Router.retour()" class="btn-retour" aria-label="Retour">←</button><h1>Territoires</h1></div>
    ${NavBar('territoires')}
    <div class="terr${s.plein ? ' plein' : ''}">
      ${navigator.onLine === false ? '<div class="terr-net" role="status">Hors connexion : consultation seule. Les modifications ne sont pas confirmées tant que le réseau n’est pas rétabli.</div>' : ''}
      <a class="terr-skip" href="#terr-liste">Passer la carte : accéder à la liste</a>
      <nav class="pilo-ariane" aria-label="Fil d'Ariane" style="margin:2px 0 6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><button class="pilo-lien" data-ariane="fr">France</button>${s.reg ? `<i>›</i><button class="pilo-lien" data-ariane="reg">${this.REG[s.reg]}</button>` : ''}${s.dep ? `<i>›</i><strong>${s.dep} ${this._esc(((window.FR.deps.find(d => d.c === s.dep)) || {}).n || '')}</strong>` : ''}
        <span style="flex:1"></span><button class="terr-lien" data-ariane="fr">Réinitialiser</button></nav>
      <div class="terr-bar" role="group" aria-label="Filtres commercial">
        ${(Session.voitTout() || Session.estExterne()) ? `<button class="terr-chip" aria-pressed="${!s.com}" data-com="">Tous les commerciaux</button>${pinsFiltre.map(p => `<button class="terr-chip" aria-pressed="${s.com === p}" data-com="${p}"><i style="background:${this._couleur(p)}"></i>${this._esc(window.resolveCDS(p))}</button>`).join('')}` : ''}
      </div>
      <div class="terr-bar" role="group" aria-label="Listing des comptes">
        <span class="terr-sub" style="margin:0">Listing</span>
        <div class="terr-seg" role="group" aria-label="Source du listing">${[['', 'Base + Tracker'], ['BASE', `Base (${s.comptes.filter(c => c.base).length})`], ['HORS', `Hors base (${s.comptes.filter(c => !c.base).length})`]].map(([k, l]) => `<button data-src="${k}" aria-pressed="${s.src === k}">${l}</button>`).join('')}</div>
      </div>
      <div class="terr-bar" role="group" aria-label="Filtres carte">
        <div class="terr-seg" role="group" aria-label="Calque de la carte">${calques.map(([k, l]) => `<button data-calque="${k}" aria-pressed="${s.calque === k}">${l}</button>`).join('')}</div>
        <select id="terr-reg" aria-label="Région"><option value="">Toutes les régions</option>${regs.map(r => `<option value="${r}"${s.reg === r ? ' selected' : ''}>${this.REG[r]}</option>`).join('')}</select>
        <select id="terr-dep" aria-label="Département"><option value="">Tous les départements</option>${deps.map(d => `<option value="${d.c}"${s.dep === d.c ? ' selected' : ''}>${d.c} · ${this._esc(d.n)}</option>`).join('')}</select>
        <select id="terr-canal" aria-label="Canal"><option value="">Tous les canaux</option><option value="EMPOWER"${s.canal === 'EMPOWER' ? ' selected' : ''}>Empower</option><option value="GROSSISTE"${s.canal === 'GROSSISTE' ? ' selected' : ''}>Grossiste</option></select>
        <button class="terr-chip" id="terr-leads" aria-pressed="${s.avecLeads}">Inclure les leads (${s.leads.length})</button>
        <button class="terr-chip" id="terr-pts" aria-pressed="${s.points}" title="Affiche les revendeurs un par un dès qu'un département ou une région est choisi, ou en zoomant">Points revendeurs</button>
      </div>
      <div class="terr-ws">
        <div>
          <div class="terr-map">${this._carte(par)}
            <div class="terr-tools"><button id="terr-zi" aria-label="Zoom avant" title="Zoom avant">+</button><button id="terr-zo" aria-label="Zoom arrière" title="Zoom arrière">−</button><button id="terr-zr" aria-label="Recentrer" title="Recentrer" style="font-size:13px">⌖</button><button id="terr-up" aria-label="Niveau supérieur" title="Niveau supérieur">↑</button><button id="terr-fs" aria-label="${s.plein ? 'Quitter le plein écran' : 'Carte en plein écran'}" title="${s.plein ? 'Quitter le plein écran (Échap)' : 'Plein écran'}">${s.plein ? '⤡' : '⤢'}</button></div>
            <div class="terr-legende" aria-hidden="true"><span><i style="background:#343F48;opacity:.35"></i>Teinte plus soutenue = plus de ${s.calque === 'vis' ? 'visites' : s.calque === 'act' ? 'activés' : 'revendeurs'} (max ${maxLeg})</span><span><i style="background:repeating-linear-gradient(45deg,#8A949E 0 3px,#E1E5E8 3px 6px)"></i>Département partagé</span><span><i style="background:#FF6D68"></i>Sélectionné</span>${this._pointsVisibles() ? `<span><i style="background:#343F48;border-radius:50%"></i>Activé</span><span><i style="background:#7B8A97;border-radius:50%"></i>Empower</span><span><i style="background:#C2CAD1;border-radius:50%"></i>Grossiste</span>${s.avecLeads ? '<span><i style="background:#3E8E9B;border-radius:50%"></i>Lead</span>' : ''}<span><i style="background:#fff;border:2px solid #343F48;border-radius:50%;width:7px;height:7px"></i>Contour ardoise : dans la base</span><span style="opacity:.7">Point exact si GPS connu ; sinon placé au département (la fiche indique la précision)</span>` : ''}${s.calque === 'act' ? '<span><i style="background:repeating-linear-gradient(90deg,#FF6D68 0 3px,transparent 3px 5px)"></i>Zone blanche</span>' : ''}</div>
          </div>
          ${this._zonesBlanches()}
        </div>
        <div>
          ${this._secteur()}${this._cartesVisite()}${this._fiche()}
          ${Session.estExterne() ? '' : `<section class="terr-panneau"><div class="terr-eyebrow">Visites terrain · ${s.dep ? s.dep : s.reg ? this.REG[s.reg] : 'France'}</div><div class="terr-grid" style="margin-top:8px">${this._cartesCommerciaux()}</div></section>`}
          ${this._alimentation()}
        </div>
      </div>
      ${this._liste()}
    </div>`;
    this._bind(app);
  },

  _monter() {
    const s = this.state;
    if (s.sel) s.sel = ''; else if (s.ville) s.ville = ''; else if (s.dep) s.dep = ''; else s.reg = '';
  },

  _bind(app) {
    const s = this.state, rerender = () => this.render();
    app.querySelector('#terr-reg').onchange = e => { s.reg = e.target.value; s.dep = ''; s.sel = ''; rerender(); };
    app.querySelector('#terr-dep').onchange = e => { s.dep = e.target.value; s.sel = ''; if (s.dep) { const d = window.FR.deps.find(x => x.c === s.dep); if (d) s.reg = d.r; } rerender(); };
    app.querySelector('#terr-canal').onchange = e => { s.canal = e.target.value; rerender(); };
    app.querySelectorAll('[data-com]').forEach(b => b.onclick = () => { s.com = b.dataset.com; rerender(); });
    app.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { s.src = b.dataset.src; s.sel = ''; rerender(); });
    app.querySelector('#terr-leads').onclick = () => { s.avecLeads = !s.avecLeads; rerender(); };
    app.querySelectorAll('[data-ariane]').forEach(b => b.onclick = () => { const k = b.dataset.ariane; if (k === 'fr') { s.reg = ''; s.dep = ''; s.sel = ''; } else if (k === 'reg') { s.dep = ''; s.sel = ''; } rerender(); });
    app.querySelectorAll('[data-calque]').forEach(b => b.onclick = () => { s.calque = b.dataset.calque; rerender(); });
    app.querySelector('#terr-pts').onclick = () => { s.points = !s.points; rerender(); };
    const zoomer = (f, px, py) => { // px, py : point fixe en coordonnées du viewBox
      const vb = this._viewBox(), nz = Math.max(1, Math.min(10, s.z * f)); if (nz === s.z) return;
      const k = s.z / nz; s.z = nz;
      if (px != null) { s.cx = px - (px - (vb[0] + vb[2] / 2)) * k; s.cy = py - (py - (vb[1] + vb[3] / 2)) * k; }
      rerender();
    };
    app.querySelector('#terr-zi').onclick = () => zoomer(1.6);
    app.querySelector('#terr-zo').onclick = () => zoomer(1 / 1.6);
    app.querySelector('#terr-zr').onclick = () => { s.z = 1; s.cx = null; s.cy = null; rerender(); };
    const svg = app.querySelector('.terr-svg');
    if (svg) {
      const pos = (cx, cy) => { const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), k = Math.max(vb.width / r.width, vb.height / r.height);
        return { k, x: vb.x + vb.width / 2 + (cx - r.left - r.width / 2) * k, y: vb.y + vb.height / 2 + (cy - r.top - r.height / 2) * k }; };
      let tw = null;
      // Zoom proportionnel au geste (molette, trackpad à deux doigts, pincement) : le viewBox est mis à jour
      // immédiatement, le rendu complet n'est refait qu'une fois le geste terminé.
      const zoomerVers = (f, cx, cy) => {
        const q = pos(cx, cy), vb = this._viewBox(), nz = Math.max(1, Math.min(10, s.z * f)); if (nz === s.z) return;
        const k = s.z / nz; s.z = nz;
        if (nz <= 1.001) { s.z = 1; s.cx = null; s.cy = null; }
        else { s.cx = q.x - (q.x - (vb[0] + vb[2] / 2)) * k; s.cy = q.y - (q.y - (vb[1] + vb[3] / 2)) * k; }
        svg.setAttribute('viewBox', this._viewBox().map(v => v.toFixed(1)).join(' '));
        clearTimeout(tw); tw = setTimeout(rerender, 160);
      };
      svg.addEventListener('wheel', e => {
        e.preventDefault();
        const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
        const d = Math.max(-80, Math.min(80, px));                       // borne les pics d'inertie
        zoomerVers(Math.exp(-d * (e.ctrlKey ? 0.012 : 0.004)), e.clientX, e.clientY);
      }, { passive: false });
      // Safari : pincement trackpad (événements gesture*)
      let g0 = 1;
      svg.addEventListener('gesturestart', e => { e.preventDefault(); g0 = 1; });
      svg.addEventListener('gesturechange', e => { e.preventDefault(); const f = e.scale / g0; g0 = e.scale; zoomerVers(f, e.clientX, e.clientY); });
      const ptrs = new Map(); let d0 = 0, z0 = 1, mv = 0, dernier = null;
      svg.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); mv = 0; dernier = { x: e.clientX, y: e.clientY }; z0 = s.z;
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y); } });
      svg.addEventListener('pointermove', e => {
        if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 2 && d0) { const [a, b] = [...ptrs.values()]; s.z = Math.max(1, Math.min(10, z0 * Math.hypot(a.x - b.x, a.y - b.y) / d0)); mv = 99; this._viewBox(); svg.setAttribute('viewBox', this._viewBox().map(v => v.toFixed(1)).join(' ')); return; }
        if (s.z <= 1) return;
        const dx = e.clientX - dernier.x, dy = e.clientY - dernier.y; mv += Math.abs(dx) + Math.abs(dy); if (mv < 6) return;
        const q = pos(0, 0), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = Math.max(vb.width / r.width, vb.height / r.height);
        s.cx = (s.cx == null ? vb.x + vb.width / 2 : s.cx) - dx * k; s.cy = (s.cy == null ? vb.y + vb.height / 2 : s.cy) - dy * k;
        dernier = { x: e.clientX, y: e.clientY }; svg.classList.add('drag'); svg.setAttribute('viewBox', this._viewBox().map(v => v.toFixed(1)).join(' ')); });
      const fin = e => { const bouge = mv > 5; ptrs.delete(e.pointerId); svg.classList.remove('drag'); if (bouge) { s._glisse = true; setTimeout(() => { s._glisse = false; }, 60); if (!ptrs.size) rerender(); } };
      svg.addEventListener('pointerup', fin); svg.addEventListener('pointercancel', fin);
      svg.addEventListener('click', e => { if (s._glisse) { e.stopPropagation(); e.preventDefault(); } }, true);
      svg.querySelectorAll('[data-pt]').forEach(c => c.addEventListener('click', e => { e.stopPropagation(); const id = c.dataset.pt; if (!id) return;
        s.sel = id; const cp = s.comptes.find(x => String(x.id) === String(id)); if (cp && cp.dep) { const d = window.FR.deps.find(x => x.c === cp.dep); if (d) { s.reg = d.r; s.dep = d.c; } } rerender(); }));
    }
    app.querySelector('#terr-fs').onclick = () => this._basculerPlein(rerender);
    app.querySelector('#terr-up').onclick = () => { this._monter(); rerender(); };
    const nl = app.querySelector('[data-nonloc]'); if (nl) nl.onclick = () => { s.nonLoc = !s.nonLoc; rerender(); };
    const re = app.querySelector('#terr-realloc'); if (re) re.onchange = e => this._reaffecter(e.target.value);
    const aller = c => {
      const d = window.FR.deps.find(x => x.c === c); if (!d) return;
      s.sel = '';
      if (!s.reg || s.reg !== d.r) { s.reg = d.r; s.dep = ''; } else s.dep = s.dep === c ? '' : c;
      rerender();
    };
    const hov = app.querySelector('#terr-hov');
    app.querySelectorAll('path[data-dep]').forEach(p => {
      const montrer = () => { if (hov) { hov.setAttribute('d', p.getAttribute('d')); hov.classList.add('on'); } };
      const cacher = () => { if (hov) hov.classList.remove('on'); };
      p.addEventListener('mouseenter', montrer); p.addEventListener('mouseleave', cacher);
      p.addEventListener('focus', montrer); p.addEventListener('blur', cacher);
      const go = () => aller(p.dataset.dep);
      p.onclick = go; p.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    app.querySelectorAll('[data-ville]').forEach(b => b.onclick = () => { const v = b.dataset.ville; s.ville = s.ville === v ? '' : v; s.sel = ''; rerender(); });
    app.querySelectorAll('[data-ville-off]').forEach(b => b.onclick = () => { s.ville = ''; rerender(); });
    app.querySelectorAll('[data-dep-go]').forEach(b => b.onclick = () => { const d = window.FR.deps.find(x => x.c === b.dataset.depGo); if (d) { s.reg = d.r; s.dep = d.c; s.sel = ''; rerender(); } });
    app.querySelectorAll('[data-sel]').forEach(a => a.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault(); s.sel = a.dataset.sel; const c = s.comptes.find(x => String(x.id) === String(s.sel)); if (c && c.dep) { const d = window.FR.deps.find(x => x.c === c.dep); if (d) { s.reg = d.r; s.dep = d.c; } } rerender();
    }));
    if (!this._esc2) {
      this._esc2 = true;
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !document.querySelector('.terr')) return;
        if (this.state.plein) this._basculerPlein(() => this.render());
        else if (this.state.sel || this.state.dep || this.state.reg) { this._monter(); this.render(); }
      });
    }
  },
};
