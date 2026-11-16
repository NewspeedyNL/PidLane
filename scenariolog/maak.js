// ══════════════════════════════════════════════════════════════════
// scenariolog/maak.js — de verzonnen scenariologs (16-11-2026)
// ──────────────────────────────────────────────────────────────────
// Elke log is een verzonnen rit met één bedoeling, in het formaat van een
// andere app (Torque breed, Car Scanner lang met komma-decimalen, de eigen
// export met PID-koppen). De kop zegt wat de APP moet oordelen (BASIS), wat
// de AI moet kunnen ZIEN (SIGNAAL) en — voor later, laag B — wat de AI moet
// en niet mag zeggen. test-scenariolog.js toetst BASIS en SIGNAAL.
//
// Deterministisch (eigen ruis met vast zaad). Opnieuw maken:
//   node scenariolog/maak.js
// Verander je een rit, kijk dan of de kop nog klopt: die verwachting is een
// besluit van een mens, de test maakt hem niet passend.
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let zaad = 11;
const ruis = a => { zaad = (zaad * 16807) % 2147483647; return ((zaad / 2147483647) - 0.5) * 2 * a; };
const r1 = v => Math.round(v * 10) / 10;
const DUUR = 1260;  // 21 minuten, 1 Hz

/* De rit: 60 s stationair, rijden tot DUUR-90, dan stationair. */
function rit(t) {
  const rijdt = t >= 60 && t < DUUR - 90;
  const kmh = rijdt ? Math.max(0, 55 + 30 * Math.sin(t / 70) + ruis(3)) : 0;
  const rpm = rijdt ? 1300 + kmh * 18 + ruis(60) : 790 + ruis(25);
  const load = rijdt ? 32 + kmh * 0.25 + ruis(4) : 21 + ruis(2);
  const gas = rijdt ? 12 + kmh * 0.15 + ruis(2) : 3 + ruis(0.4);
  return { rijdt, kmh, rpm, load, gas };
}
const opwarm = (t, eind, tot) => Math.min(tot, 20 + (tot - 20) * Math.min(1, t / eind));

function torqueTijd(t) {
  const s = 14 * 3600 + 5 * 60 + t, hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return '12-Nov-2026 ' + p(hh) + ':' + p(mm) + ':' + p(ss) + '.' + String((t * 137) % 1000).padStart(3, '0');
}

function schrijf(naam, kop, regels) {
  fs.writeFileSync(path.join(__dirname, naam), kop.map(k => '# ' + k).join('\n') + '\n' + regels.join('\n') + '\n');
  console.log(naam + ': ' + (regels.length - 1) + ' regels');
}

// 1. Gezond — Torque, breed, metrische eenheden, met GPS- en VIN-kolom.
(function () {
  const k = ['GPS Time', 'Device Time', 'Longitude', 'Latitude', 'VIN', 'Engine RPM(rpm)', 'Speed (OBD)(km/h)', 'Speed (GPS)(km/h)',
    'Engine Coolant Temperature(°C)', 'Engine Load(%)', 'Fuel Trim Bank 1 Short Term(%)', 'Fuel Trim Bank 1 Long Term(%)',
    'Intake Air Temperature(°C)', 'Voltage (Control Module)(V)', 'Throttle Position(Manifold)(%)'];
  const rs = [k.join(',')];
  for (let t = 0; t < DUUR; t++) {
    const r = rit(t);
    rs.push(['-', torqueTijd(t), '5.12', '52.09', 'WVWZZZ1KZAW000001', Math.round(r.rpm), r1(r.kmh), r1(r.kmh + ruis(2)),
      r1(opwarm(t, 420, 90) + (t > 420 ? ruis(2.5) : 0)), r1(r.load), r1(ruis(3)), r1(1.5 + ruis(0.3)),
      r1(26 + ruis(3)), r1((r.rijdt ? 14.0 : 14.2) + ruis(0.08)), r1(r.gas)].join(','));
  }
  schrijf('gezond.csv', [
    'SCENARIO: gezond',
    'AUTO: Volkswagen Golf 1.6 benzine 2012',
    'BASIS: ok',
    'SIGNAAL: rij:0105 max<100',
    'SIGNAAL: rij:0142 min>13.5',
    'SIGNAAL: "DEEL 2"',
    'SIGNAAL: !"WVWZZZ1KZAW000001"',
    'AI MAG NIET: vervangen | defect | storing'
  ], rs);
})();

