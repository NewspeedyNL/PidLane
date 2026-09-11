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
//    animatie, niet de marge. Dat werd eerst 400 ms, toen "wacht tot twee
//    metingen hetzelfde zeggen", en sinds 10-09-2026 wordt de animatie zélf
//    afgewacht via `getAnimations()` — zie #168 en de uitleg bij
//    `wachtAnimatiesKlaar()`. De eerste twee waren allebei een gok op frames,
//    en allebei verloren ze die gok een keer in CI.
// 2. DE LAAGSTE KNOP IS NIET ALTIJD DE MAAT. Bij #135 stond de laagste knop
//    op 153px en was er niets aan de hand; het was de laatste KAART die 24px
//    boven de rand eindigde en dus half achter de knoppenbalk lag. Een scherm
//    vol tekst heeft een inhoudsmaat nodig, een vel met een knoppenrij niet.
//
// De ingreep waar dit op toetst is klein (padding-bottom die --pl-sab
// meetelt), maar zonder meting is hij niet te controleren: --pl-sab is in
// een gewone browser 0px, en dan ziet elk vel er goed uit.
//
// DERDE RONDE — #144, en waarom deze proef hem eerst LIET LOPEN
//
// "Venster achter run knop komt niet geheel in beeld aan de onderkant", met
// de opmerking erbij: reeds meerdere vensters gefixed, maak er een test voor.
// Die test stond hier al, en het Run-venster stond er al in — sinds de vorige
// ronde, met de conclusie "had geen --pl-sab in de bron en was tóch ruim".
//
// Die conclusie klopte op 412x915. Twee dingen maakten hem onwaar:
//
// 1. HET PANEEL GROEIT MEE. Sinds #123 hangt de bevindingenschakelaar mét
//    zijn uitleg onderaan het Run-venster. Op een kort scherm gaat de bak
//    daardoor scrollen, en dan komt de onderrand er wél tegenaan.
// 2. DE PROEF MAT DE VERKEERDE MAAT — dezelfde meetles die hierboven als
//    les 2 staat, en die deze proef zélf niet toepaste buiten het keuzescherm.
//    Gemeten op 360x640 met een navigatiebalk van 48px:
//
//       laagste KNOP  ("Aan")                65px  → groen
//       laagste TEKST ("staat de balk uit…") 43px  → valt achter de balk
//
//    De knop stond ruim; de uitleg eronder niet. Blok 2 keek alleen naar de
//    knop en zette een vinkje.
//
// Twee dingen zijn daarom veranderd, en ze zijn allebei algemeen:
//
//   • Elk vel wordt nu óók op zijn laagste ZICHTBARE TEKST gemeten, niet
//     alleen op zijn laagste knop. Tekst is wat een mens leest — een
//     volschermwikkel draagt er geen en telt dus vanzelf niet mee, terwijl de
//     ruwe "laagste element"-maat juist die wikkel opmat en voor twaalf van de
//     dertien vellen 0px gaf. Nagemeten: met de tekstmaat is er precies één
//     vel rood, en dat is het vel uit het issue.
//   • De hele reeks draait een tweede keer op een KORT scherm (360x640). Op
//     412x915 had het Run-venster 257px over — daar is niets te zien. Een
//     paneel dat moet scrollen is de voorwaarde waaronder deze fout ontstaat,
//     en die voorwaarde hoort de proef zelf te maken in plaats van af te
//     wachten tot iemand er een schermfoto van stuurt.
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

/* Wachten na het openen is geen luiheid maar een meetfout die we op
   08-09-2026 in de val liepen. .ai-sheet draagt `animation: sheetUp .25s`: het
   vel schuift van onder het beeld omhoog. Meet je meteen, dan meet je de
   animatie — de PID-recorder gaf zo "26px ONDER de onderrand" terwijl het vel
   40px van zijn weg omhoog nog moest afleggen. De inline gebouwde vellen
   hebben die animatie niet, dus die kwamen er wél goed uit; juist daardoor
   leek het verschil een echte bevinding. */
const rust = (ms) => new Promise(function (r) { setTimeout(r, ms); });

