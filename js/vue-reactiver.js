// ═══════════════════════════════════════
//  vue-reactiver.js — Comptes à réactiver
//  Source : V17 FLAG_BRUT=REACTIVER + EMPOWER MDB COMPTES
//  Scoring : CA FY26 × facteur statut
// ═══════════════════════════════════════

window.VueReactiver = {
  SCORE: { REACTIVERURGENT: 2.0, REACTIVER: 1.0, CHURN: 0.5, INACTIF: 0.3 },

  state: {
    comptes: [], filtreFlag: 'TOUS', triPar: 'SCORE',
    chargement: true, selection: new Set(),
  },

  async init() {
    this.state.chargement = true;
    this.render();
    try {
      const rawV17 = await SheetsAPI.lire('V17', '📋 COMPTES HISTORIQUES');
      const rawMDB = await SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES');
      const mapMDB = new Map(rawMDB.map(c => [normaliserNom(c.Nom_Compte), c]));

      const liste = rawV17
        .filter(r => {
          const f = (r.FLAG_BRUT || r['FLAG BRUT'] || '').toUpperCase();
          return f.includes('REACTIVER') || f.includes('CHURN') || f.includes('INACTIF');
        })
        .map(r => {
          const flag   = (r.FLAG_BRUT || '').toUpperCase();
          const caFy26 = Number(r['CA FY26 €'] || r.CA_FY26 || 0);
          const score  = caFy26 * (this.SCORE[flag] || 0.3);
          const mdb    = mapMDB.get(normaliserNom(r.RESELLER || '')) || null;
          return {
            nom:       r.RESELLER || '—',
            canal:     r.CANAL || '—',
            caFy25:    Number(r['CA FY25 €'] || 0),
            caFy26,
            caQ1Fy27:  Number(r['CA Q1FY27 €'] || 0),
            flag,
            score,
            urgent:    flag.includes('URGENT'),
            statut:    mdb?.STATUT_COMPTE || r.STATUT_FY27 || '—',
            idMDB:     mdb?.ID_Compte || null,
            pinCDS:    mdb?.PIN_CDS_Assigne || null,
          };
        });

      this.state.comptes = liste;
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML =
        `<div class="erreur">Erreur chargement : ${e.message}</div>`;
    }
  },

  get listeFiltree() {
    let l = [...this.state.comptes];
    if (this.state.filtreFlag === 'URGENT') l = l.filter(c => c.urgent);
    if (this.state.filtreFlag === 'STANDARD') l = l.filter(c => !c.urgent);
    if (!Session.voitTout()) l = l.filter(c => !c.pinCDS || Number(c.pinCDS) === Session.pin);
    if (this.state.triPar === 'SCORE') l.sort((a, b) => b.score - a.score);
    if (this.state.triPar === 'CA')    l.sort((a, b) => b.caFy26 - a.caFy26);
    if (this.state.triPar === 'NOM')   l.sort((a, b) => a.nom.localeCompare(b.nom));
    return l;
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement des comptes à réactiver…</div>';
      return;
    }
    const liste   = this.listeFiltree;
    const urgents = this.state.comptes.filter(c => c.urgent).length;
    const total   = this.state.comptes.length;
    const caTotal = this.state.comptes.reduce((s, c) => s + c.caFy26, 0);

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="history.back()" class="btn-retour">←</button>
        <h1>Comptes à réactiver</h1>
        <span class="badge-compteur">${total} comptes</span>
      </header>

      <div class="header-reactiver-stats">
        <div class="stat-reactiver">
          <div class="stat-reactiver-val">${urgents}</div>
          <div class="stat-reactiver-lbl">Urgents</div>
        </div>
        <div class="stat-reactiver">
          <div class="stat-reactiver-val">${total - urgents}</div>
          <div class="stat-reactiver-lbl">Standard</div>
        </div>
        <div class="stat-reactiver">
          <div class="stat-reactiver-val">${formatEuro(caTotal)}</div>
          <div class="stat-reactiver-lbl">CA FY26 dormant</div>
        </div>
      </div>

      <div class="barre-filtres">
        <div class="filtres-flags">
          ${['TOUS','URGENT','STANDARD'].map(f => `
            <button class="btn-filtre ${this.state.filtreFlag === f ? 'actif' : ''}"
                    onclick="VueReactiver.setFiltre('${f}')">
              ${{ TOUS:'Tous', URGENT:'🔴 Urgents', STANDARD:'🟡 Standard' }[f]}
            </button>
          `).join('')}
        </div>
        <div class="filtres-statut">
          <select onchange="VueReactiver.setTri(this.value)">
            <option value="SCORE">Score décroissant</option>
            <option value="CA">CA décroissant</option>
            <option value="NOM">Nom A→Z</option>
          </select>
        </div>
      </div>

      <div class="liste-reactiver">
        ${liste.length === 0
          ? '<div class="vide">Aucun compte pour ces filtres</div>'
          : liste.map(c => `
            <div class="carte-reactiver ${c.urgent ? 'urgent' : 'standard'}"
                 onclick="${c.idMDB ? `Router.aller('#/compte/${c.idMDB}')` : 'void(0)'}">
              <div class="reactiver-gauche">
                <div class="reactiver-nom">${c.nom}</div>
                <div class="reactiver-infos">${c.canal} · ${c.statut}</div>
              </div>
              <div class="reactiver-droite">
                <span class="score-badge ${c.urgent ? 'haut' : ''}">${c.urgent ? '🔴 URGENT' : '🟡 À réactiver'}</span>
                <div class="reactiver-ca">${formatEuro(c.caFy26)}</div>
                <div style="font-size:11px;color:var(--c-text-2)">FY26</div>
                ${c.caQ1Fy27 > 0 ? `<div style="font-size:11px;color:var(--c-success)">${formatEuro(c.caQ1Fy27)} Q1FY27</div>` : ''}
              </div>
            </div>
          `).join('')}
      </div>

      <button class="fab" onclick="VueReactiver.exporterCSV()" title="Exporter">📋</button>
    `;
  },

  setFiltre(f) { this.state.filtreFlag = f; this.render(); },
  setTri(t)    { this.state.triPar = t;     this.render(); },

  exporterCSV() {
    const rows = this.listeFiltree;
    const csv  = ['Nom,Canal,CA FY25,CA FY26,Q1 FY27,Flag,Urgent']
      .concat(rows.map(r =>
        `"${r.nom}","${r.canal}",${r.caFy25},${r.caFy26},${r.caQ1Fy27},${r.flag},${r.urgent}`
      )).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `reactiver_${dateISOLocale()}.csv`;
    a.click();
    Toast.afficher('📥 Export CSV téléchargé', 'succes');
  },
};
