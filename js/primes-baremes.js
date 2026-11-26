/* ESI : barèmes de primes persistants (Supabase, fonction primes-baremes).
   Ajouté sans modifier vue-primes.js : les comptages (NSB, Empower, objectifs) restent calculés par l'original ;
   seuls les paliers, montants, plafond et bonus manager viennent du barème serveur.
   Sans session, hors ligne ou en cas d'erreur : barème par défaut (valeurs historiques du code), signalé à l'écran. */
(function () {
  'use strict';
  const V = window.VuePrimes;
  if (!V || V.__baremes) return;
  V.__baremes = true;

  const EXERCICE = 'FY27';
  const TRIMESTRES = ['Q1', 'Q2', 'Q3', 'Q4'];
  const LETTRE = { 1000: 'T', 4001: 'L', 4002: 'M', 4003: 'J' };
  const defaut = () => ({
    a1: { p1: 80, p2: 100, p3: 120, m1: 200, m2: 400, mp3: 100 },
    nsb: { m1: 75, m2: 150, s: { T: [8, 12], L: [8, 12], M: [5, 8], J: [5, 8] } },
    emp: { s1: 3, s2: 6, m1: 50, m2: 75 },
    plafond: 700,
    bonus: 300,
  });
  const store = {}, etat = {}, pending = {};
  const num = x => typeof x === 'number' && Number.isFinite(x);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function valide(b) {
    try {
      return !!(b
        && [b.a1.p1, b.a1.p2, b.a1.p3, b.a1.m1, b.a1.m2, b.a1.mp3, b.nsb.m1, b.nsb.m2,
            b.emp.s1, b.emp.s2, b.emp.m1, b.emp.m2, b.plafond, b.bonus].every(num)
        && ['T', 'L', 'M', 'J'].every(k => Array.isArray(b.nsb.s[k]) && b.nsb.s[k].length === 2 && b.nsb.s[k].every(num)));
    } catch (e) { return false; }
  }
  const bareme = q => (store[q] && store[q].bareme) || defaut();
  const trimestreCourant = () => (V.state && V.state.quarter) || 'Q1';
  const surPrimes = () => /primes/i.test(((window.location && (window.location.pathname + window.location.hash)) || ''));

  async function charger(q) {
    if (pending[q]) return;
    if (typeof Session === 'undefined' || !Session.token || typeof SUPABASE_URL === 'undefined') { etat[q] = { s: 'defaut' }; return; }
    pending[q] = true;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (typeof SUPABASE_ANON !== 'undefined') { headers.apikey = SUPABASE_ANON; headers.Authorization = 'Bearer ' + SUPABASE_ANON; }
      const resp = await fetch(SUPABASE_URL + '/functions/v1/primes-baremes', {
        method: 'POST', headers, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({ token: Session.token, action: 'get', exercice: EXERCICE, trimestre: q }),
      });
      const data = await resp.json();
      if (!resp.ok || !data || !data.ok) throw new Error((data && data.erreur) || 'Barème indisponible');
      if (!data.configuration || !valide(data.configuration.bareme)) throw new Error('Barème reçu invalide');
      store[q] = { bareme: data.configuration.bareme, revision: data.configuration.revision };
      etat[q] = { s: 'serveur' };
    } catch (e) {
      delete store[q];
      etat[q] = { s: 'erreur', m: e && e.message ? e.message : 'Barème indisponible' };
    } finally {
      if (t) clearTimeout(t);
      delete pending[q];
    }
  }
  function chargerTous() {
    return Promise.all(TRIMESTRES.map(charger)).then(() => {
      if (surPrimes() && V.state && !V.state.chargement) V.render();
    });
  }

  const calculerOrigine = V.calculer;
  V.calculer = function (pin, q) {
    const r = calculerOrigine.call(this, pin, q);
    const b = bareme(q);
    const pct = r.obj > 0 ? r.ca / r.obj * 100 : 0;
    let axe1 = 0, p3 = 0, palier1 = 'Non éligible';
    if (pct >= b.a1.p3) { axe1 = b.a1.m2; p3 = b.a1.mp3; palier1 = 'P2 + Bonus P3'; }
    else if (pct >= b.a1.p2) { axe1 = b.a1.m2; palier1 = 'P2'; }
    else if (pct >= b.a1.p1) { axe1 = b.a1.m1; palier1 = 'P1'; }
    const lettre = LETTRE[pin];
    const [s1, s2] = (lettre && b.nsb.s[lettre]) || [5, 8];
    let axe2 = 0, palier2 = `${r.nsbValid}/${s1}`;
    if (r.nsbValid >= s2) { axe2 = b.nsb.m2; palier2 = 'P2'; }
    else if (r.nsbValid >= s1) { axe2 = b.nsb.m1; palier2 = 'P1'; }
    let axe3 = 0, palier3 = `${r.integres}/${b.emp.s1}`;
    if (r.integres >= b.emp.s2) { axe3 = b.emp.m2; palier3 = 'P2'; }
    else if (r.integres >= b.emp.s1) { axe3 = b.emp.m1; palier3 = 'P1'; }
    const std = Math.min(b.plafond, axe1 + axe2 + axe3);
    return Object.assign({}, r, { axe1, palier1, axe2, palier2, s1, s2, axe3, palier3, p3, total: std + p3 });
  };

  const bonusOrigine = V.bonusManager;
  V.bonusManager = function (q) {
    const r = bonusOrigine.call(this, q);
    return Object.assign({}, r, { montant: r.atteint ? bareme(q).bonus : 0 });
  };

  V._jaugePaliers = function (pctActuel) {
    const b = bareme(trimestreCourant()).a1;
    const zones = [
      { label: `< ${b.p1}%`, color: 'var(--c-danger)' },
      { label: `${b.p1}-${b.p2 - 1}%`, color: 'var(--c-warning)' },
      { label: `${b.p2}-${b.p3 - 1}%`, color: '#3b82f6' },
      { label: `≥ ${b.p3}%`, color: 'var(--c-success)' },
    ];
    const idx = pctActuel >= b.p3 ? 3 : pctActuel >= b.p2 ? 2 : pctActuel >= b.p1 ? 1 : 0;
    return `
      <div class="prime-jauge">
        ${zones.map((z, i) => `
          <div class="prime-jauge-seg${i === idx ? ' actif' : ''}" style="background:${z.color}">
            <span class="prime-jauge-lbl">${z.label}</span>
          </div>`).join('')}
      </div>`;
  };

  V.simuler = function (valeur) {
    const zone = document.getElementById('simu-resultat');
    const jaugeZone = document.getElementById('simu-jauge');
    if (!zone) return;
    const pin = Session.estCDS() ? Session.pin : Number(document.getElementById('primes-cds-select')?.value || Session.pin);
    const o = this.state.objectifs.find(x => Number(x.PIN_CDS) === pin) || {};
    const q = this.state.quarter;
    const obj = parseCA(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`]) || 0;
    const ca = parseCA(valeur) || 0;
    const pct = obj > 0 ? ca / obj * 100 : 0;
    const a = bareme(q).a1;
    let prime = 0;
    if (pct >= a.p3) prime = a.m2 + a.mp3; else if (pct >= a.p2) prime = a.m2; else if (pct >= a.p1) prime = a.m1;
    zone.innerHTML = `→ ${Math.round(pct)}% de l'objectif (${fmtCA(obj)} €) = <strong style="color:var(--c-cta)">${prime} € de prime Axe 1</strong>${pct >= a.p3 ? ` (dont ${a.mp3} € P3 hors plafond)` : ''}`;
    if (jaugeZone) jaugeZone.innerHTML = this._jaugePaliers(pct);
  };

  Object.defineProperty(V, 'PLAFOND', { configurable: true, enumerable: true, get() { return bareme(trimestreCourant()).plafond; } });

  const rx = s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s'));
  function adapter(q) {
    const app = document.getElementById('app');
    if (!app || !document.createTreeWalker) return;
    const b = bareme(q), d = defaut();
    const a1 = JSON.stringify(b.a1) !== JSON.stringify(d.a1);
    const nsb = b.nsb.m1 !== d.nsb.m1 || b.nsb.m2 !== d.nsb.m2;
    const emp = JSON.stringify(b.emp) !== JSON.stringify(d.emp);
    const bonus = b.bonus !== d.bonus;
    if (!a1 && !nsb && !emp && !bonus) return;
    const w = document.createTreeWalker(app, 4);
    let n;
    while ((n = w.nextNode())) {
      const avant = n.nodeValue;
      let t = avant;
      if (a1) t = t.replace(rx('<80% : 0 € · 80-99% : 200 € · 100-119% : 400 € · ≥120% : 400 € + 100 € bonus P3'),
        `<${b.a1.p1}% : 0 € · ${b.a1.p1}-${b.a1.p2 - 1}% : ${b.a1.m1} € · ${b.a1.p2}-${b.a1.p3 - 1}% : ${b.a1.m2} € · ≥${b.a1.p3}% : ${b.a1.m2} € + ${b.a1.mp3} € bonus P3`);
      if (nsb) t = t.replace(/(≥\d+ cmd\/Q)\s:\s75\s€\s·\s(≥\d+ cmd\/Q)\s:\s150\s€/, (m, x, y) => `${x} : ${b.nsb.m1} € · ${y} : ${b.nsb.m2} €`);
      if (emp) t = t.replace(rx('≥3 comptes/Q : 50 € · ≥6 comptes/Q : 75 €'),
        `≥${b.emp.s1} comptes/Q : ${b.emp.m1} € · ≥${b.emp.s2} comptes/Q : ${b.emp.m2} €`);
      if (bonus) {
        t = t.replace(/\+300\s€\/Q si collectif atteint \(max 1\s200\s€\/an\)/, `+${b.bonus} €/Q si collectif atteint (max ${b.bonus * 4} €/an)`);
        if (t.trim() === '+300 €') t = `+${b.bonus} €`;
      }
      if (t !== avant) n.nodeValue = t;
    }
  }
  function statut(q) {
    const app = document.getElementById('app');
    if (!app) return;
    const ancien = document.getElementById('bareme-statut');
    if (ancien) ancien.remove();
    const chips = app.querySelector && app.querySelector('.q-chips');
    if (!chips) return;
    const e = etat[q] || { s: 'defaut' };
    const txt = e.s === 'serveur' ? `Barème ${EXERCICE} ${q} · révision ${store[q].revision} (serveur)`
      : e.s === 'erreur' ? `Barème par défaut : ${e.m}` : 'Barème par défaut (non synchronisé avec le serveur)';
    chips.insertAdjacentHTML('beforebegin', `<p id="bareme-statut" class="muted" style="font-size:11px;margin:0 0 6px">${esc(txt)}</p>`);
  }

  const renderOrigine = V.render;
  V.render = function () {
    const r = renderOrigine.apply(this, arguments);
    try { const q = trimestreCourant(); adapter(q); statut(q); } catch (e) { /* affichage secondaire : ne jamais bloquer la vue */ }
    return r;
  };

  const initOrigine = V.init;
  V.init = function () {
    const p = initOrigine.apply(this, arguments);
    chargerTous();
    return p;
  };
})();
