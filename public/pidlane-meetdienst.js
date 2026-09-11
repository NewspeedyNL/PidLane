// ══════════════════════════════════════════════════════════════════
// pidlane-meetdienst.js — de app-kant van de native meetdienst (#18)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OPGELOST WORDT, EN WAT NIET. Android zet een app die naar de
// achtergrond gaat na verloop van tijd helemaal stil. Twee metingen op de
// SM-S947B (Android 16) staan in het issue:
//
//   02-09, stationair            120 s weg, ~36 s doorgelopen,  ~84 s stil
//   09-09, rijdend, bus op 93%   182 s weg,  ~50 s doorgelopen, ~132 s stil
//
// Een foreground service houdt het PROCES uit de cached-toestand, en daarmee
// buiten het bereik van de freezer die dit veroorzaakt. Dat is richting 1 uit
// het issue. Maar het issue zet er zelf een voorbehoud bij, en dat voorbehoud
// staat overeind: Chromium knijpt een VERBORGEN pagina óók af, en dat doet hij
// op zichtbaarheid en niet op procesprioriteit. Tegen die tweede oorzaak doet
// een foreground service niets.
//
// DAAROM START DEZE MODULE NIET ALLEEN EEN DIENST, HIJ MEET WAT HIJ OPLEVERT.
// De dienst heeft een eigen hartslag in native code (PLMeetdienst.java); de
// app heeft er al één in pidlane-achtergrond.js. Twee hartslagen naast elkaar
// beantwoorden de vraag die met redeneren niet te beantwoorden was:
//
//   native stil, JS stil     het proces was bevroren — de dienst hielp niet
//   native loopt, JS stil    het proces leefde, de WEBVIEW lag stil: dan is
//                            dit niet genoeg en is picture-in-picture of een
//                            native meetlus de volgende stap
//   beide lopen              opgelost
//
// Zolang die meting er niet is, is elke keuze tussen die drie een gok — en
// precies dat is wat het issue sinds 27-08 openhoudt. Deze module is dus
// tegelijk de kandidaat-oplossing en het meetinstrument dat zegt of hij werkt.
//
// HET OORDEEL STAAT HIER EN NIET IN JAVA. De native kant levert ruwe getallen:
// wanneer begon de meting, wanneer vuurde de hartslag voor het laatst, hoe
// vaak, en wat was de grootste stilte. Wat dat BETEKENT wordt hier uitgerekend,
// met dezelfde staartregel als pidlane-achtergrond.js — en daarmee is het in
// node te toetsen zonder toestel. Twee plekken die hetzelfde uitrekenen is in
// dit project al drie keer een bug geweest.
//
// EN ALS ER GEEN NATIVE KANT IS. In de browser, in de PWA en in elke build van
// vóór deze ronde bestaat de plugin niet. Dan doet deze module niets en zegt
// hij dat ook: `beschikbaar()` is false en het oordeel is `gemeten: false` met
// de reden erbij. Niet-gemeten als nul lezen is de fout die #18 anderhalve week
// een verkeerd getal liet rapporteren; die maken we hier niet opnieuw.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Het tempo van de native hartslag staat in PLMeetdienst.java. Dit is de
  // waarde waarmee gerekend wordt als het rapport hem niet meestuurt — een
  // oude schil, bijvoorbeeld. Komt hij wél mee, dan wint die.
  var HARTSLAG_MS = 1000;
  // Zelfde grens als aan de JS-kant: onder twee slagen is een "stilte" niet van
  // de gewone speling van een timer te onderscheiden.
  var SLAGEN_MINIMAAL = 2;

  var _laatsteReden = null;   // waarom draait de dienst niet — voor het verslag
  var _draait = false;        // wat de native kant het laatst zei

  function _log(m, niveau) {
    try { if (typeof log === 'function') log(m, niveau || 'info'); }
    catch (e) { console.warn('meetdienstmelding niet in de app-log gezet', e); }
  }

  // De plugin, of null. Elke aanroep hieronder haalt hem opnieuw op: de
  // Capacitor-bridge is er niet noodzakelijk al op het moment dat dit bestand
  // laadt, en een eenmalig opgeslagen null zou de dienst voorgoed uitzetten.
  function _plug() {
    try {
      var c = window.Capacitor;
      if (!c || !c.Plugins) return null;
      return c.Plugins.PLMeetdienst || null;
    } catch (e) {
      console.warn('meetdienst: Capacitor-bridge niet leesbaar (#18)', e);
      return null;
    }
  }

  function beschikbaar() { return !!_plug(); }

  /* Is de dienst nu nodig? Dezelfde vraag als PLWake stelt, en met opzet
     hetzelfde antwoord: alleen bij een ECHTE adapterverbinding. In demo is er
     geen socket die Android kan opruimen en geen meting die doorloopt — dan
     zou dit een melding in de statusbalk zijn zonder iets eronder. */
  function nodig() {
    try {
      if (typeof connected === 'undefined' || !connected) return false;
      if (typeof demoMode !== 'undefined' && demoMode) return false;
      return true;
    } catch (e) {
      console.warn('meetdienst: verbindingsstatus onleesbaar (#18)', e);
      return false;
    }
  }

  /* Wat de native kant van zichzelf zegt. Wordt door blok 5 gelezen: zonder
     dit getal is "de dienst draait niet" niet te onderscheiden van "deze schil
     heeft er geen". */
  function status() {
    var p = _plug();
    if (!p) return Promise.resolve({ beschikbaar: false, draait: false, reden: _laatsteReden });
    return Promise.resolve(p.status())
      .then(function (r) { r = r || {}; _draait = !!r.draait; r.reden = _laatsteReden; return r; })
      .catch(function (e) {
        console.warn('meetdienst: status onbereikbaar (#18)', e);
        return { beschikbaar: true, draait: false, reden: 'status onbereikbaar' };
      });
  }

  function start() {
    var p = _plug();
    if (!p) { _laatsteReden = 'geen native meetdienst in deze schil'; return Promise.resolve(false); }
    /* De meldingpermissie eerst vragen, maar er niet op wachten. Zonder
       toestemming onderdrukt Android 13+ alleen de MELDING; de dienst draait
       door. Er op wachten zou het starten van de meting afhankelijk maken van
       een dialoog, en dan valt de meting stil om een reden die niets met meten
       te maken heeft. */
    try { vraagMelding(); } catch (e) { console.warn('meetdienst: meldingpermissie niet gevraagd (#18)', e); }
    return Promise.resolve(p.start())
      .then(function (r) {
        r = r || {};
        _draait = !!r.draait;
        _laatsteReden = r.reden || null;
        if (_draait) _log('🛰️ Meetdienst aan — de meting loopt door als je wegschakelt (#18)', 'info');
        else _log('⚠️ Meetdienst niet gestart: ' + _laatsteReden + ' — op de achtergrond valt de meting stil (#18)', 'warn');
        return _draait;
      })
      .catch(function (e) {
        // Geen stille catch: dit is precies de plek waar de meting ongemerkt
        // kan uitvallen, en dan is #18 terug in zijn oude, stille vorm.
        _draait = false;
        _laatsteReden = 'aanroep mislukt: ' + (e && e.message ? e.message : e);
        _log('⚠️ Meetdienst niet gestart (' + _laatsteReden + ') (#18)', 'warn');
        return false;
      });
  }

  function stop() {
    var p = _plug();
    if (!p) return Promise.resolve(false);
    return Promise.resolve(p.stop())
      .then(function () { _draait = false; _laatsteReden = 'gestopt'; return true; })
      .catch(function (e) {
        console.warn('meetdienst: stoppen mislukt (#18)', e);
        _laatsteReden = 'stoppen mislukt';
        return false;
      });
  }

  // Volg de verbinding. Eén plek die beslist of de dienst hoort te draaien,
  // en dat is dezelfde vraag als "is er een meting om door te laten lopen".
  function sync() {
    if (!_plug()) return Promise.resolve(false);
    return nodig() ? start() : stop();
  }

  /* De hartslagteller op nul, aan het begin van een afwezigheid. Wordt door
     pidlane-achtergrond.js aangeroepen op het moment dat de app verborgen
     raakt — dán loopt de app aantoonbaar nog. */
  function nulstel() {
    var p = _plug();
    if (!p) return Promise.resolve(false);
    return Promise.resolve(p.nulstel())
      .then(function (r) { _draait = !!(r && r.draait); return _draait; })
      .catch(function (e) { console.warn('meetdienst: nulstellen mislukt (#18)', e); return false; });
  }

  function rapport() {
    var p = _plug();
    if (!p) return Promise.resolve(null);
    return Promise.resolve(p.rapport())
      .then(function (r) { if (r) _draait = !!r.draait; return r || null; })
      .catch(function (e) { console.warn('meetdienst: rapport onbereikbaar (#18)', e); return null; });
  }

  /* ── het oordeel ────────────────────────────────────────────────
     Ruwe getallen in, betekenis uit. Alle tijden in het rapport staan op de
     elapsedRealtime-klok van Android: monotoon, en hij loopt door in deep
     sleep. Er wordt hier daarom uitsluitend met VERSCHILLEN gerekend.

     DE STAART TELT MEE, om dezelfde reden als aan de JS-kant: de hartslag
     stopt niet vanzelf op het moment dat de app terugkomt. Ontdooit het proces
     een fractie vóór het uitlezen, dan zit de bevriezing in `stilMs`; ontdooit
     het niet, dan zit hij juist in de staart tussen de laatste slag en nu.
     Beide gevallen zijn echt, en de grootste van de twee is het antwoord.
     Zonder deze regel meet de module soms nul terwijl het proces twee minuten
     bevroren was — afhankelijk van de volgorde van twee gebeurtenissen waar
     niemand invloed op heeft. */
  function _stilte(r) {
    var staart = r.nu - r.laatste;
    if (staart >= r.stilMs) return { ms: staart, van: r.laatste };
    return { ms: r.stilMs, van: r.stilVan };
  }

  function oordeel(r) {
    var leeg = { gemeten: false, reden: null, door: null, stil: null, na: null, slagen: null, hartslagMs: null };
    if (!r) { leeg.reden = 'geen native meetdienst in deze schil'; return leeg; }
    if (!r.draait) {
      // Draaide hij niet, dan zegt een teller van nul niets over de app: er
      // stond gewoon niets te tellen. Dat is iets anders dan "niets gebeurd".
      leeg.reden = 'de meetdienst draaide niet';
      return leeg;
    }
    if (!r.van || !r.laatste || r.nu < r.van) {
      leeg.reden = 'de teller is niet op nul gezet — er is geen meetvenster';
      return leeg;
    }
    var hb = (typeof r.hartslagMs === 'number' && r.hartslagMs > 0) ? r.hartslagMs : HARTSLAG_MS;
    var st = _stilte(r);
    var stilMs = st.ms >= SLAGEN_MINIMAAL * hb ? st.ms : 0;
    return {
      gemeten: true,
      reden: null,
      // Hoe lang het proces na het wegschakelen nog doorliep: de aanlooptijd.
      door: Math.round((stilMs ? st.van - r.van : r.nu - r.van) / 1000),
      // Hoe lang het werkelijk stillag.
      stil: Math.round(stilMs / 1000),
      // Wat er ná de langste stilte nog aan tijd overbleef. Meer dan een paar
      // seconden betekent dat het proces uit zichzelf weer ging lopen terwijl
      // de app nog verborgen was — dan werd er afgeknepen en niet bevroren.
      na: stilMs ? Math.round((r.nu - (st.van + stilMs)) / 1000) : 0,
      slagen: r.slagen,
      hartslagMs: hb
    };
  }

  /* De vergelijking waar deze hele ronde om draait: wat deed de native
     hartslag, en wat deed die van de WebView? `js` is de periode zoals
     pidlane-achtergrond.js hem vastlegt (met `stil` in seconden, of null). */
  function duiding(nat, js) {
    if (!nat || !nat.gemeten) return 'native niet gemeten (' + ((nat && nat.reden) || 'onbekend') + ')';
    var jsStil = (js && typeof js.stil === 'number') ? js.stil : null;
    var kern = 'native: ' + nat.door + ' s doorgelopen, ' + nat.stil + ' s stil (' + nat.slagen + ' slagen)';
    if (jsStil === null) return kern + ' — de JS-hartslag heeft niets gemeten, dus er valt niets naast te leggen';
    kern += '  |  webview: ' + jsStil + ' s stil';
    // De drempel is één native hartslag: korter dan dat is resolutie en geen
    // verschil. Boven die grens zeggen de twee klokken iets verschillends, en
    // dát is de uitkomst waar het issue om vraagt.
    var grens = Math.max(3, Math.round((nat.hartslagMs || HARTSLAG_MS) / 1000) * 3);
    if (nat.stil <= grens && jsStil <= grens)
      return kern + ' — beide liepen door: de meting overleeft het wegschakelen';
    if (nat.stil <= grens && jsStil > grens)
      return kern + ' — het PROCES liep door maar de WEBVIEW lag stil. Een foreground service is dan niet ' +
        'genoeg: dit is Chromium die een verborgen pagina afknijpt, en daar helpt picture-in-picture of een ' +
        'native meetlus tegen (#18, richting C)';
    if (nat.stil > grens && jsStil > grens)
      return kern + ' — allebei stil: het hele proces is bevroren, ondanks de meetdienst. Noteer merk, ' +
        'Android-versie en of de melding in de statusbalk stond (#18)';
    return kern + ' — de webview liep door terwijl de native hartslag stillag. Dat hoort niet te kunnen; ' +
      'noteer het, want dan meet een van de twee iets anders dan hij denkt (#18)';
  }

  // Volg het verbinden/verbreken, net als PLWake dat doet. Additief: de
  // bestaande setConn blijft doen wat hij deed.
  try {
    if (typeof setConn === 'function') {
      var _s = setConn;
      setConn = function (on) {
        var r = _s.apply(this, arguments);
        try { sync(); } catch (e) { console.warn('meetdienst: sync na setConn mislukt (#18)', e); }
        return r;
      };
      window.setConn = setConn;
    } else {
      console.warn('meetdienst: setConn ontbreekt — de dienst volgt de verbinding niet (#18)');
    }
  } catch (e) {
    console.warn('meetdienst: kon setConn niet volgen (#18)', e);
  }

  // Vraag de meldingpermissie (Android 13+). Geen poort: zonder toestemming
  // draait de dienst gewoon door, alleen de melding blijft dan onzichtbaar.
  function vraagMelding() {
    var p = _plug();
    if (!p || typeof p.vraagMelding !== 'function') return Promise.resolve(null);
    return Promise.resolve(p.vraagMelding())
      .catch(function (e) { console.warn('meetdienst: meldingpermissie niet gevraagd (#18)', e); return null; });
  }

  window.PLMeetdienst = {
    beschikbaar: beschikbaar,
    status: status,
    nodig: nodig,
    draait: function () { return _draait; },
    reden: function () { return _laatsteReden; },
    start: start,
    stop: stop,
    sync: sync,
    nulstel: nulstel,
    rapport: rapport,
    oordeel: oordeel,
    duiding: duiding,
    vraagMelding: vraagMelding,
    _grenzen: function () { return { hartslag: HARTSLAG_MS, slagenMinimaal: SLAGEN_MINIMAAL }; }
  };
})();
