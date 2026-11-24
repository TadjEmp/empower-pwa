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
  const TYPES = ['cotation_grossiste', 'cotation_empower', 'offre21', 'offre11', 'bundle'];
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

  // ── Les 5 documents proposés (type d'interface → modèle de rendu de livrables-pdf.js) ──
  const CHOIX = [
    ['cotation_grossiste', 'Cotation Grossiste', 'Prix d\'achat Tech Data / Ingram, dégressifs par palier'],
    ['cotation_empower', 'Cotation Empower', 'Prix d\'achat Empower, dégressifs par palier'],
    ['offre21', 'Offre 2+1', '2 achetées, 1 offerte, dès un palier'],
    ['offre11', 'Offre 1+1', '1 achetée, 1 offerte, dès un palier'],
    ['bundle', 'Bundle', 'Un produit offert avec l\'achat d\'un autre'],
  ];
  const PDF = { cotation_grossiste: 'cotation', cotation_empower: 'cotation_empower', offre21: 'offre21', offre11: 'offre11', bundle: 'bundle' };
  const ALIAS = { cotation: 'cotation_grossiste', bienvenue: 'offre21', exceptionnelle: 'offre21', proposition: 'offre21', supplementaire: 'offre21' };
  // Paliers par défaut : 2+1 dès 10 licences, 1+1 dès 20 (30 pour Small Business) ; cotations -30 % dès 10, -50 % dès 25, -60 % dès 50 (sous réserve de validation).
  const PALIERS_COT = [[10, 30, false], [25, 50, false], [50, 60, true]];
  const estSB = id => /^nsb/.test(String(id || ''));

  function seuilDefaut(type, lignes) {
    const sb = (lignes || []).some(([id, q]) => id && q > 0 && estSB(id));
    return type === 'offre11' ? (sb ? 30 : 20) : 10;
  }

  function etat(type, compte) {
    const C = window.Catalogue, cot = C && C.cotationsActives ? (C.cotationsActives(jour())[0] || null) : null;
    const c = compte || {}, t = TYPES.includes(type) ? type : (ALIAS[type] || 'offre21');
    const lignes = [['n360-del5', 20], ['', 0], ['', 0]];
    return {
      type: t,
      client: c.Nom_Compte || '', contact: c.Contact_Nom || '', region: c.Ville || '', compteId: c.ID_Compte || '',
      dateEmission: jour(), validite: plus(30), conditions: '', titre: '',
      // cotations
      cotLib: t === 'cotation_empower' ? 'Cotation Empower' : (cot ? (cot.libelle || 'Cotation Norton 360') : 'Cotation Norton 360'),
      cotDebut: t !== 'cotation_empower' && cot ? cot.debut : jour(), cotFin: t !== 'cotation_empower' && cot ? cot.fin : plus(30),
      cotNonRecond: !!(cot && cot.non_reconductible && t !== 'cotation_empower'), cotTd: true, cotIngram: true,
      pal: PALIERS_COT.map(x => x.slice()),
      // offres X+1
      offertId: '', seuil: seuilDefaut(t, lignes), seuilManuel: false, lignes, grossiste: 'pa_td',
      // bundle
      canal: 'pa_empower', debut: jour(), op1: 'n360-del5', q1: 1, of1: 'util-wl10', nom1: '', pvp1: '', op2: '', q2: 1, of2: '', nom2: '', pvp2: '',
      sig: signature(),
    };
  }

  // ── Configuration envoyée au rendu ──
  function cfg() {
    const L = window.LivrablesPDF, C = window.Catalogue, num = v => Math.max(0, Number(String(v).replace(',', '.')) || 0);
    const type = PDF[s.type], isOffre = s.type === 'offre21' || s.type === 'offre11', X = s.type === 'offre11' ? 1 : 2;
    const pOff = s.offertId ? C.par(s.offertId) : null;
    const offre = !isOffre ? null
      : pOff ? { type: 'produit', par: X, produit: pOff.id, nom: pOff.nom + ' ' + pOff.appareils + ' appareil' + (pOff.appareils > 1 ? 's' : ''), pvp_ttc: null, appareils: pOff.appareils }
        : { type: 'xy', achetees: X, offertes: 1 };
    const opBundle = n => {
      const of = s['of' + n] ? C.par(s['of' + n]) : null;
      return { achete: [s['op' + n], Math.max(1, Math.floor(num(s['q' + n])) || 1)],
        offert: of ? { id: of.id, nom: of.nom + ' ' + of.appareils + ' app.', pvp_ttc: null, appareils: of.appareils } : { nom: s['nom' + n] || 'Produit offert', pvp_ttc: s['pvp' + n] === '' ? null : num(s['pvp' + n]) } };
    };
    const paliers = s.pal.filter(([sx, r]) => num(sx) > 0 && num(r) > 0).map(([sx, r, v]) => ({ seuil: Math.floor(num(sx)), remise_pct: num(r), validation: !!v }));
    const extra = s.type === 'bundle' ? { canal: s.canal, debut: s.debut, operations: [1, 2].filter(n => s['op' + n]).map(opBundle) }
      : s.type === 'cotation_grossiste' ? { cotation: { libelle: s.cotLib, debut: s.cotDebut, fin: s.cotFin, paliers, canaux: [s.cotTd ? 'td' : '', s.cotIngram ? 'ingram' : ''].filter(Boolean), non_reconductible: s.cotNonRecond }, date: s.cotDebut || undefined }
      : s.type === 'cotation_empower' ? { cotation: { libelle: s.cotLib, debut: s.cotDebut, fin: s.cotFin, paliers, canaux: ['empower'], non_reconductible: s.cotNonRecond }, date: s.cotDebut || undefined }
      : {};
    return Object.assign({ date: s.dateEmission || jour() }, extra, {
      type, titre: s.titre.trim(), conditions: s.conditions.trim(), offre, grossiste: s.grossiste, volume: false,
      palier: isOffre ? { seuil: Math.max(1, Math.floor(num(s.seuil)) || 1) } : null,
      lignes: s.lignes.filter(([id, q]) => id && q > 0), validite: s.type.indexOf('cotation') === 0 ? '' : s.validite,
      client: { nom: s.client.trim(), contact: s.contact.trim(), region: s.region },
      emetteur: { nom: s.sig.nom, role: s.sig.role, tel: s.sig.tel, mail: s.sig.mail },
    });
  }
  function documentHtml() {
    try { return window.LivrablesPDF.html(cfg()); }
    catch (e) { return '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">Aperçu indisponible : ' + esc((e && e.message) || e) + '</body>'; }
  }

  // ── Calcul en direct (sous le formulaire) : licences offertes, palier, marge avec et sans l'offre ──
  const e2 = n => (Math.round(Number(n) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  function calcHtml() {
    if (!s) return '';
    try {
      const L = window.LivrablesPDF, C = window.Catalogue, c = cfg();
      if (s.type === 'offre21' || s.type === 'offre11') {
        const R = L.calculer(c), e = R.e, p = R.palier;
        const offertes = e.detail.reduce((n, d) => n + (d.offertes || 0), 0);
        const sans = C.calculer(c.lignes, 'pa_empower', { date: c.date });
        if (!c.lignes.length) return '<p class="st-m">Choisissez un produit et une quantité pour voir le calcul.</p>';
        const X = s.type === 'offre11' ? 1 : 2, reste = X - (p.total % X);
        const statut = p.atteint ? `<b class="ok">Palier atteint</b> (${p.total} ≥ ${p.seuil})` : `<b class="ko">Palier non atteint</b> : encore ${p.reste} licence${p.reste > 1 ? 's' : ''} pour déclencher l'offre`;
        return `<div class="st-calc"><div class="st-t">Calcul automatique</div>
          <div class="st-k"><span>Licences commandées</span><b>${p.total}</b></div>
          <div class="st-k"><span>Palier</span><span>${statut}</span></div>
          <div class="st-k"><span>Licences offertes</span><b>${p.atteint ? offertes : 0}</b></div>
          ${p.atteint && offertes && (c.lignes.length === 1 || s.offertId) ? `<div class="st-k"><span>Pour 1 offerte de plus</span><span>encore ${reste === X ? X : reste} licence${(reste === X ? X : reste) > 1 ? 's' : ''}</span></div>` : ''}
          <div class="st-k"><span>Licences revendues</span><b>${e.licences}</b></div>
          <div class="st-k"><span>Prix d'achat Empower</span><b>${e2(e.cout)} HT</b></div>
          <div class="st-k"><span>Marge avec l'offre</span><b>${e2(e.marge)} (${e.pct} %)</b></div>
          <div class="st-k"><span>Marge sans l'offre</span><span>${e2(sans.marge)} (${sans.pct} %)</span></div>
          ${e.manquants && e.manquants.length ? `<p class="st-m">Non chiffré : ${esc(e.manquants.join(', '))}.</p>` : ''}</div>`;
      }
      if (s.type === 'bundle') {
        const B = L.calculerBundle(c);
        if (!B.ops.length) return '<p class="st-m">Choisissez un produit acheté.</p>';
        return `<div class="st-calc"><div class="st-t">Calcul automatique</div>` + B.ops.map((o, i) => o.ok
          ? `<div class="st-k"><span>Opération ${i + 1} : achat</span><b>${e2(o.av.cout)} HT</b></div><div class="st-k"><span>Marge avec le produit offert</span><b>${o.offertOk ? e2(o.av.marge) + ' (' + o.av.pct + ' %)' : 'PVP offert à renseigner'}</b></div><div class="st-k"><span>Marge sans</span><span>${e2(o.std.marge)} (${o.std.pct} %)</span></div>`
          : `<p class="st-m">Opération ${i + 1} : prix d'achat non renseigné pour ce produit.</p>`).join('') + '</div>';
      }
    } catch (e) { return ''; }
    return '';
  }
  function majCalc() { const z = el && el.querySelector('#st-calc'); if (z) z.innerHTML = calcHtml(); }

  // ── Interface ──
  function champ(lib, html) { return `<label class="st-c"><span>${esc(lib)}</span>${html}</label>`; }
  function inp(cle, type, extra) { return `<input type="${type || 'text'}" ${extra || ''} value="${esc(s[cle])}" oninput="Studio.maj('${cle}',this.value)"/>`; }
  function sigInp(cle) { return `<input type="${cle === 'mail' ? 'email' : 'text'}" value="${esc(s.sig[cle])}" oninput="Studio.majSig('${cle}',this.value)"/>`; }

  function formulaire() {
    const C = window.Catalogue;
    const prods = (sel, vide) => `<option value="">${vide || 'Aucun produit'}</option>` + C.listeProduits().map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(C.libelle(p))}</option>`).join('');
    const cartes = `<div class="st-cartes" role="radiogroup" aria-label="Type de document">${CHOIX.map(([k, l, d]) => `<button type="button" role="radio" aria-checked="${s.type === k}" class="st-carte${s.type === k ? ' on' : ''}" onclick="Studio.changerType('${k}')"><b>${esc(l)}</b><span>${esc(d)}</span></button>`).join('')}</div>`;
    let spec = '';
    if (s.type === 'cotation_grossiste' || s.type === 'cotation_empower') {
      const gro = s.type === 'cotation_grossiste';
      const pal = s.pal.map(([sx, r, v], i) => `<div class="st-lg st-pal"><label class="st-c"><span>Palier ${i + 1} : dès (licences)</span><input type="number" min="1" inputmode="numeric" value="${esc(sx)}" oninput="Studio.majPalier(${i},0,this.value)"/></label><label class="st-c"><span>Remise (%)</span><input type="number" min="1" max="90" step="0.5" inputmode="decimal" value="${esc(r)}" oninput="Studio.majPalier(${i},1,this.value)"/></label></div>${v ? '<p class="st-m">Palier signalé « sous réserve de validation » sur le document.</p>' : ''}`).join('');
      spec = `<div class="st-g"><div class="st-t">${gro ? 'Cotation Grossiste' : 'Cotation Empower'}</div>${champ('Nom de la cotation', inp('cotLib'))}
        <div class="st-2">${champ('Début', inp('cotDebut', 'date'))}${champ('Fin', inp('cotFin', 'date'))}</div>
        ${gro ? `<div class="st-t">Distributeurs</div><label class="st-o"><input type="checkbox" ${s.cotTd ? 'checked' : ''} onchange="Studio.maj('cotTd',this.checked)"/> Tech Data</label><label class="st-o"><input type="checkbox" ${s.cotIngram ? 'checked' : ''} onchange="Studio.maj('cotIngram',this.checked)"/> Ingram Micro</label>` : ''}
        <label class="st-o"><input type="checkbox" ${s.cotNonRecond ? 'checked' : ''} onchange="Studio.maj('cotNonRecond',this.checked)"/> Opération non reconductible</label></div>
        <div class="st-g"><div class="st-t">Paliers dégressifs</div>${pal}<p class="st-m">Le prix d'achat baisse selon le nombre de licences commandées. Tous les prix et marges se recalculent depuis les prix d'achat ${gro ? 'des grossistes' : 'Empower'} du catalogue. Le palier -60 % passe sous certains prix Empower : il est signalé « sous réserve de validation ».</p></div>`;
    } else if (s.type === 'bundle') {
      const canaux = [['pa_empower', 'Empower'], ['pa_td', 'Tech Data'], ['pa_ingram', 'Ingram Micro']].map(([k, l]) => `<option value="${k}" ${s.canal === k ? 'selected' : ''}>${l}</option>`).join('');
      const op = n => `<div class="st-t">Opération ${n}${n === 2 ? ' (facultative)' : ''}</div>
        <div class="st-lg"><select aria-label="Produit acheté ${n}" onchange="Studio.maj('op${n}',this.value)">${prods(s['op' + n])}</select><input type="number" min="1" inputmode="numeric" aria-label="Quantité ${n}" value="${s['q' + n]}" oninput="Studio.maj('q${n}',this.value)"/></div>
        ${champ('Produit offert', `<select onchange="Studio.changerOffert(${n},this.value)">${prods(s['of' + n], 'Autre produit (saisie libre)')}</select>`)}
        ${!s['of' + n] ? `<div class="st-2">${champ('Nom du produit offert', inp('nom' + n))}${champ('PVP TTC (€)', inp('pvp' + n, 'number', 'min="0" step="0.01" inputmode="decimal"'))}</div>` : ''}`;
      spec = `<div class="st-g"><div class="st-t">Bundle</div>${champ('Prix d\'achat', `<select onchange="Studio.maj('canal',this.value)">${canaux}</select>`)}${champ('Début de l\'opération', inp('debut', 'date'))}${op(1)}${op(2)}</div>`;
    } else {
      const X = s.type === 'offre11' ? 1 : 2;
      const lignes = s.lignes.map(([id, q], i) => `<div class="st-lg"><select aria-label="Produit ${i + 1}" onchange="Studio.majLigne(${i},'id',this.value)">${prods(id)}</select><input type="number" min="0" max="9999" inputmode="numeric" aria-label="Quantité ${i + 1}" value="${q}" oninput="Studio.majLigne(${i},'q',this.value)"/></div>`).join('');
      spec = `<div class="st-g"><div class="st-t">${X}+1 : produits achetés</div>${lignes}
        ${champ('Licence offerte', `<select onchange="Studio.maj('offertId',this.value)">${prods(s.offertId, 'La même licence que celle achetée')}</select>`)}
        ${champ('Palier : offre valable dès (licences commandées)', `<input type="number" id="st-seuil" min="1" inputmode="numeric" value="${esc(s.seuil)}" oninput="Studio.majSeuil(this.value)"/>`)}
        ${champ('Comparé à', `<select onchange="Studio.maj('grossiste',this.value)"><option value="pa_td" ${s.grossiste === 'pa_td' ? 'selected' : ''}>Tech Data</option><option value="pa_ingram" ${s.grossiste === 'pa_ingram' ? 'selected' : ''}>Ingram Micro</option></select>`)}
        <p class="st-m">Le nombre de licences offertes se calcule tout seul : une offerte pour chaque tranche de ${X} acheté${X > 1 ? 'es' : 'e'}, une fois le palier atteint. Palier par défaut : 2+1 dès 10 licences, 1+1 dès 20 (30 pour Small Business).</p></div>`;
    }
    const perso = `<details class="st-g st-det"><summary class="st-t">Personnalisation du document</summary>
      <div class="st-t">Destinataire (facultatif)</div>
        ${champ('Société', `<input type="text" list="st-comptes" value="${esc(s.client)}" oninput="Studio.choisirCompte(this.value)" autocomplete="off"/><datalist id="st-comptes">${comptes.slice(0, 400).map(c => `<option value="${esc(c.Nom_Compte)}"></option>`).join('')}</datalist>`)}
        ${champ('Contact', inp('contact'))}
      <div class="st-t">Dates</div><div class="st-2">${champ('Établi le', inp('dateEmission', 'date'))}${s.type.indexOf('cotation') === 0 ? '' : champ('Valable jusqu\'au', inp('validite', 'date'))}</div>
      <div class="st-t">Signature du commercial</div>
        ${champ('Nom', sigInp('nom'))}${champ('Fonction', sigInp('role'))}<div class="st-2">${champ('Téléphone', sigInp('tel'))}${champ('E-mail', sigInp('mail'))}</div>
      <div class="st-t">Texte</div>${champ('Titre (facultatif)', inp('titre'))}${champ('Conditions particulières (facultatif)', inp('conditions'))}</details>`;
    return `<div class="st-g"><div class="st-t">Document</div>${cartes}</div>${spec}<div id="st-calc">${calcHtml()}</div>${perso}`;
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
    majCalc();
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
  function majLigne(i, k, v) {
    if (!s) return; if (k === 'id') s.lignes[i][0] = v; else s.lignes[i][1] = Math.max(0, Math.min(9999, Math.floor(Number(v) || 0))); if (k === 'id' && v && !s.lignes[i][1]) s.lignes[i][1] = 1;
    if (!s.seuilManuel && (s.type === 'offre21' || s.type === 'offre11')) { s.seuil = seuilDefaut(s.type, s.lignes); const z = el && el.querySelector('#st-seuil'); if (z) z.value = s.seuil; }
    planifier();
  }
  function majPalier(i, k, v) { if (!s || !s.pal[i]) return; s.pal[i][k] = String(v).slice(0, 6); planifier(); }
  function majSeuil(v) { if (!s) return; s.seuil = String(v).slice(0, 5); s.seuilManuel = true; planifier(); }
  function changerOffert(n, v) { if (!s) return; s['of' + n] = v; rempl(); }
  function changerType(t) { t = ALIAS[t] || t; if (!TYPES.includes(t)) return; const garde = { client: s.client, contact: s.contact, region: s.region, compteId: s.compteId, sig: s.sig, dateEmission: s.dateEmission, titre: '' }; s = Object.assign(etat(t), garde); rempl(); }
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
      const T = window.LivrablesPDF.TYPES[PDF[s.type]];
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

  return { peut, ouvrir, fermer, onglet, zoomer, maj, majSig, majLigne, changerType, majPalier, majSeuil, changerOffert, choisirCompte, imprimer, telecharger, _cfg: () => (s ? cfg() : null), TYPES };
})();
