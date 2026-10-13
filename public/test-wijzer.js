// ══════════════════════════════════════════════════════════════════
// test-wijzer.js — zones, kosten, klachtenwijzer en adapter (PLWijzer)
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (13-10-2026)
// "Mag erin" en "past" zijn uitspraken waar iemand op handelt: een boete
// van € 139, of een adapter die in de la belandt. De toetsen zitten op de
// randen: Euro 4 tegen een blauwe zone, de Arnhemse aanscherping vóór en na
// de ingangsdatum, een diesel-hybride die een diesel blijft, een onbekende
// klasse die nooit "mag" wordt, de OBD-plichtdatum op de dag zelf. De
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
const VOOR_ARNHEM = new Date('2026-05-31T10:00:00').getTime();
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

console.log('\n2. Milieuzones');
const stad = (z, n) => z.rijen.filter((r) => r.stad === n)[0];
const e4 = K.zones(pa('20080601'), bs(['Diesel'], { emissiecode_omschrijving: '4' }), NU);
toets('Euro 4 diesel: niet in Amsterdam (blauw)', stad(e4, 'Amsterdam').mag === false);
toets('Euro 4 diesel: wel in Den Haag (groen)', stad(e4, 'Den Haag').mag === true);
toets('Euro 4 diesel: niet in Arnhem na de aanscherping van 01-06-2026', stad(e4, 'Arnhem').mag === false);
const e4oud = K.zones(pa('20080601'), bs(['Diesel'], { emissiecode_omschrijving: '4' }), VOOR_ARNHEM);
toets('Euro 4 diesel: wel in Arnhem vóór 01-06-2026', stad(e4oud, 'Arnhem').mag === true);
toets('de kop telt de zones waar hij niet in mag', e4.ernst === 'rood' && /Mag 3 van de 4/.test(e4.kop), e4.kop);
const e5 = K.zones(pa('20120101'), bs(['Diesel'], { emissiecode_omschrijving: '5' }), NU);
toets('Euro 5 diesel: overal', e5.rijen.every((r) => r.mag === true) && e5.ernst === 'groen');
const hyb = K.zones(pa('20080601'), bs(['Diesel', 'Elektriciteit'], { emissiecode_omschrijving: '4' }), NU);
toets('een diesel-hybride Euro 4 valt onder de dieselzones', stad(hyb, 'Amsterdam').mag === false);
const benz = K.zones(pa('19980101'), bs(['Benzine'], { emissiecode_omschrijving: '1' }), NU);
toets('benzine Euro 1: overal (zones gelden alleen voor diesel)', benz.ernst === 'groen' && benz.rijen.length === 0);
const onb = K.zones({ voertuigsoort: 'Personenauto' }, bs(['Diesel']), NU);
toets('diesel met onbekende klasse: nooit "mag"', onb.rijen.every((r) => r.mag === null) && onb.ernst === null);
const oldtimer = K.zones(pa('19840101'), bs(['Diesel'], { emissiecode_omschrijving: '0' }), NU);
toets('diesel van 40+ jaar: vrijgesteld', oldtimer.ernst === 'groen' && /oldtimer/.test(oldtimer.kop));
const bijna = K.zones(pa('19861101'), bs(['Diesel'], { emissiecode_omschrijving: '0' }), NU);
toets('diesel van 39 jaar en 11 maanden: nog niet vrijgesteld', bijna.ernst === 'rood', bijna.kop);
const bestel = K.zones({ voertuigsoort: 'Bedrijfsauto', datum_eerste_toelating: '20180101' }, bs(['Diesel']), NU);
toets('een diesel bestelauto krijgt de zero-emissieregel', bestel.ernst === 'oranje' && /zero-emissie/.test(bestel.kop));

console.log('\n3. Kosten per maand');
const mb = K.mrb(pa('20180101', 1100), bs(['Benzine']));
toets('benzine 1.100 kg rijklaar: het anker van de Belastingdienst (€ 126 per kwartaal)', Math.round(mb.kwartaal) === 126, mb.kwartaal);
const md = K.mrb(pa('20180101', 1100), bs(['Diesel']));
toets('diesel kost meer dan benzine bij hetzelfde gewicht', md.kwartaal > mb.kwartaal);
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
toets('drie blokken: zones, kosten, adapter', /data-plw="zones"/.test(html) && /data-plw="kosten"/.test(html) && /data-plw="adapter"/.test(html));
toets('geen undefined, NaN of null in beeld', !/undefined|NaN|>null</.test(html));
const leeg = s.PLWijzer.blokken({}, []);
toets('een lege RDW-rij geeft ook geen undefined of NaN', !/undefined|NaN/.test(leeg));

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
