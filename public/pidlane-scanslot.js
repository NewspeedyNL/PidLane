// ══════════════════════════════════════════════════════════════════
// pidlane-scanslot.js — één plek waar een scan de bus overneemt (#191)
// ──────────────────────────────────────────────────────────────────
// WAT EEN SCAN ANDERS MAAKT DAN EEN POLL. Een scan vraagt met opzet naar
// dingen die er niet zijn: adressen die niet bestaan, PIDs die deze auto niet
// heeft. De lege antwoorden die dat oplevert zijn het MEETRESULTAAT, niet een
// storing. Twee bewakers in de app denken daar anders over:
//
//   PLBus.note()        telt ze als fout → foutPct naar ~100% → PLBusGate
//                       dicht → waakronde en watchers melden sensoren als
//                       uitgevallen terwijl er niets uitgevallen is
//   trackBtQuality()    zes lege op rij = "socket dood" → volledige
//                       herverbinding, midden in de scan
//
// Allebei houden zich stil zodra `window._plScanActief` aan staat. Dat is op
// 04-09-2026 gebouwd voor de adresscan van PLKaart (zie PIDLANE.md §11), en
// het werkt — maar het was op precies één plek aangesloten. Het diep zoeken op
// de PID-keuzepagina zette de vlag niet, en leverde daardoor bij elke ronde een
// dip met valse waarschuwingen op. Dat is #191, gemeld uit het gebruik.
//
// ──────────────────────────────────────────────────────────────────
// DE VAL WAAR DEZE MODULE OMHEEN GEBOUWD IS
//
// `_plScanActief` zet de dode-socket-detectie UIT. Wie hem aanzet en verder
// niets doet, ruilt valse waarschuwingen in voor een scan die stilletjes
// doorploetert op een verbinding die al weg is. Dat is dezelfde fout in
// spiegelbeeld, en hij is stiller — je merkt hem pas als de rit voorbij is.
//
// Daarom kun je hier de vlag niet aanzetten zonder het vangnet mee te krijgen.
// `doe()` geeft je een `stuur()` en dát is het enige punt waar een commando de
// bus op gaat. Die telt de lege antwoorden, stuurt na een reeks (of na zoveel
// commando's) een ATI, en breekt de scan af als die twee keer niets teruggeeft.
// Precies zoals PLKaart het doet — die logica is in een rit beproefd en wordt
// hier niet opnieuw bedacht.
//
// DRIE DINGEN, EN ZE HOREN BIJ ELKAAR:
//
//   1. de bus claimen, en het slot blijven aantikken met PLBus.raak() zodat de
//      noodrem (MAX_HOLD_MS, drie minuten) hem niet halverwege onteigent
//   2. window._plScanActief aan — en in een finally weer uit
//   3. een eigen hartslag, want punt 2 haalt het vangnet weg
//
// WAAROM EEN EIGEN MODULE. PLKaart heeft deze drie al, met de hand. Ze een
// tweede keer naschrijven in pidlane-rijsituatie.js zou de derde kopie van
// dezelfde logica maken, en "twee plekken die hetzelfde doen" is in dit
// project al drie keer een bug geweest. PLKaart staat nog op zijn eigen
// uitvoering: die is in een rit getoetst en verhuist pas als daar een reden
// voor is die groter is dan netheid. Wat hier staat is vanaf nu de plek voor
// elke nieuwe scan.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* De getallen komen van PLKaart, waar ze in een rit zijn beproefd. Ze staan
     hier bij elkaar zodat een aanroeper ze kan zien zonder ze te hoeven
     kennen — en zodat een test ze uit de module leest in plaats van ze na te
     schrijven. */
  var STD = {
    wachtMs: 15000,       // zo lang wachten op het busslot
    raakElkeMs: 20000,    // slot aantikken — ruim binnen PLBus.MAX_HOLD_MS
    hartslagElke: 60,     // na zoveel commando's een ATI
    leegAchtereen: 25,    // zoveel lege antwoorden op rij dwingt een ATI af
    cmdTimeoutMs: 1200,
    atTimeoutMs: 1500,
    pauzeMs: 8
  };

  function _pauze(ms) {
    return new Promise(function (r) {
      try { setTimeout(r, ms); } catch (e) { console.warn('scanslot: pauze mislukt', e); r(); }
    });
  }
  function _diag(m, n) {
    try { if (typeof btDiag === 'function') btDiag(m, n || 'info'); }
    catch (e) { console.warn('scanslot: melding niet in de BT-log gezet', e); }
  }

  /* Draai `werk` met de bus geclaimd, de scanvlag aan en een bewaakte stuur().

     `werk` krijgt één ding mee: stuur(cmd, timeout). Alles wat daarbuiten om
     sendCmd aanroept valt buiten het vangnet — dat is met opzet zichtbaar
     gemaakt door het zo door te geven in plaats van een vlag te zetten en de
     aanroeper zijn gang te laten gaan.

     Gooit `werk` (of stuur) een fout, dan gaat die naar buiten. Het opruimen
     gebeurt hoe dan ook. */
  async function doe(naam, opties, werk) {
    if (typeof werk !== 'function') throw new Error('PLScanSlot.doe: geen werk meegegeven');
    if (typeof sendCmd !== 'function') throw new Error('PLScanSlot: sendCmd ontbreekt — zonder bus valt er niets te scannen');
    var C = {};
    for (var k in STD) C[k] = (opties && opties[k] !== undefined) ? opties[k] : STD[k];

    // ── 1. de bus ───────────────────────────────────────────────────
    // Lukt claimen niet, dan gaat het werk TOCH door — dezelfde afweging als
    // withBus(): functionaliteit boven discipline. Het verschil is dat het
    // hier gemeld wordt, want dan meet je door andermans verkeer heen.
    var tok = 0;
    try {
      if (window.PLBus && PLBus.wait) tok = await PLBus.wait(naam, C.wachtMs);
      if (!tok) _diag('scanslot "' + naam + '": geen busslot, de scan meet naast het gewone verkeer', 'warn');
    } catch (e) {
      console.warn('scanslot: busslot claimen mislukt', e);
      _diag('scanslot "' + naam + '": busslot claimen gaf een fout — ' + (e.message || e), 'warn');
    }

    var raakTimer = null;
    if (tok) {
      try {
        raakTimer = setInterval(function () {
          try { if (window.PLBus && PLBus.raak) PLBus.raak(tok); }
          catch (e) { console.warn('scanslot: busslot verversen mislukt', e); }
        }, C.raakElkeMs);
      } catch (e) {
        console.warn('scanslot: raak-timer niet gestart — een lange scan raakt zijn slot kwijt', e);
      }
    }

    /* ── 2. de vlag ─────────────────────────────────────────────────
       NESTELEN MOET KLOPPEN. Draait er al een scan (PLKaart bijvoorbeeld), dan
       stond de vlag al aan en hoort deze finally hem NIET uit te zetten — dan
       zou de ene scan het vangnet van de andere terugzetten terwijl die nog
       loopt. Vandaar dat er onthouden wordt wat er stond. */
    var alAan = !!window._plScanActief;
    window._plScanActief = true;

    var leegReeks = 0, sinds = 0, commandos = 0;

    async function _hartslag() {
      for (var p = 0; p < 2; p++) {
        var r = '';
        try { r = await sendCmd('ATI', C.atTimeoutMs); } catch (e) { r = ''; }
        if (String(r || '').trim()) return true;
        await _pauze(200);
      }
      return false;
    }

    /* ── 3. het enige punt waar een commando de bus op gaat ─────────── */
    async function stuur(cmd, timeout) {
      var r = '';
      try { r = await sendCmd(cmd, timeout || C.cmdTimeoutMs); }
      catch (e) { r = ''; }
      commandos++;
      sinds++;
      if (!String(r || '').trim()) leegReeks++; else leegReeks = 0;
      if (leegReeks >= C.leegAchtereen || sinds >= C.hartslagElke) {
        sinds = 0;
        var levend = await _hartslag();
        if (!levend) throw new Error('verbinding weg: ATI gaf twee keer niets terug');
        leegReeks = 0;
      }
      if (C.pauzeMs) await _pauze(C.pauzeMs);
      return r;
    }

    try {
      return await werk(stuur);
    } finally {
      try { if (raakTimer !== null) clearInterval(raakTimer); }
      catch (e) { console.warn('scanslot: raak-timer niet gestopt', e); }
      if (!alAan) window._plScanActief = false;
      try { if (tok && window.PLBus && PLBus.release) PLBus.release(tok); }
      catch (e) { console.warn('scanslot: busslot vrijgeven mislukt', e); }
      _diag('scanslot "' + naam + '" klaar — ' + commandos + ' commando(s)', 'info');
    }
  }

  window.PLScanSlot = {
    doe: doe,
    drempels: function () { var o = {}; for (var k in STD) o[k] = STD[k]; return o; }
  };
})();
