/* pidlane-onderzoek.js — PLOnderzoek: het volledige onderzoek (#428, 07-10-2026)
   ═══════════════════════════════════════════════════════════════════════
   WAAROM DIT BESTAAT
   "Er is iets mis" gaf een lijst modules. Elke module opende zijn eigen
   scherm, mat iets, gaf een rapport — en daar hield het op. De app kon
   ondertussen veel meer dan hij liet zien: foutcodes, trims, laadspanning,
   lambda, koelwater, de softwarekennis van #426. Maar het waren losse
   stukjes, en het verband leggen bleef bij de gebruiker.

   Dit is de onderzoeker die dat verband legt. Hij werkt zoals een monteur:
     1. Verdenkingen opstellen uit de klacht.
     2. De stap kiezen die de meeste verdenkingen tegelijk kan bevestigen
        óf uitsluiten — niet de volgende in een vaste lijst.
     3. Meten, een vraag stellen of een opdracht geven ("houd 2500 tpm vast").
     4. Het bewijs wegen, en daarna opnieuw kiezen.
     5. Een foutcode of meting die ergens anders naar wijst, opent een nieuwe
        verdenking: dat is "een andere richting op".
     6. Is alles bij de klacht uitgesloten, dan verbreedt hij één keer.
     7. Klaar als er één bevestigd is, of als er niets meer te meten valt.

   OPZET — bewijs, geen gok (zelfde regel als PLOnderdeel)
   Elk bewijsstuk draagt de meetwaarde waar het op rust. Te weinig gemeten is
   "onbekend", nooit tegenbewijs. Wat via OBD principieel niet te zien is
   (geluiden, ophanging, lekkage), zegt het onderzoek met zoveel woorden.

   DE KERN IS PUUR
   KLACHTEN, VERDENKINGEN, STAPPEN en nieuw/volgende/verwerk/verbreed/
   conclusie hebben geen bus, geen DOM en geen klok nodig. draai() krijgt de
   uitvoerder mee; de app geeft de echte (bus + scherm), test-onderzoek.js een
   nep. Zo is wat de onderzoeker beslist te toetsen zonder auto.

   Laadt ná pidlane-foutcodes.js (leesStil) en pidlane-data.js
   (softwareOorzaken, merkGroep). Tests: test-onderzoek.js, bproef-onderzoek.js.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = {
    bevestigd: 3,        // score vanaf waar een verdenking bevestigd heet
    uitgesloten: -3,     // en vanaf waar ze uitgesloten is
    maxStappen: 14,
    meetIntervalMs: 350,
    voorwaardeMaxMs: 180000,
    demoFactor: 0.12,    // demo: metingen duren een fractie, zodat je het verloop ziet
    // Wanneer een voorwaarde gehaald is. Op één plek, omdat PLSamenhang
    // (#446) met dezelfde grenzen een meting achteraf in toestanden opknipt.
    grens: { uitRpm: 100, aanRpm: 400, rijKmh: 5, warmC: 70 }
  };

  // ── De verdenkingen ─────────────────────────────────────────────────
  // naam: wat de gebruiker leest. vervolg: wat een monteur dan doet — want
  // "bevestigd via OBD" is een sterke aanwijzing, geen vervangen onderdeel.
  var VERDENKINGEN = {
    valselucht:  { naam: 'Valse lucht (vacuümlek)', systeem: 'lucht',
      vervolg: 'Rookproef of lekzoeken op slangen, inlaatspruitstuk en carterontluchting.' },
    maf:         { naam: 'Luchtmassameter vervuild of defect', systeem: 'lucht',
      vervolg: 'Luchtmassameter reinigen met MAF-reiniger, luchtfilter nakijken; daarna opnieuw meten.' },
    brandstofdruk: { naam: 'Te lage brandstofdruk (pomp, filter of regelaar)', systeem: 'brandstof',
      vervolg: 'Brandstofdruk meten met een manometer; brandstoffilter nakijken.' },
    injector:    { naam: 'Injector lekt of spuit te veel', systeem: 'brandstof',
      vervolg: 'Injectoren laten testen (lekproef of retourmeting bij diesel).' },
    misfire:     { naam: 'Ontstekingsprobleem (bougie, bobine)', systeem: 'ontsteking',
      vervolg: 'Bougies en bobines nakijken; wissel een bobine van cilinder en kijk of de fout meeverhuist.' },
    lambda:      { naam: 'Lambdasonde traag of defect', systeem: 'uitlaat',
      vervolg: 'Lambdasonde en bedrading nakijken; een trage sonde vervangen.' },
    kat:         { naam: 'Katalysator versleten', systeem: 'uitlaat', ookToetsen: ['misfire', 'lambda'],
      vervolg: 'Uitlaatgastest; katalysator laten beoordelen voor je hem vervangt.' },
    thermostaat: { naam: 'Thermostaat blijft open hangen', systeem: 'koeling',
      vervolg: 'Thermostaat vervangen; goedkoop en vaak de oorzaak van hoog verbruik in de winter.' },
    koeling:     { naam: 'Koelprobleem (ventilator, pomp of vloeistof)', systeem: 'koeling',
      vervolg: 'Koelvloeistofpeil, koelventilator en waterpomp nakijken. Rijd niet door met een te hete motor.' },
    koelsensor:  { naam: 'Temperatuursensor koelvloeistof wijkt af', systeem: 'koeling',
      vervolg: 'Sensor en stekker nakijken; een afwijkende sensor maakt koude starts en verbruik slechter.' },
    accu:        { naam: 'Accu zwak', systeem: 'elektrisch', ookToetsen: ['laad'],
      vervolg: 'Accu laten testen met een belastingtester; hij is na ±5 jaar vaak op.' },
    laad:        { naam: 'Laadsysteem (dynamo of regelaar)', systeem: 'elektrisch',
      vervolg: 'Dynamo, regelaar en V-snaar laten nakijken.' },
    turbo:       { naam: 'Te weinig laaddruk (turbo, lek of regeling)', systeem: 'lucht',
      vervolg: 'Laadluchtslangen en intercooler op lekken nakijken, daarna de turbo en zijn regeling.' },
    egr:         { naam: 'EGR-klep vervuild of hangt', systeem: 'uitlaat',
      vervolg: 'EGR-klep reinigen of vervangen; daarna inleren.' },
    dpf:         { naam: 'Roetfilter (vol, of niet goed geregistreerd)', systeem: 'uitlaat',
      vervolg: 'Laat het roetfilter beoordelen; een regeneratie of reiniging lost een vol filter vaak op.' },
    olie:        { naam: 'Olieverbruik (verbrandt olie)', systeem: 'motor',
      vervolg: 'Oliepeil bijhouden per 1000 km; compressietest of carterontluchting nakijken.' },
    koppakking:  { naam: 'Koppakking of koelvloeistof in de verbranding', systeem: 'motor',
      vervolg: 'CO2-test op het koelwater en een druktest van het koelsysteem.' },
    software:    { naam: 'Inleren of codering (software)', systeem: 'software',
      vervolg: 'Het onderdeel laten inleren of coderen met de software voor dit merk (zie het bewijs).' },
    // Sinds 09-10-2026: komen in spel via de merkkennis (KENNIS hieronder) of
    // via een foutcode. `klachten`: bij welke klacht ze meedoen als ze alleen
    // uit de merkkennis komen — de klachtlijsten in KLACHTEN blijven zoals ze zijn.
    distributie: { naam: 'Distributie: ketting gerekt of nokkenasverstelling', systeem: 'motor',
      klachten: ['lampje', 'onrustig', 'vermogen', 'start'],
      vervolg: 'De nokkenas/krukas-afwijking (in graden) uitlezen met merk-software; bij een afwijking de kettingspanner en de ketting laten opmeten. Niet doorrijden op een ratelende ketting.' },
    versnellingsbak: { naam: 'Versnellingsbak (automaat, DSG of PowerShift)', systeem: 'aandrijving',
      klachten: ['lampje', 'onrustig', 'vermogen'],
      vervolg: 'De regeleenheid van de bak uitlezen met merk-software (VCDS/ODIS, FORScan): foutgeheugen, koppelingsadaptatie en slijtagewaarden. Olie- en filterbeurt nagaan.' },
    niet_obd:    { naam: 'Mechanisch, niet via OBD te zien', systeem: 'mechanisch',
      vervolg: 'Geluiden, ophanging, aandrijving en lekkage zijn alleen met een proefrit en een brug te beoordelen.' }
  };

  // ── De klachten ─────────────────────────────────────────────────────
  // Elke klacht zet een begin-set verdenkingen in spel. `kw` herkent hem in
  // de vrije tekst van de wizard; de gebruiker bevestigt of past aan.
  var KLACHTEN = {
    lampje:   { naam: 'Motorlampje brandt', icoon: '🟠',
      kw: ['lampje', 'storingslamp', 'motorlamp', 'check engine', 'foutcode', 'storing'],
      h: ['misfire', 'lambda', 'kat', 'maf', 'valselucht', 'egr', 'dpf', 'software', 'thermostaat'] },
    onrustig: { naam: 'Onrustig, hapert of schokt', icoon: '〰️',
      kw: ['onrustig', 'hapert', 'haper', 'schok', 'trilt', 'tril', 'stationair', 'inhouden', 'houdt in', 'sputter', 'slaat af'],
      h: ['valselucht', 'misfire', 'maf', 'injector', 'egr', 'niet_obd'] },
    vermogen: { naam: 'Trekt slecht, minder vermogen', icoon: '🐢',
      kw: ['vermogen', 'trekt', 'kracht', 'noodloop', 'traag', 'turbo', 'optrekken', 'acceler'],
      h: ['turbo', 'maf', 'brandstofdruk', 'egr', 'dpf', 'misfire'] },
    verbruik: { naam: 'Verbruikt te veel', icoon: '⛽',
      kw: ['verbruik', 'zuipt', 'zuinig', 'liter', 'brandstof op', 'tank'],
      h: ['maf', 'injector', 'thermostaat', 'lambda', 'valselucht', 'misfire'] },
    start:    { naam: 'Start slecht', icoon: '🔑',
      kw: ['start', 'aanslaan', 'slaat niet aan', 'koude start', 'startmotor'],
      h: ['accu', 'laad', 'brandstofdruk', 'koelsensor'] },
    warm:     { naam: 'Wordt te warm of blijft koud', icoon: '🌡️',
      kw: ['warm', 'heet', 'temperatuur', 'koelvloeistof', 'koelwater', 'oververhit', 'kachel', 'blijft koud'],
      h: ['koeling', 'thermostaat', 'koelsensor', 'koppakking'] },
    rook:     { naam: 'Rook of stank', icoon: '💨',
      kw: ['rook', 'rookt', 'walm', 'stank', 'ruikt', 'geur', 'roet'],
      h: ['olie', 'koppakking', 'injector', 'turbo', 'egr', 'dpf'] },
    elektrisch: { naam: 'Accu of elektrisch', icoon: '🔋',
      kw: ['accu', 'batterij', 'dynamo', 'spanning', 'lampjes flikkeren', 'laadt niet', 'leeg'],
      h: ['accu', 'laad'] },
    // Geluid (20-10-2026, uit de nieuwe intake van de wizard). Het meeste
    // geluid is mechanisch en niet via OBD te zien; dat zegt niet_obd. Een
    // tikkende of ratelende motor kan wel distributie of overslaan zijn.
    geluid:   { naam: 'Vreemd geluid of trilling', icoon: '🔊',
      kw: ['geluid', 'tikt', 'tikken', 'rammel', 'ratel', 'piep', 'gier', 'brom', 'klop', 'fluit', 'zoem', 'knars'],
      h: ['niet_obd', 'distributie', 'misfire'] },
    // Geen klacht (07-10-2026, #434). Tot dan begon het onderzoek altijd
    // vanuit een klacht, en wie bij een groene "Check mijn auto" toch wilde
    // weten hoe het ervoor stond, kwam er niet in. Dit is de brede ronde:
    // wat je zonder klacht het vaakst mist. Bij een diesel komt CONTROLE_DIESEL
    // erbij (zie nieuw()). Geen trefwoorden: "niets aan de hand" in vrije
    // tekst is geen reden om hem aan te zetten.
    controle: { naam: 'Niets bijzonders — controle', icoon: '🧭',
      kw: [],
      h: ['valselucht', 'maf', 'lambda', 'kat', 'thermostaat', 'accu', 'laad', 'misfire'] }
  };
  var CONTROLE_DIESEL = ['dpf', 'egr', 'software'];

  // ── Wanneer speelt het (16-10-2026) ─────────────────────────────────
  // Wat een monteur als tweede vraagt, na "wat merk je". Het moment scheidt
  // families die bij dezelfde klacht horen: overslaan onder last is meestal
  // ontsteking, alleen stationair meestal lucht, bij regen een bobine of
  // bougieput. Dit is voorkennis, geen meting: per verdenking hoogstens
  // VOORAF_MAX, zodat een antwoord nooit zelf iets bevestigt. Het bepaalt
  // wel welke stap eerst komt.
  var WANNEER = {
    koud:       { naam: 'Koude motor', icoon: '❄️',
      b: [{ h: 'koelsensor', d: 1 }, { h: 'valselucht', d: 0.5 }, { h: 'injector', d: 0.5 }, { h: 'distributie', d: 0.5 }] },
    warm:       { naam: 'Warme motor', icoon: '🔥',
      b: [{ h: 'koeling', d: 0.5 }, { h: 'misfire', d: 0.5 }, { h: 'brandstofdruk', d: 0.5 }] },
    stationair: { naam: 'Stationair, stilstaand', icoon: '⏱️',
      b: [{ h: 'valselucht', d: 1 }, { h: 'egr', d: 0.5 }, { h: 'injector', d: 0.5 }] },
    belast:     { naam: 'Optrekken, heuvel op', icoon: '⛰️',
      b: [{ h: 'misfire', d: 1 }, { h: 'brandstofdruk', d: 1 }, { h: 'turbo', d: 1 }, { h: 'valselucht', d: -0.5 }] },
    constant:   { naam: 'Constante snelheid', icoon: '🛣️',
      b: [{ h: 'lambda', d: 0.5 }, { h: 'egr', d: 0.5 }, { h: 'versnellingsbak', d: 0.5 }] },
    vocht:      { naam: 'Regen of vochtig weer', icoon: '🌧️',
      b: [{ h: 'misfire', d: 1.5 }] }
  };
  var VOORAF_MAX = 1.5;
  /* Een foutcode die de klant zelf opgeeft (20-10-2026): van de garage, een
     andere app, of van vóór een wis. Dezelfde CODEREGELS als een uitgelezen
     code, maar als voorkennis: hoogstens VOORAF_MAX per verdenking, zodat de
     auto zelf beslist. Een code die de uitlezing óók vindt, telt daar. */
  function codesVooraf(st, codes) {
    var som = {};
    (codes || []).forEach(function (code) {
      CODEREGELS.forEach(function (rg) {
        var m = String(code).toUpperCase().match(rg.re);
        if (!m) return;
        speel(st, rg.h, 'opgegeven code ' + code);
        var oud = som[rg.h] || 0, nw = Math.min(VOORAF_MAX, oud + rg.d * 0.5), d = nw - oud;
        som[rg.h] = nw;
        if (!d) return;
        st.v[rg.h].score += d;
        st.v[rg.h].bewijs.push({ d: d, t: rg.t(code, m) + ' (door jou opgegeven, niet uitgelezen)', stap: 'intake' });
      });
    });
  }
  function vooraf(st, ws) {
    var som = {};
    (ws || []).forEach(function (w) {
      var x = WANNEER[w]; if (!x) return;
      x.b.forEach(function (b) {
        if (b.d > 0) speel(st, b.h, 'wanneer: ' + x.naam.toLowerCase());
        if (!st.v[b.h]) return;
        var oud = som[b.h] || 0, nw = Math.max(-VOORAF_MAX, Math.min(VOORAF_MAX, oud + b.d)), d = nw - oud;
        som[b.h] = nw;
        if (!d) return;
        st.v[b.h].score += d;
        st.v[b.h].bewijs.push({ d: d, t: 'je zegt: ' + x.naam.toLowerCase(), stap: 'intake' });
      });
    });
  }

  // ── Wat bij dit merk bekend is (09-10-2026) ────────────────────────
  // AUTO_KENNIS (pidlane-data.js) noemt per merk de bekende zwakke punten.
  // Tot nu toe kwamen die alleen als tekst op het scherm ("Wat we al weten")
  // en in de prompt van de Auto-expert; het onderzoek zelf toetste ze niet.
  // Hier wordt elk zwak punt een verdenking, zodat het onderzoek er een stap
  // voor kiest. Kennis is GEEN bewijs: de score blijft 0, alleen de stappen
  // die zo'n verdenking toetsen wegen zwaarder (KENNIS_GEWICHT). Wat niet
  // via de diagnosepoort te toetsen is, komt als "zelf nakijken" in het
  // rapport — nooit stilzwijgend weg.
  var KENNIS = [
    // alleen: deze regel wint van de rest. "EGR-koeler" is koelvloeistof in
    // de verbranding, niet (ook nog) een vervuilde EGR-klep.
    { re: /egr-koeler|koelvloeistof-verlies|waterpomp intern/i, h: ['koppakking', 'koeling'], alleen: true },
    { re: /\begr/i, h: ['egr'] },
    { re: /dpf|roetfilter/i, h: ['dpf'] },
    { re: /injector/i, h: ['injector'] },
    { re: /thermostaat/i, h: ['thermostaat'] },
    { re: /waterpomp|koelsysteem/i, h: ['koeling'] },
    { re: /olieverbruik|pcv/i, h: ['olie'] },
    { re: /turbo/i, h: ['turbo'] },
    { re: /lambda/i, h: ['lambda'] },
    { re: /katalysator/i, h: ['kat'] },
    { re: /carbon|inlaatklep/i, h: ['misfire'] },
    { re: /ketting|chain|distributie|vanos|balanceer/i, h: ['distributie'], alleen: true },
    { re: /dsg|mechatronic|powershift|versnellingsbak/i, h: ['versnellingsbak'] }
  ];
  // Gemeten op 09-10-2026 over vijf klachten: bij 1,5 en 2 veranderde de
  // volgorde van het plan nergens, bij 3 gaat de stap voor het bekende punt
  // voor ("lampje" bij een thermostaat-merk: eerst de temperatuur). De klacht
  // blijft de basis; de kennis bepaalt wat er eerst aan de beurt is.
  var KENNIS_GEWICHT = 3;

  /* kennis: { merk, zwak:[tekst…] } uit autoKennisVoorMerk(). Geeft per
     zwak punt de verdenkingen terug; een leeg h betekent: niet te toetsen. */
  function kennisNaarVerdenking(kennis) {
    return ((kennis && kennis.zwak) || []).map(function (t) {
      var regels = KENNIS.filter(function (k) { return k.re.test(t); });
      var alleen = regels.filter(function (k) { return k.alleen; });
      if (alleen.length) regels = alleen;
      var h = [];
      regels.forEach(function (k) { k.h.forEach(function (x) { if (h.indexOf(x) < 0) h.push(x); }); });
      return { t: t, h: h };
    });
  }
  var BREED = ['valselucht', 'maf', 'misfire', 'injector', 'lambda', 'thermostaat', 'koelsensor', 'accu', 'laad', 'turbo', 'egr', 'software'];

  // ── Hulpjes voor reeksen ────────────────────────────────────────────
  function getallen(a) { return (a || []).filter(function (v) { return typeof v === 'number' && !isNaN(v); }); }
  function mediaan(a) { a = getallen(a).sort(function (x, y) { return x - y; }); if (!a.length) return null; var h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; }
  function gem(a) { a = getallen(a); if (!a.length) return null; var s = 0; a.forEach(function (v) { s += v; }); return s / a.length; }
  function sprei(a) { a = getallen(a); if (a.length < 2) return null; return Math.max.apply(null, a) - Math.min.apply(null, a); }
  function max(a) { a = getallen(a); return a.length ? Math.max.apply(null, a) : null; }
  function genoeg(a, n) { return getallen(a).length >= (n || 5); }
  function r1(v) { return v == null ? '?' : (Math.round(v * 10) / 10).toLocaleString('nl'); }

  /* De derde poort (#532). Een stap levert bewijs {h, d, t}; als de regel
     uitgaat van een kenmerk van de auto, gaat dat bewijs eerst door
     PLKenmerk: fout → volle weging, let op → halve weging met "niet zeker",
     onbeslist → {h:null, d:0} en "niet te beoordelen" (zo kent het rapport
     het al), geldt niet → geen bewijs. Zonder PLKenmerk: de oude regel. */
  function kmPoort(voorwaarden) {
    try { return window.PLKenmerk ? PLKenmerk.toepassen('fout', PLKenmerk.geldtLive(voorwaarden)) : 'fout'; }
    catch (e) { console.warn('PLOnderzoek: kenmerkpoort onleesbaar — oud gedrag', e); return 'fout'; }
  }
  function kmBewijs(niveau, h, d, t, r) {
    if (!niveau) return null;
    if (niveau === 'onbeslist') return { h: null, d: 0, t: (r && r.tekst) || (t + ' — niet te beoordelen op deze auto') };
    if (niveau === 'letop') return { h: h, d: d / 2, t: t + ' (niet zeker voor deze auto)' };
    return { h: h, d: d, t: t };
  }
  function kmKoel(t) {
    try { return window.PLKenmerk ? PLKenmerk.koelLive(t) : (t >= 106 ? { niveau: 'fout' } : { niveau: 'ok' }); }
    catch (e) { console.warn('PLOnderzoek: koelwateroordeel', e); return null; }
  }
  // Laadspanning: één grens (PLKenmerk.laadspanning), stationair = 800 tpm.
  function laadBewijs(v, dFout, dOk, voor) {
    var t0 = (voor ? voor + ' ' : 'laadspanning ') + r1(v) + ' V';
    var r = null;
    try { r = window.PLKenmerk ? PLKenmerk.laadLive(v, 800) : null; }
    catch (e) { console.warn('PLOnderzoek: laadoordeel', e); }
    if (!r) {
      if (v < 13.0) return [{ h: 'laad', d: dFout, t: t0 + ' — de dynamo laadt niet genoeg' }];
      if (v > 15.0) return [{ h: 'laad', d: dFout, t: t0 + ' — te hoog, de regelaar knijpt niet af' }];
      return v >= 13.4 ? [{ h: 'laad', d: dOk, t: t0 + ' — de dynamo laadt' }] : [];
    }
    if (r.niveau === 'ok') return [{ h: 'laad', d: dOk, t: t0 + ' — ' + r.tekst.replace(/^laadspanning [\d,]+ V — /, '') }];
    if (r.niveau === 'onbeslist') return [kmBewijs('onbeslist', 'laad', dFout, t0, r)];
    // r.tekst is al een volledige zin, met "(niet zeker voor deze auto)" bij let op.
    return [{ h: 'laad', d: r.niveau === 'letop' ? dFout / 2 : dFout, t: (voor ? voor + ': ' : '') + r.tekst }];
  }
  // Totale brandstoftrim van bank 1: kort + lang. Dat is wat de ECU werkelijk
  // bijstuurt; alleen de lange trim mist een lek dat net is ontstaan.
  function trim(u) {
    var k = gem(u.reeks['0106']), l = gem(u.reeks['0107']);
    if (k == null && l == null) return null;
    return (k || 0) + (l || 0);
  }

  // ── De stappen ──────────────────────────────────────────────────────
  // soort: lezen (foutcodes), mode06 (de zelftests van de ECU, PLM06),
  // meten (live), vraag (de gebruiker antwoordt).
  // test: welke verdenkingen deze stap kan scheiden, en hoe sterk (0–3).
  // voorwaarde: motor_uit | motor_aan | warm. opdracht: wat de gebruiker
  // tijdens het meten doet. beoordeel(u, st) → [{h, d, t}]: verdenking,
  // gewicht (+ bevestigt, − sluit uit) en de tekst met de meetwaarde.
  var STAPPEN = [
    { id: 'codes', soort: 'lezen', titel: 'Snelle scan: foutcodes, freeze frame en ECU-geheugen', icoon: '🔍',
      waarom: 'Wat de auto zelf al weet, gaat voor alles: foutcodes, de toestand op het moment van de fout, wat de ECU al weken bijstuurt en je laatste rit. Geen opdracht, geen vraag — en vaak wijst het meteen een richting.',
      test: { misfire: 2, lambda: 2, kat: 2, maf: 1.5, valselucht: 1, egr: 1.5, dpf: 1.5, software: 2, thermostaat: 1.5, koelsensor: 1, laad: 1, turbo: 1, injector: 0.5, distributie: 2, versnellingsbak: 1.5 },
      altijdEerst: true, snapPids: ['010C', '0105', '0106', '0107', '0108', '0109', '0142'],
      beoordeel: beoordeelScan },

    // Mode 06 (13-10-2026): de meetwaarden achter de zelftests. Een missende
    // cilinder telt hier per cilinder, ook als er (nog) geen foutcode is; een
    // katalysator of sonde krap binnen de fabrieksgrens zegt meer dan "geen
    // code". Niet elke auto levert het: dan overgeslagen, geen tegenbewijs.
    { id: 'mode06', soort: 'mode06', titel: 'Zelftests per cilinder en katalysator (mode 06)', icoon: '🔬',
      waarom: 'De motorcomputer telt per cilinder hoe vaak hij overslaat en meet de katalysator en sondes tegen zijn eigen grens. Dat staat er al vóór er een foutcode komt.',
      na: ['codes'],
      test: { misfire: 2.5, kat: 2, lambda: 1.5, egr: 1, distributie: 1, turbo: 1, dpf: 1 },
      beoordeel: beoordeelMode06 },

    { id: 'rust', soort: 'meten', titel: 'Accu in rust', icoon: '🔋',
      waarom: 'Een accu zonder dat de dynamo meehelpt: de enige manier om accu en laadsysteem uit elkaar te houden.',
      voorwaarde: 'motor_uit', pids: ['0142'], duurMs: 8000,
      test: { accu: 2.5, laad: 0.5 },
      beoordeel: function (u) {
        var v = gem(u.reeks['0142']); if (!genoeg(u.reeks['0142'], 3)) return [];
        if (v < 12.2) return [{ h: 'accu', d: 2.5, t: 'rustspanning ' + r1(v) + ' V — een volle accu staat op 12,6 V' }];
        if (v < 12.45) return [{ h: 'accu', d: 1, t: 'rustspanning ' + r1(v) + ' V — aan de lage kant' }];
        return [{ h: 'accu', d: -2, t: 'rustspanning ' + r1(v) + ' V — de accu is vol' }];
      } },

    { id: 'laden', soort: 'meten', titel: 'Laadspanning bij stationair', icoon: '⚡',
      waarom: 'Met draaiende motor hoort de dynamo te laden. Een slimme laadregeling vraagt bij een volle accu bewust 12,5–13 V; de gevraagde laadspanning zegt dan of hij doet wat hij moet.',
      voorwaarde: 'motor_aan', pids: ['0142', '010C'], duurMs: 15000,
      test: { laad: 2.5, accu: 0.5 },
      beoordeel: function (u) {
        var v = gem(u.reeks['0142']); if (!genoeg(u.reeks['0142'], 4)) return [];
        return laadBewijs(v, 2.5, -2);
      } },

    { id: 'laden_belast', soort: 'meten', titel: 'Laden onder belasting', icoon: '💡',
      waarom: 'Een dynamo die stationair net genoeg haalt, zakt soms in als er stroom gevraagd wordt.',
      voorwaarde: 'motor_aan', pids: ['0142'], duurMs: 15000, na: ['laden'],
      opdracht: 'Zet de koplampen, de achterruitverwarming en de kachelventilator op vol aan. Laat de motor stationair draaien.',
      test: { laad: 2 },
      beoordeel: function (u) {
        var v = gem(u.reeks['0142']); if (!genoeg(u.reeks['0142'], 4)) return [];
        return laadBewijs(v, 2, -1.5, 'onder belasting');
      } },

    { id: 'stationair', soort: 'meten', titel: 'Stationair: trims, luchtmassa en rust', icoon: '⏱️',
      waarom: 'Hoeveel de motorcomputer moet bijsturen zegt meer dan elke losse sensor: een lek, een vuile luchtmassameter of een lekkende injector laten elk hun eigen spoor na.',
      voorwaarde: 'warm', pids: ['010C', '0106', '0107', '0110'], duurMs: 25000,
      opdracht: 'Laat de motor stationair draaien. Geen gas, niets aanzetten.',
      test: { valselucht: 2, injector: 2, maf: 1.5, misfire: 1, brandstofdruk: 0.5 },
      beoordeel: function (u, st) {
        var r = [], t = trim(u), rpmS = sprei(u.reeks['010C']);
        if (rpmS != null && genoeg(u.reeks['010C'], 8)) {
          if (rpmS > 180) { r.push({ h: 'misfire', d: 1, t: 'toerental schommelt ' + Math.round(rpmS) + ' tpm stationair' }); r.push({ h: 'valselucht', d: 0.5, t: 'onrustig stationair (' + Math.round(rpmS) + ' tpm)' }); }
          else if (rpmS < 60) r.push({ h: 'misfire', d: -1, t: 'stationair rustig (' + Math.round(rpmS) + ' tpm spreiding)' });
        }
        // Op LPG zeggen de trims van de benzine-ECU niets (#532); zonder bewijs het gewone geval.
        if (t != null && kmPoort({ lpg: { is: false, gangbaar: true } }) === null) { r.push({ h: null, d: 0, t: 'brandstoftrim niet beoordeeld — deze auto rijdt op LPG' }); t = null; }
        if (t != null && genoeg(u.reeks['0106'] || u.reeks['0107'], 5)) {
          st.metingen.trimStationair = t;
          if (t > 12) {
            r.push({ h: 'valselucht', d: 2, t: 'brandstoftrim +' + r1(t) + ' % stationair — de motor krijgt meer lucht dan hij meet' });
            r.push({ h: 'maf', d: 1, t: 'trim +' + r1(t) + ' % kan ook een luchtmassameter zijn die te weinig meet' });
            r.push({ h: 'injector', d: -2, t: 'trim positief (+' + r1(t) + ' %) — een lekkende injector geeft het omgekeerde' });
          } else if (t < -12) {
            r.push({ h: 'injector', d: 2, t: 'brandstoftrim ' + r1(t) + ' % — de motor krijgt te veel brandstof' });
            r.push({ h: 'valselucht', d: -2, t: 'trim negatief (' + r1(t) + ' %) — een lek geeft het omgekeerde' });
          } else if (Math.abs(t) < 6) {
            r.push({ h: 'valselucht', d: -2, t: 'brandstoftrim ' + r1(t) + ' % — mengsel klopt stationair' });
            r.push({ h: 'injector', d: -1.5, t: 'brandstoftrim ' + r1(t) + ' % — geen overmaat brandstof' });
          }
        }
        var maf = gem(u.reeks['0110']), l = st.ctx.liters;
        if (maf != null && l && genoeg(u.reeks['0110'], 5)) {
          var pl = maf / l;
          if (pl < 0.9) r.push({ h: 'maf', d: 1.5, t: 'luchtmassa ' + r1(maf) + ' g/s op ' + r1(l) + ' l — laag voor stationair' });
          else if (pl < 3) r.push({ h: 'maf', d: -0.5, t: 'luchtmassa ' + r1(maf) + ' g/s — normaal voor stationair' });
        }
        return r;
      } },

    { id: 'toeren2500', soort: 'meten', titel: 'Trims bij 2500 tpm', icoon: '🦶',
      waarom: 'De klassieke scheidingstest. Een lek telt stationair zwaar en verdwijnt bij meer lucht; een vuile luchtmassameter of te lage brandstofdruk blijft.',
      voorwaarde: 'warm', pids: ['010C', '0106', '0107'], duurMs: 20000, na: ['stationair'],
      opdracht: 'Geef in vrijloop gas tot ongeveer 2500 tpm en houd dat vast tot de meting klaar is. Handrem erop.',
      alleenAls: function (st) { var t = st.metingen.trimStationair; return t != null && Math.abs(t) > 8; },
      test: { valselucht: 3, maf: 2, brandstofdruk: 2 },
      beoordeel: function (u, st) {
        var rpm = gem(u.reeks['010C']), t = trim(u), s = st.metingen.trimStationair;
        if (rpm == null || rpm < 1800) return [{ h: null, d: 0, t: 'toerental ' + Math.round(rpm || 0) + ' tpm — niet hoog genoeg om iets te zeggen' }];
        if (t != null) st.metingen.trim2500 = t;   // voor de vergelijking met de trimkaart (#534)
        if (t == null || s == null) return [];
        if (s > 8 && t < s / 2) return [
          { h: 'valselucht', d: 2.5, t: 'trim zakt van +' + r1(s) + ' naar ' + r1(t) + ' % bij ' + Math.round(rpm) + ' tpm — typisch een lek' },
          { h: 'maf', d: -1.5, t: 'trim herstelt bij meer lucht — de luchtmassameter meet goed' },
          { h: 'brandstofdruk', d: -1.5, t: 'trim herstelt bij meer verbruik — de brandstofdruk houdt het bij' }];
        if (s > 8 && t >= s / 2) return [
          { h: 'maf', d: 1.5, t: 'trim blijft +' + r1(t) + ' % bij ' + Math.round(rpm) + ' tpm — tekort over het hele bereik' },
          { h: 'brandstofdruk', d: 1, t: 'trim blijft hoog bij meer verbruik — ook brandstofdruk past hierbij' },
          { h: 'valselucht', d: -1.5, t: 'trim herstelt niet bij meer lucht — een lek alleen verklaart het niet' }];
        return [];
      } },

    { id: 'lambda', soort: 'meten', titel: 'Lambdasondes voor en na de katalysator', icoon: '🧪',
      waarom: 'De voorste sonde hoort snel te wisselen; de achterste hoort rustig te zijn. Wisselt de achterste mee, dan doet de katalysator zijn werk niet meer.',
      voorwaarde: 'warm', pids: ['0114', '0115', '010C'], duurMs: 20000,
      opdracht: 'Houd het toerental rond 2000 tpm vast tot de meting klaar is.',
      test: { lambda: 2.5, kat: 2.5 },
      beoordeel: function (u) {
        var r = [], v = sprei(u.reeks['0114']), a = sprei(u.reeks['0115']);
        // Op een breedbandauto is 0114 een plaatshouder, geen luie sonde (#532).
        if (v != null && kmPoort({ breedband_b1s1: { is: false, gangbaar: true } }) === null) { r.push({ h: null, d: 0, t: 'smalband 0114 niet beoordeeld — deze auto meet vóór de katalysator met een breedbandsonde' }); v = null; }
        if (v != null && genoeg(u.reeks['0114'], 8)) {
          if (v < 0.3) r.push({ h: 'lambda', d: 2.5, t: 'voorste sonde wisselt maar ' + r1(v) + ' V — traag of defect' });
          else r.push({ h: 'lambda', d: -2, t: 'voorste sonde wisselt ' + r1(v) + ' V — reageert goed' });
        }
        if (a != null && v != null && v >= 0.3 && genoeg(u.reeks['0115'], 8)) {
          if (a > 0.5) r.push({ h: 'kat', d: 2.5, t: 'achterste sonde wisselt ' + r1(a) + ' V mee — de katalysator slaat geen zuurstof meer op' });
          else if (a < 0.25) r.push({ h: 'kat', d: -2.5, t: 'achterste sonde rustig (' + r1(a) + ' V) — de katalysator werkt' });
        }
        return r;
      } },

    // ── brandstofdruk en breedbandsonde (#428, 14-10-2026) ──
    // De drempels zijn voorlopig, net als die van mode 06: ze vergelijken de
    // auto met zichzelf (stationair tegen 2500 tpm, gemeten tegen gevraagd),
    // omdat de absolute druk per motor tien keer kan verschillen.
    { id: 'raildruk', soort: 'meten', titel: 'Brandstofdruk stationair en bij 2500 tpm', icoon: '⛽',
      waarom: 'Een zwakke pomp of een dicht filter houdt de druk stationair nog bij, maar zakt weg zodra de motor meer brandstof vraagt.',
      voorwaarde: 'warm', pids: ['0123', '0159', '010A', '010C'], nodig: ['0123', '0159', '010A'], duurMs: 25000,
      opdracht: 'Laat de motor eerst stationair draaien. Geef halverwege gas tot ongeveer 2500 tpm en houd dat vast tot de meting klaar is. Handrem erop.',
      test: { brandstofdruk: 3, injector: 0.5 },
      beoordeel: function (u) {
        var pid = ['0123', '0159', '010A'].filter(function (p) { return genoeg(u.reeks[p], 8); })[0];
        if (!pid) return [{ h: null, d: 0, t: 'de auto gaf geen brandstofdruk — niet beoordeeld' }];
        var d = u.reeks[pid], rpm = u.reeks['010C'] || [], laag = [], hoog = [], r = [];
        d.forEach(function (x, i) {
          if (typeof x !== 'number' || typeof rpm[i] !== 'number') return;
          if (rpm[i] < 1200) laag.push(x); else if (rpm[i] >= 1800) hoog.push(x);
        });
        var mL = mediaan(laag), mH = mediaan(hoog);
        var teLaag = pid === '010A' && mL != null && laag.length >= 3 && mL < 200;
        if (teLaag)
          r.push({ h: 'brandstofdruk', d: 2, t: 'brandstofdruk stationair ' + Math.round(mL) + ' kPa — laag voor een injectiemotor' });
        if (mL != null && mH != null && laag.length >= 3 && hoog.length >= 3) {
          var q = mH / mL;
          if (q < 0.85) r.push({ h: 'brandstofdruk', d: 2.5, t: 'brandstofdruk zakt van ' + Math.round(mL) + ' naar ' + Math.round(mH) + ' kPa bij meer toeren — de toevoer houdt het niet bij' });
          else if (q >= 0.95 && !teLaag) r.push({ h: 'brandstofdruk', d: -2, t: 'brandstofdruk houdt stand (' + Math.round(mL) + ' → ' + Math.round(mH) + ' kPa bij meer toeren)' });
        } else r.push({ h: null, d: 0, t: 'niet zowel stationair als rond 2500 tpm gemeten — alleen de rust van de druk beoordeeld' });
        var s = sprei(laag);
        if (s != null && mL > 0 && laag.length >= 5 && s / mL > 0.3) r.push({ h: 'brandstofdruk', d: 1, t: 'brandstofdruk schommelt stationair ' + Math.round(s) + ' kPa rond ' + Math.round(mL) });
        return r;
      } },

    { id: 'breedband', soort: 'meten', titel: 'Breedbandsonde: reageert hij, en klopt het mengsel?', icoon: '🧪',
      waarom: 'Veel moderne motoren hebben voor de katalysator een breedbandsonde in plaats van een sonde die wisselt. Die hoort λ ≈ 1 te meten en bij gas loslaten naar arm te schieten.',
      voorwaarde: 'warm', pids: ['0124', '0134', '0144', '010C'], nodig: ['0124', '0134'], duurMs: 20000,
      opdracht: 'Laat de motor stationair draaien. Geef dan twee keer kort gas tot ongeveer 3000 tpm en laat het pedaal telkens meteen los.',
      test: { lambda: 2.5, valselucht: 0.5, injector: 0.5 },
      beoordeel: function (u, st) {
        var pid = ['0124', '0134'].filter(function (p) { return genoeg(u.reeks[p], 8); })[0];
        if (!pid) return [{ h: null, d: 0, t: 'de auto gaf geen breedbandsonde — niet beoordeeld' }];
        var l = u.reeks[pid], rpm = u.reeks['010C'] || [], doel = gem(u.reeks['0144']), r = [], rust = [];
        if (doel == null || doel < 0.8 || doel > 1.2) doel = 1;
        var sp = sprei(l), mx = Math.max.apply(null, getallen(l));
        if (sp != null && sp < 0.02) r.push({ h: 'lambda', d: 2.5, t: 'breedbandsonde staat stil op λ ' + (Math.round(gem(l) * 100) / 100) + ' — reageert niet op gas geven' });
        else if (mx > 1.25) r.push({ h: 'lambda', d: -2, t: 'breedbandsonde ziet de brandstofafsluiting bij gas loslaten (λ tot ' + (Math.round(mx * 100) / 100) + ')' });
        l.forEach(function (x, i) { if (typeof x === 'number' && x < 1.2 && (typeof rpm[i] !== 'number' || rpm[i] < 1200)) rust.push(x); });
        var m = mediaan(rust);
        if (m != null && rust.length >= 5 && !(sp != null && sp < 0.02)) {
          st.metingen.lambdaRust = m;
          var a = m - doel, t = 'λ ' + (Math.round(m * 100) / 100) + ' stationair (gevraagd ' + (Math.round(doel * 100) / 100) + ')';
          if (a > 0.05) r.push({ h: 'valselucht', d: 1, t: t + ' — mengsel arm' });
          else if (a < -0.05) r.push({ h: 'injector', d: 1, t: t + ' — mengsel rijk' });
          else if (Math.abs(a) <= 0.02) r.push({ h: 'lambda', d: -0.5, t: t + ' — sonde en regeling zijn het eens' });
        }
        return r;
      } },

    { id: 'temperatuur', soort: 'meten', titel: 'Koelwatertemperatuur volgen', icoon: '🌡️',
      waarom: 'Een motor die niet op temperatuur komt verbruikt meer; een die te warm wordt is een risico. Het verloop zegt welke van de twee.',
      voorwaarde: 'motor_aan', pids: ['0105', '010C'], duurMs: 60000, na: ['looptijd'],
      opdracht: 'Laat de motor stationair draaien.',
      test: { thermostaat: 2.5, koeling: 2.5, koppakking: 0.5 },
      beoordeel: function (u, st) {
        var r = [], hoog = max(u.reeks['0105']), eind = gem((u.reeks['0105'] || []).slice(-5));
        if (!genoeg(u.reeks['0105'], 5)) return r;
        var kw = kmKoel(hoog);
        if (kw && kw.niveau !== 'ok') r.push(kmBewijs(kw.niveau, 'koeling', 2.5, 'koelwater tot ' + Math.round(hoog) + ' °C — te warm', kw));
        else r.push({ h: 'koeling', d: -1.5, t: 'koelwater hoogstens ' + Math.round(hoog) + ' °C — binnen de norm' });
        var lang = st.antwoorden.looptijd === 'lang';
        if (lang && eind < 78) r.push({ h: 'thermostaat', d: 2.5, t: 'na meer dan 15 minuten pas ' + Math.round(eind) + ' °C — de motor komt niet op temperatuur' });
        else if (eind >= 82) r.push({ h: 'thermostaat', d: -2, t: 'koelwater ' + Math.round(eind) + ' °C — de thermostaat sluit' });
        return r;
      } },

    { id: 'koudstart', soort: 'meten', titel: 'Temperatuursensoren bij een koude motor', icoon: '❄️',
      waarom: 'Na een nacht stilstaan horen koelwater en aangezogen lucht vrijwel even warm te zijn. Wijkt de koelwatersensor dan af, dan liegt hij.',
      voorwaarde: 'motor_uit', pids: ['0105', '010F'], duurMs: 6000, na: ['koud'],
      alleenAls: function (st) { return st.antwoorden.koud === 'ja'; },
      test: { koelsensor: 3 },
      beoordeel: function (u) {
        var k = gem(u.reeks['0105']), l = gem(u.reeks['010F']);
        if (k == null || l == null) return [];
        var v = Math.abs(k - l);
        if (v > 8) return [{ h: 'koelsensor', d: 3, t: 'koude motor: koelwater ' + Math.round(k) + ' °C, lucht ' + Math.round(l) + ' °C — ' + Math.round(v) + ' graden verschil' }];
        return [{ h: 'koelsensor', d: -2.5, t: 'koude motor: koelwater ' + Math.round(k) + ' °C en lucht ' + Math.round(l) + ' °C liggen bij elkaar' }];
      } },

    { id: 'laaddruk', soort: 'meten', titel: 'Laaddruk onder vollast', icoon: '🌀',
      waarom: 'Een turbo die te weinig druk maakt, of een lek in de laadlucht, zie je alleen als er echt vermogen gevraagd wordt.',
      // Alleen in de garagemodus: vol optrekken tijdens het rijden is geen
      // opdracht die je een klant geeft (besluit 07-10-2026).
      voorwaarde: 'rijden', pids: ['010B', '0133', '010C', '0104'], duurMs: 30000, garage: true,
      opdracht: 'Alleen waar het veilig en toegestaan is: trek in de 3e versnelling vol op van ±1500 naar ±3500 tpm. Liefst met iemand naast je die de telefoon vasthoudt.',
      test: { turbo: 3, egr: 0.5, dpf: 0.5 },
      beoordeel: function (u) {
        var map = u.reeks['010B'] || [], last = u.reeks['0104'] || [], baro = gem(u.reeks['0133']) || 100, beste = null;
        for (var i = 0; i < map.length; i++) if (last[i] >= 80 && typeof map[i] === 'number') beste = Math.max(beste == null ? 0 : beste, map[i] - baro);
        if (beste == null) return [{ h: null, d: 0, t: 'geen moment met vollast gemeten — de laaddruk is niet beoordeeld' }];
        if (beste < 15) return [{ h: null, d: 0, t: 'laaddruk ' + Math.round(beste) + ' kPa boven de buitenlucht — dit lijkt een motor zonder turbo' }];
        // "Te weinig voor een turbo" veronderstelt een turbo met gewone laaddruk (#532).
        if (beste < 60) return [kmBewijs(kmPoort({ turbo: true }), 'turbo', 2.5, 'laaddruk onder vollast maar ' + Math.round(beste) + ' kPa — te weinig voor een turbomotor')].filter(Boolean);
        return [{ h: 'turbo', d: -2.5, t: 'laaddruk ' + Math.round(beste) + ' kPa onder vollast — de turbo levert' }];
      } },

    // ── vragen ──
    { id: 'looptijd', soort: 'vraag', titel: 'Hoe lang draait de motor al?', icoon: '⏳',
      waarom: 'Om de temperatuur goed te kunnen lezen.',
      test: { thermostaat: 0.5 },
      opties: [{ t: 'Net gestart (< 5 min)', w: 'kort' }, { t: '5 tot 15 minuten', w: 'midden' }, { t: 'Langer dan 15 minuten', w: 'lang' }] },
    { id: 'koud', soort: 'vraag', titel: 'Heeft de auto minstens zes uur stilgestaan, en is de motor nog niet gestart?', icoon: '❄️',
      waarom: 'Dan kan ik de temperatuursensoren tegen elkaar houden.',
      test: { koelsensor: 1 },
      opties: [{ t: 'Ja, de motor is nog koud', w: 'ja' }, { t: 'Nee', w: 'nee' }] },
    { id: 'rookkleur', soort: 'vraag', titel: 'Welke kleur heeft de rook uit de uitlaat?', icoon: '💨',
      waarom: 'De kleur scheidt brandstof, olie en koelvloeistof — dat kan geen sensor.',
      test: { olie: 2.5, koppakking: 2.5, injector: 1.5, turbo: 1, egr: 1 },
      opties: [
        { t: 'Zwart', w: 'zwart', b: [{ h: 'injector', d: 1.5 }, { h: 'turbo', d: 1 }, { h: 'egr', d: 1 }, { h: 'maf', d: 0.5 }, { h: 'olie', d: -1.5 }, { h: 'koppakking', d: -1.5 }] },
        { t: 'Blauw/grijs', w: 'blauw', b: [{ h: 'olie', d: 3 }, { h: 'koppakking', d: -1 }] },
        { t: 'Wit, dik en zoet ruikend', w: 'wit', b: [{ h: 'koppakking', d: 3 }, { h: 'olie', d: -1 }] },
        { t: 'Geen of alleen wat damp bij een koude motor', w: 'geen', b: [{ h: 'olie', d: -2 }, { h: 'koppakking', d: -2 }, { h: 'injector', d: -0.5 }] }] },
    { id: 'startgedrag', soort: 'vraag', titel: 'Hoe gaat het starten?', icoon: '🔑',
      waarom: 'Langzaam ronddraaien is iets anders dan wel draaien maar niet aanslaan.',
      test: { accu: 2, brandstofdruk: 1.5, koelsensor: 0.5 },
      opties: [
        { t: 'Draait langzaam rond', w: 'traag', b: [{ h: 'accu', d: 2 }, { h: 'brandstofdruk', d: -1 }] },
        { t: 'Draait goed, maar slaat slecht aan', w: 'slaatniet', b: [{ h: 'brandstofdruk', d: 1.5 }, { h: 'koelsensor', d: 0.5 }, { h: 'accu', d: -1.5 }] },
        { t: 'Alleen slecht als hij koud is', w: 'koud', b: [{ h: 'koelsensor', d: 1.5 }, { h: 'accu', d: 0.5 }] },
        { t: 'Starten gaat eigenlijk prima', w: 'goed', b: [{ h: 'accu', d: -1 }, { h: 'brandstofdruk', d: -0.5 }] }] },
    { id: 'gevoel', soort: 'vraag', titel: 'Voel of hoor je de motor schudden of overslaan?', icoon: '🫨',
      waarom: 'Een overslaande cilinder voel je vaak eerder dan de auto hem als code opslaat.',
      test: { misfire: 1.5 },
      opties: [
        { t: 'Ja, vooral stationair', w: 'stil', b: [{ h: 'misfire', d: 1.5 }, { h: 'valselucht', d: 0.5 }] },
        { t: 'Ja, vooral bij optrekken', w: 'last', b: [{ h: 'misfire', d: 1.5 }, { h: 'brandstofdruk', d: 0.5 }] },
        { t: 'Nee', w: 'nee', b: [{ h: 'misfire', d: -1 }] }] },
    { id: 'koudstartgeluid', soort: 'vraag', titel: 'Hoor je bij een koude start de eerste seconden een ratel of rammel?', icoon: '⛓️',
      waarom: 'Een gerekte ketting of een lekkende kettingspanner hoor je het best in de eerste seconden na een koude start, vóór de oliedruk er is. Geen sensor ziet dat.',
      test: { distributie: 2 },
      opties: [
        { t: 'Ja, een paar seconden, daarna weg', w: 'kort', b: [{ h: 'distributie', d: 2 }] },
        { t: 'Ja, en het blijft', w: 'blijft', b: [{ h: 'distributie', d: 1 }, { h: 'niet_obd', d: 0.5 }] },
        { t: 'Nee, hij start stil', w: 'nee', b: [{ h: 'distributie', d: -1 }] }] },
    { id: 'schakelen', soort: 'vraag', titel: 'Hoe schakelt hij als je rustig optrekt van de 1e naar de 3e?', icoon: '⚙️',
      waarom: 'Een automaat of DSG meldt zijn fouten vaak in zijn eigen regeleenheid, niet in de motor. Wat je voelt bij het wegrijden zegt dan meer dan de diagnosepoort.',
      test: { versnellingsbak: 2 },
      opties: [
        { t: 'Schok of klap, vooral van 1 naar 2', w: 'schok', b: [{ h: 'versnellingsbak', d: 2 }] },
        { t: 'Toeren lopen op zonder dat hij sneller gaat', w: 'slip', b: [{ h: 'versnellingsbak', d: 2.5 }] },
        { t: 'Soepel', w: 'soepel', b: [{ h: 'versnellingsbak', d: -1.5 }] },
        { t: 'Het is een handgeschakelde auto', w: 'hand', b: [{ h: 'versnellingsbak', d: -4 }] }] },
    { id: 'geluid', soort: 'vraag', titel: 'Is het vooral een geluid, of iets wat je in het stuur of de bodem voelt?', icoon: '👂',
      waarom: 'Rammels, piepjes en trillingen van ophanging of aandrijving ziet geen enkele sensor. Dan zeg ik dat liever eerlijk.',
      test: { niet_obd: 2 },
      opties: [
        { t: 'Ja, een geluid of trilling van buiten de motor', w: 'ja', b: [{ h: 'niet_obd', d: 3 }] },
        { t: 'Nee, het zit in de motor', w: 'nee', b: [{ h: 'niet_obd', d: -2 }] }] }
  ];
  var STAP = {}; STAPPEN.forEach(function (s) { STAP[s.id] = s; });

  // Foutcodes → verdenkingen. Geen volledige DTC-database (die heeft de app
  // al in DTCDB), alleen wat elke code zegt over de verdenkingen hierboven.
  var CODEREGELS = [
    { re: /^P030([1-8])$/, h: 'misfire', d: 3, t: function (c, m) { return c + ' — cilinder ' + m[1] + ' slaat over'; } },
    { re: /^P0300$/, h: 'misfire', d: 2.5, t: function (c) { return c + ' — willekeurige cilinders slaan over'; } },
    { re: /^P0(171|174)$/, h: 'valselucht', d: 1.5, t: function (c) { return c + ' — mengsel te mager'; } },
    { re: /^P0(171|174)$/, h: 'maf', d: 1, t: function (c) { return c + ' — mager kan ook een luchtmassameter zijn'; } },
    { re: /^P0(171|174)$/, h: 'brandstofdruk', d: 1, t: function (c) { return c + ' — of te weinig brandstofdruk'; } },
    { re: /^P0(172|175)$/, h: 'injector', d: 2, t: function (c) { return c + ' — mengsel te rijk'; } },
    { re: /^P010[0-4]$/, h: 'maf', d: 2.5, t: function (c) { return c + ' — luchtmassameter of zijn circuit'; } },
    { re: /^P0(13[0-9]|14[0-9]|15[0-9]|16[0-7])$/, h: 'lambda', d: 2.5, t: function (c) { return c + ' — lambdasonde of zijn verwarming'; } },
    { re: /^P04(20|30)$/, h: 'kat', d: 2.5, t: function (c) { return c + ' — rendement van de katalysator te laag'; } },
    { re: /^P0128$/, h: 'thermostaat', d: 3, t: function (c) { return c + ' — motor komt niet op temperatuur'; } },
    { re: /^P011[5-9]$/, h: 'koelsensor', d: 2.5, t: function (c) { return c + ' — temperatuursensor koelvloeistof'; } },
    { re: /^P021[78]$/, h: 'koeling', d: 2.5, t: function (c) { return c + ' — motor te warm'; } },
    { re: /^P056[23]$/, h: 'laad', d: 2.5, t: function (c) { return c + ' — boordspanning buiten bereik'; } },
    { re: /^P0(299|234)$/, h: 'turbo', d: 2.5, t: function (c) { return c + ' — laaddruk wijkt af'; } },
    { re: /^P040[0-9]$/, h: 'egr', d: 2, t: function (c) { return c + ' — uitlaatgasrecirculatie'; } },
    { re: /^P2(002|463)$/, h: 'dpf', d: 2.5, t: function (c) { return c + ' — roetfilter'; } },
    { re: /^P00(0[89]|1[6-9])$/, h: 'distributie', d: 3, t: function (c) { return c + ' — nokkenas en krukas lopen niet gelijk (ketting of versteller)'; } },
    { re: /^P00(1[0-5]|2[0-5])$/, h: 'distributie', d: 2, t: function (c) { return c + ' — nokkenasverstelling of haar magneetklep'; } },
    { re: /^P07\d\d$/, h: 'versnellingsbak', d: 2.5, t: function (c) { return c + ' — versnellingsbak'; } }
  ];

  function beoordeelCodes(u, st) {
    var r = [];
    if (!u || !u.scan) return r;
    var s = u.scan, c = s.codes || {}, g = s.gelezen || {};
    var alle = [].concat(c.bevestigd || [], c.pending || [], c.permanent || []).filter(function (x, i, a) { return a.indexOf(x) === i; });
    st.metingen.codes = alle;
    // Een code die alleen "in afwachting" staat, heeft de auto één keer gezien
    // en nog niet bevestigd: die weegt minder, anders bevestigt één haperende
    // rit al een verdenking.
    var vast = [].concat(c.bevestigd || [], c.permanent || []);
    alle.forEach(function (code) {
      var gevonden = false, f = vast.indexOf(code) >= 0 ? 1 : 0.6;
      CODEREGELS.forEach(function (rg) {
        var m = String(code).match(rg.re);
        if (m) { gevonden = true; r.push({ h: rg.h, d: rg.d * f, t: rg.t(code, m) + (f < 1 ? ' (nog niet bevestigd)' : '') }); }
      });
      if (!gevonden) r.push({ h: null, d: 0, t: code + ' — past bij geen van de verdenkingen; staat in het rapport' });
    });
    // Geen codes is zwak tegenbewijs, en alleen als alle drie de soorten echt gelezen zijn.
    if (!alle.length && g.bevestigd && g.pending && g.permanent) {
      ['misfire', 'kat', 'lambda'].forEach(function (h) { r.push({ h: h, d: -1, t: 'geen foutcodes opgeslagen' }); });
    }
    // De software-kennis van #426, met wat de gebruiker over recent werk vertelde.
    var rd = s.readiness;
    var sw = softwareOorzaken({
      merk: st.ctx.merk, brandstof: rd ? rd.brandstof : st.ctx.brandstof,
      nietKlaar: rd ? rd.nietKlaar : [], sinds: s.sinds, dtc: alle, vervangen: st.ctx.vervangen,
      vinAfwijkend: typeof plVinAfwijkend === 'function' && plVinAfwijkend()
    });
    sw.forEach(function (a) {
      r.push({ h: 'software', d: a.sterkte === 'sterk' ? 3 : 2, t: a.naam + ': ' + a.bewijs.join('; ') });
      st.metingen.software = (st.metingen.software || []).concat([a]);
    });
    if (rd && rd.nietKlaar && rd.nietKlaar.length) r.push({ h: null, d: 0, t: rd.nietKlaar.length + ' zelftest(s) niet klaar: ' + rd.nietKlaar.join(', ') });
    return r;
  }

  // ── De snelle scan (16-10-2026) ─────────────────────────────────────
  // Wat een monteur doet vóór hij één onderdeel test: vastleggen wat de auto
  // zelf al weet. Het freeze frame (de motor op het moment van de fout), het
  // bijstuurgeheugen (lange-termijntrim, per bank), de tellers sinds het
  // wissen, en de rit die er al is. Dat kost geen opdracht en geen vraag,
  // en het is precies wat de klant niet ziet. Elke regel hier is puur:
  // u.scan uit PLFoutcodes, u.snap {pid:[waarden]}, u.kaart uit trimKaart().

  // Het freeze frame: onder welke toestand trad de fout op, en wat stuurde de
  // ECU toen bij. Mager stationair is het lekspoor; mager onder last het
  // spoor van te weinig brandstof.
  function beoordeelFreeze(u, st) {
    var f = u && u.scan && u.scan.freeze;
    if (!f || !f.waarden) return [];
    var w = f.waarden, n = function (p) { return typeof w[p] === 'number' && !isNaN(w[p]) ? w[p] : null; };
    var rpm = n('010C'), kmh = n('010D'), tc = n('0105'), last = n('0104');
    var heeftTrim = n('0106') != null || n('0107') != null, tr = (n('0106') || 0) + (n('0107') || 0);
    st.metingen.freeze = { code: f.code, rpm: rpm, kmh: kmh, tc: tc, last: last, trim: heeftTrim ? tr : null };
    var r = [], stil = rpm != null && rpm < 1100 && (kmh == null || kmh < 5), belast = last != null && last > 50;
    var bij = 'freeze frame ' + (f.code || '') + ': trim ' + (tr > 0 ? '+' : '') + r1(tr) + ' %';
    if (heeftTrim && tr > 15 && stil) r.push({ h: 'valselucht', d: 1.5, t: bij + ' stationair — mager waar een lek het zwaarst telt' });
    else if (heeftTrim && tr > 15 && belast) {
      r.push({ h: 'brandstofdruk', d: 1, t: bij + ' bij ' + Math.round(last) + ' % last — mager onder last: te weinig brandstof' });
      r.push({ h: 'maf', d: 0.5, t: bij + ' onder last — of een luchtmassameter die te weinig meet' });
    } else if (heeftTrim && tr < -15) r.push({ h: 'injector', d: 1, t: bij + ' — te rijk op het moment van de fout' });
    if (tc != null && tc < 60) r.push({ h: null, d: 0, t: 'de fout trad op met een koude motor (' + Math.round(tc) + ' °C) — warm meten kan hem missen' });
    return r;
  }

  // Een momentopname bij het uitlezen: draait de motor warm, dan zegt de
  // lange-termijntrim wat de ECU al weken bijstuurt, en per bank of de
  // oorzaak aan één kant zit. Twee banken die verschillen sluiten alles uit
  // wat ze delen: de luchtmassameter en de brandstofdruk.
  function beoordeelSnap(u, st) {
    var s = u && u.snap; if (!s) return [];
    var rpm = mediaan(s['010C']), tc = mediaan(s['0105']), v = mediaan(s['0142']);
    var loopt = rpm != null && rpm > CFG.grens.aanRpm, warm = loopt && tc != null && tc >= CFG.grens.warmC;
    var r = [];
    if (loopt && v != null && v < 12.8) r.push({ h: 'laad', d: 1.5, t: 'motor draait, boordspanning maar ' + r1(v) + ' V' });
    if (!loopt && v != null && v > 8 && v < 12.2) r.push({ h: 'accu', d: 1, t: 'contact aan, motor uit: ' + r1(v) + ' V' });
    if (!warm) return r;
    var b1 = gem(s['0107']), b2 = gem(s['0109']);
    st.metingen.ltft = { b1: b1, b2: b2 };
    if (kmPoort({ lpg: { is: false, gangbaar: true } }) === null) { st.metingen.ltft = null; return r; }
    if (b1 != null && b2 != null && Math.abs(b1 - b2) > 10) {
      var hoog = b1 > b2 ? 1 : 2, a = Math.max(b1, b2), b = Math.min(b1, b2);
      var tk = 'lange trim bank 1 ' + r1(b1) + ' %, bank 2 ' + r1(b2) + ' %';
      if (a > 10) r.push({ h: 'valselucht', d: 1, t: tk + ' — bank ' + hoog + ' mager: een lek of injector aan die kant' });
      if (b < -10) r.push({ h: 'injector', d: 1, t: tk + ' — bank ' + (3 - hoog) + ' rijk: een injector aan die kant' });
      r.push({ h: 'maf', d: -1.5, t: tk + ' — verschil tussen de banken: de luchtmassameter is voor beide gelijk' });
      r.push({ h: 'brandstofdruk', d: -1.5, t: tk + ' — verschil tussen de banken: de brandstofdruk is voor beide gelijk' });
    } else if (b1 != null && b2 != null && b1 > 10 && b2 > 10) {
      r.push({ h: 'maf', d: 0.5, t: 'beide banken mager (' + r1(b1) + ' / ' + r1(b2) + ' %) — iets wat ze delen' });
      r.push({ h: 'brandstofdruk', d: 0.5, t: 'beide banken mager (' + r1(b1) + ' / ' + r1(b2) + ' %) — ook de brandstofdruk delen ze' });
    }
    return r;
  }

  /* De trimkaart: uit een rit of datalog die er al is, de totale trim per
     toestand. hist = { pid: [{t, v}] }. Geeft { bron, stationair, deel, hoog }
     met per vak { n, trim } of null als er te weinig is. Een vak telt alleen
     met een warme motor (als de temperatuur erin staat). */
  var KAART_MIN = 8;
  function trimKaart(hist, bron) {
    var vak = trimVakken(hist);
    if (!vak) return null;
    var r = { bron: bron || 'een eerdere meting' }, iets = false;
    Object.keys(vak).forEach(function (x) {
      r[x] = vak[x].length >= KAART_MIN ? { n: vak[x].length, trim: mediaan(vak[x]) } : null;
      if (r[x]) iets = true;
    });
    return iets ? r : null;
  }
  // De vakken zelf, ook onder KAART_MIN: de meetopdracht van #534 wil weten
  // hoe ver een rit van een kaart af zat, niet alleen dát hij er geen gaf.
  function trimVakken(hist) {
    hist = hist || {};
    var rpm = hist['010C'] || [], kort = hist['0106'] || [], lang = hist['0107'] || [];
    if (!rpm.length || (!kort.length && !lang.length)) return null;
    function bij(a, t) {
      if (!a.length) return null;
      var lo = 0, hi = a.length - 1;
      while (lo < hi) { var m = (lo + hi) >> 1; if (a[m].t < t) lo = m + 1; else hi = m; }
      var beste = a[lo]; if (lo > 0 && Math.abs(a[lo - 1].t - t) < Math.abs(beste.t - t)) beste = a[lo - 1];
      return Math.abs(beste.t - t) <= 2000 && typeof beste.v === 'number' && !isNaN(beste.v) ? beste.v : null;
    }
    var vak = { stationair: [], deel: [], hoog: [] };
    rpm.forEach(function (p) {
      if (typeof p.v !== 'number') return;
      var k = bij(kort, p.t), l = bij(lang, p.t);
      if (k == null && l == null) return;
      if (hist['0105'] && hist['0105'].length) { var tc = bij(hist['0105'], p.t); if (tc == null || tc < CFG.grens.warmC) return; }
      var s = hist['010D'] ? bij(hist['010D'], p.t) : null, tr = (k || 0) + (l || 0);
      if (p.v > CFG.grens.aanRpm && p.v < 1100 && (s == null || s < 3)) vak.stationair.push(tr);
      else if (p.v >= 1800 && p.v <= 3200) vak.deel.push(tr);
      else if (p.v > 3200) vak.hoog.push(tr);
    });
    return vak;
  }

  // Het patroon over de vakken. Dezelfde scheiding als de 2500-tpm-proef,
  // maar op een rit die er al ligt — dus lichter gewogen (geen gecontroleerde
  // toestand), en zonder dat iemand gas hoeft te geven.
  function beoordeelKaart(u, st) {
    var k = u && u.kaart; if (!k) return [];
    st.metingen.kaart = k;
    var s = k.stationair && k.stationair.trim, d = k.deel && k.deel.trim;
    if (s == null || d == null) return [];
    if (kmPoort({ lpg: { is: false, gangbaar: true } }) === null) return [{ h: null, d: 0, t: 'trimkaart niet beoordeeld — deze auto rijdt op LPG' }];
    var pre = 'uit ' + k.bron + ': trim stationair ' + (s > 0 ? '+' : '') + r1(s) + ' %, bij 1800–3200 tpm ' + (d > 0 ? '+' : '') + r1(d) + ' %';
    if (s > 10 && d < s / 2) return [
      { h: 'valselucht', d: 1.5, t: pre + ' — mager stationair dat herstelt: het lekpatroon' },
      { h: 'maf', d: -1, t: pre + ' — herstelt bij meer lucht' },
      { h: 'brandstofdruk', d: -1, t: pre + ' — herstelt bij meer verbruik' }];
    if (s > 10) return [
      { h: 'maf', d: 1, t: pre + ' — mager over het hele bereik' },
      { h: 'brandstofdruk', d: 1, t: pre + ' — mager over het hele bereik' },
      { h: 'valselucht', d: -1, t: pre + ' — een lek alleen herstelt bij meer toeren' }];
    if (s < 6 && d > 10) return [
      { h: 'brandstofdruk', d: 1.5, t: pre + ' — alleen mager als er veel brandstof gevraagd wordt' },
      { h: 'valselucht', d: -1, t: pre + ' — een lek telt juist stationair' }];
    if (s < -10 && d > -5) return [{ h: 'injector', d: 1, t: pre + ' — alleen stationair rijk: een injector die nadruppelt' }];
    if (Math.abs(s) < 6 && Math.abs(d) < 6) return [
      { h: 'valselucht', d: -1, t: pre + ' — mengsel klopt over het hele bereik' },
      { h: 'maf', d: -1, t: pre + ' — mengsel klopt over het hele bereik' },
      { h: 'injector', d: -1, t: pre + ' — mengsel klopt over het hele bereik' }];
    return [];
  }

  function beoordeelScan(u, st) {
    if (u && u.scan) st.metingen.scan = u.scan;
    return beoordeelCodes(u, st).concat(beoordeelFreeze(u, st), beoordeelSnap(u, st), beoordeelKaart(u, st));
  }

  /* Wat de klant niet weet — maar de auto wel. Puur uit st.metingen. Elk
     inzicht: { niveau: 'let'|'info', kop, t }. Geen bewijs voor een
     verdenking: dit is wat er op tafel ligt vóór er iets gemeten wordt. */
  function inzichten(st) {
    var m = st.metingen || {}, s = m.scan || {}, r = [];
    var c = s.codes || {}, sd = s.sinds || {}, rd = s.readiness;
    var vast = [].concat(c.bevestigd || [], c.permanent || []);
    var nietKlaar = (rd && rd.nietKlaar) || [];
    if (sd.km != null && sd.km < 200 && (sd.warm == null || sd.warm < 20))
      r.push({ niveau: 'let', kop: 'Foutcodes zijn kort geleden gewist',
        t: sd.km + ' km' + (sd.warm != null ? ' en ' + sd.warm + '× warmgedraaid' : '') + ' geleden. Wat er vóór die tijd stond is weg' +
          (nietKlaar.length ? ', en ' + nietKlaar.length + ' zelftest(s) hebben sindsdien nog niet gedraaid: ' + nietKlaar.join(', ') : '') +
          '. Geen codes zegt nu dus weinig.' });
    else if (nietKlaar.length)
      r.push({ niveau: 'info', kop: nietKlaar.length + ' zelftest(s) nog niet klaar', t: nietKlaar.join(', ') + '. Wat niet getest is, kan ook geen code geven.' });
    if (sd.milKm) r.push({ niveau: 'let', kop: 'Gereden met het motorlampje aan', t: sd.milKm + ' km. Een brandend lampje maskeert een tweede storing: die geeft geen nieuw signaal.' });
    var wacht = (c.pending || []).filter(function (x) { return vast.indexOf(x) < 0; });
    if (wacht.length) r.push({ niveau: 'let', kop: 'Er komt iets aan', t: wacht.join(', ') + ' staat in afwachting: één keer gezien, nog geen lampje. Komt hij een volgende rit terug, dan gaat het lampje aan.' });
    var perm = (c.permanent || []).filter(function (x) { return (c.bevestigd || []).indexOf(x) < 0; });
    if (perm.length) r.push({ niveau: 'info', kop: 'Permanente code zonder lampje', t: perm.join(', ') + ' — de reparatie is (misschien) gedaan, maar de ECU heeft het nog niet zelf vastgesteld. Wissen helpt niet; rijden wel.' });
    var f = m.freeze;
    if (f) {
      var d = [];
      if (f.rpm != null) d.push(Math.round(f.rpm) + ' tpm');
      if (f.kmh != null) d.push(Math.round(f.kmh) + ' km/u');
      if (f.tc != null) d.push(Math.round(f.tc) + ' °C');
      if (f.last != null) d.push(Math.round(f.last) + ' % last');
      if (f.trim != null) d.push('trim ' + (f.trim > 0 ? '+' : '') + r1(f.trim) + ' %');
      var na = f.kmh != null && f.kmh > 5 ? 'rijdend rond ' + Math.round(f.kmh) + ' km/u' : 'stilstaand';
      if (f.tc != null) na += f.tc < 60 ? ', met een koude motor' : ', warm';
      r.push({ niveau: 'info', kop: 'Freeze frame' + (f.code ? ' van ' + f.code : ''),
        t: 'De ECU legde de motor vast op het moment van de fout: ' + d.join(', ') + '. Wil je hem terugzien, meet dan ' + na + '.' });
    }
    var lt = m.ltft;
    if (lt && lt.b1 != null) {
      var max = lt.b2 != null && Math.abs(lt.b2) > Math.abs(lt.b1) ? lt.b2 : lt.b1;
      if (lt.b2 != null && Math.abs(lt.b1 - lt.b2) > 10)
        r.push({ niveau: 'let', kop: 'De twee cilinderbanken verschillen', t: 'Lange trim bank 1 ' + r1(lt.b1) + ' %, bank 2 ' + r1(lt.b2) + ' %. De oorzaak zit aan één kant; alles wat beide banken delen (luchtmassameter, brandstofdruk) valt af.' });
      else if (Math.abs(max) > 8)
        r.push({ niveau: 'let', kop: 'De ECU stuurt al langere tijd bij', t: 'Lange-termijntrim ' + (max > 0 ? '+' : '') + r1(max) + ' %: ' + (max > 0 ? 'hij geeft structureel extra brandstof (mager)' : 'hij neemt structureel brandstof weg (rijk)') + '. Dat voel je niet, maar het is het geheugen van weken rijden.' });
    }
    var k = m.kaart;
    if (k && k.stationair && k.deel)
      r.push({ niveau: 'info', kop: 'Trimkaart uit ' + k.bron, t: 'Stationair ' + (k.stationair.trim > 0 ? '+' : '') + r1(k.stationair.trim) + ' % (' + k.stationair.n + '×), bij 1800–3200 tpm ' + (k.deel.trim > 0 ? '+' : '') + r1(k.deel.trim) + ' % (' + k.deel.n + '×)' + (k.hoog ? ', boven 3200 tpm ' + (k.hoog.trim > 0 ? '+' : '') + r1(k.hoog.trim) + ' %' : '') + '. Hoe de trim over de toeren loopt, wijst de familie aan vóór er iets getest is.' });
    var kn = st.kennis;
    if (kn && kn.merk && kn.getoetst && kn.getoetst.length)
      r.push({ niveau: 'info', kop: 'Bekend bij ' + kn.merk.charAt(0).toUpperCase() + kn.merk.slice(1), t: kn.getoetst.join('; ') + '. Die toets ik eerst.' });
    r.sort(function (a, b) { return (a.niveau === 'let' ? 0 : 1) - (b.niveau === 'let' ? 0 : 1); });
    return r;
  }

  /* Mode 06: welke monitor-ID's bij welke verdenking horen (J1979 bijlage D,
     dezelfde families als FAMILIE in pidlane-mode06.js). */
  // Welke mode 06-tests iets zeggen over welke verdenking staat in
  // PLM06.FAMILIE (pidlane-mode06.js), naar de MID-indeling van J1979. Tot
  // 15-10-2026 stond hier een eigen lijst met 0x31–0x3F als EGR: een VVT- of
  // EVAP-test woog dan als bewijs voor de EGR-klep (#515). Per verdenking
  // samengevoegd: sondes en hun verwarming zijn samen één 'lambda'.
  function m06Groepen() {
    var g = {}, lijst = [];
    var fam = (window.PLM06 && PLM06.FAMILIE) || [];
    fam.forEach(function (f) {
      if (!f.h) return;
      if (!g[f.h]) { g[f.h] = { h: f.h, naam: f.kort, sluitUit: !!f.sluitUit, delen: [] }; lijst.push(g[f.h]); }
      g[f.h].delen.push(f);
    });
    return lijst;
  }
  function inGroep(t, gr) { return gr.delen.some(function (f) { return t.mid >= f.van && t.mid <= f.tot; }); }
  // Missers per cilinder: MID A2–AD = cilinder 1–12. TID 0B is het lopende
  // gemiddelde over de laatste tien ritten, 0C de laatste of huidige rit.
  // Voorlopige drempels, te toetsen tegen echte uitlezingen (#428): een
  // cilinder telt als uitschieter vanaf M06_MIS_MIN missers en minstens
  // M06_MIS_FACTOR keer de andere cilinders.
  var M06_MIS_MIN = 10, M06_MIS_FACTOR = 3, M06_MIS_RUST = 5;

  function missersPerCilinder(tests) {
    var per = {};
    [0x0B, 0x0C].forEach(function (tid) {
      if (Object.keys(per).length) return;
      tests.forEach(function (t) {
        if (t.mid >= 0xA2 && t.mid <= 0xAD && t.tid === tid && t.ruw && typeof t.ruw.waarde === 'number') per[t.mid - 0xA1] = t.ruw.waarde;
      });
    });
    return per;
  }

  function beoordeelMode06(u, st) {
    var r = [];
    var tests = (u && u.m06 && u.m06.tests) || [];
    if (!tests.length) return [{ h: null, d: 0, t: 'de auto levert geen mode 06-gegevens' }];
    st.metingen.mode06 = { tests: tests.length };
    st.m06 = u.m06;   // de hele uitlezing, voor de tabel in het rapport
    // Per cilinder: één uitschieter wijst naar die cilinder, gespreid naar
    // iets wat alle cilinders raakt.
    var per = missersPerCilinder(tests), cil = Object.keys(per).map(Number);
    if (cil.length >= 2) {
      var tot = 0, top = cil[0];
      cil.forEach(function (c) { tot += per[c]; if (per[c] > per[top]) top = c; });
      var rest = cil.filter(function (c) { return c !== top; }).map(function (c) { return per[c]; });
      var restMax = Math.max.apply(null, rest);
      st.metingen.mode06.missers = per;
      if (per[top] >= M06_MIS_MIN && per[top] >= M06_MIS_FACTOR * Math.max(1, restMax)) {
        st.metingen.mode06.cilinder = top;
        r.push({ h: 'misfire', d: 2.5, t: 'cilinder ' + top + ' slaat ' + per[top] + '× over, de andere hoogstens ' + restMax + '× — één cilinder: bobine, bougie of injector van die cilinder' });
      } else if (tot >= M06_MIS_MIN * 2) {
        r.push({ h: 'misfire', d: 1.5, t: tot + ' missers verdeeld over ' + cil.length + ' cilinders — eerder mengsel, brandstof of valse lucht dan één bobine' });
      } else if (tot < M06_MIS_RUST) {
        r.push({ h: 'misfire', d: -1.5, t: 'missers per cilinder samen ' + tot + ' — de motor slaat niet over' });
      }
    }
    // Per familie: buiten de fabrieksgrens bevestigt, krap is een aanwijzing,
    // ruim binnen de grens sluit uit. Een onzeker oordeel (onbekende schaal)
    // telt niet mee.
    m06Groepen().forEach(function (f) {
      var g = tests.filter(function (t) { return inGroep(t, f) && t.oordeelZeker; });
      if (!g.length) return;
      // "Krap" komt uit PLM06 (16-10-2026): een grens op het uiterste van het
      // getal (0 missers bij 0–65535) telt daar niet als grens. Hier stond
      // eerst een eigen uitzondering voor UAS 0x24; één plek beslist.
      var gezakt = g.filter(function (t) { return !t.geslaagd; }), krap = g.filter(function (t) { return t.krap; });
      if (gezakt.length) r.push({ h: f.h, d: 2.5, t: gezakt.length + ' zelftest(s) ' + f.naam + ' buiten de fabrieksgrens (' + gezakt.map(function (t) { return t.midNaam; }).join(', ') + ')' });
      else if (krap.length) r.push({ h: f.h, d: 1, t: krap.length + ' zelftest(s) ' + f.naam + ' krap binnen de grens — nog geen fout, wel bijna' });
      else if (f.sluitUit && (f.h !== 'misfire' || cil.length < 2)) r.push({ h: f.h, d: -1.5, t: g.length + ' zelftest(s) ' + f.naam + ' ruim binnen de fabrieksgrens' });
    });
    return r;
  }

  // ── De kern ─────────────────────────────────────────────────────────
  // Op het begin van een woord: anders is "verbruikt" rook (er staat "ruikt" in).
  function klachtUitTekst(tekst) {
    var t = ' ' + String(tekst || '').toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, ' '), r = [];
    Object.keys(KLACHTEN).forEach(function (k) {
      if (KLACHTEN[k].kw.some(function (w) { return t.indexOf(' ' + w) >= 0; })) r.push(k);
    });
    return r;
  }

  /* ctx: { klachten:[…], lampje, meting, merk, brandstof, liters, vervangen:[…],
            beschikbaar: function(pid) → bool }  */
  function nieuw(ctx) {
    ctx = ctx || {};
    var st = { ctx: ctx, v: {}, gedaan: [], log: [], metingen: {}, antwoorden: {}, verbreed: false, klaar: false, stappen: 0 };
    var ks = (ctx.klachten && ctx.klachten.length) ? ctx.klachten : ['lampje'];
    if (ctx.lampje === 'aan' && ks.indexOf('lampje') < 0) ks = ks.concat(['lampje']);
    ctx.klachten = ks;
    ks.forEach(function (k) { (KLACHTEN[k] ? KLACHTEN[k].h : []).forEach(function (h) { speel(st, h, 'klacht'); }); });
    if (ks.indexOf('controle') >= 0 && /diesel/i.test(String(ctx.brandstof || '')))
      CONTROLE_DIESEL.forEach(function (h) { speel(st, h, 'controle (diesel)'); });
    if ((ctx.vervangen || []).length) speel(st, 'software', 'onlangs vervangen');
    kennisInSpel(st, ks);
    vooraf(st, ctx.wanneer);
    codesVooraf(st, ctx.codesHand);
    var kop = (ks.length === 1 && ks[0] === 'controle') ? 'Geen klacht, brede controle'
      : 'Klacht: ' + ks.map(function (k) { return KLACHTEN[k] ? KLACHTEN[k].naam : k; }).join(', ');
    st.log.push({ soort: 'start', t: kop + '. ' + Object.keys(st.v).length + ' verdenkingen om te onderzoeken.' });
    return st;
  }

  /* De merkkennis in het onderzoek. ctx.kennis mag meegegeven worden (test);
     anders vraagt hij autoKennisVoorMerk() van pidlane-motortype.js. Bij
     "controle" doet alles mee; bij een klacht alleen wat bij die klacht past,
     de rest staat als "bekend, niet bij deze klacht" in het rapport. */
  function kennisInSpel(st, ks) {
    var ctx = st.ctx, kennis = ctx.kennis;
    if (kennis === undefined) {
      try { kennis = (typeof autoKennisVoorMerk === 'function' && ctx.merk) ? autoKennisVoorMerk(ctx.merk, ctx.brandstof) : null; }
      catch (e) { console.warn('PLOnderzoek: merkkennis niet gelezen', e); kennis = null; }
    }
    st.kennis = { merk: (kennis && kennis.merk) || '', getoetst: [], andereKlacht: [], zelf: [] };
    if (!kennis) return;
    var breed = ks.indexOf('controle') >= 0;
    var past = function (h) {
      if (breed) return true;
      return ks.some(function (k) {
        return (KLACHTEN[k] && KLACHTEN[k].h.indexOf(h) >= 0) || (VERDENKINGEN[h].klachten || []).indexOf(k) >= 0;
      });
    };
    var merk = st.kennis.merk.charAt(0).toUpperCase() + st.kennis.merk.slice(1);
    kennisNaarVerdenking(kennis).forEach(function (z) {
      if (!z.h.length) { st.kennis.zelf.push(z.t); return; }
      var mee = z.h.filter(past);
      if (!mee.length) { st.kennis.andereKlacht.push(z.t); return; }
      mee.forEach(function (h) {
        speel(st, h, 'bekend bij ' + merk);
        st.v[h].bekend = (st.v[h].bekend ? st.v[h].bekend + '; ' : '') + z.t;
      });
      st.kennis.getoetst.push(z.t);
    });
    if (st.kennis.getoetst.length)
      st.log.push({ soort: 'kennis', t: 'Bij ' + merk + ' bekend: ' + st.kennis.getoetst.join(', ') + '. Die toets ik mee, en ze gaan voor.' });
  }

  function speel(st, h, waarom) {
    if (!VERDENKINGEN[h] || st.v[h]) return false;
    st.v[h] = { score: 0, bewijs: [], bron: waarom };
    return true;
  }

  function status(score) {
    if (score >= CFG.bevestigd) return 'bevestigd';
    if (score >= 1.5) return 'waarschijnlijk';
    if (score <= CFG.uitgesloten) return 'uitgesloten';
    if (score <= -1.5) return 'onwaarschijnlijk';
    return 'open';
  }
  function open(st, h) { var x = st.v[h]; return !!x && x.score < CFG.bevestigd && x.score > CFG.uitgesloten; }
  // Een getal tussen 0 en 1 voor de balk. Geen kans in statistische zin —
  // het onderzoek is daar te klein voor — maar wel monotoon met het bewijs.
  function balk(score) { return 1 / (1 + Math.exp(-score * 0.9)); }

  function meetbaar(st, stap) {
    if (stap.garage && !st.ctx.garage) return false;
    if (!stap.pids) return true;
    var b = st.ctx.beschikbaar;
    // `nodig`: zonder minstens één hiervan zegt de stap niets, ook al levert
    // de auto het toerental wel (#428: raildruk en breedband).
    return !b || (stap.nodig || stap.pids).some(function (p) { return b(p); });
  }

  function waarde(st, stap) {
    var w = 0;
    Object.keys(stap.test).forEach(function (h) {
      if (!open(st, h)) return;
      w += stap.test[h] * (1 + Math.max(0, st.v[h].score) / 2) * (st.v[h].bekend ? KENNIS_GEWICHT : 1);
    });
    if (stap.soort === 'meten' && stap.voorwaarde === 'rijden') w *= st.ctx.meting === 'rit10' ? 1 : 0.6;
    return w;
  }

  // Een stap met `na` mag pas als die stap gedaan is — tenzij die eerdere
  // stap zelf een vraag is: dan wordt de vraag eerst gesteld (zie volgende).
  function klaarVoor(st, stap) {
    return (stap.na || []).every(function (n) { return st.gedaan.indexOf(n) >= 0; });
  }

  function volgende(st) {
    if (st.klaar || st.stappen >= CFG.maxStappen) return null;
    var kand = [];
    STAPPEN.forEach(function (s) {
      if (st.gedaan.indexOf(s.id) >= 0) return;
      if (!meetbaar(st, s)) return;
      var w = waarde(st, s);
      if (w <= 0) return;
      if (s.alleenAls && klaarVoor(st, s) && !s.alleenAls(st)) return;
      kand.push({ s: s, w: s.altijdEerst ? 1e6 : w });
    });
    kand.sort(function (a, b) { return b.w - a.w; });
    for (var i = 0; i < kand.length; i++) {
      var s = kand[i].s;
      if (klaarVoor(st, s)) return s;
      // De eerste ontbrekende voorganger die zelf nog kan, gaat voor.
      for (var j = 0; j < s.na.length; j++) {
        var v = STAP[s.na[j]];
        if (v && st.gedaan.indexOf(v.id) < 0 && meetbaar(st, v) && klaarVoor(st, v)) return v;
      }
    }
    return null;
  }

  // Wat er daarna waarschijnlijk komt — alleen om het plan te tonen.
  function vooruit(st, n) {
    var kopie = { ctx: st.ctx, v: st.v, gedaan: st.gedaan.slice(), metingen: st.metingen, antwoorden: st.antwoorden, stappen: st.stappen, klaar: false };
    var r = [];
    for (var i = 0; i < (n || 3); i++) { var s = volgende(kopie); if (!s) break; r.push(s); kopie.gedaan.push(s.id); kopie.stappen++; }
    return r;
  }

  function verwerk(st, stap, uitslag) {
    uitslag = uitslag || {};
    st.gedaan.push(stap.id); st.stappen++;
    var stuk = { soort: 'stap', stap: stap.id, titel: stap.titel, bewijs: [], nieuw: [] };
    if (uitslag.overgeslagen) {
      stuk.t = 'Overgeslagen' + (uitslag.reden ? ': ' + uitslag.reden : '') + '.';
      st.log.push(stuk); return st;
    }
    var lijst = [];
    if (stap.soort === 'vraag') {
      st.antwoorden[stap.id] = uitslag.w;
      var o = (stap.opties || []).filter(function (x) { return x.w === uitslag.w; })[0];
      stuk.antwoord = o ? o.t : uitslag.w;
      (o && o.b || []).forEach(function (b) { lijst.push({ h: b.h, d: b.d, t: 'je antwoord: ' + o.t.toLowerCase() }); });
    } else {
      if (uitslag.ontbreekt && uitslag.ontbreekt.length) stuk.ontbreekt = uitslag.ontbreekt;
      lijst = stap.beoordeel(uitslag, st) || [];
    }
    lijst.forEach(function (b) {
      if (!b.h || !b.d) { stuk.bewijs.push({ h: null, d: 0, t: b.t }); return; }
      // Bewijs vóór een verdenking die nog niet in spel was: een nieuwe richting.
      if (!st.v[b.h]) {
        if (b.d <= 0) return;
        speel(st, b.h, stap.titel);
        stuk.nieuw.push(b.h);
      }
      st.v[b.h].score += b.d;
      st.v[b.h].bewijs.push({ d: b.d, t: b.t, stap: stap.id });
      stuk.bewijs.push(b);
    });
    if (!stuk.bewijs.length) stuk.t = uitslag.ontbreekt && uitslag.ontbreekt.length === (stap.pids || []).length
      ? 'Deze auto levert de benodigde sensoren niet — niets te beoordelen.'
      : 'Geen duidelijke aanwijzing in deze meting.';
    st.log.push(stuk);
    // Samenhang: een bevestigde verdenking kan het gevolg van een andere zijn
    // (een lege accu van een dynamo die niet laadt, een kapotte katalysator
    // van een overslaande cilinder). Die gaat eerst nog in spel.
    Object.keys(st.v).forEach(function (h) {
      if (st.v[h].score < CFG.bevestigd) return;
      (VERDENKINGEN[h].ookToetsen || []).forEach(function (o) {
        if (speel(st, o, 'samenhang')) st.log.push({ soort: 'verbreed', t: VERDENKINGEN[h].naam + ' lijkt bevestigd — ik kijk ook of "' + VERDENKINGEN[o].naam.toLowerCase() + '" de oorzaak is.' });
      });
    });
    if (Object.keys(st.v).some(function (h) { return st.v[h].score >= CFG.bevestigd && h !== 'niet_obd'; }) && !nogTeToetsen(st)) st.klaar = true;
    return st;
  }

  // Na een bevestiging nog doorgaan zolang (a) een samenhangende oorzaak nog
  // open staat en te meten is, of (b) er een tweede kandidaat is die even
  // sterk kan worden: "bevestigd" naast een even sterke andere is nog geen
  // conclusie.
  function nogTeToetsen(st) {
    var volgend = volgende(st);
    if (!volgend) return false;
    var samen = Object.keys(st.v).some(function (h) {
      return st.v[h].score >= CFG.bevestigd && (VERDENKINGEN[h].ookToetsen || []).some(function (o) { return open(st, o); });
    });
    if (samen) return true;
    var hs = Object.keys(st.v).filter(function (h) { return st.v[h].score >= 1.5 && h !== 'niet_obd'; });
    return hs.length > 1;
  }


  // Alles bij de klacht uitgesloten en niets meer te meten: één keer breder.
  function verbreed(st) {
    if (st.verbreed) return false;
    st.verbreed = true;
    var erbij = BREED.filter(function (h) { return speel(st, h, 'verbreed'); });
    st.log.push({ soort: 'verbreed', t: erbij.length
      ? 'Wat bij de klacht hoorde levert niets meer op. Ik verbreed naar ' + erbij.length + ' andere verdenkingen.'
      : 'Er zijn geen andere richtingen meer die ik kan meten.' });
    return erbij.length > 0;
  }

  function conclusie(st) {
    var hs = Object.keys(st.v).map(function (h) { return { id: h, naam: VERDENKINGEN[h].naam, score: st.v[h].score, status: status(st.v[h].score), bewijs: st.v[h].bewijs, vervolg: VERDENKINGEN[h].vervolg }; });
    hs.sort(function (a, b) { return b.score - a.score; });
    var top = hs.filter(function (x) { return x.status === 'bevestigd' || x.status === 'waarschijnlijk'; });
    var uit = hs.filter(function (x) { return x.status === 'uitgesloten' || x.status === 'onwaarschijnlijk'; });
    var oordeel;
    if (top.length && top[0].status === 'bevestigd') oordeel = 'gevonden';
    else if (top.length) oordeel = 'aanwijzing';
    else oordeel = 'niets';
    return { oordeel: oordeel, top: top, uitgesloten: uit, open: hs.filter(function (x) { return x.status === 'open'; }), alle: hs };
  }

  /* De lus. voer(stap, st) → Promise<uitslag>; teken(st, stap) mag ontbreken.
     Hetzelfde pad voor de app en voor de test. */
  async function draai(st, voer, teken) {
    teken = teken || function () { };
    while (!st.klaar && !st.gestopt) {
      var stap = volgende(st);
      if (!stap) { if (verbreed(st)) { teken(st, null); continue; } break; }
      st.huidig = stap.id; teken(st, stap);
      var u;
      try { u = await voer(stap, st); }
      catch (e) { console.warn('PLOnderzoek: stap ' + stap.id + ' faalde', e); u = { overgeslagen: true, reden: 'de meting liep vast (' + (e.message || e) + ')' }; }
      if (st.gestopt) break;
      verwerk(st, stap, u);
      st.huidig = null; teken(st, null);
    }
    st.klaar = true; st.huidig = null;
    st.uitkomst = conclusie(st);
    teken(st, null);
    return st;
  }

  // Open verdenkingen waar wél iets over gemeten is: tegenstrijdig bewijs
  // (P0420 terwijl de achterste sonde rustig is) hoort in de conclusie, niet
  // weggestopt onder "open".
  function nogOpen(c) { return c.open.filter(function (x) { return x.bewijs.some(function (b) { return b.d > 0; }); }); }

  function alsTekst(st) {
    var c = st.uitkomst || conclusie(st), r = ['PidLane — Volledig onderzoek', 'Datum: ' + new Date().toLocaleString('nl')];
    if (st.ctx.merk) r.push('Voertuig: ' + st.ctx.merk);
    if (st.ctx.klachtTekst) r.push('Klacht: ' + st.ctx.klachtTekst);
    if ((st.ctx.codesHand || []).length) r.push('Opgegeven foutcodes (niet uitgelezen): ' + st.ctx.codesHand.join(', '));
    if ((st.ctx.wanneer || []).length) r.push('Wanneer: ' + st.ctx.wanneer.map(function (w) { return WANNEER[w] ? WANNEER[w].naam : w; }).join(', '));
    var inz = inzichten(st);
    if (inz.length) { r.push('', '=== WAT DE AUTO AL WIST ==='); inz.forEach(function (x) { r.push(' ' + (x.niveau === 'let' ? '[let op] ' : '') + x.kop + ' — ' + x.t); }); }
    r.push('', '=== CONCLUSIE ===');
    if (c.oordeel === 'niets') r.push(' Geen oorzaak gevonden die via de diagnosepoort te zien is.');
    c.top.forEach(function (x) {
      r.push(' ' + (x.status === 'bevestigd' ? '[bevestigd]     ' : '[waarschijnlijk] ') + x.naam);
      x.bewijs.forEach(function (b) { r.push('   ' + (b.d > 0 ? '+' : '−') + ' ' + b.t); });
      r.push('   vervolg: ' + x.vervolg);
    });
    if (c.uitgesloten.length) { r.push('', '=== UITGESLOTEN ==='); c.uitgesloten.forEach(function (x) { r.push(' ' + x.naam + ' — ' + ((x.bewijs[0] || {}).t || '')); }); }
    var tegen = nogOpen(c);
    if (tegen.length) { r.push('', '=== NOG OPEN, MET AANWIJZINGEN ==='); tegen.forEach(function (x) { r.push(' ' + x.naam); x.bewijs.forEach(function (b) { r.push('   ' + (b.d > 0 ? '+' : '−') + ' ' + b.t); }); }); }
    var kn = st.kennis;
    if (kn && kn.merk && (kn.getoetst.length || kn.andereKlacht.length || kn.zelf.length)) {
      r.push('', '=== BEKEND BIJ DIT MERK (' + kn.merk + ') ===');
      Object.keys(st.v).filter(function (h) { return st.v[h].bekend; }).forEach(function (h) {
        var x = st.v[h], s = status(x.score), gemeten = x.bewijs.length > 0;
        r.push(' ' + VERDENKINGEN[h].naam + ' (' + x.bekend + '): ' + (gemeten ? s : 'niet getoetst — geen stap kon dit meten of het onderzoek stopte eerder'));
      });
      if (kn.andereKlacht.length) r.push(' Niet getoetst, past niet bij deze klacht: ' + kn.andereKlacht.join(', '));
      if (kn.zelf.length) r.push(' Niet via de diagnosepoort te zien, zelf nakijken: ' + kn.zelf.join(', '));
    }
    if (st.m06 && window.PLM06 && typeof PLM06.alsTekst === 'function') {
      r.push('', '=== MONITORTESTS (MODE 06) ===');
      PLM06.alsTekst(st.m06).forEach(function (l) { r.push(' ' + l); });
    }
    r.push('', '=== VERLOOP ===');
    st.log.forEach(function (l, i) {
      if (l.soort !== 'stap') { r.push(' · ' + l.t); return; }
      r.push(' ' + (i) + '. ' + l.titel + (l.antwoord ? ' — ' + l.antwoord : ''));
      if (l.t) r.push('    ' + l.t);
      l.bewijs.forEach(function (b) { r.push('    ' + (b.d > 0 ? '+' : b.d < 0 ? '−' : '·') + ' ' + b.t); });
    });
    return r.join('\n');
  }

  // ════════════════════════════════════════════════════════════════════
  // DE UITVOERDER — bus, scherm en demo
  // ════════════════════════════════════════════════════════════════════
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { console.warn('PLOnderzoek: demoMode onleesbaar', e); return false; } }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected; } catch (e) { console.warn('PLOnderzoek: connected onleesbaar', e); return false; } }
  var pauze = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* De demo-auto heeft een lek: stationair +16 % trim, bij 2500 tpm herstelt
     dat. Al het andere is gezond. Zo laat de demo zien hoe het onderzoek
     scheidt — een willekeurige wandeling zou nooit iets bevestigen. */
  function demoWaarde(pid, stapId) {
    var ruis = function (b, a) { return b + (Math.random() - 0.5) * 2 * a; };
    var hoog = stapId === 'toeren2500', rpm2000 = stapId === 'lambda';
    switch (pid) {
      case '010C': return hoog ? ruis(2500, 60) : rpm2000 ? ruis(2000, 50) : ruis(760, 25);
      case '0106': return hoog ? ruis(1, 2) : ruis(6, 3);
      case '0107': return hoog ? ruis(2, 0.5) : ruis(10, 0.5);
      case '0110': return hoog ? ruis(9, 0.4) : ruis(3.1, 0.2);
      case '0142': return stapId === 'rust' ? ruis(12.6, 0.03) : stapId === 'laden_belast' ? ruis(13.7, 0.1) : ruis(14.1, 0.08);
      case '0105': return ruis(89, 1);
      case '010F': return ruis(24, 1);
      case '0114': return Math.random() < 0.5 ? ruis(0.15, 0.08) : ruis(0.75, 0.08);
      case '0115': return ruis(0.68, 0.05);
      case '0133': return 101;
      case '010B': return ruis(30, 3);
      case '0104': return ruis(20, 3);
      case '010D': return 0;
      default: return null;
    }
  }

  async function leesPid(pid, stapId) {
    if (isDemo()) return demoWaarde(pid, stapId);
    var cmd = (typeof pidCmd === 'function') ? pidCmd(pid) : ('01' + pid.slice(2));
    var raw = await withBus('onderzoek', function () { return sendCmd(cmd); });
    var v = validateAndSmooth(pid, parsePID(pid, raw));
    return (typeof v === 'number' && !isNaN(v)) ? v : null;
  }

  function beschikbaar(pid) {
    if (isDemo()) return demoWaarde(pid, '') !== null;
    try { if (typeof supportedPIDs !== 'undefined' && supportedPIDs && supportedPIDs.size > 0) return supportedPIDs.has(pid); }
    catch (e) { console.warn('PLOnderzoek: supportedPIDs onleesbaar', e); }
    return !!(typeof getPidDef === 'function' && getPidDef(pid));
  }

  // Twee lezingen per PID (#538, 16-10-2026; waren er drie). Uitgerekend: een
  // V-motor vraagt 7 PID's, met drie lezingen 21 verzoeken; bij 400 ms per
  // verzoek (een trage ELM327) is dat 8,4 s, en dan voelt de eerste stap als
  // hangen. Met twee: 14 verzoeken, hoogstens 5,6 s. Twee lezingen vangen
  // nog steeds één misgelezen frame op (mediaan van twee = het gemiddelde,
  // en beoordeelSnap kijkt naar het verloop, niet naar één getal).
  // Wat de auto niet levert, wordt niet gevraagd.
  var MOMENT_LEZINGEN = 2;
  async function momentopname(pids, stapId) {
    var r = {};
    for (var n = 0; n < MOMENT_LEZINGEN; n++) {
      for (var i = 0; i < pids.length; i++) {
        if (!beschikbaar(pids[i])) continue;
        var v = await leesPid(pids[i], stapId);
        (r[pids[i]] || (r[pids[i]] = [])).push(v);
      }
    }
    return r;
  }
  // De trimkaart komt uit wat er al ligt: de laatste rit, dan de datalog,
  // dan de live-historie van deze sessie. Niets daarvan → geen kaart.
  function kaartBronnen() {
    return [
      function () { return typeof plRitBron === 'function' ? plRitBron() : null; },
      function () { return typeof plDatalogBron === 'function' ? plDatalogBron() : null; },
      function () { return typeof pidHist !== 'undefined' && pidHist ? { naam: 'de live-meting van deze sessie', hist: pidHist } : null; }
    ];
  }
  function kaartUitBron() {
    var bronnen = kaartBronnen();
    for (var i = 0; i < bronnen.length; i++) {
      var b = null;
      try { b = bronnen[i](); } catch (e) { console.warn('PLOnderzoek: bron voor de trimkaart onleesbaar', e); }
      var k = b && b.hist ? trimKaart(b.hist, b.naam) : null;
      if (k) return k;
    }
    return null;
  }

  /* ── App-maten voor de meetopdracht (#534) ──────────────────────────
     Wat alleen een echte ECU kan beantwoorden: levert hij een freeze frame
     mét trims, levert hij bank 2, hoe lang duurt de momentopname, vult een
     rit de trimkaart, en zegt de kaart hetzelfde als de gecontroleerde
     proef. null = niet gemeten deze sessie, nooit 0. */
  var _m = { scans: 0, scanMs: null, ff: null, ffTrim: null, bank2: null };
  function noteerScan(u, ms) {
    _m.scans++;
    if (typeof ms === 'number') _m.scanMs = ms;
    var f = u && u.scan && u.scan.freeze, w = (f && f.waarden) || {};
    _m.ff = f ? 1 : 0;
    _m.ffTrim = f ? ((typeof w['0106'] === 'number' || typeof w['0107'] === 'number') ? 1 : 0) : null;
    _m.bank2 = u && u.snap ? (getallen(u.snap['0109']).length ? 1 : 0) : null;
  }
  // De rijkste bron telt: de meetvraag is of een rit genoeg oplevert.
  function vakTelling() {
    var best = null;
    kaartBronnen().forEach(function (f) {
      var b = null;
      try { b = f(); } catch (e) { console.warn('PLOnderzoek: bron voor de vaktelling onleesbaar', e); }
      var v = b && b.hist ? trimVakken(b.hist) : null;
      if (v && (!best || v.stationair.length + v.deel.length > best.stationair.length + best.deel.length)) best = v;
    });
    return best;
  }
  function maat(naam) {
    var m = (_st && _st.metingen) || {};
    switch (naam) {
      case 'onderzoek-scans': return _m.scans;
      case 'onderzoek-scan-ms': return _m.scanMs;
      case 'onderzoek-ff': return _m.ff;
      case 'onderzoek-ff-trim': return _m.ffTrim;
      case 'onderzoek-bank2': return _m.bank2;
      case 'onderzoek-bankverschil':
        return m.ltft && m.ltft.b1 != null && m.ltft.b2 != null ? Math.round(Math.abs(m.ltft.b1 - m.ltft.b2) * 10) / 10 : null;
      case 'onderzoek-kaart-stationair-n': case 'onderzoek-kaart-deel-n': {
        var v = vakTelling();
        return v ? v[naam === 'onderzoek-kaart-deel-n' ? 'deel' : 'stationair'].length : null;
      }
      case 'onderzoek-kaart-afwijking': {
        var k = m.kaart, a = [];
        if (k && k.stationair && typeof m.trimStationair === 'number') a.push(Math.abs(k.stationair.trim - m.trimStationair));
        if (k && k.deel && typeof m.trim2500 === 'number') a.push(Math.abs(k.deel.trim - m.trim2500));
        return a.length ? Math.round(Math.max.apply(null, a) * 10) / 10 : null;
      }
      default: return null;
    }
  }

  // ── Toestand van het scherm ─────────────────────────────────────────
  var _st = null, _ui = { fase: 'intake', live: {}, voortgang: 0, wacht: null, antwoord: null, ai: null, aiBezig: false, intake: null };

  function stationair(t) {
    var m = '';
    try { m = (typeof detectEngineType === 'function') ? detectEngineType() : ''; } catch (e) { console.warn('PLOnderzoek: motortype onbekend', e); }
    return (typeof plStationairUitleg === 'function') ? plStationairUitleg(m, t) : t;
  }
  function voorwaardeTekst(v) {
    return { motor_uit: 'Zet het contact aan, maar start de motor niet.',
      motor_aan: stationair('Start de motor en laat hem stationair draaien.'),
      warm: 'De motor moet op temperatuur zijn (koelwater boven 70 °C). Laat hem draaien of rijd eerst een stukje.',
      rijden: 'Deze meting gaat tijdens het rijden.' }[v] || '';
  }

  async function voorwaardeGehaald(v) {
    if (isDemo() || !v) return true;
    var rpm = await leesPid('010C');
    var g = CFG.grens;
    if (v === 'motor_uit') return rpm == null || rpm < g.uitRpm;
    if (v === 'motor_aan') return rpm != null && rpm > g.aanRpm;
    if (v === 'rijden') { var s = await leesPid('010D'); return s != null && s > g.rijKmh; }
    if (v === 'warm') { if (!(rpm > g.aanRpm)) return false; var t = await leesPid('0105'); return t != null && t >= g.warmC; }
    return true;
  }

  // Wacht op de gebruiker: een knop zet _ui.wacht.los(waarde).
  function wachtOpKnop(soort, extra) {
    return new Promise(function (los) { _ui.wacht = Object.assign({ soort: soort, los: function (w) { _ui.wacht = null; los(w); } }, extra || {}); teken(); });
  }

  async function voer(stap, st) {
    _ui.live = {}; _ui.voortgang = 0; _ui.melding = '';
    if (stap.soort === 'vraag') { var w = await wachtOpKnop('vraag'); return w === '__overslaan' ? { overgeslagen: true, reden: 'geen antwoord' } : { w: w }; }
    if (stap.soort === 'lezen') {
      if (!window.PLFoutcodes || !PLFoutcodes.leesStil) return { overgeslagen: true, reden: 'foutcodemodule niet geladen' };
      var scan = st.ctx.scan;
      if (scan) _ui.melding = 'De uitlezing van Check mijn auto wordt gebruikt.';
      else { _ui.melding = 'Bezig met uitlezen…'; teken(); scan = await PLFoutcodes.leesStil(); }
      if (!scan) return { overgeslagen: true, reden: 'de auto gaf geen antwoord' };
      _ui.melding = 'Bijstuurgeheugen en boordspanning…'; teken();
      var t0s = Date.now(), snap = await momentopname(stap.snapPids || [], stap.id);
      var uit = { scan: scan, snap: snap, kaart: kaartUitBron() };
      noteerScan(uit, Date.now() - t0s);
      return uit;
    }
    if (stap.soort === 'mode06') {
      if (!window.PLM06 || typeof PLM06.scan !== 'function') return { overgeslagen: true, reden: 'mode 06-module niet geladen' };
      if (isDemo()) return { overgeslagen: true, reden: 'mode 06 bestaat niet in de demo' };
      _ui.melding = 'Zelftests uitlezen…'; teken();
      try { return { m06: await PLM06.scan() }; }
      catch (e) { console.warn('PLOnderzoek: mode 06 niet gelezen', e); return { overgeslagen: true, reden: 'de auto gaf geen mode 06-antwoord' }; }
    }
    // meten — eerst de voorwaarde, dan de opdracht, dan de meting
    var begin = Date.now();
    while (!(await voorwaardeGehaald(stap.voorwaarde))) {
      if (st.gestopt) return { overgeslagen: true };
      if (_ui.forceer) { _ui.forceer = false; break; }
      if (_ui.sla) { _ui.sla = false; return { overgeslagen: true, reden: 'voorwaarde niet gehaald' }; }
      _ui.melding = voorwaardeTekst(stap.voorwaarde); _ui.wachtVoorwaarde = true; teken();
      if (Date.now() - begin > CFG.voorwaardeMaxMs) return { overgeslagen: true, reden: 'voorwaarde na 3 minuten niet gehaald' };
      await pauze(1500);
    }
    _ui.wachtVoorwaarde = false;
    if (stap.opdracht) {
      var k = await wachtOpKnop('opdracht');
      if (k === '__overslaan') return { overgeslagen: true, reden: 'opdracht overgeslagen' };
    }
    var pids = stap.pids.filter(beschikbaar), ontbreekt = stap.pids.filter(function (p) { return !beschikbaar(p); });
    var reeks = {}; pids.forEach(function (p) { reeks[p] = []; });
    var duur = stap.duurMs * (isDemo() ? CFG.demoFactor : 1), t0 = Date.now();
    _ui.melding = 'Meten…';
    while (Date.now() - t0 < duur && pids.length) {
      if (st.gestopt) return { overgeslagen: true };
      if (_ui.sla) { _ui.sla = false; return { overgeslagen: true, reden: 'meting afgebroken' }; }
      for (var i = 0; i < pids.length; i++) {
        var v = await leesPid(pids[i], stap.id);
        reeks[pids[i]].push(v);
        _ui.live[pids[i]] = reeks[pids[i]];
      }
      _ui.voortgang = Math.min(1, (Date.now() - t0) / duur); teken();
      await pauze(isDemo() ? 60 : CFG.meetIntervalMs);
    }
    _ui.voortgang = 1;
    return { reeks: reeks, ontbreekt: ontbreekt };
  }

  // ── Het scherm ──────────────────────────────────────────────────────
  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };

  var CSS =
    '#plOzOv{position:fixed;inset:0;z-index:var(--z-modal,9600);background:rgba(8,11,17,.94);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plOzOv .oz-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:560px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f);color:var(--tx)}' +
    '#plOzOv .oz-kop{display:flex;align-items:center;gap:9px;margin-bottom:4px}' +
    '#plOzOv .oz-t{font:800 17px var(--f)}' +
    '#plOzOv .oz-x{margin-left:auto;background:var(--sur);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;width:34px;height:34px;font:700 15px var(--f);cursor:pointer}' +
    '#plOzOv .oz-sub{font-size:13.5px;color:var(--tx2);margin:2px 0 12px;line-height:1.45}' +
    '#plOzOv .oz-blok{background:var(--sur);border:1px solid var(--bd);border-radius:12px;padding:12px;margin-bottom:10px}' +
    '#plOzOv .oz-bh{font:800 12px var(--f);letter-spacing:.06em;text-transform:uppercase;color:var(--tx3);margin-bottom:8px}' +
    '#plOzOv .oz-chips{display:flex;flex-wrap:wrap;gap:7px}' +
    '#plOzOv .oz-chip{padding:9px 12px;border-radius:999px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font:600 13.5px var(--f);cursor:pointer}' +
    '#plOzOv .oz-chip.aan{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plOzOv .oz-k{flex:1 1 140px;padding:12px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:700 14px var(--f);cursor:pointer}' +
    '#plOzOv .oz-k.hoofd{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);color:#fff}' +
    '#plOzOv .oz-k:disabled{opacity:.45;cursor:not-allowed}' +
    '#plOzOv .oz-knoppen{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
    // de tijdlijn: het plan van aanpak
    '#plOzOv .oz-lijn{position:relative;padding-left:22px}' +
    '#plOzOv .oz-lijn:before{content:"";position:absolute;left:8px;top:6px;bottom:6px;width:2px;background:var(--bd)}' +
    '#plOzOv .oz-ls{position:relative;padding:4px 0 8px;font-size:13.5px;line-height:1.4}' +
    '#plOzOv .oz-ls:before{content:"";position:absolute;left:-19px;top:8px;width:12px;height:12px;border-radius:50%;background:var(--sur2);border:2px solid var(--bd)}' +
    '#plOzOv .oz-ls.af:before{background:var(--gn,#22c55e);border-color:var(--gn,#22c55e)}' +
    '#plOzOv .oz-ls.nu:before{background:var(--bl,#3b82f6);border-color:var(--bl,#3b82f6);animation:ozPuls 1.2s infinite}' +
    '#plOzOv .oz-ls.straks{color:var(--tx3)}' +
    '#plOzOv .oz-ls.sprong{color:var(--or,#f59e0b);font-weight:700}' +
    '#plOzOv .oz-ls small{display:block;color:var(--tx3);font-size:12px}' +
    '@keyframes ozPuls{0%{box-shadow:0 0 0 0 rgba(59,130,246,.6)}100%{box-shadow:0 0 0 10px rgba(59,130,246,0)}}' +
    // de huidige stap
    '#plOzOv .oz-stap{border-color:var(--bl,#3b82f6)}' +
    '#plOzOv .oz-st{font:800 16px var(--f);display:flex;gap:8px;align-items:center}' +
    '#plOzOv .oz-waarom{font-size:13px;color:var(--tx2);margin:6px 0;line-height:1.45}' +
    '#plOzOv .oz-opdr{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.45);border-radius:10px;padding:10px;font-size:14px;line-height:1.45;margin:8px 0}' +
    '#plOzOv .oz-meld{font-size:13px;color:var(--tx2);margin-top:6px}' +
    '#plOzOv .oz-voort{height:6px;background:var(--sur2);border-radius:3px;overflow:hidden;margin-top:8px}' +
    '#plOzOv .oz-voort i{display:block;height:100%;background:var(--bl,#3b82f6);transition:width .3s}' +
    '#plOzOv .oz-spark{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;margin-top:8px;font-size:12.5px}' +
    '#plOzOv .oz-spark svg{width:100%;height:30px}' +
    // verdenkingen
    '#plOzOv .oz-v{display:grid;grid-template-columns:1fr 92px;gap:3px 10px;align-items:center;padding:6px 0;border-top:1px solid var(--bd);cursor:pointer}' +
    '#plOzOv .oz-v:first-of-type{border-top:0}' +
    '#plOzOv .oz-vn{font-size:13.5px}' +
    '#plOzOv .oz-vs{font-size:11.5px;text-align:right;color:var(--tx3)}' +
    '#plOzOv .oz-vb{grid-column:1/3;height:6px;background:var(--sur2);border-radius:3px;overflow:hidden}' +
    '#plOzOv .oz-vb i{display:block;height:100%;transition:width .6s ease,background .6s}' +
    '#plOzOv .oz-v.uit .oz-vn{text-decoration:line-through;color:var(--tx3)}' +
    '#plOzOv .oz-v.nieuw .oz-vn:after{content:" · nieuw";color:var(--or,#f59e0b);font-size:11px;font-weight:700}' +
    '#plOzOv .oz-bw{grid-column:1/3;font-size:12px;color:var(--tx2);padding:2px 0 4px 8px;line-height:1.45}' +
    '#plOzOv .oz-plus{color:var(--rd,#ef4444)}#plOzOv .oz-min{color:var(--gn,#22c55e)}' +
    '#plOzOv .oz-concl{border-color:var(--gn,#22c55e)}' +
    '#plOzOv .oz-concl.niets{border-color:var(--bd)}' +
    '#plOzOv .oz-ai{background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.45);border-radius:10px;padding:10px;font-size:13.5px;line-height:1.45;margin-top:8px}' +
    '#plOzOv .oz-tel{margin-left:4px;font-weight:700;color:var(--tx2)}' +
    '#plOzOv .oz-scheidt{color:var(--tx2);font-weight:600}' +
    '#plOzOv .oz-i{padding:7px 0;border-top:1px solid var(--bd);font-size:13px;line-height:1.45}' +
    '#plOzOv .oz-i:first-of-type{border-top:0}' +
    '#plOzOv .oz-i div{color:var(--tx2)}' +
    '#plOzOv .oz-i.let b{color:var(--or,#f59e0b)}' +
    '#plOzOv textarea{width:100%;min-height:60px;background:var(--sur2);color:var(--tx);border:1px solid var(--bd);border-radius:8px;padding:8px;font:14px var(--f);box-sizing:border-box}';

  function zorgOv() {
    var ov = document.getElementById('plOzOv');
    if (ov) return ov;
    if (!document.getElementById('plOzCss')) {
      var s = document.createElement('style'); s.id = 'plOzCss'; s.textContent = CSS; document.head.appendChild(s);
    }
    ov = document.createElement('div'); ov.id = 'plOzOv';
    ov.innerHTML = '<div class="oz-doos" id="plOzDoos"></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', klik);
    return ov;
  }

  var _open = {};   // welke verdenkingen uitgeklapt staan
  var _nieuw = {};  // welke er tijdens het onderzoek bij kwamen

  function spark(a) {
    var g = getallen(a); if (g.length < 2) return '<svg></svg>';
    var lo = Math.min.apply(null, g), hi = Math.max.apply(null, g); if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    var n = a.length, pts = [];
    a.forEach(function (v, i) { if (typeof v === 'number') pts.push((i / (n - 1) * 200).toFixed(1) + ',' + (28 - (v - lo) / (hi - lo) * 26).toFixed(1)); });
    return '<svg viewBox="0 0 200 30" preserveAspectRatio="none"><polyline fill="none" stroke="var(--bl,#3b82f6)" stroke-width="2" points="' + pts.join(' ') + '"/></svg>';
  }
  function pidNaam(p) { try { var d = getPidDef(p); return d ? d.name : p; } catch (e) { console.warn('PLOnderzoek: getPidDef', e); return p; } }
  function pidEenheid(p) { try { var d = getPidDef(p); return d ? d.unit : ''; } catch (e) { console.warn('PLOnderzoek: getPidDef', e); return ''; } }

  function kleur(score) {
    if (score >= CFG.bevestigd) return 'var(--rd,#ef4444)';
    if (score >= 1.5) return 'var(--or,#f59e0b)';
    if (score <= -1.5) return 'var(--gn,#22c55e)';
    return 'var(--tx3,#8a93a6)';
  }
  var STATUSTEKST = { bevestigd: 'bevestigd', waarschijnlijk: 'waarschijnlijk', open: 'open', onwaarschijnlijk: 'onwaarschijnlijk', uitgesloten: 'uitgesloten' };

  function tekenIntake() {
    var i = _ui.intake;
    var h = '<div class="oz-kop"><div class="oz-t">🧭 Volledig onderzoek</div><button class="oz-x" data-a="sluit">✕</button></div>' +
      '<div class="oz-sub">Eerst lees ik uit wat de auto zelf al weet: foutcodes, het freeze frame, het bijstuurgeheugen per bank en je laatste rit. Daarna meet ik alleen nog wat onderscheid maakt tussen de oorzaken die overblijven.</div>';
    h += '<div class="oz-blok"><div class="oz-bh">Wat merk je? (meer mag)</div><div class="oz-chips">';
    Object.keys(KLACHTEN).forEach(function (k) {
      h += '<button class="oz-chip' + (i.klachten.indexOf(k) >= 0 ? ' aan' : '') + '" data-a="klacht" data-k="' + k + '">' + KLACHTEN[k].icoon + ' ' + esc(KLACHTEN[k].naam) + '</button>';
    });
    h += '</div>';
    if (i.klachtTekst) h += '<div class="oz-meld">Je schreef: “' + esc(i.klachtTekst) + '”</div>';
    if ((i.codes || []).length) h += '<div class="oz-meld">Je gaf de foutcode' + (i.codes.length === 1 ? '' : 's') + ' ' + esc(i.codes.join(', ')) + ' op. Die tellen als aanwijzing; wat de auto zelf opslaat, lees ik straks uit.</div>';
    h += '</div><div class="oz-blok"><div class="oz-bh">Wanneer speelt het? (meer mag)</div><div class="oz-chips">';
    Object.keys(WANNEER).forEach(function (k) {
      h += '<button class="oz-chip' + (i.wanneer.indexOf(k) >= 0 ? ' aan' : '') + '" data-a="wanneer" data-w="' + k + '">' + WANNEER[k].icoon + ' ' + esc(WANNEER[k].naam) + '</button>';
    });
    h += '</div><div class="oz-meld">Het moment scheidt oorzaken die bij dezelfde klacht horen: overslaan bij optrekken is meestal ontsteking, alleen stationair meestal lucht.</div>';
    h += '</div><div class="oz-blok"><div class="oz-bh">Is er onlangs iets aan de auto gedaan?</div><div class="oz-chips">';
    VERVANGEN.forEach(function (v) {
      h += '<button class="oz-chip' + (i.vervangen.indexOf(v) >= 0 ? ' aan' : '') + '" data-a="vervangen" data-k="' + esc(v) + '">' + esc(v) + '</button>';
    });
    h += '</div><div class="oz-meld">Een vervangen onderdeel dat niet is ingeleerd lijkt op een kapotte sensor. Dit helpt dat te onderscheiden.</div></div>';
    var kan = isVerbonden() || isDemo();
    if (!kan) h += '<div class="oz-blok">Niet verbonden. Steek de adapter in de OBD-poort, zet het contact aan en verbind — of probeer de demo.</div>';
    h += '<div class="oz-knoppen"><button class="oz-k hoofd" data-a="begin"' + (kan && i.klachten.length ? '' : ' disabled') + '>▶ Onderzoek starten</button></div>';
    return h;
  }
  var VERVANGEN = ['accu', 'gasklep', 'injector', 'katalysator', 'lambdasonde', 'luchtmassameter', 'roetfilter', 'egr', 'ecu'];

  function tekenPlan(st, stap) {
    var h = '<div class="oz-blok"><div class="oz-bh">Plan van aanpak</div><div class="oz-lijn">';
    st.log.forEach(function (l) {
      if (l.soort === 'start') return;
      if (l.soort === 'verbreed' || l.soort === 'kennis') { h += '<div class="oz-ls sprong">↪ ' + esc(l.t) + '</div>'; return; }
      var kort = l.t || l.bewijs.filter(function (b) { return b.h; }).slice(0, 2).map(function (b) { return b.t; }).join('; ') || (l.bewijs[0] || {}).t || '';
      h += '<div class="oz-ls af">' + esc(STAP[l.stap].icoon + ' ' + l.titel) + (l.antwoord ? ' — ' + esc(l.antwoord) : '') + '<small>' + esc(kort) + '</small></div>';
      if (l.nieuw && l.nieuw.length) h += '<div class="oz-ls sprong">↪ Nieuwe richting: ' + esc(l.nieuw.map(function (x) { return VERDENKINGEN[x].naam; }).join(', ')) + '</div>';
    });
    if (stap) h += '<div class="oz-ls nu"><b>' + esc(stap.icoon + ' ' + stap.titel) + '</b></div>';
    if (!st.klaar) vooruit(st, stap ? 4 : 3).filter(function (s) { return !stap || s.id !== stap.id; }).slice(0, 3).forEach(function (s) {
      h += '<div class="oz-ls straks">' + esc(s.icoon + ' ' + s.titel) + '</div>';
    });
    return h + '</div></div>';
  }

  function tekenStap(st, stap) {
    var h = '<div class="oz-blok oz-stap"><div class="oz-st">' + esc(stap.icoon) + ' ' + esc(stap.titel) + '</div>' +
      '<div class="oz-waarom">' + esc(stap.waarom) + '</div>';
    var sch = scheidt(st, stap);
    if (sch.length) h += '<div class="oz-meld oz-scheidt">Scheidt: ' + esc(sch.join(' · ')) + '</div>';
    var w = _ui.wacht;
    if (stap.soort === 'vraag' && w) {
      h += '<div class="oz-knoppen">';
      stap.opties.forEach(function (o) { h += '<button class="oz-k" data-a="antwoord" data-k="' + esc(o.w) + '">' + esc(o.t) + '</button>'; });
      h += '</div><div class="oz-knoppen"><button class="oz-k" data-a="antwoord" data-k="__overslaan">Weet ik niet</button></div>';
      return h + '</div>';
    }
    if (_ui.wachtVoorwaarde) h += '<div class="oz-opdr">⏳ ' + esc(_ui.melding) + '</div><div class="oz-knoppen"><button class="oz-k" data-a="forceer">Het klopt, ga door</button><button class="oz-k" data-a="sla">Stap overslaan</button></div>';
    else if (w && w.soort === 'opdracht') h += '<div class="oz-opdr">👉 ' + esc(stap.opdracht) + '</div><div class="oz-knoppen"><button class="oz-k hoofd" data-a="opdracht" data-k="ok">Ik doe het nu — meten</button><button class="oz-k" data-a="opdracht" data-k="__overslaan">Overslaan</button></div>';
    else {
      if (stap.opdracht && _ui.voortgang > 0) h += '<div class="oz-opdr">👉 ' + esc(stap.opdracht) + '</div>';
      if (_ui.melding) h += '<div class="oz-meld">' + esc(_ui.melding) + '</div>';
      if (stap.soort === 'meten') {
        h += '<div class="oz-voort"><i style="width:' + Math.round(_ui.voortgang * 100) + '%"></i></div><div class="oz-spark">';
        Object.keys(_ui.live).forEach(function (p) {
          var a = _ui.live[p], laatst = getallen(a).slice(-1)[0];
          h += '<div>' + esc(pidNaam(p)) + spark(a) + '</div><div><b>' + (laatst == null ? '—' : esc(r1(laatst))) + '</b> ' + esc(pidEenheid(p)) + '</div>';
        });
        h += '</div><div class="oz-knoppen"><button class="oz-k" data-a="sla">Meting afbreken</button></div>';
      }
    }
    return h + '</div>';
  }

  // Welke open verdenkingen deze stap kan scheiden, sterkste eerst.
  function scheidt(st, stap) {
    return Object.keys(stap.test || {}).filter(function (h) { return open(st, h); })
      .sort(function (a, b) { return stap.test[b] - stap.test[a]; })
      .slice(0, 4).map(function (h) { return VERDENKINGEN[h].naam; });
  }
  function telling(x) {
    var v = x.bewijs.filter(function (b) { return b.d > 0; }).length, t = x.bewijs.filter(function (b) { return b.d < 0; }).length;
    return v || t ? ' <span class="oz-tel">' + (v ? '▲' + v : '') + (v && t ? ' ' : '') + (t ? '▼' + t : '') + '</span>' : '';
  }
  function sterkste(x) {
    var b = null;
    x.bewijs.forEach(function (y) { if (!b || Math.abs(y.d) > Math.abs(b.d)) b = y; });
    return b;
  }
  function tekenInzichten(st) {
    var l = inzichten(st); if (!l.length) return '';
    var h = '<div class="oz-blok oz-inz"><div class="oz-bh">Wat de auto al wist</div>';
    l.forEach(function (x) { h += '<div class="oz-i ' + x.niveau + '"><b>' + (x.niveau === 'let' ? '⚠️ ' : 'ℹ️ ') + esc(x.kop) + '</b><div>' + esc(x.t) + '</div></div>'; });
    return h + '</div>';
  }

  function tekenVerdenkingen(st) {
    var hs = Object.keys(st.v).sort(function (a, b) { return st.v[b].score - st.v[a].score; });
    var h = '<div class="oz-blok"><div class="oz-bh">Oorzakenbord</div>';
    hs.forEach(function (id) {
      var x = st.v[id], s = status(x.score), uit = s === 'uitgesloten' || s === 'onwaarschijnlijk';
      h += '<div class="oz-v' + (uit ? ' uit' : '') + (_nieuw[id] ? ' nieuw' : '') + '" data-a="v" data-k="' + id + '">' +
        '<div class="oz-vn">' + esc(VERDENKINGEN[id].naam) + (x.bekend ? ' <small>· bekend bij dit merk</small>' : '') + '</div><div class="oz-vs">' + STATUSTEKST[s] + telling(x) + '</div>' +
        '<div class="oz-vb"><i style="width:' + Math.round(balk(x.score) * 100) + '%;background:' + kleur(x.score) + '"></i></div>';
      var sterk = sterkste(x);
      if (!_open[id] && sterk && !uit) h += '<div class="oz-bw"><div class="' + (sterk.d > 0 ? 'oz-plus' : 'oz-min') + '">' + (sterk.d > 0 ? '▲ ' : '▼ ') + esc(sterk.t) + '</div></div>';
      if (_open[id]) {
        h += '<div class="oz-bw">' + (x.bewijs.length ? x.bewijs.map(function (b) { return '<div class="' + (b.d > 0 ? 'oz-plus' : 'oz-min') + '">' + (b.d > 0 ? '▲ ' : '▼ ') + esc(b.t) + '</div>'; }).join('') : 'Nog niets gemeten.') + '</div>';
      }
      h += '</div>';
    });
    return h + '<div class="oz-meld">Onder elke oorzaak het zwaarste bewijs; tik voor alles. ▲ wijst ernaartoe, ▼ ervan af.</div></div>';
  }

  function tekenConclusie(st) {
    var c = st.uitkomst || conclusie(st);
    var h = '<div class="oz-blok oz-concl' + (c.oordeel === 'niets' ? ' niets' : '') + '"><div class="oz-bh">Conclusie</div>';
    if (c.oordeel === 'niets') {
      h += '<div class="oz-st">Geen oorzaak gevonden die via de diagnosepoort te zien is</div>' +
        '<div class="oz-waarom">Ik heb ' + st.gedaan.length + ' stappen gedaan en ' + c.uitgesloten.length + ' verdenkingen kunnen uitsluiten. Dat is ook een uitkomst: wat overblijft is mechanisch, of treedt alleen op onder omstandigheden die ik nu niet kon nabootsen.</div>';
    }
    c.top.forEach(function (x, i) {
      h += '<div class="oz-st" style="margin-top:' + (i ? 10 : 0) + 'px">' + (x.status === 'bevestigd' ? '🎯 ' : '🔎 ') + esc(x.naam) + '</div>' +
        '<div class="oz-waarom">' + (x.status === 'bevestigd' ? 'Sterk onderbouwd' : 'Aanwijzing') + ': ' +
        esc(x.bewijs.filter(function (b) { return b.d > 0; }).map(function (b) { return b.t; }).join('; ')) + '</div>' +
        '<div class="oz-meld"><b>Vervolg:</b> ' + esc(x.vervolg) + '</div>';
      if (x.id === 'software' && st.metingen.software) st.metingen.software.forEach(function (a) {
        h += '<div class="oz-meld">' + esc(a.inleren) + (a.tools.length ? ' Software: ' + esc(a.tools.join(', ')) + '.' : '') + '</div>';
        if (a.waarschuwing) h += '<div class="oz-meld" style="color:var(--or,#f59e0b)">' + esc(a.waarschuwing) + '</div>';
      });
    });
    if (c.uitgesloten.length) h += '<div class="oz-meld" style="margin-top:10px"><b>Uitgesloten:</b> ' + esc(c.uitgesloten.map(function (x) { return x.naam; }).join(', ')) + '</div>';
    var tegen = nogOpen(c);
    if (tegen.length) h += '<div class="oz-meld" style="margin-top:6px"><b>Nog open, met aanwijzingen:</b> ' + esc(tegen.map(function (x) { return x.naam + ' (' + x.bewijs.map(function (b) { return b.t; }).join('; ') + ')'; }).join(' · ')) + '</div>';
    if (st.m06 && window.PLM06 && typeof PLM06.render === 'function')
      h += '<details class="oz-m06" style="margin-top:10px"><summary>🔬 Alle zelftests (mode 06)</summary><div style="overflow-x:auto">' + PLM06.render(st.m06) + '</div></details>';
    h += '<div class="oz-meld" style="margin-top:8px">Dit is een onderbouwde aanwijzing uit metingen, geen vervangen onderdeel. Laat een monteur het bevestigen voor je onderdelen koopt.</div>';
    if (_ui.ai) h += '<div class="oz-ai">🤖 ' + esc(_ui.ai) + '</div>';
    h += '<div class="oz-knoppen"><button class="oz-k hoofd" data-a="bewaar">💾 Bewaren</button>' +
      '<button class="oz-k" data-a="ai"' + (_ui.aiBezig ? ' disabled' : '') + '>' + (_ui.aiBezig ? '⏳ AI denkt na…' : '🤖 Tweede mening (AI)') + '</button>' +
      '<button class="oz-k" data-a="opnieuw">Opnieuw</button></div></div>';
    return h;
  }

  function teken() {
    var d = document.getElementById('plOzDoos'); if (!d) return;
    var h;
    if (_ui.fase === 'intake') h = tekenIntake();
    else {
      var st = _st, stap = st.huidig ? STAP[st.huidig] : null;
      h = '<div class="oz-kop"><div class="oz-t">🧭 Onderzoek' + (st.klaar ? ' — klaar' : '') + '</div><button class="oz-x" data-a="sluit">✕</button></div>' +
        '<div class="oz-sub">' + esc(st.ctx.klachten.map(function (k) { return KLACHTEN[k].icoon + ' ' + KLACHTEN[k].naam; }).join(' · ')) +
        ' · stap ' + st.gedaan.length + (stap ? ' → ' + (st.gedaan.length + 1) : '') + (isDemo() ? ' · demo' : '') + '</div>';
      if (st.klaar) h += tekenConclusie(st);
      else if (stap) h += tekenStap(st, stap);
      // Sinds 16-10-2026 voor iedereen: wie een OBD-adapter koopt snapt de
      // trims, en het bord met de meetwaarden ís de uitkomst bij een lastig
      // probleem. Tot dan was het werkgereedschap voor de garagemodus.
      h += tekenInzichten(st) + tekenVerdenkingen(st) + tekenPlan(st, st.klaar ? null : stap);
      if (!st.klaar) h += '<div class="oz-knoppen"><button class="oz-k" data-a="stop">⏹ Stoppen en conclusie</button></div>';
    }
    d.innerHTML = h;
  }

  function klik(e) {
    var b = e.target.closest ? e.target.closest('[data-a]') : null; if (!b) return;
    var a = b.getAttribute('data-a'), k = b.getAttribute('data-k');
    if (a === 'sluit') return sluit();
    if (a === 'klacht' || a === 'vervangen') {
      var l = a === 'klacht' ? _ui.intake.klachten : _ui.intake.vervangen, i = l.indexOf(k);
      if (i >= 0) l.splice(i, 1); else l.push(k);
      return teken();
    }
    if (a === 'wanneer') {
      var lw = _ui.intake.wanneer, w = b.getAttribute('data-w'), j = lw.indexOf(w);
      if (j >= 0) lw.splice(j, 1); else lw.push(w);
      return teken();
    }
    if (a === 'begin') return begin();
    if ((a === 'antwoord' || a === 'opdracht') && _ui.wacht) return _ui.wacht.los(k);
    if (a === 'forceer') { _ui.forceer = true; return; }
    if (a === 'sla') { _ui.sla = true; if (_ui.wacht) _ui.wacht.los('__overslaan'); return; }
    if (a === 'v') { _open[k] = !_open[k]; return teken(); }
    if (a === 'stop') { if (_st) { _st.gestopt = true; if (_ui.wacht) _ui.wacht.los('__overslaan'); } return; }
    if (a === 'bewaar') return bewaar();
    if (a === 'ai') return tweedeMening();
    if (a === 'opnieuw') { _ui.fase = 'intake'; _st = null; return teken(); }
  }

  function isGarage() {
    try { return !!(window.PLNav && PLNav.garage()); } catch (e) { console.warn('PLOnderzoek: garagemodus onbekend', e); return false; }
  }

  function vehicle() {
    try { return (typeof getVehicle === 'function' && getVehicle()) || {}; } catch (e) { console.warn('PLOnderzoek: voertuig onbekend', e); return {}; }
  }
  function liters(v) {
    var cc = parseInt(v.cilinderinhoud, 10); if (!isNaN(cc) && cc >= 600 && cc <= 8000) return cc / 1000;
    var m = String(v.motor || '').match(/(^|[^\d.])(\d\.\d)(?![\d.])/); if (m) { var l = parseFloat(m[2]); if (l >= 0.6 && l <= 8) return l; }
    return null;
  }

  async function begin() {
    var i = _ui.intake, v = vehicle();
    _open = {}; _nieuw = {}; _ui.ai = null;
    _st = nieuw({ klachten: i.klachten.slice(), klachtTekst: i.klachtTekst, lampje: i.lampje, meting: i.meting,
      merk: v.merk, brandstof: v.brandstof, liters: liters(v), vervangen: i.vervangen.slice(), wanneer: i.wanneer.slice(), codesHand: (i.codes || []).slice(), scan: i.scan, beschikbaar: beschikbaar,
      garage: isGarage() });
    var start = Object.keys(_st.v);
    _ui.fase = 'loopt'; teken();
    var st = _st;
    await draai(st, voer, function (s) {
      Object.keys(s.v).forEach(function (h) { if (start.indexOf(h) < 0) _nieuw[h] = true; });
      if (_st === s) teken();
    });
    if (_st !== st) return;
    try { if (typeof registerSessionReport === 'function') registerSessionReport({ type: 'onderzoek', title: 'Volledig onderzoek', text: alsTekst(st) }); }
    catch (e) { console.warn('PLOnderzoek: archiveren faalde', e); }
    teken();
  }

  function bewaar() {
    if (!_st) return;
    var t = alsTekst(_st);
    try { if (typeof download === 'function') { download('PidLane-onderzoek-' + new Date().toISOString().slice(0, 10) + '.txt', t); return; } }
    catch (e) { console.warn('PLOnderzoek: opslaan faalde', e); }
    if (typeof showToast === 'function') showToast('Opslaan is hier niet beschikbaar');
  }

  /* De AI krijgt het hele verloop en mag kiezen uit de stappen die er nog
     zijn, of één vraag stellen. Hij verzint geen metingen: wat hij voorstelt
     moet een stap uit STAPPEN zijn, anders wordt het alleen als tekst getoond. */
  function aiPrompt(st) {
    var c = st.uitkomst || conclusie(st);
    var rest = STAPPEN.filter(function (s) { return st.gedaan.indexOf(s.id) < 0; }).map(function (s) { return s.id + ': ' + s.titel; });
    return 'Je bent een ervaren automonteur. Hieronder staat een gestructureerd OBD-onderzoek van PidLane. ' +
      'Geef in maximaal 90 woorden, in het Nederlands, een tweede mening: klopt de conclusie, wat is gemist, en wat is de logische volgende stap. ' +
      'Verzin geen meetwaarden. Als een van de nog niet gedane stappen helpt, noem dan het id.\n\n' + alsTekst(st) +
      '\n\nNog niet gedane stappen:\n' + rest.join('\n') + '\n\nVoertuig: ' + (st.ctx.merk || 'onbekend') + ', brandstof ' + (st.ctx.brandstof || 'onbekend') +
      '.\nHuidig oordeel: ' + c.oordeel;
  }
  async function tweedeMening() {
    if (!_st || _ui.aiBezig) return;
    if (isDemo()) { _ui.ai = 'In de demo vraag ik de AI niets: het antwoord zou over een verzonnen auto gaan.'; return teken(); }
    if (typeof apiFetch !== 'function') { _ui.ai = 'De AI is in deze versie niet beschikbaar.'; return teken(); }
    _ui.aiBezig = true; teken();
    try { _ui.ai = String(await apiFetch(aiPrompt(_st), 700, null, null, { meet: false }) || '').trim() || 'De AI gaf geen antwoord.'; }
    catch (e) { console.warn('PLOnderzoek: AI faalde', e); _ui.ai = 'De AI is nu niet bereikbaar: ' + (e.message || e); }
    finally { _ui.aiBezig = false; teken(); }
  }

  /* open(opt): opt.klacht (vrije tekst), opt.meting, opt.lampje uit de wizard;
     opt.scan uit Check mijn auto (dan wordt er niet nog eens uitgelezen);
     opt.controle = er is geen klacht, begin met de brede ronde (#434). */
  function openScherm(opt) {
    opt = opt || {};
    if (_st && !_st.klaar && !_st.gestopt) { zorgOv().style.display = 'flex'; teken(); return; }
    var ks = klachtUitTekst(opt.klacht);
    // De tegels uit de wizard (20-10-2026) tellen naast wat de tekst herkent.
    (opt.klachten || []).forEach(function (k) { if (KLACHTEN[k] && ks.indexOf(k) < 0) ks.push(k); });
    if (opt.lampje === 'aan' && ks.indexOf('lampje') < 0) ks.push('lampje');
    if (opt.scan && ks.indexOf('lampje') < 0) {
      var c = opt.scan.codes || {};
      if ((c.bevestigd || []).length || (c.permanent || []).length) ks.push('lampje');
    }
    // Zonder klacht, uit een groene check of "ik merk niks" (#434): de brede
    // ronde. Staat er tóch een klacht, dan wint die — en controle valt weg.
    if (opt.controle && !ks.length) ks.push('controle');
    // Wat in het onderhoudslogboek staat, staat al aan (#426); de klant kan
    // het uitzetten of er iets bij tikken.
    var uitLog = (typeof plVervangenRecent === 'function' ? plVervangenRecent() : [])
      .filter(function (x) { return VERVANGEN.indexOf(x) >= 0; });
    _ui = { fase: 'intake', live: {}, voortgang: 0, wacht: null, ai: null, aiBezig: false,
      intake: { klachten: ks, klachtTekst: opt.klacht || '', lampje: opt.lampje, meting: opt.meting, vervangen: uitLog,
        wanneer: (opt.wanneer || []).filter(function (w) { return !!WANNEER[w]; }), codes: (opt.codes || []).slice(), scan: opt.scan || null } };
    _st = null;
    zorgOv().style.display = 'flex';
    teken();
  }
  function sluit() {
    var ov = document.getElementById('plOzOv'); if (ov) ov.style.display = 'none';
    // Een lopend onderzoek stopt bij sluiten: er hangt een opdracht of meting
    // aan die zonder scherm niemand meer uitvoert.
    if (_st && !_st.klaar) { _st.gestopt = true; if (_ui.wacht) _ui.wacht.los('__overslaan'); }
  }

  window.PLOnderzoek = {
    open: openScherm,
    sluit: sluit,
    staat: function () { return _st; },
    // pure kern — voor test-onderzoek.js
    KLACHTEN: KLACHTEN, VERDENKINGEN: VERDENKINGEN, STAPPEN: STAPPEN, CODEREGELS: CODEREGELS, cfg: CFG,
    beoordeelMode06: beoordeelMode06,
    KENNIS: KENNIS, kennisNaarVerdenking: kennisNaarVerdenking,
    WANNEER: WANNEER, beoordeelFreeze: beoordeelFreeze, beoordeelSnap: beoordeelSnap, trimKaart: trimKaart,
    beoordeelKaart: beoordeelKaart, inzichten: inzichten, trimVakken: trimVakken,
    maat: maat, _noteerScan: noteerScan, _momentopname: momentopname, _zetStaat: function (st) { _st = st; },
    klachtUitTekst: klachtUitTekst, nieuw: nieuw, volgende: volgende, vooruit: vooruit, verwerk: verwerk,
    verbreed: verbreed, conclusie: conclusie, status: status, draai: draai, alsTekst: alsTekst,
    // Voor PLSamenhang (#446): een verdenking in spel zetten, en de
    // cilinderinhoud uit het voertuig, zoals het onderzoek die zelf leest.
    speel: speel, liters: liters,
    demoWaarde: demoWaarde, _voer: voer, _ui: function () { return _ui; }
  };
})();
