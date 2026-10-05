/* ══════════════════════════════════════════════════════════════════
   pidlane-help-inhoud.js — PL_HULP: de tekst van de handleiding
   ──────────────────────────────────────────────────────────────────
   Alleen data. De weergave staat in pidlane-help.js (PLHelp). Tekst
   bijwerken = alleen dit bestand aanraken.

   HOE DIT BIJ TE HOUDEN
   1. Verander je een knop, een label of een venster dat hieronder genoemd
      wordt, pas dan in dezelfde commit de tekst hier aan.
   2. Een uitroepteken (tips[]) hangt aan een echte knop via `anker` (een
      CSS-selector). `bron` zegt in welk bestand dat element staat.
      test-help.js zoekt elk anker in die bron op: hernoem of verwijder je de
      knop, dan wordt de test rood met de naam van de tip erbij.
   3. Zet `gecontroleerd` op de datum en de appversie waartegen je de tekst
      hebt nagelopen. De handleiding toont die onderaan; staat daar een oude
      versie, dan weet de lezer dat hij voorzichtig moet zijn.
   4. Afbeeldingen en video's: zet het bestand in public/handleiding/ en
      noem het in `media` van een onderwerp. test-help.js controleert dat het
      bestand bestaat.
   5. Geen prijzen in deze tekst, en nooit "anoniem" voor wat een pseudoniem
      is (CLAUDE.md, privacy). test-help.js bewaakt beide.

   OPMAAK VAN `tekst`
   Gewone HTML. Twee eigen attributen:
     <a data-hulp="verbinden">…</a>      — springt naar een ander onderwerp
     <button data-hulp-doe="bug">…</button> — opent iets in de app;
                                            zie DOE in pidlane-help.js
   ══════════════════════════════════════════════════════════════════ */
