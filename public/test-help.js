// ══════════════════════════════════════════════════════════════════
// test-help.js — de handleiding moet over deze app gaan, niet over een oude
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Een handleiding veroudert stil. Een knop wordt hernoemd, een menuregel
// verhuist, en de tekst blijft vol vertrouwen iets beschrijven dat er niet
// meer is. Het uitroepteken bij die knop verdwijnt zonder foutmelding: de
// selector vindt niets meer en er gebeurt gewoon niets.
//
// WAT DEZE TEST EIST
//   1. PL_HULP laadt en heeft de vorm die pidlane-help.js verwacht
//   2. elke verwijzing naar een onderwerp (zie, data-hulp, faq, tip) bestaat
//   3. elke data-hulp-doe is een actie die pidlane-help.js kent
//   4. elk anker van een uitroepteken staat in zijn bronbestand
//   5. elk knoplabel in de tekst (vet, beginnend met een emoji) staat letterlijk
//      in de app — een hernoemde knop maakt deze test rood
//   6. elk media-bestand bestaat
//   7. geen prijzen, en nooit "anoniem" (CLAUDE.md, privacy)
//   8. het menu heeft de ingang, en beide bestanden hangen vóór de
//      bedradingscontrole
//   9. de beeldtaal: elk onderwerp heeft een icoon en een korte zin, elk
//      schema een bekende soort, en de echte weergave (pidlane-help.js)
//      tekent stappen, schema's en kaders en zet de lange tekst onder
//      "Meer uitleg". 2, 3 en 5 lezen ook de HTML in stappen, schema's en kaders.
// De controle op de appversie (gecontroleerd.app) is een LET OP, geen FOUT:
// een versiesprong maakt de tekst niet fout, alleen ongecontroleerd.
//
// Draaien vanuit public/:  node test-help.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
let fout = 0, n = 0;
function toets(naam, ok, detail) {
  n++;
  if (ok) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (detail ? '\n        ' + detail : '')); }
}
const lees = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// ── 1. laden ──
console.log('1. PL_HULP laadt');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(lees('pidlane-help-inhoud.js'), ctx, { filename: 'pidlane-help-inhoud.js' });
const H = ctx.window.PL_HULP;
toets('window.PL_HULP bestaat', !!H);
if (!H) { console.log('\n' + fout + ' fout(en)'); process.exit(1); }
toets('onderwerpen, groepen, tips en faq zijn lijsten',
  [H.onderwerpen, H.groepen, H.tips, H.faq].every(Array.isArray));
toets('gecontroleerd heeft een datum (JJJJ-MM-DD) en een versie',
  !!(H.gecontroleerd && /^\d{4}-\d{2}-\d{2}$/.test(H.gecontroleerd.datum) && H.gecontroleerd.app));

const ids = H.onderwerpen.map(o => o.id);
const dubbel = ids.filter((id, i) => ids.indexOf(id) !== i);
toets('onderwerp-ids zijn uniek', !dubbel.length, dubbel.join(', '));
toets('"faq" is geen onderwerp-id (het is het anker van de vragen)', ids.indexOf('faq') === -1);
const groepIds = H.groepen.map(g => g.id);
const losseGroep = H.onderwerpen.filter(o => groepIds.indexOf(o.groep) === -1).map(o => o.id + '→' + o.groep);
toets('elk onderwerp hoort bij een bestaande groep', !losseGroep.length, losseGroep.join(', '));
const leeg = H.onderwerpen.filter(o => !o.titel || !o.tekst).map(o => o.id);
toets('elk onderwerp heeft een titel en tekst', !leeg.length, leeg.join(', '));
const tipIds = H.tips.map(t => t.id);

// Alle HTML van een onderwerp: de tekst plus wat er in stappen, schema en kaders staat.
function htmlVan(o) {
  const delen = [o.tekst, o.tip || '', o.let || ''];
  (o.stappen || []).forEach(st => delen.push(st.t || '', st.u || ''));
  ((o.schema && o.schema.delen) || []).forEach(d => delen.push(d.u || ''));
  return delen.join('\n');
}
toets('tip-ids zijn uniek', tipIds.length === new Set(tipIds).size);

