// ═══════════════════════════════════════
//  session.js — Session email + mot de passe
//  Auth via action=login (Apps Script) → token 8h
//  Rôles : 'CDS' | 'ADMIN' | 'CHANNEL_MANAGER' | 'EXTERNE'
// ═══════════════════════════════════════

const Session = {
  token:  null,
  expiry: null,
  email:  null,
  pin:    null,   // identifiant métier interne (filtres comptes/visites)
  nom:    null,
  role:   null,

  init() {
    const saved = localStorage.getItem('empower_session');
    if (saved) {
      const s = safeJSON(saved);
      if (s && s.token && s.expiry && Date.now() < s.expiry) {
        Object.assign(this, {
          token: s.token, expiry: s.expiry, email: s.email,
          pin: s.pin, nom: s.nom, role: s.role,
        });
        SheetsAPI.TOKEN = s.token;
        return true;
      }
      localStorage.removeItem('empower_session');
    }
    return false;
  },

  async connecter(email, motdepasse) {
    const r = await SheetsAPI.login(email, motdepasse);
    if (!r.ok) return { ok: false, erreur: r.erreur || 'Connexion refusée' };

    this.token  = r.token;
    this.expiry = r.expiry;
    this.email  = r.utilisateur.email;
    this.pin    = r.utilisateur.pin;
    this.nom    = r.utilisateur.nom;
    this.role   = r.utilisateur.role;
    SheetsAPI.TOKEN = r.token;

    localStorage.setItem('empower_session', JSON.stringify({
      token: this.token, expiry: this.expiry, email: this.email,
      pin: this.pin, nom: this.nom, role: this.role,
    }));
    return { ok: true };
  },

  deconnecter() {
    this.token = this.expiry = this.email = null;
    this.pin = this.nom = this.role = null;
    SheetsAPI.TOKEN = null;
    localStorage.removeItem('empower_session');
  },

  estConnecte() { return !!this.token && Date.now() < this.expiry; },
  estManager()  { return this.role === 'ADMIN'; },
  estCDS()      { return this.role === 'CDS'; },
  estChannel()  { return this.role === 'CHANNEL_MANAGER'; },
  estExterne()  { return this.role === 'EXTERNE'; },
  voitTout()    { return this.role === 'ADMIN' || this.role === 'CHANNEL_MANAGER'; },
};
