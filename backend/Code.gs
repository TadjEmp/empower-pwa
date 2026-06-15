// ═══════════════════════════════════════════════════════════
//  Code.gs — EMPOWER MDB Google Apps Script v5.0
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
    // BLOC 9 — Réinitialisation mot de passe (actions publiques, sans token de session)
    if (action === 'sendResetEmail') return _sendResetEmail(body?.email);
    if (action === 'resetPassword')  return _resetPassword(body?.token, body?.nouveauMotdepasse);

    // Auth par token de session
    user = _verifierToken(params?.token || body?.token);
    if (!user) return _json({ ok: false, erreur: 'AUTH', detail: 'Session invalide ou expirée — reconnectez-vous' });

    switch (action) {
      case 'lire':           return _lire(params, user);
      case 'ecrire':         return _ecrire(body);
      // ── V5 — actions de référence (dropdowns, permissions, dashboard) ──
      case 'lireCDS':         return _lireCDS();
      case 'lirePermissions': return _lirePermissions(user);
      case 'lireDashboard':   return _lireDashboard(user);
      case 'mettreAJourCA':   return _mettreAJourCA(body, user);
      case 'purgerProspectsBase': return _purgerProspectsBase(body, user);
      case 'mettreAJour':    return _mettreAJour(body, user);
      case 'attribuerLead':  return _attribuerLead({ ...body, pin: user.pin });
      case 'uploadPhoto':    return _uploadPhoto(body, user);
      case 'gemini':         return _gemini(body, user);
      case 'setGeminiKey':   return _setGeminiKey(body, user);
      case 'groqSTT':        return _groqSTT(body, user);
      case 'groqLLM':        return _groqLLM(body, user);
      case 'setGroqKey':     return _setGroqKey(body, user);
      case 'purgerDonnees':       return _purgerDonnees(body, user);
      case 'importTrackerDrive':  return _importTrackerDrive(body, user);
      case 'syncSellInDrive':     return _syncSellInDrive(body, user);
      // ── V4 ──
      case 'supprimerLead':       return _supprimerLead(body, user);
      case 'syncOnboarding':      return _syncOnboarding(body, user);
      default:                    return _json({ ok: false, erreur: 'Action inconnue: ' + action });
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

// ── BLOC 9 — Réinitialisation mot de passe ───────────────────
// Génère un token temporaire (30 min), l'envoie par email via MailApp.
// Colonnes attendues dans 👤_UTILISATEURS : Reset_Token · Reset_Token_Expiry
// Si absentes, les ajoute dynamiquement.
function _sendResetEmail(email) {
  if (!email) return _json({ ok: false, erreur: 'Email requis' });
  const sh = _getUsersSheet();
  if (!sh) return _json({ ok: false, erreur: 'Onglet utilisateurs manquant' });

  const vals    = sh.getDataRange().getValues();
  const headers = vals[0];
  const col     = n => headers.indexOf(n);
  const emailNorm = String(email).trim().toLowerCase();

  // Ajouter colonnes Reset si absentes
  if (col('Reset_Token') === -1) {
    sh.getRange(1, headers.length + 1).setValue('Reset_Token');
    sh.getRange(1, headers.length + 2).setValue('Reset_Token_Expiry');
    headers.push('Reset_Token', 'Reset_Token_Expiry');
  }

  let found = false;
  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    if (String(row[col('Email')]).trim().toLowerCase() !== emailNorm) continue;
    found = true;

    const resetToken  = Utilities.getUuid().replace(/-/g, '');
    const resetExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes

    sh.getRange(r + 1, col('Reset_Token') + 1).setValue(resetToken);
    sh.getRange(r + 1, col('Reset_Token_Expiry') + 1).setValue(resetExpiry);
    SpreadsheetApp.flush();

    // URL de reset — pointera vers l'application avec token en hash
    const appUrl = ScriptApp.getService().getUrl().replace('/exec', '') + '/exec';
    const resetUrl = PropertiesService.getScriptProperties().getProperty('APP_URL') || 'https://[VOTRE-APPLI].github.io/empower-pwa';
    const lienReset = `${resetUrl}/#/reset-password?token=${resetToken}`;

    try {
      MailApp.sendEmail({
        to: emailNorm,
        subject: '[ESI Norton] Réinitialisation de votre mot de passe',
        body: `Bonjour ${row[col('Nom')]},\n\nVous avez demandé la réinitialisation de votre mot de passe ESI.\n\nCliquez sur le lien ci-dessous (valable 30 minutes) :\n${lienReset}\n\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\n— Impact Sales Marketing`,
        name: 'ESI Norton — EMPOWER Sales Intelligence',
      });
      return _json({ ok: true, message: 'Email de réinitialisation envoyé' });
    } catch(mailErr) {
      // Si MailApp n'est pas autorisé, retourner le lien pour l'admin
      return _json({
        ok: true,
        message: 'Lien généré (email non envoyé — configurer MailApp)',
        lienAdmin: lienReset,
        token: resetToken,
      });
    }
  }

  // Ne pas révéler si l'email n'existe pas (sécurité)
  if (!found) return _json({ ok: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
}

// Valide le token et change le mot de passe
function _resetPassword(token, nouveauMotdepasse) {
  if (!token || !nouveauMotdepasse) return _json({ ok: false, erreur: 'Token et nouveau mot de passe requis' });
  if (nouveauMotdepasse.length < 6) return _json({ ok: false, erreur: 'Mot de passe trop court (6 caractères minimum)' });

  const sh = _getUsersSheet();
  if (!sh) return _json({ ok: false, erreur: 'Onglet utilisateurs manquant' });

  const vals    = sh.getDataRange().getValues();
  const headers = vals[0];
  const col     = n => headers.indexOf(n);

  if (col('Reset_Token') === -1) return _json({ ok: false, erreur: 'Aucun token de reset configuré' });

  for (let r = 1; r < vals.length; r++) {
    const row = vals[r];
    if (String(row[col('Reset_Token')]) !== String(token)) continue;

    const expiry = Number(row[col('Reset_Token_Expiry')]);
    if (!expiry || expiry < Date.now()) return _json({ ok: false, erreur: 'Lien expiré — demandez un nouveau lien' });

    // Régénérer hash + salt
    const newSalt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    const newHash = _sha256(nouveauMotdepasse + newSalt);

    sh.getRange(r + 1, col('Hash') + 1).setValue(newHash);
    sh.getRange(r + 1, col('Salt') + 1).setValue(newSalt);
    sh.getRange(r + 1, col('Reset_Token') + 1).setValue('');
    sh.getRange(r + 1, col('Reset_Token_Expiry') + 1).setValue('');
    SpreadsheetApp.flush();

    return _json({ ok: true, message: 'Mot de passe mis à jour — vous pouvez vous connecter' });
  }

  return _json({ ok: false, erreur: 'Token invalide ou déjà utilisé' });
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
// BUG2 (v5) — sur 📋_PROSPECTS, exclut pour tous les rôles SAUF ADMIN
// les ~1674 prospects résiduels Flavie (Source_Import contenant FLAVIE ou
// BASE_PROSPECTS_RELANCER). La source de vérité des non-ADMIN = ESI_PIPELINE
// + comptes attribués. Les lignes soft-deleted (Flag_traite=DELETED) sont
// exclues pour tout le monde sur cet onglet.
function _lire({ fichier, onglet }, user) {
  const ss = _getSpreadsheet(fichier);
  const sh = ss.getSheetByName(onglet);
  if (!sh) return _json({ ok: false, erreur: `Onglet "${onglet}" introuvable dans ${fichier}` });

  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return _json({ ok: true, data: [] });

  const headers = vals[0].map(h => String(h).trim());
  let data = vals.slice(1)
    .filter(row => row.some(c => c !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    });

  // BUG2 — filtrage Flavie / base résiduelle sur 📋_PROSPECTS
  if (onglet === '📋_PROSPECTS') {
    const estFlavie = function(o) {
      const src = String(o.Source_Import || '').toUpperCase();
      return src.indexOf('FLAVIE') >= 0 || src.indexOf('BASE_PROSPECTS_RELANCER') >= 0;
    };
    const estSupprime = function(o) {
      return String(o.Flag_traite || '').toUpperCase() === 'DELETED';
    };
    const isAdmin   = user && user.role === 'ADMIN';
    const isCDS     = user && user.role === 'CDS';
    const userPin   = user ? Number(user.pin) : 0;
    data = data.filter(function(o) {
      if (estSupprime(o)) return false;
      if (!isAdmin && estFlavie(o)) return false;
      // C03 — CDS voit uniquement son portefeuille (leads assignés à son PIN)
      if (isCDS && o.PIN_CDS_Assigne && Number(o.PIN_CDS_Assigne) !== userPin) return false;
      return true;
    });
  }

  // C07 — CDS voit uniquement ses comptes dans 🏢_COMPTES
  if (onglet === '🏢_COMPTES' && user && user.role === 'CDS') {
    const userPin = Number(user.pin);
    data = data.filter(function(o) {
      return !o.PIN_CDS_Assigne || Number(o.PIN_CDS_Assigne) === userPin;
    });
  }

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
function _mettreAJour({ fichier, onglet, id, champs }, user) {
  const ss = _getSpreadsheet(fichier);
  const sh = ss.getSheetByName(onglet);
  if (!sh) return _json({ ok: false, erreur: `Onglet "${onglet}" introuvable` });

  const vals    = sh.getDataRange().getValues();
  const headers = vals[0];

  // Colonne ID — chercher ID_Compte, IDCompte, ID_Prospect, etc.
  // NOM_COMPTE ajouté pour EMPOWER_ONBOARDING (pas de colonne ID dédiée)
  const idColNames = ['ID_Compte','IDCompte','ID_Prospect','IDProspect','ID_Visite','IDVisite','ID_Appel','ID_Objectif','ID_Action','ID_Notif','ID_NSB','NOM_COMPTE'];
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

  // Contrôle d'appartenance pour les onglets sensibles (PROSPECTS + PHONING + APPELS)
  // CDS ne peut modifier/supprimer que ses propres enregistrements.
  var estSuppression = champs && (String(champs.Flag_traite||'').toUpperCase() === 'DELETED' || String(champs.deleted||'').toUpperCase() === 'TRUE');
  if (estSuppression && user && user.role === 'CDS') {
    var pinColIdx = headers.indexOf('PIN_CDS_Assigne') >= 0 ? headers.indexOf('PIN_CDS_Assigne') : headers.indexOf('PIN_CDS');
    if (pinColIdx >= 0) {
      var pinLigne = Number(vals[rowIdx - 1][pinColIdx]);
      if (pinLigne && pinLigne !== Number(user.pin)) {
        return _json({ ok: false, erreur: 'Droits insuffisants — vous ne pouvez supprimer que vos propres enregistrements' });
      }
    }
  }

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

  // ── Bloc 6 — déclencheurs temps réel sur transition STATUT_EMPOWER ──
  // Non bloquant : les notifs n'altèrent jamais le retour JSON ci-dessous.
  try {
    var nouvStatut = champs && champs.STATUT_EMPOWER;
    if (nouvStatut) {
      if (nouvStatut === 'EN_COURS') {
        // Passage EN_COURS → Alexandra (5000) [Channel Manager / sourcing]
        _notifier(5000, 'STATUT_EN_COURS', 'Prospect en cours: ' + id, id);
      } else if (nouvStatut === 'INTEGRE') {
        // Passage INTEGRE → Tadjidine (1000) + Alexandra (5000)
        _notifier(1000, 'STATUT_INTEGRE', 'Prospect intégré: ' + id, id);
        _notifier(5000, 'STATUT_INTEGRE', 'Prospect intégré: ' + id, id);
      } else if (nouvStatut === 'ARCHIVE') {
        // Passage ARCHIVE (ou blocage) → Alexandra (5000) + Tadjidine (1000)
        _notifier(5000, 'STATUT_ARCHIVE', 'Prospect archivé/bloqué: ' + id, id);
        _notifier(1000, 'STATUT_ARCHIVE', 'Prospect archivé/bloqué: ' + id, id);
      }
    }
  } catch (e) { _logErreur('', '_mettreAJour.notif', e); }

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

// ── MOTEUR D'ALERTES (Bloc 6) — 🔔_NOTIFS ───────────────────
// Appende une notification temps réel destinée à un PIN.
// Colonnes : ID_Notif, Date_Envoi, PIN_Destinataire, Type_Notif,
//            Message, ID_Cible, Statut_Lu, Timestamp.
// Le front lit ses notifs via SheetsAPI.lire('EMPOWER_MDB','🔔_NOTIFS')
// filtré sur PIN_Destinataire = Session.pin.
// Jamais bloquant : une erreur de notif ne doit pas casser l'action métier.
function _notifier(pinDestinataire, typeNotif, message, idCible) {
  try {
    if (!pinDestinataire && pinDestinataire !== 0) return;
    var sh = _getSpreadsheet('EMPOWER_MDB').getSheetByName('🔔_NOTIFS');
    if (!sh) return;
    var now = new Date().toISOString();
    var idNotif = 'NOTIF_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    sh.appendRow([
      idNotif, now, pinDestinataire, typeNotif || 'INFO',
      message || '', idCible || '', 'NON', now
    ]);
  } catch (e) {
    _logErreur(pinDestinataire || '', '_notifier', e);
  }
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
  // Bloc 6 — alerte J0 au CDS assigné. Si pas de cdsPin : statut reste
  // ASSIGNE sans notif (rien à notifier tant que personne n'est assigné).
  if (cdsPin || cdsPin === 0) {
    _notifier(cdsPin, 'LEAD_ASSIGNE', 'Nouveau lead assigné: ' + id, id);
  }
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
      err.message, err.stack || '', '{}', true, '5.0'
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
  '📞_PHONING': ['ID_Appel','Date','Semaine_ISO','PIN_CDS','Nom_CDS','ID_Cible','Reseller','Type_Appel','Statut_Appel','Interet_EMPOWER','Interet_Score','Questionnaire_JSON','Frein_Principal','Prochaine_Action','Date_Rappel','Note','Timestamp'],
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
  ['VERSION_APP','5.0','Version EMPOWER MDB'],
  ['APP_NAME','ESI — Empower Sales Intelligence','Nom application'],
  ['LOCK_TIMEOUT_MS','10000','Timeout verrou écriture (ms)'],
  ['NOTIF_FLAVIE_PIN','3000','PIN destinataire notifs phoning'],
  ['GROQ_SYSTEM_PROMPT','Tu es l\'assistant IA d\'ESI (Empower Sales Intelligence), l\'outil terrain des CDS Norton/Gen Digital. Tu aides à qualifier des revendeurs IT, résumer des visites/appels et suggérer la prochaine action commerciale. Réponds toujours en français, de façon concise, factuelle et orientée action. Ne jamais inventer de chiffres : si une donnée manque, écris \"—\". Respecte le RGPD : aucune donnée personnelle inutile. Format de sortie : phrases courtes ou JSON si demandé.','System prompt Groq (Bloc 8)'],
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

// ⚙️ Recrée l'onglet 👤_UTILISATEURS avec les vrais credentials FY27 (BLOC 1 du spec).
// ⚠️ FONCTION MANUELLE — NE PAS auto-exécuter / ne pas appeler depuis le router.
// Tadjidine doit la ré-exécuter manuellement depuis l'éditeur Apps Script
// (menu Exécuter → fixUtilisateurs) pour APPLIQUER les nouveaux mots de passe.
// Tant qu'elle n'est pas ré-exécutée, les sessions/logins actuels restent
// inchangés (les hash existants ne sont pas écrasés).
// NB : pas de compte Flavie — Alexandra (CHANNEL_MANAGER) assure le sourcing + l'attribution.
function fixUtilisateurs() {
  var ss = _getSpreadsheet('EMPOWER_MDB');
  var existing = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (existing) ss.deleteSheet(existing);
  var sh = ss.insertSheet(CONFIG.SHEET_USERS);
  sh.appendRow(['Email','Hash','Salt','PIN','Nom','Role','Actif','Token','Token_Expiry']);
  // Mots de passe alignés sur le BLOC 1 du spec ERI.txt.
  var USERS = [
    ['t.soefou@agence-impact.com',        'NortonFY27!', 1000, 'Tadjidine',  'ADMIN'],
    ['lm.daoud@agence-impact.com',         'NortonCDS27', 4001, 'Lyes',       'CDS'],
    ['m.hocine@agence-impact.com',         'NortonCDS27', 4002, 'Mehdi',      'CDS'],
    ['j.lhermitte@agence-impact.com',      'NortonCDS27', 4003, 'Johanne',    'CDS'],
    ['alexandra.alguazil@gendigital.com',  'ChanMgr27',   5000, 'Alexandra',  'CHANNEL_MANAGER'],
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
  if (!user || user.role !== 'ADMIN') return _json({ ok: false, erreur: 'Accès réservé à l\'administrateur (rôle ADMIN requis)' });
  var cle = String(body.cle || '').trim();
  if (!cle) return _json({ ok: false, erreur: 'Clé Groq vide — saisissez une clé API valide (gsk_...)' });
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

// ── IMPORT EMPOWER TRACKER DRIVE → 📋_PROSPECTS ────────────
// Lit l'onglet "1 - Saisie" du fichier EMPOWER TRACKER Drive,
// mappe chaque revendeur vers le format 📋_PROSPECTS et insère
// les nouvelles lignes (Source_Import=ESI_PIPELINE). Non destructif.
function _importTrackerDrive(body, user) {
  if (!user || user.role !== 'ADMIN')
    return _json({ ok: false, erreur: 'Réservé aux administrateurs' });

  try {
    var TRACKER_ID = '1Xpwrkl2V5RC1KHpw9KdW5HH9eAmRIwPDUHLZ_iAyOqA';

    var NOM_VERS_PIN = {
      'tadjidine': 1000, 'tadj': 1000,
      'lyes': 4001,
      'mehdi': 4002,
      'johanne': 4003,
      // BLOC 1 : anthony → Tadjidine (4004 supprimé)
      'anthony': 1000,
    };

    var mdb     = _getSpreadsheet('EMPOWER_MDB');
    var tracker = SpreadsheetApp.openById(TRACKER_ID);

    var saisie = tracker.getSheetByName('1 - Saisie');
    if (!saisie) return _json({ ok: false, erreur: 'Onglet "1 - Saisie" introuvable dans le Tracker' });

    var saisieData = saisie.getDataRange().getValues();
    var headerRow  = -1;
    for (var i = 0; i < saisieData.length; i++) {
      if (String(saisieData[i][0]).trim() === 'Revendeur') { headerRow = i; break; }
    }
    if (headerRow < 0) return _json({ ok: false, erreur: 'En-têtes introuvables dans l\'onglet Saisie' });

    var saisieHeaders = saisieData[headerRow].map(function(h) { return String(h).trim(); });
    var col = function(name) { return saisieHeaders.indexOf(name); };
    var C = {
      revendeur:    col('Revendeur'),
      cds:          col('CDS'),
      origine:      col('Origine'),
      actif:        col('Actif'),
      potentiel:    col('Potentiel'),
      derniereAct:  col('Dernière Action'),
      natureAct:    col('Nature Action'),
      objectifProch: col('Objectif Prochaine Action'),
      prochaineAct: col('Prochaine Action'),
      dateProchaAct: col('Date Prochaine action'),
      welcomePack:  col('Welcome Pack Envoyé ?'),
      dateWelcome:  col('Date Envoi Welcome Pack'),
      canalPack:    col("Canal d'envoi  Pack"),
      blocage:      col('Blocage'),
      notes:        col('Notes'),
    };

    // Lire PROSPECTS existants pour déduplique par nom normalisé
    var shP       = mdb.getSheetByName('📋_PROSPECTS');
    var prospData = shP.getDataRange().getValues();
    var pH        = prospData[0];
    var nomColP   = pH.indexOf('Nom_Compte');
    var srcColP   = pH.indexOf('Source_Import');

    var existants = {};
    for (var r = 1; r < prospData.length; r++) {
      if (String(prospData[r][srcColP] || '') === 'ESI_PIPELINE') {
        existants[_normNomGs(String(prospData[r][nomColP] || ''))] = true;
      }
    }

    var headers_MDB = shP.getRange(1, 1, 1, shP.getLastColumn()).getValues()[0].map(String);
    var nouvelles   = [];
    var skips       = 0;

    for (var r = headerRow + 1; r < saisieData.length; r++) {
      var row = saisieData[r];
      var nom = String(row[C.revendeur] || '').trim();
      if (!nom) continue;

      var normNom = _normNomGs(nom);
      if (existants[normNom]) { skips++; continue; }

      var cdsStr = String(row[C.cds] || '').trim();
      var pin    = NOM_VERS_PIN[cdsStr.toLowerCase()] || '';
      var actif  = String(row[C.actif] || '').trim();
      var statut = _mapStatutGs(actif);
      var pot    = _mapPotentielGs(String(row[C.potentiel] || '').trim());
      var orig   = String(row[C.origine] || '').trim();
      var dern   = String(row[C.derniereAct] || '').trim();
      var nature = String(row[C.natureAct] || '').trim();
      var obj    = String(row[C.objectifProch] || '').trim();
      var proch  = String(row[C.prochaineAct] || '').trim();
      var dateP  = _formatDateGs(row[C.dateProchaAct]);
      var wpack  = String(row[C.welcomePack] || '').trim();
      var datew  = _formatDateGs(row[C.dateWelcome]);
      var canal  = String(row[C.canalPack] || '').trim();
      var bloc   = String(row[C.blocage] || '').trim();
      var notes  = String(row[C.notes] || '').trim();

      var noteParts = [notes];
      if (bloc)   noteParts.push('[BLOCAGE: ' + bloc + ']');
      if (obj)    noteParts.push('[OBJECTIF: ' + obj + ']');
      if (proch)  noteParts.push('[PROCHAINE ACTION: ' + proch + ']');
      if (nature) noteParts.push('[NATURE: ' + nature + ']');
      if (dern)   noteParts.push('[DERNIÈRE ACTION: ' + dern + ']');
      if (wpack)  noteParts.push('[WELCOME PACK: ' + wpack + (datew ? ' le ' + datew : '') + (canal ? ' via ' + canal : '') + ']');
      var noteFinale = noteParts.filter(Boolean).join(' | ');

      var now   = new Date().toISOString();
      var today = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
      var uuid  = 'LEAD_TRK_' + Utilities.getUuid().split('-')[0].toUpperCase();

      var ligne = new Array(headers_MDB.length).fill('');
      headers_MDB.forEach(function(h, i) {
        switch(h) {
          case 'ID_Prospect':           ligne[i] = uuid; break;
          case 'Nom_Compte':            ligne[i] = nom; break;
          case 'PIN_CDS_Assigne':       ligne[i] = pin; break;
          case 'Source_Import':         ligne[i] = 'ESI_PIPELINE'; break;
          case 'FLAG_ACTION':           ligne[i] = dern || 'IMPORT_TRACKER'; break;
          case 'CANAL':                 ligne[i] = 'EMPOWER'; break;
          case 'Note_initiale':         ligne[i] = noteFinale; break;
          case 'Date_prochaine_action': ligne[i] = dateP; break;
          case 'Flag_traite':           ligne[i] = 'FALSE'; break;
          case 'Flag_converti':         ligne[i] = statut === 'INTEGRE' ? 'TRUE' : 'FALSE'; break;
          case 'Date_Import':           ligne[i] = today; break;
          case 'Timestamp':             ligne[i] = now; break;
          case 'STATUT_EMPOWER':        ligne[i] = statut; break;
          case 'POTENTIEL':             ligne[i] = pot; break;
          case 'ORIGINE':               ligne[i] = orig ? 'Tracker_' + orig : 'ESI_PIPELINE'; break;
          case 'WELCOME_PACK_DATE':     ligne[i] = datew; break;
        }
      });

      nouvelles.push(ligne);
      existants[normNom] = true;
    }

    if (nouvelles.length > 0) {
      shP.getRange(shP.getLastRow() + 1, 1, nouvelles.length, headers_MDB.length).setValues(nouvelles);
      SpreadsheetApp.flush();
    }

    _log(user.pin, 'importTrackerDrive', nouvelles.length + ' leads importés, ' + skips + ' doublons');
    return _json({ ok: true, crees: nouvelles.length, skips: skips,
                   message: nouvelles.length + ' lead(s) importé(s), ' + skips + ' doublon(s) ignoré(s)' });

  } catch(e) {
    return _json({ ok: false, erreur: e.toString() });
  }
}

function _normNomGs(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function _mapStatutGs(s) {
  var sl = String(s).toLowerCase();
  if (sl.indexOf('contacter') >= 0)                        return 'ASSIGNE';
  if (sl.indexOf('discussion') >= 0)                       return 'SAISIE';
  if (sl === 'en cours')                                   return 'EN_COURS';
  if (sl.indexOf('compte cr') >= 0)                        return 'COMPTE_CREE';
  if (sl.indexOf('1re commande') >= 0 || sl === '1re commande') return 'COMPTE_CREE';
  if (sl === 'actif')                                      return 'INTEGRE';
  if (sl.indexOf('bloqu') >= 0)                            return 'ARCHIVE';
  if (sl.indexOf('finalis') >= 0)                          return 'INTEGRE';
  return 'SAISIE';
}

function _mapPotentielGs(s) {
  var sl = String(s).toLowerCase();
  if (sl.indexOf('fort') >= 0 || sl.indexOf('>100') >= 0 || sl.indexOf('100') >= 0) return 'Fort';
  if (sl.indexOf('moyen') >= 0 || sl.indexOf('20-100') >= 0)                         return 'Moyen';
  if (sl.indexOf('faible') >= 0 || sl.indexOf('<20') >= 0)                            return 'Faible';
  return 'Moyen';
}

function _formatDateGs(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime()) || val.getFullYear() < 2000) return '';
    return Utilities.formatDate(val, 'Europe/Paris', 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  if (!s || s === '0') return '';
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
      return Utilities.formatDate(d, 'Europe/Paris', 'yyyy-MM-dd');
    }
  } catch(e) {}
  return s;
}

// ── Détection robuste de l'onglet données dans le classeur SELL-IN ────────
// S0 : GID exact (URL ?gid=577118803) — méthode la plus fiable
// S1 : headers réels (QUARTER + RESELLER en ligne 1)
// S2 : pattern de nom, un pattern à la fois sur TOUS les onglets (évite le court-circuit précoce)
// S3 : fallback premier onglet
function _trouverOngletSellIn(ss) {
  var sheets = ss.getSheets();

  // S0 — GID connu (identifié dans l'URL du fichier SELL IN : ?gid=577118803)
  for (var si = 0; si < sheets.length; si++) {
    if (sheets[si].getSheetId() === 577118803) {
      Logger.log('[SellIn] S0 GID=577118803 → "' + sheets[si].getName() + '"');
      return sheets[si];
    }
  }

  // S1 — headers réels (QUARTER + RESELLER obligatoires en ligne 1)
  for (var s1 = 0; s1 < sheets.length; s1++) {
    var nc = Math.min(sheets[s1].getLastColumn(), 20);
    if (nc < 1) continue;
    var hd1 = sheets[s1].getRange(1, 1, 1, nc).getValues()[0]
                .map(function(x){ return String(x).trim().toUpperCase(); });
    Logger.log('[SellIn] S1 "' + sheets[s1].getName() + '" hd=' + hd1.slice(0,6).join('|'));
    if (hd1.indexOf('QUARTER') >= 0 && hd1.indexOf('RESELLER') >= 0) {
      Logger.log('[SellIn] S1 match headers → "' + sheets[s1].getName() + '"');
      return sheets[s1];
    }
  }

  // S2 — nom de l'onglet (exhaustion par pattern avant de passer au suivant)
  var pats = ['DATA', 'SELL', 'Q1FY', 'FY'];
  for (var p = 0; p < pats.length; p++) {
    for (var s2 = 0; s2 < sheets.length; s2++) {
      if (sheets[s2].getName().toUpperCase().indexOf(pats[p]) >= 0) {
        Logger.log('[SellIn] S2 pattern "' + pats[p] + '" → "' + sheets[s2].getName() + '"');
        return sheets[s2];
      }
    }
  }

  Logger.log('[SellIn] S3 fallback → "' + sheets[0].getName() + '"');
  return sheets[0];
}

// ── SYNC SELL-IN DRIVE → V17 + 🏢_COMPTES ─────────────────────────────────
// Lit le classeur Drive sell-in, pivote par RESELLER/QUARTER,
// écrit dans V17/📋 COMPTES HISTORIQUES et met à jour les CA dans 🏢_COMPTES.
function _syncSellInDrive(body, user) {
  // SOURCE : classeur SELL-IN (lecture)
  // DESTINATIONS : 🏢_COMPTES (MDB) + V17 COMPTES HISTORIQUES (optionnel)
  // BUG3 (v5) — ouvert à TOUS les rôles authentifiés (plus ADMIN-only).
  // Le routeur a déjà validé le token ; aucune restriction de rôle ici.
  if (!user) return _json({ ok: false, erreur: 'Session invalide' });
  try {
    // ── 1. Lire le classeur SELL-IN (source) ─────────────────────────────────
    var SELL_IN_ID = '1z8j5NISu5uMtIds8qV_oaBLkWUiyE4x54n5uWzD5Q0A';
    var ssIn = SpreadsheetApp.openById(SELL_IN_ID);
    var shData = _trouverOngletSellIn(ssIn);

    var raw = shData.getDataRange().getValues();
    if (raw.length < 2) return _json({ ok: false, erreur: 'Pas de données dans la feuille DATA' });

    var hd  = raw[0].map(function(x){ return String(x).trim().toUpperCase(); });
    var iQ   = hd.indexOf('QUARTER');
    var iRes = hd.indexOf('RESELLER');
    var iCh  = hd.indexOf('CHANNEL');
    var iCA  = hd.indexOf('CA_EUR');
    Logger.log('[syncSellIn] Onglet: "' + shData.getName() + '" · ' + (raw.length-1) + ' lignes · cols: Q=' + iQ + ' RES=' + iRes + ' CA=' + iCA);
    if (iQ < 0 || iRes < 0 || iCA < 0)
      return _json({ ok: false, erreur: 'Colonnes manquantes dans DATA : QUARTER=' + iQ + ' RESELLER=' + iRes + ' CA_EUR=' + iCA });

    // ── 2. Pivot par RESELLER ─────────────────────────────────────────────────
    var pivot = {};
    for (var r = 1; r < raw.length; r++) {
      var row = raw[r];
      var res = String(row[iRes] || '').trim();
      var qtr = String(row[iQ]   || '').trim();
      var ch  = iCh >= 0 ? String(row[iCh] || '').trim().toUpperCase() : '';
      var ca  = parseFloat(String(row[iCA] || '0').replace(/[€\s]/g,'').replace(',','.')) || 0;
      if (!res || !qtr) continue;
      if (!pivot[res]) pivot[res] = { canal: 'REVENDEUR' };
      pivot[res][qtr] = (pivot[res][qtr] || 0) + ca;
      if (ch === 'LECLERC') pivot[res].canal = 'LECLERC';
    }

    var r2 = function(n){ return Math.round(n * 100) / 100; };
    var QQ25 = ['Q1FY25','Q2FY25','Q3FY25','Q4FY25'];
    var QQ26 = ['Q1FY26','Q2FY26','Q3FY26','Q4FY26'];
    Object.keys(pivot).forEach(function(res) {
      var p = pivot[res];
      p.CA_FY25   = QQ25.reduce(function(s,q){ return s + (p[q]||0); }, 0);
      p.CA_FY26   = QQ26.reduce(function(s,q){ return s + (p[q]||0); }, 0);
      p.CA_Q1FY27 = p['Q1FY27'] || 0;
      p.flag = p.CA_Q1FY27 > 0 ? 'ACTIF' : p.CA_FY26 > 0 ? 'REACTIVER' : p.CA_FY25 > 0 ? 'CHURN' : 'INACTIF';
    });

    // ── 3. Mettre à jour 🏢_COMPTES (MDB) — PRIORITAIRE ─────────────────────
    var mdb = _getSpreadsheet('EMPOWER_MDB');
    var shC = null;
    mdb.getSheets().forEach(function(s){
      if (!shC && s.getName().replace(/[^\w]/g,'').toUpperCase().indexOf('COMPTES') >= 0
          && s.getName().indexOf('HISTORIQUES') < 0) shC = s;
    });
    var comptesMaj = 0;
    if (!shC) {
      _log(user.pin, 'syncSellInDrive', 'WARN: onglet COMPTES introuvable dans MDB');
    } else {
      var cH    = shC.getRange(1, 1, 1, shC.getLastColumn()).getValues()[0].map(String);
      var cData = shC.getDataRange().getValues();
      var iNom  = cH.indexOf('Nom_Compte');
      var iCA25 = cH.indexOf('CA_FY25'), iCA26 = cH.indexOf('CA_FY26');
      var iCAQ1 = cH.indexOf('CA_Q1FY27'), iCanal = cH.indexOf('CANAL');
      var iStatut = cH.indexOf('STATUT_COMPTE'); // BUG4 — recalcul dynamique
      for (var ri = 1; ri < cData.length; ri++) {
        var nom  = String(cData[ri][iNom] || '').trim();
        var norm = nom.toLowerCase().replace(/[^a-z0-9]/g,'');
        var key  = Object.keys(pivot).find(function(k){
          return k.toLowerCase().replace(/[^a-z0-9]/g,'') === norm;
        });
        if (key) {
          var p = pivot[key]; var rn = ri + 1;
          if (iCA25  >= 0) shC.getRange(rn, iCA25+1 ).setValue(r2(p.CA_FY25));
          if (iCA26  >= 0) shC.getRange(rn, iCA26+1 ).setValue(r2(p.CA_FY26));
          if (iCAQ1  >= 0) shC.getRange(rn, iCAQ1+1 ).setValue(r2(p.CA_Q1FY27));
          if (iCanal >= 0) shC.getRange(rn, iCanal+1).setValue(p.canal);
          // BUG4 — STATUT_COMPTE recalculé à partir du CA fraîchement synchronisé
          if (iStatut >= 0) {
            var ca27 = p.CA_Q1FY27 || 0, ca26 = p.CA_FY26 || 0, ca25 = p.CA_FY25 || 0;
            var statut = ca27 > 0 ? 'ACTIF' :
                         ca26 > 0 ? 'REACTIVER' :
                         ca25 > 0 ? 'CHURN' : 'INACTIF';
            shC.getRange(rn, iStatut+1).setValue(statut);
          }
          comptesMaj++;
        }
      }
      Logger.log('[syncSellIn] Pivot sample key: ' + (Object.keys(pivot)[0]||'n/a'));
      Logger.log('[syncSellIn] MDB sample nom: ' + (cData[1] ? String(cData[1][iNom]||'') : 'n/a'));
      Logger.log('[syncSellIn] Comptes matchés: ' + comptesMaj + ' / ' + (cData.length-1));
    }

    // ── 4. V17 COMPTES HISTORIQUES — optionnel, jamais bloquant ──────────────
    var revendeurs = 0;
    if (CONFIG.V17_ID && CONFIG.V17_ID !== 'EXECUTER_installerBase_DABORD') {
      try {
        var ssV17 = SpreadsheetApp.openById(CONFIG.V17_ID);
        var shV17 = null;
        ssV17.getSheets().forEach(function(s){
          if (!shV17 && s.getName().toUpperCase().indexOf('COMPTES') >= 0) shV17 = s;
        });
        if (!shV17) {
          var hdrs = ['RESELLER','CANAL','CA FY25 €','CA FY26 €','CA Q1FY27 €',
                      'Q1FY25 €','Q2FY25 €','Q3FY25 €','Q4FY25 €',
                      'Q1FY26 €','Q2FY26 €','Q3FY26 €','Q4FY26 €','FLAG_BRUT','STATUT_FY27'];
          shV17 = ssV17.insertSheet('📋 COMPTES HISTORIQUES');
          shV17.getRange(1,1,1,hdrs.length).setValues([hdrs]);
          shV17.setFrozenRows(1);
          SpreadsheetApp.flush();
        }
        var nCols17 = Math.max(1, shV17.getLastColumn());
        var v17Raw  = shV17.getRange(1,1,1,nCols17).getValues()[0];
        var hIdx = {}; v17Raw.forEach(function(h,i){ hIdx[String(h).trim()] = i; });
        var lr17 = shV17.getLastRow();
        if (lr17 > 1) shV17.getRange(2,1,lr17-1,nCols17).clearContent();
        var newRows = Object.keys(pivot).map(function(res) {
          var p = pivot[res]; var row = new Array(nCols17).fill('');
          var set = function(col,val){ if (hIdx[col]!==undefined) row[hIdx[col]]=val; };
          set('RESELLER',res); set('CANAL',p.canal);
          set('CA FY25 €',r2(p.CA_FY25)); set('CA FY26 €',r2(p.CA_FY26));
          set('CA Q1FY27 €',r2(p.CA_Q1FY27));
          ['Q1','Q2','Q3','Q4'].forEach(function(q){
            set(q+'FY25 €',r2(p[q+'FY25']||0)); set(q+'FY26 €',r2(p[q+'FY26']||0));
          });
          set('FLAG_BRUT',p.flag); set('STATUT_FY27',p.flag);
          return row;
        });
        if (newRows.length > 0) shV17.getRange(2,1,newRows.length,nCols17).setValues(newRows);
        revendeurs = newRows.length;
      } catch(eV17) {
        _log(user.pin, 'syncSellInDrive', 'WARN V17 (non bloquant) : ' + eV17.toString());
      }
    }

    SpreadsheetApp.flush();
    _log(user.pin, 'syncSellInDrive', revendeurs + ' revendeurs · ' + comptesMaj + ' comptes MAJ');
    return _json({
      ok: true, revendeurs: revendeurs, comptesMaj: comptesMaj,
      message: revendeurs + ' revendeurs sync · ' + comptesMaj + ' comptes MDB mis à jour'
    });
  } catch(e) {
    return _json({ ok: false, erreur: e.toString() });
  }
}

// Stockage sécurisé de la clé Gemini — admin uniquement
function _setGeminiKey(body, user) {
  if (!user || user.role !== 'ADMIN') return _json({ ok: false, erreur: 'Accès réservé à l\'administrateur (rôle ADMIN requis)' });
  var cle = String(body.cle || '').trim();
  if (!cle) return _json({ ok: false, erreur: 'Clé Gemini vide — saisissez une clé API valide' });
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', cle);
  return _json({ ok: true });
}

// ══════════════════════════════════════════════════════════════
//  V4 — BLOC 4.2 : SUPPRESSION DOUCE D'UN LEAD
//  Droits : CDS = ses propres leads uniquement
//           ADMIN + CHANNEL_MANAGER = tous les leads
//  Mécanisme : Flag_traite = 'DELETED' (soft delete, non destructif)
// ══════════════════════════════════════════════════════════════
function _supprimerLead(body, user) {
  var id = String(body.id || '').trim();
  if (!id) return _json({ ok: false, erreur: 'ID du lead manquant' });

  var ss = _getSpreadsheet('EMPOWER_MDB');
  var sh = ss.getSheetByName('📋_PROSPECTS');
  if (!sh) return _json({ ok: false, erreur: 'Onglet 📋_PROSPECTS introuvable' });

  var vals    = sh.getDataRange().getValues();
  var headers = vals[0];
  var idCol   = headers.indexOf('ID_Prospect');
  var pinCol  = headers.indexOf('PIN_CDS_Assigne');
  var flagCol = headers.indexOf('Flag_traite');

  if (idCol < 0) return _json({ ok: false, erreur: 'Colonne ID_Prospect introuvable' });

  var rowIdx = -1;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][idCol]) === id) { rowIdx = r + 1; break; }
  }
  if (rowIdx < 0) return _json({ ok: false, erreur: 'Lead ' + id + ' introuvable' });

  // Contrôle accès : CDS ne peut supprimer que ses propres leads
  var peutSupprimer = user.role === 'ADMIN' || user.role === 'CHANNEL_MANAGER';
  if (!peutSupprimer) {
    var pinLead = Number(vals[rowIdx - 1][pinCol]);
    peutSupprimer = pinLead === Number(user.pin);
  }
  if (!peutSupprimer) return _json({ ok: false, erreur: 'Droits insuffisants — vous ne pouvez supprimer que vos propres leads' });

  // Soft-delete : Flag_traite = 'DELETED'
  if (flagCol >= 0) sh.getRange(rowIdx, flagCol + 1).setValue('DELETED');
  // Marquer aussi FLAG_ACTION pour la lisibilité côté Sheets
  var flagActCol = headers.indexOf('FLAG_ACTION');
  if (flagActCol >= 0) sh.getRange(rowIdx, flagActCol + 1).setValue('SUPPRIME');

  SpreadsheetApp.flush();
  _log(user.pin, 'supprimerLead', 'Lead soft-deleted : ' + id);
  return _json({ ok: true, id: id });
}