// 2. Thermostaat blijft open — Car Scanner, lang, ';', komma-decimalen.
//    De app heeft geen ondergrens op koelwater: basis ok. De AI moet zien
//    dat de motor na twintig minuten rijden niet warm wordt.
(function () {
  const rs = ['"SECONDS";"PID";"VALUE";"UNITS"'];
  const nl = v => String(r1(v)).replace('.', ',');
  for (let t = 0; t < DUUR; t++) {
    const r = rit(t), s = t + 0.25;
    const kw = r.rijdt ? Math.min(63, 18 + t * 0.09) + ruis(1.5) : (t < 60 ? 18 + t * 0.05 : 66 + ruis(1));
    rs.push(nl(s) + ';"Engine RPM";' + Math.round(r.rpm) + ';"rpm"');
    rs.push(nl(s + 0.1) + ';"Vehicle speed";' + Math.round(r.kmh) + ';"km/h"');
    if (t % 2 === 0) rs.push(nl(s + 0.2) + ';"Engine coolant temperature";' + nl(kw) + ';"°C"');
    if (t % 2 === 1) rs.push(nl(s + 0.2) + ';"Calculated engine load value";' + nl(r.load) + ';"%"');
    if (t % 5 === 0) rs.push(nl(s + 0.3) + ';"Intake air temperature";' + nl(12 + ruis(2)) + ';"°C"');
    if (t % 10 === 0) rs.push(nl(s + 0.4) + ';"Ambient air temperature";' + nl(8 + ruis(0.5)) + ';"°C"');
    if (t % 2 === 0) rs.push(nl(s + 0.5) + ';"Short term fuel trim - Bank 1";' + nl(ruis(3)) + ';"%"');
    if (t % 10 === 5) rs.push(nl(s + 0.6) + ';"Long term fuel trim - Bank 1";' + nl(2 + ruis(0.4)) + ';"%"');
  }
  schrijf('thermostaat-open.csv', [
    'SCENARIO: thermostaat-open',
    'AUTO: Volkswagen Golf 1.4 TSI benzine 2010, VIN WVWZZZ1KZAW000002',
    'BASIS: ok',
    'SIGNAAL: rij:0105 max<70',
    'SIGNAAL: 0146 max<12',
    'SIGNAAL: rij:010D n>1000',
    'SIGNAAL: !"WVWZZZ1KZAW000002"',
    'AI MOET: thermostaat | warm',
    'AI MAG NIET: waterpomp | koppakking'
  ], rs);
})();

// 3. Arm mengsel stationair — Torque, breed, Amerikaanse eenheden.
//    LTFT +19 stationair, +6 rijdend: valse lucht, de app zegt alleen let op.
(function () {
  const k = ['Device Time', 'Engine RPM(rpm)', 'Speed (OBD)(mph)', 'Engine Coolant Temperature(°F)', 'Engine Load(%)',
    'Fuel Trim Bank 1 Short Term(%)', 'Fuel Trim Bank 1 Long Term(%)', 'Intake Manifold Pressure(psi)', 'Mass Air Flow Rate(lb/min)',
    'O2 Volts Bank 1 sensor 1(V)', 'Voltage (Control Module)(V)'];
  const rs = [k.join(',')];
  for (let t = 0; t < DUUR; t++) {
    const r = rit(t);
    const ltft = r.rijdt ? 6 + ruis(0.6) : 19 + ruis(0.6);
    const stft = r.rijdt ? 1 + ruis(2) : 6 + ruis(2.5);
    const mapKpa = r.rijdt ? 45 + r.load * 0.6 + ruis(3) : 33 + ruis(1.5);
    const maf = r.rijdt ? 6 + r.kmh * 0.18 + ruis(0.6) : 2.6 + ruis(0.15);
    rs.push([torqueTijd(t), Math.round(r.rpm), r1(r.kmh / 1.609344), r1((89 + ruis(2)) * 9 / 5 + 32), r1(r.load),
      r1(stft), r1(ltft), (mapKpa / 6.894757).toFixed(2), (maf / 7.559873).toFixed(3),
      (0.45 + 0.4 * Math.sin(t * 2.1)).toFixed(3), r1(14.1 + ruis(0.08))].join(','));
  }
  schrijf('arm-mengsel.csv', [
    'SCENARIO: arm-mengsel',
    'AUTO: Ford Focus 2.0 benzine 2008',
    'BASIS: let op / Brandstof',
    'SIGNAAL: stil:0107 min>=17',
    'SIGNAAL: rij:0107 max<10',
    'SIGNAAL: rij:010D max>75',
    'SIGNAAL: stil:0105 max<95',
    'SIGNAAL: stil:010B max<40',
    'AI MOET: valse lucht | vacuüm',
    'AI MAG NIET: injector | katalysator'
  ], rs);
})();

