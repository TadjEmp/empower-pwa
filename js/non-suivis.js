// ═══════════════════════════════════════
//  non-suivis.js — Lots 3 + 4 (10/2026) : comptes non suivis, reprise et réattribution.
//
//  Source unique de la définition « non suivi » : la vue SQL v_comptes_suivi (seuils dans
//  ⚙️_PARAMS : SEUIL_NON_SUIVI_VISITE_J / SEUIL_NON_SUIVI_APPEL_J). Un compte est non suivi si :
//    • sans propriétaire, OU
//    • le SELL IN le déclare NON SUIVI (tant que l'attribution n'est pas plus récente que l'import), OU
//    • aucune visite réalisée > 90 j ET aucun appel réel > 60 j ET rien de prévu.
//  Reprise IMMÉDIATE par un CDS (aucun plafond, aucun délai de grâce) ; réattribution d'un compte suivi =
//  manager uniquement. Tout passe par la fonction SQL reattribuer_compte() : atomique, historisée,
//  notifiée, et qui recalcule le CA par commercial (le CA AVANT la réattribution reste à l'ancien).
// ═══════════════════════════════════════
window.NonSuivis = {
  _etat: new Map(),   // _uuid du compte → ligne de v_comptes_suivi
  LIBELLES: {
    SANS_PROPRIETAIRE: 'Sans propriétaire',
    SELLIN_NON_SUIVI:  'SELL IN : non suivi',
    INACTIVITE:        'Aucune activité récente (ni visite, ni appel, rien de prévu)',
  },
  ERREURS: {
    COMPTE_SUIVI:     'Ce compte est déjà suivi (un collègue vient peut-être de le reprendre).',
    CONFLIT:          'Ce compte vient d\'être modifié par quelqu\'un d\'autre. Rechargez la liste.',
    ROLE_NON_AUTORISE:'Action non autorisée pour votre rôle.',
    HORS_LIGNE:       'Connexion requise pour reprendre ou réattribuer un compte.',
    SESSION_INVALIDE: 'Session invalide : reconnectez-vous.',
    SESSION_EXPIREE:  'Session expirée : reconnectez-vous.',
    CDS_INCONNU:      'Commercial inconnu ou inactif.',
  },

  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async charger() {
    const rows = await SheetsAPI.lire('EMPOWER_MDB', 'V_COMPTES_SUIVI', { nocache: true }).catch(() => []);
    this._etat = new Map((rows || []).map(r => [String(r._uuid), r]));
    this.peindreAlerte();
    return this._etat;
  },

  etat(c) { return this._etat.get(String(c && c._uuid)) || null; },
  estNonSuivi(c) { const e = this.etat(c); return !!(e && (e.Non_Suivi === true || String(e.Non_Suivi) === 'true')); },
  raisons(c) { const e = this.etat(c); return e && Array.isArray(e.Raisons) ? e.Raisons : []; },
  libelleRaisons(c) { return this.raisons(c).map(r => this.LIBELLES[r] || r).join(' · '); },
  nb() { let n = 0; this._etat.forEach(e => { if (e.Non_Suivi === true || String(e.Non_Suivi) === 'true') n++; }); return n; },

  // Un CDS (ou l'admin agissant en CDS) peut reprendre un compte non suivi qui n'est pas déjà le sien.
  peutReprendre(c) {
    return (Session.estCDS() || Session.estManager()) && Number(c.PIN_CDS_Assigne) !== Session.pin && this.estNonSuivi(c);
  },

  // Comptes à reprendre, les « bons » d'abord : CA FY27 puis CA FY26 décroissants.
  aReprendre(comptes) {
    const ca = c => (window.caFY27Complet ? Number(window.caFY27Complet(c)) || 0 : 0);
    const fy26 = c => (window.parseCA ? Number(window.parseCA(c.CA_FY26)) || 0 : 0);
    return (comptes || []).filter(c => this.estNonSuivi(c)).sort((a, b) => (ca(b) - ca(a)) || (fy26(b) - fy26(a)));
  },

  badge(c) {
    if (!this.estNonSuivi(c)) return '';
    return `<span class="badge-nonsuivi" title="${this.esc(this.libelleRaisons(c))}">À reprendre</span>`;
  },

  htmlAlerte() {
    const n = this.nb();
    return n ? `<div class="alerte-ligne no-print" onclick="VueComptes.state.filtreStatut='A_REPRENDRE';Router.aller('#/comptes')">🤝 <strong>${n}</strong> compte(s) non suivi(s) à reprendre</div>` : '';
  },
  peindreAlerte() { const el = document.getElementById('ns-alerte'); if (el) el.innerHTML = this.htmlAlerte(); },

  // ── Reprise (CDS) ──
  reprendre(c, apres) {
    if (!this.peutReprendre(c)) { Toast.afficher('Ce compte n\'est pas repreneable (déjà suivi ?)', 'warning'); return; }
    const ancien = c.Nom_CDS ? ` Il est actuellement attribué à ${this.esc(c.Nom_CDS)}.` : '';
    ConfirmModal.demander({
      titre: `Reprendre « ${c.Nom_Compte} » ?`,
      detail: `${this.libelleRaisons(c)}.${ancien} Le CA déjà réalisé reste à l'ancien commercial ; vous comptez à partir de la semaine fiscale suivante. Pensez à mettre à jour la colonne COMMERCIAL du fichier SELL IN.`,
      labelConfirmer: 'Je reprends ce compte',
      onConfirm: () => this._executer(c, Session.pin, 'REPRISE', apres),
    });
  },

  // ── Réattribution (manager) : accepte aussi pin = null (désattribuer) ──
  async reattribuer(c, pin, apres) {
    return this._executer(c, pin, 'MANAGER', apres);
  },

  async _executer(c, nouveauPin, mode, apres) {
    try {
      const r = await SheetsAPI.reattribuerCompte(c._uuid, c.PIN_CDS_Assigne ? Number(c.PIN_CDS_Assigne) : null, nouveauPin, mode);
      if (!r || !r.ok) {
        Toast.afficher('❌ ' + (this.ERREURS[r && r.erreur] || (r && r.erreur) || 'Échec'), 'erreur', 6000);
        await this.charger();
        if (apres) apres(false);
        return false;
      }
      if (r.inchange) { Toast.afficher('Aucun changement', 'info'); return true; }
      Toast.afficher(mode === 'REPRISE' ? `✅ Vous avez repris « ${c.Nom_Compte} »` : `✅ Compte attribué à ${r.nouveau || 'personne'}`, 'succes');
      await this.charger();
      if (apres) apres(true);
      return true;
    } catch (e) {
      Toast.afficher('❌ ' + (e.message || e), 'erreur');
      return false;
    }
  },

  // Historique des attributions d'un compte (plus récent d'abord).
  async historique(compteUuid) {
    const rows = await SheetsAPI.lire('EMPOWER_MDB', 'ATTRIBUTIONS_HISTORIQUE', { nocache: true }).catch(() => []);
    return (rows || []).filter(h => String(h.Compte_ID) === String(compteUuid))
      .sort((a, b) => String(b.Cree_Le || '').localeCompare(String(a.Cree_Le || '')));
  },

  blocFiche(c, historique) {
    const E = s => this.esc(s);
    const nonSuivi = this.estNonSuivi(c);
    const lignes = (historique || []).map(h => `
      <tr><td>${E(String(h.Date_Effet || '').slice(0, 10))}</td>
          <td>${E(h.Ancien_Nom || 'sans propriétaire')} → <strong>${E(h.Nouveau_Nom || 'sans propriétaire')}</strong></td>
          <td style="color:var(--c-text-2)">${h.Mode === 'REPRISE' ? 'reprise' : 'manager'}</td></tr>`).join('');
    return `
      <div class="bloc-fiche">
        <div class="bloc-titre">🤝 Suivi & attribution</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px">
          ${nonSuivi ? `<span class="badge-nonsuivi">À reprendre</span><span style="color:var(--c-text-2)">${E(this.libelleRaisons(c))}</span>`
                     : '<span style="color:var(--c-success);font-weight:600">✓ Compte suivi</span>'}
          <span style="margin-left:auto">Propriétaire : <strong>${E(c.Nom_CDS || 'aucun')}</strong></span>
        </div>
        ${this.peutReprendre(c) ? `<button class="btn-primaire" style="margin-top:10px;width:auto;padding:10px 16px" onclick="VueFicheCompte.reprendre()">🤝 Je reprends ce compte</button>` : ''}
        ${lignes ? `<table style="width:100%;font-size:12px;margin-top:10px;border-collapse:collapse"><tbody>${lignes}</tbody></table>
          <p style="font-size:11px;color:var(--c-text-2);margin:6px 0 0">Le CA réalisé avant un changement reste au commercial précédent ; le nouveau compte à partir de la semaine fiscale suivante.</p>` : ''}
      </div>`;
  },
};
