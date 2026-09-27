// ══════════════════════════════════════════════════════════════════
// test-gear.js — de versnellingsindicator (pidlane-gear.js)
// ──────────────────────────────────────────────────────────────────
// Laadt de ECHTE module in een vm-context met een eigen klok en een
// nagebootste pidHist, en rijdt er een 6-bak doorheen: gehele km/u, pollen
// elke ~330 ms, ruis op het toerental, schakelen met koppeling.
//
// Wat hier rood hoort te worden:
//   • de uitlijnpoort open (snelheid en toerental van verschillende momenten
//     tellen als paar) — dan leert hij van een mengsel;
//   • oude cachewaarden die toch een cijfer opleveren;
//   • de ruwe VIN als sleutel of in een logregel (§7, #102);
//   • geen afwijking-melding bij andere banden.
//
// Draaien vanuit public/:  node test-gear.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRON = fs.readFileSync(path.join(__dirname, 'pidlane-gear.js'), 'utf8');
let fouten = 0;
function ok(v, wat){ if (v) console.log('  ok  ' + wat); else { console.log('  FOUT  ' + wat); fouten++; } }

const RATIO = [7.4, 13.1, 19.6, 25.8, 31.9, 38.2];   // km/u per 1000 tpm
const VIN = 'WVWZZZ3CZHE000000';                     // verzonnen, zelfde als test-vin-anoniem.js

function nieuweApp(opt){
  opt = opt || {};
  let T = 1_000_000;
  const opslag = opt.opslag || new Map();
  const logs = [];
  const ctx = {
    console: { log(){}, warn(){ logs.push(['warn'].concat([].slice.call(arguments)).join(' ')); } },
    Date: { now: () => T },
    Math, JSON, Promise, Object, Array, String, Number,
    setInterval: () => 1, setTimeout: () => 1,
    localStorage: {
      getItem: k => opslag.has(k) ? opslag.get(k) : null,
      setItem: (k, v) => { opslag.set(k, String(v)); },
      removeItem: k => { opslag.delete(k); }
    },
    connected: true, demoMode: false,
    pidHist: {}, vehicleInfo: { merk: 'Test', model: 'Auto', vin: opt.vin || '' },
    log: (m) => logs.push(String(m)),
    showToast: () => {}
  };
  if (opt.pseudoniem) ctx._vlVinPseudoniem = async v => 'ps' + v.length + 'x';
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(BRON, ctx, { filename: 'pidlane-gear.js' });
  const G = ctx.PLGear;
  if (!G) throw new Error('PLGear niet gezet — anker weg?');
  return {
    ctx, G, logs, opslag,
    get T(){ return T; },
    // Laat tijd lopen: elke 200 ms een tick, elke `poll` ms een nieuw paar.
    rij(ms, profiel, o){
      o = o || {};
      const poll = o.poll || 330, lag = o.lag || 40;
      let volgendPoll = T;
      const eind = T + ms;
      let goed = 0, geteld = 0;
      while (T < eind){
        T += 10;
        if (T >= volgendPoll){
          volgendPoll = T + poll + ((T / 7) % 40);           // wat jitter
          const p = profiel(T);
          if (p){
            const S = ctx.pidHist['010D'] = ctx.pidHist['010D'] || [];
            const R = ctx.pidHist['010C'] = ctx.pidHist['010C'] || [];
            R.push({ t: T, v: p.rpm });
            S.push({ t: T + lag - (o.snelheidLoopt || 0), v: p.kmh });
            if (S.length > 60) S.shift(); if (R.length > 60) R.shift();
          }
        }
        if (T % 200 === 0){
          G._tick();
          if (o.score){ const w = o.score(T); if (w != null){ geteld++; if (G.toon === w) goed++; } }
        }
      }
      return geteld ? goed / geteld : null;
    }
  };
}

// Rijprofiel: telkens een versnelling ~14 s, toeren glijden 1500→3800,
// schakelen = 1,2 s koppeling in (toeren zakken naar ~1000, snelheid houdt).
function profielMaker(ratio, factor){
  factor = factor || 1;
  const seg = 14000, schakel = 1200;
  const volgorde = [0,1,2,3,4,5,4,3,2,1,2,3,4,5,5,4,3];
  let T0 = null;
  function gearOp(t){
    const i = Math.floor((t - T0) / seg) % volgorde.length;
    return { gear: volgorde[i], inSeg: (t - T0) % seg };
  }
  const f = function(t){
    if (T0 === null) T0 = t;
    const { gear, inSeg } = gearOp(t);
    const r = ratio[gear] * factor;
    if (inSeg < schakel){
      const rpm = 1000 + 60 * Math.sin(t / 97);
      const kmh = Math.round(ratio[gear] * factor * 1.9);
      return { rpm, kmh };
    }
    const fase = (inSeg - schakel) / (seg - schakel);
    const rpm = (1500 + 2300 * Math.sin(fase * Math.PI)) * (1 + 0.004 * Math.sin(t / 13));
    const kmh = Math.round(r * rpm / 1000);
    return { rpm, kmh };
  };
  f.echt = function(t){
    const { gear, inSeg } = gearOp(t);
    return inSeg < schakel + 1600 ? null : gear + 1;   // net na schakelen niet scoren
  };
  return f;
}

