// test-rust.js — PLRust: schermtimers slapen als de app uit beeld is (#691)
//
// Laadt pidlane-rust.js zelf (vm) en voert de kern met een nep-omgeving:
// een klok die setInterval/clearInterval bijhoudt en een schakelaar voor
// "verborgen". De vraag is niet of een tik wordt overgeslagen, maar of de
// timer echt weg is: een overgeslagen tik maakt de processor nog wakker.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0;
function toets(naam, ok, waarom) {
  console.log((ok ? '  ok  ' : '  FOUT ') + naam + (ok || !waarom ? '' : ' — ' + waarom));
  if (!ok) fout++;
}

const bron = fs.readFileSync(path.join(__dirname, 'pidlane-rust.js'), 'utf8');
const ctx = { console, setInterval: () => 1, clearInterval() {}, document: { visibilityState: 'visible', addEventListener() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(bron, ctx);
toets('pidlane-rust.js laadt en zet PLRust', !!(ctx.PLRust && ctx.PLRust._kern && ctx.PLRust._kern.maak));
const maak = ctx.PLRust._kern.maak;

function omgeving() {
  const o = { weg: false, lopend: new Map(), volgende: 1, gezet: 0, gewist: 0 };
  o.zet = (fn, ms) => { const id = o.volgende++; o.lopend.set(id, { fn, ms }); o.gezet++; return id; };
  o.wis = (id) => { o.lopend.delete(id); o.gewist++; };
  o.verborgen = () => o.weg;
  o.tik = () => [...o.lopend.values()].forEach(t => t.fn());   // wat nú loopt, niet wat een tik erbij zet
  return o;
}

console.log('1. In beeld: gewoon een interval');
let o = omgeving(), R = maak(o), n = 0;
R.elke(1000, () => n++, 'chip');
toets('de timer loopt meteen', o.lopend.size === 1 && R.actief() === 1);
o.tik(); o.tik();
toets('elke tik roept de taak aan', n === 2, 'n=' + n);

console.log('\n2. Uit beeld: de timer is weg, niet alleen stil');
o.weg = true; R.zicht();
toets('geen lopende interval meer', o.lopend.size === 0 && R.actief() === 0, 'lopend=' + o.lopend.size);
o.tik();
toets('en de taak draait niet', n === 2, 'n=' + n);

console.log('\n3. Terug in beeld: meteen één keer, daarna weer de timer');
o.weg = false; R.zicht();
toets('de taak draait direct (het scherm klopt meteen)', n === 3, 'n=' + n);
toets('de timer loopt weer, één keer', o.lopend.size === 1, 'lopend=' + o.lopend.size);
R.zicht();
toets('nog een zicht() in beeld start geen tweede timer', o.lopend.size === 1 && n === 3, 'lopend=' + o.lopend.size + ' n=' + n);

console.log('\n4. Aangemeld terwijl de app al uit beeld is');
o = omgeving(); o.weg = true; R = maak(o); n = 0;
R.elke(3000, () => n++, 'knop');
toets('dan start er niets', o.gezet === 0 && R.actief() === 0);
o.weg = false; R.zicht();
toets('tot hij in beeld komt', o.lopend.size === 1 && n === 1, 'lopend=' + o.lopend.size + ' n=' + n);

console.log('\n5. Een taak die faalt neemt de rest niet mee');
o = omgeving(); R = maak(o); n = 0;
const warn = console.warn; let gemeld = 0; console.warn = () => { gemeld++; };
R.elke(1000, () => { throw new Error('kapot'); }, 'stuk');
R.elke(1000, () => n++, 'heel');
try { o.tik(); } catch (e) { toets('geen fout naar boven', false, e.message); }
console.warn = warn;
toets('de tweede taak draait, de fout is gemeld (geen stille catch)', n === 1 && gemeld === 1, 'n=' + n + ' gemeld=' + gemeld);
toets('taken() noemt ze bij naam', JSON.stringify(R.taken().map(t => t.naam)) === '["stuk","heel"]');

console.log('\n6. Tegenproef');
o = omgeving(); R = maak(o);
R.elke(1000, () => {}, 'x');
o.weg = true;
toets('zonder zicht() blijft hij lopen — de wissel moet dus echt gemeld worden', o.lopend.size === 1);

console.log('\n7. Meettimers: in beeld, of uit beeld met een verbinding');
function omg2() { const x = omgeving(); x.verb = false; x.verbonden = () => x.verb; return x; }
o = omg2(); R = maak(o); n = 0;
R.meet(200, () => n++, 'gear');
toets('in beeld loopt hij', R.actief() === 1);
o.weg = true; R.zicht();
toets('uit beeld zonder verbinding: weg', R.actief() === 0);
toets('en één wekker kijkt of er verbonden wordt', R.wekker() && o.lopend.size === 1, 'lopend=' + o.lopend.size);
o.verb = true; o.tik();   // de wekker tikt
toets('uit beeld verbonden: de meettimer loopt weer, meteen één keer', R.actief() === 1 && n === 1, 'n=' + n);
toets('en de wekker is weg', !R.wekker());
const sch = R.elke(1000, () => {}, 'chip');
toets('een schermtimer blijft uit beeld ook mét verbinding uit', sch.id === null);
o.verb = false; R.zicht();
toets('verbinding weg uit beeld: meettimer weg, wekker terug', R.actief() === 0 && R.wekker());
o.weg = false; R.zicht();
toets('terug in beeld: alles loopt, geen wekker', R.actief() === 2 && !R.wekker());

console.log('\n8. weg(): een module die zelf stopt');
o = omg2(); R = maak(o);
const t = R.meet(1000, () => {}, 'toeschouwer');
toets('weg() stopt en vergeet hem', R.weg(t) && R.actief() === 0 && R.taken().length === 0 && o.lopend.size === 0);
o.weg = true; R.zicht(); o.weg = false; R.zicht();
toets('en een wissel zet hem niet terug', R.actief() === 0);

console.log('\n9. Tegenproef: een meettimer als schermtimer');
o = omg2(); R = maak(o); o.verb = true;
R.elke(200, () => {}, 'gear');
o.weg = true; R.zicht();
toets('met elke() stopt hij uit beeld ook tijdens een rit — daarom bestaat meet()', R.actief() === 0);

console.log(fout ? '\ntest-rust: ' + fout + ' fout' : '\ntest-rust: alles goed');
process.exit(fout ? 1 : 0);
