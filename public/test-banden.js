// test-banden.js — PLBanden: welke PID bij welke band, en het oordeel (28-09-2026)
//
// Laadt de echte pidlane-banden.js in een vm en toetst de twee pure functies:
// indeling() (uit de eigen PIDs per band de druk en de temperatuur) en
// stand() (de vier banden tegen elkaar: 10% onder de mediaan oranje, 20%
// rood, een meting van meer dan een half uur oud telt niet mee — #396), en
// ververs(): de banden op verzoek, buiten de pollus om.
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
// Oud: een meting van veertig minuten geleden telt niet mee. Vijf minuten
// wel: de banden worden op verzoek gevraagd, niet elke minuut (#396).
st = B.stand(ind, druk(2.3, 1.2, 2.3, 2.3), Object.assign({}, tijden, { '222A06': NU - 300000 }), NU);
t('een meting van 5 min is nog vers: op verzoek gevraagd, niet elke minuut', [st.ernst, st.wielen.VR.druk.oud], ['danger', false]);
const oud = Object.assign({}, tijden, { '222A06': NU - 2400000 });
st = B.stand(ind, druk(2.3, 1.2, 2.3, 2.3), oud, NU);
t('een oude meting (40 min) telt niet, en is dof', [st.ernst, st.wielen.VR.druk.oud, st.wielen.VR.ernst], ['ok', true, 'ok']);
const tweeOud = Object.assign({}, oud, { '222A07': NU - 2400000 });
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

// Het autootje in het lampje van Slim visueel (#371): per wiel de kleur.
// Groen alleen voor een band die gemeten én vergeleken is.
const W = x => JSON.stringify(B.wielKleuren(x));
t('vier gelijk: vier groene wielen', W(B.stand(ind, druk(2.3, 2.3, 2.4, 2.4), tijden, NU)), JSON.stringify({ VL: 'ok', VR: 'ok', AL: 'ok', AR: 'ok' }));
t('één zachte band: alleen dat wiel rood', W(B.stand(ind, druk(2.3, 1.7, 2.3, 2.3), tijden, NU)), JSON.stringify({ VL: 'ok', VR: 'danger', AL: 'ok', AR: 'ok' }));
t('een oude meting: dat wiel grijs, niet groen', B.wielKleuren(B.stand(ind, druk(2.3, 1.2, 2.3, 2.3), oud, NU)).VR, 'geen');
t('twee oud, dus niet te vergelijken: geen enkel wiel groen', Object.values(B.wielKleuren(B.stand(ind, druk(2.3, 2.3, 2.3, 2.3), tweeOud, NU))).every(k => k === 'geen'), true);
t('niets gemeten: vier grijze wielen', Object.values(B.wielKleuren(B.stand(ind, {}, {}, NU))).every(k => k === 'geen'), true);
const mini = B.mini({ VL: 'ok', VR: 'danger', AL: 'ok', AR: 'warn' });
t('het autootje heeft vier wielen, elk met zijn eigen kleur', [...mini.matchAll(/class="vbm-wiel (\w+)"/g)].map(m => m[1]).join(','), 'ok,danger,ok,warn');
t('…en een romp', /class="vbm-romp"/.test(mini), true);
t('zonder wielen: vier grijze', (B.mini(null).match(/vbm-wiel geen/g) || []).length, 4);

