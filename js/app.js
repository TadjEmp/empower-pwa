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

  // 4. Enregistrer le Service Worker + auto-reload dès qu'une nouvelle version prend la main
  //    (le SW est network-first pour le shell — voir sw.js — donc un simple reload suffit
  //    désormais à récupérer le code à jour, plus besoin de vider le cache manuellement).
  if ('serviceWorker' in navigator) {
    let dejaRecharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (dejaRecharge) return;
      dejaRecharge = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        console.info('[SW] Enregistré');
        // Revérifie une nouvelle version à chaque retour sur l'onglet.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(e  => console.warn('[SW] Erreur :', e));
  }

  // 5. Si pas de session → aller login ; sinon démarrer le polling notifs
  // Init sidebar collapse state (avant toute navigation)
  if (window.SidebarToggle) SidebarToggle.init();

  if (!sessionOk) {
    Router.aller('#/login');
  } else {
    if (window.NotifCenter) NotifCenter._render();   // cloche visible dès le boot
    _initPollingNotifs();
    if (window.DrawerMenu) DrawerMenu.renderToRoot(); // drawer disponible dès le boot
    if (window.Topbar) Topbar.init();                 // topbar desktop dès le boot
  }
})();

// v5.0 N3 — Polling notifications 60 s (non bloquant)
// Déclaration de fonction (hoistée) → appelable depuis boot() ci-dessus.
// Ne démarre que pour une session authentifiée (appelée dans la branche else).
// Lit 🔔_NOTIFS sans cache, filtre par PIN, affiche un Toast sur chaque
// nouvelle notification non lue depuis le dernier poll.
function _initPollingNotifs() {
  if (_initPollingNotifs._demarre) return;   // garde anti double-démarrage
  _initPollingNotifs._demarre = true;
  const _vus = new Set();
  async function _poll() {
    if (!Session || !Session.pin) return;
    try {
      const rows = await SheetsAPI.lire('EMPOWER_MDB', '🔔_NOTIFS', { nocache: true });
      if (!Array.isArray(rows)) return;
      // N3-2/N3-3 — alimente le centre notifs (badge compteur + panneau)
      if (window.NotifCenter) NotifCenter.majDepuisRows(rows);
      const pin = Number(Session.pin);
      const nouvelles = rows.filter(function(n) {
        return Number(n.PIN_Destinataire) === pin
          && !n.Statut_Lu
          && !_vus.has(n.ID_Notif);
      });
      nouvelles.forEach(function(n) { _vus.add(n.ID_Notif); });
      if (nouvelles.length === 0) return;
      // Anti-flood : un seul toast résumé si plusieurs notifs d'un coup
      if (nouvelles.length > 3) {
        Toast.afficher('🔔 ' + nouvelles.length + ' nouvelles notifications', 'info', 5000);
      } else {
        nouvelles.forEach(function(n) {
          Toast.afficher('🔔 ' + (n.Message || 'Nouvelle notification'), 'info', 5000);
        });
      }
    } catch(e) {}
  }
  // Premier poll après 5 s (laisser le temps à la vue de s'afficher)
  setTimeout(_poll, 5000);
  setInterval(_poll, 60000);
}
