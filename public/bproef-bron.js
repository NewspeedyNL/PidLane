// ══════════════════════════════════════════════════════════════════
// bproef-bron.js — staat de previewbanner in de ECHTE app? (#242)
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF NIET IN node KAN
//
// test-bron.js toetst het oordeel: wat telt als productie, welk adres mag,
// wie er mag wisselen. Wat het niet toetst is of die banner werkelijk in
// beeld komt, en dat is het enige wat telt: een banner die achter de topbar
// valt of op `display:none` staat beschermt niemand.
//
//   * De banner staat op `position:fixed` bovenaan. De app heeft daar zelf
//     ook een balk; welke van de twee wint is een vraag over echte CSS.
//   * `document.body.style.paddingTop` moet de app eronder schuiven. Gebeurt
//     dat niet, dan valt de eerste regel van het scherm weg — een bug die
//     alléén op een preview ontstaat, en daar wil je juist zuiver meten.
//   * De menuknop wordt in het ECHTE Admin-menu gehangen (`#admGroup`).
//     Bestaat dat element niet meer of heet het anders, dan verschijnt de
//     knop nergens en zegt niets dat er iets mis is.
//
// WAT HIER MEEVALT: deze proef draait per definitie NIET op productie (de app
// wordt lokaal geserveerd), dus de banner hóórt hier te staan. Dat maakt dit
// meteen de zuiverste plek om hem te meten.
//
// Draaien vanuit public/:  node bproef-bron.js
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
    console.log('\n1. De module hangt in de app');
    toets('PLBron bestaat na een echte boot', await app.ev(`!!window.PLBron`));
    toets('hij leest dezelfde origin als de pagina',
      await app.ev(`PLBron.huidige() === location.origin`));
    toets('en weet dat dit geen productie is', (await app.ev(`PLBron.isProductie()`)) === false,
      'deze proef draait lokaal; zou hij hier "productie" zeggen, dan zegt de banner nooit iets');

    console.log('\n2. De banner staat er, zichtbaar, en de app schuift eronder');
    const b = JSON.parse(await app.ev(`(function(){
      PLBron.teken();
      var el = document.getElementById('bronBanner');
      if (!el) return JSON.stringify({ er: false });
      var st = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      return JSON.stringify({
        er: true,
        zichtbaar: st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0,
        boven: r.top <= 1,
        breed: r.width > 100,
        hoog: r.height > 8,
        tekst: el.textContent.slice(0, 60),
        padding: document.body.style.paddingTop
      });
    })()`));
    toets('de banner bestaat', b.er, JSON.stringify(b));
    toets('hij is zichtbaar', b.zichtbaar, JSON.stringify(b));
    toets('hij staat bovenaan en is breed genoeg om te zien', b.boven && b.breed && b.hoog, JSON.stringify(b));
    toets('hij noemt het woord PREVIEW', /PREVIEW/.test(b.tekst || ''), b.tekst);
    toets('en de app is eronder geschoven', /^\d+px$/.test(b.padding || ''), 'paddingTop: ' + b.padding);

    console.log('\n3. De knop hangt in het ECHTE Admin-menu');
    const k = JSON.parse(await app.ev(`(function(){
      window.isAdmin = function(){ return true; };
      window.PID_CONFIG = Object.assign({}, window.PID_CONFIG, { bron_preview: 'https://tak.workers.dev' });
      PLBron.teken();
      var el = document.getElementById('bronBtn');
      var groep = document.getElementById('admGroup');
      return JSON.stringify({
        er: !!el,
        inMenu: !!(el && groep && groep.contains(el)),
        klasse: el ? el.className : '',
        tekst: el ? el.textContent : ''
      });
    })()`));
    toets('de knop bestaat', k.er, JSON.stringify(k));
    toets('en hangt werkelijk in #admGroup', k.inMenu, JSON.stringify(k));
    toets('met dezelfde opmaak als de andere menuknoppen', /kebab-item/.test(k.klasse || ''), k.klasse);
    // Deze proef zit ZELF op een preview, dus de knop hoort "terug" te zeggen.
    toets('en hij biedt de weg terug aan', /terug/i.test(k.tekst || ''), k.tekst);

    console.log('\n4. Twee keer tekenen levert geen tweede banner of knop op');
    const dubbel = JSON.parse(await app.ev(`(function(){
      PLBron.teken(); PLBron.teken();
      return JSON.stringify({
        banners: document.querySelectorAll('#bronBanner').length,
        knoppen: document.querySelectorAll('#bronBtn').length
      });
    })()`));
    toets('één banner', dubbel.banners === 1, JSON.stringify(dubbel));
    toets('één knop', dubbel.knoppen === 1, JSON.stringify(dubbel));

    console.log('\n5. De testrun schrijft de bron in zijn startregel');
    // Zonder dit is een verslag van een preview niet te onderscheiden van een
    // verslag van productie — en dat is precies waar deze module voor is.
    toets('de stempel noemt PREVIEW en het adres',
      await app.ev(`/PREVIEW/.test(PLBron.stempel()) && PLBron.stempel().indexOf(location.origin) >= 0`),
      await app.ev(`PLBron.stempel()`));

    console.log('\nbproef-bron: ' + (fouten ? fouten + ' FOUT' : 'alles goed'));
  } finally {
    await app.stop();
  }
  process.exit(fouten ? 1 : 0);
})();
