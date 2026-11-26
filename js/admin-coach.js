// ═══════════════════════════════════════════════════════════════════════
//  admin-coach.js — Réglages › Assistant : recherche de comptes par le profil Externe
//  Le Coach peut chercher dans toute la base des comptes pour l'Externe (il fournit les leads et contacte la base).
//  L'administrateur active ou coupe cette recherche et choisit les champs visibles. Jamais de CA ni de notes internes.
//  Le réglage est enregistré (COACH_EXTERNE_COMPTES) par la fonction admin-users et lu côté serveur par coach-chat.
// ═══════════════════════════════════════════════════════════════════════
window.AdminCoach = (function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHAMPS = [
    ['ville', 'Ville'], ['code_postal', 'Code postal'], ['departement', 'Département'], ['canal', 'Canal'], ['secteur', 'Secteur'],
    ['has_empower', 'Empower oui / non'], ['statut_compte', 'Statut du compte'], ['nom_cds', 'Commercial rattaché'],
    ['contact_nom', 'Nom du contact'], ['contact_fonction', 'Fonction du contact'], ['tel', 'Téléphone'], ['email', 'E-mail'], ['adresse', 'Adresse'],
  ];
  const DEFAUT = { actif: true, champs: ['ville', 'code_postal', 'departement', 'canal', 'secteur', 'has_empower', 'statut_compte', 'nom_cds', 'contact_nom', 'contact_fonction', 'tel', 'email', 'adresse'] };
  const S = { charge: false, chargement: false, actif: DEFAUT.actif, champs: [...DEFAUT.champs], message: '' };
  const peutEditer = () => typeof Session !== 'undefined' && Session.role === 'ADMIN';
  const rendre = () => { if (typeof VueAdmin !== 'undefined') VueAdmin.render(); };

  async function charger() {
    if (S.chargement) return; S.chargement = true;
    try {
      const ps = await SheetsAPI.lire('EMPOWER_MDB', 'PARAMS');
      const l = (ps || []).find(p => (p.Parametre || p.parametre) === 'COACH_EXTERNE_COMPTES');
      if (l) { let v = null; try { v = JSON.parse(l.Valeur != null ? l.Valeur : l.valeur); } catch { /* valeur par défaut */ } if (v && typeof v.actif === 'boolean' && Array.isArray(v.champs)) { S.actif = v.actif; S.champs = v.champs.filter(c => CHAMPS.some(x => x[0] === c)); } }
      S.charge = true;
    } catch (e) { S.message = 'Chargement impossible : ' + (e.message || e); }
    S.chargement = false; rendre();
  }

  async function enregistrer(actif, champs) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ action: 'setParam', token: SheetsAPI.TOKEN, cle: 'COACH_EXTERNE_COMPTES', valeur: JSON.stringify({ actif, champs: ['id', 'nom_compte', ...champs] }) }),
      });
      const d = await r.json(); if (!d.ok) throw new Error(d.erreur || 'Échec');
      S.actif = actif; S.champs = champs; S.message = '';
      try { await SheetsAPI.viderCache('EMPOWER_MDB', 'PARAMS'); } catch { /* sans effet */ }
      if (typeof Toast !== 'undefined') Toast.afficher('Réglage enregistré', 'succes');
    } catch (e) { if (typeof Toast !== 'undefined') Toast.afficher('Erreur : ' + e.message, 'erreur'); }
    rendre();
  }
  const basculer = coche => enregistrer(!!coche, S.champs);
  const champ = (k, coche) => enregistrer(S.actif, coche ? [...new Set([...S.champs, k])] : S.champs.filter(c => c !== k));

  function html() {
    if (!S.charge) { if (!S.chargement) charger(); return ''; }
    const ed = peutEditer(), dis = ed ? '' : ' disabled';
    return `<div class="bloc-fiche" id="admin-coach-externe">
      <div class="bloc-titre">Assistant : recherche de comptes pour l'Externe</div>
      <p style="font-size:13px;margin:0 0 10px">Le Coach peut retrouver n'importe quel compte de la base pour le profil Externe (il fournit les leads et contacte la base). Le nom du compte est toujours visible ; le chiffre d'affaires et les notes internes ne le sont jamais.</p>
      ${S.message ? `<p style="font-size:13px;color:var(--c-danger,#c0392b)">${esc(S.message)}</p>` : ''}
      <label style="display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:10px"><input type="checkbox" ${S.actif ? 'checked' : ''}${dis} onchange="AdminCoach.basculer(this.checked)"/> Recherche de comptes activée pour l'Externe</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px 16px;${S.actif ? '' : 'opacity:.5'}">
        ${CHAMPS.map(([k, l]) => `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" ${S.champs.includes(k) ? 'checked' : ''}${dis}${S.actif ? '' : ' disabled'} onchange="AdminCoach.champ('${k}',this.checked)"/> ${esc(l)}</label>`).join('')}
      </div>
      ${ed ? '' : '<p style="font-size:12px;margin:10px 0 0">Modification réservée à l\'administrateur.</p>'}
    </div>`;
  }
  return { html, charger, basculer, champ, state: S };
})();
