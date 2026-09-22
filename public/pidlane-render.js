// ══════════════════════════════════════════════════════════════════
// pidlane-render.js — was er een rendercrash vóór deze start? (#229)
// ──────────────────────────────────────────────────────────────────
// De native kant (native/PLRender.java) vangt onRenderProcessGone af, houdt
// het proces in leven en bouwt de activiteit opnieuw op. Daarbij noteert hij
// het moment en of het een interne fout was of het systeem dat geheugen
// terugpakte. Deze module leest dat na de herstart één keer op en zet het in
// het logboek — als fout, zodat het ook in D1 landt.
//
// Waarom dat ertoe doet: een rendercrash geeft "native stil én JS stil", en
// in het verslag van #228 is dat precies het vakje "het proces was bevroren".
// Zonder deze regel vermomt de ene storing zich als de andere.
//
// In de browser bestaat de plugin niet en gebeurt hier niets.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function _plug() {
    try {
      var c = window.Capacitor;
      if (!c || !c.Plugins) return null;
      return c.Plugins.PLRender || null;
    } catch (e) {
      console.warn('Rendercrash: Capacitor-bridge niet leesbaar (#229)', e);
      return null;
    }
  }

  function melding(r) {
    if (!r || !r.moment) return null;
    var hoe = r.crash ? 'een interne fout' : 'het systeem pakte geheugen terug';
    var t = new Date(r.moment).toTimeString().slice(0, 8);
    return 'App herstart na een rendercrash om ' + t + ' (' + hoe + ') — ' +
      'het gat in de meting rond dat moment is geen busstilte (#229)';
  }

  /* Eén keer vragen is genoeg: de native kant vergeet de crash zodra hij
     hem heeft doorgegeven. Maar de bridge staat er niet noodzakelijk al als
     dit bestand laadt (zie pidlane-pip.js), dus tot het gelukt is opnieuw
     proberen bij 'load' en nog één keer daarna. */
  var _gevraagd = false;
  function vraag() {
    if (_gevraagd) return;
    var p = _plug();
    if (!p || typeof p.laatste !== 'function') return;
    _gevraagd = true;
    Promise.resolve(p.laatste()).then(function (r) {
      var m = melding(r);
      if (!m) return;
      try { if (typeof log === 'function') log(m, 'err'); else console.error(m); }
      catch (e) { console.warn('Rendercrash-melding niet in de app-log gezet (#229)', e, m); }
    }).catch(function (e) {
      console.warn('Rendercrash: PLRender.laatste() gaf een fout (#229)', e);
    });
  }

  window.PLRender = { melding: melding, vraag: vraag };
  vraag();
  try {
    window.addEventListener('load', function () { vraag(); setTimeout(vraag, 3000); });
  } catch (e) {
    console.warn('Rendercrash: kon niet op het laden wachten (#229)', e);
  }
})();
