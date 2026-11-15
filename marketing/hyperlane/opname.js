// opname.js — neemt Hyperlane op voor de website (15-11-2026)
//
// De echte app in demomodus: de Mazda CX-5 met het pakket van een echte
// CX-5 2018. Geen mockup. Elke scène wordt opgewekt via het scenario-
// mechanisme van de demo (_scenario, pidlane-auth.js): de demo geeft dan die
// waarden terug, en alles erboven (poll, visprofiel, Hyperlane) is echte code.
// Eén uitzondering: de dwars-G. Die komt in de auto uit de sensoren van de
// telefoon (pidVals.TL04, pidlane-telemetrie.js); hier zetten we hem elk beeld
// zelf, want een headless browser heeft geen versnellingsmeter.
//
// Altijd liggend en volledig scherm (PLVisThema.aan), zoals in de houder:
//   telefoon  915×412 — de tunnel over het hele scherm
//   tablet    1280×800 — de cockpit (cockpitMaat: ≥800×540 en liggend)
//
//   node marketing/hyperlane/opname.js                 alles, beide toestellen
//   node marketing/hyperlane/opname.js --proef         één beeld per scène + controle
//   node marketing/hyperlane/opname.js --toestel telefoon --alleen launch,remmen
//   node marketing/hyperlane/opname.js --fps 24
//
// Uitvoer: marketing/hyperlane/opname/<toestel>/<scène>/NNNN.png + tijden.json
//          marketing/hyperlane/opname/<toestel>/standen|vormen|midden/*.png
// Daarna: node marketing/hyperlane/maak-video.js  (ffmpeg → uit/)
// Bij --proef: exit 1 als een scène niet de scène liet zien die hij belooft.
'use strict';
const path = require('path'), fs = require('fs');
const { startApp } = require(path.join(__dirname, '..', '..', 'plbrowser.js'));
const UIT = path.join(__dirname, 'opname');
const z = ms => new Promise(r => setTimeout(r, ms));

const arg = (n, std) => { const i = process.argv.indexOf('--' + n); return i < 0 ? std : (process.argv[i + 1] || std); };
const PROEF = process.argv.includes('--proef');
const FPS = Number(arg('fps', 20));
const ALLEEN = arg('alleen', '') ? arg('alleen', '').split(',') : null;
const TOESTELLEN = { telefoon: { b: 915, h: 412 }, tablet: { b: 1280, h: 800 } };
const WELKE = arg('toestel', 'beide') === 'beide' ? Object.keys(TOESTELLEN) : [arg('toestel')];

/* ── HET DRAAIBOEK ──
   Per scène: duur (s), optioneel stand/vorm/midden, en waarden(t) met t in
   seconden sinds de start van de scène. `verwacht` is de scène die
   Hyperlane dan hoort te tonen (data-scene, scene() in pidlane-hyperlane.js):
   alarm ≥118 °C · begrenzer ≥98% van de rode streep · remmen ≥8 km/h per s ·
   launch 0–100 loopt · koud <60 °C · stil >3 s stilstand · cruise 8 s >70 km/h.
   `voor` (s) draait eerst zonder op te nemen: om in een scène te komen.
   Koelwater pollt traag (een nieuwe waarde na ± 5 s, nagemeten 15-11-2026),
   en koud gaat vóór stil: koud, stil en hitte hebben daarom een lange aanloop. */
