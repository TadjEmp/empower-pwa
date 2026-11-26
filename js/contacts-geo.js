// ═══════════════════════════════════════════════════════════════════════
//  contacts-geo.js — Briques communes carte / complétude des contacts / paliers
//  1. ESI_GEO       : département déduit du code postal (sans service externe)
//  2. ContactsObjectif : complétude des fiches comptes (objectif 31/12/2026)
//  3. Paliers       : Dormant / Éveil / Actif / Ambassadeur (séminaire Impact)
//  Aucune donnée n'est envoyée hors de l'application.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  const vide = v => v == null || String(v).trim() === '';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── 1. Département depuis le code postal ───────────────────────────────
  // Corse : 200xx-201xx = 2A, 202xx-206xx = 2B ; outre-mer 97x/98x sur 3 chiffres.
  // Même règle que la fonction SQL esi_dep_depuis_cp (supabase/propositions/carte_departement_cp.sql).
  function depDeCP(cp) {
    const p = String(cp == null ? '' : cp).trim();
    if (!/^\d{5}$/.test(p)) return null;
    if (p.startsWith('20')) return Number(p) < 20200 ? '2A' : '2B';
    if (p.startsWith('97') || p.startsWith('98')) return p.slice(0, 3);
    return p.slice(0, 2);
  }
  // Département d'une ligne compte/lead : colonne Departement d'abord, sinon code postal.
  function depDe(row) {
    const d = String((row && (row.Departement || row.departement)) || '').trim().toUpperCase();
    const m = d.match(/^(2A|2B|97\d|98\d|\d{2})/);
    if (m) return m[1];
    if (/^\d$/.test(d)) return '0' + d;
    return depDeCP(row && (row.Code_Postal || row.code_postal));
  }
  window.ESI_GEO = { depDeCP, depDe };

  // ── 2. Complétude des contacts ─────────────────────────────────────────
  // « Fiche renseignée » = au moins une de ces informations : interlocuteur, téléphone, e-mail ou adresse (règle validée le 6/11/2026).
  // « Fiche complète »   = interlocuteur ET (téléphone OU e-mail) ET adresse + code postal + ville.
  const CO = window.ContactsObjectif = {
    ECHEANCE: '2026-12-31',
    CHAMPS: [
      { cle: 'interlocuteur', lib: 'Interlocuteur', ok: c => !vide(c.Contact_Nom) },
      { cle: 'tel',           lib: 'Téléphone',     ok: c => !vide(c.Tel) },
      { cle: 'email',         lib: 'E-mail',        ok: c => !vide(c.Email) },
      { cle: 'adresse',       lib: 'Adresse',       ok: c => !vide(c.Adresse) },
      { cle: 'cp',            lib: 'Code postal',   ok: c => !vide(c.Code_Postal) },
      { cle: 'ville',         lib: 'Ville',         ok: c => !vide(c.Ville) },
    ],
    etat(c) {
      const f = {}; CO.CHAMPS.forEach(x => { f[x.cle] = x.ok(c); });
      const joignable = f.tel || f.email;
      const contact = !!(f.interlocuteur || f.tel || f.email || f.adresse);
      const adresse = f.adresse && f.cp && f.ville;
      const manquants = [];
      if (!f.interlocuteur) manquants.push('Interlocuteur');
      if (!joignable) manquants.push('Téléphone ou e-mail');
      if (!adresse) manquants.push(!f.cp ? 'Code postal' : !f.adresse ? 'Adresse' : 'Ville');
      const nb = CO.CHAMPS.filter(x => f[x.cle]).length;
      return { f, joignable, contact, adresse, complet: !!(f.interlocuteur && joignable && adresse), manquants, pct: Math.round(nb / CO.CHAMPS.length * 100) };
    },
    joursRestants(now) {
      const fin = new Date(CO.ECHEANCE + 'T23:59:59').getTime();
      return Math.max(0, Math.ceil((fin - (now || Date.now())) / 86400000));
    },
    stats(comptes) {
      const l = (comptes || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE');
      const par = {}, champs = {}; CO.CHAMPS.forEach(x => { champs[x.cle] = 0; });
      let contact = 0, complet = 0, joignable = 0;
      l.forEach(c => {
        const e = CO.etat(c);
        if (e.contact) contact++; if (e.complet) complet++; if (e.joignable) joignable++;
        CO.CHAMPS.forEach(x => { if (e.f[x.cle]) champs[x.cle]++; });
        const pin = c.PIN_CDS_Assigne || '';
        const o = par[pin] = par[pin] || { pin, tot: 0, contact: 0 };
        o.tot++; if (e.contact) o.contact++;
      });
      const tot = l.length, pct = n => tot ? Math.round(n / tot * 100) : 0;
      const jours = CO.joursRestants();
      const reste = tot - contact;
      return {
        tot, contact, complet, joignable, reste, champs, jours,
        pct: pct(contact), pctComplet: pct(complet),
        parSemaine: jours > 0 ? Math.ceil(reste / Math.max(1, jours / 7)) : reste,
        parCds: Object.values(par).map(o => ({ ...o, pct: o.tot ? Math.round(o.contact / o.tot * 100) : 0 })).sort((a, b) => a.pct - b.pct),
      };
    },
    // Jauge d'objectif. opts.sansCarte : contenu seul (pour l'intégrer dans un panneau existant).
    renderJauge(comptes, opts) {
      const s = CO.stats(comptes), nu = !!(opts && opts.sansCarte);
      const R = 70, C = Math.PI * R, arc = 'M 20 90 A 70 70 0 0 1 160 90';
      const lignes = s.parCds.filter(x => x.pin).map(x => `
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:6px">
          <span style="flex:0 0 110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(window.resolveCDS ? window.resolveCDS(x.pin) : x.pin)}</span>
          <span style="flex:1;height:8px;border-radius:4px;background:var(--c-border);overflow:hidden"><span style="display:block;height:100%;width:${x.pct}%;background:#FF6D68"></span></span>
          <span style="flex:0 0 96px;text-align:right;white-space:nowrap;color:var(--c-text-2)">${x.contact} / ${x.tot} · ${x.pct} %</span>
        </div>`).join('');
      const champs = CO.CHAMPS.map(x => {
        const p = s.tot ? Math.round(s.champs[x.cle] / s.tot * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:5px">
          <span style="flex:0 0 110px">${x.lib}</span>
          <span style="flex:1;height:6px;border-radius:3px;background:var(--c-border);overflow:hidden"><span style="display:block;height:100%;width:${p}%;background:#343F48"></span></span>
          <span style="flex:0 0 40px;text-align:right;color:var(--c-text-2)">${p} %</span></div>`;
      }).join('');
      const corps = `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px">
          <svg viewBox="0 0 180 104" width="200" role="img" aria-label="${s.pct} % des comptes ont un contact renseigné : ${s.contact} sur ${s.tot}" style="max-width:100%;flex:0 0 auto">
            <path d="${arc}" fill="none" stroke="var(--c-border)" stroke-width="16" stroke-linecap="round"/>
            <path d="${arc}" fill="none" stroke="#FF6D68" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(C * s.pct / 100).toFixed(1)} ${C.toFixed(1)}"/>
            <text x="90" y="80" text-anchor="middle" font-size="28" font-weight="800" fill="var(--c-title)">${s.pct} %</text>
            <text x="90" y="98" text-anchor="middle" font-size="10" fill="var(--c-text-2)">contacts renseignés</text>
          </svg>
          <div style="flex:1;min-width:170px">
            <div style="font-size:28px;font-weight:800;color:var(--c-title);line-height:1">${s.contact}<span style="font-size:15px;font-weight:600;color:var(--c-text-2)"> / ${s.tot}</span></div>
            <div style="font-size:12px;color:var(--c-text-2);margin-top:4px">comptes avec au moins un nom, un téléphone, un e-mail ou une adresse</div>
            <div style="font-size:12px;margin-top:6px">Objectif <strong>100 %</strong> au 31/12/2026 : <strong>${s.jours} j</strong> restants, soit <strong>${s.parSemaine}</strong> fiche${s.parSemaine > 1 ? 's' : ''} à compléter par semaine</div>
            <div style="font-size:12px;margin-top:4px;color:var(--c-text-2)">Fiches entièrement complètes (avec adresse) : ${s.complet} (${s.pctComplet} %)</div>
          </div>
        </div>
        ${lignes ? `<div style="margin-top:10px">${lignes}</div>` : ''}
        <details style="margin-top:10px"><summary style="font-size:12px;cursor:pointer;color:var(--c-text-2)">Détail par information</summary>${champs}</details>`;
      return nu ? corps : `<div class="bloc-fiche"><div class="bloc-titre">Contacts renseignés · objectif 31/12/2026</div>${corps}</div>`;
    },
    // ── Suivi du remplissage : deux mesures séparées, chacune avec sa barre et un filtre ───────────────────
    //  · Tracker : les leads du kanban (pipeline). · Autres comptes : comptes hors kanban, croisés avec la base. 
    //  · Base    : le fichier « BASE COMPTES ACTIFS - MATCHES ET ENRICHIS » (table base_comptes).
    //  Filtres communs : commercial et statut (renseignés / à compléter / complets).
    _filtre: { com: '', statut: '', src: 'T', sel: null, max: 10 },
    _cs: [], _base: null, _baseCharge: false, _leads: null, _leadsCharge: false,
    _nomCom(pin) { const n = window.resolveCDS ? window.resolveCDS(pin) : pin; return String(n || '').trim().toUpperCase().split(/\s+/)[0] || ''; },
    _baseVersCompte(b) {
      return { Contact_Nom: b.contact_principal || b.Contact_Principal, Tel: b.tel || b.Tel, Email: b.email || b.Email, Adresse: b.adresse || b.Adresse,
               Code_Postal: b.code_postal || b.Code_Postal, Ville: b.ville || b.Ville, Site_Web: b.site_web || b.Site_Web };
    },
    chargerBase() {
      if (CO._baseCharge || !window.SheetsAPI) return;
      CO._baseCharge = true;
      SheetsAPI.lire('EMPOWER_MDB', 'base_comptes', { nocache: true })
        .then(l => { CO._base = Array.isArray(l) ? l : []; CO._majSuivi(); })
        .catch(() => { CO._base = []; CO._majSuivi(); });
    },
    _bloc(titre, sous, n, tot, details, couleur, src) {
      const pct = tot ? Math.round(n / tot * 100) : 0;
      const clic = src ? ` role="button" tabindex="0" title="Voir les comptes à compléter" onclick="ContactsObjectif._ouvrir('${src}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ContactsObjectif._ouvrir('${src}')}" style="cursor:pointer"` : '';
      return `<section class="cs-jauge suivi-bloc" aria-label="${esc(titre)}"><div${clic}>
        <div class="bloc-titre" style="margin-bottom:2px">${esc(titre)}</div>
        <div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">${esc(sous)}</div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">
          <span style="font-size:28px;font-weight:800;color:var(--c-title);line-height:1">${pct} %</span>
          <span style="font-size:13px;color:var(--c-text-2)">${n} / ${tot}</span></div>
        <div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(titre)} : ${pct} %"
             style="height:12px;border-radius:6px;background:var(--c-border);overflow:hidden;margin-top:8px"><div style="height:100%;width:${pct}%;background:${couleur}"></div></div></div>
        ${details}</section>`;
    },
    _lignes(items, tot, src) {
      return `<details style="margin-top:10px"><summary style="font-size:12px;cursor:pointer;color:var(--c-text-2)">Détail par information</summary>${items.map(([lib, n, cle]) => {
        const p = tot ? Math.round(n / tot * 100) : 0;
        const clic = src && cle ? ` role="button" tabindex="0" title="Voir les comptes à compléter : ${esc(lib)}" onclick="ContactsObjectif._ouvrir('${src}','${cle}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ContactsObjectif._ouvrir('${src}','${cle}')}"` : '';
        return `<div${clic} style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:5px;${clic ? 'cursor:pointer;' : ''}"><span style="flex:0 0 110px">${esc(lib)}</span>
          <span style="flex:1;height:6px;border-radius:3px;background:var(--c-border);overflow:hidden"><span style="display:block;height:100%;width:${p}%;background:#343F48"></span></span>
          <span style="flex:0 0 64px;text-align:right;color:var(--c-text-2)">${n} · ${p} %</span></div>`;
      }).join('')}</details>`;
    },
    // ── Donuts interactifs : part des comptes ayant adresse + code postal, téléphone, e-mail, site web ──
    // Les filtres commercial / statut s'appliquent aux donuts ; un clic sur une part liste les comptes concernés (lien vers la fiche).
    DONUTS: [
      { k: 'adr',  lib: 'Adresse + CP', ok: c => !vide(c.Adresse) && !vide(c.Code_Postal) },
      { k: 'tel',  lib: 'Téléphone',    ok: c => !vide(c.Tel) },
      { k: 'mail', lib: 'E-mail',       ok: c => !vide(c.Email) },
      { k: 'web',  lib: 'Site web',     ok: c => !vide(c.Site_Web) },
    ],
    _arc(p, sel) {
      const R = 42, C = 2 * Math.PI * R, a = C * p / 100;
      return `<circle cx="55" cy="55" r="${R}" fill="none" stroke="${sel === 'no' ? '#FF6D68' : '#C9CED3'}" stroke-width="${sel === 'no' ? 14 : 12}" data-w="no" style="cursor:pointer"/>
        <circle cx="55" cy="55" r="${R}" fill="none" stroke="${sel === 'ok' ? '#FF6D68' : '#343F48'}" stroke-width="${sel === 'ok' ? 14 : 12}" stroke-dasharray="${a.toFixed(2)} ${(C - a).toFixed(2)}" transform="rotate(-90 55 55)" data-w="ok" style="cursor:pointer"/>`;
    },
    // Rubriques listables : les 4 donuts, chaque information du détail, et la fiche renseignée (clic sur la card).
    _defs() {
      return [...CO.DONUTS, ...CO.CHAMPS.map(x => ({ k: x.cle, lib: x.lib, ok: x.ok })),
              { k: 'fiche', lib: 'Fiche renseignée', ok: () => false, okx: x => x.st !== 'a_completer' }];
    },
    _okItem(d, x) { return d.okx ? d.okx(x) : d.ok(x.v); },
    // Clic sur une card ou une ligne de détail : ouvre directement la liste des comptes à compléter de la source cliquée.
    _ouvrir(src, cle) {
      const f = CO._filtre; f.src = src; f.sel = { k: cle || 'fiche', w: 'no' }; f.max = 10; CO._defile = true; CO._majSuivi();
    },
    _choisir(k, w) { const f = CO._filtre; f.sel = (f.sel && f.sel.k === k && f.sel.w === w) ? null : { k, w }; f.max = 10; CO._majSuivi(); },
    _source(s) { CO._filtre.src = s; CO._filtre.sel = null; CO._filtre.max = 10; CO._majSuivi(); },
    _donutsHtml(items) {
      const f = CO._filtre, T = f.src;
      const L = items, n = L.length;
      const cartes = CO.DONUTS.map(d => {
        const ok = L.filter(x => d.ok(x.v)).length, pc = n ? Math.round(ok / n * 100) : 0, sel = f.sel && f.sel.k === d.k ? f.sel.w : null;
        return `<div class="cs-jauge" style="text-align:center;padding:10px;margin:0"><svg viewBox="0 0 110 110" width="104" height="104" role="group" aria-label="${esc(d.lib)} : ${pc} % renseigné, ${ok} sur ${n}"
          onclick="var w=event.target.getAttribute('data-w');if(w)ContactsObjectif._choisir('${d.k}',w)">${CO._arc(pc, sel)}
          <text x="55" y="53" text-anchor="middle" font-size="20" font-weight="700" fill="currentColor" pointer-events="none">${pc} %</text>
          <text x="55" y="69" text-anchor="middle" font-size="11" fill="#888780" pointer-events="none">${ok}/${n}</text></svg>
          <div style="font-size:13px;font-weight:600">${esc(d.lib)}</div>
          <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;flex-wrap:wrap">
            <button class="cs-puce" aria-pressed="${sel === 'ok'}" onclick="ContactsObjectif._choisir('${d.k}','ok')" style="font-size:11px">${ok} renseignés</button>
            <button class="cs-puce" aria-pressed="${sel === 'no'}" onclick="ContactsObjectif._choisir('${d.k}','no')" style="font-size:11px">${n - ok} à compléter</button></div></div>`;
      }).join('');
      let liste = '<p style="font-size:12px;color:var(--c-text-2);margin:8px 0 0">Cliquez sur un donut ou sur « à compléter » pour lister les comptes concernés.</p>';
      if (f.sel) {
        const d = CO._defs().find(x => x.k === f.sel.k) || CO.DONUTS[0], S = L.filter(x => CO._okItem(d, x) === (f.sel.w === 'ok'));
        const lignes = S.slice(0, f.max).map(x => {
          const manque = CO.DONUTS.filter(y => !y.ok(x.v)).map(y => y.lib).join(', ');
          const corps = `<span><strong>${esc(x.nom)}</strong><span style="color:var(--c-text-2)"> · ${esc(x.com || 'n.c.')}${x.ville ? ' · ' + esc(x.ville) : ''}</span>${manque ? `<br><small style="color:var(--c-text-2)">Manque : ${esc(manque)}</small>` : ''}</span><span style="color:var(--c-text-2);white-space:nowrap">${x.id ? 'Ouvrir ›' : esc(x.sans || 'Sans fiche')}</span>`;
          return x.id ? `<button type="button" onclick="Router.aller('#/compte/${encodeURIComponent(x.id)}')" style="display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;border:0;background:var(--c-surface-2,rgba(52,63,72,.06));border-radius:10px;padding:8px 10px;margin-top:4px;font:inherit;font-size:13px;cursor:pointer">${corps}</button>`
                      : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border-radius:10px;padding:8px 10px;margin-top:4px;font-size:13px;background:var(--c-surface-2,rgba(52,63,72,.06))">${corps}</div>`;
        }).join('');
        liste = `<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:14px">${esc(d.lib)} · ${f.sel.w === 'ok' ? 'renseignés' : 'à compléter'} (${S.length})</strong>
          <button class="cs-puce" onclick="ContactsObjectif._filtre.sel=null;ContactsObjectif._majSuivi()">Fermer</button></div>${lignes || '<p style="font-size:13px;margin:8px 0 0">Aucun compte.</p>'}
          ${S.length > f.max ? `<button class="cs-puce" style="margin-top:8px" onclick="ContactsObjectif._filtre.max+=20;ContactsObjectif._majSuivi()">Voir ${Math.min(20, S.length - f.max)} de plus (${S.length - f.max} restants)</button>` : ''}</div>`;
      }
      const bouton = (k, lib) => `<button type="button" aria-pressed="${T === k}" onclick="ContactsObjectif._source('${k}')" style="border:0;padding:5px 12px;cursor:pointer;font:inherit;${T === k ? 'background:#343F48;color:#fff' : 'background:none;color:inherit'}">${lib}</button>`;
      const seg = `<div style="display:inline-flex;border:0.5px solid var(--c-border);border-radius:999px;overflow:hidden;font-size:13px" role="group" aria-label="Source des comptes">${bouton('T', 'Tracker')}${bouton('A', 'Autres comptes')}${bouton('B', 'Base')}</div>`;
      const titre = { T: 'leads du Tracker (pipeline kanban)', A: 'autres comptes croisés avec la base', B: 'base des comptes actifs' }[T];
      return `<section aria-label="Coordonnées renseignées" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <div class="bloc-titre" style="margin:0">Coordonnées renseignées · ${titre}</div>${seg}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">${cartes}</div>${liste}</section>`;
    },
    // Leads du kanban (Tracker) : mêmes exclusions que la vue Pipeline, pour retrouver le même nombre de leads.
    chargerLeads() {
      if (CO._leadsCharge || !window.SheetsAPI) return;
      CO._leadsCharge = true;
      const mgr = !!(window.Session && Session.estManager && Session.estManager());
      const nn = s => (window.normaliserNom ? window.normaliserNom(s) : String(s || '').toUpperCase());
      SheetsAPI.lire('EMPOWER_MDB', 'LEADS', { nocache: true }).then(raw => {
        const l = (Array.isArray(raw) ? raw : []).filter(p => { const src = String(p.Source_Import || '').toUpperCase(); return !src.includes('FLAVIE') && src !== 'BASE_PROSPECTS_RELANCER' && src !== 'ESI_VISITE_FROID'; })
          .filter(p => String(p.Flag_traite || '').toUpperCase() !== 'DELETED' && String(p.deleted || '').toUpperCase() !== 'TRUE')
          .filter(p => mgr || String(p.Flag_converti || '').toUpperCase() !== 'TRUE');
        const vus = new Set();
        CO._leads = l.filter(p => { const k = nn(p.Nom_Compte); if (vus.has(k)) return false; vus.add(k); return true; });
        CO._majSuivi();
      }).catch(() => { CO._leads = []; CO._majSuivi(); });
    },
    _suiviHtml() {
      const f = CO._filtre;
      const nn = s => (window.normaliserNom ? window.normaliserNom(s) : String(s || '').toUpperCase());
      const vivants = (CO._cs || []).filter(c => String(c.deleted || '').toUpperCase() !== 'TRUE');
      const base = CO._base || [], leads = CO._leads || [];
      const parId = {}, parNom = {};
      vivants.forEach(c => { if (c.ID_Compte) parId[String(c.ID_Compte)] = c; const k = nn(c.Nom_Compte); if (k && !parNom[k]) parNom[k] = c; });
      const stV = v => { const e = CO.etat(v); return e.complet ? 'complet' : e.contact ? 'renseigne' : 'a_completer'; };
      const pick = (a, b) => (!vide(a) ? a : b);
      // 1. Tracker = les leads du kanban ; les informations manquantes (et le site web) viennent du compte lié.
      const pris = new Set();
      const tItems = leads.map(l => {
        const cp = parId[String(l.ID_Compte_Gas || '')] || parNom[nn(l.Nom_Compte)] || null;
        if (cp) pris.add(cp);
        const v = { Contact_Nom: pick(l.CONTACT_NOM, cp && cp.Contact_Nom), Tel: pick(l.Tel, cp && cp.Tel), Email: pick(l.Email, cp && cp.Email), Adresse: pick(l.Adresse, cp && cp.Adresse),
                    Code_Postal: pick(l.Code_Postal, cp && cp.Code_Postal), Ville: pick(l.Ville, cp && cp.Ville), Site_Web: cp && cp.Site_Web };
        return { v, st: stV(v), nom: l.Nom_Compte, ville: v.Ville, com: CO._nomCom(l.PIN_CDS_Assigne), id: cp ? (cp.ID_Compte || cp._uuid) : null, sans: 'Lead sans compte' };
      });
      // 2. Autres comptes = comptes hors kanban, complétés par la ligne de la base des comptes actifs (rattachement par id puis par nom).
      const bParCompte = {}, bParNom = {};
      base.forEach(b => { if (b.compte_id) bParCompte[String(b.compte_id)] = b; const k = nn(b.nom); if (k && !bParNom[k]) bParNom[k] = b; });
      const aItems = vivants.filter(c => !pris.has(c)).map(c => {
        const b = bParCompte[String(c._uuid)] || bParNom[nn(c.Nom_Compte)] || null, bv = b ? CO._baseVersCompte(b) : {};
        const v = { Contact_Nom: pick(c.Contact_Nom, bv.Contact_Nom), Tel: pick(c.Tel, bv.Tel), Email: pick(c.Email, bv.Email), Adresse: pick(c.Adresse, bv.Adresse),
                    Code_Postal: pick(c.Code_Postal, bv.Code_Postal), Ville: pick(c.Ville, bv.Ville), Site_Web: pick(c.Site_Web, bv.Site_Web) };
        return { v, st: stV(v), nom: c.Nom_Compte, ville: v.Ville, com: CO._nomCom(c.PIN_CDS_Assigne), id: c.ID_Compte || c._uuid };
      });
      // 3. Base = le fichier des comptes actifs enrichis.
      const stB = b => { const e = CO.etat(CO._baseVersCompte(b)); return e.complet ? 'complet' : (b.statut || b.Statut) === 'ENRICHI' ? 'renseigne' : 'a_completer'; };
      const bItems = base.map(b => { const cp = b.compte_id && vivants.find(x => String(x._uuid) === String(b.compte_id));
        return { v: CO._baseVersCompte(b), st: stB(b), nom: b.nom, ville: b.ville, com: String(b.commercial || b.Commercial || '').toUpperCase(), id: cp ? (cp.ID_Compte || cp._uuid) : null, sans: 'Base seule' }; });
      const coms = Array.from(new Set([...tItems, ...aItems, ...bItems].map(x => x.com).filter(Boolean))).sort();
      // Les filtres « renseigné » et « complet » se cumulent : un compte complet est aussi renseigné.
      const garde = (st, filtre) => !filtre || st === filtre || (filtre === 'renseigne' && st === 'complet');
      // Profil : un CDS ne voit que ses comptes (et les comptes sans commercial) ; admin, channel manager et fournisseur voient tout.
      const cds = !!(window.Session && Session.estCDS && Session.estCDS()), moi = cds ? CO._nomCom(Session.pin) : '';
      const filtrer = (l, base) => l.filter(x => (cds ? (x.com === moi || (!base && !x.com)) : (!f.com || x.com === f.com)) && garde(x.st, f.statut));
      const tc = filtrer(tItems), ac = filtrer(aItems), bc = filtrer(bItems, true);
      const rens = l => l.filter(x => x.st !== 'a_completer').length;
      const cnt = (l, fn) => l.filter(fn).length;
      const det = (l, src) => CO._lignes([...CO.CHAMPS.map(x => [x.lib, cnt(l, y => x.ok(y.v)), x.cle]), ['Site web', cnt(l, y => !vide(y.v.Site_Web)), 'web']], l.length, src);
      const opt = (v, l, cur) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`;
      const barreFiltre = `<div class="suivi-filtres" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
        ${cds ? `<span style="font-size:12px;font-weight:600">Mes comptes${moi ? ' · ' + esc(moi.charAt(0) + moi.slice(1).toLowerCase()) : ''}</span>` : `<label style="font-size:12px;font-weight:600">Commercial <select aria-label="Filtrer par commercial" onchange="ContactsObjectif._filtre.com=this.value;ContactsObjectif._majSuivi()" style="margin-left:4px">
          ${opt('', 'Tous', f.com)}${coms.map(c => opt(c, c.charAt(0) + c.slice(1).toLowerCase(), f.com)).join('')}</select></label>`}
        <label style="font-size:12px;font-weight:600">Statut <select aria-label="Filtrer par statut" onchange="ContactsObjectif._filtre.statut=this.value;ContactsObjectif._majSuivi()" style="margin-left:4px">
          ${opt('', 'Tous', f.statut)}${opt('renseigne', 'Renseignés', f.statut)}${opt('a_completer', 'À compléter', f.statut)}${opt('complet', 'Fiches complètes', f.statut)}</select></label></div>`;
      const charge = t => `<section class="cs-jauge suivi-bloc"><div class="bloc-titre">${t}</div><p class="pilo-vide" style="font-size:13px">Chargement…</p></section>`;
      const blocT = CO._leads === null ? charge('Infos Tracker') : CO._bloc('Infos Tracker', 'Leads du pipeline kanban', rens(tc), tc.length, det(tc, 'T'), '#FF6D68', 'T');
      const blocA = (CO._leads === null || CO._base === null) ? charge('Autres comptes') : CO._bloc('Autres comptes', 'Hors kanban, croisés avec la base', rens(ac), ac.length, det(ac, 'A'), '#8A949E', 'A');
      const blocB = CO._base === null ? charge('Infos comptes Base') : CO._bloc('Infos comptes Base', 'Fichier des comptes actifs enrichis', rens(bc), bc.length, det(bc, 'B'), '#343F48', 'B');
      const cur = { T: tc, A: ac, B: bc }[f.src] || tc, pret = f.src === 'B' ? CO._base !== null : f.src === 'A' ? (CO._leads !== null && CO._base !== null) : CO._leads !== null;
      return barreFiltre + `<div class="cs-jauges">${blocT}${blocA}${blocB}</div>
        ${pret ? CO._donutsHtml(cur) : ''}
        <p style="font-size:12px;color:var(--c-text-2);margin:12px 0 0">Objectif 100 % au 31/12/2026 : ${CO.joursRestants()} jours restants.</p>`;
    },
    _majSuivi() {
      document.querySelectorAll('.suivi-rempl').forEach(el => { el.innerHTML = CO._suiviHtml(); });
      if (CO._defile) { CO._defile = false; const t = document.querySelector('.suivi-rempl section[aria-label="Coordonnées renseignées"]'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    },
    renderSuivi(comptes) {
      CO._cs = comptes || [];
      CO.chargerBase(); CO.chargerLeads();
      return `<div class="suivi-rempl">${CO._suiviHtml()}</div>`;
    },
    // Pastille de complétude d'une fiche (liste Comptes).
    pastille(c) {
      const e = CO.etat(c);
      const col = e.complet ? 'var(--c-success)' : e.contact ? 'var(--c-warning)' : 'var(--c-danger)';
      const t = e.complet ? 'Fiche complète' : 'À compléter : ' + e.manquants.join(', ');
      return `<span class="fiche-meter" title="${esc(t)}"><i style="width:${e.pct}%;background:${col}"></i></span>`;
    },
  };

  // ── 3. Paliers de revendeur (séminaire Impact) ─────────────────────────
  // CA Empower FY27 cumulé (proxy des 12 mois glissants : la donnée glissante et le nombre de commandes
  // ne sont pas dans la base). Seuils du séminaire : Éveil < 1 000 €, Actif ≥ 1 000 €, Ambassadeur ≥ 3 000 €.
  const SEUILS = { actif: 1000, ambassadeur: 3000 };
  const num = v => { const n = typeof window.parseCA === 'function' ? window.parseCA(v) : parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const PALIERS = {
    NA:          { cle: 'NA',          lib: 'Hors Empower', couleur: '#8A949E', action: 'Qualifier le potentiel Empower de ce revendeur.' },
    DORMANT:     { cle: 'DORMANT',     lib: 'Dormant',      couleur: '#8A949E', action: 'Relancer et envoyer le kit de démarrage.' },
    EVEIL:       { cle: 'EVEIL',       lib: 'Éveil',        couleur: '#C98A1B', action: 'Planifier une formation flash pour atteindre 1 000 €.' },
    ACTIF:       { cle: 'ACTIF',       lib: 'Actif',        couleur: '#2E7D5B', action: 'Surveiller le renouvellement et proposer une montée en gamme.' },
    AMBASSADEUR: { cle: 'AMBASSADEUR', lib: 'Ambassadeur',  couleur: '#343F48', action: 'Organiser une business review trimestrielle.' },
  };
  function caEmpower(c) { return ['CA_EMP_Q1FY27', 'CA_EMP_Q2FY27', 'CA_EMP_Q3FY27', 'CA_EMP_Q4FY27'].reduce((s, k) => s + num(c[k]), 0); }
  function palier(c) {
    if (!(window.estEmpower && window.estEmpower(c))) return PALIERS.NA;
    const ca = caEmpower(c);
    return ca >= SEUILS.ambassadeur ? PALIERS.AMBASSADEUR : ca >= SEUILS.actif ? PALIERS.ACTIF : ca > 0 ? PALIERS.EVEIL : PALIERS.DORMANT;
  }
  function badgePalier(c) {
    const p = palier(c); if (p.cle === 'NA') return '';
    return `<span class="palier-badge" style="--pc:${p.couleur}" title="Palier calculé sur le CA Empower FY27 cumulé">${p.lib}</span>`;
  }
  // Prochaine meilleure action : une règle lisible, jamais un score opaque.
  function prochaineAction(c) {
    const e = CO.etat(c);
    if (!e.contact) return { lib: 'Renseigner le contact', detail: 'Aucun nom, téléphone, e-mail ni adresse. Il manque : ' + e.manquants.join(', ') + '. Objectif de complétude au 31/12/2026.', cible: 'fiche' };
    const p = palier(c);
    return { lib: p.cle === 'NA' ? 'Qualifier' : p.lib, detail: p.action, cible: 'action' };
  }
  window.Paliers = { SEUILS, PALIERS, palier, badgePalier, caEmpower, prochaineAction };
})();
