// ═══════════════════════════════════════
//  sw.js — Service Worker EMPOWER v5.0
//  Network-first pour le shell (HTML/JS/CSS) : chaque reload en ligne
//  récupère le code à jour sans jamais avoir besoin de vider le cache.
//  Cache-first uniquement pour les assets immuables (images/icônes).
//  Le cache ne sert plus que de secours hors-ligne.
// ═══════════════════════════════════════

const CACHE_NAME  = 'esi-v5-129';
// Assets immuables (jamais modifiés après publication) → cache-first.
const STATIC_RE = /\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf)$/i;
// Chemins relatifs : fonctionne à la racine d'un domaine comme en sous-dossier GitHub Pages
const ASSETS_CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/base.css',
  './css/components.css',
  './css/comptes.css',
  './css/questionnaire.css',
  './css/dashboard.css',
  './css/pipeline.css',
  './js/utils.js',
  './js/helpers.js',
  './js/session.js',
  './js/api.js',
  './js/fiches-froides.js',
  './js/sellin-flag.js',
  './js/non-suivis.js',
  './js/vue-a-contacter.js',
  './js/push.js',
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
  './js/vue-phoning.js',
  './js/vue-pipeline.js',
  './js/vue-dashboard-manager.js',
  './js/vue-admin.js',
  './js/vue-primes.js',
  './js/vue-mailing.js',
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

async function metEnCache(request, resp) {
  if (resp && resp.status === 200 && resp.type === 'basic') {
    const c = await caches.open(CACHE_NAME);
    c.put(request, resp.clone());
  }
  return resp;
}

// Shell (HTML/JS/CSS) : réseau d'abord — repli sur le cache seulement hors-ligne.
// BLOC — retour utilisateur : un push + déploiement confirmés ne suffisaient
// pas, le comportement resté ancien après reload. Cause : fetch(request) sans
// directive de cache reste soumis au cache HTTP disque du navigateur (le
// serveur peut répondre "pas modifié"/servir une réponse mise en cache) même
// en stratégie "network-first" — le Service Worker croit interroger le
// réseau, mais reçoit une réponse potentiellement périmée. cache:'no-store'
// force un aller-retour réseau réel à chaque requête du shell.
async function networkFirst(request) {
  try {
    return await metEnCache(request, await fetch(request, { cache: 'no-store' }));
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw e;
  }
}

// Assets immuables : cache d'abord, réseau seulement si absent du cache.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return metEnCache(request, await fetch(request));
}

// ── Lot 6 : notifications push (envoyées par la fonction send-push via le service de push du navigateur) ──
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'EMPOWER', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || 'empower',          // une même famille de notifications se remplace au lieu de s'empiler
    renotify: true,
    data: { url: d.url || '#/dashboard' },
  }));
});

// Clic : ouvre (ou réutilise) l'app sur la route associée (#/a-contacter, #/compte/…, #/empower-tracker…).
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || '#/dashboard';
  const cible = new URL('./' + hash, self.registration.scope).href;
  e.waitUntil((async () => {
    const fenetres = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of fenetres) {
      if (w.url.startsWith(self.registration.scope)) {
        try { await w.navigate(cible); } catch (err) { /* navigation refusée : on se contente de focus */ }
        return w.focus();
      }
    }
    return clients.openWindow(cible);
  })());
});

self.addEventListener('fetch', e => {
  // Passer les requêtes vers les API externes (Google, Supabase) sans intercepter
  if (e.request.url.includes('script.google.com')) return;
  if (e.request.method !== 'GET') return; // ne jamais intercepter les écritures (POST/PATCH Supabase)

  e.respondWith(STATIC_RE.test(e.request.url) ? cacheFirst(e.request) : networkFirst(e.request));
});
