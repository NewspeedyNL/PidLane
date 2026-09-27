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

  // ── De knop Fout (27-09-2026) ──
  console.log('\n— Fout: de klant zegt welke versnelling het is —');
  {
    // Een rit zonder de 1e: de laagste geleerde piek is dan eigenlijk de 2e,
    // en de nummering is dus één te laag — precies waar de knop voor is.
    const volg = [1,2,3,4,5,4,3,2];
    const prof2 = (function(){
      const seg = 14000, schakel = 1200; let T0 = null;
      const g = t => { const i = Math.floor((t - T0) / seg) % volg.length; return { gear: volg[i], inSeg: (t - T0) % seg }; };
      const f = t => {
        if (T0 === null) T0 = t;
        const { gear, inSeg } = g(t);
        if (inSeg < schakel) return { rpm: 1000 + 60 * Math.sin(t / 97), kmh: Math.round(RATIO[gear] * 1.9) };
        const fase = (inSeg - schakel) / (seg - schakel);
        const rpm = (1500 + 2300 * Math.sin(fase * Math.PI)) * (1 + 0.004 * Math.sin(t / 13));
        return { rpm, kmh: Math.round(RATIO[gear] * rpm / 1000) };
      };
      f.echt = t => { const { gear, inSeg } = g(t); return inSeg < schakel + 1600 ? null : gear + 1; };
      f.segStart = t => T0 === null ? 0 : (t - T0) % seg;
      return f;
    })();
    const a = nieuweApp();
    a.rij(200000, prof2);
    ok(a.G.model.gears.length === 5 && !a.G.nummeringZeker(), `zonder de 1e: 5 geleerd, nummering voorlopig (${a.G.model.gears.length})`);
    const fout = a.rij(60000, prof2, { score: prof2.echt });
    ok(fout !== null && fout < 0.2, `vóór de correctie klopt het cijfer bijna nooit (${(fout * 100).toFixed(1)}%)`);
    // Rij tot midden in een stabiel stuk en zeg welke het is.
    let echt = null;
    for (let i = 0; i < 400 && echt === null; i++) { a.rij(200, prof2); if (prof2.segStart(a.T) > 5000 && prof2.segStart(a.T) < 9000) echt = prof2.echt(a.T); }
    const r = a.G.corrigeer(echt);
    ok(r.ok && a.G.toon === echt, `corrigeer(${echt}) wordt meteen getoond (${JSON.stringify(r)})`);
    ok(a.G.nummeringZeker(), 'na een correctie is de nummering zeker');
    const goed = a.rij(120000, prof2, { score: prof2.echt });
    ok(goed >= 0.95, `daarna het juiste cijfer in ≥95% (${(goed * 100).toFixed(1)}%) — de rest schoof mee`);
    a.rij(8000, () => null);
    const weiger = a.G.corrigeer(2);
    ok(!weiger.ok && /Rij eerst/.test(weiger.reden), 'zonder verse stabiele meting weigert hij, met de reden erbij');
    ok(!a.G.corrigeer(0).ok && !a.G.corrigeer(11).ok, 'buiten 1–10 weigert hij');

    // Een anker is ook een snelle start: nog niets geleerd, 10 s in de 3e.
    const b = nieuweApp();
    b.rij(10000, () => ({ rpm: 2200 + 5 * Math.sin(b.T / 50), kmh: Math.round(RATIO[2] * 2.2) }));
    ok(b.G.model.gears.length === 0, 'na 10 s nog niets geleerd (anders toetst dit niets)');
    const rb = b.G.corrigeer(3);
    b.rij(2000, () => ({ rpm: 2200 + 5 * Math.sin(b.T / 50), kmh: Math.round(RATIO[2] * 2.2) }));
    ok(rb.ok && b.G.toon === 3, `met een anker staat er meteen een 3 (${b.G.toon})`);
  }

  console.log('\n— gekoppeld aan het voertuig (Mijn voertuigen) —');
  {
    const a = nieuweApp();
    a.rij(180000, profielMaker(RATIO));
    const model = JSON.parse(JSON.stringify(a.G.model));
    const b = nieuweApp();                          // ander toestel: lege opslag
    const bewaard = [];
    b.G.koppel({ id: 'v1', naam: 'Proefauto', versnellingen: 6, transmissie: 'handgeschakeld', model, bewaar: m => { bewaard.push(m); return Promise.resolve(); } });
    b.rij(400, () => null);
    ok(b.G.sleutel === 'kp_v1', `sleutel is het voertuig (${b.G.sleutel})`);
    ok(b.G.model.gears.length === 6 && b.G.model.totaal === model.totaal, `het model van de server is overgenomen (${b.G.model.gears.length})`);
    const pb = profielMaker(RATIO);
    const score = b.rij(60000, pb, { score: pb.echt });
    ok(score !== null && score >= 0.9, `rijdt meteen goed zonder opnieuw te leren (${score && (score * 100).toFixed(1)}%)`);
    b.G._opslaan(true);
    ok(bewaard.length >= 1 && typeof bewaard[bewaard.length - 1].hist === 'object', `het model gaat terug naar het voertuig (${bewaard.length}×)`);
    ok(b.G.status().verwacht === 6, 'het aantal versnellingen komt uit het profiel');
    // Een kleiner servermodel overschrijft niet wat hier al verder is.
    const c = nieuweApp({ opslag: b.opslag });
    c.G.koppel({ id: 'v1', model: { v: 1, hist: {}, totaal: 3, gears: [] }, bewaar: () => Promise.resolve() });
    ok(c.G.model.totaal >= model.totaal, `een kleiner servermodel wint niet (${c.G.model.totaal})`);
    c.G.koppel(null);
    c.rij(400, () => null);
    ok(c.G.sleutel === 'onbekend', 'ontkoppeld: terug naar de sleutel zonder voertuig');
  }

  console.log('\n— achteruit, slip, tijd per versnelling (ronde 2) —');
  {
    const a = nieuweApp();
    a.rij(180000, profielMaker(RATIO));
    const achter = () => ({ rpm: 1500 + 5 * Math.sin(a.T / 40), kmh: Math.round(6.2 * 1.5) });   // R ≈ 6,2
    a.rij(6000, achter);
    const r = a.G.corrigeer('R');
    ok(r.ok && a.G.toon === 'R' && a.G.status().achteruit > 5.5, `Fout → R wordt onthouden (${JSON.stringify(r)})`);
    const vooruit = profielMaker(RATIO);
    a.rij(20000, vooruit);
    const tussen = a.G.toon;
    a.rij(4000, achter);
    ok(typeof tussen === 'number' && a.G.toon === 'R' && a.G.waarde() === -1, `na vooruit rijden (${tussen}) weer achteruit: er staat R, en CA01 is -1`);
    const g = a.G.model.gears.length;
    a.rij(60000, achter);
    ok(a.G.model.gears.length === g && a.G.model.gears.every(x => Math.abs(x - 6.2) / 6.2 > 0.07), 'een minuut achteruit wordt geen extra versnelling');
    const pf = profielMaker(RATIO);
    const s1 = a.rij(60000, pf, { score: pf.echt });
    ok(s1 !== null && s1 >= 0.9, `vooruit blijft goed (${(s1 * 100).toFixed(1)}%)`);
    // R gelijk aan de 1e: niet te onderscheiden, dus weigeren.
    const b = nieuweApp();
    b.rij(180000, profielMaker(RATIO));
    b.rij(6000, () => ({ rpm: 1500 + 5 * Math.sin(b.T / 40), kmh: Math.round(RATIO[0] * 1.5) }));
    const rb = b.G.corrigeer('R');
    ok(!rb.ok && /niet uit elkaar/.test(rb.reden), 'R met dezelfde verhouding als de 1e: weigert, met de reden');

    // Slip: alleen bij een automaat.
    const c = nieuweApp();
    c.rij(180000, profielMaker(RATIO));
    c.rij(8000, profielMaker(RATIO));
    ok(c.G.slip() === null, 'handbak: geen slip');
    c.G.koppel({ id: 'v9', transmissie: 'automaat', bewaar: () => Promise.resolve() });
    c.G.model = JSON.parse(JSON.stringify(b.G.model)); c.G.model.offset = 0; c.G.model.ankers = [];
    c.G.toon = 3; c.G._paarNu = { t: c.T, kmh: Math.round(RATIO[2] * 2.5 * 0.9), rpm: 2500 };
    const sl = c.G.slip();
    ok(sl !== null && Math.abs(sl - 10) < 2, `automaat: motor 10% sneller dan de wielen ≈ 10% slip (${sl})`);
    c.G._paarNu = { t: c.T, kmh: 200, rpm: 2500 };
    ok(c.G.slip() === 0, 'wielen sneller dan de motor (uitrollen): 0, niet negatief');

    // Tijd per versnelling en het advies.
    const d = nieuweApp();
    d.rij(180000, profielMaker(RATIO));
    d.rij(480000, profielMaker(RATIO));
    const rs = d.G.rijstijl();
    const tot = rs.verdeling.reduce((x, y) => x + y.pct, 0);
    ok(rs.verdeling.length === 6 && tot >= 97 && tot <= 103, `tijd over zes versnellingen verdeeld (${rs.verdeling.map(x => x.k + ':' + x.pct).join(' ')})`);
    ok(rs.totaalS >= 300 && rs.advies.length >= 1, `er is een advies (${rs.totaalS} s gereden: ${rs.advies.join(' ')})`);
    const R2 = d.G.rijstijl({ 1: { s: 50, hoog: 40 }, 2: { s: 250, hoog: 200 }, 3: { s: 100, hoog: 20 } });
    ok(R2.hoogPct >= 25 && /opschakelen/.test(R2.advies.join(' ')), `veel hoogtoerig: advies eerder opschakelen (${R2.hoogPct}%)`);
    ok(d.G.rijstijl({ 3: { s: 60, hoog: 60 } }).advies.length === 0, 'onder 5 minuten rijtijd: geen advies');
    ok(d.G.sessie().stabiel > 0 && d.G.sessie().tijd['3'], 'de sessie telt stabiele metingen en tijd');

    console.log('\n— oordeel voor blok 5 —');
    const O = d.G.oordeel;
    ok(O({ stabiel: 100, pasten: 100 }, {}).staat === 'LET OP', 'te weinig metingen: LET OP met wat nodig is');
    ok(O({ stabiel: 500, pasten: 480 }, { versnellingen: [1, 2, 3, 4, 5, 6], verwacht: 6 }).staat === 'ok', '96% past, 6 van 6: ok');
    ok(O({ stabiel: 500, pasten: 300 }, { versnellingen: [1, 2, 3], verwacht: 6 }).staat === 'FOUT', '60% past: FOUT');
    ok(O({ stabiel: 500, pasten: 490 }, { versnellingen: [1, 2, 3, 4, 5, 6, 7], verwacht: 6 }).staat === 'FOUT', 'meer versnellingen dan het profiel: FOUT');
    const echt = O(d.G.sessie(), d.G.status());
    ok(echt.staat === 'ok', `de gesimuleerde rit zelf is ok (${echt.detail})`);
  }

  console.log('\n— leren uit opnames en uit eerdere ritten (ronde 3) —');
  {
    const a = nieuweApp();
    // Een opname van 1 Hz: 20 minuten door de zes versnellingen, met regels
    // waarin snelheid en toerental van verschillende momenten zijn.
    // Per versnelling 12 s optrekken (daar lopen snelheid en toerental uit de
    // pas) en 25 s constant rijden. Snelheid 400 ms ouder dan het toerental.
    const volg = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];
    const prof = function (t) {
      const seg = Math.floor(t / 37000) % volg.length, in_ = t % 37000, g = volg[seg];
      const rpm = in_ < 12000 ? 1500 + in_ / 12000 * 1500 : 2600 + 20 * Math.sin(t / 900);
      return { rpm, kmh: Math.round(RATIO[g] * rpm / 1000) };
    };
    const regels = [];
    let t = 5e6;
    for (let i = 0; i < 1200; i++) {
      t += 1000;
      regels.push({ t, v: { '010C': prof(t).rpm, '010D': prof(t - 400).kmh } });
    }
    const h = a.G.histUitRegels(regels);
    ok(h.n > 250 && h.bin === a.G.cfg.binLog, `uit 20 min opname ${h.n} stabiele metingen`);
    const r = a.G.leerUitHist(h, 'opname:x');
    const g = a.G.model.gears;
    ok(r.ok && g.length === 6 && g.every((x, i) => Math.abs(x - RATIO[i]) / RATIO[i] < 0.03), `zonder te rijden alle 6 versnellingen geleerd (${g.join(', ')})`);
    ok(a.G.leerUitHist(h, 'opname:x').dubbel === true && a.G.model.totaal === h.n, 'dezelfde opname telt geen tweede keer');
    const gat = regels.filter((x, i) => i % 5 === 0);                     // één regel per 5 s: elk stuk heeft een gat
    ok(a.G.histUitRegels(gat).n === 0, 'een opname met gaten van 5 s levert niets op: een gat is geen stabiel stuk');
    ok(a.G.histUitRegels([{ t: 1, v: { '010C': 800, '010D': 0 } }]).n === 0, 'stilstand levert niets');

    // Uit = niet tonen, wel leren; en het rit-histogram.
    const b = nieuweApp();
    b.G.zetUit(true);
    b.G.ritHist(true);
    b.rij(180000, profielMaker(RATIO));
    ok(b.G.model.gears.length === 6 && b.G.waarde() === null && b.G.status().uit, 'uitgezet: niets in beeld (ook CA01 niet), maar wel 6 versnellingen geleerd');
    const rh = b.G.ritHist(true);
    ok(rh && rh.n === b.G.model.totaal && b.G.ritHist(false) === null, `het rit-histogram draagt precies wat deze rit leerde (${rh && rh.n}) en is daarna leeg`);
    ok(JSON.stringify(rh).length < 3000, `klein genoeg voor de rit op de server (${JSON.stringify(rh).length} tekens)`);

    // Opnieuw opbouwen uit ritten: een vervuild model wordt weer goed, en de correcties blijven.
    const c = nieuweApp();
    c.rij(180000, profielMaker(RATIO, 1.12));                          // verkeerde banden / andere auto
    c.G.model.ankers = [{ k: 3, r: 19.6, t: 1 }];
    const o = c.G.bouwUitRitten([{ id: 'rit:1', h: rh }, { id: 'rit:2', h: null }]);
    ok(o.ritten === 1 && c.G.model.gears.length === 6 && Math.abs(c.G.model.gears[0] - RATIO[0]) / RATIO[0] < 0.03, `opgebouwd uit de rit: ${c.G.model.gears.join(', ')}`);
    ok(c.G.model.ankers.length === 1 && c.G.model.bronnen['rit:1'] > 0, 'de correctie bleef staan en de rit staat als bron genoteerd');
  }

  console.log(fouten ? `\n${fouten} fout(en)` : '\nAlles goed');
  process.exit(fouten ? 1 : 0);
})();
