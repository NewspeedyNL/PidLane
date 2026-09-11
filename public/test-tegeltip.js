// test-tegeltip.js — komt de dubbeltik-tip op het juiste moment? (#145)
//
// De tip hing aan renderGauges(), en die draait al tijdens het opstarten. De
// tip kwam dus op het keuzescherm voorbij, waar geen enkele tegel staat, en
// juist NIET op het moment dat je de tegels voor het eerst voor je hebt.
// "Eén keer per toestel" betekende daarmee: één keer op het verkeerde moment,
// en daarna nooit meer — het slot in localStorage staat dan al dicht.
//
// WAAROM DIT DE BRON LEEST EN GEEN GEDRAG MEET. Twee van de drie vragen
// hieronder zijn statische feiten: staat de aanroep op de goede plek, en
// zoekt hij naar de class die de tegels ook echt dragen. Dat laatste is hier
// de duurste: bij het bouwen stond er #gauges/.gauge, en die bestaan geen van
// beide — de tip zou stil nooit meer verschijnen, zonder foutmelding en
// zonder dat een gedragstoets op een leeg scherm er iets van merkt.
//
// Draaien vanuit public/:  node test-tegeltip.js
'use strict';
const fs = require('fs');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}

const pids = fs.readFileSync(__dirname + '/pidlane-pids.js', 'utf8');
const ui   = fs.readFileSync(__dirname + '/pidlane-uihelpers.js', 'utf8');

console.log('\n— de tip hangt aan de Live view, niet aan het tekenen —');
toets('sw() roept de tip aan als het middenscherm de Live-tab wordt',
      /name\s*===\s*'live'\s*\)\s*\{[^}]*_tegelTipEenmalig\(\)/.test(ui),
      'zonder deze haak komt de tip nooit meer, want het tekenen roept hem niet meer aan');
toets('en het tekenen van de tegels doet dat niet meer',
      !/if\s*\(\s*getoond\s*\)\s*_tegelTipEenmalig\(\)/.test(pids),
      'renderGauges() draait al bij het opstarten — dan is de tip weer op het keuzescherm op');

console.log('\n— hij zoekt naar de tegels die er werkelijk zijn —');
// De tegelbouwer in renderGauges schrijft de container en de class op. Als een
// van die twee verandert, moet de tip meeveranderen; deze toets leest ze uit
// dezelfde bron in plaats van ze over te schrijven.
const container = (pids.match(/getElementById\('(g[A-Za-z]+)'\);\s*\1\.innerHTML\s*=\s*''/) || [])[1]
               || (pids.match(/const g\s*=\s*document\.getElementById\('([^']+)'\);\s*g\.innerHTML='';/) || [])[1];
toets('de tegelcontainer is uit de bron af te lezen', !!container,
      'anker versleten: renderGauges() haalt zijn container anders op');
const tegelClass = (pids.match(/c\.className\s*=\s*'(gc)'/) || [])[1];
toets('en de class van een tegel ook', !!tegelClass, 'anker versleten: een tegel heet niet meer .gc');

/* ALLEEN BINNEN DE FUNCTIE KIJKEN. De eerste versie zocht deze twee in het
   hele bestand, en dat is precies één mutatie te laat betrapt: de tegelbouwer
   noemt `gGrid` zélf ook, dus de container van de típ op iets anders zetten
   liet deze test vrolijk groen. plmutate.sh meldde hem als ONTSNAPT, en dat
   is waar dat script voor bestaat. */
const tipVan = pids.indexOf('function _tegelTipEenmalig()');
const tipTot = tipVan < 0 ? -1 : pids.indexOf('\n}', pids.indexOf('setTimeout(function', tipVan));
const tipBody = (tipVan >= 0 && tipTot > tipVan) ? pids.slice(tipVan, tipTot) : '';
toets('de body van _tegelTipEenmalig() is af te bakenen', !!tipBody,
      'anker versleten — zonder afbakening kijkt deze test weer in het hele bestand');

if (container && tegelClass && tipBody) {
  toets('de tip kijkt in diezelfde container (' + container + ')',
        new RegExp("getElementById\\('" + container + "'\\)").test(tipBody),
        'de tip zoekt in een container die niet bestaat en verschijnt dan stil nooit meer');
  toets('en naar diezelfde class (.' + tegelClass + ')',
        new RegExp("querySelectorAll\\('\\." + tegelClass + "'\\)").test(tipBody),
        'de tip telt tegels die niet bestaan — hij vuurt dan nooit, zonder foutmelding');
}

console.log('\n— en hij blijft eenmalig —');
toets('de voorkeur wordt opgeslagen voordat de tip getoond wordt',
      /localStorage\.setItem\(TEGELTIP_SLEUTEL,\s*'1'\)[\s\S]{0,400}showToast/.test(pids),
      'andersom kan hij bij een tweede bezoek opnieuw komen');
toets('en de sleutel is er nog', /TEGELTIP_SLEUTEL\s*=\s*'pl_tip_dubbeltik'/.test(pids),
      'een andere sleutel laat de tip terugkomen bij iedereen die hem al had');

console.log('\n' + n + ' toetsen, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
