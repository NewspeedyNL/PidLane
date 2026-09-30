// ══════════════════════════════════════════════════════════════════
// test-btlogcap.js — het anker van de BT-log houdt DEZE sessie vast
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (30-09-2026)
// Het logboek van 08:41 sprong in de BT-regels van 08:28:21 naar 08:39:54.
// Verbinden, VIN en de hele SPP-proef van #352 ontbraken. De oorzaak zat in
// twee functies van pidlane-btflow.js die elk apart goed leken:
//
//   restoreBtLog()  zette na een herlaad 300 regels van de vorige sessie
//                   ACHTERAAN in _btLog, na wat de modules al schreven
//   btDiag()        hield bij de cap de EERSTE 300 regels vast als anker
//
// Samen: het anker was het pollverkeer van vóór de herlaad, en alles van de
// huidige sessie rolde er in het midden uit. De markering zei "301 regels
// weggelaten", maar dat was alleen de laatste ronde.
//
// Deze test laadt de echte btLogAfkappen() en restoreBtLog() en speelt een
// herlaad na.
//
// Draaien vanuit public/:  node test-btlogcap.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(__dirname + '/pidlane-btflow.js', 'utf8');
function knip(van, tot) {
  const a = bron.indexOf(van);
  if (a < 0) { console.log('  FOUT anker niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.log('  FOUT eindanker niet gevonden na: ' + van); process.exit(1); }
  return bron.slice(a, b);
}

const capBron = knip('const BTLOG_CAP=', 'function btDiag(');
const restoreBron = knip('function restoreBtLog(){', "document.addEventListener('DOMContentLoaded', restoreBtLog);");

// Een omgeving met net genoeg DOM en opslag voor restoreBtLog().
function maakOmgeving(opgeslagen) {
  const el = () => ({ style: {}, appendChild() {}, set innerHTML(v) {}, scrollTop: 0, scrollHeight: 0 });
  const document = { getElementById: () => el(), createElement: () => el() };
  const sessionStorage = { getItem: (k) => (k === 'pl_btlog' ? JSON.stringify(opgeslagen) : null) };
  const localStorage = { getItem: () => null };
  const _btLog = [];
  const f = new Function('_btLog', 'document', 'sessionStorage', 'localStorage', 'console',
    capBron + '\n' + restoreBron + '\nreturn { restoreBtLog, btLogAfkappen, stand: _btCapStand, KOP: BTLOG_KOP, STAART: BTLOG_STAART, CAP: BTLOG_CAP };');
  const m = f(_btLog, document, sessionStorage, localStorage, { warn() {} });
  m.log = _btLog;
  return m;
}

let klok = 0;
const regel = (msg) => ({ ts: '08:00:00', t: ++klok, msg, type: 'info' });

// De vorige sessie: 300 regels pollverkeer, zoals _btPersistNow() ze bewaart.
const oud = [];
for (let i = 0; i < 300; i++) oud.push(regel('TX oud ' + i));

// Speel de herlaad van 08:28:36 na: modules schrijven bij het laden, dan komt
// DOMContentLoaded met restoreBtLog(), dan verbinden en tien minuten pollen.
function speelHerlaad(m, afkappen) {
  m.log.push(regel('pidlane-uitgebreid.js geladen'));
  m.log.push(regel('pidlane-sppproef.js geladen'));
  m.restoreBtLog();
  const nieuw = ['SPP verbonden', 'Protocol: A6', 'VIN: …766507', 'SPP-proef: nabootsen — mislukt zoals bedoeld'];
  nieuw.forEach((t) => { m.log.push(regel(t)); afkappen(m); });
  for (let i = 0; i < 5000; i++) { m.log.push(regel('TX nieuw ' + i)); afkappen(m); }
}

console.log('\n1. Na een herlaad staat het begin van déze sessie in het anker');
{
  const m = maakOmgeving(oud);
  speelHerlaad(m, (x) => x.btLogAfkappen(x.log, x.stand, '08:40:00'));
  const tekst = m.log.map((r) => r.msg);
  toets('VIN staat er nog', tekst.includes('VIN: …766507'));
  toets('de SPP-proef staat er nog', tekst.includes('SPP-proef: nabootsen — mislukt zoals bedoeld'));
  toets('de moduleregels staan er nog', tekst.includes('pidlane-sppproef.js geladen'));
  toets('geen regel uit de vorige sessie meer', !m.log.some((r) => r.vorige),
        m.log.filter((r) => r.vorige).length + ' over');
  toets('binnen de cap', m.log.length <= m.CAP, m.log.length + ' regels');
  toets('de staart is het nieuwste', tekst[tekst.length - 1] === 'TX nieuw 4999');
}

console.log('\n2. Er staat precies één markering, en die telt alles');
{
  const m = maakOmgeving(oud);
  speelHerlaad(m, (x) => x.btLogAfkappen(x.log, x.stand, '08:40:00'));
  const cap = m.log.filter((r) => /weggelaten \(geheugen-cap\)/.test(r.msg));
  toets('één markering', cap.length === 1, cap.length + ' gevonden');
  // 2 module + 4 verbinden + 5000 pollen = 5006 eigen regels. Wat er nog
  // staat plus wat de markering telt, moet dat samen zijn.
  const verwacht = 5006 - (m.log.length - 1);
  const n = cap[0] && Number((cap[0].msg.match(/… (\d+) regels/) || [])[1]);
  toets('telt ' + verwacht + ' weggelaten regels', n === verwacht, 'zegt ' + n);
  toets('noemt de 300 uit de vorige sessie apart', cap[0] && /plus 300 uit de sessie van vóór de herlaad/.test(cap[0].msg),
        cap[0] && cap[0].msg);
}

console.log('\n3. Zonder herlaad blijft het anker wat het was');
{
  const m = maakOmgeving([]);
  m.restoreBtLog();
  m.log.push(regel('Protocol: A6'));
  for (let i = 0; i < 3000; i++) { m.log.push(regel('TX ' + i)); m.btLogAfkappen(m.log, m.stand, '08:40:00'); }
  toets('eerste regel is het protocol', m.log[0].msg === 'Protocol: A6', m.log[0].msg);
  toets('de markering staat direct na een kop van 300', /geheugen-cap/.test(m.log[m.KOP].msg), m.log[m.KOP].msg);
  toets('geen "vóór de herlaad" in de markering', !/vóór de herlaad/.test(m.log[m.KOP].msg), m.log[m.KOP].msg);
}

console.log('\n4. TEGENPROEF — de oude cap en de oude restore vallen hier door');
{
  // De oude implementatie, letterlijk: restore achteraan, kop = eerste 300.
  const m = maakOmgeving([]);
  m.log.push(regel('pidlane-sppproef.js geladen'));
  oud.forEach((e) => m.log.push(e));
  const oudeCap = (x) => {
    if (x.log.length > 1400) {
      const kop = x.log.slice(0, 300), staart = x.log.slice(-800);
      const weg = x.log.length - kop.length - staart.length;
      x.log.length = 0;
      x.log.push(...kop, { msg: '… ' + weg + ' regels weggelaten (geheugen-cap) …' }, ...staart);
    }
  };
  ['SPP verbonden', 'VIN: …766507'].forEach((t) => { m.log.push(regel(t)); oudeCap(m); });
  for (let i = 0; i < 5000; i++) { m.log.push(regel('TX nieuw ' + i)); oudeCap(m); }
  const tekst = m.log.map((r) => r.msg);
  toets('de oude vorm verliest de VIN', !tekst.includes('VIN: …766507'));
  toets('en houdt de vorige sessie vast', tekst.includes('TX oud 0'));
  const cap = tekst.find((t) => /geheugen-cap/.test(t));
  toets('en zijn markering telt maar één ronde', /… 301 regels/.test(cap), cap);
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
