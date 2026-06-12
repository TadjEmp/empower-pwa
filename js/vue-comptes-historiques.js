// ═══════════════════════════════════════
//  vue-comptes-historiques.js — COMPTES HISTORIQUES
//  V2.1 — Stub B1 · Implémentation complète : B4
//  Sources : V17/📋 COMPTES HISTORIQUES · 🏢_COMPTES
// ═══════════════════════════════════════

window.VueComptesHistoriques = {

  state: {
    comptes: [], chargement: true, erreur: null,
    filtreType: 'TOUS',   // TOUS | LECLERC | REVENDEURS
    filtreStatut: 'TOUS',
    recherche: '',
    triPar: 'PRIORITE',
  },

  async init() {
    this.state.chargement = true;
    this.state.erreur = null;
    this.render();
    try {
      const [rawV17, rawMDB] = await Promise.all([
        SheetsAPI.lire('V17', '📋 COMPTES HISTORIQUES'),
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
      ]);
      const mapMDB = new Map(rawMDB.map(c => [normaliserNom(c.Nom_Compte), c]));

      this.state.comptes = rawV17.map(r => {
        const mdb = mapMDB.get(normaliserNom(r.RESELLER || '')) || null;
        const canal = (r.CANAL || '').toUpperCase();
        const reseller = (r.RESELLER || '').toUpperCase();
        const isLeclerc = canal.includes('LECLERC') || reseller.includes('LECLERC')
          || canal.includes('GMS') || canal.includes('GSA') || canal.includes('GRANDE SURFACE')
          || canal.includes('DRIVE');
        return {
          id:       mdb?.ID_Compte || null,
          nom:      r.RESELLER || '—',
          canal:    r.CANAL || '—',
          type:     isLeclerc ? 'LECLERC' : 'REVENDEURS',
          caFy25:   parseAmount(r['CA FY25 €'] || r.CA_FY25 || 0),
          caFy26:   parseAmount(r['CA FY26 €'] || r.CA_FY26 || 0),
          caQ1Fy27: parseAmount(r['CA Q1FY27 €'] || 0),
          statut:   mdb?.STATUT_COMPTE || r.STATUT_FY27 || r.FLAG_BRUT || '—',
          priorite: r.FLAG_BRUT || '',
          pin:      mdb?.PIN_CDS_Assigne || null,
          nomCDS:   mdb?.Nom_CDS || '—',
          nextAction: mdb?.Prochaine_action || '',
          dateNextAction: mdb?.Date_prochaine_action || '',
        };
      }).filter(c =>
        Session.voitTout() || !c.pin || Number(c.pin) === Session.pin
      );

      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      this.state.erreur = e.message;
      this.render();
    }
  },

  get listeFiltree() {
    let l = [...this.state.comptes];
    const q = normaliserNom(this.state.recherche);
    if (q) l = l.filter(c => normaliserNom(c.nom).includes(q));
    if (this.state.filtreType !== 'TOUS') l = l.filter(c => c.type === this.state.filtreType);
    if (this.state.filtreStatut !== 'TOUS') l = l.filter(c => {
      const st = (c.statut   || '').toUpperCase();
      const pr = (c.priorite || '').toUpperCase();
      const f  = this.state.filtreStatut;
      if (f === 'REACTIVER') return st.startsWith('REACTIVER') || pr.startsWith('REACTIVER');
      return st === f || pr === f;
    });
    if (this.state.triPar === 'CA')  l.sort((a, b) => b.caFy26 - a.caFy26);
    if (this.state.triPar === 'NOM') l.sort((a, b) => a.nom.localeCompare(b.nom));
    if (this.state.triPar === 'PRIORITE') {
      const ordre = { REACTIVER_URGENT: 0, REACTIVER: 1, CHURN: 2, INACTIF: 3 };
      l.sort((a, b) => (ordre[a.priorite] ?? 9) - (ordre[b.priorite] ?? 9));
    }
    return l;
  },

  _pillType(type) {
    const map = { LECLERC: '#0050FF', REVENDEURS: '#FF6D68' };
    return `<span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:99px;background:${map[type]||'#888'};color:#fff">${type}</span>`;
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement des comptes historiques…</div>';
      return;
    }
    if (this.state.erreur) {
      app.innerHTML = `<div class="erreur">Erreur : ${this.state.erreur}
        <br><br><button class="btn-secondaire" onclick="VueComptesHistoriques.init()">Réessayer</button></div>`;
      return;
    }

    const liste = this.listeFiltree;
    const total = this.state.comptes.length;
    const caTotal = this.state.comptes.reduce((s, c) => s + c.caFy26, 0);
    const nbLeclerc = this.state.comptes.filter(c => c.type === 'LECLERC').length;
    const nbRevendeurs = this.state.comptes.filter(c => c.type === 'REVENDEURS').length;

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Comptes Historiques</h1>
        <span class="badge-compteur">${liste.length}/${total}</span>
      </header>

      <!-- Stats rapides -->
      <div class="ch-stats">
        <div class="ch-stat"><div class="ch-stat-val">${total}</div><div class="ch-stat-lbl">Comptes</div></div>
        <div class="ch-stat bleu"><div class="ch-stat-val">${nbLeclerc}</div><div class="ch-stat-lbl">Leclerc</div></div>
        <div class="ch-stat coral"><div class="ch-stat-val">${nbRevendeurs}</div><div class="ch-stat-lbl">Revendeurs</div></div>
        <div class="ch-stat"><div class="ch-stat-val" style="font-size:13px">${formatEUR(caTotal)}</div><div class="ch-stat-lbl">CA FY26</div></div>
      </div>

      <!-- Filtres -->
      <div class="barre-filtres">
        <input id="ch-recherche" type="search" placeholder="🔍 Rechercher un compte…" value="${this.state.recherche}"
               style="border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:8px 12px;font-size:14px;width:100%"
               oninput="VueComptesHistoriques.setRecherche(this.value)"/>
        <div class="filtres-flags">
          ${['TOUS','LECLERC','REVENDEURS'].map(t => `
            <button class="btn-filtre ${this.state.filtreType === t ? 'actif' : ''}"
                    onclick="VueComptesHistoriques.setType('${t}')">${t}</button>`).join('')}
        </div>
        <div class="filtres-flags" style="margin-top:6px">
          ${['TOUS','REACTIVER','CHURN','INACTIF','ACTIF'].map(s => `
            <button class="btn-filtre ${this.state.filtreStatut===s?'actif':''}"
                    onclick="VueComptesHistoriques.setStatut('${s}')">${s}</button>`).join('')}
        </div>
        <div class="filtres-statut">
          <select onchange="VueComptesHistoriques.setTri(this.value)">
            <option value="PRIORITE" ${this.state.triPar==='PRIORITE'?'selected':''}>Priorité relance</option>
            <option value="CA" ${this.state.triPar==='CA'?'selected':''}>CA FY26 décroissant</option>
            <option value="NOM" ${this.state.triPar==='NOM'?'selected':''}>Nom A→Z</option>
          </select>
        </div>
      </div>

      <!-- Liste -->
      <div class="liste-comptes avec-nav">
        ${liste.length === 0
          ? '<div class="vide" style="padding:32px;text-align:center;color:var(--c-text-2)">Aucun compte pour ces critères</div>'
          : liste.map(c => `
          <div class="carte-compte-v2">
            <div class="cc-pills" onclick="${c.id ? `Router.aller('#/compte/${c.id}')` : 'void(0)'}">
              ${this._pillType(c.type)}
              <span style="margin-left:auto;font-size:13px;font-weight:700;color:var(--c-title)">${formatEUR(c.caFy26)}<span style="font-size:11px;font-weight:400;color:var(--c-text-2)"> FY26</span></span>
            </div>
            <div class="cc-nom" onclick="${c.id ? `Router.aller('#/compte/${c.id}')` : 'void(0)'}">${c.nom}</div>
            <div class="cc-infos">
              <span>📍 ${c.canal}</span>
              ${c.caFy25 ? `<span>FY25 : ${formatEUR(c.caFy25)}</span>` : ''}
              ${c.caQ1Fy27 ? `<span style="color:var(--c-success)">Q1FY27 : ${formatEUR(c.caQ1Fy27)}</span>` : ''}
              ${Session.voitTout() ? `<span>👤 ${c.nomCDS}</span>` : ''}
            </div>
            ${c.statut && c.statut !== '—' ? `
            <div class="cc-infos" style="margin-top:4px">
              <span class="statut-pill statut-${slugify(c.statut).replace(/-/g,'_')}">${c.statut}</span>
              ${c.dateNextAction ? `<span class="${estDepassee(c.dateNextAction)?'prochaine-action alerte':''}">⏰ ${dateRelative(c.dateNextAction)}</span>` : ''}
            </div>` : ''}
            <div class="cc-actions">
              <button class="btn-visiter" onclick="Router.aller('#/visites?compte=${c.id||c.nom}')">Planifier visite</button>
              <button class="btn-tel-outline" onclick="Router.aller('#/phoning${c.id ? '/'+c.id : ''}')" title="Appeler">📞</button>
              ${c.id ? `<button class="btn-tel-outline" onclick="Router.aller('#/compte/${c.id}')" title="Fiche">📋</button>` : ''}
            </div>
          </div>`).join('')}
      </div>

      ${NavBar('historiques')}
    `;

    const champ = document.getElementById('ch-recherche');
    if (this.state.recherche && champ) champ.focus();
  },

  setRecherche: debounce(function(v) { VueComptesHistoriques.state.recherche = v; VueComptesHistoriques.render(); }, 250),
  setType(t)   { this.state.filtreType   = t; this.render(); },
  setStatut(s) { this.state.filtreStatut = s; this.render(); },
  setTri(t)    { this.state.triPar = t;       this.render(); },
};
