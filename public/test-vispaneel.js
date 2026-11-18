// ══════════════════════════════════════════════════════════════════
// test-vispaneel.js — trek- en rit-monitorpaneel onder Slim visueel (19-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-vispaneel.js. Wat hier rood hoort te worden:
// een helling met het verkeerde teken (klim tekent als afdaling), de
// duurbelasting die het venster negeert, een coachtip die blijft hangen,
// een rit-monitor die "kijkt mee" zegt terwijl het motorlampje aan is, en
// een controle die nooit draaide en toch als getoetst telt.
//
// Draaien vanuit public/:  node test-vispaneel.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }

const ctx = { window: {}, console, Math, Number, String, Array, Date, isFinite, JSON };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-vispaneel.js'), 'utf8'), ctx, { filename: 'pidlane-vispaneel.js' });
const P = ctx.window.PLVisPaneel;
if (!P) { console.log('  FOUT  PLVisPaneel niet gezet — deze test toetst niets meer'); process.exit(1); }

console.log('\n— helling —');
ok(P.procent(5.71) === 10, '5,71° is 10 % (zoals op het bord)');
ok(P.hellingTekst(4) === '+7 %' && P.hellingTekst(-4) === '−7 %' && P.hellingTekst(0) === '0 %', 'teken: klim +, afdaling −', [P.hellingTekst(4), P.hellingTekst(-4)]);
ok(P.hellingBeeld(5) === 10 && P.hellingBeeld(30) === 24 && P.hellingBeeld(-30) === -24, 'in beeld twee keer zo steil, begrensd op 24°');
let m = P.trekModel({ terrein: { climb: 'klim', bron: 'helling' }, helling: 5 });
ok(/rotate\(-10deg\)/.test(P.trekHtml(m)), 'klim: de weg loopt naar rechts omhoog (SVG: negatieve hoek)');
ok(m.terrein.label === 'klim · gemeten', 'gemeten helling heet gemeten', m.terrein.label);
m = P.trekModel({ terrein: { climb: 'klim', bron: 'obd' }, helling: null });
ok(m.terrein.label === 'klim · geschat' && m.terrein.hoek === 0, 'zonder telefoon: geschat, en de weg blijft vlak (geen verzonnen hoek)', m.terrein);
ok(P.trekModel({}).terrein.label === 'terrein onbekend', 'zonder snelheid: onbekend');

console.log('\n— schakelen —');
m = P.trekModel({ schakel: { advies: 'terug', doel: 4 }, gear: 5 });
ok(m.schakel.groot === '4' && m.schakel.tekst === 'terug naar 4', 'terug: de doelversnelling groot', m.schakel);
ok(/data-advies="terug"/.test(P.trekHtml(m)) && /▼/.test(P.trekHtml(m)), 'terug: pijl omlaag');
m = P.trekModel({ schakel: { advies: 'ok', doel: 5 }, gear: 5 });
ok(m.schakel.groot === '5' && /✓/.test(P.trekHtml(m)), 'goed: de huidige versnelling met een vinkje');
m = P.trekModel({ schakel: { advies: 'terug', doel: null } });
ok(m.schakel.tekst === 'schakel terug' && m.schakel.groot === '', 'zonder versnelling: geen verzonnen getal');

console.log('\n— belasting —');
const T = 1e9, hist = (frac, dt) => Array.from({ length: 40 }, (_, i) => ({ t: T - (dt || 0) - i * 5000, v: i < 40 * frac ? 92 : 50 }));
ok(P.zwaarAandeel(hist(0.75), T) === 0.75, '30 van 40 metingen ≥ 85 % is 0,75');
ok(P.zwaarAandeel(hist(0.75, 400000), T) === null, 'buiten de vijf minuten telt niet (en dan te weinig)');
ok(P.zwaarAandeel(hist(1).slice(0, 10), T) === null, 'minder dan 20 metingen: geen oordeel');
m = P.trekModel({ last: { v: 70, st: 'ok' }, lastHist: hist(0.75), nu: T });
ok(m.last.lang && m.last.st === 'warn', 'lang zwaar belast kleurt de boog oranje, ook als het nu meevalt', m.last);
ok(!P.trekModel({ last: { v: 70, st: 'ok' }, lastHist: hist(0.5), nu: T }).last.lang, 'de helft zwaar is nog geen duurbelasting');

