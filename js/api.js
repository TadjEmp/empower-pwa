// ═══════════════════════════════════════
//  api.js — EMPOWER ESI API Layer v6.0
//  Backend : Supabase (PostgreSQL) — remplace GAS v5.0
//  Même surface publique : login, lire, ecrire, mettreAJour,
//  lireCDS, lireDashboard, mettreAJourCA, uploadPhoto
//  Cache IndexedDB · Offline queue · Dedup inflight
// ═══════════════════════════════════════

const SUPABASE_URL  = 'https://osqwtonwomhalxeidayp.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zcXd0b253b21oYWx4ZWlkYXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDk2NjYsImV4cCI6MjA5NzM4NTY2Nn0.98TzvM8dz_SPRJVv6ZMomiW8aj6vjd6pFG3d4RXQkPU'

const SheetsAPI = {
  TOKEN:       null,
  TTL:         1800,
  MAX_RETRY:   3,
  RETRY_BASE_MS: 800,
  _inflight:   new Map(),
  _db:         null,
  _online:     true,
  _sb:         null,

  async init() {
    this._sb     = supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
    this._db     = await this._ouvrirIDB()
    this._online = navigator.onLine
    window.addEventListener('online',  () => { this._online = true;  this._syncQueue() })
    window.addEventListener('offline', () => { this._online = false })
    console.info('[API] v6.0 Supabase · online=' + this._online)
  },

  // ── LOGIN ────────────────────────────────────────────
  // Hash identique GAS : SHA256(motdepasse + salt)
  async login(email, motdepasse) {
    try {
      if (!email || !motdepasse) return { ok: false, erreur: 'Email et mot de passe requis' }
      const emailNorm = email.trim().toLowerCase()
      const { data: users, error } = await this._sb
        .from('utilisateurs')
        .select('email,hash,salt,pin,nom,role,actif')
        .eq('email', emailNorm)
        .limit(1)
      if (error) throw new Error(error.message)
      if (!users || users.length === 0)
        return { ok: false, erreur: 'Email ou mot de passe incorrect' }
      const u = users[0]
      if (!u.actif) return { ok: false, erreur: 'Compte désactivé' }
      const hash = await this._sha256(motdepasse + u.salt)
      if (hash !== u.hash) return { ok: false, erreur: 'Email ou mot de passe incorrect' }
      const token  = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
      const expiry = Date.now() + 8 * 3600 * 1000
      // Stocker token en DB (traçabilité optionnelle, ignore erreur)
      this._sb.from('utilisateurs').update({ token, token_expiry: expiry }).eq('email', emailNorm)
        .then(() => {}).catch(() => {})
      return {
        ok: true, token, expiry,
        utilisateur: { email: u.email, pin: Number(u.pin), nom: u.nom, role: u.role },
      }
    } catch(e) {
      return { ok: false, erreur: this._online ? e.message : 'Connexion impossible hors-ligne' }
    }
  },

  _gererAuthExpiree(data) {
    if (data?.erreur === 'AUTH') {
      Session.deconnecter()
      Toast.afficher('🔒 Session expirée — reconnectez-vous', 'warning', 4000)
      Router.aller('#/login')
      throw new Error('Session expirée')
    }
  },

  // ── SHA-256 (identique GAS _sha256) ──────────────────
  async _sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
    return Array.from(new Uint8Array(buf)).map(b => ('0' + b.toString(16)).slice(-2)).join('')
  },

  // ── TABLE MAPPING : onglet GAS → table Supabase ──────
  _tableMap: {
    '🏢_COMPTES': 'comptes', 'COMPTES': 'comptes',
    '🎯_OBJECTIFS_PRIMES': 'objectifs_primes', 'OBJECTIFS_PRIMES': 'objectifs_primes',
    '📊_PARAMS': 'params', '⚙️_PARAMS': 'params', 'PARAMS': 'params',
    '🔔_NOTIFS': 'notifs', 'NOTIFS': 'notifs',
    '📅_VISITES': 'visites', '🗺️_VISITES': 'visites', 'VISITES': 'visites',
    '📞_PHONING': 'phoning', 'PHONING': 'phoning',
    '🛒_NSB_COMMANDES': 'nsb_commandes', 'NSB_COMMANDES': 'nsb_commandes',
    '📋_PROSPECTS': 'leads', 'LEADS': 'leads',
    '📝_ACTIONS': 'actions', '📊_ACTIONS': 'actions', 'ACTIONS': 'actions',
    '👤_UTILISATEURS': 'utilisateurs', 'UTILISATEURS': 'utilisateurs',
  },

  // Tables volontairement vides (table physique absente — ne jamais interroger).
  _tablesVides: ['PROSPECTS', 'prospects', '_prospects'],

  _resolveTable(onglet) {
    return this._tableMap[onglet] || onglet.toLowerCase().replace(/[^a-z_]/g, '')
  },

  _estTableVide(onglet) {
    return this._tablesVides.includes(onglet) ||
           this._tablesVides.includes(this._resolveTable(onglet))
  },

  // ── DB → GAS : transformation colonnes lecture ────────
  _MAPS_DB_TO_GAS: {
    comptes: {
      id_compte_gas: 'ID_Compte', nom_compte: 'Nom_Compte', ville: 'Ville',
      code_postal: 'Code_Postal', departement: 'Departement', tel: 'Tel', email: 'Email',
      pin_cds_assigne: 'PIN_CDS_Assigne', nom_cds: 'Nom_CDS',
      canal: 'CANAL', secteur: 'SECTEUR', has_empower: 'Has_EMPOWER',
      flag_action: 'Flag_Action', priorite: 'Priorite', statut_compte: 'Statut',
      ca_fy25: 'CA_FY25', ca_fy26: 'CA_FY26', ca_q1fy27: 'CA_Q1FY27',
      date_derniere_action: 'Date_Derniere_Action', type_derniere_action: 'Type_Derniere_Action',
      prochaine_action: 'Prochaine_Action', date_prochaine_action: 'Date_Prochaine_Action',
      slider_receptivite: 'Slider_Receptivite', note_initiale: 'Note_Initiale',
      flag_traite: 'Flag_Traite', flag_converti: 'Flag_Converti',
      latitude: 'GPS_Lat', longitude: 'GPS_Lng',
      date_sync_sellin: 'Date_Sync_SelIn', semaine_sync: 'Semaine_Sync',
      badge_visite_froid: 'Badge_Visite_Froid', id: '_uuid',
    },
    objectifs_primes: {
      pin_cds: 'PIN_CDS', nom_cds: 'Nom_CDS',
      q1_obj_initial: 'Q1_Obj_Initial', q1_obj_revise: 'Q1_Obj_Revise', q1_ca_realise: 'Q1_CA_Realise',
      q2_obj_initial: 'Q2_Obj_Initial', q2_obj_revise: 'Q2_Obj_Revise', q2_ca_realise: 'Q2_CA_Realise',
      q3_obj_initial: 'Q3_Obj_Initial', q3_obj_revise: 'Q3_Obj_Revise', q3_ca_realise: 'Q3_CA_Realise',
      q4_obj_initial: 'Q4_Obj_Initial', q4_obj_revise: 'Q4_Obj_Revise', q4_ca_realise: 'Q4_CA_Realise',
      prime_q1: 'Prime_Q1', prime_q2: 'Prime_Q2', prime_q3: 'Prime_Q3', prime_q4: 'Prime_Q4',
      fy27_obj: 'FY27_Obj', bonus_manager_eligible: 'Bonus_Manager_Eligible', id: '_uuid',
    },
    visites: {
      id_visite_gas: 'ID_Visite',
      date_visite: 'Date',           // vue-visites.js utilise v.Date et v.Date_Planif
      heure: 'Heure', semaine_iso: 'Semaine_ISO',
      pin_cds: 'PIN_CDS', nom_cds: 'Nom_CDS', nom_compte: 'Nom_Compte',
      type_visite: 'Type_Visite', source_visite: 'Source_Visite',
      objectif_visite: 'Objectif_Visite', resultat_visite: 'Resultat_Visite',
      statut: 'Statut_Visite',       // statut avec valeur traduite (voir _transformRow)
      interlocuteur_nom: 'Interlocuteur', interlocuteur_fonction: 'Interlocuteur_Fonction',
      slider_receptivite: 'Slider_Receptivite', resum_ia: 'Resume_IA',
      photo_url: 'Photo_URL', note: 'Note_Privee',
      gps_lat: 'GPS_Lat', gps_lng: 'GPS_Lng',
      created_at: 'Timestamp',       // vue utilise v.Timestamp pour calculs délais
      id: '_uuid',
    },
    phoning: {
      id_appel_gas: 'ID_Appel', date_appel: 'Date', semaine_iso: 'Semaine_ISO',
      pin_cds: 'PIN_CDS', nom_cds: 'Nom_CDS', reseller: 'Reseller',
      statut_appel: 'Statut_Appel', interet_empower: 'Interet_EMPOWER', note: 'Note', id: '_uuid',
    },
    actions: {
      id_action_gas: 'ID_Action', date_action: 'Date_Action', type_action: 'Type_Action',
      source: 'Source', pin_cds: 'PIN_CDS', nom_compte: 'Nom_Compte',
      statut_avant: 'Statut_Avant', statut_apres: 'Statut_Apres', resum_ia: 'Resum_IA', id: '_uuid',
    },
    notifs: {
      id_notif_gas: 'ID_Notif', date_envoi: 'Date_Envoi', pin_destinataire: 'PIN_Destinataire',
      type_notif: 'Type_Notif', message: 'Message', id_cible: 'ID_Cible', statut_lu: 'Statut_Lu',
      id: '_uuid',
    },
    params: {
      parametre: 'Parametre', valeur: 'Valeur', description: 'Description', id: '_uuid',
    },
    leads: {
      id_prospect_gas: 'ID_Prospect', nom_compte: 'Nom_Compte', ville: 'Ville',
      code_postal: 'Code_Postal', departement: 'Departement', tel: 'Tel', email: 'Email',
      canal: 'CANAL', secteur: 'SECTEUR', statut: 'STATUT_EMPOWER', potentiel: 'POTENTIEL',
      pin_cds_assigne: 'PIN_CDS_Assigne', nom_cds: 'Nom_CDS', pin_channel: 'PIN_Channel',
      nom_channel: 'Nom_Channel', origine: 'ORIGINE',
      date_saisie: 'Date_Import', date_attribution: 'Date_Attribution',
      date_relance: 'Date_Relance', date_creation_compte: 'Date_Creation_Compte',
      date_integration: 'Date_Integration', date_archive: 'Date_Archive',
      welcome_pack_envoye: 'Welcome_Pack_Envoye', welcome_pack_date: 'Welcome_Pack_Date',
      note: 'Note_initiale', flag_alerte: 'FLAG_ALERTE', id_compte_gas: 'ID_Compte_Gas',
      id: '_uuid',
    },
  },

  // DB statut → GAS label pour table visites
  _VISITES_STATUT_DB_TO_GAS: {
    realisee: 'réalisée', planifiee: 'planifiée',
    en_cours: 'en cours',  manquee: 'manquée', annulee: 'annulée',
  },
  // GAS label → DB statut pour table visites (écriture)
  _VISITES_STATUT_GAS_TO_DB: {
    'réalisée': 'realisee', 'planifiée': 'planifiee',
    'en cours': 'en_cours', 'manquée': 'manquee', 'annulée': 'annulee',
  },

  _transformRow(table, row) {
    const map = this._MAPS_DB_TO_GAS[table]
    if (!map) return row
    const out = {}
    for (const [dbCol, gasCol] of Object.entries(map)) {
      if (row[dbCol] !== undefined) out[gasCol] = row[dbCol]
    }
    // Alias Date_Planif = Date pour vue-visites.js (utilise les deux)
    if (table === 'visites' && out.Date) out.Date_Planif = out.Date
    // Traduction valeur statut visites (DB sans accent → GAS avec accent)
    if (table === 'visites' && out.Statut_Visite) {
      out.Statut_Visite = this._VISITES_STATUT_DB_TO_GAS[out.Statut_Visite] || out.Statut_Visite
    }
    return out
  },

  // ── GAS → DB : transformation colonnes écriture ──────
  _MAPS_GAS_TO_DB: {
    comptes: {
      'ID_Compte': 'id_compte_gas', 'Nom_Compte': 'nom_compte', 'Ville': 'ville',
      'Code_Postal': 'code_postal', 'Departement': 'departement', 'Tel': 'tel', 'Email': 'email',
      'PIN_CDS_Assigne': 'pin_cds_assigne', 'Nom_CDS': 'nom_cds',
      'CANAL': 'canal', 'SECTEUR': 'secteur', 'Has_EMPOWER': 'has_empower',
      'Flag_Action': 'flag_action', 'Priorite': 'priorite', 'Statut': 'statut_compte',
      'CA_FY25': 'ca_fy25', 'CA_FY26': 'ca_fy26', 'CA_Q1FY27': 'ca_q1fy27',
      'Date_Derniere_Action': 'date_derniere_action', 'Type_Derniere_Action': 'type_derniere_action',
      'Prochaine_Action': 'prochaine_action', 'Date_Prochaine_Action': 'date_prochaine_action',
      'Slider_Receptivite': 'slider_receptivite', 'Note_Initiale': 'note_initiale',
      'Flag_Traite': 'flag_traite', 'Flag_Converti': 'flag_converti',
      'GPS_Lat': 'latitude', 'GPS_Lng': 'longitude',
      'Source_Import': 'source_import', 'Badge_Visite_Froid': 'badge_visite_froid',
      'STATUT_COMPTE': 'statut_compte', 'Interet_EMPOWER': 'interet_empower',
      'FLAG_ALERTE_ALEXANDRA': 'flag_alerte_alexandra',
    },
    visites: {
      'ID_Visite': 'id_visite_gas', 'Date': 'date_visite', 'Date_Planif': 'date_visite',
      'Heure': 'heure', 'Semaine_ISO': 'semaine_iso',
      'PIN_CDS': 'pin_cds', 'Nom_CDS': 'nom_cds', 'Nom_Compte': 'nom_compte',
      'Type_Visite': 'type_visite', 'Source_Visite': 'source_visite',
      'Objectif_Visite': 'objectif_visite', 'Resultat_Visite': 'resultat_visite',
      'Statut_Visite': 'statut',   // valeur traduite par _toDBRow (voir ci-dessous)
      'Resume_IA': 'resum_ia', 'Slider_Receptivite': 'slider_receptivite',
      'Interlocuteur': 'interlocuteur_nom', 'Interlocuteur_Fonction': 'interlocuteur_fonction',
      'Photo_URL': 'photo_url', 'Note_Privee': 'note', 'GPS_Lat': 'gps_lat', 'GPS_Lng': 'gps_lng',
    },
    phoning: {
      'ID_Appel': 'id_appel_gas', 'Date': 'date_appel', 'Semaine_ISO': 'semaine_iso',
      'PIN_CDS': 'pin_cds', 'Nom_CDS': 'nom_cds', 'Reseller': 'reseller',
      'Statut_Appel': 'statut_appel', 'Interet_EMPOWER': 'interet_empower', 'Note': 'note',
    },
    actions: {
      'ID_Action': 'id_action_gas', 'Date_Action': 'date_action', 'Type_Action': 'type_action',
      'Source': 'source', 'PIN_CDS': 'pin_cds', 'Nom_Compte': 'nom_compte',
      'Statut_Avant': 'statut_avant', 'Statut_Apres': 'statut_apres', 'Resum_IA': 'resum_ia',
    },
    notifs: {
      'ID_Notif': 'id_notif_gas', 'Date_Envoi': 'date_envoi', 'PIN_Destinataire': 'pin_destinataire',
      'Type_Notif': 'type_notif', 'Message': 'message', 'ID_Cible': 'id_cible', 'Statut_Lu': 'statut_lu',
    },
    params: { 'Parametre': 'parametre', 'Valeur': 'valeur', 'Description': 'description' },
    leads: {
      'ID_Prospect': 'id_prospect_gas', 'Nom_Compte': 'nom_compte', 'Ville': 'ville',
      'Code_Postal': 'code_postal', 'Departement': 'departement', 'Tel': 'tel', 'Email': 'email',
      'CANAL': 'canal', 'SECTEUR': 'secteur', 'STATUT_EMPOWER': 'statut', 'POTENTIEL': 'potentiel',
      'PIN_CDS_Assigne': 'pin_cds_assigne', 'Nom_CDS': 'nom_cds', 'PIN_Channel': 'pin_channel',
      'Nom_Channel': 'nom_channel', 'ORIGINE': 'origine',
      'Date_Import': 'date_saisie', 'Date_Attribution': 'date_attribution',
      'Date_Relance': 'date_relance', 'Date_Creation_Compte': 'date_creation_compte',
      'Date_Integration': 'date_integration', 'Date_Archive': 'date_archive',
      'Welcome_Pack_Envoye': 'welcome_pack_envoye', 'Welcome_Pack_Date': 'welcome_pack_date',
      'Note_initiale': 'note', 'FLAG_ALERTE': 'flag_alerte', 'ID_Compte_Gas': 'id_compte_gas',
    },
    objectifs_primes: {
      'PIN_CDS': 'pin_cds', 'Nom_CDS': 'nom_cds',
      'Q1_Obj_Initial': 'q1_obj_initial', 'Q1_Obj_Revise': 'q1_obj_revise', 'Q1_CA_Realise': 'q1_ca_realise',
      'Q2_Obj_Initial': 'q2_obj_initial', 'Q2_Obj_Revise': 'q2_obj_revise', 'Q2_CA_Realise': 'q2_ca_realise',
      'Q3_Obj_Initial': 'q3_obj_initial', 'Q3_Obj_Revise': 'q3_obj_revise', 'Q3_CA_Realise': 'q3_ca_realise',
      'Q4_Obj_Initial': 'q4_obj_initial', 'Q4_Obj_Revise': 'q4_obj_revise', 'Q4_CA_Realise': 'q4_ca_realise',
    },
  },

  _toDBRow(table, gasRow) {
    const map = this._MAPS_GAS_TO_DB[table]
    if (!map) return gasRow
    const out = {}
    for (const [gasKey, dbKey] of Object.entries(map)) {
      if (gasRow[gasKey] !== undefined) out[dbKey] = gasRow[gasKey]
    }
    // Colonnes déjà en snake_case passent directement
    for (const [k, v] of Object.entries(gasRow)) {
      if (!map[k] && k === k.toLowerCase()) out[k] = v
    }
    // Traduction inverse statut visites (GAS avec accent → DB sans accent)
    if (table === 'visites' && out.statut) {
      out.statut = this._VISITES_STATUT_GAS_TO_DB[out.statut] || out.statut
    }
    return out
  },

  // ── LECTURE ──────────────────────────────────────────
  async lire(fichier, onglet, opts = {}) {
    const { limit, offset, nocache } = opts
    if (this._estTableVide(onglet)) return limit != null ? { data: [], total: 0, count: 0 } : []
    const table = this._resolveTable(onglet)
    const k = limit != null ? `${table}::${offset||0}:${limit}` : table
    if (!limit && this._inflight.has(k)) return this._inflight.get(k)
    const p = this._lireAvecFallback(table, k, { limit, offset, nocache })
    if (!limit) { this._inflight.set(k, p); p.finally(() => this._inflight.delete(k)) }
    return p
  },

  async _lireAvecFallback(table, cacheKey, opts = {}) {
    const { limit, offset, nocache } = opts
    const cached = await this._getCached(cacheKey)
    if (!this._online) {
      if (cached) return cached
      throw new Error(`Offline — aucun cache pour ${table}`)
    }
    const frais = !nocache && cached && !(await this._estExpire(cacheKey))
    if (frais) return cached
    try {
      let q = this._sb.from(table).select('*')
      if (limit != null) q = q.range(offset || 0, (offset || 0) + limit - 1)
      const { data, error, count } = await q
      if (error) throw new Error(error.message)
      const rows = (data || []).map(r => this._transformRow(table, r))
      if (!limit) await this._setCached(cacheKey, rows)
      return limit != null ? { data: rows, total: count, count: rows.length } : rows
    } catch(e) {
      if (cached) { Toast.afficher('📶 Mode hors-ligne — données en cache', 'warning', 4000); return cached }
      throw e
    }
  },

  // ── ÉCRITURE ─────────────────────────────────────────
  async ecrire(fichier, onglet, donnee) {
    if (this._estTableVide(onglet)) return { ok: true, skipped: true }
    const table  = this._resolveTable(onglet)
    const dbRow  = this._toDBRow(table, donnee)
    if (!this._online) {
      await this._queueAdd({ op: 'insert', table, row: dbRow })
      await this._invalidate(table)
      Toast.afficher('📥 Sauvegardé hors-ligne', 'info')
      return { ok: true, offline: true }
    }
    const { error } = await this._sb.from(table).insert(dbRow)
    if (error) throw new Error(error.message)
    await this._invalidate(table)
    return { ok: true }
  },

  // ── MISE À JOUR ──────────────────────────────────────
  async mettreAJour(fichier, onglet, id, champs) {
    if (this._estTableVide(onglet)) return { ok: true, skipped: true }
    const table   = this._resolveTable(onglet)
    const dbChamps = this._toDBRow(table, champs)
    if (!this._online) {
      await this._queueAdd({ op: 'update', table, id, champs: dbChamps })
      Toast.afficher('📥 Modification en attente', 'info')
      return { ok: true, offline: true }
    }
    let q = this._sb.from(table).update(dbChamps)
    // Déterminer la clé métier par table
    const gasKeyMap = {
      comptes:  'id_compte_gas',
      visites:  'id_visite_gas',
      phoning:  'id_appel_gas',
      actions:  'id_action_gas',
      notifs:   'id_notif_gas',
      params:   'parametre',
      leads:    'id_prospect_gas',
    }
    const gasKey = gasKeyMap[table]
    if (gasKey && typeof id === 'string' && !id.match(/^[0-9a-f-]{36}$/i)) {
      q = q.eq(gasKey, id)
    } else {
      q = q.eq('id', id)
    }
    const { error } = await q
    if (error) throw new Error(error.message)
    await this._invalidate(table)
    return { ok: true }
  },

  // ── lireCDS ──────────────────────────────────────────
  async lireCDS() {
    try {
      const { data, error } = await this._sb.from('utilisateurs')
        .select('pin,nom,role,email').eq('actif', true).order('pin')
      if (error) throw new Error(error.message)
      return (data || []).map(u => ({ pin: Number(u.pin), nom: u.nom, role: u.role, email: u.email }))
    } catch(e) { return null }
  },

  // ── lirePermissions ───────────────────────────────────
  async lirePermissions() { return null },

  // ── lireDashboard ─────────────────────────────────────
  async lireDashboard() {
    try {
      const voitTout = typeof Session !== 'undefined' && Session.voitTout()
      const pin      = typeof Session !== 'undefined' ? Session.pin : null
      let q = this._sb.from('comptes')
        .select('statut_compte,pin_cds_assigne,ca_fy25,ca_fy26,ca_q1fy27,priorite,nom_compte')
      if (!voitTout && pin) q = q.eq('pin_cds_assigne', pin)
      const { data: comptes } = await q
      const total  = (comptes || []).length
      const actifs = (comptes || []).filter(c => Number(c.ca_q1fy27||0) > 0).length
      const react  = (comptes || []).filter(c => !Number(c.ca_q1fy27||0) && Number(c.ca_fy26||0) > 0).length
      const caQ1   = (comptes || []).reduce((s,c) => s + Number(c.ca_q1fy27||0), 0)
      const caFy26 = (comptes || []).reduce((s,c) => s + Number(c.ca_fy26||0), 0)
      const { count: nbVisites } = await this._sb.from('visites').select('id',{count:'exact',head:true})
        .eq('pin_cds', pin || 0)
      const { count: nbAppels } = await this._sb.from('phoning').select('id',{count:'exact',head:true})
        .eq('pin_cds', pin || 0)
      return {
        ok: true,
        kpi: { total, actifs, react, caQ1, caFy26, nbVisites: nbVisites||0, nbAppels: nbAppels||0 },
        comptes: (comptes||[]).map(c => this._transformRow('comptes', c)),
      }
    } catch(e) { return { ok: false, erreur: e.message } }
  },

  // ── mettreAJourCA ─────────────────────────────────────
  async mettreAJourCA(quarter, montant, pinCible) {
    try {
      const pin = pinCible || (typeof Session !== 'undefined' ? Session.pin : null)
      const colMap = {
        'Q1FY27': 'q1_ca_realise', 'Q2FY27': 'q2_ca_realise',
        'Q3FY27': 'q3_ca_realise', 'Q4FY27': 'q4_ca_realise',
        'Q1FY26': 'q1_ca_realise', 'Q2FY26': 'q2_ca_realise',
      }
      const col = colMap[quarter] || 'q1_ca_realise'
      const { error } = await this._sb.from('objectifs_primes')
        .update({ [col]: montant }).eq('pin_cds', pin)
      if (error) throw new Error(error.message)
      await this._invalidate('objectifs_primes')
      return { ok: true }
    } catch(e) { return { ok: false, erreur: e.message } }
  },

  // ── uploadPhoto ───────────────────────────────────────
  async uploadPhoto(dataUrl, nomFichier) {
    try {
      const base64 = dataUrl.split(',')[1] || dataUrl
      const blob   = await fetch(`data:image/jpeg;base64,${base64}`).then(r => r.blob())
      const path   = `photos/${nomFichier}`
      const { error } = await this._sb.storage.from('empower-photos').upload(path, blob, {
        contentType: 'image/jpeg', upsert: true,
      })
      if (error) throw new Error(error.message)
      const { data: { publicUrl } } = this._sb.storage.from('empower-photos').getPublicUrl(path)
      return { ok: true, url: publicUrl }
    } catch(e) {
      console.warn('[API] uploadPhoto:', e.message)
      return { ok: false, erreur: e.message }
    }
  },

  async viderCache(fichier, onglet) {
    if (fichier && onglet) return this._invalidate(this._resolveTable(onglet))
    const db = this._db
    const tx = db.transaction(['cache','meta'], 'readwrite')
    tx.objectStore('cache').clear()
    tx.objectStore('meta').clear()
  },

  // ── INDEXEDDB ────────────────────────────────────────
  _ouvrirIDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('EMPOWER_CACHE', 3)
      r.onupgradeneeded = e => {
        const db = e.target.result
        // Purge cache+meta sur upgrade (nouveau mapping colonnes visites v6.5)
        if (e.oldVersion < 3) {
          ;['cache','meta'].forEach(s => { if (db.objectStoreNames.contains(s)) db.deleteObjectStore(s) })
        }
        ;['cache','meta','queue'].forEach(s => {
          if (!db.objectStoreNames.contains(s))
            db.createObjectStore(s, s === 'queue' ? { keyPath:'id', autoIncrement:true } : { keyPath:'key' })
        })
      }
      r.onsuccess = e => { this._db = e.target.result; res(e.target.result) }
      r.onerror   = () => rej(r.error)
    })
  },

  _getCached(key) {
    return new Promise(res => {
      const tx = this._db.transaction('cache','readonly')
      const r  = tx.objectStore('cache').get(key)
      r.onsuccess = () => res(r.result?.data || null)
      r.onerror   = () => res(null)
    })
  },

  _setCached(key, data) {
    return new Promise((res, rej) => {
      const tx = this._db.transaction(['cache','meta'],'readwrite')
      tx.objectStore('cache').put({ key, data })
      tx.objectStore('meta').put({ key, ts: Date.now() })
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
  },

  _invalidate(key) {
    return new Promise(res => {
      const tx = this._db.transaction(['cache','meta'],'readwrite')
      tx.objectStore('cache').delete(key)
      tx.objectStore('meta').delete(key)
      tx.oncomplete = res; tx.onerror = res
    })
  },

  _estExpire(key) {
    return new Promise(res => {
      const tx = this._db.transaction('meta','readonly')
      const r  = tx.objectStore('meta').get(key)
      r.onsuccess = () => {
        const m = r.result
        res(!m || (Date.now() - m.ts) / 1000 > this.TTL)
      }
      r.onerror = () => res(true)
    })
  },

  _queueAdd(payload) {
    return new Promise((res, rej) => {
      const tx = this._db.transaction('queue','readwrite')
      tx.objectStore('queue').add({ payload, ts: Date.now() })
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
  },

  async _syncQueue() {
    const all = await new Promise(res => {
      const tx = this._db.transaction('queue','readonly')
      const r  = tx.objectStore('queue').getAll()
      r.onsuccess = () => res(r.result || [])
      r.onerror   = () => res([])
    })
    if (!all.length) return
    Toast.afficher(`🔄 Sync ${all.length} action(s)…`, 'info', 3000)
    let ok = 0
    for (const item of all) {
      try {
        const { op, table, row, id, champs } = item.payload
        let err
        if (op === 'insert') ({ error: err } = await this._sb.from(table).insert(row))
        if (op === 'update') ({ error: err } = await this._sb.from(table).update(champs).eq('id', id))
        if (!err) {
          await new Promise(res2 => {
            const tx = this._db.transaction('queue','readwrite')
            tx.objectStore('queue').delete(item.id)
            tx.oncomplete = res2
          })
          ok++
        }
      } catch {}
    }
    Toast.afficher(`✅ ${ok}/${all.length} sync`, ok === all.length ? 'succes' : 'warning', 3000)
  },
}
