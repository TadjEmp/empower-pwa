// ═══════════════════════════════════════
//  vue-questionnaire.js — Formulaire visite terrain V6
//  9 blocs : Identification · Profil revendeur · Objectifs ·
//  Checklist terrain · Freins · Concurrents · Grossistes ·
//  Résultat & Suite · Validation
//  Source : QUESTIONNAIRE VISITES TERRAIN.txt
//  Alerte EMPOWER → Alexandra (CHANNEL_MANAGER)
// ═══════════════════════════════════════

window.VueQuestionnaire = {

  ETAPES: [
    'Identification', 'Profil revendeur', 'Objectifs visite',
    'Checklist terrain', 'Freins identifiés', 'Concurrents',
    'Grossistes', 'Résultat & Suite', 'Validation',
  ],

  TYPES_REVENDEUR: [
    '🖥️ MSP', '🔧 Intégrateur / SSII', '🛠️ Réparateur informatique',
    '🏪 Généraliste informatique', '📦 VAR', '🏬 Boutique indépendante',
    '☁️ Prestataire Cloud / SaaS', '🔒 Cybersécurité spécialisé',
  ],

  CLIENTELES: [
    '👤 Particuliers / Grand public', '🏢 TPE/PME (1-50 sal.)',
    '🏛️ Collectivités / Secteur public', '💼 Grandes entreprises / ETI',
    '🖥️ Sociétés IT / ESN', '🏥 Santé / médical',
    '🎓 Éducation', '🏗️ BTP / Industrie',
  ],

  CANAUX_VENTE: [
    '🏪 Vente physique en boutique', '🌐 Site internet / e-commerce',
    '🛒 Marketplace (Amazon, Fnac…)', '🤝 Vente directe chez client',
    '📧 Vente à distance (tél/email)', '🔗 Portail partenaire / revendeur',
  ],

  ACTIVITES: [
    '🖥️ Vente de matériel informatique', '🔧 Services et entretien',
    '🛠️ Réparation / dépannage', '💡 Conseil et audit',
    '📋 Abonnements / contrats récurrents', '☁️ Infogérance / cloud géré',
    '🔒 Cybersécurité managée (SOC/EDR)', '🖨️ Reprographie / bureautique',
    '📱 Téléphonie / mobilité',
  ],

  SITUATIONS_GEO: [
    '🏙️ Centre-ville', '🏭 Zone Industrielle (ZI)',
    '🏘️ Zone commerciale / périphérie', '🏠 Domicile / télétravail',
    '🌐 100% numérique',
  ],

  OBJECTIFS_VISITE: [
    '🎓 Formation vendeurs sur gamme Norton', '🚀 Intégration EMPOWER',
    '🤝 Conclusion de l\'accord', '📅 Visite suivie / RDV planifié',
    '❄️ Prospection à froid', '🔄 Renouvellement partenariat',
  ],

  FREINS: [
    { id: '❌ Norton ne correspond pas à la cible', argu: '<strong>Gamme NSB dédiée TPE/PME</strong> — 1 à 20 postes, clé en main. Non substituable aux solutions entreprise.' },
    { id: '💰 Tarifs perçus comme excessifs',       argu: '<strong>Revenus récurrents +25% sur 3 ans via EMPOWER.</strong> ROI revendeur prouvé. Portail EMPOWER : calcul marge en temps réel.' },
    { id: '🔄 Travaille déjà avec un autre éditeur', argu: '<strong>Complémentaire, non substituable.</strong> Norton = grand public + TPE, pas concurrentiel. Proposez un run parallèle.' },
    { id: '📉 Mauvais historique Norton',            argu: '<strong>Nouveau programme EMPOWER 2025.</strong> Support dédié + formation incluse + accompagnement CDS personnalisé.' },
    { id: '⏳ Pas le temps de former les équipes',   argu: '<strong>Formation EMPOWER 30 min à distance.</strong> Sans contrainte horaire. Norton s\'occupe de l\'essentiel de l\'intégration.' },
    { id: '🤷 Manque de visibilité sur les marges',  argu: '<strong>Portail EMPOWER — calcul marge en temps réel.</strong> Offres enregistrées, accès immédiat. ESD zéro rupture.' },
    { id: '📦 Problème de stock / approvisionnement', argu: '<strong>ESD disponible immédiatement.</strong> Zéro rupture sur le numérique — livraison instantanée à la commande.' },
  ],

  CONCURRENTS: [
    'ESET', 'Kaspersky', 'Bitdefender', 'Malwarebytes', 'Trend Micro',
    'Sophos', 'Avast Business', 'Acronis', 'Webroot', 'McAfee / Trellix',
    'CoffieSoft', 'Autre',
  ],

  GROSSISTES: [
    '⭐ TD Synnex', '⭐ Ingram Micro', 'Also', 'BeMSP', 'Cris Réseaux',
    'Acadie', 'Distribution DS', 'Asialand', 'Exertis Connect',
    'Réseaux exclusifs', 'Watsoft', 'Autre',
  ],

  MARKETING_SUPPORTS: ['PLV', 'Fiches produits', 'Affichage vitrine', 'Démo en rayon'],
  NORTON_FORMATS:     ['ESD', 'Boîte', 'Les deux'],
  PROCHAINES_ACTIONS: ['Rappel', 'RDV', 'Envoi devis', 'Onboarding EMPOWER', 'Aucune'],

  state: null,
  _visitePlanifiee: null,
  _isHorsBase: false,

  _etatInitial() {
    const now = new Date();
    return {
      etape: 0, chargement: true, envoiEnCours: false,
      comptes: [], prospects: [],
      typeSource: 'EXISTANT',
      cible: null,
      dernieresVisites: [],
      recherche: '', suggestionsOuvertes: false,
      gps: { lat: '', lng: '' },
      debut: Date.now(),
      photos: [],
      d: {
        // Étape 0
        date:  dateISOLocale(now),
        heure: now.toTimeString().slice(0, 5),
        interlocuteurNom: '', interlocuteurFonction: '',
        // Étape 1
        typeRevendeur: [],
        clientelePrincipale: [],
        canalVente: [],
        activitesPrincipales: [],
        situationGeo: '',
        // Étape 2
        objectifsVisite: [],
        // Étape 3
        nortonReference: '',
        nortonFormat: [],
        empowerPartenaire: '',
        empowerInteresse: '',
        marketingPresent: '',
        marketingSupports: [],
        decideurRencontre: '',
        decideurNom: '',
        decideurFonction: '',
        // Étapes 4-6
        freins: [],
        concurrents: [],
        autreConcurrent: '',
        grossistes: [],
        autreGrossiste: '',
        // Étape 7
        resultatVisite: '',
        commentaireLibre: '',
        prochaineAction: '',
        prochaineActionDate: '',
        // Compatibilité
        note: '', resumeIA: '', score: 3,
        prochaineActionTexte: '',
      },
    };
  },

  async init(idCible = null) {
    this.state = this._etatInitial();
    this.render();
    try {
      const [comptes, prospects] = await Promise.all([
        SheetsAPI.lire('EMPOWER_MDB', '🏢_COMPTES'),
        SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS'),
      ]);
      this.state.comptes   = comptes.filter(c => Session.voitTout() || Number(c.PIN_CDS_Assigne) === Session.pin);
      this.state.prospects = prospects.filter(p => Session.voitTout() || !p.PIN_CDS_Assigne || Number(p.PIN_CDS_Assigne) === Session.pin);

      if (idCible) {
        const c = comptes.find(x => String(x.ID_Compte) === String(idCible));
        const p = !c && prospects.find(x => String(x.ID_Prospect) === String(idCible));
        if (c) { this.state.cible = c; this.state.typeSource = 'EXISTANT'; }
        if (p) { this.state.cible = p; this.state.typeSource = 'PROSPECT'; }
        if (this.state.cible) {
          this.state.recherche = this.state.cible.Nom_Compte;
          this._chargerDernieresVisites();
        }
      }
      // Pré-remplissage depuis visite planifiée
      if (this._visitePlanifiee) {
        const vp = this._visitePlanifiee;
        this.state.d.date  = vp.Date  || this.state.d.date;
        this.state.d.heure = vp.Heure || this.state.d.heure;
        if (vp.Note_Privee) this.state.d.note = vp.Note_Privee;
      }
      this.state.chargement = false;
      this.render();
      this._capturerGPS();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML = `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  _capturerGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { this.state.gps = { lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }; },
      ()  => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  },

  get sourceListe() { return this.state.typeSource === 'EXISTANT' ? this.state.comptes : this.state.prospects; },
  get suggestions() {
    const q = normaliserNom(this.state.recherche);
    if (q.length < 2) return [];
    return this.sourceListe.filter(c => normaliserNom(c.Nom_Compte).includes(q)).slice(0, 6);
  },

  setSource(s) {
    this.state.typeSource = s; this.state.cible = null; this.state.recherche = ''; this.render();
  },

  setRecherche(v) {
    this.state.recherche = v;
    this.state.suggestionsOuvertes = true;
    if (this.state.cible && v !== this.state.cible.Nom_Compte) this.state.cible = null;
    this._renderSuggestions();
  },

  choisirCible(idx) {
    this.state.cible = this.suggestions[idx];
    this.state.recherche = this.state.cible.Nom_Compte;
    this.state.suggestionsOuvertes = false;
    this.state.dernieresVisites = [];
    this.render();
    this._chargerDernieresVisites();
  },

  async _chargerDernieresVisites() {
    const s = this.state;
    if (!s.cible) { s.dernieresVisites = []; return; }
    const idCible = s.typeSource === 'PROSPECT' ? s.cible.ID_Prospect : s.cible.ID_Compte;
    try {
      const visites = await SheetsAPI.lire('EMPOWER_MDB', '🗺️_VISITES');
      s.dernieresVisites = visites
        .filter(v => String(v.ID_Cible) === String(idCible))
        .sort((a, b) => new Date(b.Timestamp || b.Date) - new Date(a.Timestamp || a.Date))
        .slice(0, 3);
    } catch { s.dernieresVisites = []; }
    if (s.etape === 0) this.render();
  },

  _renderSuggestions() {
    const zone = document.getElementById('q-suggestions');
    if (!zone) return;
    zone.innerHTML = (this.state.suggestionsOuvertes ? this.suggestions : []).map((c, i) => `
      <div class="q-arbre-btn" style="margin-top:4px" onclick="VueQuestionnaire.choisirCible(${i})">
        <strong>${c.Nom_Compte}</strong>
        <span style="color:var(--c-text-2);font-size:12px"> · ${c.Ville||'—'}${c.STATUT_COMPTE?' · '+c.STATUT_COMPTE:''}</span>
      </div>`).join('');
  },

  set(champ, val)  { this.state.d[champ] = val; },
  setR(champ, val) { this.state.d[champ] = val; this.render(); },
  toggleListe(champ, val) {
    const l = this.state.d[champ];
    const i = l.indexOf(val);
    i >= 0 ? l.splice(i, 1) : l.push(val);
    this.render();
  },

  _chips(champ, options) {
    return `<div class="q-chips">${options.map(o => `
      <button type="button" class="q-chip ${this.state.d[champ].includes(o)?'active':''}"
              onclick="VueQuestionnaire.toggleListe('${champ}','${o.replace(/'/g,"\\'")}')">${o}</button>`).join('')}</div>`;
  },

  _radios(champ, options) {
    return `<div class="q-chips">${options.map(o => `
      <button type="button" class="q-chip ${this.state.d[champ]===o?'active':''}"
              onclick="VueQuestionnaire.setR('${champ}','${o.replace(/'/g,"\\'")}')">${o}</button>`).join('')}</div>`;
  },

  async ajouterPhoto(input) {
    if (!input.files?.length) return;
    if (this.state.photos.length >= 4) { Toast.afficher('4 photos maximum', 'warning'); return; }
    const file = input.files[0];
    const dataUrl = await new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, 800 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = img.width * ratio; cv.height = img.height * ratio;
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.7));
      };
      img.src = URL.createObjectURL(file);
    });
    this.state.photos.push(dataUrl);
    this.render();
  },

  supprimerPhoto(i) { this.state.photos.splice(i, 1); this.render(); },

  _enregistre: false,
  async dicter() {
    if (this._enregistre) { GroqAPI.arreterEnregistrement(); return; }
    // Info RGPD avant 1er enregistrement
    const key = 'esi_rgpd_vocal_ok';
    if (!localStorage.getItem(key)) {
      const ok = confirm('ℹ️ Conformément au RGPD, aucun fichier audio ne sera stocké côté serveur.\nSeule la transcription textuelle sera conservée.\n\nEn continuant, vous acceptez cette condition.');
      if (!ok) return;
      localStorage.setItem(key, '1');
    }
    try {
      this._enregistre = true;
      const btn = document.getElementById('btn-dictee');
      if (btn) btn.textContent = '⏹ Arrêter (30s max)';
      await GroqAPI.demarrerEnregistrement(async blob => {
        this._enregistre = false;
        Toast.afficher('🤖 Transcription en cours…', 'info');
        try {
          const txt = await GroqAPI.transcrire(blob);
          this.state.d.note = (this.state.d.note ? this.state.d.note + '\n' : '') + txt;
          const q = await GroqAPI.qualifier(txt, {
            compte: this.state.cible?.Nom_Compte,
            statut: this.state.cible?.STATUT_COMPTE,
          });
          if (q.resume) this.state.d.resumeIA = q.resume;
          if (q.score)  this.state.d.score = q.score;
          if (q.actionrecommandee && !this.state.d.prochaineActionTexte)
            this.state.d.prochaineActionTexte = q.actionrecommandee;
          Toast.afficher('✅ Résumé IA généré', 'succes');
        } catch(e) { Toast.afficher('❌ IA : ' + e.message, 'erreur'); }
        this.render();
      });
    } catch(e) {
      this._enregistre = false;
      Toast.afficher('🎙️ Micro inaccessible : ' + e.message, 'erreur');
    }
  },

  suivant() {
    if (this.state.etape === 0 && !this.state.cible) {
      Toast.afficher('Sélectionnez un compte ou un prospect', 'warning'); return;
    }
    this.state.etape = Math.min(this.state.etape + 1, this.ETAPES.length - 1);
    this.render(); window.scrollTo(0, 0);
  },
  precedent() {
    if (this.state.etape === 0) { history.back(); return; }
    this.state.etape--; this.render(); window.scrollTo(0, 0);
  },

  async valider() {
    if (this.state.envoiEnCours) return;
    this.state.envoiEnCours = true;
    this.render();
    const s = this.state, d = s.d;
    const estProspect = s.typeSource === 'PROSPECT';
    const idCible = estProspect ? s.cible.ID_Prospect : s.cible.ID_Compte;
    const dureeMin = Math.round((Date.now() - s.debut) / 60000);
    const empowerAlerte = d.empowerPartenaire === 'NON' && d.empowerInteresse === 'OUI';

    const typeVisite = d.objectifsVisite.includes('🚀 Intégration EMPOWER') ? 'ONBOARDING_EMPOWER'
      : d.objectifsVisite.includes('❄️ Prospection à froid') ? 'PROSPECTION_FROIDE'
      : d.objectifsVisite.includes('🔄 Renouvellement partenariat') ? 'SUIVI_ACTIF'
      : 'SUIVI_ACTIF';

    const arbEMPOWER = d.resultatVisite === 'Positif' && d.prochaineAction === 'Onboarding EMPOWER' ? 'COMMANDE'
      : empowerAlerte ? 'INTERESSE'
      : d.empowerPartenaire === 'OUI' ? 'EN_COURS'
      : 'N/A';

    try {
      let photoURLs = [];
      for (const [i, p] of s.photos.entries()) {
        try {
          const r = await SheetsAPI.uploadPhoto(p, `${idCible}_${d.date}_${i+1}.jpg`);
          if (r?.url) photoURLs.push(r.url);
        } catch { /* photo ignorée si upload KO */ }
      }

      const visite = {
        ID_Visite:               genId('VIS'),
        Date:                    d.date,
        Heure:                   d.heure,
        Semaine_ISO:             getISOWeek(new Date(d.date)),
        PIN_CDS:                 Session.pin,
        Nom_CDS:                 Session.nom,
        ID_Cible:                idCible,
        Nom_Compte:              s.cible.Nom_Compte,
        Type_Visite:             typeVisite,
        Source_Visite:           'ESI_V21',
        Type_Revendeur:          d.typeRevendeur.join(', '),
        Clientele_Principale:    JSON.stringify(d.clientelePrincipale),
        Canal_Vente:             JSON.stringify(d.canalVente),
        Activites_Principales:   JSON.stringify(d.activitesPrincipales),
        Situation_Geo:           d.situationGeo,
        Objectifs_Visite:        JSON.stringify(d.objectifsVisite),
        Interlocuteur_Nom:       d.interlocuteurNom,
        Interlocuteur_Fonction:  d.interlocuteurFonction,
        Contact_Direct:          d.interlocuteurNom ? 'Oui' : 'Non',
        Norton_Reference:        d.nortonReference,
        Norton_Format:           d.nortonFormat.join(', '),
        Empower_Partenaire:      d.empowerPartenaire,
        Empower_Interesse:       d.empowerInteresse,
        Marketing_Present:       d.marketingPresent,
        Marketing_Supports:      d.marketingSupports.join(', '),
        Decideur_Rencontre:      d.decideurRencontre,
        Decideur_Nom:            d.decideurNom,
        Decideur_Fonction:       d.decideurFonction,
        Freins_JSON:             JSON.stringify(d.freins),
        Concurrent_Actuel:       d.concurrents.join(', '),
        Concurrents_JSON:        JSON.stringify(d.concurrents),
        Grossistes_JSON:         JSON.stringify([...d.grossistes, ...(d.autreGrossiste ? [d.autreGrossiste] : [])]),
        Resultat_Visite:         d.resultatVisite,
        Arbre_EMPOWER_Statut:    arbEMPOWER,
        FLAG_ALERTE_ALEXANDRA:   empowerAlerte ? 'OUI' : '',
        Slider_Receptivite:      d.score,
        Note_Privee:             [d.note, d.commentaireLibre, d.resumeIA ? `[IA] ${d.resumeIA}` : ''].filter(Boolean).join('\n'),
        Prochaine_Action_Texte:  d.prochaineAction + (d.prochaineActionTexte ? ' — ' + d.prochaineActionTexte : ''),
        Prochaine_Action_Date:   d.prochaineActionDate,
        Photo_URL:               photoURLs.join(' | '),
        GPS_Lat:                 s.gps.lat,
        GPS_Lng:                 s.gps.lng,
        Duree_Minutes:           dureeMin,
        Timestamp:               new Date().toISOString(),
      };
      // BLOC 3 — Si visite planifiée existante : mettre à jour plutôt que créer un doublon
      if (this._visitePlanifiee?.ID_Visite) {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '🗺️_VISITES', this._visitePlanifiee.ID_Visite, {
          ...visite,
          ID_Visite: this._visitePlanifiee.ID_Visite, // conserver l'ID original
          Statut_Visite: 'réalisée',
        });
      } else {
        await SheetsAPI.ecrire('EMPOWER_MDB', '🗺️_VISITES', visite);
      }

      // Vider le cache dashboard pour que les vues amont reflètent la visite immédiatement
      SheetsAPI.viderCache('EMPOWER_MDB', '🗺️_VISITES').catch(() => {});
      SheetsAPI.viderCache('EMPOWER_MDB', '📊_ACTIONS').catch(() => {});

      // Mise à jour fiche compte / prospect
      const champsMaj = { Date_prochaine_action: d.prochaineActionDate, Flag_traite: 'TRUE' };
      if (estProspect) {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', idCible, champsMaj);
      } else {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', idCible, {
          ...champsMaj,
          Date_Derniere_Action: d.date,
          Type_Derniere_Action: 'Visite',
          Prochaine_action: d.prochaineAction,
          Slider_Receptivite: d.score,
          ...(empowerAlerte ? { Interet_EMPOWER: 'OUI', Date_Interet_EMPOWER: d.date } : {}),
        });
      }

      // Log 📊_ACTIONS
      await SheetsAPI.ecrire('EMPOWER_MDB', '📊_ACTIONS', {
        ID_Action:    genId('ACT'),
        Date_Action:  new Date().toISOString(),
        Type_Action:  'Visite',
        Source:       'ESI_V21',
        PIN_CDS:      Session.pin,
        Nom_Compte:   s.cible.Nom_Compte,
        Statut_Avant: s.cible.STATUT_COMPTE || s.cible.Statut || '',
        Statut_Apres: arbEMPOWER,
        Resum_IA:     d.resumeIA || `Visite ${d.resultatVisite} — réceptivité ${d.score}/5`,
        GPS_Lat:      s.gps.lat,
        GPS_Lng:      s.gps.lng,
        Timestamp:    new Date().toISOString(),
      });

      // Alerte Alexandra si EMPOWER détecté
      if (empowerAlerte) {
        await SheetsAPI.ecrire('EMPOWER_MDB', '📊_ACTIONS', {
          ID_Action:    genId('ALR'),
          Date_Action:  new Date().toISOString(),
          Type_Action:  'ALERTE_EMPOWER_ALEXANDRA',
          Source:       'ESI_V21',
          PIN_CDS:      Session.pin,
          Nom_Compte:   s.cible.Nom_Compte,
          Statut_Avant: '',
          Statut_Apres: 'INTERESSE_EMPOWER',
          Resum_IA:     `Intérêt EMPOWER détecté lors d'une visite terrain par ${Session.nom}`,
          GPS_Lat:      '',
          GPS_Lng:      '',
          Timestamp:    new Date().toISOString(),
        });
        Toast.afficher('🔔 Alerte EMPOWER envoyée à Alexandra', 'info', 4000);
      }

      // BLOC 1 — détecter si c'est une visite hors-base pour proposer "Ajouter à ma base"
      this._isHorsBase = this._visitePlanifiee?.Source_Visite === 'HORS_BASE';
      this._visitePlanifiee = null;
      this._renderSucces(dureeMin, empowerAlerte);
    } catch(e) {
      this.state.envoiEnCours = false;
      this.render();
      Toast.afficher('❌ Erreur enregistrement : ' + e.message, 'erreur', 5000);
    }
  },

  // BLOC 1 — Ajouter le prospect à froid dans la base du commercial
  async _ajouterAMaBase() {
    const s = this.state;
    if (!s?.cible) { Toast.afficher('Aucun compte à ajouter', 'warning'); return; }
    const nom = s.cible.Nom_Compte || '';
    if (!nom) { Toast.afficher('Nom du compte manquant', 'warning'); return; }
    try {
      // Vérifier s'il existe déjà (anti-doublon par nom normalisé)
      const existants = await SheetsAPI.lire('EMPOWER_MDB', '📋_PROSPECTS');
      const dejaDans = existants.find(p =>
        normaliserNom(p.Nom_Compte) === normaliserNom(nom) &&
        Number(p.PIN_CDS_Assigne) === Session.pin
      );
      if (dejaDans) {
        Toast.afficher(`"${nom}" est déjà dans votre base`, 'info');
        return;
      }
      await SheetsAPI.ecrire('EMPOWER_MDB', '📋_PROSPECTS', {
        ID_Prospect:     genId('PROS'),
        Nom_Compte:      nom,
        PIN_CDS_Assigne: Session.pin,
        Nom_CDS:         Session.nom,
        STATUT_EMPOWER:  'SAISIE',
        FLAG_ACTION:     'NOUVEAU',
        Source_Import:   'VISITE_TERRAIN',
        Date_Import:     dateISOLocale(),
        Timestamp:       new Date().toISOString(),
      });
      Toast.afficher(`✅ "${nom}" ajouté à votre base`, 'succes');
      // Désactiver le bouton pour éviter le double-clic
      document.querySelectorAll('.succes-btns button').forEach(b => {
        if (b.textContent.includes('Ajouter')) { b.disabled = true; b.textContent = '✅ Ajouté'; }
      });
    } catch(e) { Toast.afficher('❌ ' + e.message, 'erreur'); }
  },

  _renderSucces(dureeMin, empowerAlerte) {
    const d = this.state.d;
    document.getElementById('app').innerHTML = `
      <div class="visite-succes">
        <div class="succes-icone">✅</div>
        <h2>Visite enregistrée</h2>
        <p class="succes-duree">${this.state.cible.Nom_Compte} · ${dureeMin} min</p>
        <div class="succes-recap">
          <div>${d.resultatVisite || '—'} · Réceptivité : ${d.score}/5</div>
          ${d.prochaineAction ? `<div>🎯 ${d.prochaineAction}${d.prochaineActionDate?' — '+dateRelative(d.prochaineActionDate):''}</div>` : ''}
          ${empowerAlerte ? '<div>🔔 Alerte EMPOWER envoyée à Alexandra</div>' : ''}
          ${d.resumeIA ? `<div>🤖 ${d.resumeIA}</div>` : ''}
        </div>
        <div class="succes-btns">
          <button class="btn-primaire" onclick="Router.aller('#/dashboard')">← Dashboard</button>
          <button class="btn-secondaire" onclick="VueQuestionnaire.init()">📋 Nouvelle visite</button>
          <button class="btn-secondaire" onclick="VueVisites.synchroniser();Router.aller('#/visites')" style="background:var(--c-primary);color:#fff">🔄 Synchroniser</button>
          ${this._isHorsBase ? `<button class="btn-secondaire" onclick="VueQuestionnaire._ajouterAMaBase()" style="border-color:var(--c-success);color:var(--c-success)">➕ Ajouter à ma base</button>` : ''}
        </div>
      </div>`;
  },

  // ── RENDER ──
  render() {
    const app = document.getElementById('app');
    if (!this.state || this.state.chargement) {
      app.innerHTML = '<div class="spinner-centre">Préparation du formulaire…</div>';
      return;
    }
    const s = this.state;
    const pct = Math.round((s.etape + 1) / this.ETAPES.length * 100);

    app.innerHTML = `
      <header class="header-vue header-questionnaire">
        <button onclick="VueQuestionnaire.precedent()" class="btn-retour">←</button>
        <div class="questionnaire-compte">
          <div class="q-nom-compte">${s.cible ? s.cible.Nom_Compte : 'Visite terrain'}</div>
          <div class="q-sous-titre">Étape ${s.etape + 1}/${this.ETAPES.length} · ${this.ETAPES[s.etape]}</div>
        </div>
        ${s.gps.lat ? '<span title="GPS capturé">📍</span>' : ''}
      </header>

      <div style="height:6px;background:var(--c-border);border-radius:0">
        <div style="height:100%;width:${pct}%;background:var(--c-cta);transition:width .4s ease"></div>
      </div>

      <div class="q-contenu">
        ${this['_etape' + s.etape]()}
      </div>

      <div class="q-nav-fixe">
        <button class="btn-q-nav btn-q-precedent" onclick="VueQuestionnaire.precedent()">
          ${s.etape === 0 ? 'Annuler' : '← Précédent'}
        </button>
        ${s.etape < this.ETAPES.length - 1
          ? `<button class="btn-q-nav btn-q-suivant" onclick="VueQuestionnaire.suivant()">Suivant →</button>`
          : `<button class="btn-q-nav btn-q-terminer" onclick="VueQuestionnaire.valider()"
               ${s.envoiEnCours ? 'disabled' : ''}>${s.envoiEnCours ? 'Enregistrement…' : '✓ VALIDER LA VISITE'}</button>`}
      </div>
    `;
    this._renderSuggestions();
  },

  // ── BLOC 1 — Identification ──
  _etape0() {
    const s = this.state, d = s.d;
    return `<div class="q-champs">
      <label class="q-label">Statut du compte
        <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface)">
          ${[['EXISTANT','✅ Existant'],['PROSPECT','❄️ Prospect']].map(([v,l]) => `
            <button type="button" style="flex:1;padding:9px;border:none;border-radius:4px;font-weight:600;font-size:14px;cursor:pointer;
              ${s.typeSource===v?'background:var(--c-title);color:#fff':'background:transparent;color:var(--c-text-2)'}"
              onclick="VueQuestionnaire.setSource('${v}')">${l}</button>`).join('')}
        </div>
      </label>
      <label class="q-label">Compte ${s.typeSource==='EXISTANT'?'(base historique)':'(base prospects)'}
        <input class="q-input" placeholder="🔍 Rechercher…" value="${s.recherche}"
               oninput="VueQuestionnaire.setRecherche(this.value)" autocomplete="off"/>
      </label>
      <div id="q-suggestions"></div>
      ${s.cible ? `<div class="q-recap">
        <div class="q-recap-ligne"><span>Ville</span><strong>${s.cible.Ville||'—'}</strong></div>
        <div class="q-recap-ligne"><span>Statut</span><strong>${s.cible.STATUT_COMPTE||s.cible.Statut||'—'}</strong></div>
        ${s.cible.CA_FY25 ? `<div class="q-recap-ligne"><span>CA FY25</span><strong>${formatEuro(s.cible.CA_FY25)}</strong></div>` : ''}
      </div>` : ''}
      ${s.cible && s.dernieresVisites?.length ? `
      <div class="q-recap" style="margin-top:8px">
        <div style="font-size:12px;font-weight:700;color:var(--c-text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">📋 Dernières visites</div>
        ${s.dernieresVisites.map(v => `
        <div style="border-bottom:1px solid var(--c-border);padding:6px 0;font-size:13px">
          <div style="display:flex;justify-content:space-between">
            <strong>${v.Date||'—'}</strong>
            <span style="color:${v.Resultat_Visite==='Positif'||v.Resultat_Visite==='✅ Positif'?'var(--c-success)':v.Resultat_Visite==='Négatif'||v.Resultat_Visite==='❌ Négatif'?'var(--c-danger)':'var(--c-warning)'}">${v.Resultat_Visite||'—'}</span>
            <span style="color:var(--c-text-2)">⭐ ${v.Slider_Receptivite||'?'}/5</span>
          </div>
          ${v.Prochaine_Action_Texte ? `<div style="font-size:11px;color:var(--c-primary);margin-top:2px">→ ${v.Prochaine_Action_Texte}</div>` : ''}
        </div>`).join('')}
      </div>` : ''}
      <div style="display:flex;gap:12px">
        <label class="q-label" style="flex:1">Date *
          <input type="date" class="q-input" value="${d.date}" onchange="VueQuestionnaire.set('date',this.value)"/></label>
        <label class="q-label" style="width:120px">Heure *
          <input type="time" class="q-input" value="${d.heure}" onchange="VueQuestionnaire.set('heure',this.value)"/></label>
      </div>
      <label class="q-label">Interlocuteur rencontré
        <input class="q-input" placeholder="Prénom Nom" value="${d.interlocuteurNom}" oninput="VueQuestionnaire.set('interlocuteurNom',this.value)"/></label>
      <label class="q-label">Fonction
        <input class="q-input" placeholder="Gérant, vendeur, responsable IT…" value="${d.interlocuteurFonction}" oninput="VueQuestionnaire.set('interlocuteurFonction',this.value)"/></label>
    </div>`;
  },

  // ── BLOC 2 — Profil revendeur ──
  _etape1() {
    const d = this.state.d;
    return `<div class="q-champs">
      <p class="q-intro">Type de revendeur <span style="color:var(--c-text-2);font-size:11px">(plusieurs choix)</span></p>
      ${this._chips('typeRevendeur', this.TYPES_REVENDEUR)}
      <p class="q-intro" style="margin-top:14px">Clientèle principale <span style="color:var(--c-text-2);font-size:11px">(plusieurs choix)</span></p>
      ${this._chips('clientelePrincipale', this.CLIENTELES)}
      <p class="q-intro" style="margin-top:14px">Canal de vente <span style="color:var(--c-text-2);font-size:11px">(plusieurs choix)</span></p>
      ${this._chips('canalVente', this.CANAUX_VENTE)}
      <p class="q-intro" style="margin-top:14px">Activités principales <span style="color:var(--c-text-2);font-size:11px">(plusieurs choix)</span></p>
      ${this._chips('activitesPrincipales', this.ACTIVITES)}
      <p class="q-intro" style="margin-top:14px">Situation géographique</p>
      ${this._radios('situationGeo', this.SITUATIONS_GEO)}
    </div>`;
  },

  // ── BLOC 3 — Objectifs visite ──
  _etape2() {
    return `<div class="q-champs">
      <p class="q-intro">Objectifs de cette visite <span style="color:var(--c-text-2);font-size:11px">(plusieurs choix possibles)</span></p>
      ${this._chips('objectifsVisite', this.OBJECTIFS_VISITE)}
    </div>`;
  },

  // ── BLOC 4 — Checklist terrain ──
  _etape3() {
    const d = this.state.d;
    return `<div class="q-champs">

      <div class="q-section-head">📦 Référencement Norton</div>
      <label class="q-label">Norton référencé en rayon ?
        ${this._radios('nortonReference', ['OUI', 'NON'])}</label>
      ${d.nortonReference === 'OUI' ? `
      <label class="q-label">Format disponible
        ${this._chips('nortonFormat', this.NORTON_FORMATS)}</label>` : ''}

      <div class="q-section-head" style="margin-top:14px">🤝 Partenariat EMPOWER</div>
      <label class="q-label">Revendeur partenaire EMPOWER ?
        ${this._radios('empowerPartenaire', ['OUI', 'NON'])}</label>
      ${d.empowerPartenaire === 'NON' ? `
      <div style="padding:10px 12px;background:var(--c-primary-10,#e6eeff);border-radius:var(--radius-sm);border-left:3px solid var(--c-primary);margin-top:4px">
        <div style="font-size:13px;font-weight:600;color:var(--c-primary);margin-bottom:6px">Intéressé par la plateforme EMPOWER ?</div>
        ${this._radios('empowerInteresse', ['OUI', 'NON'])}
        ${d.empowerInteresse === 'OUI' ? `
        <div style="font-size:12px;color:var(--c-primary);margin-top:8px;font-weight:600">
          🔔 Une alerte sera envoyée à Alexandra au moment de la validation.
        </div>` : d.empowerInteresse === 'NON' ? `
        <div style="font-size:12px;color:var(--c-text-2);margin-top:6px">Compte archivé "Non intéressé" EMPOWER.</div>` : ''}
      </div>` : ''}

      <div class="q-section-head" style="margin-top:14px">🎨 Marketing Norton</div>
      <label class="q-label">Marketing Norton présent en point de vente ?
        ${this._radios('marketingPresent', ['OUI', 'NON'])}</label>
      ${d.marketingPresent === 'OUI' ? `
      <label class="q-label">Supports présents ${this._chips('marketingSupports', this.MARKETING_SUPPORTS)}</label>` : ''}

      <div class="q-section-head" style="margin-top:14px">👤 Décideur</div>
      <label class="q-label">Décideur rencontré ?
        ${this._radios('decideurRencontre', ['OUI', 'NON'])}</label>
      ${d.decideurRencontre === 'OUI' ? `
      <div style="display:flex;gap:10px">
        <label class="q-label" style="flex:2">Nom du décideur
          <input class="q-input" value="${d.decideurNom}" oninput="VueQuestionnaire.set('decideurNom',this.value)" placeholder="Prénom Nom"/></label>
        <label class="q-label" style="flex:1">Fonction
          <input class="q-input" value="${d.decideurFonction}" oninput="VueQuestionnaire.set('decideurFonction',this.value)" placeholder="Gérant…"/></label>
      </div>` : ''}
    </div>`;
  },

  // ── BLOC 5 — Freins identifiés ──
  _etape4() {
    const d = this.state.d;
    return `<div class="q-champs">
      <p class="q-intro">Sélectionnez les freins mentionnés — l'argumentaire recommandé s'affiche automatiquement :</p>
      <div class="q-arbre">
        ${this.FREINS.map(f => {
          const actif = d.freins.includes(f.id);
          return `
          <div style="border:1.5px solid ${actif?'var(--c-cta)':'var(--c-border)'};border-radius:var(--radius);overflow:hidden;background:var(--c-surface)">
            <button type="button" class="q-arbre-btn" style="border:none;border-radius:0;width:100%;${actif?'background:#fff5f4':''}"
                    onclick="VueQuestionnaire.toggleListe('freins',${JSON.stringify(f.id)})">
              ${actif?'☑':'☐'} ${f.id}
            </button>
            ${actif?`<div style="padding:12px 16px;border-top:1px solid var(--c-border);font-size:13px;line-height:1.5">
              <span style="color:var(--c-cta);font-weight:700;font-size:11px;text-transform:uppercase">Argumentaire recommandé</span><br>${f.argu}
            </div>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  },

  // ── BLOC 6 — Concurrents présents ──
  _etape5() {
    const d = this.state.d;
    return `<div class="q-champs">
      <p class="q-intro">Concurrents identifiés sur le terrain <span style="color:var(--c-text-2);font-size:11px">(plusieurs choix)</span></p>
      ${this._chips('concurrents', this.CONCURRENTS)}
      ${d.concurrents.includes('Autre') ? `
      <label class="q-label">Préciser le concurrent
        <input class="q-input" value="${d.autreConcurrent}" oninput="VueQuestionnaire.set('autreConcurrent',this.value)" placeholder="Nom du concurrent…"/></label>` : ''}
    </div>`;
  },

  // ── BLOC 7 — Grossistes partenaires ──
  _etape6() {
    const d = this.state.d;
    return `<div class="q-champs">
      <p class="q-intro">Grossistes partenaires du revendeur <span style="color:var(--c-text-2);font-size:11px">(plusieurs choix)</span></p>
      ${this._chips('grossistes', this.GROSSISTES)}
      ${d.grossistes.includes('Autre') ? `
      <label class="q-label">Préciser le grossiste
        <input class="q-input" value="${d.autreGrossiste}" oninput="VueQuestionnaire.set('autreGrossiste',this.value)" placeholder="Nom du grossiste…"/></label>` : ''}
    </div>`;
  },

  // ── BLOC 8 — Résultat & Suite ──
  _etape7() {
    const d = this.state.d;
    return `<div class="q-champs">
      <label class="q-label">Résultat de la visite *
        ${this._radios('resultatVisite', ['✅ Positif', '🟡 Mitigé', '❌ Négatif'])}</label>
      <label class="q-label">Commentaire libre
        <textarea class="q-textarea" rows="3" placeholder="Observations, points clés, contexte…"
          oninput="VueQuestionnaire.set('commentaireLibre',this.value)">${d.commentaireLibre}</textarea></label>
      <label class="q-label">Prochaine action
        ${this._radios('prochaineAction', this.PROCHAINES_ACTIONS)}</label>
      <label class="q-label">Détail prochaine action
        <input class="q-input" placeholder="ex : Envoi proposition commerciale NSB" value="${d.prochaineActionTexte}" oninput="VueQuestionnaire.set('prochaineActionTexte',this.value)"/></label>
      <label class="q-label">Deadline
        <input type="date" class="q-input" value="${d.prochaineActionDate}" onchange="VueQuestionnaire.set('prochaineActionDate',this.value)"/></label>
      <div class="q-slider-wrap">
        <label class="q-label">Score d'engagement : <strong style="color:var(--c-cta);font-size:18px">${d.score}/5</strong></label>
        <input type="range" min="1" max="5" step="1" class="q-slider" value="${d.score}"
               oninput="VueQuestionnaire.setR('score',Number(this.value))"/>
        <div class="q-slider-labels"><span>1 · Froid</span><span>5 · Commande immédiate</span></div>
      </div>
      <label class="q-label">Notes libres
        <textarea class="q-textarea" rows="3" placeholder="Observations supplémentaires…"
          oninput="VueQuestionnaire.set('note',this.value)">${d.note}</textarea></label>
      <button type="button" id="btn-dictee" class="btn-secondaire" onclick="VueQuestionnaire.dicter()">
        🎙️ Dictée vocale 30s → Résumé IA Groq
      </button>
      ${d.resumeIA ? `<div class="q-recap"><h3>🤖 Résumé IA</h3><p style="font-size:13px">${d.resumeIA}</p></div>` : ''}
    </div>`;
  },

  // ── BLOC 9 — Validation ──
  _etape8() {
    const s = this.state, d = s.d;
    const empowerAlerte = d.empowerPartenaire === 'NON' && d.empowerInteresse === 'OUI';
    return `<div class="q-champs">
      <div class="q-recap">
        <h3>Résumé de la visite</h3>
        <div class="q-recap-ligne"><span>Compte</span><strong>${s.cible?.Nom_Compte||'—'}</strong></div>
        <div class="q-recap-ligne"><span>Date / Heure</span><strong>${d.date} · ${d.heure}</strong></div>
        <div class="q-recap-ligne"><span>Interlocuteur</span><strong>${d.interlocuteurNom||'—'} ${d.interlocuteurFonction?'· '+d.interlocuteurFonction:''}</strong></div>
        <div class="q-recap-ligne"><span>Type revendeur</span><strong>${d.typeRevendeur.join(', ')||'—'}</strong></div>
        <div class="q-recap-ligne"><span>Objectifs</span><strong>${d.objectifsVisite.join(', ')||'—'}</strong></div>
        <div class="q-recap-ligne"><span>Norton référencé</span><strong>${d.nortonReference||'—'}${d.nortonFormat.length?' · '+d.nortonFormat.join(', '):''}</strong></div>
        <div class="q-recap-ligne"><span>EMPOWER</span><strong>${d.empowerPartenaire||'—'}${d.empowerInteresse?' → Intéressé : '+d.empowerInteresse:''}</strong></div>
        <div class="q-recap-ligne"><span>Résultat</span><strong>${d.resultatVisite||'—'}</strong></div>
        <div class="q-recap-ligne"><span>Score</span><strong>${d.score}/5</strong></div>
        <div class="q-recap-ligne"><span>Prochaine action</span><strong>${d.prochaineAction||'—'}${d.prochaineActionDate?' — '+dateRelative(d.prochaineActionDate):''}</strong></div>
        ${empowerAlerte ? '<div style="font-size:12px;color:var(--c-primary);font-weight:600;padding:6px 0">🔔 Alerte EMPOWER → Alexandra sera envoyée</div>' : ''}
        <div class="q-recap-ligne"><span>GPS</span><strong>${s.gps.lat?'📍 capturé':'—'}</strong></div>
      </div>

      <div class="q-photo-zone">
        <label class="q-label">📷 Photos terrain (${s.photos.length}/4)</label>
        ${s.photos.map((p, i) => `
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <img src="${p}" style="width:64px;height:64px;object-fit:cover;border-radius:var(--radius-sm)"/>
            <button class="btn-sup-photo" onclick="VueQuestionnaire.supprimerPhoto(${i})">✕</button>
          </div>`).join('')}
        ${s.photos.length < 4 ? `
        <label class="btn-q-photo" style="margin-top:8px">📷 Ajouter une photo
          <input type="file" accept="image/*" capture="environment" hidden
                 onchange="VueQuestionnaire.ajouterPhoto(this)"/>
        </label>` : ''}
      </div>
    </div>`;
  },
};
