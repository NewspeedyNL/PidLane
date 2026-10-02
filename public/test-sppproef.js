// ══════════════════════════════════════════════════════════════════
// test-sppproef.js — de adminknoppen van #352 bewerken de bus netjes
// ──────────────────────────────────────────────────────────────────
// WAT HIER GETOETST WORDT, met de echte pidlane-sppproef.js en de echte
// pidlane-scanslot.js in een vm, en een nagemaakte SPP-plugin:
//
//   1. stat() en oordeel() — het rekenwerk, met elk van de uitkomsten, en
//      de tegenproef dat een patch-APK met een draad erbij FOUT is
//   2. DE BUS WORDT BEWERKT, EN DE APP WEET HET. Op het moment van de
//      mislukte connect() en van elk meetcommando staat _plScanActief aan
//      — dan tellen PLBus.note() en de dode-socket-detectie niet mee — en
//      is het busslot geclaimd, zodat de pollus stilstaat
//   3. na een nabootsing ZONDER patch staat de markering in sessionStorage;
//      MET patch niet — anders wordt elke patch-APK voor altijd "aangetast"
//   4. de dode-socketknop volgt het pad van trackBtQuality(): connectSerial
//      met de hervatstand, zonder eerst de oude socket te sluiten
//   5. de knoppen staan in het Admin-menu, één keer
//
// Wat hier NIET getoetst wordt: of een echte telefoon een draad achterlaat.
// Dat is de knop zelf; het nagebouwde gedrag van de plugin staat in
// test-spppatch.js.
//
// Draaien vanuit public/:  node test-sppproef.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let n = 0, fout = 0;
function toets(naam, kreeg, verwacht) {
  n++;
  const a = JSON.stringify(kreeg), b = JSON.stringify(verwacht);
  if (a === b) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + '\n        kreeg    ' + a + '\n        verwacht ' + b);
}

const BRON = fs.readFileSync(path.join(__dirname, 'pidlane-sppproef.js'), 'utf8');
const SLOT = fs.readFileSync(path.join(__dirname, 'pidlane-scanslot.js'), 'utf8');

