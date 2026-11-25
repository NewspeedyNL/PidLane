#!/usr/bin/env node
/* plkostencodes.js — maakt public/pidlane-kostencodes.js uit OBDex (25-11-2026)
   ═══════════════════════════════════════════════════════════════════════
   WAT HET DOET
   OBDex (github.com/foerbsnavi/OBDex, data CC0) zegt per generieke foutcode
   welke onderdelen erbij horen (`affected_components`). Dit script vertaalt
   die namen naar de onderdelen van PLKosten (pidlane-kosten.js) en schrijft
   per onderdeel de lijst codes weg. Meer niet: de bedragen komen NIET uit
   OBDex — daar is de marge bij de helft van de codes 15× of meer en staat er
   niet bij waar het bedrag vandaan komt. Het bedrag komt uit KOSTEN in
   pidlane-kosten.js, met prijspeil en bron.

   ALLEEN P0 EN P2. Merkcodes (P1, P3) krijgen bewust geen bedrag; dat is de
   regel van DTC_PLAN (pidlane-data.js) en die blijft. Een code die nergens
   op past, staat er niet in: geen bedrag is beter dan een verzonnen bedrag.

   GEBRUIK
     node plkostencodes.js <OBDex-json>          schrijft het bestand
     node plkostencodes.js <OBDex-json> --toon   alleen de telling per onderdeel

   <OBDex-json> is een array van codes met de velden van OBDex
   (code, affected_components), bijvoorbeeld dist/generic.json van een
   OBDex-build. Het script leest alleen die twee velden.

   De regels hieronder lopen in volgorde; de eerste die past wint. Alleen
   het eerste onderdeel van een code telt — dat is in OBDex het onderdeel
   waar de code over gaat, de rest is bedrading en stekkers.
*/
'use strict';
const fs = require('fs');
const path = require('path');

const REGELS = [
  // eerst de verwarming, anders pakt de lambdaregel hem
  [/(oxygen|o2|air_fuel_ratio|lambda)[a-z0-9_]*heater|heater[a-z0-9_]*(oxygen|o2)/, 'lambdaverwarming'],
  [/(oxygen|o2)_sensor[a-z0-9_]*(downstream|sensor_?2|sensor_?3|s2\b|s3\b|_s2|_s3|b[12]s[23])/, 'lambdaachter'],
  [/(oxygen|o2)_sensor|air_fuel_ratio_sensor|wide_?band|lambda/, 'lambdavoor'],
  [/^(nox|nh3)_sensor/, 'noxsensor'],
  [/reductant|^scr_|_scr_|adblue|^def_/, 'adblue'],
  [/particulate_filter|^dpf|_dpf/, 'roetfilter'],
  [/ignition_coil|spark_plug|^ignition_(module|circuit)|coil_primary|coil_secondary/, 'ontsteking'],
  [/glow_plug/, 'gloeibougie'],
  [/^(fuel_)?injector|^fuel_injector/, 'injector'],
  [/mass_air_flow|^maf/, 'maf'],
  [/vacuum_leak|intake_leak|^pcv|crankcase_ventilation|intake_manifold_gasket/, 'vacuumlek'],
  [/catalyst|catalytic_converter/, 'kat'],
  [/^egr|_egr/, 'egr'],
  [/thermostat/, 'thermostaat'],
  [/cooling_fan|radiator_fan|fan_relay|fan_control/, 'koelventilator'],
  [/oil_pressure/, 'oliedruk'],
  [/alternator|^generator/, 'dynamo'],
  [/^(12v_|auxiliary_)?battery(?!_.*hv)|^battery_(sensor|monitor)/, 'accu'],
  [/crankshaft_position|camshaft_position|engine_speed_sensor/, 'krukas_nok'],
  [/knock_sensor/, 'klopsensor'],
  [/fuel_pump|fuel_pressure|fuel_rail|fuel_filter|fuel_volume_regulator|fuel_metering/, 'brandstofdruk'],
  [/turbo|wastegate|boost|charge_air|intercooler|supercharger/, 'turbo'],
  [/throttle|accelerator_pedal|idle_control|idle_air/, 'gasklep'],
  [/timing_chain|timing_belt|chain_tensioner/, 'distributie'],
  [/camshaft_(actuator|timing|phaser|oil_control)|cam_phaser|^vvt|variable_valve|oil_control_valve|intake_valve_control/, 'vvt'],
  [/swirl|runner|intake_manifold_tuning|^imrc|^imt_/, 'swirl'],
  [/secondary_air/, 'secundairelucht'],
  [/^evap|purge|fuel_cap|canister|fuel_tank_pressure/, 'evap'],
  [/transmission|shift_solenoid|shift_timing|pressure_control_solenoid|torque_converter|^tcm$|valve_body|^clutch_[a-z]$|transmission_clutch/, 'automaat'],
  [/engine_control_module|^ecm$|^pcm$|powertrain_control_module/, 'ecu'],
  // vangnet: een losse temperatuur-, druk- of standsensor
  [/(temperature|pressure|position|speed|level)_sensor/, 'sensor']
];

