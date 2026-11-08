/* ════════════════════════════════════════════════════════════════
   pidlane-rust.js — PLRust: schermtimers slapen als de app niet in beeld is
   ────────────────────────────────────────────────────────────────
   WAAROM (#691, 06-11-2026). Een paar timers verversen alleen wat er op het
   scherm staat (de rit-monitorchip, het bulk-dashboard, de monitorknop) en
   liepen elke seconde door, ook met het scherm uit of de app op de
   achtergrond. Elke tik maakt de processor wakker voor iets dat niemand ziet.

   WAT DIT DOET
     • PLRust.elke(ms, fn, naam) is setInterval, maar alleen zolang de app in
       beeld is. Gaat hij uit beeld, dan wordt de timer gewist — niet
       overgeslagen: een overgeslagen tik maakt de processor nog steeds wakker.
     • Komt de app terug in beeld, dan draait elke taak meteen één keer (het
       scherm klopt dan direct) en loopt de timer weer.
     • "Uit beeld" = document.visibilityState 'hidden', of de app inactief
       volgens Capacitor (appStateChange). Het tweede is een vangnet voor een
       WebView die zijn zichtbaarheid niet doorgeeft.

   TWEE SOORTEN (08-11-2026, #691 deel 2). Nagemeten met alle timers van de
   boot geteld (bproef-rust.js 4): zonder verbinding en uit beeld gingen er
   nog twintig af, `gear` en `telemetrie` elke 200 ms. Ze rekenen aan
   meetdata die er zonder verbinding niet is.
     • elke(ms, fn, naam): een schermtimer — loopt alleen in beeld.
     • meet(ms, fn, naam): een meettimer — loopt in beeld, én uit beeld
       zolang er een verbinding is (`connected`). Een rit met Maps ervoor
       meet dus gewoon door.
     • weg(taak): de taak definitief stoppen (een module die zelf stopt).
   Wordt er uit beeld verbonden (een automatische herverbinding), dan ziet
   één wekker van WEKKER_MS dat; setConn() roept verbinding() aan, zodat het
   meestal meteen gaat. Die wekker loopt alleen zolang er een slapende
   meettimer is en de app uit beeld is.

   WAT HIER NIET IN HOORT. De poll-lus zelf, de sessiehartslag naar de
   server en timers die een module alleen tijdens een handeling zet en zelf
   weer wist. De lijst wat er uit beeld nog mag tikken staat in
   bproef-rust.js (MAG_UIT_BEELD), met de reden per regel.

   PUUR. maak(omg) is de kern; omg geeft zet/wis/verborgen/verbonden.
   test-rust.js voert de kern met een nep-omg. Laadvolgorde: vroeg, vóór elke
   module die PLRust bij het laden aanroept.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var WEKKER_MS = 10000;

  function maak(omg) {
    var taken = [], wekker = null;
    var verbonden = omg.verbonden || function () { return false; };
    function mag(t) { return !omg.verborgen() || (t.meet && verbonden()); }
    function start(t) { if (t.id === null) t.id = omg.zet(t.fn, t.ms); }
    function stop(t) { if (t.id !== null) { omg.wis(t.id); t.id = null; } }
    function veilig(t, fn) {
      return function () {
        t.n++;   // hoe vaak hij draaide: bproef-rust.js telt zo wie er uit beeld tikt
        try { fn(); } catch (e) { console.warn('PLRust: taak ' + t.naam + ' mislukt', e); }
      };
    }
    // Eén wekker voor alle slapende meettimers samen, alleen uit beeld.
    function wekkerNodig() {
      return omg.verborgen() && taken.some(function (t) { return t.meet && t.id === null; });
    }
    function wekkerZet() {
      if (wekkerNodig()) { if (wekker === null) wekker = omg.zet(zicht, WEKKER_MS); }
      else if (wekker !== null) { omg.wis(wekker); wekker = null; }
    }
    function zicht() {
      var weg = omg.verborgen();
      taken.forEach(function (t) {
        if (!mag(t)) stop(t);
        else if (t.id === null) { if (!weg || t.meet) t.fn(); start(t); }
      });
      wekkerZet();
    }
    function nieuw(ms, fn, naam, meet) {
      var t = { ms: ms, fn: null, naam: naam || '?', id: null, meet: !!meet, n: 0 };
      t.fn = veilig(t, fn);
      taken.push(t);
      if (mag(t)) start(t);
      wekkerZet();
      return t;
    }
    return {
      elke: function (ms, fn, naam) { return nieuw(ms, fn, naam, false); },
      meet: function (ms, fn, naam) { return nieuw(ms, fn, naam, true); },
      weg: function (t) {
        var i = taken.indexOf(t); if (i < 0) return false;
        stop(t); taken.splice(i, 1); wekkerZet(); return true;
      },
      // Na elke wissel van zichtbaarheid of verbinding
      zicht: zicht,
      actief: function () { return taken.filter(function (t) { return t.id !== null; }).length; },
      wekker: function () { return wekker !== null; },
      taken: function () { return taken.map(function (t) { return { naam: t.naam, ms: t.ms, loopt: t.id !== null, meet: t.meet, n: t.n }; }); }
    };
  }

  var _appInactief = false;
  function verborgen() {
    var doc = false;
    try { doc = typeof document !== 'undefined' && document.visibilityState === 'hidden'; }
    catch (e) { console.warn('PLRust: zichtbaarheid onleesbaar — timers blijven lopen', e); }
    return doc || _appInactief;
  }

  var app = maak({
    zet: function (fn, ms) { return setInterval(fn, ms); },
    wis: function (id) { clearInterval(id); },
    verborgen: verborgen,
    verbonden: function () {
      try { return typeof connected !== 'undefined' && !!connected; }
      catch (e) { console.warn('PLRust: verbinding onleesbaar — meettimers lopen door', e); return true; }
    }
  });

  try { document.addEventListener('visibilitychange', app.zicht); }
  catch (e) { console.warn('PLRust: geen visibilitychange — timers blijven lopen', e); }
  try {
    var A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (A && typeof A.addListener === 'function') {
      A.addListener('appStateChange', function (st) { _appInactief = !(st && st.isActive); app.zicht(); });
    }
  } catch (e) { console.warn('PLRust: appStateChange niet aan te melden — alleen visibilitychange', e); }

  window.PLRust = {
    elke: app.elke,
    meet: app.meet,
    weg: app.weg,
    zicht: app.zicht,
    // setConn() meldt een andere verbindingsstaat: meettimers meteen aan of uit.
    verbinding: app.zicht,
    wekker: app.wekker,
    actief: app.actief,
    taken: app.taken,
    _kern: { maak: maak, WEKKER_MS: WEKKER_MS }
  };
})();
