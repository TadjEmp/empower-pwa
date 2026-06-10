// ═══════════════════════════════════════
//  vue-comptes.js — Liste Mes Comptes
//  Source : 🏢_COMPTES (filtré par PIN CDS)
// ═══════════════════════════════════════

window.VueComptes = {

  state: {
    comptes: [], recherche: '', filtreStatut: 'TOUS',
    triPar: 'PRIORITE', chargement: true,
  },

  PRIORITE_ORDRE: { 'Rouge': 0, 'Orange': 1, 'Vert': 2 },
  CDS: [ { pin: 1000, nom: 'Tadjidine' }, { pin: 4001, nom: 'Lyes' }, { pin: 4002, nom: 'Mehdi' }, { pin: 4003, nom: 'Johanne' } ],

  async init() {
    this.state.chargement = true;
    this.render();
    try {
      const raw = await SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES');
      this.state.comptes = raw.filter(c =>
        Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin
      );
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML =
        `<div class="erreur">Erreur chargement comptes : ${e.message}</div>`;
    }
  },

  get listeFiltree() {
    let l = [...this.state.comptes];
    const q = normaliserNom(this.state.recherche);
    if (q) l = l.filter(c => normaliserNom(c.Nom_Compte).includes(q) || normaliserNom(c.Ville).includes(q));
    if (this.state.filtreStatut === 'SANS_CDS')
      l = l.filter(c => !c.PIN_CDS_Assigne);
    else if (this.state.filtreStatut !== 'TOUS')
      l = l.filter(c => String(c.STATUT_COMPTE || '').toUpperCase() === this.state.filtreStatut);
    if (this.state.triPar === 'PRIORITE')
      l.sort((a, b) => (this.PRIORITE_ORDRE[a.Priorite] ?? 9) - (this.PRIORITE_ORDRE[b.Priorite] ?? 9));
    if (this.state.triPar === 'CA')  l.sort((a, b) => Number(b.CA_FY25 || 0) - Number(a.CA_FY25 || 0));
    if (this.state.triPar === 'NOM') l.sort((a, b) => String(a.Nom_Compte).localeCompare(String(b.Nom_Compte)));
    return l;
  },

  _badgePriorite(p) {
    const map = { Rouge: 'badge-rouge', Orange: 'badge-orange', Vert: 'badge-vert' };
    return p ? `<span class="badge-priorite ${map[p] || ''}">${p}</span>` : '';
  },

  _pillStatut(s) {
    const slug = slugify(s || '');
    return s ? `<span class="statut-pill statut-${slug.replace(/-/g,'_')}">${s}</span>` : '';
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement des comptes…</div>';
      return;
    }
    const liste = this.listeFiltree;
    const statuts = [...new Set(this.state.comptes.map(c => String(c.STATUT_COMPTE || '').toUpperCase()).filter(Boolean))];

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Mes comptes</h1>
        <span class="badge-compteur">${liste.length}/${this.state.comptes.length}</span>
      </header>

      <div class="barre-filtres">
        <input type="search" id="recherche-comptes" placeholder="🔍 Rechercher un compte ou une ville…"
               value="${this.state.recherche}"
               style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;width:100%"
               oninput="VueComptes.setRecherche(this.value)"/>
        <div class="filtres-flags">
          <button class="btn-filtre ${this.state.filtreStatut === 'TOUS' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('TOUS')">Tous</button>
          ${Session.estManager() ? `
          <button class="btn-filtre ${this.state.filtreStatut === 'SANS_CDS' ? 'actif' : ''}"
                  onclick="VueComptes.setFiltre('SANS_CDS')">⚠️ Sans CDS (${this.state.comptes.filter(c => !c.PIN_CDS_Assigne).length})</button>` : ''}
          ${statuts.map(s => `
            <button class="btn-filtre ${this.state.filtreStatut === s ? 'actif' : ''}"
                    onclick="VueComptes.setFiltre('${s}')">${s}</button>`).join('')}
        </div>
        <div class="filtres-statut">
          <select onchange="VueComptes.setTri(this.value)">
            <option value="PRIORITE" ${this.state.triPar === 'PRIORITE' ? 'selected' : ''}>Priorité</option>
            <option value="CA" ${this.state.triPar === 'CA' ? 'selected' : ''}>CA décroissant</option>
            <option value="NOM" ${this.state.triPar === 'NOM' ? 'selected' : ''}>Nom A→Z</option>
          </select>
        </div>
      </div>

      <div class="liste-comptes avec-nav">
        ${liste.length === 0 ? '<div class="vide">Aucun compte pour ces critères</div>'
          : liste.map(c => `
          <div class="carte-compte-v2">
            <div class="cc-pills" onclick="Router.aller('#/compte/${c.ID_Compte}')">
              ${this._pillStatut(c.STATUT_COMPTE)} ${this._badgePriorite(c.Priorite)}
              <span style="margin-left:auto;font-size:14px;font-weight:700;color:var(--c-title)">${formatEuro(c.CA_FY25)}</span>
            </div>
            <div class="cc-nom" onclick="Router.aller('#/compte/${c.ID_Compte}')">${c.Nom_Compte}</div>
            <div class="cc-infos" onclick="Router.aller('#/compte/${c.ID_Compte}')">
              <span>📍 ${c.Ville || '—'}</span><span>${c.CANAL || '—'}</span>
              ${c.Date_prochaine_action ? `
                <span class="${estDepassee(c.Date_prochaine_action) ? 'prochaine-action alerte' : ''}">⏰ ${dateRelative(c.Date_prochaine_action)}</span>` : ''}
            </div>
            <div class="cc-actions">
              <button class="btn-visiter" onclick="Router.aller('#/questionnaire/${c.ID_Compte}')">Visiter</button>
              <button class="btn-tel-outline" onclick="Router.aller('#/phoning/${c.ID_Compte}')" title="Appeler">📞</button>
            </div>
            ${Session.estManager() ? `
            <div class="cc-infos" style="align-items:center;gap:6px">
              <span style="font-weight:600">${c.PIN_CDS_Assigne ? '👤 ' + (c.Nom_CDS || c.PIN_CDS_Assigne) : '⚠️ Non attribué'}</span>
              <select style="flex:1;border:1px solid var(--c-border);border-radius:4px;padding:4px 6px;font-size:12px"
                      onchange="VueComptes.attribuer('${c.ID_Compte}', this.value)">
                <option value="">— attribuer à —</option>
                ${this.CDS.map(x => `<option value="${x.pin}" ${Number(c.PIN_CDS_Assigne) === x.pin ? 'selected' : ''}>${x.nom}</option>`).join('')}
              </select>
            </div>` : ''}
          </div>`).join('')}
      </div>

      <button class="fab" onclick="Router.aller('#/questionnaire')" title="Nouvelle visite" style="bottom:140px">＋</button>
      ${NavBar('comptes')}
    `;
    // Restaure le focus recherche après re-render
    const champ = document.getElementById('recherche-comptes');
    if (this.state.recherche && champ) {
      champ.focus();
      champ.setSelectionRange(champ.value.length, champ.value.length);
    }
  },

  // Réattribution d'un compte à un CDS (manager uniquement)
  async attribuer(idCompte, pin) {
    if (!pin || !Session.estManager()) return;
    const cds = this.CDS.find(x => x.pin === Number(pin));
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', idCompte, {
        PIN_CDS_Assigne: Number(pin), Nom_CDS: cds.nom,
      });
      await SheetsAPI.ecrire('EMPOWER_MDB', '📊_ACTIONS', {
        ID_Action: genId('ACT'), Date_Action: new Date().toISOString(),
        Type_Action: 'Attribution', Source: 'ESI', PIN_CDS: Session.pin,
        Nom_Compte: idCompte, Statut_Avant: '', Statut_Apres: `→ ${cds.nom}`,
        Resum_IA: `Compte attribué à ${cds.nom} par ${Session.nom}`,
        GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });
      const c = this.state.comptes.find(x => String(x.ID_Compte) === String(idCompte));
      if (c) { c.PIN_CDS_Assigne = Number(pin); c.Nom_CDS = cds.nom; }
      Toast.afficher(`✅ Compte attribué à ${cds.nom}`, 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  setRecherche: debounce(function(v) { VueComptes.state.recherche = v; VueComptes.render(); }, 250),
  setFiltre(s) { this.state.filtreStatut = s; this.render(); },
  setTri(t)    { this.state.triPar = t;       this.render(); },
};
