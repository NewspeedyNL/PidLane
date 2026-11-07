// ══════════════════════════════════════════════════════════════════
// test-cockpit.js — Hyperlane als cockpit op een tablet (02-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-hyperlane.js en pidlane-visprofiel.js in een vm en
// toetst wat zonder scherm te toetsen is:
//   • tablet of telefoon (cockpitMaat) en dat alleen een tablet de
//     cockpit-plekken (rempedaal, G, helling, kat, ATF) en alle standen vraagt;
//   • het rempedaal: een eigen PID op naam, geen "Remaining range", een
//     remschakelaar (0/1) als vol, en zonder sensor geschat uit de vertraging;
//   • turbodruk, temperatuurstanden, de waarschuwingsrand, tik = groot,
//     zuinig bij hitte of lege accu, de grafiek en de G-cirkel;
//   • het korte label: "Engine Oil Temperature" wordt geen "ENGINE OI…";
//   • het vak (cockpitHtml) en de CSS met dezelfde maten als cockpitMaat.
// Wat in de echte app gebeurt (tekenen, tik = groot): bproef-cockpit.js.
//
// Draaien vanuit public/:  node test-cockpit.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const lees = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
const CSS = lees('pidlane.css');
function laad(scherm) {
  const opslag = {};
  const c = { console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } } };
  c.window = c;
  if (scherm) { c.innerWidth = scherm[0]; c.innerHeight = scherm[1]; }
  vm.createContext(c);
  ['pidlane-toon.js', 'pidlane-hyperlane.js', 'pidlane-visprofiel.js'].forEach(f => vm.runInContext(lees(f), c, { filename: f }));
  return c;
}
const T = laad([1280, 800]), F = laad([915, 412]);
const H = T.PLHyperlane, P = T.PLVisProfiel;

console.log('\n1. Tablet of telefoon');
waar('telefoon liggend (915×412, 932×430) is geen cockpit', !H.cockpitMaat(915, 412) && !H.cockpitMaat(932, 430));
waar('tablet liggend (1280×800, 1024×600) is een cockpit', H.cockpitMaat(1280, 800) && H.cockpitMaat(1024, 600));
waar('tablet staand is geen cockpit', !H.cockpitMaat(800, 1280));
waar('onbekende maat is geen cockpit', !H.cockpitMaat(undefined, undefined));
const rol = c => c.PLVisProfiel.voor('hyperlane', null).plekken.map(x => x.rol);
waar('op een tablet vraagt Hyperlane rempedaal, G, helling, kat en ATF', ['rem', 'gx', 'gy', 'helling', 'kanteling', 'kat', 'atf', 'boost'].every(r => rol(T).indexOf(r) >= 0), rol(T).join(','));
waar('op een tablet staan de plekken van alle standen aan (olie en belasting in Auto)', ['olie', 'last'].every(r => rol(T).indexOf(r) >= 0));
waar('op een telefoon geen cockpit-plek (geen extra bustijd)', ['rem', 'gx', 'helling', 'kat', 'atf', 'boost'].every(r => rol(F).indexOf(r) < 0), rol(F).join(','));
waar('op een telefoon in Auto geen olie en belasting (de standen blijven)', rol(F).indexOf('olie') < 0 && rol(F).indexOf('last') < 0);
const kt = T.PLVisProfiel.ketens('hyperlane', null, {}).map(k => k[0]);
waar('de telemetrie (TL01–TL04) komt in de ketens: anders zet niemand hem aan', ['TL01', 'TL02', 'TL03', 'TL04'].every(q => kt.indexOf(q) >= 0));
const diesel = T.PLVisProfiel.voor('hyperlane', 'diesel').plekken.map(x => x.rol);
waar('een diesel houdt laaddruk en krijgt de cockpit ook', diesel.indexOf('laad') >= 0 && diesel.indexOf('rem') >= 0);

console.log('\n2. Het rempedaal');
const defs = [{ pid: '22F1A0', name: 'Remaining range', unit: 'km' }, { pid: '221234', name: 'Rempedaalpositie', unit: '%' },
  { pid: '22ABCD', name: 'Transmission Fluid Temp', unit: '°C' }];
