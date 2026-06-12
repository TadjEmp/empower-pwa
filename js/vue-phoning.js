// ═══════════════════════════════════════
//  vue-phoning.js — Module Phoning IA v9
//  BUG-09 : planning-first workflow
//  ÉTAPE 1 → planning · ÉTAPE 2 → lancer appel · ÉTAPE 3 → questionnaire
//  Base phoning : uniquement 🏢_COMPTES (jamais PROSPECTS ni leads bruts)
// ═══════════════════════════════════════

window.VuePhoning = {

  state: null,

  _etatInitial() {
    return {
      phase: 'PRE',
      chargement: true, envoiEnCours: false,
      comptes: [], prospects: [],
      typeSource: 'EXISTANT', cible: null,
      mode: 'PLANNING',        // PLANNING | BASE | APPEL | HISTORIQUE
      filtreListe: 'TOUS',
      recherche: '', rechercheBase: '', script: '', scriptEnCours: false,
      enregistre: false, transcription: '', qualif: null,
      d: {
        objectif: '', accroche: '',
        statutAppel: '', interetEmpower: '', frein: '',
        prochaineAction: '', dateRappel: '', note: '',
        resultatProspect: '',
      },
      // BUG-09 — planning phoning
      planning: [],
      planningChargement: false,
      formPlanif: null,        // null = fermé; objet = formulaire ouvert
      filtrePlanning: 'SEMAINE', // SEMAINE | MOIS | TOUS
      idPlanifEnCours: null,   // ID_Appel du plan lancé
      // R5 — historique appels + edit/delete
      journal: [],
      journalChargement: false,
      modalEditAppel: null,
      confirmDeleteAppelId: null,
      // EX-2 — extraction
      extractOuvert: false,
      extractFiltres: { debut: '', fin: '', cds: 'TOUS', resultat: 'TOUS' },
    };
  },

  async init(idCible = null) {
    this.state = this._etatInitial();
    this.render();
    try {
      const [comptes, planning] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING'),
      ]);
      // BUG-09 : source phoning = uniquement COMPTES attribués au CDS
      this.state.comptes = comptes.filter(c =>
        Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin
      );
      // Planning = appels planifiés non supprimés du CDS courant
      this.state.planning = planning
        .filter(a =>
          String(a.deleted || '').toUpperCase() !== 'TRUE' &&
          String(a.Statut_Appel || '').toLowerCase() === 'planifié' &&
          (Session.voitTout() || Number(a.PIN_CDS) === Session.pin)
        )
        .sort((a, b) => (a.Date_Planifiee || '').localeCompare(b.Date_Planifiee || ''));
      // Si idCible passé (depuis fiche compte), ouvrir le formulaire de planification pré-rempli
      if (idCible) {
        const c = comptes.find(x => String(x.ID_Compte) === String(idCible));
        if (c) {
          this.state.formPlanif = {
            idCompte: c.ID_Compte, nomCompte: c.Nom_Compte,
            datePlanifiee: '', objectif: '', note: '',
          };
        }
      }
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  get sourceListe() { return this.state.typeSource === 'EXISTANT' ? this.state.comptes : this.state.prospects; },

  get suggestions() {
    const q = normaliserNom(this.state.recherche);
    if (q.length < 2) return [];
    return this.sourceListe.filter(c => normaliserNom(c.Nom_Compte).includes(q)).slice(0, 6);
  },

  // Prospects actifs triés pour la liste de phoning
  get listeProspectsTriee() {
    const auj = dateISOLocale();
    const potOrdre = { Fort: 0, Moyen: 1, Faible: 2 };
    const EXCLUS = ['ARCHIVE', 'INTEGRE'];

    let l = this.state.prospects.filter(p =>
      !EXCLUS.includes(String(p.STATUT_EMPOWER || '').toUpperCase())
    );

    const f = this.state.filtreListe;
    if (f === 'A_APPELER') {
      l = l.filter(p => String(p.Flag_traite).toUpperCase() !== 'TRUE');
    } else if (f === 'RAPPEL') {
      l = l.filter(p => p.Date_prochaine_action && String(p.Date_prochaine_action).slice(0, 10) <= auj);
    } else if (f === 'NON_JOIGNABLE') {
      l = l.filter(p => {
        const s = String(p.STATUT_EMPOWER || '').toUpperCase();
        return s === 'NON_JOIGNABLE';
      });
    }

    return l.sort((a, b) => {
      // 1. Rappels échus en premier
      const aRap = a.Date_prochaine_action && String(a.Date_prochaine_action).slice(0, 10) <= auj ? 0 : 1;
      const bRap = b.Date_prochaine_action && String(b.Date_prochaine_action).slice(0, 10) <= auj ? 0 : 1;
      if (aRap !== bRap) return aRap - bRap;
      // 2. Non traités avant traités
      const aT = String(a.Flag_traite).toUpperCase() === 'TRUE' ? 1 : 0;
      const bT = String(b.Flag_traite).toUpperCase() === 'TRUE' ? 1 : 0;
      if (aT !== bT) return aT - bT;
      // 3. Par potentiel Fort > Moyen > Faible
      return (potOrdre[a.POTENTIEL] ?? 1) - (potOrdre[b.POTENTIEL] ?? 1);
    });
  },

  setSource(s)  { this.state.typeSource = s; this.state.cible = null; this.state.recherche = ''; this.render(); },
  setMode(m) {
    this.state.mode = m;
    if (m === 'HISTORIQUE') this._chargerJournal();
    this.render();
  },

  demarrerAppelDirect() {
    this.state.cible      = null;
    this.state.typeSource = 'EXISTANT';
    this.state.mode       = 'APPEL';
    this.state.phase      = 'PRE';
    this.state.recherche  = '';
    Object.assign(this.state.d, { objectif:'', accroche:'', statutAppel:'', interetEmpower:'', frein:'', prochaineAction:'', dateRappel:'', note:'' });
    this.render();
  },

  demarrerAppelCompte(idCompte) {
    const c = this.state.comptes.find(x => String(x.ID_Compte) === String(idCompte));
    if (!c) { Toast.afficher('Compte introuvable', 'warning'); return; }
    this.state.cible      = c;
    this.state.typeSource = 'EXISTANT';
    this.state.mode       = 'APPEL';
    this.state.phase      = 'PRE';
    this.state.recherche  = c.Nom_Compte;
    Object.assign(this.state.d, { objectif:'', accroche:'', statutAppel:'', interetEmpower:'', frein:'', prochaineAction:'', dateRappel:'', note:'' });
    this.render();
  },
  setFiltreListe(f) { this.state.filtreListe = f; this.render(); },

  setRecherche(v) {
    this.state.recherche = v;
    if (this.state.cible && v !== this.state.cible.Nom_Compte) this.state.cible = null;
    this._renderSuggestions();
  },

  choisirCible(i) {
    this.state.cible = this.suggestions[i];
    this.state.recherche = this.state.cible.Nom_Compte;
    this.render();
  },

  // Sélectionner un prospect depuis la liste et passer directement à l'appel
  choisirEtDemarrer(idx) {
    const p = this.listeProspectsTriee[idx];
    if (!p) return;
    this.state.cible = p;
    this.state.typeSource = 'PROSPECT';
    this.state.mode = 'APPEL';
    this.state.phase = 'CALL';
    this.render();
  },

  _renderSuggestions() {
    const zone = document.getElementById('ph-suggestions');
    if (!zone) return;
    const estProspect = this.state.typeSource === 'PROSPECT';
    const potCoul = { Fort: 'var(--c-success)', Moyen: 'var(--c-warning)', Faible: 'var(--c-text-2)' };

    if (estProspect && this.state.recherche.length >= 2 && this.suggestions.length === 0) {
      zone.innerHTML = `
        <div style="padding:10px;font-size:13px;color:var(--c-text-2);text-align:center">
          Aucun prospect trouvé<br>
          <button class="btn-secondaire" style="margin-top:8px;font-size:12px"
            onclick="Router.aller('#/empower-tracker')">➕ Créer "${this.state.recherche}" dans le Tracker →</button>
        </div>`;
      return;
    }

    zone.innerHTML = this.suggestions.map((c, i) => `
      <div class="q-arbre-btn" style="margin-top:4px" onclick="VuePhoning.choisirCible(${i})">
        <div style="display:flex;align-items:center;gap:8px">
          <strong>${c.Nom_Compte}</strong>
          ${estProspect && c.POTENTIEL ? `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;background:${potCoul[c.POTENTIEL]||'#888'};color:#fff">${c.POTENTIEL}</span>` : ''}
        </div>
        <span style="color:var(--c-text-2);font-size:12px">
          ${c.Ville || '—'}
          ${estProspect && c.Note_initiale ? ' · ' + String(c.Note_initiale).slice(0, 40) : ''}
        </span>
      </div>`).join('');
  },

  set(c, v)  { this.state.d[c] = v; },
  setR(c, v) { this.state.d[c] = v; this.render(); },

  _semainesSilence() {
    const c = this.state.cible;
    const ref = c?.Date_Derniere_Action || c?.Date_dernière_action;
    if (!ref) return null;
    return Math.floor((Date.now() - new Date(ref).getTime()) / (7 * 86400000));
  },

  // ── Script d'accroche IA ──
  async genererScript() {
    if (!this.state.cible) { Toast.afficher('Sélectionnez un compte d\'abord', 'warning'); return; }
    this.state.scriptEnCours = true;
    this.render();
    try {
      const c = this.state.cible;
      this.state.script = await GroqAPI.genererScript({
        compte: c.Nom_Compte, statut: c.STATUT_COMPTE || c.Statut,
        canal: c.CANAL, semaines_silence: this._semainesSilence(),
        ca_fy25: c.CA_FY25, objectif_appel: this.state.d.objectif,
      });
    } catch(e) { Toast.afficher('❌ IA : ' + e.message, 'erreur'); }
    this.state.scriptEnCours = false;
    this.render();
  },

  demarrerAppel() {
    if (!this.state.cible) { Toast.afficher('Sélectionnez un compte', 'warning'); return; }
    this.state.phase = 'CALL';
    this.render();
  },

  // ── Enregistrement + qualification ──
  async toggleEnregistrement() {
    if (this.state.enregistre) { GroqAPI.arreterEnregistrement(); return; }
    // Information RGPD avant 1er enregistrement (Section 10 V2.1)
    const key = 'esi_rgpd_phoning_ok';
    if (!localStorage.getItem(key)) {
      const ok = confirm('ℹ️ Information RGPD\n\nConformément au RGPD :\n• Aucun fichier audio ne sera stocké côté serveur\n• Seule la transcription textuelle sera conservée dans les notes d\'appel\n• L\'audio est traité en mémoire et immédiatement effacé\n\nEn continuant, vous acceptez cette condition.');
      if (!ok) return;
      localStorage.setItem(key, '1');
    }
    try {
      this.state.enregistre = true;
      this.render();
      await GroqAPI.demarrerEnregistrement(async blob => {
        this.state.enregistre = false;
        this.render();
        Toast.afficher('🤖 Transcription + qualification…', 'info', 4000);
        try {
          const txt = await GroqAPI.transcrire(blob);
          this.state.transcription = txt;
          const c = this.state.cible;
          const q = await GroqAPI.qualifier(txt, {
            compte: c.Nom_Compte, statut: c.STATUT_COMPTE || c.Statut,
            semaines_silence: this._semainesSilence(),
          });
          this.state.qualif = q;
          const d = this.state.d;
          if (!d.frein) d.frein = q.frein_detecte || '';
          if (!d.prochaineAction) d.prochaineAction = q.action_recommandee || '';
          if (q.deadline_action_jours && !d.dateRappel) {
            d.dateRappel = dateISOLocale(new Date(Date.now() + q.deadline_action_jours * 86400000));
          }
          d.note = (d.note ? d.note + '\n' : '') + (q.resume || txt);
          // Auto-suggestion résultat prospect depuis score IA
          if (this.state.typeSource === 'PROSPECT' && !d.resultatProspect) {
            if (q.score >= 4)      d.resultatProspect = 'INTERESSE';
            else if (q.score <= 1) d.resultatProspect = 'NON_INTERESSE';
            else                   d.resultatProspect = 'RAPPELER';
          }
          Toast.afficher(`✅ Qualifié : ${q.type_appel} · score ${q.score}/5`, 'succes', 4000);
        } catch(e) { Toast.afficher('❌ IA : ' + e.message, 'erreur'); }
        this.state.phase = 'POST';
        this.render();
      });
    } catch(e) {
      this.state.enregistre = false;
      this.render();
      Toast.afficher('🎙️ Micro inaccessible : ' + e.message, 'erreur');
    }
  },

  passerAuPost() { this.state.phase = 'POST'; this.render(); },

  // ── Enregistrement final + archivage prospect ──
  async valider() {
    if (this.state.envoiEnCours) return;
    const s = this.state, d = s.d, c = s.cible;
    if (!d.statutAppel) { Toast.afficher('Indiquez le statut de l\'appel', 'warning'); return; }
    s.envoiEnCours = true;
    this.render();
    const estProspect = s.typeSource === 'PROSPECT';
    const idCible = estProspect ? c.ID_Prospect : c.ID_Compte;

    try {
      // 1. Ligne 📞_PHONING
      await SheetsAPI.ecrire('EMPOWER_MDB', '📞_PHONING', {
        ID_Appel: genId('APPEL'),
        Date: dateISOLocale(),
        Semaine_ISO: getISOWeek(),
        PIN_CDS: Session.pin, Nom_CDS: Session.nom,
        ID_Cible: idCible, Reseller: c.Nom_Compte,
        Statut_Appel: d.statutAppel,
        Interet_EMPOWER: d.interetEmpower,
        Frein_Principal: d.frein,
        Prochaine_Action: d.prochaineAction,
        Date_Rappel: d.dateRappel,
        Note: [d.note, s.qualif ? `[IA ${s.qualif.type_appel} · ${s.qualif.score}/5]` : ''].filter(Boolean).join('\n'),
        Timestamp: new Date().toISOString(),
      });

      // 2. Mise à jour fiche
      if (estProspect) {
        const maj = { Date_prochaine_action: d.dateRappel, Flag_traite: 'TRUE' };
        const res = d.resultatProspect;

        if (res === 'NON_INTERESSE') {
          // Archivage définitif
          maj.STATUT_EMPOWER = 'ARCHIVE';
          maj.FLAG_ACTION = 'ARCHIVE';
          maj.Note_initiale = (c.Note_initiale ? c.Note_initiale + '\n' : '')
            + `[NON_INTERESSE ${dateISOLocale()}]${d.frein ? ' · ' + d.frein : ''}`;
        } else if (res === 'INTERESSE') {
          // Avancement pipeline vers EN_COURS
          maj.STATUT_EMPOWER = 'EN_COURS';
          maj.FLAG_ACTION = 'EN_COURS';
        } else if (res === 'NON_JOIGNABLE' || res === 'RAPPELER') {
          // Reste en pipeline, rappel planifié
          maj.Flag_traite = 'FALSE';
        }

        await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', idCible, maj);
        // Sync état local
        const local = s.prospects.find(p => p.ID_Prospect === idCible);
        if (local) Object.assign(local, maj);
      } else {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', idCible, {
          Date_Derniere_Action: dateISOLocale(),
          Type_Derniere_Action: 'Appel',
          Prochaine_action: d.prochaineAction,
          Date_prochaine_action: d.dateRappel,
        });
      }

      // 2b. Marquer l'appel planifié comme réalisé (BUG-09)
      if (s.idPlanifEnCours) {
        try {
          await SheetsAPI.mettreAJour('EMPOWER_MDB', '📞_PHONING', s.idPlanifEnCours, {
            Statut_Appel: 'réalisé',
          });
        } catch(_) { /* non bloquant */ }
      }

      // 3. Log 📊_ACTIONS
      await SheetsAPI.ecrire('EMPOWER_MDB', '📊_ACTIONS', {
        ID_Action: genId('ACT'), Date_Action: new Date().toISOString(),
        Type_Action: 'Appel', Source: 'ESI', PIN_CDS: Session.pin,
        Nom_Compte: c.Nom_Compte,
        Statut_Avant: c.STATUT_COMPTE || c.Statut || c.STATUT_EMPOWER || '',
        Statut_Apres: d.resultatProspect || d.statutAppel,
        Resum_IA: s.qualif?.resume || d.note.slice(0, 120),
        GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });

      const msgResultat = {
        INTERESSE:      '✅ Lead avancé <strong>EN COURS</strong> dans le Tracker',
        NON_INTERESSE:  '🗄️ Prospect <strong>archivé</strong> (non intéressé)',
        NON_JOIGNABLE:  '📵 Rappel planifié · prospect non joignable',
        RAPPELER:       '🔔 Rappel planifié',
      }[d.resultatProspect] || '';

      document.getElementById('app').innerHTML = `
        <div class="visite-succes">
          <div class="succes-icone">📞</div>
          <h2>Appel enregistré</h2>
          <p class="succes-duree">${c.Nom_Compte}</p>
          <div class="succes-recap">
            <div>${d.statutAppel} · Intérêt EMPOWER : ${d.interetEmpower || '—'}</div>
            ${msgResultat ? `<div>${msgResultat}</div>` : ''}
            ${d.prochaineAction ? `<div>🎯 ${d.prochaineAction}${d.dateRappel ? ' — ' + dateRelative(d.dateRappel) : ''}</div>` : ''}
            ${s.qualif?.resume ? `<div>🤖 ${s.qualif.resume}</div>` : ''}
          </div>
          <div class="succes-btns">
            <button class="btn-primaire" onclick="Router.aller('#/dashboard')">← Dashboard</button>
            <button class="btn-secondaire" onclick="VuePhoning.init()">📋 Retour au planning</button>
          </div>
        </div>`;
    } catch(e) {
      s.envoiEnCours = false;
      this.render();
      Toast.afficher('❌ Erreur : ' + e.message, 'erreur', 5000);
    }
  },

  // ── Mode BASE : liste des comptes à appeler ──
  _renderBaseComptes() {
    const s = this.state;
    const _tabs = () => `
      <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface);margin-bottom:14px">
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('PLANNING')">📋 Planning</button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:var(--c-title);color:#fff">
          📂 Base (${s.comptes.length})
        </button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('HISTORIQUE')">📖 Journal</button>
      </div>`;

    if (!s.comptes.length) {
      return `<div class="q-champs">${_tabs()}<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucun compte attribué.</div></div>`;
    }

    let liste = s.comptes;
    const q = s.rechercheBase ? normaliserNom(s.rechercheBase) : '';
    if (q.length >= 2) liste = liste.filter(c => normaliserNom(c.Nom_Compte).includes(q) || normaliserNom(c.Ville || '').includes(q));

    return `<div class="q-champs">
      ${_tabs()}
      <input class="q-input" placeholder="🔍 Filtrer mes comptes…" value="${s.rechercheBase || ''}"
             oninput="VuePhoning.state.rechercheBase=this.value;VuePhoning.render()" style="margin-bottom:12px"/>
      ${liste.length === 0
        ? '<div style="padding:24px;text-align:center;color:var(--c-text-2)">Aucun résultat</div>'
        : liste.map(c => {
            const statut = c.STATUT_COMPTE || '—';
            const silence = (() => { const ref = c.Date_Derniere_Action; return ref ? Math.floor((Date.now() - new Date(ref).getTime()) / (7*86400000)) : null; })();
            return `
          <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:11px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-weight:700;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.Nom_Compte}</span>
              ${c.CANAL ? `<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:var(--c-bg);border:1px solid var(--c-border);color:var(--c-text-2)">${c.CANAL}</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">
              ${c.Ville ? `📍 ${c.Ville}` : ''}
              ${statut !== '—' ? ` · ${statut}` : ''}
              ${silence !== null ? ` · <span style="color:${silence > 4 ? 'var(--c-danger)' : 'var(--c-text-2)'}">⏱ ${silence}s silence</span>` : ''}
            </div>
            <div style="display:flex;gap:8px">
              ${c.Tel ? `<a class="btn-secondaire" style="flex:1;font-size:12px;text-decoration:none;text-align:center;padding:8px" href="tel:${String(c.Tel).replace(/\s/g,'')}">📞 ${c.Tel}</a>` : ''}
              <button class="btn-primaire" style="flex:2;font-size:12px;padding:8px"
                      onclick="VuePhoning.demarrerAppelCompte('${c.ID_Compte}')">▶ Appeler</button>
            </div>
          </div>`;
          }).join('')}
    </div>`;
  },

  // ── R5 : Journal des appels (chargement) ──
  async _chargerJournal() {
    this.state.journalChargement = true;
    this.render();
    try {
      const data = await SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING');
      this.state.journal = data
        .filter(a => String(a.deleted || '').toUpperCase() !== 'TRUE')
        .filter(a => Session.voitTout() || Number(a.PIN_CDS) === Session.pin)
        .sort((a, b) => (b.Date || '').localeCompare(a.Date || ''))
        .slice(0, 100);
    } catch(e) { Toast.afficher('❌ Chargement journal : ' + e.message, 'erreur'); }
    this.state.journalChargement = false;
    this.render();
  },

  // ── R5 : Édition appel ──
  ouvrirEditAppel(id) {
    const a = this.state.journal.find(x => x.ID_Appel === id);
    if (!a) return;
    if (!Session.voitTout() && Number(a.PIN_CDS) !== Session.pin) {
      Toast.afficher('Vous ne pouvez modifier que vos propres appels', 'warning'); return;
    }
    this.state.modalEditAppel = {
      id,
      date:           (a.Date || '').slice(0, 10),
      compte:         a.Reseller || '',
      statut:         a.Statut_Appel || '',
      interet:        a.Interet_EMPOWER || '',
      frein:          a.Frein_Principal || '',
      prochaineAction: a.Prochaine_Action || '',
      dateRappel:     a.Date_Rappel || '',
      note:           a.Note || '',
    };
    this.render();
  },

  fermerEditAppel() { this.state.modalEditAppel = null; this.render(); },

  async sauvegarderEditAppel(e) {
    e.preventDefault();
    const m = this.state.modalEditAppel;
    try {
      const maj = {
        Statut_Appel:     m.statut,
        Interet_EMPOWER:  m.interet,
        Frein_Principal:  m.frein,
        Prochaine_Action: m.prochaineAction,
        Date_Rappel:      m.dateRappel,
        Note:             m.note,
      };
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📞_PHONING', m.id, maj);
      const local = this.state.journal.find(a => a.ID_Appel === m.id);
      if (local) Object.assign(local, maj);
      this.state.modalEditAppel = null;
      Toast.afficher('✅ Appel modifié', 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  // ── R5 : Suppression appel (soft delete) ──
  demanderSuppressionAppel(id) {
    const a = this.state.journal.find(x => x.ID_Appel === id);
    if (!a) return;
    if (!Session.voitTout() && Number(a.PIN_CDS) !== Session.pin) {
      Toast.afficher('Vous ne pouvez supprimer que vos propres appels', 'warning'); return;
    }
    this.state.confirmDeleteAppelId = id;
    this.render();
  },

  async confirmerSuppressionAppel() {
    const id = this.state.confirmDeleteAppelId;
    if (!id) return;
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📞_PHONING', id, {
        deleted:    'TRUE',
        deleted_at: new Date().toISOString(),
        deleted_by: Session.nom,
      });
      this.state.journal = this.state.journal.filter(a => a.ID_Appel !== id);
      this.state.confirmDeleteAppelId = null;
      Toast.afficher('🗑️ Appel supprimé (soft delete)', 'succes');
      this.render();
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
  },

  annulerSuppressionAppel() { this.state.confirmDeleteAppelId = null; this.render(); },

  // ── EX-2 : Extraction phoning ──
  ouvrirExtraction()  { this.state.extractOuvert = true; this._chargerJournal(); },
  fermerExtraction()  { this.state.extractOuvert = false; this.render(); },

  exporterPhoning() {
    const f    = this.state.extractFiltres;
    const data = this.state.journal.filter(a => {
      const date = (a.Date || '').slice(0, 10);
      if (f.debut && date < f.debut) return false;
      if (f.fin   && date > f.fin)   return false;
      if (f.cds !== 'TOUS' && String(a.PIN_CDS) !== f.cds) return false;
      if (f.resultat !== 'TOUS' && a.Statut_Appel !== f.resultat) return false;
      return true;
    });
    if (!data.length) { Toast.afficher('Aucun appel pour ces filtres', 'warning'); return; }

    const ts = dateISOLocale().replace(/-/g, '');
    const fn = `PHONING_${f.debut || 'debut'}_${f.fin || 'fin'}_${ts}.csv`;

    const rows = data.map(a => ({
      ID_Appel:          a.ID_Appel || '',
      Date:              (a.Date || '').slice(0, 10),
      Semaine_ISO:       a.Semaine_ISO || '',
      CDS:               a.Nom_CDS || '',
      PIN_CDS:           a.PIN_CDS || '',
      Compte:            a.Reseller || '',
      Canal:             a.Canal || '',
      Statut_Appel:      a.Statut_Appel || '',
      Interet_EMPOWER:   a.Interet_EMPOWER || '',
      Frein_Principal:   a.Frein_Principal || '',
      Prochaine_Action:  a.Prochaine_Action || '',
      Date_Rappel:       a.Date_Rappel || '',
      Transcription:     a.Transcription || '',
      Note:              a.Note || '',
    }));

    generateCSV(rows, fn);
    this.state.extractOuvert = false;
    this.render();
  },

  // ── R5 : Vue journal des appels ──
  _renderJournal() {
    const s = this.state;
    const tabs = `
      <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface);margin-bottom:14px">
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('PLANNING')">📋 Planning</button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('BASE')">📂 Base (${s.comptes.length})</button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:var(--c-title);color:#fff">
          📖 Journal
        </button>
      </div>`;
    if (s.journalChargement) {
      return `<div class="q-champs">${tabs}<div style="padding:32px;text-align:center;color:var(--c-text-2)">Chargement du journal…</div></div>`;
    }
    if (!s.journal.length) {
      return `<div class="q-champs">${tabs}<div style="padding:32px;text-align:center;color:var(--c-text-2)">Aucun appel enregistré.</div></div>`;
    }
    const COUL = { Répondu: 'var(--c-success)', Répondeur: 'var(--c-warning)', Occupé: 'var(--c-warning)', 'Faux numéro': 'var(--c-danger)', Refus: 'var(--c-danger)' };
    return `<div class="q-champs">${tabs}
      ${s.journal.map(a => {
        const peutModif = Session.voitTout() || Number(a.PIN_CDS) === Session.pin;
        const coul = COUL[a.Statut_Appel] || 'var(--c-text-2)';
        return `
        <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:11px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-size:11px;color:var(--c-text-2)">${(a.Date || '').slice(0, 10)}</span>
            <strong style="font-size:14px;flex:1">${a.Reseller || '—'}</strong>
            <span style="font-size:11px;font-weight:700;color:${coul}">${a.Statut_Appel || '—'}</span>
          </div>
          ${a.Interet_EMPOWER ? `<div style="font-size:12px;color:var(--c-text-2)">Intérêt : ${a.Interet_EMPOWER}</div>` : ''}
          ${a.Frein_Principal ? `<div style="font-size:12px;color:var(--c-text-2)">Frein : ${a.Frein_Principal}</div>` : ''}
          ${a.Note ? `<div style="font-size:12px;font-style:italic;color:var(--c-text-2);margin-top:4px">${String(a.Note).slice(0, 80)}${a.Note.length > 80 ? '…' : ''}</div>` : ''}
          ${peutModif ? `
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn-secondaire" style="padding:5px 10px;font-size:12px;width:auto"
                    onclick="VuePhoning.ouvrirEditAppel('${a.ID_Appel}')">✏️ Modifier</button>
            <button class="btn-secondaire" style="padding:5px 10px;font-size:12px;width:auto;color:var(--c-danger);border-color:var(--c-danger)"
                    onclick="VuePhoning.demanderSuppressionAppel('${a.ID_Appel}')">🗑️</button>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  },

  // ── Modal édition appel ──
  _renderModalEditAppel() {
    const m = this.state.modalEditAppel;
    if (!m) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.fermerEditAppel()">
      <div class="modal">
        <h3>✏️ Modifier l'appel — ${m.compte}</h3>
        <form onsubmit="VuePhoning.sauvegarderEditAppel(event)">
          <label>Statut appel
            <div class="q-chips">
              ${['Répondu','Répondeur','Occupé','Faux numéro','Refus'].map(o =>
                `<button type="button" class="q-chip ${m.statut === o ? 'active' : ''}"
                  onclick="VuePhoning.state.modalEditAppel.statut='${o}';VuePhoning.render()">${o}</button>`
              ).join('')}
            </div>
          </label>
          <label>Intérêt EMPOWER
            <div class="q-chips">
              ${['Fort','Moyen','Faible','Aucun','Déjà inscrit'].map(o =>
                `<button type="button" class="q-chip ${m.interet === o ? 'active' : ''}"
                  onclick="VuePhoning.state.modalEditAppel.interet='${o}';VuePhoning.render()">${o}</button>`
              ).join('')}
            </div>
          </label>
          <label>Frein principal
            <input class="q-input" value="${m.frein}"
                   oninput="VuePhoning.state.modalEditAppel.frein=this.value"/></label>
          <label>Prochaine action
            <input class="q-input" value="${m.prochaineAction}"
                   oninput="VuePhoning.state.modalEditAppel.prochaineAction=this.value"/></label>
          <label>Date rappel
            <input type="date" class="q-input" value="${m.dateRappel}"
                   onchange="VuePhoning.state.modalEditAppel.dateRappel=this.value"/></label>
          <label>Note
            <textarea class="q-textarea" rows="3"
                      oninput="VuePhoning.state.modalEditAppel.note=this.value">${m.note}</textarea></label>
          <div class="modal-btns">
            <button type="button" onclick="VuePhoning.fermerEditAppel()">Annuler</button>
            <button type="submit" class="btn-primaire">💾 Enregistrer</button>
          </div>
        </form>
      </div>
    </div>`;
  },

  // ── Confirmation suppression appel ──
  _renderConfirmDeleteAppel() {
    if (!this.state.confirmDeleteAppelId) return '';
    const a = this.state.journal.find(x => x.ID_Appel === this.state.confirmDeleteAppelId);
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.annulerSuppressionAppel()">
      <div class="modal" style="max-width:360px">
        <h3 style="color:var(--c-danger)">🗑️ Supprimer cet appel ?</h3>
        <p style="font-size:14px;margin:12px 0"><strong>${a ? a.Reseller : ''}</strong> — ${a ? (a.Date || '').slice(0, 10) : ''}</p>
        <p style="font-size:12px;color:var(--c-text-2)">Suppression logique uniquement — la ligne est conservée en base.</p>
        <div class="modal-btns">
          <button onclick="VuePhoning.annulerSuppressionAppel()">Annuler</button>
          <button class="btn-primaire" style="background:var(--c-danger)"
                  onclick="VuePhoning.confirmerSuppressionAppel()">🗑️ Confirmer</button>
        </div>
      </div>
    </div>`;
  },

  // ── EX-2 : Panneau extraction CSV ──
  _renderExtraction() {
    if (!this.state.extractOuvert) return '';
    const f   = this.state.extractFiltres;
    const cnt = this.state.journal.filter(a => {
      const date = (a.Date || '').slice(0, 10);
      if (f.debut && date < f.debut) return false;
      if (f.fin   && date > f.fin)   return false;
      if (f.cds !== 'TOUS' && String(a.PIN_CDS) !== f.cds) return false;
      if (f.resultat !== 'TOUS' && a.Statut_Appel !== f.resultat) return false;
      return true;
    }).length;

    const cdsUniq = [...new Set(this.state.journal.map(a => a.PIN_CDS).filter(Boolean))];
    const cdsList = cdsUniq.map(pin => {
      const a = this.state.journal.find(x => String(x.PIN_CDS) === String(pin));
      return { pin: String(pin), nom: a?.Nom_CDS || `PIN ${pin}` };
    });

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.fermerExtraction()">
      <div class="modal" style="max-width:420px">
        <h3>📤 Extraction — Suivi phoning</h3>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <label style="flex:1">Date début
            <input type="date" value="${f.debut}"
                   onchange="VuePhoning.state.extractFiltres.debut=this.value;VuePhoning.render()"/></label>
          <label style="flex:1">Date fin
            <input type="date" value="${f.fin}"
                   onchange="VuePhoning.state.extractFiltres.fin=this.value;VuePhoning.render()"/></label>
        </div>
        <label>Commercial
          <select onchange="VuePhoning.state.extractFiltres.cds=this.value;VuePhoning.render()">
            <option value="TOUS" ${f.cds === 'TOUS' ? 'selected' : ''}>Tous</option>
            ${cdsList.map(c => `<option value="${c.pin}" ${f.cds === c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
          </select>
        </label>
        <label>Résultat
          <select onchange="VuePhoning.state.extractFiltres.resultat=this.value;VuePhoning.render()">
            <option value="TOUS" ${f.resultat === 'TOUS' ? 'selected' : ''}>Tous</option>
            ${['Répondu','Répondeur','Occupé','Faux numéro','Refus'].map(r =>
              `<option value="${r}" ${f.resultat === r ? 'selected' : ''}>${r}</option>`
            ).join('')}
          </select>
        </label>
        <div style="background:var(--c-bg);border-radius:var(--radius-sm);padding:12px;text-align:center;margin:12px 0;border:1px solid var(--c-border)">
          <span style="font-size:22px;font-weight:800;color:var(--c-primary)">${cnt}</span>
          <span style="font-size:13px;color:var(--c-text-2);margin-left:6px">appel(s) trouvé(s)</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondaire" style="flex:1" onclick="VuePhoning.fermerExtraction()">Fermer</button>
          <button class="btn-primaire" style="flex:2" onclick="VuePhoning.exporterPhoning()"
                  ${cnt === 0 ? 'disabled' : ''}>📥 Exporter CSV</button>
        </div>
      </div>
    </div>`;
  },

  // ── RENDER ──
  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement du module phoning…</div>';
      return;
    }
    const s = this.state;
    const TITRES = { PRE: 'Préparer l\'appel', CALL: 'Appel en cours', POST: 'Post-appel' };
    const peutExtraire = Session.voitTout();
    const backAction = (s.mode === 'PLANNING' || s.mode === 'HISTORIQUE')
      ? 'history.back()'
      : 'VuePhoning.setMode(\'PLANNING\')';
    const titre = s.mode === 'PLANNING' ? 'Planning phoning'
      : s.mode === 'HISTORIQUE' ? 'Journal appels'
      : TITRES[s.phase];

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="${backAction}" class="btn-retour">←</button>
        <h1>📞 ${titre}</h1>
        <div style="display:flex;gap:6px">
          ${peutExtraire ? `<button class="btn-retour" title="Extraction CSV" onclick="VuePhoning.ouvrirExtraction()">📤</button>` : ''}
          ${s.cible && s.mode === 'APPEL' ? `<span class="badge-compteur">${s.cible.Nom_Compte.slice(0, 14)}</span>` : ''}
        </div>
      </header>
      <div class="q-contenu avec-nav">
        ${s.mode === 'PLANNING'    ? this._renderPlanning()
        : s.mode === 'BASE'        ? this._renderBaseComptes()
        : s.mode === 'HISTORIQUE'  ? this._renderJournal()
        : this['_phase' + s.phase]()}
      </div>
      ${NavBar('phoning')}
      ${this._renderModalEditAppel()}
      ${this._renderConfirmDeleteAppel()}
      ${this._renderExtraction()}
      ${this._renderFormPlanif()}
    `;
    if (s.mode === 'APPEL') this._renderSuggestions();
  },

  _phasePRE() {
    const s = this.state, d = s.d;
    const silence = this._semainesSilence();

    return `<div class="q-champs">
      ${s.idPlanifEnCours && s.cible ? `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
        <span style="font-size:20px">📋</span>
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--c-title)">${s.cible.Nom_Compte}</div>
          <div style="font-size:12px;color:var(--c-text-2)">Appel planifié — objectif : ${d.objectif || '—'}</div>
        </div>
      </div>` : ''}
      <label class="q-label">Compte à appeler
        <input class="q-input" placeholder="🔍 Rechercher…" value="${s.recherche}"
               oninput="VuePhoning.setRecherche(this.value)" autocomplete="off"/>
      </label>
      <div id="ph-suggestions"></div>
      ${s.cible ? `<div class="q-recap">
        <div class="q-recap-ligne"><span>Statut</span><strong>${s.cible.STATUT_COMPTE || s.cible.STATUT_EMPOWER || s.cible.Statut || '—'}</strong></div>
        ${s.cible.POTENTIEL ? `<div class="q-recap-ligne"><span>Potentiel</span><strong>${s.cible.POTENTIEL}</strong></div>` : ''}
        ${silence !== null ? `<div class="q-recap-ligne"><span>Silence</span><strong>${silence} semaine(s)</strong></div>` : ''}
        ${s.cible.Tel ? `<div class="q-recap-ligne"><span>Téléphone</span><strong><a class="lien-tel" href="tel:${String(s.cible.Tel).replace(/\s/g, '')}">${s.cible.Tel}</a></strong></div>` : ''}
        ${s.cible.CA_FY25 ? `<div class="q-recap-ligne"><span>CA FY25</span><strong>${formatEuro(s.cible.CA_FY25)}</strong></div>` : ''}
        ${s.cible.Note_initiale ? `<div style="font-size:12px;color:var(--c-text-2);padding-top:6px;font-style:italic">${String(s.cible.Note_initiale).slice(0, 100)}</div>` : ''}
      </div>` : ''}
      <label class="q-label">Objectif de l'appel
        <input class="q-input" placeholder="ex : relancer commande Q2" value="${d.objectif}" oninput="VuePhoning.set('objectif', this.value)"/></label>

      <button type="button" class="btn-secondaire" onclick="VuePhoning.genererScript()"
              ${s.scriptEnCours ? 'disabled' : ''}>
        ${s.scriptEnCours ? '🤖 Génération…' : '🤖 Générer un script d\'accroche IA'}
      </button>
      ${s.script ? `<div class="q-recap"><h3>📜 Script suggéré</h3>
        <p style="font-size:13px;line-height:1.6;white-space:pre-wrap">${s.script}</p></div>` : ''}

      <button type="button" class="btn-primaire" onclick="VuePhoning.demarrerAppel()">📞 Démarrer l'appel →</button>
    </div>`;
  },

  // ── Liste de phoning prospects ──
  _renderListeProspects() {
    const s = this.state;
    const auj = dateISOLocale();
    const EXCLUS = ['ARCHIVE', 'INTEGRE'];
    const actifs = s.prospects.filter(p => !EXCLUS.includes(String(p.STATUT_EMPOWER || '').toUpperCase()));
    const liste  = this.listeProspectsTriee;
    const potCoul = { Fort: 'var(--c-success)', Moyen: 'var(--c-warning)', Faible: 'var(--c-text-2)' };

    const nTotal    = actifs.length;
    const nAAppeler = actifs.filter(p => String(p.Flag_traite).toUpperCase() !== 'TRUE').length;
    const nRappel   = actifs.filter(p => p.Date_prochaine_action && String(p.Date_prochaine_action).slice(0, 10) <= auj).length;

    const filtres = { TOUS: 'Tous', A_APPELER: 'À appeler', RAPPEL: 'Rappel dû', NON_JOIGNABLE: 'Non joignable' };

    return `<div class="q-champs">
      <!-- Compteurs -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <div style="flex:1;background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:var(--c-title)">${nTotal}</div>
          <div style="font-size:11px;color:var(--c-text-2)">Total actifs</div>
        </div>
        <div style="flex:1;background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:var(--c-primary)">${nAAppeler}</div>
          <div style="font-size:11px;color:var(--c-text-2)">À appeler</div>
        </div>
        <div style="flex:1;background:var(--c-surface);border:1.5px solid ${nRappel ? 'var(--c-danger)' : 'var(--c-border)'};border-radius:var(--radius-sm);padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:${nRappel ? 'var(--c-danger)' : 'var(--c-text-2)'}">${nRappel}</div>
          <div style="font-size:11px;color:var(--c-text-2)">Rappels dus</div>
        </div>
      </div>

      <!-- Filtres -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        ${Object.entries(filtres).map(([f, l]) => `
          <button class="btn-filtre ${s.filtreListe === f ? 'actif' : ''}"
                  onclick="VuePhoning.setFiltreListe('${f}')">${l}</button>`).join('')}
      </div>

      <!-- Cartes prospects -->
      ${liste.length === 0
        ? '<div style="padding:24px;text-align:center;color:var(--c-text-2)">Aucun prospect pour ce filtre</div>'
        : liste.map((p, i) => {
            const rappelDu = p.Date_prochaine_action && String(p.Date_prochaine_action).slice(0, 10) <= auj;
            const nonTraite = String(p.Flag_traite).toUpperCase() !== 'TRUE';
            const origineLabel = (p.ORIGINE || '').replace('Import_PROSPECTS_', '').replace(/_/g, ' ');
            return `
          <div style="background:var(--c-surface);border:1.5px solid ${rappelDu ? 'var(--c-danger)' : 'var(--c-border)'};border-radius:var(--radius-sm);padding:12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:15px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.Nom_Compte}</span>
              ${p.POTENTIEL ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${potCoul[p.POTENTIEL]||'#888'};color:#fff;flex-shrink:0">${p.POTENTIEL}</span>` : ''}
              ${nonTraite ? `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:var(--c-primary);color:#fff;flex-shrink:0">À appeler</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--c-text-2);margin-bottom:6px">
              ${p.Ville ? `📍 ${p.Ville}` : ''}${origineLabel ? ` · ${origineLabel}` : ''}
              ${rappelDu && p.Date_prochaine_action ? ` · ⏰ <span style="color:var(--c-danger);font-weight:600">${dateRelative(p.Date_prochaine_action)}</span>` : ''}
            </div>
            ${p.Note_initiale ? `<div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px;font-style:italic">${String(p.Note_initiale).slice(0, 80)}${String(p.Note_initiale).length > 80 ? '…' : ''}</div>` : ''}
            ${p.Tel ? `<div style="font-size:13px;margin-bottom:8px"><a class="lien-tel" href="tel:${String(p.Tel).replace(/\s/g,'')}">📞 ${p.Tel}</a></div>` : ''}
            <button class="btn-primaire" style="width:100%;font-size:13px;padding:10px"
                    onclick="VuePhoning.choisirEtDemarrer(${i})">📞 Démarrer l'appel</button>
          </div>`;
          }).join('')
      }

      <button class="btn-secondaire" style="width:100%;margin-top:8px"
              onclick="Router.aller('#/empower-tracker')">➕ Ajouter un prospect dans le Tracker</button>
    </div>`;
  },

  _phaseCALL() {
    const s = this.state;
    return `<div class="q-champs" style="align-items:center;text-align:center;padding-top:24px">
      <div style="font-size:48px">${s.enregistre ? '🔴' : '🎙️'}</div>
      <p class="q-intro">${s.enregistre
        ? 'Enregistrement en cours… (30s max — résumez l\'échange à voix haute)'
        : 'Pendant ou juste après l\'appel, enregistrez un résumé vocal de 30s.\nL\'IA transcrira et qualifiera automatiquement.'}</p>
      ${s.cible?.Tel ? `<a class="btn-secondaire" style="text-decoration:none;text-align:center"
        href="tel:${String(s.cible.Tel).replace(/\s/g, '')}">📞 Composer ${s.cible.Tel}</a>` : ''}
      <button type="button" class="btn-primaire" style="${s.enregistre ? 'background:var(--c-danger)' : ''}"
              onclick="VuePhoning.toggleEnregistrement()">
        ${s.enregistre ? '⏹ Arrêter l\'enregistrement' : '⏺ Enregistrer le résumé (30s)'}
      </button>
      <button type="button" class="btn-secondaire" onclick="VuePhoning.passerAuPost()">Passer la dictée → saisie manuelle</button>
    </div>`;
  },

  _phasePOST() {
    const s = this.state, d = s.d;
    const estProspect = s.typeSource === 'PROSPECT';
    const infoResultat = {
      INTERESSE:     '✅ Le lead sera avancé <strong>EN COURS</strong> dans le Tracker',
      NON_INTERESSE: '🗄️ Le prospect sera <strong>archivé</strong> définitivement',
      NON_JOIGNABLE: '📵 Rappel planifié · statut conservé',
      RAPPELER:      '🔔 Rappel planifié à la date choisie',
    }[d.resultatProspect] || 'Sélectionnez un résultat pour archiver automatiquement';

    return `<div class="q-champs">
      ${s.qualif ? `<div class="q-recap">
        <h3>🤖 Qualification IA</h3>
        <div class="q-recap-ligne"><span>Type</span><strong>${s.qualif.type_appel}</strong></div>
        <div class="q-recap-ligne"><span>Score</span><strong>${s.qualif.score}/5</strong></div>
        ${s.qualif.frein_detecte ? `<div class="q-recap-ligne"><span>Frein</span><strong>${s.qualif.frein_detecte}</strong></div>` : ''}
        ${s.qualif.concurrent_detecte ? `<div class="q-recap-ligne"><span>Concurrent</span><strong>${s.qualif.concurrent_detecte}</strong></div>` : ''}
        <p style="font-size:13px;margin-top:8px">${s.qualif.resume || ''}</p>
      </div>` : ''}
      ${s.transcription ? `<details style="font-size:12px;color:var(--c-text-2)">
        <summary>Transcription brute</summary><p>${s.transcription}</p></details>` : ''}

      <label class="q-label">Statut de l'appel ${this._r('statutAppel', ['Répondu', 'Répondeur', 'Occupé', 'Faux numéro', 'Refus'])}</label>
      <label class="q-label">Intérêt EMPOWER ${this._r('interetEmpower', ['Fort', 'Moyen', 'Faible', 'Aucun', 'Déjà inscrit'])}</label>

      ${estProspect ? `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-primary);border-radius:var(--radius-sm);padding:12px;margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;color:var(--c-primary);letter-spacing:.04em;margin-bottom:8px">📋 RÉSULTAT DU PROSPECT</div>
        ${this._r('resultatProspect', ['INTERESSE', 'RAPPELER', 'NON_JOIGNABLE', 'NON_INTERESSE'])}
        <div style="font-size:11px;color:var(--c-text-2);margin-top:6px">${infoResultat}</div>
      </div>` : ''}

      <label class="q-label">Frein principal
        <input class="q-input" placeholder="ex : Prix" value="${d.frein}" oninput="VuePhoning.set('frein', this.value)"/></label>
      <label class="q-label">Prochaine action
        <input class="q-input" placeholder="ex : Rappel J+14, envoi comparatif" value="${d.prochaineAction}" oninput="VuePhoning.set('prochaineAction', this.value)"/></label>
      <label class="q-label">Date de rappel
        <input type="date" class="q-input" value="${d.dateRappel}" onchange="VuePhoning.set('dateRappel', this.value)"/></label>
      <label class="q-label">Note
        <textarea class="q-textarea" rows="4" oninput="VuePhoning.set('note', this.value)">${d.note}</textarea></label>

      <button type="button" class="btn-primaire" onclick="VuePhoning.valider()"
              ${s.envoiEnCours ? 'disabled' : ''}>
        ${s.envoiEnCours ? 'Enregistrement…' : '✓ Enregistrer l\'appel'}
      </button>
    </div>`;
  },

  _r(champ, options) {
    return `<div class="q-chips">${options.map(o => `
      <button type="button" class="q-chip ${this.state.d[champ] === o ? 'active' : ''}"
              onclick="VuePhoning.setR('${champ}','${o}')">${o}</button>`).join('')}</div>`;
  },

  // ── BUG-09 : Planning phoning ──────────────────────────────────────────────

  _renderPlanning() {
    const s = this.state;
    if (s.planningChargement) return '<div class="spinner-centre">Chargement planning…</div>';

    const auj  = dateISOLocale();
    const now  = auj;
    // Calcule début de semaine (lundi) et fin de mois courant
    const dateD = new Date(auj);
    const jourSemaine = dateD.getDay() === 0 ? 6 : dateD.getDay() - 1;
    dateD.setDate(dateD.getDate() - jourSemaine);
    const debutSemaine = dateD.toISOString().slice(0, 10);
    const finMois = new Date(dateD.getFullYear(), dateD.getMonth() + 2, 0).toISOString().slice(0, 10);

    let liste = s.planning;
    if (s.filtrePlanning === 'SEMAINE') {
      const finSemaine = new Date(debutSemaine);
      finSemaine.setDate(finSemaine.getDate() + 6);
      const fs = finSemaine.toISOString().slice(0, 10);
      liste = liste.filter(a => {
        const d = (a.Date_Planifiee || '').slice(0, 10);
        return d >= debutSemaine && d <= fs;
      });
    } else if (s.filtrePlanning === 'MOIS') {
      liste = liste.filter(a => {
        const d = (a.Date_Planifiee || '').slice(0, 10);
        return d >= auj.slice(0, 7) + '-01' && d <= finMois;
      });
    }

    const badges = {
      'planifié': { bg: 'var(--c-primary)', lbl: 'Planifié' },
      'en_cours': { bg: 'var(--c-warning)', lbl: 'En cours' },
    };

    return `<div class="q-champs">
      <!-- Tabs navigation -->
      <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface);margin-bottom:14px">
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:var(--c-title);color:#fff">
          📋 Planning
        </button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('BASE')">📂 Base (${s.comptes.length})</button>
        <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:transparent;color:var(--c-text-2)"
                onclick="VuePhoning.setMode('HISTORIQUE')">📖 Journal</button>
      </div>

      <!-- Actions rapides -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn-primaire" style="flex:1"
                onclick="VuePhoning.ouvrirFormPlanif()">
          📅 Planifier un appel
        </button>
        <button class="btn-secondaire" style="flex:1"
                onclick="VuePhoning.demarrerAppelDirect()">
          📞 Appel direct
        </button>
      </div>

      <!-- Filtres temporels -->
      <div style="display:flex;gap:6px;margin-bottom:14px">
        ${[['SEMAINE','Cette semaine'],['MOIS','Ce mois'],['TOUS','Tous']].map(([v, l]) => `
          <button class="btn-filtre ${s.filtrePlanning === v ? 'actif' : ''}"
                  onclick="VuePhoning.setFiltrePlanning('${v}')">${l}</button>`).join('')}
      </div>

      <!-- Liste des appels planifiés -->
      ${liste.length === 0
        ? `<div style="padding:32px;text-align:center;color:var(--c-text-2)">
             <div style="font-size:32px;margin-bottom:8px">📭</div>
             <div style="font-size:14px">Aucun appel planifié pour cette période</div>
             <div style="font-size:12px;margin-top:4px">Cliquez "Planifier un appel" pour en créer un.</div>
           </div>`
        : liste.map(a => {
            const estPasse = (a.Date_Planifiee || '').slice(0, 10) < now;
            const badge = badges[String(a.Statut_Appel || '').toLowerCase()] || badges['planifié'];
            return `
          <div style="background:var(--c-surface);border:1.5px solid ${estPasse ? 'var(--c-danger)' : 'var(--c-border)'};border-radius:var(--radius-sm);padding:12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-weight:700;font-size:15px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.Reseller || a.Nom_Compte || '—'}</span>
              <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;background:${badge.bg};color:#fff;flex-shrink:0">${badge.lbl}</span>
            </div>
            <div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">
              📅 ${a.Date_Planifiee ? a.Date_Planifiee.slice(0, 16).replace('T', ' ') : '—'}
              ${estPasse ? ' <span style="color:var(--c-danger);font-weight:700">· En retard</span>' : ''}
              ${a.Objectif_Appel ? ` · ${a.Objectif_Appel}` : ''}
            </div>
            ${a.Note_Preparation ? `<div style="font-size:12px;color:var(--c-text-2);font-style:italic;margin-bottom:8px">${String(a.Note_Preparation).slice(0, 80)}</div>` : ''}
            <div style="display:flex;gap:8px">
              <button class="btn-primaire" style="flex:2;font-size:13px;padding:9px"
                      onclick="VuePhoning.lancerAppelPlanifie('${a.ID_Appel}')">
                📞 Lancer l'appel
              </button>
              <button class="btn-secondaire" style="flex:1;font-size:13px;padding:9px"
                      onclick="VuePhoning.supprimerPlanif('${a.ID_Appel}')">🗑</button>
            </div>
          </div>`;
          }).join('')
      }
    </div>`;
  },

  _renderFormPlanif() {
    const s = this.state;
    if (!s.formPlanif) return '';
    const f = s.formPlanif;

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VuePhoning.fermerFormPlanif()">
      <div class="modal" style="max-width:440px">
        <h3>📋 Planifier un appel</h3>

        <label class="q-label">Compte à appeler
          ${f.idCompte
            ? `<div style="padding:10px;background:var(--c-bg);border-radius:var(--radius-sm);font-weight:700;border:1.5px solid var(--c-primary)">${f.nomCompte}</div>`
            : `<input class="q-input" placeholder="🔍 Rechercher un compte…" id="planif-recherche"
                     value="${f.rechercheCompte || ''}"
                     oninput="VuePhoning._rechercherPlanif(this.value)" autocomplete="off"/>
               <div id="planif-suggestions"></div>`
          }
        </label>

        <label class="q-label">Date et heure prévues
          <input type="datetime-local" class="q-input"
                 value="${f.datePlanifiee || ''}"
                 onchange="VuePhoning.state.formPlanif.datePlanifiee=this.value"/>
        </label>

        <label class="q-label">Objectif de l'appel
          <div class="q-chips" style="flex-wrap:wrap">
            ${['Relance CA','Info produit','Prise de commande','Autre'].map(o => `
              <button type="button" class="q-chip ${f.objectif === o ? 'active' : ''}"
                      onclick="VuePhoning.state.formPlanif.objectif='${o}';VuePhoning.render()">${o}</button>`).join('')}
          </div>
        </label>

        <label class="q-label">Note de préparation
          <textarea class="q-textarea" rows="3" placeholder="Contexte, historique, points à aborder…"
                    oninput="VuePhoning.state.formPlanif.note=this.value">${f.note || ''}</textarea>
        </label>

        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="btn-secondaire" style="flex:1" onclick="VuePhoning.fermerFormPlanif()">Annuler</button>
          <button class="btn-primaire" style="flex:2" onclick="VuePhoning.sauvegarderPlanif()"
                  ${s.envoiEnCours ? 'disabled' : ''}>
            ${s.envoiEnCours ? 'Enregistrement…' : '✅ Planifier l\'appel'}
          </button>
        </div>
      </div>
    </div>`;
  },

  _rechercherPlanif(v) {
    this.state.formPlanif.rechercheCompte = v;
    const zone = document.getElementById('planif-suggestions');
    if (!zone) return;
    if (!v || v.length < 2) { zone.innerHTML = ''; return; }
    const q = normaliserNom(v);
    const matches = this.state.comptes.filter(c => normaliserNom(c.Nom_Compte).includes(q)).slice(0, 6);
    zone.innerHTML = matches.map(c => `
      <div class="q-arbre-btn" style="margin-top:4px" onclick="VuePhoning._choisirComptePlanif('${c.ID_Compte}','${c.Nom_Compte.replace(/'/g, "\\'")}')">
        <strong>${c.Nom_Compte}</strong>
        <span style="color:var(--c-text-2);font-size:12px">${c.Ville || '—'}</span>
      </div>`).join('');
  },

  _choisirComptePlanif(id, nom) {
    if (!this.state.formPlanif) return;
    this.state.formPlanif.idCompte = id;
    this.state.formPlanif.nomCompte = nom;
    this.render();
  },

  ouvrirFormPlanif(idCompte = null) {
    const c = idCompte ? this.state.comptes.find(x => String(x.ID_Compte) === String(idCompte)) : null;
    this.state.formPlanif = {
      idCompte: c ? c.ID_Compte : null,
      nomCompte: c ? c.Nom_Compte : '',
      rechercheCompte: '',
      datePlanifiee: '',
      objectif: '',
      note: '',
    };
    this.render();
  },

  fermerFormPlanif() { this.state.formPlanif = null; this.render(); },

  async sauvegarderPlanif() {
    const f = this.state.formPlanif;
    if (!f || !f.idCompte) { Toast.afficher('Sélectionnez un compte', 'warning'); return; }
    if (!f.datePlanifiee)  { Toast.afficher('Indiquez la date prévue', 'warning'); return; }
    this.state.envoiEnCours = true;
    this.render();
    try {
      const c = this.state.comptes.find(x => String(x.ID_Compte) === String(f.idCompte));
      const record = {
        ID_Appel: genId('APPEL'),
        Date_Planifiee: f.datePlanifiee,
        Date: dateISOLocale(),
        Semaine_ISO: getISOWeek(),
        PIN_CDS: Session.pin, Nom_CDS: Session.nom,
        ID_Cible: f.idCompte, Reseller: c ? c.Nom_Compte : f.nomCompte,
        Statut_Appel: 'planifié',
        Objectif_Appel: f.objectif,
        Note_Preparation: f.note,
        Timestamp: new Date().toISOString(),
      };
      await SheetsAPI.ecrire('EMPOWER_MDB', '📞_PHONING', record);
      // Ajoute au state local pour affichage immédiat sans rechargement
      this.state.planning.push(record);
      this.state.planning.sort((a, b) => (a.Date_Planifiee || '').localeCompare(b.Date_Planifiee || ''));
      this.state.formPlanif = null;
      Toast.afficher('✅ Appel planifié', 'succes');
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
    this.state.envoiEnCours = false;
    this.render();
  },

  lancerAppelPlanifie(id) {
    const plan = this.state.planning.find(a => a.ID_Appel === id);
    if (!plan) { Toast.afficher('Appel introuvable', 'warning'); return; }
    const c = this.state.comptes.find(x => String(x.ID_Compte) === String(plan.ID_Cible));
    if (!c) { Toast.afficher('Compte introuvable — vérifiez vos comptes attribués', 'warning'); return; }
    this.state.cible          = c;
    this.state.typeSource     = 'EXISTANT';
    this.state.idPlanifEnCours = id;
    this.state.mode           = 'APPEL';
    this.state.phase          = 'PRE';
    this.state.d.objectif     = plan.Objectif_Appel || '';
    this.state.recherche      = c.Nom_Compte;
    this.render();
  },

  async supprimerPlanif(id) {
    if (!confirm('Supprimer cet appel planifié ?')) return;
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '📞_PHONING', id, {
        deleted: 'TRUE', deleted_at: dateISOLocale(), deleted_by: Session.nom,
      });
      this.state.planning = this.state.planning.filter(a => a.ID_Appel !== id);
      Toast.afficher('🗑 Appel supprimé', 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  setFiltrePlanning(f) { this.state.filtrePlanning = f; this.render(); },
};
