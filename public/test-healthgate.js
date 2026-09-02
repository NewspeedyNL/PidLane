// ══════════════════════════════════════════════════════════════════
// test-healthgate.js — het gezondheidsoordeel, op de échte functies
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST OPNIEUW GESCHREVEN IS (02-09-2026)
//
// Er stond hier een rooktest die `pidlane-rijsituatie.js` niet opende. De
// kopie van `healthUitProfiel()` in de test was intussen uit de pas gaan
// lopen met het origineel, en niemand kon dat zien:
//
//     in de test:   healthUitProfiel(health, supported) -> object of null
//     in de app:    healthUitProfiel(health)            -> true of false
//
// De echte functie leest `supportedPIDs` uit zijn eigen scope en schrijft
// het oordeel in `_pidHealth`; de kopie kreeg de lijst als tweede argument
// en gaf een nieuw object terug. De test stond dus groen op een functie die
// niet bestaat. Zo'n test is duurder dan geen test: hij vult de plek waar
// een echte controle had moeten staan.
//
// Wat hier bewaakt wordt is één regel met gevolgen: `autoSelectHealthyKern()`
// en de PID-gate draaien op `_pidHealth`, en het profiel wordt bewaard. Een
// sensor die ten onrechte 'nodata' krijgt, blijft een sessie lang uitgegrijsd
// en dat oordeel wordt een blijvend feit over dit voertuig.
//
// Draaien vanuit public/:  node test-healthgate.js     (exit 0 = goed)
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
function knip(bron, van, tot, naam) {
  const a = bron.indexOf(van), b = tot ? bron.indexOf(tot) : bron.length;
  if (a < 0 || b < a) { console.error('FOUT: knipbereik "' + naam + '" niet gevonden'); process.exit(1); }
  return bron.slice(a, b);
}

// ── de sandbox ────────────────────────────────────────────────────
// De gezondheidscheck praat met de bus, het scherm en de log. Die drie zijn
// hier nep; het oordeel zelf is echt. `antwoorden` bepaalt wat de nep-adapter
// per PID teruggeeft, `traag` welke PID de scan laat afbreken.
function bouw(opties) {
  const o = opties || {};
  const s = {};
  s.window = s; s.globalThis = s;
  s.console = { log() { }, warn() { }, error() { } };
  s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
  s.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({
      style: {}, classList: { add() { }, remove() { } }, dataset: {},
      appendChild() { }, remove() { }, querySelector: () => null, setAttribute() { }
    }),
    addEventListener() { }, body: {}
  };
  s.addEventListener = () => { };
  s.setTimeout = (fn) => { if (typeof fn === 'function') fn(); return 0; };
  s.setInterval = () => 0; s.clearInterval = () => { }; s.clearTimeout = () => { };
  s.Promise = Promise;
  vm.createContext(s);

  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });

  s._antwoorden = o.antwoorden || {};
  s._breekNa = (o.breekNa === undefined) ? -1 : o.breekNa;
  s._btlog = [];
  s._log = [];

  vm.runInContext(`
    var _pidHealth={}, activePIDs=new Set(), pidVals={}, pidHist={}, pidSmooth={};
    var supportedPIDs=new Set(), discoveredPIDDefs=[], demoMode=false, connected=true;
    var _gescand=[];
    function btDiag(m,n){ _btlog.push(String(m)); }
    function log(m,n){ _log.push(String(m)); }
    function logToSheets(){}
    function fv(v){ return String(v); }
    function getPidDef(pid){ return ALL_PID_DEFS[pid]||null; }
    function updPID(){}
    function buildDiscoveredPIDList(){}
    function refreshLegeTegels(){}
    function autoSelectHealthyKern(){}
    function pidCmd(pid,snel){ return String(pid).toUpperCase()+(snel?'1':''); }
    // parsePID is hier bewust smal: één byte, geen tabel. Wat deze test toetst
    // is het OORDEEL van de scan, niet de parser — die heeft test-parser.js.
    function parsePID(pid,raw){
      var h=String(raw).replace(/[^0-9A-Fa-f]/g,'');
      if(h.length<6) return null;
      return parseInt(h.slice(4,6),16);
    }
    function assessPidQuality(pid,val,scanMode){
      // 0xEE is de afgesproken onzin-waarde in deze test.
      return { status: (val===0xEE) ? 'onzin' : 'ok' };
    }
    // De nep-adapter. Elke uitvraag telt mee, en na _breekNa uitvragen zet
    // hij de afbreekvlag — precies zoals de gebruiker op "afbreken" drukt.
    async function sendCmd(cmd, ms){
      var pid='01'+String(cmd).slice(2,4).toUpperCase();
      _gescand.push(pid);
      if(_breekNa>=0 && _gescand.length>=_breekNa) _healthAbort=true;
      return Object.prototype.hasOwnProperty.call(_antwoorden,pid) ? _antwoorden[pid] : '41'+pid.slice(2)+'50';
    }
    async function withBus(naam, fn, ms){ return await fn(); }
  `, s, { filename: 'sandbox-omgeving' });

  vm.runInContext(
    knip(lees('pidlane-rijsituatie.js'), 'let _healthAbort=false;', 'function autoSelectHealthyKern', 'gezondheid'),
    s, { filename: 'pidlane-rijsituatie.js (knip)' });

  if (typeof s.healthUitProfiel !== 'function' || typeof s.initialHealthScan !== 'function') {
    console.error('FOUT: healthUitProfiel/initialHealthScan niet gevonden — hernoemd?');
    process.exit(1);
  }
  s.lezen = expr => vm.runInContext(expr, s);
  return s;
}