const alles = q => ['010C', '010D', '0105', '0111', '221234', '22F1A0', '22ABCD', 'TL01'].indexOf(q) >= 0;
const ind = P.indeling('hyperlane', alles, null, { defs: defs });
waar('een eigen PID met "rempedaal" in de naam komt op de rembalk', ind.plekken.rem === '221234', JSON.stringify(ind.plekken));
waar('de bakolie vindt "Transmission Fluid Temp"', ind.plekken.atf === '22ABCD');
const ind2 = P.indeling('hyperlane', alles, null, { defs: [defs[0]] });
waar('"Remaining range" is geen rem', ind2.plekken.rem === null);
const ind3 = P.indeling('hyperlane', q => alles(q) || q === '22AAAA', null, { defs: [{ pid: '22AAAA', name: 'Brake Pedal Position', unit: '%' }] });
waar('Engels "Brake Pedal Position" ook', ind3.plekken.rem === '22AAAA');
waar('met de hand gekozen gaat voor', P.indeling('hyperlane', alles, null, { defs: defs, keuze: { 'hyperlane/rem': '22F1A0' } }).plekken.rem === '22F1A0');
waar('pedaal in %: 50 is half', Math.abs(H.remDeel(50, 0, 100, false) - .5) < 1e-9);
waar('remschakelaar: 1 is vol, 0 is los', H.remDeel(1, 0, 100, true) === 1 && H.remDeel(0, 0, 100, true) === 0);
waar('na een tussenwaarde is 1 gewoon 1%', Math.abs(H.remDeel(1, 0, 100, false) - .01) < 1e-9);
waar('geen waarde = null, niet 0', H.remDeel(null, 0, 100, true) === null && H.remDeel('', 0, 100, false) === null);
waar('geschat: half bij 15 km/h per s vertraging', Math.abs(H.remGeschat(-15, 50) - .5) < 1e-9);
waar('geschat: optrekken en stilstand geven 0', H.remGeschat(10, 50) === 0 && H.remGeschat(-20, 1) === 0 && H.remGeschat(-20, null) === 0);
waar('geschat: begrensd op vol', H.remGeschat(-90, 80) === 1);

console.log('\n3. Bogen, temperaturen, waarschuwing');
waar('turbodruk: 180 kPa bij 100 kPa buiten = 0,8 bar', Math.abs(H.boostBar(180, 100) - .8) < 1e-9);
waar('turbodruk zonder luchtdruk: 101,3 kPa', Math.abs(H.boostBar(101.3, null)) < 1e-9 && H.boostBar(null, 100) === null);
const bi = H.binnenbogen({ boost: 181.3, last: 40 }, null);
waar('binnenboog: TURBO met bar, LAST met %', /^TURBO 0,8 bar$/.test(bi.toeren.txt) && bi.snel.txt === 'LAST 40%' && Math.abs(bi.snel.v - .4) < 1e-9, JSON.stringify(bi));
waar('zonder turbo: MAP in kPa en een lege boog', H.binnenbogen({ boost: 40 }, 100).toeren.txt === 'MAP 40 kPa' && H.binnenbogen({ boost: 40 }, 100).toeren.v === 0);
waar('zonder MAP en belasting: geen bogen', H.binnenbogen({}, null).toeren === null && H.binnenbogen({}, null).snel === null);
waar('koelwater: 40 koud, 90 goed, 110 heet', H.tempStand('koel', 40) === 'koud' && H.tempStand('koel', 90) === 'goed' && H.tempStand('koel', 110) === 'heet');
waar('inlaatlucht kent geen koud', H.tempStand('inlaat', -10) === 'goed' && H.tempStand('inlaat', 70) === 'heet');
waar('geen waarde of onbekende rol: geen stand', H.tempStand('koel', null) === '' && H.tempStand('xx', 50) === '');
waar('alarm geeft een rode rand', H.waarschuwing('alarm', {}) === 'rood');
waar('een hete temperatuur geeft een rode rand', H.waarschuwing('rijden', { temps: { olie: 'heet' } }) === 'rood');
waar('koud met flink gas of hoge toeren: oranje', H.waarschuwing('koud', { gas: 70 }) === 'oranje' && H.waarschuwing('koud', { gas: 10, toeren: 4000 }) === 'oranje');
waar('koud en rustig, of warm met vol gas: geen rand', H.waarschuwing('koud', { gas: 20, toeren: 1500 }) === '' && H.waarschuwing('rijden', { gas: 100, toeren: 6000 }) === '');

