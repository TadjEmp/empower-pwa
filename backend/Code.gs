// ═══════════════════════════════════════════════════════════
//  Code.gs — EMPOWER MDB Google Apps Script v4.1
//  Backend API pour PWA EMPOWER FY27
//
//  DÉPLOIEMENT :
//    Extensions → Apps Script → Déployer → Nouveau déploiement
//    Type : Application web
//    Accès : Tout le monde
//    Copier l'URL → coller dans js/api.js BASE_URL
//
//  SPREADSHEET IDS — à renseigner ci-dessous :
// ═══════════════════════════════════════════════════════════

// Les IDs sont stockés automatiquement par installerBase() dans
// les ScriptProperties — aucun remplacement manuel nécessaire.
const _PROPS = PropertiesService.getScriptProperties();
const CONFIG = {
  MDB_ID:  _PROPS.getProperty('MDB_ID') || 'EXECUTER_installerBase_DABORD',
  V17_ID:  _PROPS.getProperty('V17_ID') || 'EXECUTER_installerBase_DABORD',
  SESSION_HEURES: 8,
  SHEET_USERS: '👤_UTILISATEURS',
};

// ── Router principal ────────────────────────────────────────
function doGet(e) {
  return _router(e.parameter, null);
}

function doPost(e) {
  let body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch(err) { _logErreur('', 'doPost', err); }
  return _router(body, body);
}

function _router(params, body) {
  const action = params?.action || 'ping';
  let user = null;

  try {
    // Actions publiques
    if (action === 'ping')  return _json({ ok: true, ts: new Date().toISOString() });
    if (action === 'login') return _login(params?.email || body?.email, params?.motdepasse || body?.motdepasse);

    // Auth par token de session
    user = _verifierToken(params?.token || body?.token);
    if (!user) return _json({ ok: false, erreur: 'AUTH', detail: 'Session invalide ou expirée — reconnectez-vous' });

    switch (action) {
      case 'lire':           return _lire(params);
      case 'ecrire':         return _ecrire(body);
      case 'mettreAJour':    return _mettreAJour(body);
      case 'attribuerLead':  return _attribuerLead({ ...body, pin: user.pin });
      case 'uploadPhoto':    return _uploadPhoto(body, user);
      case 'gemini':         return _gemini(body, user);
      case 'setGeminiKey':   return _setGeminiKey(body, user);
      case 'groqSTT':        return _groqSTT(body, user);
      case 'groqLLM':        return _groqLLM(body, user);
      case 'setGroqKey':     return _setGroqKey(body, user);
      case 'purgerDonnees':  return _purgerDonnees(body, user);
      default:               return _json({ ok: false, erreur: 'Action inconnue: ' + action });
    }
  } catch(e) {
    _logErreur(user?.pin || '', action, e);
    return _json({ ok: false, erreur: e.message });
  }
}

// ═════════════════════ AUTHENTIFICATION ═════════════════════
// Onglet 👤_UTILISATEURS :
// Email | Hash | Salt | PIN | Nom | Role | Actif | Token | Token_Expiry
//
// ⚙️ SETUP : exécuter une fois initUtilisateurs() depuis l'éditeur
// Apps Script pour créer l'onglet et les 5 comptes (mdp temporaires).

function _sha256(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function _getUsersSheet() {
  const ss = _getSpreadsheet('EMPOWER_MDB');
  return ss.getSheetByName(CONFIG.SHEET_USERS);
}

function _login(email, motdepasse) {
  if (!email || !motdepasse) return _json({ ok: false, erreur: 'Email et mot de passe requis' });
  const sh = _getUsersSheet();
  if (!sh) return _json({ ok: false, erreur: 'Onglet utilisateurs manquant — exécuter initUtilisateurs()' });

  const vals = sh.getDataRange().getValues();
  const headers = vals[0];
  const col = n => headers.indexOf(n);
  const emailNorm = String(email).trim().toLowerCase();

  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    if (String(row[col('Email')]).trim().toLowerCase() !== emailNorm) continue;
    if (String(row[col('Actif')]).toUpperCase() === 'NON')
      return _json({ ok: false, erreur: 'Compte désactivé — contactez votre manager' });

    const hash = _sha256(motdepasse + row[col('Salt')]);
    if (hash !== row[col('Hash')])
      return _json({ ok: false, erreur: 'Email ou mot de passe incorrect' });

    // Génère un token de session 8h
    const token  = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    const expiry = Date.now() + CONFIG.SESSION_HEURES * 3600 * 1000;
    sh.getRange(r + 1, col('Token') + 1).setValue(token);
    sh.getRange(r + 1, col('Token_Expiry') + 1).setValue(expiry);
    SpreadsheetApp.flush();

    return _json({
      ok: true, token, expiry,
      utilisateur: {
        email: emailNorm,
        pin:   Number(row[col('PIN')]),
        nom:   row[col('Nom')],
        role:  row[col('Role')],
      },
    });
  }
  return _json({ ok: false, erreur: 'Email ou mot de passe incorrect' });
}

