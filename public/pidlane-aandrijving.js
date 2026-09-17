/* pidlane-aandrijving.js — wat doet de aandrijving op dít moment? (17-09-2026)
   ═══════════════════════════════════════════════════════════════════════
   Eén toestand, één vocabulaire, alle aandrijvingen. De balk bovenin de
   Live-weergave leest hier uit, en verder niets: dit bestand kent het scherm
   niet en raakt geen DOM aan. Dat is met opzet — `bepaal()` is een zuivere
   functie met een vaste in- en uitgang, en daardoor in node te toetsen en in
   plmutate.sh stuk te maken.

   WAAROM DIT BESTAAT
   `updateEVMode()` in pidlane-motortype.js beantwoordde al de vraag "rijden
   we op de accu", maar kon er niets mee: de uitkomst was een vlag die
   ICE-PIDs pauzeert plus een regel in het diagnoselog. Drie dingen misten.

     1. Hij stond uit op een benzineauto. `detectEngineType()` leest
        `vehicleInfo.brandstof` — een DECLARATIE uit RDW-data — en bij
        'benzine' stopte de functie meteen. Start/stop kon er dus nooit
        uitkomen, hoe goed de PIDs ook binnenkwamen.
     2. Twee waarden zijn te weinig. "Motor uit terwijl we stilstaan" en
        "motor uit terwijl we rijden" zijn verschillende dingen.
     3. Er zat een klem in de pollronde. Zie de commit ervoor en §11.

   DE KERN: JE HEBT GESCHIEDENIS NODIG, GEEN MOMENTOPNAME
   Deze twee situaties zijn op één momentopname NIET te scheiden:

        contact aan, motor nog niet gestart   RPM 0, 0 km/h, ECU antwoordt
        start/stop heeft de motor afgezet     RPM 0, 0 km/h, ECU antwoordt

   Er is geen PID die ze uit elkaar haalt. Het verschil is uitsluitend: heeft
   de motor in deze sessie al gedraaid? Daarom draagt elke uitkomst zijn eigen
   voorgeschiedenis mee — `bepaal(nu, vorige)` krijgt zijn vorige oordeel
   terug en geeft een nieuw oordeel af.

   DRIE BRONNEN VOOR "HEEFT GEDRAAID", EN ÉÉN REGEL EROVER
   De vlag mag door drie dingen GEZET worden en door niets GEWIST:

        A  we zagen zelf RPM boven de aan-drempel      (directe waarneming)
        B  011F (motorlooptijd) > 0                    (werkt bij koud koppelen)
        C  011F viel terug t.o.v. de vorige lezing     (de teller is gereset,
                                                        dus er is gestart)

   Bron B is er omdat A faalt in een veelvoorkomend geval: je koppelt aan
   terwijl de auto al in een start/stop-stop staat. Voor het stoplicht, of na
   een herverbinding. Er is dan geen geschiedenis, en zonder 011F zou de balk
   "Motor uit" tonen terwijl de motor net nog liep.

   Het bewijs is asymmetrisch, en dat is de hele regel:

        011F > 0   de motor HEEFT gedraaid          hard bewijs
        011F = 0   kan "nog niet gestart" zijn, kan een net gereset tellertje
                   zijn                             zwak, geen bewijs

   Wat 011F tijdens een start/stop-stop doet is niet genormeerd: hij bevriest,
   telt door, óf reset bij de herstart. In alle drie blijft "> 0" waar zodra de
   motor eerder liep, en in het derde geval levert hij bron C op. Het ontwerp
   hangt dus niet af van welke variant een auto doet. Wélke variant deze CX-5
   doet is een vraag voor een rit; zie CAMPAGNE.

   Dit tweebronnenpatroon is niet nieuw hier. pidlane-onderdeel.js doet bij de
   thermostaatregel hetzelfde, met dezelfde reden erbij: motorlooptijd is een
   sensor die je kunt uitvinken, dus er moet een tweede bron naast.

   WAT HIER BEWUST NIET IN ZIT
   Regeneratie/laden tijdens remmen, en "motor én accu tegelijk" (hybride
   boost), zijn op generieke OBD niet te scheiden van gewoon rijden. Daar is
   geen mode 01-PID voor. De balk zwijgt daarover in plaats van te gokken.
   Waaróm start/stop niet ingrijpt is een fabrikant-DID en dus een ritvraag.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {

  // ── Drempels ───────────────────────────────────────────────────────
  // Twee drempels per oordeel, niet één: een auto die op 400 tpm hangt te
  // stuiteren zou met één drempel de balk laten knipperen. Aan gaat op de
  // hoge, uit pas op de lage.
  //
  // STABIEL_MS is de tweede rem: een nieuwe toestand moet zo lang aanhouden
  // voordat hij de getoonde toestand vervangt. Bij het monitor-profiel komen
  // 010C en 010D elke 250 ms binnen, dus 700 ms is drie monsters. Een
  // start/stop-stop duurt seconden en overleeft dat ruim.
  var D = {
    rpmAan: 400,      // hierboven draait de motor
    rpmUit: 150,      // hieronder staat hij stil
    vRijdt: 3,        // km/h — hierboven rijden we
    vStil: 1,         // km/h — hieronder staan we stil
    stabielMs: 700,   // zo lang moet een nieuwe toestand aanhouden
    startMs: 1500,    // zo lang blijft "Motor start" staan
    versMs: 4000      // ouder dan dit is geen meting meer
  };

  var LABELS = {
    DRAAIT_STIL:    { emoji: '🔥', label: 'Stationair' },
    DRAAIT_RIJDT:   { emoji: '🔥', label: 'Rijdt op motor' },
    ACCU_RIJDT:     { emoji: '🔋', label: 'Rijdt op accu' },
    STARTSTOP:      { emoji: 'Ⓢ',       label: 'Start/stop actief' },
    UIT_VOOR_START: { emoji: '⏸',       label: 'Motor uit' },
    START:          { emoji: '⟳',       label: 'Motor start' },
    ONBEKEND:       { emoji: '○',       label: 'Onbekend' }
  };

  function _getal(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // ── De vlag "heeft gedraaid" ───────────────────────────────────────
  // Zetten mag uit drie bronnen, wissen uit geen enkele. De sterkste bron
  // wint, zodat `bronGedraaid` blijft zeggen waaróp het oordeel rust.
  function _gedraaid(nu, v, motorDraait) {
    var uit = {
      heeftGedraaid: !!(v && v.heeftGedraaid),
      bronGedraaid: (v && v.bronGedraaid) || null
    };
    if (motorDraait) { uit.heeftGedraaid = true; uit.bronGedraaid = 'waarneming'; return uit; }
    if (uit.heeftGedraaid) return uit;

    var lt = _getal(nu.looptijd);
    if (lt !== null && lt > 0) { uit.heeftGedraaid = true; uit.bronGedraaid = 'looptijd'; return uit; }

    // Bron C: de teller viel terug. Dat kan alleen door een reset, en een
    // reset hoort bij een start.
    var vorigeLt = (v && v.looptijd !== undefined) ? _getal(v.looptijd) : null;
    if (lt !== null && vorigeLt !== null && lt < vorigeLt) {
      uit.heeftGedraaid = true; uit.bronGedraaid = 'tellerreset';
    }
    return uit;
  }

  function _zekerheidUit(toestand, nu, g) {
    if (toestand === 'ONBEKEND') return 'geen';
    if (toestand !== 'UIT_VOOR_START') return 'hoog';
    // Geen geschiedenis. Hoe hard "nog niet gestart" is, hangt aan 011F.
    if (_getal(nu.looptijd) === null) return 'laag';   // niet ondersteund of uitgevinkt
    return 'midden';                                    // leest 0 — zwak bewijs
  }

  function _waarom(toestand, nu, g) {
    var d = [];
    if (_getal(nu.rpm) !== null) d.push('toerental ' + Math.round(nu.rpm));
    if (_getal(nu.snelheid) !== null) d.push(Math.round(nu.snelheid) + ' km/h');
    if (toestand === 'STARTSTOP') {
      if (g.bronGedraaid === 'waarneming') d.push('de motor heeft deze sessie gedraaid');
      else if (g.bronGedraaid === 'looptijd') d.push('motorlooptijd ' + Math.round(_getal(nu.looptijd)) + ' s');
      else if (g.bronGedraaid === 'tellerreset') d.push('de looptijdteller is gereset, dus er is gestart');
    }
    if (toestand === 'UIT_VOOR_START') {
      d.push(_getal(nu.looptijd) === null
        ? 'geen motorlooptijd beschikbaar — niet zeker of hij al gelopen heeft'
        : 'motorlooptijd 0');
    }
    if (toestand === 'ACCU_RIJDT') d.push('de motor staat stil terwijl de auto rijdt');
    return d.join(', ');
  }

  // ── Het ruwe oordeel, vóór de stabilisatie ─────────────────────────
  function _rauw(nu, v, motorDraait, rijdt, g) {
    if (v && v.motorDraait === false && motorDraait === true) return 'START';
    if (motorDraait) return rijdt ? 'DRAAIT_RIJDT' : 'DRAAIT_STIL';
    if (rijdt) return 'ACCU_RIJDT';
    return g.heeftGedraaid ? 'STARTSTOP' : 'UIT_VOOR_START';
  }

  /* bepaal(nu, vorige) — het enige dat deze module doet.

     nu     { rpm, snelheid, looptijd, fuelRate, spanning, ecuLeeft, ouderdomMs, t }
     vorige de vorige uitkomst van deze functie, of null bij een nieuwe sessie

     Alles in `nu` mag ontbreken; wat ontbreekt verlaagt de zekerheid of levert
     ONBEKEND op. Er wordt nooit een toestand geraden uit een waarde die er
     niet is. */
  function bepaal(nu, vorige) {
    nu = nu || {};
    var v = vorige || null;
    var t = (typeof nu.t === 'number') ? nu.t : 0;
    var rpm = _getal(nu.rpm), spd = _getal(nu.snelheid);

    // Stilte is geen motor-uit. Drie dingen lijken op elkaar — de adapter is
    // de bus kwijt, de ECU antwoordt NO DATA, de ECU antwoordt netjes met
    // nul — en alleen het laatste is motor uit. De eerste twee zijn ONBEKEND.
    var dood = (nu.ecuLeeft === false) || rpm === null || spd === null ||
      (_getal(nu.ouderdomMs) !== null && nu.ouderdomMs > D.versMs);

    var g = _gedraaid(nu, v, !dood && rpm !== null && rpm >= D.rpmAan);
    var motorDraait, rijdt, rauw;

    if (dood) {
      motorDraait = (v && v.motorDraait) || false;
      rijdt = (v && v.rijdt) || false;
      rauw = 'ONBEKEND';
    } else {
      // Hysterese: aan op de hoge drempel, uit pas op de lage.
      motorDraait = (v && v.motorDraait) ? (rpm > D.rpmUit) : (rpm >= D.rpmAan);
      rijdt = (v && v.rijdt) ? (spd > D.vStil) : (spd >= D.vRijdt);
      rauw = _rauw(nu, v, motorDraait, rijdt, g);
    }

    // "Motor start" blijft even staan: de sprong zelf duurt een fractie en is
    // anders niet te lezen.
    if (v && v.toestand === 'START' && rauw !== 'ONBEKEND' && motorDraait &&
        (t - v.sinds) < D.startMs) rauw = 'START';

    // Stabilisatie. START gaat er buitenom — die is per definitie kort, en
    // wachten tot hij "aanhoudt" zou hem wegpoetsen.
    var toestand = rauw, sinds = t, kandidaat = null, kandidaatSinds = t;
    if (v && v.toestand) {
      if (rauw === v.toestand) {
        toestand = rauw; sinds = v.sinds;
      } else if (rauw === 'START' || v.toestand === 'START') {
        // START gaat er aan beide kanten buitenom: hij is per definitie kort,
        // en zijn eigen startMs-timer is de rem. Hem ook nog laten
        // stabiliseren zou hem twee keer afremmen.
        toestand = rauw; sinds = t;
      } else if (v.kandidaat === rauw && (t - v.kandidaatSinds) >= D.stabielMs) {
        toestand = rauw; sinds = t;
      } else {
        toestand = v.toestand; sinds = v.sinds;
        kandidaat = rauw;
        kandidaatSinds = (v.kandidaat === rauw) ? v.kandidaatSinds : t;
      }
    }

    var lt = _getal(nu.looptijd);
    var res = {
      toestand: toestand,
      emoji: LABELS[toestand].emoji,
      label: LABELS[toestand].label,
      zekerheid: _zekerheidUit(toestand, nu, g),
      waarom: _waarom(toestand, nu, g),
      heeftGedraaid: g.heeftGedraaid,
      bronGedraaid: g.bronGedraaid,
      // Eén waarneming van rijden-zonder-draaiende-motor bewijst dat deze auto
      // een tweede aandrijfbron heeft. Dat is harder dan wat het kentekenveld
      // zegt, dus het blijft staan zodra het één keer gezien is.
      bewijstHybride: !!((v && v.bewijstHybride) || toestand === 'ACCU_RIJDT'),
      brandstofLu: _getal(nu.fuelRate),
      looptijd: (lt !== null) ? lt : (v ? v.looptijd : null),
      spanning: _getal(nu.spanning),
      motorDraait: motorDraait,
      rijdt: rijdt,
      sinds: sinds,
      kandidaat: kandidaat,
      kandidaatSinds: kandidaatSinds
    };
    return res;
  }

  /* Bouwt `nu` uit de globale pidVals. Staat hier apart zodat bepaal() zelf
     niets van de app hoeft te weten. */
  function uitPidVals(bron, opties) {
    var p = bron || {};
    var o = opties || {};
    return {
      rpm: _getal(p['010C']),
      snelheid: _getal(p['010D']),
      looptijd: _getal(p['011F']),
      fuelRate: _getal(p['015E']),
      spanning: _getal(p['0142']),
      ecuLeeft: o.ecuLeeft !== false,
      ouderdomMs: (typeof o.ouderdomMs === 'number') ? o.ouderdomMs : null,
      t: (typeof o.t === 'number') ? o.t : Date.now()
    };
  }

  /* Mag de app 011F nú los opvragen? Alleen als het antwoord de toestand
     werkelijk verandert: we staan stil met een stille motor en weten niet of
     hij al gelopen heeft. Dat is één verzoek per sessie, niet één per
     seconde — 011F staat op 30 s in de pollklasse en dat blijft zo. */
  function looptijdGewenst(res) {
    if (!res) return false;
    return res.toestand === 'UIT_VOOR_START' && !res.heeftGedraaid && res.looptijd === null;
  }

  /* Eén regel voor de balk. De zekerheid staat er alleen bij als hij niet
     hoog is — anders leest elke regel als een slag om de arm. */
  function balkTekst(res) {
    if (!res) return '';
    var s = res.emoji + ' ' + res.label;
    if (res.brandstofLu !== null && res.brandstofLu !== undefined)
      s += ' · ' + res.brandstofLu.toFixed(1).replace('.', ',') + ' L/u';
    if (res.zekerheid === 'midden' || res.zekerheid === 'laag')
      s += ' (' + res.zekerheid + ')';
    return s;
  }

  window.PLAandrijving = {
    bepaal: bepaal,
    uitPidVals: uitPidVals,
    looptijdGewenst: looptijdGewenst,
    balkTekst: balkTekst,
    drempels: D,
    labels: LABELS
  };
})();
