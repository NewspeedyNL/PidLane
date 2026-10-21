// ══════════════════════════════════════════════════════════════════
// test-aankooprapport.js — het aankooprapport voor occasionkopers (21-10-2026)
// ──────────────────────────────────────────────────────────────────
// Draait de échte pidlane-aankooprapport.js, en voor de PDF de échte
// pidlane-rapport.js met een nep-jsPDF.
//
//   A. invoercheck: wat ontbreekt, en of er dan nog een oordeel mag komen
//   B. vers gewist: de grens, en wat het met permanente codes en zelftests doet
//   C. foutcodes, lampje, zelftests, mode 06
//   D. kilometerstand en RDW-papieren
//   E. eindoordeel en vragen aan de verkoper
//   F. AI: alleen woorden, nooit de kleur
//   G. disclaimer en privacy (geen VIN, geen locatie van het toestel)
//   H. de PDF en de bedrading
//
// Draaien vanuit public/:  node test-aankooprapport.js   (exit 0 = goed)
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

const waarschuwingen = [];
const s = { console: { log() {}, warn(m) { waarschuwingen.push(String(m)); }, error() {} } };
s.window = s; s.globalThis = s;
s.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
s.navigator = {};
vm.createContext(s);
for (const f of ['pidlane-rapport.js', 'pidlane-aankooprapport.js'])
  vm.runInContext(fs.readFileSync(dir + '/' + f, 'utf8'), s, { filename: f });
const A = s.PLAankoop;
toets('PLAankoop geladen', !!A && typeof A.model === 'function');
if (!A) { console.log('\nPLAankoop ontbreekt — verder toetsen heeft geen zin'); process.exit(1); }

const TS = Date.UTC(2026, 9, 21, 12, 0);   // 21-10-2026
const VIN = 'WVWZZZ1JZXW000001';
const RDW = { kenteken: 'R054XD', merk: 'MAZDA', handelsbenaming: 'CX-5', datum_eerste_toelating: '20180315',
  vervaldatum_apk: '20270301', tellerstandoordeel: 'Logisch', openstaande_terugroepactie_indicator: 'Nee',
  wam_verzekerd: 'Ja', export_indicator: 'Nee', tenaamstellen_mogelijk: 'Ja' };
// Een complete, schone meting. Elke toets hieronder verandert één ding.
function schoon(extra) {
  const basis = {
    kenteken: 'R0-54-XD', ts: TS, rdw: Object.assign({}, RDW), recall: { niveau: 'ok', tekst: 'Geen terugroepacties bekend' },
    opgegevenKm: 98000, km: { niveau: 'ok', tekst: 'Bevestigd door 3 stuurapparaten: 98.010', km: 98010, vin: { niveau: 'ok' } },
    plaats: '  Utrecht,   Croeselaan  ',
    obd: { verbonden: true, vin: VIN, dtc: { actief: [], pending: [], permanent: [] },
      readiness: { mil: false, dtcCount: 0, monitors: [{ monitor: 'Misfire', gereed: true }, { monitor: 'Katalysator', gereed: true }, { monitor: 'EVAP', gereed: true }], nietGereed: [] },
      mode06: { niveau: 'ok', tekst: '24 monitortests gelezen, alles binnen de grenzen' },
      calid: 'PE01188K1', cvn: ['1A2B3C4D'], kmSindsWissen: 8400, warmupsSindsWissen: 180, kmMetMil: 0, odoKm: 98010 }
  };
  const uit = JSON.parse(JSON.stringify(basis));
  if (extra) extra(uit);
  return uit;
}
const sig = (inv, id) => A.signalen(inv).find(x => x.id === id);
const kleur = (inv, id) => (sig(inv, id) || {}).kleur;

