// test-apk.js — PLApk: de APK-geschiedenis van een kenteken (23-10-2026)
//
// Laadt de echte pidlane-apk.js in een vm. De RDW-antwoorden zijn echt, van één
// kenteken, opgehaald op 23-10-2026 uit sgfe-77wx, a34c-vvps en hx2c-gt7k (het kenteken
// zelf is hier vervangen door het verzonnen TS001X).
// Twee keuringen, en de kentekenplaatverlichting allebei de keren.
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const MELD = [
  { kenteken: 'TS001X', soort_erkenning_keuringsinstantie: 'AL', meld_datum_door_keuringsinstantie: '20251006', meld_tijd_door_keuringsinstantie: '1137', soort_erkenning_omschrijving: 'APK Lichte voertuigen', soort_melding_ki_omschrijving: 'periodieke controle', vervaldatum_keuring: '20261103' },
  { kenteken: 'TS001X', soort_erkenning_keuringsinstantie: 'AL', meld_datum_door_keuringsinstantie: '20261021', meld_tijd_door_keuringsinstantie: '1050', soort_erkenning_omschrijving: 'APK Lichte voertuigen', soort_melding_ki_omschrijving: 'periodieke controle', vervaldatum_keuring: '20271103' }];
const GEBR = [
  { kenteken: 'TS001X', meld_datum_door_keuringsinstantie: '20261021', meld_tijd_door_keuringsinstantie: '1050', gebrek_identificatie: '497', soort_erkenning_omschrijving: 'APK Lichte voertuigen', aantal_gebreken_geconstateerd: '1' },
  { kenteken: 'TS001X', meld_datum_door_keuringsinstantie: '20251006', meld_tijd_door_keuringsinstantie: '1137', gebrek_identificatie: '391', soort_erkenning_omschrijving: 'APK Lichte voertuigen', aantal_gebreken_geconstateerd: '1' },
  { kenteken: 'TS001X', meld_datum_door_keuringsinstantie: '20251006', meld_tijd_door_keuringsinstantie: '1137', gebrek_identificatie: '497', soort_erkenning_omschrijving: 'APK Lichte voertuigen', aantal_gebreken_geconstateerd: '1' }];
const OMS = [
  { gebrek_identificatie: '391', ingangsdatum_gebrek: '20170401', gebrek_artikel_nummer: '5.*.43', gebrek_omschrijving: 'Ruitenwisserinstallatie geeft onvoldoende zicht' },
  { gebrek_identificatie: '497', ingangsdatum_gebrek: '20170401', gebrek_artikel_nummer: '5.*.55', gebrek_omschrijving: 'Kentekenplaatverlichting werkt niet (goed) / ontbreekt' },
  // Ook echt (hx2c-gt7k): een adviespunt.
  { gebrek_identificatie: 'AC1', ingangsdatum_gebrek: '20120509', gebrek_artikel_nummer: 'AC1', gebrek_omschrijving: 'Band(en) aanwezig met een profieldiepte van 1,6 t/m 2,5 mm' }];

const gevraagd = [];
const s = { console: { log() {}, warn() {}, error() {} }, Map, Set, Promise, encodeURIComponent, decodeURIComponent, addEventListener() {},
  plFetch: async (url) => {
    const doel = decodeURIComponent(url.split('url=')[1]); gevraagd.push(doel);
    const body = /sgfe-77wx/.test(doel) ? MELD : /a34c-vvps/.test(doel) ? GEBR : /hx2c-gt7k/.test(doel) ? OMS : [];
    return { ok: true, status: 200, json: async () => body };
  } };
s.window = s; vm.createContext(s);
const BRON = fs.readFileSync(__dirname + '/pidlane-apk.js', 'utf8');
vm.runInContext(BRON, s, { filename: 'pidlane-apk.js' });
const A = s.PLApk;
if (!A) { console.log('FOUT: PLApk niet geladen'); process.exit(1); }

