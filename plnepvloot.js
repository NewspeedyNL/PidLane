#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// plnepvloot.js — de nagebouwde vloot uit OBDb (#670)
// ───────────────────────────────────────────────────────────────────
// WAAROM. Ritten naar veel auto's zijn er niet; de communicatie van veel
// ECU's staat wel online. OBDb (github.com/OBDb/<Merk-Model>) bewaart per
// bouwjaar wat een échte auto deed:
//   tests/test_cases/<jaar>/command_support.yaml
//       per ECU de commando's die antwoordden én die níét antwoordden,
//       mode 01 en de fabriekscodes (22xxxx/21xx) met hun adres;
//   tests/test_cases/<jaar>/commands/<id>.yaml
//       de ruwe antwoorden zelf (ISO-TP-frames met kop);
//   signalsets/v3/default.json
//       de omrekening per code — dezelfde lijst die de app via de Worker
//       (obdb_bestand) binnenhaalt.
// Dit script maakt daar profielen van voor PLNepAuto (public/nepauto.js),
// plus per profiel wat de auto AANBIEDT: dat is de noemer van de
// dekkingsproef (bproef-dekking.js).
//
// DATA, GEEN CODE. De uitvoer staat in de repo; CI haalt niets van het net.
//   nepvloot/profielen.json     de profielen + wat elk aanbiedt
//   nepvloot/obdb.json          per repo de signalset, ingedikt tot de
//                               velden die PLEigen.obdbKandidaten() leest
//
// Draaien (vanuit de repo-root, met internet):
//   node plnepvloot.js [--cache <map>]          alles in VLOOT
//   node plnepvloot.js --alleen golf19,cx5_18   een deel (voegt samen)
// Zonder --cache klont hij in os.tmpdir()/obdb (git clone --depth 1).
//
// WAT ER NIET IN STAAT, en dus aangenomen (zie ook nepauto-profielen.js):
//   • de mode-01 WAARDEN: STATIONAIR uit nepauto.js (warm, stationair).
//     OBDb heeft ze wel, maar een echte momentopname van 0105 = 0 °C maakt
//     de survey rood om een reden die hier niet het onderwerp is.
//   • een mode-01 PID zonder lengte in nepauto.js valt weg (in `overgeslagen`).
//   • adressering die PLNepAuto niet kent (BMW eax `e=`, Tesla/VW FC00,
//     Volvo D016): niet nagebouwd, wel in de noemer — de app kan ze ook niet.
//   • VIN: WMI van het merk + jaarteken op plek 10, de rest vulling.
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// id, OBDb-repo, bouwjaar, brandstof. Gekozen op NL-verkoop en op afstand
// tot de CX-5 (protocol, merkgroep, EV). Jaar = een jaar waarvoor OBDb een
// command_support heeft; ontbreekt het, dan het dichtstbijzijnde (gemeld).
const VLOOT = [
  ['cx5_18', 'Mazda-CX-5', 2018, 'benzine'],
  ['mazda3_19', 'Mazda-3', 2019, 'benzine'],
  ['mazda2_18', 'Mazda-2', 2018, 'benzine'],
  ['golf19', 'Volkswagen-Golf', 2019, 'benzine'],
  ['polo18', 'Volkswagen-Polo', 2018, 'benzine'],
  ['tiguan19', 'Volkswagen-Tiguan', 2019, 'benzine'],
  ['id3_21', 'Volkswagen-ID3', 2021, 'elektrisch'],
  ['a3_19', 'Audi-A3', 2019, 'benzine'],
  ['ibiza19', 'Seat-Ibiza', 2019, 'benzine'],
  ['octavia19', 'Skoda-Octavia', 2019, 'benzine'],
  ['p208_19', 'Peugeot-208', 2019, 'benzine'],
  ['p2008_20', 'Peugeot-2008', 2020, 'benzine'],
  ['p308_18', 'Peugeot-308', 2018, 'benzine'],
  ['clio20', 'Renault-Clio', 2020, 'benzine'],
  ['zoe21', 'Renault-Zoe', 2021, 'elektrisch'],
  ['sandero21', 'Dacia-Sandero', 2021, 'benzine'],
  ['yaris20', 'Toyota-Yaris', 2020, 'hybride'],
  ['corolla20', 'Toyota-Corolla', 2020, 'hybride'],
  ['chr20', 'Toyota-C-HR', 2020, 'hybride'],
  ['aygo19', 'Toyota-Aygo', 2019, 'benzine'],
  ['rav4_19', 'Toyota-RAV4', 2019, 'hybride'],
  ['niro19', 'Kia-Niro', 2019, 'hybride'],
  ['picanto17', 'Kia-Picanto', 2017, 'benzine'],
  ['sportage20', 'Kia-Sportage', 2020, 'benzine'],
  ['ceed19', 'Kia-Ceed', 2019, 'benzine'],
  ['tucson19', 'Hyundai-Tucson', 2019, 'benzine'],
  ['kona20', 'Hyundai-Kona', 2020, 'elektrisch'],
  ['i30_19', 'Hyundai-i30', 2019, 'benzine'],
  ['focus18', 'Ford-Focus', 2018, 'benzine'],
  ['fiesta18', 'Ford-Fiesta', 2018, 'benzine'],
  ['fiat500_14', 'Fiat-500', 2014, 'benzine'],
  ['qashqai19', 'Nissan-Qashqai', 2019, 'benzine'],
  ['leaf19', 'Nissan-Leaf', 2019, 'elektrisch'],
  ['xc40_20', 'Volvo-XC40', 2020, 'benzine'],
  ['mgzs21', 'MG-ZS-EV', 2021, 'elektrisch'],
  ['swift19', 'Suzuki-Swift', 2019, 'benzine'],
  ['civic19', 'Honda-Civic', 2019, 'benzine'],
  ['bmw3_19', 'BMW-3-Series', 2019, 'benzine'],
  ['mini19', 'Mini-Cooper', 2019, 'benzine'],
  ['cklasse18', 'Mercedes-Benz-C-Class', 2018, 'benzine']
];