// ── 2. verwijzingen ──
console.log('\n2. verwijzingen naar onderwerpen');
const bestaat = (id) => id === 'faq' || ids.indexOf(id) !== -1;
const kapot = [];
H.onderwerpen.forEach(o => {
  (o.zie || []).forEach(z => { if (!bestaat(z)) kapot.push(o.id + ' zie ' + z); });
  [...htmlVan(o).matchAll(/data-hulp="([^"]+)"/g)].forEach(m => { if (!bestaat(m[1])) kapot.push(o.id + ' link ' + m[1]); });
});
H.faq.forEach((f, i) => { if (f.zie && !bestaat(f.zie)) kapot.push('faq ' + i + ' zie ' + f.zie); });
H.tips.forEach(t => { if (!bestaat(t.onderwerp)) kapot.push('tip ' + t.id + ' → ' + t.onderwerp); });
toets('elke verwijzing wijst naar een bestaand onderwerp', !kapot.length, kapot.join(' | '));

// ── 3. acties ──
console.log('\n3. knoppen in de tekst die iets openen');
const helpBron = lees('pidlane-help.js');
const doeBlok = helpBron.match(/var DOE = \{([\s\S]*?)\n  \};/);
toets('pidlane-help.js heeft een DOE-lijst', !!doeBlok);
const doeKeys = doeBlok ? [...doeBlok[1].matchAll(/^\s*([a-z]+):\s*function/gm)].map(m => m[1]) : [];
const onbekend = [];
H.onderwerpen.forEach(o => [...htmlVan(o).matchAll(/data-hulp-doe="([^"]+)"/g)].forEach(m => {
  if (doeKeys.indexOf(m[1]) === -1) onbekend.push(o.id + ': ' + m[1]);
}));
toets('elke data-hulp-doe staat in DOE (' + doeKeys.join(', ') + ')', !onbekend.length, onbekend.join(', '));

