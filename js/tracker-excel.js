// ═══════════════════════════════════════════════════════════════════════
//  tracker-excel.js : export et import Excel du Tracker (EXTERNE, CHANNEL_MANAGER, ADMIN)
//  Un seul fichier fait l'aller-retour : l'onglet « Leads » est à la fois l'export et le modèle d'import.
//  - Export : onglets au choix (Synthèse, Leads, À relancer, Aide), ExcelJS chargé à la demande (styles, charte Marvesting).
//  - Import : lecture du même fichier (SheetJS déjà chargé), contrôle ligne par ligne, prévisualisation, puis injection en lot.
//  Les colonnes de suivi (statut, dates d'avancement...) sont en lecture seule : l'import ne les modifie jamais.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  const EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  const MAX_LIGNES = 500;
  const LOT = 100;
  const KEY_ONGLETS = 'esi_tracker_excel_onglets';
  const C = { ardoise: 'FF343F48', ardoise2: 'FF4A5660', fond: 'FFE4E6E8', carte: 'FFEEF0F1', gris: 'FFF3F4F5', texteGris: 'FF6B7680', corail: 'FFFF6D68', blanc: 'FFFFFFFF' };
  const PASTILLES = { SAISIE: 'FFD9DEE3', ASSIGNE: 'FFDCE6F2', EN_COURS: 'FFF6E7C8', COMPTE_CREE: 'FFE6DCF2', INTEGRE: 'FFD4EBDD', ARCHIVE: 'FFE4E6E8' };
  const FONT = 'Montserrat';
  const POTENTIELS = ['Fort', 'Moyen', 'Faible'];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cle = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const VP = () => window.VuePipeline;
  const toDate = v => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
  const jourFr = d => d ? d.toLocaleDateString('fr-FR') : '';

  const etat = { ouvert: false, onglet: 'export', onglets: { synthese: true, leads: true, relancer: true, aide: true }, portee: 'ecran', import: null, enCours: false };
  try { const s = JSON.parse(localStorage.getItem(KEY_ONGLETS) || 'null'); if (s && typeof s === 'object') Object.assign(etat.onglets, s); } catch (e) { /* mémoire locale indisponible */ }

  // ── Droits et périmètre ────────────────────────────────────────────
  function autorise() { return !!(window.Session && (Session.estExterne() || Session.estChannel() || Session.estManager())); }
  function estExt() { return !!(window.Session && Session.estExterne()); }
  function leadsPerimetre() {
    const v = VP(); let l = (v && v.state && v.state.leads) || [];
    return l;
  }
  function leadsExport() {
    const v = VP(); const base = leadsPerimetre();
    if (etat.portee === 'tout') return base;
    const ids = new Set(v.leadsFiltres.map(x => String(x.ID_Prospect)));
    return base.filter(x => ids.has(String(x.ID_Prospect)));
  }
  function descriptionFiltres() {
    const s = VP().state, p = [];
    if (s.recherche) p.push('recherche « ' + s.recherche + ' »');
    if (s.filtreStatut !== 'TOUS') p.push('statut ' + ((VP().STATUTS.find(x => x.id === s.filtreStatut) || {}).lbl || s.filtreStatut));
    if (s.filtreCDS !== 'TOUS') p.push('commercial ' + VP()._nomCDS(s.filtreCDS));
    if (s.filtrePotentiel !== 'TOUS') p.push('potentiel ' + s.filtrePotentiel);
    if (s.filtreOrigine !== 'TOUS') p.push('origine ' + s.filtreOrigine);
    if (s.filtreChannel !== 'TOUS') p.push('canal ' + s.filtreChannel);
    if (s.filtreAlerte !== 'TOUS') p.push('alerte ' + s.filtreAlerte);
    return p.length ? p.join(', ') : 'aucun filtre';
  }

  // ── Colonnes du fichier (ordre = ordre de remplissage du formulaire) ──
  // lecture : la colonne est en lecture seule (ignorée à l'import). admin : lue à l'import pour ADMIN / CHANNEL_MANAGER seulement.
  const BLOCS = [
    { titre: 'Référence', cols: [
      { id: 'ref', lib: 'Réf. ESI', larg: 16, lecture: true, val: l => String(l.ID_Prospect || '') } ] },
    { titre: 'Compte', cols: [
      { id: 'nom', lib: 'Nom du compte', requis: true, larg: 34, val: l => l.Nom_Compte },
      { id: 'adresse', lib: 'Adresse', larg: 34, val: l => l.Adresse },
      { id: 'cp', lib: 'Code postal', larg: 12, texte: true, val: l => l.Code_Postal },
      { id: 'ville', lib: 'Ville', larg: 20, val: l => l.Ville },
      { id: 'dep', lib: 'Département', larg: 13, lecture: true, texte: true, val: l => l.Departement || depDe(l.Code_Postal) } ] },
    { titre: 'Contact', cols: [
      { id: 'contact', lib: 'Nom du contact', larg: 22, val: l => l.CONTACT_NOM },
      { id: 'fonction', lib: 'Fonction', larg: 18, val: l => l.CONTACT_FONCTION },
      { id: 'tel', lib: 'Téléphone', larg: 16, texte: true, val: l => l.Tel },
      { id: 'email', lib: 'Email', larg: 28, val: l => l.Email } ] },
    { titre: 'Qualification', cols: [
      { id: 'canal', lib: 'Canal', larg: 13, liste: () => (window.Canaux ? Canaux.LISTE : ['Grossiste', 'Empower']), val: l => l.CANAL },
      { id: 'potentiel', lib: 'Potentiel', larg: 12, liste: () => POTENTIELS, val: l => l.POTENTIEL },
      { id: 'origine', lib: 'Origine', larg: 16, val: l => l.ORIGINE },
      { id: 'note', lib: 'Note initiale', larg: 40, val: l => l.Note_initiale } ] },
    { titre: 'Suivi', cols: [
      { id: 'statut', lib: 'Statut', larg: 14, lecture: true, admin: true, val: l => libStatut(l._statut) },
      { id: 'commercial', lib: 'Commercial assigné', larg: 20, lecture: true, admin: true, val: l => l.PIN_CDS_Assigne ? VP()._nomCDS(l.PIN_CDS_Assigne) : '' },
      { id: 'saisie', lib: 'Date de saisie', larg: 14, date: true, lecture: true, val: l => toDate(l.Date_Import || l.Timestamp) },
      { id: 'attribution', lib: "Date d'attribution", larg: 16, date: true, lecture: true, val: l => toDate(l.Date_Attribution) },
      { id: 'prochaine', lib: 'Prochaine action', larg: 16, date: true, val: l => toDate(l.Date_prochaine_action) },
      { id: 'derniere', lib: 'Dernière action', larg: 15, date: true, lecture: true, val: l => toDate(l.Date_Derniere_Action) },
      { id: 'typeaction', lib: "Type d'action", larg: 16, lecture: true, val: l => l.Type_Derniere_Action },
      { id: 'contacte', lib: 'Contacté', larg: 11, lecture: true, val: l => VP()._contacte(l).oui ? 'Oui' : 'Non' } ] },
    { titre: 'Avancement', cols: [
      { id: 'creation', lib: 'Compte créé le', larg: 15, date: true, lecture: true, val: l => toDate(l.Date_Creation_Compte) },
      { id: 'wp', lib: 'Welcome Pack envoyé le', larg: 20, date: true, lecture: true, val: l => toDate(l.Welcome_Pack_Date) },
      { id: 'integre', lib: 'Intégré le', larg: 13, date: true, lecture: true, val: l => toDate(l.Date_Integration) },
      { id: 'archive', lib: 'Archivé le', larg: 13, date: true, lecture: true, val: l => toDate(l.Date_Archive) },
      { id: 'motif', lib: "Motif d'archivage", larg: 24, lecture: true, val: l => l.Motif_Archive } ] },
    { titre: 'Résultat', cols: [
      { id: 'commande', lib: 'A commandé', larg: 13, lecture: true, val: l => l.Commande_Manuelle || l._activationSellIn ? 'Oui' : (l._activationSellInFlou ? 'Probable' : '') } ] },
  ];
  const COLS = BLOCS.flatMap(b => b.cols.map(c => Object.assign({ bloc: b.titre }, c)));

  function depDe(cp) { const s = String(cp || '').replace(/\D/g, '').padStart(5, '0'); if (s.length !== 5 || s === '00000') return ''; return s.startsWith('97') || s.startsWith('98') ? s.slice(0, 3) : s.slice(0, 2); }
  function libStatut(id) { const s = VP().STATUTS.find(x => x.id === id); return s ? s.lbl.trim() : String(id || ''); }

  // ── Chargement d'ExcelJS à la demande ──────────────────────────────
  let promesseLib = null;
  function chargerExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!promesseLib) promesseLib = new Promise((ok, ko) => {
      const s = document.createElement('script'); s.src = EXCELJS; s.async = true;
      s.onload = () => window.ExcelJS ? ok(window.ExcelJS) : ko(new Error('ExcelJS indisponible'));
      s.onerror = () => { promesseLib = null; ko(new Error('Impossible de charger la bibliothèque Excel (connexion requise)')); };
      document.head.appendChild(s);
    });
    return promesseLib;
  }

  // ── Construction du classeur ───────────────────────────────────────
  function style(cell, o) {
    if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
    cell.font = { name: FONT, size: o.size || 10, bold: !!o.bold, italic: !!o.italic, color: { argb: o.color || C.ardoise } };
    cell.alignment = { vertical: 'middle', horizontal: o.h || 'left', wrapText: !!o.wrap };
    if (o.border !== false) cell.border = { bottom: { style: 'thin', color: { argb: 'FFD2D6DA' } } };
  }

  function feuilleSynthese(wb, leads) {
    const ws = wb.addWorksheet('Synthèse', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.ardoise } } });
    ws.columns = [{ width: 34 }, { width: 14 }, { width: 14 }, { width: 4 }, { width: 38 }, { width: 14 }];
    ws.mergeCells('A1:F1'); const t = ws.getCell('A1'); t.value = 'Empower Tracker'; style(t, { fill: C.ardoise, color: C.blanc, bold: true, size: 18, border: false }); ws.getRow(1).height = 38;
    ws.mergeCells('A2:F2'); const u = ws.getCell('A2'); u.value = `Export du ${jourFr(new Date())} par ${Session.nom || 'utilisateur'}`; style(u, { fill: C.carte, size: 10, border: false });
    ws.mergeCells('A3:F3'); const p = ws.getCell('A3'); p.value = `Périmètre : ${etat.portee === 'tout' ? 'tous mes leads' : 'filtres de l\'écran (' + descriptionFiltres() + ')'}`; style(p, { fill: C.carte, size: 10, color: C.texteGris, border: false });
    for (let c = 1; c <= 6; c++) ws.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: C.corail } } };

    const total = leads.length;
    ['Statut', 'Leads', 'Part'].forEach((h, i) => { const c = ws.getCell(5, i + 1); c.value = h; style(c, { fill: C.ardoise, color: C.blanc, bold: true, h: i ? 'center' : 'left' }); });
    VP().STATUTS.forEach((s, i) => {
      const n = leads.filter(l => l._statut === s.id).length, r = 6 + i;
      const a = ws.getCell(r, 1); a.value = s.lbl.trim(); style(a, { fill: PASTILLES[s.id], bold: true });
      const b = ws.getCell(r, 2); b.value = n; style(b, { h: 'center', bold: true, size: 11 });
      const d = ws.getCell(r, 3); d.value = total ? n / total : 0; d.numFmt = '0%'; style(d, { h: 'center' });
    });
    const rt = 6 + VP().STATUTS.length;
    const ta = ws.getCell(rt, 1); ta.value = 'Total'; style(ta, { fill: C.carte, bold: true });
    const tb = ws.getCell(rt, 2); tb.value = total; style(tb, { fill: C.carte, bold: true, h: 'center', size: 11 });
    style(ws.getCell(rt, 3), { fill: C.carte });

    const contactes = leads.filter(l => VP()._contacte(l).oui).length;
    const integres = leads.filter(l => l._statut === 'INTEGRE').length;
    const limite = Date.now() - 30 * 86400000;
    const recents = leads.filter(l => { const d = toDate(l.Date_Import || l.Timestamp); return d && d.getTime() >= limite; }).length;
    const commandes = leads.filter(l => l.Commande_Manuelle || l._activationSellIn).length;
    ['Indicateur', 'Valeur'].forEach((h, i) => { const c = ws.getCell(5, 5 + i); c.value = h; style(c, { fill: C.ardoise, color: C.blanc, bold: true, h: i ? 'center' : 'left' }); });
    [['Leads saisis ces 30 derniers jours', recents], ['Leads contactés', contactes], ['Taux de contact', total ? contactes / total : 0, '0%'], ['Leads intégrés', integres], ['Taux de conversion (intégrés / total)', total ? integres / total : 0, '0%'], ['Leads ayant commandé', commandes]]
      .forEach((x, i) => { const a = ws.getCell(6 + i, 5); a.value = x[0]; style(a, { fill: i % 2 ? C.carte : C.blanc }); const b = ws.getCell(6 + i, 6); b.value = x[1]; if (x[2]) b.numFmt = x[2]; style(b, { fill: i % 2 ? C.carte : C.blanc, bold: true, h: 'center', size: 11 }); });
    return ws;
  }

  function feuilleLeads(wb, leads, modele) {
    const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2, showGridLines: false }], properties: { tabColor: { argb: C.corail } } });
    ws.columns = COLS.map(c => ({ width: c.larg }));
    let col = 1;
    BLOCS.forEach((b, i) => {
      const a = col, z = col + b.cols.length - 1;
      if (z > a) ws.mergeCells(1, a, 1, z);
      const c = ws.getCell(1, a); c.value = b.titre.toUpperCase(); style(c, { fill: i % 2 ? C.ardoise2 : C.ardoise, color: C.blanc, bold: true, size: 9, h: 'center', border: false });
      for (let k = a; k <= z; k++) ws.getCell(1, k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? C.ardoise2 : C.ardoise } };
      col = z + 1;
    });
    COLS.forEach((c, i) => {
      const h = ws.getCell(2, i + 1); h.value = c.lib + (c.requis ? ' *' : ''); style(h, { fill: C.ardoise, color: C.blanc, bold: true, wrap: true, border: false });
      if (c.lecture) h.font = { name: FONT, size: 10, bold: true, italic: true, color: { argb: 'FFC9CFD4' } };
    });
    ws.getRow(2).height = 32; ws.getRow(1).height = 20;

    const lignes = modele ? [] : leads;
    lignes.forEach((l, r) => {
      const row = 3 + r;
      COLS.forEach((c, i) => {
        const cell = ws.getCell(row, i + 1); let v = c.val(l);
        if (v === undefined || v === null) v = '';
        cell.value = c.texte ? String(v) : v;
        if (c.date) cell.numFmt = 'dd/mm/yyyy';
        if (c.texte) cell.numFmt = '@';
        const fond = c.id === 'statut' ? PASTILLES[l._statut] : (c.lecture ? C.gris : (r % 2 ? C.carte : C.blanc));
        style(cell, { fill: fond, color: c.lecture && c.id !== 'statut' ? C.texteGris : C.ardoise, bold: c.id === 'statut' || c.id === 'nom', h: c.id === 'contacte' || c.id === 'commande' || c.date ? 'center' : 'left' });
      });
    });
    const fin = modele ? 3 : 2 + Math.max(lignes.length, 1);
    if (modele) {
      const ex = ['', 'EXEMPLE SARL (à effacer)', '12 rue de la Paix', '69002', 'Lyon', '69', 'Jean Martin', 'Gérant', '0612345678', 'contact@exemple.fr', 'Grossiste', 'Moyen', '', 'Exemple de ligne : supprimez-la avant d\'importer'];
      ex.forEach((v, i) => { const cell = ws.getCell(3, i + 1); cell.value = v; if (COLS[i] && COLS[i].texte) cell.numFmt = '@'; style(cell, { fill: C.gris, color: C.texteGris, italic: true }); });
      for (let c = ex.length + 1; c <= COLS.length; c++) style(ws.getCell(3, c), { fill: C.gris });
    }
    // Listes déroulantes (Canal, Potentiel) sur les lignes du modèle ou de l'export, plus de la marge pour les nouvelles lignes
    const dernierRang = Math.max(fin, 2 + 60);
    COLS.forEach((c, i) => { if (!c.liste) return; for (let r = 3; r <= dernierRang; r++) ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: ['"' + c.liste().join(',') + '"'] }; });
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: Math.max(fin, 3), column: COLS.length } };
    return ws;
  }

  function motifsRelance(l) {
    const v = VP(), m = [];
    if (v._alerte45jSansContact(l)) m.push('Sans contact depuis plus de 45 jours');
    if (l.Date_prochaine_action && !['ARCHIVE', 'INTEGRE'].includes(l._statut) && toDate(l.Date_prochaine_action) && toDate(l.Date_prochaine_action).getTime() < Date.now() - 86400000) m.push('Action en retard');
    if (v._retardWelcomePack(l)) m.push('Welcome Pack à envoyer (J+14 dépassé)');
    try { if (v._alerte48h(l)) m.push('À rappeler sous 48 h'); } catch (e) { /* alerte non calculable */ }
    return m;
  }

  function feuilleRelancer(wb, leads) {
    const ws = wb.addWorksheet('À relancer', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }], properties: { tabColor: { argb: C.ardoise2 } } });
    const cols = [['Compte', 34], ['Contact', 22], ['Téléphone', 16], ['Email', 28], ['Statut', 14], ['Commercial', 18], ['Motif', 44], ['Échéance', 14]];
    ws.columns = cols.map(c => ({ width: c[1] }));
    cols.forEach((c, i) => { const h = ws.getCell(1, i + 1); h.value = c[0]; style(h, { fill: C.ardoise, color: C.blanc, bold: true, border: false }); });
    ws.getRow(1).height = 26;
    const rel = leads.map(l => ({ l, m: motifsRelance(l) })).filter(x => x.m.length)
      .sort((a, b) => (toDate(a.l.Date_prochaine_action) || new Date(8.64e15)) - (toDate(b.l.Date_prochaine_action) || new Date(8.64e15)));
    rel.forEach((x, i) => {
      const l = x.l, r = 2 + i, fond = i % 2 ? C.carte : C.blanc;
      const vals = [l.Nom_Compte, l.CONTACT_NOM, String(l.Tel || ''), l.Email, libStatut(l._statut), l.PIN_CDS_Assigne ? VP()._nomCDS(l.PIN_CDS_Assigne) : '', x.m.join(' · '), toDate(l.Date_prochaine_action)];
      vals.forEach((v, k) => { const c = ws.getCell(r, k + 1); c.value = v == null ? '' : v; if (k === 2) c.numFmt = '@'; if (k === 7) c.numFmt = 'dd/mm/yyyy'; style(c, { fill: k === 4 ? PASTILLES[l._statut] : fond, bold: k === 0, wrap: k === 6 }); });
    });
    if (!rel.length) { ws.mergeCells('A2:H2'); const c = ws.getCell('A2'); c.value = 'Aucun lead à relancer pour le moment.'; style(c, { fill: C.carte, italic: true, color: C.texteGris }); }
    else ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + rel.length, column: cols.length } };
    return ws;
  }

  function feuilleAide(wb) {
    const ws = wb.addWorksheet('Aide', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.texteGris } } });
    ws.columns = [{ width: 30 }, { width: 90 }];
    ws.mergeCells('A1:B1'); const t = ws.getCell('A1'); t.value = 'Importer des leads dans le Tracker'; style(t, { fill: C.ardoise, color: C.blanc, bold: true, size: 14, border: false }); ws.getRow(1).height = 32;
    const lignes = [
      ['Principe', 'Complétez l\'onglet « Leads » (une ligne par compte), puis importez le fichier depuis le Tracker : bouton « Excel », onglet « Importer ».'],
      ['Champ obligatoire', 'Nom du compte (colonne marquée *). Ville, code postal, contact, téléphone et email sont fortement recommandés pour que le commercial puisse appeler.'],
      ['Lignes existantes', 'Une ligne qui porte une « Réf. ESI » est déjà dans le Tracker : elle est ignorée. Laissez la colonne vide pour un nouveau lead.'],
      ['Colonnes grisées', 'Statut, dates d\'avancement, résultat : lecture seule, ignorées à l\'import. Seul un channel manager peut renseigner « Statut » et « Commercial assigné ».'],
      ['Canal', 'Grossiste ou Empower. Laissez vide si inconnu : le lead sera « à qualifier ».'],
      ['Potentiel', 'Fort (plus de 30 000 € par an), Moyen (10 à 30 k€) ou Faible (moins de 10 k€). Moyen par défaut.'],
      ['Code postal', '5 chiffres. Il sert à attribuer automatiquement le lead au chef de secteur. Les zéros du début sont rétablis.'],
      ['Téléphone', 'Format libre (06 12 34 56 78, +33 6 12 34 56 78). Au moins 9 chiffres.'],
      ['Prochaine action', 'Date au format JJ/MM/AAAA, facultative.'],
      ['Doublons', 'Un compte déjà présent (même nom et même code postal) est signalé avant l\'import. Vous décidez ligne par ligne.'],
      ['Limite', `${MAX_LIGNES} lignes par import. Au-delà, scindez le fichier.`],
    ];
    lignes.forEach((x, i) => { const a = ws.getCell(3 + i, 1), b = ws.getCell(3 + i, 2); a.value = x[0]; b.value = x[1]; style(a, { fill: C.carte, bold: true, wrap: true }); style(b, { wrap: true }); ws.getRow(3 + i).height = 34; });
    return ws;
  }

  function telecharger(buffer, nom) {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  async function exporter() {
    const o = etat.onglets;
    if (!Object.values(o).some(Boolean)) { Toast.afficher('Cochez au moins un onglet', 'warning'); return; }
    const leads = leadsExport();
    if ((o.leads || o.synthese || o.relancer) && !leads.length) { Toast.afficher('Aucun lead à exporter', 'warning'); return; }
    etat.enCours = true; rendre();
    try {
      try { localStorage.setItem(KEY_ONGLETS, JSON.stringify(o)); } catch (e) { /* mémoire locale indisponible */ }
      const XL = await chargerExcelJS();
      const wb = new XL.Workbook(); wb.creator = 'Empower Tracker'; wb.created = new Date();
      if (o.synthese) feuilleSynthese(wb, leads);
      if (o.leads) feuilleLeads(wb, leads, false);
      if (o.relancer) feuilleRelancer(wb, leads);
      if (o.aide) feuilleAide(wb);
      telecharger(await wb.xlsx.writeBuffer(), `Tracker_ESI_${stamp()}.xlsx`);
      Toast.afficher(`Export téléchargé (${leads.length} lead${leads.length > 1 ? 's' : ''})`, 'succes');
      etat.ouvert = false;
    } catch (e) { Toast.afficher('' + (e.message || e), 'erreur'); }
    etat.enCours = false; rendre();
  }

  async function modele() {
    etat.enCours = true; rendre();
    try {
      const XL = await chargerExcelJS();
      const wb = new XL.Workbook(); wb.creator = 'Empower Tracker';
      feuilleLeads(wb, [], true); feuilleAide(wb);
      telecharger(await wb.xlsx.writeBuffer(), 'Tracker_ESI_modele_import.xlsx');
    } catch (e) { Toast.afficher('' + (e.message || e), 'erreur'); }
    etat.enCours = false; rendre();
  }

  // ── Import : lecture et contrôle ───────────────────────────────────
  const mailOk = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  function normTel(s) {
    let t = String(s || '').trim(); if (!t) return { v: '' };
    t = t.replace(/^\+33\s*\(?0?\)?/, '0').replace(/^0033/, '0');
    const d = t.replace(/\D/g, '');
    if (d.length < 9 || d.length > 15) return { err: 'téléphone invalide' };
    return { v: d.length === 9 && !d.startsWith('0') ? '0' + d : d };
  }
  function parseDate(s) {
    const t = String(s || '').trim(); if (!t) return '';
    let m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    return null;
  }
  function pinCommercial(nom) {
    const k = cle(nom); if (!k) return null;
    const liste = (VP().CDS && VP().CDS.length ? VP().CDS : VP().CDS_FALLBACK) || [];
    const t = liste.find(c => cle(VP()._nomCDS(c.pin)) === k || cle(c.nom) === k || cle(VP()._nomCDS(c.pin)).startsWith(k));
    return t ? Number(t.pin) : null;
  }

  async function comptesExistants() {
    try { const r = await SheetsAPI.lire('EMPOWER_MDB', 'COMPTES'); return Array.isArray(r) ? r : []; } catch (e) { return []; }
  }

  async function analyser(fichier) {
    if (typeof XLSX === 'undefined') throw new Error('Bibliothèque Excel non chargée');
    const buf = await fichier.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const nomFeuille = wb.SheetNames.find(n => cle(n) === 'LEADS') || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { header: 1, raw: false, defval: '' });
    const hi = rows.findIndex((r, i) => i < 12 && r.some(c => cle(c) === 'NOMDUCOMPTE'));
    if (hi < 0) throw new Error('Colonne « Nom du compte » introuvable. Utilisez le modèle ou un export du Tracker.');
    const idx = {}; rows[hi].forEach((h, i) => { const k = cle(h); if (k && idx[k] === undefined) idx[k] = i; });
    const g = (r, lib) => { const i = idx[cle(lib)]; return i === undefined ? '' : String(r[i] == null ? '' : r[i]).trim(); };
    const brutes = rows.slice(hi + 1).map((r, i) => ({ r, ligne: hi + 2 + i })).filter(x => x.r.some(c => String(c).trim() !== ''));
    if (!brutes.length) throw new Error('Le fichier ne contient aucune ligne à importer.');
    if (brutes.length > MAX_LIGNES) throw new Error(`${brutes.length} lignes : la limite est de ${MAX_LIGNES} par import. Scindez le fichier.`);

    const v = VP(), admin = !estExt();
    const deja = new Map(); (v.state.leads || []).forEach(l => deja.set(cle(l.Nom_Compte) + '|' + String(l.Code_Postal || '').trim(), 'lead'));
    const comptes = await comptesExistants();
    const compteSet = new Map(); comptes.forEach(c => compteSet.set(cle(c.Nom_Compte || c.nom_compte) + '|' + String(c.Code_Postal || c.code_postal || '').trim(), 1));
    const vusFichier = new Set();
    const items = [];

    brutes.forEach(({ r, ligne }) => {
      const nom = g(r, 'Nom du compte'); const erreurs = [];
      if (cle(nom).startsWith('EXEMPLE') && cle(nom).endsWith('AEFFACER')) return;
      const ref = g(r, 'Réf. ESI');
      let cp = g(r, 'Code postal').replace(/\s/g, '');
      if (/^\d{4}$/.test(cp)) cp = '0' + cp;
      if (cp && !/^\d{5}$/.test(cp)) erreurs.push('code postal invalide');
      const tel = normTel(g(r, 'Téléphone')); if (tel.err) erreurs.push(tel.err);
      const email = g(r, 'Email'); if (email && !mailOk(email)) erreurs.push('email invalide');
      const canalBrut = g(r, 'Canal'); let canal = '';
      if (canalBrut) { canal = window.Canaux ? Canaux.normaliser(canalBrut) : canalBrut; if (!canal) erreurs.push('canal inconnu (Grossiste ou Empower)'); }
      const potBrut = g(r, 'Potentiel'); let potentiel = 'Moyen';
      if (potBrut) { const p = POTENTIELS.find(x => cle(x) === cle(potBrut)); if (p) potentiel = p; else erreurs.push('potentiel inconnu (Fort, Moyen ou Faible)'); }
      const prochaine = parseDate(g(r, 'Prochaine action')); if (prochaine === null) erreurs.push('date de prochaine action invalide');
      if (!nom) erreurs.push('nom du compte manquant');
      let statut = '', pin = null;
      if (admin) {
        const sl = g(r, 'Statut'); if (sl) { const s = v.STATUTS.find(x => cle(x.lbl) === cle(sl) || x.id === sl.toUpperCase()); if (s) statut = s.id; else erreurs.push('statut inconnu'); }
        const cn = g(r, 'Commercial assigné'); if (cn) { pin = pinCommercial(cn); if (!pin) erreurs.push('commercial inconnu'); }
      }
      let etatLigne = 'nouveau', info = '';
      if (ref) { etatLigne = 'existant'; info = 'Déjà dans le Tracker (Réf. ESI)'; }
      else if (erreurs.length) { etatLigne = 'erreur'; info = erreurs.join(', '); }
      else {
        const k = cle(nom) + '|' + cp;
        if (vusFichier.has(k)) { etatLigne = 'doublon'; info = 'Doublon dans le fichier'; }
        else if (deja.has(k)) { etatLigne = 'doublon'; info = 'Lead déjà au Tracker'; }
        else if (compteSet.has(k)) { etatLigne = 'doublon'; info = 'Compte déjà en base'; }
        vusFichier.add(k);
      }
      items.push({ ligne, etat: etatLigne, info, coche: etatLigne === 'nouveau', nom, cp, ville: g(r, 'Ville'), adresse: g(r, 'Adresse'),
        contact: g(r, 'Nom du contact'), fonction: g(r, 'Fonction'), tel: tel.v || '', email, canal, potentiel, prochaine: prochaine || '', note: g(r, 'Note initiale'),
        origine: g(r, 'Origine'), statut, pin });
    });
    if (!items.length) throw new Error('Aucune ligne exploitable (la ligne d\'exemple est ignorée).');
    return { fichier: fichier.name, feuille: nomFeuille, items, enCours: false, resultat: null };
  }

  async function choisirFichier(input) {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    etat.enCours = true; rendre();
    try { etat.import = await analyser(f); }
    catch (e) { etat.import = null; Toast.afficher('' + (e.message || e), 'erreur', 6000); }
    etat.enCours = false; rendre();
  }

  function basculer(i, valeur) { const it = etat.import && etat.import.items[i]; if (!it || it.etat === 'erreur' || it.etat === 'existant') return; it.coche = valeur; rendre(); }
  function tousNouveaux(v) { if (!etat.import) return; etat.import.items.forEach(it => { if (it.etat === 'nouveau') it.coche = v; }); rendre(); }

  // ── Import : injection en lot ──────────────────────────────────────
  async function injecter() {
    const imp = etat.import; if (!imp || imp.enCours) return;
    const choisis = imp.items.filter(it => it.coche && (it.etat === 'nouveau' || it.etat === 'doublon'));
    if (!choisis.length) { Toast.afficher('Aucune ligne sélectionnée', 'warning'); return; }
    if (!SheetsAPI._online) { Toast.afficher('Import impossible hors connexion', 'erreur'); return; }
    imp.enCours = true; imp.progress = 0; rendre();
    const v = VP(), ext = estExt();
    const prenom = String(Session.nom || '').trim().split(/\s+/)[0];
    try {
      const cache = {};   // une décision d'attribution par code postal
      const leads = [];
      for (const it of choisis) {
        let pin = it.pin, statut = it.statut || (pin ? 'ASSIGNE' : 'SAISIE');
        if (!pin && it.cp) {
          if (!(it.cp in cache)) cache[it.cp] = await AttributionCP.decider(it.cp);
          const d = cache[it.cp];
          if (d.resultat === 'ATTRIBUE' && d.pin) { pin = d.pin; if (!it.statut) statut = 'ASSIGNE'; }
        }
        leads.push({
          ID_Prospect: genId('PROS'), Nom_Compte: it.nom.toUpperCase(), Adresse: it.adresse, Ville: it.ville, Code_Postal: it.cp, Departement: depDe(it.cp),
          Tel: it.tel, Email: it.email, PIN_CDS_Assigne: pin ? Number(pin) : null, Source_Import: 'IMPORT_EXCEL',
          FLAG_ACTION: statut, CANAL: it.canal, Note_initiale: it.note, Date_prochaine_action: it.prochaine || null,
          Flag_traite: 'FALSE', Flag_converti: 'FALSE', Date_Import: dateISOLocale(), Timestamp: new Date().toISOString(),
          STATUT_EMPOWER: statut, POTENTIEL: it.potentiel,
          ORIGINE: ext ? prenom : (it.origine || 'Import Excel'), CONTACT_NOM: it.contact, CONTACT_FONCTION: it.fonction,
          PIN_Channel: Number(Session.pin), Nom_Channel: Session.nom || '',
        });
      }
      let crees = 0; const ids = [];
      for (let i = 0; i < leads.length; i += LOT) {
        const lot = leads.slice(i, i + LOT);
        const { error } = await SheetsAPI._sb.from('leads').insert(lot.map(l => SheetsAPI._toDBRow('leads', l)));
        if (error) throw new Error(`Lot ${Math.floor(i / LOT) + 1} refusé : ${error.message}. ${crees} lead(s) déjà créé(s).`);
        crees += lot.length; lot.forEach(l => ids.push(l.ID_Prospect)); imp.progress = crees; rendre();
      }
      try { await SheetsAPI._invalidate('leads'); } catch (e) { /* cache rafraîchi au prochain chargement */ }
      // Une seule alerte récapitulative par destinataire (le déclencheur par lead ignore les imports Excel)
      try { await SheetsAPI._sb.rpc('leads_import_alerte', { p_ids: ids }); } catch (e) { /* alerte non bloquante */ }
      imp.resultat = { crees, ignores: imp.items.length - choisis.length };
      imp.enCours = false; rendre();
      Toast.afficher(`${crees} lead${crees > 1 ? 's' : ''} importé${crees > 1 ? 's' : ''}`, 'succes');
      if (v && v.init) v.init();
    } catch (e) {
      imp.enCours = false; rendre(); Toast.afficher('' + (e.message || e), 'erreur', 8000);
    }
  }

  function rapportErreurs() {
    const imp = etat.import; if (!imp) return;
    const lignes = imp.items.filter(it => it.etat === 'erreur' || it.etat === 'doublon').map(it => [it.ligne, it.nom, it.cp, it.ville, it.etat === 'erreur' ? 'Erreur' : 'Doublon', it.info]);
    const ws = XLSX.utils.aoa_to_sheet([['Ligne du fichier', 'Compte', 'Code postal', 'Ville', 'Type', 'Détail'], ...lignes]);
    ws['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 50 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'À corriger');
    XLSX.writeFile(wb, `Tracker_ESI_import_a_corriger_${stamp()}.xlsx`);
  }

  // ── Fenêtre ────────────────────────────────────────────────────────
  const PUCE = { nouveau: ['Nouveau', '#D4EBDD'], doublon: ['Doublon', '#F6E7C8'], erreur: ['Erreur', '#E4E6E8'], existant: ['Existant', '#DCE6F2'] };
  function htmlExport() {
    const o = etat.onglets, n = leadsExport().length;
    const cases = [['synthese', 'Synthèse', 'Compteurs par statut, taux de contact et de conversion'], ['leads', 'Leads', 'Le tableau complet, qui sert aussi de modèle d\'import'], ['relancer', 'À relancer', 'Sans contact +45 jours, actions en retard, Welcome Pack dépassé'], ['aide', 'Aide à l\'import', 'Règles et valeurs autorisées']];
    const lbl = 'tout le Tracker';
    return `
      <div style="font-size:12px;font-weight:700;color:var(--c-text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Onglets à exporter</div>
      ${cases.map(c => `<label style="display:flex;flex-direction:row;gap:10px;align-items:flex-start;padding:10px 12px;margin-bottom:6px;background:var(--c-card,#EEF0F1);border-radius:14px;cursor:pointer">
        <input type="checkbox" ${o[c[0]] ? 'checked' : ''} onchange="TrackerExcel.coche('${c[0]}',this.checked)" style="margin:3px 0 0;width:auto;flex:none"/>
        <span><strong>${c[1]}</strong><br><span style="font-size:12px;color:var(--c-text-2)">${c[2]}</span></span></label>`).join('')}
      <div style="font-size:12px;font-weight:700;color:var(--c-text-2);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 8px">Périmètre</div>
      <label style="display:flex;flex-direction:row;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer"><input style="margin:0;width:auto;flex:none" type="radio" name="te-portee" ${etat.portee === 'ecran' ? 'checked' : ''} onchange="TrackerExcel.portee('ecran')"/> Filtres de l'écran (${esc(descriptionFiltres())})</label>
      <label style="display:flex;flex-direction:row;align-items:center;gap:8px;cursor:pointer"><input style="margin:0;width:auto;flex:none" type="radio" name="te-portee" ${etat.portee === 'tout' ? 'checked' : ''} onchange="TrackerExcel.portee('tout')"/> Tout : ${lbl}</label>
      <div style="margin:14px 0;padding:10px 12px;background:var(--c-card,#EEF0F1);border-radius:14px;font-size:13px"><strong>${n}</strong> lead${n > 1 ? 's' : ''} seront exportés</div>
      <div style="display:flex;gap:8px">
        <button class="btn-secondaire" style="flex:1" onclick="TrackerExcel.fermer()">Annuler</button>
        <button class="btn-primaire" style="flex:2" ${etat.enCours || !Object.values(o).some(Boolean) ? 'disabled' : ''} onclick="TrackerExcel.exporter()">${etat.enCours ? 'Génération...' : 'Télécharger'}</button>
      </div>
      <p style="font-size:11px;color:var(--c-text-2);margin:10px 0 0;text-align:center">Fichier généré sur votre appareil, aucune donnée envoyée au serveur.</p>`;
  }

  function htmlImport() {
    const imp = etat.import;
    if (!imp) return `
      <p style="margin:0 0 12px;font-size:13px;line-height:1.5">Importez le fichier Excel exporté du Tracker, ou le modèle, pour injecter plusieurs comptes d'un coup. Chaque ligne est contrôlée avant toute écriture.</p>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button class="btn-secondaire" style="flex:1" ${etat.enCours ? 'disabled' : ''} onclick="TrackerExcel.modele()">Télécharger le modèle vierge</button>
        <button class="btn-primaire" style="flex:1" ${etat.enCours ? 'disabled' : ''} onclick="document.getElementById('te-fichier').click()">${etat.enCours ? 'Lecture...' : 'Choisir un fichier'}</button>
      </div>
      <input type="file" id="te-fichier" accept=".xlsx,.xls,.csv" style="display:none" onchange="TrackerExcel.fichier(this)"/>
      <p style="font-size:11px;color:var(--c-text-2);margin:0">Maximum ${MAX_LIGNES} lignes par import. Les lignes déjà au Tracker (Réf. ESI renseignée) sont ignorées.</p>
      <div style="margin-top:14px"><button class="btn-secondaire" style="width:100%" onclick="TrackerExcel.fermer()">Fermer</button></div>`;
    if (imp.resultat) return `
      <div style="padding:16px;background:var(--c-card,#EEF0F1);border-radius:14px;text-align:center;margin-bottom:12px">
        <div style="font-size:28px;font-weight:700">${imp.resultat.crees}</div><div style="font-size:13px">lead${imp.resultat.crees > 1 ? 's' : ''} créé${imp.resultat.crees > 1 ? 's' : ''} dans le Tracker</div>
        <div style="font-size:12px;color:var(--c-text-2);margin-top:6px">${imp.resultat.ignores} ligne${imp.resultat.ignores > 1 ? 's' : ''} non importée${imp.resultat.ignores > 1 ? 's' : ''}. Une alerte récapitulative a été envoyée à l'équipe.</div></div>
      <div style="display:flex;gap:8px">${imp.resultat.ignores ? '<button class="btn-secondaire" style="flex:1" onclick="TrackerExcel.rapport()">Fichier à corriger</button>' : ''}<button class="btn-primaire" style="flex:1" onclick="TrackerExcel.fermer()">Terminé</button></div>`;
    const cnt = e => imp.items.filter(i => i.etat === e).length, sel = imp.items.filter(i => i.coche).length;
    return `
      <div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">${esc(imp.fichier)} · onglet « ${esc(imp.feuille)} » · ${imp.items.length} ligne${imp.items.length > 1 ? 's' : ''} lue${imp.items.length > 1 ? 's' : ''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${['nouveau', 'doublon', 'erreur', 'existant'].map(e => `<span style="padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${PUCE[e][1]}">${cnt(e)} ${PUCE[e][0].toLowerCase()}${cnt(e) > 1 && e !== 'existant' ? 's' : ''}</span>`).join('')}</div>
      <div style="max-height:46vh;overflow:auto;border-radius:14px;background:var(--c-card,#EEF0F1)">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="position:sticky;top:0;background:#343F48;color:#fff"><th style="color:#fff;padding:8px"></th><th style="color:#fff;padding:8px;text-align:left">Ligne</th><th style="color:#fff;padding:8px;text-align:left">Compte</th><th style="color:#fff;padding:8px;text-align:left">CP · Ville</th><th style="color:#fff;padding:8px;text-align:left">État</th></tr></thead>
          <tbody>${imp.items.map((it, i) => `<tr style="border-bottom:1px solid #D2D6DA">
            <td style="padding:6px 8px"><input style="width:auto;margin:0" type="checkbox" ${it.coche ? 'checked' : ''} ${it.etat === 'erreur' || it.etat === 'existant' ? 'disabled' : ''} onchange="TrackerExcel.basculer(${i},this.checked)"/></td>
            <td style="padding:6px 8px">${it.ligne}</td><td style="padding:6px 8px;font-weight:600">${esc(it.nom || '(vide)')}</td>
            <td style="padding:6px 8px">${esc((it.cp + ' ' + it.ville).trim())}</td>
            <td style="padding:6px 8px"><span style="padding:2px 8px;border-radius:999px;background:${PUCE[it.etat][1]};font-weight:600">${PUCE[it.etat][0]}</span>${it.info ? `<div style="color:var(--c-text-2);margin-top:2px">${esc(it.info)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <button class="btn-secondaire" style="flex:1" ${imp.enCours ? 'disabled' : ''} onclick="TrackerExcel.recommencer()">Changer de fichier</button>
        ${cnt('erreur') || cnt('doublon') ? '<button class="btn-secondaire" style="flex:1" onclick="TrackerExcel.rapport()">Fichier à corriger</button>' : ''}
        <button class="btn-primaire" style="flex:2" ${imp.enCours || !sel ? 'disabled' : ''} onclick="TrackerExcel.injecter()">${imp.enCours ? `Injection ${imp.progress || 0}/${sel}...` : `Injecter ${sel} lead${sel > 1 ? 's' : ''}`}</button>
      </div>`;
  }

  function rendre() {
    let ov = document.getElementById('te-overlay');
    if (!etat.ouvert) { if (ov) ov.remove(); return; }
    if (!ov) { ov = document.createElement('div'); ov.id = 'te-overlay'; ov.className = 'modal-overlay'; ov.onclick = e => { if (e.target === ov && !etat.enCours) fermer(); }; document.body.appendChild(ov); }
    const onglet = (id, lib) => `<button onclick="TrackerExcel.vue('${id}')" style="flex:1;padding:8px 12px;border:0;border-radius:999px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;background:${etat.onglet === id ? '#343F48' : 'transparent'};color:${etat.onglet === id ? '#fff' : '#343F48'}">${lib}</button>`;
    ov.innerHTML = `<div class="modal" style="max-width:640px;width:calc(100% - 24px)">
      <h3 style="margin:0 0 12px">Excel du Tracker</h3>
      <div style="display:flex;gap:4px;padding:4px;background:var(--c-card,#EEF0F1);border-radius:999px;margin-bottom:14px">${onglet('export', 'Exporter')}${onglet('import', 'Importer')}</div>
      ${etat.onglet === 'export' ? htmlExport() : htmlImport()}</div>`;
  }

  function ouvrir(onglet) {
    if (!autorise()) { Toast.afficher('Fonction non disponible pour ce profil', 'warning'); return; }
    etat.ouvert = true; etat.onglet = onglet === 'import' ? 'import' : 'export'; etat.import = null; etat.enCours = false; rendre();
  }
  function fermer() { etat.ouvert = false; etat.import = null; rendre(); }

  window.TrackerExcel = {
    ouvrir, fermer, exporter, modele, injecter, autorise,
    vue: id => { if (etat.enCours) return; etat.onglet = id; rendre(); },
    coche: (id, v) => { etat.onglets[id] = !!v; rendre(); },
    portee: p => { etat.portee = p; rendre(); },
    fichier: choisirFichier, basculer, tousNouveaux, rapport: rapportErreurs,
    recommencer: () => { etat.import = null; rendre(); },
    _analyser: analyser, _etat: () => etat,
  };
})();
