// ══════════════════════════════════════════════════════════════════
// test-sppoudsluiten.js — een socket die nog openstaat gaat eerst dicht
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (30-09-2026)
// "De eerste rit gaat goed. Dan een update, opnieuw verbinden: telkens op de
// knop van de adapter drukken." Een herlaad van de pagina sluit de
// Bluetooth-socket niet — die leeft in de plugin, in het Android-proces — en
// een OBDLink MX+ neemt maar één verbinding tegelijk aan. doSPPConnect()
// vraagt nu eerst of er nog iets openstaat, en sluit dat.
//
// Met de echte sppOudeSluiten() en doSPPConnect() uit pidlane-bt.js, en een
// nagemaakte plugin.
//
// Draaien vanuit public/:  node test-sppoudsluiten.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(__dirname + '/pidlane-bt.js', 'utf8');
const van = bron.indexOf('const SPP_OPRUIM_MS=');
const tot = bron.indexOf('\n}\n', bron.indexOf('async function doSPPConnect(')) + 3;
if (van < 0 || tot < 3) { console.log('  FOUT anker niet gevonden in pidlane-bt.js'); process.exit(1); }
const stuk = bron.slice(van, tot);

/* open: wat isConnected zegt (true/false/'traag'/'fout'). */
function bouw(open, opt) {
  opt = opt || {};
  const spoor = [], logs = [];
  const spp = {
    isConnected: function (a) {
      spoor.push('isConnected:' + a.address);
      if (open === 'traag') return new Promise(function () {});
      if (open === 'fout') return Promise.reject(new Error('plugin weet het niet'));
      return Promise.resolve({ connected: open });
    },
    disconnect: function (a) { spoor.push('disconnect:' + a.address); return Promise.resolve(); },
    connect: function (a) { spoor.push('connect:' + a.address); return Promise.resolve(); }
  };
  const ctx = {
    window: {}, console: { warn: function () {} }, Promise: Promise,
    setTimeout: function (f, ms) { return setTimeout(f, Math.min(ms, 5)); },
    localStorage: { setItem: function () {} },
    btDiag: function (m) { spoor.push('diag'); },
    log: function (m, t) { logs.push(m); },
    delay: function () { return Promise.resolve(); },
    _sppNieuweSocket: function () {}, logToSheets: function () {}, setConn: function () {},
    initELM327: async function () { spoor.push('init'); }, scanNetworks: async function () {},
    plDemoStop: function () {}, demoMode: false, connected: false
  };
  ctx.window._sppConn = opt.eigen || undefined;
  vm.createContext(ctx);
  vm.runInContext(stuk + '\nthis.doSPPConnect = doSPPConnect; this.sppOudeSluiten = sppOudeSluiten;', ctx);
  return { ctx: ctx, spp: spp, spoor: spoor, logs: logs };
}

(async function () {
  console.log('\n1. Er staat nog een verbinding open (na een herlaad)');
  {
    const b = bouw(true);
    await b.ctx.doSPPConnect(b.spp, 'AA:BB', 'OBDLink MX+');
    const s = b.spoor.filter(function (x) { return /^(isConnected|disconnect|connect)/.test(x); });
    toets('eerst vragen, dan sluiten, dan pas verbinden', JSON.stringify(s) === JSON.stringify(['isConnected:AA:BB', 'disconnect:AA:BB', 'connect:AA:BB']), JSON.stringify(s));
    toets('het logboek zegt dat er nog een openstond, van vóór de herlaad', b.logs.some(function (m) { return /nog een Bluetooth-verbinding.*van vóór de herlaad/.test(m); }), JSON.stringify(b.logs));
  }

  console.log('\n2. Binnen één sessie (het dode-socketpad) ook');
  {
    const b = bouw(true, { eigen: { address: 'AA:BB' } });
    await b.ctx.doSPPConnect(b.spp, 'AA:BB', 'OBDLink MX+');
    toets('ook dan eerst dicht', b.spoor.indexOf('disconnect:AA:BB') >= 0 && b.spoor.indexOf('disconnect:AA:BB') < b.spoor.indexOf('connect:AA:BB'), JSON.stringify(b.spoor));
    toets('en het logboek noemt het de vorige verbinding', b.logs.some(function (m) { return /van de vorige verbinding/.test(m); }), JSON.stringify(b.logs));
  }

  console.log('\n3. Niets open: niets sluiten, niets melden');
  {
    const b = bouw(false);
    await b.ctx.doSPPConnect(b.spp, 'AA:BB', 'OBDLink MX+');
    toets('geen disconnect', b.spoor.indexOf('disconnect:AA:BB') < 0, JSON.stringify(b.spoor));
    toets('wel verbonden', b.spoor.indexOf('connect:AA:BB') >= 0);
    toets('geen melding', !b.logs.some(function (m) { return /nog een Bluetooth-verbinding/.test(m); }));
  }

  console.log('\n4. Een plugin die niet of fout antwoordt houdt het verbinden niet op');
  for (const soort of ['traag', 'fout']) {
    const b = bouw(soort);
    const t = Date.now();
    await b.ctx.doSPPConnect(b.spp, 'AA:BB', 'OBDLink MX+');
    toets(soort + ': toch verbonden', b.spoor.indexOf('connect:AA:BB') >= 0, JSON.stringify(b.spoor));
    toets(soort + ': niets gesloten op een gok', b.spoor.indexOf('disconnect:AA:BB') < 0, JSON.stringify(b.spoor));
    toets(soort + ': binnen een seconde', Date.now() - t < 1000, (Date.now() - t) + ' ms');
  }

  console.log('\n5. Een onduidelijk antwoord telt niet als "open"');
  {
    const b = bouw(undefined);
    await b.ctx.doSPPConnect(b.spp, 'AA:BB', 'OBDLink MX+');
    toets('{connected: undefined} sluit niets', b.spoor.indexOf('disconnect:AA:BB') < 0, JSON.stringify(b.spoor));
  }

  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(function (e) { console.log('  FOUT de test zelf faalde: ' + (e && e.stack || e)); process.exit(1); });
