// ═══════════════════════════════════════
//  vue-admin.js — Administration (Tadjidine uniquement)
//  Objectifs CDS · Clé Groq · Paramètres ⚙️_PARAMS
// ═══════════════════════════════════════

window.VueAdmin = {

  state: null,

  async init() {
    // CHANNEL_MANAGER (Alexandra) peut accéder aux exports uniquement
    if (!Session.voitTout()) { Router.aller('#/dashboard'); return; }
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

  async sauverCleGroq() {
    const v = document.getElementById('admin-groq-key').value.trim();
    if (!v) { Toast.afficher('Clé vide — rien enregistré', 'warning'); return; }
    const btn = document.getElementById('btn-groq-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
    try {
      await GroqAPI.sauverCle(v);
      document.getElementById('admin-groq-key').value = '';
      Toast.afficher('✅ Clé Groq stockée côté Apps Script (PropertiesService)', 'succes');
    } catch(e) {
      Toast.afficher('❌ ' + e.message, 'erreur');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer la clé'; }
    }
  },

  async sauverCleGemini() {
    const v = document.getElementById('admin-gemini-key').value.trim();
    if (!v) { Toast.afficher('Clé vide — rien enregistré', 'warning'); return; }
    const btn = document.getElementById('btn-gemini-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
    try {
      await GeminiAPI.sauverCle(v);
      document.getElementById('admin-gemini-key').value = '';
      Toast.afficher('✅ Clé Gemini stockée côté Apps Script (PropertiesService)', 'succes');
    } catch(e) {
      Toast.afficher('❌ ' + e.message, 'erreur');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer la clé'; }
    }
  },

  async viderCache() {
    await SheetsAPI.viderCache();
    Toast.afficher('🗑️ Cache local vidé — données rechargées au prochain écran', 'succes');
  },

  // ── RGPD (B11) ────────────────────────────────────────────
  async purgerDonneesCDS(pinCDS) {
    const cible = pinCDS || Session.pin;
    const nomCDS = pinCDS
      ? (this.state.objectifs.find(o => Number(o.PIN_CDS) === Number(pinCDS))?.Nom_CDS || `PIN ${pinCDS}`)
      : Session.nom;
    const btn = document.getElementById(`btn-purge-${cible}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Purge…'; }
    try {
      const r = await fetch(SheetsAPI.BASE_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purgerDonnees', token: SheetsAPI.TOKEN, pinCDS: cible }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.erreur);
      Toast.afficher(`✅ ${data.lignesSupprimees} ligne(s) supprimée(s) pour ${nomCDS}`, 'succes');
      await SheetsAPI.viderCache('EMPOWER_MDB', '📞_PHONING');
      await SheetsAPI.viderCache('EMPOWER_MDB', '🗺️_VISITES');
    } catch(e) {
      Toast.afficher('❌ ' + e.message, 'erreur');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🗑️ Purger'; }
    }
  },

  // ── Exports CSV (B9) ──────────────────────────────────
  _toCSV(rows) {
    if (!rows || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const esc = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\r\n');
  },

  _telechargerCSV(csv, nom) {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = nom; a.click();
    URL.revokeObjectURL(url);
  },

  async _logExport(type, nbLignes) {
    try {
      await SheetsAPI.ecrire('EMPOWER_MDB', '📊_ACTIONS', {
        ID_Action:   genId('EXP'),
        Date_Action: new Date().toISOString(),
        Type_Action: 'EXPORT_CSV',
        Source:      'ESI_V21',
        PIN_CDS:     Session.pin,
        Nom_Compte:  type,
        Statut_Avant: '', Statut_Apres: `${nbLignes} lignes`,
        Resum_IA: '', GPS_Lat: '', GPS_Lng: '',
        Timestamp: new Date().toISOString(),
      });
    } catch {}
  },

  EXPORTS: [
    { id: 'prospects',    label: 'Pipeline complet',    fichier: 'EMPOWER_MDB', onglet: '📋_PROSPECTS' },
    { id: 'comptes',      label: 'Comptes actifs',       fichier: 'EMPOWER_MDB', onglet: '🏢_COMPTES' },
    { id: 'sell_in',      label: 'Sell-In historique',   fichier: 'EMPOWER_MDB', onglet: '📉_SELL_IN_HISTORIQUE' },
    { id: 'visites',      label: 'Visites terrain',      fichier: 'EMPOWER_MDB', onglet: '🗺️_VISITES' },
    { id: 'objectifs',    label: 'Objectifs & Primes',   fichier: 'EMPOWER_MDB', onglet: '🎯_OBJECTIFS_PRIMES' },
  ],

  async exporterDonnees(id) {
    const exp = this.EXPORTS.find(e => e.id === id);
    if (!exp) return;
    const btn = document.getElementById(`btn-export-${id}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Chargement…'; }
    try {
      const data = await SheetsAPI.lire(exp.fichier, exp.onglet);
      const csv  = this._toCSV(data);
      const date = new Date().toISOString().slice(0, 10);
      this._telechargerCSV(csv, `ESI_${exp.id}_${date}.csv`);
      await this._logExport(exp.label, data.length);
      Toast.afficher(`✅ Export ${exp.label} — ${data.length} lignes`, 'succes');
    } catch(e) {
      Toast.afficher('❌ Export échoué : ' + e.message, 'erreur');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = `📥 Exporter`; }
    }
  },

  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement administration…</div>';
      return;
    }

    // Alexandra (CHANNEL_MANAGER) : vue exports uniquement
    if (Session.estChannel()) {
      app.innerHTML = `
        <header class="header-vue">
          <button onclick="Router.aller('#/empower-tracker')" class="btn-retour">←</button>
          <h1>📥 Exports & Reporting</h1>
        </header>
        <div class="dash-body">
          <div class="bloc-fiche">
            <div class="bloc-titre">📥 Exports CSV</div>
            <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">
              Données en temps réel — un log est enregistré dans 📊_ACTIONS.
            </p>
            ${this.EXPORTS.map(e => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--c-border)">
                <div>
                  <div style="font-size:14px;font-weight:600">${e.label}</div>
                  <div style="font-size:11px;color:var(--c-text-2)">${e.onglet}</div>
                </div>
                <button id="btn-export-${e.id}" class="btn-secondaire" style="padding:8px 14px;width:auto"
                        onclick="VueAdmin.exporterDonnees('${e.id}')">📥 Exporter</button>
              </div>`).join('')}
          </div>
        </div>`;
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
          <div class="bloc-titre">Clé API Groq (transcription vocale + LLM)</div>
          <input id="admin-groq-key" type="password" class="q-input" placeholder="gsk_…"
                 autocomplete="new-password"/>
          <button id="btn-groq-save" class="btn-secondaire" style="margin-top:10px"
                  onclick="VueAdmin.sauverCleGroq()">💾 Enregistrer la clé</button>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">
            Stockée <strong>côté Apps Script</strong> (PropertiesService) — jamais exposée au navigateur.
            Modèles : whisper-large-v3 (STT) + llama3-70b-8192 (LLM).</p>
        </div>

        <!-- GEMINI (B10) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Clé API Gemini (IA assistant)</div>
          <input id="admin-gemini-key" type="password" class="q-input" placeholder="AQ…"
                 autocomplete="new-password"/>
          <button id="btn-gemini-save" class="btn-secondaire" style="margin-top:10px"
                  onclick="VueAdmin.sauverCleGemini()">💾 Enregistrer la clé</button>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">
            Stockée <strong>côté Apps Script</strong> (PropertiesService) — jamais exposée au navigateur.
            Utilisée pour : analyse prospect, préparation visite, email de prospection, résumé CR.</p>
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

        <!-- EXPORTS CSV (B9) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📥 Exports CSV</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">
            Tous les exports incluent les données en temps réel. Un log est enregistré dans 📊_ACTIONS.
          </p>
          ${this.EXPORTS.map(e => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--c-border)">
              <div>
                <div style="font-size:14px;font-weight:600">${e.label}</div>
                <div style="font-size:11px;color:var(--c-text-2)">${e.fichier} · ${e.onglet}</div>
              </div>
              <button id="btn-export-${e.id}" class="btn-secondaire" style="padding:8px 14px;width:auto"
                      onclick="VueAdmin.exporterDonnees('${e.id}')">📥 Exporter</button>
            </div>`).join('')}
        </div>

        <!-- RGPD (B11) -->
        <div class="bloc-fiche">
          <div class="bloc-titre">🔒 RGPD — Purge des données personnelles</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">
            Supprime définitivement les appels (📞_PHONING) et visites (🗺️_VISITES) d'un CDS.
            Les comptes et prospects ne sont pas affectés.<br>
            <strong>Audio : jamais stocké côté serveur</strong> — seule la transcription texte est conservée dans les notes d'appel.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${this.state.objectifs.map(o => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--c-border)">
                <div>
                  <div style="font-size:14px;font-weight:600">${o.Nom_CDS}</div>
                  <div style="font-size:11px;color:var(--c-text-2)">PIN ${o.PIN_CDS} · 📞 appels + 🗺️ visites</div>
                </div>
                <button id="btn-purge-${o.PIN_CDS}" class="btn-secondaire"
                        style="padding:8px 14px;width:auto;color:var(--c-danger);border-color:var(--c-danger)"
                        onclick="if(confirm('Purger TOUTES les données de ${o.Nom_CDS} ?')) VueAdmin.purgerDonneesCDS('${o.PIN_CDS}')">
                  🗑️ Purger
                </button>
              </div>`).join('')}
          </div>
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