function _verifierToken(token) {
  if (!token) return null;
  const sh = _getUsersSheet();
  if (!sh) return null;
  const vals = sh.getDataRange().getValues();
  const headers = vals[0];
  const col = n => headers.indexOf(n);
  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    if (String(row[col('Token')]) === String(token)) {
      if (Number(row[col('Token_Expiry')]) < Date.now()) return null;
      return { pin: Number(row[col('PIN')]), nom: row[col('Nom')], role: row[col('Role')] };
    }
  }
  return null;
}

// ⚙️ À exécuter UNE FOIS manuellement depuis l'éditeur Apps Script.
// Crée l'onglet 👤_UTILISATEURS avec mots de passe temporaires
// (= à changer au premier usage via l'admin).

// ⚙️ À exécuter UNE FOIS : ajoute à 📋_PROSPECTS les colonnes pipeline
// EMPOWER manquantes (STATUT_EMPOWER, POTENTIEL, etc. — cartographie §C.4).
function initPipelineColonnes() {
  const sh = _getSpreadsheet('EMPOWER_MDB').getSheetByName('📋_PROSPECTS');
  if (!sh) throw new Error('Onglet 📋_PROSPECTS introuvable');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const COLS = ['STATUT_EMPOWER','POTENTIEL','ORIGINE','CONTACT_NOM','CONTACT_FONCTION',
                'WELCOME_PACK_DATE','PREMIERE_COMMANDE_DATE'];
  let added = 0;
  COLS.forEach(c => {
    if (!headers.includes(c)) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(c);
      added++;
    }
  });
  Logger.log(added + ' colonne(s) pipeline ajoutée(s)');
}

// ── LIRE ────────────────────────────────────────────────────
function _lire({ fichier, onglet }) {
  const ss = _getSpreadsheet(fichier);
  const sh = ss.getSheetByName(onglet);
  if (!sh) return _json({ ok: false, erreur: `Onglet "${onglet}" introuvable dans ${fichier}` });

  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return _json({ ok: true, data: [] });

  const headers = vals[0].map(h => String(h).trim());
  const data = vals.slice(1)
    .filter(row => row.some(c => c !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    });

  return _json({ ok: true, data, count: data.length });
}

// ── ÉCRIRE ──────────────────────────────────────────────────
function _ecrire({ fichier, onglet, donnee }) {
  const ss = _getSpreadsheet(fichier);
  const sh = ss.getSheetByName(onglet);
  if (!sh) return _json({ ok: false, erreur: `Onglet "${onglet}" introuvable` });

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const newRow  = headers.map(h => {
    const v = donnee[h] ?? donnee[h.replace(/ /g,'_')] ?? '';
    return v instanceof Date ? v.toISOString() : v;
  });

  sh.appendRow(newRow);
  SpreadsheetApp.flush();
  return _json({ ok: true, ligneAjoutee: sh.getLastRow() });
}

// ── METTRE À JOUR ───────────────────────────────────────────
function _mettreAJour({ fichier, onglet, id, champs }) {
  const ss = _getSpreadsheet(fichier);
  const sh = ss.getSheetByName(onglet);
  if (!sh) return _json({ ok: false, erreur: `Onglet "${onglet}" introuvable` });

  const vals    = sh.getDataRange().getValues();
  const headers = vals[0];

  // Colonne ID — chercher ID_Compte, IDCompte, ID_Prospect, etc.
  const idColNames = ['ID_Compte','IDCompte','ID_Prospect','IDProspect','ID_Visite','IDVisite','ID_Appel','ID_Objectif','ID_Action','ID_Notif','ID_NSB'];
  let idColIdx = -1;
  for (const name of idColNames) {
    idColIdx = headers.indexOf(name);
    if (idColIdx >= 0) break;
  }
  if (idColIdx < 0) return _json({ ok: false, erreur: 'Colonne ID introuvable' });

  let rowIdx = -1;
  for (let r = 1; r < vals.length; r++) {
    if (String(vals[r][idColIdx]) === String(id)) { rowIdx = r + 1; break; }
  }
  if (rowIdx < 0) return _json({ ok: false, erreur: `ID "${id}" non trouvé dans ${onglet}` });

  // Mettre à jour uniquement les colonnes demandées
  Object.entries(champs).forEach(([colName, val]) => {
    const colIdx = headers.indexOf(colName);
    if (colIdx >= 0) {
      sh.getRange(rowIdx, colIdx + 1).setValue(
        val instanceof Date ? val.toISOString() : val
      );
    }
  });

  SpreadsheetApp.flush();
  return _json({ ok: true, ligneModifiee: rowIdx });
}

