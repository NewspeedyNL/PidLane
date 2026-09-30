// ══════════════════════════════════════════════════════════════════
// test-sppevents.js — SPP-antwoorden per event in plaats van per poll (#302)
// ──────────────────────────────────────────────────────────────────
// WAAROM (28-09-2026). _sendBTOnce haalde een SPP-antwoord op met
// delay(50) + read() tot er een '>' stond. Elk commando kostte zo minstens
// 50 ms, ook als het antwoord er na 20 ms al was. De plugin kan zelf melden
// wanneer een antwoord compleet is (startNotifications + 'onRead'), en dat is
// nu de eerste keus. De browserproeven vervangen _sendBTOnce in zijn geheel,
// dus deze laag is alleen hier te toetsen.
//
// DE NEP-PLUGIN bootst BluetoothSerialService.BluetoothConnection na
// (@ascentio-it/capacitor-bluetooth-serial 8.0.1): een leesdraad die alles in
// één buffer zet; read() haalt de hele buffer op; met notificaties aan geeft
// appendToBuffer() elk stuk tot en met het scheidingsteken als event af, via
// readUntil() — dat één teken te veel weghaalt, net als het origineel.
//
// WAT HIER ONDERSCHEIDEN MOET WORDEN
//   1. met events is een antwoord van 12 ms binnen ruim onder 50 ms, en in
//      twee stukken binnengekomen is het nog steeds één antwoord
//   2. met pl_spp_poll = 1 pollt hij weer (en dat kost minstens 50 ms)
//   3. SEARCHING... rekt de deadline op, ook zonder '>' binnen de tijd
//   4. een te laat antwoord wordt weggegooid, niet aan het volgende geplakt
//   5. drie time-outs op rij: terug naar pollen, met de reden erbij
//   6. een plugin die startNotifications weigert: pollen, en het werkt
//   7. een nieuwe socket zet de events opnieuw aan
//
// Draaien vanuit public/:  node test-sppevents.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
function lees(b) { return fs.readFileSync(path.join(__dirname, b), 'utf8'); }
function knip(bron, van, tot, wat) {
  const a = bron.indexOf(van), b = bron.indexOf(tot, a < 0 ? 0 : a);
  if (a < 0 || b < 0) { console.error('FOUT: ' + wat + ' niet gevonden (anker verschoven?).'); process.exit(1); }
  return bron.slice(a, b);
}
const src = knip(lees('pidlane-bt.js'), 'const SPP_EV_MISSERS', 'async function sendCmd(cmd, timeoutMs){', 'eventlaag + _sendBTOnce');

// ── de nep-plugin ─────────────────────────────────────────────────
function nepPlugin(opties) {
  const o = opties || {};
  const P = {
    buf: '', notif: false, delim: null, luisteraars: [], starts: 0, geschreven: [],
    antwoorden: {},              // cmd → [{na: ms, stuk: '...'}]
    _append(data) {
      P.buf += data;
      if (!P.notif) return;
      while (P.buf.indexOf(P.delim) >= 0) {
        let i = P.buf.indexOf(P.delim) + P.delim.length;
        const v = P.buf.slice(0, i);
        P.buf = P.buf.slice(i + 1);                 // het origineel: delete(0, index + 1)
        // notifyListeners gaat via de bridge: asynchroon voor de webview.
        P.luisteraars.forEach((f) => setTimeout(() => f({ value: v }), 1));
      }
    },
    async connect() {}, async disconnect() {},
    async isConnected() { return { isConnected: true }; },
    // naSchrijven telt hoe vaak er ná het laatste commando gepold is. Dat is
    // wat de eventstand onderscheidt van de pollstand, en het is geen tijd:
    // tot 29-09-2026 stond hier `a.ms < 40`, en op een drukke CI-runner (de
    // tests draaien daar naast elkaar) liep een antwoord van 12 ms soms over
    // die grens — rood zonder dat er iets mis was (PR #343 en #344).
    naSchrijven: 0,
    async read() { P.naSchrijven++; const v = P.buf; P.buf = ''; return { value: v }; },
    async write({ value }) {
      const c = String(value).replace(/\r$/, '');
      P.naSchrijven = 0;
      P.geschreven.push(c);
      (P.antwoorden[c] || []).forEach((x) => setTimeout(() => P._append(x.stuk), x.na));
    },
    async addListener(naam, f) {
      if (naam !== 'onRead') throw new Error('onbekend event ' + naam);
      P.luisteraars.push(f);
      return { remove: async () => { P.luisteraars = P.luisteraars.filter((g) => g !== f); } };
    },
    async startNotifications({ delimiter }) {
      P.starts++;
      if (o.weiger) throw new Error('Required Android API >= 24');
      P.notif = true; P.delim = delimiter;
    },
    async stopNotifications() { P.notif = false; }
  };
  return P;
}

