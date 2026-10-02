// ═══════════════════════════════════════
//  vue-a-contacter.js — Lot 5 (10/2026) : axe « 📞 À contacter » (liste de travail).
//  Aucun impact sur les primes. Source unique : vue SQL v_a_contacter.
//    P1 — compte ONBOARDÉ (lead Tracker « INTEGRE ») sans commande depuis son intégration
//         (après un délai de A_CONTACTER_DELAI_ONBOARDING_J jours).
//    P2 — compte NON EMPOWER ayant commandé dans les A_CONTACTER_SEMAINES dernières semaines SELL IN.
//  Un compte sort de l'axe dès qu'un appel réel / une visite réalisée / un mailing a eu lieu dans les
//  A_CONTACTER_CONTACT_J derniers jours, ou s'il est « reporté ». Rappel : une notification récap par
//  commercial après chaque import SELL IN par semaine (côté base, cf. notifier_a_contacter()).
// ═══════════════════════════════════════
window.AContacter = {
  _rows: [],
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  async charger() {
    this._rows = (await SheetsAPI.lire('EMPOWER_MDB', 'V_A_CONTACTER', { nocache: true }).catch(() => [])) || [];
    this.peindre();
    return this._rows;
  },

  // Périmètre de l'utilisateur : un CDS voit ses comptes ; managers/channel voient tout (y compris sans propriétaire).
  visibles() {
    return this._rows.filter(r => Session.voitTout() || Number(r.PIN_CDS_Assigne) === Session.pin);
  },
  nb() { return this.visibles().length; },
  etat(c) { return this._rows.find(r => String(r._uuid) === String(c && c._uuid)) || null; },
  badge(c) {
    const e = this.etat(c);
    return e ? `<span class="badge-acontacter" title="${e.Axe === 'P1' ? 'Onboardé sans commande' : 'A commandé, pas encore EMPOWER'}">📞 À contacter</span>` : '';
  },

  // Compteur dans la barre latérale desktop ET le volet mobile (re-rendu : NavBar relit nb()).
  peindre() {
    if (window.updateNavBadge) updateNavBadge('a_contacter', this.nb());
    if (window.DrawerMenu) DrawerMenu.renderToRoot();
  },

  async reporter(compteUuid, jours = 7) {
    if (!SheetsAPI._online) { Toast.afficher('Connexion requise', 'warning'); return false; }
    const token = (Session && Session.token) || SheetsAPI.TOKEN || null;
    const { data, error } = await SheetsAPI._sb.rpc('reporter_a_contacter', { p_compte: compteUuid, p_jours: jours, p_token: token });
    if (error || !data || !data.ok) {
      const msg = { NON_AUTORISE: 'Seul le propriétaire ou un manager peut reporter ce compte.', SESSION_INVALIDE: 'Session invalide : reconnectez-vous.', SESSION_EXPIREE: 'Session expirée : reconnectez-vous.' }[data && data.erreur] || (error && error.message) || (data && data.erreur) || 'Échec';
      Toast.afficher('❌ ' + msg, 'erreur'); return false;
    }
    Toast.afficher(`🕒 Reporté de ${jours} jours`, 'succes');
    return true;
  },
};