console.log('\n— temperaturen —');
ok(P.tempFrac('koel', 80) === 0.5 && P.tempFrac('koel', 200) === 1 && P.tempFrac('koel', null) === null, 'koelwater 80 ° is halverwege; begrensd; zonder waarde null');
m = P.trekModel({ temps: [{ rol: 'koel', naam: 'Koelwater', v: 104, st: 'warn', trend: 1.8 }, { rol: 'olie', naam: 'Motorolie', v: null }] });
ok(m.temps[0].stijgt && m.temps[0].trend === '↑ 1,8/min' && m.temps[0].st === 'warn', 'stijgend koelwater met trend en kleur', m.temps[0]);
ok(m.temps[1].st === 'geen' && /data-rol="olie" data-st="geen"/.test(P.trekHtml(m)), 'niet gemeten is grijs, geen 0 °');

console.log('\n— coachtip —');
ok(P.tipKort('🎯 Zet cruise op ~95 — met caravan kost 100→95 al merkbaar minder.') === '🎯 Zet cruise op ~95', 'tot de gedachtestreep');
ok(P.tipKort('🌡️ Koelwater loopt op (104°C). Op een lange klim: toerental hoger.') === '🌡️ Koelwater loopt op (104°C)', 'tot de eerste punt');
ok(P.tipKort('woord '.repeat(20)).length <= 48 && /…$/.test(P.tipKort('woord '.repeat(20))), 'hooguit 48 tekens, afgebroken op een woord');
ok(P.tipVan([{ t: T - 1000, msg: 'a — b', level: 'warn' }], T).level === 'warn', 'een verse waarschuwing staat er');
ok(P.tipVan([{ t: T - P.TIP_MS - 1, msg: 'a' }], T) === null, 'een oude tip verdwijnt');
ok(P.tipVan([{ t: T - 5000, msg: 'Zet cruise', key: 'cruise' }, { t: T - 1000, msg: 'Terug naar 4', key: 'terug' }], T).tekst === 'Zet cruise', 'een schakeltip staat al in het rad: de tip ervoor blijft staan');

console.log('\n— rit-monitor —');
const tests = [{ id: 'A', naam: 'toerental' }, { id: 'B', naam: 'laadspanning' }, { id: 'C', naam: 'koelwater' }];
let r = P.ritModel({ tests, dekking: { A: { runs: 3, hits: 0 }, B: { runs: 2, hits: 1 }, C: { runs: 0, hits: 0 } }, meldingen: 0, draait: true, mil: false, teller: 0 });
ok(r.getoetst === 2 && r.totaal === 3, 'een controle die nooit draaide telt niet als getoetst', r);
ok(r.st === 'let' && r.gezien.join() === 'laadspanning' && r.kop === 'let op' && />!</.test(P.ritHtml(r)), 'een controle die iets zag: oranje, een uitroepteken, met de naam', r);
ok((P.ritHtml(r).match(/class="vrm-seg"/g) || []).length === 3 && /data-s="hit"/.test(P.ritHtml(r)) && /data-s="wacht"/.test(P.ritHtml(r)), 'één segment per controle, met zijn staat');
r = P.ritModel({ tests, dekking: {}, meldingen: 0, draait: true, mil: true });
ok(r.st === 'ernstig' && r.ecu === 'motorlampje AAN', 'motorlampje aan is nooit "kijkt mee"', r);
r = P.ritModel({ tests, dekking: { A: { runs: 1, hits: 0 } }, meldingen: 0, draait: true, mil: false, teller: 0 });
ok(r.st === 'ok' && r.kop === 'kijkt mee' && r.ecu === 'ECU: geen foutcodes', 'rustig: groen', r);
r = P.ritModel({ tests, meldingen: 2, draait: true, mil: false, teller: 2 });
ok(r.kop === '2 meldingen' && r.ecu === '2 foutcodes in de ECU' && /<text[^>]*>2</.test(P.ritHtml(r)), 'meldingen in het midden van de ring', r);
r = P.ritModel({ tests, draait: false });
ok(r.st === 'wacht' && r.ecu === 'ECU nog niet gelezen', 'zonder verbinding: wacht, en nog niet gelezen is geen "geen foutcodes"', r);
ok(!/<img/i.test(P.ritHtml(P.ritModel({ tests: [{ id: 'x', naam: '<img onerror=1>' }], dekking: { x: { runs: 1, hits: 1 } }, draait: true }))), 'namen worden ontsnapt');

console.log('\n' + (fouten ? fouten + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fouten ? 1 : 0);
