/* ═════════════════════════════════════════════════════════════════
   pidlane-uds.js — PLUds: foutcodes van ÁLLE stuurapparaten (UDS 0x19)
   ─────────────────────────────────────────────────────────────────
   WAT DIT LEEST DAT NIETS ANDERS LEEST

   Mode 03/07/0A vragen functioneel (7DF) en daar antwoorden alleen de
   stuurapparaten die de emissiewetgeving raakt: motor en meestal de
   versnellingsbak. ABS, airbag, instrumentenpaneel en carrosserie zwijgen
   daar — ook als ze een code hebben. Een "groen" stoplicht zei dus niets
   over het ABS-lampje.

   UDS ReadDTCInformation (19 02 FF = reportDTCByStatusMask, alle bits)
   wordt per stuurapparaat fysiek gevraagd: ATSH <adres>, ATCRA <adres+8>.
   Zelfde aanpak als PLKm (pidlane-kmcheck.js), en net als daar wordt de
   adapter in een finally teruggezet op 7DF — anders praat de rest van de
   app daarna alleen nog tegen het laatste stuurapparaat.

   ANTWOORD
     59 02 <beschikbaarheidsmasker> { <DTC hi> <DTC mid> <FTB> <status> }*
   De eerste twee bytes coderen P/C/B/U + vier tekens zoals in mode 03;
   de derde is het faaltype (FTB, bv. 11 = kortsluiting naar massa).
   Status: bit 0 nu actief, bit 2 in afwachting, bit 3 bevestigd,
   bit 7 lampje gevraagd.

   WAT HIER NIET GETOETST IS
   De adressen buiten 7E0–7E7 verschillen per merk (een airbag zit bij
   VAG op 715, bij Ford op 737). Een stil adres is daarom 'geen antwoord',
   nooit 'geen codes'. Welke adressen op welke auto antwoorden is een
   vraag voor een rit (CAMPAGNE). Alleen 11-bit CAN (ATDPN 6 of 8).

   Alles hier is lezend. 0x19 schrijft niet en wist niets.

   Laadvolgorde: ná pidlane-bt.js (sendCmd) en pidlane-data.js (withBus).
   ═════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CFG = { cmdTimeoutMs: 3000, atTimeoutMs: 1500, pauzeMs: 90, busWachtMs: 9000 };

  // `naam` is voor de mens en mag onzeker zijn; het adres is de identiteit.
  var MODULES = [
    { hdr: '7E0', naam: 'Motor' },
    { hdr: '7E1', naam: 'Versnellingsbak' },
    { hdr: '7E2', naam: 'Hybride / aandrijving' },
    { hdr: '760', naam: 'ABS / ESP' },
    { hdr: '7B0', naam: 'ABS / ESP' },
    { hdr: '720', naam: 'Instrumentenpaneel' },
    { hdr: '726', naam: 'Carrosserie (BCM)' },
    { hdr: '737', naam: 'Airbag' },
    { hdr: '715', naam: 'Airbag' },
    { hdr: '730', naam: 'Stuurbekrachtiging' }
  ];

  function rxVan(hdr) { return (parseInt(hdr, 16) + 8).toString(16).toUpperCase(); }

  function woordNaarCode(w) {
    return ['P', 'C', 'B', 'U'][(w >> 14) & 3] + ((w >> 12) & 3) +
      ((w >> 8) & 0xF).toString(16).toUpperCase() +
      ('0' + (w & 0xFF).toString(16).toUpperCase()).slice(-2);
  }

  /* De berichten in een ELM-antwoord. Multi-frame: eerst een regel met de
     lengte (3 hex), dan "0: …", "1: …". Een 7F 19 78 (even geduld) is
     een eigen bericht en wordt hieronder overgeslagen. */
  function berichten(raw) {
    var uit = [], huidig = null;
    String(raw || '').split(/[\r\n]+/).forEach(function (r) {
      var l = r.replace(/>/g, '').trim().toUpperCase();
      if (!l || /SEARCHING|BUS INIT|^OK$/.test(l)) return;
      var ff = l.match(/^([0-9A-F]{3})$/);
      if (ff) { huidig = { hex: '', lengte: parseInt(ff[1], 16) }; uit.push(huidig); return; }
      var fr = l.match(/^[0-9A-F]:\s*(.*)$/);
      if (fr && huidig) { huidig.hex += fr[1].replace(/[^0-9A-F]/g, ''); return; }
      huidig = null;
      uit.push({ hex: l.replace(/[^0-9A-F]/g, ''), lengte: null });
    });
    uit.forEach(function (b) { if (b.lengte != null) b.hex = b.hex.slice(0, b.lengte * 2); });
    return uit.filter(function (b) { return b.hex.length; });
  }

  var NRC = { '11': 'kent UDS-foutcodes niet', '12': 'subfunctie onbekend', '13': 'verkeerde lengte', '22': 'condities niet goed', '31': 'buiten bereik', '33': 'beveiliging vereist' };

  /* → { staat: 'stil' }                  geen antwoord op dit adres
     → { staat: 'geweigerd', nrc, tekst } het stuurapparaat zegt nee
     → { staat: 'gelezen', codes: [...] } ook als de lijst leeg is
     "Stil" en "gelezen, leeg" zijn nooit hetzelfde (zelfde regel als #218). */
  // Status-bits (ISO 14229): 0 nu fout, 1 fout deze rit, 2 in afwachting,
  // 3 bevestigd, 5 fout sinds het wissen, 7 lampje. Niet: 4 en 6 (test niet
  // gedraaid sinds wissen / deze rit).
  var FOUTBITS = 0x01 | 0x02 | 0x04 | 0x08 | 0x20 | 0x80;

  function parse19(raw) {
    var t = String(raw || '').toUpperCase();
    if (!t.trim() || /NO DATA|ERROR|UNABLE|STOPPED|BUFFER|\?/.test(t)) return { staat: 'stil' };
    var weiger = null, body = null;
    berichten(t).forEach(function (b) {
      var h = b.hex, i = -1;
      [0, 3, 5].some(function (o) { if (h.indexOf('5902', o) === o) { i = o; return true; } return false; });
      if (i >= 0 && body == null) { body = h.slice(i + 6); return; }      // na 59 02 <masker>
      var n = h.indexOf('7F19');
      if (n >= 0 && h.substr(n + 4, 2) !== '78') weiger = h.substr(n + 4, 2);
    });
    if (body == null) return weiger ? { staat: 'geweigerd', nrc: weiger, tekst: NRC[weiger] || 'reden ' + weiger } : { staat: 'stil' };
    var codes = [];
    for (var j = 0; j + 8 <= body.length; j += 8) {
      var w = parseInt(body.substr(j, 4), 16), ftb = body.substr(j + 4, 2), st = parseInt(body.substr(j + 6, 2), 16);
      // Alleen de foutbits tellen. Bit 4 en 6 zeggen "test nog niet
      // gedraaid": met masker FF stuurt een Mazda (CX-5, 15-10-2026) zijn
      // hele lijst bekende codes terug met alleen die bits aan. Dat zijn
      // geen fouten, en ze stonden als elf codes "in het geheugen" in beeld.
      if (!w || isNaN(w) || !(st & FOUTBITS)) continue;
      var code = woordNaarCode(w);
      if (codes.some(function (c) { return c.code === code && c.ftb === ftb; })) continue;
      codes.push({ code: code, ftb: ftb, status: st, actief: !!(st & 1), dezeRit: !!(st & 2), pending: !!(st & 4), bevestigd: !!(st & 8), eerder: !!(st & 0x20), lamp: !!(st & 0x80) });
    }
    // Actief en met lampje bovenaan; daarna wat alleen nog in het geheugen staat.
    codes.sort(function (a, b) { return (b.lamp - a.lamp) || (b.actief - a.actief) || (b.bevestigd - a.bevestigd); });
    return { staat: 'gelezen', codes: codes };
  }

  function pauze(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function diag(msg, lvl) { try { if (typeof btDiag === 'function') btDiag(msg, lvl || 'info'); } catch (e) { console.warn('PLUds: diag', e); } }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }

  /* stuur(cmd, ms) → Promise<string>. Standaard sendCmd; de test en de
     demo geven een eigen. */
  async function scan(stuur) {
    stuur = stuur || (isDemo() ? demoStuur() : null);
    if (!stuur) {
      if (typeof sendCmd !== 'function') throw new Error('sendCmd niet beschikbaar');
      if (typeof connected !== 'undefined' && !connected) throw new Error('geen verbinding');
      stuur = function (c, ms) { return sendCmd(c, ms); };
    }
    var res = { tijd: Date.now(), protocol: '', modules: [] };
    var werk = async function () {
      try { res.protocol = String(await stuur('ATDPN', CFG.atTimeoutMs) || '').replace(/[^0-9A-Za-z]/g, ''); }
      catch (e) { console.warn('PLUds: ATDPN mislukt', e); }
      if (!/^A?[68]$/i.test(res.protocol)) { res.nietCan = true; return; }
      try {
        for (var i = 0; i < MODULES.length; i++) {
          var m = MODULES[i], r = { hdr: m.hdr, naam: m.naam };
          try {
            await stuur('ATSH' + m.hdr, CFG.atTimeoutMs);
            try { await stuur('ATCRA' + rxVan(m.hdr), CFG.atTimeoutMs); }
            catch (e) { console.warn('PLUds: ATCRA geweigerd voor ' + m.hdr + ', zonder filter verder', e); r.zonderFilter = true; }
            var ruw = await stuur('1902FF', CFG.cmdTimeoutMs);
            var p = parse19(ruw);
            if (p.staat !== 'stil') diag('UDS ' + m.hdr + ' RX: ' + String(ruw || '').replace(/\s+/g, ' ').trim().slice(0, 300), 'info');
            for (var k in p) r[k] = p[k];
          } catch (e) { console.warn('PLUds: ' + m.hdr + ' niet gelezen', e); r.staat = 'stil'; r.fout = String(e.message || e); }
          res.modules.push(r);
          await pauze(CFG.pauzeMs);
        }
      } finally {
        try { await stuur('ATSH7DF', CFG.atTimeoutMs); } catch (e) { console.warn('PLUds: ATSH7DF mislukt — verbind opnieuw', e); diag('UDS: adapter niet teruggezet op 7DF — verbind opnieuw', 'warn'); }
        try { await stuur('ATCRA', CFG.atTimeoutMs); } catch (e) { console.warn('PLUds: ATCRA (wissen) mislukt', e); }
      }
    };
    if (!isDemo() && typeof withBus === 'function') await withBus('uds', werk, CFG.busWachtMs);
    else await werk();
    _laatste = res;
    var n = res.modules.reduce(function (s, m) { return s + ((m.codes || []).length); }, 0);
    diag('UDS: ' + res.modules.filter(function (m) { return m.staat !== 'stil'; }).length + ' stuurapparaten antwoordden, ' + n + ' code(s)', n ? 'warn' : 'ok');
    return res;
  }

  function demoStuur() {
    var hdr = '7DF';
    var A = {
      '7E0': '59 02 FF 01 71 00 08',
      '760': '00B\n0: 59 02 FF 40 35 11 09\n1: 50 73 00 08 00 00 00',
      '720': '59 02 FF',
      '737': '7F 19 11'
    };
    return function (cmd) {
      if (cmd === 'ATDPN') return pauze(40).then(function () { return 'A6'; });
      if (/^ATSH/.test(cmd)) { hdr = cmd.slice(4); return pauze(20).then(function () { return 'OK'; }); }
      if (/^AT/.test(cmd)) return pauze(20).then(function () { return 'OK'; });
      return pauze(120).then(function () { return A[hdr] || 'NO DATA'; });
    };
  }

  var _laatste = null;

  /* Het verslag als tekst, voor het sessiearchief (Rapporten) en voor het
     bewaarde foutcoderapport van PLFoutcodes. */
  function rapport(res) {
    var r = ['PidLane — Alle stuurapparaten (UDS 19 02)', 'Datum: ' + new Date(res.tijd).toLocaleString('nl'), ''];
    return r.concat(alsTekst(res)).join('\n');
  }
  function bewaarInSessie(res) {
    if (!res) return false;
    try { if (typeof registerSessionReport === 'function') { registerSessionReport({ type: 'uds', title: 'Alle stuurapparaten', text: rapport(res) }); return true; } }
    catch (e) { console.warn('PLUds: niet in het sessiearchief gezet', e); }
    return false;
  }

  // ── Weergave ─────────────────────────────────────────────────────
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function omschrijving(code) {
    try { var i = typeof dtcInfo === 'function' ? dtcInfo(code) : null; return i && i.desc ? i.desc : ''; }
    catch (e) { console.warn('PLUds: dtcInfo faalde voor ' + code, e); return ''; }
  }
  function statusTekst(c) {
    return [c.actief ? 'nu actief' : (c.dezeRit ? 'deze rit gezien' : ''), c.bevestigd ? 'bevestigd' : '', c.pending ? 'in afwachting' : '', c.lamp ? 'lampje aan' : '']
      .filter(Boolean).join(', ') || 'eerder opgetreden, sinds het wissen';
  }

  function alsTekst(res) {
    if (!res) return [];
    if (res.nietCan) return ['Geen 11-bit CAN (ATDPN ' + (res.protocol || '—') + '): stuurapparaten niet apart te bevragen.'];
    var r = [];
    res.modules.forEach(function (m) {
      if (m.staat === 'stil') return;
      if (m.staat === 'geweigerd') { r.push(m.naam + ' (' + m.hdr + '): ' + m.tekst); return; }
      if (!m.codes.length) { r.push(m.naam + ' (' + m.hdr + '): geen codes'); return; }
      m.codes.forEach(function (c) { r.push(m.naam + ' (' + m.hdr + '): ' + c.code + '-' + c.ftb + ' — ' + statusTekst(c) + (omschrijving(c.code) ? ' — ' + omschrijving(c.code) : '')); });
    });
    var stil = res.modules.filter(function (m) { return m.staat === 'stil'; }).map(function (m) { return m.hdr; });
    if (stil.length) r.push('Geen antwoord (bestaat niet op deze auto, of een ander adres): ' + stil.join(', '));
    return r;
  }

  function render(res) {
    if (!res) return '';
    if (res.nietCan) return '<div style="color:var(--tx2)">' + esc(alsTekst(res)[0]) + '</div>';
    var h = '';
    res.modules.filter(function (m) { return m.staat !== 'stil'; }).forEach(function (m) {
      h += '<div style="padding:8px 0;border-top:1px solid var(--bd)"><div style="font-weight:700">' + esc(m.naam) + ' <span style="color:var(--tx3);font-weight:500">' + esc(m.hdr) + '</span></div>';
      if (m.staat === 'geweigerd') h += '<div style="color:var(--tx2)">' + esc(m.tekst) + '</div>';
      else if (!m.codes.length) h += '<div style="color:var(--gn)">Geen foutcodes</div>';
      else m.codes.forEach(function (c) {
        var oms = omschrijving(c.code);
        h += '<div style="color:' + (c.lamp || c.actief ? 'var(--rd,#ef4444)' : 'var(--tx)') + '"><b>' + esc(c.code) + '</b>-' + esc(c.ftb) +
          (oms ? ' · ' + esc(oms) : '') + ' <span style="color:var(--tx2)">(' + esc(statusTekst(c)) + ')</span></div>';
      });
      h += '</div>';
    });
    var stil = res.modules.filter(function (m) { return m.staat === 'stil'; });
    if (stil.length === res.modules.length) h += '<div style="color:var(--tx2)">Geen enkel stuurapparaat antwoordde apart. Dat is geen "geen codes".</div>';
    else if (stil.length) h += '<div style="color:var(--tx3);margin-top:6px;font-size:12px">Geen antwoord op ' + esc(stil.map(function (m) { return m.hdr; }).join(', ')) + ' — dat adres bestaat niet op deze auto, of het stuurapparaat zit op een ander adres.</div>';
    return h;
  }

  // ── Paneel ───────────────────────────────────────────────────────
  var _p = { open: false, bezig: false, res: null, fout: '' };
  function paneel() {
    if (!_p.open) return;
    var v = document.getElementById('plUdsPaneel');
    if (!v) {
      // Venster over alles heen, ook boven Check mijn auto (--z-modal), met
      // de veilige rand onderaan: los onderin viel Sluiten achter de
      // systeembalk van Android (15-10-2026).
      v = document.createElement('div');
      v.id = 'plUdsPaneel';
      v.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal-hoog,9800);background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;' +
        'padding:calc(12px + var(--pl-sat,0px)) 12px calc(12px + var(--pl-sab,0px))';
      v.innerHTML = '<div id="plUdsDoos" style="width:100%;max-width:640px;max-height:100%;overflow:auto;background:var(--sur);color:var(--tx);' +
        'border:1px solid var(--bd);border-radius:12px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:500 13px/1.45 var(--f)"></div>';
      v.addEventListener('click', function (e) {
        if (e.target === v) return sluit();
        var a = e.target && e.target.getAttribute && e.target.getAttribute('data-uds');
        if (a === 'scan') open(); else if (a === 'sluit') sluit();
      });
      document.body.appendChild(v);
    }
    var knop = 'flex:1;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:700 13px var(--f)';
    var h = '<div style="font-weight:800;font-size:15px;margin-bottom:2px">🧩 Alle stuurapparaten</div>' +
      '<div style="color:var(--tx2);margin-bottom:8px">ABS, airbag, versnellingsbak, instrumentenpaneel — wat de gewone uitlezing niet ziet.</div>';
    if (_p.bezig) h += '<div style="color:var(--tx2)">Bezig met uitlezen, één stuurapparaat per keer…</div>';
    else if (_p.fout) h += '<div style="color:var(--or)">' + esc(_p.fout) + '</div>';
    else h += render(_p.res);
    h += '<div style="display:flex;gap:8px;margin-top:10px"><button type="button" data-uds="scan" style="' + knop + '"' + (_p.bezig ? ' disabled' : '') + '>Opnieuw lezen</button>' +
      '<button type="button" data-uds="sluit" style="' + knop + '">Sluiten</button></div>';
    document.getElementById('plUdsDoos').innerHTML = h;
  }
  async function open() {
    _p.open = true;
    if (_p.bezig) return paneel();
    _p.bezig = true; _p.fout = ''; paneel();
    try { _p.res = await scan(); bewaarInSessie(_p.res); }
    catch (e) { console.warn('PLUds: scan faalde', e); _p.res = null; _p.fout = 'Niet gelezen: ' + (e.message || e); }
    _p.bezig = false; paneel();
  }
  function sluit() {
    _p.open = false;
    var v = document.getElementById('plUdsPaneel');
    if (v) v.remove();
  }

  window.PLUds = {
    MODULES: MODULES, scan: scan, parse19: parse19, alsTekst: alsTekst, render: render,
    open: open, sluit: sluit, laatste: function () { return _laatste; }, rapport: rapport, bewaarInSessie: bewaarInSessie, demoStuur: demoStuur
  };
})();
