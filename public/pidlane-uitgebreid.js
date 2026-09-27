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
  const EIGEN_ECU = /^(7[0-9A-F]{2}|18DA[0-9A-F]{2}F1)$/;
  const EIGEN_TEMPO = { snel: 1000, normaal: 2000, traag: 10000 };

  /* Formule → functie(bytes). Toegestaan: getallen, A t/m H, + - * / en
     haakjes. Ontbreekt een byte in het antwoord, dan is de uitkomst null. */
  function formule(tekst) {
    const t = String(tekst || '').replace(/\s+/g, '').toUpperCase().replace(/,/g, '.');
    if (!t || t.length > 80) throw new Error('formule leeg of te lang');
    if (!/^[A-H0-9.+\-*/()]+$/.test(t)) throw new Error('alleen A–H, getallen, + - * / en haakjes');
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
    if (ecu && !EIGEN_ECU.test(ecu)) return { ok: false, fout: 'ECU-adres: 7xx (bijv. 7E1) of 18DAxxF1, of leeg laten' };
    const tempo = EIGEN_TEMPO[e.tempo] ? e.tempo : 'normaal';
    let parse;
    try { parse = formule(e.formule || 'A'); } catch (x) { return { ok: false, fout: 'Formule: ' + x.message }; }
    const min = Number(e.min), max = Number(e.max);
    const heeftBereik = isFinite(min) && isFinite(max) && max > min;
    return { ok: true, code, ecu, def: { name: naam, unit: String(e.eenheid || '').slice(0, 12), cat: 'Eigen', eigen: true, ecu, tempo,
      min: heeftBereik ? min : -1e9, max: heeftBereik ? max : 1e9, formule: String(e.formule || 'A'), parse } };
  }

  let _eigen = {};                     // code → def, van het voertuig dat nu aan de adapter hangt
  function eigenZet(lijst, voertuig) {
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
    if (nieuw !== oud.join(',')) {
      try { if (typeof buildDiscoveredPIDList === 'function' && typeof supportedPIDs !== 'undefined' && supportedPIDs.size) buildDiscoveredPIDList(); }
      catch (x) { console.warn('keuzelijst niet herbouwd na eigen PIDs', x); }
      if (Object.keys(_eigen).length) btDiagSafe('Eigen PIDs van ' + (voertuig || 'dit voertuig') + ': ' + nieuw);
    }
    return Object.keys(_eigen).length;
  }
  function eigenInterval(pid) { const d = _eigen[String(pid || '').toUpperCase()]; return d ? EIGEN_TEMPO[d.tempo] || EIGEN_TEMPO.normaal : null; }

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
    const functioneel = 'ATSH' + (ecu.length === 8 ? '18DB33F1' : '7DF');
    await sendCmd('ATSH' + ecu, 1500);
    try { return await sendCmd(cmd, 2500); }
    finally {
      try { await sendCmd(functioneel, 1500); }
      catch (x) { _terug = functioneel; btDiagSafe('Header terugzetten na ' + code + ' mislukt — volgende vraag probeert het opnieuw: ' + (x && x.message || x)); }
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
    const schoon = String(raw || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
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
  function kandidatenUitTekst(tekst) {
    const t = String(tekst || ''), a = t.indexOf('{'), z = t.lastIndexOf('}');
    let j = null;
    if (a >= 0 && z > a) { try { j = JSON.parse(t.slice(a, z + 1)); } catch (x) { console.warn('PLEigen: kandidaten niet te lezen', x); } }
    const lijst = (j && Array.isArray(j.kandidaten)) ? j.kandidaten : [];
    const uit = [], gezien = {};
    lijst.slice(0, 40).forEach(k => {
      if (!k || typeof k !== 'object') return;
      const r = eigenControleer({ code: k.code, naam: k.naam, formule: k.formule, eenheid: k.eenheid, ecu: k.ecu });
      const url = String(k.bron || k.url || '').trim();
      if (!r.ok || !/^https?:\/\/[^\s"<>]+$/.test(url)) return;
      const s = r.code + '@' + r.ecu;
      if (gezien[s]) return;
      gezien[s] = 1;
      uit.push({ code: r.code, ecu: r.ecu, naam: r.def.name, formule: r.def.formule.replace(/\s+/g, '').toUpperCase(), eenheid: r.def.unit, url: url.slice(0, 300) });
    });
    return uit.slice(0, 20);
  }

  const ZOEK_SYS = 'Je zoekt voor één auto naar diagnosecodes om sensoren te LEZEN die niet in de standaard-OBD (mode 01) zitten: ' +
    'UDS/KWP-leesdiensten mode 22 (22 + 4 hex, bijv. 221E1C) of mode 21 (21 + 2 hex). Zoek op internet: forums, lijsten voor Torque of Car Scanner, ' +
    'GitHub-repositories met PID-lijsten, documentatie. Antwoord UITSLUITEND met één JSON-object, zonder uitleg eromheen: ' +
    '{"kandidaten":[{"code":"221E1C","ecu":"7E1","naam":"Temperatuur automaat","formule":"A-40","eenheid":"°C","bron":"https://…"}]}. ' +
    'Regels: alleen codes die je in een bron hebt gezien, met de URL van die bron — verzin niets en vul niets aan uit je geheugen. ' +
    'Alleen leesdiensten 21 en 22; nooit 2E, 2F, 31, 04, 10, 11, 14 of iets anders dat schrijft, wist of aanstuurt. ' +
    'ecu = het fysieke CAN-adres als de bron het noemt (7E0 motor, 7E1 automaat, of 18DAxxF1), anders "". ' +
    'formule in bytes A, B, C … met alleen getallen, + - * / en haakjes (Torque-notatie zonder functies); past de formule daar niet in, laat de code dan weg. ' +
    'Naam in het Nederlands, hoogstens 40 tekens. Hoogstens 15 kandidaten. Niets gevonden: {"kandidaten":[]}.';

  /* Online zoeken voor een voertuig {merk, model, bouwjaar, motor}. Via de
     gewone AI-route (apiFetch: tegoed, kostenvoorvertoning), met de
     zoektool van de API. Weigert de API die tool, dan zegt de uitkomst dat
     er niet online gezocht is — dan komt er niets in de bibliotheek, want
     een code uit het geheugen van een taalmodel is geen bron. */
  async function zoekOnline(v) {
    v = v || {};
    if (!v.merk || !v.model) return { ok: false, fout: 'Vul eerst merk en model in bij het profiel' };
    if (typeof apiFetch !== 'function') return { ok: false, fout: 'De AI-route ontbreekt' };
    const auto = [v.merk, v.model, v.bouwjaar, v.motor, v.brandstof].filter(Boolean).join(' ');
    const vraag = 'Auto: ' + auto + '. Zoek leescodes (mode 21/22) voor sensoren die voor een eigenaar nuttig zijn: temperatuur van de automaat, ' +
      'olietemperatuur en -druk, roetfilter (beladen, regeneratie), AdBlue, accu-toestand, bandenspanning, laaddruk, kilometerstand van het instrumentenpaneel.';
    let tekst;
    try {
      tekst = await apiFetch(vraag, 3000, ZOEK_SYS, 'claude-sonnet-5', null, { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] });
    } catch (x) {
      if (x && x.plAfgebroken) return { ok: false, fout: 'Afgebroken' };
      if (/web_search|tool/i.test(String(x && x.message || x))) return { ok: false, fout: 'Online zoeken is op dit account niet beschikbaar (de zoektool van de AI staat uit)' };
      return { ok: false, fout: String(x && x.message || x) };
    }
    return { ok: true, kandidaten: kandidatenUitTekst(tekst) };
  }

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
    const aan = defs.filter(d => actief.indexOf(d.pid) >= 0);
    if (!aan.length) return { staat: 'LET OP', detail: defs.length + ' eigen sensor(en) bij dit voertuig, maar geen enkele aangezet' };
    const ok = [], stil = [];
    aan.forEach(d => {
      const t = (m.laatst || {})[d.pid];
      if (typeof t === 'number' && nu - t < 30000) ok.push(d.name + ' = ' + String((m.waarden || {})[d.pid]).replace('.', ',') + (d.unit ? ' ' + d.unit : ''));
      else stil.push(d.name + ' (' + d.pid + ')');
    });
    if (stil.length) return { staat: 'LET OP', detail: 'geen antwoord in de laatste 30 s van: ' + stil.join(', ') + (ok.length ? ' — wel van: ' + ok.join(', ') : '') + '. Klopt de code voor deze auto? Test hem in Mijn voertuigen → Sensoren.' };
    return { staat: 'ok', detail: ok.length + ' eigen sensor(en) geven antwoord: ' + ok.join(', ') };
  }

  window.PLEigen = { CODE: EIGEN_CODE, MAX: EIGEN_MAX, formule, controleer: eigenControleer, zet: eigenZet, defs: eigenDefs, is: isEigen, test: eigenTest, oordeel: eigenOordeel,
    ECU: EIGEN_ECU, TEMPO: EIGEN_TEMPO, interval: eigenInterval, vraag: eigenVraag, kandidatenUitTekst, zoekOnline };
  window.plEigenDefs = eigenDefs;

  btDiagSafe('pidlane-uitgebreid.js geladen — mode 21/22 pad actief');

  function btDiagSafe(m) {
    try { if (typeof btDiag === 'function') btDiag(m, 'info'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
  }
})();