// ══════════════════════════════════════════════════════════════
//  V4 — BLOC 1 : MIGRATION réattribution J. Nouet + Anthony → Tadjidine (1000)
//  Exécuter UNE FOIS manuellement depuis l'éditeur Apps Script.
//  Cherche dans 🏢_COMPTES et 📋_PROSPECTS les lignes avec PIN_CDS_Assigne = 4004
//  (Anthony) ou Nom_CDS contenant 'Nouet' et les réattribue à Tadjidine (1000).
// ══════════════════════════════════════════════════════════════
function migrerReattribuerBloc1() {
  var ss   = _getSpreadsheet('EMPOWER_MDB');
  var PIN_TADJIDINE = 1000;
  var NOM_TADJIDINE = 'Tadjidine';
  var total = 0;

  ['🏢_COMPTES', '📋_PROSPECTS'].forEach(function(onglet) {
    var sh = ss.getSheetByName(onglet);
    if (!sh) return;
    var vals    = sh.getDataRange().getValues();
    var headers = vals[0];
    var pinCol  = headers.indexOf('PIN_CDS_Assigne');
    var nomCol  = headers.indexOf('Nom_CDS');
    if (pinCol < 0) return;

    for (var r = 1; r < vals.length; r++) {
      var pin = Number(vals[r][pinCol]);
      var nom = String(vals[r][nomCol] || '').toLowerCase();
      var match = pin === 4004 || nom.indexOf('nouet') >= 0 || nom.indexOf('anthony') >= 0;
      if (!match) continue;
      sh.getRange(r + 1, pinCol + 1).setValue(PIN_TADJIDINE);
      if (nomCol >= 0) sh.getRange(r + 1, nomCol + 1).setValue(NOM_TADJIDINE);
      total++;
    }
  });

  SpreadsheetApp.flush();
  Logger.log('✅ Bloc 1 migration : ' + total + ' lignes réattribuées à Tadjidine (1000)');
  return total;
}

