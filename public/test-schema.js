// ══════════════════════════════════════════════════════════════════
// test-schema.js — het onderhoudsschema van de AI lezen (PLSchema, #490)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (14-10-2026)
// Het schema komt van de AI en gaat via "overnemen" in Mijn voertuigen.
// Wat de AI terugstuurt mag dus nooit ongezien doorlopen: een onbekend
// onderdeel, een interval van 3 km of een HTML-staart horen eruit, en een
// kapot antwoord mag geen leeg schema bewaren. Laadt de echte
// pidlane-schema.js en de echte onderdelenlijst uit pidlane-conditie.js.
//
//   node test-schema.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
const opslag = {};
const ctx = { console: { log() {}, warn() {}, error() {} }, document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
  localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } } };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['pidlane-conditie.js', 'pidlane-schema.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
if (!ctx.PLSchema || !ctx.PLSchema._kern) { console.log('FOUT PLSchema hangt zijn kern niet meer naar buiten'); process.exit(1); }
const K = ctx.PLSchema._kern, LIJST = ctx.PLConditie.ONDERDELEN.map((o) => ({ id: o.id, naam: o.naam }));

console.log('1. De sleutel');
const a = { merk: 'VOLKSWAGEN', model: 'GOLF', jaar: '2011', brandstof: 'benzine', cc: '1390' };
toets('dezelfde auto, andere schrijfwijze: dezelfde sleutel', K.sleutel(a) === K.sleutel({ merk: 'Volkswagen', model: 'Golf', jaar: 2011, brandstof: 'Benzine', cc: 1390 }));
toets('een ander bouwjaar: een ander schema', K.sleutel(a) !== K.sleutel(Object.assign({}, a, { jaar: '2016' })));
toets('een andere motor: een ander schema', K.sleutel(a) !== K.sleutel(Object.assign({}, a, { cc: '1968' })));

console.log('\n2. De vraag');
const p = K.prompt(a, LIJST);
toets('noemt de auto en elk onderdeel-id van PLConditie', /VOLKSWAGEN GOLF 2011/.test(p) && LIJST.every((o) => p.indexOf(o.id) >= 0));
toets('vraagt om een <schema>-blok en om geen verzonnen getal', /<schema>/.test(p) && /verzin geen getal/.test(p));
toets('de terugval-id\'s zijn die van PLConditie', JSON.stringify(K.STD) === JSON.stringify(LIJST.map((o) => o.id)), JSON.stringify(K.STD));

console.log('\n3. Het antwoord lezen');
const goed = 'Hier is het.\n<schema>[{"id":"olie","km":15000,"mnd":12,"toelichting":"LongLife mag 30.000"},{"id":"distributie","km":null,"mnd":null,"toelichting":"ketting"},{"id":"remvloeistof","km":null,"mnd":24}]</schema>';
let r = K.lees(goed, LIJST);
toets('drie onderdelen, in de volgorde van PLConditie', r.items.map((x) => x.id).join() === 'olie,distributie,remvloeistof' && !r.fout, JSON.stringify(r));
toets('namen komen uit PLConditie, niet van de AI', r.items[0].naam === 'Motorolie');
toets('een ketting zonder interval blijft staan (km en mnd null)', r.items[1].km === null && r.items[1].mnd === null);
r = K.lees('<schema>[{"id":"turbo","km":50000},{"id":"olie","km":3,"mnd":999},{"id":"olie","km":20000}]</schema>', LIJST);
toets('een onbekend id valt weg', r.items.every((x) => x.id !== 'turbo'));
toets('een onzinnig interval wordt null, geen 3 km of 999 maanden', r.items.length === 1 && r.items[0].km === null && r.items[0].mnd === null, JSON.stringify(r.items));
toets('een dubbel onderdeel telt één keer (het eerste)', r.items.filter((x) => x.id === 'olie').length === 1);
r = K.lees('<schema>[{"id":"olie","km":15000,"toelichting":"<img src=x onerror=alert(1)>"}]</schema>', LIJST);
toets('geen < of > in de toelichting', !/[<>]/.test(r.items[0].toelichting));
toets('kapotte JSON: fout, geen items', K.lees('<schema>[{"id":</schema>', LIJST).items.length === 0 && !!K.lees('<schema>[{"id":</schema>', LIJST).fout);
toets('geen blok: fout', !!K.lees('Ik weet het niet', LIJST).fout);
toets('alleen onbekende onderdelen: fout, niets om te bewaren', !!K.lees('<schema>[{"id":"turbo"}]</schema>', LIJST).fout);

console.log('\n4. Overnemen in Mijn voertuigen');
toets('het olie-interval', JSON.stringify(K.olieInterval([{ id: 'olie', km: 15000, mnd: 12 }])) === '{"km":15000,"mnd":12}');
toets('buiten de grenzen van het formulier: dat deel valt weg', JSON.stringify(K.olieInterval([{ id: 'olie', km: 150000, mnd: 12 }])) === '{"km":null,"mnd":12}');
toets('zonder olie: niets over te nemen', K.olieInterval([{ id: 'distributie', km: 120000 }]) === null && K.olieInterval([{ id: 'olie', km: null, mnd: null }]) === null);

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
