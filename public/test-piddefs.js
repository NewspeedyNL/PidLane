// ══════════════════════════════════════════════════════════════════
// test-piddefs.js — de PID-tabel klopt, en dat blijft zo
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Twee bevindingen uit de batch van 26-08 gingen allebei over de PID-tabel,
// en allebei waren ze pas in de auto zichtbaar:
//
//   0155/0156  stonden niet in ALL_PID_DEFS. Daardoor kwam de rauwe byte op
//              het scherm — 27 minuten lang "128" waar 0% hoorde te staan.
//   0180/01A0  stonden er juist WEL in, als "Motor looptijd totaal" en
//              "Tussenkoeler temp A", terwijl het de steunbitmaps voor
//              PIDs 81-A0 en A1-C0 zijn. GEEN_SENSOR_PIDS hield ze al buiten
//              de keuzelijst, maar elk pad dat ALL_PID_DEFS rechtstreeks
//              leest polde ze alsnog als sensor (0180 = 262157, 01A0 = -24).
//
// Later bijgekomen, zelfde soort fout uit de rit van 21-08:
//   0143       rekende 256x te laag door de deler 655.35 in plaats van 2.55.
//
// Beide controles stonden eerst alleen in blok 5 van de testrun. Dat werkt,
// maar blok 5 draait in een browser, op een telefoon, in een auto — dus de
// tegenproef gebeurde één keer met de hand bij het schrijven en daarna nooit
// meer. Een tegenproef die niet meedraait is documentatie van een intentie,
// geen staande garantie.
//
// Deze twee controles hebben geen DOM, geen bus en geen verbinding nodig:
// ze lezen alleen de tabellen. Daarom draaien ze hier, onder node, bij elke
// commit via plcheck.sh — mét de tegenproef als tweede helft van het bestand.
//
// WAT DE TEGENPROEF DOET
// Elke controle wordt twee keer gedraaid: één keer op de echte tabel (moet
// schoon zijn) en één keer op een kopie waarin de oude fout bewust is
// teruggezet (moet die fout noemen). Zonder die tweede helft weet je niet of
// de controle nog iets kan vinden — precies de failliete test waar dit
// project al eerder tegenaan liep.
//
// Draaien vanuit public/:  node test-piddefs.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

// ── de tabellen inlezen ───────────────────────────────────────────
// pidlane-data.js is een classic script dat alles op window hangt; een
// sandbox waarin window naar zichzelf wijst is genoeg om 'm te draaien.
let BYTE_LEN = null;
function laadPidDefs() {
  const s = {};
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  BYTE_LEN = s.PID_BYTE_LEN;
  return s.ALL_PID_DEFS;
}

