// ══════════════════════════════════════════════════════════════════
// test-wijzer.js — milieuklasse, kosten, klachtenwijzer en adapter (PLWijzer)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (13-10-2026)
// "Past" is een uitspraak waar iemand op handelt: een adapter die in de
// la belandt. De toetsen zitten op de
// randen: een diesel-hybride die een diesel blijft, een geschatte emissie-
// klasse die zegt dat hij geschat is, de OBD-plichtdatum op de dag zelf. De
// klachtenwijzer draait op de echte PLOnderzoek, niet op een kopie.
//
// Laadt de echte bestanden. Draaien vanuit public/:
//   node test-wijzer.js   (exit 0 = goed)
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

const s = {};
s.window = s; s.globalThis = s;
s.console = { log() { }, warn() { }, error() { } };
s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
s.document = { readyState: 'loading', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() { } }), addEventListener() { }, head: { appendChild() { } }, body: { appendChild() { } } };
s.addEventListener = () => { };
s.navigator = {};
s.setTimeout = (fn) => { fn(); return 0; };
s.setInterval = () => 0; s.clearTimeout = () => { }; s.clearInterval = () => { };
vm.createContext(s);
['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-onderzoek.js', 'pidlane-wijzer.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), s, { filename: f }));
if (!s.PLWijzer || !s.PLWijzer._kern) { console.log('FOUT PLWijzer hangt zijn kern niet meer naar buiten'); process.exit(1); }
const K = s.PLWijzer._kern, O = s.PLOnderzoek;

const NU = new Date('2026-10-13T10:00:00').getTime();
const bs = (omschr, extra) => omschr.map((b) => Object.assign({ brandstof_omschrijving: b }, extra || {}));
const pa = (d, kg) => ({ voertuigsoort: 'Personenauto', datum_eerste_toelating: d, massa_rijklaar: String(kg || 1400) });

console.log('1. Brandstof en emissieklasse');
toets('Diesel + Elektriciteit is een diesel-hybride, geen hybride-benzine', K.soortBrandstof(bs(['Diesel', 'Elektriciteit'])) === 'hybride-diesel');
toets('Benzine + Elektriciteit is hybride-benzine', K.soortBrandstof(bs(['Benzine', 'Elektriciteit'])) === 'hybride-benzine');
toets('alleen Elektriciteit is elektrisch', K.soortBrandstof(bs(['Elektriciteit'])) === 'elektrisch');
toets('geen rijen is onbekend', K.soortBrandstof([]) === 'onbekend' && K.soortBrandstof(null) === 'onbekend');
toets('emissiecode "6" uit het RDW', K.euroKlasse(pa('20180101'), bs(['Diesel'], { emissiecode_omschrijving: '6' })).klasse === 6);
toets('uitlaatemissieniveau "EURO 5 A" werkt ook', K.euroKlasse(pa('20120101'), bs(['Diesel'], { uitlaatemissieniveau: 'EURO 5 A' })).klasse === 5);
const sch = K.euroKlasse(pa('20080601'), bs(['Diesel']));
toets('zonder klasse: geschat uit de eerste toelating, en dat staat erbij', sch.klasse === 4 && sch.bron === 'schatting', JSON.stringify(sch));
toets('zonder klasse en zonder datum: null, geen gok', K.euroKlasse({}, bs(['Diesel'])).klasse === null);

console.log('\n2. Milieuklasse');
const mk = (rij, b) => K.milieuklasse(rij, b);
const d4 = mk(pa('20080601'), bs(['Diesel'], { emissiecode_omschrijving: '4' }));
toets('diesel Euro 4: klasse en brandstof in de kop', d4.kop === 'Diesel, Euro 4' && d4.bron === 'rdw', d4.kop);
toets('diesel: zegt dat de grens per stad verschilt, geen oordeel', /verschilt per stad/.test(d4.uitleg) && !/mag (niet|erin)/i.test(d4.kop + d4.uitleg));
const dh = mk(pa('20080601'), bs(['Diesel', 'Elektriciteit'], { emissiecode_omschrijving: '4' }));
toets('een diesel-hybride heet ook zo, en krijgt de dieseluitleg', dh.kop === 'Hybride (diesel), Euro 4' && /oudere diesels/.test(dh.uitleg), dh.kop);
const bz = mk(pa('20150101'), bs(['Benzine'], { emissiecode_omschrijving: '6' }));
toets('benzine: zones gelden alleen voor diesels', /alleen voor diesels/.test(bz.uitleg));
const ge = mk(pa('20080601'), bs(['Diesel']));
toets('geschatte klasse staat erbij', ge.kop === 'Diesel, Euro 4' && /geschat/.test(ge.uitleg), ge.uitleg);
const on = mk({ voertuigsoort: 'Personenauto' }, bs(['Diesel']));
toets('onbekende klasse: "onbekend", geen getal', /emissieklasse onbekend/.test(on.kop) && on.klasse === null);
toets('elektrisch: geen emissieklasse in de kop', mk(pa('20220101'), bs(['Elektriciteit'])).kop === 'Elektrisch');
toets('bestelauto: verwijst naar zero-emissiezones', /zero-emissiezones/.test(mk({ voertuigsoort: 'Bedrijfsauto', datum_eerste_toelating: '20180101' }, bs(['Diesel'], { emissiecode_omschrijving: '6' })).uitleg));

console.log('\n3. Kosten per maand');
const mb = K.mrb(pa('20180101', 1100), bs(['Benzine']));
toets('benzine 1.100 kg rijklaar: het anker van de Belastingdienst (€ 126 per kwartaal)', Math.round(mb.kwartaal) === 126, mb.kwartaal);
const md = K.mrb(pa('20180101', 1100), bs(['Diesel']));
toets('diesel kost meer dan benzine bij hetzelfde gewicht', md.kwartaal > mb.kwartaal);
// #505: de wettekst (art. 23, versie 01-07-2026), niet een lijn door één punt.
toets('dieseltoeslag 1.100 kg: € 153 + € 16,57 (art. 23 lid 2a)', Math.abs(md.kwartaal - mb.kwartaal - 169.57) < 0.01, md.kwartaal - mb.kwartaal);
toets('rijksdeel 1.000 kg rijklaar: € 64,24, 1.001 kg al de volgende 100 kg', K.tarief(K.MRB.rijk, K.MRB.rijkPer100, 1000) === 64.24 && Math.abs(K.tarief(K.MRB.rijk, K.MRB.rijkPer100, 1001) - 81.51) < 0.001);
toets('lichte auto (850 kg): de klasse van 900 kg, niet een doorgetrokken lijn', K.tarief(K.MRB.rijk, K.MRB.rijkPer100, 850) === 48.30);
toets('zware auto (3.500 kg): het eigen tarief vanaf 3.400 kg', Math.abs(K.tarief(K.MRB.rijk, K.MRB.rijkPer100, 3500) - 486.12) < 0.001);
toets('de uitleg zegt dat de fijnstoftoeslag er niet in zit', /zonder fijnstoftoeslag/.test(md.uitleg));
{
  // Eén prijs per brandstof in de app: PLBerekend (de ritkosten) en de
  // wijzer (kosten per maand) lazen tot #505 twee verschillende tabellen.
  const ctx = { window: {}, console: { warn() {}, log() {}, error() {} } };
  ctx.window = ctx;
  require('vm').createContext(ctx);
  require('vm').runInContext(require('fs').readFileSync(__dirname + '/pidlane-berekend.js', 'utf8'), ctx);
  const P = (ctx.PLBerekend || {}).PRIJS_STANDAARD, W = K.PRIJS;
  toets('ritkosten en kosten per maand gebruiken dezelfde pompprijs',
    P && P.benzine === W.benzine && P.diesel === W.diesel && P.lpg === W.lpg, JSON.stringify({ berekend: P, wijzer: W }));
}
const mz = K.mrb(pa('20180101', 1600), bs(['Benzine']));
toets('zwaarder kost meer', mz.kwartaal > mb.kwartaal);
const me = K.mrb(pa('20230101', 1100), bs(['Elektriciteit']));
toets('elektrisch 2026: 70 % van benzine', Math.abs(me.kwartaal - mb.kwartaal * 0.7) < 0.01, me.kwartaal);
const mp = K.mrb(pa('20230101', 1100), bs(['Benzine', 'Elektriciteit']));
toets('plug-in hybride: het volle benzinetarief', Math.abs(mp.kwartaal - mb.kwartaal) < 0.01);
toets('een bandbreedte, geen schijnprecisie', mb.laag < mb.perMaand && mb.hoog > mb.perMaand);
toets('zonder gewicht: onbekend, geen bedrag', K.mrb({ voertuigsoort: 'Personenauto' }, bs(['Benzine'])).perMaand === undefined);
toets('LPG: onbekend (eigen toeslag)', !!K.mrb(pa('20100101', 1200), bs(['LPG'])).onbekend);
const bk = K.brandstofKosten(bs(['Benzine'], { brandstofverbruik_gecombineerd: '6.0' }), { km: 1000, prijs: { benzine: 2 } });
toets('6 l/100 km, 1.000 km, € 2: 60 l × 1,15 praktijk = € 138', Math.round(bk.perMaand) === 138, bk.perMaand);
const ek = K.brandstofKosten(bs(['Elektriciteit'], { elektrisch_verbruik_enkel_elektrisch_wltp: '160' }), { km: 1000, prijs: { stroom: 0.4 } });
toets('elektrisch: 160 Wh/km is kWh, geen Wh (× 1,15 × 1.000 km × € 0,40 = € 74)', Math.round(ek.perMaand) === 74, ek.perMaand);
toets('geen verbruik bij het RDW: onbekend', !!K.brandstofKosten(bs(['Benzine'])).onbekend);
const kt = K.kosten(pa('20180101', 1100), bs(['Benzine'], { brandstofverbruik_gecombineerd: '6.0' }));
toets('totaal is mrb plus brandstof', Math.abs(kt.totaal - kt.mrb.perMaand - kt.brandstof.perMaand) < 0.01);
toets('een onbekend deel geeft geen totaal', K.kosten(pa('20180101', 1100), bs(['Benzine'])).totaal === null);

console.log('\n4. Past een adapter?');
toets('benzine 01-01-2001: ja (op de dag zelf)', K.adapter(pa('20010101'), bs(['Benzine'])).past === 'ja');
toets('benzine 31-12-2000: waarschijnlijk, geen ja', K.adapter(pa('20001231'), bs(['Benzine'])).past === 'waarschijnlijk');
toets('diesel 2002: waarschijnlijk (diesel pas vanaf 2004)', K.adapter(pa('20020601'), bs(['Diesel'])).past === 'waarschijnlijk');
toets('diesel 1998: nee', K.adapter(pa('19980601'), bs(['Diesel'])).past === 'nee');
const a08 = K.adapter(pa('20100101'), bs(['Diesel'])), a05 = K.adapter(pa('20050101'), bs(['Diesel']));
toets('2010 praat CAN, 2005 waarschijnlijk K-line', /CAN/.test(a08.tekst) && /K-line/.test(a05.tekst));
toets('elektrisch: beperkt, niet ja', K.adapter(pa('20220101'), bs(['Elektriciteit'])).past === 'beperkt');
toets('motorfiets: nee', K.adapter({ voertuigsoort: 'Motorfiets', datum_eerste_toelating: '20200101' }, bs(['Benzine'])).past === 'nee');
toets('de WiFi-waarschuwing staat erbij', K.adapter(pa('20150101'), bs(['Benzine'])).tips.some((t) => /WiFi/.test(t)));

console.log('\n5. Klachtenwijzer op de echte PLOnderzoek');
toets('de vragen bestaan nog in PLOnderzoek.STAPPEN', K.VRAGEN.every((id) => O.STAPPEN.some((x) => x.id === id && x.soort === 'vraag')),
  K.VRAGEN.filter((id) => !O.STAPPEN.some((x) => x.id === id)).join(','));
toets('geen klacht: geen start', K.wijzerStart([], '', '', O) === null && K.wijzerStart(['bestaatniet'], '', '', O) === null);
let st = K.wijzerStart(['rook'], '', 'benzine', O);
let v = K.wijzerVragen(st, O);
toets('bij rook komt de rookkleur eerst', v[0] && v[0].id === 'rookkleur', v.map((x) => x.id).join(','));
toets('geen vraag die een draaiende motor of meting nodig heeft', v.every((x) => x.soort === 'vraag' && K.VRAGEN.indexOf(x.id) >= 0));
K.wijzerAntwoord(st, 'rookkleur', 'blauw', O);
let u = K.wijzerUitkomst(st, O);
toets('blauwe rook: olieverbruik bovenaan', u.kandidaten[0] && u.kandidaten[0].id === 'olie', u.kandidaten.map((x) => x.id + ':' + x.score).join(' '));
toets('een beantwoorde vraag komt niet terug', K.wijzerVragen(st, O).every((x) => x.id !== 'rookkleur'));
K.wijzerAntwoord(st, 'rookkleur', 'wit', O);
toets('dubbel antwoorden telt niet dubbel', st.gedaan.filter((x) => x === 'rookkleur').length === 1);
st = K.wijzerStart(['start'], '', 'benzine', O);
K.wijzerAntwoord(st, 'startgedrag', 'traag', O);
u = K.wijzerUitkomst(st, O);
toets('draait traag rond: de accu bovenaan', u.kandidaten[0] && u.kandidaten[0].id === 'accu', u.kandidaten.map((x) => x.id).join(','));
toets('de adapter zou de accu in rust meten', u.meet.some((m) => /Accu in rust/.test(m.titel)), u.meet.map((m) => m.titel).join(' | '));
st = K.wijzerStart(['onrustig'], '', 'benzine', O);
K.wijzerAntwoord(st, 'geluid', 'ja', O);
u = K.wijzerUitkomst(st, O);
toets('een geluid van buiten de motor: eerlijk "geen sensor"', u.nietObd === true && u.kandidaten.every((x) => x.id !== 'niet_obd'));

console.log('\n6. De blokken onder de kenteken-check');
const html = s.PLWijzer.blokken(pa('20120315', 1450), bs(['Diesel'], { emissiecode_omschrijving: '5', brandstofverbruik_gecombineerd: '4.8' }));
toets('drie blokken: milieuklasse, kosten, adapter', /data-plw="zones"/.test(html) && /data-plw="kosten"/.test(html) && /data-plw="adapter"/.test(html));
toets('geen undefined, NaN of null in beeld', !/undefined|NaN|>null</.test(html));
toets('de link naar milieuzones.nl staat erin', html.indexOf('href="https://www.milieuzones.nl"') >= 0);
const leeg = s.PLWijzer.blokken({}, []);
toets('een lege RDW-rij geeft ook geen undefined of NaN', !/undefined|NaN/.test(leeg));

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