// ── UPLOAD PHOTO → Google Drive (dossier ESI_PHOTOS) ────────
function _uploadPhoto({ nom, base64 }, user) {
  if (!base64) return _json({ ok: false, erreur: 'Photo vide' });
  const folders = DriveApp.getFoldersByName('ESI_PHOTOS');
  const folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder('ESI_PHOTOS');
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', nom || ('photo_' + Date.now() + '.jpg'));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  _log(user?.pin || '', 'uploadPhoto', nom || file.getName());
  return _json({ ok: true, url: file.getUrl() });
}

// ── ATTRIBUER LEAD (Alexandra / Tadjidine) ──────────────────
// Met à jour CDS assigné + statut pipeline d'un prospect, puis log.
function _attribuerLead({ id, cdsPin, cdsNom, pin }) {
  const r = _mettreAJour({
    fichier: 'EMPOWER_MDB',
    onglet:  '📋_PROSPECTS',
    id,
    champs: {
      PIN_CDS_Assigne: cdsPin,
      FLAG_ACTION:     'ASSIGNE',
      STATUT_EMPOWER:  'ASSIGNE',
    },
  });
  _log(pin, 'attribuerLead', `Lead ${id} → ${cdsNom || cdsPin}`);
  return r;
}

// Log dans 📊_ACTIONS (schéma : ID_Action, Date_Action, Type_Action, Source,
// PIN_CDS, Nom_Compte, Statut_Avant, Statut_Apres, Resum_IA, GPS_Lat, GPS_Lng, Timestamp)
function _log(pin, action, detail) {
  try {
    const sh = _getSpreadsheet('EMPOWER_MDB').getSheetByName('📊_ACTIONS');
    const now = new Date().toISOString();
    if (sh) sh.appendRow([
      'ACT_' + Date.now(), now, action, 'API', pin, detail, '', '', '', '', '', now
    ]);
  } catch {}
}

// ── HELPERS ─────────────────────────────────────────────────
function _getSpreadsheet(fichier) {
  if (fichier === 'EMPOWER_MDB') return SpreadsheetApp.openById(CONFIG.MDB_ID);
  if (fichier === 'V17')         return SpreadsheetApp.openById(CONFIG.V17_ID);
  throw new Error('Fichier inconnu : ' + fichier);
}

function _json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function _logErreur(pin, module, err) {
  try {
    const ss = _getSpreadsheet('EMPOWER_MDB');
    const sh = ss.getSheetByName('🔴_ERROR_LOGS');
    if (sh) sh.appendRow([
      new Date().toISOString(), pin, '', module,
      err.message, err.stack || '', '{}', true, '4.1'
    ]);
  } catch {}
}

// ═══════════════════════════════════════════════════════════
//  INSTALLATEUR AUTOMATIQUE — exécuter installerBase() UNE FOIS
//  Crée EMPOWER_MDB + V17 avec les données réelles uploadées
//  sur Drive (dossier ESI_IMPORT_FY27), crée les utilisateurs,
//  et stocke les IDs dans ScriptProperties (lus par CONFIG).
// ═══════════════════════════════════════════════════════════

const IMPORT_IDS = {
  COMPTES:     '1cd-AfPdiZPAjNfIa1ualD8P0AIKrqM-RxUaKFfAy6Aw',
  PROSPECTS_1: '1Re3Gn9hATFB4-5hoK6OTYVvYqkOfl3sv-QLdfogGhFw',
  PROSPECTS_2: '1WtppIDcpD3u9MFaJgl23tJSzPWG1yDzMRIDJATXTKuk',
  PROSPECTS_3: '15ufH5Bd5k_laYiYzZacq1QsqXSvYNOLAHWkzSqMhmtk',
};

