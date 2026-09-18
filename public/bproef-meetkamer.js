// ══════════════════════════════════════════════════════════════════
// bproef-meetkamer.js — staat de lus werkelijk in het testrunscherm? (#246)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// test-meetkamer.js toetst het oordeel: welke stand een tegel krijgt, waar de
// meting op de balk staat, hoe de issuebaan wordt afgeleid. Dat is de helft
// die fout kan gaan in de logica.
//
// De andere helft kan alleen in een echte app fout gaan, en die helft is niet
// kleiner:
//
//   * HANGT HET PANEEL ER ÜBERHAUPT IN? De meetkamer plakt zichzelf vóór
//     #testrunBody. Heet dat element ooit anders, dan verschijnt het paneel
//     nergens — en een scherm dat er niet is, meldt dat niet.
//   * OVERSCHRIJFT DE TESTRUN HET WEER? _teken() van de testrun zet
//     innerHTML op #testrunBody, elke geboekte regel opnieuw. Schrijven die
//     twee in hetzelfde element, dan knippert het paneel weg zodra er iets
//     gemeten wordt — precies op het moment dat je ernaar kijkt. Twee
//     functies in één element is in dit project al drie keer een bug geweest.
//   * LOOPT DE TIKKER MEE MET HET SCHERM? Een verversing die doorloopt op een
//     gesloten overlay kost accu tijdens het rijden en is nergens te zien.
//   * LEZEN DE MODULES ELKAAR ECHT? De meetkamer haalt zijn lijst issues uit
//     PLTestrunLive.proeven(). Dat is een uitlening over een IIFE-grens heen;
//     in node bestaat die grens niet en hier wel.
//
// Draaien vanuit public/:  node bproef-meetkamer.js
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
    console.log('\n1. De modules kennen elkaar na een echte boot');
    toets('PLMeetkamer bestaat', await app.ev(`!!window.PLMeetkamer`));
    toets('PLTestrunLive leent zijn proevenlijst uit',
      await app.ev(`typeof PLTestrunLive.proeven === 'function' && PLTestrunLive.proeven().length > 0`));
    toets('en die lijst draagt issue én naam',
      await app.ev(`PLTestrunLive.proeven().every(function(p){ return 'issue' in p && 'naam' in p; })`));
    toets('maar geen proeffuncties — het scherm toont ze, het draait ze niet',
      await app.ev(`PLTestrunLive.proeven().every(function(p){ return typeof p.proef !== 'function'; })`),
      'een scherm dat proeven kan starten, start ze een keer per seconde');
    toets('PLOpdracht.meet() draagt de getallen die de balk nodig heeft',
      await app.ev(`(function(){
        var u = PLOpdracht.meet({issue:'#x',naam:'y',pid:'0142',meet:'min',tussen:[11.5,15.2]});
        return ['staat','waarde','lo','hi','n','pid','maat'].every(function(k){ return k in u; });
      })()`));

    console.log('\n2. Het paneel hangt in het ECHTE testrunscherm');
    const p = JSON.parse(await app.ev(`(function(){
      window.isAdmin = function(){ return true; };
      openTestrun();
      var box = document.getElementById('meetkamerBox');
      var body = document.getElementById('testrunBody');
      var ov = document.getElementById('testrunOv');
      return JSON.stringify({
        er: !!box,
        inOverlay: !!(box && ov && ov.contains(box)),
        // Staat het paneel VÓÓR het log? Anders moet je langs 140 regels
        // scrollen om te zien waar de rit aan werkt.
        voorHetLog: !!(box && body && (box.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING)),
        eigenElement: !!(box && body && box !== body && !body.contains(box) && !box.contains(body)),
        tekst: box ? box.textContent.slice(0, 200) : ''
      });
    })()`));
    toets('het paneel bestaat', p.er, JSON.stringify(p));
    toets('en hangt in de testrunoverlay', p.inOverlay, JSON.stringify(p));
    toets('vóór het logboek', p.voorHetLog, JSON.stringify(p));
    toets('in een EIGEN element, los van #testrunBody', p.eigenElement, JSON.stringify(p));
    toets('met de vier stations erin',
      /Opdracht binnen/.test(p.tekst) && /De rit meet/.test(p.tekst), p.tekst);

    console.log('\n3. De testrun gooit het paneel niet weg als hij boekt');
    // DIT IS DE DUURSTE FOUT DIE DEZE PROEF KAN VANGEN. _teken() zet
    // innerHTML op #testrunBody bij ELKE geboekte regel. Zat het paneel in
    // datzelfde element, dan is het na één meting weg.
    const na = JSON.parse(await app.ev(`(function(){
      var voor = !!document.getElementById('meetkamerBox');
      // een echte boeking uitlokken langs de gewone weg
      PLTestrunLive.tik(5, 'proefregel uit bproef-meetkamer', 'ok', 'een regel om _teken() te laten lopen');
      if (typeof startTestrun === 'function') { /* niet starten: dat raakt de bus */ }
      var body = document.getElementById('testrunBody');
      if (body) body.innerHTML = '<div>het logboek is opnieuw getekend</div>';
      return JSON.stringify({
        voor: voor,
        na: !!document.getElementById('meetkamerBox'),
        nogSteedsGevuld: (document.getElementById('meetkamerBox') || {}).textContent ?
          document.getElementById('meetkamerBox').textContent.length > 20 : false
      });
    })()`));
    toets('het paneel stond er voor de boeking', na.voor, JSON.stringify(na));
    toets('en staat er na een hertekening van het logboek nog steeds', na.na, JSON.stringify(na));
    toets('met zijn inhoud intact', na.nogSteedsGevuld, JSON.stringify(na));

    console.log('\n4. De issuebaan komt uit de echte lijst van blok 5');
    const baan = JSON.parse(await app.ev(`(function(){
      var s = PLMeetkamer.momentopname();
      var b = PLMeetkamer.issuebaan(s);
      return JSON.stringify({
        aantal: b.length,
        issues: b.map(function(x){ return x.issue; }).slice(0, 12),
        // elk issue in de baan moet ook in de echte lijst staan: de baan mag
        // niets verzinnen dat blok 5 niet dekt
        allemaalEcht: b.every(function(x){
          return PLTestrunLive.proeven().some(function(p){ return p.issue === x.issue; })
              || (s.opdracht && s.opdracht.proeven.some(function(p){ return p.issue === x.issue; }));
        })
      });
    })()`));
    toets('de baan is niet leeg', baan.aantal > 0, JSON.stringify(baan));
    toets('en bevat alleen issues die echt in de lijst staan', baan.allemaalEcht, JSON.stringify(baan));
    toets('zonder de plaatshouder "—"', baan.issues.indexOf('—') === -1, JSON.stringify(baan.issues));

    console.log('\n5. Het paneel verschuift de opmaak van de app niet');
    // Dezelfde les als bij de previewbanner (#242): een paneel dat de app
    // opzij duwt, laat je de opmaak van het paneel meten in plaats van die
    // van de app.
    const maat = JSON.parse(await app.ev(`(function(){
      var ov = document.getElementById('testrunOv');
      var box = document.getElementById('meetkamerBox');
      var r = box.getBoundingClientRect();
      return JSON.stringify({
        bodyPadding: document.body.style.paddingTop || '',
        binnenBeeld: r.width > 100 && r.width <= window.innerWidth + 1,
        overlayScrollt: ov.scrollHeight >= ov.clientHeight,
        geenHorizontaal: document.documentElement.scrollWidth <= window.innerWidth + 1
      });
    })()`));
    toets('de body wordt niet opgeschoven', !maat.bodyPadding, maat.bodyPadding);
    toets('het paneel past in de breedte', maat.binnenBeeld, JSON.stringify(maat));
    toets('en er ontstaat geen horizontale schuifbalk', maat.geenHorizontaal, JSON.stringify(maat));

    console.log('\n6. De tikker loopt mee met het scherm en niet erbuiten');
    const tik = JSON.parse(await app.ev(`(function(){
      var open = PLMeetkamer.open();
      closeTestrun();
      var naSluiten = PLMeetkamer.open();
      openTestrun();
      var naOpenen = PLMeetkamer.open();
      return JSON.stringify({ open: open, naSluiten: naSluiten, naOpenen: naOpenen });
    })()`));
    toets('hij liep terwijl het scherm open stond', tik.open, JSON.stringify(tik));
    toets('hij stopt bij het sluiten', tik.naSluiten === false, JSON.stringify(tik));
    toets('en start weer bij het openen', tik.naOpenen, JSON.stringify(tik));

    console.log('\n7. Het paneel blijft staan als de bronnen ontbreken');
    // Een scherm dat zwart wordt omdat één optionele module mist, is een
    // scherm dat je niet meer opent — en dan is de lus weer onzichtbaar.
    const kaal = JSON.parse(await app.ev(`(function(){
      var bewaard = window.PLOpdracht;
      try {
        window.PLOpdracht = undefined;
        var ok = PLMeetkamer.teken();
        var box = document.getElementById('meetkamerBox');
        return JSON.stringify({ ok: ok, tekst: box ? box.textContent.slice(0, 160) : '' });
      } finally { window.PLOpdracht = bewaard; PLMeetkamer.teken(); }
    })()`));
    toets('het tekent zonder PLOpdracht', kaal.ok, JSON.stringify(kaal));
    toets('en zegt dat de module ontbreekt', /ontbreekt/.test(kaal.tekst), kaal.tekst);

    console.log('\n8. Er staat geen ruwe HTML uit Airtable in het scherm');
    // De naam en de reden komen uit een tabel die BUITEN de app bewerkt wordt.
    const stout = JSON.parse(await app.ev(`(function(){
      var h = PLMeetkamer.html({
        nu: Date.now(), toggleAan: true, uitslagen: [], log: [], proeven: [],
        opdracht: { naam: '<img src=x onerror=window.__stout=1>', reden: '<b>vet</b>',
                    sensoren: ['0142'], duurS: 60, tikS: 5, proeven: [] }
      });
      var d = document.createElement('div');
      d.innerHTML = h;
      return JSON.stringify({
        geenImg: d.querySelectorAll('img').length === 0,
        geenB: d.querySelectorAll('b').length === 0,
        nietUitgevoerd: !window.__stout,
        leesbaar: /vet/.test(d.textContent)
      });
    })()`));
    toets('een <img> uit de tabel wordt geen element', stout.geenImg, JSON.stringify(stout));
    toets('opmaak uit de tabel wordt geen opmaak', stout.geenB, JSON.stringify(stout));
    toets('en er is niets uitgevoerd', stout.nietUitgevoerd, JSON.stringify(stout));
    toets('de tekst blijft wel leesbaar', stout.leesbaar, JSON.stringify(stout));

    console.log('\n' + (fouten ? 'FOUT: ' + fouten + ' bevinding(en)' : 'goed: alles gemeten in de echte app'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error('bproef-meetkamer liep vast:', e); process.exit(1); });