// ══════════════════════════════════════════════════════════════
//  V4 — BLOC 2 : ONGLET EMPOWER_ONBOARDING
//  SOURCE UNIQUE : fichier SELL IN Drive (ID ci-dessous)
//  Zéro lien avec 📋_PROSPECTS (base de 1730 prospects exclue).
//  🏢_COMPTES utilisé uniquement pour la lookup CDS (COMMERCIAL_ATTRIBUÉ).
//  Idempotent : préserve DATE_DERNIER_APPEL, STATUT_APPEL, NOTES_APPEL, DATE_RELANCE.
//  Déclencher via action syncOnboarding ou manuellement via creerOngletOnboarding().
// ══════════════════════════════════════════════════════════════
var ONBOARDING_HEADERS = [
  'NOM_COMPTE','CANAL','COMMERCIAL_ATTRIBUÉ','STATUT_EMPOWER','PRIORITÉ',
  'CA_FY25','CA_FY26','CA_FY27','DERNIER_QUARTER_ACTIF',
  'DATE_DERNIER_APPEL','STATUT_APPEL','NOTES_APPEL','DATE_RELANCE','TRACKER_LINK',
];

var STATUT_APPEL_OPTIONS = ['À appeler','Appelé–RDV','Sans suite','Onboardé','Refus'];

