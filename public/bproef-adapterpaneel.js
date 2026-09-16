// ══════════════════════════════════════════════════════════════════
// bproef-adapterpaneel.js — het verbindingspaneel in de DRAAIENDE app
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// test-adapterpaneel.js toetst het oordeel en de regeling: het advies, de
// handmatige multiplier, de echo-krimp. Dat is de rekenkant, en die draait
// prima in een sandbox.
//
// Wat daar per definitie niet te zien is, is de KOPPELING. Dit paneel hangt
// aan vier andere modules tegelijk — PLBus voor de cijfers, PLLoad voor het
// tempo, _btLog voor de foutregels, obdChipTap() voor de ingang — en elk van
// die vier is een naam die in een sandbox gewoon te zetten valt. §11 heeft
// daar een dure bevinding over: een proef die window.connected zette terwijl
// de app een lexicale binding leest, en dus een meting deed die nergens over
// ging (#186).
//
// Deze proef doet het andersom: hij start index.html in Chromium, tikt op de
// chip zoals een mens dat doet, en kijkt wat er op het scherm komt.
//
// WAT ER GEMETEN WORDT
//   1. de app start schoon op mét de nieuwe module erin
//   2. een tik op de OBD-chip opent het paneel (en niet de oude confirm())
//   3. de cijfers op het scherm komen uit PLBus, niet uit een kopie
//   4. de knop "Handmatig" verzet het tempo écht — via een DOM-klik
//   5. de grafiek verschijnt zodra er twee monsters zijn, en niet eerder
//   6. de echowaarschuwing verschijnt alleen als er echt een echo was
//
// Draaien:  node bproef-adapterpaneel.js      (vanuit public/)
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
    app = await startApp({ root: path.join(__dirname) });
  } catch (e) {
    if (e.message === 'GEEN_CHROMIUM') {
      // Ontbrekende voorwaarden zijn LET OP en geen FOUT — zie CLAUDE.md.
      console.log('  LET OP  overgeslagen: ' + e.uitleg.split('\n')[0]);
      process.exit(0);
    }
    throw e;
  }

  try {
    console.log('\n── 1. de app start met de nieuwe module ──');
    toets('geen JS-fouten tijdens de boot', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));
    toets('geen dialoogvensters tijdens de boot', app.dialogen.length === 0, app.dialogen.join(' | '));
    const weg = await app.ev(`['PLAdapter','PLBus','PLLoad'].filter(n => typeof window[n]==='undefined')`);
    toets('PLAdapter, PLBus en PLLoad staan er', weg.length === 0, 'ontbreekt: ' + weg.join(', '));
    toets('PLAdapter geeft zijn versie', /^\d+\.\d+ \(/.test(await app.ev('PLAdapter.versie')),
          await app.ev('PLAdapter.versie'));

    console.log('\n── 2. de tik op de chip opent het paneel ──');
    // De verbinding aanzetten zoals de app hem leest: een BARE binding, niet
    // window.connected. Dat is de fout uit #186, en die maken we hier niet.
    await app.ev(`connected = true; demoMode = false; 'ok'`);
    // obdChipTap() is de echte ingang. Hij mag géén confirm() meer opleveren:
    // dat was de oude route, en een dialoog zou de proef hier laten hangen.
    await app.ev(`obdChipTap(); 'ok'`);
    const open = await app.ev(`(function(){
      const ov=document.getElementById('plAdapterOv');
      return ov ? getComputedStyle(ov).display : 'bestaat niet';
    })()`);
    toets('een tik op de OBD-chip opent het paneel', open === 'flex', 'display is "' + open + '"');
    toets('en er kwam geen dialoogvenster tussen', app.dialogen.length === 0, app.dialogen.join(' | '));

    console.log('\n── 3. de cijfers komen uit PLBus ──');
    // Eén herkenbaar getal door PLBus heen duwen en het op het scherm
    // terugzoeken. Staat het er niet, dan tekent het paneel uit een eigen
    // kopie — en dan loopt die kopie vroeg of laat uit de pas.
    await app.ev(`
      PLBus.stats = function(){ return { totaal:10, ok:10, bad:0, gemMs:137, venGemMs:137,
        perSec:2.7, foutPct:0, belasting:41, batchGroep:3, reqTot:100, reqOnvol:0,
        onvolPct:0, echoTot:0, echoSinds:0, echoPct:0, perPid:{} }; };
      PLAdapter.teken(); 'ok'`);
    const tekst = await app.ev(`document.getElementById('plAdapterBody').textContent`);
    toets('de responstijd uit PLBus staat op het scherm', tekst.indexOf('137') >= 0);
    toets('de bezetting uit PLBus staat op het scherm', tekst.indexOf('41%') >= 0);
    toets('de verzoeken per seconde staan op het scherm', tekst.indexOf('2.7') >= 0);
    toets('geen echowaarschuwing zonder echo', tekst.indexOf('herhaalt frames') < 0);

    console.log('\n── 4. de knop Handmatig verzet het tempo echt ──');
    const voor = await app.ev(`pidPollInterval('010C')`);
    // Via de DOM, niet via de API: een knop die niet aan zijn functie hangt is
    // precies wat blok 5 een "dode knop" noemt.
    const geklikt = await app.ev(`(function(){
      const knoppen=[...document.getElementById('plAdapterBody').querySelectorAll('button')];
      const k=knoppen.find(b=>/Handmatig/.test(b.textContent));
      if(!k) return 'knop niet gevonden';
      k.click(); return 'geklikt';
    })()`);
    toets('er staat een knop "Handmatig"', geklikt === 'geklikt', geklikt);
    toets('en de stand staat daarna op handmatig', await app.ev('PLLoad.isHandmatig()') === true);

    const halveerd = await app.ev(`(function(){
      const knoppen=[...document.getElementById('plAdapterBody').querySelectorAll('button')];
      const k=knoppen.find(b=>b.textContent.trim()==='50%');
      if(!k) return 'geen 50%-knop';
      k.click(); return pidPollInterval('010C');
    })()`);
    toets('er staat een 50%-knop in de handmatige stand', typeof halveerd === 'number', String(halveerd));
    toets('en die verdubbelt het pollinterval van 010C',
          typeof halveerd === 'number' && halveerd > voor * 1.5, voor + ' ms → ' + halveerd + ' ms');

    const geboekt = await app.ev(`PLLoad.acties().slice(-2).map(a=>a.wat+':'+a.reden).join(' | ')`);
    toets('de standwissel staat in het actielogboek met een reden',
          /adapterpaneel|met de hand/.test(geboekt), geboekt);
    const opScherm = await app.ev(`document.getElementById('plAdapterBody').textContent`);
    toets('en het logboek staat op het scherm', opScherm.indexOf('WAT DE AUTOMAAT DEED') >= 0);

    // Terug naar de automaat, zodat de rest van de proef niet op een
    // handmatige stand meet.
    await app.ev(`PLAdapter.zetModus(false); 'ok'`);
    toets('terug naar de automaat', await app.ev('PLLoad.isHandmatig()') === false);

    console.log('\n── 5. de grafiek wacht op monsters ──');
    await app.ev(`PLAdapter.reset(); PLAdapter.teken(); 'ok'`);
    const leeg = await app.ev(`document.getElementById('plAdapterBody').textContent`);
    toets('met nul monsters staat er dat er te weinig zijn', leeg.indexOf('te weinig monsters') >= 0);
    toets('en er staat geen lijn getekend',
          await app.ev(`document.querySelectorAll('#plAdapterBody polyline').length`) === 0);

    await app.ev(`PLBus.stats = function(){ return { totaal:10, ok:10, bad:0, gemMs:137, venGemMs:137,
        perSec:2.7, foutPct:0, belasting:41, batchGroep:3, reqTot:100, reqOnvol:0,
        onvolPct:0, echoTot:0, echoSinds:0, echoPct:0, perPid:{} }; };
      PLAdapter.monster(); PLAdapter.monster(); PLAdapter.monster(); PLAdapter.teken(); 'ok'`);
    const lijnen = await app.ev(`document.querySelectorAll('#plAdapterBody polyline').length`);
    toets('met drie monsters staan er twee lijnen', lijnen === 2, lijnen + ' polylines');
    // Twee losse grafieken en niet één met twee assen: verzoeken per seconde
    // en milliseconden zijn twee maten van verschillende schaal, en die in één
    // beeld persen suggereert een verband dat er niet hoeft te zijn.
    const svgs = await app.ev(`document.querySelectorAll('#plAdapterBody svg').length`);
    toets('elk in zijn eigen grafiek', svgs === 2, svgs + ' svg-elementen');
    const labels = await app.ev(`[...document.querySelectorAll('#plAdapterBody svg')].map(s=>s.getAttribute('aria-label')||'').join(' | ')`);
    toets('allebei met een leesbare omschrijving voor wie de lijn niet ziet',
          /Verzoeken per seconde/.test(labels) && /Responstijd/.test(labels), labels);

    console.log('\n── 6. de echowaarschuwing volgt de meting ──');
    await app.ev(`PLBus.stats = function(){ return { totaal:10, ok:10, bad:0, gemMs:137, venGemMs:137,
        perSec:2.7, foutPct:0, belasting:41, batchGroep:3, reqTot:100, reqOnvol:35,
        onvolPct:35, echoTot:12, echoSinds:Date.now(), echoPct:12, perPid:{} }; };
      PLAdapter.teken(); 'ok'`);
    const metEcho = await app.ev(`document.getElementById('plAdapterBody').textContent`);
    toets('met echo staat de waarschuwing er wél', metEcho.indexOf('herhaalt frames') >= 0);
    toets('met het aantal erbij', metEcho.indexOf('12 keer') >= 0);
    toets('en het percentage onvolledige antwoorden', metEcho.indexOf('35%') >= 0);

    console.log('\n── 7. sluiten laat niets achter ──');
    await app.ev(`PLAdapter.sluit(); 'ok'`);
    toets('het paneel is dicht',
          await app.ev(`getComputedStyle(document.getElementById('plAdapterOv')).display`) === 'none');
    toets('de app draait nog steeds zonder fouten', app.fouten.length === 0, app.fouten.slice(0, 3).join(' | '));

  } finally {
    await app.stop();
  }

  console.log('\n─────────────────────────────────────────');
  if (fouten) { console.log('bproef-adapterpaneel: ' + fouten + ' FOUT\n'); process.exit(1); }
  console.log('bproef-adapterpaneel: goed\n');
  process.exit(0);
})().catch(e => { console.error('bproef-adapterpaneel brak af: ' + e.message); process.exit(1); });