function bouw(opt) {
  opt = opt || {};
  const opslag = {}, logs = [], diags = [], gebeurt = [], spoor = [];
  const knoppen = [];
  const els = {};
  const groep = { appendChild: function (k) { knoppen.push(k); els[k.id] = k; } };
  const w = {};
  const ctx = {
    window: w, console: { warn: function () {}, error: function () {}, log: function () {} },
    Promise: Promise, Date: Date, JSON: JSON, Math: Math, String: String, Object: Object, Array: Array, Error: Error,
    setTimeout: function (f) { setImmediate(f); return 1; },
    setInterval: function () { return 1; }, clearInterval: function () {},
    performance: { now: function () { return Date.now(); } },
    sessionStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(opslag, k) ? opslag[k] : null; },
      setItem: function (k, v) { opslag[k] = String(v); }
    },
    // localStorage overleeft een nieuwe WebView; opt.ls geeft hem mee van
    // een vorige "sessie" in dezelfde test.
    localStorage: (function (m) { return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; },
      _m: m }; })(opt.ls || {}),
    confirm: function () { spoor.push('confirm'); return opt.weiger !== true; },
    handleConnect: function () { spoor.push('handleConnect'); ctx.connected = false; return Promise.resolve(); },
    document: {
      getElementById: function (id) { return id === 'admGroup' ? groep : (els[id] || null); },
      createElement: function () {
        const e = { style: {}, children: [], appendChild: function (c) { this.children.push(c); },
          addEventListener: function (t, f) { this['on' + t] = f; }, remove: function () {} };
        return e;
      },
      addEventListener: function () {},
      body: { appendChild: function (e) { els[e.id] = e; } }
    },
    btDiag: function (m, t) { diags.push([m, t]); },
    log: function (m, t) { logs.push([m, t]); },
    connected: opt.verbonden !== false, demoMode: false,
    plSppModus: function () { return { modus: 'event' }; },
    PLBus: { wait: function () { spoor.push('slot'); return Promise.resolve(7); }, raak: function () {}, release: function () { spoor.push('vrij'); } },
    sendCmd: function (cmd) {
      spoor.push('cmd ' + cmd + ' scan=' + !!w._plScanActief);
      return Promise.resolve(cmd === 'ATRV' ? '12.4V' : '410C0A3C');
    },
    setConn: function (v) { spoor.push('setConn ' + v); },
    // Zoals pidlane-bt.js: connectSerial keert terug na "Verbonden", en de
    // hervatting zet zijn stempel pas later (_hervatAfronden).
    connectSerial: function (o) {
      spoor.push('connectSerial ' + (o && o.hervat)); ctx.connected = true;
      if (!opt.geenHervat) setImmediate(function () { setImmediate(function () { spoor.push('hervat klaar'); w._plLaatsteHervat = { t: Date.now(), s: 11 }; }); });
      return Promise.resolve();
    }
  };
  const spp = {
    connect: function (o) {
      spoor.push('connect ' + o.address + ' scan=' + !!w._plScanActief);
      return Promise.reject(new Error('read failed, socket might closed'));
    },
    disconnect: function (o) { spoor.push('disconnect ' + o.address); return Promise.resolve(); }
  };
  let patchAan = opt.patchUit ? false : true;
  if (opt.patch) spp.plPatch = function (o) {
    if (o && typeof o.aan === 'boolean') { patchAan = o.aan; spoor.push('plPatch aan=' + o.aan); }
    return Promise.resolve({ patch: 'PIDLANE-352-1', aan: patchAan, leesdraden: 1, verbindingen: 1 });
  };
  ctx.getSPP = function () { return spp; };
  let dradenStand = 0;
  if (opt.draden) w.Capacitor = { Plugins: { PLDraden: { meet: function () {
    return Promise.resolve({ ms: 1000, hz: 100, kernen: 8, totaalPct: 20 + dradenStand * 100, aantal: 40, draden: [], sppLevend: 1 + dradenStand, sppDraait: dradenStand, spp: [],
      pid: opt.pid || 4242, procesStart: opt.start || 1000 });
  }, beeindig: function () { spoor.push('beeindig'); return Promise.resolve(); } } } };
  w.PLMeetdienst = { stop: function () { spoor.push('meetdienst stop'); return Promise.resolve(); } };
  w.PLAdapter = { noteer: function (s) { gebeurt.push(s); } };
  w.PLBus = ctx.PLBus;
  vm.createContext(ctx);
  // De twee modules delen `window`: zo leest de proef de echte PLScanSlot.
  ctx.window = w;
  vm.runInContext('var window = this.window;', ctx);
  vm.runInContext(SLOT, ctx);
  ctx.PLScanSlot = w.PLScanSlot;
  vm.runInContext(BRON, ctx);
  return { ctx: ctx, P: w.PLSppProef, w: w, opslag: opslag, logs: logs, diags: diags, spoor: spoor, knoppen: knoppen, gebeurt: gebeurt,
    zetDraden: function (d) { dradenStand = d; } };
}

