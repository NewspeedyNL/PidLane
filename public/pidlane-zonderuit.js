/* ══════════════════════════════════════════════════════════════════
   pidlane-zonderuit.js — PLZonderUit: een eigen uitkomst zonder adapter
   ──────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (09-11-2026, #705)
   Sinds de adapterkaart in de wizard zegt elke meetmodule netjes
   "hiervoor is de adapter nodig". Voor wie geen adapter heeft is dat nog
   steeds een eindpunt. Vier vragen zijn zonder auto al voor een groot deel
   te beantwoorden uit wat de app weet: het RDW, de terugroepacties, de
   zwakke punten per merk (AUTO_KENNIS), het dossier in Mijn voertuigen en de
   tankbeurten. Dit bestand zet die bij elkaar, met bij elke uitkomst wat de
   adapter er nog aan toevoegt.

     papieren   kopen: RDW, NAP, APK, export, terugroepacties, bekende zwakke
                punten, een bezichtigingslijst en vragen voor de verkoper.
                De signalen komen uit PLAankoop.signalen() — dezelfde regels
                als het aankooprapport, zodat "onlogisch" hier niet anders
                betekent dan daar. Alleen de papieren regels; wat de
                elektronica zegt staat er als "niet uitgelezen" bij.
     onderhoud  wat er volgens leeftijd, km en de laatste beurt aan komt,
                met algemene richtwaarden. Het serviceboekje gaat voor; dat
                staat er bij elke regel bij.
     langerit   een checklist voor een lange rit: APK, terugroepactie,
                banden (uit het winterprofiel), trekgewicht, en wat je zelf
                nakijkt.
     verbruik   het echte verbruik uit volle tankbeurten (PLTank) naast de
                typekeuring van het RDW.
   Winter heeft al een eigen venster (PLWinter.open); de wizard wijst daarheen.

   ÉÉN BETEKENIS. Dit is geen tweede aankooprapport en geen tweede
   onderhoudsadvies: het eindoordeel van de papieren is nooit "groen", maar
   "op papier niets gevonden", omdat de elektronica niet gelezen is.

   PUUR: papieren(), onderhoudPlan(), langeRit(), verbruik(), soortVoor().
   test-zonderuit.js laadt dit bestand met vm, samen met de echte
   pidlane-aankooprapport.js. De rest raakt het net en de DOM.

   Laadvolgorde: ná pidlane-zonder.js (PLZonder._blad, haal) en
   pidlane-aankooprapport.js. Bij aanroep: PLRecall, PLGarage, PLWinter,
   PLTank, autoKennisVoorMerk, registerSessionReport.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var JAAR = 365.25 * 864e5;
  /* Algemene richtwaarden. Het serviceboekje van de auto gaat altijd voor;
     dit is de ondergrens die een monteur ook zou noemen zonder het boekje.
     km = null: alleen op tijd. Niet bij een EV: wat die auto niet heeft. */
  var INTERVALLEN = [
    { id: 'olie', wat: 'Olie en oliefilter (kleine beurt)', km: 15000, jaar: 1, nietEv: true },
    { id: 'interieur', wat: 'Interieurfilter', km: 15000, jaar: 1 },
    { id: 'remvloeistof', wat: 'Remvloeistof', km: null, jaar: 2 },
    { id: 'lucht', wat: 'Luchtfilter', km: 30000, jaar: 2, nietEv: true },
    { id: 'airco', wat: 'Airco-onderhoud', km: null, jaar: 2 },
    { id: 'bougies', wat: 'Bougies', km: 60000, jaar: 4, alleen: 'benzine' },
    { id: 'koelvloeistof', wat: 'Koelvloeistof', km: null, jaar: 5 },
    { id: 'distributie', wat: 'Distributieriem', km: 120000, jaar: 6, nietEv: true, riem: true }
  ];
  var BINNENKORT = 0.85;   // vanaf 85 % van het interval: binnenkort
  var PAPIER = { nap: 1, apk: 1, keuren: 1, export: 1, tenaam: 1, wam: 1, recall: 1 };
  var RANG = { grijs: 0, groen: 1, oranje: 2, rood: 3 };
  var BEZICHTIGING = [
    'Banden: steek een euromunt in de groef. Zie je de gouden rand, dan is het profiel onder 3 mm.',
    'Banden: kijk naar de DOT-code op de zijkant (week en jaar). Ouder dan zes jaar verhardt het rubber.',
    'Koude start: vraag de verkoper de motor niet vooraf warm te draaien. Let op tikken, rook en een onrustig stationair toerental.',
    'Olie: peilstok tussen min en max, geen melkachtige laag onder de vuldop.',
    'Koelvloeistof: niveau in het reservoir, geen olie of bruine kleur.',
    'Carrosserie: kijk langs de flanken naar kleurverschil en ongelijke naden (schadeherstel), en onder de dorpels naar roest.',
    'Dashboard: alle lampjes gaan bij contact aan even branden en daarna uit. Een lampje dat nooit oplicht kan uitgeschakeld zijn.',
    'Proefrit: rechtuit zonder trekken, remmen zonder trillen, schakelen zonder haperen, geen gebrom bij snelheid.'
  ];

  function getal(x) { var g = typeof x === 'number' ? x : parseFloat(String(x == null ? '' : x).replace(',', '.')); return isFinite(g) ? g : null; }
  function tekst(x) { return x == null ? '' : String(x).trim(); }
  function nl(x) { return Math.round(x).toLocaleString('nl-NL'); }
  function isEv(bs) { return /elektr/i.test(tekst(bs)) && !/hybr/i.test(tekst(bs)); }
  function datum(x) {
    if (x == null || x === '') return null;
    if (typeof x === 'number') return isFinite(x) ? x : null;
    var s = String(x).trim(), m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    var t = Date.parse(s);
    return isFinite(t) ? t : null;
  }

  // ════════════════════════════════════════════════════════════════
  //  PUUR
  // ════════════════════════════════════════════════════════════════

  /* Het papierenrapport. inv = { kenteken, ts, rdw, recall, kennis, merk }.
     kennis = autoKennisVoorMerk() of null. Geeft { signalen, oordeel, kop,
     zwak, bezichtiging, vragen, niet }. Signalen uit PLAankoop, alleen de
     papieren regels. */
  function papieren(inv, aankoop) {
    inv = inv || {};
    var A = aankoop || (typeof window !== 'undefined' && window.PLAankoop) || null;
    if (!A) throw new Error('PLZonderUit: PLAankoop ontbreekt');
    var sig = A.signalen({ kenteken: inv.kenteken, ts: inv.ts, rdw: inv.rdw, recall: inv.recall, obd: { verbonden: false } })
      .filter(function (s) { return PAPIER[s.id]; });
    if (!inv.rdw) sig.unshift({ id: 'rdw', onderwerp: 'RDW', kleur: 'grijs', kop: 'Niet gevonden bij het RDW', uitleg: 'Controleer het kenteken op een typefout.', vraag: null });
    var zwak = (inv.kennis && Array.isArray(inv.kennis.zwak)) ? inv.kennis.zwak.slice(0, 6) : [];
    var hoogst = 'grijs';
    sig.forEach(function (s) { if (RANG[s.kleur] > RANG[hoogst]) hoogst = s.kleur; });
    var oordeel = hoogst === 'rood' ? 'rood' : hoogst === 'oranje' ? 'oranje' : (inv.rdw ? 'papier-ok' : 'grijs');
    var kop = oordeel === 'rood' ? 'Op papier gevonden: dit moet eerst opgehelderd worden'
      : oordeel === 'oranje' ? 'Op papier: een paar punten om na te vragen'
      : oordeel === 'papier-ok' ? 'Op papier niets gevonden — de elektronica is niet uitgelezen'
      : 'Geen gegevens';
    var vragen = A.vragen(sig);
    zwak.forEach(function (z) { vragen.splice(Math.max(0, vragen.length - A.STANDAARDVRAGEN.length), 0, 'Is er aan "' + z + '" iets gedaan, en is daar een factuur van?'); });
    return {
      signalen: sig, oordeel: oordeel, kop: kop, zwak: zwak, bezichtiging: BEZICHTIGING.slice(), vragen: vragen,
      niet: 'Niet uitgelezen zonder adapter: foutcodes (ook gewiste), de zelftests, de kilometerstand in de stuurapparaten en de monitortests. Met de adapter wordt dit het volledige aankooprapport.'
    };
  }

  /* Wat het onderhoud volgens richtwaarden zegt. a = { bouwjaar, toelating,
     brandstof, km, laatsteDatum, laatsteKm, distributie, volgendeDatum,
     volgendeKm, nu }. Geeft { regels: [{ id, wat, staat, reden }], tekort }.
     staat: nu | binnenkort | ok | onbekend. */
  function onderhoudPlan(a) {
    a = a || {};
    var nu = getal(a.nu) || Date.now();
    var km = getal(a.km), start = datum(a.toelating) || (getal(a.bouwjaar) ? Date.UTC(getal(a.bouwjaar), 6, 1) : null);
    var lD = datum(a.laatsteDatum), lK = getal(a.laatsteKm);
    var ev = isEv(a.brandstof), benzine = /benzine|lpg/i.test(tekst(a.brandstof));
    var ketting = /ketting/i.test(tekst(a.distributie)), riemVervangen = /vervangen|nieuw/i.test(tekst(a.distributie));
    var regels = [], tekort = [];
    if (km == null) tekort.push('de kilometerstand');
    if (lD == null && lK == null) tekort.push('de laatste beurt');
    var vD = datum(a.volgendeDatum), vK = getal(a.volgendeKm);
    if (vD != null || vK != null) {
      var dagen = vD != null ? Math.floor((vD - nu) / 864e5) : null, rest = (vK != null && km != null) ? vK - km : null;
      var st = (dagen != null && dagen < 0) || (rest != null && rest < 0) ? 'nu' : ((dagen != null && dagen <= 30) || (rest != null && rest <= 1000) ? 'binnenkort' : 'ok');
      regels.push({ id: 'gepland', wat: 'Volgende beurt (zoals jij hem invulde)', staat: st,
        reden: [dagen != null ? (dagen < 0 ? Math.abs(dagen) + ' dagen over tijd' : 'over ' + dagen + ' dagen') : null, rest != null ? (rest < 0 ? nl(-rest) + ' km over' : 'over ' + nl(rest) + ' km') : null].filter(Boolean).join(', ') });
    }
    INTERVALLEN.forEach(function (iv) {
      if ((iv.nietEv && ev) || (iv.alleen === 'benzine' && !benzine)) return;
      if (iv.riem && ketting) { regels.push({ id: iv.id, wat: 'Distributieketting', staat: 'ok', reden: 'een ketting heeft geen vast vervangmoment; laat hem bij elke grote beurt beluisteren' }); return; }
      // Sinds wanneer telt het interval? Kleine-beurtonderdelen sinds de
      // laatste beurt; de rest weet je zonder factuur niet, dus sinds nieuw.
      var kleineBeurt = iv.id === 'olie' || iv.id === 'interieur' || iv.id === 'lucht';
      var vanD = kleineBeurt && lD != null ? lD : (iv.riem && riemVervangen ? null : start);
      var vanK = kleineBeurt && lK != null ? lK : (iv.riem && riemVervangen ? null : 0);
      var jr = vanD != null ? (nu - vanD) / JAAR : null;
      var dk = (km != null && vanK != null && iv.km) ? km - vanK : null;
      var deel = Math.max(jr != null ? jr / iv.jaar : 0, dk != null ? dk / iv.km : 0);
      var bekend = jr != null || dk != null;
      var bron = kleineBeurt && (lD != null || lK != null) ? 'sinds de laatste beurt' : 'sinds nieuw, tenzij al vervangen — kijk in het boekje';
      var grens = 'elke ' + (iv.km ? nl(iv.km) + ' km of ' : '') + iv.jaar + ' jaar';
      var staat = !bekend ? 'onbekend' : deel >= 1 ? 'nu' : deel >= BINNENKORT ? 'binnenkort' : 'ok';
      if (riemVervangen && iv.riem) staat = 'ok';
      if (staat !== 'ok' && !kleineBeurt && staat !== 'onbekend') {
        // Zonder factuur kan "sinds nieuw" te ruim tellen: noem het een vraag, geen gebrek.
        regels.push({ id: iv.id, wat: iv.wat, staat: staat === 'nu' ? 'nagaan' : staat, reden: grens + ' (' + bron + ')' });
      } else {
        regels.push({ id: iv.id, wat: iv.wat, staat: staat, reden: grens + (bekend ? ' (' + bron + ')' : '') });
      }
    });
    return { regels: regels, tekort: tekort };
  }

  /* Checklist voor een lange rit. a = { apkDagen, recallOpen, winter
     (PLWinter.profiel()), bandenJaren (PLWinter._kern.dotLeeftijd),
     seizoenWinter, trekgewicht }. Elke regel { ernst: rood|oranje|info, tekst }. */
  function langeRit(a) {
    a = a || {};
    var uit = [], r = function (ernst, t) { uit.push({ ernst: ernst, tekst: t }); };
    var d = getal(a.apkDagen);
    if (d != null && d < 0) r('rood', 'De APK is verlopen: niet de weg op.');
    else if (d != null && d < 30) r('oranje', 'De APK verloopt over ' + d + ' dagen — valt hij in je reis?');
    if (a.recallOpen === true) r('oranje', 'Er staat een terugroepactie open. Laat hem vóór de reis uitvoeren (gratis bij de dealer).');
    var w = a.winter || {}, mm = getal(w.banden_mm), jr = getal(a.bandenJaren);
    if (mm != null && mm < 3) r('rood', 'Profiel ' + String(mm).replace('.', ',') + ' mm: vervang de banden vóór een lange rit.');
    else if (mm != null && mm < 4 && a.seizoenWinter) r('oranje', 'Profiel ' + String(mm).replace('.', ',') + ' mm: een winterband doet onder 4 mm zijn werk niet meer.');
    if (jr != null && jr >= 6) r('oranje', 'De banden zijn ' + Math.floor(jr) + ' jaar oud (DOT ' + tekst(w.banden_dot) + '): ouder dan zes jaar verhardt het rubber.');
    if (a.seizoenWinter && w.banden === 'zomer') r('oranje', 'Zomerbanden in de winter: onder 7 °C remmen ze merkbaar slechter.');
    var tg = getal(a.trekgewicht);
    if (tg) r('info', 'Met caravan of aanhanger: hoogstens ' + nl(tg) + ' kg geremd trekgewicht volgens het RDW.');
    ['Bandenspanning op de stand voor beladen (staat in de deurstijl of de tankklep).',
      'Olie, koelvloeistof en ruitensproeiervloeistof op peil.',
      'Verlichting rondom, ook remlichten en richtingaanwijzers.',
      'Ruitenwissers zonder strepen.',
      'Gevarendriehoek en hesje; voor het buitenland ook wat daar verplicht is.'].forEach(function (t) { r('info', t); });
    return uit;
  }

  /* Echt verbruik uit volle tankbeurten naast de typekeuring. a = {
     volleTank: PLTank.volleTank() of [], typekeuring: l/100 km }. */
  function verbruik(a) {
    a = a || {};
    var reeks = (a.volleTank || []).filter(function (x) { return getal(x.l100) != null; });
    var tk = getal(a.typekeuring);
    if (!reeks.length) return { echt: null, typekeuring: tk, tekst: 'Nog geen twee volle tankbeurten: vul de tank helemaal en noteer liters en km-stand, twee keer.' };
    var km = 0, l = 0;
    reeks.forEach(function (x) { km += getal(x.km) || 0; l += getal(x.liters) || 0; });
    var echt = km > 0 && l > 0 ? l / km * 100 : getal(reeks[reeks.length - 1].l100);
    var pct = tk ? Math.round((echt / tk - 1) * 100) : null;
    return { echt: Math.round(echt * 10) / 10, typekeuring: tk, verschilPct: pct, n: reeks.length,
      tekst: tk ? (pct > 0 ? pct + ' % boven de typekeuring' : pct < 0 ? Math.abs(pct) + ' % onder de typekeuring' : 'gelijk aan de typekeuring') + ' (meestal 10–25 % erboven)' : '' };
  }

  /* De kaarten achter de deuren van Alle functies (index.html, wcBind in
     pidlane-theme.js). Elke kaart hier meet aan de auto; de waarde is de
     uitkomst zonder adapter, of null. Niet in de lijst = mag zonder auto:
     wc-liveexpert (je kijkt mee bij een ander) en wc-deepdiag (begint met een
     vragenlijst, net als diep in de wizard). */
  var KAART = {
    'wc-live': null, 'wc-waak': null, 'wc-pidrec': null, 'wc-bulkrec': null, 'wc-liveshare': null, 'wc-monitor': null, 'wc-caravan': 'langerit',
    'wc-diag': 'klacht', 'wc-onderdeel': 'klacht', 'wc-check': 'klacht', 'wc-basiccheck': 'klacht', 'wc-dtc': 'foutcode',
    'wc-fuel': 'verbruik', 'wc-koop': 'papieren', 'wc-proefrit': 'papieren', 'wc-langerit': 'langerit', 'wc-accu': null,
    'wc-seizoen': 'winter', 'wc-ev': null, 'wc-onderhoud': 'onderhoud'
  };
  function kaartNodig(id) { return Object.prototype.hasOwnProperty.call(KAART, id); }

  /* Welke uitkomst zonder adapter hoort bij een wizardmodule of een doel. */
  function soortVoor(mod, job) {
    job = job || {};
    if (mod === 'markt' || (!mod && job.doel === 'handel')) return 'papieren';
    if (job.doel === 'storing' && (!mod || mod === 'aimonteur' || mod === 'onderdeel' || mod === 'systeem' || mod === 'conditie')) return 'klacht';
    if (mod === 'onderhoud' || (!mod && job.voorb === 'onderhoud')) return 'onderhoud';
    if (mod === 'langerit' || (!mod && job.voorb === 'langerit')) return 'langerit';
    if ((mod === 'klimaat' || !mod) && job.voorb === 'winter') return 'winter';
    if (mod === 'verbruik' || (!mod && job.doel === 'verbruik' && job.vraag === 'werkelijk')) return 'verbruik';
    return null;
  }
  var TITEL = { foutcode: '🔢 Foutcode opzoeken', klacht: '🩺 Wat kan het zijn?', papieren: '📄 Papierenrapport voor de koper', onderhoud: '🔧 Onderhoud volgens leeftijd en km', langerit: '🛣️ Klaar voor een lange rit', winter: '❄️ Je winterprofiel', verbruik: '⛽ Wat verbruikt hij écht' };
  var UITLEG = { foutcode: 'Wat betekent een code van de garage of een andere app', klacht: 'De waarschijnlijke oorzaken uit je antwoorden, en wat een adapter zou meten om ze te scheiden', papieren: 'RDW, tellerstand, terugroepacties, bekende zwakke punten en wat je bij de bezichtiging zelf nakijkt', onderhoud: 'Wat er volgens richtwaarden aankomt, uit leeftijd, km en je laatste beurt', langerit: 'APK, terugroepactie, banden en een lijst om zelf na te lopen', winter: 'Banden, ruitensproeier en het weer van de komende dagen', verbruik: 'Uit je tankbeurten, naast de typekeuring van het RDW' };

  // ════════════════════════════════════════════════════════════════
  //  NIET PUUR — net en scherm
  // ════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function melding(t) { try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('PLZonderUit: melding', e); } }
  function blad(titel, inhoud) {
    if (!window.PLZonder || typeof PLZonder._blad !== 'function') throw new Error('PLZonder ontbreekt');
    return PLZonder._blad(titel, inhoud);
  }
  function voertuig() { try { return window.PLGarage && PLGarage.actief ? PLGarage.actief() : null; } catch (e) { console.warn('PLZonderUit: voertuig onleesbaar', e); return null; } }
  function mijnKent() {
    var v = voertuig(); if (v && v.kenteken) return v.kenteken;
    try { var m = window.PLZonder && PLZonder.mijnAuto(); return (m && m.kent) || ''; } catch (e) { console.warn('PLZonderUit: mijn auto onleesbaar', e); return ''; }
  }
  function kentVeld(id, waarde, knop) {
    return '<div class="plz-in"><input id="' + id + '" placeholder="12-ABC-3" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" value="' + esc(waarde || '') + '">' +
      '<button type="button" class="plz-go" onclick="' + knop + '">Maak</button></div><div class="plz-st" id="pluSt"></div><div id="pluUit"></div>';
  }
  function regelHtml(kleur, kop, uitleg) {
    return '<div class="plz-regel"><span class="plz-dot ' + (kleur === 'nagaan' ? 'oranje' : kleur) + '" style="margin-top:4px"></span><span style="flex:1"><div class="plz-l">' + esc(kop) + '</div>' + (uitleg ? '<div class="plz-w">' + esc(uitleg) + '</div>' : '') + '</span></div>';
  }
  var KLEUR = { nu: 'rood', nagaan: 'oranje', binnenkort: 'oranje', ok: 'groen', onbekend: '', rood: 'rood', oranje: 'oranje', info: '' };
  var STAAT = { nu: 'nu nodig', nagaan: 'nagaan', binnenkort: 'binnenkort', ok: 'nog niet', onbekend: 'onbekend' };
  var ADAPTER = '<div class="plz-klein" style="margin-top:10px">🔌 Met de adapter komt er meer bij. <button type="button" class="plz-kn" onclick="PLZonder.sluit();if(typeof plVerbindOpen===\'function\')plVerbindOpen()">Verbind adapter</button></div>';

  function open(soort, opties) {
    opties = opties || {};
    if (soort === 'winter') { if (window.PLWinter) PLWinter.open(); return; }
    if (soort === 'foutcode') { if (window.PLZonder) PLZonder.foutcode(); return; }
    if (soort === 'klacht') { if (window.PLWijzer) PLWijzer.klacht(opties.klachten || []); return; }
    if (soort === 'papieren') return openPapieren(opties.kenteken);
    if (soort === 'onderhoud') return openOnderhoud();
    if (soort === 'langerit') return openLangeRit();
    if (soort === 'verbruik') return openVerbruik();
    throw new Error('PLZonderUit: onbekende soort ' + soort);
  }

  /* Is er een auto om aan te meten? Verbonden, de demo, of meekijken op
     afstand. Eén plek: de wizard (adapterNodig) en de kaarten vragen dit. */
  function heeftAuto() {
    try { return !!((typeof connected !== 'undefined' && connected) || (typeof demoMode !== 'undefined' && demoMode) || window._remoteVehicleMode); }
    catch (e) { console.warn('PLZonderUit: verbinding onleesbaar — als niet verbonden', e); return false; }
  }
  /* De adapterkaart voor een kaart onder Alle functies. Geeft true als hij
     getoond is (de kaart opent dan niet). */
  function poortKaart(id, naam) {
    if (!kaartNodig(id) || heeftAuto()) return false;
    var soort = KAART[id];
    var item = function (t, d, on, extra) { return '<div class="plz-blok"' + (extra || '') + '><b>' + t + '</b><div class="plz-klein">' + d + '</div><div class="plz-knoppen"><button type="button" class="plz-kn" onclick="' + on + '">Openen</button></div></div>'; };
    blad('🔌 Hiervoor is de adapter nodig',
      '<div class="plz-st" id="pluPoort">' + esc(naam || 'Dit') + ' leest de auto uit via de OBD-adapter. Na het verbinden staat het voor je klaar.</div>' +
      '<div class="plz-knoppen"><button type="button" class="plz-kn hoofd" id="pluVerbind" onclick="PLZonder.sluit();if(typeof plVerbindOpen===\'function\')plVerbindOpen()">⚡ Verbind adapter</button></div>' +
      (soort ? item(TITEL[soort], UITLEG[soort], 'PLZonder.sluit();PLZonderUit.open(\'' + soort + '\')', ' id="pluAlternatief"') : '') +
      item('◇ Probeer het in de demo', 'Hetzelfde met een gesimuleerde auto. Er wordt niets bewaard.', 'PLZonder.sluit();PLZonder.simuleer()'));
    return true;
  }

  // ── papieren ─────────────────────────────────────────────────────
  var _laatste = null;
  function openPapieren(kent) {
    blad(TITEL.papieren, '<div class="plz-klein" style="margin-bottom:8px">Vóór je gaat kijken: wat de papieren zeggen, en wat je ter plekke zelf nakijkt. Zonder adapter.</div>' + kentVeld('pluKent', kent || '', 'PLZonderUit._papieren()'));
    if (kent) return maakPapieren();
  }
  async function maakPapieren() {
    var kent = String((el('pluKent') || {}).value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    var st = el('pluSt'), uit = el('pluUit');
    if (kent.length < 4) { if (st) st.textContent = 'Vul een kenteken in, bijvoorbeeld 12-ABC-3.'; return null; }
    if (st) st.textContent = '⏳ RDW en terugroepacties opzoeken…';
    var d = null, rc = null, kennis = null;
    try { d = await PLZonder.haal(kent); }
    catch (e) { console.warn('PLZonderUit: RDW niet opgehaald', e); if (st) st.textContent = '⚠️ RDW niet bereikbaar: ' + e.message; return null; }
    if (window.PLRecall && d) {
      try { var r = await PLRecall.check(kent); rc = r ? (r.samenvatting || (PLRecall.samenvat ? PLRecall.samenvat(r) : null)) : null; }
      catch (e) { console.warn('PLZonderUit: terugroepacties niet opgehaald — alleen de RDW-vlag telt', e); }
    }
    if (d && typeof autoKennisVoorMerk === 'function') {
      try {
        var rij = d.rij || {};
        kennis = autoKennisVoorMerk(rij.merk, rij.brandstof_omschrijving || ((d.bs || [])[0] || {}).brandstof_omschrijving, { cc: rij.cilinderinhoud, jaar: String(rij.datum_eerste_toelating || '').slice(0, 4) });
      } catch (e) { console.warn('PLZonderUit: zwakke punten niet bepaald', e); }
    }
    var p = papieren({ kenteken: kent, ts: Date.now(), rdw: d ? d.rij : null, recall: rc, kennis: kennis });
    var naam = d ? d.overzicht.naam : kent;
    _laatste = { kent: kent, naam: naam, p: p };
    if (st) st.textContent = '';
    var h = '<div class="plz-naam">' + esc(naam) + '</div>' +
      '<div class="plz-blok" id="pluOordeel" data-oordeel="' + p.oordeel + '"><b>' + esc(p.kop) + '</b></div>' +
      p.signalen.map(function (s) { return regelHtml(s.kleur, s.onderwerp + ': ' + s.kop, s.uitleg); }).join('') +
      (p.zwak.length ? '<div class="plz-blok"><b>Bekende zwakke punten van dit merk</b>' + p.zwak.map(function (z) { return '<div style="margin-top:4px">• ' + esc(z) + '</div>'; }).join('') + '<div class="plz-klein" style="margin-top:6px">Geen gebrek van déze auto, wel iets om naar te vragen.</div></div>' : '') +
      '<div class="plz-blok"><b>Ter plekke zelf nakijken</b>' + p.bezichtiging.map(function (t) { return '<div style="margin-top:4px">☐ ' + esc(t) + '</div>'; }).join('') +
      '<div style="margin-top:6px"><button type="button" class="plz-kn" onclick="if(typeof showBandenInfo===\'function\')showBandenInfo()">🛞 Hoe werkt de 1-euro-test?</button></div></div>' +
      '<div class="plz-blok"><b>Vragen voor de verkoper</b>' + p.vragen.map(function (q) { return '<div style="margin-top:4px">• ' + esc(q) + '</div>'; }).join('') + '</div>' +
      '<div class="plz-klein">' + esc(p.niet) + '</div>' +
      '<div class="plz-knoppen"><button type="button" class="plz-kn hoofd" id="pluBewaar" onclick="PLZonderUit._bewaar()">💾 Bewaren in Rapporten</button></div>' + ADAPTER +
      (window.PLZonder && PLZonder.BRON ? PLZonder.BRON : '');
    if (uit) uit.innerHTML = h;
    return p;
  }
  function papierenTekst(l) {
    var p = l.p, r = ['PAPIERENRAPPORT — ' + l.naam + ' (' + l.kent + ')', p.kop, ''];
    p.signalen.forEach(function (s) { r.push('[' + s.kleur + '] ' + s.onderwerp + ': ' + s.kop + (s.uitleg ? ' — ' + s.uitleg : '')); });
    if (p.zwak.length) { r.push('', 'Bekende zwakke punten van dit merk:'); p.zwak.forEach(function (z) { r.push('- ' + z); }); }
    r.push('', 'Ter plekke zelf nakijken:'); p.bezichtiging.forEach(function (t) { r.push('[ ] ' + t); });
    r.push('', 'Vragen voor de verkoper:'); p.vragen.forEach(function (q) { r.push('- ' + q); });
    r.push('', p.niet, 'Bron: RDW open data.');
    return r.join('\n');
  }
  function bewaar() {
    if (!_laatste) return null;
    if (typeof registerSessionReport !== 'function') { melding('Bewaren kan nu niet'); return null; }
    var rec = registerSessionReport({ type: 'papieren', title: 'Papierenrapport — ' + _laatste.naam, text: papierenTekst(_laatste) });
    melding(rec ? '📄 Bewaard in Rapporten' : 'Niet bewaard');
    return rec;
  }

  // ── onderhoud ────────────────────────────────────────────────────
  function invoerOnderhoud() {
    var v = voertuig() || {}, m = null;
    try { m = window.PLZonder && PLZonder.mijnAuto(); } catch (e) { console.warn('PLZonderUit: mijn auto onleesbaar', e); }
    var lees = function (id) { var i = el(id); return i ? i.value : ''; };
    return {
      bouwjaar: lees('pluJaar') || v.bouwjaar || null, brandstof: v.brandstof || (m && m.brandstof) || null,
      km: lees('pluKm') || v.kmstand || null, laatsteDatum: lees('pluBeurt') || v.onderhoud_laatst || null,
      laatsteKm: lees('pluBeurtKm') || null, distributie: lees('pluDistr') || v.distributie || null,
      volgendeDatum: v.onderhoud_datum || null, volgendeKm: v.onderhoud_km || null, nu: Date.now()
    };
  }
  function openOnderhoud() {
    var v = voertuig() || {};
    var veld = function (id, lab, w, type) { return '<label class="plz-klein" style="display:block;margin-top:6px">' + lab + '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(w == null ? '' : w) + '" style="width:100%;box-sizing:border-box;margin-top:3px;padding:8px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:500 14px var(--f)"></label>'; };
    blad(TITEL.onderhoud,
      '<div class="plz-klein">Algemene richtwaarden. Het serviceboekje van jouw auto gaat voor.</div>' +
      veld('pluJaar', 'Bouwjaar', v.bouwjaar, 'number') + veld('pluKm', 'Kilometerstand nu', v.kmstand, 'number') +
      veld('pluBeurt', 'Laatste beurt (datum)', v.onderhoud_laatst, 'date') + veld('pluBeurtKm', 'Km-stand bij die beurt', '', 'number') +
      veld('pluDistr', 'Distributie (riem, ketting, riem vervangen)', v.distributie) +
      '<div class="plz-knoppen"><button type="button" class="plz-kn hoofd" id="pluOndGo" onclick="PLZonderUit._onderhoud()">Bekijk</button></div><div id="pluUit"></div>');
    return tekenOnderhoud();
  }
  function tekenOnderhoud() {
    var p = onderhoudPlan(invoerOnderhoud()), uit = el('pluUit');
    if (uit) uit.innerHTML =
      (p.tekort.length ? '<div class="plz-blok">Vul ' + esc(p.tekort.join(' en ')) + ' in voor een scherper beeld.</div>' : '') +
      p.regels.map(function (r) { return regelHtml(KLEUR[r.staat], r.wat + ' — ' + STAAT[r.staat], r.reden); }).join('') +
      '<div class="plz-klein" style="margin-top:8px">"Nagaan" betekent: volgens de leeftijd is het aan de beurt, tenzij het al gedaan is. Kijk in het boekje of de facturen.</div>' + ADAPTER;
    return p;
  }

  // ── lange rit ────────────────────────────────────────────────────
  async function openLangeRit() {
    blad(TITEL.langerit, '<div class="plz-st" id="pluSt">⏳ Even nakijken…</div><div id="pluUit"></div>');
    var kent = mijnKent(), d = null, rcOpen = null;
    if (kent && window.PLZonder) {
      try { d = await PLZonder.haal(String(kent).replace(/[^A-Z0-9]/gi, '').toUpperCase()); } catch (e) { console.warn('PLZonderUit: RDW niet opgehaald — zonder APK en trekgewicht', e); }
      if (window.PLRecall) { try { var r = await PLRecall.check(String(kent).replace(/[^A-Z0-9]/gi, '').toUpperCase()); rcOpen = !!(r && (r.acties || []).some(function (a) { return a.open; })); } catch (e) { console.warn('PLZonderUit: terugroepacties niet opgehaald', e); } }
    }
    var rij = d ? d.rij : {}, apk = datum(rij.vervaldatum_apk || rij.vervaldatum_apk_dt);
    var w = null; try { w = window.PLWinter ? PLWinter.profiel() : null; } catch (e) { console.warn('PLZonderUit: winterprofiel onleesbaar', e); }
    var WK = window.PLWinter && PLWinter._kern, nu = Date.now();
    var lijst = langeRit({ apkDagen: apk != null ? Math.floor((apk - nu) / 864e5) : null, recallOpen: rcOpen, winter: w,
      bandenJaren: WK && w ? WK.dotLeeftijd(w.banden_dot, nu) : null, seizoenWinter: !!(WK && WK.seizoen(nu).soort === 'winter'),
      trekgewicht: rij.maximum_trekken_massa_geremd });
    var st = el('pluSt'); if (st) st.textContent = kent ? '' : 'Tip: met "Dit is mijn auto" (Kenteken-check) kijkt deze lijst ook naar de APK en terugroepacties.';
    var uit = el('pluUit');
    if (uit) uit.innerHTML = lijst.map(function (x) { return regelHtml(KLEUR[x.ernst], x.tekst, ''); }).join('') + ADAPTER;
    return lijst;
  }

  // ── verbruik ─────────────────────────────────────────────────────
  async function openVerbruik() {
    blad(TITEL.verbruik, '<div class="plz-st" id="pluSt">⏳ Even nakijken…</div><div id="pluUit"></div>');
    var v = voertuig(), kent = mijnKent(), tk = null, vt = [];
    if (kent && window.PLZonder) {
      try {
        var d = await PLZonder.haal(String(kent).replace(/[^A-Z0-9]/gi, '').toUpperCase());
        (d && d.bs || []).forEach(function (b) { if (tk == null) tk = getal(b.brandstofverbruik_gecombineerd_wltp) || getal(b.brandstofverbruik_gecombineerd); });
      } catch (e) { console.warn('PLZonderUit: typekeuring niet opgehaald', e); }
    }
    try { if (v && window.PLGarage && PLGarage.tanken && window.PLTank) vt = PLTank.volleTank(await PLGarage.tanken(v.id), []); }
    catch (e) { console.warn('PLZonderUit: tankbeurten niet gelezen', e); }
    var u = verbruik({ volleTank: vt, typekeuring: tk });
    var st = el('pluSt'); if (st) st.textContent = '';
    var knop = v ? '<button type="button" class="plz-kn hoofd" id="pluTank" onclick="PLZonderUit._naarTanken()">⛽ Tankbeurten bijhouden</button>'
      : '<div class="plz-klein">Tankbeurten bijhouden kan in Mijn voertuigen.</div>';
    var uit = el('pluUit');
    if (uit) uit.innerHTML =
      (u.echt != null ? regelHtml('groen', 'Echt verbruik: ' + String(u.echt).replace('.', ',') + ' l/100 km', 'uit ' + u.n + ' volle tank' + (u.n === 1 ? '' : 'en')) : regelHtml('', 'Nog geen gemeten verbruik', u.tekst)) +
      (u.typekeuring != null ? regelHtml('', 'Typekeuring: ' + String(u.typekeuring).replace('.', ',') + ' l/100 km', u.echt != null ? u.tekst : 'in de praktijk meestal 10–25 % hoger') : '') +
      '<div class="plz-knoppen">' + knop + '</div>' + ADAPTER;
    return u;
  }
  function naarTanken() {
    var v = voertuig(); if (!v || !window.PLGarage) return;
    try { PLZonder.sluit(); PLGarage.open(v.id); PLGarage._tab(v.tanken === 'aan' ? 'tanken' : 'profiel'); if (v.tanken !== 'aan') melding('Zet "Tankbeurten bijhouden" aan in het profiel'); }
    catch (e) { console.warn('PLZonderUit: Mijn voertuigen opent niet', e); melding('Mijn voertuigen opent nu niet'); }
  }

  window.PLZonderUit = {
    open: open, soortVoor: soortVoor, TITEL: TITEL, UITLEG: UITLEG, heeftAuto: heeftAuto, poortKaart: poortKaart,
    _papieren: maakPapieren, _bewaar: bewaar, _onderhoud: tekenOnderhoud, _naarTanken: naarTanken,
    _kern: { papieren: papieren, onderhoudPlan: onderhoudPlan, langeRit: langeRit, verbruik: verbruik, soortVoor: soortVoor, KAART: KAART, INTERVALLEN: INTERVALLEN, papierenTekst: papierenTekst }
  };
})();
