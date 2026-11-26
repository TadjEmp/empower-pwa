// ═══════════════════════════════════════
//  vue-coach.js — Coach commercial : page 3 colonnes (droit « coach »)
//  Gauche : plan de la semaine (actions cochées automatiquement quand la donnée le prouve) + trajectoire.
//  Centre : conversation. Les réponses guidées sont construites par le code à partir des données de l'app,
//          du catalogue et des règles du séminaire ; la question libre sans correspondance passe par l'IA
//          avec les seuls chiffres calculés, et la réponse est signalée comme telle.
//  Droite : calculateur de marge toujours visible (catalogue des Réglages, cotations en cours incluses) + qualité des données.
//  Périmètre : CDS = ses comptes et son objectif ; ADMIN / CHANNEL_MANAGER = tout, avec filtre par commercial.
//  Moteur : js/coach-moteur.js ; prix : js/catalogue.js (Réglages › Prix et cotations).
// ═══════════════════════════════════════
window.VueCoach = {
  state: { chargement: true, erreur: null, d: null, pin: '', col: 'chat', fil: [], panier: [['n360-del5', 6]], grossiste: 'pa_td', volume: false, compteSel: '', ia: false, maj: null, pdf: { type: 'proposition', client: '', contact: '', offre: 'xy', achetees: 10, offertes: 1, taux: 10, validite: '', debut: '', conditions: '', canal: 'pa_td', offertNom: 'Norton Utilities Ultimate', offertPvp: '', par: 2,
    refA: 'n360-del5', refB: 'n360-adv10', qteB: 2, seuil: 10, tauxVol: 20,
    titre: '', sousTitre: '', op1: 'nsb-10', q1: 1, nom1: 'Norton VPN Plus', pvp1: '', op2: 'n360-del5', q2: 1, nom2: 'Norton Utilities Ultimate', pvp2: '',
    cotLib: 'Cotation distributeur', cotDebut: '', cotFin: '', cotRemise: 30, cotNonRecond: false } },
  _raw: null, _suivi: new Map(),
  PANIER_REF: [['n360-del5', 6]],   // hypothèse de « première commande type » (modifiable dans le calculateur)

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  _eur(n) { return Math.round(n || 0).toLocaleString('fr-FR') + ' €'; },
  _eur2(n) { return (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; },
  _prenom() { return String(Session.nom || '').split(' ')[0]; },

  async init() {
    const s = this.state; s.chargement = true; s.erreur = null; this.render();
    try { await this._donnees(); } catch (e) { s.erreur = e.message || String(e); }
    s.chargement = false; this.render();
  },

  // Chargement des données du Coach, sans dessin : partagé par la page #/coach et la fenêtre de chat (CoachChat).
  async _donnees() {
    const s = this.state;
    {
      const L = t => SheetsAPI.lire('EMPOWER_MDB', t, { nocache: true });
      const [comptes, leads, visites, appels, objectifs, params, suivi, actions] = await Promise.all([
        L('COMPTES'), L('LEADS'), L('VISITES'), L('PHONING'), L('OBJECTIFS_PRIMES'), SheetsAPI.lire('EMPOWER_MDB', 'PARAMS'),
        L('V_COMPTES_SUIVI').catch(() => []),
        L('ACTIONS').catch(() => []),
        window.Catalogue.charger(SheetsAPI._sb),
      ]);
      this._raw = { comptes: comptes || [], leads: leads || [], visites: visites || [], appels: appels || [], objectifs: objectifs || [], params: params || [], actions: actions || [] };
      this._suivi = new Map((suivi || []).map(r => [String(r._uuid), r]));
      if (!s.pin && !Session.voitTout()) s.pin = String(Session.pin);
      await this._cochesCharger();
      this._calculer();
      if (!s.fil.length) s.fil.push({ r: 'a', h: `<b>Bonjour ${this._esc(this._prenom())}.</b> Je m'appuie sur vos chiffres, le catalogue et les règles du séminaire. Choisissez une question ci-dessus ou écrivez la vôtre.` });
      s.maj = new Date();
    }
    if (window.CoachChat) CoachChat.maj();
  },

  // Mode « tarifs » (rôle Externe) : catalogue, marges et offres uniquement, aucune donnée de compte.
  async _donneesTarifs() {
    const s = this.state;
    await window.Catalogue.charger(SheetsAPI._sb);
    s.tarifs = true;
    if (!s.fil.length) s.fil.push({ r: 'a', h: `<b>Bonjour ${this._esc(this._prenom())}.</b> Je réponds ici sur les tarifs, le calcul de marge et les offres possibles, avec les prix du catalogue. Choisissez une question ou ouvrez le calculateur.` });
    if (window.CoachChat) CoachChat.maj();
  },

  // Redessine ce qui est à l'écran : la page Coach si elle est ouverte, et la fenêtre de chat.
  _maj() { if (document.querySelector('#app .coach')) this.render(); if (window.CoachChat) CoachChat.maj(); },

  // ── Contexte du moteur : branche les règles de l'app (Empower, activé, localisé, paliers) ──
  _ctx(extra) {
    const dernier = c => { const e = this._suivi.get(String(c._uuid)); if (!e) return null; const ds = [e.Derniere_Visite, e.Dernier_Appel].filter(Boolean).map(x => String(x).slice(0, 10)).sort(); return ds.length ? ds[ds.length - 1] : null; };
    const onb = c => { const t = Date.parse(String(c.Date_Onboarding_Empower || '').slice(0, 10) + 'T00:00:00Z'); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null; };
    return Object.assign({
      now: new Date(), estEmpower: c => !!window.estEmpower(c), active: c => !!window.FlagsCanal.active(c), dernierContact: dernier,
      localise: c => !!window.ESI_GEO.depDe(c), palier: c => window.Paliers.palier(c), caEmpower: c => window.Paliers.caEmpower(c),
      adresseOk: c => !!window.ContactsObjectif.etat(c).adresse, depuisOnboarding: onb,
    }, extra || {});
  },

  _calculer() {
    const s = this.state, M = window.CoachMoteur, raw = this._raw, norm = v => String(v || '').trim().toUpperCase();
    const pin = s.pin ? Number(s.pin) : null, mien = p => pin == null ? true : Number(p) === pin;
    const params = Object.fromEntries(raw.params.map(p => [p.Parametre, p.Valeur]));
    const tri = M.trimestre(new Date()) || M.trimestre(new Date(), params.QuarterActif || 'Q3');
    const comptes = raw.comptes.filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE' && (Session.voitTout() || Number(c.PIN_CDS_Assigne) === Number(Session.pin)) && mien(c.PIN_CDS_Assigne));
    const leads = raw.leads.filter(p => {
      const src = norm(p.Source_Import);
      return norm(p.Flag_traite) !== 'DELETED' && !src.includes('FLAVIE') && src !== 'BASE_PROSPECTS_RELANCER' && src !== 'ESI_VISITE_FROID'
        && !['ARCHIVE', 'INTEGRE'].includes(norm(p.STATUT_EMPOWER)) && (Session.voitTout() ? mien(p.PIN_CDS_Assigne) : Number(p.PIN_CDS_Assigne) === Number(Session.pin));
    });
    // Contacts de la semaine calendaire (visites et appels réels) → coche automatique des actions « appeler / visiter »
    const dansSem = d => { try { return FiscalWeeks.dansSemaineCalendaire(d); } catch (e) { return false; } };
    const touches = new Set();
    raw.visites.filter(v => !v.deleted && dansSem(v.Date) && v.ID_Compte).forEach(v => touches.add(String(v.ID_Compte)));
    raw.appels.filter(a => dansSem(a.Date) && a.ID_Compte && (typeof estAppelRealise !== 'function' || estAppelRealise(a))).forEach(a => touches.add(String(a.ID_Compte)));
    const ctx = this._ctx({ pin });
    const toutes = M.cibles(comptes, ctx, 100000), cibles = toutes.slice(0, 5);
    // Devis émis depuis le Coach (journal) : ceux du périmètre, pour l'alerte « devis sans suite ».
    const devis = (raw.actions || []).filter(a => a.Type_Action === 'Devis' && (Session.voitTout() ? mien(a.PIN_CDS) : Number(a.PIN_CDS) === Number(Session.pin))).map(a => ({ date: String(a.Date_Action || '').slice(0, 10), nom: a.Nom_Compte }));
    const al = M.alertes({ leads, comptes, devis }, ctx);
    const plan = M.planSemaine(toutes, al, { faitCompte: c => touches.has(String(c.ID_Compte)), adressesCompletees: 0 }).map(a => Object.assign({}, a, { manuel: this._coche(tri, a.id) }));
    const trajs = tri ? M.trajectoire(raw.objectifs.filter(o => Session.voitTout() || Number(o.PIN_CDS) === Number(Session.pin)), tri) : [];
    const sel = tri ? (pin != null ? (trajs.find(t => t.pin === pin) || M.agreger([], tri)) : M.agreger(trajs, tri)) : null;
    const st = window.ContactsObjectif.stats(comptes);
    const loc = comptes.filter(c => ctx.localise(c)).length;
    this.state.d = { tri, comptes, cibles, nbCibles: toutes.length, alertes: al, plan, trajs, sel, qualite: { tot: comptes.length, loc, contact: st.contact, complet: st.complet },
                     quarterParam: params.QuarterActif || '' };
  },

  _cle(tri) { return `esi.coach.plan.${Session.pin}.${tri ? tri.quarter + '-' + tri.semaine : 'x'}`; },
  _coche(tri, id) { try { return !!(JSON.parse(localStorage.getItem(this._cle(tri)) || '{}')[id]); } catch (e) { return false; } },
  basculer(id) {
    const d = this.state.d; if (!d) return;
    let o = null;
    try { const k = this._cle(d.tri), cur = JSON.parse(localStorage.getItem(k) || '{}'); cur[id] ? delete cur[id] : (cur[id] = 1); localStorage.setItem(k, JSON.stringify(cur)); o = cur; } catch (e) {}
    if (o && d.tri) this._cochesSauver(d.tri.quarter + '-' + d.tri.semaine, o);
    this._calculer(); this.render();
  },

  // Coches du plan : copie serveur dans la table `vues_filtres` (module « coach-plan », une ligne par commercial et par semaine, droits par PIN existants)
  // pour les retrouver d'un appareil à l'autre (décocher se propage aussi) ; localStorage reste le miroir immédiat et le repli si le serveur est injoignable.
  _cochesCharger() {
    const c = window.SheetsAPI && SheetsAPI._sb; if (!c) return Promise.resolve();
    this._cocheIds = this._cocheIds || {};
    return c.from('vues_filtres').select('id,nom,filtres_json').eq('module', 'coach-plan').eq('pin_cds', Number(Session.pin)).limit(60).then(({ data, error }) => {
      if (error || !Array.isArray(data)) return;
      data.forEach(r => {
        this._cocheIds[r.nom] = r.id;
        try {
          const srv = r.filtres_json && typeof r.filtres_json === 'object' && !Array.isArray(r.filtres_json) ? r.filtres_json : {};
          localStorage.setItem(`esi.coach.plan.${Session.pin}.${r.nom}`, JSON.stringify(srv)); // le serveur fait foi : chaque coche y écrit l'état complet de la semaine
        } catch (e) { /* stockage local indisponible : le miroir local reste tel quel */ }
      });
    }).catch(() => {});
  },
  async _cochesSauver(nom, o) {
    const c = window.SheetsAPI && SheetsAPI._sb; if (!c) return;
    this._cocheIds = this._cocheIds || {};
    try {
      const id = this._cocheIds[nom];
      if (id) { await c.from('vues_filtres').update({ filtres_json: o, updated_at: new Date().toISOString() }).eq('id', id); return; }
      const { data } = await c.from('vues_filtres').insert({ pin_cds: Number(Session.pin), module: 'coach-plan', nom, filtres_json: o }).select('id').single();
      if (data && data.id) this._cocheIds[nom] = data.id;
    } catch (e) { /* le miroir local garde la coche */ }
  },

  setPin(v) {
    const s = this.state; s.pin = v; s.compteSel = '';
    s.coupure = s.fil.length;   // les échanges précédents ne sont plus envoyés à l'assistant : ils portaient sur un autre périmètre
    s.fil.push({ r: 'a', h: `<span class="co-mut">Périmètre : <b>${this._esc(this._libPerimetre())}</b>. Les réponses suivantes ne portent que sur ce périmètre.</span>` });
    this._calculer(); this.render();
  },
  _libPerimetre() { const s = this.state; if (!s.pin) return Session.voitTout() ? 'tout le réseau' : (Session.nom || 'mes comptes'); return (window.resolveCDS ? resolveCDS(s.pin) : s.pin); },
  setCol(c) { this.state.col = c; this.render(); },

  // ── Cartes et blocs de réponse ──
  _carteCible(x, sel) {
    const E = this._esc, conf = x.loc ? 'h' : 'l';
    return `<div class="co-cible"><div class="t"><b>${E(x.nom)}</b><span class="co-sp"></span><span class="co-conf ${conf}">${x.loc ? 'confiance haute' : 'confiance faible'}</span></div>
      <div class="co-mut">${E(x.ville || 'Ville n.c.')}${Session.voitTout() && x.pin && window.resolveCDS ? ' · commercial ' + E(resolveCDS(x.pin)) : ''} · ${x.raisons.map(E).join(' · ')}</div>
      <div class="co-score"><span>Potentiel</span><div class="co-bar"><i style="width:${x.pot}%"></i></div><span>Momentum</span><div class="co-bar"><i style="width:${x.mom}%"></i></div><span>Facilité</span><div class="co-bar"><i style="width:${x.fac}%"></i></div></div>
      <div class="co-actions"><button class="co-btn p" onclick="VueCoach.preparerVisite('${E(String(x.id))}')">Préparer la visite</button><a class="co-btn" href="#/compte/${encodeURIComponent(x.id)}">Voir la fiche</a><a class="co-btn" href="#/phoning/${encodeURIComponent(x.id)}">Appeler</a></div></div>`;
  },
  _statutLib: { rythme: 'au rythme', surveiller: 'à surveiller', decrochage: 'en décrochage', sans_objectif: 'objectif non renseigné' },

  _repObjectif() {
    const d = this.state.d, t = d.sel, tri = d.tri, E = this._esc, C = window.Catalogue;
    if (!tri) return 'Le trimestre en cours est hors du calendrier fiscal chargé : je ne peux pas calculer de rythme.';
    if (!t || t.obj <= 0) return `<b>L'objectif ${E(tri.quarter)} n'est pas renseigné</b> pour ce périmètre : renseignez-le dans Administration › Objectifs pour activer la trajectoire.`;
    const ref = C.calculer(this.PANIER_REF, 'pa_empower');
    const n = ref.cout > 0 ? Math.ceil(t.reste / ref.cout) : null;
    const al = k => d.alertes.find(a => a.id === k);
    const etapes = [];
    const hyp = `Hypothèse : première commande type de ${C.libelle(C.par(this.PANIER_REF[0][0]))} × ${this.PANIER_REF[0][1]} = ${this._eur(ref.cout)} d'achat Empower, ${this._eur(ref.marge)} de marge revendeur.`;
    if (t.reste > 0 && ref.cout > 0) {
      const couvre = d.nbCibles * ref.cout, pl = (k, a, b) => k > 1 ? b : a;
      if (d.nbCibles === 0) etapes.push(`<b>Développer le chiffre sur les comptes déjà actifs et ouvrir de nouveaux comptes Empower</b><br><span class="co-mut">Aucun compte Empower sans première commande dans ce périmètre. ${hyp}</span>`);
      else if (n <= d.nbCibles) etapes.push(`<b>Obtenir ${n} première${pl(n, '', 's')} commande${pl(n, '', 's')} Empower</b><br><span class="co-mut">${d.nbCibles} compte${pl(d.nbCibles, '', 's')} Empower sans commande dans le périmètre. ${hyp}</span>`);
      else etapes.push(`<b>Obtenir une première commande chez les ${d.nbCibles} compte${pl(d.nbCibles, '', 's')} Empower sans commande</b><br><span class="co-mut">Environ ${this._eur(couvre)} sur ${this._eur(t.reste)} d'écart : les ${this._eur(t.reste - couvre)} restants viendront des réassorts des comptes actifs et de nouveaux comptes à ouvrir. ${hyp}</span>`);
    }
    if (al('proches')) etapes.push(`<b>Faire passer ${al('proches').n} compte${al('proches').n > 1 ? 's' : ''} Éveil au palier Actif</b><br><span class="co-mut">Moins de 150 € du seuil de 1 000 € de CA Empower : une commande complémentaire suffit.</span>`);
    if (al('hors48')) etapes.push(`<b>Traiter ${al('hors48').n} rappel${al('hors48').n > 1 ? 's' : ''} échu${al('hors48').n > 1 ? 's' : ''} depuis plus de 48 h</b><br><span class="co-mut">Un rappel en retard de plus de 48 h, c'est un lead qui refroidit.</span>`);
    if (al('sans_adresse')) etapes.push(`<b>Compléter ${Math.min(5, al('sans_adresse').n)} fiche${Math.min(5, al('sans_adresse').n) > 1 ? 's' : ''} sans adresse</b><br><span class="co-mut">${al('sans_adresse').n} fiche${al('sans_adresse').n > 1 ? 's' : ''} sans adresse : chaque adresse place le compte sur la carte et fiabilise le ciblage.</span>`);
    return `<b>Objectif ${E(tri.quarter)} : ${this._eur(t.obj)}. Réalisé : ${this._eur(t.ca)} (${t.pct} %). Écart : ${this._eur(t.reste)}.</b> Il reste ${Math.round(tri.semainesRestantes)} semaines${t.reste > 0 ? `, soit <b>${this._eur(t.parSemaine)} à produire par semaine</b>` : ''}. Rythme attendu ${tri.pct} % : vous êtes <b>${this._statutLib[t.statut]}</b>.
      ${etapes.map((e, i) => `<div class="co-step"><span class="co-num">${i + 1}</span><div>${e}</div></div>`).join('') || '<p>Objectif atteint : consolidez les comptes actifs.</p>'}
      <div class="co-src">Calculé à partir de : objectifs ${E(tri.quarter)}, CA réalisé (sell-in), catalogue ${E(C.version)}. Aucun chiffre n'est inventé par l'assistant.</div>`;
  },

  _repRelancer() {
    const d = this.state.d, E = this._esc;
    if (!d.cibles.length) return '<b>Aucun compte Empower sans première commande</b> dans ce périmètre. Les relances se concentrent sur les paliers : voir « Comment j\'atteins mon objectif ? ».';
    const a48 = d.alertes.find(a => a.id === 'hors48');
    return `<b>${Math.min(3, d.cibles.length)} compte${d.cibles.length > 1 ? 's' : ''} à traiter en priorité</b>, classés par chance de commande :${a48 ? `<div class="co-alerte"><span>${E(a48.titre)}</span><a class="co-btn p" href="${a48.to}">${E(a48.action)}</a></div>` : ''}
      ${d.cibles.slice(0, 3).map(x => this._carteCible(x)).join('')}
      <div class="co-src">Score = potentiel 40 % + momentum 35 % + facilité 25 %. Confiance faible : la fiche n'est pas localisée.${d.nbCibles > 3 ? ' ' + (d.nbCibles - 3) + ' autres comptes dans le vivier.' : ''}</div>`;
  },

  _repVisite(id) {
    const d = this.state.d, C = window.Catalogue, E = this._esc;
    const x = (id && d.cibles.find(c => String(c.id) === String(id))) || (id && this._unCompte(id)) || d.cibles[0];
    if (!x) return 'Aucun compte à préparer : ouvrez une fiche ou choisissez un compte dans « Qui relancer aujourd\'hui ? ».';
    this.state.compteSel = String(x.id);
    const cmp = C.comparer([['n360-std', 1]]), e = cmp.empower, g = cmp.grossiste;
    const cote = cmp.cotations && cmp.cotations.length ? ` Une cotation grossiste est en cours (${E(cmp.cotations.join(', '))}) : le grossiste est plus proche, la marge Empower reste ${e.pct > g.pct ? 'supérieure' : 'à comparer'}.` : '';
    return `<b>Visite chez ${E(x.nom)}${x.ville ? ' (' + E(x.ville) + ')' : ''} : obtenir la première commande.</b>
      <div class="co-step"><span class="co-num">1</span><div><b>Ouvrir sur la rentabilité</b><br><span class="co-mut">Norton 360 Standard : marge de ${e.pct.toString().replace('.', ',')} % via Empower (${this._eur2(e.marge)} par licence) contre ${g.pct.toString().replace('.', ',')} % chez le grossiste. Zéro stock, commande après encaissement.${cote}</span></div></div>
      <div class="co-step"><span class="co-num">2</span><div><b>Trois questions de découverte</b><br><span class="co-mut">Combien de clients équipez-vous en antivirus ? Qui gère le renouvellement aujourd'hui ? Quelle part de vos clients est professionnelle (TPE) ?</span></div></div>
      <div class="co-step"><span class="co-num">3</span><div><b>Si « pas de place pour du stock »</b><br><span class="co-mut">Les licences se commandent à la demande, après encaissement du client : rien à stocker.</span></div></div>
      <div class="co-step"><span class="co-num">4</span><div><b>Engagement à obtenir</b><br><span class="co-mut">Une première commande de 4 licences d'ici vendredi, ou une date de rappel.</span></div></div>
      <div class="co-actions"><button class="co-btn p" onclick="VueCoach.ouvrirCalc()">Calculer la marge de cette commande</button><a class="co-btn" href="#/compte/${encodeURIComponent(x.id)}">Voir la fiche</a></div>
      <div class="co-src">Sources : catalogue ${E(C.version)} (prix des Réglages), fiche du compte, règles du séminaire.</div>`;
  },
  _unCompte(id) {
    const c = this.state.d.comptes.find(k => String(k.ID_Compte || k._uuid) === String(id)); if (!c) return null;
    return { id: c.ID_Compte || c._uuid, nom: c.Nom_Compte, ville: c.Ville };
  },

  _repRattrapage() {
    const d = this.state.d, t = d.sel, tri = d.tri, C = window.Catalogue;
    if (!tri || !t || t.obj <= 0) return this._repObjectif();
    if (t.reste <= 0) return '<b>Objectif atteint.</b> Le plan de rattrapage n\'est pas nécessaire : consolidez les comptes actifs et préparez le trimestre suivant.';
    const ref = C.calculer(this.PANIER_REF, 'pa_empower'), sem = Math.max(1, Math.round(Math.min(4, tri.semainesRestantes)));
    const lignes = []; for (let i = 1; i <= sem; i++) lignes.push(`<div class="co-step"><span class="co-num">S${i}</span><div><b>${this._eur(t.parSemaine)} à produire</b><br><span class="co-mut">Soit ${ref.cout > 0 ? Math.ceil(t.parSemaine / ref.cout) : 'n.c.'} première${Math.ceil(t.parSemaine / (ref.cout || 1)) > 1 ? 's' : ''} commande${Math.ceil(t.parSemaine / (ref.cout || 1)) > 1 ? 's' : ''} type, cumul visé : ${this._eur(t.ca + t.parSemaine * i)}</span></div></div>`);
    return `<b>${t.statut === 'rythme' ? 'Plan pour tenir le rythme' : 'Plan de rattrapage'} sur ${sem} semaine${sem > 1 ? 's' : ''}</b> : ${this._eur(t.reste)} d'écart sur ${Math.round(tri.semainesRestantes)} semaines restantes.${lignes.join('')}
      <div class="co-src">Hypothèse : première commande type ${this._eur(ref.cout)} d'achat Empower. Les semaines suivantes gardent le même effort hebdomadaire.</div>`;
  },

  // Objections courantes : chaque réponse s'appuie sur un chiffre calculé (catalogue des Réglages) ou une règle du séminaire.
  _repObjections() {
    const C = window.Catalogue, E = this._esc, cmp = C.comparer(this.PANIER_REF, { grossiste: 'pa_td' }), e = cmp.empower, g = cmp.grossiste, nom = C.libelle(C.par(this.PANIER_REF[0][0]));
    const cote = cmp.cotations && cmp.cotations.length ? ` Une cotation est en cours chez le grossiste (${E(cmp.cotations.join(', '))}) : l'écart est déjà réduit dans ce calcul.` : '';
    const o = (q, r) => `<div class="co-step"><span class="co-num">?</span><div><b>${q}</b><br><span class="co-mut">${r}</span></div></div>`;
    return `<b>Quatre objections, quatre réponses chiffrées.</b>
      ${o('« Je passe déjà par mon grossiste »', `Sur ${E(nom)} × ${this.PANIER_REF[0][1]}, la marge est de ${this._eur(e.marge)} (${String(e.pct).replace('.', ',')} %) via Empower contre ${this._eur(g.marge)} (${String(g.pct).replace('.', ',')} %) via Tech Data : ${cmp.gain >= 0 ? '+' : ''}${this._eur(cmp.gain)} pour le même panier.${cote}`)}
      ${o('« Je n\'ai pas de place pour du stock »', 'Les licences se commandent à la demande, après encaissement du client : zéro stock, zéro trésorerie immobilisée.')}
      ${o('« Mes clients n\'achètent pas Norton »', `Le revenue share Empower va jusqu'à ${Math.round(C.revenue_share.taux_max * 100)} % sur les renouvellements pendant ${C.revenue_share.annees} ans (assiette à confirmer, non chiffré ici). Proposer d'abord la licence à vos prochains clients équipés d'un nouveau PC.`)}
      ${o('« Je ne sais pas à quel prix vendre »', `Les prix de vente conseillés figurent dans le catalogue (${E(nom)} : ${this._eur2(C.par(this.PANIER_REF[0][0]).pvp_ttc)} TTC) : le calculateur à droite chiffre la marge à ce prix, produit par produit.`)}
      <div class="co-src">Sources : catalogue ${E(C.version)} (prix des Réglages), règles du séminaire. Chiffres calculés, jamais rédigés par un modèle.</div>`;
  },

  // Documents du Kit commercial à remettre selon le palier du compte (règles du séminaire) ; ouvre la bibliothèque pour le compte choisi.
  _repDocument() {
    const E = this._esc, P = window.Paliers, c = this.state.compteSel && this.state.d ? this.state.d.comptes.find(k => String(k.ID_Compte || k._uuid) === this.state.compteSel) : null;
    const cle = c ? P.palier(c).cle : null;
    const CONSEIL = { DORMANT: 'Kit de démarrage : Book Empower et flyer bonnes pratiques', EVEIL: 'Book Empower, flyer bonnes pratiques et la cotation en cours si elle est valide', ACTIF: 'Bundle et cross-sell, produits additionnels VPN et Utilities', AMBASSADEUR: 'Deck fonctionnalités avancées et produits additionnels, avec une business review trimestrielle' };
    const ligne = k => `<div class="co-step"><span class="co-num">${E(P.PALIERS[k].lib.charAt(0))}</span><div><b>${E(P.PALIERS[k].lib)}</b><br><span class="co-mut">${E(CONSEIL[k])}</span></div></div>`;
    const cibleBloc = c ? `<p>Compte choisi : <b>${E(c.Nom_Compte)}</b>, palier <b>${E(P.PALIERS[cle].lib)}</b>. À lui remettre : ${E(CONSEIL[cle] || 'aucun document spécifique')}.</p>` : '<p>Choisissez un compte (calculateur à droite) pour une recommandation ciblée ; voici les repères par palier.</p>';
    return `<b>Quel document envoyer ?</b>${cibleBloc}${c ? ligne(cle) : ['DORMANT', 'EVEIL', 'ACTIF', 'AMBASSADEUR'].map(ligne).join('')}
      <div class="co-actions"><button class="co-btn p" onclick="${c ? `VueKit.pourCompte('${E(String(c.ID_Compte))}');` : ''}Router.aller('#/kit')">Ouvrir le Kit commercial</button></div>
      <div class="co-src">Les documents échus ne peuvent pas être envoyés ; les documents internes ne sortent jamais de l'équipe.</div>`;
  },

  _repMarge() { setTimeout(() => this.ouvrirCalc(), 0); return '<b>Le calculateur s\'ouvre.</b> Choisissez les produits et les quantités : la marge Empower et la marge grossiste se calculent avec les prix des Réglages, cotation en cours comprise.'; },

  // Offres et promotions : uniquement ce qui est dans le catalogue (offre volume, cotations en cours) ; les offres X+Y sont chiffrées avec les termes saisis, jamais inventés.
  _repOffres() {
    const C = window.Catalogue, E = this._esc, rv = C.remise_volume, cot = C.cotationsActives();
    const ex = [['n360-del5', rv.seuil]], v = C.comparer(ex, { volume: true }), n = C.comparer(ex), e = v.empower, e0 = n.empower;
    const ligne = (t, d) => `<div class="co-step"><span class="co-num">+</span><div><b>${t}</b><br><span class="co-mut">${d}</span></div></div>`;
    const volume = ex.every(([id]) => C.par(id) && C.par(id).pa_empower != null && C.par(id).pvp_ttc != null)
      ? ` Exemple : ${rv.seuil} × ${E(C.libelle(C.par(ex[0][0])))} = ${this._eur(e0.marge)} de marge Empower, ${this._eur(e.marge)} avec l'offre (+${this._eur(e.marge - e0.marge)}).` : '';
    const cotes = cot.length ? cot.map(c => `<b>${E(c.libelle)}</b> (jusqu'au ${E(c.fin.split('-').reverse().join('/'))}, ${(c.canaux || []).map(x => x === 'td' ? 'Tech Data' : x === 'ingram' ? 'Ingram' : E(x)).join(' et ')})`).join(', ') : 'aucune cotation grossiste en cours';
    return `<b>Offres et promotions possibles</b>
      ${ligne(`Offre volume : -${Math.round(rv.taux * 100)} % sur le prix d'achat dès ${rv.seuil} licences`, `Références mixtes acceptées, soumise à validation budget commercial.${volume}`)}
      ${ligne('Offre X achetées + Y offertes', 'Chiffrée dans le calculateur avec les termes que vous saisissez (ex. 2 achetées + 1 offerte). L\'assistant n\'invente aucun terme d\'offre.')}
      ${ligne('Cotations grossiste', `Aujourd'hui : ${cotes}. Elles réduisent le prix d'achat grossiste, donc l'écart avec Empower.`)}
      <div class="co-actions"><button class="co-btn p" onclick="VueCoach.ouvrirCalc()">Chiffrer une offre dans le calculateur</button></div>
      <div class="co-src">Sources : catalogue ${E(C.version)} (prix des Réglages). Chiffres calculés, jamais rédigés par un modèle.</div>`;
  },

  _faits() {
    const d = this.state.d, t = d.sel, tri = d.tri;
    const l = [`Périmètre : ${this._libPerimetre()}${this.state.pin ? ' (un seul commercial : ne parle que de ses comptes)' : Session.voitTout() ? ' (plusieurs commerciaux : nomme le commercial de chaque compte)' : ''}.`];
    if (tri) l.push(`Trimestre ${tri.quarter}, semaine ${tri.semaine}, rythme attendu ${tri.pct} %, ${Math.round(tri.semainesRestantes)} semaines restantes.`);
    if (t && t.obj > 0) l.push(`Objectif ${this._eur(t.obj)}, réalisé ${this._eur(t.ca)} (${t.pct} %), écart ${this._eur(t.reste)}, ${this._eur(t.parSemaine)} par semaine, statut ${this._statutLib[t.statut]}.`);
    l.push(`${d.nbCibles} comptes Empower sans première commande. Fiches localisées ${d.qualite.loc} sur ${d.qualite.tot}.`);
    d.alertes.forEach(a => l.push(a.titre + '.'));
    d.cibles.slice(0, 3).forEach(x => l.push(`Cible : ${x.nom} (${x.ville || 'ville n.c.'}), commercial ${window.resolveCDS && x.pin ? resolveCDS(x.pin) : 'n.c.'}, score ${x.score}.`));
    return l.join('\n');
  },

  // ── Interactions ──
  poser(q, rep) { const s = this.state; s.fil.push({ r: 'u', h: this._esc(q) }); s.fil.push({ r: 'a', h: rep }); this._maj(); this._basFil(); },
  chip(k) {
    if (!this.state.d && ['objectif', 'relancer', 'visite', 'rattrapage', 'document'].includes(k)) return this.poser('Question sur mes comptes', 'Ce mode répond sur les <b>tarifs, les marges et les offres</b>. Le suivi des comptes et des objectifs est réservé aux commerciaux.');
    const Q = { objectif: ['Comment j\'atteins mon objectif ?', () => this._repObjectif()], relancer: ['Qui relancer aujourd\'hui ?', () => this._repRelancer()],
                visite: ['Prépare ma prochaine visite', () => this._repVisite()], marge: ['Calcule ma marge', () => this._repMarge()], rattrapage: ['Plan de rattrapage', () => this._repRattrapage()], objections: ['Répondre aux objections', () => this._repObjections()], document: ['Quel document envoyer ?', () => this._repDocument()], offres: ['Quelles offres et promotions possibles ?', () => this._repOffres()] }[k];
    if (Q) this.poser(Q[0], Q[1]());
  },
  preparerVisite(id) { this.poser('Prépare la visite de ce compte', this._repVisite(id)); },
  _route(t) {
    const x = String(t || '').toLowerCase();
    if (/objectif|atteindre|trajectoire|[ée]cart|retard/.test(x)) return 'objectif';
    if (/rattrap|30 ?j|plan d/.test(x)) return 'rattrapage';
    if (/objection|r[ée]ponds?|trop cher|pas de place|grossiste/.test(x)) return 'objections';
    if (/document|flyer|brochure|kit|envoyer|book|deck/.test(x)) return 'document';
    if (/relanc|appeler|contacter|prioritaire|cibl|qui /.test(x)) return 'relancer';
    if (/visite|rendez|pr[ée]par/.test(x)) return 'visite';
    if (/offre|promo|op[ée]ration|2 ?\+ ?1|remise|volume|cotation/.test(x)) return 'offres';
    if (/marge|prix|tarif|devis|calcul|rentab/.test(x)) return 'marge';
    return null;
  },
  async envoyer(texte) {
    const inp = document.getElementById('co-q'); const q = String(texte != null ? texte : (inp && inp.value) || '').trim(); if (!q || this.state.ia) return;
    if (inp && texte == null) inp.value = '';
    const k = this._route(q);
    if (k && q.split(/\s+/).length <= 4) return this.chip(k);   // formules courtes = réponses guidées ; phrases libres = assistant
    const s = this.state; s.fil.push({ r: 'u', h: this._esc(q) }); s.ia = true; s.fil.push({ r: 'a', h: '<span class="co-mut">Réflexion en cours…</span>', tmp: true }); this._maj(); this._basFil();
    let h;
    try {
      const rep = await window.GeminiAPI.coach(this._historique(q), s.d ? this._faits() : '', this._prenom(), s.pin || null);
      const src = rep.sources && rep.sources.length ? `<div class="co-mut" style="margin-top:6px">Sources : ${rep.sources.map(x => this._esc(x)).join(', ')}</div>` : '';
      h = `<span class="co-ia">Calculs faits par l'app, texte rédigé par l'IA</span><br>${this._esc(rep.texte).replace(/\n/g, '<br>')}${src}`;
    } catch (e) {
      s.fil = s.fil.filter(m => !m.tmp); s.ia = false;
      if (k) { s.fil.pop(); return this.chip(k); }   // assistant injoignable : on retombe sur la réponse guidée
      h = e && e.message && !/^HTTP|Failed to fetch|Load failed|NetworkError/i.test(e.message) ? this._esc(e.message) : 'Je n\'ai pas pu joindre l\'assistant. Les réponses guidées restent disponibles ci-dessus.';
    }
    s.fil = s.fil.filter(m => !m.tmp); s.fil.push({ r: 'a', h }); s.ia = false; this._maj(); this._basFil();
  },
  // Historique envoyé au serveur : texte brut des échanges du fil (12 derniers), question en cours en dernier.
  _historique(q) {
    const txt = h => String(h).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').trim();
    const l = this.state.fil.slice(this.state.coupure || 0).filter(m => !m.tmp).map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: txt(m.h) })).filter(m => m.content);
    return l.slice(-12);
  },
  touche(ev) { if (ev.key === 'Enter') { ev.preventDefault(); this.envoyer(); } },
  _basFil() { ['co-fil', 'cc-fil'].forEach(id => { const f = document.getElementById(id); if (f) f.scrollTop = f.scrollHeight; }); },
  ouvrirCalc() { if (!document.querySelector('#app .coach')) { if (window.CoachChat) CoachChat.vue('calc'); return; } this.state.col = 'calc'; this.render(); const c = document.getElementById('co-calc'); if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },

  // ── Calculateur ──
  majLigne(i, champ, v) { const p = this.state.panier[i]; if (!p) return; if (champ === 'id') p[0] = v; else p[1] = Math.max(0, Math.min(9999, Math.floor(Number(v) || 0))); this._majCalc(); },
  ajouterLigne() { const l = window.Catalogue.listeProduits(); if (this.state.panier.length < 8 && l.length) { this.state.panier.push([l[0].id, 1]); this._majCalc(); } },
  retirerLigne(i) { this.state.panier.splice(i, 1); this._majCalc(); },
  setGrossiste(v) { this.state.grossiste = v === 'pa_ingram' ? 'pa_ingram' : 'pa_td'; this._majCalc(); },
  setVolume(v) { this.state.volume = !!v; this._majCalc(); },
  majPdf(champ, v) {
    const o = this.state.pdf; if (!(champ in o)) return;
    if (['achetees', 'offertes', 'taux', 'par', 'qteB', 'seuil', 'q1', 'q2'].includes(champ)) o[champ] = Math.max(0, Math.min(champ === 'taux' ? 90 : 999, Number(v) || 0));
    else if (['tauxVol', 'cotRemise'].includes(champ)) o[champ] = Math.max(0, Math.min(90, Number(v) || 0));
    else if (['offertPvp', 'pvp1', 'pvp2'].includes(champ)) o[champ] = v === '' ? '' : Math.max(0, Math.min(9999, Number(String(v).replace(',', '.')) || 0));
    else if (champ === 'cotNonRecond') o[champ] = !!v;
    else if (champ === 'conditions') o[champ] = String(v).slice(0, 300);
    else if (champ === 'titre' || champ === 'sousTitre') o[champ] = String(v).slice(0, 90);
    else o[champ] = String(v).slice(0, 120);
    if (champ === 'type' || champ === 'offre') this._majCalc();
  },
  creerPdf() {
    const s = this.state, o = s.pdf, L = window.LivrablesPDF;
    if (!L) return;
    const T = L.TYPES[o.type] || L.TYPES.proposition;
    const compte = s.compteSel && s.d ? s.d.comptes.find(c => String(c.ID_Compte || c._uuid) === s.compteSel) : null;
    const pin = Number(s.pin) || (window.Session && Session.pin) || null;
    const p = window.EquipeContacts && pin ? EquipeContacts.parPin(pin) : null;
    const offre = !T.offre ? null : o.offre === 'remise' ? (o.taux > 0 ? { type: 'remise', taux: o.taux / 100 } : null)
      : o.offre === 'produit' ? (o.par > 0 && o.offertNom ? { type: 'produit', par: o.par, nom: o.offertNom, pvp_ttc: o.offertPvp === '' ? null : o.offertPvp } : null)
      : (o.achetees > 0 && o.offertes > 0 ? { type: 'xy', achetees: o.achetees, offertes: o.offertes } : null);
    if (T.offre && !offre) { if (window.Toast) Toast.afficher("Renseignez les termes de l'offre", 'erreur'); return; }
    if (compte) this._tracerDevis(compte, T, o);
    const op = (id, q, nom, pvp) => ({ achete: [id, q], offert: { nom, pvp_ttc: pvp === '' ? null : pvp } });
    const extra = o.type === 'supplementaire' ? { canal: o.canal, params: { refA: o.refA, refB: o.refB, qteB: o.qteB, seuil: o.seuil, taux: o.tauxVol / 100, offertNom: o.offertNom, offertPvp: o.offertPvp === '' ? null : o.offertPvp } }
      : o.type === 'bundle' ? { canal: o.canal === 'pa_td' || o.canal === 'pa_ingram' || o.canal === 'pa_empower' ? o.canal : 'pa_empower', debut: o.debut, operations: [op(o.op1, o.q1, o.nom1, o.pvp1), op(o.op2, o.q2, o.nom2, o.pvp2)].filter(x => x.achete[0]) }
      : o.type === 'cotation' ? { cotation: { libelle: o.cotLib, debut: o.cotDebut, fin: o.cotFin, remise_pct: o.cotRemise, canaux: ['td', 'ingram'], non_reconductible: o.cotNonRecond }, date: o.cotDebut || undefined }
      : {};
    L.ouvrir({ ...extra, conditions: o.conditions, titre: o.titre.trim(), sousTitre: o.sousTitre.trim(), type: o.type, lignes: s.panier.filter(([id, q]) => q > 0), grossiste: s.grossiste, volume: s.volume, offre,
      client: { nom: o.client || (compte && compte.Nom_Compte) || '', contact: o.contact, region: (compte && compte.Ville) || '' },
      emetteur: p ? { nom: p.nom, role: p.role, tel: p.tel ? EquipeContacts.fmtTel(p.tel) : '', mail: p.mail || '' } : {},
      validite: o.validite || '', dejaCA: compte ? window.Paliers.caEmpower(compte) : 0 });
  },
  // Chaque document créé pour un compte est inscrit au journal (Type_Action « Devis ») : base de l'alerte « devis sans suite ».
  async _tracerDevis(compte, T, o) {
    try {
      const e = window.Catalogue.comparer(this.state.panier.filter(([id, q]) => q > 0), { grossiste: this.state.grossiste, volume: this.state.volume }).empower;
      await SheetsAPI.ecrire('EMPOWER_MDB', 'ACTIONS', {
        ID_Action: genId('DEV'), Date_Action: new Date().toISOString(), Type_Action: 'Devis', Source: 'ESI', PIN_CDS: Session.pin, Nom_Compte: compte.Nom_Compte,
        Statut_Avant: '', Statut_Apres: '', Resum_IA: T.lib + ' : ' + Math.round(e.cout) + ' € d\'achat HT, marge ' + Math.round(e.marge) + ' €' + (o.validite ? ', valable jusqu\'au ' + o.validite : ''),
        GPS_Lat: '', GPS_Lng: '', Timestamp: new Date().toISOString(),
      });
      if (this._raw) this._raw.actions.push({ Type_Action: 'Devis', PIN_CDS: Session.pin, Date_Action: new Date().toISOString(), Nom_Compte: compte.Nom_Compte });
    } catch { /* trace non bloquante */ }
  },
  _pdfHtml() {
    const o = this.state.pdf, E = this._esc, L = window.LivrablesPDF, C = window.Catalogue; if (!L) return '';
    const T = L.TYPES[o.type] || L.TYPES.proposition;
    const opt = (k) => `<option value="${k}" ${o.type === k ? 'selected' : ''}>${E(L.TYPES[k].lib)}</option>`;
    const prods = (sel) => C.listeProduits().map(p => `<option value="${E(p.id)}" ${p.id === sel ? 'selected' : ''}>${E(C.libelle(p))}</option>`).join('');
    const inp = (champ, ph, type, extra) => `<input type="${type || 'text'}" ${extra || ''} placeholder="${E(ph)}" value="${E(o[champ])}" aria-label="${E(ph)}" onchange="VueCoach.majPdf('${champ}',this.value)"/>`;
    const sl = (champ, opts, lab) => `<select aria-label="${E(lab)}" onchange="VueCoach.majPdf('${champ}',this.value)">${opts}</select>`;
    const ligne = (cols, h) => `<div class="co-ligne" style="grid-template-columns:${cols}">${h}</div>`;
    const canaux = [['pa_td', 'Prix d\'achat Tech Data'], ['pa_ingram', 'Prix d\'achat Ingram'], ['pa_empower', 'Prix d\'achat Empower']].map(([k, l]) => `<option value="${k}" ${o.canal === k ? 'selected' : ''}>${l}</option>`).join('');
    let champs = '';
    if (T.offre) {
      champs += ligne('1fr', sl('offre', `<option value="xy" ${o.offre === 'xy' ? 'selected' : ''}>X licences achetées, Y offertes</option><option value="remise" ${o.offre === 'remise' ? 'selected' : ''}>Remise en % sur le prix d'achat</option><option value="produit" ${o.offre === 'produit' ? 'selected' : ''}>Produit offert pour X licences achetées</option>`, "Type d'offre"));
      champs += o.offre === 'remise' ? ligne('1fr', `<input type="number" min="0" max="90" value="${o.taux}" aria-label="Remise en pourcent" onchange="VueCoach.majPdf('taux',this.value)"/>`)
        : o.offre === 'produit' ? ligne('1fr 1fr', `<input type="number" min="1" value="${o.par}" aria-label="Licences achetées pour un produit offert" onchange="VueCoach.majPdf('par',this.value)"/>${inp('offertNom', 'Produit offert')}`) + ligne('1fr', inp('offertPvp', 'PVP TTC du produit offert (€)', 'number', 'min="0" step="0.01"'))
        : ligne('1fr 1fr', `<input type="number" min="1" value="${o.achetees}" aria-label="Licences achetées" onchange="VueCoach.majPdf('achetees',this.value)"/><input type="number" min="1" value="${o.offertes}" aria-label="Licences offertes" onchange="VueCoach.majPdf('offertes',this.value)"/>`);
      champs += '<p class="co-mut" style="margin:2px 0 6px">Les termes sont ceux que vous saisissez : l\'app n\'en invente aucun.</p>';
    }
    if (o.type === 'supplementaire') {
      champs += ligne('1fr', sl('canal', canaux, "Canal d'achat"))
        + ligne('1fr 1fr', sl('refA', prods(o.refA), 'Référence offre A') + sl('refB', prods(o.refB), 'Référence offre B'))
        + ligne('1fr 1fr', inp('offertNom', 'Produit offert (offre B)') + inp('offertPvp', 'PVP TTC offert (€)', 'number', 'min="0" step="0.01"'))
        + ligne('1fr 1fr 1fr', `<input type="number" min="1" value="${o.qteB}" aria-label="Lot acheté, offre B" onchange="VueCoach.majPdf('qteB',this.value)"/><input type="number" min="1" value="${o.seuil}" aria-label="Seuil en licences, offre volume" onchange="VueCoach.majPdf('seuil',this.value)"/><input type="number" min="1" max="90" value="${o.tauxVol}" aria-label="Remise volume en pourcent" onchange="VueCoach.majPdf('tauxVol',this.value)"/>`)
        + '<p class="co-mut" style="margin:2px 0 6px">Lot offre B · seuil volume · remise volume (%). Le PVP du produit offert est à saisir s\'il n\'est pas dans les Réglages.</p>';
    }
    if (o.type === 'bundle') {
      champs += ligne('1fr', sl('canal', canaux, "Canal d'achat"))
        + ligne('1fr 70px', sl('op1', prods(o.op1), 'Produit acheté, opération 1') + `<input type="number" min="1" value="${o.q1}" aria-label="Quantité opération 1" onchange="VueCoach.majPdf('q1',this.value)"/>`)
        + ligne('1fr 1fr', inp('nom1', 'Produit offert 1') + inp('pvp1', 'PVP TTC offert (€)', 'number', 'min="0" step="0.01"'))
        + ligne('1fr 70px', sl('op2', '<option value="">Aucune seconde opération</option>' + prods(o.op2), 'Produit acheté, opération 2') + `<input type="number" min="1" value="${o.q2}" aria-label="Quantité opération 2" onchange="VueCoach.majPdf('q2',this.value)"/>`)
        + ligne('1fr 1fr', inp('nom2', 'Produit offert 2') + inp('pvp2', 'PVP TTC offert (€)', 'number', 'min="0" step="0.01"'))
        + ligne('1fr', `<label class="co-mut">Début de l'opération <input type="date" value="${E(o.debut)}" onchange="VueCoach.majPdf('debut',this.value)"/></label>`);
    }
    if (o.type === 'cotation') {
      champs += ligne('1fr', inp('cotLib', 'Nom de la cotation'))
        + ligne('1fr 1fr', `<label class="co-mut">Du <input type="date" value="${E(o.cotDebut)}" onchange="VueCoach.majPdf('cotDebut',this.value)"/></label><label class="co-mut">Au <input type="date" value="${E(o.cotFin)}" onchange="VueCoach.majPdf('cotFin',this.value)"/></label>`)
        + ligne('1fr', `<input type="number" min="0" max="90" value="${o.cotRemise}" aria-label="Remise sur le prix d'achat, en pourcent" onchange="VueCoach.majPdf('cotRemise',this.value)"/>`)
        + `<label class="co-opt"><input type="checkbox" ${o.cotNonRecond ? 'checked' : ''} onchange="VueCoach.majPdf('cotNonRecond',this.checked)"/> Opération non reconductible</label>`
        + '<p class="co-mut" style="margin:2px 0 6px">Remise appliquée au prix d\'achat des Réglages ; un prix coté saisi dans les Réglages l\'emporte.</p>';
    }
    return `<div class="co-soft" style="margin-top:12px"><div class="co-eyebrow">Document PDF paysage</div>
      ${ligne('1fr', `<select aria-label="Type de document" onchange="VueCoach.majPdf('type',this.value)">${Object.keys(L.TYPES).map(opt).join('')}</select>`)}
      ${ligne('1fr 1fr', `<input type="text" placeholder="Client (société)" value="${E(o.client)}" aria-label="Client" onchange="VueCoach.majPdf('client',this.value)"/><input type="text" placeholder="Contact" value="${E(o.contact)}" aria-label="Contact client" onchange="VueCoach.majPdf('contact',this.value)"/>`)}
      ${ligne('1fr', inp('titre', 'Titre du document (facultatif, remplace le titre du modèle)'))}
      ${ligne('1fr', inp('sousTitre', 'Sous-titre (facultatif)'))}
      ${champs}
      ${o.type === 'cotation' ? '' : ligne('1fr', `<label class="co-mut">Valable jusqu'au <input type="date" value="${E(o.validite)}" onchange="VueCoach.majPdf('validite',this.value)"/></label>`)}
      ${ligne('1fr', inp('conditions', 'Conditions particulières (facultatif)'))}
      <button class="co-btn p" style="width:100%;margin-top:6px" onclick="VueCoach.creerPdf()">Créer le PDF</button></div>`;
  },
  _majCalc() { const el = document.getElementById('co-calc'); if (el) el.outerHTML = this._calcHtml(); else this._maj(); },

  _calcHtml() {
    const s = this.state, C = window.Catalogue, E = this._esc, d = s.d;
    const lignes = s.panier.filter(([id, q]) => q > 0);
    const opts = { volume: s.volume, grossiste: s.grossiste };
    const cmp = C.comparer(lignes, opts), e = cmp.empower, g = cmp.grossiste;
    const produits = C.listeProduits();
    const sel = (id) => produits.map(p => `<option value="${E(p.id)}" ${p.id === id ? 'selected' : ''}>${E(C.libelle(p))}${p.pa_empower == null ? ' (prix Empower n.c.)' : ''}</option>`).join('');
    const compte = s.compteSel && d ? d.comptes.find(c => String(c.ID_Compte || c._uuid) === s.compteSel) : null;
    const deja = compte ? window.Paliers.caEmpower(compte) : 0, reste = C.resteAuPalier(deja + e.cout);
    const cotes = (g.cotations || []);
    const nomG = s.grossiste === 'pa_ingram' ? 'Ingram' : 'Tech Data';
    return `<div class="co-carte co-calc" id="co-calc"><div class="co-row"><div class="co-eyebrow">Calculateur de marge</div><span class="co-sp"></span><span class="co-mut">Catalogue ${E(C.version)}${C.source() === 'base' ? '' : ' (défaut)'}</span></div>
      ${s.panier.map(([id, q], i) => `<div class="co-ligne"><select aria-label="Produit ${i + 1}" onchange="VueCoach.majLigne(${i},'id',this.value)">${sel(id)}</select><input type="number" min="0" max="9999" inputmode="numeric" value="${q}" aria-label="Quantité ${i + 1}" onchange="VueCoach.majLigne(${i},'q',this.value)"/><button class="co-x" aria-label="Retirer la ligne" onclick="VueCoach.retirerLigne(${i})">×</button></div>`).join('')}
      <div class="co-row" style="margin:6px 0"><button class="co-btn" onclick="VueCoach.ajouterLigne()">+ Ajouter un produit</button><span class="co-sp"></span>
        <select style="width:auto" aria-label="Grossiste de comparaison" onchange="VueCoach.setGrossiste(this.value)"><option value="pa_td" ${s.grossiste === 'pa_td' ? 'selected' : ''}>vs Tech Data</option><option value="pa_ingram" ${s.grossiste === 'pa_ingram' ? 'selected' : ''}>vs Ingram</option></select></div>
      <label class="co-opt"><input type="checkbox" ${s.volume ? 'checked' : ''} onchange="VueCoach.setVolume(this.checked)"/> Offre volume : -${Math.round(C.remise_volume.taux * 100)} % sur l'achat dès ${C.remise_volume.seuil} licences (à valider)</label>
      ${lignes.length ? `<div class="co-res"><div class="co-soft"><div class="co-eyebrow">Via Empower</div><div class="co-kv big"><span>Marge</span><b class="co-pos">${this._eur(e.marge)}</b></div><div class="co-kv"><span>Taux</span><b>${String(e.pct).replace('.', ',')} %</b></div><div class="co-kv"><span>Achat HT</span><b>${this._eur2(e.cout)}</b></div></div>
        <div class="co-soft"><div class="co-eyebrow">Via ${nomG}</div><div class="co-kv big"><span>Marge</span><b>${this._eur(g.marge)}</b></div><div class="co-kv"><span>Taux</span><b>${String(g.pct).replace('.', ',')} %</b></div><div class="co-kv"><span>Achat HT</span><b>${this._eur2(g.cout)}</b></div></div></div>
        <p style="margin:10px 0 0;font-size:13px">Passer ce panier par Empower rapporte <b class="co-pos">${cmp.gain >= 0 ? '+' : ''}${this._eur(cmp.gain)}</b> de marge. CA revendeur HT : ${this._eur(e.ca)}.</p>
        <p style="margin:6px 0 0;font-size:13px">${compte ? `${E(compte.Nom_Compte)} : ` : ''}cette commande fait <b>${this._eur(e.cout)}</b> de CA Empower${compte ? ` (${this._eur(deja)} déjà réalisés)` : ''}. ${reste > 0 ? `Il reste <b>${this._eur(reste)}</b> pour atteindre le palier Actif (1 000 €).` : 'Le palier Actif (1 000 €) est atteint.'}</p>`
        : '<p class="co-mut" style="margin-top:10px">Ajoutez une quantité pour voir la marge.</p>'}
      ${cotes.length ? `<div class="co-cot"><b>Cotation grossiste en cours : ${E(cotes.join(', '))}.</b> Le prix d'achat ${nomG} en tient compte.</div>` : ''}
      ${cmp.exclus.length ? `<p class="co-mut" style="margin-top:8px">Exclu de la comparaison (prix non renseigné sur un canal) : ${E(cmp.exclus.join(', '))}.</p>` : ''}
      <p class="co-mut" style="margin-top:8px">PVP HT = PVP TTC / 1,20. Marge = PVP HT moins prix d'achat. Revenue share Empower : jusqu'à ${Math.round(C.revenue_share.taux_max * 100)} % sur les renouvellements pendant ${C.revenue_share.annees} ans (assiette à confirmer, non chiffré ici).</p>${this._pdfHtml()}</div>`;
  },

  _planHtml() {
    const d = this.state.d, E = this._esc, tri = d.tri, t = d.sel;
    const lignes = d.plan.length ? d.plan.map(a => {
      const fait = a.fait || a.manuel;
      return `<div class="co-step"><button class="co-tick ${fait ? 'on' : ''}" ${a.fait ? 'disabled title="Validé automatiquement par votre activité de la semaine"' : `aria-label="Cocher : ${E(a.texte)}" onclick="VueCoach.basculer('${E(a.id)}')"`}>${fait ? '✓' : ''}</button>
        <div style="font-size:13px" class="${fait ? 'co-fait' : ''}">${a.to ? `<a href="${a.to}"><b>${E(a.texte)}</b></a>` : `<b>${E(a.texte)}</b>`}<br><span class="co-mut">${E(a.detail || '')}</span></div></div>`;
    }).join('') : '<p class="co-mut">Aucune action prioritaire cette semaine : le périmètre est à jour.</p>';
    const barre = t && t.obj > 0 ? `<div class="co-soft" style="margin-top:10px"><div class="co-eyebrow">Trajectoire ${E(tri.quarter)}</div><div class="co-bar" style="margin:6px 0"><i class="${t.statut === 'rythme' ? 'g' : t.statut === 'decrochage' ? 'c' : ''}" style="width:${Math.min(100, t.pct)}%"></i></div><div class="co-mut">${t.pct} % de l'objectif, rythme attendu ${tri.pct} % · ${this._statutLib[t.statut]}</div></div>`
      : `<div class="co-soft" style="margin-top:10px"><div class="co-eyebrow">Trajectoire</div><div class="co-mut">Objectif du trimestre non renseigné pour ce périmètre.</div></div>`;
    return `<div class="co-carte"><div class="co-eyebrow">Mon plan · semaine ${tri ? tri.semaine : 'n.c.'}</div><h2>${d.plan.length} action${d.plan.length > 1 ? 's' : ''}</h2>${lignes}${barre}<p class="co-mut" style="margin-top:10px">Les actions « appeler » et « visiter » se cochent seules quand votre activité de la semaine le prouve.</p></div>`;
  },

  _qualiteHtml() {
    const q = this.state.d.qualite, E = this._esc, pct = q.tot ? Math.round(q.loc / q.tot * 100) : 0, a = q.tot - q.loc;
    return `<div class="co-carte"><div class="co-eyebrow">Qualité des données</div>
      <div class="co-kv"><span>Fiches localisées</span><b>${q.loc} / ${q.tot}</b></div><div class="co-bar"><i style="width:${pct}%"></i></div>
      <div class="co-kv"><span>Contacts renseignés</span><b>${q.contact} / ${q.tot}</b></div>
      <p class="co-mut" style="margin-top:8px">Chaque adresse renseignée améliore le ciblage et la carte. <b>${a} fiche${a > 1 ? 's' : ''} à compléter</b> dans ce périmètre.</p>
      <div class="co-actions"><a class="co-btn" href="#/comptes">Compléter les fiches</a><a class="co-btn" href="#/territoires">Voir la carte</a></div></div>`;
  },

  render() {
    const app = document.getElementById('app'); if (!app) return;
    const s = this.state, E = this._esc;
    let corps;
    if (s.chargement) corps = '<p class="pilo-vide" style="padding:16px">Chargement…</p>';
    else if (s.erreur) corps = `<div class="erreur">Erreur : ${E(s.erreur)}</div>`;
    else {
      const d = s.d;
      const heure = s.maj ? s.maj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
      const sel = Session.voitTout() ? `<select aria-label="Commercial" onchange="VueCoach.setPin(this.value)"><option value="">Tout le réseau</option>${(this._raw.objectifs || []).map(o => `<option value="${E(o.PIN_CDS)}" ${String(s.pin) === String(o.PIN_CDS) ? 'selected' : ''}>${E(window.resolveCDS(o.PIN_CDS))}</option>`).join('')}</select>` : `<span class="co-mut">${E(Session.nom)}</span>`;
      const note = d.tri && d.quarterParam && d.quarterParam !== d.tri.quarter ? `<p class="co-mut">Le trimestre actif des paramètres est ${E(d.quarterParam)} ; le Coach suit la date du jour (${E(d.tri.quarter)}).</p>` : '';
      corps = `<div class="coach">
        <div class="coach-barre">${sel}<span class="co-sp"></span><span class="coach-frais"><i></i>Données de ${E(heure)} · ${d.qualite.loc} fiches localisées sur ${d.qualite.tot} · <button class="co-lien" style="border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit" onclick="VueCoach.init()">Actualiser</button></span></div>${note}
        <div class="coach-onglets" role="tablist">${[['plan', 'Mon plan'], ['chat', 'Conversation'], ['calc', 'Calculateur']].map(([k, l]) => `<button role="tab" aria-selected="${s.col === k}" onclick="VueCoach.setCol('${k}')">${l}</button>`).join('')}</div>
        <div class="coach-cols" data-vue="${s.col}">
          <div class="coach-col c-plan">${this._planHtml()}</div>
          <div class="coach-col c-chat"><div class="co-carte"><div class="co-row"><b style="font-size:15px;color:var(--co-ink)">Conversation</b></div>
            <div class="co-chips">${[['objectif', 'Comment j\'atteins mon objectif ?'], ['relancer', 'Qui relancer aujourd\'hui ?'], ['visite', 'Prépare ma visite'], ['marge', 'Calcule ma marge'], ['rattrapage', 'Plan de rattrapage'], ['objections', 'Répondre aux objections'], ['document', 'Quel document envoyer ?']].map(([k, l]) => `<button class="co-chip" onclick="VueCoach.chip('${k}')">${l}</button>`).join('')}</div>
            <div class="co-fil" id="co-fil" aria-live="polite">${s.fil.map(m => `<div class="co-bulle ${m.r}">${m.h}</div>`).join('')}</div>
            <div class="co-saisie"><input id="co-q" type="text" maxlength="300" placeholder="Posez votre question…" aria-label="Votre question" onkeydown="VueCoach.touche(event)"/><button class="co-btn p" onclick="VueCoach.envoyer()">Envoyer</button></div></div></div>
          <div class="coach-col c-calc">${this._calcHtml()}${this._qualiteHtml()}</div>
        </div></div>`;
    }
    app.innerHTML = `<header class="header-vue"><button onclick="Router.retour()" class="btn-retour" aria-label="Retour">←</button><h1>Coach</h1></header>${NavBar('coach')}<div class="pilo">${corps}</div>`;
    this._basFil();
  },
};
