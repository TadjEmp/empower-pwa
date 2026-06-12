// ═══════════════════════════════════════
//  vue-reactiver.js — Comptes à réactiver
//  Source : V17 FLAG_BRUT=REACTIVER + EMPOWER MDB COMPTES
//  Scoring : CA FY26 × facteur statut
//  Bloc 9 : resolveCDS + parseCA/fmtCA + null-safety + filtres case-insensitive
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
          const flag    = (r.FLAG_BRUT || '').toUpperCase().trim();
          // parseCA : gère valeurs corrompues (dates "11/4/1903", NaN, undefined) → null
          const caFy26  = window.parseCA(r['CA FY26 €'] != null ? r['CA FY26 €'] : r.CA_FY26) || 0;
          const caFy25  = window.parseCA(r['CA FY25 €'] != null ? r['CA FY25 €'] : r.CA_FY25) || 0;
          const caQ1Fy27 = window.parseCA(r['CA Q1FY27 €'] != null ? r['CA Q1FY27 €'] : r.CA_Q1FY27) || 0;
          const score   = caFy26 * (this.SCORE[flag] || 0.3);
          const mdb     = mapMDB.get(normaliserNom(r.RESELLER || '')) || null;
          const pinCDS  = mdb?.PIN_CDS_Assigne || null;
          return {
            nom:       (r.RESELLER || '').trim() || '—',
            canal:     (r.CANAL || '').trim() || '—',
            caFy25,
            caFy26,
            caQ1Fy27,
            flag,
            score,
            urgent:    flag.includes('URGENT'),
            // Statuts alignés sur le vocabulaire réel : ASSIGNE|EN_COURS|INTEGRE|ARCHIVE
            statut:    (mdb?.STATUT_COMPTE || r.STATUT_FY27 || '').trim() || '—',
            idMDB:     mdb?.ID_Compte || null,
            pinCDS,
            // prénom résolu — jamais de PIN brut dans l'UI
            cdsPrenom: pinCDS ? window.resolveCDS(pinCDS) : '—',
          };
        });

      this.state.comptes = liste;
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      console.error('[VueReactiver] init error:', e);
      document.getElementById('app').innerHTML =
        `<div class="erreur">Erreur chargement : ${e.message || 'inconnue'}</div>`;
    }
  },

  get listeFiltree() {
    let l = [...this.state.comptes];
    // Filtres case-insensitive (comparaison toUpperCase)
    const fFlag = (this.state.filtreFlag || '').toUpperCase();
    if (fFlag === 'URGENT')   l = l.filter(c => c.urgent);
    if (fFlag === 'STANDARD') l = l.filter(c => !c.urgent);
    // CDS : filtre sur SES comptes uniquement (ASSIGNE = son pin) — ADMIN/CHANNEL_MANAGER voient tout
    if (!Session.voitTout()) {
      l = l.filter(c => !c.pinCDS || Number(c.pinCDS) === Number(Session.pin));
    }
    if (this.state.triPar === 'SCORE') l.sort((a, b) => b.score - a.score);
    if (this.state.triPar === 'CA')    l.sort((a, b) => b.caFy26 - a.caFy26);
    if (this.state.triPar === 'NOM')   l.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    return l;
  },

  render() {
    const app = document.getElementById('app');
    if (!app) return;
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement des comptes à réactiver…</div>';
      return;
    }
    const liste   = this.listeFiltree;
    const urgents = this.state.comptes.filter(c => c.urgent).length;
    const total   = this.state.comptes.length;
    // caTotal : somme des caFy26 déjà parsés (numbers sains, pas de valeurs corrompues)
    const caTotal = this.state.comptes.reduce((s, c) => s + (c.caFy26 || 0), 0);

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
          <div class="stat-reactiver-val">${window.fmtCA(caTotal)}</div>
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
            <option value="SCORE" ${this.state.triPar === 'SCORE' ? 'selected' : ''}>Score décroissant</option>
            <option value="CA"    ${this.state.triPar === 'CA'    ? 'selected' : ''}>CA décroissant</option>
            <option value="NOM"   ${this.state.triPar === 'NOM'   ? 'selected' : ''}>Nom A→Z</option>
          </select>
        </div>
      </div>

      <div class="liste-reactiver">
        ${liste.length === 0
          ? '<div class="vide">Aucun compte pour ces filtres</div>'
          : liste.map(c => this._carteHTML(c)).join('')}
      </div>

      <button class="fab" onclick="VueReactiver.exporterCSV()" title="Exporter">📋</button>
    `;
  },

  _carteHTML(c) {
    const caFy26Fmt   = window.fmtCA(c.caFy26);
    const caQ1Fmt     = c.caQ1Fy27 > 0 ? window.fmtCA(c.caQ1Fy27) : null;
    // Jamais de PIN affiché — on utilise cdsPrenom (résolu via resolveCDS)
    const cdsLabel    = c.cdsPrenom && c.cdsPrenom !== '—'
      ? `<span class="reactiver-cds">${c.cdsPrenom}</span>`
      : '';
    const statutLabel = c.statut !== '—' ? ` · ${c.statut}` : '';
    return `
      <div class="carte-reactiver ${c.urgent ? 'urgent' : 'standard'}"
           onclick="${c.idMDB ? `Router.aller('#/compte/${c.idMDB}')` : 'void(0)'}">
        <div class="reactiver-gauche">
          <div class="reactiver-nom">${c.nom}</div>
          <div class="reactiver-infos">${c.canal}${statutLabel}${cdsLabel ? ' · ' + cdsLabel.replace(/<[^>]+>/g,'') : ''}</div>
          ${cdsLabel}
        </div>
        <div class="reactiver-droite">
          <span class="score-badge ${c.urgent ? 'haut' : ''}">${c.urgent ? '🔴 URGENT' : '🟡 À réactiver'}</span>
          <div class="reactiver-ca">${caFy26Fmt}</div>
          <div style="font-size:11px;color:var(--c-text-2)">FY26</div>
          ${caQ1Fmt ? `<div style="font-size:11px;color:var(--c-success)">${caQ1Fmt} Q1FY27</div>` : ''}
        </div>
      </div>
    `;
  },

  setFiltre(f) { this.state.filtreFlag = (f || 'TOUS').toUpperCase(); this.render(); },
  setTri(t)    { this.state.triPar = t || 'SCORE';                    this.render(); },

  exporterCSV() {
    const rows = this.listeFiltree;
    if (!rows.length) {
      if (typeof Toast !== 'undefined') Toast.afficher('Aucune donnée à exporter', 'warning');
      return;
    }
    // fmtCA pour les colonnes CA — jamais de NaN/undefined dans le CSV
    const csv = ['Nom;Canal;CA FY25;CA FY26;Q1 FY27;Flag;Urgent;CDS']
      .concat(rows.map(r => [
        `"${(r.nom  || '').replace(/"/g,'""')}"`,
        `"${(r.canal|| '').replace(/"/g,'""')}"`,
        window.fmtCA(r.caFy25),
        window.fmtCA(r.caFy26),
        window.fmtCA(r.caQ1Fy27),
        r.flag || '—',
        r.urgent ? 'OUI' : 'NON',
        // cdsPrenom résolu — jamais le PIN brut
        r.cdsPrenom || '—',
      ].join(';'))).join('\n');
    const bom = '﻿';
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(bom + csv);
    a.download = `reactiver_${dateISOLocale()}.csv`;
    a.click();
    if (typeof Toast !== 'undefined') Toast.afficher('📥 Export CSV téléchargé', 'succes');
  },
};
