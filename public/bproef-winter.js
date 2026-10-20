// ════════════════════════════════════════════════════════════════
// bproef-winter.js — de winterkaart en het winterprofiel in de echte app (#556/#559)
// ────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
// test-winter.js toetst de regels in node. Wat daar niet kan: of de kaart
// werkelijk op het startscherm komt, of "Later" de banner voor dit seizoen
// wegzet (en hij na opnieuw tekenen wegblijft), of het profielvenster de
// keuzes, de bandentabel en de foutmelding van de echte DOM gebruikt, en of
// wat er bewaard wordt op het toestel landt. Zonder account: dan is
// localStorage de opslag; het account-pad zit in test-klantplatform.js.
//
// De klok staat in de pagina op 20-11-2026, zodat de proef in juli niet
// ineens "geen winter" meet.
//
// Draaien vanuit public/:  node bproef-winter.js
// ════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

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
  const kaart = () => app.ev(`(document.getElementById('plWinterKaart')||{}).innerText || ''`);

  try {
    console.log('\n1. De kaart en de banner');
    toets('PLWinter en PLWeer zijn geladen', await app.ev(`typeof PLWinter === 'object' && typeof PLWeer === 'object' && typeof PLWinter.open === 'function'`));
    toets('de kaart staat vlak boven het startscherm', await app.ev(`(function(){ var k = document.getElementById('plWinterKaart'); return !!k && k.nextElementSibling && k.nextElementSibling.id === 'wmDoors'; })()`));
    await app.ev(`(function(){
      var vast = new Date(2026, 10, 20, 12, 0, 0).getTime();
      Date.now = function () { return vast; };
      ['pl_winter', 'pl_winter_gezien', 'pl_winter_weg', 'pl_weer'].forEach(function (k) { localStorage.removeItem(k); });
      PLWinter.teken(true);
    })()`);
    let t = await kaart();
    toets('november, nog niets ingevuld: de banner', /Het wordt kouder/.test(t) && /pas je profiel aan voor de winterperiode/i.test(t), t);
    toets('met de knop Profiel aanpassen', await app.ev(`!!Array.from(document.querySelectorAll('#plWinterKaart button')).find(function (b) { return /Profiel aanpassen/.test(b.textContent); })`));

    console.log('\n2. Later = gezien voor dit seizoen');
    await app.ev(`PLWinter._later()`);
    t = await kaart();
    toets('de banner is weg', !/Het wordt kouder/.test(t), t);
    toets('onthouden als winter-2026', await app.ev(`localStorage.getItem('pl_winter_gezien')`) === '"winter-2026"');
    toets('de gewone kaart: kies je plaats', /Winter/.test(t) && /Kies je plaats voor het weer/.test(t), t);
    await app.ev(`PLWinter.teken(true)`);
    toets('opnieuw getekend: de banner blijft weg', !/Het wordt kouder/.test(await kaart()));

    console.log('\n3. Met profiel en verwachting: drie dagen en één advies');
    await app.ev(`(function(){
      localStorage.setItem('pl_winter', JSON.stringify({ plaats: 'utrecht', banden: 'zomer', sproeier: 'zomer' }));
      localStorage.setItem('pl_weer', JSON.stringify({ plaats: 'utrecht', naam: 'Utrecht', t: Date.now(), dagen: [
        { datum: '2026-11-20', min: -3, max: 2, neerslag: 0, sneeuw: 0 },
        { datum: '2026-11-21', min: -1, max: 4, neerslag: 2, sneeuw: 0 },
        { datum: '2026-11-22', min: 3, max: 8, neerslag: 0, sneeuw: 0 } ] }));
      PLWinter.teken(true);
    })()`);
    t = await kaart();
    toets('drie dagen in de strook', await app.ev(`document.querySelectorAll('#plWinterKaart .plw-dag').length`) === 3);
    toets('vandaag en morgen bij naam', /vandaag/i.test(t) && /morgen/i.test(t), t);
    toets('de plaats staat erbij', /Utrecht/.test(t));
    toets('één advies, het zwaarste: de sproeier (rood)', await app.ev(`document.querySelectorAll('#plWinterKaart .plw-adv').length === 1 && document.querySelector('#plWinterKaart .plw-adv').classList.contains('rood')`) && /Zomervloeistof/.test(t), t);
    toets('met de bron erbij', /Op basis van je profiel en de verwachting voor Utrecht/.test(t), t);
    toets('met de tijd van de verwachting en een verversknop', /Bijgewerkt om \d\d:\d\d/.test(t) && await app.ev(`!!document.querySelector('#plWinterKaart .plw-ver')`), t);
    const vers = await app.ev(`(function(){ var echt = PLWeer.haal, gevraagd = null;
      PLWeer.haal = function (p, o) { gevraagd = { p: p, o: o }; return Promise.resolve(PLWeer.laatst(p)); };
      return PLWinter._ververs().then(function () { PLWeer.haal = echt; return JSON.stringify(gevraagd); }); })()`);
    toets('verversen haalt opnieuw, ook binnen het uur (forceer)', /"p":"utrecht"/.test(vers) && /"forceer":true/.test(vers), vers);
    toets('en hoeveel er nog meer zijn', /nog \d+ adviezen in je winterprofiel/.test(t), t);
    await app.ev(`document.querySelector('#plWinterKaart .plw-x').click()`);
    t = await kaart();
    toets('weggetikt: het volgende advies komt (de banden)', /Tijd voor winterbanden/.test(t) && !/Zomervloeistof/.test(t), t);

    console.log('\n4. Het winterprofiel');
    await app.ev(`PLWinter.open()`);
    toets('het venster staat open', await app.ev(`getComputedStyle(document.getElementById('plZonderOv')).display !== 'none' && !!document.getElementById('plw_plaats')`));
    toets('alle plaatsen in de keuzelijst, Utrecht gekozen', await app.ev(`document.getElementById('plw_plaats').options.length === PLWeer.PLAATSEN.length + 1 && document.getElementById('plw_plaats').value === 'utrecht'`));
    toets('de bandentabel markeert de zomerband', await app.ev(`/Zomerband/.test(document.querySelector('#plwTabel .plw-bt-rij.mijn').textContent)`));
    toets('met de stippen van de verwachting', await app.ev(`document.querySelectorAll('#plwTabel .plw-bt-dot').length`) === 3);
    toets('en de zin dat het een model is', /een model op basis van bandentests/i.test(await app.ev(`document.getElementById('plZonderOv').innerText`)));
    toets('het sproeierdeel "beschermd tot" is verborgen bij zomervloeistof', await app.ev(`document.getElementById('plwSproeierWinter').hidden === true`));
    await app.ev(`(function(){
      document.querySelector('input[name="plw_banden"][value="winter"]').click();
      document.querySelector('input[name="plw_sproeier"][value="winter"]').click();
    })()`);
    toets('banden op winter: de tabel volgt meteen', await app.ev(`/Winterband/.test(document.querySelector('#plwTabel .plw-bt-rij.mijn').textContent)`));
    toets('wintervloeistof: "beschermd tot" verschijnt', await app.ev(`document.getElementById('plwSproeierWinter').hidden === false`));
    await app.ev(`(function(){ document.getElementById('plw_banden_dot').value = '5521'; return PLWinter._bewaar(); })()`);
    toets('DOT week 55: een foutmelding, niets bewaard', /DOT-code is vier cijfers/.test(await app.ev(`document.getElementById('plwFout').innerText`)) &&
      JSON.parse(await app.ev(`localStorage.getItem('pl_winter')`)).banden === 'zomer');
    await app.ev(`(function(){ document.getElementById('plw_banden_dot').value = '4521'; document.getElementById('plw_sproeier_tot').value = '-25'; document.getElementById('plw_sproeier_datum').value = '2026-11-15'; return PLWinter._bewaar(); })()`);
    const p = JSON.parse(await app.ev(`localStorage.getItem('pl_winter')`) || '{}');
    toets('bewaard op het toestel', p.banden === 'winter' && p.sproeier === 'winter' && p.sproeier_tot === -25 && p.banden_dot === '4521' && p.plaats === 'utrecht', JSON.stringify(p));
    toets('het venster is dicht', await app.ev(`getComputedStyle(document.getElementById('plZonderOv')).display === 'none'`));
    t = await kaart();
    toets('de kaart zegt niets meer over sproeier of wisselen', !/Zomervloeistof|Tijd voor winterbanden/.test(t), t);

    console.log('\n5. Buiten het seizoen');
    await app.ev(`(function(){ var juli = new Date(2027, 6, 1, 12).getTime(); Date.now = function () { return juli; }; localStorage.setItem('pl_winter', JSON.stringify({ banden: 'zomer' })); PLWinter.teken(true); })()`);
    toets('juli met zomerbanden: geen kaart', (await kaart()) === '');

    if (process.env.PL_SCHERM) await app.schermafdruk(process.env.PL_SCHERM);
    toets('geen fouten in de console van de app', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }
  console.log('\n' + (fouten ? fouten + ' FOUT' : 'Alles goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('FOUT ' + (e && e.stack || e)); process.exit(1); });
