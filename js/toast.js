// ═══════════════════════════════════════
//  toast.js — Notifications toast
// ═══════════════════════════════════════

const Toast = {
  _container: null,
  // Feuille de route Phase 0 — dédoublonnage : un même message déjà affiché
  // (ex. plusieurs notifs identiques reçues par le polling) relance juste son
  // délai au lieu d'empiler une copie visuelle supplémentaire.
  _actifs: new Map(), // clé "type:message" → { el, timeoutId }

  _getContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.id = 'toast-container';
      // aria-live="polite" : les toasts sont annoncés aux lecteurs d'écran
      // sans interrompre ce qui est en cours de lecture (contrairement à
      // "assertive"), cohérent avec leur nature non bloquante.
      this._container.setAttribute('aria-live', 'polite');
      this._container.setAttribute('role', 'status');
      document.body.appendChild(this._container);
    }
    return this._container;
  },

  afficher(message, type = 'info', dureeMs = 3000) {
    const cle = `${type}:${message}`;
    const existant = this._actifs.get(cle);
    if (existant) {
      clearTimeout(existant.timeoutId);
      existant.timeoutId = this._planifierDisparition(existant.el, cle, dureeMs);
      return;
    }

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    const c = this._getContainer();
    c.appendChild(el);

    // Apparition
    requestAnimationFrame(() => el.classList.add('toast-visible'));

    const timeoutId = this._planifierDisparition(el, cle, dureeMs);
    this._actifs.set(cle, { el, timeoutId });
  },

  _planifierDisparition(el, cle, dureeMs) {
    return setTimeout(() => {
      el.classList.remove('toast-visible');
      this._actifs.delete(cle);
      setTimeout(() => el.remove(), 400);
    }, dureeMs);
  },
};
