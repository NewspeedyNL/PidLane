// ══════════════════════════════════════════════════════════════════
// pidlane-aanlevering.js — wat de AI over de MÉTING zelf te horen krijgt
// ──────────────────────────────────────────────────────────────────
// DE BEVINDING (#188, verbreed op 11-09-2026).
//
// De app weet sinds weken precies hoe goed zijn eigen meting was. PLRit telt
// loopgaten, meetgaten en herverbindingen. PLAchtergrond weet hoe lang de app
// weg was en hoeveel daarvan de meetlus werkelijk stillag. plGatDuiding() legt
// die twee naast elkaar en zegt daarmee WAARDOOR een gat er is: de app die weg
// was, of de bus die niets gaf. buildQualityReport() zegt per sensor of de
// waarde te vertrouwen is. supportedPIDs zegt wat de auto überhaupt kan.
//
// Dat alles ging tot vandaag naar precies één lezer: het testrunverslag. De
// AI-analyse — het betaalde deel, het deel waar een klant een rekening aan
// overhoudt — kreeg er niets van mee. Een rapport kon dus geschreven worden
// over een reeks met een gat van twee minuten erin, zonder dat er in de prompt
// stond dat dat gat er was, laat staan waardoor.
//
// WAT DAT KOST, IN DE VIER VORMEN DIE HET AANNEEMT:
//
//   1. Een gat in de reeks leest als een sensor die uitvalt. Een waarde die na
//      een herverbinding springt leest als een defect. Dat is een vals alarm
//      met een factuur eraan vast.
//   2. Een sensor die niet in de selectie stond leest als "niets gevonden, dus
//      in orde". Dat is het spiegelbeeld: een gemist defect, en het ergere van
//      de twee.
//   3. De vraag zelf stond nergens. Elk van de twintig aanroepplekken schreef
//      met de hand in proza op wat er geanalyseerd moest worden, en de een deed
//      dat vollediger dan de ander.
//   4. Het DATAKWALITEIT-blok ging mee als de aanroeper eraan dacht. Dat is
//      geen dekking maar een gewoonte, en die was op vier van de twintig
//      plekken niet aanwezig.
//
// DE OPLOSSING IS GEEN ZESDE PROMPTREGEL MAAR ÉÉN EIGENAAR. Deze module is de
// enige plek die antwoord geeft op "wat weet de AI over de kwaliteit van deze
// meting". Hij hangt op één punt in — in apiFetch(), naast de rijsituatie en de
// meetcontext — zodat geen aanroepplek hem kan vergeten. Dat is dezelfde vorm
// als pidlane-achtergrond.js koos voor de vijf visibilitychange-luisteraars:
// de deelnemers blijven hun eigen werk doen, het OORDEEL staat op één plek.
//
// ──────────────────────────────────────────────────────────────────
// DRIE REGELS DIE HIER NIET BUIGEN
//
// NIET GEMETEN IS GEEN NUL. Ontbreekt PLRit, dan is het aantal gaten `null` en
// niet 0. Liep de hartslag niet, dan is de stilte `null` en niet 0. Is
// supportedPIDs leeg, dan weten we niet of de auto een sensor kan en zeggen we
// dat, in plaats van hem als "niet ondersteund" af te schrijven. Dat verschil
// liet #18 anderhalve week een verkeerd getal rapporteren, en het is hier
// dubbel zo duur: een nul die "niets aan de hand" betekent gaat rechtstreeks
// een klantrapport in.
//
// HET OORDEEL WORDT NIET NAGEBOUWD. Welk gat van de achtergrond kwam en welk
// van de bus staat in plGatDuiding()/plMeetgatDuiding() in pidlane-testrun.js.
// Deze module roept die functies aan en gebruikt hun SPLITSING (lijst/buiten);
// alleen de zin eromheen is anders, want die is hier voor een model en daar
// voor een monteur die een verslag leest. Een tweede uitvoering van diezelfde
// vraag zou precies de fout zijn die CLAUDE.md met "één ding heeft één
// betekenis" verbiedt.
//
// DE TEKST STAAT LOS VAN DE METING. meet() levert feiten als object, blok()
// maakt daar tekst van. Daardoor is te toetsen dát de module een gat ziet
// zonder aan de formulering vast te zitten — en is de formulering apart te
// toetsen op de regels die er echt toe doen. Zelfde splitsing als
// plOnderrandOordeel(): de maten in de proef, het oordeel ernaast.
//
// ──────────────────────────────────────────────────────────────────
// WANNEER HET BLOK MEEGAAT, EN WAAROM DAT ZO IS GEKOZEN
//
// Standaard aan, met een opt-out. Promptcaching staat hier uit (§8), dus elke
// regel gaat bij elke analyse opnieuw over de lijn en kost geld. De verleiding
// is dus om het blok alleen mee te sturen waar de aanroeper zegt dat het nodig
// is — en dat is exact de gewoonte die hierboven onder punt 4 misging.
//
// Daarom beslist de module het zelf, op één meetbaar gegeven: IS ER GEMETEN.
// Staat er niets in de PID-selectie en is er geen historie, dan valt er ook
// niets over de meetkwaliteit te zeggen en is het blok leeg — dat is precies
// het geval van de verbindingsvraag in pidlane-btflow.js, die niets met
// sensordata te maken heeft en er dus ook niet voor betaalt.
//
// Zegt een aanroeper wél wat hij wil laten analyseren (`vraag` of `set`), dan
// komt het blok er altijd, óók als er niets gemeten is. Juist dan: "je vraagt
// een oordeel over een meting die er niet is" is het nuttigste dat een model
// op dat moment kan horen.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* ── Kleine hulpjes ───────────────────────────────────────────────
     Alles wat van buiten komt wordt hier één keer voorzichtig opgehaald, zodat
     de rest van de module gewone JavaScript blijft. Ontbreekt een bron, dan is
     het antwoord null en nooit een verzonnen leegte. */

  function _fv(v) {
    try { if (typeof fv === 'function') return fv(v); } catch (e) { /* fv is van de app; in node is hij er niet */ }
    return (typeof v === 'number') ? String(Math.round(v * 100) / 100) : String(v);
  }

  function _naam(pid) {
    try {
      if (typeof getPidDef === 'function') { var d = getPidDef(pid); if (d && d.name) return d.name; }
    } catch (e) { console.warn('aanlevering: sensornaam niet op te halen voor ' + pid, e); }
    return pid;
  }

  function _set(naam) {
    var bron = (typeof window !== 'undefined' && window) || {};
    var s = (bron.ANALYSE_PID_SETS || {})[naam] || (bron.ANALYSE_PIDS || {})[naam];
    return Array.isArray(s) ? s.slice() : null;
  }

  // De namen die een aanroeper mag opgeven. Bewust uit de tabellen zelf
  // afgeleid en niet met de hand herhaald: een set die daar bijkomt is hier
  // meteen bruikbaar, en een set die verdwijnt geeft hier een lege dekking in
  // plaats van een stille verkeerde lijst.
  function setnamen() {
    var bron = (typeof window !== 'undefined' && window) || {};
    var uit = [];
    [bron.ANALYSE_PID_SETS, bron.ANALYSE_PIDS].forEach(function (t) {
      Object.keys(t || {}).forEach(function (k) { if (uit.indexOf(k) < 0) uit.push(k); });
    });
    return uit;
  }

  /* ── DEKKING — welke sensoren had deze analyse nodig? ──────────────

     Dit is de kant die een gemist defect voorkomt. De vraag is niet "wat heb
     ik gemeten" maar "wat had ik moeten meten, en wat ontbreekt daarvan" — en
     vooral: WAARDOOR ontbreekt het. Die drie redenen leiden tot drie
     verschillende conclusies en mogen daarom nooit op één hoop:

       niet ondersteund   de auto heeft de sensor niet. Er valt niets te meten
                          en er is ook niets mis; het onderwerp is gewoon niet
                          te beoordelen met OBD2.
       niet uitgevraagd   de auto kan het, maar hij staat niet in de selectie.
                          Dit is op te lossen door hem aan te zetten, en dat is
                          een advies dat een model kan geven.
       geen antwoord      hij staat in de selectie en geeft niets, of geeft iets
                          dat de kwaliteitscontrole heeft afgekeurd. Dat is zelf
                          een bevinding.

     OF EEN WAARDE BRUIKBAAR IS, VRAGEN WE AAN assessPidQuality() EN NIET AAN
     _pidHealth. Die twee lijken hetzelfde maar beantwoorden een andere vraag.
     _pidHealth is het oordeel van de gezondheidscheck bij het verbinden — dat
     gaat over of de sensor er IS, en het staat er soms minuten later nog. De
     vraag hier is of de waarde die er NU staat te gebruiken is, en dat is
     precies wat assessPidQuality() beantwoordt, met dezelfde regel waarmee
     buildQualityReport() het straks in het kwaliteitsblok zet. Zou dit blok een
     eigen oordeel vellen, dan kan de dekking "geleverd" zeggen over een waarde
     die het kwaliteitsblok drie regels verderop uitsluit.

     'nodata' uit _pidHealth blijft wél staan: dat is de andere vraag, en daar
     is de gezondheidscheck de enige bron voor.

     DE VOLGORDE VAN DE CONTROLES IS NIET VRIJ. Eerst ondersteuning, dan
     selectie, dan het antwoord — want een sensor die de auto niet heeft staat
     ook niet in de selectie, en dan zou de tweede reden de eerste overschrijven
     en de gebruiker naar een knop sturen die niets oplost.

     EN ALS supportedPIDs LEEG IS, weten we het niet. Dan wordt de eerste
     controle overgeslagen en zegt het blok erbij dat de ondersteuning onbekend
     is. Een lege verzameling als "de auto kan niets" lezen zou elke ontbrekende
     sensor wegverklaren, en dat is de gevaarlijkste kant om op te vallen. */
  function dekking(opties) {
    var o = opties || {};
    var nodig = Array.isArray(o.pids) ? o.pids.slice() : (o.set ? _set(o.set) : null);
    if (!nodig || !nodig.length) return null;

    var sup = null, act = null, vals = {}, health = {};
    try { if (typeof supportedPIDs !== 'undefined' && supportedPIDs && supportedPIDs.size) sup = supportedPIDs; }
    catch (e) { console.warn('aanlevering: supportedPIDs niet leesbaar — de ondersteuning blijft onbekend', e); }
    try { if (typeof activePIDs !== 'undefined' && activePIDs) act = activePIDs; }
    catch (e) { console.warn('aanlevering: activePIDs niet leesbaar — de selectie blijft onbekend', e); }
    try { if (typeof pidVals !== 'undefined' && pidVals) vals = pidVals; }
    catch (e) { console.warn('aanlevering: pidVals niet leesbaar — er is dan geen enkele waarde te melden', e); }
    try { if (typeof _pidHealth !== 'undefined' && _pidHealth) health = _pidHealth; }
    catch (e) { console.warn('aanlevering: _pidHealth niet leesbaar — het kwaliteitsoordeel ontbreekt in de dekking', e); }

    var geleverd = [], ontbreekt = [];
    nodig.forEach(function (pid) {
      var reden = null;
      if (sup && !sup.has(pid)) reden = 'deze auto ondersteunt de sensor niet';
      else if (act && !act.has(pid)) reden = 'staat niet in de PID-selectie en is dus niet uitgevraagd';
      else if (health[pid] === 'nodata') reden = 'uitgevraagd, maar de sensor antwoordt niet';
      else if (vals[pid] === undefined || vals[pid] === null || (typeof vals[pid] === 'number' && Number.isNaN(vals[pid])))
        reden = 'uitgevraagd, geen geldig antwoord binnengekomen';
      else {
        // Dezelfde regel die het kwaliteitsblok straks toepast, hier al —
        // anders telt een fysiek onmogelijke waarde als geleverde dekking
        // terwijl hij drie regels verderop uitgesloten wordt.
        try {
          if (typeof assessPidQuality === 'function') {
            var q = assessPidQuality(pid, vals[pid]);
            if (q && q.status === 'onzin') reden = 'gemeten, maar uitgesloten: ' + q.reden;
          }
        } catch (e) {
          console.warn('aanlevering: kwaliteitsoordeel van ' + pid + ' niet op te halen — hij telt nu als geleverd', e);
        }
      }

      if (reden) ontbreekt.push({ pid: pid, naam: _naam(pid), reden: reden });
      else geleverd.push(pid);
    });

    return {
      set: o.set || null,
      nodig: nodig,
      geleverd: geleverd,
      ontbreekt: ontbreekt,
      // null = niet vast te stellen. Zie de uitleg hierboven: dit is met opzet
      // geen false, want "we weten het niet" en "de auto kan het niet" vragen
      // om een ander antwoord.
      ondersteuningBekend: sup ? true : null,
      selectieBekend: act ? true : null
    };
  }

  /* ── MEETVENSTER — hoe lang en hoe vaak ───────────────────────────
     Eén bron: PLRit. Ontbreekt die, dan is dit blok null en zwijgt de tekst
     erover. Een venster uit pidHist afleiden zou een tweede waarheid zijn naast
     een teller die er al is, en die twee lopen dan uiteen — precies het patroon
     dat §11 drie keer heeft opgeleverd. */
  function venster() {
    var R = (typeof window !== 'undefined') ? window.PLRit : null;
    if (!R || typeof R.duurS !== 'function') return null;
    try {
      var bron = (typeof R.bron === 'function') ? R.bron() : null;
      return {
        duurS: R.duurS(),
        monsters: (typeof R.monsters === 'function') ? R.monsters() : null,
        // Zonder versheidsbron zegt `monsters` niets: dan telt de waarnemer
        // waarden die al in het geheugen stonden (#74). Dat hoort erbij te
        // staan, anders leest een model 56 monsters als 56 metingen.
        versheidsbron: bron ? !!bron.stempels : null
      };
    } catch (e) {
      console.warn('aanlevering: meetvenster niet uit PLRit te lezen', e);
      return null;
    }
  }

  /* ── ONDERBREKINGEN — de gaten, mét hun naam ──────────────────────

     Hier komt alles samen waar #18, #133 en #170 voor gebouwd zijn. Drie
     soorten onderbreking, en ze betekenen alle drie iets anders:

       achtergrondperiode  de app was niet in beeld. PLAchtergrond weet hoe lang,
                           en — als de hartslag liep — hoeveel daarvan de meetlus
                           werkelijk stillag.
       loopgat             de pollus tikte niet. Viel het binnen een
                           achtergrondperiode, dan is dat de telefoon; viel het
                           erbuiten, dan lag de app stil terwijl hij in beeld
                           stond, en dat is de adapter of een vastgelopen sweep.
       meetgat             de lus tikte wél, er kwam alleen niets binnen. De
                           kanten wisselen daar van betekenis, en die weging
                           staat in plMeetgatDuiding().

     De splitsing binnen/buiten komt uit plGatDuiding()/plMeetgatDuiding() — niet
     nagebouwd, aangeroepen. Zie de kop van dit bestand. */
  function onderbrekingen() {
    var W = (typeof window !== 'undefined') ? window : {};
    var R = W.PLRit, A = W.PLAchtergrond;
    if (!R && !A) return null;

    var uit = {
      perioden: null, wegS: null, stilsteS: null, gemetenPerioden: null,
      loopgaten: null, loopgatenBuiten: null,
      meetgaten: null, meetgatenBuiten: null,
      herverbindingen: null,
      langsteLoopgatS: null, langsteMeetgatS: null
    };

    var perioden = [];
    if (A && typeof A.perioden === 'function') {
      try {
        perioden = A.perioden();
        uit.perioden = perioden.length;
        uit.wegS = perioden.reduce(function (a, p) { return a + (p.s || 0); }, 0);
        // stilsteS() telt alleen perioden die hun stilte werkelijk gemeten
        // hebben. Zijn dat er nul, dan is de uitkomst van die functie 0 — en dat
        // getal betekent hier "niet gemeten" en niet "niets stilgelegen". Vandaar
        // gemeten() ernaast en null als er niets te vergelijken valt.
        uit.gemetenPerioden = (typeof A.gemeten === 'function') ? A.gemeten(0) : null;
        uit.stilsteS = (uit.gemetenPerioden) ? A.stilsteS(0) : null;
      } catch (e) { console.warn('aanlevering: achtergrondperioden niet te lezen', e); }
    }

    if (R) {
      try {
        var g = (typeof R.gaten === 'function') ? R.gaten() : [];
        var mg = (typeof R.meetgaten === 'function') ? R.meetgaten() : [];
        uit.loopgaten = g.length;
        uit.meetgaten = mg.length;
        uit.herverbindingen = (typeof R.herverbindingen === 'function') ? R.herverbindingen() : null;
        uit.langsteLoopgatS = g.reduce(function (a, x) { return Math.max(a, x.s || 0); }, 0);
        uit.langsteMeetgatS = mg.reduce(function (a, x) { return Math.max(a, x.s || 0); }, 0);

        if (typeof W.plGatDuiding === 'function' && A) {
          var d = W.plGatDuiding(g, perioden);
          uit.loopgatenBuiten = d.buiten.length;
        }
        if (typeof W.plMeetgatDuiding === 'function' && A) {
          var dm = W.plMeetgatDuiding(mg, perioden);
          uit.meetgatenBuiten = dm.buiten.length;
        }
      } catch (e) { console.warn('aanlevering: gaten niet uit PLRit te lezen', e); }
    }

    return uit;
  }

  /* ── DATAKWALITEIT — over de sensoren die nu werkelijk meedoen ────
     buildQualityReport() bestaat al en levert het blok. Wat hier nieuw is, is
     dat het niet meer van de aanroeper afhangt: de sensoren komen uit de
     dekking als die er is, en anders uit de selectie zelf. */
  function kwaliteit(pids) {
    try {
      if (typeof buildQualityReport !== 'function') return null;
      var lijst = pids && pids.length ? pids : [];
      if (!lijst.length) {
        try { if (typeof activePIDs !== 'undefined' && activePIDs) lijst = Array.from(activePIDs); }
        catch (e) { console.warn('aanlevering: selectie niet leesbaar voor het kwaliteitsblok', e); }
      }
      var paren = lijst
        .filter(function (p) { return typeof pidVals !== 'undefined' && pidVals[p] !== undefined && pidVals[p] !== null; })
        .map(function (p) { return [p, pidVals[p]]; });
      if (!paren.length) return null;
      return buildQualityReport(paren);
    } catch (e) {
      console.warn('aanlevering: kwaliteitsrapport niet op te bouwen — de AI krijgt dan geen betrouwbaarheidsoordeel mee', e);
      return null;
    }
  }

  // Is er überhaupt iets gemeten? Dit is de poort die bepaalt of het blok
  // meegaat bij een aanroep zonder opties. Zie de kop van dit bestand.
  function ergensGemeten() {
    try {
      if (typeof activePIDs !== 'undefined' && activePIDs && activePIDs.size) return true;
    } catch (e) { console.warn('aanlevering: selectie niet leesbaar bij de vraag of er gemeten is', e); }
    try {
      if (typeof pidHist !== 'undefined' && pidHist && Object.keys(pidHist).length) return true;
    } catch (e) { console.warn('aanlevering: historie niet leesbaar bij de vraag of er gemeten is', e); }
    return false;
  }

  /* ── meet() — alle feiten, geen tekst ─────────────────────────────
     Dit is wat er te toetsen valt. blok() hieronder maakt er zinnen van. */
  function meet(opties) {
    var o = opties || {};
    var dek = dekking(o);
    return {
      vraag: (o.vraag ? String(o.vraag).trim() : null) || null,
      set: o.set || null,
      gemeten: ergensGemeten(),
      dekking: dek,
      venster: venster(),
      onderbreking: onderbrekingen(),
      kwaliteit: kwaliteit(dek ? dek.geleverd : null),
      bevindingen: (function () {
        try { return (typeof correlationLines === 'function') ? correlationLines() : null; }
        catch (e) { console.warn('aanlevering: correlatiebevindingen niet op te halen', e); return null; }
      })()
    };
  }

  /* ── blok() — de tekst die aan de systeemprompt geplakt wordt ─────

     Kort houden is hier geen stijlkwestie. Promptcaching staat uit, dus deze
     tekst gaat bij élke analyse opnieuw over de lijn en staat op de rekening
     van de klant. Een sectie zonder inhoud wordt daarom weggelaten in plaats
     van met "geen" gevuld — met één uitzondering, de ONTBREEKT-lijst, want
     daar is "er ontbreekt niets" juist het bericht. */
  function blok(opties) {
    var o = opties || {};
    if (o.meet === false) return '';

    var m = meet(o);
    // Geen vraag, geen set, en niets gemeten: dan is dit geen analyse over
    // sensordata en betaalt de aanroeper niet voor een blok dat nergens over
    // gaat.
    if (!m.vraag && !m.set && !m.dekking && !m.gemeten) return '';

    var r = ['\n\nAANLEVERING — wat er over DEZE meting bekend is. Lees dit vóór je de data beoordeelt.'];

    if (m.vraag) r.push('\nVRAAG: ' + m.vraag);

    // ── meetvenster ──
    if (m.venster) {
      var v = 'MEETVENSTER: de waarnemer loopt ' + m.venster.duurS + ' s';
      if (m.venster.versheidsbron === false)
        v += '. Het aantal metingen is NIET vast te stellen (er is geen versheidsbron) — lees het aantal monsters hieronder niet als bewijs van meetdichtheid.';
      else if (typeof m.venster.monsters === 'number')
        v += '; de best gemeten sensor heeft ' + m.venster.monsters + ' echte metingen.';
      else v += '.';
      r.push('\n' + v);
    }

    // ── dekking ──
    if (m.dekking) {
      var d = m.dekking;
      var kop = '\nDEKKING' + (d.set ? ' (analyseset "' + d.set + '")' : '') + ': ' +
        d.geleverd.length + ' van de ' + d.nodig.length + ' sensoren die deze analyse nodig heeft, leveren data.';
      r.push(kop);
      if (d.ontbreekt.length) {
        r.push('ONTBREEKT — hierover is NIETS gemeten:');
        d.ontbreekt.forEach(function (x) { r.push('- ' + x.naam + ' (' + x.pid + '): ' + x.reden); });
      } else {
        r.push('Alle sensoren die deze analyse nodig heeft, leveren data.');
      }
      if (d.ondersteuningBekend === null)
        r.push('LET OP: welke sensoren deze auto ondersteunt is niet vastgesteld. "Ontbreekt" kan hier dus ook betekenen dat de auto de sensor gewoon niet heeft.');
    }

    // ── onderbrekingen ──
    var ob = m.onderbreking, obr = [];
    if (ob) {
      if (ob.perioden) {
        var z = 'De app stond ' + ob.perioden + '× op de achtergrond, samen ' + ob.wegS + ' s';
        if (ob.stilsteS === null) z += '. Hoe lang de meetlus daarvan stillag is NIET gemeten — reken die tijd dus niet als meetdata.';
        else z += '; de meetlus lag daarvan maximaal ' + ob.stilsteS + ' s aaneengesloten stil.';
        obr.push('- ' + z);
      }
      if (ob.loopgaten) {
        var l = '- ' + ob.loopgaten + ' onderbreking(en) van de meetlus (langste ' + ob.langsteLoopgatS + ' s)';
        if (ob.loopgatenBuiten === null) l += '.';
        else if (!ob.loopgatenBuiten) l += ', alle binnen een periode waarin de app weg was: dit is de telefoon en niet de auto.';
        else l += ', waarvan ' + ob.loopgatenBuiten + ' terwijl de app gewoon in beeld stond: daar lag de verbinding of de adapter stil.';
        obr.push(l);
      }
      if (ob.meetgaten) {
        var g = '- ' + ob.meetgaten + ' periode(n) waarin de app wél vroeg maar er geen data terugkwam (langste ' + ob.langsteMeetgatS + ' s)';
        if (ob.meetgatenBuiten === null) g += '.';
        else if (!ob.meetgatenBuiten) g += ', alle terwijl de app op de achtergrond stond.';
        else g += ', waarvan ' + ob.meetgatenBuiten + ' met de app in beeld: dat wijst op de adapter of de bus, niet op een sensor.';
        obr.push(g);
      }
      if (ob.herverbindingen)
        obr.push('- ' + ob.herverbindingen + '× opnieuw verbonden met de adapter. Een sprong, een nul of een bevroren waarde rond zo\'n herverbinding is een MEETARTEFACT.');
    }
    if (obr.length) {
      r.push('\nONDERBREKINGEN — gemeten, niet afgeleid:');
      r.push(obr.join('\n'));
    } else if (ob && ob.loopgaten === 0 && ob.meetgaten === 0 && !ob.perioden) {
      r.push('\nONDERBREKINGEN: geen. De meting liep aaneengesloten door.');
    }

    // ── datakwaliteit ──
    // Het bestaande blok uit pidlane-kwaliteit.js, nu zonder dat een
    // aanroepplek eraan moet denken.
    if (m.kwaliteit && m.kwaliteit.promptBlok) r.push(m.kwaliteit.promptBlok);

    // ── bevindingen ──
    if (m.bevindingen && m.bevindingen.length) {
      r.push('\nDETERMINISTISCHE BEVINDINGEN (door de app zelf berekend, geen AI-oordeel):');
      r.push(m.bevindingen.join('\n'));
    }

    /* ── DE WEEGREGELS ────────────────────────────────────────────
       Zonder dit slot is de rest een tabel waar een model zelf een conclusie
       aan mag hangen, en dan ligt de fout van punt 2 in de kop weer open: een
       sensor die er niet was leest als een sensor die niets mankeerde. Deze
       vijf regels zeggen per geval wat er dan NIET geconcludeerd mag worden. */
    r.push('\nHOE JE DIT MEEWEEGT (hard, dit gaat vóór je eigen oordeel):');
    r.push('1. Een sensor onder ONTBREEKT is NIET beoordeeld. Zeg dat met zoveel woorden en concludeer nooit dat het bijbehorende onderdeel in orde is — afwezige data is geen goed nieuws.');
    r.push('2. Een waarde die rond een ONDERBREKING ontbreekt, springt, nul wordt of bevroren lijkt, is eerst een meetartefact en pas daarna een defect. Noem dat onderscheid expliciet.');
    r.push('3. Waarden die onder DATAKWALITEIT zijn UITGESLOTEN gebruik je niet, ook niet als zijdelingse onderbouwing.');
    r.push('4. Waarden die daar ONZEKER heten leiden hoogstens tot "hermeten of sensor controleren", nooit rechtstreeks tot een reparatieadvies.');
    r.push('5. Kun je de vraag met deze data niet beantwoorden, zeg dat dan. Een eerlijk "hiervoor is te weinig gemeten, meet X erbij" is hier meer waard dan een conclusie met een slag om de arm.');

    return r.join('\n');
  }

  var API = {
    blok: blok,
    meet: meet,
    dekking: dekking,
    venster: venster,
    onderbrekingen: onderbrekingen,
    kwaliteit: kwaliteit,
    ergensGemeten: ergensGemeten,
    setnamen: setnamen
  };

  try { window.PLAanlevering = API; }
  catch (e) { console.warn('PLAanlevering niet op window gezet — de AI krijgt dan niets over de meetkwaliteit te horen (#188)', e); }
  try { if (typeof module !== 'undefined' && module.exports) module.exports = API; }
  catch (e) { /* browser: er is geen module — en dat is hier het normale geval */ }
})();
