// ═══════════════════════════════════════
//  vue-login.js — Connexion email + mot de passe
// ═══════════════════════════════════════

window.VueLogin = {

  state: { erreur: null, chargement: false, mode: 'login', resetEmail: '', resetMsg: '', resetToken: '', nouveauMdp: '', resetMdpMsg: '' },

  init() {
    if (Session.estConnecte()) { Router.aller('#/dashboard'); return; }
    // BLOC 9 — détecter token de reset dans l'URL (#/reset-password?token=xxx)
    const hash = location.hash || '';
    if (hash.includes('reset-password')) {
      const m = hash.match(/[?&]token=([a-f0-9]+)/i);
      if (m) { this.state.mode = 'nouveau-mdp'; this.state.resetToken = m[1]; }
      else   { this.state.mode = 'reset'; }
    }
    this.render();
  },

  render() {
    if (this.state.mode === 'reset')     { this._renderReset(); return; }
    if (this.state.mode === 'nouveau-mdp') { this._renderNouveauMdp(); return; }
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
            <!-- BLOC 9 — plus de mailto: — formulaire de reset backend -->
            <button type="button" class="login-oubli" style="background:none;border:none;cursor:pointer;color:var(--c-primary);font-size:13px;text-align:left;padding:0;margin-bottom:4px"
                    onclick="VueLogin.state.mode='reset';VueLogin.render()">Mot de passe oublié ?</button>
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

  _renderReset() {
    document.getElementById('app').innerHTML = `
      <div class="login-page">
        <div class="login-carte">
          <h1 class="login-titre" style="font-size:20px">Mot de passe oublié</h1>
          <p class="login-sous">Saisissez votre email — vous recevrez un lien valable 30 minutes.</p>
          <form class="login-form" onsubmit="VueLogin.envoyerReset(event)">
            <div class="login-champ">
              <span class="champ-icone">✉️</span>
              <input type="email" id="reset-email" placeholder="Votre adresse e-mail" required
                     value="${this.state.resetEmail}" oninput="VueLogin.state.resetEmail=this.value"/>
            </div>
            ${this.state.resetMsg ? `<div class="login-erreur" style="color:var(--c-success)">${this.state.resetMsg}</div>` : ''}
            <button type="submit" class="btn-login" ${this.state.chargement ? 'disabled' : ''}>
              ${this.state.chargement ? 'Envoi…' : 'Envoyer le lien →'}
            </button>
            <button type="button" class="btn-secondaire" style="width:100%;margin-top:8px"
                    onclick="VueLogin.state.mode='login';VueLogin.render()">← Retour à la connexion</button>
          </form>
        </div>
      </div>`;
  },

  _renderNouveauMdp() {
    document.getElementById('app').innerHTML = `
      <div class="login-page">
        <div class="login-carte">
          <h1 class="login-titre" style="font-size:20px">Nouveau mot de passe</h1>
          <form class="login-form" onsubmit="VueLogin.changerMdp(event)">
            <div class="login-champ">
              <span class="champ-icone">🔒</span>
              <input type="password" id="nouveau-mdp" placeholder="Nouveau mot de passe (6 car. min.)" required
                     oninput="VueLogin.state.nouveauMdp=this.value"/>
            </div>
            ${this.state.resetMdpMsg ? `<div class="login-erreur" style="color:${this.state.resetMdpMsg.startsWith('✅')?'var(--c-success)':'var(--c-danger)'}">${this.state.resetMdpMsg}</div>` : ''}
            <button type="submit" class="btn-login" ${this.state.chargement ? 'disabled' : ''}>
              ${this.state.chargement ? 'Enregistrement…' : 'Enregistrer le mot de passe →'}
            </button>
          </form>
        </div>
      </div>`;
  },

  async envoyerReset(e) {
    e.preventDefault();
    this.state.chargement = true;
    this.state.resetMsg   = '';
    this._renderReset();
    try {
      const r = await SheetsAPI._fetchRetry(SheetsAPI.BASE_URL, 'POST', 2, { action: 'sendResetEmail', email: this.state.resetEmail });
      this.state.resetMsg = r.message || 'Lien envoyé si l\'email est connu.';
      // Si admin et lien retourné (MailApp non configuré) : afficher le lien
      if (r.lienAdmin) this.state.resetMsg += `\n\n🔗 (Admin) Lien : ${r.lienAdmin}`;
    } catch(err) {
      this.state.resetMsg = '❌ Erreur : ' + err.message;
    }
    this.state.chargement = false;
    this._renderReset();
  },

  async changerMdp(e) {
    e.preventDefault();
    if (!this.state.nouveauMdp || this.state.nouveauMdp.length < 6) {
      this.state.resetMdpMsg = '❌ 6 caractères minimum'; this._renderNouveauMdp(); return;
    }
    this.state.chargement = true;
    this._renderNouveauMdp();
    try {
      const r = await SheetsAPI._fetchRetry(SheetsAPI.BASE_URL, 'POST', 2, { action: 'resetPassword', token: this.state.resetToken, nouveauMotdepasse: this.state.nouveauMdp });
      if (r.ok) {
        this.state.resetMdpMsg = '✅ ' + (r.message || 'Mot de passe mis à jour');
        setTimeout(() => { this.state.mode = 'login'; this.state.resetToken = ''; this.render(); }, 2000);
      } else {
        this.state.resetMdpMsg = '❌ ' + (r.erreur || 'Erreur');
      }
    } catch(err) {
      this.state.resetMdpMsg = '❌ ' + err.message;
    }
    this.state.chargement = false;
    this._renderNouveauMdp();
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
