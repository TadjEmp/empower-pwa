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

  // 5. Si pas de session → aller login ; sinon démarrer le polling notifs
  if (!sessionOk) {
    Router.aller('#/login');
  } else {
    _initPollingNotifs();
  }
})();

// v5.0 N3 — Polling notifications 60 s (non bloquant)
// Lit 🔔_NOTIFS sans cache, filtre par PIN, affiche un Toast sur chaque
// nouvelle notification non lue depuis le dernier poll.
(function _initPollingNotifs() {
  const _vus = new Set();
  async function _poll() {
    if (!Session || !Session.pin) return;
    try {
      const rows = await SheetsAPI.lire('EMPOWER_MDB', '🔔_NOTIFS', { nocache: true });
      if (!Array.isArray(rows)) return;
      const pin = Number(Session.pin);
      rows.forEach(function(n) {
        if (Number(n.PIN_Destinataire) !== pin) return;
        if (String(n.Statut_Lu || '').toUpperCase() !== 'NON') return;
        if (_vus.has(n.ID_Notif)) return;
        _vus.add(n.ID_Notif);
        Toast.afficher('🔔 ' + (n.Message || 'Nouvelle notification'), 'info', 5000);
      });
    } catch(e) {}
  }
  // Premier poll après 5 s (laisser le temps à la vue de s'afficher)
  setTimeout(_poll, 5000);
  setInterval(_poll, 60000);
})();
