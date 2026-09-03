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
        const m = (window.vehicleInfo && (vehicleInfo.merk || vehicleInfo.make)) ||
                  (window.selectedModel && selectedModel.merk) || '';
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
    // Bus was bezet: niets gemeten, dus ook niets te melden.
    if (uit.busBezet) return uit;

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

  btDiagSafe('pidlane-uitgebreid.js geladen — mode 21/22 pad actief');

  function btDiagSafe(m) {
    try { if (typeof btDiag === 'function') btDiag(m, 'info'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
  }
})();
