// ═══════════════════════════════════════════════════════════════════
// bproef-grafiek.js — het grafiektabblad in de draaiende app
// ───────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// Het grafiektabblad is op 26-09-2026 herbouwd: één baan per sensor, elk met
// een eigen as, hoogstens drie tegelijk. Het oude tabblad werd bij een
// groepskeuze niet meer bijgewerkt, omdat hertekenen aan `graphPID===pid` hing
// en een groep graphPID op null zette. Dat is koppeling tussen twee modules
// (pids.js schrijft pidHist, graph.js leest hem), en dus een vraag voor een
// browser en niet voor node.
//
// Wat hier getoetst wordt:
//   1. een groep kiezen geeft hoogstens drie banen, elk met naam en waarde
//   2. een waarde buiten het normaalbereik staat in het rood, en de zin
//      eronder zegt hoeveel van de tijd
//   3. er is ook echt getekend (niet-lege pixels op het canvas)
//   4. een nieuwe meetwaarde komt vanzelf in beeld, zonder klik (de klok)
//   5. een vierde sensor duwt de oudste eruit; ✕ haalt er een weg
//   6. TEGENPROEF: met de klok stil komt de nieuwe waarde níet in beeld —
//      anders werkt deel 4 om een andere reden en meet hij de klok niet
//
// Draaien vanuit public/:  node bproef-grafiek.js
// ═══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// Vul pidHist met een verloop van twee minuten, zoals updPID() dat doet.
const VUL = `
  window.__vul = function (pid, van, tot) {
    const nu = Date.now(); pidHist[pid] = [];
    for (let i = 0; i < 60; i++) pidHist[pid].push({ t: nu - (60 - i) * 2000, v: van + (tot - van) * i / 59 });
    pidVals[pid] = tot;
  };
  window.__wacht = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  window.__banen = function () {
    return [...document.querySelectorAll('#grBanen .gr-baan')].map(function (b) {
      const c = b.querySelector('canvas'), g = c.getContext('2d');
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let gevuld = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) gevuld++;
      return { pid: b.dataset.pid, naam: b.querySelector('.gr-naam').textContent,
               waarde: b.querySelector('.gr-waarde').textContent,
               rood: b.querySelector('.gr-waarde').classList.contains('buiten'),
               zin: b.querySelector('.gr-zin').textContent, gevuld: gevuld };
    });
  };
`;

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
    await app.ev(VUL + `
      window.ensurePIDListActive = function () { return Promise.resolve(); };
      document.getElementById('welcomeScreen').classList.add('hidden');
      sw('graph', document.getElementById('tabGraph'));
      true`);

    console.log('\n1. Een groep kiezen: hoogstens drie banen, elk met naam en waarde');
    // Temperatuur: koelvloeistof (0105) loopt op tot boven zijn waarschuwingsgrens.
    const def = await app.ev(`(function(){ const d = getPidDef('0105') || {}; return { wH: d.wH, wL: d.wL }; })()`);
    const heet = (typeof def.wH === 'number' ? def.wH : 110) + 8;
    const een = await app.ev(`(async function(){
      __vul('0105', 80, ${heet}); __vul('015C', 60, 62); __vul('010F', 20, 22); __vul('0146', 15, 15);
      grKiesGroep('temp'); await __wacht(200);
      return __banen();
    })()`);
    toets('hoogstens drie banen', een.length === 3, een.length + ' banen: ' + een.map(b => b.pid).join(','));
    toets('elke baan heeft een naam en een waarde', een.every(b => b.naam && b.waarde && b.waarde !== '—'),
      JSON.stringify(een.map(b => [b.naam, b.waarde])));

    console.log('\n2. Buiten normaal is rood, en de zin zegt hoe vaak');
    const koel = een.find(b => b.pid === '0105') || {};
    toets('koelvloeistof boven ' + def.wH + ' staat in het rood', koel.rood, JSON.stringify(koel));
    toets('de zin noemt het aandeel buiten normaal', /% van de tijd buiten normaal/.test(koel.zin || ''), koel.zin);
    const rustig = een.find(b => b.pid !== '0105' && !b.rood);
    toets('een rustige sensor staat niet in het rood', !!rustig, JSON.stringify(een.map(b => [b.pid, b.rood])));

    console.log('\n3. Er is echt getekend');
    toets('elk canvas heeft pixels', een.every(b => b.gevuld > 200), JSON.stringify(een.map(b => [b.pid, b.gevuld])));

    console.log('\n4. Een nieuwe meetwaarde komt vanzelf in beeld');
    const live = await app.ev(`(async function(){
      pidHist['015C'].push({ t: Date.now(), v: 77.7 }); pidVals['015C'] = 77.7;
      await __wacht(1400);
      const b = __banen().find(x => x.pid === '015C');
      return b ? b.waarde : null;
    })()`);
    toets('de baan toont de nieuwe waarde zonder klik', /77[,.]7|78/.test(String(live)), 'baan zegt: ' + live);

    console.log('\n5. Een vierde sensor en de ✕');
    const vier = await app.ev(`(async function(){
      __vul('0142', 13.9, 14.1);
      const eerste = __banen()[0].pid;
      grVoegToe('0142'); await __wacht(150);
      const na = __banen().map(b => b.pid);
      document.querySelector('#grBaan-0142 .gr-weg').click(); await __wacht(150);
      return { eerste: eerste, na: na, naWeg: __banen().map(b => b.pid) };
    })()`);
    toets('nog steeds drie banen', vier.na.length === 3, vier.na.join(','));
    toets('de oudste is eruit, de nieuwe erin', vier.na.indexOf(vier.eerste) < 0 && vier.na.indexOf('0142') >= 0, vier.na.join(','));
    toets('✕ haalt de baan weg', vier.naWeg.indexOf('0142') < 0 && vier.naWeg.length === 2, vier.naWeg.join(','));

    console.log('\n6. TEGENPROEF — met de klok stil komt een nieuwe waarde niet in beeld');
    const stil = await app.ev(`(async function(){
      const echt = window._grTik; window._grTik = function () {};
      try {
        const pid = __banen()[0].pid;
        pidHist[pid].push({ t: Date.now(), v: 55.5 }); pidVals[pid] = 55.5;
        await __wacht(1400);
        return __banen()[0].waarde;
      } finally { window._grTik = echt; }
    })()`);
    toets('zonder klok blijft de oude waarde staan', !/55[,.]5|56/.test(String(stil)),
      'de waarde kwam toch in beeld (' + stil + ') — dan tekent iets anders en meet deel 4 de klok niet');

    toets('geen fouten in de console', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? 'bproef-grafiek: ' + fouten + ' FOUT' : 'bproef-grafiek: alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-grafiek brak af: ' + (e && e.stack || e)); process.exit(1); });
