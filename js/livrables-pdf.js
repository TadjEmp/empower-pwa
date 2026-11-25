// ═══════════════════════════════════════
//  livrables-pdf.js — Générateur de livrables commerciaux (PDF paysage A4, impression navigateur)
//  Six modèles, tous personnalisables (client, dates, produits, quantités, remise, produit offert, conditions) :
//    proposition commerciale · offre de bienvenue · offre exceptionnelle  (panier du Coach)
//    offres supplémentaires (2+1, produit offert, remise volume) · bundle (produit acheté + produit offert) · cotation distributeur.
//  Chiffres : exclusivement ceux de js/catalogue.js (prix des Réglages, cotations incluses). Jamais de prix inventé :
//  un prix absent est signalé « non chiffré », un PVP de produit offert absent du catalogue se saisit à la main.
//  Design : « version C » validé (bloc ardoise aux coins arrondis, logo Norton Empower, cartes blanches sans traits,
//  bouton signal réservé à l'échéance, bande ardoise pleine largeur avec Marvesting). Pas de tiret cadratin.
//  Visuels : photos des licences attendues dans img/produits/<id produit>.png ; à défaut, une pastille typographique.
//  Les textes saisis (client, contact, conditions) sont toujours échappés.
// ═══════════════════════════════════════
window.LivrablesPDF = (function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const e0 = n => Math.round(n).toLocaleString('fr-FR') + ' €';
  const e2 = n => (n == null || Number.isNaN(Number(n))) ? 'n.c.' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const n2 = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = n => String(n).replace('.', ',') + ' %';
  const pc1 = n => (Math.round(n * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const dLong = d => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${Number(s.slice(8, 10)) === 1 ? '1er' : Number(s.slice(8, 10))} ${MOIS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : ''; };
  const dCourt = d => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : ''; };
  const aujourdhui = () => new Date().toISOString().slice(0, 10);
  const CANAUX = { pa_empower: 'Empower', pa_td: 'Tech Data', pa_ingram: 'Ingram Micro' };

  const TYPES = {
    proposition:    { lib: 'Proposition commerciale', pref: 'PC', eyebrow: 'Proposition commerciale', titre: 'Votre <em>marge</em> sur Norton, produit par produit', offre: false, panier: true },
    bienvenue:      { lib: 'Offre de bienvenue',      pref: 'OB', eyebrow: 'Offre de bienvenue',      titre: 'Votre première commande <em>Norton Empower</em>', offre: true, panier: true },
    exceptionnelle: { lib: 'Offre exceptionnelle',    pref: 'OE', eyebrow: 'Offre exceptionnelle',    titre: 'Une offre <em>limitée</em> sur Norton', offre: true, panier: true },
    supplementaire: { lib: 'Offres supplémentaires',  pref: 'OS', eyebrow: 'Offres promotionnelles B2B', titre: 'Trois leviers pour <em>améliorer votre marge</em>', offre: false, panier: false },
    bundle:         { lib: 'Bundle produit offert',   pref: 'BD', eyebrow: 'Bundle', titre: 'Un produit <em>offert</em> avec chaque vente', offre: false, panier: false },
    offre21:        { lib: 'Offre 2+1', pref: 'O21', eyebrow: 'Offre 2+1', titre: '2 licences achetées, <em>1 offerte</em>', offre: true, panier: true },
    offre11:        { lib: 'Offre 1+1', pref: 'O11', eyebrow: 'Offre 1+1', titre: '1 licence achetée, <em>1 offerte</em>', offre: true, panier: true },
    cotation_empower: { lib: 'Cotation Empower', pref: 'CE', eyebrow: 'Opération Empower', titre: 'Cotation <em>dégressive</em> Norton Empower', offre: false, panier: false },
    plan_commercial: { lib: 'Plan commercial', pref: 'PL', eyebrow: 'Plan commercial', titre: 'Budget de <em>compensation</em> par trimestre', offre: false, panier: false },
    cotation:       { lib: 'Cotation distributeur',   pref: 'CT', eyebrow: 'Opération distributeur', titre: 'Cotation <em>exceptionnelle</em> sur Norton 360', offre: false, panier: false },
  };

  function offreLibelle(o) {
    if (!o || !o.type) return '';
    if (o.type === 'xy') return `${o.achetees} licence${o.achetees > 1 ? 's' : ''} achetée${o.achetees > 1 ? 's' : ''}, ${o.offertes} offerte${o.offertes > 1 ? 's' : ''}`;
    if (o.type === 'remise') return `${pc(Math.round(o.taux * 1000) / 10)} de remise sur votre prix d'achat`;
    if (o.type === 'produit') return `${o.par} licence${o.par > 1 ? 's' : ''} achetée${o.par > 1 ? 's' : ''}, 1 ${o.nom || 'produit'} offert`;
    return '';
  }

  // ── Calculs (testables sans DOM) ──────────────────────────────────────────────────
  // Panier (proposition, bienvenue, exceptionnelle).
  function calculer(cfg) {
    const C = window.Catalogue, t = TYPES[cfg.type] || TYPES.proposition;
    const lignes = (cfg.lignes || []).filter(([id, q]) => q > 0);
    const total = lignes.reduce((n, [, q]) => n + Math.max(0, Math.floor(Number(q) || 0)), 0);
    const pal = cfg.palier && Number(cfg.palier.seuil) > 0 ? { seuil: Math.floor(Number(cfg.palier.seuil)), total } : null;
    if (pal) { pal.atteint = total >= pal.seuil; pal.reste = Math.max(0, pal.seuil - total); }
    const offre = t.offre && cfg.offre && cfg.offre.type && (!pal || pal.atteint) ? cfg.offre : null;
    const cmp = C.comparer(lignes, { grossiste: cfg.grossiste || 'pa_td', offre, volume: !!cfg.volume, date: cfg.date, tousProduits: true });
    const e = cmp.empower, g = cmp.grossiste;
    return { type: t, offre, palier: pal, offreDemandee: !!(t.offre && cfg.offre && cfg.offre.type), cmp, e, g, gainPositif: cmp.gain > 0, reste: C.resteAuPalier((cfg.dejaCA || 0) + e.cout), grossisteNom: (cfg.grossiste === 'pa_ingram') ? 'Ingram' : 'Tech Data' };
  }

  const canalDe = cfg => (cfg.canal && CANAUX[cfg.canal]) ? cfg.canal : 'pa_td';
  const sansCot = cfg => ({ sansCotation: !cfg.avecCotation, date: cfg.date, tousProduits: true });
  const nomLong = p => p ? p.nom + ' ' + p.appareils + ' appareil' + (p.appareils > 1 ? 's' : '') : '';

  // Offres supplémentaires : A (X achetées + Y offertes), B (produit offert), C (remise sur le prix d'achat dès un seuil).
  function calculerSupp(cfg) {
    const C = window.Catalogue, p = cfg.params || {}, canal = canalDe(cfg), o = sansCot(cfg);
    const xa = Math.max(1, Math.floor(Number(p.achetees) || 2)), xo = Math.max(1, Math.floor(Number(p.offertes) || 1));
    const refA = C.par(p.refA || 'n360-del5'), refB = C.par(p.refB || 'n360-adv10');
    const qB = Math.max(1, Math.floor(Number(p.qteB) || 2));
    const taux = p.taux != null && Number(p.taux) > 0 ? Number(p.taux) : C.remise_volume.taux, seuil = Math.max(1, Math.floor(Number(p.seuil) || C.remise_volume.seuil));
    const res = { canal, canalNom: CANAUX[canal], refA, refB, xa, xo, qB, taux, seuil, manquants: [] };
    if (refA) {
      const std = C.calculer([[refA.id, xa]], canal, o), av = C.calculer([[refA.id, xa]], canal, Object.assign({ offre: { type: 'xy', achetees: xa, offertes: xo } }, o));
      if (av.detail.length) res.A = { std, av, paCoute: av.cout, licences: av.licences }; else res.manquants.push(nomLong(refA) + ' (prix d\'achat ' + CANAUX[canal] + ')');
    }
    const off = { type: 'produit', par: qB, produit: p.offertId || null, nom: p.offertNom || 'Norton Utilities Ultimate', pvp_ttc: p.offertPvp, appareils: p.offertAppareils || 10 };
    res.offert = off;
    if (refB) {
      const std = C.calculer([[refB.id, qB]], canal, o), av = C.calculer([[refB.id, qB]], canal, Object.assign({ offre: off }, o));
      if (av.detail.length) res.B = { std, av, offertOk: av.detail.some(d => d.produit_offert) }; else res.manquants.push(nomLong(refB) + ' (prix d\'achat ' + CANAUX[canal] + ')');
    }
    res.C = (p.volRefs || ['n360-del5', 'n360-prem10', 'n360-adv10', 'n360-plat20', 'nsb-10', 'nsb-20']).map(id => C.par(id)).filter(Boolean).map(pr => {
      const std = C.calculer([[pr.id, 1]], canal, o), rm = C.calculer([[pr.id, 1]], canal, Object.assign({ offre: { type: 'remise', taux } }, o));
      if (!std.detail.length) return null;
      const d = std.detail[0], r = rm.detail[0];
      return { p: pr, pa: d.pa, paRem: r.pa, eco: arr(d.pa - r.pa), pvp: d.pvp_ttc, pct: std.pct, pctRem: rm.pct, pts: Math.round((rm.pct - std.pct) * 10) / 10 };
    }).filter(Boolean);
    return res;
  }
  const arr = n => Math.round(n * 100) / 100;

  // Bundle : chaque opération = un produit acheté (×q) + un produit offert (revendable à son PVP).
  function calculerBundle(cfg) {
    const C = window.Catalogue, canal = canalDe(cfg), o = sansCot(cfg);
    const ops = (cfg.operations || []).map(op => {
      const pr = C.par(op.achete && op.achete[0]), q = Math.max(1, Math.floor(Number(op.achete && op.achete[1]) || 1));
      if (!pr) return null;
      const off = { type: 'produit', par: 1, produit: op.offert && op.offert.id || null, nom: op.offert && op.offert.nom || 'Produit offert', pvp_ttc: op.offert && op.offert.pvp_ttc, appareils: op.offert && op.offert.appareils };
      const std = C.calculer([[pr.id, q]], canal, o), av = C.calculer([[pr.id, q]], canal, Object.assign({ offre: off }, o));
      return { titre: op.titre || '', pr, q, off, std, av, ok: std.detail.length > 0, offertOk: av.detail.some(d => d.produit_offert), manquants: av.manquants };
    }).filter(Boolean);
    return { canal, canalNom: CANAUX[canal], ops };
  }

  // Cotation distributeur : prix coté explicite, sinon remise en % sur le prix d'achat. Jamais de prix inventé.
  function calculerCotation(cfg) {
    const C = window.Catalogue;
    let c = cfg.cotation || null;
    if (!c) { const a = C.cotationsActives(cfg.date || aujourdhui()); c = a && a[0] ? a[0] : null; }
    if (!c) return { cotation: null, grilles: [] };
    const canaux = (c.canaux && c.canaux.length ? c.canaux : ['td', 'ingram']).filter(x => x === 'td' || x === 'ingram' || x === 'empower');
    const paliers = (c.paliers || []).filter(x => Number(x.seuil) > 0 && Number(x.remise_pct) > 0).sort((a, b) => a.seuil - b.seuil);
    const filtre = cfg.produits && cfg.produits.length ? new Set(cfg.produits) : null;
    const grilles = canaux.map(cx => {
      const k = 'pa_' + cx;
      const lignes = C.produits.filter(p => (p.pvp_ttc != null || p[k] != null) && (!filtre || filtre.has(p.id))).map(p => {
        const base = p[k] == null ? null : Number(p[k]);
        const ex = c.prix && c.prix[p.id] != null ? Number(c.prix[p.id]) : null;
        if (paliers.length) {
          if (base == null) return null;
          const ht = p.pvp_ttc == null ? null : Number(p.pvp_ttc) / (1 + C.tva);
          const tiers = paliers.map(x => { const cp = arr(base * (1 - Number(x.remise_pct) / 100)); return { seuil: Number(x.seuil), remise: Number(x.remise_pct), cote: cp, brut: base * (1 - Number(x.remise_pct) / 100), marge: ht == null ? null : Math.round((ht - cp) / ht * 100), validation: !!x.validation }; });
          return { p, sku: p['sku_' + cx] || '', base, tiers, pvp: p.pvp_ttc == null ? null : Number(p.pvp_ttc) };
        }
        const cote = Number.isFinite(ex) && ex != null ? ex : (base != null && c.remise_pct ? base * (1 - Number(c.remise_pct) / 100) : null);
        if (base == null || cote == null) return null;
        return { p, sku: p['sku_' + cx] || '', base, cote: arr(cote), remise: Math.round((1 - cote / base) * 100), pvp: p.pvp_ttc == null ? null : Number(p.pvp_ttc) };
      }).filter(Boolean);
      return { canal: cx, nom: cx === 'td' ? 'Tech Data' : cx === 'empower' ? 'Empower' : 'Ingram Micro', lignes };
    }).filter(g => g.lignes.length);
    return { cotation: c, grilles, paliers, remiseMax: grilles.reduce((m, g) => g.lignes.reduce((m2, l) => Math.max(m2, l.tiers ? Math.max(...l.tiers.map(x => x.remise)) : l.remise), m), 0) };
  }

  // Plan commercial : budget de compensation d'une période, saisi à la main (volumes par gamme). Base = PA HT portail Empower du catalogue.
  // Compensation d'une ligne = (PA − PA spécial) × licences, PA spécial = PA × (1 − remise), arrondi au centime, comme dans les mandats.
  const DIV_PERIODE = { mois: 1, trimestre: 3, semestre: 6, an: 12 };
  function calculerPlan(cfg) {
    const C = window.Catalogue, pl = cfg.plan || {};
    const remise = Math.min(90, Math.max(1, Number(pl.remise) || 60)), repli = pl.repli ? Math.min(90, Math.max(1, Number(pl.repli))) : 0;
    const periode = DIV_PERIODE[pl.periode] ? pl.periode : 'trimestre', mois = DIV_PERIODE[periode];
    const comp = (pa, q, r) => (pa - arr(pa * (1 - r / 100))) * q;
    const lignes = [], manquants = [];
    (pl.lignes || []).forEach(([id, q]) => {
      const p = id ? C.par(id) : null, n = Math.max(0, Math.floor(Number(q) || 0));
      if (!p || !n) return;
      if (p.pa_empower == null) { manquants.push(p.nom.replace('Norton ', '') + ' ' + p.appareils + ' app.'); return; }
      const pa = Number(p.pa_empower);
      lignes.push({ p, q: n, pa, achats: pa * n, comp: comp(pa, n, remise), compRepli: repli ? comp(pa, n, repli) : null });
    });
    const sum = f => lignes.reduce((n, l) => n + (f(l) || 0), 0);
    const achats = sum(l => l.achats), budget = sum(l => l.comp), budgetRepli = repli ? sum(l => l.compRepli) : null;
    return { remise, repli, periode, mois, lignes, manquants, licences: sum(l => l.q), achats, budget, budgetRepli,
      parMois: budget / mois, achatsMois: achats / mois, cadence: pl.cadence || '1 commande par mois', point: pl.point || 'Tous les 2 mois', autre: pl.autre || '' };
  }

  // ── Mise en page ────────────────────────────────────────────────────────────────
  const CSS = (window.LIVRABLES_POLICE || '') + `
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#D5D9DC}
body{font-family:Montserrat,system-ui,-apple-system,"Segoe UI",sans-serif;color:#424242;font-size:11.5px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:297mm;height:210mm;margin:14px auto;background:#EEF0F1;position:relative;overflow:hidden;display:flex;flex-direction:column;break-after:page;page-break-after:always}
.page:last-of-type{break-after:auto;page-break-after:auto}
@media print{html,body{background:#fff}.page{margin:0}}
.head{background:#343F48;color:#fff;border-radius:0 0 46px 46px;padding:9mm 15mm 0;height:61mm;flex:none;position:relative}
.hrow{display:flex;align-items:center;gap:6mm}
.hrow img{height:30px}
.hrow .meta{margin-left:auto;text-align:right;font-size:10px;line-height:1.55;color:#C9D0D6}
.hrow .meta b{color:#fff;font-weight:700}
.eyebrow,.eb{font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6B7580}
.head .eyebrow{color:#FF8A85;margin-top:5.5mm}
h1{font-size:27px;line-height:1.17;font-weight:800;color:#fff;letter-spacing:-.01em;margin:4px 0 5px;max-width:200mm}
h1 em{font-style:normal;color:#FF8A85}
.head .sub{color:#C9D0D6;font-size:12px}.head .sub b{color:#fff}
.echeance{position:absolute;right:15mm;bottom:16mm;background:#FF1209;color:#fff;border-radius:999px;padding:8px 18px;font-size:11px;font-weight:700;letter-spacing:.01em}
.body{margin:-11mm 15mm 0;position:relative;flex:1;min-height:0;display:grid;gap:6mm;align-content:start}
.body.two{grid-template-columns:1.75fr 1fr}
.body.three{grid-template-columns:1fr 1fr 1.45fr}
.body.half{grid-template-columns:1fr 1fr}
.card{background:#fff;border-radius:22px;padding:15px 18px}
.lines{background:#fff;border-radius:22px;padding:13px 20px 15px}
.hd,.ln{display:grid;grid-template-columns:13mm 1fr 15mm 21mm 21mm 23mm;gap:9px;align-items:center}
.hd{padding:2px 0 8px;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#6B7580}.hd .p{grid-column:1/3}
.ln{padding:8px 0}.ln:nth-of-type(odd){background:#EEF0F1;margin-left:-10px;margin-right:-10px;padding-left:10px;padding-right:10px;border-radius:12px}
.compact .ln{padding:4px 0}
.nm b{display:block;color:#343F48;font-size:12px}.nm small{color:#6B7580;font-size:10px}
.r{text-align:right}.q{font-weight:700;color:#343F48}.q small.of{display:block;color:#FF6D68;font-weight:700;font-size:9.5px}
.pos{color:#343F48;font-weight:800}
.pk{width:13mm;height:13mm;border-radius:50%;background:#343F48;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-direction:column}
.pk img{width:100%;height:100%;object-fit:contain;background:#EEF0F1}.pk b,.pk i{display:none}
.pk.no img{display:none}.pk.no b{display:block;font-size:17px;line-height:1;color:#fff;font-weight:800}.pk.no i{display:block;font-style:normal;font-size:6.5px;color:#FF8A85;margin-top:2px}
.ribbon{display:flex;gap:10mm;margin-top:4mm;background:#fff;border-radius:22px;padding:11px 20px}.ribbon b{display:block;color:#343F48;font-size:13px;margin-top:1px}
.note{margin-top:8px;font-size:10px;color:#6B7580}
.col{display:flex;flex-direction:column;gap:3mm}.col .card,.col .cta{padding:10px 16px}
.k.main{background:#343F48;color:#fff;border-radius:22px;padding:12px 18px}.k.main .eb{color:#FF8A85}
.k big{display:block;font-size:29px;font-weight:800;letter-spacing:-.01em;margin-top:3px;color:#343F48;line-height:1.1}.k.main big{color:#fff}
.k small{display:block;color:#6B7580;font-size:10px;margin-top:3px}.k.main small{color:#C9D0D6}
.two2{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.two2 .k{background:#fff;border-radius:22px;padding:10px 16px}.two2 .k big{font-size:19px}
.cmpv{margin-top:5px;font-size:11.5px}.cmpv b{color:#343F48}
.bar{height:8px;border-radius:999px;background:#EEF0F1;overflow:hidden;margin:6px 0 4px}.bar i{display:block;height:100%;background:#343F48;border-radius:999px}
.sub{color:#6B7580;font-size:12px}.sub b{color:#343F48}
.cta{background:#fff;border-radius:22px;padding:13px 18px;font-size:11.5px}.cta b{color:#343F48}
.foot{margin-top:auto;flex:none;background:#343F48;color:#fff;height:25mm;padding:0 15mm;display:grid;grid-template-columns:auto 1fr 1.2fr;gap:9mm;align-items:center}
.foot img{height:30px}
.foot .ct b{font-size:12px;color:#fff;display:block}.foot .ct span{font-size:10px;color:#C9D0D6;display:block;line-height:1.45}
.foot .legal{font-size:8.3px;color:#B8C1C9;line-height:1.5}
.pill{display:inline-block;background:#FF8A85;border-radius:999px;padding:1px 10px;font-size:8.5px;font-weight:800;color:#343F48;margin-bottom:3px}
/* offres supplémentaires, bundle, cotation */
.oh{display:flex;align-items:baseline;gap:8px}.oh .tag{background:#343F48;color:#fff;border-radius:999px;padding:2px 11px;font-size:9.5px;font-weight:800;letter-spacing:.06em}
.card h2{font-size:15.5px;line-height:1.25;color:#343F48;font-weight:800;margin:7px 0 3px}
.card .why{font-size:10.5px;color:#6B7580;min-height:2.6em}
.eq{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin:9px 0}
.eq span{background:#EEF0F1;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:700;color:#343F48}.eq span.of{background:#FF8A85;color:#343F48}.eq i{font-style:normal;color:#6B7580;font-weight:800}
.big{background:#343F48;color:#fff;border-radius:18px;padding:11px 15px;margin-top:9px}.big .eb{color:#FF8A85}.big b{display:block;font-size:30px;font-weight:800;line-height:1.1;margin-top:1px}.big small{color:#C9D0D6;font-size:10px}
.mini{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:10.5px;margin-top:8px}.mini b{color:#343F48;text-align:right}.mini span{color:#6B7580}
table.t{width:100%;border-collapse:collapse;font-size:10.2px;margin-top:6px}
table.t th{font-size:8.3px;letter-spacing:.06em;text-transform:uppercase;color:#6B7580;font-weight:700;text-align:right;padding:2px 0 6px}table.t th:first-child,table.t td:first-child{text-align:left}
table.t td{padding:5px 0;text-align:right;color:#424242}table.t td:first-child{color:#343F48;font-weight:700}
table.t tbody tr:nth-child(odd) td{background:#EEF0F1}table.t tbody tr td:first-child{border-radius:10px 0 0 10px;padding-left:8px}table.t tbody tr td:last-child{border-radius:0 10px 10px 0;padding-right:8px}
table.t.pl{font-size:11.8px}table.t.pl td{padding:9px 0}table.t.pl th{font-size:9px;padding-bottom:8px}table.t.pl td small{font-size:9px}
table.t tr.tot td{background:#343F48!important;color:#fff;font-weight:800}table.t tr.tot td.g{color:#FF8A85}table.t td small{font-weight:600;color:#6B7580;font-size:8px}table.t td.g{color:#343F48;font-weight:800}table.t.dg{font-size:10px}table.t.dg td{padding:4.5px 0}table.t.dg td small{font-weight:600;color:#6B7580;font-size:8px}table.t.dg th{padding-bottom:4px}table.t.dg td{white-space:nowrap}table.t.dgc td small{display:none}
.sim{margin:2mm 15mm 2mm;background:#fff;border-radius:16px;padding:2mm 5mm;font-size:10px;color:#424242}.sim b{color:#343F48}.sim .eb{display:block;margin-bottom:1mm}
.cond{margin:5mm 15mm 0;font-size:10px;color:#6B7580;line-height:1.55}.cond b{color:#343F48}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:10px}.steps div{background:#EEF0F1;border-radius:16px;padding:9px 12px;font-size:10px;color:#424242;line-height:1.45}.steps b{display:block;color:#FF6D68;font-size:15px;font-weight:800}
/* couverture + pages détail */
.body.one{grid-template-columns:1fr}
.cover{background:#343F48;flex-direction:row;color:#fff}
.cover .cl{position:relative;z-index:2;width:46%;padding:13mm 15mm 12mm;display:flex;flex-direction:column}
.cover .cl>img.lg{height:30px;align-self:flex-start}
.cover .cl .eyebrow{color:#FF8A85;margin-top:17mm}
.cover h1{font-size:34px;line-height:1.14;margin:5mm 0 4mm;max-width:none}
.cover .sb{font-size:12.5px;color:#C9D0D6;line-height:1.55;max-width:105mm}.cover .sb b{color:#fff}
.cover .pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:8mm}.cover .pills span{border:1px solid #C9D0D6;border-radius:999px;padding:5px 15px;font-size:10.5px;font-weight:700;color:#fff}
.cover .who{margin-top:auto;font-size:10.5px;color:#C9D0D6;line-height:1.55}.cover .who b{color:#fff;display:block;font-size:11.5px}
.cover .mv{height:26px;margin-top:6mm;align-self:flex-start}
.cover .cr{position:absolute;right:0;top:0;bottom:0;width:54%;border-radius:46px 0 0 46px;overflow:hidden;background:#EEF0F1}
.cover .cr img{width:100%;height:100%;object-fit:cover;display:block}
.sim .eb+b{display:inline}
.bgt{background:#343F48;color:#fff;border-radius:22px;padding:15px 20px}.bgt .eb{color:#FF8A85}.bgt big{display:block;font-size:42px;font-weight:800;line-height:1.1;margin-top:3px}.bgt big small{font-size:15px;font-weight:700}.bgt p{color:#C9D0D6;font-size:11px;margin-top:6px;line-height:1.5}.bgt .chip{display:inline-block;background:#4B5761;border-radius:999px;padding:3px 12px;font-size:9.5px;font-weight:700;margin-top:8px;color:#fff}
.rythme{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}.rythme .card{padding:13px 15px}.rythme .card b{display:block;color:#FF6D68;font-size:16px;font-weight:800}.rythme .card span{display:block;color:#343F48;font-weight:700;font-size:11.5px;margin-top:2px}.rythme .card small{display:block;color:#6B7580;font-size:10px;margin-top:3px}
.vals .v{display:grid;grid-template-columns:9mm 1fr auto;gap:4mm;align-items:center;background:#fff;border-radius:16px;padding:8px 14px;margin-bottom:2.5mm;font-size:11px;color:#343F48}.vals .v i{font-style:normal;background:#FF6D68;color:#fff;border-radius:50%;width:8mm;height:8mm;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px}.vals .v em{font-style:normal;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#6B7580}
.remise{display:inline-block;background:#343F48;color:#FF8A85;border-radius:999px;padding:1px 8px;font-size:9px;font-weight:800}
`;

  // Visuels produits : img/produits/<id>.png. Les aperçus sont dans un cadre sans script (les « onerror » n'y tournent pas) :
  // on vérifie donc à l'avance quelles images existent, et seules celles-là sont insérées ; les autres reçoivent la pastille typographique.
  const IMAGES = new Set();
  function sonder() {
    if (typeof Image === 'undefined' || !window.Catalogue) return Promise.resolve();
    return Promise.all(window.Catalogue.produits.map(p => new Promise(ok => {
      if (IMAGES.has(p.id)) return ok();
      const im = new Image(); im.onload = () => { IMAGES.add(p.id); ok(); }; im.onerror = () => ok(); im.src = imgUrl(p.id);
    }))).then(() => IMAGES.size);
  }

  const logoUrl = f => { const base = (typeof document !== 'undefined' && document.baseURI) || ''; try { return new URL('img/' + f, base).href; } catch (x) { return 'img/' + f; } };
  const imgUrl = id => { const base = (typeof document !== 'undefined' && document.baseURI) || ''; try { return new URL('img/produits/' + encodeURIComponent(id) + '.png', base).href; } catch (x) { return 'img/produits/' + encodeURIComponent(id) + '.png'; } };

  // Gabarit commun : tête ardoise, contenu, bande basse.
  function page(cfg, t, num, o) {
    const C = window.Catalogue, em = cfg.emetteur || {}, cl = cfg.client || {};
    const dEmis = cfg.date || aujourdhui();
    const sous = cfg.sousTitre ? esc(cfg.sousTitre) : o.sous != null ? o.sous : `Préparée pour <b>${esc(cl.nom || 'votre société')}</b>${cl.contact ? ' · Contact : ' + esc(cl.contact) : ''}${cl.region ? ' · ' + esc(cl.region) : ''}`;
    const ech = o.echeance != null ? o.echeance : (cfg.validite ? `Valable jusqu'au ${dLong(cfg.validite)}` : '');
    return `<section class="page"><div class="head"><div class="hrow"><img src="${esc(logoUrl('norton-empower-reseller-dark.png'))}" alt="Norton Empower Reseller Program"/>
<div class="meta"><b>${esc(t.lib)}</b> n° ${esc(num)}<br>Établie le ${esc(dLong(dEmis))}</div></div>
<div class="eyebrow">${esc(o.eyebrow || t.eyebrow)}</div><h1>${o.forceTitre ? o.forceTitre : cfg.titre ? esc(cfg.titre) : (o.titre || t.titre)}</h1><div class="sub">${sous}</div>${ech ? `<div class="echeance">${esc(ech)}</div>` : ''}</div>
<div class="body ${o.cls || 'two'}">${o.contenu}</div>${o.apres || ''}
<div class="foot"><img src="${esc(logoUrl('marvesting-group-cream.png'))}" alt="Marvesting Group"/>
<div class="ct"><b>${esc(em.nom || '')}</b><span>${esc(em.role || 'Impact Sales Marketing / Norton Gen Digital')}</span><span>${esc([em.tel, em.mail].filter(Boolean).join(' · '))}</span></div>
<div class="legal"><span class="pill">${esc(o.pill || 'Prix indicatifs')}</span><br>${o.legal}${cfg.conditions ? ' ' + esc(cfg.conditions) : ''} Document commercial non contractuel.</div></div></section>`;
  }

  const legalBase = C => `Prix HT, catalogue ${esc(C.version)}. PVP HT = PVP TTC / 1,20. Marge = PVP HT moins prix d'achat. Les marges dépendent des prix de vente pratiqués.`;

  // Panier : proposition, bienvenue, exceptionnelle.
  function pagePanier(cfg, num) {
    const C = window.Catalogue, R = calculer(cfg), t = R.type, e = R.e, g = R.g, cmp = R.cmp;
    const compact = e.detail.length > 5 ? ' compact' : '';
    const lignesArr = e.detail.map(d => `<div class="ln">
        <span class="pk${IMAGES.has(d.id) ? '' : ' no'}">${IMAGES.has(d.id) ? `<img src="${esc(imgUrl(d.id))}" alt=""/>` : ''}<b>${d.appareils}</b><i>appareil${d.appareils > 1 ? 's' : ''}</i></span>
        <span class="nm"><b>${esc(d.nom)}</b><small>${d.appareils} appareil${d.appareils > 1 ? 's' : ''} · ${d.pvp_ttc == null ? 'PVP non communiqué' : 'PVP conseillé ' + e2(d.pvp_ttc) + ' TTC'}</small></span>
        <span class="r q">${d.qte}${d.offertes ? `<small class="of">+ ${d.offertes} offerte${d.offertes > 1 ? 's' : ''}</small>` : ''}</span>
        <span class="r">${e2(d.pa)}</span><span class="r">${d.marge == null ? 'n.c.' : d.qte_vendue ? e2(d.marge / d.qte_vendue) : ''}</span><span class="r pos">${e2(d.marge)}</span></div>`);
    const lignes = lignesArr.join('');
    const excl = cmp.exclus && cmp.exclus.length ? `<div class="note">Non chiffré, prix d'achat Empower non communiqué : ${esc(cmp.exclus.join(', '))}.</div>` : '';
    const sPvp = e.sansPvp && e.sansPvp.length ? `<div class="note">Prix d'achat chiffré, marge non calculée (PVP TTC non communiqué) : ${esc(e.sansPvp.join(', '))}.</div>` : '';
    const sGro = cmp.sansGrossiste && cmp.sansGrossiste.length ? `<div class="note">Comparaison grossiste non chiffrée (pas de prix grossiste) : ${esc(cmp.sansGrossiste.join(', '))}.</div>` : '';
    const manq = e.manquants && e.manquants.length ? `<div class="note">Non chiffré : ${esc(e.manquants.join(', '))}.</div>` : '';
    const palBloc = R.palier ? `<div class="note">${R.palier.atteint ? `Palier atteint : offre valable dès ${R.palier.seuil} licences commandées (${R.palier.total} commandées).` : `Offre valable dès ${R.palier.seuil} licences commandées : il en manque ${R.palier.reste} (${R.palier.total} commandées).`}</div>` : '';
    const offreBloc = (R.offre ? `<div class="ribbon"><div><span class="eb">L'offre</span><b>${esc(offreLibelle(R.offre))}</b></div>${cfg.validite ? `<div><span class="eb">Valable jusqu'au</span><b>${esc(dLong(cfg.validite))}</b></div>` : ''}</div>` : '') + palBloc;
    const cotes = cmp.cotations && cmp.cotations.length ? ` Une cotation est en cours chez ${esc(R.grossisteNom)} (${esc(cmp.cotations.join(', '))}) : elle est prise en compte.` : '';
    const rsTxt = `Revenue share jusqu'à <b>${Math.round(C.revenue_share.taux_max * 100)} %</b> sur les renouvellements pendant <b>${C.revenue_share.annees} ans</b>, selon les conditions du programme.`;
    const comparaison = R.gainPositif
      ? `<div class="card"><div class="eb">Même panier chez ${esc(R.grossisteNom)}</div><div class="cmpv">Marge de <b>${e0(g.marge)}</b> (${pc(g.pct)}), achat ${e0(g.cout)} HT${R.offre && R.offre.type === 'xy' ? ` pour ${g.licences} licences` : ''}.${cotes}</div><div class="bar"><i style="width:${Math.max(4, Math.min(100, Math.round(g.marge / ((cmp.empowerComparable || e).marge || 1) * 100)))}%"></i></div><div class="sub">Empower vous rapporte <b>${e0(cmp.gain)}</b> de plus sur ce panier.</div></div>`
      : `<div class="card"><div class="eb">Ce que vous gardez en plus</div><div class="cmpv">${rsTxt}</div></div>`;
    const rs = R.gainPositif ? `<div class="card"><div class="eb">Et ensuite</div><div class="cmpv">${rsTxt} Zéro stock, commande après encaissement.</div></div>` : '';
    const palier = `<div class="cta"><b>${R.reste > 0 ? 'Palier Actif à portée.' : 'Palier Actif atteint.'}</b> ${R.reste > 0 ? `Cette commande représente ${e0(e.cout)} d'achat : il vous reste ${e0(R.reste)} pour atteindre 1 000 € de chiffre d'affaires Empower.` : `Avec cette commande, vous dépassez 1 000 € de chiffre d'affaires Empower.`}</div>`;
    const kMain = `<div class="k main"><div class="eb">Votre marge sur cette commande</div><big>${e0(e.marge)}</big><small>Soit ${pc(e.pct)} du chiffre d'affaires HT de ${e0(e.ca)}</small></div>`;
    const kDeux = `<div class="two2"><div class="k"><div class="eb">Vous achetez</div><big>${e0(e.cout)}</big><small>HT, via le portail Empower</small></div><div class="k"><div class="eb">Vous revendez</div><big>${e0(e.ca)}</big><small>HT, ${e.licences} licence${e.licences > 1 ? 's' : ''}, prix conseillés</small></div></div>`;
    const legal = `Prix d'achat HT du portail Empower. ${legalBase(C)}${R.offre ? ' Offre soumise aux conditions du programme Empower en vigueur.' : ''}`;
    const entete = '<div class="hd"><span class="p">Produit</span><span class="r">Qté</span><span class="r">Achat HT</span><span class="r">Marge unit.</span><span class="r">Marge totale</span></div>';
    // Peu de lignes : une seule page. Beaucoup de lignes : une page de synthèse puis le détail réparti sur plusieurs pages (7 lignes par page).
    if (lignesArr.length <= 5) {
      const contenu = `<div><div class="lines${compact}">${entete}${lignes || '<div class="note">Aucun produit sélectionné.</div>'}</div>${offreBloc}${excl}${manq}${sPvp}${sGro}</div>
<div class="col">${kMain}${kDeux}${comparaison}${rs}${palier}</div>`;
      return page(cfg, t, num, { contenu, cls: 'two', legal });
    }
    const resume = page(cfg, t, num, { contenu: `<div class="col">${kMain}${kDeux}${palier}</div><div class="col">${comparaison}${rs}${offreBloc}${excl}${manq}${sPvp}${sGro}</div>`, cls: 'half', legal });
    const parPage = 7, nbP = Math.ceil(lignesArr.length / parPage);
    const detail = Array.from({ length: nbP }, (_, k) => page(cfg, t, num, {
      eyebrow: `Détail de la commande · page ${k + 1} sur ${nbP}`, forceTitre: `Vos <em>${lignesArr.length} références</em>, ligne par ligne`, echeance: '',
      sous: cfg.client && cfg.client.nom ? `Préparée pour <b>${esc(cfg.client.nom)}</b>` : '',
      contenu: `<div class="lines compact">${entete}${lignesArr.slice(k * parPage, (k + 1) * parPage).join('')}</div>`, cls: 'one', legal,
      apres: k === nbP - 1 ? `<div class="sim"><span class="eb">Total de la commande</span>${e.licences} licence${e.licences > 1 ? 's' : ''} · achat <b>${e0(e.cout)}</b> HT · marge <b>${e0(e.marge)}</b> (${pc(e.pct)})</div>` : '',
    })).join('');
    return resume + detail;
  }

  // Offres supplémentaires : trois cartes côte à côte (A, B, volume).
  function pageSupp(cfg, num) {
    const C = window.Catalogue, t = TYPES.supplementaire, S = calculerSupp(cfg), cn = S.canalNom;
    const nA = S.A, nB = S.B;
    const cardA = nA ? (() => { const d = nA.av.detail[0]; return `<div class="card"><div class="oh"><span class="tag">OFFRE A</span></div><h2>${S.xa} achetée${S.xa > 1 ? 's' : ''} + ${S.xo} offerte${S.xo > 1 ? 's' : ''}</h2><div class="why">Même référence, licence identique offerte.</div>
<div class="eq">${'<span>Achetée</span><i>+</i>'.repeat(S.xa).replace(/<i>\+<\/i>$/, '')}<i>+</i>${'<span class="of">Offerte 0 €</span>'.repeat(S.xo)}</div>
<div class="mini"><span>Revendues</span><b>${nA.licences} × ${e2(d.pvp_ttc)} TTC</b><span>Prix d'achat payé (${S.xa} seulement)</span><b>${e2(nA.av.cout)}</b></div>
<div class="big"><span class="eb">Marge effective</span><b>${pc1(nA.av.pct)}</b><small>contre ${pc1(nA.std.pct)} au tarif standard</small></div>
<div class="mini"><span>Exemple sur</span><b>${esc(nomLong(S.refA))}</b></div></div>`; })() : `<div class="card"><div class="oh"><span class="tag">OFFRE A</span></div><div class="note">Non chiffré : ${esc(S.manquants.join(', '))}.</div></div>`;
    const cardB = nB ? `<div class="card"><div class="oh"><span class="tag">OFFRE B</span></div><h2>${S.qB} × ${esc(S.refB.nom.replace('Norton ', ''))} + ${esc(S.offert.nom.replace('Norton ', ''))} offert</h2><div class="why">Un produit complémentaire offert pour chaque lot acheté.</div>
<div class="eq">${('<span>' + esc(S.refB.nom.replace('Norton ', '')) + '</span>').repeat(1)}<i>×${S.qB}</i><i>+</i><span class="of">${esc(S.offert.nom.replace('Norton ', ''))} offert 0 €</span></div>
<div class="mini"><span>Prix d'achat payé</span><b>${e2(nB.av.cout)}</b><span>Revendu</span><b>${nB.av.licences} produits, ${e2(nB.av.ca)} HT</b></div>
${nB.offertOk ? `<div class="big"><span class="eb">Marge effective sur le bundle</span><b>${pc1(nB.av.pct)}</b><small>contre ${pc1(nB.std.pct)} au tarif standard</small></div>` : `<div class="note">Produit offert non chiffré : PVP à renseigner.</div>`}
<div class="mini"><span>Exemple sur</span><b>${esc(nomLong(S.refB))}</b></div></div>` : `<div class="card"><div class="oh"><span class="tag">OFFRE B</span></div><div class="note">Non chiffré : ${esc(S.manquants.join(', '))}.</div></div>`;
    const rowsC = S.C.map(r => `<tr><td>${esc(r.p.nom.replace('Norton ', '').replace('Small Business', 'Small Business') + ' ' + r.p.appareils + ' app.')}</td><td>${n2(r.pa)}</td><td>${n2(r.paRem)}</td><td>${n2(r.pvp)}</td><td>${pc1(r.pct)}</td><td class="g">${pc1(r.pctRem)}</td></tr>`).join('');
    const cardC = `<div class="card"><div class="oh"><span class="tag">OFFRE VOLUME</span></div><h2>-${Math.round(S.taux * 100)} % sur le prix d'achat</h2><div class="why">À partir de ${S.seuil} licences commandées, toutes références confondues.</div>
<table class="t"><thead><tr><th>Référence</th><th>PA std €</th><th>PA -${Math.round(S.taux * 100)} % €</th><th>PVP TTC €</th><th>Marge std</th><th>Marge remisée</th></tr></thead><tbody>${rowsC || '<tr><td colspan="6">Non chiffré</td></tr>'}</tbody></table></div>`;
    const cond = `<div class="cond"><b>Conditions de l'offre :</b> commande minimum de ${S.seuil} licences (références mixtes acceptées) | PA réduit de -${Math.round(S.taux * 100)} % sur devis, soumis à validation budget commercial.</div>`;
    return page(cfg, t, num, { contenu: cardA + cardB + cardC, cls: 'three', apres: cond, pill: 'Tarifs PA indicatifs', legal: `Prix d'achat ${esc(cn)}${cfg.avecCotation ? ' cotation incluse' : ' sans cotation'}. ${legalBase(C)} Offre soumise à validation budget commercial.` });
  }

  // Bundle : une carte par opération.
  function pageBundle(cfg, num) {
    const C = window.Catalogue, t = TYPES.bundle, B = calculerBundle(cfg);
    const dates = cfg.debut && cfg.validite ? `Du ${dLong(cfg.debut)} au ${dLong(cfg.validite)}` : '';
    const cartes = B.ops.map((op, i) => {
      if (!op.ok) return `<div class="card"><div class="oh"><span class="tag">OPÉRATION ${i + 1}</span></div><div class="note">Non chiffré : prix d'achat ${esc(B.canalNom)} non renseigné pour ${esc(nomLong(op.pr))}.</div></div>`;
      const d = op.std.detail[0];
      const of = op.av.detail.find(x => x.produit_offert);
      return `<div class="card"><div class="oh"><span class="tag">OPÉRATION ${i + 1}</span></div><h2>${esc(op.titre || (op.pr.nom + ' ' + op.pr.appareils + ' appareils + ' + op.off.nom + ' offert'))}</h2>
<div class="eq"><span>${op.q > 1 ? op.q + ' × ' : ''}${esc(op.pr.nom.replace('Norton ', ''))} ${op.pr.appareils} app.</span><i>+</i><span class="of">${esc(op.off.nom.replace('Norton ', ''))} offert 0 €</span></div>
<div class="mini"><span>Prix d'achat ${esc(B.canalNom)}</span><b>${e2(d.pa)} HT</b><span>PVP conseillé ${esc(op.pr.nom.replace('Norton ', ''))}</span><b>${e2(d.pvp_ttc)} TTC</b>${of ? `<span>Valeur du produit offert</span><b>${e2(of.pvp_ttc)} TTC</b>` : ''}</div>
${of ? `<div class="big"><span class="eb">Votre marge avec l'offre</span><b>${e2(op.av.marge)}</b><small>${pc1(op.av.pct)} du CA HT, contre ${e2(op.std.marge)} (${pc1(op.std.pct)}) sans l'offre</small></div>` : `<div class="big"><span class="eb">Votre marge sur l'achat</span><b>${e2(op.std.marge)}</b><small>${pc1(op.std.pct)} du CA HT · produit offert non chiffré, PVP à renseigner</small></div>`}
<div class="steps"><div><b>1</b>Vous proposez le bundle à votre client.</div><div><b>2</b>Le produit offert est associé à la vente.</div><div><b>3</b>Activation via le portail Empower.</div></div></div>`;
    });
    const legalB = `Prix d'achat ${esc(B.canalNom)}. ${legalBase(C)} Opération encadrée par un contrat mandat établi avec Impact Sales Marketing. Détails et modalités communiqués par votre Chef de Secteur.`;
    // Deux opérations par page au maximum.
    const nbP = Math.max(1, Math.ceil(cartes.length / 2));
    return Array.from({ length: nbP }, (_, k) => {
      const lot = cartes.slice(k * 2, k * 2 + 2);
      return page(cfg, t, num, { eyebrow: 'Bundle' + (dates ? ' · ' + dates : '') + (nbP > 1 ? ` · page ${k + 1} sur ${nbP}` : ''), contenu: lot.join('') || '<div class="card"><div class="note">Aucune opération renseignée.</div></div>', cls: lot.length > 1 ? 'half' : 'two', legal: legalB });
    }).join('');
  }

  // Cotation : une grille par distributeur.
  function pageCotation(cfg, num) {
    const C = window.Catalogue, t = TYPES[cfg.type] || TYPES.cotation, K = calculerCotation(cfg), c = K.cotation;
    if (!c) return page(cfg, t, num, { contenu: '<div class="card"><div class="note">Aucune cotation renseignée : saisissez les dates et la remise, ou ajoutez-la dans les Réglages.</div></div>', cls: 'two', legal: legalBase(C) });
    const noms = K.grilles.map(g => g.nom).join(' et ');
    const valid = K.paliers.some(x => x.validation);
    const carte = g => g.lignes[0] && g.lignes[0].tiers ? `<div class="card"><div class="oh"><span class="tag">${esc(g.nom.toUpperCase())}</span></div><h2>Prix d'achat dégressifs selon le volume commandé</h2>
<table class="t dg${K.grilles.length > 1 ? ' dgc' : ''}"><thead><tr><th>Produit</th><th>SKU</th><th>App.</th><th>PA habituel</th>${K.paliers.map(x => `<th>Dès ${x.seuil} lic.<br>-${Number(x.remise_pct)} %${x.validation ? '<br><small>sous réserve de validation</small>' : ''}</th>`).join('')}<th>PVP TTC</th></tr></thead><tbody>${g.lignes.map(l => `<tr><td>${esc(l.p.nom.replace('Norton ', ''))}</td><td>${esc(l.sku)}</td><td>${l.p.appareils}</td><td>${e2(l.base)}</td>${l.tiers.map(x => `<td class="g">${e2(x.cote)}${x.marge == null ? '' : ' <small>' + x.marge + ' %</small>'}</td>`).join('')}<td>${e2(l.pvp)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card"><div class="oh"><span class="tag">${esc(g.nom.toUpperCase())}</span></div><h2>Prix d'achat cotés, revendeurs non managés</h2>
<table class="t"><thead><tr><th>Produit</th><th>SKU</th><th>App.</th><th>PA habituel</th><th>PA coté</th><th>Remise</th><th>PVP TTC</th></tr></thead><tbody>${g.lignes.map(l => `<tr><td>${esc(l.p.nom.replace('Norton ', ''))}</td><td>${esc(l.sku)}</td><td>${l.p.appareils}</td><td>${e2(l.base)}</td><td class="g">${e2(l.cote)}</td><td><span class="remise">-${l.remise} %</span></td><td>${e2(l.pvp)}</td></tr>`).join('')}</tbody></table></div>`;
    let apres = '';
    const SIM = cfg.simulation && cfg.simulation.lignes && cfg.simulation.lignes.length ? cfg.simulation : null;
    if (SIM && K.grilles[0] && K.paliers.length) {
      const g0 = K.grilles[0], qTot = SIM.lignes.reduce((n, [, q]) => n + Math.max(0, Math.floor(Number(q) || 0)), 0);
      let idx = Number.isInteger(SIM.palier) ? SIM.palier : -1;
      if (!Number.isInteger(SIM.palier)) K.paliers.forEach((x, i) => { if (qTot >= x.seuil) idx = i; });
      const pal = idx >= 0 ? K.paliers[idx] : null;
      const rows = SIM.lignes.map(([id, q]) => { const l = g0.lignes.find(x => x.p.id === id); if (!l || !l.tiers) return null; const brut = pal ? l.tiers[idx].brut : l.base; return { l, q: Math.floor(Number(q) || 0), brut }; }).filter(Boolean);
      const tot = rows.reduce((n, r) => n + r.brut * r.q, 0);
      const horsGrille = SIM.lignes.filter(([id]) => !rows.some(r => r.l.p.id === id)).map(([id]) => { const p = C.par(id); return p ? p.nom.replace('Norton ', '') + ' ' + p.appareils + ' app.' : id; });
      apres = `<div class="sim"><span class="eb">Commande type · ${esc(g0.nom)}</span>${qTot} licence${qTot > 1 ? 's' : ''} commandée${qTot > 1 ? 's' : ''} : ${pal ? `palier <b>-${Number(pal.remise_pct)} %</b> (dès ${pal.seuil} licences)${pal.validation ? ' <b>sous réserve de validation</b>' : ''}` : 'aucun palier atteint, prix d\'achat habituel'}.
<table class="t dg"><thead><tr><th>Produit</th><th>Qté</th><th>PA habituel</th><th>PA appliqué</th><th>Total HT</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.l.p.nom.replace('Norton ', ''))} ${r.l.p.appareils} app.</td><td>${r.q}</td><td>${e2(r.l.base)}</td><td class="g">${e2(arr(r.brut))}</td><td>${e2(r.brut * r.q)}</td></tr>`).join('')}<tr><td><b>Total commande</b></td><td><b>${qTot}</b></td><td></td><td></td><td class="g"><b>${e2(tot)}</b></td></tr></tbody></table>${horsGrille.length ? `<div class="note">Non chiffré (pas de prix ${esc(g0.nom)}) : ${esc(horsGrille.join(', '))}.</div>` : ''}</div>`;
    }
    const echeance = c.debut && c.fin ? `Du ${dLong(c.debut)} au ${dLong(c.fin)}` : '';
    const opts = { titre: `${esc(c.libelle || 'Cotation')} <em>jusqu'à -${K.remiseMax} %</em>`, sous: `${esc(noms)} · revendeurs non managés${c.non_reconductible ? ' · opération non reconductible' : ''}${(cfg.client && (cfg.client.nom || cfg.client.contact)) ? ' · Préparée pour <b>' + esc(cfg.client.nom || 'votre société') + '</b>' + (cfg.client.contact ? ' · Contact : ' + esc(cfg.client.contact) : '') + (cfg.client.region ? ' · ' + esc(cfg.client.region) : '') : ''}`, echeance,
      cls: K.grilles.length > 1 ? 'half' : 'one', pill: 'Prix indicatifs', legal: `Prix d'achat HT ${esc(noms)} pendant la période de cotation. ${legalBase(C)}${valid ? ' Palier signalé « sous réserve de validation » : remise soumise à validation budget commercial.' : ''} Activation immédiate via clé ESD, sans stock à gérer.` };
    // Grille longue : réparties sur plusieurs pages (lignes aérées), la commande type sur la dernière.
    const dgMode = !!(K.grilles[0].lignes[0] && K.grilles[0].lignes[0].tiers);
    const maxPage = dgMode ? (K.grilles.length > 1 ? 9 : 10) : 9;
    const nbP = Math.max(1, ...K.grilles.map(g => Math.ceil(g.lignes.length / maxPage)));
    const parPage = Math.max(1, ...K.grilles.map(g => Math.ceil(g.lignes.length / nbP)));   // pages équilibrées
    return Array.from({ length: nbP }, (_, k) => {
      const cartes = K.grilles.map(g => { const l = g.lignes.slice(k * parPage, (k + 1) * parPage); return l.length ? carte(Object.assign({}, g, { lignes: l })) : ''; }).join('');
      const dernier = k === nbP - 1;
      return page(cfg, t, num, Object.assign({}, opts, { contenu: cartes, apres: dernier ? apres : '', eyebrow: nbP > 1 ? `${t.eyebrow} · page ${k + 1} sur ${nbP}` : undefined, echeance: opts.echeance }));
    }).join('');
  }

  // ── Couverture (tous les documents) ──
  const COUV_IMG = { cotation: 'small-business.jpg', cotation_empower: 'small-business.jpg', offre21: 'poignee-de-main.jpg', offre11: 'poignee-de-main.jpg', bundle: 'poignee-de-main.jpg', plan_commercial: 'equipe.jpg' };
  function pillsDe(cfg) {
    try {
      if (cfg.type === 'plan_commercial') { const P = calculerPlan(cfg); return P.lignes.length ? [`${P.licences} licences`, `${P.lignes.length} gamme${P.lignes.length > 1 ? 's' : ''}`] : []; }
      if (cfg.type === 'cotation' || cfg.type === 'cotation_empower') { const K = calculerCotation(cfg); return K.cotation && K.paliers.length ? [`Jusqu'à -${K.remiseMax} %`, `${K.paliers.length} paliers`] : []; }
      if (cfg.type === 'bundle') { const B = calculerBundle(cfg); return B.ops.length ? [`${B.ops.length} opération${B.ops.length > 1 ? 's' : ''}`] : []; }
      if (cfg.panier !== false && TYPES[cfg.type] && TYPES[cfg.type].panier) { const R = calculer(cfg); return R.e.licences ? [`${R.e.licences} licences`, ...(R.offre ? [offreLibelle(R.offre)] : [])] : []; }
    } catch (x) { /* couverture sans pastilles */ }
    return [];
  }
  function couverture(cfg, t, num) {
    const em = cfg.emetteur || {}, cl = cfg.client || {}, c = cfg.cotation || {};
    const periode = c.debut && c.fin ? `Du ${dLong(c.debut)} au ${dLong(c.fin)}` : cfg.validite ? `Valable jusqu'au ${dLong(cfg.validite)}` : '';
    const sous = cfg.sousTitre ? esc(cfg.sousTitre) : [cl.nom ? `Préparée pour <b>${esc(cl.nom)}</b>${cl.contact ? ' · ' + esc(cl.contact) : ''}` : '', esc(periode)].filter(Boolean).join('<br>');
    const pills = pillsDe(cfg).map(x => `<span>${esc(x)}</span>`).join('');
    const img = COUV_IMG[cfg.type] || 'equipe.jpg';
    return `<section class="page cover"><div class="cl"><img class="lg" src="${esc(logoUrl('norton-empower-reseller-dark.png'))}" alt="Norton Empower Reseller Program"/>
<div class="eyebrow">${esc([cl.nom, t.eyebrow].filter(Boolean).join(', '))}</div><h1>${cfg.titre ? esc(cfg.titre) : t.titre}</h1>${sous ? `<div class="sb">${sous}</div>` : ''}${pills ? `<div class="pills">${pills}</div>` : ''}
<div class="who"><b>${esc(em.nom || 'Impact Sales & Marketing')}</b>${esc(em.role || 'Impact Sales Marketing / Norton Gen Digital')}<br>${esc([em.tel, em.mail].filter(Boolean).join(' · '))}<br>${esc(t.lib)} n° ${esc(num)} · ${esc(dLong(cfg.date || aujourdhui()))}</div>
<img class="mv" src="${esc(logoUrl('marvesting-group-cream.png'))}" alt="Marvesting Group"/></div>
<div class="cr"><img src="${esc(logoUrl('couvertures/' + img))}" alt=""/></div></section>`;
  }

  // ── Plan commercial ──
  function pagesPlan(cfg, num) {
    const C = window.Catalogue, t = TYPES.plan_commercial, P = calculerPlan(cfg), cl = cfg.client || {};
    const nom = cl.nom ? esc(cl.nom) : 'votre société', pLib = P.periode, bud = e0(P.budget);
    const legal = `Prix d'achat HT du portail Empower, catalogue ${esc(C.version)}. Compensation = écart entre le PA HT portail et le PA spécial à -${P.remise} %, multiplié par les licences. Budget prévisionnel soumis à validation.`;
    const sousC = cl.nom ? `Préparée pour <b>${nom}</b>` : '';
    if (!P.lignes.length) return page(cfg, t, num, { contenu: '<div class="card"><div class="note">Aucune gamme renseignée : choisissez des produits et des volumes.</div></div>', cls: 'two', legal });
    const nbP = Math.ceil(P.lignes.length / 10), par = Math.ceil(P.lignes.length / nbP);   // 10 lignes par page au plus, pages équilibrées
    const ligneT = l => `<tr><td>${esc(l.p.nom.replace('Norton ', ''))} <small>${l.p.appareils} app.</small></td><td>${l.q}</td><td>${e2(l.pa)}</td><td>${e2(l.achats)}</td><td class="g">${e2(l.comp)}</td>${P.repli ? `<td>${e2(l.compRepli)}</td>` : ''}</tr>`;
    const entete = `<thead><tr><th>Gamme</th><th>Licences</th><th>PA portail HT</th><th>Achats HT</th><th>Compensation -${P.remise} %</th>${P.repli ? `<th>Option -${P.repli} %</th>` : ''}</tr></thead>`;
    const total = `<tr class="tot"><td>Total des ${P.lignes.length} gamme${P.lignes.length > 1 ? 's' : ''}</td><td>${P.licences}</td><td></td><td>${e2(P.achats)}</td><td class="g">${e2(P.budget)}</td>${P.repli ? `<td>${e2(P.budgetRepli)}</td>` : ''}</tr>`;
    const carteBudget = `<div class="bgt"><div class="eb">Budget ${pLib === 'mois' ? 'mensuel' : pLib === 'an' ? 'annuel' : pLib === 'semestre' ? 'semestriel' : 'trimestriel'} proposé</div><big>${bud.replace(' €', '')} <small>€ HT</small></big>
<p>Base de cotation à -${P.remise} % du PA HT portail${P.mois > 1 ? `, soit environ ${e0(P.parMois)} HT par mois` : ''}.</p>${P.repli ? `<span class="chip">Repli à -${P.repli} % : ${e0(P.budgetRepli)} HT</span>` : ''}</div>`;
    const tables = Array.from({ length: nbP }, (_, k) => {
      const l = P.lignes.slice(k * par, (k + 1) * par), dernier = k === nbP - 1;
      const tb = `<div class="card"><div class="oh"><span class="tag">BUDGET PAR GAMME</span></div><table class="t pl">${entete}<tbody>${l.map(ligneT).join('')}${dernier ? total : ''}</tbody></table>${dernier && P.manquants.length ? `<div class="note">Non chiffré, prix d'achat Empower non communiqué : ${esc(P.manquants.join(', '))}.</div>` : ''}</div>`;
      return page(cfg, t, num, { eyebrow: nbP > 1 ? `Budget de compensation · page ${k + 1} sur ${nbP}` : 'Budget de compensation', forceTitre: `Un budget de <em>${bud} HT</em> à -${P.remise} % sur ${P.lignes.length} gamme${P.lignes.length > 1 ? 's' : ''}`, sous: sousC, echeance: '',
        contenu: dernier && nbP === 1 ? tb + carteBudget : tb, cls: dernier && nbP === 1 ? 'two' : 'one', pill: 'Budget prévisionnel', legal });
    }).join('');
    const etapes = [['M1', 'Grosse commande', 'mandat du mois'], ['M2', 'Grosse commande', 'point avec Norton'], ['M3', 'Grosse commande', 'bilan de la période'], ['M4', 'Point suivant', 'révision du budget']];
    const rythme = page(cfg, t, num, { eyebrow: 'Pilotage', forceTitre: `Un point avec Norton, <em>${esc(P.point.toLowerCase())}</em>`, sous: sousC, echeance: '', cls: 'one', pill: 'Budget prévisionnel', legal,
      contenu: `<div class="rythme">${etapes.map(([m, a, b]) => `<div class="card"><b>${m}</b><span>${a}</span><small>${b}</small></div>`).join('')}</div>
<div class="body half" style="margin:0"><div class="card"><div class="eb">Cadence</div><h2>${esc(P.cadence)}</h2><div class="why">Point ${esc(P.point.toLowerCase())} avec Norton sur les commandes, les activations et la compensation versée.</div></div>
<div class="card"><div class="eb">Indicateurs suivis</div><div class="why">Licences par gamme, taux d'activation, compensation versée contre budget.</div></div></div>` });
    const pts = [[`Base de compensation à -${P.remise} % du PA HT portail, versée en HT`, 'Décision'], [`Budget ${pLib} de ${bud} HT et répartition par gamme`, 'Décision'], [`Point ${P.point.toLowerCase()} sur commandes, activations et compensation`, 'Cadence']];
    if (P.autre) pts.push([esc(P.autre), 'Support']);
    const valid = page(cfg, t, num, { eyebrow: 'Validations', forceTitre: `${pts.length} points à valider pour un budget de <em>${bud} HT</em>`, sous: sousC, echeance: '', cls: 'two', pill: 'Budget prévisionnel', legal,
      contenu: `<div class="vals">${pts.map(([x, k], i) => `<div class="v"><i>${i + 1}</i><span>${x.replace(/^(.*)$/, '$1')}</span><em>${k}</em></div>`).join('')}</div>${carteBudget}` });
    return tables + rythme + valid;
  }

  function html(cfg) {
    const t = TYPES[cfg.type] || TYPES.proposition;
    const num = cfg.numero || `${t.pref}-${aujourdhui().replace(/-/g, '')}`;
    const couv = cfg.couverture === false ? '' : couverture(cfg, t, num);
    const corps = couv + (cfg.type === 'plan_commercial' ? pagesPlan(cfg, num) : '') + (cfg.type === 'plan_commercial' ? '' : cfg.type === 'supplementaire' ? pageSupp(cfg, num) : cfg.type === 'bundle' ? pageBundle(cfg, num) : (cfg.type === 'cotation' || cfg.type === 'cotation_empower') ? pageCotation(cfg, num) : pagePanier(cfg, num));
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(t.lib)} ${esc(num)}</title><style>${CSS}</style></head><body>${corps}</body></html>`;
  }

  // Affiche le livrable dans la visionneuse de l'application (bouton Fermer toujours visible) ; « Imprimer / PDF » ouvre l'impression
  // (choisir « Enregistrer au format PDF », orientation paysage déjà réglée). Aucune nouvelle fenêtre : rien dont on ne puisse sortir.
  function ouvrir(cfg) {
    if (!window.Visionneuse) { if (window.Toast) Toast.afficher('Visionneuse indisponible, rechargez la page', 'erreur'); return false; }
    const t = TYPES[cfg.type] || TYPES.proposition;
    sonder().then(() => Visionneuse.html(html(cfg), { titre: t.lib + (cfg.client && cfg.client.nom ? ' · ' + cfg.client.nom : '') }));
    return true;
  }

  return { sonder, visuels: IMAGES, TYPES, CANAUX, offreLibelle, calculer, calculerSupp, calculerBundle, calculerCotation, calculerPlan, html, ouvrir };
})();
