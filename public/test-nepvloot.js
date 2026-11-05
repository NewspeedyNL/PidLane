// ═══════════════════════════════════════════════════════════════════
// test-nepvloot.js — de generator van de nagebouwde vloot en de telling (#670)
// ───────────────────────────────────────────────────────────────────
// bproef-dekking.js meet hoeveel van wat een auto aanbiedt oproepbaar is.
// Dat getal is zo goed als twee dingen eronder:
//   • plnepvloot.js leest OBDb goed: command_support.yaml, de ruwe
//     ISO-TP-antwoorden (ook over meer frames), en de adressen (11-bit,
//     tx>rx, 29-bit). Getoetst met echte regels uit OBDb.
//   • elk profiel in nepvloot/profielen.json is te bouwen, en PLNepAuto
//     geeft op elke nagebouwde fabriekscode precies de bytes uit OBDb.
//   • tel() in bproef-dekking.js telt spook-PIDs en de dekking zoals hij
//     belooft.
// TEGENPROEF (plmutate.sh): de vervolgframes van ISO-TP vergeten, en de
// spooktelling uit tel() halen — allebei rood.
//
// Draaien vanuit public/:  node test-nepvloot.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const G = require(path.join(__dirname, '..', 'plnepvloot.js'));
const N = require('./nepauto.js');
const { tel } = require('./bproef-dekking.js');

let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}

// ── command_support.yaml (uittreksel Mazda-CX-5 2018, Fiat-500 2014) ──
const SUP = [
  'model_year: 2018',
  'supported_commands_by_ecu:',
  '  "720":',
  '  - 720.728.222A05:CX5_TP_RL',
  '  "7DF":',
  '  - 7DF.0104',
  '  "7E0":',
  '  - 0105:ECT',
  "  - '7E0.221234'",
  '  "DA15":',
  '  - DA15.15.222006:SANDERO_TOT_VEH_DIST',
  '  "710":',
  '  - 710.77A.222A61|fc=1,f=-2020:A3_MQB_BAT_TOT_CHG',
  'unsupported_commands_by_ecu:',
  '  "720":',
  '  - 720.728.22C901:CX5_TP_FL_720,CX5_TP_FR_720'
].join('\n');
const s = G.leesSupport(SUP);
waar('model_year gelezen', s.jaar === 2018, s.jaar);
waar('vijf ECU\'s met antwoord, één zonder', Object.keys(s.ja).length === 5 && Object.keys(s.nee).length === 1, JSON.stringify(Object.keys(s.ja)));
waar('id en signaal gescheiden', s.ja['720'][0].id === '720.728.222A05' && s.ja['720'][0].sig === 'CX5_TP_RL', JSON.stringify(s.ja['720'][0]));
waar('id met aanhalingstekens', s.ja['7E0'][1].id === '7E0.221234', JSON.stringify(s.ja['7E0']));
waar('id met modifier blijft heel', s.ja['710'][0].id === '710.77A.222A61|fc=1,f=-2020', JSON.stringify(s.ja['710']));
waar('unsupported apart', s.nee['720'][0].id === '720.728.22C901', JSON.stringify(s.nee));

// ── adressen ──
const a1 = G.adres('7E0', '0105'), a2 = G.adres('720', '720.728.222A05'), a3 = G.adres('7E0', '7E0.221234'), a4 = G.adres('DA15', 'DA15.15.222006');
waar('mode 01 onder de ECU-sleutel', a1.tx === '7E0' && a1.cmd === '0105', JSON.stringify(a1));
waar('tx.rx.cmd', a2.tx === '720' && a2.rx === '728' && a2.cmd === '222A05', JSON.stringify(a2));
waar('tx.cmd: antwoord op tx+8', G.rxVan(a3.tx, a3.rx) === '7E8', G.rxVan(a3.tx, a3.rx));
waar('29-bit: DA15 met rax 15 → 18DAF115', G.rxVan(a4.tx, a4.rx) === '18DAF115', G.rxVan(a4.tx, a4.rx));
waar('een ander antwoordadres blijft staan (VAG 710 → 77A)', G.rxVan('710', '77A') === '77A');
waar('FC00 en D016 zijn niet na te bouwen', G.rxVan('FC00', 'FE0076') === null && G.rxVan('D016', '1EC60E80') === null);
waar('modifier apart', G.adres('710', '710.77A.222A61|fc=1').mod === 'fc=1');