console.log('\n4. Tik = groot, zuinig, grafiek, G');
waar('groot mag stilstaand en stapvoets, niet rijdend', H.grootMag(0) && H.grootMag(10) && !H.grootMag(30) && H.grootMag(null));
waar('tik opent, tweede tik sluit, rijdend geweigerd', H.grootNa('', 'g', 0) === 'g' && H.grootNa('g', 'g', 50) === '' && H.grootNa('', 'g', 50) === '');
waar('tik op een ander onderdeel wisselt', H.grootNa('g', 'temps', 0) === 'temps');
let z = null; for (let i = 0; i < 600; i++) z = H.zuinig(z, null, 1 / 60);
waar('60 fps: niet zuinig', !z.aan);
for (let i = 0; i < 300; i++) z = H.zuinig(z, null, 1 / 20);
waar('warm (20 fps): zuinig', z.aan);
for (let i = 0; i < 600; i++) z = H.zuinig(z, null, 1 / 60);
waar('weer snel: blijft eerst nog zuinig (geen knipperen)', z.aan);
for (let i = 0; i < 60 * 70; i++) z = H.zuinig(z, null, 1 / 60);
waar('na een minuut snel: niet meer zuinig', !z.aan);
waar('accu bijna leeg en niet aan de lader: zuinig', H.zuinig(null, { niveau: .1, laden: false }, 1 / 60).aan);
waar('accu bijna leeg maar laadt: niet zuinig', !H.zuinig(null, { niveau: .1, laden: true }, 1 / 60).aan);
// Beeldtempo (#691): een rAF-reeks van een scherm naspelen en tellen wat er getekend wordt
const teken = (hz, rust, s = 1) => { let laatst = 0, n = 0; for (let t = 1000 / hz; t <= s * 1000; t += 1000 / hz) { if (!H.beeldOverslaan(t - laatst, rust)) { n++; laatst = t; } } return n; };
waar('60 Hz: elk beeld getekend (geen beeld weg door een vroege rAF)', teken(60, false) >= 59, teken(60, false));
waar('120 Hz: hoogstens 60 per seconde', teken(120, false) <= 61 && teken(120, false) >= 59, teken(120, false));
waar('90 Hz: niet boven 60', teken(90, false) <= 60, teken(90, false));
waar('in rust op 120 Hz: hoogstens 30', teken(120, true) <= 31 && teken(120, true) >= 29, teken(120, true));
waar('in rust op 60 Hz: 30', teken(60, true) >= 29 && teken(60, true) <= 31, teken(60, true));
waar('een vreemde tijd (NaN, negatief) tekent gewoon', !H.beeldOverslaan(NaN, true) && !H.beeldOverslaan(-5, false));
waar('rust: alleen in de stille scène en pas na RUST_S', H.rustBeeld('stil', H.RUST_S) && !H.rustBeeld('stil', H.RUST_S - .1) && !H.rustBeeld('rijden', 99));
// Tegenproef: zonder rust tekent 120 Hz er twee keer zoveel als in rust
waar('tegenproef: rust scheelt de helft', teken(120, false) >= 2 * teken(120, true) - 2, teken(120, false) + ' / ' + teken(120, true));
let g = []; for (let i = 0; i < H.GRAF_N + 50; i++) g = H.grafBij(g, { t: i });
waar('de grafiek houdt de laatste minuut', g.length === H.GRAF_N && g[g.length - 1].t === H.GRAF_N + 49);
const gp = H.gCirkelPunt(3, 0), g0 = H.gCirkelPunt(0, .6);
waar('G buiten de cirkel blijft op de rand', Math.abs(Math.hypot(gp.x, gp.y) - 1) < 1e-9);
waar('optrekken gaat omhoog, zoals het G-vizier', g0.y < 0 && g0.x === 0);
waar('helling en kanteling begrensd op 30°', H.autoHoek(80) === 30 && H.autoHoek(-80) === -30 && H.autoHoek(null) === 0);

