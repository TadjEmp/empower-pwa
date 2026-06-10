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

          <!-- Hero Norton -->
          <div class="login-norton-hero">
            <div class="login-norton-mark">${NORTON_SVG}</div>
            <span class="login-norton-word">norton<sup class="login-tm">™</sup></span>
          </div>
          <h1 class="login-titre">EMPOWER SALES INTELLIGENCE</h1>
          <p class="login-sous">Outil de pilotage terrain · FY27</p>

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
              <button type="button" class="btn-oeil" id="btn-oeil"
                      onclick="VueLogin.toggleMdp()" aria-label="Afficher/masquer le mot de passe">
                <svg id="oeil-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
            <a class="login-oubli" href="mailto:t.soefou@agence-impact.com?subject=ESI%20-%20Mot%20de%20passe%20oubli%C3%A9">Mot de passe oublié ?</a>
            ${this.state.erreur ? `<div class="login-erreur">${this.state.erreur}</div>` : ''}
            <button type="submit" class="btn-login" ${this.state.chargement ? 'disabled' : ''}>
              ${this.state.chargement ? 'Connexion…' : 'Se connecter →'}
            </button>
          </form>

          <img src="img/logo-marvesting-sm.png" alt="Marvesting" class="login-marvesting"/>
        </div>
        <div class="login-aide">Accès réservé — Impact Sales Marketing</div>
      </div>`;
  },

  toggleMdp() {
    const input = document.getElementById('login-mdp');
    const svg   = document.getElementById('oeil-svg');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    if (svg) svg.style.opacity = input.type === 'text' ? '1' : '0.45';
  },

  async soumettre(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const mdp   = document.getElementById('login-mdp').value;
    this.state.chargement = true;
    this.state.erreur = null;
    this.render();
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
