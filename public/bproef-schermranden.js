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
// UITGEBREID OP 08-09-2026 — #134 en #135, en waarom het er dertien werden
//
// Twee schermfoto's met "onderkant niet zichtbaar", en allebei een vorm die
// de #71-ronde niet raakte. Een bronscan over álle vensters met
// `position:fixed;inset:0` gaf zes kandidaten zonder veilige marge; de meting
// eronder wees uit welke daarvan het ook echt waren:
//
//   PID-recorder (.ai-sheet zonder voettekst)      14px  → 62px
//   Expert op afstand (.rem-card in index.html)    29px  → 77px
//   Keuzescherm, deur "Wat is er met mijn auto?"   24px  → 72px   (inhoud)
//
// De vier volschermvensters uit koopcheck.js en het Run-venster hadden geen
// `--pl-sab` in de bron en waren tóch ruim: ze eindigen met een knop hoog in
// een lang paneel. Nog een reden om te meten en niet te lezen.
//
// TWEE MEETLESSEN, allebei duur betaald in deze ronde:
//
// 1. WACHT DE ANIMATIE AF. `.ai-sheet` schuift omhoog (`animation: sheetUp`).
//    Meteen meten gaf "26px ONDER de rand" voor de PID-recorder — dat was de
//    animatie, niet de marge. Zie `rust()` hieronder.
// 2. DE LAAGSTE KNOP IS NIET ALTIJD DE MAAT. Bij #135 stond de laagste knop
//    op 153px en was er niets aan de hand; het was de laatste KAART die 24px
//    boven de rand eindigde en dus half achter de knoppenbalk lag. Een scherm
//    vol tekst heeft een inhoudsmaat nodig, een vel met een knoppenrij niet.
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

/* Even wachten na het openen, en dit is geen luiheid maar een meetfout die we
   op 08-09-2026 in de val liepen. .ai-sheet draagt `animation: sheetUp .25s`:
   het vel schuift van onder het beeld omhoog. Meet je meteen, dan meet je de
   animatie — de PID-recorder gaf zo "26px ONDER de onderrand" terwijl het vel
   40px van zijn weg omhoog nog moest afleggen. De inline gebouwde vellen
   hebben die animatie niet, dus die kwamen er wél goed uit; juist daardoor
   leek het verschil een echte bevinding. */
const rust = (ms) => new Promise(function (r) { setTimeout(r, ms); });
const ANIMATIE_MS = 400;

// De onderaan-uitschuivende vellen: naam, de functie die hem opent, en het
// id van het element dat hij bouwt. Komt er een vel bij, dan hoort het hier.
const VELLEN = [
  { naam: 'Demo-autokiezer (#71)', open: 'openDemoCarChooser', id: 'demoCarModal' },
  { naam: 'Rijsituatie',           open: 'openSituatie',       id: 'situatieSheet' },
  { naam: 'Voertuigoverzicht',     open: 'openVehicleOverview', id: 'vehOverview' },

  // ── de ronde van 08-09-2026 ────────────────────────────────────────
  // #134 en #135 kwamen binnen als twee losse schermfoto's met "onderkant
  // niet zichtbaar". Bij het nalopen bleken het geen twee gevallen maar twee
  // vormen die de #71-ronde allebei niet raakte, en een bronscan over álle
  // vensters vond er nog vier van de tweede soort. Ze staan hier omdat de
  // vraag dezelfde is: is de onderste knop met een vinger te raken?
  //
  // 1. De .ai-sheet-familie zonder voettekst. De veilige marge zat in
  //    .ai-sheet-f, dus een vel dat alleen kop + inhoud heeft, had er geen.
  { naam: 'Rapporten (#134)',      open: 'openReportsOverview', id: 'reportsOverviewSheet' },
  { naam: 'Bevindingen',           open: 'openBevindingen',     id: 'bevSheet' },
  { naam: 'PID-recorder',          open: 'openPidRecorder',     id: 'pidRecOv' },
  // 2. Volschermvensters die met inline stijl gebouwd zijn en buiten de lijst
  //    van test-schermranden.js vielen.
  { naam: 'Onderhoud',             open: 'openOnderhoud',       id: 'onderhoudDash' },
  { naam: 'EV-check',              open: 'openEVCheck',         id: 'evDash' },
  { naam: 'Lange rit',             open: 'openLangeRit',        id: 'langeRitDash' },
  { naam: 'Klimaat',               open: 'openClimateCheck',    id: 'climateDash' },
  { naam: 'Run-venster',           open: 'openRunPaneel',       id: 'runOv' }
];