const HEADERS_MDB = {
  '🏢_COMPTES': ['ID_Compte','Nom_Compte','Ville','Code_Postal','Tel','Email','PIN_CDS_Assigne','Nom_CDS','CANAL','SECTEUR','HAS_EMPOWER','FLAG_ACTION','Priorite','STATUT_COMPTE','CA_FY25','CA_FY26','CA_Q1FY27','Date_Derniere_Action','Type_Derniere_Action','Prochaine_action','Date_prochaine_action','Slider_Receptivite','Note_initiale','Flag_traite','Flag_converti','Latitude','Longitude','Source_Import','Date_Import','Timestamp'],
  '📋_PROSPECTS': ['ID_Prospect','Nom_Compte','Ville','Code_Postal','Tel','Email','PIN_CDS_Assigne','Source_Import','FLAG_ACTION','CANAL','Note_initiale','Date_prochaine_action','Flag_traite','Flag_converti','Date_Import','Timestamp','STATUT_EMPOWER','POTENTIEL','ORIGINE','CONTACT_NOM','CONTACT_FONCTION','WELCOME_PACK_DATE','PREMIERE_COMMANDE_DATE'],
  '🗺️_VISITES': ['ID_Visite','Date','Heure','Semaine_ISO','PIN_CDS','Nom_CDS','ID_Cible','Nom_Compte','Type_Visite','Statut_Visite','Source_Visite','Type_Revendeur','Nb_Employes','Interlocuteur_Nom','Interlocuteur_Fonction','Contact_Direct','Contact_Data','Concurrent_Actuel','Satisf_Concurrent','Produits_Norton','Canal_Appro','Part_Lineaire','Arbre_EMPOWER_Statut','Freins_JSON','Grossistes_JSON','Marketing_Present','Marketing_Supports','PLV_Installe','Photo_URL','Resultat_Visite','Slider_Receptivite','Note_Privee','Prochaine_Action_Texte','Prochaine_Action_Date','GPS_Lat','GPS_Lng','Duree_Minutes','Timestamp'],
  '📞_PHONING': ['ID_Appel','Date','Semaine_ISO','PIN_CDS','Nom_CDS','ID_Cible','Reseller','Statut_Appel','Interet_EMPOWER','Frein_Principal','Prochaine_Action','Date_Rappel','Note','Timestamp'],
  '📊_ACTIONS': ['ID_Action','Date_Action','Type_Action','Source','PIN_CDS','Nom_Compte','Statut_Avant','Statut_Apres','Resum_IA','GPS_Lat','GPS_Lng','Timestamp'],
  '🎯_OBJECTIFS_PRIMES': ['ID_Objectif','Nom_CDS','PIN_CDS','Q1_Obj_Initial','Q2_Obj_Initial','Q3_Obj_Initial','Q4_Obj_Initial','FY27_Obj','Q1_Obj_Revise','Q2_Obj_Revise','Q3_Obj_Revise','Q4_Obj_Revise','Q1_CA_Realise','Q2_CA_Realise','Q3_CA_Realise','Q4_CA_Realise','Prime_Q1','Prime_Q2','Prime_Q3','Prime_Q4','Bonus_Manager_Eligible'],
  '⚙️_PARAMS': ['Parametre','Valeur','Description'],
  '🔔_NOTIFS': ['ID_Notif','Date_Envoi','PIN_Destinataire','Type_Notif','Message','ID_Cible','Statut_Lu','Timestamp'],
  '📉_SELL_IN_HISTORIQUE': ['ID_Ligne','RESELLER','SIRET','Q1FY25','Q2FY25','Q3FY25','Q4FY25','Q1FY26','Q2FY26','Q3FY26','Q4FY26','Q1FY27','CA_FY25_TOTAL','CA_FY26_TOTAL','FLAG_BRUT','CANAL','SECTEUR'],
  '🛒_NSB_COMMANDES': ['ID_NSB','Date','PIN_CDS','ID_Compte','Nom_Compte','Produit','Montant_EUR','Statut','Valid_Manager','Date_Validation','Notes'],
  '🖼️_MARKETING': ['ID_Marketing','Date','PIN_CDS','ID_Visite','ID_Compte','Marketing_Present','Marketing_Supports_JSON','Marketing_Etat','Photo1_URL','Photo2_URL','Photo3_URL','Photo4_URL','Tags_JSON','Action_Requise','Action_Type','Action_Note'],
  '🔴_ERROR_LOGS': ['Timestamp','PIN','Role','Module','Error_Message','Stack','Context_JSON','Online','App_Version'],
};

