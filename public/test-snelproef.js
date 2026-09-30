// ══════════════════════════════════════════════════════════════════
// test-snelproef.js — de stap-voor-stapproef meet wat hij belooft
// ──────────────────────────────────────────────────────────────────
// Met de echte pidlane-snelproef.js in een vm, en een nagemaakte bus,
// SPP-plugin en connectSerial:
//
//   1. oordeelStap() en uitslag() — het rekenwerk, elke uitkomst
//   2. de volgorde: een stap die niet aan de beurt is, meet niets
//   3. stap 2 sluit de oude socket echt en hervat via connectSerial, met de
//      bewaker van sppReconnectGuard() koest
//   4. stap 3 zet de leesmanier om en ALTIJD terug — ook als de meting faalt
//   5. stap 6 weigert zolang de app niet herstart is, en telt na een herstart
//      de eerdere stappen gewoon mee (localStorage overleeft, sessionStorage niet)
//   6. de menuknop staat er één keer
//
// Wat hier NIET getoetst wordt: of een ingreep op een echte telefoon helpt.
// Dat is de proef zelf.
//
// Draaien vanuit public/:  node test-snelproef.js   (exit 0 = goed)
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

const BRON = fs.readFileSync(path.join(__dirname, 'pidlane-snelproef.js'), 'utf8');

function opslag(start) {
  const o = Object.assign({}, start || {});
  return {
    data: o,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null; },
    setItem: function (k, v) { o[k] = String(v); },
    removeItem: function (k) { delete o[k]; }
  };
}

function el() {
  const e = { style: {}, kids: [], disabled: false, textContent: '', id: '',
    appendChild: function (k) { this.kids.push(k); return k; },
    addEventListener: function (t, f) { this['on' + t] = f; },
    remove: function () { this.weg = true; } };
  Object.defineProperty(e, 'innerHTML', { set: function () { e.kids = []; }, get: function () { return ''; } });
  return e;
}

/* opt.perSec: functie die per meting het getal geeft (mag afhangen van het
   spoor); opt.ls / opt.ss: bestaande opslag (voor de herstart). */
function bouw(opt) {
  opt = opt || {};
  const spoor = [], logs = [];
  const ls = opt.ls || opslag(), ss = opt.ss || opslag();
  const groep = el();
  const els = { admGroup: groep };
  groep.appendChild = function (k) { this.kids.push(k); if (k.id) els[k.id] = k; return k; };
  const ctx = {
    console: { warn: function () {}, error: function () {}, log: function () {} },
    Promise: Promise, Date: Date, JSON: JSON, Math: Math, String: String, Object: Object, Error: Error,
    setTimeout: function (f) { setImmediate(f); return 1; },
    localStorage: ls, sessionStorage: ss,
    connected: true, demoMode: false,
    document: {
      addEventListener: function (t, f) { if (t === 'DOMContentLoaded') ctx._dcl = f; },
      getElementById: function (id) { return els[id] || null; },
      createElement: function () { return el(); },
      body: { appendChild: function (k) { els[k.id] = k; } }
    },
    log: function (m, t) { logs.push([t, m]); },
    setConn: function (v) { spoor.push('setConn:' + v); },
    getSPP: function () { return { disconnect: async function (a) { spoor.push('disconnect:' + a.address); } }; },
    connectSerial: async function (o) {
      spoor.push('connectSerial:' + (o && o.hervat) + ':poll=' + ls.getItem('pl_spp_poll'));
      spoor.push('bewaker:' + (typeof ctx.window._lastSppReconnect === 'number'));
      if (opt.herverbindtNiet) return;
      ctx.connected = true;
    }
  };
  ctx.window = ctx;          // in de browser is window het globale object
  ctx.window.PLBus = { stats: function () {
    const p = opt.perSec ? opt.perSec(spoor, ls) : 4;
    spoor.push('stats:' + p);
    return { perSec: p, venGemMs: 150, belasting: 90, foutPct: 0 };
  } };
  ctx.window.PLSppProef = {
    meetRespons: async function () { spoor.push('respons'); return { at: { mediaan: 150 }, ecu: { mediaan: 148 }, modus: ls.getItem('pl_spp_poll') === '1' ? 'poll' : 'event' }; },
    meetDraden: async function () { return { sppDraait: 0, totaalPct: 90 }; }
  };
  vm.createContext(ctx);
  vm.runInContext(BRON, ctx);
  if (ctx._dcl) ctx._dcl();
  return { P: ctx.window.PLSnelProef, spoor: spoor, logs: logs, ls: ls, ss: ss, ctx: ctx, groep: groep };
}