/* WACHTEN TOT HET STILSTAAT, NIET EEN VAST AANTAL MILLISECONDEN.
   ────────────────────────────────────────────────────────────────────
   Hierboven staat als meetles 1: wacht de animatie af. Dat werd 400 ms, en
   dat is een gok die het meestal haalt. Op 09-09-2026 haalde hij het niet:
   dezelfde commit gaf twee runs, één rood en één groen, en de rode meldde
   "PID-recorder: 22px onder de knop" terwijl datzelfde vel even verderop in
   diezelfde run 62px gaf. Het vel was nog aan het omhoogschuiven.

   Een proef die soms rood staat is net zo waardeloos als een die altijd rood
   staat: hij wordt na twee keer weggeklikt als "die doet dat wel vaker". De
   400 ms zijn daarom vervangen door de vraag zelf: meet net zo lang tot twee
   metingen achter elkaar hetzelfde zeggen. Dan is het vel uitgeschoven, hoe
   traag de runner ook is — en op een snelle runner kost het één meting extra
   in plaats van 400 ms wachten.

   De bovengrens blijft bestaan zodat een vel dat nooit tot rust komt de proef
   niet laat hangen; die situatie is zelf een bevinding en komt als afwijkende
   maat vanzelf in blok 2 terecht.

   EN OP 10-09-2026 BLEEK DAT NOG STEEDS NIET GENOEG (#168). Dezelfde film,
   derde keer: één run rood met "PID-recorder: 22px onder de knop", dezelfde
   commit groen in de run ernaast en groen op dit toestel. 62 − 22 = 40, en 40
   is precies wat het commentaar hierboven noemt als het stuk weg dat het vel
   nog moest afleggen.

   Waarom "twee gelijke metingen" geen bewijs is: het is een GOK op frames, en
   die gok verliest op twee manieren. Meet je twee keer vóórdat de animatie zijn
   eerste frame heeft gehad, dan zijn ze gelijk en meet je de beginstand; hapert
   de runner tussen twee monsters, dan zijn ze óók gelijk en meet je het midden.
   Beide keren staat er een getal dat niets met de marge te maken heeft.

   De browser weet zelf wanneer een animatie klaar is, en dat is geen gok maar
   een belofte: `element.getAnimations()` geeft ze, en elke animatie heeft een
   `finished`-promise. Daar wachten we nu op. `wachtTotStil()` blijft daarna
   staan voor wat er ná de animatie nog verschuift (lettertypen, een regel die
   omvalt) — maar hij begint pas als het vel écht stilstaat. */
async function wachtAnimatiesKlaar(app, id) {
  // De promise komt uit de pagina zelf; app.ev() wacht hem af. Een animatie die
  // wordt afgebroken verwerpt zijn finished-promise, en dat is hier geen fout
  // maar precies zo goed een eindpunt — vandaar de lege catch per animatie.
  return app.ev(`(async function () {
    const el = document.getElementById('${id}');
    if (!el) return { n: 0, fout: 'geen element' };
    let an = [];
    try { an = el.getAnimations ? el.getAnimations({ subtree: true }) : []; }
    catch (e) { return { n: 0, fout: 'getAnimations() gaf ' + e.message }; }
    await Promise.all(an.map(function (a) { return a.finished.catch(function () { }); }));
    return { n: an.length };
  })()`);
}

async function wachtTotStil(app, id) {
  let vorig = null;
  for (let poging = 0; poging < 40; poging++) {       // ruim 3 s bovengrens
    const m = await app.ev(`${TEKSTMETER}('${id}')`);
    const nu = (m && !m.fout && typeof m.ruimteOnder === 'number') ? m.ruimteOnder : null;
    if (nu !== null && nu === vorig) return nu;       // twee gelijke metingen = stil
    vorig = nu;
    await rust(80);
  }
  return vorig;
}

// De twee stappen horen bij elkaar en worden nergens los gebruikt: eerst de
// animatie uitzitten, dan pas kijken of het beeld nog verschuift.
async function wachtTotVelStaat(app, id) {
  await wachtAnimatiesKlaar(app, id);
  return wachtTotStil(app, id);
}

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

