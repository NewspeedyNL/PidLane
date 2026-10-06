// ══════════════════════════════════════════════════════════════════
// test-mode21.js — mode-bewuste commandobouw, op de échte functies
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST OPNIEUW GESCHREVEN IS (02-09-2026)
//
// Hier stond een rooktest die `pidCmd`, `isMode01` en de batch-zeef in de
// test zélf opnieuw definieerde. De echte versies staan in
// `pidlane-uitgebreid.js` en `pidlane-plload.js` en werden nooit geopend.
// Dat is precies de fout die deze test hoort te vangen: §20 waarschuwt dat
// `'2101'` in een batch stilzwijgend als `'01'+'01'` meegaat en dan mode 01
// PID 01 oplevert — een geldig antwoord op een vraag die niemand stelde.
// Een test die zijn eigen `pidCmd` meebrengt kan dat nooit zien.
//
// De batch-zeef zit midden in de pollus van pidlane-plload.js en is niet
// los aan te roepen. Hij wordt daarom niet overgeschreven maar UITGEKNIPT
// en met de echte `isMode01` uitgevoerd: verandert de regex daar, dan
// verandert deze test mee.
//
// Draaien vanuit public/:  node test-mode21.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}
function lees(f) { return fs.readFileSync(__dirname + '/' + f, 'utf8'); }

// ── de echte module ───────────────────────────────────────────────
function bouw(opties) {
  const o = opties || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  s.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() { }, remove() { } }, appendChild() { } }),
    addEventListener() { }, body: {}
  };
  s.addEventListener = () => { };
  s.setTimeout = (fn) => { if (typeof fn === 'function') fn(); return 0; };
  s.setInterval = () => 0; s.clearInterval = () => { }; s.clearTimeout = () => { };
  s.Promise = Promise;
  vm.createContext(s);

  s._verzonden = [];
  s._btlog = [];
  s._antwoorden = o.antwoorden || {};
  s._busVrij = (o.busVrij === undefined) ? true : o.busVrij;

  // pidlane-data.js levert merkGroep(), dat kandidaten() gebruikt om te
  // bepalen of deze auto überhaupt fabrikant-PIDs krijgt aangeboden.
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });

  vm.runInContext(`
    var connected=true, demoMode=false, supportedPIDs=new Set(), activePIDs=new Set();
    var vehicleInfo={make:'MAZDA'}, discoveredPIDDefs=[];
    function btDiag(m,n){ _btlog.push(String(m)); }
    function log(){}
    function delay(){ return Promise.resolve(); }
    function getPidDef(){ return null; }
    async function sendCmd(cmd, ms){
      _verzonden.push(String(cmd));
      return Object.prototype.hasOwnProperty.call(_antwoorden,cmd) ? _antwoorden[cmd] : 'NO DATA';
    }
    window.PLBus = { claim: function(){ return _busVrij ? 1 : 0; },
                     wait: async function(){ return _busVrij ? 1 : 0; },
                     release: function(){}, owner: function(){ return 'waakronde'; } };
  `, s, { filename: 'sandbox-omgeving' });

  vm.runInContext(lees('pidlane-uitgebreid.js'), s, { filename: 'pidlane-uitgebreid.js' });

  if (typeof s.pidCmd !== 'function' || typeof s.isMode01 !== 'function' || typeof s.pidMode !== 'function') {
    console.error('FOUT: pidCmd/isMode01/pidMode niet geëxporteerd — hernoemd?');
    process.exit(1);
  }
  s.lezen = expr => vm.runInContext(expr, s);
  return s;
}

