// ═══════════════════════════════════════
//  fiches-froides.js — Lot 1 (10/2026) : fiche magasin persistante pour les
//  visites à froid (table Supabase `fiches_froides`).
//
//  Pourquoi : jusqu'ici un magasin visité à froid n'existait que dans la
//  visite (ID_Cible = 'HORS_BASE') et, pour les suggestions, dans le
//  localStorage de l'appareil (par nom, 100 max, non partagé). Rien ne
//  permettait de revoir un magasin, de planifier une relance ni de le
//  convertir proprement.
//
//  Principes :
//   - ID_Cible reste 'HORS_BASE' sur les visites (repère utilisé par
//     questionnaire, routeur, planning, FDV) ; la liaison se fait par
//     visites.ID_Fiche_Froide → fiches_froides.ID_Fiche.
//   - Une fiche = un magasin (nom normalisé + ville) ; N visites.
//   - Jamais bloquant : un échec ici ne doit jamais faire perdre une visite.
//   - Visibilité : managers/channel voient tout ; un CDS voit ses fiches.
//     Un homonyme appartenant à un autre CDS n'est pas exposé en détail :
//     on crée la fiche du CDS avec Doublon_A_Revoir et on le signale.
//
//  Statuts : A_QUALIFIER | A_REVOIR | CONVERTI_PROSPECT | CONVERTI_COMPTE | HISTORIQUE
// ═══════════════════════════════════════