// Hoe een vel weer dicht gaat. De deel-module luistert naar een klasse; er
// display:none op zetten laat een inline stijl staan die een volgende open()
// niet weghaalt, en dan meet blok 3 een vel dat er niet is.
const SLUIT_VEL    = `e.style.display = 'none';`;
const SLUIT_REMOTE = `e.classList.remove('open');`;

/* Het korte scherm. 360x640 is een gangbare kleine Android, en vooral: het is
   kort genoeg om het Run-venster te laten scrollen. Dát is de voorwaarde
   waaronder #144 ontstaat — op 412x915 had datzelfde paneel 257px over, en
   dan meet je niets. Een proef die alleen op het ruime toestel kijkt, kan een
   onderrand die de knoppenbalk niet meetelt per definitie niet zien. */
const KORT_B = 360, KORT_H = 640;

/* Meet de laagste knop die een vinger kan raken.

   Eerst alles naar beneden scrollen: dat is wat een gebruiker doet om de
   onderste knop te bereiken, en zonder die stap meet je een knop die
   toevallig nog buiten beeld hangt. Elementen die daarná nog helemaal onder
   de onderrand liggen tellen niet mee — die zijn niet zichtbaar en dus geen
   bewijs voor of tegen. */
const METER = `(function(id){
  const m = document.getElementById(id);
  if (!m) return { fout: 'element ' + id + ' bestaat niet' };
  /* Eerst de bak ZELF, dan alles eronder. Die eerste regel is er sinds #144:
     bij het Run-venster is de scrollbak het gemeten element zelf (#runOv
     draagt overflow-y:auto), en querySelectorAll('*') levert alleen de
     afstammelingen. Zonder deze regel meet je daar de bovenkant van een
     paneel dat je nooit hebt uitgescrold. */
  if (m.scrollHeight > m.clientHeight + 2) m.scrollTop = m.scrollHeight;
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

/* Meet de laagste ZICHTBARE TEKST — de tweede maat, sinds #144.

   Waarom tekst en niet "het laagste element": een vel is een volschermwikkel
   met `inset:0` waarin een kaart hangt. Die wikkel loopt per definitie tot de
   onderrand, en dat mág — hij is de halfdoorzichtige achtergrond. Meet je het
   laagste element, dan meet je hem, en dan geeft elk vel 0px. Nagemeten op
   08-09-2026: twaalf van de dertien vellen gaven zo 0px, en dat is een maat
   die niets onderscheidt.

   Tekst is wél de klacht. "Komt niet geheel in beeld" gaat over iets dat je
   moet kunnen lezen. Een Range om de tekstknoop geeft de regel zelf, niet de
   doos eromheen — een <div> die tot onderaan doorloopt met één regel bovenin
   telt dus mee met die regel, en niet met zijn hoogte. */
const TEKSTMETER = `(function(id){
  const m = document.getElementById(id);
  if (!m) return { fout: 'element ' + id + ' bestaat niet' };
  if (m.scrollHeight > m.clientHeight + 2) m.scrollTop = m.scrollHeight;
  m.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 2) e.scrollTop = e.scrollHeight; });
  const loper = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
  const bereik = document.createRange();
  let onder = -1e9, tekst = null;
  for (let n = loper.nextNode(); n; n = loper.nextNode()) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    const ouder = n.parentElement;
    if (!ouder) continue;
    const st = getComputedStyle(ouder);
    if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) continue;
    bereik.selectNodeContents(n);
    const r = bereik.getBoundingClientRect();
    // Buiten beeld telt niet mee: dat is geen bewijs voor of tegen, net als
    // bij de knoppen hierboven.
    if (r.height <= 0 || r.top > window.innerHeight) continue;
    if (r.bottom > onder) { onder = r.bottom; tekst = n.nodeValue.trim().slice(0, 24); }
  }
  if (onder === -1e9) return { fout: 'geen zichtbare tekst in ' + id };
  return { tekst: tekst, ruimteOnder: Math.round(window.innerHeight - onder) };
})`;

/* Eén vel openen en langs beide maten leggen. Sinds #144 is dat er twee: de
   laagste knop (kun je hem raken?) en de laagste tekst (kun je hem lezen?).
   De eerste alleen was niet genoeg — zie de derde ronde in de kop.

   `sluit` verschilt per soort en staat daarom in de lijst en niet hier: de
   vellen van de deel-module gaan met een klasse open, en er `display:none`
   op zetten laat een inline stijl achter waar een volgende open() overheen
   moet. Dat is precies het soort stille rommel waar blok 3 later op meet. */
async function keurVel(app, v, waar, sluit) {
  const bij = waar ? ' [' + waar + ']' : '';
  const bestaat = await app.ev(`(function(){ try { return typeof ${v.open} === 'function'; } catch (e) { return false; } })()`);
  if (!bestaat) { toets(v.naam + bij + ': ' + v.open + '() bestaat', false, 'hernoemd of verdwenen?'); return; }
  await app.ev(`${v.open}(); true`);
  await wachtTotVelStaat(app, v.id);

  const k = await app.ev(`${METER}('${v.id}')`);
  if (k.fout) toets(v.naam + bij + ': meetbaar', false, k.fout);
  else toets(v.naam + bij + ': ' + k.ruimteOnder + 'px onder knop "' + k.knop + '"',
             k.ruimteOnder >= NAVBALK,
             'minder dan de navigatiebalk (' + NAVBALK + 'px) — die knop zit er deels achter');

  const t = await app.ev(`${TEKSTMETER}('${v.id}')`);
  if (t.fout) toets(v.naam + bij + ': tekst meetbaar', false, t.fout);
  else toets(v.naam + bij + ': ' + t.ruimteOnder + 'px onder tekst "' + t.tekst + '"',
             t.ruimteOnder >= NAVBALK,
             'de onderste regel ligt ' + (NAVBALK - t.ruimteOnder) + 'px achter de knoppenbalk — ' +
             'onleesbaar, ook al staat de laagste knop vrij (#144)');

  await app.ev(`(function(){ const e = document.getElementById('${v.id}'); if (e) { ${sluit} } return true; })()`);
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
    console.log('\n1. De insets staan aan zoals Capacitor ze op Android zet');
    await app.ev(`document.documentElement.style.setProperty('--safe-area-inset-bottom','${NAVBALK}px'); true`);
    const sab = await app.ev(`getComputedStyle(document.documentElement).getPropertyValue('--pl-sab').trim()`);
    toets('--pl-sab komt door tot in de app', sab === NAVBALK + 'px', 'gemeten: ' + sab);
    // Zonder deze controle zou elke toets hieronder groen staan om de
    // verkeerde reden: bij --pl-sab = 0px is er niets om overheen te vallen.

    console.log('\n2. Elk onderste vel houdt zijn laagste knop én zijn onderste regel vrij');
    for (const v of VELLEN) await keurVel(app, v, '', SLUIT_VEL);

    console.log('\n2b. De twee vellen van de deel-module');
    for (const v of REMOTE_VELLEN) await keurVel(app, v, '', SLUIT_REMOTE);

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
        await wachtTotVelStaat(app, 'dp-diag');
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

    /* Dezelfde reeks, maar op een scherm dat kort genoeg is om panelen te
       laten scrollen. Dit blok is de reden dat #144 gevonden zou zijn: hij
       bestond alleen onder deze voorwaarde, en tot nu toe maakte de proef die
       voorwaarde nooit. Een vel dat hier valt, valt op een echte kleine
       telefoon ook. */
    console.log(`\n2d. Dezelfde reeks op een kort scherm (${KORT_B}x${KORT_H}) — daar moet een paneel scrollen (#144)`);
    const vh = await app.venster(KORT_B, KORT_H);
    toets('het venster ging mee naar ' + KORT_B + 'x' + KORT_H, vh === KORT_H,
          'window.innerHeight = ' + vh + ' — dan meet dit blok het ruime scherm nog een keer');
    const sabKort = await app.ev(`getComputedStyle(document.documentElement).getPropertyValue('--pl-sab').trim()`);
    toets('--pl-sab overleeft het verkleinen', sabKort === NAVBALK + 'px', 'gemeten: ' + sabKort);
    for (const v of VELLEN) await keurVel(app, v, 'kort', SLUIT_VEL);
    for (const v of REMOTE_VELLEN) await keurVel(app, v, 'kort', SLUIT_REMOTE);

    /* ── 2e. DE ONDERRAND VAN HET WERKSCHERM (#172) ──────────────────
       De blok 5-proef "De app past tussen de statusbalk en de navigatiebalk"
       meldde vanaf 01-09 elke rit FOUT, terwijl de bestuurder op 10-09
       "Alles vrij — er valt niets weg" antwoordde. De regel is herzien: niet
       "past #appGrid binnen de vouw" maar "kun je bij de onderste regel".

       Die regel zelf staat in test-schermranden.js, zonder browser. Wat DAAR
       niet te toetsen valt is de meetkant: vindt `_plScrollRestOnder()` de bak
       die werkelijk scrollt? Een functie die stilletjes 0 teruggeeft laat elke
       scrollende pagina weer als bevinding lezen, en dan is er niets opgelost.

       Op dit scherm past #appGrid gewoon, dus de situatie moet gemaakt worden:
       we duwen er een hoog blok in en kijken of de meting meegroeit. */
    console.log('\n2e. De onderrand van het werkscherm — bereikbaar of vast? (#172)');
    await app.venster(KORT_B, KORT_H);
    await rust(120);

    const onderrand = `(function (extra) {
      const g = document.getElementById('appGrid');
      if (!g) return { fout: 'geen #appGrid' };
      let vul = document.getElementById('plProefVulling');
      if (extra > 0) {
        if (!vul) { vul = document.createElement('div'); vul.id = 'plProefVulling'; g.appendChild(vul); }
        vul.style.cssText = 'height:' + extra + 'px';
      } else if (vul) { vul.remove(); }
      const meet = function (t) {
        const p = document.createElement('div');
        p.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:' + t;
        document.body.appendChild(p); const h = p.getBoundingClientRect().height; p.remove(); return h;
      };
      const sab = meet('var(--pl-sab)');
      const onder = g.getBoundingClientRect().bottom;
      const grens = window.innerHeight - sab;
      const rest = window._plScrollRestOnder(g);
      return { onder: Math.round(onder), grens: Math.round(grens), rest: Math.round(rest),
               oudeRegel: onder > grens + 1 ? 'FOUT' : 'ok',
               oordeel: window.plOnderrandOordeel(onder, grens, rest) };
    })`;

    toets('de meetkant hangt naar buiten',
      await app.ev(`typeof window._plScrollRestOnder === 'function' && typeof window.plOnderrandOordeel === 'function'`),
      'zonder die twee is er niets van dit oordeel in een browser te meten');

    const rustig = await app.ev(`${onderrand}(0)`);
    toets('zonder vulling past het werkscherm', !rustig.fout && rustig.oordeel && rustig.oordeel.ok,
      JSON.stringify(rustig));

    // Nu 600px erbij: het werkscherm loopt gegarandeerd onder de balk door, en
    // de pagina kan dat wegscrollen. Dat is het geval van de rit van 10-09.
    const vol = await app.ev(`${onderrand}(600)`);
    toets('met 600px extra loopt het werkscherm wél onder de balk door',
      !vol.fout && vol.oudeRegel === 'FOUT', JSON.stringify(vol));
    toets('en de meting ziet dat er scrollruimte is', !vol.fout && vol.rest > 0,
      'scrollruimte gemeten: ' + (vol.rest) + 'px — een 0 hier laat elke scrollende pagina weer rood staan');
    toets('dus het oordeel blijft groen: bereikbaar', !vol.fout && vol.oordeel && vol.oordeel.ok,
      JSON.stringify(vol.oordeel));
    if (!vol.fout)
      console.log('      ' + vol.onder + 'px werkscherm, balk op ' + vol.grens + 'px, ' + vol.rest + 'px scrollruimte');

    // TEGENPROEF: zet het scrollen uit. Dezelfde maten, en dan hóórt het wél
    // een bevinding te zijn — anders zegt dit blok niets.
    await app.ev(`(function(){ const d=document.scrollingElement||document.documentElement;
      d.dataset.plProefOv = d.style.overflow || ''; d.style.overflow='hidden';
      document.body.style.overflow='hidden'; return true; })()`);
    const klem = await app.ev(`${onderrand}(600)`);
    toets('zonder scrollruimte is dezelfde situatie wél een bevinding (tegenproef)',
      !klem.fout && klem.oordeel && klem.oordeel.ok === false,
      JSON.stringify(klem));
    await app.ev(`(function(){ const d=document.scrollingElement||document.documentElement;
      d.style.overflow = d.dataset.plProefOv || ''; document.body.style.overflow='';
      const v=document.getElementById('plProefVulling'); if(v) v.remove(); return true; })()`);

    /* ── 2f. DEZELFDE RANDEN BIJ TEKSTGROOTTE S EN L (#192) ─────────
       Deze proef mat tot 11-09 altijd op tekstgrootte M, en dat is precies de
       stand waarin #192 niet bestaat. S/M/L schalen de app met `zoom` op body,
       en `zoom` vermenigvuldigt de uitkomst van een berekening terwijl 100dvh
       de hele viewport blijft. Alles wat zijn hoogte uit de viewport haalt
       wordt daardoor bij L 13% te lang, en dat teveel valt er onderaan uit.

       Gemeten op 360x640 met een navigatiebalk van 48px, vóór de reparatie:

         M   .app eindigt op 592px   48px vrij      ok
         S   .app eindigt op 533px  107px vrij      ok, maar 59px verspild
         L   .app eindigt op 723px   83px te laag   FOUT

       De maat is hier de onderkant van het werkscherm en niet een knop: bij L
       schuift alles mee naar beneden, dus het is de hele onderrand die wegvalt
       en niet één element. */
    console.log('\n2f. De onderrand klopt bij élke tekstgrootte (#192)');
    await app.venster(KORT_B, KORT_H);
    toets('setUiScale() bestaat', await app.ev(`typeof setUiScale === 'function'`),
          'zonder die functie is de tekstgrootte niet te zetten en meet dit blok niets');

    const RAND = `(function(){
      const g = document.getElementById('appGrid') || document.querySelector('.app');
      if (!g) return { fout: 'geen werkscherm' };
      const p = document.createElement('div');
      p.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:var(--pl-sab)';
      document.body.appendChild(p);
      const sab = p.getBoundingClientRect().height; p.remove();
      const onder = g.getBoundingClientRect().bottom;
      /* DE GRENS KOMT UIT DE NAVBALK EN NIET UIT --pl-sab. Die eerste versie
         las hem uit dezelfde variabele die de app zelf gebruikt, en dan
         bewegen beide kanten mee: een --pl-sab die de zoom niet meerekent gaf
         54px aan weerszijden en bleef groen. Zo'n proef meet of de app met
         zichzelf klopt, niet of hij boven de balk blijft — precies de vorm die
         CLAUDE.md waardeloos noemt. Gemeten met de mutatie erin: 586 tegen 586
         (groen) met --pl-sab als grens, 586 tegen 592 (rood) met de balk. */
      return { onder: Math.round(onder), grens: window.innerHeight - NAVBALK_PX,
               sab: Math.round(sab), zoom: getComputedStyle(document.body).zoom };
    })`.replace('NAVBALK_PX', String(NAVBALK));

    for (const g of ['m', 's', 'l']) {
      await app.ev(`setUiScale('${g}'); true`);
      await rust(150);
      const r = await app.ev(`${RAND}()`);
      if (r.fout) { toets('tekstgrootte ' + g.toUpperCase() + ': meetbaar', false, r.fout); continue; }
      toets('tekstgrootte ' + g.toUpperCase() + ' (zoom ' + r.zoom + '): werkscherm eindigt op ' +
            r.onder + 'px, balk begint op ' + r.grens + 'px',
            r.onder <= r.grens + 1,
            'de onderste ' + (r.onder - r.grens) + 'px liggen achter de navigatiebalk — ' +
            'daar zit onder meer de knop "start analyse" na het verbinden (#192)');
      // En de andere kant op: veel te kort is ook fout. Bij S bleef er 59px
      // ongebruikt, en dat is schermruimte die je op een telefoon niet hebt.
      // Marge 4px en niet ruimer: een --pl-sab die de zoom NIET meerekent
      // reserveert bij L 54px voor een balk van 48, en dat verschil van ~6px
      // is precies wat hier doorheen zou glippen.
      toets('tekstgrootte ' + g.toUpperCase() + ' vult het scherm ook echt',
            r.grens - r.onder <= 4,
            (r.grens - r.onder) + 'px ongebruikt onder het werkscherm');
    }

    /* De vellen bij L. Ze bleken bij het meten niet stuk — een fixed element
       met inset:0 rekent de zoom zelf goed in — maar dat is een uitkomst van
       de meting en geen eigenschap die vastligt. Zonder deze ronde zou een
       volgende hoogteregel in een vel bij L stil kunnen omvallen. */
    console.log('\n2g. Dezelfde dertien vellen op tekstgrootte L');
    await app.ev(`setUiScale('l'); true`);
    for (const v of VELLEN) await keurVel(app, v, 'L', SLUIT_VEL);
    for (const v of REMOTE_VELLEN) await keurVel(app, v, 'L', SLUIT_REMOTE);

    /* TEGENPROEF OP 2f. Zonder dit bewijst het blok hierboven alleen dat er
       getallen uit komen. We zetten de regel terug die #192 wás — de
       overschrijfregel die de basisregel omzeilde — en dan hoort L rood te
       worden. Blijft hij groen, dan meet 2f de verkeerde maat. */
    await app.ev(`(function(){
      const st = document.createElement('style'); st.id = 'plProefOudeL';
      st.textContent = 'body.uiL .app{ height:calc(100vh - 42px); min-height:calc(100vh - 42px); }';
      document.head.appendChild(st); return true; })()`);
    await rust(150);
    const terug = await app.ev(`${RAND}()`);
    toets('met de oude uiL-regel terug valt de onderrand er wél uit (tegenproef)',
          !terug.fout && terug.onder > terug.grens + 1,
          'werkscherm op ' + terug.onder + 'px, balk op ' + terug.grens +
          'px — 2f meet dan niet wat het zegt te meten');
    await app.ev(`(function(){ const e=document.getElementById('plProefOudeL'); if(e) e.remove(); return true; })()`);
    await app.ev(`setUiScale('m'); true`);
    await rust(150);

    console.log('\n3. Tegenproef — meet deze proef werkelijk iets?');

    /* EERST DE WACHTREGEL ZELF (#168). De rest van dit blok toetst of de
       MARGES iets voorstellen; dit toetst of de MEETING dat doet. Zonder deze
       controle is een wachtregel die stilletjes niets meer doet onzichtbaar —
       en dan komt de flake van 09-09 en 10-09 gewoon terug.

       Het geval dat onderscheidt: meet hetzelfde vel meteen na het openen,
       zónder de animatie uit te zitten. Komt daar dezelfde maat uit als na het
       wachten, dan zat er niets te wachten en zegt `wachtTotVelStaat()` niets.
       De PID-recorder is hier het vel bij uitstek — hij droeg de fout in alle
       drie de rondes. */
    await app.ev(`(function(){ const o=document.getElementById('pidRecOv'); if(o) o.remove(); return true; })()`);
    await app.ev('openPidRecorder(); true');
    const animTijdens = await app.ev(`${METER}('pidRecOv')`);
    const animStil = await wachtTotVelStaat(app, 'pidRecOv');
    const animNa = await app.ev(`${METER}('pidRecOv')`);
    const anim = await wachtAnimatiesKlaar(app, 'pidRecOv');

    toets('de browser meldt animaties op het vel — daar valt dus op te wachten',
      !anim.fout && typeof anim.n === 'number',
      'getAnimations() gaf: ' + (anim.fout || 'geen bruikbaar antwoord'));

    // Meet je midden in de animatie, dan staat het vel LAGER: minder ruimte
    // onder de knop. Is dat verschil er niet, dan meet blok 2 een vel dat toch
    // al stilstond en bewijst de wachtregel niets.
    const verschil = (animTijdens && !animTijdens.fout && animNa && !animNa.fout)
      ? animNa.ruimteOnder - animTijdens.ruimteOnder : null;
    toets('meteen meten geeft een ándere maat dan meten na de animatie',
      verschil !== null && verschil > 0,
      verschil === null ? 'een van beide metingen mislukte'
        : 'tijdens ' + animTijdens.ruimteOnder + 'px, erna ' + animNa.ruimteOnder +
          'px — geen verschil, dus er viel niets te wachten en de wachtregel is niet getoetst');
    if (verschil !== null && verschil > 0)
      console.log('      tijdens de animatie ' + animTijdens.ruimteOnder + 'px, uitgeschoven ' +
                  animNa.ruimteOnder + 'px — precies het verschil dat drie rondes lang als bevinding las');
    if (typeof animStil === 'number' && animNa && !animNa.fout)
      toets('en na het wachten staat het vel stil',
        animStil === (await app.ev(`${TEKSTMETER}('pidRecOv')`)).ruimteOnder,
        'de maat verschuift nog steeds na wachtTotVelStaat()');
    await app.ev(`(function(){ const o=document.getElementById('pidRecOv'); if(o) o.remove(); return true; })()`);
    /* Het Run-venster eerst, want dat is de reparatie van deze ronde en de
       enige die alleen op het korte scherm te meten is. De onderrand terug op
       de vaste 16px van vóór #144 — de padding zoals hij was, zonder
       --pl-sab. Blijft de tekstmaat dan groen, dan bewijst blok 2d niets.

       Let op dat dit de TEKSTmaat is en niet de knopmaat: met de oude padding
       stond de laagste knop op 65px en dus ruim boven de balk. Die maat zou
       hier groen blijven, en precies daarom liet de vorige ronde dit lopen. */
    await app.ev(`openRunPaneel(); true`);
    await wachtTotVelStaat(app, 'runOv');
    const runVoor = await app.ev(`${TEKSTMETER}('runOv')`);
    await app.ev(`(function(){ document.getElementById('runOv').style.paddingBottom = '16px'; return true; })()`);
    const runNa = await app.ev(`${TEKSTMETER}('runOv')`);
    const runKnop = await app.ev(`${METER}('runOv')`);
    toets('zonder --pl-sab valt de onderste regel van het Run-venster achter de balk: ' + runNa.ruimteOnder + 'px',
          runNa.ruimteOnder < NAVBALK,
          'met de vaste 16px bleef er ' + runNa.ruimteOnder + 'px over — dan meet blok 2d de marge niet');
    toets('en de marge scheelde ook echt iets: ' + runVoor.ruimteOnder + 'px → ' + runNa.ruimteOnder + 'px',
          runVoor.ruimteOnder > runNa.ruimteOnder,
          'mét marge ' + runVoor.ruimteOnder + 'px, zonder ' + runNa.ruimteOnder + 'px');
    toets('en de laagste KNOP bleef daarbij vrij (' + runKnop.ruimteOnder + 'px) — de knopmaat alleen ziet dit niet',
          runKnop.ruimteOnder >= NAVBALK,
          'de knop viel hier óók achter de balk; dan toont deze tegenproef niet ' +
          'waarom de tekstmaat erbij moest');
    await app.ev(`(function(){ const e = document.getElementById('runOv');
      if (e) { e.style.paddingBottom = ''; e.style.display = 'none'; } return true; })()`);

    /* Terug naar het ruime toestel: de tegenproeven hieronder zijn op 412x915
       nagemeten en dragen getallen uit die meting. */
    await app.venster(412, 915);
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
      await wachtTotVelStaat(app, t.id);
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