const lin = (a, b, t, d) => a + (b - a) * Math.max(0, Math.min(1, t / d));
const golf = (t, p) => Math.sin(t / p * Math.PI * 2);
const RIJ = { rpm: 1800, kmh: 50, koel: 89, gas: 18, g: 0 };
const DRAAIBOEK = [
  { naam: 'opstart', sec: 5, opnieuw: true, waarden: () => ({ rpm: 820, kmh: 0, koel: 88, gas: 0 }), verwacht: null },
  { naam: 'koud', sec: 6, voor: 9, waarden: t => ({ rpm: 1150 + golf(t, 3) * 80, kmh: 30 + golf(t, 5) * 5, koel: 34, gas: 12 }), verwacht: 'koud' },
  { naam: 'stil', sec: 6, voor: 10, waarden: () => ({ rpm: 760, kmh: 0, koel: 89, gas: 0 }), verwacht: 'stil' },
  { naam: 'launch', sec: 8, voor: 3, waarden: t => {
      const kmh = Math.min(104, 100 * Math.pow(t / 7, 1.15));
      const versn = [0, 2.2, 4.4, 6.6, 99].findIndex(g => t < g);
      const rpm = 2600 + ((t % 2.2) / 2.2) * 3400 * (versn < 4 ? 1 : .5);
      return { rpm, kmh, koel: 90, gas: 100 };
    }, verwacht: 'launch' },
  { naam: 'max', sec: 5, voor: 1, waarden: t => ({ rpm: 7400 + golf(t, .4) * 60, kmh: 118, koel: 94, gas: 100 }), verwacht: 'begrenzer' },
  { naam: 'remmen', sec: 5, voor: 0, waarden: t => ({ rpm: lin(3800, 1400, t, 4.5), kmh: lin(118, 20, t, 4.5), koel: 92, gas: 0 }), verwacht: 'remmen' },
  { naam: 'cruise', sec: 8, voor: 13, waarden: t => ({ rpm: 2150 + golf(t, 6) * 20, kmh: 100 + golf(t, 7) * .4, koel: 89, gas: 16 }), verwacht: 'cruise' },
  { naam: 'zen', sec: 7, voor: 9, stand: 'cruise', vorm: 'stil', waarden: t => ({ rpm: 1900, kmh: 88 + golf(t, 9) * .3, koel: 88, gas: 12 }), verwacht: 'cruise' },
  { naam: 'bocht', sec: 7, voor: 1, waarden: t => ({ rpm: 3200 + golf(t, 3.5) * 300, kmh: 62, koel: 90, gas: 35, g: golf(t, 3.5) * .65 }), verwacht: 'rijden' },
  { naam: 'sport', sec: 7, voor: 1, stand: 'sport', waarden: t => ({ rpm: 4800 + golf(t, 2.5) * 900, kmh: 95 + golf(t, 4) * 15, koel: 93, gas: 55 + golf(t, 2.5) * 30 }), verwacht: null },
  { naam: 'hitte', sec: 6, voor: 8, waarden: t => ({ rpm: 1300 + golf(t, 3) * 100, kmh: 20, koel: 121, gas: 10 }), verwacht: 'alarm' },
];
// Losse beelden van de keuzes: elke stand, elke vorm, elk midden.
const KEUZES = {
  standen: ['auto', 'eco', 'sport', 'cruise'].map(s => ({ naam: s, stand: s })),
  vormen: ['aurora', 'pulsen', 'sterren', 'stil', 'tunnel'].map(v => ({ naam: v, vorm: v })),
  midden: ['slim', 'versnelling'].map(m => ({ naam: m, midden: m })),
};

// ── In de app ──
const KAAL = `(function(){
  document.head.insertAdjacentHTML('beforeend','<style>#bronBanner,#plZonderKaart,.toast,#toast{display:none!important}</style>');
  ['loginOv','welcomeScreen'].forEach(function(id){ var e=document.getElementById(id); if(e) e.classList.add('hidden'); });
  return true; })()`;
// De waarden in het scenario zetten. 0149 (pedaal) en 0111 (gasklep) volgen
// het gas; 0104 de belasting; 0110 (luchtmassa) toeren en gas, want daar
// rekent de app het verbruik uit (de CX-5 meldt geen 015E): 2600 tpm met 30%
// gas is 12,7 g/s, ± 5,8 L/100 bij 72 km/h. De G gaat rechtstreeks in pidVals.TL04.
const zetWaarden = w => `(function(){
  _scenario.enabled=true;
  var p=_scenario.pids; p['010C']=${w.rpm.toFixed(0)}; p['010D']=${w.kmh.toFixed(1)}; p['0105']=${w.koel.toFixed(1)};
  p['0149']=${w.gas.toFixed(1)}; p['0111']=${Math.max(5, w.gas).toFixed(1)}; p['0104']=${Math.max(15, w.gas * .9).toFixed(1)};
  p['0110']=${(w.rpm / 1000 * 2 + w.gas * .25).toFixed(2)};
  if(window.pidVals) pidVals.TL04=${(w.g || 0).toFixed(3)};
  return true; })()`;
