// ═══════════════════════════════════════
//  push.js — Lot 6 (10/2026) : notifications push (Web Push / VAPID).
//  Chaîne : INSERT dans notifs → déclencheur SQL notify_push() → edge function send-push → service de push
//  du navigateur → service worker (sw.js, évènement « push ») → notification système → clic = route de l'app.
//  Abonnement par APPAREIL, rattaché à l'utilisateur CÔTÉ SERVEUR via le jeton de session (non falsifiable).
//  iPhone/iPad : le push ne fonctionne que si l'app est INSTALLÉE sur l'écran d'accueil (iOS ≥ 16.4).
// ═══════════════════════════════════════
window.PushNotifs = {
  VAPID_PUBLIC: 'BKGkS31YD9toH2ODYvl1M3dmLX70eBwV2agrWfxg2zckz3BOriWrjtB0YIVCRidOw9jZDzNH3yS2ZMDxRk5_xEY',
  _abonne: false,
  _enCours: false,

  supporte() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },
  estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  estInstallee() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; },
  permission() { return this.supporte() ? Notification.permission : 'unsupported'; },

  _cle(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  },
  _token() { return (typeof Session !== 'undefined' && Session.token) || (window.SheetsAPI && SheetsAPI.TOKEN) || null; },

  async _abonnement() {
    if (!this.supporte()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  },

  async _enregistrer(sub) {
    const j = sub.toJSON();
    const { data, error } = await SheetsAPI._sb.rpc('enregistrer_push', {
      p_token: this._token(), p_endpoint: j.endpoint, p_p256dh: j.keys && j.keys.p256dh, p_auth: j.keys && j.keys.auth, p_ua: navigator.userAgent,
    });
    if (error || !data || !data.ok) throw new Error((data && data.erreur) || (error && error.message) || 'Enregistrement impossible');
  },

  async rafraichir() { try { this._abonne = !!(await this._abonnement()); } catch { this._abonne = false; } },

  // À chaque démarrage de session : si cet appareil est déjà abonné, on ré-enregistre (rattache au bon utilisateur, réactive).
  async synchroniser() {
    try {
      if (!this.supporte() || Notification.permission !== 'granted' || !this._token()) return;
      const sub = await this._abonnement();
      this._abonne = !!sub;
      if (sub) await this._enregistrer(sub);
    } catch (e) { console.warn('Push : synchronisation impossible', e); }
  },

  async activer() {
    if (this._enCours) return;
    if (!this.supporte()) { Toast.afficher('Notifications push non disponibles sur ce navigateur', 'warning'); return; }
    if (this.estIOS() && !this.estInstallee()) {
      Toast.afficher('Sur iPhone/iPad : ajoutez d\'abord l\'app à l\'écran d\'accueil (Partager → Sur l\'écran d\'accueil), puis ouvrez-la depuis l\'icône.', 'warning', 9000); return;
    }
    this._enCours = true; this._rendre();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { Toast.afficher('Notifications refusées — autorisez-les dans les réglages du navigateur', 'warning', 6000); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this._cle(this.VAPID_PUBLIC) });
      await this._enregistrer(sub);
      this._abonne = true;
      Toast.afficher('🔔 Notifications push activées sur cet appareil', 'succes');
    } catch (e) {
      Toast.afficher('❌ Activation impossible : ' + (e.message || e), 'erreur', 6000);
    } finally { this._enCours = false; this._rendre(); }
  },

  async desactiver() {
    if (this._enCours) return;
    this._enCours = true; this._rendre();
    try {
      const sub = await this._abonnement();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await SheetsAPI._sb.rpc('supprimer_push', { p_token: this._token(), p_endpoint: endpoint });
      }
      this._abonne = false;
      Toast.afficher('Notifications push désactivées sur cet appareil', 'info');
    } catch (e) { Toast.afficher('❌ ' + (e.message || e), 'erreur'); }
    finally { this._enCours = false; this._rendre(); }
  },

  _rendre() { if (window.NotifCenter) NotifCenter._render(); },

  // Bloc affiché dans le panneau de notifications.
  html() {
    if (!this.supporte()) return `<div class="nc-push nc-push-info">Notifications push non disponibles sur ce navigateur.</div>`;
    if (this.estIOS() && !this.estInstallee()) return `<div class="nc-push nc-push-info">📱 Pour recevoir les push sur iPhone/iPad : ajoutez l'app à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvrez-la depuis l'icône.</div>`;
    if (Notification.permission === 'denied') return `<div class="nc-push nc-push-info">🔕 Notifications bloquées dans les réglages du navigateur pour ce site.</div>`;
    if (this._enCours) return `<div class="nc-push nc-push-info">⏳ …</div>`;
    return this._abonne
      ? `<div class="nc-push"><span>🔔 Push activé sur cet appareil</span><button class="nc-tout" onclick="PushNotifs.desactiver()">Désactiver</button></div>`
      : `<div class="nc-push"><span>Recevez vos rappels même app fermée</span><button class="nc-tout" onclick="PushNotifs.activer()">🔔 Activer</button></div>`;
  },
};
