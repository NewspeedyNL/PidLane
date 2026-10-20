/* ════════════════════════════════════════════════════════════════════
   pidlane-winterrit.js — PLWinterRit: wat de ritten in de winter zeggen
   ────────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (20-10-2026, #557/#558)

   Een andere OBD-app ziet één rit. Wat in de winter misgaat, zie je pas
   aan het patroon: een motor die rit na rit nooit warm wordt (vocht en
   brandstof in de olie, bij een diesel een roetfilter dat niet schoon
   brandt), of een koelwater dat op de snelweg terugzakt — het teken van
   een thermostaat die open blijft hangen, en juist in de kou zichtbaar.

   PASSIEF. Alles komt uit de ritten die PLGarage al vastlegt (kp_rit), met
   de kenmerken die PLConditie per rit in rit.extra.cd zet: kk (koude
   start), ow (opwarmtijd), wt (seconden op temperatuur), kz (laagste
   koelwater op de snelweg na het opwarmen), bt (buitentemperatuur). Geen
   busverkeer, geen test die de klant moet starten.

   ALLEEN DE KOUDE KANT. Beide oordelen gaan over te koud, nooit over te
   warm. Een kenveldthermostaat (PLKenmerk) draait bij lage belasting rond
   105 °C en op de snelweg rond 90 °C: dat zakt nooit onder KZ_GRENS, en
   wordt hier dus niet afgekeurd. Te warm blijft het werk van
   PLKenmerk.koelwater() in PLGarage.advies().

   Elk advies zegt waar het op rust: "afgeleid uit N ritten". Puur;
   test-winterrit.js toetst het met vm. Laadt vóór pidlane-garage.js.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    venster: 10,          // de laatste N ritten
    maxDagen: 28,         // ouder telt niet mee: het gaat om nu
    minRitten: 6,         // daaronder geen oordeel
    nooitWarmDeel: 0.6,   // zo'n deel van de ritten nooit echt warm → advies
    warmMinS: 600,        // minder dan 10 minuten op temperatuur = nooit echt warm
    warmGrens: 75,        // °C: ritten van vóór wt/kz: hoogste koelwater eronder = nooit warm
    koud: 10,             // °C buiten: vanaf hier telt het als kou
    kzGrens: 75,          // °C: zakt het koelwater op de snelweg hieronder, dan hangt de thermostaat open
    kzMin: 2,             // zo vaak gezien voor een oordeel
    langS: 1200,          // een rit van 20 minuten hoort warm te worden
    langMin: 2
  };

  function getal(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function cd(r) { return (r && r.extra && r.extra.cd) || {}; }
  function mediaan(l) {
    var a = l.filter(function (x) { return getal(x) !== null; }).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function recent(ritten, nu) {
    return (Array.isArray(ritten) ? ritten : []).filter(function (r) {
      var t = r && Date.parse(r.start);
      return isFinite(t) && (!nu || nu - t <= CFG.maxDagen * 864e5);
    }).sort(function (a, b) { return Date.parse(b.start) - Date.parse(a.start); }).slice(0, CFG.venster);
  }
  /* Werd de motor deze rit echt warm? true/false, null = niet te zeggen. */
  function warmGeweest(r) {
    var c = cd(r);
    if (getal(c.wt) !== null) return c.wt >= CFG.warmMinS;
    if (getal(r.max_koelwater) !== null) return r.max_koelwater >= CFG.warmGrens;
    return null;
  }
  function inDeKou(ritten, nu) {
    var bt = mediaan(ritten.map(function (r) { return getal(cd(r).bt); }));
    if (bt !== null) return { koud: bt < CFG.koud, bt: bt, bron: 'gemeten' };
    var m = new Date(nu).getMonth();
    return { koud: m >= 10 || m <= 2, bt: null, bron: 'seizoen' };
  }

  /* #557 — veel ritten waarin de motor nooit warm wordt, in de kou.
     ctx: { nu, diesel }. Geeft één advies voor PLGarage.advies(), of null. */
  function korteRitten(ritten, ctx) {
    ctx = ctx || {};
    var rs = recent(ritten, ctx.nu);
    var oordeel = rs.map(warmGeweest).filter(function (x) { return x !== null; });
    if (oordeel.length < CFG.minRitten) return null;
    var nooit = oordeel.filter(function (x) { return !x; }).length;
    if (nooit / oordeel.length < CFG.nooitWarmDeel) return null;
    var k = inDeKou(rs, ctx.nu);
    if (!k.koud) return null;
    var kou = k.bt !== null ? ' bij gemiddeld ' + Math.round(k.bt) + ' °C buiten' : '';
    return {
      soort: 'korteritten',
      titel: nooit + ' van je laatste ' + oordeel.length + ' ritten werd de motor niet warm',
      tekst: (ctx.diesel
        ? 'Korte ritten in de kou' + kou + ': het roetfilter krijgt geen kans om schoon te branden (daarvoor moet hij zo’n 15–20 minuten doorrijden), en diesel komt in de olie. '
        : 'Korte ritten in de kou' + kou + ': vocht en brandstof blijven in de olie, en de accu laadt nauwelijks bij. ') +
        'Rijd deze week één keer 20 minuten of meer door, liefst over de snelweg. Rijd je vooral zo, laat de olie dan eerder verversen dan het boekje zegt.',
      bron: 'afgeleid uit ' + oordeel.length + ' ritten' + (k.bron === 'gemeten' ? ' en de buitentemperatuur die de auto mat' : '')
    };
  }

  /* #558 — de thermostaat, over alle ritten. ctx: { nu, codes }.
     Twee tekens, elk minstens twee keer gezien:
       • het koelwater zakt op de snelweg onder kzGrens nadat het warm was;
       • een rit van 20 minuten of langer wordt niet warm.
     P0128 in de codes van een rit versterkt het, ontbreken zegt niets (veel
     ECU's zetten hem laat). Geeft één advies, of null. */
  function thermostaat(ritten, ctx) {
    ctx = ctx || {};
    var rs = recent(ritten, ctx.nu);
    var zakt = rs.filter(function (r) { var z = getal(cd(r).kz); return z !== null && z < CFG.kzGrens; });
    // Hier telt alleen nooit-op-temperatuur: een rit van 20 minuten die er in
    // de vrieskou 12 over deed om warm te worden, is geen teken.
    var lang = rs.filter(function (r) {
      return getal(r.duur_s) !== null && r.duur_s >= CFG.langS && getal(r.max_koelwater) !== null && r.max_koelwater < CFG.warmGrens;
    });
    var p0128 = rs.some(function (r) { return Array.isArray(r.codes) && r.codes.indexOf('P0128') >= 0; });
    var teken = [];
    if (zakt.length >= CFG.kzMin) teken.push('op de snelweg zakte het koelwater ' + zakt.length + '× terug, tot ' + Math.round(Math.min.apply(null, zakt.map(function (r) { return cd(r).kz; }))) + ' °C');
    if (lang.length >= CFG.langMin) teken.push(lang.length + ' ritten van 20 minuten of langer werden niet warm');
    if (!teken.length && !(p0128 && (zakt.length || lang.length))) return null;
    if (!teken.length) teken.push('de motorregeling meldde P0128 (koelwater te laag)');
    else if (p0128) teken.push('en de motorregeling meldde P0128');
    return {
      soort: 'thermostaat',
      titel: 'Thermostaat blijft mogelijk open hangen',
      tekst: 'Een gezonde motor blijft op temperatuur, ook in de kou: ' + teken.join('; ') + '. Een thermostaat die openblijft kost brandstof, de kachel blijft lauw en de motor slijt sneller. Laat hem nakijken; het is meestal geen dure reparatie.',
      bron: 'afgeleid uit ' + rs.length + ' ritten'
    };
  }

  window.PLWinterRit = { korteRitten: korteRitten, thermostaat: thermostaat, CFG: CFG, _kern: { warmGeweest: warmGeweest, recent: recent } };
})();