console.log('\n5. Het korte label');
const kv = P.kortVan;
waar('"Engine Oil Temperature" → Olie (was ENGINE OI…)', kv('Engine Oil Temperature') === 'Olie', kv('Engine Oil Temperature'));
waar('"Motorolietemperatuur" → Olie', kv('Motorolietemperatuur') === 'Olie', kv('Motorolietemperatuur'));
waar('"Coolant Temp" → Koelw', kv('Coolant Temp') === 'Koelw', kv('Coolant Temp'));
waar('te lang na vertalen: het eerste woord', kv('Brake Pedal Position') === 'Rem', kv('Brake Pedal Position'));
waar('kort blijft kort', kv('Accu') === 'Accu' && kv('Gas') === 'Gas');
waar('één lang woord: afgekapt met …', kv('Turbolaaddrukregeling') === 'Turbolaad…', kv('Turbolaaddrukregeling'));
waar('alleen "Temperature" valt niet leeg', kv('Temperature') === 'Temperatu…', kv('Temperature'));

console.log('\n6. Het vak en de CSS');
const indT = P.indeling('hyperlane', alles, null, { defs: [] });
const html = P.cockpitHtml(P.voorInd('hyperlane', indT), indT);
waar('de rembalk draagt vpf-p-rem (tikken kiest de sensor)', /id="vpf-p-rem"/.test(html));
waar('zonder rempedaal: geschat en REM ~', /vhl-pd rem geschat/.test(html) && /REM ~/.test(html));
waar('geen vpf-w-id in de cockpit (koelwater staat ook in de strook)', !/vpf-w-/.test(html));
waar('elke temperatuur een balk, een lege als leeg', /data-rol="koel"/.test(html) && /vhl-tb leeg" data-rol="atf"/.test(html));
waar('op een telefoon geen cockpit in het vak', F.PLVisProfiel.cockpitHtml(F.PLVisProfiel.voor('hyperlane', null), { plekken: {} }) === '');
const vak = P.html('hyperlane', indT);
waar('het vak krijgt vhl-tablet en de cockpit', /vpf-hyper vhl-tablet/.test(vak) && /class="vhl-ck"/.test(vak));
['vhl-ck', 'vhl-ck-mod', 'vhl-ck-g', 'vhl-ck-gw', 'vhl-ped', 'vhl-pd', 'vhl-ck-temps', 'vhl-tb', 'vhl-ck-3d', 'vhl-3d-sc', 'vhl-3d-auto', 'vhl-3d-doos', 'vhl-3d-vloer', 'vhl-3d-w', 'vhl-ck-graf', 'vhl-ck-leg', 'vhl-ck-rand', 'vhl-ck-links', 'vhl-ck-groot', 'vhl-zuinig']
  .forEach(k => waar('pidlane.css heeft regels voor .' + k, new RegExp('\\.' + k + '[\\s.,:{\\[)]').test(CSS)));
const mq = CSS.match(/@media \(orientation:landscape\) and \(min-width:(\d+)px\) and \(min-height:(\d+)px\) \{\n  body\.pl-vis-vol \.vpf-hyper\.vhl-tablet \.vhl-ck/);
waar('de @media van de cockpit heeft dezelfde maten als cockpitMaat', !!mq && Number(mq[1]) === H.COCKPIT_B && Number(mq[2]) === H.COCKPIT_H, mq ? mq.slice(1).join('×') : 'niet gevonden');
waar('de cockpit is standaard weg', /\.vhl-ck \{ display:none; \}/.test(CSS));

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + (ok + fout) : 'ok: ' + ok + ' van ' + ok));
process.exit(fout ? 1 : 0);
