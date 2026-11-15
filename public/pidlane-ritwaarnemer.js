// ══════════════════════════════════════════════════════════════════
// pidlane-ritwaarnemer.js — PLBudget, PLRit en de gat-duidingen
// ──────────────────────────────────────────────────────────────────
// Verplaatst uit pidlane-testrun.js op 15-11-2026 (#690), zonder wijziging.
// Ze draaien vanaf het laden, ook zonder testrun, en klantpaden lezen ze:
// PLAanlevering stuurt de meetgaten naar de AI, de pollus leest PLBudget, de
// meetopdrachten lezen PLRit. Daarom laden ze bij elke start; de testrun zelf
// hoeft dat niet. Laadt vóór pidlane-testrun.js.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// HET POLLBUDGET-SPOOR — meet mee, regelt niets
// ══════════════════════════════════════════════════════════════════
// PLAN.md punt 2: de regelkring schroeft het tempo terug op bezetting alleen,
// óók bij 0% fouten en vlakke responstijden. Gemeten op 17-08: 30% → 22% → 17%
// bij fout 0% en 124 ms. Het vermoeden is dat bezetting op deze bus geen bewijs
// van tegendruk is — bezetting is aanvraagtempo × responstijd, dus bij continu
// pollen per definitie hoog.
//
// Dit is een VERMOEDEN, en de wijziging zelf is sessie 2. Wat hier staat meet
// alleen: elke twee seconden een monster van PLBus.stats() en PLLoad.staat(),
// in een ring. PLLoad wordt NIET aangeraakt en niet gewrapt — de beslissing die
// PLLoad nam wordt achteraf gereconstrueerd uit zijn eigen drempels. Wijkt de
// reconstructie af van wat _mult werkelijk deed, dan is dát de bevinding.
//
// Waarom een eigen sampler en niet gewoon de BT-log: PLLoad logt pas bij een
// stap van 0,2. De trage terugloop zet stapjes van 0,03 en de spiraal bestaat
// juist uit die kleine stapjes. Die zijn in de log onzichtbaar.
//
// Draait vanaf het laden, ook zonder testrun — een spiraal ontstaat over een
// rit, niet in de twee minuten dat de run loopt.
const PLBudget = (function () {
  const MAX = 1800;                  // 2 s × 1800 = één uur
  let ring = [];
  let _aan = false;

  function monster() {
    try {
      if (typeof connected === 'undefined' || !connected) return;
      if (typeof demoMode !== 'undefined' && demoMode) return;
      if (!window.PLBus || typeof PLBus.stats !== 'function') return;
      if (!window.PLLoad || typeof PLLoad.staat !== 'function') return;
      const s = PLBus.stats();
      const st = PLLoad.staat();
      ring.push({
        t: Date.now(),
        mult: st.mult,
        tempo: st.tempoPct,
        bezet: s.belasting,
        fout: s.foutPct,
        ms: s.venGemMs,
        perSec: s.perSec,
        // De testrun belast de bus zelf: de sweep vraagt 50 PIDs achter elkaar
        // op, blok 6 pookt vijf keer in een dode PID, blok 8 vraagt er drie op
        // die gegarandeerd NO DATA geven. Op 20-08 leverde dat een foutpiek van
        // 82% op in een spoor dat over normaal rijden hoort te gaan.
        // Markeren in plaats van weglaten: het onderscheid is de informatie, en
        // een gat in de reeks is lastiger te lezen dan een gemarkeerd monster.
        run: !!_trBezig
      });
      if (ring.length > MAX) ring.splice(0, ring.length - MAX);
    } catch (e) {
      // Bewust stil: dit is een waarnemer op vreemde objecten, en een fout hier
      // mag nooit de rit verstoren. Dat de sampler leeft is aan het aantal
      // monsters te zien; staat dat op 0, dan meldt blok 7 dat.
    }
  }

  function start() {
    if (_aan) return;
    _aan = true;
    // Meettimer (PLRust.meet, #691): alleen in beeld of met een verbinding.
    if (window.PLRust) PLRust.meet(2000, monster, 'testrun-belasting'); else setInterval(monster, 2000);
  }

  // De drempels uit PLLoad zelf halen, niet overschrijven. Anders meet dit blok
  // straks tegen verouderde getallen zodra sessie 2 ze verzet.
  function drempels() {
    const c = (window.PLLoad && PLLoad.cfg) ? PLLoad.cfg : {};
    return {
      bezetOp: c.bezetOp == null ? 85 : c.bezetOp,
      bezetAf: c.bezetAf == null ? 55 : c.bezetAf,
      foutOp: c.foutOp == null ? 10 : c.foutOp,
      traagMs: c.traagMs == null ? 400 : c.traagMs,
      kalmFoutPct: c.kalmFoutPct == null ? 5 : c.kalmFoutPct
    };
  }

  /* Welke tak zou PLLoad.tick() bij dit monster gekozen hebben?

     HERZIEN OP 02-09-2026 (#76). Hier stond een eigen kopie van die
     beoordeling, en die kopie was blijven staan op de regel van vóór 23-08:
     `bezet >= bezetOp || fout >= foutOp`. Precies de OF die toen uit PLLoad is
     gehaald, met een lang blok commentaar erboven waarom bezetting alléén geen
     tegendruk is. De spiegel is niet meeverhuisd.

     Wat dat kostte: blok 7 meldde over de rit van 01-09 "Tijd per zone: druk
     87%, ruim 10%, kalm 3%" naast "Tempoverloop: start 100% → nu 100%" en
     "geen enkele stap omlaag". Die drie zijn alleen te rijmen als de
     zoneverdeling niet meet wat PLLoad doet — en dat was zo: met de echte
     regel (foutPct hoogstens 1%, venGemMs 193 tegen traagMs 400) was `druk`
     geen enkele keer waar. 0%, niet 87%. Het rapport las als een defecte
     regelkring die er niet was.

     Nu leent hij de beslissing bij PLLoad.zoneVan(), net zoals drempels()
     de getallen al bij PLLoad.cfg haalt in plaats van ze te herhalen.
     `venStijgt` heeft de vorige responstijd nodig; die staat per monster in
     het spoor, dus die geven we mee — vandaar de tweede parameter.

     Terugval als PLLoad ontbreekt: 'onbekend'. Bewust géén nabouw van de
     regel, want dat is precies hoe deze bug ontstond. Blok 7 meldt dan dat de
     zoneverdeling niet te bepalen was, en dat is eerlijker dan een getal. */
  function zone(m, vorigMs) {
    if (!window.PLLoad || typeof PLLoad.zoneVan !== 'function') return 'onbekend';
    const s = { belasting: m.bezet, foutPct: m.fout, venGemMs: m.ms };
    const vorig = (typeof vorigMs === 'number') ? vorigMs : null;
    // De multiplier van dat moment hoort erbij: PLLoad rekent 'kalm' alleen
    // als er nog iets te winnen valt (_mult > MIN). Stond hij de hele rit op
    // 1,0, dan is 'kalm' onbereikbaar — en dat is informatie, geen gebrek.
    try { return PLLoad.zoneVan(s, vorig, m.mult); }
    catch (e) { console.warn('PLLoad.zoneVan() klapte op een spoormonster', e); return 'onbekend'; }
  }

  function mediaan(a) {
    if (!a.length) return 0;
    const s = a.slice().sort(function (x, y) { return x - y; });
    const h = Math.floor(s.length / 2);
    return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2);
  }

  return {
    start: start,
    spoor: function () { return ring.slice(); },
    aantal: function () { return ring.length; },
    zone: zone,
    drempels: drempels,
    mediaan: mediaan,
    wis: function () { ring = []; }
  };
})();
window.PLBudget = PLBudget;
try { PLBudget.start(); } catch (e) { console.warn('PLBudget niet gestart — het pollbudget-spoor voor PLAN.md punt 2 blijft dan leeg', e); }

