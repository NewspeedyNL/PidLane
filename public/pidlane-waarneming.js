// ══════════════════════════════════════════════════════════════════
// pidlane-waarneming.js — wat er op DÉZE auto is waargenomen (#225)
// ──────────────────────────────────────────────────────────────────
// DRIE LAGEN, EN DIT IS DE BOVENSTE.
//
//   auto     heeft start/stop, heeft een tweede aandrijfbron, geleerde
//            normalen   →  blijft, per auto            ← DIT BESTAND
//   sessie   de motor draait nu, heeft deze sessie gedraaid
//            →  weg bij verbreken                      ← PLAandrijving
//   meting   gaten, dekking, kwaliteit van déze reeks
//            →  per analyse                            ← PLAanlevering
//
// De onderste twee waren er al en doen hun werk goed. De bovenste ontbrak, en
// daardoor deed de sessielaag haar werk erbij: een eigenschap van de AUTO werd
// bewaard alsof het een eigenschap van de MÉTING was, en dus bij elke
// herverbinding weggegooid. Dat is de reden dat het meetcontextvenster elke
// sessie opnieuw vroeg of deze auto start/stop heeft — een vraag waarvan het
// antwoord nooit verandert.
//
// DE ASYMMETRIE STAAT IN DE API EN NIET IN EEN REGEL DIE JE MOET ONTHOUDEN.
//
//      gezien       het verschijnsel heeft zich voorgedaan      bewijs
//      niet gezien  de auto heeft het niet, óf de gelegenheid
//                   deed zich niet voor                         géén bewijs
//
// `meld()` kan daarom maar één ding zeggen: GEZIEN. Er is geen manier om
// "gemeten dat het er niet is" op te schrijven, want die meting bestaat niet.
// Dat is met opzet zo klein gehouden: een vlag met twee kanten nodigt uit om
// de stilte als "nee" te lezen, en dat is precies de fout die #62 moest
// voorkomen — een normale start/stop-stop die als afslaan gerapporteerd wordt.
//
// EN DAN DE ENIGE BRON DIE WÉL "NEE" KAN ZEGGEN: EEN MENS.
// `weerleg()` legt vast dat de gebruiker zegt dat deze auto dit verschijnsel
// niet heeft. Dat hoeft hij per auto één keer te doen, niet elke sessie.
//
// WIE WINT ALS ZE ELKAAR TEGENSPREKEN? HET MOMENT BESLIST.
// Een weerlegging corrigeert de waarnemingen die er op dat moment lagen —
// niet de toekomst. Een waarneming van ná de weerlegging wint dus alsnog: er
// is dan nieuw bewijs, en bewijs gaat vóór een bewering. Een waarneming van
// vóór de weerlegging niet: die is juist waar de weerlegging over ging.
// Zonder die volgorderegel is het of een gebruiker die zichzelf niet kan
// corrigeren, of een app die zich niet kan herstellen van een foute correctie.
//
// NIET GEMETEN IS GEEN NEE. `lees()` van iets dat hier niet staat geeft
// `onbekend` en nooit `weerlegd`. Zelfde regel als "niet gemeten is geen nul"
// in pidlane-aanlevering.js, en om dezelfde reden: een stilzwijgende nul gaat
// rechtstreeks een klantrapport in.
//
// GEEN SLEUTEL, GEEN OPSLAG. Weten we niet welke auto dit is, dan leeft het
// register alleen in het geheugen en zegt `reikwijdte` daarom `sessie`. Naar
// een gedeelde bak schrijven zou de waarneming van de ene auto op de volgende
// plakken — in een werkplaats waar je achter elkaar aankoppelt is dat geen
// randgeval maar de normale gang van zaken.
//
// DE SLEUTEL IS DEZELFDE ALS DIE VAN PLPidLen, EN DAT IS EEN KEUZE MET EEN
// SCHULD ERAAN. `vin || merk|model|jaar` staat al in PLPidLen, PLPidVorm en
// sessionsKey(); een vierde variant erbij verzinnen maakt het alleen maar
// moeilijker om ze ooit samen te verhuizen. Die verhuizing — alle vier naar
// `_vlVinPseudoniem()` — is mechanisch werk en dus een eigen commit, en het
// moment dat het écht gaat tellen is zodra een profiel de telefoon verlaat.
// Zolang het hier blijft staan gaat er geen VIN naar buiten (§7 gaat over de
// uitgaande paden), maar de schuld staat genoteerd in #225.
//
// Classic script: geen module, geen IIFE-export. Hangt zichzelf aan window,
// zoals alles hier, en is daarmee in node te laden met vm.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var VOORVOEGSEL = 'pl_waarneming_';
  var VERSIE = 1;

  /* Welke verschijnselen dit register kent. Een onbekende naam wordt
     GEWEIGERD en niet stil opgeslagen: een typefout zou anders een tweede,
     lege waarneming maken die nergens meer uit komt — en die zou er als
     "onbekend" uitzien, wat hier niets betekent maar wel geruststelt. */
  var KENT = {
    startstop: 'start/stop-systeem'
  };

  var _reg = {};          // wat, → { status, bron, wanneer, bewijs, weerlegdOp }
  var _sleutel = null;    // welke auto dit register beschrijft
  var _bewaard = false;   // staat het ook op schijf, of alleen in het geheugen

  function _nu() { return Date.now(); }

  function _autoSleutel() {
    try {
      var v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
      return v.vin || [v.merk, v.model, v.year].filter(Boolean).join('|') || null;
    } catch (e) {
      console.warn('waarneming: vehicleInfo niet leesbaar — het register blijft bij deze sessie', e);
      return null;
    }
  }

  /* Laden zet óók `_bewaard`, want dat is dezelfde vraag: werkt de opslag op
     dit toestel. Een leeg profiel dat gewoon gelezen kon worden is iets
     anders dan een opslag die gooit — in het eerste geval geldt wat we
     opschrijven straks voor deze AUTO, in het tweede alleen voor deze rit. */
  function _laad(k) {
    var uit = {};
    try {
      var ruw = localStorage.getItem(VOORVOEGSEL + k);
      _bewaard = true;
      if (!ruw) return uit;
      var o = JSON.parse(ruw);
      if (o && o.v === VERSIE && o.w) uit = o.w;
    } catch (e) {
      _bewaard = false;
      console.warn('waarneming: het profiel van deze auto is niet te lezen — er wordt niets aangenomen (#225)', e);
    }
    return uit;
  }

  function _bewaar() {
    if (!_sleutel) return;
    try {
      localStorage.setItem(VOORVOEGSEL + _sleutel, JSON.stringify({ v: VERSIE, w: _reg }));
      _bewaard = true;
    } catch (e) {
      // Vol of geblokkeerd. Niet stil: vanaf hier leeft het register alleen
      // deze sessie, en dat is iets wat het verslag hoort te weten.
      _bewaard = false;
      console.warn('waarneming: het profiel kon niet bewaard worden — deze waarnemingen leven alleen deze sessie (#225)', e);
    }
  }

  /* De sleutel kan MIDDEN in een sessie komen: de VIN arriveert pas na de
     ELM-init, en tot dan weet de app niet welke auto eraan hangt.

       null → X   overnemen. Wat we deze sessie zagen, zagen we aan DEZE auto;
                  we wisten alleen zijn naam nog niet.
       X    → Y   weggooien en het profiel van Y laden. Een andere auto begint
                  nooit met andermans waarnemingen.  */
  function _synchroniseer() {
    var k = _autoSleutel();
    if (k === _sleutel) return;

    if (k && _sleutel === null && Object.keys(_reg).length) {
      var opgebouwd = _reg;
      _sleutel = k;
      _reg = _laad(k);
      Object.keys(opgebouwd).forEach(function (wat) { _leg(wat, opgebouwd[wat]); });
      _bewaar();
      return;
    }

    _sleutel = k;
    _bewaard = false;
    _reg = k ? _laad(k) : {};
  }

  /* De volgorderegel op één plek. `nieuw` landt alleen als hij iets toevoegt,
     en een waarneming van vóór een weerlegging voegt niets toe. */
  function _leg(wat, nieuw) {
    var oud = _reg[wat];
    if (!oud) { _reg[wat] = nieuw; return; }

    if (nieuw.status === 'weerlegd') {
      // Een mens corrigeert wat er lag. Het bewijs eronder blijft staan — de
      // vergissing is leerzamer dan de correctie, en zonder dat bewijs is
      // achteraf niet te zien wáár de app naar keek toen hij het misdeed.
      _reg[wat] = {
        status: 'weerlegd', bron: 'mens', wanneer: nieuw.wanneer,
        bewijs: nieuw.bewijs || null,
        weerlegdOp: nieuw.wanneer,
        gecorrigeerd: (oud.status === 'gezien') ? { wanneer: oud.wanneer, bewijs: oud.bewijs || null } : (oud.gecorrigeerd || null)
      };
      return;
    }

    if (nieuw.status === 'gezien') {
      // Al gezien? Dan blijft de EERSTE waarneming staan: die draagt het
      // moment waarop het bewijs er kwam, en dat is het getal dat telt.
      if (oud.status === 'gezien') return;
      // Weerlegd, en deze waarneming is ouder dan de weerlegging? Dan is dit
      // precies wat er weerlegd is.
      if (oud.weerlegdOp && nieuw.wanneer <= oud.weerlegdOp) return;
      nieuw.weerlegdOp = oud.weerlegdOp || null;
      _reg[wat] = nieuw;
      return;
    }
  }

  function _schoon(bewijs) {
    if (!bewijs || typeof bewijs !== 'object') return null;
    var uit = {}, n = 0;
    Object.keys(bewijs).forEach(function (k) {
      if (n >= 8) return;                       // een register is geen logboek
      var w = bewijs[k];
      if (w === null || w === undefined) return;
      if (typeof w === 'number' && !isFinite(w)) return;
      if (typeof w === 'object') return;
      uit[k] = w; n++;
    });
    return n ? uit : null;
  }

  // ── Wat de rest van de app aanroept ────────────────────────────────

  /* meld(wat, opties) — het verschijnsel IS waargenomen.
     opties: { wanneer, bewijs }. `wanneer` is het moment van de waarneming en
     niet van deze aanroep; die twee lopen uiteen zodra een module zijn
     waarneming pas bij de volgende tik doorgeeft. */
  function meld(wat, opties) {
    if (!KENT[wat]) { console.warn('waarneming: onbekend verschijnsel "' + wat + '" — niet vastgelegd (#225)'); return lees(wat); }
    _synchroniseer();
    var o = opties || {};
    var t = (typeof o.wanneer === 'number' && o.wanneer > 0) ? o.wanneer : _nu();
    _leg(wat, { status: 'gezien', bron: 'meting', wanneer: t, bewijs: _schoon(o.bewijs) });
    _bewaar();
    return lees(wat);
  }

  /* weerleg(wat, opties) — een MENS zegt dat deze auto dit niet heeft.
     Dit is de enige bron die "nee" mag zeggen, en de enige reden dat die
     kant überhaupt bestaat. */
  function weerleg(wat, opties) {
    if (!KENT[wat]) { console.warn('waarneming: onbekend verschijnsel "' + wat + '" — niet weerlegd (#225)'); return lees(wat); }
    _synchroniseer();
    var o = opties || {};
    var t = (typeof o.wanneer === 'number' && o.wanneer > 0) ? o.wanneer : _nu();
    _leg(wat, { status: 'weerlegd', bron: 'mens', wanneer: t, bewijs: _schoon(o.bewijs) });
    _bewaar();
    return lees(wat);
  }

  /* lees(wat) — altijd een object, nooit null. Eén vorm scheelt de
     aanroepers een null-controle, en een ontbrekende null-controle is hier
     precies hoe "niet gemeten" stilletjes "nee" wordt. */
  function lees(wat) {
    _synchroniseer();
    var r = _reg[wat];
    if (!r) {
      return {
        wat: wat, status: 'onbekend', bron: null, wanneer: null, bewijs: null,
        weerlegdOp: null, reikwijdte: _sleutel ? 'auto' : 'sessie', naam: KENT[wat] || wat
      };
    }
    return {
      wat: wat,
      status: r.status,
      bron: r.bron,
      wanneer: r.wanneer,
      bewijs: r.bewijs || null,
      weerlegdOp: r.weerlegdOp || null,
      gecorrigeerd: r.gecorrigeerd || null,
      // Staat het op schijf, dan geldt het voor deze AUTO en niet alleen voor
      // deze rit. Zonder sleutel of zonder opslag is dat niet waar, en dan
      // hoort het er ook niet te staan.
      reikwijdte: (_sleutel && _bewaard) ? 'auto' : 'sessie',
      naam: KENT[wat] || wat
    };
  }

  function alles() {
    _synchroniseer();
    return Object.keys(KENT).map(lees);
  }

  function wis() { _reg = {}; _bewaard = false; if (_sleutel) { try { localStorage.removeItem(VOORVOEGSEL + _sleutel); } catch (e) { console.warn('waarneming: profiel niet te wissen', e); } } }

  window.PLWaarneming = {
    meld: meld,
    weerleg: weerleg,
    lees: lees,
    alles: alles,
    wis: wis,
    kent: function () { return Object.keys(KENT); },
    sleutel: function () { _synchroniseer(); return _sleutel; },
    bewaard: function () { _synchroniseer(); return _bewaard; },
    _voorvoegsel: VOORVOEGSEL
  };
})();
