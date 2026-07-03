// ═══════════════════════════════════════
//  sw.js — Service Worker EMPOWER v4.1
//  Cache-first pour assets statiques
// ═══════════════════════════════════════

const CACHE_NAME  = 'esi-v5-47';
// Chemins relatifs : fonctionne à la racine d'un domaine comme en sous-dossier GitHub Pages
const ASSETS_CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './css/comptes.css',
  './css/questionnaire.css',
  './css/reactiver.css',
  './css/dashboard.css',
  './css/pipeline.css',
  './js/utils.js',
  './js/helpers.js',
  './js/session.js',
  './js/api.js',
  './js/groq.js',
  './js/toast.js',
  './js/router.js',
  './js/app.js',
  './js/notif-center.js',
  './js/vue-login.js',
  './js/vue-dashboard-cds.js',
  './js/vue-comptes.js',
  './js/vue-fiche-compte.js',
  './js/vue-questionnaire.js',
  './js/vue-reactiver.js',
  './js/vue-phoning.js',
  './js/vue-pipeline.js',
  './js/vue-dashboard-manager.js',
  './js/vue-admin.js',
  './js/vue-primes.js',
  './img/logo-marvesting-sm.png',
  './icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS_CORE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Passer les requêtes vers l'API Google sans cache
  if (e.request.url.includes('script.google.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return resp;
      });
    })
  );
});