// Bij de verwarmingscodes (P0030–P0064) staat de sonde zelf vooraan en de
// verwarming op twee; dan gaat de code over de verwarming.
const VERWARMING = /(oxygen|o2)[a-z0-9_]*heater/;

function onderdeelVan(comps) {
  const k = String((comps || [])[0] || '').toLowerCase();
  if (!k) return null;
  if (/(oxygen|o2)_sensor/.test(k) && VERWARMING.test(String((comps || [])[1] || '').toLowerCase())) return 'lambdaverwarming';
  for (const [re, id] of REGELS) if (re.test(k)) return id;
  return null;
}

function bouw(lijst) {
  const per = {};
  let n = 0;
  for (const e of lijst) {
    const code = String(e && e.code || '').toUpperCase();
    if (!/^P[02][0-9A-F]{3}$/.test(code)) continue;
    const id = onderdeelVan(e.affected_components);
    if (!id) continue;
    (per[id] = per[id] || []).push(code);
    n++;
  }
  Object.keys(per).forEach(k => per[k].sort());
  return { per, n };
}

function schrijf(per, n, bron) {
  const ids = Object.keys(per).sort();
  const regels = ids.map(id => '  ' + id + ': "' + per[id].join(' ') + '"');
  return '/* pidlane-kostencodes.js — GEGENEREERD door plkostencodes.js, niet met de hand bewerken.\n' +
    '   Welke generieke foutcode (P0/P2) bij welk onderdeel van PLKosten hoort, uit\n' +
    '   OBDex (github.com/foerbsnavi/OBDex, data CC0). Alleen de koppeling; de\n' +
    '   bedragen staan in pidlane-kosten.js. ' + n + ' codes, bron: ' + bron + ' */\n' +
    'window.PL_KOSTEN_CODES = {\n' + regels.join(',\n') + '\n};\n';
}

if (require.main === module) {
  const bestand = process.argv[2];
  if (!bestand) { console.error('Gebruik: node plkostencodes.js <OBDex-json> [--toon]'); process.exit(2); }
  const lijst = JSON.parse(fs.readFileSync(bestand, 'utf8'));
  const { per, n } = bouw(lijst);
  if (process.argv.includes('--toon')) {
    Object.keys(per).sort().forEach(k => console.log(k.padEnd(18) + per[k].length));
    console.log('totaal'.padEnd(18) + n);
  } else {
    const doel = path.join(__dirname, 'public', 'pidlane-kostencodes.js');
    fs.writeFileSync(doel, schrijf(per, n, 'OBDex ' + new Date().toISOString().slice(0, 10)));
    console.log('Geschreven: ' + doel + ' (' + n + ' codes)');
  }
}

module.exports = { REGELS, onderdeelVan, bouw, schrijf };