function bouw(plugin, poll) {
  const s = {
    console: { log() {}, warn() {}, error() {} },
    Object, Array, Math, Number, String, Promise, JSON, Date,
    setTimeout, clearTimeout, TextEncoder,
    diags: [], guards: 0,
    btDiag(m) { s.diags.push(String(m)); },
    log() {},
    delay: (ms) => new Promise((r) => setTimeout(r, ms)),
    async sppReconnectGuard() { s.guards++; },
    async _webSerialSend() { throw new Error('niet in deze test'); },
    btBuffer: '',
    localStorage: { getItem: (k) => (k === 'pl_spp_poll' && poll ? '1' : null), setItem() {}, removeItem() {} }
  };
  s.window = s; s.globalThis = s;
  s._btGen = 1;
  s._sppConn = { spp: plugin, address: 'AA:BB', name: 'nep' };
  vm.createContext(s);
  vm.runInContext(src, s, { filename: 'pidlane-bt.js (knip)' });
  return s;
}
const antw = (P, cmd, stukken) => { P.antwoorden[cmd] = stukken; };
async function vraag(s, cmd, ms) {
  const t0 = Date.now();
  const r = await s._sendBTOnce(cmd, ms || 2500);
  return { r, ms: Date.now() - t0 };
}

(async () => {
  console.log('\n1. Met events: snel, en twee stukken zijn één antwoord');
  {
    const P = nepPlugin(), s = bouw(P);
    antw(P, '010C1', [{ na: 6, stuk: '410C1A' }, { na: 12, stuk: 'F8\r\r>' }]);
    const a = await vraag(s, '010C1');
    toets('het antwoord klopt', a.r === '410C1AF8', JSON.stringify(a.r));
    toets('en kwam per event, zonder één poll (' + a.ms + ' ms)', P.naSchrijven === 0, P.naSchrijven + ' keer gepold na het schrijven');
    toets('de stand is event', s.plSppModus().modus === 'event', JSON.stringify(s.plSppModus()));
    const b = await vraag(s, '010C1');
    toets('een tweede keer: de events blijven aan, één startNotifications', b.r === '410C1AF8' && P.starts === 1, 'starts ' + P.starts);
  }

  console.log('\n2. pl_spp_poll = 1: pollen, zoals vóór 28-09');
  {
    const P = nepPlugin(), s = bouw(P, true);
    antw(P, '010C1', [{ na: 6, stuk: '410C1A' }, { na: 12, stuk: 'F8\r\r>' }]);
    const a = await vraag(s, '010C1');
    toets('hetzelfde antwoord', a.r === '410C1AF8', JSON.stringify(a.r));
    // Polls tellen, geen milliseconden (zoals 1125a9f): een timer van 50 ms
    // meet met Date.now() soms 49 ms, en dat was op CI vals rood (30-09-2026).
    toets('maar pas na de eerste poll (' + a.ms + ' ms)', P.naSchrijven >= 1, a.ms + ' ms, ' + P.naSchrijven + ' poll(s)');
    toets('zonder startNotifications', P.starts === 0 && s.plSppModus().modus === 'poll');
  }

  console.log('\n3. SEARCHING... rekt de deadline op');
  {
    const P = nepPlugin(), s = bouw(P);
    antw(P, '0100', [{ na: 10, stuk: 'SEARCHING...\r' }, { na: 400, stuk: '41 00 BE 1F B8 10\r\r>' }]);
    const a = await vraag(s, '0100', 150);
    toets('het antwoord na de zoektocht komt binnen', /41 00 BE 1F/.test(a.r) && /SEARCHING/.test(a.r), JSON.stringify(a.r));
    toets('en telt niet als misser', s.plSppModus().missers === 0, 'missers ' + s.plSppModus().missers);
  }

  console.log('\n4. Een te laat antwoord hoort bij niets');
  {
    const P = nepPlugin(), s = bouw(P);
    antw(P, '010D1', [{ na: 120, stuk: '410D32\r\r>' }]);
    const a = await vraag(s, '010D1', 40);
    toets('eerst: tijd om, leeg', a.r === '', JSON.stringify(a.r));
    await new Promise((r) => setTimeout(r, 150));
    antw(P, '010C1', [{ na: 5, stuk: '410C1AF8\r\r>' }]);
    const b = await vraag(s, '010C1');
    toets('het volgende commando krijgt zijn eigen antwoord', b.r === '410C1AF8', JSON.stringify(b.r));
    toets('en het late antwoord staat als weggegooid in het BT-log', s.diags.some((d) => /RX zonder vraag weggegooid.*410D32/.test(d)), s.diags.slice(-4).join(' | '));
  }

  console.log('\n5. Drie time-outs op rij: terug naar pollen');
  {
    const P = nepPlugin(), s = bouw(P);
    for (let i = 0; i < 2; i++) await vraag(s, 'STIL', 20);
    toets('na twee nog in eventstand', s.plSppModus().modus === 'event');
    await vraag(s, 'STIL', 20);
    const m = s.plSppModus();
    toets('na drie: poll, met de reden erbij', m.modus === 'poll' && /3 time-outs op rij/.test(m.reden), JSON.stringify(m));
    antw(P, '010C1', [{ na: 5, stuk: '410C1AF8\r\r>' }]);
    const a = await vraag(s, '010C1');
    toets('en de polltak geeft daarna nog steeds antwoord', a.r === '410C1AF8' && P.starts === 1, JSON.stringify(a.r) + ', starts ' + P.starts);
  }

  console.log('\n6. Een plugin die startNotifications weigert');
  {
    const P = nepPlugin({ weiger: true }), s = bouw(P);
    antw(P, '010C1', [{ na: 5, stuk: '410C1AF8\r\r>' }]);
    const a = await vraag(s, '010C1');
    toets('pollen, met antwoord', a.r === '410C1AF8' && s.plSppModus().modus === 'poll', JSON.stringify(a.r));
    toets('de reden staat erbij', /geweigerd/.test(s.plSppModus().reden), s.plSppModus().reden);
    toets('geen luisteraar blijft hangen', P.luisteraars.length === 0, P.luisteraars.length + ' luisteraars');
    await vraag(s, '010C1');
    toets('en hij probeert het op dezelfde socket niet elke keer opnieuw', P.starts === 1, 'starts ' + P.starts);
  }

  console.log('\n7. Een nieuwe socket zet de events opnieuw aan');
  {
    const P = nepPlugin(), s = bouw(P);
    antw(P, '010C1', [{ na: 5, stuk: '410C1AF8\r\r>' }]);
    await vraag(s, '010C1');
    P.notif = false;                                  // nieuwe BluetoothConnection: notificaties uit
    s._sppNieuweSocket();
    const a = await vraag(s, '010C1');
    toets('startNotifications opnieuw, en het antwoord komt per event', a.r === '410C1AF8' && P.starts === 2 && P.naSchrijven === 0, 'starts ' + P.starts + ', ' + P.naSchrijven + ' keer gepold');
    toets('één luisteraar, niet twee', P.luisteraars.length === 1, P.luisteraars.length + ' luisteraars');
  }

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('test-sppevents brak af: ' + (e && e.stack || e)); process.exit(1); });