// ══════════════════════════════════════════════════════════════════
// DE RITWAARNEMER (PLRit) — voor alles wat alleen een RIT kan beantwoorden
// ══════════════════════════════════════════════════════════════════
// 26-08-2026. Vier vragen staan al dagen open en geen van vieren is bij
// stilstand te beantwoorden:
//
//   raildruk 0123/0159   stonden een hele rit stil op 9900 — beweegt dat nu?
//   opruimregel          zes mislukkingen + vijf herkansingen kost >5 minuten
//   turbodetectie        vraagt MAP-monsters onder belasting
//   32 van de 55 PIDs    bewogen niet in 27 minuten rijden
//
// De testrun meet een MOMENT: hij vraagt elke PID één keer op en dat is het.
// Eén losse waarde van 10090 zegt niets over of de raildruk een half uur lang
// beweegt. Daar is een waarnemer voor nodig die de hele rit meeloopt, en dat is
// wat dit is — hetzelfde patroon als PLBudget hierboven: hij draait vanaf het
// laden, regelt niets, en de testrun leest hem achteraf uit (blok 14).
//
// Waarom niet pidHist gebruiken: die bewaart 120 monsters per PID. Op 1 Hz is
// dat twee minuten. Voor "bewoog deze sensor over de hele rit" heb je een
// accumulator nodig, geen venster.
//
// Tijdens een testrun wordt er NIET bemonsterd (_trBezig). De sweep vraagt 45
// PIDs achter elkaar op en blok 6 pookt in dode PIDs; die waarden horen niet in
// een beeld van "wat deed de auto tijdens het rijden".
const PLRit = (function () {
  const TIK = 5000;          // elke 5 s; een rit van 30 min = 360 tikken
  const GAT_MS = 20000;      // >20 s tussen twee tikken = de app lag stil
  let per = {};              // pid -> {n,tikken,gemist,min,max,laatst,veranderingen,tLaatsteVer,stempel}
  let start = 0, laatstT = 0, gaten = [], herverbindingen = 0;
  let laatstLoop = 0;        // wanneer de lus voor het laatst LIEP — #170, zie tik()
  let vorigVerbonden = null, _aan = false;
  let zonderBron = 0;        // tikken waarin er geen versheidsbron was (#74)
  let meetgaten = [], meetgatSinds = 0;   // #133, zie de uitleg bij tik() hieronder

  /* ── ÉÉN PID, ÉÉN TIK — de kern van #74 ──────────────────────────
     Tot 01-09 verhoogde deze lus `n` voor élke sleutel in `pidVals`. Dat is de
     bug: `pidVals` is een laatst-bekende-waarde-kaart zonder houdbaarheid. Hij
     wordt alleen geschreven door updPID() en alleen gewist bij het verbreken
     van de verbinding. Een PID die één keer gelezen is — door de
     gezondheidscheck bij het verbinden, door een eerdere sweep, door blok 6 —
     bleef daarna eeuwig "monsters" opleveren met nul veranderingen.

     Wat dat kostte: in de run van 01-09 meldden 0123 en 0159 evenveel monsters
     (56) als 010B, terwijl 010B er 390 busreads had en die twee nul. Blok 14
     noemde ze daarop "nog steeds bevroren tijdens het rijden — dit is een
     parser- of definitiefout". Ze waren simpelweg niet uitgevraagd. Op #19 is
     dezelfde meting drie keer gebruikt en één keer als sluitingsbewijs.

     De versheidsbron bestond al: updPID() zet `_pidLastUpd[pid]`. Verschuift
     dat stempel niet tussen twee tikken, dan is er niets gemeten — hoe vaak de
     waarde er ook staat.

     WAAROM DE EERSTE WAARNEMING NIET MEETELT. Bij de eerste tik waarin een PID
     opduikt is zijn stempel onbekend, en de waarde kan van minuten geleden
     zijn. Alleen een stempel dat VERSCHUIFT bewijst een leesbeurt binnen deze
     rit. Dat kost één meting per PID en dwaalt dus altijd de veilige kant op:
     liever "nog niet gemeten" dan een verzonnen monster.

     Los gehouden en naar buiten gebracht zodat test-rit.js hem zonder browser
     kan draaien, mét de oude stempelloze versie ernaast als tegenproef. */
  function neem(e, waarde, stempel, nu) {
    e.tikken++;
    if (typeof stempel !== 'number' || !isFinite(stempel)) { e.gemist++; return 'geen-stempel'; }
    if (e.stempel === stempel) { e.gemist++; return 'ongewijzigd'; }
    const eerste = (e.stempel === null);
    e.stempel = stempel;
    if (eerste) { e.gemist++; return 'eerste-waarneming'; }   // stempel bekend, meting nog niet bewezen
    if (e.n === 0) { e.n = 1; e.min = e.max = e.laatst = waarde; e.tLaatsteVer = nu; return 'gemeten'; }
    e.n++;
    if (waarde < e.min) e.min = waarde;
    if (waarde > e.max) e.max = waarde;
    if (waarde !== e.laatst) { e.veranderingen++; e.laatst = waarde; e.tLaatsteVer = nu; }
    return 'gemeten';
  }

  // nuOverride is er alleen voor de test (zie tik: hieronder). Zonder argument
  // is het gewoon Date.now().
  function tik(nuOverride) {
    try {
      const verbonden = !(typeof connected === 'undefined' || !connected);
      /* Herverbindingen tellen: dit is het signaal van de achtergrondkwestie
         (Android bevriest de WebView-timers). Ook tellen als we niet meten.

         HERZIEN OP 02-09-2026 (#77). Hier stond `if (vorigVerbonden === false
         && verbonden)`, met `vorigVerbonden` beginnend op null. PLRit.start()
         draait bij het laden van de app, dus de tikken vóór het verbinden
         zetten die vlag op false — en de eerste, volstrekt normale verbinding
         telde daarna als herverbinding. In de rit van 01-09 meldde blok 14
         "1 herverbinding" bij 0 gaten, terwijl er niets verbroken was: de app
         laadde om 22:25:53 en de SPP-verbinding kwam om 22:26:46.

         Dat is niet alleen een getal te veel. De regel eronder zegt "volgt elke
         herverbinding op een gat, dan is dat de achtergrondkwestie en niet de
         bus" — met 0 gaten en 1 herverbinding wijst die tekst je naar de bus of
         de adapter. Een gratis vals spoor in precies de meting die #18 moet
         beantwoorden.

         Nu blijft `vorigVerbonden` op null tot de EERSTE keer dat er verbinding
         is. Pas daarna kan false→true een herverbinding zijn. PLRit.wis() raakt
         deze vlag bewust niet aan: anders levert "Rit nulstellen" dezelfde
         valse telling opnieuw op. */
      if (verbonden) {
        if (vorigVerbonden === false) herverbindingen++;
        vorigVerbonden = true;
      } else if (vorigVerbonden !== null) {
        vorigVerbonden = false;
      }

      if (!verbonden) {
        /* Een lopend meetgat afsluiten op een échte onderbreking. Zodra
           `connected` false wordt is de oorzaak niet langer dubbelzinnig —
           dat hoort bij het loopgat/de herverbinding hierboven, niet bij het
           meetgat hieronder. Zonder dit zou een meetgat dat overgaat in een
           formele disconnect nooit afgesloten worden. */
        if (meetgatSinds) {
          meetgaten.push({ van: meetgatSinds, tot: laatstT, s: Math.round((laatstT - meetgatSinds) / 1000) });
          meetgatSinds = 0;
        }
        return;
      }
      const nu = (typeof nuOverride === 'number') ? nuOverride : Date.now();

      /* EEN TIK DIE WIJ ZELF OVERSLAAN IS GEEN GAT (10-09-2026, #170).

         Deze twee guards slaan het bemonsteren over omdat wij dat willen: in
         demo zijn de waarden verzonnen, en tijdens een testrun vraagt de sweep
         45 PIDs achter elkaar op. De LUS liep daar gewoon door — hij besloot
         alleen niets te meten. Tot vandaag returnden ze vóór `laatstT = nu`, en
         dan zag de eerstvolgende tik ná de run een gat ter grootte van die hele
         run staan. Nagemeten met een run van 70 s: één loopgat van 75 s.

         Dat is geen cosmetisch getal. Blok 14 legt elk loopgat naast
         PLAchtergrond, en zo'n zelfgemaakt gat valt buiten elke
         achtergrondperiode — waarna er in het verslag van 10-09 stond: "de lus
         lag daar stil terwijl de app in beeld stond … kijk naar de adapter, de
         bus of een vastgelopen sweep." Precies de verkeerde jacht.

         `laatstLoop` houdt daarom bij wanneer de lus voor het laatst LIEP, en
         daar meet het loopgat tegen. `laatstT` blijft wat het was — de laatste
         tik waarin er werkelijk bemonsterd is — want dat is de klok waar het
         meetgat zijn einde aan ontleent, en tijdens een run weten we juist
         niets over de datastroom.

         DE VERBROKEN VERBINDING HIERBOVEN IS BEWUST NIET MEEGENOMEN. Ook daar
         loopt de lus door, dus strikt genomen is dat óók geen loopgat. Maar een
         onderbreking van tien minuten zou dan alleen nog als "1 herverbinding"
         zichtbaar zijn, en dat is minder dan er nu staat. Dat vraagt een eigen
         soort gat en een eigen meting; zie #170. */
      const zelfOvergeslagen = (typeof demoMode !== 'undefined' && demoMode) ||
                               (typeof _trBezig !== 'undefined' && _trBezig);
      if (zelfOvergeslagen) { laatstLoop = nu; return; }
      if (typeof pidVals === 'undefined' || !pidVals) return;

      if (!start) start = nu;
      // Een gat betekent dat deze lus zelf niet liep — precies het bewijs uit de
      // rit van 23-08 (het logboek zweeg op dezelfde kloktijden).
      let loopgatNu = false;
      if (laatstLoop && (nu - laatstLoop) > GAT_MS) {
        gaten.push({ van: laatstLoop, tot: nu, s: Math.round((nu - laatstLoop) / 1000) });
        loopgatNu = true;
      }
      laatstT = nu; laatstLoop = nu;

      // De versheidsbron. Ontbreekt hij, dan wordt er NIET stilzwijgend
      // teruggevallen op de oude telling: dan is deze rit niet te beoordelen en
      // zegt blok 14 dat. Een terugval die "gewoon iets" meet is precies hoe
      // #74 vier ritten lang onzichtbaar bleef.
      const stempels = (typeof _pidLastUpd !== 'undefined' && _pidLastUpd) ? _pidLastUpd : null;
      if (!stempels) { zonderBron++; return; }

      let bekendeTik = 0, gemetenTik = 0;
      Object.keys(pidVals).forEach(function (p) {
        const v = pidVals[p];
        if (typeof v !== 'number' || !isFinite(v)) return;
        let e = per[p];
        const alBekend = !!e;
        if (!e) e = per[p] = { n: 0, tikken: 0, gemist: 0, min: v, max: v, laatst: v,
                               veranderingen: 0, tLaatsteVer: nu, stempel: null };
        const uitkomst = neem(e, v, stempels[p], nu);
        // Alleen PIDs die deze accumulator al eerder zag tellen mee als
        // bewijs. Bij hun EERSTE waarneming kan neem() per definitie nooit
        // 'gemeten' teruggeven (zie de uitleg boven neem()), en dan zou de
        // openingstik van elke rit zelf al als meetgat gelden.
        if (alBekend) {
          bekendeTik++;
          if (uitkomst === 'gemeten') gemetenTik++;
        }
      });

      /* MEETGAT NAAST LOOPGAT (10-09-2026, #133). Een loopgat hierboven
         betekent dat de lus zelf niet tikte (Android bevriest de WebView-
         timers). Dat is niet wat er gebeurde op de rit van 10-09: een
         BT-SPP-socket sterft niet als de adapter zijn voeding verliest, dus
         `connected` bleef de volle 39 s true en de lus tikte gewoon door om
         de 5 s. Wat stilviel was de data — geen enkele PID-stempel in
         `_pidLastUpd` verschoof — en PLRit.gaten() was daar blind voor: 0
         gaten, terwijl 28 van de 31 sensoren een gat in pidHist had.

         Geen nieuwe bron nodig: neem() telt dat al per PID op in `gemist`.
         Een tik waarin elke al bekende PID `gemist` oplevert (dus geen
         enkele 'gemeten') is een meetgat. Opeenvolgende meetgat-tikken worden
         tot één interval samengevoegd, net als bij `gaten`.

         EEN BEVRIEZING IS GEEN MEETGAT, en dat is de uitzondering hieronder.
         Bij een bevriezing staan de pollus en deze tiklus SAMEN stil — dat is
         wat bevriezen is. De eerste tik terug boekt hierboven terecht een
         loopgat, maar leest daarna stempels die nog van vóór de stilte zijn en
         zou dus ook een meetgat openen. Nagemeten: 90 s bevriezing gaf een
         loopgat van 90 s én een meetgat van 5 s, en blok 14 wijst je dan
         tegelijk naar de achtergrondkwestie en naar de bus. Dat is de vorm van
         #77 en #103 — één signaal te veel dat je de verkeerde kant op stuurt.
         Een lopend meetgat blijft op zo'n tik staan zoals het stond: deze tik
         weet niets over de data, dus hij opent en sluit er ook niets mee. */
      if (!loopgatNu) {
        if (bekendeTik > 0 && gemetenTik === 0) {
          if (!meetgatSinds) meetgatSinds = nu;
        } else if (meetgatSinds) {
          meetgaten.push({ van: meetgatSinds, tot: nu, s: Math.round((nu - meetgatSinds) / 1000) });
          meetgatSinds = 0;
        }
      }
    } catch (e) {
      // Bewust stil: een waarnemer op vreemde objecten mag de rit nooit
      // verstoren. Dat hij leeft is aan het monsteraantal te zien; staat dat op
      // 0, dan meldt blok 14 dat en niet deze catch.
    }
  }

  function start_() {
    if (_aan) return;
    _aan = true;
    // Meettimer (PLRust.meet, #691): alleen in beeld of met een verbinding.
    if (window.PLRust) PLRust.meet(TIK, tik, 'testrun-rit'); else setInterval(tik, TIK);
  }

  return {
    start: start_,
    // Bewust naar buiten: anders is de accumulator alleen te toetsen door vijf
    // seconden per monster te wachten, en dan wordt hij dus niet getoetst. Met
    // een klok-parameter kan test-rit.js een rit van een half uur in een paar
    // milliseconden naspelen. In de app roept niemand dit aan; het interval doet
    // het werk.
    tik: function (nuOverride) { return tik(nuOverride); },
    // Idem voor de kern van #74: los toetsbaar, inclusief de tegenproef.
    _neem: neem,
    per: function () { return JSON.parse(JSON.stringify(per)); },
    gaten: function () { return gaten.slice(); },
    // Een lopend meetgat (de adapter is NU weg) hoort er ook in te staan,
    // anders zegt blok 14 pas iets zodra de adapter terugkomt.
    meetgaten: function () {
      const lijst = meetgaten.slice();
      if (meetgatSinds) lijst.push({ van: meetgatSinds, tot: laatstT, s: Math.round((laatstT - meetgatSinds) / 1000) });
      return lijst;
    },
    herverbindingen: function () { return herverbindingen; },

    /* Een herverbinding MELDEN in plaats van hem uit `connected` afleiden.
       (#103, 03-09-2026)

       tik() leest `connected` als momentopname. Een socket die tussen twee
       tikken sterft en herstelt is daarmee onzichtbaar, en dat is precies wat
       er op 02-09 gebeurde: het app-log heeft om 23:18:05 "SPP automatisch
       herverbonden" staan met een volledige ELM-init erachteraan, en zowel
       blok 5 als blok 14 meldden `0 herverbinding(en) bij 1 gat(en)`.

       Dat is niet één getal te weinig. De regel eronder zegt "volgt elke
       herverbinding op een gat, dan is dat de achtergrondkwestie en niet de
       bus" — met nul herverbindingen valt er niets te volgen en leest het gat
       als een zuivere bevriezing. Spiegelbeeld van #77, dat er juist één te
       veel telde en je naar de bus stuurde.

       sppReconnectGuard weet zéker dát het gebeurde. Die zekerheid is beter dan
       elke bemonstering, hoe vaak je ook kijkt.

       DUBBELTELLEN VOORKOMEN. Zag tik() de onderbreking óók (vorigVerbonden is
       dan false), dan telt hij hem bij de eerstvolgende tik zelf al. In dat
       geval doet deze melding niets — anders staat er twee waar er één was, en
       dan hebben we #77 teruggebouwd aan de andere kant. */
    meldHerverbinding: function (bron) {
      if (vorigVerbonden === false) return false;   // tik() heeft de val gezien en telt hem zelf
      herverbindingen++;
      vorigVerbonden = true;
      try { if (typeof btDiag === 'function') btDiag('PLRit telt een herverbinding (' + (bron || 'onbekend') + ')', 'info'); }
      catch (e) { console.warn('PLRit: herverbinding wel geteld, niet gemeld in de BT-log', e); }
      return true;
    },
    // Was er een versheidsbron? Zo niet, dan is er niets gemeten en hoort
    // blok 14 dat te zeggen in plaats van nullen te presenteren als uitkomst.
    bron: function () {
      return { stempels: (typeof _pidLastUpd !== 'undefined' && !!_pidLastUpd), zonderBron: zonderBron };
    },
    duurS: function (nuOverride) {
      const nu = (typeof nuOverride === 'number') ? nuOverride : Date.now();
      return start ? Math.round((nu - start) / 1000) : 0;
    },
    // Het hoogste aantal ECHTE metingen van één PID. Was tot 01-09 het aantal
    // tikken, en dat was hetzelfde getal voor een PID met 390 busreads als voor
    // een PID met nul (#74).
    monsters: function () {
      let n = 0; Object.keys(per).forEach(function (p) { if (per[p].n > n) n = per[p].n; }); return n;
    },
    tikken: function () {
      let n = 0; Object.keys(per).forEach(function (p) { if (per[p].tikken > n) n = per[p].tikken; }); return n;
    },
    // Hoeveel PIDs zijn deze rit daadwerkelijk uitgevraagd, en welke stonden er
    // alleen in het geheugen? Dat verschil is de hele bevinding van #74.
    dekking: function () {
      const uit = { gemeten: [], eenmalig: [], nietGemeten: [] };
      Object.keys(per).forEach(function (p) {
        if (per[p].n >= 2) uit.gemeten.push(p);
        else if (per[p].n === 1) uit.eenmalig.push(p);
        else uit.nietGemeten.push(p);
      });
      return uit;
    },
    // Zet de teller op nul aan het begin van een rit, zodat het beeld over déze
    // rit gaat en niet over alles sinds het opstarten van de app.
    wis: function () { per = {}; start = 0; laatstT = 0; laatstLoop = 0; gaten = []; herverbindingen = 0; zonderBron = 0;
                       meetgaten = []; meetgatSinds = 0; }
  };
})();

