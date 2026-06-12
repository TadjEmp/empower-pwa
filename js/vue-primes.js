// ═══════════════════════════════════════
//  vue-primes.js — Objectifs & Primes FY27
//  Mécanique : PLAN_INCENTIVES_FY27 Option D3
//  3 axes/Q · paliers exclusifs · plafond 700€ + P3 100€ hors plafond
//  AXE 1 : CA vs OBJ (<80%:0 · 80-99:200 · 100-119:400 · ≥120:+100 P3)
//  AXE 2 : NSB — Taj/Lyes ≥8:75 ≥12:150 · Mehdi/Johanne ≥5:75 ≥8:150
//  AXE 3 : EMPOWER intégrés — ≥3/Q:50 · ≥6/Q:75
//  Bonus manager : +300€/Q si objectif collectif atteint
//  Déclaration NSB par le CDS → validation Tadjidine
//  Déclaration onboarding (via Flavie / terrain) → validation Tadjidine
//  Règles Bloc 9 : aucun PIN affiché, CA via parseCA/fmtCA, aucun undefined/null/NaN
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
    this.state = {
      chargement: true,
      quarter: null,
      objectifs: [],
      nsb: [],
      prospects: [],
      envoiEnCours: false,
      modalNSB: false,
      modalOnboarding: false,
      // Filtre de validation manager : 'NSB' | 'EMPOWER' | 'TOUS'
      filtreValidation: 'TOUS',
    };
    this.render();
    try {
      const [objectifs, nsb, prospects, params] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '🛒_NSB_COMMANDES'),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
      ]);
      const paramMap = Object.fromEntries((params || []).map(p => [p.Parametre, p.Valeur]));
      this.state.quarter   = this.state.quarter || paramMap.QuarterActif || 'Q1';
      this.state.objectifs = objectifs || [];
      this.state.nsb       = nsb || [];
      this.state.prospects = prospects || [];
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message || e}</div>`;
    }
  },

  _dansQuarter(dateStr, q) {
    if (!dateStr) return false;
    const b = this.QUARTERS[q];
    if (!b) return false;
    const d = String(dateStr).slice(0, 10);
    return d >= b.debut && d <= b.fin;
  },

  // ── Calcul des primes d'un CDS pour un quarter ──
  calculer(pin, q) {
    const o   = this.state.objectifs.find(x => Number(x.PIN_CDS) === pin) || {};

    // Utiliser parseCA pour les valeurs CA (robustesse contre corruptions "dates")
    const ca  = parseCA(o[`${q}_CA_Realise`]) || 0;
    const obj = parseCA(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`]) || 0;
    const pct = obj > 0 ? ca / obj * 100 : 0;

    // AXE 1
    let axe1 = 0, p3 = 0, palier1 = 'Non éligible';
    if (pct >= 120)      { axe1 = 400; p3 = 100; palier1 = 'P2 + Bonus P3'; }
    else if (pct >= 100) { axe1 = 400; palier1 = 'P2'; }
    else if (pct >= 80)  { axe1 = 200; palier1 = 'P1'; }

    // AXE 2 — NSB validées (Valid_Manager=OUI) du quarter + en attente
    const mesNSB = this.state.nsb.filter(n =>
      Number(n.PIN_CDS) === pin &&
      !String(n.Produit || '').toUpperCase().startsWith('EMPOWER_') &&
      this._dansQuarter(n.Date, q)
    );
    const nsbValid   = mesNSB.filter(n => String(n.Valid_Manager).toUpperCase() === 'OUI').length;
    const nsbAttente = mesNSB.filter(n => String(n.Valid_Manager).toUpperCase() !== 'OUI').length;
    const [s1, s2] = this.SEUILS_NSB[pin] || [5, 8];
    let axe2 = 0, palier2 = `${nsbValid}/${s1}`;
    if (nsbValid >= s2)      { axe2 = 150; palier2 = 'P2'; }
    else if (nsbValid >= s1) { axe2 = 75;  palier2 = 'P1'; }

    // AXE 3 — comptes EMPOWER intégrés dans le quarter
    // Pipeline prospects avec flag_converti + première commande dans le quarter
    const integresPipeline = this.state.prospects.filter(p =>
      Number(p.PIN_CDS_Assigne) === pin &&
      String(p.Flag_converti).toUpperCase() === 'TRUE' &&
      this._dansQuarter(p.PREMIERE_COMMANDE_DATE || p.Timestamp, q)
    ).length;

    // Via Flavie : déclarations EMPOWER_FLAVIE validées (Valid_Manager=OUI)
    const integresFlavie = this.state.nsb.filter(n =>
      Number(n.PIN_CDS) === pin &&
      String(n.Produit || '').toUpperCase().startsWith('EMPOWER_FLAVIE') &&
      String(n.Valid_Manager).toUpperCase() === 'OUI' &&
      this._dansQuarter(n.Date, q)
    ).length;

    // Terrain : déclarations EMPOWER_TERRAIN validées (Valid_Manager=OUI)
    const integresTerrain = this.state.nsb.filter(n =>
      Number(n.PIN_CDS) === pin &&
      String(n.Produit || '').toUpperCase().startsWith('EMPOWER_TERRAIN') &&
      String(n.Valid_Manager).toUpperCase() === 'OUI' &&
      this._dansQuarter(n.Date, q)
    ).length;

    // En attente de validation (Flavie + Terrain non encore validés)
    const empowerAttente = this.state.nsb.filter(n =>
      Number(n.PIN_CDS) === pin &&
      (String(n.Produit || '').toUpperCase().startsWith('EMPOWER_FLAVIE') ||
       String(n.Produit || '').toUpperCase().startsWith('EMPOWER_TERRAIN')) &&
      String(n.Valid_Manager).toUpperCase() !== 'OUI' &&
      this._dansQuarter(n.Date, q)
    ).length;

    const integres = integresPipeline + integresFlavie + integresTerrain;
    let axe3 = 0, palier3 = `${integres}/3`;
    if (integres >= 6)      { axe3 = 75; palier3 = 'P2'; }
    else if (integres >= 3) { axe3 = 50; palier3 = 'P1'; }

    const std   = Math.min(this.PLAFOND, axe1 + axe2 + axe3);
    return {
      ca, obj,
      pct: Math.round(pct),
      axe1, palier1,
      axe2, palier2, nsbValid, nsbAttente, s1, s2,
      axe3, palier3, integres, integresFlavie, integresTerrain, integresPipeline,
      empowerAttente,
      p3, total: std + p3,
    };
  },

  // Bonus manager : objectif collectif équipe du quarter atteint
  bonusManager(q) {
    let ca = 0, obj = 0;
    this.state.objectifs.forEach(o => {
      ca  += parseCA(o[`${q}_CA_Realise`]) || 0;
      obj += parseCA(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`]) || 0;
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
    const obj = parseCA(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`]) || 0;
    const ca  = parseCA(valeur) || 0;
    const pct = obj > 0 ? ca / obj * 100 : 0;
    let prime = 0;
    if (pct >= 120) prime = 500; else if (pct >= 100) prime = 400; else if (pct >= 80) prime = 200;
    zone.innerHTML = `→ ${Math.round(pct)}% de l'objectif (${fmtCA(obj)} €) = <strong style="color:var(--c-cta)">${prime} € de prime Axe 1</strong>${pct >= 120 ? ' (dont 100 € P3 hors plafond)' : ''}`;
  },

  // ── Déclaration NSB (CDS) ──
  async declarerNSB(e) {
    e.preventDefault();
    if (this.state.envoiEnCours) return;
    const v = id => document.getElementById(id)?.value?.trim() || '';
    const qte = Math.max(1, parseInt(v('nsb-qte') || '1', 10));
    this.state.envoiEnCours = true;
    try {
      const promises = [];
      for (let i = 0; i < qte; i++) {
        const ligne = {
          ID_NSB: genId('NSB'),
          Date: v('nsb-date') || dateISOLocale(),
          PIN_CDS: Session.pin,
          ID_Compte: '',
          Nom_Compte: (v('nsb-compte') || '').toUpperCase() || `NSB_${i+1}`,
          Produit: v('nsb-produit') || 'NSB',
          Montant_EUR: parseCA(v('nsb-montant')) || 0,
          Statut: 'DECLARE',
          Valid_Manager: 'NON',
          Date_Validation: '',
          Notes: v('nsb-note'),
        };
        promises.push(SheetsAPI.ecrire('EMPOWER_MDB', '🛒_NSB_COMMANDES', ligne)
          .then(() => this.state.nsb.push(ligne)));
      }
      await Promise.all(promises);
      this.state.modalNSB = false;
      Toast.afficher(`${qte} commande(s) NSB déclarée(s) — en attente de validation`, 'succes');
    } catch(err) { Toast.afficher('Erreur : ' + (err.message || err), 'erreur'); }
    this.state.envoiEnCours = false;
    this.render();
  },

  // ── Validation NSB ou Onboarding (manager) ──
  async validerDeclaration(id) {
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🛒_NSB_COMMANDES', id, {
        Valid_Manager: 'OUI',
        Statut: 'VALIDE',
        Date_Validation: dateISOLocale(),
      });
      const n = this.state.nsb.find(x => x.ID_NSB === id);
      if (n) { n.Valid_Manager = 'OUI'; n.Statut = 'VALIDE'; }
      Toast.afficher('Déclaration validée', 'succes');
      this.render();
    } catch(e) { Toast.afficher('Erreur : ' + (e.message || e), 'erreur'); }
  },

  // Alias rétro-compat (ancien nom interne)
  validerNSB(id) { return this.validerDeclaration(id); },

  setQuarter(q) { this.state.quarter = q; this.render(); },

  // ── RENDER ──
  render() {
    const app = document.getElementById('app');
    if (!app) return;
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Calcul des primes…</div>';
      return;
    }
    const q = this.state.quarter;
    const estManager = Session.estManager();

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>${estManager ? 'Primes équipe' : 'Mes primes'}</h1>
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
      ${this._renderModalOnboarding()}
    `;
  },

  _renderCDS(pin, q, titre = null) {
    const c = this.calculer(pin, q);
    const barre = (val, max) => `
      <div class="pace-barre" style="margin-top:6px"><div class="pace-barre-fill ${val >= max ? 'pace-ok' : 'pace-watch'}"
        style="width:${Math.min(100, max > 0 ? val / max * 100 : 0)}%"></div></div>`;

    // Déclarations NSB du quarter (pour affichage statut individuel)
    const mesNSBQ = this.state.nsb.filter(n =>
      Number(n.PIN_CDS) === pin &&
      !String(n.Produit || '').toUpperCase().startsWith('EMPOWER_') &&
      this._dansQuarter(n.Date, q)
    );

    // Déclarations EMPOWER du quarter (pour affichage statut individuel)
    const mesEmpowerQ = this.state.nsb.filter(n =>
      Number(n.PIN_CDS) === pin &&
      (String(n.Produit || '').toUpperCase().startsWith('EMPOWER_FLAVIE') ||
       String(n.Produit || '').toUpperCase().startsWith('EMPOWER_TERRAIN')) &&
      this._dansQuarter(n.Date, q)
    );

    // Badge statut validation
    const badgeStatut = (n) => {
      const valide = String(n.Valid_Manager).toUpperCase() === 'OUI';
      return valide
        ? `<span class="badge-statut" style="background:var(--c-ok,#22c55e);color:#fff;font-size:10px;padding:2px 7px;border-radius:20px">Validé</span>`
        : `<span class="badge-statut" style="background:var(--c-warning,#f59e0b);color:#fff;font-size:10px;padding:2px 7px;border-radius:20px">En attente</span>`;
    };

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
        <div class="pace-chiffres"><strong>${fmtCA(c.ca)} €</strong><span>/ ${fmtCA(c.obj)} € → <b>${c.axe1 + c.p3} €</b></span></div>
        ${barre(c.pct, 100)}
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">&lt;80% : 0 € · 80-99% : 200 € · 100-119% : 400 € · ≥120% : 400 € + 100 € bonus P3</p>
        <div style="margin-top:10px">
          <label class="q-label">Simulateur — si mon CA ${q} atteint :
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
        <div class="pace-chiffres">
          <strong>${c.nsbValid}</strong>
          <span>commande(s) validée(s)${c.nsbAttente ? ` · ${c.nsbAttente} en attente` : ''}</span>
        </div>
        ${barre(c.nsbValid, c.s1)}
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">≥${c.s1} cmd/Q : 75 € · ≥${c.s2} cmd/Q : 150 €</p>

        ${mesNSBQ.length > 0 ? `
        <details style="margin-top:10px">
          <summary style="font-size:12px;color:var(--c-text-2);cursor:pointer">Mes déclarations NSB ${q} (${mesNSBQ.length})</summary>
          ${mesNSBQ.map(n => `
          <div class="relance-ligne" style="align-items:center;padding:6px 0;border-bottom:1px solid var(--c-border,#eee)">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${n.Nom_Compte || '—'}</div>
              <div style="font-size:11px;color:var(--c-text-2)">${n.Date || '—'} · ${n.Produit || '—'} · ${n.Montant_EUR ? fmtCA(n.Montant_EUR) + ' €' : '—'}${n.Notes ? ' · ' + n.Notes : ''}</div>
            </div>
            ${badgeStatut(n)}
          </div>`).join('')}
        </details>` : ''}

        ${Number(pin) === Session.pin || Session.estCDS() ? `
        <button class="btn-secondaire" style="margin-top:10px" onclick="VuePrimes.state.modalNSB=true;VuePrimes.render()">
          + Déclarer une commande NSB</button>` : ''}
      </div>

      <!-- AXE 3 -->
      <div class="bloc-fiche">
        <div class="bloc-titre">Axe 3 — Onboarding EMPOWER
          <span class="pace-badge ${c.axe3 ? 'pace-ok' : 'pace-watch'}">${c.palier3} → ${c.axe3} €</span>
        </div>
        <div class="pace-chiffres">
          <strong>${c.integres}</strong>
          <span>compte(s) intégré(s) au ${q}${c.empowerAttente ? ` · ${c.empowerAttente} en attente de validation` : ''}</span>
        </div>
        ${barre(c.integres, 3)}
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;font-size:12px;color:var(--c-text-2)">
          <span>Pipeline : ${c.integresPipeline}</span>
          <span>Via Flavie (validés) : ${c.integresFlavie}</span>
          <span>Terrain (validés) : ${c.integresTerrain}</span>
        </div>
        <p style="font-size:11px;color:var(--c-text-2);margin-top:8px">≥3 comptes/Q : 50 € · ≥6 comptes/Q : 75 € — Seuls les onboardings validés par Tadjidine comptent.</p>

        ${mesEmpowerQ.length > 0 ? `
        <details style="margin-top:10px">
          <summary style="font-size:12px;color:var(--c-text-2);cursor:pointer">Mes déclarations onboarding ${q} (${mesEmpowerQ.length})</summary>
          ${mesEmpowerQ.map(n => {
            const typeLabel = String(n.Produit || '').toUpperCase().startsWith('EMPOWER_FLAVIE') ? 'Via Flavie' : 'Terrain';
            return `
          <div class="relance-ligne" style="align-items:center;padding:6px 0;border-bottom:1px solid var(--c-border,#eee)">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${n.Nom_Compte || '—'} <span style="font-size:11px;color:var(--c-text-2)">(${typeLabel})</span></div>
              <div style="font-size:11px;color:var(--c-text-2)">${n.Date || '—'}${n.Notes ? ' · ' + n.Notes : ''}</div>
            </div>
            ${badgeStatut(n)}
          </div>`;
          }).join('')}
        </details>` : ''}

        ${Number(pin) === Session.pin || Session.estCDS() ? `
        <button class="btn-secondaire" style="margin-top:10px" onclick="VuePrimes.state.modalOnboarding=true;VuePrimes.render()">
          + Déclarer un onboarding EMPOWER</button>` : ''}
      </div>
    `;
  },

  _renderManager(q) {
    const bonus = this.bonusManager(q);

    // Toutes les déclarations en attente (NSB + EMPOWER) — tous quarters confondus pour ne rien manquer
    const enAttenteNSB = this.state.nsb.filter(n =>
      String(n.Valid_Manager).toUpperCase() !== 'OUI' &&
      !String(n.Produit || '').toUpperCase().startsWith('EMPOWER_')
    );
    const enAttenteEmpower = this.state.nsb.filter(n =>
      String(n.Valid_Manager).toUpperCase() !== 'OUI' &&
      (String(n.Produit || '').toUpperCase().startsWith('EMPOWER_FLAVIE') ||
       String(n.Produit || '').toUpperCase().startsWith('EMPOWER_TERRAIN'))
    );
    const totalAttente = enAttenteNSB.length + enAttenteEmpower.length;

    const CDS = [ [1000, 'Tadjidine'], [4001, 'Lyes'], [4002, 'Mehdi'], [4003, 'Johanne'] ];

    // Rendu d'une ligne de déclaration en attente
    const ligneDeclaration = (n) => {
      const isEmpower = String(n.Produit || '').toUpperCase().startsWith('EMPOWER_');
      const typeLabel = isEmpower
        ? (String(n.Produit || '').toUpperCase().startsWith('EMPOWER_FLAVIE') ? 'Onboarding via Flavie' : 'Onboarding terrain')
        : (n.Produit || 'NSB');
      return `
      <div class="relance-ligne">
        <div style="flex:1">
          <div class="relance-nom">${n.Nom_Compte || '—'}
            <span style="font-size:11px;color:var(--c-text-2);font-weight:400"> · ${typeLabel}</span>
          </div>
          <div style="font-size:12px;color:var(--c-text-2)">
            ${n.Date || '—'} · CDS : ${resolveCDS(n.PIN_CDS)}${!isEmpower && n.Montant_EUR ? ' · ' + fmtCA(n.Montant_EUR) + ' €' : ''}${n.Notes ? ' · ' + n.Notes : ''}
          </div>
        </div>
        <button class="q-chip active" onclick="VuePrimes.validerDeclaration('${n.ID_NSB}')">Valider</button>
      </div>`;
    };

    return `
      <!-- BONUS MANAGER -->
      <div class="bloc-fiche dash-pace" style="border:2px solid var(--c-primary)">
        <div class="bloc-titre">Bonus manager ${q}
          <span class="pace-badge ${bonus.atteint ? 'pace-ok' : 'pace-risk'}">${bonus.atteint ? '+300 €' : 'Non atteint'}</span>
        </div>
        <div class="pace-chiffres"><strong>${fmtCA(bonus.ca)} €</strong><span>/ ${fmtCA(bonus.obj)} € équipe — +300 €/Q si collectif atteint (max 1 200 €/an)</span></div>
      </div>

      <!-- TABLE PRIMES CDS -->
      <div class="bloc-fiche">
        <div class="bloc-titre">Primes par CDS — ${q}</div>
        <div class="tableau-equipe">
          <div class="te-ligne te-head"><span>CDS</span><span>Axe 1</span><span>Axe 2</span><span>Axe 3</span><span>P3</span><span>Total</span></div>
          ${CDS.map(([p, nom]) => {
            const c = this.calculer(p, q);
            return `<div class="te-ligne">
              <span><strong>${nom}</strong></span>
              <span>${c.axe1} €</span><span>${c.axe2} €</span><span>${c.axe3} €</span>
              <span>${c.p3} €</span><span><strong style="color:var(--c-cta)">${c.total} €</strong></span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- VALIDATION DÉCLARATIONS -->
      <div class="bloc-fiche">
        <div class="bloc-titre">Déclarations à valider
          ${totalAttente ? `<span class="badge-rouge badge-priorite">${totalAttente}</span>` : '<span style="color:var(--c-ok,#22c55e);font-size:13px">Tout validé</span>'}
        </div>

        ${totalAttente === 0 ? '<div class="pas-de-donnees">Aucune déclaration en attente</div>' : `

        <!-- Filtre rapide -->
        <div class="q-chips" style="padding:0;margin-bottom:8px">
          ${['TOUS','NSB','EMPOWER'].map(f => `
            <button class="q-chip ${this.state.filtreValidation === f ? 'active' : ''}"
              onclick="VuePrimes.state.filtreValidation='${f}';VuePrimes.render()">${f === 'EMPOWER' ? 'Onboarding' : f}</button>`).join('')}
        </div>

        ${(this.state.filtreValidation !== 'EMPOWER' && enAttenteNSB.length) ? `
          <div style="font-size:12px;font-weight:700;color:var(--c-text-2);margin:8px 0 4px">NSB (${enAttenteNSB.length})</div>
          ${enAttenteNSB.map(ligneDeclaration).join('')}` : ''}

        ${(this.state.filtreValidation !== 'NSB' && enAttenteEmpower.length) ? `
          <div style="font-size:12px;font-weight:700;color:var(--c-text-2);margin:8px 0 4px">Onboardings EMPOWER (${enAttenteEmpower.length})</div>
          ${enAttenteEmpower.map(ligneDeclaration).join('')}` : ''}
        `}
      </div>

      <!-- DÉTAIL PERSO (Tadjidine est aussi CDS) -->
      ${this._renderCDS(1000, q, 'Mon détail (Tadjidine)')}
    `;
  },

  // ── Déclaration onboarding Flavie / Terrain ──
  async declarerOnboarding(e) {
    e.preventDefault();
    if (this.state.envoiEnCours) return;
    const v = id => document.getElementById(id)?.value?.trim() || '';
    const type = v('ob-type');  // 'EMPOWER_FLAVIE' ou 'EMPOWER_TERRAIN'
    const qte  = Math.max(1, parseInt(v('ob-qte') || '1', 10));
    this.state.envoiEnCours = true;
    try {
      const promises = [];
      for (let i = 0; i < qte; i++) {
        const typeLabel = type === 'EMPOWER_FLAVIE' ? 'Flavie' : 'Terrain';
        const ligne = {
          ID_NSB: genId('OB'),
          Date: v('ob-date') || dateISOLocale(),
          PIN_CDS: Session.pin,
          ID_Compte: '',
          Nom_Compte: v('ob-compte') || '',
          Produit: type,
          Montant_EUR: 0,
          Statut: 'DECLARE',
          Valid_Manager: 'NON',
          Date_Validation: '',
          Notes: v('ob-note'),
        };
        promises.push(SheetsAPI.ecrire('EMPOWER_MDB', '🛒_NSB_COMMANDES', ligne)
          .then(() => this.state.nsb.push(ligne)));
      }
      await Promise.all(promises);
      this.state.modalOnboarding = false;
      Toast.afficher(`${qte} onboarding(s) ${type === 'EMPOWER_FLAVIE' ? 'via Flavie' : 'terrain'} déclaré(s) — en attente de validation`, 'succes');
    } catch(err) { Toast.afficher('Erreur : ' + (err.message || err), 'erreur'); }
    this.state.envoiEnCours = false;
    this.render();
  },

  _renderModalNSB() {
    if (!this.state?.modalNSB) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this){VuePrimes.state.modalNSB=false;VuePrimes.render()}">
      <div class="modal">
        <h3>Déclarer une commande NSB</h3>
        <form onsubmit="VuePrimes.declarerNSB(event)">
          <label>Revendeur (optionnel)<input id="nsb-compte" placeholder="Nom du revendeur (facultatif)"/></label>
          <label>Date<input id="nsb-date" type="date" value="${dateISOLocale()}"/></label>
          <label>Produit<select id="nsb-produit"><option>NSB</option><option>NSB 5 postes</option><option>NSB 10 postes</option><option>NSB 20 postes</option></select></label>
          <label>Quantité<input id="nsb-qte" type="number" min="1" max="50" value="1" style="width:80px"/></label>
          <label>Montant unitaire (€)<input id="nsb-montant" type="number" inputmode="decimal"/></label>
          <label>Note<textarea id="nsb-note" rows="2" placeholder="N° commande, distributeur…"></textarea></label>
          <p style="font-size:11px;color:var(--c-text-2)">Chaque unité comptera séparément. Validation par Tadjidine requise.</p>
          <div class="modal-btns">
            <button type="button" onclick="VuePrimes.state.modalNSB=false;VuePrimes.render()">Annuler</button>
            <button type="submit" class="btn-primaire" ${this.state.envoiEnCours ? 'disabled' : ''}>
              ${this.state.envoiEnCours ? 'Envoi…' : 'Déclarer'}</button>
          </div>
        </form>
      </div>
    </div>`;
  },

  _renderModalOnboarding() {
    if (!this.state?.modalOnboarding) return '';
    return `
    <div class="modal-overlay" onclick="if(event.target===this){VuePrimes.state.modalOnboarding=false;VuePrimes.render()}">
      <div class="modal">
        <h3>Déclarer un onboarding EMPOWER</h3>
        <form onsubmit="VuePrimes.declarerOnboarding(event)">
          <label>Type *
            <select id="ob-type">
              <option value="EMPOWER_FLAVIE">Via Flavie (conversion Flavie + 1ère commande confirmée)</option>
              <option value="EMPOWER_TERRAIN">Terrain (onboarding direct par le CDS)</option>
            </select>
          </label>
          <label>Quantité<input id="ob-qte" type="number" min="1" max="20" value="1" style="width:80px"/></label>
          <label>Revendeur (optionnel)<input id="ob-compte" placeholder="Nom du revendeur (facultatif)"/></label>
          <label>Date<input id="ob-date" type="date" value="${dateISOLocale()}"/></label>
          <label>Note<textarea id="ob-note" rows="2" placeholder="Contexte, distributeur…"></textarea></label>
          <p style="font-size:11px;color:var(--c-text-2)">Chaque compte onboardé comptera pour l'Axe 3 une fois validé par Tadjidine.</p>
          <div class="modal-btns">
            <button type="button" onclick="VuePrimes.state.modalOnboarding=false;VuePrimes.render()">Annuler</button>
            <button type="submit" class="btn-primaire" ${this.state.envoiEnCours ? 'disabled' : ''}>
              ${this.state.envoiEnCours ? 'Envoi…' : 'Déclarer'}</button>
          </div>
        </form>
      </div>
    </div>`;
  },
};
