// ══════════════════════════════════════════════════════════════════
// bproef-navigatie.js — onderbalk, startscherm en garagemodus in de echte app
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT (29-09-2026)
// test-nav.js toetst de regels los. Wat daar niet in past is de koppeling:
// verschijnt de balk echt pas na het inloggen, licht de goede tab op als een
// ander scherm de app van onderen wegtrekt, sluit Meer als je een andere tab
// kiest, landt een tegel op de goede wizardvraag, en volgt het startscherm
// de schakelaars uit beheer.html. Dat zijn allemaal dingen die in node groen
// staan en in de auto stuk kunnen zijn.
//
// DE TEGENPROEVEN DIE ERIN ZITTEN
//   • Deel 1: vóór het inloggen staat er géén balk — anders ziet een
//     Play-reviewer tabs die nergens heen gaan.
//   • Deel 5: "Alle functies" is weg zodra de garagemodus uitgaat.
//   • Deel 6: een tegel die in beheer aan staat, staat er ook echt.
//   • Deel 8: de automatische check draait één keer, niet bij elke verbinding.
//
// Draaien vanuit public/:  node bproef-navigatie.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const rust = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let app;
  try {
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') { console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]); process.exit(0); }
    throw e;
  }
  const wacht = async (expr, ms) => {
    for (let i = 0; i < (ms || 8000) / 100; i++) { if (await app.ev(expr)) return true; await rust(100); }
    return false;
  };
  const tab = `[...document.querySelectorAll('.pl-nav-tab.aan')].map(b=>b.dataset.tab).join(',')`;
  const toon = (id) => `(function(){ const e=document.getElementById('${id}'); return !!e && getComputedStyle(e).display!=='none'; })()`;

  try {
    console.log('\n1. Vóór het inloggen: geen balk');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('PLNav staat er', await app.ev(`typeof PLNav === 'object'`));
    await app.ev(`PLNav.ververs(); 'ok'`);
    toets('de balk staat er niet  <- tegenproef: tabs zonder app erachter', !(await app.ev(`document.body.classList.contains('pl-nav-aan')`)));

    console.log('\n2. Demo gestart: balk, Mijn auto licht op, gewone taal bovenin');
    await app.ev(`plDemoZonderLogin(); setTimeout(function(){ startDemoCar(0); }, 700); 'ok'`);
    toets('de balk verschijnt', await wacht(`document.body.classList.contains('pl-nav-aan') && !document.getElementById('welcomeScreen').classList.contains('hidden')`, 15000));
    toets('Mijn auto licht op', (await app.ev(tab)) === 'auto', await app.ev(tab));
    toets('de statusregel zegt Demo, niet "Systeem"', (await app.ev(`document.getElementById('sysTxt').textContent`)) === 'Demo');
    toets('de demo zonder login is geen garage', !(await app.ev(`document.body.classList.contains('pl-garage')`)));
    toets('Admin staat niet in Meer voor de demo', !(await app.ev(toon('admGroupBtn'))));

    console.log('\n3. De tabs gaan waar ze zeggen');
    await app.ev(`PLNav.tab('live'); 'ok'`);
    toets('Live: het startscherm is weg', await app.ev(`document.getElementById('welcomeScreen').classList.contains('hidden')`));
    toets('Live licht op', (await app.ev(tab)) === 'live', await app.ev(tab));
    toets('de live-acties staan in beeld', await app.ev(toon('plLiveActies')));
    await app.ev(`PLNav.tab('rapporten'); 'ok'`);
    toets('Rapporten opent het overzicht', await app.ev(toon('reportsOverviewSheet')));
    toets('Rapporten licht op', (await app.ev(tab)) === 'rapporten', await app.ev(tab));
    await app.ev(`PLNav.tab('auto'); 'ok'`);
    toets('Mijn auto sluit het overzicht en toont het startscherm',
      !(await app.ev(toon('reportsOverviewSheet'))) && !(await app.ev(`document.getElementById('welcomeScreen').classList.contains('hidden')`)));

    console.log('\n4. Meer opent en gaat weer dicht');
    await app.ev(`document.querySelector('.pl-nav-tab[data-tab="meer"]').click(); 'ok'`);
    toets('Meer staat open', await app.ev(`document.getElementById('kebabMenu').classList.contains('open')`));
    toets('Meer licht op', (await app.ev(tab)) === 'meer', await app.ev(tab));
    await app.ev(`document.querySelector('.pl-nav-tab[data-tab="live"]').click(); 'ok'`);
    toets('een andere tab sluit Meer', !(await app.ev(`document.getElementById('kebabMenu').classList.contains('open')`)));
    toets('en gaat naar Live', (await app.ev(tab)) === 'live', await app.ev(tab));

    console.log('\n5. Een tegel landt op zijn eigen wizardvraag');
    await app.ev(`PLNav.tab('auto'); document.querySelector('.pl-tegel.tg-storing').click(); 'ok'`);
    const vraag = await app.ev(`(document.querySelector('#wizardNieuwOv .wz-vraag')||{}).textContent||''`);
    toets('"Er is iets mis" vraagt meteen wanneer je het merkt', /Wanneer merk je het/.test(vraag), vraag);
    await app.ev(`PLWizard.sluit(); document.querySelector('.pl-tegel.tg-rit').click(); 'ok'`);
    const rit = await app.ev(`(document.querySelector('#wizardNieuwOv .wz-vraag')||{}).textContent||''`);
    toets('"Rit starten" vraagt wat je onderweg wilt', /onderweg/.test(rit), rit);
    await app.ev(`PLWizard.sluit(); 'ok'`);

    console.log('\n6. Garagemodus: Alle functies');
    await app.ev(`PLNav.zetGarage(false); 'ok'`);
    toets('garagemodus uit → geen "Alle functies"  <- tegenproef', !(await app.ev(toon('plAllesBtn'))));
    await app.ev(`PLNav.zetGarage(true); 'ok'`);
    toets('garagemodus aan → "Alle functies" staat er', await app.ev(toon('plAllesBtn')));
    await app.ev(`document.getElementById('plAllesBtn').click(); 'ok'`);
    const panelen = await app.ev(`[...document.querySelectorAll('.wm-door-panel')].filter(p=>getComputedStyle(p).display!=='none').length`);
    toets('alle vijf panelen onder elkaar', panelen === 5, 'zichtbaar: ' + panelen);
    await app.ev(`backToDoors(); PLNav.zetGarage(false); 'ok'`);
    toets('terug: het startscherm weer, de panelen dicht', await app.ev(toon('wmDoors')) &&
      (await app.ev(`[...document.querySelectorAll('.wm-door-panel')].filter(p=>getComputedStyle(p).display!=='none').length`)) === 0);

    console.log('\n7. De tegels volgen de schakelaars uit beheer.html');
    await app.ev(`window.PID_CONFIG = Object.assign({}, window.PID_CONFIG||{}, { door_saving_active:false }); applyConfigToUI(); 'ok'`);
    toets('door_saving_active uit → de tegel Rit starten is weg', !(await app.ev(`getComputedStyle(document.querySelector('.pl-tegel.tg-rit')).display!=='none'`)));
    toets('en Kopen of verkopen staat er nog  <- tegenproef', await app.ev(`getComputedStyle(document.querySelector('.pl-tegel.tg-handel')).display!=='none'`));
    await app.ev(`window.PID_CONFIG.door_saving_active = true; applyConfigToUI(); 'ok'`);

    console.log('\n8. Wat onderaan zweeft, ligt boven de balk');
    const fab = await app.ev(`(function(){ const f=document.getElementById('fabLane'); const n=document.getElementById('plNav');
      if(!f||!n) return null; return { fab: parseFloat(getComputedStyle(f).bottom), nav: n.getBoundingClientRect().height }; })()`);
    toets('#fabLane begint boven de balk', !!fab && fab.fab >= fab.nav, JSON.stringify(fab));

    console.log('\n9. De automatische check na verbinden');
    toets('in de demo niet  <- daar kiest de reviewer zelf', (await app.ev(`PLNav.naVerbinding()`)) === false);
    await app.ev(`demoMode = false; 'ok'`);
    toets('bij hervatten niet', (await app.ev(`PLNav.naVerbinding({hervat:true})`)) === false);
    toets('een gewone verbinding wel', (await app.ev(`PLNav.naVerbinding()`)) === true);
    toets('en daarna in dezelfde sessie niet nog eens  <- tegenproef', (await app.ev(`PLNav.naVerbinding()`)) === false);
    toets('het Check-venster opent vanzelf', await wacht(toon('plFcOv'), 3000));
    await app.ev(`PLFoutcodes.sluit(); demoMode = true; 'ok'`);

    toets('de hele rit zonder JS-fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n─────────────────────────────────────────');
  if (fouten) { console.log('bproef-navigatie: ' + fouten + ' FOUT\n'); process.exit(1); }
  console.log('bproef-navigatie: goed\n');
  process.exit(0);
})().catch(e => { console.error('bproef-navigatie brak af: ' + e.message); process.exit(1); });