console.log('\nA. Invoercheck');
{
  const leeg = A.invoerCheck({});
  toets('leeg: geen oordeel mogelijk', !leeg.kanOordelen);
  toets('leeg: noemt kenteken, RDW, adapter, foutcodes, zelftests en tijd', ['Kenteken', 'RDW-gegevens', 'Adapter verbonden', 'Foutcodes (actief, pending, permanent)', 'Gereedheidstests (readiness)', 'Datum en tijd']
    .every(k => leeg.missend.indexOf(k) >= 0), JSON.stringify(leeg.missend));
  const vol = A.invoerCheck(schoon());
  toets('compleet: oordeel mogelijk en elke rij ok', vol.kanOordelen && vol.rijen.every(r => r.staat === 'ok'), JSON.stringify(vol.rijen.filter(r => r.staat !== 'ok')));
  const deels = A.invoerCheck(schoon(v => { v.obd.dtc.pending = null; }));
  const dtc = deels.rijen.find(r => r.sleutel === 'dtc');
  toets('pending niet gelezen: foutcodes "deels", met de reden', dtc.staat === 'deels' && /pending/.test(dtc.reden));
  toets('pending niet gelezen: deels blokkeert het oordeel', !deels.kanOordelen);
  const geenPlaats = A.invoerCheck(schoon(v => { delete v.plaats; }));
  toets('geen plaats: mag, maar staat erbij', geenPlaats.kanOordelen && geenPlaats.rijen.find(r => r.sleutel === 'plaats').staat === 'mist');
  toets('kenteken in vreemde vorm telt niet', !A.invoerCheck(schoon(v => { v.kenteken = 'ABC'; })).kanOordelen);
  const km1 = A.invoerCheck(schoon(v => { v.opgegevenKm = null; })).rijen.find(r => r.sleutel === 'teller');
  toets('geen dashboardstand: kilometerstand deels', km1.staat === 'deels' && /dashboard/.test(km1.reden));
  const lege = A.normaliseer({ obd: { dtc: { actief: [] } } }).obd.dtc;
  toets('niet gelezen blijft null, gelezen-en-leeg blijft []', lege.pending === null && Array.isArray(lege.actief) && !lege.actief.length);
}

console.log('\nB. Vers gewist');
{
  const G = A.CFG.versWisKm;
  toets('net onder de grens (' + (G - 1) + ' km): rood', kleur(schoon(v => { v.obd.kmSindsWissen = G - 1; }), 'wissen') === 'rood');
  toets('op de grens (' + G + ' km): niet rood', kleur(schoon(v => { v.obd.kmSindsWissen = G; }), 'wissen') === 'groen');
  toets('weinig warm-ups alleen is ook rood', kleur(schoon(v => { v.obd.kmSindsWissen = null; v.obd.warmupsSindsWissen = A.CFG.versWisWarmups - 1; }), 'wissen') === 'rood');
  const max = sig(schoon(v => { v.obd.kmSindsWissen = 65535; }), 'wissen');
  toets('teller op 65535: groen, "heel lang"', max.kleur === 'groen' && /heel lang/.test(max.kop));
  toets('geen van beide tellers: grijs', kleur(schoon(v => { v.obd.kmSindsWissen = null; v.obd.warmupsSindsWissen = null; }), 'wissen') === 'grijs');
  const vers = sig(schoon(v => { v.obd.kmSindsWissen = 12; }), 'wissen');
  toets('vers gewist heeft een vraag voor de verkoper', /gewist/.test(vers.vraag || ''));
  toets('permanente code zonder wissen: oranje', kleur(schoon(v => { v.obd.dtc.permanent = ['P0420']; }), 'permanent') === 'oranje');
  toets('permanente code ná wissen: rood', kleur(schoon(v => { v.obd.dtc.permanent = ['P0420']; v.obd.kmSindsWissen = 12; }), 'permanent') === 'rood');
  const rdy = sig(schoon(v => { v.obd.kmSindsWissen = 12; v.obd.readiness.nietGereed = ['Katalysator']; }), 'wissen');
  toets('vers gewist noemt de zelftests die nog open staan', /Katalysator/.test(rdy.uitleg));
}

