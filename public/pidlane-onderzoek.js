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
  var BREED = ['valselucht', 'maf', 'misfire', 'injector', 'lambda', 'thermostaat', 'koelsensor', 'accu', 'laad', 'turbo', 'egr', 'software'];

  // ── Hulpjes voor reeksen ────────────────────────────────────────────
  function getallen(a) { return (a || []).filter(function (v) { return typeof v === 'number' && !isNaN(v); }); }
  function gem(a) { a = getallen(a); if (!a.length) return null; var s = 0; a.forEach(function (v) { s += v; }); return s / a.length; }
  function sprei(a) { a = getallen(a); if (a.length < 2) return null; return Math.max.apply(null, a) - Math.min.apply(null, a); }
  function max(a) { a = getallen(a); return a.length ? Math.max.apply(null, a) : null; }
  function genoeg(a, n) { return getallen(a).length >= (n || 5); }
  function r1(v) { return v == null ? '?' : (Math.round(v * 10) / 10).toLocaleString('nl'); }
  // Totale brandstoftrim van bank 1: kort + lang. Dat is wat de ECU werkelijk
  // bijstuurt; alleen de lange trim mist een lek dat net is ontstaan.
  function trim(u) {
    var k = gem(u.reeks['0106']), l = gem(u.reeks['0107']);
    if (k == null && l == null) return null;
    return (k || 0) + (l || 0);
  }

  // ── De stappen ──────────────────────────────────────────────────────
  // soort: lezen (foutcodes), meten (live), vraag (de gebruiker antwoordt).
  // test: welke verdenkingen deze stap kan scheiden, en hoe sterk (0–3).
  // voorwaarde: motor_uit | motor_aan | warm. opdracht: wat de gebruiker
  // tijdens het meten doet. beoordeel(u, st) → [{h, d, t}]: verdenking,
  // gewicht (+ bevestigt, − sluit uit) en de tekst met de meetwaarde.
  var STAPPEN = [
    { id: 'codes', soort: 'lezen', titel: 'Foutcodes en zelftests uitlezen', icoon: '🔍',
      waarom: 'Wat de auto zelf al gevonden heeft, gaat voor alles. Het kost tien seconden en wijst vaak meteen een richting.',
      test: { misfire: 2, lambda: 2, kat: 2, maf: 1.5, valselucht: 1, egr: 1.5, dpf: 1.5, software: 2, thermostaat: 1.5, koelsensor: 1, laad: 1, turbo: 1, injector: 0.5 },
      altijdEerst: true,
      beoordeel: beoordeelCodes },

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
      waarom: 'Met draaiende motor hoort de dynamo tussen 13,4 en 14,8 V te leveren.',
      voorwaarde: 'motor_aan', pids: ['0142', '010C'], duurMs: 15000,
      test: { laad: 2.5, accu: 0.5 },
      beoordeel: function (u) {
        var v = gem(u.reeks['0142']); if (!genoeg(u.reeks['0142'], 4)) return [];
        if (v < 13.0) return [{ h: 'laad', d: 2.5, t: 'laadspanning ' + r1(v) + ' V — de dynamo laadt niet genoeg' }];
        if (v > 15.0) return [{ h: 'laad', d: 2.5, t: 'laadspanning ' + r1(v) + ' V — te hoog, de regelaar knijpt niet af' }];
        if (v >= 13.4) return [{ h: 'laad', d: -2, t: 'laadspanning ' + r1(v) + ' V — de dynamo laadt' }];
        return [{ h: 'laad', d: 0.5, t: 'laadspanning ' + r1(v) + ' V — net onder de norm' }];
      } },

    { id: 'laden_belast', soort: 'meten', titel: 'Laden onder belasting', icoon: '💡',
      waarom: 'Een dynamo die stationair net genoeg haalt, zakt soms in als er stroom gevraagd wordt.',
      voorwaarde: 'motor_aan', pids: ['0142'], duurMs: 15000, na: ['laden'],
      opdracht: 'Zet de koplampen, de achterruitverwarming en de kachelventilator op vol aan. Laat de motor stationair draaien.',
      test: { laad: 2 },
      beoordeel: function (u) {
        var v = gem(u.reeks['0142']); if (!genoeg(u.reeks['0142'], 4)) return [];
        if (v < 12.9) return [{ h: 'laad', d: 2, t: 'onder belasting ' + r1(v) + ' V — de dynamo houdt het niet bij' }];
        if (v >= 13.2) return [{ h: 'laad', d: -1.5, t: 'onder belasting ' + r1(v) + ' V — de dynamo houdt het bij' }];
        return [];
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

    { id: 'temperatuur', soort: 'meten', titel: 'Koelwatertemperatuur volgen', icoon: '🌡️',
      waarom: 'Een motor die niet op temperatuur komt verbruikt meer; een die te warm wordt is een risico. Het verloop zegt welke van de twee.',
      voorwaarde: 'motor_aan', pids: ['0105', '010C'], duurMs: 60000, na: ['looptijd'],
      opdracht: 'Laat de motor stationair draaien.',
      test: { thermostaat: 2.5, koeling: 2.5, koppakking: 0.5 },
      beoordeel: function (u, st) {
        var r = [], hoog = max(u.reeks['0105']), eind = gem((u.reeks['0105'] || []).slice(-5));
        if (!genoeg(u.reeks['0105'], 5)) return r;
        if (hoog >= 106) r.push({ h: 'koeling', d: 2.5, t: 'koelwater tot ' + Math.round(hoog) + ' °C — te warm' });
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
        if (beste < 60) return [{ h: 'turbo', d: 2.5, t: 'laaddruk onder vollast maar ' + Math.round(beste) + ' kPa — te weinig voor een turbomotor' }];
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
    { re: /^P2(002|463)$/, h: 'dpf', d: 2.5, t: function (c) { return c + ' — roetfilter'; } }
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
      nietKlaar: rd ? rd.nietKlaar : [], sinds: s.sinds, dtc: alle, vervangen: st.ctx.vervangen
    });
    sw.forEach(function (a) {
      r.push({ h: 'software', d: a.sterkte === 'sterk' ? 3 : 2, t: a.naam + ': ' + a.bewijs.join('; ') });
      st.metingen.software = (st.metingen.software || []).concat([a]);
    });
    if (rd && rd.nietKlaar && rd.nietKlaar.length) r.push({ h: null, d: 0, t: rd.nietKlaar.length + ' zelftest(s) niet klaar: ' + rd.nietKlaar.join(', ') });
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
    var kop = (ks.length === 1 && ks[0] === 'controle') ? 'Geen klacht, brede controle'
      : 'Klacht: ' + ks.map(function (k) { return KLACHTEN[k] ? KLACHTEN[k].naam : k; }).join(', ');
    st.log.push({ soort: 'start', t: kop + '. ' + Object.keys(st.v).length + ' verdenkingen om te onderzoeken.' });
    return st;
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
    return !b || stap.pids.some(function (p) { return b(p); });
  }

  function waarde(st, stap) {
    var w = 0;
    Object.keys(stap.test).forEach(function (h) {
      if (!open(st, h)) return;
      w += stap.test[h] * (1 + Math.max(0, st.v[h].score) / 2);
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

  // ── Toestand van het scherm ─────────────────────────────────────────
  var _st = null, _ui = { fase: 'intake', live: {}, voortgang: 0, wacht: null, antwoord: null, ai: null, aiBezig: false, intake: null };

  function voorwaardeTekst(v) {
    return { motor_uit: 'Zet het contact aan, maar start de motor niet.',
      motor_aan: 'Start de motor en laat hem stationair draaien.',
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
      if (st.ctx.scan) { _ui.melding = 'De uitlezing van Check mijn auto wordt gebruikt.'; return { scan: st.ctx.scan }; }
      _ui.melding = 'Bezig met uitlezen…'; teken();
      var scan = await PLFoutcodes.leesStil();
      return scan ? { scan: scan } : { overgeslagen: true, reden: 'de auto gaf geen antwoord' };
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
      '<div class="oz-sub">Ik onderzoek stap voor stap: ik meet, stel vragen en geef soms een opdracht. Na elke stap kies ik zelf wat het meest oplevert — en wat niet klopt, sluit ik uit.</div>';
    h += '<div class="oz-blok"><div class="oz-bh">Wat merk je? (meer mag)</div><div class="oz-chips">';
    Object.keys(KLACHTEN).forEach(function (k) {
      h += '<button class="oz-chip' + (i.klachten.indexOf(k) >= 0 ? ' aan' : '') + '" data-a="klacht" data-k="' + k + '">' + KLACHTEN[k].icoon + ' ' + esc(KLACHTEN[k].naam) + '</button>';
    });
    h += '</div>';
    if (i.klachtTekst) h += '<div class="oz-meld">Je schreef: “' + esc(i.klachtTekst) + '”</div>';
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
      if (l.soort === 'verbreed') { h += '<div class="oz-ls sprong">↪ ' + esc(l.t) + '</div>'; return; }
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

  function tekenVerdenkingen(st) {
    var hs = Object.keys(st.v).sort(function (a, b) { return st.v[b].score - st.v[a].score; });
    var h = '<div class="oz-blok"><div class="oz-bh">Verdenkingen</div>';
    hs.forEach(function (id) {
      var x = st.v[id], s = status(x.score), uit = s === 'uitgesloten' || s === 'onwaarschijnlijk';
      h += '<div class="oz-v' + (uit ? ' uit' : '') + (_nieuw[id] ? ' nieuw' : '') + '" data-a="v" data-k="' + id + '">' +
        '<div class="oz-vn">' + esc(VERDENKINGEN[id].naam) + '</div><div class="oz-vs">' + STATUSTEKST[s] + '</div>' +
        '<div class="oz-vb"><i style="width:' + Math.round(balk(x.score) * 100) + '%;background:' + kleur(x.score) + '"></i></div>';
      if (_open[id]) {
        h += '<div class="oz-bw">' + (x.bewijs.length ? x.bewijs.map(function (b) { return '<div class="' + (b.d > 0 ? 'oz-plus' : 'oz-min') + '">' + (b.d > 0 ? '▲ ' : '▼ ') + esc(b.t) + '</div>'; }).join('') : 'Nog niets gemeten.') + '</div>';
      }
      h += '</div>';
    });
    return h + '<div class="oz-meld">Tik op een verdenking voor het bewijs. ▲ wijst ernaartoe, ▼ ervan af.</div></div>';
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
      // Een klant ziet de stap en de conclusie; het verdenkingenbord en de
      // tijdlijn zijn werkgereedschap voor de garagemodus (besluit 07-10-2026).
      if (st.ctx.garage) h += tekenVerdenkingen(st) + tekenPlan(st, st.klaar ? null : stap);
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
      merk: v.merk, brandstof: v.brandstof, liters: liters(v), vervangen: i.vervangen.slice(), scan: i.scan, beschikbaar: beschikbaar,
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
    if (opt.lampje === 'aan' && ks.indexOf('lampje') < 0) ks.push('lampje');
    if (opt.scan && ks.indexOf('lampje') < 0) {
      var c = opt.scan.codes || {};
      if ((c.bevestigd || []).length || (c.permanent || []).length) ks.push('lampje');
    }
    // Zonder klacht, uit een groene check of "ik merk niks" (#434): de brede
    // ronde. Staat er tóch een klacht, dan wint die — en controle valt weg.
    if (opt.controle && !ks.length) ks.push('controle');
    _ui = { fase: 'intake', live: {}, voortgang: 0, wacht: null, ai: null, aiBezig: false,
      intake: { klachten: ks, klachtTekst: opt.klacht || '', lampje: opt.lampje, meting: opt.meting, vervangen: [], scan: opt.scan || null } };
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
    klachtUitTekst: klachtUitTekst, nieuw: nieuw, volgende: volgende, vooruit: vooruit, verwerk: verwerk,
    verbreed: verbreed, conclusie: conclusie, status: status, draai: draai, alsTekst: alsTekst,
    // Voor PLSamenhang (#446): een verdenking in spel zetten, en de
    // cilinderinhoud uit het voertuig, zoals het onderzoek die zelf leest.
    speel: speel, liters: liters,
    demoWaarde: demoWaarde, _voer: voer, _ui: function () { return _ui; }
  };
})();
