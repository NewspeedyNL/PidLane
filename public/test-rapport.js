// ══════════════════════════════════════════════════════════════════
// test-rapport.js — het analyserapport: vaste opbouw, cijfers van de app (07-10-2026)
// ──────────────────────────────────────────────────────────────────
// Draait de échte pidlane-rapport.js op een meting die door de échte
// verzamel- en samenhangmodules gaat (pidlane-data.js, assessPidQuality,
// pidlane-onderzoek.js, pidlane-samenhang.js, pidlane-verzamel.js). Geen
// eigen grenzen: koelwater van 112 °C is afwijkend omdat ALL_PID_DEFS het
// zegt, en de grafiek trekt de alarmlijn waar die definitie hem legt.
//
//   A. wat de AI levert: het <rapport>-blok, en zonder blok de koppen
//   B. de vaste opbouw: acht hoofdstukken en twee bijlagen, altijd
//   C. de cijfers komen van de app: stoplicht, opvallend, bijlage A
//   D. leeg is niet goed: niet gemeten blijft grijs, nergens groen
//   E. de grafiek: grenzen, toestanden, en wat er niet in hoort
//   F. de PDF: volgorde, voorblad, voettekst, logo, binnen de pagina
//   G. de bedrading: de PDF-knop, de prompts en het scherm
//
// Draaien vanuit public/:  node test-rapport.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
const dir = __dirname;

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

// ── de app, zo echt als het zonder DOM kan ────────────────────────
const s = { console: { log() {}, warn() {}, error() {} } };
s.window = s; s.globalThis = s;
s.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() {} }), addEventListener() {}, head: { appendChild() {} }, body: { appendChild() {} } };
s.addEventListener = () => {}; s.navigator = {};
s.setTimeout = (fn) => { fn(); return 0; }; s.setInterval = () => 0; s.clearTimeout = () => {}; s.clearInterval = () => {};
vm.createContext(s);
['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-onderzoek.js', 'pidlane-samenhang.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(dir + '/' + f, 'utf8'), s, { filename: f }));
const kw = fs.readFileSync(dir + '/pidlane-kwaliteit.js', 'utf8');
const van = kw.indexOf('function assessPidQuality');
const tot = kw.indexOf('\nfunction ', van + 10);
if (van < 0) { console.log('  FOUT  assessPidQuality niet gevonden in pidlane-kwaliteit.js'); process.exit(1); }
vm.runInContext('function fv(x){ return String(Math.round(x*10)/10); }\n' + kw.slice(van, tot), s, { filename: 'pidlane-kwaliteit.js' });
const disc = kw.match(/const RAPPORT_DISCLAIMER='([^']+)'/);
s.getPidDef = (pid) => s.ALL_PID_DEFS[pid] || null;
s.pidHist = {};
['pidlane-rapport.js', 'pidlane-verzamel.js'].forEach((f) => vm.runInContext(fs.readFileSync(dir + '/' + f, 'utf8'), s, { filename: f }));
const R = s.PLRapport, V = s.PLVerzamel, S = s.PLSamenhang, O = s.PLOnderzoek;
if (!R || !R.model || !V || !S || !O) { console.log('  FOUT  PLRapport, PLVerzamel of PLSamenhang niet geladen'); process.exit(1); }

