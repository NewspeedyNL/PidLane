// ══════════════════════════════════════════════════════════════════
// bproef-schermranden.js — de onderste vellen blijven boven de
//                          Android-navigatiebalk
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE PROEF BESTAAT
//
// test-schermranden.js bewaakt de volschermvensters, maar sluit de
// onderaan-uitschuivende vellen BEWUST uit, met deze reden erbij:
//
//   "Gecentreerde dialogen en onderaan-uitschuivende vellen staan er bewust
//    niet in: daarboven of -onder blijft alleen de halfdoorzichtige
//    achtergrond staan, en die mag prima onder de statusbalk doorlopen."
//
// Voor een gecentreerde dialoog klopt dat. Voor een onderste vel niet: die
// staat op `align-items:flex-end`, dus het vel zélf ligt tegen de onderrand
// en er blijft daaronder helemaal geen achtergrond over. Issue #71 is
// precies dat geval — de Start-knop van de demo-autokiezer viel achter de
// drie Android-knoppen.
//
// Nagemeten op 03-09-2026 in dit harnas, met een navigatiebalk van 48px:
//
//   openDemoCarChooser    ruimte onder de laagste knop: 14px
//   openSituatie          ruimte onder de laagste knop: 12px
//   openVehicleOverview   ruimte onder de laagste knop: 12px
//
// Drie vellen dus, niet één. Dat is ook de reden dat dit een gedragsproef
// is en geen broncontrole: de vraag is niet of er ergens `var(--pl-sab)` in
// de bron staat, maar of de onderste knop met een vinger te raken is.
//
// De ingreep waar dit op toetst is klein (padding-bottom die --pl-sab
// meetelt), maar zonder meting is hij niet te controleren: --pl-sab is in
// een gewone browser 0px, en dan ziet elk vel er goed uit.
//
// WAAROM DEZE PROEF NIET IN plmutate.sh STAAT
//
// Blok 3 hieronder is zijn eigen tegenproef, en dat is met opzet de enige.
// plmutate.sh draait `node <test>` en kent geen overslaan: op Termux staat
// geen Chromium, dus deze proef zou daar exit 0 geven en als ONTSNAPT
// geboekt worden. Dat is een rode regel die niets betekent, en die wordt na
// twee keer genegeerd — precies wat CLAUDE.md over altijd-rode tests zegt.
// De tegenproef staat daarom ín de proef, zoals bij bproef-meetketen.js.
//
// Draaien vanuit public/:  node bproef-schermranden.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const path = require('path');
const { startApp } = require(path.join(__dirname, '..', 'plbrowser.js'));

// De hoogte van de drie Android-knoppen op een gangbaar toestel. Capacitor
// zet die als --safe-area-inset-bottom; pidlane.css leest hem als --pl-sab.
const NAVBALK = 48;

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// De onderaan-uitschuivende vellen: naam, de functie die hem opent, en het
// id van het element dat hij bouwt. Komt er een vel bij, dan hoort het hier.
const VELLEN = [
  { naam: 'Demo-autokiezer (#71)', open: 'openDemoCarChooser', id: 'demoCarModal' },
  { naam: 'Rijsituatie',           open: 'openSituatie',       id: 'situatieSheet' },
  { naam: 'Voertuigoverzicht',     open: 'openVehicleOverview', id: 'vehOverview' }
];

/* Meet de laagste knop die een vinger kan raken.

   Eerst alles naar beneden scrollen: dat is wat een gebruiker doet om de
   onderste knop te bereiken, en zonder die stap meet je een knop die
   toevallig nog buiten beeld hangt. Elementen die daarná nog helemaal onder
   de onderrand liggen tellen niet mee — die zijn niet zichtbaar en dus geen
   bewijs voor of tegen. */
const METER = `(function(id){
  const m = document.getElementById(id);
  if (!m) return { fout: 'element ' + id + ' bestaat niet' };
  m.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 2) e.scrollTop = e.scrollHeight; });
  let laagste = null, onder = -1e9;
  m.querySelectorAll('button,input,textarea,select,a').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.height <= 0 || r.top > window.innerHeight) return;
    if (r.bottom > onder) { onder = r.bottom; laagste = e; }
  });
  if (!laagste) return { fout: 'geen zichtbare knop in ' + id };
  return { knop: (laagste.textContent || laagste.id || laagste.tagName).trim().slice(0, 24),
           ruimteOnder: Math.round(window.innerHeight - onder) };
})`;

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
    console.log('\n1. De insets staan aan zoals Capacitor ze op Android zet');
    await app.ev(`document.documentElement.style.setProperty('--safe-area-inset-bottom','${NAVBALK}px'); true`);
    const sab = await app.ev(`getComputedStyle(document.documentElement).getPropertyValue('--pl-sab').trim()`);
    toets('--pl-sab komt door tot in de app', sab === NAVBALK + 'px', 'gemeten: ' + sab);
    // Zonder deze controle zou elke toets hieronder groen staan om de
    // verkeerde reden: bij --pl-sab = 0px is er niets om overheen te vallen.

    console.log('\n2. Elk onderste vel houdt zijn laagste knop boven de navigatiebalk');
    for (const v of VELLEN) {
      const bestaat = await app.ev(`typeof ${v.open} === 'function'`);
      if (!bestaat) { toets(v.naam + ': ' + v.open + '() bestaat', false, 'hernoemd of verdwenen?'); continue; }
      await app.ev(`${v.open}(); true`);
      const m = await app.ev(`${METER}('${v.id}')`);
      if (m.fout) { toets(v.naam + ': meetbaar', false, m.fout); continue; }
      toets(v.naam + ': ' + m.ruimteOnder + 'px onder "' + m.knop + '"',
            m.ruimteOnder >= NAVBALK,
            'minder dan de navigatiebalk (' + NAVBALK + 'px) — die knop zit er deels achter');
      await app.ev(`document.getElementById('${v.id}').style.display='none'; true`);
    }

    console.log('\n3. Tegenproef — meet deze proef werkelijk iets?');
    /* De veilige marge weer weghalen bij één vel, precies zoals hij vóór de
       reparatie was (padding-bottom een vast getal, zonder --pl-sab). Wordt
       de meting dán niet rood, dan bewijst blok 2 niets. */
    await app.ev(`openDemoCarChooser(); true`);
    const voor = await app.ev(`${METER}('demoCarModal')`);
    await app.ev(`(function(){
      const s = document.getElementById('demoCarModal').firstElementChild;
      s.children[1].style.paddingBottom = '14px';
      return true;
    })()`);
    const na = await app.ev(`${METER}('demoCarModal')`);
    toets('zonder --pl-sab valt de demo-kiezer wél achter de navigatiebalk',
          na.ruimteOnder < NAVBALK,
          'met vaste 14px padding bleef er ' + na.ruimteOnder + 'px over — dan meet blok 2 de padding niet');
    toets('en de marge scheelde ook echt iets',
          voor.ruimteOnder > na.ruimteOnder,
          'mét marge ' + voor.ruimteOnder + 'px, zonder ' + na.ruimteOnder + 'px');
  } finally {
    if (app) await app.stop();
  }

  console.log(fouten === 0 ? '\nbproef-schermranden: alles goed'
                           : '\nbproef-schermranden: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
