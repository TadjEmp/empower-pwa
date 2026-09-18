// ═══════════════════════════════════════
//  fiscal-weeks.js — Source unique des semaines fiscales Norton (FY27)
//  Remplace getISOWeek() pour tout ce qui touche au pilotage hebdo (Accueil,
//  Reporting, Objectifs, Phoning, Visites, Questionnaire) — cf. audit Bloc 4
//  (11 sites dupliquaient jusqu'ici le calcul de semaine).
//  Référentiel : PROMPT_BLOC_1_ACCUEIL_TRACKER_COMPTES.md §1.1
// ═══════════════════════════════════════

const FiscalWeeks = (function () {
  // Date de W1 pour chaque quarter FY27 — les 12 semaines suivantes de chaque
  // quarter sont à +7j exactement (vérifié sur le référentiel fourni par ESI).
  const QUARTER_START = {
    Q1: '2026-04-10',
    Q2: '2026-07-10',
    Q3: '2026-10-09',
    Q4: '2027-01-08',
  };
  const NB_SEMAINES = 13;

  function _addDaysUTC(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  }
  function _toISO(d) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // Table à plat de toutes les semaines FY27, triée chronologiquement.
  const TOUTES = [];
  for (const q of Object.keys(QUARTER_START)) {
    for (let w = 0; w < NB_SEMAINES; w++) {
      const debut = _addDaysUTC(QUARTER_START[q], w * 7);
      TOUTES.push({ quarter: q, semaine: w + 1, debut, debutISO: _toISO(debut) });
    }
  }

  // Semaine fiscale contenant une date donnée (par défaut aujourd'hui).
  // Retourne null si la date est hors du référentiel FY27 chargé (avant Q1 W1
  // ou après Q4 W13) — pas de valeur inventée hors plage.
  function semaineDe(date = new Date()) {
    const jour = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    for (let i = 0; i < TOUTES.length; i++) {
      const debut = TOUTES[i].debut;
      const finExclusive = i + 1 < TOUTES.length ? TOUTES[i + 1].debut : _addDaysUTC(TOUTES[i].debutISO, 7);
      if (jour >= debut && jour < finExclusive) {
        return { quarter: TOUTES[i].quarter, semaine: TOUTES[i].semaine, label: `W${TOUTES[i].semaine}`, debutISO: TOUTES[i].debutISO };
      }
    }
    return null;
  }

  // Libellé "W3" pour une date donnée — remplace l'usage direct de getISOWeek()
  // dans les call sites qui ne veulent que l'étiquette de semaine à afficher.
  function labelDe(date = new Date()) {
    const s = semaineDe(date);
    return s ? s.label : null;
  }

  // Code canonique "Q1-W13" à STOCKER (semaine_iso en base) — le numéro de
  // semaine seul (W1..W13) se répète chaque quarter, donc pas d'ambiguïté
  // possible pour le stockage/tri contrairement au libellé d'affichage.
  function codeDe(date = new Date()) {
    const s = semaineDe(date);
    return s ? `${s.quarter}-${s.label}` : null;
  }

  // Les 13 semaines d'un quarter, avec leur date de début — pour construire des
  // filtres ou des courbes hebdomadaires réelles (remplace la répartition
  // synthétique actuellement utilisée dans vue-dashboard-cds.js/_svgCAHebdo).
  function semainesDuQuarter(quarter) {
    return TOUTES
      .filter(s => s.quarter === quarter)
      .map(s => ({ semaine: s.semaine, label: `W${s.semaine}`, debutISO: s.debutISO }));
  }

  // Bug remonté (09/2026) — "Visites sem./Appels sem." utilisait semaineDe/codeDe,
  // dont chaque semaine DÉMARRE UN VENDREDI (référentiel Q1-Q4 ci-dessus, vérifié :
  // les 4 dates QUARTER_START tombent toutes un vendredi). Pour le suivi d'activité
  // (visites/appels visés "cette semaine"), les commerciaux raisonnent en semaine
  // calendaire réelle lundi→vendredi : le compteur retombait à 0 chaque vendredi
  // matin et mélangeait vendredi-lundi-jeudi dans une même "semaine". Uniquement
  // pour ce cas d'usage (activité, pas CA/objectifs qui reste sur le référentiel
  // fiscal ci-dessus) — plage du lundi 00:00 au dimanche 23:59 contenant `date`.
  function plageCalendaire(date = new Date()) {
    const jour = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const jsDay = jour.getDay();               // 0=dimanche..6=samedi
    const decalLundi = jsDay === 0 ? -6 : 1 - jsDay;
    const lundi = new Date(jour); lundi.setDate(lundi.getDate() + decalLundi);
    const dimanche = new Date(lundi); dimanche.setDate(dimanche.getDate() + 6);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { debutISO: fmt(lundi), finISO: fmt(dimanche) };
  }

  // true si `dateStr` (YYYY-MM-DD ou ISO datetime) tombe dans la semaine
  // calendaire (lundi→dimanche) contenant `refDate` (défaut aujourd'hui).
  function dansSemaineCalendaire(dateStr, refDate = new Date()) {
    if (!dateStr) return false;
    const jour = String(dateStr).slice(0, 10);
    const { debutISO, finISO } = plageCalendaire(refDate);
    return jour >= debutISO && jour <= finISO;
  }

  return { semaineDe, labelDe, codeDe, semainesDuQuarter, plageCalendaire, dansSemaineCalendaire, QUARTER_START };
})();
window.FiscalWeeks = FiscalWeeks;