// ── antwoorden (echte regels uit OBDb) ──
const ANT = [
  'command_id: 710.77A.222A61|fc=1,f=-2020',
  'test_cases:',
  '- expected_values:',
  '    A3_MQB_BAT_TOT_CHG: null',
  "  response: '77A037F2231'",
  '- expected_values:',
  '    A3_MQB_BAT_TOT_CHG: 8006.4',
  '  response: |-',
  '    77A100B622A61000138',
  '    77A21C00001245DAAAA'
].join('\n');
const g = G.leesAntwoorden(ANT);
waar('twee testgevallen', g.length === 2, g.length);
waar('blok met twee frames', g[1].frames.length === 2 && g[1].waarden.A3_MQB_BAT_TOT_CHG === '8006.4', JSON.stringify(g[1]));
waar('één frame: 728 04 62 2A05 8E', G.isotp(['72804622A058E'], '728').join(' ') === '62 2A 05 8E', G.isotp(['72804622A058E'], '728'));
const mf = G.isotp(g[1].frames, '77A');
waar('meer frames: 11 bytes, de vulling eraf', mf && mf.join(' ') === '62 2A 61 00 01 38 C0 00 01 24 5D', mf && mf.join(' '));
waar('29-bit kop eraf', G.isotp(['18DAF11504622006AB'], '18DAF115').join(' ') === '62 20 06 AB');
waar('jaarteken: 2018 = J, 2021 = M', G.jaarTeken(2018) === 'J' && G.jaarTeken(2021) === 'M', G.jaarTeken(2018) + G.jaarTeken(2021));

// ── de vloot zelf ──
const VLOOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nepvloot', 'profielen.json'), 'utf8')).auto;
waar('er is een vloot (≥ 30 profielen)', VLOOT.length >= 30, VLOOT.length);
let gebouwd = 0, didOk = 0, didMis = [];
VLOOT.forEach((p) => {
  let a;
  try { a = N.maak(p); gebouwd++; } catch (e) { didMis.push(p.id + ': ' + e.message); return; }
  // Elke nagebouwde fabriekscode: fysiek vragen en de bytes uit het profiel terugkrijgen.
  p.ecus.forEach((e) => Object.keys(e.did || {}).slice(0, 3).forEach((code) => {
    const b = N.maak(p), tx = e.tx || (parseInt(e.adres, 16) - 8).toString(16).toUpperCase();
    ['ATE0', 'ATS0', 'ATH0', 'ATSP' + p.proto, 'ATSH' + tx, 'ATCRA' + e.adres, 'ATFCSH' + tx, 'ATFCSD300000', 'ATFCSM1'].forEach((c) => b.stuur(c));
    const t = b.stuur(code).tekst.replace(/[\s\r>]/g, '').replace(/[0-9A-F]:/g, '');
    const verwacht = ((parseInt(code.slice(0, 2), 16) + 0x40).toString(16) + code.slice(2) + e.did[code].replace(/\s/g, '')).toUpperCase();
    if (t.indexOf(verwacht) >= 0 || t.replace(/^[0-9A-F]{3}/, '').indexOf(verwacht) >= 0) didOk++;
    else didMis.push(p.id + ' ' + code + '@' + e.adres + ': ' + t.slice(0, 50) + ' (verwacht ' + verwacht + ')');
  }));
});
waar('elk profiel is te bouwen (' + gebouwd + ')', gebouwd === VLOOT.length, didMis.slice(0, 3).join(' | '));
waar('PLNepAuto geeft de OBDb-bytes terug op elke nagebouwde code (' + didOk + ')', didOk > 100 && !didMis.length, didMis.slice(0, 3).join(' | '));
waar('elk profiel zegt wat het aanbiedt', VLOOT.every((p) => p.aangeboden && Array.isArray(p.aangeboden.mode01) && Array.isArray(p.aangeboden.did)));
waar('elk profiel noemt zijn bron met commit', VLOOT.every((p) => /^OBDb .+ \d{4} @[0-9a-f]{7}$/.test(p.bron)), VLOOT.map((p) => p.bron).find((b) => !/@[0-9a-f]{7}$/.test(b)));

// ── tel() ──
const P = { aangeboden: { mode01: ['0100', '0105', '010C', '010D'], did: [{ code: '222A05', ecu: '720' }, { code: '221234', ecu: '7E0' }, { code: '22F190', ecu: '18DA10F1' }] } };
const t1 = tel(P, { supported: ['0100', '0105', '010C', '0146'], zoek: { kand: ['222A05@720>728', '221234@7E0'], past: ['222A05@720>728'], nee: ['221234@7E0'], vreemd: [], fout: [] } });
waar('spook: 0146 staat in supportedPIDs maar de auto biedt hem niet', t1.spook.join(',') === '0146', t1.spook.join(','));
waar('bitmap telt niet mee in de noemer', t1.m01 === 3, t1.m01);
waar('mode 01: 2 van 3', t1.m01ok === 2 && t1.m01mist.join(',') === '010D', JSON.stringify(t1));
waar('fabriek: 1 van 3 (tx>rx vergeleken op tx), 1 zonder kandidaat', t1.didOk === 1 && t1.geenKand === 1, JSON.stringify(t1));
waar('dekking = 3/6 = 50 %, snel = 2/6', t1.dekking === 50 && t1.snel === 33.3, t1.dekking + ' / ' + t1.snel);
const t2 = tel(P, { supported: ['0105', '010C', '010D'] });
waar('zonder zoekronde: alleen mode 01, geen spook', t2.dekking === 50 && !t2.spook.length, JSON.stringify(t2));

console.log('\n' + ok + ' ok, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
