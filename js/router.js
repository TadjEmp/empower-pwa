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
    // Bloc 2 §1 — Reporting personnel CDS : même vue que #/dashboard, mode
    // "analyse" activé en interne via _contexteReporting() (cf. VueDashboardCDS).
    { pattern: /^#\/reporting-cds$/,                vue: 'VueDashboardCDS',       auth: true  },
    { pattern: /^#\/empower-tracker$/,              vue: 'VuePipeline',           auth: true  },
    { pattern: /^#\/comptes-historiques$/,          vue: 'VueComptesHistoriques', auth: true  },
    { pattern: /^#\/phoning$/,                      vue: 'VuePhoning',            auth: true  },
    { pattern: /^#\/phoning\/([^/]+)$/,            vue: 'VuePhoning',            auth: true, param: 1 },
    { pattern: /^#\/visites$/,                      vue: 'VueVisites',            auth: true  },
    { pattern: /^#\/visites\/planning$/,            vue: 'VueVisites',            auth: true  },
    { pattern: /^#\/visites\/cr\/([^/]+)$/,        vue: 'VueVisites',            auth: true, param: 1 },
    { pattern: /^#\/objectifs$/,                    vue: 'VueObjectifs',          auth: true  },
    { pattern: /^#\/primes$/,                       vue: 'VuePrimes',             auth: true  },
    { pattern: /^#\/visites-fdv$/,                  vue: 'VueVisitesFDV',         auth: true  },
    // #/phoning-fdv retiré (Bloc 3 §4) — intégré dans l'onglet Journal de #/phoning.

    // ── Routes auxiliaires ──
    { pattern: /^#\/photos$/,                       vue: 'VuePhotos',             auth: true  },
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

  // Bloc 3 §2 — retour à l'écran précédent (historique navigateur) ; repli
  // vers l'accueil quand la vue est le point d'entrée (lien direct, rechargement).
  retour() {
    if (window.history.length > 1) window.history.back();
    else this.aller('#/dashboard');
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

    const afficherVue = () => {
      if (typeof vue.init === 'function') {
        if (sousVue === 'planning') vue.init('planning');
        else if (sousVue === 'cr')  vue.init('cr', param);
        else if (param)             vue.init(param);
        // Bug audit (visite à froid planifiée) — VueQuestionnaire.init(idCible)
        // est la SEULE vue dont l'argument par défaut ci-dessous est réellement
        // utilisé (toutes les autres vues sans paramètre — dashboard, comptes,
        // manager, admin… — ignorent l'argument passé). Pour #/questionnaire
        // (sans ID, route empruntée par VueVisites#ouvrirCR pour une visite à
        // froid via _visitePlanifiee), lui passer Session.pin comme s'il
        // s'agissait d'un idCible faisait échouer la comparaison avec
        // 'HORS_BASE' dans VueQuestionnaire.init() : _visitePlanifiee était
        // aussitôt effacé, perdant la fiche contact déjà saisie à la
        // planification ET forçant la création d'une visite en double au lieu
        // de mettre à jour celle planifiée.
        else if (vueNom === 'VueQuestionnaire') vue.init(null);
        else                        vue.init(Session.pin);
      } else if (typeof vue.render === 'function') {
        vue.render();
      }
    };

    // BLOC 09 — transition douce entre écrans (audit "pas de fluidité au
    // clic/retour" : chaque navigation remplaçait #app.innerHTML sans la
    // moindre animation). View Transitions API : dégrade proprement sur les
    // navigateurs qui ne la supportent pas (appel direct, comportement
    // inchangé) et respecte prefers-reduced-motion.
    const reduitMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof document.startViewTransition === 'function' && !reduitMotion) {
      // Une navigation très rapprochée (redirect en cascade, double clic) peut
      // démarrer une transition alors que la précédente est encore active —
      // le navigateur lève alors InvalidStateError sur la nouvelle. On
      // interrompt proprement l'ancienne (skipTransition) avant d'enchaîner,
      // au lieu de laisser filer une exception non gérée.
      if (this._transitionEnCours) {
        try { this._transitionEnCours.skipTransition(); } catch {}
      }
      const t = document.startViewTransition(afficherVue);
      this._transitionEnCours = t;
      // Une transition sautée (skipTransition, ou une nouvelle qui la
      // remplace) rejette updateCallbackDone/ready/finished — les 3 doivent
      // être interceptées, sinon Chrome logue "Uncaught (in promise)" pour
      // chacune indépendamment.
      [t.updateCallbackDone, t.ready, t.finished].forEach(p => p && p.catch(() => {}));
      t.finished.catch(() => {}).finally(() => {
        if (this._transitionEnCours === t) this._transitionEnCours = null;
      });
    } else {
      afficherVue();
    }
  },
};