/* ELK GAT TOEWIJZEN IN PLAATS VAN HET TOE TE SCHRIJVEN (08-09-2026, #18).

   In blok 14 stond "een gat betekent dat de meetlus zelf niet liep (Android
   bevriest WebView-timers op de achtergrond)". Het eerste deel is waar — een
   gat IS een lus die niet liep. Het tweede is een OORZAAK, en die werd aan élk
   gat toegekend zonder ernaar te kijken. Een gat door een dode adapter, een
   vastgelopen sweep of een trage bus las precies hetzelfde, en dat stuurt je
   op de verkeerde jacht.

   PLAchtergrond weet welke perioden de app werkelijk weg was. Valt een gat
   binnen zo'n periode, dan is het de achtergrondkwestie; valt het erbuiten,
   dan lag de lus stil terwijl de app gewoon in beeld stond — en dat is een
   heel ander en veel interessanter probleem.

   `perioden` is NULL als PLAchtergrond er niet is. Dat is met opzet iets
   anders dan een lege lijst: geen module betekent "niet te zeggen", een lege
   lijst betekent "gemeten, en de app was niet weg". Die twee als hetzelfde
   lezen is dezelfde fout als stil=0 tegen stil=null in pidlane-achtergrond.js.

   Los gehouden en naar buiten gebracht omdat blok 14 zelf een halve testrun
   nodig heeft om te draaien, en een oordeel dat alleen in de auto te toetsen
   is, wordt niet getoetst. test-gatduiding.js draait hem zonder browser. */