// 4. Sensorglitch — eigen export, PID-koppen, tijd in ms. De boordspanning
//    is gewoon 14,1 V, met losse uitschieters naar 65,535 V (0xFFFF/1000,
//    een verminkt antwoord). Dat is een meetfout, geen defecte dynamo.
(function () {
  const rs = ['t_ms,010C,010D,0105,0104,0142'];
  for (let t = 0; t < DUUR; t++) {
    const r = rit(t);
    const u = (t > 120 && t % 97 === 0) ? 65.535 : r1(14.1 + ruis(0.08));
    rs.push([t * 1000 + Math.round(ruis(40)) + 40, Math.round(r.rpm), Math.round(r.kmh), Math.round(opwarm(t, 420, 90) + ruis(1)), r1(r.load), u].join(','));
  }
  schrijf('sensorglitch.csv', [
    'SCENARIO: sensorglitch',
    'AUTO: Toyota Yaris 1.0 benzine 2015',
    'BASIS: meetfout / Electrisch',
    'SIGNAAL: "MEETKWALITEIT TWIJFELACHTIG"',
    'SIGNAAL: 0142 max>60',
    'SIGNAAL: rij:0142 min>13.5',
    'AI MOET: meetfout | verbinding',
    'AI MAG NIET: dynamo defect | overladen'
  ], rs);
})();

// 5. Niet gemeten — Torque, breed, maar alleen vier sensoren. Wat er niet
//    in staat mag de AI niet goed of fout noemen.
(function () {
  const k = ['Device Time', 'Engine RPM(rpm)', 'Speed (OBD)(km/h)', 'Engine Coolant Temperature(°C)', 'Voltage (Control Module)(V)', 'Horsepower (At the wheels)(hp)'];
  const rs = [k.join(',')];
  for (let t = 0; t < DUUR; t++) {
    const r = rit(t);
    rs.push([torqueTijd(t), Math.round(r.rpm), r1(r.kmh), r1(opwarm(t, 400, 89) + ruis(1)), r1(14.1 + ruis(0.08)), r1(r.load * 1.2)].join(','));
  }
  schrijf('niet-gemeten.csv', [
    'SCENARIO: niet-gemeten',
    'AUTO: Opel Astra 1.6 benzine 2011',
    'BASIS: ok',
    'SIGNAAL: !"Brandstoftrim"',
    'SIGNAAL: !"O2 sensor"',
    'SIGNAAL: "Horsepower"',
    'SIGNAAL: "NIET GEMETEN"',
    'AI MOET: niet gemeten',
    'AI MAG NIET: lambdasonde | brandstoftrim is goed'
  ], rs);
})();

// 6. Dynamo laadt niet — Car Scanner, lang. 12,4 V rijdend en zakkend:
//    boven de ondergrens van de app (11,5), dus basis ok. Een laadspanning
//    hoort rond 14 V te liggen.
(function () {
  const rs = ['"SECONDS";"PID";"VALUE";"UNITS"'];
  const nl = v => String(Math.round(v * 100) / 100).replace('.', ',');
  for (let t = 0; t < DUUR; t++) {
    const r = rit(t), s = t + 0.5;
    const u = 12.55 - t * 0.0004 + ruis(0.03) - (r.rijdt ? 0.1 : 0);
    rs.push(nl(s) + ';"Engine RPM";' + Math.round(r.rpm) + ';"rpm"');
    rs.push(nl(s + 0.1) + ';"Vehicle speed";' + Math.round(r.kmh) + ';"km/h"');
    rs.push(nl(s + 0.2) + ';"Control module voltage";' + nl(u) + ';"V"');
    if (t % 3 === 0) rs.push(nl(s + 0.3) + ';"Engine coolant temperature";' + nl(opwarm(t, 420, 90)) + ';"°C"');
    if (t % 2 === 0) rs.push(nl(s + 0.4) + ';"Calculated engine load value";' + nl(r.load) + ';"%"');
  }
  schrijf('dynamo-laadt-niet.csv', [
    'SCENARIO: dynamo-laadt-niet',
    'AUTO: Renault Clio 1.2 benzine 2009',
    'BASIS: ok',
    'SIGNAAL: rij:0142 max<12.8',
    'SIGNAAL: stil:0142 max<12.8',
    'SIGNAAL: rij:010C min>1000',
    'AI MOET: dynamo | laadspanning',
    'AI MAG NIET: startmotor'
  ], rs);
})();
