// ══════════════════════════════════════════════════════════════════
// test-meeluister.js — ligt de CAN-bus open? (#560, methode 2)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-scanslot.js, pidlane-waarneming.js en
// pidlane-meeluister.js; alleen sendCmd (de adapter) en PLBus zijn nagemaakt.
//
// De onderscheidende vragen:
//   - tester-verkeer (7E8, 18DAF110) telt niet als uitzending — anders heet
//     elke gateway-auto "open" zodra er nog een antwoord in de buffer hing
//   - 11-bit en 29-bit knippen een ander id-stuk
//   - stil wordt NIET vastgelegd, open wel
//   - de headers gaan altijd terug (ATH0), ook als ATMA gooit
//   - een adapter die na het stoppen nog STOPPED zegt, is niet hersteld
//   - geen CAN: er gaat geen ATMA de bus op
//
// Draaien vanuit public/:  node test-meeluister.js       (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, gemeten, verwacht) {
  n++;
  const ok = JSON.stringify(gemeten) === JSON.stringify(verwacht);
  if (!ok) { fout++; console.log('FOUT  ' + naam + '\n      gemeten:  ' + JSON.stringify(gemeten) + '\n      verwacht: ' + JSON.stringify(verwacht)); }
  else console.log('ok    ' + naam);
}
const lees = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

function maakApp(antwoorden) {
  const opslag = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (f) => { f(); return 0; }, setInterval: () => 1, clearInterval() {},
    localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: k => { delete opslag[k]; } },
    vehicleInfo: { vin: 'TESTVIN0000000001' }, connected: true, demoMode: false,
    btDiag() {}, showToast() {},
    verstuurd: [], vlagBijAtma: null
  };
  ctx.window = ctx;
  ctx.PLBus = { wait: async () => 7, raak() {}, release() { ctx.vrijgegeven = true; } };
  ctx.sendCmd = async (cmd) => {
    ctx.verstuurd.push(cmd);
    if (cmd === 'ATMA') ctx.vlagBijAtma = !!ctx._plScanActief;
    const a = antwoorden[cmd];
    if (typeof a === 'function') return a(ctx);
    return a === undefined ? 'OK' : a;
  };
  vm.createContext(ctx);
  for (const f of ['pidlane-scanslot.js', 'pidlane-waarneming.js', 'pidlane-meeluister.js']) vm.runInContext(lees(f), ctx, { filename: f });
  return ctx;
}

const BUS11 = '1A0 8 00 11 22 33 44 55 66 77\r4B0 8 01 02 03 04 05 06 07 08\r7E8 06 41 0C 1A F8 00 00\r201 8 00 00 00 00 00 00 00 00\r1A0 8 00 11 22 33 44 55 66 78';
const ALLEEN_DIAG = '7E8 06 41 0C 1A F8\r7E9 06 41 0C 1A F8\r7DF 02 01 0C';

(async () => {
  const M = maakApp({}).PLMeeluister;

  // ── ontleed: puur ──────────────────────────────────────────────
  let u = M.ontleed(BUS11, 'A6');
  toets('11-bit: drie zenders, 7E8 telt niet mee', [u.oordeel, u.ids, u.diag, u.frames], ['open', ['1A0', '201', '4B0'], 1, 5]);
  u = M.ontleed(ALLEEN_DIAG, '6');
  toets('alleen tester-verkeer is stil, geen uitzending', [u.oordeel, u.ids.length, u.diag], ['stil', 0, 3]);
  u = M.ontleed('18DAF110 06 41 0C 1A F8\r0CF00400 8 FF FF\r18FEF100 8 00\r0C000003 8 01', '7');
  toets('29-bit: acht tekens id, 18DAxxxx is diagnose', [u.oordeel, u.ids, u.diag], ['open', ['0C000003', '0CF00400', '18FEF100'], 1]);
  u = M.ontleed('1A0 8 00 11 22\r4B0 8 01 02 03', '6');
  toets('twee zenders: te weinig voor een oordeel', [u.oordeel, u.ids.length], ['weinig', 2]);
  toets('de drempel komt uit de module', M.DREMPEL_OPEN, 3);
  toets('"?" = adapter kent ATMA niet', M.ontleed('?', '6').oordeel, 'niet_ondersteund');
  toets('K-lijn is geen CAN', M.ontleed(BUS11, 'A3').oordeel, 'geen_can');
  toets('tekstregels (STOPPED, SEARCHING) zijn geen frames', M.ontleed('SEARCHING...\rSTOPPED\rNO DATA', '6').frames, 0);
  u = M.ontleed('1A0 8 00 11 22\rBUFFER FULL', '6');
  toets('buffer vol met een uitzending is open', [u.oordeel, u.bufferVol], ['open', true]);

  // ── proef: met de echte scanslot en waarneming ──────────────────
  let app = maakApp({ ATDPN: 'A6', ATMA: BUS11, ATI: 'ELM327 v1.5' });
  let r = await app.PLMeeluister.proef();
  toets('open: volgorde op de bus', app.verstuurd, ['ATDPN', 'ATH1', 'ATMA', 'ATI', 'ATI', 'ATH0']);
  toets('open: de scanvlag staat aan tijdens ATMA en daarna weer uit', [app.vlagBijAtma, !!app._plScanActief], [true, false]);
  toets('open: vastgelegd bij deze auto', [r.oordeel, app.PLWaarneming.lees('canopen').status, app.PLWaarneming.lees('canopen').bewijs.zenders], ['open', 'gezien', 3]);
  toets('open: busslot vrijgegeven, herstel bewezen', [!!app.vrijgegeven, r.herstelFout || null], [true, null]);

  app = maakApp({ ATDPN: 'A6', ATMA: ALLEEN_DIAG, ATI: 'ELM327 v1.5' });
  r = await app.PLMeeluister.proef();
  toets('stil: niet vastgelegd — stilte is geen bewijs', [r.oordeel, app.PLWaarneming.lees('canopen').status], ['stil', 'onbekend']);
  toets('stil: de tekst zegt dat', /Niet vastgelegd/.test(app.PLMeeluister.tekst(r)), true);

  app = maakApp({ ATDPN: 'A6', ATMA: () => { throw new Error('socket weg'); }, ATI: 'ELM327 v1.5' });
  r = await app.PLMeeluister.proef();
  toets('ATMA gooit (stuur maakt er leeg van): headers terug, stil, niets vastgelegd', [app.verstuurd.slice(-1)[0], r.oordeel, app.PLWaarneming.lees('canopen').status, !!app._plScanActief], ['ATH0', 'stil', 'onbekend', false]);

  let atis = 0;
  app = maakApp({ ATDPN: '6', ATMA: BUS11, ATI: () => (++atis === 1 ? '1A0 8 00\rSTOPPED' : 'STOPPED') });
  r = await app.PLMeeluister.proef();
  toets('adapter blijft STOPPED zeggen: herstel niet bewezen', [/ATI/.test(r.herstelFout || ''), /niet bewezen hersteld/.test(app.PLMeeluister.tekst(r))], [true, true]);

  app = maakApp({ ATDPN: 'A3' });
  r = await app.PLMeeluister.proef();
  toets('K-lijn: geen ATH1, geen ATMA', [r.oordeel, app.verstuurd], ['geen_can', ['ATDPN']]);

  app = maakApp({}); app.connected = false;
  toets('niet verbonden: niets op de bus', [!!(await app.PLMeeluister.proef()).fout, app.verstuurd.length], [true, 0]);

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch(e => { console.log('FOUT  test gooide: ' + (e.stack || e)); process.exit(1); });