const PARAMS_FY27 = [
  ['QuarterActif','Q1','Quarter en cours FY27'],
  ['FYActif','FY27','Année fiscale active'],
  ['SeuilDoublonSoft','80','Score similarité doublons (%)'],
  ['SeuilDoublonHard','95','Score fusion automatique doublons (%)'],
  ['RayonGeolock_km','10','Rayon validation GPS visite (km)'],
  ['ObjAppelsSemaine','10','Objectif appels par semaine par CDS'],
  ['ObjVisitesCDS','8','Objectif visites par semaine CDS'],
  ['ObjVisitesManager','10','Objectif visites semaine manager'],
  ['SEUIL_ROUGE_JOURS','5','Alerte rouge : action en retard (jours)'],
  ['SEUIL_ORANGE_JOURS','7','Alerte orange : action à venir (jours)'],
  ['SEUIL_CHURN_JOURS','30','Délai sans action → statut CHURN'],
  ['STATUTS_TERMINAUX','Perdu,Inactif,Converti,FauxNumero,Refus','Statuts bloquant les relances'],
  ['PINS_CDS','4001,4002,4003','PINs CDS actifs'],
  ['PIN_MANAGER','1000','PIN manager (Tadjidine)'],
  ['PIN_FLAVIE','3000','PIN Flavie (phoning/admin)'],
  ['PIN_ADMIN','3000','PIN admin système'],
  ['VERSION_APP','4.1','Version EMPOWER MDB'],
  ['APP_NAME','ESI — Empower Sales Intelligence','Nom application'],
  ['LOCK_TIMEOUT_MS','10000','Timeout verrou écriture (ms)'],
  ['NOTIF_FLAVIE_PIN','3000','PIN destinataire notifs phoning'],
];

// Objectifs FY27 Option D3 (PDF incentives) + CA Q1 réalisé (SELL IN W7)
const OBJECTIFS_FY27 = [
  ['OBJFY271','Tadjidine',1000,12600,7800,9200,12300,41900,'','','','',2942.12,0,0,0,0,0,0,0,'NON'],
  ['OBJFY272','Lyes',4001,7500,4700,5500,7300,25000,'','','','',1750.56,0,0,0,0,0,0,0,'NON'],
  ['OBJFY273','Mehdi',4002,4800,3000,3500,4700,16000,'','','','',239.59,0,0,0,0,0,0,0,'NON'],
  ['OBJFY274','Johanne',4003,4000,2500,2900,3900,13300,'','','','',532.01,0,0,0,0,0,0,0,'NON'],
];

const NOMS_CDS_INSTALL = {1000:'Tadjidine',4001:'Lyes',4002:'Mehdi',4003:'Johanne'};
const ORIG_LABELS = {ITP:'Import_PROSPECTS_IT_PARTNER',FL3:'Import_PROSPECTS_FLAVIE_3',FL1:'Import_PROSPECTS_FLAVIE_1',JOH:'Import_PROSPECTS_JOHANNE',HIS:'Import_historique'};
const POT_LABELS  = {F:'Fort',M:'Moyen',f:'Faible'};

