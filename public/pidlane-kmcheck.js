/* ═══════════════════════════════════════════════════════════════════
   pidlane-kmcheck.js — PLKm: de kilometerstand-check
   ───────────────────────────────────────────────────────────────────
   WAT DIT BEANTWOORDT

   Niet "wat staat er op de teller" — dat leest een koper zelf af. De
   vraag is: **zeggen de stuurapparaten in deze auto hetzelfde?**

   Een teller terugdraaien gebeurt op het instrumentenpaneel. De rest
   van de auto telt gewoon door: het motorblok houdt een eigen totale
   afstand bij, de ABS rekent er een uit de wielsensoren, en de
   carrosseriemodule onthoudt kilometerstanden voor de service-
   intervallen. Wie er één terugzet en de andere vergeet, laat een gat
   achter. Dít bestand zoekt dat gat.

   DE APP ZEI TOT NU TOE DAT DIT NIET KON

   In de koopcheck stond letterlijk: "OBD2 geeft de echte tellerstand
   niet vrij". Dat klopt voor mode 01 zoals die in 1996 bedoeld was,
   maar niet meer:

     01 A6   J1979-2 / WWH-OBD, totale afstand, 4 bytes, resolutie 0,1 km
     22 xxxx UDS ReadDataByIdentifier, per stuurapparaat, eigen adres

   De eerste is generiek en gaat functioneel (7DF) de bus op. De tweede
   vraagt een CAN-header per module, en dat is precies de reden dat je
   er iets mee kunt: een antwoord van 7E0 en een antwoord van 720 komen
   uit twee verschillende dozen.

   ONAFHANKELIJKHEID IS HET HELE PUNT — EN DIE ZIT IN HET ADRES

   Twee metingen bevestigen elkaar alleen als ze uit twee stuurapparaten
   komen. 22 02 01 en 22 02 00 op header 7E0 zijn ÉÉN bron: hetzelfde
   motorblok, twee identifiers. Dat ze allebei 214.000 km zeggen bewijst
   niets over de teller in het dashboard.

   De kruisvergelijking hieronder groepeert daarom op CAN-adres, niet op
   identifier en niet op modulenaam. 01A6 gaat functioneel de bus op en
   wordt in de praktijk door het motorblok beantwoord; die krijgt daarom
   de groep 'broadcast' MET de aantekening dat hij dezelfde doos kan zijn
   als 7E0. Vallen alleen die twee samen, dan is dat geen bevestiging
   maar één bron die twee keer hetzelfde zegt.

   NOOIT EEN GOK DIE ERUIT ZIET ALS EEN METING

   Voor een OEM-identifier ligt de schaal niet vast. Dezelfde vier bytes
   kunnen kilometers zijn of tienden daarvan — een factor 10 ernaast, en
   je meldt 21.400 km op een auto die er 214.000 heeft gelopen.

   Daarom rekent kandidaten() beide lezingen door en houdt kiesSchaal()
   alleen over wat FYSIEK KAN (1 – 1.600.000 km). Blijft er precies één
   over, dan staat de schaal vast. Blijven er twee over, dan wordt er
   niet gekozen op smaak maar op een anker: een bron waarvan de schaal
   wél vastligt (01A6 heeft er maar één), of de stand die de gebruiker
   van de teller heeft overgetypt. En dan nog alleen als de ene lezing
   MINSTENS VIER KEER dichter bij het anker ligt dan de andere.

   Waarom dat de fraudedetectie niet stiekem dichtsmeert: de twee
   kandidaten schelen een factor 10. Een teruggedraaide teller scheelt
   tienduizenden kilometers, geen factor 10. Bij anker 250.000 kiest de
   regel tussen 150.000 (verschil 100.000) en 15.000 (verschil 235.000)
   de eerste — en meldt vervolgens gewoon dat er 100.000 km verschil
   zit. De schaalkeuze en het oordeel zijn twee aparte stappen, en dat
   moeten ze blijven.

   Lukt het ankeren niet, dan blijft de bron `zeker:false` en telt hij
   NIET mee in het oordeel. Hij staat wel in het verslag, met zijn ruwe
   bytes erbij, zodat één rit genoeg is om de schaal vast te leggen.

   AFWEZIGHEID IS GEEN BEWIJS

   Geen antwoord op 22 60 01 betekent dat deze auto die identifier niet
   kent — de meeste merken hebben hun eigen nummers. Dat is een
   beperking van de meting, nooit een aanwijzing over de auto. Een
   stille bus levert 'onbekend' op en geen enkel oordeel; dezelfde
   polariteit als PLBusGate.

   DE ADAPTER WORDT ALTIJD TERUGGEZET

   Deze check zet ATSH en ATCRA om, en dat raakt de hele app: blijft
   7E0 staan, dan praat daarna alles alleen nog tegen het motorblok en
   merk je dat pas als een andere module niets meer teruggeeft. Het
   terugzetten staat daarom in een finally, net als in blok 8/9 van de
   testrun.

   WAT HIER NIET GETOETST IS
   ATCRA (het ontvangstfilter) is op geen echte auto nagemeten. Een
   ELM327 zet het filter automatisch mee voor 7Ex; voor 720/726/760/7B0
   is dat niet gegarandeerd. Weigert de adapter het commando, dan gaat
   de check gewoon door zonder filter en staat dat in het verslag —
   nooit stil overslaan. Zie CAMPAGNE en §11 van PIDLANE.md.

   Alles hier is lezend. Mode 22 met ReadDataByIdentifier schrijft niet.

   Laadvolgorde: ná pidlane-bt.js (sendCmd) en pidlane-data.js (withBus).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CFG = {
    cmdTimeoutMs: 2500,
    atTimeoutMs: 1500,
    pauzeMs: 90,          // adempauze tussen commando's; onder ~60 ms geeft een
                          // trage dongle STOPPED terug op de volgende regel
    busWachtMs: 9000,
    // Fysiek mogelijke tellerstand. Onder de 1 km is geen meting maar een
    // niet-ingevulde identifier; boven 1,6 miljoen km bestaat geen
    // personenauto. Beide grenzen dienen alleen om een schaal uit te
    // sluiten, nooit om een auto te beoordelen.
    kmMin: 1,
    kmMax: 1600000,
    // Speling tussen twee stuurapparaten. Een ABS rekent uit wielomtrek,
    // een motorblok uit snelheid maal tijd; die lopen over 200.000 km
    // gerust een paar honderd kilometer uiteen zonder dat er iets mis is.
    tolVastKm: 500,
    tolPct: 0.01,
    // Onder deze stand na een DTC-wis, op een auto met een serieuze
    // teller, is het wissen zo vers dat het opvalt.
    versWisKm: 100,
    versWisOdoKm: 20000,
    // Het anker beslist alleen de ORDE VAN GROOTTE. Twee kandidaten
    // schelen een factor 10; een echte tellerstand wijkt nooit een factor
    // 5 af van een andere module in dezelfde auto. Precies één kandidaat
    // binnen dit venster = de schaal staat vast. Nul of twee = niet.
    ankerVenster: 5
  };

  /* ── DE BRONNEN ────────────────────────────────────────────────────
     `groep` is het CAN-adres en daarmee de identiteit van de doos.
     `module` is een naam voor de mens en mag onzeker zijn: 760 wordt
     zowel voor een instrumentenpaneel als voor een ABS-regelaar
     gebruikt, en welke van de twee het hier is, weet je pas als je het
     antwoord ziet. Die onzekerheid staat in de naam en niet in de
     rekenkant — het oordeel gaat over adressen.

     `schaal` is de lijst lezingen die serieus genomen wordt. 01A6 heeft
     er één omdat J1979-2 de resolutie vastlegt; een OEM-identifier
     heeft er twee omdat het merk mag kiezen. */
  var BRONNEN = [
    { id: '01A6',     rol: 'odo',   cmd: '01A6',   kop: '41A6',   bytes: 4, schaal: [0.1],
      header: null,  groep: 'broadcast', ookGroep: '7E0',
      module: 'Motor-ECU (generiek 01 A6)',
      uitleg: 'SAE J1979-2 totale afstand, functioneel gevraagd' },

    { id: '0131',     rol: 'sinds', cmd: '0131',   kop: '4131',   bytes: 2, schaal: [1],
      header: null,  groep: 'broadcast',
      module: 'Afstand sinds wissen storingen',
      uitleg: 'geen tellerstand — een aanwijzing over hoe vers de foutcodes gewist zijn' },

    { id: '7E0-0201', rol: 'odo',   cmd: '220201', kop: '620201', bytes: 4, schaal: [1, 0.1],
      header: '7E0', groep: '7E0',
      module: 'PCM / motorstuurapparaat',
      uitleg: 'totale berekende afstand in het motorblok' },

    { id: '7E0-0200', rol: 'odo',   cmd: '220200', kop: '620200', bytes: 4, schaal: [1, 0.1],
      header: '7E0', groep: '7E0',
      module: 'PCM / motorstuurapparaat (tweede identifier)',
      uitleg: 'zelfde doos als 22 02 01 — bevestigt die niet' },

    { id: '720-6001', rol: 'odo',   cmd: '226001', kop: '626001', bytes: 4, schaal: [1, 0.1],
      header: '720', groep: '720',
      module: 'IPC / instrumentenpaneel',
      uitleg: 'de stand zoals die op het dashboard staat' },

    { id: '720-0201', rol: 'odo',   cmd: '220201', kop: '620201', bytes: 4, schaal: [1, 0.1],
      header: '720', groep: '720',
      module: 'IPC / instrumentenpaneel (tweede identifier)',
      uitleg: 'zelfde doos als 22 60 01' },

    { id: '760-6001', rol: 'odo',   cmd: '226001', kop: '626001', bytes: 4, schaal: [1, 0.1],
      header: '760', groep: '760',
      module: 'IPC of ABS op 760',
      uitleg: 'welke van de twee op dit adres zit, blijkt pas uit het antwoord' },

    { id: '760-2B0B', rol: 'odo',   cmd: '222B0B', kop: '622B0B', bytes: 4, schaal: [1, 0.1],
      header: '760', groep: '760',
      module: 'ABS / ESP op 760',
      uitleg: 'afstand uit de wielsnelheidssensoren' },

    { id: '7B0-2B0B', rol: 'odo',   cmd: '222B0B', kop: '622B0B', bytes: 4, schaal: [1, 0.1],
      header: '7B0', groep: '7B0',
      module: 'ABS / ESP op 7B0',
      uitleg: 'afstand uit de wielsnelheidssensoren' },

    { id: '726-0202', rol: 'odo',   cmd: '220202', kop: '620202', bytes: 3, schaal: [1, 0.1],
      header: '726', groep: '726',
      module: 'BCM / carrosseriemodule',
      uitleg: 'afstands- en servicegeheugen, drie bytes' },

    /* ── DE VIN PER STUURAPPARAAT ─────────────────────────────────
       Toegevoegd 04-09-2026, na de kaartrit van 13:43. Die vond op deze
       CX-5 vier stuurapparaten die 22F190 beantwoorden — en alle vier
       met dezelfde VIN. Twee andere gaven een VIN van louter nullen.

       Dat is een controle die niets extra's kost en die geen enkele
       tellerstand nodig heeft: een stuurapparaat met een ANDERE VIN is
       ergens anders vandaan gekomen. Bij een auto waarvan de teller
       terug is gezet, is een vervangen instrumentenpaneel de meest
       voorkomende manier waarop dat gebeurt.

       17 bytes, geen schaal, geen kilometers — vandaar rol 'vin'. Het
       oordeel eroverheen staat in vinConsistentie(). */
    { id: 'vin-7E0', rol: 'vin', cmd: '22F190', kop: '62F190', bytes: 17, schaal: [],
      header: '7E0', groep: '7E0', module: 'PCM / motorstuurapparaat', uitleg: 'VIN zoals dit stuurapparaat hem kent' },
    { id: 'vin-720', rol: 'vin', cmd: '22F190', kop: '62F190', bytes: 17, schaal: [],
      header: '720', groep: '720', module: 'IPC / instrumentenpaneel', uitleg: 'VIN zoals de teller hem kent' },
    { id: 'vin-726', rol: 'vin', cmd: '22F190', kop: '62F190', bytes: 17, schaal: [],
      header: '726', groep: '726', module: 'BCM / carrosseriemodule', uitleg: 'VIN zoals de carrosseriemodule hem kent' },
    { id: 'vin-760', rol: 'vin', cmd: '22F190', kop: '62F190', bytes: 17, schaal: [],
      header: '760', groep: '760', module: 'IPC of ABS op 760', uitleg: 'VIN op dit adres' },
    { id: 'vin-7B0', rol: 'vin', cmd: '22F190', kop: '62F190', bytes: 17, schaal: [],
      header: '7B0', groep: '7B0', module: 'ABS / ESP op 7B0', uitleg: 'VIN op dit adres' }
  ];

  // Adressen waarvan de teller op het dashboard komt. Staat een van deze
  // LAGER dan een rekenende module, dan is dat het patroon van
  // terugdraaien en niet van meetruis.
  var TELLERGROEPEN = { '720': true, '760': true };

  // ── Hulp ───────────────────────────────────────────────────────────

  var pauze = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var esc = function (x) {
    return String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  function diag(msg, lvl) {
    try { if (typeof btDiag === 'function') btDiag(msg, lvl || 'info'); }
    catch (e) { console.warn('PLKm: melden mislukt', e); }
  }
  function getal(km) {
    if (km == null) return '—';
    return Math.round(km).toLocaleString('nl-NL') + ' km';
  }

  /* Ontvangstadres bij een zendadres: 11-bit CAN antwoordt op zender + 8.
     7E0→7E8, 720→728, 726→72E, 760→768, 7B0→7B8. */
  function rxVan(txHex) {
    var n = parseInt(txHex, 16);
    if (!isFinite(n)) return null;
    return (n + 8).toString(16).toUpperCase().padStart(3, '0');
  }

  /* Alle hex uit een ELM-respons, zonder de statusregels. Bewust dezelfde
     vorm als in blok 8/9 van de testrun: die is op een echte adapter
     gemeten en vangt de rommel die er werkelijk uitkomt. */
  function naarHex(ruw) {
    var regels = String(ruw || '').replace(/\r/g, '\n').split('\n');
    var uit = '';
    for (var i = 0; i < regels.length; i++) {
      var r = regels[i].trim();
      if (!r || r === '>') continue;
      if (/^(SEARCHING|BUS INIT|STOPPED|NO DATA|CAN ERROR|UNABLE TO CONNECT|BUFFER|\?)/i.test(r)) continue;
      r = r.replace(/^[0-9A-F]\s*:\s*/i, '');            // ISO-TP regelnummer
      uit += r.replace(/[^0-9A-Fa-f]/g, '');
    }
    return uit.toUpperCase();
  }

  /* Databytes achter de verwachte kop. Geeft null als de kop er niet in
     zit: dan is er geen antwoord op DEZE vraag, wat er verder ook
     langskwam. Een 7F wordt apart gemeld, want "identifier bestaat niet"
     is iets anders dan stilte. */
  function leesDid(ruw, kop, aantal) {
    var h = naarHex(ruw);
    if (!h) return { bytes: null, reden: 'stil' };
    var i = h.indexOf(kop);
    if (i < 0) {
      // Een negatief antwoord draagt de SID van het VERZOEK, niet die van het
      // antwoord: 7F 22 31, niet 7F 62 31. Op '7F62' zoeken vindt dus nooit
      // iets, en dan valt een weigering stilzwijgend in de bak 'geen antwoord'
      // — waarmee "deze identifier bestaat niet op dit adres" niet te
      // onderscheiden is van "dit stuurapparaat is er niet". Antwoord-SID is
      // verzoek-SID + 0x40, dus hier weer eraf.
      var vraagSid = ((parseInt(kop.substr(0, 2), 16) - 0x40) & 0xFF)
        .toString(16).toUpperCase().padStart(2, '0');
      var n = h.indexOf('7F' + vraagSid);
      if (n >= 0) {
        var rc = h.substr(n + 4, 2);
        return { bytes: null, reden: 'geweigerd', nrc: rc, nrcTekst: nrcTekst(rc), sid: vraagSid };
      }
      return { bytes: null, reden: 'stil' };
    }
    var data = h.substr(i + kop.length, aantal * 2);
    if (data.length < aantal * 2) return { bytes: null, reden: 'te kort', ruwHex: data };
    var bytes = [];
    for (var b = 0; b < aantal; b++) bytes.push(parseInt(data.substr(b * 2, 2), 16));
    return { bytes: bytes, hex: data };
  }

  function nrcTekst(rc) {
    return ({
      '11': 'service niet ondersteund',
      '12': 'subfunctie onbekend',
      '13': 'verkeerde lengte',
      '22': 'condities niet goed',
      '31': 'identifier bestaat niet op dit adres',
      '33': 'beveiliging vereist',
      '78': 'antwoord duurt langer'
    })[rc] || 'reden ' + rc;
  }

  /* Bytes → getal. Big-endian, ongesigneerd; een afstandsteller telt op. */
  function naarWaarde(bytes) {
    var v = 0;
    for (var i = 0; i < bytes.length; i++) v = v * 256 + (bytes[i] & 0xFF);
    return v;
  }

  /* Alles 0xFF is de standaardvulling van een identifier die bestaat maar
     niets bevat. Alles 0x00 óók: een auto met precies 0 km staat niet bij
     een koper op de oprit. Beide zijn geen meting. */
  function isVulling(bytes) {
    var allesFF = true, allesNul = true;
    for (var i = 0; i < bytes.length; i++) {
      if ((bytes[i] & 0xFF) !== 0xFF) allesFF = false;
      if ((bytes[i] & 0xFF) !== 0x00) allesNul = false;
    }
    return allesFF || allesNul;
  }

  function kandidaten(waarde, schalen) {
    var uit = [];
    for (var i = 0; i < schalen.length; i++) {
      var km = Math.round(waarde * schalen[i] * 10) / 10;
      uit.push({ schaal: schalen[i], km: km, plausibel: km >= CFG.kmMin && km <= CFG.kmMax });
    }
    return uit;
  }

  /* DE SCHAALKEUZE — en waarom die niet op "dichtst bij het anker" mag.

     De eerste opzet koos de kandidaat die het dichtst bij het anker lag,
     mits die minstens vier keer dichterbij lag dan de andere. Dat werkt
     precies in het geval waar niets aan de hand is, en faalt in het geval
     waarvoor deze module bestaat: bij een teruggedraaide teller (118.000
     naast een anker van 214.000) zijn de afstanden 96.000 en 202.200 —
     ratio 2,1, dus "te dicht bij elkaar", dus geen oordeel. De regel gooide
     de fraude weg.

     Wat een anker wél mag beslissen, is de ORDE VAN GROOTTE. De twee
     kandidaten schelen een factor 10; twee stuurapparaten in dezelfde auto
     schelen nooit een factor 5. Precies één kandidaat binnen dat venster:
     de schaal staat vast, en het VERSCHIL met het anker blijft daarna
     gewoon staan om beoordeeld te worden. Nul of twee kandidaten binnen
     het venster: geen keuze, en de meting telt niet mee.

     Schaalkeuze en oordeel zijn twee stappen, en dat moeten ze blijven. */
  function kiesSchaal(kans, anker) {
    var plaus = kans.filter(function (k) { return k.plausibel; });
    if (!plaus.length) {
      return { km: null, zeker: false, reden: 'geen lezing binnen ' + CFG.kmMin + ' – ' + CFG.kmMax + ' km' };
    }
    if (plaus.length === 1) {
      return { km: plaus[0].km, schaal: plaus[0].schaal, zeker: true, reden: 'één mogelijke schaal' };
    }
    var lijst = plaus.map(function (k) { return Math.round(k.km); }).join(' of ');
    if (anker != null && isFinite(anker) && anker > 0) {
      var onder = anker / CFG.ankerVenster, boven = anker * CFG.ankerVenster;
      var binnen = plaus.filter(function (k) { return k.km >= onder && k.km <= boven; });
      if (binnen.length === 1) {
        return { km: binnen[0].km, schaal: binnen[0].schaal, zeker: true, viaAnker: true,
                 reden: 'schaal ' + binnen[0].schaal + ': als enige binnen een factor ' +
                        CFG.ankerVenster + ' van het anker (' + Math.round(anker) + ' km)' };
      }
      return { km: plaus[0].km, schaal: plaus[0].schaal, zeker: false,
               reden: binnen.length
                 ? 'beide lezingen (' + lijst + ' km) liggen binnen een factor ' + CFG.ankerVenster +
                   ' van het anker — het anker kiest niet'
                 : 'geen enkele lezing (' + lijst + ' km) ligt binnen een factor ' + CFG.ankerVenster +
                   ' van het anker (' + Math.round(anker) + ' km)' };
    }
    return { km: plaus[0].km, schaal: plaus[0].schaal, zeker: false,
             reden: 'meerdere schalen mogelijk (' + lijst + ' km) en geen anker' };
  }

  /* ── DE VIN: MASKEREN AAN DE BRON ──────────────────────────────
     §7 is hard: een VIN gaat NOOIT ruw de telefoon uit, en §11 beschrijft
     hoe het testrunverslag daar op 03-09 het derde lek voor bleek. Deze
     module leest de VIN nu op vijf adressen, en de kaartmaker op achttien —
     dus de regel moet hier staan en niet bij de uitvoer.

     Niet maskeren bij het TONEN maar bij het OPSLAAN. Een meting die de
     ruwe VIN nooit vasthoudt, kan hem ook niet lekken via een render, een
     export, een AI-prompt of een logboek dat later ergens geplakt wordt.
     Wat er overblijft is precies wat de app elders ook toont: de laatste
     zes tekens plus het pseudoniem. */
  var VIN_TEKENS = /^[A-HJ-NPR-Z0-9]{17}$/;    // ISO 3779: geen I, O of Q

  function bytesNaarTekst(bytes) {
    var t = '';
    for (var i = 0; i < bytes.length; i++) {
      var c = bytes[i] & 0xFF;
      if (c === 0x00) continue;
      t += String.fromCharCode(c);
    }
    return t.trim();
  }

  function isVin(tekst) { return VIN_TEKENS.test(String(tekst || '').toUpperCase()); }

  /* Geeft {staart, id} terug — nooit de VIN zelf. Het pseudoniem komt van
     _vlVinPseudoniem() zodat twee stuurapparaten met dezelfde VIN hier ook
     hetzelfde id krijgen: dat is wat de vergelijking hieronder nodig heeft,
     en het is precies hetzelfde pseudoniem als in de logs. */
  async function vinKenmerk(vin) {
    var v = String(vin || '').toUpperCase();
    var uit = { staart: v ? '…' + v.slice(-6) : '', id: '' };
    try {
      if (typeof _vlVinPseudoniem === 'function') uit.id = await _vlVinPseudoniem(v) || '';
    } catch (e) {
      console.warn('PLKm: VIN niet gepseudonimiseerd — vergelijken tussen stuurapparaten valt weg', e);
    }
    // Zonder pseudoniem valt er niets te vergelijken. Terugvallen op de ruwe
    // VIN als sleutel is precies wat er niet mag, dus dan liever geen oordeel.
    if (!uit.id) uit.id = null;
    return uit;
  }

  /* ── HET OORDEEL OVER DE VIN'S ─────────────────────────────────
     Puur, en met opzet los: de kaartmaker ziet achttien stuurapparaten en
     deze module vijf. Beide moeten tot hetzelfde oordeel komen, dus staat
     dat oordeel op één plek.

     Wat het WEL zegt: twee stuurapparaten in deze auto dragen een
     verschillende VIN. Dat kan maar op één manier — één ervan komt ergens
     anders vandaan.
     Wat het NIET zegt: dat een blanco VIN fout is. Veel modules krijgen er
     nooit een. Dat is een aandachtspunt en geen beschuldiging. */
  function vinConsistentie(bronnen) {
    var lijst = (bronnen || []).filter(function (b) { return b.rol === 'vin'; });
    var metVin = lijst.filter(function (b) { return b.vinId; });
    var blanco = lijst.filter(function (b) { return b.vinBlanco; });
    var uit = { niveau: 'onbekend', bevindingen: [], aantal: metVin.length, blanco: blanco.length, tekst: '' };

    if (!metVin.length) {
      uit.tekst = 'geen enkel stuurapparaat gaf een VIN terug';
      return uit;
    }

    var ids = {};
    metVin.forEach(function (b) { (ids[b.vinId] = ids[b.vinId] || []).push(b); });
    var sleutels = Object.keys(ids);

    if (sleutels.length > 1) {
      uit.niveau = 'kritiek';
      uit.tekst = 'stuurapparaten dragen VERSCHILLENDE voertuignummers';
      uit.bevindingen.push({
        ernst: 'kritiek', kop: 'Niet alle stuurapparaten horen bij dezelfde auto',
        tekst: sleutels.map(function (k) {
          return ids[k].map(function (b) { return b.module + ' (' + b.groep + ')'; }).join(' + ') +
                 ' → ' + (ids[k][0].vinStaart || 'onbekend');
        }).join('  |  ') + '. Twee verschillende voertuignummers in één auto betekent dat ' +
          'minstens één stuurapparaat ergens anders vandaan komt. Bij een teruggezette teller ' +
          'is een vervangen instrumentenpaneel de gebruikelijke manier waarop dat gebeurt.'
      });
    } else if (metVin.length >= 2) {
      uit.niveau = 'ok';
      uit.tekst = metVin.length + ' stuurapparaten dragen hetzelfde voertuignummer (' +
        (metVin[0].vinStaart || '') + ')';
    } else {
      uit.niveau = 'onbevestigd';
      uit.tekst = 'maar één stuurapparaat gaf een VIN — niets om tegen af te zetten';
    }

    if (blanco.length) {
      if (uit.niveau === 'ok' || uit.niveau === 'onbevestigd') uit.niveau = 'let-op';
      uit.bevindingen.push({
        ernst: 'let-op', kop: blanco.length + ' stuurapparaat(en) met een leeg voertuignummer',
        tekst: blanco.map(function (b) { return b.module + ' (' + b.groep + ')'; }).join(', ') +
          ' antwoordt wél op de vraag maar geeft alleen nullen terug. Dat is géén bewijs: veel ' +
          'modules krijgen nooit een VIN ingeprogrammeerd. Het is wel het beeld dat een vervangen ' +
          'module achterlaat, dus het is de moeite waard te weten wat er op die adressen zit.'
      });
    }
    return uit;
  }

  function tolerantie(hoogste) {
    return Math.max(CFG.tolVastKm, Math.round(hoogste * CFG.tolPct));
  }

  /* ── HET OORDEEL ───────────────────────────────────────────────────
     Puur: metingen erin, conclusie eruit. Geen bus, geen DOM, geen klok.
     Dat is met opzet — dit is het stuk dat een test kán vastpinnen, en
     het stuk waar een fout het duurst is. */
  function oordeel(metingen, opgegeven) {
    var bronnen = metingen || [];
    var odo = bronnen.filter(function (b) { return b.rol === 'odo' && b.km != null; });
    var bruikbaar = odo.filter(function (b) { return b.zeker; });
    var sinds = bronnen.filter(function (b) { return b.rol === 'sinds' && b.km != null; })[0] || null;

    var bev = [];                    // bevindingen, ernstigste eerst gesorteerd
    var niveau = 'onbekend';
    var rang = { onbekend: 0, onbevestigd: 1, ok: 2, 'let-op': 3, kritiek: 4 };
    function til(n) { if (rang[n] > rang[niveau]) niveau = n; }

    // Groepen: één per CAN-adres. Binnen een groep telt de hoogste, want
    // twee identifiers uit dezelfde doos zijn één waarneming.
    var perGroep = {};
    bruikbaar.forEach(function (b) {
      var g = perGroep[b.groep];
      if (!g || b.km > g.km) perGroep[b.groep] = b;
    });
    var groepen = Object.keys(perGroep).map(function (g) { return perGroep[g]; });

    if (!odo.length) {
      // Geen tellerstand betekent niet: geen oordeel. De VIN-controle heeft
      // er geen kilometers voor nodig, en op een auto waar mode 22 de teller
      // niet vrijgeeft is dat het enige dat er nog te zeggen valt.
      var vinAlleen = vinConsistentie(bronnen);
      return {
        niveau: vinAlleen.niveau === 'kritiek' ? 'kritiek' : (vinAlleen.niveau === 'let-op' ? 'let-op' : 'onbekend'),
        km: null, bevindingen: vinAlleen.bevindingen, vin: vinAlleen,
        tekst: 'Geen enkel stuurapparaat gaf een tellerstand terug' +
          (vinAlleen.niveau === 'onbekend' ? ' — geen oordeel mogelijk' : '; wel: ' + vinAlleen.tekst),
        groepen: [], onafhankelijkeBronnen: 0, tolerantieKm: CFG.tolVastKm,
        onzeker: bronnen.filter(function (b) { return b.km != null && !b.zeker; })
      };
    }

    // De gerapporteerde stand: de hoogste bruikbare. Een teller loopt op;
    // bij verschil is de hoogste per definitie de minst weersproken.
    var hoogste = null, laagste = null;
    groepen.forEach(function (b) {
      if (hoogste == null || b.km > hoogste.km) hoogste = b;
      if (laagste == null || b.km < laagste.km) laagste = b;
    });

    var tol = hoogste ? tolerantie(hoogste.km) : CFG.tolVastKm;

    // ONAFHANKELIJKHEID. 'broadcast' (01A6) gaat functioneel de bus op en
    // wordt in de praktijk door het motorblok beantwoord. Vallen alleen
    // 'broadcast' en '7E0' samen, dan is dat waarschijnlijk één doos die
    // twee keer hetzelfde zegt — geen bevestiging.
    var echteGroepen = groepen.map(function (b) { return b.groep; });
    var buitenBroadcast = echteGroepen.filter(function (g) { return g !== 'broadcast'; });
    var onafhankelijk = buitenBroadcast.length >= 2 ||
      (buitenBroadcast.length === 1 && echteGroepen.indexOf('broadcast') >= 0 && buitenBroadcast[0] !== '7E0');

    if (!groepen.length) {
      til('onbekend');
      bev.push({ ernst: 'let-op', kop: 'Schaal niet vast te stellen',
        tekst: 'Er kwamen wel getallen terug, maar bij geen enkele bron staat de eenheid vast. ' +
               'Type de stand van de teller in en draai opnieuw: dan is er een anker.' });
    } else {
      // Het verschil wordt ALTIJD gerekend zodra er twee antwoorden zijn,
      // ook tussen 'broadcast' en 7E0. Twee antwoorden op overlappende
      // vragen die elkaar tegenspreken zijn een bevinding, ongeacht of ze
      // uit één doos komen — dan klopt er nóg iets niet.
      var verschil = groepen.length >= 2 ? (hoogste.km - laagste.km) : 0;
      if (groepen.length >= 2 && verschil > tol) {
        til('kritiek');
        var b = { ernst: 'kritiek', kop: 'Stuurapparaten zijn het oneens',
          tekst: laagste.module + ' meldt ' + getal(laagste.km) + ' en ' + hoogste.module +
                 ' meldt ' + getal(hoogste.km) + ' — een verschil van ' + getal(verschil) +
                 ', ruim boven de speling van ' + getal(tol) + ' die twee rekenwijzen mogen schelen.' };
        if (TELLERGROEPEN[laagste.groep] && !TELLERGROEPEN[hoogste.groep]) {
          b.tekst += ' De láágste is het instrumentenpaneel, en dat is precies het patroon ' +
                     'van een teruggedraaide teller: het dashboard is aangepast, de rekenende ' +
                     'module niet.';
          b.patroon = 'teller-lager';
        }
        bev.push(b);
      } else if (onafhankelijk) {
        til('ok');
      } else {
        til('onbevestigd');
        if (groepen.length >= 2) {
          bev.push({ ernst: 'info', kop: 'Beide antwoorden kunnen uit hetzelfde stuurapparaat komen',
            tekst: 'De generieke vraag 01 A6 gaat functioneel de bus op en wordt meestal door het ' +
                   'motorblok beantwoord — hetzelfde adres als 7E0. Dat ze gelijk zijn, bevestigt ' +
                   'de teller in het dashboard dus niet.' });
        }
      }
    }

    // De opgegeven stand van de teller. Ligt die onder wat een module
    // onthoudt, dan klopt het bordje niet met de auto.
    if (opgegeven != null && isFinite(opgegeven) && opgegeven > 0 && hoogste) {
      var d = hoogste.km - opgegeven;
      if (d > tol) {
        til('kritiek');
        bev.push({ ernst: 'kritiek', kop: 'Opgegeven stand ligt lager dan de auto zelf zegt',
          tekst: 'Ingevoerd: ' + getal(opgegeven) + '. ' + hoogste.module + ' meldt ' +
                 getal(hoogste.km) + ' — ' + getal(d) + ' meer.' });
      } else if (-d > tol) {
        til('let-op');
        bev.push({ ernst: 'let-op', kop: 'Opgegeven stand ligt hoger dan alle stuurapparaten',
          tekst: 'Ingevoerd: ' + getal(opgegeven) + ', hoogste module ' + getal(hoogste.km) +
                 '. Dat is geen aanwijzing voor terugdraaien. Een vervangen instrumentenpaneel, ' +
                 'een module die pas later is bijgezet of een typefout geven ditzelfde beeld.' });
      }
    }

    // Afstand sinds het wissen van storingen. Zegt niets over de teller,
    // wel over wat er vlak vóór de verkoop is gebeurd.
    if (sinds) {
      if (sinds.km >= 65535) {
        // De teller loopt vast op twee bytes; boven 65535 km staat hij stil.
        bev.push({ ernst: 'info', kop: 'Afstand sinds wissen staat op zijn maximum',
          tekst: '65.535 km is de bovengrens van deze teller — er valt niets uit af te leiden.' });
      } else if (hoogste && sinds.km > hoogste.km + tol) {
        til('kritiek');
        bev.push({ ernst: 'kritiek', kop: 'Onmogelijke combinatie',
          tekst: 'Sinds het wissen van de storingen zou ' + getal(sinds.km) + ' gereden zijn, ' +
                 'terwijl de hoogste tellerstand ' + getal(hoogste.km) + ' is. Meer rijden dan ' +
                 'de auto in totaal heeft gelopen kan niet: één van beide tellers is aangeraakt.' });
      } else if (sinds.km < CFG.versWisKm && hoogste && hoogste.km > CFG.versWisOdoKm) {
        til('let-op');
        bev.push({ ernst: 'let-op', kop: 'Storingen zijn kort geleden gewist',
          tekst: 'Sinds het wissen is ' + getal(sinds.km) + ' gereden op een auto van ' +
                 getal(hoogste.km) + '. Foutcodes die vlak vóór een bezichtiging verdwijnen, ' +
                 'komen na een paar honderd kilometer vaak terug. Lees mode 07 en de ' +
                 'gereedheidsmonitoren voordat je een schone foutenlijst gelooft.' });
      }
    }

    // De VIN-controle staat los van de kilometers en kan ook een oordeel
    // dragen als er geen enkele tellerstand gelezen is. Vandaar dat hij
    // hier meedoet en niet pas na de vroege 'onbekend'-uitgang hierboven.
    var vin = vinConsistentie(bronnen);
    if (vin.niveau === 'kritiek') til('kritiek');
    else if (vin.niveau === 'let-op') til('let-op');
    vin.bevindingen.forEach(function (b) { bev.push(b); });

    var onzeker = bronnen.filter(function (b) { return b.km != null && !b.zeker; });
    if (onzeker.length) {
      bev.push({ ernst: 'info', kop: onzeker.length + ' meting(en) zonder vaste schaal',
        tekst: 'Deze antwoorden staan in het verslag met hun ruwe bytes, maar tellen niet mee ' +
               'in het oordeel. Een getal waarvan de eenheid niet vaststaat is geen meting.' });
    }

    var tekst;
    if (niveau === 'kritiek') tekst = 'De kilometerstand is NIET betrouwbaar — ' + bev[0].kop.toLowerCase();
    else if (niveau === 'let-op') tekst = 'Tellerstand onderling consistent, maar er is een aandachtspunt';
    else if (niveau === 'ok') tekst = 'Bevestigd door ' + groepen.length + ' stuurapparaten: ' + getal(hoogste.km);
    else if (niveau === 'onbevestigd') tekst = getal(hoogste ? hoogste.km : null) +
      ' gelezen, maar niet onafhankelijk bevestigd door een tweede stuurapparaat';
    else tekst = 'Geen bruikbare tellerstand gelezen';

    bev.sort(function (a, b) {
      var r = { kritiek: 0, 'let-op': 1, info: 2 };
      return r[a.ernst] - r[b.ernst];
    });

    return {
      niveau: niveau, tekst: tekst,
      km: hoogste ? hoogste.km : null,
      hoogste: hoogste, laagste: laagste,
      tolerantieKm: tol,
      groepen: groepen,
      vin: vin,
      onafhankelijkeBronnen: groepen.length,
      bevindingen: bev,
      onzeker: onzeker
    };
  }

  /* ── DE RIT LANGS DE STUURAPPARATEN ────────────────────────────────
     Neemt het busslot over zodat de achtergrondpoll er niet doorheen
     praat: tussen ATSH7E0 en het antwoord mag er geen 010C langskomen,
     want die zou op het motorblok gericht de bus opgaan én het antwoord
     door elkaar husselen. */
  async function check(opties) {
    opties = opties || {};
    var onStap = typeof opties.onStap === 'function' ? opties.onStap : function () { };
    var opgegeven = (opties.opgegeven != null && isFinite(opties.opgegeven)) ? Number(opties.opgegeven) : null;

    if (typeof sendCmd !== 'function') throw new Error('PLKm: sendCmd niet beschikbaar');
    if (typeof connected !== 'undefined' && !connected) throw new Error('PLKm: geen verbinding');
    if (typeof demoMode !== 'undefined' && demoMode) throw new Error('PLKm: demomodus geeft geen echte tellerstand');

    var t0 = Date.now();
    var res = { metingen: [], stappen: [], protocol: '', craGebruikt: null, duurMs: 0, opgegeven: opgegeven };

    function stap(naam, staat, detail) {
      var s = { naam: naam, staat: staat, detail: detail || '' };
      res.stappen.push(s);
      try { onStap(s, res); } catch (e) { console.warn('PLKm: voortgangsmelder gaf een fout', e); }
      return s;
    }

    var werk = async function () {
      // ── Stap 1: is dit een bus waar mode 22 überhaupt op werkt? ──
      var proto = '';
      try { proto = String(await sendCmd('ATDPN', CFG.atTimeoutMs) || '').trim(); }
      catch (e) { console.warn('PLKm: ATDPN mislukt', e); }
      res.protocol = proto;
      var elfBit = /^A?6$/i.test(proto.replace(/[^0-9A-Za-z]/g, ''));
      stap('Protocol vaststellen', elfBit ? 'ok' : 'let-op',
        'ATDPN = "' + (proto || '—') + '"' + (elfBit ? ' — 11-bit CAN, mode 22 is te richten'
          : ' — geen 11-bit CAN; alleen de generieke PIDs worden gevraagd'));

      // ── Stap 2: de generieke bronnen, functioneel ──
      var anker = opgegeven;
      for (var i = 0; i < BRONNEN.length; i++) {
        var br = BRONNEN[i];
        if (br.header) continue;
        var m = await meetBron(br, anker, stap);
        res.metingen.push(m);
        if (m.rol === 'odo' && m.km != null && m.zeker && anker == null) anker = m.km;
        await pauze(CFG.pauzeMs);
      }

      if (!elfBit) {
        stap('Stuurapparaten afzonderlijk', 'overgeslagen',
          'zonder 11-bit CAN valt er geen CAN-header te zetten, dus is er niets te kruisen');
        return;
      }

      // ── Stap 3: per stuurapparaat, met eigen zend- en ontvangstadres ──
      var vorigeHeader = null;
      for (var j = 0; j < BRONNEN.length; j++) {
        var b = BRONNEN[j];
        if (!b.header) continue;

        if (b.header !== vorigeHeader) {
          var gezet = await zetHeader(b.header, stap, res);
          if (!gezet) { vorigeHeader = null; continue; }
          vorigeHeader = b.header;
          await pauze(CFG.pauzeMs);
        }

        var mm = await meetBron(b, anker, stap);
        res.metingen.push(mm);
        if (mm.rol === 'odo' && mm.km != null && mm.zeker && anker == null) anker = mm.km;
        await pauze(CFG.pauzeMs);
      }
    };

    try {
      if (typeof withBus === 'function') await withBus('kmcheck', werk, CFG.busWachtMs);
      else await werk();
    } finally {
      // ALTIJD terug naar de functionele broadcast, ook als er halverwege
      // iets klapte. Blijft 7E0 of 720 staan, dan praat de rest van de app
      // daarna tegen één doos en merk je dat pas veel later.
      try { await sendCmd('ATSH7DF', CFG.atTimeoutMs); }
      catch (e) {
        stap('Adapter terugzetten', 'FOUT',
          'ATSH7DF mislukt — de adapter kan op een enkel stuurapparaat blijven staan. ' +
          'Verbreek en verbind opnieuw als andere sensoren niets meer teruggeven: ' + (e.message || e));
      }
      if (res.craGebruikt) {
        try { await sendCmd('ATCRA', CFG.atTimeoutMs); }
        catch (e) {
          stap('Ontvangstfilter terugzetten', 'FOUT',
            'ATCRA (wissen) mislukt — het filter kan blijven staan; verbind opnieuw: ' + (e.message || e));
        }
      }
    }

    // Herweging: pas ná de rit is bekend welke bron een vast anker was.
    // Metingen die toen nog geen anker hadden, krijgen die kans alsnog —
    // anders hangt de schaalkeuze aan de toevallige volgorde van de lijst.
    var ankerNa = kiesAnker(res.metingen, opgegeven);
    if (ankerNa != null) {
      res.metingen.forEach(function (m) {
        if (m.km != null && !m.zeker && m.kandidaten) {
          var k = kiesSchaal(m.kandidaten, ankerNa);
          m.km = k.km; m.schaal = k.schaal; m.zeker = !!k.zeker;
          m.viaAnker = !!k.viaAnker; m.schaalReden = k.reden;
        }
      });
    }

    res.duurMs = Date.now() - t0;
    res.oordeel = oordeel(res.metingen, opgegeven);
    diag('Km-check klaar: ' + res.oordeel.tekst + ' (' + (res.duurMs / 1000).toFixed(1) + 's)',
      res.oordeel.niveau === 'kritiek' ? 'warn' : 'ok');
    return res;
  }

  /* Het anker voor de herweging: een meting waarvan de schaal vaststond
     zónder hulp telt, de overgetypte stand ook. Een meting die zelf via
     een anker zeker werd, telt NIET — anders bevestigt een keuze zichzelf. */
  function kiesAnker(metingen, opgegeven) {
    for (var i = 0; i < metingen.length; i++) {
      var m = metingen[i];
      if (m.rol === 'odo' && m.km != null && m.zeker && !m.viaAnker) return m.km;
    }
    return (opgegeven != null && isFinite(opgegeven) && opgegeven > 0) ? opgegeven : null;
  }

  async function zetHeader(hdr, stap, res) {
    try { await sendCmd('ATSH' + hdr, CFG.atTimeoutMs); }
    catch (e) {
      stap('Richten op ' + hdr, 'FOUT', 'ATSH' + hdr + ' geweigerd: ' + (e.message || e));
      return false;
    }
    // Het ontvangstfilter erbij. Voor 7Ex zet een ELM327 dat zelf; voor de
    // andere adressen is dat niet gegarandeerd en zonder filter kan het
    // antwoord van een ander stuurapparaat ertussen komen. Weigert de
    // adapter het commando ('?'), dan gaat de meting door zonder filter —
    // maar dat staat dan wél in het verslag.
    var rx = rxVan(hdr);
    if (rx) {
      var r = '';
      try { r = String(await sendCmd('ATCRA' + rx, CFG.atTimeoutMs) || ''); }
      catch (e) { r = '?'; console.warn('PLKm: ATCRA' + rx + ' gaf een fout', e); }
      var goed = !/\?/.test(r);
      if (res.craGebruikt === null) res.craGebruikt = goed;
      else res.craGebruikt = res.craGebruikt || goed;
      stap('Richten op ' + hdr, 'ok',
        'zendadres ' + hdr + ', ontvangst ' + rx + (goed ? '' : ' — ATCRA geweigerd, zonder filter gemeten'));
    } else {
      stap('Richten op ' + hdr, 'ok', 'zendadres ' + hdr);
    }
    return true;
  }

  async function meetBron(br, anker, stap) {
    var m = {
      id: br.id, rol: br.rol, groep: br.groep, ookGroep: br.ookGroep || null,
      module: br.module, uitleg: br.uitleg, cmd: br.cmd, header: br.header || '7DF (functioneel)',
      ruw: '', hex: null, waarde: null, km: null, zeker: false, kandidaten: null
    };
    var ruw = '';
    try { ruw = await sendCmd(br.cmd, CFG.cmdTimeoutMs); }
    catch (e) {
      m.reden = 'commando mislukt: ' + (e.message || e);
      stap(br.module + ' — ' + br.cmd, 'let-op', m.reden);
      return m;
    }
    m.ruw = String(ruw || '').replace(/\s+/g, ' ').trim().slice(0, 60);

    var lees = leesDid(ruw, br.kop, br.bytes);
    if (!lees.bytes) {
      m.reden = lees.reden === 'geweigerd'
        ? '7F ' + lees.sid + ' ' + lees.nrc + ' — ' + lees.nrcTekst
        : (lees.reden === 'te kort' ? 'antwoord te kort: ' + (lees.ruwHex || '—') : 'geen antwoord');
      stap(br.module + ' — ' + br.cmd, 'ok',
        m.reden + '  (afwezigheid zegt niets over de auto, alleen over deze identifier)');
      return m;
    }

    m.hex = lees.hex;
    if (isVulling(lees.bytes)) {
      m.reden = 'bytes ' + lees.hex + ' — vulling, geen waarde';
      stap(br.module + ' — ' + br.cmd, 'ok', m.reden);
      return m;
    }

    // ── ROL 'VIN': maskeren vóórdat er iets wordt opgeslagen ──
    // De ruwe VIN komt hier binnen en gaat NIET verder dan deze regels.
    // Wat er in de meting terechtkomt is de staart plus het pseudoniem —
    // hetzelfde als wat de app elders logt. Zie §7 en §11.
    if (br.rol === 'vin') {
      var tekst = bytesNaarTekst(lees.bytes);
      if (!tekst) {
        m.vinBlanco = true;
        m.reden = 'antwoordt met louter nullen — geen VIN geprogrammeerd';
        stap(br.module + ' — VIN', 'ok', m.reden);
        return m;
      }
      if (!isVin(tekst)) {
        m.reden = 'antwoord is geen geldig voertuignummer (' + lees.bytes.length + ' bytes)';
        stap(br.module + ' — VIN', 'let-op', m.reden);
        return m;
      }
      var kenmerk = await vinKenmerk(tekst);
      m.vinStaart = kenmerk.staart;
      m.vinId = kenmerk.id;
      m.hex = null;                       // de ruwe bytes zijn de VIN: weg ermee
      if (!m.vinId) {
        m.reden = 'VIN gelezen maar niet te pseudonimiseren — niet vergelijkbaar';
        stap(br.module + ' — VIN', 'let-op', m.reden);
        return m;
      }
      stap(br.module + ' — VIN', 'ok', 'voertuignummer ' + m.vinStaart + ' gelezen');
      return m;
    }

    m.waarde = naarWaarde(lees.bytes);
    m.kandidaten = kandidaten(m.waarde, br.schaal);
    var keuze = kiesSchaal(m.kandidaten, anker);
    m.km = keuze.km; m.schaal = keuze.schaal; m.zeker = !!keuze.zeker;
    m.viaAnker = !!keuze.viaAnker; m.schaalReden = keuze.reden;

    stap(br.module + ' — ' + br.cmd, m.zeker ? 'ok' : 'let-op',
      'bytes ' + lees.hex + ' → ' + (m.km == null ? 'geen plausibele lezing' : getal(m.km)) +
      '  (' + keuze.reden + ')');
    return m;
  }

  // ── Weergave ───────────────────────────────────────────────────────

  function render(res) {
    if (!res) return '';
    var o = res.oordeel || oordeel(res.metingen || [], res.opgegeven);
    var h = '<div class="pl-km pl-km-' + o.niveau + '">';
    h += '<div class="pl-km-kop">🧭 Kilometerstand — ' + esc(o.tekst) + '</div>';

    if (o.bevindingen && o.bevindingen.length) {
      h += '<ul class="pl-km-bev">';
      o.bevindingen.forEach(function (b) {
        h += '<li class="pl-km-' + b.ernst + '"><b>' + esc(b.kop) + '</b> — ' + esc(b.tekst) + '</li>';
      });
      h += '</ul>';
    }

    var rijen = (res.metingen || []).filter(function (m) { return m.km != null || m.hex; });
    if (rijen.length) {
      h += '<table class="pl-m06-tbl"><thead><tr>' +
           '<th>Stuurapparaat</th><th>Adres</th><th>Verzoek</th><th>Bytes</th><th>Stand</th>' +
           '</tr></thead><tbody>';
      rijen.forEach(function (m) {
        var kl = m.km == null ? 'onzeker' : (m.zeker ? 'ok' : 'onzeker');
        h += '<tr class="pl-m06-' + kl + '">' +
             '<td>' + esc(m.module) + '</td>' +
             '<td class="pl-m06-tid">' + esc(m.groep) + '</td>' +
             '<td class="pl-m06-tid">' + esc(m.cmd) + '</td>' +
             '<td class="pl-m06-tid">' + esc(m.hex || '—') + '</td>' +
             '<td class="pl-m06-oordeel">' + esc(m.km == null ? '—' : getal(m.km)) +
               (m.km != null && !m.zeker ? ' <span class="pl-m06-ruw">schaal onzeker</span>' : '') +
             '</td></tr>';
      });
      h += '</tbody></table>';
    }

    h += '<div class="pl-m06-note">' +
         esc(o.onafhankelijkeBronnen + ' onafhankelijk stuurapparaat' +
             (o.onafhankelijkeBronnen === 1 ? '' : 'en') + ' geantwoord; speling ' +
             getal(o.tolerantieKm) + '. Een module die niet antwoordt, kent deze identifier ' +
             'niet — dat is geen aanwijzing over de auto.') + '</div>';
    return h + '</div>';
  }

  function naarPromptRegels(res) {
    if (!res || !res.metingen || !res.metingen.length) return 'Kilometerstand: niets gelezen.';
    var o = res.oordeel || oordeel(res.metingen, res.opgegeven);
    var r = ['Kilometerstand-check (' + o.niveau + '): ' + o.tekst];
    (o.groepen || []).forEach(function (m) {
      r.push('- ' + m.module + ' (' + m.groep + ', ' + m.cmd + '): ' + getal(m.km));
    });
    (o.bevindingen || []).forEach(function (b) {
      if (b.ernst === 'info') return;
      r.push('- ' + b.ernst.toUpperCase() + ': ' + b.kop + ' — ' + b.tekst);
    });
    return r.join('\n');
  }

  /* ── DE KNOP IN DE KOOPCHECK ───────────────────────────────────────
     Stap voor stap, terwijl het draait. Een check die twintig seconden
     stil is, ziet eruit als een vastgelopen app — en dan drukt iemand
     opnieuw, midden in een ATSH-reeks.

     Fouten worden getoond, niet weggeslikt: dit is precies het scherm
     waar "er gebeurt niets" de duurste uitkomst is. */
  async function draaiUI(knop) {
    var uit = document.getElementById('koopKmCheckUit');
    if (!uit) { console.warn('PLKm: geen uitvoervak (#koopKmCheckUit) in de pagina'); return; }
    var veld = document.getElementById('koopKmInput');
    var opgegeven = veld && veld.value ? parseInt(veld.value, 10) : null;

    if (knop) { knop.disabled = true; knop.dataset.plLabel = knop.textContent; knop.textContent = '⏳ Bezig…'; }
    var regels = [];
    uit.innerHTML = '<div class="pl-km"><div class="pl-km-kop">🧭 Kilometerstand — bezig…</div>' +
                    '<ul class="pl-km-bev" id="koopKmStappen"></ul></div>';
    var lijst = document.getElementById('koopKmStappen');

    try {
      var res = await check({
        opgegeven: opgegeven,
        onStap: function (st) {
          regels.push(st);
          if (!lijst) return;
          var li = document.createElement('li');
          li.className = 'pl-km-' + (st.staat === 'FOUT' ? 'kritiek' : st.staat === 'let-op' ? 'let-op' : 'info');
          li.innerHTML = '<b>' + esc(st.naam) + '</b> — ' + esc(st.detail);
          lijst.appendChild(li);
        }
      });
      uit.innerHTML = render(res);
      return res;
    } catch (e) {
      // Geen stille catch: de gebruiker moet zien waaróm er geen oordeel is,
      // anders leest hij "geen bevinding" als "niets aan de hand".
      uit.innerHTML = '<div class="pl-km pl-km-onbekend"><div class="pl-km-kop">🧭 Kilometerstand — niet gemeten</div>' +
        '<ul class="pl-km-bev"><li class="pl-km-let-op">' + esc(e.message || String(e)) +
        '</li></ul></div>';
      console.warn('PLKm.draaiUI: de check liep niet af', e);
      return null;
    } finally {
      if (knop) { knop.disabled = false; if (knop.dataset.plLabel) knop.textContent = knop.dataset.plLabel; }
    }
  }

  window.PLKm = {
    check: check,
    draaiUI: draaiUI,
    oordeel: oordeel,
    render: render,
    naarPromptRegels: naarPromptRegels,
    bronnen: function () { return BRONNEN.slice(); },
    vinConsistentie: vinConsistentie,
    cfg: CFG,
    _intern: {
      naarHex: naarHex, leesDid: leesDid, naarWaarde: naarWaarde, isVulling: isVulling,
      kandidaten: kandidaten, kiesSchaal: kiesSchaal, kiesAnker: kiesAnker,
      bytesNaarTekst: bytesNaarTekst, isVin: isVin, vinKenmerk: vinKenmerk,
      rxVan: rxVan, tolerantie: tolerantie
    }
  };
})();
