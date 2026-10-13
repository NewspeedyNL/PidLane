/* ═══════════════════════════════════════════════════════════════════
   pidlane-contact.js — PLContact: contact uit is geen storing
   ───────────────────────────────────────────────────────────────────
   WAAROM (13-10-2026). Bij de supermarkt de motor uit, en de app ging
   "de verbinding controleren": foutmeldingen, een rommelige bus. Het
   logboek van 23:20 laat zien wat er echt gebeurde. Om 23:20:04 was het
   laatste antwoord 664 tpm bij 0 km/u en 14,1 V: stationair, stilstand.
   Daarna gaf de ECU alleen nog NO DATA terug. De adapter leefde nog en
   antwoordde binnen 220 ms. Binnen een halve seconde las de app dat als
   een slechte bus:

     23:20:04  Multi-PID groep verkleind naar 2
     23:20:04  ATST bijgestuurd 0x1C → 0x32
     23:20:05  Multi-PID groep verkleind naar 1
     23:20:05  Multi-PID herhaald onvolledig — tijdelijk uit
     23:20:08  Pollbudget verlaagd naar 74%

   Elk van die stappen leert iets van een antwoord waar niets in zat. En
   met het contact weer aan begon de app daardoor trager dan hij was
   gestopt.

   WAT DIT DOET
     • noteAntwoord(cmd, raw) zit in trackBtQuality(), dus ziet elk
       mode-01-antwoord. Een antwoord zonder één 41-payload, op een
       verzoek met een PID die kort geleden nog antwoordde, telt als stil.
       Een leeg antwoord telt niet mee: dan is de adapter weg, niet de
       ECU, en dat pad heeft zijn eigen herverbinding.
     • Bij het eerste stille antwoord legt hij vast hoe de bus ervoor
       stond (stand()) en wat de auto toen deed (laatst()). Na
       CFG.reeks stille antwoorden over minstens CFG.minMs is het
       "stil". Dan zet hij de stand van vóór de stilte terug, en hij zegt
       wat het was:
         contact_uit — de laatste snelheid lag onder CFG.rijdtKmh, of
                       de motor draaide al niet meer;
         storing     — de auto reed nog: dan is stilvallen geen keuze;
         onbekend    — er was geen snelheid of toerental bekend.
     • Zolang het stil is staan de bijstellers stil (batchDip, ATST,
       pollbudget, snoeien; elk vraagt stil()). De poll-lus vraagt dan
       alleen elke CFG.hartslagMs het toerental. Komt er weer een
       41-payload, dan meet de app gewoon verder.

   PUUR. maak(omg) is de kern; omg geeft de tijd, de stand en de
   meldingen. test-contact.js voert de kern met een nep-omg.
   Laadvolgorde: na pidlane-busgate.js. Bij het laden heeft hij niets
   nodig; pas als er verkeer is leest hij globals.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    reeks: 6,           // zoveel stille antwoorden achter elkaar...
    minMs: 1000,        // ...over minstens zo lang; een hik is korter
    rijdtKmh: 5,        // de laatste snelheid hierboven: de auto reed nog
    uitRpm: 300,        // toerental hieronder: de motor draaide niet meer
    hartslagMs: 2000    // zolang stil: zo vaak het toerental vragen
  };

  function getal(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  /* '010C0D492' → ['010C','010D','0149']. Het antwoordcijfer achteraan
     (PLAntwoordtal, de '1' van een solo-verzoek) is één hexcijfer. */
  function pidsUit(cmd) {
    var c = String(cmd || '').toUpperCase().replace(/\s/g, '');
    if (!/^01([0-9A-F]{2})+[0-9A-F]?$/.test(c)) return [];
    var rest = c.slice(2);
    if (rest.length % 2) rest = rest.slice(0, -1);
    var uit = [];
    for (var i = 0; i < rest.length; i += 2) uit.push('01' + rest.slice(i, i + 2));
    return uit;
  }

  /* Zit er minstens één mode-01-antwoord in? Spaties weg: sommige
     adapters zetten '41 0C 0A 62' neer. */
  function heeftData(raw) {
    return /41[0-9A-F]{2}/i.test(String(raw || '').replace(/\s/g, ''));
  }

  /* Wat was het, gegeven wat de auto deed vlak vóór de stilte. */
  function oordeel(laatst) {
    var l = laatst || {};
    var kmh = getal(l.kmh), rpm = getal(l.rpm);
    if (kmh !== null && kmh >= CFG.rijdtKmh) return 'storing';
    if (kmh !== null) return 'contact_uit';
    if (rpm !== null && rpm < CFG.uitRpm) return 'contact_uit';
    return 'onbekend';
  }

  function maak(omg) {
    var st = { reeks: 0, sinds: 0, snap: null, laatst: null, stil: false, oordeel: null };

    function noteAntwoord(cmd, raw) {
      if (!String(raw || '').trim()) return st.stil;
      if (heeftData(raw)) {
        if (st.stil) {
          var duur = omg.nu() - st.sinds;
          st.stil = false;
          omg.weer(st.oordeel, duur);
        }
        st.reeks = 0; st.sinds = 0; st.snap = null; st.laatst = null; st.oordeel = null;
        return false;
      }
      if (st.stil) return true;
      // Een PID die deze auto niet heeft geeft altijd NO DATA. Dat is geen
      // stilte, en hij mag een lopende reeks ook niet afbreken.
      var pids = pidsUit(cmd);
      if (!pids.some(function (p) { return omg.kortOk(p); })) return false;
      if (st.reeks === 0) { st.sinds = omg.nu(); st.snap = omg.stand(); st.laatst = omg.laatst(); }
      st.reeks++;
      if (st.reeks >= CFG.reeks && omg.nu() - st.sinds >= CFG.minMs) {
        st.stil = true;
        st.oordeel = oordeel(st.laatst);
        omg.terug(st.snap);
        omg.meld(st.oordeel, st.laatst);
      }
      return st.stil;
    }

    return {
      noteAntwoord: noteAntwoord,
      stil: function () { return st.stil; },
      stand: function () {
        return { stil: st.stil, oordeel: st.oordeel, reeks: st.reeks, sinds: st.sinds, laatst: st.laatst };
      },
      reset: function () { st.reeks = 0; st.sinds = 0; st.snap = null; st.laatst = null; st.stil = false; st.oordeel = null; }
    };
  }

  // ── de koppeling met de app ─────────────────────────────────────────
  function _waarde(pid) {
    try { return (typeof pidVals !== 'undefined' && pidVals) ? getal(pidVals[pid]) : null; }
    catch (e) { console.warn('PLContact: pidVals onleesbaar', e); return null; }
  }

  function _meldTekst(soort, l) {
    var kmh = l && getal(l.kmh);
    if (soort === 'storing') return '⚠ De auto antwoordt niet meer terwijl je reed' + (kmh !== null ? ' (' + Math.round(kmh) + ' km/u)' : '') + ' — vastgelegd als storing. Zodra hij weer antwoordt meet PidLane verder.';
    if (soort === 'contact_uit') return '🔑 Contact uit — meting gepauzeerd. Zet het contact aan, dan meet PidLane vanzelf verder.';
    return '🔑 De auto antwoordt niet meer — staat het contact uit? Zodra hij weer antwoordt meet PidLane verder.';
  }

  function _overal(type, tekst, logNiveau, extra) {
    try { if (typeof log === 'function') log(tekst, logNiveau); } catch (e) { console.warn('PLContact: log mislukt', e); }
    try { if (typeof showToast === 'function') showToast(tekst, 6000); } catch (e) { console.warn('PLContact: toast mislukt', e); }
    // Naar de server: de rit van 13-10 stond alleen in het logboek op de
    // telefoon. Zonder deze regel is een contact-uit achteraf niet terug te
    // vinden.
    try { if (typeof logToSheets === 'function') logToSheets(type, tekst, extra || {}); } catch (e) { console.warn('PLContact: logToSheets mislukt', e); }
  }

  var app = maak({
    nu: function () { return Date.now(); },
    kortOk: function (pid) {
      try { return typeof _plKortGeledenOk === 'function' && _plKortGeledenOk(pid); }
      catch (e) { console.warn('PLContact: _plKortGeledenOk mislukt', e); return false; }
    },
    stand: function () {
      try { return (typeof plStilteStand === 'function') ? plStilteStand() : null; }
      catch (e) { console.warn('PLContact: plStilteStand mislukt', e); return null; }
    },
    laatst: function () { return { rpm: _waarde('010C'), kmh: _waarde('010D'), volt: _waarde('0142') }; },
    terug: function (snap) {
      if (!snap) return;
      try { if (typeof plStilteTerug === 'function') plStilteTerug(snap); }
      catch (e) { console.warn('PLContact: plStilteTerug mislukt — de bus blijft zoals de stilte hem zette', e); }
    },
    meld: function (soort, l) {
      var d = 'tpm ' + (l && l.rpm != null ? Math.round(l.rpm) : '—') + ', ' + (l && l.kmh != null ? Math.round(l.kmh) : '—') + ' km/u, ' + (l && l.volt != null ? l.volt.toFixed(1) : '—') + ' V';
      try { if (typeof btDiag === 'function') btDiag('ECU stil (' + soort + ') — laatste waarden: ' + d + '; busstand van vóór de stilte terug, bijstellen gepauzeerd', soort === 'storing' ? 'warn' : 'info'); }
      catch (e) { console.warn('PLContact: btDiag mislukt', e); }
      _overal('contact', _meldTekst(soort, l), soort === 'storing' ? 'warn' : 'info', { oordeel: soort, laatst: d });
      try { window.dispatchEvent(new CustomEvent('pl-contact', { detail: { stil: true, oordeel: soort } })); }
      catch (e) { console.warn('PLContact: event mislukt', e); }
    },
    weer: function (soort, duur) {
      _overal('contact', '✅ De auto antwoordt weer — meten gaat verder (' + Math.round(duur / 1000) + ' s stil).', 'ok', { oordeel: soort, stil_s: Math.round(duur / 1000) });
      try { window.dispatchEvent(new CustomEvent('pl-contact', { detail: { stil: false, oordeel: soort } })); }
      catch (e) { console.warn('PLContact: event mislukt', e); }
    }
  });

  window.PLContact = {
    noteAntwoord: app.noteAntwoord,
    stil: app.stil,
    stand: app.stand,
    reset: app.reset,
    cfg: CFG,
    _kern: { maak: maak, oordeel: oordeel, pidsUit: pidsUit, heeftData: heeftData }
  };
})();
