/* Export Reporting : gabarit Marvesting V3 (couverture photo, sommaire, chapitres, cartes).
   Deux rendus alimentés par le même objet de données : PDF (A4 paysage, HTML imprimé) et PPTX (16:9, pptxgenjs).
   Structure intelligente : le sommaire apparaît dès 3 chapitres, les pages de chapitre dès 4 chapitres.
   Interdits : traits droits, tirets longs, soulignements (contrôle automatique dans vue-analyse.js). */
(function () {
  const V = window.VueAnalyse; if (!V) return;
  const IMG = () => location.origin + '/img/rapport/';
  const META = {
    Visites: { img: 'equipe', pic: 'magasin' }, 'Sell-in': { img: 'kpi', pic: 'etiquette_prix' }, Atteinte: { img: 'kpi', pic: 'bouclier_valide' },
    Portefeuille: { img: 'carte', pic: 'localisation' }, 'Synthèse': { img: 'equipe', pic: 'relance' },
  };
  const NOM_BLOC = { visites: 'Visites', sellin: 'Sell-in', atteinte: 'Atteinte', portefeuille: 'Portefeuille' };

  Object.assign(V, {
    // Structure des pages selon ce qui est affiché : sommaire dès 3 chapitres, pages de chapitre dès 4
    _structure(D, slides) {
      const chap = [];
      slides.forEach(s => { let c = chap.find(x => x.nom === s.bloc); if (!c) { c = { nom: s.bloc, slides: [] }; chap.push(c); } c.slides.push(s); });
      const sommaire = chap.length >= 3, diviseurs = chap.length >= 4, pages = [{ t: 'cover' }];
      if (sommaire) pages.push({ t: 'sommaire' });
      chap.forEach((c, i) => { if (diviseurs) pages.push({ t: 'chapitre', n: i + 1, c }); c.slides.forEach(s => pages.push({ t: 'contenu', n: i + 1, s, c })); });
      pages.forEach((p, i) => { p.num = i + 1; });
      chap.forEach((c, i) => { c.n = i + 1; c.page = pages.find(p => p.c === c).num; c.sub = c.slides[0].concl; });
      return { pages, chap, sommaire, diviseurs };
    },
    _pagesRapport() {
      const r = this._x(), noms = this.BLOCS.filter(b => r.blocs.includes(b[0])).map(b => NOM_BLOC[b[0]]).concat('Synthèse'), out = ['Couverture'];
      if (noms.length >= 3) out.push('Sommaire');
      noms.forEach(n => { if (noms.length >= 4) out.push('Chapitre : ' + n); out.push(n); });
      return out;
    },
    _pills(nom, D) {
      const f = n => this._fmt(n), s = this._s.bind(this), A = D.atteinte, Pf = D.portefeuille, Y = D.synthese, S = D.sellin, Vi = D.visites;
      if (nom === 'Visites') return [`${Vi.n} visite${s(Vi.n, '', 's')}`, `${Vi.comptes} compte${s(Vi.comptes, '', 's')}`];
      if (nom === 'Sell-in') return [`${f(S.total)} €`, `${D.qs.length} quarters`];
      if (nom === 'Atteinte') return [`${A.pct} % de l'objectif`, `${A.ok} sur ${A.lignes.length} à 100 %`];
      if (nom === 'Portefeuille') return [`${Pf.total} comptes`, `${Pf.deps} départements`];
      return [`${Y.act} activé${s(Y.act, '', 's')}`, `${Y.non} à relancer`];
    },

    // ───────────── PDF : A4 paysage, mm et pt ─────────────
    _htmlRapport(D, slides) {
      const C = this.CH, e = t => this._esc(this._san(t)), f = n => this._fmt(n), I = IMG(), S = this._structure(D, slides), total = S.pages.length;
      const pal = ['#' + C.ardoise, '#' + C.rouge, '#' + C.corail, '#' + C.moyen];
      const band = (titre, sub, cap, badge) => `<header class="bd">${badge ? `<span class="bn">${badge}</span>` : ''}<div class="bt"><h2>${e(titre)}</h2><p>${e(sub)}</p></div>${cap ? `<span class="cap">${e(cap)}</span>` : ''}</header>`;
      const foot = n => `<footer><span>${e(D.auteur)} · Norton × ISM · FY27</span><span class="fr"><img src="${I}norton_prog.png" alt="Norton Empower Reseller Program"><b>${n} / ${total}</b></span></footer>`;
      const ligne = (cols, cells, cls = '') => `<div class="rw ${cls}" style="--c:${cols}">${cells.map((t, i) => `<span class="${this._numCell(t, i)}">${e(t)}</span>`).join('')}</div>`;
      const tabCard = (eb, tete, lignes, cols) => `<div class="card grow"><p class="eb">${e(eb)}</p>${ligne(cols, tete, 'rh')}${lignes.map(l => ligne(cols, l)).join('')}</div>`;
      const corps = (d, D) => {
        if (d.kind === 'visites') {
          const Vi = D.visites;
          const photos = Vi.photos.length ? `<div class="ph3">${Vi.photos.map(p => `<figure><img src="${this._esc(p.u)}" alt="Photo de visite" onerror="this.parentNode.style.display='none'"><figcaption>${e(p.c || 'Visite terrain')}</figcaption></figure>`).join('')}</div>` : '';
          return `<div class="row"><div class="card dark" style="width:62mm"><p class="eb c">Visites terrain</p><div class="hero">${Vi.n}</div><p class="lb">visite${this._s(Vi.n, '', 's')} sur la période</p><p class="st">${Vi.comptes} compte${this._s(Vi.comptes, '', 's')} rencontré${this._s(Vi.comptes, '', 's')}</p><p class="st">${Vi.commerciaux} commercia${Vi.commerciaux > 1 ? 'ux' : 'l'} actif${Vi.commerciaux > 1 ? 's' : ''}</p></div>
            <div class="col grow">${Vi.lignes.length ? tabCard('Dernières visites', ['Date', 'Commercial', 'Compte', 'Type'], Vi.lignes, '24mm 30mm 1fr 30mm') : '<div class="card grow"><p class="eb">Dernières visites</p><p>Aucune visite enregistrée sur la période.</p></div>'}${photos}</div></div>`;
        }
        if (d.kind === 'sellin') {
          const Sl = D.sellin, mx = Math.max(1, ...Sl.parQ), best = Sl.parQ.indexOf(Math.max(...Sl.parQ));
          return `<div class="row"><div class="col" style="width:112mm"><div class="card dark" style="height:34mm"><p class="eb c">CA réalisé, FY27</p><div class="hero m">${f(Sl.total)} €</div></div>
            <div class="card grow"><p class="eb">Par quarter</p><div class="bars">${Sl.parQ.map((v, i) => `<div class="b"><em>${f(v)}</em><i style="height:${Math.max(1.6, v / mx * 62)}mm;background:${i === best && Sl.total ? '#' + C.rouge : '#' + C.ardoise}"></i><span>${D.qs[i]}</span></div>`).join('')}</div></div></div>
            ${tabCard('Par commercial', ['Commercial', ...D.qs, 'Total'], Sl.parCom.slice(0, 6).map(x => [x.nom, ...x.q.map(f), f(x.tot)]), '1fr 14mm 14mm 14mm 14mm 17mm')}</div>`;
        }
        if (d.kind === 'top') {
          const mx = Math.max(1, ...D.sellin.top.map(x => x.ca));
          return `<div class="card" style="height:100%"><p class="eb">Comptes ayant commandé</p>${D.sellin.top.map((x, k) => `<div class="tp"><span class="ci" style="background:${k === 0 ? '#' + C.rouge : '#' + C.ardoise}">${k + 1}</span><div class="nm"><b>${e(x.compte)}</b><small>${e(x.com)}</small></div><div class="tr"><i style="width:${Math.max(3, x.ca / mx * 100)}%"></i></div><strong>${f(x.ca)} €</strong></div>`).join('')}</div>`;
        }
        if (d.kind === 'atteinte') {
          return `<div class="card" style="height:100%"><p class="eb">Atteinte de l'objectif ${e(D.quarter)}</p>${d.lignes.length ? d.lignes.map((x, k) => `<div class="at"><span class="ci" style="background:${pal[k % 4]}">${e(this._init(x.nom))}</span><div class="nm"><b>${e(x.nom)}</b><small>${f(x.ca)} € sur ${f(x.obj)} €</small></div><div class="tr w"><i style="width:${Math.max(3, Math.min(100, x.pct))}%;background:${x.pct < 80 ? '#' + C.corail : '#' + C.ardoise}"></i></div><strong>${x.pct} %</strong></div>`).join('') : '<p>Aucun objectif pour ce trimestre.</p>'}</div>`;
        }
        if (d.kind === 'portefeuille') {
          const Pf = D.portefeuille; let a = 0;
          const seg = Pf.canaux.map(([, n], i) => { const p = n / (Pf.total || 1) * 100, s = `${pal[i % 4]} ${a}% ${a + p}%`; a += p; return s; }).join(',');
          return `<div class="row"><div class="card" style="width:96mm;align-items:center;justify-content:center"><p class="eb" style="align-self:flex-start">Comptes par canal</p><div class="ring" style="background:conic-gradient(${seg || '#' + C.clair + ' 0 100%'})"><span>${Pf.total}</span></div><ul class="lg">${Pf.canaux.map(([k, n], i) => `<li><i style="background:${pal[i % 4]}"></i>${e(k)} <b>${n}</b></li>`).join('')}</ul></div>
            <div class="col grow"><div class="card dark" style="height:38mm"><p class="eb c">Couverture</p><div class="hero m">${Pf.deps} <small>sur 96 départements</small></div></div>
            <div class="card grow"><p class="eb">Pipeline par statut</p><div class="pl">${Pf.leads.slice(0, 6).map(([k, n]) => `<span><b>${n}</b>${e(this._statut(k))}</span>`).join('') || '<p>Aucun lead dans le pipeline.</p>'}</div></div></div></div>`;
        }
        return d.lignes.map((l, k) => `<div class="card sy"><span class="ci big" style="background:${k === 1 ? '#' + C.rouge : '#' + C.ardoise}">${k + 1}</span><p>${e(l)}</p></div>`).join('');
      };
      const cover = `<section class="pg cv"><img class="ph" src="${I}cover_a4.png" alt=""><img class="lgn" src="${I}norton_blanc.png" alt="Norton"><div class="tx"><p class="ey">Reporting commercial · Norton Empower</p><h1>Reporting<br>commercial</h1><p class="sub">${e(D.periode)}</p><div class="pills"><span>Périmètre ${e(D.perimetre)}</span><span>${e(D.date)}</span></div></div><p class="sg">${e(D.auteur)}</p><img class="ag" src="${I}marvesting.png" alt="Marvesting"></section>`;
      const sommaire = S.sommaire ? `<section class="pg">${band('Sommaire', `${S.chap.length} chapitres, ${total} pages`, '', '')}<div class="body">${S.chap.map(c => `<div class="card so"><span class="ci big" style="background:#${C.rouge}">${c.n}</span><div class="nm"><b>${e(c.nom)}</b><small>${e(c.sub)}</small></div><span class="pg-n">p. ${c.page}</span></div>`).join('')}</div>${foot(2)}</section>` : '';
      const pages = S.pages.slice(S.sommaire ? 2 : 1).map(p => {
        if (p.t === 'chapitre') {
          const m = META[p.c.nom] || META.Visites, pic = m.img === 'carte' ? `<div class="ph cart"><img src="${I}carte_france.png" alt=""></div>` : `<img class="ph" src="${I}chap_${m.img}_a4.png" alt="">`;
          return `<section class="pg cv ch">${pic}<div class="tx"><span class="ci big" style="background:#${C.rouge}">${String(p.n).padStart(2, '0')}</span><h1>${e(p.c.nom)}</h1><p class="sub">${e(p.c.sub)}</p><div class="pills">${this._pills(p.c.nom, D).map(t => `<span>${e(t)}</span>`).join('')}</div></div></section>`;
        }
        const d = p.s;
        return `<section class="pg">${band(d.titre, d.concl, d.capsule, p.n)}<div class="body">${corps(d, D)}</div>${foot(p.num)}</section>`;
      });
      const css = `@page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0}body{font-family:'Montserrat','Segoe UI',system-ui,sans-serif;color:#${C.texte};line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      p,h1,h2,ul,figure{margin:0}.pg{width:297mm;height:210mm;page-break-after:always;break-after:page;position:relative;overflow:hidden;background:#fff}.grow{flex:1;min-width:0}
      .bd{display:flex;align-items:center;gap:6mm;height:28mm;padding:0 14mm;background:#${C.ardoise} url(${I}texture.png) center bottom/100% 100% no-repeat;color:#fff}.bt{flex:1;min-width:0}.bd h2{font-size:21pt;font-weight:700;line-height:1.15}.bd p{margin-top:1.5mm;font-size:11pt;font-weight:700;color:#${C.corail};line-height:1.25}
      .bn{display:flex;align-items:center;justify-content:center;flex:none;width:12mm;height:12mm;border-radius:3.6mm;background:#${C.rouge};font-weight:800;font-size:16pt;transform:rotate(-8deg)}.cap{flex:none;background:#fff;color:#${C.ardoise};border-radius:99px;padding:2.6mm 6mm;font-weight:700;font-size:12pt}
      .body{position:absolute;left:14mm;right:14mm;top:36mm;bottom:21mm;display:flex;flex-direction:column;gap:5mm}.row{display:flex;gap:5mm;height:100%}.col{display:flex;flex-direction:column;gap:5mm;min-width:0}
      .pg>footer{position:absolute;left:14mm;right:14mm;bottom:7mm;display:flex;align-items:center;justify-content:space-between;font-size:8pt;color:#${C.texte}}.fr{display:flex;align-items:center;gap:5mm}.fr img{height:5.5mm;width:auto}.fr b{font-weight:700}
      .card{display:flex;flex-direction:column;background:#${C.clair};border-radius:6mm;padding:6mm}.card.dark{background:#${C.ardoise};color:#fff}.eb{font-size:7.5pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#${C.rouge};margin-bottom:3.5mm}.eb.c{color:#${C.corail}}
      .hero{font-size:44pt;font-weight:800;line-height:1.05;color:#${C.corail}}.hero.m{font-size:32pt}.hero small{font-size:11pt;font-weight:600;color:#fff}.lb{margin-top:2mm;font-size:11pt;font-weight:600}.st{margin-top:2.5mm;font-size:10pt}.dark .st{color:#fff}
      .rw{display:grid;grid-template-columns:var(--c);gap:3mm;align-items:center;background:#fff;border-radius:4mm;padding:2.3mm 4mm;margin-bottom:1.6mm;font-size:9.5pt;line-height:1.25}.rw.rh{background:transparent;font-size:7.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding-top:0;padding-bottom:1mm}.rw .r{text-align:right}.card>.rw:not(.rh){flex:1;max-height:13mm}
      .ph3{display:flex;gap:5mm}.ph3 figure{position:relative;flex:1;height:44mm;border-radius:5mm;overflow:hidden;background:#${C.clair}}.ph3 img{width:100%;height:100%;object-fit:cover;display:block}.ph3 figcaption{position:absolute;left:0;right:0;bottom:0;padding:5mm 4mm 2.5mm;background:linear-gradient(transparent,rgba(0,0,0,.62));color:#fff;font-size:8pt;font-weight:700}
      .bars{display:flex;align-items:flex-end;justify-content:space-around;flex:1;padding-top:2mm}.b{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:21mm;font-size:9.5pt}.b i{display:block;width:13mm;border-radius:6.5mm}.b em{font-style:normal;font-weight:700;margin-bottom:1.6mm}.b span{margin-top:2mm;font-weight:600}
      .ci{display:flex;align-items:center;justify-content:center;flex:none;width:11mm;height:11mm;border-radius:50%;color:#fff;font-weight:700;font-size:10pt}.ci.big{width:14mm;height:14mm;font-size:14pt}
      .tp,.at{display:grid;align-items:center;flex:1 1 0;min-height:0;max-height:25mm;gap:4mm;background:#fff;border-radius:5mm;padding:2.6mm 5mm;margin-bottom:2mm}.tp{grid-template-columns:11mm 1fr 52mm 28mm;padding:1.6mm 5mm;margin-bottom:1.6mm}.tp .nm small{margin-top:.2mm}.at{grid-template-columns:12mm 1fr 78mm 20mm;padding:3.2mm 5mm;margin-bottom:3mm}
      .nm b{display:block;font-size:10.5pt;font-weight:700;color:#${C.ardoise}}.nm small{display:block;font-size:8.5pt;margin-top:.8mm}.tr{height:3.6mm;border-radius:99px;background:#${C.clair}}.tr i{display:block;height:100%;border-radius:99px;background:#${C.ardoise}}.tp strong{text-align:right;font-size:11pt;color:#${C.ardoise}}.at strong{text-align:right;font-size:19pt;font-weight:800;color:#${C.rouge}}
      .ring{width:64mm;height:64mm;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:2mm 0 5mm}.ring span{display:flex;align-items:center;justify-content:center;width:36mm;height:36mm;border-radius:50%;background:#${C.clair};font-size:24pt;font-weight:800;color:#${C.ardoise}}
      .lg{list-style:none;padding:0;font-size:10pt}.lg li{margin-bottom:1.6mm}.lg i{display:inline-block;width:3mm;height:3mm;border-radius:50%;margin-right:2mm}.pl{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:15mm;gap:3mm;align-content:start}.pl span{display:flex;align-items:center;gap:3mm;background:#fff;border-radius:99px;padding:0 6mm;font-size:10pt}.pl b{font-size:13pt;font-weight:800;color:#${C.rouge};min-width:9mm}
      .sy{flex-direction:row;align-items:center;gap:7mm;padding:7mm 8mm;flex:1}.sy p{font-size:12.5pt;line-height:1.45}.so{flex-direction:row;align-items:center;gap:6mm;padding:4.5mm 7mm;margin-bottom:2mm}.so .nm{flex:1}.so .nm b{font-size:13pt}.so .nm small{font-size:9.5pt;margin-top:1mm}.pg-n{background:#${C.ardoise};color:#fff;border-radius:99px;padding:2mm 5mm;font-size:10pt;font-weight:700}
      .cv{background:#${C.ardoise};color:#fff}.cv .ph{position:absolute;right:0;top:0;height:210mm;width:125mm;display:block}.cv .ph.cart{background:#${C.clair};border-radius:14mm 0 0 14mm;display:flex;align-items:center;justify-content:center}.cv .ph.cart img{width:92mm;height:auto}
      .cv .tx{position:absolute;left:18mm;top:60mm;width:140mm}.cv .ey{font-size:9pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#${C.corail};margin-bottom:5mm}.cv h1{font-size:38pt;font-weight:800;line-height:1.1}.cv .sub{margin-top:5mm;font-size:17pt;font-weight:600;color:#${C.corail};line-height:1.3}
      .pills{display:flex;gap:3mm;margin-top:10mm;flex-wrap:wrap}.pills span{background:rgba(255,255,255,.16);border-radius:99px;padding:2.6mm 6mm;font-size:10.5pt;font-weight:700}.cv .lgn{position:absolute;left:18mm;top:16mm;height:11mm;width:auto}.cv .sg{position:absolute;left:18mm;bottom:26mm;font-size:11pt;font-weight:700}.cv .ag{position:absolute;left:18mm;bottom:14mm;height:7mm;width:auto}
      .ch .tx{top:66mm}.ch .ci.big{width:20mm;height:20mm;font-size:20pt;margin-bottom:8mm}.ch h1{font-size:34pt}`;
      return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reporting ESI : ${this._esc(D.periode)}</title><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet"><style>${css}</style></head><body>${cover}${sommaire}${pages.join('')}</body></html>`;
    },
    _numCell(t, i) { return i > 0 && /^[\d\s  .,%€]+$/.test(String(t)) ? 'r' : ''; },
    _statut(k) { return ({ COMPTE_CREE: 'Compte créé', INTEGRE: 'Intégré', ASSIGNE: 'Assigné', ARCHIVE: 'Archivé', EN_COURS: 'En cours', SAISIE: 'À traiter' })[k] || String(k).replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()); },

    // ───────────── PPTX : 10 x 5,625 in ─────────────
    PPTX_URL: 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
    async _chargerPptx() {
      if (window.PptxGenJS) return;
      await new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = this.PPTX_URL; s.integrity = 'sha384-Cck14aA9cifjYolcnjebXRfWGkz5ltHMBiG4px/j8GS+xQcb7OhNQWZYyWjQ+UwQ'; s.crossOrigin = 'anonymous'; s.onload = res;
        s.onerror = () => rej(new Error('Bibliothèque PowerPoint indisponible (réseau)')); document.head.appendChild(s);
      });
      if (!window.PptxGenJS) throw new Error('Bibliothèque PowerPoint indisponible');
    },
    async _imageData(url) {
      try { const r = await fetch(url); if (!r.ok) return null; const b = await r.blob();
        return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(null); f.readAsDataURL(b); }); } catch (e) { return null; }
    },
    // Photo de visite recadrée et arrondie (canvas), repli sur l'image brute
    async _imageArrondie(url, w, h, r) {
      const brut = await this._imageData(url); if (!brut || typeof document === 'undefined' || !document.createElement) return brut;
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = brut; });
        const K = 300, cv = document.createElement('canvas'); cv.width = w * K; cv.height = h * K; const g = cv.getContext('2d'), R = r * K;
        g.beginPath(); g.moveTo(R, 0); g.arcTo(cv.width, 0, cv.width, cv.height, R); g.arcTo(cv.width, cv.height, 0, cv.height, R); g.arcTo(0, cv.height, 0, 0, R); g.arcTo(0, 0, cv.width, 0, R); g.closePath(); g.clip();
        const s = Math.max(cv.width / img.width, cv.height / img.height), dw = img.width * s, dh = img.height * s; g.drawImage(img, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
        return cv.toDataURL('image/png');
      } catch (e) { return brut; }
    },
    async genererPPT() {
      const r = this._x(); if (!this.BLOCS.some(x => r.blocs.includes(x[0]))) { if (window.Toast) Toast.afficher('Coche au moins un bloc', 'erreur'); return; }
      try { await this._chargerPptx(); } catch (e) { if (window.Toast) Toast.afficher(e.message, 'erreur'); return; }
      const C = this.CH, FONT = 'Montserrat', D = this._donneesRapport(), slides = this._slides(D), f = n => this._fmt(n), z = t => this._san(t), I = IMG();
      const S = this._structure(D, slides), total = S.pages.length, err = this._qaChiffres(D), textes = [];
      const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_16x9'; pptx.title = 'Reporting ESI'; pptx.author = D.auteur;
      const T = (sl, t, o) => { t = z(t); textes.push(t); if ((o.fontSize || 12) < 12) err.push('Police sous 12 pt : ' + t.slice(0, 30)); sl.addText(t, { fontFace: FONT, color: C.texte, margin: 0, valign: 'middle', lineSpacingMultiple: 1.1, ...o }); };
      const F = (sl, type, o) => sl.addShape(type, { line: { type: 'none' }, ...o });
      const RR = pptx.ShapeType.roundRect, EL = pptx.ShapeType.ellipse;
      const carte = (sl, x, y, w, h, fill = C.clair) => F(sl, RR, { x, y, w, h, fill: { color: fill }, rectRadius: 0.2 });
      const eyebrow = (sl, t, x, y, w, col = C.rouge) => T(sl, t.toUpperCase(), { x, y, w, h: 0.28, fontSize: 12, bold: true, color: col, charSpacing: 1 });
      const cercle = (sl, n, x, y, d, col, fs = 14) => { F(sl, EL, { x, y, w: d, h: d, fill: { color: col } }); T(sl, String(n), { x, y, w: d, h: d, fontSize: fs, bold: true, color: 'FFFFFF', align: 'center' }); };
      const pill = (sl, t, x, y, w) => { F(sl, RR, { x, y, w, h: 0.42, fill: { color: 'FFFFFF', transparency: 84 }, rectRadius: 0.21 }); T(sl, t, { x, y, w, h: 0.42, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center' }); };
      const pills = (sl, arr, y) => { let x = 0.56; arr.forEach(t => { t = z(t); const w = Math.max(1.0, 0.12 * t.length + 0.5); if (x + w > 4.8) { x = 0.56; y += 0.5; } pill(sl, t, x, y, w); x += w + 0.15; }); };
      const cellule = (t, o = {}) => { t = z(t); textes.push(t); return { text: t, options: { fontFace: FONT, fontSize: 12, color: C.texte, border: { type: 'none' }, margin: [0.03, 0.1, 0.03, 0.1], valign: 'middle', ...o } }; };
      const tableau = (sl, tete, lignes, { mg, ...o }) => {
        const m = mg ? { margin: mg } : {}, dr = tete.map((_, i) => this._numerique(lignes, i) ? 'right' : 'left');
        const rows = [tete.map((t, i) => cellule(t.toUpperCase(), { bold: true, color: C.ardoise, align: dr[i], fontSize: 12, ...m })), ...lignes.map(l => l.map((t, i) => cellule(t, { fill: { color: 'FFFFFF' }, align: dr[i], ...m })))];
        sl.addTable(rows, { fontFace: FONT, rowH: 0.34, ...o });
      };
      const logos = { norton: await this._imageData(I + 'norton_blanc.png'), prog: await this._imageData(I + 'norton_prog.png'), mv: await this._imageData(I + 'marvesting.png'), tex: await this._imageData(I + 'texture.png'),
        cover: await this._imageData(I + 'cover_16x9.png'), equipe: await this._imageData(I + 'chap_equipe_16x9.png'), kpi: await this._imageData(I + 'chap_kpi_16x9.png'), carte: await this._imageData(I + 'carte_france.png') };
      const img = (sl, d, o) => { if (d) sl.addImage({ data: d, ...o }); };
      const bandeau = (sl, d, p) => {
        sl.background = { color: 'FFFFFF' }; F(sl, pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 1.0, fill: { color: C.ardoise } }); img(sl, logos.tex, { x: 0, y: 0, w: 10, h: 1.0 });
        let x0 = 0.5;
        if (p.n) { F(sl, RR, { x: 0.5, y: 0.27, w: 0.46, h: 0.46, fill: { color: C.rouge }, rectRadius: 0.13, rotate: -8 }); T(sl, String(p.n), { x: 0.5, y: 0.27, w: 0.46, h: 0.46, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center' }); x0 = 1.15; }
        const wTit = 9.5 - x0 - (d && d.capsule ? 1.95 : 0);
        T(sl, d.titre, { x: x0, y: 0.1, w: wTit, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', fit: 'shrink' });
        T(sl, d.concl.length > 58 ? d.concl.slice(0, 57) + '.' : d.concl, { x: x0, y: 0.58, w: wTit, h: 0.3, fontSize: 12, bold: true, color: C.corail });
        if (d.capsule) { F(sl, RR, { x: 7.7, y: 0.27, w: 1.8, h: 0.46, fill: { color: 'FFFFFF' }, rectRadius: 0.23 }); T(sl, d.capsule, { x: 7.7, y: 0.27, w: 1.8, h: 0.46, fontSize: 14, bold: true, color: C.ardoise, align: 'center' }); }
        T(sl, `${D.auteur} · Norton × ISM · FY27`, { x: 0.5, y: 5.2, w: 5.6, h: 0.3, fontSize: 12 });
        img(sl, logos.prog, { x: 7.0, y: 5.2, w: 1.35, h: 0.3, sizing: { type: 'contain', w: 1.35, h: 0.3 } });
        T(sl, `${p.num} / ${total}`, { x: 8.5, y: 5.2, w: 1.0, h: 0.3, fontSize: 12, bold: true, align: 'right' });
      };
      for (const p of S.pages) {
        const sl = pptx.addSlide();
        if (p.t === 'cover') {
          sl.background = { color: C.ardoise }; img(sl, logos.cover, { x: 5, y: 0, w: 5, h: 5.625 }); img(sl, logos.norton, { x: 0.56, y: 0.45, w: 1.6, h: 0.37 });
          eyebrow(sl, 'Reporting commercial · Norton Empower', 0.56, 1.55, 4.3, C.corail);
          T(sl, 'Reporting commercial', { x: 0.56, y: 1.95, w: 4.2, h: 1.3, fontSize: 36, bold: true, color: 'FFFFFF', valign: 'top' });
          T(sl, D.periode, { x: 0.56, y: 3.3, w: 4.2, h: 0.4, fontSize: 18, bold: true, color: C.corail });
          pills(sl, ['Périmètre ' + D.perimetre, D.date], 3.85);
          T(sl, D.auteur, { x: 0.56, y: 4.95, w: 4, h: 0.28, fontSize: 12, bold: true, color: 'FFFFFF' }); img(sl, logos.mv, { x: 0.56, y: 5.25, w: 1.17, h: 0.26 });
          sl.addNotes("Message : le point de la période. Chiffre : voir les pages suivantes. Question au public : que veut-on décider aujourd'hui ?");
        } else if (p.t === 'sommaire') {
          bandeau(sl, { titre: 'Sommaire', concl: `${S.chap.length} chapitres, ${total} pages`, capsule: '' }, { n: '', num: p.num });
          S.chap.forEach((c, k) => { const y = 1.3 + k * 0.74; carte(sl, 0.5, y, 9, 0.62); cercle(sl, c.n, 0.68, y + 0.1, 0.42, C.rouge); T(sl, c.nom, { x: 1.3, y: y + 0.04, w: 6.4, h: 0.3, fontSize: 16, bold: true, color: C.ardoise }); T(sl, c.sub.length > 62 ? c.sub.slice(0, 61) + '.' : c.sub, { x: 1.3, y: y + 0.33, w: 6.6, h: 0.25, fontSize: 12 });
            F(sl, RR, { x: 8.2, y: y + 0.15, w: 1.1, h: 0.32, fill: { color: C.ardoise }, rectRadius: 0.16 }); T(sl, 'p. ' + c.page, { x: 8.2, y: y + 0.15, w: 1.1, h: 0.32, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center' }); });
          sl.addNotes('Message : le plan du rapport. Question au public : par quel chapitre commencer ?');
        } else if (p.t === 'chapitre') {
          const m = META[p.c.nom] || META.Visites; sl.background = { color: C.ardoise };
          if (m.img === 'carte') { F(sl, RR, { x: 5.0, y: 0, w: 5, h: 5.625, fill: { color: C.clair }, rectRadius: 0.5 }); F(sl, pptx.ShapeType.rect, { x: 9.5, y: 0, w: 0.5, h: 5.625, fill: { color: C.clair } }); img(sl, logos.carte, { x: 5.9, y: 1.1, w: 3.3, h: 3.3 }); } else img(sl, logos[m.img], { x: 5, y: 0, w: 5, h: 5.625 });
          cercle(sl, String(p.n).padStart(2, '0'), 0.56, 1.1, 0.9, C.rouge, 24);
          T(sl, p.c.nom, { x: 0.56, y: 2.2, w: 4.2, h: 0.8, fontSize: 34, bold: true, color: 'FFFFFF' });
          T(sl, p.c.sub.length > 70 ? p.c.sub.slice(0, 69) + '.' : p.c.sub, { x: 0.56, y: 3.05, w: 4.2, h: 0.8, fontSize: 16, bold: true, color: C.corail, valign: 'top' });
          pills(sl, this._pills(p.c.nom, D), 4.2);
          sl.addNotes('Message : ' + p.c.nom + '. ' + p.c.sub);
        } else {
          const d = p.s; bandeau(sl, d, { n: p.n, num: p.num });
          if (d.kind === 'visites') {
            const Vi = D.visites, ph = Vi.photos.length > 0, h = ph ? 2.55 : 3.8;
            F(sl, RR, { x: 0.5, y: 1.25, w: 2.3, h: 3.8, fill: { color: C.ardoise }, rectRadius: 0.2 });
            eyebrow(sl, 'Visites terrain', 0.7, 1.45, 1.9, C.corail); T(sl, String(Vi.n), { x: 0.7, y: 1.85, w: 1.9, h: 0.9, fontSize: 44, bold: true, color: C.corail });
            T(sl, `visite${this._s(Vi.n, '', 's')} sur la période`, { x: 0.7, y: 2.75, w: 1.9, h: 0.5, fontSize: 12, bold: true, color: 'FFFFFF', valign: 'top' });
            T(sl, `${Vi.comptes} compte${this._s(Vi.comptes, '', 's')}`, { x: 0.7, y: 3.55, w: 1.9, h: 0.3, fontSize: 12, color: 'FFFFFF' }); T(sl, `${Vi.commerciaux} commercia${Vi.commerciaux > 1 ? 'ux' : 'l'}`, { x: 0.7, y: 3.9, w: 1.9, h: 0.3, fontSize: 12, color: 'FFFFFF' });
            carte(sl, 3.0, 1.25, 6.5, h);
            if (Vi.lignes.length) tableau(sl, ['Date', 'Commercial', 'Compte', 'Type'], Vi.lignes, { x: 3.2, y: 1.4, w: 6.1, colW: [1.1, 1.4, 2.4, 1.2], rowH: ph ? 0.31 : 0.42 });
            else T(sl, 'Aucune visite enregistrée sur la période.', { x: 3.2, y: 1.5, w: 6.1, h: 0.5, fontSize: 14 });
            for (let k = 0; k < Vi.photos.length; k++) { const q = Vi.photos[k], x = 3.0 + k * 2.2, dd = await this._imageArrondie(q.u, 2.1, 1.1, 0.16); if (dd) { sl.addImage({ data: dd, x, y: 3.95, w: 2.1, h: 1.1 }); F(sl, RR, { x: x + 0.1, y: 4.65, w: 1.9, h: 0.3, fill: { color: '000000', transparency: 45 }, rectRadius: 0.15 }); T(sl, q.c || 'Visite terrain', { x: x + 0.15, y: 4.65, w: 1.8, h: 0.3, fontSize: 12, bold: true, color: 'FFFFFF', fit: 'shrink' }); } }
          } else if (d.kind === 'sellin') {
            const Sl = D.sellin, best = Sl.parQ.indexOf(Math.max(...Sl.parQ));
            F(sl, RR, { x: 0.5, y: 1.25, w: 4.3, h: 1.05, fill: { color: C.ardoise }, rectRadius: 0.2 }); eyebrow(sl, 'CA réalisé, FY27', 0.7, 1.35, 3.9, C.corail); T(sl, f(Sl.total) + ' €', { x: 0.7, y: 1.65, w: 3.9, h: 0.55, fontSize: 30, bold: true, color: C.corail });
            carte(sl, 0.5, 2.45, 4.3, 2.6); eyebrow(sl, 'Par quarter', 0.7, 2.55, 3.9);
            sl.addChart(pptx.charts.BAR, [{ name: 'CA réalisé (€)', labels: D.qs, values: Sl.parQ }], { x: 0.6, y: 2.85, w: 4.1, h: 2.1, barDir: 'col', chartColors: D.qs.map((_, i) => (i === best && Sl.total ? C.rouge : C.ardoise)), showValue: true, dataLabelFontSize: 12, dataLabelFontFace: FONT, dataLabelColor: C.texte, dataLabelFormatCode: '#,##0',
              catAxisLabelFontSize: 12, catAxisLabelFontFace: FONT, catAxisLabelColor: C.texte, catAxisLineShow: false, valAxisHidden: true, valAxisLineShow: false, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 70 });
            carte(sl, 5.0, 1.25, 4.5, 3.8); eyebrow(sl, 'Par commercial', 5.2, 1.4, 4.1);
            tableau(sl, ['Commercial', ...D.qs, 'Total'], Sl.parCom.slice(0, 6).map(x => [x.nom, ...x.q.map(f), f(x.tot)]), { x: 5.2, y: 1.75, w: 4.1, colW: [1.0, 0.62, 0.62, 0.62, 0.62, 0.62], mg: [0.03, 0.05, 0.03, 0.05], rowH: 0.42 });
          } else if (d.kind === 'top') {
            const T8 = D.sellin.top, mx = Math.max(1, ...T8.map(x => x.ca)); carte(sl, 0.5, 1.25, 9, 3.8);
            T8.forEach((x, k) => { const y = 1.4 + k * 0.44; F(sl, RR, { x: 0.65, y, w: 8.7, h: 0.38, fill: { color: 'FFFFFF' }, rectRadius: 0.19 }); cercle(sl, k + 1, 0.72, y + 0.04, 0.3, k === 0 ? C.rouge : C.ardoise, 12);
              T(sl, x.compte, { x: 1.2, y, w: 3.2, h: 0.38, fontSize: 12, bold: true, color: C.ardoise, fit: 'shrink' }); T(sl, x.com, { x: 4.45, y, w: 1.6, h: 0.38, fontSize: 12, fit: 'shrink' });
              F(sl, RR, { x: 6.1, y: y + 0.13, w: 1.8, h: 0.12, fill: { color: C.clair }, rectRadius: 0.06 }); F(sl, RR, { x: 6.1, y: y + 0.13, w: Math.max(0.12, 1.8 * x.ca / mx), h: 0.12, fill: { color: C.ardoise }, rectRadius: 0.06 });
              T(sl, f(x.ca) + ' €', { x: 8.0, y, w: 1.25, h: 0.38, fontSize: 12, bold: true, color: C.ardoise, align: 'right' }); });
          } else if (d.kind === 'atteinte') {
            const pal = [C.ardoise, C.rouge, C.corail, C.moyen, C.ardoise]; carte(sl, 0.5, 1.25, 9, 3.8);
            d.lignes.forEach((x, k) => { const y = 1.4 + k * 0.7; F(sl, RR, { x: 0.65, y, w: 8.7, h: 0.6, fill: { color: 'FFFFFF' }, rectRadius: 0.2 }); F(sl, EL, { x: 0.78, y: y + 0.09, w: 0.42, h: 0.42, fill: { color: pal[k % 5] } }); T(sl, this._init(x.nom), { x: 0.78, y: y + 0.09, w: 0.42, h: 0.42, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center' });
              T(sl, x.nom, { x: 1.35, y: y + 0.04, w: 2.6, h: 0.26, fontSize: 12, bold: true, color: C.ardoise }); T(sl, `${f(x.ca)} € sur ${f(x.obj)} €`, { x: 1.35, y: y + 0.31, w: 2.6, h: 0.25, fontSize: 12 });
              F(sl, RR, { x: 4.1, y: y + 0.22, w: 3.9, h: 0.16, fill: { color: C.clair }, rectRadius: 0.08 }); F(sl, RR, { x: 4.1, y: y + 0.22, w: Math.max(0.18, 3.9 * Math.min(1, x.pct / 100)), h: 0.16, fill: { color: x.pct < 80 ? C.corail : C.ardoise }, rectRadius: 0.08 });
              T(sl, x.pct + ' %', { x: 8.1, y, w: 1.15, h: 0.6, fontSize: 20, bold: true, color: C.rouge, align: 'right' }); });
            if (!d.lignes.length) T(sl, 'Aucun objectif pour ce trimestre.', { x: 0.7, y: 1.5, w: 8, h: 0.5, fontSize: 14 });
          } else if (d.kind === 'portefeuille') {
            const Pf = D.portefeuille, pal = [C.ardoise, C.rouge, C.corail, C.moyen]; carte(sl, 0.5, 1.25, 4.4, 3.8); eyebrow(sl, 'Comptes par canal', 0.7, 1.4, 4);
            if (Pf.canaux.length) sl.addChart(pptx.charts.DOUGHNUT, [{ name: 'Comptes', labels: Pf.canaux.map(x => x[0]), values: Pf.canaux.map(x => x[1]) }], { x: 0.6, y: 1.7, w: 4.2, h: 3.25, holeSize: 58, chartColors: pal.slice(0, Pf.canaux.length), showLegend: true, legendPos: 'b', legendFontSize: 12, legendFontFace: FONT, legendColor: C.texte, showValue: true, showPercent: false, dataLabelFontSize: 12, dataLabelFontFace: FONT, dataLabelColor: 'FFFFFF', dataBorder: { pt: 0, color: 'FFFFFF' } });
            F(sl, RR, { x: 5.1, y: 1.25, w: 4.4, h: 1.2, fill: { color: C.ardoise }, rectRadius: 0.2 }); eyebrow(sl, 'Couverture', 5.3, 1.35, 4, C.corail); T(sl, String(Pf.deps), { x: 5.3, y: 1.65, w: 1.2, h: 0.65, fontSize: 36, bold: true, color: C.corail }); T(sl, `sur 96 départements`, { x: 6.5, y: 1.65, w: 2.8, h: 0.65, fontSize: 12, bold: true, color: 'FFFFFF' });
            carte(sl, 5.1, 2.6, 4.4, 2.45); eyebrow(sl, 'Pipeline par statut', 5.3, 2.7, 4);
            if (Pf.leads.length) tableau(sl, ['Statut', 'Leads'], Pf.leads.slice(0, 5).map(([k, n]) => [this._statut(k), n]), { x: 5.3, y: 3.0, w: 4.0, colW: [2.9, 1.1], rowH: 0.31 }); else T(sl, 'Aucun lead dans le pipeline.', { x: 5.3, y: 3.1, w: 4, h: 0.4, fontSize: 12 });
          } else if (d.kind === 'synthese') {
            d.lignes.forEach((l, k) => { const y = 1.3 + k * 1.25; carte(sl, 0.5, y, 9, 1.1); cercle(sl, k + 1, 0.75, y + 0.3, 0.5, k === 1 ? C.rouge : C.ardoise, 16); T(sl, l, { x: 1.55, y: y + 0.1, w: 7.7, h: 0.9, fontSize: 14 }); });
          }
          sl.addNotes(z(d.notes)); textes.push(d.notes);
        }
      }
      err.push(...this._qaTextes(textes));
      if (err.length) { if (window.Toast) Toast.afficher('Contrôle qualité : ' + err[0], 'erreur'); console.error('QA rapport', err); return; }
      try {
        const blob = await this._finaliserPptx(await pptx.write({ outputType: 'arraybuffer' }));
        this._telecharger(blob, 'Reporting-ESI-' + new Date().toISOString().slice(0, 10) + '.pptx');
        if (window.Toast) Toast.afficher('PowerPoint généré', 'succes');
      } catch (e) { if (window.Toast) Toast.afficher('Échec de la génération PowerPoint : ' + e.message, 'erreur'); console.error('QA rapport', e); }
    },
  });
})();