(async function () {
  console.log('\n1. Het oordeel per stap');
  {
    const P = bouw().P;
    const o = P.oordeelStap;
    toets('stap 1 onder het doel is het vertrekpunt', o({ perSec: 4 }, null, null).staat, 'LET OP');
    toets('stap 1 boven het doel haalt het al', o({ perSec: 11 }, null, null).staat, 'OK');
    toets('van 4 naar 11 = dit hielp', o({ perSec: 11 }, { perSec: 4 }, { perSec: 4 }).hielp, true);
    toets('boven het doel en de vorige ook = niet opnieuw "hielp"', !!o({ perSec: 11 }, { perSec: 4 }, { perSec: 10.5 }).hielp, false);
    toets('van 4 naar 6 = sneller maar nog onder', o({ perSec: 6 }, { perSec: 4 }, { perSec: 4 }).beter, true);
    toets('van 6 naar 4 = trager', /trager/.test(o({ perSec: 4 }, { perSec: 4 }, { perSec: 6 }).tekst), true);
    toets('van 4 naar 4,4 = geen duidelijk verschil', /geen duidelijk/.test(o({ perSec: 4.4 }, { perSec: 4 }, { perSec: 4 }).tekst), true);
    toets('precies 10 haalt het doel', o({ perSec: 10 }, { perSec: 4 }, { perSec: 4 }).hielp, true);
  }

  console.log('\n2. De uitslag');
  {
    const P = bouw().P;
    toets('niets gemeten', /Begin met stap 1/.test(P.uitslag({ stappen: {} })), true);
    toets('al snel bij het begin', /Er valt nu niets op te lossen/.test(P.uitslag({ stappen: { 1: { m: { perSec: 11 } } } })), true);
    const s = { stappen: {
      1: { m: { perSec: 4 }, oordeel: {} }, 2: { m: { perSec: 4.2 }, oordeel: {} },
      3: { m: { perSec: 4.1 }, oordeel: {} }, 4: { m: { perSec: 11 }, oordeel: { hielp: true } } } };
    const u = P.uitslag(s);
    toets('gevonden: stap 4', /Gevonden: stap 4 \(bluetooth van de auto uit\)/.test(u), true);
    toets('en wat het betekent', /deelt de radio/.test(u), true);
    const alles = { stappen: {} };
    [1, 2, 3, 4, 5, 6].forEach(function (i) { alles.stappen[i] = { m: { perSec: 4 + i / 10 }, oordeel: {} }; });
    toets('niets hielp na zes stappen', /Geen enkele stap/.test(P.uitslag(alles)) && /beste stap 6/.test(P.uitslag(alles)), true);
    toets('halverwege: ga door met de volgende', /Ga door met stap 3/.test(P.uitslag({ stappen: { 1: { m: { perSec: 4 } }, 2: { m: { perSec: 4 }, oordeel: {} } } })), true);
  }

  console.log('\n3. De volgorde');
  {
    const b = bouw();
    const r = await b.P.doeStap(3);
    toets('stap 3 vóór stap 1 doet niets', r, null);
    toets('en meet niets', b.spoor.filter(function (x) { return /^stats/.test(x); }).length, 0);
    await b.P.doeStap(1);
    toets('stap 1 meet één keer', b.spoor.filter(function (x) { return /^stats/.test(x); }).length, 1);
    toets('stap 1 bewaard', b.P.stand().stappen[1].m.perSec, 4);
    toets('volgende is 2', b.P.volgende(b.P.stand()), 2);
    toets('het logboek krijgt één regel met het getal', b.logs.filter(function (l) { return /stap 1 \(nulmeting\): 4 verzoeken\/s/.test(l[1]); }).length, 1);
  }

  console.log('\n4. Stap 2: de socket echt dicht, de bewaker koest, hervatten');
  {
    const b = bouw();
    await b.P.doeStap(1);
    b.spoor.length = 0;
    b.ls.setItem('spp_address', '00:04:3E:8B:7B:32');
    await b.P.doeStap(2);
    toets('volgorde: setConn uit → disconnect → connectSerial → meten',
      b.spoor.slice(0, 5), ['setConn:false', 'disconnect:00:04:3E:8B:7B:32', 'connectSerial:snelheidsproef:poll=null', 'bewaker:true', 'stats:4']);
    const b2 = bouw({ herverbindtNiet: true });
    await b2.P.doeStap(1);
    b2.ctx.connected = true;
    const r = await b2.P.doeStap(2);
    toets('lukt herverbinden niet, dan geen uitslag voor stap 2', r === null && !b2.P.stand().stappen[2], true);
    toets('en het logboek zegt het', b2.logs.some(function (l) { return /stap 2 lukte niet/.test(l[1]); }), true);
  }

  console.log('\n5. Stap 3: de leesmanier gaat om en altijd terug');
  {
    const b = bouw({ perSec: function (sp, ls) { return ls.getItem('pl_spp_poll') === '1' ? 12 : 4; } });
    await b.P.doeStap(1); await b.P.doeStap(2);
    await b.P.doeStap(3);
    const st = b.P.stand().stappen[3];
    toets('gemeten in de pollstand', st.m.perSec, 12);
    toets('en dat hielp', st.oordeel.hielp, true);
    toets('pl_spp_poll staat weer zoals hij was (leeg)', b.ls.getItem('pl_spp_poll'), null);
    toets('twee verse sockets: omzetten en terugzetten',
      b.spoor.filter(function (x) { return /^connectSerial/.test(x); }).slice(-2), ['connectSerial:snelheidsproef:poll=1', 'connectSerial:snelheidsproef:poll=null']);
    toets('de uitslag noemt de stand', /stand "poll"/.test(b.P.uitslag(b.P.stand())), true);

    // Faalt de meting in de proefstand, dan tóch terug.
    const f = bouw({ perSec: function (sp, ls) { return ls.getItem('pl_spp_poll') === '1' ? 0 : 4; } });
    f.ls.setItem('pl_spp_poll', '1');     // de gebruiker had pollen aan
    await f.P.doeStap(1);
    f.ls.setItem('pl_spp_poll', '1');
    await f.P.doeStap(2);
    await f.P.doeStap(3);
    toets('meting faalt: stap 3 niet bewaard', !f.P.stand().stappen[3], true);
    toets('en de oude stand (pollen aan) staat terug', f.ls.getItem('pl_spp_poll'), '1');
  }

  console.log('\n6. Stap 6: eerst echt herstarten');
  {
    const b = bouw();
    for (let i = 1; i <= 5; i++) await b.P.doeStap(i);
    const r = await b.P.doeStap(6);
    toets('zonder herstart: geweigerd', r, null);
    toets('en niets bewaard', !b.P.stand().stappen[6], true);
    // Herstart: localStorage blijft, sessionStorage is leeg.
    const na = bouw({ ls: b.ls, ss: opslag() });
    toets('na de herstart weet hij de eerdere stappen', na.P.volgende(na.P.stand()), 6);
    const r2 = await na.P.doeStap(6);
    toets('en stap 6 meet', !!(r2 && r2.m), true);
    toets('de proef is klaar', na.P.volgende(na.P.stand()), null);
    na.P.reset();
    toets('opnieuw beginnen wist alles', na.P.volgende(na.P.stand()), 1);
  }

  console.log('\n7. De menuknop');
  {
    const b = bouw();
    toets('één knop in het Admin-menu', b.groep.kids.map(function (k) { return k.id; }), ['plSnelMenu']);
    toets('een tweede keer niet nog eens', b.P.menu(), 0);
  }

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch(function (e) { console.log('  FOUT  de test zelf faalde: ' + (e && e.stack || e)); process.exit(1); });
