/* ════════════════════════════════════════════════════════════════════
   pidlane-winter.js — PLWinter: winterprofiel, winterkaart en bandentabel
   ────────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (20-10-2026, #555/#556/#559)

   De wintercheck (openClimateCheck('winter')) meet één keer hoe snel de
   motor warm wordt. Wat de klant in de winter in de problemen brengt is
   meestal niet te meten: zomerbanden bij 3 °C, zomervloeistof in de
   sproeiertank bij vorst. Dat weet de app alleen als de klant het zegt, en
   pas iets waard in combinatie met het weer van de komende dagen.

   NIET OVERHEERSEN (#555). Eén kaart op het startscherm, alleen in het
   winterseizoen. Eerst — één keer per seizoen — de banner "pas je profiel
   aan voor de winterperiode"; daarna een smalle strook van drie dagen en
   hoogstens één advies tegelijk, weg te tikken. Geen eigen tegel, geen
   melding uit het niets. In het voorjaar dezelfde banner andersom, alleen
   voor wie winterbanden opgaf.

   EERLIJK OVER DE BRON. OBD ziet geen banden en geen sproeiervloeistof.
   Elk advies zegt waar het op rust (bron): het profiel, de verwachting, of
   een model. De bandentabel is een model op basis van bandentests, geen
   meting, en zegt dat erbij.

   WAAR HET PROFIEL STAAT. Klant met een actief voertuig: in kp_voertuig
   (D1, via PLGarage.winterBewaar). Zonder account of zonder voertuig: op
   het toestel (localStorage pl_winter). WINTER_KEUZES = de keuzes van
   KP_VELDEN in worker.js; test-winter.js vergelijkt ze.

   PUUR EN NIET PUUR. seizoen(), bannerNodig(), adviezen(), bandenStand(),
   bandenTabel(), opwarmMin() en controleer() zijn puur; test-winter.js
   toetst ze met vm. De rest raakt de DOM, localStorage en PLGarage.
   Laadvolgorde: ná pidlane-zonder.js (PLZonder._blad) en pidlane-weer.js.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var WINTER_KEUZES = {
    banden: ['zomer', 'winter', 'all-season', 'weet niet'],
    banden_alpine: ['ja', 'alleen m+s', 'weet niet'],
    sproeier: ['zomer', 'winter', 'weet niet']
  };
  var VELDEN = ['plaats', 'banden', 'banden_alpine', 'banden_dot', 'banden_mm', 'sproeier', 'sproeier_tot', 'sproeier_datum'];
  var OPSLAG = { profiel: 'pl_winter', gezien: 'pl_winter_gezien', weg: 'pl_winter_weg' };
  var CFG = {
    sproeierZomer: 0,        // °C: zomervloeistof (of water) bevriest hier
    sproeierWinter: -20,     // °C: winterversie zonder opgegeven grens
    sproeierMarge: 1,        // °C: zo dicht bij de grens is al raak
    sproeierOudDagen: 56,    // na acht weken bijvullen met water verdund?
    dotJaren: 6,             // daarna verhardt het rubber, ook met profiel
    winterMm: 4,             // onder 4 mm doet een winterband zijn werk niet meer
    wegWeerMs: 7 * 864e5,    // een weggetikt weeradvies komt na een week terug
    as: [-10, 25]            // de temperatuuras van de bandentabel
  };
  var ERNST = { rood: 0, oranje: 1, info: 2 };

  function getal(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function nl(x) { return String(Math.round(x)).replace('-', '−'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ════════════════════════════════════════════════════════════════
  //  PUUR
  // ════════════════════════════════════════════════════════════════
  /* Oktober t/m maart is winter, met het jaar van oktober in de sleutel:
     januari 2027 hoort bij winter-2026. */
  function seizoen(nu) {
    var d = new Date(nu), m = d.getMonth(), j = d.getFullYear();
    if (m >= 9 || m <= 2) {
      var wj = m >= 9 ? j : j - 1;
      return { soort: 'winter', sleutel: 'winter-' + wj, begin: new Date(wj, 8, 1).getTime() };
    }
    return { soort: 'zomer', sleutel: 'zomer-' + j, begin: new Date(j, 3, 1).getTime() };
  }

  function datumMs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
  }

  /* Klaar voor de winter: winter- of all-seasonbanden, wintervloeistof die
     sinds september is bijgevuld, en een plaats voor het weer. Wie dat al
     invulde, hoeft de banner niet te zien. */
  function klaarVoorWinter(p, s) {
    p = p || {};
    var bij = datumMs(p.sproeier_datum);
    return (p.banden === 'winter' || p.banden === 'all-season') && p.sproeier === 'winter' &&
      bij !== null && bij >= s.begin && !!p.plaats;
  }

  /* De seizoensbanner, of null. ctx: { nu, weer (PLWeer.samenvat), profiel, gezien }.
     Winter: zodra de verwachting onder het omslagpunt komt; zonder
     verwachting (nog geen plaats, offline) vanaf 1 oktober. Voorjaar: alleen
     wie winterbanden opgaf, en pas als het elke dag warm is (of vanaf mei). */
  function bannerNodig(ctx) {
    ctx = ctx || {};
    var s = seizoen(ctx.nu), p = ctx.profiel || {}, w = ctx.weer;
    if (ctx.gezien === s.sleutel) return null;
    if (s.soort === 'winter') {
      if (klaarVoorWinter(p, s)) return null;
      if (w && !w.onderOmslag) return null;
      return { soort: 'winter', sleutel: s.sleutel, titel: 'Het wordt kouder',
        tekst: 'Pas je profiel aan voor de winterperiode: welke banden eronder zitten, welke ruitensproeiervloeistof erin zit en je plaats voor het weer.' };
    }
    if (p.banden !== 'winter') return null;
    if (w ? !w.warm : new Date(ctx.nu).getMonth() < 4) return null;
    return { soort: 'zomer', sleutel: s.sleutel, titel: 'Het wordt warmer',
      tekst: 'Rijd je nog op winterbanden? Boven 15 °C slijten ze snel en remmen ze slechter dan zomerbanden. Pas je profiel aan als je gewisseld hebt.' };
  }

  /* De mediaan van de opwarmtijd (koude start → 80 °C) van DEZE auto, in
     hele minuten, uit rit.extra.cd van PLConditie. null onder drie ritten. */
  function opwarmMin(ritten) {
    var l = (Array.isArray(ritten) ? ritten : []).map(function (r) {
      var cd = r && r.extra && r.extra.cd;
      return cd && cd.kk === 1 ? getal(cd.ow) : null;
    }).filter(function (x) { return x !== null && x > 0; }).sort(function (a, b) { return a - b; });
    if (l.length < 3) return null;
    var m = Math.floor(l.length / 2), med = l.length % 2 ? l[m] : (l[m - 1] + l[m]) / 2;
    return Math.max(1, Math.round(med / 60));
  }

  function dotLeeftijd(dot, nu) {
    var m = /^(\d{2})(\d{2})$/.exec(String(dot || ''));
    if (!m) return null;
    var week = +m[1], jaar = 2000 + +m[2];
    var t = new Date(jaar, 0, 1).getTime() + (week - 1) * 7 * 864e5;
    if (t > nu + 864e5 * 7) return null;    // een DOT uit de toekomst is een tikfout
    return (nu - t) / (365.25 * 864e5);
  }

  /* Alle adviezen die nu gelden, de zwaarste eerst. ctx: { profiel, weer,
     nu, opwarmMin }. Elk advies: { id, ernst, titel, tekst, bron, duur }.
     duur 'weer' = hangt aan de verwachting (een week weg te tikken), 'seizoen'
     = hangt aan het profiel (het hele seizoen weg). */
  function adviezen(ctx) {
    ctx = ctx || {};
    var p = ctx.profiel || {}, w = ctx.weer, s = seizoen(ctx.nu), uit = [];
    var bronWeer = 'je profiel en de verwachting voor ' + (ctx.plaatsNaam || 'je plaats');
    var winter = s.soort === 'winter';

    // ── Ruitensproeiervloeistof ──
    if (w) {
      var grens = p.sproeier === 'winter' ? (getal(p.sproeier_tot) !== null ? p.sproeier_tot : CFG.sproeierWinter) : CFG.sproeierZomer;
      if (w.min <= grens + CFG.sproeierMarge) {
        if (p.sproeier === 'winter') {
          uit.push({ id: 'sproeier', ernst: 'rood', duur: 'weer', bron: bronWeer,
            titel: 'Je sproeiervloeistof kan bevriezen',
            tekst: 'Het wordt ' + nl(w.min) + ' °C en je vloeistof is beschermd tot ' + nl(grens) + ' °C. Vul aan met een sterkere winterversie, of meng minder water bij.' });
        } else if (p.sproeier === 'zomer') {
          uit.push({ id: 'sproeier', ernst: 'rood', duur: 'weer', bron: bronWeer,
            titel: 'Zomervloeistof in de sproeier — het gaat vriezen',
            tekst: 'Het wordt ' + nl(w.min) + ' °C. Zomervloeistof bevriest rond 0 °C, in de tank, de pomp en de leidingen. Vul nu winterversie bij (bijvoorbeeld tot −20 °C).' });
        } else {
          uit.push({ id: 'sproeier', ernst: 'oranje', duur: 'weer', bron: bronWeer,
            titel: 'Weet je wat er in de sproeiertank zit?',
            tekst: 'Het wordt ' + nl(w.min) + ' °C. Zomervloeistof of water bevriest dan. Vul winterversie bij en zet het in je winterprofiel, dan houdt de app het bij.' });
        }
      } else if (p.sproeier === 'winter' && w.streng) {
        var bij = datumMs(p.sproeier_datum);
        if (bij !== null && ctx.nu - bij > CFG.sproeierOudDagen * 864e5) {
          uit.push({ id: 'sproeier-oud', ernst: 'oranje', duur: 'weer', bron: bronWeer,
            titel: 'Strenge vorst: controleer het sproeiermengsel',
            tekst: 'Het wordt ' + nl(w.min) + ' °C en je vulde ruim acht weken geleden bij. Is er sindsdien water bijgegaan, dan beschermt het mengsel minder. Vul aan met winterversie.' });
        }
      }
    }

    // ── Banden ──
    if (w && w.onderOmslag && p.banden === 'zomer') {
      uit.push({ id: 'banden-wissel', ernst: w.vorst || w.glad ? 'rood' : 'oranje', duur: 'weer', bron: bronWeer + ', en de bandentabel (een model)',
        titel: 'Tijd voor winterbanden',
        tekst: 'De komende dagen wordt het ' + nl(w.min) + ' °C. Onder 7 °C wordt het rubber van een zomerband hard: minder grip en een langere remweg' + (w.vorst || w.sneeuw ? ', op sneeuw en ijs veel langer' : '') + '.' });
    } else if (w && w.onderOmslag && (!p.banden || p.banden === 'weet niet') && winter) {
      uit.push({ id: 'banden-onbekend', ernst: 'info', duur: 'seizoen', bron: 'de verwachting',
        titel: 'Welke banden zitten eronder?',
        tekst: 'Het wordt kouder dan 7 °C, het omslagpunt tussen zomer- en winterband. Zet je banden in je winterprofiel, dan zegt de app wanneer wisselen loont.' });
    }
    if (w && w.warm && p.banden === 'winter') {
      uit.push({ id: 'banden-warm', ernst: 'oranje', duur: 'weer', bron: bronWeer + ', en de bandentabel (een model)',
        titel: 'Winterbanden slijten nu snel',
        tekst: 'Het wordt elke dag boven 15 °C. Een winterband is dan zacht: hij slijt sneller en remt op droog wegdek slechter dan een zomerband.' });
    }
    if (winter && p.banden === 'winter' && getal(p.banden_mm) !== null && p.banden_mm < CFG.winterMm) {
      uit.push({ id: 'banden-mm', ernst: 'oranje', duur: 'seizoen', bron: 'je profiel',
        titel: 'Winterband onder 4 mm',
        tekst: 'Met ' + String(p.banden_mm).replace('.', ',') + ' mm profiel voert een winterband sneeuw en water slecht af. Wettelijk mag het tot 1,6 mm, maar de winterwerking is dan grotendeels weg.' });
    }
    var oud = dotLeeftijd(p.banden_dot, ctx.nu);
    if (winter && oud !== null && oud > CFG.dotJaren) {
      uit.push({ id: 'banden-oud', ernst: 'info', duur: 'seizoen', bron: 'je profiel (DOT ' + esc(p.banden_dot) + ')',
        titel: 'Je banden zijn ' + Math.floor(oud) + ' jaar oud',
        tekst: 'Rubber verhardt met de jaren, ook als er nog genoeg profiel op zit. Laat ze bij de wissel nakijken.' });
    }
    if (winter && p.banden_alpine === 'alleen m+s' && (p.banden === 'winter' || p.banden === 'all-season')) {
      uit.push({ id: 'banden-ms', ernst: 'info', duur: 'seizoen', bron: 'je profiel',
        titel: 'Naar Duitsland of Oostenrijk?',
        tekst: 'Alleen M+S op de band telt daar niet meer als winterband; het bergsymbool met de sneeuwvlok wel. Bij winterweer kan dat een boete en problemen met de verzekering geven.' });
    }

    // ── Gladheid en vorst: wat je 's ochtends doet ──
    var warmZin = getal(ctx.opwarmMin) !== null
      ? ' Op jouw auto is het koelwater na ongeveer ' + ctx.opwarmMin + ' minuten rijden warm; pas dan geeft de kachel echt warmte.'
      : '';
    if (w && w.glad) {
      uit.push({ id: 'glad', ernst: 'oranje', duur: 'weer', bron: 'de verwachting',
        titel: w.sneeuw ? 'Sneeuw en kans op gladheid' : 'Kans op gladheid',
        tekst: 'Neerslag rond het vriespunt. Maak alle ruiten helemaal vrij, houd meer afstand en trek rustig op. Laat de motor niet stationair warmdraaien: rustig wegrijden maakt hem sneller warm.' + warmZin });
    } else if (w && w.vorst) {
      uit.push({ id: 'vorst', ernst: 'info', duur: 'weer', bron: 'de verwachting',
        titel: 'Vorst: ' + nl(w.min) + ' °C',
        tekst: 'Leg ’s avonds een folie of deken op de voorruit, of krab hem helemaal vrij. Niet stationair warmdraaien — dat kost brandstof, slijt de motor en is in Duitsland zelfs verboden. Beslaat de ruit: airco aan, recirculatie uit.' + warmZin });
    }
    if (w && w.vorst) {
      uit.push({ id: 'rubbers', ernst: 'info', duur: 'seizoen', bron: 'algemeen advies',
        titel: 'Vastgevroren deuren voorkomen',
        tekst: 'Behandel de deurrubbers met siliconenspray, glycerine of talk. Geen vaseline: dat is aardolie en laat rubber opzwellen.' });
    }
    return uit.sort(function (a, b) { return ERNST[a.ernst] - ERNST[b.ernst]; });
  }

  /* Hoe goed een band past bij een temperatuur, 0…1. Een MODEL, geen
     meting: de richting en orde van grootte uit bandentests (ADAC, TÜV),
     als stuksgewijs lineaire lijn. Wat er in beeld komt is de kleur en het
     woord, nooit een percentage dat preciezer lijkt dan het is. */
  var BANDLIJN = {
    zomer: [[-20, 0.1], [-3, 0.2], [0, 0.35], [7, 0.75], [10, 1], [45, 1]],
    winter: [[-20, 1], [7, 1], [15, 0.7], [25, 0.4], [45, 0.3]],
    'all-season': [[-20, 0.6], [-5, 0.75], [0, 0.85], [7, 0.9], [20, 0.85], [30, 0.65], [45, 0.6]]
  };
  function bandenStand(type, t) {
    var l = BANDLIJN[type];
    if (!l || getal(t) === null) return null;
    var w = l[0][1];
    if (t >= l[l.length - 1][0]) w = l[l.length - 1][1];
    else for (var i = 0; i < l.length - 1; i++) {
      if (t >= l[i][0] && t <= l[i + 1][0]) { w = l[i][1] + (l[i + 1][1] - l[i][1]) * (t - l[i][0]) / (l[i + 1][0] - l[i][0]); break; }
    }
    return { w: Math.round(w * 100) / 100, label: w >= 0.85 ? 'past goed' : w >= 0.6 ? 'matig' : 'past slecht' };
  }

  // Rood → oranje → groen, voor de balken (dezelfde tinten als --rd/--or/--gn).
  function kleur(w) {
    var a = [239, 68, 68], b = [242, 130, 12], c = [6, 179, 107], x, y, f;
    if (w <= 0.5) { x = a; y = b; f = w / 0.5; } else { x = b; y = c; f = Math.min(1, (w - 0.5) / 0.4); }
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * f); }).join(',') + ')';
  }
  function pos(t) { var a = CFG.as[0], b = CFG.as[1]; return Math.max(0, Math.min(100, (t - a) / (b - a) * 100)); }

  /* De bandentabel als HTML. eigen = het bandtype uit het profiel (of null),
     dagen = de verwachting (PLWeer.samenvat().dagen) voor de stippen. */
  function bandenTabel(eigen, dagen) {
    var rijen = [['zomer', 'Zomerband'], ['winter', 'Winterband'], ['all-season', 'All-season']];
    var h = '<div class="plw-bt" role="img" aria-label="Bandentabel: hoe goed elke band past van ' + CFG.as[0] + ' tot ' + CFG.as[1] + ' °C, omslagpunt 7 °C">';
    rijen.forEach(function (r) {
      var stops = [];
      for (var t = CFG.as[0]; t <= CFG.as[1]; t += 2.5) stops.push(kleur(bandenStand(r[0], t).w) + ' ' + pos(t).toFixed(1) + '%');
      var mijn = r[0] === eigen;
      h += '<div class="plw-bt-rij' + (mijn ? ' mijn' : '') + '"><div class="plw-bt-l">' + r[1] + (mijn ? '<small>jouw band</small>' : '') + '</div>' +
        '<div class="plw-bt-balk" style="background:linear-gradient(90deg,' + stops.join(',') + ')"><span class="plw-bt-7" style="left:' + pos(7).toFixed(1) + '%"></span>';
      if (mijn) (dagen || []).forEach(function (d) {
        // De laagste temperatuur van de dag: daar beslist de band.
        var lo = getal(d.min);
        if (lo === null) return;
        h += '<span class="plw-bt-dot" style="left:' + pos(lo).toFixed(1) + '%" title="' + esc(d.datum) + ': laagste ' + nl(lo) + ' °C"></span>';
      });
      h += '</div></div>';
    });
    h += '<div class="plw-bt-as"><span>' + nl(CFG.as[0]) + ' °C</span><span style="left:' + pos(0).toFixed(1) + '%">0</span><span class="o" style="left:' + pos(7).toFixed(1) + '%">7 °C</span><span style="left:' + pos(15).toFixed(1) + '%">15</span><span class="r">' + CFG.as[1] + ' °C</span></div>' +
      '<div class="plw-bt-leg"><i style="background:' + kleur(1) + '"></i>past goed <i style="background:' + kleur(0.7) + '"></i>matig <i style="background:' + kleur(0.2) + '"></i>past slecht' +
      (eigen && BANDLIJN[eigen] && dagen && dagen.length ? ' · <i class="d"></i>laagste temperatuur komende dagen' : '') + '</div></div>';
    return h;
  }

  /* Wat de klant invulde, gekeurd met dezelfde regels als KP_VELDEN in
     worker.js. { velden } of { fout }. */
  function controleer(inv) {
    inv = inv || {};
    var o = {}, fout = [];
    var plaatsen = (window.PLWeer && PLWeer.PLAATSEN || []).map(function (p) { return p[0]; });
    if (inv.plaats) { if (plaatsen.indexOf(inv.plaats) >= 0) o.plaats = inv.plaats; else fout.push('kies een plaats uit de lijst'); } else o.plaats = null;
    ['banden', 'banden_alpine', 'sproeier'].forEach(function (k) {
      if (!inv[k]) { o[k] = null; return; }
      if (WINTER_KEUZES[k].indexOf(inv[k]) >= 0) o[k] = inv[k]; else fout.push(k + ' heeft een onbekende keuze');
    });
    var dot = String(inv.banden_dot == null ? '' : inv.banden_dot).replace(/\s+/g, '');
    if (!dot) o.banden_dot = null;
    else if (/^(0[1-9]|[1-4][0-9]|5[0-3])[0-9]{2}$/.test(dot)) o.banden_dot = dot;
    else fout.push('de DOT-code is vier cijfers: week en jaar, bijvoorbeeld 4521');
    var mm = String(inv.banden_mm == null ? '' : inv.banden_mm).replace(',', '.');
    if (mm === '') o.banden_mm = null;
    else if (isFinite(+mm) && +mm >= 0 && +mm <= 15) o.banden_mm = Math.round(+mm * 10) / 10;
    else fout.push('het profiel ligt tussen 0 en 15 mm');
    var tot = String(inv.sproeier_tot == null ? '' : inv.sproeier_tot).replace('−', '-');
    if (tot === '' || o.sproeier !== 'winter') o.sproeier_tot = null;
    else if (isFinite(+tot) && +tot >= -60 && +tot <= 0) o.sproeier_tot = Math.round(+tot);
    else fout.push('de beschermingsgrens ligt tussen −60 en 0 °C');
    var dat = String(inv.sproeier_datum || '');
    if (!dat) o.sproeier_datum = null;
    else if (datumMs(dat) !== null) o.sproeier_datum = dat;
    else fout.push('de datum van bijvullen is geen datum');
    return fout.length ? { fout: fout.join('; ') } : { velden: o };
  }

  // ════════════════════════════════════════════════════════════════
  //  OPSLAG: het voertuig of het toestel
  // ════════════════════════════════════════════════════════════════
  function lees(k) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }
    catch (e) { console.warn('PLWinter: opslag ' + k + ' onleesbaar', e); return null; }
  }
  function schrijf(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { console.warn('PLWinter: opslag ' + k + ' niet te schrijven', e); }
  }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }
  function voertuig() {
    try { return window.PLGarage && typeof PLGarage.actief === 'function' ? PLGarage.actief() : null; }
    catch (e) { console.warn('PLWinter: actief voertuig onleesbaar', e); return null; }
  }
  function profiel() {
    var v = voertuig(), p = {};
    var bron = v || lees(OPSLAG.profiel) || {};
    VELDEN.forEach(function (k) { p[k] = bron[k] == null ? null : bron[k]; });
    p._waar = v ? 'voertuig' : 'toestel';
    p._naam = v ? (v.naam || [v.merk, v.model].filter(Boolean).join(' ') || 'je voertuig') : null;
    return p;
  }
  function gezien() {
    var v = voertuig();
    return (v && v.winter_gezien) || lees(OPSLAG.gezien);
  }
  async function bewaar(velden) {
    if (isDemo()) throw new Error('in de demo wordt niets bewaard');
    var v = voertuig();
    if (v && window.PLGarage && typeof PLGarage.winterBewaar === 'function') return PLGarage.winterBewaar(velden);
    var p = lees(OPSLAG.profiel) || {};
    Object.keys(velden).forEach(function (k) { if (k !== 'winter_gezien') p[k] = velden[k]; });
    schrijf(OPSLAG.profiel, p);
    return p;
  }
  async function zetGezien(sleutel) {
    schrijf(OPSLAG.gezien, sleutel);           // altijd ook op het toestel: geen tweede banner bij een netfout
    var v = voertuig();
    if (!v || isDemo()) return;
    try { await PLGarage.winterBewaar({ winter_gezien: sleutel }); }
    catch (e) { console.warn('PLWinter: "banner gezien" niet in het account bewaard — staat wel op dit toestel', e); }
  }
  function weggetikt(id, nu) {
    var w = lees(OPSLAG.weg) || {}, x = w[id];
    return !!x && ((x.tot && nu < x.tot) || (x.seizoen && x.seizoen === seizoen(nu).sleutel));
  }

  // ════════════════════════════════════════════════════════════════
  //  DE KAART OP HET STARTSCHERM
  // ════════════════════════════════════════════════════════════════
  function weerVan(p, nu) {
    if (!p.plaats || !window.PLWeer) return null;
    var c = PLWeer.laatst(p.plaats);
    return c ? PLWeer._kern.samenvat(c.dagen, nu) : null;
  }
  function opwarm() {
    var v = voertuig();
    if (!v || !window.PLGarage || typeof PLGarage.rittenVan !== 'function') return null;
    try { return opwarmMin(PLGarage.rittenVan(v.id)); }
    catch (e) { console.warn('PLWinter: opwarmtijd niet te lezen', e); return null; }
  }
  function staat(nu) {
    var p = profiel(), w = weerVan(p, nu);
    var ctx = { nu: nu, profiel: p, weer: w, gezien: gezien(), opwarmMin: opwarm(), plaatsNaam: p.plaats && window.PLWeer ? PLWeer.naam(p.plaats) : null };
    var banner = bannerNodig(ctx);
    var adv = adviezen(ctx).filter(function (a) { return !weggetikt(a.id, nu); });
    return { ctx: ctx, banner: banner, advies: adv[0] || null, meer: Math.max(0, adv.length - 1), toon: !!banner || seizoen(nu).soort === 'winter' };
  }

  function strook(ctx) {
    var p = ctx.profiel, w = ctx.weer;
    if (!p.plaats) return '<button type="button" class="plw-leeg" onclick="PLWinter.open()">📍 Kies je plaats voor het weer <span aria-hidden="true">→</span></button>';
    if (!w) return '<div class="plw-leeg stil">Geen verwachting voor ' + esc(ctx.plaatsNaam) + ' — ' + (isDemo() ? 'niet in de demo.' : 'log in, of probeer het straks.') + '</div>';
    var K = PLWeer._kern;
    return '<div class="plw-dagen">' + w.dagen.map(function (d) {
      var ic = (getal(d.sneeuw) || 0) > 0 ? '🌨️' : getal(d.min) !== null && d.min < 0 ? '❄️' : (getal(d.neerslag) || 0) >= 1 ? '🌧️' : getal(d.max) !== null && d.max >= 15 ? '☀️' : '☁️';
      var vorst = getal(d.min) !== null && d.min < 0;
      return '<div class="plw-dag' + (vorst ? ' vorst' : '') + '"><span class="n">' + esc(K.dagNaam(d.datum, ctx.nu)) + '</span><span class="i" aria-hidden="true">' + ic + '</span>' +
        '<span class="t"><b>' + (getal(d.min) !== null ? nl(d.min) + '°' : '–') + '</b> / ' + (getal(d.max) !== null ? nl(d.max) + '°' : '–') + '</span></div>';
    }).join('') + '</div>';
  }

  var _laatst = '', _vers = false;
  function teken(forceer) {
    var doel = document.getElementById('plWinterKaart');
    if (!doel) return;
    var nu = Date.now(), st = staat(nu);
    var bij = st.ctx.profiel.plaats && window.PLWeer ? PLWeer.laatst(st.ctx.profiel.plaats) : null;
    var sleutel = JSON.stringify([st.banner, st.advies && st.advies.id, st.advies && st.advies.tekst, st.meer, st.toon, st.ctx.weer, st.ctx.profiel.plaats, isDemo(), _vers, bij && bij.t]);
    if (!forceer && sleutel === _laatst) return;
    _laatst = sleutel;
    if (!st.toon || isDemo()) { doel.innerHTML = ''; return; }
    zorgCss();
    var b = st.banner;
    if (b) {
      doel.innerHTML = '<section class="plw plw-banner ' + b.soort + '" aria-labelledby="plwBanT"><div class="plw-ban-ic" aria-hidden="true">' + (b.soort === 'winter' ? '❄️' : '🌤️') + '</div>' +
        '<div class="plw-ban-tx"><div class="plw-kop" id="plwBanT">' + esc(b.titel) + '</div><div class="plw-sub">' + esc(b.tekst) + '</div>' +
        '<div class="plw-knoppen"><button type="button" class="plw-k hoofd" onclick="PLWinter.open()">' + (b.soort === 'winter' ? 'Profiel aanpassen' : 'Profiel bijwerken') + '</button>' +
        '<button type="button" class="plw-k" onclick="PLWinter._later()">Later</button></div></div></section>';
      return;
    }
    var ctx = st.ctx, a = st.advies;
    var h = '<section class="plw" aria-labelledby="plwT"><div class="plw-rij1"><div class="plw-kop" id="plwT">❄️ Winter</div>' +
      '<button type="button" class="plw-plaats" onclick="PLWinter.open()">' + (ctx.plaatsNaam ? '📍 ' + esc(ctx.plaatsNaam) : 'Winterprofiel') + '</button></div>' + strook(ctx);
    // Verversen (20-10-2026): de verwachting is een uur geldig, en wie 's
    // ochtends kijkt wil niet wachten tot het kwartier om is.
    if (ctx.profiel.plaats) h += '<div class="plw-bij"><span>' + (bij && bij.t ? 'Bijgewerkt om ' + new Date(bij.t).toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' }) : 'Nog geen verwachting') + '</span>' +
      '<button type="button" class="plw-ver" onclick="PLWinter._ververs()"' + (_vers ? ' disabled' : '') + ' aria-label="Weer verversen">' + (_vers ? 'Bezig…' : '↻ Verversen') + '</button></div>';
    if (a) h += '<div class="plw-adv ' + a.ernst + '"><div class="plw-adv-tx"><b>' + esc(a.titel) + '</b><div>' + esc(a.tekst) + '</div>' +
      '<small>Op basis van ' + esc(a.bron) + (st.meer ? ' · nog ' + st.meer + ' ' + (st.meer === 1 ? 'advies' : 'adviezen') + ' in je winterprofiel' : '') + '</small></div>' +
      '<button type="button" class="plw-x" aria-label="Dit advies wegtikken" title="Wegtikken" onclick="PLWinter._weg(\'' + esc(a.id) + '\',\'' + esc(a.duur) + '\')">✕</button></div>';
    h += '<button type="button" class="plw-link" onclick="PLWinter.open()">Winterprofiel en bandentabel <span aria-hidden="true">→</span></button></section>';
    doel.innerHTML = h;
  }

  // ════════════════════════════════════════════════════════════════
  //  HET WINTERPROFIEL
  // ════════════════════════════════════════════════════════════════
  var LABEL = {
    banden: { zomer: 'Zomer', winter: 'Winter', 'all-season': 'All-season', 'weet niet': 'Weet niet' },
    banden_alpine: { ja: 'Bergsymbool ❄', 'alleen m+s': 'Alleen M+S', 'weet niet': 'Weet niet' },
    sproeier: { zomer: 'Zomer of water', winter: 'Winterversie', 'weet niet': 'Weet niet' }
  };
  function keuzeRij(naam, w) {
    return '<div class="plw-chips" role="radiogroup">' + WINTER_KEUZES[naam].map(function (k) {
      return '<label class="plw-chip"><input type="radio" name="plw_' + naam + '" value="' + esc(k) + '"' + (w === k ? ' checked' : '') + ' onchange="PLWinter._wijzig()"><span>' + esc(LABEL[naam][k]) + '</span></label>';
    }).join('') + '</div>';
  }
  function formulier(p, nu) {
    var plaatsen = window.PLWeer ? PLWeer.PLAATSEN : [];
    var c = p.plaats && window.PLWeer ? PLWeer.laatst(p.plaats) : null;
    var w = c ? PLWeer._kern.samenvat(c.dagen, nu) : null;
    var adv = adviezen({ nu: nu, profiel: p, weer: w, opwarmMin: opwarm(), plaatsNaam: p.plaats && window.PLWeer ? PLWeer.naam(p.plaats) : null });
    return '<div class="plw-form">' +
      '<div class="plw-w">' + (p._waar === 'voertuig' ? 'Hoort bij <b>' + esc(p._naam) + '</b> in Mijn voertuigen.' : 'Staat op dit toestel.') + '</div>' +
      '<div class="plw-blok"><div class="plw-bh">📍 Plaats voor het weer</div>' +
      '<select id="plw_plaats" onchange="PLWinter._wijzig()"><option value="">— kies de dichtstbijzijnde stad —</option>' +
      plaatsen.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (p.plaats === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>' +
      '<div class="plw-klein">Een stad, niet je adres. Je telefoon geeft geen locatie door; het weer komt van Open-Meteo, via onze server.</div></div>' +
      '<div class="plw-blok"><div class="plw-bh">🛞 Banden</div>' + keuzeRij('banden', p.banden) +
      '<div class="plw-l">Symbool op de zijkant</div>' + keuzeRij('banden_alpine', p.banden_alpine) +
      '<div class="plw-2"><label>DOT (week + jaar)<input id="plw_banden_dot" inputmode="numeric" maxlength="4" placeholder="4521" value="' + esc(p.banden_dot || '') + '"></label>' +
      '<label>Profiel (mm)<input id="plw_banden_mm" type="number" step="0.5" min="0" max="15" placeholder="6" value="' + esc(p.banden_mm == null ? '' : p.banden_mm) + '"></label></div>' +
      '<div class="plw-klein">De DOT-code staat in een ovaal op de zijkant: de laatste vier cijfers. 4521 = week 45 van 2021.</div>' +
      '<div id="plwTabel">' + bandenTabel(p.banden, w ? w.dagen : null) + '</div>' +
      '<div class="plw-klein">Een model op basis van bandentests (ADAC, TÜV): de richting en de orde van grootte, geen meting. OBD ziet je banden niet. Het omslagpunt van 7 °C is een vuistregel.</div></div>' +
      '<div class="plw-blok"><div class="plw-bh">💧 Ruitensproeiervloeistof</div>' + keuzeRij('sproeier', p.sproeier) +
      '<div class="plw-2" id="plwSproeierWinter"' + (p.sproeier === 'winter' ? '' : ' hidden') + '><label>Beschermd tot (°C)<input id="plw_sproeier_tot" type="number" min="-60" max="0" placeholder="−20" value="' + esc(p.sproeier_tot == null ? '' : p.sproeier_tot) + '"></label>' +
      '<label>Bijgevuld op<input id="plw_sproeier_datum" type="date" value="' + esc(p.sproeier_datum || '') + '"></label></div>' +
      '<div class="plw-klein">OBD kan de vloeistof niet meten. Met wat je hier invult en de verwachting waarschuwt de app vóór het gaat vriezen.</div></div>' +
      (adv.length ? '<div class="plw-blok"><div class="plw-bh">Wat de app nu ziet</div>' + adv.map(function (a) {
        return '<div class="plw-adv ' + a.ernst + '"><div class="plw-adv-tx"><b>' + esc(a.titel) + '</b><div>' + esc(a.tekst) + '</div><small>Op basis van ' + esc(a.bron) + '</small></div></div>';
      }).join('') + '</div>' : '') +
      '<div id="plwFout"></div><div class="plw-knoppen"><button type="button" class="plw-k hoofd" onclick="PLWinter._bewaar()">Bewaren</button>' +
      '<button type="button" class="plw-k" onclick="PLZonder.sluit()">Annuleren</button></div></div>';
  }
  function formWaarden() {
    var el = function (id) { return document.getElementById(id); };
    var radio = function (n) { var x = document.querySelector('input[name="plw_' + n + '"]:checked'); return x ? x.value : null; };
    return {
      plaats: (el('plw_plaats') || {}).value || null, banden: radio('banden'), banden_alpine: radio('banden_alpine'),
      banden_dot: (el('plw_banden_dot') || {}).value, banden_mm: (el('plw_banden_mm') || {}).value,
      sproeier: radio('sproeier'), sproeier_tot: (el('plw_sproeier_tot') || {}).value, sproeier_datum: (el('plw_sproeier_datum') || {}).value
    };
  }

  function open() {
    if (!window.PLZonder || typeof PLZonder._blad !== 'function') { console.warn('PLWinter: PLZonder._blad ontbreekt — geen venster'); return; }
    var nu = Date.now();
    zorgCss();
    PLZonder._blad('❄️ Winterprofiel', formulier(profiel(), nu));
  }
  // Bij een keuze: de bandentabel en het sproeierdeel meteen bij.
  function wijzig() {
    var f = formWaarden(), nu = Date.now();
    var sw = document.getElementById('plwSproeierWinter');
    if (sw) sw.hidden = f.sproeier !== 'winter';
    var c = f.plaats && window.PLWeer ? PLWeer.laatst(f.plaats) : null;
    var w = c ? PLWeer._kern.samenvat(c.dagen, nu) : null;
    var t = document.getElementById('plwTabel');
    if (t) t.innerHTML = bandenTabel(f.banden, w ? w.dagen : null);
  }
  async function bewaarForm() {
    var r = controleer(formWaarden()), foutEl = document.getElementById('plwFout');
    if (r.fout) { if (foutEl) foutEl.innerHTML = '<div class="plw-fout">' + esc(r.fout) + '</div>'; return; }
    var oud = profiel().plaats, sleutel = seizoen(Date.now()).sleutel;
    try {
      // Wie zijn profiel bewaarde, heeft de banner van dit seizoen gezien —
      // in dezelfde opslag, niet als tweede verzoek.
      await bewaar(Object.assign({}, r.velden, { winter_gezien: sleutel }));
      schrijf(OPSLAG.gezien, sleutel);
      PLZonder.sluit();
      if (r.velden.plaats && (r.velden.plaats !== oud || !PLWeer.laatst(r.velden.plaats))) await PLWeer.haal(r.velden.plaats, { forceer: true });
      teken(true);
    } catch (e) {
      console.warn('PLWinter: winterprofiel niet bewaard', e);
      if (foutEl) foutEl.innerHTML = '<div class="plw-fout">Niet bewaard: ' + esc(e && e.message || e) + '</div>';
    }
  }
  async function later() {
    var b = staat(Date.now()).banner;
    if (b) await zetGezien(b.sleutel);
    teken(true);
  }
  function weg(id, duur) {
    var w = lees(OPSLAG.weg) || {}, nu = Date.now();
    w[id] = duur === 'seizoen' ? { seizoen: seizoen(nu).sleutel } : { tot: nu + CFG.wegWeerMs };
    schrijf(OPSLAG.weg, w);
    teken(true);
  }

  // ════════════════════════════════════════════════════════════════
  //  STIJL
  // ════════════════════════════════════════════════════════════════
  var _css = false;
  function zorgCss() {
    if (_css || typeof document === 'undefined' || !document.head) return;
    _css = true;
    var s = document.createElement('style');
    s.id = 'plWinterCss';
    s.textContent =
      '#plWinterKaart .plw{margin:0 0 12px;padding:12px 13px;border-radius:14px;border:1px solid var(--bd);background:var(--sur2);font-family:var(--f);color:var(--tx)}' +
      '#plWinterKaart .plw-banner{display:flex;gap:12px;align-items:flex-start;background:var(--bls);border-color:var(--bl)}' +
      '#plWinterKaart .plw-banner.zomer{background:var(--yws);border-color:var(--yw)}' +
      '.plw-ban-ic{font-size:26px;line-height:1}.plw-ban-tx{flex:1;min-width:0}' +
      '.plw-kop{font-size:14px;font-weight:800;color:var(--tx)}.plw-sub{font-size:12.5px;color:var(--tx2);margin:3px 0 10px;line-height:1.4}' +
      '.plw-rij1{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}' +
      '.plw-plaats{border:1px solid var(--bd);background:var(--sur);color:var(--tx2);border-radius:999px;padding:4px 10px;font:600 12px var(--f);cursor:pointer;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.plw-dagen{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}' +
      '.plw-dag{display:flex;flex-direction:column;align-items:center;gap:1px;padding:7px 4px;border-radius:10px;background:var(--sur);border:1px solid var(--bd);min-width:0}' +
      '.plw-dag.vorst{border-color:var(--bl);background:var(--bls)}' +
      '.plw-dag .n{font-size:11px;font-weight:700;color:var(--tx3);text-transform:capitalize}.plw-dag .i{font-size:18px;line-height:1.3}' +
      '.plw-dag .t{font-size:12px;color:var(--tx2);font-variant-numeric:tabular-nums}.plw-dag .t b{color:var(--tx)}' +
      '.plw-leeg{display:flex;justify-content:space-between;width:100%;box-sizing:border-box;padding:9px 11px;border-radius:10px;border:1px dashed var(--bd2);background:var(--sur);color:var(--tx2);font:600 12.5px var(--f);cursor:pointer;text-align:left}' +
      '.plw-leeg.stil{cursor:default;font-weight:500}' +
      '.plw-adv{display:flex;gap:8px;align-items:flex-start;margin-top:9px;padding:9px 10px;border-radius:10px;background:var(--sur);border:1px solid var(--bd);border-left:4px solid var(--bl)}' +
      '.plw-adv.rood{border-left-color:var(--rd);background:var(--rds)}.plw-adv.oranje{border-left-color:var(--or);background:var(--ors)}' +
      '.plw-adv-tx{flex:1;min-width:0;font-size:12.5px;line-height:1.4;color:var(--tx2)}.plw-adv-tx b{display:block;color:var(--tx);font-size:13px;margin-bottom:2px}' +
      '.plw-adv-tx small{display:block;margin-top:4px;font-size:11px;color:var(--tx3)}' +
      '.plw-x{flex:0 0 auto;width:28px;height:28px;border-radius:8px;border:1px solid var(--bd);background:var(--sur);color:var(--tx3);cursor:pointer}' +
      '.plw-bij{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font:500 11.5px var(--f);color:var(--tx3)}' +
      '.plw-ver{border:1px solid var(--bd);background:var(--sur);color:var(--tx2);border-radius:999px;padding:4px 10px;font:600 12px var(--f);cursor:pointer}' +
      '.plw-ver[disabled]{opacity:.6;cursor:default}' +
      '.plw-link{display:flex;justify-content:space-between;width:100%;margin-top:9px;padding:0;border:0;background:none;color:var(--bl);font:700 12.5px var(--f);cursor:pointer}' +
      '.plw-knoppen{display:flex;gap:8px;flex-wrap:wrap}' +
      '.plw-k{padding:8px 13px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:700 13px var(--f);cursor:pointer}' +
      '.plw-k.hoofd{background:var(--blv);border-color:var(--blv);color:#fff}' +
      '.plw-form{font-family:var(--f);color:var(--tx)}.plw-w{font-size:12.5px;color:var(--tx2);margin-bottom:10px}' +
      '.plw-blok{padding:11px 12px;border-radius:12px;background:var(--sur);border:1px solid var(--bd);margin-bottom:10px}' +
      '.plw-bh{font-size:13px;font-weight:800;margin-bottom:8px}.plw-l{font-size:12px;font-weight:700;color:var(--tx2);margin:9px 0 5px}' +
      '.plw-klein{font-size:11.5px;color:var(--tx3);margin-top:6px;line-height:1.4}' +
      '.plw-form select,.plw-form input[type=number],.plw-form input[type=date],.plw-form input:not([type]){width:100%;box-sizing:border-box;padding:8px 9px;border-radius:9px;border:1px solid var(--bd2);background:var(--sur2);color:var(--tx);font:500 14px var(--f)}' +
      '.plw-2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.plw-2[hidden]{display:none}.plw-2 label{font-size:12px;font-weight:700;color:var(--tx2);display:flex;flex-direction:column;gap:4px}' +
      '.plw-chips{display:flex;flex-wrap:wrap;gap:6px}.plw-chip{position:relative}' +
      '.plw-chip input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}' +
      '.plw-chip span{display:inline-block;padding:7px 11px;border-radius:999px;border:1px solid var(--bd2);background:var(--sur2);font-size:12.5px;font-weight:700;color:var(--tx2)}' +
      '.plw-chip input:checked+span{background:var(--blv);border-color:var(--blv);color:#fff}.plw-chip input:focus-visible+span{outline:2px solid var(--bl);outline-offset:2px}' +
      '.plw-fout{margin:0 0 10px;padding:9px 10px;border-radius:10px;background:var(--rds);border:1px solid var(--rd);font-size:12.5px;color:var(--tx)}' +
      '.plw-bt{margin-top:11px}.plw-bt-rij{display:grid;grid-template-columns:78px 1fr;gap:8px;align-items:center;margin-bottom:6px}' +
      '.plw-bt-l{font-size:11.5px;font-weight:700;color:var(--tx2);line-height:1.15}.plw-bt-l small{display:block;font-size:10px;color:var(--bl);font-weight:800}' +
      '.plw-bt-balk{position:relative;height:14px;border-radius:7px;opacity:.55}.plw-bt-rij.mijn .plw-bt-balk{opacity:1;height:18px;border-radius:9px;box-shadow:0 0 0 2px var(--bl)}' +
      '.plw-bt-7{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--tx)}' +
      '.plw-bt-dot{position:absolute;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#fff;border:2px solid var(--tx)}' +
      '.plw-bt-as{position:relative;height:16px;margin-left:86px;font-size:10.5px;color:var(--tx3)}.plw-bt-as span{position:absolute;transform:translateX(-50%)}' +
      '.plw-bt-as span:first-child{left:0;transform:none}.plw-bt-as .r{right:0;transform:none}.plw-bt-as .o{font-weight:800;color:var(--tx)}' +
      '.plw-bt-leg{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:4px;font-size:11px;color:var(--tx3)}' +
      '.plw-bt-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:-6px}.plw-bt-leg i.d{border-radius:50%;background:#fff;border:2px solid var(--tx);width:7px;height:7px}';
    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════════
  //  START
  // ════════════════════════════════════════════════════════════════
  /* Bij de eerste opstart altijd vers (31-10-2026), daarna zodra de
     verwachting een uur oud is of van gisteren. Op het moment van start()
     is het profiel er vaak nog niet (inloggen, Mijn voertuigen laden): dan
     telt de eerste keer dat er wél een plaats is als de opstart. */
  var _opstartGehaald = false;
  function ververs() {
    var p = profiel();
    if (!p.plaats || !window.PLWeer || isDemo()) return;
    var eerste = !_opstartGehaald;
    _opstartGehaald = true;
    PLWeer.haal(p.plaats, eerste ? { forceer: true } : undefined).then(function () { teken(); })
      .catch(function (e) { console.warn('PLWinter: weer niet ververst', e); });
  }
  // De knop: altijd opnieuw halen, ook binnen het uur.
  function verversNu() {
    var p = profiel();
    if (_vers || !p.plaats || !window.PLWeer) return Promise.resolve(null);
    _vers = true; teken(true);
    return PLWeer.haal(p.plaats, { forceer: true })
      .catch(function (e) { console.warn('PLWinter: weer niet ververst', e); return null; })
      .then(function (c) { _vers = false; teken(true); return c; });
  }
  function start() {
    teken(true);
    ververs();
    setInterval(function () { try { teken(); } catch (e) { console.warn('PLWinter: kaart niet getekend', e); } }, 2000);
    // Tot er een plaats is elke 10 s (de opstart), daarna elk kwartier;
    // PLWeer haalt pas opnieuw als het een uur oud is of van gisteren. Een
    // app die uit de achtergrond terugkomt, kijkt meteen.
    var wacht = setInterval(function () { if (_opstartGehaald) clearInterval(wacht); else ververs(); }, 10 * 1000);
    setInterval(ververs, 15 * 60 * 1000);
    try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') ververs(); }); }
    catch (e) { console.warn('PLWinter: geen zichtbaarheidsluisteraar — het weer ververst elk kwartier', e); }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  window.PLWinter = {
    open: open,
    teken: teken,
    profiel: profiel,
    WINTER_KEUZES: WINTER_KEUZES,
    _wijzig: wijzig,
    _bewaar: bewaarForm,
    _later: later,
    _weg: weg,
    _ververs: verversNu,
    _kern: { seizoen: seizoen, bannerNodig: bannerNodig, adviezen: adviezen, bandenStand: bandenStand, bandenTabel: bandenTabel,
      opwarmMin: opwarmMin, controleer: controleer, dotLeeftijd: dotLeeftijd, klaarVoorWinter: klaarVoorWinter, CFG: CFG }
  };
})();
