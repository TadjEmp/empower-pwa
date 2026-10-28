// ═══════════════════════════════════════
//  nav-web.js : ressenti de navigation web (phase A, sans changer le format des liens)
//  - indicateur de chargement fin en haut de page
//  - titre de l'onglet par page
//  - position de défilement restaurée au retour, remise à zéro en avant
//  - Cmd/Ctrl-clic et clic molette : ouverture dans un nouvel onglet
//  - préchargement des données de la page visée au survol (souris) ou à l'appui (tactile)
// ═══════════════════════════════════════
window.NavWeb = (function () {

  const TITRES = [
    [/^#\/dashboard/, 'Accueil'], [/^#\/manager/, 'Vue équipe'], [/^#\/reporting-cds/, 'Reporting'],
    [/^#\/empower-tracker/, 'Tracker'], [/^#\/comptes-historiques/, 'Historique CA'],
    [/^#\/comptes/, 'Comptes'], [/^#\/compte\//, 'Fiche compte'],
    [/^#\/phoning/, 'Phoning'], [/^#\/visites-fdv/, 'Visites FDV'], [/^#\/visites/, 'Visites'],
    [/^#\/objectifs/, 'Objectifs'], [/^#\/primes/, 'Primes'], [/^#\/photos/, 'Photos'],
    [/^#\/mailing/, 'Mailing'], [/^#\/a-contacter/, 'À contacter'],
    [/^#\/questionnaire/, 'Questionnaire'], [/^#\/admin/, 'Administration'], [/^#\/login/, 'Connexion'],
  ];

  // Tables lues par chaque page : réchauffées avant le clic pour que l'affichage soit immédiat.
  const DONNEES = [
    [/^#\/dashboard/,        ['COMPTES', 'VISITES', 'PHONING', 'LEADS', 'OBJECTIFS_PRIMES']],
    [/^#\/manager/,          ['COMPTES', 'VISITES', 'PHONING', 'LEADS', 'OBJECTIFS_PRIMES']],
    [/^#\/empower-tracker/,  ['LEADS', 'COMPTES']],
    [/^#\/comptes/,          ['COMPTES']],
    [/^#\/compte\//,         ['COMPTES', 'VISITES', 'PHONING', 'ACTIONS', 'SELLIN_SEMAINES']],
    [/^#\/visites/,          ['VISITES', 'COMPTES']],
    [/^#\/phoning/,          ['PHONING', 'COMPTES']],
    [/^#\/a-contacter/,      ['COMPTES']],
    [/^#\/objectifs/,        ['OBJECTIFS_PRIMES', 'VISITES', 'PHONING']],
    [/^#\/admin/,            ['PARAMS', 'OBJECTIFS_PRIMES']],
  ];

  const positions = {};          // hash -> scrollY
  let courant = null;             // hash affiché
  let viaAller = false;           // navigation déclenchée par un clic de l'app (pas retour/avant)
  let barre = null, minuteur = null, observeur = null, debutMs = 0;
  const prechauffe = new Map();   // table -> horodatage du dernier préchargement

  // ── Indicateur de chargement ──
  function creerBarre() {
    if (barre) return barre;
    barre = document.createElement('div');
    barre.id = 'nav-progress';
    barre.setAttribute('role', 'progressbar');
    barre.setAttribute('aria-hidden', 'true');
    document.body.appendChild(barre);
    return barre;
  }
  function afficherBarre() {
    const b = creerBarre();
    b.className = '';
    void b.offsetWidth;   // redémarre la transition depuis 0
    b.className = 'en-cours';
  }
  function masquerBarre() {
    if (!barre) return;
    barre.className = 'termine';
    setTimeout(() => { if (barre && barre.className === 'termine') barre.className = ''; }, 300);
  }

  // Fin de chargement : une mutation de #app suivie de 200 ms de calme, 10 s au plus.
  function surveillerFin(hash, avance) {
    if (observeur) observeur.disconnect();
    clearTimeout(minuteur);
    const app = document.getElementById('app');
    if (!app) { masquerBarre(); return; }
    let calme;
    const terminer = () => {
      if (observeur) observeur.disconnect();
      clearTimeout(minuteur); clearTimeout(calme);
      masquerBarre();
      if (!avance) restaurerPosition(hash);
    };
    observeur = new MutationObserver(() => { clearTimeout(calme); calme = setTimeout(terminer, 200); });
    observeur.observe(app, { childList: true, subtree: true });
    calme = setTimeout(terminer, 600);
    minuteur = setTimeout(terminer, 10000);
  }

  // Retour/avant : la page se remplit en plusieurs temps, on réessaie jusqu'à ce qu'elle soit
  // assez haute pour atteindre la position (3 s au plus) et on abandonne si l'utilisateur défile.
  function restaurerPosition(hash) {
    if (courant !== hash || positions[hash] == null) return;
    const cible = positions[hash];
    if (cible <= 0) return;
    let essais = 0, abandon = false;
    const stop = () => { abandon = true; };
    window.addEventListener('wheel', stop, { once: true, passive: true });
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    const tenter = () => {
      if (abandon || courant !== hash) return;
      window.scrollTo(0, cible);
      const atteint = Math.abs(window.scrollY - cible) < 4;
      if (!atteint && ++essais < 30) setTimeout(tenter, 100);
    };
    tenter();
  }

  function titre(hash) {
    const t = TITRES.find(([re]) => re.test(hash));
    document.title = t ? `${t[1]} · ESI` : 'ESI · Empower Sales Intelligence';
  }

  // ── Appelés par le routeur ──
  function avant(hash) {
    if (courant) positions[courant] = window.scrollY;
    courant = hash;
    afficherBarre();
    titre(hash);
  }
  function apres(hash) {
    const avance = viaAller;
    if (avance) window.scrollTo(0, 0);
    viaAller = false;
    surveillerFin(hash, avance);
  }
  function marquerAller() { viaAller = true; }

  // ── Préchargement ──
  function precharger(hash) {
    try {
      if (!hash || typeof SheetsAPI === 'undefined' || typeof Session === 'undefined' || !Session.estConnecte()) return;
      if (navigator.onLine === false || (navigator.connection && navigator.connection.saveData)) return;
      const cfg = DONNEES.find(([re]) => re.test(hash));
      if (!cfg) return;
      const now = Date.now();
      cfg[1].forEach(t => {
        if (now - (prechauffe.get(t) || 0) < 60000) return;
        prechauffe.set(t, now);
        SheetsAPI.lire('EMPOWER_MDB', t).catch(() => {});
      });
    } catch (e) { /* le préchargement ne doit jamais gêner la navigation */ }
  }

  // Route visée par un élément : lien #/..., onclick="Router.aller('#/...')" ou ouvrirFiche('ID').
  function routeDe(el) {
    if (!el) return null;
    const a = el.closest && el.closest('a[href^="#/"], a[href^="/"]');
    if (a) { const h = a.getAttribute('href'); return h.startsWith('#') ? h : '#' + h; }
    const c = el.closest && el.closest('[onclick]');
    if (!c) return null;
    const oc = c.getAttribute('onclick') || '';
    let m = oc.match(/Router\.aller\(\s*['"`](#\/[^'"`$]+)['"`]/);
    if (m) return m[1];
    m = oc.match(/ouvrirFiche\(\s*['"`]([^'"`$]+)['"`]/);
    if (m) return '#/compte/' + m[1];
    return null;
  }

  function init() {
    // Titre et retour/avant : le routeur appelle avant()/apres(); ici seulement les écouteurs globaux.
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking || !courant) return;
      ticking = true;
      requestAnimationFrame(() => { positions[courant] = window.scrollY; ticking = false; });
    }, { passive: true });

    // Un clic sur un lien de navigation est une navigation en avant (pas un retour)
    document.addEventListener('click', e => {
      if (!e.metaKey && !e.ctrlKey && e.button === 0 && e.target.closest && e.target.closest('a[href^="#/"], a[href^="/"]')) viaAller = true;
    }, true);

    // Cmd/Ctrl-clic et clic molette : nouvel onglet
    const nouvelOnglet = e => {
      const route = routeDe(e.target);
      if (!route) return;
      const ouvrir = e.type === 'auxclick' ? e.button === 1 : (e.metaKey || e.ctrlKey);
      if (!ouvrir) return;
      e.preventDefault(); e.stopImmediatePropagation();
      window.open(location.origin + route.replace(/^#/, ''), '_blank', 'noopener');
    };
    document.addEventListener('click', nouvelOnglet, true);
    document.addEventListener('auxclick', nouvelOnglet, true);

    // Préchargement : souris au survol, tactile à l'appui
    document.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') precharger(routeDe(e.target)); }, { passive: true });
    document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') precharger(routeDe(e.target)); }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { avant, apres, marquerAller, precharger };
})();