// ══════════════════════════════════════════════════════════════════
(async function () {

  console.log('\n— oordeel overnemen uit het voertuigprofiel —');
  {
    const s = bouw();
    s.lezen("supportedPIDs = new Set(['010C','015C','0114','2101']);");
    const uit = s.healthUitProfiel({ '010C': 'ok', '015C': 'nodata', '0114': 'onzin' });

    t('overnemen lukt', uit, true);
    t('bekend ok blijft ok', s.lezen("_pidHealth['010C']"), 'ok');
    t('bekend nodata blijft nodata', s.lezen("_pidHealth['015C']"), 'nodata');
    t('bekend onzin blijft onzin', s.lezen("_pidHealth['0114']"), 'onzin');
    // De regel waar het om gaat: een sensor die niet in het profiel stond mag
    // niet stilzwijgend uitgegrijsd raken.
    t('ONBEKENDE pid wordt ok, niet grijs', s.lezen("_pidHealth['2101']"), 'ok');
    t('alleen supportedPIDs krijgen een oordeel', s.lezen('Object.keys(_pidHealth).length'), 4);
    t('de gebruiker ziet dat de scan is overgeslagen',
      /scan overgeslagen/.test(s._btlog.join(' | ')), true);
  }

  console.log('\n— een profiel dat niets voorstelt —');
  {
    const s = bouw();
    s.lezen("supportedPIDs = new Set(['010C']);");
    t('null wordt geweigerd', s.healthUitProfiel(null), false);
    t('een string wordt geweigerd', s.healthUitProfiel('nee'), false);
    t('undefined wordt geweigerd', s.healthUitProfiel(undefined), false);
    t('en er is niets geschreven', s.lezen('Object.keys(_pidHealth).length'), 0);
  }

  console.log('\n— een afgebroken scan laat geen sensoren als kapot achter —');
  {
    // Vijf sensoren, afbreken na twee. De drie die niet aan de beurt kwamen
    // moeten 'ok' krijgen: "niet beoordeeld" mag nooit als "kapot" eindigen.
    const s = bouw({ breekNa: 2 });
    s.lezen("supportedPIDs = new Set(['010C','010D','0105','010B','010F']);");
    await s.initialHealthScan();

    t('er is echt afgebroken', s.lezen('_healthAbort'), true);
    t('twee sensoren zijn bevraagd', s.lezen('_gescand.length'), 2);
    t('alle vijf hebben tóch een oordeel', s.lezen('Object.keys(_pidHealth).length'), 5);
    t('een niet-bevraagde sensor is ok', s.lezen("_pidHealth['010F']"), 'ok');
    t('geen enkele sensor heet onzin',
      s.lezen("Object.values(_pidHealth).filter(function(v){return v==='onzin';}).length"), 0);
    t('geen enkele sensor heet nodata',
      s.lezen("Object.values(_pidHealth).filter(function(v){return v==='nodata';}).length"), 0);
    t('het afbreken wordt gemeld', /afgebroken/.test(s._btlog.join(' | ')), true);
    t('en de log zegt dat alles kiesbaar blijft',
      /alle sensoren blijven kiesbaar/.test(s._log.join(' | ')), true);
  }

  console.log('\n— een volledige scan oordeelt wél —');
  {
    const s = bouw({
      antwoorden: {
        '010C': '410C50',        // gewone waarde  -> ok
        '010D': 'NO DATA',       // niet aanwezig  -> nodata
        '0105': '410550',        // gewone waarde  -> ok
        '010B': '410BEE'         // 0xEE           -> onzin
      }
    });
    s.lezen("supportedPIDs = new Set(['010C','010D','0105','010B']);");
    await s.initialHealthScan();

    t('alles is bevraagd', s.lezen('_gescand.length'), 4);
    t('een gewone waarde is ok', s.lezen("_pidHealth['010C']"), 'ok');
    t('NO DATA is niet aanwezig', s.lezen("_pidHealth['010D']"), 'nodata');
    t('onzin is onzin', s.lezen("_pidHealth['010B']"), 'onzin');
    t('de telling staat in de melding',
      /2 ondersteund, 1 niet aanwezig, 1 ongeldig/.test(s._btlog.join(' | ')), true);
  }

  console.log('\n— de veiligheidsfallback: nul geldig kan niet kloppen —');
  {
    // Kwam er wél data binnen maar is niets goedgekeurd, dan is de check zelf
    // stuk — niet de auto. Alles terug naar 'ok', anders staat de hele lijst
    // grijs en kan de gebruiker niets meer kiezen.
    const s = bouw({ antwoorden: { '010C': '410CEE', '0105': '0105EE', '010B': '410BEE' } });
    s.lezen("supportedPIDs = new Set(['010C','0105','010B']);");
    await s.initialHealthScan();

    t('geen enkele sensor blijft op onzin staan',
      s.lezen("Object.values(_pidHealth).filter(function(v){return v==='onzin';}).length"), 0);
    t('alles is kiesbaar gemaakt',
      s.lezen("Object.values(_pidHealth).filter(function(v){return v==='ok';}).length"), 3);
    t('en dat wordt als waarschuwing gemeld',
      /fallback alles beschikbaar/.test(s._btlog.join(' | ')), true);
  }

  console.log('\n— demomodus meet niet, maar grijst ook niets uit —');
  {
    const s = bouw();
    s.lezen("demoMode = true; supportedPIDs = new Set(['010C','0105','2101']);");
    await s.initialHealthScan();
    t('er is niets bevraagd', s.lezen('_gescand.length'), 0);
    t('en toch staat alles op ok',
      s.lezen("Object.values(_pidHealth).filter(function(v){return v==='ok';}).length"), 3);
  }

  console.log('\n— wanneer wordt er om bevestiging gevraagd —');
  {
    // Deze poort staat midden in de verbindingsflow van pidlane-bt.js en is
    // zonder adapter niet aan te roepen. Daarom hier op de bron, mét reden —
    // wat bewaakt wordt is dat de vier voorwaarden er alle vier in staan.
    const bron = lees('pidlane-bt.js');
    const regel = (bron.match(/if\s*\(usedProfile && _ph && [^\n]*\)/) || [''])[0];
    t('de poort bestaat nog', regel.length > 0, true);
    t('alleen met een gebruikt profiel', /usedProfile/.test(regel), true);
    t('alleen met een gevuld oordeel', /Object\.keys\(_ph\)\.length/.test(regel), true);
    t('nooit in demomodus', /!demoMode/.test(regel), true);

    const bewaar = (bron.match(/if\s*\(knownVin && supportedPIDs\.size[^\n]*\)/) || [''])[0];
    t('opslaan vraagt om een bekende VIN', /knownVin/.test(bewaar), true);
    t('en slaat niet op na een overgeslagen scan', /!usedProfile \|\| !_slaScanOver/.test(bewaar), true);
  }

  console.log('\n─────────────────────────────────────────');
  console.log(ok + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})();