window.FichesFroides = {
  FICHIER: 'EMPOWER_MDB',
  ONGLET:  'FICHES_FROIDES',
  STATUTS: {
    A_QUALIFIER:       'À qualifier',
    A_REVOIR:          'À revoir',
    CONVERTI_PROSPECT: 'Converti en prospect',
    CONVERTI_COMPTE:   'Converti en compte',
    HISTORIQUE:        'Historique',
  },
  _CLE_LOCAL:  'esi_prospects_froid',
  _CLE_MIGRE:  'esi_prospects_froid_migre',

  _norm(s) { return normaliserNom(s || ''); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _estConverti(f) { return f.Statut === 'CONVERTI_COMPTE' || f.Statut === 'CONVERTI_PROSPECT'; },

  async charger(opts = {}) {
    const rows = await SheetsAPI.lire(this.FICHIER, this.ONGLET, opts);
    return (rows || []).filter(f => String(f.deleted || '').toUpperCase() !== 'TRUE');
  },

  // Fiches que l'utilisateur courant a le droit de voir.
  visibles(liste) {
    return (liste || []).filter(f => Session.voitTout() || Number(f.PIN_CDS) === Session.pin);
  },

  // Fiches « actives » proposables pour une nouvelle visite (non converties).
  revisitables(liste) {
    return this.visibles(liste)
      .filter(f => !this._estConverti(f))
      .sort((a, b) => String(a.Nom_Magasin || '').localeCompare(String(b.Nom_Magasin || ''), 'fr'));
  },

  // Rapprochement par nom normalisé (+ ville si les deux sont renseignées).
  trouver(liste, nom, ville) {
    const n = this._norm(nom), v = this._norm(ville);
    if (!n) return [];
    return (liste || []).filter(f => {
      if (this._norm(f.Nom_Magasin) !== n) return false;
      const fv = this._norm(f.Ville);
      return !v || !fv || fv === v;
    });
  },

  // Retourne la fiche à utiliser pour cette visite (existante ou créée).
  // → { idFiche, fiche, creee, autreCDS }
  async assurerPourVisite(info) {
    const liste = await this.charger({ nocache: true });
    const trouvees = this.trouver(liste, info.nom, info.ville);
    const miennes = trouvees.filter(f => Number(f.PIN_CDS) === Session.pin);
    const autres  = trouvees.filter(f => Number(f.PIN_CDS) !== Session.pin);

    // Manager/channel : réutilise la fiche existante quelle que soit sa propriétaire.
    const reutilisable = miennes[0] || (Session.voitTout() ? autres[0] : null);
    if (reutilisable) {
      return { idFiche: reutilisable.ID_Fiche, fiche: reutilisable, creee: false, autreCDS: false };
    }

    const idFiche = genId('FRD');
    const aujourd = dateISOLocale();
    const fiche = {
      ID_Fiche: idFiche,
      Nom_Magasin: (info.nom || '').trim(),
      Nom_Norm: this._norm(info.nom),
      Ville: info.ville || '', Departement: info.departement || '', Adresse: info.adresse || '',
      Tel: info.tel || '', Email: info.email || '',
      Contact_Nom: info.contactNom || '', Contact_Fonction: info.contactFonction || '',
      PIN_CDS: Session.pin, Nom_CDS: Session.nom,
      Date_Premiere_Visite: info.dateVisite || aujourd,
      Date_Derniere_Visite: '',
      Resultat_Derniere: '', Prochaine_Action: info.prochaineAction || '',
      Date_Relance: info.dateRelance || '', Commentaire: info.commentaire || '',
      Statut: info.statut || 'A_QUALIFIER',
      Nb_Visites: 0,
      Doublon_A_Revoir: autres.length > 0,
    };
    await SheetsAPI.ecrire(this.FICHIER, this.ONGLET, fiche);
    return { idFiche, fiche, creee: true, autreCDS: autres.length > 0 };
  },

  // Appelé à la planification d'une visite à froid.
  async apresPlanification(info) {
    const r = await this.assurerPourVisite(info);
    const champs = { Statut: 'A_REVOIR' };
    if (info.dateRelance)     champs.Date_Relance = info.dateRelance;
    if (info.prochaineAction) champs.Prochaine_Action = info.prochaineAction;
    // Complète sans écraser : on ne remplace que les champs encore vides.
    for (const [k, v] of Object.entries({
      Ville: info.ville, Departement: info.departement, Adresse: info.adresse, Tel: info.tel, Email: info.email,
    })) { if (v && !(r.fiche[k] || '').trim()) champs[k] = v; }
    if (!this._estConverti(r.fiche)) {
      await SheetsAPI.mettreAJour(this.FICHIER, this.ONGLET, r.idFiche, champs);
    }
    return r;
  },

  // Appelé à l'enregistrement d'un compte-rendu de visite à froid.
  // visite = objet visite écrit ; idFicheExistante = ID_Fiche_Froide de la visite planifiée.
  async apresVisite(visite, idFicheExistante) {
    let idFiche = idFicheExistante || visite.ID_Fiche_Froide || '';
    let fiche = null;
    if (!idFiche) {
      const r = await this.assurerPourVisite({
        nom: visite.Nom_Compte, ville: visite.Ville, departement: visite.Departement,
        adresse: visite.Adresse, tel: visite.Tel, email: visite.Email, dateVisite: visite.Date,
      });
      idFiche = r.idFiche; fiche = r.fiche;
    } else {
      fiche = (await this.charger({ nocache: true })).find(f => f.ID_Fiche === idFiche) || null;
    }
    if (!fiche) return null;

    const relance = (visite.Prochaine_Action_Date || '').slice(0, 10);
    const champs = {
      Date_Derniere_Visite: (visite.Date || dateISOLocale()).slice(0, 10),
      Resultat_Derniere:    visite.Resultat_Visite || '',
      Prochaine_Action:     visite.Prochaine_Action_Texte || '',
      Date_Relance:         relance,
      Nb_Visites:           (Number(fiche.Nb_Visites) || 0) + 1,
    };
    if (!fiche.Date_Premiere_Visite) champs.Date_Premiere_Visite = champs.Date_Derniere_Visite;
    if (visite.Note_Privee)           champs.Commentaire = visite.Note_Privee;
    if (visite.Interlocuteur_Nom)     champs.Contact_Nom = visite.Interlocuteur_Nom;
    if (visite.Interlocuteur_Fonction) champs.Contact_Fonction = visite.Interlocuteur_Fonction;
    for (const [src, dst] of [['Tel', 'Tel'], ['Email', 'Email'], ['Ville', 'Ville'], ['Departement', 'Departement'], ['Adresse', 'Adresse']]) {
      if (visite[src]) champs[dst] = visite[src];
    }
    if (!this._estConverti(fiche)) champs.Statut = relance ? 'A_REVOIR' : 'A_QUALIFIER';

    await SheetsAPI.mettreAJour(this.FICHIER, this.ONGLET, idFiche, champs);
    if (!visite.ID_Fiche_Froide && !idFicheExistante && visite.ID_Visite) {
      await SheetsAPI.mettreAJour('EMPOWER_MDB', '🗺️_VISITES', visite.ID_Visite, { ID_Fiche_Froide: idFiche });
    }
    return idFiche;
  },

  // Conversion : la fiche garde son identité et pointe vers l'objet créé.
  async marquerConverti(idFiche, { idCompte = '', idLead = '' } = {}) {
    if (!idFiche) return;
    const champs = idCompte
      ? { Statut: 'CONVERTI_COMPTE', ID_Compte_Lie: idCompte }
      : { Statut: 'CONVERTI_PROSPECT', ID_Lead_Lie: idLead };
    await SheetsAPI.mettreAJour(this.FICHIER, this.ONGLET, idFiche, champs);
  },

  async classerHistorique(idFiche) {
    await SheetsAPI.mettreAJour(this.FICHIER, this.ONGLET, idFiche, { Statut: 'HISTORIQUE', Date_Relance: '' });
  },

  // Préremplissage d'une nouvelle visite depuis une fiche (« Revoir ce magasin »).
  prefill(f) {
    return {
      horsBase: true, idFicheFroide: f.ID_Fiche,
      nomLibre: f.Nom_Magasin || '', villeLibre: f.Ville || '', deptLibre: f.Departement || '',
      adresseLibre: f.Adresse || '', telLibre: f.Tel || '', emailLibre: f.Email || '',
      typeVisite: 'SUIVI_ACTIF',
      commentairePrep: [f.Resultat_Derniere && `Dernier résultat : ${f.Resultat_Derniere}`, f.Prochaine_Action]
        .filter(Boolean).join(' — '),
      prochaineEtape: f.Prochaine_Action || '',
    };
  },

  // Migration unique du localStorage (noms seuls) vers la base partagée.
  async migrerLocalStorage() {
    try {
      if (localStorage.getItem(this._CLE_MIGRE) === '1') return 0;
      const noms = JSON.parse(localStorage.getItem(this._CLE_LOCAL) || '[]');
      let crees = 0;
      for (const nom of noms) {
        const liste = await this.charger({ nocache: true });
        if (this.trouver(this.visibles(liste), nom, '').length) continue;
        await this.assurerPourVisite({ nom });
        crees++;
      }
      localStorage.setItem(this._CLE_MIGRE, '1');
      return crees;
    } catch { return 0; }
  },
};
