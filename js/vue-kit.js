// ═══════════════════════════════════════
//  vue-kit.js — Kit commercial : bibliothèque de livrables par rôle (route #/kit, droit « kit »)
//  Les fiches viennent de la table kit_documents ; les fichiers vivent dans le bucket privé « kit-commercial »
//  (liens signés de courte durée, jamais d'URL publique). La base décide de ce que chaque rôle voit :
//    - documents « interne » (NE PAS DIFFUSER, sources grossistes) : ADMIN, CDS, CHANNEL_MANAGER seulement ;
//    - documents diffusables : tous les rôles, EXTERNE compris (consultation uniquement) ;
//    - document échu (date de validité dépassée) : listé, signalé, jamais envoyable.
//  Envoi tracé depuis une fiche : lien valable 7 jours copié, action « Mailing » inscrite au journal (même convention que le module Mailing).
//  ADMIN et CHANNEL_MANAGER ajoutent ou remplacent les fichiers et règlent la validité.
//  Aucun fichier n'est fourni à l'installation : les fiches existent, les fichiers s'ajoutent depuis cette page.
// ═══════════════════════════════════════
window.VueKit = {
  state: { chargement: true, erreur: null, docs: [], cat: 'tous', q: '', compteCible: '', comptes: null, envoi: null, occupe: '' },
  CATS: [['tous', 'Tous'], ['starter', 'Starter pack'], ['flyer', 'Flyers'], ['deck', 'Decks'], ['book', 'Books'], ['offre', 'Offres'], ['cotation', 'Cotations'], ['interne', 'Internes'], ['source', 'Sources']],
  EXT_OK: ['pdf', 'pptx', 'docx', 'md', 'png', 'jpg', 'jpeg'],
  LIEN_JOURS: 7,

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _sb() { return (window.SheetsAPI && SheetsAPI._sb) || null; },
  _admin() { return window.Session && (Session.estManager() || Session.estChannel()); },
  _peutStudio() { return window.Session && ['ADMIN', 'CDS', 'CHANNEL_MANAGER', 'EXTERNE'].includes(Session.role); },
  _peutEnvoyer() { return this._peutStudio(); },   // EXTERNE compris : le lien est copié, mais rien n'est inscrit au journal des comptes (lecture seule pour lui)
  _estExterne() { return !!(window.Session && Session.role === 'EXTERNE'); },
  _jour() { return new Date().toISOString().slice(0, 10); },
  _echu(d) { return !!(d && d.valide_au && String(d.valide_au).slice(0, 10) < this._jour()); },
  _jj(s) { const t = String(s || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}` : ''; },
  _taille(n) { n = Number(n) || 0; return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : n >= 1024 ? Math.round(n / 1024) + ' Ko' : n ? n + ' o' : ''; },
  pourCompte(id) { this.state.compteCible = id ? String(id) : ''; },

  async init() {
    const s = this.state; s.chargement = true; s.erreur = null; this.render();
    const sb = this._sb();
    if (!sb) { s.chargement = false; s.erreur = 'Base indisponible.'; return this.render(); }
    try {
      const { data, error } = await sb.from('kit_documents').select('*').order('ordre');
      if (error) throw error;
      s.docs = (data || []).filter(d => d.actif !== false);   // document désactivé (remplacé par le Studio) : fichier conservé, plus listé
    } catch (e) { s.docs = []; s.erreur = 'La bibliothèque n’est pas encore activée sur cette base (' + ((e && e.message) || 'erreur') + ').'; }
    s.chargement = false; this.render();
  },

  // Starter pack : documents non internes conseillés pour les paliers de démarrage (Dormant, Éveil). Composition pilotée par les paliers de chaque fiche.
  _starter(d) { return !d.interne && (d.paliers || []).some(p => p === 'DORMANT' || p === 'EVEIL'); },
  setCat(c) { this.state.cat = c; this.render(); },
  setQ(v) { this.state.q = String(v || '').slice(0, 60); this._majListe(); },
  _majListe() { const el = document.getElementById('kit-liste'); if (el) el.innerHTML = this._listeHtml(); },

  _compteCible() { const s = this.state; return s.compteCible && s.comptes ? s.comptes.find(c => String(c.ID_Compte) === s.compteCible) : null; },
  _paliers() { const c = this._compteCible(); return c && window.Paliers ? Paliers.palier(c).cle : null; },

  _filtre() {
    const s = this.state, q = s.q.trim().toLowerCase();
    return s.docs.filter(d => (s.cat === 'tous' || (s.cat === 'starter' ? this._starter(d) : d.categorie === s.cat)) && (!q || (d.titre + ' ' + d.groupe).toLowerCase().includes(q)));
  },

  _ligne(d) {
    const E = this._esc, echu = this._echu(d), palier = this._paliers(), conseille = palier && (d.paliers || []).includes(palier);
    const badges = [d.format ? `<span class="kit-chip">${E(d.format)}</span>` : '',
      d.interne ? '<span class="kit-chip kit-int">Interne, ne pas diffuser</span>' : '',
      echu ? `<span class="kit-chip kit-ech">Échu le ${E(this._jj(d.valide_au))}</span>` : (d.valide_au ? `<span class="kit-chip">Valable jusqu’au ${E(this._jj(d.valide_au))}</span>` : ''),
      conseille ? '<span class="kit-chip kit-cons">Conseillé pour ce palier</span>' : ''].join('');
    const ok = !!d.fichier_path, id = E(d.id);
    const actions = [];
    if (ok) actions.push(`<button class="co-btn" onclick="VueKit.ouvrir('${id}')">Aperçu</button>`);
    if (!d.interne && ['offre', 'cotation'].includes(d.categorie) && this._peutStudio() && window.Studio) actions.push(`<button class="co-btn p" onclick="VueKit.studio('${d.categorie === 'cotation' ? 'cotation_grossiste' : 'offre21'}')">Personnaliser</button>`);
    if (ok && !d.interne && !echu && d.groupe !== "Modes d'emploi" && this._peutEnvoyer()) actions.push(`<button class="co-btn p" onclick="VueKit.envoyer('${id}')">Envoyer</button>`);
    if (this._admin()) actions.push(`<label class="co-btn kit-up">${ok ? 'Remplacer' : 'Ajouter le fichier'}<input type="file" accept=".pdf,.pptx,.docx,.md,.png,.jpg,.jpeg" hidden onchange="VueKit.televerser('${id}',this)"/></label>`,
      `<label class="kit-val" title="Date de validité">Valide jusqu’au <input type="date" value="${E(String(d.valide_au || '').slice(0, 10))}" onchange="VueKit.majValidite('${id}',this.value)"/></label>`);
    const dispo = (ok ? `<span class="co-mut">${E(d.fichier_nom || '')} ${E(this._taille(d.taille))}</span>` : '<span class="co-mut">Fichier bientôt disponible</span>') + (this._admin() ? ` <span class="co-mut">Identifiant : <code>${id}</code></span>` : '');
    return `<div class="kit-ligne ${echu ? 'kit-echu' : ''}"><div class="kit-t"><b ${ok ? `style="cursor:pointer" title="Aperçu" onclick="VueKit.ouvrir('${id}')"` : ''}>${E(d.titre)}</b><div class="kit-b">${badges}</div>${dispo}</div><div class="kit-a">${this.state.occupe === d.id ? '<span class="co-mut">En cours…</span>' : actions.join('')}</div></div>`;
  },

  _listeHtml() {
    const E = this._esc, l = this._filtre(), cat = this.state.cat;
    const studio = (['offre', 'cotation'].includes(cat) && this._peutStudio() && window.Studio)
      ? `<div class="co-carte kit-groupe"><div class="co-eyebrow">Sur mesure</div><h2>${cat === 'cotation' ? 'Cotation' : 'Offre'} personnalisée</h2><p class="co-mut">Destinataire, dates, remise et signature, aperçu en direct et PDF à télécharger.</p><button class="co-btn p" onclick="VueKit.studio('${cat === 'cotation' ? 'cotation_grossiste' : 'offre21'}')">Ouvrir le Studio</button>${cat === 'offre' ? ' <button class="co-btn p" onclick="VueKit.studio(\'offre11\')">Offre 1+1</button> <button class="co-btn p" onclick="VueKit.studio(\'bundle\')">Bundle</button>' : ''}</div>` : '';
    if (!l.length) return studio || '<p class="co-mut" style="padding:8px 2px">Aucun document pour ce filtre.</p>';
    const groupes = []; l.forEach(d => { let g = groupes.find(x => x.n === d.groupe); if (!g) groupes.push(g = { n: d.groupe, l: [] }); g.l.push(d); });
    return studio + groupes.map(g => `<div class="co-carte kit-groupe"><div class="co-eyebrow">${E(g.n)}</div>${g.l.map(d => this._ligne(d)).join('')}</div>`).join('');
  },

  _outilsHtml() {
    const mand = window.Mandats && Mandats.peut();
    return `<div class="kit-outils">
      ${mand ? `<div class="co-carte"><div class="co-eyebrow">Contrat</div><h2>Mandat revendeur</h2><p class="co-mut">Formalise l'opération commerciale. Prérempli depuis la fiche du compte, archivé à chaque génération.</p><button class="co-btn p" onclick="VueKit.mandat()">Ouvrir le générateur</button></div>` : ''}
      ${this._peutStudio() && window.Studio ? `<div class="co-carte"><div class="co-eyebrow">Sur mesure</div><h2>Studio de documents</h2><p class="co-mut">Cotations dégressives, offres 2+1 et 1+1 avec palier, bundle, plan commercial : calcul automatique des licences offertes, aperçu en direct et PDF à télécharger.</p><div class="co-actions"><button class="co-btn p" onclick="VueKit.studio('cotation_grossiste')">Cotation Grossiste</button><button class="co-btn p" onclick="VueKit.studio('cotation_empower')">Cotation Empower</button><button class="co-btn" onclick="VueKit.studio('offre21')">Offre 2+1</button><button class="co-btn" onclick="VueKit.studio('offre11')">Offre 1+1</button><button class="co-btn" onclick="VueKit.studio('bundle')">Bundle</button><button class="co-btn" onclick="VueKit.studio('plan_commercial')">Plan commercial</button></div></div>` : ''}</div>`;
  },

  render() {
    const app = document.getElementById('app'); if (!app) return;
    const s = this.state, E = this._esc;
    const entete = `<header class="header-vue"><button onclick="Router.retour()" class="btn-retour" aria-label="Retour">←</button><h1>Kit commercial</h1></header>${typeof NavBar === 'function' ? NavBar('kit') : ''}`;
    if (s.chargement) { app.innerHTML = entete + '<div class="coach"><p class="pilo-vide" style="padding:16px">Chargement…</p></div>'; return; }
    const cible = this._compteCible(), pal = this._paliers();
    const bandeau = cible ? `<div class="co-soft kit-cible">Envoi pour <b>${E(cible.Nom_Compte)}</b>${pal && Paliers.PALIERS[pal] ? ` · palier ${E(Paliers.PALIERS[pal].lib)}, les documents conseillés sont signalés` : ''} <button class="co-lien" style="border:0;background:none;text-decoration:underline;cursor:pointer;font:inherit;color:inherit" onclick="VueKit.pourCompte('');VueKit.render()">Changer</button></div>` : '';
    app.innerHTML = entete + `<div class="coach kit"><div class="co-carte"><div class="co-eyebrow">Bibliothèque</div><h2>Kit commercial</h2>
      <p class="co-mut">Les documents à remettre aux revendeurs. Les documents internes ne sont visibles que par l'équipe Impact.${this._peutEnvoyer() ? ' « Envoyer » copie un lien valable ' + this.LIEN_JOURS + ' jours et inscrit l’envoi au journal du compte.' : ''}</p>
      ${s.erreur ? `<div class="co-cot">${E(s.erreur)}</div>` : ''}${bandeau}
      <div class="co-chips">${this.CATS.map(([k, l]) => `<button class="co-chip" ${s.cat === k ? 'style="background:#343F48;color:#fff"' : ''} onclick="VueKit.setCat('${k}')">${l}</button>`).join('')}</div>
      ${this._admin() ? `<div class="co-soft kit-cible"><label class="co-btn kit-up">Importer plusieurs fichiers<input type="file" multiple accept=".pdf,.pptx,.docx,.md,.png,.jpg,.jpeg" hidden onchange="VueKit.importerLot(this)"/></label> <span class="co-mut">Nommez chaque fichier avec l’identifiant affiché sous le titre (ex. book-empower.pdf).</span></div>` : ''}
      <input type="search" class="kit-q" placeholder="Rechercher un document" aria-label="Rechercher" value="${E(s.q)}" oninput="VueKit.setQ(this.value)"/></div>
      ${this._outilsHtml()}<div id="kit-liste">${this._listeHtml()}</div>${s.envoi ? this._modaleEnvoi() : ''}</div>`;
    if (!s.comptes && window.SheetsAPI && s.compteCible) this._chargerComptes();
  },

  async _chargerComptes() {
    try {
      const l = await SheetsAPI.lire('EMPOWER_MDB', 'COMPTES');
      this.state.comptes = (l || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE' && (Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin));
      this.render();
    } catch { this.state.comptes = []; }
  },

  // ── Ouvrir : lien signé de 2 minutes ──
  async _lien(d, secondes, telecharger) {
    const { data, error } = await this._sb().storage.from('kit-commercial').createSignedUrl(d.fichier_path, secondes, telecharger ? { download: true } : undefined);
    if (error || !data || !data.signedUrl) throw new Error((error && error.message) || 'lien indisponible');
    return data.signedUrl;
  },
  async ouvrir(id) {
    const d = this.state.docs.find(x => x.id === id); if (!d || !d.fichier_path) return;
    // Aperçu dans l'application (bouton Fermer toujours visible), jamais dans une nouvelle fenêtre ni à la place de l'application.
    try {
      const [u, tel] = await Promise.all([this._lien(d, 600), this._lien(d, 600, true)]);
      // « format » de la fiche = gabarit (A4, Digital…) : le type de fichier se lit dans son nom, sinon l'aperçu PDF ne se déclenche jamais.
      const ext = (String(d.fichier_nom || d.fichier_path).match(/\.([a-z0-9]+)$/i) || [])[1] || '';
      Visionneuse.fichier(u, { titre: d.titre, format: ext, telechargement: tel });
    } catch (e) { if (window.Toast) Toast.afficher('Ouverture impossible : ' + (e.message || e), 'erreur'); }
  },

  // ── Envoi tracé ──
  async envoyer(id) {
    const s = this.state, d = s.docs.find(x => x.id === id);
    if (!d || !d.fichier_path || d.interne || this._echu(d) || !this._peutEnvoyer()) return;
    if (!s.comptes) { await this._chargerComptes(); }
    s.envoi = { id, compte: s.compteCible || '', q: '' }; this.render();
  },
  _modaleEnvoi() {
    const s = this.state, E = this._esc, d = s.docs.find(x => x.id === s.envoi.id); if (!d) return '';
    const l = (s.comptes || []).filter(c => !s.envoi.q || String(c.Nom_Compte || '').toLowerCase().includes(s.envoi.q.toLowerCase())).slice(0, 30);
    return `<div class="kit-modale" role="dialog" aria-modal="true"><div class="co-carte kit-boite"><div class="co-eyebrow">Envoi tracé</div><h2>${E(d.titre)}${d.format ? ' · ' + E(d.format) : ''}</h2>
      <p class="co-mut">${this._estExterne() ? 'Un lien valable ' + this.LIEN_JOURS + ' jours est copié (aucune écriture au journal des comptes).' : 'Un lien valable ' + this.LIEN_JOURS + ' jours est copié, et l\'envoi est inscrit au journal du compte choisi.'}</p>
      <input type="search" class="kit-q" placeholder="Chercher le compte" aria-label="Chercher le compte" value="${E(s.envoi.q)}" oninput="VueKit.setEnvoiQ(this.value)"/>
      <select size="6" class="kit-sel" aria-label="Compte destinataire" onchange="VueKit.setEnvoiCompte(this.value)">${l.map(c => `<option value="${E(c.ID_Compte)}" ${String(c.ID_Compte) === s.envoi.compte ? 'selected' : ''}>${E(c.Nom_Compte)}${c.Ville ? ' · ' + E(c.Ville) : ''}</option>`).join('')}</select>
      <div class="co-actions"><button class="co-btn p" onclick="VueKit.confirmerEnvoi()">${this._estExterne() ? 'Copier le lien' : 'Copier le lien et tracer'}</button><button class="co-btn" onclick="VueKit.annulerEnvoi()">Annuler</button></div></div></div>`;
  },
  setEnvoiQ(v) { this.state.envoi.q = String(v || '').slice(0, 60); this.render(); const i = document.querySelector('.kit-boite .kit-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } },
  setEnvoiCompte(v) { this.state.envoi.compte = v; },
  annulerEnvoi() { this.state.envoi = null; this.render(); },
  async confirmerEnvoi() {
    const s = this.state, e = s.envoi; if (!e) return;
    const d = s.docs.find(x => x.id === e.id), c = (s.comptes || []).find(x => String(x.ID_Compte) === String(e.compte));
    const ext = this._estExterne();
    if (!d || (!c && !ext)) { if (window.Toast) Toast.afficher('Choisissez le compte destinataire', 'warning'); return; }
    try {
      const url = await this._lien(d, this.LIEN_JOURS * 86400);
      try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copiez ce lien :', url); }
      if (ext) { s.envoi = null; this.render(); if (window.Toast) Toast.afficher('Lien copié', 'succes', 3000); return; }
      await SheetsAPI.ecrire('EMPOWER_MDB', 'ACTIONS', {
        ID_Action: genId('ACT'), Date_Action: new Date().toISOString(), Type_Action: 'Mailing', Source: 'ESI', PIN_CDS: Session.pin, Nom_Compte: c.Nom_Compte,
        Statut_Avant: c.STATUT_COMPTE || c.Statut || '', Statut_Apres: c.STATUT_COMPTE || c.Statut || '',
        Resum_IA: 'Documentation commerciale : ' + d.titre + (d.format ? ' (' + d.format + ')' : '') + ' via le Kit commercial',
        GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });
      const maj = { Date_Derniere_Action: dateISOLocale(), Type_Derniere_Action: 'Mailing' };
      await SheetsAPI.mettreAJour('EMPOWER_MDB', 'COMPTES', c.ID_Compte, maj); Object.assign(c, maj);
      s.envoi = null; this.render();
      if (window.Toast) Toast.afficher('Lien copié, envoi inscrit au journal de ' + c.Nom_Compte, 'succes', 4000);
    } catch (err) { if (window.Toast) Toast.afficher('Envoi impossible : ' + (err.message || err), 'erreur'); }
  },

  // ── Administration de la bibliothèque (ADMIN, CHANNEL_MANAGER) ──
  // Envoie un fichier pour un document : contrôles (droit, extension, taille), dépôt, mise à jour de la fiche, suppression de l'ancien fichier.
  async _deposer(d, f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!this._admin()) return 'droits insuffisants';
    if (!this.EXT_OK.includes(ext)) return 'format non accepté (pdf, pptx, docx, md, png, jpg)';
    if (f.size > 52428800) return 'fichier trop lourd (50 Mo maximum)';
    const chemin = d.id + '/' + Date.now() + '.' + ext, ancien = d.fichier_path;
    try {
      const sb = this._sb(), st = sb.storage.from('kit-commercial');
      const up = await st.upload(chemin, f, { upsert: false, contentType: f.type || undefined });
      if (up.error) throw up.error;
      const maj = { fichier_path: chemin, fichier_nom: f.name.slice(0, 160), taille: f.size, maj_par: Session.pin, updated_at: new Date().toISOString() };
      const r = await sb.from('kit_documents').update(maj).eq('id', d.id);
      if (r.error) throw r.error;
      Object.assign(d, maj);
      if (ancien) { try { await st.remove([ancien]); } catch { /* ancien fichier conservé en cas d'échec */ } }
      return '';
    } catch (e) { return (e && e.message) || 'téléversement impossible'; }
  },
  async televerser(id, input) {
    const f = input && input.files && input.files[0]; if (!f || !this._admin()) return;
    const s = this.state, d = s.docs.find(x => x.id === id); if (!d) return;
    s.occupe = id; this._majListe();
    const err = await this._deposer(d, f);
    if (input) input.value = '';
    if (window.Toast) Toast.afficher(err ? 'Téléversement impossible : ' + err : 'Fichier enregistré', err ? 'erreur' : 'succes', err ? 5000 : 3000);
    s.occupe = ''; this._majListe();
  },
  // Import en lot : chaque fichier porte l'identifiant du document (ex. book-empower.pdf) ; les noms inconnus sont signalés, jamais devinés.
  async importerLot(input) {
    const fichiers = Array.from((input && input.files) || []); if (!fichiers.length || !this._admin()) return;
    const s = this.state; let ok = 0; const refus = [];
    for (const f of fichiers) {
      const base = f.name.replace(/\.[^.]+$/, '').toLowerCase(), d = s.docs.find(x => x.id === base);
      if (!d) { refus.push(f.name + ' (identifiant inconnu)'); continue; }
      s.occupe = d.id; this._majListe();
      const err = await this._deposer(d, f);
      if (err) refus.push(f.name + ' (' + err + ')'); else ok++;
    }
    if (input) input.value = '';
    s.occupe = ''; this._majListe();
    if (window.Toast) Toast.afficher(ok + ' fichier' + (ok > 1 ? 's' : '') + ' importé' + (ok > 1 ? 's' : '') + (refus.length ? ', ' + refus.length + ' refusé' + (refus.length > 1 ? 's' : '') + ' : ' + refus.slice(0, 3).join(' ; ') : ''), refus.length ? 'warning' : 'succes', 7000);
  },
  async majValidite(id, v) {
    const d = this.state.docs.find(x => x.id === id); if (!d || !this._admin()) return;
    const valeur = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null;
    const r = await this._sb().from('kit_documents').update({ valide_au: valeur, maj_par: Session.pin, updated_at: new Date().toISOString() }).eq('id', id);
    if (r.error) { if (window.Toast) Toast.afficher('Mise à jour impossible', 'erreur'); return; }
    d.valide_au = valeur; this._majListe();
  },

  studio(type) { if (window.Studio) Studio.ouvrir(type, this._compteCible()); },

  mandat() { if (window.Mandats) { const c = this._compteCible(); Mandats.ouvrir(c || {}); } },
};
