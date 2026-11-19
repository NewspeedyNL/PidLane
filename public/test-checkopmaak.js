// ══════════════════════════════════════════════════════════════════
// test-checkopmaak.js — één opmaak voor de checkpagina's (PLCheck, 19-11-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-checkopmaak.js en de vier openers uit
// pidlane-koopcheck.js (als tekst). Wat hier rood hoort te worden: een
// checkpagina die weer een eigen accentkleur of verloop krijgt, een kop
// zonder sluitknop met aria-label, invoer die niet ontsnapt wordt, en een
// keuzeknop die na een tik niet als gekozen staat.
// Draaien vanuit public/:  node test-checkopmaak.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let fouten = 0, n = 0;
function ok(v, wat, extra){ n++; if (v) console.log('  ok  ' + wat); else { fouten++; console.log('  FOUT  ' + wat + (extra !== undefined ? ' — ' + JSON.stringify(extra) : '')); } }
const ctx = { window: {}, String };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-checkopmaak.js'), 'utf8'), ctx);
const C = ctx.window.PLCheck;
if (!C) { console.log('  FOUT  PLCheck niet gezet'); process.exit(1); }

console.log('\n— de bouwstenen —');
const k = C.kop({ icoon: '🛠️', titel: 'Onderhoud', tekst: 'uitleg', sluit: "closeExtraDash('x')" });
ok(/class="plc-x"[^>]*aria-label="Sluiten"/.test(k) && /plc-ring/.test(k) && /<h2>Onderhoud<\/h2>/.test(k), 'de kop: ✕ met aria-label (de terugknop vindt hem), icoon in een ring, titel');
ok(!/<script|<img/.test(C.kop({ icoon: '<img>', titel: '<script>', sluit: 'x' })), 'titel en icoon worden ontsnapt');
ok(/class="plc-knop pri"/.test(C.knop('Start', 'go()')) && /class="plc-knop sec"/.test(C.knop('Lijst', 'l()', 'sec')), 'één primaire en één secundaire knopstijl');
ok(/data-soort="let"/.test(C.tip('x', 'let')) && /data-soort="info"/.test(C.tip('x')), 'tip: info of let op');
const kz = C.keus('r', [['a', 'A'], ['b', 'B']], 'b', "kies('$')");
ok(/data-r="b" role="radio" aria-checked="true"/.test(kz) && /onclick="kies\(&#39;a&#39;\)"|onclick="kies\('a'\)"/.test(kz), 'keuze: de gekozen staat aan, elke knop roept zijn eigen waarde aan', kz);
ok((C.stappen([['Een', 'x'], ['Twee', 'y']]).match(/class="plc-nr">\d</g) || []).length === 2, 'stappen genummerd');

const el = { className: 'x', style: { cssText: 'background:red' } };
C.ov(el);
ok(el.className === 'plc-ov' && el.style.cssText === '', "ov(): de gedeelde klasse, de oude inline stijl weg — en niet .pl-check (dat is de knop 'Check mijn auto')");
console.log('\n— de vier pagina\'s gebruiken het —');
const kc = fs.readFileSync(path.join(__dirname, 'pidlane-koopcheck.js'), 'utf8');
function blok(kop){ const a = kc.indexOf(kop); if (a < 0) { console.log('  FOUT  ' + kop + ' niet gevonden'); process.exit(1); } return kc.slice(a, kc.indexOf('\n}\n', a)); }
const pag = { Onderhoud: blok('function openOnderhoud('), 'Accu & elektrisch': blok('function openEVCheck('), 'Klaar voor vertrek': blok('function openLangeRit('),
              'Airco/Winter': blok('function openClimateCheck(') + blok('function climateIntroHTML(') };
Object.keys(pag).forEach(function (naam) {
  const b = pag[naam];
  ok(/PLCheck\.ov\(ov\)/.test(b), naam + ': het venster krijgt de gedeelde klasse');
  ok(!/linear-gradient\(160deg|background:#(22d3ee|34d399|38bdf8|a78bfa|60a5fa)/.test(b), naam + ': geen eigen accentkleur of verloop meer');
});

console.log('\n' + (fouten ? fouten + ' van ' + n + ' FOUT' : 'Alle ' + n + ' goed'));
process.exit(fouten ? 1 : 0);