var SELL_IN_DRIVE_ID = '1z8j5NISu5uMtIds8qV_oaBLkWUiyE4x54n5uWzD5Q0A';

function _syncOnboarding(body, user) {
  if (!user || (user.role !== 'ADMIN' && user.role !== 'CHANNEL_MANAGER'))
    return _json({ ok: false, erreur: 'Réservé aux profils ADMIN et CHANNEL_MANAGER' });
  try {
    var n = creerOngletOnboarding();
    return _json({ ok: true, lignes: n, message: n + ' revendeurs SELL IN dans EMPOWER_ONBOARDING' });
  } catch(e) {
    return _json({ ok: false, erreur: e.toString() });
  }
}

function creerOngletOnboarding() {
  var ss = _getSpreadsheet('EMPOWER_MDB');
  var NOMS_CDS = {1000:'Tadjidine',4001:'Lyes',4002:'Mehdi',4003:'Johanne',5000:'Alexandra'};

  // ── 1. Lire le fichier SELL IN Drive (source unique) ──────────
  var ssIn = SpreadsheetApp.openById(SELL_IN_DRIVE_ID);
  var shData = _trouverOngletSellIn(ssIn);

  var raw = shData.getDataRange().getValues();
  Logger.log('[creerOnglet] Onglet: "' + shData.getName() + '" · ' + (raw.length-1) + ' lignes de données');
  if (raw.length < 2) throw new Error('SELL IN Drive : aucune donnée dans la feuille DATA');

  var hd   = raw[0].map(function(x) { return String(x).trim().toUpperCase(); });
  Logger.log('[creerOnglet] Headers: ' + hd.slice(0,10).join(' | '));
  var iQ   = hd.indexOf('QUARTER');
  var iRes = hd.indexOf('RESELLER');
  var iCh  = hd.indexOf('CHANNEL');
  var iCA  = hd.indexOf('CA_EUR');
  if (iQ < 0 || iRes < 0 || iCA < 0)
    throw new Error('Colonnes manquantes dans DATA : QUARTER=' + iQ + ' RESELLER=' + iRes + ' CA_EUR=' + iCA);

  // Pivot par RESELLER : CA par quarter + canal
  var pivot = {};
  for (var r = 1; r < raw.length; r++) {
    var row = raw[r];
    var res = String(row[iRes] || '').trim();
    var qtr = String(row[iQ]   || '').trim();
    var ch  = iCh >= 0 ? String(row[iCh] || '').trim() : '';
    var ca  = parseFloat(String(row[iCA] || '0').replace(/[€\s]/g,'').replace(',','.')) || 0;
    if (!res || !qtr) continue;
    if (!pivot[res]) pivot[res] = { canal: ch || 'REVENDEUR', raw: res };
    pivot[res][qtr] = (pivot[res][qtr] || 0) + ca;
    if (ch && ch !== pivot[res].canal) pivot[res].canal = ch; // dernier canal vu
  }

  // Calculer totaux FY par RESELLER
  var r2 = function(n) { return Math.round(n * 100) / 100; };
  var QQ25 = ['Q1FY25','Q2FY25','Q3FY25','Q4FY25'];
  var QQ26 = ['Q1FY26','Q2FY26','Q3FY26','Q4FY26'];
  Object.keys(pivot).forEach(function(res) {
    var p = pivot[res];
    p.CA_FY25   = r2(QQ25.reduce(function(s,q){ return s + (p[q]||0); }, 0));
    p.CA_FY26   = r2(QQ26.reduce(function(s,q){ return s + (p[q]||0); }, 0));
    p.CA_Q1FY27 = r2(p['Q1FY27'] || 0);
    // Dernier quarter actif (le plus récent avec CA > 0)
    var ordres = ['Q1FY27','Q4FY26','Q3FY26','Q2FY26','Q1FY26','Q4FY25','Q3FY25','Q2FY25','Q1FY25'];
    p.dqActif = '';
    for (var i = 0; i < ordres.length; i++) {
      if ((p[ordres[i]] || 0) > 0) { p.dqActif = ordres[i]; break; }
    }
    // Statut EMPOWER
    if (p.CA_Q1FY27 > 0)        p.statutEmpower = '✅ ACTIF';
    else if (p.CA_FY26 > 0)     p.statutEmpower = '⚠️ À VÉRIFIER';
    else                         p.statutEmpower = '❌ NON ACTIF';
  });

  // ── 2. Lookup CDS depuis 🏢_COMPTES (UNIQUEMENT pour COMMERCIAL_ATTRIBUÉ) ──
  var cdsMap = {}; // norm(Nom_Compte) → pin
  var shC = null;
  ss.getSheets().forEach(function(s) {
    if (!shC && s.getName().replace(/[^\w]/g,'').toUpperCase().indexOf('COMPTES') >= 0
        && s.getName().indexOf('HISTORIQUES') < 0) shC = s;
  });
  if (shC) {
    var cVals = shC.getDataRange().getValues();
    var cH    = cVals[0];
    var cNom  = cH.indexOf('Nom_Compte');
    var cPin  = cH.indexOf('PIN_CDS_Assigne');
    if (cNom >= 0 && cPin >= 0) {
      for (var cr = 1; cr < cVals.length; cr++) {
        var cnorm = _normNomGs(String(cVals[cr][cNom] || ''));
        if (cnorm && !cdsMap[cnorm]) cdsMap[cnorm] = Number(cVals[cr][cPin] || 0);
      }
    }
  }
  Logger.log('[creerOnglet] cdsMap: ' + Object.keys(cdsMap).length + ' comptes MDB · pivot: ' + Object.keys(pivot).length + ' revendeurs SELL IN');

  // ── 3. Sauvegarder les champs manuels de l'onglet existant ────
  var MANUAL_FIELDS = ['DATE_DERNIER_APPEL','STATUT_APPEL','NOTES_APPEL','DATE_RELANCE'];
  var existantes = {};
  var shO = ss.getSheetByName('EMPOWER_ONBOARDING');
  if (shO) {
    var oVals = shO.getDataRange().getValues();
    if (oVals.length > 1) {
      var oH   = oVals[0];
      var oNom = oH.indexOf('NOM_COMPTE');
      for (var ro = 1; ro < oVals.length; ro++) {
        var on = _normNomGs(String(oVals[ro][oNom] || ''));
        if (!on) continue;
        var manual = {};
        MANUAL_FIELDS.forEach(function(f) {
          var idx = oH.indexOf(f);
          if (idx >= 0) manual[f] = oVals[ro][idx];
        });
        existantes[on] = manual;
      }
    }
    ss.deleteSheet(shO);
  }

  // ── 4. Construire les lignes (source = pivot SELL IN uniquement) ─
  var lignes = [];
  Object.keys(pivot).forEach(function(res) {
    var p    = pivot[res];
    var norm = _normNomGs(res);
    var pin  = cdsMap[norm] || 0;
    var comm = NOMS_CDS[pin] || (pin ? 'PIN ' + pin : '—');
    var ca   = { ca25: p.CA_FY25, ca26: p.CA_FY26, ca27: p.CA_Q1FY27, dqActif: p.dqActif };
    var prio = _calculerPriorite(ca, p.statutEmpower);
    var manual = existantes[norm] || {};

    var ligne = new Array(ONBOARDING_HEADERS.length).fill('');
    var set = function(col, val) {
      var i = ONBOARDING_HEADERS.indexOf(col);
      if (i >= 0) ligne[i] = val !== undefined && val !== null ? val : '';
    };
    set('NOM_COMPTE',            res);
    set('CANAL',                 p.canal);
    set('COMMERCIAL_ATTRIBUÉ',   comm);
    set('STATUT_EMPOWER',        p.statutEmpower);
    set('PRIORITÉ',              prio);
    set('CA_FY25',               p.CA_FY25 || '');
    set('CA_FY26',               p.CA_FY26 || '');
    set('CA_FY27',               p.CA_Q1FY27 || '');
    set('DERNIER_QUARTER_ACTIF', p.dqActif || '');
    MANUAL_FIELDS.forEach(function(f) { set(f, manual[f] || ''); });
    set('TRACKER_LINK',          pin ? '→ ' + NOMS_CDS[pin] : '⚠️ À attribuer');
    lignes.push(ligne);
  });

  // Trier : 🔴 HIGH, 🟠 MEDIUM, 🟢 LOW
  var prioOrd = {'🔴 HIGH': 0, '🟠 MEDIUM': 1, '🟢 LOW': 2};
  var iPrio   = ONBOARDING_HEADERS.indexOf('PRIORITÉ');
  lignes.sort(function(a, b) {
    return (prioOrd[a[iPrio]] ?? 9) - (prioOrd[b[iPrio]] ?? 9);
  });

  // ── 5. Écrire l'onglet ─────────────────────────────────────────
  shO = ss.insertSheet('EMPOWER_ONBOARDING');
  shO.getRange(1, 1, 1, ONBOARDING_HEADERS.length).setValues([ONBOARDING_HEADERS]).setFontWeight('bold');
  if (lignes.length > 0) {
    shO.getRange(2, 1, lignes.length, ONBOARDING_HEADERS.length).setValues(lignes);
  }

  // Dropdown STATUT_APPEL
  var statutAppelCol = ONBOARDING_HEADERS.indexOf('STATUT_APPEL') + 1;
  if (lignes.length > 0 && statutAppelCol > 0) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUT_APPEL_OPTIONS, true)
      .setAllowInvalid(false)
      .build();
    shO.getRange(2, statutAppelCol, lignes.length, 1).setDataValidation(rule);
  }

  shO.setFrozenRows(1);
  SpreadsheetApp.flush();
  Logger.log('✅ EMPOWER_ONBOARDING : ' + lignes.length + ' comptes');
  return lignes.length;
}

