// ══════════════════════════════════════════════════════════════════
// test-ritring.js — de ring van de Rit-analyse (19-11-2026)
// ──────────────────────────────────────────────────────────────────
// Knipt ritRingModel() en ritRingHtml() uit pidlane-rit.js. Wat hier rood
// hoort te worden: segmenten die niet in verhouding tot hun duur staan,
// een fase die als "in orde" telt voordat ze geanalyseerd is, een tijd die
// voorbij het totaal doorloopt, en namen die niet ontsnapt worden.
// Draaien vanuit public/:  node test-ritring.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }
const src = fs.readFileSync(path.join(__dirname, 'pidlane-rit.js'), 'utf8');
function knip(kop){ const a = src.indexOf(kop); if (a < 0) { console.log('  FOUT  "' + kop + '" niet gevonden — deze test toetst niets meer'); process.exit(1); } return src.slice(a, src.indexOf('\n}\n', a) + 3); }
const c = { Math, String, Object, Array };
vm.createContext(c);
vm.runInContext(knip('function ritRingModel(') + knip('function ritRingHtml('), c);
const F = [{ naam: 'Motor', icon: '⚡', duur: 120 }, { naam: 'Brandstof', icon: '⛽', duur: 120 }, { naam: 'Temp', icon: '🌡️', duur: 60 }];

let m = c.ritRingModel(F, 0, 0, {}, false);
ok(m.seg[0].van === 0 && m.seg[0].tot === 0.4 && m.seg[2].van === 0.8 && m.seg[2].tot === 1, 'segmenten in verhouding tot hun duur', m.seg);
ok(m.seg.every(s => s.staat === 'wacht') && m.tijd === '0:00' && m.totaal === '5:00', 'voor de start: alles wacht, 0:00 van 5:00', m);
m = c.ritRingModel(F, 150, 1, { 0: 'ok' }, true);
ok(m.seg[0].staat === 'ok' && m.seg[1].staat === 'bezig' && m.seg[2].staat === 'wacht' && m.tijd === '2:30', 'fase 1 klaar, fase 2 bezig, 2:30', m);
ok(c.ritRingModel(F, 150, 1, {}, true).seg[0].staat === 'wacht', 'een fase die nog niet geanalyseerd is telt niet als in orde');
m = c.ritRingModel(F, 999, 2, { 0: 'ok', 1: 'let', 2: 'ok' }, false);
ok(m.frac === 1 && m.tijd === '5:00' && m.klaar === 3 && m.seg[1].staat === 'let', 'na afloop: begrensd op het totaal, afwijking blijft zichtbaar', m);
const h = c.ritRingHtml(c.ritRingModel(F.concat([{ naam: '<img onerror=x>', icon: '!', duur: 10 }]), 60, 0, {}, true));
ok((h.match(/class="rit-seg /g) || []).length === 4 && /rit-voortgang/.test(h) && />1:00</.test(h), 'één segment per fase, de voortgang erover, de tijd in het midden');
ok(!/<img/.test(h), 'namen worden ontsnapt');
console.log('\n' + (fouten ? fouten + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fouten ? 1 : 0);
