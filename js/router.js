// ═══════════════════════════════════════
//  router.js — Routeur SPA v3 (History API, URLs propres /comptes)
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
//  Représentation interne : les routes restent écrites '#/comptes' (Permissions, appels
//  Router.aller) ; l'URL réelle est '/comptes'. Les anciens liens '#/comptes' (notifications
//  push déjà envoyées, favoris) sont convertis au chargement.
//  Rétro-compat (redirects silencieux) :
//    #/pipeline  → #/empower-tracker
//    #/reactiver → #/comptes-historiques
// ═══════════════════════════════════════

const Router = {

  routes: [
    // ── Auth ──
    { pattern: /^#\/login$/,                        vue: 'VueLogin',              auth: false },

    // ── Navigation V2.1 ──
    { pattern: /^#\/pilotage$/,                    vue: 'VuePilotage',           auth: true  },
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
    { pattern: /^#\/analyse$/,                       vue: 'VueAnalyse',            auth: true  },
    { pattern: /^#\/parametres-primes$/,             vue: 'VueParametresPrimes',   auth: true  },
    { pattern: /^#\/aide$/,                         vue: 'VueAide',              auth: true  },
    { pattern: /^#\/territoires$/,                  vue: 'VueTerritoires',        auth: true  },
    { pattern: /^#\/coach$/,                        vue: 'VueCoach',              auth: true  },
    { pattern: /^#\/kit$/,                          vue: 'VueKit',                auth: true  },
    { pattern: /^#\/mailing$/,                      vue: 'VueMailing',            auth: true  },
    { pattern: /^#\/campagne$/,                     vue: 'VueCampagne',           auth: true  },
    { pattern: /^#\/a-contacter$/,                  vue: 'VueAContacter',         auth: true  },
    { pattern: /^#\/comptes$/,                      vue: 'VueComptes',            auth: true  },
    { pattern: /^#\/compte\/([^/]+)$/,             vue: 'VueFicheCompte',        auth: true, param: 1 },
    { pattern: /^#\/questionnaire$/,                vue: 'VueQuestionnaire',      auth: true  },
    { pattern: /^#\/questionnaire\/([^/]+)$/,      vue: 'VueQuestionnaire',      auth: true, param: 1 },
    { pattern: /^#\/manager$/,                      vue: 'VueDashboardManager',   auth: true  },
    { pattern: /^#\/admin$/,                        vue: 'VueAdmin',              auth: true  },
    { pattern: /^#\/export$/,                       vue: 'VueExportBase',         auth: true  },

    // ── Rétro-compat (redirects silencieux) ──
    { pattern: /^#\/pipeline$/,  redirect: '#/empower-tracker' },
    { pattern: /^#\/reactiver$/, redirect: '#/comptes-historiques' },
  ],

  // Entrées de navigation principale (barre basse, tiroir, « Plus ») : passer d'un onglet à l'autre REMPLACE l'entrée d'historique
  // au lieu de l'empiler (sinon « retour » rejoue tous les onglets visités). Les liens dans les pages, eux, empilent.
  NAV_SEL: '.nav-principale a, .drawer-item, #plus-feuille a',
  // Pile des « couches » (panneau, fenêtre, sous-écran) : chacune a son entrée d'historique, le retour du téléphone la ferme sans quitter la page.
  _couches: new Map(), _ignorer: 0,
  OVERLAYS: '.modal-overlay:not(.modal-docked), #drawer-overlay.ouvert, .nc-overlay, #creer-feuille, #plus-feuille, #feuille-filtre, .kit-modale, #visionneuse, #studio, #coach-chat.cc-couche',

  init() {
    window.addEventListener('popstate', () => {
      if (this._ignorer > 0) { this._ignorer--; return; }
      // Retour système : on ferme d'abord la couche la plus récente (fenêtre, panneau, sous-écran), la page ne bouge pas.
      if (this._couches.size) { const cle = [...this._couches.keys()].pop(), f = this._couches.get(cle); this._couches.delete(cle); try { f && f(); } catch (e) { /* fermeture best effort */ } return; }
      // Entrée de couche devenue orpheline (la page a changé entre-temps) : on l'enjambe.
      const st = window.history.state;
      if (st && st.couche) { this._ignorer++; window.history.back(); return; }
      this._dir = 'retour';
      this._resoudre();
    });
    this._surveillerCouches();
    // Les liens <a href="/comptes"> naviguent sans recharger la page (Cmd/Ctrl-clic et clic droit
    // gardent leur comportement natif : nouvel onglet).
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      const h = /^#\//.test(href) ? href : (/^\/(?!\/)/.test(href) ? '#' + href : null);
      if (!h) return;
      e.preventDefault();
      this.aller(h, { remplacer: !!a.closest(this.NAV_SEL) });
    });
    this._resoudre();
  },

  // Route courante au format interne ('#/comptes?x=1'), '' à la racine.
  // Un ancien lien '#/…' est lu tel quel (il sera converti par _resoudre).
  hashCourant() {
    const { hash, pathname, search } = window.location;
    if (hash && hash.startsWith('#/')) return hash;
    const chemin = pathname.replace(/\/+$/, '').replace(/^\/index\.html$/, '');
    return chemin ? '#' + chemin + search : '';
  },

  aller(hash, opts) {
    if (window.NavWeb) NavWeb.marquerAller();
    const url = String(hash).replace(/^#/, '');
    if (url === window.location.pathname + window.location.search && !window.location.hash) return;
    // Profondeur de navigation interne mémorisée dans l'état d'historique : sert à savoir si « retour » reste dans l'app.
    // `de` = écran d'où l'on vient (absent quand on arrive par la barre de navigation : « retour » mène alors à l'accueil).
    const st = window.history.state || {}, de = this.hashCourant();
    // Navigation lancée depuis un panneau (tiroir, « Plus ») : on referme d'abord son entrée d'historique, puis on remplace l'écran.
    if (opts && opts.remplacer && st.couche) {
      this._couches.clear(); this._ignorer++;
      window.addEventListener('popstate', () => this.aller(hash, opts), { once: true });
      window.history.back(); return;
    }
    this._dir = opts && opts.remplacer ? 'onglet' : 'avant';
    if (opts && opts.remplacer) window.history.replaceState({ esi: st.esi || 0 }, '', url);
    else window.history.pushState({ esi: (st.esi || 0) + 1, de }, '', url);
    this._resoudre();
  },

  // Écran parent d'une sous-page (null = écran principal d'un onglet). Sert au repli quand on arrive par lien direct ou notification.
  PARENTS: [
    [/^#\/compte\/[^/]+$/, '#/comptes'], [/^#\/visites\/(planning|cr\/[^/]+)$/, '#/visites'],
    [/^#\/phoning\/[^/]+$/, '#/phoning'], [/^#\/questionnaire(\/[^/]+)?$/, '#/comptes'], [/^#\/parametres-primes$/, '#/admin'],
  ],
  parent(hash) { const p = this.PARENTS.find(([re]) => re.test(hash)); return p ? p[1] : null; },
  // Accueil du profil : l'onglet « Pilotage » de la barre basse s'il est autorisé, sinon la route par défaut du rôle.
  accueil() {
    const P = window.Permissions; if (!P || typeof Session === 'undefined') return '#/pilotage';
    return P.routeAutorisee(Session.role, '#/pilotage') ? '#/pilotage' : (P.routeParDefaut(Session.role) || '#/pilotage');
  },

  // Remplace l'écran courant sans laisser de trace d'historique (repli du bouton ←).
  _remplacer(hash) {
    const st = window.history.state || {};
    window.history.replaceState({ esi: st.esi || 0 }, '', String(hash).replace(/^#/, ''));
    this._resoudre();
  },

  // Redirection interne (garde d'accès, ancienne route) : remplace l'entrée d'historique
  // au lieu d'en ajouter une, pour que le bouton retour ne piège pas l'utilisateur.
  _rediriger(hash) {
    window.history.replaceState(window.history.state, '', String(hash).replace(/^#/, ''));
    this._resoudre();
  },

  // « ← » : une couche ouverte (fenêtre, sous-écran) se ferme d'abord ; sinon retour à l'écran d'où l'on vient ;
  // sinon (lien direct, notification, onglet principal) repli sur l'écran parent, puis sur l'accueil du profil.
  retour() {
    if (this._couches.size) { window.history.back(); return; }
    const h = this.hashCourant(), st = window.history.state, parent = this.parent(h), accueil = this.accueil();
    if (st && st.esi > 0 && st.de) { window.history.back(); return; }
    if (parent) { this._remplacer(parent); return; }
    if (h !== accueil && h !== '#/pilotage' && h !== '#/dashboard') this._remplacer(accueil);
  },

  // ── Couches : tout ce qui se superpose à la page doit se fermer avec le retour du téléphone ──
  // sync(cle, actif, fermer) : à appeler à chaque rendu d'un sous-écran. `fermer` est appelée par le retour système.
  couche: {
    sync(cle, actif, fermer, vue) {
      const R = Router;
      if (actif && vue && document.body.dataset.vue !== vue) return;   // rendu tardif d'une page déjà quittée : aucune couche
      if (actif && !R._couches.has(cle)) {
        R._couches.set(cle, fermer);
        const st = window.history.state || {};
        window.history.pushState({ esi: st.esi || 0, de: st.de, couche: cle }, '', window.location.pathname + window.location.search);
      } else if (actif) { R._couches.set(cle, fermer); }
      else if (!actif && R._couches.has(cle)) {
        R._couches.delete(cle);
        const st = window.history.state;
        if (st && st.couche === cle) { R._ignorer++; window.history.back(); }   // fermé par l'écran lui-même : on retire l'entrée d'historique
      }
    },
  },

  // Fenêtres et panneaux : détection centralisée (aucune des ~30 implémentations n'a à être modifiée).
  _fermerOverlay() {
    const els = [...document.querySelectorAll(this.OVERLAYS)], el = els[els.length - 1]; if (!el) return;
    const id = el.id, w = window;
    if (id === 'creer-feuille' && w.CreerMenu) return w.CreerMenu.fermer();
    if (id === 'plus-feuille' && w.CreerMenu) return w.CreerMenu.fermerPlus();
    if (id === 'visionneuse' && w.Visionneuse) return w.Visionneuse.fermer();
    if (id === 'studio' && w.Studio) return w.Studio.fermer();
    if (id === 'coach-chat' && w.CoachChat) return w.CoachChat.fermer();
    if (id === 'feuille-filtre' && w.VueComptes) return w.VueComptes.fermerFeuilleFiltre();
    if (el.classList.contains('kit-modale') && w.VueKit) return w.VueKit.annulerEnvoi();
    if (id === 'drawer-overlay' && w.DrawerMenu) return w.DrawerMenu.fermer();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));   // convention de l'app : clic sur le fond = fermer
  },
  _surveillerCouches() {
    let t = null;
    const verif = () => this.couche.sync('overlay', !!document.querySelector(this.OVERLAYS), () => this._fermerOverlay());
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(verif, 30); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  },

  // Résout quand #app n'affiche plus de squelette de chargement (ou après `ms`).
  _contenuPret(ms) {
    return new Promise(res => {
      const app = document.getElementById('app');
      if (!app || !app.querySelector('.skeleton-box')) { res(); return; }
      const mo = new MutationObserver(() => { if (!app.querySelector('.skeleton-box')) { mo.disconnect(); res(); } });
      mo.observe(app, { childList: true, subtree: true });
      setTimeout(() => { mo.disconnect(); res(); }, ms);
    });
  },

  _resoudre() {
    this._couches.clear();
    // Ancien format '#/comptes' (push déjà envoyées, favoris) : converti en '/comptes' sans recharger.
    if (window.location.hash && window.location.hash.startsWith('#/')) {
      window.history.replaceState(window.history.state, '', window.location.hash.slice(1));
    }
    const hash = this.hashCourant() || '#/login';

    const route = this.routes.find(r => r.pattern.test(hash));
    if (!route) { this._rediriger('#/login'); return; }

    // Redirect silencieux (rétro-compat)
    if (route.redirect) { this._rediriger(route.redirect); return; }

    if (route.auth && !Session.estConnecte()) {
      this._rediriger('#/login');
      return;
    }

    // ── Garde RBAC (matrice Permissions) ──
    if (route.auth && typeof window.Permissions !== 'undefined') {
      if (!window.Permissions.routeAutorisee(Session.role, hash)) {
        const cible = window.Permissions.routeParDefaut(Session.role) || '#/login';
        if (cible !== hash) { this._rediriger(cible); return; }
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

    document.body.dataset.vue = vueNom;
    // Sens de la navigation : sert aux transitions façon iOS (entrée par la droite, retour vers la droite, onglet en fondu).
    const dir = this._dir || 'onglet'; this._dir = null;
    document.documentElement.dataset.nav = dir;
    if (window.NavWeb) NavWeb.avant(hash);

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
      // Filet de sécurité : la transition attend une image du navigateur pour exécuter le rendu
      // (onglet en arrière-plan, volet masqué). Au-delà de 400 ms on rend directement, une seule fois.
      // Le rendu attend (160 ms au plus) que la page ait son contenu : l'instantané d'arrivée montre l'écran rempli,
      // pas un squelette qui se remplit après coup (effet « page qui se ferme »). Au retour, la position de défilement est reprise avant l'image finale.
      let rendu = false;
      const unSeulRendu = () => {
        if (rendu) return; rendu = true; afficherVue();
        return this._contenuPret(160).then(() => { if (dir === 'retour' && window.NavWeb && NavWeb.restaurerTot) NavWeb.restaurerTot(hash); });
      };
      const t = document.startViewTransition(unSeulRendu);
      setTimeout(unSeulRendu, 400);
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
    if (window.NavWeb) NavWeb.apres(hash);
  },
};

window.Router = Router;   // la constante n est pas une propriété de window : plusieurs modules testent window.Router
