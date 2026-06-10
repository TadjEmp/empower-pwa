// ═══════════════════════════════════════
//  router.js — Routeur hash-based SPA
//  Routes :
//    #/login
//    #/dashboard-cds
//    #/comptes
//    #/compte/:id
//    #/questionnaire
//    #/questionnaire/:id   (depuis fiche compte)
//    #/reactiver
// ═══════════════════════════════════════

const Router = {

  routes: [
    { pattern: /^#\/login$/,                    vue: 'VueLogin',          auth: false },
    { pattern: /^#\/dashboard$/,                vue: 'VueDashboardCDS',   auth: true  },
    { pattern: /^#\/comptes$/,                  vue: 'VueComptes',        auth: true  },
    { pattern: /^#\/compte\/([^/]+)$/,         vue: 'VueFicheCompte',    auth: true, param: 1 },
    { pattern: /^#\/questionnaire$/,            vue: 'VueQuestionnaire',  auth: true  },
    { pattern: /^#\/questionnaire\/([^/]+)$/,  vue: 'VueQuestionnaire',  auth: true, param: 1 },
    { pattern: /^#\/reactiver$/,                vue: 'VueReactiver',      auth: true  },
    { pattern: /^#\/phoning$/,                  vue: 'VuePhoning',        auth: true  },
    { pattern: /^#\/phoning\/([^/]+)$/,        vue: 'VuePhoning',        auth: true, param: 1 },
    { pattern: /^#\/pipeline$/,                 vue: 'VuePipeline',       auth: true  },
    { pattern: /^#\/manager$/,                  vue: 'VueDashboardManager', auth: true },
    { pattern: /^#\/admin$/,                    vue: 'VueAdmin',          auth: true  },
    { pattern: /^#\/primes$/,                   vue: 'VuePrimes',         auth: true  },
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

    // Vérif auth
    const route = this.routes.find(r => r.pattern.test(hash));
    if (!route) { this.aller('#/login'); return; }

    if (route.auth && !Session.estConnecte()) {
      this.aller('#/login');
      return;
    }

    const match = hash.match(route.pattern);
    const param  = route.param ? match[route.param] : null;

    // Appel de la vue
    const vue = window[route.vue];
    if (!vue) { console.error('[Router] Vue introuvable :', route.vue); return; }

    if (typeof vue.init === 'function') {
      if (param) vue.init(param);
      else       vue.init(Session.pin);
    } else if (typeof vue.render === 'function') {
      vue.render();
    }
  },
};