// ── de batch-zeef, uitgeknipt uit de echte pollus ─────────────────
// Niet overgeschreven maar letterlijk overgenomen: de twee filterregels
// komen uit pidlane-plload.js en draaien hier op de echte isMode01.
function haalZeef(isMode01) {
  const bron = lees('pidlane-plload.js');
  const regels = [
    /const isBitmapPid=[^\n]+/,
    /const soloPids=due\.filter\([^\n]+/,
    /const batchable=due\.filter\([^\n]+/
  ].map(re => {
    const m = bron.match(re);
    if (!m) { console.error('FOUT: batch-zeef niet gevonden in pidlane-plload.js — verplaatst?'); process.exit(1); }
    return m[0];
  });
  // _m01 verwijst in de app naar isMode01; die geven we hier echt mee.
  return new Function('due', 'isMode01',
    'const _m01=p=>(typeof isMode01==="function")?isMode01(p):/^01/i.test(String(p));\n' +
    regels.join('\n') + '\nreturn {solo:soloPids, batch:batchable};');
}

// ══════════════════════════════════════════════════════════════════
(async function () {

  console.log('\n— mode 01 blijft byte-voor-byte gelijk aan de oude bouw —');
  {
    const s = bouw();
    ['010C', '0105', '015C', '0149'].forEach(p => {
      t(p + ' solo', s.pidCmd(p, true), p + '1');
      t(p + ' zonder snelvlag', s.pidCmd(p, false), p);
    });
    t('mode van 010C is 01', s.pidMode('010C'), '01');
    t('010C is mode 01', s.isMode01('010C'), true);
  }

  console.log('\n— mode 21 gaat niet meer stilzwijgend naar mode 01 —');
  {
    const s = bouw();
    // De oude bouw was '01'+pid.slice(2) — voor 2101 leverde dat '0101' op:
    // een geldig commando met een heel andere betekenis.
    t('de oude bouw zou 0101 hebben gemaakt', '01' + '2101'.slice(2), '0101');
    t('pidCmd maakt er 21011 van', s.pidCmd('2101', true), '21011');
    t('en zonder snelvlag 2101', s.pidCmd('2101', false), '2101');
    t('mode van 2101 is 21', s.pidMode('2101'), '21');
    t('2101 is GEEN mode 01', s.isMode01('2101'), false);
    t('220110 is GEEN mode 01', s.isMode01('220110'), false);
    t('kleine letters tellen ook', s.pidMode('2101'.toLowerCase()), '21');
  }

  console.log('\n— de batch-zeef houdt mode 21 en bitmaps eruit —');
  {
    const s = bouw();
    const zeef = haalZeef(s.isMode01);
    const uit = zeef(['010C', '010D', '2101', '0100', '210C'], s.isMode01);
    t('alleen mode 01 wordt gebatcht', uit.batch.join(','), '010C,010D');
    t('mode 21 en bitmaps gaan solo', uit.solo.join(','), '2101,0100,210C');

    // Alle bitmap-PIDs uit de regex, één voor één.
    const bitmaps = ['0100', '0120', '0140', '0160', '0180', '01A0', '01C0'];
    const uit2 = zeef(bitmaps.concat(['010C']), s.isMode01);
    t('geen enkele bitmap in de batch', uit2.batch.join(','), '010C');
    t('alle zeven bitmaps solo', uit2.solo.length, 7);

    // De cmd-opbouw voor een batch: '01' + de suffixen. Dat mag alleen als
    // er gegarandeerd niets anders dan mode 01 in zit.
    t('een batchcommando plakt de suffixen achter 01',
      '01' + uit.batch.map(p => p.slice(2)).join(''), '010C0D');
  }

  console.log('\n— de responseheader is mode + 0x40 —');
  {
    // Via de echte probe: hij accepteert een PID alleen als de header klopt.
    // De echte kandidaten zijn 2102/210C/210D (2101 is op 19-08 bewust
    // verwijderd — zie de kop van pidlane-uitgebreid.js). Header = mode+0x40,
    // dus 21 -> 61.
    const s = bouw({ antwoorden: { '21021': '61 02 7B' } });
    s.lezen("vehicleInfo={make:'MAZDA'};");
    const r = await s.probeUitgebreid(true);
    t('er wordt met het mode-21 commando gevraagd', s._verzonden.includes('21021'), true);
    t('alle drie de kandidaten zijn bevraagd', s._verzonden.length, 3);
    t('een 61-header wordt geaccepteerd', r.nieuw, 1);
    t('en het PID komt in supportedPIDs', s.lezen("supportedPIDs.has('2102')"), true);
    t('de rauwe bytes staan in de log', /Uitgebreid 2102/.test(s._btlog.join(' | ')), true);
  }

  console.log('\n— een mode-01 header op een mode-21 vraag telt niet —');
  {
    // Dit is de fout uit §20 in zijn zuiverste vorm: de ECU antwoordt met
    // 41 01 (mode 01 PID 01) terwijl er 21 01 gevraagd is. Zou de probe
    // alleen op "er kwam iets terug" toetsen, dan gold dat als succes.
    const s = bouw({ antwoorden: { '21021': '41 02 7B' } });
    s.lezen("vehicleInfo={make:'MAZDA'};");
    const r = await s.probeUitgebreid(true);
    t('een 41-header wordt geweigerd', r.nieuw, 0);
    t('en 2102 komt niet in supportedPIDs', s.lezen("supportedPIDs.has('2102')"), false);
    t('de log meldt geen antwoord', /geen antwoord/.test(s._btlog.join(' | ')), true);
  }

  console.log('\n— de probe dringt niet voor als de bus bezet is —');
  {
    const s = bouw({ busVrij: false, antwoorden: { '21021': '61 02 7B' } });
    s.lezen("vehicleInfo={make:'MAZDA'};");
    const r = await s.probeUitgebreid(true);
    t('de probe wordt uitgesteld', r.busBezet, true);
    t('er is niets verzonden', s._verzonden.length, 0);
    t('de eigenaar staat in de melding', /bus bezet door "waakronde"/.test(s._btlog.join(' | ')), true);

    // En hij mag zichzelf niet als "gedraaid" boeken: dan kwam hij nooit terug.
    const s2 = bouw({ busVrij: true, antwoorden: { '21021': '61 02 7B' } });
    s2.lezen("vehicleInfo={make:'MAZDA'};");
    const r2 = await s2.probeUitgebreid(true);
    t('een vrije bus levert wél een meting op', r2.nieuw, 1);
  }

  console.log('\n— eigen PIDs per voertuig: alleen lezen, eigen formule zonder eval (27-09-2026) —');
  {
    // Solo met het antwoordaantal erachter (pidCmd(code, true)), net als de pollus.
    const s = bouw({ antwoorden: { '221E1C1': '621E1C5A', '2202021': '7F2231', '21011': '6101 00 64' } });
    const E = s.PLEigen;
    t('PLEigen staat er', typeof E === 'object' && typeof s.plEigenDefs === 'function', true);
    const f = E.formule('(A*256+B)/10-40');
    t('formule (A*256+B)/10-40 op 01 F4 = 10', f([1, 244]), 10);
    t('formule met komma en spaties: A * 0,5', E.formule('A * 0,5')([9]), 4.5);
    t('unaire min en haakjes: -(A-B)', E.formule('-(A-B)')([3, 5]), 2);
    t('ontbrekende byte geeft null, geen NaN', E.formule('A+B')([7]), null);
    t('delen door nul geeft null', E.formule('A/(B-B)')([1, 2]), null);
    const weiger = x => { try { E.formule(x); return 'aangenomen'; } catch (e) { return 'geweigerd'; } };
    t('geen code in een formule: alert(1)', weiger('alert(1)'), 'geweigerd');
    t('geen code in een formule: A;B', weiger('A;B'), 'geweigerd');
    t('geen code in een formule: constructor', weiger('constructor'), 'geweigerd');
    t('byte I bestaat niet (alleen A–H)', weiger('I+1'), 'geweigerd');
    t('haakje open zonder dicht', weiger('(A+1'), 'geweigerd');
    t('twee operatoren achter elkaar', weiger('A*/B'), 'geweigerd');

    const c = (code, extra) => E.controleer(Object.assign({ code, naam: 'Test', formule: 'A' }, extra || {}));
    t('221e1c (kleine letters) is een leescode', c('221e1c').ok && c('221e1c').code, '221E1C');
    t('2101 is een leescode', c('2101').ok, true);
    t('2E1234 schrijft: geweigerd', c('2E1234').ok, false);
    t('2F1234 stuurt aan: geweigerd', c('2F1234').ok, false);
    t('31010203 start een routine: geweigerd', c('31010203').ok, false);
    t('04 wist foutcodes: geweigerd', c('04').ok, false);
    t('1101 reset: geweigerd', c('1101').ok, false);
    t('0105 is mode 01 en hoort niet hier', c('0105').ok, false);
    t('22 met te weinig tekens: geweigerd', c('2201').ok, false);
    t('zonder naam: geweigerd', E.controleer({ code: '221E1C', formule: 'A' }).ok, false);
    t('bereik alleen als max > min', c('221E1C', { min: 10, max: 5 }).def.max, 1e9);

    s.ALL_PID_DEFS['220202'] = { name: 'bestaand', unit: '' };
    const n = E.zet([
      { code: '221E1C', naam: 'Temperatuur automaat', eenheid: '°C', formule: 'A-40' },
      { code: '2E1234', naam: 'schrijven', formule: 'A' },
      { code: '220202', naam: 'overschrijven', formule: 'A' }
    ], 'Blauwe Mazda');
    t('zet: alleen de geldige, niet-bekende code telt', n, 1);
    t('zet: hij staat in ALL_PID_DEFS, als eigen, in de groep Eigen',
      !!s.ALL_PID_DEFS['221E1C'] && s.ALL_PID_DEFS['221E1C'].eigen === true && s.ALL_PID_DEFS['221E1C'].cat, 'Eigen');
    t('zet: een PID die de app al kent wordt niet overschreven', s.ALL_PID_DEFS['220202'].name, 'bestaand');
    t('zet: de schrijfcode komt nergens terecht', !!s.ALL_PID_DEFS['2E1234'], false);
    t('is(): 221E1C wel, 220202 niet', E.is('221e1c') + ',' + E.is('220202'), 'true,false');
    t('plEigenDefs levert hem voor de keuzelijst', s.plEigenDefs().map(d => d.pid).join(','), '221E1C');
    t('parse via de def: 5A − 40 = 50', s.ALL_PID_DEFS['221E1C'].parse([0x5A]), 50);
    const veel = Array.from({ length: 25 }, (_, i) => ({ code: '2210' + (i < 16 ? '0' : '') + i.toString(16).toUpperCase(), naam: 'x' + i, formule: 'A' }));
    t('hoogstens ' + E.MAX + ' per voertuig', E.zet(veel, 'x'), E.MAX);
    E.zet(null, 'ander voertuig');
    t('ander voertuig zonder eigen PIDs: de oude zijn weg', !!s.ALL_PID_DEFS['221E1C'] + ',' + s.plEigenDefs().length, 'false,0');

    const r = await E.test({ code: '221E1C', naam: 'T', formule: 'A-40', eenheid: '°C' });
    t('test: stuurt de code één keer, zoals de pollus hem stuurt', s._verzonden.filter(x => x === '221E1C1').length, 1);
    t('test: leest de byte achter de echo 621E1C', r.ok && r.waarde, 50);
    const w = await E.test({ code: '220202', naam: 'T', formule: 'A' });
    t('test: 7F wordt "de auto weigert"', /weigert/.test(w.fout || ''), true);
    const x = await E.test({ code: '2E1234', naam: 'T', formule: 'A' });
    t('test: een schrijfcode gaat de bus niet eens op', !x.ok && !s._verzonden.some(c => /^2E1234/.test(c)), true);
    const O = E.oordeel, d1 = [{ pid: '221E1C', name: 'Temp automaat', unit: '°C' }];
    t('oordeel: niet verbonden is LET OP', O({ echt: false, defs: d1 }).staat, 'LET OP');
    t('oordeel: geen eigen PID is LET OP', O({ echt: true, defs: [] }).staat, 'LET OP');
    t('oordeel: wel een, niet aan, is LET OP', O({ echt: true, defs: d1, actief: [] }).staat, 'LET OP');
    const oo = O({ echt: true, defs: d1, actief: ['221E1C'], laatst: { '221E1C': 99000 }, waarden: { '221E1C': 71.5 }, nu: 100000 });
    t('oordeel: antwoord binnen 30 s is ok, met de waarde', oo.staat + ' ' + /71,5 °C/.test(oo.detail), 'ok true');
    const os = O({ echt: true, defs: d1, actief: ['221E1C'], laatst: { '221E1C': 50000 }, waarden: {}, nu: 100000 });
    t('oordeel: een minuut stil is LET OP met de code erbij', os.staat + ' ' + /221E1C/.test(os.detail), 'LET OP true');
    const ob = O({ echt: true, defs: [{ pid: '222A05', name: 'Band', unit: 'bar', tempo: 'minuut' }], actief: ['222A05'], laatst: { '222A05': 50000 }, waarden: { '222A05': 2.33 }, nu: 100000 });
    t('oordeel: een band (elke minuut) die 50 s geleden antwoordde is vers', ob.staat, 'ok');
    const ob2 = O({ echt: true, defs: [{ pid: '222A05', name: 'Band', unit: 'bar', tempo: 'minuut' }], actief: ['222A05'], laatst: { '222A05': 0 }, waarden: {}, nu: 200000 });
    t('oordeel: maar 200 s stil is ook voor een band te lang', ob2.staat, 'LET OP');
    s.lezen('connected=false');
    const y = await E.test({ code: '2101', naam: 'T', formule: 'B' });
    t('test: zonder verbinding niets versturen', !y.ok && !s._verzonden.some(c => /^2101/.test(c)), true);
  }

  console.log('\n— ECU-adres, tempo en de bibliotheek (27-09-2026) —');
  {
    const s = bouw({ antwoorden: { '221E1C1': '7E9 04 62 1E 1C 5A', '2202021': '62020 2 64' } });
    const E = s.PLEigen;
    const c = (x) => E.controleer(Object.assign({ code: '221E1C', naam: 'T', formule: 'A' }, x));
    t('ECU-adres 7e1 wordt 7E1', c({ ecu: '7e1' }).ecu, '7E1');
    t('ECU-adres 18DA18F1 (29-bit) mag', c({ ecu: '18DA18F1' }).ok, true);
    t('ECU-adres 7DF is het functionele adres: niet invullen', c({ ecu: '7DF' }).ok, true);
    t('ECU-adres ATZ (een commando) wordt geweigerd', c({ ecu: 'ATZ' }).ok, false);
    t('ECU-adres 7E1;ATMA wordt geweigerd', c({ ecu: '7E1;ATMA' }).ok, false);
    E.zet([{ code: '221E1C', naam: 'Automaat', formule: 'A-40', ecu: '7E1', tempo: 'traag' },
           { code: '220202', naam: 'Olie', formule: 'A', tempo: 'snel' },
           { code: '220303', naam: 'Zonder tempo', formule: 'A' }], 'x');
    t('tempo traag = 10 s, snel = 1 s, niets = 2 s', [E.interval('221E1C'), E.interval('220202'), E.interval('220303')].join(','), '10000,1000,2000');
    s._verzonden.length = 0;
    const r1 = await E.vraag('221E1C');
    t('met ECU-adres: eerst ATSH7E1, dan de vraag, dan terug naar 7DF', s._verzonden.join(' '), 'ATSH7E1 221E1C1 ATSH7DF');
    t('en het antwoord komt terug', r1, '7E9 04 62 1E 1C 5A');
    s._verzonden.length = 0;
    await E.vraag('220202');
    t('zonder ECU-adres: alleen de vraag, geen header', s._verzonden.join(' '), '2202021');
    E.zet([{ code: '221E1C', naam: 'A', formule: 'A', ecu: '18DA18F1' }], 'x');
    s._verzonden.length = 0;
    await E.vraag('221E1C');
    t('29-bit: terug naar 18DB33F1, niet naar 7DF', s._verzonden.join(' '), 'ATSH18DA18F1 221E1C1 ATSH18DB33F1');
    // Mislukt het terugzetten, dan probeert de volgende vraag het eerst.
    const echt = s.sendCmd; let weiger = true;
    s.sendCmd = async function (cmd) { s._verzonden.push(cmd); if (weiger && cmd === 'ATSH18DB33F1') { weiger = false; throw new Error('timeout'); } return 'OK'; };
    s._verzonden.length = 0;
    await E.vraag('221E1C');
    await E.vraag('221E1C');
    t('terugzetten mislukt: de volgende vraag zet eerst het functionele adres terug', s._verzonden.join(' '),
      'ATSH18DA18F1 221E1C1 ATSH18DB33F1 ATSH18DB33F1 ATSH18DA18F1 221E1C1 ATSH18DB33F1');
    s.sendCmd = echt;

    const k = E.kandidatenUitTekst('Hier is wat ik vond:\n{"kandidaten":[' +
      '{"code":"221e1c","ecu":"7e1","naam":"Temperatuur automaat","formule":"A - 40","eenheid":"°C","bron":"https://forum.nl/a"},' +
      '{"code":"2E1E1C","naam":"schrijven","formule":"A","bron":"https://forum.nl/b"},' +
      '{"code":"220202","naam":"zonder bron","formule":"A"},' +
      '{"code":"220303","naam":"Signed","formule":"Signed(A)","bron":"https://forum.nl/c"},' +
      '{"code":"221E1C","ecu":"7E1","naam":"dubbel","formule":"A","bron":"https://forum.nl/d"}]}\nSucces!');
    t('kandidaten: alleen de geldige leescode met bron blijft over', k.map(x => x.code + '@' + x.ecu).join(','), '221E1C@7E1');
    t('kandidaten: de formule zonder spaties, de bron erbij', k[0].formule + ' ' + k[0].url, 'A-40 https://forum.nl/a');
    t('kandidaten: geen JSON is een lege lijst, geen fout', E.kandidatenUitTekst('Sorry, niets gevonden.').length, 0);

    // Online zoeken: via apiFetch met de zoektool, en eerlijk als die ontbreekt.
    let gevraagd = null;
    s.apiFetch = async (p, max, sys, mdl, aanl, extra) => { gevraagd = { sys, extra }; return '{"kandidaten":[{"code":"220404","naam":"Olie","formule":"A","bron":"https://x.nl"}]}'; };
    const z = await E.zoekOnline({ merk: 'Mazda', model: 'CX-5', bouwjaar: 2019 });
    t('zoekOnline vraagt de zoektool van de API', gevraagd && gevraagd.extra.tools[0].name, 'web_search');
    t('zoekOnline geeft de gecontroleerde kandidaten', z.ok && z.kandidaten.map(x => x.code).join(','), '220404');
    s.apiFetch = async () => { throw new Error('API fout (400): web_search is not enabled'); };
    const z2 = await E.zoekOnline({ merk: 'Mazda', model: 'CX-5' });
    t('zonder zoektool: een melding, en geen kandidaten uit het geheugen', !z2.ok && /niet beschikbaar/.test(z2.fout) && !z2.kandidaten, true);
    t('zonder merk of model: niet zoeken', (await E.zoekOnline({ merk: 'Mazda' })).ok, false);
  }

  console.log('\n— banden: herkennen, elke minuut, druk in bar of psi (28-09-2026) —');
  {
    const s = bouw();
    const E = s.PLEigen, R = (n) => JSON.stringify(E.bandRol(n));
    t('Bandenspanning voor-links = VL druk', R('Bandenspanning voor-links'), '{"pos":"VL","soort":"druk"}');
    t('Bandtemperatuur achter-rechts = AR temp', R('Bandtemperatuur achter-rechts'), '{"pos":"AR","soort":"temp"}');
    t('Tire pressure RR = AR druk', R('Tire pressure RR'), '{"pos":"AR","soort":"druk"}');
    t('TPMS FL = VL druk', R('TPMS FL'), '{"pos":"VL","soort":"druk"}');
    t('Motorolietemperatuur is geen band', R('Motorolietemperatuur'), 'null');
    t('Bandenspanning zonder plek is geen band (welke?)', R('Bandenspanning'), 'null');
    t('voor én achter in één naam: geen band', R('Bandenspanning voor-achter links'), 'null');
    // Wat er echt bij de CX-5 staat (28-09-2026): psi-formule, ECU 720.
    const psi = '((A*1373)/1000)*0.145037738';
    s.PLVoorkeur = { druk: () => 'bar' };
    E.zet([{ code: '222A05', naam: 'Bandenspanning voor-links', formule: psi, eenheid: 'psi', ecu: '720' },
           { code: '222A0A', naam: 'Bandtemperatuur voor-links', formule: 'A-50', eenheid: '°C', ecu: '720' },
           { code: '222A06', naam: 'Bandenspanning voor-rechts', formule: psi, eenheid: 'psi', ecu: '720', tempo: 'normaal' },
           { code: '221310', naam: 'Motorolietemperatuur', formule: '((A*256)+B)/100-40', eenheid: '°C' }], 'Mazda');
    t('een band zonder gekozen tempo: elke minuut', E.interval('222A05') + ',' + E.interval('222A0A'), '60000,60000');
    t('een band met tempo "normaal" blijft elke 2 s (de keuze wint)', E.interval('222A06'), 2000);
    t('geen band: elke 2 s', E.interval('221310'), 2000);
    const d = s.ALL_PID_DEFS['222A05'];
    t('psi wordt bar: eenheid', d.unit, 'bar');
    t('170 = 1,373 × 170 kPa = 2,33 bar', d.parse([170]), 2.33);
    t('de temperatuur verandert niet', s.ALL_PID_DEFS['222A0A'].unit + ' ' + s.ALL_PID_DEFS['222A0A'].parse([75]), '°C 25');
    t('de band staat erbij voor PLBanden', JSON.stringify(E.defs().find(x => x.pid === '222A05').band), '{"pos":"VL","soort":"druk"}');
    s.pidVals = { '222A05': 2.33, '222A0A': 25 };
    s.PLVoorkeur = { druk: () => 'psi' };
    E.herzet();
    t('voorkeur psi: dezelfde code weer in psi, precies zoals de formule rekent', s.ALL_PID_DEFS['222A05'].unit + ' ' + s.ALL_PID_DEFS['222A05'].parse([170]), 'psi 33.853');
    t('de oude drukwaarde (in bar) is weg, de temperatuur blijft', String(s.pidVals['222A05']) + ',' + s.pidVals['222A0A'], 'undefined,25');
    t('kPa naar bar met bereik: 100–300 kPa wordt 1–3 bar', (function () {
      s.PLVoorkeur = { druk: () => 'bar' };
      const r = E.controleer({ code: '220909', naam: 'Oliedruk', formule: 'A', eenheid: 'kPa', min: 100, max: 300 });
      return r.def.unit + ' ' + r.def.min + '-' + r.def.max + ' ' + r.def.parse([250]);
    })(), 'bar 1-3 2.5');
    t('zonder PLVoorkeur: bar', (delete s.PLVoorkeur, E.controleer({ code: '220909', naam: 'x', formule: 'A', eenheid: 'psi' }).def.unit), 'bar');

    // Standaardbereik (30-09-2026, uit het gebruik): zonder bereik stond
    // alles op −1e9…1e9, en dan is de balk in Slim gearceerd en leeg.
    const C = (e) => { s.PLVoorkeur = { druk: () => 'bar' }; return E.controleer(Object.assign({ code: '222A0A', formule: 'A' }, e)).def; };
    let b = C({ naam: 'Bandtemperatuur voor-links', eenheid: '°C' });
    t('bandtemperatuur (#370): schaal tot 80, rood vanaf 65', [b.max, b.dH, b.balkVol].join(','), '80,65,80');
    t('…en 0 °C is geen minimum (anders leest een winterband als dummy)', b.min < 0, true);
    const knip = (naam, tot) => {
      const bron = lees('pidlane-pids.js'), i = bron.indexOf('function ' + naam + '('), j = bron.indexOf('function ' + tot + '(', i);
      if (i < 0 || j < 0) { console.error('FOUT: ' + naam + ' niet te knippen uit pidlane-pids.js'); process.exit(1); }
      return new Function(bron.slice(i, j) + 'return ' + naam + ';')();
    };
    const schaal = knip('slimTempSchaal', 'slimBeweegt'), oordeel = knip('pidOordeel', 'applyG');
    t('…dus in Slim loopt de balk vol op 80, niet op 65 en niet op een miljard', schaal(b), 80);
    t('…en 70 °C is rood, 60 °C niet', oordeel(b, 70) + ',' + oordeel(b, 60), 'danger,ok');
    b = C({ naam: 'Bandenspanning voor-links', eenheid: 'psi' });
    t('bandenspanning in psi, getoond in bar (#370): schaal 0–4, rood onder 1,5 en vanaf 3,5', b.unit + ' ' + b.min + '-' + b.max + ' ' + b.dL + '/' + b.dH, 'bar 0-4 1.5/3.5');
    t('…1,2 en 3,8 bar zijn rood, 2,3 bar niet', [oordeel(b, 1.2), oordeel(b, 3.8), oordeel(b, 2.3)].join(','), 'danger,danger,ok');
    s.PLVoorkeur = { druk: () => 'psi' };
    b = E.controleer({ code: '222A05', naam: 'Bandenspanning voor-links', formule: 'A', eenheid: 'psi' }).def;
    t('voorkeur psi: dezelfde schaal en grenzen in psi', [b.unit, b.max, b.dL, b.dH].join(' '), 'psi 58.02 21.76 50.76');
    t('…en 30 psi (2,1 bar) is dan niet rood', oordeel(b, 30), 'ok');
    b = C({ naam: 'Motorolietemperatuur', eenheid: '°C' });
    t('motorolietemperatuur: dezelfde grenzen als 015C', [b.min, b.max, b.wH, b.dH].join(','), [-40, 150, s.ALL_PID_DEFS['015C'].wH, s.ALL_PID_DEFS['015C'].dH].join(','));
    b = C({ naam: 'Bandtemperatuur voor-links', eenheid: '°C', min: -50, max: 200 });
    t('een eigen bereik wint van de schaal, de grens blijft', [b.min, b.max, b.dH, b.balkVol].join(','), '-50,200,65,');
    b = C({ naam: 'Inlaatnokkenas', eenheid: '°' });
    t('wat niet herkend wordt houdt het open bereik', b.max + ' ' + b.wH, '1000000000 undefined');
  }

  console.log('\n— dieper zoeken: AI met werkende codes en de buurscan (28-09-2026) —');
  {
    const ant = { '222A051': '62 2A 05 AA', '222A061': '62 2A 06 AB', '222A101': '62 2A 10 01 02', '222A111': '7F 22 31' };
    const s = bouw({ antwoorden: ant });
    const E = s.PLEigen;
    const bl = E.scanBlokken([{ code: '222A05', ecu: '720' }, { code: '222A0A', ecu: '720' }, { code: '221310', ecu: '' }, { code: '2E1234', ecu: '720' }, { code: '222A05', ecu: '7DF' }]);
    t('blokken: één per voorvoegsel en ECU-adres; geen schrijfcodes; 7DF telt als geen adres', bl.map(b => b.prefix + '@' + b.ecu).join(','), '222A@720,2213@,222A@');
    t('een blok is 256 codes, van 00 tot FF', [E.scanCodes('222A').length, E.scanCodes('222A')[0], E.scanCodes('222A')[255]].join(','), '256,222A00,222AFF');
    t('antwoord: bytes achter de echo, ook met header', JSON.stringify(E.antwoordBytes('222A05', '72A 04 62 2A 05 AA')), '[170]');
    t('antwoord: 7F is geen antwoord', E.antwoordBytes('222A11', '7F 22 31'), null);
    s._verzonden.length = 0;
    const r = await E.buurScan({ prefix: '222A', ecu: '720' });
    t('buurscan: vindt de drie codes die antwoorden, niet de 7F', r.ok && r.gevonden.map(g => g.code).join(','), '222A05,222A06,222A10');
    t('buurscan: alle 256 gevraagd', r.gedaan, 256);
    const heen = s._verzonden.filter(c => c === 'ATSH720').length, terug = s._verzonden.filter(c => c === 'ATSH7DF').length;
    t('buurscan: per zestien codes één keer ATSH720 en altijd weer terug naar 7DF', heen + '/' + terug, '16/16');
    t('buurscan: het laatste commando zet het functionele adres terug', s._verzonden[s._verzonden.length - 1], 'ATSH7DF');
    t('buurscan: alleen leesblokken — 2E niet', (await E.buurScan({ prefix: '2E12', ecu: '720' })).ok, false);
    t('buurscan: een blok van 3 hextekens (22A) niet', (await E.buurScan({ prefix: '22A', ecu: '' })).ok, false);
    // Stoppen: na de eerste portie.
    s._verzonden.length = 0;
    const p = E.buurScan({ prefix: '222A', ecu: '' }, { voortgang: (st) => { if (st.gedaan === 5) E.buurScanStop(); } });
    const r2 = await p;
    t('stoppen: stopt na de lopende code, en zegt dat', r2.gestopt + ' ' + r2.gedaan, 'true 5');
    s.lezen('connected=false');
    t('niet verbonden: geen scan', (await E.buurScan({ prefix: '222A', ecu: '' })).ok, false);

    const vraag = E.dieperVraag('Mazda CX-5 2018', [{ code: '222A05', ecu: '720', naam: 'Bandenspanning voor-links' }, { code: '221310', ecu: '', naam: 'Olie' }]);
    t('dieper: de vraag noemt de werkende codes en hun ECU-adres', /222A05@720/.test(vraag) && /221310/.test(vraag) && /\(720\)/.test(vraag), true);
    let gevraagd = null;
    s.apiFetch = async (q) => { gevraagd = q; return '{"kandidaten":[{"code":"222A05","ecu":"720","naam":"Band","formule":"A","bron":"https://x.nl"},{"code":"222A20","ecu":"720","naam":"Nieuw","formule":"A","bron":"https://x.nl"}]}'; };
    const z = await E.zoekOnline({ merk: 'Mazda', model: 'CX-5' }, [{ code: '222A05', ecu: '720', naam: 'Band' }]);
    t('dieper: de AI krijgt de werkende codes mee', /Deze leescodes werken/.test(gevraagd), true);
    t('dieper: wat er al is komt niet terug als kandidaat', z.dieper + ' ' + z.kandidaten.map(k => k.code).join(','), 'true 222A20');
  }

  console.log('\n— de pollus vraagt hoogstens twee eigen PIDs per ronde (28-09-2026) —');
  {
    const s = bouw();
    const bron = lees('pidlane-plload.js');
    const i = bron.indexOf('function pidsDueNow(){'), j = bron.indexOf('const EIGEN_PER_RONDE=2;');
    if (i < 0 || j < 0) { console.error('FOUT: pidsDueNow of EIGEN_PER_RONDE niet gevonden in pidlane-plload.js'); process.exit(1); }
    const banden = ['222A05', '222A06', '222A07', '222A08', '222A0A', '222A0B', '222A0C', '222A0D'];
    s.PLEigen.zet(banden.map(c => ({ code: c, naam: 'Bandenspanning ' + c, formule: 'A', ecu: '720' })), 'x');
    const actief = new Set(['010C', '010D'].concat(banden));
    const due = new Function('activePIDs', '_pidDead', '_pidDeadSince', '_pidNextPoll', 'pidPollInterval', 'plIsBerekend', 'window', 'PID_REPROBE_MS',
      bron.slice(i, j) + 'const EIGEN_PER_RONDE=2;\nreturn pidsDueNow;')(actief, new Set(), {}, {}, p => /^01/.test(p) ? 100 : 60000, () => false, s, 30000);
    const r = due();
    t('toerental en snelheid gaan altijd mee', r.indexOf('010C') >= 0 && r.indexOf('010D') >= 0, true);
    t('van de acht banden maar twee in deze ronde', r.filter(p => banden.indexOf(p) >= 0).length, 2);
  }

  console.log('\n─────────────────────────────────────────');
  console.log(ok + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})();