function installerBase() {
  const props = PropertiesService.getScriptProperties();

  // ── 1. Créer EMPOWER_MDB avec tous les onglets ──
  const mdb = SpreadsheetApp.create('EMPOWER_MDB');
  const noms = Object.keys(HEADERS_MDB);
  noms.forEach(function(nom, i) {
    const sh = i === 0 ? mdb.getSheets()[0].setName(nom) : mdb.insertSheet(nom);
    const hdr = HEADERS_MDB[nom];
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
  });
  mdb.getSheetByName('⚙️_PARAMS').getRange(2, 1, PARAMS_FY27.length, 3).setValues(PARAMS_FY27);
  mdb.getSheetByName('🎯_OBJECTIFS_PRIMES').getRange(2, 1, OBJECTIFS_FY27.length, 21).setValues(OBJECTIFS_FY27);

  // ── 2. Importer les 265 comptes réels ──
  const srcC = SpreadsheetApp.openById(IMPORT_IDS.COMPTES).getSheets()[0].getDataRange().getValues();
  const comptes = [];
  for (var i = 1; i < srcC.length; i++) {
    var r = srcC[i];
    if (!r[1]) continue;
    // compact: ID,Nom,PIN,NomCDS,CANAL,SECTEUR,FLAG,Priorite,STATUT,CA25,CA26,CAQ1
    comptes.push([r[0], r[1], '', '', '', '', r[2], r[3], r[4], r[5], 'Non', r[6], r[7], r[8],
                  r[9]||0, r[10]||0, r[11]||0, '', '', '', '', '', '', 'FALSE', 'FALSE', '', '',
                  'SELLIN_Q1FY27_W7', '2026-06-10', '2026-06-10T00:00:00Z']);
  }
  if (comptes.length) mdb.getSheetByName('🏢_COMPTES').getRange(2, 1, comptes.length, 30).setValues(comptes);

  // ── 3. Importer les 1674 prospects réels (3 fichiers) ──
  const prospects = [];
  [IMPORT_IDS.PROSPECTS_1, IMPORT_IDS.PROSPECTS_2, IMPORT_IDS.PROSPECTS_3].forEach(function(id) {
    const src = SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getValues();
    for (var i = 1; i < src.length; i++) {
      var r = src[i]; // ID,NOM,PIN,FLAG,CANAL,NOTE,DATE,POT,ORIG
      if (!r[1]) continue;
      var flag = String(r[3] || 'A_RELANCER');
      var statutEmp = flag.indexOf('COMPTE_CR') === 0 ? 'COMPTE_CREE' : 'ASSIGNE';
      var dateStr = r[6] instanceof Date ? Utilities.formatDate(r[6], 'GMT', 'yyyy-MM-dd') : String(r[6] || '2026-05-27');
      prospects.push([r[0], r[1], '', '', '', '', r[2] || '', 'BASE_PROSPECTS_RELANCER',
                      flag || 'A_RELANCER', r[4] || 'IT', r[5] || '', '', 'FALSE', 'FALSE',
                      '2026-06-10', dateStr, statutEmp, POT_LABELS[String(r[7])] || 'Moyen',
                      ORIG_LABELS[String(r[8])] || 'Import', '', '', '',
                      statutEmp === 'COMPTE_CREE' ? dateStr : '']);
    }
  });
  if (prospects.length) mdb.getSheetByName('📋_PROSPECTS').getRange(2, 1, prospects.length, 23).setValues(prospects);

  // ── 4. Créer V17 (COMPTES HISTORIQUES) à partir des comptes réels ──
  const v17 = SpreadsheetApp.create('V17_COMPTES_HISTORIQUES_FY27');
  const hdrV17 = ['ID_PDV','RESELLER','CANAL','SECTEUR','REGION','CA FY25 €','CA FY26 €','CA Q1FY27 €','Q1FY25 €','Q2FY25 €','Q3FY25 €','Q4FY25 €','Q1FY26 €','Q2FY26 €','Q3FY26 €','Q4FY26 €','FLAG_BRUT','STATUT_FY27','EVOL_FY26_VS_FY25_%','POTENTIEL_UPSELL','GROSSISTE_PRINCIPAL','SIRET','VILLE','CODE_POSTAL','NB_LICENCES_FY26','NB_PRODUITS_NORTON','PRIORITE_RELANCE','SCORE_POTENTIEL','DERNIER_CONTACT_DATE','COMMENTAIRE_COMPTE'];
  const shV = v17.getSheets()[0].setName('📋 COMPTES HISTORIQUES');
  shV.getRange(1, 1, 1, hdrV17.length).setValues([hdrV17]).setFontWeight('bold');
  const prioMap = {Rouge: 1, Orange: 2, Vert: 3};
  const lignesV17 = comptes.map(function(c, i) {
    var ca25 = Number(c[14]) || 0, ca26 = Number(c[15]) || 0;
    var evol = ca25 > 0 ? Math.round((ca26 - ca25) / ca25 * 100) : 0;
    return ['PDV_' + ('0000' + (i + 1)).slice(-4), c[1], c[8], c[9], '', ca25, ca26, c[16],
            0,0,0,0, 0,0,0,0, c[11], c[13], evol,
            c[12] === 'Vert' ? 'Fort' : c[12] === 'Orange' ? 'Moyen' : 'Faible',
            c[8], '', '', '', 0, 0, prioMap[c[12]] || 2, 50, '', ''];
  });
  if (lignesV17.length) shV.getRange(2, 1, lignesV17.length, hdrV17.length).setValues(lignesV17);

  // ── 5. Stocker les IDs (lus par CONFIG au runtime) + utilisateurs ──
  props.setProperty('MDB_ID', mdb.getId());
  props.setProperty('V17_ID', v17.getId());
  initUtilisateurs();

  Logger.log('✅ INSTALLATION TERMINÉE');
  Logger.log('EMPOWER_MDB : ' + mdb.getUrl());
  Logger.log('V17 : ' + v17.getUrl());
  Logger.log('Comptes : ' + comptes.length + ' · Prospects : ' + prospects.length);
  return { mdb: mdb.getUrl(), v17: v17.getUrl(), comptes: comptes.length, prospects: prospects.length };
}

