// ═══════════════════════════════════════
//  notif-center.js — Centre de notifications (M2 / N3-2 + N3-3 + N3-4)
//  Cloche flottante + badge compteur + panneau déroulant + marquage lu.
//  Autonome : se rend dans #notif-center (ajouté au <body>), indépendant
//  du système de vues — survit aux re-render des écrans.
//  Convention non-lu : Statut_Lu = false (boolean Supabase) ; marquage = true.
// ═══════════════════════════════════════

window.NotifCenter = {
  liste: [],        // notifs NON LUES du PIN courant
  _ouvert: false,

  get compteur() { return this.liste.length; },

  // Alimenté par le polling (app.js) avec TOUTES les lignes 🔔_NOTIFS.
  majDepuisRows(rows) {
    if (!window.Session || !Session.pin) { this.liste = []; this._render(); return; }
    const pin = Number(Session.pin);
    this.liste = (Array.isArray(rows) ? rows : [])
      .filter(n => Number(n.PIN_Destinataire) === pin && !n.Statut_Lu)
      .sort((a, b) => String(b.Date_Envoi || b.Timestamp || '')
                        .localeCompare(String(a.Date_Envoi || a.Timestamp || '')));
    this._render();
  },

  basculer() { this._ouvert = !this._ouvert; this._render(); },
  fermer()   { this._ouvert = false; this._render(); },

  // Table de routage Type_Notif -> route contextuelle (insensible à la casse).
  _route(typeNotif, idCible) {
    if (!idCible) return '#/dashboard';
    const t = String(typeNotif || '').toUpperCase();
    if (['COMPTE_CREE', 'VISITE_REALISEE'].includes(t)) return '#/compte/' + idCible;
    if (['LEAD_ASSIGNE', 'NOUVEAU_LEAD', 'STATUT_CHANGE', 'STATUT_ARCHIVE', 'STATUT_EN_COURS', 'STATUT_INTEGRE'].includes(t)) return '#/empower-tracker';
    if (t === 'IMPORT_TRACKER') return '#/empower-tracker';
    return '#/dashboard';
  },

  // N3-4 — clic notif → Statut_Lu = true. Optimiste : retrait local immédiat.
  async marquerLue(id) {
    if (!id) return;
    this.liste = this.liste.filter(n => n.ID_Notif !== id);
    this._render();
    try { await SheetsAPI.mettreAJour('EMPOWER_MDB', '🔔_NOTIFS', id, { Statut_Lu: true }); }
    catch (e) { /* silencieux : non bloquant */ }
  },

  // Clic notif → navigue vers la route contextuelle PUIS marque comme lue.
  async ouvrir(id) {
    if (!id) return;
    const n = this.liste.find(n => n.ID_Notif === id);
    const route = n ? this._route(n.Type_Notif, String(n.ID_Cible || '').trim()) : '#/dashboard';
    Router.aller(route);
    await this.marquerLue(id);
  },

  async marquerToutesLues() {
    const ids = this.liste.map(n => n.ID_Notif).filter(Boolean);
    this.liste = [];
    this._ouvert = false;
    this._render();
    for (const id of ids) {
      try { await SheetsAPI.mettreAJour('EMPOWER_MDB', '🔔_NOTIFS', id, { Statut_Lu: true }); }
      catch (e) {}
    }
  },

  _conteneur() {
    let el = document.getElementById('notif-center');
    if (!el) { el = document.createElement('div'); el.id = 'notif-center'; document.body.appendChild(el); }
    return el;
  },

  _render() {
    const el = this._conteneur();
    if (!window.Session || !Session.pin) { el.innerHTML = ''; return; }   // masqué hors session
    const c = this.compteur;
    el.innerHTML = `
      <button class="nc-cloche" onclick="NotifCenter.basculer()" aria-label="Notifications (${c} non lue${c > 1 ? 's' : ''})">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>${c > 0 ? `<span class="nc-badge">${c > 99 ? '99+' : c}</span>` : ''}
      </button>
      ${this._ouvert ? this._panneau() : ''}`;
  },

  _panneau() {
    const items = this.liste.length === 0
      ? `<div class="nc-vide">Aucune notification non lue 🎉</div>`
      : this.liste.map(n => {
          const id = String(n.ID_Notif || '').replace(/'/g, "\\'");
          return `
          <div class="nc-item" onclick="NotifCenter.ouvrir('${id}')" title="Ouvrir">
            <div class="nc-item-type">${this._icone(n.Type_Notif)} ${String(n.Type_Notif || '').replace(/_/g, ' ')}</div>
            <div class="nc-item-msg">${this._echap(String(n.Message || '').slice(0, 140))}</div>
            <div class="nc-item-date">${this._dateCourte(n.Timestamp || n.Date_Envoi)}</div>
          </div>`;
        }).join('');
    return `
      <div class="nc-overlay" onclick="if(event.target===this)NotifCenter.fermer()">
        <div class="nc-panneau" role="dialog" aria-label="Notifications">
          <div class="nc-head">
            <strong>Notifications${this.compteur ? ` (${this.compteur})` : ''}</strong>
            ${this.liste.length ? `<button class="nc-tout" onclick="NotifCenter.marquerToutesLues()">Tout marquer lu</button>` : ''}
          </div>
          <div class="nc-liste">${items}</div>
        </div>
      </div>`;
  },

  _icone(t) {
    const m = {
      NOUVEAU_LEAD:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      LEAD_ASSIGNE:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
      STATUT_CHANGE:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
      VISITE_REALISEE: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      IMPORT_TRACKER:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      INFO:            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };
    const bell = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
    return m[String(t || '').toUpperCase()] || bell;
  },
  _dateCourte(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString('fr-FR',
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  },
  _echap(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
