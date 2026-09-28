// test-banden.js — PLBanden: welke PID bij welke band, en het oordeel (28-09-2026)
//
// Laadt de echte pidlane-banden.js in een vm en toetst de twee pure functies:
// indeling() (uit de eigen PIDs per band de druk en de temperatuur) en
// stand() (de vier banden tegen elkaar: 10% onder de mediaan oranje, 20%
// rood, een meting van meer dan drie minuten oud telt niet mee).
//
// De namen komen uit PLEigen.bandRol() — ook echt geladen, uit
// pidlane-uitgebreid.js — zodat een naam die daar niet meer herkend wordt
// hier rood wordt en niet stil een lege plek oplevert.
//
// Draaien vanuit public/:  node test-banden.js
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  const g = JSON.stringify(gemeten), v = JSON.stringify(verwacht);
  if (g === v) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + g + ', wilde ' + v); }
}
const lees = (f) => fs.readFileSync(__dirname + '/' + f, 'utf8');

const s = { console: { log() {}, warn() {}, error() {} }, Promise, setTimeout, setInterval: () => 0 };
s.window = s;
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: {},
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) };
s.addEventListener = () => {};
s.localStorage = { getItem: () => null, setItem() {} };
vm.createContext(s);
vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
vm.runInContext(lees('pidlane-uitgebreid.js'), s, { filename: 'pidlane-uitgebreid.js' });
vm.runInContext(lees('pidlane-banden.js'), s, { filename: 'pidlane-banden.js' });
const B = s.PLBanden, E = s.PLEigen;
if (!B || !E) { console.log('FOUT: PLBanden of PLEigen niet geladen'); process.exit(1); }

console.log('\n— indeling: welke PID bij welke band —');
// Precies de namen die op 28-09 bij de CX-5 stonden.
const psi = '((A*1373)/1000)*0.145037738';
const lijst = [
  ['222A05', 'Bandenspanning voor-links', psi, 'psi'], ['222A06', 'Bandenspanning voor-rechts', psi, 'psi'],
  ['222A07', 'Bandenspanning achter-links', psi, 'psi'], ['222A08', 'Bandenspanning achter-rechts', psi, 'psi'],
  ['222A0A', 'Bandtemperatuur voor-links', 'A-50', '°C'], ['222A0B', 'Bandtemperatuur voor-rechts', 'A-50', '°C'],
  ['222A0C', 'Bandtemperatuur achter-links', 'A-50', '°C'], ['222A0D', 'Bandtemperatuur achter-rechts', 'A-50', '°C'],
  ['221310', 'Motorolietemperatuur', '((A*256)+B)/100-40', '°C']
].map(x => ({ code: x[0], naam: x[1], formule: x[2], eenheid: x[3], ecu: '720' }));
E.zet(lijst, 'CX-5');
const ind = B.indeling(E.defs());
t('alle vier de banden met druk en temperatuur', ['VL', 'VR', 'AL', 'AR'].map(p => ind[p].druk.pid + '/' + ind[p].temp.pid).join(' '),
  '222A05/222A0A 222A06/222A0B 222A07/222A0C 222A08/222A0D');
t('de druk in bar (de standaard)', ind.VL.druk.eenheid, 'bar');
t('zonder bandensensoren: null (geen lampje, geen venster)', B.indeling([{ pid: '221310', name: 'Motorolietemperatuur', unit: '°C' }]), null);
t('alleen temperaturen: ook null — het oordeel gaat over de druk', B.indeling(E.defs().filter(d => d.band && d.band.soort === 'temp')), null);
const half = B.indeling(E.defs().filter(d => d.pid === '222A05'));
t('één band bekend: de rest is leeg, niet verzonnen', [half.VL.druk && half.VL.druk.pid, half.VR.druk, half.AR.temp], ['222A05', null, null]);

