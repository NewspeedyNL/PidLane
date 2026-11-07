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

   WAT HIER NIET IN HOORT. Alles wat meet, een rit bijhoudt of de sessie
   levend houdt: de poll-lus, PLGarage.lus (rit), de leerrit, de
   sessiehartslag. Die moeten juist op de achtergrond doorlopen.

   PUUR. maak(omg) is de kern; omg geeft zet/wis/verborgen. test-rust.js
   voert de kern met een nep-omg. Laadvolgorde: vroeg, vóór elke module die
   PLRust.elke() bij het laden aanroept.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function maak(omg) {
    var taken = [];
    function start(t) { if (t.id === null) t.id = omg.zet(t.fn, t.ms); }
    function stop(t) { if (t.id !== null) { omg.wis(t.id); t.id = null; } }
    function veilig(fn, naam) {
      return function () {
        try { fn(); } catch (e) { console.warn('PLRust: taak ' + naam + ' mislukt', e); }
      };
    }
    return {
      elke: function (ms, fn, naam) {
        var t = { ms: ms, fn: veilig(fn, naam || '?'), naam: naam || '?', id: null };
        taken.push(t);
        if (!omg.verborgen()) start(t);
        return t;
      },
      // Na elke wissel van zichtbaarheid (visibilitychange, appStateChange)
      zicht: function () {
        var weg = omg.verborgen();
        taken.forEach(function (t) {
          if (weg) stop(t);
          else if (t.id === null) { t.fn(); start(t); }
        });
      },
      actief: function () { return taken.filter(function (t) { return t.id !== null; }).length; },
      taken: function () { return taken.map(function (t) { return { naam: t.naam, ms: t.ms, loopt: t.id !== null }; }); }
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
    verborgen: verborgen
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
    zicht: app.zicht,
    actief: app.actief,
    taken: app.taken,
    _kern: { maak: maak }
  };
})();
