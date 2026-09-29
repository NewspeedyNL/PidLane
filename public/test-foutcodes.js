// ══════════════════════════════════════════════════════════════════
// test-foutcodes.js — toetst pidlane-foutcodes.js (PLFoutcodes)
// ──────────────────────────────────────────────────────────────────
// WAT HIER TE BEWIJZEN VALT
//
// Het nieuwe foutcodevenster belooft vier dingen die het oude scherm niet
// waarmaakt, en elk kan stil misgaan:
//
//   1. alle drie de soorten codes, óók multiframe (3+ codes op CAN) —
//      de oude parser las per regel en miste alles na frame 0;
//   2. "niet gelezen" is iets anders dan "geen codes" (#218);
//   3. de keuringsstatus uit 0101, waarbij een bit in D alleen telt als
//      dezelfde monitor in C ondersteund is;
//   4. wissen alleen onder voorwaarden, en het antwoord op 04 wordt
//      GELEZEN: geen antwoord is niet "gewist".
//
// De module wordt geladen met pidlane-data.js ernaast: de parse van 0131,
// 010C en de freeze-frame-PIDs komt uit ALL_PID_DEFS en wordt dus meteen
// meegetoetst. De bus is een nep-ECU; alles erboven is de echte code.
//
// De fouten die deze toetsen rood horen te maken staan in plmutate.sh.
//
// Draaien vanuit public/:  node test-foutcodes.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}
const lijst = (a) => JSON.stringify(a);

function laad(extra) {
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {} }), addEventListener() { }, head: { appendChild() { } }, body: { appendChild() { } } };
  s.addEventListener = () => { };
  s.navigator = {};
  s.setTimeout = (fn) => { fn(); return 0; };       // geen echte pauzes
  s.setInterval = () => 0; s.clearTimeout = () => { }; s.clearInterval = () => { };
  Object.assign(s, extra || {});
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-foutcodes.js', 'utf8'), s, { filename: 'pidlane-foutcodes.js' });
  if (!s.PLFoutcodes) throw new Error('PLFoutcodes niet gevonden — de module hangt niet meer naar buiten');
  return s;
}

function nepEcu(antwoorden) {
  const gestuurd = [];
  const f = async (cmd) => { gestuurd.push(cmd); const a = antwoorden[cmd]; return typeof a === 'function' ? a() : (a == null ? 'NO DATA' : a); };
  f.isCAN = true;
  f.gestuurd = gestuurd;
  return f;
}

