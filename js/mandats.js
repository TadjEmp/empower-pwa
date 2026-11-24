// ═══════════════════════════════════════
//  mandats.js — Contrats de mandat : ouverture du générateur depuis la fiche, archivage, suivi du statut
//  Le générateur (mandat/generateur.html) est une page autonome au design validé (sans traits).
//  Elle est préremplie par la fiche compte (clé locale à usage unique, jamais dans l'URL) et archive le mandat
//  dans la table `mandats` via window.opener.Mandats.archiver (même origine).
//  Qui peut générer : ADMIN, CDS, CHANNEL_MANAGER. EXTERNE n'y a pas accès.
// ═══════════════════════════════════════
window.Mandats = (function () {
  const STATUTS = { genere: 'Généré', envoye: 'Envoyé', signe: 'Signé', annule: 'Annulé' };
  const OFFRES = { '1+1': 'Offre 1+1 à palier', '2+1': 'Offre 2+1 à palier', remise: 'Remise dégressive sur prix d’achat' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peut = () => !!(window.Session && Session.estConnecte && Session.estConnecte() && ['ADMIN', 'CDS', 'CHANNEL_MANAGER'].includes(Session.role));
  const sb = () => (window.SheetsAPI && SheetsAPI._sb) || null;

  // Ouvre le générateur, préremplit depuis la fiche (aucune donnée dans l'URL).
  function ouvrir(compte) {
    if (!peut()) { if (window.Toast) Toast.afficher('Réservé aux commerciaux et managers', 'erreur'); return false; }
    const c = compte || {};
    const adr = [c.Adresse, [c.Code_Postal, c.Ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    try {
      localStorage.setItem('esi_mandat_prefill', JSON.stringify({ t: Date.now(), compte_id: c.ID_Compte || '', soc: c.Nom_Compte || '', rep: c.Contact_Nom || '', adr, rcsv: c.Ville || '' }));
    } catch (e) { /* stockage indisponible : le générateur s'ouvre vide */ }
    // Dans la visionneuse de l'application (même origine) : « Fermer » toujours visible, archivage via window.parent.Mandats.
    return window.Visionneuse ? Visionneuse.page('/mandat/generateur.html', { titre: 'Mandat' }) : false;
  }

  // Appelée par le générateur (window.opener.Mandats.archiver). Les valeurs sont validées avant l'écriture.
  async function archiver(rec) {
    if (!peut()) return { ok: false, message: 'droits insuffisants' };
    const c = sb(); if (!c) return { ok: false, message: 'base indisponible' };
    const r = rec || {};
    const ligne = {
      compte_id: r.compte_id ? String(r.compte_id).slice(0, 80) : null,
      societe: String(r.societe || '').trim().slice(0, 200),
      pin_cds: Number(Session.pin) || null,
      canal: r.canal === 'grossiste' ? 'grossiste' : 'empower',
      offre: ['1+1', '2+1', 'remise'].includes(r.offre) ? r.offre : '1+1',
      compensation: ['virement', 'licences', 'cheques'].includes(r.compensation) ? r.compensation : 'virement',
      montant_ht: Math.max(0, Number(r.montant_ht) || 0),
      debut: /^\d{4}-\d{2}-\d{2}$/.test(r.debut || '') ? r.debut : null,
      fin: /^\d{4}-\d{2}-\d{2}$/.test(r.fin || '') ? r.fin : null,
      ref_commande: r.ref_commande ? String(r.ref_commande).slice(0, 80) : null,
      representant: r.representant ? String(r.representant).slice(0, 200) : null,
      payload: r.payload && typeof r.payload === 'object' ? r.payload : {},
    };
    if (!ligne.societe) return { ok: false, message: 'société manquante' };
    try {
      const { error } = await c.from('mandats').insert(ligne);
      if (error) return { ok: false, message: error.message || 'refusé par la base' };
      await tracer('Mandat généré : ' + ligne.societe + ' (' + ligne.offre + ', ' + ligne.montant_ht.toFixed(2) + ' € HT)', ligne.societe);
      return { ok: true };
    } catch (e) { return { ok: false, message: (e && e.message) || 'erreur réseau' }; }
  }

  async function tracer(resume, nomCompte) {
    try {
      await SheetsAPI.ecrire('EMPOWER_MDB', 'ACTIONS', {
        ID_Action: genId('MAND'), Date_Action: new Date().toISOString(), Type_Action: 'MANDAT', Source: 'ESI', PIN_CDS: Session.pin,
        Nom_Compte: nomCompte || '', Statut_Avant: '', Statut_Apres: '', Resum_IA: resume, GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });
    } catch { /* trace non bloquante */ }
  }

  async function liste(compteId) {
    const c = sb(); if (!c || !compteId) return { ok: false, lignes: [] };
    try {
      const { data, error } = await c.from('mandats').select('id,societe,offre,compensation,montant_ht,debut,fin,statut,created_at').eq('compte_id', String(compteId)).order('created_at', { ascending: false }).limit(20);
      if (error) return { ok: false, lignes: [] };
      return { ok: true, lignes: data || [] };
    } catch { return { ok: false, lignes: [] }; }
  }

  async function changerStatut(id, statut) {
    const c = sb(); if (!c || !STATUTS[statut]) return false;
    try { const { error } = await c.from('mandats').update({ statut, updated_at: new Date().toISOString() }).eq('id', id); return !error; } catch { return false; }
  }

  const jj = d => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : 'n.c.'; };
  function ligneHtml(m) {
    const opts = Object.keys(STATUTS).map(k => `<option value="${k}" ${m.statut === k ? 'selected' : ''}>${STATUTS[k]}</option>`).join('');
    return `<div class="mandat-ligne"><div><b>${esc(OFFRES[m.offre] || m.offre)}</b><br><span class="mandat-mut">${jj(m.debut)} au ${jj(m.fin)} · ${(Number(m.montant_ht) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT</span></div>
      <select aria-label="Statut du mandat" onchange="Mandats.majStatut('${esc(m.id)}',this.value)">${opts}</select></div>`;
  }
  async function majStatut(id, statut) {
    const ok = await changerStatut(id, statut);
    if (window.Toast) Toast.afficher(ok ? 'Statut du mandat mis à jour' : 'Mise à jour impossible', ok ? 'succes' : 'erreur');
  }

  // Bloc de la fiche compte : bouton + mandats déjà générés (chargés à l'affichage).
  function blocFiche(compte) {
    if (!peut() || !compte) return '';
    const id = 'mandats-' + esc(compte.ID_Compte);
    setTimeout(async () => {
      const el = document.getElementById(id); if (!el) return;
      const r = await liste(compte.ID_Compte);
      el.innerHTML = !r.ok ? '<span class="mandat-mut">Archive des mandats indisponible pour le moment.</span>'
        : r.lignes.length ? r.lignes.map(ligneHtml).join('') : '<span class="mandat-mut">Aucun mandat généré pour ce compte.</span>';
    }, 0);
    return `<div class="bloc-fiche"><div class="bloc-titre">Mandat et documents commerciaux</div>
      <p class="mandat-mut" style="margin:0 0 10px">Le mandat formalise l'opération commerciale avec le revendeur. Il est prérempli avec la fiche et archivé à chaque génération.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-primaire" style="width:auto" onclick="Mandats.ouvrirDepuisFiche()">Générer un mandat</button>
      <button class="btn-secondaire" style="width:auto" onclick="Mandats.versKit('${esc(compte.ID_Compte)}')">Kit commercial</button></div>
      <div id="${id}" style="margin-top:12px"><span class="mandat-mut">Chargement des mandats…</span></div></div>`;
  }
  function ouvrirDepuisFiche() { const c = window.VueFicheCompte && VueFicheCompte.state && VueFicheCompte.state.compte; if (c) ouvrir(c); }
  function versKit(idCompte) { if (window.VueKit) VueKit.pourCompte(idCompte); if (window.Router) Router.aller('#/kit'); }

  return { STATUTS, OFFRES, peut, ouvrir, archiver, liste, changerStatut, majStatut, blocFiche, ouvrirDepuisFiche, versKit, esc };
})();
