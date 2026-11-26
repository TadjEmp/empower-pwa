// ═══════════════════════════════════════════════════════════════════════
//  atterrissage.js — Atterrissage prévisionnel du trimestre, en fonction des semaines (source unique pour toutes les vues)
//  Principe : on projette le CA réalisé jusqu'à la dernière semaine DISPONIBLE dans le Sell-In (pas la semaine du calendrier :
//  le Sell-In arrive avec du retard) sur les 13 semaines du trimestre fiscal.
//    · Projection linéaire    : CA / semaine × 13.
//    · Projection saisonnière : CA / part cumulée habituelle à cette semaine, lue dans les trimestres FY27 complets de
//      SELLIN_SEMAINES (le CA arrive plutôt en fin de trimestre). Sans trimestre de référence, on retombe sur le linéaire.
//  Atterrissage = moyenne des deux ; la fourchette va de la plus basse à la plus haute. Aucun chiffre n'est inventé : tout vient du Sell-In.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  const NB = 13;
  const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
  const eur = v => Math.round(v).toLocaleString('fr-FR') + ' €';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let etat = { charge: false, enCours: null, semaineDonnee: {}, cum: null, quartierRef: [] };

  // Construit, à partir des lignes SELLIN_SEMAINES, la dernière semaine avec données par trimestre et le profil cumulé de référence.
  function construire(rows) {
    const parQ = {};
    (rows || []).forEach(r => {
      const q = String(r.Quarter || r.quarter || '').toUpperCase(), s = parseInt(r.Semaine || r.semaine, 10), ca = num(r.CA_EUR != null ? r.CA_EUR : r.ca_eur);
      if (!q || !(s >= 1 && s <= NB)) return;
      (parQ[q] = parQ[q] || {})[s] = ((parQ[q] || {})[s] || 0) + ca;
    });
    const semaineDonnee = {}, profils = [];
    Object.keys(parQ).forEach(q => {
      const sem = parQ[q], semaines = Object.keys(sem).map(Number).filter(s => sem[s] > 0);
      const court = q.slice(0, 2);                       // « Q3FY27 » → « Q3 »
      semaineDonnee[court] = semaines.length ? Math.max(...semaines) : 0;
      const total = Object.values(sem).reduce((a, b) => a + b, 0);
      // Trimestre de référence : quasi complet (≥ 11 semaines renseignées) et significatif.
      if (semaines.length >= 11 && total >= 3000) {
        let cumul = 0; const cum = [];
        for (let w = 1; w <= NB; w++) { cumul += sem[w] || 0; cum.push(cumul / total); }
        profils.push({ q, cum });
      }
    });
    let cum = null;
    if (profils.length) cum = Array.from({ length: NB }, (_, i) => profils.reduce((s, p) => s + p.cum[i], 0) / profils.length);
    return { semaineDonnee, cum, quartierRef: profils.map(p => p.q) };
  }

  function charger(force) {
    if (etat.enCours && !force) return etat.enCours;
    if (!window.SheetsAPI) return Promise.resolve(etat);
    etat.enCours = Promise.resolve(window.SheetsAPI.lire('EMPOWER_MDB', 'SELLIN_SEMAINES'))
      .then(rows => { Object.assign(etat, construire(Array.isArray(rows) ? rows : []), { charge: true }); })
      .catch(() => { etat.charge = true; })
      .then(() => { rafraichir(); return etat; });
    return etat.enCours;
  }

  // Semaine de référence d'un trimestre : dernière semaine avec du Sell-In ; à défaut, semaine du calendrier fiscal.
  function semaine(q) {
    const court = String(q || '').slice(0, 2).toUpperCase();
    const d = etat.semaineDonnee[court];
    if (d) return { w: d, source: 'Sell-In' };
    const fw = window.FiscalWeeks && FiscalWeeks.semaineDe && FiscalWeeks.semaineDe();
    if (fw && fw.quarter === court) return { w: Math.max(1, fw.semaine - 1), source: 'calendrier' };
    if (fw && court > fw.quarter) return { w: 0, source: 'trimestre à venir' };   // Q4 avant son démarrage : pas de prévision
    return { w: NB, source: 'trimestre clos' };
  }

  // prevoir(réalisé, objectif, trimestre) → { w, source, lineaire, saisonnier, prevu, bas, haut, pct, ecart, parSemaine, statut }
  function prevoir(ca, obj, q) {
    ca = num(ca); obj = num(obj);
    if (!etat.enCours) charger();   // chargement paresseux des semaines Sell-In
    const { w, source } = semaine(q);
    if (w < 1) return { w: 0, source, lineaire: 0, saisonnier: 0, prevu: 0, bas: 0, haut: 0, pct: null, ecart: null, parSemaine: 0, statut: 'a_venir', clos: false, avenir: true };
    if (w >= NB) return { w: NB, source, lineaire: ca, saisonnier: ca, prevu: ca, bas: ca, haut: ca, pct: obj > 0 ? Math.round(ca / obj * 100) : null, ecart: obj > 0 ? ca - obj : null, parSemaine: 0, statut: obj > 0 ? (ca >= obj ? 'atteint' : 'manque') : 'sans_objectif', clos: true };
    const lineaire = ca / w * NB;
    const part = etat.cum ? etat.cum[w - 1] : null;
    const saisonnier = part && part >= 0.08 ? ca / part : lineaire;
    const prevu = (lineaire + saisonnier) / 2, bas = Math.min(lineaire, saisonnier), haut = Math.max(lineaire, saisonnier);
    const pct = obj > 0 ? Math.round(prevu / obj * 100) : null;
    const parSemaine = obj > ca ? (obj - ca) / (NB - w) : 0;
    const statut = obj <= 0 ? 'sans_objectif' : pct >= 100 ? 'atteint' : pct >= 85 ? 'proche' : 'risque';
    return { w, source, lineaire, saisonnier, prevu, bas, haut, pct, ecart: obj > 0 ? prevu - obj : null, parSemaine, statut, clos: false };
  }

  const LIB = { atteint: 'objectif en vue', proche: 'proche de l\'objectif', risque: 'objectif hors de portée au rythme actuel', manque: 'objectif non atteint', sans_objectif: 'sans objectif' };

  // Texte court (cartes, KPI) : « atterrissage ≈ 12 400 € (84 %) · S4/13 ».
  function texte(ca, obj, q) {
    const p = prevoir(ca, obj, q);
    if (p.avenir) return 'trimestre à venir';
    return `atterrissage ≈ ${eur(p.prevu)}${p.pct != null ? ` (${p.pct} %)` : ''} · S${p.w}/${NB}`;
  }

  // Bloc détaillé : les cinq chiffres utiles. Se rafraîchit seul quand les semaines sont chargées (data-atterr).
  function html(ca, obj, q, opts) {
    const p = prevoir(ca, obj, q), o = opts || {};
    if (p.avenir) return `<div class="atterrissage" data-atterr="${esc(JSON.stringify([num(ca), num(obj), q, o.compact ? 1 : 0]))}" style="margin-top:8px;font-size:12px;color:var(--c-text-2,#5b6670)">Trimestre à venir : atterrissage calculé dès la première semaine de Sell-In.</div>`;
    const bar = p.pct != null ? `<div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(p.pct, 100)}" aria-label="Atterrissage prévu : ${p.pct} % de l'objectif" style="height:6px;border-radius:3px;background:var(--c-border,#d8dce0);overflow:hidden;margin-top:5px"><div style="height:100%;width:${Math.min(p.pct, 100)}%;background:#343F48"></div></div>` : '';
    const lignes = p.clos ? `Trimestre clos : ${eur(p.prevu)}${p.pct != null ? ` (${p.pct} % de l'objectif)` : ''}`
      : `<strong>Atterrissage ≈ ${eur(p.prevu)}</strong>${p.pct != null ? ` · ${p.pct} % de l'objectif` : ''}<br>
         <span style="color:var(--c-text-2,#5b6670)">Fourchette ${eur(p.bas)} à ${eur(p.haut)} · semaine ${p.w}/${NB} (${esc(p.source)})${p.parSemaine > 0 ? ` · il faut ${eur(p.parSemaine)} par semaine pour atteindre l'objectif` : ''}</span>`;
    return `<div class="atterrissage" data-atterr="${esc(JSON.stringify([num(ca), num(obj), q, o.compact ? 1 : 0]))}" style="margin-top:8px;font-size:${o.compact ? 11 : 12}px;line-height:1.45" title="${esc(LIB[p.statut] || '')}">${lignes}${o.compact ? '' : bar}</div>`;
  }

  // Une fois les semaines chargées, les blocs déjà affichés (rendus avec le repli calendrier) se recalculent.
  function rafraichir() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-atterr]').forEach(el => {
      try { const [ca, obj, q, compact] = JSON.parse(el.getAttribute('data-atterr')); const t = document.createElement('div'); t.innerHTML = html(ca, obj, q, { compact: !!compact }); if (t.firstChild) el.replaceWith(t.firstChild); } catch (e) { /* bloc ignoré */ }
    });
  }

  window.Atterrissage = { charger, prevoir, texte, html, semaine, construire, _etat: () => etat, NB };
  // Chargement discret dès que la session est ouverte (les vues s'en servent sans l'attendre).
  if (typeof document !== 'undefined') setTimeout(() => { try { if (window.Session && Session.estConnecte && Session.estConnecte()) charger(); } catch (e) { /* hors ligne */ } }, 1500);
})();
