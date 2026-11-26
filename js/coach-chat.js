// ═══════════════════════════════════════
//  coach-chat.js : le Coach en fenêtre de chat, disponible sur tous les écrans.
//  Bureau (≥ 900 px) : bulle en bas à droite, fenêtre flottante, bouton « agrandir » pour un volet latéral.
//  Mobile : icône dans l'en-tête de chaque écran, feuille qui monte du bas (fermable en la glissant ou par le retour arrière).
//  Le fil et les réponses sont ceux de VueCoach (une seule conversation, conservée quand on change de page).
//  Rôles : « complet » si le droit coach existe ; « tarifs » pour l'Externe (catalogue, marges, offres, aucune donnée de compte).
// ═══════════════════════════════════════
window.CoachChat = (function () {
  const mq = window.matchMedia ? window.matchMedia('(max-width: 899px)') : { matches: false };
  const etat = { ouvert: false, vue: 'chat', large: false, charge: false, erreur: null };
  let racine = null, bulle = null, fond = null;

  const ICO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mode() {
    const S = window.Session, P = window.Permissions;
    if (!S || !S.token || !S.role || !P) return null;
    if (P.peut(S.role, 'coach')) return 'complet';
    return S.role === 'EXTERNE' ? 'tarifs' : null;
  }
  const route = () => (window.Router && Router.hashCourant ? Router.hashCourant() : location.hash) || '';
  const surPageCoach = () => /^#\/coach(\?|$)/.test(route());
  const visible = () => !!mode() && !/^#\/login/.test(route()) && !!route();

  function badge() {
    const d = window.VueCoach && VueCoach.state && VueCoach.state.d;
    const n = d && d.alertes ? d.alertes.length : 0;
    return n ? `<span class="cc-pastille">${n > 9 ? '9+' : n}</span>` : '';
  }

  // ── Éléments permanents : bulle (bureau), fond (mobile), fenêtre ──
  function monter() {
    if (racine) return;
    bulle = document.createElement('button');
    bulle.type = 'button'; bulle.id = 'cc-bulle'; bulle.className = 'cc-bulle'; bulle.setAttribute('aria-label', 'Ouvrir le coach');
    bulle.onclick = () => ouvrir();
    fond = document.createElement('div'); fond.className = 'cc-fond'; fond.onclick = () => fermer();
    racine = document.createElement('section');
    racine.id = 'coach-chat'; racine.className = 'cc'; racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-label', 'Coach assistant'); racine.setAttribute('aria-hidden', 'true');
    document.body.append(bulle, fond, racine);
    racine.addEventListener('click', e => {
      const b = e.target.closest('[data-cc]');
      if (b) {
        const a = b.dataset.cc;
        if (a === 'fermer') fermer();
        else if (a === 'agrandir') { etat.large = !etat.large; maj(); }
        else if (a === 'plan') { fermer(); Router.aller('#/coach'); }
        else if (a === 'chat' || a === 'calc') vue(a);
        else if (a === 'envoyer') envoyer();
        else if (a === 'reessayer') reessayer();
        else if (a === 'chip') chip(b.dataset.k, b.dataset.id);
        return;
      }
      const a = e.target.closest('a[href^="#/"]'); if (a && mq.matches) fermer();   // navigation depuis la feuille mobile : on la referme
    });
    racine.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'cc-q') { e.preventDefault(); envoyer(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && etat.ouvert && !document.body.classList.contains('vis-ouverte')) fermer(); });
    geste();
    if (window.visualViewport) { visualViewport.addEventListener('resize', clavier); visualViewport.addEventListener('scroll', clavier); }
    window.addEventListener('resize', () => { majCouche(); });
  }

  // Sur mobile, la feuille ouverte est une « couche » d'historique (le retour arrière la ferme) : cf. Router.OVERLAYS.
  function majCouche() { if (racine) racine.classList.toggle('cc-couche', etat.ouvert && mq.matches); }

  // Clavier iPhone : la feuille suit la zone réellement visible.
  function clavier() {
    if (!racine || !mq.matches || !etat.ouvert || !window.visualViewport) return;
    const vv = visualViewport, bas = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    racine.style.bottom = bas + 'px'; racine.style.height = Math.min(vv.height * 0.94, window.innerHeight * 0.9) + 'px';
  }
  // Glisser l'en-tête vers le bas ferme la feuille.
  function geste() {
    let y0 = null, dy = 0;
    racine.addEventListener('touchstart', e => { if (!mq.matches || !e.target.closest('.cc-tete') || e.target.closest('button')) return; y0 = e.touches[0].clientY; dy = 0; racine.style.transition = 'none'; }, { passive: true });
    racine.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); racine.style.transform = `translateY(${dy}px)`; }, { passive: true });
    racine.addEventListener('touchend', () => { if (y0 == null) return; racine.style.transition = ''; racine.style.transform = ''; const ferme = dy > 90; y0 = null; if (ferme) fermer(); });
  }

  // ── Contenu ──
  function chips() {
    const m = mode();
    const c = m === 'complet'
      ? [['objectif', 'Comment j\'atteins mon objectif ?'], ['relancer', 'Qui relancer aujourd\'hui ?'], ['visite', 'Prépare ma visite'], ['marge', 'Calcule ma marge'], ['offres', 'Offres possibles'], ['objections', 'Répondre aux objections'], ['document', 'Quel document envoyer ?'], ['rattrapage', 'Plan de rattrapage']]
      : [['marge', 'Calcule ma marge'], ['offres', 'Offres possibles'], ['objections', 'Répondre aux objections']];
    const mc = m === 'complet' && /^#\/compte\/([^/?]+)/.exec(route());
    const ctx = mc ? `<button type="button" class="co-chip cc-ctx" data-cc="chip" data-k="visite-compte" data-id="${esc(decodeURIComponent(mc[1]))}">Prépare la visite de ce compte</button>` : '';
    return ctx + c.map(([k, l]) => `<button type="button" class="co-chip" data-cc="chip" data-k="${k}">${l}</button>`).join('');
  }

  function corps() {
    const V = window.VueCoach;
    if (etat.erreur) return `<div class="cc-msg">Le Coach n'a pas pu charger ses données.<br><span class="co-mut">${esc(etat.erreur)}</span><br><button type="button" class="co-btn p" data-cc="reessayer">Réessayer</button></div>`;
    if (!etat.charge) return '<div class="cc-msg">Chargement…</div>';
    if (etat.vue === 'calc') return `<div class="cc-scroll">${V._calcHtml()}</div>`;
    return `<div class="cc-chips">${chips()}</div>
      <div class="co-fil cc-fil" id="cc-fil" aria-live="polite">${V.state.fil.map(m => `<div class="co-bulle ${m.r}">${m.h}</div>`).join('')}</div>
      <div class="co-saisie cc-saisie"><input id="cc-q" type="text" maxlength="300" placeholder="Posez votre question…" aria-label="Votre question" enterkeyhint="send"/><button type="button" class="co-btn p" data-cc="envoyer">Envoyer</button></div>`;
  }

  function maj() {
    if (!racine) return;
    const m = mode(), cache = !visible() || surPageCoach();
    document.body.classList.toggle('cc-actif', !!m && !cache);
    bulle.hidden = cache; bulle.innerHTML = ICO + badge();
    iconesEntete();
    if (cache && etat.ouvert) { fermer(); return; }
    racine.classList.toggle('cc-ouvert', etat.ouvert); racine.classList.toggle('cc-large', etat.large && !mq.matches);
    racine.setAttribute('aria-hidden', String(!etat.ouvert)); fond.classList.toggle('cc-fond-on', etat.ouvert && mq.matches);
    document.body.classList.toggle('cc-dock', etat.ouvert && etat.large && !mq.matches);
    majCouche();
    if (!etat.ouvert) { racine.innerHTML = ''; return; }
    const q = document.getElementById('cc-q'), garde = q ? q.value : '', foc = q && document.activeElement === q;
    racine.innerHTML = `<div class="cc-tete"><span class="cc-poign" aria-hidden="true"></span>
        <div class="cc-titre"><b>Coach</b><span class="co-mut">${m === 'tarifs' ? 'Tarifs, marges et offres' : 'Votre assistant commercial'}</span></div>
        <div class="cc-seg" role="tablist">${[['chat', 'Conversation'], ['calc', 'Calculateur']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${etat.vue === k}" data-cc="${k}">${l}</button>`).join('')}</div>
        ${m === 'complet' ? '<button type="button" class="cc-ib" data-cc="plan" aria-label="Ouvrir mon plan complet" title="Mon plan">Plan</button>' : ''}
        <button type="button" class="cc-ib cc-agr" data-cc="agrandir" aria-label="${etat.large ? 'Réduire' : 'Agrandir'}" title="${etat.large ? 'Réduire' : 'Agrandir'}">${etat.large ? '⤡' : '⤢'}</button>
        <button type="button" class="cc-ib" data-cc="fermer" aria-label="Fermer le coach">×</button></div>
      <div class="cc-corps">${corps()}</div>`;
    const n = document.getElementById('cc-q'); if (n) { n.value = garde; if (foc) n.focus(); }
    if (window.VueCoach) VueCoach._basFil();
  }

  // Mobile : icône du coach dans la barre de marque (à gauche du menu), présente sur tous les écrans sauf la page Coach.
  function iconesEntete() {
    const ok = !!mode() && visible() && !surPageCoach() && mq.matches;
    document.querySelectorAll('.app-brand-bar').forEach(h => {
      let b = h.querySelector(':scope > .cc-ico');
      if (!ok) { if (b) b.remove(); return; }
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.className = 'cc-ico'; b.setAttribute('aria-label', 'Ouvrir le coach'); b.onclick = () => ouvrir();
        const ham = h.querySelector('.brand-hamburger'); h.insertBefore(b, ham || null);
      }
      b.innerHTML = ICO + badge();
    });
  }

  // ── Actions ──
  async function charger() {
    const V = window.VueCoach, m = mode(); if (!V || !m) return;
    etat.erreur = null;
    // Changement de profil dans la même page : on repart d'une conversation vierge (aucune donnée de l'autre profil).
    if (etat.modeVu && etat.modeVu !== m) { V.state.fil = []; V.state.tarifs = false; V._raw = null; }
    etat.modeVu = m;
    try {
      if (m === 'complet' && !V._raw) { etat.charge = false; maj(); await V._donnees(); }
      else if (m === 'tarifs' && !V.state.tarifs) { etat.charge = false; maj(); await V._donneesTarifs(); }
      etat.charge = true;
    } catch (e) { etat.erreur = e.message || String(e); etat.charge = false; }
    maj();
  }
  function reessayer() { etat.erreur = null; charger(); }
  function ouvrir() {
    if (!mode()) return;
    monter(); etat.ouvert = true; maj(); charger();
    if (!mq.matches) setTimeout(() => { const q = document.getElementById('cc-q'); if (q) q.focus(); }, 60);
  }
  function fermer() {
    if (!racine) return;
    etat.ouvert = false; racine.style.bottom = ''; racine.style.height = ''; racine.style.transform = ''; maj();
  }
  function vue(v) {
    etat.vue = v;
    if (!etat.ouvert) { ouvrir(); return; }
    maj();
    if (v === 'calc') { const c = document.getElementById('co-calc'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); }
  }
  function chip(k, id) {
    const V = window.VueCoach; etat.vue = 'chat';
    if (k === 'visite-compte') return V.preparerVisite(id);
    V.chip(k); maj();
  }
  function envoyer() { const q = document.getElementById('cc-q'); if (!q) return; const t = q.value.trim(); if (!t) return; q.value = ''; etat.vue = 'chat'; window.VueCoach.envoyer(t); }

  // Surveille les écrans : l'icône d'en-tête est ajoutée à chaque nouvel écran, la bulle suit la route et la session.
  function init() {
    monter(); maj();
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(maj, 60); }).observe(document.getElementById('app') || document.body, { childList: true });
    window.addEventListener('popstate', () => setTimeout(maj, 60));
    window.addEventListener('hashchange', () => setTimeout(maj, 60));
    if (mq.addEventListener) mq.addEventListener('change', maj);
  }

  return { init, ouvrir, fermer, vue, chip, envoyer, maj, reessayer, mode, etat };
})();
