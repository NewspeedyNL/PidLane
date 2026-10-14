// ══════════════════════════════════════════════════════════════════
// bproef-rijmodus.js — PLRijmodus in de ECHTE app (node bproef-rijmodus.js)
// test-rijmodus.js toetst de functies los; dit toetst wat alleen een echte
// boot laat zien: de schakelaar in Meer, dat de rest van de app écht weg is
// als de rijmodus aan staat, en dat het caravanpaneel de echte coach volgt.
// PL_AFDRUK=<map> schrijft schermafdrukken in een half scherm (412x430),
// om de weergave met eigen ogen te zien. Geen toets: dat doet ev().
// Tegenproef: zet in pidlane.css de regel die de rest verbergt uit
// (body[data-modus="rij"] > *:not(#rijModus)...) — dan wordt toets 2 rood.
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
  const afdruk = process.env.PL_AFDRUK;

  try {
    console.log('\n1. De module en de schakelaar');
    toets('PLRijmodus bestaat na een echte boot', await app.ev(`!!window.PLRijmodus`));
    toets('standaard uit, en de body zegt dat', await app.ev(`PLRijmodus.stand()==='uit' && document.body.getAttribute('data-modus')==='normaal'`));
    toets('de schakelaar staat in Mijn voorkeuren, met aria-checked=false',
      await app.ev(`(function(){ var b=document.getElementById('kbRijmodus'); return !!b && !!b.closest('#vkToestel') && b.getAttribute('aria-checked')==='false'; })()`));
    await app.venster(412, 430);
    toets('een half scherm zet hem niet vanzelf aan', await app.ev(`(PLRijmodus.meet(), document.body.getAttribute('data-modus')==='normaal')`));

    console.log('\n2. Aan: alleen de rijweergave staat in beeld');
    await app.ev(`document.getElementById('kbRijmodus').click()`);
    toets('een tik zet hem aan, en de schakelaar volgt', await app.ev(`PLRijmodus.stand()==='aan' && document.getElementById('kbRijmodus').getAttribute('aria-checked')==='true'`));
    toets('#rijModus is zichtbaar', await app.ev(`getComputedStyle(document.getElementById('rijModus')).display !== 'none'`));
    const zichtbaar = await app.ev(`Array.from(document.body.children).filter(function(e){ return e.id!=='rijModus' && e.tagName!=='SCRIPT' && e.tagName!=='STYLE' && getComputedStyle(e).display!=='none'; }).map(function(e){ return e.id||e.className||e.tagName; }).join(',')`);
    toets('de rest van de app is weg', !zichtbaar, 'nog zichtbaar: ' + zichtbaar);
    toets('compacte indeling in een half scherm', await app.ev(`document.body.getAttribute('data-rijvorm')==='compact'`));
    toets('zonder monitor: het paneel zegt dat', await app.ev(`document.getElementById('rijPaneel').getAttribute('data-paneel')==='geen'`));
    toets('de strook neemt hooguit een kwart van de hoogte',
      await app.ev(`document.querySelector('#rijModus .rij-strook').getBoundingClientRect().height <= window.innerHeight/4`),
      (await app.ev(`Math.round(document.querySelector('#rijModus .rij-strook').getBoundingClientRect().height)`)) + ' px van ' + (await app.ev('window.innerHeight')));
    if (afdruk) await app.schermafdruk(path.join(afdruk, 'rijmodus-geen.png'));

    console.log('\n3. Caravan: het advies volgt de echte coach');
    await app.ev(`(function(){
      caravanActive = true;
      caravanCoach.push({ t: Date.now(), msg: '⬇️ Schakel terug — de motor zwoegt (belasting 92%, 1600 tpm).', level: 'tip', key: 'terug' });
      updPID('0105', 96); updPID('010C', 1600); updPID('0142', 14.1);
      caravanRenderLive({ speed: 98, rpm: 1600, load: 92, climb: 'klim', fuelType: 'benzine', fuelRate: 4.2, lkm: 19.5,
        cruiseTarget: 95, limit: 100, terreinBron: 'helling', helling: 3.4, trend: 0 }, { val: 92, unit: '%' });
      return true; })()`);
    await new Promise(r => setTimeout(r, 300));
    toets('paneel "caravan"', await app.ev(`document.getElementById('rijPaneel').getAttribute('data-paneel')==='caravan'`));
    toets('het radertje zegt terug', await app.ev(`document.getElementById('rijRad').getAttribute('data-advies')==='terug'`));
    toets('de boog staat boven het doel: oranje', await app.ev(`document.getElementById('rijMeter').getAttribute('data-k')==='letop'`));
    toets('het radertje is groter dan de strook',
      await app.ev(`document.querySelector('#rijRad svg').getBoundingClientRect().height > document.querySelector('#rijModus .rij-mini').getBoundingClientRect().height`));
    if (afdruk) await app.schermafdruk(path.join(afdruk, 'rijmodus-caravan.png'));

    console.log('\n4. Rit-monitor: een stip per test');
    await app.ev(`(function(){ caravanActive = false; PLMon.active = true;
      var d = PLWatch._dekking; PLWatch.tests.forEach(function(t, i){ if (i % 3 === 0) d[t.id] = { runs: 2, hits: i === 3 ? 1 : 0 }; });
      PLRijmodus.ververs(); return true; })()`);
    toets('paneel "rit"', await app.ev(`document.getElementById('rijPaneel').getAttribute('data-paneel')==='rit'`));
    toets('evenveel stippen als PLWatch tests heeft',
      await app.ev(`document.querySelectorAll('#rijStippen i').length === PLWatch.tests.length && PLWatch.tests.length > 0`));
    if (afdruk) await app.schermafdruk(path.join(afdruk, 'rijmodus-rit.png'));
    await app.ev(`(function(){ PLMon.active = false; PLWatch._dekking = {}; return true; })()`);

    console.log('\n5. Uit: de app is terug');
    await app.ev(`PLRijmodus.zetStand('uit')`);
    toets('#rijModus is weg en de app is terug',
      await app.ev(`getComputedStyle(document.getElementById('rijModus')).display==='none' && document.body.getAttribute('data-modus')==='normaal'`));
  } finally {
    await app.stop();
  }
  console.log(fouten ? '\n' + fouten + ' FOUT(en)' : '\nalles goed');
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
