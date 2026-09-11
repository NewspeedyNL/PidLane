// ══════════════════════════════════════════════════════════════════
// pidlane-schil.js — welke APK draait dit eigenlijk? (#18)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT ER IS, EN HET IS TWEE KEER OP ÉÉN DAG MISGEGAAN.
//
// Op 11-09-2026 stond de vraag twee keer op tafel: *draait deze meting op de
// nieuwe schil of op de oude?* De eerste keer bij de meetdienst zelf, de
// tweede keer bij de wake lock. Beide keren was het antwoord niet uit het
// testrunverslag te halen, want daar staan alleen `TESTRUN_VERSIE` en
// `APP_VERSION` in — en die twee zijn op elke APK gelijk, omdat ze uit de
// webpagina komen en niet uit de schil.
//
// Dat is geen schoonheidsfoutje. Een native wijziging zit ALLEEN in de APK.
// Draai je de nieuwe pagina op een oude schil, dan meet je de oude code
// terwijl het verslag er nieuw uitziet, en dat is een hele rit voor niets.
// De build-workflow schrijft `apk/version.json` naar R2 met precies dat doel —
// het commentaar daar zegt letterlijk *"dat was precies wat vandaag ontbrak
// toen de vraag was of het toestel de nieuwe APK had"* — maar de APP keek er
// nooit in.
//
// WAT DEZE MODULE DOET. Twee getallen naast elkaar leggen:
//
//   bouw()      de versionCode van de schil waar je IN draait. Komt van
//               Capacitor App.getInfo(); in een browser bestaat hij niet.
//   nieuwste()  de versionCode die de Worker uit R2 serveert (/version.json),
//               dus wat je zou krijgen als je nu zou downloaden.
//
// Lopen die uiteen, dan is de schil verouderd en zegt blok 5 dat — vóór de
// rit, in plaats van erna.
//
// WAT HIJ NIET DOET. Hij update niets en hij houdt niets tegen. Een oude schil
// is geen fout: hij meet gewoon iets anders dan je denkt, en dát is wat er
// gemeld hoort te worden.
//
// NIET-GEMETEN IS GEEN NUL, ook hier. Is er geen schil (browser, PWA) of
// antwoordt de Worker niet, dan is het antwoord `null` met een reden erbij, en
// nooit een getal dat toevallig klopt.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var _info = null;        // wat App.getInfo() teruggaf
  var _infoReden = 'nog niet opgevraagd';
  var _nieuwste = null;    // wat /version.json zei
  var _nieuwsteReden = 'nog niet opgevraagd';

  function _plug() {
    try {
      var c = window.Capacitor;
      if (!c || !c.Plugins) return null;
      return c.Plugins.App || null;
    } catch (e) {
      console.warn('schil: Capacitor-bridge niet leesbaar', e);
      return null;
    }
  }

  /* De schil uitlezen. Gebeurt één keer bij het laden: App.getInfo() is een
     lokale aanroep zonder netwerk, en het antwoord verandert niet zolang de
     app draait. De kop van het testrunverslag wordt synchroon opgebouwd, dus
     het antwoord moet er tegen die tijd al zijn. */
  function _leesSchil() {
    var p = _plug();
    if (!p || typeof p.getInfo !== 'function') {
      _infoReden = 'geen Capacitor-schil (browser of PWA)';
      return Promise.resolve(null);
    }
    return Promise.resolve(p.getInfo())
      .then(function (i) {
        _info = i || null;
        _infoReden = _info ? 'gelezen' : 'App.getInfo() gaf niets terug';
        return _info;
      })
      .catch(function (e) {
        // Geen stille catch: zonder dit getal weet niemand meer welke schil
        // een meting heeft opgeleverd, en dat is precies wat deze module komt
        // repareren.
        console.warn('schil: App.getInfo() mislukt — dan staat er geen build in het verslag', e);
        _infoReden = 'App.getInfo() gaf een fout: ' + (e && e.message ? e.message : e);
        return null;
      });
  }

  /* De versionCode van de draaiende schil. Capacitor noemt dit `build` en
     levert hem als tekst; Android kent er alleen een geheel getal. */
  function bouw() {
    if (!_info) return null;
    var b = parseInt(_info.build, 10);
    return isFinite(b) ? b : null;
  }

  /* De regel voor de kop van het verslag. Altijd één regel, en altijd
     eerlijk over wat er niet bekend is. */
  function regel() {
    if (!_plug()) return 'geen APK — dit is de webpagina';
    var b = bouw();
    if (b === null) return 'onbekend (' + _infoReden + ')';
    return 'build ' + b + (_info.version ? ' (' + _info.version + ')' : '');
  }

  /* Wat er in R2 ligt. Eén keer ophalen en bewaren: dit verandert alleen als
     er gebouwd wordt, en blok 5 kan er meermaals naar vragen. */
  function haalNieuwste(opnieuw) {
    if (_nieuwste && !opnieuw) return Promise.resolve(_nieuwste);
    if (typeof window.plFetch !== 'function') {
      _nieuwsteReden = 'plFetch ontbreekt';
      return Promise.resolve(null);
    }
    return window.plFetch('/version.json', { geenToken: true })
      .then(function (r) {
        if (!r || !r.ok) { _nieuwsteReden = 'de server gaf ' + (r ? r.status : 'geen antwoord'); return null; }
        return r.json();
      })
      .then(function (j) {
        if (!j) return null;
        _nieuwste = j;
        _nieuwsteReden = 'gelezen';
        return j;
      })
      .catch(function (e) {
        console.warn('schil: /version.json niet opgehaald — dan valt er niets te vergelijken', e);
        _nieuwsteReden = 'niet bereikbaar: ' + (e && e.message ? e.message : e);
        return null;
      });
  }

  /* Hoeveel builds loopt deze schil achter? null als een van beide getallen
     ontbreekt — dat is iets anders dan nul, en het verschil is de hele reden
     dat deze module bestaat. */
  function achterstand() {
    var hier = bouw();
    var daar = _nieuwste ? parseInt(_nieuwste.versionCode, 10) : NaN;
    if (hier === null || !isFinite(daar)) return null;
    return daar - hier;
  }

  try {
    _leesSchil();
  } catch (e) {
    console.warn('schil: uitlezen niet gestart', e);
  }

  window.PLSchil = {
    bouw: bouw,
    regel: regel,
    info: function () { return _info; },
    reden: function () { return _infoReden; },
    nieuwste: function () { return _nieuwste; },
    nieuwsteReden: function () { return _nieuwsteReden; },
    haalNieuwste: haalNieuwste,
    achterstand: achterstand,
    // Voor test-schil.js: de uitlezing opnieuw aftrappen zonder de pagina te
    // herladen, en de twee bronnen los kunnen zetten.
    _lees: _leesSchil,
    _zetNieuwste: function (j) { _nieuwste = j; _nieuwsteReden = j ? 'gezet' : 'gewist'; }
  };
})();