console.log('\nC. Foutcodes, lampje, zelftests, mode 06');
{
  toets('actieve code: rood met de code in de kop', (s => s.kleur === 'rood' && /P0300/.test(s.kop))(sig(schoon(v => { v.obd.dtc.actief = ['P0300']; }), 'actief')));
  toets('geen actieve codes: groen', kleur(schoon(), 'actief') === 'groen');
  toets('actief niet gelezen: grijs, niet groen', kleur(schoon(v => { v.obd.dtc.actief = null; }), 'actief') === 'grijs');
  toets('wachtende code: oranje', kleur(schoon(v => { v.obd.dtc.pending = ['P0171']; }), 'pending') === 'oranje');
  toets('lampje aan: rood', kleur(schoon(v => { v.obd.readiness.mil = true; }), 'mil') === 'rood');
  toets('lampje uit maar km met lampje aan: oranje', kleur(schoon(v => { v.obd.kmMetMil = 340; }), 'mil') === 'oranje');
  toets('0121 op 65535 telt niet als gereden met lampje', kleur(schoon(v => { v.obd.kmMetMil = 65535; }), 'mil') === 'groen');
  toets('alleen EVAP niet gereed: groen', kleur(schoon(v => { v.obd.readiness.nietGereed = ['EVAP']; }), 'readiness') === 'groen');
  toets('katalysator niet gereed: oranje', kleur(schoon(v => { v.obd.readiness.nietGereed = ['Katalysator']; }), 'readiness') === 'oranje');
  toets('mode 06 kritiek: rood', kleur(schoon(v => { v.obd.mode06 = { niveau: 'kritiek', tekst: '1 test buiten de fabrieksgrenzen' }; }), 'mode06') === 'rood');
  toets('mode 06 krap: oranje', kleur(schoon(v => { v.obd.mode06 = { niveau: 'let-op', tekst: '' }; }), 'mode06') === 'oranje');
  toets('mode 06 onbekend: grijs', kleur(schoon(v => { v.obd.mode06 = { niveau: 'onbekend', tekst: '' }; }), 'mode06') === 'grijs');
  toets('software-ID weegt niet mee (grijs)', kleur(schoon(), 'software') === 'grijs');
}

console.log('\nD. Kilometerstand en RDW');
{
  toets('dashboard 120.000, motor 80.000: rood', kleur(schoon(v => { v.opgegevenKm = 120000; v.km = null; v.obd.odoKm = 80000; }), 'teller') === 'rood');
  toets('verschil binnen de marge: groen', kleur(schoon(v => { v.opgegevenKm = 98500; v.km = null; }), 'teller') === 'groen');
  toets('PLKm kritiek: rood, ook als dashboard klopt', kleur(schoon(v => { v.km.niveau = 'kritiek'; }), 'teller') === 'rood');
  toets('geen tweede bron: grijs', kleur(schoon(v => { v.km = null; v.obd.odoKm = null; }), 'teller') === 'grijs');
  toets('RDW onlogisch: rood', kleur(schoon(v => { v.rdw.tellerstandoordeel = 'Onlogisch'; }), 'nap') === 'rood');
  toets('RDW "geen oordeel": grijs, niet groen', kleur(schoon(v => { v.rdw.tellerstandoordeel = 'Geen oordeel'; }), 'nap') === 'grijs');
  toets('APK verlopen: rood', kleur(schoon(v => { v.rdw.vervaldatum_apk = '20261001'; }), 'apk') === 'rood');
  toets('APK over 30 dagen: oranje', kleur(schoon(v => { v.rdw.vervaldatum_apk = '20261120'; }), 'apk') === 'oranje');
  toets('APK ruim: groen', kleur(schoon(), 'apk') === 'groen');
  toets('export: rood', kleur(schoon(v => { v.rdw.export_indicator = 'Ja'; }), 'export') === 'rood');
  toets('tenaamstellen niet mogelijk: rood', kleur(schoon(v => { v.rdw.tenaamstellen_mogelijk = 'Nee'; }), 'tenaam') === 'rood');
  toets('niet verzekerd: oranje', kleur(schoon(v => { v.rdw.wam_verzekerd = 'Nee'; }), 'wam') === 'oranje');
  toets('open terugroepactie (PLRecall): oranje', kleur(schoon(v => { v.recall = { niveau: 'kritiek', tekst: '1 open actie' }; }), 'recall') === 'oranje');
  toets('alleen RDW-indicator open: oranje', kleur(schoon(v => { v.recall = null; v.rdw.openstaande_terugroepactie_indicator = 'Ja'; }), 'recall') === 'oranje');
  toets('VIN-verschil tussen stuurapparaten: rood', kleur(schoon(v => { v.km.vin = { niveau: 'kritiek' }; }), 'vin') === 'rood');
}

