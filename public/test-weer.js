// ══════════════════════════════════════════════════════════════════
// test-weer.js — het weer voor de winterkaart (#556): /weer en PLWeer
// ──────────────────────────────────────────────────────────────────
// WAT HIER ROOD HOORT TE WORDEN
//   • /weer zonder inlog, of met een plaats die niet in de lijst staat;
//   • een vraag aan Open-Meteo met iets anders dan de coördinaten van de
//     plaats — de app is locatievrij, de Worker is de enige die ze kent;
//   • een cachesleutel waar iets van de klant in zit;
//   • de lijsten in worker.js en pidlane-weer.js die uit elkaar lopen;
//   • een samenvatting die vorst, gladheid of het omslagpunt mist, of een
//     verwachting van gisteren meetelt.
//
// Laadt de echte worker.js (als module) en de echte pidlane-weer.js (vm).
// Draaien vanuit public/:  node test-weer.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const wortel = path.join(__dirname, '..');
const bron = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');

async function laadWorker() {
  const i = bron.lastIndexOf('export {');
  if (i < 0) throw new Error('export-blok niet gevonden in worker.js');
  const mod = bron.slice(0, i) + 'export { worker_default as default, makeToken, WEER_PLAATSEN, weerDagen };\n';
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'weer-')), 'worker.mjs');
  fs.writeFileSync(f, mod);
  return import('file://' + f);
}

function laadWeer(extra) {
  const opslag = {};
  const ctx = Object.assign({
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    JSON, Date, Math, Promise, encodeURIComponent
  }, extra || {});
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-weer.js'), 'utf8'), ctx, { filename: 'pidlane-weer.js' });
  if (!ctx.PLWeer || !ctx.PLWeer._kern) { console.log('FOUT PLWeer hangt zijn kern niet meer naar buiten'); process.exit(1); }
  return { W: ctx.PLWeer, opslag, ctx };
}

// Zoals Open-Meteo antwoordt (daily, met timezone=Europe/Amsterdam).
const OM = {
  daily: {
    time: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'],
    temperature_2m_min: [2.4, -3.1, -0.4, 5],
    temperature_2m_max: [7.9, 3.2, 4, 9.5],
    precipitation_sum: [0, 0.2, 3.8, 1],
    snowfall_sum: [0, 0, 1.2, 0]
  }
};

