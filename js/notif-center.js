// ═══════════════════════════════════════
//  notif-center.js — Centre de notifications (M2 / N3-2 + N3-3 + N3-4)
//  Cloche flottante + badge compteur + panneau déroulant + marquage lu.
//  Autonome : se rend dans #notif-center (ajouté au <body>), indépendant
//  du système de vues — survit aux re-render des écrans.
//  Convention non-lu : Statut_Lu = 'NON' (backend) ; marquage = 'OUI'.
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
      .filter(n => Number(n.PIN_Destinataire) === pin
                && String(n.Statut_Lu || 'NON').toUpperCase() === 'NON')
      .sort((a, b) => String(b.Timestamp || b.Date_Envoi || '')
                        .localeCompare(String(a.Timestamp || a.Date_Envoi || '')));
    this._render();
  },

  basculer() { this._ouvert = !this._ouvert; this._render(); },
  fermer()   { this._ouvert = false; this._render(); },

  // N3-4 — clic notif → Statut_Lu = 'OUI'. Optimiste : retrait local immédiat.
  async marquerLue(id) {
    if (!id) return;
    this.liste = this.liste.filter(n => n.ID_Notif !== id);
    this._render();
    try { await SheetsAPI.mettreAJour('EMPOWER_MDB', '🔔_NOTIFS', id, { Statut_Lu: 'OUI' }); }
    catch (e) { /* silencieux : non bloquant */ }
  },

  async marquerToutesLues() {
    const ids = this.liste.map(n => n.ID_Notif).filter(Boolean);
    this.liste = [];
    this._ouvert = false;
    this._render();
    for (const id of ids) {
      try { await SheetsAPI.mettreAJour('EMPOWER_MDB', '🔔_NOTIFS', id, { Statut_Lu: 'OUI' }); }
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
        🔔${c > 0 ? `<span class="nc-badge">${c > 99 ? '99+' : c}</span>` : ''}
      </button>
      ${this._ouvert ? this._panneau() : ''}`;
  },

  _panneau() {
    const items = this.liste.length === 0
      ? `<div class="nc-vide">Aucune notification non lue 🎉</div>`
      : this.liste.map(n => {
          const id = String(n.ID_Notif || '').replace(/'/g, "\\'");
          return `
          <div class="nc-item" onclick="NotifCenter.marquerLue('${id}')" title="Marquer comme lue">
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
      NOUVEAU_LEAD: '🆕', LEAD_ASSIGNE: '📌', STATUT_CHANGE: '🔄',
      VISITE_REALISEE: '✅', IMPORT_TRACKER: '📥', INFO: '🔔',
    };
    return m[String(t || '').toUpperCase()] || '🔔';
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
