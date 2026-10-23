// test-survey2.js — PLSurvey2: Full survey V2, schema 3 (22-10-2026)
// Laadt de echte pidlane-survey2.js in een vm; meet() draait tegen een nep-ECU.
'use strict';
const fs = require('fs');
const vm = require('vm');
let ok = 0, fout = 0;
function waar(naam, cond, uitleg) {
  if (cond) { ok++; console.log('  goed  ' + naam); } else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}
const s = { console: { log() {}, warn() {}, error() {} } };
s.window = s; vm.createContext(s);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-survey2.js', 'utf8'), s, { filename: 'pidlane-survey2.js' });
const Z = s.PLSurvey2;
if (!Z) { console.log('FOUT: PLSurvey2 niet geladen'); process.exit(1); }

console.log('\n── plaatshouders ──');
const det = [
  { pid: '0105', naam: 'Koelwater', val: 88, unit: '°C', st: 'ok' },
  { pid: '015C', naam: 'Olie', val: -40, unit: '°C', st: 'ok' },
  { pid: '0115', naam: 'O2 B1S2', val: 1.275, unit: 'V', st: 'ok' },
  { pid: '0133', naam: 'Baro', val: 101, unit: 'kPa', st: 'ok' },
  { pid: '0146', naam: 'Buiten', val: -40, unit: '°C', st: 'nodata' }
];
const d = Z.doodePids(det);
waar('−40 °C en 1,275 V zijn verdacht', d.map((x) => x.pid).join() === '015C,0115', d.map((x) => x.pid).join());
waar('een gewone waarde niet', !d.some((x) => x.pid === '0105'));
waar('alleen wat ok antwoordde', !d.some((x) => x.pid === '0146'));

console.log('\n── OBDonUDS (J1979-2) ──');
const u = Z.obdOnUds('7E8 07 62 F4 00 BE 1F A8 13');
waar('62F400 met bitmap: ja', u.ja && u.n > 0);
waar('bit 1 van BE = F401', u.dids[0] === 'F401');
waar('BE1FA813 telt 17 DIDs', u.n === 17, String(u.n));
waar('7F 22 11 (niet ondersteund): nee', !Z.obdOnUds('7E8 03 7F 22 11').ja);
waar('NO DATA: nee', !Z.obdOnUds('NO DATA').ja);

console.log('\n── IUPR (0908) ──');
// NODI 0x14 = 20 items = 40 bytes: OBDCOND 12, IGNCNTR 30, kat B1 10/12, kat B2 0/12, rest 0/0
const pl = ['14', '000C', '001E', '000A', '000C', '0000', '000C'].concat(new Array(14).fill('0000')).join('');
const r = Z.iupr('49 08 ' + pl.replace(/(..)/g, '$1 '), '4908');
waar('ritten en contactbeurten', r && r.ritten === 12 && r.contact === 30, JSON.stringify(r && { r: r.ritten, c: r.contact }));
waar('kat B1: 10 van 12', r.monitors[0].naam === 'kat B1' && r.monitors[0].teller === 10 && r.monitors[0].ratio === 0.83);
waar('kat B2 draaide nooit', r.nooit.join() === 'kat B2', r.nooit.join());
waar('geen antwoord: null', Z.iupr('NO DATA', '4908') === null);
// #587: de échte 0908 van een Toyota Auris hybride (ELM327-emulator), zoals een
// ELM327 hem zonder headers geeft: met de opvulling van het laatste frame.
const AURIS = '02B\r0: 49 08 14 00 18 00\r1: 9A 00 11 00 18 00 00\r2: 00 00 00 14 00 18 00\r3: 00 00 00 00 1C 00 18\r4: 00 00 00 00 00 00 00\r5: 00 00 0C 00 18 00 00\r6: 00 00 00 00 00 00 00';
const ra = Z.iupr(AURIS, '4908');
waar('echte Auris met opvulling: 24 ritten, 154 keer contact', ra && ra.ritten === 24 && ra.contact === 154, JSON.stringify(ra && { r: ra.ritten, c: ra.contact }));
waar('echte Auris: kat B1 17 van 24, en negen monitors (geen opvulling als monitor)', ra.monitors[0].teller === 17 && ra.monitors[0].noemer === 24 && ra.monitors.length === 9, JSON.stringify(ra.monitors.slice(0, 2)) + ' n=' + ra.monitors.length);
const twee = Z.iupr('49 08 ' + pl.replace(/(..)/g, '$1 ') + '\r49 08 14 00 05 00 07', '4908');
waar('een tweede ECU erachter telt niet mee bij de eerste', twee && twee.ritten === 12 && twee.monitors.length === 9, JSON.stringify(twee && { r: twee.ritten, n: twee.monitors.length }));

console.log('\n── ECU-namen (090A) ──');
const naam = 'ECM-EngineControl';
const hex = '49 0A 01 ' + Array.from(naam.padEnd(20, '\0')).map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
waar('naam uit 090A', Z.ecuNamen(hex)[0] === naam, JSON.stringify(Z.ecuNamen(hex)));
waar('NO DATA: geen namen', Z.ecuNamen('NO DATA').length === 0);

