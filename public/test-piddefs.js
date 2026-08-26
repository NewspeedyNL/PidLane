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
function laadPidDefs() {
  const s = {};
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
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

// Een steunbitmap is de inhoudsopgave van mode 01, geen meting. Staat er een
// sensordefinitie voor, dan pakt elke consument die ALL_PID_DEFS rechtstreeks
// leest 'm alsnog op — langs pidGate() heen.
function keurBitmapsGeenSensor(defs, geenSensor) {
  return geenSensor.filter(function (p) { return !!defs[p]; })
                   .map(function (p) { return p + ' staat als sensor in ALL_PID_DEFS (' + (defs[p].name || 'naamloos') + ')'; });
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
toetsSchoon('geen enkele steunbitmap heeft een sensordefinitie',
  keurBitmapsGeenSensor(DEFS, GEEN_SENSOR));

// ── tegenproef: elke controle moet de oude fout terugvinden ──
toetsMeldt('definitie weghalen wordt gezien',
  keurSecundaireTrims(met(DEFS, function (d) { delete d['0155']; })), '0155');

toetsMeldt('terugval op de rauwe byte wordt gezien (de fout van 25-08)',
  keurSecundaireTrims(met(DEFS, function (d) { d['0156'] = { name: 'rauw', parse: function (b) { return b[0]; } }; })), '0156');

toetsMeldt('een halve schaalfout wordt gezien',
  keurSecundaireTrims(met(DEFS, function (d) { d['0155'] = { name: 'scheef', parse: function (b) { return b[0] / 2.56 - 100; } }; })), '0155');

toetsMeldt('uiteenlopen van 0106 en 0155 wordt gezien',
  keurTrimsGelijkGeschaald(met(DEFS, function (d) { d['0155'] = { name: 'anders', parse: function (b) { return b[0] / 1.28 - 99; } }; })), '0155');

toetsMeldt('0180 terugzetten als sensor wordt gezien (de fout van 23-08)',
  keurBitmapsGeenSensor(met(DEFS, function (d) { d['0180'] = { name: 'Motor looptijd totaal', parse: function (b) { return b[0]; } }; }), GEEN_SENSOR), '0180');

toetsMeldt('01A0 terugzetten als sensor wordt gezien',
  keurBitmapsGeenSensor(met(DEFS, function (d) { d['01A0'] = { name: 'Tussenkoeler temp A', parse: function (b) { return b[0] - 40; } }; }), GEEN_SENSOR), '01A0');

toetsSchoon('twee bitmaps tegelijk geven twee meldingen',
  keurBitmapsGeenSensor(met(DEFS, function (d) {
    d['0180'] = { name: 'x', parse: function (b) { return b[0]; } };
    d['0120'] = { name: 'y', parse: function (b) { return b[0]; } };
  }), GEEN_SENSOR).length === 2 ? [] : ['verwachtte twee meldingen']);

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
