// ═══════════════════════════════════════════════════════════════════
//  contacts-structures.js — Lot 8 : température du prospect, structures et contacts multiples
//  Modèle : compte / lead / fiche à froid → structures (siège + sites secondaires) → contacts (fonction libre).
//  Tables : public.structures, public.contacts, colonnes « temperature » (voir MIGRATION_LOT8_*.sql).
//
//  Sécurité de déploiement : tout est inerte tant que la migration n'est pas appliquée. CT.sonder() interroge
//  la table « structures » une fois par session ; si elle est absente, aucun champ n'est affiché et aucune
//  écriture n'est tentée (la création de lead reste strictement celle d'avant).
// ═══════════════════════════════════════════════════════════════════
window.CT = (function () {
  const TEMPS = [['chaud', 'Chaud'], ['tiede', 'Tiède'], ['froid', 'Froid']];
  const PARENT = { lead: 'leads', compte: 'comptes', fiche_froide: 'fiches_froides' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  let on = null, sonde = null;
  // Sonde unique : « true » seulement si la table existe et est lisible par ce profil.
  function sonder() {
    if (sonde) return sonde;
    sonde = (async () => {
      try {
        const sb = window.SheetsAPI && SheetsAPI._sb;
        if (!sb) { sonde = null; return false; }
        const r = await sb.from('structures').select('id').limit(1);
        on = !r.error;
      } catch (e) { sonde = null; on = false; }
      return on === true;
    })();
    return sonde;
  }
  const actif = () => on === true;

  // ── Température ───────────────────────────────────────────────────
  function tempOf(rec) {
    const t = String((rec && (rec.Temperature ?? rec.temperature)) || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return TEMPS.some(x => x[0] === t) ? t : '';
  }
  const libTemp = t => (TEMPS.find(x => x[0] === t) || [, ''])[1];
  const pill = t => t ? `<span class="ct-temp ct-temp-${t}" title="Température du prospect">${libTemp(t)}</span>` : '';
  const selectTemp = (id, val, attrs = '') => !actif() ? '' :
    `<select id="${id}" ${attrs}><option value="">Non qualifiée</option>${TEMPS.map(([v, l]) => `<option value="${v}" ${val === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  // Changement de température depuis une fiche : écriture ciblée, jamais bloquante pour la vue.
  async function changerTemperature(onglet, id, valeur, apres) {
    try {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', onglet, id, { Temperature: valeur || null });
      if (window.Toast) Toast.afficher('Température enregistrée', 'success', 2000);
      if (typeof apres === 'function') apres(valeur);
    } catch (e) { if (window.Toast) Toast.afficher('Température non enregistrée : ' + (e.message || e), 'error', 4000); }
  }

  // ── Brouillon de saisie (formulaire de création) : état hors DOM, donc insensible aux re-rendus ──
  let brouillon = [];
  const vide = () => ({ libelle: '', adresse: '', ville: '', cp: '', contacts: [{ nom: '', fonction: '', tel: '', email: '' }] });
  function vider() { brouillon = []; }
  function majB(i, j, champ, val) {
    const s = brouillon[i]; if (!s) return;
    if (j < 0) s[champ] = val; else if (s.contacts[j]) s.contacts[j][champ] = val;
  }
  function rendreBrouillon() {
    if (!brouillon.length) return '<div class="ct-vide">Aucune structure supplémentaire.</div>';
    const inp = (i, j, ch, lb, v, ph = '') => `<label class="ct-champ">${lb}<input value="${esc(v)}" placeholder="${esc(ph)}" oninput="CT.maj(${i},${j},'${ch}',this.value)"/></label>`;
    return brouillon.map((s, i) => `
      <fieldset class="ct-struct"><legend>Structure ${i + 2}</legend>
        <button type="button" class="ct-suppr" onclick="CT.supS(${i})" aria-label="Retirer cette structure">Retirer</button>
        <div class="ct-ligne">${inp(i, -1, 'libelle', 'Nom du site', s.libelle, 'ex : Agence Lyon, Dépôt')}${inp(i, -1, 'adresse', 'Adresse', s.adresse)}</div>
        <div class="ct-ligne">${inp(i, -1, 'ville', 'Ville', s.ville)}${inp(i, -1, 'cp', 'Code postal', s.cp)}</div>
        ${s.contacts.map((c, j) => `<div class="ct-contact"><div class="ct-ligne">${inp(i, j, 'nom', 'Contact', c.nom)}${inp(i, j, 'fonction', 'Fonction', c.fonction, 'texte libre')}</div>
          <div class="ct-ligne">${inp(i, j, 'tel', 'Téléphone', c.tel)}${inp(i, j, 'email', 'E-mail', c.email)}</div>
          ${s.contacts.length > 1 ? `<button type="button" class="ct-suppr" onclick="CT.supC(${i},${j})">Retirer ce contact</button>` : ''}</div>`).join('')}
        <button type="button" class="ct-ajout" onclick="CT.ajC(${i})">+ Ajouter un contact à cette structure</button>
      </fieldset>`).join('');
  }
  const rafraichir = () => { const el = document.getElementById('ct-extra'); if (el) el.innerHTML = rendreBrouillon(); };
  function ajS() { brouillon.push(vide()); rafraichir(); }
  function supS(i) { brouillon.splice(i, 1); rafraichir(); }
  function ajC(i) { if (brouillon[i]) { brouillon[i].contacts.push({ nom: '', fonction: '', tel: '', email: '' }); rafraichir(); } }
  function supC(i, j) { if (brouillon[i] && brouillon[i].contacts.length > 1) { brouillon[i].contacts.splice(j, 1); rafraichir(); } }
  // Bloc à insérer dans le formulaire de création de lead (vide tant que la migration n'est pas appliquée).
  const blocSaisie = () => !actif() ? '' : `
    <div class="ct-bloc">
      <div class="ct-titre">AUTRES STRUCTURES ET CONTACTS</div>
      <p class="ct-aide">Un même compte peut avoir plusieurs sites et plusieurs interlocuteurs. L'adresse et le contact ci-dessus forment le siège ; ajoutez ici les autres sites.</p>
      <div id="ct-extra">${rendreBrouillon()}</div>
      <button type="button" class="ct-ajout" onclick="CT.ajS()">+ Ajouter une structure</button>
    </div>`;

  // ── Écriture : siège (adresse + contact principal du formulaire) puis structures supplémentaires ──
  // Ne lève jamais : retourne { ok, erreurs } pour que la création du lead reste réussie quoi qu'il arrive.
  async function enregistrer(type, parentId, siege, principal) {
    if (!actif() || !parentId) return { ok: true, ignore: true };
    const erreurs = [];
    const ecrire = async (onglet, row) => { try { await SheetsAPI.ecrire('EMPOWER_MDB', onglet, row); return true; } catch (e) { erreurs.push(e.message || String(e)); return false; } };
    const plein = o => Object.values(o || {}).some(v => String(v || '').trim());
    const contacts = async (structureId, liste) => {
      let premier = true;
      for (const c of liste) {
        if (!plein(c)) continue;
        await ecrire('CONTACTS', { id: uuid(), structure_id: structureId, nom: c.nom || null, fonction: c.fonction || null, tel: c.tel || null, email: c.email || null, est_principal: premier });
        premier = false;
      }
    };
    const idSiege = uuid();
    if (await ecrire('STRUCTURES', { id: idSiege, parent_type: type, parent_id: String(parentId), libelle: 'Siège', adresse: siege?.adresse || null, ville: siege?.ville || null, code_postal: siege?.cp || null, departement: siege?.dep || null, est_siege: true })) {
      await contacts(idSiege, [principal || {}]);
    }
    for (const s of brouillon) {
      if (!plein({ a: s.libelle, b: s.adresse, c: s.ville, d: s.cp }) && !s.contacts.some(plein)) continue;
      const id = uuid();
      if (await ecrire('STRUCTURES', { id, parent_type: type, parent_id: String(parentId), libelle: s.libelle || 'Site', adresse: s.adresse || null, ville: s.ville || null, code_postal: s.cp || null, est_siege: false })) await contacts(id, s.contacts);
    }
    vider();
    return { ok: !erreurs.length, erreurs };
  }

  // ── Lecture et affichage (fiches) ─────────────────────────────────
  async function lire(type, parentId) {
    if (!actif() || !parentId) return [];
    const [st, ct] = await Promise.all([SheetsAPI.lire('EMPOWER_MDB', 'STRUCTURES', { nocache: true }), SheetsAPI.lire('EMPOWER_MDB', 'CONTACTS', { nocache: true })]);
    const mes = (st || []).filter(s => !s.deleted && s.parent_type === type && String(s.parent_id) === String(parentId));
    const ids = new Set(mes.map(s => s.id));
    const parSt = {};
    for (const c of (ct || [])) if (!c.deleted && ids.has(c.structure_id)) (parSt[c.structure_id] = parSt[c.structure_id] || []).push(c);
    return mes.sort((a, b) => (b.est_siege ? 1 : 0) - (a.est_siege ? 1 : 0))
      .map(s => ({ ...s, contacts: (parSt[s.id] || []).sort((a, b) => (b.est_principal ? 1 : 0) - (a.est_principal ? 1 : 0)) }));
  }
  const telLien = t => { const n = String(t || '').replace(/[^\d+]/g, ''); return n ? `<a href="tel:${esc(n)}">${esc(t)}</a>` : ''; };
  const mailLien = m => m ? `<a href="mailto:${esc(m)}">${esc(m)}</a>` : '';
  function rendreFiche(structures) {
    if (!structures.length) return '<div class="ct-vide">Aucune structure ni contact enregistré.</div>';
    return structures.map(s => `<div class="ct-fiche-struct">
      <div class="ct-fiche-tete"><strong>${esc(s.libelle || (s.est_siege ? 'Siège' : 'Site'))}</strong>${s.est_siege ? ' <span class="ct-badge">Siège</span>' : ''}
        <span class="ct-adr">${esc([s.adresse, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</span></div>
      ${s.contacts.length ? s.contacts.map(c => `<div class="ct-fiche-contact"><span>${esc(c.nom || 'Contact')}${c.fonction ? ' · ' + esc(c.fonction) : ''}${c.est_principal ? ' <span class="ct-badge">Principal</span>' : ''}</span>
        <span>${telLien(c.tel)}${c.tel && c.email ? ' · ' : ''}${mailLien(c.email)}</span></div>`).join('') : '<div class="ct-vide">Aucun contact.</div>'}
    </div>`).join('');
  }
  // Emplacement à poser dans une fiche : <div class="ct-slot" data-ct-type="lead" data-ct-id="…"></div>
  // Un observateur le remplit dès qu'il apparaît (donc aussi après chaque re-rendu de la vue).
  const slot = (type, id) => actif() && id ? `<div class="ct-bloc"><div class="ct-titre">STRUCTURES ET CONTACTS</div><div class="ct-slot" data-ct-type="${esc(type)}" data-ct-id="${esc(id)}"><div class="ct-vide">Chargement…</div></div></div>` : '';
  async function remplir(el) {
    if (!el || el.dataset.ctOk === '1') return;
    el.dataset.ctOk = '1';
    try { el.innerHTML = rendreFiche(await lire(el.dataset.ctType, el.dataset.ctId)); }
    catch (e) { el.innerHTML = '<div class="ct-vide">Structures indisponibles pour le moment.</div>'; }
  }
  new MutationObserver(() => { document.querySelectorAll('.ct-slot:not([data-ct-ok])').forEach(remplir); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // ── Export : une ligne de texte par parent (structures et contacts), pour tableur ──
  async function resumes() {
    if (!actif()) return () => '';
    const [st, ct] = await Promise.all([SheetsAPI.lire('EMPOWER_MDB', 'STRUCTURES'), SheetsAPI.lire('EMPOWER_MDB', 'CONTACTS')]);
    const parSt = {}; for (const c of (ct || [])) if (!c.deleted) (parSt[c.structure_id] = parSt[c.structure_id] || []).push(c);
    const parP = {};
    for (const s of (st || [])) if (!s.deleted) (parP[s.parent_type + '|' + s.parent_id] = parP[s.parent_type + '|' + s.parent_id] || []).push(s);
    return (type, id) => (parP[type + '|' + id] || []).map(s =>
      `${s.libelle || 'Site'}${s.ville ? ' (' + s.ville + ')' : ''} : ` + ((parSt[s.id] || []).map(c => [c.nom, c.fonction, c.tel, c.email].filter(Boolean).join(' / ')).join(' ; ') || 'aucun contact')).join(' | ');
  }

  return { sonder, actif, TEMPS, tempOf, libTemp, pill, selectTemp, changerTemperature, blocSaisie, enregistrer, vider, maj: majB, ajS, supS, ajC, supC, lire, slot, resumes, PARENT };
})();