console.log('\n— leren en tonen (6-bak) —');
{
  const a = nieuweApp();
  const prof = profielMaker(RATIO);
  a.rij(180000, prof);
  const g = a.G.model.gears;
  ok(g.length === 6, `6 versnellingen geleerd na 3 min (kreeg ${g.length}: ${g.join(', ')})`);
  const binnen = g.length === 6 && g.every((r, i) => Math.abs(r - RATIO[i]) / RATIO[i] < 0.02);
  ok(binnen, 'elke geleerde ratio binnen 2% van de echte');
  ok(a.G.nummeringZeker(), 'nummering zeker: de 1e is gezien');
  const score = a.rij(120000, prof, { score: prof.echt });
  ok(score !== null && score >= 0.95, `juist cijfer in ≥95% van de stabiele momenten (${score && (score * 100).toFixed(1)}%)`);
}

console.log('\n— uitlijnpoort: snelheid en toerental van verschillende momenten —');
{
  const a = nieuweApp();
  a.rij(180000, profielMaker(RATIO), { snelheidLoopt: 1000 });
  ok(a.G.model.totaal === 0, `niets geleerd van paren die 1 s uit elkaar liggen (totaal ${a.G.model.totaal})`);
  ok(a.G.toon === null, 'en dus ook geen cijfer');
}

console.log('\n— oude cachewaarden tonen niets —');
{
  const a = nieuweApp();
  const prof = profielMaker(RATIO);
  a.rij(180000, prof);
  a.rij(8000, prof);                           // net ná het begin van een segment in stabiele versnelling
  const voor = a.G.toon;
  a.rij(2000, () => null);                     // adapter levert niets meer
  ok(voor !== null && a.G.toon === null, `cijfer verdwijnt als de laatste meting ouder dan 1,5 s is (was ${voor}, nu ${a.G.toon})`);
  // Het scherpe geval: een cijfer verdwijnt na houdMs ook zonder versheidspoort,
  // maar N wordt daar bewust níét door gewist. Uitrollen in z'n vrij en dan
  // valt de adapter weg — zonder poort bleef de N eeuwig staan.
  a.rij(4000, t => ({ kmh: 50, rpm: 800 + 20 * Math.sin(t / 50) }));
  const n = a.G.toon;
  a.rij(3000, () => null);
  ok(n === 'N' && a.G.toon === null, `N verdwijnt als de adapter wegvalt (was ${n}, nu ${a.G.toon})`);
}

console.log('\n— geen verbinding of demo: logo terug —');
{
  const a = nieuweApp();
  const prof = profielMaker(RATIO);
  a.rij(188000, prof);
  const voor = a.G.toon;
  a.ctx.demoMode = true; a.rij(400, prof);
  ok(voor !== null && a.G.toon === null, 'demo aan → geen cijfer');
  a.ctx.demoMode = false; a.ctx.connected = false; a.rij(400, prof);
  ok(a.G.toon === null, 'niet verbonden → geen cijfer');
}

console.log('\n— andere banden (+10%): afwijking, en Leer opnieuw herstelt —');
{
  const a = nieuweApp();
  a.rij(180000, profielMaker(RATIO));
  ok(!a.G.afwijking, 'geen afwijking op de eigen auto');
  a.rij(150000, profielMaker(RATIO, 1.10));
  ok(a.G.afwijking, 'afwijking gemeld na 10% grotere omtrek');
  a.G.leerOpnieuw();
  const prof = profielMaker(RATIO, 1.10);
  a.rij(180000, prof);
  const score = a.rij(120000, prof, { score: prof.echt });
  ok(!a.G.afwijking && score >= 0.9, `na opnieuw leren weer juist (${(score * 100).toFixed(1)}%)`);
}

console.log('\n— privacy: de ruwe VIN gaat nergens in (§7, #102) —');
(async () => {
  const a = nieuweApp({ vin: VIN, pseudoniem: true });
  a.rij(1000, profielMaker(RATIO));
  await new Promise(r => setImmediate(r));
  a.rij(180000, profielMaker(RATIO));
  a.G._opslaan(true);
  a.G.leerOpnieuw();
  const sleutels = [...a.opslag.keys()].join('\n');
  const waarden = [...a.opslag.values()].join('\n');
  ok(a.G.sleutel && a.G.sleutel !== 'onbekend', `model op een voertuigsleutel (${a.G.sleutel})`);
  ok(!sleutels.includes(VIN) && !waarden.includes(VIN), 'geen ruwe VIN in localStorage-sleutels of -waarden');
  ok(!a.logs.some(l => l.includes(VIN)), 'geen ruwe VIN in het logboek');

  // Zonder pseudoniemfunctie: gedeeld model, nooit terugvallen op de VIN.
  const b = nieuweApp({ vin: VIN });
  b.rij(1000, profielMaker(RATIO));
  await new Promise(r => setImmediate(r));
  ok(b.G.sleutel === 'onbekend', 'zonder _vlVinPseudoniem: gedeeld model, niet de VIN');

  // Model komt terug na herstart (zelfde opslag).
  const c = nieuweApp({ vin: VIN, pseudoniem: true, opslag: a.opslag });
  c.rij(1000, profielMaker(RATIO));
  await new Promise(r => setImmediate(r));
  ok(c.G.sleutel === a.G.sleutel, 'na herstart hetzelfde model gekozen');

  console.log(fouten ? `\n${fouten} fout(en)` : '\nAlles goed');
  process.exit(fouten ? 1 : 0);
})();