// ── een meting: koude start, warm stationair, rijden; koelwater loopt op tot 112 °C ──
function rit() {
  const h = {}, t0 = 1785600000000;
  const stuk = [
    { sec: 40, v: { '010C': 900, '010D': 0, '0105': (u) => 60 + u * 25, '0104': 25, '0106': 1, '0107': 2, '0110': 3, '0103': 2 } },
    { sec: 60, v: { '010C': 800, '010D': 0, '0105': (u) => 88 + u * 6, '0104': 22, '0106': 1, '0107': 2, '0110': 2.8, '0103': 2 } },
    { sec: 80, v: { '010C': 2200, '010D': 60, '0105': (u) => 96 + u * 16, '0104': 45, '0106': 0, '0107': 3, '0110': 12, '0103': 2 } }
  ];
  let start = t0;
  stuk.forEach((st) => {
    Object.keys(st.v).forEach((pid) => {
      for (let t = 0; t < st.sec * 1000; t += 1000) {
        const d = st.v[pid]; const w = typeof d === 'function' ? d(t / (st.sec * 1000)) : d;
        (h[pid] || (h[pid] = [])).push({ t: start + t, v: w });
      }
    });
    start += st.sec * 1000;
  });
  return h;
}
const hist = rit();
const PIDS = ['010C', '010D', '0105', '0104', '0106', '0107', '0110', '0142'];   // 0142 levert niets
const bron = { hist, def: s.getPidDef, letOp: s.PID_LET_OP || {}, kwal: s.assessPidQuality };
const sam = V.metSamenhang(V.samenvatting(PIDS, bron), hist);
const meting = { sam, sec: 180, rijSec: 80, beperkt: '', bron: null, hist, watVoor: 'de AI-monteur', klacht: 'temperatuurmeter loopt op in de file', eisNaam: 'stilstaande meting', ts: Date.now() };

const BLOK = '<rapport>{"probleem":"De temperatuur loopt op.","aanpak":"Eerst warm stationair, dan rijdend gelezen.",' +
  '"hypothesen":[{"naam":"Thermostaat blijft dicht","uitkomst":"waarschijnlijk","voor":["koelwater 112 °C rijdend"],"tegen":[]},' +
  '{"naam":"Koelvloeistof te laag","uitkomst":"zeker niet","voor":[],"tegen":["stationair stabiel 94 °C"]}],' +
  '"conclusie":"De motor wordt rijdend te warm. Dat wijst eerder op de koeling dan op een sensor. Laat het nakijken.",' +
  '"advies":[{"wat":"Thermostaat laten testen","urgentie":"binnenkort"},{"wat":"Niet lang doorrijden in de file","urgentie":"nu meteen"}],' +
  '"nameten":["koelwatertemperatuur met een tweede thermometer"],"oordeel":"oranje"}</rapport>';
const AI_TEKST = 'SAMENVATTING\nDe motor wordt warm.\n\nBEVINDINGEN\n- koelwater 112 °C\n\n' + BLOK + '\n\n' + (disc ? disc[1] : 'disclaimer');

const ctx = (o) => Object.assign({ ts: 1785600200000, voertuig: { merk: 'Mazda', model: 'CX-5', year: 2018, brandstof: 'benzine', vin: 'JMZKF6W7600766507' },
  garage: { kmstand: 123456, apk_tot: '2027-03-01' }, kenteken: 'AB-123-C', recall: null,
  dtc: { gelezen: true, bevestigd: [], pending: [], permanent: [] }, readiness: { ondersteund: 5, nietKlaar: ['Katalysator'], mil: false },
  meting, def: s.getPidDef, S, grens: O.cfg.grens, ai: { text: AI_TEKST }, verdict: null, disclaimer: disc ? disc[1] : '' }, o || {});
const sectie = (m, nr) => m.secties.find((x) => x.nr === nr);
const blokken = (m, nr, soort) => sectie(m, nr).blokken.filter((b) => b.soort === soort);

