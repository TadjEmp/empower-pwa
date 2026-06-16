// ═══════════════════════════════════════
//  vue-comptes-historiques.js — COMPTES HISTORIQUES
//  V2.2 — Bloc 9 complet : parseCA/fmtCA, resolveCDS, filtres robustes
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
        // LECLERC : matching inclusif case-insensitive (Bloc 9 #3)
        const isLeclerc = canal === 'LECLERC'
          || canal.includes('GMS') || canal.includes('GSA') || canal.includes('GRANDE SURFACE')
          || reseller.includes('LECLERC')
          || (canal.includes('DRIVE') && reseller.includes('LECLERC'));

        // parseCA robuste : valeurs corrompues (dates "11/4/1903") → null (Bloc 9 #2)
        const caFy25   = window.parseCA(r['CA FY25 €']  || r.CA_FY25  || null);
        const caFy26   = window.parseCA(r['CA FY26 €']  || r.CA_FY26  || null);
        const caQ1Fy27 = window.parseCA(r['CA Q1FY27 €'] || mdb?.CA_Q1FY27 || null);

        // PIN CDS → prénom via resolveCDS (Bloc 9 #1) ; jamais de PIN brut dans l'UI
        const pinBrut = mdb?.PIN_CDS_Assigne || null;
        const nomCDSBrut = mdb?.Nom_CDS || '';
        const cdsPrenom = window.resolveCDS(pinBrut || nomCDSBrut);

        return {
          id:       mdb?.ID_Compte || null,
          nom:      r.RESELLER || '—',
          canal:    r.CANAL || '—',
          type:     isLeclerc ? 'LECLERC' : 'REVENDEURS',
          caFy25,
          caFy26,
          caQ1Fy27,
          statut:   mdb?.STATUT_COMPTE || r.STATUT_FY27 || r.FLAG_BRUT || '—',
          priorite: r.FLAG_BRUT || '',
          pin:      pinBrut,   // stocké pour filtrage CDS mais jamais affiché
          cdsPrenom,           // prénom résolu — utilisé dans l'UI
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
    // Recherche case-insensitive via normaliserNom (Bloc 9 #3)
    const q = normaliserNom(this.state.recherche);
    if (q) l = l.filter(c => normaliserNom(c.nom).includes(q));
    // Filtre type LECLERC — matching sur type pré-calculé case-insensitive (Bloc 9 #3)
    if (this.state.filtreType !== 'TOUS') l = l.filter(c => c.type === this.state.filtreType);
    if (this.state.filtreStatut !== 'TOUS') l = l.filter(c => {
      const st = (c.statut   || '').toUpperCase();
      const pr = (c.priorite || '').toUpperCase();
      const f  = this.state.filtreStatut;
      if (f === 'REACTIVER') return st.startsWith('REACTIVER') || pr.startsWith('REACTIVER');
      // "Actif" = CA_Q1FY27 > 0, calculé dynamiquement (Bloc 9 #3)
      if (f === 'ACTIF')     return st === 'ACTIF' || pr === 'ACTIF' || (c.caQ1Fy27 !== null && c.caQ1Fy27 > 0);
      if (f === 'INACTIF')   return st === 'INACTIF' || pr === 'INACTIF' || ((c.caFy26 === null || c.caFy26 === 0) && (c.caQ1Fy27 === null || c.caQ1Fy27 === 0));
      return st === f || pr === f;
    });
    if (this.state.triPar === 'CA')  l.sort((a, b) => (b.caFy26 || 0) - (a.caFy26 || 0));
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
    // caTotal : null → 0 pour la somme (Bloc 9 #2)
    const caTotal = this.state.comptes.reduce((s, c) => s + (c.caFy26 || 0), 0);
    const nbLeclerc = this.state.comptes.filter(c => c.type === 'LECLERC').length;
    const nbRevendeurs = this.state.comptes.filter(c => c.type === 'REVENDEURS').length;

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>Comptes Historiques</h1>
        <span class="badge-compteur">${liste.length}/${total}</span>
      </header>

      <!-- Stats rapides — KPI cards façon DASHBOARD_W09 -->
      <div class="kpi-grid-layout">
        ${kpiCard({ label: 'Comptes',    value: total,        accent: 'primary' })}
        ${kpiCard({ label: 'Leclerc',    value: nbLeclerc,    accent: 'indigo' })}
        ${kpiCard({ label: 'Revendeurs', value: nbRevendeurs, accent: 'coral' })}
        ${kpiCard({ label: 'CA FY26',    value: window.fmtCA(caTotal) !== '—' ? window.fmtCA(caTotal) : '—', unit: '€', accent: 'teal' })}
      </div>

      <!-- Filtres -->
      <div class="barre-filtres">
        <input id="ch-recherche" type="search" placeholder="🔍 Rechercher un compte…" value="${this.state.recherche.replace(/"/g,'&quot;')}"
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
          : `
        <!-- MOBILE : fiches empilées -->
        <div class="mobile-card-list-view">
          ${liste.map(c => {
            // fmtCA : valeurs corrompues ou nulles → '—' (Bloc 9 #2)
            const caFy26Fmt   = window.fmtCA(c.caFy26);
            const caFy25Fmt   = window.fmtCA(c.caFy25);
            const caQ1Fy27Fmt = window.fmtCA(c.caQ1Fy27);
            const caFy26Affiche = caFy26Fmt !== '—' ? `${caFy26Fmt} €` : '—';
            return `
          <div class="carte-compte-v2">
            <div class="cc-pills" onclick="${c.id ? `Router.aller('#/compte/${c.id}')` : 'void(0)'}">
              ${this._pillType(c.type)}
              <span style="margin-left:auto;font-size:13px;font-weight:700;color:var(--c-title)">${caFy26Affiche}<span style="font-size:11px;font-weight:400;color:var(--c-text-2)"> FY26</span></span>
            </div>
            <div class="cc-nom" onclick="${c.id ? `Router.aller('#/compte/${c.id}')` : 'void(0)'}">${c.nom !== '—' ? c.nom : '—'}</div>
            <div class="cc-infos">
              <span>📍 ${c.canal !== '—' ? c.canal : '—'}</span>
              ${caFy25Fmt !== '—' ? `<span>FY25 : ${caFy25Fmt} €</span>` : ''}
              ${caQ1Fy27Fmt !== '—' ? `<span style="color:var(--c-success)">Q1FY27 : ${caQ1Fy27Fmt} €</span>` : ''}
              ${Session.voitTout() && c.cdsPrenom !== '—' ? `<span>👤 ${c.cdsPrenom}</span>` : ''}
            </div>
            ${c.statut && c.statut !== '—' ? `
            <div class="cc-infos" style="margin-top:4px">
              <span class="statut-pill statut-${slugify(c.statut).replace(/-/g,'_')}">${c.statut}</span>
              ${c.dateNextAction ? `<span class="${estDepassee(c.dateNextAction)?'prochaine-action alerte':''}">⏰ ${dateRelative(c.dateNextAction)}</span>` : ''}
            </div>` : ''}
            <div class="cc-actions">
              <button class="btn-visiter" onclick="Router.aller('#/visites?compte=${encodeURIComponent(c.id||c.nom)}')">Planifier visite</button>
              <button class="btn-tel-outline" onclick="Router.aller('#/phoning${c.id ? '/'+c.id : ''}')" title="Appeler">📞</button>
              ${c.id ? `<button class="btn-tel-outline" onclick="Router.aller('#/compte/${c.id}')" title="Fiche">📋</button>` : ''}
            </div>
          </div>`;
          }).join('')}
        </div>

        <!-- DESKTOP (≥900px) : tableau dense — CA FY25 / FY26 / Q1FY27 en colonnes -->
        <div class="desktop-table-wrap">
          <table class="desktop-table-data-view">
            <thead><tr>
              <th>Type</th><th>Compte</th><th>Canal</th>
              <th class="num">CA FY25</th><th class="num">CA FY26</th><th class="num">CA Q1 FY27</th>
              <th>Statut</th>${Session.voitTout() ? '<th>CDS</th>' : ''}<th>Actions</th>
            </tr></thead>
            <tbody>
              ${liste.map(c => {
                const caFy26Fmt   = window.fmtCA(c.caFy26);
                const caFy25Fmt   = window.fmtCA(c.caFy25);
                const caQ1Fy27Fmt = window.fmtCA(c.caQ1Fy27);
                return `<tr>
                  <td>${this._pillType(c.type)}</td>
                  <td class="compte-nom" onclick="${c.id ? `Router.aller('#/compte/${c.id}')` : 'void(0)'}">${c.nom !== '—' ? c.nom : '—'}</td>
                  <td>${c.canal !== '—' ? c.canal : '—'}</td>
                  <td class="num">${caFy25Fmt !== '—' ? caFy25Fmt + ' €' : '—'}</td>
                  <td class="num" style="font-weight:700;color:var(--c-title)">${caFy26Fmt !== '—' ? caFy26Fmt + ' €' : '—'}</td>
                  <td class="num" style="font-weight:600;color:var(--c-success)">${caQ1Fy27Fmt !== '—' ? caQ1Fy27Fmt + ' €' : '—'}</td>
                  <td>${c.statut && c.statut !== '—' ? `<span class="statut-pill statut-${slugify(c.statut).replace(/-/g,'_')}">${c.statut}</span>` : '—'}</td>
                  ${Session.voitTout() ? `<td>${c.cdsPrenom !== '—' ? '👤 ' + c.cdsPrenom : '—'}</td>` : ''}
                  <td>
                    <button class="btn-visiter" style="padding:4px 10px;font-size:12px" onclick="Router.aller('#/visites?compte=${encodeURIComponent(c.id||c.nom)}')">Visite</button>
                    <button class="btn-tel-outline" style="padding:4px 8px" onclick="Router.aller('#/phoning${c.id ? '/'+c.id : ''}')" title="Appeler">📞</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`}
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