function _dernierQuarterActif(row, headers) {
  var quarters = ['Q4FY26','Q3FY26','Q2FY26','Q1FY26','Q4FY25','Q3FY25','Q2FY25','Q1FY25'];
  for (var i = 0; i < quarters.length; i++) {
    var idx = headers.indexOf(quarters[i]);
    if (idx >= 0 && Number(row[idx] || 0) > 0) return quarters[i];
  }
  return '';
}

function _calculerPriorite(ca, statut) {
  var SEUIL_CA = 5000; // €
  var moisDepuisFY26Q4 = 6; // approximation : Q4FY26 ≈ > 6 mois

  var actifEmpower = statut && statut !== '❌ NON ACTIF' && statut !== '' && statut !== 'ARCHIVE';
  if (actifEmpower) return '🟢 LOW';

  var ca26 = ca.ca26 || 0;
  var ca27 = ca.ca27 || 0;
  var dq   = ca.dqActif || '';

  // Actif récemment (FY27 ou Q3-Q4 FY26)
  if (ca27 > 0 || dq === 'Q3FY26' || dq === 'Q4FY26') return '🟢 LOW';

  // Dernier achat entre 3 et 6 mois (Q1-Q2 FY26)
  if (dq === 'Q1FY26' || dq === 'Q2FY26') return '🟠 MEDIUM';

  // Aucun achat depuis > 6 mois ou jamais onboardé avec CA > seuil
  if (ca26 > SEUIL_CA || ca.ca25 > SEUIL_CA) return '🔴 HIGH';
  if (!dq && (ca26 > 0 || ca.ca25 > 0)) return '🔴 HIGH';

  return '🟠 MEDIUM';
}

