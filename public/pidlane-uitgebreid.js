/* ═══════════════════════════════════════════════════════════════════
   pidlane-uitgebreid.js — fabrikant-PIDs buiten mode 01 (mode 21/22)
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   De pollus in pidlane-plload.js bouwde zijn commando als:

       '01' + pid.slice(2)

   Dat is hardcoded mode 01. Een sleutel als '2101' (mode 21, PID 01)
   werd daardoor stilzwijgend '01' + '01' = '0101' — dus mode 01 PID 01,
   monitorstatus. Geen foutmelding, geen NO DATA: gewoon het verkeerde
   antwoord, netjes geparsed en als "motorolie temperatuur" getoond.
   Dat is de gevaarlijkste soort bug die er is.

   PIDS_EXTRA in pidlane-data.js declareerde al vier Mazda-PIDs "(mode
   22)" maar werd NERGENS gelezen. Ze zijn dus nooit gevraagd — wat de
   bug verborgen hield.

   BIJGESTELD 19-08-2026: 2101 zat hier als Mazda-alternatief voor het
   dode 015C. Gemeten op de CX-5 2018: 2101 antwoordt óók niet. De
   definitie is eruit; zie de aantekening bij UITGEBREID_DEFS. De
   mode-21-route zelf blijft, voor 2102/210C/210D.

   DE SLEUTELCONVENTIE — die klopte al

   Een PID-sleutel is mode + identifier, hexadecimaal:
       '010C' → mode 01, PID 0C   (toerental, J1979 standaard)
       '2102' → mode 21, PID 02   (Mazda/Ford propriëtair)
   Het antwoord van de ECU is altijd mode + 0x40:
       mode 01 → 41 …             mode 21 → 61 …
   parsePID() in pidlane-diagbundel.js rekende dat AL correct uit
   ((mode+0x40) als header). Alleen de ZENDkant was hardcoded. Deze
   module levert de ontbrekende helft.

   WAAROM 21 EN NIET 22

   Mode 22 (UDS ReadDataByIdentifier) gebruikt een identifier van TWEE
   bytes: '22' + 'F190' = zes tekens. Dat past niet in de vier-tekens-
   conventie en zou de hele sleutelruimte breken. Mazda's motorblok zit
   op mode 21 met één byte — dat past wél. UDS-mode-22 blijft dus waar
   het al zat: los, in pidlane-bt.js (22F190 voor het VIN). Deze module
   gaat over de pollbare fabrikant-PIDs.

   Nuance van 19-08: op deze CX-5 antwoordt mode 22 op header 7E0 wel
   degelijk (7F 22 31 = identifier onbekend, service wél ondersteund).
   Een mode-22-PID pollbaar maken vraagt dus geen ander protocol, maar
   wél een bredere sleutel dan vier tekens. Zolang er geen werkende
   identifier bekend is, is dat een oplossing zonder probleem.

   NIET BATCHEN

   Multi-PID batching ('010C0D11' → drie PIDs in één request) is een
   eigenschap van mode 01 op CAN. Mode 21 kent dat niet. De pollus
   filtert daarom op mode 01 vóór het batchen; alles daarbuiten gaat
   sequentieel. Zie de aanpassing in pidlane-plload.js.

   SCHALING IS ONGEVERIFIEERD — en dat staat er ook bij

   Van 2102/210C/210D is de schaling NIET bevestigd op een echte auto. Die staan daarom als
   `onzeker:true` en `cat:'Overig'`: ze worden gepollt en gelogd, maar
   pidGate('duidbaar') houdt ze uit rapporten en AI-analyse tot iemand
   ze heeft geijkt. De probe logt de rauwe bytes zodat dat ijken één
   rit kost, geen gokwerk.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── 1. MODE-BEWUSTE COMMANDOBOUWER ────────────────────────────────
  // Voor mode 01 is dit een exacte no-op: '01'+'0C' === '010C' === pid.
  // Daardoor is de vervanging in de pollus risicoloos voor bestaand
  // gedrag en tegelijk correct voor alles daarbuiten.
  //
  // `snel` voegt het ELM327-achtervoegsel '1' toe: "verwacht één frame,
  // wacht niet op timeout". Dat mag alleen bij een enkelvoudige request.
  function pidMode(pid) {
    return String(pid || '').slice(0, 2).toUpperCase();
  }
  function pidCmd(pid, snel) {
    const p = String(pid || '').toUpperCase();
    return snel ? p + '1' : p;
  }
  function isMode01(pid) {
    return pidMode(pid) === '01';
  }
  window.pidMode = pidMode;
  window.pidCmd = pidCmd;
  window.isMode01 = isMode01;

  // ── 2. DEFINITIES ─────────────────────────────────────────────────
  // Vorm gelijk aan ALL_PID_DEFS zodat getPidDef() ze zonder verdere
  // aanpassing vindt en buildDiscoveredPIDList() ze netjes inschaalt.
  const UITGEBREID_DEFS = {
    // ── 2101 IS HIER WEGGEHAALD (19-08-2026). NIET TERUGZETTEN. ──
    // Stond hier als 'Motorolie temp', merk MAZDA, vervangt 015C, parse b[0]−40.
    // Blok 8 van testrun 1.7 heeft het op de CX-5 2018 gemeten, met sendCmd
    // rechtstreeks en dus buiten het merkfilter om:
    //
    //   2101   (mode 21 PID 01)          → NO DATA
    //   22111F (mode 22, functioneel)    → NO DATA
    //   015C   (de standaard)            → NO DATA
    //   22111F op header 7E0             → 7F 22 31
    //
    // Die laatste is requestOutOfRange, niet serviceNotSupported: mode 22 leeft
    // wél op 7E0, alleen bestaat identifier 111F daar niet. De olietemperatuur
    // zit dus ergens anders, en waar precies is nog niet bekend — blok 9 van de
    // testrun scant de 11xx-reeks.
    //
    // Waarom weghalen en niet laten staan: de definitie droeg `vervangt:'015C'`,
    // dus de app bood een sensor aan die deze auto niet levert. Een belofte die
    // de auto niet waarmaakt is erger dan een ontbrekende tegel.
    //
    // De mode-21-route zelf blijft bestaan voor de drie hieronder. Dat 2101 hier
    // ooit stond kwam uit een Toyota GT86/Subaru BRZ-lijst; daar is het wél de
    // olietemperatuur. Overgenomen zonder meting — vandaar deze aantekening, zodat
    // de volgende die zo'n lijst tegenkomt weet dat het hier al geprobeerd is.
    '2102': {
      name: 'Turbodruk (rauw)', unit: 'raw', cat: 'Overig',
      min: 0, max: 255, merk: 'MAZDA', onzeker: true,
      parse: b => b[0]
    },
    '210C': {
      name: 'Klep timing inlaat (rauw)', unit: 'raw', cat: 'Overig',
      min: 0, max: 255, merk: 'MAZDA', onzeker: true,
      parse: b => b[0]
    },
    '210D': {
      name: 'Klep timing uitlaat (rauw)', unit: 'raw', cat: 'Overig',
      min: 0, max: 255, merk: 'MAZDA', onzeker: true,
      parse: b => b[0]
    }
  };
  window.UITGEBREID_DEFS = UITGEBREID_DEFS;

  // Registreren in ALL_PID_DEFS. Bestaande sleutels NOOIT overschrijven:
  // de standaardtabel is leidend, dit is een aanvulling.
  try {
    if (window.ALL_PID_DEFS) {
      Object.keys(UITGEBREID_DEFS).forEach(pid => {
        if (!window.ALL_PID_DEFS[pid]) window.ALL_PID_DEFS[pid] = UITGEBREID_DEFS[pid];
      });
    }
  } catch(e){ console.warn('ALL_PID_DEFS aanvullen met UITGEBREID_DEFS mislukt:', e); }

  // ── 3. MERKFILTER ─────────────────────────────────────────────────
  // Een Mazda-PID op een Volkswagen vragen levert in het gunstigste
  // geval NO DATA en in het ongunstigste een antwoord dat toevallig
  // bestaat en iets heel anders betekent. Alleen probes op het merk
  // waarvoor de PID gedocumenteerd is.
  function _merkNu() {
    try {
      if (typeof merkGroep === 'function') {
        const m = (window.vehicleInfo && (vehicleInfo.merk || vehicleInfo.make)) || '';
        return merkGroep(m) || '';
      }
    } catch(e){ console.warn('merkGroep mislukt:', e); }
    return '';
  }

  function kandidaten() {
    const merk = _merkNu();
    return Object.keys(UITGEBREID_DEFS).filter(pid => {
      const d = UITGEBREID_DEFS[pid];
      if (d.merk && merk && d.merk !== merk) return false;
      if (d.merk && !merk) return false;      // merk onbekend → niet gokken
      // Fantoomfilter hergebruiken: BOOST_PIDS bevat 2102 al, dus een
      // atmosferische motor krijgt de turbo-PID hier vanzelf niet.
      try { if (typeof pidGate === 'function' && !pidGate(pid, 'plausibel')) return false; } catch(e){ console.warn('pidGate mislukt:', e); }
      return true;
    });
  }

  // ── 4. PROBE ──────────────────────────────────────────────────────
  // Eén keer na verbinden. Vraagt elke kandidaat solo op, logt de rauwe
  // bytes (voor ijking) en zet alleen de PIDs die écht antwoorden in
  // supportedPIDs. Claimt netjes het busslot zodat de pollus niet door
  // de probe heen praat — zelfde patroon als vlFullSurvey().
  let _gedraaid = false;

  // Hoe vaak een probe die de bus bezet trof opnieuw wordt ingepland.
  const PROBE_HERKANS = 12, PROBE_HERKANS_MS = 10000;
  let _herkansT = 0;
  async function probeUitgebreid(force) {
    if (_gedraaid && !force) return { nieuw: 0, overgeslagen: true };
    if (!connected || demoMode) return { nieuw: 0, overgeslagen: true };

    const lijst = kandidaten();
    if (!lijst.length) return { nieuw: 0, overgeslagen: true };

    // Bus bezet? NIET doorzenden. De claim stond hier al, maar de uitslag werd
    // genegeerd: bij tok=0 ging de probe gewoon dwars door een lopende sweep
    // heen. Monitor en waakronde doen het wél goed (bij 0 → volgende ronde) en
    // dit volgt nu dat patroon.
    //
    // En _gedraaid pas ZETTEN als we ook echt gaan meten. Stond hij vóór de
    // claim, dan boekte één ongelukkig getimede probe de hele PID-set voorgoed
    // als "geen antwoord" — hij kwam immers nooit meer terug. Een overgeslagen
    // probe is geen gedraaide probe.
    //
    // Sinds #115 loopt dat via withBusOfNiets() in plaats van een eigen
    // claim met een handgeschreven finally: dezelfde poort als de pollus, de
    // monitor en de waakronde.
    const bezet = () => {
      try { btDiag('Uitgebreide probe uitgesteld — bus bezet door "' + (window.PLBus && PLBus.owner ? PLBus.owner() : '?') + '"', 'info'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
      return { nieuw: 0, overgeslagen: true, busBezet: true };
    };
    const werk = async () => {
      _gedraaid = true;

      let nieuw = 0;
      for (const pid of lijst) {
        if (!connected) break;
        let raw = '';
        try { raw = await sendCmd(pidCmd(pid, true), 2000); } catch (e) { continue; }

        const hdr = ((parseInt(pid.slice(0, 2), 16) + 0x40)
                      .toString(16).toUpperCase().padStart(2, '0')) + pid.slice(2).toUpperCase();
        const schoon = String(raw || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        const goed = raw && !/NO DATA|ERROR|UNABLE|STOPPED|\?/i.test(String(raw)) &&
                     schoon.indexOf(hdr) >= 0;

        if (goed) {
          try { supportedPIDs.add(pid); } catch(e){ console.warn('supportedPIDs.add mislukt:', e); }
          nieuw++;
          const d = UITGEBREID_DEFS[pid];
          const bytes = schoon.slice(schoon.indexOf(hdr) + hdr.length);
          btDiag(`Uitgebreid ${pid} (${d.name}) ✓ — rauw: ${bytes.slice(0, 12)}`, 'ok');
          // Ongeverifieerde schaling expliciet benoemen, zodat een rare
          // waarde in de log niet als sensordefect wordt gelezen.
          if (d.onzeker) btDiag(`  ${pid}: schaling ONGEVERIFIEERD — waarde is rauwe byte`, 'warn');
        } else {
          btDiag(`Uitgebreid ${pid} — geen antwoord`, 'info');
        }
        try { await delay(60); } catch(e){ console.warn('delay mislukt:', e); }
      }
      return { nieuw, geprobeerd: lijst.length };
    };

    // Geen PLBus, geen slot om te pakken: dan draait de probe gewoon door —
    // net als voorheen, toen de skip achter `window.PLBus && PLBus.claim` zat.
    const uit = (typeof withBusOfNiets === 'function')
      ? await withBusOfNiets('uitgebreid-probe', werk, bezet)
      : await werk();
    // Bus was bezet: niets gemeten. Tot 23-10-2026 was dat het einde: de
    // probe wordt maar op één plek aangeroepen (na het verbinden), en als Check
    // mijn auto daar net de bus had, bleven de fabrikant-PIDs de hele sessie
    // onontdekt. Nu: later opnieuw, hoogstens PROBE_HERKANS keer.
    if (uit.busBezet) {
      if (!force && _herkansT < PROBE_HERKANS && connected) {
        _herkansT++;
        try { setTimeout(function () { probeUitgebreid(); }, PROBE_HERKANS_MS); }
        catch (e) { console.warn('uitgebreide probe niet opnieuw ingepland', e); }
      } else if (!force) {
        try { btDiag('Uitgebreide probe: bus bleef bezet — fabrikant-PIDs (mode 21/22) deze sessie niet onderzocht', 'warn'); }
        catch (e) { console.warn('melding niet gelogd', e); }
      }
      return uit;
    }
    _herkansT = 0;

    // Buiten het slot: dit is schermwerk en hoort de bus niet bezet te houden.
    if (uit.nieuw) {
      try { buildDiscoveredPIDList(); } catch(e){ console.warn('buildDiscoveredPIDList mislukt:', e); }
      log(`🔎 Fabrikant-PIDs: ${uit.nieuw} van ${lijst.length} beschikbaar`, 'ok');
      // Hier stond een regel die meldde dat de olietemperatuur op 2101 zit in
      // plaats van 015C. Weg op 19-08: 2101 antwoordt niet op deze auto, dus
      // die melding stuurde een monteur een doodlopende weg in. Zodra blok 9
      // een werkende identifier vindt kan er weer zoiets komen — dan mét meting.
    } else {
      btDiag(`Uitgebreid: ${lijst.length} kandidaten geprobeerd, geen enkele beschikbaar`, 'info');
    }
    return uit;
  }

  window.probeUitgebreid = probeUitgebreid;
  window.PLUitgebreid = {
    defs: UITGEBREID_DEFS,
    kandidaten,
    probe: probeUitgebreid,
    herstel() { _gedraaid = false; }
  };

  // ── 5. EIGEN PIDS PER VOERTUIG (27-09-2026) ───────────────────────
  // Een klant heeft van de dealer of uit een forum een code gekregen die de
  // app niet kent — bijvoorbeeld 221E1C voor de temperatuur van de automaat.
  // In Mijn voertuigen → Sensoren zet hij die erbij met een naam, een eenheid
  // en een formule over de antwoordbytes (A = eerste byte, B = tweede, …).
  //
  // ALLEEN LEZEN. Een code moet mode 21 (21xx) of mode 22 (22xxxx) zijn: dat
  // zijn leesdiensten. Wat schrijft, reset of iets aanstuurt (2E, 2F, 31, 04,
  // 10, 11, 14, …) komt er niet door — niet hier, niet op de server
  // (KP_VELDEN.eigen_pids), niet in de test. De formule wordt door een eigen
  // kleine lezer gerekend, nooit met eval of new Function: hij komt van de
  // klant en gaat via de server naar elk toestel van die klant.
  //
  // Ze gaan de gewone weg: de keuzelijst (groep "Eigen"), de pollus (solo,
  // omdat ze geen mode 01 zijn) en parsePID(), dat de echo 62xxxx/61xx al
  // herkent. Ze komen NIET in supportedPIDs, dus de sweeps en de waakronde
  // vragen ze niet op.
  const EIGEN_CODE = /^(21[0-9A-F]{2}|22[0-9A-F]{4})$/;
  const EIGEN_MAX = 20;
  // ECU-adres (optioneel): een FYSIEK adres. 7xx op 11-bit CAN (7E0 motor,
  // 7E1 automaat, …), 18DAxxF1 op 29-bit. Het functionele 7DF/18DB33F1 is
  // de standaard en hoeft niet ingevuld; het na afloop terugzetten zit in vraag().
  // Een ANDER antwoordadres (22-10-2026): "70E>778" — zenden op 70E, het
  // antwoord komt van 778. Zo praten VAG (70E>778), PSA en Opel (6A2>682) en
  // Nissan (740>760); de oude regel "antwoord = adres + 8" sloot ze uit.
  const EIGEN_ECU = /^(7[0-9A-F]{2}|18DA[0-9A-F]{2}F1|[67][0-9A-F]{2}>[0-9A-F]{3})$/;
  const EIGEN_TEMPO = { snel: 1000, normaal: 2000, traag: 10000, minuut: 60000 };
  // Op verzoek is geen tempo: 999999 is hier "niet in de pollus", net als in
  // de EV-modus van pidPollInterval, en zo leest PLMon het ook (#396).
  const EIGEN_OPVERZOEK_MS = 999999;

  /* Welke band, en druk of temperatuur? Uit de naam — "Bandenspanning
     voor-links", "Bandtemperatuur achter-rechts", "Tire pressure RR". null
     als het geen band is. Puur: test-mode21.js toetst hem los. Een naam is
     een zwakke bron, maar de enige die er is: de code zegt niets over de
     plek, en die verschilt per merk. */
  function bandRol(naam) {
    const n = String(naam || '').toLowerCase();
    if (!/\b(band|banden|bandenspanning|bandendruk|bandspanning|banddruk|bandtemperatuur|tire|tyre|tpms)/.test(n)) return null;
    const soort = /(temp)/.test(n) ? 'temp' : /(spanning|druk|pressure|psi|bar\b|tpms)/.test(n) ? 'druk' : null;
    if (!soort) return null;
    const voor = /(voor|front|\bf[lr]\b|\bv[lr]\b)/.test(n), achter = /(achter|rear|\br[lr]\b|\ba[lr]\b)/.test(n);
    const links = /(links|left|\b[fvra]l\b)/.test(n), rechts = /(rechts|right|\b[fvra]r\b)/.test(n);
    if (voor === achter || links === rechts) return null;
    return { pos: (voor ? 'V' : 'A') + (links ? 'L' : 'R'), soort };
  }

  /* De laadregeling (16-10-2026). Een Mazda (en vrijwel elke auto van na
     ~2010) laadt met een gestuurde dynamo: bij een volle accu vraagt de
     motorregeling bewust 12,5–13 V, bij gas los of remmen 14–15 V. Een vaste
     grens van 13,0 of 13,2 V meldt dan "dynamo" op een gezonde auto. Wat de
     auto zélf weet maakt het verschil: de GEVRAAGDE laadspanning (Mazda
     220304 "Commanded generator voltage") en de laadtoestand die de
     accusensor uitrekent (224028 "12V battery state of charge"). Haalt de
     dynamo wat er gevraagd wordt, dan is een lage spanning een keuze en
     geen storing. De rol komt uit de naam, zoals bij bandRol: de code
     verschilt per merk, de OBDb-namen niet. Puur; test-mode21.js. */
  /* 17-10-2026 — nagemeten op de echte OBDb-namen van 27 modellen. Elk merk
     noemt het anders: "Commanded generator voltage" (Mazda), "Alternator set
     point voltage" (Renault, Nissan), "Alternator charge voltage request"
     (Volvo); "12V battery soc", "Battery charge level" (VAG), "Battery state
     of charge, battery sensor" (Kia/Hyundai), "Auxiliary battery current"
     (Toyota-hybride = de 12V-accu). En er staan namen tussen die op een rol
     lijken maar het niet zijn: drempels ("state of charge too low for
     start/stop", "Minimum state of charge"), vlaggen, voorspellingen, de
     48V- of tractie-accu, eCall-batterij en de spanning van de sensor zelf.
     Die moeten eruit: een drempel als laadtoestand lezen is precies de
     verkeerde conclusie die #532 wil voorkomen. */
  const LAAD_NIET = /(\b48 ?v?\b|hybrid|\bhv\b|high.voltage|traction|\bpack\b|\bcells?\b|\bunits?\b|module|ecall|bms|battery management|too (low|high)|minimum|maximum|\bmax\b|\bmin\b|delta|average|integrated|accumulated|\bdark\b|\blimit|\bflag|predicted|quiescent|total (dis)?charge|sensor (supply )?volt|current sensor volt|variant|\bstatus\b|\bmode\b|identifier|unknown|inlet|cooling|heater|relay|\braw\b|duty|dc.dc|converter|second(ary)?|battery [b2]\b|\bat ignition|_battery)/;
  // De 12V-accu met naam en toenaam; alleen dan mag een laadtoestand meetellen.
  // "State of charge" zonder meer is op een hybride of EV de tractie-accu.
  const ACCU_12V = /(\b12 ?v\b|\baux(iliary)?\b|service battery|starter battery|battery sensor|vehicle battery|battery charge level|battery estimated state)/;
  function laadRol(naam) {
    const n = String(naam || '').toLowerCase();
    if (LAAD_NIET.test(n)) return null;
    const lader = /(generator|alternator|dynamo|\blaad|charg)/.test(n), accu = /\b(battery|accu|batterij)\b/.test(n);
    if (lader && /(commanded|desired|target|gevraagd|gewenst|doel|set ?point|request)/.test(n) && /(volt|spanning)/.test(n)) return 'gevraagd';
    if (/(state of charge|\bsoc\b|laadtoestand|laadniveau|charge level)/.test(n)) return (accu && ACCU_12V.test(n)) || /laadtoestand|laadniveau/.test(n) ? 'soc' : null;
    if (accu && /(current|stroom|\bamps\b)/.test(n)) return 'stroom';
    if (accu && /temp/.test(n) && !/\d\s*$|\btb\d/.test(n)) return 'accutemp';
    if (accu && /(\bage\b|leeftijd)/.test(n)) return 'leeftijd';
    return null;
  }


  // u = accuspanning (0142), rpm, gevraagd = gevraagde laadspanning, soc = %.
  // null = de auto zegt er niets over: dan beslist de oude vaste grens.
  const LAAD_MARGE = 0.5;   // V onder de gevraagde spanning mag (meetverschil, traagheid)
  function laadOordeel(o) {
    o = o || {};
    const u = Number(o.u), rpm = Number(o.rpm), g = Number(o.gevraagd), soc = Number(o.soc);
    const ok = (x) => o[x] !== null && o[x] !== undefined && o[x] !== '';
    if (!ok('u') || !isFinite(u) || u < 6 || u > 20 || !ok('rpm') || !(rpm >= 500)) return null;
    const nl1 = (x) => x.toFixed(1).replace('.', ',');
    if (ok('gevraagd') && isFinite(g) && g >= 11 && g <= 16) {
      if (u < g - LAAD_MARGE) return { staat: 'laadt_niet', tekst: 'de motorregeling vraagt ' + nl1(g) + ' V, de accu krijgt ' + nl1(u) + ' V — de dynamo haalt niet wat er gevraagd wordt' };
      if (g < 13.2) return { staat: 'bewust_laag', tekst: 'de motorregeling vraagt zelf maar ' + nl1(g) + ' V (accu vol genoeg, of zuinig rijden) — de dynamo doet wat hij moet' };
      return { staat: 'laadt', tekst: 'de dynamo laadt: ' + nl1(u) + ' V, gevraagd ' + nl1(g) + ' V' };
    }
    if (ok('soc') && isFinite(soc) && soc >= 75 && soc <= 100 && u >= 12.4)
      return { staat: 'bewust_laag', tekst: 'de accu is volgens de auto ' + Math.round(soc) + '% vol — een slimme dynamo laadt dan weinig' };
    return null;
  }
  // Wat de accusensor over de accu zelf zegt. Leeg = niets te melden.
  function accuOordeel(o) {
    o = o || {};
    const uit = [], soc = Number(o.soc), jaar = Number(o.leeftijd) / 8766;
    if (o.soc !== null && o.soc !== undefined && isFinite(soc) && soc >= 0 && soc <= 100) {
      if (soc < 50) uit.push({ ernst: 'oranje', tekst: 'Accu volgens de auto maar ' + Math.round(soc) + '% vol — laat hem testen of laad hem een nacht bij' });
      else if (soc < 65) uit.push({ ernst: 'info', tekst: 'Accu volgens de auto ' + Math.round(soc) + '% vol — korte ritten laden hem niet vol' });
    }
    if (o.leeftijd !== null && o.leeftijd !== undefined && isFinite(jaar) && jaar >= 6 && jaar < 30)
      uit.push({ ernst: 'info', tekst: 'Accu ongeveer ' + Math.floor(jaar) + ' jaar in gebruik volgens de auto' });
    return uit;
  }
  // De codes van de eigen sensoren per rol, voor deze auto.
  function laadCodes() {
    const uit = {};
    Object.keys(_eigen).forEach(c => { const r = laadRol(_eigen[c] && _eigen[c].name); if (r && !uit[r]) uit[r] = c; });
    return uit;
  }
  // Verse waarde (≤ 20 s), anders null — een oude gevraagde spanning
  // naast een nieuwe gemeten zegt niets.
  function laadVers(c) {
    try {
      if (!c || typeof pidVals === 'undefined') return null;
      const h = (typeof pidHist !== 'undefined' && pidHist[c]) || null, l = h && h.length ? h[h.length - 1] : null;
      if (l && Date.now() - l.t > 20000) return null;
      const v = pidVals[c];
      return typeof v === 'number' && isFinite(v) ? v : null;
    } catch (x) { console.warn('PLEigen: laadwaarde ' + c, x); return null; }
  }
  function laadNu() {
    const c = laadCodes(), uit = {};
    Object.keys(c).forEach(r => { uit[r] = laadVers(c[r]); });
    return uit;
  }
  function laadLive() {
    try {
      const w = laadNu();
      if (w.gevraagd == null && w.soc == null) return null;
      return laadOordeel({ u: typeof pidVals !== 'undefined' ? pidVals['0142'] : null, rpm: typeof pidVals !== 'undefined' ? pidVals['010C'] : null, gevraagd: w.gevraagd, soc: w.soc });
    } catch (x) { console.warn('PLEigen: laadoordeel', x); return null; }
  }

  /* Druk in de eenheid die de klant koos (Mijn voorkeuren → Druk tonen
     als). Een eigen PID met eenheid psi, bar of kPa wordt omgerekend; de
     formule en wat er bewaard is veranderen niet. */
  const DRUK_KPA = { psi: 6.894757, bar: 100, kpa: 1 };
  function drukVoorkeur() {
    try { const d = window.PLVoorkeur && PLVoorkeur.druk ? PLVoorkeur.druk() : 'bar'; return DRUK_KPA[d] ? d : 'bar'; }
    catch (x) { console.warn('PLEigen: drukvoorkeur onleesbaar', x); return 'bar'; }
  }
  function drukOmrekening(eenheid, doel) {
    const van = String(eenheid || '').trim().toLowerCase();
    if (!DRUK_KPA[van] || !DRUK_KPA[doel] || van === doel) return null;
    return { factor: DRUK_KPA[van] / DRUK_KPA[doel], eenheid: doel === 'kpa' ? 'kPa' : doel, decimalen: doel === 'bar' ? 2 : 1 };
  }

  /* Standaardbereik voor een eigen PID die er zelf geen heeft (30-09-2026,
     uit het gebruik). Zonder bereik kreeg zo'n sensor min −1e9 en max 1e9,
     en in Slim werd de balk dan gearceerd ("grove schaal") en bleef hij
     leeg. Alleen voor wat we uit de naam herkennen:
       • bandtemperatuur: balk tot 80 °C, rood vanaf 65 (#370). De balk in
         Slim loopt anders vol op de gevarengrens, dus `balkVol` zegt waar
         hij vol is. De onderkant is −40 en niet 0: pidlane-kwaliteit.js
         leest een waarde op precies het minimum als dummy, en 0 °C is
         's winters echt;
       • bandenspanning: 0…4 bar, rood onder 1,5 en vanaf 3,5 (#370), in de
         eenheid van de sensor ná omrekening;
       • motorolietemperatuur: hetzelfde als de standaard-PID 015C.
     Geeft {min, max, wH?, dH?, dL?, balkVol?} in `unit`, of null. Puur. */
  const OLIE_STANDAARD = { min: -40, max: 150, wH: 130, dH: 150 };
  function standaardBereik(naam, band, unit) {
    const u = String(unit || '').trim().toLowerCase();
    if (band && band.soort === 'temp') return /°c|^c$/.test(u) ? { min: -40, max: 80, dH: 65, balkVol: 80 } : null;
    if (band && band.soort === 'druk') {
      if (!DRUK_KPA[u]) return null;
      const inU = (bar) => Math.round(bar * 100 / DRUK_KPA[u] * 100) / 100;
      return { min: 0, max: inU(4), dL: inU(1.5), dH: inU(3.5) };
    }
    if (/(olie|oil).*(temp)|(motorolietemp)/i.test(String(naam || '')) && /°c|^c$/.test(u)) return Object.assign({}, OLIE_STANDAARD);
    // Een percentage zonder bereik loopt van 0 tot 100 (#472): anders had een
    // rempedaal of gaspedaal geen schaal en kon hij niet op een boog.
    if (u === '%') return { min: 0, max: 100 };
    return null;
  }

  /* Formule → functie(bytes). Toegestaan: getallen, A t/m H, + - * / en
     haakjes. Ontbreekt een byte in het antwoord, dan is de uitkomst null. */
  function formule(tekst) {
    const t = String(tekst || '').replace(/\s+/g, '').toUpperCase().replace(/,/g, '.');
    if (!t || t.length > 80) throw new Error('formule leeg of te lang');
    // [n] is byte n (A = [0]): een lang antwoord, zoals de accu van een Kia
    // of de 22-codes van Honda, heeft zijn waarde voorbij H (#541-dekking).
    if (!/^[A-H0-9.+\-*/()[\]]+$/.test(t)) throw new Error('alleen A–H, [n], getallen, + - * / en haakjes');
    let i = 0;
    const kijk = () => t[i];
    function getal() {
      const m = /^\d+(\.\d+)?/.exec(t.slice(i));
      if (!m) throw new Error('getal verwacht op plek ' + (i + 1));
      i += m[0].length; const n = Number(m[0]);
      return () => n;
    }
    function factor() {
      const c = kijk();
      if (c === '-') { i++; const f = factor(); return (b) => { const v = f(b); return v === null ? null : -v; }; }
      if (c === '(') { i++; const e = expr(); if (kijk() !== ')') throw new Error('haakje sluiten ontbreekt'); i++; return e; }
      if (c && /[A-H]/.test(c)) { i++; const k = c.charCodeAt(0) - 65; return (b) => (b && typeof b[k] === 'number') ? b[k] : null; }
      if (c === '[') {
        const m = /^\[(\d{1,3})\]/.exec(t.slice(i));
        if (!m || Number(m[1]) > 255) throw new Error('byte [n] met n van 0 tot 255');
        i += m[0].length; const k = Number(m[1]);
        return (b) => (b && typeof b[k] === 'number') ? b[k] : null;
      }
      return getal();
    }
    function term() {
      let l = factor();
      while (kijk() === '*' || kijk() === '/') {
        const op = t[i++], r = factor(), a = l;
        l = (b) => { const x = a(b), y = r(b); if (x === null || y === null) return null; if (op === '/' && y === 0) return null; return op === '*' ? x * y : x / y; };
      }
      return l;
    }
    function expr() {
      let l = term();
      while (kijk() === '+' || kijk() === '-') {
        const op = t[i++], r = term(), a = l;
        l = (b) => { const x = a(b), y = r(b); return (x === null || y === null) ? null : (op === '+' ? x + y : x - y); };
      }
      return l;
    }
    const f = expr();
    if (i !== t.length) throw new Error('onverwacht teken "' + t[i] + '"');
    return (b) => { const v = f(b); return (typeof v === 'number' && isFinite(v)) ? Math.round(v * 1000) / 1000 : null; };
  }

  /* Eén eigen PID controleren. Geeft { ok, fout, def }. */
  function eigenControleer(e) {
    e = e || {};
    const code = String(e.code || '').toUpperCase().replace(/\s+/g, '');
    if (!EIGEN_CODE.test(code)) return { ok: false, fout: 'Alleen leescodes: 21xx of 22xxxx (bijv. 221E1C)' };
    const naam = String(e.naam || '').trim().slice(0, 40);
    if (!naam) return { ok: false, fout: 'Geef de sensor een naam' };
    const ecu = String(e.ecu || '').toUpperCase().replace(/\s+/g, '');
    if (ecu && !EIGEN_ECU.test(ecu)) return { ok: false, fout: 'ECU-adres: 7xx (bijv. 7E1), 18DAxxF1, tx>rx (bijv. 70E>778) of leeg laten' };
    // Een band is altijd op verzoek (#396) — PLBanden.ververs() vraagt de
    // vier banden bij het openen van Slim visueel en van het bandenvenster,
    // en met het vinkje elke vijf minuten. Acht PIDs via een ander ECU-adres
    // die elke minuut de pollus in gaan, kosten busstilte voor één vraag:
    // staan ze op spanning, worden ze niet te heet. Tot 08-10-2026 won een
    // gekozen tempo; dan stonden de acht banden én gebundeld in het
    // bandenvenster én los in de keuzelijst. Al het andere: de keuze, of 2 s.
    const band = bandRol(naam);
    const tempo = band ? 'opverzoek' : (EIGEN_TEMPO[e.tempo] ? e.tempo : 'normaal');
    let parse;
    try { parse = formule(e.formule || 'A'); } catch (x) { return { ok: false, fout: 'Formule: ' + x.message }; }
    let min = Number(e.min), max = Number(e.max), unit = String(e.eenheid || '').slice(0, 12);
    const heeftBereik = isFinite(min) && isFinite(max) && max > min;
    const om = drukOmrekening(unit, drukVoorkeur());
    if (om) {
      const ruw = parse, m = Math.pow(10, om.decimalen);
      parse = (b) => { const v = ruw(b); return v === null ? null : Math.round(v * om.factor * m) / m; };
      if (heeftBereik) { min = min * om.factor; max = max * om.factor; }
      unit = om.eenheid;
    }
    const std = standaardBereik(naam, band, unit);
    const def = { name: naam, unit, cat: 'Eigen', eigen: true, ecu, tempo, band,
      min: heeftBereik ? min : std ? std.min : -1e9, max: heeftBereik ? max : std ? std.max : 1e9, formule: String(e.formule || 'A'), parse };
    // De grenzen gaan mee, ook als de klant zelf een bereik gaf: dat zegt
    // waar de schaal loopt, niet wanneer het te warm is.
    if (std) ['wH', 'dH', 'dL'].forEach((k) => { if (typeof std[k] === 'number') def[k] = std[k]; });
    // balkVol hoort bij de standaardschaal; een eigen bereik heeft die niet.
    if (std && !heeftBereik && typeof std.balkVol === 'number') def.balkVol = std.balkVol;
    return { ok: true, code, ecu, def };
  }

  let _eigen = {};                     // code → def, van het voertuig dat nu aan de adapter hangt
  let _laatst = { lijst: null, voertuig: '' };
  function eigenZet(lijst, voertuig, opnieuw) {
    _laatst = { lijst: lijst, voertuig: voertuig };
    const oud = Object.keys(_eigen);
    _eigen = {};
    (Array.isArray(lijst) ? lijst : []).slice(0, EIGEN_MAX).forEach(e => {
      const r = eigenControleer(e);
      if (!r.ok) { btDiagSafe('Eigen PID overgeslagen: ' + r.fout); return; }
      if (window.ALL_PID_DEFS && ALL_PID_DEFS[r.code] && !ALL_PID_DEFS[r.code].eigen) return;   // de app kent hem al
      _eigen[r.code] = r.def;
    });
    try {
      if (window.ALL_PID_DEFS) {
        oud.forEach(c => { if (ALL_PID_DEFS[c] && ALL_PID_DEFS[c].eigen) delete ALL_PID_DEFS[c]; });
        Object.keys(_eigen).forEach(c => { ALL_PID_DEFS[c] = _eigen[c]; });
      }
    } catch (x) { console.warn('Eigen PIDs niet geregistreerd', x); }
    const nieuw = Object.keys(_eigen).join(',');
    if (opnieuw || nieuw !== oud.join(',')) {
      try { if (typeof buildDiscoveredPIDList === 'function' && typeof supportedPIDs !== 'undefined' && supportedPIDs.size) buildDiscoveredPIDList(); }
      catch (x) { console.warn('keuzelijst niet herbouwd na eigen PIDs', x); }
      if (Object.keys(_eigen).length) btDiagSafe('Eigen PIDs van ' + (voertuig || 'dit voertuig') + ': ' + nieuw);
    }
    return Object.keys(_eigen).length;
  }
  function eigenInterval(pid) { const d = _eigen[String(pid || '').toUpperCase()]; return d ? (d.tempo === 'opverzoek' ? EIGEN_OPVERZOEK_MS : EIGEN_TEMPO[d.tempo] || EIGEN_TEMPO.normaal) : null; }
  /* Gaat deze eigen PID buiten de pollus om? Dan slaat pidsDueNow hem over
     en komt hij niet in de keuzelijst (#396). */
  function eigenOpVerzoek(pid) { const d = _eigen[String(pid || '').toUpperCase()]; return !!(d && d.tempo === 'opverzoek'); }
  /* Opnieuw zetten na een andere drukvoorkeur. Waarden in de oude eenheid
     gaan weg: met een band die eens per minuut gevraagd wordt stond er
     anders tot een minuut lang "2,3 psi". */
  function eigenHerzet() {
    if (!_laatst.lijst) return 0;
    try {
      if (typeof pidVals !== 'undefined' && pidVals)
        Object.keys(_eigen).forEach(c => { if (DRUK_KPA[String((_laatst.lijst.find(e => String(e.code).toUpperCase() === c) || {}).eenheid || '').toLowerCase()]) delete pidVals[c]; });
    } catch (x) { console.warn('PLEigen: oude drukwaarden niet gewist', x); }
    return eigenZet(_laatst.lijst, _laatst.voertuig, true);
  }

  /* Eén eigen PID opvragen, met zijn ECU-adres als hij dat heeft. Wordt
     aangeroepen vanuit de pollus (die het busslot al heeft) en vanuit test().
     Met een adres: ATSH<adres>, de vraag, en ALTIJD weer terug naar het
     functionele adres — 7DF, of 18DB33F1 als het adres 29-bit is. Mislukt
     dat terugzetten, dan probeert de volgende vraag het eerst opnieuw: een
     adapter die op 7E1 blijft staan, krijgt van de motor geen antwoord meer. */
  let _terug = null;
  async function eigenVraag(code, ecu) {
    code = String(code || '').toUpperCase();
    if (ecu === undefined) { const d = _eigen[code]; ecu = (d && d.ecu) || ''; }
    const cmd = (typeof pidCmd === 'function') ? pidCmd(code, true) : code + '1';
    if (_terug) { await sendCmd(_terug, 1500); _terug = null; }
    if (!ecu) return sendCmd(cmd, 2500);
    const terug = await adresZet(ecu);
    try { return await sendCmd(cmd, 2500); }
    finally { await adresTerug(terug, code); }
  }

  /* Het adres zetten, en wat er daarna terug moet. Bij "tx>rx" ook het
     ontvangstfilter (ATCRA) en de flow control: een antwoord van meer dan
     zeven bytes komt in frames, en de ECU stuurt het tweede pas na een
     flow control op ZIJN adres. Zonder ATFCSH stuurt de ELM die naar
     rx − 8, en dat is bij 778 niet 70E. ATFCSD/ATFCSM bestaan vanaf ELM
     1.3; een kloon die '?' zegt krijgt nog wel de korte antwoorden. */
  async function adresZet(ecu) {
    const functioneel = 'ATSH' + (ecu.length === 8 ? '18DB33F1' : '7DF');
    const p = ecu.split('>');
    if (p.length === 1) { await sendCmd('ATSH' + ecu, 1500); return [functioneel]; }
    await sendCmd('ATSH' + p[0], 1500);
    await sendCmd('ATCRA' + p[1], 1500);
    for (const c of ['ATFCSH' + p[0], 'ATFCSD300000', 'ATFCSM1']) {
      let r = '';
      try { r = String(await sendCmd(c, 1500) || ''); } catch (x) { r = '?'; }
      if (/\?/.test(r)) { btDiagSafe('Adapter kent ' + c + ' niet — lange antwoorden van ' + ecu + ' kunnen afbreken'); break; }
    }
    return ['ATFCSM0', 'ATCRA', functioneel];
  }
  async function adresTerug(lijst, code) {
    for (const c of lijst) {
      try { await sendCmd(c, 1500); }
      catch (x) { _terug = lijst[lijst.length - 1]; btDiagSafe(c + ' terugzetten na ' + code + ' mislukt — volgende vraag probeert het opnieuw: ' + (x && x.message || x)); }
    }
  }

  function eigenDefs() { return Object.keys(_eigen).map(c => Object.assign({ pid: c }, _eigen[c])); }
  function isEigen(pid) { return Object.prototype.hasOwnProperty.call(_eigen, String(pid || '').toUpperCase()); }

  /* Eén keer opvragen, voor de knop "Test" in het sensorscherm. Alleen met
     een echte verbinding, via het busslot, en alleen een leescode. */
  async function eigenTest(e) {
    const r = eigenControleer(e);
    if (!r.ok) return { ok: false, fout: r.fout };
    if (typeof connected === 'undefined' || !connected || (typeof demoMode !== 'undefined' && demoMode)) return { ok: false, fout: 'Niet verbonden met een auto' };
    if (typeof sendCmd !== 'function' || typeof withBus !== 'function') return { ok: false, fout: 'Busfuncties ontbreken' };
    let raw = '';
    await withBus('eigen PID testen', async () => { raw = await eigenVraag(r.code, r.ecu); }, 6000);
    const schoon = antwoordHex(raw);
    const echo = ((parseInt(r.code.slice(0, 2), 16) + 0x40).toString(16).toUpperCase()) + r.code.slice(2);
    const at = schoon.indexOf(echo);
    if (at < 0) return { ok: false, raw: String(raw || '').trim().slice(0, 60), fout: /7F/.test(schoon) ? 'De auto weigert deze code (7F)' : 'Geen antwoord op deze code' };
    const bytes = [];
    for (let k = at + echo.length; k + 1 < schoon.length; k += 2) bytes.push(parseInt(schoon.slice(k, k + 2), 16));
    return { ok: true, raw: String(raw || '').trim().slice(0, 60), bytes, waarde: r.def.parse(bytes), eenheid: r.def.unit };
  }

  /* Kandidaten uit het antwoord van de AI: het eerste JSON-object in de
     tekst, en daaruit alleen wat door controleer() komt én een http(s)-bron
     heeft. Verzonnen of schrijvende codes vallen er hier al uit; de server
     keurt ze daarna nog eens. Puur: test-mode21.js toetst hem los. */
  /* ── OBDb: codes uit de open database (#526, 15-10-2026) ──────────
     Hier stond zoekOnline(): de AI zocht met web_search op internet. Dat
     kostte 50–85 tokens per keer (de zoekresultaten tellen als invoer), het
     kostenvenster schatte ±7, en voor de i20 kwam er niets uit. OBDb
     (github.com/OBDb, CC BY-SA 4.0) heeft per merk en model één JSON met de
     code, het ECU-adres en de omrekening — gratis, herhaalbaar, met bron. De
     keuring blijft de test op de auto.

     Wat we overnemen: alleen leesdiensten 21/22, op 7xx met het antwoord op
     +8, op 29-bit, of met een ander antwoordadres als "tx>rx" (sinds
     22-10-2026: VAG, PSA, Opel, Nissan); geen extended addressing (BMW).
     Hele bytes, ook voorbij H als [n], zonder teken of opzoektabel. Eén
     code per commando: de bibliotheek kent per code één formule. */
  const OBDB_EENHEID = {
    celsius: '°C', bars: 'bar', psi: 'psi', kilopascal: 'kPa', percent: '%', volts: 'V', amps: 'A',
    kilometers: 'km', kilometersPerHour: 'km/h', meters: 'm', millimeters: 'mm', degrees: '°', rpm: 'rpm',
    newtonMeters: 'Nm', seconds: 's', milliseconds: 'ms', minutes: 'min', hours: 'h', liters: 'l',
    ampereHours: 'Ah', ohms: 'Ω', hertz: 'Hz', watts: 'W', kilowatts: 'kW', kilowattHours: 'kWh',
    metersPerSecondSquared: 'm/s²'
  };
  // Zonder eenheid ("scalar", leeg) is het in OBDb bijna altijd een stand of
  // schakelaar (alarmlichten, remlicht), geen meetwaarde: die blijven weg.
  // Omrekenen naar metrisch: [eenheid, vóór, na] om de ruwe formule heen.
  const OBDB_OM = { fahrenheit: ['°C', '((', ')-32)*5/9'], miles: ['km', '(', ')*1.609344'] };

  /* ── Van RDW-naam naar OBDb-model (#541-dekking, 22-10-2026) ────────
     Gemeten tegen het échte NL-wagenpark (RDW open data, 9,3 miljoen auto's
     sinds 2001, top-1500 merk/handelsbenaming): de oude vorm vond voor 51%
     een OBDb-bestand. RDW schrijft het merk vaak in het model ("TOYOTA
     AYGO", "MAZDA CX-5"), OBDb noemt Opel "VauxhallOpel", de ID.3 "ID3" en
     een BMW "3-Series"; "UP!", "CEE D" en "I 10" vonden niets.

     OBDB_MODELLEN is de index van OBDb (obdb.community/data/matrix_data.json,
     22-10-2026: de 591 modellen met codes). Daarmee kiest de app zelf de
     goede naam, zonder vijf keer te proberen. Een model dat er later bij
     komt, vindt de oude vorm nog (achteraan in de lijst). */
  const OBDB_MODELLEN = {
    Acura: "CSX|ILX|Integra|MDX|RDX|TL|TLX|TSX|ZDX",
    Aiways: "U5",
    Audi: "A1|A3|A3-e-tron|A4|A5|A6|A7|e-tron|e-tron-GT|Q2|Q3|Q4-e-tron|Q5|Q7|Q8|Q8-e-tron|RS-3|RS-5|RS-e-tron|S3|S4|S5|S6|SQ2|SQ5|SQ7|SQ8|TT|TTS",
    Bentley: "Bentayga",
    BMW: "1-Series|2-Series|2-Series-Plug-in-Hybrid|3-Series|3-Series-eDrive|4-Series|5-Series|6-Series|6-Series-Gran-Coupe|6-Series-Gran-Turismo|7-Series|ALPINA-XB7|i3|I3s|i3s|i4|i5|i8|iX|iX3|M2|M3|M3-CS|M4|M5|X1|X2|X3|X4|X5|X5-M|X6|X7|XM|Z4",
    Buick: "Enclave|Encore|Envision|LaCrosse",
    BYD: "Sealion-6",
    Cadillac: "CT4|CT5|CT6|CTS|DTS|ELR|Escalade|LYRIQ|SRX|XT5",
    Chevrolet: "Avalanche|Aveo|Blazer|Bolt-EUV|Bolt-EV|Camaro|Caprice|Cobalt|Colorado|Corvette|Cruze|Cruze-Limited|Equinox|Equinox-EV|Express|Express-Cargo|HHR|Impala|Impala-Limited|Malibu|Orlando|S-10|Sail|Silverado|Silverado-1500|Silverado-2500|Silverado-3500|Sonic|Spark|Spin|Tahoe|Trailblazer|Traverse|Trax|Volt",
    Chrysler: "200|300|Pacifica",
    Citroen: "eC4-X",
    Cupra: "Born|Formentor|Leon|Tavascan|Terramar",
    Dacia: "Dokker|Duster|Sandero|Spring",
    Daihatsu: "Hijet|Terios",
    Dodge: "Caliber|Challenger|Charger|Dakota|Dart|Durango|Grand-Caravan|Hornet|Journey",
    FIAT: "500|500e|500X|Bravo|Fastback|Panda|Qubo",
    Ford: "B-Max|Bronco|Bronco-Sport|C-Max|C-Max-Energi|C-Max-Hybrid|Crown-Victoria|E-Series|E-Series-Wagon|EcoSport|Edge|Escape|Everest|Expedition|Explorer|Explorer-Sport-Trac|F-150|F-150-Lightning|F-250|F-350|Fiesta|Flex|Focus|Focus-Electric|Focus-RS|Focus-ST|Fusion|Fusion-Energi|Fusion-Hybrid|Kuga|Maverick|Mondeo|Mustang|Mustang-Mach-E|Puma|Ranger|S-Max|Taurus|Taurus-X|Territory|Tourneo|Transit|Transit-Connect",
    Genesis: "G70|G80|GV60|GV80",
    GMC: "Acadia|Canyon|Sierra-1500|Sierra-2500HD|Sierra-3500HD|Terrain|Yukon|Yukon-XL",
    Haval: "H6-HEV|Jolion|Jolion-HEV",
    Holden: "Colorado|Commodore|Cruze",
    Honda: "Accord|Accord-Hybrid|City|Civic|Clarity|CR-V|CR-V-Hybrid|CR-Z|Crosstour|Element|Fit|HR-V|Insight|Jazz|Odyssey|Pilot|Prelude|Prologue|Ridgeline|S2000|Shuttle|ZR-V",
    Hyundai: "Accent|Avante|Azera|Elantra|HB20|HB20S|i10|i20|i30|i40|IONIQ-5|IONIQ-6|IONIQ-9|IONIQ-Electric|IONIQ-PlugIn-Hybrid|Kona|Kona-Electric|Palisade|Santa-Cruz|Santa-Fe|Santa-Fe-Hybrid|Sonata|Tucson|Tucson-Hybrid|Veloster|Venue|Veracruz|Verna",
    INFINITI: "Q50|Q60|QX50|QX55|QX60|QX70|QX80",
    Jaguar: "E-PACE|F-PACE|F-TYPE|I-PACE",
    Jeep: "Avenger|Cherokee|Compass|Gladiator|Grand-Cherokee|Grand-Wagoneer|Patriot|Renegade|Wagoneer-L|Wrangler|Wrangler-4xe|Wrangler-JK",
    Kia: "Cadenza|Carens|Carnival|Ceed|Cerato|EV3|EV6|EV9|Forte|K4|K5|Niro|Niro-EV|Optima|Picanto|Rio|Seltos|Sonet|Sorento|Soul|Soul-EV|Sportage|Sportage-HEV|Stinger|Stonic|Tasman|Telluride|XCeed",
    "Land-Rover": "|Defender|Discovery|LR4|Range-Rover|Range-Rover-Evoque|Range-Rover-Velar",
    Lexus: "CT-200h|ES|ES-300h|GX|GX-460|GX-470|IS|IS-300|LS-600h-L|NX|NX-350h|RC|RX|UX",
    Lincoln: "MKC|MKZ|Nautilus|Navigator|Town-Car",
    Mazda: "2|3|5|6|B-Series-Pickup|BT50|CX-3|CX-30|CX-5|CX-50|CX-60|CX-9|CX-90|Mazdaspeed-3|Mazdaspeed-MX-5|MX-30|MX-5|MX-5-Miata|Tribute",
    "Mercedes-Benz": "|A-180|B-Class|C-Class|CL-Class|CLK-Class|E-Class|EQA|EQB|EQV|G-Class|GLA-Class|GLC-Class|GLK-Class|M-Class|ML-350|SL-Class|SLC-Class|SLK-Class|Viano",
    MG: "EHS|HS|MG4|MG5|One|RX9|ZS|ZS-EV",
    MINI: "Clubman|Cooper|Cooper-SE|Countryman|Hardtop",
    Mitsubishi: "ASX|Eclipse-Cross|Outlander|Outlander-PHEV|Outlander-Sport|RVR|Triton",
    Nissan: "350Z|370Z|Altima|ARIYA|Armada|Frontier|Kicks|Leaf|Maxima|Micra|Murano|NV-Passenger|Pathfinder|Patrol|Pulsar|Qashqai|Rogue|Rogue-Sport|Sentra|Titan|Titan-XD|Versa|X-Trail|Xterra|Z",
    Peugeot: "107|2008|207|208|3008|308|408|5008|508|Partner|RCZ",
    Polestar: "2|4",
    Porsche: "718|911|Cayenne|Cayman|Macan|Macan-Electric|Panamera|Taycan",
    Ram: "1500|1500-Classic|2500|3500|ProMaster-Window-Van",
    Renault: "Captur|Clio|Duster|Kadjar|Laguna|Megane|Megane-E-Tech|Scenic|Symbioz|Trafic|Twingo|ZOE",
    Scion: "FR-S|iQ|tC|xB",
    Seat: "Alhambra|Arona|Ateca|Ibiza|Leon|Mii|Mii-Electric|Tarraco",
    Skoda: "Citigo-e-iV",
    smart: "fortwo",
    Subaru: "Ascent|BRZ|Crosstrek|Forester|Impreza|Legacy|Outback|Solterra|Tribeca|WRX",
    Suzuki: "Baleno|Jimny|Splash|Swift|Vitara|XL7",
    Toyota: "4Runner|Allion|Aqua|Auris|Avalon|Avalon-Hybrid|Aygo|bZ4X|C-HR|Camry|Camry-Hybrid|Corolla|Corolla-Cross|Corolla-Hybrid|Crown|FJ-Cruiser|Fortuner|GR-Corolla|GR-Supra|GR86|Grand-Highlander|Grand-Highlander-Hybrid|GT86|Hiace|Highlander|Hilux|Land-Cruiser|Land-Cruiser-Hybrid|Matrix|Mirai|Prius|Prius-Prime|Prius-v|RAV4|RAV4-Hybrid|RAV4-Prime|Sequoia|Sienna|Sienna-Hybrid|Supra|Tacoma|Tundra|Veloz|Venza|Venza-Hybrid|Vios|Yaris|Yaris-Cross|Yaris-iA",
    VauxhallOpel: "Corsa|Corsa-e|Mokka",
    Volkswagen: "Amarok|Arteon|Atlas|Beetle|Beetle-Convertible|CC|Crafter|e-Golf|e-Up|Golf|ID-Buzz|ID3|ID5|ID7-Tourer|Jetta|Jetta-GLI|Multivan|Passat|Polo|Scirocco|T-Cross|T-Roc|T6-Transporter|Taigo|Taos|Tiguan|Touareg|Touran|Transporter|Up|Virtus",
    Volvo: "S40|S60|S80|S90|V40|V60|XC40|XC40-Recharge|XC60|XC90",
  };

  // RDW-merk (genormaliseerd: kleine letters, alleen a-z0-9) → OBDb-merk(en).
  const OBDB_MERK = { opel: ['VauxhallOpel'], vauxhall: ['VauxhallOpel'], mercedesbenz: ['Mercedes-Benz'],
    landrover: ['Land-Rover'], alfaromeo: ['Alfa-Romeo'], rollsroyce: ['Rolls-Royce'], citroen: ['Citroen'] };
  /* Zustermodellen: dezelfde auto uit dezelfde fabriek onder een ander
     merk, met dezelfde motor en dezelfde stuurapparaten. Alleen waar OBDb
     het model zelf niet heeft. Een code van de tweeling wordt net zo goed
     eerst op de auto getoetst (de keuring); het resultaat zegt erbij dat
     het via de tweeling kwam. */
  const OBDB_TWEELING = {
    'peugeot|108': 'Peugeot-107', 'citroen|c1': 'Peugeot-107',        // Toyota/PSA Kolín, 2005–2022
    'skoda|citigo': 'Volkswagen-Up',                                       // VW Bratislava, 2011–2020
    'opel|agila': 'Suzuki-Splash',                                         // Suzuki Esztergom, 2008–2014
    'suzuki|swace': 'Toyota-Corolla', 'suzuki|across': 'Toyota-RAV4',      // Toyota met een Suzuki-logo
    'mazda|2hybrid': 'Toyota-Yaris',                                       // Mazda2 Hybrid = Yaris IV
    'lynkco|01': 'Volvo-XC40',                                             // CMA, Volvo-motoren
    // VAG: zelfde platform, zelfde motor-ECU (MQB/PQ)
    'skoda|octavia': 'Volkswagen-Golf', 'skoda|fabia': 'Volkswagen-Polo', 'skoda|kamiq': 'Volkswagen-T-Cross',
    'skoda|kodiaq': 'Volkswagen-Tiguan', 'skoda|karoq': 'Seat-Ateca', 'skoda|superb': 'Volkswagen-Passat',
    // PSA/Stellantis: dezelfde EB/EP/DV-motoren en ECU's als Peugeot
    'citroen|c3': 'Peugeot-208', 'citroen|c3aircross': 'Peugeot-2008', 'citroen|c4cactus': 'Peugeot-208',
    'citroen|c4': 'Peugeot-308', 'citroen|c5aircross': 'Peugeot-3008', 'citroen|berlingo': 'Peugeot-Partner',
    'opel|crosslandx': 'Peugeot-2008', 'opel|crossland': 'Peugeot-2008', 'opel|grandlandx': 'Peugeot-3008', 'opel|grandland': 'Peugeot-3008',
    // overige
    'volvo|v50': 'Volvo-S40', 'volvo|v70': 'Volvo-S80', 'volvo|ex40': 'Volvo-XC40-Recharge',
    'hyundai|ix35': 'Hyundai-Tucson', 'dacia|logan': 'Dacia-Sandero', 'renault|modus': 'Renault-Clio',
    'mini|mini': 'MINI-Cooper', 'mini|one': 'MINI-Cooper', 'bmw|ix1': 'BMW-X1',
    // MEB: ID.4 en Enyaq zijn de ID.5 zonder schuin dak (zelfde accu, zelfde ECU's)
    'volkswagen|id4': 'Volkswagen-ID5', 'skoda|enyaq': 'Volkswagen-ID5'
  };
  const _sl = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  /* {namen, tweeling}: de OBDb-namen om te proberen, beste eerst. */
  function obdbKoppel(merk, model, brandstof) {
    const mk = String(merk || '').trim(), vol0 = String(model || '').trim();
    if (!mk || !vol0) return { namen: [], tweeling: null };
    const mks = _sl(mk);
    // Het merk uit het model halen: "TOYOTA AYGO", "MAZDA2", "LYNK & CO 01".
    let vol = vol0.toUpperCase();
    const ml = vol.replace(/[^A-Z0-9]/g, '');
    if (ml.indexOf(mks.toUpperCase()) === 0 && ml.length > mks.length) {
      let n = 0, k = 0;
      while (k < vol.length && n < mks.length) { if (/[A-Z0-9]/.test(vol[k])) n++; k++; }
      vol = vol.slice(k).replace(/^[\s&-]+/, '');
    }
    vol = vol.replace(/[!.,/]+/g, ' ').replace(/\bCEE\s+D\b/, 'CEED').replace(/^([A-Z])\s+(\d+)\b/, '$1$2')
      .replace(/^(\d)ER\s+REIHE\b/, '$1-SERIES').replace(/\s+/g, ' ').trim();
    const w = vol.split(' ');
    // Wat niet bij het model hoort: uitvoering, carrosserie, aandrijving.
    const RUIS = /^(HYBRID|HEV|PHEV|PLUG-?IN|SPORTS?|TOURER|ESTATE|STATION|WAGON|SW|SPORTBACK|VARIANT|COMBI|AVANT|TOURING|CABRIO(LET)?|COUPE|AUTOMAAT|PRO|KW|\d+KW|E-TECH|XDRIVE|4MATIC|QUATTRO|4X4|AWD)$/;
    const kern = [];
    for (const x of w) { if (RUIS.test(x) || /^\d{2,3}$/.test(x) && kern.length) break; kern.push(x); }
    const vormen = [w.join(' '), kern.join(' '), w.slice(0, 2).join(' '), w[0], w[0].replace(/-[A-F]$/, ''), mks + w[0]];
    // "E-NIRO", "E-208": de elektrische uitvoering met een E ervoor.
    if (/^E-./.test(w[0])) vormen.push(w[0].slice(2), 'E' + w[0].slice(2));
    if (mks === 'bmw' && /^[1-8]\d{2}/.test(w[0])) vormen.push(w[0][0] + '-SERIES');
    if (/^mercedes/.test(mks) && /^[A-Z]{1,3}\s*\d{2,3}/.test(vol)) vormen.push(vol.match(/^[A-Z]{1,3}/)[0] + '-CLASS');
    if (/^mercedes/.test(mks) && /^A\s*\d{2,3}\b/.test(vol)) vormen.push('A-180');   // OBDb noemt de A-klasse zo
    const merken = OBDB_MERK[mks] || [mk.replace(/\s+/g, '-')];
    const uit = [];
    let tweeling = null;
    const hyb = /hybr/i.test(String(brandstof || ''));
    // Elektrisch: dezelfde naam met de EV-uitgang van OBDb gaat voor
    // (Kia-Niro-EV, Hyundai-Kona-Electric, Audi-Q4-e-tron, XC40-Recharge).
    const ev = /elektr|electric/i.test(String(brandstof || '')) || /\b(ELECTRIC|EV|E-TRON)\b/.test(vol) || /^E-/.test(w[0]);
    const evUit = (s) => [s + 'ev', s + 'electric', 'e' + s, s + 'e', s + 'etron', s + 'recharge', s + 'etech'];
    merken.forEach(function (m) {
      const idx = Object.keys(OBDB_MODELLEN).find((x) => _sl(x) === _sl(m));
      const lijst = idx ? OBDB_MODELLEN[idx].split('|') : [];
      vormen.forEach(function (v) {
        const s = _sl(v);
        if (!s) return;
        const evS = ev ? evUit(s) : [];
        const raak = lijst.filter((x) => _sl(x) === s || (hyb && _sl(x) === s + 'hybrid') || evS.indexOf(_sl(x)) >= 0);
        const voorkeur = (x) => (hyb && /hybrid/i.test(x)) || (ev && evS.indexOf(_sl(x)) >= 0) ? 1 : 0;
        raak.sort((a, b) => voorkeur(b) - voorkeur(a));
        raak.forEach((x) => uit.push(idx + '-' + x));
      });
    });
    const tw = OBDB_TWEELING[mks + '|' + _sl(kern.join(' '))] || OBDB_TWEELING[mks + '|' + _sl(w[0])];
    if (!uit.length && tw) { uit.push(tw); tweeling = tw; }
    // De oude vorm erachter: een model dat na 22-10-2026 in OBDb kwam.
    const m0 = mk.replace(/\s+/g, '-');
    [vol0.replace(/\s+/g, '-'), w.join('-'), w[0], w[0].replace(/^([A-Za-z]+)(\d)/, '$1-$2')].forEach((x) => x && uit.push(m0 + '-' + x));
    const gezien = {};
    return { namen: uit.filter((x) => { const k = x.toLowerCase(); if (gezien[k]) return false; gezien[k] = 1; return true; }).slice(0, 6), tweeling };
  }
  function obdbNamen(merk, model, brandstof) { return obdbKoppel(merk, model, brandstof).namen; }

  function obdbGetal(n) { return String(Math.round(Number(n) * 1e6) / 1e6); }

  /* fmt {bix, len, mul, div, add, blsb, sign, map, unit} → formule in A–H,
     of null als hij niet in die notatie past. */
  function obdbFormule(fmt) {
    const f = fmt || {};
    const bix = Number(f.bix || 0), len = Number(f.len);
    if (f.sign || f.map || bix % 8 || [8, 16, 24, 32].indexOf(len) < 0) return null;
    const i0 = bix / 8, n = len / 8;
    if (i0 + n > 256) return null;
    const delen = [];
    for (let k = 0; k < n; k++) {
      const w = f.blsb ? k : n - 1 - k;
      // Voorbij H: [n] (Honda, de accu van Kia/Hyundai).
      delen.push((i0 + k < 8 ? 'ABCDEFGH'[i0 + k] : '[' + (i0 + k) + ']') + (w ? '*' + Math.pow(256, w) : ''));
    }
    let x = delen.join('+');
    const groep = () => (x.indexOf('+') >= 0 || x.indexOf('-') >= 0 ? '(' + x + ')' : x);
    if (f.mul !== undefined) { if (!(Number(f.mul) > 0)) return null; x = groep() + '*' + obdbGetal(f.mul); }
    if (f.div !== undefined) { if (!(Number(f.div) > 0)) return null; x = groep() + '/' + obdbGetal(f.div); }
    if (f.add !== undefined && Number(f.add)) x += (Number(f.add) < 0 ? '-' : '+') + obdbGetal(Math.abs(Number(f.add)));
    const om = OBDB_OM[f.unit];
    if (om) x = om[1] + x + om[2];
    return x;
  }

  // filter {from, to}: to < from betekent twee open stukken (t/m to, of vanaf from).
  function obdbJaarPast(filter, jaar) {
    if (!filter || !jaar) return true;
    const j = Number(jaar), van = filter.from, tot = filter.to;
    if (Array.isArray(filter.years) && filter.years.indexOf(j) >= 0) return true;
    if (van !== undefined && tot !== undefined) return tot >= van ? (j >= van && j <= tot) : (j <= tot || j >= van);
    if (van !== undefined) return j >= van;
    if (tot !== undefined) return j <= tot;
    return !Array.isArray(filter.years);
  }

  /* Wat een kandidaat waard is voor de analyse (17-10-2026). Een model in
     OBDb heeft soms meer dan 1000 codes; de lijst houdt er 60. Zonder volgorde
     vielen juist de accu- en laadcodes eraf (Audi A3, Seat Leon, Toyota).
     Nu eerst wat een oordeel beslist (de gevraagde laadspanning, de
     laadtoestand van de 12V-accu), dan banden, olie en automaat. */
  function obdbWaarde(naam) {
    const r = laadRol(naam);
    if (r === 'gevraagd') return 120;
    if (r === 'soc') return 110;
    if (r) return 100;
    const n = String(naam || '').toLowerCase();
    // De hoogspanningsaccu (22-10-2026): voor een EV-rijder het belangrijkste
    // wat de auto kan zeggen. Een Niro EV had zijn laadtoestand op plek 42.
    if (!/(aux|12 ?v|auxiliary)/.test(n)) {
      if (/(state of charge|\bsoc\b)/.test(n)) return 115;
      if (/(state of health|\bsoh\b)/.test(n)) return 114;
      if (/(range remaining|reserve range|\brange\b)/.test(n)) return 95;
      if (/(high voltage|\bhv\b|traction).*(battery).*(temp|volt|current)|(battery).*(cell).*(temp|volt)/.test(n)) return 92;
    }
    if (bandRol(naam)) return 90;
    if (/oil temp|olietemp/.test(n)) return 85;
    if (/(transmission|gearbox|\batf\b).*(temp)|temp.*(transmission|gearbox)/.test(n)) return 80;
    if (/wheel speed/.test(n)) return 50;
    return 0;
  }
  /* Het adres van een OBDb-commando in de vorm die eigenControleer kent, of
     null. 11-bit: hdr 7E0, antwoord hdr+8. 29-bit staat in OBDb kort: hdr
     "DA10" met rax "10" is 18DA10F1, antwoord 18DAF110. Een ander
     antwoordadres wordt "tx>rx" (zie EIGEN_ECU). Extended addressing (BMW,
     eax) en het 29-bit-schema van Volvo (D016) tellen we, maar bieden we
     nog niet aan. */
  function obdbAdres(c) {
    const hdr = String(c.hdr || '').toUpperCase(), rax = String(c.rax || '').toUpperCase();
    if (c.eax) return null;                     // BMW/MINI: extended addressing, nog niet
    if (/^DA[0-9A-F]{2}$/.test(hdr)) return (!rax || rax === hdr.slice(2)) ? '18' + hdr + 'F1' : null;
    if (/^18DA[0-9A-F]{2}F1$/.test(hdr)) return (!rax || rax.slice(-2) === hdr.slice(4, 6)) ? hdr : null;
    if (!/^[67][0-9A-F]{2}$/.test(hdr)) return null;
    if (!rax || parseInt(rax, 16) === parseInt(hdr, 16) + 8) return /^7/.test(hdr) ? hdr : hdr + '>' + (parseInt(hdr, 16) + 8).toString(16).toUpperCase();
    // Een ander antwoordadres (VAG 70E → 778, PSA 6A2 → 682): "tx>rx", met
    // ATCRA en flow control in adresZet(). Tot 22-10-2026 viel dit weg, en
    // daarmee het grootste deel van VAG, PSA en Opel.
    return /^[0-9A-F]{3}$/.test(rax) ? hdr + '>' + rax : null;
  }

  function obdbKandidaten(data, repo, jaar, telling) {
    const cmds = (data && Array.isArray(data.commands)) ? data.commands.slice() : [];
    // Geverifieerde commando's eerst; dbg staat voor wat nog in onderzoek is.
    cmds.sort((a, b) => (a && a.dbg ? 1 : 0) - (b && b.dbg ? 1 : 0));
    const url = 'https://github.com/OBDb/' + repo;
    const uit = [], gezien = {};
    cmds.forEach(c => {
      if (!c || !c.cmd || !obdbJaarPast(c.filter, jaar)) return;
      const dienst = c.cmd['22'] !== undefined ? '22' : c.cmd['21'] !== undefined ? '21' : '';
      if (!dienst) return;
      const hdr = obdbAdres(c);
      if (hdr === null) { if (telling) telling.adres = (telling.adres || 0) + 1; return; }
      const code = dienst + String(c.cmd[dienst]).toUpperCase();
      // Eén code per commando, en dan de waardevolste: bij een Kona Electric
      // zit de laadtoestand van de HV-accu als zevende waarde in 22E003.
      const sigs = (Array.isArray(c.signals) ? c.signals.slice() : []).map((g, i) => ({ g, i, w: obdbWaarde(g && g.name) }));
      sigs.sort((a, b) => (b.w - a.w) || (a.i - b.i));
      for (const { g } of sigs) {
        const fmt = (g && g.fmt) || {};
        if (!OBDB_EENHEID[fmt.unit] && !OBDB_OM[fmt.unit]) continue;   // aan/uit, hex, ja/nee, zonder eenheid: geen meetwaarde
        const fo = obdbFormule(fmt);
        if (!fo) continue;
        const eenheid = OBDB_OM[fmt.unit] ? OBDB_OM[fmt.unit][0] : OBDB_EENHEID[fmt.unit];
        const r = eigenControleer({ code, naam: g.name, formule: fo, eenheid, ecu: hdr });
        if (!r.ok) continue;
        const sl = r.code + '@' + r.ecu;
        if (gezien[sl]) break;
        gezien[sl] = 1;
        uit.push({ code: r.code, ecu: r.ecu, naam: r.def.name, formule: fo.replace(/\s+/g, '').toUpperCase(), eenheid, url, waarde: obdbWaarde(g.name), i: uit.length });
        break;
      }
    });
    // Op waarde, en binnen gelijke waarde de volgorde van OBDb (dbg achteraan).
    uit.sort((a, b) => (b.waarde - a.waarde) || (a.i - b.i));
    if (telling) telling.weg = Math.max(0, uit.length - 60);
    return uit.slice(0, 60).map(k => { delete k.waarde; delete k.i; return k; });
  }

  /* Zoeken voor een voertuig {merk, model, bouwjaar}. Geen AI, geen tegoed.
     `haal(repo)` → { gevonden, data } komt van de aanroeper: in de app de
     Worker-actie obdb_bestand (PLGarage): een module haalt niets zelf van
     het net (test-plfetch.js). Gooit hij, dan is OBDb niet bereikbaar. */
  async function zoekObdb(v, haal) {
    v = v || {};
    if (!v.merk || !v.model) return { ok: false, fout: 'Vul eerst merk en model in bij het profiel' };
    if (!haal) return { ok: false, fout: 'Geen weg naar OBDb' };
    const kop = obdbKoppel(v.merk, v.model, v.brandstof), namen = kop.namen;
    for (const repo of namen) {
      let d;
      try { d = await haal(repo); }
      catch (x) { console.warn('PLEigen: OBDb niet bereikbaar', x); return { ok: false, fout: 'OBDb niet bereikbaar (' + String(x && x.message || x) + ')' }; }
      if (!d || !d.gevonden) continue;
      const telling = {};
      return { ok: true, repo, tweeling: repo === kop.tweeling, kandidaten: obdbKandidaten(d.data, repo, v.bouwjaar, telling), nietBruikbaar: telling.adres || 0, afgekapt: telling.weg || 0 };
    }
    return { ok: true, repo: '', kandidaten: [], geprobeerd: namen };
  }

  /* ── BUURSCAN (28-09-2026) ───────────────────────────────────────
     Rond een code die werkt, liggen vaak meer: 222A05 is bandenspanning
     voor-links, 222A06…08 de andere drie. De buurscan vraagt elke code in
     hetzelfde blok (222A00…222AFF) één keer op, bij hetzelfde ECU-adres, en
     houdt bij welke antwoorden. Alleen LEESdiensten (22xxxx of 21xx):
     dezelfde regel als elke eigen PID.

     De bus: per zestien codes één keer het busslot, zodat de gewone meting
     ertussendoor blijft lopen, en per zestien één ATSH heen en terug. Een
     code zonder antwoord kost de wachttijd (SCAN_MS); een heel blok duurt
     zo een halve minuut. Stoppen kan tussen elke twee codes. */
  const SCAN_MS = 600, SCAN_PORTIE = 16;
  // De blokken om te scannen: per ECU-adres en codevoorvoegsel één, uit
  // codes die bewezen werken. Puur.
  function scanBlokken(lijst) {
    const uit = [], gezien = {};
    (lijst || []).forEach(b => {
      const code = String(b && b.code || '').toUpperCase();
      if (!EIGEN_CODE.test(code)) return;
      const prefix = code.slice(0, code.length - 2);
      let ecu = String(b.ecu || '').toUpperCase();
      if (ecu === '7DF') ecu = '';                  // het functionele adres: hetzelfde als geen adres
      if (ecu && !EIGEN_ECU.test(ecu)) return;
      const k = prefix + '@' + ecu;
      if (gezien[k]) { gezien[k].bekend.push(code); return; }
      gezien[k] = { prefix, ecu, bekend: [code] };
      uit.push(gezien[k]);
    });
    return uit;
  }
  function scanCodes(prefix) {
    const uit = [];
    for (let i = 0; i < 256; i++) uit.push(prefix + (i < 16 ? '0' : '') + i.toString(16).toUpperCase());
    return uit;
  }
  // Positief antwoord op `code` in de ruwe tekst → de bytes, anders null.
  // Het hex van een antwoord zonder de ISO-TP-opmaak (plIsoTpHex in
  // pidlane-diagbundel.js); zonder die functie de oude strip.
  function antwoordHex(raw) {
    try { if (typeof plIsoTpHex === 'function') return plIsoTpHex(raw).toUpperCase(); }
    catch (x) { console.warn('PLEigen: plIsoTpHex mislukt — framenummers kunnen in de data staan', x); }
    return String(raw || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  }
  function antwoordBytes(code, raw) {
    const schoon = antwoordHex(raw);
    const echo = ((parseInt(code.slice(0, 2), 16) + 0x40).toString(16).toUpperCase()) + code.slice(2);
    const at = schoon.indexOf(echo);
    if (at < 0) return null;
    const bytes = [];
    for (let k = at + echo.length; k + 1 < schoon.length; k += 2) bytes.push(parseInt(schoon.slice(k, k + 2), 16));
    return bytes;
  }
  let _scan = null;
  async function buurScan(blok, opties) {
    opties = opties || {};
    const prefix = String(blok && blok.prefix || '').toUpperCase(), ecu = String(blok && blok.ecu || '').toUpperCase();
    if (!/^(21|22[0-9A-F]{2})$/.test(prefix)) return { ok: false, fout: 'Alleen leesblokken: 21 of 22xx' };
    if (ecu && !EIGEN_ECU.test(ecu)) return { ok: false, fout: 'Ongeldig ECU-adres' };
    if (typeof connected === 'undefined' || !connected || (typeof demoMode !== 'undefined' && demoMode)) return { ok: false, fout: 'Niet verbonden met een auto' };
    if (typeof sendCmd !== 'function' || typeof withBus !== 'function') return { ok: false, fout: 'Busfuncties ontbreken' };
    if (_scan && _scan.bezig) return { ok: false, fout: 'Er loopt al een scan' };
    const st = _scan = { bezig: true, stop: false, gedaan: 0, totaal: 256, gevonden: [] };
    const codes = scanCodes(prefix);
    try {
      for (let i = 0; i < codes.length && !st.stop; i += SCAN_PORTIE) {
        await withBus('buurscan ' + prefix + (ecu ? '@' + ecu : ''), async () => {
          const terug = ecu ? await adresZet(ecu) : [];
          try {
            for (let j = i; j < Math.min(i + SCAN_PORTIE, codes.length) && !st.stop; j++) {
              if (!connected) { st.stop = true; break; }
              const raw = await sendCmd(codes[j] + '1', SCAN_MS);
              const b = antwoordBytes(codes[j], raw);
              if (b && b.length) st.gevonden.push({ code: codes[j], ecu, bytes: b, raw: String(raw || '').trim().slice(0, 60) });
              st.gedaan = j + 1;
              if (typeof opties.voortgang === 'function') { try { opties.voortgang(st); } catch (x) { console.warn('PLEigen: voortgang', x); } }
            }
          } finally {
            if (ecu) await adresTerug(terug, 'buurscan ' + prefix);
          }
        }, 8000);
      }
    } finally { st.bezig = false; }
    btDiagSafe('Buurscan ' + prefix + 'xx' + (ecu ? ' @ ' + ecu : '') + ': ' + st.gedaan + ' codes gevraagd, ' + st.gevonden.length + ' antwoorden' + (st.stop ? ' (gestopt)' : ''));
    return { ok: true, gedaan: st.gedaan, gestopt: st.stop, gevonden: st.gevonden };
  }
  function buurScanStop() { if (_scan) _scan.stop = true; }
  function buurScanStaat() { return _scan ? { bezig: _scan.bezig, gedaan: _scan.gedaan, totaal: _scan.totaal, gevonden: _scan.gevonden.length } : null; }

  /* Blok 5: geven de eigen PIDs van dit voertuig antwoord tijdens de rit?
     Puur, zodat test-mode21.js hem los toetst. `m` = { echt, defs:[{pid,name}],
     actief:[pid], laatst:{pid:tijd}, waarden:{pid:waarde}, nu }. Een code die
     niet antwoordt is LET OP en geen FOUT: of dat de app is of een code die
     niet bij deze auto hoort, kan de app niet zien — de regel zegt welke. */
  function eigenOordeel(m) {
    m = m || {};
    const defs = m.defs || [], actief = m.actief || [], nu = m.nu || Date.now();
    if (!m.echt) return { staat: 'LET OP', detail: 'niet verbonden met een echte auto' };
    if (!defs.length) return { staat: 'LET OP', detail: 'geen eigen sensor bij het gekoppelde voertuig — voeg er een toe in Mijn voertuigen → Sensoren' };
    // Een band op verzoek staat niet in de actieve lijst en hoort er toch bij (#396).
    const aan = defs.filter(d => d.tempo === 'opverzoek' || actief.indexOf(d.pid) >= 0);
    if (!aan.length) return { staat: 'LET OP', detail: defs.length + ' eigen sensor(en) bij dit voertuig, maar geen enkele aangezet' };
    const ok = [], stil = [];
    aan.forEach(d => {
      // Vers = binnen tweeënhalf keer het tempo, minstens 30 s: een band die
      // elke minuut gevraagd wordt is na 50 s niet stil.
      // Op verzoek (een band, #396): één antwoord deze verbinding is genoeg.
      const t = (m.laatst || {})[d.pid], grens = d.tempo === 'opverzoek' ? Infinity : Math.max(30000, 2.5 * (EIGEN_TEMPO[d.tempo] || EIGEN_TEMPO.normaal));
      if (typeof t === 'number' && nu - t < grens) ok.push(d.name + ' = ' + String((m.waarden || {})[d.pid]).replace('.', ',') + (d.unit ? ' ' + d.unit : ''));
      else stil.push(d.name + ' (' + d.pid + ')');
    });
    if (stil.length) return { staat: 'LET OP', detail: 'geen vers antwoord (binnen 2,5× het tempo) van: ' + stil.join(', ') + (ok.length ? ' — wel van: ' + ok.join(', ') : '') + '. Klopt de code voor deze auto? Test hem in Mijn voertuigen → Sensoren.' };
    return { staat: 'ok', detail: ok.length + ' eigen sensor(en) geven antwoord: ' + ok.join(', ') };
  }

  window.PLEigen = { CODE: EIGEN_CODE, MAX: EIGEN_MAX, formule, controleer: eigenControleer, zet: eigenZet, defs: eigenDefs, is: isEigen, test: eigenTest, oordeel: eigenOordeel,
    ECU: EIGEN_ECU, TEMPO: EIGEN_TEMPO, interval: eigenInterval, opVerzoek: eigenOpVerzoek, herzet: eigenHerzet, bandRol, laadRol, obdbWaarde, obdbAdres, laadOordeel, accuOordeel, laadCodes, laadNu, laad: laadLive, drukOmrekening, standaardBereik,
    scanBlokken, scanCodes, antwoordBytes, buurScan, buurScanStop, buurScanStaat, vraag: eigenVraag, obdbNamen, obdbKoppel, obdbFormule, obdbJaarPast, obdbKandidaten, zoekObdb };
  window.plEigenDefs = eigenDefs;

  btDiagSafe('pidlane-uitgebreid.js geladen — mode 21/22 pad actief');

  function btDiagSafe(m) {
    try { if (typeof btDiag === 'function') btDiag(m, 'info'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
  }
})();
