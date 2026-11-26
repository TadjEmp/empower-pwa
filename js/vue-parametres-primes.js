// ═══════════════════════════════════════
//  vue-parametres-primes.js — Paramètres des primes (ADMIN)
//  Lit / enregistre le barème d'un trimestre via la fonction serveur « primes-baremes »
//  (actions get / history / save : révision incrémentée, motif obligatoire, contrôle de
//  cohérence côté serveur). Les objectifs CA se règlent dans Objectifs (saisie existante).
//  Sans session, hors ligne ou en erreur : rien n'est enregistré, message explicite.
// ═══════════════════════════════════════

window.VueParametresPrimes = {

  EXERCICE: 'FY27',
  CDS: [['T', 'Tadjidine'], ['L', 'Lyes'], ['M', 'Mehdi'], ['J', 'Johanne']],
  state: { q: 'Q3', chargement: true, erreur: null, conf: null, histo: [], msg: '', enCours: false },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async _appel(action, extra) {
    const r = await fetch(SUPABASE_URL + '/functions/v1/primes-baremes', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON },
      body: JSON.stringify(Object.assign({ token: Session.token, action, exercice: this.EXERCICE, trimestre: this.state.q }, extra || {})),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.ok) throw new Error((d && d.erreur) || 'Service indisponible');
    return d;
  },

  async init() {
    if (!Session.estManager()) { Router.aller('#/dashboard'); return; }
    await this.charger();
  },

  async charger(q) {
    if (q) this.state.q = q;
    Object.assign(this.state, { chargement: true, erreur: null, msg: '' });
    this.render();
    try {
      const [g, h] = await Promise.all([this._appel('get'), this._appel('history')]);
      this.state.conf = g.configuration; this.state.histo = h.historique || [];
    } catch (e) { this.state.conf = null; this.state.histo = []; this.state.erreur = e.message; }
    this.state.chargement = false;
    this.render();
  },

  // Lit le formulaire → objet barème (même structure que la fonction serveur).
  _lire() {
    const v = id => Number(document.getElementById('pb-' + id).value);
    const s = {}; this.CDS.forEach(([k]) => { s[k] = [v('nsb-' + k + '-0'), v('nsb-' + k + '-1')]; });
    return {
      a1: { p1: v('a1-p1'), p2: v('a1-p2'), p3: v('a1-p3'), m1: v('a1-m1'), m2: v('a1-m2'), mp3: v('a1-mp3') },
      nsb: { m1: v('nsb-m1'), m2: v('nsb-m2'), s },
      emp: { s1: v('emp-s1'), s2: v('emp-s2'), m1: v('emp-m1'), m2: v('emp-m2') },
      plafond: v('plafond'), bonus: v('bonus'),
    };
  },

  async enregistrer() {
    const s = this.state; if (s.enCours || !s.conf) return;
    const motif = (document.getElementById('pb-motif').value || '').trim();
    if (!motif) { s.msg = 'Indique le motif du changement.'; this.render(); return; }
    let bareme; try { bareme = this._lire(); } catch (e) { s.msg = 'Formulaire illisible.'; this.render(); return; }
    if (Object.values(bareme).flat().some(x => typeof x === 'number' && (!Number.isInteger(x) || x < 0))) { s.msg = 'Valeurs entières positives uniquement.'; this.render(); return; }
    s.enCours = true; s.msg = ''; this.render();
    try {
      const d = await this._appel('save', { bareme, motif, revision_attendue: s.conf.revision });
      s.conf = d.configuration;
      const h = await this._appel('history'); s.histo = h.historique || [];
      s.msg = 'Barème enregistré (révision ' + d.configuration.revision + ').';
      if (window.Toast) Toast.afficher(s.msg, 'succes');
    } catch (e) { s.msg = 'Non enregistré : ' + e.message; }
    s.enCours = false; this.render();
  },

  render() {
    const app = document.getElementById('app'), s = this.state, E = x => this._esc(x);
    if (!app) return;
    const tabs = typeof FusionTabs === 'function' && FusionTabs.administration ? FusionTabs.administration() : '';
    const entete = `<header class="header-vue"><button onclick="Router.retour()" class="btn-retour">←</button><h1>Barèmes des primes</h1></header>${NavBar('admin')}${tabs}`;
    if (s.chargement) { app.innerHTML = entete + '<p style="padding:16px">Chargement…</p>'; return; }
    const b = s.conf && s.conf.bareme;
    const champ = (id, lbl, val) => `<label style="font-size:12px;display:flex;flex-direction:column;gap:2px">${lbl}<input id="pb-${id}" type="number" min="0" step="1" value="${E(val)}" style="padding:6px 8px"></label>`;
    const grille = (...c) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">${c.join('')}</div>`;
    app.innerHTML = `${entete}
      <div class="dash-body avec-nav"><div class="dash-col-main">
        <div style="display:flex;gap:8px;margin-bottom:10px">${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `<button class="tab-btn-premium ${s.q === q ? 'actif' : ''}" onclick="VueParametresPrimes.charger('${q}')">${q}</button>`).join('')}</div>
        ${s.erreur ? `<div class="bloc-fiche"><p>Barème indisponible : ${E(s.erreur)}</p><p style="font-size:12px;opacity:.7">Les primes utilisent le barème par défaut tant que le serveur ne répond pas.</p></div>` : ''}
        ${b ? `
        <div class="bloc-fiche"><div class="bloc-titre">Axe 1, CA vs objectif (seuils en %)</div>${grille(
          champ('a1-p1', 'Seuil P1 (%)', b.a1.p1), champ('a1-p2', 'Seuil P2 (%)', b.a1.p2), champ('a1-p3', 'Seuil bonus P3 (%)', b.a1.p3),
          champ('a1-m1', 'Montant P1 (€)', b.a1.m1), champ('a1-m2', 'Montant P2 (€)', b.a1.m2), champ('a1-mp3', 'Bonus P3 (€)', b.a1.mp3))}</div>
        <div class="bloc-fiche"><div class="bloc-titre">Axe 2, NSB validées</div>${grille(
          champ('nsb-m1', 'Montant P1 (€)', b.nsb.m1), champ('nsb-m2', 'Montant P2 (€)', b.nsb.m2),
          ...this.CDS.map(([k, n]) => champ('nsb-' + k + '-0', n + ' seuil P1', b.nsb.s[k][0]) + champ('nsb-' + k + '-1', n + ' seuil P2', b.nsb.s[k][1])))}</div>
        <div class="bloc-fiche"><div class="bloc-titre">Axe 3, onboarding Empower</div>${grille(
          champ('emp-s1', 'Seuil P1 (comptes)', b.emp.s1), champ('emp-s2', 'Seuil P2 (comptes)', b.emp.s2),
          champ('emp-m1', 'Montant P1 (€)', b.emp.m1), champ('emp-m2', 'Montant P2 (€)', b.emp.m2))}</div>
        <div class="bloc-fiche"><div class="bloc-titre">Plafond et bonus manager</div>${grille(champ('plafond', 'Plafond (€)', b.plafond), champ('bonus', 'Bonus manager (€/Q)', b.bonus))}</div>
        <div class="bloc-fiche">
          <label style="font-size:12px">Motif du changement (obligatoire)<input id="pb-motif" type="text" maxlength="1000" style="width:100%;padding:8px;margin-top:2px"></label>
          <button class="btn-primaire" style="margin-top:10px" ${s.enCours ? 'disabled' : ''} onclick="VueParametresPrimes.enregistrer()">${s.enCours ? 'Enregistrement…' : 'Enregistrer le barème ' + E(s.q)}</button>
          <span style="font-size:12px;margin-left:8px">${E(s.msg)}</span>
          <p style="font-size:11px;opacity:.7;margin-top:8px">Révision actuelle : ${E(s.conf.revision)}. Le serveur refuse un barème incohérent ou une modification concurrente. Les objectifs CA se règlent dans <a href="#/objectifs">Objectifs</a>.</p>
        </div>
        <div class="bloc-fiche"><div class="bloc-titre">Historique (${s.histo.length})</div>${s.histo.map(h => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--c-border)">Révision ${E(h.revision)} · ${E(String(h.cree_le).slice(0, 16).replace('T', ' '))} · PIN ${E(h.auteur_pin == null ? '—' : h.auteur_pin)}${h.motif ? ' · ' + E(h.motif) : ''}</div>`).join('') || '<p style="font-size:12px">Aucune modification.</p>'}</div>` : ''}
      </div></div>`;
  },
};
