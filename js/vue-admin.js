// ═══════════════════════════════════════
//  vue-admin.js — Administration v9
//  Exports thématiques enrichis + vue équipe
// ═══════════════════════════════════════

window.VueAdmin = {

  state: null,

  async init() {
    // Alexandra (CHANNEL_MANAGER) garde son espace exports/leads ;
    // seul ADMIN voit le bloc clés API (rendu dans la branche estManager ci-dessous).
    if (!Session.estManager() && !Session.estChannel()) { Router.aller('#/dashboard'); return; }
    this.state = {
      chargement: true, objectifs: [], params: [], envoiEnCours: false,
      alexTab: 'exports',   // 'exports' | 'leads'
      leadEnvoi: false,
      formLead: this._initFormLead(),
      importEnCours: false,
      importResultat: null,
      syncSellInEnCours: false,
      syncSellInResultat: null,
      syncSellInNonMatcher: [],
      suivi: { chargement: false, leads: [], filtreStatut: 'TOUS', filtreCDS: 'TOUS' },
      // BLOC 10 — filtre Pickup Date pour exports (manager + channel)
      filtrePickupDe: '',
      filtrePickupA: '',
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

  setAlexTab(tab) {
    this.state.alexTab = tab;
    if (tab === 'suivi' && !this.state.suivi.leads.length && !this.state.suivi.chargement) {
      this._chargerSuivi();
    } else {
      this.render();
    }
  },

  async _chargerSuivi() {
    this.state.suivi.chargement = true;
    this.render();
    try {
      const raw = await SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS');
      this.state.suivi.leads = raw.filter(p =>
        String(p.deleted || '').toUpperCase() !== 'TRUE' &&
        String(p.Source_Import || '') === 'ESI_PIPELINE'
      );
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
    this.state.suivi.chargement = false;
    this.render();
  },

  _renderSuivi() {
    const sv = this.state.suivi;
    if (sv.chargement) return '<div class="spinner-centre">Chargement du suivi…</div>';

    const STATUTS = [
      { id: 'SAISIE',      lbl: 'À traiter',   coul: 'var(--c-primary)' },
      { id: 'ASSIGNE',     lbl: 'Assigné',     coul: 'var(--c-accent,#0099cc)' },
      { id: 'EN_COURS',    lbl: 'En cours',    coul: 'var(--c-warning,#f59e0b)' },
      { id: 'COMPTE_CREE', lbl: 'Compte créé', coul: '#9333ea' },
      { id: 'INTEGRE',     lbl: 'Intégré ✅',  coul: 'var(--c-success,#1a9e5c)' },
      { id: 'ARCHIVE',     lbl: 'Archivé',     coul: 'var(--c-text-2)' },
    ];
    const CDS_NOMS = { 1000:'Tadjidine', 4001:'Lyes', 4002:'Mehdi', 4003:'Johanne' }; // BLOC 1 : 4004 Anthony supprimé

    let leads = sv.leads;
    if (sv.filtreCDS !== 'TOUS')    leads = leads.filter(l => String(l.PIN_CDS_Assigne) === sv.filtreCDS);
    if (sv.filtreStatut !== 'TOUS') leads = leads.filter(l => l.STATUT_EMPOWER === sv.filtreStatut);

    // Trier : date dépassée d'abord, puis par prochaine action
    leads = [...leads].sort((a, b) => {
      const now = Date.now();
      const dA = a.Date_prochaine_action ? new Date(a.Date_prochaine_action).getTime() : 9e15;
      const dB = b.Date_prochaine_action ? new Date(b.Date_prochaine_action).getTime() : 9e15;
      const retA = dA < now ? 0 : 1;
      const retB = dB < now ? 0 : 1;
      if (retA !== retB) return retA - retB;
      return dA - dB;
    });

    // KPIs globaux (sur tous les leads, pas filtrés)
    const total = sv.leads.length;
    const enAttente = sv.leads.filter(l => ['SAISIE','ASSIGNE'].includes(l.STATUT_EMPOWER)).length;
    const enCours   = sv.leads.filter(l => ['EN_COURS','COMPTE_CREE'].includes(l.STATUT_EMPOWER)).length;
    const integres  = sv.leads.filter(l => l.STATUT_EMPOWER === 'INTEGRE').length;

    // Pins uniques pour filtre CDS
    const cdsPins = [...new Set(sv.leads.map(l => l.PIN_CDS_Assigne).filter(Boolean))];

    return `
      <div class="bloc-fiche">
        <div class="bloc-titre">📊 Suivi Pipeline EMPOWER</div>
        <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">
          ${total} leads · Mise à jour en temps réel par les CDS terrain.
        </p>

        <!-- KPIs -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
          <div style="padding:10px;border-radius:8px;background:rgba(255,165,0,.08);text-align:center">
            <div style="font-size:24px;font-weight:800;color:var(--c-warning,#f59e0b)">${enAttente}</div>
            <div style="font-size:10px;color:var(--c-text-2);margin-top:2px">En attente</div>
          </div>
          <div style="padding:10px;border-radius:8px;background:rgba(147,51,234,.08);text-align:center">
            <div style="font-size:24px;font-weight:800;color:#9333ea">${enCours}</div>
            <div style="font-size:10px;color:var(--c-text-2);margin-top:2px">En cours</div>
          </div>
          <div style="padding:10px;border-radius:8px;background:rgba(26,158,92,.08);text-align:center">
            <div style="font-size:24px;font-weight:800;color:var(--c-success,#1a9e5c)">${integres}</div>
            <div style="font-size:10px;color:var(--c-text-2);margin-top:2px">Intégrés ✅</div>
          </div>
        </div>

        <!-- Filtres -->
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <select style="flex:1;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px;font-size:13px"
                  onchange="VueAdmin.state.suivi.filtreCDS=this.value;VueAdmin.render()">
            <option value="TOUS">Tous les CDS</option>
            ${cdsPins.map(pin => `<option value="${pin}" ${sv.filtreCDS == pin ? 'selected':''}>${CDS_NOMS[Number(pin)] || (window.resolveCDS ? resolveCDS(pin) : pin)}</option>`).join('')}
          </select>
          <select style="flex:1;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px;font-size:13px"
                  onchange="VueAdmin.state.suivi.filtreStatut=this.value;VueAdmin.render()">
            <option value="TOUS">Tous statuts</option>
            ${STATUTS.map(s => `<option value="${s.id}" ${sv.filtreStatut===s.id?'selected':''}>${s.lbl}</option>`).join('')}
          </select>
        </div>

        <div style="font-size:11px;color:var(--c-text-2);margin-bottom:8px">${leads.length} résultat(s)</div>

        <!-- Liste -->
        ${leads.map(l => {
          const st = STATUTS.find(s => s.id === l.STATUT_EMPOWER) || STATUTS[0];
          const cdsNom = CDS_NOMS[Number(l.PIN_CDS_Assigne)] || l.PIN_CDS_Assigne || '—';
          const dateP  = l.Date_prochaine_action ? String(l.Date_prochaine_action).slice(0,10) : null;
          const retard = dateP && new Date(dateP) < new Date();
          // Extraire la première ligne du log (entrée la plus récente)
          const noteLines = String(l.Note_initiale || '').split('\n');
          const noteRecente = noteLines[0]?.trim().slice(0, 80) || '';
          const packOk = l.WELCOME_PACK_DATE;
          const packAttend = !packOk && ['COMPTE_CREE','INTEGRE'].includes(l.STATUT_EMPOWER);
          return `
            <div style="padding:10px 0;border-bottom:1px solid var(--c-border)">
              <div style="display:flex;align-items:flex-start;gap:8px">
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:700;margin-bottom:4px">${l.Nom_Compte}</div>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:4px">
                    <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${st.coul};color:#fff;font-weight:700">${st.lbl}</span>
                    ${l.POTENTIEL ? `<span style="font-size:10px;padding:2px 7px;border-radius:99px;background:var(--c-bg);border:1px solid var(--c-border);color:var(--c-text-2)">${l.POTENTIEL}</span>` : ''}
                    <span style="font-size:11px;color:var(--c-text-2)">👤 ${cdsNom}</span>
                  </div>
                  ${noteRecente ? `<div style="font-size:11px;color:var(--c-text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${noteRecente}</div>` : ''}
                </div>
                <div style="text-align:right;flex-shrink:0;min-width:64px">
                  ${dateP ? `<div style="font-size:11px;font-weight:${retard?'700':'400'};color:${retard?'var(--c-danger)':'var(--c-text-2)'}">
                    ${retard ? '⚠️ ' : '⏰ '}${dateRelative(dateP)}
                  </div>` : ''}
                  ${packOk ? `<div style="font-size:10px;color:var(--c-success,#1a9e5c)">📦 Pack ✅</div>`
                           : packAttend ? `<div style="font-size:10px;color:var(--c-warning,#f59e0b)">📦 Pack ⏳</div>` : ''}
                </div>
              </div>
            </div>`;
        }).join('')}

        ${leads.length === 0 ? `<div style="text-align:center;padding:28px;color:var(--c-text-2)">Aucun lead pour ces filtres</div>` : ''}

        <button class="btn-secondaire" style="width:100%;margin-top:14px"
                onclick="VueAdmin.state.suivi.leads=[];VueAdmin._chargerSuivi()">🔄 Actualiser</button>
      </div>`;
  },

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
        STATUT_EMPOWER:    f.cdsAssigne ? 'ASSIGNE' : 'SAISIE',
        FLAG_ACTION:       f.cdsAssigne ? 'ASSIGNE' : 'A_TRAITER',
        Flag_traite:       'FALSE',
        Flag_converti:     'FALSE',
        Source_Import:     'ESI_PIPELINE',
        Date_Import:       dateISOLocale(),
        Timestamp:         new Date().toISOString(),
        created_by:        Session.nom,
      };

      await SheetsAPI.ecrire('EMPOWER_MDB', '📋_PROSPECTS', lead);
      // Bloc 4 : si un CDS est assigné, déclencher l'action backend attribuerLead
      // → émet la notif J0 (LEAD_ASSIGNE) au CDS. Sans CDS, le lead reste "à traiter".
      if (f.cdsAssigne) {
        await SheetsAPI._fetchRetry(SheetsAPI.BASE_URL, 'POST', 2, {
          action: 'attribuerLead', token: SheetsAPI.TOKEN,
          id: lead.ID_Prospect, cdsPin: f.cdsAssigne,
          cdsNom: (window.resolveCDS ? resolveCDS(f.cdsAssigne) : f.cdsAssigne),
        });
      }
      await this._logExport(`LEAD_CREE:${f.nom}`, 1);
      const _cdsLbl = window.resolveCDS ? resolveCDS(f.cdsAssigne) : f.cdsAssigne;
      Toast.afficher(`✅ Lead créé — ${f.nom}${f.cdsAssigne ? ` → assigné à ${_cdsLbl}` : ' (à traiter)'}`, 'succes', 5000);
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

  async importerDepuisTracker() {
    if (this.state.importEnCours) return;
    const ok = confirm('🔄 Synchroniser EMPOWER TRACKER → PROSPECTS ?\n\nLes revendeurs déjà présents en ESI_PIPELINE seront ignorés.\nLes nouveaux seront créés avec Source_Import=ESI_PIPELINE.');
    if (!ok) return;
    this.state.importEnCours  = true;
    this.state.importResultat = null;
    this.render();
    try {
      const data = await SheetsAPI._fetchRetry(SheetsAPI.BASE_URL, 'POST', 2,
        { action: 'importTrackerDrive', token: SheetsAPI.TOKEN });
      if (!data.ok) throw new Error(data.erreur || 'Erreur Apps Script');
      this.state.importResultat = { ok: true, message: data.message };
      Toast.afficher(`✅ ${data.crees} lead(s) importés — ${data.skips} doublon(s) ignorés`, 'succes', 6000);
      await SheetsAPI.viderCache('EMPOWER_MDB', '📋_PROSPECTS');
    } catch(e) {
      this.state.importResultat = { ok: false, message: e.message };
      Toast.afficher('❌ Import : ' + e.message, 'erreur');
    }
    this.state.importEnCours = false;
    this.render();
  },

  async syncSellIn() {
    if (this.state.syncSellInEnCours) return;
    const ok = confirm('📊 Synchroniser les données Sell-In depuis Google Drive ?\n\nCela met à jour les CA (FY25, FY26, Q1FY27) et les statuts dans Comptes.');
    if (!ok) return;
    this.state.syncSellInEnCours  = true;
    this.state.syncSellInResultat = null;
    this.state.syncSellInNonMatcher = [];
    this.render();
    try {
      const { data, error } = await SheetsAPI._sb.functions.invoke('sync-sellin', { method: 'POST' });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Erreur Edge Function sync-sellin');
      const matched   = data.comptesMisAJour ?? data.sellinLignes ?? '?';
      const nonMatch  = Array.isArray(data.nonMatcher) ? data.nonMatcher : [];
      const ts        = data.timestamp ? new Date(data.timestamp).toLocaleString('fr-FR') : '';
      this.state.syncSellInResultat   = { ok: true, matched, nonMatch: nonMatch.length, ts };
      this.state.syncSellInNonMatcher = nonMatch;
      Toast.afficher(`✅ Sell-In synchronisé — ${matched} comptes mis à jour`, 'succes', 6000);
      await SheetsAPI.viderCache('EMPOWER_MDB', '🏢_COMPTES');
    } catch(e) {
      this.state.syncSellInResultat = { ok: false, message: e.message || String(e) };
      Toast.afficher('❌ Sync sell-in : ' + (e.message || e), 'erreur');
    }
    this.state.syncSellInEnCours = false;
    this.render();
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

  // Toggle affichage/masquage d'un champ clé (password ⇄ text)
  toggleCleVisible(inputId, btnId) {
    const inp = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!inp) return;
    const visible = inp.type === 'text';
    inp.type = visible ? 'password' : 'text';
    if (btn) btn.textContent = visible ? '👁️ Afficher' : '🙈 Masquer';
  },

  async sauverCleGroq() {
    const v = document.getElementById('admin-groq-key').value.trim();
    // Ne pas écraser une clé existante si le champ est vide
    if (!v) { Toast.afficher('Champ vide — la clé existante est conservée', 'warning'); return; }
    // Validation format Groq (préfixe gsk_) avant envoi
    if (!v.startsWith('gsk_')) {
      Toast.afficher('Format invalide : une clé Groq commence par « gsk_ »', 'warning');
      return;
    }
    const btn = document.getElementById('btn-groq-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
    try {
      await GroqAPI.sauverCle(v);
      document.getElementById('admin-groq-key').value = '';
      Toast.afficher('Clé enregistrée avec succès', 'succes');
    } catch(e) {
      // Message EXACT renvoyé par le backend (pas "failed")
      Toast.afficher('❌ ' + (e && e.message ? e.message : 'Erreur inconnue'), 'erreur');
    }
    finally { if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer la clé Groq'; } }
  },

  async sauverCleGemini() {
    const v = document.getElementById('admin-gemini-key').value.trim();
    // Ne pas écraser une clé existante si le champ est vide
    if (!v) { Toast.afficher('Champ vide — la clé existante est conservée', 'warning'); return; }
    // Validation format Gemini (préfixe AIza ou Aq — v5.0) avant envoi
    if (!v.startsWith('AIza') && !v.startsWith('Aq')) {
      Toast.afficher('Format invalide : une clé Gemini commence par « AIza » ou « Aq »', 'warning');
      return;
    }
    const btn = document.getElementById('btn-gemini-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
    try {
      await GeminiAPI.sauverCle(v);
      document.getElementById('admin-gemini-key').value = '';
      Toast.afficher('Clé enregistrée avec succès', 'succes');
    } catch(e) {
      // Message EXACT renvoyé par le backend (pas "failed")
      Toast.afficher('❌ ' + (e && e.message ? e.message : 'Erreur inconnue'), 'erreur');
    }
    finally { if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer la clé Gemini'; } }
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
        // Pas de Content-Type → requête simple, évite le préflight CORS (Apps Script ne gère pas OPTIONS)
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
      const date = dateISOLocale();
      this._telechargerCSV(csv, `ESI_${exp.id}_${date}.csv`);
      await this._logExport(exp.label, data.length);
      Toast.afficher(`✅ Export ${exp.label} — ${data.length} lignes`, 'succes');
    } catch(e) {
      Toast.afficher('❌ Export échoué : ' + e.message, 'erreur');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = `📥 Exporter`; }
    }
  },

  // BLOC 10 — Export Tracker EMPOWER avec colonnes métier + filtre Pickup Date
  async exporterTracker() {
    const btn = document.getElementById('btn-export-tracker');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Chargement…'; }
    try {
      const leads = await SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS');
      const de  = this.state.filtrePickupDe ? new Date(this.state.filtrePickupDe).getTime() : 0;
      const au  = this.state.filtrePickupA  ? new Date(this.state.filtrePickupA + 'T23:59:59').getTime() : Infinity;
      const rows = leads
        .filter(p => String(p.Source_Import || '') === 'ESI_PIPELINE' && String(p.deleted || '').toUpperCase() !== 'TRUE')
        .filter(p => {
          if (!de && !au) return true;
          const t = new Date(p.Date_Import || p.Timestamp || 0).getTime();
          return t >= de && t <= au;
        })
        .map(p => ({
          Nom_Compte:         p.Nom_Compte || '',
          Statut_Pipeline:    p.STATUT_EMPOWER || '',
          CDS_Nom:            resolveCDS(p.PIN_CDS_Assigne || p.Nom_CDS),
          PIN_CDS:            p.PIN_CDS_Assigne || '',
          POTENTIEL:          p.POTENTIEL || '',
          ORIGINE:            p.ORIGINE || '',
          Date_Import:        String(p.Date_Import || '').slice(0, 10),
          Welcome_Pack_Date:  String(p.WELCOME_PACK_DATE || '').slice(0, 10),
          Date_prochaine_action: String(p.Date_prochaine_action || '').slice(0, 10),
          Ville:              p.Ville || '',
          Departement:        p.Departement || '',
          Interlocuteur:      p.Interlocuteur || '',
          Tel:                p.Tel || '',
          Email:              p.Email || '',
          Produits_Potentiels: p.Produits_Potentiels || '',
          Note_initiale:      String(p.Note_initiale || '').replace(/\n/g, ' '),
          FLAG_ACTION:        p.FLAG_ACTION || '',
          PREMIERE_COMMANDE_DATE: String(p.PREMIERE_COMMANDE_DATE || '').slice(0, 10),
        }));
      const csv  = this._toCSV(rows);
      const date = dateISOLocale();
      this._telechargerCSV(csv, `ESI_TRACKER_EMPOWER_${date}.csv`);
      await this._logExport('TRACKER_EMPOWER', rows.length);
      Toast.afficher(`✅ Tracker EMPOWER — ${rows.length} lead(s) exportés`, 'succes');
    } catch(e) {
      Toast.afficher('❌ Export Tracker : ' + e.message, 'erreur');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📥 CSV'; }
    }
  },

  _renderExports() {
    const de = this.state.filtrePickupDe || '';
    const au = this.state.filtrePickupA  || '';
    const filtrePickupHtml = `
      <div style="margin-bottom:16px;padding:10px 12px;background:var(--c-bg);border-radius:var(--radius-sm);border:1px solid var(--c-border)">
        <div style="font-size:12px;font-weight:700;color:var(--c-text-2);margin-bottom:8px">📅 Filtre Pickup Date</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <label style="font-size:12px;flex:1;min-width:120px">Du
            <input type="date" class="q-input" style="margin-top:3px;padding:6px" value="${de}"
                   onchange="VueAdmin.state.filtrePickupDe=this.value"/>
          </label>
          <label style="font-size:12px;flex:1;min-width:120px">Au
            <input type="date" class="q-input" style="margin-top:3px;padding:6px" value="${au}"
                   onchange="VueAdmin.state.filtrePickupA=this.value"/>
          </label>
          <button class="btn-secondaire" style="padding:7px 12px;width:auto;align-self:flex-end"
                  onclick="VueAdmin.state.filtrePickupDe='';VueAdmin.state.filtrePickupA='';VueAdmin.render()">✕ Reset</button>
        </div>
        <div style="font-size:11px;color:var(--c-text-2);margin-top:6px">Appliqué sur l'export Tracker EMPOWER (Date_Import).</div>
      </div>
    `;
    const trackerExportHtml = `
      <div style="margin-bottom:18px">
        <div style="font-size:12px;font-weight:700;color:var(--c-title);letter-spacing:.04em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--c-border)">📊 Tracker EMPOWER</div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:8px 0;gap:12px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600">Export Tracker EMPOWER (pipeline)</div>
            <div style="font-size:11px;color:var(--c-text-2);margin-top:1px">Leads ESI_PIPELINE — colonnes métier : Statut, CDS, Welcome Pack, Prochaine action, POTENTIEL, ORIGINE</div>
          </div>
          <button id="btn-export-tracker" class="btn-secondaire" style="padding:8px 14px;width:auto;flex-shrink:0"
                  onclick="VueAdmin.exporterTracker()">📥 CSV</button>
        </div>
      </div>`;
    return filtrePickupHtml + trackerExportHtml + this.EXPORT_GROUPES.map(groupe => `
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
          ${[['exports','📥 Exports'],['leads','➕ Leads'],['suivi','📊 Suivi']].map(([t, l]) => `
            <button onclick="VueAdmin.setAlexTab('${t}')"
                    style="flex:1;padding:12px 6px;border:none;border-bottom:${tab===t?'3px solid var(--c-primary)':'3px solid transparent'};
                           background:transparent;font-weight:${tab===t?'700':'400'};font-size:13px;
                           color:${tab===t?'var(--c-primary)':'var(--c-text-2)'};cursor:pointer">${l}</button>`).join('')}
        </div>
        <div class="dash-body avec-nav">
          ${tab === 'suivi' ? this._renderSuivi()
          : tab === 'exports' ? `
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
                <span style="color:var(--c-text-2);font-weight:400"> · FY27 : ${formatEuro(o.FY27_Obj)}</span>
              </strong>
              <div style="display:flex;gap:6px;margin-top:8px">
                ${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `
                  <label style="flex:1;font-size:11px;color:var(--c-text-2)">${q}
                    <input id="obj-${o.ID_Objectif}-${q}" type="number" class="q-input" style="padding:6px 8px;font-size:13px"
                           placeholder="${o[`${q}_Obj_Initial`] ?? '—'}" value="${o[`${q}_Obj_Revise`] || ''}"/>
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
          <div style="display:flex;gap:8px;align-items:stretch">
            <input id="admin-groq-key" type="password" class="q-input" style="flex:1" placeholder="gsk_…" autocomplete="new-password"/>
            <button id="btn-groq-toggle" type="button" class="btn-secondaire" style="width:auto;flex-shrink:0;white-space:nowrap"
                    onclick="VueAdmin.toggleCleVisible('admin-groq-key','btn-groq-toggle')">👁️ Afficher</button>
          </div>
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
          <div style="display:flex;gap:8px;align-items:stretch">
            <input id="admin-gemini-key" type="password" class="q-input" style="flex:1" placeholder="AIza…" autocomplete="new-password"/>
            <button id="btn-gemini-toggle" type="button" class="btn-secondaire" style="width:auto;flex-shrink:0;white-space:nowrap"
                    onclick="VueAdmin.toggleCleVisible('admin-gemini-key','btn-gemini-toggle')">👁️ Afficher</button>
          </div>
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

        <!-- IMPORT EMPOWER TRACKER -->
        <div class="bloc-fiche">
          <div class="bloc-titre">🔄 Synchroniser EMPOWER TRACKER</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">
            Importe les revendeurs de l'onglet <strong>1 - Saisie</strong> du fichier EMPOWER TRACKER (Google Drive)
            dans la base <code>📋_PROSPECTS</code> avec <code>Source_Import=ESI_PIPELINE</code>.<br>
            <strong>Non destructif</strong> — les doublons existants sont ignorés.
            Statuts mappés automatiquement : Actif→INTEGRE, Compte créé→COMPTE_CREE, En cours→EN_COURS, etc.
          </p>
          ${this.state.importResultat ? `
            <div style="padding:10px;border-radius:6px;margin-bottom:12px;
              background:${this.state.importResultat.ok ? 'rgba(26,158,92,.1)' : 'rgba(255,109,104,.1)'};
              border:1px solid ${this.state.importResultat.ok ? 'var(--c-success,#1a9e5c)' : 'var(--c-cta,#FF6D68)'}">
              <span style="font-size:13px;font-weight:600">
                ${this.state.importResultat.ok ? '✅' : '❌'} ${this.state.importResultat.message}
              </span>
            </div>` : ''}
          <button class="btn-secondaire"
                  style="background:var(--c-primary);color:#fff;border-color:var(--c-primary);padding:10px 16px"
                  ${this.state.importEnCours ? 'disabled' : ''}
                  onclick="VueAdmin.importerDepuisTracker()">
            ${this.state.importEnCours ? '⏳ Import en cours…' : '🔄 Importer depuis EMPOWER TRACKER Drive'}
          </button>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">
            Source : Google Sheet Drive "EMPOWER TRACKER" · Onglet "1 - Saisie" (81 revendeurs actifs).
          </p>
        </div>

        <!-- SYNC SELL-IN -->
        <div class="bloc-fiche">
          <div class="bloc-titre">📊 Synchronisation Sell-In</div>
          <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">
            Met à jour les CA (FY25, FY26, Q1FY27) et les statuts ACTIF/CHURN/INACTIF dans <strong>Comptes</strong>
            à partir du Google Drive Sell-In. Sync automatique chaque <strong>lundi à 8h00</strong>.
          </p>

          ${this.state.syncSellInResultat ? (() => {
            const r = this.state.syncSellInResultat;
            if (!r.ok) return `
              <div style="padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px;
                background:rgba(255,109,104,.1);border:1px solid var(--c-danger,#ef4444)">
                ❌ ${r.message}
              </div>`;
            return `
              <div style="padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px;
                background:rgba(16,185,129,.1);border:1px solid var(--c-success,#10b981)">
                <div style="font-weight:700;margin-bottom:4px">✅ Synchronisation réussie${r.ts ? ' · ' + r.ts : ''}</div>
                <div style="display:flex;gap:16px;font-size:12px">
                  <span>✅ <strong>${r.matched}</strong> comptes mis à jour</span>
                  ${r.nonMatch > 0 ? `<span style="color:var(--c-warning)">⚠️ <strong>${r.nonMatch}</strong> revendeurs sans correspondance</span>` : '<span>🎯 Tous les revendeurs matchés</span>'}
                </div>
              </div>
              ${this.state.syncSellInNonMatcher.length > 0 ? `
              <div style="margin-bottom:12px">
                <div style="font-size:12px;font-weight:700;color:var(--c-warning);margin-bottom:6px">
                  ⚠️ Revendeurs Sell-In sans compte correspondant (${this.state.syncSellInNonMatcher.length})
                </div>
                <div style="max-height:140px;overflow-y:auto;background:var(--c-bg);border:1px solid var(--c-border);border-radius:var(--radius-sm);padding:8px">
                  ${this.state.syncSellInNonMatcher.map(n => `<div style="font-size:12px;padding:2px 0;color:var(--c-text-2)">• ${n}</div>`).join('')}
                </div>
                <p style="font-size:11px;color:var(--c-text-2);margin-top:4px">Ces revendeurs sont dans le Sell-In mais n'ont pas de compte correspondant dans la base. Vérifier l'orthographe ou créer le compte.</p>
              </div>` : ''}`;
          })() : ''}

          <button class="btn-secondaire"
                  style="background:var(--c-primary,#0050FF);color:#fff;border-color:var(--c-primary,#0050FF);padding:10px 16px;width:100%"
                  ${this.state.syncSellInEnCours ? 'disabled' : ''}
                  onclick="VueAdmin.syncSellIn()">
            ${this.state.syncSellInEnCours ? '⏳ Synchronisation en cours…' : '🔄 Synchroniser maintenant'}
          </button>
          <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">
            Source : Google Drive · ID classeur configurable via secret <code>SELLIN_SHEET_ID</code> · Edge Function <code>sync-sellin</code>
          </p>
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
                <div style="font-size:11px;color:var(--c-text-2)">📞 appels + 🗺️ visites</div>
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
