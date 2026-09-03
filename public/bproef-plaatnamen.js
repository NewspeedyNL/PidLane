// ══════════════════════════════════════════════════════════════════
// bproef-plaatnamen.js — de namen op de tellerplaat passen echt
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// hudShortLabel() kortte tot 03-09-2026 af op elf tekens, overal. Dat is de
// maat van de HUD-hoekmeter: één regel, smal. De tellerplaat van de slimme
// weergave heeft er twee (-webkit-line-clamp:2 in pidlane.css), en gaf met
// diezelfde elf dus de helft van zijn ruimte weg — met "ABS. MOTO" als
// resultaat (#95).
//
// De plaat heeft nu een eigen grens, SLIM_METER_MAX in pidlane-pids.js. Die
// is niet gekozen maar GEMETEN: bij zeven meters is een kolom 54px breed en
// staat de naam op 8,5px. Alle 146 namen zijn door hudShortLabel() gehaald en
// daarna in het echte element opgemeten. Tot en met dertien tekens past elke
// uitkomst in twee regels; vanaf veertien vallen de eerste eruit.
//
// Zo'n grens is precies het soort getal dat stil verkeerd wordt. Verandert het
// lettertype, de kolombreedte of het aantal regels, dan klopt hij niet meer —
// en dat is nergens aan te zien behalve aan een label dat halverwege ophoudt.
// Daarom staat dit hier en niet in node: in node bestaat geen regelhoogte.
//
// De tegenproef zit erin: bij één teken meer moet er wél iets uitvallen. Kan
// de grens ruimer, dan zegt deze proef dat met de gemeten waarde erbij; is hij
// te ruim, dan wordt hij rood.
//
// Draaien vanuit public/:  node bproef-plaatnamen.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

/* Zeven meters naast elkaar: dat is de smalste kolom die in de praktijk
   voorkomt en dus de maatgevende. Met drie meters is een kolom twee keer zo
   breed en past alles — dan zou deze proef groen staan om de verkeerde reden. */
const METERS = ['0104', '0111', '0149', '0143', '010C', '0145', '014A'];

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
    console.log('\n1. De plaat staat er, met zeven meters naast elkaar');
    await app.ev(`startDemoCar(0); true`);
    await new Promise(r => setTimeout(r, 1200));
    await app.ev(`(function(){ ${JSON.stringify(METERS)}.forEach(function(p){ activePIDs.add(p); }); renderGauges(); return true; })()`);
    await new Promise(r => setTimeout(r, 700));

    const opzet = await app.ev(`(function(){
      const el = document.querySelector('.slim-meter .gn2');
      if (!el) return { fout: 'geen naam op de tellerplaat — staat de live view wel in de slimme weergave?' };
      return { meters: document.querySelectorAll('.slim-meter .gc').length,
               breedte: Math.round(el.getBoundingClientRect().width),
               regelhoogte: Math.round(parseFloat(getComputedStyle(el).lineHeight) * 10) / 10,
               grens: (typeof SLIM_METER_MAX === 'number') ? SLIM_METER_MAX : null };
    })()`);
    if (opzet.fout) { toets('de tellerplaat is opgebouwd', false, opzet.fout); throw new Error(opzet.fout); }
    toets('zeven meters op de plaat', opzet.meters >= 7, 'gevonden: ' + opzet.meters);
    toets('SLIM_METER_MAX staat in de app', typeof opzet.grens === 'number',
          'zonder die grens valt de plaat terug op de HUD-maat van elf');
    console.log('      kolom ' + opzet.breedte + 'px, regelhoogte ' + opzet.regelhoogte +
                'px, grens ' + opzet.grens);

    /* Meet elke naam in het ECHTE element: tekst erin, hoogte delen door de
       regelhoogte. Niet natekenen in een eigen div — dan meet je je eigen
       CSS en niet die van de app. */
    const meet = `(function(max){
      const el = document.querySelector('.slim-meter .gn2');
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 10;
      const oud = el.textContent;
      const namen = {};
      (window.PIDS || []).forEach(function(d){ if (d && d.name) namen[d.pid] = d.name; });
      Object.keys(window.ALL_PID_DEFS || {}).forEach(function(p){
        const d = ALL_PID_DEFS[p]; if (d && d.name && !namen[p]) namen[p] = d.name;
      });
      const teveel = [];
      Object.keys(namen).forEach(function(p){
        const kort = hudShortLabel(namen[p], max);
        el.textContent = kort;
        if (Math.round(el.scrollHeight / lh) > 2) teveel.push(p + ' "' + kort + '"');
      });
      el.textContent = oud;
      return { aantal: Object.keys(namen).length, teveel: teveel };
    })`;

    console.log('\n2. Elke naam past binnen de twee regels die de plaat geeft');
    const nu = await app.ev(`${meet}(${opzet.grens})`);
    toets('alle ' + nu.aantal + ' namen geladen', nu.aantal >= 100,
          'te weinig namen — pidlane-data.js komt niet binnen en dan meet dit niets');
    toets('geen enkele naam loopt over twee regels heen bij grens ' + opzet.grens,
          nu.teveel.length === 0, nu.teveel.slice(0, 4).join(', '));

    console.log('\n3. Tegenproef — ligt de grens op de rand of veel te laag?');
    const ruimer = await app.ev(`${meet}(${opzet.grens + 1})`);
    toets('bij één teken meer valt er wél iets buiten de twee regels',
          ruimer.teveel.length > 0,
          'ook bij ' + (opzet.grens + 1) + ' past alles nog — dan meet blok 2 niets en kan de grens omhoog');
    if (ruimer.teveel.length)
      console.log('      bij ' + (opzet.grens + 1) + ' vallen eruit: ' + ruimer.teveel.slice(0, 3).join(', '));

    console.log('\n4. En het geval uit het issue staat er als naam, niet als fragment');
    const paar = await app.ev(`(function(){
      const n = slimMeterLabels(${JSON.stringify(METERS)});
      return { abs: String(n['0143'] || ''), belast: String(n['0104'] || '') };
    })()`);
    toets('0143 heet niet meer "ABS. MOTO"', !/^ABS\.? MOTO$/i.test(paar.abs), 'kreeg: "' + paar.abs + '"');
    toets('0143 en 0104 dragen niet dezelfde naam',
          paar.abs.toUpperCase() !== paar.belast.toUpperCase(),
          'beide "' + paar.abs + '" — dan wijst de plaat twee meters aan zonder te zeggen welke');
    console.log('      0143 "' + paar.abs + '"   0104 "' + paar.belast + '"');
  } finally {
    if (app) await app.stop();
  }

  console.log(fouten === 0 ? '\nbproef-plaatnamen: alles goed' : '\nbproef-plaatnamen: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
