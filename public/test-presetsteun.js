// ═══════════════════════════════════════════════════════════════════
// test-presetsteun.js — de preset als aanname, en wat OBDb erover zegt (#616, #670)
// ───────────────────────────────────────────────────────────────────
// applyVehiclePIDPreset() voegt op merk en brandstof PIDs toe. Is er geen
// steunbitblok gelezen (Nissan Leaf: geen mode 01), dan gaat alles erin: op
// de nagebouwde vloot elf spook-PIDs. presetNaSteun() haalt eruit wat de
// mode-01-lijst van OBDb voor model en bouwjaar niet noemt, tenzij een
// steunbit of een geldig antwoord hem bevestigt.
//
// Geladen uit de echte pidlane-rijsituatie.js (twee knippen met ankers) en de
// echte pidlane-data.js. TEGENPROEF (plmutate.sh): een geldig antwoord telt
// niet meer als bewijs, en de preset onthoudt zijn aannames niet — rood.
//
// Draaien vanuit public/:  node test-presetsteun.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
function knip(bron, van, tot) {
  const a = bron.indexOf(van);
  if (a < 0) throw new Error('anker niet gevonden: ' + van);
  const b = bron.indexOf(tot, a);
  if (b < 0) throw new Error('eindanker niet gevonden: ' + tot);
  return bron.slice(a, b + tot.length);
}
const RS = fs.readFileSync(__dirname + '/pidlane-rijsituatie.js', 'utf8');
const STEUN = knip(RS, 'let _steunbits = {};', 'window.magToevoegen = magToevoegen;');
const MEET = knip(RS, 'async function plMeetBlok(blok){', '  return erbij;\n}');
const PRESET = knip(RS, '// ── De preset als aanname', "  log(`🔧 PID preset: ${toegevoegd} PIDs voor ${m||'onbekend'} ${b||'benzine'} ${jaar||''}`, 'ok');\n  buildDiscoveredPIDList();\n}");

function bouw() {
  const s = { console, opgeruimd: [], diag: [] };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(`
    var supportedPIDs = new Set(), _pidHealth = {};
    function btDiag(t){ diag.push(t); } function log(){} function buildDiscoveredPIDList(){}
    function pidOpruimen(p, r){ opgeruimd.push(p); }
    var antwoord = {}; async function sendCmd(p){ return antwoord[p] !== undefined ? antwoord[p] : 'NO DATA'; } async function delay(){}
  ` + STEUN + '\n' + PRESET + '\n' + MEET + `
    this.antwoord = antwoord; this.meet = plMeetBlok;
    this.nee = function(blok){ _steunNeeBlok(blok); };
    this.zet = function(blok, woord){ _steunbitsOnthoud(blok, woord); };
    this.sup = function(){ return Array.from(supportedPIDs).sort(); };
    this.gezond = function(p){ _pidHealth[p] = 'ok'; };
  `, s, { filename: 'pidlane-rijsituatie.js (knip)' });
  return s;
}

// ── Leaf: geen enkel steunbitblok, de preset neemt alles aan ──
{
  const s = bouw();
  s.applyVehiclePIDPreset('NISSAN', 'Elektriciteit', 2019);
  const na = s.sup();
  waar('zonder steunbits zet de preset PIDs erin (de kwaal van #616)', na.length >= 5, na.join(','));
  waar('en onthoudt ze als aanname', s.presetAanname().length === na.length, s.presetAanname().join(','));
  const weg = s.presetNaSteun([]);
  waar('een geldige lijst zonder mode 01 (de Leaf): alles weg', s.sup().length === 0 && weg.length === na.length, s.sup().join(','));
  waar('elke weggehaalde sensor gaat langs pidOpruimen (zichtbaar in het log)', s.opgeruimd.length === weg.length);
  waar('en één regel in het BT-log met de lijst', s.diag.some((t) => /Preset na OBDb: \d+ aangenomen/.test(t)), s.diag.join(' | '));
  waar('geen steunlijst (null) doet niets', s.presetNaSteun(null).length === 0);
}

