// ════════════════════════════════════════════════════════════════
// bproef-intro.js — de opstart-intro in de echte app
// ────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
// test-intro.js toetst het besluit en de timers in node. Wat daar niet kan:
// of de CSS-tijdlijn echt afspeelt (een verschreven keyframe-naam laat het
// logo gewoon onzichtbaar, zonder fout), en of het vlak na afloop werkelijk
// niets meer afdekt. Dat laatste is de fout die de app onbruikbaar maakt:
// het donkere vlak staat al in de HTML vóór elk script.
//
// Onder automatisering slaat de intro zichzelf over (navigator.webdriver),
// zodat de andere browserproeven de app meten en niet de intro. Hier wordt
// hij daarom na de boot gericht gestart met PLIntro.start({forceer:true}).
//
// Draaien vanuit public/:  node bproef-intro.js
// ════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const wacht = ms => new Promise(r => setTimeout(r, ms));

// Wat er ligt op het midden van het gebruikersnaamveld: het veld zelf, of
// iets van de intro.
const WAT_LIGT_ER = `(function(){
  var v = document.getElementById('loginUser');
  var r = v.getBoundingClientRect();
  var e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  if (!e) return 'niets';
  if (e.closest('#plIntro')) return 'intro';
  return e.id || e.tagName;
})()`;

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
    console.log('\n1. Na de boot dekt de intro niets af');
    toets('PLIntro is geladen', await app.ev(`typeof PLIntro === 'object' && typeof PLIntro.start === 'function'`));
    toets('overgeslagen onder automatisering — het vlak is verborgen',
      await app.ev(`document.getElementById('plIntro').hidden === true`));
    const eerst = await app.ev(WAT_LIGT_ER);
    toets('het gebruikersnaamveld is aan te tikken', eerst === 'loginUser', 'op die plek ligt: ' + eerst);

    console.log('\n2. Gericht gestart: hij speelt, en ligt over het inlogscherm');
    toets('start({forceer:true}) speelt', (await app.ev(`PLIntro.start({forceer:true})`)) === '');
    const tijdens = await app.ev(WAT_LIGT_ER);
    toets('tijdens het spelen ligt de intro erover', tijdens === 'intro', 'op die plek ligt: ' + tijdens);
    await wacht(1700);
    // Halverwege moet het logo in beeld staan. Een verschreven keyframe-naam
    // geeft géén fout: het logo blijft dan op zijn begin-opaciteit 0 staan.
    const logo = await app.ev(`parseFloat(getComputedStyle(document.querySelector('#plIntro .pli-logo')).opacity)`);
    toets('op 1,7 s staat het logo in beeld', logo > 0.9, 'opaciteit ' + logo);
    const naam = await app.ev(`parseFloat(getComputedStyle(document.querySelector('#plIntro .pli-naam')).opacity)`);
    toets('op 1,7 s staat "PidLane" in beeld', naam > 0.5, 'opaciteit ' + naam);
    toets('onthouden voor deze sessie', await app.ev(`sessionStorage.getItem(PLIntro.SLEUTEL) === '1'`));

    await wacht(1600);  // samen 3,3 s — ruim na DUUR_MS (2,9 s)
    toets('na afloop verborgen', await app.ev(`document.getElementById('plIntro').hidden === true`));
    const na = await app.ev(WAT_LIGT_ER);
    toets('na afloop is het veld weer aan te tikken', na === 'loginUser', 'op die plek ligt: ' + na);

    console.log('\n3. Eén tik en hij is weg');
    await app.ev(`PLIntro.start({forceer:true})`);
    await wacht(400);
    await app.ev(`document.elementFromPoint(innerWidth/2, innerHeight/2)
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true }))`);
    await wacht(450);
    toets('binnen een halve seconde verborgen', await app.ev(`document.getElementById('plIntro').hidden === true`));
    const naTik = await app.ev(WAT_LIGT_ER);
    toets('en het veld is weer aan te tikken', naTik === 'loginUser', 'op die plek ligt: ' + naTik);

    const eigen = app.fouten.filter(f => /PLIntro|plIntro|pli-/.test(f));
    toets('geen fouten uit de intro in de console', eigen.length === 0, eigen.join(' | '));
  } finally {
    await app.stop();
  }

  console.log('\n' + (fouten ? fouten + ' FOUT' : 'allemaal goed'));
  process.exit(fouten ? 1 : 0);
})().catch(e => { console.log('  FOUT ' + e.message); process.exit(1); });