// WMI per merk: één die decodeVIN() (pidlane-rijsituatie.js) kent, waar het kan.
const WMI = { Mazda: 'JMZ', Volkswagen: 'WVW', Audi: 'WAU', Seat: 'VSS', Skoda: 'TMB', Peugeot: 'VF3', Renault: 'VF1',
  Dacia: 'UU1', Toyota: 'NMT', Kia: 'KNA', Hyundai: 'KMH', Ford: 'WF0', Fiat: 'ZFA', Nissan: 'SJN', Volvo: 'YV1',
  MG: 'LSJ', Suzuki: 'TSM', Honda: 'SHH', BMW: 'WBA', Mini: 'WMW', 'Mercedes-Benz': 'WDD' };
// Opvulbyte achter een kort CAN-frame: VAG AA, PSA/Renault/Fiat 55, de rest 00.
const PAD = { Volkswagen: 'AA', Audi: 'AA', Seat: 'AA', Skoda: 'AA', Kia: 'AA', Hyundai: 'AA', Peugeot: '55', Renault: '55', Dacia: '55', Fiat: '55' };
const JAARTEKEN = 'ABCDEFGHJKLMNPRSTVWXY123456789';   // 2010 = A … 2030 = Y, 2031 = 1

function jaarTeken(j) { return JAARTEKEN[(j - 2010 + JAARTEKEN.length * 4) % JAARTEKEN.length]; }
function merkModel(repo) {
  const m = repo.match(/^(Mercedes-Benz|[^-]+)-(.+)$/);
  return { merk: m[1], model: m[2].replace(/-/g, ' ') };
}