// ⚙️ Recrée l'onglet 👤_UTILISATEURS avec les vrais credentials FY27.
// À exécuter depuis l'éditeur Apps Script (menu Exécuter → fixUtilisateurs).
function fixUtilisateurs() {
  var ss = _getSpreadsheet('EMPOWER_MDB');
  var existing = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (existing) ss.deleteSheet(existing);
  var sh = ss.insertSheet(CONFIG.SHEET_USERS);
  sh.appendRow(['Email','Hash','Salt','PIN','Nom','Role','Actif','Token','Token_Expiry']);
  var USERS = [
    ['t.soefou@agence-impact.com',        'Empower101000', 1000, 'Tadjidine',  'ADMIN'],
    ['lm.daoud@agence-impact.com',         'Empower104001', 4001, 'Lyes',       'CDS'],
    ['m.hocine@agence-impact.com',         'Empower104002', 4002, 'Mehdi',      'CDS'],
    ['j.lhermitte@agence-impact.com',      'Empower104003', 4003, 'Johanne',    'CDS'],
    ['alexandra.alguazil@gendigital.com',  'Empower105000', 5000, 'Alexandra',  'CHANNEL_MANAGER'],
  ];
  USERS.forEach(function(u) {
    var salt = Utilities.getUuid();
    sh.appendRow([u[0], _sha256(u[1] + salt), salt, u[2], u[3], u[4], 'OUI', '', '']);
  });
  Logger.log('OK: ' + USERS.length + ' users in ' + CONFIG.SHEET_USERS);
}

// ⚙️ Migration B5 — ajoute Statut_Visite à 🗺️_VISITES (après Type_Visite).
// À exécuter UNE FOIS depuis Apps Script si la MDB existe déjà.
function migrerAjouterStatutVisite() {
  var sh = _getSpreadsheet('EMPOWER_MDB').getSheetByName('🗺️_VISITES');
  if (!sh) throw new Error('Onglet 🗺️_VISITES introuvable');
  var lastCol   = sh.getLastColumn();
  var headers   = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('Statut_Visite') >= 0) {
    Logger.log('Statut_Visite déjà présente — rien à faire');
    return;
  }
  // Insérer juste après Type_Visite
  var tvIdx    = headers.indexOf('Type_Visite');
  var insertAt = tvIdx >= 0 ? tvIdx + 2 : lastCol + 1;
  sh.insertColumnAfter(insertAt - 1);
  sh.getRange(1, insertAt).setValue('Statut_Visite').setFontWeight('bold');
  // Initialiser les lignes existantes à 'planifiée'
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, insertAt, lastRow - 1, 1).setValue('planifiée');
  SpreadsheetApp.flush();
  Logger.log('✅ Migration OK — Statut_Visite ajoutée en col ' + insertAt + ' (' + (lastRow - 1) + ' lignes mises à jour)');
}

// ── Groq proxy (B11) ───────────────────────────────────────
// Clé stockée dans ScriptProperties sous 'GROQ_API_KEY'.
// Audio jamais stocké — traité en mémoire et discardé immédiatement.

function _groqSTT(body, user) {
  var key = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!key) return _json({ ok: false, erreur: 'Clé Groq non configurée (Admin → setGroqKey)' });
  if (!body.audio) return _json({ ok: false, erreur: 'Paramètre audio manquant' });

  var mimeType = String(body.mimeType || 'audio/webm');
  var audioBytes = Utilities.base64Decode(body.audio);

  // Construire multipart/form-data manuellement
  var boundary = 'ESI' + Utilities.getUuid().replace(/-/g, '');
  var CRLF = '\r\n';
  var partHead =
    '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="model"' + CRLF + CRLF +
    'whisper-large-v3' + CRLF +
    '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="language"' + CRLF + CRLF +
    'fr' + CRLF +
    '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="response_format"' + CRLF + CRLF +
    'json' + CRLF +
    '--' + boundary + CRLF +
    'Content-Disposition: form-data; name="file"; filename="audio.webm"' + CRLF +
    'Content-Type: ' + mimeType + CRLF + CRLF;
  var partTail = CRLF + '--' + boundary + '--';

  var headBytes  = Utilities.newBlob(partHead).getBytes();
  var tailBytes  = Utilities.newBlob(partTail).getBytes();
  var allBytes   = headBytes.concat(audioBytes).concat(tailBytes);

  var resp = UrlFetchApp.fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type':  'multipart/form-data; boundary=' + boundary,
    },
    payload: allBytes,
    muteHttpExceptions: true,
  });

  var data = JSON.parse(resp.getContentText());
  if (data.error) return _json({ ok: false, erreur: data.error.message || 'Erreur Groq STT' });
  return _json({ ok: true, texte: data.text || '' });
}

