// ══════════════════════════════════════════════════════════════════
// pidlane-achtergrond.js — één eigenaar voor "de app was weg"
// ──────────────────────────────────────────────────────────────────
// DE BEVINDING (#18). Android bevriest de JS-timers van een WebView zodra de
// app naar de achtergrond gaat. Pollus, recorder en logger stoppen dan
// tegelijk. Op 02-09-2026 om 22:04 is dat voor het eerst met opzet
// nagemeten: twee minuten weg, en de meetlus stond 190 seconden stil.
//
// Dit bestand REPAREERT die bevriezing niet — dat is native werk (richting 1
// in het issue: foreground service plus wake lock). Het doet richting 2: de
// app weet voortaan DAT hij weg was, hoe lang, en komt met opzet terug in
// plaats van er per ongeluk achter te komen.
//
// WAAROM DAT MEER IS DAN COSMETIEK. Uit het log van 23-08: de app hervat om
// 23:31:00 en meldt zestien seconden later "socket dood na 012E1". Android
// had de socket intussen opgeruimd, maar dat bleek pas toen de pollus er een
// commando in probeerde te schrijven. Die zestien seconden zijn rommel: de
// ELM-interpreter staat dan in een andere staat dan de app denkt. Nu wordt de
// socket bij terugkomst nagekeken vóórdat het volgende commando eroverheen
// gaat.
//
// WAAROM HET EEN EIGEN MODULE IS. Er stonden vijf visibilitychange-luisteraars
// in de app — btflow, bulk, fuel, koopcheck, neon en rit — en die weten niets
// van elkaar. Elk van de vijf beslist voor zichzelf wat "de app ging weg"
// betekent, en geen van de vijf legt het gat vast. Dat is precies het patroon
// dat CLAUDE.md verbiedt met "één ding heeft één betekenis". Die vijf blijven
// staan (ze doen hun eigen werk: flushen, pauzeren), maar het OORDEEL over de
// onderbreking hoort op één plek, en dat is hier.
//
// De testrun leest deze lijst in blok 5 en blok 14, en vergelijkt hem met de
// gaten die PLRit uit zijn eigen tikken afleidt. Wijzen die twee dezelfde
// kant op, dan klopt het beeld; lopen ze uiteen, dan is dat een bevinding.
//
// ──────────────────────────────────────────────────────────────────
// DE HARTSLAG — waarom deze module sinds 08-09-2026 méér doet dan klokken
//
// Tot 08-09 stond er één regel in het logboek: *"De app was 120 s weg — de
// meetlus stond in die tijd stil"*. Dat tweede deel is nooit gemeten. Deze
// module hangt aan `visibilitychange` en weet daarmee precies één ding: hoe
// lang de app onzichtbaar was. Of de meetlus in die tijd ook werkelijk
// stillag, weet hij niet — dat is een oordeel dat er stilzwijgend bij werd
// gezet.
//
// De rit van 02-09 om 23:22 liet zien dat dat oordeel fout kan zijn, en het
// app-log sprak de melding in dezelfde seconde zelf tegen. De app was 120 s
// weg, maar deed in de eerste ~36 s daarvan nog een volledige herverbinding
// mét ELM-init, zag een sensoruitval, startte een verificatie en rondde die
// af. Pas daarna heeft Android hem bevroren. De melding beweerde 120 s stil;
// werkelijk stil was ~84 s.
//
// DE OPLOSSING IS EEN HARTSLAG DIE ALLEEN LOOPT TERWIJL DE APP WEG IS. Elke
// seconde één tik die niets doet behalve `Date.now()` opschrijven. Vuurt hij,
// dan liep de lus; vuurt hij niet, dan lag hij stil. De grootste stilte
// tussen twee tikken IS de bevriezing — gemeten, niet aangenomen.
//
// Dat levert in één keer de vier getallen waar richting B van het issue om
// vraagt:
//
//   door    hoe lang de app na het verbergen nog doorliep (de aanlooptijd)
//   stil    hoe lang de meetlus werkelijk niets deed (de bevriezing)
//   na      liep hij daarna uit zichzelf weer? Dan was het THROTTLING en
//           geen bevriezing — Chromium knijpt een verborgen tab eerst af
//           naar één tik per minuut vóórdat Android het proces stilzet.
//           Zonder dit getal zijn die twee niet uit elkaar te houden, en ze
//           vragen om een andere oplossing.
//   slagen  hoe vaak de hartslag vuurde; nul betekent: meteen bevroren.
//
// EN DE KOSTEN. De hartslag loopt niet als de app in beeld is, want dan is er
// niets te meten. Eén setInterval van 1000 ms tijdens een vensterwissel is
// verwaarloosbaar naast de pollus (5 s) die op dat moment toch al draait —
// en juist die vergelijking is het punt: staat de hartslag stil, dan staat de
// pollus het ook.
//
// WAT DE HARTSLAG NIET KAN. Zijn eigen resolutie. Wordt hij afgeknepen naar
// één tik per minuut, dan is "de laatste tik" tot een minuut oud en is `stil`
// dus tot een minuut te ruim. Daarom wordt `slagen` meegeschreven: bij een
// normale hartslag zijn dat er ongeveer `door` stuks, en wijkt dat sterk af,
// dan is de meting grof en niet fijn. Startte de hartslag helemaal niet, dan
// staat `stil` op **null** en niet op nul — niet-gemeten is iets anders dan
// niet-gebeurd, en dat verschil is precies wat 08-09 kwam repareren.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Korter dan dit is een vensterwissel (de bestandskiezer, een melding), geen
  // bevriezing. Die zou de lijst vervuilen met ruis waar niets aan te zien is.
  var DREMPEL_MELDEN = 3000;
  // Vanaf hier de socket actief nakijken. Onder de tien seconden ruimt Android
  // de SPP-verbinding zelden op, en een controle kost een read op de adapter.
  var DREMPEL_SOCKET = 10000;
  var MAX = 50;
  // De hartslag. Eén seconde is fijn genoeg om de aanlooptijd van ~36 s uit
  // de rit van 02-09 te zien, en grof genoeg om niets te kosten.
  var HARTSLAG_MS = 1000;
  // Onder twee hartslagen is een "stilte" niet van de gewone speling van een
  // timer te onderscheiden. Die zou als bevriezing van één seconde in de lijst
  // komen te staan, en dan meet de teller ruis.
  var STIL_MINIMAAL = 2 * HARTSLAG_MS;

  var perioden = [];
  var _weg = 0;

  // ── de hartslagteller ───────────────────────────────────────────
  // Alles hieronder geldt voor ÉÉN afwezigheid en wordt bij heen() gewist.
  var _timer = null;       // het interval, alleen tijdens de afwezigheid
  var _aan = false;        // is de hartslag werkelijk gaan lopen?
  var _laatste = 0;        // wanneer vuurde hij voor het laatst
  var _slagen = 0;         // hoe vaak
  var _stilMs = 0;         // de grootste stilte tussen twee slagen
  var _stilVan = 0;        // en wanneer die stilte begon

  function _log(m, niveau) {
    try { if (typeof log === 'function') log(m, niveau || 'info'); }
    catch (e) { console.warn('achtergrondmelding niet in de app-log gezet', e); }
  }
  function _bt(m, niveau) {
    try { if (typeof btDiag === 'function') btDiag(m, niveau || 'info'); }
    catch (e) { console.warn('achtergrondmelding niet in de BT-log gezet', e); }
  }

  // De socket nakijken vóór het volgende commando. force blijft FALSE: de
  // guard doet dan eerst isConnected() en grijpt alleen in als de socket echt
  // dood is. Een gezonde verbinding wordt dus niet onnodig gesloopt — dat is
  // het verschil tussen nakijken en herstarten.
  function _socketNakijken(s) {
    try {
      if (typeof connected !== 'undefined' && !connected) return 'niet verbonden';
      var c = window._sppConn;
      if (!c || !c.spp) return 'geen SPP-verbinding';
      if (typeof sppReconnectGuard !== 'function') return 'sppReconnectGuard ontbreekt';
      Promise.resolve(sppReconnectGuard(c.spp, c.address, 'terug na ' + s + ' s achtergrond'))
        .catch(function (e) { console.warn('achtergrond: socketcontrole mislukt', e); });
      return 'socket nagekeken';
    } catch (e) {
      console.warn('achtergrond: socketcontrole niet gestart', e);
      return 'socketcontrole niet gestart';
    }
  }

  /* Eén hartslag. Hij doet met opzet niets anders dan opschrijven DAT hij
     vuurde: elke regel code hierin is een regel die zelf kan vastlopen, en dan
     meet de meter zijn eigen last in plaats van de bevriezing.

     De grootste stilte wordt hier bijgehouden en niet achteraf berekend, want
     achteraf is er niets meer om op terug te kijken — er zijn geen tikken
     bewaard, alleen de afstand ertussen. */
  function _slag() {
    var nu = Date.now();
    var d = nu - _laatste;
    if (d > _stilMs) { _stilMs = d; _stilVan = _laatste; }
    _laatste = nu;
    _slagen++;
    return nu;
  }

  /* De grootste stilte van deze afwezigheid, inclusief de staart.

     WAAROM DE STAART APART MEETELT. De hartslag stopt pas als terug() draait.
     Ontdooit Android de app een fractie vóór het visibilitychange-bericht, dan
     kan er nog één slag binnenkomen — en dan staat de bevriezing in _stilMs
     en niet in de staart. Gebeurt dat niet, dan zit hij juist wél in de
     staart. Beide gevallen zijn echt; de grootste van de twee is het antwoord.

     Zonder deze regel meet de module soms nul terwijl de app twee minuten
     bevroren was, afhankelijk van de volgorde van twee gebeurtenissen waar
     niemand invloed op heeft. Dat is precies de stille meetfout die een teller
     onbruikbaar maakt. */
  function _stilte(tot) {
    var staart = tot - _laatste;
    if (staart >= _stilMs) return { ms: staart, van: _laatste };
    return { ms: _stilMs, van: _stilVan };
  }

  function heen() {
    if (_weg) return _weg;
    _weg = _laatste = _stilVan = Date.now();
    _slagen = 0; _stilMs = 0; _aan = false;
    try {
      if (typeof setInterval === 'function') { _timer = setInterval(_slag, HARTSLAG_MS); _aan = true; }
      else console.warn('achtergrond: geen setInterval — de bevriezing wordt niet gemeten, alleen de afwezigheid (#18)');
    } catch (e) {
      console.warn('achtergrond: hartslag niet gestart — dan blijft de bevriezing een aanname (#18)', e);
    }
    return _weg;
  }

  function terug() {
    if (!_weg) return null;
    var van = _weg, tot = Date.now();
    // De hartslag stopt vóór het rekenwerk. Een slag die ná de terugkeer nog
    // binnenkomt zou de stilte korter maken dan hij was.
    try { if (_timer !== null && typeof clearInterval === 'function') clearInterval(_timer); }
    catch (e) { console.warn('achtergrond: hartslag niet gestopt — hij loopt door in beeld (#18)', e); }
    _timer = null;
    _weg = 0;
    if (tot - van < DREMPEL_MELDEN) return null;

    var s = Math.round((tot - van) / 1000);
    var st = _stilte(tot);
    var p = { van: van, tot: tot, s: s, slagen: _slagen, socket: null,
              // door/stil/na blijven NULL als de hartslag niet liep. Nul zou
              // hier "niets aan de hand" betekenen, en dat is een uitspraak
              // die deze module dan niet gedaan heeft.
              door: null, stil: null, na: null };
    if (_aan) {
      var stilMs = st.ms >= STIL_MINIMAAL ? st.ms : 0;
      p.stil = Math.round(stilMs / 1000);
      p.door = Math.round((stilMs ? st.van - van : tot - van) / 1000);
      // Wat er ná de langste stilte nog aan tijd overbleef. Is dat meer dan een
      // paar seconden, dan is de lus uit zichzelf weer gaan lopen terwijl de
      // app nog verborgen was: dat is throttling en geen bevriezing.
      p.na = stilMs ? Math.round((tot - (st.van + stilMs)) / 1000) : 0;
    }
    if (tot - van >= DREMPEL_SOCKET) p.socket = _socketNakijken(s);
    perioden.push(p);
    if (perioden.length > MAX) perioden.shift();

    var kern = _zin(p);
    _log('📴 ' + kern + ' (#18)' + (p.socket ? '. ' + p.socket : ''), p.stil ? 'warn' : 'info');
    _bt('achtergrond: ' + kern + (p.socket ? ' — ' + p.socket : ''), p.stil ? 'warn' : 'info');
    return p;
  }

  /* De melding in woorden. Los gehouden omdat hier de hele bevinding van 02-09
     in zit: de zin mag alleen zeggen wat er gemeten is.

       niet gemeten  → dat staat er, en er staat geen oordeel bij
       niets stil    → de lus liep door; dat is nieuws, geen waarschuwing
       afgeknepen    → stilte plus de tijd die hij daarna zelf weer liep
       bevroren      → aanlooptijd en stilte apart, want dat zijn twee dingen */
  function _zin(p) {
    var kop = 'De app was ' + p.s + ' s weg';
    if (p.stil === null)
      return kop + ' — hoe lang de meetlus stillag is niet gemeten (de hartslag startte niet)';
    if (!p.stil)
      return kop + ' en de meetlus liep gewoon door (' + p.slagen + ' hartslagen)';
    if (p.na >= 3)
      return kop + ': langste stilte ' + p.stil + ' s (na ' + p.door + ' s), daarna liep hij zelf weer ' +
             p.na + ' s — afgeknepen, niet bevroren';
    return kop + ': ' + p.door + ' s doorgelopen, daarna ' + p.stil + ' s stil';
  }

  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') heen(); else terug();
    });
  } catch (e) {
    console.warn('visibilitychange niet gekoppeld — onderbrekingen blijven onzichtbaar (#18)', e);
  }

  window.PLAchtergrond = {
    perioden: function () { return perioden.slice(); },
    laatste: function () { return perioden.length ? perioden[perioden.length - 1] : null; },
    // Alleen wat na een gegeven moment begon. Blok 5 en blok 14 gaan over DEZE
    // rit, en de lijst overleeft een nulstelling van de ritwaarnemer.
    sinds: function (t) { return perioden.filter(function (p) { return p.van >= (t || 0); }); },
    totaalS: function (t) {
      return this.sinds(t).reduce(function (a, p) { return a + p.s; }, 0);
    },
    /* De langste GEMETEN stilte sinds t, in seconden.

       Dit is het getal dat blok 5 naast PLRit.gaten() legt, en het is met
       opzet iets anders dan totaalS(). `s` zegt hoe lang de app weg was; dít
       zegt hoe lang de meetlus niet liep. Op 02-09 scheelde dat 120 tegen 84,
       en op dat verschil sloeg blok 5 alarm alsof er iets mis was — terwijl
       het gewoon twee verschillende dingen waren.

       Perioden waarin de hartslag niet liep tellen NIET mee: die weten het
       niet, en een onbekende als nul lezen maakt van "niet gemeten" stilletjes
       "niets aan de hand". */
    stilsteS: function (t) {
      return this.sinds(t).reduce(function (a, p) {
        return (typeof p.stil === 'number' && p.stil > a) ? p.stil : a;
      }, 0);
    },
    // Hoeveel van de perioden sinds t hun stilte werkelijk gemeten hebben.
    // Staat dit op 0 terwijl er wel perioden zijn, dan zegt blok 5 dat er niets
    // te vergelijken valt in plaats van een vergelijking met nul te maken.
    gemeten: function (t) {
      return this.sinds(t).filter(function (p) { return typeof p.stil === 'number'; }).length;
    },
    weg: function () { return !!_weg; },
    wis: function () { perioden = []; _weg = 0; },
    // Voor test-achtergrond.js: de twee overgangen zonder browser aanroepbaar,
    // plus de hartslag zelf — anders hangt de test aan een echte timer en meet
    // hij de snelheid van de machine in plaats van de module.
    _heen: heen,
    _terug: terug,
    _slag: _slag,
    _drempels: function () { return { melden: DREMPEL_MELDEN, socket: DREMPEL_SOCKET, hartslag: HARTSLAG_MS, stil: STIL_MINIMAAL }; }
  };
})();
