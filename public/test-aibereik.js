// ══════════════════════════════════════════════════════════════════
// test-aibereik.js — de AI-stip wordt niet rood van één mislukte ping
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (09-10-2026)
// Rijdend op 5G stond er "AI niet bereikbaar" in de bovenbalk terwijl de AI
// het deed. checkAiReachable() zette de stip bij de eerste mislukte ping op
// rood en liet hem dat vijf minuten blijven; een geslaagde AI-vraag haalde
// hem niet terug, en de reden werd nergens gelogd.
//
// Wat hier bewaakt wordt:
//   1. één misser is nog geen rood, twee op rij wel; een treffer herstelt;
//   2. na de eerste misser volgt er snel een tweede meting;
//   3. elk antwoord van de proxy via plFetch zet hem terug op groen —
//      maar een absolute URL (een andere host) telt niet;
//   4. de omslag naar rood komt in het logboek, met de reden.
//
// Knipt het echte blok uit pidlane-uihelpers.js en laadt de echte
// pidlane-plfetch.js met vm; niets is nagebouwd.
// Draaien vanuit public/:  node test-aibereik.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function eis(wat, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + wat);
  else { fout++; console.log('  FAAL  ' + wat + (uitleg ? ' — ' + uitleg : '')); }
}

const bron = fs.readFileSync(__dirname + '/pidlane-uihelpers.js', 'utf8');
const begin = bron.indexOf('const AI_MIS_ROOD=');
const eindAnker = 'window.plProxyGezien=function(){';
const eind = bron.indexOf('\n', bron.indexOf(eindAnker));
if (begin < 0 || bron.indexOf(eindAnker) < 0) { console.log('FAAL het bereikbaarheidsblok is niet meer te vinden in pidlane-uihelpers.js'); process.exit(1); }
const blok = bron.slice(begin, eind);

function maak(pingOk) {
  const w = { log: [], timers: [], getekend: 0, window: {} };
  const f = new Function('plFetch', 'PROXY_URL', 'window', 'setTimeout', 'updateTopbarStatus', 'console',
    'let _aiReach=null;\n' + blok +
    '\nreturn { check: checkAiReachable, uitslag: aiPingUitslag, staat: function(){ return { reach:_aiReach, mis:_aiMis }; } };');
  const api = f(
    async function () { if (!pingOk.v) throw new Error('netwerk onbereikbaar bij /: Failed to fetch'); return {}; },
    'https://proxy.voorbeeld',
    w.window,
    function (fn, ms) { w.timers.push({ fn: fn, ms: ms }); return w.timers.length; },
    function () { w.getekend++; },
    { warn: function (m) { w.log.push(['warn', String(m)]); }, info: function (m) { w.log.push(['info', String(m)]); } }
  );
  return Object.assign(w, api);
}

(async function () {
  console.log('\n1. De pure regel');
  {
    const t = maak({ v: true });
    const een = t.uitslag({ reach: true, mis: 0 }, false);
    eis('één misser na groen blijft groen', een.reach === true && een.mis === 1, JSON.stringify(een));
    const twee = t.uitslag(een, false);
    eis('twee missers op rij is rood', twee.reach === false && twee.mis === 2, JSON.stringify(twee));
    const terug = t.uitslag(twee, true);
    eis('een treffer herstelt en wist de teller', terug.reach === true && terug.mis === 0, JSON.stringify(terug));
    const vers = t.uitslag({ reach: null, mis: 0 }, false);
    eis('één misser vóór de eerste meting is nog "niet gemeten", geen rood', vers.reach === null, JSON.stringify(vers));
  }

  console.log('\n2. De echte checkAiReachable');
  {
    const ok = { v: true };
    const t = maak(ok);
    await t.check();
    eis('eerste ping slaagt → groen', t.staat().reach === true);
    ok.v = false;
    await t.check();
    eis('één mislukte ping → nog groen', t.staat().reach === true, JSON.stringify(t.staat()));
    eis('en er staat een snelle herhaling klaar', t.timers.length === 1 && t.timers[0].ms <= 60000, JSON.stringify(t.timers.map(function (x) { return x.ms; })));
    eis('nog niets in het logboek', t.log.length === 0, JSON.stringify(t.log));
    await t.timers[0].fn();
    eis('de herhaling mislukt ook → rood', t.staat().reach === false);
    const warn = t.log.filter(function (l) { return l[0] === 'warn'; });
    eis('de omslag staat in het logboek, met de reden', warn.length === 1 && /Failed to fetch/.test(warn[0][1]), JSON.stringify(t.log));
    await t.check();
    eis('nog een misser logt niet opnieuw', t.log.filter(function (l) { return l[0] === 'warn'; }).length === 1);
    eis('en zet geen tweede herhaling klaar zolang hij al rood is', t.timers.length === 1, String(t.timers.length));
    t.window.plProxyGezien();
    eis('een antwoord van de proxy via plFetch zet hem terug op groen', t.staat().reach === true && t.staat().mis === 0);
    eis('en dat herstel staat ook in het logboek', t.log.some(function (l) { return l[0] === 'info'; }));
  }

  console.log('\n3. plFetch meldt een antwoord van de proxy');
  {
    const gezien = [];
    const ctx = { console: console, window: {} };
    ctx.window.window = ctx.window;
    ctx.window.PROXY_URL = 'https://proxy.voorbeeld';
    ctx.window.plProxyGezien = function () { gezien.push(1); };
    let gooi = false;
    ctx.fetch = async function () { if (gooi) throw new Error('Failed to fetch'); return { status: 200, headers: { get: function () { return null; } } }; };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(__dirname + '/pidlane-plfetch.js', 'utf8'), ctx, { filename: 'pidlane-plfetch.js' });
    await ctx.window.plFetch('/ai', {});
    eis('een antwoord op ons eigen pad telt als bereikbaar', gezien.length === 1);
    await ctx.window.plFetch('https://api.airtable.com/v0/x', {});
    eis('een absolute URL (andere host) telt niet', gezien.length === 1, String(gezien.length));
    gooi = true;
    let gegooid = false;
    try { await ctx.window.plFetch('/ai', {}); } catch (e) { gegooid = true; }
    eis('een netwerkfout telt niet als bereikbaar', gegooid && gezien.length === 1, String(gezien.length));
  }

  console.log('\n' + (fout ? fout + ' van ' + n + ' FAAL' : 'Alle ' + n + ' goed'));
  process.exit(fout ? 1 : 0);
})();
