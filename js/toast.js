// ═══════════════════════════════════════
//  toast.js — Notifications toast
// ═══════════════════════════════════════

const Toast = {
  _container: null,

  _getContainer() {
    if (!this._container) {
      this._container = document.createElement('div');
      this._container.id = 'toast-container';
      document.body.appendChild(this._container);
    }
    return this._container;
  },

  afficher(message, type = 'info', dureeMs = 3000) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    const c = this._getContainer();
    c.appendChild(el);

    // Apparition
    requestAnimationFrame(() => el.classList.add('toast-visible'));

    // Disparition
    setTimeout(() => {
      el.classList.remove('toast-visible');
      setTimeout(() => el.remove(), 400);
    }, dureeMs);
  },
};