// ── 4. ankers ──
console.log('\n4. elk uitroepteken vindt zijn knop in de bron');
function ankerDelen(sel) {
  // Wat er letterlijk in de bron moet staan: id="x", class="… x …", of attr="waarde".
  const delen = [];
  [...sel.matchAll(/#([\w-]+)/g)].forEach(m => delen.push({ soort: 'id', w: m[1] }));
  [...sel.matchAll(/\[([\w-]+)="([^"]+)"\]/g)].forEach(m => delen.push({ soort: 'attr', a: m[1], w: m[2] }));
  return delen;
}
H.tips.forEach(t => {
  let bron = null;
  try { bron = lees(t.bron); } catch (e) { toets('tip ' + t.id + ': bron ' + t.bron + ' bestaat', false, e.message); return; }
  const delen = ankerDelen(t.anker);
  if (!delen.length) { toets('tip ' + t.id + ': anker ' + t.anker + ' heeft een id of attribuut om op te zoeken', false); return; }
  const mis = delen.filter(d => d.soort === 'id'
    ? !new RegExp('\\bid=(["\'])' + d.w + '\\1').test(bron)
    : !new RegExp('\\b' + d.a + '=(["\'])' + d.w + '\\1').test(bron));
  toets('tip ' + t.id + ': ' + t.anker + ' staat in ' + t.bron, !mis.length,
    'niet gevonden: ' + mis.map(d => d.soort === 'id' ? 'id="' + d.w + '"' : d.a + '="' + d.w + '"').join(', ') +
    ' — hernoemd of weg? Pas het anker in pidlane-help-inhoud.js aan');
});

// ── 5. knoplabels ──
console.log('\n5. knoplabels in de tekst bestaan in de app');
const appBron = ['index.html'].concat(fs.readdirSync(DIR).filter(f => /^pidlane-.*\.js$/.test(f) && f !== 'pidlane-help-inhoud.js'))
  .map(lees).join('\n')
  .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&amp;/g, '&').replace(/\\'/g, "'");
const EMOJI = /^[\u2190-\u2BFF\u25A0-\u27BF\u{1F000}-\u{1FAFF}]/u;
const labels = new Set();
H.onderwerpen.forEach(o => [...htmlVan(o).matchAll(/<b>([^<]+)<\/b>/g)].forEach(m => {
  const l = m[1].split('→').pop().trim();
  if (EMOJI.test(l)) labels.add(l);
}));
const weg = [...labels].filter(l => appBron.indexOf(l) === -1);
toets('elk knoplabel (' + labels.size + ') staat letterlijk in de app', !weg.length,
  'niet gevonden: ' + weg.join(' | ') + ' — knop hernoemd? Pas de tekst in pidlane-help-inhoud.js aan');

// ── 6. media ──
console.log('\n6. afbeeldingen en video\'s');
const media = [];
H.onderwerpen.forEach(o => (o.media || []).forEach(m => media.push({ o: o.id, m })));
const mediaMis = media.filter(x => !x.m.src || !/^handleiding\//.test(x.m.src) || !fs.existsSync(path.join(DIR, x.m.src)));
toets('elk media-bestand staat in public/handleiding/ (' + media.length + ')', !mediaMis.length,
  mediaMis.map(x => x.o + ': ' + x.m.src).join(', '));
const soortFout = media.filter(x => ['afbeelding', 'video'].indexOf(x.m.soort) === -1);
toets('media-soort is afbeelding of video', !soortFout.length, soortFout.map(x => x.o).join(', '));

// ── 7. wat er niet in mag ──
console.log('\n7. geen prijzen, geen "anoniem"');
const alleTekst = JSON.stringify(H);
const prijs = alleTekst.match(/€|\\u20ac|\beuro\b|\b\d+[,.]\d{2}\b|tikkie/i);
toets('geen prijs of betaalroute in de handleiding', !prijs, prijs && prijs[0]);
const anon = alleTekst.match(/anonie?m|geanonimiseerd/i);
toets('nergens "anoniem" (het is een pseudoniem — CLAUDE.md)', !anon, anon && anon[0]);

// ── 8. bedrading ──
console.log('\n8. de ingang en de laadvolgorde');
const html = lees('index.html');
toets('Meer heeft de regel Handleiding', /id="kbHandleiding"[^>]*onclick="[^"]*PLHelp\.open\(\)/.test(html));
toets('Meer heeft de schakelaar voor de uitroeptekens', /id="kbHelpTips"[^>]*role="switch"[^>]*onclick="PLHelp\.wisselTips\(\)"/.test(html));
toets('het inlogscherm linkt naar de handleiding', /id="lgHandleiding"/.test(html));
const pi = html.indexOf('src="pidlane-help-inhoud.js"'), ph = html.indexOf('src="pidlane-help.js"'), pb = html.indexOf('src="pidlane-bedrading.js"');
toets('inhoud laadt vóór de weergave, beide vóór de bedradingscontrole', pi > 0 && ph > pi && pb > ph);

// ── 9. de beeldtaal ──
console.log('\n9. visuele handleiding');
const zonderBeeld = H.onderwerpen.filter(o => !o.icoon || !o.kort).map(o => o.id);
toets('elk onderwerp heeft een icoon en een korte zin (tegel in de inhoud)', !zonderBeeld.length, zonderBeeld.join(', '));
const teLang = H.onderwerpen.filter(o => o.kort && o.kort.length > 110).map(o => o.id + ' (' + o.kort.length + ')');
toets('de korte zin is kort (hoogstens 110 tekens)', !teLang.length, teLang.join(', '));
const SOORTEN = ['stroom', 'tegels', 'balk', 'legenda'];
const schemaFout = H.onderwerpen.filter(o => o.schema && (SOORTEN.indexOf(o.schema.soort) === -1 || !(o.schema.delen || []).length)).map(o => o.id);
toets('elk schema heeft een bekende soort en delen', !schemaFout.length, schemaFout.join(', '));
const stapFout = H.onderwerpen.filter(o => o.stappen && (!o.stappen.length || o.stappen.some(st => !st.i || !st.t))).map(o => o.id);
toets('elke stap heeft een icoon en een tekst', !stapFout.length, stapFout.join(', '));
const balkTabs = [...html.matchAll(/class="pl-nav-tab" data-tab="([a-z]+)"/g)].map(m => m[1]);
const balkFout = [];
H.onderwerpen.forEach(o => { if (o.schema && o.schema.soort === 'balk') o.schema.delen.forEach(d => { if (balkTabs.indexOf(d.tab) === -1) balkFout.push(o.id + ': ' + d.tab); }); });
toets('elke tab in een balkschema bestaat in de onderbalk (' + balkTabs.join(', ') + ')', balkTabs.length && !balkFout.length, balkFout.join(', '));

// De echte weergave, met net genoeg document om te laden. De onderbalk is er
// één met een herkenbaar icoon: komt dat in de handleiding, dan is het geleend.
const svgProef = '<svg data-proef="home"></svg>';
const dctx = {
  console, setTimeout, setInterval: () => 0,
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    readyState: 'complete', addEventListener() {}, getElementById: () => null,
    querySelector: (sel) => sel === '#plNav [data-tab="auto"] svg' ? { outerHTML: svgProef } : null,
    querySelectorAll: () => []
  },
  addEventListener() {}
};
dctx.window = dctx;
dctx.PL_HULP = H;
vm.createContext(dctx);
vm.runInContext(lees('pidlane-help.js'), dctx, { filename: 'pidlane-help.js' });
const R = dctx.PLHelp && dctx.PLHelp._html;
toets('pidlane-help.js geeft zijn weergave vrij (PLHelp._html)', !!(R && R.onderwerp && R.inhoud));
if (R) {
  const tel = (s, re) => (s.match(re) || []).length;
  const metStappen = H.onderwerpen.find(o => o.stappen);
  const hs = R.onderwerp(metStappen);
  toets(metStappen.id + ': elke stap een genummerde kaart (' + metStappen.stappen.length + ')',
    tel(hs, /class="plh-stap"/g) === metStappen.stappen.length &&
    hs.indexOf('plh-stap-n" aria-hidden="true">' + metStappen.stappen.length + '<') !== -1);
  toets(metStappen.id + ': de lange tekst staat onder Meer uitleg', /<details class="plh-meer"><summary>Meer uitleg<\/summary>/.test(hs) && hs.indexOf(metStappen.tekst) > hs.indexOf('plh-meer'));
  const kaal = { id: 'x', titel: 'X', tekst: '<p>los</p>' };
  toets('zonder beeld blijft de tekst open (geen Meer uitleg)', R.onderwerp(kaal).indexOf('plh-meer') === -1);
  const soorten = {};
  H.onderwerpen.forEach(o => { if (o.schema) soorten[o.schema.soort] = o; });
  SOORTEN.forEach(sr => {
    if (!soorten[sr]) return;
    const o = soorten[sr], h2 = R.onderwerp(o);
    toets(o.id + ': schema ' + sr + ' wordt getekend', h2.indexOf('plh-' + sr) !== -1);
  });
  if (soorten.balk) toets('het balkschema leent het icoon uit de echte onderbalk', R.onderwerp(soorten.balk).indexOf(svgProef) !== -1);
  const kaders = H.onderwerpen.filter(o => o.let);
  if (kaders.length) toets(kaders[0].id + ': een waarschuwing wordt een Let op-kader', R.onderwerp(kaders[0]).indexOf('plh-kader-let') !== -1);
  const toc = R.inhoud(H);
  toets('de inhoud is een tegel per onderwerp (' + H.onderwerpen.length + ')', tel(toc, /class="plh-toc-tegel"/g) === H.onderwerpen.length);
}

// ── versie: LET OP, geen FOUT ──
const cfg = lees('config.js').match(/APP_VERSION\s*=\s*'([^']+)'/);
if (cfg && cfg[1] !== H.gecontroleerd.app) {
  console.log('\n  LET OP  de app is ' + cfg[1] + ', de handleiding is nagelopen tegen ' + H.gecontroleerd.app +
    '. Loop de tekst na en zet gecontroleerd in pidlane-help-inhoud.js bij.');
}

console.log('\n' + n + ' controles, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
