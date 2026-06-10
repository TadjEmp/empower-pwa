// ═══════════════════════════════════════
//  app.js — Point d'entrée & boot
//  EMPOWER v4.1 FY27
// ═══════════════════════════════════════

(async function boot() {
  // 1. Init API (IndexedDB + listeners réseau)
  await SheetsAPI.init();

  // 2. Vérifier session existante (token restauré dans Session.init)
  const sessionOk = Session.init();

  // 3. Init routeur (déclenchera la bonne vue)
  Router.init();

  // 4. Enregistrer le Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.info('[SW] Enregistré'))
      .catch(e  => console.warn('[SW] Erreur :', e));
  }

  // 5. Si pas de session → aller login
  if (!sessionOk) {
    Router.aller('#/login');
  }
})();