var PL_HULP = {

  gecontroleerd: { datum: '2026-10-05', app: '3.1.0' },

  groepen: [
    { id: 'start', titel: 'Beginnen' },
    { id: 'gebruik', titel: 'Gebruiken' },
    { id: 'account', titel: 'Account en gegevens' },
    { id: 'hulp', titel: 'Hulp en contact' }
  ],

  onderwerpen: [

    /* ─────────────── BEGINNEN ─────────────── */
    { id: 'wat', groep: 'start', titel: 'Wat doet PidLane?',
      tekst:
        '<p>PidLane leest je auto uit via een OBD2-adapter in de diagnosepoort: foutcodes, keuringsstatus en live metingen. ' +
        'Daarnaast kun je zonder adapter een kenteken opzoeken, een foutcode opzoeken of een dashboardlampje nakijken.</p>' +
        '<p>Nog geen adapter? Probeer alles met de demo: op het inlogscherm <b>Try demo — no adapter needed</b>, ' +
        'of in het verbindscherm <b>Simuleer verbinding</b>. In de demo wordt niets bewaard.</p>',
      zie: ['verbinden', 'zonder'] },

    { id: 'navigatie', groep: 'start', titel: 'De onderbalk',
      tekst:
        '<p>Na het inloggen (of in de demo) staat onderin een balk met vier tabs:</p>' +
        '<ul>' +
        '<li><b>Mijn auto</b> — het startscherm, met <a data-hulp="check">Check mijn auto</a> en vier tegels.</li>' +
        '<li><b>Live</b> — de metingen van de auto op dit moment. Zie <a data-hulp="live">Live</a>.</li>' +
        '<li><b>Rapporten</b> — wat PidLane heeft vastgelegd. Een getal op de tab zegt hoeveel.</li>' +
        '<li><b>Meer</b> — account, instellingen en hulp. Nog eens tikken sluit het menu. Zie <a data-hulp="meer">Meer</a>.</li>' +
        '</ul>',
      zie: ['startscherm', 'meer'] },

    { id: 'startscherm', groep: 'start', titel: 'Het startscherm',
      tekst:
        '<p>Bovenaan staat <a data-hulp="check">Check mijn auto</a>: foutcodes en keuringsstatus in ongeveer 30 seconden.</p>' +
        '<p>Daaronder, onder <b>Ik wil…</b>, vier tegels. Elke tegel opent een korte wizard voor die vraag:</p>' +
        '<ul>' +
        '<li><b>Er is iets mis</b> — een klacht, lampje of geluid.</li>' +
        '<li><b>Kopen of verkopen</b> — staat, historie en waarde.</li>' +
        '<li><b>Rit starten</b> — meekijken, zuinig rijden, caravan.</li>' +
        '<li><b>Voorbereiden</b> — winter, lange rit, onderhoud.</li>' +
        '</ul>' +
        '<p>In de <a data-hulp="garagemodus">garagemodus</a> staat er ook <b>Alle functies</b>, voor wie precies weet wat hij zoekt.</p>',
      zie: ['check', 'zonder'] },

    { id: 'zonder', groep: 'start', titel: 'Zonder adapter',
      tekst:
        '<p>Op het startscherm staat een kaart voor als je niet in de auto zit. Daarop:</p>' +
        '<ul>' +
        '<li><b>Kenteken-check</b> — APK, verzekering, NAP en terugroepacties uit het RDW.</li>' +
        '<li><b>Lampje brandt?</b> — wat een dashboardlampje betekent en of je mag doorrijden.</li>' +
        '<li><b>Foutcode opzoeken</b> — bijvoorbeeld P0301. Dit staat in de app zelf.</li>' +
        '<li><b>Simuleer verbinding</b> — alles proberen, er wordt niets bewaard.</li>' +
        '</ul>' +
        '<p>Na een kenteken-check kun je <b>Dit is mijn auto</b> kiezen. Staat er een APK-datum bij, dan verschijnt ook <b>Herinner me</b>.</p>' +
        '<p>In het verbindscherm brengt <b>Zonder adapter</b> je hier ook.</p>',
      zie: ['wat', 'verbinden'] },

    { id: 'verbinden', groep: 'start', titel: 'Verbinden met de auto',
      tekst:
        '<ol>' +
        '<li>Steek de adapter in de OBD-poort. Die zit meestal onder het dashboard aan de bestuurderskant.</li>' +
        '<li>Zet het contact aan.</li>' +
        '<li>Zet Bluetooth aan op je telefoon.</li>' +
        '<li>Tik op <b>⚡ Plug in. Let\'s go.</b> De eerste keer legt PidLane eerst uit waarvoor Bluetooth nodig is.</li>' +
        '<li>PidLane zoekt de adapter en daarna de auto. Na afloop zie je de sensoren van jouw auto.</li>' +
        '</ol>' +
        '<p>Zet je <b>Check na verbinden</b> aan (in Meer), dan opent <a data-hulp="check">Check mijn auto</a> bij de volgende verbinding één keer vanzelf; daarna staat de schakelaar weer uit. ' +
        'Vindt hij niets, dan gaat de app na 5 seconden door naar Live; tik in het venster of op <b>Blijf hier</b> om te blijven.</p>' +
        '<p>In hetzelfde scherm: <b>Simuleer verbinding</b> (demo), <b>Zonder adapter</b> en, als regel eronder, ' +
        '<b>Meekijken met een sessie</b> voor de expert die op afstand meekijkt. Zie <a data-hulp="delen">Delen en meekijken</a>.</p>',
      zie: ['verbinden-mislukt', 'status'] },

    { id: 'verbinden-mislukt', groep: 'start', titel: 'Verbinden lukt niet',
      tekst:
        '<ul>' +
        '<li>Staat Bluetooth aan? Staat het contact aan? Brandt er een lampje op de adapter?</li>' +
        '<li>Gebruikt een andere app de adapter? Sluit die eerst.</li>' +
        '<li>Trek de adapter even los, wacht tien seconden en steek hem terug.</li>' +
        '<li>Probeer opnieuw met <b>⚡ Plug in. Let\'s go.</b></li>' +
        '</ul>' +
        '<p>Lukt het nog steeds niet? <button type="button" data-hulp-doe="bug">🐞 Meld een bug</button> — ' +
        'de melding neemt je toestel, appversie en de laatste foutmeldingen van de verbinding vanzelf mee.</p>',
      zie: ['verbinden', 'contact'] },

    /* ─────────────── GEBRUIKEN ─────────────── */
    { id: 'check', groep: 'gebruik', titel: 'Check mijn auto',
      tekst:
        '<p>Leest de foutcodes en de keuringsstatus uit en zet de uitkomst in één stoplicht. Daaronder staan de codes en drie vervolgstappen:</p>' +
        '<ul>' +
        '<li><b>🔧 Oorzaak laten zoeken</b></li>' +
        '<li><b>🔩 Welk onderdeel?</b></li>' +
        '<li><b>🩺 Grondiger laten kijken</b></li>' +
        '</ul>' +
        '<p><b>💾 Bewaren</b> legt de uitlezing vast.</p>' +
        '<p><b>Foutcodes wissen</b> kan alleen als de voorwaarden kloppen: een verse uitlezing, contact aan, motor uit en de auto staat stil. ' +
        'Niet op afstand. Klopt er iets niet, dan zegt het venster wat. Bewaar de codes eerst: na wissen zijn ze weg.</p>',
      zie: ['startscherm', 'rapporten'] },

    { id: 'status', groep: 'gebruik', titel: 'De statusknop bovenin',
      tekst:
        '<p>Rechtsboven staat één knop met een gekleurde stip en de naam van de auto, of <b>Niet verbonden</b>. ' +
        'De kleur is de ernstigste van auto-dossier, adapter en AI samen.</p>' +
        '<p>Tik erop voor vier regels, elk met een korte uitleg en hoe het nu staat: <b>Auto-dossier</b> (wat PidLane over de auto weet, met het percentage), ' +
        '<b>Adapter (OBD)</b> (hoe de verbinding met de auto het doet), <b>AI-uitleg</b> (of de AI bereikbaar is) en <b>Achtergrond</b> (wat er op de achtergrond loopt). ' +
        'Een getal bij de statusknop zegt hoeveel dingen er lopen.</p>',
      zie: ['verbinden'] },

    { id: 'live', groep: 'gebruik', titel: 'Live',
      tekst:
        '<p>De tab <b>Live</b> toont de metingen van de auto op dit moment. Bovenaan kies je hoe je kijkt:</p>' +
        '<ul>' +
        '<li><b>Overzicht</b> — elke sensor als getal met een gekleurd puntje. Hoogstens vier krijgen een trendlijn: ' +
        'wat je zelf vastzet met <b>📈</b> op de tegel, en verder wat op dat moment het meest beweegt.</li>' +
        '<li><b>Slim</b> — de standaard: dashboardwaarden groot, trends alleen waar iets beweegt.</li>' +
        '<li><b>Visueel</b> — één vaste meter. Onder de snelheid staan koelwater, gaspedaal en brandstof als balkjes; ' +
        'rechtsboven de accu (bij een hybride de aandrijfaccu én de 12V-accu), rechtsonder een autootje met de vier banden. ' +
        'Met <b>Volgende</b> boven de meter wissel je tussen acht weergaven: Basis, Temperatuur (glas), Emissie (licht), Verbruik (digitaal), Motor (neon) en drie keer Telemetrie: Horizon, Offroad en G-kracht. Die laatste drie gebruiken de sensoren van je telefoon; zet de auto eerst stil op vlakke grond en tik in Sensoren bij Telemetrie op Nulstellen. ' +
        'De app onthoudt je keuze.</li>' +
        '</ul>' +
        '<p>Een dubbeltik op een tegel verbergt hem. Hij wordt wel gewoon gemeten en staat daarna in een strook om terug te halen.</p>' +
        '<p>Een automatische bevinding verberg je met het <b>✕</b> of een dubbeltik. De AI krijgt hem nog mee; terughalen doe je via <b>bekijk alles</b>.</p>' +
        '<p>Onder de meters staan <b>⏺ Opnemen</b>, <b>📡 Deel live</b> en <b>🔭 Meekijken</b>. In de garagemodus ook <b>◉ Bewaken</b>. ' +
        'Bij Visueel staan Opnemen en Bewaken er niet: daar start je de bulk-recorder en de waakronde vanuit het vak onder de meter.</p>',
      zie: ['opnemen', 'delen'] },

    { id: 'opnemen', groep: 'gebruik', titel: 'Opnemen',
      tekst:
        '<p><b>⏺ Opnemen</b> opent de recorder. Kies de sensoren, tik op <b>● Start opname</b>, rijd en laat het probleem gebeuren. ' +
        'Stop daarna de opname.</p>',
      zie: ['live', 'rapporten'] },

    { id: 'delen', groep: 'gebruik', titel: 'Delen en meekijken',
      tekst:
        '<p><b>📡 Deel live</b> laat een expert op afstand meekijken. De expert ziet je sensordata en kan zelf waarden en foutcodes opvragen — ' +
        'alleen lezen: op afstand kan er niets aan de auto veranderd worden.</p>' +
        '<ol>' +
        '<li>Tik op <b>Start delen</b>.</li>' +
        '<li>Kies hoe de expert binnenkomt: <b>Code</b> (voorlezen), <b>QR</b> (scannen), <b>Link</b> (WhatsApp of mail) of <b>Plakcode</b>. ' +
        'Alleen die manier staat dan in beeld; de app onthoudt je keuze.</li>' +
        '<li>Je ziet hoeveel experts meekijken. Klaar? Tik op <b>Stop delen</b>.</li>' +
        '</ol>' +
        '<p>Ben jij de expert? Tik op <b>🔭 Meekijken</b> en typ de code, of plak de link die je kreeg.</p>' +
        '<p>De data loopt via de beveiligde PidLane-server. De link verloopt vanzelf met de sessie.</p>',
      zie: ['live'] },

    { id: 'rapporten', groep: 'gebruik', titel: 'Rapporten',
      tekst:
        '<p>De tab <b>Rapporten</b> toont wat PidLane in deze sessie heeft vastgelegd, zoals bewaarde uitlezingen en analyses.</p>' +
        '<p>Met een klantaccount staan je rapporten en ritten ook bij je auto: <b>Meer → Mijn voertuigen</b>.</p>',
      zie: ['check', 'account'] },

    { id: 'afsluiten', groep: 'gebruik', titel: 'Rit beëindigen en afsluiten',
      tekst:
        '<p>Onderaan het menu Meer staat <b>⏏ Afsluiten</b>. Loopt er een rit, dan heet de knop <b>🏁 Rit beëindigen</b>.</p>' +
        '<p>Je kiest daarna wat er gebeurt: <b>Verbonden blijven</b>, <b>Verbinding verbreken</b> of <b>App sluiten</b>. Uitloggen zit er ook bij.</p>',
      zie: ['meer'] },

    { id: 'meer', groep: 'gebruik', titel: 'Het menu Meer',
      tekst:
        '<p><b>Account</b></p>' +
        '<ul><li><b>👤 Mijn account en tegoed</b></li><li><b>🚗 Mijn voertuigen</b></li></ul>' +
        '<p><b>Instellingen</b></p>' +
        '<ul>' +
        '<li><b>⚙️ Mijn voorkeuren</b></li>' +
        '<li><b>🔧 Garagemodus</b> — zie <a data-hulp="garagemodus">Garagemodus</a>.</li>' +
        '<li><b>🩺 Check na verbinden</b> — opent Check mijn auto bij de volgende verbinding één keer vanzelf en gaat dan weer uit. Standaard uit.</li>' +
        '<li><b>🔢 Versnellingsindicator</b></li>' +
        '<li><b>📖 Tekstgrootte</b> — S, M of L.</li>' +
        '<li><b>ⓘ Uitleg bij knoppen</b> — zet de kleine <b>i</b>-rondjes aan of uit. Standaard uit.</li>' +
        '</ul>' +
        '<p><b>Hulp</b></p>' +
        '<ul><li><b>📘 Handleiding</b> — dit scherm.</li><li><b>🐞 Meld een bug</b></li><li><b>📜 Logboek</b></li><li><b>🔒 Privacy</b></li></ul>' +
        '<p>Onderaan: <a data-hulp="afsluiten">Afsluiten</a>. Welke regels je ziet hangt af van je account.</p>',
      zie: ['uitroeptekens', 'garagemodus'] },

    { id: 'garagemodus', groep: 'gebruik', titel: 'Garagemodus',
      tekst:
        '<p>Zet de vakgereedschappen erbij, zoals <b>Alle functies</b> op het startscherm en <b>◉ Bewaken</b> bij Live. ' +
        'Hij staat standaard uit; aanzetten doe je in Meer.</p>',
      zie: ['meer'] },

    { id: 'uitroeptekens', groep: 'gebruik', titel: 'De i-rondjes',
      tekst:
        '<p>Bij sommige knoppen staat een klein glazen rondje met een <b>i</b>. Tik erop voor een korte uitleg; de knop zelf wordt dan niet ingedrukt. ' +
        'Onder de uitleg staat een link naar het onderwerp in deze handleiding.</p>' +
        '<p>Ze staan standaard uit. Aanzetten doe je met <b>Meer → ⓘ Uitleg bij knoppen</b>. Deze handleiding blijft altijd bereikbaar.</p>',
      zie: ['meer'] },

    /* ─────────────── ACCOUNT EN GEGEVENS ─────────────── */
    { id: 'account', groep: 'account', titel: 'Account en tegoed',
      tekst:
        '<p><b>Meer → 👤 Mijn account en tegoed</b> toont je tokens. Tokens zijn tegoed voor AI-analyses; uitlezen en live meten gebruiken geen tokens.</p>' +
        '<p>Heb je een activatiecode gekregen? Tik op <b>Activatiecode invullen</b>. Staat er <b>Tokens aanvragen</b>, dan opent je mailprogramma ' +
        'met je account erin. Codes worden met de hand verstuurd.</p>' +
        '<p>Een beheeraccount heeft geen tegoed.</p>',
      zie: ['privacy'] },

    { id: 'privacy', groep: 'account', titel: 'Privacy en je gegevens',
      tekst:
        '<p>Wat PidLane opslaat, waar, en wat er met je chassisnummer gebeurt, staat in het privacyscherm. ' +
        'Dat is de tekst die telt; deze handleiding herhaalt hem niet, zodat er geen twee versies uit elkaar kunnen lopen.</p>' +
        '<p><button type="button" data-hulp-doe="privacy">🔒 Open Privacy</button></p>' +
        '<p>In de demo wordt niets bewaard.</p>',
      zie: ['account'] },

    /* ─────────────── HULP EN CONTACT ─────────────── */
    { id: 'contact', groep: 'hulp', titel: 'Een bug melden of contact',
      tekst:
        '<p><button type="button" data-hulp-doe="bug">🐞 Meld een bug</button></p>' +
        '<p>Beschrijf wat er misging en, als het kan, hoe je het kunt nadoen. Wat automatisch meegaat staat bovenin het venster, zodat je het ziet vóór je verstuurt.</p>' +
        '<p>Lukt versturen niet, gebruik dan de knop <b>✉ E-mail</b> in hetzelfde venster. Je mailprogramma opent dan met je melding erin.</p>',
      zie: ['logboek'] },

    { id: 'logboek', groep: 'hulp', titel: 'Logboek',
      tekst:
        '<p><b>Meer → 📜 Logboek</b> toont wat de app deed, op tijd gesorteerd. Handig bij een bugmelding.</p>' +
        '<p><button type="button" data-hulp-doe="logboek">📜 Open Logboek</button></p>',
      zie: ['contact'] }
  ],

  /* De uitroeptekens. `anker` is een CSS-selector, `bron` het bestand
     waar dat element staat (relatief aan public/). */
  tips: [
    { id: 'check', anker: '#plCheckBtn', bron: 'index.html', onderwerp: 'check',
      tekst: 'Leest foutcodes en keuringsstatus. Wissen kan pas na een verse uitlezing, met contact aan, motor uit en de auto stil. Bewaar de codes eerst.' },
    { id: 'verbinden', anker: '#btnConnect', bron: 'index.html', onderwerp: 'verbinden',
      tekst: 'Adapter in de OBD-poort, contact aan, Bluetooth aan. Daarna zoekt PidLane zelf de adapter en de auto.' },
    { id: 'demo', anker: '#btnDemo', bron: 'index.html', onderwerp: 'wat',
      tekst: 'Gesimuleerde data, zonder adapter. In de demo wordt niets bewaard.' },
    { id: 'zonder', anker: '[data-pl="zonder"]', bron: 'index.html', onderwerp: 'zonder',
      tekst: 'Kenteken-check, lampjes en foutcodes opzoeken werken ook zonder adapter.' },
    { id: 'status', anker: '#sysChip', bron: 'index.html', onderwerp: 'status',
      tekst: 'De kleur is de ernstigste van auto-dossier, adapter en AI samen. Tik voor de vier regels met uitleg.' },
    { id: 'opnemen', anker: '#plLiveRec', bron: 'index.html', onderwerp: 'opnemen',
      tekst: 'Kies sensoren, start de opname, rijd en laat het probleem gebeuren. Stop daarna de opname.' },
    { id: 'deel', anker: '#plLiveDeel', bron: 'index.html', onderwerp: 'delen',
      tekst: 'Een expert kijkt live mee en kan waarden en foutcodes opvragen — alleen lezen. Deel de code alleen met iemand die je vertrouwt en tik op Stop delen als je klaar bent.' },
    { id: 'meekijken', anker: '#plLiveMee', bron: 'index.html', onderwerp: 'delen',
      tekst: 'Voor de expert: typ de meekijk-code of plak de link die je kreeg.' },
    { id: 'garagemodus', anker: '#kbGarageModus', bron: 'index.html', onderwerp: 'garagemodus',
      tekst: 'Zet de vakgereedschappen erbij, zoals Alle functies en Bewaken. Voor een account dat geen klant is staat hij vanzelf aan.' },
    { id: 'autocheck', anker: '#kbAutoCheck', bron: 'index.html', onderwerp: 'check',
      tekst: 'Opent Check mijn auto vanzelf na het verbinden, één keer per sessie. Niet bij hervatten, meekijken of in de demo.' },
    { id: 'afsluiten', anker: '#kbAfsluiten', bron: 'index.html', onderwerp: 'afsluiten',
      tekst: 'Loopt er een rit, dan heet dit Rit beëindigen. Daarna kies je: verbonden blijven, verbinding verbreken of de app sluiten.' }
  ],

  faq: [
    { v: 'Werkt het zonder adapter?',
      a: 'Deels. Kenteken-check, lampjes en foutcodes opzoeken werken zonder adapter. Voor uitlezen en live meten heb je een adapter nodig. De demo laat alles zien met gesimuleerde data.',
      zie: 'zonder' },
    { v: 'Verbinden lukt niet. Wat nu?',
      a: 'Controleer Bluetooth, het contact en de adapter, en sluit andere apps die de adapter gebruiken. Helpt dat niet, meld dan een bug: toestel en verbindingsfouten gaan vanzelf mee.',
      zie: 'verbinden-mislukt' },
    { v: 'Waarom kan ik foutcodes niet wissen?',
      a: 'Wissen kan alleen na een verse uitlezing, met contact aan, motor uit en de auto stil, en niet op afstand. Het venster zegt welke voorwaarde niet klopt.',
      zie: 'check' },
    { v: 'Kan een expert op afstand iets aan mijn auto veranderen?',
      a: 'Nee. Meekijken is alleen lezen: de expert ziet je data en kan waarden en foutcodes opvragen, maar niets veranderen.',
      zie: 'delen' },
    { v: 'Waar vind ik mijn rapporten?',
      a: 'In de tab Rapporten. Met een klantaccount ook in Meer → Mijn voertuigen.',
      zie: 'rapporten' },
    { v: 'Wat zijn tokens?',
      a: 'Tokens zijn tegoed voor AI-analyses. Uitlezen en live meten kosten geen tokens. Je saldo staat in Meer → Mijn account en tegoed.',
      zie: 'account' },
    { v: 'Die i-rondjes zitten in de weg.',
      a: 'Ze staan standaard uit; aan- of uitzetten doe je met Meer → Uitleg bij knoppen. De handleiding blijft bereikbaar via Meer → Handleiding.',
      zie: 'uitroeptekens' }
  ]
};
window.PL_HULP = PL_HULP;
