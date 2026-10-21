// ══════════════════════════════════════════════════════════════════
// pidlane-aankooprapport.js — PLAankoop: het aankooprapport voor
// occasionkopers (21-10-2026)
// ══════════════════════════════════════════════════════════════════
// Eén rapport dat een koper vóór of naast een fysieke aankoopkeuring kan
// laten maken: kenteken, RDW, terugroepacties, foutcodes (actief, pending,
// permanent), gereedheidstests, monitortests (mode 06), software-ID
// (CALID/CVN) en de kilometertellers. Met datum, tijd en — als de koper dat
// wil — de plaats van de bezichtiging, zodat het rapport bij één
// bezichtiging hoort. Die plaats typt de koper zelf: de app leest geen
// locatie (test-geen-gps.js, de Data safety-verklaring van de Play Store).
//
// WIE WAT LEVERT. Hetzelfde principe als PLRapport: elk stoplicht komt uit
// een regel in signalen() hieronder, niet uit de AI. De AI schrijft alleen
// de samenvatting in gewone taal (instructie()), en mag de kleur niet
// veranderen. Valt de AI weg, dan is het rapport er gewoon, zonder die
// alinea, en zegt het rapport dat erbij.
//
// ONVOLLEDIG IS GEEN GROEN. invoerCheck() zegt per onderdeel of het er is,
// deels is of ontbreekt, en wat dat voor het oordeel betekent. Ontbreekt een
// verplicht onderdeel, dan is het eindoordeel grijs ("geen eindoordeel") —
// een schone foutenlijst die nooit gelezen is, is geen schone foutenlijst.
//
// DE STERKSTE VLAG: vers gewiste foutcodes. 0131 (km sinds wissen) en 0130
// (warm-ups sinds wissen) laag, plus gereedheidstests die nog niet klaar
// zijn: dat is het beeld van een auto die vlak voor de bezichtiging is
// "schoongemaakt". Een permanente code (mode 0A) overleeft dat wissen.
//
// PRIVACY. Het VIN gaat nooit ruw de telefoon uit (CLAUDE.md, §7); dit
// rapport wordt juist gedeeld, dus het VIN staat er niet in — alleen of de
// stuurapparaten het onderling eens zijn.
//
// Puur en getoetst: invoerCheck, signalen, oordeel, vragen, model,
// instructie, metAI (test-aankooprapport.js). verzamel() en maak() lezen de
// app en de adapter; de PDF tekent PLRapport.pdf().
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const CFG = {
    versWisKm: 100,          // km sinds wissen waaronder het "vers gewist" is
    versWisWarmups: 10,      // warm-ups sinds wissen idem
    tellerMax: 65535,        // 0131/0121 lopen vast op twee bytes
    apkKrapDagen: 60,
    kmTolMin: 1000,          // dashboard vs. motorcomputer: minstens deze marge
    kmTolPct: 0.03,          // of 3% van de stand, wat groter is
    plaatsMax: 80
  };
  // Monitoren waarvan "niet gereed" bij veel auto's gewoon is: de EVAP-test
  // draait alleen onder smalle omstandigheden (tankvulling, buitentemperatuur).
  const MONITOR_MILD = ['EVAP', 'Secundaire lucht', 'Airco'];
  const RANG = { rood: 3, oranje: 2, groen: 1, grijs: 0 };
  const KOP = {
    rood: 'Rode vlag — niet kopen zonder uitleg en keuring',
    oranje: 'Let op — vraag eerst door bij de verkoper',
    groen: 'Geen rode vlaggen in de uitgelezen gegevens',
    grijs: 'Geen eindoordeel — de meting is niet compleet'
  };
  const STANDAARDVRAGEN = [
    'Mag ik de onderhoudshistorie zien (boekje of facturen), met de kilometerstand bij elke beurt?',
    'Is de auto schadevrij, en zijn er reparaties aan carrosserie of lak gedaan?',
    'Mag een onafhankelijke garage de auto keuren voordat ik koop?'
  ];
  const PROMO = 'PidLane leest je auto uit via de OBD-aansluiting en legt in gewone taal uit wat de sensoren zeggen. ' +
    'Meer op pidlane.nl.';

  const getal = v => typeof v === 'number' && isFinite(v);
  const tekst = v => (v === null || v === undefined) ? '' : String(v).trim();
  const ja = v => v === true || /^ja$/i.test(tekst(v));
  const nee = v => v === false || /^nee$/i.test(tekst(v));
  const lijst = v => Array.isArray(v) ? v.filter(Boolean).map(String) : [];
  const nl = n => getal(n) ? Math.round(n).toLocaleString('nl-NL') : '–';
  const meervoud = (n, een, veel) => n + ' ' + (n === 1 ? een : veel);

  function rdwDatum(s) {
    const d = tekst(s).replace(/\D/g, '');
    if (d.length < 8) return null;
    const t = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
    return isFinite(t) ? t : null;
  }
  function datumNl(t) {
    const d = new Date(t);
    return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
  }
  function tijdNl(t) {
    const d = new Date(t);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ── WAT ER BINNENKOMT ──────────────────────────────────────────────
  /* Alles wat het rapport leest, in één vorm. verzamel() vult het uit de
     app; de test vult het met de hand. Wat er niet is blijft null — nooit
     een lege lijst, want een lege lijst betekent "gelezen en niets
     gevonden". */
  function normaliseer(inv) {
    const i = inv || {};
    const obd = i.obd || {};
    const dtc = obd.dtc || null;
    return {
      kenteken: tekst(i.kenteken).replace(/[\s-]/g, '').toUpperCase(),
      ts: getal(i.ts) ? i.ts : null,
      plaats: tekst(i.plaats).replace(/\s+/g, ' ').slice(0, CFG.plaatsMax) || null,
      rdw: i.rdw && typeof i.rdw === 'object' ? i.rdw : null,
      recall: i.recall && typeof i.recall === 'object' ? i.recall : null,
      opgegevenKm: getal(i.opgegevenKm) && i.opgegevenKm > 0 ? i.opgegevenKm : null,
      km: i.km && typeof i.km === 'object' ? i.km : null,       // PLKm.oordeel()
      obd: {
        verbonden: !!obd.verbonden,
        dtc: dtc ? {
          actief: Array.isArray(dtc.actief) ? lijst(dtc.actief) : null,
          pending: Array.isArray(dtc.pending) ? lijst(dtc.pending) : null,
          permanent: Array.isArray(dtc.permanent) ? lijst(dtc.permanent) : null
        } : { actief: null, pending: null, permanent: null },
        readiness: obd.readiness && Array.isArray(obd.readiness.monitors) ? obd.readiness : null,
        mode06: obd.mode06 && obd.mode06.niveau ? obd.mode06 : null,     // PLM06.samenvat()
        calid: tekst(obd.calid) || null,
        cvn: lijst(obd.cvn).length ? lijst(obd.cvn) : null,
        kmSindsWissen: getal(obd.kmSindsWissen) ? obd.kmSindsWissen : null,
        warmupsSindsWissen: getal(obd.warmupsSindsWissen) ? obd.warmupsSindsWissen : null,
        kmMetMil: getal(obd.kmMetMil) ? obd.kmMetMil : null,
        odoKm: getal(obd.odoKm) && obd.odoKm > 0 ? obd.odoKm : null
      },
      ai: tekst(i.ai) || null
    };
  }

  // ── IS DE INVOER COMPLEET? ─────────────────────────────────────────
  /* Per onderdeel: staat 'ok' | 'deels' | 'mist', de reden en wat het voor
     het oordeel betekent. `verplicht` zonder 'ok' = geen eindoordeel. */
  function invoerCheck(inv) {
    const v = normaliseer(inv);
    const o = v.obd, rijen = [];
    const rij = (sleutel, naam, verplicht, staat, reden, gevolg) =>
      rijen.push({ sleutel, naam, verplicht, staat, reden, gevolg: staat === 'ok' ? '' : gevolg });

    rij('kenteken', 'Kenteken', true, /^[A-Z0-9]{6}$/.test(v.kenteken) ? 'ok' : 'mist',
      v.kenteken ? 'kenteken "' + v.kenteken + '" heeft niet de vorm van een Nederlands kenteken' : 'geen kenteken ingevoerd',
      'zonder kenteken hoort het rapport bij geen enkele auto');
    rij('rdw', 'RDW-gegevens', true, v.rdw ? 'ok' : 'mist', 'niet opgezocht bij het RDW',
      'APK, tellerstandoordeel (NAP), export en verzekering zijn niet gecontroleerd');
    rij('recall', 'Terugroepacties', false,
      v.recall ? 'ok' : (v.rdw && v.rdw.openstaande_terugroepactie_indicator != null ? 'deels' : 'mist'),
      v.rdw ? 'alleen de RDW-indicator, niet welke actie het is' : 'niet opgezocht',
      'niet bekend of er een openstaande terugroepactie is, of welke');
    rij('obd', 'Adapter verbonden', true, o.verbonden ? 'ok' : 'mist', 'er was geen verbinding met de auto',
      'foutcodes, gereedheid en tellers in de stuurapparaten zijn niet gelezen');
    const d = o.dtc, gelezen = ['actief', 'pending', 'permanent'].filter(k => d[k] !== null);
    rij('dtc', 'Foutcodes (actief, pending, permanent)', true,
      d.actief === null ? 'mist' : (gelezen.length === 3 ? 'ok' : 'deels'),
      d.actief === null ? 'actieve foutcodes niet gelezen'
        : 'niet gelezen: ' + ['actief', 'pending', 'permanent'].filter(k => d[k] === null).join(', ') + ' (oudere auto\'s ondersteunen dit niet altijd)',
      d.actief === null ? 'geen oordeel over storingen mogelijk' : 'codes die nog niet bevestigd of al gewist zijn kunnen ontbreken');
    rij('readiness', 'Gereedheidstests (readiness)', true, o.readiness ? 'ok' : 'mist', 'niet gelezen',
      'niet te zien of de zelftests van de auto na een wisbeurt al opnieuw gedraaid hebben');
    const wisBekend = [o.kmSindsWissen, o.warmupsSindsWissen].filter(x => x !== null).length;
    rij('wissen', 'Sinds wissen (km en warm-ups)', false, wisBekend === 2 ? 'ok' : (wisBekend ? 'deels' : 'mist'),
      wisBekend ? 'één van de twee tellers gaf geen antwoord' : 'deze auto gaf geen afstand of warm-ups sinds wissen',
      'vers gewiste foutcodes zijn minder zeker te herkennen');
    rij('mode06', 'Monitortests (mode 06)', false, o.mode06 && o.mode06.niveau !== 'onbekend' ? 'ok' : 'mist',
      o.mode06 ? 'de auto gaf geen monitortests' : 'niet gelezen',
      'geen zicht op onderdelen die nét binnen de grens zitten (katalysator, lambdasonde, misfire)');
    rij('software', 'Software-ID (CALID/CVN)', false, o.calid && o.cvn ? 'ok' : (o.calid || o.cvn ? 'deels' : 'mist'),
      'niet (volledig) gegeven door de motorcomputer', 'geen vingerafdruk van de motorsoftware in het rapport');
    const kmBronnen = [v.opgegevenKm, o.odoKm, v.km && getal(v.km.km) ? v.km.km : null].filter(x => x !== null).length;
    rij('teller', 'Kilometerstand', false, v.opgegevenKm && kmBronnen >= 2 ? 'ok' : (kmBronnen ? 'deels' : 'mist'),
      !v.opgegevenKm ? 'de stand op het dashboard is niet ingevoerd' : 'geen tweede bron uit de stuurapparaten',
      'de tellerstand is niet onafhankelijk nagerekend');
    rij('tijd', 'Datum en tijd', true, v.ts ? 'ok' : 'mist', 'geen tijdstip', 'het rapport hoort niet aantoonbaar bij één bezichtiging');
    rij('plaats', 'Plaats van de bezichtiging', false, v.plaats ? 'ok' : 'mist', 'niet ingevuld',
      'niet te zien waar de meting gedaan is');

    const missend = rijen.filter(r => r.verplicht && r.staat !== 'ok');
    return { rijen, kanOordelen: !missend.length, missend: missend.map(r => r.naam) };
  }

  // ── DE SIGNALEN ────────────────────────────────────────────────────
  /* Elk signaal: { id, onderwerp, kleur, kop, uitleg, vraag }. Grijs = niet
     te beoordelen; telt niet mee in het eindoordeel, staat wel in het
     rapport. De volgorde is de volgorde in het rapport. */
  function signalen(inv) {
    const v = normaliseer(inv);
    const o = v.obd, d = o.dtc, rd = o.readiness, uit = [];
    const s = (id, onderwerp, kleur, kop, uitleg, vraag) => uit.push({ id, onderwerp, kleur, kop, uitleg: uitleg || '', vraag: vraag || null });
    const nietGereed = rd ? lijst(rd.nietGereed) : [];
    const ernstigNietGereed = nietGereed.filter(m => MONITOR_MILD.indexOf(m) < 0);

    // 1. Vers gewist — het sterkste signaal, dus bovenaan.
    const kmW = o.kmSindsWissen, wuW = o.warmupsSindsWissen;
    const versKm = kmW !== null && kmW < CFG.versWisKm;
    const versWu = wuW !== null && wuW < CFG.versWisWarmups;
    const vers = versKm || versWu;
    if (kmW === null && wuW === null) {
      s('wissen', 'Foutcodes gewist?', 'grijs', 'Niet te zien wanneer de foutcodes voor het laatst gewist zijn',
        'Deze auto geeft de tellers "afstand sinds wissen" en "warm-ups sinds wissen" niet door.');
    } else if (vers) {
      const wat = [kmW !== null ? nl(kmW) + ' km' : null, wuW !== null ? meervoud(wuW, 'keer warmgedraaid', 'keer warmgedraaid') : null].filter(Boolean).join(' en ');
      s('wissen', 'Foutcodes gewist?', 'rood', 'Foutcodes zijn kort geleden gewist',
        'Sinds het wissen is ' + wat + '. Foutcodes die vlak voor een bezichtiging verdwijnen, komen vaak na een paar honderd kilometer terug.' +
        (nietGereed.length ? ' Ook ' + meervoud(nietGereed.length, 'zelftest is', 'zelftests zijn') + ' nog niet afgerond (' + nietGereed.join(', ') + '), wat bij een vers gewiste auto past.' : ''),
        'Wanneer en waarom zijn de foutcodes gewist? Welke reparatie is daarbij gedaan, en is daar een factuur van?');
    } else {
      const lang = kmW !== null && kmW >= CFG.tellerMax;
      s('wissen', 'Foutcodes gewist?', 'groen', lang ? 'Foutcodes zijn al heel lang niet gewist' : 'Geen aanwijzing voor recent wissen',
        lang ? 'De teller "afstand sinds wissen" staat op zijn maximum.'
          : 'Sinds het laatste wissen: ' + [kmW !== null ? nl(kmW) + ' km' : null, wuW !== null ? wuW + ' keer warmgedraaid' : null].filter(Boolean).join(', ') + '.');
    }

    // 2. Storingslampje
    if (rd && rd.mil) {
      s('mil', 'Storingslampje', 'rood', 'Het motorstoringslampje staat aan',
        'De motorcomputer meldt zelf een storing die de uitstoot of de motor raakt.', 'Waarom brandt het motorstoringslampje, en wat is eraan gedaan?');
    } else if (o.kmMetMil !== null && o.kmMetMil > 0 && o.kmMetMil < CFG.tellerMax) {
      s('mil', 'Storingslampje', 'oranje', 'Er is ' + nl(o.kmMetMil) + ' km gereden met het storingslampje aan',
        'Het lampje is nu uit, maar heeft eerder gebrand terwijl er gereden werd.', 'Waarom heeft het motorstoringslampje gebrand, en is de oorzaak verholpen?');
    } else if (rd) {
      s('mil', 'Storingslampje', 'groen', 'Het motorstoringslampje staat uit', '');
    }

    // 3. Foutcodes
    if (d.actief === null) {
      s('actief', 'Actieve foutcodes', 'grijs', 'Niet gelezen', 'Er is geen foutcode-uitlezing gedaan.');
    } else if (d.actief.length) {
      s('actief', 'Actieve foutcodes', 'rood', meervoud(d.actief.length, 'actieve foutcode', 'actieve foutcodes') + ': ' + d.actief.join(', '),
        'Een actieve foutcode is een storing die de auto nu bevestigd heeft.', 'Wat is de oorzaak van ' + d.actief.join(', ') + ', en wat kost het om dit te verhelpen?');
    } else {
      s('actief', 'Actieve foutcodes', 'groen', 'Geen actieve foutcodes', vers ? 'Let op: kort geleden gewist, zie hierboven.' : '');
    }
    if (d.pending !== null) {
      if (d.pending.length) s('pending', 'Wachtende foutcodes', 'oranje', meervoud(d.pending.length, 'wachtende code', 'wachtende codes') + ': ' + d.pending.join(', '),
        'De auto heeft een fout één keer gezien maar nog niet bevestigd. Vaak de eerste aanwijzing van een probleem dat terugkomt.',
        'Is er bekend dat ' + d.pending.join(', ') + ' eerder is opgetreden?');
      else s('pending', 'Wachtende foutcodes', 'groen', 'Geen wachtende foutcodes', '');
    }
    if (d.permanent !== null) {
      if (d.permanent.length) s('permanent', 'Permanente foutcodes', vers ? 'rood' : 'oranje',
        meervoud(d.permanent.length, 'permanente code', 'permanente codes') + ': ' + d.permanent.join(', '),
        'Een permanente code kan niet gewist worden: hij blijft staan tot de auto zelf heeft vastgesteld dat de storing weg is.' +
          (vers ? ' In combinatie met het recente wissen: de storing is waarschijnlijk niet opgelost, alleen de melding is weg.' : ''),
        'Welke storing hoort bij ' + d.permanent.join(', ') + ', en is die gerepareerd?');
      else s('permanent', 'Permanente foutcodes', 'groen', 'Geen permanente foutcodes', '');
    }

    // 4. Gereedheidstests
    if (!rd) {
      s('readiness', 'Zelftests (readiness)', 'grijs', 'Niet gelezen', '');
    } else if (!nietGereed.length) {
      s('readiness', 'Zelftests (readiness)', 'groen', 'Alle ' + rd.monitors.length + ' zelftests zijn afgerond', '');
    } else if (vers) {
      s('readiness', 'Zelftests (readiness)', 'oranje', meervoud(nietGereed.length, 'zelftest', 'zelftests') + ' nog niet afgerond: ' + nietGereed.join(', '),
        'Na het wissen van foutcodes moeten de zelftests opnieuw draaien; dat kost meestal een paar ritten.');
    } else if (ernstigNietGereed.length) {
      s('readiness', 'Zelftests (readiness)', 'oranje', meervoud(nietGereed.length, 'zelftest', 'zelftests') + ' nog niet afgerond: ' + nietGereed.join(', '),
        'Dit gebeurt na het wissen van foutcodes of het loskoppelen van de accu.', 'Is de accu kort geleden losgekoppeld of vervangen, of zijn er foutcodes gewist?');
    } else {
      s('readiness', 'Zelftests (readiness)', 'groen', nietGereed.join(', ') + ' nog niet afgerond — bij veel auto\'s normaal',
        'Deze test draait alleen onder smalle omstandigheden (bijvoorbeeld tankvulling en buitentemperatuur).');
    }

    // 5. Monitortests
    const m6 = o.mode06;
    if (!m6 || m6.niveau === 'onbekend') {
      s('mode06', 'Monitortests (mode 06)', 'grijs', m6 ? 'De auto gaf geen monitortests' : 'Niet gelezen', '');
    } else if (m6.niveau === 'kritiek') {
      s('mode06', 'Monitortests (mode 06)', 'rood', tekst(m6.tekst) || 'Test buiten de fabrieksgrens',
        'Een onderdeel haalt de eigen test van de fabrikant niet, ook als er (nog) geen foutcode is.', 'Is bekend dat er iets mis is met de katalysator, lambdasonde of ontsteking?');
    } else if (m6.niveau === 'let-op') {
      s('mode06', 'Monitortests (mode 06)', 'oranje', tekst(m6.tekst) || 'Test krap binnen de grens',
        'Nog geen storing, maar een onderdeel zit dicht bij de grens van de fabrikant.');
    } else {
      s('mode06', 'Monitortests (mode 06)', 'groen', tekst(m6.tekst) || 'Alle monitortests binnen de grenzen', '');
    }

    // 6. Kilometerstand
    const km = v.km, rdw = v.rdw || {};
    const teller = tekst(rdw.tellerstandoordeel);
    if (/onlogisch/i.test(teller)) {
      s('nap', 'Tellerstand (NAP)', 'rood', 'Het RDW beoordeelt de tellerstand als onlogisch',
        'Een eerder geregistreerde stand was hoger dan een latere: de teller kan zijn teruggedraaid of vervangen.',
        'Waarom is de tellerstand volgens het RDW onlogisch? Is er een tellerwissel met bewijs?');
    } else if (/^logisch$/i.test(teller)) {
      s('nap', 'Tellerstand (NAP)', 'groen', 'Het RDW beoordeelt de tellerstand als logisch', '');
    } else if (v.rdw) {
      s('nap', 'Tellerstand (NAP)', 'grijs', teller ? 'RDW: ' + teller : 'Geen tellerstandoordeel bij het RDW', '');
    }
    const motorKm = km && getal(km.km) ? km.km : o.odoKm;
    if (km && km.niveau === 'kritiek') {
      s('teller', 'Kilometerstand', 'rood', tekst(km.tekst) || 'De kilometerstand is niet betrouwbaar',
        'De stuurapparaten van de auto spreken elkaar tegen.', 'Is de kilometerteller of een stuurapparaat ooit vervangen? Is daar een bewijs van?');
    } else if (v.opgegevenKm && getal(motorKm) && Math.abs(v.opgegevenKm - motorKm) > Math.max(CFG.kmTolMin, motorKm * CFG.kmTolPct)) {
      s('teller', 'Kilometerstand', 'rood', 'Dashboard ' + nl(v.opgegevenKm) + ' km, stuurapparaat ' + nl(motorKm) + ' km',
        'De stand op het dashboard wijkt meer dan ' + nl(Math.max(CFG.kmTolMin, motorKm * CFG.kmTolPct)) + ' km af van wat de elektronica bijhoudt.',
        'Waarom verschilt de kilometerstand op het dashboard van die in de elektronica?');
    } else if (km && km.niveau === 'let-op') {
      s('teller', 'Kilometerstand', 'oranje', tekst(km.tekst) || 'Aandachtspunt bij de kilometerstand', '');
    } else if (km && km.niveau === 'ok') {
      s('teller', 'Kilometerstand', 'groen', tekst(km.tekst) || 'Bevestigd door meerdere stuurapparaten', '');
    } else if (v.opgegevenKm && getal(motorKm)) {
      s('teller', 'Kilometerstand', 'groen', 'Dashboard en stuurapparaat komen overeen (' + nl(motorKm) + ' km)', '');
    } else {
      s('teller', 'Kilometerstand', 'grijs', 'Niet nagerekend',
        v.opgegevenKm ? 'Deze auto gaf geen kilometerstand uit de elektronica.' : 'De stand op het dashboard is niet ingevoerd.');
    }

    // 7. RDW-papieren
    if (v.rdw) {
      const apk = rdwDatum(rdw.vervaldatum_apk || rdw.vervaldatum_apk_dt);
      if (ja(rdw.wacht_op_keuren)) s('keuren', 'Wacht op keuren', 'rood', 'De auto staat bij het RDW op "wacht op keuren"',
        'Hij mag de weg niet op tot hij opnieuw gekeurd is.', 'Waarom moet de auto opnieuw gekeurd worden?');
      if (apk !== null && v.ts) {
        const dagen = Math.floor((apk - v.ts) / 86400000);
        if (dagen < 0) s('apk', 'APK', 'rood', 'APK is verlopen sinds ' + datumNl(apk), 'Zonder geldige APK mag de auto de weg niet op — ook niet voor een proefrit.',
          'Wordt de auto met nieuwe APK geleverd, en wie betaalt de reparaties die daarvoor nodig zijn?');
        else if (dagen < CFG.apkKrapDagen) s('apk', 'APK', 'oranje', 'APK verloopt over ' + meervoud(dagen, 'dag', 'dagen') + ' (' + datumNl(apk) + ')', '',
          'Wordt de auto met nieuwe APK geleverd?');
        else s('apk', 'APK', 'groen', 'APK geldig tot ' + datumNl(apk), '');
      }
      if (ja(rdw.export_indicator)) s('export', 'Export', 'rood', 'De auto is bij het RDW gemeld voor export',
        'Een auto die voor export is gemeld, kun je in Nederland niet zomaar op je naam zetten.', 'Waarom staat de auto gemeld voor export?');
      if (nee(rdw.tenaamstellen_mogelijk)) s('tenaam', 'Op naam zetten', 'rood', 'Tenaamstellen is volgens het RDW nu niet mogelijk',
        'De auto kan op dit moment niet op jouw naam gezet worden.', 'Waarom kan de auto nu niet op naam gezet worden?');
      if (nee(rdw.wam_verzekerd)) s('wam', 'Verzekering', 'oranje', 'Volgens het RDW is de auto nu niet verzekerd',
        'Maak geen proefrit op de openbare weg zonder verzekering.', 'Is de auto verzekerd voor een proefrit?');
    }

    // 8. Terugroepacties
    const rc = v.recall;
    if (rc && rc.niveau === 'kritiek') {
      s('recall', 'Terugroepacties', 'oranje', tekst(rc.tekst) || 'Er staat een terugroepactie open',
        'De fabrikant heeft een reparatie aangekondigd die op deze auto nog niet is uitgevoerd. Die is gratis bij de dealer.',
        'Is de openstaande terugroepactie al uitgevoerd? Is daar een bewijs van de dealer?');
    } else if (rc && rc.niveau === 'let-op') {
      s('recall', 'Terugroepacties', 'oranje', tekst(rc.tekst) || 'Terugroepactie: status onduidelijk', '', 'Zijn alle terugroepacties voor deze auto uitgevoerd?');
    } else if (rc) {
      s('recall', 'Terugroepacties', 'groen', tekst(rc.tekst) || 'Geen openstaande terugroepacties', '');
    } else if (v.rdw && ja(v.rdw.openstaande_terugroepactie_indicator)) {
      s('recall', 'Terugroepacties', 'oranje', 'Er staat een terugroepactie open (RDW)', 'Welke actie het is, is niet opgehaald.',
        'Is de openstaande terugroepactie al uitgevoerd? Is daar een bewijs van de dealer?');
    } else if (v.rdw && nee(v.rdw.openstaande_terugroepactie_indicator)) {
      s('recall', 'Terugroepacties', 'groen', 'Geen openstaande terugroepacties (RDW)', '');
    }

    // 9. Software-ID — weegt niet: zonder fabrieksreferentie is het een vingerafdruk.
    if (o.calid || o.cvn) {
      s('software', 'Software-ID', 'grijs', 'Software-ID gelezen' + (o.calid ? ' (CALID ' + o.calid + ')' : ''),
        'Zonder referentie van de fabrikant zegt dit niet of de software is aangepast. Bewaar het als vingerafdruk: een latere uitlezing hoort hetzelfde te geven.');
    }
    // 10. VIN in de stuurapparaten — het VIN zelf staat nooit in het rapport.
    const vin = km && km.vin;
    if (vin && vin.niveau === 'kritiek') {
      s('vin', 'Chassisnummer', 'rood', 'De stuurapparaten melden niet allemaal hetzelfde chassisnummer',
        'Een stuurapparaat kan uit een andere auto komen.', 'Zijn er stuurapparaten vervangen, en waarom?');
    }
    return uit;
  }

  /* Een rode vlag is een rode vlag, ook als niet alles gelezen is. Groen of
     oranje geeft de app alleen op een complete meting. */
  function oordeel(sig, check) {
    if ((sig || []).some(x => x.kleur === 'rood')) return 'rood';
    if (check && !check.kanOordelen) return 'grijs';
    let k = 'grijs';
    (sig || []).forEach(x => { if (x.kleur !== 'grijs' && RANG[x.kleur] > RANG[k]) k = x.kleur; });
    return k;
  }

  /* De vragen voor de verkoper: rood eerst, dan oranje, dan de vaste drie. */
  function vragen(sig) {
    const uit = [];
    ['rood', 'oranje'].forEach(k => (sig || []).forEach(x => {
      if (x.kleur === k && x.vraag && uit.indexOf(x.vraag) < 0) uit.push(x.vraag);
    }));
    STANDAARDVRAGEN.forEach(q => uit.push(q));
    return uit;
  }

  // ── DISCLAIMER ─────────────────────────────────────────────────────
  const WEL = ['foutcodes in de motorcomputer (actief, wachtend, permanent)', 'de zelftests van de auto (readiness) en de monitortests (mode 06)',
    'wanneer foutcodes voor het laatst gewist zijn', 'de kilometerstand in de stuurapparaten die hem doorgeven',
    'de registratie bij het RDW en openstaande terugroepacties'];
  const NIET = ['carrosserie, roest, lak en schadeherstel', 'banden, remmen, ophanging en stuurinrichting', 'lekkages, olie, koelvloeistof en distributieriem',
    'geluiden en rijgedrag van motor en versnellingsbak', 'interieur, airco, elektrische accessoires en de accu onder belasting',
    'onderhoudshistorie, eigendom, financiering of diefstal', 'systemen die hun gegevens niet via de diagnose-aansluiting delen'];
  function disclaimer(heeftAI) {
    return [
      'Dit rapport is een momentopname: het laat zien wat de elektronica van deze auto op het moment van uitlezen meldde, aangevuld met openbare gegevens van het RDW. ' +
      'Het is geen aankoopkeuring en vervangt die niet.',
      'Een groen oordeel betekent dat er in de uitgelezen gegevens geen rode vlag is gevonden. Het is geen garantie dat de auto zonder gebreken is.',
      'De kilometercheck is een aanwijzing, geen juridisch bewijs. Het officiële tellerstandoordeel (NAP) komt van het RDW.',
      'Monitortests en software-ID worden niet vergeleken met gegevens van de fabrikant. Niet elke auto geeft alle gegevens door; wat ontbreekt staat in het hoofdstuk "Volledigheid".',
      heeftAI ? 'De samenvatting in gewone taal is geschreven door AI op basis van de gegevens in dit rapport en kan fouten bevatten. De kleuren, tabellen en meetwaarden maakt de app zelf, niet de AI.' : null,
      'Twijfel je, of gaat het om veel geld? Laat de auto dan altijd ook keuren door een onafhankelijke garage of keuringsinstantie. Zo\'n fysieke aankoopkeuring kost ongeveer € 150 tot € 350 (indicatie, onder meer bij de ANWB).',
      'PidLane is, voor zover de wet dat toestaat, niet aansprakelijk voor een koopbeslissing die op dit rapport is gebaseerd.',
      'Privacy: dit rapport bevat het kenteken en, als die is ingevuld, de plaats van de bezichtiging. Het chassisnummer (VIN) staat er bewust niet in.'
    ].filter(Boolean);
  }

  // ── DE AI ──────────────────────────────────────────────────────────
  /* De AI krijgt de signalen en schrijft er gewone taal bij. Hij krijgt het
     eindoordeel mee en mag het niet veranderen. */
  function instructie(mod) {
    const regels = mod.signalen.filter(x => x.kleur !== 'grijs')
      .map(x => '- [' + x.kleur.toUpperCase() + '] ' + x.onderwerp + ': ' + x.kop + (x.uitleg ? ' — ' + x.uitleg : ''));
    const grijs = mod.signalen.filter(x => x.kleur === 'grijs').map(x => x.onderwerp);
    return 'Je schrijft de samenvatting van een aankooprapport voor iemand die een tweedehands auto overweegt en geen verstand heeft van techniek.\n' +
      'Voertuig: ' + (mod.voertuigNaam || 'onbekend') + '.\n' +
      'Eindoordeel van de app (staat vast, verander het niet): ' + mod.kleur.toUpperCase() + ' — ' + KOP[mod.kleur] + '.\n' +
      'Bevindingen:\n' + (regels.join('\n') || '- geen') + '\n' +
      (grijs.length ? 'Niet te beoordelen: ' + grijs.join(', ') + '.\n' : '') +
      'Schrijf in het Nederlands, taalniveau B1, hoogstens 120 woorden, zonder koppen, opsommingstekens of markdown. ' +
      'Begin met wat dit voor de koper betekent. Noem alleen wat hierboven staat; verzin geen meetwaarden, prijzen of oorzaken. ' +
      'Gebruik geen vakjargon zonder uitleg. Noem het rapport nooit een keuring of een garantie.';
  }
  /* Een antwoord van de AI gaat alleen als platte tekst het rapport in. */
  function schoonAI(t) {
    return tekst(t).replace(/<[^>]*>/g, '').replace(/[*#_`]+/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\n{3,}/g, '\n\n').slice(0, 1500).trim();
  }
  function metAI(mod, t) {
    return model(Object.assign({}, mod.invoer, { ai: schoonAI(t) }));
  }

  // ── HET MODEL VOOR DE PDF ──────────────────────────────────────────
  /* Geeft een model in de vorm van PLRapport.model(), zodat PLRapport.pdf()
     het tekent. */
  function model(inv) {
    const v = normaliseer(inv);
    const check = invoerCheck(inv);
    const sig = signalen(inv);
    const kleur = oordeel(sig, check);
    const rdw = v.rdw || {};
    const merk = tekst(rdw.merk), type = tekst(rdw.handelsbenaming);
    const jaar = tekst(rdw.datum_eerste_toelating).replace(/\D/g, '').slice(0, 4);
    const voertuigNaam = [merk, type].filter(Boolean).join(' ') + (jaar ? ' (' + jaar + ')' : '') || 'Voertuig onbekend';
    const ts = v.ts;
    const nummer = 'PL-' + (v.kenteken || 'ONBEKEND') + '-' + (ts ? new Date(ts).toISOString().slice(0, 16).replace(/\D/g, '') : '0');
    const tel = k => sig.filter(x => x.kleur === k).length;

    let kortTekst;
    if (kleur === 'grijs') kortTekst = 'Niet alles is gelezen, dus de app geeft geen eindoordeel. Ontbreekt: ' + check.missend.join(', ') + '.';
    else kortTekst = [tel('rood') ? meervoud(tel('rood'), 'rode vlag', 'rode vlaggen') : null, tel('oranje') ? meervoud(tel('oranje'), 'aandachtspunt', 'aandachtspunten') : null,
      tel('groen') ? tel('groen') + ' in orde' : null].filter(Boolean).join(', ') + '. ' +
      (kleur === 'rood' ? 'Koop deze auto niet voordat de verkoper de rode vlaggen heeft uitgelegd en een onafhankelijke garage ernaar heeft gekeken.'
        : kleur === 'oranje' ? 'Geen directe reden om af te haken, maar stel de vragen uit hoofdstuk 2 voordat je beslist.'
          : 'De elektronica en de papieren laten niets verontrustends zien. Kijk de auto zelf ook goed na (zie de grenzen in hoofdstuk 6).');
    if (v.ai) kortTekst = v.ai;
    if (kleur === 'rood' && !check.kanOordelen) kortTekst += ' Niet alles is gelezen (ontbreekt: ' + check.missend.join(', ') + '), dus er kan meer zijn.';

    const voorRegels = [
      ['Kenteken', v.kenteken || 'onbekend'], ['Voertuig', voertuigNaam],
      ['Datum', ts ? datumNl(ts) : 'onbekend'], ['Tijd', ts ? tijdNl(ts) : 'onbekend'],
      ['Plaats', v.plaats || 'niet ingevuld'], ['Kilometerstand', v.opgegevenKm ? nl(v.opgegevenKm) + ' km (dashboard)' : 'niet ingevoerd'],
      ['Rapportnummer', nummer]
    ];

    const stoplicht = sig.map(x => ({ naam: x.onderwerp, kleur: x.kleur, tekst: x.kop + (x.uitleg ? '. ' + x.uitleg : '') }));
    const o = v.obd, d = o.dtc;
    const codes = (l) => l === null ? 'niet gelezen' : (l.length ? l.join(', ') : 'geen');
    const secties = [
      { nr: 1, titel: 'Oordeel in één oogopslag', blokken: [
        v.ai ? { soort: 'kader', titel: 'In gewone taal (door AI geschreven)', tekst: v.ai, kleur: 'blauw' } : null,
        { soort: 'stoplicht', items: stoplicht },
        { soort: 'tekst', klein: true, tekst: 'Rood = rode vlag, oranje = vraag ernaar, groen = in orde, grijs = niet te beoordelen (telt niet mee in het oordeel).' }
      ].filter(Boolean) },
      { nr: 2, titel: 'Vraag dit aan de verkoper', blokken: [{ soort: 'lijst', items: vragen(sig) },
        { soort: 'tekst', klein: true, tekst: 'Vraag om bewijs (facturen, werkorders) in plaats van een mondeling antwoord.' }] },
      { nr: 3, titel: 'Foutcodes en zelftests', blokken: [{ soort: 'kv', regels: [
        ['Actief', codes(d.actief)], ['Wachtend', codes(d.pending)], ['Permanent', codes(d.permanent)],
        ['Storingslampje', o.readiness ? (o.readiness.mil ? 'aan' : 'uit') : 'niet gelezen'],
        ['Km met lampje aan', o.kmMetMil !== null ? nl(o.kmMetMil) + ' km' : 'niet gegeven'],
        ['Km sinds wissen', o.kmSindsWissen !== null ? nl(o.kmSindsWissen) + ' km' : 'niet gegeven'],
        ['Warm-ups sinds wissen', o.warmupsSindsWissen !== null ? String(o.warmupsSindsWissen) : 'niet gegeven'],
        ['Zelftests', o.readiness ? (o.readiness.monitors.length - lijst(o.readiness.nietGereed).length) + ' van ' + o.readiness.monitors.length + ' afgerond' : 'niet gelezen'],
        ['Monitortests', o.mode06 ? tekst(o.mode06.tekst) : 'niet gelezen']
      ] }] },
      { nr: 4, titel: 'Kilometerstand', blokken: [{ soort: 'kv', regels: [
        ['Dashboard', v.opgegevenKm ? nl(v.opgegevenKm) + ' km' : 'niet ingevoerd'],
        ['Motorcomputer (01A6)', o.odoKm ? nl(o.odoKm) + ' km' : 'niet gegeven'],
        ['Stuurapparaten', v.km ? tekst(v.km.tekst) || '–' : 'niet nagerekend'],
        ['RDW (NAP)', tekst(rdw.tellerstandoordeel) || (v.rdw ? 'geen oordeel' : 'niet opgezocht')]
      ] }] },
      { nr: 5, titel: 'Voertuiggegevens (RDW)', blokken: v.rdw ? [{ soort: 'kv', regels: [
        ['Merk en type', [merk, type].filter(Boolean).join(' ') || '–'],
        ['Eerste toelating', rdwDatum(rdw.datum_eerste_toelating) !== null ? datumNl(rdwDatum(rdw.datum_eerste_toelating)) : '–'],
        ['In Nederland sinds', rdwDatum(rdw.datum_eerste_tenaamstelling_in_nederland) !== null ? datumNl(rdwDatum(rdw.datum_eerste_tenaamstelling_in_nederland)) : '–'],
        ['Huidige eigenaar sinds', rdwDatum(rdw.datum_tenaamstelling) !== null ? datumNl(rdwDatum(rdw.datum_tenaamstelling)) : '–'],
        ['APK geldig tot', rdwDatum(rdw.vervaldatum_apk) !== null ? datumNl(rdwDatum(rdw.vervaldatum_apk)) : '–'],
        ['Brandstof', tekst(rdw.brandstof_omschrijving) || '–'],
        ['Software-ID', [o.calid ? 'CALID ' + o.calid : null, o.cvn ? 'CVN ' + o.cvn.join(' ') : null].filter(Boolean).join(' · ') || 'niet gegeven']
      ] }] : [{ soort: 'leeg', tekst: 'Niet opgezocht bij het RDW.' }] },
      { nr: 6, titel: 'Volledigheid en grenzen', blokken: [
        { soort: 'tabel', kop: ['Onderdeel', 'Status', 'Wat dat betekent'], breedtes: [0.32, 0.14, 0.54], statusKol: 1,
          rijen: check.rijen.map(r => ({ cellen: [r.naam + (r.verplicht ? ' *' : ''), r.staat === 'ok' ? 'compleet' : r.staat === 'deels' ? 'deels' : 'ontbreekt',
            r.staat === 'ok' ? '' : r.reden + ' — ' + r.gevolg], kleur: r.staat === 'ok' ? 'groen' : r.staat === 'deels' ? 'oranje' : (r.verplicht ? 'rood' : 'grijs') })) },
        { soort: 'tekst', klein: true, tekst: '* nodig voor een eindoordeel.' },
        { soort: 'lijst', titel: 'Wel bekeken', items: WEL },
        { soort: 'lijst', titel: 'Niet bekeken', items: NIET },
        { soort: 'tussenkop', tekst: 'Disclaimer' },
        ...disclaimer(!!v.ai).map(t => ({ soort: 'tekst', tekst: t }))
      ] }
    ];

    return {
      titel: 'Aankooprapport', label: 'AANKOOPRAPPORT', datum: ts ? datumNl(ts) + ' ' + tijdNl(ts) : '', ts, voertuigNaam, kenteken: v.kenteken, nummer,
      kleur, signalen: sig, check, vragen: vragen(sig), ai: v.ai,
      voorblad: { regels: voorRegels, kort: { kleur, kop: KOP[kleur], tekst: kortTekst } },
      secties, bijlagen: [], promo: PROMO, invoer: inv || {}
    };
  }

  // ── UIT DE APP ─────────────────────────────────────────────────────
  /* Leest wat de app al weet en vraagt aan de adapter wat ontbreekt. Elke
     stap die mislukt, laat zijn veld op null — invoerCheck zegt dan wat. */
  async function verzamel(opties) {
    const op = opties || {};
    const melden = typeof op.onStap === 'function' ? op.onStap : function () { };
    const diag = (m, t) => { try { if (typeof btDiag === 'function') btDiag('Aankooprapport: ' + m, t || 'info'); else console.warn('Aankooprapport: ' + m); } catch (e) { console.warn('Aankooprapport: melding niet gelogd', e); } };
    const rdwRij = (typeof _koopRdwData !== 'undefined' && _koopRdwData) ? _koopRdwData : null;
    let recall = null;
    try { const r = window._plRecall; if (r && window.PLRecall) recall = r.samenvatting || PLRecall.samenvat(r); }
    catch (e) { diag('terugroepacties niet leesbaar (' + (e.message || e) + ')', 'warn'); }
    const veld = (typeof document !== 'undefined') ? document.getElementById('koopKmInput') : null;
    const inv = {
      kenteken: rdwRij ? rdwRij._kent || rdwRij.kenteken : '',
      ts: Date.now(), rdw: rdwRij, recall,
      opgegevenKm: veld && veld.value ? parseInt(veld.value, 10) : null,
      obd: { verbonden: (typeof connected !== 'undefined' && connected) && !(typeof demoMode !== 'undefined' && demoMode) }
    };

    if (inv.obd.verbonden && typeof sendCmd === 'function') {
      const lees = async (cmd, ms) => { try { return String(await sendCmd(cmd, ms || 2500) || ''); } catch (e) { diag(cmd + ' gaf een fout (' + (e.message || e) + ')', 'warn'); return ''; } };
      const pid = async (p) => {
        const raw = await lees(p + '1', 2000);
        if (!raw || /NO DATA|UNABLE|ERROR|STOPPED/i.test(raw) || typeof parsePID !== 'function') return null;
        const w = parsePID(p, raw); return getal(w) ? w : null;
      };
      const werk = async () => {
        melden('Foutcodes lezen…');
        try { inv.obd.dtc = { actief: typeof realScanDTC === 'function' ? (await realScanDTC() || []) : null }; }
        catch (e) { diag('actieve foutcodes niet gelezen (' + (e.message || e) + ')', 'warn'); inv.obd.dtc = { actief: null }; }
        if (typeof _svDtc === 'function') {
          // NO DATA is hier dubbelzinnig (niet ondersteund óf niets): dan null,
          // zodat invoerCheck "deels" zegt in plaats van "geen codes".
          const codes = (raw, hdr) => raw && !/NO DATA|ERROR|UNABLE|STOPPED/i.test(raw) && raw.replace(/\s/g, '').toUpperCase().indexOf(hdr) >= 0 ? _svDtc(raw, hdr) : null;
          inv.obd.dtc.pending = codes(await lees('07'), '47');
          inv.obd.dtc.permanent = codes(await lees('0A'), '4A');
        }
        melden('Zelftests en tellers lezen…');
        if (typeof _svReadiness === 'function') inv.obd.readiness = _svReadiness(await lees('01011', 2000));
        inv.obd.kmSindsWissen = await pid('0131');
        inv.obd.warmupsSindsWissen = await pid('0130');
        inv.obd.kmMetMil = await pid('0121');
        inv.obd.odoKm = await pid('01A6');
        melden('Software-ID lezen…');
        if (typeof _svAsciiAfter === 'function') inv.obd.calid = _svAsciiAfter(await lees('0904', 4000), '4904') || null;
        if (typeof _svHexRecs === 'function') { const c = _svHexRecs(await lees('0906', 4000), '4906', 8); inv.obd.cvn = c && c.length ? c : null; }
      };
      try { if (typeof withBus === 'function') await withBus('aankooprapport', werk, 8000); else await werk(); }
      catch (e) { diag('uitlezen afgebroken (' + (e.message || e) + ') — het rapport zegt wat er ontbreekt', 'warn'); }

      // Mode 06 en de km-check pakken de bus zelf; dus ná het blok hierboven.
      if (window.PLM06 && typeof PLM06.scan === 'function') {
        melden('Monitortests lezen…');
        try { const r = await PLM06.scan(); inv.obd.mode06 = r ? (r.samenvatting || PLM06.samenvat(r)) : null; }
        catch (e) { diag('monitortests niet gelezen (' + (e.message || e) + ')', 'warn'); }
      }
      if (window.PLKm && typeof PLKm.check === 'function') {
        melden('Kilometerstand narekenen…');
        try { const r = await PLKm.check({ opgegeven: inv.opgegevenKm }); inv.km = r ? r.oordeel : null; }
        catch (e) { diag('km-check niet gelukt (' + (e.message || e) + ')', 'warn'); }
      }
    }

    inv.plaats = op.plaats || null;
    return inv;
  }

  /* Het hele rapport: verzamelen, AI-samenvatting, PDF. */
  async function maak(JsPDF, opties) {
    const op = opties || {};
    const inv = await verzamel(op);
    let mod = model(inv);
    if (op.ai !== false && typeof apiFetch === 'function' && mod.kleur !== 'grijs') {
      if (op.onStap) op.onStap('Samenvatting schrijven…');
      try { mod = metAI(mod, await apiFetch(instructie(mod), 500, null, null, { vraag: 'Aankooprapport — samenvatting in gewone taal', profiel: 'totaal' })); }
      catch (e) { console.warn('Aankooprapport: AI-samenvatting mislukt, rapport zonder', e); }
    }
    let logo = null;
    try { logo = window.PLRapport && PLRapport.laadLogo ? await PLRapport.laadLogo() : null; }
    catch (e) { console.warn('Aankooprapport: logo niet geladen', e); }
    const doc = JsPDF && window.PLRapport ? PLRapport.pdf(mod, JsPDF, { logo, label: mod.label }) : null;
    return { doc, model: mod };
  }

  // ── HET SCHERM ─────────────────────────────────────────────────────
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  const KLEUR_CSS = { rood: 'var(--rd)', oranje: '#f59e0b', groen: 'var(--gn)', grijs: 'var(--tx3)' };
  function html(mod) {
    const rij = x => '<li style="margin:4px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + KLEUR_CSS[x.kleur] +
      ';margin-right:6px"></span><strong>' + esc(x.onderwerp) + '</strong> — ' + esc(x.kop) + '</li>';
    const mist = mod.check.rijen.filter(r => r.staat !== 'ok');
    return '<div class="pl-aankoop" style="border:1px solid var(--bd);border-left:4px solid ' + KLEUR_CSS[mod.kleur] + ';border-radius:var(--r);padding:10px;margin-top:8px;font-size:12px">' +
      '<div style="font-weight:800;font-size:14px;color:' + KLEUR_CSS[mod.kleur] + '">' + esc(mod.voorblad.kort.kop) + '</div>' +
      '<div style="margin:4px 0 8px;color:var(--tx2)">' + esc(mod.voorblad.kort.tekst) + '</div>' +
      '<ul style="list-style:none;padding:0;margin:0">' + mod.signalen.map(rij).join('') + '</ul>' +
      (mist.length ? '<div style="margin-top:8px;font-weight:700">Niet compleet</div><ul style="margin:2px 0 0 16px;padding:0">' +
        mist.map(r => '<li>' + esc(r.naam) + (r.verplicht ? ' (nodig voor een oordeel)' : '') + ': ' + esc(r.reden) + '</li>').join('') + '</ul>' : '') +
      '<div style="margin-top:8px;font-weight:700">Vraag dit aan de verkoper</div><ol style="margin:2px 0 0 16px;padding:0">' +
      mod.vragen.map(q => '<li>' + esc(q) + '</li>').join('') + '</ol>' +
      '<div style="margin-top:8px;font-size:11px;color:var(--tx3)">Momentopname van de elektronica en de RDW-gegevens — geen aankoopkeuring en geen garantie. De volledige disclaimer staat in de PDF.</div></div>';
  }

  async function draaiUI(knop) {
    const uit = document.getElementById('koopAankoopUit');
    if (!uit) { console.warn('PLAankoop: geen uitvoervak (#koopAankoopUit)'); return; }
    const plaats = document.getElementById('koopAankoopPlaats');
    if (knop) { knop.disabled = true; knop.dataset.plLabel = knop.textContent; }
    const stap = t => { if (knop) knop.textContent = '⏳ ' + t; };
    try {
      const JsPDF = typeof loadJsPDF === 'function' ? await loadJsPDF() : null;
      const r = await maak(JsPDF, { plaats: plaats ? plaats.value : '', onStap: stap });
      uit.innerHTML = html(r.model);
      if (r.doc) {
        const fname = 'PidLane_Aankooprapport_' + (r.model.kenteken || 'onbekend') + '_' + (r.model.ts ? new Date(r.model.ts).toISOString().slice(0, 10) : '') + '.pdf';
        window._lastPdf = { blob: r.doc.output('blob'), fname };
        try { if (typeof registerSessionReport === 'function') registerSessionReport({ type: 'pdf', title: fname, text: r.model.voorblad.kort.tekst, blob: window._lastPdf.blob, fname }); }
        catch (e) { console.warn('Aankooprapport niet in het rapportenarchief gezet', e); }
        if (typeof plBewaarBestand === 'function') await plBewaarBestand(window._lastPdf.blob, fname);
        uit.insertAdjacentHTML('beforeend', '<button class="btn-sec" style="width:100%;margin-top:8px;font-size:12px;font-weight:700" onclick="sharePdf()">↗ Rapport delen</button>');
      } else {
        uit.insertAdjacentHTML('beforeend', '<div style="color:var(--rd);font-size:12px;margin-top:6px">PDF kon niet gemaakt worden (jsPDF niet geladen); het oordeel hierboven blijft geldig.</div>');
      }
    } catch (e) {
      console.warn('Aankooprapport mislukt', e);
      uit.innerHTML = '<div style="color:var(--rd);font-size:12px;padding:6px">Aankooprapport mislukt: ' + esc(e.message || e) + '</div>';
    } finally {
      if (knop) { knop.disabled = false; knop.textContent = knop.dataset.plLabel || '📄 Aankooprapport maken'; }
    }
  }

  window.PLAankoop = { CFG, KOP, STANDAARDVRAGEN, normaliseer, invoerCheck, signalen, oordeel, vragen, disclaimer,
                       instructie, schoonAI, metAI, model, verzamel, maak, html, draaiUI };
})();
