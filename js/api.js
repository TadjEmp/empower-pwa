// ═══════════════════════════════════════
//  api.js — EMPOWER MDB API Layer v5.0
//  Cache IndexedDB · Retry ×3 · Offline queue · Dedup
//  !! Remplacer BASE_URL par l'URL de ton Apps Script !!
// ═══════════════════════════════════════

const SheetsAPI = {
  BASE_URL: 'https://script.google.com/macros/s/AKfycbwvGslTLfmtif_CgD0CbgZp064MVLsplmB4qRadq3OV2C7doXN4RE0lmGsOtgTsRV3AEw/exec',
  TOKEN:     null,
  TTL:       1800,
  MAX_RETRY: 3,
  RETRY_BASE_MS: 800,
  _inflight: new Map(),
  _db:       null,
  _online:   true,

  async init() {
    this._db    = await this._ouvrirIDB();
    this._online = navigator.onLine;
    window.addEventListener('online',  () => { this._online = true;  this._syncQueue(); });
    window.addEventListener('offline', () => { this._online = false; });
    console.info('[API] v5.0 prêt · online=' + this._online);
  },

  // ── LOGIN ────────────────────────────────────────────
  async login(email, motdepasse) {
    try {
      return await this._fetchRetry(this.BASE_URL, 'POST', 2, { action: 'login', email, motdepasse });
    } catch(e) {
      return { ok: false, erreur: this._online ? e.message : 'Connexion impossible hors-ligne' };
    }
  },

  // Session expirée côté serveur → retour login
  _gererAuthExpiree(data) {
    if (data?.erreur === 'AUTH') {
      Session.deconnecter();
      Toast.afficher('🔒 Session expirée — reconnectez-vous', 'warning', 4000);
      Router.aller('#/login');
      throw new Error('Session expirée');
    }
  },

  // ── LECTURE ──────────────────────────────────────────
  async lire(fichier, onglet) {
    const k = `${fichier}::${onglet}`;
    if (this._inflight.has(k)) return this._inflight.get(k);
    const p = this._lireAvecFallback(fichier, onglet, k);
    this._inflight.set(k, p);
    p.finally(() => this._inflight.delete(k));
    return p;
  },

  async _lireAvecFallback(fichier, onglet, k) {
    const cached = await this._getCached(k);
    if (!this._online) {
      if (cached) return cached;
      throw new Error(`Offline — aucun cache pour ${onglet}`);
    }
    const frais = cached && !(await this._estExpire(k));
    if (frais) return cached;
    try {
      const url  = `${this.BASE_URL}?action=lire&fichier=${encodeURIComponent(fichier)}&onglet=${encodeURIComponent(onglet)}&token=${encodeURIComponent(this.TOKEN || '')}`;
      const data = await this._fetchRetry(url, 'GET');
      this._gererAuthExpiree(data);
      if (!data.ok) throw new Error(data.erreur || 'API error');
      await this._setCached(k, data.data);
      return data.data;
    } catch(e) {
      if (cached) { Toast.afficher('📶 Mode hors-ligne — données en cache', 'warning', 4000); return cached; }
      throw e;
    }
  },

  // ── ÉCRITURE ─────────────────────────────────────────
  async ecrire(fichier, onglet, donnee) {
    const payload = { action: 'ecrire', fichier, onglet, donnee, token: this.TOKEN };
    if (!this._online) {
      await this._queueAdd(payload);
      await this._invalidate(`${fichier}::${onglet}`);
      Toast.afficher('📥 Sauvegardé hors-ligne', 'info');
      return { ok: true, offline: true };
    }
    const r = await this._fetchRetry(this.BASE_URL, 'POST', this.MAX_RETRY, payload);
    this._gererAuthExpiree(r);
    if (!r.ok) throw new Error(r.erreur || 'Erreur POST');
    await this._invalidate(`${fichier}::${onglet}`);
    return r;
  },

  // ── MISE À JOUR ──────────────────────────────────────
  async mettreAJour(fichier, onglet, id, champs) {
    const payload = { action: 'mettreAJour', fichier, onglet, id, champs, token: this.TOKEN };
    if (!this._online) {
      await this._queueAdd(payload);
      Toast.afficher('📥 Modification en attente', 'info');
      return { ok: true, offline: true };
    }
    const r = await this._fetchRetry(this.BASE_URL, 'POST', this.MAX_RETRY, payload);
    this._gererAuthExpiree(r);
    if (!r.ok) throw new Error(r.erreur || 'Erreur MAJ');
    await this._invalidate(`${fichier}::${onglet}`);
    return r;
  },

  // ── V5 — RÉFÉRENTIEL CDS (BUG1) ──────────────────────
  // Liste dynamique des commerciaux pour les dropdowns d'attribution.
  // Retourne un tableau [{pin,nom,role}] ou null si indisponible (le caller
  // applique son fallback codé en dur).
  async lireCDS() {
    try {
      const url  = `${this.BASE_URL}?action=lireCDS&token=${encodeURIComponent(this.TOKEN || '')}`;
      const data = await this._fetchRetry(url, 'GET');
      this._gererAuthExpiree(data);
      return (data && data.ok && Array.isArray(data.cds)) ? data.cds : null;
    } catch(e) { return null; }
  },

  // ── V5 — PERMISSIONS PAR RÔLE (BUG5) ─────────────────
  async lirePermissions() {
    try {
      const url  = `${this.BASE_URL}?action=lirePermissions&token=${encodeURIComponent(this.TOKEN || '')}`;
      const data = await this._fetchRetry(url, 'GET');
      this._gererAuthExpiree(data);
      return (data && data.ok && Array.isArray(data.onglets)) ? data.onglets : null;
    } catch(e) { return null; }
  },

  // ── V5 — DASHBOARD AGRÉGÉ (BUG6) ─────────────────────
  // Cards agrégées côté backend, filtrées par rôle. Disponible pour les vues
  // qui veulent des compteurs prêts à l'emploi.
  async lireDashboard() {
    const url  = `${this.BASE_URL}?action=lireDashboard&token=${encodeURIComponent(this.TOKEN || '')}`;
    const data = await this._fetchRetry(url, 'GET');
    this._gererAuthExpiree(data);
    return data;
  },

  // ── V5 — SAISIE MANUELLE CA (F3) ─────────────────────
  async mettreAJourCA(quarter, montant, pinCible) {
    const payload = { action: 'mettreAJourCA', quarter, montant, token: this.TOKEN };
    if (pinCible) payload.pinCible = pinCible;
    const r = await this._fetchRetry(this.BASE_URL, 'POST', this.MAX_RETRY, payload);
    this._gererAuthExpiree(r);
    if (!r.ok) throw new Error(r.erreur || 'Erreur MAJ CA');
    return r;
  },

  // ── UPLOAD PHOTO (→ Google Drive via Apps Script) ────
  async uploadPhoto(dataUrl, nomFichier) {
    if (!this._online) return { ok: false, offline: true };
    const r = await this._fetchRetry(this.BASE_URL, 'POST', 2, {
      action: 'uploadPhoto', token: this.TOKEN,
      nom: nomFichier, base64: dataUrl.split(',')[1] || dataUrl,
    });
    this._gererAuthExpiree(r);
    return r;
  },

  async viderCache(fichier, onglet) {
    if (fichier && onglet) return this._invalidate(`${fichier}::${onglet}`);
    const db = this._db;
    const tx = db.transaction(['cache','meta'], 'readwrite');
    tx.objectStore('cache').clear();
    tx.objectStore('meta').clear();
  },

  // ── FETCH + RETRY ────────────────────────────────────
  async _fetchRetry(url, method = 'GET', maxRetry = this.MAX_RETRY, body = null) {
    let last;
    for (let i = 0; i < maxRetry; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, this.RETRY_BASE_MS * 2 ** (i - 1)));
      try {
        const opts = { method, redirect: 'follow' };
        if (body) opts.body = JSON.stringify(body);
        const resp = await fetch(url, opts);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch(e) {
        last = e;
        if (e.message?.startsWith('HTTP 4')) break;
      }
    }
    throw last || new Error('Réseau KO');
  },

  // ── INDEXEDDB ────────────────────────────────────────
  _ouvrirIDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('EMPOWER_CACHE', 2);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        ['cache','meta','queue'].forEach(s => {
          if (!db.objectStoreNames.contains(s))
            db.createObjectStore(s, s === 'queue' ? { keyPath: 'id', autoIncrement: true } : { keyPath: 'key' });
        });
      };
      r.onsuccess = e => { this._db = e.target.result; res(e.target.result); };
      r.onerror   = () => rej(r.error);
    });
  },

  _getCached(key) {
    return new Promise(res => {
      const tx = this._db.transaction('cache','readonly');
      const r  = tx.objectStore('cache').get(key);
      r.onsuccess = () => res(r.result?.data || null);
      r.onerror   = () => res(null);
    });
  },

  _setCached(key, data) {
    return new Promise((res, rej) => {
      const tx = this._db.transaction(['cache','meta'],'readwrite');
      tx.objectStore('cache').put({ key, data });
      tx.objectStore('meta').put({ key, ts: Date.now() });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },

  _invalidate(key) {
    return new Promise(res => {
      const tx = this._db.transaction(['cache','meta'],'readwrite');
      tx.objectStore('cache').delete(key);
      tx.objectStore('meta').delete(key);
      tx.oncomplete = res; tx.onerror = res;
    });
  },

  _estExpire(key) {
    return new Promise(async res => {
      const tx = this._db.transaction('meta','readonly');
      const r  = tx.objectStore('meta').get(key);
      r.onsuccess = () => {
        const m = r.result;
        res(!m || (Date.now() - m.ts) / 1000 > this.TTL);
      };
      r.onerror = () => res(true);
    });
  },

  // ── QUEUE OFFLINE ────────────────────────────────────
  _queueAdd(payload) {
    return new Promise((res, rej) => {
      const tx = this._db.transaction('queue','readwrite');
      tx.objectStore('queue').add({ payload, ts: Date.now() });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },

  async _syncQueue() {
    const all = await new Promise(res => {
      const tx = this._db.transaction('queue','readonly');
      const r  = tx.objectStore('queue').getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror   = () => res([]);
    });
    if (!all.length) return;
    Toast.afficher(`🔄 Sync ${all.length} action(s)…`, 'info', 3000);
    let ok = 0;
    for (const item of all) {
      try {
        // Le token a pu expirer pendant la période offline — toujours utiliser l'actuel
        if (item.payload.token !== undefined) item.payload.token = this.TOKEN;
        const r = await this._fetchRetry(this.BASE_URL, 'POST', 2, item.payload);
        if (r.ok) {
          await new Promise(res => {
            const tx = this._db.transaction('queue','readwrite');
            tx.objectStore('queue').delete(item.id);
            tx.oncomplete = res;
          });
          ok++;
        }
      } catch {}
    }
    Toast.afficher(`✅ ${ok}/${all.length} sync`, ok === all.length ? 'succes' : 'warning', 3000);
  },
};
