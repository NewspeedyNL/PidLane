// ══════════════════════════════════════════════════════════════════
// pidlane-bedrading.js
// DE BEDRADINGSCONTROLE — bestaat alles wat de modules van elkaar verwachten?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Op 15-08-2026 bleek `purgeImplausiblePids()` op twee plekken aangeroepen te
// worden terwijl die functie sinds ronde 5b niet meer bestond. Beide aanroepen
// stonden in een lege catch (try zonder inhoud erna), dus de ReferenceError verdween geruisloos en
// het opschonen van de PID-lijst gebeurde maandenlang niet — terwijl PIDLANE.md
// die ronde als afgerond had staan en `test-herijking.js` groen was (die test
// riep de functies zélf aan, dus de ontbrekende bedrading zag hij niet).
// Hetzelfde gold voor `rebuildPidDefsCache()`, dat nooit heeft bestaan.
//
// Er staan ~626 stille catch-blokken in dit project. Elk daarvan kan een
// hernoemde of verwijderde functie onzichtbaar maken. Deze module is de
// tegenkracht, en bewust het simpelste dat werkt: één lijst met namen die
// modules van elkaar verwachten, en één controle of ze er zijn.
//
// WAAROM GEEN STATISCHE ANALYSE
// Een parser die uit deze codebase alle aanroepen haalt, moet door
// HTML-in-template-literals met apostrofs en geneste `${}` heen. Dat is een
// eigen project met eigen bugs — precies het soort omweg dat hier al te vaak
// genomen is. Een lijst van 68 namen is saai en werkt.
//
// ONDERHOUD
// Zet een nieuwe naam in KRITIEK zodra je ergens `typeof X==='function'` of een
// try-catch om een aanroep van eigen code schrijft. `test-bedrading.js` bewaakt
// dat: hij faalt als er in de bron een guard staat voor een naam die niet in
// deze lijst voorkomt, én als een naam uit deze lijst nergens gedefinieerd is.
//
// Deze module hoort ALS LAATSTE geladen te worden — hij controleert de rest.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';
// Namen die modules van elkaar verwachten. Afgeleid uit élke plek waar de code
// `typeof X === 'function'` doet: dat zijn precies de aanroepen die stil falen.
var KRITIEK = [
  '_niceReportName','_noteMap','_recStats',
  'appBack','btDiag','buildDiscoveredPIDList',
  'clearDTC','clearSLAutoHide','closeCaravanDash','closeKebab','closeLades','closeRitAnalyse',
  'demo','detectEngineType','disconnectWebSerial','doLogin','download','dtcInfo',
  'ensurePIDListActive','ensurePIDsActive',
  'featOn','finishLogin','fv',
  'getPidDef','getVehicle','goHome',
  'ecuSteunt','hasTesterConsent','healthUitProfiel',
  // De twee helften van #78 (02-09-2026). plHealthHerzien() laat een negatief
  // gezondheidsoordeel vervallen zodra er alsnog een geldige meting binnenkomt;
  // assessPidQuality() is de meetlat waarmee die beslissing valt. (Geen
  // aanhalingstekens in dit blok: de scanner leest elke quoted string hier als
  // een naam uit de lijst.)
  // Ontbreekt de eerste, dan blijft een sensor die één keer te traag was een
  // sessie lang uitgegrijsd — en gaat dat oordeel mee het voertuigprofiel in.
  // Ontbreekt de tweede, dan herziet de eerste niets meer en is dat van buiten
  // niet te zien: precies de stille vorm waarvoor deze lijst bestaat.
  'assessPidQuality','plHealthHerzien',
  'initialHealthScan','isAdmin','isMode01','isPIDOkVal',
  'log','magToevoegen','measureConnSpeed','merkGroep','minimizeCaravanDash','minimizeRitAnalyse','monitorStatusTekst',
  'openCaravan','openLogboek','openRitAnalyse',
  'parsePID','pidCmd','pidGate','pidIsTekst','pidPollInterval','pidRecCSV',
  'brandstofPoort','plBevestig','plDemoZonderLogin','plHerijkTick','plLokaalLog','plVraagMeting','preAnalysisCheck','probeUitgebreid','profielHealth',
  'realScanDTC','refreshAllReadiness','relevantSupportedPIDs','renderAIText',
  // De meetketen zelf, sinds blok 5 van testrun 6.3 (02-09-2026). Blok 5 vraagt
  // parsePID, splitBatchResponse en validateAndSmooth of ze een bekend antwoord
  // goed lezen. Zonder deze regels zou zulke guard precies het stille falen
  // opleveren waar de bedradingscontrole voor bestaat.
  // LET OP: geen apostrof in dit commentaar — lijstUit() in test-bedrading.js
  // leest de namen met een quote-paar-regex en telt een losse apostrof mee.
  // De socketcontrole bij terugkomst uit de achtergrond (#18, 02-09-2026).
  // pidlane-achtergrond.js roept sppReconnectGuard achter een typeof-guard aan,
  // want die functie woont in pidlane-bt.js en dat bestand laadt eerder.
  // Verdwijnt hij, dan doet de guard niets en komt de app weer per ongeluk
  // achter een dode socket in plaats van met opzet -- zestien seconden rommel,
  // precies het geval uit het log van 23-08. Stil falen dus, en daarom hier.
  'sppReconnectGuard',
  // De lerende bytelengte (#106, 03-09-2026). Blok 5 en blok 4 vragen sinds
  // vandaag niet meer of de meting van de tabel afwijkt -- dat doet ze bij een
  // lerende laag altijd -- maar of de app de bytes goed LEEST. Dat gaat via
  // pidByteLen() achter een typeof-guard, want pidlane-testrun.js laadt later
  // dan de parser. Verdwijnt hij, dan valt die controle stil weg en meldt de
  // testrun opgewekt dat alles goed gelezen wordt zonder ooit gekeken te
  // hebben. Deze regel is toegevoegd omdat de bedradingscontrole er zelf FOUT
  // op gaf, precies zoals bij sppReconnectGuard hierboven.
  'pidByteLen',
  'selectCategoryPIDs','sendCmd','splitBatchResponse','steunbitsRuw','setLeftPanelForMode','showToast','showVtag','startPoll',
  'togglePID','tokSave',
  'uitlogBezig','uitlogVlagAan',
  'updPID','updateSLToggleIcon',
  'validateAndSmooth','vehicleFuelType','vlFullSurvey','withBus',
  // Pseudonimiseren van de VIN (pidlane-veldlab.js). logToSheets in
  // pidlane-auth.js zit achter een guard omdat auth.js eerder laadt dan
  // veldlab.js; bij de aanroep staat de functie er wel. Verdwijnt hij, dan
  // valt _plVinVoorLog terug op alleen de WMI en gaat er stil minder mee dan
  // bedoeld -- daarom hoort hij hier en niet in GEEN_GLOBALE.
  '_vlVinPseudoniem',
  // Deze twee stonden in PIDLANE.md als bedraad maar waren dat niet. Ze staan
  // hier zodat dat niet nog eens ongemerkt kan gebeuren.
  'herijkPidGate','pidToevoegen','pidOpruimen','pidOpgeruimdLijst',
  // De ene melder van selectiewijzigingen (#31). Vijf plekken in drie modules
  // roepen deze twee aan zonder guard. Verdwijnt er een, dan valt het
  // sensorkeuzescherm om in plaats van stil te zwijgen -- en stil zwijgen is
  // precies de bug die #31 beschrijft.
  'plSelectieVoor','plSelectieMeld',
  // Uitloggen na "Account verwijderen" (#41, pidlane-klant.js). Die aanroep
  // staat achter een guard omdat klant.js ook los getest wordt, maar in de app
  // hoort logout() er te zijn. Ontbreekt hij, dan blijft de gebruiker met een
  // sessie zitten op een account dat niet meer bestaat -- en dat levert een
  // rij foutmeldingen op in plaats van een nette afsluiting.
  'logout',
  'plSurveyUitkomst',
  // Schermen die de zelftest in fase 2 opent en weer sluit. Geen aanhalings-
  // tekens in dit commentaar: de test leest deze lijst met een regex.
  'openClimateCheck','closeClimateCheck',
  'openDeepDiag','closeDeepDiag','openPidRecorder','closePidRecorder',
  'openReportsOverview','closeReportsOverview','openSituatie','closeSituatie',
  'openNeonDashboard','closeNeonDashboard','closeExtraDash',
  'openAIReportSheet','closeAIReportSheet',
  'openBulkRecorder',
  'openTestrun','closeTestrun','startTestrun','stopTestrun','testrunOpslaan','testrunTekst',
  'plDiagGevallen','nativeShareFile','plOpslaan','plMaakPdf',
  'profielTegenSteunbits','saveVinProfile','actiefPollProfiel','setPollProfile',
  // Het run-paneel (pidlane-run.js) schakelt deze vijf aan en uit. Ze stonden
  // er nog niet in omdat ze tot 21-08 alleen vanuit hun eigen scherm werden
  // aangeroepen, zónder guard.
  'toggleRitMonitor','startCaravan','stopCaravan','startRitAnalyse','stopRitAnalyse',
  // Aandachtspunten bij het voertuigdossier (pidlane-voertuigdata.js), gezet
  // door initConnection als de RDW-opzoeking mislukt.
  'plVoertuigLet','plVoertuigChipBij','plVoertuigWaarschuwingen',
  // Beslist of binnenkomende VIN een ANDER voertuig is (pidlane-voertuigdata.js).
  // Twee plekken in pidlane-bt.js hangen eraan: het wel/niet resetten van de
  // bron-rangen in tryReadVIN() en van vehicleInfo zelf in updateVehicleCard().
  // Ontbreekt hij, dan vallen allebei terug op de oude "VIN gewijzigd = alles
  // weg", en dan wist het lezen van de VIN de RDW-data uit de kentekenstap.
  'plAnderVoertuig',
  // Bouwt de protocolkeuze op (pidlane-data.js): herkend protocol bovenaan, de
  // rest van PROTOCOLS eronder als handmatige optie. Ontbreekt hij, dan valt
  // scanNetworks() terug op alleen het herkende protocol en is handmatig kiezen
  // weer onbereikbaar — precies de toestand van vóór 26-08.
  'plProtocolLijst',
  // De verbindwizard: de kentekenstap vóór de protocolscan en het tekenen van
  // de protocolkeuze. Blok 5 toetst ze, en die guards horen hier genoemd.
  'toonKentekenStap','kentekenBevestig','kentekenOverslaan','kentPoortReset','renderNetworkCards',
  // Blok 5 controleert hiermee of pidlane-motortype.js geladen is (hernoemd
  // uit pidlane-scheduler.js op 21-08).
  'selectStandardSet',
  // Statistische afwijking t.o.v. de eigen historie van deze auto
  // (pidlane-pids.js). pidlane-correlatie.js rangschikt de bevindingenbalk
  // op de sigma die hier uitkomt; ontbreekt hij, dan blijven alleen de vijf
  // regelbevindingen over en verdwijnt "afwijkend voor deze auto" stil.
  'baselineBevinding',
  // Deelt een PID in bij dashboard / temperatuur / rest (pidlane-data.js).
  // renderGauges() bouwt de slimme weergave (issue #61) daarop; ontbreekt hij,
  // dan belandt álles in het vak "beweegt" en is de indeling die de modus
  // bestaansrecht geeft stil verdwenen.
  'slimGroep',
  // Kort een sensornaam af op betekenis (pidlane-neon.js). De tellerplaat
  // leent hem voor de namen onder de meters; ontbreekt hij, dan staan daar de
  // volledige namen en valt de vijfde meter weer van de rij — precies de
  // klacht uit #68, alleen dan zonder dat iemand ziet waaróm.
  'hudShortLabel',
  // Zet een epoch-moment om naar de kloktijd van het scherm
  // (pidlane-uihelpers.js). De bulk-recorder bouwt zijn sessie-id ermee en
  // blok 5 toetst dat id ertegen. Ontbreekt hij, dan valt de recorder terug op
  // een naam met UTC erin terwijl het logboek ernaast lokale tijd schrijft —
  // twee uur verschil, en dat is aan niets te zien tot iemand de twee
  // bestanden van dezelfde rit naast elkaar legt (#17).
  'plStempelLokaal',
  // Verbergen en tonen (pidlane-pids.js). Blok 5 toetst ze met een guard, en
  // die guard is de plek waar het stil zou blijven: ontbreken ze, dan valt de
  // app terug op het gedrag van vóór 02-09-2026 — een dubbeltik die de sensor
  // uitzet in plaats van hem te verbergen — en dat is precies het verschil dat
  // niemand ziet tot de meting mist.
  'pidVerberg','pidToon',
  // Wat blok 5 van de testrun nameet. Elk van deze namen is een gedragsproef
  // die stil zou overslaan als de module niet meekwam — en dan zegt de
  // testrun "goed" terwijl er niets gemeten is. De namen van de opleveringen
  // #60 t/m #68 staan er nog bij: hun eigen guards staan verspreid door de
  // modules, ook nu blok 5 over #74 en de begeleide rit gaat.
  'renderCorrelationBanner','bevindingenAan',     // pidlane-correlatie.js — #60
  'setPidView',                                   // pidlane-pids.js       — #61
  // Zet de live view bij het opstarten in de opgeslagen of de standaard
  // weergave (pidlane-pids.js, aangeroepen uit pidlane-theme.js). Ontbreekt
  // hij, dan start de app in wat pidViewMode toevallig is en is de
  // standaardweergave uit #68 stil verdwenen.
  'plPidViewHerstel',                             // pidlane-pids.js       — #68
  // Opent de sensorlade (pidlane-archief.js). Blok 5 gebruikt hem om te
  // toetsen dat die lade de weergavekeuze NIET meer omgooit; zonder de
  // functie zou die proef stil overslaan en zou juist de teruggekeerde
  // overschrijving onopgemerkt blijven.
  'toggleLade',                                   // pidlane-archief.js    — #68
  'plVoorAnalyse','plMeetcontextPromptLine','plMeetStabielVoorstel',  // pidlane-archief.js — #62
  
  
];
// Namen die in de bron als `typeof X==='function'` voorkomen maar géén globale
// functie zijn — met reden, want de test vraagt erom.
var GEEN_GLOBALE = {
  'onAnnuleer': 'parameter van showBusyPill(), geen globale functie',
  // Gemeld door de runtime-controle op de rit van 16-08: stond in KRITIEK maar
  // is een lokale const in pidlane-waakronde.js die window.setConn vasthoudt.
  // Les: een typeof-guard op een LOKALE naam is geen bedradingspunt. De lijst
  // is uit alle guards afgeleid, dus zulke uitzonderingen komen er soms in.
  '_oz': 'lokale const in pidlane-waakronde.js (verwijst naar window.setConn)',
  // Boven water gekomen op 21-08, toen de scanner ook op `!==` ging matchen:
  // de dode-knoppencontrole in blok 5 loopt een onclick-pad af (PLRemote.openShare
  // → window.PLRemote.openShare) en controleert onderweg of wat hij vasthoudt
  // een functie is. `obj` is die lus-variabele, geen naam die een module van een
  // andere verwacht.
  'obj': 'lokale lusvariabele in de dode-knoppencontrole (pidlane-testrun.js)'
};

