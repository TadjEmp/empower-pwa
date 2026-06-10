// ═══════════════════════════════════════
//  vue-admin.js — Administration (Tadjidine uniquement)
//  Objectifs CDS · Clé Groq · Paramètres ⚙️_PARAMS
// ═══════════════════════════════════════

window.VueAdmin = {

  state: null,

  async init() {
    if (!Session.estManager()) { Router.aller('#/dashboard'); return; }
    this.state = { chargement: true, objectifs: [], params: [], envoiEnCours: false };
    this.render();
    try {
      const [objectifs, params] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
      ]);
      this.state.objectifs = objectifs;
      this.state.params = params;
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  async sauverObjectif(idObjectif) {
    if (this.state.envoiEnCours) return;
    this.state.envoiEnCours = true;
    const champs = {};
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
      const el = document.getElementById(`obj-${idObjectif}-${q}`);
      if (el && el.value !== '') champs[`${q}_Obj_Revise`] = Number(el.value);
    });
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES', idObjectif, champs);
      Toast.afficher('✅ Objectifs révisés enregistrés', 'succes');
      const o = this.state.objectifs.find(x => x.ID_Objectif === idObjectif);
      if (o) Object.assign(o, champs);
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
    this.state.envoiEnCours = false;
  },

  sauverCleGroq() {
    const v = document.getElementById('admin-groq-key').value.trim();
    GroqAPI.setKey(v);
    Toast.afficher(v ? '✅ Clé Groq enregistrée (sur cet appareil)' : 'Clé effacée', 'succes');
  },

  async viderCache() {
    await SheetsAPI.viderCache();
    Toast.afficher('🗑️ Cache local vidé — données rechargées au prochain écran', 'succes');
  },

  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement administration…</div>';
      return;
    }

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/manager')" class="btn-retour">←</button>
        <h1>⚙️ Administration</h1>
      </header>

      <div class="dash-body">

        <!-- OBJECTIFS -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Objectifs FY27 par CDS (€ révisés)</div>
          ${this.state.objectifs.map(o => `
            <div style="border-bottom:1px solid var(--c-border);padding:10px 0">
              <strong style="font-size:14px">${o.Nom_CDS} <span style="color:var(--c-text-2);font-weight:400">· PIN ${o.PIN_CDS} · FY27 : ${formatEuro(o.FY27_Obj)}</span></strong>
              <div style="display:flex;gap:6px;margin-top:8px">
                ${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `
                  <label style="flex:1;font-size:11px;color:var(--c-text-2)">${q}
                    <input id="obj-${o.ID_Objectif}-${q}" type="number" class="q-input" style="padding:6px 8px;font-size:13px"
                           placeholder="${o[`${q}_Obj_Initial`]}" value="${o[`${q}_Obj_Revise`] || ''}"/>
                  </label>`).join('')}
              </div>
              <button class="btn-secondaire" style="margin-top:8px;padding:8px"
                      onclick="VueAdmin.sauverObjectif('${o.ID_Objectif}')">💾 Enregistrer ${o.Nom_CDS}</button>
            </div>`).join('')}
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">Vide = objectif initial conservé. Les % pace utilisent le révisé s'il existe.</p>
        </div>

        <!-- GROQ -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Clé API Groq (IA)</div>
          <input id="admin-groq-key" type="password" class="q-input" placeholder="gsk_…"
                 value="${GroqAPI.getKey()}"/>
          <button class="btn-secondaire" style="margin-top:10px" onclick="VueAdmin.sauverCleGroq()">💾 Enregistrer la clé</button>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">
            Stockée localement sur cet appareil. Modèles : whisper-large-v3 + llama3-70b-8192.</p>
        </div>

        <!-- PARAMS (lecture) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Paramètres système (⚙️_PARAMS — lecture)</div>
          <div class="grille-identite">
            ${this.state.params.map(p => `
              <div class="id-ligne"><span>${p.Parametre}</span><strong>${p.Valeur}</strong></div>`).join('')}
          </div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">Modifiables directement dans le Google Sheet EMPOWER MDB.</p>
        </div>

        <!-- MAINTENANCE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Maintenance</div>
          <button class="btn-secondaire" onclick="VueAdmin.viderCache()">🗑️ Vider le cache local (IndexedDB)</button>
        </div>
      </div>
    `;
  },
};
