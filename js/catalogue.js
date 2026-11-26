// ═══════════════════════════════════════
//  catalogue.js — Catalogue Norton et calcul de marge revendeur (Assistant commercial)
//  Sources : BOOK DU COMMERCIAL Empower et Grossiste (février 2026). PA = prix d'achat HT revendeur.
//  Règles : PVP HT = PVP TTC / 1,20 ; marge % = (PVP HT - PA) / PVP HT. Tout est calculé par le code,
//  jamais par un modèle de langage. Un produit sans prix d'achat sur un canal est exclu du calcul de ce canal
//  et signalé (jamais de prix inventé). Les incohérences des sources sont listées pour validation.
//  Ce module sert la page Coach, et servira aux générateurs PDF (proposition, bienvenue, exceptionnelle).
// ═══════════════════════════════════════
(function (root) {
  const DATA = {
   "version": "2026-02",
   "tva": 0.2,
   "produits": [
    {
     "id": "n360-std",
     "famille": "N360",
     "nom": "Norton 360 Standard",
     "appareils": 1,
     "pvp_ttc": 39.99,
     "pa_td": 25.0,
     "pa_ingram": 25.0,
     "pa_empower": 11.61,
     "sku_td": "21404856",
     "sku_ingram": "21404971",
     "sku_boite": "21409190"
    },
    {
     "id": "n360-del3",
     "famille": "N360",
     "nom": "Norton 360 Deluxe",
     "appareils": 3,
     "pvp_ttc": 49.99,
     "pa_td": 32.08,
     "pa_ingram": 32.08,
     "pa_empower": 15.11,
     "sku_td": "21404977",
     "sku_ingram": "21404910",
     "sku_boite": "21409191"
    },
    {
     "id": "n360-del5",
     "famille": "N360",
     "nom": "Norton 360 Deluxe",
     "appareils": 5,
     "pvp_ttc": 59.99,
     "pa_td": 33.33,
     "pa_ingram": 33.33,
     "pa_empower": 16.34,
     "sku_td": "21404968",
     "sku_ingram": "21404845",
     "sku_boite": "21409192"
    },
    {
     "id": "n360-prem10",
     "famille": "N360",
     "nom": "Norton 360 Premium",
     "appareils": 10,
     "pvp_ttc": 69.99,
     "pa_td": 37.5,
     "pa_ingram": 37.5,
     "pa_empower": 22.82,
     "sku_td": "21404987",
     "sku_ingram": "21404998",
     "sku_boite": "21409193"
    },
    {
     "id": "n360-gam3",
     "famille": "N360",
     "nom": "Norton 360 For Gamers",
     "appareils": 3,
     "pvp_ttc": 49.99,
     "pa_td": 32.25,
     "pa_ingram": 32.25,
     "pa_empower": 15.11,
     "sku_td": "21417152",
     "sku_ingram": "21416747",
     "sku_boite": "21416609"
    },
    {
     "id": "n360-adv10",
     "famille": "N360",
     "nom": "Norton 360 Advanced",
     "appareils": 10,
     "pvp_ttc": 59.99,
     "pa_td": 36.27,
     "pa_ingram": 36.27,
     "pa_empower": 25.1,
     "sku_td": "21444054",
     "sku_ingram": "21444054",
     "sku_boite": null
    },
    {
     "id": "n360-plat20",
     "famille": "N360",
     "nom": "Norton 360 Platinum",
     "appareils": 20,
     "pvp_ttc": 79.99,
     "pa_td": 52.08,
     "pa_ingram": 52.08,
     "pa_empower": null,
     "sku_td": "21444053",
     "sku_ingram": "21444053",
     "sku_boite": null
    },
    {
     "id": "nav-plus1",
     "famille": "AV",
     "nom": "Norton Antivirus Plus",
     "appareils": 1,
     "pvp_ttc": 29.99,
     "pa_td": null,
     "pa_ingram": null,
     "pa_empower": 14.55,
     "sku_td": null,
     "sku_ingram": null,
     "sku_boite": null
    },
    {
     "id": "nsb-6",
     "famille": "NSB",
     "nom": "Norton Small Business",
     "appareils": 6,
     "pvp_ttc": 99.99,
     "pa_td": 41.66,
     "pa_ingram": 41.66,
     "pa_empower": 17.86,
     "sku_td": "21453221",
     "sku_ingram": "21453842",
     "sku_boite": null
    },
    {
     "id": "nsb-10",
     "famille": "NSB",
     "nom": "Norton Small Business",
     "appareils": 10,
     "pvp_ttc": 139.99,
     "pa_td": 58.33,
     "pa_ingram": 58.33,
     "pa_empower": 29.79,
     "sku_td": "21453240",
     "sku_ingram": "21453846",
     "sku_boite": null
    },
    {
     "id": "nsb-20",
     "famille": "NSB",
     "nom": "Norton Small Business",
     "appareils": 20,
     "pvp_ttc": 199.99,
     "pa_td": 83.33,
     "pa_ingram": 83.33,
     "pa_empower": 53.61,
     "sku_td": "21453225",
     "sku_ingram": "21453844",
     "sku_boite": null
    },
    {
     "id": "nsbp-10",
     "famille": "NSB",
     "nom": "Norton Small Business Premium",
     "appareils": 10,
     "pvp_ttc": 199.99,
     "pa_td": 83.33,
     "pa_ingram": 83.33,
     "pa_empower": 62.9,
     "sku_td": "21453254",
     "sku_ingram": "21453850",
     "sku_boite": null
    },
    {
     "id": "nsbp-20",
     "famille": "NSB",
     "nom": "Norton Small Business Premium",
     "appareils": 20,
     "pvp_ttc": 299.99,
     "pa_td": 125.0,
     "pa_ingram": 125.0,
     "pa_empower": 95.33,
     "sku_td": "21453236",
     "sku_ingram": "21453851",
     "sku_boite": null
    },
    {
     "id": "vpn-plus5",
     "famille": "VPN",
     "nom": "Norton VPN Plus",
     "appareils": 5,
     "pvp_ttc": 29.99,
     "pa_td": null,
     "pa_ingram": null,
     "pa_empower": 17.05,
     "sku_td": null,
     "sku_ingram": null,
     "sku_boite": null
    },
    {
     "id": "vpn-std1",
     "famille": "VPN",
     "nom": "Norton VPN Standard",
     "appareils": 1,
     "pvp_ttc": 24.99,
     "pa_td": null,
     "pa_ingram": null,
     "pa_empower": 11.74,
     "sku_td": null,
     "sku_ingram": null,
     "sku_boite": null
    },
    {
     "id": "util-wl10",
     "famille": "UTIL",
     "nom": "Norton Utilities WL",
     "appareils": 10,
     "pvp_ttc": null,
     "pa_td": null,
     "pa_ingram": null,
     "pa_empower": 14.30,
     "sku_td": null,
     "sku_ingram": null,
     "sku_boite": null
    }
   ],
   "remise_volume": {
    "seuil": 10,
    "taux": 0.2,
    "note": "Offre volume -20 % sur le PA dès 10 licences, soumise à validation budget commercial"
   },
   "revenue_share": {
    "taux_max": 0.25,
    "annees": 3
   },
   "incoherences": [
    "Advanced 10 : PVP TTC 104,99 € dans le Book Grossiste, 59,99 € dans le Book Empower et la cotation Back2School. Décision du 5 nov. 2026 : 59,99 € retenu.",
    "Platinum 20 : PVP TTC 79,99 € chez Tech Data et 99,99 € chez Ingram dans le Book Grossiste ; 99,90 € dans la cotation Back2School. Décision du 5 nov. 2026 : 79,99 € retenu.",
    "Premium 10 : PVP TTC 69,99 € (Book) ou 69,90 € (cotation).",
    "Advanced et Platinum : mêmes SKU (21444054, 21444053) chez Tech Data et Ingram ; références boîte identiques chez les deux distributeurs.",
    "Portail Empower (relevé du 5 nov. 2026) : Premium 10 = 22,82 € ; Deluxe 5 = 16,34 € (corrigé, 16,24 € avant) ; Platinum 20 n'est pas vendu sur le portail Empower, donc pas de prix d'achat Empower.",
    "Norton VPN Plus 5 appareils (17,05 €, PVP 29,99 € TTC), Norton VPN Standard 1 appareil (11,74 €, PVP 24,99 € TTC, indiqués le 24 nov. 2026) et Utilities WL 10 appareils (14,30 €) : prix d'achat Empower relevés ; Utilities WL : PVP TTC et références grossiste non fournis. Ces produits restent hors calculateur tant que le PVP n'est pas saisi dans les Réglages.",
    "Prix d'achat grossiste « sans cotation » ; la cotation Back2School (jusqu'à -50 %) a pris fin le 30/09/2026, prix d'achat cotés non fournis."
   ]
  };

  let PRODUITS = DATA.produits;          // remplacé par les prix des Réglages (base) quand ils sont chargés
  let COTATIONS = [];                    // cotations des Réglages
  let SOURCE = 'defaut';                 // 'base' | 'defaut'
  const par = id => PRODUITS.find(p => p.id === id) || null;
  const pvpHT = p => p.pvp_ttc / (1 + DATA.tva);
  const arr2 = n => Math.round(n * 100) / 100;
  const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // ── Cotations : active si actif et debut <= jour <= fin ; ne joue que sur les canaux grossistes (td, ingram) ──
  function cotationsActives(date, canal) {
    const d = (date || aujourdhui()).slice(0, 10);
    return COTATIONS.filter(c => c.actif !== false && c.debut <= d && d <= c.fin && (!canal || (c.canaux || []).includes(canal)));
  }
  // Prix d'achat effectif d'un produit sur un canal ('pa_empower' | 'pa_td' | 'pa_ingram') à une date.
  // Prix coté explicite prioritaire, sinon remise en %, la cotation la plus basse l'emporte ; jamais de prix inventé.
  function paEffectif(p, canal, date) {
    const base = p[canal] == null ? null : Number(p[canal]);
    if (canal === 'pa_empower') return { pa: base, base, cotation: null };
    const c = canal.slice(3); let best = base, cot = null;
    cotationsActives(date, c).forEach(k => {
      const ex = k.prix && k.prix[p.id] != null ? Number(k.prix[p.id]) : null;
      const v = Number.isFinite(ex) && ex != null ? ex : (base != null && k.remise_pct ? base * (1 - Number(k.remise_pct) / 100) : null);
      if (v != null && (best == null || v < best)) { best = v; cot = k; }
    });
    return { pa: best, base, cotation: cot };
  }

  // lignes : [[idProduit, quantité], …] ; canal : 'pa_empower' | 'pa_td' | 'pa_ingram'
  // opts : { volume } offre -20 % dès 10 licences (désactivée par défaut, soumise à validation budget) ;
  //        { date } jour de référence des cotations ; { sansCotation } ignore les cotations ;
  //        { offre } offre commerciale Empower : { type: 'xy', achetees: 2, offertes: 1 } (2 achetées = 1 offerte, revendable) ou { type: 'remise', taux: 0.1 } (sur le PA).
  function calculer(lignes, canal, opts) {
    const o = opts || {};
    let ca = 0, cout = 0, licences = 0, coutSansPvp = 0; const manquants = [], detail = [], cotes = new Set(), sansPvp = [];
    (lignes || []).forEach(([id, q]) => {
      const qt = Math.max(0, Math.floor(Number(q) || 0)); const p = par(id);
      if (!p || !qt) return;
      const e = o.sansCotation ? { pa: p[canal] == null ? null : Number(p[canal]), cotation: null } : paEffectif(p, canal, o.date);
      let pa = e.pa;
      if (pa == null) { manquants.push(p.nom + ' ' + p.appareils); return; }
      if (p.pvp_ttc == null) {
        // Option tousProduits : un produit sans PVP (VPN) est chiffré en prix d'achat seulement ; ni marge ni CA inventés.
        if (!o.tousProduits) { manquants.push(p.nom + ' ' + p.appareils); return; }
        const offS = o.offre && o.offre.type ? o.offre : null;
        const paSans = offS && offS.type === 'remise' && Number(offS.taux) > 0 ? pa * (1 - Math.min(0.9, Number(offS.taux))) : pa;
        if (e.cotation) cotes.add(e.cotation.libelle);
        cout += qt * paSans; coutSansPvp += qt * paSans; licences += qt; sansPvp.push(p.nom + ' ' + p.appareils);
        detail.push({ id, nom: p.nom, appareils: p.appareils, qte: qt, offertes: 0, qte_vendue: qt, pvp_ttc: null, pvp_ht: null, pa: arr2(paSans), marge_unit: null, marge: null, cotation: e.cotation ? e.cotation.libelle : null, sans_pvp: true });
        return;
      }
      const off = o.offre && o.offre.type ? o.offre : null;
      if (off && off.type === 'remise' && Number(off.taux) > 0) pa = pa * (1 - Math.min(0.9, Number(off.taux)));
      else if (!off && o.volume && qt >= DATA.remise_volume.seuil) pa = pa * (1 - DATA.remise_volume.taux);
      const offertes = off && off.type === 'xy' && Number(off.achetees) > 0 && Number(off.offertes) > 0 ? Math.floor(qt / Math.floor(off.achetees)) * Math.floor(off.offertes) : 0;
      const ht = pvpHT(p);
      if (e.cotation) cotes.add(e.cotation.libelle);
      ca += (qt + offertes) * ht; cout += qt * pa; licences += qt + offertes;
      detail.push({ id, nom: p.nom, appareils: p.appareils, qte: qt, offertes, qte_vendue: qt + offertes, pvp_ttc: Number(p.pvp_ttc), pvp_ht: arr2(ht), pa: arr2(pa), marge_unit: arr2(ht - pa), marge: arr2((qt + offertes) * ht - qt * pa), cotation: e.cotation ? e.cotation.libelle : null });
    });
    // Offre « produit offert » : { type:'produit', par:2, produit:'util-wl10' | null, nom, pvp_ttc, appareils } : pour chaque `par` licences achetées, un produit offert (coût 0),
    // revendable à son PVP. Le PVP vient du catalogue, sinon de la saisie (jamais inventé : sans PVP, le produit offert est signalé et non chiffré).
    const offP = o.offre && o.offre.type === 'produit' ? o.offre : null;
    if (offP && Number(offP.par) > 0) {
      const p2 = offP.produit ? par(offP.produit) : null;
      const pvp = offP.pvp_ttc != null && Number(offP.pvp_ttc) > 0 ? Number(offP.pvp_ttc) : (p2 && p2.pvp_ttc != null ? Number(p2.pvp_ttc) : null);
      const nom = offP.nom || (p2 ? p2.nom : 'Produit offert'), k = Math.floor(licences / Math.floor(offP.par));
      if (k > 0 && pvp == null) manquants.push(nom + ' (offert, PVP non renseigné)');
      else if (k > 0) {
        const ht = pvp / (1 + DATA.tva);
        ca += k * ht; licences += k;
        detail.push({ id: offP.produit || 'offert', nom, appareils: offP.appareils || (p2 ? p2.appareils : 0), qte: 0, offertes: k, qte_vendue: k, pvp_ttc: pvp, pvp_ht: arr2(ht), pa: 0, marge_unit: arr2(ht), marge: arr2(k * ht), cotation: null, produit_offert: true });
      }
    }
    const margeBase = ca - (cout - coutSansPvp);
    return { ca: arr2(ca), cout: arr2(cout), marge: arr2(margeBase), pct: ca > 0 ? Math.round(margeBase / ca * 1000) / 10 : 0, licences, manquants, sansPvp, detail, cotations: [...cotes] };
  }

  // Même panier par Empower et par grossiste (canal 'pa_td' par défaut ou 'pa_ingram') ; gain = marge Empower - marge grossiste,
  // sur les seuls produits chiffrables des DEUX canaux. Une cotation active baisse le PA grossiste, donc le gain.
  function comparer(lignes, opts) {
    const o = opts || {}, cg = o.grossiste || 'pa_td';
    const communs = (lignes || []).filter(([id]) => { const p = par(id); return p && p.pa_empower != null && paEffectif(p, cg, o.date).pa != null; });
    // Option tousProduits : un produit sans prix grossiste reste chiffré au prix Empower ; seule la comparaison au grossiste l'écarte.
    const lignesEmp = o.tousProduits ? (lignes || []).filter(([id, q]) => { const p = par(id); return p && p.pa_empower != null; }) : communs;
    const emp = calculer(lignesEmp, 'pa_empower', o);
    const empCom = o.tousProduits ? calculer(communs, 'pa_empower', o) : emp;
    // Même nombre de licences revendues des deux côtés : les licences offertes Empower sont payées plein tarif chez le grossiste ; l'offre n'existe pas chez lui.
    const gro = calculer(empCom.detail.map(d => [d.id, d.qte_vendue]), cg, Object.assign({}, o, { offre: null, volume: false }));
    const exclus = (lignes || []).filter(([id, q]) => q > 0 && !lignesEmp.some(([i]) => i === id)).map(([id]) => { const p = par(id); return p ? p.nom + ' ' + p.appareils : id; });
    const sansGrossiste = lignesEmp.filter(([id, q]) => q > 0 && !communs.some(([i]) => i === id)).map(([id]) => { const p = par(id); return p ? p.nom + ' ' + p.appareils : id; });
    return { empower: emp, empowerComparable: empCom, grossiste: gro, gain: arr2(empCom.marge - gro.marge), exclus, sansGrossiste, cotations: gro.cotations };
  }

  // Charge les prix et cotations des Réglages (Supabase). En cas d'échec ou de table vide, le catalogue de février 2026 reste en vigueur.
  async function charger(sb) {
    if (!sb) return { source: SOURCE };
    try {
      const [p, c] = await Promise.all([
        sb.from('catalogue_produits').select('*').eq('actif', true).order('ordre'),
        sb.from('catalogue_cotations').select('*').order('debut', { ascending: false }),
      ]);
      if (p.error) throw p.error;
      if (p.data && p.data.length) {
        PRODUITS = p.data.map(r => ({ id: r.produit_id, famille: r.famille, nom: r.nom, appareils: r.appareils,
          pvp_ttc: r.pvp_ttc == null ? null : Number(r.pvp_ttc), pa_empower: r.pa_empower == null ? null : Number(r.pa_empower),
          pa_td: r.pa_td == null ? null : Number(r.pa_td), pa_ingram: r.pa_ingram == null ? null : Number(r.pa_ingram),
          sku_td: r.sku_td, sku_ingram: r.sku_ingram }));
        API.produits = PRODUITS; SOURCE = 'base';
      }
      COTATIONS = (!c.error && c.data) ? c.data.map(r => ({ id: r.id, libelle: r.libelle, canaux: r.canaux || [], debut: String(r.debut).slice(0, 10), fin: String(r.fin).slice(0, 10),
        remise_pct: r.remise_pct == null ? null : Number(r.remise_pct), prix: r.prix || {}, actif: r.actif !== false })) : [];
      API.cotations = COTATIONS;
    } catch (e) { /* repli : catalogue par défaut */ }
    return { source: SOURCE, cotations: COTATIONS.length };
  }
  // Pour les tests et le rechargement après une modification dans les Réglages.
  function definir(produits, cotations) { if (produits) { PRODUITS = produits; API.produits = produits; SOURCE = 'base'; } if (cotations) { COTATIONS = cotations; API.cotations = cotations; } }

  // Reste à acheter (CA Empower, c.-à-d. achat HT portail) pour atteindre un palier du séminaire.
  function resteAuPalier(achatEmpower, seuil) { return Math.max(0, arr2((seuil || 1000) - (achatEmpower || 0))); }

  // Produits proposables selon le canal (Empower : seulement ceux qui ont un PA Empower).
  function listeProduits(canal, avecSansPvp) { return PRODUITS.filter(p => (p.pvp_ttc != null || (avecSansPvp && p.pa_empower != null)) && (canal ? p[canal] != null : true)); }
  function libelle(p) { return p.nom.replace('Norton ', '') + ' · ' + p.appareils + ' appareil' + (p.appareils > 1 ? 's' : ''); }

  const API = { version: DATA.version, tva: DATA.tva, produits: PRODUITS, cotations: COTATIONS, remise_volume: DATA.remise_volume,
                revenue_share: DATA.revenue_share, incoherences: DATA.incoherences, par, pvpHT, paEffectif, cotationsActives, calculer, comparer,
                resteAuPalier, listeProduits, libelle, charger, definir, source: () => SOURCE };
  root.Catalogue = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