function controleer(){
  var ontbreekt = [];
  for (var i=0;i<KRITIEK.length;i++){
    var n = KRITIEK[i];
    var f;
    try { f = window[n]; } catch(e){ f = undefined; }
    if (typeof f !== 'function') ontbreekt.push(n);
  }
  if (ontbreekt.length){
    var m = 'BEDRADING: ' + ontbreekt.length + ' verwachte functie(s) ontbreken — ' + ontbreekt.join(', ');
    // Beide kanalen: btDiag voor het verbindingslog, log voor het gebruikerslog,
    // console als geen van beide er is (dan is er iets veel ergers aan de hand).
    try { if (typeof btDiag==='function') btDiag(m,'err'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
    try { if (typeof log==='function') log('⚠ ' + m,'err'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
    try { console.error(m); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
  }
  return ontbreekt;
}
// Na de laatste module draaien. Een tick uitstel zodat modules die zichzelf in
// een DOMContentLoaded-haak registreren ook meegeteld zijn.
try { setTimeout(controleer, 0); } catch(e){ console.warn('setTimeout(controleer) — de bedradingscontrole zelf zou dan nooit draaien mislukt:', e); }

window.PLBedrading = { controleer: controleer, kritiek: KRITIEK, geenGlobale: GEEN_GLOBALE };
})();
