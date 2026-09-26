// ═══════════════════════════════════════════════════════════════════
// bproef-systeemtest.js — de systeemtest als checklist die zichzelf afvinkt
// ───────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// Tot 26-09-2026 liep de systeemtest de tests één voor één af, met per test
// 12–30 s wachten op een voorwaarde. Wie reed, zag de stationair-tests falen
// of wegvallen; wie stilstond, de rijtests. Nu staan alle tests tegelijk
// klaar en meet elke test alleen in zijn eigen situatie (sit in BSC_TESTS).
//
// De vraag of dat klopt gaat over drie modules tegelijk — de catalogus in
// pidlane-data.js, de rijfase uit PLMon._state() in pidlane-monitor.js en de
// loop in pidlane-totalcheck.js — met een klok ertussen. Daarom in de echte
// app, met een nagebootste rit: eerst stilstaand en warm, dan constant 60.
//
// Wat hier getoetst wordt:
//   1. stilstaand: de stationair-tests vinken zich af; de rijtests WACHTEN
//      (geen twijfel, geen n.v.t.); de koude-starttest valt af omdat de
//      motor al warm was
//   2. rijden: de rijtests vinken zich af; een stationair-test die nog open
//      stond wacht gewoon verder en wordt niet afgekeurd
//   3. stoppen: wat open stond heet "niet getest" met de reden erbij, en telt
//      niet als twijfel
//   4. TEGENPROEF: zonder herkende situatie meet er niets. Anders vinkt iets
//      anders de tests af en meet deel 1 de situatiepoort niet.
//
// Draaien vanuit public/:  node bproef-systeemtest.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// Een nagebootste auto: elke 250 ms nieuwe waarden in pidVals én pidHist,
// zoals updPID() dat doet. De rijfase leest de snelheidshistorie.
const AUTO = `
  window.__zet = function (stand) { window.__stand = stand; };
  window.__wacht = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  window.__st = function (id) { return _bscState ? _bscState.stand[id].st : (window._bscLast || []).filter(function (r) { return r.id === id; }).map(function (r) { return r.status; })[0]; };
  if (!window.__autoKlok) window.__autoKlok = setInterval(function () {
    const S = window.__stand; if (!S) return;
    const nu = Date.now(), ruis = function (a) { return (Math.random() - .5) * a; };
    const w = {
      '010C': S.rpm + ruis(S.rpm > 1000 ? 20 : 10), '010D': S.spd, '0105': S.ect, '0142': S.volt,
      '010B': S.map, '0104': S.load, '0107': 2 + ruis(.5), '0106': ruis(2), '0111': S.gas,
      '0110': S.maf, '015E': S.verbruik, '010F': 30, '0146': 18,
      '0114': (Math.floor(nu / 300) % 2) ? .8 : .15, '0115': .7 + ruis(.04)
    };
    Object.keys(w).forEach(function (p) {
      pidVals[p] = w[p]; (pidHist[p] = pidHist[p] || []).push({ t: nu, v: w[p] });
      if (pidHist[p].length > 120) pidHist[p].shift();
    });
  }, 250);
  window.preAnalysisCheck = function () { return Promise.resolve(true); };
  window.ensurePIDListActive = function () { return Promise.resolve(); };
  window.detectEngineType = function () { return 'benzine'; };
  true`;
const STIL = `{ rpm: 780, spd: 0, ect: 90, volt: 14.1, map: 32, load: 22, gas: 14, maf: 3.2, verbruik: 0.8 }`;
const RIJ  = `{ rpm: 2000, spd: 60, ect: 91, volt: 14.2, map: 55, load: 30, gas: 20, maf: 12, verbruik: 5.5 }`;

