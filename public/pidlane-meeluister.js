// ══════════════════════════════════════════════════════════════════
// pidlane-meeluister.js — PLMeeluister: ligt de CAN-bus open? (#560, methode 2)
// ──────────────────────────────────────────────────────────────────
// WAAROM. Wielsnelheden en de ESP-status worden continu over de CAN
// uitgezonden; openbare DBC's (commaai/opendbc) ontcijferen ze per platform.
// Maar veel auto's sinds ±2015 hebben een gateway die het OBD-contact
// afschermt: daar hoor je alleen de antwoorden op je eigen vragen. Of
// meeluisteren op DEZE auto iets oplevert, is dus eerst een ja/nee-vraag.
//
// DE PROEF. Twee seconden ATMA (monitor all) met de headers aan, en dan tellen
// hoeveel verschillende zenders er langskwamen. De diagnose-adressen (7DF,
// 7E0–7EF, 18DB33F1, 18DAxxxx) tellen niet mee: dat is tester-verkeer, geen
// uitzending. Vanaf DREMPEL_OPEN zenders heet de bus open.
//
// WAT ER WEL EN NIET WORDT VASTGELEGD. Open → PLWaarneming 'canopen', bij deze
// auto. Stil wordt NIET vastgelegd: dat kan een gateway zijn, maar ook contact
// uit, een kloon die ATMA half doet of een adapter die het filter laat staan.
// Dezelfde asymmetrie als de rest van PLWaarneming — niet gezien is geen nee.
//
// DE ADAPTER TERUG. ATMA stopt pas als er een teken binnenkomt; daarna komt er
// "STOPPED" en een prompt. Eén ATI stopt, een tweede ATI bewijst dat de
// adapter weer gewoon antwoordt. ATH0 zet de headers terug (de hele parser gaat
// daarvan uit, zie pidlane-bt.js #394) en het herstel wordt bewezen, niet
// aangenomen — zelfde regel als PLKaart.
//
// De bus, de scanvlag en de hartslag komen van PLScanSlot (#191): een proef
// die met opzet niets terug kan krijgen, mag de dode-socket-detectie niet
// laten afgaan.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var LUISTER_MS = 2000;
  var AT_MS = 1500;
  var DREMPEL_OPEN = 3;

  function _bits(protocol) {
    var nr = String(protocol || '').toUpperCase().replace(/^A/, '');
    if (nr === '6' || nr === '8') return 11;
    if (nr === '7' || nr === '9') return 29;
    return 0;
  }

  function _isDiag(id, bits) {
    if (bits === 11) return id === '7DF' || /^7E[0-9A-F]$/.test(id);
    return id === '18DB33F1' || /^18DA/.test(id);
  }

  /* ontleed(raw, protocol) — puur. Wat zegt een ATMA-uitvoer over de bus?
     oordeel: open | weinig | stil | busfout | niet_ondersteund | geen_can */
  function ontleed(raw, protocol) {
    var bits = _bits(protocol);
    var uit = { protocol: String(protocol || '').toUpperCase(), bits: bits, frames: 0, ids: [], diag: 0, bufferVol: false, oordeel: 'stil' };
    if (!bits) { uit.oordeel = 'geen_can'; return uit; }
    var t = String(raw || '').toUpperCase();
    if (/^\s*\?\s*$/.test(t)) { uit.oordeel = 'niet_ondersteund'; return uit; }
    uit.bufferVol = /BUFFER FULL/.test(t);
    var idLen = bits === 29 ? 8 : 3, gezien = {};
    t.split(/[\r\n]+/).forEach(function (regel) {
      var r = regel.replace(/[\s>]/g, '');
      if (!/^[0-9A-F]+$/.test(r) || r.length < idLen + 2) return;
      uit.frames++;
      var id = r.slice(0, idLen);
      if (_isDiag(id, bits)) { uit.diag++; return; }
      gezien[id] = true;
    });
    uit.ids = Object.keys(gezien).sort();
    if (uit.ids.length >= DREMPEL_OPEN || (uit.bufferVol && uit.frames > uit.diag)) uit.oordeel = 'open';
    else if (uit.ids.length || uit.bufferVol) uit.oordeel = 'weinig';
    else if (/CAN ERROR|BUS ERROR/.test(t)) uit.oordeel = 'busfout';
    return uit;
  }

  /* tekst(r) — puur. De regel voor de beheerder. */
  function tekst(r) {
    if (!r) return '✗ Geen uitslag';
    if (r.fout) return '✗ Meeluisteren: ' + r.fout;
    var n = r.ids ? r.ids.length : 0;
    var herstel = r.herstelFout ? ' ⚠️ Adapter niet bewezen hersteld (' + r.herstelFout + ') — verbreek en verbind opnieuw.' : '';
    switch (r.oordeel) {
      case 'open': return '✓ CAN-bus open: ' + n + ' zenders in ' + (LUISTER_MS / 1000) + ' s' + (r.bufferVol ? ' (buffer vol)' : '') +
        ' — wielsnelheid en ESP zijn hier mee te lezen. Vastgelegd bij deze auto.' + herstel;
      case 'weinig': return '~ ' + n + ' zender(s) gehoord — te weinig voor een oordeel. Draait de motor? Niet vastgelegd.' + herstel;
      case 'stil': return '— Niets gehoord in ' + (LUISTER_MS / 1000) + ' s: waarschijnlijk een gateway voor het OBD-contact, of het contact staat uit. Niet vastgelegd — stilte is geen bewijs.' + herstel;
      case 'busfout': return '✗ De adapter meldt een CAN-fout tijdens het meeluisteren. Niet vastgelegd.' + herstel;
      case 'niet_ondersteund': return '✗ Deze adapter kent ATMA niet — meeluisteren kan hier niet.' + herstel;
      case 'geen_can': return '— Protocol ' + (r.protocol || '?') + ' is geen CAN: meeluisteren kan alleen op CAN.' + herstel;
    }
    return '✗ Onbekende uitslag' + herstel;
  }

  function _diag(m, n) {
    try { if (typeof btDiag === 'function') btDiag(m, n || 'info'); }
    catch (e) { console.warn('meeluister: melding niet in de BT-log gezet', e); }
  }

  var _bezig = false;

  async function proef() {
    if (_bezig) return { fout: 'de proef loopt al' };
    if (typeof connected === 'undefined' || !connected || (typeof demoMode !== 'undefined' && demoMode)) return { fout: 'niet verbonden met een auto' };
    if (!window.PLScanSlot || typeof PLScanSlot.doe !== 'function') return { fout: 'PLScanSlot ontbreekt (herladen?)' };
    _bezig = true;
    try {
      var r = await PLScanSlot.doe('meeluister', {}, async function (stuur) {
        var proto = String(await stuur('ATDPN', AT_MS) || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
        if (!_bits(proto)) return ontleed('', proto);
        var raw = '', mislukt = [];
        await stuur('ATH1', AT_MS);
        try {
          raw = String(await stuur('ATMA', LUISTER_MS) || '');
        } finally {
          await stuur('ATI', AT_MS);                       // stopt de monitor
          var levend = String(await stuur('ATI', AT_MS) || '');
          if (!levend.trim() || /STOPPED|\?/.test(levend)) mislukt.push('ATI → ' + (levend.trim() ? '"' + levend.trim().slice(0, 12) + '"' : 'geen antwoord'));
          var h0 = String(await stuur('ATH0', AT_MS) || '');
          if (!h0.trim() || /\?/.test(h0)) mislukt.push('ATH0 → ' + (h0.trim() ? '"' + h0.trim().slice(0, 12) + '"' : 'geen antwoord'));
        }
        var u = ontleed(raw, proto);
        if (mislukt.length) u.herstelFout = mislukt.join('; ');
        return u;
      });
      _diag('Meeluisteren: ' + r.oordeel + ' — ' + (r.ids || []).length + ' zender(s), ' + r.frames + ' frames, ' + r.diag + ' diagnose' +
        (r.ids && r.ids.length ? ' [' + r.ids.slice(0, 12).join(' ') + ']' : ''), r.oordeel === 'open' ? 'ok' : 'info');
      if (r.herstelFout) _diag('Meeluisteren: herstel NIET bevestigd (' + r.herstelFout + ') — verbreek en verbind opnieuw', 'err');
      if (r.oordeel === 'open' && window.PLWaarneming) {
        PLWaarneming.meld('canopen', { bewijs: { zenders: r.ids.length, frames: r.frames, protocol: r.protocol, bufferVol: r.bufferVol, voorbeeld: r.ids.slice(0, 6).join(' ') } });
      }
      return r;
    } catch (e) {
      console.warn('meeluister: proef afgebroken', e);
      return { fout: e.message || String(e) };
    } finally { _bezig = false; }
  }

  /* De Admin-knop. */
  async function knop() {
    var toast = function (m) { if (typeof showToast === 'function') showToast(m); else console.warn('meeluister: ' + m); };
    toast('⏳ ' + (LUISTER_MS / 1000) + ' s meeluisteren op de CAN-bus…');
    toast(tekst(await proef()));
  }

  window.PLMeeluister = { ontleed: ontleed, tekst: tekst, proef: proef, knop: knop, DREMPEL_OPEN: DREMPEL_OPEN, LUISTER_MS: LUISTER_MS };
})();
