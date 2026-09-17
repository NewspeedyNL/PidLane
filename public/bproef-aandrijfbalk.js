// ══════════════════════════════════════════════════════════════════
// bproef-aandrijfbalk.js — de aandrijfbalk in de DRAAIENDE app
// ──────────────────────────────────────────────────────────────────
// test-aandrijving.js toetst de toestandsmachine los, met `vm`. Wat daar niet
// te zien is, is de KOPPELING: hangt het element in index.html, laadt
// pidlane-aandrijfbalk.js ná pidlane-aandrijving.js, en komt de uitkomst
// werkelijk in de DOM terecht. Precies het soort vraag dat vóór plbrowser.sh
// in `CAMPAGNE` belandde en daar maanden bleef liggen.
//
// DE TEGENPROEF ZIT ERIN. Een balk die iets toont bewijst niets — hij moet
// iets ANDERS tonen als de voorgeschiedenis verandert. Daarom staat dezelfde
// momentopname er twee keer in: één keer na gereden te hebben, één keer na een
// reset. Verschilt de balktekst dan niet, dan is deze proef rood.
//
// Draaien:  node bproef-aandrijfbalk.js      (vanuit public/)
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
    toets('de app start zonder JS-fouten', app.fouten.length === 0,
      app.fouten.slice(0, 3).join(' | '));

    // ── 1. HANGT ALLES EROP ──────────────────────────────────────
    const mist = await app.ev(`['PLAandrijving','PLAandrijfbalk']
      .filter(n => typeof window[n] === 'undefined')`);
    toets('beide modules leven in de app', mist.length === 0, 'ontbreekt: ' + mist.join(', '));

    const heeftEl = await app.ev(`!!document.getElementById('aandrijfBalk')`);
    toets('het element staat in index.html', heeftEl === true);

    const volgorde = await app.ev(`(function(){
      var t = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
      return JSON.stringify({ a: t.indexOf('pidlane-aandrijving.js'),
                              b: t.indexOf('pidlane-aandrijfbalk.js'),
                              bed: t.indexOf('pidlane-bedrading.js') });
    })()`);
    const v = JSON.parse(volgorde);
    toets('de toestandsmachine laadt vóór zijn scherm', v.a >= 0 && v.b > v.a,
      'aandrijving op ' + v.a + ', balk op ' + v.b);
    toets('en beide vóór de bedradingscontrole', v.bed > v.b, 'bedrading op ' + v.bed);

    // ── 2. DE ECHTE KETEN: pidVals → tik() → DOM ─────────────────
    // Geen nagebouwde uitkomst: de module rekent, de balk rendert, en we lezen
    // terug wat er werkelijk in het element staat.
    const naRijden = await app.ev(`(function(){
      PLAandrijving.reset();
      var t = 1000, r = null;
      // eerst rijden, dan stilstaan met een stille motor
      for (var i = 0; i < 8; i++){ pidVals['010C'] = 1900; pidVals['010D'] = 60;
        r = PLAandrijving.tik(pidVals, { t: t += 250, ouderdomMs: 0 }); }
      for (var j = 0; j < 8; j++){ pidVals['010C'] = 0; pidVals['010D'] = 0;
        r = PLAandrijving.tik(pidVals, { t: t += 250, ouderdomMs: 0 }); }
      PLAandrijfbalk.ververs(r);
      var el = document.getElementById('aandrijfBalk');
      return JSON.stringify({ toestand: r.toestand, tekst: el.textContent,
        zicht: el.style.display, attr: el.getAttribute('data-toestand'),
        titel: el.title });
    })()`);
    const a = JSON.parse(naRijden);
    toets('na rijden en stilstaan staat de toestand op STARTSTOP', a.toestand === 'STARTSTOP', a.toestand);
    toets('en die tekst staat werkelijk in de DOM', /Start\/stop actief/.test(a.tekst), 'kreeg: ' + a.tekst);
    toets('de balk is zichtbaar', a.zicht !== 'none', 'display: ' + a.zicht);
    toets('de onderbouwing hangt in de tooltip', /toerental/.test(a.titel), 'titel: ' + a.titel);

    // ── 3. DE TEGENPROEF ─────────────────────────────────────────
    // Exact dezelfde pidVals, alleen zonder voorgeschiedenis. Leest de balk nu
    // hetzelfde, dan doet het geheugen niets en is deze hele balk versiering.
    const koud = await app.ev(`(function(){
      PLAandrijving.reset();
      var t = 50000, r = null;
      for (var i = 0; i < 8; i++){ pidVals['010C'] = 0; pidVals['010D'] = 0;
        r = PLAandrijving.tik(pidVals, { t: t += 250, ouderdomMs: 0 }); }
      PLAandrijfbalk.ververs(r);
      var el = document.getElementById('aandrijfBalk');
      return JSON.stringify({ toestand: r.toestand, tekst: el.textContent });
    })()`);
    const k = JSON.parse(koud);
    toets('TEGENPROEF: dezelfde meting zonder geschiedenis is "Motor uit"',
      k.toestand === 'UIT_VOOR_START', k.toestand);
    toets('TEGENPROEF: en de balk leest dus anders', k.tekst !== a.tekst,
      'beide: ' + k.tekst);

    // ── 4. RIJDEN OP DE ACCU EN DE PAUZEERREM ────────────────────
    const accu = await app.ev(`(function(){
      PLAandrijving.reset();
      var t = 80000, r = null;
      for (var i = 0; i < 8; i++){ pidVals['010C'] = 0; pidVals['010D'] = 45;
        r = PLAandrijving.tik(pidVals, { t: t += 250, ouderdomMs: 0 }); }
      var kortNa = PLAandrijving.evPauzeGerust(r, r.sinds + 500);
      var langNa = PLAandrijving.evPauzeGerust(r, r.sinds + 9000);
      PLAandrijfbalk.ververs(r);
      return JSON.stringify({ toestand: r.toestand, hybride: r.bewijstHybride,
        kortNa: kortNa, langNa: langNa,
        tekst: document.getElementById('aandrijfBalk').textContent });
    })()`);
    const ac = JSON.parse(accu);
    toets('rijden met stille motor = rijden op accu', ac.toestand === 'ACCU_RIJDT', ac.toestand);
    toets('en dat bewijst dat deze auto hybride is', ac.hybride === true);
    toets('de pollronde krimpt NIET na een halve seconde', ac.kortNa === false);
    toets('maar wel als het aanhoudt', ac.langNa === true);

    // ── 5. ZONDER MEETWAARDEN GEEN BALK ──────────────────────────
    const leeg = await app.ev(`(function(){
      PLAandrijfbalk.ververs(null);
      var el = document.getElementById('aandrijfBalk');
      return JSON.stringify({ zicht: el.style.display, tekst: el.textContent });
    })()`);
    const l = JSON.parse(leeg);
    toets('zonder uitkomst verdwijnt de balk', l.zicht === 'none' && l.tekst === '',
      'display ' + l.zicht + ', tekst "' + l.tekst + '"');

    toets('en er zijn onderweg geen JS-fouten bijgekomen', app.fouten.length === 0,
      app.fouten.slice(0, 3).join(' | '));
  } finally {
    if (app && app.stop) await app.stop();
  }

  console.log('\n' + (fouten ? 'FOUT: ' : 'goed: ') + fouten + ' fout\n');
  process.exit(fouten ? 1 : 0);
})();
