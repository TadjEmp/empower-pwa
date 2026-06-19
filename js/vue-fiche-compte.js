// ═══════════════════════════════════════
//  vue-fiche-compte.js — Fiche détaillée compte
//  Sources : 🏢_COMPTES + V17 (jointure nom normalisé)
//            🗺️_VISITES + 📞_PHONING (historique)
// ═══════════════════════════════════════

window.VueFicheCompte = {

  state: { compte: null, v17: null, visites: [], appels: [], chargement: true },

  async init(idCompte) {
    this.state.chargement = true;
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

  _barreCA(label, val, max) {
    // val est déjà un nombre parsé (parseCA) ou 0 — fmtCA protège l'affichage
    const pct = max > 0 ? Math.max(2, Math.round(val / max * 100)) : 2;
    return `
      <div class="barre-ligne">
        <div class="barre-label">${label}</div>
        <div class="barre-ca" style="width:${pct}%;background:var(--c-primary)"></div>
        <div class="barre-valeur">${window.fmtCA(val)}</div>
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
    // parseCA protège contre les valeurs aberrantes (dates corrompues, NaN, undefined)
    const fy25 = window.parseCA(v17?.['CA FY25 €'] ?? c.CA_FY25) ?? 0;
    const fy26 = window.parseCA(v17?.['CA FY26 €'] ?? c.CA_FY26) ?? 0;
    const fy27 = window.parseCA(v17?.['CA Q1FY27 €'] ?? c.CA_Q1FY27) ?? 0;
    const maxCA = Math.max(fy25, fy26, fy27, 1);

    // Semaines silence : calculé depuis la dernière activité (dernier appel ou visite)
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
    const semainesSilenceLabel = _semainesSilence !== null
      ? `${_semainesSilence} sem.`
      : '—';

    // Dernier Q : dernier CA trimestriel disponible (v17 ou MDB)
    const dernierQ = window.parseCA(v17?.['CA Q1FY27 €'] ?? c.CA_Q1FY27);
    const dernierQLabel = dernierQ !== null ? window.fmtCA(dernierQ) : '—';

    // POTENTIAL (colonne POTENTIEL de MDB ou POTENTIEL_UPSELL de V17)
    const potentialVal = c.POTENTIEL || v17?.POTENTIEL_UPSELL || null;
    const potentialLabel = potentialVal ? String(potentialVal) : '—';

    app.innerHTML = `
      <header class="header-vue">
        <button onclick="history.back()" class="btn-retour">←</button>
        <h1 class="header-titre-tronque">${c.Nom_Compte}</h1>
      </header>

      <div class="fiche-body">

        <!-- IDENTITÉ -->
        <div class="bloc-fiche">
          <div class="bloc-titre">Identité</div>
          <div class="grille-identite">
            <div class="id-ligne"><span>Ville</span><strong>${c.Ville || '—'}${c.Code_Postal ? ' (' + c.Code_Postal + ')' : ''}</strong></div>
            ${(c.Departement || c.Code_Postal) ? '<div class="id-ligne"><span>Département</span><strong>' + (c.Departement || (c.Code_Postal ? String(c.Code_Postal).slice(0,2) : '—')) + '</strong></div>' : ''}
            <div class="id-ligne"><span>Canal / Secteur</span><strong>${c.CANAL || '—'} · ${c.SECTEUR || '—'}</strong></div>
            <div class="id-ligne"><span>Téléphone</span><strong>${c.Tel ? `<a class="lien-tel" href="tel:${c.Tel.replace(/\s/g,'')}">${c.Tel}</a>` : '—'}</strong></div>
            <div class="id-ligne"><span>Email</span><strong>${c.Email ? `<a class="lien-email" href="mailto:${c.Email}">${c.Email}</a>` : '—'}</strong></div>
            <div class="id-ligne"><span>CDS</span><strong>${window.resolveCDS(c.PIN_CDS_Assigne || c.Nom_CDS)}</strong></div>
            <div class="id-ligne"><span>EMPOWER</span><strong>${c.HAS_EMPOWER || '—'}</strong></div>
            <div class="id-ligne"><span>CA FY26</span><strong>${window.fmtCA(v17?.['CA FY26 €'] ?? c.CA_FY26)} €</strong></div>
            <div class="id-ligne"><span>Dernier Q (Q1·27)</span><strong>${dernierQLabel} €</strong></div>
            <div class="id-ligne"><span>Silence</span><strong>${semainesSilenceLabel}</strong></div>
            <div class="id-ligne"><span>Potentiel</span><strong>${potentialLabel}</strong></div>
            ${v17?.GROSSISTE_PRINCIPAL ? `<div class="id-ligne"><span>Grossiste</span><strong>${v17.GROSSISTE_PRINCIPAL}</strong></div>` : ''}
          </div>
          <div class="statut-fy27">${c.STATUT_COMPTE || '—'} · Priorité ${c.Priorite || '—'}</div>
        </div>

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
        <button class="btn-action btn-planning" onclick="VueVisites.state.formPlanif=VueVisites.state.formPlanif||{};VueVisites.ouvrirModal();Router.aller('#/visites')">🗓️ Planifier</button>
      </div>
    `;
  },
};