window.VueAContacter = {
  state: null,

  _etatInitial() { return { chargement: true, erreur: null, axe: 'TOUS', cds: 'TOUS' }; },

  async init() {
    this.state = this._etatInitial();
    this.render();
    try {
      await AContacter.charger();
      this.state.chargement = false;
    } catch (e) { this.state.chargement = false; this.state.erreur = e.message || String(e); }
    this.render();
  },

  _fmt(d) { const s = String(d || '').slice(0, 10); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'; },
  _eur(n) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'; },

  get liste() {
    const s = this.state;
    let l = AContacter.visibles();
    if (s.axe !== 'TOUS') l = l.filter(r => r.Axe === s.axe);
    if (Session.voitTout() && s.cds !== 'TOUS') l = l.filter(r => (s.cds === 'AUCUN' ? !r.PIN_CDS_Assigne : String(r.PIN_CDS_Assigne) === s.cds));
    return l.sort((a, b) => (a.Priorite - b.Priorite) ||
      (a.Axe === 'P2' ? (Number(b.CA_Recent) || 0) - (Number(a.CA_Recent) || 0) : (Number(b.Jours) || 0) - (Number(a.Jours) || 0)));
  },

  setAxe(a) { this.state.axe = a; this.render(); },
  setCDS(v) { this.state.cds = v; this.render(); },

  async reporter(uuid) {
    if (await AContacter.reporter(uuid, 7)) { await AContacter.charger(); this.render(); }
  },

  _carte(r) {
    const E = AContacter.esc;
    const p1 = r.Axe === 'P1';
    const ligne = p1
      ? `Onboardé ${r.Date_Ref ? 'le ' + this._fmt(r.Date_Ref) : '<span style="color:var(--c-warning)">(date d\'intégration manquante)</span>'} · aucune commande ${r.Jours != null ? 'depuis ' + r.Jours + ' j' : 'depuis l\'intégration'}`
      : `Dernière commande : semaine du ${this._fmt(r.Date_Ref)} · ${this._eur(r.CA_Recent)} sur la période · pas encore EMPOWER`;
    const sansProprio = !r.PIN_CDS_Assigne;
    return `
      <div class="carte-compte-v2">
        <div class="cc-pills">
          <span class="${p1 ? 'badge-rouge' : 'badge-orange'} badge-priorite">${p1 ? 'P1 · Onboardé sans commande' : 'P2 · Commande, non EMPOWER'}</span>
          ${r.Statut_Tracker ? `<span class="v7-statut" style="font-size:11px;color:var(--c-text-2)">déjà au Tracker (${E(r.Statut_Tracker)})</span>` : ''}
          ${Session.voitTout() ? `<span style="margin-left:auto;font-size:12px;font-weight:600">${sansProprio ? '<span style="color:var(--c-warning)">Sans propriétaire</span>' : E(r.Nom_CDS)}</span>` : ''}
        </div>
        <div class="cc-nom" onclick="Router.aller('#/compte/${E(r.ID_Compte)}')">${E(r.Nom_Compte)}${r.Ville ? ` <span style="font-weight:400;color:var(--c-text-2)">· ${E(r.Ville)}</span>` : ''}</div>
        <div class="cc-infos"><span>${ligne}</span></div>
        <div class="cc-actions" style="gap:6px;flex-wrap:wrap">
          ${sansProprio
            ? `<button class="btn-visiter" onclick="VueComptes.state.filtreStatut='A_REPRENDRE';Router.aller('#/comptes')">🤝 Voir « À reprendre »</button>`
            : `<button class="btn-visiter" onclick="VueQuestionnaire._visitePlanifiee=null;Router.aller('#/questionnaire/${E(r.ID_Compte)}')">Visiter</button>
               <button class="btn-tel-outline" onclick="Router.aller('#/phoning/${E(r.ID_Compte)}')" title="Appeler">📞 Appeler</button>`}
          <button class="btn-secondaire" style="width:auto;padding:6px 12px;font-size:12px" onclick="VueAContacter.reporter('${E(r._uuid)}')" title="Masquer ce compte 7 jours">🕒 Reporter 7 j</button>
        </div>
      </div>`;
  },

  _corps() {
    const s = this.state, tout = AContacter.visibles();
    if (s.erreur) return `<div class="erreur">Erreur : ${AContacter.esc(s.erreur)}</div>`;
    const n = a => tout.filter(r => r.Axe === a).length;
    const chip = (k, lbl) => `<button class="btn-filtre ${s.axe === k ? 'actif' : ''}" onclick="VueAContacter.setAxe('${k}')">${lbl}</button>`;
    let selCds = '';
    if (Session.voitTout()) {
      const noms = [...new Map(tout.filter(r => r.PIN_CDS_Assigne).map(r => [String(r.PIN_CDS_Assigne), r.Nom_CDS])).entries()];
      selCds = `<select onchange="VueAContacter.setCDS(this.value)" style="border:1px solid var(--c-border);border-radius:6px;padding:6px 8px;font-size:12px">
        <option value="TOUS">Tous les commerciaux</option><option value="AUCUN" ${s.cds === 'AUCUN' ? 'selected' : ''}>Sans propriétaire</option>
        ${noms.map(([pin, nom]) => `<option value="${AContacter.esc(pin)}" ${s.cds === pin ? 'selected' : ''}>${AContacter.esc(nom)}</option>`).join('')}</select>`;
    }
    const l = this.liste;
    return `
      <div class="filtres-flags" style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${chip('TOUS', `Tous (${tout.length})`)}${chip('P1', `P1 · Onboardés sans commande (${n('P1')})`)}${chip('P2', `P2 · Ont commandé, non EMPOWER (${n('P2')})`)}${selCds}
      </div>
      <p style="font-size:12px;color:var(--c-text-2);margin:0 0 10px">Un compte sort de cette liste dès qu'un appel, une visite ou un mailing est enregistré (30 derniers jours), ou si vous le reportez.</p>
      ${l.length ? l.map(r => this._carte(r)).join('') : `<div style="padding:32px;text-align:center;color:var(--c-text-2)">Rien à contacter pour l'instant 🎉</div>`}`;
  },

  render() {
    const s = this.state; if (!s) return;
    document.getElementById('app').innerHTML = `
      <header class="header-vue">
        <button onclick="Router.retour()" class="btn-retour">←</button>
        <h1>📞 À contacter</h1>
      </header>
      <div class="q-contenu avec-nav q-contenu-large">
        ${s.chargement ? '<div style="padding:32px;text-align:center;color:var(--c-text-2)">Chargement…</div>' : this._corps()}
      </div>
      ${NavBar('a_contacter')}`;
  },
};
