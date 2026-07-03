// ═══════════════════════════════════════
//  vue-objectifs.js — SUIVI DES OBJECTIFS V2.2 (Bloc 3)
//  Sources : 🎯_OBJECTIFS_PRIMES · ⚙️_PARAMS
//  ADMIN : saisie CA réalisé + objectifs CDS
//  CDS   : lecture seule (filtré sur Session.pin)
//  Règles transverses Bloc 9 : resolveCDS · parseCA/fmtCA · aucun PIN affiché
// ═══════════════════════════════════════

window.VueObjectifs = {

  QUARTERS_DATES: {
    Q1: { debut: '2026-04-01', fin: '2026-06-30' },
    Q2: { debut: '2026-07-01', fin: '2026-09-30' },
    Q3: { debut: '2026-10-01', fin: '2026-12-31' },
    Q4: { debut: '2027-01-01', fin: '2027-03-31' },
  },

  state: {
    chargement: true, erreur: null,
    objectifs: [], params: {}, nsb: [], prospects: [],
    quarter: null, semaine: null,
    modalSaisie: false,
    formSaisie: {},
    saving: false,
    modalCA: false,
    formCA: { quarter: null, montant: '' },
    savingCA: false,
  },

  async init() {
    this.state.chargement = true;
    this.state.erreur = null;
    this.render();
    try {
      const [objectifs, params, nsb, prospects] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES'),
        SheetsAPI.lire('EMPOWER_MDB', '⚙️_PARAMS'),
        SheetsAPI.lire('EMPOWER_MDB', '🛒_NSB_COMMANDES').catch(() => []),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS').catch(() => []),
      ]);
      const paramMap = Object.fromEntries(params.map(p => [p.Parametre, p.Valeur]));
      this.state.objectifs  = objectifs;
      this.state.params     = paramMap;
      this.state.nsb        = nsb;
      this.state.prospects  = prospects;
      this.state.quarter    = paramMap.QuarterActif || 'Q1';
      this.state.semaine    = getISOWeek();
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      this.state.erreur = e.message;
      this.render();
    }
  },

  _dansQuarter(dateStr, q) {
    if (!dateStr) return false;
    const b = this.QUARTERS_DATES[q] || {};
    const d = String(dateStr).slice(0, 10);
    return d >= (b.debut || '') && d <= (b.fin || '');
  },

  _axe2CDS(pin) {
    const q = this.state.quarter;
    const o = this.state.objectifs.find(x => Number(x.PIN_CDS) === pin) || {};
    const nsbQ = this.state.nsb.filter(n =>
      Number(n.PIN_CDS) === pin && this._dansQuarter(n.Date, q)
    );
    const valide = nsbQ.filter(n => String(n.Valid_Manager||'').toUpperCase() === 'OUI').length;
    const obj2   = Number(o[`${q}_Obj_NSB`] || 0);
    return { valide, total: nsbQ.length, obj2 };
  },

  _axe3CDS(pin) {
    const q = this.state.quarter;
    const o = this.state.objectifs.find(x => Number(x.PIN_CDS) === pin) || {};
    const integres = this.state.prospects.filter(p =>
      Number(p.PIN_CDS_Assigne) === pin &&
      String(p.Flag_converti||'').toUpperCase() === 'TRUE' &&
      this._dansQuarter(p.PREMIERE_COMMANDE_DATE || p.Timestamp, q)
    ).length;
    const obj3 = Number(o[`${q}_Obj_Onboarding`] || 0);
    // Comptes onboardés via Flavie OU Alexandra (ORIGINE contient l'un ou l'autre)
    const viaCanal = this.state.prospects.filter(p => {
      const origine = String(p.ORIGINE||'').toLowerCase();
      return Number(p.PIN_CDS_Assigne) === pin &&
        String(p.Flag_converti||'').toUpperCase() === 'TRUE' &&
        (origine.includes('flavie') || origine.includes('alexandra')) &&
        this._dansQuarter(p.PREMIERE_COMMANDE_DATE || p.Timestamp, q);
    }).length;
    return { integres, viaCanal, terrain: integres - viaCanal, obj3 };
  },

  _donneesCDS(pin) {
    const q = this.state.quarter;
    const o = this.state.objectifs.find(x => Number(x.PIN_CDS) === pin) || {};
    // parseCA (Bloc 9) : rejette les dates corrompues et NaN, retourne null
    const ca  = window.parseCA(o[`${q}_CA_Realise`])  ?? 0;
    const obj = window.parseCA(o[`${q}_Obj_Revise`] || o[`${q}_Obj_Initial`]) ?? 0;
    const pct = (obj > 0 && isFinite(ca) && isFinite(obj)) ? Math.round(ca / obj * 100) : 0;
    const numSem   = parseInt((this.state.semaine || 'S01').replace('S', ''), 10) || 1;
    const semDansQ = Math.min(Math.max(numSem, 1), 13);
    const projection = isFinite(ca) ? Math.round(ca / semDansQ * 13) : 0;
    const ecart = isFinite(obj) && isFinite(ca) ? obj - ca : null;
    const pace  = pct >= 100 ? 'ON_TRACK' : pct >= 80 ? 'WATCH' : 'AT_RISK';
    return { ca, obj, pct, projection, ecart, pace, id: o.ID_Objectif || '' };
  },

  _barreProgression(pct, pace) {
    const couleur = pace === 'ON_TRACK' ? 'var(--c-success)' : pace === 'WATCH' ? 'var(--c-warning)' : 'var(--c-danger)';
    return `<div style="height:8px;background:var(--c-border);border-radius:4px;overflow:hidden;margin-top:6px">
      <div style="height:100%;width:${Math.min(pct, 100)}%;background:${couleur};transition:width .4s ease"></div>
    </div>`;
  },

  // ── Ouvrir modal saisie (ADMIN uniquement) ──
  ouvrirModalSaisie() {
    // Sécurité : seul l'ADMIN peut saisir/modifier les objectifs
    if (!Session.voitTout()) return;
    const q   = this.state.quarter;
    const frm = {};
    this.state.objectifs.forEach(o => {
      frm[String(o.PIN_CDS)] = {
        ca:          window.parseCA(o[`${q}_CA_Realise`])  ?? 0,
        obj_ca:      window.parseCA(o[`${q}_Obj_Revise`])  ?? window.parseCA(o[`${q}_Obj_Initial`]) ?? 0,
        obj_nsb:     Number(o[`${q}_Obj_NSB`]              || 0),
        obj_onboard: Number(o[`${q}_Obj_Onboarding`]       || 0),
      };
    });
    this.state.formSaisie = frm;
    this.state.modalSaisie = true;
    this.render();
  },
  fermerModalSaisie() { this.state.modalSaisie = false; this.render(); },

  ouvrirModalCA() {
    this.state.formCA = { quarter: this.state.quarter, montant: '' };
    this.state.modalCA = true;
    this.render();
  },
  fermerModalCA() { this.state.modalCA = false; this.render(); },

  async sauvegarderCA(e) {
    e.preventDefault();
    if (this.state.savingCA) return;
    const { quarter, montant } = this.state.formCA;
    const val = window.parseCA(montant);
    if (val === null || !isFinite(val) || val < 0) {
      Toast.afficher('Montant invalide', 'erreur');
      return;
    }
    this.state.savingCA = true;
    this.render();
    try {
      await SheetsAPI.mettreAJourCA(quarter, val);
      SheetsAPI.viderCache('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES');
      Toast.afficher('✅ CA déclaré avec succès', 'succes');
      this.state.modalCA = false;
      await this.init();
    } catch(err) {
      Toast.afficher(`Erreur : ${err.message}`, 'erreur');
      this.state.savingCA = false;
      this.render();
    }
  },

  async sauvegarderSaisie(e) {
    e.preventDefault();
    // Sécurité : seul l'ADMIN peut enregistrer des modifications
    if (!Session.voitTout()) return;
    if (this.state.saving) return;
    this.state.saving = true;
    const q = this.state.quarter;
    let ok = 0, err = 0;
    try {
      for (const [id, vals] of Object.entries(this.state.formSaisie)) {
        const safeNum = v => { const n = window.parseCA(v); return (n !== null && isFinite(n)) ? n : 0; };
        const maj = {
          [`${q}_CA_Realise`]:    safeNum(typeof vals === 'object' ? vals.ca         : vals),
          [`${q}_Obj_Revise`]:    safeNum(typeof vals === 'object' ? vals.obj_ca     : 0) || undefined,
          [`${q}_Obj_NSB`]:       Number(typeof vals === 'object' ? vals.obj_nsb     : 0) || undefined,
          [`${q}_Obj_Onboarding`]:Number(typeof vals === 'object' ? vals.obj_onboard : 0) || undefined,
        };
        // Ne garder que les champs non-undefined
        Object.keys(maj).forEach(k => maj[k] === undefined && delete maj[k]);
        try {
          await SheetsAPI.mettreAJour('EMPOWER_MDB', '🎯_OBJECTIFS_PRIMES', id, maj);
          const ligne = this.state.objectifs.find(o => o.ID_Objectif === id);
          if (ligne) Object.assign(ligne, maj);
          ok++;
        } catch { err++; }
      }
      Toast.afficher(err === 0
        ? `✅ ${ok} objectif(s) mis à jour`
        : `⚠️ ${ok} OK · ${err} erreur(s)`,
        err === 0 ? 'succes' : 'warning');
    } finally {
      this.state.saving      = false;
      this.state.modalSaisie = false;
      this.render();
    }
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement des objectifs…</div>';
      return;
    }
    if (this.state.erreur) {
      app.innerHTML = `<div class="erreur">Erreur : ${this.state.erreur}
        <br><br><button class="btn-secondaire" onclick="VueObjectifs.init()">Réessayer</button></div>`;
      return;
    }

    const q          = this.state.quarter;
    const estManager = Session.voitTout();

    // fmtEUR : affiche '—' si valeur invalide/nulle, sinon montant €
    const fmtEUR = v => {
      const n = window.parseCA(v);
      if (n === null || !isFinite(n)) return '—';
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR',
        minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    };
    const safePct = p => (typeof p === 'number' && isFinite(p)) ? `${p}%` : '—';

    const renderCDS = (pin, nomBrut) => {
      const d = this._donneesCDS(pin);
      const PACE_LBL = { ON_TRACK: '🟢 ON TRACK', WATCH: '🟡 WATCH', AT_RISK: '🔴 AT RISK' };
      const a2 = this._axe2CDS(pin);
      const a3 = this._axe3CDS(pin);
      // Résolution du nom : priorité resolveCDS(pin) — jamais de PIN brut dans l'UI
      const nomAffiche = window.resolveCDS(pin) !== '—' ? window.resolveCDS(pin)
                       : (nomBrut ? window.resolveCDS(nomBrut) || nomBrut : '—');
      const ecartHtml = d.ecart === null ? '—'
        : `${d.ecart > 0 ? '-' : '+'}${fmtEUR(Math.abs(d.ecart))}`;
      const ecartCouleur = d.ecart === null ? 'var(--c-text-2)'
        : d.ecart > 0 ? 'var(--c-danger)' : 'var(--c-success)';
      return `
        <div class="bloc-fiche">
          <div class="bloc-titre">${nomAffiche}
            <span class="pace-badge ${d.pace === 'ON_TRACK' ? 'pace-ok' : d.pace === 'WATCH' ? 'pace-watch' : 'pace-risk'}">${PACE_LBL[d.pace]}</span>
          </div>
          <div style="font-size:11px;font-weight:700;color:var(--c-text-2);letter-spacing:.05em;margin-bottom:4px">AXE 1 — CA</div>
          <div class="pace-chiffres">
            <strong>${fmtEUR(d.ca)}</strong>
            <span>/ ${fmtEUR(d.obj)} — ${q}</span>
          </div>
          ${this._barreProgression(d.pct, d.pace)}
          <div class="objectifs-grille" style="margin-top:10px">
            <div class="stat-mini"><div>${safePct(d.pct)}</div><div>Atteinte</div></div>
            <div class="stat-mini"><div>${fmtEUR(d.projection)}</div><div>Projection ${q}</div></div>
            <div class="stat-mini" style="color:${ecartCouleur}">
              <div>${ecartHtml}</div>
              <div>Écart</div>
            </div>
          </div>
          <div style="height:1px;background:var(--c-border);margin:12px 0"></div>
          <div style="font-size:11px;font-weight:700;color:var(--c-text-2);letter-spacing:.05em;margin-bottom:4px">AXE 2 — NSB</div>
          <div class="objectifs-grille">
            <div class="stat-mini"><div>${a2.valide ?? '—'}</div><div>Validés</div></div>
            <div class="stat-mini"><div>${(a2.total - a2.valide) ?? '—'}</div><div>En attente</div></div>
            ${a2.obj2 > 0 ? `<div class="stat-mini"><div>${a2.obj2}</div><div>Objectif NSB</div></div>` : ''}
          </div>
          <div style="height:1px;background:var(--c-border);margin:12px 0"></div>
          <div style="font-size:11px;font-weight:700;color:var(--c-text-2);letter-spacing:.05em;margin-bottom:4px">AXE 3 — ONBOARDING EMPOWER</div>
          <div class="objectifs-grille">
            <div class="stat-mini"><div>${a3.integres ?? '—'}</div><div>Total intégrés</div></div>
            <div class="stat-mini"><div>${a3.viaCanal ?? '—'}</div><div>Via Alexandra</div></div>
            <div class="stat-mini"><div>${a3.terrain ?? '—'}</div><div>Par le CDS</div></div>
            ${a3.obj3 > 0 ? `<div class="stat-mini"><div>${a3.obj3}</div><div>Objectif</div></div>` : ''}
          </div>
        </div>`;
    };

    let corps = '';
    if (estManager) {
      // Construit la liste CDS depuis objectifs — nom résolu via resolveCDS
      const CDS = this.state.objectifs.map(o => ({
        pin: Number(o.PIN_CDS),
        nom: window.resolveCDS(Number(o.PIN_CDS)) !== '—'
          ? window.resolveCDS(Number(o.PIN_CDS))
          : window.resolveCDS(o.Nom_CDS) || (o.Nom_CDS || '—'),
      }));
      const totalCA  = CDS.reduce((s, c) => s + (this._donneesCDS(c.pin).ca  || 0), 0);
      const totalObj = CDS.reduce((s, c) => s + (this._donneesCDS(c.pin).obj || 0), 0);
      const pctTotal  = (totalObj > 0 && isFinite(totalCA) && isFinite(totalObj))
        ? Math.round(totalCA / totalObj * 100) : 0;
      const paceTotal = pctTotal >= 100 ? 'ON_TRACK' : pctTotal >= 80 ? 'WATCH' : 'AT_RISK';
      corps = `
        <div class="bloc-fiche">
          <div class="bloc-titre">Équipe — ${q}
            <span class="pace-badge ${paceTotal === 'ON_TRACK' ? 'pace-ok' : paceTotal === 'WATCH' ? 'pace-watch' : 'pace-risk'}">${pctTotal}%</span>
            <button class="btn-lien" style="margin-left:auto;font-size:13px" onclick="VueObjectifs.ouvrirModalSaisie()">
              📥 Saisir / Modifier Objectifs
            </button>
          </div>
          <div class="pace-chiffres"><strong>${fmtEUR(totalCA)}</strong><span>/ ${fmtEUR(totalObj)}</span></div>
          ${this._barreProgression(pctTotal, paceTotal)}
        </div>
        ${CDS.map(c => renderCDS(c.pin, c.nom)).join('')}
      `;
    } else {
      // CDS : vue personnelle + bouton déclaration CA
      corps = renderCDS(Session.pin, null);
      corps += `
        <div style="margin-top:12px">
          <button class="btn-primaire" style="width:100%" onclick="VueObjectifs.ouvrirModalCA()">
            📝 Déclarer mon CA
          </button>
        </div>`;
    }

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="Router.aller('#/dashboard')" class="btn-retour">←</button>
        <h1>${estManager ? 'Objectifs FDV' : 'Mes objectifs'}</h1>
        <span class="badge-compteur">${q} · ${this.state.semaine}</span>
      </header>
      <div class="avec-nav dash-body" style="padding:12px">
        <p style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">
          Quarter actif : <strong>${q}</strong> FY27 · ${this.state.semaine}
        </p>
        ${corps}
      </div>
      ${NavBar('objectifs')}
      ${this._renderModal()}
      ${this._renderModalCA()}
    `;
  },

  _renderModalCA() {
    if (!this.state.modalCA) return '';
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueObjectifs.fermerModalCA()">
      <div class="modal">
        <h3>📝 Déclarer mon CA</h3>
        <p style="font-size:12px;color:var(--c-text-2);margin-bottom:14px">
          Saisissez votre CA réalisé cumulé pour le quarter sélectionné.
        </p>
        <form onsubmit="VueObjectifs.sauvegarderCA(event)">
          <div style="margin-bottom:12px">
            <label style="font-size:12px;color:var(--c-text-2);display:block;margin-bottom:4px">Quarter</label>
            <select onchange="VueObjectifs.state.formCA.quarter=this.value"
                    style="width:100%;padding:8px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);font-size:13px;background:var(--c-surface);color:var(--c-title)">
              ${quarters.map(qt => `<option value="${qt}" ${this.state.formCA.quarter === qt ? 'selected' : ''}>${qt} FY27</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:16px">
            <label style="font-size:12px;color:var(--c-text-2);display:block;margin-bottom:4px">CA réalisé cumulé (€)</label>
            <input type="number" min="0" step="0.01" placeholder="0.00"
                   value="${this.state.formCA.montant}"
                   oninput="VueObjectifs.state.formCA.montant=this.value"
                   style="width:100%;padding:8px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);font-size:15px;font-weight:700;box-sizing:border-box;color:var(--c-title);background:var(--c-surface)"
                   autofocus/>
          </div>
          <div class="modal-btns">
            <button type="button" onclick="VueObjectifs.fermerModalCA()">Annuler</button>
            <button type="submit" class="btn-primaire" ${this.state.savingCA ? 'disabled' : ''}>
              ${this.state.savingCA ? '⏳ Envoi…' : '💾 Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>`;
  },

  _renderModal() {
    // Double sécurité : modal inaccessible si non-ADMIN
    if (!this.state.modalSaisie || !Session.voitTout()) return '';
    const q    = this.state.quarter;
    const inp  = (id, field, label, unit='€', step='0.01') => {
      const v = this.state.formSaisie[id]?.[field] ?? 0;
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="min-width:110px;font-size:12px;color:var(--c-text-2)">${label}</span>
        <input type="number" min="0" step="${step}" value="${v}"
               oninput="VueObjectifs.state.formSaisie['${id}']['${field}']=Number(this.value)"
               style="flex:1;padding:6px 8px;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);font-size:13px"/>
        <span style="font-size:11px;color:var(--c-text-2);min-width:14px">${unit}</span>
      </div>`;
    };
    const rows = this.state.objectifs.map(o => {
      const id = String(o.PIN_CDS);
      if (!this.state.formSaisie[id] || typeof this.state.formSaisie[id] !== 'object')
        this.state.formSaisie[id] = { ca: 0, obj_ca: 0, obj_nsb: 0, obj_onboard: 0 };
      // Nom résolu : jamais de PIN brut ni de Nom_CDS non traité
      const nomAff = window.resolveCDS(Number(o.PIN_CDS)) !== '—'
        ? window.resolveCDS(Number(o.PIN_CDS))
        : window.resolveCDS(o.Nom_CDS) || (o.Nom_CDS || '—');
      return `
        <div style="margin-bottom:14px;padding:10px;background:var(--c-bg);border-radius:var(--radius-sm);border:1px solid var(--c-border)">
          <div style="font-weight:700;font-size:14px;margin-bottom:8px">${nomAff}</div>
          ${inp(id,'ca',         'CA réalisé',       '€')}
          ${inp(id,'obj_ca',     'Obj. CA révisé',   '€')}
          ${inp(id,'obj_nsb',    'Obj. NSB/Q',       'cmd','1')}
          ${inp(id,'obj_onboard','Obj. Onboarding/Q','cpt','1')}
        </div>`;
    }).join('');

    return `
    <div class="modal-overlay" onclick="if(event.target===this)VueObjectifs.fermerModalSaisie()">
      <div class="modal">
        <h3>📥 Saisir Objectifs & Réalisés — ${q} FY27</h3>
        <p style="font-size:12px;color:var(--c-text-2);margin-bottom:14px">
          CA réalisé cumulé · objectifs CA, NSB et onboarding par CDS.
        </p>
        <form onsubmit="VueObjectifs.sauvegarderSaisie(event)">
          ${rows}
          <div class="modal-btns">
            <button type="button" onclick="VueObjectifs.fermerModalSaisie()">Annuler</button>
            <button type="submit" class="btn-primaire" ${this.state.saving ? 'disabled' : ''}>
              ${this.state.saving ? '⏳ Enregistrement…' : '💾 Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>`;
  },
};