// ── Wat OBDb noemt, een steunbit, of een geldig antwoord blijft ──
{
  const s = bouw();
  // Blok 01–20 gelezen: alleen 010C (bit 12) en 010D (bit 13) aan; de rest van dat blok is ontkend.
  s.zet(0, ((1 << (32 - 12)) | (1 << (32 - 13))) >>> 0);
  s.applyVehiclePIDPreset('MAZDA', 'Benzine', 2018);
  const aan = s.presetAanname();
  waar('een PID met steunbit is geen aanname (010C)', aan.indexOf('010C') < 0, aan.join(','));
  waar('een ontkende PID komt er niet in (0105 in blok 1, bit uit)', s.sup().indexOf('0105') < 0, s.sup().join(','));
  const buiten = aan.filter((p) => parseInt(p.slice(2), 16) > 0x20);
  waar('voorbij het gelezen blok neemt de preset aan', buiten.length >= 2, aan.join(','));
  const houd = buiten[0], antwoordde = buiten[1];
  s.gezond(antwoordde);
  const weg = s.presetNaSteun([houd]);
  waar('wat OBDb noemt blijft (' + houd + ')', s.sup().indexOf(houd) >= 0);
  waar('wat een geldige waarde gaf blijft, ook buiten OBDb (' + antwoordde + ')', s.sup().indexOf(antwoordde) >= 0 && weg.indexOf(antwoordde) < 0, weg.join(','));
  waar('de rest gaat weg', buiten.slice(2).every((p) => s.sup().indexOf(p) < 0) && weg.length === buiten.length - 2, weg.join(','));
  waar('010C (steunbit) blijft altijd', s.sup().indexOf('010C') >= 0);
  waar('een tweede keer doet niets meer', s.presetNaSteun([houd]).length === 0);
}

// ── Na Snel (#616 rest, 05-11-2026): wat deze sessie NO DATA gaf, houdt de preset tegen ──
(async () => {
  {
    const s = bouw();
    // Leaf: 0100 onleesbaar → blok 0 per PID gemeten, alles NO DATA; 0140 'nee'.
    await s.meet(0);
    s.nee(0x40);
    s.applyVehiclePIDPreset('NISSAN', 'Elektriciteit', 2019);
    waar('Leaf na Snel: geen enkele preset-PID meer (010C, 0142, 015B, …)', s.sup().length === 0, s.sup().join(','));
    waar('en het BT-log zegt welke de preset oversloeg', s.diag.some((t) => /Preset: \d+ niet toegevoegd/.test(t)), s.diag.join(' | '));
  }
  {
    const s = bouw();
    // Een PID die bij het meten antwoordt bestaat; leeg of STOPPED is geen meting.
    s.antwoord['010C'] = '41 0C 0B B8'; s.antwoord['010D'] = ''; s.antwoord['0105'] = 'STOPPED';
    await s.meet(0);
    s.applyVehiclePIDPreset('NISSAN', 'Benzine', 2019);
    const na = s.sup();
    waar('wat antwoordde staat erin (010C)', na.indexOf('010C') >= 0, na.join(','));
    waar('een leeg antwoord of STOPPED houdt de preset niet tegen (010D, 0105)', na.indexOf('010D') >= 0 && na.indexOf('0105') >= 0, na.join(','));
    waar('een kale NO DATA wel (010B)', na.indexOf('010B') < 0, na.join(','));
    waar('buiten de gemeten blokken neemt de preset nog aan (0142)', na.indexOf('0142') >= 0, na.join(','));
  }
  {
    const s = bouw();
    // Een steunbit wint van een NO DATA: de bitmap is een antwoord van de ECU zelf.
    s.zet(0, (1 << (32 - 12)) >>> 0);
    s.nee(0);
    s.applyVehiclePIDPreset('MAZDA', 'Benzine', 2018);
    waar('steunbit aan + NO DATA gemeten: 010C blijft', s.sup().indexOf('010C') >= 0, s.sup().join(','));
  }
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})();
