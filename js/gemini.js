// ═══════════════════════════════════════
//  gemini.js — Proxy Gemini via Apps Script (B10)
//  SÉCURITÉ : la clé GEMINI_API_KEY est dans PropertiesService côté Apps Script.
//  Le frontend n'appelle jamais l'API Gemini directement.
// ═══════════════════════════════════════

window.GeminiAPI = {

  async _appeler(prompt, contexte) {
    const r = await fetch(SheetsAPI.BASE_URL, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:   'gemini',
        token:    SheetsAPI.TOKEN,
        prompt,
        contexte: contexte || '',
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok) throw new Error(data.erreur || 'Erreur Gemini');
    return data.texte;
  },

  // T01 — Analyser la fiche prospect
  t01_analyser(lead) {
    const ctx = `Tu es un assistant commercial B2B expert en distribution informatique / cybersécurité (marque Norton).
Tu aides une équipe de commerciaux terrain (CDS) en France.`;
    const prompt = `Analyse ce prospect et donne un bref profil commercial (3-5 lignes) :
Nom : ${lead.Nom_Compte || '—'}
Ville : ${lead.Ville || '—'}
Canal : ${lead.CANAL || '—'}
Potentiel : ${lead.POTENTIEL || '—'}
Note initiale : ${lead.Note_initiale || 'aucune'}
Statut pipeline : ${lead._statut || '—'}

Inclus : profil probable du revendeur, opportunité clé Norton, angle d'approche recommandé.
Réponds en français, ton professionnel, format structuré court.`;
    return this._appeler(prompt, ctx);
  },

  // T02 — Préparer une visite terrain
  t02_preparerVisite(lead) {
    const ctx = `Tu es un coach commercial spécialisé en vente indirecte (distribution IT / cybersécurité Norton).`;
    const prompt = `Prépare un plan de visite terrain pour ce prospect :
Nom : ${lead.Nom_Compte || '—'}
Ville : ${lead.Ville || '—'}
Canal : ${lead.CANAL || '—'}
Potentiel : ${lead.POTENTIEL || '—'}
Statut : ${lead._statut || '—'}
Note : ${lead.Note_initiale || 'aucune'}

Fournis :
1. Objectif de la visite (1 ligne)
2. 3 points clés à aborder
3. 2 objections probables + réponses concises
4. Prochaine action suggérée après la visite

Format court, bullet points, français professionnel.`;
    return this._appeler(prompt, ctx);
  },

  // T04 — Rédiger un email de prospection
  t04_email(lead) {
    const ctx = `Tu rédiges des emails de prospection B2B pour des commerciaux Norton France (distribution informatique, cybersécurité grand public et PME).`;
    const prompt = `Rédige un email de prospection percutant pour ce prospect revendeur :
Destinataire : ${lead.Nom_Compte || '—'} (${lead.Ville || '—'})
Canal de distribution : ${lead.CANAL || '—'}
Contexte : ${lead.Note_initiale || 'Premier contact'}

Contraintes :
- Objet accrocheur (max 8 mots)
- Corps : 3 paragraphes max, 80 mots max au total
- Appel à l'action clair en dernière ligne
- Ton : direct, professionnel, sans jargon excessif
- Signataire : Équipe Empower / Norton France

Format :
OBJET: …
CORPS:
…`;
    return this._appeler(prompt, ctx);
  },

  // T05 — Résumé structuré d'un compte-rendu de visite
  t05_resumeCR(lead, notes) {
    const ctx = `Tu es un assistant commercial. Tu synthétises des notes terrain en compte-rendu structuré clair.`;
    const notesText = notes || lead.Prochaine_Action_Texte || lead.Note_Privee || 'Pas de notes disponibles';
    const prompt = `Génère un compte-rendu de visite structuré à partir de ces notes :

Compte : ${lead.Nom_Compte || '—'} (${lead.Ville || '—'})
Notes brutes : ${notesText}

Structure de sortie :
RÉSUMÉ (1-2 phrases)
POINTS CLÉS ABORDÉS (bullet points)
INTÉRÊT CLIENT (niveau : faible/moyen/fort + justification courte)
PROCHAINE ÉTAPE (action + délai suggéré)

Français professionnel, concis.`;
    return this._appeler(prompt, ctx);
  },

  // GEM-07 — Synthèse hebdo équipe (Dashboard Manager)
  gem07_syntheseHebdo(data) {
    const ctx = `Tu es un assistant analytique commercial senior. Tu analyses les KPIs d'une équipe de commerciaux terrain vendant des logiciels de cybersécurité (Norton France) en distribution indirecte.`;
    const lignes = (data.equipe || []).map(e =>
      `${e.nom} : CA ${e.ca}€ / Obj ${e.obj}€ → ${e.pct}% | ${e.visitesSem} visites | ${e.appelsSem} appels | ${e.leadsEnCours} leads`
    ).join('\n');
    const prompt = `Semaine ${data.semaine} — ${data.quarter} FY27\n\n${lignes}\n\nTotal : CA ${data.caTotal}€ / Obj ${data.objTotal}€ (${data.pctTotal}%)\nLeads bloqués >7j : ${(data.leadsBloques||[]).length} | Taux intégration EMPOWER : ${data.tauxIntegration}%\n\nGénère une synthèse hebdo structurée :\n1. BILAN SEMAINE (top performer, points positifs — 2 phrases)\n2. ALERTES (2-3 points critiques à adresser)\n3. TENDANCES (dynamique de l'équipe — 1-2 observations)\n4. RECOMMANDATIONS (2-3 actions concrètes pour la semaine suivante)\n\nTon : professionnel, direct, orienté action. Français. 200 mots max.`;
    return this._appeler(prompt, ctx);
  },

  // GEM-T01 — Enrichissement automatique lead à la saisie
  gemT01_enrichirLead(lead) {
    const ctx = `Tu es expert en distribution informatique B2B France. Tu identifies le profil commercial des revendeurs IT.`;
    const prompt = `Enrichis ce lead entrant :\nNom : ${lead.Nom_Compte||'—'}\nVille : ${lead.Ville||'—'} ${lead.Code_Postal||''}\nCanal saisi : ${lead.CANAL||'non renseigné'}\nNote : ${lead.Note_initiale||'aucune'}\n\nRéponds UNIQUEMENT avec ce JSON :\n{"type_revendeur_probable":"MSP|VAR|Boutique IT|Généraliste|Intégrateur|Cybersécurité","canal_probable":"IT|Retail|Cloud","potentiel":"Fort|Moyen|Faible","produits_pertinents":["NSB","360 Standard"],"angle_approche":"1 phrase d'accroche personnalisée"}`;
    return this._appeler(prompt, ctx);
  },

  // GEM-T02 — Détection doublon avant création lead
  gemT02_detectionDoublon(nomNouveauLead, existants) {
    const ctx = `Tu es un outil de déduplication de base de données commerciales.`;
    const liste = (existants||[]).slice(0, 60).map(e => e.Nom_Compte||e.nom||'').filter(Boolean).join('\n');
    if (!liste) return Promise.resolve('{"doublon_probable":false,"nom_similaire":null,"score":0}');
    const prompt = `Nouveau lead : "${nomNouveauLead}"\n\nParmi ces comptes existants, y a-t-il un doublon probable (même enseigne, graphie différente, abréviation) ?\n${liste}\n\nRéponds UNIQUEMENT :\n{"doublon_probable":true|false,"nom_similaire":"nom exact ou null","score":0-100,"explication":"1 phrase ou null"}`;
    return this._appeler(prompt, ctx);
  },

  // Stocker la clé Gemini côté Apps Script (admin uniquement)
  async sauverCle(cle) {
    const r = await fetch(SheetsAPI.BASE_URL, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setGeminiKey', token: SheetsAPI.TOKEN, cle }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok) throw new Error(data.erreur || 'Erreur');
    return true;
  },
};
