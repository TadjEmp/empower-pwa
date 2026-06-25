/* ============================================================
  PHONEOS × GOOGLE SHEETS — BACKEND API
  Google Apps Script — Code.gs
  Repo   : TadjEmp/empower-pwa
  Sheet  : 16wtW_0hV3zFAYPTZfwyJ1_5dFPJsuNgLDrcqt-OG-4A

  DÉPLOIEMENT :
  1. Ouvrir le Google Sheet
  2. Extensions → Apps Script → Coller ce fichier → Enregistrer
  3. Déployer → Nouveau déploiement
     Type : Application Web
     Exécuter en tant que : Moi
     Accès : Tout le monde (même anonyme)
  4. Copier l'URL → la coller dans js/phoneos-sheets.js
     const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/XXX/exec';
============================================================ */

const SHEET_ID = '16wtW_0hV3zFAYPTZfwyJ1_5dFPJsuNgLDrcqt-OG-4A';
const FY_TABS  = ['FY25', 'FY26', 'FY27'];

/* ============================================================
  LECTURE — doGet
============================================================ */
function doGet(e) {
  const action     = e.parameter.action     || 'getLeads';
  const fy         = e.parameter.fy         || 'FY27';
  const commercial = e.parameter.commercial || null;
  const codeClient = e.parameter.codeClient || null;

  try {
    if (action === 'getLeads')       return _json(getLeads(fy, commercial));
    if (action === 'getLead')        return _json(getLead(fy, codeClient));
    if (action === 'getKPIs')        return _json(getKPIs());
    if (action === 'getCommercials') return _json(getCommercials());
    if (action === 'getHeaders')     return _json(getHeaders(fy));
    return _json({ error: 'Action inconnue : ' + action });
  } catch(err) {
    return _json({ error: err.message });
  }
}

function getLeads(fy, commercial) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(fy);
  if (!sheet) return { error: `Onglet ${fy} introuvable` };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows    = data.slice(1);

  let leads = rows
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
      return obj;
    })
    .filter(r => r['Raison Sociale'] && String(r['Raison Sociale']).trim() !== '');

  if (commercial) {
    leads = leads.filter(r =>
      String(r['Commercial']).trim().toUpperCase() === commercial.trim().toUpperCase()
    );
  }

  return { fy, commercial: commercial || 'tous', total: leads.length, leads };
}

function getLead(fy, codeClient) {
  if (!codeClient) return { error: 'codeClient manquant' };
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(fy);
  if (!sheet) return { error: `Onglet ${fy} introuvable` };

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const colCC   = headers.indexOf('Code Client');
  const row     = data.find((r, i) => i > 0 && String(r[colCC]) === String(codeClient));
  if (!row) return { error: `Code Client ${codeClient} non trouvé dans ${fy}` };

  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return { fy, lead: obj };
}

function getKPIs() {
  const ss     = SpreadsheetApp.openById(SHEET_ID);
  const result = {};

  FY_TABS.forEach(fy => {
    const sheet = ss.getSheetByName(fy);
    if (!sheet) return;

    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows    = data.slice(1);

    let ca = 0, actifs = 0, inactifs = 0;
    const caCol = headers.indexOf('CA Déclaré') !== -1
      ? 'CA Déclaré'
      : `CA ${fy}`;

    rows.forEach(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      if (!obj['Raison Sociale'] || String(obj['Raison Sociale']).trim() === '') return;
      const val = parseFloat(String(obj[caCol]).replace(/[^0-9.,-]/g,'').replace(',','.')) || 0;
      ca += val;
      if (val > 0) actifs++; else inactifs++;
    });

    result[fy] = { ca: Math.round(ca), actifs, inactifs, total: actifs + inactifs };
  });

  return result;
}

function getCommercials() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('FY27') || ss.getSheets()[0];
  const data  = sheet.getDataRange().getValues();
  const colIdx = data[0].indexOf('Commercial');
  if (colIdx === -1) return { error: 'Colonne "Commercial" introuvable dans FY27' };

  const commercials = [...new Set(
    data.slice(1)
      .map(row => String(row[colIdx]).trim())
      .filter(v => v !== '' && v !== 'undefined')
  )].sort();

  return { commercials };
}

function getHeaders(fy) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(fy);
  if (!sheet) return { error: `Onglet ${fy} introuvable` };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return { fy, headers };
}

/* ============================================================
  ÉCRITURE — doPost
============================================================ */
function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch(err) {
    return _json({ success: false, error: 'JSON invalide : ' + err.message });
  }

  const action = payload.action;
  try {
    if (action === 'updateLead') return _json(updateLead(payload));
    if (action === 'addLead')    return _json(addLead(payload));
    if (action === 'logCall')    return _json(logCall(payload));
    if (action === 'declareCA')  return _json(declareCA(payload));
    return _json({ success: false, error: 'Action inconnue : ' + action });
  } catch(err) {
    return _json({ success: false, error: err.message });
  }
}

function updateLead({ fy = 'FY27', codeClient, fields }) {
  if (!codeClient) return { success: false, error: 'codeClient manquant' };
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(fy);
  if (!sheet) return { success: false, error: `Onglet ${fy} introuvable` };

  const data  = sheet.getDataRange().getValues();
  const headers = data[0];
  const colCC   = headers.indexOf('Code Client');
  if (colCC === -1) return { success: false, error: 'Colonne "Code Client" introuvable' };

  const rowIdx = data.findIndex((row, i) => i > 0 && String(row[colCC]) === String(codeClient));
  if (rowIdx === -1) return { success: false, error: `Code Client "${codeClient}" non trouvé dans ${fy}` };

  const updated = [];
  Object.entries(fields).forEach(([key, val]) => {
    const colIdx = headers.indexOf(key);
    if (colIdx !== -1) {
      sheet.getRange(rowIdx + 1, colIdx + 1).setValue(val);
      updated.push(key);
    }
  });

  SpreadsheetApp.flush();
  return { success: true, fy, codeClient, updated };
}

function addLead({ fy = 'FY27', lead }) {
  if (!lead) return { success: false, error: 'Payload lead manquant' };
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(fy);
  if (!sheet) return { success: false, error: `Onglet ${fy} introuvable` };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newRow  = headers.map(h => lead[h] !== undefined ? lead[h] : '');
  sheet.appendRow(newRow);
  SpreadsheetApp.flush();
  return { success: true, action: 'addLead', fy, raison: lead['Raison Sociale'] || '' };
}

function logCall({ fy = 'FY27', codeClient, callData }) {
  const fields = {
    'Dernier Appel':  callData.date       || new Date().toLocaleDateString('fr-FR'),
    'Statut Empower': callData.statut     || '',
    'Score Empower':  callData.score      || '',
    'Notes':          callData.notes      || '',
    'Date Rappel':    callData.dateRappel || '',
    'Durée Appel':    callData.duree      || '',
  };
  return updateLead({ fy, codeClient, fields });
}

function declareCA({ fy = 'FY27', codeClient, periode, montant }) {
  if (!periode || montant === undefined)
    return { success: false, error: 'periode et montant sont obligatoires' };

  const colName = periode === 'Total'
    ? 'CA Déclaré'
    : `CA ${fy} ${periode}`;

  return updateLead({ fy, codeClient, fields: { [colName]: montant } });
}

/* ============================================================
  HELPER
============================================================ */
function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