(async () => {
  const Wk = await laadWorker();
  const env = { SESSION_SECRET: 'test-geheim-dat-lang-genoeg-is-0123456789' };
  const tok = (await Wk.makeToken(env, 'anna@voorbeeld.nl', 'klant', 'Anna')).token;

  // fetch naar Open-Meteo en caches.default nagebouwd; de rest is de echte Worker.
  const gevraagd = [];
  const cache = new Map();
  let omStatus = 200;
  globalThis.fetch = async (url) => {
    gevraagd.push(String(url));
    return new Response(JSON.stringify(OM), { status: omStatus, headers: { 'Content-Type': 'application/json' } });
  };
  globalThis.caches = { default: {
    async match(req) { const r = cache.get(req.url); return r ? r.clone() : undefined; },
    async put(req, resp) { cache.set(req.url, resp); }
  } };
  const wacht = [];
  async function roep(pad, t) {
    const r = await Wk.default.fetch(new Request('https://app.pidlane.nl' + pad, {
      headers: { 'X-App-Token': t == null ? tok : t, Origin: 'https://app.pidlane.nl' }
    }), env, { waitUntil(p) { wacht.push(p); } });
    let d = {};
    try { d = await r.json(); } catch (e) { d = { _geenJson: true }; }
    d._status = r.status;
    d._cors = r.headers.get('Access-Control-Allow-Origin');
    return d;
  }

  console.log('1. /weer in de Worker');
  toets('zonder inlog: 401', (await roep('/weer?plaats=utrecht', ''))._status === 401);
  toets('een plaats die niet in de lijst staat: 400', (await roep('/weer?plaats=onzin'))._status === 400);
  toets('een coördinaat als plaats: 400 — de Worker kent alleen ids', (await roep('/weer?plaats=52.09,5.12'))._status === 400);
  toets('__proto__ is geen plaats', (await roep('/weer?plaats=__proto__'))._status === 400);
  toets('en er ging in die gevallen niets naar Open-Meteo', gevraagd.length === 0, gevraagd.join(' '));
  const d = await roep('/weer?plaats=utrecht');
  toets('een plaats uit de lijst: 200 met vier dagen', d._status === 200 && Array.isArray(d.dagen) && d.dagen.length === 4, JSON.stringify(d));
  toets('één vraag aan Open-Meteo, met de coördinaten van Utrecht', gevraagd.length === 1 && /latitude=52\.1&longitude=5\.1&/.test(gevraagd[0]) && /^https:\/\/api\.open-meteo\.com\//.test(gevraagd[0]), gevraagd[0]);
  toets('per dag min, max, neerslag en sneeuw — niets anders', JSON.stringify(Object.keys(d.dagen[0]).sort()) === JSON.stringify(['datum', 'max', 'min', 'neerslag', 'sneeuw']));
  toets('de waarden komen ongeschonden door', d.dagen[1].min === -3.1 && d.dagen[2].sneeuw === 1.2);
  toets('/weer gaat door lockOrigin: geen CORS voor elke website', d._cors !== '*', String(d._cors));
  await Promise.all(wacht);
  toets('de cachesleutel is de plaats en verder niets', [...cache.keys()].join() === 'https://weer.pidlane.intern/utrecht', [...cache.keys()].join());
  await roep('/weer?plaats=utrecht');
  toets('een tweede vraag komt uit de cache', gevraagd.length === 1, String(gevraagd.length));
  omStatus = 503;
  toets('Open-Meteo plat: 502, niet doorgeven als goed', (await roep('/weer?plaats=gent'))._status === 502);
  omStatus = 200;
  toets('weerDagen gooit onmogelijke waarden weg', Wk.weerDagen({ daily: { time: ['2026-11-20'], temperature_2m_min: [-999], temperature_2m_max: ['x'] } })[0].min === null);

  console.log('\n2. De twee plaatsenlijsten');
  const { W } = laadWeer();
  const app = W.PLAATSEN.map((p) => p[0] + '=' + p[1]).sort().join('|');
  const srv = Object.keys(Wk.WEER_PLAATSEN).map((k) => k + '=' + Wk.WEER_PLAATSEN[k][0]).sort().join('|');
  toets('dezelfde ids en namen in worker.js en pidlane-weer.js', app === srv, 'app: ' + app + '\nworker: ' + srv);
  toets('elke plaats ligt in de Benelux', Object.values(Wk.WEER_PLAATSEN).every((p) => p[1] >= 49.4 && p[1] <= 53.6 && p[2] >= 2.5 && p[2] <= 7.3));
  toets('coördinaten op hoogstens één decimaal: een stad, geen adres', Object.values(Wk.WEER_PLAATSEN).every((p) => Math.round(p[1] * 10) === p[1] * 10 && Math.round(p[2] * 10) === p[2] * 10));
  toets('de app kent geen coördinaten', !/\d{2}\.\d,\s*\d\.\d/.test(fs.readFileSync(path.join(__dirname, 'pidlane-weer.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));

  console.log('\n3. De samenvatting');
  const K = W._kern;
  const NU = new Date(2026, 10, 20, 15, 0).getTime();   // 20-11-2026 15:00 lokaal
  const s = K.samenvat(d.dagen, NU);
  toets('drie dagen, vanaf vandaag', s.dagen.length === 3 && s.dagen[0].datum === '2026-11-20');
  toets('het laagste en hoogste over die dagen', s.min === -3.1 && s.max === 7.9);
  toets('vorst gezien', s.vorst === true);
  toets('twee vorstnachten = een koudeperiode', s.koudePeriode === true);
  toets('gladheid: neerslag op een dag rond het vriespunt', s.glad === true);
  toets('sneeuw gezien', s.sneeuw === true);
  toets('onder het omslagpunt van 7 °C', s.onderOmslag === true);
  toets('niet warm', s.warm === false);
  const morgen = K.samenvat(d.dagen, NU + 864e5);
  toets('een dag later telt vandaag niet meer mee', morgen.dagen[0].datum === '2026-11-21' && morgen.dagen.length === 3);
  const droog = K.samenvat([{ datum: '2026-11-20', min: -2, max: 3, neerslag: 0, sneeuw: 0 }], NU);
  toets('vorst zonder neerslag is niet glad', droog.vorst && !droog.glad);
  const nat = K.samenvat([{ datum: '2026-11-20', min: 4, max: 8, neerslag: 12, sneeuw: 0 }], NU);
  toets('regen bij 4 °C is niet glad', !nat.glad && !nat.vorst);
  const zomer = K.samenvat([{ datum: '2026-11-20', min: 9, max: 18 }, { datum: '2026-11-21', min: 8, max: 16 }], NU);
  toets('elke dag boven 7 en 15 °C: warm', zomer.warm === true && zomer.onderOmslag === false);
  const ééndag = K.samenvat([{ datum: '2026-11-20', min: 9, max: 18 }, { datum: '2026-11-21', min: 8, max: 12 }], NU);
  toets('één dag onder 15 °C: niet warm', ééndag.warm === false);
  toets('geen verwachting: null', K.samenvat([], NU) === null && K.samenvat([{ datum: '2026-11-19', min: 1 }], NU) === null);
  toets('dagnaam: vandaag, morgen, dan de weekdag', K.dagNaam('2026-11-20', NU) === 'vandaag' && K.dagNaam('2026-11-21', NU) === 'morgen' && K.dagNaam('2026-11-22', NU) === 'zo');

  // Een verwachting van gisteren is verlopen, ook binnen het uur (31-10-2026).
  {
    const avond = new Date(2026, 10, 20, 23, 50).getTime(), nacht = new Date(2026, 10, 21, 0, 10).getTime();
    toets('verlopen: twintig minuten oud op dezelfde dag is nog goed', !W.verlopen({ t: avond - 30 * 60e3 }, avond - 10 * 60e3));
    toets('verlopen: over middernacht heen is opnieuw halen, ook al is het twintig minuten', W.verlopen({ t: avond }, nacht));
    toets('verlopen: ouder dan een uur', W.verlopen({ t: avond - 61 * 60e3 }, avond));
    toets('verlopen: niets bewaard = halen', W.verlopen(null, avond));
  }
  console.log('\n4. Ophalen in de app');
  let vragen = 0;
  const { W: W2, opslag } = laadWeer({ plFetch: async (u) => { vragen++; toets('de app vraagt alleen het id: ' + u, u === '/weer?plaats=gent'); return { ok: true, json: async () => ({ dagen: d.dagen }) }; } });
  const h1 = await W2.haal('gent');
  toets('opgehaald en bewaard', h1 && h1.dagen.length === 4 && /"plaats":"gent"/.test(opslag.pl_weer));
  await W2.haal('gent');
  toets('binnen het uur niet opnieuw', vragen === 1, String(vragen));
  toets('een plaats buiten de lijst: niets gevraagd', (await W2.haal('mijnhuis')) === null && vragen === 1);
  const { W: W3 } = laadWeer({ demoMode: true, plFetch: async () => { throw new Error('in de demo mag er niets naar buiten'); } });
  toets('in de demo geen vraag naar buiten', (await W3.haal('gent')) === null);

  console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen goed'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT ' + (e && e.stack || e)); process.exit(1); });