console.log('A. Wat de AI levert');
{
  const a = R.leesAI(AI_TEKST);
  toets('het blok wordt gelezen', a.velden.bron === 'blok' && a.velden.hypothesen.length === 2 && !a.fout, a.fout);
  toets('een onbekende uitkomst wordt "open", niet overgenomen', a.velden.hypothesen[1].uitkomst === 'open', a.velden.hypothesen[1].uitkomst);
  toets('een onbekende urgentie wordt leeg, niet overgenomen', a.velden.advies[1].urgentie === null && a.velden.advies[0].urgentie === 'binnenkort');
  toets('de leesbare tekst heeft het blok niet meer, wel de disclaimer', a.rest.indexOf('<rapport>') < 0 && a.rest.indexOf('"hypothesen"') < 0 && /mogelijke meetfout|disclaimer/.test(a.rest));
  const geen = R.leesAI('SAMENVATTING\nAlles rustig.\n\nWAARSCHIJNLIJKE OORZAAK\nDe thermostaat.\n| Diagnose | Kans |\n\nAANBEVOLEN VERVOLGONDERZOEK\n- thermostaat meten\n- koelvloeistof peilen\n\nKOSTENINDICATIE\n- 100 euro');
  toets('TEGENPROEF zonder blok: conclusie en advies uit de koppen', geen.velden.bron === 'tekst' && /thermostaat/i.test(geen.velden.conclusie) && geen.velden.advies.length === 2,
    JSON.stringify(geen.velden));
  toets('… een tabelregel is geen conclusie, en de kosten zijn geen advies', geen.velden.conclusie.indexOf('|') < 0 && !geen.velden.advies.some((x) => /euro/.test(x.wat)));
  const kapot = R.leesAI('tekst\n<rapport>{"conclusie": "half</rapport>');
  toets('ongeldige JSON: een melding, en terug naar de koppen', kapot.velden.bron === 'tekst' && /geen geldige JSON/.test(kapot.fout), kapot.fout);
  const af = 'Analyse.\n<rapport>{"conclusie":"afgebr\n\nLet op: Deze analyse … mogelijke meetfout.';
  toets('een afgebroken blok: gemeld, en de disclaimer erachter blijft staan', /afgebroken/.test(R.leesAI(af).fout) && /mogelijke meetfout/.test(R.zonderBlok(af)), R.zonderBlok(af));
  const ins = R.instructie();
  toets('de instructie vraagt precies de velden die het model leest', ['<rapport>', '"probleem"', '"aanpak"', '"hypothesen"', '"voor"', '"tegen"', '"conclusie"', '"advies"', '"urgentie"', '"nameten"', '"oordeel"'].every((k) => ins.indexOf(k) >= 0));
  toets('… en verbiedt prijzen en verzonnen getallen in het blok', /geen prijzen/.test(ins) && /geen getallen die niet in de data staan/.test(ins));
}

console.log('\nB. De vaste opbouw');
{
  const m = R.model(ctx());
  const titels = m.secties.map((x) => x.titel);
  toets('acht hoofdstukken in de volgorde van het onderzoek', JSON.stringify(titels) === JSON.stringify(['Autokennis', 'Probleemstelling', 'Staat van het voertuig',
    'Plan van aanpak en testplan', 'Uitvoering en metingen', 'Hypothesen en bewijs', 'Conclusie en aanbevelingen', 'Disclaimer en grenzen van deze meting']), titels.join(' | '));
  toets('twee bijlagen: meetdata en de volledige AI-tekst', m.bijlagen.length === 2 && /Meetdata/.test(m.bijlagen[0].titel) && /AI/.test(m.bijlagen[1].titel));
  const kaal = R.model({});
  toets('ook zonder meting, AI of auto: dezelfde acht hoofdstukken', kaal.secties.length === 8 && kaal.secties.map((x) => x.titel).join() === titels.join());
  toets('… en die zeggen "niet gemeten" in plaats van leeg te zijn', kaal.secties.every((x) => x.blokken.length > 0) && blokken(kaal, 5, 'leeg').length === 1);
  toets('voorblad "In het kort": kleur en zin van de AI', m.voorblad.kort.kleur === 'oranje' && /te warm/.test(m.voorblad.kort.tekst));
  toets('de klacht staat in de probleemstelling', JSON.stringify(sectie(m, 2)).indexOf('temperatuurmeter loopt op') >= 0);
  toets('de hypothesen van de AI staan bij het bewijs', blokken(m, 6, 'bewijs').some((b) => b.items.some((x) => x.naam === 'Thermostaat blijft dicht' && x.voor.length === 1)));
  toets('advies met urgentie, en de urgentie heeft een kleur', blokken(m, 7, 'tabel')[0].rijen[0].kleur === 'oranje');
  toets('de disclaimer van de app staat in hoofdstuk 8', JSON.stringify(sectie(m, 8)).indexOf('mogelijke meetfout') >= 0);
  toets('nergens "anoniem" (het VIN is gepseudonimiseerd, niet anoniem)', !/anoniem/i.test(JSON.stringify(m)));
}

