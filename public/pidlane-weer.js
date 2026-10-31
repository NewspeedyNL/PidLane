/* ════════════════════════════════════════════════════════════════════
   pidlane-weer.js — PLWeer: de weersverwachting als invoer (#556)
   ────────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (20-10-2026)

   Elke telefoon heeft al een weerapp; een weerlijstje is hier niet het
   product. Het weer is de invoer voor één soort zin die andere OBD-apps
   niet zeggen: "vannacht −4 °C en jouw ruitensproeier is zomervloeistof".
   Vooruit kijken in plaats van achteraf meten. Wat er met het weer gedaan
   wordt staat in pidlane-winter.js; hier alleen ophalen en samenvatten.

   LOCATIEVRIJ. De app vraagt sinds 21-08-2026 geen positie op
   (test-geen-gps.js, Play Data safety). De klant kiest een plaats uit
   PLAATSEN — de dichtstbijzijnde stad, niet zijn adres — en alleen dat id
   gaat naar de Worker (/weer). De coördinaten staan in worker.js
   (WEER_PLAATSEN), en de vraag aan Open-Meteo gaat van daar, zodat het
   IP-adres van de klant er niet aankomt. test-weer.js vergelijkt de twee
   lijsten.

   PUUR EN NIET PUUR. vooruit(), samenvat() en dagNaam() zijn puur;
   test-weer.js toetst ze met vm. haal() raakt plFetch en localStorage.
   Een verwachting is een uur geldig (CACHE_MS), net als de randcache van
   de Worker, en nooit langer dan de dag waarop hij gehaald is. Geen weer (offline, niet ingelogd, demo) is geen fout: dan
   valt de winterkaart terug op de datum.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // [id, naam] — zelfde lijst als WEER_PLAATSEN in worker.js.
  var PLAATSEN = [
    ['alkmaar', 'Alkmaar'], ['almere', 'Almere'], ['amersfoort', 'Amersfoort'], ['amsterdam', 'Amsterdam'],
    ['apeldoorn', 'Apeldoorn'], ['arnhem', 'Arnhem'], ['assen', 'Assen'], ['breda', 'Breda'],
    ['denbosch', '’s-Hertogenbosch'], ['denhaag', 'Den Haag'], ['denhelder', 'Den Helder'], ['deventer', 'Deventer'],
    ['dordrecht', 'Dordrecht'], ['drachten', 'Drachten'], ['eindhoven', 'Eindhoven'], ['emmen', 'Emmen'],
    ['enschede', 'Enschede'], ['goes', 'Goes'], ['groningen', 'Groningen'], ['haarlem', 'Haarlem'],
    ['harderwijk', 'Harderwijk'], ['heerlen', 'Heerlen'], ['hoorn', 'Hoorn'], ['leeuwarden', 'Leeuwarden'],
    ['leiden', 'Leiden'], ['lelystad', 'Lelystad'], ['maastricht', 'Maastricht'], ['middelburg', 'Middelburg'],
    ['nijmegen', 'Nijmegen'], ['roermond', 'Roermond'], ['rotterdam', 'Rotterdam'], ['tilburg', 'Tilburg'],
    ['utrecht', 'Utrecht'], ['venlo', 'Venlo'], ['zwolle', 'Zwolle'],
    ['aarlen', 'Aarlen'], ['antwerpen', 'Antwerpen'], ['brugge', 'Brugge'], ['brussel', 'Brussel'],
    ['gent', 'Gent'], ['hasselt', 'Hasselt'], ['leuven', 'Leuven'], ['luik', 'Luik'], ['namen', 'Namen']
  ];
  var NAAM = {}; PLAATSEN.forEach(function (p) { NAAM[p[0]] = p[1]; });

  var CFG = {
    dagen: 3,            // de strook op de winterkaart
    omslag: 7,           // °C: het omslagpunt zomer-/winterband
    warmband: 15,        // °C: boven deze dagtemperatuur slijt een winterband snel
    gladMin: 1,          // °C: laagste temperatuur waaronder neerslag glad kan worden
    gladNeerslag: 0.5,   // mm op die dag
    streng: -10          // °C: strenge vorst
  };
  var CACHE_MS = 3600 * 1000;
  var OPSLAG = 'pl_weer';
  var DAGNAAM = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

  function getal(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function lokaleDatum(nu) {
    var d = new Date(nu);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* De komende `n` dagen vanaf vandaag (lokale datum), in volgorde. Een
     verwachting van gisteren telt niet mee: die is voorbij. */
  function vooruit(dagen, nu, n) {
    var vandaag = lokaleDatum(nu);
    return (Array.isArray(dagen) ? dagen : []).filter(function (d) {
      return d && typeof d.datum === 'string' && d.datum >= vandaag && (getal(d.min) !== null || getal(d.max) !== null);
    }).sort(function (a, b) { return a.datum < b.datum ? -1 : 1; }).slice(0, n == null ? CFG.dagen : n);
  }

  /* Wat de winterregels van de komende dagen willen weten. null = geen
     bruikbare verwachting. */
  function samenvat(dagen, nu) {
    var d = vooruit(dagen, nu);
    if (!d.length) return null;
    var mins = d.map(function (x) { return getal(x.min); }).filter(function (x) { return x !== null; });
    var maxs = d.map(function (x) { return getal(x.max); }).filter(function (x) { return x !== null; });
    if (!mins.length) return null;
    var min = Math.min.apply(null, mins), max = maxs.length ? Math.max.apply(null, maxs) : null;
    var vorstDagen = mins.filter(function (x) { return x < 0; }).length;
    return {
      dagen: d,
      min: min,
      max: max,
      vorst: min < 0,
      streng: min <= CFG.streng,
      koudePeriode: vorstDagen >= 2,
      // Neerslag of sneeuw op een dag die rond het vriespunt komt.
      glad: d.some(function (x) {
        var m = getal(x.min);
        return m !== null && m <= CFG.gladMin && ((getal(x.neerslag) || 0) >= CFG.gladNeerslag || (getal(x.sneeuw) || 0) > 0);
      }),
      sneeuw: d.some(function (x) { return (getal(x.sneeuw) || 0) > 0; }),
      onderOmslag: min < CFG.omslag,
      // Elke dag warm: dan is een winterband de verkeerde band.
      warm: mins.every(function (x) { return x >= CFG.omslag; }) && maxs.length === d.length && maxs.every(function (x) { return x >= CFG.warmband; })
    };
  }

  function dagNaam(datum, nu) {
    var v = lokaleDatum(nu), m = lokaleDatum(nu + 864e5);
    if (datum === v) return 'vandaag';
    if (datum === m) return 'morgen';
    var p = String(datum).split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return isNaN(d) ? String(datum) : DAGNAAM[d.getDay()];
  }

  // ── Ophalen ─────────────────────────────────────────────────────────
  function lees() {
    try { var s = localStorage.getItem(OPSLAG); return s ? JSON.parse(s) : null; }
    catch (e) { console.warn('PLWeer: opgeslagen verwachting onleesbaar', e); return null; }
  }
  function schrijf(v) {
    try { localStorage.setItem(OPSLAG, JSON.stringify(v)); }
    catch (e) { console.warn('PLWeer: verwachting niet bewaard — wordt de volgende keer opnieuw gehaald', e); }
  }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }

  /* De laatst bekende verwachting voor deze plaats, ook als hij ouder is
     dan een uur — beter een verwachting van vanochtend dan geen. */
  function laatst(plaats) {
    var c = lees();
    return c && c.plaats === plaats && Array.isArray(c.dagen) ? c : null;
  }

  /* Moet de verwachting opnieuw? Ouder dan een uur, of van een andere dag
     (31-10-2026): de strook begint bij vandaag, en een verwachting van
     gisteren is een dag korter dan hij lijkt. Puur. */
  function verlopen(c, nu) {
    if (!c || !c.t) return true;
    return nu - c.t >= CACHE_MS || lokaleDatum(c.t) !== lokaleDatum(nu);
  }

  var _bezig = null;
  async function haal(plaats, opties) {
    opties = opties || {};
    if (!NAAM[plaats]) return null;
    var c = laatst(plaats);
    if (c && !opties.forceer && !verlopen(c, Date.now())) return c;
    if (isDemo() || typeof plFetch !== 'function') return c;
    if (_bezig) return _bezig;
    _bezig = (async function () {
      try {
        var r = await plFetch('/weer?plaats=' + encodeURIComponent(plaats));
        if (!r.ok) { console.warn('PLWeer: de server gaf ' + r.status + ' — de vorige verwachting blijft staan'); return c; }
        var d = await r.json();
        if (!d || !Array.isArray(d.dagen) || !d.dagen.length) { console.warn('PLWeer: lege verwachting'); return c; }
        var uit = { plaats: plaats, naam: NAAM[plaats], dagen: d.dagen, t: Date.now() };
        schrijf(uit);
        return uit;
      } catch (e) {
        console.warn('PLWeer: weer niet opgehaald — de vorige verwachting blijft staan', e);
        return c;
      } finally { _bezig = null; }
    })();
    return _bezig;
  }

  window.PLWeer = {
    PLAATSEN: PLAATSEN,
    naam: function (id) { return NAAM[id] || null; },
    haal: haal,
    laatst: laatst,
    CFG: CFG,
    verlopen: verlopen,
    _kern: { vooruit: vooruit, samenvat: samenvat, dagNaam: dagNaam, lokaleDatum: lokaleDatum, verlopen: verlopen }
  };
})();
