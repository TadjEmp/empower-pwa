// ═══════════════════════════════════════
//  mobile-ux.js : confort d'usage sur téléphone
//  - Blocs repliables : les jauges de la liste des comptes tiennent en une ligne de résumé, les blocs de la fiche compte
//    se déplient au toucher (le premier reste ouvert). Le contenu reste dans la page : rien n'est supprimé.
//  Réservé aux écrans < 900 px ; aucun effet sur le bureau.
// ═══════════════════════════════════════
window.MobileUX = (function () {
  const mq = window.matchMedia ? window.matchMedia('(max-width: 899px)') : { matches: false };
  const ouvertes = new Set();   // blocs que l'utilisateur a dépliés : conservés quand la fiche se redessine

  function resumeJauges(el) {
    const js = [...el.querySelectorAll('.cs-jauge')];
    const parties = js.map(j => {
      const tt = ((j.querySelector('.bloc-titre') || {}).textContent || ''), t = tt.split('·')[0].trim();
      const m = (j.textContent || '').replace(tt, '').match(/(\d+)\s*\/\s*(\d+)/);   // le chiffre « n / total » du corps, pas la date du titre
      return t ? t + (m ? ' ' + m[1] + '/' + m[2] : '') : null;
    }).filter(Boolean);
    return parties.join(' · ') || 'Objectifs';
  }
  function jauges() {
    document.querySelectorAll('.cs-jauges:not([data-mob])').forEach(el => {
      el.dataset.mob = '1'; el.classList.add('mob-replie');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mob-resume'; b.setAttribute('aria-expanded', 'false');
      b.textContent = resumeJauges(el);
      b.onclick = () => { const ferme = el.classList.toggle('mob-replie'); b.setAttribute('aria-expanded', String(!ferme)); };
      el.parentNode.insertBefore(b, el);
    });
  }
  function blocsFiche() {
    document.querySelectorAll('.fiche-body').forEach(corps => {
      const blocs = [...corps.querySelectorAll(':scope > .bloc-fiche, :scope > * > .bloc-fiche')];
      blocs.forEach((bloc, i) => {
        const titre = bloc.querySelector(':scope > .bloc-titre');
        if (!titre || bloc.dataset.mob) return;
        bloc.dataset.mob = '1'; bloc.classList.add('mob-pliable');
        const cle = (titre.textContent || '').trim();
        if (blocs.length > 2 && !ouvertes.has(cle)) bloc.classList.add('mob-replie');   // plusieurs blocs : tout replié, un toucher déplie
        titre.setAttribute('role', 'button'); titre.tabIndex = 0;
        const basculer = () => { const ferme = bloc.classList.toggle('mob-replie'); ferme ? ouvertes.delete(cle) : ouvertes.add(cle); };
        titre.addEventListener('click', basculer);
        titre.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(); } });
      });
    });
  }
  function appliquer() { if (!mq.matches) return; try { jauges(); blocsFiche(); } catch (e) { /* le confort ne doit jamais casser une page */ } }

  function init() {
    const app = document.getElementById('app'); if (!app) return;
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(appliquer, 40); }).observe(app, { childList: true, subtree: true });
    appliquer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  return { appliquer };
})();

// Vues de filtre sauvegardées : sur téléphone, une pastille « Vues » ouvre cette feuille (appliquer, enregistrer, supprimer)
// à la place de la rangée « menu + 2 boutons » empilée sous les filtres. `vue` = 'VueComptes' ou 'VuePipeline'.
window.FeuilleVues = (function () {
  const esc = x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  function fermer() { const e = document.getElementById('feuille-filtre'); if (e) e.remove(); }
  function ouvrir(nomVue) {
    const V = window[nomVue] || (nomVue === 'VueComptes' && typeof VueComptes !== 'undefined' ? VueComptes : typeof VuePipeline !== 'undefined' ? VuePipeline : null);
    if (!V) return;
    fermer();
    const vues = V.state.vuesFiltres || [], actif = V.state.vueFiltreActive;
    const el = document.createElement('div');
    el.id = 'feuille-filtre';
    el.innerHTML = `<div class="ff-fond" data-fv="fermer"></div>
      <div class="ff-feuille" role="dialog" aria-label="Vues sauvegardées">
        <div class="ff-poignee"></div><h3>Vues sauvegardées</h3>
        <div class="ff-choix">
          ${vues.length ? vues.map(v => `<button class="ff-opt ${String(actif) === String(v.id) ? 'on' : ''}" data-fv="appliquer" data-id="${esc(v.id)}">${esc(v.nom)}${String(actif) === String(v.id) ? '<span class="material-symbols-outlined" aria-hidden="true">check</span>' : ''}</button>`).join('') : '<div class="ff-vide">Aucune vue enregistrée. Réglez vos filtres puis enregistrez-les.</div>'}
        </div>
        <div class="ff-actions">
          <button class="ff-act" data-fv="enregistrer"><span class="material-symbols-outlined" aria-hidden="true">save</span>Enregistrer les filtres actuels</button>
          ${actif ? '<button class="ff-act ff-act-sec" data-fv="supprimer"><span class="material-symbols-outlined" aria-hidden="true">delete</span>Supprimer cette vue</button>' : ''}
          ${actif ? '<button class="ff-act ff-act-sec" data-fv="aucune">Retirer la vue active</button>' : ''}
        </div>
      </div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-fv]'); if (!b) return;
      const a = b.dataset.fv;
      fermer();
      if (a === 'appliquer') V.appliquerVueFiltre(b.dataset.id);
      else if (a === 'enregistrer') V.demanderSauvegardeVue();
      else if (a === 'supprimer') V.supprimerVueFiltre();
      else if (a === 'aucune') V.appliquerVueFiltre('');
    });
    document.body.appendChild(el);
  }
  return { ouvrir, fermer };
})();
