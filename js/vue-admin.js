// ═══════════════════════════════════════
//  vue-admin.js — Administration v9
//  Exports thématiques enrichis + vue équipe
// ═══════════════════════════════════════

window.VueAdmin = {

  state: null,

  async init() {
    if (!Session.voitTout()) { Router.aller('#/dashboard'); return; }
    this.state = {
      chargement: true, objectifs: [], params: [], envoiEnCours: false,
      alexTab: 'exports',   // 'exports' | 'leads'
      leadEnvoi: false,
      formLead: this._initFormLead(),
    };
    this.render();
    try {
      const [objectifs, params] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
      ]);
      this.state.objectifs = objectifs;
      this.state.params    = params;
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  _initFormLead() {
    return {
      nom: '', ville: '', cp: '', departement: '',
      canal: 'EMPOWER', type: 'Revendeur IT',
      interlocuteur: '', telephone: '', email: '',
      potentiel: '3', source: 'prospection terrain',
      origine: Session.nom || 'Alexandra',
      produits: [], notes: '',
      cdsAssigne: '',
    };
  },

  setAlexTab(tab) { this.state.alexTab = tab; this.render(); },

  setLeadProduits(produit) {
    const arr = this.state.formLead.produits;
    const idx = arr.indexOf(produit);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(produit);
    this.render();
  },

  // R3 : Créer un lead EMPOWER (Alexandra / Flavie)
  async sauverLead(e) {
    e.preventDefault();
    if (this.state.leadEnvoi) return;
    const f = this.state.formLead;
    if (!f.nom.trim()) { Toast.afficher('Nom du prospect requis', 'warning'); return; }
    if (!f.cdsAssigne)  { Toast.afficher('Assignez un CDS', 'warning'); return; }

    this.state.leadEnvoi = true;
    this.render();

    try {
      // Vérification doublon
      const existants = await SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS');
      const nomNorm = normaliserNom(f.nom);
      const doublons = existants.filter(p =>
        normaliserNom(p.Nom_Compte).includes(nomNorm.slice(0, 5)) &&
        (!f.ville || normaliserNom(p.Ville || '').includes(normaliserNom(f.ville).slice(0, 4)))
      );
      if (doublons.length > 0) {
        const ok = confirm(`⚠️ Ce compte ressemble à "${doublons[0].Nom_Compte}" déjà dans la base.\n\nContinuer quand même ?`);
        if (!ok) { this.state.leadEnvoi = false; this.render(); return; }
      }

      const lead = {
        ID_Prospect:       genId('LEAD'),
        Nom_Compte:        f.nom.trim(),
        Ville:             f.ville,
        Code_Postal:       f.cp,
        Departement:       f.departement,
        CANAL:             f.canal,
        Type_Revendeur:    f.type,
        Interlocuteur:     f.interlocuteur,
        Tel:               f.telephone,
        Email:             f.email,
        POTENTIEL:         ['1','2'].includes(f.potentiel) ? 'Faible' : f.potentiel === '3' ? 'Moyen' : 'Fort',
        Source:            f.source,
        ORIGINE:           `Lead_${f.origine}`,
        Produits_Potentiels: f.produits.join(', '),
        Note_initiale:     f.notes,
        PIN_CDS_Assigne:   f.cdsAssigne,
        STATUT_EMPOWER:    'ASSIGNE',
        FLAG_ACTION:       'ASSIGNE',
        Flag_traite:       'FALSE',
        Date_Import:       new Date().toISOString().slice(0, 10),
        Timestamp:         new Date().toISOString(),
        created_by:        Session.nom,
      };

      await SheetsAPI.ecrire('EMPOWER_MDB', '📋_PROSPECTS', lead);
      await this._logExport(`LEAD_CREE:${f.nom}`, 1);
      Toast.afficher(`✅ Lead créé — ${f.nom} → assigné à PIN ${f.cdsAssigne}`, 'succes', 5000);
      this.state.formLead = this._initFormLead();
    } catch(err) {
      Toast.afficher('❌ ' + err.message, 'erreur');
    }
    this.state.leadEnvoi = false;
    this.render();
  },

  _renderFormLead() {
    const f = this.state.formLead;
    const PRODUITS = ['Norton 360','Norton Small Business','Norton Family','LifeLock','Norton VPN','Autre'];
    // CDS depuis objectifs
    const cdsList = this.state.objectifs.filter(o => {
      const p = Number(o.PIN_CDS);
      return p !== 1000; // exclure manager
    });

    return `
      <div class="bloc-fiche">
        <div class="bloc-titre">➕ Créer un lead EMPOWER</div>
        <p style="font-size:12px;color:var(--c-text-2);margin-bottom:14px">
          Les leads créés ici apparaissent immédiatement dans l'EMPOWER TRACKER du CDS assigné.
        </p>
        <form onsubmit="VueAdmin.sauverLead(event)">

          <div style="display:flex;gap:10px">
            <label style="flex:3">Nom du prospect / revendeur *
              <input class="q-input" required value="${f.nom}"
                     oninput="VueAdmin.state.formLead.nom=this.value" placeholder="ex : BUREAU VALLÉE LYON"/></label>
            <label style="flex:2">Ville
              <input class="q-input" value="${f.ville}"
                     oninput="VueAdmin.state.formLead.ville=this.value" placeholder="Lyon"/></label>
          </div>

          <div style="display:flex;gap:10px">
            <label style="flex:1">CP
              <input class="q-input" value="${f.cp}"
                     oninput="VueAdmin.state.formLead.cp=this.value" placeholder="69000"/></label>
            <label style="flex:2">Département
              <input class="q-input" value="${f.departement}"
                     oninput="VueAdmin.state.formLead.departement=this.value" placeholder="Rhône"/></label>
          </div>

          <div style="display:flex;gap:10px">
            <label style="flex:1">Canal probable
              <select onchange="VueAdmin.state.formLead.canal=this.value">
                ${['EMPOWER','TD SYNNEX','INGRAM','LECLERC','Autre'].map(c =>
                  `<option value="${c}" ${f.canal === c ? 'selected' : ''}>${c}</option>`
                ).join('')}
              </select>
            </label>
            <label style="flex:2">Type de revendeur
              <select onchange="VueAdmin.state.formLead.type=this.value">
                ${['Revendeur IT','Leclerc','Bureau Vallée','Grande Surface','Autre'].map(t =>
                  `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t}</option>`
                ).join('')}
              </select>
            </label>
          </div>

          <div style="display:flex;gap:10px">
            <label style="flex:2">Interlocuteur
              <input class="q-input" value="${f.interlocuteur}"
                     oninput="VueAdmin.state.formLead.interlocuteur=this.value" placeholder="Prénom Nom"/></label>
            <label style="flex:2">Téléphone
              <input type="tel" class="q-input" value="${f.telephone}"
                     oninput="VueAdmin.state.formLead.telephone=this.value" placeholder="06 XX XX XX XX"/></label>
          </div>

          <label>Email
            <input type="email" class="q-input" value="${f.email}"
                   oninput="VueAdmin.state.formLead.email=this.value" placeholder="contact@…"/></label>

          <div style="display:flex;gap:10px">
            <label style="flex:1">Potentiel estimé
              <select onchange="VueAdmin.state.formLead.potentiel=this.value">
                <option value="1" ${f.potentiel==='1'?'selected':''}>1 — Faible</option>
                <option value="2" ${f.potentiel==='2'?'selected':''}>2 — Faible+</option>
                <option value="3" ${f.potentiel==='3'?'selected':''}>3 — Moyen</option>
                <option value="4" ${f.potentiel==='4'?'selected':''}>4 — Fort</option>
                <option value="5" ${f.potentiel==='5'?'selected':''}>5 — Fort+</option>
              </select>
            </label>
            <label style="flex:2">Source
              <select onchange="VueAdmin.state.formLead.source=this.value">
                ${['prospection terrain','événement','recommandation','fichier partenaire','autre'].map(s =>
                  `<option value="${s}" ${f.source === s ? 'selected' : ''}>${s}</option>`
                ).join('')}
              </select>
            </label>
          </div>

          <label>Produits Norton potentiels
            <div class="q-chips">
              ${PRODUITS.map(p => `
                <button type="button" class="q-chip ${f.produits.includes(p) ? 'active' : ''}"
                        onclick="VueAdmin.setLeadProduits('${p}')">${p}</button>`).join('')}
            </div>
          </label>

          <label>Notes de contexte (pour le CDS)
            <textarea class="q-textarea" rows="3"
                      oninput="VueAdmin.state.formLead.notes=this.value"
                      placeholder="Contexte, historique, point de vigilance…">${f.notes}</textarea></label>

          <label style="border:2px solid var(--c-primary);padding:10px;border-radius:var(--radius-sm);background:var(--c-bg)">
            <span style="font-weight:700;color:var(--c-primary)">CDS à assigner *</span>
            <select required onchange="VueAdmin.state.formLead.cdsAssigne=this.value;VueAdmin.render()" style="margin-top:6px">
              <option value="">— choisir un commercial —</option>
              ${cdsList.map(o =>
                `<option value="${o.PIN_CDS}" ${f.cdsAssigne == o.PIN_CDS ? 'selected' : ''}>${o.Nom_CDS}</option>`
              ).join('')}
            </select>
          </label>

          <button type="submit" class="btn-primaire" style="margin-top:16px"
                  ${this.state.leadEnvoi ? 'disabled' : ''}>
            ${this.state.leadEnvoi ? '⏳ Création en cours…' : '✅ Créer et assigner le lead'}
          </button>
        </form>
      </div>`;
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
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer la clé'; } }
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
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer la clé'; } }
  },

  // ── Test réel des clés IA (appel léger via proxy Apps Script) ──
  async testerCleGroq() {
    const btn = document.getElementById('btn-groq-test');
    const out = document.getElementById('groq-test-res');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Test…'; }
    if (out) { out.textContent = ''; out.style.color = 'var(--c-text-2)'; }
    try {
      const t0 = Date.now();
      const rep = await GroqAPI._chat(
        [{ role: 'user', content: 'Réponds exactement: OK' }], false
      );
      const ms = Date.now() - t0;
      if (out) { out.style.color = 'var(--c-success, #1a9e5c)'; out.textContent = `✅ Groq répond (${ms} ms) — « ${String(rep).slice(0, 40)} »`; }
      Toast.afficher('✅ Clé Groq fonctionnelle', 'succes');
    } catch(e) {
      if (out) { out.style.color = 'var(--c-cta, #FF6D68)'; out.textContent = '❌ ' + e.message; }
      Toast.afficher('❌ Groq : ' + e.message, 'erreur');
    } finally { if (btn) { btn.disabled = false; btn.textContent = '🧪 Tester la clé Groq'; } }
  },

  async testerCleGemini() {
    const btn = document.getElementById('btn-gemini-test');
    const out = document.getElementById('gemini-test-res');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Test…'; }
    if (out) { out.textContent = ''; out.style.color = 'var(--c-text-2)'; }
    try {
      const t0 = Date.now();
      const rep = await GeminiAPI._appeler('Réponds exactement: OK', '');
      const ms = Date.now() - t0;
      if (out) { out.style.color = 'var(--c-success, #1a9e5c)'; out.textContent = `✅ Gemini répond (${ms} ms) — « ${String(rep).trim().slice(0, 40)} »`; }
      Toast.afficher('✅ Clé Gemini fonctionnelle', 'succes');
    } catch(e) {
      if (out) { out.style.color = 'var(--c-cta, #FF6D68)'; out.textContent = '❌ ' + e.message; }
      Toast.afficher('❌ Gemini : ' + e.message, 'erreur');
    } finally { if (btn) { btn.disabled = false; btn.textContent = '🧪 Tester la clé Gemini'; } }
  },

  async viderCache() {
    await SheetsAPI.viderCache();
    Toast.afficher('🗑️ Cache local vidé — données rechargées au prochain écran', 'succes');
  },

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
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '🗑️ Purger'; } }
  },

  // ── Exports CSV thématiques ──
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

  // Exports organisés par thème — confirmés pour le reporting manager
  EXPORT_GROUPES: [
    {
      titre: '📋 Prospects & Pipeline',
      exports: [
        { id: 'prospects', label: 'Pipeline complet (tous statuts)',    fichier: 'EMPOWER_MDB', onglet: '📋_PROSPECTS',          desc: 'Tous les prospects avec statut EMPOWER, potentiel, assignation CDS' },
        { id: 'comptes',   label: 'Comptes actifs',                      fichier: 'EMPOWER_MDB', onglet: '🏢_COMPTES',             desc: 'Base clients avec CA FY25/FY26/Q1FY27, statuts, CDS assignés' },
      ],
    },
    {
      titre: '📞 Activité terrain',
      exports: [
        { id: 'visites',   label: 'Visites terrain',                     fichier: 'EMPOWER_MDB', onglet: '🗺️_VISITES',            desc: 'Toutes les visites planifiées et réalisées avec CR, questionnaire, GPS' },
        { id: 'phoning',   label: 'Activité phoning',                    fichier: 'EMPOWER_MDB', onglet: '📞_PHONING',             desc: 'Historique des appels : statut, intérêt EMPOWER, freins, rappels' },
        { id: 'actions',   label: 'Journal des actions (📊_ACTIONS)',    fichier: 'EMPOWER_MDB', onglet: '📊_ACTIONS',             desc: 'Toutes les actions logguées : alertes, exports, avancement pipeline' },
      ],
    },
    {
      titre: '🏆 Financier & Objectifs',
      exports: [
        { id: 'objectifs', label: 'Objectifs & Primes FY27',             fichier: 'EMPOWER_MDB', onglet: '🎯_OBJECTIFS_PRIMES',   desc: 'Objectifs Q1-Q4 révisés, CA réalisé, primes par CDS' },
        { id: 'sell_in',   label: 'Sell-In historique (FY25-FY26-FY27)', fichier: 'EMPOWER_MDB', onglet: '📉_SELL_IN_HISTORIQUE', desc: 'CA trimestriel historique par compte, canal, secteur' },
      ],
    },
  ],

  // Accès plat pour compatibilité
  get EXPORTS() {
    return this.EXPORT_GROUPES.flatMap(g => g.exports);
  },

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

  _renderExports() {
    return this.EXPORT_GROUPES.map(groupe => `
      <div style="margin-bottom:18px">
        <div style="font-size:12px;font-weight:700;color:var(--c-title);letter-spacing:.04em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--c-border)">${groupe.titre}</div>
        ${groupe.exports.map(e => `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--c-bg);gap:12px">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600">${e.label}</div>
              <div style="font-size:11px;color:var(--c-text-2);margin-top:1px">${e.desc}</div>
            </div>
            <button id="btn-export-${e.id}" class="btn-secondaire" style="padding:8px 14px;width:auto;flex-shrink:0"
                    onclick="VueAdmin.exporterDonnees('${e.id}')">📥 CSV</button>
          </div>`).join('')}
      </div>`).join('');
  },

  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement administration…</div>';
      return;
    }

    // Alexandra (CHANNEL_MANAGER) : exports + création de leads
    if (Session.estChannel()) {
      const tab = this.state.alexTab || 'exports';
      app.innerHTML = `
        <header class="header-vue">
          <button onclick="Router.aller('#/empower-tracker')" class="btn-retour">←</button>
          <h1>📥 Espace Alexandra</h1>
        </header>
        <!-- Onglets -->
        <div style="display:flex;border-bottom:2px solid var(--c-border);background:var(--c-surface)">
          ${[['exports','📥 Exports'],['leads','➕ Créer un lead']].map(([t, l]) => `
            <button onclick="VueAdmin.setAlexTab('${t}')"
                    style="flex:1;padding:12px 8px;border:none;border-bottom:${tab===t?'3px solid var(--c-primary)':'3px solid transparent'};
                           background:transparent;font-weight:${tab===t?'700':'400'};font-size:13px;
                           color:${tab===t?'var(--c-primary)':'var(--c-text-2)'};cursor:pointer">${l}</button>`).join('')}
        </div>
        <div class="dash-body avec-nav">
          ${tab === 'exports' ? `
            <div class="bloc-fiche">
              <div class="bloc-titre">📥 Exports CSV — Reporting thématique</div>
              <p style="font-size:12px;color:var(--c-text-2);margin-bottom:14px">
                Données en temps réel. Chaque export est tracé dans 📊_ACTIONS.
              </p>
              ${this._renderExports()}
            </div>` : this._renderFormLead()}
        </div>
        ${NavBar('home')}`;
      return;
    }

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/manager')" class="btn-retour">←</button>
        <h1>⚙️ Administration</h1>
      </header>

      <div class="dash-body avec-nav">

        <!-- OBJECTIFS -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Objectifs FY27 par CDS (€ révisés)</div>
          ${this.state.objectifs.map(o => `
            <div style="border-bottom:1px solid var(--c-border);padding:10px 0">
              <strong style="font-size:14px">${o.Nom_CDS}
                <span style="color:var(--c-text-2);font-weight:400"> · PIN ${o.PIN_CDS} · FY27 : ${formatEuro(o.FY27_Obj)}</span>
              </strong>
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

        <!-- CLÉS API -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Clé API Groq (transcription vocale + LLM)</div>
          <input id="admin-groq-key" type="password" class="q-input" placeholder="gsk_…" autocomplete="new-password"/>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button id="btn-groq-save" class="btn-secondaire"
                    onclick="VueAdmin.sauverCleGroq()">💾 Enregistrer la clé Groq</button>
            <button id="btn-groq-test" class="btn-secondaire"
                    onclick="VueAdmin.testerCleGroq()">🧪 Tester la clé Groq</button>
          </div>
          <div id="groq-test-res" style="font-size:12px;margin-top:8px;min-height:16px"></div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">
            Stockée <strong>côté Apps Script</strong> (PropertiesService) — jamais exposée au navigateur.
          </p>
        </div>

        <div class="bloc-fiche">
          <div class="bloc-titre">Clé API Gemini (IA assistant)</div>
          <input id="admin-gemini-key" type="password" class="q-input" placeholder="AQ…" autocomplete="new-password"/>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button id="btn-gemini-save" class="btn-secondaire"
                    onclick="VueAdmin.sauverCleGemini()">💾 Enregistrer la clé Gemini</button>
            <button id="btn-gemini-test" class="btn-secondaire"
                    onclick="VueAdmin.testerCleGemini()">🧪 Tester la clé Gemini</button>
          </div>
          <div id="gemini-test-res" style="font-size:12px;margin-top:8px;min-height:16px"></div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">
            Utilisée pour : analyse prospect, préparation visite, email de prospection, résumé CR.
          </p>
        </div>

        <!-- PARAMÈTRES SYSTÈME -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Paramètres système (⚙️_PARAMS — lecture)</div>
          <div class="grille-identite">
            ${this.state.params.map(p => `
              <div class="id-ligne"><span>${p.Parametre}</span><strong>${p.Valeur}</strong></div>`).join('')}
          </div>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">Modifiables directement dans le Google Sheet EMPOWER MDB.</p>
        </div>

        <!-- EXPORTS CSV — REPORTING THÉMATIQUE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📥 Exports CSV — Reporting thématique</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:14px">
            7 exports organisés par thème. Données en temps réel depuis Google Sheets.
            Chaque export est tracé dans 📊_ACTIONS avec l'identité de l'exporteur.
          </p>
          ${this._renderExports()}
        </div>

        <!-- RGPD -->
        <div class="bloc-fiche">
          <div class="bloc-titre">🔒 RGPD — Purge des données personnelles</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">
            Supprime définitivement les appels (📞_PHONING) et visites (🗺️_VISITES) d'un CDS.
            Les comptes et prospects ne sont pas affectés.<br>
            <strong>Audio : jamais stocké côté serveur</strong> — seule la transcription texte est conservée.
          </p>
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

        <!-- MAINTENANCE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Maintenance</div>
          <button class="btn-secondaire" onclick="VueAdmin.viderCache()">🗑️ Vider le cache local (IndexedDB)</button>
        </div>
      </div>
    `;
  },
};
