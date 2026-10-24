// ══════════════════════════════════════════════════════════════════
// test-remote-lus.js — de expert ziet het als de telefoon iets níét levert
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (24-10-2026, nalopen remote-lus)
//
// Twee stille leugens in de lus local ↔ expert:
//  1. Foutcodes. Een niet-verbonden telefoon, een mislukte uitlezing en een
//     time-out van 15 s gaven allemaal [] terug, en de expert zag "Geen
//     foutcodes — alle systemen OK". "Niet gelezen" is geen "nul codes".
//  2. Versheid. De local stuurt alleen frames als er gemeten wordt. Stopte
//     dat (app naar de achtergrond, adapter weg), dan bleven de meters bij de
//     expert op de laatste waarde staan alsof ze live waren.
//
// De toets onderscheidt: naast elk faalgeval staat het gewone geval, dat nog
// steeds een lijst codes c.q. 'live' moet geven.
//
// Draaien vanuit public/:  node test-remote-lus.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const bron = fs.readFileSync(path.join(__dirname, 'pidlane-remote.js'), 'utf8');
function knip(van, tot, wat) {
  const a = bron.indexOf(van);
  if (a < 0) { console.error('FOUT: anker voor ' + wat + ' niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.error('FOUT: eindanker voor ' + wat + ' niet gevonden: ' + tot); process.exit(1); }
  return bron.slice(a, b);
}

const answerDtcSrc = knip('async function answerDtc(m){', 'function sendWs(o){', 'answerDtc');
const remoteDtcSrc = knip('function remoteDtc(){', '  try{ // na login', 'remoteDtc');
const stilSrc = knip('const STIL_MS=', 'function versheid(){', 'stilOordeel');

function local(opts) {
  const uit = [];
  const ctx = Object.assign({
    sendWs: (o) => uit.push(o), logA() {}, sendVStateSoon() {},
    withBtLock: (fn) => fn(), demoMode: false, connected: false, dtcCodes: [],
    realScanDTC: async () => []
  }, opts);
  const f = new Function('ctx', 'with(ctx){' + answerDtcSrc + '\nreturn answerDtc;}')(ctx);
  return { f, uit };
}

(async () => {
  console.log('\n1. Local: niet gelezen is geen "nul codes"');
  {
    const { f, uit } = local({ connected: false });
    await f({ reqId: 'a1' });
    const d = uit[0] && uit[0].data;
    toets('niet verbonden → dtc:null met reden', d && d.dtc === null && /verbonden/.test(d.err || ''), JSON.stringify(uit));
  }
  {
    const { f, uit } = local({ connected: true, realScanDTC: async () => { throw new Error('bus weg'); } });
    await f({ reqId: 'a2' });
    const d = uit[0] && uit[0].data;
    toets('uitlezen gooit → dtc:null met reden', d && d.dtc === null && /bus weg/.test(d.err || ''), JSON.stringify(uit));
  }
  {
    const { f, uit } = local({ connected: true, realScanDTC: async () => ['P0171'] });
    await f({ reqId: 'a3' });
    const d = uit[0] && uit[0].data;
    toets('gewone uitlezing → de codes', d && Array.isArray(d.dtc) && d.dtc[0] === 'P0171', JSON.stringify(uit));
  }
  {
    const { f, uit } = local({ connected: true, realScanDTC: async () => [] });
    await f({ reqId: 'a4' });
    const d = uit[0] && uit[0].data;
    toets('echt geen codes → [] (geen fout)', d && Array.isArray(d.dtc) && d.dtc.length === 0 && !d.err, JSON.stringify(uit));
  }

  console.log('\n2. Expert: time-out en fout worden een fout, geen lege lijst');
  function expert(open) {
    const verzonden = [];
    const timers = [];
    const ctx = {
      S: { ews: open ? { readyState: 1, send: (x) => verzonden.push(JSON.parse(x)) } : null, pending: {} },
      _rid: (() => { let n = 0; return () => 'r' + (++n); })(),
      setTimeout: (fn) => { timers.push(fn); return timers.length; }
    };
    const f = new Function('ctx', 'with(ctx){' + remoteDtcSrc + '\nreturn remoteDtc;}')(ctx);
    return { f, ctx, verzonden, timers };
  }
  const uitkomst = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e && e.message) }));
  {
    const { f } = expert(false);
    const r = await uitkomst(f());
    toets('geen sessie → fout', !r.ok, JSON.stringify(r));
  }
  {
    const { f, timers } = expert(true);
    const p = uitkomst(f());
    timers.forEach((t) => t());
    const r = await p;
    toets('time-out → fout (was: [])', !r.ok && /15 s/.test(r.e), JSON.stringify(r));
  }
  {
    const { f, ctx, verzonden } = expert(true);
    const p = uitkomst(f());
    ctx.S.pending[verzonden[0].reqId](null, 'telefoon niet verbonden met de auto');
    const r = await p;
    toets('local zegt niet gelezen → fout met reden', !r.ok && /niet verbonden/.test(r.e), JSON.stringify(r));
  }
  {
    const { f, ctx, verzonden } = expert(true);
    const p = uitkomst(f());
    ctx.S.pending[verzonden[0].reqId](['P0420'], '');
    const r = await p;
    toets('gewoon antwoord → de codes', r.ok && r.v[0] === 'P0420', JSON.stringify(r));
  }

  console.log('\n3. Versheid van de live data bij de expert');
  {
    const stil = new Function(stilSrc + '\nreturn stilOordeel;')();
    toets('socket dicht → geen oordeel', stil(10000, 9000, false) === null);
    toets('nog niets ontvangen → wacht', stil(10000, 0, true) === 'wacht');
    toets('frame 1 s oud → live', stil(10000, 9000, true) === 'live');
    toets('frame 7 s oud → stil', stil(17000, 10000, true) === 'stil');
  }

  console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nAlles goed');
  process.exit(fouten ? 1 : 0);
})();
