// ═══════════════════════════════════════
//  vue-primes.js — Objectifs & Primes FY27
//  Mécanique : PLAN_INCENTIVES_FY27 Option D3
//  3 axes/Q · paliers exclusifs · plafond 700€ + P3 100€ hors plafond
//  AXE 1 : CA vs OBJ (<80%:0 · 80-99:200 · 100-119:400 · ≥120:+100 P3)
//  AXE 2 : NSB — Taj/Lyes ≥8:75 ≥12:150 · Mehdi/Johanne ≥5:75 ≥8:150
//  AXE 3 : EMPOWER intégrés — ≥3/Q:50 · ≥6/Q:75
//  Bonus manager : +300€/Q si objectif collectif atteint
//  Déclaration NSB par le CDS → validation Tadjidine
// ═══════════════════════════════════════

window.VuePrimes = {

  // Bornes quarters FY27 (année fiscale Norton : avril → mars)
  QUARTERS: {
    Q1: { debut: '2026-04-01', fin: '2026-06-30' },
    Q2: { debut: '2026-07-01', fin: '2026-09-30' },
    Q3: { debut: '2026-10-01', fin: '2026-12-31' },
    Q4: { debut: '2027-01-01', fin: '2027-03-31' },
  },

  // Seuils NSB par PIN (Tadjidine/Lyes vs Mehdi/Johanne)
  SEUILS_NSB: { 1000: [8, 12], 4001: [8, 12], 4002: [5, 8], 4003: [5, 8] },

  PLAFOND: 700,

  state: null,

  async init() {
    this.state = { chargement: true, quarter: null, objectifs: [], nsb: [], prospects: [], envoiEnCours: false, modalNSB: false };
    this.render();
    try {
      const [objectifs, nsb, prospects, params] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '🛒_NSB_COMMANDES'),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
      ]);
      const paramMap = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
      this.state.quarter   = this.state.quarter || paramMap.QuarterActif || 'Q1';
      this.state.objectifs = objectifs;
      this.state.nsb       = nsb;
      this.state.prospects = prospects;
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  _dansQuarter(dateStr, q) {
    if (!dateStr) return false;
    const b = this.QUARTERS[q];
    const d = String(dateStr).slice(0, 10);
    return d >= b.debut && d <= b.fin;
  },

  // ── Calcul des primes d'un CDS pour un quarter ──
  calculer(pin, q) {
    const o   = this.state.objectifs.find(x => Number(x.PIN_CDS) === pin) || {};
    const ca  = Number(o[`${q}_CA_Realise`] || 0);
    const obj = Number(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`] || 0);
    const pct = obj > 0 ? ca / obj * 100 : 0;

    // AXE 1
    let axe1 = 0, p3 = 0, palier1 = 'Non éligible';
    if (pct >= 120)      { axe1 = 400; p3 = 100; palier1 = 'P2 + Bonus P3'; }
    else if (pct >= 100) { axe1 = 400; palier1 = 'P2'; }
    else if (pct >= 80)  { axe1 = 200; palier1 = 'P1'; }

    // AXE 2 — NSB validées (Valid_Manager=OUI) du quarter + en attente
    const mesNSB = this.state.nsb.filter(n => Number(n.PIN_CDS) === pin && this._dansQuarter(n.Date, q));
    const nsbValid   = mesNSB.filter(n => String(n.Valid_Manager).toUpperCase() === 'OUI').length;
    const nsbAttente = mesNSB.length - nsbValid;
    const [s1, s2] = this.SEUILS_NSB[pin] || [5, 8];
    let axe2 = 0, palier2 = `${nsbValid}/${s1}`;
    if (nsbValid >= s2)      { axe2 = 150; palier2 = 'P2'; }
    else if (nsbValid >= s1) { axe2 = 75;  palier2 = 'P1'; }

    // AXE 3 — comptes EMPOWER intégrés dans le quarter
    const integres = this.state.prospects.filter(p =>
      Number(p.PIN_CDS_Assigne) === pin &&
      String(p.Flag_converti).toUpperCase() === 'TRUE' &&
      this._dansQuarter(p.PREMIERE_COMMANDE_DATE || p.Timestamp, q)
    ).length;
    let axe3 = 0, palier3 = `${integres}/3`;
    if (integres >= 6)      { axe3 = 75; palier3 = 'P2'; }
    else if (integres >= 3) { axe3 = 50; palier3 = 'P1'; }

    const std   = Math.min(this.PLAFOND, axe1 + axe2 + axe3);
    return { ca, obj, pct: Math.round(pct), axe1, palier1, axe2, palier2, nsbValid, nsbAttente, s1, s2,
             axe3, palier3, integres, p3, total: std + p3 };
  },

  // Bonus manager : objectif collectif équipe du quarter atteint
  bonusManager(q) {
    let ca = 0, obj = 0;
    this.state.objectifs.forEach(o => {
      ca  += Number(o[`${q}_CA_Realise`] || 0);
      obj += Number(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`] || 0);
    });
    return { atteint: obj > 0 && ca >= obj, ca, obj, montant: obj > 0 && ca >= obj ? 300 : 0 };
  },

  // ── Simulateur Axe 1 ──
  simuler(valeur) {
    const zone = document.getElementById('simu-resultat');
    if (!zone) return;
    const pin = Session.estCDS() ? Session.pin : Number(document.getElementById('primes-cds-select')?.value || Session.pin);
    const o   = this.state.objectifs.find(x => Number(x.PIN_CDS) === pin) || {};
    const q   = this.state.quarter;
    const obj = Number(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`] || 0);
    const ca  = Number(valeur || 0);
    const pct = obj > 0 ? ca / obj * 100 : 0;
    let prime = 0;
    if (pct >= 120) prime = 500; else if (pct >= 100) prime = 400; else if (pct >= 80) prime = 200;
    zone.innerHTML = `→ ${Math.round(pct)}% de l'objectif (${formatEuro(obj)}) = <strong style="color:var(--c-cta)">${prime} € de prime Axe 1</strong>${pct >= 120 ? ' (dont 100 € P3 hors plafond)' : ''}`;
  },

  // ── Déclaration NSB (CDS) ──
  async declarerNSB(e) {
    e.preventDefault();
    if (this.state.envoiEnCours) return;
    const v = id => document.getElementById(id)?.value?.trim() || '';
    if (!v('nsb-compte')) { Toast.afficher('Nom du compte requis', 'warning'); return; }
    this.state.envoiEnCours = true;
    try {
      const ligne = {
        ID_NSB: genId('NSB'),
        Date: v('nsb-date') || new Date().toISOString().slice(0, 10),
        PIN_CDS: Session.pin, ID_Compte: '',
        Nom_Compte: v('nsb-compte').toUpperCase(),
        Produit: v('nsb-produit') || 'NSB',
        Montant_EUR: Number(v('nsb-montant') || 0),
        Statut: 'DECLARE', Valid_Manager: 'NON',
        Date_Validation: '', Notes: v('nsb-note'),
      };
      await SheetsAPI.ecrire('EMPOWER_MDB', '🛒_NSB_COMMANDES', ligne);
      this.state.nsb.push(ligne);
      this.state.modalNSB = false;
      Toast.afficher('✅ Commande NSB déclarée — en attente de validation', 'succes');
    } catch(err) { Toast.afficher('❌ ' + err.message, 'erreur'); }
    this.state.envoiEnCours = false;
    this.render();
  },

  // ── Validation NSB (manager) ──
  async validerNSB(id) {
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🛒_NSB_COMMANDES', id, {
        Valid_Manager: 'OUI', Statut: 'VALIDE',
        Date_Validation: new Date().toISOString().slice(0, 10),
      });
      const n = this.state.nsb.find(x => x.ID_NSB === id);
      if (n) { n.Valid_Manager = 'OUI'; n.Statut = 'VALIDE'; }
      Toast.afficher('✅ Commande NSB validée', 'succes');
      this.render();
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  setQuarter(q) { this.state.quarter = q; this.render(); },

  // ── RENDER ──
  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Calcul des primes…</div>';
      return;
    }
    const q = this.state.quarter;
    const estManager = Session.estManager();

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>🏆 ${estManager ? 'Primes équipe' : 'Mes primes'}</h1>
        <span class="badge-compteur">${q} FY27</span>
      </header>

      <div class="dash-body avec-nav">
        <div class="q-chips" style="padding:0">
          ${['Q1', 'Q2', 'Q3', 'Q4'].map(x => `
            <button class="q-chip ${q === x ? 'active' : ''}" onclick="VuePrimes.setQuarter('${x}')">${x}</button>`).join('')}
        </div>

        ${estManager ? this._renderManager(q) : this._renderCDS(Session.pin, q)}
      </div>
      ${NavBar('primes')}
      ${this._renderModalNSB()}
    `;
  },

  _renderCDS(pin, q, titre = null) {
    const c = this.calculer(pin, q);
    const barre = (val, max) => `
      <div class="pace-barre" style="margin-top:6px"><div class="pace-barre-fill ${val >= max ? 'pace-ok' : 'pace-watch'}"
        style="width:${Math.min(100, max > 0 ? val / max * 100 : 0)}%"></div></div>`;

    return `
      ${titre ? `<h2 style="font-size:16px;font-weight:700;margin-top:8px">${titre}</h2>` : ''}

      <!-- TOTAL -->
      <div class="bloc-fiche dash-pace" style="border:2px solid var(--c-cta)">
        <div class="bloc-titre">Prime ${q} acquise</div>
        <div class="pace-chiffres">
          <strong style="color:var(--c-cta)">${c.total} €</strong>
          <span>/ ${this.PLAFOND} € plafond${c.p3 ? ' + 100 € P3 hors plafond' : ''}</span>
        </div>
      </div>

      <!-- AXE 1 -->
      <div class="bloc-fiche">
        <div class="bloc-titre">Axe 1 — CA vs Objectif
          <span class="pace-badge ${c.pct >= 100 ? 'pace-ok' : c.pct >= 80 ? 'pace-watch' : 'pace-risk'}">${c.pct}% · ${c.palier1}</span>
        </div>
        <div class="pace-chiffres"><strong>${formatEuro(c.ca)}</strong><span>/ ${formatEuro(c.obj)} → <b>${c.axe1 + c.p3} €</b></span></div>
        ${barre(c.pct, 100)}
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">&lt;80% : 0 € · 80-99% : 200 € · 100-119% : 400 € · ≥120% : 400 € + 100 € bonus P3</p>
        <div style="margin-top:10px">
          <label class="q-label">💡 Simulateur — si mon CA ${q} atteint :
            <input type="number" class="q-input" placeholder="ex : ${c.obj}" oninput="VuePrimes.simuler(this.value)"/>
          </label>
          <p id="simu-resultat" style="font-size:13px;margin-top:6px;color:var(--c-text-2)"></p>
        </div>
      </div>

      <!-- AXE 2 -->
      <div class="bloc-fiche">
        <div class="bloc-titre">Axe 2 — Norton Small Business
          <span class="pace-badge ${c.axe2 ? 'pace-ok' : 'pace-watch'}">${c.palier2} → ${c.axe2} €</span>
        </div>
        <div class="pace-chiffres"><strong>${c.nsbValid}</strong><span>commande(s) validée(s)${c.nsbAttente ? ` · ${c.nsbAttente} en attente` : ''}</span></div>
        ${barre(c.nsbValid, c.s1)}
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">≥${c.s1} cmd/Q : 75 € · ≥${c.s2} cmd/Q : 150 €</p>
        ${Number(pin) === Session.pin || Session.estCDS() ? `
        <button class="btn-secondaire" style="margin-top:10px" onclick="VuePrimes.state.modalNSB=true;VuePrimes.render()">
          ➕ Déclarer une commande NSB</button>` : ''}
      </div>

      <!-- AXE 3 -->
      <div class="bloc-fiche">
        <div class="bloc-titre">Axe 3 — Onboarding EMPOWER
          <span class="pace-badge ${c.axe3 ? 'pace-ok' : 'pace-watch'}">${c.palier3} → ${c.axe3} €</span>
        </div>
        <div class="pace-chiffres"><strong>${c.integres}</strong><span>compte(s) intégré(s) au ${q}</span></div>
        ${barre(c.integres, 3)}
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">≥3 comptes/Q : 50 € · ≥6 comptes/Q : 75 € — comptés au statut INTÉGRÉ du pipeline</p>
      </div>
    `;
  },

  _renderManager(q) {
    const bonus = this.bonusManager(q);
    const enAttente = this.state.nsb.filter(n => String(n.Valid_Manager).toUpperCase() !== 'OUI');
    const CDS = [ [1000, 'Tadjidine'], [4001, 'Lyes'], [4002, 'Mehdi'], [4003, 'Johanne'] ];

    return `
      <!-- BONUS MANAGER -->
      <div class="bloc-fiche dash-pace" style="border:2px solid var(--c-primary)">
        <div class="bloc-titre">Bonus manager ${q}
          <span class="pace-badge ${bonus.atteint ? 'pace-ok' : 'pace-risk'}">${bonus.atteint ? '✅ +300 €' : 'Non atteint'}</span>
        </div>
        <div class="pace-chiffres"><strong>${formatEuro(bonus.ca)}</strong><span>/ ${formatEuro(bonus.obj)} équipe — +300 €/Q si collectif atteint (max 1 200 €/an)</span></div>
      </div>

      <!-- TABLE PRIMES CDS -->
      <div class="bloc-fiche">
        <div class="bloc-titre">Primes par CDS — ${q}</div>
        <div class="tableau-equipe">
          <div class="te-ligne te-head"><span>CDS</span><span>Axe 1</span><span>Axe 2</span><span>Axe 3</span><span>P3</span><span>Total</span></div>
          ${CDS.map(([pin, nom]) => {
            const c = this.calculer(pin, q);
            return `<div class="te-ligne">
              <span><strong>${nom}</strong></span>
              <span>${c.axe1} €</span><span>${c.axe2} €</span><span>${c.axe3} €</span>
              <span>${c.p3} €</span><span><strong style="color:var(--c-cta)">${c.total} €</strong></span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- VALIDATION NSB -->
      <div class="bloc-fiche">
        <div class="bloc-titre">Commandes NSB à valider ${enAttente.length ? `<span class="badge-rouge badge-priorite">${enAttente.length}</span>` : '✅'}</div>
        ${enAttente.length === 0 ? '<div class="pas-de-donnees">Aucune déclaration en attente</div>'
          : enAttente.map(n => `
          <div class="relance-ligne">
            <div>
              <div class="relance-nom">${n.Nom_Compte}</div>
              <div style="font-size:12px;color:var(--c-text-2)">${n.Date} · ${n.Produit} · ${formatEuro(n.Montant_EUR)} · PIN ${n.PIN_CDS}${n.Notes ? ' · ' + n.Notes : ''}</div>
            </div>
            <button class="q-chip active" onclick="VuePrimes.validerNSB('${n.ID_NSB}')">✓ Valider</button>
          </div>`).join('')}
      </div>

      <!-- DÉTAIL PERSO (Tadjidine est aussi CDS) -->
      ${this._renderCDS(1000, q, '👤 Mon détail (Tadjidine)')}
    `;
  },

  _renderModalNSB() {
    if (!this.state?.modalNSB) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this){VuePrimes.state.modalNSB=false;VuePrimes.render()}">
      <div class="modal">
        <h3>➕ Déclarer une commande NSB</h3>
        <form onsubmit="VuePrimes.declarerNSB(event)">
          <label>Compte *<input id="nsb-compte" required placeholder="Nom du revendeur"/></label>
          <label>Date<input id="nsb-date" type="date" value="${new Date().toISOString().slice(0, 10)}"/></label>
          <label>Produit<select id="nsb-produit"><option>NSB</option><option>NSB 5 postes</option><option>NSB 10 postes</option><option>NSB 20 postes</option></select></label>
          <label>Montant (€)<input id="nsb-montant" type="number" inputmode="decimal"/></label>
          <label>Note<textarea id="nsb-note" rows="2" placeholder="N° commande, distributeur…"></textarea></label>
          <p style="font-size:11px;color:var(--c-text-2)">La commande comptera pour la prime après validation par Tadjidine.</p>
          <div class="modal-btns">
            <button type="button" onclick="VuePrimes.state.modalNSB=false;VuePrimes.render()">Annuler</button>
            <button type="submit" class="btn-primaire" ${this.state.envoiEnCours ? 'disabled' : ''}>
              ${this.state.envoiEnCours ? 'Envoi…' : 'Déclarer'}</button>
          </div>
        </form>
      </div>
    </div>`;
  },
};