// ══════════════════════════════════════════════════════════════
//  V5 — RÉFÉRENTIEL CDS / PERMISSIONS / DASHBOARD
// ══════════════════════════════════════════════════════════════

// Source unique des commerciaux (BUG1). Tadjidine ET Alexandra peuvent
// attribuer à n'importe quel CDS — le filtrage de QUI peut attribuer est
// géré côté frontend (ADMIN + CHANNEL_MANAGER), la liste reste complète.
var CDS_LIST = [
  { pin: 1000, nom: 'Tadjidine', role: 'ADMIN' },
  { pin: 4001, nom: 'Lyes',      role: 'CDS' },
  { pin: 4002, nom: 'Mehdi',     role: 'CDS' },
  { pin: 4003, nom: 'Johanne',   role: 'CDS' },
  { pin: 5000, nom: 'Alexandra', role: 'CHANNEL_MANAGER' },
];

// BUG1 — liste dynamique des CDS pour tous les dropdowns du front.
function _lireCDS() {
  return _json({ ok: true, cds: CDS_LIST });
}

// BUG5 — onglets visibles par rôle. Le front masque tout onglet absent
// de cette liste. PRIMES retiré pour CHANNEL_MANAGER, OBJECTIFS conservé.
function _lirePermissions(user) {
  var PERMS = {
    'ADMIN':           ['home','tracker','comptes','visites','phoning','objectifs','onboarding','reporting'],
    'CDS':             ['home','tracker','comptes','visites','phoning','objectifs'],
    'CHANNEL_MANAGER': ['home','tracker','objectifs','onboarding','reporting'],
  };
  return _json({ ok: true, role: user.role, onglets: PERMS[user.role] || [] });
}

