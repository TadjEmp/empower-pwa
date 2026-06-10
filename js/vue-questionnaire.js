// ═══════════════════════════════════════
//  vue-questionnaire.js — Formulaire visite terrain
//  Wizard 6 étapes : Identification → Historique → Portefeuille
//  → Concurrence & Freins → Engagement → Validation
//  Source comptes : 🏢_COMPTES (Existant) ou 📋_PROSPECTS (Prospect)
//  Écriture : 🗺️_VISITES (+ maj compte + log 📊_ACTIONS)
// ═══════════════════════════════════════

const VueQuestionnaire = {

  ETAPES: ['Identification', 'Historique', 'Portefeuille', 'Concurrence', 'Engagement', 'Validation'],

  FREINS: [
    { id: 'Prix trop élevé',       icone: '💡', argu: '<strong>Revenus récurrents +25% sur 3 ans via EMPOWER.</strong> Mettez en avant le ROI à long terme plutôt que le coût initial. Proposez une simulation personnalisée.' },
    { id: 'Pas le temps',          icone: '⏱️', argu: '<strong>Formation EMPOWER 30 min à distance.</strong> Sans contrainte horaire — l\'équipe Norton s\'occupe de l\'essentiel de l\'intégration.' },
    { id: 'Travaille avec concurrent', icone: '🛡️', argu: '<strong>Complémentaire, non substituable.</strong> Norton couvre le grand public + TPE — proposez un run parallèle sans engagement.' },
    { id: 'Mauvaise expérience plateforme', icone: '🔧', argu: '<strong>Nouveau portail 2025 + support dédié.</strong> Accompagnement CDS personnalisé pour la reprise en main.' },
    { id: 'Pas de demande client', icone: '📦', argu: '<strong>NSB clé en main TPE 1-20 postes.</strong> ESD zéro rupture de stock — créez la demande avec la PLV FY27.' },
  ],

  PRODUITS: ['Antivirus Plus', '360 Standard', '360 Deluxe 3D', '360 Deluxe 5D', '360 Premium', '360 Advanced', '360 for Gamers', 'NSB', 'Avast Business'],
  CONCURRENTS: ['ESET', 'Kaspersky', 'Bitdefender', 'Malwarebytes', 'Sophos', 'Avast Business', 'McAfee Trellix', 'Trend Micro', 'CoffieSoft', 'Aucun'],

  state: null,

  _etatInitial() {
    const now = new Date();
    return {
      etape: 0, chargement: true, envoiEnCours: false,
      comptes: [], prospects: [],
      typeSource: 'EXISTANT',          // EXISTANT (🏢_COMPTES) | PROSPECT (📋_PROSPECTS)
      cible: null,                     // ligne du compte/prospect choisi
      recherche: '', suggestionsOuvertes: false,
      gps: { lat: '', lng: '' },
      debut: Date.now(),
      photos: [],                      // dataURLs compressées (4 max)
      d: {
        date:  now.toISOString().slice(0, 10),
        heure: now.toTimeString().slice(0, 5),
        typeVisite: 'SUIVI_ACTIF',
        typeRevendeur: '', interlocuteurNom: '', interlocuteurFonction: '',
        derniereCommande: '', frequence: '', raisonSilence: '', volumeMoyen: '',
        produitsRayon: [], modeVente: '', rotation: '',
        produitsActifs: [], partDeluxe: '', premiumPropose: '', nsb: '', gamers: '',
        upsell: '', besoinPLV: false, besoinFormation: false,
        concurrent: '', raisonConcurrent: '', prixConcurrent: '',
        freins: [], autreFrein: '', argumentGagnant: '', objectionLevee: '',
        commandePassee: '', montantCommande: '', qteQ2: '',
        prochaineActionTexte: '', prochaineActionDate: '', score: 3,
        note: '', resumeIA: '',
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
        if (p) { this.state.cible = p; this.state.typeSource = 'PROSPECT'; this.state.d.typeVisite = 'PROSPECTION_FROIDE'; }
        if (this.state.cible) this.state.recherche = this.state.cible.Nom_Compte;
      }
      this.state.chargement = false;
      this.render();
      this._capturerGPS();
    } catch(e) {
      this.state.chargement = false;
      document.getElementById('app').innerHTML =
        `<div class="erreur">Erreur : ${e.message}</div>`;
    }
  },

  _capturerGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => { this.state.gps = { lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }; },
      ()  => Toast.afficher('📍 GPS indisponible — coordonnées non enregistrées', 'warning'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  },

  // ── Sélection compte ──
  get sourceListe() {
    return this.state.typeSource === 'EXISTANT' ? this.state.comptes : this.state.prospects;
  },

  get suggestions() {
    const q = normaliserNom(this.state.recherche);
    if (q.length < 2) return [];
    return this.sourceListe.filter(c => normaliserNom(c.Nom_Compte).includes(q)).slice(0, 6);
  },

  setSource(s) {
    this.state.typeSource = s;
    this.state.cible = null;
    this.state.recherche = '';
    this.state.d.typeVisite = s === 'PROSPECT' ? 'PROSPECTION_FROIDE' : 'SUIVI_ACTIF';
    this.render();
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
    this.render();
  },

  _renderSuggestions() {
    const zone = document.getElementById('q-suggestions');
    if (!zone) return;
    const sugg = this.state.suggestionsOuvertes ? this.suggestions : [];
    zone.innerHTML = sugg.map((c, i) => `
      <div class="q-arbre-btn" style="margin-top:4px" onclick="VueQuestionnaire.choisirCible(${i})">
        <strong>${c.Nom_Compte}</strong>
        <span style="color:var(--c-text-2);font-size:12px"> · ${c.Ville || '—'}${c.STATUT_COMPTE ? ' · ' + c.STATUT_COMPTE : ''}</span>
      </div>`).join('');
  },

  // ── Helpers champs ──
  set(champ, val)    { this.state.d[champ] = val; },
  setR(champ, val)   { this.state.d[champ] = val; this.render(); },
  toggleListe(champ, val) {
    const l = this.state.d[champ];
    const i = l.indexOf(val);
    i >= 0 ? l.splice(i, 1) : l.push(val);
    this.render();
  },

  _chips(champ, options) {
    return `<div class="q-chips">${options.map(o => `
      <button type="button" class="q-chip ${this.state.d[champ].includes(o) ? 'active' : ''}"
              onclick="VueQuestionnaire.toggleListe('${champ}','${o}')">${o}</button>`).join('')}</div>`;
  },

  _radios(champ, options) {
    return `<div class="q-chips">${options.map(o => `
      <button type="button" class="q-chip ${this.state.d[champ] === o ? 'active' : ''}"
              onclick="VueQuestionnaire.setR('${champ}','${o}')">${o}</button>`).join('')}</div>`;
  },

  // ── Photos (compression 800px / qualité 0.7, 4 max) ──
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

  // ── Dictée Groq 30s → résumé IA ──
  _enregistre: false,
  async dicter() {
    if (!GroqAPI.estConfigure()) {
      const k = prompt('Clé API Groq (gsk_…) — configurable une seule fois :');
      if (!k) return;
      GroqAPI.setKey(k);
    }
    if (this._enregistre) { GroqAPI.arreterEnregistrement(); return; }
    try {
      this._enregistre = true;
      document.getElementById('btn-dictee').textContent = '⏹ Arrêter (30s max)';
      await GroqAPI.demarrerEnregistrement(async blob => {
        this._enregistre = false;
        Toast.afficher('🤖 Transcription en cours…', 'info');
        try {
          const txt = await GroqAPI.transcrire(blob);
          this.state.d.note = (this.state.d.note ? this.state.d.note + '\n' : '') + txt;
          const q = await GroqAPI.qualifier(txt, {
            compte: this.state.cible?.Nom_Compte,
            statut: this.state.cible?.STATUT_COMPTE,
            type_visite: this.state.d.typeVisite,
          });
          this.state.d.resumeIA = q.resume || '';
          if (q.score) this.state.d.score = q.score;
          if (q.frein_detecte && !this.state.d.freins.includes(q.frein_detecte)) {
            // le frein détecté par l'IA enrichit la liste sans écraser la saisie
            this.state.d.autreFrein = this.state.d.autreFrein || q.frein_detecte;
          }
          if (q.action_recommandee && !this.state.d.prochaineActionTexte)
            this.state.d.prochaineActionTexte = q.action_recommandee;
          Toast.afficher('✅ Résumé IA généré', 'succes');
          this.render();
        } catch(e) { Toast.afficher('❌ IA : ' + e.message, 'erreur'); this.render(); }
      });
    } catch(e) {
      this._enregistre = false;
      Toast.afficher('🎙️ Micro inaccessible : ' + e.message, 'erreur');
    }
  },

  // ── Navigation ──
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

  // ── Enregistrement final ──
  async valider() {
    if (this.state.envoiEnCours) return;
    this.state.envoiEnCours = true;
    this.render();
    const s = this.state, d = s.d;
    const estProspect = s.typeSource === 'PROSPECT';
    const idCible = estProspect ? s.cible.ID_Prospect : s.cible.ID_Compte;
    const dureeMin = Math.round((Date.now() - s.debut) / 60000);

    try {
      // Upload photos → Drive via Apps Script (URL) ; fallback : vide si échec
      let photoURLs = [];
      for (const [i, p] of s.photos.entries()) {
        try {
          const r = await SheetsAPI.uploadPhoto(p, `${idCible}_${d.date}_${i + 1}.jpg`);
          if (r?.url) photoURLs.push(r.url);
        } catch { /* photo ignorée si upload KO */ }
      }

      // 1. Ligne 🗺️_VISITES (colonnes réelles v4.1)
      const visite = {
        ID_Visite: genId('VIS'),
        Date: d.date, Heure: d.heure, Semaine_ISO: getISOWeek(new Date(d.date)),
        PIN_CDS: Session.pin, Nom_CDS: Session.nom,
        ID_Cible: idCible, Nom_Compte: s.cible.Nom_Compte,
        Type_Visite: d.typeVisite, Source_Visite: 'ESI_FY27',
        Type_Revendeur: d.typeRevendeur, Nb_Employes: '',
        Interlocuteur_Nom: d.interlocuteurNom, Interlocuteur_Fonction: d.interlocuteurFonction,
        Contact_Direct: d.interlocuteurNom ? 'Oui' : 'Non', Contact_Data: '',
        Concurrent_Actuel: d.concurrent, Satisf_Concurrent: d.raisonConcurrent,
        Produits_Norton: d.produitsActifs.join(', '), Canal_Appro: s.cible.CANAL || '',
        Part_Lineaire: d.partDeluxe,
        Arbre_EMPOWER_Statut: d.commandePassee === 'Oui' ? 'COMMANDE' : (d.score >= 4 ? 'INTERESSE' : 'EN_COURS'),
        Freins_JSON: JSON.stringify([...d.freins, ...(d.autreFrein ? [d.autreFrein] : [])]),
        Grossistes_JSON: JSON.stringify(s.cible.CANAL ? [s.cible.CANAL] : []),
        Marketing_Present: d.besoinPLV ? 'Non' : '', Marketing_Supports: '',
        PLV_Installe: d.besoinPLV ? 'À installer' : '',
        Photo_URL: photoURLs.join(' | '),
        Resultat_Visite: d.commandePassee === 'Oui'
          ? `Commande ${d.montantCommande}€` : (d.argumentGagnant || d.objectionLevee || 'Visite réalisée'),
        Slider_Receptivite: d.score,
        Note_Privee: [d.note, d.resumeIA ? `[IA] ${d.resumeIA}` : ''].filter(Boolean).join('\n'),
        Prochaine_Action_Texte: d.prochaineActionTexte,
        Prochaine_Action_Date: d.prochaineActionDate,
        GPS_Lat: s.gps.lat, GPS_Lng: s.gps.lng,
        Duree_Minutes: dureeMin, Timestamp: new Date().toISOString(),
      };
      await SheetsAPI.ecrire('EMPOWER_MDB', '🗺️_VISITES', visite);

      // 2. Mise à jour de la fiche (compte ou prospect)
      const champsMaj = {
        Date_prochaine_action: d.prochaineActionDate,
        Flag_traite: 'TRUE',
      };
      if (estProspect) {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '📋_PROSPECTS', idCible, champsMaj);
      } else {
        await SheetsAPI.mettreAJour('EMPOWER_MDB', '🏢_COMPTES', idCible, {
          ...champsMaj,
          Date_Derniere_Action: d.date, Type_Derniere_Action: 'Visite',
          Prochaine_action: d.prochaineActionTexte,
          Slider_Receptivite: d.score,
        });
      }

      // 3. Log 📊_ACTIONS
      await SheetsAPI.ecrire('EMPOWER_MDB', '📊_ACTIONS', {
        ID_Action: genId('ACT'), Date_Action: new Date().toISOString(),
        Type_Action: 'Visite', Source: 'ESI', PIN_CDS: Session.pin,
        Nom_Compte: s.cible.Nom_Compte,
        Statut_Avant: s.cible.STATUT_COMPTE || s.cible.Statut || '',
        Statut_Apres: visite.Arbre_EMPOWER_Statut,
        Resum_IA: d.resumeIA || `Visite — réceptivité ${d.score}/5`,
        GPS_Lat: s.gps.lat, GPS_Lng: s.gps.lng,
        Timestamp: new Date().toISOString(),
      });

      this._renderSucces(dureeMin);
    } catch(e) {
      this.state.envoiEnCours = false;
      this.render();
      Toast.afficher('❌ Erreur enregistrement : ' + e.message, 'erreur', 5000);
    }
  },

  _renderSucces(dureeMin) {
    document.getElementById('app').innerHTML = `
      <div class="visite-succes">
        <div class="succes-icone">✅</div>
        <h2>Visite enregistrée</h2>
        <p class="succes-duree">${this.state.cible.Nom_Compte} · ${dureeMin} min</p>
        <div class="succes-recap">
          <div>📊 Réceptivité : ${this.state.d.score}/5</div>
          ${this.state.d.prochaineActionTexte ? `<div>🎯 ${this.state.d.prochaineActionTexte} — ${dateRelative(this.state.d.prochaineActionDate)}</div>` : ''}
          ${this.state.d.resumeIA ? `<div>🤖 ${this.state.d.resumeIA}</div>` : ''}
        </div>
        <div class="succes-btns">
          <button class="btn-primaire" onclick="Router.aller('#/dashboard')">← Dashboard</button>
          <button class="btn-secondaire" onclick="VueQuestionnaire.init()">📋 Nouvelle visite</button>
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
          <div class="q-sous-titre">Étape ${s.etape + 1} sur ${this.ETAPES.length} · ${this.ETAPES[s.etape]}</div>
        </div>
        ${s.gps.lat ? '<span title="GPS capturé">📍</span>' : ''}
      </header>

      <div style="height:8px;background:var(--c-border);border-radius:0">
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

  // Étape 0 — Identification
  _etape0() {
    const s = this.state, d = s.d;
    return `<div class="q-champs">
      <label class="q-label">Statut du compte
        <div style="display:flex;border:1.5px solid var(--c-border);border-radius:var(--radius-sm);padding:4px;background:var(--c-surface)">
          ${[['EXISTANT', 'Existant'], ['PROSPECT', 'Prospect']].map(([v, l]) => `
            <button type="button" style="flex:1;padding:9px;border:none;border-radius:4px;font-weight:600;font-size:14px;cursor:pointer;
              ${s.typeSource === v ? 'background:var(--c-title);color:#fff' : 'background:transparent;color:var(--c-text-2)'}"
              onclick="VueQuestionnaire.setSource('${v}')">${l}</button>`).join('')}
        </div>
      </label>
      <label class="q-label">Compte ${s.typeSource === 'EXISTANT' ? '(base historique)' : '(base prospects)'}
        <input class="q-input" placeholder="🔍 Rechercher…" value="${s.recherche}"
               oninput="VueQuestionnaire.setRecherche(this.value)" autocomplete="off"/>
      </label>
      <div id="q-suggestions"></div>
      ${s.cible ? `<div class="q-recap">
        <div class="q-recap-ligne"><span>Ville</span><strong>${s.cible.Ville || '—'}</strong></div>
        <div class="q-recap-ligne"><span>Statut</span><strong>${s.cible.STATUT_COMPTE || s.cible.Statut || '—'}</strong></div>
        ${s.cible.CA_FY25 ? `<div class="q-recap-ligne"><span>CA FY25</span><strong>${formatEuro(s.cible.CA_FY25)}</strong></div>` : ''}
      </div>` : ''}
      <div style="display:flex;gap:12px">
        <label class="q-label" style="flex:1">Date
          <input type="date" class="q-input" value="${d.date}" onchange="VueQuestionnaire.set('date', this.value)"/></label>
        <label class="q-label" style="width:120px">Heure
          <input type="time" class="q-input" value="${d.heure}" onchange="VueQuestionnaire.set('heure', this.value)"/></label>
      </div>
      <label class="q-label">Type de visite ${this._radios('typeVisite', ['SUIVI_ACTIF', 'PROSPECTION_FROIDE', 'ONBOARDING_EMPOWER'])}</label>
      <label class="q-label">Type revendeur ${this._radios('typeRevendeur', ['MSP', 'Intégrateur', 'Boutique IT', 'VAR', 'Généraliste', 'Autre'])}</label>
      <label class="q-label">Interlocuteur
        <input class="q-input" placeholder="Nom…" value="${d.interlocuteurNom}" oninput="VueQuestionnaire.set('interlocuteurNom', this.value)"/></label>
      <label class="q-label">Fonction
        <input class="q-input" placeholder="Gérant, vendeur…" value="${d.interlocuteurFonction}" oninput="VueQuestionnaire.set('interlocuteurFonction', this.value)"/></label>
    </div>`;
  },

  // Étape 1 — Historique & contexte achat
  _etape1() {
    const d = this.state.d;
    return `<div class="q-champs">
      <label class="q-label">Dernière commande Norton (produit + date)
        <input class="q-input" placeholder="ex : Deluxe 5D · mars 2026" value="${d.derniereCommande}" oninput="VueQuestionnaire.set('derniereCommande', this.value)"/></label>
      <label class="q-label">Fréquence d'achat ${this._radios('frequence', ['Mensuelle', 'Trimestrielle', 'Ponctuelle'])}</label>
      <label class="q-label">Raison du silence (si > 8 semaines) ${this._radios('raisonSilence', ['Rupture stock', 'Pas de demande', 'Concurrent', 'Oubli', 'N/A'])}</label>
      <label class="q-label">Volume moyen par commande (licences)
        <input class="q-input" inputmode="numeric" placeholder="ex : 10" value="${d.volumeMoyen}" oninput="VueQuestionnaire.set('volumeMoyen', this.value)"/></label>
      <label class="q-label">Produits en rayon / stock ${this._chips('produitsRayon', this.PRODUITS)}</label>
      <label class="q-label">Mode de vente ${this._radios('modeVente', ['Conseil actif', 'Libre-service', 'Les deux'])}</label>
      <label class="q-label">Rotation stock ${this._radios('rotation', ['Lent', 'Moyen', 'Rapide (<30j)'])}</label>
    </div>`;
  },

  // Étape 2 — Portefeuille & upsell
  _etape2() {
    const d = this.state.d;
    return `<div class="q-champs">
      <label class="q-label">Produits Norton vendus activement ${this._chips('produitsActifs', this.PRODUITS)}</label>
      <label class="q-label">Part Deluxe 3D/5D dans les ventes ${this._radios('partDeluxe', ['Majoritaire', 'Minoritaire', 'Absent'])}</label>
      <label class="q-label">360 Premium proposé activement ? ${this._radios('premiumPropose', ['Oui', 'Non'])}</label>
      <label class="q-label">NSB — clientèle PME ? ${this._radios('nsb', ['Oui', 'Non'])}</label>
      <label class="q-label">360 for Gamers — rayon gaming ? ${this._radios('gamers', ['Oui', 'Non'])}</label>
      <label class="q-label">Opportunité d'upsell identifiée
        <textarea class="q-textarea" rows="2" placeholder="ex : clients PME → NSB"
          oninput="VueQuestionnaire.set('upsell', this.value)">${d.upsell}</textarea></label>
      <div class="q-chips">
        <button type="button" class="q-chip ${d.besoinPLV ? 'active' : ''}" onclick="VueQuestionnaire.setR('besoinPLV', ${!d.besoinPLV})">📐 Besoin PLV</button>
        <button type="button" class="q-chip ${d.besoinFormation ? 'active' : ''}" onclick="VueQuestionnaire.setR('besoinFormation', ${!d.besoinFormation})">🎓 Besoin formation</button>
      </div>
    </div>`;
  },

  // Étape 3 — Concurrence & freins (accordéons + argumentaires)
  _etape3() {
    const d = this.state.d;
    return `<div class="q-champs">
      <label class="q-label">Concurrent dominant ${this._radios('concurrent', this.CONCURRENTS)}</label>
      <label class="q-label">Raison du choix concurrent ${this._radios('raisonConcurrent', ['Prix', 'Marge', 'Contrat distri', 'Habitude', 'N/A'])}</label>
      <label class="q-label">Prix moyen concurrent
        <input class="q-input" placeholder="ex : ~30€ / 3 postes" value="${d.prixConcurrent}" oninput="VueQuestionnaire.set('prixConcurrent', this.value)"/></label>

      <p class="q-intro">Sélectionnez les freins mentionnés pour afficher l'argumentaire recommandé :</p>
      <div class="q-arbre">
        ${this.FREINS.map(f => {
          const actif = d.freins.includes(f.id);
          return `
          <div style="border:1.5px solid ${actif ? 'var(--c-cta)' : 'var(--c-border)'};border-radius:var(--radius);overflow:hidden;background:var(--c-surface)">
            <button type="button" class="q-arbre-btn" style="border:none;border-radius:0;width:100%;${actif ? 'background:#fff5f4' : ''}"
                    onclick="VueQuestionnaire.toggleListe('freins','${f.id}')">
              ${actif ? '☑' : '☐'} ${f.id}
            </button>
            ${actif ? `<div style="padding:12px 16px;border-top:1px solid var(--c-border);font-size:13px;line-height:1.5">
              ${f.icone} <span style="color:var(--c-cta);font-weight:700;font-size:11px;text-transform:uppercase">Argumentaire recommandé</span><br>
              ${f.argu}
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <label class="q-label">Autre frein identifié ?
        <textarea class="q-textarea" rows="2" placeholder="Précisez…"
          oninput="VueQuestionnaire.set('autreFrein', this.value)">${d.autreFrein}</textarea></label>
      <label class="q-label">Argument qui a fonctionné
        <input class="q-input" placeholder="ex : marge +5% sur Deluxe" value="${d.argumentGagnant}" oninput="VueQuestionnaire.set('argumentGagnant', this.value)"/></label>
      <label class="q-label">Objection ${this._radios('objectionLevee', ['Levée', 'Non levée', 'Aucune'])}</label>
    </div>`;
  },

  // Étape 4 — Engagement & prochaine action
  _etape4() {
    const d = this.state.d;
    return `<div class="q-champs">
      <label class="q-label">Commande passée pendant la visite ? ${this._radios('commandePassee', ['Oui', 'Non'])}</label>
      ${d.commandePassee === 'Oui' ? `
      <label class="q-label">Montant (€)
        <input class="q-input" inputmode="decimal" placeholder="ex : 700" value="${d.montantCommande}" oninput="VueQuestionnaire.set('montantCommande', this.value)"/></label>` : ''}
      <label class="q-label">Quantité potentielle Q2 FY27
        <input class="q-input" placeholder="ex : 10 Deluxe 5D + 5 NSB" value="${d.qteQ2}" oninput="VueQuestionnaire.set('qteQ2', this.value)"/></label>
      <label class="q-label">Prochaine action
        <input class="q-input" placeholder="ex : Envoi proposition commerciale" value="${d.prochaineActionTexte}" oninput="VueQuestionnaire.set('prochaineActionTexte', this.value)"/></label>
      <label class="q-label">Date prochaine action
        <input type="date" class="q-input" value="${d.prochaineActionDate}" onchange="VueQuestionnaire.set('prochaineActionDate', this.value)"/></label>
      <div class="q-slider-wrap">
        <label class="q-label">Score engagement : <strong style="color:var(--c-cta);font-size:18px">${d.score}/5</strong></label>
        <input type="range" min="1" max="5" step="1" class="q-slider" value="${d.score}"
               oninput="VueQuestionnaire.setR('score', Number(this.value))"/>
        <div class="q-slider-labels"><span>1 · Froid</span><span>5 · Commande immédiate</span></div>
      </div>
      <label class="q-label">Notes libres
        <textarea class="q-textarea" rows="4" placeholder="Vos observations…"
          oninput="VueQuestionnaire.set('note', this.value)">${d.note}</textarea></label>
      <button type="button" id="btn-dictee" class="btn-secondaire" onclick="VueQuestionnaire.dicter()">
        🎙️ Dictée vocale 30s → Résumé IA
      </button>
      ${d.resumeIA ? `<div class="q-recap"><h3>🤖 Résumé IA</h3><p style="font-size:13px">${d.resumeIA}</p></div>` : ''}
    </div>`;
  },

  // Étape 5 — Validation (récap + photos)
  _etape5() {
    const s = this.state, d = s.d;
    return `<div class="q-champs">
      <div class="q-recap">
        <h3>Résumé de la visite</h3>
        <div class="q-recap-ligne"><span>Compte</span><strong>${s.cible?.Nom_Compte || '—'}</strong></div>
        <div class="q-recap-ligne"><span>Type</span><strong>${d.typeVisite}</strong></div>
        <div class="q-recap-ligne"><span>Date</span><strong>${d.date} · ${d.heure}</strong></div>
        <div class="q-recap-ligne"><span>Interlocuteur</span><strong>${d.interlocuteurNom || '—'}</strong></div>
        <div class="q-recap-ligne"><span>Commande</span><strong>${d.commandePassee === 'Oui' ? formatEuro(d.montantCommande) : 'Non'}</strong></div>
        <div class="q-recap-ligne"><span>Score</span><strong>${d.score}/5</strong></div>
        <div class="q-recap-ligne"><span>Freins</span><strong>${[...d.freins, d.autreFrein].filter(Boolean).join(', ') || '—'}</strong></div>
        <div class="q-recap-ligne"><span>Prochaine action</span><strong>${d.prochaineActionTexte || '—'}${d.prochaineActionDate ? ' · ' + dateRelative(d.prochaineActionDate) : ''}</strong></div>
        <div class="q-recap-ligne"><span>GPS</span><strong>${s.gps.lat ? '📍 capturé' : '—'}</strong></div>
      </div>

      <div class="q-photo-zone">
        <label class="q-label">Photos (${s.photos.length}/4) — MEA, PLV, rayon, enseigne</label>
        ${s.photos.map((p, i) => `
          <div style="display:flex;align-items:center;gap:8px">
            <img src="${p}" style="width:64px;height:64px;object-fit:cover;border-radius:var(--radius-sm)"/>
            <button class="btn-sup-photo" onclick="VueQuestionnaire.supprimerPhoto(${i})">✕ Supprimer</button>
          </div>`).join('')}
        ${s.photos.length < 4 ? `
        <label class="btn-q-photo">📷 Ajouter une photo
          <input type="file" accept="image/*" capture="environment" hidden
                 onchange="VueQuestionnaire.ajouterPhoto(this)"/>
        </label>` : ''}
      </div>
    </div>`;
  },
};
