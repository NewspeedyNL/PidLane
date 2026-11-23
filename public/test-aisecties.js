// ══════════════════════════════════════════════════════════════════
// test-aisecties.js — het AI-rapport op het scherm knipt geen zinnen (23-11-2026)
// ──────────────────────────────────────────────────────────────────
// Op 23-11 stond in het AI-venster "technische meting toont gezonde motor,
// geen" onder Advies en "en geen recall." onder een kop Foutcodes: het woord
// "foutcodes" midden in een zin werd als sectiekop gelezen. Daarbij viel alles
// vóór de eerste kop weg, en een losse </rapport> stond in bijlage B.
// Laadt de échte _aiSecties/_aiReportHtml uit pidlane-fuel.js en de échte
// pidlane-rapport.js. Draaien vanuit public/:  node test-aisecties.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const dir = __dirname;
let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
function knip(bron, van, tot) {
  const a = bron.indexOf(van);
  if (a < 0) { console.log('  FOUT  anker niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a + van.length);
  if (b < 0) { console.log('  FOUT  eindanker niet gevonden: ' + tot); process.exit(1); }
  return bron.slice(a, b);
}

const s = { console: { log() {}, warn() {}, error() {} }, PidLaneEvalLog: { log() {} } };
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(dir + '/pidlane-rapport.js', 'utf8'), s);
const fuel = fs.readFileSync(dir + '/pidlane-fuel.js', 'utf8');
vm.runInContext(knip(fuel, 'function aiVerdict(text){', '\n// Inline tonen we alleen'), s);
const R = s.PLRapport;

const SECS = [{ k: 'FOUTCODES', c: 'orange' }, { k: 'ADVIES', c: 'green' }, { k: 'ONDERHOUDSADVIES', c: 'green' }, { k: 'SAMENVATTING', c: 'blue' }];
const zichtbaar = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log('\n1. Een kopwoord midden in een zin is geen kop');
const tekst = 'PidLane AI-Monteur\nHerziene check\n\nADVIES\nMarktplaats is beste optie — technische meting toont gezonde motor, geen\nfoutcodes en geen recall. Met APK kunt u het maximale bedrag halen.\n\nSAMENVATTING: alles in orde.';
const d = s._aiSecties(tekst, SECS);
toets('geen sectie Foutcodes uit "geen foutcodes en geen recall"', !d.some(x => x.s && x.s.k === 'FOUTCODES'), JSON.stringify(d.map(x => x.s && x.s.k)));
toets('de zin blijft heel onder Advies', d.some(x => x.s && x.s.k === 'ADVIES' && /geen\nfoutcodes en geen recall/.test(x.body)));
toets('"SAMENVATTING: …" op één regel is een kop met de tekst erachter', d.some(x => x.s && x.s.k === 'SAMENVATTING' && x.body === 'alles in orde.'));
toets('de tekst vóór de eerste kop valt niet weg', d[0] && d[0].s === null && /AI-Monteur/.test(d[0].body));

console.log('\n2. Wat wél een kop is');
const k = s._aiSecties('## **FOUTCODES**\nP0420\n\n2. Onderhoudsadvies:\nolie\n— ADVIES —\nverkopen\nAdvies: vraag het boekje op', SECS);
const namen = k.filter(x => x.s).map(x => x.s.k);
toets('markdown, nummer en streepjes rond de kop', JSON.stringify(namen) === '["FOUTCODES","ONDERHOUDSADVIES","ADVIES"]', JSON.stringify(namen));
toets('"Advies: vraag …" in gewone letters is tekst, geen kop', k[k.length - 1].body.indexOf('Advies: vraag het boekje op') >= 0);
toets('een langere kop wordt niet als de kortere gelezen', !k.some(x => x.s && x.s.k === 'ADVIES' && /olie/.test(x.body)));

console.log('\n3. Het hele scherm: niets van de tekst gaat verloren');
const html = s._aiReportHtml(tekst + '\n<rapport>{"conclusie":"x"}</rapport>');
const zien = zichtbaar(html);
['AI-Monteur', 'gezonde motor, geen foutcodes en geen recall', 'maximale bedrag halen', 'alles in orde'].forEach(w =>
  toets('staat op het scherm: ' + w, zien.indexOf(w) >= 0, zien.slice(0, 300)));
toets('het rapportblok niet', !/conclusie|rapport>/.test(zien));
const zonderKop = zichtbaar(s._aiReportHtml('Gewone tekst zonder één kop.'));
toets('zonder koppen: alles onder Analyse', /Analyse/.test(zonderKop) && /Gewone tekst zonder één kop\./.test(zonderKop));

console.log('\n4. Het rapportblok: los </rapport> en meerdere blokken');
toets('een losse </rapport> verdwijnt uit de tekst', R.zonderBlok('Strategie: Marktplaats.\n</rapport>') === 'Strategie: Marktplaats.');
toets('twee blokken: allebei weg, tekst ertussen blijft', R.zonderBlok('a\n<rapport>{}</rapport>\nb\n<rapport>{"x":1}</rapport>') === 'a\n\nb');
const twee = R.leesAI('Behoud het <rapport>-blok.\n\ntekst\n<rapport>{"conclusie":"oud"}</rapport>\nmeer\n<rapport>{"conclusie":"nieuw"}</rapport>');
toets('het laatste blok met JSON telt', twee.velden.conclusie === 'nieuw' && !twee.fout, JSON.stringify(twee.velden.conclusie) + ' ' + twee.fout);

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
