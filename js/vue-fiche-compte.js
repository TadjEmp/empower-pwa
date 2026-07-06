// ═══════════════════════════════════════
//  vue-fiche-compte.js — Fiche détaillée compte
//  Sources : 🏢_COMPTES + V17 (jointure nom normalisé)
//            🗺️_VISITES + 📞_PHONING (historique)
// ═══════════════════════════════════════

window.VueFicheCompte = {

  state: {
    compte: null, v17: null, visites: [], appels: [], chargement: true,
    editCoord: false,
    formCoord: { ville: '', code_postal: '', departement: '', tel: '', email: '' },
    sauvegardeEnCours: false,
    modalRapportPhoning: false,
  },

  async init(idCompte) {
    this.state.chargement = true;
    this.state.editCoord  = false;
    this.render();
    try {
      const [comptes, rawV17, visites, appels] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('V17', '📋 COMPTES HISTORIQUES'),
        SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES'),
        SheetsAPI.lire('EMPOWER_MDB', '📞_PHONING'),
      ]);
      const compte = comptes.find(c => String(c.ID_Compte) === String(idCompte));
      if (!compte) throw new Error(`Compte ${idCompte} introuvable`);

      const nomNorm = normaliserNom(compte.Nom_Compte);
      this.state.compte  = compte;
      this.state.v17     = rawV17.find(r => normaliserNom(r.RESELLER) === nomNorm) || null;
      this.state.visites = visites.filter(v => String(v.ID_Cible) === String(idCompte))
        .sort((a, b) => new Date(b.Date) - new Date(a.Date));
      this.state.appels  = appels.filter(a => String(a.ID_Cible) === String(idCompte))
        .sort((a, b) => new Date(b.Date) - new Date(a.Date));
      this.state.chargement = false;
      this.render();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML =
        `<div class="erreur">Erreur : ${e.message}<br><br>
         <button class="btn-secondaire" onclick="Router.aller('#/comptes')">← Retour aux comptes</button></div>`;
    }
  },

  ouvrirEditionCoordonnees() {
    const c = this.state.compte;
    this.state.formCoord = {
      adresse:     c.Adresse     || '',
      ville:       c.Ville       || '',
      code_postal: c.Code_Postal || '',
      departement: c.Departement || (c.Code_Postal ? String(c.Code_Postal).slice(0, 2) : ''),
      tel:         c.Tel         || '',
      email:       c.Email       || '',
    };
    this.state.editCoord = true;
    this.render();
  },

  annulerEditionCoordonnees() {
    this.state.editCoord = false;
    this.render();
  },

  _syncDept() {
    const cp = this.state.formCoord.code_postal.trim();
    if (cp.length >= 2 && !this.state.formCoord.departement) {
      this.state.formCoord.departement = cp.slice(0, cp.startsWith('97') ? 3 : 2);
    }
    this.render();
  },

  async sauvegarderCoordonnees() {
    if (this.state.sauvegardeEnCours) return;
    const f = this.state.formCoord;
    const c = this.state.compte;

    const champs = {
      Adresse:     f.adresse.trim()     || null,
      Ville:       f.ville.trim()       || null,
      Code_Postal: f.code_postal.trim() || null,
      Departement: f.departement.trim() || null,
      Tel:         f.tel.trim()         || null,
      Email:       f.email.trim()       || null,
    };

    this.state.sauvegardeEnCours = true;
    this.render();
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', c.ID_Compte, champs);
      // Update local state
      Object.assign(this.state.compte, champs);
      this.state.editCoord = false;
      Toast.afficher('✅ Coordonnées mises à jour', 'succes');
    } catch(e) {
      Toast.afficher('❌ ' + e.message, 'erreur');
    }
    this.state.sauvegardeEnCours = false;
    this.render();
  },

  ouvrirRapportPhoning() {
    this.state.modalRapportPhoning = true;
    this.render();
  },

  fermerRapportPhoning() {
    this.state.modalRapportPhoning = false;
    this.render();
  },

  _renderModalRapportPhoning() {
    const appels = [...this.state.appels].sort((a, b) => new Date(b.Date) - new Date(a.Date));
    return `
      <div class="modal-overlay" onclick="if(event.target===this)VueFicheCompte.fermerRapportPhoning()">
        <div class="modal" style="max-width:520px;margin:0 auto">
          <h3>📊 Rapport Phoning — ${this.state.compte.Nom_Compte}</h3>
          ${appels.length === 0 ? '<div class="vide-liste">Aucun appel enregistré pour ce compte</div>' : `
            <p style="font-size:12px;color:var(--c-text-2);margin-bottom:12px">${appels.length} appel${appels.length > 1 ? 's' : ''} au total</p>
            ${appels.map(a => `
            <div class="carte-appel" style="margin-bottom:10px">
              <div class="appel-date">${a.Date || '—'} · ${window.resolveCDS(a.PIN_CDS || a.Nom_CDS)}</div>
              <div class="appel-resultat">${a.Statut_Appel || '—'} · Intérêt EMPOWER : ${a.Interet_EMPOWER || '—'}${a.Interet_Score ? ' (' + a.Interet_Score + '/5)' : ''}</div>
              ${a.Frein_Principal ? `<div class="appel-frein">Frein : ${a.Frein_Principal}</div>` : ''}
              ${a.Prochaine_Action ? `<div class="appel-frein">→ ${a.Prochaine_Action}${a.Date_Rappel ? ' (' + a.Date_Rappel + ')' : ''}</div>` : ''}
              ${a.Note ? `<div class="pa-note">📝 ${a.Note}</div>` : ''}
            </div>`).join('')}
          `}
          <button class="btn-secondaire" style="margin-top:8px" onclick="VueFicheCompte.fermerRapportPhoning()">Fermer</button>
        </div>
      </div>`;
  },

  _barreCA(label, val, max) {
    const pct = max > 0 ? Math.max(2, Math.round(val / max * 100)) : 2;
    return `
      <div class="barre-ligne">
        <div class="barre-label">${label}</div>
        <div class="barre-ca" style="width:${pct}%;background:var(--c-primary)"></div>
        <div class="barre-valeur">${window.fmtCA(val)}</div>
      </div>`;
  },

  _renderBlocIdentite(c) {
    if (this.state.editCoord) {
      const f = this.state.formCoord;
      return `
        <div class="bloc-fiche">
          <div class="bloc-titre">
            Identité
            <button class="btn-lien" style="margin-left:auto;font-size:12px;color:var(--c-text-2)"
                    onclick="VueFicheCompte.annulerEditionCoordonnees()">✕ Annuler</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <label style="font-size:13px;font-weight:600">Adresse
              <input value="${f.adresse}" placeholder="ex : 15 rue de la Paix"
                     oninput="VueFicheCompte.state.formCoord.adresse=this.value"
                     style="width:100%;margin-top:4px"/>
            </label>
            <label style="font-size:13px;font-weight:600">Ville
              <input value="${f.ville}" placeholder="ex : Paris"
                     oninput="VueFicheCompte.state.formCoord.ville=this.value"
                     style="width:100%;margin-top:4px"/>
            </label>
            <div style="display:flex;gap:8px">
              <label style="flex:1;font-size:13px;font-weight:600">Code Postal
                <input value="${f.code_postal}" placeholder="ex : 75001" maxlength="5"
                       oninput="VueFicheCompte.state.formCoord.code_postal=this.value;VueFicheCompte._syncDept()"
                       style="width:100%;margin-top:4px"/>
              </label>
              <label style="flex:1;font-size:13px;font-weight:600">Département
                <input value="${f.departement}" placeholder="ex : 75" maxlength="3"
                       oninput="VueFicheCompte.state.formCoord.departement=this.value"
                       style="width:100%;margin-top:4px"/>
              </label>
            </div>
            <label style="font-size:13px;font-weight:600">Téléphone
              <input type="tel" value="${f.tel}" placeholder="ex : 01 23 45 67 89"
                     oninput="VueFicheCompte.state.formCoord.tel=this.value"
                     style="width:100%;margin-top:4px"/>
            </label>
            <label style="font-size:13px;font-weight:600">Email
              <input type="email" value="${f.email}" placeholder="ex : contact@societe.fr"
                     oninput="VueFicheCompte.state.formCoord.email=this.value"
                     style="width:100%;margin-top:4px"/>
            </label>
            <button class="btn-primaire" style="margin-top:4px"
                    onclick="VueFicheCompte.sauvegarderCoordonnees()"
                    ${this.state.sauvegardeEnCours ? 'disabled' : ''}>
              ${this.state.sauvegardeEnCours ? '⏳ Enregistrement…' : '💾 Enregistrer les coordonnées'}
            </button>
          </div>
        </div>`;
    }

    const dept = c.Departement || (c.Code_Postal ? String(c.Code_Postal).slice(0, 2) : null);
    const coordManquantes = !c.Ville && !c.Code_Postal && !c.Tel && !c.Email;

    return `
      <div class="bloc-fiche">
        <div class="bloc-titre">
          Identité
          <button class="btn-lien" title="Modifier les coordonnées"
                  style="margin-left:auto;font-size:12px"
                  onclick="VueFicheCompte.ouvrirEditionCoordonnees()">✏️ Modifier</button>
        </div>
        ${coordManquantes ? `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:10px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--c-warning) 10%,transparent);border:1px solid color-mix(in srgb,var(--c-warning) 30%,transparent);font-size:12px;color:var(--c-warning)">
          ⚠️ Coordonnées manquantes —
          <button class="btn-lien" style="font-size:12px;color:var(--c-primary);font-weight:600"
                  onclick="VueFicheCompte.ouvrirEditionCoordonnees()">Saisir maintenant →</button>
        </div>` : ''}
        <div class="grille-identite">
          ${c.Adresse ? `<div class="id-ligne"><span>Adresse</span><strong>${c.Adresse}</strong></div>` : ''}
          <div class="id-ligne"><span>Ville</span><strong>${c.Ville || '—'}${c.Code_Postal ? ' (' + c.Code_Postal + ')' : ''}</strong></div>
          <div class="id-ligne"><span>Département</span><strong>${dept || '—'}</strong></div>
          <div class="id-ligne"><span>Canal / Secteur</span><strong>${c.CANAL || '—'} · ${c.SECTEUR || '—'}</strong></div>
          <div class="id-ligne"><span>Téléphone</span><strong>${c.Tel ? `<a class="lien-tel" href="tel:${c.Tel.replace(/\s/g,'')}">${c.Tel}</a>` : '—'}</strong></div>
          <div class="id-ligne"><span>Email</span><strong>${c.Email ? `<a class="lien-email" href="mailto:${c.Email}">${c.Email}</a>` : '—'}</strong></div>
          <div class="id-ligne"><span>CDS</span><strong>${window.resolveCDS(c.PIN_CDS_Assigne || c.Nom_CDS)}</strong></div>
          <div class="id-ligne"><span>EMPOWER</span><strong>${c.HAS_EMPOWER || '—'}</strong></div>
          <div class="id-ligne"><span>CA FY25</span><strong>${window.fmtCA(this.state.v17?.['CA FY25 €'] ?? c.CA_FY25)} €</strong></div>
          <div class="id-ligne"><span>CA FY26</span><strong>${window.fmtCA(this.state.v17?.['CA FY26 €'] ?? c.CA_FY26)} €</strong></div>
          <div class="id-ligne"><span>Dernier Q (Q1·27)</span><strong>${(window.parseCA(this.state.v17?.['CA Q1FY27 €'] ?? c.CA_Q1FY27) !== null ? window.fmtCA(window.parseCA(this.state.v17?.['CA Q1FY27 €'] ?? c.CA_Q1FY27)) : '—')} €</strong></div>
          <div class="id-ligne"><span>Potentiel</span><strong>${c.POTENTIEL || this.state.v17?.POTENTIEL_UPSELL || '—'}</strong></div>
          ${this.state.v17?.GROSSISTE_PRINCIPAL ? `<div class="id-ligne"><span>Grossiste</span><strong>${this.state.v17.GROSSISTE_PRINCIPAL}</strong></div>` : ''}
        </div>
        ${c.Source_Import === 'VISITE_FROID_CONVERTI' ? `
        <div style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:600;background:color-mix(in srgb,var(--c-primary) 12%,transparent);color:var(--c-primary);border:1px solid color-mix(in srgb,var(--c-primary) 30%,transparent)">
          ❄️ Créé depuis visite à froid
        </div>` : ''}
        <div class="statut-fy27">${c.STATUT_COMPTE || '—'} · Priorité ${c.Priorite || '—'}</div>
      </div>`;
  },

  render() {
    const app = document.getElementById('app');
    if (this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Chargement de la fiche…</div>';
      return;
    }
    const c   = this.state.compte;
    const v17 = this.state.v17;
    const fy25 = window.parseCA(v17?.['CA FY25 €'] ?? c.CA_FY25) ?? 0;
    const fy26 = window.parseCA(v17?.['CA FY26 €'] ?? c.CA_FY26) ?? 0;
    const fy27 = window.parseCA(v17?.['CA Q1FY27 €'] ?? c.CA_Q1FY27) ?? 0;
    const maxCA = Math.max(fy25, fy26, fy27, 1);

    const _lastActivity = (() => {
      const dates = [
        ...this.state.visites.map(v => v.Date),
        ...this.state.appels.map(a => a.Date),
      ].filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
      if (!dates.length) return null;
      return new Date(Math.max(...dates));
    })();
    const _semainesSilence = _lastActivity
      ? Math.floor((Date.now() - _lastActivity.getTime()) / (7 * 24 * 3600 * 1000))
      : null;
    const semainesSilenceLabel = _semainesSilence !== null ? `${_semainesSilence} sem.` : '—';

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="history.back()" class="btn-retour">←</button>
        <h1 class="header-titre-tronque">${c.Nom_Compte}</h1>
      </header>

      <div class="fiche-body">

        ${this._renderBlocIdentite(c)}

        <!-- CA HISTORIQUE -->
        <div class="bloc-fiche">
          <div class="bloc-titre">CA Historique</div>
          ${!v17 ? '<div class="pas-de-v17">⚠️ Pas de correspondance V17 — données MDB</div>' : ''}
          <div class="graphique-ca">
            ${this._barreCA('FY25', fy25, maxCA)}
            ${this._barreCA('FY26', fy26, maxCA)}
            ${this._barreCA('Q1·27', fy27, maxCA)}
          </div>
          ${v17 ? `
          <div class="grille-identite" style="margin-top:12px">
            <div class="id-ligne"><span>Évolution FY26 vs FY25</span><strong>${(() => { const ev = window.parseCA(v17['EVOL_FY26_VS_FY25_%']); return ev !== null ? ev + ' %' : (v17['EVOL_FY26_VS_FY25_%'] ? String(v17['EVOL_FY26_VS_FY25_%']) : '—'); })()}</strong></div>
            <div class="id-ligne"><span>Potentiel upsell</span><strong>${v17.POTENTIEL_UPSELL || '—'}</strong></div>
            <div class="id-ligne"><span>Score potentiel</span><strong>${v17.SCORE_POTENTIEL != null && v17.SCORE_POTENTIEL !== '' ? String(v17.SCORE_POTENTIEL) + '/100' : '—'}</strong></div>
          </div>` : ''}
        </div>

        <!-- PROCHAINE ACTION -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Prochaine action</div>
          ${c.Prochaine_action ? `
            <div class="prochaine-action-detail">
              <div class="pa-type">${c.Prochaine_action}</div>
              <div class="pa-date ${estDepassee(c.Date_prochaine_action) ? 'date-depassee' : ''}">
                📅 ${dateRelative(c.Date_prochaine_action)}
              </div>
              ${c.Note_initiale ? `<div class="pa-note">📝 ${c.Note_initiale}</div>` : ''}
            </div>` : '<div class="pas-de-donnees">Aucune action planifiée</div>'}
        </div>

        <!-- VISITES -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Visites (${this.state.visites.length})</div>
          ${this.state.visites.length === 0 ? '<div class="vide-liste">Aucune visite enregistrée</div>'
            : this.state.visites.slice(0, 5).map(v => `
            <div class="carte-visite">
              <div class="visite-date">${v.Date || '—'} · ${v.Heure || ''} · ${window.resolveCDS(v.PIN_CDS || v.Nom_CDS)}</div>
              <div class="visite-resultat">${v.Resultat_Visite || v.Type_Visite || '—'}</div>
              <div class="visite-score">Réceptivité ${v.Slider_Receptivite != null && v.Slider_Receptivite !== '' ? v.Slider_Receptivite : '—'}/5${v.Prochaine_Action_Texte ? ` · → ${v.Prochaine_Action_Texte}` : ''}</div>
            </div>`).join('')}
        </div>

        <!-- APPELS -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Appels (${this.state.appels.length})</div>
          ${this.state.appels.length === 0 ? '<div class="vide-liste">Aucun appel enregistré</div>'
            : this.state.appels.slice(0, 5).map(a => `
            <div class="carte-appel">
              <div class="appel-date">${a.Date || '—'} · ${window.resolveCDS(a.PIN_CDS || a.Nom_CDS)}</div>
              <div class="appel-resultat">${a.Statut_Appel || '—'} · Intérêt EMPOWER : ${a.Interet_EMPOWER || '—'}</div>
              <div class="appel-frein">${a.Frein_Principal ? `Frein : ${a.Frein_Principal}` : ''}${a.Prochaine_Action ? ` · → ${a.Prochaine_Action}` : ''}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- ACTIONS -->
      <div class="barre-actions-fixe">
        <button class="btn-action btn-visite" onclick="Router.aller('#/questionnaire/${c.ID_Compte}')">📋 Visite</button>
        <button class="btn-action btn-appel" onclick="Router.aller('#/phoning/${c.ID_Compte}')">📞 Appeler</button>
        <button class="btn-action" style="background:var(--c-text-2);color:#fff" onclick="VueFicheCompte.ouvrirRapportPhoning()">📊 Rapport</button>
        <button class="btn-action btn-planning" onclick="VueVisites.state.formPlanif=VueVisites.state.formPlanif||{};VueVisites.ouvrirModal();Router.aller('#/visites')">🗓️ Planifier</button>
      </div>

      ${this.state.modalRapportPhoning ? this._renderModalRapportPhoning() : ''}
    `;
  },
};