function _groqLLM(body, user) {
  var key = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!key) return _json({ ok: false, erreur: 'Clé Groq non configurée' });
  if (!body.messages || !body.messages.length) return _json({ ok: false, erreur: 'Paramètre messages manquant' });

  var payload = {
    model:       String(body.model || 'llama3-70b-8192'),
    temperature: Number(body.temperature !== undefined ? body.temperature : 0.3),
    messages:    body.messages,
  };
  if (body.jsonMode) payload.response_format = { type: 'json_object' };

  var resp = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type':  'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var data = JSON.parse(resp.getContentText());
  if (data.error) return _json({ ok: false, erreur: data.error.message || 'Erreur Groq LLM' });
  var texte = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return _json({ ok: true, texte: texte });
}

function _setGroqKey(body, user) {
  if (!user || user.role !== 'ADMIN') return _json({ ok: false, erreur: 'Accès réservé à l\'administrateur' });
  var cle = String(body.cle || '').trim();
  if (!cle) return _json({ ok: false, erreur: 'Clé vide' });
  PropertiesService.getScriptProperties().setProperty('GROQ_API_KEY', cle);
  return _json({ ok: true });
}

// ── RGPD — purge données CDS (B11) ─────────────────────────
// Un CDS peut purger ses propres appels/visites.
// Un ADMIN peut purger pour n'importe quel PIN.
function _purgerDonnees(body, user) {
  var pinCible = body.pinCDS ? Number(body.pinCDS) : user.pin;
  if (pinCible !== user.pin && user.role !== 'ADMIN') {
    return _json({ ok: false, erreur: 'Non autorisé — vous ne pouvez purger que vos propres données' });
  }
  var onglets = ['📞_PHONING', '🗺️_VISITES'];
  var total = 0;
  var ss = _getSpreadsheet('EMPOWER_MDB');
  onglets.forEach(function(nom) {
    var sh = ss.getSheetByName(nom);
    if (!sh || sh.getLastRow() < 2) return;
    var vals = sh.getDataRange().getValues();
    var headers = vals[0];
    var pinCol = headers.indexOf('PIN_CDS');
    if (pinCol < 0) return;
    for (var r = vals.length - 1; r >= 1; r--) {
      if (Number(vals[r][pinCol]) === pinCible) {
        sh.deleteRow(r + 1);
        total++;
      }
    }
  });
  SpreadsheetApp.flush();
  return _json({ ok: true, lignesSupprimees: total });
}

// ── Gemini proxy (B10) ─────────────────────────────────────
// La clé est stockée dans ScriptProperties sous 'GEMINI_API_KEY'
// et n'est JAMAIS exposée côté frontend.
function _gemini(body, user) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return _json({ ok: false, erreur: 'Clé Gemini non configurée. Admin : exécuter setGeminiKey depuis la vue Administration.' });

  var prompt   = String(body.prompt   || '');
  var contexte = String(body.contexte || '');
  if (!prompt) return _json({ ok: false, erreur: 'Paramètre prompt manquant' });

  var fullPrompt = contexte ? contexte + '\n\n' + prompt : prompt;
  var payload = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
    ],
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key;
  var resp = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var data = JSON.parse(resp.getContentText());
  if (data.error) return _json({ ok: false, erreur: data.error.message || 'Erreur Gemini API' });

  var texte = (data.candidates && data.candidates[0] &&
               data.candidates[0].content && data.candidates[0].content.parts &&
               data.candidates[0].content.parts[0].text) || '';
  return _json({ ok: true, texte: texte });
}

// Stockage sécurisé de la clé Gemini — admin uniquement
function _setGeminiKey(body, user) {
  if (!user || user.role !== 'ADMIN') return _json({ ok: false, erreur: 'Accès réservé à l\'administrateur' });
  var cle = String(body.cle || '').trim();
  if (!cle) return _json({ ok: false, erreur: 'Clé vide' });
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', cle);
  return _json({ ok: true });
}