/* DE SPLITSING ZELF, ÉÉN KEER (10-09-2026, #170). Loopgaten kregen sinds
   08-09 hun duiding tegen PLAchtergrond; meetgaten kregen tot vandaag alleen
   een duur. Op de rit van 10-09 stond er daardoor `Meetgaten: 15 s, 35 s, 75 s`
   zonder dat te zien was welke daarvan de adapter was en welke de achtergrond.

   Dat is geen cosmetisch verschil: tijdens een AFGEKNEPEN achtergrond (gemeten
   op die rit: 146 s weg, waarvan 60 s doorgelopen en 86 s stil) blijft de lus
   tikken zonder loopgat te boeken, maar ververst de data niet. Er opent dan een
   meetgat, en de regel eronder wees dat toe aan "de adapter of de bus" —
   dezelfde verwisseling van #18 met de bus die het meetgat juist moest
   wegnemen.

   De overlapregel staat daarom op één plek. Twee plekken met dezelfde regel is
   in dit project al drie keer een bug geweest, en de duiding eronder verschilt
   nu juist per soort gat: een loopgat in de achtergrond is de bevriezing, een
   meetgat in de achtergrond is de afknijping. */
function _plGatenSplits(gaten, perioden) {
  var g = gaten || [];
  // Twee tikken speling: PLRit meet van tik tot tik, PLAchtergrond van
  // gebeurtenis tot gebeurtenis. Die randen vallen nooit precies samen.
  var SPELING = 12000;
  var kent = !!perioden;
  var inBg = function (x) {
    return kent && perioden.some(function (b) { return x.van >= b.van - SPELING && x.tot <= b.tot + SPELING; });
  };
  return {
    g: g,
    kent: kent,
    buiten: kent ? g.filter(function (x) { return !inBg(x); }) : [],
    lijst: g.slice(0, 5).map(function (x) { return x.s + ' s' + (inBg(x) ? ' (app weg)' : ''); }).join(', ')
  };
}