console.log('\n── campagne (#541) ──');
const sv = { veh: { merk: 'Toyota', model: 'Yaris', jaar: 2021 }, adapter: { proto: 'ISO 15765-4 CAN' }, timing: { avgMs: 60 },
  pids: { total: 40, ok: 38, invalid: 0, transport: 0 }, functietest: { cijfer: 8 }, dtc: { actief: [], pending: [] },
  v2: { dood: [], kenmerk: { hybride: 'ja (bewezen)', turbo: null }, mode06: { tekst: '12 tests', aantalTests: 12, aantalGezakt: 0 },
    uds: { gevraagd: 8, antwoord: 5, codes: 1 }, eigen: { n: 3, zoek: { gedaan: 40, past: 12, vreemd: 3, nee: 25 } } } };
const c = Z.campagne(sv);
waar('acht stappen', c.length === 8);
waar('in de volgorde van #541', c.map((x) => x.stap).join() === 'Verbinden,Sensoren,Uitgebreide test,Derde poort,Mode 06,Foutcodes,OBDb,AI-analyse');
waar('alles goed gemeten: ✓ tot en met OBDb', c.slice(0, 7).every((x) => x.staat === '✓'), c.map((x) => x.staat).join());
waar('AI blijft handwerk', c[7].staat === '—');
const sv2 = JSON.parse(JSON.stringify(sv)); sv2.v2.mode06 = { tekst: '1 test buiten', aantalTests: 3, aantalGezakt: 1 }; sv2.v2.dood = [{ pid: '015C' }];
const c2 = Z.campagne(sv2);
waar('een gezakte monitortest: ~', c2[4].staat === '~');
waar('een plaatshouder: sensoren ~', c2[1].staat === '~');
waar('mode 06 niet gelezen: —', Z.campagne({ pids: { total: 1, ok: 1 } })[4].staat === '—');
waar('geen PIDs maar wel OBDonUDS: verbinden ~ met de reden', (() => { const x = Z.campagne({ pids: { total: 0 }, v2: { obdOnUds: { ja: true } } })[0]; return x.staat === '~' && /J1979-2/.test(x.detail); })());
const regel = Z.tabelRegel(sv, c);
waar('tabelregel: merk | model | jaar | 8 staten', regel === '| Toyota | Yaris | 2021 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |', regel);
waar('kop heeft evenveel kolommen', Z.tabelKop().split('\n')[0].split('|').length === regel.split('|').length);

console.log('\n── meet() tegen een nep-ECU ──');
(async function () {
  const gevraagd = [];
  const ECU = { '0900': '49 00 54 40 00 00', '090A': hex, '0908': '49 08 ' + pl, '22F400': '62 F4 00 BE 1F A8 13' };
  let busBeurten = 0;
  const sv3 = { veh: { merk: 'VW', model: 'Golf', jaar: 2019, brandstof: 'benzine' }, pids: { total: 2, ok: 2, invalid: 0, detail: det }, dtc: { actief: [], pending: [] } };
  const v2 = await Z.meet(sv3, {
    stuur: async (c) => { gevraagd.push(c); return ECU[c] || 'NO DATA'; },
    bus: async (fn) => { busBeurten++; return fn(); }, isCan: true,
    m06: { scan: async () => ({ tests: [] }), samenvat: () => ({ tekst: 'Geen mode 06 gegevens', aantalTests: 0, aantalGezakt: 0 }) },
    uds: { scan: async () => ({ modules: [{ hdr: '7E0', naam: 'Motor', staat: 'leeg', codes: [] }, { hdr: '760', naam: 'ABS', staat: 'stil' }] }) },
    kenmerk: () => ({ turbo: { waarde: true, zeker: 'bewezen' }, diesel: { waarde: null, zeker: null } }),
    eigen: () => ({ n: 0, zoek: null })
  });
  waar('schema 3', sv3.schema === 3 && v2.versie === 2);
  waar('mode 09 gevraagd, geen 090B op een benzine', gevraagd.includes('0908') && !gevraagd.includes('090B'));
  waar('OBDonUDS op CAN', v2.obdOnUds && v2.obdOnUds.ja);
  waar('bus per onderdeel, niet de hele survey', busBeurten === 2, String(busBeurten));
  waar('UDS: 1 van 2 antwoordde', v2.uds.antwoord === 1 && v2.uds.gevraagd === 2);
  waar('kenmerk: bewezen staat erbij, onbekend is null', v2.kenmerk.turbo === 'ja (bewezen)' && v2.kenmerk.diesel === null);
  waar('mode 06 zonder tests: ✗ in de campagne', v2.campagne[4].staat === '✗');
  waar('tabelregel staat in de JSON', /^\| VW \| Golf \| 2019 \|/.test(v2.tabelRegel));

  const sv4 = { pids: { total: 0 } };
  await Z.meet(sv4, { stuur: async () => 'NO DATA', isCan: false, m06: { scan: async () => { throw new Error('bus kwijt'); }, samenvat: () => ({}) } });
  waar('mode 06 gooit: de fout staat erbij, de survey loopt door', sv4.v2.mode06 && /bus kwijt/.test(sv4.v2.mode06.fout) && sv4.v2.campagne.length === 8);
  waar('zonder CAN geen 22F400 en geen UDS', !sv4.v2.obdOnUds && !sv4.v2.uds);
  let gestopt = false;
  try { await Z.meet({ pids: {} }, { stuur: async () => '', stop: () => true }); } catch (e) { gestopt = /afgebroken/.test(e.message); }
  waar('stop breekt af', gestopt);

  console.log('\n' + (fout ? 'FOUT: ' : 'goed: ') + ok + ' ok, ' + fout + ' fout\n');
  process.exit(fout ? 1 : 0);
})();
