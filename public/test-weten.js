// ══════════════════════════════════════════════════════════════════
// test-weten.js — "Wat we al weten": de kaart vóór de eerste vraag
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (09-10-2026)
// De wizard vroeg eerst hoe lang je wilde meten en zei pas daarna (of nooit)
// wat hij over de auto wist. PLWeten zet het RDW, de merkkennis, het dossier
// en de laatste uitlezing vóór die vraag, plus waar je tijdens een proefrit op
// let. Wat hier bewaakt wordt:
//   1. elke RDW-regel die de kaart wil tonen, levert rdwOverzicht() ook
//      echt — een hernoemd label zou stil uit de kaart vallen;
//   2. de merkkennis wordt iets wat je bij een proefrit doet, en een zwak
//      punt dat pas onder belasting boven komt geeft het advies "rit10";
//   3. elke tak toont wat bij hem hoort, en niets van een ander:
//      de auto die je koopt krijgt jouw dossier niet;
//   4. een kaart zonder gegevens over déze auto heet leeg;
//   5. de vraag aan de AI bevat geen kenteken en geen chassisnummer;
//   6. schadehistorie wordt niet beloofd.
//
// Laadt de echte pidlane-weten.js, pidlane-zonder.js en pidlane-data.js met
// vm en knipt autoKennisVoorMerk() uit pidlane-motortype.js.
// Draaien vanuit public/:  node test-weten.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fout = 0, n = 0;
function eis(wat, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + wat);
  else { fout++; console.log('  FAAL  ' + wat + (uitleg ? ' — ' + uitleg : '')); }
}
const lees = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, document: { readyState: 'loading', addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, setTimeout: () => 0, setInterval: () => 0 };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(lees('pidlane-zonder.js'), ctx, { filename: 'pidlane-zonder.js' });
vm.runInContext(lees('pidlane-weten.js'), ctx, { filename: 'pidlane-weten.js' });
try { vm.runInContext(lees('pidlane-data.js'), ctx, { filename: 'pidlane-data.js' }); }
catch (e) { console.log('FAAL pidlane-data.js laadt niet in de testcontext: ' + e.message); process.exit(1); }
const mt = lees('pidlane-motortype.js');
const ki = mt.indexOf('function autoKennisVoorMerk(merk, brandstof){');
const kj = mt.indexOf('\n}\n', ki);
if (ki < 0 || kj < 0) { console.log('FAAL autoKennisVoorMerk() is niet meer te vinden in pidlane-motortype.js'); process.exit(1); }
vm.runInContext(mt.slice(ki, kj + 2), ctx, { filename: 'autoKennisVoorMerk' });

const W = ctx.PLWeten && ctx.PLWeten._kern, Z = ctx.PLZonder && ctx.PLZonder._kern;
if (!W || !Z) { console.log('FAAL PLWeten of PLZonder hangt zijn kern niet meer naar buiten'); process.exit(1); }
eis('PLZonder geeft haal() naar buiten — daar leest PLWeten het RDW mee', typeof ctx.PLZonder.haal === 'function');

const NU = new Date('2026-10-09T10:00:00').getTime();
// Een auto die alles laat zien wat het RDW kan zeggen: geïmporteerd, export
// gemeld, wacht op keuren, terugroepactie open.
const rij = {
  kenteken: 'AB123C', merk: 'MAZDA', handelsbenaming: 'CX-5', vervaldatum_apk: '20261020', datum_tenaamstelling: '20230301',
  datum_eerste_toelating: '20160315', datum_eerste_tenaamstelling_in_nederland: '20190610', wam_verzekerd: 'Ja',
  tellerstandoordeel: 'Logisch', jaar_laatste_registratie_tellerstand: '2025', openstaande_terugroepactie_indicator: 'Ja',
  export_indicator: 'Ja', wacht_op_keuren: 'Ja', cilinderinhoud: '2191', eerste_kleur: 'GRIJS'
};
const bs = [{ brandstof_omschrijving: 'Diesel', brandstofverbruik_gecombineerd: '5.4', co2_uitstoot_gecombineerd: '142' }];
const rdw = Z.rdwOverzicht(rij, bs, NU);
const labels = rdw.regels.map(function (r) { return r.label; });

console.log('\n1. Elke RDW-regel die de kaart wil, bestaat');
Object.keys(W.RDW_LABELS).forEach(function (tak) {
  const mist = W.RDW_LABELS[tak].filter(function (l) { return labels.indexOf(l) < 0; });
  eis('tak ' + tak + ': alle labels komen uit rdwOverzicht()', mist.length === 0, 'ontbreekt: ' + mist.join(', '));
});

console.log('\n2. Merkkennis wordt een proefrit');
const kennisMazda = ctx.autoKennisVoorMerk('MAZDA', 'Diesel');
eis('de merktabel kent Mazda', !!kennisMazda && kennisMazda.zwak.length > 0);
const pp = W.proefritPunten(kennisMazda.zwak);
eis('Mazda diesel: het roetfilter komt als proefritpunt', pp.punten.some(function (t) { return /Roetfilter/.test(t); }), pp.punten.join(' | '));
eis('Mazda: roest in de wielkasten wordt "kijk met een lamp"', pp.punten.some(function (t) { return /Roest/.test(t); }));
eis('de algemene punten staan er altijd achteraan', pp.punten[pp.punten.length - 1] === 'Rechtuit: het stuur staat recht en de auto loopt niet weg.');
eis('zonder merkkennis alleen de algemene punten', W.proefritPunten([]).punten.length === 3 && W.proefritPunten(null).last.length === 0);
const adv = W.adviesMeting(kennisMazda.zwak);
eis('een DPF-probleem komt pas onder belasting boven → advies rit10', !!adv && adv.meting === 'rit10' && /DPF/.test(adv.waarom), JSON.stringify(adv));
eis('alleen koeling en roest: geen advies — dan kiest de gebruiker zelf', W.adviesMeting(['waterpomp lekkage', 'roest wielkasten']) === null);
const zonderPunt = Object.keys(ctx.AUTO_KENNIS).filter(function (m) {
  return W.proefritPunten(ctx.AUTO_KENNIS[m].zwak.map(function (z) { return z[0]; })).punten.length <= 3;
});
eis('elk merk in de tabel levert minstens één eigen proefritpunt', zonderPunt.length === 0, 'zonder: ' + zonderPunt.join(', '));

