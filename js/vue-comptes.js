// ═══════════════════════════════════════
//  vue-comptes.js v6 — Alexandra lecture seule · parseCA/fmtCA · resolveCDS(utils) · filtre Actif dynamique
// ═══════════════════════════════════════

window.VueComptes = {

  state: {
    comptes: [], recherche: '', filtreStatut: 'TOUS',
    // BLOC 07 §8 (09/2026) — quarter FY27 réellement actif (params.QuarterActif),
    // au lieu du Q1 hardcodé historique. Défaut Q1 tant que le fetch n'a pas répondu.
    quarter: 'Q1',
    filtreFiche: 'TOUS',   // TOUS | A_COMPLETER (objectif contacts au 31/12/2026)
    filtrePalier: 'TOUS',  // TOUS | DORMANT | EVEIL | ACTIF | AMBASSADEUR
    filtreEmpower: 'TOUS', // TOUS | EMPOWER | GROSSISTE — dérivé de has_empower (cf. décisions Bloc 1 §6.4)
    filtreCDSPin: 'TOUS',  // BUG-06 : filtre Manager par CDS
    // Base comptes de l'Externe : activité selon l'année, présence au Tracker
    filtreAnnee: 'TOUS',        // FY25 | FY26 | FY27 : année de référence des commandes
    filtreActivite: 'TOUS',     // Externe : TOUS | ACTIF (commande FY27) | A_REACTIVER (FY25/26 sans FY27) | SILENCIEUX (jamais)
    filtreTracker: 'TOUS',      // TOUS | OUI | NON
    trackerIds: new Set(), trackerNoms: new Set(), ajoutEnCours: null,
    triPar: 'PRIORITE', chargement: true,
    triCol: null, triSens: 'asc', // Bloc 4 — tri de colonnes datagrid desktop
    // Bloc 9 refonte desktop — fiche compte en panneau docké (split-view),
    // la liste reste visible et cliquable derrière (≥900px uniquement).
    ficheDockee: null, ficheDockeeChargement: false,
    datesLive: new Map(), // Bloc 1 §6.2 — clé ID_Compte, cf. _calculerDatesLive
    // Feuille de route Phase 2 — vues de filtre sauvegardées
    vuesFiltres: [], vueFiltreActive: null,
  },

  // ── Bloc 1 §6.2 — dates dernière visite / dernier appel / prochaine visite,
  //    calculées depuis visites/phoning plutôt que lues sur un champ figé.
  _calculerDatesLive(visites, appels) {
    const map = new Map();
    const today = dateISOLocale();
    const entree = id => {
      if (!map.has(id)) map.set(id, { dernierVisite: null, dernierAppel: null, prochaineVisite: null });
      return map.get(id);
    };
    (visites || []).forEach(v => {
      const id = String(v.ID_Cible || '').trim();
      if (!id || v.deleted) return;
      const d = String(v.Date || '').slice(0, 10);
      if (!d) return;
      const e = entree(id);
      const statut = String(v.Statut_Visite || '').toLowerCase();
      if (statut === 'realisee') {
        if (!e.dernierVisite || d > e.dernierVisite) e.dernierVisite = d;
      } else if (['planifiee', 'en_cours'].includes(statut) && d >= today) {
        if (!e.prochaineVisite || d < e.prochaineVisite) e.prochaineVisite = d;
      }
    });
    (appels || []).forEach(a => {
      const id = String(a.ID_Cible || '').trim();
      // Bloc Phoning (07/2026) — une réservation planifiée/fermée n'est pas un
      // appel réellement passé (cf. utils.js estAppelRealise) : sinon "dernier
      // contact" avance à aujourd'hui dès qu'un appel futur est programmé.
      if (!id || a.deleted || !estAppelRealise(a)) return;
      const d = String(a.Date || '').slice(0, 10);
      if (!d) return;
      const e = entree(id);
      if (!e.dernierAppel || d > e.dernierAppel) e.dernierAppel = d;
    });
    return map;
  },

  // Dernier contact (visite OU appel, le plus récent des deux) pour un compte —
  // retombe sur le champ figé Date_Derniere_Action si aucune ligne visites/phoning
  // n'existe encore pour ce compte (ex. comptes importés jamais encore travaillés).
  _dernierContact(c) {
    const live = this.state.datesLive.get(String(c.ID_Compte || ''));
    const dates = [live?.dernierVisite, live?.dernierAppel].filter(Boolean);
    if (dates.length) return dates.sort().pop();
    return c.Date_Derniere_Action || c.date_derniere_action || null;
  },

  _prochaineVisite(c) {
    const live = this.state.datesLive.get(String(c.ID_Compte || ''));
    return live?.prochaineVisite || c.Date_Prochaine_Action || null;
  },

  // ── Bloc 9 — fiche compte : docké sur desktop, plein écran sur mobile ──
  ouvrirFiche(idCompte) {
    if (window.innerWidth < 900) { Router.aller('#/compte/' + idCompte); return; }
    this.state.ficheDockee = idCompte;
    this.state.ficheDockeeChargement = true;
    this.render();
    VueFicheCompte._chargerDonnees(idCompte)
      .then(() => { this.state.ficheDockeeChargement = false; this.render(); })
      .catch(e => {
        this.state.ficheDockeeChargement = false;
        Toast.afficher('' + e.message, 'erreur');
        this.state.ficheDockee = null;
        this.render();
      });
  },
  fermerFicheDockee() {
    this.state.ficheDockee = null;
    this.render();
  },
  // Vue SaaS (écran large) : liste compacte à gauche, fiche à droite, sans fenêtre flottante.
  _inline() { return !!this.state.ficheDockee && window.innerWidth >= 1100; },
  _renderSplit(liste) {
    liste = liste || this.listeFiltree;
    const h = x => String(x == null ? '' : x).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const lignes = liste.slice(0, 300).map(c => { const id = String(c.ID_Compte || c._uuid || ''); return `<button class="cs-ligne" aria-current="${id === String(this.state.ficheDockee)}" onclick="VueComptes.ouvrirFiche('${h(id)}')"><b>${h(c.Nom_Compte)}</b><span>${h([c.Ville, c.CANAL].filter(Boolean).join(' · '))}</span></button>`; }).join('');
    const plus = liste.length > 300 ? `<p class="co-mut" style="padding:8px 10px;font-size:12px">${liste.length - 300} autres comptes : affinez la recherche.</p>` : '';
    return `<div class="cs-split"><div class="cs-file" role="list" aria-label="Comptes">${lignes || '<p class="vide">Aucun compte pour ces critères</p>'}${plus}</div><div class="cs-fiche">${this._renderFicheDockee(true)}</div></div>`;
  },
  _renderFicheDockee(inline) {
    if (inline) {
      if (this.state.ficheDockeeChargement) return `<div class="cs-fiche-carte">${skeletonListe(4)}</div>`;
      const c = VueFicheCompte.state.compte;
      return `<div class="cs-fiche-carte"><div class="bloc-titre cs-fiche-entete">${c.Nom_Compte}
          <button class="btn-fermer-fiche" onclick="VueComptes.fermerFicheDockee()" aria-label="Fermer la fiche">&#10005; Fermer</button></div>
          ${VueFicheCompte.renderContenuFiche()}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="btn-action btn-visite" style="width:auto;flex:1" onclick="VueQuestionnaire._visitePlanifiee=null;Router.aller('#/questionnaire/${c.ID_Compte}')">Visite</button>
            <button class="btn-action btn-appel" style="width:auto;flex:1" onclick="Router.aller('#/phoning/${c.ID_Compte}')">Appeler</button>
            <button class="btn-action" style="width:auto;flex:1;background:var(--c-text-2);color:#fff" onclick="VueFicheCompte.ouvrirRapportPhoning()">Rapport</button>
          </div>${VueFicheCompte.state.modalRapportPhoning ? VueFicheCompte._renderModalRapportPhoning() : ''}</div>`;
    }
    if (this.state.ficheDockeeChargement) {
      return `
        <div class="modal-overlay modal-docked" onclick="if(event.target===this)VueComptes.fermerFicheDockee()">
          <div class="modal modal-docked-panel">
            ${skeletonListe(4)}
          </div>
        </div>`;
    }
    const c = VueFicheCompte.state.compte;
    return `
      <div class="modal-overlay modal-docked" onclick="if(event.target===this)VueComptes.fermerFicheDockee()">
        <div class="modal modal-docked-panel" style="overflow-y:auto">
          <div class="bloc-titre cs-fiche-entete">
            ${c.Nom_Compte}
            <button class="btn-fermer-fiche" onclick="VueComptes.fermerFicheDockee()" aria-label="Fermer la fiche">&#10005; Fermer</button>
          </div>
          ${VueFicheCompte.renderContenuFiche()}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <button class="btn-action btn-visite" style="width:auto;flex:1" onclick="VueQuestionnaire._visitePlanifiee=null;Router.aller('#/questionnaire/${c.ID_Compte}')">Visite</button>
            <button class="btn-action btn-appel" style="width:auto;flex:1" onclick="Router.aller('#/phoning/${c.ID_Compte}')">Appeler</button>
            <button class="btn-action" style="width:auto;flex:1;background:var(--c-text-2);color:#fff" onclick="VueFicheCompte.ouvrirRapportPhoning()">Rapport</button>
          </div>
          ${VueFicheCompte.state.modalRapportPhoning ? VueFicheCompte._renderModalRapportPhoning() : ''}
        </div>
      </div>`;
  },

  // ── Bloc 4 refonte desktop : tri de colonnes cliquables (datagrid) ──
  _valeurTriCompte(c, col) {
    switch (col) {
      case 'compte': return normaliserNom(c.Nom_Compte || '');
      case 'ville':  return normaliserNom(c.Ville || '');
      case 'canal':  return normaliserNom(c.CANAL || '');
      case 'fy26':   return window.parseCA(c.CA_FY26) || 0;
      case 'q1fy27': return window.caQuarterActif(c, this.state.quarter) || 0;
      case 'action': { const d = this._prochaineVisite(c); return d ? new Date(d).getTime() : 0; }
      case 'cds':    return window.resolveCDS(c.PIN_CDS_Assigne) || '';
      default:       return '';
    }
  },
  triParColonneCompte(col) {
    if (this.state.triCol === col) this.state.triSens = this.state.triSens === 'asc' ? 'desc' : 'asc';
    else { this.state.triCol = col; this.state.triSens = 'asc'; }
    this.render();
  },
  _indicateurTriCompte(col) {
    if (this.state.triCol !== col) return '';
    return this.state.triSens === 'asc' ? ' ▲' : ' ▼';
  },

  PRIORITE_ORDRE: { 'Rouge': 0, 'Orange': 1, 'Vert': 2 },

  async init() {
    this.state.chargement = true;
    this.render();
    try {
      let [raw, objectifs, cdsApi, visites, appels, params, vuesFiltres] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', 'COMPTES', { nocache: true }),   // CA à jour : jamais le cache de 30 min
        SheetsAPI.lire('EMPOWER_MDB', 'OBJECTIFS_PRIMES'),
        SheetsAPI.lireCDS(), // V5 BUG1 — liste CDS dynamique (inclut Alexandra)
        SheetsAPI.lire('EMPOWER_MDB', 'VISITES').catch(() => []),
        SheetsAPI.lire('EMPOWER_MDB', 'PHONING').catch(() => []),
        SheetsAPI.lire('EMPOWER_MDB', 'PARAMS').catch(() => []),
        VuesFiltres.lister('comptes'),
      ]);
      this.state.vuesFiltres = vuesFiltres;
      initCDSRegistry(objectifs); // BUG-02
      // BLOC 07 §8 — quarter FY27 actif, même pattern que vue-dashboard-manager.js
      const paramMap = Object.fromEntries((params || []).map(p => [p.Parametre, p.Valeur]));
      this.state.quarter = paramMap.QuarterActif || 'Q1';
      // BUG-06 : CDS ne voit que ses comptes dès l'ouverture
      // Magasins Leclerc : masqués tant que le réglage Administration « Afficher les magasins Leclerc » est décoché.
      const _pl = (params || []).find(x => x.Parametre === 'AFFICHER_LECLERC');
      if (String(_pl && _pl.Valeur).toLowerCase() !== 'true') raw = raw.filter(c => !/leclerc/i.test(String(c.Nom_Compte || '')));
      this.state.comptes = raw.filter(c =>
        Session.voitTout() || Session.estExterne() || Number(c.PIN_CDS_Assigne) === Session.pin
      );
      // Lot 3 — le filtre « À reprendre » porte sur TOUS les comptes (un CDS reprend ceux des autres)
      this.state.tousComptes = raw;
      await this._chargerTracker();
      await NonSuivis.charger();
      if (window.AContacter) await AContacter.charger();
      // Bloc 1 §6.2 — dates dernière visite / dernier appel / prochaine visite
      // calculées en direct depuis visites/phoning, pas depuis les champs figés
      // sur comptes (Date_Derniere_Action peut être désynchronisé).
      this.state.datesLive = this._calculerDatesLive(visites, appels);
      // BUG1 audit 2026-07 — le filtre "commercial affecté" doit lister les pins
      // qui apparaissent réellement dans PIN_CDS_Assigne (ADMIN + CDS), jamais les
      // Channels (5000/5001/5002) : un compte n'est jamais assigné à un Channel,
      // donc ces entrées ne filtraient jamais rien et polluaient le menu.
      this._cdsListe = (Array.isArray(cdsApi) && cdsApi.length)
        ? cdsApi.filter(c => ['ADMIN', 'CDS'].includes(String(c.role).toUpperCase()))
                .map(c => ({ pin: Number(c.pin), nom: String(c.nom) }))
        : objectifs.map(o => ({ pin: Number(o.PIN_CDS), nom: o.Nom_CDS }));
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML =
        `<div class="erreur">Erreur chargement comptes : ${e.message}</div>`;
    }
  },

  // Statut compte calculé avec parseCA (immunisé dates corrompues type "11/4/1903")
  // BLOC — même correctif que badgeStatutCompte (helpers.js) : le Statut
  // stocké (mis à jour par un appel/visite ou la conversion Tracker) prime
  // sur le calcul CA, sinon un filtre "Silencieux"/KPI restait incohérent
  // avec le badge affiché sur la carte du même compte.
  _statutCompte(c) { return window.getStatutCompte(c); },

  // ── Base comptes de l'Externe ──────────────────────────────────────
  ANNEES: ['FY25', 'FY26', 'FY27'],
  _caAnnee(c, an) {
    if (an === 'FY27') return window.caFY27Cumul(c) ?? 0;
    return window.parseCA(an === 'FY26' ? c.CA_FY26 : c.CA_FY25) ?? 0;
  },
  _aCommande(c, an) { return this._caAnnee(c, an) > 0; },
  // Statut (tous profils) : règle unique fondée sur les commandes (indépendante du statut stocké).
  _statutCommandes(c) { return ({ actif: 'ACTIF', a_reactiver: 'A_REACTIVER', silencieux: 'SILENCIEUX' })[window.getStatutCompte(c)]; },
  _badgeStatutExterne(c) {
    const m = { ACTIF: ['Actif', 'var(--c-success)'], A_REACTIVER: ['À réactiver', 'var(--c-warning)'], SILENCIEUX: ['Silencieux', 'var(--c-muted)'] };
    const [lib, col] = m[this._statutCommandes(c)];
    return `<span class="v7-statut" style="font-weight:700;color:${col}">${lib}</span>`;
  },
  // Téléphone + e-mail visibles directement sur la carte / la ligne (tous rôles).
  _coordonnees(c) {
    const tel = c.Tel ? String(c.Tel).trim() : '', mail = c.Email ? String(c.Email).trim() : '';
    if (!tel && !mail) return `<div class="cc-coord cc-coord-vide">Téléphone et e-mail à renseigner</div>`;
    const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    return `<div class="cc-coord">${tel ? `<a href="tel:${esc(tel.replace(/\s/g, ''))}" onclick="event.stopPropagation()">&#9990; ${esc(tel)}</a>` : ''}${mail ? `<a href="mailto:${esc(mail)}" onclick="event.stopPropagation()">&#9993; ${esc(mail)}</a>` : ''}</div>`;
  },
  async _chargerTracker() {
    try {
      const leads = await SheetsAPI.lire('EMPOWER_MDB', 'LEADS', { nocache: true });
      const actifs = (leads || []).filter(l => String(l.STATUT_EMPOWER || '').toUpperCase() !== 'ARCHIVE');
      this.state.trackerIds = new Set(actifs.map(l => String(l.ID_Compte_Gas || '')).filter(Boolean));
      this.state.trackerNoms = new Set(actifs.map(l => normaliserNom(l.Nom_Compte || '')).filter(Boolean));
    } catch (e) { /* présence au Tracker indisponible : jamais bloquant */ }
  },
  _auTracker(c) {
    return this.state.trackerIds.has(String(c.ID_Compte || '')) || this.state.trackerNoms.has(normaliserNom(c.Nom_Compte || ''));
  },
  _compteursExterne() {
    const base = this.state.comptes;
    const gros = base.filter(c => !window.estEmpower(c));
    const nb = st => base.filter(c => this._statutCommandes(c) === st).length;
    return {
      tous: base.length,
      actifs: nb('ACTIF'),
      reactiver: nb('A_REACTIVER'),
      silencieux: nb('SILENCIEUX'),
      convertir: gros.length,
      convertirActifs: gros.filter(c => this._statutCommandes(c) === 'ACTIF').length,
      empower: base.length - gros.length,
      auTracker: base.filter(c => this._auTracker(c)).length,
    };
  },
  setAnnee(a) { this.state.filtreAnnee = this.state.filtreAnnee === a ? 'TOUS' : a; this.render(); },
  setActivite(v) { this.state.filtreActivite = this.state.filtreActivite === v ? 'TOUS' : v; this.render(); },
  setTrackerFiltre(v) { this.state.filtreTracker = this.state.filtreTracker === v ? 'TOUS' : v; this.render(); },
  setEmpowerExterne(v) { this.state.filtreEmpower = this.state.filtreEmpower === v ? 'TOUS' : v; this.render(); },
  _renderBarreExterne() {
    const s = this.state, n = this._compteursExterne(), an = s.filtreAnnee;
    const pill = (lib, nb, on, fn) => `<button class="fb-pill ${on ? 'on' : ''}" onclick="${fn}">${lib}${nb != null ? `<b>${nb}</b>` : ''}</button>`;
    const actifs = [];
    const lbSt = { ACTIF: 'Actifs', A_REACTIVER: 'À réactiver', SILENCIEUX: 'Silencieux' };
    if (s.filtreActivite !== 'TOUS') actifs.push([lbSt[s.filtreActivite], `VueComptes.setActivite('${s.filtreActivite}')`]);
    if (an !== 'TOUS') actifs.push(['Commandé en ' + an, `VueComptes.setAnnee('${an}')`]);
    if (s.filtreEmpower === 'GROSSISTE') actifs.push(['À convertir Empower', "VueComptes.setEmpowerExterne('GROSSISTE')"]);
    if (s.filtreEmpower === 'EMPOWER') actifs.push(['Déjà Empower', "VueComptes.setEmpowerExterne('EMPOWER')"]);
    if (s.filtreTracker === 'OUI') actifs.push(['Déjà au Tracker', "VueComptes.setTrackerFiltre('OUI')"]);
    if (s.filtreTracker === 'NON') actifs.push(['Pas au Tracker', "VueComptes.setTrackerFiltre('NON')"]);
    if (s.filtreFiche === 'A_COMPLETER') actifs.push(['Fiche à compléter', "VueComptes.setFiltreFiche('A_COMPLETER')"]);
    const nbRes = this.listeFiltree.length;
    const chips = actifs.map(([l, fn]) => `<button class="fb-chip" onclick="${fn}" title="Retirer ce filtre">${l} &#10005;</button>`).join('');
    return `<div class="barre-externe fb-grille-wrap">
      <div class="fb-grille">
        <div class="fb-lib">STATUT</div>
        <div class="fb-ligne">
          ${pill('Actifs', n.actifs, s.filtreActivite === 'ACTIF', "VueComptes.setActivite('ACTIF')")}
          ${pill('À réactiver', n.reactiver, s.filtreActivite === 'A_REACTIVER', "VueComptes.setActivite('A_REACTIVER')")}
          ${pill('Silencieux', n.silencieux, s.filtreActivite === 'SILENCIEUX', "VueComptes.setActivite('SILENCIEUX')")}
          <span class="fb-aide" title="Actif : a commandé en FY27. À réactiver : a commandé en FY25 ou FY26 mais pas en FY27. Silencieux : n'a jamais commandé.">&#9432; règle</span>
        </div>
        <div class="fb-lib">A COMMANDÉ EN</div>
        <div class="fb-ligne"><span class="fb-seg">${this.ANNEES.map(a => `<button class="${an === a ? 'on' : ''}" onclick="VueComptes.setAnnee('${a}')">${a}</button>`).join('')}</span></div>
        <div class="fb-lib">CANAL</div>
        <div class="fb-ligne">
          ${pill('À convertir Empower', n.convertir, s.filtreEmpower === 'GROSSISTE', "VueComptes.setEmpowerExterne('GROSSISTE')")}
          ${pill('Déjà Empower', n.empower, s.filtreEmpower === 'EMPOWER', "VueComptes.setEmpowerExterne('EMPOWER')")}
        </div>
        <div class="fb-lib">TRACKER</div>
        <div class="fb-ligne">
          ${pill('Déjà au Tracker', n.auTracker, s.filtreTracker === 'OUI', "VueComptes.setTrackerFiltre('OUI')")}
          ${pill('Pas au Tracker', n.tous - n.auTracker, s.filtreTracker === 'NON', "VueComptes.setTrackerFiltre('NON')")}
          ${pill('Fiche à compléter', null, s.filtreFiche === 'A_COMPLETER', "VueComptes.setFiltreFiche('A_COMPLETER')")}
        </div>
      </div>
      <div class="fb-pied">
        <div class="fb-chips">${chips || '<span class="fb-aide">Aucun filtre actif</span>'}</div>
        <div class="fb-droite"><strong>${nbRes} compte${nbRes > 1 ? 's' : ''}</strong>${actifs.length ? ' · <button class="btn-lien" onclick="VueComptes.reinitialiserFiltres()">Réinitialiser</button>' : ''}
          ${Session.estExterne() ? ` · Tri <select onchange="VueComptes.setTri(this.value)">
            <option value="CA" ${s.triPar === 'CA' ? 'selected' : ''}>CA FY27 ↓</option>
            <option value="NOM" ${s.triPar === 'NOM' ? 'selected' : ''}>Nom A→Z</option>
            <option value="PRIORITE" ${s.triPar === 'PRIORITE' ? 'selected' : ''}>Priorité</option>
          </select>` : ''}</div>
      </div>
    </div>`;
  },
  _badgesExterne(c) {
    const pill = an => { const v = this._caAnnee(c, an); return `<span class="v7-statut" style="font-size:11px;color:${v > 0 ? 'var(--c-success)' : 'var(--c-muted)'}" title="${an} : ${v > 0 ? window.fmtCA(v) + ' €' : 'aucune commande'}">${an} ${v > 0 ? '✓' : '–'}</span>`; };
    return `${this.ANNEES.map(pill).join('')}${this._auTracker(c) ? '<span class="v7-statut" style="font-size:11px;color:var(--c-primary);font-weight:700">Au Tracker</span>' : ''}`;
  },
  _boutonTracker(c, style) {
    if (!Session.estExterne() || window.estEmpower(c) || this._auTracker(c)) return '';
    const id = String(c.ID_Compte || '').replace(/'/g, "\\'");
    return `<button class="btn-visiter" style="${style || ''}" ${this.state.ajoutEnCours ? 'disabled' : ''} onclick="VueComptes.ajouterAuTracker('${id}')">Ajouter au Tracker</button>`;
  },
  ajouterAuTracker(idCompte) {
    const c = this.state.comptes.find(x => String(x.ID_Compte) === String(idCompte));
    if (!c) return;
    ConfirmModal.demander({
      titre: `Ajouter ${c.Nom_Compte} au Tracker ?`,
      message: 'Démarre le suivi d\'onboarding EMPOWER de ce grossiste. Le commercial du compte est prévenu.',
      champ: { placeholder: 'Note (optionnel) : contexte, pourquoi maintenant…' },
      labelConfirmer: 'Ajouter au Tracker',
      onConfirm: note => this.ajouterAuTrackerRpc(c, note).then(ok => { if (ok) this.render(); }),
    });
  },
  // Appel partagé avec la fiche compte : crée le lead lié au compte (fonction base, droits Externe).
  async ajouterAuTrackerRpc(c, note) {
    if (this.state.ajoutEnCours) return false;
    this.state.ajoutEnCours = c.ID_Compte;
    try {
      const { data, error } = await SheetsAPI._sb.rpc('compte_vers_tracker', { p_compte: c._uuid, p_note: note || null });
      if (error) throw new Error(error.message);
      if (!data || data.ok !== true) {
        if (data && data.deja) { this.state.trackerIds.add(String(c.ID_Compte || '')); }
        throw new Error((data && data.erreur) || 'Ajout impossible');
      }
      this.state.trackerIds.add(String(c.ID_Compte || ''));
      this.state.trackerNoms.add(normaliserNom(c.Nom_Compte || ''));
      Toast.afficher(`${c.Nom_Compte} ajouté au Tracker`, 'succes', 5000);
      return true;
    } catch (e) {
      Toast.afficher('' + e.message, 'erreur');
      return false;
    } finally {
      this.state.ajoutEnCours = null;
    }
  },

  get listeFiltree() {
    let l = this.state.filtreStatut === 'A_REPRENDRE'
      ? NonSuivis.aReprendre(this.state.tousComptes || [])
      : [...this.state.comptes];

    // Recherche texte case-insensitive — Nom, Ville, CP, Dept, Canal, Secteur
    const q = normaliserNom(this.state.recherche);
    if (q) l = l.filter(c =>
      normaliserNom(c.Nom_Compte   || '').includes(q) ||
      normaliserNom(c.Ville        || '').includes(q) ||
      (c.Code_Postal  || '').startsWith(this.state.recherche.trim()) ||
      normaliserNom(c.Departement  || '').includes(q) ||
      normaliserNom(c.CANAL        || '').includes(q) ||
      normaliserNom(c.SECTEUR      || '').includes(q)
    );

    // Filtre EMPOWER / GROSSISTE — dérivé de has_empower, pas de string-matching
    if (this.state.filtreEmpower === 'EMPOWER') {
      l = l.filter(c => window.estEmpower(c));
    } else if (this.state.filtreEmpower === 'GROSSISTE') {
      l = l.filter(c => !window.estEmpower(c));
    }

    {
      const an = this.state.filtreAnnee;
      if (this.state.filtreActivite !== 'TOUS') l = l.filter(c => this._statutCommandes(c) === this.state.filtreActivite);
      if (an !== 'TOUS') l = l.filter(c => this._aCommande(c, an));
      if (this.state.filtreTracker === 'OUI') l = l.filter(c => this._auTracker(c));
      else if (this.state.filtreTracker === 'NON') l = l.filter(c => !this._auTracker(c));
    }
    if (this.state.filtreFiche === 'A_COMPLETER') l = l.filter(c => !window.ContactsObjectif.etat(c).contact);
    if (this.state.filtrePalier !== 'TOUS') l = l.filter(c => window.Paliers.palier(c).cle === this.state.filtrePalier);

    // Filtre statut calculé dynamiquement (parseCA — résistant aux dates corrompues)
    if (this.state.filtreStatut === 'actif') {
      l = l.filter(c => this._statutCompte(c) === 'actif');
    } else if (this.state.filtreStatut === 'a_reactiver') {
      l = l.filter(c => this._statutCompte(c) === 'a_reactiver');
    } else if (this.state.filtreStatut === 'silencieux') {
      l = l.filter(c => this._statutCompte(c) === 'silencieux');
    } else if (this.state.filtreStatut === 'SANS_CDS') {
      l = l.filter(c => !c.PIN_CDS_Assigne);
    } else if (this.state.filtreStatut === 'A_TRAITER') {
      const ids = new Set(this._aTraiter().map(x => String(x.c.ID_Compte || x.c._uuid)));
      l = l.filter(c => ids.has(String(c.ID_Compte || c._uuid)));
    }
    // « À reprendre » : on garde l'ordre CA décroissant (les bons comptes d'abord)
    const garderOrdreCA = this.state.filtreStatut === 'A_REPRENDRE';

    // Filtre CDS pour Manager/Admin uniquement
    if (Session.voitTout() && this.state.filtreCDSPin !== 'TOUS') {
      l = l.filter(c => String(c.PIN_CDS_Assigne) === String(this.state.filtreCDSPin));
    }

    if (garderOrdreCA && !this.state.triCol) return l;
    // Tri — colonne cliquable (Bloc 4) prioritaire sur le select existant
    if (this.state.triCol) {
      const col = this.state.triCol, sens = this.state.triSens === 'asc' ? 1 : -1;
      l.sort((a, b) => {
        const va = this._valeurTriCompte(a, col), vb = this._valeurTriCompte(b, col);
        if (va < vb) return -1 * sens;
        if (va > vb) return  1 * sens;
        return 0;
      });
      return l;
    }
    // Tri — parseCA pour CA (résistant aux dates corrompues)
    if (this.state.triPar === 'PRIORITE')
      l.sort((a, b) => (this.PRIORITE_ORDRE[a.Priorite] ?? 9) - (this.PRIORITE_ORDRE[b.Priorite] ?? 9));
    if (this.state.triPar === 'CA')
      l.sort((a, b) => window.caFY27Complet(b) - window.caFY27Complet(a));
    if (this.state.triPar === 'NOM')
      l.sort((a, b) => String(a.Nom_Compte || '').localeCompare(String(b.Nom_Compte || '')));
    return l;
  },

  _badgePriorite(p) {
    const map = { Rouge: 'badge-rouge', Orange: 'badge-orange', Vert: 'badge-vert' };
    return p ? `<span class="badge-priorite ${map[p] || ''}">${p}</span>` : '';
  },

  // Demande commerciaux — un compte peut apparaître deux fois (import Sell-In
  // + création manuelle/pipeline, notamment) sans que rien ne l'indique dans
  // la liste. Calculé sur le portefeuille complet (pas la liste filtrée) pour
  // rester correct même quand la recherche/le filtre courant ne montre qu'un
  // des deux doublons. Comparaison par nom normalisé (accents/casse/espaces).
  _doublonsSet() {
    const compte = new Map();
    (this.state.comptes || []).forEach(c => {
      const nom = normaliserNom(c.Nom_Compte || '');
      if (!nom) return;
      compte.set(nom, (compte.get(nom) || 0) + 1);
    });
    return new Set([...compte.entries()].filter(([, n]) => n > 1).map(([nom]) => nom));
  },

  // Flag EMPOWER / GROSSISTE — visible au premier coup d'œil (Bloc 1 §6.3/6.4).
  // Le flag "éclair" sur un compte GROSSISTE signale un potentiel onboarding.
  _badgeEmpower(c) {
    return window.FlagsCanal.html(c) + ' ' + window.Paliers.badgePalier(c) + ' ' + window.ContactsObjectif.pastille(c);
  },

  setFiltreFiche(v) { this.state.filtreFiche = this.state.filtreFiche === v ? 'TOUS' : v; this.render(); },
  setFiltrePalier(v) { this.state.filtrePalier = this.state.filtrePalier === v ? 'TOUS' : v; this.render(); },

  // Jauges d'objectif en tête de liste (contacts au 31/12/2026, activation Empower)
  _renderJauges() {
    const cs = this.state.comptes, emp = cs.filter(c => window.estEmpower(c));
    const act = emp.filter(c => window.FlagsCanal.active(c)).length, pctAct = emp.length ? Math.round(act / emp.length * 100) : 0;
    return `<div class="cs-suivi" style="margin-bottom:12px"><div class="bloc-titre" style="margin-bottom:8px">Suivi du remplissage des comptes · objectif 31/12/2026</div>${ContactsObjectif.renderSuivi(cs)}</div>
    <div class="cs-jauges">
      <div class="cs-jauge"><div class="bloc-titre" style="margin-bottom:8px">Activation Empower</div>
        <div style="font-size:28px;font-weight:800;color:var(--c-title);line-height:1">${act}<span style="font-size:15px;font-weight:600;color:var(--c-text-2)"> / ${emp.length}</span></div>
        <div style="height:10px;border-radius:5px;background:var(--c-border);overflow:hidden;margin-top:10px"><div style="height:100%;width:${pctAct}%;background:#FF6D68"></div></div>
        <div style="font-size:12px;color:var(--c-text-2);margin-top:8px">${pctAct} % des comptes Empower ont passé une première commande. ${emp.length - act} à relancer.</div></div>
    </div>`;
  },
  _renderPuces() {
    const s = this.state, pal = [['DORMANT', 'Dormant'], ['EVEIL', 'Éveil'], ['ACTIF', 'Actif'], ['AMBASSADEUR', 'Ambassadeur']];
    const nbFiche = s.comptes.filter(c => !ContactsObjectif.etat(c).contact).length;
    return `<div class="cs-puces" role="group" aria-label="Filtres objectifs">
      ${pal.map(([k, l]) => `<button class="cs-puce" aria-pressed="${s.filtrePalier === k}" onclick="VueComptes.setFiltrePalier('${k}')">${l}</button>`).join('')}</div>`;
  },


  // ── Panneau « À traiter » : file de travail priorisée (un motif par compte) ──
  _aTraiter() {
    const today = dateISOLocale();
    const vu = new Set(), out = [];
    const ajouter = (c, motif, rang, detail) => {
      const id = String(c.ID_Compte || c._uuid);
      if (vu.has(id)) return;
      vu.add(id); out.push({ c, motif, rang, detail });
    };
    const cs = this.state.comptes;
    cs.forEach(c => {
      const d = this._prochaineVisite(c);
      if (d && String(d).slice(0, 10) < today) {
        const j = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
        ajouter(c, 'Relance en retard', 0, `depuis ${j} j`);
      }
    });
    cs.forEach(c => {
      const e = window.AContacter ? AContacter.etat(c) : null;
      if (!e) return;
      ajouter(c, e.Axe === 'P1' ? 'Onboardé sans commande' : 'A commandé, pas encore Empower', e.Axe === 'P1' ? 1 : 2, e.Jours != null && e.Axe === 'P1' ? `${e.Jours} j` : '');
    });
    if (Session.estManager && Session.estManager()) {
      cs.forEach(c => { if (!c.PIN_CDS_Assigne) ajouter(c, 'Non attribué', 3, ''); });
    }
    return out.sort((a, b) => a.rang - b.rang);
  },
  _renderATraiter() {
    const tout = this._aTraiter();
    if (!tout.length) return '';
    const E = window.AContacter ? s => AContacter.esc(s) : s => String(s ?? '');
    const lecture = Session.role === 'CHANNEL_MANAGER' || Session.role === 'EXTERNE';
    const nbParMotif = {};
    tout.forEach(x => { nbParMotif[x.motif] = (nbParMotif[x.motif] || 0) + 1; });
    const resume = Object.entries(nbParMotif).map(([m, n]) => `<span class="at-motif-n"><strong>${n}</strong> ${E(m.toLowerCase())}</span>`).join('');
    const lignes = tout.slice(0, 5).map(x => {
      const c = x.c, id = E(c.ID_Compte);
      return `<div class="at-ligne">
        <div class="at-txt" onclick="VueComptes.ouvrirFiche('${id}')">
          <span class="at-nom">${E(c.Nom_Compte || 'n.c.')}</span>
          <span class="at-motif at-r${x.rang}">${E(x.motif)}${x.detail ? ' · ' + E(x.detail) : ''}${c.Ville ? ' · ' + E(c.Ville) : ''}</span>
        </div>
        ${lecture ? '' : `<div class="at-actions">
          <button class="btn-tel-outline" onclick="Router.aller('#/phoning/${id}')" title="Appeler"><span class="material-symbols-outlined" aria-hidden="true">call</span></button>
          ${c.Email ? `<a class="btn-tel-outline" href="mailto:${E(c.Email)}" title="Écrire"><span class="material-symbols-outlined" aria-hidden="true">mail</span></a>` : ''}
          <button class="btn-visiter" onclick="VueQuestionnaire._visitePlanifiee=null;Router.aller('#/questionnaire/${id}')">Visiter</button>
        </div>`}
      </div>`;
    }).join('');
    const actif = this.state.filtreStatut === 'A_TRAITER';
    return `<section class="at-panneau" aria-label="À traiter">
      <div class="at-tete"><div><h3>À traiter aujourd'hui</h3><div class="at-resume">${resume}</div></div>
        <button class="btn-filtre ${actif ? 'actif' : ''}" onclick="VueComptes.setFiltre('${actif ? 'TOUS' : 'A_TRAITER'}')">${actif ? 'Tout afficher' : `Voir les ${tout.length}`}</button></div>
      ${lignes}
    </section>`;
  },

  // ── Filtres mobiles : pastilles « libellé valeur ▾ » + feuille du bas ──
  _defsFiltres(cdsList) {
    const s = this.state;
    const defs = [
      { cle: 'statut', lib: 'Statut', val: s.filtreStatut, choix: [['TOUS', 'Tous'], ['actif', 'Actif'], ['a_reactiver', 'À réactiver'], ['silencieux', 'Silencieux'], ['A_REPRENDRE', `À reprendre (${NonSuivis.nb()})`], ['A_TRAITER', 'À traiter']].concat(Session.voitTout() ? [['SANS_CDS', 'Sans CDS']] : []) },
      { cle: 'canal', lib: 'Canal', val: s.filtreEmpower, choix: [['TOUS', 'Tous'], ['EMPOWER', 'Empower'], ['GROSSISTE', 'Grossiste']] },
    ];
    if (Session.voitTout()) defs.push({ cle: 'cds', lib: 'Commercial', val: String(s.filtreCDSPin), choix: [['TOUS', 'Tous']].concat(cdsList.map(c => [String(c.pin), c.nom])) });
    defs.push({ cle: 'tri', lib: 'Tri', val: s.triPar, choix: [['PRIORITE', 'Priorité'], ['CA', 'CA FY27 ↓'], ['NOM', 'Nom A→Z']] });
    return defs;
  },
  _renderPastilles(cdsList) {
    const defs = this._defsFiltres(cdsList);
    const actifs = defs.filter(d => d.cle !== 'tri' && d.val !== 'TOUS').length;
    const pastilles = defs.map(d => {
      const v = (d.choix.find(x => String(x[0]) === String(d.val)) || [0, 'Tous'])[1];
      const on = d.cle !== 'tri' && d.val !== 'TOUS';
      return `<button class="fp ${on ? 'on' : ''}" onclick="VueComptes.ouvrirFeuilleFiltre('${d.cle}')"><span class="fp-l">${d.lib}</span><span class="fp-v">${v}</span><span class="material-symbols-outlined" aria-hidden="true">expand_more</span></button>`;
    }).join('');
    const reinit = actifs ? `<button class="fp fp-raz" onclick="VueComptes.reinitialiserFiltres()" title="Réinitialiser"><span class="material-symbols-outlined" aria-hidden="true">filter_alt_off</span></button>` : '';
    const vues = `<button class="fp ${this.state.vueFiltreActive ? 'on' : ''}" onclick="FeuilleVues.ouvrir('VueComptes')"><span class="material-symbols-outlined" aria-hidden="true">bookmark</span><span class="fp-v">Vues</span></button>`;
    return `<div class="filtres-pastilles">${pastilles}${vues}${reinit}</div>`;
  },
  ouvrirFeuilleFiltre(cle) {
    const cdsList = this._cdsListe || [];
    const d = this._defsFiltres(cdsList).find(x => x.cle === cle);
    if (!d) return;
    this.fermerFeuilleFiltre();
    const el = document.createElement('div');
    el.id = 'feuille-filtre';
    el.innerHTML = `<div class="ff-fond" onclick="VueComptes.fermerFeuilleFiltre()"></div>
      <div class="ff-feuille" role="dialog" aria-label="${d.lib}">
        <div class="ff-poignee"></div><h3>${d.lib}</h3>
        <div class="ff-choix">${d.choix.map(([v, l]) => `<button class="ff-opt ${String(v) === String(d.val) ? 'on' : ''}" onclick="VueComptes.choisirFiltre('${cle}','${v}')">${l}${String(v) === String(d.val) ? '<span class="material-symbols-outlined" aria-hidden="true">check</span>' : ''}</button>`).join('')}</div>
      </div>`;
    document.body.appendChild(el);
  },
  fermerFeuilleFiltre() { const e = document.getElementById('feuille-filtre'); if (e) e.remove(); },
  choisirFiltre(cle, v) {
    this.fermerFeuilleFiltre();
    if (cle === 'statut') this.setFiltre(v);
    else if (cle === 'canal') this.setFiltreEmpower(v);
    else if (cle === 'cds') this.setFiltreCDS(v);
    else if (cle === 'tri') this.setTri(v);
  },
  reinitialiserFiltres() {
    Object.assign(this.state, { filtreFiche: 'TOUS', filtrePalier: 'TOUS', filtreStatut: 'TOUS', filtreEmpower: 'TOUS', filtreCDSPin: 'TOUS', filtreActivite: 'TOUS', filtreTracker: 'TOUS', filtreAnnee: 'TOUS', vueFiltreActive: null });
    this.render();
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = skeletonListe(8);
      return;
    }
    const liste = this.listeFiltree;
    const total = this.state.comptes.length;
    const doublons = this._doublonsSet();
    // KPI synthèse (façon DASHBOARD_W09) — calculés sur le portefeuille du rôle
    const _cs       = this.state.comptes;
    const nbActif   = _cs.filter(c => this._statutCompte(c) === 'actif').length;
    const nbReact   = _cs.filter(c => this._statutCompte(c) === 'a_reactiver').length;
    const caTotalP  = _cs.reduce((s, c) => s + window.caFY27Complet(c), 0);
    const nb45j     = _cs.filter(c => {
      const d = this._dernierContact(c);
      if (!d) return false;
      return (Date.now() - new Date(d).getTime()) / 86400000 > 45;
    }).length;
    if (window.updateNavBadge) updateNavBadge('comptes', nb45j);
    const cdsList = (this._cdsListe || [
      { pin: 1000, nom: 'Tadjidine' }, { pin: 4001, nom: 'Lyes' },
      { pin: 4002, nom: 'Mehdi' },     { pin: 4003, nom: 'Johanne' },
    ]);

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.retour()" class="btn-retour">←</button>
        <h1>Base comptes</h1>
        <span class="badge-compteur" id="comptes-compteur">${liste.length}/${total}</span>
      </header>

      <!-- Onglets Comptes actifs / Historique CA (audit UX § "simplification nav" —
           fusionne Historique CA, auparavant une entrée de nav séparée, en onglet
           interne du même domaine de données que Comptes). -->
      ${Session.estExterne() ? '' : `<div class="tabs-premium" style="padding:10px 12px;background:var(--c-surface);">
        <button class="tab-btn-premium actif">Comptes actifs</button>
        <button class="tab-btn-premium" onclick="Router.aller('#/comptes-historiques')">Historique CA</button>
      </div>`}

      <!-- Jauges d'activation Empower, suivi du remplissage et « À traiter » : réservés à l'écran Tracker, plus affichés ici. -->

      <div class="barre-filtres">
        <input type="search" id="recherche-comptes" class="fb-recherche" placeholder="Rechercher un compte, une ville, un code postal…"
               value="${this.state.recherche}"
               style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;width:100%"
               oninput="VueComptes.setRecherche(this.value)"/>

        ${this._renderBarreExterne()}
        <div class="fb-grille fb-avance">
          ${Session.estExterne() ? '' : `<div class="fb-lib">PALIER</div><div class="fb-ligne">${this._renderPuces()}</div>
          <div class="fb-lib">SUIVI</div>
          <div class="fb-ligne">
            <button class="fb-pill ${this.state.filtreStatut === 'TOUS' ? 'on' : ''}" onclick="VueComptes.setFiltre('TOUS')">Tous</button>
            <button class="fb-pill ${this.state.filtreStatut === 'A_REPRENDRE' ? 'on' : ''}" title="Comptes non suivis : sans propriétaire, SELL IN « non suivi » ou sans activité récente" onclick="VueComptes.setFiltre('A_REPRENDRE')">À reprendre<b>${NonSuivis.nb()}</b></button>
            ${Session.voitTout() ? `<button class="fb-pill ${this.state.filtreStatut === 'SANS_CDS' ? 'on' : ''}" onclick="VueComptes.setFiltre('SANS_CDS')">Sans CDS</button>` : ''}
          </div>
          <div class="fb-lib">TRI</div>
          <div class="fb-ligne">
            <select class="fb-select" onchange="VueComptes.setTri(this.value)">
              <option value="PRIORITE" ${this.state.triPar === 'PRIORITE' ? 'selected' : ''}>Priorité</option>
              <option value="CA"       ${this.state.triPar === 'CA'       ? 'selected' : ''}>CA FY27 ↓</option>
              <option value="NOM"      ${this.state.triPar === 'NOM'      ? 'selected' : ''}>Nom A→Z</option>
            </select>
            ${Session.voitTout() ? `<select class="fb-select" onchange="VueComptes.setFiltreCDS(this.value)">
              <option value="TOUS">Tous CDS</option>
              ${cdsList.map(c => `<option value="${c.pin}" ${this.state.filtreCDSPin == c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
            </select>` : ''}
          </div>`}
          <div class="fb-lib">VUES</div>
          <div class="fb-ligne filtres-vues filtres-desktop">
            <select class="fb-select" onchange="VueComptes.appliquerVueFiltre(this.value)">
              <option value="">Vues sauvegardées…</option>
              ${this.state.vuesFiltres.map(v => `<option value="${v.id}" ${this.state.vueFiltreActive === v.id ? 'selected' : ''}>${v.nom}</option>`).join('')}
            </select>
            <button class="fb-pill" title="Enregistrer les filtres actuels" onclick="VueComptes.demanderSauvegardeVue()">Enregistrer ces filtres</button>
            ${this.state.vueFiltreActive ? `<button class="fb-pill" title="Supprimer cette vue" onclick="VueComptes.supprimerVueFiltre()">Supprimer la vue</button>` : ''}
          </div>
        </div>
        ${Session.estExterne() ? '' : `<div class="filtres-mobile">${this._renderPastilles(cdsList)}</div>`}
      </div>

      <div class="liste-comptes avec-nav" id="comptes-liste-zone">${this._renderListeZone(liste, doublons, cdsList)}</div>

      ${Session.role !== 'CHANNEL_MANAGER' ? `<button class="fab" onclick="VueQuestionnaire._visitePlanifiee=null;Router.aller('#/questionnaire')" title="Nouvelle visite">＋</button>` : ''}
      ${NavBar('comptes')}
      ${FusionTabs.portefeuille()}
      ${this.state.ficheDockee && !this._inline() ? this._renderFicheDockee() : ''}
    `;
    if (this.state.ficheDockee && !this._inline()) app.querySelectorAll('.barre-filtres, .liste-comptes, .cs-jauges, .kpi-grid-layout').forEach(e => e.classList.add('cs-decale'));
    const champ = document.getElementById('recherche-comptes');
    if (this.state.recherche && champ) {
      champ.focus();
      champ.setSelectionRange(champ.value.length, champ.value.length);
    }
    this._observerSuite();
  },

  // BLOC 11 — extrait de render() : la liste/le tableau, seule partie qui
  // change quand on tape dans la recherche. Recherche/tri/filtre appellent
  // désormais cette méthode isolément (patch de #comptes-liste-zone) plutôt
  // que render() en entier — sinon chaque frappe (après le debounce de
  // setRecherche) détruisait et recréait TOUTE la page, y compris le champ
  // de saisie lui-même : sur les 321 comptes de la liste, cette
  // reconstruction complète prend assez de temps pour qu'une frappe suivante
  // arrive pendant que le champ n'existe plus, corrompant la saisie (lettres
  // qui se réinsèrent au mauvais endroit). Cause confirmée en instrumentant
  // render() en conditions réelles. Même pattern déjà utilisé par
  // VuePhoning._renderBaseGrid()/#ph-base-grid pour cette raison exacte.
  _renderListeZone(liste, doublons, cdsList) {
    if (this._inline()) return this._renderSplit(liste);
    liste    = liste    || this.listeFiltree;
    doublons = doublons || this._doublonsSet();
    cdsList  = cdsList  || (this._cdsListe || [
      { pin: 1000, nom: 'Tadjidine' }, { pin: 4001, nom: 'Lyes' },
      { pin: 4002, nom: 'Mehdi' },     { pin: 4003, nom: 'Johanne' },
    ]);
    // Rendu progressif : 60 comptes d'abord, la suite à l'approche du bas de page (le DOM
    // passe de 2 x 322 lignes à 2 x 60, l'affichage de la page est quasi immédiat).
    const cle = [this.state.recherche, this.state.filtreStatut, this.state.filtreEmpower, this.state.filtreCDSPin,
                 this.state.filtreAnnee, this.state.filtreActivite, this.state.filtreTracker, this.state.filtreFiche,
                 this.state.triPar, this.state.triCol, liste.length].join('|');
    if (this._limiteCle !== cle) { this._limiteCle = cle; this._limite = 60; }
    const total = liste.length;
    const toutes = liste;
    liste = liste.slice(0, this._limite);
    const reste = total - liste.length;
    const suite = reste > 0
      ? `<div class="liste-plus" id="comptes-plus"><button class="btn-secondaire" onclick="VueComptes.afficherPlus()">Afficher les ${Math.min(reste, 100)} suivants (${reste} restants)</button></div>`
      : '';
    return `${toutes.length === 0 ? '<div class="vide">Aucun compte pour ces critères</div>' : `
        <!-- MOBILE : fiches empilées -->
        <div class="mobile-card-list-view">
          ${liste.map(c => {
            // fmtCA : retourne '—' si valeur invalide/nulle/corrompue (date "11/4/1903" → '—')
            const caFY25 = window.fmtCA(c.CA_FY25);
            const caFY26 = window.fmtCA(c.CA_FY26);
            const caQ1   = window.fmtCA(window.caQuarterActif(c, this.state.quarter));
            // resolveCDS (utils.js) : retourne '—' si PIN inconnu — jamais de PIN brut dans l'UI
            const nomCDS = window.resolveCDS(c.PIN_CDS_Assigne) !== 'n.c.'
              ? window.resolveCDS(c.PIN_CDS_Assigne)
              : (c.Nom_CDS ? window.resolveCDS(c.Nom_CDS) : null);
            // Alexandra (CHANNEL_MANAGER) : vue lecture seule — pas d'actions terrain
            const estLectureSeule = Session.role === 'CHANNEL_MANAGER' || Session.role === 'EXTERNE';
            // D1 — Badge "Dernière visite" façon Marvin Sales (calcul live, cf. Bloc 1 §6.2)
            const live = this.state.datesLive.get(String(c.ID_Compte || '')) || {};
            const prochaineVisite = this._prochaineVisite(c);
            const dernActDate = this._dernierContact(c) || '';
            const dernActJours = dernActDate
              ? Math.max(0, Math.floor((Date.now() - new Date(dernActDate).getTime()) / 86400000))
              : null;
            const dernActSem  = dernActJours !== null ? Math.floor(dernActJours / 7) : null;
            const inactif45   = dernActJours !== null && dernActJours > 45;
            // BLOC 06 (09/2026) — pill pleine hardcodée → point + mot (V7 §4)
            const badgeDernier = dernActSem !== null
              ? (dernActSem === 0
                  ? `<span class="v7-statut" style="color:var(--c-success);font-size:11px">Cette semaine</span>`
                  : dernActSem <= 4
                  ? `<span class="v7-statut" style="color:var(--c-warning);font-size:11px">il y a ${dernActSem} sem.</span>`
                  : `<span class="v7-statut" style="color:var(--c-danger);font-size:11px">${dernActSem} sem. sans contact</span>`)
              : '';
            // Badge "dernier appel" (distinct du badgeDernier visite+appel
            // confondus ci-dessus) — répond spécifiquement à "où en est le
            // commercial dans ses appels", cf. demande utilisateur. Purement
            // informatif (pas de code couleur alerte, déjà porté par
            // badgeDernier/alerteInactivite) : la date exacte est dans le title.
            const dernierAppelDate = live.dernierAppel || null;
            const dernierAppelJours = dernierAppelDate
              ? Math.max(0, Math.floor((Date.now() - new Date(dernierAppelDate).getTime()) / 86400000))
              : null;
            const badgeDernierAppel = dernierAppelDate
              ? `<span class="v7-statut" style="color:var(--c-text-2);font-size:11px" title="Dernier appel : ${new Date(dernierAppelDate).toLocaleDateString('fr-FR')}">${
                  dernierAppelJours === 0 ? "aujourd'hui" : dernierAppelJours === 1 ? 'hier' : `il y a ${dernierAppelJours}j`
                }</span>`
              : '';
            const alerteInactivite = inactif45
              ? `<div class="alerte-inactivite"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> INACTIF ${dernActJours}j, aucun contact</div>`
              : '';
            const estDoublon = doublons.has(normaliserNom(c.Nom_Compte || ''));
            return `
          <div class="carte-compte-v2${inactif45 ? ' carte-compte-alerte' : ''}">
            ${alerteInactivite}
            <div class="cc-pills" onclick="VueComptes.ouvrirFiche('${c.ID_Compte}')">
              ${this._badgeStatutExterne(c)}
              <span class="cc-sec">${this._badgeEmpower(c)}</span>
              ${estDoublon ? `<span style="color:var(--c-warning);font-size:11px;font-weight:700" title="Un autre compte porte le même nom, ouvrir la fiche pour supprimer le doublon">Doublon</span>` : ''}
              ${badgeDernier}
              ${NonSuivis.badge(c)}
              ${window.AContacter ? AContacter.badge(c) : ''}
              ${SellInFlag.badge(c)}
              ${this._badgesExterne(c)}
              <span class="cc-sec">${badgeDernierAppel}</span>
              <span class="cc-sec">${this._badgePriorite(c.Priorite)}</span>
              <span class="cc-sec" style="margin-left:auto;font-size:12px;color:var(--c-muted)">FY26 ${caFY26}</span>
              <span class="cc-ca" style="font-size:13px;font-weight:700;color:var(--c-title)" title="${(window.caFY27Detail(c) || []).map(x => x[0] + ' ' + window.fmtCA(x[1]) + ' €').join(' · ')}">FY27 ${window.caFY27Cumul(c) !== null ? window.fmtCA(window.caFY27Cumul(c)) : 'n.c.'} <span style="font-weight:400;font-size:11px;color:var(--c-muted)">${this.state.quarter} ${caQ1 !== 'n.c.' ? caQ1 : 'n.c.'}</span></span>
            </div>
            <div class="cc-nom" onclick="VueComptes.ouvrirFiche('${c.ID_Compte}')">${c.Nom_Compte || 'n.c.'}</div>
            ${this._coordonnees(c)}
            <div class="cc-infos" onclick="VueComptes.ouvrirFiche('${c.ID_Compte}')">
              <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg> ${c.Ville || 'n.c.'}</span>
              <span>${c.CANAL || 'n.c.'}</span>
              ${live.dernierAppel ? `<span title="Dernier appel">${dateRelative(live.dernierAppel)}</span>` : ''}
              ${prochaineVisite ? `
                <span class="${estDepassee(prochaineVisite) ? 'prochaine-action alerte' : ''}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${dateRelative(prochaineVisite)}</span>` : ''}
            </div>
            ${NonSuivis.peutReprendre(c) && estLectureSeule ? `<div class="cc-actions"><button class="btn-visiter" onclick="VueComptes.reprendre('${c.ID_Compte}')">Je reprends ce compte</button></div>` : ''}
            ${Session.estExterne() ? (this._boutonTracker(c) ? `<div class="cc-actions">${this._boutonTracker(c)}</div>` : '') : ''}
            ${estLectureSeule ? `` : `
            <div class="cc-actions">
              ${NonSuivis.peutReprendre(c) ? `<button class="btn-visiter btn-reprendre" onclick="VueComptes.reprendre('${c.ID_Compte}')">Reprendre</button>` : ''}
              <button class="btn-visiter" onclick="VueQuestionnaire._visitePlanifiee=null;Router.aller('#/questionnaire/${c.ID_Compte}')">Visiter</button>
              <button class="btn-tel-outline" onclick="Router.aller('#/phoning/${c.ID_Compte}')" title="Appeler"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
            </div>`}
            ${Session.estManager() ? `
            <div class="cc-infos" style="align-items:center;gap:6px">
              ${nomCDS ? avatarCDS(c.PIN_CDS_Assigne, 22) : ''}
              <span style="font-weight:600">${nomCDS ? nomCDS : '<span style="color:var(--c-warning)">Non attribué</span>'}</span>
              <select style="flex:1;border:1px solid var(--c-border);border-radius:4px;padding:4px 6px;font-size:12px"
                      onchange="VueComptes.attribuer('${c.ID_Compte}', this.value)">
                <option value="">attribuer</option>
                ${cdsList.map(x => `<option value="${x.pin}" ${Number(c.PIN_CDS_Assigne) === x.pin ? 'selected' : ''}>${x.nom}</option>`).join('')}
              </select>
            </div>` : ''}
          </div>`;
          }).join('')}
        </div>

        <!-- DESKTOP (≥900px) : tableau dense avec CA en colonnes -->
        <div class="desktop-table-wrap">
          <table class="desktop-table-data-view">
            <thead><tr>
              <th>Statut</th>
              <th style="cursor:pointer" onclick="VueComptes.triParColonneCompte('compte')">Compte${this._indicateurTriCompte('compte')}</th>
              <th style="cursor:pointer" onclick="VueComptes.triParColonneCompte('ville')">Ville${this._indicateurTriCompte('ville')}</th>
              <th style="cursor:pointer" onclick="VueComptes.triParColonneCompte('canal')">Canal${this._indicateurTriCompte('canal')}</th>
              <th class="num">CA FY25</th>
              <th class="num" style="cursor:pointer" onclick="VueComptes.triParColonneCompte('fy26')">CA FY26${this._indicateurTriCompte('fy26')}</th>
              <th class="num" style="cursor:pointer" onclick="VueComptes.triParColonneCompte('q1fy27')">CA ${this.state.quarter} FY27${this._indicateurTriCompte('q1fy27')}</th>
              <th style="cursor:pointer" onclick="VueComptes.triParColonneCompte('action')">Prochaine action${this._indicateurTriCompte('action')}</th>
              <th style="cursor:pointer" onclick="VueComptes.triParColonneCompte('cds')">CDS${this._indicateurTriCompte('cds')}</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              ${liste.map(c => {
                const caFY25 = window.fmtCA(c.CA_FY25);
                const caFY26 = window.fmtCA(c.CA_FY26);
                const caQ1   = window.fmtCA(window.caQuarterActif(c, this.state.quarter));
                const nomCDS = window.resolveCDS(c.PIN_CDS_Assigne) !== 'n.c.'
                  ? window.resolveCDS(c.PIN_CDS_Assigne)
                  : (c.Nom_CDS ? window.resolveCDS(c.Nom_CDS) : null);
                const estLectureSeule = Session.role === 'CHANNEL_MANAGER' || Session.role === 'EXTERNE';
                const liveRow = this.state.datesLive.get(String(c.ID_Compte || '')) || {};
                const prochaineVisiteRow = this._prochaineVisite(c);
                const pa = prochaineVisiteRow
                  ? `<span class="${estDepassee(prochaineVisiteRow) ? 'prochaine-action alerte' : ''}">${dateRelative(prochaineVisiteRow)}</span>${liveRow.dernierAppel ? `<br><span style="font-size:10px;color:var(--c-muted)">${dateRelative(liveRow.dernierAppel)}</span>` : ''}`
                  : (liveRow.dernierAppel ? `<span style="font-size:11px;color:var(--c-muted)">${dateRelative(liveRow.dernierAppel)}</span>` : 'n.c.');
                const dteDA = this._dernierContact(c) || '';
                const joursDA = dteDA ? Math.max(0, Math.floor((Date.now() - new Date(dteDA).getTime()) / 86400000)) : null;
                const rowStyle = (joursDA !== null && joursDA > 45) ? 'border-left:3px solid var(--c-danger);background:rgba(217,48,37,.04)' : '';
                // Delta % : trimestres FY27 complets contre les mêmes trimestres de FY26 (le trimestre en cours, partiel, n'est pas annualisé)
                let deltaHtml = '';
                const pe = window.caPeriodeEgale(c, this.state.quarter);
                if (pe && pe.fy26 > 0) {
                  const delta = Math.round((pe.fy27 - pe.fy26) / pe.fy26 * 100);
                  const coul = delta >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
                  deltaHtml = `<br><span style="font-size:10px;font-weight:700;color:${coul}" title="FY27 ${pe.trimestres} contre FY26 ${pe.trimestres}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% (${pe.trimestres} vs FY26)</span>`;
                }
                const estDoublonRow = doublons.has(normaliserNom(c.Nom_Compte || ''));
                return `<tr style="${rowStyle}">
                  <td>${this._badgeStatutExterne(c)} ${this._badgeEmpower(c)}<br>${this._badgesExterne(c)}${estDoublonRow ? `<br><span style="font-size:10px;font-weight:700;color:var(--c-warning)" title="Un autre compte porte le même nom">Doublon</span>` : ''}${joursDA !== null && joursDA > 45 ? `<br><span style="font-size:10px;font-weight:700;color:var(--c-danger)">⚠ ${joursDA}j</span>` : ''}</td>
                  <td class="compte-nom" onclick="VueComptes.ouvrirFiche('${c.ID_Compte}')">${c.Nom_Compte || 'n.c.'}${this._coordonnees(c)}</td>
                  <td>${c.Ville || 'n.c.'}</td>
                  <td>${c.CANAL || 'n.c.'}</td>
                  <td class="num" style="color:var(--c-muted)">${caFY25}</td>
                  <td class="num" style="color:var(--c-muted)">${caFY26}</td>
                  <td class="num" style="font-weight:700;color:var(--c-title)">${caQ1 !== 'n.c.' ? caQ1 : caFY26}${deltaHtml}</td>
                  <td>${pa}</td>
                  <td>${Session.estManager() ? `
                    <select style="border:1px solid var(--c-border);border-radius:4px;padding:3px 6px;font-size:12px"
                            onchange="VueComptes.attribuer('${c.ID_Compte}', this.value)">
                      <option value="">${nomCDS ? '' + nomCDS : 'attribuer'}</option>
                      ${cdsList.map(x => `<option value="${x.pin}" ${Number(c.PIN_CDS_Assigne) === x.pin ? 'selected' : ''}>${x.nom}</option>`).join('')}
                    </select>` : (nomCDS || 'n.c.')}</td>
                  <td>${estLectureSeule ? (Session.estExterne() ? (this._boutonTracker(c, 'padding:4px 10px;font-size:12px') || '') : 'n.c.') : `
                    <button class="btn-visiter" style="padding:4px 10px;font-size:12px" onclick="VueQuestionnaire._visitePlanifiee=null;Router.aller('#/questionnaire/${c.ID_Compte}')">Visiter</button>
                    <button class="btn-tel-outline" style="padding:4px 8px" onclick="Router.aller('#/phoning/${c.ID_Compte}')" title="Appeler"><span class="material-symbols-outlined" aria-hidden="true">call</span></button>`}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${suite}`}`;
  },

  // Lot 3/4 — réattribution manager via reattribuer_compte() : historisée, notifiée, CA par commercial recalculé.
  async attribuer(idCompte, pin) {
    // Lecture seule pour CHANNEL_MANAGER (Alexandra) — jamais d'écriture
    if (!pin || Session.role === 'CHANNEL_MANAGER') return;
    if (!Session.estManager()) return;
    const nom = window.resolveCDS(pin); // utils.js — retourne '—' si inconnu
    if (nom === 'n.c.') { Toast.afficher('CDS inconnu', 'erreur'); return; }
    const c = this.state.comptes.find(x => String(x.ID_Compte) === String(idCompte));
    if (!c) return;
    await NonSuivis.reattribuer(c, Number(pin), () => this.init());
  },

  // Lot 3 — reprise d'un compte non suivi (CDS).
  reprendre(idCompte) {
    const c = (this.state.tousComptes || []).find(x => String(x.ID_Compte) === String(idCompte));
    if (c) NonSuivis.reprendre(c, () => this.init());
  },

  // Affiche les comptes suivants (bouton ou approche du bas de page) sans toucher aux filtres.
  afficherPlus() {
    this._limite = (this._limite || 60) + 100;
    const zone = document.getElementById('comptes-liste-zone');
    if (zone) zone.innerHTML = this._renderListeZone();
    this._observerSuite();
  },
  _observerSuite() {
    if (this._obs) { this._obs.disconnect(); this._obs = null; }
    const cible = document.getElementById('comptes-plus');
    if (!cible || !('IntersectionObserver' in window)) return;
    this._obs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) this.afficherPlus(); }, { rootMargin: '600px' });
    this._obs.observe(cible);
  },

  // BLOC 11 — patch ciblé de la zone liste au lieu d'un render() complet (cf.
  // commentaire sur _renderListeZone) : garde le champ de saisie intact.
  setRecherche: debounce(function(v) {
    VueComptes.state.recherche = v;
    const zone = document.getElementById('comptes-liste-zone');
    if (zone) {
      zone.innerHTML = VueComptes._renderListeZone();
      const compteur = document.getElementById('comptes-compteur');
      if (compteur) compteur.textContent = `${VueComptes.listeFiltree.length}/${VueComptes.state.comptes.length}`;
      VueComptes._observerSuite();
    } else VueComptes.render(); // repli si la zone n'est pas encore montée
  }, 250),
  setFiltre(s)    { this.state.filtreStatut = s; this.render(); },
  setFiltreEmpower(c) { this.state.filtreEmpower = c; this.render(); },
  setFiltreCDS(p) { this.state.filtreCDSPin = p; this.render(); },
  setTri(t)       { this.state.triPar = t; this.state.triCol = null; this.render(); },

  // ── Feuille de route Phase 2 — vues de filtre sauvegardées ──
  demanderSauvegardeVue() {
    ConfirmModal.demander({
      titre: 'Enregistrer cette vue',
      detail: 'Statut, filtre EMPOWER, CDS, tri et recherche actuels seront mémorisés sous ce nom.',
      champ: { placeholder: 'ex : Mes comptes actifs à relancer' },
      labelConfirmer: 'Enregistrer',
      onConfirm: nom => this._sauvegarderVue(nom),
    });
  },

  async _sauvegarderVue(nom) {
    if (!nom || !nom.trim()) { Toast.afficher('Nom requis', 'warning'); return; }
    const s = this.state;
    const filtres = {
      recherche: s.recherche, filtreStatut: s.filtreStatut,
      filtreEmpower: s.filtreEmpower, filtreCDSPin: s.filtreCDSPin, triPar: s.triPar,
    };
    try {
      await VuesFiltres.sauvegarder('comptes', nom, filtres);
      s.vuesFiltres = await VuesFiltres.lister('comptes');
      Toast.afficher(`Vue "${nom}" enregistrée`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('' + e.message, 'erreur'); }
  },

  appliquerVueFiltre(id) {
    if (!id) { this.state.vueFiltreActive = null; this.render(); return; }
    const v = this.state.vuesFiltres.find(x => String(x.id) === String(id));
    if (!v) return;
    const f = v.filtres_json || {};
    Object.assign(this.state, {
      recherche: f.recherche || '', filtreStatut: f.filtreStatut || 'TOUS',
      filtreEmpower: f.filtreEmpower || 'TOUS', filtreCDSPin: f.filtreCDSPin || 'TOUS',
      triPar: f.triPar || 'PRIORITE', vueFiltreActive: id,
    });
    this.render();
  },

  async supprimerVueFiltre() {
    const id = this.state.vueFiltreActive;
    if (!id) return;
    try {
      await VuesFiltres.supprimer(id);
      this.state.vuesFiltres = this.state.vuesFiltres.filter(v => String(v.id) !== String(id));
      this.state.vueFiltreActive = null;
      Toast.afficher('Vue supprimée', 'succes');
      this.render();
    } catch(e) { Toast.afficher('' + e.message, 'erreur'); }
  },
};
