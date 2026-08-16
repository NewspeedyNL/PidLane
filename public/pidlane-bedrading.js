// ══════════════════════════════════════════════════════════════════
// pidlane-bedrading.js
// DE BEDRADINGSCONTROLE — bestaat alles wat de modules van elkaar verwachten?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Op 15-08-2026 bleek `purgeImplausiblePids()` op twee plekken aangeroepen te
// worden terwijl die functie sinds ronde 5b niet meer bestond. Beide aanroepen
// stonden in `try{ … }catch(e){}`, dus de ReferenceError verdween geruisloos en
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
  'btDiag','buildDiscoveredPIDList',
  'clearDTC','clearSLAutoHide','closeCaravanDash','closeKebab','closeLades','closeRitAnalyse',
  'demo','detectEngineType','disconnectWebSerial','download','dtcInfo',
  'ensurePIDListActive','ensurePIDsActive',
  'featOn','finishLogin','fv',
  'getPidDef','getVehicle','goHome',
  'hasTesterConsent','healthUitProfiel',
  'initialHealthScan','isAdmin','isMode01','isPIDOkVal',
  'log','measureConnSpeed','merkGroep','minimizeCaravanDash','minimizeRitAnalyse','monitorStatusTekst',
  'openCaravan','openRitAnalyse',
  'parsePID','pidCmd','pidGate','pidIsTekst','pidPollInterval','pidRecCSV',
  'plBevestig','plHerijkTick','plVraagMeting','preAnalysisCheck','probeUitgebreid','profielHealth',
  'realScanDTC','refreshAllReadiness','relevantSupportedPIDs','renderAIText',
  'selectCategoryPIDs','sendCmd','setLeftPanelForMode','showToast','showVtag','startPoll',
  'togglePID','tokSave',
  'updPID','updateSLToggleIcon',
  'vehicleFuelType','vlFullSurvey','withBus',
  // Deze twee stonden in PIDLANE.md als bedraad maar waren dat niet. Ze staan
  // hier zodat dat niet nog eens ongemerkt kan gebeuren.
  'herijkPidGate','pidToevoegen',
  // Schermen die de zelftest in fase 2 opent en weer sluit. Geen aanhalings-
  // tekens in dit commentaar: de test leest deze lijst met een regex.
  'openClimateCheck','closeClimateCheck',
  'openDeepDiag','closeDeepDiag','openPidRecorder','closePidRecorder',
  'openReportsOverview','closeReportsOverview','openSituatie','closeSituatie',
  'openNeonDashboard','closeNeonDashboard','closeExtraDash',
  'openAIReportSheet','closeAIReportSheet',
  'openBulkRecorder',
  'openTestrun','closeTestrun','startTestrun','stopTestrun','testrunOpslaan','testrunTekst',
  'plDiagGevallen','nativeShareFile','actiefPollProfiel','setPollProfile',
  
  
];
// Namen die in de bron als `typeof X==='function'` voorkomen maar géén globale
// functie zijn — met reden, want de test vraagt erom.
var GEEN_GLOBALE = {
  'onAnnuleer': 'parameter van showBusyPill(), geen globale functie',
  // Gemeld door de runtime-controle op de rit van 16-08: stond in KRITIEK maar
  // is een lokale const in pidlane-waakronde.js die window.setConn vasthoudt.
  // Les: een typeof-guard op een LOKALE naam is geen bedradingspunt. De lijst
  // is uit alle guards afgeleid, dus zulke uitzonderingen komen er soms in.
  '_oz': 'lokale const in pidlane-waakronde.js (verwijst naar window.setConn)'
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
    try { if (typeof btDiag==='function') btDiag(m,'err'); } catch(e){}
    try { if (typeof log==='function') log('⚠ ' + m,'err'); } catch(e){}
    try { console.error(m); } catch(e){}
  }
  return ontbreekt;
}
// Na de laatste module draaien. Een tick uitstel zodat modules die zichzelf in
// een DOMContentLoaded-haak registreren ook meegeteld zijn.
try { setTimeout(controleer, 0); } catch(e){}

window.PLBedrading = { controleer: controleer, kritiek: KRITIEK, geenGlobale: GEEN_GLOBALE };
})();
