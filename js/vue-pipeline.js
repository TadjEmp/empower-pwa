// ═══════════════════════════════════════
//  vue-pipeline.js — EMPOWER TRACKER V2.1 (B3)
//  Workflow : SAISIE → ASSIGNE → EN_COURS → COMPTE_CREE → INTEGRE / ARCHIVE
//  CHANNEL_MANAGER (Alexandra, Flavie) + ADMIN : saisie, attribution, avancement
//  CDS : lecture + avancement de ses propres leads
//  Source : 📋_PROSPECTS · ⚙️_PARAMS (liste CDS dynamique)
// ═══════════════════════════════════════

window.VuePipeline = {

  STATUTS: [
    { id: 'SAISIE',      lbl: 'À traiter',    coul: 'var(--c-primary)' },
    { id: 'ASSIGNE',     lbl: 'Assigné',      coul: 'var(--c-accent)' },
    { id: 'EN_COURS',    lbl: 'En cours',     coul: 'var(--c-warning)' },
    { id: 'COMPTE_CREE', lbl: 'Compte créé',  coul: '#9333ea' },
    { id: 'INTEGRE',     lbl: 'Intégré ✅',   coul: 'var(--c-success)' },
    { id: 'ARCHIVE',     lbl: 'Archivé',      coul: 'var(--c-text-2)' },
  ],

  // Fallback si ⚙️_PARAMS ne contient pas les CDS
  CDS_FALLBACK: [ { pin: 4001, nom: 'Lyes' }, { pin: 4002, nom: 'Mehdi' }, { pin: 4003, nom: 'Johanne' }, { pin: 1000, nom: 'Tadjidine' } ],
  CDS: [],

  LIMITE_COL: 20,

  state: null,

  _chargerCDS(params, objectifs) {
    // ⚙️_PARAMS réel : PINS_CDS='4001,4002,4003' + PIN_MANAGER='1000'
    // Les noms viennent de 🎯_OBJECTIFS_PRIMES.Nom_CDS
    const paramMap = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
    const pinsCDS   = String(paramMap.PINS_CDS || '').split(',').map(p => Number(p.trim())).filter(Boolean);
    const pinMgr    = Number(paramMap.PIN_MANAGER || 1000);
    const allPins   = [pinMgr, ...pinsCDS].filter((v, i, a) => a.indexOf(v) === i);
    // Noms depuis objectifs (Nom_CDS/PIN_CDS)
    const nomMap = {};
    (objectifs || []).forEach(o => { if (o.PIN_CDS) nomMap[Number(o.PIN_CDS)] = o.Nom_CDS; });
    const fallbackNoms = {1000:'Tadjidine',4001:'Lyes',4002:'Mehdi',4003:'Johanne'};
    const cds = allPins.map(pin => ({ pin, nom: nomMap[pin] || fallbackNoms[pin] || `PIN ${pin}` }));
    this.CDS = cds.length > 0 ? cds : this.CDS_FALLBACK;
  },

  // CHANNEL_MANAGER (Alexandra, Flavie) et ADMIN peuvent gérer les leads
  _peutGerer() { return Session.voitTout() || Session.estChannel(); },

  async init() {
    this.state = {
      leads: [], chargement: true, envoiEnCours: false,
      recherche: '', filtreCDS: 'TOUS', filtrePotentiel: 'TOUS',
      colonnesEtendues: {},
      modal: null,
    };
    this.render();
    try {
      const [raw, params, objectifs] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
      ]);
      this._chargerCDS(params, objectifs);
      this.state.leads = raw
        .map(p => ({ ...p, _statut: this._statutDe(p) }))
        .filter(p => this._peutGerer() || Session.voitTout() || Number(p.PIN_CDS_Assigne) === Session.pin);
      this.state.chargement = false;
      this.render();
    } catch(e) {
      if (!this.CDS.length) this.CDS = this.CDS_FALLBACK;
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  // Statut pipeline — STATUT_EMPOWER prioritaire, sinon déduit des flags historiques
  _statutDe(p) {
    const s = String(p.STATUT_EMPOWER || '').toUpperCase();
    if (this.STATUTS.some(x => x.id === s)) return s;
    if (String(p.Flag_converti).toUpperCase() === 'TRUE') return 'INTEGRE';
    if (p.PIN_CDS_Assigne) {
      return String(p.Flag_traite).toUpperCase() === 'TRUE' ? 'EN_COURS' : 'ASSIGNE';
    }
    return 'SAISIE';
  },

  get leadsFiltres() {
    let l = this.state.leads;
    const q = normaliserNom(this.state.recherche);
    if (q) l = l.filter(p => normaliserNom(p.Nom_Compte).includes(q) || normaliserNom(p.Ville).includes(q));
    if (this.state.filtreCDS !== 'TOUS') l = l.filter(p => String(p.PIN_CDS_Assigne) === this.state.filtreCDS);
    if (this.state.filtrePotentiel !== 'TOUS') l = l.filter(p => (p.POTENTIEL || '') === this.state.filtrePotentiel);
    return l;
  },

  _nomCDS(pin) { return (this.CDS.length ? this.CDS : this.CDS_FALLBACK).find(c => c.pin === Number(pin))?.nom || (pin ? `PIN ${pin}` : '—'); },

  _retardWelcomePack(p) {
    if (p._statut !== 'COMPTE_CREE' || p.WELCOME_PACK_DATE) return false;
    const ref = p.Timestamp || p.Date_Import;
    return ref && (Date.now() - new Date(ref).getTime()) / 86400000 > 14;
  },

  // ── Actions ──
  ouvrirLead(id) {
    this.state.modal = { type: 'lead', lead: this.state.leads.find(l => String(l.ID_Prospect) === String(id)) };
    this.render();
  },
  ouvrirSaisie() { this.state.modal = { type: 'saisie' }; this.render(); },
  fermerModal()  { this.state.modal = null; this.render(); },

  async iaAppeler(slot, leadId) {
    const lead = this.state.leads.find(l => String(l.ID_Prospect) === String(leadId));
    if (!lead) return;
    const zone = document.getElementById('ia-zone');
    if (!zone) return;
    const LABELS = { T01: '🔍 Analyse', T02: '📋 Préparation visite', T04: '✉️ Email', T05: '📝 Résumé CR' };
    zone.style.display = 'block';
    zone.style.color = 'var(--c-text-2)';
    zone.textContent = `⏳ ${LABELS[slot] || slot} en cours…`;
    try {
      let texte;
      if (slot === 'T01') texte = await GeminiAPI.t01_analyser(lead);
      else if (slot === 'T02') texte = await GeminiAPI.t02_preparerVisite(lead);
      else if (slot === 'T04') texte = await GeminiAPI.t04_email(lead);
      else if (slot === 'T05') texte = await GeminiAPI.t05_resumeCR(lead);
      zone.style.color = 'var(--c-text)';
      zone.textContent = texte || '(réponse vide)';
    } catch (e) {
      zone.style.color = 'var(--c-danger)';
      zone.textContent = '❌ ' + e.message;
    }
  },

  async deplacer(id, statut) {
    const lead = this.state.leads.find(l => String(l.ID_Prospect) === String(id));
    if (!lead) return;
    const champs = { STATUT_EMPOWER: statut };
    if (statut === 'COMPTE_CREE' && !lead.WELCOME_PACK_DATE) champs.WELCOME_PACK_DATE = new Date().toISOString().slice(0, 10);
    if (statut === 'INTEGRE') {
      champs.Flag_converti = 'TRUE';
      if (!lead.PREMIERE_COMMANDE_DATE) champs.PREMIERE_COMMANDE_DATE = new Date().toISOString().slice(0, 10);
    }
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', id, champs);
      Object.assign(lead, champs, { _statut: statut });
      this.state.modal = null;
      Toast.afficher(`✅ ${lead.Nom_Compte} → ${this.STATUTS.find(s => s.id === statut)?.lbl || statut}`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  async attribuer(id, pin) {
    const lead = this.state.leads.find(l => String(l.ID_Prospect) === String(id));
    if (!lead || !pin) return;
    try {
      const r = await fetch(SheetsAPI.BASE_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attribuerLead', token: SheetsAPI.TOKEN, id, cdsPin: Number(pin), cdsNom: this._nomCDS(pin) }),
      }).then(x => x.json());
      if (!r.ok) throw new Error(r.erreur);
      await SheetsAPI.viderCache('EMPOWER_MDB', '📋_PROSPECTS');
      Object.assign(lead, { PIN_CDS_Assigne: Number(pin), STATUT_EMPOWER: 'ASSIGNE', _statut: 'ASSIGNE' });
      this.state.modal = null;
      Toast.afficher(`🎯 ${lead.Nom_Compte} → ${this._nomCDS(pin)}`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  async saisirLead(e) {
    e.preventDefault();
    if (this.state.envoiEnCours) return;
    const v = id => document.getElementById(id)?.value?.trim() || '';
    if (!v('nl-nom')) { Toast.afficher('Nom du prospect requis', 'warning'); return; }
    this.state.envoiEnCours = true;
    this.render();

    const nomSaisi = v('nl-nom').toUpperCase();

    // GEM-T02 — Détection doublon avant création
    try {
      const existants = [...this.state.leads, ...[]];
      const rawRes = await GeminiAPI.gemT02_detectionDoublon(nomSaisi, existants);
      const res = safeJSON(rawRes);
      if (res?.doublon_probable && res.score > 70) {
        const confirmer = confirm(
          `⚠️ Doublon probable détecté !\n\nCompte similaire existant : "${res.nom_similaire}"\nSimilarité : ${res.score}%\n${res.explication||''}\n\nContinuer quand même la création ?`
        );
        if (!confirmer) {
          this.state.envoiEnCours = false;
          this.render();
          return;
        }
      }
    } catch { /* GEM-T02 optionnel — on continue si erreur */ }

    const lead = {
      ID_Prospect: genId('PROS'),
      Nom_Compte: nomSaisi, Ville: v('nl-ville'), Code_Postal: v('nl-cp'),
      Tel: v('nl-tel'), Email: v('nl-email'),
      PIN_CDS_Assigne: '', Source_Import: 'ESI_PIPELINE',
      FLAG_ACTION: 'SAISIE', CANAL: v('nl-canal'),
      Note_initiale: v('nl-note'), Date_prochaine_action: '',
      Flag_traite: 'FALSE', Flag_converti: 'FALSE',
      Date_Import: new Date().toISOString().slice(0, 10),
      Timestamp: new Date().toISOString(),
      STATUT_EMPOWER: 'SAISIE', POTENTIEL: v('nl-potentiel'),
      ORIGINE: v('nl-origine'), CONTACT_NOM: v('nl-contact'), CONTACT_FONCTION: v('nl-fonction'),
    };
    try {
      await SheetsAPI.ecrire('EMPOWER_MDB', '📋_PROSPECTS', lead);
      this.state.leads.unshift({ ...lead, _statut: 'SAISIE' });
      this.state.modal = null;
      Toast.afficher('✅ Lead créé : ' + lead.Nom_Compte, 'succes');

      // GEM-T01 — Enrichissement automatique post-création (asynchrone, non bloquant)
      GeminiAPI.gemT01_enrichirLead(lead).then(raw => {
        const enrichi = safeJSON(raw);
        if (!enrichi) return;
        const maj = {};
        if (enrichi.potentiel && !lead.POTENTIEL)       maj.POTENTIEL = enrichi.potentiel;
        if (enrichi.canal_probable && !lead.CANAL)       maj.CANAL = enrichi.canal_probable;
        if (enrichi.type_revendeur_probable)             maj.Type_Revendeur = enrichi.type_revendeur_probable;
        if (enrichi.angle_approche)                      maj.Note_initiale = (lead.Note_initiale ? lead.Note_initiale + '\n' : '') + '[IA] ' + enrichi.angle_approche;
        if (Object.keys(maj).length) {
          SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', lead.ID_Prospect, maj).then(() => {
            Object.assign(lead, maj);
            const local = this.state.leads.find(l => l.ID_Prospect === lead.ID_Prospect);
            if (local) Object.assign(local, maj);
            Toast.afficher(`✨ Lead enrichi par Gemini (potentiel : ${maj.POTENTIEL||lead.POTENTIEL})`, 'info', 3000);
            this.render();
          }).catch(() => {});
        }
      }).catch(() => {});
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
    this.state.envoiEnCours = false;
    this.render();
  },

  etendre(statut) {
    this.state.colonnesEtendues[statut] = true;
    this.render();
  },

  setRecherche: debounce(function(v) {
    VuePipeline.state.recherche = v;
    // Quand on tape une recherche, on affiche tout pour ne rien masquer
    if (v) VuePipeline.state.colonnesEtendues = { SAISIE:true, ASSIGNE:true, EN_COURS:true, COMPTE_CREE:true, INTEGRE:true, ARCHIVE:true };
    else    VuePipeline.state.colonnesEtendues = {};
    VuePipeline.render();
  }, 250),

  // ── RENDER ──
  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement du pipeline…</div>';
      return;
    }
    const leads = this.leadsFiltres;
    const peutGerer = this._peutGerer();
    const cdsList = this.CDS.length ? this.CDS : this.CDS_FALLBACK;

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>EMPOWER TRACKER</h1>
        <span class="badge-compteur">${leads.length} leads</span>
      </header>

      <div class="barre-filtres">
        <input type="search" placeholder="🔍 Rechercher un prospect…" value="${this.state.recherche}"
               style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;width:100%"
               oninput="VuePipeline.setRecherche(this.value)"/>
        <div class="filtres-statut">
          ${peutGerer ? `
          <select onchange="VuePipeline.state.filtreCDS=this.value;VuePipeline.render()">
            <option value="TOUS">Tous CDS</option>
            ${cdsList.map(c => `<option value="${c.pin}" ${this.state.filtreCDS == c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
          </select>` : ''}
          <select onchange="VuePipeline.state.filtrePotentiel=this.value;VuePipeline.render()">
            <option value="TOUS">Tout potentiel</option>
            ${['Fort', 'Moyen', 'Faible'].map(p => `<option ${this.state.filtrePotentiel === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>

      <p style="font-size:11px;color:var(--c-text-2);text-align:center;padding:6px">← Glisser pour voir les statuts →</p>

      <div class="kanban">
        ${this.STATUTS.map(st => {
          const col = leads
            .filter(l => l._statut === st.id)
            .sort((a, b) => {
              // Alertes WP en premier, puis tri par date décroissante
              const aA = this._retardWelcomePack(a) ? 0 : 1;
              const bA = this._retardWelcomePack(b) ? 0 : 1;
              if (aA !== bA) return aA - bA;
              return new Date(b.Timestamp || b.Date_Import || 0) - new Date(a.Timestamp || a.Date_Import || 0);
            });
          const etendue = !!this.state.colonnesEtendues[st.id];
          const affichees = etendue ? col : col.slice(0, this.LIMITE_COL);
          const masques = col.length - affichees.length;
          return `
          <div class="kanban-col">
            <div class="kanban-col-head">
              <span class="kanban-dot" style="background:${st.coul}"></span>
              <span class="kanban-col-titre">${st.lbl}</span>
              <span class="badge-compteur">${col.length}</span>
            </div>
            ${affichees.map(l => `
              <div class="kanban-carte ${this._retardWelcomePack(l) ? 'kanban-alerte' : ''}"
                   onclick="VuePipeline.ouvrirLead('${l.ID_Prospect}')">
                <div class="kanban-carte-nom">${l.Nom_Compte}</div>
                <div class="kanban-carte-meta">
                  ${l.POTENTIEL ? `<span class="pot-pill pot-${(l.POTENTIEL||'').toLowerCase()}">${l.POTENTIEL}</span>` : ''}
                  <span>👤 ${this._nomCDS(l.PIN_CDS_Assigne)}</span>
                </div>
                ${l.Note_initiale ? `<div class="kanban-carte-note">${String(l.Note_initiale).slice(0, 80)}</div>` : ''}
                ${this._retardWelcomePack(l) ? '<div class="kanban-carte-note" style="color:var(--c-danger);font-weight:600">⚠️ Welcome Pack J+14 dépassé</div>' : ''}
                <div class="kanban-carte-pied" style="display:flex;align-items:center">🕐 ${dateRelative(l.Timestamp || l.Date_Import)} <span class="kanban-voir">Voir détail →</span></div>
              </div>`).join('')}
            ${masques > 0 ? `
              <div class="kanban-voir-plus" onclick="VuePipeline.etendre('${st.id}')">
                +${masques} autres · voir tous
              </div>` : ''}
            ${col.length === 0 ? '<div class="kanban-vide">—</div>' : ''}
          </div>`;
        }).join('')}
      </div>

      ${peutGerer ? '<button class="fab" onclick="VuePipeline.ouvrirSaisie()" title="Nouveau lead" style="bottom:140px">＋</button>' : ''}
      ${NavBar('tracker')}
      ${this._renderModal()}
    `;
  },

  _renderModal() {
    const m = this.state.modal;
    if (!m) return '';
    if (m.type === 'saisie') {
      return `
      <div class="modal-overlay" onclick="if(event.target===this)VuePipeline.fermerModal()">
        <div class="modal">
          <h3>➕ Nouveau lead</h3>
          <form onsubmit="VuePipeline.saisirLead(event)">
            <label>Nom du prospect *<input id="nl-nom" required placeholder="ex : MICRO PLUS INFORMATIQUE"/></label>
            <label>Contact<input id="nl-contact" placeholder="Prénom Nom"/></label>
            <label>Fonction<input id="nl-fonction" placeholder="Gérant…"/></label>
            <label>Téléphone<input id="nl-tel" inputmode="tel"/></label>
            <label>Email<input id="nl-email" type="email"/></label>
            <div style="display:flex;gap:10px">
              <label style="flex:2">Ville<input id="nl-ville"/></label>
              <label style="flex:1">CP<input id="nl-cp" inputmode="numeric"/></label>
            </div>
            <label>Canal<select id="nl-canal"><option>IT</option><option>Retail</option><option>Autre</option></select></label>
            <label>Potentiel<select id="nl-potentiel"><option>Fort</option><option selected>Moyen</option><option>Faible</option></select></label>
            <label>Origine<select id="nl-origine"><option>Flavie</option><option>Alexandra</option><option>FDV</option><option>Web</option></select></label>
            <label>Note<textarea id="nl-note" rows="2"></textarea></label>
            <div class="modal-btns">
              <button type="button" onclick="VuePipeline.fermerModal()">Annuler</button>
              <button type="submit" class="btn-primaire" ${this.state.envoiEnCours ? 'disabled' : ''}>
                ${this.state.envoiEnCours ? 'Création…' : 'Créer le lead'}</button>
            </div>
          </form>
        </div>
      </div>`;
    }
    // Fiche lead : attribution + déplacement + IA Gemini
    const l = m.lead;
    if (!l) return '';
    const peutGerer = this._peutGerer();
    const cdsList = this.CDS.length ? this.CDS : this.CDS_FALLBACK;
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePipeline.fermerModal()">
      <div class="modal">
        <h3>${l.Nom_Compte}</h3>
        <div class="q-recap" style="margin-bottom:14px">
          <div class="q-recap-ligne"><span>Statut</span><strong>${this.STATUTS.find(s => s.id === l._statut)?.lbl}</strong></div>
          <div class="q-recap-ligne"><span>CDS</span><strong>${this._nomCDS(l.PIN_CDS_Assigne)}</strong></div>
          <div class="q-recap-ligne"><span>Potentiel</span><strong>${l.POTENTIEL || '—'}</strong></div>
          <div class="q-recap-ligne"><span>Ville</span><strong>${l.Ville || '—'} ${l.Code_Postal || ''}</strong></div>
          ${l.Tel ? `<div class="q-recap-ligne"><span>Tél</span><strong><a class="lien-tel" href="tel:${String(l.Tel).replace(/\s/g, '')}">${l.Tel}</a></strong></div>` : ''}
          ${l.CONTACT_NOM ? `<div class="q-recap-ligne"><span>Contact</span><strong>${l.CONTACT_NOM} ${l.CONTACT_FONCTION ? '· ' + l.CONTACT_FONCTION : ''}</strong></div>` : ''}
          ${l.WELCOME_PACK_DATE ? `<div class="q-recap-ligne"><span>Welcome Pack</span><strong>${l.WELCOME_PACK_DATE}</strong></div>` : ''}
          ${l.Note_initiale ? `<div style="font-size:13px;padding-top:8px">${l.Note_initiale}</div>` : ''}
        </div>

        ${peutGerer ? `
        <label>Attribuer à un CDS
          <select id="attr-cds" onchange="VuePipeline.attribuer('${l.ID_Prospect}', this.value)">
            <option value="">— choisir —</option>
            ${cdsList.map(c => `<option value="${c.pin}" ${Number(l.PIN_CDS_Assigne) === c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
          </select>
        </label>` : ''}

        <label style="margin-top:8px">Déplacer vers</label>
        <div class="q-chips">
          ${this.STATUTS.filter(s => s.id !== l._statut).map(s => `
            <button type="button" class="q-chip" onclick="VuePipeline.deplacer('${l.ID_Prospect}','${s.id}')">${s.lbl}</button>`).join('')}
        </div>

        <!-- IA Gemini — slots T01/T02/T04/T05 (B10) -->
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--c-border)">
          <div style="font-size:11px;color:var(--c-text-2);margin-bottom:6px;font-weight:700;letter-spacing:.04em">✨ ASSISTANT IA GEMINI</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <button class="btn-secondaire" style="font-size:12px;padding:8px;text-align:left"
                    onclick="VuePipeline.iaAppeler('T01','${l.ID_Prospect}')">🔍 Analyser</button>
            <button class="btn-secondaire" style="font-size:12px;padding:8px;text-align:left"
                    onclick="VuePipeline.iaAppeler('T02','${l.ID_Prospect}')">📋 Préparer visite</button>
            <button class="btn-secondaire" style="font-size:12px;padding:8px;text-align:left"
                    onclick="VuePipeline.iaAppeler('T04','${l.ID_Prospect}')">✉️ Email prospect</button>
            <button class="btn-secondaire" style="font-size:12px;padding:8px;text-align:left"
                    onclick="VuePipeline.iaAppeler('T05','${l.ID_Prospect}')">📝 Résumé CR</button>
          </div>
          <div id="ia-zone"
               style="display:none;margin-top:10px;font-size:12px;line-height:1.6;
                      padding:10px 12px;background:var(--c-bg);border-radius:var(--radius-sm);
                      white-space:pre-wrap;border:1px solid var(--c-border);color:var(--c-text)"></div>
        </div>

        <div class="modal-btns">
          <button type="button" onclick="VuePipeline.fermerModal()">Fermer</button>
          <button type="button" class="btn-primaire" onclick="Router.aller('#/phoning/${l.ID_Prospect}')">📞 Appeler</button>
        </div>
      </div>
    </div>`;
  },
};