// Het scenario legt ±0,6% van het bereik aan ruis over elke waarde: ±1,7 km/h
// op 0…280. Dan rijdt de auto nooit 8 s gelijkmatig (cruise) en staat hij
// nooit stil (onder 1 km/h). Voor de opname geeft demo() de waarden van het
// draaiboek daarom zonder die ruis; het draaiboek beweegt zelf al. Alleen in
// deze opname, niet in de app (nagemeten 15-11-2026 op de tablet).
const ZONDER_RUIS = `(function(){
  if(window._plOpnameDemo) return true;
  var orig=demo; window._plOpnameDemo=orig;
  demo=function(pid){
    if(_scenario.enabled && _scenario.pids[pid]!==undefined){
      var d=getPidDef(pid); return d ? Math.max(d.min, Math.min(d.max, _scenario.pids[pid])) : _scenario.pids[pid];
    }
    return orig(pid);
  };
  return true; })()`;
const keuze = k => `(async function(){
  ${k.stand ? `PLHyperlane.zetStand('${k.stand}');` : ''}
  ${k.vorm ? `localStorage.setItem('pl_hl_vorm','${k.vorm}');` : ''}
  ${k.midden ? `localStorage.setItem('pl_hl_midden','${k.midden}');` : ''}
  return true; })()`;
// Hyperlane (opnieuw) openen, volledig scherm. Opnieuw openen speelt ook het
// showmoment af (OPSTART_S), en neemt een nieuwe vorm of midden mee.
const OPEN = `(async function(){
  var w=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
  try{ if(window.PLVisThema && PLVisThema.uit) PLVisThema.uit(); }catch(e){ console.warn('opname: volledig scherm sluiten mislukt', e); }
  PLNav.tab('live'); PLVisProfiel.bewaar('hyperlane');
  setPidView('overzicht'); await w(250); setPidView('visueel'); await w(1200);
  if(window.PLVisueel && PLVisueel.herbouwKeuze) PLVisueel.herbouwKeuze();
  await w(300); PLVisThema.aan(); await w(400);
  return [].slice.call(document.querySelectorAll('[data-scene]')).some(function(x){ return x.getClientRects().length; }); })()`;
// Alleen het zichtbare Hyperlane telt: na herbouwKeuze() kan er een oude,
// verborgen wortel blijven hangen die op 'rijden' blijft staan.
// Hyperlane neemt per beeld hoogstens 0,05 s klok (frame(), dt=min(.05,…)).
// Tekent de browser minder dan 20 beelden per seconde (de tablet: software-
// GL), dan lopen de tellers op die klok trager dan de echte: stilstand (3 s)
// en cruise (8 s) komen later. Remmen en launch rekenen met echte tijd
// (snelheid per seconde), die mogen dus níét vertraagd. Daarom rekt TEMPO
// alleen de aanloop (`voor`) en de rijtijd vóór de losse beelden.
const TEMPO = `new Promise(function(r){ var n=0, t0=performance.now();
  (function f(){ n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else r(Math.min(1, n/((performance.now()-t0)/1000)*.05)); })(); })`;
const SCENE = `(function(){ var e=[].slice.call(document.querySelectorAll('[data-scene]')).filter(function(x){ return x.getClientRects().length; });
  return e.length ? e.map(function(x){ return x.getAttribute('data-scene'); }).join('+') : null; })()`;

async function speel(a, sc, map, tempo) {
  const n = PROEF ? 1 : Math.round(sc.sec * FPS);
  const t0 = Date.now() + (sc.voor || 0) / tempo * 1000, tijden = [];
  const klok = () => (Date.now() - t0) / 1000;
  // aanloop: waarden lopen, er wordt niets bewaard
  while (Date.now() < t0) { await a.ev(zetWaarden(Object.assign({}, RIJ, sc.waarden(0)))); await z(100); }
  if (PROEF) {          // in de proef: de scène uitspelen tot zijn kern, dan één beeld
    const eind = Date.now() + sc.sec * 600;
    while (Date.now() < eind) { await a.ev(zetWaarden(Object.assign({}, RIJ, sc.waarden(klok())))); await z(100); }
  }
  // De controle leest de scène halverwege de opname, vóór de schermafdruk: een
  // afdruk op de tablet duurt ± 0,3 s, en remmen is dan al voorbij.
  let gezien = null;
  for (let i = 0; i < n; i++) {
    const t = klok();
    await a.ev(zetWaarden(Object.assign({}, RIJ, sc.waarden(t))));
    if (i === Math.floor(n / 2)) gezien = await a.ev(SCENE);
    await a.schermafdruk(path.join(map, String(i).padStart(4, '0') + '.png'));
    tijden.push(Date.now() - t0);
    const rest = 1000 / FPS - (Date.now() - t0 - t * 1000);
    if (rest > 0) await z(rest);
  }
  fs.writeFileSync(path.join(map, 'tijden.json'), JSON.stringify({ tempo, ms: tijden }));
  return gezien;
}