// ── YAML, alleen de twee vormen die OBDb hier gebruikt ──────────────
// command_support.yaml: twee secties, per ECU-sleutel een lijst ids.
function leesSupport(tekst) {
  const uit = { jaar: null, ja: {}, nee: {} };
  let sectie = null, ecu = null;
  tekst.split(/\r?\n/).forEach((r) => {
    let m;
    if ((m = r.match(/^model_year:\s*(\d+)/))) uit.jaar = +m[1];
    else if (/^supported_commands_by_ecu:/.test(r)) sectie = uit.ja;
    else if (/^unsupported_commands_by_ecu:/.test(r)) sectie = uit.nee;
    else if ((m = r.match(/^\s{2}"?([0-9A-Fa-f]+)"?:\s*$/)) && sectie) { ecu = m[1].toUpperCase(); sectie[ecu] = sectie[ecu] || []; }
    else if ((m = r.match(/^\s{2}-\s+'?([^':]+)(?::([^']*))?'?\s*$/)) && sectie && ecu) sectie[ecu].push({ id: m[1].trim(), sig: (m[2] || '').trim() });
  });
  return uit;
}
// commands/<id>.yaml: test_cases met expected_values en een response
// (één regel, of een blok `|-` met een frame per regel).
function leesAntwoorden(tekst) {
  const gevallen = [];
  let cur = null, inBlok = false;
  tekst.split(/\r?\n/).forEach((r) => {
    let m;
    if (/^- expected_values:/.test(r)) { cur = { waarden: {}, frames: [] }; gevallen.push(cur); inBlok = false; return; }
    if (!cur) return;
    if ((m = r.match(/^\s{2}response:\s*'?([0-9A-Fa-f]+)'?\s*$/))) { cur.frames = [m[1].toUpperCase()]; inBlok = false; return; }
    if (/^\s{2}response:\s*\|-?\s*$/.test(r)) { inBlok = true; return; }
    if (inBlok && (m = r.match(/^\s{4}([0-9A-Fa-f]+)\s*$/))) { cur.frames.push(m[1].toUpperCase()); return; }
    inBlok = false;
    if ((m = r.match(/^\s{4}([A-Za-z0-9_]+):\s*(.*)$/))) cur.waarden[m[1]] = m[2];
  });
  return gevallen;
}

// ISO-TP terug naar de nuttige bytes. `rx` is het antwoordadres zoals het
// in de frames staat (3 hex, of 8 bij 29-bit).
function isotp(frames, rx) {
  const data = [];
  let lengte = null;
  for (const f of frames) {
    let h = f;
    if (rx && h.startsWith(rx)) h = h.slice(rx.length);
    else if (/^18DA/.test(h)) h = h.slice(8);
    else h = h.slice(3);
    const b = h.match(/../g) || [];
    if (!b.length) continue;
    const pci = parseInt(b[0], 16);
    if ((pci >> 4) === 0) { lengte = pci & 15; data.push(...b.slice(1, 1 + lengte)); break; }
    if ((pci >> 4) === 1) { lengte = ((pci & 15) << 8) | parseInt(b[1], 16); data.push(...b.slice(2)); continue; }
    if ((pci >> 4) === 2) { data.push(...b.slice(1)); continue; }
  }
  return lengte === null ? null : data.slice(0, lengte);
}

// Een id uit command_support → { tx, rx, cmd, mod } in de vorm van PLNepAuto.
//   "0104" onder sleutel 7E0       → motor-ECU 7E8, mode 01
//   "7DF.0104" / "DB33.0104"       → functioneel, bij de eerste ECU gevoegd
//   "720.728.222A05"               → tx 720, rx 728
//   "7E0.221234"                   → tx 7E0, rx 7E8
//   "DA15.15.222006"               → 29-bit: tx DA15F1, rx 18DAF115
function adres(sleutel, id) {
  const [kern, mod] = id.split('|');
  const d = kern.split('.');
  if (d.length === 1) return { tx: sleutel, cmd: d[0], mod: mod || '' };
  if (d.length === 2) return { tx: d[0], cmd: d[1], mod: mod || '' };
  return { tx: d[0], rx: d[1], cmd: d[2], mod: mod || '' };
}
function rxVan(tx, rx) {
  if (/^7[0-9A-F]{2}$/.test(tx) || /^6[0-9A-F]{2}$/.test(tx)) return rx || (parseInt(tx, 16) + 8).toString(16).toUpperCase();
  if (/^DA[0-9A-F]{2}$/.test(tx)) { const r = rx ? rx.slice(-2) : tx.slice(2); return '18DAF1' + r; }
  return null;   // FC00, D016, …: niet na te bouwen
}
function txNep(tx) { return /^DA[0-9A-F]{2}$/.test(tx) ? tx + 'F1' : tx; }
function functioneel(tx) { return tx === '7DF' || tx === 'DB33'; }

function kloon(cache, repo) {
  const doel = path.join(cache, repo);
  if (!fs.existsSync(path.join(doel, '.git'))) {
    fs.mkdirSync(cache, { recursive: true });
    execFileSync('git', ['clone', '-q', '--depth', '1', 'https://github.com/OBDb/' + repo, doel], { stdio: 'inherit' });
  }
  return { map: doel, commit: execFileSync('git', ['-C', doel, 'rev-parse', '--short', 'HEAD']).toString().trim() };
}

// Signalset indikken tot wat PLEigen.obdbKandidaten() leest.
function indikken(json) {
  return (json.commands || []).filter((c) => c && c.cmd && (c.cmd['22'] !== undefined || c.cmd['21'] !== undefined)).map((c) => {
    const k = { hdr: c.hdr, cmd: c.cmd };
    ['rax', 'eax', 'filter', 'dbg', 'fcm1'].forEach((x) => { if (c[x] !== undefined) k[x] = c[x]; });
    k.signals = (c.signals || []).map((g) => ({ name: g.name, fmt: g.fmt }));
    return k;
  });
}

function bouw(rij, cache, LEN) {
  const [id, repo, wensJaar, brandstof] = rij;
  const { merk, model } = merkModel(repo);
  const { map, commit } = kloon(cache, repo);
  const tc = path.join(map, 'tests', 'test_cases');
  const jaren = fs.existsSync(tc) ? fs.readdirSync(tc).filter((j) => fs.existsSync(path.join(tc, j, 'command_support.yaml'))).map(Number) : [];
  if (!jaren.length) return { fout: id + ': ' + repo + ' heeft geen command_support' };
  const jaar = jaren.slice().sort((a, b) => Math.abs(a - wensJaar) - Math.abs(b - wensJaar) || b - a)[0];
  const sup = leesSupport(fs.readFileSync(path.join(tc, String(jaar), 'command_support.yaml'), 'utf8'));
  const cmdMap = path.join(tc, String(jaar), 'commands');

  const ecus = {};              // rx → ecu
  const volgorde = [];
  function ecu(rx, tx) {
    if (!ecus[rx]) { ecus[rx] = { adres: rx, tx: tx, pids: [], did: {} }; volgorde.push(rx); }
    return ecus[rx];
  }
  const aangeboden = { mode01: [], did: [] };
  const overgeslagen = [];
  const bit29 = Object.keys(sup.ja).some((k) => /^D[AB][0-9A-F]{2}$/.test(k));
  // Eerst de ECU's met mode 01, zodat de motor-ECU vooraan staat.
  const motorSleutels = Object.keys(sup.ja).filter((k) => sup.ja[k].some((x) => /^01[0-9A-F]{2}$/.test(adres(k, x.id).cmd)) && !functioneel(k))
    .sort((a, b) => (a === '7E0' || a === 'DA10' ? -1 : 0) - (b === '7E0' || b === 'DA10' ? -1 : 0) || a.localeCompare(b));
  motorSleutels.forEach((k) => ecu(rxVan(k), /^7E[0-7]$/.test(k) ? null : txNep(k)));
  // Alleen functioneel gezien (7DF/DB33): dan antwoordde de motor-ECU, en die
  // hoort vooraan — niet een ECU die toevallig eerst een fabriekscode had.
  const alleenFunctioneel = !volgorde.length && Object.keys(sup.ja).some((k) => functioneel(k) && sup.ja[k].some((x) => /^01[0-9A-F]{2}$/.test(adres(k, x.id).cmd)));
  if (alleenFunctioneel) ecu(bit29 ? '18DAF110' : '7E8', bit29 ? 'DA10F1' : null);
  Object.keys(sup.ja).forEach((sleutel) => {
    sup.ja[sleutel].forEach(({ id: cid, sig }) => {
      const a = adres(sleutel, cid);
      if (/^01[0-9A-F]{2}$/.test(a.cmd)) {
        const p = a.cmd.slice(2);
        if (/^(00|20|40|60|80|A0|C0|E0)$/.test(p)) return;          // steunbits: PLNepAuto rekent ze zelf
        if (!LEN[p] && p !== '01' && p !== '41') { overgeslagen.push({ cmd: a.cmd, reden: 'geen lengte in nepauto.js' }); return; }
        const doel = functioneel(a.tx) ? ecus[volgorde[0]] : ecu(rxVan(a.tx), /^7E[0-7]$/.test(a.tx) ? null : txNep(a.tx));
        if (doel.pids.indexOf(p) < 0) doel.pids.push(p);
        if (aangeboden.mode01.indexOf(a.cmd) < 0) aangeboden.mode01.push(a.cmd);
        return;
      }
      if (!/^2[12][0-9A-F]+$/.test(a.cmd)) return;                  // mode 09, 06, …: hier niet het onderwerp
      // Een fabriekscode op het functionele adres (7DF, DB33) beantwoordt de motor-ECU.
      if (functioneel(a.tx) && !a.rx) a.tx = a.tx === '7DF' ? '7E0' : 'DA10';
      const rx = rxVan(a.tx, a.rx);
      const ecuAdr = rx && /^18DAF1/.test(rx) ? '18' + a.tx + 'F1' : a.tx;
      const nood = (a.mod && /(^|,)(e|ta|c)=/.test(a.mod)) ? 'adressering ' + a.mod : !rx ? 'adres ' + a.tx : '';
      aangeboden.did.push({ code: a.cmd, ecu: ecuAdr, rx: rx, sig: sig, nagebouwd: !nood });
      if (nood) { overgeslagen.push({ cmd: cid, reden: nood }); return; }
      const f = path.join(cmdMap, cid + '.yaml');
      if (!fs.existsSync(f)) { overgeslagen.push({ cmd: cid, reden: 'geen antwoord in OBDb' }); aangeboden.did[aangeboden.did.length - 1].nagebouwd = false; return; }
      const gevallen = leesAntwoorden(fs.readFileSync(f, 'utf8'));
      const goed = gevallen.find((g) => Object.values(g.waarden).some((w) => w !== 'null')) || gevallen[0];
      const bytes = goed && isotp(goed.frames, rx);
      const dienst = parseInt(a.cmd.slice(0, 2), 16) + 0x40;
      const kop = a.cmd.slice(2).match(/../g);
      if (!bytes || bytes[0] !== dienst.toString(16).toUpperCase() || bytes.slice(1, 1 + kop.length).join('') !== kop.join('')) {
        overgeslagen.push({ cmd: cid, reden: 'antwoord onleesbaar' }); aangeboden.did[aangeboden.did.length - 1].nagebouwd = false; return;
      }
      ecu(rx, txNep(a.tx)).did[a.cmd] = bytes.slice(1 + kop.length).join(' ');
    });
  });
  if (!volgorde.length) return { fout: id + ': geen ECU in ' + repo + ' ' + jaar };
  const vin = (WMI[merk] || 'XXX') + 'ZZZZZZ' + jaarTeken(jaar) + 'X' + String(VLOOT.findIndex((r) => r[0] === id) + 1).padStart(6, '0');
  const p = {
    id, naam: merk + ' ' + model + ' ' + jaar, merk, model, jaar, brandstof,
    proto: bit29 ? '7' : '6', vin, pad: PAD[merk] || '00',
    bron: 'OBDb ' + repo + ' ' + jaar + ' @' + commit,
    repo,
    ecus: volgorde.map((rx) => {
      const e = ecus[rx], uit = { adres: e.adres };
      if (e.tx) uit.tx = e.tx;
      uit.pids = e.pids.sort().join(' ');
      if (Object.keys(e.did).length) uit.did = e.did;
      return uit;
    }),
    aangeboden, overgeslagen
  };
  if (brandstof === 'elektrisch') p.readiness = '000000';
  if (jaar !== wensJaar) p.jaarNoot = 'gevraagd ' + wensJaar + ', OBDb heeft ' + jaar;
  const sig = JSON.parse(fs.readFileSync(path.join(map, 'signalsets', 'v3', 'default.json'), 'utf8'));
  return { p, obdb: indikken(sig) };
}

function main() {
  const args = process.argv.slice(2);
  const cache = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : path.join(os.tmpdir(), 'obdb');
  const alleen = args.includes('--alleen') ? args[args.indexOf('--alleen') + 1].split(',') : null;
  const { LEN } = require('./public/nepauto.js');
  const uitP = path.join(__dirname, 'nepvloot', 'profielen.json');
  const uitO = path.join(__dirname, 'nepvloot', 'obdb.json');
  const oud = alleen && fs.existsSync(uitP) ? JSON.parse(fs.readFileSync(uitP, 'utf8')) : { auto: [] };
  const oudO = alleen && fs.existsSync(uitO) ? JSON.parse(fs.readFileSync(uitO, 'utf8')) : {};
  const auto = [], obdb = {};
  let fouten = 0;
  VLOOT.forEach((rij) => {
    if (alleen && alleen.indexOf(rij[0]) < 0) {
      const o = oud.auto.find((x) => x.id === rij[0]);
      if (o) { auto.push(o); obdb[o.repo] = oudO[o.repo]; }
      return;
    }
    const r = bouw(rij, cache, LEN);
    if (r.fout) { console.log('  FOUT ' + r.fout); fouten++; return; }
    auto.push(r.p); obdb[r.p.repo] = r.obdb;
    const n22 = r.p.aangeboden.did.length, nb = r.p.aangeboden.did.filter((d) => d.nagebouwd).length;
    console.log('  ok  ' + r.p.id.padEnd(11) + ' ' + r.p.bron.padEnd(46) + ' mode01 ' + String(r.p.aangeboden.mode01.length).padStart(3) +
      '  fabriek ' + String(n22).padStart(4) + ' (' + nb + ' nagebouwd)' + (r.p.jaarNoot ? '  — ' + r.p.jaarNoot : ''));
  });
  // PLNepAuto moet elk profiel kunnen bouwen; anders is het geen profiel.
  const PLNepAuto = require('./public/nepauto.js');
  auto.forEach((p) => { try { PLNepAuto.maak(p); } catch (e) { console.log('  FOUT ' + p.id + ': ' + e.message); fouten++; } });
  fs.writeFileSync(uitP, JSON.stringify({ uitleg: 'Gegenereerd door plnepvloot.js uit OBDb — niet met de hand bewerken (#670).', auto }, null, 1) + '\n');
  fs.writeFileSync(uitO, JSON.stringify(obdb) + '\n');
  console.log('\n' + auto.length + ' profielen → nepvloot/profielen.json (' + Math.round(fs.statSync(uitP).size / 1024) + ' KB), signalsets → nepvloot/obdb.json (' +
    Math.round(fs.statSync(uitO).size / 1024) + ' KB)' + (fouten ? ', ' + fouten + ' fout(en)' : ''));
  process.exit(fouten ? 1 : 0);
}

if (require.main === module) main();
module.exports = { leesSupport, leesAntwoorden, isotp, adres, rxVan, jaarTeken, indikken };