console.log('\nC. De cijfers komen van de app');
{
  const m = R.model(ctx());
  const opv = blokken(m, 5, 'tabel').find((b) => b.titel === 'Wat opviel');
  const kw = opv && opv.rijen.find((r) => /Koelwater/.test(r.cellen[0]));
  toets('koelwater 112 °C staat bij wat opviel, als afwijkend', kw && kw.cellen[2] === 'afwijkend' && kw.kleur === 'rood', JSON.stringify(opv && opv.rijen));
  toets('… en alleen wat opviel: geen sensor die normaal is', opv && opv.rijen.every((r) => r.cellen[2] !== 'normaal'), JSON.stringify(opv && opv.rijen.map((r) => r.cellen[2])));
  toets('… met het bereik uit de meting, niet uit de AI-tekst', kw && /60 – 11\d/.test(kw.cellen[1]), kw && kw.cellen[1]);
  const st = blokken(m, 3, 'stoplicht')[0];
  const koel = st.items.find((x) => x.naam === 'Koeling en temperaturen');
  toets('stoplicht per systeem: koeling rood', koel && koel.kleur === 'rood', JSON.stringify(st.items));
  const a = m.bijlagen[0].blokken[0];
  toets('bijlage A: elke gevraagde sensor een regel', a.rijen.length === PIDS.length, a.rijen.length + ' van ' + PIDS.length);
  toets('het testplan komt uit de samenhang: uitgevoerd én niet uitgevoerd met reden',
    blokken(m, 4, 'tabel')[0].rijen.some((r) => r.cellen[1] === 'uitgevoerd') && blokken(m, 4, 'tabel')[0].rijen.some((r) => r.cellen[1] === 'niet uitgevoerd' && r.cellen[2]));
  const tst = blokken(m, 5, 'tabel').find((b) => /Toestanden/.test(b.titel));
  toets('de toestanden van de motor met hun duur', tst && tst.rijen.some((r) => r.cellen[0] === S.NAAM.stationair_warm), JSON.stringify(tst && tst.rijen));
  const d = R.model(ctx({ dtc: { gelezen: true, bevestigd: ['P0420'], pending: ['P0171'], permanent: ['P0420'] } }));
  const fc = blokken(d, 3, 'tabel')[0];
  toets('foutcodes: bevestigd rood, in afwachting oranje, een permanente die ook bevestigd is één keer', fc.rijen.length === 2 && fc.rijen[0].kleur === 'rood' && fc.rijen[1].kleur === 'oranje', JSON.stringify(fc.rijen));
  toets('readiness: wat niet klaar is, staat erbij', JSON.stringify(sectie(m, 3)).indexOf('niet klaar: Katalysator') >= 0);
}

console.log('\nD. Leeg is niet goed');
{
  const m = R.model(ctx());
  const el = blokken(m, 3, 'stoplicht')[0].items.find((x) => x.naam === 'Elektrisch systeem');
  toets('een systeem zonder data is grijs, "niet gemeten"', el && el.kleur === 'grijs' && el.tekst === 'niet gemeten', JSON.stringify(el));
  const geenScan = R.model(ctx({ dtc: null, readiness: null }));
  toets('foutcodes niet gelezen: geen groen kader', blokken(geenScan, 3, 'leeg').length === 2 && blokken(geenScan, 3, 'kader').length === 0);
  const zonder = R.model(ctx({ ai: { text: '' }, verdict: null }));
  toets('geen AI en geen stoplicht: voorblad grijs, "Geen oordeel"', zonder.voorblad.kort.kleur === 'grijs' && zonder.voorblad.kort.kop === 'Geen oordeel');
  toets('TEGENPROEF: zonder blok, met het stoplicht van het scherm', R.model(ctx({ ai: { text: 'SAMENVATTING\nPrima.' }, verdict: 'groen' })).voorblad.kort.kleur === 'groen');
  toets('wat niet beoordeeld is, staat in hoofdstuk 8', blokken(m, 8, 'lijst').length === 1 && blokken(m, 8, 'lijst')[0].items.some((x) => /Geen data van: .*Accu|Geen data van/.test(x)));
}

