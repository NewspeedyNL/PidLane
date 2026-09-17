// ══════════════════════════════════════════════════════════════════
// bproef-onderdeel.js — "Welk onderdeel?" in de draaiende app
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT EN NIET IN NODE KAN
//
// test-onderdeel.js toetst de beslissingen van deze module op verzonnen
// data, en dat werkt: de scheiding tussen "nog niet aan de beurt" en
// "gevraagd en niets terug" is daar in elf gevallen vastgelegd. Maar één
// fout uit de ronde van 16-09 kón daar per definitie niet gevangen worden,
// en het was uitgerekend de grootste:
//
//   var l = (window._laatsteDTC || window.lastDTCs || []);
//
// Die twee variabelen bestaan niet. Élke controle op een foutcode stond
// daardoor sinds 27-07-2026 permanent op "onbekend" — de halve module deed
// niets, en van buiten was dat niet te zien, want een lege lijst leest als
// een gezonde auto. In node is dat niet te vangen: daar zet de test zijn
// eigen globals klaar en vindt de module altijd wat de test bedoelde.
//
// HIER staat de echte app met zijn echte laadvolgorde: `dtcCodes` is een
// `let` op scriptniveau in pidlane-auth.js en hangt dús niet aan window,
// en pidlane-onderdeel.js moet hem van daaruit kunnen zien. Dat is precies
// het soort koppeling waar een browserproef voor is.
//
// Daarnaast wordt hier het scherm zelf gemeten: er hoeft maar een kaart te
// worden getekend voor een sensor die niets mankeert, en er staat een
// verdenking op iemands telefoon.
//
// DE TEGENPROEF ZIT ERIN. Elke "er staat niets" wordt gevolgd door hetzelfde
// geval waarin er wél iets hoort te staan — een sensor die volgens het
// scheduler-register werkelijk gevraagd is en niets teruggaf. Zonder die
// tweede helft zou deze proef ook slagen op een module die nooit meer iets
// zegt, en dat is geen reparatie maar een afgeplakt lampje.
//
// Draaien vanuit public/:  node bproef-onderdeel.js
// ══════════════════════════════════════════════════════════════════
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

  try {
    console.log('\n1. De module hangt in de app en het paneel tekent zichzelf');
    await app.ev('startDemoCar(0); true');
    await new Promise(r => setTimeout(r, 2500));   // laat de demo een paar pollrondes doen

    toets('PLOnderdeel bestaat in de draaiende app',
      await app.ev('!!(window.PLOnderdeel && typeof PLOnderdeel.stilteBeeld === "function")'));

    await app.ev('openOnderdeelCheck(); true');
    await new Promise(r => setTimeout(r, 400));
    const paneel = await app.ev(`(function(){
      var b = document.getElementById('odBody');
      return { er: !!b, lengte: b ? b.innerHTML.length : 0,
               kaarten: b ? b.querySelectorAll('.od-kaart').length : -1,
               zichtbaar: (document.getElementById('onderdeelOv')||{style:{}}).style.display };
    })()`);
    toets('het paneel staat op het scherm', paneel.er && paneel.zichtbaar === 'flex');
    toets('en heeft inhoud', paneel.lengte > 200, 'innerHTML is ' + paneel.lengte + ' tekens');

    console.log('\n2. De foutcodes zijn bereikbaar vanuit deze module (de fout van 27-07)');
    // dtcCodes is een let op scriptniveau: niet via window te zetten, wél via
    // een gewone toewijzing in dezelfde globale scope. Precies zoals scanDTC()
    // het doet.
    await app.ev('dtcCodes = ["P0420"]; window._didDTCScan = true; true');
    const bron = await app.ev('JSON.stringify(PLOnderdeel.dtcBron())');
    const b = JSON.parse(bron);
    toets('dtcBron() vindt de echte foutcodelijst',
      b.gescand === true && b.codes.length === 1 && b.codes[0] === 'P0420',
      'gaf: ' + bron + ' — dit is de fout waardoor de halve module nooit gedraaid heeft');

    await app.ev('openOnderdeelCheck(); true');
    await new Promise(r => setTimeout(r, 300));
    const metCode = await app.ev(`document.getElementById('odBody').innerText`);
    toets('P0420 levert de katalysator als kandidaat op het scherm',
      /Katalysator/i.test(metCode), 'scherm zei: ' + metCode.slice(0, 200));

    // TEGENPROEF: zonder scan mag hetzelfde scherm die kandidaat NIET tonen,
    // en moet het zeggen dat de foutcodes nog niet gelezen zijn.
    await app.ev('dtcCodes = []; window._didDTCScan = false; openOnderdeelCheck(); true');
    await new Promise(r => setTimeout(r, 300));
    const zonder = await app.ev(`document.getElementById('odBody').innerText`);
    toets('TEGENPROEF: zonder scan geen katalysator en wél een uitleg waarom',
      !/Katalysator/i.test(zonder) && /nog niet uitgelezen/i.test(zonder),
      'scherm zei: ' + zonder.slice(0, 200));

    console.log('\n3. Het meettempo van de app is echt trager dan de oude drempel');
    const tempo = await app.ev(`(function(){
      var uit = {};
      ['010C','0105','012F','0121'].forEach(function(p){ uit[p] = PLSched.interval(p); });
      uit.regels = PLOnderdeel.cadansRegels();
      return uit;
    })()`);
    console.log('      toerental ' + tempo['010C'] + ' ms, koelwater ' + tempo['0105'] +
      ' ms, brandstofpeil ' + tempo['012F'] + ' ms, MIL-afstand ' + tempo['0121'] + ' ms');
    toets('brandstofpeil komt inderdaad trager langs dan de oude vaste 8 s',
      tempo['012F'] > 8000,
      'zonder dat verschil bewijst deze hele ronde niets — de melding kwam uit dit getal');
    toets('de drempelregels komen uit PLWatch (dezelfde bron als de waakronde)',
      tempo.regels.factor === 3 && tempo.regels.min === 8000,
      'gaf: ' + JSON.stringify(tempo.regels));

    console.log('\n4. Een sensor binnen zijn tempo is niet kapot; een echte uitvaller wel');
    // De demo levert continu data. Zet het brandstofpeil 30 s terug — ruim
    // boven de oude drempel van 8 s, ruim binnen zijn eigen 60 s.
    const binnen = await app.ev(`(function(){
      var nu = Date.now();
      activePIDs.add('012F'); supportedPIDs.add('012F');
      _pidLastUpd['012F'] = nu - 30000; _pidLastUpdPause['012F'] = PLBus.pausedTotal();
      _pidLastOk['012F'] = nu - 30000; _pidLastTry['012F'] = nu - 30000;
      var beeld = PLOnderdeel.stilteBeeld();
      return { register: beeld.register, stil: beeld.stil.map(function(s){ return s.pid; }),
               wacht: beeld.wacht, levend: beeld.levend.length };
    })()`);
    toets('30 s stil bij een tempo van 60 s is geen uitval',
      binnen.register === true && binnen.stil.indexOf('012F') < 0,
      'stil: ' + JSON.stringify(binnen.stil) + ' — dit is de melding uit de schermafdruk');

    // TEGENPROEF: nu wél gevraagd (poging vers, succes oud) en ruim over de
    // drempel heen. Dan hoort de kaart er te staan, mét deze sensor erop.
    const buiten = await app.ev(`(function(){
      var nu = Date.now();
      _pidLastUpd['012F'] = nu - 400000; _pidLastUpdPause['012F'] = PLBus.pausedTotal();
      _pidLastOk['012F'] = nu - 400000; _pidLastTry['012F'] = nu - 100;
      var beeld = PLOnderdeel.stilteBeeld();
      openOnderdeelCheck();
      return { stil: beeld.stil.map(function(s){ return s.pid; }),
               tekst: document.getElementById('odBody').innerText };
    })()`);
    toets('TEGENPROEF: gevraagd zonder antwoord is wél uitval',
      buiten.stil.indexOf('012F') >= 0, 'stil: ' + JSON.stringify(buiten.stil));

    // EN HIER LEERDE DEZE PROEF IETS DAT IN NODE NIET TE ZIEN IS. Het scherm
    // toonde die kaart niet, en dat was terecht: in demomodus loopt er geen
    // verkeer over de bus, dus PLBus.stats() meldt te weinig metingen en de
    // module weigert een uitspraak. Precies zoals bedoeld — maar het betekent
    // ook dat de RENDER-kant van die kaart in demo nooit gedraaid wordt, en
    // dus nooit getoetst zou worden. Daarom hieronder een gezonde busstatus
    // eronder gelegd en opnieuw getekend.
    toets('in demo zegt het paneel eerlijk dat het over uitval niets kan zeggen',
      /zeg ik nu niets/i.test(buiten.tekst),
      'scherm zei: ' + buiten.tekst.slice(0, 200));

    const getekend = await app.ev(`(function(){
      var echt = PLBus.stats;
      PLBus.stats = function(){ return { foutPct:0, onvolPct:0, totaal:500 }; };
      try { openOnderdeelCheck(); return document.getElementById('odBody').innerText; }
      finally { PLBus.stats = echt; }
    })()`);
    toets('... en met een gezonde bus eronder staat de kaart er wél, met de sensor erop',
      /levert niets meer/i.test(getekend) && /Brandstof/i.test(getekend),
      'scherm zei: ' + getekend.slice(0, 300));

    console.log('\n5. Een teller van de ECU komt er niet in, hoe stil hij ook is');
    const teller = await app.ev(`(function(){
      var nu = Date.now();
      activePIDs.add('0121'); supportedPIDs.add('0121');
      _pidLastUpd['0121'] = nu - 400000; _pidLastUpdPause['0121'] = PLBus.pausedTotal();
      _pidLastOk['0121'] = nu - 400000; _pidLastTry['0121'] = nu - 100;
      var beeld = PLOnderdeel.stilteBeeld();
      return { stil: beeld.stil.map(function(s){ return s.pid; }), tellers: beeld.tellers };
    })()`);
    toets('0121 wordt overgeslagen en niet als onderdeel aangewezen',
      teller.stil.indexOf('0121') < 0 && teller.tellers.indexOf('0121') >= 0,
      'stil: ' + JSON.stringify(teller.stil) + ' / tellers: ' + JSON.stringify(teller.tellers));

    console.log('\n6. Een kerngezonde auto levert geen losse hint als verdachte op');
    // Gemeten in deze proef op 16-09: op de demo-auto (die niets mankeert)
    // stond "EGR-klep — zwakke aanwijzing" op het scherm, gedragen door één
    // voorwaarde van gewicht 2. Dat is geen verdachte maar een vermoeden.
    const gezond = await app.ev(`(function(){
      dtcCodes = []; window._didDTCScan = true;
      return PLOnderdeel.beoordeel().map(function(r){
        return { id:r.id, deel:Math.round(r.deel*100), voor:r.voor.length,
                 zwaarste:r.voor.join(' | ') };
      });
    })()`);
    const losse = gezond.filter(function (r) { return r.voor < 2; });
    console.log('      kandidaten op de demo-auto: ' +
      (gezond.length ? gezond.map(function (r) { return r.id + ' (' + r.deel + '%)'; }).join(', ') : 'geen'));
    toets('geen kandidaat die op één losse hint rust',
      losse.every(function (r) { return r.deel >= 50; }),
      'te dun: ' + JSON.stringify(losse));

    console.log('\n7. Het paneel tekent zichzelf zonder fouten in de console');
    const jsFouten = app.fouten.filter(function (f) {
      return /onderdeel|PLOnderdeel|odBody/i.test(String(f && (f.tekst || f.message || f)));
    });
    toets('geen scriptfouten uit deze module', jsFouten.length === 0,
      JSON.stringify(jsFouten.slice(0, 3)));

  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? fouten + ' proef(en) gefaald' : 'alle proeven geslaagd') + '\n');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-onderdeel: ' + (e && e.stack || e)); process.exit(1); });
