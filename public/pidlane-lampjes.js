/* ═══════════════════════════════════════════════════════════════════
   pidlane-lampjes.js — PLLampjes: welk lampje brandt er, en wat nu?
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (29-09-2026)

   "Er brandt een lampje" is de meest gestelde vraag waar een OBD-app bij
   hoort — en de vraag komt op het moment dat je nog niet verbonden bent,
   vaak niet eens in de buurt van de adapter. De eerste beslissing is dan
   niet "welke foutcode" maar "mag ik doorrijden". Dit venster geeft die
   beslissing, zonder net en zonder adapter, en wijst daarna naar wat de app
   met een adapter kan meten.

   DE KLEUR IS DE BESLISSING, NIET HET PICTOGRAM
   Fabrikanten tekenen hun lampjes verschillend, maar de kleurcode is vrijwel
   overal gelijk: rood = stoppen zodra het veilig kan, oranje/geel = rustig
   door en laten nakijken, groen/blauw = informatie. Elke regel draagt
   `doorrijden` ('nee' | 'voorzichtig' | 'nadat' | 'ja'); een rood lampje is nooit 'ja'
   (test-lampjes.js). Het pictogram staat er als beschrijving bij (`vorm`),
   zodat je hem herkent zonder dat de app een plaatje van één merk toont.

   WAT DE ADAPTER ERBIJ KAN
   `obd` zegt wat de app daarna meet: 'check' (Check mijn auto: foutcodes en
   keuringsstatus), een PID voor de live meting (koelwater, accuspanning), of
   niets — de airbag en het ABS zitten in eigen regeleenheden die een gewone
   OBD-uitlezing meestal niet ziet, en dat zegt het venster dan ook.

   PUUR EN NIET PUUR. LAMPJES en zoek() zijn puur; test-lampjes.js toetst
   ze met vm. De rest raakt de DOM.

   Laadvolgorde: ná pidlane-zonder.js. Gebruikt PLNav, openLiveView en het
   verbindscherm pas bij het aanroepen.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KLEUR = {
    rood: { tekst: 'Rood — stop zodra het veilig kan', kort: 'Rood' },
    oranje: { tekst: 'Oranje — rustig door en laten nakijken', kort: 'Oranje' },
    info: { tekst: 'Groen of blauw — informatie', kort: 'Info' }
  };
  var DOOR = {
    nee: 'Niet doorrijden. Zet de auto zo snel het veilig kan stil.',
    voorzichtig: 'Voorzichtig doorrijden naar huis of een garage; niet verder dan nodig.',
    nadat: 'Doorrijden kan, zodra je het hebt opgelost (zie hieronder).',
    ja: 'Je kunt doorrijden.'
  };

  // id, naam, kleur, ico (op de tegel), vorm (hoe het pictogram eruitziet),
  // betekent, doen, doorrijden, obd, zoek (extra zoekwoorden)
  var LAMPJES = [
    { id: 'olie', naam: 'Oliedruk', kleur: 'rood', ico: '🛢️', vorm: 'een oliekannetje met een druppel',
      betekent: 'De oliedruk is te laag. De motor wordt dan niet meer goed gesmeerd.',
      doen: 'Stop zo snel het veilig kan en zet de motor uit. Controleer met de peilstok het oliepeil (auto recht, motor een paar minuten uit). Te laag: bijvullen met de olie uit het onderhoudsboekje. Gaat het lampje daarna niet uit, of was het peil goed: laat de auto wegslepen. Doorrijden kan de motor binnen minuten ruïneren.',
      doorrijden: 'nee', obd: null, zoek: 'olie oliepeil smering kannetje' },
    { id: 'koelwater', naam: 'Koelvloeistoftemperatuur', kleur: 'rood', ico: '🌡️', vorm: 'een thermometer in golvende lijnen (vloeistof)',
      betekent: 'De motor is te heet, of er is te weinig koelvloeistof.',
      doen: 'Stop zo snel het veilig kan en zet de motor uit. Open het expansievat níét terwijl de motor heet is — de vloeistof staat onder druk. Laat hem minstens een half uur afkoelen en controleer dan het peil. Lekt er iets of loopt hij opnieuw warm: niet verder rijden.',
      doorrijden: 'nee', obd: '0105', zoek: 'koelwater temperatuur oververhit heet thermometer koeling' },
    { id: 'laden', naam: 'Accu / laadstroom', kleur: 'rood', ico: '🔋', vorm: 'een accu met een plus en een min',
      betekent: 'De dynamo laadt de accu niet op. De auto rijdt dan op wat er nog in de accu zit.',
      doen: 'Zet alles uit wat stroom vraagt (ventilator, stoelverwarming, radio). Rijd zonder te stoppen naar huis of een garage: na het afzetten start hij misschien niet meer. Valt ook de stuurbekrachtiging weg of wordt de motor warm, dan kan de aandrijfriem gebroken zijn: stop dan meteen.',
      doorrijden: 'voorzichtig', obd: '0142', zoek: 'accu dynamo laden batterij stroom spanning' },
    { id: 'rem', naam: 'Remsysteem', kleur: 'rood', ico: '(!)', vorm: 'een uitroepteken in een cirkel, tussen twee haakjes',
      betekent: 'De handrem staat aan, er is te weinig remvloeistof, of het remsysteem heeft een storing.',
      doen: 'Kijk eerst of de handrem helemaal los is. Blijft het lampje branden, stop dan en controleer het remvloeistofreservoir. Te laag of een zacht rempedaal: niet verder rijden.',
      doorrijden: 'nee', obd: null, zoek: 'rem remmen handrem parkeerrem remvloeistof uitroepteken' },
    { id: 'deur', naam: 'Deur, klep of motorkap open', kleur: 'rood', ico: '🚪', vorm: 'een auto van boven met een open deur of klep',
      betekent: 'Een portier, de achterklep of de motorkap is niet goed dicht.',
      doen: 'Stop en sluit hem goed. Een motorkap die openslaat ontneemt je het zicht.',
      doorrijden: 'nadat', obd: null, zoek: 'deur portier klep kofferbak motorkap open' },
    { id: 'gordel', naam: 'Veiligheidsgordel', kleur: 'rood', ico: '🧷', vorm: 'een zittend poppetje met een gordel schuin over de borst',
      betekent: 'Iemand in de auto heeft de gordel niet om (soms ook: er ligt iets zwaars op een stoel).',
      doen: 'Gordels om. Ligt er een tas op de stoel naast je, dan kan die het lampje ook laten branden.',
      doorrijden: 'nadat', obd: null, zoek: 'gordel riem piepen' },
    { id: 'airbag', naam: 'Airbag', kleur: 'rood', ico: '💺', vorm: 'een zittend poppetje met een bal ervoor (soms de letters SRS)',
      betekent: 'Het airbagsysteem of de gordelspanners hebben een storing. Bij een ongeluk gaan ze dan mogelijk niet af.',
      doen: 'Rijden kan, maar laat het snel nakijken. Een losgeschoten stekker onder een voorstoel is een bekende oorzaak.',
      doorrijden: 'voorzichtig', obd: 'geen', zoek: 'airbag srs gordelspanner' },
    { id: 'stuur', naam: 'Stuurbekrachtiging', kleur: 'rood', ico: '🎯', vorm: 'een stuurwiel met een uitroepteken',
      betekent: 'De stuurbekrachtiging werkt niet of maar deels. Sturen wordt zwaar, vooral bij lage snelheid.',
      doen: 'Rijd rustig en houd rekening met veel meer kracht in bochten en bij parkeren. Laat het nakijken voor je verder gaat dan nodig.',
      doorrijden: 'voorzichtig', obd: null, zoek: 'stuur stuurbekrachtiging zwaar sturen eps' },

    { id: 'motor', naam: 'Motorstoring (motorlampje)', kleur: 'oranje', ico: '⚙️', vorm: 'een motorblok van opzij (soms met CHECK of de letters EPC)',
      betekent: 'Het motormanagement heeft een storing opgeslagen: van een slecht sluitende tankdop tot een ontstekingsprobleem. Brandt hij continu, dan is het niet acuut. KNIPPERT hij, dan slaat de motor over en kan onverbrande brandstof de katalysator beschadigen.',
      doen: 'Continu: rustig doorrijden en binnenkort laten uitlezen. Knippert hij: gas terug, geen hoge toerentallen, en zo snel mogelijk naar een garage. Met de adapter lees je hier zelf de foutcode uit.',
      doorrijden: 'voorzichtig', obd: 'check', zoek: 'motor motorlampje mil check engine epc storing knippert' },
    { id: 'abs', naam: 'ABS', kleur: 'oranje', ico: 'ABS', vorm: 'de letters ABS in een cirkel',
      betekent: 'Het antiblokkeersysteem werkt niet. De gewone remmen werken nog wel; bij een noodstop kunnen de wielen blokkeren.',
      doen: 'Rijd voorzichtig, houd meer afstand, vooral op nat wegdek. Laat het nakijken. Brandt tegelijk het rode remlampje: stop.',
      doorrijden: 'voorzichtig', obd: 'geen', zoek: 'abs antiblokkeer remmen blokkeren' },
    { id: 'esp', naam: 'Stabiliteitscontrole (ESP / ESC)', kleur: 'oranje', ico: '〰️', vorm: 'een auto met twee slingerende sporen erachter',
      betekent: 'Knippert hij tijdens het rijden, dan grijpt het systeem in: normaal op glad wegdek. Brandt hij continu, dan staat het uit of is er een storing.',
      doen: 'Knipperen: gas terug, rustig rijden. Continu: kijk of je hem per ongeluk hebt uitgezet (knop met hetzelfde pictogram en OFF). Anders laten nakijken.',
      doorrijden: 'voorzichtig', obd: null, zoek: 'esp esc tractie slip glad stabiliteit asr' },
    { id: 'banden', naam: 'Bandenspanning', kleur: 'oranje', ico: '(!)', vorm: 'een doorsnede van een band (hoefijzervorm) met een uitroepteken',
      betekent: 'Eén of meer banden hebben te weinig spanning.',
      doen: 'Kijk of een band zichtbaar zacht is; zo ja, niet doorrijden en wiel wisselen. Anders bij het eerstvolgende tankstation alle vier op spanning brengen (de waarden staan op een sticker in de deurstijl of de tankklep). Op sommige auto’s moet je het systeem daarna opnieuw instellen.',
      doorrijden: 'voorzichtig', obd: null, zoek: 'band banden bandenspanning tpms lek zacht' },
    { id: 'voorgloei', naam: 'Voorgloeien (diesel)', kleur: 'oranje', ico: '〽️', vorm: 'een spiraaltje (twee of drie lusjes)',
      betekent: 'Bij het starten: de gloeibougies warmen voor. Dat is normaal. Gaat hij tijdens het rijden branden of knipperen, dan heeft het motormanagement een storing.',
      doen: 'Bij het starten: wacht tot hij uitgaat en start dan. Tijdens het rijden: rustig door en laten uitlezen.',
      doorrijden: 'ja', obd: 'check', zoek: 'voorgloeien gloeibougie diesel spiraal' },
    { id: 'roetfilter', naam: 'Roetfilter (DPF)', kleur: 'oranje', ico: '▦', vorm: 'een rechthoek met puntjes erin, tussen twee buizen',
      betekent: 'Het roetfilter zit vol en heeft een rit nodig om zichzelf schoon te branden. Komt vooral voor bij veel korte ritten.',
      doen: 'Rijd, als het kan, een kwartier tot twintig minuten aaneengesloten buiten de bebouwde kom. Blijft hij branden of gaat de auto in noodloop: naar een garage.',
      doorrijden: 'ja', obd: 'check', zoek: 'roetfilter dpf fap diesel regeneratie' },
    { id: 'adblue', naam: 'AdBlue', kleur: 'oranje', ico: '💧', vorm: 'een druppel met een golfje, soms de letters AdBlue',
      betekent: 'De AdBlue-tank raakt leeg (of het systeem heeft een storing).',
      doen: 'Bijvullen, bij een tankstation of uit een can. Loopt de tank leeg, dan start de auto na het afzetten mogelijk niet meer.',
      doorrijden: 'ja', obd: null, zoek: 'adblue ureum scr diesel' },
    { id: 'automaat', naam: 'Versnellingsbak', kleur: 'oranje', ico: '⚙️', vorm: 'een tandwiel, soms met een uitroepteken of een thermometer',
      betekent: 'De (automatische) versnellingsbak heeft een storing of is te warm. Vaak schakelt hij dan in een noodstand met maar een paar versnellingen.',
      doen: 'Rijd rustig naar huis of een garage. Te warm (thermometer): stilstaan met de motor stationair tot hij uitgaat.',
      doorrijden: 'voorzichtig', obd: 'check', zoek: 'versnellingsbak automaat transmissie noodloop tandwiel' },
    { id: 'vermogen', naam: 'Vermogen beperkt (hybride / elektrisch)', kleur: 'oranje', ico: '🐢', vorm: 'een schildpad',
      betekent: 'De auto beperkt het vermogen: het accupakket is (bijna) leeg, te koud of te warm, of er is een storing.',
      doen: 'Rustig rijden, laden als dat kan. Blijft het zo met een volle accu: laten nakijken.',
      doorrijden: 'voorzichtig', obd: null, zoek: 'schildpad vermogen hybride elektrisch ev accu' },
    { id: 'brandstof', naam: 'Brandstofreserve', kleur: 'oranje', ico: '⛽', vorm: 'een benzinepomp',
      betekent: 'De tank is bijna leeg; meestal is er nog 40 tot 80 km over.',
      doen: 'Tanken. Leegrijden kan bij een diesel de brandstofpomp beschadigen.',
      doorrijden: 'ja', obd: null, zoek: 'brandstof tank tanken reserve benzine' },
    { id: 'lamp', naam: 'Verlichting defect', kleur: 'oranje', ico: '💡', vorm: 'een lampje met een uitroepteken',
      betekent: 'Een lamp van de buitenverlichting is kapot.',
      doen: 'Kijk welke lamp het is en vervang hem. Met een kapotte remlicht- of koplamp rijden levert een boete op.',
      doorrijden: 'ja', obd: null, zoek: 'lamp verlichting peer defect koplamp remlicht' },
    { id: 'ruitensproeier', naam: 'Ruitensproeiervloeistof', kleur: 'oranje', ico: '🪟', vorm: 'een voorruit met een sproeistraaltje',
      betekent: 'Het reservoir van de ruitensproeiers is bijna leeg.',
      doen: 'Bijvullen, in de winter met antivries.',
      doorrijden: 'ja', obd: null, zoek: 'ruitensproeier sproeier ruit vloeistof' },
    { id: 'onderhoud', naam: 'Onderhoud', kleur: 'oranje', ico: '🔧', vorm: 'een steeksleutel (soms met SERVICE of een getal)',
      betekent: 'Het onderhoud is aan de beurt, op tijd of op kilometers.',
      doen: 'Plan een beurt. Het lampje moet de garage daarna terugzetten.',
      doorrijden: 'ja', obd: null, zoek: 'onderhoud service beurt sleutel inspectie' },

    { id: 'koud', naam: 'Motor nog koud', kleur: 'info', ico: '🌡️', vorm: 'een blauwe thermometer',
      betekent: 'De motor is nog niet op temperatuur.',
      doen: 'Rustig rijden, geen hoge toerentallen tot hij uitgaat.',
      doorrijden: 'ja', obd: '0105', zoek: 'koud blauw thermometer koelwater' },
    { id: 'grootlicht', naam: 'Grootlicht', kleur: 'info', ico: '🔵', vorm: 'een blauwe lamp met rechte stralen',
      betekent: 'Het grootlicht staat aan.',
      doen: 'Dimmen bij tegemoetkomend verkeer of een voorligger.',
      doorrijden: 'ja', obd: null, zoek: 'grootlicht verlicht blauw' },
    { id: 'cruise', naam: 'Cruisecontrol', kleur: 'info', ico: '⏱️', vorm: 'een snelheidsmeter met een pijltje',
      betekent: 'De cruisecontrol staat aan of is ingeschakeld.',
      doen: 'Niets; het is informatie.',
      doorrijden: 'ja', obd: null, zoek: 'cruise control snelheid' },
    { id: 'mist', naam: 'Mistlicht', kleur: 'info', ico: '🌫️', vorm: 'een lamp met stralen door een golvende lijn',
      betekent: 'De mistlamp staat aan (achter is hij vaak oranje).',
      doen: 'Het mistachterlicht alleen bij zicht onder 50 meter; anders verblindt het je achterligger.',
      doorrijden: 'ja', obd: null, zoek: 'mist mistlamp mistachterlicht' }
  ];

  /* Puur. Zoekterm en kleurfilter; lege term = alles van die kleur. */
  function zoek(lijst, term, kleur) {
    var t = String(term || '').toLowerCase().trim();
    return (lijst || []).filter(function (l) {
      if (kleur && l.kleur !== kleur) return false;
      if (!t) return true;
      return (l.naam + ' ' + l.vorm + ' ' + (l.zoek || '')).toLowerCase().indexOf(t) >= 0;
    });
  }

  // ════════════════════════════════════════════════════════════════
  //  HET VENSTER
  // ════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected; } catch (e) { return false; } }

  var CSS =
    '#plLampOv{position:fixed;inset:0;z-index:9700;background:rgba(8,11,17,.88);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plLampOv .pll-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:560px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f);color:var(--tx);box-sizing:border-box}' +
    '#plLampOv .pll-kop{display:flex;align-items:center;justify-content:space-between;gap:9px;font-size:15px;font-weight:800;margin-bottom:10px}' +
    '#plLampOv .pll-x{width:32px;height:32px;border-radius:9px;border:1px solid var(--bd);background:var(--sur);color:var(--tx2);cursor:pointer}' +
    '#plLampOv input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:14px;margin-bottom:8px}' +
    '#plLampOv .pll-chips{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}' +
    '#plLampOv .pll-chip{padding:6px 11px;border-radius:999px;border:1px solid var(--bd);background:var(--sur);color:var(--tx2);font-family:var(--f);font-size:12px;font-weight:800;cursor:pointer}' +
    '#plLampOv .pll-chip.aan{background:var(--bl);border-color:var(--bl);color:#fff}' +
    '#plLampOv .pll-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}' +
    '#plLampOv .pll-tegel{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:11px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:12.5px;font-weight:700;text-align:left;cursor:pointer;min-width:0}' +
    '#plLampOv .pll-ico{flex:0 0 34px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;color:#fff;letter-spacing:-.5px}' +
    '#plLampOv .pll-ico.rood{background:var(--rd)}#plLampOv .pll-ico.oranje{background:var(--or)}#plLampOv .pll-ico.info{background:var(--bl)}' +
    '#plLampOv .pll-band{padding:10px 12px;border-radius:10px;font-size:13px;font-weight:800;margin:4px 0 10px;color:#fff}' +
    '#plLampOv .pll-band.rood{background:var(--rd)}#plLampOv .pll-band.oranje{background:var(--or)}#plLampOv .pll-band.info{background:var(--bl)}' +
    '#plLampOv .pll-blok{margin-top:10px;font-size:13px;line-height:1.55}' +
    '#plLampOv .pll-l{font-size:11px;font-weight:800;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}' +
    '#plLampOv .pll-knoppen{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}' +
    '#plLampOv .pll-kn{padding:10px 13px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:12.5px;font-weight:800;cursor:pointer}' +
    '#plLampOv .pll-kn.hoofd{background:var(--bl);border-color:var(--bl);color:#fff}' +
    '#plLampOv .pll-klein{font-size:11px;color:var(--tx3);line-height:1.5;margin-top:10px}';

  function zorgCss() {
    if (el('plLampCss')) return;
    var s = document.createElement('style'); s.id = 'plLampCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function blad(inhoud) {
    zorgCss();
    var ov = el('plLampOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plLampOv';
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = '<div class="pll-doos">' + inhoud + '</div>';
    ov.style.display = 'flex';
  }
  function sluit() { var ov = el('plLampOv'); if (ov) ov.style.display = 'none'; }
  function kop(t, terug) {
    return '<div class="pll-kop"><span>' + (terug ? '<button type="button" class="pll-x" style="margin-right:8px" aria-label="Terug" onclick="PLLampjes.open()">←</button>' : '') + t + '</span>' +
      '<button type="button" class="pll-x" aria-label="Sluiten" onclick="PLLampjes.sluit()">✕</button></div>';
  }

  var _filter = { term: '', kleur: null };
  function open() {
    blad(kop('💡 Welk lampje brandt er?') +
      '<input id="pllZoek" placeholder="Zoek: olie, motor, band, schildpad…" autocomplete="off" value="' + esc(_filter.term) + '">' +
      '<div class="pll-chips">' + [null, 'rood', 'oranje', 'info'].map(function (k) {
        return '<button type="button" class="pll-chip' + (_filter.kleur === k ? ' aan' : '') + '" data-kleur="' + (k || '') + '" onclick="PLLampjes._kleur(\'' + (k || '') + '\')">' + (k ? KLEUR[k].kort : 'Alle') + '</button>';
      }).join('') + '</div><div class="pll-grid" id="pllGrid"></div>' +
      '<div class="pll-klein">De kleur zegt het meest: rood is stoppen, oranje is laten nakijken, groen en blauw is informatie. Pictogrammen verschillen per merk; bij twijfel geldt het instructieboekje van je auto.</div>');
    var i = el('pllZoek');
    if (i) i.addEventListener('input', function () { _filter.term = i.value; rooster(); });
    rooster();
  }
  function rooster() {
    var g = el('pllGrid'); if (!g) return;
    var l = zoek(LAMPJES, _filter.term, _filter.kleur);
    g.innerHTML = l.length ? l.map(function (x) {
      return '<button type="button" class="pll-tegel" data-lamp="' + x.id + '" onclick="PLLampjes.toon(\'' + x.id + '\')"><span class="pll-ico ' + x.kleur + '">' + esc(x.ico) + '</span><span>' + esc(x.naam) + '</span></button>';
    }).join('') : '<div class="pll-klein">Niets gevonden. Probeer een ander woord, of kies een kleur.</div>';
  }
  function kleur(k) { _filter.kleur = k || null; open(); }

  function toon(id) {
    var x = LAMPJES.filter(function (l) { return l.id === id; })[0];
    if (!x) return;
    var h = kop(esc(x.naam), true) +
      '<div style="display:flex;align-items:center;gap:10px"><span class="pll-ico ' + x.kleur + '" style="display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;color:#fff;font-weight:900">' + esc(x.ico) + '</span>' +
      '<span class="pll-klein" style="margin:0">Pictogram: ' + esc(x.vorm) + '</span></div>' +
      '<div class="pll-band ' + x.kleur + '">' + esc(DOOR[x.doorrijden]) + '</div>' +
      '<div class="pll-blok"><div class="pll-l">Wat het betekent</div>' + esc(x.betekent) + '</div>' +
      '<div class="pll-blok"><div class="pll-l">Wat je doet</div>' + esc(x.doen) + '</div>';
    h += obdBlok(x);
    blad(h);
  }

  function obdBlok(x) {
    if (x.obd === 'geen') return '<div class="pll-klein">Dit systeem heeft een eigen regeleenheid. Een gewone OBD-uitlezing ziet deze storing meestal niet; een garage met merkapparatuur wel.</div>';
    if (!x.obd) return '';
    var wat = x.obd === 'check' ? 'de foutcode en de keuringsstatus uitlezen' : 'live meten (' + ({ '0105': 'koelvloeistoftemperatuur', '0142': 'spanning: met draaiende motor hoort die tussen 13,5 en 14,8 V' }[x.obd] || 'de sensor') + ')';
    var knop = isVerbonden() && !isDemo()
      ? '<button type="button" class="pll-kn hoofd" onclick="PLLampjes._meet(\'' + x.id + '\')">' + (x.obd === 'check' ? '🔍 Lees nu uit' : '📈 Meet nu') + '</button>'
      : '<button type="button" class="pll-kn hoofd" onclick="PLLampjes._verbind()">🔌 Verbind de adapter</button>';
    return '<div class="pll-blok"><div class="pll-l">Met de adapter</div>PidLane kan ' + wat + '.</div><div class="pll-knoppen">' + knop + '</div>';
  }
  function meet(id) {
    var x = LAMPJES.filter(function (l) { return l.id === id; })[0]; if (!x) return;
    sluit();
    try {
      if (x.obd === 'check') PLNav.check();
      else openLiveView();
    } catch (e) { console.warn('PLLampjes: meten opent niet', e); if (typeof showToast === 'function') showToast('Dit opent nu niet — probeer het opnieuw'); }
  }
  function verbind() {
    sluit();
    try { document.getElementById('connOv').classList.remove('hidden'); }
    catch (e) { console.warn('PLLampjes: verbindscherm opent niet', e); }
  }

  window.PLLampjes = {
    open: open,
    sluit: sluit,
    toon: toon,
    _kleur: kleur,
    _meet: meet,
    _verbind: verbind,
    // pure kern — voor test-lampjes.js
    _kern: { LAMPJES: LAMPJES, KLEUR: KLEUR, DOOR: DOOR, zoek: zoek }
  };
})();
