// ══════════════════════════════════════════════════════════════════
// test-softwareoorzaak.js — softwareOorzaken() in pidlane-data.js (#426)
// ──────────────────────────────────────────────────────────────────
// De vraag: wijst wat de auto meldt op een inleer- of coderingsprobleem in
// plaats van op een kapotte sensor? Aanleiding: een BMW-diesel zonder
// roetfilter die de ECU nooit verteld is — de DPF-monitor wordt nooit klaar.
//
// De readiness komt hier uit de ECHTE parseReadiness() van
// pidlane-foutcodes.js, dus een hernoemde monitor daar maakt deze test rood
// in plaats van de koppeling stil te breken.
//
// Draaien vanuit public/:  node test-softwareoorzaak.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

const s = {};
s.window = s; s.globalThis = s;
s.console = { log() { }, warn() { }, error() { } };
s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {} }), addEventListener() { }, head: { appendChild() { } }, body: { appendChild() { } } };
s.addEventListener = () => { };
s.navigator = {};
s.setTimeout = () => 0; s.setInterval = () => 0; s.clearTimeout = () => { }; s.clearInterval = () => { };
vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-foutcodes.js', 'utf8'), s, { filename: 'pidlane-foutcodes.js' });
if (typeof s.softwareOorzaken !== 'function') throw new Error('softwareOorzaken() niet gevonden in pidlane-data.js');
if (!s.PLFoutcodes || typeof s.PLFoutcodes.parseReadiness !== 'function') throw new Error('PLFoutcodes.parseReadiness niet gevonden');
const SO = s.softwareOorzaken, rd = s.PLFoutcodes.parseReadiness;
const ids = (r) => r.map((x) => x.id);

console.log('\n── de BMW zonder roetfilter ──');
// B: 0x0F = drie continue monitors ondersteund + diesel; C/D bit 6 = DPF ondersteund, niet klaar
const bmw = rd([[0x00, 0x0F, 0x40, 0x40]]);
eis(bmw && bmw.nietKlaar.indexOf('Roetfilter (DPF)') >= 0, 'parseReadiness noemt de DPF-monitor zoals de tabel hem kent', JSON.stringify(bmw && bmw.nietKlaar));
let r = SO({ merk: 'BMW 320D', brandstof: bmw.brandstof, nietKlaar: bmw.nietKlaar, sinds: { km: 2400, warm: 60 } });
eis(ids(r).indexOf('dpf') >= 0, 'een DPF-monitor die na 2400 km nog hangt wijst op het roetfilter-inleren', JSON.stringify(ids(r)));
const dpf = r.find((x) => x.id === 'dpf') || {};
eis((dpf.bewijs || []).some((b) => /Roetfilter \(DPF\)/.test(b) && /2400 km/.test(b)), 'het bewijs noemt de monitor en de afstand', JSON.stringify(dpf.bewijs));
eis((dpf.tools || []).some((t) => /ISTA/.test(t)), '"BMW 320D" krijgt de BMW-tools (via merkGroep)', JSON.stringify(dpf.tools));
eis(/niet toegestaan/.test(dpf.waarschuwing || '') && /APK/.test(dpf.waarschuwing || ''), 'de waarschuwing zegt dat een verwijderd roetfilter niet mag');

console.log('\n── vers gewist is geen software ──');
r = SO({ merk: 'BMW', brandstof: 'diesel', nietKlaar: bmw.nietKlaar, sinds: { km: 40, warm: 3 } });
eis(ids(r).indexOf('dpf') < 0, '40 km na wissen is een gewone rijcyclus, geen inleerprobleem', JSON.stringify(ids(r)));
r = SO({ merk: 'BMW', brandstof: 'diesel', nietKlaar: bmw.nietKlaar, sinds: {} });
eis(!r.length, 'onbekend hoe lang geleden gewist: de monitor alleen is geen bewijs', JSON.stringify(ids(r)));
r = SO({ merk: 'BMW', brandstof: 'diesel', nietKlaar: bmw.nietKlaar, sinds: { warm: 20 } });
eis(ids(r).indexOf('dpf') >= 0, '20× warmgedraaid zonder km telt ook als hangen', JSON.stringify(ids(r)));