function plGatDuiding(gaten, perioden) {
  var sp = _plGatenSplits(gaten, perioden);
  var g = sp.g, kent = sp.kent, buiten = sp.buiten, lijst = sp.lijst;
  var duiding = !kent
    ? ' — PLAchtergrond ontbreekt, dus er valt niet te zeggen wélke gaten van de achtergrond kwamen.'
    : !g.length
      ? ''
      : !buiten.length
        ? ' — alle gaten vallen binnen een periode waarin de app aantoonbaar weg was: dat is #18 en niet de bus.'
        : ' — ' + buiten.length + ' van de ' + g.length + ' gaten vielen BUITEN elke achtergrondperiode (grootste ' +
          buiten.reduce(function (a, x) { return Math.max(a, x.s || 0); }, 0) + ' s). De lus lag daar stil terwijl de app ' +
          'in beeld stond, en dat is #18 niet — kijk naar de adapter, de bus of een vastgelopen sweep.';
  return { lijst: lijst, buiten: buiten, duiding: duiding };
}

/* Hetzelfde, maar voor het MEETGAT — de lus tikte, de data niet (#133/#170).
   De kanten wisselen hier van betekenis: valt een meetgat binnen een periode
   waarin de app weg was, dan is het de afgeknepen achtergrond (#18) en niet de
   bus; valt het erbuiten, dan stond de app gewoon in beeld en kwam er tóch
   niets binnen — en dát is de adapter of de bus. */
