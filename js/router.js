// ═══════════════════════════════════════
//  router.js — Routeur hash-based SPA v2.1
//  Navigation V2.1 (7 modules métier) :
//    #/dashboard              → HOME
//    #/empower-tracker        → EMPOWER TRACKER
//    #/comptes-historiques    → COMPTES HISTORIQUES
//    #/phoning[/:id]          → PHONING
//    #/visites[/planning|/cr/:id] → VISITES
//    #/objectifs              → SUIVI DES OBJECTIFS
//    #/primes                 → SUIVI DES PRIMES
//  Routes auxiliaires :
//    #/compte/:id / #/comptes / #/questionnaire[/:id] / #/manager / #/admin
//  Rétro-compat (redirects silencieux) :
//    #/pipeline  → #/empower-tracker
//    #/reactiver → #/comptes-historiques
// ═══════════════════════════════════════

const Router = {

  routes: [
    // ── Auth ──
    { pattern: /^#\/login$/,                        vue: 'VueLogin',              auth: false },

    // ── Navigation V2.1 ──
    { pattern: /^#\/dashboard$/,                    vue: 'VueDashboardCDS',       auth: true  },
    { pattern: /^#\/empower-tracker$/,              vue: 'VuePipeline',           auth: true  },
    { pattern: /^#\/comptes-historiques$/,          vue: 'VueComptesHistoriques', auth: true  },
    { pattern: /^#\/phoning$/,                      vue: 'VuePhoning',            auth: true  },
    { pattern: /^#\/phoning\/([^/]+)$/,            vue: 'VuePhoning',            auth: true, param: 1 },
    { pattern: /^#\/visites$/,                      vue: 'VueVisites',            auth: true  },
    { pattern: /^#\/visites\/planning$/,            vue: 'VueVisites',            auth: true  },
    { pattern: /^#\/visites\/cr\/([^/]+)$/,        vue: 'VueVisites',            auth: true, param: 1 },
    { pattern: /^#\/objectifs$/,                    vue: 'VueObjectifs',          auth: true  },
    { pattern: /^#\/primes$/,                       vue: 'VuePrimes',             auth: true  },

    // ── Routes auxiliaires ──
    { pattern: /^#\/comptes$/,                      vue: 'VueComptes',            auth: true  },
    { pattern: /^#\/compte\/([^/]+)$/,             vue: 'VueFicheCompte',        auth: true, param: 1 },
    { pattern: /^#\/questionnaire$/,                vue: 'VueQuestionnaire',      auth: true  },
    { pattern: /^#\/questionnaire\/([^/]+)$/,      vue: 'VueQuestionnaire',      auth: true, param: 1 },
    { pattern: /^#\/manager$/,                      vue: 'VueDashboardManager',   auth: true  },
    { pattern: /^#\/admin$/,                        vue: 'VueAdmin',              auth: true  },

    // ── Rétro-compat (redirects silencieux) ──
    { pattern: /^#\/pipeline$/,  redirect: '#/empower-tracker' },
    { pattern: /^#\/reactiver$/, redirect: '#/comptes-historiques' },
  ],

  init() {
    window.addEventListener('hashchange', () => this._resoudre());
    this._resoudre();
  },

  aller(hash) {
    window.location.hash = hash;
  },

  _resoudre() {
    const hash = window.location.hash || '#/login';

    const route = this.routes.find(r => r.pattern.test(hash));
    if (!route) { this.aller('#/login'); return; }

    // Redirect silencieux (rétro-compat)
    if (route.redirect) { this.aller(route.redirect); return; }

    if (route.auth && !Session.estConnecte()) {
      this.aller('#/login');
      return;
    }

    // ── Garde RBAC (matrice Permissions) ──
    if (route.auth && typeof window.Permissions !== 'undefined') {
      if (!window.Permissions.routeAutorisee(Session.role, hash)) {
        const cible = window.Permissions.routeParDefaut(Session.role) || '#/login';
        if (cible !== hash) { this.aller(cible); return; }
      }
    }

    const match = hash.match(route.pattern);
    const param  = route.param ? match[route.param] : null;

    // ── #/dashboard : aiguillage par rôle ──
    // CHANNEL_MANAGER → VueDashboardManager ; sinon VueDashboardCDS.
    let vueNom = route.vue;
    if (/^#\/dashboard$/.test(hash) && Session.role === 'CHANNEL_MANAGER') {
      vueNom = 'VueDashboardManager';
    }

    // Détection sous-vue VISITES via hash
    const sousVue = hash.includes('/visites/planning') ? 'planning'
                  : hash.includes('/visites/cr/')      ? 'cr'
                  : null;

    const vue = window[vueNom];
    if (!vue) { console.error('[Router] Vue introuvable :', vueNom); return; }

    if (typeof vue.init === 'function') {
      if (sousVue === 'planning') vue.init('planning');
      else if (sousVue === 'cr')  vue.init('cr', param);
      else if (param)             vue.init(param);
      else                        vue.init(Session.pin);
    } else if (typeof vue.render === 'function') {
      vue.render();
    }
  },
};