console.log('\nE. Eindoordeel en vragen');
{
  toets('schone, complete meting: groen', A.model(schoon()).kleur === 'groen');
  toets('één aandachtspunt: oranje', A.model(schoon(v => { v.obd.dtc.pending = ['P0171']; })).kleur === 'oranje');
  toets('rood wint van oranje', A.model(schoon(v => { v.obd.dtc.pending = ['P0171']; v.obd.dtc.actief = ['P0300']; })).kleur === 'rood');
  const onv = A.model(schoon(v => { v.obd.readiness = null; }));
  toets('onvolledig en verder schoon: grijs, geen groen', onv.kleur === 'grijs' && /Gereedheidstests/.test(onv.voorblad.kort.tekst));
  const onvRood = A.model(schoon(v => { v.obd.readiness = null; v.obd.dtc.actief = ['P0300']; }));
  toets('onvolledig mét rode vlag: rood, en zegt wat ontbreekt', onvRood.kleur === 'rood' && /Niet alles is gelezen/.test(onvRood.voorblad.kort.tekst));
  const m = A.model(schoon(v => { v.obd.dtc.pending = ['P0171']; v.obd.dtc.actief = ['P0300']; }));
  const iR = m.vragen.findIndex(q => /P0300/.test(q)), iO = m.vragen.findIndex(q => /P0171/.test(q));
  toets('vragen: rood vóór oranje', iR >= 0 && iO > iR, JSON.stringify(m.vragen));
  toets('vragen: de vaste drie staan achteraan', A.STANDAARDVRAGEN.every((q, i) => m.vragen[m.vragen.length - 3 + i] === q));
  toets('vragen: geen dubbele', new Set(m.vragen).size === m.vragen.length);
  toets('schoon: alleen de vaste drie vragen', A.model(schoon()).vragen.length === 3);
}

