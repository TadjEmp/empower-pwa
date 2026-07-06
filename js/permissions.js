// ═══════════════════════════════════════
//  permissions.js — Matrice d'accès RBAC (Blocs 1-5)
//  EMPOWER v2.1 — Marvesting FY27
//  Rôles : ADMIN | CDS | CHANNEL_MANAGER | EXTERNE
//
//  tabId logiques (ids d'onglets / sections fonctionnelles) :
//    home, tracker, historiques, phoning, visites, objectifs,
//    primes, comptes, manager, admin, questionnaire, reporting
// ═══════════════════════════════════════

(function () {

  // ── Matrice rôle → tabIds autorisés ──
  const MATRICE = {
    ADMIN: [
      'home', 'tracker', 'historiques', 'phoning', 'visites',
      'objectifs', 'primes', 'comptes', 'manager', 'admin',
      'questionnaire', 'reporting', 'photos', 'phoning_fdv',
    ],
    CDS: [
      'home', 'tracker', 'historiques', 'phoning', 'visites',
      'objectifs', 'primes', 'questionnaire', 'comptes', 'photos',
    ],
    // V5 BUG5 — Alexandra : conserve OBJECTIFS ; jamais Visites/Phoning/Primes (raw CDS).
    // Section 9 cahier des charges — vues consolidées lecture seule dédiées.
    CHANNEL_MANAGER: [
      'home', 'tracker', 'comptes', 'objectifs', 'reporting', 'photos', 'admin',
      'visites_fdv', 'phoning_fdv',
    ],
    EXTERNE: [
      'tracker',
    ],
  };

  // ── Mapping hash de route (cf js/router.js) → tabId ──
  // Chaque hash réel doit résoudre vers un tabId de la matrice.
  function hashVersTab(hash) {
    const h = (hash || '').split('?')[0];

    if (/^#\/login$/.test(h))                  return null; // public
    if (/^#\/dashboard$/.test(h))              return 'home';
    // #/manager sert de vue "reporting" pour CHANNEL_MANAGER et de dashboard
    // manager pour ADMIN — autorisé si l'un OU l'autre tab est accordé.
    if (/^#\/manager$/.test(h))                return ['manager', 'reporting'];
    if (/^#\/empower-tracker$/.test(h) ||
        /^#\/pipeline$/.test(h))               return 'tracker';
    if (/^#\/comptes-historiques$/.test(h) ||
        /^#\/reactiver$/.test(h))              return 'historiques';
    if (/^#\/phoning(\/.*)?$/.test(h))         return 'phoning';
    if (/^#\/visites(\/.*)?$/.test(h))         return 'visites';
    if (/^#\/visites-fdv$/.test(h))            return 'visites_fdv';
    if (/^#\/phoning-fdv$/.test(h))            return 'phoning_fdv';
    if (/^#\/objectifs$/.test(h))              return 'objectifs';
    if (/^#\/primes$/.test(h))                 return 'primes';
    if (/^#\/comptes$/.test(h) ||
        /^#\/compte\/[^/]+$/.test(h))          return 'comptes';
    if (/^#\/questionnaire(\/[^/]+)?$/.test(h))return 'questionnaire';
    if (/^#\/admin$/.test(h))                  return 'admin';
    if (/^#\/photos$/.test(h))                 return 'photos';

    return null;
  }

  // ── tabId → hash de route par défaut (pour redirection) ──
  const TAB_VERS_HASH = {
    home:          '#/dashboard',
    tracker:       '#/empower-tracker',
    historiques:   '#/comptes-historiques',
    phoning:       '#/phoning',
    visites:       '#/visites',
    objectifs:     '#/objectifs',
    primes:        '#/primes',
    comptes:       '#/comptes',
    manager:       '#/manager',
    reporting:     '#/manager',
    questionnaire: '#/questionnaire',
    admin:         '#/admin',
    photos:        '#/photos',
    visites_fdv:   '#/visites-fdv',
    phoning_fdv:   '#/phoning-fdv',
  };

  function onglets(role) {
    return (MATRICE[role] || []).slice();
  }

  function peut(role, tabId) {
    if (!tabId) return true; // routes publiques (login) — pas de restriction de tab
    const accordes = MATRICE[role] || [];
    // tabId peut être un tableau (OR sémantique : un seul suffit).
    if (Array.isArray(tabId)) {
      return tabId.some(t => accordes.indexOf(t) !== -1);
    }
    return accordes.indexOf(tabId) !== -1;
  }

  function routeAutorisee(role, hash) {
    const h = (hash || '').split('?')[0];
    if (/^#\/login$/.test(h)) return true; // login toujours accessible
    const tab = hashVersTab(h);
    if (tab === null) return false;        // route inconnue → refus
    return peut(role, tab);
  }

  // Première route autorisée pour un rôle (cible de redirection).
  // EXTERNE (Flavie) → #/empower-tracker (pas #/dashboard).
  function routeParDefaut(role) {
    const tabs = MATRICE[role] || [];
    for (let i = 0; i < tabs.length; i++) {
      const hash = TAB_VERS_HASH[tabs[i]];
      if (hash) return hash;
    }
    return '#/login';
  }

  window.Permissions = {
    onglets,
    peut,
    routeAutorisee,
    routeParDefaut,
    hashVersTab,
    MATRICE,
  };

})();