/* De twee vellen van de deel-module staan in index.html en gaan open met een
   klasse in plaats van met een functie; PLRemote geeft de openers wel naar
   buiten. Eigen lijst, zodat de lus hierboven één vorm houdt. */
const REMOTE_VELLEN = [
  { naam: 'Deel mijn data',   open: 'PLRemote.openShare',  id: 'remShareOv' },
  { naam: 'Expert op afstand', open: 'PLRemote.openExpert', id: 'remExpertOv' }
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
      await rust(ANIMATIE_MS);
      const m = await app.ev(`${METER}('${v.id}')`);
      if (m.fout) { toets(v.naam + ': meetbaar', false, m.fout); continue; }
      toets(v.naam + ': ' + m.ruimteOnder + 'px onder "' + m.knop + '"',
            m.ruimteOnder >= NAVBALK,
            'minder dan de navigatiebalk (' + NAVBALK + 'px) — die knop zit er deels achter');
      await app.ev(`document.getElementById('${v.id}').style.display='none'; true`);
    }

    console.log('\n2b. De twee vellen van de deel-module');
    for (const v of REMOTE_VELLEN) {
      const bestaat = await app.ev(`typeof PLRemote === 'object' && PLRemote && typeof ${v.open} === 'function'`);
      if (!bestaat) { toets(v.naam + ': ' + v.open + '() bestaat', false, 'hernoemd of verdwenen?'); continue; }
      await app.ev(`${v.open}(); true`);
      await rust(ANIMATIE_MS);
      const m = await app.ev(`${METER}('${v.id}')`);
      if (m.fout) { toets(v.naam + ': meetbaar', false, m.fout); continue; }
      toets(v.naam + ': ' + m.ruimteOnder + 'px onder "' + m.knop + '"',
            m.ruimteOnder >= NAVBALK,
            'minder dan de navigatiebalk (' + NAVBALK + 'px) — die knop zit er deels achter');
      await app.ev(`document.getElementById('${v.id}').classList.remove('open'); true`);
    }

    /* Het keuzescherm is geen vel maar een scherm, en het heeft sinds 04-08 een
       eigen veilige-zoneregeling (#welcomeScreen krijgt bottom en padding).
       #135 meldt de onderkant van de deur "Wat is er met mijn auto?" tóch als
       weg, en die deur is het langste paneel van de vijf. Alleen te
       beantwoorden door hem open te zetten en te meten — vandaar hier en niet
       in een bronscan. */
    console.log('\n2c. Het keuzescherm en de langste deur erin (#135)');
    {
      const heeft = await app.ev(`typeof openDoor === 'function' && !!document.getElementById('dp-diag')`);
      if (!heeft) {
        toets('openDoor() en #dp-diag bestaan', false, 'hernoemd of verdwenen?');
      } else {
        await app.ev(`(function(){
          const w = document.getElementById('welcomeScreen');
          if (w) w.classList.remove('hidden');
          openDoor('diag');
          return true;
        })()`);
        await rust(ANIMATIE_MS);
        // Eerst helemaal naar beneden scrollen. De scrollbak (.welcome-scroll)
        // is hier een VOORVADER van het paneel, en de meter scrolt alleen wat
        // eronder hangt — zonder deze stap meet je de kaart die toevallig op de
        // onderrand staat in plaats van de laatste.
        await app.ev(`(function(){
          const s = document.querySelector('#welcomeScreen .welcome-scroll');
          if (s) s.scrollTop = s.scrollHeight;
          return true;
        })()`);
        const m = await app.ev(`${METER}('dp-diag')`);
        if (m.fout) toets('deur "Wat is er met mijn auto?": meetbaar', false, m.fout);
        else toets('deur "Wat is er met mijn auto?": ' + m.ruimteOnder + 'px onder "' + m.knop + '"',
                   m.ruimteOnder >= NAVBALK,
                   'minder dan de navigatiebalk (' + NAVBALK + 'px) — de onderste kaart is dan niet te raken');

        /* En hier de maat die #135 werkelijk raakt. De laagste KNOP stond met
           153px ruim genoeg; het was de onderste INHOUD die wegviel — de
           laatste kaart eindigde 24px boven de rand, dus de helft van zijn
           tekst lag achter de knoppenbalk. Een scherm vol tekstkaarten heeft
           die maat nodig; een vel met een knoppenrij onderin niet. */
        const inhoud = await app.ev(`(function(){
          const m = document.getElementById('dp-diag');
          if (!m) return { fout: 'geen dp-diag' };
          let onder = -1e9;
          m.querySelectorAll('*').forEach(function (e) {
            const r = e.getBoundingClientRect();
            if (r.height <= 0 || r.top > window.innerHeight) return;
            if (r.bottom > onder) onder = r.bottom;
          });
          return { ruimteOnder: Math.round(window.innerHeight - onder) };
        })()`);
        if (!inhoud.fout)
          toets('en de laatste kaart eindigt boven de navigatiebalk: ' + inhoud.ruimteOnder + 'px',
                inhoud.ruimteOnder >= NAVBALK,
                'de onderste ' + (NAVBALK - inhoud.ruimteOnder) + 'px van de laatste kaart ligt achter de knoppenbalk (#135)');
        // De scrollhoogte erbij: is de laatste kaart überhaupt te bereiken?
        const rest = await app.ev(`(function(){
          const s = document.querySelector('#welcomeScreen .welcome-scroll');
          if (!s) return { fout: 'geen .welcome-scroll' };
          s.scrollTop = s.scrollHeight;
          return { onbereikbaar: Math.round(s.scrollHeight - s.clientHeight - s.scrollTop) };
        })()`);
        if (!rest.fout)
          toets('de deur is helemaal uit te scrollen', rest.onbereikbaar <= 1,
                rest.onbereikbaar + 'px blijft onbereikbaar onder de scrollrand');
        await app.ev(`(function(){ try{ backToDoors(); }catch(e){}
          const w = document.getElementById('welcomeScreen'); if (w) w.classList.add('hidden'); return true; })()`);
      }
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

    /* Dezelfde vraag voor de drie reparaties van 08-09-2026. Elk zet zijn eigen
       marge terug op de waarde van vóór de ronde en meet opnieuw. Blijft die
       meting groen, dan bewijst de bijbehorende regel in blok 2 niets meer —
       en dan is de CSS-regel die eronder ligt overbodig geworden of stilletjes
       vervangen. Voor het keuzescherm meten we de INHOUD en niet de knop: dat
       was daar de klacht (#135). */
    const TERUG = [
      { naam: 'PID-recorder zonder .ai-sheet-b:last-child (#134-familie)',
        open: `openPidRecorder()`, id: 'pidRecOv',
        zet: `document.querySelector('#pidRecOv .ai-sheet-b').style.paddingBottom='14px'`, was: 14 },
      { naam: 'Expertvel zonder marge op .rem-card',
        open: `PLRemote.openExpert()`, id: 'remExpertOv',
        zet: `document.querySelector('#remExpertOv .rem-card').style.paddingBottom='22px'`, was: 29 }
    ];
    for (const t of TERUG) {
      await app.ev(`${t.open}; true`);
      await rust(ANIMATIE_MS);
      await app.ev(`${t.zet}; true`);
      const m = await app.ev(`${METER}('${t.id}')`);
      toets(t.naam + ': valt terug op ' + m.ruimteOnder + 'px',
            m.ruimteOnder < NAVBALK,
            'nog steeds ' + m.ruimteOnder + 'px over — dan meet de toets in blok 2 de marge niet');
    }

    await app.ev(`(function(){
      const w = document.getElementById('welcomeScreen'); if (w) w.classList.remove('hidden');
      openDoor('diag');
      document.querySelector('#welcomeScreen .welcome-scroll').style.paddingBottom = '24px';
      const s = document.querySelector('#welcomeScreen .welcome-scroll'); if (s) s.scrollTop = s.scrollHeight;
      return true;
    })()`);
    const kaal = await app.ev(`(function(){
      const m = document.getElementById('dp-diag');
      if (!m) return { fout: 'dp-diag bestaat niet' };
      let onder = -1e9;
      m.querySelectorAll('*').forEach(function (e) {
        const r = e.getBoundingClientRect();
        if (r.height <= 0 || r.top > window.innerHeight) return;
        if (r.bottom > onder) onder = r.bottom;
      });
      if (onder === -1e9) return { fout: 'niets zichtbaar in dp-diag' };
      return { ruimteOnder: Math.round(window.innerHeight - onder) };
    })()`);
    if (kaal.fout) toets('Keuzescherm zonder marge: meetbaar', false, kaal.fout);
    else toets('Keuzescherm zonder marge op .welcome-scroll: valt terug op ' + kaal.ruimteOnder + 'px (#135)',
               kaal.ruimteOnder < NAVBALK,
               'nog steeds ' + kaal.ruimteOnder + 'px over — dan zegt de inhoudsmeting in blok 2c niets');
  } finally {
    if (app) await app.stop();
  }

  console.log(fouten === 0 ? '\nbproef-schermranden: alles goed'
                           : '\nbproef-schermranden: ' + fouten + ' fout(en)');
  process.exit(fouten === 0 ? 0 : 1);
})().catch(e => { console.log('  FOUT  proef brak af — ' + e.message); process.exit(1); });