// ── ververs(): op verzoek, buiten de pollus (#396) ──
(async () => {
  console.log('\n— op verzoek: tempo, pollus, keuzelijst en ververs() —');
  t('een band zonder gekozen tempo: op verzoek, niet elke minuut', ['222A05', '222A0A'].map(p => E.opVerzoek(p)), [true, true]);
  t('de motorolie (geen band) blijft in de pollus', E.opVerzoek('221310'), false);
  E.zet(lijst.map(x => x.code === '222A06' ? Object.assign({}, x, { tempo: 'minuut' }) : x), 'CX-5');
  t('een band met een gekozen tempo houdt dat tempo (de keuze wint)', [E.opVerzoek('222A06'), E.interval('222A06')], [false, 60000]);
  E.zet(lijst, 'CX-5');
  t('in het oordeel van blok 5 telt een band op verzoek mee, ook zonder vinkje',
    E.oordeel({ echt: true, defs: E.defs().filter(d => d.pid === '222A05'), actief: [], laatst: { '222A05': NU - 3600000 }, waarden: { '222A05': 2.3 }, nu: NU }).staat, 'ok');

  const gevraagd = [], bus = [], diag = [];
  s.connected = true; s.demoMode = false; s._btGen = 7;
  s.withBus = async (wat, f) => { bus.push(wat); return f(); };
  s.parsePID = (pid, raw) => raw === 'NO DATA' ? null : 2.3;
  s.markPidData = () => {}; s.markPidNoData = () => {}; s.btDiag = (m) => diag.push(m);
  const waarden = {};
  s.updPID = (pid, v) => { waarden[pid] = v; };
  E.vraag = async (pid) => { gevraagd.push(pid); return pid === '222A0D' ? 'NO DATA' : '62' + pid.slice(2) + '45'; };
  const [r1, r2] = await Promise.all([B.ververs(), B.ververs()]);
  t('ververs vraagt de acht banden één keer, in één busbeurt', [gevraagd.length, new Set(gevraagd).size, bus.length, gevraagd.indexOf('221310')], [8, 8, 1, -1]);
  t('een tweede ververs tijdens de eerste wacht op dezelfde beurt', r1 === r2 || JSON.stringify(r1) === JSON.stringify(r2), true);
  t('wat antwoordt komt in pidVals, wat niet antwoordt niet', [r1.goed, '222A05' in waarden, '222A0D' in waarden], [7, true, false]);
  await B.eenmaal();
  t('Slim visueel opent opnieuw in dezelfde verbinding: niet nog eens vragen', gevraagd.length, 8);
  s._btGen = 8;
  await B.eenmaal();
  t('nieuwe verbinding: Slim visueel vraagt de banden weer', gevraagd.length, 16);
  s.connected = false;
  const r3 = await B.ververs();
  t('niet verbonden: geen busbeurt', [r3.ok, bus.length], [false, 2]);

  // ── de ronde van vijf minuten en de ene regel in de sensorlijst ──
  const M = B.AUTO_MS;
  t('vijf minuten is het tempo', M, 300000);
  t('moetVragen: aan, klaar, banden, 5 min geleden: ja', B.moetVragen(NU, NU - M, true, true, true), true);
  t('moetVragen: 4 min geleden: nee', B.moetVragen(NU, NU - 240000, true, true, true), false);
  t('moetVragen: vinkje uit: nee', B.moetVragen(NU, 0, false, true, true), false);
  t('moetVragen: midden in het verbinden: nee (de koude poort heeft de bus)', B.moetVragen(NU, 0, true, false, true), false);
  t('moetVragen: geen banden: nee', B.moetVragen(NU, 0, true, true, false), false);

  const opslag = {};
  s.localStorage = { getItem: k => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); } };
  t('het vinkje staat standaard aan', B.aan(), true);
  B.zetAan(false);
  t('uitzetten blijft bewaard op dit toestel', [B.aan(), opslag.pl_banden_auto], [false, '0']);
  const regelUit = B.lijstRegel('');
  t('de sensorlijst krijgt één regel voor de acht banden, met het vinkje uit', [regelUit && regelUit.naam, regelUit && regelUit.n, regelUit && regelUit.aan], ['🛞 Banden', 8, false]);
  t('zoeken op "band" vindt de regel, op "olie" niet', [!!B.lijstRegel('band'), B.lijstRegel('olie')], [true, null]);
  t('zoeken op een bandcode vindt hem ook', !!B.lijstRegel('222a05'), true);

  // tik(): met het vinkje uit vraagt hij niets, aan wel meteen, en daarna pas na 5 min.
  s.connected = true; s._plVerbindingKlaar = 1; s._btGen = 9;
  const voor = gevraagd.length;
  B.tik(); await new Promise(r => setTimeout(r, 0));
  t('tik met het vinkje uit: niets gevraagd', gevraagd.length, voor);
  B.zetAan(true);
  B.tik(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  t('vinkje aan: de volgende tik vraagt de acht banden', gevraagd.length - voor, 8);
  B.tik(); await new Promise(r => setTimeout(r, 0));
  t('de tik erna (binnen 5 min) vraagt niets', gevraagd.length - voor, 8);
  s._plVerbindingKlaar = 0; B.zetAan(true);
  B.tik(); await new Promise(r => setTimeout(r, 0));
  t('midden in het verbinden vraagt de tik niets, ook met het vinkje aan', gevraagd.length - voor, 8);
  E.zet([lijst[8]], 'CX-5');
  t('een auto zonder banden: geen regel in de sensorlijst', B.lijstRegel(''), null);
  E.zet(lijst, 'CX-5');

  // De pollus zelf: pidsDueNow uit de echte pidlane-plload.js.
  const PL = lees('pidlane-plload.js');
  const i = PL.indexOf('function pidsDueNow(){'), j = PL.indexOf('const EIGEN_PER_RONDE=2;');
  if (i < 0 || j < 0) { console.log('FOUT: pidsDueNow niet gevonden in pidlane-plload.js'); process.exit(1); }
  const due = new Function('activePIDs', '_pidDead', '_pidDeadSince', '_pidNextPoll', 'pidPollInterval', 'window', PL.slice(i, j) + 'const EIGEN_PER_RONDE=2;\nreturn pidsDueNow;')(
    ['010C', '222A05', '222A0A', '221310'], new Set(), {}, {}, p => 1000, s)();
  t('de pollus slaat de banden op verzoek over, de motorolie niet', due.join(','), '010C,221310');

  // De keuzelijst: de echte regel uit pidlane-rijsituatie.js.
  const RS = lees('pidlane-rijsituatie.js');
  const ki = RS.indexOf('  // Eigen PIDs van het voertuig dat aan de adapter hangt'), kj = RS.indexOf("  catch(e){ console.warn('Eigen PIDs niet in de keuzelijst gezet'");
  if (ki < 0 || kj < 0) { console.log('FOUT: de eigen PIDs in de keuzelijst niet gevonden in pidlane-rijsituatie.js'); process.exit(1); }
  const keuze = new Function('plEigenDefs', 'discoveredPIDDefs', RS.slice(ki, kj) + "catch(e){ throw e; }\nreturn discoveredPIDDefs;")(() => E.defs(), []);
  t('in de keuzelijst: de motorolie wel, de acht banden niet', keuze.map(d => d.pid).join(','), '221310');

  console.log('\n' + (fout ? fout + ' van ' + (ok + fout) + ' FOUT' : 'Alle ' + ok + ' goed'));
  process.exit(fout ? 1 : 0);
})().catch(e => { console.log('FOUT: ' + (e && e.stack || e)); process.exit(1); });