console.log('\nE. De grafiek');
{
  const m = R.model(ctx());
  const gr = blokken(m, 5, 'grafiek').map((b) => b.g);
  toets('grafieken, hoogstens ' + R.MAX_GRAFIEK, gr.length > 0 && gr.length <= R.MAX_GRAFIEK, String(gr.length));
  toets('de opvallende sensor eerst', gr[0].pid === '0105', gr.map((g) => g.pid).join());
  const al = gr[0].grenzen.find((g) => g.soort === 'alarm');
  toets('de alarmgrens uit de definitie (dH ' + s.ALL_PID_DEFS['0105'].dH + ')', al && al.waarde === s.ALL_PID_DEFS['0105'].dH, JSON.stringify(gr[0].grenzen));
  toets('de toestanden als banden: koud, warm stationair en rijden', ['stationair_koud', 'stationair_warm', 'rijden_warm'].every((t) => gr[0].banden.some((b) => b.toestand === t)),
    gr[0].banden.map((b) => b.toestand).join());
  toets('alle punten binnen het kader (0…1)', gr.every((g) => g.punten.every((p) => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)));
  const ver = R.grafiekData({ '0105': [20, 22, 25, 30].map((v, i) => ({ t: i * 1000, v })) }, '0105', s.ALL_PID_DEFS['0105'], null);
  toets('een grens ver buiten de meting drukt de lijn niet plat', ver.grenzen.length === 0 && ver.yhi < 40, JSON.stringify(ver.grenzen) + ' yhi ' + ver.yhi);
  toets('te weinig punten: geen grafiek', R.grafiekData({ '0105': [{ t: 0, v: 1 }, { t: 1, v: 2 }] }, '0105', {}, null) === null);
  const lang = R.grafiekData({ x: Array.from({ length: 2000 }, (_, i) => ({ t: i * 100, v: Math.sin(i) })) }, 'x', {}, null);
  toets('een lange reeks wordt uitgedund', lang.punten.length <= 301, String(lang.punten.length));
}