function plMeetgatDuiding(meetgaten, perioden) {
  var sp = _plGatenSplits(meetgaten, perioden);
  var g = sp.g, kent = sp.kent, buiten = sp.buiten, lijst = sp.lijst;
  var duiding = !g.length
    ? ''
    : !kent
      ? ' — PLAchtergrond ontbreekt, dus er valt niet te zeggen wélke meetgaten van de achtergrond kwamen.'
      : !buiten.length
        ? ' — alle meetgaten vallen binnen een periode waarin de app weg was: dan is dit de afgeknepen ' +
          'achtergrond (#18) en niet de bus.'
        : ' — ' + buiten.length + ' van de ' + g.length + ' meetgaten vielen BUITEN elke achtergrondperiode ' +
          '(grootste ' + buiten.reduce(function (a, x) { return Math.max(a, x.s || 0); }, 0) + ' s). De app stond ' +
          'in beeld en de lus tikte, en er kwam tóch niets binnen: dat is de adapter of de bus (#133).';
  return { lijst: lijst, buiten: buiten, duiding: duiding };
}
/* IS DE ONDERRAND BEREIKBAAR, OF LIGT HIJ VAST ACHTER DE BALK? (10-09-2026, #172)

   De proef die dit gebruikt meldde vanaf 01-09 elke rit FOUT: "#appGrid loopt
   door tot onder de navigatiebalk". Op 10-09 zei de bestuurder in dezelfde
   sessie "Alles vrij — er valt niets weg", en dat was het antwoord waar die
   proef zelf om vroeg.

   Dat #appGrid LANGER is dan het scherm is op ≤760px met opzet zo: `.app`
   krijgt daar `height:auto` en de pagina scrollt. De oude regel mat of het
   element binnen de vouw paste; de vraag is of een mens bij de onderste regel
   kan. Op een pagina die scrollt vallen die twee nooit samen, en dan is de
   melding altijd waar en nooit iets waard — precies de "test die altijd rood
   staat" uit CLAUDE.md.

   De scrollruimte is wat het onderscheid maakt. Kun je nog `rest` pixels
   omlaag, dan komt de onderrand `rest` omhoog. Wat dán nog achter de balk
   staat, staat er vast — en dát is #58.

   Los gehouden en naar buiten gebracht omdat het oordeel zonder browser te
   toetsen hoort te zijn: de DOM-kant (welke maten) blijft in de proef, de
   regel (wat betekenen ze) staat hier. */