(async () => {
  let mis = 0;
  for (const toestel of WELKE) {
    const m = TOESTELLEN[toestel];
    if (!m) { console.log('Onbekend toestel: ' + toestel + ' (bekend: ' + Object.keys(TOESTELLEN).join(', ') + ')'); process.exit(2); }
    const basis = path.join(UIT, toestel);
    fs.rmSync(basis, { recursive: true, force: true });
    const a = await startApp({ root: path.join(__dirname, '..', '..', 'public'), breedte: m.b, hoogte: m.h });
    try {
      console.log(toestel + ' (' + m.b + '×' + m.h + ')');
      await a.ev(KAAL);
      await a.ev(`localStorage.setItem('pl_hl_tablet_sim','0'); startDemoCar(0); true`);
      await a.ev(ZONDER_RUIS);
      await z(4000);
      await a.ev(keuze({ stand: 'auto', vorm: 'aurora', midden: 'slim' }));
      if (!await a.ev(OPEN)) throw new Error('Hyperlane opende niet (geen [data-scene])');
      const tempo = await a.ev(TEMPO);
      console.log('  tempo ' + tempo.toFixed(2) + (tempo < 1 ? ' — de klok van Hyperlane loopt hier trager; de aanlopen worden langer' : ''));
      let open = 'aurora/slim';
      for (const sc of DRAAIBOEK) {
        if (ALLEEN && !ALLEEN.includes(sc.naam)) continue;
        const map = path.join(basis, sc.naam); fs.mkdirSync(map, { recursive: true });
        const k = { stand: sc.stand || 'auto', vorm: sc.vorm || 'aurora', midden: sc.midden || 'slim' };
        await a.ev(keuze(k));
        // Een andere vorm of midden neemt Hyperlane pas mee als hij opnieuw opent.
        if (sc.opnieuw || k.vorm + '/' + k.midden !== open) { await a.ev(OPEN); open = k.vorm + '/' + k.midden; }
        const gezien = await speel(a, sc, map, tempo);
        const goed = !sc.verwacht || gezien === sc.verwacht;
        if (!goed) mis++;
        console.log('  ' + (goed ? 'ok  ' : 'MIS ') + sc.naam.padEnd(8) + ' scène: ' + gezien + (sc.verwacht ? ' (verwacht ' + sc.verwacht + ')' : ''));
      }
      if (!ALLEEN) for (const [groep, lijst] of Object.entries(KEUZES)) {
        const map = path.join(basis, groep); fs.mkdirSync(map, { recursive: true });
        for (const k of lijst) {
          await a.ev(keuze(Object.assign({ stand: 'auto', vorm: 'aurora', midden: 'slim' }, k)));
          await a.ev(OPEN);
          const eind = Date.now() + 5000 / tempo;  // na het showmoment, gewoon rijden
          while (Date.now() < eind) { await a.ev(zetWaarden(Object.assign({}, RIJ, { rpm: 2600, kmh: 72, gas: 30 }))); await z(100); }
          await a.schermafdruk(path.join(map, k.naam + '.png'));
          console.log('  ' + groep + '/' + k.naam);
        }
      }
      if (a.fouten.length) console.log('LET OP  JS-fouten: ' + a.fouten.slice(0, 3).join(' | '));
    } finally { await a.ev('_scenario.enabled=false; true').catch(() => {}); await a.stop(); }
  }
  if (PROEF && mis) { console.log('\n' + mis + ' scène(s) toonden niet wat ze beloven — pas het draaiboek aan.'); process.exit(1); }
})().catch(e => { console.error('FOUT ' + e.message); process.exit(1); });