console.log('\n— stand: de vier banden tegen elkaar —');
const NU = 1e9, vers = NU - 20000;
const tijden = {}; ['222A05', '222A06', '222A07', '222A08', '222A0A', '222A0B', '222A0C', '222A0D'].forEach(p => { tijden[p] = vers; });
const druk = (vl, vr, al, ar) => ({ '222A05': vl, '222A06': vr, '222A07': al, '222A08': ar, '222A0A': 24, '222A0B': 25, '222A0C': 23, '222A0D': 24 });
let st = B.stand(ind, druk(2.3, 2.3, 2.4, 2.4), tijden, NU);
t('vier gelijke banden: ok', [st.ernst, st.wielen.VL.ernst], ['ok', 'ok']);
t('de temperatuur staat erbij', st.wielen.AR.temp.waarde, 24);
st = B.stand(ind, druk(2.3, 2.3, 2.05, 2.4), tijden, NU);
t('achter links 11% lager: oranje, en de uitleg zegt welke', [st.ernst, st.wielen.AL.ernst, /achter links 11% lager/.test(st.uitleg)], ['warn', 'warn', true]);
t('de andere drie blijven ok', ['VL', 'VR', 'AR'].map(p => st.wielen[p].ernst), ['ok', 'ok', 'ok']);
st = B.stand(ind, druk(2.3, 1.7, 2.3, 2.3), tijden, NU);
t('voor rechts 26% lager: rood', [st.ernst, st.wielen.VR.ernst], ['danger', 'danger']);
st = B.stand(ind, druk(2.3, 2.3, 2.3, 2.12), tijden, NU);
t('8% lager is nog geen melding', st.ernst, 'ok');
st = B.stand(ind, druk(2.6, 2.3, 2.3, 2.3), tijden, NU);
t('een band die hoger staat is geen lekke band', st.ernst, 'ok');
// Oud: een meting van vijf minuten geleden telt niet mee.
const oud = Object.assign({}, tijden, { '222A06': NU - 300000 });
st = B.stand(ind, druk(2.3, 1.2, 2.3, 2.3), oud, NU);
t('een oude meting (5 min) telt niet, en is dof', [st.ernst, st.wielen.VR.druk.oud, st.wielen.VR.ernst], ['ok', true, 'ok']);
const tweeOud = Object.assign({}, oud, { '222A07': NU - 300000 });
st = B.stand(ind, druk(2.3, 2.3, 2.3, 2.3), tweeOud, NU);
t('twee van de vier vers: geen oordeel (geen), met de reden', [st.ernst, /2 van 4/.test(st.uitleg)], ['geen', true]);
st = B.stand(ind, {}, {}, NU);
t('nog niets gemeten: geen', st.ernst, 'geen');
t('rommel als waarde (NO DATA): geen waarde, geen oordeel', B.stand(ind, druk('NO DATA', 2.3, 2.3, 2.3), tijden, NU).wielen.VL.druk.waarde, null);
t('drie verse banden is genoeg om te vergelijken', B.stand(ind, druk(2.3, 2.3, 1.8, undefined), tijden, NU).wielen.AL.ernst, 'danger');

console.log('\n— oordeel voor blok 5 —');
t('geen bandensensoren: LET OP', B.oordeel(null, null).staat, 'LET OP');
t('niets vers: LET OP met de reden', B.oordeel(ind, B.stand(ind, {}, {}, NU)).staat, 'LET OP');
const og = B.oordeel(ind, B.stand(ind, druk(2.3, 2.3, 2.4, 2.4), tijden, NU));
t('vier gelijk: ok, met de vier drukken', [og.staat, /VL 2,3, VR 2,3, AL 2,4, AR 2,4/.test(og.detail)], ['ok', true]);
t('een zachte band: LET OP, controleer de band', /Controleer/.test(B.oordeel(ind, B.stand(ind, druk(2.3, 1.7, 2.3, 2.3), tijden, NU)).detail), true);

console.log('\n' + (fout ? fout + ' van ' + (ok + fout) + ' FOUT' : 'Alle ' + ok + ' goed'));
process.exit(fout ? 1 : 0);