console.log('\n── foutcodes en andere aanwijzingen ──');
r = SO({ merk: 'Ford', dtc: [' p2463 '] });
eis(ids(r).indexOf('dpf') >= 0, 'P2463 (roetophoping) wijst ook zonder readiness naar het roetfilter');
eis(((r.find((x) => x.id === 'dpf') || {}).tools || []).indexOf('FORScan') >= 0, 'Ford krijgt FORScan');
r = SO({ merk: 'Peugeot', dtc: ['P0630'] });
eis(ids(r).indexOf('ecu') >= 0, 'P0630 (VIN niet geprogrammeerd) wijst naar de ECU-codering');
eis(Array.isArray(r[0].tools) && r[0].tools.length === 0, 'een merk zonder groep geeft een lege toollijst, geen fout');
r = SO({ merk: 'Opel', vinAfwijkend: true });
eis(ids(r).join() === 'ecu', 'een afwijkend chassisnummer in de ECU wijst alleen naar de ECU', JSON.stringify(ids(r)));
r = SO({ merk: 'Volkswagen', vervangen: ['Accu 70Ah'] });
eis(ids(r).indexOf('accu') >= 0, 'een vervangen accu brengt accuregistratie op', JSON.stringify(ids(r)));
r = SO({ merk: 'Volkswagen', dtc: ['P0101'] });
eis(!r.length, 'een gewone sensorcode (P0101) levert geen softwareoorzaak op', JSON.stringify(ids(r)));

console.log('\n── brandstof sluit uit ──');
r = SO({ merk: 'BMW', brandstof: 'benzine', dtc: ['P2463', 'P0507'] });
eis(ids(r).indexOf('dpf') < 0 && ids(r).indexOf('gasklep') >= 0, 'een benzineauto krijgt geen roetfilter, wel de gasklep', JSON.stringify(ids(r)));
r = SO({ merk: 'Toyota', brandstof: 'Hybride', dtc: ['P0507'] });
eis(ids(r).indexOf('gasklep') >= 0, 'een hybride of onbekende brandstof sluit niets uit', JSON.stringify(ids(r)));

console.log('\n── de tabel zelf ──');
// Alle monitornamen die parseReadiness() kan geven, benzine en diesel.
const alle = [].concat(rd([[0, 0x07, 0xFF, 0]]).monitors, rd([[0, 0x0F, 0xFF, 0]]).monitors).map((m) => m.naam);
s.SOFTWARE_OORZAKEN.forEach((f) => {
  const mist = ['id', 'naam', 'sterkte', 'inleren'].filter((k) => !f[k]);
  eis(!mist.length, f.id + ': heeft id, naam, sterkte en inleren', mist.join());
  eis(f.sterkte === 'sterk' || f.sterkte === 'zwak', f.id + ': sterkte is sterk of zwak');
  f.monitors.forEach((m) => eis(alle.indexOf(m) >= 0, f.id + ': monitor "' + m + '" bestaat in parseReadiness()'));
  eis(f.monitors.length || f.dtc || f.vin || f.vervangen.length, f.id + ': heeft minstens één manier om bewijs te vinden');
});
// Een sleutel die merkGroep() nooit teruggeeft, wordt nooit gevonden.
const voorbeeld = { BMW: 'BMW', VAG: 'Volkswagen', FORD: 'Ford', OPEL: 'Opel', TOYOTA: 'Toyota', MAZDA: 'Mazda' };
Object.keys(s.SOFTWARE_TOOLS).forEach((g) => {
  eis(voorbeeld[g] && s.merkGroep(voorbeeld[g]) === g, 'toolgroep ' + g + ' is een echte merkGroep()-uitkomst');
});

console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
process.exit(fouten ? 1 : 0);
