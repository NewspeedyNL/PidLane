// ══════════════════════════════════════════════════════════════════
// pidlane-achtergrond.js — één eigenaar voor "de app was weg"
// ──────────────────────────────────────────────────────────────────
// DE BEVINDING (#18). Android bevriest de JS-timers van een WebView zodra de
// app naar de achtergrond gaat. Pollus, recorder en logger stoppen dan
// tegelijk. Op 02-09-2026 om 22:04 is dat voor het eerst met opzet
// nagemeten: twee minuten weg, en de meetlus stond 190 seconden stil.
//
// Dit bestand REPAREERT die bevriezing niet — dat is native werk (richting 1
// in het issue: foreground service plus wake lock). Het doet richting 2: de
// app weet voortaan DAT hij weg was, hoe lang, en komt met opzet terug in
// plaats van er per ongeluk achter te komen.
//
// WAAROM DAT MEER IS DAN COSMETIEK. Uit het log van 23-08: de app hervat om
// 23:31:00 en meldt zestien seconden later "socket dood na 012E1". Android
// had de socket intussen opgeruimd, maar dat bleek pas toen de pollus er een
// commando in probeerde te schrijven. Die zestien seconden zijn rommel: de
// ELM-interpreter staat dan in een andere staat dan de app denkt. Nu wordt de
// socket bij terugkomst nagekeken vóórdat het volgende commando eroverheen
// gaat.
//
// WAAROM HET EEN EIGEN MODULE IS. Er stonden vijf visibilitychange-luisteraars
// in de app — btflow, bulk, fuel, koopcheck, neon en rit — en die weten niets
// van elkaar. Elk van de vijf beslist voor zichzelf wat "de app ging weg"
// betekent, en geen van de vijf legt het gat vast. Dat is precies het patroon
// dat CLAUDE.md verbiedt met "één ding heeft één betekenis". Die vijf blijven
// staan (ze doen hun eigen werk: flushen, pauzeren), maar het OORDEEL over de
// onderbreking hoort op één plek, en dat is hier.
//
// De testrun leest deze lijst in blok 5 en blok 14, en vergelijkt hem met de
// gaten die PLRit uit zijn eigen tikken afleidt. Wijzen die twee dezelfde
// kant op, dan klopt het beeld; lopen ze uiteen, dan is dat een bevinding.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Korter dan dit is een vensterwissel (de bestandskiezer, een melding), geen
  // bevriezing. Die zou de lijst vervuilen met ruis waar niets aan te zien is.
  var DREMPEL_MELDEN = 3000;
  // Vanaf hier de socket actief nakijken. Onder de tien seconden ruimt Android
  // de SPP-verbinding zelden op, en een controle kost een read op de adapter.
  var DREMPEL_SOCKET = 10000;
  var MAX = 50;

  var perioden = [];
  var _weg = 0;

  function _log(m, niveau) {
    try { if (typeof log === 'function') log(m, niveau || 'info'); }
    catch (e) { console.warn('achtergrondmelding niet in de app-log gezet', e); }
  }
  function _bt(m, niveau) {
    try { if (typeof btDiag === 'function') btDiag(m, niveau || 'info'); }
    catch (e) { console.warn('achtergrondmelding niet in de BT-log gezet', e); }
  }

  // De socket nakijken vóór het volgende commando. force blijft FALSE: de
  // guard doet dan eerst isConnected() en grijpt alleen in als de socket echt
  // dood is. Een gezonde verbinding wordt dus niet onnodig gesloopt — dat is
  // het verschil tussen nakijken en herstarten.
  function _socketNakijken(s) {
    try {
      if (typeof connected !== 'undefined' && !connected) return 'niet verbonden';
      var c = window._sppConn;
      if (!c || !c.spp) return 'geen SPP-verbinding';
      if (typeof sppReconnectGuard !== 'function') return 'sppReconnectGuard ontbreekt';
      Promise.resolve(sppReconnectGuard(c.spp, c.address, 'terug na ' + s + ' s achtergrond'))
        .catch(function (e) { console.warn('achtergrond: socketcontrole mislukt', e); });
      return 'socket nagekeken';
    } catch (e) {
      console.warn('achtergrond: socketcontrole niet gestart', e);
      return 'socketcontrole niet gestart';
    }
  }

  function heen() { if (!_weg) _weg = Date.now(); return _weg; }

  function terug() {
    if (!_weg) return null;
    var van = _weg, tot = Date.now();
    _weg = 0;
    if (tot - van < DREMPEL_MELDEN) return null;
    var s = Math.round((tot - van) / 1000);
    var p = { van: van, tot: tot, s: s, socket: null };
    if (tot - van >= DREMPEL_SOCKET) p.socket = _socketNakijken(s);
    perioden.push(p);
    if (perioden.length > MAX) perioden.shift();
    _log('📴 De app was ' + s + ' s weg — de meetlus stond in die tijd stil (#18)' +
         (p.socket ? '. ' + p.socket : ''), 'warn');
    _bt('achtergrond: ' + s + ' s weg' + (p.socket ? ' — ' + p.socket : ''), 'warn');
    return p;
  }

  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') heen(); else terug();
    });
  } catch (e) {
    console.warn('visibilitychange niet gekoppeld — onderbrekingen blijven onzichtbaar (#18)', e);
  }

  window.PLAchtergrond = {
    perioden: function () { return perioden.slice(); },
    laatste: function () { return perioden.length ? perioden[perioden.length - 1] : null; },
    // Alleen wat na een gegeven moment begon. Blok 5 en blok 14 gaan over DEZE
    // rit, en de lijst overleeft een nulstelling van de ritwaarnemer.
    sinds: function (t) { return perioden.filter(function (p) { return p.van >= (t || 0); }); },
    totaalS: function (t) {
      return this.sinds(t).reduce(function (a, p) { return a + p.s; }, 0);
    },
    weg: function () { return !!_weg; },
    wis: function () { perioden = []; _weg = 0; },
    // Voor test-achtergrond.js: de twee overgangen zonder browser aanroepbaar.
    _heen: heen,
    _terug: terug,
    _drempels: function () { return { melden: DREMPEL_MELDEN, socket: DREMPEL_SOCKET }; }
  };
})();
