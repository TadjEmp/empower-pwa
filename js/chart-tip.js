// ═══════════════════════════════════════
//  chart-tip.js — Refresh ESI : bulle de survol commune à tous les graphiques
//  Tout élément portant data-tip (segment de donut, barre, point de courbe) affiche une bulle au survol,
//  au focus clavier et au toucher ; les segments frères s'estompent (classe .tip-dim sur le conteneur).
// ═══════════════════════════════════════
window.ChartTip = (function () {
  let el = null, courant = null;
  function bulle() {
    if (!el) { el = document.createElement('div'); el.id = 'chart-tip'; el.setAttribute('role', 'tooltip'); document.body.appendChild(el); }
    return el;
  }
  function placer(x, y) {
    const b = bulle(), r = b.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    b.style.left = Math.max(8, left) + 'px'; b.style.top = Math.max(8, top) + 'px';
  }
  function montrer(t, x, y) {
    const b = bulle(); b.innerHTML = t.getAttribute('data-tip').replace(/\n/g, '<br>'); b.classList.add('on');
    if (courant !== t) { if (courant) courant.classList.remove('tip-hl'); courant = t; t.classList.add('tip-hl'); }
    const conteneur = t.closest('[data-tipzone]'); if (conteneur) conteneur.classList.add('tip-dim');
    placer(x, y);
  }
  function cacher() {
    if (el) el.classList.remove('on');
    if (courant) { const z = courant.closest('[data-tipzone]'); if (z) z.classList.remove('tip-dim'); courant.classList.remove('tip-hl'); courant = null; }
  }
  function init() {
    document.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) montrer(t, e.clientX, e.clientY); else if (courant) cacher(); });
    document.addEventListener('mousemove', e => { if (courant) placer(e.clientX, e.clientY); });
    document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) { const r = t.getBoundingClientRect(); montrer(t, r.left + r.width / 2, r.top + r.height / 2); } });
    document.addEventListener('focusout', cacher);
    document.addEventListener('touchstart', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) { const p = e.touches[0]; montrer(t, p.clientX, p.clientY); } else cacher(); }, { passive: true });
    document.addEventListener('scroll', cacher, true);
  }
  init();
  return { montrer, cacher };
})();
