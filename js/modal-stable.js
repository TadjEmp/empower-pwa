// ═══════════════════════════════════════
//  modal-stable.js : fenêtres de saisie qui ne bougent pas (mobile / PWA)
//  1. Verrouille le défilement de la page derrière une fenêtre, un tiroir ou le panneau de
//     notifications (sinon la page glisse sous les doigts).
//  2. Ajuste la hauteur des fenêtres à la zone visible (clavier ouvert) via --vvh / --vv-top.
//  3. Quand une vue se redessine pendant la saisie (render() complet), restitue la position de
//     défilement de la fenêtre et le champ actif avec son curseur, au lieu de revenir en haut.
// ═══════════════════════════════════════
window.ModalStable = (function () {
  const OVERLAYS = '.modal-overlay:not(.modal-docked), .drawer-overlay.ouvert, .nc-overlay';
  let verrou = false, yPage = 0, minuteur = null;
  let memo = null;            // { scrollTop, champ:{index, debut, fin}, ts }
  let dernierModal = null;
  let figeJusque = 0;          // pendant la restitution, on ne réécrit pas la mémoire avec une position transitoire

  // ── 1. Verrou de défilement ──
  function ouvertes() { return document.querySelectorAll(OVERLAYS).length > 0; }
  function verrouiller() {
    if (verrou) return;
    verrou = true; yPage = window.scrollY;
    const b = document.body;
    b.style.position = 'fixed'; b.style.top = (-yPage) + 'px'; b.style.left = '0'; b.style.right = '0'; b.style.width = '100%';
    document.documentElement.classList.add('scroll-lock');
    // Les événements de défilement ne partent qu'à l'image suivante du navigateur : un relevé régulier
    // garantit que la position est connue même si la vue se redessine juste après.
    clearInterval(minuteur); minuteur = setInterval(memoriser, 150);
  }
  function deverrouiller() {
    if (!verrou) return;
    verrou = false;
    const b = document.body;
    b.style.position = b.style.top = b.style.left = b.style.right = b.style.width = '';
    document.documentElement.classList.remove('scroll-lock');
    clearInterval(minuteur); minuteur = null; memo = null; dernierModal = null;
    window.scrollTo(0, yPage);
  }

  // ── 2. Zone visible (clavier) ──
  function majVisuel() {
    const vv = window.visualViewport;
    const r = document.documentElement.style;
    if (vv) { r.setProperty('--vvh', vv.height + 'px'); r.setProperty('--vv-top', vv.offsetTop + 'px'); }
  }

  // ── 3. Mémoire de la fenêtre active ──
  const champsDe = m => [...m.querySelectorAll('input:not([type=hidden]), select, textarea')];
  function memoriser() {
    if (Date.now() < figeJusque) return;
    const m = document.querySelector('.modal-overlay:not(.modal-docked) .modal');
    if (!m) return;
    dernierModal = m;
    const champs = champsDe(m), a = document.activeElement;
    const i = champs.indexOf(a);
    memo = {
      scrollTop: m.scrollTop,
      champ: i >= 0 ? { index: i, debut: a.selectionStart, fin: a.selectionEnd } : null,
      ts: Date.now(),
    };
  }
  function restituer() {
    const m = document.querySelector('.modal-overlay:not(.modal-docked) .modal');
    if (!m || !memo || m === dernierModal) return;
    if (Date.now() - memo.ts > 1500) { memo = null; return; }   // vraie réouverture, pas un redessin
    const cible = memo.scrollTop, champ = memo.champ;
    figeJusque = Date.now() + 500;
    // La mise en page de la fenêtre peut ne pas être terminée au premier passage : on réapplique brièvement.
    const appliquer = () => {
      if (!m.isConnected) return;
      m.scrollTop = cible;
      if (champ) {
        const c = champsDe(m)[champ.index];
        if (c && document.activeElement !== c) {
          try { c.focus({ preventScroll: true }); if (champ.debut != null && c.setSelectionRange) c.setSelectionRange(champ.debut, champ.fin); } catch (e) { /* champ non textuel */ }
        }
      }
    };
    appliquer();
    [0, 60, 200].forEach(d => setTimeout(appliquer, d));
    dernierModal = m;
  }

  function init() {
    majVisuel();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', majVisuel);
      window.visualViewport.addEventListener('scroll', majVisuel);
    }
    document.addEventListener('scroll', e => { if (e.target && e.target.classList && e.target.classList.contains('modal')) memoriser(); }, true);
    document.addEventListener('focusin', memoriser, true);
    document.addEventListener('input', memoriser, true);
    document.addEventListener('selectionchange', () => { if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.modal')) memoriser(); });
    // Verrou : surveille l'apparition/disparition des couches
    const obs = new MutationObserver(() => {
      if (ouvertes()) { verrouiller(); restituer(); } else { deverrouiller(); }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { verrouiller, deverrouiller, _etat: () => ({ memo, estLe: dernierModal === document.querySelector('.modal-overlay:not(.modal-docked) .modal') }) };
})();
