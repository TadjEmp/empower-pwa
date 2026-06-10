// ═══════════════════════════════════════
//  vue-login.js — Connexion email + mot de passe
// ═══════════════════════════════════════

window.VueLogin = {

  state: { erreur: null, chargement: false },

  init() {
    if (Session.estConnecte()) { Router.aller('#/dashboard'); return; }
    this.render();
  },

  render() {
    document.getElementById('app').innerHTML = `
      <div class="login-page">
        <div class="login-carte">
          <div class="login-logo">🛡️</div>
          <h1 class="login-titre">ESI — Norton FY27</h1>
          <p class="login-sous">Empower Sales Intelligence · Outil de pilotage terrain</p>
          <img src="img/logo-marvesting-sm.png" alt="Marvesting" style="height:18px;width:auto;margin:0 auto 8px;display:block"/>

          <form class="login-form" onsubmit="VueLogin.soumettre(event)">
            <div class="login-champ">
              <span class="champ-icone">✉️</span>
              <input type="email" id="login-email" placeholder="Adresse e-mail"
                     autocomplete="username" autofocus required/>
            </div>
            <div class="login-champ">
              <span class="champ-icone">🔒</span>
              <input type="password" id="login-mdp" placeholder="Mot de passe"
                     autocomplete="current-password" required/>
            </div>
            <a class="login-oubli" href="mailto:t.soefou@agence-impact.com?subject=ESI%20-%20Mot%20de%20passe%20oubli%C3%A9">Mot de passe oublié ?</a>
            ${this.state.erreur ? `<div class="login-erreur">${this.state.erreur}</div>` : ''}
            <button type="submit" class="btn-login"
                    ${this.state.chargement ? 'disabled' : ''}>
              ${this.state.chargement ? 'Connexion…' : 'Se connecter  →'}
            </button>
          </form>
        </div>
        <div class="login-aide">Accès réservé — Impact Sales Marketing</div>
      </div>`;
  },

  async soumettre(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const mdp   = document.getElementById('login-mdp').value;
    this.state.chargement = true;
    this.state.erreur = null;
    this.render();
    // Re-render efface les champs — on les restaure pour l'UX en cas d'échec
    document.getElementById('login-email').value = email;

    const r = await Session.connecter(email, mdp);
    if (r.ok) {
      Router.aller('#/dashboard');
    } else {
      this.state.erreur = `❌ ${r.erreur}`;
      this.state.chargement = false;
      this.render();
      document.getElementById('login-email').value = email;
    }
  },
};
