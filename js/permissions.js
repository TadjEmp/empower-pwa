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
      'questionnaire', 'reporting', 'photos', 'mailing', 'a_contacter', 'territoires', 'coach', 'kit', 'campagne',
      // Lot 4 — sous-sections d'Administration (droits distincts)
      'admin_primes', 'admin_baremes', 'admin_reporting', 'export',
    ],
    // Bloc 2 §1 — 'reporting_cds' : espace d'analyse personnel distinct de
    // l'Accueil (#/dashboard), cf. VueDashboardCDS._contexteReporting().
    CDS: [
      'home', 'tracker', 'historiques', 'phoning', 'visites',
      'objectifs', 'primes', 'questionnaire', 'comptes', 'photos', 'reporting_cds', 'mailing', 'a_contacter', 'territoires', 'coach', 'kit', 'campagne',
    ],
    // V5 BUG5 — Alexandra : conserve OBJECTIFS ; jamais Primes (raw CDS).
    // 'reporting' réactivé : #/manager affiche désormais pour elle la Vue équipe
    // COPIL complète (identique à ADMIN, CA/objectifs équipe inclus — niveau
    // quasi-admin explicitement demandé), distincte de sa home Onboarding sur
    // #/dashboard (cf. VueDashboardManager.init()). Ce n'est plus un doublon.
    // Bloc 3 §4 — 'phoning' remplace 'phoning_fdv' (onglet séparé supprimé, son
    // contenu vit maintenant dans l'onglet Journal de vue-phoning.js), niveau
    // quasi-admin sur le Tracker également (cf. vue-pipeline.js _peutAssigner).
    CHANNEL_MANAGER: [
      'home', 'tracker', 'comptes', 'objectifs', 'photos', 'admin',
      'visites_fdv', 'phoning', 'reporting', 'mailing', 'a_contacter', 'territoires', 'coach', 'kit', 'campagne',
      'admin_reporting', 'export',   // Reporting seul : jamais Primes ni Barèmes (voir INTERDITS)
    ],
    // Fournisseur de leads (ex-« Invité » : Flavie…) : alimente le Tracker et consulte les comptes (lecture seule).
    EXTERNE: [
      'tracker', 'comptes', 'territoires', 'kit', 'campagne', 'export',
    ],
  };

  // Lot 4 — Règle absolue : un CHANNEL_MANAGER ne voit jamais les primes, quels que soient
  // ses droits personnalisés (colonne utilisateurs.droits) ou la matrice.
  const INTERDITS = { CHANNEL_MANAGER: ['primes', 'admin_primes', 'admin_baremes'] };

  // ── Mapping hash de route (cf js/router.js) → tabId ──
  // Chaque hash réel doit résoudre vers un tabId de la matrice.
  function hashVersTab(hash) {
    const h = (hash || '').split('?')[0];

    if (/^#\/login$/.test(h))                  return null; // public
    if (/^#\/(dashboard|pilotage)$/.test(h))  return 'home';
    // #/manager sert de vue "reporting" pour CHANNEL_MANAGER et de dashboard
    // manager pour ADMIN — autorisé si l'un OU l'autre tab est accordé.
    if (/^#\/manager$/.test(h))                return ['manager', 'reporting'];
    if (/^#\/reporting-cds$/.test(h))          return 'reporting_cds';
    if (/^#\/empower-tracker$/.test(h) ||
        /^#\/pipeline$/.test(h))               return 'tracker';
    if (/^#\/comptes-historiques$/.test(h) ||
        /^#\/reactiver$/.test(h))              return 'historiques';
    if (/^#\/phoning(\/.*)?$/.test(h))         return 'phoning';
    if (/^#\/visites(\/.*)?$/.test(h))         return 'visites';
    if (/^#\/visites-fdv$/.test(h))            return 'visites_fdv';
    if (/^#\/objectifs$/.test(h))              return 'objectifs';
    if (/^#\/primes$/.test(h))                 return ['primes', 'admin_primes'];
    if (/^#\/comptes$/.test(h) ||
        /^#\/compte\/[^/]+$/.test(h))          return 'comptes';
    if (/^#\/questionnaire(\/[^/]+)?$/.test(h))return 'questionnaire';
    if (/^#\/admin$/.test(h))                  return 'admin';
    if (/^#\/export$/.test(h))                 return 'export';
    if (/^#\/photos$/.test(h))                 return 'photos';
    if (/^#\/mailing$/.test(h))                return 'mailing';
    if (/^#\/a-contacter$/.test(h))            return 'a_contacter';
    if (/^#\/territoires$/.test(h))            return 'territoires';
    if (/^#\/coach$/.test(h))                  return 'coach';
    if (/^#\/kit$/.test(h))                    return 'kit';
    if (/^#\/campagne$/.test(h))               return 'campagne';
    if (/^#\/analyse$/.test(h))                return ['reporting', 'reporting_cds', 'admin_reporting'];
    if (/^#\/parametres-primes$/.test(h))      return 'admin_baremes';

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
    reporting_cds: '#/reporting-cds',
    questionnaire: '#/questionnaire',
    admin:         '#/admin',
    photos:        '#/photos',
    visites_fdv:   '#/visites-fdv',
    mailing:       '#/mailing',
    a_contacter:   '#/a-contacter',
    territoires:   '#/territoires',
    coach:         '#/coach',
    kit:           '#/kit',
    campagne:      '#/campagne',
  };

  // Libellés des sections cochables à la création d'un accès (vue-admin.js).
  const LIBELLES = {
    home: 'Accueil', tracker: 'Tracker', historiques: 'Comptes historiques',
    phoning: 'Phoning', visites: 'Visites', visites_fdv: 'Visites FDV',
    objectifs: 'Objectifs', primes: 'Primes', comptes: 'Comptes',
    manager: 'Vue manager', reporting: 'Reporting équipe',
    reporting_cds: 'Reporting personnel', admin: 'Administration',
    questionnaire: 'Questionnaire', photos: 'Photos', mailing: 'Mailing',
    a_contacter: 'À contacter', territoires: 'Territoires (carte)', coach: 'Coach commercial', kit: 'Kit commercial', campagne: 'Campagne',
    admin_primes: 'Administration › Primes', admin_baremes: 'Administration › Barèmes',
    admin_reporting: 'Administration › Reporting',
  };

  // Droits propres à l'utilisateur connecté (colonne utilisateurs.droits).
  // Ils remplacent la matrice du rôle, sauf pour ADMIN (jamais verrouillé hors de l'app).
  function accordesPour(role) {
    const s = (typeof Session !== 'undefined') ? Session : null;
    if (s && s.role === role && role !== 'ADMIN' && Array.isArray(s.droits)) {
      // 'export' (Administration > Export) est un droit de rôle : jamais retiré par des droits personnalisés plus anciens.
      let d = s.droits;
      // 'campagne' (onglet Campagne, lot 9) : droit de rôle, jamais retiré par des droits personnalisés plus anciens.
      if (d.indexOf('campagne') === -1 && (MATRICE[role] || []).indexOf('campagne') !== -1) d = d.concat('campagne');
      return d.indexOf('export') === -1 && (MATRICE[role] || []).indexOf('export') !== -1 ? d.concat('export') : d;
    }
    return MATRICE[role] || [];
  }

  function onglets(role) {
    const interdits = INTERDITS[role] || [];
    return accordesPour(role).filter(t => interdits.indexOf(t) === -1);
  }

  function peut(role, tabId) {
    if (!tabId) return true; // routes publiques (login) — pas de restriction de tab
    const interdits = INTERDITS[role] || [];
    const accordes = accordesPour(role).filter(t => interdits.indexOf(t) === -1);
    // tabId peut être un tableau (OR sémantique : un seul suffit).
    if (Array.isArray(tabId)) {
      return tabId.some(t => accordes.indexOf(t) !== -1);
    }
    return accordes.indexOf(tabId) !== -1;
  }

  function routeAutorisee(role, hash) {
    const h = (hash || '').split('?')[0];
    if (/^#\/login$/.test(h)) return true; // login toujours accessible
    if (/^#\/aide$/.test(h)) return true;  // Aide & Suggestions : ouvert à tous les rôles connectés
    const tab = hashVersTab(h);
    if (tab === null) return false;        // route inconnue → refus
    return peut(role, tab);
  }

  // Première route autorisée pour un rôle (cible de redirection).
  // EXTERNE (Flavie) → #/empower-tracker (pas #/dashboard).
  function routeParDefaut(role) {
    const tabs = accordesPour(role);
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
    LIBELLES,
  };

})();
