/* ══════════════════════════════════════════════════════════════════
   pidlane-proeven.js — de proeven van blok 5 (PROEVEN_B5)
   ──────────────────────────────────────────────────────────────────
   Tot 08-11-2026 stond deze lijst in pidlane-testrun.js: 537 KB van de
   866, en bij elke start geparsed, ook door wie de testrun nooit opent
   (#690). Hier is hij een fabriek: PLProevenB5(T) geeft de lijst, en T is
   wat de proeven uit de testrun nodig hebben. De testrun roept hem pas aan
   als iemand de lijst vraagt (proevenB5() in pidlane-testrun.js).

   Wat je hier doet is niet veranderd: voeg bovenaan een entry toe met
   issue, naam, waarom en proef (zie CLAUDE.md en §20 van PIDLANE.md).

   T levert functies en vaste waarden. Twee dingen veranderen tijdens een
   testrun en komen daarom als functie: T.markeringenRuw() en T.trHerstel().
   Een losse kopie zou de waarde van het moment van laden vasthouden.
   ══════════════════════════════════════════════════════════════════ */
window.PLProevenB5 = function (T) {
  'use strict';
  const PLBudget = T.PLBudget;
  const PLRit = T.PLRit;
  const RIT_PIDS = T.RIT_PIDS;
  const _aanvragersNu = T._aanvragersNu;
  const _appLogRegels = T._appLogRegels;
  const _issuesVan = T._issuesVan;
  const _liveSchrijf = T._liveSchrijf;
  const _meetStand = T._meetStand;
  const _nu = T._nu;
  const _opruimOntdubbel = T._opruimOntdubbel;
  const _plScrollRestOnder = T._plScrollRestOnder;
  const _stapGezet = T._stapGezet;
  const _verzendOpdracht = T._verzendOpdracht;
  const _wacht = T._wacht;
  const _zonderSporen = T._zonderSporen;
  const begeleidStart = T.begeleidStart;
  const markeringen = T.markeringen;
  const plOnderrandOordeel = T.plOnderrandOordeel;
  const testrunTekst = T.testrunTekst;

const PROEVEN_B5 = [

  // ── Zonder adapter een eigen uitkomst (#705, 09-11-2026) ──
  {
    issue: '#705',
    naam: 'Zonder adapter: papierenrapport voor kopers, onderhoud volgens richtwaarden, lange rit en verbruik uit tankbeurten; 🔌 en de adapterkaart onder Alle functies',
    waarom: 'De adapterkaart was een eindpunt. Valt PLZonderUit of de poort in wcBind weg in de draaiende app, dan opent een meetkaart weer een dashboard dat niets meet, of zegt het papierenrapport "groen" zonder dat er iets uitgelezen is.',
    proef: async function () {
      if (!window.PLZonderUit || !PLZonderUit._kern) return { staat: 'FOUT', detail: 'PLZonderUit ontbreekt — herladen?' };
      if (!window.PLAankoop) return { staat: 'FOUT', detail: 'PLAankoop ontbreekt: het papierenrapport heeft geen signalen' };
      var p = PLZonderUit._kern.papieren({ kenteken: 'AB123C', ts: Date.now(), rdw: { tellerstandoordeel: 'Logisch', openstaande_terugroepactie_indicator: 'Nee' } });
      if (p.oordeel === 'groen') return { staat: 'FOUT', detail: 'het papierenrapport geeft groen zonder uitlezing' };
      var los = Object.keys(PLZonderUit._kern.KAART).filter(function (id) { return !document.getElementById(id); });
      if (los.length) return { staat: 'FOUT', detail: 'KAART noemt kaarten die er niet zijn: ' + los.join(', ') };
      var zonder = document.body.classList.contains('pl-zonder-auto');
      if (zonder === PLZonderUit.heeftAuto()) return { staat: 'LET OP', detail: 'het startscherm is nog niet bijgetekend na een verbindingswissel' };
      return { staat: 'OK', detail: PLZonderUit.heeftAuto() ? 'met auto: de kaarten openen gewoon' : 'zonder auto: 🔌 bij de meetkaarten, de adapterkaart met een eigen uitkomst' };
    }
  },

  // ── Zonder adapter: een uitweg tijdens verbinden, een kaart in de wizard (09-11-2026) ──
  {
    issue: '—',
    naam: 'Verbinden heeft een knop Stoppen; zonder adapter toont de wizard bij elke meetmodule één kaart (verbinden, Kenteken-check, demo) in plaats van een lege meting',
    waarom: 'Achter het doek van de verbindstrook was niets meer aan te raken, en zonder adapter "verzamelde" de sensorcontrole 0 sensoren in 0 s terwijl vijf andere modules stil van tabblad wisselden.',
    proef: async function () {
      if (typeof window.plVerbindStop !== 'function' || !window.PLStrook || typeof PLStrook._stop !== 'function') return { staat: 'FOUT', detail: 'plVerbindStop of PLStrook._stop ontbreekt — herladen?' };
      if (!window.PLWizard || !PLWizard._kern || typeof PLWizard._kern.adapterNodig !== 'function') return { staat: 'FOUT', detail: 'PLWizard._kern.adapterNodig ontbreekt — oude pidlane-wizard.js?' };
      if (PLWizard._kern.adapterNodig('diep')) return { staat: 'FOUT', detail: 'de vragenlijst van Storing vangen wordt tegengehouden' };
      var auto = !!(connected || demoMode);
      if (PLWizard._kern.adapterNodig('systeem') === auto) return { staat: 'FOUT', detail: 'de poort volgt de verbinding niet (verbonden of demo: ' + auto + ')' };
      return { staat: 'OK', detail: auto ? 'verbonden: de modules staan vrij' : 'niet verbonden: de wizard toont de adapterkaart' };
    }
  },

  // ── Lichter opstarten (#690, 08-11-2026) ──
  {
    issue: '#690',
    naam: 'De boot laadt geen pidlane-assets.js en geen proevenlijst meer: de bandenfoto is een los bestand, de proeven komen pas als de testrun opent',
    waarom: 'Bij elke start werden 205 KB base64 en 537 KB proeven geparsed die bijna niemand nodig heeft. Komt een van de twee terug in de boot, dan wordt de app stil weer trager.',
    proef: async function () {
      var res = (performance.getEntriesByType ? performance.getEntriesByType('resource') : []);
      var assets = res.filter(function (r) { return /pidlane-assets\.js/.test(r.name); });
      if (assets.length || typeof window.BANDEN_IMG !== 'undefined') return { staat: 'FOUT', detail: 'pidlane-assets.js wordt weer geladen' };
      var pr = res.filter(function (r) { return /pidlane-proeven\.js/.test(r.name); })[0];
      var nav = (performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null);
      if (pr && nav && pr.startTime < nav.domContentLoadedEventEnd) return { staat: 'FOUT', detail: 'pidlane-proeven.js laadt al bij de boot (' + Math.round(pr.startTime) + ' ms) — staat hij weer in index.html?' };
      return { staat: 'OK', detail: pr ? 'proeven geladen na ' + Math.round(pr.startTime / 1000) + ' s, niet bij de boot' : 'proeven via een zandbak' };
    }
  },

  // ── Geen timers zonder reden (#691, 08-11-2026) ──
  {
    issue: '#691',
    naam: 'Vaste timers hangen aan PLRust: schermtimers alleen in beeld, meettimers in beeld of met een verbinding; uit beeld zonder verbinding tikt er niets',
    waarom: 'Uit beeld en zonder verbinding gingen twintig timers af, versnelling en telemetrie elke 200 ms. Valt een meettimer terug naar elke(), dan stopt de meting tijdens een rit met Maps ervoor; valt hij terug naar setInterval, dan loopt de batterij weer leeg.',
    proef: async function () {
      if (!window.PLRust || typeof PLRust.meet !== 'function') return { staat: 'FOUT', detail: 'PLRust.meet ontbreekt — herladen?' };
      var t = PLRust.taken(), meet = t.filter(function (x) { return x.meet; }).map(function (x) { return x.naam; });
      var mist = ['versnelling', 'telemetrie', 'berekend', 'garage', 'leerrit'].filter(function (n) { return meet.indexOf(n) < 0; });
      if (mist.length) return { staat: 'FOUT', detail: 'geen meettimer: ' + mist.join(', ') + ' — die stoppen uit beeld óf lopen altijd' };
      var sch = t.filter(function (x) { return !x.meet; }).map(function (x) { return x.naam; });
      if (sch.indexOf('onderbalk') < 0 || sch.indexOf('startscherm') < 0) return { staat: 'FOUT', detail: 'onderbalk of startscherm hangt niet als schermtimer aan PLRust' };
      var loopt = t.filter(function (x) { return x.loopt; }).length;
      var detail = t.length + ' timers (' + meet.length + ' meten, ' + sch.length + ' scherm), ' + loopt + ' lopen nu';
      if (connected) {
        var stil = t.filter(function (x) { return x.meet && !x.loopt; }).map(function (x) { return x.naam; });
        if (stil.length) return { staat: 'FOUT', detail: 'verbonden, maar meettimers slapen: ' + stil.join(', ') };
      }
      return { staat: 'OK', detail: detail };
    }
  },

  // ── Het kenteken hoort bij de VIN (08-11-2026) ──
  {
    issue: '—',
    naam: 'Het kenteken van de verbonden auto komt uit PLIdentiteit: bij een nieuwe VIN onbekend tot de klant het bevestigt, nooit stil dat van de vorige auto; zonder VIN gaan sensoren en versnellingen van Mijn voertuigen alleen aan bij hetzelfde kenteken',
    waarom: 'Na stil verbinden werd een nieuwe auto stil het kenteken van de vorige opgezocht: verkeerd merk, verkeerde brandstof voor de sensorzeef, en dat kenteken blijvend in het profiel van de nieuwe VIN.',
    proef: async function () {
      if (!window.PLIdentiteit || !PLIdentiteit._kern) return { staat: 'FOUT', detail: 'PLIdentiteit ontbreekt — herladen?' };
      var K = PLIdentiteit._kern;
      if (K.metVin({ vin: 'WVWZZZ1KZ6W000001', kenteken: 'OUD123', bron: 'klant' }, 'JMZZZZZZZJX000001', '').kenteken)
        return { staat: 'FOUT', detail: 'een andere VIN houdt het kenteken van de vorige auto' };
      if (K.begin({ vin: '', kenteken: 'OUD123', bron: 'klant' }, false).kenteken) return { staat: 'FOUT', detail: 'een nieuwe verbinding houdt het oude kenteken' };
      var id = PLIdentiteit.staat();
      var vin = (typeof vehicleInfo !== 'undefined' && vehicleInfo && vehicleInfo.vin) || '';
      if (!connected || !id) return { staat: 'LET OP', detail: 'niet verbonden — alleen de kern getoetst' };
      if (vin && id.vin && id.vin !== vin) return { staat: 'FOUT', detail: 'PLIdentiteit hoort bij een andere VIN dan de verbonden auto' };
      var prof = null; try { prof = JSON.parse(localStorage.getItem('pl_vinprof_' + vin) || 'null'); } catch (e) { return { staat: 'LET OP', detail: 'profiel onleesbaar: ' + (e.message || e) }; }
      var pk = K.norm(prof && prof.kenteken);
      if (pk && id.kenteken && pk !== id.kenteken) return { staat: 'FOUT', detail: 'profiel van deze VIN zegt ' + pk + ', de verbinding ' + id.kenteken };
      return { staat: id.kenteken ? 'OK' : 'LET OP', detail: id.kenteken ? 'kenteken ' + id.kenteken + ' (' + id.bron + ')' : 'kenteken van deze auto nog niet bevestigd — de strook vraagt het' };
    }
  },

  // ── Verbinden zonder vensters (08-11-2026) ──
  {
    issue: '—',
    naam: 'Verbinden met de knop loopt stil: de strook bovenin toont Adapter, Protocol, Auto, Klaarzetten en Foutcodes, zonder samenvatting, keuze Inrichten of Check-venster; foutcodes één keer per auto per dag, kenteken alleen in stilstand',
    waarom: 'Verbinden was venster na venster. Valt de strook of de stille stand weg in de draaiende app, dan komen de vensters stil terug, of verbindt de knop met een bekende adapter niet meer.',
    proef: async function () {
      if (!window.PLStrook || typeof window.plVerbindOpen !== 'function') return { staat: 'FOUT', detail: 'PLStrook of plVerbindOpen ontbreekt — herladen?' };
      if (!window.PLFoutcodes || typeof PLFoutcodes.scanStil !== 'function') return { staat: 'FOUT', detail: 'PLFoutcodes.scanStil ontbreekt' };
      if (typeof _kentNaVerbinden !== 'function') return { staat: 'FOUT', detail: '_kentNaVerbinden ontbreekt in pidlane-bt.js' };
      var K = PLStrook._kern;
      if (K.magKentekenVragen(60)) return { staat: 'FOUT', detail: 'het kentekenveld zou ook tijdens het rijden verschijnen' };
      if (K.foutcodeRegel({ kleur: 'grijs' }).status === 'ok') return { staat: 'FOUT', detail: 'niet gelezen krijgt een vinkje' };
      var ov = document.getElementById('connOv');
      if (ov) { ov.classList.add('pl-stil'); var weg = getComputedStyle(ov).display === 'none'; ov.classList.remove('pl-stil'); if (!weg) return { staat: 'FOUT', detail: '#connOv.pl-stil is zichtbaar — de stylesheet mist de regel' }; }
      var st = PLStrook.staat();
      var detail = 'altijd automatisch ' + (PLStrook.altijd() ? 'aan' : 'uit');
      if (st.st) detail += '; laatste verbinding: ' + st.st.stappen.map(function (x) { return x.naam + ' ' + x.status; }).join(', ');
      if (!connected) return { staat: 'LET OP', detail: 'niet verbonden — alleen de bedrading gecontroleerd; ' + detail };
      return { staat: 'OK', detail: detail };
    }
  },

  // ── Alles volgt de aandrijving (07-11-2026) ──
  {
    issue: '—',
    naam: 'Verbranding en elektrisch rijden zijn twee vragen (aandrijfProfiel): een diesel-hybride rekent als diesel, Hyperlane toont op een hybride de vermogensvraag (CA18), en de demo heeft een auto per aandrijfvorm',
    waarom: 'Een diesel-hybride kreeg overal de benzineroute en een mHEV de EV-logica; Hyperlane stond op een plug-in de hele rit op MOTOR KOUD met de toerenring op 0. Valt een van deze schakels weg in de draaiende app, dan komt dat stil terug.',
    proef: async function () {
      if (typeof aandrijfProfiel !== 'function' || typeof aandrijfProfielLive !== 'function') return { staat: 'FOUT', detail: 'aandrijfProfiel ontbreekt — herladen?' };
      var dh = aandrijfProfiel({ brandstof: 'hybride', verbranding: 'diesel', aandrijving: { vorm: 'vol' } });
      if (dh.verbranding !== 'diesel' || !dh.elektrisch) return { staat: 'FOUT', detail: 'diesel-hybride wordt ' + JSON.stringify(dh) };
      if (aandrijfProfiel({ brandstof: 'benzine', motortype: '1.5 eTSI mHEV' }).elektrisch) return { staat: 'FOUT', detail: 'een mHEV rijdt volgens de app elektrisch' };
      if (!window.PLBerekend || !PLBerekend.DEFS.CA18) return { staat: 'FOUT', detail: 'CA18 (vermogensvraag) ontbreekt' };
      if (!window.PLVisProfiel) return { staat: 'FOUT', detail: 'PLVisProfiel ontbreekt' };
      var ring = PLVisProfiel.indeling('hyperlane', function () { return true; }, 'hybride', {}).plekken.toeren;
      if (ring !== 'CA18') return { staat: 'FOUT', detail: 'Hyperlane op een hybride toont ' + ring + ' op de grote ring' };
      var vormen = (window.DEMO_CARS || []).map(function (c) { return c.aandrijving && c.aandrijving.vorm; }).filter(Boolean);
      if (['mild', 'serieel', 'plugin', 'vol'].some(function (v) { return vormen.indexOf(v) < 0; })) return { staat: 'FOUT', detail: 'demo-auto\'s per vorm: ' + vormen.join(',') };
      var ap = aandrijfProfielLive();
      return { staat: 'OK', detail: 'deze auto: verbranding ' + (ap.verbranding || 'geen') + ', vorm ' + (ap.vorm || 'onbekend') + (ap.elektrisch ? ', rijdt elektrisch' : '') };
    }
  },

  // ── Aandrijfvorm: mild, vol, plug-in, serieel (07-11-2026) ──
  {
    issue: '—',
    naam: 'De aandrijfvorm komt uit het RDW (mild hybride = zijn verbranding), stuurt de balk (Zeilen, Motor laadt accu), zet de versnellingen uit bij e-CVT/serieel en vertelt de AI hoe lang de motor tijdens het rijden uit stond',
    waarom: 'Een mild hybride (Swift, Puma, CX-5 vanaf 2021) stond als hybride in de app en kreeg EV-logica; een hybride op de accu las als dode toerentalsensor in rapport en AI. Ontbreekt een van de schakels in de draaiende app, dan valt alles stil terug op het oude gedrag.',
    proef: async function () {
      if (typeof aandrijfUitRdw !== 'function') return { staat: 'FOUT', detail: 'aandrijfUitRdw ontbreekt — herladen?' };
      var m = aandrijfUitRdw([{ brandstof_omschrijving: 'Elektriciteit', netto_max_vermogen_elektrisch: '5.10', klasse_hybride_elektrisch_voertuig: 'NOVC-HEV' },
        { brandstof_omschrijving: 'Benzine', nettomaximumvermogen: '121.00', klasse_hybride_elektrisch_voertuig: 'NOVC-HEV' }], 'MAZDA');
      if (!m || m.vorm !== 'mild' || m.brandstof !== 'benzine') return { staat: 'FOUT', detail: 'CX-5 mild hybride (5,1 kW) wordt ' + (m && m.vorm) + '/' + (m && m.brandstof) };
      var K = window.PLKenmerk, A = window.PLAandrijving;
      if (!K || !A || typeof A.rit !== 'function') return { staat: 'FOUT', detail: 'PLKenmerk of PLAandrijving.rit ontbreekt — herladen?' };
      if (K.profiel({ brandstof: 'benzine', aandrijving: m }).mild_hybride.waarde !== true) return { staat: 'FOUT', detail: 'PLKenmerk ziet de vorm niet' };
      var r = null, t = 0;
      for (var i = 0; i < 8; i++) r = A.bepaal({ rpm: 1800, snelheid: 60, t: t += 250, vorm: 'mild' }, r);
      for (var j = 0; j < 8; j++) r = A.bepaal({ rpm: 0, snelheid: 45, t: t += 250, vorm: 'mild' }, r);
      if (r.toestand !== 'ZEILEN') return { staat: 'FOUT', detail: 'mild hybride die uitrolt is ' + r.toestand };
      if (typeof _plAandrijfPromptRegels !== 'function') return { staat: 'FOUT', detail: 'de AI-regel over de aandrijving ontbreekt' };
      if (!window.PLGear || typeof PLGear._zonderVersnellingen !== 'function') return { staat: 'FOUT', detail: 'PLGear kent de aandrijfvorm niet' };
      var vi = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
      var hier = vi.aandrijving && vi.aandrijving.vorm ? 'deze auto: ' + vi.aandrijving.vorm + ' (' + vi.aandrijving.bron + ')' : 'deze auto: geen RDW-vorm (kenteken niet geladen?)';
      return { staat: 'OK', detail: 'mild → benzine + Zeilen; ' + hier };
    }
  },

  // ── Schermtimers slapen, Hyperlane op tempo (07-11-2026) ──
  {
    issue: '#691',
    naam: 'De drie schermtimers hangen aan PLRust en lopen nu de app in beeld is; Hyperlane kent het beeldtempo (60 per seconde, 30 in rust)',
    waarom: 'Uit beeld worden de monitorchip, het bulkdashboard en de monitorknop niet meer ververst. Hangt een timer niet aan PLRust, dan maakt hij de processor met het scherm uit nog elke seconde wakker; loopt er in beeld geen, dan staat de chip stil. Hoeveel accu het scheelt is een vraag voor de rit zelf (Android-batterijstatistiek).',
    proef: async function () {
      var R = window.PLRust, H = window.PLHyperlane;
      if (!R || typeof R.taken !== 'function') return { staat: 'FOUT', detail: 'PLRust ontbreekt — herladen?' };
      var t = R.taken(), namen = t.map(function (x) { return x.naam; }).sort().join(',');
      if (namen !== 'bulkdashboard,monitorchip,monitorknop') return { staat: 'FOUT', detail: 'schermtimers aan PLRust: ' + (namen || 'geen') };
      if (document.visibilityState === 'hidden') return { staat: 'LET OP', detail: 'pagina niet in beeld: niet te zien of ze lopen' };
      var stil = t.filter(function (x) { return !x.loopt; }).map(function (x) { return x.naam; });
      if (stil.length) return { staat: 'FOUT', detail: 'in beeld, en toch stil: ' + stil.join(', ') };
      if (!H || typeof H.beeldOverslaan !== 'function') return { staat: 'FOUT', detail: 'PLHyperlane.beeldOverslaan ontbreekt — herladen?' };
      if (H.beeldOverslaan(1000 / 60, false) || !H.beeldOverslaan(1000 / 120, false) || !H.beeldOverslaan(1000 / 60, true)) return { staat: 'FOUT', detail: 'beeldtempo klopt niet: 60 Hz moet tekenen, 120 Hz om het andere beeld, rust 30' };
      return { staat: 'OK', detail: '3 schermtimers lopen in beeld; Hyperlane 60/30 per seconde' };
    }
  },

  // ── Het startscherm in drie lagen (06-11-2026) ──
  {
    issue: '—',
    naam: 'Home volgt de verbinding: zonder adapter alleen "Verbind adapter", verbonden "Check mijn auto" of "Naar Live"; de chips lezen de meting van nu en Expert op afstand staat in Meer, niet op Home',
    waarom: 'Het startscherm (PLThuis) vervangt zes losse kaarten door één held met één hoofdknop. Kiest hij de verkeerde knop, dan zegt Home "Check" zonder adapter of "Verbind" terwijl de auto praat — en dat merk je alleen in de auto. Deze proef leest de geladen kern en het getekende scherm.',
    proef: async function () {
      var T = window.PLThuis;
      if (!T || !T._kern) return { staat: 'FOUT', detail: 'PLThuis ontbreekt — herladen?' };
      T.teken();
      var verb = (typeof connected !== 'undefined' && !!connected) || (typeof demoMode !== 'undefined' && !!demoMode);
      var zicht = function (id) { var e = document.getElementById(id); return !!e && !e.hidden; };
      if (!document.getElementById('plThuisHeld')) return { staat: 'FOUT', detail: 'de held (#plThuisHeld) is niet getekend' };
      if (verb && zicht('plVerbindBtn')) return { staat: 'FOUT', detail: 'verbonden, en Home vraagt toch om te verbinden' };
      if (!verb && !zicht('plVerbindBtn')) return { staat: 'FOUT', detail: 'geen verbinding, en Home toont geen Verbind adapter' };
      if ([zicht('plVerbindBtn'), zicht('plCheckBtn'), zicht('plLiveBtn')].filter(Boolean).length !== 1) return { staat: 'FOUT', detail: 'niet precies één hoofdknop in beeld' };
      if (document.querySelector('#wmDoors #plExpertDeel, #wmDoors .pl-expert')) return { staat: 'FOUT', detail: 'Expert op afstand staat weer op Home' };
      if (!document.querySelector('#kebabMenu #plExpertDeel') || !document.getElementById('kbThuis')) return { staat: 'FOUT', detail: 'Meer mist Expert op afstand of Startscherm aanpassen' };
      var kw = typeof pidVals !== 'undefined' && pidVals ? pidVals['0105'] : null;
      var chip = document.querySelector('#plThuisChips [data-k="koel"] b');
      if (verb && kw != null && chip && chip.textContent !== Math.round(Number(kw)) + '°') return { staat: 'FOUT', detail: 'koelwater-chip ' + chip.textContent + ' terwijl pidVals ' + kw + ' zegt' };
      if (!verb) return { staat: 'LET OP', detail: 'niet verbonden: alleen de knop zonder adapter getoetst' };
      return { staat: 'OK', detail: 'hoofdknop ' + (zicht('plCheckBtn') ? 'Check' : 'Live') + ', koelwater-chip ' + (chip ? chip.textContent : '—') };
    }
  },

  // ── Het OBDb-bereik ook met eenheid (06-11-2026) ──
  {
    issue: '#670',
    naam: 'Een OBDb-code met eenheid wordt gekeurd op het bereik van OBDb: boven max is een verkeerde schaal (22038E Mazda: 321 V voor een 0–5 V-sensor), max 1 telt niet',
    waarom: 'OBDb kapt in zijn eigen decoder af op max. De spanning van de verdampingsdrukopnemer van de CX-5 (22038E) gaf zo 321,7 V, en de app bood hem aan, omdat V tot 1000 mag (hoogvoltaccu). Bij Ford is dezelfde code gecorrigeerd (OBDb Ford-Mustang #428), bij Mazda nog niet (#1036 gesloten). Deze proef toetst de geladen obdbKandidaten() en plausibel().',
    proef: async function () {
      var E = window.PLEigen, Z = window.PLPidZoek;
      if (!E || typeof E.obdbKandidaten !== 'function' || !Z || typeof Z.plausibel !== 'function') return { staat: 'FOUT', detail: 'PLEigen/PLPidZoek ontbreekt — herladen?' };
      var k = E.obdbKandidaten({ commands: [
        { hdr: '7E0', rax: '7E8', cmd: { '22': '038E' }, signals: [{ name: 'Evaporative vapor pressure sensor voltage', fmt: { len: 16, max: 5, div: 5.0048876, sign: true, unit: 'volts' } }] },
        { hdr: '713', rax: '77D', cmd: { '22': '18B6' }, signals: [{ name: 'Odometer, last activated', fmt: { bix: 8, len: 24, max: 1, unit: 'kilometers' } }] }] }, 'x', 2019);
      var ev = k.filter(function (x) { return x.code === '22038E'; })[0], km = k.filter(function (x) { return x.code === '2218B6'; })[0];
      if (!ev || ev.obdbMax !== 5) return { staat: 'FOUT', detail: '22038E draagt het OBDb-maximum niet mee: ' + JSON.stringify(ev) };
      if (!km || km.obdbMax !== undefined) return { staat: 'FOUT', detail: 'max 1 (plaatshouder) gaat toch mee als keuring: ' + JSON.stringify(km) };
      if (Z.plausibel({ ok: true, bytes: [6, 0x4A], waarde: 321.686, eenheid: 'V' }, ev).ok) return { staat: 'FOUT', detail: '321,7 V boven het OBDb-maximum van 5 V wordt goedgekeurd' };
      if (!Z.plausibel({ ok: true, bytes: [9, 0xC4], waarde: 2.5, eenheid: 'V' }, ev).ok) return { staat: 'FOUT', detail: '2,5 V binnen het OBDb-bereik wordt afgekeurd' };
      return { staat: 'OK', detail: 'boven OBDb-max = vreemd; max 1 en omrekeningen tellen niet' };
    }
  },

  // ── Besluit d deel 2: standen (05-11-2026) ──
  {
    issue: '#670',
    naam: 'Een stand uit OBDb (aan/uit, ja/nee, keuzelijst) is een kandidaat met een bitveld [b:n] en zijn lijst; een waarde buiten die lijst is vreemd',
    waarom: 'Besluit d deel 2: standen zijn meestal één bit (bix/len 1) of een map. Daarvoor kreeg de formuletaal [b:n], geteld zoals OBDb bix (bit 0 = de hoogste bit van A). Deze proef toetst de geladen formule(), obdbKandidaten() en plausibel().',
    proef: async function () {
      var E = window.PLEigen, Z = window.PLPidZoek;
      if (!E || typeof E.obdbKandidaten !== 'function' || typeof E.controleer !== 'function' || !Z || typeof Z.plausibel !== 'function') return { staat: 'FOUT', detail: 'PLEigen/PLPidZoek ontbreekt — herladen?' };
      var c = E.controleer({ code: '221001', naam: 'x', formule: '[5:1]' });
      if (!c.ok) return { staat: 'FOUT', detail: 'de formule [5:1] wordt geweigerd: ' + c.fout };
      if (c.def.parse([0x04]) !== 1 || c.def.parse([0xFB]) !== 0) return { staat: 'FOUT', detail: '[5:1] leest de verkeerde bit: 0x04 → ' + c.def.parse([0x04]) + ', 0xFB → ' + c.def.parse([0xFB]) };
      var d = { commands: [
        { hdr: '7E0', rax: '7E8', cmd: { '22': '1001' }, signals: [{ name: 'Cooling fan relay', fmt: { bix: 5, len: 1, max: 1, unit: 'offon' } }] },
        { hdr: '7E1', rax: '7E9', cmd: { '22': '1003' }, signals: [{ name: 'Current gear', fmt: { len: 8, map: { 1: { description: 'First gear' }, 2: { description: 'Second gear' }, 4: { description: 'Fourth gear' } } } }] }] };
      var k = E.obdbKandidaten(d, 'x', 2019);
      var kort = k.map(function (x) { return x.code + '=' + x.formule + (x.standen ? ' ' + Object.keys(x.standen).join('/') : ''); }).join(' | ');
      if (kort !== '221001=[5:1] 0/1 | 221003=A 1/2/4') return { staat: 'FOUT', detail: 'standen als kandidaat kloppen niet: ' + (kort || 'geen') };
      if (Z.plausibel({ ok: true, bytes: [3], waarde: 3, eenheid: '' }, k[1]).ok) return { staat: 'FOUT', detail: 'een waarde tussen twee standen (3) wordt goedgekeurd' };
      return { staat: 'OK', detail: 'stand: bitveld [b:n] zoals OBDb bix, kandidaat met zijn lijst, gekeurd op die lijst' };
    }
  },

  // ── Besluit d: getallen zonder eenheid (05-11-2026) ──
  {
    issue: '#670',
    naam: 'Een getal zonder eenheid uit OBDb (misfire- en kloptellers, lambda, overbrenging) is een kandidaat met zijn OBDb-bereik; een ruwe waarde of onbekende eenheid niet',
    waarom: 'Besluit d: 502 van de 1871 fabriekscodes op de nagebouwde vloot hadden geen eenheid. Getallen tellen nu als data en worden gekeurd op het bereik uit OBDb; standen (aan/uit, keuzelijst) volgen apart. Deze proef toetst de geladen obdbKandidaten() en plausibel().',
    proef: async function () {
      var E = window.PLEigen, Z = window.PLPidZoek;
      if (!E || typeof E.obdbKandidaten !== 'function' || !Z || typeof Z.plausibel !== 'function') return { staat: 'FOUT', detail: 'PLEigen/PLPidZoek ontbreekt — herladen?' };
      var d = { commands: [
        { hdr: '7E0', rax: '7E8', cmd: { '22': '0707' }, signals: [{ name: 'Misfire counter, cylinder 1', fmt: { len: 16, max: 65535, unit: 'scalar' } }] },
        { hdr: '7E0', rax: '7E8', cmd: { '22': '0808' }, signals: [{ name: 'Sensor, raw count', fmt: { len: 8, max: 255, unit: 'scalar' } }] },
        { hdr: '7E0', rax: '7E8', cmd: { '22': '0909' }, signals: [{ name: 'Rail pressure', fmt: { len: 16, unit: 'unknown' } }] }] };
      var k = E.obdbKandidaten(d, 'x', 2019).map(function (x) { return x.code + (x.eenheid ? ' ' + x.eenheid : '') + (x.max !== undefined ? ' ≤' + x.max : ''); });
      if (k.join() !== '220707 ≤65535') return { staat: 'FOUT', detail: 'kandidaten zonder eenheid kloppen niet: ' + (k.join(' | ') || 'geen') + ' (verwacht alleen 220707 met bereik)' };
      if (Z.plausibel({ ok: true, bytes: [1, 2], waarde: 70000, eenheid: '' }, { naam: 'x', min: 0, max: 65535 }).ok) return { staat: 'FOUT', detail: 'een getal buiten het OBDb-bereik wordt goedgekeurd' };
      return { staat: 'OK', detail: 'getal zonder eenheid: kandidaat met bereik; ruw en onbekend vallen af' };
    }
  },

  // ── Voorselectie op rol (05-11-2026) ──
  {
    issue: '#675',
    naam: 'Grondig vinkt vooraf aan wat het bandenvenster, de laadregeling en de slipanalyse op hun rol lezen: banden (op verzoek), per laadrol één code, en vier wielen of geen',
    waarom: 'Op de nagebouwde CX-5 bleven na de wizard alle acht banden, de vier wielsnelheden en de gevraagde laadspanning liggen: voorkeus() koos alleen uit de groep weergave, terwijl laadCodes(), wielCodes() en het bandenvenster alleen opgenomen eigen PIDs lezen. Deze proef toetst de geladen voorkeus() en, met een voertuig, wat er nu opgenomen staat.',
    proef: async function () {
      var Z = window.PLPidZoek, E = window.PLEigen;
      if (!Z || typeof Z.voorkeus !== 'function' || typeof Z.tempo !== 'function') return { staat: 'FOUT', detail: 'PLPidZoek.voorkeus/tempo ontbreekt — pidlane-pidzoek.js niet bijgewerkt (herladen?)' };
      var b = function (code, naam) { return { b: { code: code, ecu: '', naam: naam } }; };
      var g = { banden: [b('222A05', 'Rear left tire pressure')], wielen: ['VL', 'VR', 'AL', 'AR'].map(function (p, i) { var x = b('222B0' + i, 'w' + p); x.wiel = p; return x; }),
        analyse: [Object.assign(b('220304', 'Commanded generator voltage'), { laad: 'gevraagd' })], weergave: [b('221310', 'Olie')] };
      var k = Z.voorkeus(g, 6);
      if (k.indexOf('222A05@') < 0) return { staat: 'FOUT', detail: 'een band wordt niet vooraf aangevinkt: het bandenvenster blijft na de wizard leeg' };
      if (k.indexOf('220304@') < 0) return { staat: 'FOUT', detail: 'de gevraagde laadspanning wordt niet aangevinkt: de laadregeling valt terug op de vaste grens' };
      if (k.filter(function (x) { return /^222B0/.test(x); }).length !== 4) return { staat: 'FOUT', detail: 'de wielen komen niet als set van vier: ' + k.join(',') };
      if (Z.tempo('leeftijd') !== 'minuut') return { staat: 'FOUT', detail: 'een acculeeftijd krijgt geen tempo "minuut"' };
      var lc = (E && E.laadCodes) ? E.laadCodes() : {}, wc = (E && E.wielCodes) ? E.wielCodes() : null;
      return { staat: 'OK', detail: 'voorselectie klopt; opgenomen op deze auto: laadrollen ' + (Object.keys(lc).join(', ') || 'geen') + ', wielen ' + (wc ? 'alle vier' : 'geen set') };
    }
  },

  // ── Spook-PIDs na Snel (05-11-2026) ──
  {
    issue: '#616',
    naam: 'Wat deze sessie NO DATA gaf (een onaangekondigd steunblok, of een PID die los gemeten werd) houdt de merkpreset tegen — al vóór Grondig',
    waarom: 'De Nissan Leaf heeft geen mode 01; na Snel zette de preset er toch elf PIDs in (bproef-dekking.js). Deze proef toetst op de verbonden auto dat elke PID die deze sessie NO DATA gaf ook door magToevoegen() geweigerd wordt, tenzij een steunbit hem bevestigt.',
    proef: async function () {
      if (typeof window.steunNeeRuw !== 'function' || typeof magToevoegen !== 'function' || typeof ecuSteunt !== 'function') return { staat: 'FOUT', detail: 'steunNeeRuw/magToevoegen ontbreekt — pidlane-rijsituatie.js niet bijgewerkt (herladen?)' };
      var nee = window.steunNeeRuw();
      if (!nee.length) return { staat: connected ? 'OK' : 'LET OP', detail: connected ? 'deze sessie gaf geen NO DATA op een steunblok of een losse meting — niets tegen te houden' : 'niet verbonden: na een verbinding staat hier wat de auto NO DATA gaf' };
      var lek = nee.filter(function (p) { return ecuSteunt(p) !== true && magToevoegen(p); });
      if (lek.length) return { staat: 'FOUT', detail: 'gemeten NO DATA en toch toegestaan voor de preset: ' + lek.slice(0, 8).join(', ') };
      var spook = nee.filter(function (p) { return supportedPIDs.has(p) && ecuSteunt(p) !== true && (typeof presetAanname !== 'function' || presetAanname().indexOf(p) >= 0); });
      if (spook.length) return { staat: 'FOUT', detail: 'de preset zette er toch neer: ' + spook.join(', ') };
      return { staat: 'OK', detail: nee.length + ' PIDs gaven deze sessie NO DATA; de preset slaat ze over' };
    }
  },

  // ── VAG 29-bit 17FC00xx>17FE00xx (05-11-2026) ──
  {
    issue: '#670',
    naam: 'Fabriekscodes op VAG 29-bit (OBDb hdr FC00, ID.3) en BMW/MINI extended addressing: 17FC0076>17FE0076 met ATCP17, 6F1:12>612 met ATCEA12',
    waarom: 'De ID.3 haalde op de nagebouwde vloot 21 %, de Mini 44 % en de BMW 73 %: hun fabriekscodes staan op 17FC00xx of op 6F1 met een adresbyte, en obdbAdres() liet ze vallen. Deze proef toetst de geladen regels: het adres uit OBDb, de keuring van zo’n eigen PID, en dat FC00 zonder prioriteit of doeladres wegblijft.',
    proef: async function () {
      var E = window.PLEigen;
      if (!E || typeof E.obdbAdres !== 'function' || typeof E.controleer !== 'function') return { staat: 'FOUT', detail: 'PLEigen.obdbAdres/controleer ontbreekt — pidlane-uitgebreid.js niet geladen (herladen?)' };
      var a = E.obdbAdres({ hdr: 'FC00', rax: 'FE0076', pri: '17', tst: '76' });
      if (a !== '17FC0076>17FE0076') return { staat: 'FOUT', detail: 'OBDb FC00/FE0076/pri 17/tst 76 gaf ' + a + ' in plaats van 17FC0076>17FE0076 — pidlane-uitgebreid.js niet bijgewerkt (herladen?)' };
      if (E.obdbAdres({ hdr: 'FC00', rax: 'FE007B' }) !== null) return { staat: 'FOUT', detail: 'FC00 zonder pri/tst krijgt toch een adres: dat is een gok op de bus' };
      var k = E.controleer({ code: '220335', naam: 'Motorkoppel voor', formule: 'S16(A*256+B)', eenheid: 'Nm', ecu: a });
      if (!k || !k.ok) return { staat: 'FOUT', detail: 'een eigen PID op 17FC0076>17FE0076 wordt geweigerd: ' + (k && k.fout) };
      var b = E.obdbAdres({ hdr: '6F1', rax: '612', eax: '12' });
      if (b !== '6F1:12>612') return { staat: 'FOUT', detail: 'OBDb 6F1/612/eax 12 gaf ' + b + ' in plaats van 6F1:12>612 — pidlane-uitgebreid.js niet bijgewerkt (herladen?)' };
      var kb = E.controleer({ code: '22400B', naam: 'Lambda', formule: 'A', eenheid: 'V', ecu: b });
      if (!kb || !kb.ok) return { staat: 'FOUT', detail: 'een eigen PID op 6F1:12>612 wordt geweigerd: ' + (kb && kb.fout) };
      return { staat: 'OK', detail: 'adressen en keuring kloppen; op een echte ID.3 of BMW zegt het sensorscherm (Test) of ATCP17/ATCEA door de adapter komt' };
    }
  },

  // ── OBDb-steunlijst per bouwjaar (05-11-2026) ──
  {
    issue: '#670',
    naam: 'Grondig zoeken vraagt alleen de fabriekscodes die dit bouwjaar in OBDb beantwoordde, zonder kap van 60; de preset verliest wat OBDb niet kent (#616)',
    waarom: 'Op de nagebouwde vloot (bproef-dekking.js) kwam 2254 keer een code nooit aan de beurt door de kap van 60, en weigerde de auto 1515 geprobeerde codes. De Worker haalt nu command_support.yaml van het bouwjaar (obdb_steun); deze proef toetst de geladen regel en, met een voertuig, of de steunlijst echt binnenkomt.',
    proef: async function () {
      var E = window.PLEigen;
      if (!E || typeof E.obdbSteun !== 'function') return { staat: 'FOUT', detail: 'PLEigen.obdbSteun ontbreekt — pidlane-uitgebreid.js niet bijgewerkt (herladen?)' };
      var st = E.obdbSteun('model_year: 2018\nsupported_commands_by_ecu:\n  "720":\n  - 720.728.222A05:X\n  "7E0":\n  - 0105:ECT\nunsupported_commands_by_ecu:\n  "720":\n  - 720.728.22C901:Y\n');
      if (st.jaar !== 2018 || !st.codes['222A05@720'] || st.codes['22C901@720'] || st.mode01.join() !== '0105') return { staat: 'FOUT', detail: 'obdbSteun() leest de lijst verkeerd: ' + JSON.stringify(st) };
      var veel = { commands: [] }, codes = {};
      for (var i = 0; i < 70; i++) { var c = (0x1000 + i).toString(16).toUpperCase(); veel.commands.push({ hdr: '7E0', rax: '7E8', cmd: { '22': c }, signals: [{ name: 'T' + i, fmt: { len: 8, add: -40, unit: 'celsius' } }] }); codes['22' + c + '@7E0'] = 1; }
      if (E.obdbKandidaten(veel, 'x', 2018, null, { jaar: 2018, n: 70, codes: codes, mode01: [] }).length !== 70) return { staat: 'FOUT', detail: 'met een steunlijst blijft de kap van 60 staan' };
      if (typeof presetNaSteun !== 'function' || typeof presetAanname !== 'function') return { staat: 'FOUT', detail: 'presetNaSteun ontbreekt — pidlane-rijsituatie.js niet bijgewerkt (herladen?): de aannames van de preset blijven staan (#616)' };
      var aan = presetAanname();
      if (aan.length) btDiag('Blok 5: de preset heeft nu ' + aan.length + ' aangenomen sensoren zonder steunbit: ' + aan.join(', '), 'ok');
      var u = window.currentUser, rol = u && String(u.role || '').toLowerCase();
      if (typeof plFetch !== 'function' || (rol !== 'klant' && rol !== 'admin')) return { staat: 'LET OP', detail: 'regels kloppen; nodig: ingelogd als klant, dan vraagt deze proef de Worker om de steunlijst van de Mazda-CX-5 2018' };
      try {
        var r = await plFetch('/klant/platform', { method: 'POST', json: { actie: 'obdb_steun', repo: 'Mazda-CX-5', jaar: 2018 } });
        var d = await r.json();
        if (!d || !d.ok || !d.gevonden || !/supported_commands_by_ecu/.test(d.tekst || '')) return { staat: 'FOUT', detail: 'obdb_steun gaf geen steunlijst voor Mazda-CX-5 2018: ' + JSON.stringify(d).slice(0, 120) };
        var s2 = E.obdbSteun(d.tekst);
        return { staat: 'OK', detail: 'Worker geeft de steunlijst: Mazda-CX-5 ' + d.jaar + ', ' + s2.n + ' fabriekscodes, ' + s2.mode01.length + ' mode-01-PIDs' };
      } catch (e) { return { staat: 'LET OP', detail: 'regels kloppen; obdb_steun niet te bereiken: ' + (e && e.message || e) }; }
    }
  },

  // ── De setup-wizard (04-11-2026) ──
  {
    issue: '—',
    naam: 'Setup-wizard: na de eerste verbinding per voertuig het keuzevenster (inrichten of meteen rijden), en later verder waar de klant bleef',
    waarom: 'Vraag van de eigenaar: na account, inloggen, adapter en protocol moet één wizard de app compleet maken. Deze proef toetst de geladen modules: PLInrichten en de haken in Mijn voertuigen bestaan, de menuregel staat er, en voor de verbonden auto zegt hij wat er gekozen is en hoe ver de wizard kwam.',
    proef: async function () {
      var I = window.PLInrichten, G = window.PLGarage;
      if (!I || !I._kern || typeof I.vraagNaVerbinding !== 'function') return { staat: 'FOUT', detail: 'PLInrichten ontbreekt — pidlane-inrichten.js niet geladen (herladen?)' };
      if (!G || typeof G.inrichtVoertuig !== 'function' || typeof G.inrichtBewaar !== 'function') return { staat: 'FOUT', detail: 'PLGarage zonder inrichtVoertuig/inrichtBewaar — pidlane-garage.js niet bijgewerkt (herladen?)' };
      if (!document.getElementById('kbInrichten')) return { staat: 'FOUT', detail: 'Meer → Setup-wizard (#kbInrichten) staat niet in het menu' };
      var K = I._kern;
      if (K.moetVragen({ keuze: 'rijden' }, {}) || !K.moetVragen(null, {}) || K.moetVragen(null, { hervat: true })) return { staat: 'FOUT', detail: 'moetVragen() vraagt op het verkeerde moment' };
      var v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {}, ken = '';
      try { ken = localStorage.getItem('pl_kenteken') || ''; } catch (e) { console.warn('blok 5: kenteken onleesbaar', e); }
      var sl = K.sleutelVan({ vin: v.vin, kenteken: ken }), st = null;
      try { st = K.normaliseer(JSON.parse(localStorage.getItem(sl) || 'null')); } catch (e) { return { staat: 'FOUT', detail: 'wizardstand onleesbaar: ' + e.message }; }
      if (typeof connected === 'undefined' || !connected) return { staat: 'LET OP', detail: 'regels kloppen; nodig voor de rit: verbinden met een auto die nog niet ingericht is, kies Inrichten en loop alle stappen af' };
      var vg = K.voortgang(st, { platform: true, akkoord: !!(G.akkoordNu && G.akkoordNu()), verbonden: true });
      return { staat: 'OK', detail: 'deze auto: keuze ' + (st.keuze || 'nog niets') + ', ' + vg.gedaan + ' van ' + vg.totaal + ' stappen' + (vg.over.length ? ', overgeslagen: ' + vg.over.join(', ') : '') };
    }
  },

  // ── Kanteling grijs bij een drempel (02-11-2026) ──
  {
    issue: '—',
    naam: 'Helling en kanteling: remmen of een bocht met een oude snelheid maakt ze niet meer grijs; het verslag zegt waarom ze grijs waren',
    waarom: 'Uit het gebruik: "de kanteling gaat heel snel op grijs bij een drempel". Nagebouwd: niet de drempel, maar remmen of een bocht terwijl 010D ouder was dan 2 s. Verschoven telt nu pas na 2 s, en de bocht rekent met een snelheid tot 10 s oud. Deze proef toetst de geladen regel en leest per reden hoe lang hij niet vast was.',
    proef: async function () {
      var T = window.PLTelemetrie;
      if (!T || !T.HOUDER || typeof T.HOUDER.verschovenMs !== 'number' || !T.SNEL_DWARS_MS) return { staat: 'FOUT', detail: 'PLTelemetrie zonder verschovenMs — pidlane-telemetrie.js niet bijgewerkt (herladen?)' };
      var goed = { vers: true, genuld: true, afwijking: 20, wiebel: 2, wiebelMs: 0, okMs: 6000 };
      if (!T.houder(Object.assign({}, goed, { verschovenMs: 500 })).vast) return { staat: 'FOUT', detail: 'een afwijking van 0,5 s telt al als verschoven' };
      if (T.houder(Object.assign({}, goed, { verschovenMs: 3000 })).vast) return { staat: 'FOUT', detail: 'een afwijking van 3 s telt als vast — een telefoon op schoot glipt erdoor' };
      if (!T.beschikbaar() || !T.genuld()) return { staat: 'LET OP', detail: 'regel klopt; nodig voor de rit: tablet of telefoon vast in de houder, Nulstellen, een paar drempels en bochten' };
      var s = T.stats().houder, r = s.redenS || {};
      var waarom = Object.keys(r).length ? Object.keys(r).map(function (k) { return k + ' ' + r[k] + ' s'; }).join(', ') : 'nooit';
      var bewijs = 'vast ' + s.vastS + ' s, niet vast ' + s.losS + ' s (' + waarom + '); grootste afwijking ' + s.maxAfwijking + '°, oudste snelheid ' + s.snelOudS + ' s';
      if (s.vastS + s.losS >= 60 && s.losS > 0.1 * (s.vastS + s.losS)) return { staat: 'LET OP', detail: bewijs + ' — nog vaak grijs: de reden hierboven zegt waar het zit' };
      return { staat: 'OK', detail: bewijs };
    }
  },

  // ── Hyperlane als cockpit op een tablet (02-11-2026) ──
  {
    issue: '—',
    naam: 'Hyperlane-cockpit: op een tablet liggend G, pedalen, temperaturen, autootje en grafiek; op een telefoon niets extra',
    waarom: 'Uit het gebruik: "Hyperlane op een tablet in full screen, alle schermen bij elkaar". Deze proef toetst de geladen modules op dit scherm: de cockpit staat aan als het scherm een tablet liggend is, het profiel vraagt dan rempedaal en helling erbij, en op een telefoon niet (geen extra bustijd).',
    proef: async function () {
      var H = window.PLHyperlane, P = window.PLVisProfiel;
      if (!H || typeof H.cockpitMaat !== 'function') return { staat: 'FOUT', detail: 'PLHyperlane zonder cockpit — pidlane-hyperlane.js niet bijgewerkt (herladen?)' };
      if (!P || typeof P.cockpitHtml !== 'function') return { staat: 'FOUT', detail: 'PLVisProfiel zonder cockpit — pidlane-visprofiel.js niet bijgewerkt (herladen?)' };
      if (H.cockpitMaat(915, 412) || !H.cockpitMaat(1280, 800)) return { staat: 'FOUT', detail: 'cockpitMaat haalt telefoon en tablet door elkaar' };
      var rollen = P.voor('hyperlane', null).plekken.map(function (x) { return x.rol; });
      var ck = H.cockpitNu(), heeft = rollen.indexOf('rem') >= 0 && rollen.indexOf('helling') >= 0;
      if (ck !== heeft) return { staat: 'FOUT', detail: 'cockpit ' + (ck ? 'aan' : 'uit') + ' maar rempedaal/helling ' + (heeft ? 'wel' : 'niet') + ' in het profiel' };
      if (!ck) return { staat: 'LET OP', detail: 'dit scherm is geen tablet liggend (' + window.innerWidth + '×' + window.innerHeight + '): de cockpit staat terecht uit; draai de proef op een tablet voor het beeld' };
      return { staat: 'OK', detail: 'open Hyperlane op volledig scherm: G-cirkel en pedalen links, temperaturen midden, autootje rechts, grafiek boven' };
    }
  },

  // ── Wizardplan: namen die zeggen wat er gebeurt (02-11-2026) ──
  {
    issue: '—',
    naam: 'Wizardplan: elke meting en analyse heet naar wat hij doet, met de duur erbij',
    waarom: 'Uit het gebruik: de namen in het plan (Systeemtest, Totaalcheck, AI-monteur …) zeiden niet wat er ging gebeuren; Rapport aanvragen was duidelijker. Deze proef toetst het geladen plan, niet de broncode.',
    proef: async function () {
      var W = window.PLWizard;
      if (!W || typeof W.open !== 'function') return { staat: 'LET OP', detail: 'PLWizard niet geladen' };
      var oud = /Systeemtest|Totaalcheck|AI-monteur|Dit ga ik doen|Passief meelopen|Stilstaand meten/;
      var M = W._modules;
      if (!M) return { staat: 'FOUT', detail: 'PLWizard._modules ontbreekt — pidlane-wizard.js niet bijgewerkt (herladen?)' };
      var src = JSON.stringify(Object.keys(M).map(function (k) { return M[k].n; }));
      var zonder = Object.keys(M).filter(function (k) { return !M[k].d; });
      if (zonder.length) return { staat: 'FOUT', detail: 'zonder uitleg: ' + zonder.join(', ') };
      if (oud.test(src)) return { staat: 'FOUT', detail: 'nog een oude naam in het plan: ' + src.match(oud)[0] };
      return { staat: 'OK', detail: 'open Er is iets mis → plan: kopjes "Stap 1 · Eerst meten" en "Stap 2 · Kies wat je wilt weten", elke regel met wat hij doet' };
    }
  },

  // ── Hyperlane: de stand zelf kiezen (01-11-2026) ──
  {
    issue: '—',
    naam: 'Hyperlane: de stand (Auto, Eco, Sport, Cruise) kiest de strook en houdt het label vast',
    waarom: 'Uit het gebruik: "hij schakelt vanzelf van stil naar remmen naar eco … laat de klant kiezen". Deze proef toetst de geladen modules: elke stand heeft zijn strook, koelwater en gas blijven in elke stand in de indeling, en het koelwateralarm gaat voor op de gekozen stand.',
    proef: async function () {
      var H = window.PLHyperlane, P = window.PLVisProfiel;
      if (!H || typeof H.standLabel !== 'function' || typeof H.stand !== 'function') return { staat: 'FOUT', detail: 'PLHyperlane zonder standen — pidlane-hyperlane.js niet bijgewerkt (herladen?)' };
      if (!P || !P.STROOK || typeof P.strookRollen !== 'function') return { staat: 'FOUT', detail: 'PLVisProfiel zonder STROOK — pidlane-visprofiel.js niet bijgewerkt (herladen?)' };
      if (H.standLabel('alarm', 'sport', 'KOELWATER') !== 'KOELWATER') return { staat: 'FOUT', detail: 'het koelwateralarm verdwijnt achter de gekozen stand' };
      if (H.standLabel('stil', 'eco', 'STIL') !== 'ECO') return { staat: 'FOUT', detail: 'een gekozen stand wisselt toch mee met de scène' };
      var mis = [];
      H.STANDEN.forEach(function (st) {
        var p = P.voor('hyperlane', null, st), r = p.plekken.map(function (x) { return x.rol; });
        if (r.indexOf('koel') < 0 || r.indexOf('gas') < 0) mis.push(st + ': geen koelwater of gas');
        if (P.strookRollen(p, st).length !== 3) mis.push(st + ': strook ' + P.strookRollen(p, st).join(','));
      });
      if (mis.length) return { staat: 'FOUT', detail: mis.join(' · ') };
      return { staat: 'OK', detail: 'stand nu: ' + H.stand() + ' · strook ' + P.strookRollen(P.voor('hyperlane'), H.stand()).join(', ') };
    }
  },

  // ── Versnelling snel, schakellampjes en de pijl (31-10-2026) ──
  {
    issue: '—',
    naam: 'Versnelling: het cijfer volgt de schakeling, en de lampjes lopen naar het schakelpunt van CA11',
    waarom: 'Uit de auto: "hij staat al 2 s in de vier en zegt nog drie". PLGear wachtte op een stabiel venster plus wisselMs, Hyperlane nog eens 0,6 s. De vertraging zelf staat in test-gear.js; hier: de geladen modules en het schakelpunt bij de verhoudingen van déze auto.',
    proef: async function () {
      var G = window.PLGear, B = window.PLBerekend, H = window.PLHyperlane;
      if (!G || typeof G._snel !== 'function') return { staat: 'FOUT', detail: 'PLGear zonder snelle weergave — pidlane-gear.js niet bijgewerkt (herladen?)' };
      if (!B || typeof B.schakelPunt !== 'function' || typeof B.schakelBron !== 'function') return { staat: 'FOUT', detail: 'PLBerekend.schakelPunt ontbreekt — pidlane-berekend.js niet bijgewerkt (herladen?)' };
      if (!H || typeof H.schakelDoel !== 'function' || typeof H.pijlOp !== 'function') return { staat: 'FOUT', detail: 'PLHyperlane zonder schakelpunt — pidlane-hyperlane.js niet bijgewerkt (herladen?)' };
      var b = B.schakelBron(), r = b.ratios || {}, ks = Object.keys(r).map(Number).sort(function (x, y) { return x - y; });
      if (ks.length < 2) return { staat: 'LET OP', detail: 'modules geladen, maar nog geen geleerde versnellingen op deze auto' };
      var mis = [];
      ks.forEach(function (k) {
        var p = B.schakelPunt(k, r, b.diesel);
        if (p === null) return;
        if (!(B.schakelAdvies(50, p, k, r, b.diesel, 30) > k) || B.schakelAdvies(50, p - 1, k, r, b.diesel, 30) !== k) mis.push(k + 'e: ' + p);
      });
      if (mis.length) return { staat: 'FOUT', detail: 'schakelpunt en schakeladvies zeggen iets anders bij ' + mis.join(', ') };
      return { staat: 'OK', detail: 'schakelpunten ' + ks.map(function (k) { var p = B.schakelPunt(k, r, b.diesel); return k + 'e ' + (p === null ? '—' : p); }).join(' · ') + (b.diesel ? ' (diesel)' : '') };
    }
  },

  // ── RR: eigen meetopdrachten (31-10-2026) ──
  {
    issue: '—',
    naam: 'RR: een eigen meetopdracht meet alleen binnen zijn venster, op zijn tempo, in de gekozen eenheid',
    waarom: 'Uit een klantvraag: niet de bulkrecorder met alles, maar een paar punten naar eigen wens. De rekenregels staan in test-rr.js; hier gaat het om de geladen module en de sensoren van deze auto. Of een volle bus het tempo haalt, zegt een rit.',
    proef: async function () {
      var R = window.PLRR;
      if (!R || !R._kern || typeof R._kern.tik !== 'function') return { staat: 'FOUT', detail: 'PLRR ontbreekt — pidlane-rr.js niet geladen (herladen?)' };
      var n = R.normaliseer({ naam: 'proef', sensoren: [{ pid: '0105', eenheid: '°F' }], tempo: 2, venster: { voorwaarden: [{ pid: '0105', op: '>', waarde: 80 }] } });
      if (!n.ok) return { staat: 'FOUT', detail: 'een gewone RR wordt afgekeurd: ' + n.fout };
      var rr = R._kern.basisVan(n.rr); rr.sensoren[0].basis = '°C';
      var st = R._kern.nieuw(0);
      [[70, 0], [90, 1000], [91, 2000], [100, 3000]].forEach(function (x) { st = R._kern.tik(st, rr, { '0105': x[0] }, x[1]); });
      if (st.rijen.length !== 2) return { staat: 'FOUT', detail: 'verwacht 2 rijen (venster > 80, elke 2 s), kreeg ' + st.rijen.length };
      if (st.rijen[0][1] !== 194) return { staat: 'FOUT', detail: '90 °C werd ' + st.rijen[0][1] + ' in plaats van 194 °F' };
      var v = (window.PLGarage && PLGarage.actief) ? PLGarage.actief() : null;
      if (!v) return { staat: 'LET OP', detail: 'regels goed, maar geen actief voertuig in Mijn voertuigen' };
      var rrs = Array.isArray(v.rr) ? v.rr : [];
      return { staat: 'OK', detail: 'regels goed · ' + rrs.length + ' RR bij ' + (v.naam || 'dit voertuig') + (R.loopt().length ? ' · ' + R.loopt().length + ' loopt nu' : '') };
    }
  },

  // ── Weer en RDW elke dag (31-10-2026) ──
  {
    issue: '#556',
    naam: 'Het weer is vers bij de opstart en nooit van gisteren',
    waarom: 'Uit het gebruik: bij het opstarten was het profiel er nog niet, en dan wachtte de verwachting een kwartier; een verwachting van 23:50 gold om 00:10 nog als vers.',
    proef: async function () {
      var W = window.PLWeer;
      if (!W || typeof W.verlopen !== 'function') return { staat: 'FOUT', detail: 'PLWeer.verlopen ontbreekt — oude pidlane-weer.js (herladen?)' };
      var a = new Date(2026, 10, 20, 23, 50).getTime();
      if (!W.verlopen({ t: a }, a + 20 * 60e3)) return { staat: 'FOUT', detail: 'een verwachting van gisteren (20 min oud, over middernacht) geldt nog als vers' };
      var p = (window.PLWinter && PLWinter.profiel) ? PLWinter.profiel() : {};
      if (!p || !p.plaats) return { staat: 'LET OP', detail: 'regel goed, maar geen plaats in het winterprofiel: dan is er geen weer' };
      var c = W.laatst(p.plaats);
      if (!c) return { staat: 'LET OP', detail: 'regel goed, nog geen verwachting voor ' + W.naam(p.plaats) + ' (offline of net gestart)' };
      return { staat: W.verlopen(c, Date.now()) ? 'LET OP' : 'OK', detail: 'verwachting voor ' + c.naam + ' van ' + new Date(c.t).toLocaleString('nl') };
    }
  },

  // ── Tankvraag met buffer (31-10-2026) ──
  {
    issue: '#469',
    naam: 'Tanken: een helling of drempel is geen tankvraag meer, en na een vraag drie kwartier rust',
    waarom: 'Uit het gebruik: stilstaan op een helling gaf een scheef peil, en dat was al "Getankt?". Nu moet de sprong blijven staan als je wegrijdt. Of 90 s genoeg is op een echte helling, zegt een rit.',
    proef: async function () {
      var T = window.PLTank;
      if (!T || typeof T.peilTik !== 'function' || !T.CFG || !T.CFG.bevestigMs) return { staat: 'FOUT', detail: 'PLTank zonder buffer — oude pidlane-tank.js (herladen?)' };
      var loop = function (tikken, st) {
        var a = { pct: 40, t: 0 }, n = 0, t0 = Date.now();
        tikken.forEach(function (k, i) { var r = T.peilTik(st, k[0], k[1], t0 + i * 1e4, a); st = r.st; if (r.anker) a = r.anker; if (r.sprong) n++; });
        return { n: n, st: st };
      };
      var reeks = function (stil, rij) { var x = [], i; for (i = 0; i < 6; i++) x.push([50, 40]); for (i = 0; i < 8; i++) x.push([0, stil]); for (i = 0; i < 12; i++) x.push([50, rij]); return x; };
      if (loop(reeks(62, 40), {}).n) return { staat: 'FOUT', detail: 'een helling (62 % stil, 40 % rijdend) geeft nog een tankvraag' };
      var echt = loop(reeks(96, 95), {});
      if (echt.n !== 1) return { staat: 'FOUT', detail: 'echt tanken (40 → 96 %) gaf ' + echt.n + ' vragen in plaats van één' };
      if (loop(reeks(96, 95), echt.st).n) return { staat: 'FOUT', detail: 'binnen de pauze komt er alweer een tankvraag' };
      return { staat: 'OK', detail: 'bevestigen over ' + T.CFG.bevestigN + ' metingen (' + T.CFG.bevestigRij + ' rijdend, ≥ ' + T.CFG.bevestigMs / 1000 + ' s), pauze ' + T.CFG.pauzeMs / 60000 + ' min' };
    }
  },

  // ── Rustig in het midden van Hyperlane (30-10-2026) ──
  {
    issue: '—',
    naam: 'Het midden van Hyperlane wisselt hoogstens om de 6 s, een onbekende versnelling blijft staan, en bij vol gas geen verbruik',
    waarom: 'Uit het gebruik: in de stand Versnelling sprong het midden bij elke twijfel van PLGear naar een andere PID, en Slim wisselde zes keer per seconde. Hoe het op de weg leest, zegt een rit.',
    proef: async function () {
      var H = window.PLHyperlane;
      if (!H || typeof H.heldRustig !== 'function' || typeof H.gearRustig !== 'function') return { staat: 'FOUT', detail: 'PLHyperlane zonder rustig midden — oude pidlane-hyperlane.js (herladen?)' };
      var st = H.heldRustig(null, { l: 'VERBRUIK NU', w: '6,4', e: 'L/100' }, null, .15);
      st = H.heldRustig(st, { l: 'ACCELERATIE', w: '0,20', e: 'g' }, { w: '6,4', e: 'L/100' }, .15);
      if (st.l !== 'VERBRUIK NU') return { staat: 'FOUT', detail: 'het midden wisselt na 0,15 s al naar ' + st.l };
      var g = H.gearRustig(H.gearRustig(null, '3', .15), '', 5);
      if (g.toon !== '3') return { staat: 'FOUT', detail: 'een versnelling die 5 s onbekend is verdwijnt al uit het midden' };
      var tk = function (v, d) { return Number(v).toFixed(d || 0); };
      if (H.held('rijden', { koel: 90, verbruik: 30, gas: 100, versn: 8, launchS: null, klok: '' }, tk).l === 'VERBRUIK NU') return { staat: 'FOUT', detail: 'vol gas toont nog het verbruik' };
      return { staat: 'OK', detail: 'midden ' + (H.leesMidden ? H.leesMidden() : '?') + '; wacht ' + H.HELD_MIN_S + ' s, versnelling blijft ' + H.GEAR_LEEG_S + ' s staan' };
    }
  },

  // ── De conditiekaart (30-10-2026) ──
  {
    issue: '#475',
    naam: 'Het tabblad Conditie opent met de nieuwe kaart: ring met de score, vier delen, verloop en de grootste oorzaak',
    waarom: 'De kaart is puur en in test-conditie.js getoetst; hier gaat het erom dat de app de nieuwe pidlane-conditie.js laadt en dat de garage zijn vorm meeneemt.',
    proef: async function () {
      var C = window.PLConditie;
      if (!C || typeof C.kaart !== 'function' || typeof C.CSS !== 'string') return { staat: 'FOUT', detail: 'PLConditie zonder kaart — oude pidlane-conditie.js (herladen?)' };
      var h = C.kaart({ score: 50, deel: { onderhoud: 50, motor: null, brandstof: null, accu: null }, conditie: { klaar: false, nodig: 4 }, lijn: [], oorzaken: [] });
      var r = /stroke-dasharray="([\d.]+) ([\d.]+)"/.exec(h);
      if (!r || Math.abs(Number(r[1]) / Number(r[2]) - 0.5) > 0.01) return { staat: 'FOUT', detail: 'een score van 50 vult de ring niet half (' + (r && r[0]) + ')' };
      if (!/<b>nog 4<\/b>/.test(h)) return { staat: 'FOUT', detail: 'een deel zonder ritmeting zegt niet hoeveel ritten er nog nodig zijn' };
      var css = document.getElementById('plGarCss');
      if (css && css.textContent.indexOf('.cdk-ring{') < 0) return { staat: 'FOUT', detail: 'het stijlblok van de garage mist de vorm van de kaart' };
      return { staat: 'OK', detail: css ? 'kaart en vorm geladen' : 'kaart geladen; de garage was nog niet open, de vorm komt bij het openen' };
    }
  },

  // ── ATST aan de randen van contact uit (30-10-2026) ──
  {
    issue: '#509',
    naam: 'Een ATST-stap vlak vóór contact uit wordt teruggedraaid, en na contact aan telt de regelaar 15 s niet',
    waarom: 'Rit 30-10: drie stappen 0x16 → 0x64 aan de randen van contact uit, daarna de hele verbinding 400 ms per misser. Of het op de weg schoon blijft, zegt de meetproef van opdracht 41.',
    proef: async function () {
      var V = window.PLVerbind;
      if (!V || typeof V._randTerug !== 'function' || typeof plStRandTerug !== 'function') return { staat: 'FOUT', detail: 'PLVerbind zonder terugdraai voor de contactrand — oude pidlane-bt.js (herladen?)' };
      var r = plStRandTerug([{ t: 1000, oud: '16', bron: 'gemeten' }, { t: 5000, oud: '19', bron: 'bijgestuurd' }], 6000, ST_RAND_VOOR_MS);
      if (!r || r.hex !== '16' || r.n !== 2) return { staat: 'FOUT', detail: 'twee stappen in de rand geven ' + JSON.stringify(r) + ' in plaats van terug naar 0x16' };
      if (plStRandTerug([{ t: 1000, oud: '16' }], 1000 + ST_RAND_VOOR_MS + 1, ST_RAND_VOOR_MS) !== null) return { staat: 'FOUT', detail: 'een stap ruim vóór de stilte zou ook teruggedraaid worden' };
      return { staat: 'OK', detail: 'deze verbinding: ATST 0x' + V.nu().st + ', ' + V.stappen() + ' bijsturing(en)' };
    }
  },

  // ── Inleren wacht op de zoekronde; de kaart meldt zijn stappen (30-10-2026) ──
  {
    issue: '#648',
    naam: 'Inleren voor een vaste expert wacht tot de zoekronde en de gezondheidscheck klaar zijn; de expert ziet "kaart bezig" in plaats van een alarm',
    waarom: 'Zonder die wachtrij liep het inleren op een trage auto dwars door de gezondheidscheck heen. Wat een echte bus onder die belasting doet, blijft #648.',
    proef: async function () {
      if (!window.PLRemote || typeof PLRemote._inleerBusVrij !== 'function' || typeof PLRemote._bezig !== 'function') return { staat: 'FOUT', detail: 'PLRemote zonder wachtrij voor het inleren — oude pidlane-remote.js (herladen?)' };
      if (PLRemote._inleerBusVrij({ discovery: 0, health: 1, kaart: false })) return { staat: 'FOUT', detail: 'het inleren zou starten tijdens een gezondheidscheck' };
      if (!/Volledige kaart bezig/.test(PLRemote._stilTekst(5, true))) return { staat: 'FOUT', detail: 'de expert krijgt tijdens de kaart het alarm in plaats van "kaart bezig"' };
      var b = PLRemote._bezig();
      return { staat: 'OK', detail: 'nu: zoekronde ' + b.discovery + ', gezondheidscheck ' + b.health + ', kaart ' + (b.kaart ? 'bezig' : 'niet bezig') };
    }
  },

  // ── De verkoper of garage als vaste expert (29-10-2026) ──
  {
    issue: '#646',
    naam: 'Vaste expert: koppelcode van de expert, akkoord van de klant, volledige toegang bij delen en één keer inleren bij de eerste verbinding',
    waarom: 'De verkoper die adapter en account levert moet bij het eerste telefoontje alles al hebben. Of het inleren op een echte bus binnen enkele minuten klaar is, is een vraag voor een rit.',
    proef: async function () {
      if (!window.PLRemote || typeof PLRemote._moetInleren !== 'function' || typeof PLRemote.maakKoppelcode !== 'function') return { staat: 'FOUT', detail: 'PLRemote zonder vaste expert — oude pidlane-remote.js (herladen?)' };
      var sl = PLRemote._inleerSleutel({ vin: 'JM3KFBCM1J0123456', merk: 'Mazda', model: 'CX-5', year: 2018 });
      if (!sl || /0123456/.test(sl)) return { staat: 'FOUT', detail: 'de inleersleutel bevat de VIN of ontbreekt (' + sl + ')' };
      if (PLRemote._moetInleren({ verbonden: true, demo: true, sleutel: sl, experts: [{ naam: 'x' }] })) return { staat: 'FOUT', detail: 'inleren zou in demo starten' };
      var gedaan = {}; try { gedaan = JSON.parse(localStorage.getItem('pl_ingeleerd') || '{}') || {}; } catch (e) { return { staat: 'LET OP', detail: 'inleerlijst niet te lezen: ' + e.message }; }
      var n = Object.keys(gedaan).length;
      return { staat: 'OK', detail: n ? n + ' auto(s) op dit toestel ingeleerd voor een vaste expert' : 'nog geen auto ingeleerd op dit toestel (alleen met een gekoppelde vaste expert)' };
    }
  },

  // ── Expert op afstand: toestemming in twee niveaus, snelle scan, volledige kaart (29-10-2026) ──
  {
    issue: '#645',
    naam: 'Expert op afstand: basis met de meekijkcode, volledig alleen met een tik van de klant; de foutcodecheck gaat mee en de werkplek zegt wat er niet gemeten is',
    waarom: 'Een klant die de app voor het eerst opent gaf de expert een lege auto, en die las als gezond. Hoe lang de snelle scan en de volledige kaart op een echte bus duren, is een vraag voor een rit.',
    proef: async function () {
      if (!window.PLRemote || typeof PLRemote._verzoekToegestaan !== 'function' || typeof PLRemote._vstateBinnenGrens !== 'function') return { staat: 'FOUT', detail: 'PLRemote zonder toestemmingsniveaus — oude pidlane-remote.js (herladen?)' };
      if (!window.PLExpertWerk || typeof PLExpertWerk.dekking !== 'function') return { staat: 'FOUT', detail: 'PLExpertWerk.dekking ontbreekt — oude pidlane-expertwerk.js (herladen?)' };
      if (PLRemote._verzoekToegestaan({ type: 'request-analyze' }, 'basis')) return { staat: 'FOUT', detail: 'een AI-analyse mag op basistoegang' };
      if (!PLRemote._verzoekToegestaan({ type: 'request-snelscan' }, 'basis')) return { staat: 'FOUT', detail: 'de snelle scan mag niet op basistoegang' };
      var vs = PLRemote._buildVState(), n = JSON.stringify(vs).length;
      if (n > 30000) return { staat: 'FOUT', detail: 'het voertuigprofiel van dit toestel is ' + n + ' tekens — boven de grens' };
      var d = PLExpertWerk.dekking(vs), mist = d.filter(function (x) { return x.soort !== 'ok'; }).map(function (x) { return x.tekst; });
      return { staat: 'OK', detail: 'profiel ' + n + ' tekens' + (vs.scan ? ', met foutcodecheck' : ', nog zonder foutcodecheck') + (mist.length ? '; de expert ziet: ' + mist.join(' · ') : '; alles gemeten') };
    }
  },

  // ── Eigen weergave per sensor: eenheid, factor, schaal en decimalen (29-10-2026) ──
  {
    issue: 'weergave-sensor',
    naam: 'Eigen weergave van een sensor (⚙ in het keuzevel van een plek): raildruk 0123 in bar met een eigen schaal past op een boog en een Hyperlane-plek',
    waarom: 'Gevraagd op 29-10: een PID op elke plek kunnen zetten, ook zonder bruikbaar minimum en maximum, en kPa als bar tonen. Of het invulvel op dit toestel prettig werkt (toetsenbord, komma) verschilt per telefoon.',
    proef: async function () {
      if (!window.PLToon || typeof PLToon.zetEigen !== 'function') return { staat: 'FOUT', detail: 'PLToon.zetEigen ontbreekt — oude pidlane-toon.js (herladen?)' };
      if (!window.PLVisueel || typeof PLVisueel.toonWeergave !== 'function') return { staat: 'FOUT', detail: 'PLVisueel.toonWeergave ontbreekt — oude pidlane-visueel.js (herladen?)' };
      var oud = PLToon.eigen('0123'), d = (typeof getPidDef === 'function') ? getPidDef('0123') : null, sc = null, w = null;
      try {
        PLToon.zetEigen('0123', { eenheid: 'bar', factor: '0,01', min: '0', max: '2000' });
        w = PLToon.eigen('0123');
        sc = PLVisueel.boogSchaal('0123', d);
      } finally { PLToon.zetEigen('0123', oud); }
      if (!w || w.factor !== 0.01 || PLToon.omgerekend(85000, w) !== 850) return { staat: 'FOUT', detail: '85000 kPa × 0,01 is geen 850 bar (' + JSON.stringify(w) + ')' };
      if (!sc || sc[0] !== 0 || sc[1] !== 2000) return { staat: 'FOUT', detail: 'met een eigen schaal past 0123 niet op een boog (' + JSON.stringify(sc) + ')' };
      var n = Object.keys(PLToon.weergaven()).length;
      return { staat: 'OK', detail: 'omrekenen en eigen schaal werken; ' + (n ? n + ' sensor(en) met een eigen weergave op dit toestel' : 'nog geen eigen weergave ingesteld') };
    }
  },

  // ── Rapport aanvragen vanuit Rapporten (29-10-2026) ──
  {
    issue: 'rapport-aanvragen',
    naam: 'Rapporten → ➕ Rapport aanvragen: alle rapporten in één overzicht, elk met een knop die de test start die het vult',
    waarom: 'Gevraagd op 29-10: welke rapporten er zijn en welke test erbij hoort, stond verspreid over deuren, tegels en menu\'s. Of elk rapport op dit toestel ook echt geladen is, verschilt per build.',
    proef: async function () {
      if (typeof plAanvraagLijst !== 'function' || typeof srAanvraag !== 'function') return { staat: 'FOUT', detail: 'plAanvraagLijst/srAanvraag ontbreken — oude pidlane-archief.js (herladen?)' };
      var l = plAanvraagLijst(), ids = l.map(function (a) { return a.id; });
      var mist = ['foutcodes', 'onderzoek', 'controle', 'accu', 'mode06', 'rit', 'ai', 'monitor', 'aankoop', 'brandstof'].filter(function (id) { return ids.indexOf(id) < 0; });
      if (mist.length) return { staat: 'FOUT', detail: 'niet aan te vragen omdat de module niet geladen is: ' + mist.join(', ') };
      var nu = l.filter(function (a) { return a.nu; }).length;
      return { staat: 'OK', detail: l.length + ' rapporten aan te vragen, ' + nu + ' nu te starten' + (nu < l.length ? ' (de rest wacht op de adapter)' : '') };
    }
  },

  // ── Exportkeuring en het klantrapport als PDF (29-10-2026) ──
  {
    issue: 'exportkeuring',
    naam: 'Elk rapport wordt gekeurd vóór het de telefoon uitgaat: NaN, undefined of een grens 0–0 geeft geen bestand; een rapport met koppen wordt een opgemaakte PDF, met tekens die jsPDF echt kent',
    waarom: 'Het onderzoeksrapport van een Mazda 5 (29-10) ging als courier-dump naar de klant, met " op elke plek van een minteken, zestien zelftests "0 ruw, grens 0–0" als krap en "accu vol" op 14,1 V met draaiende motor.',
    proef: async function () {
      if (typeof window.plKeurExport !== 'function' || typeof window.plPdfTekst !== 'function') return { staat: 'FOUT', detail: 'plKeurExport/plPdfTekst ontbreken — oude pidlane-export.js (herladen?)' };
      if (window.plKeurExport('Rapport\n laadspanning NaN V').ok) return { staat: 'FOUT', detail: 'een rapport met NaN gaat door de keuring' };
      if (!window.plKeurExport('Rapport\n[ok] Katalysator: 300, grens 0–750').ok) return { staat: 'FOUT', detail: 'een gezond rapport wordt geweigerd' };
      if (window.plPdfTekst('\u2212') !== '-') return { staat: 'FOUT', detail: 'het minteken wordt niet vertaald — de PDF toont dan "' };
      var B = window.PLM06 && PLM06._intern && PLM06._intern.bouwRecord;
      if (!B) return { staat: 'FOUT', detail: 'PLM06 ontbreekt — oude pidlane-mode06.js (herladen?)' };
      var r = B(0x01, 0x01, 0x01, 0, 0, 0);
      if (r.krap || r.oordeelZeker || !r.leeg) return { staat: 'FOUT', detail: 'een mode 06-test met waarde en grens 0 krijgt weer een oordeel — oude pidlane-mode06.js (herladen?)' };
      return { staat: 'OK', detail: 'keuring weigert NaN en keurt een gezond rapport; minteken vertaald; lege mode 06-test zonder oordeel' };
    }
  },

  // ── Nieuwe auto, schone start (29-10-2026) ──
  {
    issue: 'schone-start',
    naam: 'Menuknop "Nieuwe auto — schone start" en de klantvlag Schone start: het toestel vergeet eerdere auto\'s, login en adapter blijven',
    waarom: 'Gevraagd op 29-10: sensoren en rapporten van eerder aangesloten auto\'s botsten met de nieuwe. Of de herstart op dit toestel netjes ingelogd terugkomt, verschilt tussen browser en APK.',
    proef: async function () {
      var S = window.PLSchoon;
      if (!S || typeof S.bewaar !== 'function') return { staat: 'FOUT', detail: 'PLSchoon ontbreekt — oude pidlane-schoon.js (herladen?)' };
      var knop = document.getElementById('kbSchoon');
      if (!knop) return { staat: 'FOUT', detail: 'menuknop #kbSchoon ontbreekt — oude index.html (herladen?)' };
      if (!S.bewaar('pl_tok') || !S.bewaar('pl_session')) return { staat: 'FOUT', detail: 'de bewaarlijst houdt de login niet vast — na de herstart ben je uitgelogd' };
      if (S.bewaar('pl_kenteken') || S.bewaar('pl_selectie')) return { staat: 'FOUT', detail: 'kenteken of sensorselectie van de vorige auto blijft staan' };
      var weg = 0;
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && !S.bewaar(k)) weg++; } }
      catch (e) { return { staat: 'LET OP', detail: 'localStorage onleesbaar: ' + e.message }; }
      return { staat: 'OK', detail: 'knop ' + (knop.style.display === 'none' ? 'verborgen (geen ontwikkelmenu)' : 'in beeld') + '; een schone start zou nu ' + weg + ' sleutels wissen' };
    }
  },

  // ── Hyperlane-deur: intro, inloggen en verbinden in de look van Hyperlane (29-10-2026) ──
  {
    issue: 'hyperlane-deur',
    naam: 'Intro, inlog- en verbindscherm in de Hyperlane-look: neon-tunnel (CSS) achter het glas, die na ruim een minuut stilvalt',
    waarom: 'Gevraagd op 29-10: de deur van de app in dezelfde look als Hyperlane. Of de tunnel op dit toestel vloeiend loopt en of het glas (backdrop-filter) werkt, verschilt per telefoon.',
    proef: async function () {
      var laag = document.getElementById('lgWaveBg');
      var hlg = laag && laag.querySelector('.hlg');
      if (!hlg) return { staat: 'FOUT', detail: 'de tunnel (.hlg) ontbreekt in #lgWaveBg — oude index.html (herladen?)' };
      var vloer = hlg.querySelector('.hlg-vloer i');
      var an = vloer ? getComputedStyle(vloer).animationIterationCount : '';
      if (an === 'infinite') return { staat: 'FOUT', detail: 'de vloer beweegt eindeloos — hoort na ruim een minuut stil te staan' };
      if (an !== '60') return { staat: 'FOUT', detail: 'de vloer heeft niet de Hyperlane-stijl (animatie ' + (an || 'geen') + ') — oude pidlane.css (herladen?)' };
      var glas = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
      var stil = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      var regel = 'tunnel aanwezig; glas ' + (glas ? 'werkt' : 'NIET ondersteund (kaarten zonder vervaging)') + (stil ? '; minder beweging staat aan: tunnel staat stil' : '');
      return { staat: glas ? 'OK' : 'LET OP', detail: regel };
    }
  },

  // ── Hyperlane: de blikvanger van Slim visueel (27-10-2026) ──
  {
    issue: 'hyperlane',
    naam: 'Het profiel Hyperlane: neon-tunnel (WebGL), toeren en snelheid als ringen, kleur volgt het rijgedrag, 0–100 vanuit stilstand, scènes (koud, stil, remmen, launch, cruise, alarm), scorebord, tanklichtbalk, power-up, G-spoor en merkthema',
    waarom: 'Gevraagd op 27-10: één weergave voor liggend die blijft imponeren en die je aan een passagier laat zien. Of WebGL op dit toestel draait en de lus vloeiend loopt, is per telefoon verschillend.',
    proef: async function () {
      var H = window.PLHyperlane, P = window.PLVisProfiel;
      if (!H || typeof H.stemming !== 'function') return { staat: 'FOUT', detail: 'PLHyperlane ontbreekt — oude pidlane-hyperlane.js (herladen?)' };
      if (!P || !P.zoek('hyperlane')) return { staat: 'FOUT', detail: 'profiel hyperlane ontbreekt — oude pidlane-visprofiel.js (herladen?)' };
      if (H.stemming(800, 6800, 0) >= 0.1 || H.stemming(6800, 6800, 100) !== 1) return { staat: 'FOUT', detail: 'stemming() kleurt verkeerd' };
      if (typeof H.scorebord !== 'function' || typeof H.accuStart !== 'function' || typeof H.merkThema !== 'function') return { staat: 'FOUT', detail: 'scorebord/power-up/merkthema ontbreken — oude pidlane-hyperlane.js (herladen?)' };
      if (typeof H.scene !== 'function' || H.scene({ koel: 40 }) !== 'koud' || H.scene({ koel: 90, koelSt: 'danger' }) !== 'alarm') return { staat: 'FOUT', detail: 'scene() ontbreekt of kiest verkeerd — oude pidlane-hyperlane.js (herladen?)' };
      var gl = false;
      try { var c = document.createElement('canvas'); gl = !!c.getContext('webgl'); } catch (e) { console.warn('blok 5 hyperlane: WebGL', e); }
      var mk = null; try { mk = H.merkThema(typeof vehicleInfo !== 'undefined' && vehicleInfo ? vehicleInfo.merk : ''); } catch (e) { console.warn('blok 5 hyperlane: merk', e); }
      var rit = H.rit();
      var regel = 'WebGL ' + (gl ? 'beschikbaar' : 'NIET beschikbaar (tunnel valt terug op een verloop)') + '; lus ' + (H.actief() ? 'loopt nu' : 'staat stil (Hyperlane niet in beeld)') + '; merkthema ' + (mk ? mk.naam : 'standaard') + '; rit ' + (rit ? rit.km.toFixed(1) + ' km' : 'nog niet gestart');
      if (!gl) return { staat: 'LET OP', detail: regel };
      return { staat: 'OK', detail: regel };
    }
  },

  // ── Opstart: instappen, starten, de rest gaat vanzelf (27-10-2026) ──
  {
    issue: 'opstart',
    naam: 'Na een kwartier zonder motor is een automatische verbinding een opstart: check één keer per auto per dag, kenteken uit de VIN, wekker',
    waarom: 'Gevraagd op 27-10: de klant stapt in, start, en de rest gaat vanzelf. Een automatische verbinding gold tot dan altijd als hervatting — geen check — en nam het kenteken van de vorige auto.',
    proef: async function () {
      var O = window.PLOpstart;
      if (!O || !O._kern || typeof O.reden !== 'function') return { staat: 'FOUT', detail: 'PLOpstart ontbreekt — oude pidlane-opstart.js (herladen?)' };
      if (typeof _isOpstart !== 'function') return { staat: 'FOUT', detail: '_isOpstart ontbreekt — oude pidlane-bt.js (herladen?)' };
      var K = O._kern, nu = Date.now();
      if (K.reden('herlaad', nu, nu - 20 * 60000) !== 'opstart' || K.reden('herlaad', nu, nu - 60000) !== 'herlaad') return { staat: 'FOUT', detail: 'reden() onderscheidt opstart en herlaad niet' };
      var laatst = null; try { laatst = localStorage.getItem('pl_laatst_actief'); } catch (e) { console.warn(e); }
      var nuReden = O.reden('herlaad');
      var wek = { beschikbaar: false };
      try { var p = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PLWekker; if (p) wek = await p.status(); } catch (e) { wek = { beschikbaar: false, fout: String(e && e.message || e) }; }
      var wt = K.wekkerTekst(wek);
      var regel = 'een herverbinding nu = ' + nuReden + ' (motor liep ' + (laatst ? Math.round((nu - Number(laatst)) / 60000) + ' min geleden' : 'nog nooit') + '); check vandaag ' + (O.checkVandaag() ? 'al gedaan' : 'nog niet') + '; wekker: ' + wt.regel;
      if (!wek.beschikbaar) return { staat: 'LET OP', detail: regel + ' (geen native wekker in deze schil)' };
      return { staat: 'OK', detail: regel };
    }
  },

  // ── Garagemodus bij bulk/waak, leeg midden, kop startscherm 10 s (27-10-2026) ──
  {
    issue: 'garage-bulk-kop',
    naam: 'Bulk-recorder of waakronde aan zet de garagemodus aan; het meter-midden blijft leeg zolang de versnelling onbekend is; de startkop gaat na 10 s weg',
    waarom: 'Gevraagd op 27-10: de uitkomst van bulk en waak staat bij het vakgereedschap, het logo midden in de meter las als een melding, en "… herkend" bleef permanent staan.',
    proef: async function () {
      var R = window.PLRun, N = window.PLNav, V = window.PLVisueel;
      if (!R || !R._kern || typeof R._kern.garageNodig !== 'function') return { staat: 'FOUT', detail: 'PLRun._kern.garageNodig ontbreekt — oude pidlane-run.js (herladen?)' };
      if (!R._kern.garageNodig('waak', { aan: false }, false) || R._kern.garageNodig('waak', { aan: true }, false)) return { staat: 'FOUT', detail: 'garageNodig beslist verkeerd' };
      if (!V || typeof V.logoZien !== 'function') return { staat: 'FOUT', detail: 'PLVisueel.logoZien ontbreekt — oude pidlane-visueel.js (herladen?)' };
      if (V.logoZien('', { uit: false }) || !V.logoZien('', { uit: true })) return { staat: 'FOUT', detail: 'logoZien: embleem staat er terwijl de indicator aan is, of niet terwijl hij uit is' };
      if (!N || typeof N.kopToon !== 'function' || !N._kern || N._kern.KOP_MS !== 10000) return { staat: 'FOUT', detail: 'PLNav.kopToon/KOP_MS ontbreken — oude pidlane-nav.js (herladen?)' };
      var kop = document.querySelector('.welcome-header');
      if (!kop) return { staat: 'LET OP', detail: 'geen .welcome-header in beeld' };
      N.kopToon();
      if (kop.classList.contains('pl-kop-weg')) return { staat: 'FOUT', detail: 'kopToon() brengt de kop niet terug' };
      return { staat: 'OK', detail: 'garagemodus volgt bulk/waak, midden leeg met indicator aan, kop terug voor 10 s' };
    }
  },

  // ── Max haalbaar: de PID-keuze naar wat de adapter haalt (26-10-2026) ──
  {
    issue: 'max-haalbaar',
    naam: 'Max haalbaar kiest zoveel sensoren als deze adapter bijhoudt, op volgorde van belang en met de eigen PIDs erbij',
    waarom: 'Aanbevolen was een vaste lijst; een MX+ en een kloon van zes PIDs/s kregen hetzelfde. Gevraagd: hoe beter de adapter, hoe meer sensoren.',
    proef: async function () {
      if (!window._pidMax) return { staat: 'FOUT', detail: '_pidMax ontbreekt — oude pidlane-rijsituatie.js (herladen?)' };
      var pr = (window.PID_PRESETS || []).filter(function (x) { return x.max; })[0];
      if (!pr) return { staat: 'FOUT', detail: 'geen doel met max:true in PID_PRESETS' };
      if (!(window.discoveredPIDDefs || []).length) return { staat: 'LET OP', detail: 'geen PIDs ontdekt — verbind eerst' };
      var m = _pidMax(pr), kern = (window.KERN_PIDS || []).filter(function (p) { return m.ids.indexOf(p) < 0 && discoveredPIDDefs.some(function (d) { return d.pid === p; }); });
      if (kern.length) return { staat: 'FOUT', detail: 'kern-PIDs vallen weg: ' + kern.join(', ') };
      return { staat: m.cap.bron === 'schatting' ? 'LET OP' : 'OK', detail: m.ids.length + ' van ' + m.van + ' sensoren; adapter ±' + Math.round(m.cap.pidsPerSec) + ' PIDs/s (' + m.cap.bron + '), kost ' + m.kost + ' van budget ' + m.budget };
    }
  },

  // ── Accupagina: waarde valt niet weg, rapport, deur (26-10-2026) ──
  {
    issue: 'accurapport',
    naam: 'De accuspanning op de accupagina valt niet meer weg, en de pagina maakt een PDF-rapport',
    waarom: 'Op 26-10 viel de spanning op Live elke halve minuut even weg: 0142 staat op 30 s en de pagina noemde alles boven 15 s oud. Gevraagd: een rapportknop en een ingang in een deur.',
    proef: async function () {
      var A = window.PLAccu;
      if (!A || typeof A.tempo !== 'function' || typeof A.rapportModel !== 'function') return { staat: 'FOUT', detail: 'PLAccu.tempo/rapportModel ontbreken — oude pidlane-accutest.js (herladen?)' };
      if (typeof pidPollInterval !== 'function') return { staat: 'FOUT', detail: 'pidPollInterval ontbreekt' };
      var dicht = pidPollInterval('0142'), was = !!document.getElementById('plAccuTest');
      A.open('live'); var open = pidPollInterval('0142'); if (!was) A.sluit();
      if (open !== 1000) return { staat: 'FOUT', detail: 'met de pagina open vraagt de pollus 0142 elke ' + open + ' ms in plaats van 1000' };
      var m = A.rapportModel();
      if (!m || !m.secties || m.secties.length !== 8) return { staat: 'FOUT', detail: 'het rapportmodel heeft ' + (m && m.secties ? m.secties.length : 0) + ' hoofdstukken in plaats van 8' };
      if (!document.getElementById('wc-accu')) return { staat: 'FOUT', detail: 'de kaart Accu en laadsysteem staat niet in de deur Voorbereiden (index.html herladen?)' };
      return { staat: 'OK', detail: '0142: ' + dicht + ' ms dicht, 1000 ms open; rapport: "' + m.voorblad.kort.kop + '"' };
    }
  },

  // ── De accupagina: voorgrond, lampje, slimme PIDs (26-10-2026) ──
  {
    issue: 'accupagina',
    naam: 'De accupagina ligt bovenop, opent vanaf het accu-lampje en toont de PIDs die het laden slim maken',
    waarom: 'Na de eerste versie: het venster opende niet op de voorgrond, de onderkant viel weg, het accu-lampje deed niets en de slimme PIDs waren niet te zien.',
    proef: async function () {
      var A = window.PLAccu;
      if (!A || !A._kern || typeof A._kern.laadStaat !== 'function' || typeof A._kern.grafiek !== 'function') return { staat: 'FOUT', detail: 'PLAccu 2.0 ontbreekt — oude pidlane-accutest.js (herladen?)' };
      var ls = A._kern.laadStaat({ u: 13.0, rpm: 1800, g: 14.6 });
      if (ls.staat !== 'achter') return { staat: 'FOUT', detail: 'gevraagd 14,6 V, gemeten 13,0 V heet "' + ls.staat + '" in plaats van achter' };
      var was = !!document.getElementById('plAccuTest');
      A.open('live');
      var p = document.getElementById('plAccuTest'), raak = document.elementFromPoint(innerWidth / 2, 4);
      var boven = !!(raak && raak.closest && raak.closest('#plAccuTest')), tegels = p ? p.querySelectorAll('.pa-tegel').length : 0;
      if (!was) A.sluit();
      if (!boven) return { staat: 'FOUT', detail: 'bovenaan het scherm ligt ' + (raak ? raak.tagName + '#' + raak.id : 'niets') + ' over de accupagina' };
      var lamp = document.getElementById('vis-lamp-accu');
      var w = A.nu(), c = w.codes || {};
      return { staat: 'OK', detail: tegels + ' sensortegels; gevraagde laadspanning ' + (c.gevraagd ? c.gevraagd + ' = ' + w.g : 'niet ingesteld') + ', laadtoestand ' + (c.soc ? c.soc + ' = ' + w.soc : 'niet ingesteld') +
        (lamp ? '; accu-lampje ' + (lamp.getAttribute('onclick') ? 'opent de pagina' : 'zonder klik') : '; Slim visueel niet open') };
    }
  },

  // ── Accutest en de poort van twee bewijzen (25-10-2026) ──
  {
    issue: 'accutest',
    naam: 'De accutest beoordeelt het plateau van de startdip, en één lage laadspanning is nog geen melding',
    waarom: 'Op een Mazda met slimme laadregeling gaf de app vaak een accu-/dynamomelding: een i-stop in het venster van 30 s, 15,4 V bij vorst, en één meting was één melding.',
    proef: async function () {
      var A = window.PLAccu;
      if (!A || !A._kern || typeof A._kern.startUitMonsters !== 'function') return { staat: 'FOUT', detail: 'PLAccu ontbreekt — pidlane-accutest.js niet geladen (herladen?)' };
      if (!window.PLKenmerk || typeof PLKenmerk.laadHoog !== 'function') return { staat: 'FOUT', detail: 'PLKenmerk.laadHoog ontbreekt — oude pidlane-kenmerk.js (herladen?)' };
      var K = A._kern, m = [];
      for (var t = 0; t <= 2000; t += 40) m.push({ t: t, v: t < 400 ? 12.6 : t < 420 ? 7.9 : t < 1200 ? 10.4 : 14.2 });
      var s = K.startUitMonsters(m, 12.6);
      if (!s.ok || K.startOordeel(s, 21).staat !== 'goed') return { staat: 'FOUT', detail: 'een gezonde start met een inschakelpiek van 7,9 V heet ' + (s.ok ? K.startOordeel(s, 21).staat : s.reden) };
      var L = K.bewijsErbij([], { soort_van: 'dynamo', soort: 'laadspanning', tekst: 'x' }, Date.now());
      if (K.bevestigd(L, 'dynamo').ja) return { staat: 'FOUT', detail: 'één bewijs heet al bevestigd' };
      if (PLKenmerk.laadHoog(-10) <= 15.4) return { staat: 'FOUT', detail: 'de bovengrens bij −10 °C is ' + PLKenmerk.laadHoog(-10) + ' V: 15,4 V heet dan kapot' };
      var st = A.stand(), u = A.uitslag();
      return { staat: 'OK', detail: st.starts.length + ' start(s) gemeten op deze auto; accu: ' + u.accu.reden + '; dynamo: ' + u.dynamo.reden };
    }
  },

  // ── Meetcoach: voortgang en keuze (25-10-2026) ──
  {
    issue: 'meetcoach',
    naam: 'De meetcoach toont stap x van y, hoe lang nog, en laat je kiezen of doorschuiven',
    waarom: 'Na de eerste rit op 25-10: "gewoon doorrijden" zei niet hoe lang nog, en bij meerdere stappen was er geen Volgende of lijst.',
    proef: async function () {
      var M = window.PLMeetcoach;
      if (!M || typeof M.stappen !== 'function' || typeof M.volgende !== 'function') return { staat: 'FOUT', detail: 'PLMeetcoach.stappen/volgende ontbreken — oude pidlane-meetcoach.js (herladen?)' };
      var o = function (n, vw, w) { return { naam: n, opdracht: { naam: n, voorwaarden: vw }, vonnis: { staat: 'nog niet', voorwaarden: w.map(function (x) { return { vervuld: false, waarde: x }; }) } }; };
      var p = M.plan([o('A', [{ toestand: 'contact-uit', minS: 20, maxS: 90 }], [null]), o('B', [{ toestand: 'stil', minS: 30 }], [null]),
        o('C', [{ toestand: 'rijden', minS: 600 }], [450])], null);
      var h = M.balkHtml(p, { huidig: 'stil' });
      if (!/Stap 2 van 2/.test(h)) return { staat: 'FOUT', detail: 'een gekozen stap staat niet als "Stap 2 van 2" in de balk' };
      if (!/nog 2:30/.test(h)) return { staat: 'FOUT', detail: '7,5 van 10 min rijden toont niet "nog 2:30"' };
      var s = M._staat();
      return { staat: 'OK', detail: s.keuze ? 'deze rit: ' + Math.round(s.keuze.duurS / 60) + ' min' + (s.ritStart ? ', ' + Math.floor((Date.now() - s.ritStart) / 60000) + ' min onderweg' : '') : 'nog geen rit gekozen' };
    }
  },

  // ── Modeljaar uit een Europese VIN (25-10-2026) ──
  {
    issue: '#617',
    naam: 'Het modeljaar uit een Europese VIN volgt niet meer de Noord-Amerikaanse positie-7-regel',
    waarom: 'bproef-merken.js: een Clio 2020 (VF1RJA0AXL…) kreeg modeljaar 1990, ook in de #541-tabel.',
    proef: async function () {
      if (typeof decodeVIN !== 'function') return { staat: 'FOUT', detail: 'decodeVIN ontbreekt — pidlane-rijsituatie.js niet geladen (herladen?)' };
      var eu = decodeVIN('VF1RJA0AXL4000001').year, na = decodeVIN('1FAPP3640LK000001').year;
      if (eu !== '2020') return { staat: 'FOUT', detail: 'Clio VF1RJA0AXL… geeft ' + eu + ' in plaats van 2020' };
      if (na !== '1990') return { staat: 'FOUT', detail: 'Ford 1FAPP3640L… geeft ' + na + ' in plaats van 1990: de regel voor Noord-Amerika is weg' };
      var v = (window.vehicleInfo && vehicleInfo.vin) || '';
      return { staat: 'OK', detail: 'Clio 2020, Ford 1990' + (v.length === 17 ? ' — deze auto: ' + (decodeVIN(v).year || 'geen jaarcode') : '') };
    }
  },

  // ── Meetcoach (24-10-2026) ──
  {
    issue: 'meetcoach',
    naam: 'De meetcoach laadt alle opdrachten, telt ongekeurd als auto en zet één actie in Live',
    waarom: 'Op 24-10 werd niets meer vanzelf groen: de lijst, de sensoren, de keuring en het verzenden waren alle vier handwerk geworden.',
    proef: async function () {
      var M = window.PLMeetcoach;
      if (!M || typeof M.plan !== 'function') return { staat: 'FOUT', detail: 'PLMeetcoach ontbreekt — pidlane-meetcoach.js niet geladen (herladen?)' };
      if (!window.PLOpdracht || typeof PLOpdracht.opstelling !== 'function' || typeof PLOpdracht.zetSensorenAlle !== 'function')
        return { staat: 'FOUT', detail: 'PLOpdracht.opstelling/zetSensorenAlle ontbreken — oude pidlane-opdracht.js (herladen?)' };
      if (PLOpdracht.opstelling('bestaat-niet') !== 'auto') return { staat: 'FOUT', detail: 'een ongekeurde opstelling telt niet als auto' };
      var p = M.plan(PLOpdracht.oordeelAlle(), M._staat().keuze);
      var a = p.acties.filter(function (x) { return x.actief; })[0];
      return { staat: 'OK', detail: p.klaar + ' klaar, ' + p.open + ' bezig, ' + p.uitgesloten + ' niet voor deze rit' + (a ? ' — nu: ' + a.tekst : '') + (M._staat().verzondenN ? ', ' + M._staat().verzondenN + ' verzonden' : '') };
    }
  },

  // ── Tractie gemeten aan de wielen (24-10-2026) ──
  {
    issue: '#560',
    naam: 'Met de vier wielsnelheden uit de ABS-module telt een rit gemeten wielslip, en dat gaat voor de afleiding uit mode 01',
    waarom: 'Methode 1 van #560: de ABS-module heeft de wielsnelheden (Mazda 760 22 2B06–2B09 in OBDb); daarmee is slip gemeten in plaats van vermoed.',
    proef: async function () {
      if (!window.PLEigen || typeof PLEigen.wielRol !== 'function' || typeof PLEigen.wielCodes !== 'function') return { staat: 'FOUT', detail: 'PLEigen.wielRol/wielCodes ontbreken — oude pidlane-uitgebreid.js (herladen?)' };
      if (!window.PLConditie) return { staat: 'FOUT', detail: 'PLConditie ontbreekt (herladen?)' };
      if (PLEigen.wielRol('Front left wheel speed') !== 'VL') return { staat: 'FOUT', detail: 'de OBDb-naam "Front left wheel speed" wordt niet als wiel herkend' };
      var a = null, t = 0, i;
      for (i = 0; i < 40; i++) {
        t += 2000;
        var v = (i >= 20 && i < 23) ? 58 : 50;
        a = PLConditie.tik(a, { kmh: 50, rpm: 2000, pedaal: 30, gasklep: 25, pedaalT: t, gasklepT: t,
          wielen: { VL: { v: v, t: t }, VR: { v: v, t: t }, AL: { v: 50, t: t }, AR: { v: 50, t: t } } }, 2);
      }
      var s = PLConditie.samenvat(a) || {};
      if (s.ts !== 1) return { staat: 'FOUT', detail: 'drie tikken voor 16 % sneller bij gas geven ts=' + s.ts + ' in plaats van 1' };
      var c = PLEigen.wielCodes();
      return c ? { staat: 'OK', detail: 'deze auto: vier wielsnelheden als eigen sensor (' + c.VL + ', ' + c.VR + ', ' + c.AL + ', ' + c.AR + ')' }
               : { staat: 'OK', detail: 'telling klopt; deze auto heeft nog geen vier wielsnelheden — Mijn voertuigen → Sensoren → zoek in OBDb' };
    }
  },

  // ── Conditiescore: dode zones uit echte ritten (24-10-2026) ──
  {
    issue: '#475',
    naam: 'Een gezonde auto met slim laden verliest geen accupunten op 1 V schommeling, en raildruk mag 20 % wiebelen',
    waarom: 'Over 23 ritten van een gezonde CX-5 week de laadspanning 0,9–1,1 V en de raildruk tot 25 % af — de oude zones (0,2 V, 5 %) gaven punten weg aan ruis.',
    proef: async function () {
      var C = window.PLConditie;
      if (!C || !C.KENMERKEN) return { staat: 'FOUT', detail: 'PLConditie.KENMERKEN ontbreekt (herladen?)' };
      var k = {}; C.KENMERKEN.forEach(function (x) { k[x.id] = x; });
      if (!k.lv || !k.lv.zonderVloer || !(k.lv.zonderVloer.dood >= 1)) return { staat: 'FOUT', detail: 'laadspanning heeft geen ruimere zone zonder vloer — oude pidlane-conditie.js (herladen?)' };
      if (!k.rd || k.rd.dood < 20) return { staat: 'FOUT', detail: 'raildruk staat nog op ' + (k.rd && k.rd.dood) + ' % dode zone' };
      return { staat: 'OK', detail: 'laadspanning ' + k.lv.dood + ' V (vaste vloer) / ' + k.lv.zonderVloer.dood + ' V (slim laden), raildruk ' + k.rd.dood + ' %, onrust ' + (k.sr && k.sr.dood) + ' %' };
    }
  },

  // ── ATST na de achtergrond (24-10-2026) ──
  {
    issue: '#509',
    naam: 'Missers vlak na terugkomst uit de achtergrond sturen ATST niet omhoog, en een bijsturing gaat naar D1',
    waarom: 'Op 14-10 stond ATST na een rit met Google Maps twee treden hoger; de enige bron was het BT-log op de telefoon.',
    proef: async function () {
      if (typeof plStNaAchtergrond !== 'function') return { staat: 'FOUT', detail: 'plStNaAchtergrond ontbreekt — oude pidlane-bt.js (herladen?)' };
      var nu = Date.now();
      if (!plStNaAchtergrond({ weg: function () { return false; }, laatste: function () { return { tot: nu - 3000 }; } }, nu))
        return { staat: 'FOUT', detail: '3 s na de achtergrond telt een misser tóch voor de ATST' };
      if (plStNaAchtergrond({ weg: function () { return false; }, laatste: function () { return { tot: nu - 60000 }; } }, nu))
        return { staat: 'FOUT', detail: 'een minuut na de achtergrond telt een misser nog steeds niet' };
      var n = (window.PLVerbind && PLVerbind.stappen) ? PLVerbind.stappen() : 0;
      return { staat: 'OK', detail: 'deze verbinding ' + n + ' keer bijgestuurd' + (window.PLAchtergrond ? ', ' + PLAchtergrond.perioden().length + ' achtergrondperiode(n)' : '') };
    }
  },

  // ── Meeluisteren op CAN (24-10-2026) ──
  {
    issue: '#560',
    naam: 'Meeluisteren op CAN: tester-verkeer telt niet als uitzending, en alleen een open bus wordt bij de auto vastgelegd',
    waarom: 'Methode 2 van #560: of wielsnelheid en ESP via ATMA te lezen zijn hangt af van een gateway voor het OBD-contact, en dat verschilt per auto.',
    proef: async function () {
      var M = window.PLMeeluister;
      if (!M || typeof M.ontleed !== 'function' || typeof M.proef !== 'function') return { staat: 'FOUT', detail: 'PLMeeluister ontbreekt — pidlane-meeluister.js niet geladen (herladen?)' };
      if (!window.PLWaarneming || PLWaarneming.kent().indexOf('canopen') < 0) return { staat: 'FOUT', detail: 'PLWaarneming kent canopen niet — oude pidlane-waarneming.js (herladen?)' };
      var diag = M.ontleed('7E8 06 41 0C 1A F8\r7E9 06 41 0C 1A F8', '6').oordeel;
      if (diag !== 'stil') return { staat: 'FOUT', detail: 'alleen antwoorden op eigen vragen geeft "' + diag + '" in plaats van stil' };
      var open = M.ontleed('1A0 8 00\r4B0 8 01\r201 8 02', 'A6').oordeel;
      if (open !== 'open') return { staat: 'FOUT', detail: 'drie zenders op 11-bit geeft "' + open + '" in plaats van open' };
      var w = PLWaarneming.lees('canopen');
      return w.status === 'gezien'
        ? { staat: 'OK', detail: 'deze auto: CAN-bus open (' + ((w.bewijs && w.bewijs.zenders) || '?') + ' zenders)' }
        : { staat: 'OK', detail: 'ontleding klopt; deze auto nog niet open gezien — Admin → 📻 Meeluisteren op CAN' };
    }
  },

  // ── Meetopdrachten in het verslag (23-10-2026) ──
  {
    issue: '#599',
    naam: 'Het verslag zegt per meetopdracht wat de rit ervan vindt; een uitkomst gaat als voorlopig naar de second opinion, en een te lange periode telt niet',
    waarom: 'Op 23-10 stond na twintig minuten rijden nergens of #594 een antwoord had opgeleverd, en één fout in de bediening (contact te lang uit) werd een FOUT over de auto.',
    proef: async function () {
      if (!window.PLTestrunLive || typeof PLTestrunLive.oordeelAlle !== 'function') return { staat: 'FOUT', detail: 'PLTestrunLive.oordeelAlle ontbreekt (herladen?)' };
      if (!window.PLOpdracht || typeof PLOpdracht.bewijs !== 'function' || typeof PLOpdracht.stuurUitkomst !== 'function')
        return { staat: 'FOUT', detail: 'PLOpdracht.bewijs/stuurUitkomst ontbreken — oude pidlane-opdracht.js (herladen?)' };
      if (!window.PLToeschouwer || typeof PLToeschouwer.periodenS !== 'function' || typeof PLToeschouwer.nieuwePoging !== 'function')
        return { staat: 'FOUT', detail: 'PLToeschouwer kent geen perioden — oude pidlane-toeschouwer.js (herladen?)' };
      // Gedrag op een eigen kern: 95 s contact uit is één periode, geen som.
      var K = PLToeschouwer._kern, k = K.maak(), t = 1e6, i;
      for (i = 0; i < 95; i++) K.stap(k, { verbonden: true, kmh: 0, contactStil: true }, t += 1000);
      for (i = 0; i < 6; i++) K.stap(k, { verbonden: true, kmh: 0 }, t += 1000);
      var ps = K.perioden(k, 'contact-uit', 0);
      if (ps.length !== 1 || ps[0] < 90) return { staat: 'FOUT', detail: 'de toeschouwer ziet geen periode van 95 s maar ' + JSON.stringify(ps) };
      var alle = PLTestrunLive.oordeelAlle();
      if (!alle.length) return { staat: 'LET OP', detail: 'geen meetopdrachten opgehaald — het blok MEETOPDRACHTEN is niet na te gaan' };
      var t = testrunTekst();
      if (t.indexOf('MEETOPDRACHTEN (' + alle.length + ')') < 0) return { staat: 'FOUT', detail: alle.length + ' opdracht(en), maar het verslag heeft geen blok MEETOPDRACHTEN' };
      var open = alle.filter(function (r) { return r.afgerond && !r.alVerzonden; }).map(function (r) { return r.naam; });
      return open.length
        ? { staat: 'LET OP', detail: open.length + ' afgerond maar niet verzonden: ' + open.join('; ') + ' — Meetkamer → Verzend alle afgeronde' }
        : { staat: 'OK', detail: alle.length + ' opdracht(en) in het verslag, niets afgerond dat nog wacht' };
    }
  },

  // ── Meetproeven: de toeschouwer en de keuring van de opstelling (23-10-2026) ──
  {
    issue: '#594',
    naam: 'De toeschouwer ziet stilstand, rijden, contact uit en helling, en een ongekeurde opstelling telt niet als antwoord',
    waarom: 'Een uitkomst was vaak fout door de proef zelf, en een vergeten handmatige stap hield een proef op NOG NIET.',
    proef: async function () {
      var T = window.PLToeschouwer;
      if (!T || typeof T.stand !== 'function') return { staat: 'FOUT', detail: 'PLToeschouwer ontbreekt — pidlane-toeschouwer.js niet geladen (herladen?)' };
      if (!window.PLOpdracht || typeof PLOpdracht.keuring !== 'function') return { staat: 'FOUT', detail: 'PLOpdracht.keuring ontbreekt — oude pidlane-opdracht.js (herladen?)' };
      // Gedrag op een eigen kern, zodat de echte telling van deze rit blijft staan.
      var K = T._kern, k = K.maak(), t = 1e6, i;
      for (i = 0; i < 6; i++) K.stap(k, { verbonden: true, kmh: 40 }, t += 1000);
      for (i = 0; i < 6; i++) K.stap(k, { verbonden: true, kmh: null }, t += 1000);
      if (k.duur.stil > 0) return { staat: 'FOUT', detail: 'een meetgat telde als stilstand' };
      for (i = 0; i < 6; i++) K.stap(k, { verbonden: true, kmh: 0 }, t += 1000);
      K.stap(k, { verbonden: true, kmh: 0, contactStil: true }, t += 1000);
      var ev = k.gebeurtenissen.map(function (e) { return e.soort; }).join(',');
      if (ev !== 'rijden,stil,contact-uit') return { staat: 'FOUT', detail: 'gebeurtenissen: ' + ev };
      if (!PLOpdracht.keur({ schema: 2, naam: 'x', sensoren: ['010D'], duurS: 60, voorwaarden: [{ wat: 'stil', toestand: 'stil' }] }).ok)
        return { staat: 'FOUT', detail: 'keur() kent de toestand-voorwaarde niet' };
      var h = PLOpdracht.herkomst && PLOpdracht.herkomst();
      var st = T.stand();
      var nu = 'nu ' + (st.toestand || 'onbekend') + ', ' + st.gebeurtenissen.length + ' gebeurtenis(sen) deze sessie';
      if (!h || !h.id) return { staat: 'LET OP', detail: nu + '; geen meetopdracht gekozen — keuring niet na te gaan' };
      var kr = PLOpdracht.keuring(h.id);
      return { staat: kr.staat === 'groen' ? 'OK' : 'LET OP', detail: nu + '; opstelling van "' + h.naam + '": ' + kr.staat +
        (kr.staat === 'groen' ? '' : ' — de uitkomst gaat als proefopstelling mee. Kijk hem na in de meetkamer en zet hem op groen.') };
    }
  },

  // ── Beschikbaarheid van data bij de eerste verbinding (23-10-2026) ──
  {
    issue: 'beschikbaarheid',
    naam: 'Steunbitmaps worden herhaald en een onleesbaar blok per PID nagemeten; trage sensoren krijgen een herkansing',
    waarom: 'Een 0100 die één keer stil bleef kostte toerental, snelheid en koelwater — en via het profiel voorgoed.',
    proef: async function () {
      if (typeof plLeesSteunbitmap !== 'function' || typeof plHerkansNodata !== 'function') return { staat: 'FOUT', detail: 'plLeesSteunbitmap/plHerkansNodata ontbreken — oude pidlane-rijsituatie.js (herladen?)' };
      if (!connected || typeof supportedPIDs === 'undefined' || !supportedPIDs.size) return { staat: 'LET OP', detail: 'niet verbonden — niets te beoordelen' };
      var sb = (typeof steunbitsRuw === 'function') ? steunbitsRuw() : {};
      var kern = ['010C', '010D', '0105'].filter(function (p) { return !supportedPIDs.has(p); });
      if (kern.length) return { staat: 'FOUT', detail: 'blok 01–20 onvolledig: ' + kern.join(', ') + ' ontbreekt' + (sb[0] === undefined ? ' en 0100 is niet gelezen' : '') };
      var grijs = Object.keys(_pidHealth || {}).filter(function (p) { return _pidHealth[p] === 'nodata' || _pidHealth[p] === 'onzin'; });
      return { staat: 'OK', detail: supportedPIDs.size + ' PIDs, bitmaps gelezen: ' + Object.keys(sb).map(function (b) { return (+b).toString(16).toUpperCase(); }).join('/') + '; na herkansing grijs: ' + (grijs.length ? grijs.join(', ') : 'geen') };
    }
  },

  // ── CBS-pompprijs en APK-ritme (23-10-2026) ──
  {
    issue: 'pompprijs',
    naam: 'De standaardprijs per liter komt van het CBS (80416ned), niet meer met de hand',
    waarom: 'De prijs in de code veroudert vanaf de dag dat hij erin gezet is.',
    proef: async function () {
      if (!window.PLPompprijs || typeof PLPompprijs.verwerk !== 'function') return { staat: 'FOUT', detail: 'PLPompprijs ontbreekt — pidlane-pompprijs.js niet geladen (herladen?)' };
      if (PLPompprijs.verwerk([{ Perioden: '20261019', BenzineEuro95_1: 23.9, Diesel_2: 2.4, Lpg_3: 0.9 }])) return { staat: 'FOUT', detail: 'een komma-fout wordt als prijs geaccepteerd' };
      if (!PLPompprijs.actueel) return { staat: 'LET OP', detail: 'nog geen CBS-prijs binnen (offline, of de Worker laat opendata.cbs.nl nog niet door) — de standaardprijs uit de code staat' };
      var b = window.PLBerekend && PLBerekend.PRIJS_STANDAARD;
      if (!b || b.benzine !== PLPompprijs.actueel.benzine) return { staat: 'FOUT', detail: 'CBS-prijs opgehaald maar niet in PRIJS_STANDAARD gezet' };
      return { staat: 'OK', detail: PLPompprijs.bronTekst() + ': benzine € ' + b.benzine + ', diesel € ' + b.diesel };
    }
  },
  {
    issue: 'apk-ritme',
    naam: 'APK-geschiedenis zegt wanneer een keuring ná de vervaldatum viel',
    waarom: 'Een auto die maanden zonder geldige APK reed (of geschorst stond) is voor een koper iets om naar te vragen.',
    proef: async function () {
      if (!window.PLApk || typeof PLApk.teLaat !== 'function') return { staat: 'FOUT', detail: 'PLApk.teLaat ontbreekt — oude pidlane-apk.js (herladen?)' };
      var r = PLApk.teLaat([{ meld_datum_door_keuringsinstantie: '20241024', vervaldatum_keuring: '20251108' }, { meld_datum_door_keuringsinstantie: '20260901', vervaldatum_keuring: '20270901' }]);
      if (r.length !== 1 || r[0].dagen !== 297) return { staat: 'FOUT', detail: JSON.stringify(r) };
      return { staat: 'OK', detail: 'Zoek een kenteken: bij een te late keuring staat het onder APK-geschiedenis' };
    }
  },

  // ── RDW per kenteken en foutcodekennis (23-10-2026) ──
  {
    issue: 'apk',
    naam: 'APK-geschiedenis per kenteken: gebreken, adviespunten en wat terugkomt',
    waarom: 'De koopcheck zag alleen de vervaldatum, niet waarop de auto eerder werd afgekeurd.',
    proef: async function () {
      if (!window.PLApk || typeof PLApk.bouw !== 'function') return { staat: 'FOUT', detail: 'PLApk ontbreekt — pidlane-apk.js niet geladen (herladen?)' };
      var k = [{ meld_datum_door_keuringsinstantie: '20250101', meld_tijd_door_keuringsinstantie: '900', gebrek_identificatie: '497' }, { meld_datum_door_keuringsinstantie: '20260101', meld_tijd_door_keuringsinstantie: '900', gebrek_identificatie: '497' }, { meld_datum_door_keuringsinstantie: '20260101', meld_tijd_door_keuringsinstantie: '900', gebrek_identificatie: 'AC1' }];
      var r = PLApk.bouw([], k, [{ gebrek_identificatie: '497', gebrek_omschrijving: 'Kentekenplaatverlichting' }]);
      if (r.samenvatting.terugkerend.length !== 1 || r.samenvatting.adviesLaatste !== 1) return { staat: 'FOUT', detail: JSON.stringify(r.samenvatting) };
      return { staat: 'OK', detail: 'Zoek een kenteken in Garage of Zonder auto: onder de terugroepacties staat de APK-geschiedenis' };
    }
  },
  {
    issue: 'ev-accu',
    naam: 'Bij een EV de accu en het bereik uit open-ev-data, gekozen op de RDW-actieradius',
    waarom: 'De app wist van een elektrische auto niet hoe groot de accu was.',
    proef: async function () {
      if (!window.PLEv || typeof PLEv.zoek !== 'function') return { staat: 'FOUT', detail: 'PLEv ontbreekt — pidlane-evdata.js niet geladen (herladen?)' };
      var r = PLEv.zoek('VOLKSWAGEN', 'ID.3', 2021);
      if (!r || !(r.kwh || (r.kwhOpties && r.kwhOpties.length))) return { staat: 'FOUT', detail: 'ID.3 niet gevonden' };
      return { staat: 'OK', detail: 'ID.3: ' + (r.kwh || r.kwhOpties.join('/')) + ' kWh. Zoek het kenteken van een EV: er staat een blok Accu en bereik' };
    }
  },
  {
    issue: 'foutcodes',
    naam: '212 algemene P0/P2-codes kregen een Nederlandse omschrijving; B2/C2/U2 lenen geen tekst van een ander merk',
    waarom: 'Veel algemene codes stonden als "Onbekende code" in beeld.',
    proef: async function () {
      if (typeof dtcInfo !== 'function' || typeof DTC_OMSCHRIJVING === 'undefined') return { staat: 'FOUT', detail: 'dtcInfo of DTC_OMSCHRIJVING ontbreekt' };
      var mis = ['P0600', 'P0311', 'P0154'].filter(function (c) { return /^Onbekende/.test(dtcInfo(c).desc); });
      if (mis.length) return { staat: 'FOUT', detail: 'nog onbekend: ' + mis.join(', ') + ' — oude pidlane-data.js (herladen?)' };
      return { staat: 'OK', detail: 'P0600: ' + dtcInfo('P0600').desc };
    }
  },

  // ── Dekking van het NL-wagenpark (22-10-2026): RDW, OBDb, EV's ──
  {
    issue: 'dekking',
    naam: 'OBDb vindt je model ook als RDW het merk in de naam zet (TOYOTA AYGO), Opel VauxhallOpel heet, of het een zustermodel is (Skoda Octavia → Golf)',
    waarom: 'Gemeten over 9,3 miljoen NL-auto\'s (RDW): 51% vond een OBDb-model, nu 82%.',
    proef: async function () {
      if (!window.PLEigen || typeof PLEigen.obdbKoppel !== 'function') return { staat: 'FOUT', detail: 'PLEigen.obdbKoppel ontbreekt — oude pidlane-uitgebreid.js (herladen?)' };
      var t = [['TOYOTA', 'TOYOTA AYGO', '', 'Toyota-Aygo'], ['OPEL', 'CORSA', '', 'VauxhallOpel-Corsa'], ['SKODA', 'OCTAVIA', '', 'Volkswagen-Golf'], ['KIA', 'NIRO', 'elektrisch', 'Kia-Niro-EV']];
      var mis = t.filter(function (x) { return PLEigen.obdbKoppel(x[0], x[1], x[2]).namen[0] !== x[3]; });
      if (mis.length) return { staat: 'FOUT', detail: 'verkeerd gekoppeld: ' + mis.map(function (x) { return x[1]; }).join(', ') };
      return { staat: 'OK', detail: 'Rij: Mijn voertuigen → Sensoren → Zoek codes bij een auto die eerder "niet in OBDb" gaf; het model wordt nu gevonden' };
    }
  },
  {
    issue: 'antwoordadres',
    naam: 'Eigen codes met een ander antwoordadres (VAG 70E>778, PSA 6A2>682): ATCRA en flow control, en daarna alles terug',
    waarom: 'Een derde van de NL-auto\'s met een OBDb-model kreeg geen enkele code, omdat VAG, PSA en Opel niet op zendadres + 8 antwoorden.',
    proef: async function () {
      if (!window.PLEigen || typeof PLEigen.controleer !== 'function') return { staat: 'FOUT', detail: 'PLEigen ontbreekt' };
      if (!PLEigen.controleer({ code: '222A0C', naam: 'x', ecu: '710>77A', formule: '[10]' }).ok) return { staat: 'FOUT', detail: 'tx>rx of [n] wordt geweigerd' };
      if (PLEigen.obdbAdres({ hdr: '70E', rax: '778' }) !== '70E>778') return { staat: 'FOUT', detail: 'OBDb-adres 70E→778 niet als tx>rx' };
      return { staat: 'LET OP', detail: 'nog nooit op een auto gedaan. Rij met een VW of Peugeot: Zoek codes, test een code met > in het adres (accu of km-stand); komt er een waarde, en werkt de live view daarna nog?' };
    }
  },
  {
    issue: 'ev',
    naam: 'Uitgebreide test op een elektrische auto: geen plafond "geen toerental", motorweergaven tellen niet mee',
    waarom: 'Een Kia Niro EV (mode 01: 01 21 30 31 5B) kreeg cijfer 5.',
    proef: async function () {
      if (!window.PLFunctieTest || !PLFunctieTest.KERN_EV) return { staat: 'FOUT', detail: 'PLFunctieTest.KERN_EV ontbreekt — oude pidlane-functietest.js (herladen?)' };
      return { staat: 'OK', detail: 'kern EV: ' + PLFunctieTest.KERN_EV.join(', ') + '. Rij met een EV: Full function test; het cijfer is niet begrensd op 5' };
    }
  },
  {
    issue: 'rdwnaam',
    naam: 'Koopcheck: 208, UP!, KA+, MG ZS en SMART #1 zijn geldige modelnamen',
    waarom: '6% van het NL-wagenpark (elke Peugeot) gaf "onbetrouwbare modelnaam".',
    proef: async function () {
      if (typeof _rdwPlausibleName !== 'function') return { staat: 'FOUT', detail: '_rdwPlausibleName ontbreekt' };
      var mis = ['208', 'UP!', 'KA+', 'MG ZS', '#1'].filter(function (x) { return !_rdwPlausibleName(x); });
      if (mis.length || _rdwPlausibleName('========')) return { staat: 'FOUT', detail: 'geweigerd: ' + mis.join(', ') };
      return { staat: 'OK', detail: 'Rij: niet nodig — kenteken-check van een Peugeot toont het model' };
    }
  },
  {
    issue: 'dtcmerk',
    naam: 'Foutcodes: een fabrikantcode (P1xxx) krijgt geen tekst meer van een ander merk',
    waarom: 'Een Peugeot met P1340 kreeg de BMW-uitleg "krukassensor".',
    proef: async function () {
      if (typeof dtcInfo !== 'function' || typeof vehicleInfo === 'undefined') return { staat: 'FOUT', detail: 'dtcInfo ontbreekt' };
      var oud = vehicleInfo.merk; vehicleInfo.merk = 'Peugeot';
      var d; try { d = dtcInfo('P1340').desc; } finally { vehicleInfo.merk = oud; }
      if (!/fabrikantspecifiek/.test(d)) return { staat: 'FOUT', detail: 'Peugeot P1340: ' + d };
      return { staat: 'OK', detail: 'Rij: niet nodig' };
    }
  },

  // ── #541 zonder rit: zes fouten uit bproef-merken.js (#584–#589) ──
  {
    issue: '584',
    naam: 'Foutcodes op K-lijn: een automatisch gevonden KWP (A5) of ISO 9141 (A3) is geen CAN meer, dus geen spookcode',
    waarom: 'Een Mercedes uit 2000 met P0170 en P1570 gaf C3015: de A van AUTO maakte van elke K-lijn-auto een CAN-auto.',
    proef: async function () {
      if (typeof plProtocolBits !== 'function') return { staat: 'FOUT', detail: 'plProtocolBits ontbreekt — pidlane-bt.js niet geladen (herladen?)' };
      if (plProtocolBits('A5') !== 0 || plProtocolBits('A3') !== 0 || plProtocolBits('A6') !== 11) return { staat: 'FOUT', detail: 'A5/A3/A6 geven ' + [plProtocolBits('A5'), plProtocolBits('A3'), plProtocolBits('A6')].join('/') };
      var id = (typeof selectedNetwork !== 'undefined' && selectedNetwork && selectedNetwork.id) || '';
      return { staat: 'OK', detail: 'protocol nu ' + (id || '—') + ' (' + (plProtocolBits(id) ? 'CAN' : 'geen CAN') + '). Rij: een auto van vóór 2008 met een bekende foutcode; de code in Foutcodes moet die van de garage zijn' };
    }
  },
  {
    issue: '585',
    naam: 'Gezondheidscheck: EGR (012C, 0169) en spoelklep (012E) op 0 % stationair blijven staan',
    waarom: 'Op alle zestien nagebouwde auto\'s, ook de CX-5, heetten ze "waarschijnlijk niet aanwezig"; de echte Auris geeft 41 2C 00 en 41 2E 00.',
    proef: async function () {
      if (typeof assessPidQuality !== 'function') return { staat: 'FOUT', detail: 'assessPidQuality ontbreekt' };
      var mis = ['012C', '012E', '0169'].filter(function (p) { return assessPidQuality(p, 0, true).status !== 'ok'; });
      if (mis.length) return { staat: 'FOUT', detail: 'nul is nog "niet aanwezig" voor ' + mis.join(', ') };
      return { staat: 'OK', detail: 'Rij: stationair warm; 012E en 012C staan niet onder "Afwijkende antwoorden" in de Full function test' };
    }
  },
  {
    issue: '586',
    naam: 'Discovery: de steunbits van alle ECU\'s samen — 015B van de hybride-ECU en de PIDs van de bak komen erbij',
    waarom: 'Alleen de eerste ECU-regel telde; bij een Toyota-hybride kwam 015B (hybride accu) nooit in de lijst.',
    proef: async function () {
      if (typeof plSteunbitsUit !== 'function') return { staat: 'FOUT', detail: 'plSteunbitsUit ontbreekt — oude pidlane-rijsituatie.js (herladen?)' };
      var w = plSteunbitsUit('7E8 06 41 40 7A 1C 80 00\r7EA 06 41 40 00 00 00 20', '0140');
      if (!(w & 0x20)) return { staat: 'FOUT', detail: '015B van de tweede ECU ontbreekt' };
      return { staat: 'OK', detail: 'Rij: verbind opnieuw; in het BT-log staat bij 0100 de bitmap van alle ECU\'s samen. Bij de CX-5 komen er PIDs van de bak (7E9) bij, als die er eigen heeft' };
    }
  },
  {
    issue: '587',
    naam: 'IUPR (0908): knippen op het aantal waarden, niet op de lengte',
    waarom: 'Op de echte opname van een Toyota Auris las de app 5120 ritten waar er 24 waren; de ISO-TP-opvulling telde mee.',
    proef: async function () {
      if (!window.PLSurvey2 || typeof PLSurvey2.iupr !== 'function') return { staat: 'FOUT', detail: 'PLSurvey2.iupr ontbreekt' };
      var r = PLSurvey2.iupr('02B\r0: 49 08 14 00 18 00\r1: 9A 00 11 00 18 00 00\r2: 00 00 00 14 00 18 00\r3: 00 00 00 00 1C 00 18\r4: 00 00 00 00 00 00 00\r5: 00 00 0C 00 18 00 00\r6: 00 00 00 00 00 00 00', '4908');
      if (!r || r.ritten !== 24 || r.contact !== 154) return { staat: 'FOUT', detail: 'de Auris-opname geeft ' + (r ? r.ritten + ' / ' + r.contact : 'niets') + ' in plaats van 24 / 154' };
      return { staat: 'OK', detail: 'Rij: Full function test; de IUPR-regel noemt een aannemelijk aantal ritten (tientallen tot honderden, geen duizenden)' };
    }
  },
  {
    issue: '588',
    naam: 'VIN: Toyota uit Turkije, Frankrijk en Engeland, Kia, Hyundai, Dacia en anderen uit Europese fabrieken krijgen hun merk',
    waarom: 'Zonder kenteken werd een Corolla (NMT) of Yaris (VNK) "Onbekend merk", en viel alles weg wat op het merk leunt.',
    proef: async function () {
      if (typeof decodeVIN !== 'function') return { staat: 'FOUT', detail: 'decodeVIN ontbreekt' };
      var mis = ['NMTBZ3BE00R000001', 'VNKKD3D310A123456', 'U5YH2512AJL000001', 'TMAJ38LADJJ000001'].filter(function (v) { return /Onbekend/.test(decodeVIN(v).merk); });
      if (mis.length) return { staat: 'FOUT', detail: 'onbekend: ' + mis.map(function (v) { return v.slice(0, 3); }).join(', ') };
      return { staat: 'OK', detail: 'Rij: niet nodig — dit is een tabel; met een Europese Toyota zonder kenteken staat het merk op de voertuigkaart' };
    }
  },
  {
    issue: '589',
    naam: 'Derde poort: hybride is alleen e-CVT bij Toyota, Lexus, Ford en Suzuki; een Kia-hybride heeft een DCT',
    waarom: 'Elke hybride kreeg "cvt: ja"; RPM_CONST en RATIO_CONST hebben nu een eigen hybride-voorwaarde.',
    proef: async function () {
      if (!window.PLKenmerk || typeof PLKenmerk.profiel !== 'function') return { staat: 'FOUT', detail: 'PLKenmerk ontbreekt' };
      var t = PLKenmerk.profiel({ brandstof: 'hybride', merk: 'Toyota' }).cvt, k = PLKenmerk.profiel({ brandstof: 'hybride', merk: 'Kia' }).cvt;
      if (!t || t.waarde !== true || !k || k.waarde !== false) return { staat: 'FOUT', detail: 'Toyota ' + JSON.stringify(t) + ', Kia ' + JSON.stringify(k) };
      return { staat: 'OK', detail: 'Rij: niet nodig — met een hybride zegt blok 5 bij de derde poort cvt ja (Toyota) of nee (Kia)' };
    }
  },

  // ── Full survey V2 (schema 3): de acht stappen van #541 als tabelregel ──
  {
    issue: '541',
    naam: 'Full survey V2: schema 3 meet mode 09, OBDonUDS, mode 06 en UDS erbij en zet de campagnetabel van #541 in de uitkomst',
    waarom: 'De rittencampagne begint; per auto vraagt #541 acht stappen en een tabel met ✓/✗. Schema 2 dekte stap 1–3.',
    proef: async function () {
      if (!window.PLSurvey2 || typeof PLSurvey2.meet !== 'function' || PLSurvey2.SCHEMA !== 3)
        return { staat: 'FOUT', detail: 'PLSurvey2 (schema 3) ontbreekt — pidlane-survey2.js niet geladen (herladen?)' };
      var c = PLSurvey2.campagne({ pids: { total: 1, ok: 1 } });
      if (c.length !== 8) return { staat: 'FOUT', detail: 'de campagne heeft ' + c.length + ' stappen in plaats van 8' };
      if (!PLSurvey2.obdOnUds('62 F4 00 80 00 00 00').ja) return { staat: 'FOUT', detail: 'een OBDonUDS-antwoord wordt niet herkend' };
      return { staat: 'OK', detail: 'Rij: verbonden, ⋯ → Full function test; onderaan staat "Campagne #541 — survey V2" met acht regels en een tabelregel om in #541 te plakken. Draai eerst Alle sensoren zoeken, dan vult stap 7 zich' };
    }
  },

  // ── Alle sensoren zoeken: elke kandidaat één keer op de auto, alleen een plausibele waarde voorgesteld ──
  {
    issue: 'pidzoek',
    naam: 'Alle sensoren zoeken: de keuring houdt een onmogelijke waarde, alleen FF en −40 °C buiten het voorstel',
    waarom: 'Voor de Mazda kostte het weken om per code te testen of het getal klopte; nu doet één knop in Mijn voertuigen → Sensoren dat voor het hele model.',
    proef: async function () {
      if (!window.PLPidZoek || typeof PLPidZoek.plausibel !== 'function' || typeof PLPidZoek.zoek !== 'function')
        return { staat: 'FOUT', detail: 'PLPidZoek ontbreekt — pidlane-pidzoek.js niet geladen (herladen?)' };
      var P = function (b, w, u) { return PLPidZoek.plausibel({ ok: true, bytes: b, waarde: w, eenheid: u }, { naam: 'x' }).ok; };
      if (!P([0x21, 0x50], 85, '°C')) return { staat: 'FOUT', detail: '85 °C wordt afgekeurd' };
      if (P([0xFF, 0xFF], 65.5, 'V') || P([0x00], -40, '°C') || P([0x02], 600, '°C')) return { staat: 'FOUT', detail: 'FF, −40 °C of 600 °C komt door de keuring' };
      return { staat: 'OK', detail: 'keuring werkt. Rij: verbonden, Mijn voertuigen → Sensoren → 🚀 Zoek alle sensoren; het overzicht staat in dezelfde groepen als je eigen sensoren en Neem N op bewaart ze' };
    }
  },

  // ── Tegoed: de afboekregel draagt het serversaldo, en de laadregel zegt dat zijn getal van dit toestel komt (#524) ──
  {
    issue: '524',
    naam: 'Tegoed: na een analyse noemt het logboek het saldo van de server, één keer, met de analyse erbij',
    waarom: 'Op 15-10-2026 zei het logboek "-85 (saldo 0)" terwijl de server 15 had; de laadregel "saldo 100" was het getal van het toestel.',
    proef: async function () {
      if (!window.PLCredits || typeof PLCredits.meld !== 'function' || typeof PLCredits.volgServer !== 'function')
        return { staat: 'FOUT', detail: 'PLCredits.meld of volgServer ontbreekt — oude pidlane-credits.js (herladen?)' };
      if (!PLCredits.saldoBekend()) return { staat: 'LET OP', detail: 'nog geen saldo bekend op dit toestel — log in als klant en draai opnieuw' };
      return { staat: 'OK', detail: 'saldo nu ' + PLCredits.saldo() + '. Rij: ingelogd als klant één analyse draaien; in het logboek staat één regel "Tegoed afgeboekt: -N voor <analyse> (saldo M …)" en M is wat Meer → Mijn account en tegoed zegt.' };
    }
  },

  // ── Kosten per maand: wegenbelasting uit de wettekst, pompprijs op adviesprijs, één prijstabel (#505) ──
  {
    issue: '505',
    naam: 'Kosten per maand: dieseltoeslag volgens art. 23 (€ 153 + € 16,57 per 100 kg), pompprijzen op de adviesprijs van oktober, en ritkosten en wijzer rekenen met dezelfde prijs',
    waarom: 'De pompprijzen stonden op de CBS-stand van juli en de ritkosten nog op 1,95/1,70; de dieseltoeslag was een eigen lijn in plaats van de wettabel.',
    proef: async function () {
      var W = window.PLWijzer && PLWijzer._kern;
      if (!W || typeof W.tarief !== 'function' || !W.PRIJS) return { staat: 'FOUT', detail: 'PLWijzer._kern.tarief of PRIJS ontbreekt — oude pidlane-wijzer.js (herladen?)' };
      var B = window.PLBerekend && PLBerekend.PRIJS_STANDAARD;
      if (!B) return { staat: 'FOUT', detail: 'PLBerekend.PRIJS_STANDAARD ontbreekt' };
      if (B.benzine !== W.PRIJS.benzine || B.diesel !== W.PRIJS.diesel) return { staat: 'FOUT', detail: 'twee pompprijzen in de app: ritkosten ' + B.benzine + '/' + B.diesel + ', kosten per maand ' + W.PRIJS.benzine + '/' + W.PRIJS.diesel };
      if (W.tarief(W.MRB.diesel, W.MRB.dieselPer100, 1100) !== 169.57) return { staat: 'FOUT', detail: 'dieseltoeslag 1.100 kg is niet € 169,57' };
      return { staat: 'OK', detail: 'één prijs (benzine ' + W.PRIJS.benzine + ', diesel ' + W.PRIJS.diesel + ', peil ' + W.PEIL + '). Rij: kenteken-check van een diesel en een benzine van jouw gewicht; vergelijk de wegenbelasting met belastingdienst.nl/mrb-berekenen in je eigen provincie — binnen de bandbreedte?' };
    }
  },

  // ── Wintercheck en ritpatroon: één thermostaatoordeel (#558) ──
  {
    issue: '558',
    naam: 'Wintercheck: het thermostaatoordeel komt uit PLWinterRit.opwarming, en een koelwater dat na het opwarmen terugzakt is rood',
    waarom: 'De wintercheck had eigen grenzen en zag het terugzakken niet, terwijl het ritpatroon daar juist op oordeelt: twee oordelen over één thermostaat.',
    proef: async function () {
      if (!window.PLWinterRit || typeof PLWinterRit.opwarming !== 'function')
        return { staat: 'FOUT', detail: 'PLWinterRit.opwarming ontbreekt — oude pidlane-winterrit.js (herladen?)' };
      var o = PLWinterRit.opwarming({ eind: 90, tijdWarm: 300, minNaWarm: 70 });
      if (o.niveau !== 'fout') return { staat: 'FOUT', detail: 'terugzakken tot 70 °C na het opwarmen geeft ' + o.niveau };
      if (PLWinterRit.opwarming({}).niveau !== 'onbekend') return { staat: 'FOUT', detail: 'zonder koelwater toch een oordeel' };
      return { staat: 'OK', detail: 'één oordeel, grenzen ' + PLWinterRit.CFG.bedrijf + '/' + PLWinterRit.CFG.opwarmTot + ' °C en ' + PLWinterRit.CFG.traagS + ' s. Rij: Klimaat → Wintercheck op een koude motor; het oordeel hoort hetzelfde te zeggen als het thermostaatadvies in de garage.' };
    }
  },

  // ── PiP-klokje: naald voor de toeren, kleur alleen bij een warme motor, stopknop in het venster ──
  {
    issue: 'pip-klokje',
    naam: 'Beeld-in-beeld: het kleine venster is een toerenteller met naald, kleurt pas bij de koelwatergrens uit PIDS, en de stopknop verbreekt vóór het venster sluit',
    waarom: 'Het oude venster knipperde elke seconde en stond als een hoge witte kolom over de navigatie; klanten vonden het irritant.',
    proef: async function () {
      if (!window.PLPip || typeof PLPip.meterStand !== 'function' || typeof PLPip.stop !== 'function')
        return { staat: 'FOUT', detail: 'PLPip.meterStand of PLPip.stop ontbreekt — oude pidlane-pip.js (herladen?)' };
      var koel = (window.PIDS || []).filter(function (x) { return x.pid === '0105'; })[0];
      if (!koel) return { staat: 'FOUT', detail: 'PIDS kent 0105 niet — de grens van het klokje heeft geen bron' };
      var r = PLPip.meterStand({ '010C': 782, '010D': 0, '0105': 69 });
      if (r.staat !== 'rustig') return { staat: 'FOUT', detail: 'stationair en koud geeft ' + r.staat + ' in plaats van rustig' };
      if (PLPip.meterStand({ '0105': koel.wH }).staat !== 'let') return { staat: 'FOUT', detail: koel.wH + ' °C koelwater kleurt het venster niet oranje' };
      if (PLPip.meterStand({ '010C': 9000 }).hoek !== 390) return { staat: 'FOUT', detail: 'boven de schaal draait de naald door' };
      return { staat: 'OK', detail: 'rustig bij ' + r.rpm + ' tpm, oranje vanaf ' + koel.wH + ' °C, rood vanaf ' + koel.dH + ' °C. Rij: verbind, schakel naar de navigatie; het venster is vierkant met een naald die de toeren volgt. Tik erop: de knop "Stop meten" verbreekt en het venster verdwijnt; de rit staat daarna in de historie.' };
    }
  },

  // ── Aankooprapport: vers gewiste codes zijn rood, een onvolledige meting krijgt geen groen, het VIN gaat niet mee ──
  {
    issue: 'aankooprapport',
    naam: 'Aankooprapport: een auto met 12 km sinds wissen en een permanente code is rood, zonder zelftests is er geen groen, en het VIN staat niet in het rapport',
    waarom: 'Het aankooprapport is nieuw; het oordeel komt uit regels in de app, en een niet gelezen onderdeel mag nooit als "in orde" lezen.',
    proef: async function () {
      if (!window.PLAankoop || typeof PLAankoop.model !== 'function')
        return { staat: 'FOUT', detail: 'PLAankoop ontbreekt — oude index.html of pidlane-aankooprapport.js niet geladen (herladen?)' };
      var basis = function () {
        return { kenteken: 'R054XD', ts: Date.now(), rdw: { merk: 'MAZDA', handelsbenaming: 'CX-5', tellerstandoordeel: 'Logisch' },
          obd: { verbonden: true, vin: 'WVWZZZ1JZXW000001', dtc: { actief: [], pending: [], permanent: [] },
            readiness: { mil: false, monitors: [{ monitor: 'Misfire', gereed: true }], nietGereed: [] }, kmSindsWissen: 9000, warmupsSindsWissen: 200 } };
      };
      var vers = basis(); vers.obd.kmSindsWissen = 12; vers.obd.dtc.permanent = ['P0420'];
      var m1 = PLAankoop.model(vers);
      if (m1.kleur !== 'rood') return { staat: 'FOUT', detail: 'vers gewist met permanente code geeft ' + m1.kleur + ' in plaats van rood' };
      var zonder = basis(); zonder.obd.readiness = null;
      var m2 = PLAankoop.model(zonder);
      if (m2.kleur === 'groen') return { staat: 'FOUT', detail: 'zonder zelftests toch groen — een niet gelezen onderdeel leest als goed' };
      if (JSON.stringify({ v: m1.voorblad, s: m1.secties }).indexOf('WVWZZZ1JZXW000001') >= 0) return { staat: 'FOUT', detail: 'het VIN staat in het rapport dat gedeeld wordt' };
      return { staat: 'OK', detail: 'vers gewist rood, onvolledig ' + m2.kleur + ', VIN niet in het rapport. Rij: koopcheck → 📄 Aankooprapport maken, met en zonder plaats; lees de PDF na op voorblad, vragen en disclaimer' };
    }
  },

  // ── Toestandsgrenzen: start, stilstand en rijden hebben hun eigen grens; één alarmmonster is een uitschieter ──
  {
    issue: 'toestandgrens',
    naam: 'Oordeel van de app: één meting over de alarmgrens is let op, de startdip van de accu, hoge belasting bij het rijden en warme inlaatlucht bij stilstand zijn geen vlag',
    waarom: 'De AI noemde het oordeel van de conditiecheck "te kort door de bocht": een vaste band kent geen start, geen stilstand en geen vol gas.',
    proef: async function () {
      if (!window.PLVerzamel || typeof PLVerzamel.toestandUit !== 'function' || !window.PID_TOESTAND)
        return { staat: 'FOUT', detail: 'PLVerzamel.toestandUit of PID_TOESTAND ontbreekt — oude pidlane-verzamel.js/pidlane-data.js (herladen?)' };
      var r = function (n, f) { var a = []; for (var i = 0; i < n; i++) a.push({ t: i * 500, v: f(i) }); return a; };
      var rpm = r(60, function (i) { return i < 10 ? 0 : 800; });
      var acc = r(60, function (i) { return (i === 9 || i === 10) ? 10.1 : (i < 9 ? 12.5 : 14.2); });
      var tst = PLVerzamel.toestandUit({ '010C': rpm });
      var b = PLVerzamel.beoordeel('0142', acc, getPidDef('0142'), window.PID_LET_OP, null, PID_TOESTAND['0142'], tst);
      if (b.oordeel !== 'ok') return { staat: 'FOUT', detail: 'de startdip van 10,1 V heet nog ' + b.oordeel + ': ' + b.reden };
      var los = PLVerzamel.beoordeel('0105', r(20, function (i) { return i === 7 ? 112 : 90; }), getPidDef('0105'), window.PID_LET_OP, null);
      if (los.oordeel !== 'let') return { staat: 'FOUT', detail: 'één meting van 112 °C koelwater heet ' + los.oordeel + ' in plaats van let op' };
      return { staat: 'OK', detail: 'startdip geen vlag, één alarmmonster is let op. Rij: conditiecheck met een koude start in het stilstanddeel en flink optrekken in het rijdeel; accuspanning en motorbelasting horen niet rood of oranje te staan, en het AI-rapport hoort het oordeel van de app niet meer "te kort door de bocht" te noemen.' };
    }
  },

  // ── Tokens: eerdere rapporten als kern, korte vragen naar het lichte model ──
  {
    issue: 'tokens',
    naam: 'AI-kosten: een eerder rapport gaat als conclusie en advies mee in plaats van zijn eerste 1.800 tekens; korte vragen zonder meetdata gaan naar het lichte model',
    waarom: 'Het begin van een eerder rapport was voertuiggegevens en een sensortabel die de analyse al vers krijgt — betaalde invoer zonder nut.',
    proef: async function () {
      if (typeof plRapportKern !== 'function') return { staat: 'FOUT', detail: 'plRapportKern ontbreekt — oude pidlane-archief.js (herladen?)' };
      var tabel = 'VOERTUIGGEGEVENS\nVW Golf\n\nSENSORANALYSE\n'; for (var i = 0; i < 40; i++) tabel += '| 01' + i + ' | ' + i + ' | normaal |\n';
      var k = plRapportKern(tabel + '\nCONCLUSIE\nLek in de inlaat.\n\nADVIES\n- Rookproef\n');
      if (k.indexOf('Lek in de inlaat') < 0 || k.indexOf('| 01') >= 0) return { staat: 'FOUT', detail: 'de kern is niet de conclusie: ' + k.slice(0, 120) };
      // Het model van een aanroep is alleen in een echte call te zien; hier de constante zelf.
      if (typeof AI_LICHT !== 'string' || !/haiku/i.test(AI_LICHT)) return { staat: 'FOUT', detail: 'AI_LICHT ontbreekt of is geen Haiku — oude pidlane-fuel.js (herladen?)' };
      return { staat: 'OK', detail: 'kern = conclusie en advies, AI_LICHT = ' + AI_LICHT + '. Rij: twee analyses na elkaar met "eerdere rapporten mee"; het kasboek hoort bij de tweede minder tokensIn te tonen dan vóór 21-10, en een lampjesfoto of "Meer over dit model" hoort met model haiku in het kasboek te staan.' };
    }
  },

  // ── #567: STAT_RPM meet de schommeling rond het verloop, niet het wegzakken zelf ──
  {
    issue: '567',
    naam: 'Ruw stationair (STAT_RPM): een toerental dat na een stop wegzakt met ruis erop is geen melding meer; echte ruwloop en één parse-hik blijven zoals ze waren',
    waarom: 'Op de rit van 20-10 om 19:02 gaf een wegzakkend toerental 238 rpm "schommeling" bij 26% richtingswisselingen, net boven de poort van 25%.',
    proef: async function () {
      var t = window.PLWatch && (PLWatch.tests || []).find(function (x) { return x.id === 'STAT_RPM'; });
      if (!t) return { staat: 'FOUT', detail: 'STAT_RPM ontbreekt in PLWatch.tests — oude pidlane-watchers.js (herladen?)' };
      var ctx = function (r) { return { win: function (p) { return p === '010C' ? r : []; }, val: function () { return 0; } }; };
      var ruis = [0, 12, -8, 15, -14, 6, -10, 14, -5, 9, -15, 4, 11, -9, 13, -6, 8, -12, 10, -4];
      var zakt = ruis.map(function (e, i) { return Math.round(700 + 400 * Math.exp(-i / 6) + e); });
      var ruw = ruis.map(function (e, i) { return 800 + (i % 2 ? 100 : -100); });
      if (t.check(ctx(zakt)) !== null) return { staat: 'FOUT', detail: 'een wegzakkend toerental met ruis heet nog ruw stationair' };
      if (!t.check(ctx(ruw))) return { staat: 'FOUT', detail: 'echt oscillerend stationair geeft geen melding meer' };
      return { staat: 'OK', detail: 'Rij: stop na een stuk rijden en laat de motor warm stationair draaien; de rit-monitor hoort binnen de eerste 15 s na de stop geen "ruw stationair" te melden, en met de airco aan/uit wel zoals voorheen.' };
    }
  },

  // ── Eén aanlevering voor alle analyses: profiel uit de meting, kwaliteit één keer ──
  {
    issue: 'aanlevering',
    naam: 'Eén kwaliteitsoordeel per sensor: wat de samenvatting toont is over het venster beoordeeld, de aanlevering oordeelt over de rest; het profiel komt uit de meting',
    waarom: 'Acht analyses stuurden het kwaliteitsblok en de correlatielijst twee keer mee, de aanlevering oordeelde nog eens op de live waarde, en de oorzaakanalyse beloofde een emissiedekking over een meting van de selectie (#565).',
    proef: async function () {
      if (!window.PLVerzamel || typeof PLVerzamel.aanlevering !== 'function' || !window.PLAanlevering || typeof PLAanlevering.kwaliteitsPids !== 'function')
        return { staat: 'FOUT', detail: 'PLVerzamel.aanlevering of PLAanlevering.kwaliteitsPids ontbreekt — oude pidlane-verzamel.js/pidlane-aanlevering.js (herladen?)' };
      var sam = { rijen: [{ pid: '0105' }, { pid: '010C' }] };
      var a = PLVerzamel.aanlevering({ profiel: null, bron: null, sam: sam }, 'Toets', 'emissie');
      if (a.profiel) return { staat: 'FOUT', detail: 'een meting zonder profiel krijgt toch een profiel in de aanlevering: ' + a.profiel };
      var b = PLVerzamel.aanlevering({ profiel: 'basis', bron: null, sam: sam }, 'Toets');
      if (b.profiel !== 'basis' || !b.zichtbaar || b.zichtbaar.join() !== '0105,010C') return { staat: 'FOUT', detail: 'profiel of zichtbare sensoren komen niet uit de meting: ' + JSON.stringify(b) };
      var k = PLAanlevering.kwaliteitsPids({ geleverd: ['0105', '0142'] }, b.zichtbaar);
      if (k.join() !== '0142') return { staat: 'FOUT', detail: 'een sensor uit de samenvatting krijgt nog een oordeel op zijn live waarde: ' + k.join() };
      var t = PLAanlevering.blok(b);
      var keer = (t.match(/DATAKWALITEIT \(/g) || []).length;
      if (keer > 1 || !/beoordeeld over het hele meetvenster/.test(t)) return { staat: 'FOUT', detail: 'het blok zegt niet waar het oordeel over de samenvatting staat, of oordeelt ' + keer + '×' };
      var heeft = typeof pidVals !== 'undefined' && typeof pidVals['0105'] === 'number';
      return { staat: heeft ? 'OK' : 'LET OP', detail: (heeft ? 'de samenvatting oordeelt over het venster, de aanlevering over de rest.' : 'geen koelwaterwaarde nu — de live kant is niet getoetst.') +
        ' Rij: AI-monteur → "Laat de AI dit onderzoeken"; het rapport hoort niet twee keer dezelfde UITGESLOTEN/ONZEKER-lijst te noemen.' };
    }
  },

  // ── #560: tractie-ingrijpen afgeleid uit gaspedaal, gasklep, toeren en snelheid ──
  {
    issue: '560',
    naam: 'Mogelijk wielslip per rit (cd.tc): koppelreductie en wielspin in dezelfde versnelling, alleen verse monsters; advies in Mijn voertuigen bij kou',
    waarom: 'Generieke OBD ziet de ESP-module niet; het koppelpad wel. Schakelmomenten en een niet-ververst gaspedaal mogen niet als slip tellen.',
    proef: async function () {
      if (!window.PLConditie || !window.PLWinterRit || typeof PLWinterRit.tractie !== 'function')
        return { staat: 'FOUT', detail: 'PLWinterRit.tractie ontbreekt — oude pidlane-winterrit.js/pidlane-conditie.js (herladen?)' };
      var a = null, t = 0;
      for (var i = 0; i < 40; i++) { t += 2000; a = PLConditie.tik(a, { kmh: 50, rpm: 2000, pedaal: 30, gasklep: i === 20 ? 12 : 25, pedaalT: t, gasklepT: t }, 2); }
      var cs = PLConditie.samenvat(a);
      if (!cs || cs.tc !== 1) return { staat: 'FOUT', detail: 'een gasklep die zakt bij een vast gaspedaal telt niet als mogelijk ingrijpen' };
      var heeft = typeof pidVals !== 'undefined' && typeof pidVals['0149'] === 'number' && typeof pidVals['0111'] === 'number';
      return { staat: heeft ? 'OK' : 'LET OP', detail: (heeft ? 'deze auto geeft gaspedaal (0149) en gasklep (0111).' : 'geen 0149 of 0111 nu — dan meet de rit niets voor tractie.') +
        ' Rij: op een gladde dag kort stevig optrekken; daarna hoort de rit in Mijn voertuigen extra.cd.tc te hebben.' };
    }
  },

  // ── Er is iets mis: eerst wat, dan wanneer, met codes en een algemene check ──
  {
    issue: 'intake',
    naam: 'Er is iets mis: tegels "Wat merk je?" (meer mag), zelf beschrijven met live herkenning, een foutcode invoeren, algemene check; daarna "Wanneer?" met meerkeuze',
    waarom: 'De intake begon met vijf vaste antwoorden op "Wanneer merk je het?", één keuze, en een verplicht tekstveld — te beperkt; de laatste keuze viel achter de Android-knoppen.',
    proef: async function () {
      if (!window.PLWizard || !PLWizard._kern || !PLWizard._boom.storing_wat || !PLOnderzoek.KLACHTEN.geluid)
        return { staat: 'FOUT', detail: 'de nieuwe intake (storing_wat, PLWizard._kern, klacht geluid) ontbreekt — oude pidlane-wizard.js/pidlane-onderzoek.js (herladen?)' };
      var K = PLWizard._kern;
      if (K.codesUit('p0171').join() !== 'P0171') return { staat: 'FOUT', detail: 'een getypte foutcode wordt niet herkend' };
      if (K.metingUit(['soms', 'belast']) !== 'monitor' || K.metingUit(['belast']) !== 'rit10') return { staat: 'FOUT', detail: 'het moment geeft niet de goede meting' };
      var st = PLOnderzoek.nieuw({ klachten: ['onrustig'], codesHand: ['P0171', 'P0174'] });
      if (!st.v.valselucht || st.v.valselucht.score > PLOnderzoek.cfg.bevestigd / 2) return { staat: 'FOUT', detail: 'een opgegeven code weegt te zwaar of telt niet' };
      return { staat: 'OK', detail: 'Rij: Er is iets mis → tik "Onrustig", typ "hapert bij optrekken" en een code als je er een hebt; bij Wanneer "Optrekken". Het plan hoort te zeggen wat je merkt en wat de code betekent, en de laatste keuze moet boven de Android-knoppen staan.' };
    }
  },

  // ── Totaalcheck: stilstand en rijden apart, verdiepen waar iets afwijkt ──
  {
    issue: 'totaalcheck',
    naam: 'Totaalcheck in twee delen: stilstand (met foutcodes en zelftests) en gewoon rijden, uitslag per categorie, focusmeting alleen waar iets afwijkt',
    waarom: 'De check uit week 1 was een vragenlijst en daarna een rijtest van vijf fases van twee minuten; de vragen voegden niets toe en de fases kostten tien minuten.',
    proef: async function () {
      if (!window.PLTotaal || !document.getElementById('tcStappen') || document.querySelector('#pane-check .chk-qrow'))
        return { staat: 'FOUT', detail: 'PLTotaal of #tcStappen ontbreekt, of de oude vragenlijst staat er nog — oude pidlane-totalcheck.js/index.html (herladen?)' };
      var H = { '010D': [{ t: 0, v: 0 }, { t: 1000, v: 60 }], '0105': [{ t: 0, v: 90 }, { t: 1000, v: 95 }] };
      var st = PLTotaal.deelHist(H, 'stil', MEET_RIJ_KMH, MEET_RIJ_GAT_MS), rj = PLTotaal.deelHist(H, 'rij', MEET_RIJ_KMH, MEET_RIJ_GAT_MS);
      if (st.hist['0105'].length !== 1 || st.hist['0105'][0].v !== 90 || rj.hist['0105'][0].v !== 95)
        return { staat: 'FOUT', detail: 'stilstand en rijden worden niet op de snelheid gesplitst' };
      var sam = function (o) { return { rijen: [{ pid: '0105', naam: 'Koelwater temp', n: 10, min: 90, max: 90, oordeel: o }] }; };
      var c = PLTotaal.categorieen({ stil: sam('ok'), rij: sam('afwijkend') }, null, function () { return 'Temp'; }, CHK_CAT_ORDER)[0];
      if (!c || !c.focus || !PLTotaal.focusPlan(c).rijden) return { staat: 'FOUT', detail: 'een afwijking alleen rijdend geeft geen rijdende focusmeting' };
      if (PLTotaal.categorieen({ stil: sam('ok') }, null, function () { return 'Temp'; }, CHK_CAT_ORDER)[0].open)
        return { staat: 'FOUT', detail: 'een categorie die klopt gaat toch open' };
      return { staat: 'OK', detail: 'Rij: Brede controle → Start stilstand (± 1 min, daarna foutcodes), dan Start rijden en gewoon wegrijden; het scherm hoort na zo’n anderhalve minuut rijden vanzelf naar de uitslag te gaan, zonder "Rijtest starten".' };
    }
  },

  // ── Winter (#556–#559): profiel, weer, banner, bandentabel, ritpatroon ──
  {
    issue: '556',
    naam: 'Winter: winterkaart op het startscherm, profiel (banden, sproeier, plaats), bandentabel; korte ritten en thermostaat uit de ritten; per rit bt/wt/kz',
    waarom: 'De wintercheck mat één opwarming; zomervloeistof, zomerbanden bij 3 °C en een openhangende thermostaat bleven onbenoemd.',
    proef: async function () {
      if (!window.PLWinter || !window.PLWeer || !window.PLWinterRit || !document.getElementById('plWinterKaart'))
        return { staat: 'FOUT', detail: 'PLWinter, PLWeer, PLWinterRit of #plWinterKaart ontbreekt — oude index.html of modules (herladen?)' };
      var K = PLWinter._kern, nov = new Date(2026, 10, 20, 12).getTime();
      var vorst = PLWeer._kern.samenvat([{ datum: PLWeer._kern.lokaleDatum(nov), min: -3, max: 2 }], nov);
      var a = K.adviezen({ nu: nov, profiel: { sproeier: 'zomer', banden: 'zomer' }, weer: vorst });
      if (!a.length || a[0].ernst !== 'rood') return { staat: 'FOUT', detail: 'zomervloeistof en zomerbanden bij vorst geven geen rood advies' };
      if (K.bandenStand('winter', 17).label === 'past goed') return { staat: 'FOUT', detail: 'een winterband bij 17 °C heet "past goed"' };
      var cs = window.PLConditie ? PLConditie.samenvat(PLConditie.tik(null, { kmh: 40, rpm: 1500, koelwater: 30, buiten: 2 }, 2)) : null;
      if (!cs || cs.bt !== 2)
        return { staat: 'FOUT', detail: 'PLConditie legt de buitentemperatuur niet vast — oude pidlane-conditie.js' };
      var b = typeof pidVals !== 'undefined' && pidVals && typeof pidVals['0146'] === 'number' ? 'deze auto geeft 0146 (' + pidVals['0146'] + ' °C)' : 'geen 0146 nu — de inlaatlucht van een koude start telt dan';
      return { staat: 'OK', detail: b + '. Rij: een koude start en een stuk snelweg; daarna hoort de rit in Mijn voertuigen extra.cd.bt, wt en kz te hebben.' };
    }
  },

  // ── Bekende adapter en auto: klik, wacht, klaar ──
  {
    issue: 'snelverbinden',
    naam: 'Snel verbinden: bij een bekende adapter, auto en login alleen "Verbinden met voertuig…", geen vragen; adapter stil → pair-knop',
    waarom: 'Bij een bekende auto zag de gebruiker vijf vensters (kenteken, protocol, scanvraag, samenvatting) voor antwoorden die al bekend waren.',
    proef: async function () {
      if (typeof plSnelBekend !== 'function' || !document.getElementById('snelStatus'))
        return { staat: 'FOUT', detail: 'plSnelBekend() of #snelStatus ontbreekt — oude pidlane-bt.js/index.html (herladen?)' };
      var l = function (o) { return function (k) { return k in o ? o[k] : null; }; };
      var alles = { spp_address: 'x', pl_kenteken: 'x', pl_proto_id: 'A6', pl_vinprof_x: '{}' };
      if (!plSnelBekend(l(alles), Object.keys(alles), true)) return { staat: 'FOUT', detail: 'alles bekend en toch geen snelle stand' };
      if (plSnelBekend(l(alles), Object.keys(alles), false)) return { staat: 'FOUT', detail: 'snelle stand zonder login' };
      return { staat: 'OK', detail: 'Rij: verbind twee keer met dezelfde auto; de tweede keer hoort alleen "Verbinden met voertuig…" te verschijnen. Zet de adapter uit: dan hoort de melding de pair-knop te noemen.' };
    }
  },

  // ── Een Bose-speaker is geen OBD2-adapter ──
  {
    issue: 'obdnaam',
    naam: 'Adapterkeuze bij een SPP-scan: één naamoordeel, een SoundLink-speaker telt niet als OBD2-adapter',
    waarom: 'Op 19-10 verbond de app eerst met "LE-Bose Revolve SoundLink" (kale \'link\' in de SPP-lijst) en had een tweede scanronde nodig.',
    proef: async function () {
      if (typeof isObdNaam !== 'function') return { staat: 'FOUT', detail: 'isObdNaam() ontbreekt — oude pidlane-bt.js (herladen?)' };
      if (isObdNaam('LE-Bose Revolve SoundLink')) return { staat: 'FOUT', detail: 'een SoundLink-speaker telt als OBD2-adapter' };
      if (!isObdNaam('OBDLink MX+ 90011') || !isObdNaam('vLinker MC+')) return { staat: 'FOUT', detail: 'een echte adapternaam wordt niet herkend' };
      return { staat: 'OK', detail: 'Rij: verbind met Bluetooth-audio in de buurt aan; in het logboek hoort alleen de adapter als "OBD2 adapter" te staan en de eerste poging naar de adapter te gaan.' };
    }
  },

  // ── De expert begint niet bij nul: voorkennis in de vstate, zonder VIN ──
  {
    issue: 'voorkennis',
    naam: 'Expert op afstand: voorkennis bij het verbinden (kansen, foutcodes met geschiedenis, mode 06, rapporttitels), VIN alleen als pseudoniem',
    waarom: 'De expert kreeg alleen het nu, en de vstate droeg de ruwe VIN naar de Worker en elke expert.',
    proef: async function () {
      if (!window.PLVoorkennis || typeof PLVoorkennis.uitApp !== 'function' || !window.PLRemote || typeof PLRemote._buildVState !== 'function')
        return { staat: 'FOUT', detail: 'PLVoorkennis.uitApp of PLRemote._buildVState ontbreekt — oude pidlane-voorkennis.js/pidlane-remote.js (herladen?)' };
      var v = PLRemote._buildVState(), js = JSON.stringify(v);
      var vin = (typeof vehicleInfo !== 'undefined' && vehicleInfo && vehicleInfo.vin) ? String(vehicleInfo.vin) : '';
      if (vin && js.indexOf(vin) >= 0) return { staat: 'FOUT', detail: 'de ruwe VIN staat in de vstate voor de expert' };
      if (v.veh && 'vin' in v.veh) return { staat: 'FOUT', detail: 'veh.vin bestaat nog in de vstate' };
      if (!v.voorkennis) return { staat: 'FOUT', detail: 'geen voorkennis in de vstate' };
      if (js.length > 32768) return { staat: 'FOUT', detail: 'vstate is ' + js.length + ' tekens; de Worker weigert alles boven 32768' };
      var vk = v.voorkennis;
      var d = vk.kansen.length + ' kans(en), ' + vk.bekend.length + ' bekend bij ' + (vk.merk || 'onbekend merk') + ', ' + vk.foutcodes.length + ' foutcode(s), ' +
        (vk.mode06 ? 'mode 06 gelezen' : 'geen mode 06') + ', ' + vk.rapporten.length + ' rapport(en); vstate ' + js.length + ' tekens';
      if (!vin) return { staat: 'LET OP', detail: d + '. Geen VIN gelezen, dus het pseudoniem is niet getoetst — verbind met de auto' };
      return { staat: 'OK', detail: d + (v.veh && v.veh.vin_pseudo ? ', VIN als pseudoniem' : ', alleen de WMI (pseudoniem nog onderweg)') +
        '. Rij: deel een sessie, kijk mee als expert en controleer dat "Eerst kijken naar" klopt met de foutcodes.' };
    }
  },

  // ── Rondgang: elke pagina op één scherm, een lege pagina krijgt verwante sensoren ──
  {
    issue: 'rondgang',
    naam: 'Rondgang in Slim: dichter tekenen in plaats van splitsen, verwante sensoren op een half lege pagina',
    waarom: 'Volle pagina\'s vielen onder de navigatie en Uitlaatgas of Brandstofdruk waren een half leeg scherm.',
    proef: async function () {
      if (!window.PLRond || typeof PLRond.pasIn !== 'function' || !PLRond.VERWANT)
        return { staat: 'FOUT', detail: 'PLRond.pasIn/VERWANT ontbreken — oude pidlane-rondgang.js (herladen?)' };
      var h = function (p) { return ['0123', '016E', '0104', '0106', '0110'].indexOf(p) > -1; };
      var d = PLRond.indeling('benzine', { heeft: h, vullen: true }).dias.filter(function (x) { return x.id === 'brandstof-druk'; })[0];
      var vul = d ? d.tegels.filter(function (t) { return t.vul; }).map(function (t) { return t.pids[0]; }) : [];
      if (vul.indexOf('0104') < 0) return { staat: 'FOUT', detail: 'brandstofdruk krijgt geen belasting ernaast: ' + JSON.stringify(d) };
      var r = document.getElementById('rondDia');
      if (!r || !r.getClientRects().length) return { staat: 'LET OP', detail: 'verwant klopt (' + vul.join(', ') + '); de rondgang is niet in beeld, dus passen niet gemeten — open Live → Slim' };
      var n = PLRond.pasIn(), nav = document.getElementById('plNav'), b = r.getBoundingClientRect().bottom, t = nav ? nav.getBoundingClientRect().top : window.innerHeight;
      return b <= t ? { staat: 'OK', detail: 'dia past (dichtheid ' + n + '), verwant: ' + vul.join(', ') }
                    : { staat: 'LET OP', detail: 'dia steekt ' + Math.round(b - t) + ' px onder de navigatie uit, ook op dichtheid ' + n };
    }
  },

  // ── Er is iets mis: eerst wat de auto al weet (#534) ──
  {
    issue: '#534',
    naam: 'Volledig onderzoek: snelle scan (freeze frame, bijstuurgeheugen per bank, trimkaart uit de rit) en oorzakenbord voor iedereen',
    waarom: 'Het onderzoek begon met vragen en losse metingen terwijl freeze frame, lange trim en de laatste rit al lagen; een klant zag alleen de stap, niet het bewijs.',
    proef: async function () {
      if (!window.PLOnderzoek || typeof PLOnderzoek.trimKaart !== 'function' || typeof PLOnderzoek.inzichten !== 'function')
        return { staat: 'FOUT', detail: 'PLOnderzoek.trimKaart/inzichten ontbreken — oude pidlane-onderzoek.js (herladen?)' };
      var b = PLOnderzoek.beoordeelSnap({ snap: { '010C': [750, 750, 750], '0105': [90, 90, 90], '0107': [16, 16, 16], '0109': [1, 1, 1] } }, { metingen: {}, ctx: {} });
      if (!b.some(function (x) { return x.h === 'maf' && x.d < 0; })) return { staat: 'FOUT', detail: 'bankverschil sluit de luchtmassameter niet uit: ' + JSON.stringify(b) };
      var bron = typeof pidHist !== 'undefined' && pidHist ? PLOnderzoek.trimKaart(pidHist, 'deze sessie') : null;
      return { staat: 'OK', detail: (bron ? 'trimkaart uit deze sessie: stationair ' + (bron.stationair ? bron.stationair.trim + ' % (' + bron.stationair.n + '×)' : '—') +
        ', 1800–3200 tpm ' + (bron.deel ? bron.deel.trim + ' % (' + bron.deel.n + '×)' : '—') : 'nog geen trimkaart: rij warm stationair én tussen 1800 en 3200 tpm') +
        '. Rij: start Er is iets mis → onderzoek, en kijk of "Wat de auto al wist" klopt met wat je weet van deze auto.' };
    }
  },

  // ── De derde poort: geldt deze regel voor déze auto? (#532) ──
  {
    issue: '#532',
    naam: 'Kenmerken van de auto beslissen of een regel geldt: slim laden, kenveldthermostaat, turbo, LPG, breedband',
    waarom: 'Op 16-10-2026 meldde de app "dynamo" op een gezonde CX-5 die slim laadt; elf plekken oordeelden over laadspanning en elf over koelwater, elk met een eigen vaste grens, en de bevindingen gingen als feit naar de AI.',
    proef: async function () {
      if (!window.PLKenmerk || typeof PLKenmerk.live !== 'function') return { staat: 'FOUT', detail: 'PLKenmerk ontbreekt — pidlane-kenmerk.js niet geladen (herladen?)' };
      var vw = PLKenmerk.koelwater(108, { prof: PLKenmerk.profiel({ merk: 'Volkswagen' }) });
      if (!vw || vw.niveau !== 'onbeslist') return { staat: 'FOUT', detail: '108 °C op een Volkswagen is ' + (vw && vw.niveau) + ', verwacht niet te beoordelen' };
      var p = PLKenmerk.live(), bekend = Object.keys(PLKenmerk.NAAM).filter(function (k) { return p[k] && p[k].waarde !== null; })
        .map(function (k) { return k + ' ' + (p[k].waarde ? 'ja' : 'nee') + ' (' + p[k].zeker + ')'; });
      var u = typeof pidVals !== 'undefined' ? pidVals['0142'] : null, rpm = typeof pidVals !== 'undefined' ? pidVals['010C'] : null;
      var l = (typeof u === 'number' && typeof rpm === 'number') ? PLKenmerk.laadLive(u, rpm) : null;
      var open = PLKenmerk.onbeslist().map(function (o) { return o.naam; });
      return { staat: 'OK', detail: 'deze auto: ' + (bekend.join(', ') || 'nog niets bekend') +
        (l ? '; laadspanning nu ' + l.niveau + ' — ' + l.tekst : '; laadspanning: motor draait niet') +
        (open.length ? '; niet te beoordelen: ' + open.join(', ') : '') +
        '. Rij: kijk in Live → bevindingen of de dynamo-melding weg is, en of "Niet te beoordelen" de juiste vraag stelt.' };
    }
  },

  // ── Codes zoeken in OBDb in plaats van met de AI (#526) ──
  {
    issue: '#526',
    naam: 'Sensoren → Zoek codes in OBDb: gratis, met bron, zonder AI-zoektocht',
    waarom: 'De AI-zoektocht met web_search kostte 50–85 tokens per keer terwijl het venster ±7 zei, en vond voor de i20 niets; OBDb heeft voor de i20 17 bruikbare codes.',
    proef: async function () {
      if (!window.PLEigen || typeof PLEigen.zoekObdb !== 'function') return { staat: 'FOUT', detail: 'PLEigen.zoekObdb ontbreekt — oude pidlane-uitgebreid.js (herladen?)' };
      if (typeof PLEigen.zoekOnline === 'function') return { staat: 'FOUT', detail: 'de AI-zoektocht zoekOnline staat er nog' };
      var f = PLEigen.obdbFormule({ len: 8, mul: 1373, div: 100000, unit: 'bars' });
      if (f !== 'A*1373/100000') return { staat: 'FOUT', detail: 'OBDb-formule voor de Mazda-bandenspanning: ' + f };
      return { staat: 'OK', detail: 'formule klopt; rij: Mijn voertuigen → Sensoren → 🔎 Zoek codes in OBDb, test een paar kandidaten op de auto (bandenspanning, accuspanning) en kijk of de waarde klopt met het dashboard' };
    }
  },

  // ── Grote AI-call: getal overtypen, afboekregel met het serversaldo (#524) ──
  {
    issue: '#524',
    naam: 'AI-call boven 10 tokens: getal overtypen, ook voor de beheerder; afboekregel noemt de analyse en het saldo van de server',
    waarom: 'Op 15-10-2026 kostte één analyse 85 tokens op één tik; het logboek zei saldo 0 terwijl de server 15 had, en het kasboek zei niet welke analyse het was.',
    proef: async function () {
      if (!window.PLCredits || typeof PLCredits.meld !== 'function') return { staat: 'FOUT', detail: 'PLCredits.meld ontbreekt — oude pidlane-credits.js (herladen?)' };
      var d = PLCredits.CFG && PLCredits.CFG.bevestigDrempel;
      if (d !== 10) return { staat: 'FOUT', detail: 'bevestigDrempel is ' + d + ', verwacht 10' };
      if (typeof window.plAnalyseRol !== 'function') return { staat: 'FOUT', detail: 'plAnalyseRol ontbreekt — oude pidlane-fuel.js (herladen?)' };
      var a = PLCredits.ontleed('Je bent expert automonteur.\n' + new Array(4000).join('0105 91 010C 2208\n'), '', 2000);
      if (!(a.credits > d)) return { staat: 'FOUT', detail: 'een prompt van ' + a.totTekens + ' tekens komt maar op ' + a.credits + ' tokens' };
      return { staat: 'OK', detail: 'drempel ' + d + ' tokens; start een grote analyse (bijv. Diagnose met veel sensoren) en kijk of je het getal moet overtypen, daarna in het logboek "Tegoed afgeboekt: -N voor …" met het saldo uit het kasboek' };
    }
  },

  // ── Rondgang: pagina's als verhaal, met een regel "wat dit zegt" (15-10-2026) ──
  {
    issue: 'rondgangduiding',
    naam: 'Rondgang: pedaal → gasklep → belasting op één plaat, inlaat tegen buitendruk, mengsel samen; per pagina wat de waarden zeggen',
    waarom: 'De pagina\'s waren lijsten per soort sensor: een losse balk, abs. belasting op een andere schaal dan belasting, en geen uitleg wat de getallen samen betekenen.',
    proef: async function () {
      if (!window.PLRond || typeof PLRond.duiding !== 'function') return { staat: 'FOUT', detail: 'PLRond.duiding ontbreekt — oude pidlane-rondgang.js (herladen?)' };
      var d = PLRond.duiding('druk', { '010B': 110, '0133': 101 });
      if (!/0,09 bar boven/.test(d || '')) return { staat: 'FOUT', detail: 'duiding druk: ' + d };
      if (PLRond.duiding('laden', { '0142': 12.6, '010C': 1500 }).indexOf('slimme dynamo') < 0) return { staat: 'FOUT', detail: 'een slimme dynamo heet defect' };
      var st = PLRond.staat(), met = st.dias.filter(function (x) { return x.duid && x.duid.length; }).length;
      return { staat: 'OK', detail: met + ' van ' + st.dias.length + " pagina's met een duidingsregel; rij: Live → Slim, lees of de regel onder de titel klopt met wat de auto doet (gas los, optrekken, stationair, koude start)" };
    }
  },

  // ── Rondgang: meer pagina's per categorie (15-10-2026) ──
  {
    issue: 'rondgangpaginas',
    naam: "Rondgang: Motor en rijden in drie pagina's, verwante sensoren samen, een knop als sensoren uit staan",
    waarom: 'Motor en rijden toonde maar drie of vier sensoren terwijl de auto er veel meer heeft; met elke 10 s een andere pagina is er plaats voor alles.',
    proef: async function () {
      if (!window.PLRond || !Array.isArray(PLRond.CATS)) return { staat: 'FOUT', detail: 'PLRond.CATS ontbreekt — oude pidlane-rondgang.js (herladen?)' };
      var ind = PLRond.indeling('benzine', { heeft: function () { return true; } });
      var mot = ind.dias.filter(function (d) { return d.cat === 'motor'; });
      var n = mot.reduce(function (a, d) { return a + d.tegels.length; }, 0);
      if (mot.length < 3 || n < 23) return { staat: 'FOUT', detail: 'Motor en rijden: ' + mot.length + " pagina's, " + n + ' sensoren' };
      var mist = PLRond.nogUit().length;
      return { staat: 'OK', detail: 'rij: Live → Slim, ' + (mist ? mist + ' sensoren staan nog uit — tik onderaan een pagina op de knop en kijk of alle pagina\'s vol en leesbaar zijn' : 'kijk of alle pagina\'s vol en leesbaar zijn') + '; let op of snelheid en toerental vlot blijven met alles aan' };
    }
  },

  // ── Slim als rondgang langs de categorieën (15-10-2026) ──
  {
    issue: 'rondgang',
    naam: 'Slim: elke 10 s een andere categorie, snelheid en toerental vast bovenaan, rood houdt vast',
    waarom: 'Slim toonde één vast dashboard; de vraag was alles in ongeveer een minuut langs te zien, per categorie, met Pauze en een instelbare wisseltijd.',
    proef: async function () {
      if (!window.PLRond || typeof PLRond.indeling !== 'function' || typeof PLRond.remt !== 'function') return { staat: 'FOUT', detail: 'PLRond ontbreekt — oude pidlane-rondgang.js of index.html (herladen?)' };
      if (typeof PLRond.groepen !== 'function' || typeof PLRond.bouw !== 'function') return { staat: 'FOUT', detail: 'PLRond tekent nog losse tegels — oude pidlane-rondgang.js (herladen?)' };
      var ind = PLRond.indeling('benzine', { heeft: function () { return true; } });
      if (ind.kop.length !== 2 || ind.dias.length < 5) return { staat: 'FOUT', detail: 'indeling klopt niet: kop ' + ind.kop.length + ', dia\'s ' + ind.dias.length };
      var st = PLRond.tik({ i: 0, start: 0, pauze: true, alarm: -1 }, 1000, { n: 6, ms: 10000, alarm: 2 });
      if (st.i !== 2) return { staat: 'FOUT', detail: 'een rode waarde haalt zijn dia niet in beeld' };
      if (!document.getElementById('kbRondgang')) return { staat: 'FOUT', detail: 'Mijn voorkeuren mist Rondgang in Slim — oude index.html (herladen?)' };
      return { staat: 'OK', detail: 'rij: Live → Slim, kijk of elke categorie langskomt en leesbaar is (tellerplaat, trims vanuit het midden, sondes); ⏸ houdt vast, ⚙ voor de wisseltijd, vinkjes en Mijn dashboard' };
    }
  },

  // ── tabblad Kenteken in Mijn voertuigen, Admin-menu korter (15-10-2026) ──
  {
    issue: 'kentekentab',
    naam: 'Mijn voertuigen: tabblad Kenteken met de kenteken-check, ook verbonden; vier Admin-regels weg',
    waarom: 'De kenteken-check (APK, terugroepacties, milieuklasse, kosten) stond alleen op de kaart "Niet in de auto?", en die verdwijnt zodra de adapter verbonden is.',
    proef: async function () {
      if (!window.PLZonder || typeof PLZonder.checkHtml !== 'function' || typeof PLZonder.recallHtml !== 'function') return { staat: 'FOUT', detail: 'PLZonder.checkHtml/recallHtml ontbreekt — oude pidlane-zonder.js (herladen?)' };
      var h = PLZonder.checkHtml({ rij: { merk: 'MAZDA', handelsbenaming: 'CX-5' }, bs: [], overzicht: { naam: 'Mazda CX-5', regels: [{ ico: '📅', label: 'APK', waarde: 'geldig' }] } }, 'b5Recall');
      if (!/plz-regel/.test(h) || !/id="b5Recall"/.test(h)) return { staat: 'FOUT', detail: 'checkHtml geeft geen RDW-regels of geen plek voor de terugroepacties' };
      if (PLZonder.recallHtml({ acties: [{ open: false }] }) !== '' || !/Nepactie/.test(PLZonder.recallHtml({ acties: [{ open: true, omschrijving: 'Nepactie' }] }))) return { staat: 'FOUT', detail: 'recallHtml toont een gesloten actie of mist een open actie' };
      var weg = ['frisBtn', 'kbMode06', 'plSppMenu', 'plSnelMenu'].filter(function (id) { return document.getElementById(id); });
      if (weg.length) return { staat: 'FOUT', detail: 'nog in het Admin-menu: ' + weg.join(', ') + ' — oude index.html (herladen?)' };
      return { staat: 'OK', detail: 'rij: Meer → Mijn voertuigen → voertuig met kenteken → Kenteken, verbonden' };
    }
  },

  // ── foutcodes met tekst, UDS en mode 06 in Rapporten (15-10-2026) ──
  {
    issue: 'dtctekst',
    naam: 'Foutcodes: P0421/P2096/C0035 hebben een tekst, een onbekende code zegt zijn opbouw, UDS en mode 06 gaan naar Rapporten',
    waarom: 'Op de Mazda stonden P0421, P2096, P0524 en P2119 als "Onbekende code", en de UDS- en mode 06-uitlezing verdwenen met hun venster.',
    proef: async function () {
      if (typeof dtcInfo !== 'function' || typeof DTC_OMSCHRIJVING === 'undefined') return { staat: 'FOUT', detail: 'DTC_OMSCHRIJVING ontbreekt — oude pidlane-data.js (herladen?)' };
      var mis = ['P0421', 'P2096', 'P0524', 'P2119', 'C0035', 'U0121'].filter(function (c) { return /^Onbekende code/.test(dtcInfo(c).desc); });
      if (mis.length) return { staat: 'FOUT', detail: 'nog zonder tekst: ' + mis.join(', ') };
      if (!/fabrikantspecifiek/.test(dtcInfo('P117A').desc)) return { staat: 'FOUT', detail: 'P117A zegt niets over zijn opbouw: ' + dtcInfo('P117A').desc };
      if (!window.PLUds || typeof PLUds.bewaarInSessie !== 'function' || !window.PLM06 || typeof PLM06.bewaarInSessie !== 'function') return { staat: 'FOUT', detail: 'bewaarInSessie ontbreekt — oude pidlane-uds.js of pidlane-mode06.js (herladen?)' };
      return { staat: 'OK', detail: 'teksten kloppen · rij: 🧩 Alle stuurapparaten, en kijk of die in Rapporten verschijnt (de Admin-knop Mode 06 is sinds 15-10 weg)' };
    }
  },

  // ── mode 06 naar J1979: MID-namen, teken uit de grenzen, VVT ≠ EGR (#515) ──
  {
    issue: '#515',
    naam: 'Mode 06: MIDs volgens J1979, het teken uit de grenzen, en een VVT-test weegt niet als EGR',
    waarom: 'Een Mazda CX-5 toonde "EGR-systeem bank 5" met grenzen 32768 – 1500; dat was de kleptiming, met signed grenzen.',
    proef: async function () {
      if (!window.PLM06 || !PLM06.familieVan || !PLM06._intern) return { staat: 'FOUT', detail: 'PLM06.familieVan ontbreekt — oude pidlane-mode06.js (herladen?)' };
      var t = PLM06._intern.bouwRecord(0x35, 0x80, 0xB0, 14, 0x8000, 0x05DC);
      if (!/kleptiming/.test(t.midNaam)) return { staat: 'FOUT', detail: 'MID 0x35 heet ' + t.midNaam };
      if (!t.oordeelZeker || t.getoond.min !== -32768) return { staat: 'FOUT', detail: 'grenzen niet signed gelezen: ' + JSON.stringify(t.getoond) };
      var st = PLOnderzoek.nieuw({ klachten: ['onrustig'] });
      var r = PLOnderzoek.beoordeelMode06({ m06: { tests: [PLM06._intern.bouwRecord(0x35, 0x80, 0x01, 900, 0, 750)] } }, st);
      if (r.some(function (b) { return b.h === 'egr'; })) return { staat: 'FOUT', detail: 'een VVT-test weegt als EGR: ' + JSON.stringify(r) };
      return { staat: 'OK', detail: 'namen en teken kloppen · rij: Admin → 🔬 Mode 06 en kijk of er nog "onzeker" of een rare grens staat; noteer de UAS uit het logboek' };
    }
  },

  // ── UDS 0x19: foutcodes van alle stuurapparaten (15-10-2026) ──
  {
    issue: 'uds19',
    naam: 'UDS 0x19: foutcodes van ABS, airbag en de rest, en de adapter staat daarna weer op 7DF',
    waarom: 'Mode 03 hoort alleen motor en bak; een groen stoplicht zei niets over het ABS-lampje.',
    proef: async function () {
      if (!window.PLUds || typeof PLUds.scan !== 'function') return { staat: 'FOUT', detail: 'PLUds ontbreekt — pidlane-uds.js niet geladen (herladen?)' };
      var log = [], hdr = '7DF';
      var stuur = async function (c) {
        log.push(c);
        if (c === 'ATDPN') return 'A6';
        if (/^ATSH/.test(c)) { hdr = c.slice(4); return 'OK'; }
        if (/^AT/.test(c)) return 'OK';
        return hdr === '760' ? '59 02 FF 40 35 11 09' : 'NO DATA';
      };
      var res = await PLUds.scan(stuur);
      var abs = res.modules.filter(function (m) { return m.hdr === '760'; })[0];
      if (!abs || !abs.codes || !abs.codes.length || abs.codes[0].code !== 'C0035') return { staat: 'FOUT', detail: 'C0035 op 760 niet gelezen: ' + JSON.stringify(abs) };
      if (log.slice(-2).join() !== 'ATSH7DF,ATCRA') return { staat: 'FOUT', detail: 'adapter niet teruggezet: ' + log.slice(-3).join(' ') };
      return { staat: 'OK', detail: 'nep-bus klopt · rij: Check mijn auto → Uitlezen → 🧩 Alle stuurapparaten; noteer welke adressen antwoorden (adressen zijn per merk anders)' };
    }
  },

  // ── mode 06: tabel in het onderzoek, los paneel in Admin (15-10-2026) ──
  {
    issue: 'mode06',
    naam: 'Mode 06: alle zelftests in het onderzoeksrapport, en een Admin-knop die ze direct leest',
    waarom: 'PLM06.render() bestond maar werd nergens aangeroepen: de app gebruikte mode 06 alleen als bewijs, de tests zelf zag niemand.',
    proef: async function () {
      if (!window.PLM06 || typeof PLM06.alsTekst !== 'function' || typeof PLM06.open !== 'function') return { staat: 'FOUT', detail: 'PLM06.alsTekst/open ontbreekt — oude pidlane-mode06.js (herladen?)' };
      if (!window.PLOnderzoek || typeof PLOnderzoek.beoordeelMode06 !== 'function') return { staat: 'FOUT', detail: 'PLOnderzoek.beoordeelMode06 ontbreekt' };
      var R = PLM06._intern.bouwRecord;
      var st = PLOnderzoek.nieuw({ klachten: ['onrustig'] });
      PLOnderzoek.beoordeelMode06({ m06: { tests: [R(0x21, 0x01, 0x01, 300, 0, 750), R(0x21, 0x02, 0x01, 800, 0, 750)] } }, st);
      var t = PLOnderzoek.alsTekst(st), i = t.indexOf('=== MONITORTESTS (MODE 06) ===');
      if (i < 0) return { staat: 'FOUT', detail: 'het bewaarde onderzoek heeft geen blok MONITORTESTS' };
      if (!/\[GEZAKT\][^\n]*0x02/.test(t.slice(i).split('\n')[2] || '')) return { staat: 'FOUT', detail: 'gezakt staat niet bovenaan: ' + t.slice(i, i + 300) };
      return { staat: 'OK', detail: 'rapport en tabel kloppen · rij: Admin → 🔬 Mode 06 en kijk of de tabel komt; een onderzoek met "onrustig" toont onder de conclusie "Alle zelftests (mode 06)"' };
    }
  },

  // ── indeling Live: tabbalk weg, Grafiek in de weergaverij, vegen in Visueel (15-10-2026) ──
  {
    issue: 'indeling',
    naam: 'Live: Sensoren linksboven, Grafiek als vierde weergave, vegen in Visueel, twee lopende taken, herinnering niet exact',
    waarom: 'Uit het gebruik: Live stond dubbel (tabbalk en onderbalk), de strook met Volgende kostte ruimte, en bij elke start opende Android "Alarmen en herinneringen" met een grijze schakelaar.',
    proef: async function () {
      if (document.querySelector('.tabs')) return { staat: 'FOUT', detail: 'de oude tabbalk .tabs staat er nog — oude index.html (herladen?)' };
      var rij = document.getElementById('pidViewSwitch'), gb = document.getElementById('tabGraph'), sb = document.getElementById('tbSensoren');
      if (!rij || !gb || gb.parentElement !== rij) return { staat: 'FOUT', detail: 'Grafiek (#tabGraph) staat niet in de weergaverij #pidViewSwitch' };
      if (!sb || !sb.closest('.topbar')) return { staat: 'FOUT', detail: 'Sensoren (#tbSensoren) staat niet in de topbalk' };
      if (document.getElementById('plLiveDeel') || document.getElementById('plLiveMee')) return { staat: 'FOUT', detail: 'Deel live / Meekijken staan nog onder de meters' };
      if (!window.PLVisueel || typeof PLVisueel.veegRichting !== 'function') return { staat: 'FOUT', detail: 'PLVisueel.veegRichting ontbreekt — oude pidlane-visueel.js (herladen?)' };
      if (PLVisueel.veegRichting(-80, 10) !== 1 || PLVisueel.veegRichting(-80, 70) !== 0) return { staat: 'FOUT', detail: 'vegen: links = ' + PLVisueel.veegRichting(-80, 10) + ', schuin = ' + PLVisueel.veegRichting(-80, 70) };
      if (document.querySelector('.vis-profiel, .vis-voet')) return { staat: 'FOUT', detail: 'de keuzestrook of "Overige sensoren staan in Slim" staat nog in Visueel' };
      var tpr = document.querySelector('.topbar .tpr');
      if (tpr && sb.getBoundingClientRect().width && sb.getBoundingClientRect().left > tpr.getBoundingClientRect().left) return { staat: 'FOUT', detail: 'Sensoren staat rechts van de statuschip; hoort links' };
      var m = PLVisueel.meldingen({ monitor: { aan: false }, bulk: { aan: true }, waak: { aan: true }, caravan: { aan: false }, rit: { aan: false } }, [], false);
      if (!m.snel.some(function (x) { return x.id === 'monitor'; })) return { staat: 'FOUT', detail: 'met recorder en waakronde aan is de rit-monitor niet te starten' };
      if ((document.getElementById('bscan') || {}).getAttribute && !/PLFoutcodes/.test(document.getElementById('bscan').getAttribute('onclick') || '')) return { staat: 'FOUT', detail: 'de knop in het foutcode-tabblad leest nog alleen mode 03' };
      return { staat: 'OK', detail: 'tabbalk weg, Grafiek in de rij, Sensoren rechtsboven · veeg in Visueel naar links/rechts en kijk of de naam kort in beeld komt · start met recorder en waakronde aan de rit-monitor · tik in Sensoren op Eigen: Mijn voertuigen hoort vóór de lade te openen · Android: de vraag "Alarmen en herinneringen" hoort na het starten niet meer te komen' };
    }
  },

  // ── contact uit: maten over de stilte zelf (#487, 14-10-2026) ──
  {
    issue: '#487',
    naam: 'Contact uit: de meetopdracht telt alleen wat er in de stilte gebeurde',
    waarom: 'De rit van 14-10 kreeg BEVINDING op 27 weigeringen en 2 ATST-stappen van de hele verbinding, terwijl beide stiltes schoon verliepen.',
    proef: async function () {
      if (!window.PLContact || typeof PLContact.maat !== 'function') return { staat: 'FOUT', detail: 'PLContact.maat ontbreekt — oude pidlane-contact.js (herladen?)' };
      var K = PLContact._kern, t = 0, w = 27, s = { groep: 3, batchAan: true, mult: 1, st: '1C' };
      var c = K.maak({ nu: function () { return t; }, kortOk: function () { return true; }, stand: function () { return Object.assign({}, s); },
        laatst: function () { return { rpm: 664, kmh: 0 }; }, terug: function () {}, meld: function () {}, weer: function () {}, weigeringen: function () { return w; } });
      for (var i = 0; i < 8; i++) { c.noteAntwoord('010C1', 'NO DATA'); t += 230; }
      w += 3;
      c.noteAntwoord('010C1', '410C0A62');
      if (c.maat('contact-weigeringen') !== 3) return { staat: 'FOUT', detail: 'contact-weigeringen = ' + c.maat('contact-weigeringen') + ', verwacht 3 (de 27 van vóór de stilte tellen mee?)' };
      if (c.maat('contact-terug-anders') !== 0) return { staat: 'FOUT', detail: 'contact-terug-anders = ' + c.maat('contact-terug-anders') + ' bij een gelijke stand' };
      return { staat: 'OK', detail: 'nagebouwde stilte: 3 weigeringen erin geteld, 27 ervoor niet · deze sessie: ' + PLContact.maat('contact-stiltes') + ' stilte(s), anders terug ' +
        PLContact.maat('contact-terug-anders') + ', weigeringen erin ' + PLContact.maat('contact-weigeringen') };
    }
  },

  // ── rijmodus: het advies van de monitor in beeld (14-10-2026) ──
  {
    issue: 'rijmodus',
    naam: 'Rijmodus: advies van de Rit- en Caravan-monitor in een half scherm',
    waarom: 'In split-screen loopt de meetlus door (#228), maar de volle app is in een half venster niet te lezen; vier grote getallen namen een derde van het scherm.',
    proef: async function () {
      if (!window.PLRijmodus || typeof PLRijmodus.paneel !== 'function') return { staat: 'FOUT', detail: 'PLRijmodus ontbreekt — oude pidlane-rijmodus.js (herladen?)' };
      if (PLRijmodus.besluit({ stand: null }).modus !== 'normaal') return { staat: 'FOUT', detail: 'zonder keuze staat de rijmodus aan — hij hoort standaard uit' };
      if (PLRijmodus.klasse('0105', 300) !== 'meetfout') return { staat: 'FOUT', detail: 'koelwater buiten de harde limiet kleurt niet als meetfout' };
      if (typeof caravanSchakelAdvies !== 'function') return { staat: 'FOUT', detail: 'caravanSchakelAdvies ontbreekt — oude pidlane-caravan.js (herladen?)' };
      var nu = PLRijmodus.nu();
      return { staat: 'OK', detail: 'stand ' + PLRijmodus.stand() + ' · modus ' + nu.modus + ' · vorm ' + nu.vorm + ' (' + window.innerWidth + 'x' + window.innerHeight + ') · scherm-aan ' + (nu.wake || 'nee') + ' · zet hem aan in Mijn voorkeuren, start de Caravan- of Rit-monitor en zet de app naast Maps' };
    }
  },

  // ── onderzoek: brandstofdruk en breedbandsonde (#428, 14-10-2026) ──
  {
    issue: '#428',
    naam: 'Onderzoek: brandstofdruk bij 2500 tpm en de breedbandsonde als stap',
    waarom: 'Brandstofdruk was alleen een verdenking uit de trims; een motor met alleen een breedbandsonde voor de katalysator kreeg geen sondeproef.',
    proef: async function () {
      if (!window.PLOnderzoek || !PLOnderzoek.STAPPEN) return { staat: 'FOUT', detail: 'PLOnderzoek ontbreekt — oude pidlane-onderzoek.js (herladen?)' };
      var S = function (id) { return PLOnderzoek.STAPPEN.filter(function (x) { return x.id === id; })[0]; };
      var rd = S('raildruk'), bb = S('breedband');
      if (!rd || !bb) return { staat: 'FOUT', detail: 'stap raildruk of breedband ontbreekt' };
      var rpm = [], d = [], l = [];
      for (var i = 0; i < 20; i++) { rpm.push(i < 10 ? 750 : 2500); d.push(i < 10 ? 5000 : 3500); l.push(1); }
      var r1 = rd.beoordeel({ reeks: { '0123': d, '010C': rpm } });
      if (!r1.some(function (x) { return x.h === 'brandstofdruk' && x.d > 0; })) return { staat: 'FOUT', detail: 'wegzakkende raildruk niet gezien: ' + JSON.stringify(r1) };
      var r2 = bb.beoordeel({ reeks: { '0124': l, '010C': rpm } }, PLOnderzoek.nieuw({ klachten: ['lampje'] }));
      if (!r2.some(function (x) { return x.h === 'lambda' && x.d > 0; })) return { staat: 'FOUT', detail: 'stilstaande breedbandsonde niet gezien: ' + JSON.stringify(r2) };
      var heeft = function (p) { try { return typeof supportedPIDs !== 'undefined' && supportedPIDs && supportedPIDs.has(p); } catch (e) { console.warn('blok 5 #428: supportedPIDs', e); return false; } };
      var ja = ['0123', '0159', '010A', '0124', '0134'].filter(heeft);
      return { staat: 'OK', detail: (ja.length ? 'deze auto levert ' + ja.join(', ') : 'deze auto levert geen raildruk of breedbandsonde (of niet verbonden)') + ' · Er is iets mis → Volledig onderzoek' };
    }
  },

  // ── vervangen onderdeel uit het onderhoudslogboek (#426, 14-10-2026) ──
  {
    issue: '#426',
    naam: 'Software als oorzaak: het onderhoudslogboek zegt wat er onlangs vervangen is',
    waarom: 'De zwakke software-oorzaken (gasklep, injector, adaptaties, EGR, accu) verschenen nooit: geen enkele analyse wist wat er aan de auto gedaan was.',
    proef: async function () {
      if (!window.PLConditie || typeof PLConditie.recentVervangen !== 'function') return { staat: 'FOUT', detail: 'PLConditie.recentVervangen ontbreekt — oude pidlane-conditie.js (herladen?)' };
      if (typeof plVervangenRecent !== 'function') return { staat: 'FOUT', detail: 'plVervangenRecent ontbreekt — oude pidlane-data.js (herladen?)' };
      var dag = function (n) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); };
      var v = { brandstof: 'benzine', onderhoud_log: [{ datum: dag(5), wat: [], werk: ['lambdasonde'] }, { datum: dag(400), wat: [], werk: ['gasklep'] }] };
      var rv = PLConditie.recentVervangen(v, Date.now());
      if (rv.join() !== 'lambdasonde') return { staat: 'FOUT', detail: 'recentVervangen geeft ' + JSON.stringify(rv) + ', verwacht alleen de lambdasonde van 5 dagen terug' };
      var sw = softwareOorzaken({ merk: 'Mazda', brandstof: 'benzine', dtc: ['P0171'], vervangen: rv });
      if (!sw.some(function (x) { return x.sterkte === 'zwak'; })) return { staat: 'FOUT', detail: 'een recente lambdasonde plus P0171 geeft geen zwakke software-oorzaak' };
      var act = window.PLGarage && typeof PLGarage.actief === 'function' ? PLGarage.actief() : null;
      return { staat: 'OK', detail: act ? 'actief voertuig: ' + (plVervangenRecent().join(', ') || 'niets vervangen in de laatste 90 dagen') : 'geen actief voertuig in Mijn voertuigen — met een klantaccount: Conditie → Beurt toevoegen → Ander werk' };
    }
  },

  // ── kostenindicatie en controleplan per foutcode (#503, 14-10-2026) ──
  {
    issue: '#503',
    naam: 'Foutcodes: per code een kostenindicatie en een controleplan',
    waarom: 'Bij een foutcode stond alleen wat hij betekent; wat het ongeveer kost en wat je eerst controleert moest de klant zelf uitzoeken.',
    proef: async function () {
      if (typeof dtcPlan !== 'function' || !window.DTC_PLAN) return { staat: 'FOUT', detail: 'dtcPlan ontbreekt — oude pidlane-data.js (herladen?)' };
      if (!window.PLFoutcodes || typeof PLFoutcodes.planHtml !== 'function') return { staat: 'FOUT', detail: 'PLFoutcodes.planHtml ontbreekt — oude pidlane-foutcodes.js (herladen?)' };
      var i = dtcInfo('P0171');
      if (!i || !i.plan || i.plan.familie !== 'P017') return { staat: 'FOUT', detail: 'dtcInfo(P0171) geeft geen mengselplan: ' + JSON.stringify(i && i.plan) };
      if (dtcInfo('P1260').plan !== null) return { staat: 'FOUT', detail: 'merkcode P1260 krijgt toch een generiek plan' };
      var h = PLFoutcodes.planHtml(i.plan);
      if (h.indexOf('fc-plan') < 0 || h.indexOf('<ol>') < 0) return { staat: 'FOUT', detail: 'planHtml tekent geen plan' };
      return { staat: 'OK', detail: Object.keys(DTC_PLAN).length + ' families · open Check mijn auto in de demo: onder elke code staat 💶 met bedrag en stappen' };
    }
  },

  // ── samenvatting per tankcyclus (#469 stap 3, 13-10-2026) ──
  {
    issue: '#469',
    naam: 'Tankbeurten: per cyclus de ritten samengevat, en de app-liters tegenover getankt',
    waarom: 'Per tankcyclus waren alleen de km en het beloofde bereik te zien; hoe lang, hoe snel en hoeveel de app zelf mat, moest je uit de ritten-export halen.',
    proef: async function () {
      if (!window.PLTank || typeof PLTank.ritSom !== 'function') return { staat: 'FOUT', detail: 'PLTank.ritSom ontbreekt — oude pidlane-tank.js (herladen?)' };
      var r = function (start, km, d, l) { return { start: start, km: km, duur_s: d, liters: l }; };
      var tk = [{ id: 'a', op: '2026-10-01T12:00:00Z', vol: true, liters: 40 }, { id: 'b', op: '2026-10-08T12:00:00Z', vol: true, liters: 50 }];
      var rs = [r('2026-10-02T08:00:00Z', 300, 10800, 21), r('2026-10-05T08:00:00Z', 200, 7200, 24)];
      var c = PLTank.cycli(tk, rs)[0];
      if (!c || !c.rit || c.rit.kmh !== 100 || c.appVsGetanktPct !== 90) return { staat: 'FOUT', detail: 'nagebouwde cyclus geeft ' + JSON.stringify(c && { rit: c.rit, pct: c.appVsGetanktPct }) };
      tk[1].vol = false;
      if (PLTank.cycli(tk, rs)[0].appVsGetanktPct !== null) return { staat: 'FOUT', detail: 'een halve tankbeurt wordt toch tegen de app-liters gelegd' };
      return { staat: 'OK', detail: 'nagebouwde cyclus klopt · open Mijn voertuigen → Tankbeurten: onder elke beurt ritten, rijtijd en verbruik volgens de app' };
    }
  },

  // ── mode 06 in het onderzoek (#428, 13-10-2026) ──
  {
    issue: '#428',
    naam: 'Onderzoek: mode 06 telt missers per cilinder en weegt de zelftests',
    waarom: 'Een cilinder die overslaat zonder foutcode, of een katalysator krap binnen de grens, zag het onderzoek niet: het las alleen foutcodes en live waarden.',
    proef: async function () {
      if (!window.PLOnderzoek || typeof PLOnderzoek.beoordeelMode06 !== 'function') return { staat: 'FOUT', detail: 'PLOnderzoek.beoordeelMode06 ontbreekt — oude pidlane-onderzoek.js (herladen?)' };
      if (!window.PLM06 || !PLM06._intern) return { staat: 'FOUT', detail: 'PLM06 ontbreekt — pidlane-mode06.js niet geladen' };
      var R = PLM06._intern.bouwRecord, mis = function (per) { return per.map(function (n, i) { return R(0xA2 + i, 0x0B, 0x24, n, 0, 0xFFFF); }); };
      var oordeel = function (t) { var st = PLOnderzoek.nieuw({ klachten: ['onrustig'] }); var r = PLOnderzoek.beoordeelMode06({ m06: { tests: t } }, st); return { r: r, st: st }; };
      var een = oordeel(mis([2, 1, 40, 0]));
      if (een.st.metingen.mode06.cilinder !== 3) return { staat: 'FOUT', detail: 'cilinder 3 met 40 missers wordt niet aangewezen: ' + JSON.stringify(een.r) };
      if (oordeel(mis([9, 11, 10, 12])).st.metingen.mode06.cilinder) return { staat: 'FOUT', detail: 'missers verdeeld over alle cilinders heten één cilinder' };
      if (oordeel(mis([0, 0, 0, 0])).r.some(function (b) { return b.h === 'misfire' && b.d > 0; })) return { staat: 'FOUT', detail: 'nul missers telt als bewijs vóór overslaan' };
      var verb = (typeof connected !== 'undefined' && connected);
      return { staat: 'OK', detail: 'oordeel klopt op drie nagebouwde uitlezingen · ' + (verb ? 'start een onderzoek met "onrustig": de stap "Zelftests per cilinder" komt vroeg, en het logboek toont "Mode 06 klaar"' : 'niet verbonden — de echte uitlezing toetst een rit') };
    }
  },

  // ── het oude meetscherm weg (#452, 13-10-2026) ──
  // Broncode, met reden: de gedragsproef (bproef-verzamel.js, stap 10) opent
  // het verzamelscherm over de app heen. Dit ziet alleen of de geladen versie
  // de nieuwe is; daarna zegt de rit zelf het.
  {
    issue: '#452',
    naam: 'Systeemtest en Welk onderdeel meten in het verzamelscherm; het oude meetscherm is weg',
    waarom: 'Twee meetschermen naast elkaar: de wizard gaf Systeemtest en Welk onderdeel nog "Sensoren registreren" en "Gebruik de meting van zojuist", de rest het verzamelscherm.',
    proef: async function () {
      if (!window.PLVerzamel || typeof PLVerzamel.meet !== 'function') return { staat: 'FOUT', detail: 'PLVerzamel ontbreekt (herladen?)' };
      if (typeof window.plVraagMeting === 'function' || typeof window.plMeetPoortVraag === 'function')
        return { staat: 'FOUT', detail: 'het oude meetscherm staat er nog — oude pidlane-fuel.js (herladen?)' };
      if (!window.PLWizard || String(PLWizard.draai).indexOf('PLVerzamel.meet') < 0)
        return { staat: 'FOUT', detail: 'de wizard opent het verzamelscherm niet — oude pidlane-wizard.js (herladen?)' };
      return { staat: 'OK', detail: 'nieuwe versie geladen · start de Systeemtest uit het plan: "📡 Data verzamelen" met "Verder", geen AI-knop' };
    }
  },

  // ── een foto van het dashboard laten herkennen (#492, 14-10-2026) ──
  {
    issue: '#492',
    naam: 'Lampjesgids: een foto van het dashboard, de AI wijst het lampje aan, de gids zegt wat je doet',
    waarom: 'Wie niet weet hoe het lampje heet, kon alleen zoeken op een omschrijving van de vorm.',
    proef: async function () {
      if (!window.PLLampjes || !PLLampjes._kern || typeof PLLampjes._kern.leesFoto !== 'function') return { staat: 'FOUT', detail: 'PLLampjes.leesFoto ontbreekt — oude pidlane-lampjes.js (herladen?)' };
      var r = PLLampjes._kern.leesFoto('<lampjes>{"ids":["olie","verzonnen"],"zeker":"hoog"}</lampjes>', PLLampjes._kern.LAMPJES);
      if (r.ids.join() !== 'olie') return { staat: 'FOUT', detail: 'een verzonnen id komt door: ' + r.ids.join() };
      var ak = null; try { ak = localStorage.getItem('pl_lampfoto_akkoord'); } catch (e) { ak = null; }
      return { staat: 'OK', detail: 'lezen goed · toestemming voor foto\'s ' + (ak === '1' ? 'gegeven' : 'nog niet gevraagd') };
    }
  },

  // ── het onderhoudsschema van dit model (#490, 14-10-2026) ──
  {
    issue: '#490',
    naam: 'Onderhoudsschema per model: de AI op een tik, gelabeld, lokaal bewaard, olie-interval over te nemen',
    waarom: 'Wanneer de distributieriem moet, wist de app niet; de intervallen in de conditiescore zijn algemene standaarden.',
    proef: async function () {
      if (!window.PLSchema || !PLSchema._kern) return { staat: 'FOUT', detail: 'PLSchema ontbreekt — pidlane-schema.js niet geladen (herladen?)' };
      var K = PLSchema._kern, r = K.lees('<schema>[{"id":"olie","km":15000,"mnd":12},{"id":"turbo","km":5}]</schema>');
      if (r.items.length !== 1 || r.items[0].id !== 'olie') return { staat: 'FOUT', detail: 'het AI-antwoord wordt niet goed gelezen: ' + JSON.stringify(r.items) };
      if (!window.PLGarage || typeof PLGarage.zetInterval !== 'function') return { staat: 'FOUT', detail: 'PLGarage.zetInterval ontbreekt — overnemen kan niet (herladen?)' };
      var n = 0; try { for (var i = 0; i < localStorage.length; i++) if (/^pl_schema_/.test(localStorage.key(i))) n++; } catch (e) { n = -1; }
      return { staat: 'OK', detail: 'lezen goed · ' + (n < 0 ? 'opslag onleesbaar' : n + ' schema(\'s) bewaard op dit toestel') };
    }
  },

  // ── bekende kwalen per motor en bouwjaar (#491, 14-10-2026) ──
  {
    issue: '#491',
    naam: 'Bekende kwalen: alleen wat bij deze motor en dit bouwjaar past, anders "bij sommige motoren"',
    waarom: 'AUTO_KENNIS gaf per merk alle zwakke punten van die brandstof, ook van motoren en bouwjaren die de auto niet heeft.',
    proef: async function () {
      if (typeof autoKennisVoorMerk !== 'function') return { staat: 'FOUT', detail: 'autoKennisVoorMerk ontbreekt' };
      var oud = autoKennisVoorMerk('Volkswagen', 'benzine', { cc: 1390, jaar: 2011 }), nieuw = autoKennisVoorMerk('Volkswagen', 'benzine', { cc: 1395, jaar: 2016 });
      var ea = function (r) { return !!r && r.zwak.some(function (t) { return /EA111/.test(t); }); };
      if (!ea(oud)) return { staat: 'FOUT', detail: 'een 1.4 TSI van 2011 krijgt de EA111-kettingspanner niet — oude pidlane-motortype.js of pidlane-data.js (herladen?)' };
      if (ea(nieuw)) return { staat: 'FOUT', detail: 'een 1.4 TSI van 2016 krijgt de EA111-kettingspanner toch' };
      var v = (typeof getVehicle === 'function') ? getVehicle() : null;
      if (!v || !v.merk) return { staat: 'OK', detail: 'filter goed · geen voertuig herkend' };
      var k = autoKennisVoorMerk(v.merk, v.brandstof, { jaar: v.year });
      return { staat: 'OK', detail: 'filter goed · ' + v.merk + ' ' + (v.year || '') + ': ' + (k ? k.zwak.length + ' bekende punten' : 'merk niet in de kennisbank') };
    }
  },

  // ── de lampjesgids tekent echte dashboardsymbolen (#495, 14-10-2026) ──
  {
    issue: '#495',
    naam: 'Lampjesgids: elk lampje een getekend pictogram zoals in het dashboard, plus handrem en servicebeurt',
    waarom: 'De gids toonde emoji\'s (een vat voor de oliedruk, een stoel voor de airbag) die niet op het dashboard lijken, terwijl je een brandend lampje juist op vorm zoekt.',
    proef: async function () {
      if (!window.PLLampjes || !PLLampjes._kern || !PLLampjes._kern.PICTO) return { staat: 'FOUT', detail: 'PLLampjes.PICTO ontbreekt — oude pidlane-lampjes.js (herladen?)' };
      var K = PLLampjes._kern, zonder = K.LAMPJES.filter(function (l) { return !K.PICTO[l.id]; }).map(function (l) { return l.id; });
      if (zonder.length) return { staat: 'FOUT', detail: 'zonder pictogram: ' + zonder.join(', ') };
      if (!K.LAMPJES.some(function (l) { return l.id === 'handrem'; })) return { staat: 'FOUT', detail: 'de handrem ontbreekt' };
      return { staat: 'OK', detail: K.LAMPJES.length + ' lampjes, elk met een getekend pictogram' };
    }
  },

  // ── een nieuwe terugroepactie wordt gemeld (#493, 14-10-2026) ──
  {
    issue: '#493',
    naam: 'Terugroepacties: één keer per dag bij openen, nieuwe acties als melding, de eerste keer stil',
    waarom: 'De app zag een terugroepactie alleen als je zelf een kenteken-check deed; met herinneringen aan meldt hij nu een nieuwe actie voor je eigen voertuigen.',
    proef: async function () {
      if (!window.PLHerinner || !PLHerinner._kern || typeof PLHerinner._kern.recallNieuw !== 'function') return { staat: 'FOUT', detail: 'PLHerinner.recallNieuw ontbreekt — oude pidlane-herinner.js (herladen?)' };
      var K = PLHerinner._kern, A = { referentiecode: 'X1', open: true };
      if (K.recallNieuw({}, 'K', { merk: 'M', acties: [A] }).nieuw.length) return { staat: 'FOUT', detail: 'de eerste ronde meldt een actie die er al stond' };
      if (K.recallNieuw({ K: [] }, 'K', { merk: 'M', acties: [A] }).nieuw.length !== 1) return { staat: 'FOUT', detail: 'een nieuwe open actie wordt niet gemeld' };
      if (K.recallNieuw({}, 'K', { merk: null, acties: [] }).telt) return { staat: 'FOUT', detail: 'een mislukte opzoeking telt mee' };
      if (!PLHerinner.aan()) return { staat: 'LET OP', detail: 'regels goed · herinneringen staan uit, dus geen terugroepronde' };
      var g = {}, d = ''; try { g = JSON.parse(localStorage.getItem('pl_recall_gezien') || '{}'); d = JSON.parse(localStorage.getItem('pl_recall_dag') || '""'); } catch (e) { g = {}; }
      return { staat: 'OK', detail: 'aan · ' + Object.keys(g).length + ' kenteken(s) bekend · laatste volledige ronde ' + (d || 'nog niet') };
    }
  },

  // ── de conditiescore (#475, 13-10-2026) ──
  {
    issue: '#475',
    naam: 'Conditiescore: per voertuig aan of uit, de auto tegen zichzelf, en de ritten meten altijd mee',
    waarom: 'Uitgesteld onderhoud moest zichtbaar worden als een score die langzaam zakt, zonder een lijst die de klant moet bijhouden: één beurt invullen, de rest komt uit de ritten.',
    proef: async function () {
      if (!window.PLConditie || typeof PLConditie.beoordeel !== 'function') return { staat: 'FOUT', detail: 'PLConditie ontbreekt — oude pidlane-conditie.js of niet in index.html (herladen?)' };
      if (!window.PLGarage || typeof PLGarage.mode06 !== 'function') return { staat: 'FOUT', detail: 'PLGarage.mode06 ontbreekt — oude pidlane-garage.js (herladen?)' };
      var d = 864e5, nu = Date.now();
      var r = function (i, tw) { return { start: new Date(nu - (30 - i) * d).toISOString(), km: 20, duur_s: 1500, gem_kmh: 50, verbruik_l100: 6, extra: { cd: { tw: tw, sr: 20, lv: 14.2 } } }; };
      var rs = []; for (var i = 0; i < 10; i++) rs.push(r(i, i < 5 ? 1 : 8));
      var v = { onderhoud_log: [{ datum: new Date(nu - 60 * d).toISOString().slice(0, 10), km: 1000, wat: ['olie'] }] };
      var m = PLConditie.beoordeel(v, rs, { nu: nu });
      if (!(m.deel.brandstof < 90)) return { staat: 'FOUT', detail: 'een trim van +1 naar +8 % kost geen punten (brandstof ' + m.deel.brandstof + ')' };
      if (PLConditie.beoordeel(v, rs.slice(0, 8), { nu: nu }).conditie.klaar) return { staat: 'FOUT', detail: 'acht ritten geven al een rijmeting' };
      var g = PLGarage.actief ? PLGarage.actief() : null;
      var rit = PLGarage.staat ? PLGarage.staat().rit : null;
      var meet = rit ? ' · lopende rit verzamelt: ' + (rit.cd ? Object.keys(PLConditie.samenvat(rit.cd) || {}).join(', ') || 'nog te kort' : 'niets (FOUT?)') : ' · geen lopende rit';
      if (rit && !rit.cd) return { staat: 'FOUT', detail: 'er loopt een rit, maar hij verzamelt geen conditiekenmerken' };
      if (!g) return { staat: 'LET OP', detail: 'regel goed, maar geen actief voertuig in Mijn voertuigen' + meet };
      if (g.score !== 'aan') return { staat: 'LET OP', detail: 'regel goed · conditiescore staat uit voor ' + (g.naam || 'dit voertuig') + ' (Profiel → Conditiescore bijhouden)' + meet };
      return { staat: 'OK', detail: 'aan · ' + (PLConditie.heeftBasis(g) ? 'basis ingevuld' : 'nog geen beurt ingevuld (tabblad Conditie)') + meet };
    }
  },

  // ── contact uit is geen storing (#487, 13-10-2026) ──
  {
    issue: '#487',
    naam: 'Contact uit: de busstand van vóór de stilte komt terug, en het heet geen storing',
    waarom: 'Bij motor uit op de bestemming zwijgt de ECU; de app las dat als een slechte bus, zette groep, multi-PID, ATST en tempo omlaag en begon daarna trager.',
    proef: async function () {
      if (!window.PLContact || !PLContact._kern) return { staat: 'FOUT', detail: 'PLContact ontbreekt — pidlane-contact.js niet geladen (herladen?)' };
      if (typeof plStilteStand !== 'function' || typeof plStilteTerug !== 'function') return { staat: 'FOUT', detail: 'plStilteStand/plStilteTerug ontbreken — oude pidlane-plload.js (herladen?)' };
      if (!window.PLVerbind || typeof PLVerbind.stTerug !== 'function') return { staat: 'FOUT', detail: 'PLVerbind.stTerug ontbreekt — oude pidlane-bt.js (herladen?)' };
      var K = PLContact._kern, t = 0, terug = [], meld = [];
      var c = K.maak({ nu: function () { return t; }, kortOk: function () { return true; }, stand: function () { return { nr: terug.length + 1 }; },
        laatst: function () { return { rpm: 664, kmh: 0 }; }, terug: function (s) { terug.push(s); }, meld: function (s) { meld.push(s); }, weer: function () {} });
      c.noteAntwoord('010C0D492', '008 0:410C0A620D00 1:49270000000000');
      for (var i = 0; i < 8; i++) { c.noteAntwoord('010C1', 'NO DATA'); t += 230; }
      if (!c.stil() || meld[0] !== 'contact_uit') return { staat: 'FOUT', detail: 'de reeks van 13-10 23:20 heet niet contact uit (' + JSON.stringify(meld) + ')' };
      if (K.oordeel({ rpm: 2100, kmh: 80 }) !== 'storing') return { staat: 'FOUT', detail: 'stilvallen bij 80 km/u heet geen storing' };
      var nu = PLContact.stand();
      return { staat: 'OK', detail: 'reeks van 13-10 → contact uit, stand teruggezet · nu ' + (nu.stil ? 'stil (' + nu.oordeel + ')' : 'ECU antwoordt') +
        ' · zet het contact uit met de app open: één melding, geen ATST- of groepswijziging in het logboek' };
    }
  },

  // ── zonder adapter: milieuklasse, kosten, klachtenwijzer, adapter (#485, 13-10-2026) ──
  {
    issue: '#485',
    naam: 'Zonder adapter: milieuklasse, kosten per maand, klachtenwijzer en past een adapter',
    waarom: 'Wie de app downloadt heeft meestal nog geen adapter; bij een kenteken staan nu de milieuklasse, de maandkosten en of een adapter past, en de kaart heeft een klachtenwijzer.',
    proef: async function () {
      if (!window.PLWijzer || !PLWijzer._kern) return { staat: 'FOUT', detail: 'PLWijzer ontbreekt — pidlane-wijzer.js niet geladen (herladen?)' };
      var K = PLWijzer._kern, bs = [{ brandstof_omschrijving: 'Diesel', emissiecode_omschrijving: '4' }];
      var z = K.milieuklasse({ voertuigsoort: 'Personenauto', datum_eerste_toelating: '20080101' }, bs);
      if (z.kop !== 'Diesel, Euro 4') return { staat: 'FOUT', detail: 'milieuklasse leest "' + z.kop + '" voor een Euro 4-diesel' };
      if (K.adapter({ voertuigsoort: 'Personenauto', datum_eerste_toelating: '20010101' }, [{ brandstof_omschrijving: 'Benzine' }]).past !== 'ja') return { staat: 'FOUT', detail: 'een benzine van 01-01-2001 heet geen OBD2' };
      if (!window.PLOnderzoek) return { staat: 'LET OP', detail: 'milieuklasse en adapter goed · PLOnderzoek ontbreekt, dus geen klachtenwijzer' };
      var st = K.wijzerStart(['start']);
      K.wijzerAntwoord(st, 'startgedrag', 'traag');
      var u = K.wijzerUitkomst(st);
      if (!u || !u.kandidaten.length || u.kandidaten[0].id !== 'accu') return { staat: 'FOUT', detail: 'klachtenwijzer: traag ronddraaien zet de accu niet bovenaan' };
      var knop = document.querySelector('#plZonderKaart [data-plz="klacht"]');
      return { staat: 'OK', detail: 'milieuklasse, adapter en klachtenwijzer goed · peil ' + K.PEIL + ' · knop op de kaart ' + (knop ? 'zichtbaar' : 'niet zichtbaar (verbonden of demo)') };
    }
  },

  // ── tanken herkennen aan het brandstofpeil (#469 stap 2, 13-10-2026) ──
  {
    issue: '#469',
    naam: 'Tankbeurten: per voertuig aan of uit, en na het tanken vraagt de app het zelf',
    waarom: 'Tankbeurten moesten met de hand worden ingevuld, en niet iedereen wil ze bijhouden: nu standaard uit, en aan herkent de app een sprong in het brandstofpeil bij stilstand.',
    proef: async function () {
      if (!window.PLTank || typeof PLTank.peilTik !== 'function') return { staat: 'FOUT', detail: 'PLTank.peilTik ontbreekt — oude pidlane-tank.js (herladen?)' };
      var r = PLTank.peilTik({ buf: [12, 12, 12, 12], stil: false }, 0, 96, Date.now(), { pct: 12, t: 0 });
      if (r.sprong) return { staat: 'FOUT', detail: 'vier metingen van 12 en één van 96 heet al tanken (de mediaan dempt niet)' };
      // Sinds 31-10-2026 pas na het wegrijden (helling-buffer): stilstaan op 96, dan rijden op 95.
      var st = {}, t0 = Date.now(), gevraagd = false, i;
      for (i = 0; i < 20; i++) { r = PLTank.peilTik(st, i < 5 ? 0 : 50, i < 5 ? 96 : 95, t0 + i * 1e4, { pct: 12, t: 0 }); st = r.st; if (r.sprong) gevraagd = true; }
      if (!gevraagd) return { staat: 'FOUT', detail: 'van 12 naar 96 % bij de pomp en dan wegrijden wordt niet herkend' };
      var v = (window.PLGarage && PLGarage.actief) ? PLGarage.actief() : null;
      if (!v) return { staat: 'LET OP', detail: 'regel goed, maar geen actief voertuig in Mijn voertuigen' };
      if (v.tanken !== 'aan') return { staat: 'LET OP', detail: 'regel goed · tankbeurten bijhouden staat uit voor ' + (v.naam || 'dit voertuig') + ' (Profiel → Tankbeurten bijhouden)' };
      var a = null; try { a = JSON.parse(localStorage.getItem('pl_tank_peil_' + v.id) || 'null'); } catch (e) { a = null; }
      var p = (typeof pidVals !== 'undefined') ? pidVals['012F'] : undefined;
      if (typeof p !== 'number') return { staat: 'LET OP', detail: 'aan, maar het brandstofpeil (012F) staat niet aan: zonder peil geen herkenning' };
      return { staat: 'OK', detail: 'aan · peil nu ' + Math.round(p) + ' % · anker ' + (a ? Math.round(a.pct) + ' % (' + new Date(a.t).toLocaleString('nl') + ')' : 'nog geen — volgt bij de eerstvolgende stilstand') };
    }
  },

  // ── een diesel-hybride blijft een diesel (#430, 13-10-2026) ──
  {
    issue: '#430',
    naam: 'Hybride: een diesel-hybride houdt DPF, AdBlue en de dieseltests; stationair krijgt een hybride-uitleg',
    waarom: 'normBrandstof() maakte van "Diesel + Elektriciteit" één woord, hybride, en de app behandelde de auto daarna als benzine: dieselsensoren werden fantomen en de systeemtest gaf benzinetests.',
    proef: async function () {
      if (typeof bscGroepen !== 'function' || typeof plStationairUitleg !== 'function') return { staat: 'FOUT', detail: 'bscGroepen of plStationairUitleg ontbreekt — oude pidlane-totalcheck.js of pidlane-data.js (herladen?)' };
      if (!bscGroepen('hybride', 'diesel').has('diesel') || bscGroepen('hybride', 'diesel').has('benzine')) return { staat: 'FOUT', detail: 'een diesel-hybride krijgt niet de dieseltests' };
      if (plStationairUitleg('hybride', 'x') === 'x') return { staat: 'FOUT', detail: 'een hybride krijgt geen stationair-uitleg' };
      var et = (typeof detectEngineType === 'function') ? detectEngineType() : '?';
      var vb = (typeof vehicleInfo !== 'undefined' && vehicleInfo && vehicleInfo.verbranding) || '—';
      var f = (typeof vehicleFuelType === 'function') ? vehicleFuelType() : '?';
      if (et !== 'hybride') return { staat: 'OK', detail: 'regels goed · deze auto: ' + et + ' (geen hybride, dus niets te zien)' };
      return { staat: 'OK', detail: 'hybride · verbranding ' + vb + ' · brandstoffilter ' + f + ' · testgroepen ' + Array.from(bscGroepen(et, f)).join(', ') };
    }
  },

  // ── afwijkend t.o.v. normaal pas na echte ritten (#473, 13-10-2026) ──
  {
    issue: '#473',
    naam: 'Afwijkend t.o.v. normaal: pas na vijf echte ritten en tien minuten rijden, nooit over rijgedrag',
    waarom: 'Een nieuwe CX-5 kreeg na drie korte sessies al een normaal ("19 km/h"), en drie minuten stationair en dan gas was al een afwijking — over snelheid en rempedaal.',
    proef: async function () {
      if (typeof baselineBevinding !== 'function' || typeof sessieTeltVoorNormaal !== 'function') return { staat: 'FOUT', detail: 'baselineBevinding of sessieTeltVoorNormaal ontbreekt — oude pidlane-pids.js (herladen?)' };
      var rij = ['010C', '010D', '0111', '0149'].filter(function (p) { return baselineBevinding(p) !== null; });
      if (rij.length) return { staat: 'FOUT', detail: 'rijgedrag toch als afwijking: ' + rij.join(', ') };
      if (BASE_MIN_RITTEN !== 5) return { staat: 'FOUT', detail: 'normaal vanaf ' + BASE_MIN_RITTEN + ' ritten, verwacht 5' };
      var alle = (typeof loadSessions === 'function') ? loadSessions() : [];
      var tel = alle.filter(sessieTeltVoorNormaal).length;
      var k = (typeof sessieKlok === 'function') ? sessieKlok(Date.now()) : null;
      var min = k ? Math.round((Date.now() - k.start) / 60000) : 0, gereden = k ? Math.round(k.gereden / 60000) : 0;
      var d = tel + ' van ' + alle.length + ' sessies tellen als rit · deze sessie ' + min + ' min, ' + gereden + ' min gereden';
      if (tel < BASE_MIN_RITTEN) return { staat: 'LET OP', detail: d + ' — nog geen normaal voor deze auto, dus nog geen "afwijkend"' };
      return { staat: 'OK', detail: d };
    }
  },

  // ── een eigen sensor zonder schaal op de boog (#472, 13-10-2026) ──
  {
    issue: '#472',
    naam: 'Slim visueel: een eigen sensor in % krijgt 0…100, en wie zonder schaal van de boog valt staat er met de reden bij',
    waarom: 'De eigen Rempedaal positie (222B0D, %, zonder min/max) stond wel in het vak maar niet in de boogkeuze, zonder uitleg waarom.',
    proef: async function () {
      if (!window.PLEigen || typeof PLEigen.standaardBereik !== 'function') return { staat: 'FOUT', detail: 'PLEigen.standaardBereik ontbreekt — oude pidlane-uitgebreid.js (herladen?)' };
      if (!window.PLVisueel || typeof PLVisueel.zonderSchaal !== 'function') return { staat: 'FOUT', detail: 'PLVisueel.zonderSchaal ontbreekt — oude pidlane-visueel.js (herladen?)' };
      var b = PLEigen.standaardBereik('Rempedaal positie', null, '%');
      if (!b || b.min !== 0 || b.max !== 100) return { staat: 'FOUT', detail: '% zonder bereik geeft ' + JSON.stringify(b) + ', verwacht 0…100' };
      var eigen = (typeof discoveredPIDDefs !== 'undefined' ? discoveredPIDDefs : []).filter(function (d) { return d.eigen; });
      var af = PLVisueel.zonderSchaal(eigen);
      if (!eigen.length) return { staat: 'LET OP', detail: 'regel goed, maar geen eigen sensoren in de keuzelijst om te toetsen' };
      if (af.length) return { staat: 'LET OP', detail: af.length + ' eigen sensor(en) zonder schaal, staan met reden onder de boogkeuze: ' + af.map(function (d) { return d.name; }).join(', ') };
      return { staat: 'OK', detail: 'alle ' + eigen.length + ' eigen sensoren met een getal hebben een schaal' };
    }
  },

  // ── een adapter die niet op pair staat (#476, 13-10-2026) ──
  {
    issue: '#476',
    naam: 'Verbinden: een zwijgende adapter krijgt "opnieuw verbinden", geen protocolkeuze',
    waarom: 'Stond de adapter niet op pair, dan kwam de verbinding tot stand, gaf 0100 niets en vroeg de app om een protocol — waarna er geen PIDs stonden.',
    proef: async function () {
      if (typeof plAdapterStil !== 'function' || typeof toonAdapterStil !== 'function') return { staat: 'FOUT', detail: 'plAdapterStil of toonAdapterStil ontbreekt — oude pidlane-data.js of pidlane-bt.js (herladen?)' };
      if (plAdapterStil('', '') !== true) return { staat: 'FOUT', detail: 'niets op 0100 en ATI heet niet stil' };
      if (plAdapterStil('', 'ELM327 v1.5') !== false || plAdapterStil('UNABLE TO CONNECT', '') !== false) return { staat: 'FOUT', detail: 'een adapter die antwoordt heet toch stil' };
      return { staat: 'OK', detail: 'stil = niets op 0100 én ATI; UNABLE TO CONNECT of een versie op ATI = de adapter leeft' };
    }
  },

  // ── de helling in caravanrit en ritanalyse (#463, 09-10-2026) ──
  {
    issue: '#463',
    naam: 'Caravanrit: de helling van de telefoon beslist over klim en afdaling, met de motorregel als terugval',
    waarom: 'Klim en afdaling kwamen alleen uit belasting en snelheid: zware belasting op vlakke weg (tegenwind, volle caravan) las als een klim, met de tips die daarbij horen.',
    proef: async function () {
      if (typeof caravanTerrein !== 'function') return { staat: 'FOUT', detail: 'caravanTerrein ontbreekt — oude pidlane-caravan.js (herladen?)' };
      if (!window.PLTelemetrie || typeof PLTelemetrie.hellingVast !== 'function') return { staat: 'FOUT', detail: 'PLTelemetrie.hellingVast ontbreekt — oude pidlane-telemetrie.js (herladen?)' };
      var vlak = caravanTerrein(85, 80, 60, 0, 0.5), zonder = caravanTerrein(85, 80, 60, 0, null), op = caravanTerrein(40, 80, 30, 0, 4);
      if (vlak.climb !== 'vlak' || vlak.bron !== 'helling') return { staat: 'FOUT', detail: 'zware belasting op 0,5° leest als ' + vlak.climb + ' (' + vlak.bron + ')' };
      if (zonder.bron !== 'obd' || zonder.climb !== 'klim') return { staat: 'FOUT', detail: 'zonder helling geen terugval op de motorregel: ' + JSON.stringify(zonder) };
      if (op.climb !== 'klim') return { staat: 'FOUT', detail: '+4° leest als ' + op.climb };
      var h = PLTelemetrie.hellingVast(), hz = PLTelemetrie.houderNu();
      if (h === null) return { staat: 'LET OP', detail: 'regel goed, maar nu geen helling: ' + (hz.uitleg || hz.reden || 'telefoon niet vast') + ' — de caravanrit schat dan uit de motor' };
      return { staat: 'OK', detail: 'regel goed · helling nu ' + h.toFixed(1) + '° (telefoon vast in de houder)' };
    }
  },

  // ── de merkkennis stuurt het onderzoek (09-10-2026) ──
  {
    issue: '—',
    naam: 'Onderzoek: de bekende zwakke punten van dit merk worden verdenkingen, met kennis als voorrang en niet als bewijs',
    waarom: 'De merkkennis kwam als tekst op het scherm, maar het onderzoek toetste hem niet: een VW met een bekende kettingspanner kreeg dezelfde stappen als elke andere auto.',
    proef: async function () {
      if (!window.PLOnderzoek || typeof PLOnderzoek.kennisNaarVerdenking !== 'function') return { staat: 'FOUT', detail: 'PLOnderzoek.kennisNaarVerdenking ontbreekt — pidlane-onderzoek.js is niet de nieuwe' };
      var v = (typeof getVehicle === 'function' && getVehicle()) || {};
      if (!v.merk) return { staat: 'LET OP', detail: 'geen merk in het profiel — dan is er geen merkkennis om te toetsen' };
      var st = PLOnderzoek.nieuw({ klachten: ['controle'], merk: v.merk, brandstof: v.brandstof });
      var kn = st.kennis || {};
      if (!kn.merk) return { staat: 'LET OP', detail: v.merk + ' staat niet in AUTO_KENNIS — het onderzoek loopt zonder merkkennis' };
      var bekend = Object.keys(st.v).filter(function (h) { return st.v[h].bekend; });
      if (!bekend.length && !(kn.zelf || []).length) return { staat: 'FOUT', detail: 'merkkennis voor ' + kn.merk + ' gevonden, maar geen verdenking en geen "zelf nakijken"' };
      var bewijs = bekend.filter(function (h) { return st.v[h].score !== 0; });
      if (bewijs.length) return { staat: 'FOUT', detail: 'kennis telt als bewijs: ' + bewijs.join(', ') };
      return { staat: 'OK', detail: kn.merk + ': getoetst ' + (kn.getoetst.join(', ') || '—') + (kn.zelf.length ? ' · zelf nakijken: ' + kn.zelf.join(', ') : '') };
    }
  },

  // ── de AI-stip onderweg (09-10-2026) ──
  {
    issue: '—',
    naam: 'AI-stip: één mislukte ping is nog niet rood, twee op rij wel, en een antwoord van de proxy herstelt hem',
    waarom: 'Rijdend op 5G stond er "AI niet bereikbaar" terwijl de AI werkte: één gemiste ping zette de stip vijf minuten op rood.',
    proef: async function () {
      if (typeof aiPingUitslag !== 'function' || typeof window.plProxyGezien !== 'function') return { staat: 'FOUT', detail: 'aiPingUitslag of plProxyGezien ontbreekt — pidlane-uihelpers.js is niet de nieuwe' };
      var een = aiPingUitslag({ reach: true, mis: 0 }, false), twee = aiPingUitslag(een, false);
      if (een.reach !== true) return { staat: 'FOUT', detail: 'één misser maakt hem al rood' };
      if (twee.reach !== false) return { staat: 'FOUT', detail: 'twee missers op rij maken hem niet rood' };
      var nu = (typeof _aiReach !== 'undefined') ? _aiReach : '?';
      return { staat: 'OK', detail: 'regel klopt · nu: ' + (nu === true ? 'bereikbaar' : nu === false ? 'niet bereikbaar' : 'nog niet gemeten') };
    }
  },

  // ── eerst weten, dan invullen, dan meten (09-10-2026) ──
  {
    issue: '—',
    naam: 'Wizard: kopen begint met kenteken en "Wat we al weten"; de gegevens komen in de koopcheck terecht',
    waarom: 'De tijdvraag kwam vóór er iets over de auto bekend was, en km, prijs en kenteken uit de wizard gingen nergens heen: de koopcheck vroeg ze opnieuw.',
    proef: async function () {
      if (!window.PLWeten || !window.PLWizard) return { staat: 'FOUT', detail: 'PLWeten of PLWizard ontbreekt — pidlane-weten.js hangt niet in index.html' };
      var B = PLWizard._boom, pad = [], k = B.handel_rol.opt[0].next;
      while (k && pad.length < 8) { pad.push(k); var kn = B[k]; k = kn.type ? kn.next : (kn.opt[0] || {}).next; }
      if (pad.join(',') !== 'handel_kenteken,handel_info,handel_gegevens,handel_tijd') return { staat: 'FOUT', detail: 'volgorde na "kopen": ' + pad.join(' → ') };
      var v = (typeof getVehicle === 'function' && getVehicle()) || {};
      if (!v.merk) return { staat: 'LET OP', detail: 'volgorde klopt; voor de merkkennis op de kaart is een auto met bekend merk nodig' };
      var kennis = typeof autoKennisVoorMerk === 'function' ? autoKennisVoorMerk(v.merk, v.brandstof) : null;
      var m = PLWeten._kern.kaart({ voertuig: { merk: v.merk, model: v.model }, kennis: kennis }, 'handel', 'koop');
      var tips = m.blokken.filter(function (b) { return b.kop === 'Bij de auto en tijdens de proefrit'; })[0];
      if (!tips) return { staat: 'FOUT', detail: 'de kaart voor een koper heeft geen proefrittips' };
      return { staat: 'OK', detail: v.merk + ': ' + (kennis ? kennis.zwak.length + ' zwakke punten uit de merktabel, ' : 'niet in de merktabel, ') + tips.regels.length + ' proefrittips' +
        (m.advies ? ', advies ' + m.advies.meting : ', geen meetadvies') };
    }
  },

  // ── diepe storingsanalyse: merk en model zijn geen vraag (09-10-2026) ──
  {
    issue: '—',
    naam: 'Diepe storingsanalyse vraagt geen merk en model als de app ze al kent',
    waarom: 'De zeven stappen vroegen "Merk en model" ook als de auto verbonden was en de app ze al wist.',
    proef: async function () {
      if (typeof openDeepDiag !== 'function') return { staat: 'FOUT', detail: 'openDeepDiag ontbreekt' };
      var v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
      if (!(v.merk || v.make)) return { staat: 'LET OP', detail: 'nodig: een verbonden auto waarvan het merk bekend is' };
      openDeepDiag();
      var vraagt = (window._ddSteps || []).some(function (s) { return s.t === 'Merk en model'; });
      var veld = document.getElementById('dd_merk');
      try { closeDeepDiag(); } catch (e) { console.warn('Testrun: diepe analyse niet gesloten', e); }
      if (vraagt) return { staat: 'FOUT', detail: 'de stap "Merk en model" staat er nog' };
      if (!veld || veld.type !== 'hidden' || !veld.value) return { staat: 'FOUT', detail: 'het verborgen veld met merk en model ontbreekt — runDeepDiag krijgt dan geen auto' };
      return { staat: 'OK', detail: 'geen vraag, wel "' + veld.value + '" in de analyse' };
    }
  },

  // ── privacycheck 3.2: geen chassisnummer naar de AI ──
  {
    issue: '—',
    naam: 'Geen VIN naar de AI: het vangnet in apiFetch, en de Auto-expert zonder chassisnummer',
    waarom: 'De Auto-expert en Optimaliseer stuurden de ruwe VIN in hun prompt mee, terwijl een VIN nooit ruw de telefoon uit mag.',
    proef: async function () {
      if (typeof plZonderVin !== 'function') return { staat: 'FOUT', detail: 'plZonderVin ontbreekt — pidlane-fuel.js is niet de nieuwe' };
      var nep = 'JM3KFBCL8J0123456';
      if (plZonderVin('VIN ' + nep).indexOf(nep) >= 0) return { staat: 'FOUT', detail: 'het vangnet laat een VIN door' };
      if (plZonderVin('12345678901234567') !== '12345678901234567') return { staat: 'FOUT', detail: 'het vangnet poetst een gewoon getal weg' };
      var vin = (typeof vehicleInfo !== 'undefined' && vehicleInfo && vehicleInfo.vin) || '';
      if (!vin || typeof buildAutoExpertContext !== 'function') return { staat: 'LET OP', detail: 'vangnet klopt; voor de Auto-expert is een verbonden auto met VIN nodig' };
      var ctx = buildAutoExpertContext();
      if (ctx.indexOf(vin) >= 0) return { staat: 'FOUT', detail: 'de Auto-expert zet de VIN van deze auto in zijn context' };
      return { staat: 'OK', detail: 'vangnet werkt, en de context van de Auto-expert noemt de VIN van deze auto niet' };
    }
  },

  // ── #430: geen hybridetest die een nieuwe accu afkeurt of altijd slaagt ──
  {
    issue: '#430',
    naam: 'Systeemtest: hv_soc, ev_ice en regen zijn weg; een hybride houdt de benzinetests',
    waarom: 'hv_soc keurde een nieuwe accu af (015B is de levensduur van het pakket), ev_ice slaagde altijd en regen mat de 12V-accu.',
    proef: async function () {
      var T = window.BSC_TESTS, groepenVan = window.bscGroepen;
      if (!Array.isArray(T) || !groepenVan) return { staat: 'FOUT', detail: 'BSC_TESTS of bscGroepen ontbreekt' };
      var hyb = T.filter(function (t) { return t.groep === 'hybride'; }).map(function (t) { return t.id; });
      if (hyb.length) return { staat: 'FOUT', detail: 'nog hybridetests in de catalogus: ' + hyb.join(', ') };
      var g = groepenVan('hybride');
      if (!g.has('benzine')) return { staat: 'FOUT', detail: 'een hybride krijgt de benzinetests niet meer' };
      var et = (typeof detectEngineType === 'function') ? detectEngineType() : '?';
      return { staat: 'OK', detail: 'geen hybridetests, hybride krijgt ' + Array.from(g).sort().join(',') + ' · deze auto: ' + et };
    }
  },

  // ── één herverbinder tegelijk (08-10-2026) ──
  {
    issue: '—',
    naam: 'Na een stekker eruit en erin herverbindt de app één keer, schoon, en vraagt niet om een protocol',
    waarom: 'Op de Aygo liepen twee herverbinders door elkaar; de warme reset van de een viel midden in de protocoldetectie van de ander, en de app vroeg om een protocol (ISO 9141-2 op een CAN-auto).',
    proef: async function () {
      if (typeof _verbindingHeeftEigenaar !== 'function') return { staat: 'FOUT', detail: '_verbindingHeeftEigenaar ontbreekt — pidlane-bt.js is niet de nieuwe' };
      var was = window._plVerbindSinds, bezig = window._reconnBusy;
      window._reconnBusy = false; window._plVerbindSinds = Date.now() - 5000;
      var binnen = _verbindingHeeftEigenaar(Date.now());
      window._plVerbindSinds = Date.now() - 60000;
      var buiten = _verbindingHeeftEigenaar(Date.now());
      window._plVerbindSinds = was; window._reconnBusy = bezig;
      if (!binnen || buiten) return { staat: 'FOUT', detail: 'de guard wijkt niet (of altijd) voor een volledige verbinding: 5 s ' + binnen + ', 60 s ' + buiten };
      var h = window._plLaatsteHervat;
      if (!h) return { staat: 'LET OP', detail: 'regel klopt; nodig: trek de adapter even uit de OBD-poort (motor aan), steek hem terug, raak niets aan, en draai deze proef opnieuw' };
      return { staat: 'OK', detail: 'hervat na ' + h.reden + ' in ' + h.s + ' s, ' + h.sensoren + ' sensoren — zonder protocolvraag' };
    }
  },

  // ── de Basismeter: vier plekken die je zelf kiest (08-10-2026) ──
  {
    issue: '—',
    naam: 'Basismeter: koelwater en brandstof als bogen onderin, verbruik onder de km/h, bereik of rit linksonder — elke plek zelf te kiezen',
    waarom: 'De drie balkjes onder de snelheid waren te klein om onder het rijden te lezen, en de onderrand bleef leeg op een auto zonder olietemperatuur of turbo.',
    proef: async function () {
      var V = window.PLVisueel;
      if (!V || !V.PLEKKEN || typeof V.boogSchaal !== 'function') return { staat: 'FOUT', detail: 'PLVisueel.PLEKKEN of boogSchaal ontbreekt — pidlane-visueel.js is niet de nieuwe' };
      var rollen = V.PLEKKEN.map(function (r) { return r.rol; }).join(',');
      if (rollen !== 'links,rechts,midden,vak') return { staat: 'FOUT', detail: 'de plekken zijn ' + rollen + ', verwacht links,rechts,midden,vak' };
      var d = getPidDef('0105');
      if (JSON.stringify(V.boogSchaal('0105', d)) !== '[40,130]') return { staat: 'FOUT', detail: 'koelwater op de boog loopt niet van 40 tot 130' };
      if (V.boogSchaal('22ABCD', { name: 'x', min: -1e9, max: 1e9 }) !== null) return { staat: 'FOUT', detail: 'een sensor zonder bereik mag op een boog' };
      if (V.plekGetal(12345.6, 'kPa', 4) !== '999+') return { staat: 'FOUT', detail: 'een te breed getal wordt niet begrensd' };
      if (typeof pidViewMode === 'undefined' || pidViewMode !== 'visueel' || V.profiel() !== 'basis' || !document.querySelector('#gGrid .vis-meter'))
        return { staat: 'LET OP', detail: 'de regels kloppen, maar de Basismeter staat niet open — open Live → Visueel → Basis en draai opnieuw' };
      var ind = V.staat().ind || {}, pl = ind.plekken || {};
      var bogen = document.querySelectorAll('#gGrid .vis-boog').length, vak = !!document.getElementById('visp-vak');
      if (bogen !== 2 || !vak) return { staat: 'FOUT', detail: bogen + ' bogen en ' + (vak ? 'een' : 'geen') + ' vak linksonder, verwacht 2 en een' };
      var tekst = ['links', 'rechts', 'midden', 'vak'].map(function (r) { var e = document.getElementById('visv-' + r); return r + ' ' + (pl[r] || (r === 'vak' ? 'rit' : '—')) + ' = ' + (e ? e.textContent : '?'); }).join(' · ');
      var keuze = {}; try { keuze = JSON.parse(localStorage.getItem('pl_vis_keuze') || '{}'); } catch (e) { console.warn('blok 5: pl_vis_keuze onleesbaar', e); }
      var zelf = Object.keys(keuze).filter(function (k) { return /^basis\//.test(k); });
      return { staat: 'OK', detail: tekst + (zelf.length ? ' · zelf gekozen: ' + zelf.map(function (k) { return k.slice(6) + '=' + keuze[k]; }).join(', ') : ' · alles automatisch') };
    }
  },

  // ── #418: een drempel maakt de telefoon in de houder niet grijs ──
  {
    issue: '#418',
    naam: 'Helling en kanteling blijven helder over drempels: wiebelen telt pas na een seconde binnen 3 s',
    waarom: 'Een telefoon in de houder knikt mee met de auto; elke drempel gaf "wiebelt" en daarna 5 s grijs.',
    proef: async function () {
      var T = window.PLTelemetrie;
      if (!T || !T.HOUDER || typeof T.HOUDER.wiebelMs !== 'number') return { staat: 'FOUT', detail: 'PLTelemetrie.HOUDER.wiebelMs ontbreekt — pidlane-telemetrie.js is niet de nieuwe' };
      var goed = { vers: true, genuld: true, afwijking: 3, wiebel: 20, okMs: 6000 };
      if (!T.houder(Object.assign({}, goed, { wiebelMs: 300 })).vast) return { staat: 'FOUT', detail: 'een stoot van 0,3 s boven 8°/s telt als wiebelen' };
      if (T.houder(Object.assign({}, goed, { wiebelMs: 1500 })).vast) return { staat: 'FOUT', detail: '1,5 s wiebelen binnen 3 s telt als vast' };
      if (!T.beschikbaar() || !T.genuld()) return { staat: 'LET OP', detail: 'regel klopt; nodig voor de rit: de app op de telefoon, in de houder, Nulstellen' };
      var s = T.stats().houder, tot = s.vastS + s.losS;
      var bewijs = 'vast ' + s.vastS + ' s, niet vast ' + s.losS + ' s';
      if (tot >= 60 && s.losS > 0.2 * tot) return { staat: 'LET OP', detail: bewijs + ' — meer dan 20% niet vast; zat de telefoon de hele rit in de houder? Dan is het wegdek ruiger dan de drempel' };
      return { staat: 'OK', detail: bewijs };
    }
  },

  // ── #448: één analyserapport, altijd dezelfde opbouw ──
  {
    issue: '#448',
    naam: 'Analyserapport: acht vaste hoofdstukken, het AI-blok gelezen, een systeem zonder data grijs',
    waarom: 'De PDF van een analyse was de AI-tekst onder een kopband; nu bouwt PLRapport vaste secties uit de meting, en de AI levert alleen de woorden.',
    proef: async function () {
      var R = window.PLRapport;
      if (!R || !R.model || !R.leesAI) return { staat: 'FOUT', detail: 'PLRapport ontbreekt — pidlane-rapport.js is niet geladen' };
      var blok = 'Tekst.\n<rapport>{"conclusie":"Geen afwijking.","oordeel":"groen","hypothesen":[{"naam":"Thermostaat","uitkomst":"raar","voor":[],"tegen":["stabiel"]}]}</rapport>';
      var a = R.leesAI(blok);
      if (a.velden.bron !== 'blok' || a.velden.hypothesen[0].uitkomst !== 'open') return { staat: 'FOUT', detail: 'het rapportblok werd niet (veilig) gelezen: ' + JSON.stringify(a.velden).slice(0, 120) };
      var sam = { rijen: [{ pid: '0142', naam: 'Accuspanning', eenheid: 'V', oordeel: 'nodata', n: 0, min: null, max: null, gem: null, laatste: null, reden: '' }], tel: { nodata: 1 } };
      var m = R.model({ ai: { text: blok }, meting: { sam: sam, sec: 60, hist: {} }, def: function (p) { return getPidDef(p); } });
      if (m.secties.length !== 8) return { staat: 'FOUT', detail: m.secties.length + ' hoofdstukken in plaats van 8' };
      var st = m.secties[2].blokken.filter(function (b) { return b.soort === 'stoplicht'; })[0];
      var el = st && st.items[0];
      if (!el || el.kleur !== 'grijs') return { staat: 'FOUT', detail: 'een systeem zonder data kreeg ' + (el ? el.kleur : 'geen stoplicht') + ' in plaats van grijs' };
      return { staat: 'OK', detail: 'voorblad ' + m.voorblad.kort.kleur + ', ' + m.secties.length + ' hoofdstukken, ' + m.bijlagen.length + ' bijlagen' };
    }
  },

  // ── #446: de samenhang leest een meting als een monteur ──
  {
    issue: '#446',
    naam: 'Samenhang: een lek (trim hoog stationair, normaal bij 2500 tpm) wordt gevonden, een gezonde auto niet',
    waarom: 'Het verzamelscherm leest de meting in toestanden en laat de stappen van het volledig onderzoek erop los, in plaats van losse waarden tegen een grens.',
    proef: async function () {
      var S = window.PLSamenhang, O = window.PLOnderzoek;
      if (!S || !S.lees || !O) return { staat: 'FOUT', detail: 'PLSamenhang of PLOnderzoek ontbreekt' };
      function meting(stTrim, st2500) {
        var h = {}, t = 0;
        function zet(p, v) { (h[p] || (h[p] = [])).push({ t: t, v: v }); }
        for (var i = 0; i < 90; i++, t += 1000) {   // 60 s stationair warm, 30 s rond 2500 tpm
          var hoog = i >= 60;
          zet('010C', hoog ? 2500 : 780); zet('010D', 0); zet('0104', 22); zet('0105', 91); zet('0103', 2);
          zet('0106', hoog ? st2500 : stTrim); zet('0107', 3); zet('0110', hoog ? 9 : 3);
        }
        return h;
      }
      var lek = S.lees(meting(12, 0), O, { brandstof: 'benzine', liters: 2 });
      var top = (lek.conclusie && lek.conclusie.top[0]) || null;
      if (!top || top.id !== 'valselucht') return { staat: 'FOUT', detail: 'een lek gaf ' + (top ? top.id : 'geen aanwijzing') + ' in plaats van valse lucht' };
      var gezond = S.lees(meting(1, 0), O, { brandstof: 'benzine', liters: 2 });
      if (gezond.conclusie.top.length) return { staat: 'FOUT', detail: 'vals alarm op een gezonde meting: ' + gezond.conclusie.top.map(function (x) { return x.naam; }).join(', ') };
      return { staat: 'OK', detail: 'lek gevonden (' + top.bewijs.length + ' bewijsstukken), gezonde meting zonder alarm' };
    }
  },

  // ── #443 ronde 2: de rit als meting, en de meetproef kan meten ──
  {
    issue: '#443',
    naam: 'Verzamelscherm: een rit telt als meting, en de meetproef kan zijn tellers lezen',
    waarom: 'Na een rijtest of een ritrapport komt de uitslag uit de rit zelf; de meetproef van #443 leest verzamel-* via PLOpdracht.',
    proef: async function () {
      var V = window.PLVerzamel;
      if (!V || !V.vanBron || !V.rijSecUit) return { staat: 'FOUT', detail: 'PLVerzamel mist vanBron of rijSecUit — pidlane-verzamel.js is niet de nieuwe' };
      var snel = [], kw = [];
      for (var i = 0; i < 40; i++) { snel.push({ t: i * 2000, v: i < 5 ? 0 : 60 }); kw.push({ t: i * 2000, v: i === 20 ? 112 : 88 }); }
      var rij = V.rijSecUit(snel);
      if (rij !== 68) return { staat: 'FOUT', detail: 'rijtijd uit een rit van 40 monsters (35 rijdend, elke 2 s): ' + rij + ' s in plaats van 68 s' };
      var sam = V.vanBron({ hist: { '010D': snel, '0105': kw } });
      var r = (sam && sam.rijen || []).filter(function (x) { return x.pid === '0105'; })[0];
      if (!r || r.oordeel !== 'afwijkend') return { staat: 'FOUT', detail: 'de koelwaterpiek in de rit werd ' + (r ? r.oordeel : 'niet gezien') };
      var O = window.PLOpdracht;
      if (!O || !O.appMaten) return { staat: 'LET OP', detail: 'PLOpdracht ontbreekt — de meetproef is hier niet na te gaan' };
      var mist = ['verzamel-uitslagen', 'verzamel-afwijkend', 'verzamel-na-rit', 'verzamel-hergebruik'].filter(function (n) { return O.appMaten().indexOf(n) < 0; });
      if (mist.length) return { staat: 'FOUT', detail: 'de meetopdracht kent ' + mist.join(', ') + ' niet' };
      return { staat: 'OK', detail: 'rit: ' + rij + ' s rijdend, piek afwijkend; uitslagen deze sessie: ' + V.maat('verzamel-uitslagen') };
    }
  },

  // ── het verzamelscherm vóór een AI-rapport (#443) ──
  {
    issue: '#443',
    naam: 'Verzamelscherm: een koelwaterpiek onderweg staat bij "Valt op" en in de prompt, ook als de laatste waarde gewoon is',
    waarom: 'AI-monteur en AI-rapport stuurden alleen de laatste waarde per sensor mee; het scherm toont het venster, en de AI krijgt hetzelfde.',
    proef: async function () {
      var V = window.PLVerzamel;
      if (!V || !V.samenvatting) return { staat: 'FOUT', detail: 'PLVerzamel ontbreekt — pidlane-verzamel.js is niet geladen' };
      var h = []; for (var i = 0; i < 20; i++) h.push({ t: i * 1000, v: i === 7 ? 112 : 85 + (i % 5) * 2.5 });
      var bron = { hist: { '0105': h, '0110': [] }, def: function (p) { return getPidDef(p); }, letOp: window.PID_LET_OP || {},
                   kwal: function (p, v) { return assessPidQuality(p, v); } };
      var sam = V.samenvatting(['0110', '0105'], bron);
      var r = sam.rijen[0];
      if (!r || r.pid !== '0105' || r.oordeel !== 'afwijkend') return { staat: 'FOUT', detail: 'koelwater met piek 112 °C: ' + (r ? r.pid + ' ' + r.oordeel : 'geen rij') + ' in plaats van afwijkend bovenaan' };
      var p = V.promptBlok(sam, { sec: 60 });
      if (!/OPVALLEND[\s\S]*–112/.test(p)) return { staat: 'FOUT', detail: 'de piek staat niet onder OPVALLEND in de prompt' };
      if (!/GEEN DATA ONTVANGEN/.test(p)) return { staat: 'FOUT', detail: 'een sensor zonder data wordt niet genoemd' };
      return { staat: 'OK', detail: 'afwijkend: ' + r.reden + ' (' + r.buiten + ' van ' + r.n + ')' };
    }
  },

  // ── Grijs: één regel, en niet aan de beurt is niet oud ──
  {
    issue: '#439',
    naam: 'Grijs/dof: één regel (plOud) voor Overzicht en Visueel; een trage sensor die nog niet aan de beurt was blijft gewoon staan',
    waarom: 'Te veel metingen gingen grijs terwijl ze bewust traag gevraagd worden: de oude regel keek naar het nominale tempo, niet naar of er gevraagd was.',
    proef: async function () {
      if (typeof plOud !== 'function') return { staat: 'FOUT', detail: 'plOud ontbreekt — pidlane-plload.js is niet de nieuwe' };
      if (typeof connected === 'undefined' || !connected) return { staat: 'LET OP', detail: 'niet verbonden — zonder pollus valt er niets te meten' };
      var nu = Date.now(), grijs = [], gered = [];
      activePIDs.forEach(function (p) {
        var t = _pidLastUpd[p] || 0; if (!t) return;
        if (plOud(p, nu)) { grijs.push(p); return; }
        var oud = (nu - t) > Math.max(3 * pidPollInterval(p), 5000);
        if (oud) gered.push(p);
      });
      return { staat: 'OK', detail: grijs.length + ' grijs' + (grijs.length ? ' (' + grijs.slice(0, 5).join(', ') + ')' : '') +
        '; ' + gered.length + ' die de oude regel grijs had gezet staan nu gewoon' + (gered.length ? ' (' + gered.slice(0, 5).join(', ') + ')' : '') };
    }
  },

  // ── Banden: een ontbrekende sensor wordt genoemd ──
  {
    issue: '#396',
    naam: 'Banden: een band zonder temperatuursensor zegt dat, en het venster zegt waar je hem toevoegt',
    waarom: 'Op de CX-5 ontbrak 222A0C; achter links toonde alleen "· +3%" en niemand zag waarom.',
    proef: async function () {
      if (!window.PLBanden || typeof PLBanden.ontbreekt !== 'function' || !window.PLEigen)
        return { staat: 'FOUT', detail: 'PLBanden.ontbreekt ontbreekt — pidlane-banden.js is niet de nieuwe' };
      var ind = PLBanden.indeling(PLEigen.defs());
      if (!ind) return { staat: 'LET OP', detail: 'deze auto heeft geen bandensensoren' };
      var m = PLBanden.ontbreekt(ind), gat = m.druk.map(function (p) { return 'druk ' + p; }).concat(m.temp.map(function (p) { return 'temp ' + p; }));
      return gat.length ? { staat: 'LET OP', detail: 'deze auto mist: ' + gat.join(', ') + ' — voeg ze toe in Mijn voertuigen → Sensoren' }
                        : { staat: 'OK', detail: 'alle vier de banden hebben dezelfde sensoren' };
    }
  },

  // ── Telemetrie alleen in Visueel ──
  {
    issue: '#439',
    naam: 'Telemetrie (TL01–TL04) staat alleen in Visueel, niet in Overzicht of op het Slim-dashboard',
    waarom: 'In Overzicht stonden vier rijen "—" onder Rijden zolang de telefoon niet in de houder zat.',
    proef: async function () {
      if (typeof plIsTelemetrie !== 'function') return { staat: 'LET OP', detail: 'pidlane-telemetrie.js niet geladen' };
      var tl = [].slice.call(activePIDs).filter(function (p) { return plIsTelemetrie(p); });
      if (!tl.length) return { staat: 'LET OP', detail: 'geen telefoonsensor aangezet — niets om te weren' };
      var g = document.getElementById('gGrid');
      if (!g || !g.classList.contains('view-overzicht')) return { staat: 'LET OP', detail: 'zet Live op Overzicht en draai opnieuw' };
      var los = tl.filter(function (p) { return !!document.getElementById('gc-' + p); });
      return los.length ? { staat: 'FOUT', detail: 'in Overzicht: ' + los.join(', ') } : { staat: 'OK', detail: tl.length + ' telefoonsensoren aan, geen ervan in Overzicht' };
    }
  },

  // ── Overzicht Compact: de naam wijkt niet voor de band (#439) ──
  {
    issue: '#439',
    naam: 'Overzicht Compact: elke sensornaam past op dit scherm, ook bij tekstgrootte L',
    waarom: 'Op een telefoon van 384 px met tekstgrootte L hield de naamkolom 38 px over: "Sne…", "Toe…", "Bel…".',
    proef: async function () {
      var g = document.getElementById('gGrid');
      if (!g || !g.classList.contains('view-overzicht') || g.classList.contains('ovz-ruim'))
        return { staat: 'LET OP', detail: 'Live staat niet op Overzicht → Compact; zet hem daarop en draai opnieuw' };
      var rijen = [].slice.call(g.querySelectorAll('.ovz-vak > .gc')).filter(function (c) { return c.getClientRects().length > 0; });
      if (!rijen.length) return { staat: 'LET OP', detail: 'geen zichtbare rijen in Overzicht' };
      var kort = rijen.filter(function (c) { var n = c.querySelector('.gn2'); return n && n.scrollWidth > n.clientWidth + 1; })
        .map(function (c) { return c.querySelector('.gn2').textContent; });
      var maat = Math.round(window.innerWidth) + ' px' + (document.body.classList.contains('uiL') ? ', tekstgrootte L' : '');
      if (kort.length) return { staat: 'FOUT', detail: kort.length + ' van ' + rijen.length + ' afgekapt op ' + maat + ': ' + kort.slice(0, 4).join(', ') };
      return { staat: 'OK', detail: rijen.length + ' namen passen op ' + maat };
    }
  },

  // ── Overzicht per categorie (#439) ──
  {
    issue: '#439',
    naam: 'Overzicht: per categorie in de volgorde van de aandrijving, met een normale band en een uitleg bij een afwijking',
    waarom: 'Overzicht was een rooster zonder indeling, met afgekapte namen en een statusbolletje dat altijd groen stond.',
    proef: async function () {
      var ovzVolgorde = window.ovzVolgorde, ovzBand = window.ovzBand, ovzNoot = window.ovzNoot;
      if (!ovzVolgorde || !ovzBand || !ovzNoot)
        return { staat: 'FOUT', detail: 'ovzVolgorde/ovzBand/ovzNoot ontbreekt — pidlane-pids.js is niet de nieuwe' };
      var d = getPidDef('0105');
      if (!d) return { staat: 'LET OP', detail: 'geen definitie voor koelwater' };
      var b = ovzBand(d, 87), n = ovzNoot(d, 108, 'warn');
      if (!b.heeft || !(b.pos < b.z1)) return { staat: 'FOUT', detail: 'koelwater 87 °C valt niet in het groen: ' + JSON.stringify(b) };
      if (!/Boven de waarschuwingsgrens/.test(n)) return { staat: 'FOUT', detail: 'geen uitleg bij 108 °C: ' + n };
      var motor = (typeof detectEngineType === 'function') ? detectEngineType() : 'benzine';
      var v = ovzVolgorde(motor);
      if ((motor === 'hybride' || motor === 'ev') && v[1] !== 'elektrisch') return { staat: 'FOUT', detail: motor + ' zet Elektrisch niet bovenaan: ' + v.join(',') };
      return { staat: 'OK', detail: 'deze auto (' + motor + '): ' + v.slice(0, 4).join(' → ') + ' …' };
    }
  },

  // ── de tegels van de energieweergave (#437) ──
  {
    issue: '#437',
    naam: 'Energieweergave: EV-aandeel, versnelling en bereik (brandstof + accu) rekenen zoals beloofd',
    waarom: 'De tegels onder de Energie-ringen werden aandrijving, versnelling en bereik; het bereik telt brandstof en het geleerde accudeel op.',
    proef: async function () {
      var V = window.PLVisueel, Q = window.PLVisProfiel;
      if (!V || !V.versnellingUit || !V.bereikUit || !V.aandeelUit || !Q || !Q.tegelTekst) return { staat: 'FOUT', detail: 'de tegelfuncties ontbreken — pidlane-visueel.js of pidlane-visprofiel.js is niet de nieuwe' };
      var vs = V.versnellingUit([{ t: 0, v: 60 }, { t: 1000, v: 54 }], 1000);
      if (vs !== -6) return { staat: 'FOUT', detail: 'remmen van 60 naar 54 in 1 s geeft ' + vs + ' in plaats van −6' };
      var b = V.bereikUit(400, 3);
      if (!b || b.totaal !== 403) return { staat: 'FOUT', detail: 'brandstof 400 + accu 3 geeft ' + JSON.stringify(b) };
      var rollen = Q.voor('motor', 'hybride').plekken.map(function (x) { return x.rol; }).slice(-3).join(',');
      if (rollen !== 'aandeel,versn,bereik') return { staat: 'FOUT', detail: 'de tegels zijn ' + rollen };
      var tank = (typeof pidVals !== 'undefined' && typeof pidVals['CA09'] === 'number');
      return { staat: 'OK', detail: 'tegels ' + rollen + (tank ? '; deze auto heeft een brandstofbereik' : '; geen brandstofbereik (tankinhoud in Mijn voertuigen?)') };
    }
  },

  // ── de energieweergave voor hybride en EV (#435) ──
  {
    issue: '#435',
    naam: 'Slim visueel: een hybride opent op Energie (vermogen, accu, motor) en de ring volgt het pedaal',
    waarom: 'De Neon-weergave toonde op een hybride een toerental van 0 terwijl de auto reed; hybride-dashboards tonen energie, en dat is nu de standaard.',
    proef: async function () {
      var Q = window.PLVisProfiel;
      if (!Q || !Q.voor || !Q.toestandTekst || !Q.standaard) return { staat: 'FOUT', detail: 'PLVisProfiel.voor/toestandTekst ontbreekt — pidlane-visprofiel.js is niet de nieuwe' };
      var h = Q.voor('motor', 'hybride');
      if (h.naam !== 'Energie' || h.plekken[0].rol !== 'energie') return { staat: 'FOUT', detail: 'een hybride ziet ' + h.naam + ' met ' + h.plekken[0].rol };
      if (Q.standaard('hybride') !== 'motor' || Q.standaard('benzine') !== 'basis') return { staat: 'FOUT', detail: 'de standaardweergave klopt niet' };
      if (Q.toestandTekst({ toestand: 'ACCU_RIJDT' }, { laden: true }) !== 'Laden') return { staat: 'FOUT', detail: 'laden wint niet van de toestand' };
      var nu = (typeof detectEngineType === 'function') ? detectEngineType() : '?';
      return { staat: 'OK', detail: 'Energie bij hybride/EV; deze auto: ' + nu + (nu === 'hybride' || nu === 'ev' ? ' — opent op Energie' : ' — opent op Basis') };
    }
  },

  // ── het volledige onderzoek zonder klacht (#434) ──
  {
    issue: '#434',
    naam: 'Volledig onderzoek zonder klacht: de brede ronde, en de knop bij een groene check',
    waarom: 'Wie niets merkte maar het zeker wilde weten, kwam niet in het onderzoek; dat kon alleen met een klacht of een oranje/rode check.',
    proef: async function () {
      var O = window.PLOnderzoek, F = window.PLFoutcodes;
      if (!O || !O.nieuw || !O.KLACHTEN || !O.KLACHTEN.controle) return { staat: 'FOUT', detail: 'de klacht "controle" ontbreekt — pidlane-onderzoek.js is niet de nieuwe' };
      var st = O.nieuw({ klachten: ['controle'], brandstof: 'diesel' });
      var n = Object.keys(st.v).length;
      if (!st.v.kat || !st.v.dpf || n !== 11) return { staat: 'FOUT', detail: 'diesel-controle heeft ' + n + ' verdenkingen: ' + Object.keys(st.v).join(',') };
      if (!F || !F._tekenOordeel) return { staat: 'FOUT', detail: 'PLFoutcodes._tekenOordeel ontbreekt' };
      var groen = F._tekenOordeel({ codes: { bevestigd: [], pending: [], permanent: [] }, gelezen: { bevestigd: true, pending: true, permanent: true }, readiness: null, sinds: {} });
      if (!/Toch grondig onderzoeken/.test(groen)) return { staat: 'FOUT', detail: 'een groene check toont de knop niet' };
      return { staat: 'OK', detail: 'brede ronde (diesel ' + n + ' verdenkingen) en de knop bij groen' };
    }
  },

  // ── de vermogensnaald (#432) ──
  {
    issue: '#432',
    naam: 'Slim visueel: een hybride krijgt de vermogensnaald, en zonder toerental gaat de meter tóch open',
    waarom: 'Op een hybride stond de toerennaald op 0 terwijl de auto reed, en zonder 010C ging Slim visueel helemaal niet open.',
    proef: async function () {
      var V = window.PLVisueel;
      if (!V || !V.naaldSoort || !V.vermogenStand || !V.vraagUit) return { staat: 'FOUT', detail: 'PLVisueel.naaldSoort/vermogenStand ontbreekt — pidlane-visueel.js is niet de nieuwe' };
      if (V.naaldSoort('hybride', false, true, true) !== 'vermogen') return { staat: 'FOUT', detail: 'een hybride met pedaal krijgt de toerennaald' };
      if (V.naaldSoort('benzine', false, true, true) !== 'toeren') return { staat: 'FOUT', detail: 'een benzineauto verliest zijn toerennaald' };
      if (V.naaldSoort('benzine', false, false, true) !== 'vermogen') return { staat: 'FOUT', detail: 'zonder toerental geen naald' };
      var leer = { min: null, max: null }; V.vraagUit(15, leer);
      var rust = V.vermogenStand(V.vraagUit(15, leer), 0), gas = V.vermogenStand(V.vraagUit(60, leer), 0), laad = V.vermogenStand(0, 60);
      if (rust.deel !== V.VERMOGEN.NUL) return { staat: 'FOUT', detail: 'pedaal in rust staat niet op nul maar op ' + rust.deel };
      if (!(gas.deel > rust.deel)) return { staat: 'FOUT', detail: 'gas geven beweegt de naald niet naar rechts' };
      if (!(laad.laden && laad.deel < rust.deel)) return { staat: 'FOUT', detail: 'vertragen geeft geen laadzone' };
      return { staat: 'OK', detail: 'rust ' + rust.tekst + ', gas ' + gas.tekst + ', vertragen ' + laad.tekst };
    }
  },

  // ── hybride in de basis (#430) ──
  {
    issue: '#430',
    naam: 'Systeemtest: een hybride houdt zijn benzinetests, en een motortest meet niet tijdens accurijden of vlak na een start',
    waarom: 'Een hybride verloor vijf tests aan een motor die hij gewoon heeft, en misfire gaf twijfel op een gezonde auto die op de accu reed.',
    proef: async function () {
      var bscGroepen = window.bscGroepen, bscConditie = window.bscConditie, BSC_TESTS = window.BSC_TESTS;
      if (!bscGroepen || !bscConditie || !BSC_TESTS)
        return { staat: 'FOUT', detail: 'bscGroepen/bscConditie ontbreekt — pidlane-totalcheck.js is niet de nieuwe' };
      var g = bscGroepen('hybride');
      if (!g.has('benzine') || !g.has('hybride')) return { staat: 'FOUT', detail: 'hybride krijgt groepen ' + Array.from(g).join(',') };
      var mf = BSC_TESTS.filter(function (x) { return x.id === 'misfire'; })[0];
      if (!mf) return { staat: 'FOUT', detail: 'misfire-test ontbreekt in BSC_TESTS' };
      var accu = bscConditie(mf, new Set(['contact', 'rijden', 'constant']));
      var net = bscConditie(mf, new Set(['contact', 'rijden', 'constant', 'draaiend']));
      var stabiel = bscConditie(mf, new Set(['contact', 'rijden', 'constant', 'draaiend', 'motorstabiel']));
      if (accu.ok) return { staat: 'FOUT', detail: 'misfire meet terwijl de auto op de accu rijdt' };
      if (net.ok) return { staat: 'FOUT', detail: 'misfire meet vlak na de motorstart' };
      if (!stabiel.ok) return { staat: 'FOUT', detail: 'misfire meet niet bij een motor die al draait: ' + stabiel.label };
      return { staat: 'OK', detail: 'accu: "' + accu.label + '", net gestart: "' + net.label + '"' };
    }
  },

  // ── het volledige onderzoek (#428) ──
  {
    issue: '#428',
    naam: 'Volledig onderzoek: vindt in de app een lek via stationair en 2500 tpm, en opent een nieuwe richting op een foutcode',
    waarom: '"Er is iets mis" gaf losse modules met elk een eigen rapport; het onderzoek legt het verband en pakt door.',
    proef: async function () {
      var O = window.PLOnderzoek;
      if (!O || !O.draai) return { staat: 'FOUT', detail: 'PLOnderzoek ontbreekt — pidlane-onderzoek.js is niet geladen' };
      var st = O.nieuw({ klachten: ['onrustig'], liters: 2.0 });
      await O.draai(st, async function (stap) {
        if (stap.soort === 'vraag') return { overgeslagen: true };
        if (stap.soort === 'lezen') return { scan: { codes: { bevestigd: ['P0171', 'P0420'], pending: [], permanent: [] }, gelezen: { bevestigd: true, pending: true, permanent: true }, readiness: null, sinds: {} } };
        var r = {}; stap.pids.forEach(function (p) { r[p] = []; for (var i = 0; i < 20; i++) r[p].push(O.demoWaarde(p, stap.id)); });
        return { reeks: r, ontbreekt: [] };
      });
      var top = st.uitkomst.top[0];
      if (!top || top.id !== 'valselucht') return { staat: 'FOUT', detail: 'conclusie ' + (top ? top.id : 'geen') + ' in plaats van valse lucht' };
      if (!st.log.some(function (l) { return (l.nieuw || []).indexOf('kat') >= 0; })) return { staat: 'FOUT', detail: 'P0420 opende de katalysator niet als nieuwe richting' };
      return { staat: 'OK', detail: st.gedaan.length + ' stappen: ' + st.gedaan.join(' → ') };
    }
  },

  // ── software als oorzaak, niet de sensor (#426) ──
  {
    issue: '#426',
    naam: 'Check mijn auto: een DPF-monitor die blijft hangen staat bij de keuringsstatus als mogelijk software; een vers gewiste auto niet',
    waarom: 'Een BMW-diesel zonder roetfilter die de ECU nooit verteld was bleef op "niet klaar"; de oorzaak zat in de software, niet in een sensor.',
    proef: async function () {
      var softwareOorzaken = window.softwareOorzaken;
      if (!softwareOorzaken || !window.SOFTWARE_OORZAKEN) return { staat: 'FOUT', detail: 'softwareOorzaken ontbreekt — pidlane-data.js is niet de nieuwe' };
      var mon = ['Roetfilter (DPF)'];
      var oud = softwareOorzaken({ merk: 'BMW', brandstof: 'diesel', nietKlaar: mon, sinds: { km: 2400 } });
      var vers = softwareOorzaken({ merk: 'BMW', brandstof: 'diesel', nietKlaar: mon, sinds: { km: 40 } });
      if (!oud.some(function (x) { return x.id === 'dpf'; })) return { staat: 'FOUT', detail: 'een DPF-monitor die na 2400 km hangt geeft geen inleerfunctie' };
      if (vers.length) return { staat: 'FOUT', detail: '40 km na wissen geeft al een inleerfunctie: ' + vers.map(function (x) { return x.id; }).join(', ') };
      var F = window.PLFoutcodes;
      if (!F || !F._tekenReadiness) return { staat: 'FOUT', detail: 'PLFoutcodes._tekenReadiness ontbreekt — pidlane-foutcodes.js is niet de nieuwe' };
      var scan = { codes: {}, sinds: { km: 2400 }, readiness: { brandstof: 'diesel', nietKlaar: mon, ondersteund: 1, monitors: [], mil: false } };
      if (!/Mogelijk software/.test(F._tekenReadiness(scan))) return { staat: 'FOUT', detail: 'de keuringsstatus in Check mijn auto toont het software-advies niet' };
      return { staat: 'OK', detail: window.SOFTWARE_OORZAKEN.length + ' inleer-/coderingsfuncties; de keuringsstatus toont het advies' };
    }
  },

  // ── ATST-geheugen is geen ratel (#414) ──
  {
    issue: '#414',
    naam: 'Het verbindgeheugen bewaart alleen de koude ATST-meting; bijsturen tijdens de rit telt niet voor de volgende verbinding',
    waarom: 'De CX-5 stond na drie dagen op 1020 ms terwijl het traagste antwoord 81 ms was: elke gemiste PID kostte een seconde busstilte.',
    proef: async function () {
      if (typeof plStUitGeheugen !== 'function' || typeof plVerbindVoorGeheugen !== 'function') return { staat: 'FOUT', detail: 'plVerbindVoorGeheugen ontbreekt — pidlane-bt.js is niet de nieuwe' };
      var bew = { st: { hex: 'FF', ms: 1020, bron: 'bijgestuurd' }, protocol: { id: '6' }, adapter: 'spp', gemetenOp: Date.now() };
      if (plStUitGeheugen({ hex: '29', ms: 164, bron: 'gemeten' }, bew, '6', 'spp') !== null) return { staat: 'FOUT', detail: 'een bijgestuurde 0xFF uit het geheugen verhoogt de meting nog' };
      var V = window.PLVerbind;
      if (!V || !V.profiel) return { staat: 'LET OP', detail: 'gedrag klopt; geen verbindprofiel — nodig: verbonden met een auto, en draai opnieuw' };
      var nu = V.nu(), g = V._gemeten;
      var d = 'ATST nu 0x' + nu.st + ' (' + nu.stBron + ', ' + nu.stMs + ' ms)' + (g ? ' · koude meting 0x' + g.hex + ' (' + g.bron + ')' : '') + ' · ' + V.stappen() + '× bijgestuurd deze verbinding';
      return { staat: 'OK', detail: d };
    }
  },

  // ── telemetrie telt alleen mee als de telefoon vast zit (#418) ──
  {
    issue: '#418',
    naam: 'Telefoonsensoren tellen alleen mee als de telefoon zeker vast in een houder zit; anders heel dof',
    waarom: 'Op schoot of los in een vakje meet de telefoon zijn eigen bewegingen; die horen niet in rapport, AI of rijsituatie.',
    proef: async function () {
      var T = window.PLTelemetrie;
      if (!T || typeof T.houder !== 'function' || typeof T.houderNu !== 'function') return { staat: 'FOUT', detail: 'PLTelemetrie.houder ontbreekt — pidlane-telemetrie.js is niet de nieuwe' };
      var goed = { vers: true, genuld: true, afwijking: 3, wiebel: 2, okMs: 6000 };
      if (!T.houder(goed).vast || T.houder(Object.assign({}, goed, { genuld: false })).vast || T.houder(Object.assign({}, goed, { afwijking: 40 })).vast)
        return { staat: 'FOUT', detail: 'de regel klopt niet: zonder nulstand of 40° verschoven telt hij als vast' };
      if (!T.beschikbaar()) return { staat: 'LET OP', detail: 'gedrag klopt; dit toestel meldt geen bewegingssensor — nodig: de app op de telefoon' };
      var h = T.houderNu(), s = T.stats().houder;
      var bewijs = 'vast ' + s.vastS + ' s, niet vast ' + s.losS + ' s, ' + s.geweerd + ' metingen geweerd';
      if (!h.vast) {
        var voor = (typeof pidHist !== 'undefined' && pidHist.TL01) ? pidHist.TL01.length : 0;
        await new Promise(function (r) { setTimeout(r, 1200); });
        var na = (typeof pidHist !== 'undefined' && pidHist.TL01) ? pidHist.TL01.length : 0;
        if (!T.houderNu().vast && na > voor) return { staat: 'FOUT', detail: 'niet vast (' + h.reden + ') en toch ' + (na - voor) + ' helling-metingen in pidHist' };
        return { staat: 'LET OP', detail: 'gedrag klopt: niet vast (' + h.uitleg + '), telt niet mee · ' + bewijs + ' — nodig voor OK: telefoon in de houder, Nulstellen, 2 s stil' };
      }
      return { staat: 'OK', detail: 'vast in de houder (afwijking ' + h.afwijking + '°, wiebel ' + h.wiebel + '°/s) · ' + bewijs };
    }
  },

  // ── de beheerdersdemo (#409) ──
  {
    issue: '#409',
    naam: 'In de demo als admin rekent de AI echt en worden bestanden opgeslagen; referentiedata en applog blijven dicht',
    waarom: 'Een beheerder heeft geen eigen voertuigen; met een demo die alleen een voorbeeldrapport geeft valt de app niet te laten zien.',
    proef: async function () {
      var D = window.PLDemo;
      if (!D || typeof D.volledig !== 'function') return { staat: 'FOUT', detail: 'PLDemo.volledig ontbreekt — pidlane-demo.js is niet de nieuwe' };
      if (D.netBesluit('/v1/messages', {}, true) !== 'door') return { staat: 'FOUT', detail: 'de beheerdersdemo houdt de AI nog tegen' };
      if (D.netBesluit('/airtable/veldlab', {}, true) === 'door' || D.netBesluit('/airtable/log', {}, true) === 'door') return { staat: 'FOUT', detail: 'de beheerdersdemo laat referentiedata of de applog door' };
      if (D.netBesluit('/v1/messages', {}, false) === 'door') return { staat: 'FOUT', detail: 'de gewone demo laat de AI door' };
      var admin = typeof isAdmin === 'function' && isAdmin();
      if (!D.actief()) return { staat: 'LET OP', detail: 'gedrag klopt; er loopt geen demo — nodig: start de demo' + (admin ? '' : ' als admin') + ' en draai opnieuw' };
      return { staat: 'OK', detail: D.volledig() ? 'beheerdersdemo: AI en bestanden echt' : 'gewone demo (niet als admin ingelogd): voorbeeldrapport, geen bestanden' };
    }
  },

  // ── diesel: eigen sensoren op dezelfde weergaven (#393) ──
  {
    issue: '#393',
    naam: 'Op een diesel tonen de weergaven roetfilter, laaddruk en injectie in plaats van lambda en ontsteking',
    waarom: 'Een diesel loopt arm en heeft geen ontsteking: lambda rond 1,00, de brandstoftrims en de ontstekingshoek bleven op een diesel altijd leeg.',
    proef: async function () {
      var P = window.PLVisProfiel, V = window.PLVisueel;
      if (!P || typeof P.plekkenVan !== 'function') return { staat: 'FOUT', detail: 'PLVisProfiel.plekkenVan ontbreekt — pidlane-visprofiel.js is niet de nieuwe' };
      var e = P.indeling('emissie', function () { return true; }, 'diesel');
      if (!e || 'lambda' in e.plekken || e.plekken.dpf !== '017A') return { staat: 'FOUT', detail: 'het emissiescherm van een diesel heeft nog lambda, of geen roetfilter' };
      var motor = (typeof detectEngineType === 'function') ? detectEngineType() : null;
      if (motor !== 'diesel') return { staat: 'LET OP', detail: 'gedrag klopt; deze auto is geen diesel (' + (motor || 'onbekend') + ') — nodig: een diesel verbonden, en draai opnieuw' };
      var ind = V && typeof V.indeling === 'function' ? V.indeling() : null;
      if (ind && ind.profiel && ind.profiel.motor !== 'diesel') return { staat: 'FOUT', detail: 'Slim visueel geeft de motorsoort niet door aan de weergave ' + ind.profiel.id };
      var gevuld = ['emissie', 'motor', 'verbruik', 'temp'].map(function (id) {
        var i = P.indeling(id, function (p) { return typeof activePIDs !== 'undefined' && activePIDs.has(p); }, 'diesel');
        var n = 0, t = 0; Object.keys(i.plekken).forEach(function (k) { t++; if (i.plekken[k]) n++; });
        return id + ' ' + n + '/' + t;
      });
      return { staat: 'OK', detail: 'diesel · gevuld met de huidige selectie: ' + gevuld.join(', ') };
    }
  },

  // ── Slim visueel 06-10: accu blijft staan, auto i.p.v. VIN, één telemetriescherm ──
  {
    issue: '—',
    naam: 'Rechtsboven staat de auto en niet de VIN, het acculampje flitst niet weg, telemetrie is één scherm',
    waarom: 'Een VIN op het scherm gaat mee met elke schermafdruk; een lampje dat steeds even verdwijnt leest als een storing.',
    proef: async function () {
      var vt = document.getElementById('vtag');
      var naam = vt && vt.dataset ? (vt.dataset.naam || '') : '';
      if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(naam.replace(/\s+/g, ''))) return { staat: 'FOUT', detail: 'de voertuignaam rechtsboven is een VIN' };
      var V = window.PLVisueel, P = window.PLVisProfiel;
      if (!V || typeof V.accuGetal !== 'function') return { staat: 'FOUT', detail: 'PLVisueel.accuGetal ontbreekt — pidlane-visueel.js is niet de nieuwe' };
      if (!P || !P.zoek('telemetrie') || P.zoek('tel-g')) return { staat: 'FOUT', detail: 'de telemetrieschermen zijn niet samengevoegd' };
      if (!naam) return { staat: 'LET OP', detail: 'nog geen auto herkend — nodig: verbonden met een auto, en draai opnieuw' };
      var g = V.accuGetal('0142');
      return { staat: 'OK', detail: 'rechtsboven: ' + naam + ' · accu ' + (g ? g.v + ' V' + (g.oud ? ' (oud, dof)' : '') : 'geen spanning') + ' · telemetrie op één scherm' };
    }
  },

  // ── G-cirkel: zij-G volgt het gevoel, piekballetje (#407) ──
  {
    issue: '#407',
    naam: 'G-cirkel: rechts sturen zet de stip links, en een piek blijft 3 s staan',
    waarom: 'Achter het stuur kijk je niet continu naar het scherm; een hard rem- of stuurmoment moet na een korte blik nog te zien zijn.',
    proef: async function () {
      var P = window.PLVisProfiel;
      if (!P || typeof P.gPiek !== 'function' || typeof P.gPunt !== 'function') return { staat: 'FOUT', detail: 'PLVisProfiel.gPiek of gPunt ontbreekt — pidlane-visprofiel.js is niet de nieuwe' };
      if (!(Number(P.gPunt(0.25, 0).cx) < 100)) return { staat: 'FOUT', detail: '0,25 g naar rechts gestuurd staat op cx ' + P.gPunt(0.25, 0).cx + ' — hoort links van 100' };
      var pk = P.gPiek(P.gPiek(null, 0, -0.9, 0), 0, -0.1, 1000);
      if (pk.y !== -0.9) return { staat: 'FOUT', detail: 'de piek viel binnen 3 s terug' };
      if (!document.getElementById('vpf-f-gpiek')) return { staat: 'LET OP', detail: 'gedrag klopt; het balletje zelf staat alleen in Slim visueel → G-cirkel — nodig: open die weergave en draai opnieuw' };
      return { staat: 'OK', detail: 'zij-G gespiegeld, piek ' + P.G_PIEK_MS / 1000 + ' s, balletje in beeld' };
    }
  },

  // ── een gekozen berekende PID houdt zijn bronnen (#392) ──
  {
    issue: '#392',
    naam: 'Elke gekozen berekende PID heeft zijn bronnen in de selectie',
    waarom: 'Een berekende tegel zonder bronnen blijft leeg en leest als kapot; tot 06-10-2026 kwam een weggevallen bron pas na een herstart terug.',
    proef: async function () {
      var B = window.PLBerekend;
      if (!B || typeof B.bronset !== 'function') return { staat: 'FOUT', detail: 'PLBerekend.bronset ontbreekt' };
      if (typeof activePIDs === 'undefined' || typeof supportedPIDs === 'undefined' || !supportedPIDs.size) return { staat: 'LET OP', detail: 'geen auto gemeld — nodig: verbonden, met een berekende sensor gekozen' };
      var heeft = function (p) { return supportedPIDs.has(p); };
      var isDiesel = (typeof vehicleInfo !== 'undefined' && vehicleInfo && /diesel/i.test(vehicleInfo.brandstof || ''));
      var gekozen = [...activePIDs].filter(function (p) { return B.DEFS[p]; });
      if (!gekozen.length) return { staat: 'LET OP', detail: 'geen berekende sensor gekozen — nodig: kies er een (bijv. Verbruik) en wacht 6 s' };
      var mist = [], kan = 0;
      gekozen.forEach(function (p) {
        var set = B.bronset(p, heeft, isDiesel, {});
        if (!set) return;
        kan++;
        var weg = set.filter(function (x) { return !activePIDs.has(x); });
        if (weg.length) mist.push(p + ' mist ' + weg.join('+'));
      });
      if (mist.length) return { staat: 'FOUT', detail: mist.join(' · ') + ' — na 5 s hoort bronnenErbij() ze erbij te zetten' };
      return { staat: 'OK', detail: kan + ' van ' + gekozen.length + ' gekozen berekende sensor(en) te berekenen, allemaal met hun bronnen in de selectie' };
    }
  },

  // ── de koopcheck laat jouw kenteken staan (#331) ──
  {
    issue: '#331',
    naam: 'Een koopcheck maakt de gecheckte auto niet tot jouw auto',
    waarom: 'pl_kenteken is de sleutel van je eigen auto: zonder VIN hangen km-stand, onderhoud en dossier eraan, en die gaan mee de AI-prompt in.',
    proef: async function () {
      var d = (typeof _koopRdwData !== 'undefined') ? _koopRdwData : null;
      if (!d || !d._kent) return { staat: 'LET OP', detail: 'deze sessie nog geen koopcheck — nodig: Koopcheck → een kenteken dat niet het jouwe is → RDW opzoeken, en draai opnieuw' };
      var eigen = '';
      try { eigen = localStorage.getItem('pl_kenteken') || ''; } catch (e) { return { staat: 'LET OP', detail: 'pl_kenteken onleesbaar: ' + (e.message || e) }; }
      if (eigen === d._kent) return { staat: 'LET OP', detail: 'pl_kenteken is gelijk aan het gecheckte kenteken (' + d._kent + '): je checkte je eigen auto, of de oude code draait nog — herlaad en check een ander kenteken' };
      return { staat: 'OK', detail: 'gecheckt ' + d._kent + ', jouw kenteken bleef ' + (eigen || '(leeg)') };
    }
  },

  // ── Bluetooth uit is geen "adapter niet gevonden" (#359) ──
  {
    issue: '#359',
    naam: 'Met Bluetooth uit stopt het verbinden meteen, met een melding over Bluetooth',
    waarom: 'Anderhalve minuut scannen en dan "Adapter in OBD-poort? Contact aan?" stuurt de gebruiker naar de auto, terwijl het aan de telefoon ligt.',
    proef: async function () {
      if (typeof btUitFout !== 'function' || typeof btAanVoorKeten !== 'function') return { staat: 'FOUT', detail: 'btUitFout of btAanVoorKeten ontbreekt — pidlane-bt.js is niet de nieuwe' };
      if (!btUitFout('Bluetooth is disabled') || btUitFout('Location services are not enabled')) return { staat: 'FOUT', detail: 'de herkenning van "Bluetooth uit" klopt niet' };
      var spp = (typeof getSPP === 'function') ? getSPP() : null;
      if (!spp || typeof spp.isEnabled !== 'function') return { staat: 'LET OP', detail: 'de herkenning klopt; de stand zelf is alleen in de app te lezen — nodig: de APK, niet de browser' };
      var r = await spp.isEnabled();
      return { staat: 'OK', detail: 'herkenning klopt · Bluetooth staat nu ' + (r && r.enabled ? 'aan' : 'uit') + ' volgens de SPP-plugin' };
    }
  },

  // ── Telemetrie: helling en kanteling van de telefoon ──
  // Een nieuwe groep sensoren die niet van de auto komt maar van de
  // oriëntatiesensor van het toestel. Deze proef zegt of het toestel meet,
  // of er een nulstand is, en of er een TL-code naar de adapter ging.
  {
    issue: '—',
    naam: 'Telemetrie meet helling en kanteling en blijft van de bus af',
    waarom: 'Een TL-code die als OBD-commando de bus op gaat telt als dode sensor en uiteindelijk als dode socket — dezelfde grens als bij de berekende PIDs.',
    proef: async function () {
      var T = window.PLTelemetrie;
      if (!T) return { staat: 'FOUT', detail: 'PLTelemetrie ontbreekt — pidlane-telemetrie.js is niet geladen' };
      var s = T.stats();
      if (s.geweigerd.length) return { staat: 'FOUT', detail: s.geweigerd.length + '× een TL-code naar sendCmd, eerst: ' + s.geweigerd[0].cmd + ' via ' + s.geweigerd[0].waar };
      if (!s.events) return { staat: 'LET OP', detail: 'dit toestel meldt geen oriëntatie — nodig: de app op de telefoon, niet in een desktopbrowser' };
      if (!s.nu) return { staat: 'LET OP', detail: 'de oriëntatiesensor zweeg de laatste 2 s — nodig: app op de voorgrond' };
      var si = s.situatie || {};
      return { staat: 'OK', detail: 'helling ' + s.nu.helling + '° · kanteling ' + s.nu.kanteling + '° · ' + (s.genuld ? 'genuld' : 'nog niet genuld (ruwe hoek van de houder)') +
        ' · ' + (s.motion ? 'versnelling gecorrigeerd' : 'geen devicemotion: ongecorrigeerd') + ' · vooruit ' + (s.voorGeleerd ? 'geleerd' : 'aangenomen (' + s.leerN + ' leermomenten)') +
        ' · klim ' + si.klimS + ' s, daal ' + si.daalS + ' s, hard remmen ' + si.hardRemmen + '×, hard optrekken ' + si.hardOptrekken + '×, scherpe bocht ' + si.scherpeBocht + '× (#404)' };
    }
  },

  // ── Full function test: één cijfer voor verbinding, data en weergaven ──
  // De Full survey meet; PLFunctieTest oordeelt erover met een cijfer 1–10
  // en zegt per brandstof welke weergaven op deze auto iets betekenen. Deze
  // proef voert het oordeel uit op een nagebouwde diesel zonder 015E: dan
  // hoort Verbruik ongeschikt te zijn, wat de luchtmassa ook zegt.
  {
    issue: '—',
    naam: 'Full function test geeft een cijfer en kent het dieselverbruik',
    waarom: 'Verbruik uit de luchtmassa bij λ=1 is op een diesel fout met een factor twee of meer; een weergave die dat toont is erger dan geen weergave.',
    proef: async function () {
      var F = window.PLFunctieTest;
      if (!F) return { staat: 'FOUT', detail: 'PLFunctieTest ontbreekt — pidlane-functietest.js is niet geladen' };
      var pids = { '010C': 800, '010D': 0, '0105': 85, '0104': 20, '0110': 4, '010F': 25, '0146': 12, '012F': 50 };
      var det = Object.keys(pids).map(function (p) { return { pid: p, naam: p, val: pids[p], ms: 60, st: 'ok', q: 'ok' }; });
      var sv = { adapter: { id: 'ELM327', volt: '14.0' }, veh: { vin: 'X' }, bitmaps: { '0100': '41 00' }, readiness: { monitors: [] },
        pids: { total: det.length, transport: 0, detail: det }, timing: { rpm5: [60, 60, 60], avgMs: 60 } };
      var r = F.beoordeel(sv, { brandstofOpgegeven: 'diesel', can: true });
      var v = r.delen.weergaven.lijst.filter(function (x) { return x.id === 'verbruik'; })[0];
      if (!v || v.oordeel !== 'ongeschikt') return { staat: 'FOUT', detail: 'diesel zonder 015E: Verbruik is ' + (v ? v.oordeel : 'onbekend') };
      if (!(r.cijfer >= 1 && r.cijfer <= 10)) return { staat: 'FOUT', detail: 'cijfer ' + r.cijfer + ' buiten 1–10' };
      return { staat: 'OK', detail: 'nagebouwde diesel: cijfer ' + r.cijfer + ' · Verbruik ongeschikt · ' + r.pids.length + ' PIDs ingedeeld' };
    }
  },

  // ── Rit-monitor: niet melden bij schakelen, 👎 Klopt niet (#400) ──
  // De watchers zwijgen nu vlak na een schakelmoment en bij gas los, en
  // de drempels voor laadspanning en koelwater volgen moderne auto's. De
  // knop 👎 Klopt niet verzamelt wat er nog vals binnenkomt. Deze proef
  // zegt of dat alles geladen is en hoeveel markeringen er al liggen.
  {
    issue: '#400',
    naam: 'Rit-monitor zwijgt bij schakelen en verzamelt 👎 Klopt niet',
    waarom: 'Een melding tijdens gewoon schakelen leert de bestuurder de rit-monitor te negeren — en dan mist hij ook de echte.',
    proef: async function () {
      var W = window.PLWatch, M = window.PLMon;
      if (!W || !M) return { staat: 'FOUT', detail: 'PLWatch of PLMon ontbreekt — pidlane-watchers.js / pidlane-monitor.js niet geladen' };
      var mis = [];
      if (!(W.cfg.schakelRustMs > 0)) mis.push('geen schakelrust in PLWatch.cfg');
      var aandr = W.tests.filter(function (t) { return t.aandrijving; }).map(function (t) { return t.id; });
      if (aandr.indexOf('RPM_CONST') < 0 || aandr.indexOf('RATIO_CONST') < 0) mis.push('RPM_CONST/RATIO_CONST hebben geen schakel-poort');
      if (typeof M.feedback !== 'function' || typeof M.feedbackLijst !== 'function') mis.push('PLMon.feedback ontbreekt — geen 👎-knop');
      if (typeof _MON_ERNSTIG === 'undefined' || !_MON_ERNSTIG.test('TEST:ECT_HOOG')) mis.push('TEST:ECT_HOOG telt niet als ernstig');
      if (mis.length) return { staat: 'FOUT', detail: mis.join('; ') };
      var L = M.feedbackLijst(), per = {};
      L.forEach(function (r) { per[r.code] = (per[r.code] || 0) + 1; });
      var top = Object.keys(per).sort(function (a, b) { return per[b] - per[a]; }).slice(0, 3).map(function (k) { return k + '×' + per[k]; });
      return { staat: 'OK', detail: 'schakelrust ' + W.cfg.schakelRustMs + ' ms · ' + L.length + ' keer 👎 gemarkeerd op dit toestel' + (top.length ? ' (' + top.join(', ') + ')' : '') };
    }
  },

  // ── Verbindprofiel: de koude poort meet, en de CX-5 blijft op tempo (#388) ──
  // Sinds 03-10-2026 meet de app bij elke verbinding ATST en de groepsgrootte
  // in plaats van 400 ms en groep 3 aan te nemen. Weken werk zit in de 31,7
  // verzoeken/s van de CX-5; die mogen er niet stil uit verdwijnen. Op een
  // Mazda (WMI JM…) is dit dus een harde grens, op elke andere auto een
  // verslag van wat er gemeten is — dat is de kennis die naar D1 gaat.
  {
    issue: '#388',
    naam: 'Verbindprofiel ingemeten — en op de Mazda geen tempo kwijt',
    waarom: 'Een koude poort die te krap meet maakt een gezonde auto stil; een groepsproef die te snel opgeeft verdrievoudigt het aantal verzoeken. Op de CX-5 zou je dat pas merken als de meters trager lopen.',
    proef: async function () {
      if (typeof connected === 'undefined' || !connected || (typeof demoMode !== 'undefined' && demoMode))
        return { staat: 'LET OP', detail: 'niet verbonden met een echte auto — er is niets ingemeten' };
      var V = window.PLVerbind;
      if (!V) return { staat: 'FOUT', detail: 'PLVerbind ontbreekt — pidlane-bt.js is niet (volledig) geladen' };
      var p = V.profiel;
      if (!p) return { staat: 'FOUT', detail: 'verbonden, maar geen verbindprofiel — de koude poort is niet gedraaid of mislukte (zie BT-log: "Verbindprofiel")' };
      var st = p.st || {}, gr = p.groep;
      var sp = (typeof _connSpeed !== 'undefined' && _connSpeed) ? _connSpeed.readsPerSec : null;
      var at = (window.PLAntwoordtal && PLAntwoordtal.stand) ? PLAntwoordtal.stand() : null;
      var wat = 'protocol ' + p.protocol.id + (p.protocol.bits ? ' (' + p.protocol.bits + '-bit)' : '') +
        ' · ATST 0x' + st.hex + (st.ms ? ' (' + st.ms + ' ms, ' + st.bron + ')' : ' (' + st.bron + ')') +
        ' · groep ' + (gr ? gr.start + (gr.plafond != null ? ' plafond ' + gr.plafond : '') : 'niet gemeten') +
        (sp != null ? ' · ' + sp + ' verzoeken/s' : '') + (at ? ' · antwoordcijfer ' + at.geleerd + ' geleerd' : '');
      var vin = (typeof vehicleInfo !== 'undefined' && vehicleInfo && vehicleInfo.vin) ? String(vehicleInfo.vin).toUpperCase() : '';
      if (vin.indexOf('JM') !== 0) return { staat: st.bron === 'standaard' ? 'LET OP' : 'OK', detail: wat + (st.bron === 'standaard' ? ' — ATST kon niet gemeten worden, de oude 400 ms staat' : '') };
      var mis = [];
      if (st.bron === 'standaard') mis.push('ATST niet gemeten');
      if (parseInt(st.hex, 16) > 0x64) mis.push('ATST 0x' + st.hex + ' is trager dan de oude 0x64');
      if (!gr || gr.start !== 3) mis.push('groep ' + (gr ? gr.start : '?') + ' in plaats van 3');
      if (sp != null && sp < 25) mis.push(sp + ' verzoeken/s, onder de 25');
      if (mis.length) return { staat: 'FOUT', detail: 'Mazda (referentie): ' + mis.join('; ') + ' — ' + wat };
      if (at && at.verzoeken > 0 && !at.geleerd) return { staat: 'LET OP', detail: wat + ' — nog geen antwoordcijfer geleerd; rij een minuut en draai opnieuw' };
      return { staat: 'OK', detail: 'Mazda (referentie) op tempo: ' + wat };
    }
  },

  // ── Banden op verzoek, buiten de pollus (#396, 06-10-2026) ──
  // Acht band-PIDs gingen elke minuut de pollus in, elk met ATSH heen en
  // terug, en stonden als acht tegels met een trend in de keuzelijst. Nu
  // vraagt PLBanden.ververs() ze in één beurt, bij Slim visueel en het
  // bandenvenster. Deze proef kijkt of ze echt uit de pollus zijn en of de
  // beurt van deze verbinding antwoord gaf.
  {
    issue: '#396',
    naam: 'Banden op verzoek: niet in de pollus, wel gemeten',
    waarom: 'Acht PIDs via een ander ECU-adres kosten elke minuut busstilte, voor één vraag: staan de banden op spanning en worden ze niet te heet. Dat zie je niet aan een tegel, alleen aan een meter die hapert.',
    proef: async function () {
      if (!window.PLBanden || typeof PLBanden.ververs !== 'function' || !window.PLEigen || typeof PLEigen.opVerzoek !== 'function')
        return { staat: 'FOUT', detail: 'PLBanden.ververs of PLEigen.opVerzoek ontbreekt — pidlane-banden.js of pidlane-uitgebreid.js is niet (volledig) geladen' };
      var n = PLBanden.nu();
      if (!n.ind) return { staat: 'LET OP', detail: 'geen bandensensoren bij dit voertuig — er is niets op verzoek te vragen' };
      var pids = PLBanden.vraagPids(n.ind);
      var inPollus = pids.filter(function (p) { return !PLEigen.opVerzoek(p) && typeof activePIDs !== 'undefined' && activePIDs.has(p); });
      var opVerzoek = pids.filter(function (p) { return PLEigen.opVerzoek(p); });
      var lijst = (typeof discoveredPIDDefs !== 'undefined' && discoveredPIDDefs) ? discoveredPIDDefs : [];
      var tegels = opVerzoek.filter(function (p) { return lijst.some(function (d) { return d.pid === p; }); });
      if (tegels.length) return { staat: 'FOUT', detail: tegels.length + ' band-PID(s) op verzoek staan toch in de keuzelijst: ' + tegels.join(', ') };
      var wat = opVerzoek.length + ' van ' + pids.length + ' band-PIDs op verzoek' + (inPollus.length ? ', ' + inPollus.length + ' met een gekozen tempo in de pollus' : '');
      if (typeof connected === 'undefined' || !connected || (typeof demoMode !== 'undefined' && demoMode))
        return { staat: 'LET OP', detail: wat + ' — niet verbonden met een echte auto, niets gevraagd' };
      var r = await PLBanden.ververs();
      if (!r.ok) return { staat: 'LET OP', detail: wat + ' — vragen lukte niet: ' + r.reden };
      if (!r.goed) return { staat: 'LET OP', detail: wat + ' — geen enkele band gaf antwoord op ' + r.gevraagd + ' vragen. Klopt het ECU-adres? Test een code in Mijn voertuigen → Sensoren.' };
      return { staat: 'OK', detail: wat + ' · ' + r.goed + ' van ' + r.gevraagd + ' gaven antwoord · ' + PLBanden.oordeel(PLBanden.nu().ind, PLBanden.nu().st).detail };
    }
  },

  // ── Slim visueel: zes weergaven met een knop Volgende (02-10-2026) ──
  // Basis, temperatuur, emissie, verbruik, motor en sinds 06-10-2026
  // telemetrie (dezelfde volgorde als test-visprofiel.js). Deze proef loopt de
  // rondgang af en telt per profiel hoeveel plekken deze auto kan vullen; een
  // profiel waar niets op komt is op deze auto een lege kaart.
  {
    issue: '—',
    naam: 'Slim visueel heeft zes weergaven en Volgende loopt ze rond',
    waarom: 'Een weergave die op deze auto geen enkele sensor vindt, toont een lege kaart — en dat zie je pas als je er tijdens het rijden naartoe tikt.',
    proef: async function () {
      var P = window.PLVisProfiel;
      if (!P) return { staat: 'FOUT', detail: 'PLVisProfiel ontbreekt — pidlane-visprofiel.js is niet geladen' };
      var id = 'basis', rond = [id];
      for (var i = 0; i < P.PROFIELEN.length; i++) { id = P.volgende(id); rond.push(id); }
      if (rond.join(',') !== 'basis,temp,emissie,verbruik,motor,telemetrie,basis') return { staat: 'FOUT', detail: 'de rondgang is ' + rond.join(' → ') };
      var mag = function (p) { return typeof activePIDs !== 'undefined' && activePIDs.has(p) || (typeof discoveredPIDDefs !== 'undefined' && (discoveredPIDDefs || []).some(function (d) { return d.pid === p; })); };
      var leeg = [], tel = [];
      P.PROFIELEN.forEach(function (pr) {
        if (!pr.plekken) return;
        var ind = P.indeling(pr.id, mag), n = Object.keys(ind.plekken).filter(function (k) { return ind.plekken[k]; }).length;
        tel.push(pr.naam.toLowerCase() + ' ' + n + '/' + pr.plekken.length);
        if (!n) leeg.push(pr.naam);
      });
      if (typeof connected === 'undefined' || !connected) return { staat: 'LET OP', detail: 'niet verbonden — rondgang goed, de plekken zijn niet te tellen (' + tel.join(', ') + ')' };
      return { staat: leeg.length ? 'LET OP' : 'OK', detail: 'nu: ' + (PLVisueel.profiel ? PLVisueel.profiel() : '?') + '; plekken op deze auto: ' + tel.join(', ') + (leeg.length ? ' — leeg op deze auto: ' + leeg.join(', ') : '') };
    }
  },

  // ── Eén bevinding verbergen (02-10-2026) ──
  // Met ✕ of een dubbeltik. Verbergen is alleen het scherm: de AI krijgt hem
  // nog mee. De proef verbergt een nep-id en kijkt of de zeef hem weghaalt en
  // de rest laat staan, en zet daarna alles terug.
  {
    issue: '—',
    naam: 'Een verborgen bevinding verdwijnt uit beeld en de rest blijft staan',
    waarom: 'Een zeef die te veel weghaalt, verbergt een waarschuwing die niemand wegklikte.',
    proef: async function () {
      if (typeof bevindingZichtbaar !== 'function' || typeof _bevVerborgen === 'undefined')
        return { staat: 'FOUT', detail: 'bevindingZichtbaar/_bevVerborgen ontbreken in pidlane-correlatie.js' };
      var nep = [{ id: '__b5_weg' }, { id: '__b5_blijft' }];
      var had = _bevVerborgen.has('__b5_weg');
      _bevVerborgen.add('__b5_weg');
      var over = bevindingZichtbaar(nep).map(function (h) { return h.id; });
      if (!had) _bevVerborgen.delete('__b5_weg');
      if (over.join(',') !== '__b5_blijft') return { staat: 'FOUT', detail: 'na verbergen van één staat er: ' + (over.join(',') || 'niets') };
      var n = _bevVerborgen.size;
      return { staat: 'OK', detail: 'de zeef haalt alleen de verborgen bevinding weg' + (n ? '; deze sessie ' + n + ' verborgen door de bestuurder' : '') };
    }
  },

  // ── Geen e-mailadres naar de server (01-10-2026) ──
  // Gedrag in de draaiende app: het veldlabrecord van een klant gaat zonder
  // e-mailadres de deur uit, ook als het in een foutregel staat.
  {
    issue: 'release 3.1',
    naam: 'Een veldlabrecord van een klant gaat zonder e-mailadres de deur uit',
    waarom: 'Het e-mailadres van een klant ging mee als Tester en als User in elke logregel, terwijl het akkoordscherm "zonder je naam, e-mailadres of kenteken" belooft.',
    proef: async function () {
      if (typeof _vlSchoonVoorVerzending !== 'function' || typeof _vlGeenEmail !== 'function') return { staat: 'FOUT', detail: '_vlSchoonVoorVerzending of _vlGeenEmail ontbreekt — pidlane-veldlab.js is oud of niet geladen' };
      var uit = await _vlSchoonVoorVerzending({ t: 1, tester: 'proef@voorbeeld.nl', errs: ['Sessie hersteld: proef@voorbeeld.nl'] });
      var blob = JSON.stringify(uit);
      if (blob.indexOf('@') >= 0) return { staat: 'FOUT', detail: 'er staat nog een e-mailadres in het record: ' + blob.slice(0, 160) };
      if (_vlGeenEmail('beheer') !== 'beheer') return { staat: 'FOUT', detail: 'een gebruikersnaam zonder @ wordt ook weggehaald' };
      return { staat: 'OK', detail: 'Tester leeg, adres in de tekst vervangen door [e-mail]' };
    }
  },

  // ── Uitloggen tijdens de demo blijft uitgelogd (01-10-2026) ──
  // Gedrag in de draaiende app: de sleutels die pidlane-auth.js voor het
  // sessietoken en het uitloggen gebruikt, gaan door de demo-zandbak heen.
  {
    issue: 'release 3.1',
    naam: 'Uitloggen tijdens de demo wist het sessietoken echt, ook als de demo daarna stopt',
    waarom: 'pl_tok stond niet in de doorlaatlijst van de zandbak: uitloggen in de demo wiste het token alleen in de laag, plDemoStop() gooide die weg, en de volgende start logde je vanzelf weer in.',
    proef: async function () {
      if (!window.PLDemo || !PLDemo._kern || !Array.isArray(PLDemo._kern.DOORLAAT)) return { staat: 'FOUT', detail: 'PLDemo._kern.DOORLAAT ontbreekt — pidlane-demo.js is oud of niet geladen' };
      if (typeof TOK_KEY !== 'string' || typeof UITLOG_KEY !== 'string') return { staat: 'FOUT', detail: 'TOK_KEY of UITLOG_KEY ontbreekt — pidlane-auth.js is oud of niet geladen' };
      var mist = [TOK_KEY, UITLOG_KEY].filter(function (k) { return PLDemo._kern.DOORLAAT.indexOf(k) < 0; });
      if (mist.length) return { staat: 'FOUT', detail: 'niet in de doorlaatlijst: ' + mist.join(', ') + ' — uitloggen in de demo wordt bij het stoppen teruggedraaid' };
      return { staat: 'OK', detail: TOK_KEY + ' en ' + UITLOG_KEY + ' gaan door de zandbak' };
    }
  },

  // ── De meetrit van 01-10-2026: elke rit-vraag een getal ──
  // Gedrag in de draaiende app: elke naam op de witte lijst van PLOpdracht
  // geeft in zijn eigen module een getal of null, en de vijf meetopdrachten
  // van deze ronde keuren. Een maat die "undefined" geeft of een module die
  // ontbreekt, laat een opdracht stil op "nog niet" staan, rit na rit.
  {
    issue: '#302 #333 #337 #338 #376',
    naam: 'Elke app-maat van de meetrit geeft in de draaiende app een getal of "niet gemeten"',
    waarom: 'Opdracht 17 bleef vier ritten op "nog niet" omdat hij een stap vroeg die niets in de app zet; een app-maat die niet bestaat doet hetzelfde, en dat zie je pas na de rit.',
    proef: async function () {
      if (!window.PLOpdracht || typeof PLOpdracht.appMaten !== 'function') return { staat: 'FOUT', detail: 'PLOpdracht.appMaten ontbreekt — pidlane-opdracht.js is oud of niet geladen' };
      const namen = PLOpdracht.appMaten(), kapot = [], gemeten = [];
      namen.forEach(function (n) {
        const mod = window[PLOpdracht.appMaatModule(n)];
        let w;
        try { w = (mod && typeof mod.maat === 'function') ? mod.maat(n) : undefined; }
        catch (e) { w = undefined; console.warn('Blok 5: app-maat ' + n + ' gooide', e); }
        if (w === null) return;
        if (typeof w === 'number' && isFinite(w)) gemeten.push(n + ' ' + w);
        else kapot.push(n + ' (' + PLOpdracht.appMaatModule(n) + ': ' + (mod ? String(w) : 'module ontbreekt') + ')');
      });
      if (kapot.length) return { staat: 'FOUT', detail: kapot.length + ' van ' + namen.length + ' app-maten geven geen getal of null: ' + kapot.join(', ') };
      return namen.length + ' app-maten, ' + gemeten.length + ' deze sessie gemeten' + (gemeten.length ? ': ' + gemeten.join(', ') : '');
    }
  },

  // ── Het element #btLog blijft begrensd (01-10-2026) ──
  // Gedrag in de draaiende app: na een regel erbij staat het venster op
  // hoogstens BTLOG_DOM regels, hoe lang de sessie ook liep.
  {
    issue: '#302',
    naam: 'Het BT-logvenster houdt hoogstens 300 regels vast, ook na een lange sessie',
    waarom: 'Het venster kreeg bij elke regel een div die er nooit meer uitging; na tien minuten pollen kostte elke logregel 10 ms in plaats van 0,3 op de draad die de antwoorden afhandelt.',
    proef: async function () {
      if (typeof btLogDomAfkappen !== 'function' || typeof BTLOG_DOM !== 'number') return { staat: 'FOUT', detail: 'btLogDomAfkappen of BTLOG_DOM ontbreekt — pidlane-btflow.js is oud of niet geladen' };
      var el = document.getElementById('btLog');
      if (!el) return { staat: 'FOUT', detail: 'het element #btLog bestaat niet' };
      btDiag('Blok 5: het BT-logvenster wordt geteld', 'info');
      var n = el.childElementCount;
      var sessie = _btLog.length + (_btCapStand ? _btCapStand.weg : 0);
      if (n > BTLOG_DOM) return { staat: 'FOUT', detail: n + ' regels in het venster, hoogstens ' + BTLOG_DOM + ' (deze sessie ' + sessie + ' regels geschreven)' };
      if (sessie <= BTLOG_DOM) return { staat: 'LET OP', detail: 'deze sessie schreef pas ' + sessie + ' regels, de grens van ' + BTLOG_DOM + ' is nog niet geraakt. Nodig: een paar minuten pollen en opnieuw draaien' };
      return { staat: 'OK', detail: n + ' regels in het venster na ' + sessie + ' geschreven deze sessie' };
    }
  },

  // ── Check na verbinden: niets gevonden → vanzelf naar Live (01-10-2026) ──
  // Toetst de beslissing op een echte uitlezing van de demo-ECU (met codes)
  // en dezelfde uitlezing schoongemaakt; geen bus nodig.
  {
    issue: '#376',
    naam: 'Check na verbinden gaat bij een schone auto na vijf seconden door naar Slim visueel',
    waarom: 'Na het verbinden bleef het venster met de keuringsstatus staan, ook als alles in orde was: dat was het eerste scherm van de klant.',
    proef: async function () {
      if (!window.PLFoutcodes || typeof PLFoutcodes.magDoor !== 'function') return { staat: 'FOUT', detail: 'PLFoutcodes.magDoor ontbreekt' };
      var s = await PLFoutcodes.leesUit(PLFoutcodes.demoStuur());
      if (PLFoutcodes.magDoor(s)) return { staat: 'FOUT', detail: 'de demo-auto heeft codes en zou toch door naar Live gaan' };
      var schoon = JSON.parse(JSON.stringify(s));
      schoon.codes = { bevestigd: [], pending: [], permanent: [] };
      if (schoon.readiness) schoon.readiness.mil = false;
      if (!PLFoutcodes.magDoor(schoon)) return { staat: 'FOUT', detail: 'een uitlezing zonder codes gaat niet door naar Live' };
      return { staat: 'OK', detail: 'met codes blijft het venster staan, zonder codes telt het ' + (PLFoutcodes.cfg.doorMs / 1000) + ' s af naar Live' };
    }
  },

  // ── Overzicht vervangt Trends, Getallen en Puntjes (01-10-2026) ──
  // In Trends liep de responstijd op de telefoon in tien minuten op van 43
  // naar 120 ms; de teken-draden stonden bovenaan. Nu hoogstens vier lijnen.
  {
    issue: '#302',
    naam: 'Overzicht toont hoogstens vier trendlijnen en tekent ze gebundeld',
    waarom: 'Trends hertekende bij elke meetwaarde de trendlijn van elke tegel; op de telefoon kostte dat de helft van een kern aan tekenen.',
    proef: async function () {
      if (!window.PLTrend || typeof PLTrend.kies !== 'function') return { staat: 'FOUT', detail: 'PLTrend ontbreekt — de trendkeuze van Overzicht is er niet' };
      if (PID_VIEW_MODI.indexOf('overzicht') < 0 || PID_VIEW_MODI.indexOf('full') > -1) return { staat: 'FOUT', detail: 'de weergaven zijn ' + PID_VIEW_MODI.join(', ') };
      if (typeof pidViewMode === 'undefined' || pidViewMode !== 'overzicht') return { staat: 'LET OP', detail: 'Live staat niet op Overzicht (' + (typeof pidViewMode === 'undefined' ? '?' : pidViewMode) + '). Nodig: zet Live op 📋 Overzicht en draai opnieuw' };
      var lijnen = Array.prototype.filter.call(document.querySelectorAll('#gGrid .gspark'), function (e) { return e.getClientRects().length > 0; }).length;
      var tegels = document.querySelectorAll('#gGrid .gc').length;
      if (lijnen > PLTrend.MAX) return { staat: 'FOUT', detail: lijnen + ' trendlijnen in beeld, hoogstens ' + PLTrend.MAX };
      return { staat: 'OK', detail: lijnen + ' van ' + tegels + ' tegels met een trendlijn (vast: ' + (PLTrend.vast().join(', ') || 'geen') + '), ' + PLTrend.getekend() + ' tekenbeurten deze sessie' };
    }
  },

  // ── eigen PIDs krijgen een standaardbereik: banden en olie (30-09-2026) ──
  {
    issue: '#370',
    naam: 'Bandtemperatuur, bandenspanning en olietemperatuur (eigen PIDs) hebben een schaal',
    waarom: 'Zonder bereik stonden ze op −1e9…1e9: in Slim een gearceerde, lege balk en een bandenspanning die altijd "beweegt".',
    proef: async function () {
      if (!window.PLEigen || typeof PLEigen.controleer !== 'function') return { staat: 'FOUT', detail: 'PLEigen.controleer ontbreekt' };
      var t = PLEigen.controleer({ code: '222A0A', naam: 'Bandtemperatuur voor-links', formule: 'A', eenheid: '°C' }).def;
      var o = PLEigen.controleer({ code: '221310', naam: 'Motorolietemperatuur', formule: 'A', eenheid: '°C' }).def;
      var p = PLEigen.controleer({ code: '222A05', naam: 'Bandenspanning voor-links', formule: 'A', eenheid: 'bar' }).def;
      if (t.balkVol !== 80 || t.dH !== 65) return { staat: 'FOUT', detail: 'bandtemperatuur: balk tot ' + t.balkVol + ', rood vanaf ' + t.dH + ' — verwacht 80 en 65 (#370)' };
      if (!(o.max <= 215) || typeof o.wH !== 'number') return { staat: 'FOUT', detail: 'olietemperatuur zonder schaal of grens: ' + o.min + '…' + o.max };
      // De eenheid volgt de drukvoorkeur van de klant; reken terug naar bar.
      var perBar = { bar: 1, psi: 14.5038, kPa: 100 }[p.unit], inBar = function (v) { return Math.round(v / perBar * 10) / 10; };
      if (!perBar) return { staat: 'FOUT', detail: 'bandenspanning in onbekende eenheid ' + p.unit };
      if (inBar(p.max) !== 4 || inBar(p.dL) !== 1.5 || inBar(p.dH) !== 3.5) return { staat: 'FOUT', detail: 'bandenspanning: schaal tot ' + p.max + ' ' + p.unit + ', rood onder ' + p.dL + ' en vanaf ' + p.dH + ' — verwacht 4, 1,5 en 3,5 bar (#370)' };
      var eigen = (PLEigen.defs() || []).filter(function (d) { return d.max >= 1e9 && (d.band || /olie|oil/i.test(d.name)); });
      if (eigen.length) return { staat: 'LET OP', detail: 'de functie klopt, maar deze sensoren van dit voertuig staan nog open: ' + eigen.map(function (d) { return d.name; }).join(', ') + ' — herlaad de app' };
      return { staat: 'OK', detail: 'band ' + t.min + '…' + t.balkVol + ' °C (rood vanaf ' + t.dH + '), olie ' + o.min + '…' + o.max + ' °C, druk 0…' + p.max + ' ' + p.unit + ' (rood onder ' + p.dL + ' en vanaf ' + p.dH + ')' };
    }
  },

  // ── Slim visueel volgens #371: balkjes, acculampje, autootje (30-09-2026) ──
  // Eerst de functies (die gelden altijd), dan het scherm zelf — dat laatste
  // alleen als Slim visueel open staat, anders LET OP met wat je moet doen.
  {
    issue: '#371',
    naam: 'Slim visueel: de accu rechtsboven, een autootje voor de banden',
    waarom: 'De accu stond als getal tussen koelwater en brandstof; Opnemen en Bewaken stonden dubbel naast het vak. (De balkjes onder de snelheid zijn op 08-10-2026 vier plekken geworden; zie de proef daarvoor.)',
    proef: async function () {
      if (!window.PLVisueel || typeof PLVisueel.aandrijfLampjes !== 'function') return { staat: 'FOUT', detail: 'PLVisueel.aandrijfLampjes ontbreekt' };
      var b = PLVisueel.aandrijfLampjes(null, 'benzine', { volt: 12.4, rpm: 800 }).accu;
      if (!b || b.waarde !== '12,4 V' || !/warn/.test(b.soort)) return { staat: 'FOUT', detail: 'benzine, 12,4 V bij 800 rpm hoort een oranje acculampje te geven — kreeg ' + JSON.stringify(b) };
      var h = PLVisueel.aandrijfLampjes(null, 'hybride', { accu: 60, volt: 12.6 }).accu;
      if (!h || !h.dubbel || h.hv !== '60%' || h.volt !== '12,6 V') return { staat: 'FOUT', detail: 'een hybride hoort twee accu\'s te tonen — kreeg ' + JSON.stringify(h) };
      if (!window.PLBanden || typeof PLBanden.mini !== 'function') return { staat: 'FOUT', detail: 'PLBanden.mini ontbreekt — het bandenlampje heeft geen autootje' };
      if (typeof pidViewMode === 'undefined' || pidViewMode !== 'visueel' || !document.querySelector('#gGrid .vis-meter'))
        return { staat: 'LET OP', detail: 'de functies kloppen, maar Slim visueel staat niet open — open Live → Visueel en draai opnieuw om het scherm zelf te zien' };
      var knop = ['plLiveRec', 'plLiveWaak'].filter(function (id) { var e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; });
      if (knop.length) return { staat: 'FOUT', detail: 'onder Slim visueel staat nog ' + knop.join(' en ') };
      var a = document.getElementById('vis-lamp-accu');
      var tekst = a && !/leeg/.test(a.className) ? a.textContent : 'leeg (nog geen spanning binnen)';
      return { staat: 'OK', detail: 'Opnemen en Bewaken weg; acculampje: ' + tekst };
    }
  },

  // ── de uitleg bij knoppen is een glazen i, geen oranje ! (30-09-2026) ──
  {
    issue: '—',
    naam: 'De uitleg bij knoppen staat als glazen i, niet als oranje uitroepteken',
    waarom: 'Het oranje ! vloekte met elke knop; gekozen is een klein glazen rondje met een i (voorbeeld B).',
    proef: async function () {
      var al = Array.from(document.querySelectorAll('.plh-i'));
      if (!al.length) return { staat: 'LET OP', detail: 'geen enkel i-rondje geplaatst — staat Uitleg bij knoppen uit in Meer? Nodig: zet hem aan en draai opnieuw' };
      var fout = al.filter(function (e) {
        var cs = getComputedStyle(e);
        return e.textContent !== 'i' || cs.textTransform !== 'none' || cs.backgroundImage.indexOf('radial-gradient') < 0;
      });
      if (fout.length) return { staat: 'FOUT', detail: fout.length + ' van ' + al.length + ' rondjes wijken af, bijv. bij #' + (fout[0].parentElement.id || '?') + ': "' + fout[0].textContent + '"' };
      return { staat: 'OK', detail: al.length + ' glazen i-rondjes, allemaal met kleine i en glans' };
    }
  },

  // ── de meetopdracht van #319 meet beeld-in-beeld zelf (30-09-2026) ──
  // De opdracht vroeg om een stap "PiP 2 min aan" die niets in de app zet.
  // Nu vraagt hij PLPip om de langste periode en het langste gat daarin.
  {
    issue: '#319',
    naam: 'De meetopdracht leest het kleine venster zelf af (PiP-maten)',
    waarom: 'Vier ritten met beeld-in-beeld bleven op "nog niet" staan: de voorwaarde was een stap die geen knop zet.',
    proef: async function () {
      if (!window.PLPip || typeof PLPip.maat !== 'function') return { staat: 'FOUT', detail: 'PLPip.maat ontbreekt — de opdracht van #319 blijft op nog niet' };
      if (!window.PLOpdracht || PLOpdracht.appMaten().indexOf('pip-gat-s') < 0) return { staat: 'FOUT', detail: 'pip-gat-s staat niet op de witte lijst van PLOpdracht' };
      var langst = PLPip.maat('pip-langst-s'), gat = PLPip.maat('pip-gat-s');
      if (typeof langst !== 'number') return { staat: 'FOUT', detail: 'pip-langst-s geeft ' + langst + ' in plaats van een getal' };
      if (gat === null) return { staat: 'LET OP', detail: 'nog geen minuut in het kleine venster met een verbonden auto (langste ' + langst + ' s). Nodig: tijdens het rijden minstens 2 minuten naar een andere app.' };
      return { staat: gat <= 5 ? 'OK' : 'FOUT', detail: 'langste periode ' + langst + ' s, langste gat ' + gat + ' s (grens 5 s)' };
    }
  },

  // ── de handleiding en de uitroeptekens (30-09-2026) ──
  // Een ! hangt aan een knop via een selector uit pidlane-help-inhoud.js.
  // test-help.js zoekt die selectors in de bron; deze proef kijkt of ze in de
  // draaiende app ook echt een knop vinden, en of het venster opent en sluit.
  {
    issue: '—',
    naam: 'De handleiding opent en elk uitroepteken vindt zijn knop',
    waarom: 'Er was geen handleiding of hulpfunctie in de app. Een ! waarvan de knop hernoemd is, verdwijnt zonder foutmelding.',
    proef: async function () {
      if (!window.PLHelp || !window.PL_HULP) return { staat: 'FOUT', detail: 'PLHelp of PL_HULP ontbreekt — pidlane-help.js of pidlane-help-inhoud.js laadt niet' };
      var weg = window.PL_HULP.tips.filter(function (t) { return !document.querySelector(t.anker); }).map(function (t) { return t.id; });
      PLHelp.open('check');
      var ov = document.getElementById('plHelpOv');
      var open = !!ov && getComputedStyle(ov).display !== 'none';
      PLHelp.sluit();
      var dicht = !ov || getComputedStyle(ov).display === 'none';
      if (!open || !dicht) return { staat: 'FOUT', detail: 'het venster ' + (!open ? 'opent niet' : 'sluit niet') };
      if (weg.length) return { staat: 'FOUT', detail: 'geen knop voor: ' + weg.join(', ') };
      var n = document.querySelectorAll('.plh-i').length;
      return { staat: 'OK', detail: window.PL_HULP.tips.length + ' ankers gevonden, ' + n + ' uitroeptekens geplaatst' + (PLHelp.tipsAan() ? '' : ' (staan uit in Meer)') };
    }
  },

  // ── de pollus plant op de eerste PID die aan de beurt is (30-09-2026) ──
  // Met een vaste tik van 100 ms kwam een PID van 120 ms op 200 ms, en stond
  // de bus bij acht PIDs half leeg: 10 verzoeken/s bij 54 ms per verzoek.
  // Deze proef telt drie seconden lang hoe vaak de snelste PID echt gevraagd
  // wordt, naast wat pidPollInterval() belooft (met het tempo van PLLoad erin).
  {
    issue: '#302',
    naam: 'De snelle sensoren komen op hun eigen tempo',
    waarom: 'Het adapterpaneel stond op 10 verzoeken/s en 53% bezet: de adapter had ruimte, de pollus vroeg er niet om, en toerental kwam op 5 Hz in plaats van 8.',
    proef: async function () {
      if (typeof _pollWacht !== 'function') return { staat: 'FOUT', detail: '_pollWacht ontbreekt — de pollus tikt weer vast' };
      if (!connected || demoMode) return { staat: 'LET OP', detail: 'niet verbonden met een auto — niets gemeten' };
      var snelste = null;
      Array.from(activePIDs).forEach(function (p) {
        if (window.PLSched.dood(p)) return;
        if (!snelste || pidPollInterval(p) < pidPollInterval(snelste)) snelste = p;
      });
      if (!snelste) return { staat: 'LET OP', detail: 'geen actieve PID om te tellen' };
      var iv = pidPollInterval(snelste), vorige = window.PLSched.laatstePoging(snelste), n = 0, t0 = Date.now();
      while (Date.now() - t0 < 3000) {
        await new Promise(function (r) { setTimeout(r, 10); });
        var nu = window.PLSched.laatstePoging(snelste);
        if (nu !== vorige) { n++; vorige = nu; }
      }
      var hz = n / 3, belofte = 1000 / iv;
      var st = null; try { st = PLBus.stats(); } catch (e) { console.warn('PLBus.stats mislukt in blok 5:', e); }
      var bezet = st ? Math.round(st.belasting) : null;
      var tekst = snelste + ' ' + hz.toFixed(1) + ' Hz van de beloofde ' + belofte.toFixed(1) + ' (' + iv + ' ms)' + (bezet !== null ? ', bus ' + bezet + '% bezet' : '');
      if (hz >= belofte * 0.8) return { staat: 'OK', detail: tekst };
      // Traag bij een volle bus is de bus. Traag bij een halflege bus is de pollus.
      if (bezet !== null && bezet < 70) return { staat: 'FOUT', detail: tekst + ' — de bus heeft ruimte, de pollus vraagt er niet om' };
      return { staat: 'LET OP', detail: tekst + ' — de bus is vol; dat is de adapter of de ECU, niet de planning' };
    }
  },

  // ── de bugmelding stuurt het VIN-pseudoniem (30-09-2026) ──
  // submitBugReport() zette vehicleInfo.vin ruw in het veld VIN naar
  // /airtable/log, en het venster toonde het chassisnummer. Nu loopt het via
  // _plVinVoorLog(), net als de logkolom. Deze proef vraagt de echte gegevens
  // op die de melder zou versturen, met de VIN van de auto die er nu hangt.
  {
    issue: '—',
    naam: 'Een bugmelding stuurt het VIN-pseudoniem, niet het chassisnummer',
    waarom: 'De bugmelding was een vierde uitgaand pad voor de VIN, naast de drie in §7 van PIDLANE.md, en stuurde hem ruw.',
    proef: async function () {
      if (typeof _bugDiagMetVin !== 'function') return { staat: 'FOUT', detail: '_bugDiagMetVin ontbreekt in pidlane-auth.js — de bugmelding pakt de VIN weer zelf' };
      var ruw = String((typeof vehicleInfo !== 'undefined' && vehicleInfo && vehicleInfo.vin) || '');
      if (!ruw) return { staat: 'LET OP', detail: 'geen VIN bekend in deze sessie — niets te toetsen' };
      var d = await _bugDiagMetVin();
      if (String(d.vin).indexOf(ruw) >= 0) return { staat: 'FOUT', detail: 'de bugmelding stuurt het chassisnummer ruw mee' };
      var vorm = /^[A-HJ-NPR-Z0-9]{3}:[0-9a-f]{16}$/.test(d.vin);
      return { staat: vorm ? 'OK' : 'LET OP', detail: 'meegestuurd als ' + d.vin + (vorm ? '' : ' — geen pseudoniem, alleen de WMI (geen crypto.subtle?)') };
    }
  },

  // ── een socket die nog openstaat eerst dicht (30-09-2026) ──
  // Een herlaad (update, hervatting) sloot de Bluetooth-socket niet; de MX+
  // weigerde dan de nieuwe verbinding tot iemand op zijn knop drukte.
  // doSPPConnect() sluit nu eerst wat er nog openstaat, en zegt dat in het
  // logboek. Deze proef telt hoe vaak dat deze sessie nodig was.
  {
    issue: '#352',
    naam: 'Een Bluetooth-verbinding die nog openstaat gaat eerst dicht',
    waarom: 'Na elke update moest de knop van de adapter ingedrukt worden, omdat de oude socket de enige plek op de MX+ bezet hield.',
    proef: async function () {
      if (typeof sppOudeSluiten !== 'function') return { staat: 'FOUT', detail: 'sppOudeSluiten ontbreekt in pidlane-bt.js — een herlaad laat de oude socket weer openstaan' };
      var n = _appLogRegels().filter(function (r) { return /nog een Bluetooth-verbinding met de adapter open/.test((r && r.msg) || ''); }).length;
      return { staat: 'OK', detail: n ? n + '× een oude verbinding gesloten vóór het verbinden — dat was vóór deze versie een druk op de adapterknop' : 'deze sessie stond er bij het verbinden niets meer open' };
    }
  },

  // ── de snelheidsproef, stap voor stap (30-09-2026) ──
  // Om 08:53 was de verbinding weer traag terwijl de patch van #352 aan stond
  // en er geen draad draaide. De snelheidsproef (Admin-menu) zoekt met zes
  // genummerde stappen welke ingreep de responstijd terugbrengt onder de
  // 80 ms (tot 30-09 middag: boven de 10 verzoeken/s — dat was de pollus).
  // Deze proef kijkt of hij er staat, of het rekenwerk het verschil ziet, en
  // geeft de uitslag van een proef die al gedaan is.
  {
    issue: '#352',
    naam: 'De snelheidsproef staat klaar en wijst de goede stap aan',
    waarom: 'Een uitslag die de verkeerde ingreep aanwijst, stuurt de volgende fix de verkeerde kant op — en na een rit valt dat niet meer na te gaan.',
    proef: async function () {
      if (!window.PLSnelProef) return { staat: 'FOUT', detail: 'PLSnelProef ontbreekt — pidlane-snelproef.js is niet geladen' };
      var P = PLSnelProef;
      var proef = { stappen: { 1: { m: { atrv: 150 }, oordeel: {} },
        2: { m: { atrv: 30 }, oordeel: P.oordeelStap({ atrv: 30 }, { atrv: 150 }, { atrv: 150 }) },
        3: { m: { atrv: 30 }, oordeel: P.oordeelStap({ atrv: 30 }, { atrv: 150 }, { atrv: 30 }) } } };
      if (!/Gevonden: stap 2/.test(P.uitslag(proef)))
        return { staat: 'FOUT', detail: 'van 150 naar 30 ms bij stap 2 wijst de uitslag niet stap 2 aan: ' + P.uitslag(proef) };
      // Het tempo is geen oordeel: 9,7/s bij 54 ms is een snelle verbinding.
      if (P.oordeelStap({ perSec: 9.7, ms: 54, bezet: 53 }, null, null).staat !== 'OK')
        return { staat: 'FOUT', detail: '9,7 verzoeken/s bij 54 ms heet traag — de proef oordeelt weer op verzoeken/s' };
      var st = P.stand(), n = Object.keys(st.stappen).length;
      if (!n) return { staat: 'OK', detail: 'klaar voor gebruik; in deze sessie nog geen stap gedaan' };
      return { staat: 'OK', detail: n + ' van de ' + P.STAPPEN.length + ' stappen gedaan — ' + P.uitslag(st) };
    }
  },

  // ── het anker van de BT-log na een herlaad (30-09-2026) ──
  // Na een herlaad hield de cap van de BT-log de 300 teruggezette regels van
  // de vorige sessie vast als "begin", en rolde deze sessie eruit: in het
  // logboek van 08:41 ontbraken verbinden, VIN en de hele SPP-proef. Deze
  // proef kijkt in de echte buffer of het anker nu van deze sessie is.
  {
    issue: '—',
    naam: 'De BT-log bewaart het begin van déze sessie',
    waarom: 'Na een herlaad verdween de BT-kant van verbinden, VIN en elke proef uit het logboek, terwijl de markering "301 regels weggelaten" zei.',
    proef: async function () {
      if (typeof _btLog === 'undefined' || typeof btLogAfkappen !== 'function')
        return { staat: 'FOUT', detail: '_btLog of btLogAfkappen ontbreekt — pidlane-btflow.js is niet (goed) geladen' };
      var cap = _btLog.filter(function (r) { return r && r.cap; });
      var vorige = _btLog.filter(function (r) { return r && r.vorige && !r.cap; }).length;
      if (!cap.length) return { staat: 'OK', detail: _btLog.length + ' regels, nog niet tegen de cap gelopen' + (vorige ? '; ' + vorige + ' uit de vorige sessie staan er nog' : '') };
      if (cap.length > 1) return { staat: 'FOUT', detail: cap.length + ' markeringen in de BT-log — er hoort er één te staan die alles telt' };
      if (vorige) return { staat: 'FOUT', detail: 'afgekapt, maar ' + vorige + ' regels uit de vorige sessie staan er nog — het anker is niet van deze sessie' };
      return { staat: 'OK', detail: _btLog.length + ' regels; ' + cap[0].msg };
    }
  },

  // ── de SPP-plugin en zijn leesdraden (#352, 30-09-2026) ──
  // Een mislukte verbindpoging liet in de plugin een leesdraad achter die leeg
  // ronddraaide tot de app herstartte: alles werd trager, de telefoon warm.
  // Deze proef kijkt aan het eind van de rit of dat in DEZE sessie gebeurd
  // is — ook zonder dat iemand op een proefknop drukte — en of de patch in
  // de APK zit. Een door de proefknoppen aangetaste sessie zegt hij erbij.
  {
    issue: '#352',
    naam: 'Geen draaiende leesdraden van de SPP-plugin',
    waarom: 'Eén mislukte verbindpoging kostte een processorkern tot de app herstartte; de meting werd 10 tot 25 keer trager zonder één foutmelding.',
    proef: async function () {
      if (!window.PLSppProef) return { staat: 'FOUT', detail: 'PLSppProef ontbreekt — pidlane-sppproef.js is niet geladen' };
      var patch = await PLSppProef.patchStatus();
      var d = await PLSppProef.meetDraden(1500);
      var a = PLSppProef.aangetast();
      var pt = patch.patch ? patch.patch + (patch.aan === false ? ' (uit voor de proef)' : '') : 'geen patch (' + patch.reden + ')';
      var na = a ? '; de sessie is aangetast door de proefknoppen (' + a.reden + ')' : '';
      if (!d) return { staat: 'LET OP', detail: 'deze APK meet geen draden (PLDraden ontbreekt — een APK van vóór 30-09); patch: ' + pt + na };
      var kern = d.sppLevend + ' SPP-leesdraad/-draden, ' + d.sppDraait + ' draaiend; app ' + d.totaalPct + '% van één kern; patch: ' + pt;
      if (d.sppDraait > 0 && a) return { staat: 'LET OP', detail: kern + na + ' — verwacht na de proef; Admin → 🧹 SPP: proces beëindigen ruimt ze op (wegvegen niet)' };
      if (d.sppDraait > 0) return { staat: 'FOUT', detail: kern + ' — zonder proefknop: een mislukte verbindpoging tijdens de rit liet een draad achter (#352)' };
      if (!patch.patch) return { staat: 'LET OP', detail: kern + ' — geen draad nu, maar de patch zit niet in deze APK' + na };
      return { staat: 'OK', detail: kern + na };
    }
  },

  // ── de demo-zandbak en de app zonder adapter (29-09-2026) ──
  // In de demo wordt niets bewaard: localStorage gaat naar een laag in het
  // geheugen, plFetch houdt de AI en het schrijven naar het account binnen.
  // Het gevaar in een ECHTE rit is het omgekeerde: een zandbak die na een
  // demo is blijven openstaan. De laag vangt alleen zolang demoMode aan staat,
  // dus dan gaat er nog niets verloren — maar dan is plDemoStop() ergens
  // overgeslagen, en hangt het bewaren van deze rit aan die ene vlag. Deze
  // proef kijkt daarnaar, en of de kaart "Niet in de auto?" weg is nu de auto
  // verbonden is. Hij schrijft één proefsleutel en haalt hem weer weg.
  {
    issue: '—',
    naam: 'De demo-zandbak is dicht en bewaren werkt echt',
    waarom: 'Een zandbak die na een demo openstaat, betekent dat plDemoStop() is overgeslagen; dan hangt het bewaren van deze rit aan één vlag, en gaat het mis zonder één foutmelding.',
    proef: async function () {
      if (!window.PLDemo || !window.PLZonder)
        return { staat: 'FOUT', detail: 'PLDemo of PLZonder ontbreekt — de demo bewaart dan weer alles, of de app is zonder adapter leeg' };
      var demo = (typeof demoMode !== 'undefined' && demoMode);
      if (demo) return { staat: 'LET OP', detail: 'de testrun draait in de demo — dit toetst een echte rit' };
      var st = PLDemo.stand();
      if (st.aan) return { staat: 'FOUT', detail: 'de zandbak staat nog open na een demo (' + st.inLaag + ' sleutels in de laag): plDemoStop() is overgeslagen — de opslag gaat nu alleen door omdat demoMode uit staat' };
      var k = 'pl_b5_zandbak', ok = false;
      try { localStorage.setItem(k, '1'); ok = localStorage.getItem(k) === '1'; localStorage.removeItem(k); }
      catch (e) { return { staat: 'FOUT', detail: 'localStorage weigert: ' + (e && e.message || e) }; }
      if (!ok) return { staat: 'FOUT', detail: 'een proefsleutel kwam niet terug uit localStorage' };
      if (PLDemo.netBesluit('/v1/messages', {}) === 'door')
        return { staat: 'FOUT', detail: 'de demopoort laat de AI door — in een demo gaat er dan een analyse over een verzonnen auto de deur uit' };
      var verbonden = typeof connected !== 'undefined' && connected;
      var kaart = document.getElementById('plZonderKaart');
      PLZonder.teken(true);
      if (verbonden && kaart && kaart.innerHTML.trim())
        return { staat: 'FOUT', detail: 'de auto is verbonden, maar de kaart "Niet in de auto?" staat er nog' };
      return { staat: 'OK', detail: 'zandbak dicht, opslag schrijft echt, de AI blijft in de demo binnen' + (verbonden ? ', geen zonder-adapterkaart tijdens de rit' : '') };
    }
  },

  // ── herinneringen en de lampjesgids (29-09-2026) ──
  // De herinneringen hangen aan een native plugin (@capacitor/local-notifications)
  // die pas in de schil zit na een nieuwe APK. Zonder plugin werkt het wel, maar
  // alleen in de app — en dat is precies het geval dat niemand merkt, want er
  // gaat niets mis, er komt alleen nooit een melding.
  {
    issue: '—',
    naam: 'Herinneringen: de schil kan meldingen inplannen',
    waarom: 'Een APK-herinnering die alleen in de app verschijnt, mist het hele punt: je opent de app niet als je er niet aan denkt.',
    proef: async function () {
      if (!window.PLHerinner || !window.PLLampjes)
        return { staat: 'FOUT', detail: 'PLHerinner of PLLampjes ontbreekt' };
      var C = window.Capacitor, LN = C && C.Plugins && C.Plugins.LocalNotifications;
      var rood = PLLampjes._kern.LAMPJES.filter(function (l) { return l.kleur === 'rood' && l.doorrijden === 'ja'; });
      if (rood.length) return { staat: 'FOUT', detail: 'de lampjesgids zegt "doorrijden" bij rood: ' + rood.map(function (l) { return l.id; }).join(', ') };
      if (!LN) return { staat: 'LET OP', detail: 'deze schil heeft de meldingenplugin niet (browser of een APK van vóór 29-09) — herinneringen komen alleen in de app' };
      var p = null;
      try { p = await LN.checkPermissions(); } catch (e) { return { staat: 'FOUT', detail: 'checkPermissions faalt: ' + (e && e.message || e) }; }
      var aan = PLHerinner.aan(), regel = PLHerinner.regel();
      if (aan && (!p || p.display !== 'granted'))
        return { staat: 'LET OP', detail: 'herinneringen staan aan, maar Android staat meldingen voor PidLane niet toe (' + (p && p.display) + ') — ze komen alleen in de app' };
      var gepland = [];
      try { var r = await LN.getPending(); gepland = (r && r.notifications) || []; } catch (e) { console.warn('Testrun: ingeplande meldingen niet leesbaar', e); }
      return { staat: 'OK', detail: 'plugin aanwezig, toestemming ' + (p && p.display) + ', herinneringen ' + (aan ? 'aan' : 'uit') + (regel ? ' (' + regel.aantal + ' datum/data)' : '') + ', ' + gepland.length + ' ingepland bij Android' };
    }
  },

  // ── de onderbalk en het nieuwe startscherm (29-09-2026) ──
  // Vier tabs, één hoofdknop en vier tegels vervangen ☰, 🏠 en zes deuren.
  // Wat in de auto stuk kan zijn en in de browserproef niet: de balk staat er
  // niet na een echte login, een tegel wijst naar een wizardtak die in deze
  // build ontbreekt, of de oplichtende tab zegt iets anders dan wat er in beeld
  // staat. Deze proef LEEST alleen: hij tikt niets aan, want hij draait midden
  // in een testrun en mag die niet wegnavigeren.
  {
    issue: '—',
    naam: 'Onderbalk, Check mijn auto en de vier tegels staan er',
    waarom: 'Het startscherm is de eerste indruk en de enige weg naar de rest; een tegel die niets opent of een balk die ontbreekt, merkt de klant voor jij het doet.',
    proef: async function () {
      if (!window.PLNav || !window.PLWizard)
        return { staat: 'FOUT', detail: 'PLNav of PLWizard ontbreekt — geen onderbalk of geen tegels' };
      PLNav.ververs();
      var nav = document.getElementById('plNav');
      var tabs = nav ? nav.querySelectorAll('.pl-nav-tab').length : 0;
      if (tabs !== 4) return { staat: 'FOUT', detail: 'de onderbalk heeft ' + tabs + ' tabs, verwacht 4' };
      if (!document.body.classList.contains('pl-nav-aan'))
        return { staat: 'FOUT', detail: 'ingelogd, maar de onderbalk staat niet aan (body.pl-nav-aan ontbreekt)' };
      if (!document.getElementById('plCheckBtn'))
        return { staat: 'FOUT', detail: 'de knop Check mijn auto staat niet op het startscherm' };
      var takken = PLWizard._takken || {}, mis = [];
      document.querySelectorAll('.pl-tegel').forEach(function (t) {
        var m = String(t.getAttribute('onclick') || '').match(/PLNav\.tegel\('([a-z]+)'\)/);
        if (!m || !takken[m[1]]) mis.push(m ? m[1] : '(geen tak)');
      });
      if (mis.length) return { staat: 'FOUT', detail: 'tegel zonder wizardtak: ' + mis.join(', ') };
      var ws = document.getElementById('welcomeScreen');
      var aan = nav.querySelector('.pl-nav-tab.aan');
      var verwacht = ws && !ws.classList.contains('hidden') ? 'auto' : null;
      if (verwacht && (!aan || aan.getAttribute('data-tab') !== verwacht) && !document.getElementById('kebabMenu').classList.contains('open'))
        return { staat: 'FOUT', detail: 'het startscherm staat open maar tab "' + (aan ? aan.getAttribute('data-tab') : 'geen') + '" licht op' };
      return { staat: 'OK', detail: '4 tabs, Check mijn auto, ' + document.querySelectorAll('.pl-tegel').length + ' tegels met een tak; garagemodus ' + (PLNav.garage() ? 'aan' : 'uit') };
    }
  },

  // ── de meetopdracht van buiten (#241, 17-09-2026) ──
  // De lus: de testrun schrijft tijdens de rit naar de logtabel, die tabel
  // wordt buiten de app gelezen, en daaruit volgt een volgende meting. Zonder
  // deze proef kost die volgende meting elke keer een deploy naar 100% van
  // het verkeer.
  //
  // Wat er binnenkomt is DATA en geen code: sensoren, een duur, vragen,
  // drempels, en proeven van de vorm "PID X, maat Y, tussen A en B". Het
  // keuren gebeurt in pidlane-opdracht.js, vóór er iets mee gebeurt.
  //
  // DE UITSLAG GAAT MET NAAM EN AL DE LIVE-LOG IN. Dat is de terugweg: wie de
  // tabel leest ziet niet alleen dát er gemeten is maar ook WELKE opdracht dat
  // deed. Zonder die koppeling staan er straks uitslagen in de tabel waarvan
  // niemand meer weet bij welke vraag ze hoorden.
  {
    issue: '#241',
    naam: 'De meetopdracht van buiten is uitgevoerd',
    waarom: 'Een opdracht die stil niet aankomt of stil wordt afgekeurd, is een rit die iets anders meet dan er gevraagd is — en dat merk je pas bij het lezen van het verslag.',
    proef: async function () {
      if (!window.PLOpdracht || typeof PLOpdracht.haal !== 'function')
        return { staat: 'FOUT', detail: 'PLOpdracht ontbreekt — dan is er geen weg meer van buiten naar de meting (#241)' };

      if (!PLOpdracht.toggleAan())
        return { staat: 'LET OP', detail: 'het ophalen van meetopdrachten staat uit in de Config (`feat_opdracht`) — ' +
          'de testrun draait zoals hij in de build staat. Dat is hier een keuze, geen fout.' };

      var o = null;
      try { o = await PLOpdracht.haal(); }
      catch (e) { return { staat: 'FOUT', detail: 'de opdracht kon niet opgehaald worden: ' + ((e && e.message) || e) }; }

      if (!o) {
        var r = PLOpdracht.reden() || 'onbekend';
        // Afgekeurd is iets anders dan er-staat-niets. Het eerste is een fout
        // in wat er klaargezet is en moet opvallen; het tweede is de normale
        // stand tussen twee rondes in.
        if (/afgekeurd/i.test(r))
          return { staat: 'FOUT', detail: 'er stond een opdracht klaar en die is AFGEKEURD — ' + r +
            '. De rit meet nu dus iets anders dan er in de tabel staat.' };
        return { staat: 'LET OP', detail: 'geen opdracht uitgevoerd: ' + r };
      }

      var h = PLOpdracht.herkomst() || {};
      var kop = '"' + o.naam + '"' + (h.id ? ' (' + h.id + ')' : '') + (o.reden ? ' — ' + o.reden : '');

      // De sensoren van de opdracht moeten aan hebben gestaan; staat er een
      // pas nú bij, dan is er deze rit over die PID niets gemeten en zegt de
      // proef dat in plaats van een leeg getal te melden.
      var laat = PLOpdracht.zetSensoren();

      /* DE TERUGWEG, PLUS HET DRIEWAARDIGE OORDEEL (#257). Tot 18-09 kwamen
         "niet gemeten" en "gemeten en buiten de band" allebei als een regel in
         dit verslag, en waren ze daar niet uit elkaar te houden. Juist dat
         verschil is wat je voor de volgende rit nodig hebt: het eerste zegt
         "doe het nog eens, maar dan met déze omstandigheid erbij", het tweede
         zegt "er is iets".

         Van de twintig LET OP-regels op de rit van 18-09 gingen er negen niet
         over de auto maar over omstandigheden die er niet waren. Die stonden
         pas in het verslag ná de rit, tussen de rest — als het te laat is.

         Het meten en wegschrijven zelf staat in _verzendOpdracht(): de
         meetkamer kan dezelfde weg lopen zonder een hele testrun te draaien. */
      var terug = _verzendOpdracht(o, h);
      var uitslagen = terug.uitslagen;
      var vonnis = terug.vonnis;
      var staart = uitslagen.map(function (u) { return u.naam + ': ' + u.detail; }).join(' | ');
      var laatst = laat.length ? ' [' + laat.join(', ') + ' stond(en) niet aan en zijn nu pas aangezet — over deze rit zeggen ze niets]' : '';
      var vw = vonnis.voorwaarden.length
        ? '  ·  voorwaarden: ' + vonnis.voorwaarden.map(function (v) {
            return v.wat + ' ' + (v.vervuld === true ? '\u2713' : v.vervuld === null ? '?' : '\u2717'); }).join(', ')
        : '';

      // De uitkomst per opdracht naar de live-log, met de issues in een eigen
      // veld. Zo is van buiten te lezen WELKE issues deze sessie een antwoord
      // kregen, zonder een detailtekst te moeten parsen.
      _liveSchrijf(vonnis.staat === 'bevinding' ? 'opvallend' : 'info',
        'opdracht ' + o.naam + ' — uitkomst: ' + vonnis.staat + ' — ' + vonnis.reden,
        { Outcome: vonnis.staat, Repro: _issuesVan(o) });

      if (!o.proeven.length)
        return { staat: 'LET OP', detail: kop + ' — de opdracht draagt geen proeven, dus er valt hier niets te toetsen. ' +
          'De sensoren en de vragen zijn wel gezet.' + vw + laatst };

      if (vonnis.staat === 'bevinding')
        return { staat: 'FOUT', detail: kop + ' — BEVINDING: ' + vonnis.reden + vw + laatst };
      if (vonnis.staat === 'nog niet')
        return { staat: 'LET OP', detail: kop + ' — NOG NIET: ' + vonnis.reden + vw + laatst };
      return { staat: 'ok', detail: kop + ' — GESLOTEN: alle ' + uitslagen.length + ' binnen de band: ' + staart + vw + laatst };
    }
  },

  // ── zegt het scherm hetzelfde als het verslag? (#246, 18-09-2026) ──
  // De meetkamer tekent de lus terwijl hij loopt. Dat is nuttig zolang hij
  // hetzelfde zegt als dit verslag, en gevaarlijk zodra dat niet meer zo is:
  // een scherm dat groen wijst waar blok 5 rood zegt, laat je stoppen met
  // lezen. Precies de vorm van test-healthgate.js, maar dan waar je naar kijkt.
  //
  // DEZE PROEF STAAT NA #241, EN DAT IS GEEN SMAAK. De opdracht wordt pas
  // opgehaald door de proef van #241 hierboven; stond deze ervóór, dan is er
  // nog niets geladen en meldt hij elke run "geen opdracht geladen" — precies
  // wat er in de run van 18-09 18:32 gebeurde, waar hij LET OP gaf terwijl de
  // opdracht drie regels later gewoon drie uitslagen boekte. Een proef die
  // altijd hetzelfde zegt, toetst niets.
  //
  // test-meetkamer.js toetst de afleiding zonder browser en bproef-meetkamer.js
  // toetst dat het paneel er werkelijk in hangt. Wat allebei NIET kunnen is dit:
  // tijdens een échte rit, op de échte meetwaarden, geven de twee dan nog
  // steeds hetzelfde oordeel? Dat is wat hier gemeten wordt, en het is
  // goedkoop — beide kanten zijn al berekend.
  {
    issue: '#246',
    naam: 'Het scherm en het verslag geven hetzelfde oordeel',
    waarom: 'Een tegel die groen wijst waar het verslag rood zegt, is erger dan geen tegel: je stopt met het verslag lezen en meet daarna maanden naast.',
    proef: async function () {
      if (!window.PLMeetkamer)
        return { staat: 'FOUT', detail: 'PLMeetkamer ontbreekt — pidlane-meetkamer.js hangt niet in index.html, dus de lus is tijdens de rit onzichtbaar (#246)' };

      var s = null;
      try { s = PLMeetkamer.momentopname(); }
      catch (e) { return { staat: 'FOUT', detail: 'het scherm kon zijn bronnen niet lezen: ' + ((e && e.message) || e) }; }

      if (!s.opdracht)
        return { staat: 'LET OP', detail: 'geen opdracht geladen, dus er valt hier niets naast elkaar te leggen — ' +
          'het scherm meldt: ' + (s.reden || 'onbekend') };

      // DE VERGELIJKING. Beide kanten komen uit PLOpdracht.meet(), dus ze
      // HOREN gelijk te zijn — en juist daarom is een verschil hier een harde
      // bevinding en geen ruis: het betekent dat er ergens een tweede oordeel
      // is ontstaan.
      var scheef = [];
      s.uitslagen.forEach(function (u) {
        var m = PLMeetkamer.meter(u);
        if (m.staat !== u.staat) { scheef.push(u.naam + ': verslag ' + u.staat + ', scherm ' + m.staat); return; }
        // Een balk zonder waarde en een oordeel mét waarde horen niet samen.
        var heeftWaarde = (u.waarde !== null && u.waarde !== undefined);
        if (heeftWaarde && m.pos === null) scheef.push(u.naam + ': er is ' + u.waarde + ' gemeten maar het scherm tekent geen balk');
        if (!heeftWaarde && m.pos !== null) scheef.push(u.naam + ': niets gemeten maar het scherm tekent wél een balk op ' + m.pos);
      });

      if (scheef.length)
        return { staat: 'FOUT', detail: scheef.length + ' proef/proeven worden op het scherm anders getoond dan hier geboekt: ' +
          scheef.join(' | ') + ' — er is een tweede oordeel ontstaan' };

      // De chips mogen niets tonen dat blok 5 niet dekt.
      //
      // DEZE AANROEP HEET SINDS DE HERBOUW `ronde()` EN NIET MEER `issuebaan()`,
      // en dat verschil kostte een run. Bij het herbouwen van het scherm is de
      // functie hernoemd; deze regel niet. Geen enkele poort ving dat: node
      // kent PLMeetkamer niet, en de browserproef draait blok 5 niet. De
      // eerste die het merkte was de proef zelf, op productie, met
      // "PLMeetkamer.issuebaan is not a function".
      //
      // Dat is precies waar deze proef voor bedoeld is, dus het systeem werkte
      // — maar een ronde te laat. De les staat in §11: een hernoeming is
      // mechanisch werk, en mechanisch werk hoort in een eigen commit waarin
      // je álle aanroepers langsloopt.
      if (typeof PLMeetkamer.ronde !== 'function')
        return { staat: 'FOUT', detail: 'PLMeetkamer.ronde() bestaat niet — het scherm en deze proef zijn uit de pas gelopen (#246)' };

      var baan = PLMeetkamer.ronde(s);
      var chips = baan.deze || [];
      var bekend = {};
      s.proeven.forEach(function (p) { if (p.issue) bekend[p.issue] = 1; });
      (s.opdracht.proeven || []).forEach(function (p) { if (p.issue) bekend[p.issue] = 1; });
      var verzonnen = chips.filter(function (b) { return !bekend[b.issue]; }).map(function (b) { return b.issue; });
      if (verzonnen.length)
        return { staat: 'FOUT', detail: 'het scherm toont ' + verzonnen.length + ' issue(s) die in geen enkele lijst staan: ' +
          verzonnen.join(', ') + ' — dat is een tweede lijst aan het ontstaan' };

      return { staat: 'ok', detail: s.uitslagen.length + ' proef/proeven en ' + chips.length +
        ' issue(s) staan op het scherm precies zoals ze hier geboekt worden (' +
        baan.bewaking + ' meelopend als bewaking)' };
    }
  },

  // ── na een rendercrash vanzelf opnieuw verbinden (#229, 24-09-2026) ──
  // Drie paden herverbinden vanzelf en alle drie lezen `pl_autoconn`. Tot
  // 24-09 zette niets die vlag, en moest er na elke rendercrash met de hand op
  // Verbinden gedrukt worden. Deze proef kijkt op het toestel zelf: ben je nu
  // verbonden, dan hoort de vlag er te staan.
  {
    issue: '#229',
    naam: 'Een verbinding onthoudt dat hij terug moet komen',
    waarom: 'Zonder die vlag slapen alle drie de herverbindpaden: na een rendercrash, na een dode socket en na terugkeer uit de achtergrond staat de meting stil tot iemand op Verbinden drukt.',
    proef: async function () {
      var verbonden = (typeof connected !== 'undefined') && !!connected;
      var demo = (typeof demoMode !== 'undefined') && !!demoMode;
      if (!verbonden || demo)
        return { staat: 'LET OP', detail: 'niet met een echte adapter verbonden' + (demo ? ' (demo)' : '') + ' — dan is er niets te onthouden. Verbind en draai opnieuw.' };
      var vlag = null;
      try { vlag = localStorage.getItem('pl_autoconn'); }
      catch (e) { return { staat: 'FOUT', detail: 'de opslag is niet leesbaar, dus na een herlaad weet de app niet dat hij verbonden was: ' + ((e && e.message) || e) }; }
      if (vlag !== '1')
        return { staat: 'FOUT', detail: 'verbonden, maar pl_autoconn staat niet op 1 (' + vlag + ') — na een rendercrash of een dode socket komt de verbinding niet vanzelf terug (#229)' };
      return { staat: 'ok', detail: 'verbonden en de vlag staat. Of hij na een crash ook werkelijk vanzelf terugkomt, toets je met de proefcrash: druk daarna nergens op en kijk of er "Automatisch herverbinden..." in het logboek komt.' };
    }
  },

  // ── het begin van een analyse (#290, 24-09-2026) ──
  // Vóór elke AI-aanroep kwamen vier vragen, ook vóór de oorzakenlijst van de
  // AI-monteur, en terug annuleerde niet. Nu: geen vragen (tenzij de Config
  // `feat_voorvragen` aanzet), de app geeft zelf mee wat hij gemeten heeft, en
  // het meetscherm biedt "gebruik de meting" of "nog even meten" met annuleren.
  {
    issue: '#290',
    naam: 'Een analyse begint met de meting, niet met vragen',
    waarom: 'Vier vragen vóór elke analyse werden als storend weggeklikt — en wegklikken liet de betaalde analyse toch lopen.',
    proef: async function () {
      if (typeof _plVoorvragenAan !== 'function' || !window.PLVerzamel)
        return { staat: 'FOUT', detail: 'het nieuwe begin van een analyse ontbreekt (_plVoorvragenAan of PLVerzamel) (#290)' };
      var aan = false;
      try { aan = _plVoorvragenAan(); } catch (e) { return { staat: 'FOUT', detail: 'de vragenschakelaar gaf een fout: ' + ((e && e.message) || e) }; }
      var regel = '';
      try { regel = (window._plMeetcontext === null && typeof plMeetcontextPromptLine === 'function') ? plMeetcontextPromptLine() : ''; }
      catch (e) { console.warn('Testrun: meetcontextregel niet leesbaar (#290)', e); }
      if (aan)
        return { staat: 'LET OP', detail: 'de vragen staan AAN via de Config (feat_voorvragen) — dan komen ze vóór elke analyse, zoals vóór #290. Een keuze, geen fout.' };
      return { staat: 'ok', detail: 'geen vragen vóór een analyse; de AI krijgt ' +
        (regel ? 'wat de app zelf vaststelde (' + regel.trim().split('\n').length + ' regel(s))' : 'nog niets uit de meting — er is nog te weinig gemeten') +
        '. Open de AI-monteur, kies een oorzaak en kijk of het verzamelscherm met "Sluiten zonder AI" komt.' };
    }
  },

  // ── na een crash hervatten zonder vragen (#229, 24-09-2026) ──
  // Op 24-09 om 19:08 verbond de app na een rendercrash vanzelf, en liep hij
  // daarna de hele eerste-keer-flow door: vier tikken tijdens het rijden. Nu
  // kiest een automatische herverbinding zelf wat de vorige keer gold. Deze
  // proef leest de laatste hervatting van deze sessie terug.
  {
    issue: '#229',
    naam: 'Een automatische herverbinding hervat zonder vragen',
    waarom: 'Kenteken, protocol en "voertuig bekend?" bevestigen tijdens het rijden is onmogelijk; dan staat de meting stil tot iemand stopt.',
    proef: async function () {
      var h = window._plLaatsteHervat;
      if (!h)
        return { staat: 'LET OP', detail: 'deze sessie is er niet hervat — doe de proefcrash (Admin → Test: rendercrash) of trek de adapter even, raak daarna niets aan, en draai deze proef opnieuw' };
      var hoeLang = Math.round((Date.now() - h.t) / 60000);
      if (h.sensoren === 0)
        return { staat: 'FOUT', detail: 'hervat na ' + h.reden + ' met NUL sensoren aan — de meting staat stil tot iemand er met de hand een paar aanzet (#229)' };
      if (h.s > 60)
        return { staat: 'LET OP', detail: 'hervat na ' + h.reden + ', maar dat duurde ' + h.s + ' s (' + hoeLang + ' min geleden) — zonder vragen, wel traag. Kijk in de BT-log welke stap de tijd kostte.' };
      return { staat: 'ok', detail: 'hervat na ' + h.reden + ' in ' + h.s + ' s, zonder één tik, met ' + h.sensoren + ' sensoren uit ' + h.bron + ' (' + hoeLang + ' min geleden).' };
    }
  },

  // ── de vragen van een opdracht komen in beeld (#283, 24-09-2026) ──
  // Tot 24-09 werden ze gekeurd en daarna door niemand gelezen. Nu staan ze
  // in de meetkamer onder het oordeel, en gaan de antwoorden mee met
  // verzenden. Deze proef legt het scherm tegen de opdracht die nu gekozen is.
  {
    issue: '#283',
    naam: 'De vragen van de gekozen opdracht staan in de meetkamer',
    waarom: 'Een vraag die niemand ziet wordt niet beantwoord, en een opdracht die op dat antwoord leunt sluit dan op de getallen alleen — zonder dat iemand het merkt.',
    proef: async function () {
      if (!window.PLOpdracht || typeof PLOpdracht.antwoordTekst !== 'function')
        return { staat: 'FOUT', detail: 'PLOpdracht.antwoordTekst ontbreekt — de antwoorden gaan niet mee naar de tabel (#283)' };
      if (!window.PLMeetkamer || typeof PLMeetkamer._vragen !== 'function' || typeof PLMeetkamer.antwoord !== 'function')
        return { staat: 'FOUT', detail: 'de meetkamer kan de vragen niet tonen — ze blijven onzichtbaar zoals vóór #283' };
      var o = null;
      try { o = PLOpdracht.actief(); }
      catch (e) { return { staat: 'FOUT', detail: 'de gekozen opdracht is niet te lezen: ' + ((e && e.message) || e) }; }
      if (!o) return { staat: 'LET OP', detail: 'er is geen opdracht gekozen — kies er een in de meetkamer om dit te toetsen' };
      var vr = o.vragen || [];
      if (!vr.length) return { staat: 'LET OP', detail: '"' + o.naam + '" heeft geen vragen — dan is er niets te tonen, en dat klopt' };
      var h = PLMeetkamer._vragen({ opdracht: o });
      var mist = vr.filter(function (v) { return h.indexOf(v.id) < 0; });
      if (mist.length)
        return { staat: 'FOUT', detail: mist.length + ' van de ' + vr.length + ' vragen staan niet op het scherm (' +
          mist.map(function (v) { return v.id; }).join(', ') + ') (#283)' };
      return { staat: 'ok', detail: 'alle ' + vr.length + ' vragen van "' + o.naam + '" staan in de meetkamer. Nu: ' +
        PLOpdracht.antwoordTekst(o) + '. Wat er gekozen is gaat mee met verzenden.' };
    }
  },

  // ── "Welk onderdeel?" keurt een gezonde motor niet meer af (#232, 23-09-2026) ──
  // De MAF-regel stond op 2–7 g/s voor elke motor en elk toerental. Gemeten op
  // een gezonde 2,0 liter: 0,8–1,7 g/s stationair (dus "te laag") en 91 g/s
  // vol gas (dus "te hoog"). Nu: alleen warm stationair, per liter
  // motorinhoud, en zonder bekende motorinhoud geen oordeel.
  //
  // Deze proef legt de regel op wat de auto NU doet. Hij kan niet weten of de
  // auto gezond is — dat weet jij. Staat er "past niet" op een auto zonder
  // klachten, dan is #232 niet opgelost; staat er een getal per liter binnen
  // de band, dan is dat de meting die hem sluit.
  {
    issue: '#232',
    naam: 'Welk onderdeel? — de luchtmassaregel past bij deze motor',
    waarom: 'Een regel die elke gezonde motor afkeurt wijst de gebruiker een onderdeel aan dat niets mankeert. Dat is erger dan geen oordeel: het kost geld.',
    proef: async function () {
      if (!window.PLOnderdeel || typeof PLOnderdeel.motorLiters !== 'function' || typeof PLOnderdeel.context !== 'function')
        return { staat: 'FOUT', detail: 'PLOnderdeel.motorLiters ontbreekt — de MAF-regel oordeelt weer zonder motorinhoud (#232)' };
      var l = PLOnderdeel.motorLiters();
      if (l === null)
        return { staat: 'LET OP', detail: 'de motorinhoud van dit voertuig is niet bekend (geen cilinderinhoud, geen "2.0" in de motornaam) — ' +
          'de luchtmassaregel geeft dan bewust geen oordeel. Vul het voertuig aan om hem te laten meedoen.' };
      var regel = null;
      (PLOnderdeel._regels || []).forEach(function (r) {
        (r.vc || []).forEach(function (v) { if (/^Luchtmassa stationair/.test(v.tekst)) regel = v; });
      });
      if (!regel) return { staat: 'FOUT', detail: 'de luchtmassaregel staat niet meer in de lijst van "Welk onderdeel?" (#232)' };
      var c = PLOnderdeel.context();
      var maf = (typeof pidVals !== 'undefined' && pidVals) ? pidVals['0110'] : undefined;
      var oordeel = regel.test(c);
      if (oordeel === null)
        return { staat: 'LET OP', detail: 'geen oordeel op dit moment — de regel kijkt alleen naar een warme motor (≥70 °C) stationair (≤1000 tpm, stilstand). ' +
          'Nu: ' + (c.rpm === null ? '?' : Math.round(c.rpm)) + ' tpm, ' + (c.ect === null ? '?' : Math.round(c.ect)) + ' °C, ' +
          (maf === undefined ? 'geen MAF' : maf + ' g/s') + '. Draai de proef warm en stationair om #232 te toetsen.' };
      var perL = (Number(maf) / l).toFixed(2);
      if (oordeel === true)
        return { staat: 'LET OP', detail: 'de regel zegt "past niet": ' + maf + ' g/s op ' + l + ' liter = ' + perL + ' g/s per liter (band 0,2–2,5). ' +
          'Heeft deze auto geen klachten, dan is #232 NIET opgelost — noteer dit getal bij het issue.' };
      return { staat: 'ok', detail: maf + ' g/s op ' + l + ' liter = ' + perL + ' g/s per liter, warm stationair — binnen de band 0,2–2,5, geen verdenking. ' +
        'Op een gezonde motor is dit de meting die #232 sluit.' };
    }
  },

  // ── de ontstekingsgrens volgt een gezonde motor (#231, 23-09-2026) ──
  // Gemeten op 23-09: tijdens het rijden −10,5, −12 en −20°, op een motor
  // zonder klachten. De regel noemde onder −5° de distributieketting. Nu pas
  // bij een warme motor en pas onder −25°; het gebruikelijke bereik in de
  // datatabel volgt mee.
  {
    issue: '#231',
    naam: 'Welk onderdeel? — de ontstekingsgrens laat een gezonde rit door',
    waarom: 'Terugnemen van de ontsteking onder belasting is normaal klopregeling. Een grens die dat "ketting" noemt, stuurt iemand naar de duurste reparatie aan de motor.',
    proef: async function () {
      if (typeof PID_LET_OP === 'undefined' || !PID_LET_OP['010E'])
        return { staat: 'FOUT', detail: 'PID_LET_OP[010E] ontbreekt — het gebruikelijke bereik van de ontsteking is weg' };
      var grens = PID_LET_OP['010E'].min;
      if (grens > -20)
        return { staat: 'FOUT', detail: 'het gebruikelijke bereik begint weer bij ' + grens + '° — de −20° van 23-09 heet dan weer ongebruikelijk (#231)' };
      var rit = (window.PLRit && typeof PLRit.per === 'function') ? PLRit.per()['010E'] : null;
      if (!rit || !rit.n)
        return { staat: 'LET OP', detail: 'de ontsteking (010E) is deze rit niet gemeten — zet hem aan en rijd met wat belasting om #231 te toetsen' };
      var laagst = Math.round(rit.min * 10) / 10;
      if (laagst < -25)
        return { staat: 'LET OP', detail: 'de laagste ontsteking deze rit was ' + laagst + '° (' + rit.n + ' metingen) — onder de nieuwe grens van −25°. ' +
          'Was de motor toen warm en heeft hij geen klachten, dan is ook −25 te krap: noteer dit getal bij #231. ' +
          '(Koud, vlak na de start, is dit normaal: de regel kijkt dan niet.)' };
      return { staat: 'ok', detail: 'laagste ontsteking deze rit ' + laagst + '°, hoogste ' + (Math.round(rit.max * 10) / 10) + '° over ' + rit.n +
        ' metingen — binnen de grens van −25°, dus geen ketting-verdenking. Zat daar rijden met belasting bij, dan sluit dit #231.' };
    }
  },

  // ── foutcodes uitlezen vanuit "Welk onderdeel?" (#233, 23-09-2026) ──
  // Het paneel zei "de foutcodes zijn nog niet uitgelezen" en liet je dan
  // zoeken waar dat kon. Nu staat de knop eronder. Wat deze proef toetst is de
  // voorwaarde voor die knop: hij staat er precies als er uitgelezen KAN worden.
  {
    issue: '#233',
    naam: 'Welk onderdeel? — de uitleesknop staat er als het kan',
    waarom: 'Een knop die er staat zonder verbinding doet niets; een knop die ontbreekt terwijl het kan, laat het oordeel rusten op alleen live waarden.',
    proef: async function () {
      if (!window.PLOnderdeel || typeof PLOnderdeel.scanMogelijk !== 'function' || typeof PLOnderdeel.scan !== 'function')
        return { staat: 'FOUT', detail: 'PLOnderdeel.scan ontbreekt — het paneel verwijst weer naar een knop elders (#233)' };
      var kan = PLOnderdeel.scanMogelijk();
      var verbonden = (typeof connected !== 'undefined' && !!connected) || (typeof demoMode !== 'undefined' && !!demoMode);
      if (kan !== verbonden)
        return { staat: 'FOUT', detail: 'de knop zegt "' + (kan ? 'kan' : 'kan niet') + '" terwijl de adapter ' + (verbonden ? 'verbonden' : 'niet verbonden') + ' is (#233)' };
      if (!verbonden)
        return { staat: 'LET OP', detail: 'niet verbonden — dan hoort de knop er niet te staan, en dat klopt. Verbind en open "Welk onderdeel?" om hem te zien.' };
      return { staat: 'ok', detail: 'verbonden, dus de knop staat onder "nog niet uitgelezen". Druk er één keer op in het paneel: ' +
        'de zin moet verdwijnen en het aantal foutcodes moet erin staan. Dan is #233 dicht.' };
    }
  },

  // ── blijft de meting in beeld als je wegschakelt? (#228, 17-09-2026) ──
  // De split-screenproef van vanavond wees zichtbaarheid aan als de trekker:
  // zichtbaar en niet vooraan liep de lus 99 s door zonder één gat, verborgen
  // viel hij na ~60 s stil. Picture-in-picture houdt de WebView zichtbaar, en
  // dat is wat deze ronde erbij is gekomen.
  //
  // Het VENSTER zelf kan deze proef niet aanzetten — dat mag alleen op het
  // moment dat de gebruiker wegschakelt, en dat moment is hier niet. Wat hij
  // wél kan is de stille fout vangen die eromheen zit: de app denkt dat de
  // vlag aanstaat en de native kant houdt iets anders vast. Dan gebeurt er bij
  // het wegschakelen niets, en niets zegt waarom.
  {
    issue: '#228',
    naam: 'De meting blijft in beeld: app en schil houden dezelfde vlag vast',
    waarom: 'PiP wordt aangevraagd door de native kant op een moment dat JavaScript niet kan halen. Staat daar een andere vlag dan de app denkt, dan valt de meetlus stil zoals voorheen en is er geen enkel spoor.',
    proef: async function () {
      if (!window.PLPip || typeof PLPip.besluit !== 'function')
        return { staat: 'FOUT', detail: 'PLPip ontbreekt — de meting valt dan stil zodra je wegschakelt, precies zoals vóór #228' };

      var b = PLPip.besluit(PLPip.feiten());

      // Uitgezet in de Config is een besluit van een mens en geen storing.
      if (b.sleutel === 'uit')
        return { staat: 'LET OP', detail: 'picture-in-picture staat uit in de Config (`feat_pip`) — ' +
          'de app gaat bij wegschakelen gewoon naar de achtergrond en de meetlus valt na ~60 s stil (#228). Dat is hier een keuze, geen fout.' };

      if (!PLPip.beschikbaar())
        return { staat: 'LET OP', detail: 'deze schil heeft geen picture-in-picture — browser, PWA of een APK van vóór deze ronde. ' +
          'Het besluit zegt: ' + b.reden };

      var st = null;
      try { st = await PLPip.status(); }
      catch (e) { return { staat: 'FOUT', detail: 'de schil antwoordt niet op de PiP-status: ' + ((e && e.message) || e) }; }
      st = st || {};

      if (!st.ondersteund)
        return { staat: 'LET OP', detail: 'dit toestel of deze Android-versie kent picture-in-picture niet (nodig: Android 8+ met de systeemfunctie). ' +
          'Dan blijft voor #228 alleen een native meetlus over.' };

      // DE STILLE BREUK. De app heeft een besluit genomen en náár native
      // gestuurd; houdt native iets anders vast, dan is die vlag onderweg
      // blijven hangen. Alles blijft werken, er komt geen melding, en het
      // enige wat je merkt is dat het venster niet opkomt — tijdens een rit,
      // als je er niet naar kijkt.
      if (!!st.gewenst !== !!b.aan)
        return { staat: 'FOUT', detail: 'de app besloot "' + (b.aan ? 'aan' : 'uit') + '" (' + b.reden + ') ' +
          'maar de schil houdt "' + (st.gewenst ? 'aan' : 'uit') + '" vast — de vlag is niet aangekomen, ' +
          'dus bij wegschakelen gebeurt er iets anders dan de app denkt (#228)' };

      if (b.aan)
        return { staat: 'ok', detail: 'PiP staat scherp: er wordt gemeten en de schil weet het. ' +
          'Schakel je nu weg, dan blijft het kleine venster in beeld en loopt de lus door. ' +
          'Dat dit ook werkelijk zo is, is een vraag voor de rit — hier staat alleen dat beide kanten hetzelfde vasthouden.' };

      return { staat: 'LET OP', detail: 'PiP staat klaar maar is nu niet gewenst: ' + b.reden +
        '. App en schil zijn het eens, dus de keten is heel — er is alleen niets te meten.' };
    }
  },

  // ── komt de live-log werkelijk aan? (#235, 17-09-2026) ──
  // Het live-pad is op 17-09 opgeleverd en dezelfde avond nagemeten aan de
  // andere kant van de lijn: de logtabel telde 722 regels en NUL daarvan
  // kwam van een testrun. Gewone regels kwamen wél binnen ("Data stabiel",
  // 18:44), dus het kanaal deed het en de testrun kwam er niet doorheen.
  //
  // Waarom dat kon blijven staan: flushAirtable() meldde een mislukte batch
  // alleen met console.warn — op een telefoon, tijdens een rit, waar niemand
  // bij kan. De run zag niets, het verslag zei niets, en wie meekeek zag een
  // lege tabel zonder te weten of er niets gemeten was of niets aangekomen.
  //
  // Deze proef toetst het enige dat van binnenuit te toetsen is: zet een
  // regel in de buffer, dwing de verzending af, en vraag wat de Worker
  // antwoordde. Wat hij NIET bewijst staat in de uitslag zelf — zie de
  // tekst bij 'ok'.
  {
    issue: '#235',
    naam: 'De live-log komt werkelijk aan in D1',
    waarom: 'Een kanaal dat stil faalt is erger dan geen kanaal: je leest een lege tabel als "niets bijzonders" terwijl er niets is aangekomen. Op 17-09 was dat de toestand, en van 20-09 17:12 tot 22-09 opnieuw — toen gaf de Worker HTTP 200 met {ok:true} terug zonder iets weg te schrijven, en keurde deze proef dat goed omdat hij de status las en niet de inhoud. Sinds #262 telt alleen het aantal regels dat de Worker zegt te hebben weggeschreven.',
    proef: async function () {
      if (typeof logToSheets !== 'function')
        return { staat: 'FOUT', detail: 'logToSheets ontbreekt — de testrun schrijft dan niets meer weg en niemand kan tijdens de rit meekijken (#235)' };
      if (typeof plLiveLogStatus !== 'function')
        return { staat: 'FOUT', detail: 'plLiveLogStatus ontbreekt — dan is de uitkomst van een verzending weer onzichtbaar en is dit precies de toestand van 17-09' };
      if (typeof flushAirtable !== 'function')
        return { staat: 'FOUT', detail: 'flushAirtable ontbreekt — de buffer loopt dan vol zonder dat er ooit iets verstuurd wordt' };
      if (typeof AIRTABLE_URL === 'undefined' || !AIRTABLE_URL)
        return { staat: 'LET OP', detail: 'er is geen logadres ingesteld (AIRTABLE_URL leeg) — het kanaal is hier niet te toetsen. Dat is geen fout van de meting maar een ontbrekende voorwaarde.' };

      // De uitkomst van vóór deze proef onthouden: zonder dat zou een oude
      // geslaagde verzending van tien minuten geleden deze proef groen maken.
      var voor = plLiveLogStatus();

      if (!_liveSchrijf('info', 'blok 5: proefregel — komt de live-log aan?'))
        return { staat: 'FOUT', detail: 'de proefregel kwam niet eens in de buffer — logToSheets weigerde hem, en dan gaat er tijdens een rit ook niets weg' };

      // logToSheets() is async (het pseudonimiseren van de VIN duurt een tick)
      // en wordt bewust niet afgewacht door de aanroeper. Even ruimte geven,
      // anders is de buffer nog leeg als de verzending wordt afgedwongen.
      await _wacht(300);
      try { await flushAirtable(); } catch (e) {
        return { staat: 'FOUT', detail: 'flushAirtable wierp een fout in plaats van hem vast te leggen: ' + ((e && e.message) || e) };
      }

      // Was de buffer net door de eigen timer geleegd, dan komt de uitslag van
      // díé verzending — vandaar wachten op een uitkomst die nieuwer is dan
      // wat er bij binnenkomst stond, en niet op de eerste de beste.
      var na = plLiveLogStatus(), gewacht = 0;
      while ((!na || (voor && na.tijd === voor.tijd)) && gewacht < 5000) {
        await _wacht(200); gewacht += 200; na = plLiveLogStatus();
      }
      if (!na || (voor && na.tijd === voor.tijd))
        return { staat: 'FOUT', detail: 'de proefregel staat in de buffer maar er kwam binnen ' +
          Math.round((gewacht + 300) / 100) / 10 + ' s geen enkele uitslag terug — er wordt dus niets verstuurd' };

      // `geschreven` komt uit het antwoord van de Worker en is het aantal
      // rijen dat werkelijk in logregels stond. Bij Airtable kon dat niet
      // nagegaan worden — een onbekende veldnaam werd dáár pas geweigerd —
      // maar een INSERT in D1 slaagt of klapt, dus dit getal is nu echt bewijs.
      if (na.ok && Number(na.geschreven) >= na.aantal)
        return { staat: 'ok', detail: 'de Worker schreef ' + na.geschreven + ' van ' + na.aantal +
          ' regel(s) weg in D1 (HTTP ' + na.status + '). Een INSERT slaagt of klapt, dus deze regel staat er ook werkelijk.' };

      // Wél aangenomen, niet weggeschreven. Dat is de toestand van 20-09 en
      // de reden dat deze proef bestaat; hij mag dus nooit groen zijn.
      if (na.ok)
        return { staat: 'FOUT', detail: 'de Worker antwoordde ok (HTTP ' + na.status + ') maar schreef ' +
          (na.geschreven == null ? 'niet hoeveel regels hij wegschreef — dan is er geen bewijs dat er iets in de tabel staat' :
           na.geschreven + ' van de ' + na.aantal + ' regels weg') + '. Tijdens een rit ziet niemand daar iets van.' };

      if (na.status === 401 || na.status === 403)
        return { staat: 'LET OP', detail: 'de Worker weigerde de regel (HTTP ' + na.status + ') — geen geldig app-token in deze sessie. ' +
          'Dat is een ontbrekende voorwaarde en geen kapot kanaal; log in en draai dit blok opnieuw.' };

      return { staat: 'FOUT', detail: 'de live-log komt niet aan: ' +
        (na.status ? 'HTTP ' + na.status : 'netwerkfout') + (na.fout ? ' — ' + na.fout : '') +
        '. ' + na.aantal + ' regel(s) staan terug in de buffer; tijdens een rit ziet niemand daar iets van.' };
    }
  },

  // ── klopt de aandrijfbalk met wat de sensoren zeggen? ──
  // De balk bovenin de Live-weergave zegt in één regel wat de auto doet. Dat
  // leest als een feit, dus hij moet het waar kunnen maken uit de waarden die
  // op datzelfde moment binnenkomen. test-aandrijving.js toetst de
  // toestandsmachine op verzonnen monsters; dit toetst hem op een echte auto,
  // en vergelijkt bovendien wat de MODULE zegt met wat er in de DOM staat.
  //
  // Zonder bevinding is de opbrengst de waarneming zelf: die regel is precies
  // wat de rit moet opleveren voor de i-stop-vraag van deze CX-5 — is er een
  // start/stop-stop gezien, en wat deed 011F daarbij.
  {
    issue: '§11',
    naam: 'De aandrijfbalk beweert niets dat de meetwaarden niet dragen',
    waarom: 'Een toestandsregel bovenin het scherm leest als een feit. Zegt hij "start/stop actief" terwijl de motor draait, dan is alles eronder ook verdacht.',
    proef: function () {
      if (!window.PLAandrijving || !window.PLAandrijfbalk)
        return { staat: 'FOUT', detail: 'PLAandrijving of PLAandrijfbalk ontbreekt \u2014 de balk is niet geladen' };
      var r = PLAandrijving.laatste();
      if (!r) return { staat: 'LET OP', detail: 'nog geen aandrijfstand \u2014 updateEVMode() is nog niet langsgekomen' };

      var D = PLAandrijving.drempels, fout = [];
      var rpm = (typeof pidVals !== 'undefined') ? pidVals['010C'] : undefined;
      var spd = (typeof pidVals !== 'undefined') ? pidVals['010D'] : undefined;

      if ((r.toestand === 'DRAAIT_STIL' || r.toestand === 'DRAAIT_RIJDT') && rpm !== undefined && rpm <= D.rpmUit)
        fout.push('toont "' + r.label + '" bij ' + rpm + ' tpm');
      if ((r.toestand === 'STARTSTOP' || r.toestand === 'UIT_VOOR_START') && rpm !== undefined && rpm >= D.rpmAan)
        fout.push('toont "' + r.label + '" terwijl de motor op ' + rpm + ' tpm draait');
      if (r.toestand === 'ACCU_RIJDT' && spd !== undefined && spd < D.vStil)
        fout.push('toont "rijdt op accu" bij ' + spd + ' km/h');
      if (r.toestand === 'STARTSTOP' && !r.heeftGedraaid)
        fout.push('toont start/stop terwijl de motor deze sessie nooit gedraaid heeft');

      var el = document.getElementById('aandrijfBalk');
      if (!el) fout.push('het element aandrijfBalk staat niet in de pagina');
      else if (el.getAttribute('data-toestand') && el.getAttribute('data-toestand') !== r.toestand)
        fout.push('het scherm toont ' + el.getAttribute('data-toestand') + ' terwijl de module ' + r.toestand + ' zegt');

      if (fout.length) return { staat: 'FOUT', detail: fout.join('; ') };

      var d = 'nu: ' + r.label + ' (' + r.zekerheid + ')' +
        ', motor heeft gedraaid: ' + (r.heeftGedraaid ? 'ja via ' + r.bronGedraaid : 'nee') +
        ', 011F: ' + (r.looptijd === null || r.looptijd === undefined ? 'niet beschikbaar' : r.looptijd + ' s') +
        ', hybride bewezen: ' + (r.bewijstHybride ? 'ja' : 'nee');
      if (r.toestand === 'STARTSTOP') return { staat: 'ok', detail: 'START/STOP GEZIEN \u2014 ' + d };
      return { staat: 'LET OP', detail: d + '. Een start/stop-stop is deze sessie nog niet waargenomen \u2014 dat vraagt stilstand met een warme motor.' };
    }
  },

  // \u2500\u2500 weet deze auto volgende rit nog wat hij liet zien? (#225) \u2500\u2500
  // De aandrijfstatus hierboven is een SESSIElaag: bij elke herverbinding
  // begint hij terecht op nul, want "de motor heeft gedraaid" zegt niets over
  // de volgende rit. Maar "deze auto HEEFT start/stop" is geen eigenschap van
  // de meting \u2014 die verandert nooit, en werd tot vandaag toch elke sessie
  // weggegooid. Dat is de reden dat het meetcontextvenster die vraag elke keer
  // opnieuw stelde.
  //
  // test-waarneming.js toetst het register en de promotie op verzonnen
  // monsters. Wat daar niet te maken is, is een ECHTE auto met een echte
  // sleutel en een echte opslag: of `vehicleInfo` op tijd een VIN draagt, of
  // localStorage op dit toestel werkt, en of de waarneming van vorige week er
  // nog staat. Dat is precies wat hier gemeten wordt.
  {
    issue: '#225',
    naam: 'Wat deze auto liet zien, weet hij volgende rit nog',
    waarom: 'Een eigenschap van de auto die als eigenschap van de meting bewaard wordt, is elke sessie opnieuw een vraag aan de gebruiker \u2014 vlak v\u00f3\u00f3r een betaalde analyse.',
    proef: function () {
      if (!window.PLWaarneming || typeof PLWaarneming.lees !== 'function')
        return { staat: 'FOUT', detail: 'PLWaarneming ontbreekt \u2014 dan begint elke sessie weer op nul en komt de start/stop-vraag elke rit terug (#225)' };

      var w = PLWaarneming.lees('startstop');
      var stand = (window.PLAandrijving && typeof PLAandrijving.laatste === 'function') ? PLAandrijving.laatste() : null;

      // DE STILLE BREUK. De sessie heeft de stop gezien en het register weet
      // het niet: dan is de promotie in tik() eruit gevallen. Alles blijft
      // werken, de balk klopt, en het enige wat je merkt is dat de vraag
      // volgende rit terug is \u2014 en dat merk je pas volgende rit.
      if (stand && stand.startStopGezien && w.status !== 'gezien')
        return { staat: 'FOUT', detail: 'de sessie zag een start/stop-stop maar het register staat op "' + w.status +
          '" \u2014 de promotie van sessie naar auto is eruit gevallen (#225)' };

      var sleutel = PLWaarneming.sleutel();
      var waar = !sleutel ? 'nog geen auto herkend (geen VIN en geen merk), dus dit blijft bij deze sessie'
        : (w.reikwijdte === 'auto' ? 'vastgelegd bij deze auto' : 'de opslag doet het niet \u2014 het blijft bij deze sessie');

      if (w.status === 'gezien') {
        var b = w.bewijs || {};
        return { staat: 'ok', detail: 'start/stop: GEZIEN op ' + new Date(w.wanneer).toLocaleString('nl-NL') +
          ' (' + (w.bron || 'onbekende bron') + ')' +
          (b.looptijd != null ? ', 011F ' + b.looptijd + ' s' : '') +
          (b.rpm != null ? ', ' + b.rpm + ' tpm' : '') + ' \u2014 ' + waar +
          '. Het venster stelt hier "ja" voor, ook als deze rit geen stop oplevert.' };
      }
      if (w.status === 'weerlegd')
        return { staat: 'ok', detail: 'start/stop: door de gebruiker weerlegd op ' + new Date(w.wanneer).toLocaleString('nl-NL') +
          ' \u2014 ' + waar + '. Een nieuwe waarneming van n\u00e1 dat moment wint alsnog.' };

      return { staat: 'LET OP', detail: 'over start/stop is op deze auto nog niets vastgelegd \u2014 ' + waar +
        '. Niet-weten is hier de juiste uitkomst: niets-zien bewijst niet dat de auto het niet heeft. Sta \u00e9\u00e9n keer stil met een warme motor en dit vult zichzelf.' };
    }
  },

  // ── wijst "Welk onderdeel?" alleen sensoren aan die écht zwijgen? ──
  // Gemeld met een schermafdruk erbij: brandstofpeil en afstand-met-MIL-aan
  // als "sterke aanwijzing — draadbreuk, stekker of sensor", op een auto waar
  // niets mis mee was. De oorzaak was een vaste drempel van 8 seconden over
  // sensoren die elke 60 seconden aan de beurt komen.
  //
  // test-onderdeel.js toetst die scheiding op verzonnen data. Wat daar niet
  // te maken is, is een échte pollronde met een échte bus eronder: wie er
  // wanneer aan de beurt was, hoeveel de bus stilstond voor een sweep, en
  // welke sensor deze auto werkelijk traag levert. Daarom deze proef, en
  // daarom draait hij op wat de app op dít moment zegt.
  //
  // Hij toetst geen broncode maar de uitkomst: elke sensor die de module als
  // uitgevallen aanwijst moet volgens het scheduler-register gevraagd zijn
  // zónder antwoord. Kan de module dat niet waarmaken, dan staat er een valse
  // verdenking op het scherm en is dat een FOUT — ook al draait alles verder.
  {
    issue: '§11',
    naam: 'Welk onderdeel wijst geen sensor aan die alleen op zijn beurt wacht',
    waarom: 'Deze tekst stuurt iemand naar de garage. Een sensor die binnen zijn eigen meettempo zwijgt is niet kapot.',
    proef: function () {
      if (!window.PLOnderdeel) return { staat: 'FOUT', detail: 'PLOnderdeel ontbreekt — het paneel is niet geladen' };
      var mist = ['stilteBeeld', 'beoordeel', 'railTreffers', 'dtcBron'].filter(function (k) {
        return typeof PLOnderdeel[k] !== 'function';
      });
      if (mist.length) return { staat: 'FOUT', detail: 'PLOnderdeel mist ' + mist.join(', ') };

      var b = PLOnderdeel.stilteBeeld();
      if (!b.register)
        return { staat: 'LET OP', detail: 'geen cadansregister (PLSched) — de module zwijgt dan over uitval, en dat is de bedoeling' };

      var S = window.PLSched, R = PLOnderdeel.cadansRegels(), fout = [];
      b.stil.forEach(function (x) {
        if (PLOnderdeel.tellers.has(x.pid))
          { fout.push(x.pid + ' is een teller van de ECU, geen sensor'); return; }
        var drempel = Math.max(R.min, S.interval(x.pid) * R.factor);
        var pog = S.laatstePoging(x.pid) || 0, ok = S.laatsteSucces(x.pid) || 0;
        if (!(S.dood(x.pid) || (pog > 0 && (pog - ok) > drempel * 0.5)))
          fout.push(x.pid + ' is aangewezen terwijl er sinds het laatste antwoord niet naar gevraagd is');
        if (x.stilMs <= drempel)
          fout.push(x.pid + ' is aangewezen na ' + Math.round(x.stilMs / 1000) + ' s stilte terwijl zijn eigen tempo ' +
            Math.round(drempel / 1000) + ' s toelaat');
      });
      if (fout.length)
        return { staat: 'FOUT', detail: 'valse verdenking: ' + fout.join('; ') };

      // De foutcodekant. Tot 16-09 las deze module een bron die niet bestaat
      // (window._laatsteDTC), en dan staat er nooit iets — precies het soort
      // stilte dat je niet ziet.
      var bron = PLOnderdeel.dtcBron();
      var echt = (typeof dtcCodes !== 'undefined' && Array.isArray(dtcCodes)) ? dtcCodes.length : null;
      if (echt !== null && bron.codes.length !== echt)
        return { staat: 'FOUT', detail: 'de module ziet ' + bron.codes.length + ' foutcodes terwijl de app er ' +
          echt + ' heeft — de DTC-bron is weer losgeraakt' };

      var verdacht = PLOnderdeel.beoordeel();
      var deel = verdacht.length ? (' Kandidaten: ' + verdacht.map(function (r) { return r.naam; }).join(', ') + '.') : '';
      return { staat: 'OK', detail: b.stil.length + ' als uitgevallen aangewezen, ' + b.levend.length +
        ' binnen hun tempo, ' + b.wacht.length + ' nog niet aan de beurt, ' + b.tellers.length +
        ' tellers overgeslagen, ' + PLOnderdeel.railTreffers().length + ' railtreffers.' +
        ' Foutcodes ' + (bron.gescand ? 'gelezen (' + bron.codes.length + ')' : 'nog niet uitgelezen') + '.' + deel };
    }
  },

  // ── #217: wat deed de boordspanning deze rit? ──
  // Na ritten met de goedkope kloon stonden er vier storingen tegelijk in de
  // auto (DSC, keyless, SCBS, parkeerrem). Vier onafhankelijke modules die
  // tegelijk klagen is het beeld van ONDERSPANNING en niet van een verstoorde
  // bus \u2014 en dan is dit de meting die het uitmaakt. Eén rit met deze proef
  // erin sluit #217, of laat zien dat de spanning het niet was.
  //
  // Twee bronnen, in die volgorde. Staat 0142 aangevinkt, dan komt het uit
  // PLRit.per() \u2014 dezelfde bron als blok 14, zodat er geen tweede telling
  // ontstaat. Staat hij niet aangevinkt (het normale geval: niemand zet de
  // accuspanning in zijn selectie), dan pakt de waakronde hem op en leest
  // deze proef PLWaak.historie(). Dat is precies waar die historie voor is.
  //
  // De grenzen komen uit PID_LET_OP en de PID-definitie, niet uit deze proef.
  // Een eigen tabel hier zou bewijzen over een geval dat niet bestaat \u2014 dat
  // is de fout die test-waakronde.js in zijn voorganger vond.
  {
    issue: '#217',
    naam: 'De boordspanning bleef binnen het laadbereik',
    waarom: 'Vier modules tegelijk in storing wijst op onderspanning; alleen een rit met een echte accu en dynamo meet dat.',
    proef: function () {
      var laag = null, hoog = null;
      try {
        var L = window.PID_LET_OP && window.PID_LET_OP['0142'];
        if (L) { laag = L.min; hoog = L.max; }
      } catch (e) { console.warn('PID_LET_OP onleesbaar bij de #217-proef', e); }
      if (laag === null)
        return { staat: 'FOUT', detail: 'PID_LET_OP["0142"] ontbreekt \u2014 dan is er geen laadbereik om tegen te toetsen' };

      var min, max, n = 0, bron = '';

      // 1. Aangevinkt? Dan telt blok 14 hem al mee.
      try {
        var e = (window.PLRit && PLRit.per) ? (PLRit.per() || {})['0142'] : null;
        var m = e ? _meetStand(e) : null;
        if (m && m.stand === 'gemeten') {
          min = e.min; max = e.max; n = e.n; bron = 'ritbeeld, ' + m.tekst;
        }
      } catch (e2) { console.warn('ritbeeld onleesbaar bij de #217-proef', e2); }

      // 2. Niet aangevinkt? Dan heeft de waakronde hem gelezen.
      if (min === undefined) {
        try {
          var h = (window.PLWaak && PLWaak.historie) ? PLWaak.historie() : [];
          var r = h.filter(function (x) { return x.pid === '0142'; })[0];
          if (r && typeof r.min === 'number') {
            min = r.min; max = r.max; n = r.n;
            bron = 'waakronde, ' + r.n + ' meting(en)';
          }
        } catch (e3) { console.warn('waakronde-historie onleesbaar bij de #217-proef', e3); }
      }

      if (min === undefined)
        return { staat: 'LET OP', detail: 'de boordspanning (0142) is deze rit niet gemeten \u2014 vink hem aan, ' +
          'of zet de waakronde aan, anders blijft #217 onbeantwoord' };

      var tekst = min + '\u2013' + max + ' V (' + bron + '), normaal is ' + laag + '\u2013' + hoog + ' V';

      // Onder de ondergrens is precies het beeld dat bij #217 hoort. Dat is
      // hier een BEVINDING en geen fout in de app: de app meet goed, de auto
      // doet iets. Vandaar LET OP met de uitleg erbij en niet FOUT.
      if (min < laag)
        return { staat: 'LET OP', detail: tekst + ' \u2014 de spanning zakte onder het laadbereik. ' +
          'Dat is het beeld waar #217 naar zoekt: te weinig spanning verklaart vier modules die tegelijk ' +
          'een storing vastleggen. Kijk of de storingen terugkomen zonder adapter in de stekker.' };
      if (max > hoog)
        return { staat: 'LET OP', detail: tekst + ' \u2014 de spanning liep boven het laadbereik uit; ' +
          'dat wijst eerder op de spanningsregelaar dan op de adapter (#217)' };

      return { staat: 'OK', detail: tekst + ' \u2014 binnen bereik over ' + n +
        ' meting(en); onderspanning is hiermee g\u00e9\u00e9n verklaring voor de storingen uit #217' };
    }
  },

  // ── kan de waakronde vertellen wat ze gemeten heeft? ──
  // De strook boven het raster toont de ronde die nú loopt; _lijst wordt bij
  // elke nieuweRonde() weggegooid. Tot 16-09 was dat álles wat er was, en dus
  // was "welke sensor lag drie rondes geleden buiten bereik" onbeantwoordbaar.
  // De historie is er sindsdien, maar die leeft in de draaiende app en niet in
  // de repo: alleen een rit kan zeggen of hij ook echt vult. Deze proef kijkt
  // niet of er iets ín staat (op een koude start hoort dat leeg te zijn) maar
  // of de haken bestaan en de vorm klopt — dat is wat het waakvenster nodig
  // heeft en wat stilletjes kan breken bij een wijziging aan PLWaak.
  {
    issue: '§11',
    naam: 'De waakronde geeft zijn sessiehistorie door',
    waarom: 'Het waakvenster leest PLWaak.historie(); breekt die vorm, dan staat het scherm leeg zonder foutmelding.',
    proef: function () {
      if (!window.PLWaak)   return { staat: 'FOUT', detail: 'PLWaak ontbreekt' };
      if (!window.PLWaakUI) return { staat: 'FOUT', detail: 'PLWaakUI ontbreekt — het waakvenster is niet geladen' };
      var mist = ['historie', 'ronde', 'sinds', 'lijst'].filter(function (k) {
        return typeof PLWaak[k] !== 'function';
      });
      if (mist.length)
        return { staat: 'FOUT', detail: 'PLWaak mist ' + mist.join(', ') + ' — het waakvenster kan niets tonen' };

      var h = PLWaak.historie();
      if (!Array.isArray(h)) return { staat: 'FOUT', detail: 'historie() gaf geen lijst terug' };

      // lijst() moet reden en tijd dragen; tot 16-09 deed hij dat niet en was
      // niet te zien WAAROM iets een bevinding was.
      var l = PLWaak.lijst();
      if (l.length && !('reden' in l[0] && 'tijd' in l[0]))
        return { staat: 'FOUT', detail: 'lijst() draagt geen reden/tijd — bevindingen zijn dan niet te duiden' };

      if (!h.length)
        return { staat: 'LET OP', detail: 'historie is leeg — de waakronde heeft deze sessie nog niets gemeten' +
          (PLWaak.actief() ? ' (hij staat wel aan; de eerste groep komt na ~12 s)' : ' (hij staat uit)') };

      var stuk = h.filter(function (r) { return !r.pid || typeof r.n !== 'number'; });
      if (stuk.length) return { staat: 'FOUT', detail: stuk.length + ' historieregels missen pid of telling' };

      var bev = h.filter(function (r) { return r.staat === 'let'; });
      return { staat: 'OK', detail: h.length + ' sensoren in de historie over ' + PLWaak.ronde() +
        ' rondes, ' + bev.length + ' nu buiten bereik' };
    }
  },

  // ── kan de bulk-analyse de opname terugvinden? ──
  // PLBulk schreef tot 16-09 alleen wég. Het leesluik (PLBulk.lees) is nieuw en
  // is het enige pad naar de opslag; valt dat om, dan staat het analysevenster
  // met een lege lijst zonder dat iemand het merkt. Een rit is de enige plek
  // waar er echt data in IndexedDB staat om dat op te toetsen.
  {
    issue: '§11',
    naam: 'De bulk-opname is terug te lezen en te analyseren',
    waarom: 'Zonder werkend leesluik toont de analyse een lege rit in plaats van een fout.',
    proef: async function () {
      if (!window.PLBulk)   return { staat: 'FOUT', detail: 'PLBulk ontbreekt' };
      if (!window.PLBulkUI) return { staat: 'FOUT', detail: 'PLBulkUI ontbreekt — het analysevenster is niet geladen' };
      if (typeof PLBulk.lees !== 'function')
        return { staat: 'FOUT', detail: 'PLBulk.lees ontbreekt — de analyse heeft geen pad naar de opslag' };
      if (typeof PLBulkUI._analyseer !== 'function')
        return { staat: 'FOUT', detail: 'PLBulkUI._analyseer ontbreekt' };

      var blokken;
      try { blokken = await PLBulk.lees(); }
      catch (e) { return { staat: 'FOUT', detail: 'lezen mislukt: ' + (e && e.message || e) }; }
      if (!Array.isArray(blokken)) return { staat: 'FOUT', detail: 'lees() gaf geen lijst terug' };
      if (!blokken.length)
        return { staat: 'LET OP', detail: 'geen opname in de opslag — de recorder heeft deze telefoon nog niet gedraaid' };

      var regels = [];
      blokken.forEach(function (b) { (b.regels || []).forEach(function (r) { regels.push(r); }); });
      if (!regels.length) return { staat: 'FOUT', detail: blokken.length + ' blokken zonder één regel erin' };

      var a = PLBulkUI._analyseer('proef', regels);
      if (a.regels !== regels.length)
        return { staat: 'FOUT', detail: 'analyse telde ' + a.regels + ' van ' + regels.length + ' regels' };

      var segs = Object.keys(a.segTel);
      if (!segs.length) return { staat: 'FOUT', detail: 'geen enkel segment herkend in ' + regels.length + ' regels' };

      var pidN = Object.keys(a.pids).length;
      return { staat: 'OK', detail: regels.length + ' regels over ' + blokken.length + ' blokken, ' +
        pidN + ' sensoren, ' + segs.length + ' segmentsoorten, ' + a.gaten + ' gatregels, ' +
        Math.round(a.afstandKm) + ' km' };
    }
  },

  // ── draagt de schil een pakketnaam die Play accepteert? ──
  // De inzending van 12-09 strandde op "Voer een geldige pakketnaam in". De
  // bouwketen bleek in orde; de naam zelf deugde niet. Er staan nu twee
  // poorten omheen (test-nativeschil.js en de bundelstap), maar allebei kijken
  // naar de BEDOELING in de repo. Dit is de enige plek die kijkt naar de schil
  // die op dit toestel staat te draaien — en dus de enige die kan zeggen of
  // deze rit op de nieuwe naam gemeten is of nog op de oude.
  //
  // De naam staat hier BEWUST niet letterlijk in. Dat zou een tweede waarheid
  // naast capacitor.config.json zijn, en dan is bij de volgende wijziging niet
  // te zien welke van de twee wint. Wat hier getoetst wordt is de vorm die
  // Play eist, plus dat de naam er überhaupt is.
  {
    issue: '§11',
    naam: 'De schil draagt een pakketnaam die Play accepteert',
    waarom: 'Alleen de draaiende schil weet zijn eigen pakketnaam; de repo kent alleen de bedoeling.',
    proef: function () {
      if (!window.PLSchil)
        return { staat: 'FOUT', detail: 'PLSchil ontbreekt — dan staat er geen schilgegeven in dit verslag' };
      var info = PLSchil.info();
      if (!info)
        return { staat: 'LET OP', detail: 'geen schilgegevens (' + PLSchil.reden() +
          ') — in een browser is er geen pakketnaam, dus hier valt niets te meten' };
      var id = info.id;
      if (!id)
        return { staat: 'FOUT', detail: 'App.getInfo() gaf geen id terug — een schil zonder pakketnaam bestaat niet' };
      var delen = String(id).split('.');
      var slecht = delen.filter(function (d) { return !/^[a-z][a-z0-9_]*$/.test(d); });
      if (delen.length < 2 || slecht.length)
        return { staat: 'FOUT', detail: 'pakketnaam "' + id + '" voldoet niet aan de vorm die Play eist' +
          (slecht.length ? ' (fout deel: ' + slecht.join(', ') + ')' : ' (minder dan twee delen)') +
          ' — deze schil komt niet door de upload' };
      return 'schil "' + id + '", build ' + (info.build || 'onbekend');
    }
  },

  // ── hoort de chip bij de rol die nu ingelogd is? ──
  // De fout van 29-08 in één zin: de chip werd getekend vóór de login en
  // daarna keek er niets meer naar. Een beheerder hield zo een chip die niet
  // bij hem hoort, met "tokens onbekend" erin. Deze proef kijkt naar de DOM
  // van dit moment — dat is de enige plek waar die vraag te beantwoorden is.
  {
    issue: '#52',
    naam: 'De tokenchip hoort bij de rol die nu ingelogd is',
    waarom: 'Alleen de DOM van dit moment laat zien of de chip bij de ingelogde rol hoort.',
    proef: function () {
      if (!window.PLCredits) return { staat: 'FOUT', detail: 'PLCredits ontbreekt — de tegoedmodule is niet geladen' };
      if (typeof PLCredits.chip !== 'function')
        return { staat: 'FOUT', detail: 'PLCredits.chip() ontbreekt — dan kan niets de chip herbeoordelen na een rolwissel (#52)' };

      const klant = !!(window.PLKlant && PLKlant.isKlant && PLKlant.isKlant());
      const rol = (window.currentUser && window.currentUser.role) || 'niemand ingelogd';
      const er = function () { return !!document.getElementById('plCredChip'); };

      // Sinds 26-09-2026 staat de chip uit (chipTonen:false): voor geen enkele
      // rol een chip. De rolregel eronder blijft gelden als hij terugkomt.
      if (PLCredits.CFG && PLCredits.CFG.chipTonen === false) {
        PLCredits.chip();
        return er()
          ? { staat: 'FOUT', detail: 'de chip staat uit maar hangt er toch, bij rol "' + rol + '"' }
          : 'rol "' + rol + '": geen chip — de chip staat uit; saldo staat in Mijn account';
      }
      // Eerst de stand zoals hij nu is: dít is wat een gebruiker ziet.
      if (er() !== klant)
        return { staat: 'FOUT', detail: 'rol "' + rol + '"' + (klant ? '' : ' hoort geen tokenchip te zien') +
          ' maar de chip is ' + (er() ? 'aanwezig' : 'afwezig') +
          ' — de chip volgt het laadmoment in plaats van de rol (#52)' };

      // En dan de haak zelf: een herbeoordeling mag het antwoord niet omgooien.
      // Doet hij dat wél, dan staat er ergens een tweede plek die dezelfde
      // beslissing neemt, en dat is in dit project al drie keer een bug geweest.
      PLCredits.chip();
      if (er() !== klant)
        return { staat: 'FOUT', detail: 'na PLCredits.chip() is de chip ' + (er() ? 'verschenen' : 'verdwenen') +
          ' terwijl de rol niet veranderde — twee plekken beslissen over dezelfde chip' };

      return 'rol "' + rol + '": chip ' + (klant ? 'aanwezig met ' +
        (PLCredits.saldoBekend() ? PLCredits.saldo() + ' tokens' : 'saldo nog onbekend') : 'afwezig') +
        ', en een herbeoordeling laat dat zo';
    }
  },

  // ── neemt de teller het saldo van de server over? ──
  // De Worker stuurt het saldo na afboeking mee in X-PidLane-Saldo. PIDLANE.md
  // beschreef sinds juli dat apiFetch die uitleest — er las niemand, en de
  // teller liep dus op de schatting. Een échte call zou hier tokens kosten, dus
  // we voeren alleen de kop aan de module en zetten daarna terug wat er stond.
  {
    issue: '§8',
    naam: 'De tokenteller neemt het saldo van de server over',
    waarom: 'De kop X-PidLane-Saldo wordt hier aan de echte module gevoerd; een echte call zou tokens kosten.',
    proef: function () {
      if (!window.PLCredits || typeof PLCredits.volgServer !== 'function')
        return { staat: 'FOUT', detail: 'PLCredits.volgServer() ontbreekt — dan blijft de teller op de schatting lopen (§8)' };
      const kop = function (v) { return { get: function (n) { return String(n).toLowerCase() === 'x-pidlane-saldo' ? String(v) : null; } }; };
      const bekend = PLCredits.saldoBekend();
      const voor = PLCredits.saldo();
      const proef = bekend ? voor + 1 : 7;

      PLCredits.volgServer(kop(proef), {});
      const raak = PLCredits.saldo() === proef;

      // Terugzetten, en wel precies naar de toestand van vóór deze proef. Bij een
      // klant is dat het oude getal; bij een beheerder was het saldo onbekend en
      // dat is vergeetKlant() — anders laat deze proef een verzonnen saldo achter.
      if (bekend) PLCredits.volgServer(kop(voor), {});
      else PLCredits.vergeetKlant();

      if (!raak)
        return { staat: 'FOUT', detail: 'een saldo van ' + proef + ' in de kop leverde ' + PLCredits.saldo() +
          ' op — de server is niet leidend en de teller loopt op de schatting' };
      if (PLCredits.saldo() !== voor || PLCredits.saldoBekend() !== bekend)
        return { staat: 'FOUT', detail: 'de proef heeft het saldo veranderd (' + voor + ' → ' + PLCredits.saldo() +
          ') — dat is een fout in deze proef, niet in de app, maar hij moet wel weg' };
      return 'de kop X-PidLane-Saldo zet de teller (' + proef + ' overgenomen), en de stand van vóór de proef staat terug';
    }
  },

  // ── houdt de schil de betaalroute buiten Play dicht? ──
  // Tokens verkopen ín de app is precies wat Google's betaalregels raakt, en
  // die vraag is niet beantwoord (#42). Tot 10-09-2026 hing dat op één lege
  // Airtable-sleutel: wie `tikkie_kopen` vulde zette een koopknop in dezelfde
  // app die Play beoordeeld heeft, zonder commit en zonder build. Sinds die
  // dag houdt _betaallink() de link in de schil hoe dan ook tegen.
  //
  // Dit is de enige plek waar dat te méten valt. Een node-test draait zonder
  // Capacitor en met een lege PID_CONFIG: daar klopt de grens vanzelf, want er
  // is geen schil en er is geen link. Hier staan ze allebei echt.
  {
    issue: '#42',
    naam: 'Geen koopknop in de Play-schil, wat er ook in de Config staat (#42)',
    waarom: 'Alleen op een toestel staan de echte Config én de echte schil naast elkaar; in node ontbreken ze allebei en klopt de grens vanzelf.',
    proef: function () {
      if (!window.PLKlant) return { staat: 'FOUT', detail: 'PLKlant ontbreekt' };

      const schil = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      let ruw = '';
      try { ruw = String((window.PID_CONFIG || {}).tikkie_kopen || '').trim(); }
      catch (e) { return { staat: 'FOUT', detail: 'PID_CONFIG niet leesbaar, dus deze proef meet niets: ' + e.message }; }
      const link = PLKlant.CFG.tikkieKopen;

      if (schil && link)
        return { staat: 'FOUT', detail: 'de Play-schil toont een koopknop (' + String(link).slice(0, 40) + ') — ' +
          'de schilgrens in _betaallink() doet niets, en dan staat er een betaalroute buiten Play in een Play-app' };
      if (!schil && ruw)
        return { staat: 'FOUT', detail: 'er staat een koopknop in de browserversie (tikkie_kopen is gevuld) terwijl de eerste ' +
          'fase handmatig is — zet de sleutel leeg in beheer.html, of sluit #42 met de uitkomst erbij' };

      if (typeof PLKlant.aanvraagMail !== 'function')
        return { staat: 'FOUT', detail: 'PLKlant.aanvraagMail() ontbreekt — dan opent de knop een lege mail zonder account' };
      const mail = PLKlant.aanvraagMail();
      if (!/^mailto:/.test(mail))
        return { staat: 'FOUT', detail: 'de aanvraagknop wijst niet naar een mailto maar naar: ' + String(mail).slice(0, 60) };
      const klant = !!(PLKlant.isKlant && PLKlant.isKlant());
      const adres = (window.currentUser && window.currentUser.name) || '';
      if (klant && adres && mail.indexOf(encodeURIComponent(adres)) < 0)
        return { staat: 'FOUT', detail: 'de aanvraagmail draagt het account niet — dan begint elke handmatige ' +
          'aanvraag met "en wie ben jij?"' };
      const staart = 'de aanvraag gaat per mail' + (klant ? ' met het account erin' : ' (geen klant ingelogd, dus zonder account)');
      if (schil && ruw)
        return 'de Config draagt een koopknop en de schil geeft hem niet door — de grens is hier echt gemeten; ' + staart;
      if (schil)
        return { staat: 'LET OP', detail: 'geen koopknop, maar tikkie_kopen is leeg in de Config, dus de schilgrens is ' +
          'hier niet op de proef gesteld. Zet de sleutel tijdelijk in beheer.html en draai deze blok opnieuw als je ' +
          'de grens wilt zien werken. ' + staart };
      return 'geen koopknop; ' + staart;
    }
  },

  // ── weigert de Worker een code zonder klantaccount? ──
  // De route stempelde de code eerst af en keek pas daarna of er een account
  // was om hem op bij te schrijven. Zonder account was de code verbrand en het
  // tegoed nergens. De app haakte daar zelf al op af, maar dat is een verzoek
  // en geen grens — deze proef praat dus met de echte Worker.
  //
  // De code hieronder bestaat niet en kan niet bestaan (hij draagt een stempel
  // van dit moment), dus er valt niets af te stempelen. Een beheerder hoort
  // 401 te krijgen, een klant 404: gevonden-niet.
  {
    issue: '#42',
    naam: 'De Worker weigert een code zonder klantaccount',
    waarom: 'De grens ligt in de Worker, niet in de app — dus praat deze proef met de echte Worker.',
    proef: async function () {
      if (typeof PROXY_URL === 'undefined' || !PROXY_URL)
        return { staat: 'LET OP', detail: 'geen PROXY_URL — niet te meten zonder Worker' };
      if (!window.APP_TOKEN)
        return { staat: 'LET OP', detail: 'geen sessietoken — log eerst in' };
      const klant = !!(window.PLKlant && PLKlant.isKlant && PLKlant.isKlant());
      const code = 'PIDL-B5' + String(Date.now()).slice(-6);
      let r;
      try {
        r = await plFetch('/credits/redeem', { method: 'POST', json: { code: code } });
      } catch (e) {
        return { staat: 'LET OP', detail: 'Worker niet bereikbaar: ' + ((e && e.message) || e) };
      }
      const d = await r.json().catch(function () { return {}; });
      if (d.ok === true)
        return { staat: 'FOUT', detail: 'een verzonnen code werd geaccepteerd — dat kan niet en betekent dat er ' +
          'iets heel anders mis is met /credits/redeem' };
      if (!klant && r.status !== 401)
        return { staat: 'FOUT', detail: 'zonder klantaccount gaf de Worker ' + r.status + ' in plaats van 401 — ' +
          'de sessiecontrole staat weer ná het afstempelen en dan kan een code verbranden' };
      // Een verlopen sessie geeft óók 401, en dan zegt deze proef niets over de
      // controle die we willen meten. Dat is LET OP en geen FOUT: een test die
      // rood staat om de verkeerde reden wordt genegeerd (CLAUDE.md).
      if (klant && r.status === 401)
        return { staat: 'LET OP', detail: 'de Worker weigert de sessie (401) terwijl er een klant is ingelogd — ' +
          'waarschijnlijk een verlopen sessietoken; log opnieuw in en draai deze proef nog eens' };
      if (klant && r.status !== 404)
        return { staat: 'FOUT', detail: 'met klantaccount gaf een niet-bestaande code ' + r.status +
          ' in plaats van 404 (' + (d.error || 'geen melding') + ')' };
      return (klant ? 'als klant: 404 code niet gevonden' : 'als beheerder: 401 log eerst in met je account') +
        ' — er is niets afgestempeld';
    }
  },

  // ── het abonnement dat niet bestaat ──────────────────
  // "Je bent ingelogd met een zakelijk account. Daarvoor gelden geen tokens —
  // analyses zitten in je abonnement." Dat abonnement bestaat niet: onder #49
  // is zo'n account personeel dat op de sleutel van de beheerder draait. De
  // tekst is op 29-08 vervangen; deze proef bewaakt dat hij niet terugkomt via
  // een andere weg, en dat het menu-item weg is voor wie geen klant is.
  {
    issue: '#49',
    naam: 'Nergens meer een abonnement beloofd aan personeel',
    waarom: 'Bewaakt dat de belofte van een abonnement niet via een andere weg terugkomt.',
    proef: function () {
      const klant = !!(window.PLKlant && PLKlant.isKlant && PLKlant.isKlant());
      const acc = document.getElementById('kbAccount');
      if (acc && !klant && acc.style.display !== 'none')
        return { staat: 'FOUT', detail: '"Mijn account" staat in het menu terwijl er geen klantaccount is ingelogd — ' +
          'dat scherm gaat over een tegoed dat dit account niet heeft (#49)' };
      const tekst = document.body.innerHTML || '';
      if (/analyses zitten in je abonnement/i.test(tekst))
        return { staat: 'FOUT', detail: 'de oude tekst over een abonnement staat weer in beeld — dat abonnement bestaat niet' };
      return klant ? 'klantaccount: "Mijn account" hoort er te staan en staat er'
                   : 'geen klantaccount: "Mijn account" is verborgen en nergens wordt een abonnement beloofd';
    }
  },

  // ── meet blok 7 wat PLLoad doet? ──────────────
  // In node vergelijkt test-zonespiegel.js 2160 combinaties. Wat die test niet
  // kan zien is of de twee modules in DEZE app aan elkaar hangen: PLBudget zit
  // in pidlane-testrun.js en PLLoad in een ander bestand, en dat is precies het
  // soort verbinding dat bij #29 en #74 ontbrak zonder ooit een fout te geven.
  {
    issue: '#76',
    naam: 'Blok 7 leent de zoneregel bij PLLoad (#76)',
    waarom: 'Of PLBudget en PLLoad in DEZE app aan elkaar hangen, ziet test-zonespiegel.js niet.',
    proef: function () {
      if (!window.PLLoad || typeof PLLoad.zoneVan !== 'function')
        return { staat: 'FOUT', detail: 'PLLoad.zoneVan() ontbreekt — blok 7 kan de regel dan niet lenen en meldt "niet te bepalen"' };
      const sp = PLBudget.spoor().filter(function (m) { return !m.run; });
      if (!sp.length)
        return { staat: 'LET OP', detail: 'nog geen spoor — niet verbonden, of de app draait net' };
      let vorig = null, mis = 0, druk = 0;
      sp.forEach(function (m) {
        const a = PLBudget.zone(m, vorig);
        const b = PLLoad.zoneVan({ belasting: m.bezet, foutPct: m.fout, venGemMs: m.ms }, vorig, m.mult);
        if (a !== b) mis++;
        if (a === 'druk') druk++;
        vorig = m.ms;
      });
      if (mis)
        return { staat: 'FOUT', detail: mis + ' van de ' + sp.length + ' monsters krijgen van blok 7 een ander oordeel ' +
          'dan van PLLoad zelf — de spiegel loopt weer uit de pas (#76)' };
      return sp.length + ' monsters, elk oordeel gelijk aan dat van PLLoad; ' +
        Math.round(druk / sp.length * 100) + '% druk op dit moment';
    }
  },

  // ── klopt het verslag over zichzelf? ──
  // Drie kleine metingen die alleen in een lopende sessie iets betekenen: de
  // verbindingsteller, de tijdstempels in beide logs, en de geheugen-cap.
  {
    issue: '#75',
    naam: 'De run telt zijn eigen meldingen en verbindingen eerlijk',
    waarom: 'Verbindingsteller, tijdstempels en geheugen-cap betekenen alleen iets in een lopende sessie.',
    proef: function () {
      const uit = [];
      // #77 — een herverbinding zonder gat was tot vandaag de normale eerste
      // verbinding. Nu hoort dat een echte onderbreking te zijn.
      if (window.PLRit) {
        // Sinds #133 zijn er twee soorten gat, en deze regel moet ze allebei
        // kennen: op de rit van 10-09 stond het loopgat op 0 terwijl de adapter
        // 39 s weg was, en dan wees "zonder enig gat" je naar een heropstart.
        const hv = PLRit.herverbindingen(), g = PLRit.gaten().length;
        let mg = 0;
        try { mg = (PLRit.meetgaten ? (PLRit.meetgaten() || []) : []).length; }
        catch (e) { console.warn('PLRit.meetgaten() onleesbaar bij de #75-proef', e); }
        if (hv > 0 && g === 0 && mg === 0)
          uit.push('LET OP: ' + hv + ' herverbinding(en) zonder loopgat én zonder meetgat. Sinds #77 telt de eerste ' +
                   'verbinding niet meer mee, dus dit is er dan ook echt een — een socket die stierf en herstelde ' +
                   'tussen twee tikken, of de app is heropgestart');
        else uit.push(hv + ' herverbinding(en) bij ' + g + ' loopgat(en) en ' + mg + ' meetgat(en)');
      }
      // #75/#72 — de app-log moet dateerbaar zijn, anders telt de meldingenregel
      // in blok 11 altijd nul.
      const app = _appLogRegels();
      const zonderT = app.filter(function (l) { return typeof (l && l.t) !== 'number'; }).length;
      if (app.length && zonderT === app.length)
        return { staat: 'FOUT', detail: 'geen enkele app-logregel draagt een epoch-tijdstempel — dan telt ' +
          '"meldingen sinds het begin van deze run" structureel nul (#75)' };
      uit.push(app.length + ' app-logregels, waarvan ' + zonderT + ' zonder tijdstempel');
      // De afkapping moet zichtbaar zijn als hij is opgetreden.
      const weg = app.filter(function (l) { return /weggelaten \(geheugen-cap\)/.test((l && l.msg) || ''); }).length;
      uit.push(weg ? 'de app-log is afgekapt en zegt dat ook (#72)' : 'de app-log is nog niet tegen de cap gelopen');
      return uit.join('.  ');
    }
  },

  // ── kloppen de veilige zones op dit toestel? ──
  // Dit is de enige plek waar dit écht te meten valt: in een browser zijn
  // beide zones 0 en klopt álles. Op een toestel met een statusbalk en drie
  // knoppen komen de getallen pas uit elkaar. Vandaar meten en niet lezen.
  //
  // HET OORDEEL OVER DE ONDERRAND IS OP 10-09-2026 HERZIEN (#172). Hier stond
  // dat het "nog onbeslist" was of de melding klopte of de meting, en dat een
  // oog dat moest beslissen. Dat oog heeft gesproken: in de toestelronde van
  // 10-09 beoordeelde de bestuurder de onderrand met "Alles vrij — er valt
  // niets weg", terwijl deze proef in dezelfde sessie twee keer FOUT meldde
  // (41px en 46px). De melding klopte niet.
  //
  // De meting stelde de verkeerde vraag: of #appGrid binnen de vouw PAST, in
  // plaats van of een mens bij de onderste regel KAN. Op ≤760px krijgt .app
  // bewust height:auto en scrollt de pagina — dan is "loopt door tot onder de
  // balk" per definitie waar en per definitie betekenisloos. Zie
  // plOnderrandOordeel() voor de regel die er nu onder ligt.
  {
    issue: '#79',
    naam: 'De app past tussen de statusbalk en de navigatiebalk',
    waarom: 'In een browser zijn beide zones 0 en klopt alles; de getallen komen pas op een toestel uit elkaar.',
    proef: function () {
      const meet = function (token) {
        const p = document.createElement('div');
        p.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:' + token;
        document.body.appendChild(p);
        const h = p.getBoundingClientRect().height;
        p.remove();
        return h;
      };
      const sat = meet('var(--pl-sat)');
      const sab = meet('var(--pl-sab)');
      const top = meet('var(--pl-top)');
      if (Math.abs(top - (46 + sat)) > 1)
        return { staat: 'FOUT', detail: '--pl-top is ' + top.toFixed(1) + 'px maar de topbalk is 46 + ' +
          sat.toFixed(1) + ' = ' + (46 + sat).toFixed(1) + 'px hoog' };

      const bar = document.querySelector('.topbar');
      if (bar && Math.abs(bar.getBoundingClientRect().bottom - top) > 1.5)
        return { staat: 'FOUT', detail: 'de topbalk eindigt op ' + bar.getBoundingClientRect().bottom.toFixed(1) +
          'px terwijl --pl-top ' + top.toFixed(1) + 'px zegt — alles wat daaronder hangt staat dus verkeerd' };

      const app = document.getElementById('appGrid');
      if (!app) return { staat: 'LET OP', detail: '#appGrid niet gevonden' };
      const onder = app.getBoundingClientRect().bottom;
      const grens = window.innerHeight - sab;
      const o = plOnderrandOordeel(onder, grens, _plScrollRestOnder(app));
      const zones = 'statusbalk ' + sat.toFixed(0) + 'px, navigatiebalk ' + sab.toFixed(0) + 'px';
      if (!o.ok) return { staat: 'FOUT', detail: zones + ' — ' + o.tekst + ' (issue #58)' };
      return zones + ' — ' + o.tekst +
             (sat + sab === 0 ? ' (browser: geen zones, dus deze proef zegt hier weinig)' : '');
    }
  },

  // ══════════════════════════════════════════════════════════════
  // OPLEVERING 02-09-2026 (tweede) — DE MEETKETEN MEET ZICHZELF
  //
  // §20 noemt dit als vierde punt op de lijst "wat er nog te automatiseren
  // valt": een blok dat aan het begin van een run naloopt of elke bron
  // bestaat en beweegt. #29, #74, #75 en #76 waren alle vier dezelfde fout —
  // een controle die zijn antwoord uit de verkeerde bron haalt en er tóch
  // een stellige conclusie op plakt.
  //
  // De drie proeven hieronder zijn de runtime-helft van test-parser.js. Die
  // node-test draait de parser in een sandbox met de echte tabellen; wat hij
  // niet kan zien is of dezelfde keten in de DRÁAIENDE app aan elkaar hangt.
  // Precies het gat waar #29 en #74 in vielen.
  //
  // Ze zijn alle drie gratis: er gaat geen commando naar de bus en geen
  // AI-call overheen. Er wordt gerekend op een antwoord dat hier ter plekke
  // verzonnen is.
  // ══════════════════════════════════════════════════════════════

  // ── leest de parser een bekend antwoord goed? ──
  {
    issue: '—',
    naam: 'De parser leest een bekend ELM-antwoord goed',
    waarom: 'De runtime-helft van test-parser.js: hangt de keten in de draaiende app aan elkaar?',
    proef: function () {
      if (typeof parsePID !== 'function')
        return { staat: 'FOUT', detail: 'parsePID() ontbreekt — dan komt er geen enkele meetwaarde binnen' };
      if (typeof splitBatchResponse !== 'function')
        return { staat: 'FOUT', detail: 'splitBatchResponse() ontbreekt — dan valt een batch stil uit elkaar' };

      // 410C0A98 = 0x0A98 / 4 = 678 rpm. Eén nibble verschuiving geeft hier een
      // geldig maar verkeerd getal, en dát is de fout die je in een log niet ziet.
      const rpm = parsePID('010C', '410C0A98');
      if (rpm !== 678)
        return { staat: 'FOUT', detail: 'parsePID("010C","410C0A98") gaf ' + rpm + ' in plaats van 678 rpm — ' +
          'de header-echo wordt verkeerd overgeslagen en élke meting staat scheef' };

      const uit = splitBatchResponse('410C0A98 410D50 410584', ['010C', '010D', '0105']);
      const mist = ['010C', '010D', '0105'].filter(function (p) { return !uit || !uit[p]; });
      if (mist.length)
        return { staat: 'FOUT', detail: 'de batch-splitser verloor ' + mist.join(', ') +
          ' uit een antwoord waar ze alle drie in staan' };

      return 'parsePID leest 678 rpm en de batch levert alle drie de PIDs';
    }
  },

  // ── houdt laag 1 een onmogelijke waarde tegen? ──
  {
    issue: '—',
    naam: 'Laag 1 houdt een fysiek onmogelijke waarde tegen',
    waarom: 'Of de harde fysieke limiet ook in de draaiende app tussen parser en opslag staat.',
    proef: function () { return _zonderSporen('Laag 1', function () {
      if (typeof validateAndSmooth !== 'function')
        return { staat: 'FOUT', detail: 'validateAndSmooth() ontbreekt — dan loopt de meetketen zonder laag 1 t/m 3' };
      if (typeof PID_HARD_LIMITS === 'undefined' || !PID_HARD_LIMITS['0105'])
        return { staat: 'FOUT', detail: 'PID_HARD_LIMITS mist 0105 — laag 1 heeft dan geen meetlat' };

      // 300 °C koelwater kan niet. Komt dat er tóch doorheen, dan staat laag 1
      // uit en gaan onmogelijke waarden mee de AI-prompt in.
      if (validateAndSmooth('0105', 300) !== null)
        return { staat: 'FOUT', detail: 'koelwater van 300 °C werd geaccepteerd terwijl de harde limiet op ' +
          PID_HARD_LIMITS['0105'].max + ' staat — laag 1 filtert niet' };
      /* HERZIEN OP 10-09-2026 NA DE RIT VAN 12:41. Hier stond `!== 90`, en dat
         werd op die rit een FOUT met de tekst "laag 1 filtert te veel" —
         terwijl laag 1 de waarde gewoon doorliet en laag 3 hem middelde met de
         vorige koelwatermeting van de draaiende motor. De proef mat dus laag 3
         en wees de schuld aan laag 1 toe.

         Laag 3 is intussen weg, dus `!== 90` zou het nu weer doen. Toch blijft
         het bij deze vorm: de vraag van laag 1 ís null of niet-null, en een
         proef die precies vraagt wat zijn onderwerp beslist kan niet nog eens
         omvallen op iets dat een laag verderop gebeurt. Het exacte getal is de
         vraag van de meetgetrouwheidsproef hieronder. */
      const door = validateAndSmooth('0105', 90);
      if (door === null)
        return { staat: 'FOUT', detail: 'koelwater van 90 °C werd tegengehouden terwijl het binnen de meetlat ' +
          PID_HARD_LIMITS['0105'].min + '…' + PID_HARD_LIMITS['0105'].max + ' valt — laag 1 filtert te veel' };
      if (typeof door !== 'number' || !isFinite(door))
        return { staat: 'FOUT', detail: 'koelwater van 90 °C gaf ' + door + ' terug in plaats van een getal' };

      return 'laag 1 weigert 300 °C en laat 90 °C door (kwam er als ' + door + ' uit), meetlat ' +
        PID_HARD_LIMITS['0105'].min + '…' + PID_HARD_LIMITS['0105'].max;
    }); }
  },

  // ── blijft de meting van de auto de meting van de auto? ──
  // Hier stond een proef die toetste of laag 2+3 bereikbaar was. Die lagen zijn
  // op 10-09-2026 weggehaald, dus die vraag bestaat niet meer. Wat er voor in
  // de plaats komt is de omgekeerde vraag, en die is op een rit méér waard: komt
  // wat de ECU zei ook ongewijzigd bij de opslag aan?
  //
  // Waarom dat een rit nodig heeft en test-parser.js het niet kan: in node staat
  // er één functie met een verzonnen reeks eromheen. Hier draait de app met de
  // echte meetgeschiedenis van dít moment, en juist een reeks die er al staat
  // was wat een middeling zichtbaar maakte. Op de rit van 10-09 gaf de proef
  // hierboven een FOUT op laag 1 die in werkelijkheid laag 3 was.
  {
    issue: '#158',
    naam: 'De meting van de auto komt ongewijzigd bij de opslag aan',
    waarom: 'Alleen op een draaiende app staat er een echte meetreeks omheen — en juist een bestaande reeks maakte de middeling zichtbaar.',
    proef: function () { return _zonderSporen('Meetgetrouwheid', function () {
      if (typeof validateAndSmooth !== 'function')
        return { staat: 'FOUT', detail: 'validateAndSmooth() ontbreekt — dan loopt de meetketen zonder laag 1' };

      // 200 °C koelwater is opvallend (laag 1b meldt het) maar fysiek mogelijk,
      // dus het is een METING. Kwam er null uit, dan staat het spike-filter van
      // laag 2 terug — en dan boekt de meetlus dit als NO DATA van de ECU.
      const bewaar = (typeof pidVals !== 'undefined') ? pidVals['0105'] : undefined;
      let sprong, tweede;
      try {
        if (typeof pidVals !== 'undefined') pidVals['0105'] = 50;
        sprong = validateAndSmooth('0105', 200);
        tweede = validateAndSmooth('0105', 90);
      } finally {
        if (typeof pidVals !== 'undefined') {
          if (bewaar === undefined) delete pidVals['0105']; else pidVals['0105'] = bewaar;
        }
      }

      if (sprong === null)
        return { staat: 'FOUT', detail: 'validateAndSmooth("0105",200) gaf null terwijl 200 °C binnen ' +
          'de fysieke grenzen valt. Dan is het spike-filter terug, en de meetlus boekt zo\'n waarde ' +
          'als NO DATA van de ECU — niet te onderscheiden van een dode bus (#133)' };
      if (sprong !== 200)
        return { staat: 'FOUT', detail: 'validateAndSmooth("0105",200) gaf ' + sprong +
          ' in plaats van 200 — er zit weer een bewerking tussen de ECU en de opslag' };
      if (tweede !== 90)
        return { staat: 'FOUT', detail: 'de meting erna gaf ' + tweede + ' in plaats van 90. ' +
          'Dat is het gemiddelde van twee monsters: de middeling van laag 3 is terug, en dan slaat ' +
          'de app een waarde op die de sensor niet kán geven' };

      return 'twee metingen op een traag signaal (200 en 90 °C) komen allebei ongewijzigd terug — ' +
        'geen filter en geen middeling tussen de ECU en de opslag';
    }); }
  },

  // ════════════════════════════════════════════════════════════
  // DE RIT-OOGST (6.5) — kan er na DÍT logboek een issue dicht?
  //
  // WAAROM DIT BLOK BESTAAT. Vijf issues staan al weken op "wacht op een rit",
  // en er zijn intussen vier ritten geweest. Elke keer bleek achteraf dat er
  // één voorwaarde niet gehaald was: de caravan-tracker stond niet aan, er werd
  // vier minuten gereden in plaats van tien, of de PID stond niet in de
  // selectie. Dat stond dan verspreid over blok 4, 7 en 14 — nergens stond de
  // vraag die je eigenlijk had: is dit issue hiermee dicht te doen?
  //
  // Deze proeven meten daarom niets nieuws. Ze lezen de bronnen die er al zijn
  // (PLRit, PLBudget, PLBus, PLPidLen, PLBulk, de gate) en spreken één oordeel
  // uit per issue: SLUIT, of wat er precies ontbrak. Dat laatste is de helft
  // die tot nu toe miste — "onvoldoende" zonder reden is een verwijt, met reden
  // is een boodschappenlijstje voor de volgende rit.
  //
  // Ze zijn alle zes gratis: geen buscommando, geen AI-call.
  // ════════════════════════════════════════════════════════════

  // ── #19: bewegen 0123 en 0159 over een HELE rit, met de bus vol? ────
  // Blok 14 meet of ze bewogen. Wat daar niet staat is of de voorwaarden uit
  // het issue gehaald zijn — en zonder die twee helften naast elkaar is het
  // issue niet te sluiten. Dit is dus geen tweede meting maar het oordeel.
  {
    issue: '#19',
    naam: '#19 — raildruk over een hele rit, met alle aanvragers aan',
    waarom: 'Blok 14 meet of ze bewogen; hier staat of de voorwaarden uit het issue gehaald zijn.',
    proef: function () {
      if (!window.PLRit) return { staat: 'LET OP', detail: 'PLRit ontbreekt — geen ritbeeld' };
      let duur = 0, per = {};
      // Via window en niet via de closure-const, zodat test-blok5lijst.js hem
      // met een nagemaakte ritstand kan voeden. In de app is het hetzelfde
      // object; het verschil bestaat alleen buiten de browser.
      try { duur = window.PLRit.duurS(); per = window.PLRit.per() || {}; }
      catch (e) { return { staat: 'LET OP', detail: 'ritstand onleesbaar' }; }
      const aan = _aanvragersNu();
      // _meetStand() is dezelfde bron als blok 14 gebruikt. Bewust niet hier
      // opnieuw uitgerekend: "wanneer telt een PID als gemeten" is één regel, en
      // twee plekken met dezelfde regel is in dit project al drie keer een bug
      // geweest. Het verschil tussen 0, 1 en meer verversingen is precies wat
      // #74 liet zien.
      const rij = [], stil = [], blind = [];
      ['0123', '0159'].forEach(function (p) {
        const e = per[p], m = _meetStand(e);
        if (m.stand !== 'gemeten') { blind.push(p); rij.push(p + ': ' + m.tekst); return; }
        rij.push(p + ': ' + m.tekst + ', ' + (e.veranderingen || 0) + ' wijzigingen, ' + e.min + '–' + e.max);
        if (!e.veranderingen) stil.push(p);
      });
      const kop = rij.join('  |  ') + '  |  ' + Math.round(duur / 60) + ' min, ' + aan.length + ' aanvrager(s): ' + (aan.join(', ') || '—');

      /* DE TIEN MINUTEN ZIJN HIER OOK WEG (10-09-2026, #170).

         Deze proef eiste tien minuten én vier aanvragers. Sinds #166 sluit de
         rijstap op de OOGST en niet op de klok, en dat maakte deze lat op de
         rit van 10-09 onhaalbaar voor élke ronde: de meetrit viel af op
         "maar 7 min gereden van de tien", de toestelronde op "maar 3 van de 4
         aanvragers aan". Geen van beide rondes kan hem nog halen, en een proef
         die altijd LET OP staat wordt genegeerd — dat staat zo in CLAUDE.md.

         Wat overblijft is wat deze proef werkelijk moet zeggen: bewegen die
         twee sensoren, en onder welke omstandigheden is dat gemeten. Het
         aantal aanvragers blijft er als CONTEXT bij staan, want dat is wat de
         meting kleurt — maar het is geen lat meer die de proef laat zakken.
         #19 is bovendien dicht; wat hier nog toe doet is dat het antwoord
         waar blijft. */
      const tekort = [];
      if (blind.length) tekort.push(blind.join(' en ') + ' stond niet in de pollronde');
      if (stil.length && !blind.length)
        return { staat: 'LET OP', detail: kop + ' — ' + stil.join(' en ') + ' stond STIL terwijl hij wél werd uitgevraagd. ' +
          'Op directe inspuiting kan dat niet: dit is de kandidaat voor moetBewegen:\'draait\' uit PIDLANE-CONTRACT.md §4 (#19)' };
      if (tekort.length)
        return { staat: 'LET OP', detail: kop + ' — nog niets over te zeggen: ' + tekort.join('; ') };
      return kop + ' — allebei in beweging, gemeten en wel. Dat is het antwoord waar #19 om vroeg, ' +
        'en het aantal aanvragers hierboven zegt onder welke belasting het gemeten is';
    }
  },

  // ── #15: wat deden vier aanvragers met de bus? ──────────────
  // Het besluit gaat over één poort of vier. Dat is een ontwerpvraag, maar hij
  // is onbeslisbaar zonder te weten wat vier aanvragers op deze bus dóen — en
  // dat cijfer bestond nog niet, want er is nooit met vier gereden.
  {
    issue: '#15',
    naam: '#15 — wat vier aanvragers met de bus deden',
    waarom: 'De ontwerpvraag is onbeslisbaar zonder te weten wat vier aanvragers op deze bus doen.',
    proef: function () {
      const aan = _aanvragersNu();
      if (!window.PLBudget || !PLBudget.spoor) return { staat: 'LET OP', detail: 'PLBudget ontbreekt — geen spoor' };
      let sp = [];
      try { sp = (PLBudget.spoor() || []).filter(function (m) { return !m.run; }); } catch (e) { return { staat: 'LET OP', detail: 'pollbudget-spoor onleesbaar' }; }
      // DE ACHTERGRONDPAUZE ERUIT (02-09-2026). De run van 22:15 meldde
      // "responstijd gem 897 ms (hoogst 185785 ms)". Die 186 seconden is geen
      // bus maar de bevriezing uit stap 7: de meetlus stond 190 s stil en de
      // eerste meting daarna droeg die hele stilte als responstijd. #15 gaat
      // over wat vier aanvragers met de BUS doen, dus zo'n monster hoort er
      // niet in — en het weglaten zonder het te melden hoort ook niet. Vandaar
      // allebei: eruit, en met het aantal erbij.
      let gaten = [];
      try { gaten = (window.PLRit && window.PLRit.gaten) ? (window.PLRit.gaten() || []) : []; } catch (e) { console.warn('PLRit.gaten() onleesbaar bij de #15-proef', e); }
      const inGat = function (m) {
        return gaten.some(function (g) { return typeof m.t === 'number' && m.t >= g.van && m.t <= g.tot + 5000; });
      };
      const vuil = sp.filter(inGat).length;
      sp = sp.filter(function (m) { return !inGat(m); });
      if (sp.length < 20) return { staat: 'LET OP', detail: sp.length + ' bruikbare monsters — te kort om iets over #15 te zeggen' };
      const bez = sp.map(function (m) { return m.bezet; }).filter(function (v) { return typeof v === 'number'; });
      const ms = sp.map(function (m) { return m.ms; }).filter(function (v) { return typeof v === 'number' && v > 0; });
      const fout = sp.map(function (m) { return m.fout; }).filter(function (v) { return typeof v === 'number'; });
      const gem = function (a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; };
      const hoog = function (a) { return a.length ? Math.max.apply(null, a) : null; };
      // Mediaan erbij, want één trage uitschieter trekt een gemiddelde scheef en
      // juist de uitschieters zijn hier het onderwerp.
      const mid = function (a) { if (!a.length) return null; const b = a.slice().sort(function (x, y) { return x - y; }); return Math.round(b[Math.floor(b.length / 2)]); };
      const kop = aan.length + ' aanvrager(s) (' + (aan.join(', ') || '—') + ') over ' + sp.length + ' monsters' +
        (vuil ? ' (' + vuil + ' weggelaten: die vielen in de achtergrondpauze)' : '') + ': ' +
        'bezetting gem ' + gem(bez) + '% (hoogst ' + hoog(bez) + '%), responstijd mediaan ' + mid(ms) + ' ms ' +
        '(gem ' + gem(ms) + ', hoogst ' + hoog(ms) + '), foutgraad hoogst ' + hoog(fout) + '%';
      if (aan.length < 4)
        return { staat: 'LET OP', detail: kop + ' — dit is het beeld bij ' + aan.length + ' aanvragers. #15 gaat over vier; ' +
          'zonder die vierde is het cijfer niet het cijfer waar het besluit over gaat' };
      return kop + ' — gemeten met alle vier tegelijk: dit is het getal waar #15 op wachtte';
    }
  },

  // ── #40: stuurt de auto één byte waar de tabel er twee zegt? ─────
  // PLPidLen leert uit metingen. Staan 0155/0156 niet in de pollronde, dan
  // leert hij niets en meldt blok 4 "0 afwijkend" — wat leest als "opgelost"
  // terwijl het "niet gekeken" betekent. Dat is precies wat de run van 13:14
  // deed. Sinds 6.5 staan ze in RIT_PIDS; hier staat wat dat opleverde.
  {
    issue: '#40',
    naam: '#40 — leest de app 0155/0156 goed, ook al wijken ze van de tabel af',
    waarom: 'De lerende laag hoort te winnen van de tabel. Afwijken is geen fout maar de bedoeling.',
    proef: function () {
      if (!window.PLPidLen || !PLPidLen.geleerd) return { staat: 'LET OP', detail: 'PLPidLen ontbreekt' };
      let g = {};
      try { g = PLPidLen.geleerd() || {}; } catch (e) { return { staat: 'LET OP', detail: 'PLPidLen.geleerd() gaf een fout' }; }
      const tabel = window.PID_BYTE_LEN || {};
      const rij = [], zonder = [], bewijs = [];
      ['55', '56'].forEach(function (sfx) {
        const e = g[sfx], t = tabel[sfx];
        if (!e) { zonder.push('01' + sfx); rij.push('01' + sfx + ': niets geleerd (tabel ' + t + ')'); return; }
        rij.push('01' + sfx + ': gemeten ' + e.n + ' byte' + (e.n === 1 ? '' : 's') + ' uit ' + e.hits + ' meting(en) via ' +
          e.bron + (e.conflict ? ', ' + e.conflict + ' tegenspraak/tegenspraken' : '') + ' — tabel zegt ' + t);
        if (t != null && e.n !== t && e.hits >= 2 && !e.conflict) bewijs.push('01' + sfx);
      });
      const kop = rij.join('  |  ');
      if (zonder.length)
        return { staat: 'LET OP', detail: kop + ' — ' + zonder.join(' en ') + ' kwam deze rit niet langs. ' +
          'Ze staan sinds 6.5 in RIT_PIDS; stond stap 2 aan?' };
      /* HERZIEN OP 03-09-2026 (#106). Hier stond: "#40 KAN DICHT, de tabel in
         pidlane-data.js hoort naar de gemeten waarde". Dat advies was fout, en
         het bleef elke rit opnieuw op het scherm staan terwijl #40 op 02-09 om
         20:27 al gesloten was — met de ANDERE uitkomst.

         0155/0156 zijn in J1979 de secundaire lambdatrim voor twee bankparen:
         twee bytes, één per bank. Een motor met één bank antwoordt met één. De
         tabelwaarde 2 is dus in het algemeen goed en deze CX-5 antwoordt korter.
         Dat is precies waar de lerende laag voor bestaat, en pidByteLen() geeft
         PLPidLen.lengte() al voorrang op de tabel.

         De proef stelde daarmee de verkeerde vraag. "Gemeten wijkt af van de
         tabel" is bij een lerende laag geen bevinding maar de normale toestand;
         een proef die dáár LET OP op zet staat vanaf de eerste rit in deze auto
         permanent oranje, en CLAUDE.md zegt wat daarvan komt: een test die
         altijd rood staat wordt genegeerd.

         De vraag is nu GEDRAG: pakt de app de bytes goed uit? Dus of de
         geleerde lengte wint van de tabel, en of een batch mét 0155 erin de PID
         eráchter nog steeds goed uitpakt. test-parser.js toetst dat laatste al
         op de echte functies; hier staat wat déze auto ervan liet zien. */
      if (typeof pidByteLen !== 'function')
        return { staat: 'FOUT', detail: kop + ' — pidByteLen() ontbreekt, dus er is geen laag die kan kiezen ' +
          'tussen de tabel en wat er gemeten is' };

      const misleest = [];
      ['55', '56'].forEach(function (sfx) {
        const e = g[sfx];
        if (!e || e.hits < 2 || e.conflict) return;   // te weinig bewijs: hieronder afgehandeld
        let gebruikt = null;
        try { gebruikt = pidByteLen(sfx); }
        catch (err) { misleest.push('01' + sfx + ': pidByteLen() gaf een fout — ' + (err.message || err)); return; }
        if (gebruikt !== e.n)
          misleest.push('01' + sfx + ': gemeten ' + e.n + ' byte(s) maar de app rekent met ' + gebruikt);
      });

      if (misleest.length)
        return { staat: 'FOUT', detail: kop + '  ||  ' + misleest.join(' | ') +
          ' — de lerende laag wint NIET van de tabel. Een batch met deze PID erin schuift dan alles ' +
          'wat erachter zit een byte op, en dat is stil: de waarde ziet er nog goed uit.' };

      if (bewijs.length === 2)
        return kop + ' — allebei bevestigd met minstens twee metingen en zonder tegenspraak, en de app leest ' +
          'ze ook echt met de gemeten lengte. De tabel blijft staan: die klopt voor een motor met twee banken ' +
          '(J1979), deze CX-5 heeft er één. #40 is hiermee gesloten (02-09); dit blijft staan als bewaking.';
      return kop + ' — de app leest ze met de lengte die hij zelf gemeten heeft. Voor een harde uitspraak over ' +
        'dit voertuig zijn per PID twee bevestigende metingen zonder tegenspraak nodig; die zijn er nog niet.';
    }
  },

  // ── #18: bevriest de app op de achtergrond? ───────────────
  // Stap 7 van de begeleide rit zet de markering; hier staat wat eruit kwam.
  // Zonder die stap kan deze proef niets zeggen, en dat zegt hij dan ook.
  {
    issue: '#18',
    naam: '#18 — weet de app dat hij weg was, en komt hij met opzet terug?',
    waarom: 'De bevriezing zelf is niet vanuit JavaScript te repareren. Wat wél kan is ervan weten én hem meten — hoe lang de app na het verbergen nog doorliep, en hoe lang hij daarna werkelijk stillag.',
    proef: function () {
      const m = T.markeringenRuw().filter(function (x) { return /achtergrond in/i.test(x.tekst); }).pop();
      // Geen hard stapnummer meer (#170): sinds #166 is de achtergrondstap van
      // 7 naar 6 geschoven en bleef deze tekst naar de oude plek wijzen. De
      // stap heet altijd zo; het nummer verschuift met de lijst mee.
      if (!m) return { staat: 'LET OP', detail: 'in deze sessie is geen achtergrondmarkering gezet — ' +
        'de achtergrondstap van de meetrit is nog niet gedaan, dus over #18 zegt deze sessie niets. ' +
        'Niet-aangeboden is iets anders dan niets-gezien (#227).' };
      if (!window.PLAchtergrond || typeof PLAchtergrond.sinds !== 'function')
        return { staat: 'FOUT', detail: 'PLAchtergrond ontbreekt — dan weet de app nog steeds niets van zijn eigen pauze, ' +
          'en blijft het gat iets dat PLRit achteraf moet raden (#18)' };

      let gaten = [];
      try { gaten = PLRit.gaten() || []; } catch (e) { return { staat: 'LET OP', detail: 'PLRit.gaten() onbereikbaar' }; }
      const sinds = gaten.filter(function (g) { return g.van >= m.ms - 2000; });
      const grootste = sinds.reduce(function (a, g) { return Math.max(a, g.s || 0); }, 0);

      let bgs = [];
      try { bgs = PLAchtergrond.sinds(m.ms - 2000) || []; } catch (e) { return { staat: 'LET OP', detail: 'PLAchtergrond.sinds() gaf een fout' }; }
      const bgGrootste = bgs.reduce(function (a, p) { return Math.max(a, p.s || 0); }, 0);
      const bgStil = (typeof PLAchtergrond.stilsteS === 'function') ? PLAchtergrond.stilsteS(m.ms - 2000) : null;
      const bgGemeten = (typeof PLAchtergrond.gemeten === 'function') ? PLAchtergrond.gemeten(m.ms - 2000) : 0;
      const kop = 'markering om ' + m.t + '  |  PLRit leidt ' + sinds.length + ' onderbreking(en) af, grootste ' + grootste +
        ' s  |  PLAchtergrond wéét er ' + bgs.length + ', langste afwezigheid ' + bgGrootste + ' s' +
        (bgStil === null ? '' : ', langste gemeten stilte ' + bgStil + ' s');

      // DE KERN, HERZIEN OP 08-09-2026. Twee bronnen die langs verschillende
      // weg naar hetzelfde moeten wijzen: PLRit LEIDT het gat af uit zijn
      // eigen tikken, PLAchtergrond WEET van visibilitychange dat de app weg
      // was en meet sindsdien met een hartslag hoe lang de lus werkelijk
      // stillag.
      //
      // WAT HIER TOT 7.3 FOUT AAN WAS. De proef vergeleek `grootste` (het gat
      // in de meetlus) met `bgGrootste` (hoe lang de app weg was) en zette
      // LET OP zodra die meer dan een kwart uiteenliepen. Dat is geen
      // bevinding maar de normale uitkomst: tussen "app verborgen" en "Android
      // bevriest de app" zit een aanlooptijd, op 02-09 gemeten op ~36 s. De
      // proef sloeg dus alarm op precies het verschil dat hij hoorde te
      // rapporteren, en op de rit van 02-09 deed hij dat ook — met een log
      // eronder dat de aanlooptijd regel voor regel liet zien.
      //
      // Wat blijft alarmeren is het BESTAAN: ziet PLRit een gat waar
      // PLAchtergrond niets van weet, dan lag de lus stil zonder dat de app
      // het doorhad. Dat is de stille vorm die deze module moest wegnemen.
      // Wat een meetwaarde wordt is de DUUR, en die vergelijking loopt nu
      // tussen twee getallen die hetzelfde meten: het gat van PLRit tegen de
      // gemeten stilte van de hartslag.
      if (!bgs.length && grootste >= 30)
        return { staat: 'FOUT', detail: kop + ' — de meetlus stond ' + grootste + ' s stil maar PLAchtergrond legde niets vast. ' +
          'De luisteraar op visibilitychange vuurde dus niet: precies de stille vorm die 7.0 moest wegnemen' };
      if (bgs.length && !sinds.length)
        return { staat: 'LET OP', detail: kop + ' — PLAchtergrond zag een pauze waar PLRit geen gat afleidt. ' +
          'Dat kan: kort weg, of de pollus liep door. Geen bevinding, wel het vermelden waard' };
      if (bgs.length && grootste >= 30 && !bgGemeten)
        return { staat: 'LET OP', detail: kop + ' — PLAchtergrond weet dát de app weg was maar heeft de stilte niet gemeten ' +
          '(de hartslag startte niet). Dan is er niets om het gat van PLRit naast te leggen' };
      /* DE MEETWAARDE VAN DEZE PROEF, EN DE REDEN DAT HIJ SINDS 08-09 BESTAAT.
         De aanlooptijd: hoeveel seconden bleef de app na het verbergen nog
         dóórlopen voordat Android hem stilzette. Op 02-09 was dat ~36 s, en
         dat getal is het bruikbaarste dat de hele rit opleverde — het bepaalt
         welke oplossing überhaupt zin heeft. Een foreground service hoeft geen
         milliseconden te winnen; hij moet een gat van deze orde overbruggen.
         Tot 7.3 kwam dat getal alleen uit met de hand naast elkaar gelegde
         logregels. Nu meet de hartslag het, en staat het in het verslag. */
      // De tweede helft van deze proef: is de socket bij terugkomst nagekeken?
      // Staat hier bovenaan omdat elke uitkomst hieronder hem meldt — de
      // achtergrondpauze en de dode socket zijn twee kanten van hetzelfde.
      const laatste = bgs.length ? bgs[bgs.length - 1] : null;
      const sock = laatste ? (laatste.socket || 'niet nagekeken (korter dan de drempel)') : '—';

      const aanloop = bgs.filter(function (x) { return typeof x.door === 'number' && x.stil; });
      const meet = aanloop.length
        ? '  |  aanlooptijd tot de bevriezing: ' + aanloop.map(function (x) { return x.door + ' s'; }).join(', ') +
          ' (daarna ' + aanloop.map(function (x) { return x.stil + ' s'; }).join(', ') + ' stil)'
        : '';

      /* AFKNIJPEN KOMT VÓÓR DE VERGELIJKING, EN DAT IS GEEN VOLGORDE MAAR EEN
         REDENERING. Knijpt Chromium een verborgen tab af naar één tik per
         minuut, dan ziet de hartslag een reeks stiltes van een minuut terwijl
         PLRit — die om de vijf seconden tikt — er één lang gat van maakt. Die
         twee getallen lopen dan per definitie uiteen, en de vergelijking
         hieronder zou daar LET OP op zetten met "een van beide telt iets
         anders mee". Dat is precies de vorm van de fout die deze ronde
         wegneemt: alarm slaan op een verschil waar de verklaring al bekend is.
         Staat de verklaring vast, dan hoort die er te staan — en niet het
         alarm eronder. */
      const afgeknepen = bgs.filter(function (x) { return typeof x.na === 'number' && x.na >= 3; });
      if (afgeknepen.length)
        return { staat: 'LET OP', detail: kop + meet + '  |  socket: ' + sock + ' — de meetlus is ' + afgeknepen.length +
          ' keer uit zichzelf weer gaan lopen terwijl de app nog weg was. Dat is Chromium die een verborgen tab AFKNIJPT ' +
          '(één tik per minuut), niet Android die het proces bevriest. Twee verschillende oorzaken met twee verschillende ' +
          'oplossingen; noteer het merk en de Android-versie erbij' };

      // Pas hier vergelijken, en alleen tussen twee getallen die hetzelfde
      // meten. Een kwart speling is ruim: PLRit tikt om de vijf seconden en
      // de hartslag om de seconde, dus een paar seconden verschil is de
      // resolutie en geen meetfout.
      if (bgStil >= 30 && grootste >= 30 && Math.abs(bgStil - grootste) > Math.max(15, grootste * 0.25))
        return { staat: 'LET OP', detail: kop + ' — het gat van PLRit (' + grootste + ' s) en de gemeten stilte (' + bgStil +
          ' s) lopen meer dan een kwart uiteen, terwijl ze hetzelfde horen te meten. Een van beide telt iets anders mee' };

      if (laatste && /ontbreekt/.test(String(laatste.socket)))
        return { staat: 'FOUT', detail: kop + '  |  socket: ' + sock + ' — de haak naar sppReconnectGuard is weg, ' +
          'dus de app komt weer per ongeluk achter een dode socket in plaats van met opzet' };

      if (!bgs.length && !sinds.length)
        return { staat: 'LET OP', detail: kop + ' — geen van beide bronnen zag een onderbreking. Ben je wel echt ' +
          'twee minuten weg geweest, en bleef de app draaien?' };

      return kop + meet + '  |  socket: ' + sock + ' — beide bronnen wijzen dezelfde kant op: de app weet dat hij weg was, ' +
        'meet hoe lang hij stillag en komt met opzet terug. De bevriezing zelf blijft native werk';
    }
  },

  // ── draait deze meting op de schil die je denkt? ──────────────
  // Twee keer op 11-09-2026 was dit de vraag, en beide keren pas achteraf.
  // Een native wijziging zit alleen in de APK; de webpagina laadt los bij.
  {
    issue: '#18',
    naam: 'De schil is de nieuwste die er ligt',
    waarom: 'Een native wijziging zit alleen in de APK. Draait de nieuwe pagina op een oude schil, dan meet je oude code terwijl het verslag er nieuw uitziet — en dat is een hele rit voor niets.',
    proef: async function () {
      if (!window.PLSchil) return { staat: 'FOUT', detail: 'PLSchil ontbreekt — dan staat er niet in het verslag welke schil deze meting opleverde (#18)' };
      const hier = PLSchil.bouw();
      if (hier === null)
        return { staat: 'LET OP', detail: 'geen schil-build te lezen: ' + PLSchil.reden() +
          ' — in een browser klopt dat, in de APK niet' };

      let daar = null;
      try { daar = await PLSchil.haalNieuwste(true); }
      catch (e) { return { staat: 'LET OP', detail: 'build ' + hier + '  |  de nieuwste build is niet op te halen: ' + (e.message || e) }; }
      if (!daar)
        return { staat: 'LET OP', detail: 'build ' + hier + '  |  niet te vergelijken: ' + PLSchil.nieuwsteReden() +
          '. Zonder /version.json is er niets om naast te leggen' };

      const achter = PLSchil.achterstand();
      const kop = 'schil build ' + hier + ', nieuwste in R2 ' + daar.versionCode +
        (daar.builtAt ? ' (gebouwd ' + daar.builtAt + ')' : '');
      if (achter === null)
        return { staat: 'LET OP', detail: kop + ' — de vergelijking leverde geen getal op' };
      // VOORUIT LOPEN MAG. Een build die zelf gemaakt en geïnstalleerd is
      // loopt vóór op R2; dat is geen bevinding maar het vermelden waard,
      // want dan meet je iets wat niemand anders heeft.
      if (achter < 0)
        return { staat: 'LET OP', detail: kop + ' — deze schil loopt ' + (-achter) + ' build(s) VOOR op wat er in R2 ligt. ' +
          'Dat kan (zelf gebouwd), maar wat je hier meet staat dan bij niemand anders' };
      if (achter > 0)
        return { staat: 'LET OP', detail: kop + ' — de schil loopt ' + achter + ' build(s) achter. Native wijzigingen ' +
          'uit die builds zitten NIET in deze meting; de webpagina is wel bij. Installeer de nieuwe APK ' +
          'vóór je een native bevinding uit deze rit trekt (#18)' };
      return kop + ' — gelijk, dus wat er gemeten wordt is wat er gebouwd is';
    }
  },

  // ── #18: doet de native meetdienst wat hij belooft? ───────────
  // De vorige proef meet wat de WEBVIEW deed. Deze meet wat het PROCES deed,
  // en dat verschil is de hele reden dat de meetdienst bestaat: van buiten
  // zien een bevroren proces en een afgeknepen pagina er hetzelfde uit, en ze
  // vragen om een andere oplossing.
  {
    issue: '#18',
    naam: '#18 — houdt de native meetdienst het proces aan de praat?',
    waarom: 'Of een foreground service de bevriezing wegneemt, is met redeneren niet te beantwoorden — Chromium throttelt op zichtbaarheid en niet op procesprioriteit. Alleen twee hartslagen naast elkaar zeggen welk van de twee mechanismen de meting stilzette.',
    proef: async function () {
      const schil = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      if (!window.PLMeetdienst)
        return { staat: 'FOUT', detail: 'PLMeetdienst ontbreekt — dan is er niets dat het proces wakker houdt ' +
          'en niets dat meet of dat zou helpen (#18)' };
      if (!schil)
        return { staat: 'LET OP', detail: 'geen Capacitor-schil (browser of PWA) — een foreground service bestaat hier niet, ' +
          'dus over #18 zegt deze proef niets' };
      if (!PLMeetdienst.beschikbaar())
        return { staat: 'FOUT', detail: 'de schil heeft geen native meetdienst: ' + (PLMeetdienst.reden() || 'reden onbekend') +
          '. Dit is een APK van vóór de meetdienst, óf de plugin is niet geregistreerd — en die twee zijn van binnenuit ' +
          'niet te onderscheiden (#18)' };

      let st = {};
      try { st = (await PLMeetdienst.status()) || {}; }
      catch (e) { return { staat: 'LET OP', detail: 'PLMeetdienst.status() gaf een fout: ' + (e.message || e) }; }

      const moet = PLMeetdienst.nodig();
      const kop = 'schil met meetdienst (Android SDK ' + (st.sdk || '?') + '), hartslag ' + (st.hartslagMs || '?') + ' ms  |  ' +
        'verbonden: ' + (moet ? 'ja' : 'nee') + ', dienst draait: ' + (st.draait ? 'ja' : 'nee');

      // DE HARDE POORT. Er is een echte adapterverbinding, dus de dienst hoort
      // te draaien. Doet hij dat niet, dan valt de meting bij het eerste
      // wegschakelen stil op precies de manier waar #18 over gaat — en de
      // reden staat klaar, want die is bij het starten bewaard.
      if (moet && !st.draait)
        return { staat: 'FOUT', detail: kop + ' — er is verbinding maar de meetdienst draait niet: ' +
          (PLMeetdienst.reden() || 'geen reden vastgelegd') + '. Op de achtergrond valt de meting dan stil (#18)' };
      if (!moet && st.draait)
        return { staat: 'LET OP', detail: kop + ' — de dienst draait zonder verbinding. Dat is een melding in de ' +
          'statusbalk zonder meting eronder; hij hoort mee te stoppen met de verbinding' };

      // En dan de meting zelf, als de achtergrondstap gedaan is.
      const m = T.markeringenRuw().filter(function (x) { return /achtergrond in/i.test(x.tekst); }).pop();
      if (!m) return kop + ' — de dienst staat goed; de achtergrondstap is niet gedaan, dus over de bevriezing ' +
        'zegt deze rit nog niets';

      let bgs = [];
      try { bgs = (window.PLAchtergrond && PLAchtergrond.sinds(m.ms - 2000)) || []; }
      catch (e) { return { staat: 'LET OP', detail: kop + ' — PLAchtergrond.sinds() gaf een fout' }; }
      const metNative = bgs.filter(function (x) { return x.native && x.native.gemeten; });
      if (!bgs.length)
        return { staat: 'LET OP', detail: kop + ' — geen onderbreking sinds de markering. Ben je wel echt weg geweest?' };
      if (!metNative.length)
        return { staat: 'LET OP', detail: kop + ' — de app was weg, maar er is geen native meting bij die periode ' +
          'terechtgekomen: ' + ((bgs[bgs.length - 1].native && bgs[bgs.length - 1].native.reden) || 'reden onbekend') +
          '. Dan valt er niets naast de hartslag van de webview te leggen (#18)' };

      /* DIT IS DE UITKOMST WAAR DE HELE RONDE OM DRAAIT, en hij wordt met
         opzet niet als FOUT geboekt. Alle drie de mogelijkheden zijn een
         geldig meetresultaat; twee ervan wijzen alleen een andere kant op dan
         gehoopt. Een bevinding maken van "het werkte niet" zou de meting
         verwarren met het oordeel — dezelfde fout die deze proef bij zijn
         buurman hierboven op 08-09 kwam repareren. */
      const p = metNative[metNative.length - 1];
      const zin = PLMeetdienst.duiding(p.native, p);
      const rest = metNative.length > 1 ? '  |  ' + (metNative.length - 1) + ' eerdere periode(n) ook gemeten' : '';
      const opgelost = p.native.stil <= 3 && typeof p.stil === 'number' && p.stil <= 3;
      if (opgelost) return kop + '  |  ' + zin + rest;
      return { staat: 'LET OP', detail: kop + '  |  ' + zin + rest };
    }
  },

  // ── #17: UTC in de recorder, lokale tijd in de logger ──────────
  // Dit is de goedkoopste van de zes en had er allang moeten staan: het bewijs
  // ligt in het sessie-id van de recorder en op de klok van het toestel. Tot nu
  // toe stond het alleen als beschrijving in het issue.
  {
    issue: '#17',
    naam: '#17 — schrijft de bulk-recorder dezelfde tijd als de logger?',
    waarom: 'Het bewijs ligt in het sessie-id van de recorder naast het epoch-moment waarop hij begon.',
    proef: function () {
      if (!window.PLBulk || !PLBulk.status) return { staat: 'LET OP', detail: 'PLBulk ontbreekt' };
      if (typeof plStempelLokaal !== 'function')
        return { staat: 'FOUT', detail: 'plStempelLokaal() ontbreekt — dan bouwt de recorder zijn id weer met UTC (#17)' };
      let st = {};
      try { st = PLBulk.status() || {}; } catch (e) { return { staat: 'LET OP', detail: 'PLBulk.status() gaf een fout' }; }
      if (!st.sessie) return { staat: 'LET OP', detail: 'geen sessie-id — de recorder heeft deze rit niet gelopen' };
      if (!st.gestart) return { staat: 'FOUT', detail: 'PLBulk.status() geeft geen `gestart` mee — zonder dat epoch-getal ' +
        'is het etiket nergens meer aan te toetsen (#17)' };

      // Het epoch-moment is de waarheid (PIDLANE-CONTRACT.md §6); het id is er
      // het etiket van. Ze horen exact hetzelfde moment te noemen, in de klok
      // die de gebruiker op het scherm ziet. Niet vergelijken met de klok van
      // NU: de recorder kan uren geleden begonnen zijn.
      const hoort = 'blk-' + plStempelLokaal(st.gestart);
      const offsetMin = -new Date().getTimezoneOffset();
      const kop = 'recorder-id "' + String(st.sessie) + '", gestart ' +
        new Date(st.gestart).toTimeString().slice(0, 8) + ' lokaal (klok ' +
        (offsetMin >= 0 ? '+' : '') + (offsetMin / 60) + ' uur t.o.v. UTC)';

      if (/Z$/.test(String(st.sessie)))
        return { staat: 'FOUT', detail: kop + ' — het id eindigt op Z en claimt daarmee UTC. Dat was de leugen ' +
          'uit #17: de app-log ernaast schrijft lokale tijd' };
      if (String(st.sessie) !== hoort)
        return { staat: 'FOUT', detail: kop + ' — verwacht "' + hoort + '". Het etiket loopt niet gelijk met het ' +
          'moment waarop de recorder begon, en dan zijn twee bestanden van dezelfde rit niet naast elkaar te leggen (#17)' };
      if (offsetMin === 0)
        return kop + ' — het id klopt met het startmoment, maar dit toestel stáát op UTC, dus het verschil uit #17 ' +
          'zou hier hoe dan ook niet zichtbaar zijn. Meet dit nog eens in de zomertijd of met een andere tijdzone';
      return kop + ' — het id draagt exact dat moment in dezelfde klok als het logboek';
    }
  },

  // ── #29: meldt blok 14 een opruiming die echt gebeurd is? ───────
  // De reparatie van 01-09 liet blok 14 aan de gate meten in plaats van in een
  // aflopend log. Wat sindsdien ontbreekt is een rit waarin de regel óók echt
  // vuurt — anders is "niets opgeruimd" nog steeds niet te onderscheiden van
  // "niet gezien". Deze proef legt de twee bronnen naast elkaar.
  {
    issue: '#29',
    naam: '#29 — ziet blok 14 een opruiming die echt gebeurde?',
    waarom: 'Legt de gate en het opruimlog naast elkaar: niets opgeruimd, of niet gezien?',
    proef: function () {
      let lijst = null;
      try { if (typeof pidOpgeruimdLijst === 'function') lijst = pidOpgeruimdLijst(); }
      catch (e) { return { staat: 'LET OP', detail: 'pidOpgeruimdLijst() gaf een fout — dan is er geen bron' }; }
      if (!lijst) return { staat: 'LET OP', detail: 'pidOpgeruimdLijst() ontbreekt — blok 14 leest dan weer een log (#29)' };
    // pidOpgeruimdLijst() geeft {pid, naam, reden} — geen strings. De run van
    // 02-09 22:15 zette daar "gate: [object Object]" van in het verslag en trok
    // er wél een stellige conclusie uit. Het oordeel klopte toevallig, maar het
    // bewijs eronder was onleesbaar, en dat is precies de vorm die §11 zes keer
    // beschrijft. Vandaar hier uitpakken in plaats van joinen.
    const _naam = function (x) {
      if (x && typeof x === 'object') return (x.pid || '?') + (x.naam ? ' (' + x.naam + ')' : '');
      return String(x);
    };
    const gate = (lijst && lijst.size !== undefined) ? Array.from(lijst)
               : (Array.isArray(lijst) ? lijst : Object.keys(lijst || {}));
      let bt = [];
      try { bt = (typeof _btLog !== 'undefined' && _btLog) ? _btLog : []; }
      catch (e) { bt = []; console.warn('Testrun: BT-log onleesbaar bij de #29-proef', e); }
      // Ontdubbelen (#104): btDiag en log krijgen dezelfde opruiming, dus zonder
      // dit telt deze proef er twee waar er één gebeurde.
      const regels = _opruimOntdubbel([].concat(bt || [], _appLogRegels() || []), /opgeruimd/i);
    const kop = 'gate: ' + (gate.length ? gate.map(_naam).join(', ') : 'leeg') + '  |  logregels met "opgeruimd": ' + regels.length;
      if (!gate.length && !regels.length)
        return { staat: 'LET OP', detail: kop + ' — er is deze rit niets opgeruimd, dus #29 is niet te toetsen. ' +
          'De regel heeft vijf pogingen plus vijf herkansingen nodig: rijd langer, of neem een sensor mee die zwijgt' };
      if (gate.length && !regels.length)
        return kop + ' — de gate meldt een opruiming die niet meer in de logs staat. Precies daarom leest blok 14 sinds ' +
          '01-09 de gate: het log is een ringbuffer en wist zijn eigen bewijs. #29 KAN DICHT';
      if (!gate.length && regels.length)
        return { staat: 'FOUT', detail: kop + ' — het log meldt een opruiming en de gate niet. Dat is de fout van #29 ' +
          'in spiegelbeeld: nu is de gate de bron die iets mist' };
      return kop + ' — gate en log wijzen dezelfde kant op: blok 14 ziet wat er echt gebeurde. #29 KAN DICHT';
    }
  },

  // ── verbergt een dubbeltik, of zet hij nog steeds uit? ──
  // In node is dit tot op de laatste tak getoetst, maar altijd tegen een
  // nagebootste DOM. Wat daar niet te zien is, is of de strook in de
  // dráaiende app bestaat en of het gebaar bij de echte tegels aankomt —
  // precies het soort verbinding dat bij #29, #74 en #52 ontbrak zonder ooit
  // een fout te geven. Deze proef verbergt een tegel, kijkt, en zet hem terug.
  {
    issue: '#61',
    naam: 'Een dubbeltik verbergt de tegel en laat de meting met rust',
    waarom: 'Of het gebaar bij de echte tegels aankomt en de strook echt bestaat, is alleen in de draaiende app te zien.',
    proef: function () {
      if (typeof pidVerberg !== 'function' || typeof pidToon !== 'function')
        return { staat: 'FOUT', detail: 'pidVerberg()/pidToon() ontbreken — dan zet een dubbeltik de sensor weer uit in plaats van hem te verbergen' };
      const strook = document.getElementById('verborgenStrook');
      if (!strook)
        return { staat: 'FOUT', detail: '#verborgenStrook staat niet in index.html — een verborgen tegel is dan nergens meer terug te halen' };

      const kandidaat = Array.from(activePIDs).find(function (p) {
        return !pidVerborgen(p) && document.getElementById('gc-' + p);
      });
      if (!kandidaat)
        return { staat: 'LET OP', detail: 'geen zichtbare tegel om mee te proeven — kies eerst sensoren en open de live view' };

      const naam = (getPidDef(kandidaat) || {}).name || kandidaat;
      const voorAantal = activePIDs.size;
      const voorWaarde = pidVals[kandidaat];

      pidVerberg(kandidaat);
      const tegelWeg = !document.getElementById('gc-' + kandidaat);
      const inStrook = !!document.getElementById('vb-' + kandidaat);
      const nogGeselecteerd = activePIDs.has(kandidaat);
      const zelfdeAantal = (activePIDs.size === voorAantal);
      const kopt = String(strook.textContent || '');

      // Terugzetten, hoe de proef ook afloopt: deze rit gaat niet over een
      // tegel die ik heb weggeklikt.
      pidToon(kandidaat);
      const terug = !!document.getElementById('gc-' + kandidaat);

      if (!nogGeselecteerd || !zelfdeAantal)
        return { staat: 'FOUT', detail: 'verbergen van "' + naam + '" haalde de sensor uit de selectie (' +
          voorAantal + ' → ' + activePIDs.size + ') — dan wordt er niet meer gemeten, en dat is precies wat verbergen niet is' };
      if (!tegelWeg)
        return { staat: 'FOUT', detail: 'de tegel van "' + naam + '" bleef staan na pidVerberg() — het gebaar komt niet bij de tegel aan' };
      if (!inStrook)
        return { staat: 'FOUT', detail: '"' + naam + '" verdween maar staat niet in de strook onderaan — dan is hij niet terug te halen' };
      if (!terug)
        return { staat: 'FOUT', detail: '"' + naam + '" kwam na pidToon() niet terug in beeld; deze proef heeft een tegel achtergelaten' };
      if (!/gemeten/i.test(kopt))
        return { staat: 'FOUT', detail: 'de strook zegt nergens dat er dóórgemeten wordt ("' + kopt.slice(0, 60) +
          '") — dan is "verborgen" niet van "uit" te onderscheiden' };
      if (voorWaarde !== undefined && pidVals[kandidaat] === undefined)
        return { staat: 'FOUT', detail: 'de waarde van "' + naam + '" is tijdens het verbergen verdwenen uit pidVals' };

      const nu = Array.from(activePIDs).filter(function (p) { return pidVerborgen(p); }).length;
      return '"' + naam + '" verborgen en teruggehaald: selectie bleef ' + voorAantal +
        ', de strook noemde hem, en de kop zegt dat er doorgemeten wordt. Nu verborgen: ' + nu;
    }
  },

  // ── deelt de slimme weergave DEZE auto goed in? ──
  // slimMaat() is in node getoetst op een verzonnen setje PIDs. Wat daar niet
  // te zien is, is hoe de indeling uitpakt op de sensoren die déze auto
  // werkelijk levert: welke er stil liggen, of er iets in twee vakken tegelijk
  // hangt, en of twee meters op de tellerplaat dezelfde naam dragen. Dat
  // laatste hangt aan de combinatie van PIDs en niet aan de code, dus het is
  // per auto een andere vraag — precies het soort dat alleen hier te stellen is.
  {
    issue: '#61',
    naam: 'De slimme weergave deelt de sensoren van deze auto in',
    waarom: 'Hoe de maat uitpakt hangt aan de sensoren die déze auto levert; in node is die combinatie verzonnen.',
    proef: function () {
      const vakken = ['dash', 'meter', 'temp', 'rest', 'rustig'];
      const inhoud = {}, gezien = {};
      let totaal = 0, dubbel = [];
      for (const g of vakken) {
        const box = document.getElementById('slimVak-' + g);
        if (!box) return { staat: 'LET OP', detail: 'vak "' + g + '" bestaat niet in de DOM — de live view staat ' +
          'waarschijnlijk niet in de slimme weergave, dus er valt niets in te delen' };
        inhoud[g] = Array.from(box.children).map(function (c) { return String(c.id).slice(3); });
        totaal += inhoud[g].length;
        for (const pid of inhoud[g]) {
          if (gezien[pid]) dubbel.push(pid + ' (' + gezien[pid] + ' én ' + g + ')');
          gezien[pid] = g;
        }
      }
      if (!totaal) return { staat: 'LET OP', detail: 'er staat geen enkele tegel in beeld — kies eerst sensoren' };

      const kop = vakken.map(function (g) { return g + ' ' + inhoud[g].length; }).join(' · ');
      const naamVan = function (pid) {
        try { const d = getPidDef(pid); return (d && d.name) || pid; } catch (e) { return pid; }
      };

      // 1. Een tegel in twee vakken tegelijk. Dat kán alleen als een
      //    verplaatsing hem niet bij zijn oude ouder weghaalde, en dan staat
      //    dezelfde meting twee keer in beeld met twee verschillende vormen.
      if (dubbel.length)
        return { staat: 'FOUT', detail: kop + ' — dezelfde tegel hangt in twee vakken: ' + dubbel.join(', ') };

      // 2. Twee meters met dezelfde naam op de tellerplaat. In node getoetst op
      //    vijf vaste PIDs; welke combinatie déze auto levert is een andere vraag.
      const labels = {}, botsing = [];
      for (const pid of inhoud.meter) {
        const el = document.getElementById('gc-' + pid);
        const t = el ? String(el.textContent || '').toUpperCase() : '';
        const naam = t ? t.replace(/[\d.,%°λ\s]+/g, ' ').trim() : naamVan(pid).toUpperCase();
        if (labels[naam]) botsing.push('"' + naam + '" op ' + labels[naam] + ' én ' + pid);
        labels[naam] = pid;
      }
      if (botsing.length)
        return { staat: 'FOUT', detail: kop + ' — twee meters op de tellerplaat dragen dezelfde naam: ' +
          botsing.join(', ') + '. De plaat wijst dan een signaal aan zonder te zeggen welk (#68)' };

      // 3. En de waarneming zelf: wat ligt er op déze auto stil? Dat is geen
      //    fout maar de vraag die de rit moet beantwoorden — is dit inderdaad
      //    wat je niet groot in beeld wilt hebben?
      const stil = inhoud.rustig.map(naamVan);
      return kop + (stil.length ? ' — stil deze rit: ' + stil.join(', ') : ' — niets ligt stil; alles beweegt of heeft nog te weinig historie');
    }
  },

  // ── passen de namen op de tellerplaat op DIT scherm? ──
  // bproef-plaatnamen.js meet dit ook, en preciezer: alle 146 namen. Maar hij
  // meet ze op de standaard tekstgrootte, in één vensterbreedte, met een
  // demo-auto. Hier staat de plaat zoals hij nu is: de sensoren die déze auto
  // levert, de tekstgrootte die deze gebruiker koos (S/M/L schaalt de hele
  // app), en het lettertype dat dit toestel werkelijk gebruikt. Dat is een
  // andere vraag dan "past het in het harnas", en alleen hier te stellen.
  {
    issue: '#95',
    naam: 'De namen op de tellerplaat passen op dit scherm',
    waarom: 'De kolombreedte hangt aan het aantal meters van déze auto en de tekstgrootte van deze gebruiker.',
    proef: function () {
      const labels = document.querySelectorAll('.slim-meter .gn2');
      if (!labels.length)
        return { staat: 'LET OP', detail: 'geen tellerplaat in beeld — de live view staat niet in de slimme ' +
          'weergave, of er staan geen meters op' };

      const lh = parseFloat(getComputedStyle(labels[0]).lineHeight) || 0;
      if (!lh) return { staat: 'LET OP', detail: 'de regelhoogte is niet uit te lezen — dan valt er niets te meten' };

      const teveel = [], terugval = [], namen = {}, dubbel = [];
      let breedte = 0;
      labels.forEach(function (el) {
        const t = String(el.textContent || '').trim();
        if (!t) return;
        breedte = Math.round(el.getBoundingClientRect().width);
        // De CSS geeft de naam twee regels (-webkit-line-clamp:2). Meer dan dat
        // wordt afgekapt, en juist het staartje van een naam is wat hem van de
        // meter ernaast onderscheidt.
        const regels = Math.round(el.scrollHeight / lh);
        if (regels > 2) {
          // Twee heel verschillende oorzaken, en ze mogen niet op één hoop.
          // slimMeterLabels() zet bij een BOTSING met opzet de volledige naam
          // terug — "leesbaar verkeerd is erger dan lang", en die keuze staat
          // los van deze grens. Zo'n naam kan best over drie regels lopen; dat
          // is een bekend gevolg, geen fout. Loopt een AFGEKORTE naam eroverheen,
          // dan is de grens zelf te ruim voor dit scherm, en dat is #95.
          const kaart = el.closest ? el.closest('.gc') : null;
          const pid = kaart ? String(kaart.id).slice(3) : '';
          let vol = '';
          try { const d = getPidDef(pid); vol = (d && d.name) || ''; } catch (e) { vol = ''; }
          if (vol && vol.toUpperCase() === t.toUpperCase()) terugval.push('"' + t + '"');
          else teveel.push('"' + t + '" (' + regels + ' regels)');
        }
        const sleutel = t.toUpperCase();
        if (namen[sleutel]) dubbel.push('"' + t + '"');
        namen[sleutel] = true;
      });

      const kop = labels.length + ' meters, kolom ' + breedte + 'px, regelhoogte ' + Math.round(lh * 10) / 10 + 'px';
      if (dubbel.length)
        return { staat: 'FOUT', detail: kop + ' — twee meters dragen dezelfde naam: ' + dubbel.join(', ') +
          '. De plaat wijst dan een signaal aan zonder te zeggen welk (#68)' };
      if (teveel.length)
        return { staat: 'FOUT', detail: kop + ' — een AFGEKORTE naam loopt over twee regels heen: ' +
          teveel.join(', ') + '. Op dit scherm is SLIM_METER_MAX dus te ruim (#95)' };
      const staart = terugval.length
        ? ' (' + terugval.join(', ') + ' viel terug op de volledige naam bij een botsing en wordt na twee regels ' +
          'afgekapt — bekend gevolg van die terugval, de volledige naam staat in de tooltip)'
        : '';
      return kop + ' — alle afgekorte namen passen binnen twee regels: ' +
        Object.keys(namen).length + ' verschillende' + staart;
    }
  },

  // ── blijven de onderste vellen boven de navigatiebalk? ──
  // bproef-schermranden.js meet dit ook, maar met een NAGEBOOTSTE inset van
  // 48px: in een browser is --pl-sab altijd 0px. Op dit toestel is hij echt —
  // Capacitor leest hem uit WindowInsetsCompat — en dat maakt dit de enige
  // plek waar de vraag over dít scherm beantwoord wordt, met dít lettertype
  // en déze knophoogtes. Vandaar hier én daar, en niet alleen daar.
  {
    issue: '#71',
    naam: 'De onderste vellen blijven boven de navigatiebalk',
    waarom: 'Alleen op een toestel is --pl-sab echt gevuld; in een browser is hij 0px en ziet elk vel er goed uit.',
    proef: function () {
      const sab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pl-sab')) || 0;
      if (sab <= 0)
        return { staat: 'LET OP', detail: '--pl-sab is 0px op dit toestel — er is hier geen navigatiebalk om ' +
          'achter te vallen, dus deze proef kan niets vaststellen. bproef-schermranden.js meet het na met 48px' };

      const VELLEN = [
        { naam: 'demo-autokiezer', open: 'openDemoCarChooser', id: 'demoCarModal' },
        { naam: 'rijsituatie', open: 'openSituatie', id: 'situatieSheet' },
        { naam: 'voertuigoverzicht', open: 'openVehicleOverview', id: 'vehOverview' }
      ];
      const krap = [], gemeten = [], over = [];

      for (const v of VELLEN) {
        if (typeof window[v.open] !== 'function') { over.push(v.naam + ' (' + v.open + '() bestaat niet)'); continue; }

        // De stand van vóór de proef onthouden. Een vel dat er al stond mag
        // hier niet dicht- of opengaan: dan verandert deze proef het scherm
        // van de gebruiker, en dat is geen meten meer.
        const bestond = document.getElementById(v.id);
        const oudeStand = bestond ? bestond.style.display : null;

        try { window[v.open](); }
        catch (e) { over.push(v.naam + ' (openen mislukte: ' + e.message + ')'); continue; }

        const m = document.getElementById(v.id);
        if (!m) { over.push(v.naam + ' (bouwde geen #' + v.id + ' — functie uitgeschakeld?)'); continue; }

        // Naar beneden scrollen zoals een gebruiker doet om de onderste knop
        // te bereiken; wat daarna nog onder de onderrand hangt is niet in beeld
        // en zegt dus niets.
        m.querySelectorAll('*').forEach(function (e) { if (e.scrollHeight > e.clientHeight + 2) e.scrollTop = e.scrollHeight; });
        let laagste = null, onder = -1e9;
        m.querySelectorAll('button,input,textarea,select,a').forEach(function (e) {
          const r = e.getBoundingClientRect();
          if (r.height <= 0 || r.top > window.innerHeight) return;
          if (r.bottom > onder) { onder = r.bottom; laagste = e; }
        });

        if (bestond) m.style.display = oudeStand;
        else m.style.display = 'none';

        if (!laagste) { over.push(v.naam + ' (geen zichtbare knop)'); continue; }
        const ruimte = Math.round(window.innerHeight - onder);
        const knop = String(laagste.textContent || laagste.id || laagste.tagName).trim().slice(0, 20);
        gemeten.push(v.naam + ' ' + ruimte + 'px');
        if (ruimte < sab) krap.push(v.naam + ': ' + ruimte + 'px onder "' + knop + '"');
      }

      if (!gemeten.length)
        return { staat: 'LET OP', detail: 'geen enkel vel gemeten — ' + (over.join('; ') || 'onbekende reden') };

      const kop = 'navigatiebalk ' + Math.round(sab) + 'px; ruimte onder de laagste knop: ' + gemeten.join(', ');
      if (krap.length)
        return { staat: 'FOUT', detail: kop + ' — te krap bij ' + krap.join(' en ') +
          '. Die knop zit deels achter de Android-knoppen (#71)' };
      return kop + (over.length ? ' (niet gemeten: ' + over.join('; ') + ')' : '');
    }
  },

  // ── #144: het Run-venster, en waarom de knopmaat hier niet volstaat ──
  // De proef hierboven meet de laagste KNOP. Dat is precies de maat die #144
  // liet lopen: bij het Run-venster stond de knop met 65px ruim boven de balk
  // terwijl de uitleg eronder op 43px lag — leesbaar noch te raken. Sinds #123
  // hangt de bevindingenschakelaar met zijn tekst onderaan dit paneel, en op
  // een kort scherm gaat de bak daardoor scrollen.
  //
  // Waarom óók hier en niet alleen in bproef-schermranden.js: daar is de inset
  // nagebootst op 48px. Op dít toestel is hij echt, en de tekst wordt met dít
  // lettertype gezet — een regel die in de browser net past, kan hier omslaan
  // en dan is de onderste regel een andere.
  {
    issue: '#144',
    naam: 'De onderste regel van het Run-venster blijft leesbaar',
    waarom: 'De knopmaat stond hier groen terwijl de tekst eronder achter de balk lag; alleen op een toestel is --pl-sab echt.',
    proef: function () {
      const sab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pl-sab')) || 0;
      if (sab <= 0)
        return { staat: 'LET OP', detail: '--pl-sab is 0px op dit toestel — geen navigatiebalk om achter te ' +
          'vallen. bproef-schermranden.js meet het na met 48px op een kort scherm' };
      if (typeof openRunPaneel !== 'function')
        return { staat: 'FOUT', detail: 'openRunPaneel() ontbreekt — dan is het Run-venster niet te openen (#144)' };

      // Stond hij al open, dan laten we hem open: deze proef hoort het scherm
      // van de gebruiker niet te veranderen.
      const bestond = document.getElementById('runOv');
      const stondOpen = !!bestond && bestond.style.display !== 'none';

      try { openRunPaneel(); }
      catch (e) { return { staat: 'FOUT', detail: 'Run-venster openen mislukte: ' + e.message }; }

      const m = document.getElementById('runOv');
      if (!m) return { staat: 'FOUT', detail: 'openRunPaneel() bouwde geen #runOv' };

      // De bak ZELF scrollen, niet alleen wat eronder hangt: #runOv draagt de
      // overflow. Zonder deze regel meet je de bovenkant van een paneel dat je
      // nooit hebt uitgescrold.
      if (m.scrollHeight > m.clientHeight + 2) m.scrollTop = m.scrollHeight;
      m.querySelectorAll('*').forEach(function (e) { if (e.scrollHeight > e.clientHeight + 2) e.scrollTop = e.scrollHeight; });

      let knopOnder = -1e9;
      m.querySelectorAll('button,input,textarea,select,a').forEach(function (e) {
        const r = e.getBoundingClientRect();
        if (r.height <= 0 || r.top > window.innerHeight) return;
        if (r.bottom > knopOnder) knopOnder = r.bottom;
      });

      // De laagste zichtbare TEKST. Een Range om de tekstknoop geeft de regel
      // zelf en niet de doos eromheen — anders meet je de volschermwikkel, en
      // die loopt per definitie tot de onderrand.
      const loper = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
      const bereik = document.createRange();
      let tekstOnder = -1e9, tekst = null;
      for (let n = loper.nextNode(); n; n = loper.nextNode()) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const ouder = n.parentElement;
        if (!ouder) continue;
        const st = getComputedStyle(ouder);
        if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) continue;
        bereik.selectNodeContents(n);
        const r = bereik.getBoundingClientRect();
        if (r.height <= 0 || r.top > window.innerHeight) continue;
        if (r.bottom > tekstOnder) { tekstOnder = r.bottom; tekst = n.nodeValue.trim().slice(0, 24); }
      }

      const scrolde = m.scrollHeight > m.clientHeight + 2;
      if (!stondOpen) { try { PLRun.sluit(); } catch (e) { m.style.display = 'none'; } }

      if (tekstOnder === -1e9)
        return { staat: 'LET OP', detail: 'geen zichtbare tekst in het Run-venster — niets te meten' };

      const ruimteTekst = Math.round(window.innerHeight - tekstOnder);
      const ruimteKnop = knopOnder === -1e9 ? null : Math.round(window.innerHeight - knopOnder);
      const kop = 'navigatiebalk ' + Math.round(sab) + 'px; onderste regel "' + tekst + '" op ' +
        ruimteTekst + 'px' + (ruimteKnop === null ? '' : ', laagste knop op ' + ruimteKnop + 'px') +
        (scrolde ? '; het paneel scrolde' : '; het paneel paste in beeld');

      if (ruimteTekst < sab)
        return { staat: 'FOUT', detail: kop + ' — die regel ligt ' + Math.round(sab - ruimteTekst) +
          'px achter de Android-knoppen (#144)' };
      return kop;
    }
  },

  // ══════════════════════════════════════════════════════════════
  // DRIE PROEVEN DIE DE RIT LATEN VASTLEGGEN WAT NU VAN OPLETTEN AFHANGT
  // ──────────────────────────────────────────────────────────────
  // #66, #64 en #133 staan alle drie open met dezelfde vorm: het antwoord is
  // alleen tijdens een rit te geven, en het staat in de issues als "kijk of
  // het klopt". Kijken is geen meten — wat er dan van een rit terugkomt is een
  // herinnering, en die is er de volgende ronde niet meer.
  //
  // Deze drie zetten het in het verslag, met een echte faaltoestand erin; een
  // blok dat alleen kán rapporteren wordt na twee ritten niet meer gelezen.
  // ══════════════════════════════════════════════════════════════

  // ── #66: is 2% van het bereik de goede drempel voor "beweegt"? ──
  // Het issue vraagt om een oordeel dat een machine niet kan geven: staat er
  // een lijn waar je er een wilt. Wat de machine wél kan is de meting eronder
  // opschrijven — per sensor het bereik tegen de drempel — zodat die vraag ná
  // de rit met getallen te beantwoorden is in plaats van uit het hoofd. De
  // faaltoestand is de ijkvraag uit het issue zelf: draait de motor, dan MOET
  // het toerental bewegen. Doet het dat niet, dan is niet de drempel verkeerd
  // maar de reeks eronder stuk.
  {
    issue: '#66',
    naam: 'De drempel voor "beweegt" scheidt beweging van stilstand',
    waarom: 'Alleen tijdens een rit beweegt er iets; stilstaand is de vraag niet te beantwoorden.',
    proef: function () {
      if (typeof slimBeweegt !== 'function' || typeof SLIM_BEWEEG_DEEL !== 'number')
        return { staat: 'FOUT', detail: 'slimBeweegt() of SLIM_BEWEEG_DEEL ontbreekt — dan tekent de ' +
          'slimme weergave geen enkele trendlijn meer (#66)' };

      let lijst = [];
      try { lijst = [...(activePIDs || [])]; } catch (e) { return { staat: 'LET OP', detail: 'activePIDs onleesbaar' }; }

      // Twee cijfers is genoeg en houdt de regel leesbaar: een drempel van
      // 0,0032 zegt evenveel als 0,003 en een bereik van 812,4 als 812.
      const afr = function (x) { return (Math.abs(x) >= 10) ? Math.round(x) : Math.round(x * 100) / 100; };

      const beweegt = [], stil = [], krap = [];
      lijst.forEach(function (pid) {
        let d = null;
        try { d = (typeof getPidDef === 'function') ? getPidDef(pid) : null; } catch (e) { return; }
        const h = (typeof pidHist !== 'undefined') && pidHist[pid];
        if (!Array.isArray(h) || h.length < 4) return;
        const v = h.slice(-24).map(function (x) { return x.v; })
                   .filter(function (x) { return typeof x === 'number' && isFinite(x); });
        if (v.length < 4) return;
        const rg = Math.max.apply(null, v) - Math.min.apply(null, v);
        const span = (d && typeof d.max === 'number' && typeof d.min === 'number') ? (d.max - d.min) : 0;
        const gem = v.reduce(function (a, b) { return a + b; }, 0) / v.length;
        const drempel = span > 0 ? span * SLIM_BEWEEG_DEEL : Math.abs(gem) * SLIM_BEWEEG_DEEL;
        let uit = false;
        try { uit = !!slimBeweegt(pid, d); } catch (e) { return; }
        const naam = (d && d.name) || pid;
        const regel = naam + ' ' + afr(rg) + '/' + afr(drempel);
        if (uit) beweegt.push(regel); else stil.push(regel);
        // Wat vlak onder de drempel zit is de interessantste groep: dáár
        // beslist die 2% werkelijk iets, en dáár hoort de vraag "te hoog of
        // te laag?" thuis.
        if (!uit && drempel > 0 && rg > drempel * 0.5) krap.push(regel);
      });

      if (!beweegt.length && !stil.length)
        return { staat: 'LET OP', detail: 'geen enkele sensor heeft genoeg geschiedenis — ' +
          'stilstaand of net verbonden valt hier niets over te zeggen' };

      let rpm = null;
      try { rpm = (typeof pidVals !== 'undefined') ? pidVals['010C'] : null; } catch (e) { /* stil: pidVals kan ontbreken */ }
      const rpmH = (typeof pidHist !== 'undefined') && pidHist['010C'];
      const rpmGemeten = Array.isArray(rpmH) && rpmH.length >= 4;
      let rpmBeweegt = false;
      try { rpmBeweegt = !!slimBeweegt('010C', (typeof getPidDef === 'function') ? getPidDef('010C') : null); }
      catch (e) { console.warn('slimBeweegt() op het toerental mislukte bij de #66-proef', e); }

      const kop = 'drempel ' + (Math.round(SLIM_BEWEEG_DEEL * 1000) / 10) + '% van het bereik; ' +
        beweegt.length + ' bewegen, ' + stil.length + ' stil' +
        (beweegt.length ? '. Beweegt: ' + beweegt.slice(0, 6).join(', ') : '') +
        (krap.length ? '. Vlak onder de drempel: ' + krap.slice(0, 6).join(', ') : '');

      /* DE IJKVRAAG, HERZIEN NA DE RIT VAN 09-09-2026.

         Hier stond: draait de motor en telt het toerental niet als bewegend,
         dan is FOUT — "dan is niet de drempel verkeerd maar de reeks eronder".
         Die proef sloeg op zijn eerste rit meteen alarm, en hij had ongelijk.
         Gemeten om 13:27, stationair op 652 rpm: het toerental had een bereik
         van 108 tegen een drempel van 160. Dat is geen kapotte reeks — dat is
         een motor die stationair 108 toeren op en neer gaat, precies zoals
         hoort. De bestuurder antwoordde bij stap 9 van de begeleide run dan
         ook "balken én lijnen kloppen".

         De fout zat in de gevolgtrekking, niet in de meting: de melding gaf een
         OORZAAK ("de reeks eronder") die nergens uit bleek. Dat is dezelfde
         vorm als #18, waar de melding beweerde wat hij niet gemeten had — en
         die staat één kopje verderop in §11 opgeschreven.

         Nu wordt er onderscheiden wat werkelijk verschilt:
           • bereik nul terwijl de motor draait → de reeks staat stil, en dát is
             een defect dat niets met de drempel te maken heeft;
           • bereik onder de drempel → precies de vraag van #66, met het getal
             erbij. Dat is een meetwaarde, geen bevinding. */
      const rpmBereik = (function () {
        if (!rpmGemeten) return null;
        const w = rpmH.slice(-24).map(function (x) { return x.v; })
                     .filter(function (x) { return typeof x === 'number' && isFinite(x); });
        return w.length >= 4 ? (Math.max.apply(null, w) - Math.min.apply(null, w)) : null;
      })();

      if (typeof rpm !== 'number' || rpm <= 400)
        return { staat: 'LET OP', detail: kop + ' — motor uit, dus de ijkvraag ' +
          '(beweegt het toerental?) is niet gesteld' };

      if (rpmBereik === 0)
        return { staat: 'FOUT', detail: kop + ' — de motor draait (' + Math.round(rpm) +
          ' rpm) en het toerental staat over de laatste 24 metingen exact stil. Dat is de reeks ' +
          'eronder, niet de drempel (#66)' };

      if (rpmGemeten && !rpmBeweegt)
        return { staat: 'LET OP', detail: kop + ' — het toerental beweegt ' + afr(rpmBereik) +
          ' bij ' + Math.round(rpm) + ' rpm en haalt de drempel niet. De reeks is in orde; ' +
          'dit is het getal waar #66 om vraagt: bij dit motortoerental is 2% van het volle ' +
          'bereik te grof om een trendlijn te krijgen' };

      return kop;
    }
  },

  // ── #64: komt het antwoord op de meetcontext werkelijk in de prompt? ──
  // De kern van dat issue in één zin: "verandert er niets, dan komt de regel
  // niet aan en is de hele vraag versiering". Dat is precies wat hier getoetst
  // wordt — niet of het venster mooi is, maar of een gegeven antwoord de
  // promptregel haalt. En is er niets beantwoord, dan is DAT het cijfer waar
  // het issue om vraagt: hoe vaak wordt het venster werkelijk ingevuld?
  {
    issue: '#64',
    naam: 'Een beantwoorde meetcontext haalt de AI-prompt',
    waarom: 'Alleen op een toestel waar een mens de vragen echt beantwoord heeft, is dit te meten.',
    proef: function () {
      if (typeof plMeetcontextPromptLine !== 'function')
        return { staat: 'FOUT', detail: 'plMeetcontextPromptLine() ontbreekt — dan gaat de meetcontext ' +
          'nooit mee, hoe vaak een gebruiker de vragen ook beantwoordt (#64)' };

      let m = null;
      try { m = window._plMeetcontext; } catch (e) { console.warn('_plMeetcontext onleesbaar bij de #64-proef', e); }
      let regel = '';
      try { regel = plMeetcontextPromptLine() || ''; } catch (e) {
        return { staat: 'FOUT', detail: 'plMeetcontextPromptLine() gooide een fout: ' + (e.message || e) };
      }

      // Wat de app zélf al zou invullen. Sinds 17-09-2026 vult het venster de
      // start/stop-vraag voor uit de aandrijfstatus; is er niets beantwoord,
      // dan is dát nog steeds het cijfer waar #64 om vraagt, maar het voorstel
      // erbij zegt of die voorvulling op deze auto werkelijk iets oplevert.
      var voorstel = '';
      try {
        if (typeof plMeetStartStopVoorstel === 'function') {
          var vs = plMeetStartStopVoorstel();
          voorstel = ' Het venster zou start/stop nu voorstellen op "' +
            (vs.waarde || 'weet ik niet') + '" (' + vs.reden + ').';
        }
      } catch (e) { console.warn('plMeetStartStopVoorstel() gooide een fout bij de #64-proef', e); }

      if (!m)
        return { staat: 'LET OP', detail: 'het meetcontextvenster is deze sessie niet beantwoord — ' +
          'en juist dat is het getal waar #64 om vraagt: hoe vaak wordt er werkelijk geantwoord?' + voorstel };

      const vragen = (typeof PL_VOORVRAGEN !== 'undefined') ? PL_VOORVRAGEN : [];
      let gegeven = [];
      try {
        gegeven = vragen.filter(function (v) { return m[v.key]; })
                        .map(function (v) { return v.key + '=' + m[v.key]; });
      } catch (e) { console.warn('PL_VOORVRAGEN niet af te lopen bij de #64-proef', e); }
      const extra = String((m && m.extra) || '').trim();

      if (!gegeven.length && !extra)
        return { staat: 'LET OP', detail: 'het venster is geopend maar alles bleef op "weet ik niet" — ' +
          'ook dat is een antwoord op #64.' + voorstel };

      // DIT is de toets. Er is iets ingevuld, dus er hoort iets in de prompt te
      // staan. Staat daar niets, dan is de vraag inderdaad versiering.
      if (!regel.trim())
        return { staat: 'FOUT', detail: 'beantwoord (' + gegeven.join(', ') +
          (extra ? ', plus een opmerking' : '') + ') maar de promptregel is leeg — ' +
          'het antwoord bereikt de AI niet (#64)' };

      /* Met hoeveel handelingen. Een voorgevuld antwoord dat blijft staan is
         een antwoord voor de AI maar geen keuze van een mens, en juist dat
         onderscheid is wat #64 punt 3 wil weten. */
      var bron = (m && m.bron) || {};
      var perBron = { klik: 0, voorstel: 0, eerder: 0 };
      Object.keys(bron).forEach(function (k) { if (perBron[bron[k]] !== undefined) perBron[bron[k]]++; });
      var herkomst = (m && m.bron)
        ? '; ' + perBron.klik + ' aangeklikt, ' + perBron.voorstel + ' uit de meting overgenomen' +
          (perBron.eerder ? ', ' + perBron.eerder + ' uit een eerdere ronde' : '')
        : '; herkomst niet vastgelegd (venster van vóór 17-09)';

      return gegeven.length + ' van de ' + vragen.length + ' vragen beantwoord (' + gegeven.join(', ') + ')' +
        (extra ? ' plus een vrije opmerking' : '') + herkomst + '; de promptregel draagt ' +
        regel.trim().split('\n').length + ' regel(s) mee';
    }
  },

  // ── #133: weet de analyse dat de verbinding is weggevallen? ──
  // Het issue in één zin: valt de verbinding weg, dan moet de analyse dóór
  // krijgen dat de auto niet raar doet maar de data. plMeetStabielVoorstel()
  // (#62) telt de gaten en vult daarmee de vraag "stabiele meting" voor. De
  // faaltoestand is de tegenspraak: PLRit ziet een onderbreking en de
  // voorstelregel zegt "ja, stabiel" — dan krijgt de AI te horen dat de meting
  // schoon was.
  //
  // AANVULLING 10-09-2026. Deze proef toetste eerst alleen PLRit.gaten() (het
  // loopgat). Op de rit van 10-09 stond die op 0 terwijl de adapter 39 s weg
  // was: een BT-SPP-socket sterft niet, dus `connected` bleef true en de lus
  // tikte door zonder dat er iets gemeten werd. Precies wat deze proef had
  // moeten vangen, ving hij niet. Het meetgat (PLRit.meetgaten()) is
  // toegevoegd voor dát geval en telt hier nu mee.
  {
    issue: '#133',
    naam: 'Een weggevallen verbinding komt in het oordeel over de meting terecht',
    waarom: 'Alleen tijdens een rit vallen er gaten; nagebouwd bewijst dit niets over deze auto.',
    proef: function () {
      if (typeof plMeetStabielVoorstel !== 'function')
        return { staat: 'FOUT', detail: 'plMeetStabielVoorstel() ontbreekt — dan gaat er geen enkel ' +
          'oordeel over de meetkwaliteit mee naar de analyse (#133)' };

      let v = null;
      try { v = plMeetStabielVoorstel() || {}; }
      catch (e) { return { staat: 'FOUT', detail: 'plMeetStabielVoorstel() gooide een fout: ' + (e.message || e) }; }

      let gaten = [], meetgaten = [];
      try { gaten = (window.PLRit && window.PLRit.gaten) ? (window.PLRit.gaten() || []) : []; }
      catch (e) { console.warn('PLRit.gaten() onleesbaar bij de #133-proef', e); }
      try { meetgaten = (window.PLRit && window.PLRit.meetgaten) ? (window.PLRit.meetgaten() || []) : []; }
      catch (e) { console.warn('PLRit.meetgaten() onleesbaar bij de #133-proef', e); }
      const onderbroken = gaten.length + meetgaten.length;

      const kop = 'voorstel "stabiele meting": ' + (v.waarde || '(leeg)') + ' — ' + (v.reden || '?') +
        '; PLRit telt ' + gaten.length + ' loopgat(en) en ' + meetgaten.length + ' meetgat(en) in deze rit';

      if (onderbroken && v.waarde === 'ja')
        return { staat: 'FOUT', detail: kop + ' — de rit zag een onderbreking en de analyse krijgt ' +
          'te horen dat de meting schoon was. Dan wijt de AI het aan de auto (#133)' };

      if (!onderbroken && !v.waarde)
        return { staat: 'LET OP', detail: kop + ' — nog geen oordeel te geven; rijd door of wacht ' +
          'tot de datastroom als stabiel gemeld is' };

      return kop;
    }
  },

  // ── de kostenraming hangt aan de uitvoer, niet aan het plafond ──
  // test-uitvoerschatting.js toetst de rekenregel op een verse, nagemaakte
  // opslag. Dit toestel heeft iets wat die test niet kan hebben: een ECHT
  // gegroeide kalibratie in localStorage, opgebouwd uit de analyses die hier
  // gedraaid zijn. Juist daar zou de migratie stil kunnen mislukken — een
  // opslag van vóór 08-09-2026 draagt alleen {tpt, uf, n}, en als het aanvullen
  // daarvan niet werkt is de raming NaN. Een NaN-vergelijking in preflight() is
  // altijd false, dus dan blokkeert de saldopoort niets meer en merkt niemand
  // het tot er een rekening komt.
  {
    issue: '#114',
    naam: 'De kostenraming schaalt niet mee met het max_tokens-plafond',
    waarom: 'Alleen dit toestel heeft een echt gegroeide kalibratie; een verse opslag zou de migratie niet toetsen.',
    proef: function () {
      if (!window.PLCredits || typeof PLCredits.ontleed !== 'function')
        return { staat: 'FOUT', detail: 'PLCredits.ontleed() ontbreekt — dan is de kostenraming niet te meten' };

      const p = 'x'.repeat(4000), s = 'y'.repeat(500);
      let laag, hoog;
      try {
        laag = PLCredits.ontleed(p, s, 4000);
        hoog = PLCredits.ontleed(p, s, 16000);
      } catch (e) {
        return { staat: 'FOUT', detail: 'ontleed() gooide een fout: ' + (e.message || e) };
      }

      // Eerst het stille geval: een raming die geen getal is.
      if (!isFinite(laag.uitTok) || !isFinite(laag.credits))
        return { staat: 'FOUT', detail: 'de raming is geen getal (uitTok=' + laag.uitTok +
          ', credits=' + laag.credits + ') — dan laat de saldopoort alles door (#114)' };

      let kalib = null;
      try { kalib = JSON.parse(localStorage.getItem('pl_credits_kalib') || 'null'); } catch (e) { /* stil: opslag kan corrupt zijn */ }
      const metingen = (kalib && kalib.uitN) || 0;

      const kop = 'raming bij plafond 4000: ' + laag.uitTok + ' tokens (' + laag.credits +
        ' credits), bij 16000: ' + hoog.uitTok + ' (' + hoog.credits + '); ' +
        metingen + ' uitvoermeting(en) op dit toestel';

      // Zonder metingen valt de raming bewust terug op de oude vorm, en dán
      // hoort hij wél mee te schalen. Dat is geen fout maar een koude start.
      if (metingen === 0)
        return { staat: 'LET OP', detail: kop + ' — nog geen enkele analyse gemeten, dus de ' +
          'raming staat nog op de koude-startvorm (maxTokens x uitvoerFactor) en schaalt terecht mee' };

      if (hoog.uitTok > laag.uitTok)
        return { staat: 'FOUT', detail: kop + ' — een ruimer plafond geeft een hogere raming, ' +
          'dus het plafond stuurt de kosten nog steeds. Dan sluit een verhoging van max_tokens ' +
          'klanten buiten op tegoed dat ze niet nodig hebben (#114)' };

      return kop;
    }
  },

  // ── #115: geeft de buspoort het slot altijd terug? ──
  // De reparatie van deze ronde is niet "er staat een helper", maar dat het
  // slot niet meer met de hand teruggegeven hoeft te worden. Het enige wat een
  // handgeschreven finally fout kan doen is hem vergeten — en dan hangt de bus
  // tot het einde van de sessie, buiten élke noodrem van PLBus om. Dit meet dat
  // op het ECHTE slot van dit toestel, niet op een nagebouwde.
  {
    issue: '#115',
    naam: 'De buspoort geeft het slot terug, ook als het werk klapt',
    waarom: 'Toetst het echte PLBus van deze sessie; een nagebouwd slot zou alleen zichzelf bewijzen.',
    proef: async function () {
      if (typeof withBusOfNiets !== 'function')
        return { staat: 'FOUT', detail: 'withBusOfNiets() ontbreekt — dan claimt elke ronde-lus weer met de hand (#115)' };
      if (!window.PLBus) return { staat: 'FOUT', detail: 'PLBus ontbreekt' };
      if (PLBus.busy())
        return { staat: 'LET OP', detail: 'de bus is nu van "' + PLBus.owner() + '" — deze proef claimt zelf en zou een lopende meting storen' };

      const uit = [];
      // 1. Vrije bus: het werk draait en het slot komt terug.
      let liep = 0;
      await withBusOfNiets('blok5-poort', async function () { liep++; });
      if (liep !== 1 || PLBus.busy())
        return { staat: 'FOUT', detail: 'op een vrije bus liep het werk ' + liep + 'x en het slot is ' +
          (PLBus.busy() ? 'NIET' : 'wel') + ' teruggegeven' };
      uit.push('vrije bus: werk draait, slot terug');

      // 2. DE KERN: een fout in het werk mag het slot niet gijzelen.
      let geknald = false;
      try { await withBusOfNiets('blok5-poort', async function () { throw new Error('proef'); }); }
      catch (e) { geknald = true; }
      if (!geknald)
        return { staat: 'FOUT', detail: 'een fout in het werk kwam niet naar buiten — dan verdwijnt een busstoring stil' };
      if (PLBus.busy())
        return { staat: 'FOUT', detail: 'na een fout in het werk houdt "' + PLBus.owner() + '" het slot vast — ' +
          'dat is precies de vergeten finally waar #115 over gaat, en geen noodrem vangt hem' };
      uit.push('fout in het werk: slot tóch terug');

      // 3. Bezette bus: de beurt wordt overgeslagen, niet afgepakt.
      // De houder is hier de poort zélf, geen losse claim met een eigen
      // finally: die staat sinds #115 alleen nog in pidlane-data.js, en deze
      // proef hoort daar geen uitzondering op te zijn.
      let liep2 = 0, bezet = 0;
      const gelukt = await withBusOfNiets('blok5-houder', async function () {
        await withBusOfNiets('blok5-poort', async function () { liep2++; }, function () { bezet++; });
        return true;
      });
      if (!gelukt) return { staat: 'LET OP', detail: uit.join('  |  ') + '  |  bezet-tak niet gemeten: het slot was niet te pakken' };
      if (liep2 !== 0 || bezet !== 1)
        return { staat: 'FOUT', detail: 'op een bezette bus liep het werk ' + liep2 + 'x en de uitweg ' + bezet + 'x — ' +
          'de poort praat dwars door een lopende lezer heen' };
      if (PLBus.busy())
        return { staat: 'FOUT', detail: 'na de bezet-proef houdt "' + PLBus.owner() + '" het slot nog vast' };
      uit.push('bezette bus: beurt overgeslagen');

      return uit.join('  |  ') + ' — en een los slot claimen kan alleen nog in pidlane-data.js';
    }
  },

  // ── #116: leest élke module een 41-antwoord met dezelfde parser? ──
  // Geen broncodetelling (die doet blok 11), maar de vraag eronder: geeft de
  // decoder ná de verhuizing hetzelfde getal, óók bij de antwoordvormen waar
  // zijn eigen indexOf-lus op stukliep? Dit draait op de echte PLVerify van
  // deze build, met de echte PID_BYTE_LEN van dit toestel.
  {
    issue: '#116',
    naam: 'De focus-decoder leest een antwoord met framemarkers goed',
    waarom: 'Draait op de geladen PLVerify en de geleerde bytelengtes van dit toestel — niet op een kopie.',
    proef: function () {
      if (!window.PLVerify || typeof PLVerify._decode !== 'function')
        return { staat: 'FOUT', detail: 'PLVerify._decode() ontbreekt' };
      if (typeof splitBatchResponse !== 'function')
        return { staat: 'FOUT', detail: 'splitBatchResponse() ontbreekt — dan is er geen ene plek om door te lopen' };

      // Dezelfde bytes, drie verpakkingen. 0x0B95 / 4 = 741 toeren.
      const kaal = PLVerify._decode('010C', '41 0C 0B 95');
      const metHdr = PLVerify._decode('010C', '7E8 04 41 0C 0B 95');
      const metFrames = PLVerify._decode('010C', '004 0:410C 1:0B95');
      if (kaal !== 741)
        return { staat: 'FOUT', detail: 'een kaal antwoord 410C0B95 gaf ' + kaal + ' in plaats van 741 toeren' };
      if (metHdr !== kaal || metFrames !== kaal)
        return { staat: 'FOUT', detail: 'zelfde bytes, andere uitkomst: kaal ' + kaal + ', met CAN-header ' + metHdr +
          ', met framemarkers ' + metFrames + ' — de decoder gaat om splitBatchResponse heen (#116)' };

      // De odometer: zonder PID_BYTE_LEN['A6'] valt de helper terug op één byte
      // en wordt 248.000 km ineens 24.
      const odo = splitBatchResponse('41 A6 00 25 D7 90', ['01A6'])['01A6'];
      if (!odo || odo.length !== 4)
        return { staat: 'FOUT', detail: '01A6 kwam terug met ' + (odo ? odo.length : 0) +
          ' byte(s) in plaats van 4 — de odometer leest dan een fractie van de kilometerstand' };

      return '741 toeren uit alle drie de verpakkingen (kaal, CAN-header, framemarkers) en 01A6 in vier bytes';
    }
  },

  // ── #117: doet de ene fetch-helper wat hij belooft, op DIT toestel? ──
  // De basis-URL is hier geen testwaarde maar de echte PROXY_URL van deze
  // build, en de tokenkop hangt aan de sessie die nu ingelogd is. Dat is
  // precies het stuk dat een node-test niet kan zien.
  {
    issue: '#117',
    naam: 'plFetch bouwt de URL en de tokenkop van dit toestel',
    waarom: 'PROXY_URL en APP_TOKEN zijn hier de echte van deze sessie; een node-test kent alleen verzonnen waarden.',
    proef: async function () {
      if (typeof plFetch !== 'function' || typeof plFetchUrl !== 'function')
        return { staat: 'FOUT', detail: 'plFetch() ontbreekt — dan beslist elke aanroep weer zelf over URL, token en 401 (#117)' };
      if (typeof PROXY_URL === 'undefined' || !PROXY_URL)
        return { staat: 'LET OP', detail: 'geen PROXY_URL op dit toestel — niets te bouwen' };

      const basis = String(PROXY_URL).replace(/\/$/, '');
      const met = plFetchUrl('/klant/mij'), zonder = plFetchUrl('klant/mij');
      if (met !== basis + '/klant/mij' || zonder !== met)
        return { staat: 'FOUT', detail: 'URL-opbouw klopt niet: "/klant/mij" → ' + met + ', "klant/mij" → ' + zonder };
      const abs = 'https://api.airtable.com/v0/x/y';
      if (plFetchUrl(abs) !== abs)
        return { staat: 'FOUT', detail: 'een absolute URL werd verbouwd tot ' + plFetchUrl(abs) + ' — dan is Airtable onbereikbaar' };

      // En dan de echte ketting. /api/config is een GET die niets verandert en
      // niets kost, maar hij gaat wél door de Worker heen — dus hij bewijst dat
      // de tokenkop die plFetch erop zet ook geaccepteerd wordt.
      if (!window.APP_TOKEN)
        return { staat: 'LET OP', detail: 'URL-opbouw klopt (' + met + '), maar zonder sessietoken is de tokenkop niet te toetsen — log in en draai opnieuw' };
      let r;
      try { r = await plFetch('/api/config'); }
      catch (e) {
        return { staat: 'LET OP', detail: 'URL-opbouw klopt, maar de Worker is niet bereikbaar: ' + ((e && e.message) || e) };
      }
      if (r.status === 401)
        return { staat: 'FOUT', detail: 'de Worker weigerde /api/config met 401 terwijl er een sessietoken is — ' +
          'plFetch zet de kop X-App-Token niet of niet goed' };
      if (!r.ok)
        return { staat: 'LET OP', detail: 'URL-opbouw klopt; /api/config gaf HTTP ' + r.status + ' (geen tokenprobleem, wel iets anders)' };
      return 'URL-opbouw klopt (' + met + ') en /api/config antwoordt met de kop die plFetch erop zette';
    }
  },

  // ── zet de beheerdersschakelaar béide demoknoppen weg? ──
  // De reviewnotitie in PLAY-INZENDING.md wijst naar één knop: "Try demo — no
  // adapter needed" op het loginscherm. Die knop hing tot 03-09 buiten
  // FEATURE_TOGGLES.feat_demo, dat alleen '[id="btnDemo"]' noemde — de knop in
  // het verbindscherm. Met feat_demo=false verdween dus de ene en bleef de
  // andere staan: zichtbaar, en bij aanraken alleen een toast "uitgeschakeld
  // door beheerder". Voor een reviewer die de notitie volgt is dat erger dan
  // geen knop.
  //
  // test-demo-toegang.js leest of beide id's in de lijst staan. Deze proef
  // doet iets anders en dat is de reden dat hij er is: hij DRAAIT de
  // schakelaar in de echte app en kijkt wat de CSS er werkelijk mee doet. Een
  // selector die er wel staat maar niets raakt — een hernoemd id, een regel
  // die door iets specifiekers wordt overstemd — komt alleen zo aan het licht.
  {
    issue: '#42',
    naam: 'De beheerdersschakelaar zet beide demoknoppen weg, of geen van beide',
    waarom: 'Alleen in de draaiende app is te zien wat de gegenereerde CSS werkelijk raakt; de bronlijst zegt dat niet.',
    proef: function () {
      if (typeof applyFeatureToggles !== 'function')
        return { staat: 'FOUT', detail: 'applyFeatureToggles() ontbreekt — dan doet geen enkele featureschakelaar nog iets' };

      const KNOPPEN = [
        { id: 'btnDemoLogin', waar: 'loginscherm (de knop uit de reviewnotitie)' },
        { id: 'btnDemo',      waar: 'verbindscherm' }
      ];
      const weg = [];
      for (const k of KNOPPEN) {
        if (!document.getElementById(k.id)) weg.push(k.id + ' (' + k.waar + ')');
      }
      if (weg.length)
        return { staat: 'FOUT', detail: 'demoknop niet in de DOM: ' + weg.join(', ') +
          ' — de reviewnotitie wijst naar een knop die er niet staat (#42)' };

      // De stand van vóór de proef, inclusief het geval dat de sleutel
      // helemaal niet in PID_CONFIG stond: dan moet hij daarna ook weer weg.
      const cfg = (window.PID_CONFIG = window.PID_CONFIG || {});
      const stond = Object.prototype.hasOwnProperty.call(cfg, 'feat_demo');
      const oud = cfg.feat_demo;
      const zichtbaar = function (id) {
        return getComputedStyle(document.getElementById(id)).display !== 'none';
      };

      let uit, na;
      try {
        cfg.feat_demo = false;
        applyFeatureToggles();
        uit = KNOPPEN.map(function (k) { return { id: k.id, waar: k.waar, zichtbaar: zichtbaar(k.id) }; });
      } finally {
        // Altijd terugzetten. Blijft feat_demo op false staan omdat deze proef
        // ergens klapte, dan heeft de testrun de demo uitgezet op het toestel
        // waarop de reviewer hem straks zoekt.
        if (stond) cfg.feat_demo = oud; else delete cfg.feat_demo;
        try { applyFeatureToggles(); } catch (e) {
          console.warn('Testrun: featureschakelaars niet teruggezet na de demoknop-proef', e);
        }
        na = KNOPPEN.map(function (k) { return zichtbaar(k.id); });
      }

      const blijven = uit.filter(function (k) { return k.zichtbaar; });
      if (blijven.length && blijven.length < uit.length)
        return { staat: 'FOUT', detail: 'met feat_demo=false bleef ' +
          blijven.map(function (k) { return '#' + k.id + ' op het ' + k.waar; }).join(' en ') +
          ' staan terwijl de andere verdween — een halve schakelaar laat een dode knop achter (#42)' };
      if (blijven.length === uit.length)
        return { staat: 'FOUT', detail: 'met feat_demo=false bleven beide demoknoppen staan — ' +
          'de schakelaar raakt niets; zijn de id\'s hernoemd?' };

      if (na.indexOf(false) >= 0)
        return { staat: 'FOUT', detail: 'na het terugzetten is een demoknop verborgen gebleven — ' +
          'deze proef heeft de demo uitgezet op dit toestel. Herlaad de app vóór de review' };

      return 'feat_demo=false verbergt beide demoknoppen (loginscherm én verbindscherm), ' +
        'en na het terugzetten staan ze allebei weer';
    }
  },

  // ── de km-check: zit hij in DEZE app, en oordeelt hij hier hetzelfde? ──
  // test-kmcheck.js dekt de rekenkant met 50 toetsen, en dat is de plek waar
  // die hoort. Wat node niet kan zien: of de module ook echt in de pagina
  // hangt, of de knop in de koopcheck naar een bestaande functie wijst, en of
  // het oordeel dat de geladen kopie geeft hetzelfde is als het oordeel dat
  // de test op schijf toetst. Precies die drie zijn hier stil kapot te maken —
  // een vergeten scripttag, een hernoemde functie, een tweede kopie.
  //
  // Geen bus nodig: PLKm.oordeel() is puur. Dat is met opzet zo gebouwd.
  {
    issue: '§4',
    naam: 'De km-check hangt in de app en oordeelt daar hetzelfde',
    waarom: 'Alleen de draaiende app laat zien of de module geladen is en of de knop in de koopcheck ergens op uitkomt.',
    proef: function () {
      if (!window.PLKm)
        return { staat: 'FOUT', detail: 'PLKm ontbreekt — pidlane-kmcheck.js hangt niet in index.html' };
      if (typeof PLKm.oordeel !== 'function' || typeof PLKm.check !== 'function')
        return { staat: 'FOUT', detail: 'PLKm mist oordeel() of check()' };
      if (typeof PLKm.draaiUI !== 'function')
        return { staat: 'FOUT', detail: 'PLKm.draaiUI() ontbreekt — de knop in de koopcheck roept iets aan dat niet bestaat' };

      const knop = document.getElementById('koopKmCheckBtn');
      const vak = document.getElementById('koopKmCheckUit');
      if (!knop || !vak)
        return { staat: 'FOUT', detail: 'de knop (#koopKmCheckBtn) of het uitvoervak (#koopKmCheckUit) staat niet in de koopcheck' };

      // Een teruggedraaide teller: motorblok 214.050, dashboard 118.000.
      const m = function (groep, km) {
        return { rol: 'odo', groep: groep, module: 'proef ' + groep, cmd: '220201', km: km, zeker: true };
      };
      const fraude = PLKm.oordeel([m('7E0', 214050), m('720', 118000)], null);
      if (fraude.niveau !== 'kritiek')
        return { staat: 'FOUT', detail: '96.000 km verschil tussen motorblok en dashboard levert hier "' +
          fraude.niveau + '" op in plaats van kritiek — de geladen module oordeelt anders dan de toets op schijf' };
      if (fraude.bevindingen[0].patroon !== 'teller-lager')
        return { staat: 'FOUT', detail: 'het verschil wordt gezien, maar niet als het patroon van een ' +
          'teruggedraaide teller — dan mist de koper de reden waarom het erg is' };

      // En de tegenkant: een gezonde auto mag hier geen alarm geven, anders
      // is een groene uitslag niets waard.
      const gezond = PLKm.oordeel([m('7E0', 89240), m('720', 89230)], null);
      if (gezond.niveau !== 'ok')
        return { staat: 'FOUT', detail: '10 km verschil op 89.240 levert "' + gezond.niveau +
          '" op — dat is een vals alarm bij een koper' };

      const stil = PLKm.oordeel([], null);
      if (stil.niveau !== 'onbekend' || stil.bevindingen.length)
        return { staat: 'FOUT', detail: 'een stille bus levert "' + stil.niveau + '" met ' +
          stil.bevindingen.length + ' bevinding(en) — afwezigheid mag nooit een verdenking worden' };

      return 'PLKm geladen met ' + PLKm.bronnen().length + ' bronnen, knop en uitvoervak aanwezig; ' +
        'de geladen kopie meldt de teruggedraaide teller als kritiek, de gezonde auto als ok en de ' +
        'stille bus als onbekend';
    }
  },

  // ── de kaartmaker: hangt hij erin, en staat de scanvlag uit? ──────
  // De vlag window._plScanActief zet de dode-socket-detectie in
  // pidlane-bt.js uit. Blijft hij per ongeluk aanstaan — een scan die klapte
  // vóór zijn finally, een tweede scan die de vlag van de eerste wist — dan
  // merkt de app de rest van de sessie niet meer dat de verbinding wegvalt.
  // Dat is precies het soort stille toestand dat alleen in de draaiende app
  // te zien is: op schijf staat de vlag nergens aan.
  {
    issue: '§21',
    naam: 'De kaartmaker hangt erin en laat geen scanvlag achter',
    waarom: 'Een blijven hangende scanvlag zet de dode-socket-detectie uit, en dat is alleen in de draaiende app te zien.',
    proef: function () {
      if (!window.PLKaart)
        return { staat: 'FOUT', detail: 'PLKaart ontbreekt — pidlane-kaart.js hangt niet in index.html' };
      if (typeof window.kaartStart !== 'function')
        return { staat: 'FOUT', detail: 'kaartStart() ontbreekt — de knoppen in dit paneel roepen iets aan dat niet bestaat' };

      const knoppen = Array.prototype.slice.call(document.querySelectorAll('#testrunOv button'))
        .filter(function (b) { return /Kaart maken|Volledig/.test(b.textContent || ''); });
      if (knoppen.length < 2)
        return { staat: 'FOUT', detail: 'de kaartknoppen staan niet in het testrunpaneel (' + knoppen.length + ' gevonden)' };

      if (window._plScanActief)
        return { staat: 'FOUT', detail: 'window._plScanActief staat AAN terwijl er geen scan loopt — ' +
          'de dode-socket-detectie in pidlane-bt.js is daarmee uitgeschakeld; verbreek en verbind opnieuw' };
      if (PLKaart.staat().bezig)
        return { staat: 'FOUT', detail: 'PLKaart meldt zichzelf als bezig terwijl er geen scan loopt' };

      // De leespoort van de gelááden kopie, niet die op schijf.
      const verboden = ['1101', '2EF19012', '31010203', '14FFFFFF', '2703'];
      const door = verboden.filter(function (c) { return PLKaart.magVerzenden(c).mag; });
      if (door.length)
        return { staat: 'FOUT', detail: 'de leespoort laat schrijvende commando\'s door: ' + door.join(', ') +
          ' — een scan mag de auto nooit veranderen' };
      if (!PLKaart.magVerzenden('22F190').mag)
        return { staat: 'FOUT', detail: 'de leespoort weigert een gewone leesvraag (22F190) — dan scant hij niets' };

      const zonderBron = PLKaart.trap().filter(function (t) { return !t.bron; });
      if (zonderBron.length)
        return { staat: 'FOUT', detail: zonderBron.length + ' trede(n) van de DID-trap zeggen niet waar ze vandaan komen — ' +
          'dan is niet te zien wat genormeerd is en wat ooit gegokt is' };

      const sch = PLKaart.schatting({ volledig: true });
      return 'PLKaart geladen, ' + PLKaart.trap().length + ' treden met bronvermelding, twee knoppen in dit paneel, ' +
        'scanvlag uit; de volledige sweep wordt vooraf opgegeven als ' + sch.tekst;
    }
  },

  // ── de VIN-poort van de kaartmaker, in de geladen app ────────────
  // De kaartrit van 04-09 om 11:49 vond vier stuurapparaten die 22F190
  // beantwoorden, en het verslag drukte die VIN vier keer als ruwe hex af —
  // in het testrunlogboek, dat geplakt en gedeeld wordt. Dat is het derde
  // VIN-pad uit §11, door de kaartmaker opnieuw geopend.
  //
  // test-kaart.js dekt de poort met een nagebouwde bus. Wat node NIET kan
  // zien: of de geladen kopie van PLKaart de poort van PLKm ook werkelijk
  // vindt. Die twee modules hangen los in index.html, en een hernoemde
  // interne functie zou de poort stilzwijgend openzetten — de bytes gaan dan
  // gewoon door, zonder fout, met de VIN erin.
  {
    issue: '§7',
    naam: 'De kaartmaker houdt de VIN buiten de kaart',
    waarom: 'Alleen in de draaiende app is te zien of PLKaart de VIN-poort van PLKm werkelijk vindt.',
    proef: async function () {
      if (!window.PLKaart) return { staat: 'FOUT', detail: 'PLKaart ontbreekt' };
      if (!window.PLKm || !PLKm._intern) return { staat: 'FOUT', detail: 'PLKm ontbreekt — dan is er geen VIN-poort' };
      if (typeof PLKm._intern.isVin !== 'function' || typeof PLKm._intern.bytesNaarTekst !== 'function')
        return { staat: 'FOUT', detail: 'PLKm._intern.isVin/bytesNaarTekst ontbreekt — de kaartmaker zoekt daarnaar ' +
          'achter een guard, dus zonder deze twee gaat de VIN ongemerkt de kaart in (§7)' };
      if (typeof PLKm.vinConsistentie !== 'function')
        return { staat: 'FOUT', detail: 'PLKm.vinConsistentie() ontbreekt — dan draagt de kaart wel VIN-metingen maar geen oordeel' };

      const proef = 'JMZKF6W7600766507';
      if (!PLKm._intern.isVin(proef))
        return { staat: 'FOUT', detail: 'de geladen kopie herkent een geldige VIN niet — de poort staat dan open' };
      if (PLKm._intern.isVin('B61L-67XK6-B'))
        return { staat: 'FOUT', detail: 'de geladen kopie ziet een onderdeelnummer aan voor een VIN' };

      const k = await PLKm._intern.vinKenmerk(proef);
      if (!k || !k.staart || k.staart.indexOf(proef.slice(-6)) < 0)
        return { staat: 'FOUT', detail: 'vinKenmerk() levert geen leesbare staart' };
      if (JSON.stringify(k).indexOf(proef) >= 0)
        return { staat: 'FOUT', detail: 'vinKenmerk() geeft de RUWE VIN terug — dat is precies wat niet mag (§7)' };
      if (!k.id)
        return { staat: 'LET OP', detail: 'geen pseudoniem (staat _vlVinPseudoniem klaar?) — de kaart maskeert dan wél, ' +
          'maar twee stuurapparaten zijn niet meer met elkaar te vergelijken' };

      const oud = PLKm.vinConsistentie([
        { rol: 'vin', module: 'proef A', groep: '7E0', vinId: 'x1', vinStaart: '…111111' },
        { rol: 'vin', module: 'proef B', groep: '720', vinId: 'x2', vinStaart: '…222222' }
      ]);
      if (oud.niveau !== 'kritiek')
        return { staat: 'FOUT', detail: 'twee verschillende voertuignummers leveren hier "' + oud.niveau +
          '" op in plaats van kritiek — de geladen kopie oordeelt anders dan de toets op schijf' };

      return 'VIN-poort staat: een geldige VIN wordt herkend, een onderdeelnummer niet, het kenmerk draagt ' +
        'alleen ' + k.staart + ' plus een pseudoniem, en twee verschillende nummers geven kritiek';
    }
  },

  // ── staat het logboek op tijd, of op tekst? ──
  // Het logboek sorteerde op de tijdstring "HH:MM:SS" terwijl BT en APP er sinds
  // #75 een epoch naast zetten. Binnen één dag valt dat niet op; over
  // middernacht zet het de nacht bovenaan (#140). Alleen hier te meten: node
  // heeft geen gevulde ringen, en de fout zit juist in de VOLGORDE van wat er
  // werkelijk in staat.
  {
    issue: '#140',
    naam: 'Het logboek staat op tijdvolgorde, ook over middernacht',
    waarom: 'De ringen zijn hier gevuld; de fout zat in de volgorde van échte regels, niet in een nagebouwde lijst.',
    proef: function () {
      if (!window.PLLogboek || typeof PLLogboek.verzamel !== 'function')
        return { staat: 'FOUT', detail: 'PLLogboek.verzamel() ontbreekt — dan is de volgorde van het logboek niet te meten' };
      const rijen = PLLogboek.verzamel();
      if (!rijen.length) return { staat: 'LET OP', detail: 'nog geen logregels — niets te sorteren' };

      const met = rijen.filter(function (r) { return typeof r.ms === 'number'; });
      if (!met.length)
        return { staat: 'FOUT', detail: rijen.length + ' regels en geen enkele met een epoch — het logboek sorteert dan ' +
          'weer op de kloktijd, en die loopt over middernacht terug (#140)' };

      for (let i = 1; i < met.length; i++) {
        if (met[i].ms < met[i - 1].ms)
          return { staat: 'FOUT', detail: 'regel ' + i + ' (' + met[i].t + ', ' + met[i].bron + ') staat ná ' +
            met[i - 1].t + ' terwijl hij ouder is — het logboek staat niet op tijdvolgorde' };
      }

      // Hoeveel dagen staan er in? Dat is precies het geval waarin de oude
      // sortering omviel, dus het is de moeite van het melden waard.
      const dagen = {};
      met.forEach(function (r) { dagen[new Date(r.ms).toDateString()] = 1; });
      const n = Object.keys(dagen).length;
      return met.length + ' van ' + rijen.length + ' regels dragen een epoch en staan op volgorde' +
        (n > 1 ? ', verdeeld over ' + n + ' dagen' : '');
    }
  },

  // ── staat de bevindingenschakelaar waar hij hoort? ──
  // Verhuisd uit het ☰-menu naar het Run-venster (#123). Twee dingen kunnen hier
  // stil misgaan: het knopje tekent niet (dan is de schakelaar onbereikbaar), of
  // het oude exemplaar staat er nog (dan zijn er twee plekken voor één stand).
  {
    issue: '#123',
    naam: 'De bevindingenschakelaar staat in het Run-venster en nergens anders',
    waarom: 'Alleen de DOM van de draaiende app laat zien of het knopje daadwerkelijk getekend wordt.',
    proef: function () {
      if (!window.PLRun || typeof PLRun.teken !== 'function')
        return { staat: 'FOUT', detail: 'PLRun.teken() ontbreekt — dan tekent het Run-venster niets' };
      if (typeof bevindingenZet !== 'function')
        return { staat: 'FOUT', detail: 'bevindingenZet() ontbreekt — de schakelaar zou dan niets doen' };

      const kebab = document.getElementById('kebabMenu');
      if (kebab && /bevindingenZet\(/.test(kebab.innerHTML))
        return { staat: 'FOUT', detail: 'het ☰-menu draagt de schakelaar nog steeds — twee plekken voor één stand (#123)' };

      // Het venster tekenen zonder het te openen: teken() vult de containers,
      // open() zet alleen display. Zo blijft het scherm van de gebruiker staan.
      const eerder = document.getElementById('runOv');
      const zichtbaar = !!(eerder && eerder.style.display === 'flex');
      if (!eerder) PLRun.open();
      PLRun.teken();
      const aan = document.getElementById('bevAanBtn'), uit = document.getElementById('bevUitBtn');
      if (!eerder && !zichtbaar) PLRun.sluit();

      if (!aan || !uit)
        return { staat: 'FOUT', detail: 'het Run-venster tekent geen Aan/Uit-knop voor de bevindingenbalk — ' +
          'de schakelaar is uit het ☰-menu weg en hier niet aangekomen (#123)' };

      const stand = (typeof bevindingenAan === 'function') ? (bevindingenAan() ? 'aan' : 'uit') : '?';
      const gemarkeerd = aan.classList.contains('on') || uit.classList.contains('on');
      if (!gemarkeerd)
        return { staat: 'LET OP', detail: 'de knoppen staan er maar geen van beide is gemarkeerd — ' +
          'bevindingenMenuBij() kleurt de stand niet' };

      return 'de schakelaar staat in het Run-venster (stand: ' + stand + ') en niet meer in het ☰-menu';
    }
  },

  // ── belooft een tegel nog dat een dubbeltik de sensor uitzet? ──
  // Sinds 02-09 verbergt een dubbeltik alleen; uitzetten is het kruisje in de
  // strook. De tooltip op de tegels bleef "sensor uitzetten" beloven — de enige
  // uitleg die er stond, en die was onjuist (#124).
  {
    issue: '#124',
    naam: 'De uitleg op een tegel klopt met wat een dubbeltik doet',
    waarom: 'De tegels bestaan pas als er gemeten wordt; hun tekst is alleen hier te lezen.',
    proef: function () {
      const tegels = document.querySelectorAll('.gc[id^="gc-"], .vast-item[id^="vt-"]');
      if (!tegels.length) return { staat: 'LET OP', detail: 'geen tegels in beeld — niets om te lezen' };

      let leeg = 0;
      for (let i = 0; i < tegels.length; i++) {
        const tip = tegels[i].title || '';
        if (!tip) { leeg++; continue; }
        if (/uitzetten/i.test(tip) && !/verbergen/i.test(tip))
          return { staat: 'FOUT', detail: 'tegel ' + tegels[i].id + ' belooft "' + tip + '" terwijl een dubbeltik ' +
            'alleen verbergt — de sensor blijft gemeten worden (#124)' };
      }
      if (leeg === tegels.length)
        return { staat: 'FOUT', detail: 'geen enkele van de ' + tegels.length + ' tegels draagt uitleg over de dubbeltik' };

      return tegels.length + ' tegels gelezen; de uitleg zegt verbergen en niet uitzetten';
    }
  },

  // ── hoort de AI wat er met DEZE meting mis was? ──
  // Tot 11-09 ging alles wat de app over zijn eigen meetkwaliteit wist naar
  // precies één lezer: dit verslag. De betaalde analyse kreeg er niets van mee,
  // en een gat van twee minuten leest dan als een sensor die uitvalt (#188).
  //
  // test-aanlevering.js toetst de regels in node. Wat dáár niet te zien is, is
  // of de module in de DRAAIENDE app dezelfde bronnen leest als de rest: PLRit
  // en PLAchtergrond bestaan in node niet, en juist die koppeling was de
  // bevinding. Deze proef legt de twee lezers van hetzelfde feit naast elkaar —
  // lopen ze uiteen, dan leest er één de verkeerde bron.
  {
    issue: '#188',
    naam: 'De AI hoort de gaten in deze meting',
    waarom: 'PLRit en PLAchtergrond bestaan alleen in de draaiende app; hun koppeling is alleen hier te meten.',
    proef: function () {
      if (!window.PLAanlevering)
        return { staat: 'FOUT', detail: 'PLAanlevering ontbreekt — de AI krijgt dan niets over de meetkwaliteit te horen (#188)' };

      const ob = PLAanlevering.onderbrekingen();
      if (ob === null)
        return { staat: 'LET OP', detail: 'noch PLRit noch PLAchtergrond is bereikbaar — er valt niets te vergelijken' };

      // Twee lezers van hetzelfde feit. Dit is de hele proef: de module mag
      // geen eigen telling hebben, hij hoort die van PLRit door te geven.
      const echt = window.PLRit ? PLRit.gaten().length : null;
      if (echt !== null && ob.loopgaten !== echt)
        return { staat: 'FOUT', detail: 'PLRit telt ' + echt + ' gat(en), de aanlevering meldt ' + ob.loopgaten +
          ' — de module leest een andere bron dan het verslag (#188)' };

      const wegEcht = window.PLAchtergrond ? PLAchtergrond.perioden().length : null;
      if (wegEcht !== null && ob.perioden !== null && ob.perioden !== wegEcht)
        return { staat: 'FOUT', detail: 'PLAchtergrond kent ' + wegEcht + ' periode(n), de aanlevering meldt ' +
          ob.perioden + ' (#188)' };

      /* DE HAAK ZELF WORDT HIER NIET GEMETEN, EN DAT IS EEN BESLUIT.

         Er stond hier eerst een broncodecontrole: staat de tekst
         "PLAanlevering.blok" in apiFetch. Die is op 11-09 nagemeten door de haak
         op `if(false)` te zetten — en hij bleef groen. Hij bewees dat er een
         regel stond, niet dat die regel iets deed, en dat is precies de proef
         die CLAUDE.md waardeloos noemt.

         De echte vraag is gedrag: komt het blok in de systeemprompt die
         verstuurd wordt. Dat is te meten door plFetch te onderscheppen, maar
         niet hier: deze proef draait midden in een rit in de app van een klant,
         en de verzendlaag onderuit halen om te kijken of hij het goed doet is
         een risico dat niet bij een testrun hoort. Het staat in
         bproef-aanlevering.js, dat bij elke push in CI draait en waar de
         tegenproef ook echt rood wordt. */

      const blok = PLAanlevering.blok({ set: 'monteur' });
      if (!blok)
        return { staat: 'LET OP', detail: 'er is nog niets gemeten, dus het blok is leeg — dat is de bedoeling' };

      /* EN DE DEKKING OVER HET PROFIEL DAT NU DRAAIT. De aanroepplekken geven
         geen PID-lijst mee maar de profielnaam die ze tóch al noemen in
         ensurePIDsActive(). relevantSupportedPIDs() schrijft die naam op in
         window._laatstProfiel, dus hier valt te zien wat de laatste analyse
         werkelijk vroeg — en of de dekking daar iets over te zeggen heeft.
         Levert die niets op terwijl er wel een profiel liep, dan is de naam
         verkeerd gespeld en verdwijnt de dekking stil uit elke analyse. */
      const prof = window._laatstProfiel || '';
      let dekTxt = 'nog geen analyseprofiel opgevraagd deze rit';
      if (prof) {
        const kern = PLAanlevering.profielSet(prof);
        if (!kern)
          return { staat: 'FOUT', detail: 'profiel "' + prof + '" staat niet in ANALYSE_PIDS — ' +
            'een analyse met deze naam levert stil geen dekking op (#188)' };
        const dek = PLAanlevering.dekking({ profiel: prof });
        dekTxt = 'profiel "' + prof + '": ' + dek.geleverd.length + ' van ' + dek.nodig.length +
          ' sensoren leveren data' + (dek.ontbreekt.length ? ', ' + dek.ontbreekt.length + ' ontbreekt' : '');
      }

      const stukken = [];
      if (ob.perioden) stukken.push(ob.perioden + '\u00d7 achtergrond');
      if (ob.loopgaten) stukken.push(ob.loopgaten + ' loopgat(en)');
      if (ob.meetgaten) stukken.push(ob.meetgaten + ' meetgat(en)');
      if (ob.herverbindingen) stukken.push(ob.herverbindingen + ' herverbinding(en)');
      return blok.length + ' tekens gaan mee naar de AI' +
        (stukken.length ? ', met ' + stukken.join(', ') : ', zonder onderbrekingen') +
        '; de tellingen komen overeen met het verslag. ' + dekTxt;
    }
  },

  // ── kwam het ritrapport er, en stonden de twee soorten regels uit elkaar? ──
  // #196 was geen rekenfout maar een vormfout: ritLogs droeg fase-regels mét
  // stats en onderbrekingsregels zonder, en het rapport las ze allebei als
  // fases. In node is dat nu getoetst met een nagebouwde rit, en in de browser
  // met een gezette lijst. Wat op geen van beide plekken kan: een ECHTE rit,
  // waar de onderbreking ontstaat doordat Android de app wegzet en niet doordat
  // een test visibilitychange afvuurt. Alleen hier staat de lijst zoals hij na
  // een rit werkelijk is.
  {
    issue: '#196',
    naam: 'De onderbrekingen van de rit staan buiten de fase-lijst',
    waarom: 'Alleen een gereden rit vult ritLogs; in node en in de browserproef is die lijst gezet in plaats van gemeten.',
    proef: function () {
      if (typeof ritLogs === 'undefined' || typeof ritPauzeLog === 'undefined')
        return { staat: 'FOUT', detail: 'ritLogs of ritPauzeLog bestaat niet — pidlane-rit.js is niet geladen' };
      if (!ritLogs.length)
        return { staat: 'LET OP', detail: 'er is deze sessie geen rit-analyse afgerond, dus er is niets om de vorm van af te lezen' };

      // 1. De vormfout zelf. Eén regel zonder stats is genoeg om het rapport
      //    om te gooien, en dat kostte op 11-09 dertien minuten meetdata.
      const zonder = ritLogs.filter(function (l) { return !l || !l.stats; });
      if (zonder.length)
        return { staat: 'FOUT', detail: zonder.length + ' van de ' + ritLogs.length +
          ' regels in ritLogs heeft geen stats' +
          (zonder[0] && zonder[0].type ? ' (type "' + zonder[0].type + '")' : '') +
          ' — generateRitRapport() valt daarop om vóór de AI-call (#196)' };

      // 2. En de andere kant: de onderbrekingen horen wél ergens te staan.
      //    Waren ze er (PLRit/PLAchtergrond weten dat onafhankelijk) maar is
      //    ritPauzeLog leeg, dan zijn ze bij het splitsen kwijtgeraakt en weet
      //    het rapport niet meer waar de gaten zaten.
      var achtergrond = null;
      try { achtergrond = (window.PLAchtergrond && PLAchtergrond.perioden) ? PLAchtergrond.perioden().length : null; }
      catch (e) { return { staat: 'FOUT', detail: 'PLAchtergrond.perioden() faalde: ' + (e && e.message) }; }
      if (achtergrond && !ritPauzeLog.length)
        return { staat: 'LET OP', detail: 'PLAchtergrond telde ' + achtergrond + ' achtergrondperiode(n) maar ritPauzeLog is leeg — ' +
          'die vielen buiten de rit, of de onderbreking is niet geregistreerd' };

      // 3. Hangt elk gat aan een fase die bestaat? Een index buiten de lijst
      //    verdwijnt stil: de seconden staan nergens meer in het rapport.
      const buiten = ritPauzeLog.filter(function (p) {
        return typeof p.faseIdx !== 'number' || p.faseIdx < 0 || p.faseIdx >= ritLogs.length;
      });
      if (buiten.length)
        return { staat: 'FOUT', detail: buiten.length + ' onderbreking(en) wijzen naar een fase die niet in ritLogs staat — ' +
          'die seconden komen in geen enkele fase van het rapport terecht (#196)' };

      const sec = ritPauzeLog.reduce(function (a, p) { return a + (p.sec || 0); }, 0);
      return ritLogs.length + ' fases, alle met stats; ' + ritPauzeLog.length +
        ' onderbreking(en) van samen ' + sec + ' s, elk toegewezen aan een bestaande fase' +
        (achtergrond === null ? '' : ' (PLAchtergrond telde ' + achtergrond + ' periode(n))');
    }
  },

  // ── stopt de parser bij een tweede bericht? ──
  // De opgenomen regel van 16-09-2026, uit het BT-log van een goedkope
  // ELM327-kloon. Zonder de stop uit #210 vulden de echobytes (41 0B) de
  // opgegeven lengte precies af en kwam 0110 eruit op 166,51 g/s — een schone,
  // complete parse volgens de parser zelf, terwijl een losse 0110 in diezelfde
  // seconde 1,45 g/s gaf. Geen MIST, geen melding, en binnen de harde limiet
  // van 0-655, dus dat getal komt overal doorheen.
  //
  // Dit is gedrag en geen broncode: de échte functie krijgt de échte bytes.
  {
    issue: '#210',
    naam: 'Een herhaald frame levert een gat op en geen verzonnen getal',
    waarom: 'De parser draait hier met de tabellen en geleerde bytelengtes van DEZE auto; in node zijn die leeg.',
    proef: function () {
      if (typeof splitBatchResponse !== 'function')
        return { staat: 'FOUT', detail: 'splitBatchResponse ontbreekt — de parser waar de hele app op draait is niet geladen' };

      var echo = '008\r0:410B1E0E8B10\r008\r1:410B\r2:00760000000000\r\r>';
      var uit = splitBatchResponse(echo, ['010B', '010E', '0110']);

      if ('0110' in uit) {
        var b = uit['0110'];
        var g = (b && b.length >= 2) ? ((b[0] * 256 + b[1]) / 100) : null;
        return { staat: 'FOUT', detail: '0110 kwam uit een geëchood antwoord terug' +
          (g === null ? '' : ' op ' + g.toFixed(2) + ' g/s') +
          ' — de stop bij het tweede bericht werkt niet (#210)' };
      }
      if (!('010B' in uit) || !('010E' in uit))
        return { staat: 'FOUT', detail: 'de twee PIDs vóór de echo vielen ook weg (' +
          Object.keys(uit).join(', ') + ') — er wordt te vroeg gestopt' };
      if (uit['010B'][0] !== 0x1E)
        return { staat: 'FOUT', detail: '010B las ' + uit['010B'][0] + ' in plaats van 30 — de bytes schuiven op' };

      // En de tegenkant: een schoon antwoord mag hier niets van merken.
      var schoon = splitBatchResponse('008\r0:410C08A50D00\r1:111C\r\r>', ['010C', '010D', '0111']);
      if (!('0111' in schoon))
        return { staat: 'FOUT', detail: 'een SCHOON multiframe-antwoord verliest nu zijn laatste PID — de stop slaat te vroeg toe' };

      var s = null;
      try { s = (window.PLBus && PLBus.stats) ? PLBus.stats() : null; } catch (e) { s = null; }
      return 'echo levert een gat op (0110 ontbreekt), schoon antwoord blijft compleet' +
             (s ? '; deze sessie ' + s.echoTot + ' herhaalde antwoorden op de echte bus' : '');
    }
  },

  // ── doet de handmatige stand werkelijk iets? ──
  // Een schuifje dat het tempo niet verzet is erger dan geen schuifje: het
  // wekt vertrouwen dat er niets onder zit. Deze proef zet de stand écht om,
  // meet het effect op de multiplier, en zet alles terug zoals het stond.
  // Draait tijdens een rit, dus het terugzetten is geen nettigheid maar een
  // voorwaarde.
  //
  // HET IJKPUNT LIGT IN DE HANDMATIGE STAND ZELF (17-09-2026). Tot vandaag
  // las deze proef het interval vóór het overnemen en eiste daarna een
  // verdubbeling. Dat gaat alleen op als de automaat toevallig op 100% staat:
  // `handmatig(true)` neemt met opzet de stand over die er stond, dus op een
  // teruggeschroefde bus meet je 55% tegen 50% en dat is geen verdubbeling.
  // Zie §11.
  {
    issue: '#211',
    naam: 'De handmatige stand van het adapterpaneel verzet het tempo echt',
    waarom: 'Alleen in de draaiende app hangt pidPollInterval() aan PLLoad; in node is die koppeling er niet.',
    proef: function () {
      if (!window.PLAdapter) return { staat: 'FOUT', detail: 'PLAdapter ontbreekt — het verbindingspaneel is niet geladen' };
      if (!window.PLLoad || typeof PLLoad.handmatig !== 'function')
        return { staat: 'FOUT', detail: 'PLLoad.handmatig() ontbreekt — de knop in het paneel kan dan niets omzetten' };
      if (typeof pidPollInterval !== 'function')
        return { staat: 'FOUT', detail: 'pidPollInterval() ontbreekt — dan is niet te meten of het tempo doorwerkt' };

      var warenHandmatig = PLLoad.isHandmatig();
      var oudTempo = PLLoad.staat().tempoPct;
      var oudGroep = 3, oudVast = false;
      try { oudGroep = PLBus.batchGroep(); oudVast = PLBus.batchVast(); } catch (e) { /* stil: dan blijft de terugzet-stand de standaard */ }
      var fout = null, letop = null, gemeten = '';
      try {
        // Eerst overnemen, dán pas het ijkpunt lezen — anders meet je de
        // automaat en niet het schuifje.
        PLLoad.handmatig(true, 'blok 5');
        PLLoad.zetTempo(100);

        /* Een PID die op de bodem van 80 ms ligt kan hier niets bewijzen:
           Math.max() knijpt het verschil weg en dan geeft een wérkende
           multiplier tóch geen verdubbeling. Focus-PIDs (vast op 120 ms) en
           PIDs die de EV-modus uitzet (999999) vallen om dezelfde reden af.
           Vandaar een lijstje en niet één vaste PID. */
        var kandidaten = ['010C', '010D', '0104', '010B', '0111', '0105', '010F'];
        var probe = null, vol = 0;
        for (var i = 0; i < kandidaten.length; i++) {
          var kpid = kandidaten[i];
          if (typeof _focusPIDs !== 'undefined' && _focusPIDs && typeof _focusPIDs.has === 'function'
              && _focusPIDs.has(kpid)) continue;
          var ms = pidPollInterval(kpid);
          if (ms > 80 && ms < 99999) { probe = kpid; vol = ms; break; }
        }
        if (!probe) {
          letop = 'geen bruikbare PID om op te meten — alles lag op de bodem van 80 ms, stond op focus, ' +
                  'of was door de EV-modus uitgezet';
        } else {
          PLLoad.zetTempo(50);
          var half = pidPollInterval(probe);
          // Halve snelheid hoort het interval exact te verdubbelen. `vol` en
          // `half` zijn afgeronde hele milliseconden, en die afronding is met
          // twee ms gedekt — meer speling zou een halve fout doorlaten.
          if (Math.abs(half - vol * 2) > 2)
            fout = 'op 50% tempo ging ' + probe + ' van ' + vol + ' naar ' + half + ' ms terwijl ' +
                   (vol * 2) + ' ms hoort — de handmatige multiplier komt niet in pidPollInterval() aan';
          else gemeten = 'tempo 100% → 50%: ' + probe + ' van ' + vol + ' naar ' + half + ' ms; ';
        }

        // En de groep: vastzetten moet de automaat buiten de deur houden.
        if (!fout && !letop && window.PLBus && typeof PLBus.batchZet === 'function') {
          PLBus.batchZet(2, true);
          if (PLBus.batchKleiner() !== false)
            fout = 'PLBus.batchKleiner() verzette een vastgezette groep — de automaat regelt een handmatige keuze weg';
          else gemeten += 'groep 2 vastgezet: de automaat komt er niet aan';
        }
      } catch (e) {
        fout = 'de proef zelf viel om: ' + ((e && e.message) || e);
      } finally {
        // Terugzetten gebeurt hoe dan ook. Een proef die de app in een andere
        // stand achterlaat dan hij hem aantrof, meet de volgende ronde iets
        // anders dan hij denkt.
        try {
          PLLoad.zetTempo(oudTempo);
          PLLoad.handmatig(warenHandmatig, 'blok 5 zet terug');
          if (window.PLBus && typeof PLBus.batchZet === 'function') PLBus.batchZet(oudGroep, oudVast);
        } catch (e) { console.warn('Blok 5 kon de tempostand niet terugzetten:', e); }
      }
      if (fout) return { staat: 'FOUT', detail: fout };
      if (letop) return { staat: 'LET OP', detail: letop };
      return gemeten;
    }
  },

  // ── Groep 4–6 en de groepsproef (#333, 28-09-2026) ──
  // Drie dingen in de draaiende app: de plafonds (met de hand 6, automaat 3),
  // het oordeel over een onvolledig antwoord, en of de groepsproef deze
  // sessie gedraaid heeft. Die laatste is geen controle maar de uitslag van
  // de rit: hij zet het advies in het verslag, naast de rest.
  {
    issue: '#333',
    naam: 'Groep 4–6 met de hand, de automaat blijft op 3, en de groepsproef',
    waarom: 'Een automaat die ongemerkt boven de 3 komt, stuurt elke auto multiframe-verzoeken waar geen meting achter staat; en een groepsproef die niet in het verslag staat, is een rit zonder antwoord op #333.',
    proef: function () {
      if (!window.PLBus || typeof PLBus.batchZet !== 'function')
        return { staat: 'FOUT', detail: 'PLBus.batchZet ontbreekt — de groepsgrootte is dan niet te zetten' };
      if (typeof plGroepOordeel !== 'function')
        return { staat: 'FOUT', detail: 'plGroepOordeel() ontbreekt — de pollus telt een onvolledig antwoord dan weer als goed (#211)' };
      if (!window.PLAdapter || typeof PLAdapter.laatsteGroepsproef !== 'function')
        return { staat: 'FOUT', detail: 'PLAdapter.laatsteGroepsproef() ontbreekt — de groepsproef is niet geladen' };

      var oudGroep = 3, oudVast = false, fout = null, gemeten = '';
      try { oudGroep = PLBus.batchGroep(); oudVast = PLBus.batchVast(); } catch (e) { /* stil: dan blijft de terugzet-stand de standaard */ }
      if (!oudVast && oudGroep > PLBus.GROEP_AUTO_MAX)
        return { staat: 'FOUT', detail: 'de automaat staat op groep ' + oudGroep + ', boven zijn plafond van ' + PLBus.GROEP_AUTO_MAX };
      try {
        if (PLBus.batchZet(6, true) !== 6) fout = 'met de hand komt de groep niet op 6';
        else if (PLBus.batchZet(6, false) !== PLBus.GROEP_AUTO_MAX) fout = 'de automaat mag naar ' + PLBus.batchGroep() + ', boven zijn plafond';
        else gemeten = 'met de hand tot 6, de automaat tot ' + PLBus.GROEP_AUTO_MAX + '; ';
      } catch (e) {
        fout = 'de proef zelf viel om: ' + ((e && e.message) || e);
      } finally {
        try { PLBus.batchZet(oudGroep, oudVast); } catch (e) { console.warn('Blok 5 kon de groep niet terugzetten:', e); }
      }
      if (fout) return { staat: 'FOUT', detail: fout };

      // Het onderscheid waar het om draait: een PID die zojuist nog
      // antwoordde en nu ontbreekt, tegen een PID die nooit antwoordde.
      var nu = Date.now();
      var o1 = plGroepOordeel(['010C', '010D'], { '010C': [1] }, { '010C': nu, '010D': nu - 1000 }, nu);
      var o2 = plGroepOordeel(['010C', '010D'], { '010C': [1] }, { '010C': nu }, nu);
      if (o1.oordeel !== 'onvolledig' || o2.oordeel !== 'goed')
        return { staat: 'FOUT', detail: 'het oordeel onderscheidt niet: bekende PID weg gaf "' + o1.oordeel + '", onbekende gaf "' + o2.oordeel + '"' };
      gemeten += 'een bekende PID die ontbreekt telt als onvolledig. ';

      var gp = PLAdapter.laatsteGroepsproef();
      if (!gp) return { staat: 'LET OP', detail: gemeten + 'De groepsproef is deze sessie niet gedraaid — adapterpaneel → 📦 Groepsproef (zie de campagne en #333).' };
      if (gp.afgebroken) return { staat: 'LET OP', detail: gemeten + 'De groepsproef brak af: ' + gp.afgebroken };
      var a = gp.advies || {};
      var tabel = (a.groepen || []).map(function (x) {
        return x.groep + ':' + x.pidsPerSec + '/s' + (x.onvolPct ? ' ' + x.onvolPct + '%mis' : '') + (x.echo ? ' echo' + x.echo : '');
      }).join(' · ');
      var tekst = gemeten + 'Groepsproef ' + gp.adapter + ': ' + (a.kop || '?') + ' — ' + tabel;
      if (a.drift) return { staat: 'LET OP', detail: tekst + '. De responstijd verschoof tijdens de proef (groep ' + a.drift.groep + '); herhaal hem.' };
      return tekst;
    }
  },

  // ── wijst het advies de goede kant op? ──
  // De meting zelf heeft een adapter nodig, het oordeel niet. Dit voert het
  // geval van 16-09 in — een verbinding die op elke trap frames herhaalt — en
  // controleert dat het advies dan over de GROEP gaat en niet over het tempo.
  // Harder pollen maakt een echo vaker; dat advies zou de fout vergroten.
  {
    issue: '#212',
    naam: 'Het snelheidsadvies wijst bij herhaalde frames naar de groep, niet naar het tempo',
    waarom: 'Het oordeel hoort los van de meting te draaien; alleen hier staat hij naast de echte PLBus-cijfers.',
    proef: function () {
      if (!window.PLAdapter || typeof PLAdapter.advies !== 'function')
        return { staat: 'FOUT', detail: 'PLAdapter.advies() ontbreekt — dan geeft de snelheidstest geen oordeel' };

      var metEcho = [
        { naam: 'rustig', n: 14, perSec: 1.4, medMs: 180, soloMisPct: 0, batchOnvolPct: 30, echo: 4 },
        { naam: 'vol gas', n: 50, perSec: 5.0, medMs: 190, soloMisPct: 0, batchOnvolPct: 35, echo: 9 }
      ];
      var a = PLAdapter.advies(metEcho, { perSec: 3, tempoPct: 60 });
      if (a.tempoPct !== null && a.tempoPct !== undefined)
        return { staat: 'FOUT', detail: 'bij 13 herhaalde antwoorden adviseert hij tempo ' + a.tempoPct +
          '% — harder pollen maakt een echo juist vaker (#211)' };
      if (a.groep !== 2)
        return { staat: 'FOUT', detail: 'bij herhaalde antwoorden adviseert hij geen kleinere groep maar "' + a.kop + '"' };

      // De tegenkant: zonder echo's hoort er wél een tempo uit te komen, en
      // dat moet rekenwerk zijn. 60% op 3/s, schoon tot 6/s → 120, afgekapt
      // op 100. Een advies dat altijd hetzelfde zegt, zegt niets.
      var schoon = [
        { naam: 'rustig', n: 14, perSec: 1.4, medMs: 180, soloMisPct: 0, batchOnvolPct: 0, echo: 0 },
        { naam: 'vol gas', n: 60, perSec: 6.0, medMs: 200, soloMisPct: 0, batchOnvolPct: 0, echo: 0 }
      ];
      var b = PLAdapter.advies(schoon, { perSec: 3, tempoPct: 60 });
      if (b.tempoPct !== 100)
        return { staat: 'FOUT', detail: 'schoon tot 6/s bij 3/s op 60% hoort 100% te adviseren, kreeg ' + b.tempoPct };

      var laatste = PLAdapter.laatsteMeting();
      return 'echo → groep 2, schoon → tempo 100%' +
             (laatste ? '; laatste echte test om ' + new Date(laatste.t).toTimeString().slice(0, 8) +
                        ': ' + laatste.advies.kop : '; nog geen echte test gedraaid deze sessie');
    }
  },

  // ── overleeft een markering de volgende ronde? (#255, 18-09-2026) ──
  // De bedoelde volgorde is meetrit → testrun → toestelronde → testrun, en
  // juist die maakte de tweede run blind: `begeleidStart()` leegde de lijst.
  // test-markeringen.js toetst dat zonder browser. Wat die test NIET kan is
  // dit: draait er nu, op dit toestel, in deze sessie, werkelijk een lijst die
  // meer dan één ronde draagt?
  {
    issue: '#255',
    naam: 'Een markering zegt uit welke ronde hij komt',
    waarom: 'Acht proeven lezen deze lijst. Verdwijnt het ronde-veld, dan is filteren per ronde weer giswerk en kan een proef niet zeggen of de stap in de meetrit of in de toestelronde gezet is.',
    proef: function () {
      if (!window.PLBegeleid || typeof PLBegeleid.markeringen !== 'function')
        return { staat: 'FOUT', detail: 'PLBegeleid.markeringen() ontbreekt — dan is er niets om de stappen aan af te meten' };

      var lijst = PLBegeleid.markeringen();
      if (!lijst.length)
        return { staat: 'LET OP', detail: 'er staat deze sessie geen enkele markering — er is nog geen begeleide ronde gedraaid. ' +
          'Niet-aangeboden is iets anders dan niets-gezien (#227).' };

      var zonder = lijst.filter(function (m) { return !m.ronde; });
      if (zonder.length)
        return { staat: 'FOUT', detail: zonder.length + ' van de ' + lijst.length + ' markeringen dragen geen ronde: ' +
          zonder.slice(0, 3).map(function (m) { return m.tekst; }).join(', ') + ' — filteren per ronde is dan giswerk (#255)' };

      var rondes = {};
      lijst.forEach(function (m) { rondes[m.ronde] = (rondes[m.ronde] || 0) + 1; });
      var namen = Object.keys(rondes);
      var staart = namen.map(function (n) { return n + ': ' + rondes[n]; }).join(', ');

      if (namen.length > 1)
        return { staat: 'ok', detail: lijst.length + ' markeringen uit ' + namen.length + ' rondes (' + staart +
          ') — de lijst heeft een tweede ronde overleefd, en dat is precies wat op 18-09 misging' };

      return { staat: 'ok', detail: lijst.length + ' markering(en), alle uit ' + namen[0] + ' (' + staart +
        '). Dat er maar één ronde in staat is geen fout: er is er ook maar één gedraaid. ' +
        'Draai de toestelronde na de meetrit en deze regel toont er twee.' };
    }
  },

  // ── blijft de proefwaarde-vlag niet hangen? (#256, 18-09-2026) ──
  // Twee proeven hierboven schieten met opzet onmogelijke waarden in de
  // meetketen. Sinds vandaag zet `_zonderSporen()` daarbij een vlag, zodat die
  // regels in de logtabel als `proefwaarde` binnenkomen en niet als meting aan
  // een auto. Dat werkt precies zolang de vlag ook weer uitgaat: blijft hij
  // hangen, dan heet vanaf dat moment ELKE echte meting een proefwaarde — en
  // dan is de tabel stil onbruikbaar, wat erger is dan de fout die hij oploste.
  {
    issue: '#256',
    naam: 'De proefwaarde-vlag hangt niet, en de sessie klopt',
    waarom: 'Een vlag die aan blijft staan maakt elke echte meting onzichtbaar in de logtabel. Dat is hetzelfde soort stilte als een lege catch: niets gaat stuk, er verdwijnt alleen bewijs.',
    proef: function () {
      // De twee proeven die de vlag gebruiken zijn op dit punt al gedraaid.
      if (window._plProefWaarden)
        return { staat: 'FOUT', detail: 'de proefwaarde-vlag staat nog aan terwijl er geen proef loopt — ' +
          'vanaf hier komt elke echte meting als `proefwaarde` in de logtabel (#256)' };

      if (!window.PLTestrunLive || typeof PLTestrunLive.huidigeRit !== 'function')
        return { staat: 'FOUT', detail: 'PLTestrunLive.huidigeRit() ontbreekt — dan verzint elke logregel buiten een run zijn eigen sessie (#256)' };

      var rit = PLTestrunLive.huidigeRit();
      if (!rit)
        return { staat: 'FOUT', detail: 'er loopt een testrun maar huidigeRit() geeft niets terug — ' +
          'de gewone logregels van deze rit komen dan onder een ander nummer te staan dan dit verslag' };

      return { staat: 'ok', detail: 'de vlag staat uit en de app-log schrijft onder hetzelfde ritnummer als dit verslag (' + rit + ')' };
    }
  },

  // ── spreekt het oordeel zichzelf niet tegen? (#257, 18-09-2026) ──
  // De opdracht krijgt sinds vandaag een driewaardig oordeel. Dat is winst
  // zolang het oordeel en de losse uitslagen hetzelfde zeggen — en gevaarlijk
  // zodra dat niet meer zo is, want dan is er een tweede oordeel ontstaan.
  // Precies de vorm die #246 bij de meetkamer verbood.
  {
    issue: '#257',
    naam: 'Het oordeel over de opdracht en zijn uitslagen zeggen hetzelfde',
    waarom: 'Een kop die "gesloten" zegt boven een uitslag die buiten de band viel, laat je stoppen met de uitslagen lezen — en dan meet je daarna maanden naast.',
    proef: function () {
      if (!window.PLOpdracht || typeof PLOpdracht.oordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLOpdracht.oordeel() ontbreekt — het driewaardige oordeel is weg (#257)' };

      var o = PLOpdracht.actief();
      if (!o)
        return { staat: 'LET OP', detail: 'er is geen opdracht geladen, dus er valt hier niets naast elkaar te leggen — ' +
          (PLOpdracht.reden() || 'reden onbekend') };

      var v = PLOpdracht.oordeel(o, _stapGezet);
      var fout = v.uitslagen.filter(function (u) { return u.staat === 'FOUT'; });
      var stil = v.uitslagen.filter(function (u) { return u.staat === 'LET OP'; });
      var mist = v.voorwaarden.filter(function (x) { return x.vervuld !== true; });

      if (v.staat === 'gesloten' && (fout.length || stil.length || mist.length))
        return { staat: 'FOUT', detail: 'het oordeel zegt "gesloten" terwijl er ' + fout.length + ' buiten de band, ' +
          stil.length + ' niet-gemeten en ' + mist.length + ' onvervulde voorwaarde(n) staan — er is een tweede oordeel ontstaan' };
      if (v.staat === 'bevinding' && !fout.length)
        return { staat: 'FOUT', detail: 'het oordeel zegt "bevinding" terwijl geen enkele uitslag buiten de band viel' };
      if (v.staat === 'nog niet' && !stil.length && !mist.length)
        return { staat: 'FOUT', detail: 'het oordeel zegt "nog niet" terwijl alles gemeten is en alle voorwaarden vervuld zijn' };

      return { staat: 'ok', detail: '"' + o.naam + '" → ' + v.staat + ' — ' + v.uitslagen.length + ' uitslag(en) en ' +
        v.voorwaarden.length + ' voorwaarde(n) zeggen hetzelfde als de kop' };
    }
  },

  // ── kan het live oordeel de tabel in? (19-09-2026) ────────────────
  // Op 19-09 zijn er dertien opdrachten achter elkaar gekozen en is van elk
  // het oordeel op het scherm gelezen. In de logtabel stond er nul van terug:
  // alleen een volledige testrun schreef iets weg, en die is die rit niet
  // afgemaakt. De rit is hier de schaarste (#257), dus dat is een rit weg.
  //
  // Deze proef staat NA de #241-proef hierboven, en dat is geen smaak: die
  // proef IS de terugweg. Is hij gelopen, dan hoort deze uitkomst nu in de
  // tabel te staan en hoort de knop dat te weten. Zegt hij van niet, dan
  // levert dezelfde uitkomst straks een tweede reeks rijen op.
  {
    issue: '#257',
    naam: 'Het live oordeel kan de tabel in, en maar één keer',
    waarom: 'Een oordeel dat alleen op het scherm staat, is na de rit weg — en een knop die niet weet wat hij al verstuurd heeft, vult de tabel met dezelfde rij.',
    proef: function () {
      var L = window.PLTestrunLive || {};
      if (typeof L.oordeelNu !== 'function' || typeof L.verzend !== 'function')
        return { staat: 'FOUT', detail: 'PLTestrunLive.oordeelNu()/verzend() ontbreekt — het live oordeel kan de tabel niet meer in' };

      var nu = L.oordeelNu();
      if (!nu.vonnis)
        return { staat: 'LET OP', detail: 'er valt niets te verzenden: ' + (nu.reden || 'geen opdracht geladen') };

      // De #241-proef heeft deze uitkomst net weggeschreven. Staat de knop
      // daarna nog steeds op "nog te verzenden", dan telt hij zijn eigen
      // verzending niet mee en levert één druk een dubbele reeks op.
      if (!nu.alVerzonden)
        return { staat: 'FOUT', detail: 'de terugweg is deze run gelopen maar de knop weet dat niet — ' +
          'op "' + nu.vonnis.staat + '" volgt dan een tweede reeks rijen met dezelfde uitkomst' };

      // En de weigering moet echt weigeren, niet alleen zo heten.
      var r = L.verzend();
      if (r.ok)
        return { staat: 'FOUT', detail: 'verzenden lukte een tweede keer met een ongewijzigd oordeel — elke druk op de knop vult de tabel opnieuw' };

      return { staat: 'ok', detail: 'uitkomst "' + nu.vonnis.staat + '" staat in de tabel; een tweede verzending wordt geweigerd (' + r.reden + ')' };
    }
  },

  // ── de terugknop sluit elk venster met een ✕ (#300, 26-09-2026) ──
  // bproef-terugknop.js toetst dit in Chromium. Hier staat hij op het toestel
  // zelf: met de echte schermmaat, het echte lettertype en wat er op dit
  // moment nog meer openstaat. elementFromPoint() is precies het soort vraag
  // waarvan het antwoord per scherm kan verschillen.
  {
    issue: '#300',
    naam: 'De terugknop sluit een venster dat niet in de vaste lijst staat',
    waarom: 'Welk ✕ bovenop ligt, hangt af van dit scherm en wat er nu openstaat; dat meet alleen de draaiende app.',
    proef: function () {
      if (typeof _plBovensteSluitKnop !== 'function' || typeof _plBackHandler !== 'function')
        return { staat: 'FOUT', detail: 'de ✕-zoeker of de terugknop-handler ontbreekt' };
      if (!window.PLWaakUI || typeof PLWaakUI.open !== 'function')
        return { staat: 'LET OP', detail: 'het waakvenster is niet geladen — dan is er geen venster buiten de lijst om te openen' };
      // Het testrunpaneel (z 9980) en het Run-venster (9976) liggen boven het
      // waakvenster (9800). Laten staan betekent dat het waakvenster eronder
      // opengaat en terug het testrunpaneel sluit (testrun 8.3). Even opzij.
      const opzij = ['testrunOv', 'runOv'].map(function (id) { return document.getElementById(id); })
        .filter(function (e) { return e && getComputedStyle(e).display !== 'none'; })
        .map(function (e) { const d = e.style.display; e.style.display = 'none'; return function () { e.style.display = d; }; });
      let ov, open, knop, zijn, dicht;
      try {
        PLWaakUI.open();
        ov = document.getElementById('wkvOv');
        open = !!ov && getComputedStyle(ov).display !== 'none';
        if (open) {
          knop = _plBovensteSluitKnop();
          zijn = !!knop && ov.contains(knop);
          _plBackHandler();
          dicht = getComputedStyle(ov).display === 'none' || !ov.isConnected;
          if (!dicht) { try { PLWaakUI.sluit(); } catch (e) { console.warn('Testrun: waakvenster niet gesloten na de proef', e); } }
        }
      } finally { opzij.forEach(function (terug) { terug(); }); }
      if (!open) return { staat: 'LET OP', detail: 'het waakvenster ging niet open — er valt niets te sluiten' };
      if (!zijn) return { staat: 'FOUT', detail: 'de zoeker koos ' + (knop ? 'een ✕ buiten het waakvenster (' + (knop.id || knop.className) + ')' : 'geen enkele ✕') + ' terwijl dat venster bovenop lag' };
      if (!dicht) return { staat: 'FOUT', detail: 'de terugknop liet het waakvenster openstaan' };
      return 'waakvenster open, de zoeker vond zijn ✕ en de terugknop sloot het';
    }
  },

  // ── zwevende pillen boven de Android-knoppen (#300) ──
  // In de browser is --pl-sab 0px en ziet elke pil er goed uit. Alleen op het
  // toestel zet Capacitor de echte hoogte van de knoppenbalk.
  {
    issue: '#300',
    naam: 'De balk van de scenariotest staat boven de Android-knoppen',
    waarom: 'De hoogte van de knoppenbalk bestaat alleen op het toestel; in de browser is hij 0px.',
    proef: function () {
      const sab = parseFloat(getComputedStyle(document.body).getPropertyValue('--pl-sab')) || 0;
      if (typeof updateScenarioBadge !== 'function' || typeof _scenario === 'undefined')
        return { staat: 'FOUT', detail: 'updateScenarioBadge() of _scenario ontbreekt' };
      const was = _scenario.enabled;
      let ruimte = null;
      try {
        _scenario.enabled = true; updateScenarioBadge();
        const b = document.getElementById('scenarioBadge');
        if (b) ruimte = Math.round(window.innerHeight - b.getBoundingClientRect().bottom);
      } finally { _scenario.enabled = was; updateScenarioBadge(); }
      if (ruimte === null) return { staat: 'FOUT', detail: 'de scenariobalk werd niet getekend' };
      if (!sab) return { staat: 'LET OP', detail: 'geen knoppenbalk gemeld (--pl-sab is 0) — op dit toestel valt er niets onder te schuiven; ruimte ' + ruimte + 'px' };
      if (ruimte < sab) return { staat: 'FOUT', detail: 'de balk staat ' + ruimte + 'px boven de onderrand, de knoppenbalk is ' + Math.round(sab) + 'px — hij valt er deels achter' };
      return 'balk ' + ruimte + 'px boven de onderrand, knoppenbalk ' + Math.round(sab) + 'px';
    }
  },

  // ── de systeemtest herkent de situatie van nu (#300) ──
  // De checklist meet elke test alleen in zijn eigen situatie. Of "constant
  // rijden" of "optrekken" op een echte rit herkend wordt, hangt aan de
  // snelheidshistorie van déze auto; dat is een vraag voor de weg.
  {
    issue: '#300',
    naam: 'De systeemtest herkent de rijsituatie van nu',
    waarom: 'De rijfase komt uit de snelheidshistorie van deze auto op deze weg; een browserproef heeft alleen nagebootste waarden.',
    proef: function () {
      if (typeof bscSituaties !== 'function' || typeof BSC_SIT === 'undefined')
        return { staat: 'FOUT', detail: 'bscSituaties() of BSC_SIT ontbreekt — de systeemtest is niet geladen' };
      const onbekend = (window.BSC_TESTS || []).filter(function (t) { return !BSC_SIT[t.sit || 'draaiend']; }).map(function (t) { return t.id; });
      if (onbekend.length) return { staat: 'FOUT', detail: 'tests met een situatie die de app niet kent: ' + onbekend.join(', ') + ' — die wachten eeuwig' };
      const nu = [...bscSituaties()];
      if (typeof pidVals['010C'] !== 'number')
        return { staat: 'LET OP', detail: 'geen toerental binnen — niet verbonden of motor niet gestart; herkend: ' + (nu.join(', ') || 'niets') };
      if (!nu.length) return { staat: 'FOUT', detail: 'er komt een toerental binnen (' + pidVals['010C'] + ') maar er wordt geen enkele situatie herkend' };
      return 'herkend: ' + nu.join(', ') + ' (toerental ' + Math.round(pidVals['010C']) + ', snelheid ' + (pidVals['010D'] === undefined ? '—' : pidVals['010D']) + ')';
    }
  },

  // ── een bevinding blijft minstens 5 s staan (#300) ──
  {
    issue: '#300',
    naam: 'Een automatische bevinding blijft minstens 5 s in beeld',
    waarom: 'Of een bevinding na één meetronde weer verdwijnt, hangt aan de echte meetronden van deze auto.',
    proef: function () {
      if (typeof BEV_MIN_MS === 'undefined' || typeof _bevToon === 'undefined' || typeof _bevHits === 'undefined')
        return { staat: 'FOUT', detail: 'de naklank van de bevindingen ontbreekt (BEV_MIN_MS/_bevToon)' };
      if (BEV_MIN_MS < 5000) return { staat: 'FOUT', detail: 'de minimale toontijd staat op ' + BEV_MIN_MS + ' ms' };
      const toon = _bevToon.map(function (h) { return h.id; });
      const mist = _bevHits.filter(function (h) { return toon.indexOf(h.id) < 0; }).map(function (h) { return h.id; });
      if (mist.length) return { staat: 'FOUT', detail: 'bevindingen van nu die niet in beeld staan: ' + mist.join(', ') };
      return _bevHits.length + ' bevinding(en) van nu, ' + (toon.length - _bevHits.length) + ' die nog naklinken; toontijd ' + (BEV_MIN_MS / 1000) + ' s';
    }
  },

  // ── het foutcodevenster leest deze auto (#304) ──
  // Alleen LEZEN. Deze proef wist nooit: wissen gooit het freeze frame en de
  // keuringsstatus weg, en dat hoort een mens te besluiten in het venster zelf.
  {
    issue: '#304',
    naam: 'Het foutcodevenster leest 03, 07, 0A en de keuringsstatus van deze auto',
    waarom: 'Of de ECU op 07 en 0A antwoordt en welke monitors hij in 0101 meldt, weet alleen de auto — de browserproef heeft een nep-adapter.',
    proef: async function () {
      if (!window.PLFoutcodes || typeof PLFoutcodes.scan !== 'function')
        return { staat: 'FOUT', detail: 'PLFoutcodes ontbreekt — de deur op het startscherm opent dan niets (#304)' };
      if (typeof connected === 'undefined' || !connected || (typeof demoMode !== 'undefined' && demoMode))
        return { staat: 'LET OP', detail: 'niet verbonden met een echte auto — niets uitgelezen' };
      const s = await PLFoutcodes.scan();
      if (!s) return { staat: 'FOUT', detail: 'uitlezen liep niet af: ' + (PLFoutcodes.staat().fout || 'onbekend') };
      const deel = function (k) { return s.gelezen[k] ? s.codes[k].length + (s.codes[k].length ? ' (' + s.codes[k].join(', ') + ')' : '') : 'niet gelezen'; };
      const rd = s.readiness;
      const tekst = 'bevestigd ' + deel('bevestigd') + ' · pending ' + deel('pending') + ' · permanent ' + deel('permanent') +
        ' · keuringsstatus ' + (rd ? (rd.ondersteund - rd.nietKlaar.length) + '/' + rd.ondersteund + ' klaar' + (rd.nietKlaar.length ? ' (niet: ' + rd.nietKlaar.join(', ') + ')' : '') : 'niet gelezen') +
        ' · freeze frame ' + (s.freeze ? s.freeze.code : 'geen') +
        ' · sinds wissen ' + (s.sinds.km != null ? s.sinds.km + ' km' : 'onbekend');
      if (!s.gelezen.bevestigd) return { staat: 'FOUT', detail: '03 gaf geen bruikbaar antwoord — ' + tekst };
      if (!rd || !s.gelezen.pending || !s.gelezen.permanent) return { staat: 'LET OP', detail: tekst };
      return tekst;
    }
  },

  // ══ RONDE 27-09 — sluitende meetproeven ══════════════════════════
  // Elke proef hieronder oordeelt over de HELE rit, niet over het moment van
  // de testrun: de modules houden hun eigen sessiebewijs bij (sessie(),
  // stats(), perioden(), sessieOordeel()) en het oordeel zelf is een pure
  // functie in die module (oordeel()), getoetst in node. Er zijn drie uitkomsten
  // en elk zegt iets bruikbaars:
  //   ok      — de vraag is beantwoord en het klopt;
  //   FOUT    — de vraag is beantwoord en het klopt niet, met het waarom;
  //   LET OP  — de situatie deed zich niet voor, met PRECIES wat de rit nodig
  //             had. CAMPAGNE zet die situaties allemaal in één rit, zodat een
  //             rit niet drie keer over hoeft.

  // ── #319: loopt de meetlus door in beeld-in-beeld? ──
  {
    issue: '#319',
    naam: 'De meetlus loopt door in beeld-in-beeld',
    waarom: 'Of Android de timers van een gepauzeerde activiteit afknijpt, bestaat niet in headless Chromium — dat weet alleen de telefoon in de auto.',
    proef: async function () {
      if (!window.PLPip || typeof PLPip.oordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLPip.oordeel ontbreekt — dan is #319 niet te beoordelen' };
      const o = PLPip.oordeel(PLPip.perioden(), PLPip.laatste());
      let extra = '';
      try {
        if (window.PLAchtergrond) {
          const st = PLAchtergrond.stilsteS(0);
          if (st) extra = ' · langste gemeten stilte buiten beeld: ' + st + ' s';
        }
      } catch (e) { console.warn('proef #319: achtergrond onleesbaar', e); }
      return o.staat === 'ok' ? o.detail + extra : { staat: o.staat, detail: o.detail + extra };
    }
  },

  // ── #294: haalt Slim visueel het tempo op een echte auto? ──
  {
    issue: '#294',
    naam: 'Slim visueel houdt pedaal en laaddruk op de meter tijdens het rijden',
    waarom: 'Het tempo hangt af van wat de ECU en de adapter onder belasting doen; de nep-adapter van de browserproef heeft geen busvertraging.',
    proef: async function () {
      if (!window.PLVisueel || typeof PLVisueel.ritOordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLVisueel.ritOordeel ontbreekt' };
      const o = PLVisueel.ritOordeel(PLVisueel.sessie());
      return o.staat === 'ok' ? o.detail : o;
    }
  },

  // ── #326: opslaan landt in Documenten, zonder deelvenster ──
  {
    issue: '#326',
    naam: 'Opslaan schrijft rechtstreeks in Documenten/PidLane, ook de tweede keer',
    waarom: 'Of Android het schrijven in Documenten toestaat (ook na een herinstallatie) weet alleen het toestel; de browser heeft geen Documenten-map.',
    proef: async function () {
      if (typeof plOpslagOordeel !== 'function') return { staat: 'FOUT', detail: 'plOpslagOordeel ontbreekt' };
      const o = plOpslagOordeel(window._plOpslag);
      return o.staat === 'ok' ? o.detail : o;
    }
  },

  // ── de vaste sensoren van het voertuig na het verbinden (28-09-2026) ──
  {
    issue: '—',
    naam: 'De vaste sensoren van het voertuig staan aan na het verbinden, ook na een herstart',
    waarom: 'Het ging mis op de volgorde van een echte verbinding na een herstart (VIN van de vorige keer, PID-lijst nog niet klaar); de browserproef bootst die na, de rit bewijst hem.',
    proef: async function () {
      if (!window.PLGarage || typeof PLGarage.selectieOordeel !== 'function') return { staat: 'FOUT', detail: 'PLGarage.selectieOordeel ontbreekt' };
      const lijst = (typeof discoveredPIDDefs !== 'undefined' && discoveredPIDDefs) ? discoveredPIDDefs.map(function (d) { return d.pid; }) : [];
      let weg = [];
      try { if (typeof pidOpgeruimdLijst === 'function') weg = pidOpgeruimdLijst().map(function (x) { return x.pid; }); }
      catch (e) { console.warn('pidOpgeruimdLijst() gaf een fout — een opgeruimde vaste sensor telt dan als FOUT', e); }
      const o = PLGarage.selectieOordeel(PLGarage.gekoppeld(), (typeof activePIDs !== 'undefined') ? Array.from(activePIDs) : [], lijst, weg);
      return o.staat === 'ok' ? o.detail : o;
    }
  },

  // ── Slim visueel knippert niet (28-09-2026) ──
  {
    issue: '—',
    naam: 'De meter van Slim visueel knippert niet tijdens het rijden',
    waarom: 'Het knipperen kwam van haperingen op een echte bus (acht banden via ECU-adres 720); in de browser is er geen bus die hapert.',
    proef: async function () {
      if (!window.PLVisueel || typeof PLVisueel.rustOordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLVisueel.rustOordeel ontbreekt' };
      const o = PLVisueel.rustOordeel(PLVisueel.sessie());
      return o.staat === 'ok' ? o.detail : o;
    }
  },

  // ── de trekmodus (caravan of beladen) ──
  {
    issue: '—',
    naam: 'De trekmodus toont koelwater, olie en belasting tijdens het rijden',
    waarom: 'De trend in °C per minuut en de waarschuwing hebben een echte klim nodig; de browserproef toetst alleen de tekening.',
    proef: async function () {
      if (!window.PLVisueel || typeof PLVisueel.trekOordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLVisueel.trekOordeel ontbreekt' };
      const o = PLVisueel.trekOordeel(PLVisueel.sessie());
      return o.staat === 'ok' ? o.detail : o;
    }
  },

  // ── de versnellingsindicator op deze bak ──
  {
    issue: '—',
    naam: 'De versnellingsindicator herkent de versnellingen van deze auto',
    waarom: 'Hoeveel pieken een echte bak geeft en of ze stabiel blijven (slip, banden) is in simulatie niet na te bootsen.',
    proef: async function () {
      if (!window.PLGear || typeof PLGear.oordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLGear.oordeel ontbreekt' };
      const st = PLGear.status();
      const o = PLGear.oordeel(PLGear.sessie(), st);
      let rs = '';
      try { const r = PLGear.rijstijl(PLGear.sessie().tijd); if (r.verdeling.length) rs = ' · deze rit: ' + r.verdeling.map(function (x) { return x.k + 'e ' + x.pct + '%'; }).join(' '); }
      catch (e) { console.warn('proef versnelling: rijstijl onleesbaar', e); }
      const d = o.detail + rs + (st.voertuig ? ' · bij ' + st.voertuig : ' · niet aan een voertuig gekoppeld');
      return o.staat === 'ok' ? d : { staat: o.staat, detail: d };
    }
  },

  // ── eigen PIDs per voertuig: antwoordt de auto op de code van de dealer? ──
  {
    issue: '—',
    naam: 'Eigen PIDs van het voertuig geven antwoord tijdens de rit',
    waarom: 'Of een mode-22-code van de dealer op deze ECU antwoordt, en of de formule klopt, weet alleen de auto; de browserproef rekent met een nepantwoord.',
    proef: async function () {
      if (!window.PLEigen || typeof PLEigen.oordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLEigen.oordeel ontbreekt' };
      const echt = (typeof connected !== 'undefined' && connected) && !(typeof demoMode !== 'undefined' && demoMode);
      const defs = PLEigen.defs();
      const o = PLEigen.oordeel({ echt: echt, defs: defs, nu: Date.now(),
        actief: (typeof activePIDs !== 'undefined' && activePIDs) ? Array.from(activePIDs) : [],
        laatst: (typeof _pidLastUpd !== 'undefined' && _pidLastUpd) ? _pidLastUpd : {},
        waarden: (typeof pidVals !== 'undefined' && pidVals) ? pidVals : {} });
      return o.staat === 'ok' ? o.detail : o;
    }
  },

  // ── de banden: komen ze elke minuut binnen via ECU-adres 720? ──
  {
    issue: '—',
    naam: 'De vier banden komen binnen en staan in het bandenvenster',
    waarom: 'Of de bandensensoren via hun eigen ECU-adres elke minuut antwoorden zonder de rest van de bus te storen, weet alleen een rit.',
    proef: async function () {
      if (!window.PLBanden || typeof PLBanden.oordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLBanden.oordeel ontbreekt' };
      const n = PLBanden.nu();
      const o = PLBanden.oordeel(n.ind, n.st);
      return o.staat === 'ok' ? o.detail : o;
    }
  },

  // ── de berekende PIDs: nooit de bus op, en plausibel ──
  {
    issue: '—',
    naam: 'Berekende PIDs gaan niet de bus op en blijven binnen hun bereik',
    waarom: 'Welke bronnen de ECU levert (015E, 0162/0163, 0133, 017C) en of het vermogen klopt met het profiel, weet alleen de auto.',
    proef: async function () {
      if (!window.PLBerekend || typeof PLBerekend.oordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLBerekend.oordeel ontbreekt' };
      if (typeof plIsBerekend !== 'function' || !plIsBerekend('CA01'))
        return { staat: 'FOUT', detail: 'plIsBerekend ontbreekt — dan vraagt de pollus CA01 bij de auto op' };
      const o = PLBerekend.oordeel(PLBerekend.stats());
      return o.staat === 'ok' ? o.detail : o;
    }
  },

  // ── #302: het antwoordcijfer op groepsverzoeken (28-09-2026) ──
  // Een ELM327 met ATAT1 zit na elk groepsantwoord zijn geleerde wachttijd
  // uit, en leert die van de traagste antwoorder: de drift van #302. Sinds
  // 28-09 dragen groepsverzoeken een geleerd antwoordcijfer (PLAntwoordtal in
  // pidlane-plload.js) en slaat de adapter die wachttijd over. Of dat in de
  // auto zo werkt kan alleen een rit zeggen: de browser heeft geen ELM. Deze
  // proef leest wat PLAntwoordtal de hele sessie zag; hij stuurt zelf niets.
  {
    issue: '#302',
    naam: 'Groepsverzoeken dragen het antwoordcijfer en zijn daarmee sneller',
    waarom: 'Zonder cijfer betaalt elk groepsverzoek de geleerde wachttijd van de adapter; of het cijfer die op deze adapter echt overslaat, kan alleen een echte ELM laten zien.',
    proef: async function () {
      if (!window.PLAntwoordtal || typeof PLAntwoordtal.stand !== 'function')
        return { staat: 'FOUT', detail: 'PLAntwoordtal ontbreekt — groepsverzoeken gaan zonder antwoordcijfer de bus op' };
      const st = PLAntwoordtal.stand();
      const kop = st.met + ' groepsverzoeken met cijfer, ' + st.zonder + ' zonder, ' + st.geleerd + ' van ' + st.verzoeken + ' verzoekvormen geleerd';
      if (!(st.met + st.zonder)) return { staat: 'LET OP', detail: 'geen groepsverzoeken deze sessie — niet verbonden, of geen CAN; de proef heeft een rit met de pollus nodig' };
      if (!st.met) return { staat: 'FOUT', detail: kop + ' — er is nooit een cijfer meegestuurd' };
      if (st.blokkades) return { staat: 'LET OP', detail: kop + ' — ' + st.blokkades + ' keer ging het cijfer uit omdat er met cijfer een PID ontbrak; staat in het BT-log ("Antwoordcijfer … uit")' };
      if (st.msMet === null || st.msZonder === null) return { staat: 'LET OP', detail: kop + ' — te weinig metingen om met en zonder te vergelijken' };
      if (st.msMet >= st.msZonder) return { staat: 'LET OP', detail: kop + ' — geen winst: met cijfer ' + st.msMet + ' ms, zonder ' + st.msZonder + ' ms. Telt deze adapter antwoorden anders dan frames?' };
      return kop + ' · met cijfer ' + st.msMet + ' ms, zonder ' + st.msZonder + ' ms (' + Math.round((1 - st.msMet / st.msZonder) * 100) + '% sneller)';
    }
  },

  // ── #341: motor uit is een pauze, geen einde (29-09-2026) ──
  // De garage sloot een rit af zodra de verbinding wegviel, en na drie minuten
  // stil. Een tankstop maakte er twee ritten van. Of een stop onderweg nu één
  // rit met een pauze oplevert, zegt alleen een echte stop met de motor uit.
  {
    issue: '#341',
    naam: 'Een stop onderweg is een pauze in de rit, geen tweede rit',
    waarom: 'Motor uit, adapter zonder stroom of de app even dicht: op het moment zelf niet van aankomen te onderscheiden. Pas het wegrijden zegt welke van de twee het was.',
    proef: async function () {
      if (!window.PLGarage || typeof PLGarage.ritVerslag !== 'function' || typeof PLGarage.ritNu !== 'function')
        return { staat: 'FOUT', detail: 'PLGarage.ritVerslag/ritNu ontbreekt — de ritgrens is niet te zien' };
      if (typeof plBusVrijgeven !== 'function') return { staat: 'FOUT', detail: 'plBusVrijgeven ontbreekt — verbreken laat de bus bezet' };
      const u = window.currentUser;
      if (!(u && String(u.role || '').toLowerCase() === 'klant'))
        return { staat: 'LET OP', detail: 'geen klantaccount — de ritwaarnemer loopt alleen voor klanten met een actief voertuig' };
      const vs = PLGarage.ritVerslag(), nu = PLGarage.ritNu();
      const pauzes = vs.reduce(function (n, r) { return n + (r.pauzes || 0); }, 0) + ((nu && nu.sam && nu.sam.extra && nu.sam.extra.pauzes) || 0);
      const kop = vs.length + ' rit(ten) afgesloten' + (vs.length ? ' (' + vs.map(function (r) { return r.km + ' km, ' + r.einde + (r.pauzes ? ', ' + r.pauzes + ' pauze' : ''); }).join('; ') + ')' : '') +
        (nu ? ' · lopende rit: ' + nu.stand + (nu.sam ? ', ' + nu.sam.km + ' km' : '') : '');
      if (!vs.length && !nu) return { staat: 'LET OP', detail: 'geen rit deze sessie — rij minstens 0,3 km met een actief voertuig in Mijn voertuigen' };
      if (!pauzes) return { staat: 'LET OP', detail: kop + ' — nog geen pauze gezien: stop onderweg, motor uit, drie minuten, en rij door (CAMPAGNE)' };
      return kop + ' · ' + pauzes + ' pauze(s) doorgelopen in dezelfde rit';
    }
  },

  // ── #302: SPP-antwoorden per event in plaats van per 50 ms-poll (28-09-2026) ──
  // Of de plugin op een echt toestel events aflevert, en of dat sneller is,
  // kan alleen een rit zeggen: de browserproeven vervangen _sendBTOnce.
  {
    issue: '#302',
    naam: 'SPP-antwoorden komen per event binnen, niet per poll',
    waarom: 'Pollen kostte minstens 50 ms per commando; een event is er zodra de prompt binnen is. Of de plugin dat op dit toestel doet, weet alleen een echte socket.',
    proef: async function () {
      if (typeof window.plSppModus !== 'function') return { staat: 'FOUT', detail: 'plSppModus ontbreekt — het eventpad is niet geladen' };
      if (!window._sppConn) return { staat: 'LET OP', detail: 'geen SPP-verbinding deze sessie (BLE, Web Serial of demo) — deze proef gaat alleen over SPP' };
      const m = plSppModus();
      let ms = null;
      try { const s = PLBus.stats(); ms = s && s.gemMs; } catch (e) { console.warn('proef SPP-events: PLBus.stats onleesbaar', e); }
      const tijd = (typeof ms === 'number') ? ' · gemiddeld ' + ms + ' ms per commando' : '';
      if (m.modus === 'event') return 'antwoorden per event' + tijd;
      if (/pl_spp_poll/.test(m.reden)) return { staat: 'LET OP', detail: 'pollen staat met de hand aan (pl_spp_poll = 1)' + tijd };
      return { staat: 'FOUT', detail: 'terug op pollen: ' + (m.reden || 'onbekende reden') + tijd + ' — het BT-log zegt wanneer ("SPP: terug naar read()-polling")' };
    }
  },

  // ── de opruimread vóór elk SPP-commando (01-10-2026) ──
  // In eventstand ging er vóór elk commando een read() over de Capacitor-brug
  // om een half antwoord weg te halen. In ~900 verzoeken vond hij nooit iets,
  // en tussen twee verzoeken zat 70–100 ms bij een adapter van 27–34 ms. Nu
  // wordt er alleen na een onnette ronde geruimd. Of dat op een echte socket
  // ook zo zelden is, en wat het tempo dan doet, zegt alleen een rit.
  {
    issue: '#302',
    naam: 'De opruimread vóór een SPP-commando alleen na een onnette ronde',
    waarom: 'Elke read() is een rondgang via de JS-draad; als hij elke keer gaat kost hij tempo, als hij nooit gaat plakt een half laat antwoord aan het volgende.',
    proef: async function () {
      if (typeof window.plSppModus !== 'function') return { staat: 'FOUT', detail: 'plSppModus ontbreekt — het eventpad is niet geladen' };
      if (!window._sppConn) return { staat: 'LET OP', detail: 'geen SPP-verbinding deze sessie — deze proef gaat alleen over SPP' };
      const m = plSppModus();
      if (typeof m.vragen !== 'number') return { staat: 'FOUT', detail: 'plSppModus telt de opruimread niet — oude pidlane-bt.js in de cache?' };
      let s = null;
      try { s = PLBus.stats(); } catch (e) { console.warn('proef opruimread: PLBus.stats onleesbaar', e); }
      const tempo = s ? ' · ' + s.perSec + ' verzoeken/s, ' + s.venGemMs + ' ms per commando (laatste 10 s)' : '';
      const kern = m.flushes + ' opruimread(s) op ' + m.vragen + ' commando\'s per event, ' + m.flushVond + ' keer met een restje' + tempo;
      if (m.modus !== 'event') return { staat: 'LET OP', detail: 'niet in eventstand (' + (m.reden || 'pollen') + ') — de opruimread hoort bij de eventstand; ' + kern };
      if (m.altijdFlush) return { staat: 'LET OP', detail: 'oude stand afgedwongen (pl_spp_flush = 1): ' + kern };
      if (m.vragen < 50) return { staat: 'LET OP', detail: 'te weinig commando\'s om iets te zeggen: ' + kern };
      if (m.flushes > m.vragen * 0.1) return { staat: 'LET OP', detail: 'meer dan één op de tien rondes onnet: ' + kern + ' — het BT-log zegt waarom (time-outs, "RX zonder vraag")' };
      return kern;
    }
  },

  // ── #302: loopt de responstijd op, waardoor, en wat zet hem terug? ──
  // Staat bewust ACHTERAAN: als de drift er is, voert deze proef zelf het
  // experiment uit dat #302 vraagt, en dat raakt de verbinding aan.
  //   1. dezelfde meting ervoor en erna: 15× 010C solo, de mediaan;
  //   2. eerst alleen de ELM opnieuw initialiseren (ATWS, de socket blijft);
  //   3. helpt dat niet, dan een nieuwe verbinding (de socket opnieuw).
  // Zo zegt één rit of het de adapter-toestand is of de Bluetooth-socket.
  {
    issue: '#302',
    naam: 'De responstijd van de adapter blijft vlak over een hele verbinding',
    waarom: 'De drift kwam na een half uur op een echte adapter; de browser heeft geen socket die trager kan worden.',
    proef: async function () {
      if (!window.PLAdapter || typeof PLAdapter.driftOordeel !== 'function')
        return { staat: 'FOUT', detail: 'PLAdapter.driftOordeel ontbreekt' };
      const o = PLAdapter.driftOordeel(PLAdapter.sessieOordeel(), 25);
      if (!o.drift) return o.staat === 'ok' ? o.detail : o;
      const echt = (typeof connected !== 'undefined' && connected) && !(typeof demoMode !== 'undefined' && demoMode);
      if (!echt) return { staat: 'FOUT', detail: o.detail + ' — niet meer verbonden, dus niet na te gaan welke reset helpt' };
      const wacht = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      const meet = async function (cmd) {
        const ms = [];
        await withBus('proef #302', async function () {
          for (let i = 0; i < 15; i++) { const t = _nu(); await sendCmd(cmd || '010C', 1500); ms.push(_nu() - t); }
        }, 8000);
        ms.sort(function (a, b) { return a - b; });
        return ms.length ? ms[ms.length >> 1] : null;
      };
      const a = await meet();
      // Hetzelfde verzoek met antwoordcijfer: het verschil is de wachttijd die
      // de adapter na het laatste antwoord uitzit (ATAT1). Is dat het grootste
      // deel, dan is dit de drift die PLAntwoordtal wegneemt (28-09-2026).
      const aMet = await meet('010C1');
      const wachttijd = (a && aMet) ? a - aMet : null;
      if (typeof initELM327 !== 'function') return { staat: 'FOUT', detail: o.detail + ' — initELM327 ontbreekt, experiment niet uitgevoerd' };
      await initELM327({ herstelProtocol: true });
      await wacht(3000);
      const b = await meet();
      let c = null;
      if (a && b && b > a / 1.3) {
        await PLAdapter.herverbind();
        // herverbind() bewaarde de sweepselectie van de testrun als "jouw"
        // selectie; zet die van vóór de run terug in de hervatstand.
        try { if (T.trHerstel() && T.trHerstel().actief) localStorage.setItem('pl_selectie', JSON.stringify({ pids: T.trHerstel().actief, t: _nu() })); }
        catch (e) { console.warn('proef #302: selectie niet teruggezet in de hervatstand', e); }
        await wacht(5000);
        c = await meet();
      }
      const conclusie = !(a && b) ? 'meting mislukt'
        : b <= a / 1.3 ? 'de ELM opnieuw initialiseren (ATWS) herstelt het — het zit in de adapter, niet in de socket'
        : (c && c <= a / 1.3) ? 'ATWS helpt niet, een nieuwe verbinding wel — het zit in de Bluetooth-socket'
        : 'ook een nieuwe verbinding helpt niet — dan ligt het niet aan de adapter-toestand of de socket';
      const wt = wachttijd === null ? '' : ' · 010C1 met antwoordcijfer: ' + aMet + ' ms, dus ' + wachttijd + ' ms wachttijd na het laatste antwoord' +
        (wachttijd >= a / 2 ? ' — het grootste deel; de groepsverzoeken dragen dat cijfer nu (zie PLAntwoordtal), dus hun drift hoort weg te zijn' : '');
      return { staat: 'FOUT', detail: o.detail + ' · experiment 010C solo: ' + a + ' ms → na ATWS ' + b + ' ms' + (c !== null ? ' → na nieuwe verbinding ' + c + ' ms' : '') + ' · ' + conclusie + wt };
    }
  },

];

  return PROEVEN_B5;
};
