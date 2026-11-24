// ═══════════════════════════════════════
//  studio-livrables.js : Studio de documents commerciaux (Kit commercial)
//  Formulaire de personnalisation + aperçu en direct + PDF téléchargeable, pour : offre de bienvenue, offre exceptionnelle,
//  proposition commerciale, cotation distributeur, offres supplémentaires.
//  Le rendu et les calculs sont ceux de js/livrables-pdf.js (design Marvesting V3, prix du catalogue uniquement, jamais de prix inventé).
//  Personnalisable : destinataire (facultatif), contact, dates et période, remise en % (tout le reste se recalcule), signature du commercial
//  (préremplie depuis son profil, modifiable, mémorisée sur l'appareil), conditions, titre.
//  Qui peut l'ouvrir : ADMIN, CDS, CHANNEL_MANAGER et EXTERNE (fournisseur de leads : génère les documents, sans envoi tracé ni écriture au journal). Chaque PDF créé pour un compte est inscrit au journal (« Devis »).
// ═══════════════════════════════════════
window.Studio = (function () {
  const TYPES = ['bienvenue', 'exceptionnelle', 'proposition', 'cotation', 'supplementaire', 'bundle'];
  const LARGEUR = 1123;   // A4 paysage à 96 dpi
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const jour = () => new Date().toISOString().slice(0, 10);
  const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const peut = () => !!(window.Session && Session.estConnecte && Session.estConnecte() && ['ADMIN', 'CDS', 'CHANNEL_MANAGER', 'EXTERNE'].includes(Session.role));
  let s = null, el = null, minuteur = null, comptes = [], libs = null, ongletMobile = 'reglages', zoom = 1;

  // ── Signature : profil du commercial, modifiable, mémorisée par appareil ──
  const cleSig = () => 'esi_studio_signature_' + (window.Session ? Session.pin : '');
  function signature() {
    try { const m = JSON.parse(localStorage.getItem(cleSig()) || 'null'); if (m && typeof m === 'object') return { nom: m.nom || '', role: m.role || '', tel: m.tel || '', mail: m.mail || '' }; } catch (e) { /* stockage indisponible */ }
    const p = window.EquipeContacts && Session ? EquipeContacts.parPin(Session.pin) : null;
    return { nom: p ? p.nom : (Session.nom || ''), role: p ? p.role : '', tel: p && p.tel ? EquipeContacts.fmtTel(p.tel) : '', mail: p ? (p.mail || '') : '' };
  }
  function memoriserSignature() { try { localStorage.setItem(cleSig(), JSON.stringify(s.sig)); } catch (e) { /* non bloquant */ } }

  function etat(type, compte) {
    const C = window.Catalogue, cot = C && C.cotationsActives ? (C.cotationsActives(jour())[0] || null) : null;
    const c = compte || {};
    return {
      type: TYPES.includes(type) ? type : 'bienvenue',
      client: c.Nom_Compte || '', contact: c.Contact_Nom || '', region: c.Ville || '', compteId: c.ID_Compte || '',
      dateEmission: jour(), validite: plus(30), conditions: '', titre: '',
      cotLib: cot ? (cot.libelle || 'Cotation Norton 360') : 'Cotation Norton 360', cotDebut: cot ? cot.debut : jour(), cotFin: cot ? cot.fin : plus(30),
      cotRemise: cot && cot.remise_pct ? cot.remise_pct : '', cotNonRecond: !!(cot && cot.non_reconductible),
      offre: 'xy', achetees: 10, offertes: 1, taux: 10, par: 2, offertNom: 'Norton Utilities Ultimate', offertPvp: '',
      lignes: [['n360-del5', 6], ['', 0], ['', 0]], grossiste: 'pa_td',
      seuil: C && C.remise_volume ? C.remise_volume.seuil : 10, tauxVol: C && C.remise_volume ? Math.round(C.remise_volume.taux * 100) : 10,
      canal: 'pa_empower', debut: jour(), op1: 'n360-del5', q1: 1, nom1: 'Norton Utilities Ultimate', pvp1: '', op2: '', q2: 1, nom2: '', pvp2: '',
      sig: signature(),
    };
  }

  // ── Configuration envoyée au rendu ──
  function cfg() {
    const L = window.LivrablesPDF, T = L.TYPES[s.type], num = v => Math.max(0, Number(String(v).replace(',', '.')) || 0);
    const offre = !T.offre ? null
      : s.offre === 'remise' ? (num(s.taux) > 0 ? { type: 'remise', taux: num(s.taux) / 100 } : null)
      : s.offre === 'produit' ? (num(s.par) > 0 && s.offertNom ? { type: 'produit', par: num(s.par), nom: s.offertNom, pvp_ttc: s.offertPvp === '' ? null : num(s.offertPvp) } : null)
      : (num(s.achetees) > 0 && num(s.offertes) > 0 ? { type: 'xy', achetees: Math.floor(num(s.achetees)), offertes: Math.floor(num(s.offertes)) } : null);
    const extra = s.type === 'supplementaire' ? { canal: s.grossiste, params: { seuil: Math.max(1, Math.floor(num(s.seuil))), taux: num(s.tauxVol) / 100 } }
      : s.type === 'bundle' ? { canal: s.canal, debut: s.debut, operations: [[s.op1, s.q1, s.nom1, s.pvp1], [s.op2, s.q2, s.nom2, s.pvp2]].filter(o => o[0]).map(o => ({ achete: [o[0], Math.max(1, Math.floor(num(o[1])) || 1)], offert: { nom: o[2] || 'Produit offert', pvp_ttc: o[3] === '' ? null : num(o[3]) } })) }
      : s.type === 'cotation' ? { cotation: { libelle: s.cotLib, debut: s.cotDebut, fin: s.cotFin, remise_pct: num(s.cotRemise), canaux: ['td', 'ingram'], non_reconductible: s.cotNonRecond }, date: s.cotDebut || undefined }
      : {};
    return Object.assign({ date: s.dateEmission || jour() }, extra, {
      type: s.type, titre: s.titre.trim(), conditions: s.conditions.trim(), offre, grossiste: s.grossiste, volume: false,
      lignes: s.lignes.filter(([id, q]) => id && q > 0), validite: s.type === 'cotation' ? '' : s.validite,
      client: { nom: s.client.trim(), contact: s.contact.trim(), region: s.region },
      emetteur: { nom: s.sig.nom, role: s.sig.role, tel: s.sig.tel, mail: s.sig.mail },
    });
  }
  function documentHtml() {
    try { return window.LivrablesPDF.html(cfg()); }
    catch (e) { return '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">Aperçu indisponible : ' + esc((e && e.message) || e) + '</body>'; }
  }

  // ── Interface ──
  function champ(lib, html) { return `<label class="st-c"><span>${esc(lib)}</span>${html}</label>`; }
  function inp(cle, type, extra) { return `<input type="${type || 'text'}" ${extra || ''} value="${esc(s[cle])}" oninput="Studio.maj('${cle}',this.value)"/>`; }
  function sigInp(cle) { return `<input type="${cle === 'mail' ? 'email' : 'text'}" value="${esc(s.sig[cle])}" oninput="Studio.majSig('${cle}',this.value)"/>`; }

  function formulaire() {
    const L = window.LivrablesPDF, C = window.Catalogue, T = L.TYPES[s.type];
    const opt = k => `<option value="${k}" ${s.type === k ? 'selected' : ''}>${esc(L.TYPES[k].lib)}</option>`;
    const prods = sel => '<option value="">Aucun produit</option>' + C.listeProduits().map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(C.libelle(p))}</option>`).join('');
    let spec = '';
    if (s.type === 'cotation') {
      spec = `<div class="st-g"><div class="st-t">Cotation</div>${champ('Nom de la cotation', inp('cotLib'))}
        <div class="st-2">${champ('Début', inp('cotDebut', 'date'))}${champ('Fin', inp('cotFin', 'date'))}</div>
        ${champ('Remise sur le prix d\'achat (%)', inp('cotRemise', 'number', 'min="0" max="90" step="0.5" inputmode="decimal"'))}
        <label class="st-o"><input type="checkbox" ${s.cotNonRecond ? 'checked' : ''} onchange="Studio.maj('cotNonRecond',this.checked)"/> Opération non reconductible</label>
        <p class="st-m">Tous les prix cotés et les remises par produit se recalculent depuis ce pourcentage, à partir des prix d'achat du catalogue.</p></div>`;
    } else if (s.type === 'bundle') {
      const canaux = [['pa_empower', 'Empower'], ['pa_td', 'Tech Data'], ['pa_ingram', 'Ingram Micro']].map(([k, l]) => `<option value="${k}" ${s.canal === k ? 'selected' : ''}>${l}</option>`).join('');
      const op = n => `<div class="st-t">Opération ${n}${n === 2 ? ' (facultative)' : ''}</div><div class="st-lg"><select aria-label="Produit acheté ${n}" onchange="Studio.maj('op${n}',this.value)">${prods(s['op' + n])}</select><input type="number" min="1" inputmode="numeric" aria-label="Quantité ${n}" value="${s['q' + n]}" oninput="Studio.maj('q${n}',this.value)"/></div><div class="st-2">${champ('Produit offert', inp('nom' + n))}${champ('PVP TTC offert (€)', inp('pvp' + n, 'number', 'min="0" step="0.01" inputmode="decimal"'))}</div>`;
      spec = `<div class="st-g"><div class="st-t">Bundle</div>${champ('Prix d\'achat', `<select onchange="Studio.maj('canal',this.value)">${canaux}</select>`)}${champ('Début de l\'opération', inp('debut', 'date'))}${op(1)}${op(2)}<p class="st-m">Le PVP du produit offert se saisit s'il n'est pas dans le catalogue : sans lui, la marge du bundle n'est pas chiffrée.</p></div>`;
    } else if (s.type === 'supplementaire') {
      spec = `<div class="st-g"><div class="st-t">Offres</div>${champ('Prix d\'achat', `<select onchange="Studio.maj('grossiste',this.value)"><option value="pa_td" ${s.grossiste === 'pa_td' ? 'selected' : ''}>Tech Data</option><option value="pa_ingram" ${s.grossiste === 'pa_ingram' ? 'selected' : ''}>Ingram Micro</option><option value="pa_empower" ${s.grossiste === 'pa_empower' ? 'selected' : ''}>Empower</option></select>`)}
        <div class="st-2">${champ('Seuil volume (licences)', inp('seuil', 'number', 'min="1" inputmode="numeric"'))}${champ('Remise volume (%)', inp('tauxVol', 'number', 'min="0" max="90" step="0.5" inputmode="decimal"'))}</div></div>`;
    } else {
      const lignes = s.lignes.map(([id, q], i) => `<div class="st-lg"><select aria-label="Produit ${i + 1}" onchange="Studio.majLigne(${i},'id',this.value)">${prods(id)}</select><input type="number" min="0" max="9999" inputmode="numeric" aria-label="Quantité ${i + 1}" value="${q}" oninput="Studio.majLigne(${i},'q',this.value)"/></div>`).join('');
      let offre = '';
      if (T.offre) {
        offre = `<div class="st-t">Offre</div>${champ('Type d\'offre', `<select onchange="Studio.majOffre(this.value)"><option value="xy" ${s.offre === 'xy' ? 'selected' : ''}>X licences achetées, Y offertes</option><option value="remise" ${s.offre === 'remise' ? 'selected' : ''}>Remise en % sur le prix d'achat</option><option value="produit" ${s.offre === 'produit' ? 'selected' : ''}>Produit offert pour X licences</option></select>`)}`
          + (s.offre === 'remise' ? champ('Remise (%)', inp('taux', 'number', 'min="0" max="90" step="0.5" inputmode="decimal"'))
            : s.offre === 'produit' ? `<div class="st-2">${champ('Licences achetées', inp('par', 'number', 'min="1" inputmode="numeric"'))}${champ('Produit offert', inp('offertNom'))}</div>${champ('PVP TTC du produit offert (€)', inp('offertPvp', 'number', 'min="0" step="0.01" inputmode="decimal"'))}`
            : `<div class="st-2">${champ('Achetées', inp('achetees', 'number', 'min="1" inputmode="numeric"'))}${champ('Offertes', inp('offertes', 'number', 'min="1" inputmode="numeric"'))}</div>`);
      }
      spec = `<div class="st-g"><div class="st-t">Produits</div>${lignes}${champ('Comparé à', `<select onchange="Studio.maj('grossiste',this.value)"><option value="pa_td" ${s.grossiste === 'pa_td' ? 'selected' : ''}>Tech Data</option><option value="pa_ingram" ${s.grossiste === 'pa_ingram' ? 'selected' : ''}>Ingram Micro</option></select>`)}${offre}</div>`;
    }
    return `<div class="st-g"><div class="st-t">Document</div>${champ('Modèle', `<select onchange="Studio.changerType(this.value)">${TYPES.map(opt).join('')}</select>`)}</div>
      <div class="st-g"><div class="st-t">Destinataire (facultatif)</div>
        ${champ('Société', `<input type="text" list="st-comptes" value="${esc(s.client)}" oninput="Studio.choisirCompte(this.value)" autocomplete="off"/><datalist id="st-comptes">${comptes.slice(0, 400).map(c => `<option value="${esc(c.Nom_Compte)}"></option>`).join('')}</datalist>`)}
        ${champ('Contact', inp('contact'))}
        <p class="st-m">Sans destinataire, le document porte la mention « votre société ».</p></div>
      ${spec}
      <div class="st-g"><div class="st-t">Dates</div><div class="st-2">${champ('Établi le', inp('dateEmission', 'date'))}${s.type === 'cotation' ? '' : champ('Valable jusqu\'au', inp('validite', 'date'))}</div></div>
      <div class="st-g"><div class="st-t">Signature du commercial</div>
        ${champ('Nom', sigInp('nom'))}${champ('Fonction', sigInp('role'))}<div class="st-2">${champ('Téléphone', sigInp('tel'))}${champ('E-mail', sigInp('mail'))}</div></div>
      <div class="st-g"><div class="st-t">Texte</div>${champ('Titre (facultatif)', inp('titre'))}${champ('Conditions particulières (facultatif)', inp('conditions'))}</div>`;
  }

  function ouvrir(type, compte) {
    if (!peut()) { if (window.Toast) Toast.afficher('Réservé à l’équipe commerciale et aux fournisseurs de leads', 'erreur'); return false; }
    if (!window.LivrablesPDF || !window.Catalogue) { if (window.Toast) Toast.afficher('Modèles indisponibles, rechargez la page', 'erreur'); return false; }
    fermer(); s = etat(type, compte); ongletMobile = 'reglages'; zoom = 1;
    el = document.createElement('div'); el.id = 'studio'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Studio de documents');
    el.innerHTML = `<header class="st-barre"><button type="button" class="st-fermer" onclick="Studio.fermer()"><span aria-hidden="true">←</span> Fermer</button><div class="st-titre">Studio de documents</div>
      <div class="st-actions"><button type="button" class="st-btn" onclick="Studio.imprimer()">Imprimer</button><button type="button" class="st-btn p" id="st-dl" onclick="Studio.telecharger()">Télécharger le PDF</button></div></header>
      <nav class="st-onglets" role="tablist"><button type="button" data-o="reglages" onclick="Studio.onglet('reglages')">Réglages</button><button type="button" data-o="apercu" onclick="Studio.onglet('apercu')">Aperçu</button></nav>
      <div class="st-corps"><section class="st-form" id="st-form">${formulaire()}</section><section class="st-prev" id="st-prev"><div class="st-defil" id="st-defil"><div class="st-feuille" id="st-feuille"><iframe title="Aperçu du document" sandbox="allow-same-origin allow-modals" id="st-iframe"></iframe></div></div><div class="st-zoom" role="group" aria-label="Zoom"><button type="button" onclick="Studio.zoomer(-1)" aria-label="Réduire">−</button><button type="button" onclick="Studio.zoomer(0)" aria-label="Ajuster à l'écran">Ajuster</button><button type="button" onclick="Studio.zoomer(1)" aria-label="Agrandir">+</button></div></section></div>`;
    document.body.appendChild(el); document.body.classList.add('vis-ouverte');
    document.addEventListener('keydown', echap); window.addEventListener('resize', ajuster);
    onglet('reglages'); rafraichir(true); chargerComptes();
    if (window.LivrablesPDF.sonder) window.LivrablesPDF.sonder().then(() => { if (el) rafraichir(false); });
    return true;
  }
  function echap(e) { if (e.key === 'Escape') fermer(); }
  function fermer() {
    if (!el) return; el.remove(); el = null; s = null; clearTimeout(minuteur);
    document.body.classList.remove('vis-ouverte'); document.removeEventListener('keydown', echap); window.removeEventListener('resize', ajuster);
  }
  function onglet(o) {
    ongletMobile = o; if (!el) return;
    el.setAttribute('data-onglet', o);
    el.querySelectorAll('.st-onglets button').forEach(b => b.classList.toggle('on', b.dataset.o === o));
    if (o === 'apercu') setTimeout(ajuster, 30);
  }

  function zoomer(d) { zoom = d === 0 ? 1 : Math.max(0.25, Math.min(4, zoom * (d > 0 ? 1.5 : 1 / 1.5))); ajuster(); }
  function ajuster() {
    if (!el) return;
    const defil = el.querySelector('#st-defil'), feu = el.querySelector('#st-feuille'), f = el.querySelector('#st-iframe'); if (!defil || !f) return;
    const k = Math.max(0.1, Math.min(1, (defil.clientWidth - 16) / LARGEUR) || 1) * zoom;
    let h = 794; try { const d = f.contentDocument; h = Math.max(794, d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0); } catch (e) { /* hauteur A4 */ }
    f.style.width = LARGEUR + 'px'; f.style.height = h + 'px'; f.style.transform = 'scale(' + k + ')';
    feu.style.width = Math.round(LARGEUR * k) + 'px'; feu.style.height = Math.round(h * k) + 'px'; feu.style.margin = k * LARGEUR > defil.clientWidth - 16 ? '0' : '0 auto';
  }
  function rafraichir(tout) {
    if (!el) return;
    const f = el.querySelector('#st-iframe');
    f.onload = () => { ajuster(); setTimeout(ajuster, 300); };
    f.srcdoc = documentHtml();
    if (tout) { f.style.width = LARGEUR + 'px'; ajuster(); }
  }
  function planifier() { clearTimeout(minuteur); minuteur = setTimeout(() => rafraichir(false), 250); }

  // ── Mises à jour ──
  function maj(cle, v) {
    if (!s) return;
    s[cle] = typeof v === 'boolean' ? v : String(v).slice(0, 160);
    planifier();
  }
  function majSig(cle, v) { if (!s) return; s.sig[cle] = String(v).slice(0, 120); memoriserSignature(); planifier(); }
  function majLigne(i, k, v) { if (!s) return; if (k === 'id') s.lignes[i][0] = v; else s.lignes[i][1] = Math.max(0, Math.min(9999, Math.floor(Number(v) || 0))); if (k === 'id' && v && !s.lignes[i][1]) s.lignes[i][1] = 1; planifier(); }
  function majOffre(v) { s.offre = v; rempl(); }
  function changerType(t) { if (!TYPES.includes(t)) return; const garde = { client: s.client, contact: s.contact, region: s.region, compteId: s.compteId, sig: s.sig, dateEmission: s.dateEmission }; s = Object.assign(etat(t), garde); rempl(); }
  function rempl() { if (!el) return; el.querySelector('#st-form').innerHTML = formulaire(); rafraichir(false); }

  async function chargerComptes() {
    try {
      if (!window.SheetsAPI) return;
      const l = await SheetsAPI.lire('EMPOWER_MDB', 'COMPTES');
      comptes = (l || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE' && (Session.voitTout() || Session.estExterne() || Number(c.PIN_CDS_Assigne) === Session.pin));
      const dl = el && el.querySelector('#st-comptes'); if (dl) dl.innerHTML = comptes.slice(0, 400).map(c => `<option value="${esc(c.Nom_Compte)}"></option>`).join('');
    } catch (e) { comptes = []; }
  }
  function choisirCompte(v) {
    if (!s) return;
    s.client = String(v).slice(0, 160);
    const c = comptes.find(x => String(x.Nom_Compte) === s.client);
    if (c) { s.compteId = c.ID_Compte || ''; s.region = c.Ville || ''; if (!s.contact && c.Contact_Nom) { s.contact = c.Contact_Nom; const ci = el.querySelector('#st-form input[oninput*="\'contact\'"]'); if (ci) ci.value = s.contact; } }
    else { s.compteId = ''; s.region = ''; }
    planifier();
  }

  // ── Sortie : impression et PDF téléchargé ──
  function imprimer() {
    const f = el && el.querySelector('#st-iframe'); if (!f) return;
    try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { if (window.Toast) Toast.afficher('Impression indisponible sur cet appareil, utilisez « Télécharger le PDF »', 'erreur'); }
  }
  function script(src) { return new Promise((ok, ko) => { const t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = () => ko(new Error('bibliothèque PDF indisponible')); document.head.appendChild(t); }); }
  function chargerLibs() {
    if (!libs) libs = (window.html2canvas ? Promise.resolve() : script('/lib/pdfgen/html2canvas.min.js')).then(() => (window.jspdf ? null : script('/lib/pdfgen/jspdf.umd.min.js'))).catch(e => { libs = null; throw e; });
    return libs;
  }
  async function telecharger() {
    if (!el || !s) return;
    const b = el.querySelector('#st-dl'), lib0 = b.textContent; b.disabled = true; b.textContent = 'Création du PDF…';
    let cadre = null;
    try {
      await chargerLibs();
      if (window.LIVRABLES_POLICE_CHARGER) await window.LIVRABLES_POLICE_CHARGER();
      cadre = document.createElement('iframe'); cadre.setAttribute('sandbox', 'allow-same-origin'); cadre.setAttribute('aria-hidden', 'true');
      cadre.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + LARGEUR + 'px;height:800px;border:0;visibility:hidden';
      document.body.appendChild(cadre);
      await new Promise(ok => { cadre.onload = ok; cadre.srcdoc = documentHtml(); });
      const d = cadre.contentDocument;
      d.head.insertAdjacentHTML('beforeend', '<style>.page{margin:0!important}html,body{background:#EEF0F1!important}</style>');
      await Promise.all([...d.images].map(i => i.complete ? null : new Promise(ok => { i.onload = i.onerror = ok; })));
      if (d.fonts && d.fonts.load) { try { await Promise.all(['400','500','600','700','800'].map(w => d.fonts.load(w + ' 12px Montserrat'))); } catch (e) { /* repli police système */ } }
      if (d.fonts && d.fonts.ready) { try { await d.fonts.ready; } catch (e) { /* polices système */ } }
      const page = d.querySelector('.page');
      const canvas = await window.html2canvas(page, { scale: 2, useCORS: true, backgroundColor: '#EEF0F1', logging: false, windowWidth: LARGEUR, windowHeight: 800 });
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
      const T = window.LivrablesPDF.TYPES[s.type];
      const nom = (T.lib + (s.client ? ' ' + s.client : '') + ' ' + (s.dateEmission || jour())).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
      pdf.save(nom + '.pdf');
      tracer(T);
      if (window.Toast) Toast.afficher('PDF téléchargé', 'succes', 3000);
    } catch (e) { if (window.Toast) Toast.afficher('PDF impossible : ' + ((e && e.message) || e) + '. Essayez « Imprimer ».', 'erreur', 6000); }
    finally { if (cadre) cadre.remove(); if (b) { b.disabled = false; b.textContent = lib0; } }
  }
  // Document créé pour un compte : inscrit au journal (Type_Action « Devis »), base de l'alerte « devis sans suite ».
  async function tracer(T) {
    if (!s || !s.compteId || !window.SheetsAPI || Session.estExterne()) return; // le fournisseur de leads n'écrit pas au journal des comptes
    try {
      await SheetsAPI.ecrire('EMPOWER_MDB', 'ACTIONS', {
        ID_Action: genId('DEV'), Date_Action: new Date().toISOString(), Type_Action: 'Devis', Source: 'ESI', PIN_CDS: Session.pin, Nom_Compte: s.client,
        Statut_Avant: '', Statut_Apres: '', Resum_IA: T.lib + ' (Studio)' + (s.type !== 'cotation' && s.validite ? ', valable jusqu\'au ' + s.validite : ''), GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });
    } catch (e) { /* trace non bloquante */ }
  }

  return { peut, ouvrir, fermer, onglet, zoomer, maj, majSig, majLigne, majOffre, changerType, choisirCompte, imprimer, telecharger, _cfg: () => (s ? cfg() : null), TYPES };
})();
