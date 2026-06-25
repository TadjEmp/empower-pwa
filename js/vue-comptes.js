// ═══════════════════════════════════════
//  vue-comptes.js v6 — Alexandra lecture seule · parseCA/fmtCA · resolveCDS(utils) · filtre Actif dynamique
// ═══════════════════════════════════════

window.VueComptes = {

  state: {
    comptes: [], recherche: '', filtreStatut: 'TOUS',
    filtreCanal: 'TOUS',   // BUG-04 : TOUS | LECLERC | REVENDEURS
    filtreCDSPin: 'TOUS',  // BUG-06 : filtre Manager par CDS
    triPar: 'PRIORITE', chargement: true,
  },

  PRIORITE_ORDRE: { 'Rouge': 0, 'Orange': 1, 'Vert': 2 },

  async init() {
    this.state.chargement = true;
    this.render();
    try {
      const [raw, objectifs, cdsApi] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lireCDS(), // V5 BUG1 — liste CDS dynamique (inclut Alexandra)
      ]);
      initCDSRegistry(objectifs); // BUG-02
      // BUG-06 : CDS ne voit que ses comptes dès l'ouverture
      this.state.comptes = raw.filter(c =>
        Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin
      );
      // V5 BUG1 — source de vérité lireCDS (Alexandra incluse) ; fallback OBJECTIFS_PRIMES
      this._cdsListe = (Array.isArray(cdsApi) && cdsApi.length)
        ? cdsApi.map(c => ({ pin: Number(c.pin), nom: String(c.nom) }))
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
  _statutCompte(c) {
    const q1 = window.parseCA(c.CA_Q1FY27);
    if (q1 !== null && q1 > 0) return 'actif';
    const fy26 = window.parseCA(c.CA_FY26);
    if (fy26 !== null && fy26 > 0) return 'a_reactiver';
    return 'silencieux';
  },

  get listeFiltree() {
    let l = [...this.state.comptes];

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

    // Filtre LECLERC / REVENDEURS — case-insensitive inclusif
    if (this.state.filtreCanal === 'LECLERC') {
      l = l.filter(c => normaliserNom(c.CANAL || '').includes('LECLERC'));
    } else if (this.state.filtreCanal === 'REVENDEURS') {
      l = l.filter(c => !normaliserNom(c.CANAL || '').includes('LECLERC'));
    }

    // Filtre statut calculé dynamiquement (parseCA — résistant aux dates corrompues)
    if (this.state.filtreStatut === 'actif') {
      l = l.filter(c => this._statutCompte(c) === 'actif');
    } else if (this.state.filtreStatut === 'a_reactiver') {
      l = l.filter(c => this._statutCompte(c) === 'a_reactiver');
    } else if (this.state.filtreStatut === 'silencieux') {
      l = l.filter(c => this._statutCompte(c) === 'silencieux');
    } else if (this.state.filtreStatut === 'SANS_CDS') {
      l = l.filter(c => !c.PIN_CDS_Assigne);
    }

    // Filtre CDS pour Manager/Admin uniquement
    if (Session.voitTout() && this.state.filtreCDSPin !== 'TOUS') {
      l = l.filter(c => String(c.PIN_CDS_Assigne) === String(this.state.filtreCDSPin));
    }

    // Tri — parseCA pour CA (résistant aux dates corrompues)
    if (this.state.triPar === 'PRIORITE')
      l.sort((a, b) => (this.PRIORITE_ORDRE[a.Priorite] ?? 9) - (this.PRIORITE_ORDRE[b.Priorite] ?? 9));
    if (this.state.triPar === 'CA')
      l.sort((a, b) => (window.parseCA(b.CA_Q1FY27) || window.parseCA(b.CA_FY26) || 0)
                     - (window.parseCA(a.CA_Q1FY27) || window.parseCA(a.CA_FY26) || 0));
    if (this.state.triPar === 'NOM')
      l.sort((a, b) => String(a.Nom_Compte || '').localeCompare(String(b.Nom_Compte || '')));
    return l;
  },

  _badgePriorite(p) {
    const map = { Rouge: 'badge-rouge', Orange: 'badge-orange', Vert: 'badge-vert' };
    return p ? `<span class="badge-priorite ${map[p] || ''}">${p}</span>` : '';
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement des comptes…</div>';
      return;
    }
    const liste = this.listeFiltree;
    const total = this.state.comptes.length;
    // KPI synthèse (façon DASHBOARD_W09) — calculés sur le portefeuille du rôle
    const _cs       = this.state.comptes;
    const nbActif   = _cs.filter(c => this._statutCompte(c) === 'actif').length;
    const nbReact   = _cs.filter(c => this._statutCompte(c) === 'a_reactiver').length;
    const caTotalP  = _cs.reduce((s, c) => s + (window.parseCA(c.CA_Q1FY27) || window.parseCA(c.CA_FY26) || 0), 0);
    const cdsList = (this._cdsListe || [
      { pin: 1000, nom: 'Tadjidine' }, { pin: 4001, nom: 'Lyes' },
      { pin: 4002, nom: 'Mehdi' },     { pin: 4003, nom: 'Johanne' },
      { pin: 5000, nom: 'Alexandra' }, // V5 BUG1
    ]);

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Mes comptes</h1>
        <span class="badge-compteur">${liste.length}/${total}</span>
      </header>

      <!-- KPI synthèse façon DASHBOARD_W09 -->
      <div class="kpi-grid-layout">
        ${kpiCard({ label: 'Comptes',      value: total,    accent: 'primary' })}
        ${kpiCard({ label: 'Actifs',       value: nbActif,  accent: 'teal' })}
        ${kpiCard({ label: 'À réactiver',  value: nbReact,  accent: 'amber' })}
        ${kpiCard({ label: 'CA FY27',      value: window.fmtCA(caTotalP) !== '—' ? window.fmtCA(caTotalP) : '0', unit: '€', accent: 'indigo' })}
      </div>

      <div class="barre-filtres">
        <input type="search" id="recherche-comptes" placeholder="🔍 Compte, ville, CP, département…"
               value="${this.state.recherche}"
               style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;width:100%"
               oninput="VueComptes.setRecherche(this.value)"/>

        <!-- BUG-05 : filtres statut calculé -->
        <div class="filtres-flags">
          <button class="btn-filtre ${this.state.filtreStatut === 'TOUS' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('TOUS')">Tous</button>
          <button class="btn-filtre ${this.state.filtreStatut === 'actif' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('actif')">Actif</button>
          <button class="btn-filtre ${this.state.filtreStatut === 'a_reactiver' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('a_reactiver')">À réactiver</button>
          <button class="btn-filtre ${this.state.filtreStatut === 'silencieux' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('silencieux')">Silencieux</button>
          ${Session.estManager() ? `
          <button class="btn-filtre ${this.state.filtreStatut === 'SANS_CDS' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('SANS_CDS')">Sans CDS</button>` : ''}
        </div>

        <!-- BUG-04 : filtres LECLERC / REVENDEURS -->
        <div class="filtres-flags">
          <button class="btn-filtre ${this.state.filtreCanal === 'TOUS' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltreCanal('TOUS')">Tous canaux</button>
          <button class="btn-filtre ${this.state.filtreCanal === 'LECLERC' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltreCanal('LECLERC')">Leclerc</button>
          <button class="btn-filtre ${this.state.filtreCanal === 'REVENDEURS' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltreCanal('REVENDEURS')">Revendeurs</button>
        </div>

        <div class="filtres-statut" style="display:flex;gap:8px;flex-wrap:wrap">
          <select onchange="VueComptes.setTri(this.value)">
            <option value="PRIORITE" ${this.state.triPar === 'PRIORITE' ? 'selected' : ''}>Priorité</option>
            <option value="CA"       ${this.state.triPar === 'CA'       ? 'selected' : ''}>CA FY27 ↓</option>
            <option value="NOM"      ${this.state.triPar === 'NOM'      ? 'selected' : ''}>Nom A→Z</option>
          </select>
          ${Session.voitTout() ? `
          <!-- BUG-06 : filtre par CDS pour le Manager -->
          <select onchange="VueComptes.setFiltreCDS(this.value)" style="flex:1">
            <option value="TOUS">Tous CDS</option>
            ${cdsList.map(c => `<option value="${c.pin}" ${this.state.filtreCDSPin == c.pin ? 'selected' : ''}>${c.nom}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>

      <div class="liste-comptes avec-nav">
        ${liste.length === 0 ? '<div class="vide">Aucun compte pour ces critères</div>' : `
        <!-- MOBILE : fiches empilées -->
        <div class="mobile-card-list-view">
          ${liste.map(c => {
            // fmtCA : retourne '—' si valeur invalide/nulle/corrompue (date "11/4/1903" → '—')
            const caFY25 = window.fmtCA(c.CA_FY25);
            const caFY26 = window.fmtCA(c.CA_FY26);
            const caQ1   = window.fmtCA(c.CA_Q1FY27);
            // resolveCDS (utils.js) : retourne '—' si PIN inconnu — jamais de PIN brut dans l'UI
            const nomCDS = window.resolveCDS(c.PIN_CDS_Assigne) !== '—'
              ? window.resolveCDS(c.PIN_CDS_Assigne)
              : (c.Nom_CDS ? window.resolveCDS(c.Nom_CDS) : null);
            // Alexandra (CHANNEL_MANAGER) : vue lecture seule — pas d'actions terrain
            const estLectureSeule = Session.role === 'CHANNEL_MANAGER';
            // D1 — Badge "Dernière visite" façon Marvin Sales
            const dernActDate = c.Date_Derniere_Action || c.date_derniere_action || '';
            const dernActSem  = dernActDate
              ? Math.max(0, Math.floor((Date.now() - new Date(dernActDate).getTime()) / (7*86400000)))
              : null;
            const badgeDernier = dernActSem !== null
              ? (dernActSem === 0
                  ? `<span style="font-size:11px;font-weight:700;color:var(--c-success);background:color-mix(in srgb,var(--c-success) 12%,transparent);padding:2px 8px;border-radius:99px;border:1px solid color-mix(in srgb,var(--c-success) 30%,transparent)">Cette semaine</span>`
                  : dernActSem <= 4
                  ? `<span style="font-size:11px;font-weight:700;color:var(--c-warning);background:color-mix(in srgb,var(--c-warning) 12%,transparent);padding:2px 8px;border-radius:99px;border:1px solid color-mix(in srgb,var(--c-warning) 30%,transparent)">il y a ${dernActSem} sem.</span>`
                  : `<span style="font-size:11px;font-weight:700;color:var(--c-danger);background:color-mix(in srgb,var(--c-danger) 12%,transparent);padding:2px 8px;border-radius:99px;border:1px solid color-mix(in srgb,var(--c-danger) 30%,transparent)">${dernActSem} sem. sans contact</span>`)
              : '';
            return `
          <div class="carte-compte-v2">
            <div class="cc-pills" onclick="Router.aller('#/compte/${c.ID_Compte}')">
              ${badgeStatutCompte(c)}
              ${badgeDernier}
              ${this._badgePriorite(c.Priorite)}
              <span style="margin-left:auto;font-size:12px;color:var(--c-muted)">FY26 ${caFY26}</span>
              <span style="font-size:13px;font-weight:700;color:var(--c-title)">FY27 Q1 ${caQ1 !== '—' ? caQ1 : '—'}</span>
            </div>
            <div class="cc-nom" onclick="Router.aller('#/compte/${c.ID_Compte}')">${c.Nom_Compte || '—'}</div>
            <div class="cc-infos" onclick="Router.aller('#/compte/${c.ID_Compte}')">
              <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg> ${c.Ville || '—'}</span>
              <span>${c.CANAL || '—'}</span>
              ${c.Date_prochaine_action ? `
                <span class="${estDepassee(c.Date_prochaine_action) ? 'prochaine-action alerte' : ''}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${dateRelative(c.Date_prochaine_action)}</span>` : ''}
            </div>
            ${estLectureSeule ? `` : `
            <div class="cc-actions">
              <button class="btn-visiter" onclick="Router.aller('#/questionnaire/${c.ID_Compte}')">Visiter</button>
              <button class="btn-tel-outline" onclick="Router.aller('#/phoning/${c.ID_Compte}')" title="Appeler"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 9a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
            </div>`}
            ${Session.estManager() ? `
            <div class="cc-infos" style="align-items:center;gap:6px">
              <span style="font-weight:600">${nomCDS ? nomCDS : '<span style="color:var(--c-warning)">Non attribué</span>'}</span>
              <select style="flex:1;border:1px solid var(--c-border);border-radius:4px;padding:4px 6px;font-size:12px"
                      onchange="VueComptes.attribuer('${c.ID_Compte}', this.value)">
                <option value="">— attribuer —</option>
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
              <th>Statut</th><th>Compte</th><th>Ville</th><th>Canal</th>
              <th class="num">CA FY26</th><th class="num">CA Q1 FY27</th>
              <th>Prochaine action</th><th>CDS</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${liste.map(c => {
                const caFY25 = window.fmtCA(c.CA_FY25);
                const caFY26 = window.fmtCA(c.CA_FY26);
                const caQ1   = window.fmtCA(c.CA_Q1FY27);
                const nomCDS = window.resolveCDS(c.PIN_CDS_Assigne) !== '—'
                  ? window.resolveCDS(c.PIN_CDS_Assigne)
                  : (c.Nom_CDS ? window.resolveCDS(c.Nom_CDS) : null);
                const estLectureSeule = Session.role === 'CHANNEL_MANAGER';
                const pa = c.Date_prochaine_action
                  ? `<span class="${estDepassee(c.Date_prochaine_action) ? 'prochaine-action alerte' : ''}">⏰ ${dateRelative(c.Date_prochaine_action)}</span>`
                  : '—';
                return `<tr>
                  <td>${badgeStatutCompte(c)}</td>
                  <td class="compte-nom" onclick="Router.aller('#/compte/${c.ID_Compte}')">${c.Nom_Compte || '—'}</td>
                  <td>${c.Ville || '—'}</td>
                  <td>${c.CANAL || '—'}</td>
                  <td class="num" style="color:var(--c-muted)">${caFY26}</td>
                  <td class="num" style="font-weight:700;color:var(--c-title)">${caQ1 !== '—' ? caQ1 : caFY26}</td>
                  <td>${pa}</td>
                  <td>${Session.estManager() ? `
                    <select style="border:1px solid var(--c-border);border-radius:4px;padding:3px 6px;font-size:12px"
                            onchange="VueComptes.attribuer('${c.ID_Compte}', this.value)">
                      <option value="">${nomCDS ? '👤 ' + nomCDS : '⚠️ attribuer'}</option>
                      ${cdsList.map(x => `<option value="${x.pin}" ${Number(c.PIN_CDS_Assigne) === x.pin ? 'selected' : ''}>${x.nom}</option>`).join('')}
                    </select>` : (nomCDS || '—')}</td>
                  <td>${estLectureSeule ? '—' : `
                    <button class="btn-visiter" style="padding:4px 10px;font-size:12px" onclick="Router.aller('#/questionnaire/${c.ID_Compte}')">Visiter</button>
                    <button class="btn-tel-outline" style="padding:4px 8px" onclick="Router.aller('#/phoning/${c.ID_Compte}')" title="Appeler">📞</button>`}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
      </div>

      ${Session.role !== 'CHANNEL_MANAGER' ? `<button class="fab" onclick="Router.aller('#/questionnaire')" title="Nouvelle visite" style="bottom:140px">＋</button>` : ''}
      ${NavBar('comptes')}
    `;
    const champ = document.getElementById('recherche-comptes');
    if (this.state.recherche && champ) {
      champ.focus();
      champ.setSelectionRange(champ.value.length, champ.value.length);
    }
  },

  async attribuer(idCompte, pin) {
    // Lecture seule pour CHANNEL_MANAGER (Alexandra) — jamais d'écriture
    if (!pin || Session.role === 'CHANNEL_MANAGER') return;
    if (!Session.estManager()) return;
    const nom = window.resolveCDS(pin); // utils.js — retourne '—' si inconnu
    if (nom === '—') { Toast.afficher('CDS inconnu', 'erreur'); return; }
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', idCompte, {
        PIN_CDS_Assigne: Number(pin), Nom_CDS: nom,
      });
      const c = this.state.comptes.find(x => String(x.ID_Compte) === String(idCompte));
      if (c) { c.PIN_CDS_Assigne = Number(pin); c.Nom_CDS = nom; }
      Toast.afficher(`Compte attribué à ${nom}`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('Erreur : ' + (e.message || e), 'erreur'); }
  },

  setRecherche:   debounce(function(v) { VueComptes.state.recherche = v;      VueComptes.render(); }, 250),
  setFiltre(s)    { this.state.filtreStatut = s; this.render(); },
  setFiltreCanal(c) { this.state.filtreCanal = c; this.render(); },
  setFiltreCDS(p) { this.state.filtreCDSPin = p; this.render(); },
  setTri(t)       { this.state.triPar = t;       this.render(); },
};