console.log('\nF. AI: alleen woorden');
{
  const m = A.model(schoon(v => { v.obd.dtc.actief = ['P0300']; }));
  const p = A.instructie(m);
  toets('instructie geeft het oordeel mee en verbiedt wijzigen', /ROOD/.test(p) && /verander het niet/.test(p));
  toets('instructie noemt de bevinding', /P0300/.test(p));
  toets('instructie: geen keuring of garantie noemen', /nooit een keuring of een garantie/.test(p));
  const ai = A.metAI(m, '## Samenvatting\n**Deze auto is GROEN** <b>prima</b>\n- koop hem');
  toets('AI verandert de kleur niet', ai.kleur === 'rood');
  toets('AI-tekst zonder markdown of html', ai.ai && !/[#*<>]/.test(ai.ai) && !/^- /m.test(ai.ai), ai.ai);
  toets('AI-tekst staat als kader in hoofdstuk 1', ai.secties[0].blokken.some(b => b.soort === 'kader' && /door AI/.test(b.titel)));
  const discl = ai.secties[5].blokken.filter(b => b.soort === 'tekst').map(b => b.tekst).join(' ');
  toets('met AI: disclaimer zegt dat AI fouten kan maken', /AI .*kan fouten bevatten/.test(discl));
  const zonder = A.model(schoon()).secties[5].blokken.map(b => b.tekst || '').join(' ');
  toets('zonder AI: geen AI-zin in de disclaimer', !/door AI/.test(zonder));
  toets('lege AI-reactie: rapport zonder AI-kader', !A.metAI(m, '   ').secties[0].blokken.some(b => b.soort === 'kader'));
}

console.log('\nG. Disclaimer en privacy');
{
  const m = A.model(schoon());
  const zicht = JSON.stringify({ v: m.voorblad, s: m.secties });
  toets('disclaimer: geen aankoopkeuring, geen garantie', /geen aankoopkeuring/.test(zicht) && /geen garantie/.test(zicht));
  toets('disclaimer: noemt wat níét bekeken is (carrosserie, remmen)', /carrosserie/.test(zicht) && /remmen/.test(zicht));
  toets('nergens "anoniem"', !/anoniem/i.test(zicht));
  toets('het VIN staat niet in het rapport', zicht.indexOf(VIN) < 0);
  toets('plaats netjes op het voorblad', m.voorblad.regels.some(r => r[0] === 'Plaats' && r[1] === 'Utrecht, Croeselaan'));
  toets('plaats begrensd op ' + A.CFG.plaatsMax + ' tekens', A.normaliseer({ plaats: 'x'.repeat(500) }).plaats.length === A.CFG.plaatsMax);
  const src = fs.readFileSync(dir + '/pidlane-aankooprapport.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  toets('de module leest geen locatie van het toestel', !/geolocation|getCurrentPosition|watchPosition/.test(src));
  toets('kenteken genormaliseerd op het voorblad', m.voorblad.regels.some(r => r[0] === 'Kenteken' && r[1] === 'R054XD'));
  toets('datum en tijd op het voorblad', m.voorblad.regels.some(r => r[0] === 'Datum' && /21-10-2026/.test(r[1])) && m.voorblad.regels.some(r => r[0] === 'Tijd'));
}

console.log('\nH. PDF en bedrading');
{
  const log = []; let paginas = 1, pagina = 1;
  function Doc() {}
  const breed = t => String(t).length * 1.8;
  Object.assign(Doc.prototype, {
    setFillColor() {}, setDrawColor() {}, setTextColor() {}, setLineWidth() {}, setFont() {}, setFontSize() {}, setLineDashPattern() {},
    rect() {}, roundedRect() {}, circle() {}, line() {}, addImage() {},
    addPage() { paginas++; pagina = paginas; }, setPage(i) { pagina = i; }, getNumberOfPages() { return paginas; }, getTextWidth: breed,
    splitTextToSize(t, w) { const uit = []; let r = ''; String(t).split(' ').forEach(wd => { if (breed(r + ' ' + wd) > w && r) { uit.push(r); r = wd; } else r = r ? r + ' ' + wd : wd; }); if (r) uit.push(r); return uit.length ? uit : ['']; },
    text(t, x, y) { [].concat(t).forEach((r, i) => log.push({ t: String(r), y: y + i * 4, pagina })); },
    output() { return 'blob'; }
  });
  waarschuwingen.length = 0;
  s.PLRapport.pdf(A.model(schoon(v => { v.obd.dtc.actief = ['P0300']; })), Doc, { label: 'AANKOOPRAPPORT' });
  const alle = log.map(x => x.t).join('\n');
  toets('PDF: label AANKOOPRAPPORT op het voorblad', log.some(x => x.pagina === 1 && x.t === 'AANKOOPRAPPORT'));
  toets('PDF: alle blokken bekend bij PLRapport', !waarschuwingen.some(w => /onbekend blok/.test(w)), waarschuwingen.join(' | '));
  toets('PDF: hoofdstukken en disclaimer staan erin', ['1. Oordeel in', '2. Vraag dit aan de verkoper', '6. Volledigheid en grenzen', 'Disclaimer'].every(k => alle.indexOf(k) >= 0));
  toets('PDF: zonder label blijft het ANALYSERAPPORT', (() => { log.length = 0; s.PLRapport.pdf(A.model(schoon()), Doc, {}); return log.some(x => x.t === 'ANALYSERAPPORT'); })());

  const html = fs.readFileSync(dir + '/index.html', 'utf8');
  const iR = html.indexOf('<script src="pidlane-rapport.js">'), iA = html.indexOf('<script src="pidlane-aankooprapport.js">');
  toets('index.html laadt de module ná pidlane-rapport.js', iR > 0 && iA > iR);
  toets('knop roept PLAankoop.draaiUI aan', /onclick="PLAankoop\.draaiUI\(this\)"/.test(html));
  toets('uitvoervak en plaatsveld bestaan', html.indexOf('id="koopAankoopUit"') > 0 && html.indexOf('id="koopAankoopPlaats"') > 0);
  const help = fs.readFileSync(dir + '/pidlane-help-inhoud.js', 'utf8');
  toets('handleiding noemt de knop', help.indexOf('Aankooprapport maken') >= 0);
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen goed'));
process.exit(fout ? 1 : 0);