console.log('\n3. Elke tak toont wat bij hem hoort');
const dossier = { kleur: 'oranje', punten: [{ ernst: 'oranje', tekst: 'Accu zwak in rust (12,0 V)' }] };
const scan = { tijd: NU, codes: { bevestigd: ['P2002'], pending: [], permanent: [] } };
const bron = { voertuig: { merk: 'Mazda', model: 'CX-5', jaar: '2016' }, rdw: rdw, recall: [{ referentiecode: 'R123', omschrijving: 'Airbag', status: 'open' }],
  dossier: dossier, scan: scan, kennis: kennisMazda };
const kop = function (m) { return m.blokken.map(function (b) { return b.kop; }); };
const koop = W.kaart(bron, 'handel', 'koop');
eis('koop: de papieren, de merkkennis, de proefrit en wat de app niet weet', ['De papieren (RDW)', 'Let bij Mazda op', 'Bij de auto en tijdens de proefrit', 'Wat de app niet weet']
  .every(function (k) { return kop(koop).indexOf(k) > -1; }), kop(koop).join(' | '));
eis('koop: de auto die je koopt krijgt jouw dossier en jouw foutcodes niet  <- tegenproef', kop(koop).indexOf('Uit je dossier') < 0 && kop(koop).indexOf('De laatste foutcode-uitlezing') < 0);
eis('koop: de terugroepactie staat er met omschrijving', koop.blokken[0].regels.some(function (r) { return /R123/.test(r.label) && /Airbag/.test(r.waarde); }));
eis('koop: het verbruik volgens de typekeuring hoort niet bij de papieren', !koop.blokken[0].regels.some(function (r) { return /Verbruik/.test(r.label); }));
eis('koop: het advies is rit10', koop.advies && koop.advies.meting === 'rit10');
const schade = koop.blokken.filter(function (b) { return b.kop === 'Wat de app niet weet'; })[0];
eis('koop: schadehistorie wordt niet beloofd maar uitgelegd', !!schade && /niet in de open RDW-data/.test(schade.regels[0].waarde));
const verkoop = W.kaart(bron, 'handel', 'verkoop');
eis('verkoop: "wat een koper straks ziet", zonder proefrittips', kop(verkoop)[0] === 'Wat een koper straks ziet (RDW)' && kop(verkoop).indexOf('Bij de auto en tijdens de proefrit') < 0);
const storing = W.kaart(bron, 'storing');
eis('storing: dossier en foutcodes, en van het RDW alleen de open terugroepactie', kop(storing).indexOf('Uit je dossier') > -1 && kop(storing).indexOf('De laatste foutcode-uitlezing') > -1 &&
  storing.blokken[0].regels.every(function (r) { return /Terugroepactie/.test(r.label); }), JSON.stringify(storing.blokken[0].regels.map(function (r) { return r.label; })));
eis('storing: geen meetadvies — "wanneer merk je het" is geen tijdvraag', storing.advies === null);
const verbruik = W.kaart(bron, 'verbruik');
eis('verbruik: alleen de fabrieksopgave, geen merkkennis', kop(verbruik).length === 2 && kop(verbruik)[0] === 'De fabrieksopgave — daar meten we tegen', kop(verbruik).join(' | '));
eis('verbruik: de opgave zelf staat erin', verbruik.blokken[0].regels[0].label === 'Verbruik volgens de typekeuring');
const conditie = W.kaart(bron, 'conditie');
eis('conditie: met advies, want hij heeft een meetvraag', conditie.advies && conditie.advies.meting === 'rit10');

console.log('\n4. Leeg is leeg');
const niets = W.kaart({ voertuig: {} }, 'storing');
eis('storing zonder dossier, uitlezing of merk: leeg, geen blokken', niets.leeg && niets.blokken.length === 0);
const koopNiets = W.kaart({ voertuig: {} }, 'handel', 'koop');
eis('koop zonder kenteken: leeg, maar de proefrittips blijven staan', koopNiets.leeg && koopNiets.blokken.length === 2, kop(koopNiets).join(' | '));
eis('een schone uitlezing telt als gegeven ("geen foutcodes")', !W.kaart({ voertuig: {}, scan: { tijd: NU, codes: {} } }, 'storing').leeg);
const metFout = W.kaart({ voertuig: {}, fout: 'RDW niet bereikbaar: 502' }, 'handel', 'koop');
eis('een RDW-fout wordt gezegd, niet verzwegen', kop(metFout).indexOf('Niet gelukt') > -1);

console.log('\n5. De vraag aan de AI');
const p = W.aiPrompt({ voertuig: { merk: 'Mazda', model: 'CX-5', brandstof: 'diesel' }, rdw: rdw });
eis('noemt merk, model en jaar', /MAZDA CX-5 2016/.test(p), p.slice(0, 120));
eis('bevat geen kenteken', p.indexOf('AB123C') < 0);
eis('vraagt om eerlijkheid als het model onbekend is', /niet zeker/.test(p));

console.log('\n' + (fout ? fout + ' van ' + n + ' FAAL' : 'Alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
