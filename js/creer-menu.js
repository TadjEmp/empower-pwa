// ═══════════════════════════════════════
//  creer-menu.js — Refresh ESI : bouton « ＋ » central de la barre basse mobile
//  Ouvre une feuille « Créer » dont les entrées mènent aux parcours existants (aucun formulaire dupliqué) :
//  nouveau lead (Tracker), nouvelle visite (questionnaire : prospection froide, suivi, onboarding, photos),
//  nouvel appel (Phoning, dictée vocale), nouveau mailing. Les entrées suivent les droits du profil.
// ═══════════════════════════════════════
window.CreerMenu = (function () {
  const ENTREES = [
    { tab: 'tracker',       t: 'Nouveau lead',    d: 'Ajouter un lead au Tracker',                       go: () => { Router.aller('#/empower-tracker'); setTimeout(() => { if (window.VuePipeline && VuePipeline.ouvrirSaisie) VuePipeline.ouvrirSaisie(); }, 900); }, ico: '<path d="M12 5v14M5 12h14"/>' },
    { tab: 'questionnaire', t: 'Nouvelle visite', d: 'Prospection froide, suivi, onboarding, photos',     go: () => { if (window.VueQuestionnaire) VueQuestionnaire._visitePlanifiee = null; Router.aller('#/questionnaire'); }, ico: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { tab: 'phoning',       t: 'Nouvel appel',    d: 'Questionnaire phoning, dictée vocale',              go: () => Router.aller('#/phoning'), ico: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>' },
    { tab: 'mailing',       t: 'Nouveau mailing', d: 'Écrire à un compte ou à un lead',                   go: () => Router.aller('#/mailing'), ico: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>' },
  ];
  const peut = t => !window.Permissions || !window.Session || Permissions.peut(Session.role, t);
  const visibles = () => ENTREES.filter(e => peut(e.tab));

  function fermer() { const s = document.getElementById('creer-feuille'); if (s) s.remove(); document.removeEventListener('keydown', echap); }
  function echap(e) { if (e.key === 'Escape') fermer(); }
  function ouvrir() {
    fermer();
    const l = visibles(); if (!l.length) return;
    const d = document.createElement('div'); d.id = 'creer-feuille';
    d.innerHTML = `<div class="creer-fond" onclick="CreerMenu.fermer()"></div>
      <div class="creer-panneau" role="dialog" aria-modal="true" aria-label="Créer">
        <div class="creer-poignee"></div><h2>Créer</h2>
        <p>Les actions proposées dépendent de votre profil.</p>
        ${l.map((e, i) => `<button class="creer-entree" onclick="CreerMenu.aller(${i})"><span class="creer-ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${e.ico}</svg></span><span><strong>${e.t}</strong><small>${e.d}</small></span></button>`).join('')}
      </div>`;
    document.body.appendChild(d); document.addEventListener('keydown', echap);
  }
  function aller(i) { const e = visibles()[i]; fermer(); if (e) e.go(); }

  // Insère le bouton au milieu de la barre basse (mobile) dès qu'une barre de navigation apparaît.
  function monter() {
    const nav = document.querySelector('.nav-principale');
    if (!nav || nav.querySelector('.nav-plus') || !visibles().length) return;
    const items = [...nav.querySelectorAll('.nav-item:not(.nav-sidebar-only):not(.nav-sidebar-action)')];
    if (!items.length) return;
    const b = document.createElement('button');
    b.className = 'nav-plus'; b.type = 'button'; b.setAttribute('aria-label', 'Créer');
    b.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    b.onclick = ouvrir;
    items[Math.min(items.length >= 3 ? 1 : 0, items.length - 1)].insertAdjacentElement('afterend', b);
  }
  // Onglet « Plus » (barre basse mobile) : les modules qui ne tiennent pas dans la barre, selon les droits du profil.
  function fermerPlus() { const s = document.getElementById('plus-feuille'); if (s) s.remove(); }
  function ouvrirPlus() {
    fermerPlus(); fermer();
    const nav = document.querySelector('.nav-principale'); if (!nav) return;
    const liens = [...nav.querySelectorAll('a.nav-item.nav-sidebar-only')].map(a => ({
      href: a.getAttribute('href'), lbl: a.dataset.lbl || a.textContent.trim(), ico: (a.querySelector('.nav-icone') || {}).innerHTML || '', actif: a.classList.contains('actif'),
    }));
    const d = document.createElement('div'); d.id = 'plus-feuille'; d.className = 'creer-feuille-base';
    d.innerHTML = `<div class="creer-fond" onclick="CreerMenu.fermerPlus()"></div>
      <div class="creer-panneau" role="dialog" aria-modal="true" aria-label="Plus">
        <div class="creer-poignee"></div><h2>Plus</h2><p>Les autres modules de votre profil.</p>
        <div class="plus-grille">${liens.map(l => `<a class="plus-entree${l.actif ? ' actif' : ''}" href="${l.href}" onclick="CreerMenu.fermerPlus()"><span class="plus-ico">${l.ico}</span><span>${l.lbl}</span></a>`).join('')}</div>
        <div class="plus-actions">
          <button type="button" onclick="CreerMenu.fermerPlus();Theme.suivant()">Apparence</button>
          <button type="button" onclick="CreerMenu.fermerPlus();DrawerMenu._synchro()">Synchroniser</button>
          <button type="button" class="danger" onclick="CreerMenu.fermerPlus();DrawerMenu._deconnecter()">Déconnexion</button>
        </div>
      </div>`;
    document.body.appendChild(d);
  }
  function monterPlus() {
    const nav = document.querySelector('.nav-principale');
    if (!nav || nav.querySelector('.nav-plus-tab')) return;
    const autres = nav.querySelectorAll('a.nav-item.nav-sidebar-only'); if (!autres.length) return;
    const b = document.createElement('button');
    b.className = 'nav-item nav-plus-tab'; b.type = 'button'; b.setAttribute('aria-label', 'Plus');
    const actifAutre = !!nav.querySelector('a.nav-item.nav-sidebar-only.actif');
    if (actifAutre) b.classList.add('actif');
    b.innerHTML = '<span class="nav-icone"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg></span><span class="nav-lbl">Plus</span>';
    b.onclick = ouvrirPlus;
    const mob = [...nav.querySelectorAll('a.nav-item:not(.nav-sidebar-only)')];
    (mob[mob.length - 1] || nav.lastElementChild).insertAdjacentElement('afterend', b);
  }
  new MutationObserver(() => { monter(); monterPlus(); }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', monterPlus);
  void 0 && new MutationObserver(monter).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', monter);
  return { ouvrir, fermer, aller, monter, ouvrirPlus, fermerPlus };
})();