(async function () {
  const s = laad();
  const F = s.PLFoutcodes;

  console.log('\n1. Foutcodes lezen');
  eis(lijst(F.parseDtc('43 02 01 71 04 20', '43', true)) === lijst(['P0171', 'P0420']), 'één frame, twee codes');
  const multi = '00A\r0: 43 04 01 71 04\r1: 20 01 33 03 00 00 00\r';
  eis(lijst(F.parseDtc(multi, '43', true)) === lijst(['P0171', 'P0420', 'P0133', 'P0300']),
    'multiframe: vier codes over twee frames', lijst(F.parseDtc(multi, '43', true)));
  eis(lijst(F.parseDtc('7E8 06 43 02 01 71 04 20', '43', true)) === lijst(['P0171', 'P0420']), 'met CAN-header en PCI-byte');
  eis(lijst(F.parseDtc('43 01 71 04 20 00 00', '43', false)) === lijst(['P0171', 'P0420']),
    'K-line: geen telbyte, dus 01 hoort bij de eerste code');
  eis(lijst(F.parseDtc('47 02 41 23 C1 00', '47', true)) === lijst(['C0123', 'U0100']), 'pending, C- en U-codes');
  eis(lijst(F.parseDtc('43 00', '43', true)) === '[]', 'gelezen zonder codes → lege lijst');
  eis(lijst(F.parseDtc('NO DATA', '43', true)) === '[]', 'NO DATA → lege lijst');
  eis(F.parseDtc('', '43', true) === null, 'geen antwoord → null, niet "geen codes"');
  eis(F.parseDtc('CAN ERROR', '43', true) === null, 'CAN ERROR → null');
  eis(F.parseDtc('41 0C 1A F8', '43', true) === null, 'antwoord op iets anders → null');

  console.log('\n2. Keuringsstatus (0101)');
  // A=0x82 MIL aan, 2 codes · B=0x07 continu ondersteund, klaar · C=0x65 kat/EVAP/lambda/verwarming · D=0x04 EVAP niet klaar
  let rd = F.parseReadiness([[0x82, 0x07, 0x65, 0x04]]);
  eis(rd.mil === true && rd.aantal === 2, 'MIL-bit en aantal uit byte A');
  eis(rd.ondersteund === 4, '4 periodieke monitors ondersteund', rd.ondersteund);
  eis(lijst(rd.nietKlaar) === lijst(['Verdampingssysteem (EVAP)']), 'alleen EVAP niet klaar', lijst(rd.nietKlaar));
  eis(rd.brandstof === 'benzine', 'bit 3 van B uit → benzine');
  rd = F.parseReadiness([[0x00, 0x07, 0x01, 0x04]]);
  eis(rd.nietKlaar.length === 0, 'een niet-klaar-bit zonder ondersteuning telt niet', lijst(rd.nietKlaar));
  // Met één ECU maskeert de telling het al; het onderscheid zit bij twee:
  // de motor meldt de kat klaar, een tweede ECU die geen kat heeft zet bit 0
  // in D. Dat bit hoort niets te zeggen.
  rd = F.parseReadiness([[0x00, 0x07, 0x01, 0x00], [0x00, 0x00, 0x00, 0x01]]);
  eis(rd.nietKlaar.length === 0, 'twee ECU\'s: een niet-klaar-bit van een ECU zonder die monitor telt niet', lijst(rd.nietKlaar));
  rd = F.parseReadiness([[0x00, 0x0F, 0x40, 0x40]]);
  eis(rd.brandstof === 'diesel' && lijst(rd.nietKlaar) === lijst(['Roetfilter (DPF)']), 'diesel: bit 6 is het roetfilter', lijst(rd.nietKlaar));
  rd = F.parseReadiness([[0x00, 0x07, 0x01, 0x00], [0x00, 0x00, 0x01, 0x01]]);
  eis(lijst(rd.nietKlaar) === lijst(['Katalysator']), 'twee ECU\'s: één meldt niet klaar → niet klaar');
  eis(F.parseReadiness([]) === null, 'geen antwoord → null');
  let o = F.oordeelReadiness(F.parseReadiness([[0, 0x07, 0x65, 0x65]]), { km: 12, warm: 1 });
  eis(o.niveau === 'let-op' && o.vers === true && /kort geleden gewist/.test(o.tekst), 'alles niet klaar na 12 km: vers gewist');
  o = F.oordeelReadiness(F.parseReadiness([[0, 0x07, 0x65, 0x00]]), { km: 4000 });
  eis(o.niveau === 'ok', 'alles klaar → ok');
  eis(F.oordeelReadiness(null).niveau === 'onbekend', 'niet gelezen → onbekend, geen oordeel');
  o = F.oordeelReadiness(F.parseReadiness([[0, 0x07, 0x65, 0x65]]), { km: 0, warm: 0 }, true);
  eis(/net gewist/.test(o.tekst) && !/weggepoetst/.test(o.tekst), 'na je eigen wissen: geen verdenking van weggepoetste codes');

  console.log('\n3. Het antwoord op 04');
  eis(F.wisUitslag('44').staat === 'bevestigd', '44 → bevestigd');
  eis(F.wisUitslag('7E8 01 44').staat === 'bevestigd', '44 met header en PCI → bevestigd');
  const w = F.wisUitslag('7F 04 22');
  eis(w.staat === 'geweigerd' && w.nrc === '22' && /motor/.test(w.tekst), '7F 04 22 → geweigerd, met de reden', JSON.stringify(w));
  eis(F.wisUitslag('').staat === 'geen-antwoord', 'geen antwoord is NIET gewist');
  eis(F.wisUitslag('NO DATA').staat === 'geen-antwoord', 'NO DATA is NIET gewist');
  eis(F.wisUitslag('?').staat === 'geen-antwoord', '? is NIET gewist');
  eis(F.wisUitslag('7E8 01 44\r7E9 03 7F 04 22').staat === 'deels', 'één ECU wist, de ander weigert → deels');

  console.log('\n4. Wanneer wissen mag');
  const goed = { verbonden: true, rpm: 0, snelheid: 0, scanLeeftijdMs: 1000, codesGelezen: true };
  eis(F.magWissen(goed).mag === true, 'contact aan, motor uit, verse uitlezing → mag');
  eis(F.magWissen(Object.assign({}, goed, { rpm: 820 })).mag === false, 'motor draait → mag niet');
  eis(F.magWissen(Object.assign({}, goed, { snelheid: 30 })).mag === false, 'auto rijdt → mag niet');
  eis(F.magWissen(Object.assign({}, goed, { remote: true })).mag === false, 'op afstand → mag niet');
  eis(F.magWissen(Object.assign({}, goed, { scanLeeftijdMs: null })).mag === false, 'niet uitgelezen → mag niet');
  eis(F.magWissen(Object.assign({}, goed, { scanLeeftijdMs: 10 * 60 * 1000 })).mag === false, 'uitlezing van 10 minuten oud → mag niet');
  eis(F.magWissen(Object.assign({}, goed, { codesGelezen: false })).mag === false, 'codes niet gelezen → mag niet');
  eis(F.magWissen(Object.assign({}, goed, { verbonden: false })).mag === false, 'niet verbonden → mag niet');
  const onb = F.magWissen(Object.assign({}, goed, { rpm: null }));
  eis(onb.mag === true && onb.waarschuwingen.length === 1, 'toerental onbekend → mag, met waarschuwing');

  console.log('\n5. Voor en na');
  const d = F.vergelijk({ bevestigd: ['P0171', 'P0300'], pending: [], permanent: ['P0420'] },
    { bevestigd: ['P0171'], pending: [], permanent: ['P0420'] });
  eis(lijst(d.weg) === lijst(['P0300']), 'weg: P0300', lijst(d.weg));
  eis(lijst(d.terug) === lijst(['P0171']), 'meteen terug: P0171 is nog actief', lijst(d.terug));
  eis(lijst(d.permanent) === lijst(['P0420']), 'permanent blijft staan');

  console.log('\n6. Uitlezen tegen een nep-ECU');
  const ecu = nepEcu({
    '0101': '41 01 82 07 65 04',
    '03': '00A\r0: 43 03 01 71 04\r1: 20 03 00 00 00 00\r',
    '07': '47 01 01 33', '0A': '4A 01 04 20',
    '0131': '41 31 0B B8', '0130': '41 30 FF', '014E': '41 4E 00 3C', '0121': '41 21 00 2A',
    '020200': '42 02 00 01 71', '020500': '42 05 00 7B', '020C00': '42 0C 00 0C 80',
    '010C': '41 0C 00 00', '010D': '41 0D 00'
  });
  const sc = await F.leesUit(ecu);
  eis(lijst(sc.codes.bevestigd) === lijst(['P0171', 'P0420', 'P0300']), 'bevestigd, multiframe', lijst(sc.codes.bevestigd));
  eis(lijst(sc.codes.pending) === lijst(['P0133']) && lijst(sc.codes.permanent) === lijst(['P0420']), 'pending en permanent gelezen');
  eis(sc.sinds.km === 3000 && sc.sinds.warm === 255 && sc.sinds.milKm === 42, 'tellers sinds wissen via ALL_PID_DEFS', JSON.stringify(sc.sinds));
  eis(sc.freeze && sc.freeze.code === 'P0171', 'freeze frame hoort bij P0171');
  eis(sc.freeze && sc.freeze.waarden['0105'] === 83 && sc.freeze.waarden['010C'] === 800,
    'freeze frame: 83 °C, 800 tpm', JSON.stringify(sc.freeze));
  eis(sc.rpm === 0 && sc.snelheid === 0, 'toerental en snelheid gelezen');
  eis(lijst(sc.readiness.nietKlaar) === lijst(['Verdampingssysteem (EVAP)']), 'readiness uit de echte keten');
  const tekst = F.alsTekst(sc);
  eis(/P0171/.test(tekst) && /FREEZE FRAME/.test(tekst) && /niet klaar\] Verdampingssysteem/.test(tekst), 'de bewaartekst draagt codes, freeze frame en monitors');

  const stil = nepEcu({ '03': '', '07': 'NO DATA', '0A': 'NO DATA' });
  const sc2 = await F.leesUit(stil);
  eis(sc2.gelezen.bevestigd === false && sc2.gelezen.pending === true, 'geen antwoord op 03 → "niet gelezen", niet "geen codes"');
  eis(F.magWissen({ verbonden: true, rpm: 0, scanLeeftijdMs: 1, codesGelezen: sc2.gelezen.bevestigd }).mag === false,
    'en dan gaat de wisknop niet aan');
  eis(!stil.gestuurd.some((c) => /^02/.test(c)), 'zonder codes geen freeze-frame-verkeer');

  console.log('\n7. Wissen: het antwoord telt');
  eis((await F.wis(nepEcu({ '04': '44' }))).staat === 'bevestigd', '44 → bevestigd');
  eis((await F.wis(nepEcu({ '04': '7F 04 22' }))).staat === 'geweigerd', '7F 04 22 → geweigerd');
  eis((await F.wis(nepEcu({ '04': '' }))).staat === 'geen-antwoord', 'stilte → onbekend');

  console.log('\n8. De wisknop verstuurt niets als het niet mag');
  async function probeer(scanRpm, nuRpm) {
    const gestuurd = [];
    const t = laad({
      connected: true, demoMode: false,
      sendCmd: async (cmd) => { gestuurd.push(cmd); return cmd === '010C' ? nuRpm : cmd === '04' ? '44' : 'NO DATA'; },
      withBus: async (n, fn) => fn()
    });
    const st = t.PLFoutcodes.staat();
    st.scan = { tijd: Date.now(), codes: { bevestigd: ['P0171'], pending: [], permanent: [] }, gelezen: { bevestigd: true }, sinds: {}, rpm: scanRpm, snelheid: 0 };
    st.akkoord = true;
    await t.PLFoutcodes.voerWisUit();
    return { gestuurd, st };
  }
  let p = await probeer(900, '41 0C 0E 10');
  eis(p.gestuurd.indexOf('04') < 0, 'motor draaide bij de uitlezing → geen 04', lijst(p.gestuurd));
  p = await probeer(0, '41 0C 0E 10');
  eis(p.gestuurd.indexOf('04') < 0 && p.st.uitslag && p.st.uitslag.staat === 'geblokkeerd',
    'motor draait op het moment van wissen → geen 04', lijst(p.gestuurd));
  p = await probeer(0, '41 0C 00 00');
  eis(p.gestuurd.indexOf('04') >= 0 && p.st.uitslag.staat === 'bevestigd', 'motor uit → 04 verstuurd en bevestigd');
  eis(p.gestuurd.lastIndexOf('03') > p.gestuurd.indexOf('04'), 'na het wissen wordt opnieuw uitgelezen');

  console.log('\n9. Demomodus: een hele ronde');
  const demo = F.demoStuur();
  const v1 = await F.leesUit(demo);
  eis(v1.codes.bevestigd.length === 2 && v1.freeze && v1.freeze.code === 'P0171', 'demo vóór: twee codes en een freeze frame');
  eis((await F.wis(demo)).staat === 'bevestigd', 'demo: wissen bevestigd');
  const v2 = await F.leesUit(demo);
  eis(v2.codes.bevestigd.length === 0 && lijst(v2.codes.permanent) === lijst(['P0420']), 'demo na: bevestigd leeg, permanent blijft');
  eis(v2.readiness.nietKlaar.length === 4 && v2.sinds.km === 0, 'demo na: alle monitors niet klaar, teller op 0');

  // Het stoplicht bovenaan Check mijn auto (29-09-2026). Toetst op echte
  // uitlezingen uit de demo-ECU, niet op een zelfgebouwd object: dan loopt de
  // vorm van de scan en die van het oordeel niet stil uit elkaar.
  console.log('\n10. Het stoplicht van Check mijn auto');
  eis(F.stoplicht(v1).kleur === 'rood', 'bevestigde codes → rood', F.stoplicht(v1).kop);
  eis(/2 storingen/.test(F.stoplicht(v1).kop), 'rood noemt het aantal', F.stoplicht(v1).kop);
  eis(F.stoplicht(v2).kleur === 'rood', 'alleen een permanente code over → nog steeds rood');
  const schoon = JSON.parse(JSON.stringify(v2));
  schoon.codes.permanent = []; schoon.readiness.nietKlaar = []; schoon.readiness.mil = false;
  eis(F.stoplicht(schoon).kleur === 'groen', 'niets gevonden en alles klaar → groen', F.stoplicht(schoon).tekst);
  const wacht = JSON.parse(JSON.stringify(schoon)); wacht.codes.pending = ['P0133'];
  eis(F.stoplicht(wacht).kleur === 'oranje' && /nog moet bevestigen/.test(F.stoplicht(wacht).tekst), 'één code in afwachting → oranje, en dat staat erbij');
  const halfKlaar = JSON.parse(JSON.stringify(v2)); halfKlaar.codes.permanent = []; halfKlaar.readiness.mil = false;
  eis(F.stoplicht(halfKlaar).kleur === 'oranje' && /4 zelftests/.test(F.stoplicht(halfKlaar).tekst), 'net gewist: zelftests niet klaar → oranje, niet groen');
  const blind = JSON.parse(JSON.stringify(schoon)); blind.gelezen.pending = false;
  eis(F.stoplicht(blind).kleur === 'oranje', 'een soort code niet gelezen → nooit groen  <- "niet gelezen" is geen "geen codes"');
  const lamp = JSON.parse(JSON.stringify(schoon)); lamp.readiness.mil = true;
  eis(F.stoplicht(lamp).kleur === 'rood' && /motorlampje/.test(F.stoplicht(lamp).kop), 'motorlampje aan zonder gelezen code → rood');
  eis(F.stoplicht(null).kleur === 'grijs', 'nog niets uitgelezen → grijs, geen oordeel');

  console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('FOUT test liep niet af: ' + (e && e.stack || e)); process.exit(1); });