// BUG6 — agrégats HOME calculés côté backend, filtrés par rôle.
// CDS → portefeuille personnel ; ADMIN / CHANNEL_MANAGER → vue globale équipe.
// Le front choisit quelles cards afficher selon le rôle.
function _lireDashboard(user) {
  var ss = _getSpreadsheet('EMPOWER_MDB');
  var pin = Number(user.pin);
  var estManager = (user.role === 'ADMIN' || user.role === 'CHANNEL_MANAGER');

  function lignes(nom) {
    var sh = ss.getSheetByName(nom);
    if (!sh || sh.getLastRow() < 2) return { headers: [], rows: [] };
    var vals = sh.getDataRange().getValues();
    return { headers: vals[0].map(String), rows: vals.slice(1) };
  }
  function idx(h, n) { return h.indexOf(n); }

  // ── 🏢_COMPTES ──
  var C = lignes('🏢_COMPTES');
  var cCAQ1 = idx(C.headers, 'CA_Q1FY27');
  var cStat = idx(C.headers, 'STATUT_COMPTE');
  var cPin  = idx(C.headers, 'PIN_CDS_Assigne');
  var caFY27 = 0, comptesActifs = 0, activite265Actifs = 0, activite265Total = 0;
  C.rows.forEach(function(r) {
    var dansPortef = estManager || (cPin >= 0 && Number(r[cPin]) === pin);
    activite265Total++;
    var ca = cCAQ1 >= 0 ? (parseFloat(r[cCAQ1]) || 0) : 0;
    var actif = cStat >= 0 && String(r[cStat]).toUpperCase() === 'ACTIF';
    if (ca > 0) activite265Actifs++;
    if (dansPortef) {
      caFY27 += ca;
      if (actif) comptesActifs++;
    }
  });

  // ── 📋_PROSPECTS (Flavie + DELETED exclus) ──
  var P = lignes('📋_PROSPECTS');
  var pStat = idx(P.headers, 'STATUT_EMPOWER');
  var pPrem = idx(P.headers, 'PREMIERE_COMMANDE_DATE');
  var pOrig = idx(P.headers, 'ORIGINE');
  var pSrc  = idx(P.headers, 'Source_Import');
  var pFlag = idx(P.headers, 'Flag_traite');
  var pPin  = idx(P.headers, 'PIN_CDS_Assigne');
  var leadsOnboarding = 0, comptesOnboardes = 0, onboardingTerrain = 0;
  P.rows.forEach(function(r) {
    var src = pSrc >= 0 ? String(r[pSrc]).toUpperCase() : '';
    if (src.indexOf('FLAVIE') >= 0 || src.indexOf('BASE_PROSPECTS_RELANCER') >= 0) return;
    if (pFlag >= 0 && String(r[pFlag]).toUpperCase() === 'DELETED') return;
    if (!estManager && pPin >= 0 && Number(r[pPin]) !== pin) return;
    if (pStat >= 0 && String(r[pStat]).toUpperCase() === 'INTEGRE') leadsOnboarding++;
    if (pPrem >= 0 && String(r[pPrem]).trim() !== '') comptesOnboardes++;
    if (pOrig >= 0 && String(r[pOrig]).toUpperCase().indexOf('TRACKER') >= 0) onboardingTerrain++;
  });

  // ── 📞_PHONING ──
  var PH = lignes('📞_PHONING');
  var phPin = idx(PH.headers, 'PIN_CDS');
  var suiviPhoning = 0, phoningEquipe = 0;
  PH.rows.forEach(function(r) {
    phoningEquipe++;
    if (phPin >= 0 && Number(r[phPin]) === pin) suiviPhoning++;
  });

  // ── 🗺️_VISITES ──
  var VI = lignes('🗺️_VISITES');
  var viPin = idx(VI.headers, 'PIN_CDS');
  var visites = 0, visitesEquipe = 0;
  VI.rows.forEach(function(r) {
    visitesEquipe++;
    if (viPin >= 0 && Number(r[viPin]) === pin) visites++;
  });

  return _json({
    ok: true,
    role: user.role,
    cards: {
      caFY27:            Math.round(caFY27 * 100) / 100,
      comptesActifs:     comptesActifs,
      suiviPhoning:      suiviPhoning,
      visites:           visites,
      leadsOnboarding:   leadsOnboarding,
      comptesOnboardes:  comptesOnboardes,
      onboardingTerrain: onboardingTerrain,
      visitesEquipe:     visitesEquipe,
      phoningEquipe:     phoningEquipe,
      activite265:       { actifs: activite265Actifs, total: activite265Total },
    },
  });
}

