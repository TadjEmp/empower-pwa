// ═══════════════════════════════════════
//  vue-mailing.js — Module Mailing (BLOC 11 Partie B)
//  Onglet dédié : logguer un mailing envoyé (compte base OU lead Tracker)
//  comme une action commerciale réelle, au même titre qu'un appel/visite.
//  Écrit dans le journal unifié 📊_ACTIONS (Type_Action:'Mailing') et met à
//  jour Date_Derniere_Action/Type_Derniere_Action sur la cible — même
//  convention que vue-phoning.js/vue-visites.js. Pas de nouvelle table/colonne
//  (motifs + note stockés dans Resum_IA, seul champ texte libre déjà écrit
//  par toutes les autres sources d'actions).
// ═══════════════════════════════════════

window.VueMailing = {

  state: null,

  MOTIFS: ['Cotation grossiste', 'Documentation commerciale', 'Offre commerciale', 'Contrat/mandat', 'Autre'],

  _etatInitial() {
    return {
      chargement: true,
      mode: 'BASE',           // BASE (recherche + saisie) | JOURNAL (historique)
      comptes: [], prospects: [], cdsListe: [],
      recherche: '', filtreCDS: 'TOUS',
      cible: null,             // { type:'compte'|'lead', id, nom, obj }
      motifs: [], note: '',
      envoiEnCours: false,
      journal: [], journalChargement: false,
      journalRecherche: '', journalFiltreCDS: 'TOUS',
    };
  },

  async init() {
    this.state = this._etatInitial();
    this.render();
    try {
      const [comptes, prospects, cdsApi] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lireCDS(),
      ]);
      this.state.comptes = comptes.filter(c => Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin);
      this.state.prospects = prospects.filter(p => Session.voitTout() || !p.PIN_CDS_Assigne || Number(p.PIN_CDS_Assigne) === Session.pin);
      this.state.cdsListe = (Array.isArray(cdsApi) ? cdsApi : []).filter(c => ['CDS', 'ADMIN'].includes(String(c.role).toUpperCase()));
      this.state.chargement = false;
      this.render();
      this._chargerJournal();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  setMode(m) {
    this.state.mode = m;
    if (m === 'JOURNAL') this._chargerJournal();
    this.render();
  },

  // ── Recherche cross comptes + leads (patch ciblé, jamais un render() complet
  // — cf. audit BLOC 11 Partie A : un render() complet à chaque frappe détruit
  // le nœud <input> et corrompt la saisie) ──
  setRecherche(v) {
    this.state.recherche = v;
    const zone = document.getElementById('mailing-resultats-zone');
    if (zone) zone.innerHTML = this._renderResultatsZone();
  },
  setFiltreCDS(pin) {
    this.state.filtreCDS = pin;
    const zone = document.getElementById('mailing-resultats-zone');
    if (zone) zone.innerHTML = this._renderResultatsZone();
  },

  get resultats() {
    const q = this.state.recherche ? normaliserNom(this.state.recherche) : '';
    let comptes = this.state.comptes;
    let leads = this.state.prospects;
    if (Session.voitTout() && this.state.filtreCDS !== 'TOUS') {
      comptes = comptes.filter(c => String(c.PIN_CDS_Assigne) === String(this.state.filtreCDS));
      leads   = leads.filter(p => String(p.PIN_CDS_Assigne) === String(this.state.filtreCDS));
    }
    if (q.length >= 2) {
      comptes = comptes.filter(c => normaliserNom(c.Nom_Compte).includes(q) || normaliserNom(c.Ville || '').includes(q));
      leads   = leads.filter(p => normaliserNom(p.Nom_Compte).includes(q) || normaliserNom(p.Ville || '').includes(q));
    }
    const r = [
      ...comptes.map(c => ({ type: 'compte', id: c.ID_Compte, nom: c.Nom_Compte, obj: c })),
      ...leads.map(p => ({ type: 'lead', id: p.ID_Prospect, nom: p.Nom_Compte, obj: p })),
    ];
    return q.length >= 2 ? r.slice(0, 30) : r.slice(0, 12);
  },

  choisirCible(type, id) {
    const src = type === 'compte' ? this.state.comptes : this.state.prospects;
    const obj = src.find(x => String(type === 'compte' ? x.ID_Compte : x.ID_Prospect) === String(id));
    if (!obj) { Toast.afficher('Introuvable', 'warning'); return; }
    this.state.cible = { type, id, nom: obj.Nom_Compte, obj };
    this.state.motifs = [];
    this.state.note = '';
    this.render();
  },

  fermerCible() {
    this.state.cible = null;
    this.state.motifs = [];
    this.state.note = '';
    this.render();
  },

  toggleMotif(champ, valeur) {
    const arr = this.state.motifs;
    const idx = arr.indexOf(valeur);
    if (idx === -1) arr.push(valeur); else arr.splice(idx, 1);
    this.render();
  },

  setNote(v) { this.state.note = v; },

  async valider() {
    const s = this.state;
    if (s.envoiEnCours || !s.cible) return;
    if (!s.motifs.length) { Toast.afficher('Sélectionnez au moins un motif', 'warning'); return; }
    s.envoiEnCours = true;
    this.render();
    const c = s.cible.obj;
    const resum = s.motifs.join(', ') + (s.note.trim() ? ' — ' + s.note.trim() : '');
    try {
      // 1. Log 📊_ACTIONS — même convention que valider() de vue-phoning.js
      await SheetsAPI.ecrire('EMPOWER_MDB', '📊_ACTIONS', {
        ID_Action: genId('ACT'), Date_Action: new Date().toISOString(),
        Type_Action: 'Mailing', Source: 'ESI', PIN_CDS: Session.pin,
        Nom_Compte: s.cible.nom,
        Statut_Avant: c.STATUT_COMPTE || c.Statut || c.STATUT_EMPOWER || '',
        Statut_Apres: c.STATUT_COMPTE || c.Statut || c.STATUT_EMPOWER || '',
        Resum_IA: resum,
        GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });

      // 2. Mise à jour dernière action sur la cible (comptes OU leads)
      const maj = { Date_Derniere_Action: dateISOLocale(), Type_Derniere_Action: 'Mailing' };
      if (s.cible.type === 'compte') {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', s.cible.id, maj);
        const local = s.comptes.find(x => String(x.ID_Compte) === String(s.cible.id));
        if (local) Object.assign(local, maj);
      } else {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', s.cible.id, maj);
        const local = s.prospects.find(x => String(x.ID_Prospect) === String(s.cible.id));
        if (local) Object.assign(local, maj);
      }

      Toast.afficher(`✅ Mailing loggué : ${s.cible.nom}`, 'succes', 4000);
      s.cible = null; s.motifs = []; s.note = ''; s.recherche = '';
      s.envoiEnCours = false;
      await this._chargerJournal();
      this.render();
    } catch(e) {
      s.envoiEnCours = false;
      this.render();
      Toast.afficher('❌ ' + e.message, 'erreur');
    }
  },

  // ── Journal (historique des mailings loggués) — toujours re-render en fin
  // de chargement (pas seulement en mode JOURNAL) : le badge "Journal (N)" de
  // l'onglet doit rester juste même quand l'appel vient de valider() en mode
  // BASE (sinon le compteur affichait 0 jusqu'au prochain changement d'onglet).
  async _chargerJournal() {
    this.state.journalChargement = true;
    this.render();
    try {
      const data = await SheetsAPI.lire('EMPOWER_MDB', '📊_ACTIONS');
      this.state.journal = data
        .filter(a => a.Type_Action === 'Mailing')
        .filter(a => Session.voitTout() || Number(a.PIN_CDS) === Session.pin)
        .sort((a, b) => (b.Date_Action || '').localeCompare(a.Date_Action || ''));
    } catch(e) { Toast.afficher('❌ Chargement journal : ' + e.message, 'erreur'); }
    this.state.journalChargement = false;
    this.render();
  },

  setJournalRecherche(v) {
    this.state.journalRecherche = v;
    const zone = document.getElementById('mailing-journal-zone');
    if (zone) zone.innerHTML = this._renderJournalListe();
  },
  setJournalFiltreCDS(pin) {
    this.state.journalFiltreCDS = pin;
    const zone = document.getElementById('mailing-journal-zone');
    if (zone) zone.innerHTML = this._renderJournalListe();
  },

  get journalFiltre() {
    let l = this.state.journal;
    if (Session.voitTout() && this.state.journalFiltreCDS !== 'TOUS') {
      l = l.filter(a => String(a.PIN_CDS) === String(this.state.journalFiltreCDS));
    }
    const q = this.state.journalRecherche ? normaliserNom(this.state.journalRecherche) : '';
    if (q.length >= 2) l = l.filter(a => normaliserNom(a.Nom_Compte || '').includes(q));
    return l;
  },

  // ── Rendu ──
  render() {
    const s = this.state;
    if (!s) return;
    document.getElementById('app').innerHTML = `
      ${NavBar('mailing')}
      <main class="app-contenu">
        <div class="app-header-page">
          <h1>📧 Mailing</h1>
          <p class="app-header-sous">Logguer un mailing envoyé — compte base ou lead Tracker</p>
        </div>
        ${s.chargement ? '<div class="q-champs"><div style="padding:32px;text-align:center;color:var(--c-text-2)">Chargement…</div></div>' : this._renderCorps()}
      </main>`;
  },

  _renderTabs() {
    const s = this.state;
    return `<div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface);margin-bottom:14px">
      <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:${s.mode==='BASE'?'var(--c-title)':'transparent'};color:${s.mode==='BASE'?'#fff':'var(--c-text-2)'}"
              onclick="VueMailing.setMode('BASE')">Nouveau mailing</button>
      <button type="button" style="flex:1;padding:8px 4px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;background:${s.mode==='JOURNAL'?'var(--c-title)':'transparent'};color:${s.mode==='JOURNAL'?'#fff':'var(--c-text-2)'}"
              onclick="VueMailing.setMode('JOURNAL')">Journal (${s.journal.length})</button>
    </div>`;
  },

  _renderCorps() {
    const s = this.state;
    return `<div class="q-champs">
      ${this._renderTabs()}
      ${s.mode === 'JOURNAL' ? this._renderJournal() : (s.cible ? this._renderFormulaire() : this._renderRecherche())}
    </div>`;
  },

  _renderRecherche() {
    const s = this.state;
    return `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input class="q-input" placeholder="🔍 Rechercher un compte ou un lead…" value="${s.recherche || ''}"
               oninput="VueMailing.setRecherche(this.value)" style="flex:2"/>
        ${Session.voitTout() ? `
        <select class="q-input" style="flex:1" onchange="VueMailing.setFiltreCDS(this.value)">
          <option value="TOUS">Tous CDS</option>
          ${s.cdsListe.map(c => `<option value="${c.pin}" ${s.filtreCDS == c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
        </select>` : ''}
      </div>
      <div id="mailing-resultats-zone">${this._renderResultatsZone()}</div>`;
  },

  _renderResultatsZone() {
    const r = this.resultats;
    if (!r.length) return '<div style="padding:24px;text-align:center;color:var(--c-text-2)">Aucun résultat</div>';
    return `<div class="phoning-base-grid">` + r.map(x => `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:11px;margin-bottom:8px;display:flex;align-items:center;gap:10px;cursor:pointer"
           onclick="VueMailing.choisirCible('${x.type}','${x.id}')">
        <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;background:${x.type==='compte'?'var(--c-title)':'var(--c-warning)'};color:#fff">${x.type==='compte'?'COMPTE':'LEAD'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.nom}</div>
          <div style="font-size:12px;color:var(--c-text-2)">${x.obj.Ville || '—'}</div>
        </div>
        <span style="color:var(--c-text-2)">→</span>
      </div>`).join('') + `</div>`;
  },

  _renderFormulaire() {
    const s = this.state;
    const c = s.cible.obj;
    return `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
          <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;background:${s.cible.type==='compte'?'var(--c-title)':'var(--c-warning)'};color:#fff">${s.cible.type==='compte'?'COMPTE':'LEAD'}</span>
          <strong style="font-size:15px">${s.cible.nom}</strong>
        </div>
        <div style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">${c.Ville || '—'}${c.Email ? ' · ' + c.Email : ''}</div>

        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px">Motif(s) du mailing *</label>
        ${QuestionnaireBranching.chipsMultiSelect({ champ: 'motif', options: this.MOTIFS, valeurs: s.motifs, onToggle: 'VueMailing.toggleMotif' })}

        <label style="display:block;font-size:12px;font-weight:600;margin:12px 0 6px">Note <span style="color:var(--c-text-2);font-weight:400">(optionnel)</span></label>
        <textarea class="q-input" rows="3" placeholder="Détail éventuel…" oninput="VueMailing.setNote(this.value)">${s.note}</textarea>

        <div style="display:flex;gap:8px;margin-top:14px">
          <button type="button" class="btn-secondaire" style="flex:1" onclick="VueMailing.fermerCible()">Annuler</button>
          <button type="button" class="btn-primaire" style="flex:2" onclick="VueMailing.valider()" ${s.envoiEnCours ? 'disabled' : ''}>
            ${s.envoiEnCours ? 'Envoi…' : '✅ Enregistrer le mailing'}
          </button>
        </div>
      </div>`;
  },

  _renderJournal() {
    const s = this.state;
    if (s.journalChargement) return '<div style="padding:32px;text-align:center;color:var(--c-text-2)">Chargement du journal…</div>';
    return `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input class="q-input" placeholder="🔍 Filtrer par compte…" value="${s.journalRecherche || ''}"
               oninput="VueMailing.setJournalRecherche(this.value)" style="flex:2"/>
        ${Session.voitTout() ? `
        <select class="q-input" style="flex:1" onchange="VueMailing.setJournalFiltreCDS(this.value)">
          <option value="TOUS">Tous CDS</option>
          ${s.cdsListe.map(c => `<option value="${c.pin}" ${s.journalFiltreCDS == c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
        </select>` : ''}
      </div>
      <div id="mailing-journal-zone">${this._renderJournalListe()}</div>`;
  },

  _renderJournalListe() {
    const l = this.journalFiltre;
    if (!l.length) return '<div style="padding:24px;text-align:center;color:var(--c-text-2)">Aucun mailing loggué</div>';
    return `<div class="phoning-base-grid">` + l.map(a => `
      <div style="background:var(--c-surface);border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:11px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <strong style="font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.Nom_Compte || '—'}</strong>
          <span style="font-size:11px;color:var(--c-text-2)">${(a.Date_Action || '').slice(0, 10)}</span>
        </div>
        <div style="font-size:12px;color:var(--c-text-2)">${resolveCDS(a.PIN_CDS) || ''}</div>
        ${a.Resum_IA ? `<div style="font-size:12px;color:var(--c-text-2);background:var(--c-bg);border-radius:6px;padding:6px 9px;margin-top:6px">${a.Resum_IA}</div>` : ''}
      </div>`).join('') + `</div>`;
  },
};
