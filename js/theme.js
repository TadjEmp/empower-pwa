// ═══════════════════════════════════════
//  theme.js : thème Auto / Clair / Sombre
//  Le choix est mémorisé (localStorage 'esi_theme') ; Auto suit prefers-color-scheme.
//  <html data-theme="light|dark"> est posé AVANT le premier affichage par le script en ligne
//  d'index.html (pas de flash) ; ce module ajoute le commutateur et suit le système.
// ═══════════════════════════════════════
window.Theme = (function () {
  const CLE = 'esi_theme';
  const ORDRE = ['auto', 'light', 'dark'];
  const LIBELLES = { auto: 'Automatique', light: 'Clair', dark: 'Sombre' };
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function lire() {
    try { const v = localStorage.getItem(CLE); return ORDRE.includes(v) ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  function resoudre(pref) {
    return pref === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : pref;
  }
  function appliquer(pref) {
    const th = resoudre(pref || lire());
    document.documentElement.setAttribute('data-theme', th);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', th === 'dark' ? '#0A0F15' : '#242E39');
    document.querySelectorAll('[data-theme-libelle]').forEach(e => { e.textContent = LIBELLES[lire()]; });
  }
  function definir(pref) {
    try { localStorage.setItem(CLE, pref); } catch (e) { /* stockage indisponible : le choix vaut pour la session */ }
    appliquer(pref);
  }
  function suivant() {
    const i = ORDRE.indexOf(lire());
    definir(ORDRE[(i + 1) % ORDRE.length]);
    if (typeof Toast !== 'undefined') Toast.afficher('Apparence : ' + LIBELLES[lire()], 'info', 1800);
  }
  // Suit le système tant que le choix est Auto
  if (mq) {
    const surChangement = () => { if (lire() === 'auto') appliquer('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', surChangement); else if (mq.addListener) mq.addListener(surChangement);
  }
  appliquer();
  return { lire, definir, suivant, appliquer, LIBELLES };
})();