// GEEN_SENSOR_PIDS is een const op scriptniveau in pidlane-rijsituatie.js —
// die komt niet op window, en de rest van dat bestand heeft de browser nodig.
// Dus lezen we de ene regel die telt uit de bron. Verandert de vorm van die
// regel, dan faalt deze test luidruchtig; dat is de bedoeling, want het is
// een dragend feit en geen detail.
function laadGeenSensorPids() {
  const bron = fs.readFileSync('pidlane-rijsituatie.js', 'utf8');
  const m = bron.match(/const\s+GEEN_SENSOR_PIDS\s*=\s*new Set\(\s*\[([^\]]*)\]\s*\)/);
  if (!m) throw new Error('GEEN_SENSOR_PIDS niet gevonden in pidlane-rijsituatie.js — is de declaratie verplaatst of hernoemd?');
  const pids = (m[1].match(/'([0-9A-Fa-f]{4})'/g) || []).map(function (x) { return x.replace(/'/g, ''); });
  if (!pids.length) throw new Error('GEEN_SENSOR_PIDS gevonden maar leeg — dan toetst deze test niets');
  return pids;
}

// ── de controles, als losse functies zodat de tegenproef ze kan hergebruiken ──

// 0155/0156 zijn de secundaire brandstoftrims. Byte 128 (0x80) is neutraal en
// hoort 0% te geven; komt daar 128 uit, dan ontbreekt de definitie weer en
// valt de app terug op de rauwe byte.
function keurSecundaireTrims(defs) {
  const uit = [];
  ['0155', '0156'].forEach(function (p) {
    const d = defs[p];
    if (!d || typeof d.parse !== 'function') { uit.push(p + ': geen definitie of geen parser'); return; }
    const v = d.parse([128]);
    if (typeof v !== 'number' || isNaN(v)) { uit.push(p + ': parser geeft geen getal bij byte 128'); return; }
    if (Math.abs(v) > 0.01) uit.push(p + ': byte 128 geeft ' + v + ', hoort 0 (neutrale trim)');
  });
  return uit;
}

// De secundaire trim hoort exact zo te schalen als de primaire (0106/0107).
// Dit legt de bedoeling vast in plaats van alleen de uitkomst: wijzigt de
// schaal van 0106 ooit, dan moet 0155 meebewegen en niet stil uiteenlopen.
function keurTrimsGelijkGeschaald(defs) {
  const uit = [];
  [['0106', '0155'], ['0107', '0156']].forEach(function (paar) {
    const a = defs[paar[0]], b = defs[paar[1]];
    if (!a || !b || typeof a.parse !== 'function' || typeof b.parse !== 'function') {
      uit.push(paar[0] + '/' + paar[1] + ': een van beide heeft geen parser'); return;
    }
    [0, 64, 128, 192, 255].forEach(function (byte) {
      const va = a.parse([byte]), vb = b.parse([byte]);
      if (Math.abs(va - vb) > 0.01)
        uit.push(paar[1] + ' schaalt anders dan ' + paar[0] + ' bij byte ' + byte + ': ' + vb + ' tegen ' + va);
    });
  });
  return uit;
}

// 0143 (absolute motorbelasting) stond 256x naast: de deler was 655.35
// (= 65535/100) terwijl SAE J1979 (A x 256 + B) x 100 / 255 voorschrijft.
// Nooit opgevallen omdat de demomodus kant-en-klare procenten voedt. De drie
// ijkpunten hieronder zijn echte veldmetingen op de CX-5; ze staan ook in het
// commentaar bij de definitie in pidlane-data.js.
const IJKPUNTEN_0143 = [
  { b: [0x00, 0x48], hoort: 28.2 },
  { b: [0x00, 0x29], hoort: 16.1 },
  { b: [0x00, 0x38], hoort: 22.0 }   // 21-08, stationair
];

function keurAbsoluteBelasting(defs) {
  const d = defs['0143'];
  if (!d || typeof d.parse !== 'function') return ['0143: geen definitie of geen parser'];
  const uit = [];
  IJKPUNTEN_0143.forEach(function (p) {
    const v = d.parse(p.b);
    if (typeof v !== 'number' || isNaN(v)) { uit.push('0143: parser geeft geen getal bij B=' + p.b[1]); return; }
    if (Math.abs(v - p.hoort) > 0.1)
      uit.push('0143: B=' + p.b[1] + ' geeft ' + (Math.round(v * 100) / 100) + ', hoort ' + p.hoort + '%');
  });
  // max moest van 100 naar 400 mee. Bij overdruk loopt absolute belasting ruim
  // over de 100%; met max 100 melden veldlab en koopcheck de gerepareerde
  // waarde meteen als "buiten bereik" — een nieuw vals alarm in ruil voor het
  // oude. Deze helft van de fix is dus net zo dragend als de deler.
  if (!(d.max >= 400)) uit.push('0143: max staat op ' + d.max + ', hoort >= 400 (turbo loopt over 100%)');
  return uit;
}

// Een steunbitmap is de inhoudsopgave van mode 01, geen meting. Staat er een
// sensordefinitie voor, dan pakt elke consument die ALL_PID_DEFS rechtstreeks
// leest 'm alsnog op — langs pidGate() heen.
function keurBitmapsGeenSensor(defs, geenSensor) {
  return geenSensor.filter(function (p) { return !!defs[p]; })
                   .map(function (p) { return p + ' staat als sensor in ALL_PID_DEFS (' + (defs[p].name || 'naamloos') + ')'; });
}

// ── SAE-ankers (26-09-2026) ───────────────────────────────────────
// Vanaf 0169 stond de tabel op de verkeerde nummers: 019E heette "Turbo temp
// uitlaat A" en gaf −38 °C, 018E "NOx doseerpomp", 01A6 "Brandstof verbruik
// abs". Allemaal geloofwaardig ogende getallen, en daarom zag niemand het.
// Deze ankers zijn de BUITENKANT: de SAE-indeling zoals python-OBD, ELMduino
// en AndrOBD hem eensluidend geven, met per PID een woord dat in de naam hoort
// en één voorbeeldantwoord (databytes na 41 xx) met de uitkomst volgens de
// norm. Dit is geen kopie van een tabel die de app ook heeft — het is de norm
// waartegen die tabel gemeten wordt.
const SAE_ANKERS = [
  { pid: '0117', woord: /B1S4/,             b: [0x64, 0xFF],               hoort: 0.5 },
  { pid: '014A', woord: /pedaal.* E$/i,     b: [0x80],                     hoort: 50.2 },
  { pid: '014B', woord: /pedaal.* F$/i,     b: [0x80],                     hoort: 50.2 },
  { pid: '014C', woord: /gestuurd/i,        b: [0xFF],                     hoort: 100 },
  { pid: '0169', woord: /EGR/,              b: [0x02, 0x00, 0xFF],         hoort: 100 },
  { pid: '016B', woord: /EGR.*temp/i,       b: [0x01, 0x7D],               hoort: 85 },
  { pid: '0170', woord: /laaddruk/i,        b: [0x02, 0, 0, 0x10, 0x00],   hoort: 128 },
  { pid: '017A', woord: /DPF/,              b: [0x01, 0x03, 0xE8],         hoort: 10 },
  { pid: '017C', woord: /DPF/,              b: [0x01, 0x10, 0x68],         hoort: 380 },
  { pid: '0183', woord: /NOx/,              b: [0x01, 0x01, 0x9C],         hoort: 412 },
  { pid: '0185', woord: /AdBlue/,           b: [0x04, 0, 0, 0, 0, 0xFF],   hoort: 100 },
  { pid: '018E', woord: /wrijving/i,        b: [0x7D],                     hoort: 0 },
  { pid: '019E', woord: /uitlaatgasdebiet/i, b: [0x01, 0xF4],              hoort: 10 },
  { pid: '01A2', woord: /cilinder/i,        b: [0x00, 0x40],               hoort: 2 },
  { pid: '01A6', woord: /kilometer/i,       b: [0x00, 0x25, 0xD7, 0x90],   hoort: 0x0025D790 / 10 }
];
function keurSaeAnkers(defs) {
  const uit = [];
  SAE_ANKERS.forEach(function (a) {
    const d = defs[a.pid];
    if (!d || typeof d.parse !== 'function') { uit.push(a.pid + ': geen definitie of geen parser'); return; }
    if (!a.woord.test(d.name || '')) uit.push(a.pid + ': heet "' + d.name + '", hoort ' + a.woord + ' te dragen');
    const v = d.parse(a.b);
    if (typeof v !== 'number' || Math.abs(v - a.hoort) > 0.06)
      uit.push(a.pid + ': ' + JSON.stringify(a.b) + ' geeft ' + v + ', hoort ' + a.hoort);
  });
  return uit;
}

// Byte 0 van een blok-PID (vanaf 66, langer dan twee bytes volgens
// PID_BYTE_LEN) is de steunbitmap. Staat geen enkel bit aan, dan is er niets
// gemeten en hoort de parser null te geven. Leest hij die bitmap als databyte
// — de fout die in juli al bij 0165–0168 zat en in september bij 0169–01A6 —
// dan komt er bij een lege bitmap tóch een getal uit.
// 64: koppelpunten zonder steunbyte; 65: zelf een statusveld; A6: de
// kilometerstand is een kaal getal van vier bytes.
const GEEN_BITMAP = new Set(['0164', '0165', '01A6']);
function keurBitmapNietAlsData(defs, lengtes) {
  const uit = [];
  Object.keys(defs).forEach(function (pid) {
    const n = parseInt(pid.slice(2), 16), len = lengtes[pid.slice(2)];
    if (!(n >= 0x64) || !(len > 2) || GEEN_BITMAP.has(pid)) return;
    const d = defs[pid];
    if (!d || typeof d.parse !== 'function' || d.unit === 'code') return;
    const b = [0]; for (let i = 1; i < len; i++) b.push(0x7F);
    const v = d.parse(b);
    if (v !== null) uit.push(pid + ' (' + d.name + '): steunbitmap leeg en toch ' + v + ' — leest hij de bitmap als data?');
  });
  return uit;
}

// ── toetshulpjes ─────────────────────────────────────────────────
let fout = 0;

function toetsSchoon(naam, gemeten) {
  if (gemeten.length === 0) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  gemeten.forEach(function (r) { console.log('        ' + r); });
}

function toetsMeldt(naam, gemeten, moetNoemen) {
  const raak = gemeten.some(function (r) { return r.indexOf(moetNoemen) === 0 || r.indexOf(moetNoemen) > -1; });
  if (raak) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  console.log('        de controle bleef stil terwijl hij ' + moetNoemen + ' had moeten noemen');
  console.log('        kreeg: ' + (gemeten.length ? gemeten.join(' | ') : '(niets)'));
}

// Een kopie met één bewuste fout erin. De echte tabel blijft ongemoeid.
function met(defs, wijziging) {
  const kopie = Object.assign({}, defs);
  wijziging(kopie);
  return kopie;
}

// ── draaien ──────────────────────────────────────────────────────
console.log('PID-definities — tabel schoon, en de controles kunnen rood worden\n');

const DEFS = laadPidDefs();
const GEEN_SENSOR = laadGeenSensorPids();

// Eerst de loader zelf. Geeft die stilletjes een lege tabel terug, dan slagen
// alle controles hieronder omdat er niets te vinden valt — een test die niet
// rood kán worden. Dus expliciet vastpinnen dat er data is.
toetsSchoon('ALL_PID_DEFS is gevuld',
  Object.keys(DEFS).length > 50 ? [] : ['maar ' + Object.keys(DEFS).length + ' PIDs geladen — laadt pidlane-data.js nog wel?']);
toetsSchoon('GEEN_SENSOR_PIDS is gevuld',
  GEEN_SENSOR.length >= 8 ? [] : ['maar ' + GEEN_SENSOR.length + ' steunbitmaps gelezen']);

// ── de echte tabel moet schoon zijn ──
toetsSchoon('0155/0156 hebben een definitie en byte 128 geeft 0%',
  keurSecundaireTrims(DEFS));
toetsSchoon('secundaire trim schaalt gelijk aan de primaire',
  keurTrimsGelijkGeschaald(DEFS));
toetsSchoon('0143 klopt op alle drie de veldmetingen, max dekt overdruk',
  keurAbsoluteBelasting(DEFS));
toetsSchoon('geen enkele steunbitmap heeft een sensordefinitie',
  keurBitmapsGeenSensor(DEFS, GEEN_SENSOR));
toetsSchoon('PID_BYTE_LEN is gevuld',
  BYTE_LEN && Object.keys(BYTE_LEN).length > 100 ? [] : ['PID_BYTE_LEN niet geladen — dan toetst de bitmapcontrole niets']);
toetsSchoon(SAE_ANKERS.length + ' PIDs dragen hun SAE-naam en rekenen volgens de norm',
  keurSaeAnkers(DEFS));
toetsSchoon('geen blok-PID leest zijn steunbitmap als meetwaarde',
  keurBitmapNietAlsData(DEFS, BYTE_LEN));

// ── tegenproef: elke controle moet de oude fout terugvinden ──
toetsMeldt('definitie weghalen wordt gezien',
  keurSecundaireTrims(met(DEFS, function (d) { delete d['0155']; })), '0155');

toetsMeldt('terugval op de rauwe byte wordt gezien (de fout van 25-08)',
  keurSecundaireTrims(met(DEFS, function (d) { d['0156'] = { name: 'rauw', parse: function (b) { return b[0]; } }; })), '0156');

toetsMeldt('een halve schaalfout wordt gezien',
  keurSecundaireTrims(met(DEFS, function (d) { d['0155'] = { name: 'scheef', parse: function (b) { return b[0] / 2.56 - 100; } }; })), '0155');

toetsMeldt('uiteenlopen van 0106 en 0155 wordt gezien',
  keurTrimsGelijkGeschaald(met(DEFS, function (d) { d['0155'] = { name: 'anders', parse: function (b) { return b[0] / 1.28 - 99; } }; })), '0155');

toetsMeldt('de oude 655.35-deler van 0143 wordt gezien (de fout van 21-08)',
  keurAbsoluteBelasting(met(DEFS, function (d) {
    d['0143'] = { name: 'oud', max: 400, parse: function (b) { return (b[0] * 256 + b[1]) / 655.35; } };
  })), '0143');

toetsMeldt('max terugzetten op 100 wordt gezien (nieuw vals alarm op een turbo)',
  keurAbsoluteBelasting(met(DEFS, function (d) {
    d['0143'] = { name: 'krap', max: 100, parse: DEFS['0143'].parse };
  })), 'max staat op 100');

toetsMeldt('0143 zonder parser wordt gezien',
  keurAbsoluteBelasting(met(DEFS, function (d) { delete d['0143']; })), '0143');

toetsMeldt('0180 terugzetten als sensor wordt gezien (de fout van 23-08)',
  keurBitmapsGeenSensor(met(DEFS, function (d) { d['0180'] = { name: 'Motor looptijd totaal', parse: function (b) { return b[0]; } }; }), GEEN_SENSOR), '0180');

toetsMeldt('01A0 terugzetten als sensor wordt gezien',
  keurBitmapsGeenSensor(met(DEFS, function (d) { d['01A0'] = { name: 'Tussenkoeler temp A', parse: function (b) { return b[0] - 40; } }; }), GEEN_SENSOR), '01A0');

toetsMeldt('de oude 019E ("Turbo temp uitlaat A", A−40) wordt gezien (de fout van 26-09)',
  keurSaeAnkers(met(DEFS, function (d) { d['019E'] = { name: 'Turbo temp uitlaat A', parse: function (b) { return b[0] - 40; } }; })), '019E');

toetsMeldt('de oude 0170 (bitmap als hoge byte) wordt gezien',
  keurSaeAnkers(met(DEFS, function (d) { d['0170'] = { name: 'Laaddruk A', parse: function (b) { return (b[0] * 256 + b[1]) * 0.03125; } }; })), '0170');

toetsMeldt('een goede formule onder een verschoven naam wordt gezien',
  keurSaeAnkers(met(DEFS, function (d) { d['018E'] = { name: 'NOx doseerpomp', parse: DEFS['018E'].parse }; })), '018E');

toetsMeldt('014A terug op "pedaal D" wordt gezien',
  keurSaeAnkers(met(DEFS, function (d) { d['014A'] = { name: 'Gaspedaal positie D', parse: DEFS['014A'].parse }; })), '014A');

toetsMeldt('de oude 017A (bitmap als hoge byte) wordt gezien door de bitmapcontrole',
  keurBitmapNietAlsData(met(DEFS, function (d) { d['017A'] = { name: 'Uitlaatgas temp B2S3', unit: '°C', parse: function (b) { return (b[0] * 256 + b[1]) * 0.1 - 40; } }; }), BYTE_LEN), '017A');

toetsMeldt('een steunbit dat niet gelezen wordt (0185 AdBlue) wordt gezien',
  keurBitmapNietAlsData(met(DEFS, function (d) { d['0185'] = { name: 'AdBlue tankniveau', unit: '%', parse: function (b) { return b[5] * 100 / 255; } }; }), BYTE_LEN), '0185');

toetsSchoon('twee bitmaps tegelijk geven twee meldingen',
  keurBitmapsGeenSensor(met(DEFS, function (d) {
    d['0180'] = { name: 'x', parse: function (b) { return b[0]; } };
    d['0120'] = { name: 'y', parse: function (b) { return b[0]; } };
  }), GEEN_SENSOR).length === 2 ? [] : ['verwachtte twee meldingen']);

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