(async () => {
  let app;
  try {
    app = await startApp({ root: __dirname });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    await app.ev(AUTO);

    console.log('\n1. Stilstaand en warm');
    const stil = await app.ev(`(async function(){
      __zet(${STIL}); await __wacht(1500);
      await startBasicCheck(); await __wacht(9000);
      const ids = ['idle_stab','map_idle','x_laadspanning','spd_rpm','x_rpm_const','fuel_flow','iat_amb','batt_rust'];
      const r = {}; ids.forEach(function (i) { r[i] = __st(i); });
      r.nu = (document.getElementById('bscNu') || {}).textContent;
      r.volgende = (document.getElementById('bscVolgende') || {}).textContent;
      return r;
    })()`);
    toets('stationair stabiliteit vinkt zich af', stil.idle_stab === 'ok', JSON.stringify(stil));
    toets('MAP stationair vinkt zich af', stil.map_idle === 'ok', stil.map_idle);
    toets('laadspanning vinkt zich af', stil.x_laadspanning === 'ok', stil.x_laadspanning);
    toets('snelheid vs toerental WACHT (geen twijfel, geen n.v.t.)', stil.spd_rpm === 'wacht', stil.spd_rpm);
    toets('toerental bij constante snelheid WACHT', stil.x_rpm_const === 'wacht', stil.x_rpm_const);
    toets('de koude-starttest valt af: de motor was al warm', stil.iat_amb === 'nvt', stil.iat_amb);
    toets('de accu-in-rusttest wacht op motor uit', stil.batt_rust === 'wacht', stil.batt_rust);
    toets('bovenaan staat de situatie van nu', /Stilstaand/.test(stil.nu || ''), stil.nu);
    toets('en een volgende kans met wat je moet doen', /Volgende kans/.test(stil.volgende || ''), stil.volgende);

    console.log('\n2. Rijden, constant 60');
    const rij = await app.ev(`(async function(){
      __zet(${RIJ}); await __wacht(10000);
      const ids = ['idle_stab','spd_rpm','x_rpm_const','fuel_flow','batt_rust'];
      const r = {}; ids.forEach(function (i) { r[i] = __st(i); });
      r.nu = (document.getElementById('bscNu') || {}).textContent;
      return r;
    })()`);
    toets('snelheid vs toerental vinkt zich af', rij.spd_rpm === 'ok', JSON.stringify(rij));
    toets('toerental bij constante snelheid vinkt zich af', rij.x_rpm_const === 'ok', rij.x_rpm_const);
    toets('wat stilstaand al groen was, blijft groen', rij.idle_stab === 'ok', rij.idle_stab);
    toets('de accu-in-rusttest wacht nog steeds, en is niet afgekeurd', rij.batt_rust === 'wacht', rij.batt_rust);
    toets('bovenaan staat nu een rijsituatie', /Constant rijden|Rijden/.test(rij.nu || ''), rij.nu);

    console.log('\n3. Stoppen');
    const eind = await app.ev(`(async function(){
      bscStop(false); await __wacht(200);
      const R = window._bscLast || [];
      const rust = R.find(function (r) { return r.id === 'batt_rust'; }) || {};
      const tekst = (document.getElementById('bscBody') || {}).innerText || '';
      return { rust: rust, twijfel: R.filter(function (r) { return r.status === 'twijfel'; }).map(function (r) { return r.id; }),
               tekst: tekst, loopt: !!_bscState };
    })()`);
    toets('de open test heet "niet getest"', eind.rust.status === 'nvt', JSON.stringify(eind.rust));
    toets('met de situatie die ontbrak als reden', /motor uit/i.test(eind.rust.reden || ''), eind.rust.reden);
    toets('het rapport zegt "niet getest", niet "twijfel"', /niet getest/.test(eind.tekst) && eind.twijfel.indexOf('batt_rust') < 0,
      'twijfel: ' + eind.twijfel.join(','));
    toets('de loop is gestopt', !eind.loopt);

    console.log('\n4. TEGENPROEF — zonder herkende situatie meet er niets');
    const tegen = await app.ev(`(async function(){
      const echt = window.bscSituaties;
      window.bscSituaties = function () { return new Set(); };
      try {
        __zet(${STIL}); await __wacht(600);
        await startBasicCheck(); await __wacht(6000);
        const r = { idle: __st('idle_stab'), map: __st('map_idle') };
        bscStop(true);
        return r;
      } finally { window.bscSituaties = echt; }
    })()`);
    toets('zonder situatie blijft stationair stabiliteit wachten', tegen.idle === 'wacht',
      'status ' + tegen.idle + ' — dan vinkt iets anders hem af en meet deel 1 de situatiepoort niet');
    toets('en MAP stationair ook', tegen.map === 'wacht', tegen.map);

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? 'bproef-systeemtest: ' + fouten + ' FOUT' : 'bproef-systeemtest: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-systeemtest brak af: ' + (e && e.stack || e)); process.exit(1); });
