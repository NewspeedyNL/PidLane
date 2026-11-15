// ══════════════════════════════════════════════════════════════════
// pidlane-testrunlader.js — de testrun, de meetkamer en de meetcoach pas
// laden als iemand ze nodig heeft (#690)
// ──────────────────────────────────────────────────────────────────
// WAAROM. Samen 380 KB die elke klant bij elke start parste, terwijl alleen
// de beheerder ze gebruikt. Wat klantpaden er wél van lazen (PLRit, PLBudget,
// de gat-duidingen) staat sinds 15-11-2026 in pidlane-ritwaarnemer.js en
// laadt gewoon mee.
//
// WANNEER WEL.
//   • de beheerder: vanzelf, zodra isAdmin() waar is. De meetcoach moet
//     tijdens de rit meekijken en de toeschouwer zet markeringen; die mogen
//     niet wachten tot iemand de testrun opent.
//   • iedereen: bij de eerste aanroep van een van de functies hieronder. Die
//     staan er als plaatshouder; het echte bestand overschrijft ze.
//
// EEN MARKERING VÓÓR HET LADEN gaat niet verloren: hij wacht met zijn eigen
// tijd in een rij en gaat er bij het laden alsnog in, met die tijd in de
// opmerking (plMarkeer zelf zet de tijd van het moment van aanroepen).
//
// Klant zonder beheerdersrol: geen van de drie wordt geladen. Dat toetst
// bproef-testrunlader.js, met de tegenproef dat de beheerder ze wél krijgt.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  var BESTANDEN = ['pidlane-testrun.js', 'pidlane-meetkamer.js', 'pidlane-meetcoach.js'];
  var STUBS = ['openTestrun', 'closeTestrun', 'startTestrun', 'stopTestrun', 'testrunOpslaan', 'testrunTekst'];
  var ADMIN_MS = 3000, ADMIN_MAX = 200;   // tien minuten naar de rol kijken, daarna niet meer
  var _p = null, _wachtrij = [], _staat = 'niet';

  function script(f) {
    return new Promise(function (ja, nee) {
      var s = document.createElement('script');
      s.src = f; s.async = false;
      s.onload = function () { ja(f); };
      s.onerror = function () { nee(new Error(f + ' is niet te laden — geen netwerk?')); };
      document.head.appendChild(s);
    });
  }

  function laad(waarom) {
    if (_p) return _p;
    _staat = 'bezig';
    _p = BESTANDEN.reduce(function (v, f) { return v.then(function () { return script(f); }); }, Promise.resolve())
      .then(function () {
        _staat = 'geladen';
        stopKijk();
        try { console.info('Testrun geladen (' + (waarom || 'aanroep') + ')'); } catch (e) { /* console ontbreekt: niets te melden */ }
        var rij = _wachtrij; _wachtrij = [];
        rij.forEach(function (m) {
          try { window.plMarkeer(m.tekst, (m.opm ? m.opm + ' ' : '') + '(gezet om ' + new Date(m.ms).toLocaleTimeString('nl-NL') + ', vóór het laden)'); }
          catch (e) { console.warn('Testrunlader: markering uit de wachtrij niet gezet', e); }
        });
        return true;
      })
      .catch(function (e) { _p = null; _staat = 'mislukt'; console.warn('Testrunlader: ' + e.message, e); throw e; });
    return _p;
  }

  // Plaatshouders: laden, en dan de echte functie met dezelfde argumenten.
  STUBS.forEach(function (naam) {
    var stub = function () {
      var a = arguments;
      return laad(naam).then(function () {
        if (window[naam] === stub) throw new Error(naam + ' bestaat na het laden nog steeds niet');
        return window[naam].apply(window, a);
      }).catch(function (e) {
        console.warn('Testrunlader: ' + naam + ' kon niet starten', e);
        try { if (typeof showToast === 'function') showToast('De testrun laadt nu niet — probeer het opnieuw'); } catch (e2) { console.warn(e2); }
      });
    };
    stub._plaatshouder = true;
    window[naam] = stub;
  });
  var markStub = function (tekst, opmerking) {
    var m = { tekst: String(tekst || 'markering').slice(0, 80), opm: String(opmerking || '').slice(0, 260), ms: Date.now() };
    _wachtrij.push(m);
    if (_wachtrij.length > 50) _wachtrij.shift();
    laad('markering');
    return m;
  };
  markStub._plaatshouder = true;
  window.plMarkeer = markStub;

  function isBeheerder() {
    try { return typeof isAdmin === 'function' && !!isAdmin(); }
    catch (e) { console.warn('Testrunlader: isAdmin onleesbaar', e); return false; }
  }
  // Schermtimer via PLRust (#691): uit beeld slaapt hij mee.
  var n = 0, kijk = null;
  function tik() {
    n++;
    if (!_p && n <= ADMIN_MAX && isBeheerder()) laad('beheerder');
    if (_p || n > ADMIN_MAX) stopKijk();
  }
  function stopKijk() { if (kijk !== null && window.PLRust) { PLRust.weg(kijk); kijk = null; } }
  kijk = window.PLRust ? PLRust.elke(ADMIN_MS, tik, 'testrunlader') : null;
  if (!window.PLRust) console.warn('Testrunlader: PLRust ontbreekt — de beheerder krijgt de testrun pas bij de eerste aanroep');

  window.PLTestrunLader = {
    laad: laad,
    staat: function () { return _staat; },
    wachtrij: function () { return _wachtrij.slice(); },
    BESTANDEN: BESTANDEN.slice()
  };
})();