function plOnderrandOordeel(onder, grens, scrollRest) {
  var tekort = onder - grens;                       // wat er nu achter de balk zit
  var rest = Math.max(0, scrollRest || 0);          // hoeveel er nog te scrollen valt
  var vast = tekort - rest;                         // wat er ook uitgescrold blijft staan
  var maat = 'werkscherm eindigt op ' + Math.round(onder) + ' van ' + Math.round(grens) + 'px';
  if (tekort <= 1)
    return { ok: true, tekort: tekort, rest: rest, vast: vast, tekst: maat + ' — past binnen het scherm' };
  if (vast <= 1)
    return { ok: true, tekort: tekort, rest: rest, vast: vast,
             tekst: maat + ' — loopt ' + Math.round(tekort) + 'px door onder de balk, maar er is nog ' +
                    Math.round(rest) + 'px scrollruimte: bereikbaar' };
  return { ok: false, tekort: tekort, rest: rest, vast: vast,
           tekst: maat + ' — ' + Math.round(vast) + 'px blijft achter de navigatiebalk staan, ook volledig ' +
                  'uitgescrold (' + Math.round(tekort) + 'px eronder, ' + Math.round(rest) + 'px scrollruimte)' };
}

/* Hoeveel er onder een element nog weg te scrollen valt. De pagina zelf kan
   scrollen, maar ook een bak eromheen — welke van de twee het is, verschilt
   per scherm, dus we nemen de ruimste. */
function _plScrollRestOnder(el) {
  var rest = 0;
  var doc = document.scrollingElement || document.documentElement;
  if (doc) rest = Math.max(rest, doc.scrollHeight - doc.clientHeight - doc.scrollTop);
  for (var n = el; n && n !== document.body; n = n.parentElement) {
    var ov = '';
    try { ov = getComputedStyle(n).overflowY; }
    catch (e) { console.warn('overflowY onleesbaar bij het meten van de scrollruimte', e); continue; }
    if (ov === 'auto' || ov === 'scroll')
      rest = Math.max(rest, n.scrollHeight - n.clientHeight - n.scrollTop);
  }
  return rest;
}

window.plGatDuiding = plGatDuiding;
window.plMeetgatDuiding = plMeetgatDuiding;
window.plOnderrandOordeel = plOnderrandOordeel;
// Ook de meetkant naar buiten: welke bak er scrollt is een DOM-vraag, en die
// is alleen in een echte browser te beantwoorden (bproef-schermranden.js).
window._plScrollRestOnder = _plScrollRestOnder;
window.PLRit = PLRit;
try { PLRit.start(); } catch (e) { console.warn('PLRit niet gestart — blok 14 (de rit) blijft dan leeg', e); }
