// ═══════════════════════════════════════════════════════════════════
// test-voorkennis.js — wat de expert bij het verbinden te zien krijgt
// ───────────────────────────────────────────────────────────────────
// PLVoorkennis.bouw() zet foutcodes, mode 06 en merkkennis in één volgorde.
// De vertaling komt uit PLOnderzoek; deze test laadt die échte module en de
// échte AUTO_KENNIS, en knipt autoKennisVoorMerk() uit pidlane-motortype.js.
//
// DE TOETS MOET ONDERSCHEIDEN:
//  - kennis is geen bewijs: dezelfde VW zonder foutcode heeft géén kansen;
//  - kennis duwt wel: dezelfde code op een merk zonder dat zwakke punt
//    scoort lager dan op een merk mét;
//  - een demo- of PDF-rapport gaat niet mee, en een titel nooit met tekst;
//  - markup van de peer bereikt de HTML van de expert niet, gewone
//    inhoud (P0016) blijft staan.
//
// Draaien vanuit public/:  node test-voorkennis.js   (exit 0 = goed)
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); return; }
  fouten++; console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : ''));
}

const s = {};
s.window = s; s.globalThis = s;
s.console = { log() { }, warn() { }, error() { } };
s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() { } }), addEventListener() { }, head: { appendChild() { } }, body: { appendChild() { } } };
s.addEventListener = () => { };
s.navigator = {};
s.setTimeout = (fn) => { fn(); return 0; };
s.setInterval = () => 0; s.clearTimeout = () => { }; s.clearInterval = () => { };
vm.createContext(s);
['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-mode06.js', 'pidlane-onderzoek.js', 'pidlane-voorkennis.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), s, { filename: f }));
const mt = fs.readFileSync(__dirname + '/pidlane-motortype.js', 'utf8');
const ki = mt.indexOf('function autoKennisVoorMerk(merk, brandstof, auto){'), kj = mt.indexOf('\n}\n', ki);
if (ki < 0 || kj < 0) { console.log('FOUT autoKennisVoorMerk() staat niet meer in pidlane-motortype.js'); process.exit(1); }
vm.runInContext(mt.slice(ki, kj + 2), s, { filename: 'autoKennisVoorMerk' });

const VK = s.PLVoorkennis, O = s.PLOnderzoek;
if (!VK || typeof VK.bouw !== 'function') { console.log('FOUT PLVoorkennis.bouw ontbreekt'); process.exit(1); }
const vw = s.autoKennisVoorMerk('Volkswagen', 'Benzine', { cc: 1390, jaar: 2010 });
const kia = { merk: 'kia', zwak: [] };   // merk zonder het zwakke punt
const bouw = (extra) => VK.bouw(Object.assign({ onderzoek: O, dtcInfo: (c) => ({ desc: 'omschrijving ' + c, sev: 'med' }) }, extra));

console.log('\n1. Bewijs plus merkkennis = bovenaan');
{
  const r = bouw({ codes: ['P0016'], kennis: vw });
  toets('P0016 op een 1.4 TSI → distributie bovenaan', r.kansen[0] && r.kansen[0].h === 'distributie', JSON.stringify(r.kansen));
  toets('en gemarkeerd als bekend bij dit merk', r.kansen[0] && r.kansen[0].bekend === true);
  toets('de reden noemt het zwakke punt', r.kansen[0] && r.kansen[0].redenen.some((t) => /ketting/.test(t)), JSON.stringify(r.kansen[0]));
  const k = bouw({ codes: ['P0016'], kennis: kia });
  toets('zelfde code zonder merkkennis scoort lager', k.kansen[0] && r.kansen[0].score > k.kansen[0].score,
    (r.kansen[0] && r.kansen[0].score) + ' vs ' + (k.kansen[0] && k.kansen[0].score));
  toets('en is dan niet "bekend"', k.kansen[0] && k.kansen[0].bekend === false);
}

console.log('\n2. Kennis zonder bewijs is geen kans');
{
  const r = bouw({ codes: [], kennis: vw });
  toets('geen foutcodes → geen kansen', r.kansen.length === 0, JSON.stringify(r.kansen));
  toets('wel de bekende zwakke punten apart', r.bekend.length > 0 && r.bekend.some((b) => /ketting/.test(b.t)), JSON.stringify(r.bekend));
  const metCode = bouw({ codes: ['P0016'], kennis: vw });
  toets('een zwak punt met bewijs staat niet óók onder bekend', !metCode.bekend.some((b) => /ketting-spanner/.test(b.t)), JSON.stringify(metCode.bekend));
}

console.log('\n3. Foutcodes met hun geschiedenis');
{
  const mon = [
    { code: 'P0016', count: 3, eerste: 1760000000000, laatste: 1760000500000, fasen: { stationair: 2 }, temp: { koud: 3 }, ff: { '0C': 820, '05': 12, 'x<y': 9 } },
    { code: 'W:trim', count: 9 }   // geen DTC: hoort er niet in
  ];
  const r = bouw({ codes: ['p0016', 'P0016', 'ONZIN'], mon: mon, kennis: null });
  toets('codes ontdubbeld en genormaliseerd', r.foutcodes.length === 1 && r.foutcodes[0].code === 'P0016', JSON.stringify(r.foutcodes));
  toets('telling en freeze frame uit de rit-monitor', r.foutcodes[0].aantal === 3 && r.foutcodes[0].ff && r.foutcodes[0].ff['0C'] === 820);
  toets('een freeze-framesleutel die geen PID is gaat niet mee', r.foutcodes[0].ff && !('x<y' in r.foutcodes[0].ff));
  toets('een monitorevent zonder DTC gaat niet mee', !r.foutcodes.some((c) => /W:/.test(c.code)));
  const eerder = bouw({ codes: [], mon: mon });
  toets('een code die alleen eerder gezien is staat er als "niet nu"', eerder.foutcodes.length === 1 && eerder.foutcodes[0].nu === false);
}

console.log('\n4. Mode 06');
{
  const res = { tests: [{ mid: 0x21, midNaam: 'Katalysator B1', tidHex: '0x01', geslaagd: false, oordeelZeker: true, krap: false }],
    samenvatting: { tekst: '1 test buiten de fabrieksgrenzen', niveau: 'kritiek' } };
  const r = bouw({ codes: [], m06: res });
  toets('gezakte test in de samenvatting', r.mode06 && r.mode06.gezakt.length === 1 && /Katalysator/.test(r.mode06.gezakt[0]), JSON.stringify(r.mode06));
  toets('en als kans: katalysator', r.kansen.some((k) => k.h === 'kat'), JSON.stringify(r.kansen));
  const ok = bouw({ codes: [], m06: { tests: [Object.assign({}, res.tests[0], { geslaagd: true })] } });
  toets('een geslaagde test maakt geen kans', !ok.kansen.some((k) => k.h === 'kat'), JSON.stringify(ok.kansen));
}

console.log('\n5. Waarnemingen en rapporten');
{
  const wn = [{ wat: 'turbo', naam: 'turbo', status: 'gezien', wanneer: 1760000000000 }, { wat: 'lpg', naam: 'LPG', status: 'onbekend' }];
  const rap = [
    { id: 'sr1_1760000000000', type: 'ai', title: 'Rit-rapport', text: 'GEHEIM-TEKST', ts: new Date(1760000000000) },
    { id: 'sr2_1760000000001', type: 'ai', title: 'demo', text: 'x', demo: true, ts: new Date() },
    { id: 'sr3_1760000000002', type: 'pdf', title: 'pdf', ts: new Date() }
  ];
  const r = bouw({ waarnemingen: wn, rapporten: rap });
  toets('"onbekend" is geen waarneming', r.waargenomen.length === 1 && r.waargenomen[0].naam === 'turbo', JSON.stringify(r.waargenomen));
  toets('demo en PDF gaan niet mee', r.rapporten.length === 1 && r.rapporten[0].id === 'sr1_1760000000000', JSON.stringify(r.rapporten));
  toets('rapporttekst zit niet in de voorkennis', JSON.stringify(r).indexOf('GEHEIM-TEKST') < 0);
  s._sessionReports = rap;
  const een = VK.rapport('sr1_1760000000000');
  toets('rapport(id) geeft de tekst op verzoek', een && een.text === 'GEHEIM-TEKST');
  toets('maar niet van een demorapport', VK.rapport('sr2_1760000000001') === null);
  toets('en niet van een onbekend id', VK.rapport('sr9_1') === null);
}

console.log('\n6. De HTML van de expert neemt geen markup van de peer over');
{
  const NASTY = '<img src=x onerror=alert(1)>';
  const vk = { merk: NASTY, let_op: NASTY,
    kansen: [{ naam: NASTY, score: NASTY, bekend: true, redenen: [NASTY], vervolg: NASTY }],
    bekend: [{ t: NASTY }],
    foutcodes: [{ code: 'P0016', nu: true, desc: NASTY, aantal: NASTY, fasen: [NASTY], temp: [NASTY], ff: { [NASTY]: NASTY, '0C': 820 } }],
    mode06: { tekst: NASTY, gezakt: [NASTY] }, waargenomen: [{ naam: NASTY, status: NASTY }],
    rapporten: [{ id: "x');alert(1);('", title: NASTY }, { id: 'sr1_1760000000000', title: 'Rit-rapport' }] };
  const h = VK.html(vk, { knop: true });
  toets('geen tag uit peer-data', h.indexOf('<img') < 0, h.slice(0, 200));
  toets('gewone inhoud blijft staan (P0016, 0C=820)', h.indexOf('P0016') >= 0 && h.indexOf('0C=820') >= 0);
  toets('een vreemd rapport-id krijgt geen knop', h.indexOf("alert(1);('") < 0);
  toets('een echt rapport-id wel', h.indexOf("PLRemote.reqRapport('sr1_1760000000000')") >= 0);
  toets('lege voorkennis zegt dat', /Nog geen voorkennis/.test(VK.html({})));
  toets('geen voorkennis → geen HTML', VK.html(null) === '');
}

console.log('\n7. Klein genoeg voor de Worker (32 KB voor de hele vstate)');
{
  const veel = []; for (let i = 0; i < 200; i++) veel.push('P0' + String(100 + i));
  const r = bouw({ codes: veel, kennis: vw });
  toets('hoogstens ' + VK.MAX.codes + ' foutcodes', r.foutcodes.length <= VK.MAX.codes, r.foutcodes.length);
  toets('onder 12 KB', JSON.stringify(r).length < 12000, JSON.stringify(r).length + ' tekens');
}

console.log('\n' + (fouten ? fouten + ' FOUT' : 'Alles goed'));
process.exit(fouten ? 1 : 0);