(async () => {
  console.log('\n1. Echte RDW-regels (kenteken vervangen door TS001X)');
  const r = await A.check('ts-001-x');
  toets('twee keuringen, nieuwste eerst', r.keuringen.length === 2 && r.keuringen[0].datum === '20261021', JSON.stringify(r.keuringen.map((k) => k.datum)));
  toets('2026: één gebrek, de kentekenplaatverlichting', r.keuringen[0].gebreken.length === 1 && /Kentekenplaatverlichting/.test(r.keuringen[0].gebreken[0].omschrijving));
  toets('2025: ruitenwisser en kentekenplaatverlichting', r.keuringen[1].gebreken.map((g) => g.id).sort().join() === '391,497');
  toets('de nieuwe vervaldatum staat bij de keuring', r.keuringen[0].vervaldatum === '20271103');
  toets('terugkerend: de kentekenplaatverlichting', r.samenvatting.terugkerend.length === 1 && /Kentekenplaat/.test(r.samenvatting.terugkerend[0]), JSON.stringify(r.samenvatting));
  toets('samenvatting zegt het in gewone taal', r.samenvatting.tekst === 'Laatste keuring 21-10-2026: 1 gebrek', r.samenvatting.tekst);
  toets('de omschrijvingen in één vraag, op code', gevraagd.filter((d) => /hx2c-gt7k/.test(d)).length === 1 && /in\('497','391'\)|in\('391','497'\)/.test(decodeURIComponent(gevraagd.find((d) => /hx2c/.test(d)))), gevraagd.find((d) => /hx2c/.test(d)));
  toets('de AI-regel noemt gebrek en herhaling', /Gevonden: Kentekenplaatverlichting/.test(A.naarPromptRegel(r)) && /Terugkerend/.test(A.naarPromptRegel(r)), A.naarPromptRegel(r));
  toets('html toont de geschiedenis, met escaping', /APK-geschiedenis/.test(A.html(r)) && !/<script/.test(A.html({ keuringen: [{ datum: '20260101', gebreken: [{ omschrijving: '<script>', aantal: 1 }] }], samenvatting: { tekst: '', terugkerend: [] } })));

  console.log('\n2. Advies is geen gebrek');
  const adv = A.bouw([{ meld_datum_door_keuringsinstantie: '20260101', meld_tijd_door_keuringsinstantie: '900' }],
    [{ meld_datum_door_keuringsinstantie: '20260101', meld_tijd_door_keuringsinstantie: '900', gebrek_identificatie: 'AC1', aantal_gebreken_geconstateerd: '2' }], OMS);
  toets('AC1 telt als advies, niet als gebrek', adv.samenvatting.gebrekenLaatste === 0 && adv.samenvatting.adviesLaatste === 1, JSON.stringify(adv.samenvatting));
  toets('…en heet "Laatste keuring …: geen gebreken, 1 adviespunt"', /geen gebreken, 1 adviespunt/.test(adv.samenvatting.tekst), adv.samenvatting.tekst);
  toets('een advies dat terugkomt is geen "terugkerend gebrek"', A.bouw(MELD, GEBR.map((g) => Object.assign({}, g, { gebrek_identificatie: 'AC1' })), OMS).samenvatting.terugkerend.length === 0);

  console.log('\n3. Randen');
  toets('geen keuringen: zegt dat', A.bouw([], [], []).samenvatting.tekst === 'Geen APK-keuringen bekend bij het RDW');
  const wees = A.bouw([], [{ meld_datum_door_keuringsinstantie: '20240505', meld_tijd_door_keuringsinstantie: '800', gebrek_identificatie: '391' }], OMS);
  toets('een gebrek zonder melding krijgt toch een keuring', wees.keuringen.length === 1 && wees.keuringen[0].gebreken[0].id === '391');
  toets('onbekende code: de code blijft staan', A.bouw([], [{ meld_datum_door_keuringsinstantie: '20240505', gebrek_identificatie: 'Z99' }], []).keuringen[0].gebreken[0].omschrijving === 'gebrek Z99');
  await A.check('TS001X'); const voor = gevraagd.length; await A.check('TS001X');
  toets('tweede keer uit de cache', gevraagd.length === voor);

  console.log('\n4. TEGENPROEF — koppelen op datum alleen, zonder tijd');
  const los = s.PLApk; vm.runInContext(BRON.replace("String(x.meld_datum_door_keuringsinstantie || '') + '|' + String(x.meld_tijd_door_keuringsinstantie || '')", "'x'"), s);
  toets('dan worden twee keuringen er één', s.PLApk.bouw(MELD, GEBR, OMS).keuringen.length === 1);
  s.PLApk = los;

  console.log('\n5. Te laat gekeurd — twee echte RDW-ritmes (sgfe-77wx, 23-10-2026, zonder kenteken)');
  const pk = (d, v, s) => ({ meld_datum_door_keuringsinstantie: d, vervaldatum_keuring: v, soort_melding_ki_omschrijving: s || 'periodieke controle' });
  const A1 = [pk('20240703', '20250703'), pk('20260901', '20270905'), pk('20250905', '20260905')];
  const A2 = [pk('20241024', '20251108'), pk('20260901', '20270901')];
  toets('64 dagen na 03-07-2025, op 05-09-2025', JSON.stringify(A.teLaat(A1)) === JSON.stringify([{ datum: '20250905', verlopen: '20250703', dagen: 64 }]), JSON.stringify(A.teLaat(A1)));
  toets('297 dagen zonder geldige APK', A.teLaat(A2).length === 1 && A.teLaat(A2)[0].dagen === 297);
  const b2 = A.bouw(A2, [], []);
  toets('meer dan 30 dagen: let op, en de tekst noemt geschorst of buitenland', b2.samenvatting.niveau === 'letop' && /geschorst of in het buitenland/.test(A.html(b2)), b2.samenvatting.niveau);
  toets('de AI-regel zegt het ook', /297 dagen na de vervaldatum/.test(A.naarPromptRegel(b2)), A.naarPromptRegel(b2));
  toets('op tijd (TS001X): niets te laat', A.teLaat(MELD).length === 0);
  toets('een herkeuring op dezelfde dag telt niet als vorige', A.teLaat([pk('20250101', '20260101'), pk('20250101', '20260101'), pk('20251220', '20261220')]).length === 0);
  toets('een paar dagen te laat: info, geen let op', A.bouw([pk('20250101', '20260101'), pk('20260105', '20270105')], [], []).samenvatting.niveau === 'info');
  toets('TEGENPROEF: een tachograafmelding met eigen vervaldatum telt niet mee', A.teLaat([pk('20241201', '20250201', 'manipulatie tacho'), pk('20250301', '20260301')]).length === 0);
  const zonder = new vm.Script(BRON.replace("filter(x => !x.soort_melding_ki_omschrijving || /periodiek/i.test(x.soort_melding_ki_omschrijving))", 'filter(Boolean)'));
  const los2 = s.PLApk; zonder.runInContext(s);
  toets('…want zonder die regel wordt het een gat', s.PLApk.teLaat([pk('20241201', '20250201', 'manipulatie tacho'), pk('20250301', '20260301')]).length === 1);
  s.PLApk = los2;

  console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
  process.exit(fout ? 1 : 0);
})();
