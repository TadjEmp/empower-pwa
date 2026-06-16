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

    // Recherche texte case-insensitive — inclut CANAL et SECTEUR
    const q = normaliserNom(this.state.recherche);
    if (q) l = l.filter(c =>
      normaliserNom(c.Nom_Compte || '').includes(q) ||
      normaliserNom(c.Ville     || '').includes(q) ||
      normaliserNom(c.CANAL     || '').includes(q) ||
      normaliserNom(c.SECTEUR   || '').includes(q)
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
      l.sort((a, b) => (window.parseCA(b.CA_FY26) || 0) - (window.parseCA(a.CA_FY26) || 0));
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

      <div class="barre-filtres">
        <input type="search" id="recherche-comptes" placeholder="🔍 Compte, ville ou canal…"
               value="${this.state.recherche}"
               style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;width:100%"
               oninput="VueComptes.setRecherche(this.value)"/>

        <!-- BUG-05 : filtres statut calculé -->
        <div class="filtres-flags">
          <button class="btn-filtre ${this.state.filtreStatut === 'TOUS' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('TOUS')">Tous</button>
          <button class="btn-filtre ${this.state.filtreStatut === 'actif' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('actif')">🟢 Actif</button>
          <button class="btn-filtre ${this.state.filtreStatut === 'a_reactiver' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('a_reactiver')">🟡 À réactiver</button>
          <button class="btn-filtre ${this.state.filtreStatut === 'silencieux' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('silencieux')">🔴 Silencieux</button>
          ${Session.estManager() ? `
          <button class="btn-filtre ${this.state.filtreStatut === 'SANS_CDS' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('SANS_CDS')">⚠️ Sans CDS</button>` : ''}
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
            <option value="CA"       ${this.state.triPar === 'CA'       ? 'selected' : ''}>CA FY26 ↓</option>
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
            const caFY26 = window.fmtCA(c.CA_FY26);
            const caQ1   = window.fmtCA(c.CA_Q1FY27);
            // resolveCDS (utils.js) : retourne '—' si PIN inconnu — jamais de PIN brut dans l'UI
            const nomCDS = window.resolveCDS(c.PIN_CDS_Assigne) !== '—'
              ? window.resolveCDS(c.PIN_CDS_Assigne)
              : (c.Nom_CDS ? window.resolveCDS(c.Nom_CDS) : null);
            // Alexandra (CHANNEL_MANAGER) : vue lecture seule — pas d'actions terrain
            const estLectureSeule = Session.role === 'CHANNEL_MANAGER';
            return `
          <div class="carte-compte-v2">
            <div class="cc-pills" onclick="Router.aller('#/compte/${c.ID_Compte}')">
              ${badgeStatutCompte(c)}
              ${this._badgePriorite(c.Priorite)}
              <span style="margin-left:auto;font-size:13px;font-weight:700;color:var(--c-title)">FY26 ${caFY26}</span>
            </div>
            <div class="cc-nom" onclick="Router.aller('#/compte/${c.ID_Compte}')">${c.Nom_Compte || '—'}</div>
            <div class="cc-infos" onclick="Router.aller('#/compte/${c.ID_Compte}')">
              <span>📍 ${c.Ville || '—'}</span>
              <span>${c.CANAL || '—'}</span>
              <span style="font-weight:600;color:var(--c-primary)">Q1 : ${caQ1}</span>
              ${c.Date_prochaine_action ? `
                <span class="${estDepassee(c.Date_prochaine_action) ? 'prochaine-action alerte' : ''}">⏰ ${dateRelative(c.Date_prochaine_action)}</span>` : ''}
            </div>
            ${estLectureSeule ? `` : `
            <div class="cc-actions">
              <button class="btn-visiter" onclick="Router.aller('#/questionnaire/${c.ID_Compte}')">Visiter</button>
              <button class="btn-tel-outline" onclick="Router.aller('#/phoning/${c.ID_Compte}')" title="Appeler">📞</button>
            </div>`}
            ${Session.estManager() ? `
            <div class="cc-infos" style="align-items:center;gap:6px">
              <span style="font-weight:600">${nomCDS ? '👤 ' + nomCDS : '⚠️ Non attribué'}</span>
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
                  <td class="num" style="font-weight:700;color:var(--c-title)">${caFY26}</td>
                  <td class="num" style="font-weight:600;color:var(--c-primary)">${caQ1}</td>
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