(async function () {
  console.log('── 1. het rekenwerk ──');
  {
    const P = bouw().P;
    toets('stat: mediaan, p90, max', P.stat([10, 30, 20, 40, 1000]), { n: 5, mediaan: 30, p90: 1000, max: 1000 });
    toets('stat van niets', P.stat([]), { n: 0, mediaan: null, p90: null, max: null });
    const r = (at) => ({ at: { mediaan: at }, ecu: { mediaan: at * 2 } });
    const d = (draait) => ({ sppDraait: draait, totaalPct: 10 + draait * 100 });
    toets('zonder patch, draad erbij: fout nagebouwd',
      [P.oordeel({ draden: d(0), respons: r(10) }, { draden: d(1), respons: r(160) }, { patch: null }).staat,
       /nagebouwd/.test(P.oordeel({ draden: d(0), respons: r(10) }, { draden: d(1), respons: r(160) }, { patch: null }).kop)], ['OK', true]);
    toets('zonder patch, geen draad erbij: het vermoeden klopt hier niet',
      /klopt op dit toestel niet/.test(P.oordeel({ draden: d(0), respons: r(10) }, { draden: d(0), respons: r(10) }, { patch: null }).kop), true);
    toets('met patch, geen draad erbij: houdt stand',
      P.oordeel({ draden: d(0), respons: r(10) }, { draden: d(0), respons: r(11) }, { patch: 'PIDLANE-352-1' }).staat, 'OK');
    // De tegenproef: een patch-APK die toch een draad achterlaat is FOUT.
    toets('TEGENPROEF met patch, draad erbij: FOUT',
      P.oordeel({ draden: d(0), respons: r(10) }, { draden: d(1), respons: r(10) }, { patch: 'PIDLANE-352-1' }).staat, 'FOUT');
    toets('met patch, geen draadmeting maar ×3 trager: FOUT',
      P.oordeel({ draden: null, respons: r(10) }, { draden: null, respons: r(30) }, { patch: 'PIDLANE-352-1' }).staat, 'FOUT');
    toets('zonder patch en zonder draadmeting: de factor staat erin',
      /×16/.test(P.oordeel({ draden: null, respons: r(10) }, { draden: null, respons: r(160) }, { patch: null }).kop), true);
  }

  console.log('── 2. de bus wordt bewerkt, en de app weet het ──');
  {
    const s = bouw();
    const p = await s.P.nabootsen();
    toets('de nep-connect() gaat naar het nepadres, met de scanvlag aan',
      s.spoor.filter((x) => /^connect /.test(x)), ['connect ' + s.P.NEP_ADRES + ' scan=true']);
    toets('binnen een geclaimd busslot, dat daarna weer vrij is',
      [s.spoor.indexOf('slot') > -1 && s.spoor.indexOf('slot') < s.spoor.findIndex((x) => /^connect /.test(x)),
       s.spoor.lastIndexOf('vrij') > s.spoor.findIndex((x) => /^connect /.test(x))], [true, true]);
    toets('en daarna staat de scanvlag weer uit', !!s.w._plScanActief, false);
    toets('het nepadres wordt opgeruimd', s.spoor.indexOf('disconnect ' + s.P.NEP_ADRES) > -1, true);
    toets('de poging mislukte, zoals bedoeld', [p.gelukt, /mislukt zoals bedoeld/.test(p.uitkomst)], [false, true]);

    const r = await s.P.meetRespons();
    const cmds = s.spoor.filter((x) => /^cmd /.test(x));
    toets('de responstijdmeting: 15× ATRV en 15× 010C1', [cmds.filter((x) => /ATRV/.test(x)).length, cmds.filter((x) => /010C1/.test(x)).length], [15, 15]);
    toets('allemaal met de scanvlag aan', cmds.every((x) => /scan=true$/.test(x)), true);
    toets('met de modus erbij en zonder lege antwoorden', [r.modus, r.leeg, r.at.n], ['event', 0, 15]);

    const los = bouw({ verbonden: false });
    await los.P.nabootsen();
    toets('niet verbonden: nabootsen kan ook (thuis, zonder auto), zonder busslot',
      [los.spoor.filter((x) => /^connect /.test(x)).length, los.spoor.indexOf('slot')], [1, -1]);
    toets('en meten kan dan niet', await los.P.meetRespons(), null);
  }

  console.log('── 3. de markering ──');
  {
    const zonder = bouw();
    toets('vóór de proef: niet aangetast', zonder.P.aangetast(), null);
    await zonder.P.nabootsen();
    const a = zonder.P.aangetast();
    toets('zonder patch: aangetast, met de reden', [!!a, /zonder patch/.test(a && a.reden)], [true, true]);
    toets('en dat staat als waarschuwing in het logboek', zonder.logs.some((l) => l[1] === 'warn' && /Bus aangetast/.test(l[0]) && /#352/.test(l[0])), true);
    const met = bouw({ patch: true });
    await met.P.nabootsen();
    toets('TEGENPROEF met patch: niet aangetast', met.P.aangetast(), null);
    const uit = bouw({ patch: true, patchUit: true });
    await uit.P.nabootsen();
    toets('patch voor de proef uitgezet: wél aangetast, en dat staat erbij', /voor de proef uitgezet/.test((uit.P.aangetast() || {}).reden), true);
    toets('een uitgezette patch telt in het oordeel als geen patch',
      uit.P.oordeel({ draden: { sppDraait: 0 } }, { draden: { sppDraait: 1 } }, { patch: 'PIDLANE-352-1', aan: false }).staat, 'OK');
  }

  console.log('── 4. de volle proef en de dode socket ──');
  {
    const s = bouw({ draden: true });
    const u = await s.P.volle();
    toets('de volle proef levert een oordeel met regels', [!!u, typeof (u && u.kop), Array.isArray(u && u.regels)], [true, 'string', true]);
    toets('zonder patch en zonder draad erbij: het vermoeden klopt hier niet', /klopt op dit toestel niet/.test(u && u.kop), true);
    toets('de proef staat als gebeurtenis bij PLAdapter', s.gebeurt.indexOf('spp-proef') > -1, true);
    toets('en de uitkomst staat in het logboek', s.logs.some((l) => /SPP-proef volle proef/.test(l[0])), true);

    // De maten voor de meetopdracht van #352: een volle proef met de patch
    // aan telt als "aan", met de patch voor de proef uit als "uit".
    const ma = bouw({ draden: true, patch: true });
    await ma.P.volle();
    const mu = bouw({ draden: true, patch: true, patchUit: true });
    await mu.P.volle();
    toets('maat: een volle proef met de patch aan telt als aan, zonder draad erbij',
      [ma.P.maat('spp-patch'), ma.P.maat('spp-proeven-aan'), ma.P.maat('spp-proeven-uit'), ma.P.maat('spp-erbij-aan'), ma.P.maat('spp-erbij-uit')], [1, 1, 0, 0, null]);
    toets('maat: met de patch uit telt hij als uit, en de patch zit er nog steeds in',
      [mu.P.maat('spp-patch'), mu.P.maat('spp-proeven-aan'), mu.P.maat('spp-proeven-uit')], [1, 0, 1]);
    toets('maat: zonder meting is het null, geen 0', bouw().P.maat('spp-draaiend'), null);

    const d = bouw({ draden: true, patch: true });
    const dsU = await d.P.dodeSocket();
    const iConn = d.spoor.findIndex((x) => /^connectSerial /.test(x));
    toets('de dode-socketknop: setConn(false) en dan connectSerial met de hervatstand',
      [d.spoor.indexOf('setConn false') > -1 && d.spoor.indexOf('setConn false') < iConn, d.spoor[iConn]],
      [true, 'connectSerial dode socket (SPP-proef)']);
    toets('de na-meting wacht op de hervatting, en de duur is die van de hervatting (11 s, niet de 0 s van connectSerial)',
      [d.spoor.indexOf('hervat klaar') > -1 && d.spoor.indexOf('hervat klaar') < d.spoor.lastIndexOf('slot'), /Herverbonden in 11 s/.test(dsU && dsU.kop)],
      [true, true]);
    toets('zonder eerst de oude socket te sluiten — zo ging het om 01:11:40',
      d.spoor.slice(0, iConn).some((x) => /^disconnect /.test(x)), false);
  }

  console.log('── 5. de schakelaar ──');
  {
    const s = bouw({ patch: true });
    const u = await s.P.schakel();
    toets('de knop zet de patch uit via plPatch({ aan: false })', [s.spoor.indexOf('plPatch aan=false') > -1, /UIT tot het proces stopt/.test(u.regels[0])], [true, true]);
    await s.P.schakel();
    toets('en een tweede tik weer aan', s.spoor.indexOf('plPatch aan=true') > -1, true);
    const oud = bouw();
    let fout = null;
    try { await oud.P.zetPatch(false); } catch (e) { fout = e; }
    toets('zonder patch-APK valt er niets te schakelen, en dat zegt hij', !!(fout && /niets te schakelen/.test(fout.message)), true);
  }

  console.log('── 6. het proces, en niet de pagina (30-09-2026) ──');
  {
    /* 12:31: de app weggeveegd terwijl de meetdienst liep. Nieuwe WebView,
       lege sessionStorage, zelfde proces met zijn draaiende draden. */
    const a = bouw({ draden: true, pid: 4242, start: 1000 });
    await a.P.proces();
    await a.P.nabootsen();
    const m = a.P.aangetast();
    toets('de markering draagt het proces', m && m.proces, '4242:1000');
    const geveegd = bouw({ draden: true, pid: 4242, start: 1000, ls: a.ctx.localStorage._m });
    await geveegd.P.proces();
    toets('weggeveegd, zelfde proces: nog steeds aangetast', !!geveegd.P.aangetast(), true);
    const nieuw = bouw({ draden: true, pid: 5151, start: 2000, ls: a.ctx.localStorage._m });
    await nieuw.P.proces();
    toets('echt nieuw proces: niet meer aangetast, en de markering is opgeruimd',
      [nieuw.P.aangetast(), nieuw.ctx.localStorage.getItem('pl_spp_aangetast')], [null, null]);
    const oud = bouw();
    await oud.P.nabootsen();
    toets('zonder PLDraden (oude APK): de markering staat in sessionStorage, zoals vroeger',
      [!!oud.P.aangetast(), oud.ctx.localStorage.getItem('pl_spp_aangetast')], [true, null]);

    const b = bouw({ draden: true });
    await b.P.beeindig();
    toets('🧹 beëindigen: eerst vragen, dan verbreken, meetdienst uit, en dan pas het proces',
      b.spoor.filter(function (x) { return /^(confirm|handleConnect|meetdienst stop|beeindig)$/.test(x); }),
      ['confirm', 'handleConnect', 'meetdienst stop', 'beeindig']);
    const nee = bouw({ draden: true, weiger: true });
    await nee.P.beeindig();
    toets('wie nee zegt, houdt de app', nee.spoor.indexOf('beeindig'), -1);
    const kaal = bouw();
    const k = await kaal.P.beeindig();
    toets('zonder PLDraden: niets beëindigd, en de verwijzing naar Meer → Afsluiten staat in het logboek',
      [k, kaal.spoor.indexOf('plSluitApp'), kaal.logs.some(function (l) { return /Meer → Afsluiten/.test(l[0]); })], [false, -1, true]);
  }

  console.log('── 7. het Admin-menu ──');
  {
    const s = bouw();
    const eerst = s.P.menu(), dan = s.P.menu();
    // Sinds 02-10-2026 één regel, "SPP-controle"; de acht staan in de kaart die hij opent.
    toets('één knop in het Admin-menu, en een tweede keer niet nog eens', [eerst, dan, s.knoppen.length], [1, 0, 1]);
    toets('met een eigen id en klasse', s.knoppen.every((k) => k.id === 'plSppMenu' && k.className === 'kebab-item'), true);
  }

  console.log('\n' + n + ' toetsen, ' + (fout ? fout + ' FOUT' : 'alles goed'));
  process.exit(fout ? 1 : 0);
})();