// F3 — saisie manuelle du CA réalisé par quarter, en complément du sync SELL IN.
// Écrit dans 🎯_OBJECTIFS_PRIMES (colonne Qx_CA_Realise) pour le PIN courant.
// Un CDS ne met à jour que SON CA ; un ADMIN peut viser un autre PIN (body.pinCible).
// body: { quarter: 'Q1'|'Q2'|'Q3'|'Q4', montant: Number, pinCible?: Number }
function _mettreAJourCA(body, user) {
  body = body || {};
  var quarter = String(body.quarter || '').toUpperCase().trim();
  if (['Q1','Q2','Q3','Q4'].indexOf(quarter) < 0)
    return _json({ ok: false, erreur: 'Quarter invalide (attendu Q1..Q4)' });
  var montant = parseFloat(String(body.montant).replace(',', '.'));
  if (isNaN(montant) || montant < 0)
    return _json({ ok: false, erreur: 'Montant CA invalide' });

  var pinCible = body.pinCible ? Number(body.pinCible) : Number(user.pin);
  if (pinCible !== Number(user.pin) && user.role !== 'ADMIN')
    return _json({ ok: false, erreur: 'Non autorisé — vous ne pouvez saisir que votre propre CA' });

  var sh = _getSpreadsheet('EMPOWER_MDB').getSheetByName('🎯_OBJECTIFS_PRIMES');
  if (!sh) return _json({ ok: false, erreur: 'Onglet 🎯_OBJECTIFS_PRIMES introuvable' });

  var vals    = sh.getDataRange().getValues();
  var headers = vals[0];
  var iPin    = headers.indexOf('PIN_CDS');
  var iCol    = headers.indexOf(quarter + '_CA_Realise');
  if (iPin < 0 || iCol < 0)
    return _json({ ok: false, erreur: 'Colonnes PIN_CDS / ' + quarter + '_CA_Realise introuvables' });

  for (var r = 1; r < vals.length; r++) {
    if (Number(vals[r][iPin]) === pinCible) {
      sh.getRange(r + 1, iCol + 1).setValue(montant);
      SpreadsheetApp.flush();
      _log(user.pin, 'mettreAJourCA', pinCible + ' ' + quarter + '=' + montant);
      return _json({ ok: true, pin: pinCible, quarter: quarter, montant: montant });
    }
  }
  return _json({ ok: false, erreur: 'Aucune ligne objectifs pour le PIN ' + pinCible });
}

// BUG2 — purge ADMIN de la base résiduelle Flavie : marquage Flag_traite='DELETED'
// (soft-delete, non destructif). Cible les lignes Source_Import FLAVIE / BASE_PROSPECTS_RELANCER.
function _purgerProspectsBase(body, user) {
  if (!user || user.role !== 'ADMIN')
    return _json({ ok: false, erreur: 'Réservé aux administrateurs' });

  var sh = _getSpreadsheet('EMPOWER_MDB').getSheetByName('📋_PROSPECTS');
  if (!sh) return _json({ ok: false, erreur: 'Onglet 📋_PROSPECTS introuvable' });

  var vals    = sh.getDataRange().getValues();
  var headers = vals[0];
  var iSrc    = headers.indexOf('Source_Import');
  var iFlag   = headers.indexOf('Flag_traite');
  if (iSrc < 0 || iFlag < 0)
    return _json({ ok: false, erreur: 'Colonnes Source_Import / Flag_traite introuvables' });

  var purges = 0;
  for (var r = 1; r < vals.length; r++) {
    var src = String(vals[r][iSrc] || '').toUpperCase();
    var dejaSupprime = String(vals[r][iFlag] || '').toUpperCase() === 'DELETED';
    if (!dejaSupprime && (src.indexOf('FLAVIE') >= 0 || src.indexOf('BASE_PROSPECTS_RELANCER') >= 0)) {
      sh.getRange(r + 1, iFlag + 1).setValue('DELETED');
      purges++;
    }
  }
  SpreadsheetApp.flush();
  _log(user.pin, 'purgerProspectsBase', purges + ' prospects base marqués DELETED');
  return _json({ ok: true, purges: purges });
}

// ⚙️ F1 — Migration colonnes APPEL_FROID dans 📞_PHONING.
// À exécuter UNE FOIS manuellement depuis l'éditeur Apps Script si la MDB existe déjà.
// Ajoute Type_Appel, Interet_Score, Questionnaire_JSON sans toucher aux données.
function migrerColonnesPhoning() {
  var sh = _getSpreadsheet('EMPOWER_MDB').getSheetByName('📞_PHONING');
  if (!sh) throw new Error('Onglet 📞_PHONING introuvable');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var COLS = ['Type_Appel', 'Interet_Score', 'Questionnaire_JSON'];
  var added = 0;
  COLS.forEach(function(c) {
    if (headers.indexOf(c) < 0) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(c).setFontWeight('bold');
      added++;
    }
  });
  SpreadsheetApp.flush();
  Logger.log('✅ migrerColonnesPhoning : ' + added + ' colonne(s) ajoutée(s)');
  return added;
}
