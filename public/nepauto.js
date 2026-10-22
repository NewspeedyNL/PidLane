// ═══════════════════════════════════════════════════════════════════
// nepauto.js — PLNepAuto: een virtuele ELM327 met een auto erachter (#541)
// ───────────────────────────────────────────────────────────────────
// De rittencampagne vraagt vier à vijf merken die ver van de CX-5 afstaan.
// Die zijn er niet. Wat er wél is: per model en bouwjaar de PIDs die een
// échte auto aanbood (OBDb, uit Sidecar-verbindingen), het protocol dat
// erbij hoort (OBDb codeert het in de ECU-sleutel: 7E0 = CAN 11-bit, DB33 =
// CAN 29-bit, C233 = KWP2000, 686A = ISO 9141), en één volledige opname van
// een Toyota Auris hybride (ELM327-emulator). Zie nepauto-profielen.js.
//
// Dit bestand maakt daar een adapter van die antwoordt zoals een ELM327 dat
// doet: echo, headers aan/uit, spaties, SEARCHING..., BUS INIT, ISO-TP
// meerframes met de opvulbytes van het merk, meerdere ECU's op één vraag,
// en per protocol de vorm van mode 03 en 09. Wat hij níét kan staat erbij
// waar het gebeurt; de grens is: een bus onder belasting en wat een ECU
// buiten J1979 doet, blijven een vraag voor een rit.
//
// Puur: geen DOM, geen klok. stuur(cmd) geeft {tekst, ms}; de wachttijd
// laat hij aan de aanroeper. Zo draait hij in node (test-nepauto.js) en in
// de pagina (bproef-merken.js) met dezelfde code.
// ═══════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  // J1979 mode 01: databytes per PID. Eigen tabel, met opzet niet die van
  // de app: een proef die de tabel van de app leent kan een fout erin niet
  // zien (CLAUDE.md, "verzin geen tabellen" — hier andersom: leen ze niet).
  const LEN = {
    '01': 4, '02': 2, '03': 2, '04': 1, '05': 1, '06': 1, '07': 1, '08': 1, '09': 1, '0A': 1, '0B': 1, '0C': 2,
    '0D': 1, '0E': 1, '0F': 1, '10': 2, '11': 1, '12': 1, '13': 1, '14': 2, '15': 2, '16': 2, '17': 2, '18': 2,
    '19': 2, '1A': 2, '1B': 2, '1C': 1, '1D': 1, '1E': 1, '1F': 2, '21': 2, '22': 2, '23': 2, '24': 4, '25': 4,
    '2C': 1, '2D': 1, '2E': 1, '2F': 1, '30': 1, '31': 2, '32': 2, '33': 1, '34': 4, '35': 4, '3C': 2, '3D': 2,
    '3E': 2, '3F': 2, '41': 4, '42': 2, '43': 2, '44': 2, '45': 1, '46': 1, '47': 1, '48': 1, '49': 1, '4A': 1,
    '4B': 1, '4C': 1, '4D': 2, '4E': 2, '4F': 4, '50': 4, '51': 1, '52': 1, '53': 2, '54': 2, '55': 2, '56': 2,
    '57': 2, '58': 2, '59': 2, '5A': 1, '5B': 1, '5C': 1, '5D': 2, '5E': 2, '61': 1, '62': 1, '63': 2, '65': 2,
    '67': 3, '68': 7, '69': 7, '6D': 11, '70': 10, '72': 5, '8E': 1, '9A': 6, '9D': 4, '9E': 2, 'A6': 4
  };

  // Een warme auto stationair, 15 °C buiten. Elke waarde is een gewone
  // waarde, geen grens: 215 °C of 1,275 V zou de plaatshouderproef van de
  // survey raken en dan toets je de nepauto in plaats van de app.
  const STATIONAIR = {
    '02': '0000', '03': '0200', '04': '33', '05': '82', '06': '81', '07': '7D', '08': '80', '09': '7E', '0A': '64',
    '0B': '20', '0C': '0C30', '0D': '00', '0E': '90', '0F': '2E', '10': '0136', '11': '24', '12': '01', '13': '03',
    '14': '5A80', '15': '5A80', '16': '5A80', '17': '5A80', '18': '5A80', '19': '5A80', '1A': '5A80', '1B': '5A80',
    '1C': '06', '1D': '03', '1E': '00', '1F': '0258', '21': '0000', '22': '0050', '23': '0190', '24': '80008000',
    '25': '80008000', '2C': '00', '2D': '80', '2E': '00', '2F': '99', '30': '0A', '31': '0400', '32': '0000',
    '33': '65', '34': '80008000', '35': '80008000', '3C': '11F8', '3D': '11F8', '3E': '0FA0', '3F': '0FA0',
    '42': '3714', '43': '002E', '44': '8000', '45': '0A', '46': '37', '47': '26', '48': '26', '49': '24', '4A': '12',
    '4B': '12', '4C': '0D', '4D': '0000', '4E': '0200', '4F': '00000000', '50': '00000000', '51': '01', '52': '00',
    '53': '0000', '54': '0000', '55': '8080', '56': '8080', '57': '8080', '58': '8080', '59': '0190', '5A': '00',
    '5B': '99', '5C': '84', '5D': '6900', '5E': '0010', '61': '7D', '62': '82', '63': '0190', '65': '0000',
    '67': '018200', '68': '01460000000000', '69': '03000080000000', '6D': '0F00C800C8000000000000',
    '70': '0F006500650000000000', '72': '0F0000002E', '8E': '87', '9A': '0F0000000000', '9D': '00100010',
    '9E': '0010', 'A6': '0024B5C8'
  };
  // Diesel stationair: geen gasklep en geen vonk, luchtdruk in het spruitstuk
  // ≈ buiten, raildruk honderden bar (0123 in eenheden van 10 kPa).
  const DIESEL = { '03': '0000', '0B': '65', '11': '00', '23': '09C4', '2C': '1A', '44': '8000', '51': '04', '0E': '80' };
  // Hybride met de verbrandingsmotor uit: toerental, last en luchtmassa 0.
  // Dat is geen dode sensor, dat is een Toyota bij een stoplicht.
  const MOTOR_UIT = { '04': '00', '0C': '0000', '10': '0000', '0E': '80', '43': '0000', '5E': '0000', '51': '11' };

  const hx = (n) => ('0' + (n & 255).toString(16).toUpperCase()).slice(-2);
  const bytes = (h) => String(h || '').replace(/\s+/g, '').match(/../g) || [];
  const isCan = (p) => /^[6-9AB]$/.test(String(p));
  const PROTO_NAAM = {
    '3': 'ISO 9141-2', '4': 'ISO 14230-4 (KWP 5BAUD)', '5': 'ISO 14230-4 (KWP FAST)',
    '6': 'ISO 15765-4 (CAN 11/500)', '7': 'ISO 15765-4 (CAN 29/500)', '8': 'ISO 15765-4 (CAN 11/250)', '9': 'ISO 15765-4 (CAN 29/250)'
  };

  // DTC 'P0171' → twee bytes
  function dtcBytes(code) {
    const s = { P: 0, C: 1, B: 2, U: 3 }[code[0]];
    const n = parseInt(code.slice(1), 16);
    return [hx((s << 6) | (n >> 8)), hx(n & 255)];
  }

  // Een ECU uit het profiel, aangevuld tot een volledige antwoordtabel.
  function bouwEcu(e, profiel) {
    const pids = {};
    const lijst = Array.isArray(e.pids) ? e.pids : String(e.pids || '').split(/\s+/).filter(Boolean);
    const brandstof = profiel.brandstof || 'benzine';
    lijst.forEach(function (p) {
      p = p.toUpperCase(); if (p.length === 4) p = p.slice(2);
      if (!LEN[p]) throw new Error('nepauto: geen lengte voor PID ' + p + ' (' + profiel.id + ')');
      let v = STATIONAIR[p];
      if (brandstof === 'diesel' && DIESEL[p]) v = DIESEL[p];
      if (profiel.motorUit && MOTOR_UIT[p]) v = MOTOR_UIT[p];
      if (e.waarden && e.waarden[p]) v = e.waarden[p];
      if (p === '01' || p === '41') v = null;                 // hieronder, uit de DTC's
      if (v === undefined) throw new Error('nepauto: geen waarde voor PID ' + p);
      if (v !== null && bytes(v).length !== LEN[p]) throw new Error('nepauto: PID ' + p + ' heeft ' + bytes(v).length + ' bytes, J1979 zegt ' + LEN[p]);
      pids[p] = v;
    });
    return { adres: e.adres, naam: e.naam || '', pids: pids, opname: e.opname || {}, m09: e.m09 !== false, m06: !!e.m06 };
  }

  // Bitmap 00/20/40/...: elk bit een PID, het laatste bit "er is nog een blok".
  function bitmap(pids, basis) {
    let w = 0;
    for (let i = 1; i <= 32; i++) {
      const p = hx(basis + i);
      if (i === 32 ? Object.keys(pids).some((q) => parseInt(q, 16) > basis + 32) : pids[p] !== undefined) w |= (1 << (32 - i)) >>> 0;
    }
    w >>>= 0;
    return [24, 16, 8, 0].map((s) => hx(w >>> s)).join('');
  }

  function maak(profiel, opties) {
    opties = opties || {};
    const ecus = profiel.ecus.map((e) => bouwEcu(e, profiel));
    const proto = String(profiel.proto);
    const can = isCan(proto);
    const bit29 = proto === '7' || proto === '9';
    const st = { E: true, H: false, S: true, L: true, sp: '0', gezocht: false, init: false, sh: null, cra: null, log: [] };

    function readiness() {
      const actief = (profiel.dtc && profiel.dtc['03']) || [];
      const A = (actief.length ? 0x80 : 0) | Math.min(actief.length, 127);
      const r = profiel.readiness || (profiel.brandstof === 'diesel' ? '0FE900' : '076500');
      return hx(A) + r;
    }

    // Antwoord van één ECU op een mode-01 vraag met één of meer PIDs.
    function mode01(e, lijst) {
      const uit = ['41'];
      lijst.forEach(function (p) {
        if (/^(00|20|40|60|80|A0|C0|E0)$/.test(p)) {
          const basis = parseInt(p, 16);
          if (basis === 0 || Object.keys(e.pids).some((q) => parseInt(q, 16) > basis)) uit.push(p, ...bytes(bitmap(e.pids, basis)));
          return;
        }
        if (p === '01') { uit.push('01', ...bytes(readiness())); return; }
        if (p === '41' && e.pids['41'] !== undefined) { uit.push('41', '00', ...bytes(readiness()).slice(1)); return; }
        if (e.pids[p] !== undefined) uit.push(p, ...bytes(e.pids[p]));
      });
      return uit.length > 1 ? uit : null;
    }

    function vin17() { return String(profiel.vin || '').toUpperCase(); }
    function ascii(s, n) { const b = []; for (let i = 0; i < n; i++) b.push(hx(i < s.length ? s.charCodeAt(i) : 0)); return b; }

    // Mode 09 op CAN: één bericht, de app leest de meerframe-vorm.
    function mode09(e, pid) {
      if (!e.m09) return null;
      if (pid === '00') return ['49', '00', ...bytes(profiel.m09bitmap || (vin17() ? '55400000' : '14400000'))];
      if (pid === '02' && vin17() && e === ecus[0]) return ['49', '02', '01', ...ascii(vin17(), 17)];
      if (pid === '04') return ['49', '04', '01', ...ascii(profiel.calid || 'CAL' + profiel.id.toUpperCase(), 16)];
      if (pid === '06') return ['49', '06', '01', ...bytes(profiel.cvn || '1A2B3C4D')];
      if (pid === '0A') return ['49', '0A', '01', ...ascii(e.naam || 'ECM-EngineControl', 20)];
      return null;
    }

    function mode03(e, modus) {
      if (e !== ecus[0]) return null;                        // alleen de motor heeft codes
      const lijst = (profiel.dtc && profiel.dtc[modus]) || [];
      if (modus === '0A' && profiel.geen0A) return null;
      const sid = hx(parseInt(modus, 16) + 0x40);
      const b = [];
      lijst.forEach((c) => b.push(...dtcBytes(c)));
      if (can) return [sid, hx(lijst.length), ...b];
      // Oud J1979: altijd drie codes per bericht, aangevuld met 0000, geen telling.
      const berichten = [];
      do { const d = b.splice(0, 6); while (d.length < 6) d.push('00'); berichten.push([sid, ...d]); } while (b.length);
      return berichten;
    }

    function antwoordBytes(cmd) {
      // Wat elke ECU terugzegt, als lijst van berichten (elk een lijst bytes).
      const doel = st.sh ? ecus.filter((e) => fysiekVan(e) === st.sh) : ecus;
      const uit = [];
      const vast = (profiel.opname || {})[cmd];
      if (vast) return vast.map((f) => ({ adres: f[0], bytes: bytes(f[1]), ruw: !!f[2] }));
      doel.forEach(function (e) {
        let b = null;
        const m = cmd.slice(0, 2), rest = cmd.slice(2);
        if (e.opname[cmd]) { uit.push({ adres: e.adres, bytes: bytes(e.opname[cmd]) }); return; }
        if (m === '01' && rest.length >= 2 && rest.length % 2 === 0) {
          const lijst = rest.match(/../g);
          if (lijst.length > 1 && !can) return;               // meer-PID bestaat alleen op CAN
          if (lijst.length > 6) return;
          b = mode01(e, lijst);
        } else if (m === '09' && rest.length === 2) b = mode09(e, rest);
        else if (/^0[37A]$/.test(cmd)) {
          const r = mode03(e, cmd);
          if (r && !can) { r.forEach((x) => uit.push({ adres: e.adres, bytes: x })); return; }
          b = r;
        } else if (cmd === '04') b = e === ecus[0] ? ['44'] : null;
        else if (m === '06' && can && e.m06 && rest === '00') b = ['46', '00', '00', '00', '00', '00'];
        if (b) uit.push({ adres: e.adres, bytes: b });
      });
      return uit;
    }

    function fysiekVan(e) {
      // 7E8 ← 7E0; 18DAF110 ← DA10F1
      if (/^7E[89A-F]$/.test(e.adres)) return '7E' + (parseInt(e.adres[2], 16) - 8).toString(16).toUpperCase();
      if (/^18DAF1/.test(e.adres)) return 'DA' + e.adres.slice(6) + 'F1';
      return null;
    }

    const sep = () => (st.S ? ' ' : '');
    function koppen(adres, data) {
      if (!st.H) return data;
      if (can) {
        const h = bit29 ? adres.match(/../g).join(sep()) : adres;
        return h + sep() + data;
      }
      return data; // (niet-CAN: kop + checksum, zie regels() hieronder)
    }

    function regels(berichten) {
      const uit = [];
      berichten.forEach(function (m) {
        const b = m.bytes;
        if (!can) {
          if (!st.H) { uit.push(b.join(sep())); return; }
          const kop = proto === '3' ? ['48', '6B', m.adres.slice(-2)] : [hx(0x80 + b.length), 'F1', m.adres.slice(-2)];
          const alles = kop.concat(b);
          const cs = alles.reduce((s, x) => (s + parseInt(x, 16)) & 255, 0);
          uit.push(alles.concat([hx(cs)]).join(sep()));
          return;
        }
        if (b.length <= 7) { uit.push(koppen(m.adres, (st.H ? [hx(b.length)] : []).concat(b).join(sep()))); return; }
        // ISO-TP: eerste frame 6 bytes, dan volgframes van 7, aangevuld met
        // de opvulbyte van het merk (VAG: AA, Toyota: 00, PSA: 55).
        const pad = profiel.pad || '00';
        const rest = b.slice(6);
        const frames = [b.slice(0, 6)];
        while (rest.length) { const f = rest.splice(0, 7); while (f.length < 7) f.push(pad); frames.push(f); }
        if (st.H) {
          uit.push(koppen(m.adres, ['1' + hx(b.length >> 8).slice(1), hx(b.length)].concat(frames[0]).join(sep())));
          frames.slice(1).forEach((f, i) => uit.push(koppen(m.adres, [hx(0x20 + ((i + 1) & 15))].concat(f).join(sep()))));
        } else {
          uit.push(('00' + b.length.toString(16).toUpperCase()).slice(-3));
          frames.forEach((f, i) => uit.push((i & 15).toString(16).toUpperCase() + ':' + sep() + f.join(sep())));
        }
      });
      return uit;
    }

    function at(c) {
      const a = c.slice(2);
      if (a === 'Z' || a === 'WS') { st.E = true; st.H = false; st.S = true; st.sh = null; st.cra = null; st.init = false; return 'ELM327 v1.5'; }
      if (a === 'I') return 'ELM327 v1.5';
      if (a === '@1') return 'OBDII to RS232 Interpreter';
      if (a === 'RV') return profiel.accu || '14.1V';
      if (/^E[01]$/.test(a)) { st.E = a[1] === '1'; return 'OK'; }
      if (/^H[01]$/.test(a)) { st.H = a[1] === '1'; return 'OK'; }
      if (/^S[01]$/.test(a)) { st.S = a[1] === '1'; return 'OK'; }
      if (/^L[01]$/.test(a)) { st.L = a[1] === '1'; return 'OK'; }
      if (/^SPA?[0-9A-C]$/.test(a)) { st.sp = a.slice(-1); st.gezocht = false; st.init = false; return 'OK'; }
      if (/^TP A?[0-9A-C]$/.test(a)) return 'OK';
      if (a === 'DPN') return (st.sp === '0' ? 'A' : '') + (st.gezocht || st.sp !== '0' ? (st.sp === '0' ? proto : st.sp) : '0');
      if (a === 'DP') return (st.sp === '0' ? 'AUTO, ' : '') + (PROTO_NAAM[st.sp === '0' ? proto : st.sp] || 'AUTOMATIC');
      if (/^SH/.test(a)) { const h = a.slice(2); st.sh = (h === '7DF' || /^DB33F1$/.test(h) || /^18DB33F1$/.test(h)) ? null : (h.length === 8 ? h.slice(2) : h); return 'OK'; }
      if (/^CRA/.test(a)) { st.cra = a.slice(3) || null; return 'OK'; }
      if (/^(AT[0-2]|ST[0-9A-F]{2}|CAF[01]|CFC[01]|D|D[01]|M[01]|AL|NL|R[01]|FC.*|CEA.*|TA.*|SW.*|IB.*|KW.*|BI|PC|LP|SI|FI|AR|V[01]|CS|MA|BRD.*)$/.test(a)) return 'OK';
      return '?';
    }

    function stuur(ruw) {
      const c = String(ruw || '').toUpperCase().replace(/\s+/g, '');
      st.log.push(c);
      const echo = (t) => (st.E ? c + '\r' : '') + t;
      if (!c) return { tekst: echo('?'), ms: 5 };
      if (/^AT/.test(c)) return { tekst: echo(at(c)), ms: 8 };
      if (/^ST/.test(c)) return { tekst: echo('?'), ms: 8 };        // kloon: geen STN
      if (!/^[0-9A-F]+$/.test(c)) return { tekst: echo('?'), ms: 8 };

      // Protocol: past het gekozen protocol niet bij de auto, dan zegt de
      // ELM wat hij op de lijn zag — en dat verschilt per soort.
      const gekozen = st.sp === '0' ? proto : st.sp;
      if (gekozen !== proto) {
        if (isCan(gekozen)) return { tekst: echo(isCan(proto) ? 'NO DATA' : 'CAN ERROR'), ms: 300 };
        if (gekozen === '3') return { tekst: echo('UNABLE TO CONNECT'), ms: 3000 };
        return { tekst: echo('BUS INIT: ...ERROR'), ms: 3000 };
      }
      let voor = '';
      let ms = can ? 18 : 70;
      if (!st.gezocht && st.sp === '0') { voor = 'SEARCHING...\r'; ms += can ? 400 : 2600; }
      else if (!st.init && (proto === '4' || proto === '5')) { voor = 'BUS INIT: ...OK\r'; ms += 1800; }
      st.gezocht = true; st.init = true;

      // Antwoordcijfer achteraan ('010C1', '010C0D2'): een oneven aantal
      // hextekens na de mode betekent één cijfer extra.
      let body = c;
      if (/^01/.test(c) && (c.length - 2) % 2 === 1) body = c.slice(0, -1);
      if (/^09/.test(c) && c.length === 5) body = c.slice(0, -1);
      let ber = antwoordBytes(body);
      if (st.cra) ber = ber.filter((m) => m.adres === st.cra || m.adres.endsWith(st.cra));
      if (!ber.length) return { tekst: echo(voor + 'NO DATA'), ms: ms + (can ? 60 : 120) };
      const r = regels(ber);
      ms += (r.length - 1) * (can ? 4 : 50);
      return { tekst: echo(voor + r.join('\r')), ms: ms };
    }

    return {
      stuur: stuur,
      staat: () => ({ E: st.E, H: st.H, S: st.S, sp: st.sp, sh: st.sh, cra: st.cra }),
      log: st.log,
      pids: () => Object.keys(Object.assign({}, ...ecus.map((e) => e.pids))).map((p) => '01' + p).sort(),
      ecus: () => ecus.map((e) => e.adres),
      ecuPids: () => ecus.map((e) => Object.keys(e.pids).map((p) => '01' + p).sort())
    };
  }

  const api = { maak: maak, LEN: LEN, STATIONAIR: STATIONAIR, bitmap: bitmap, PROTO_NAAM: PROTO_NAAM };
  root.PLNepAuto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