console.log('\nF. De PDF');
function nepPdf() {
  const log = [];
  let pagina = 1, paginas = 1;
  function Doc() {}
  const breed = (t) => String(t).length * 1.8;
  Object.assign(Doc.prototype, {
    setFillColor() {}, setDrawColor() {}, setTextColor() {}, setLineWidth() {}, setFont() {}, setFontSize() {}, setLineDashPattern() {},
    rect() {}, roundedRect() {}, circle() {}, line() {},
    addImage() { log.push({ soort: 'logo', pagina }); },
    addPage() { paginas++; pagina = paginas; },
    setPage(i) { pagina = i; }, getNumberOfPages() { return paginas; },
    getTextWidth: breed,
    splitTextToSize(t, w) { const uit = []; let r = ''; String(t).split(' ').forEach((wd) => { if (breed(r + ' ' + wd) > w && r) { uit.push(r); r = wd; } else r = r ? r + ' ' + wd : wd; }); if (r) uit.push(r); return uit.length ? uit : ['']; },
    text(t, x, y) { [].concat(t).forEach((r, i) => log.push({ soort: 'tekst', t: String(r), x, y: y + i * 4, pagina })); },
    output() { return 'blob'; }
  });
  return { Doc, log, paginas: () => paginas };
}
{
  const p = nepPdf();
  R.pdf(R.model(ctx()), p.Doc, { logo: 'data:image/png;base64,AAAA' });
  const teksten = p.log.filter((x) => x.soort === 'tekst');
  const alle = teksten.map((x) => x.t).join('\n');
  toets('voorblad: ANALYSERAPPORT, IN HET KORT en het voertuig', ['ANALYSERAPPORT', 'IN HET KORT', 'Mazda CX-5'].every((k) => teksten.some((x) => x.pagina === 1 && x.t.indexOf(k) >= 0)));
  const volgorde = R.model(ctx()).secties.map((x) => x.nr + '. ' + x.titel);
  const plek = volgorde.map((k) => teksten.findIndex((x) => x.pagina > 1 && x.t === k));
  toets('de hoofdstukken in de PDF, in hun volgorde', plek.every((x, i) => x > 0 && (!i || x > plek[i - 1])), JSON.stringify(plek));
  const N = p.paginas();
  toets('elke pagina een voettekst met paginanummer en pidlane.nl', Array.from({ length: N }, (_, i) => i + 1).every((pg) =>
    teksten.some((x) => x.pagina === pg && x.t === 'Pagina ' + pg + ' van ' + N) && teksten.some((x) => x.pagina === pg && /pidlane\.nl/.test(x.t))), N + ' pagina\'s');
  toets('het logo staat op het voorblad', p.log.some((x) => x.soort === 'logo' && x.pagina === 1));
  toets('"Over PidLane" staat erin', alle.indexOf('OVER PIDLANE') >= 0);
  const voet = (x) => x.y === 290;
  toets('niets loopt in de voettekst of buiten de pagina', teksten.every((x) => voet(x) || (x.y < 284 && x.y >= 0)), JSON.stringify(teksten.filter((x) => !voet(x) && x.y >= 284).slice(0, 3)));
  toets('geen tekens die de PDF-letter niet kent (emoji, pijlen, ▲▼)', !/[\u{1F000}-\u{1FAFF}▲▼→≥≤λ]/u.test(alle));
  const q = nepPdf();
  R.pdf(R.model({}), q.Doc, {});
  toets('TEGENPROEF: zonder logo geen afbeelding, en het rapport komt er toch', !q.log.some((x) => x.soort === 'logo') && q.paginas() >= 3);
}

console.log('\nG. De bedrading');
{
  // Broncode lezen, met reden: dit zijn de aansluitpunten in de app; het
  // gedrag erachter staat hierboven en in bproef-rapport.js (de echte app).
  const lees = (f) => fs.readFileSync(dir + '/' + f, 'utf8');
  const fuel = lees('pidlane-fuel.js');
  toets('de PDF-knop maakt het analyserapport', /async function exportAIReportPDF[\s\S]{0,900}PLRapport\.maak\(jsPDF, window\._lastAIReport\)/.test(fuel));
  toets('de gedeelde trechter (callAI) vraagt het rapportblok', /apiFetch\(prompt\+PLRapport\.instructie\(\),/.test(fuel));
  toets('het scherm toont de tekst zonder blok', /function _aiReportHtml\(text\)\{\s*text=PLRapport\.zonderBlok\(text\);/.test(fuel));
  toets('het rapport neemt de meting van het verzamelscherm mee', /meting:PLRapport\.versMeting\(Date\.now\(\)\)/.test(fuel));
  toets('het archief bewaart de leesbare tekst, en de bron voor de PDF', /const txt=PLRapport\.zonderBlok\(entry\.text\|\|''\)\.trim\(\);/.test(lees('pidlane-archief.js')));
  ['pidlane-rit.js', 'pidlane-caravan.js', 'pidlane-koopcheck.js'].forEach((f) =>
    toets(f + ' vraagt het rapportblok', /PLRapport\.instructie\(\)/.test(lees(f))));
  const html = lees('index.html');
  toets('index.html laadt pidlane-rapport.js', html.indexOf('<script src="pidlane-rapport.js">') > 0);
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van ' + n : 'Alles goed — ' + n + ' controles'));
process.exit(fout ? 1 : 0);
