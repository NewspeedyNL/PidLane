/* ══════════════════════════════════════════════════════════════════
   pidlane-schoon.js — PLSchoon: schone start voor een nieuwe auto
   (29-10-2026)

   Waarom. Wie veel verschillende auto's aansluit, kreeg sensoren, profielen
   en rapporten van de vorige auto mee in de volgende: een PID-selectie, een
   VIN-profiel, het actieve voertuig in Mijn voertuigen, een diagnosegeschiedenis.
   Dit is de knop "dit is een nieuwe auto, eerste keer": alles wat het toestel
   over eerdere auto's weet gaat weg, en de app herstart zoals na een verse
   installatie — alleen ingelogd, en met dezelfde adapter en weergave.

   Twee ingangen:
   • start()    — de menuknop. Vraagt eerst, weigert tijdens een verbinding.
   • naLogin(k) — een klantaccount met de vlag Schone start (beheer → Klanten).
                  De Worker heeft dan al gewist wat er op het platform stond
                  (klantSchoneStart in worker.js); dit wist het toestel.

   BEWAARD WORDT ALLEEN WAT HIERONDER STAAT. Elke andere `pl_`-sleutel gaat
   weg, ook een die morgen pas bestaat. Dat is de goede kant om fout te
   zitten: een vergeten voorkeur kost één tik, een vergeten sensorprofiel van
   de vorige auto is precies het conflict waar deze knop voor is. Sleutels
   zonder `pl_` (ns_theme, ns_api_key, spp_address …) zijn instellingen van
   toestel en gebruiker en blijven altijd.

   Test: test-schoon.js (laadt dit bestand, niet een kopie).
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Wie er inlogt — dezelfde vier als DOORLAAT in pidlane-demo.js — plus wat
  // over de adapter, de toestemmingen en de weergave gaat. Niets over een auto.
  var BEWAAR = [
    'pl_session', 'pl_sessie', 'pl_tok', 'pl_uitloggen',
    'pl_adaptertype', 'pl_lastTransport', 'pl_autoconn', 'pl_verbind_hand',
    'pl_spp_poll', 'pl_spp_flush', 'pl_spp_aangetast',
    'pl_bt_disclosure', 'pl_tester_consent', 'pl_lampfoto_akkoord', 'pl_intro_gezien', 'pl_veldlab_uit',
    'pl_uiscale', 'pl_vis_thema', 'pl_expertweergave', 'pl_help_tips', 'pl_tip_dubbeltik',
    'pl_demobar_collapsed', 'pl_vehsec_collapsed', 'pl_ovz_dicht', 'pl_hl_vorm', 'pl_garagemodus',
    'pl_remote_config', 'pl_vl_endpoint'
  ];
  // Het tegoed hoort bij de klant en het proeftegoed mag niet teruggroeien
  // door te wissen (zie #49); het live-log is van de beheerder, niet van een auto.
  var BEWAAR_VOORVOEGSEL = ['pl_credits_', 'pl_livelog'];
  // IndexedDB: de bulk-recorder (DB_NAAM in pidlane-bulk.js).
  var IDB = ['pidlane-bulk'];

  function bewaar(k) {
    if (k.indexOf('pl_') !== 0) return true;
    if (BEWAAR.indexOf(k) >= 0) return true;
    for (var i = 0; i < BEWAAR_VOORVOEGSEL.length; i++) if (k.indexOf(BEWAAR_VOORVOEGSEL[i]) === 0) return true;
    return false;
  }

  // Eerst de namen verzamelen, dan wissen: removeItem tijdens het aflopen van
  // key(i) schuift de index en slaat dan elke tweede sleutel over.
  function opslagWissen(opslag) {
    var weg = [], k, i;
    for (i = 0; i < opslag.length; i++) { k = opslag.key(i); if (k !== null && !bewaar(k)) weg.push(k); }
    for (i = 0; i < weg.length; i++) opslag.removeItem(weg[i]);
    return weg;
  }

  function lokaalWissen() {
    var weg = [];
    try { weg = weg.concat(opslagWissen(window.localStorage)); }
    catch (e) { console.warn('PLSchoon: localStorage niet gewist', e); }
    try { weg = weg.concat(opslagWissen(window.sessionStorage)); }
    catch (e) { console.warn('PLSchoon: sessionStorage niet gewist', e); }
    return weg;
  }

  // deleteDatabase wacht op open verbindingen ("blocked"); de herstart erna
  // sluit ze, en dan gaat het wissen alsnog door. Hoogstens 2 s wachten.
  function idbWissen() {
    if (!window.indexedDB) return Promise.resolve();
    return Promise.all(IDB.map(function (naam) {
      return new Promise(function (klaar) {
        var t = setTimeout(klaar, 2000);
        try {
          var r = indexedDB.deleteDatabase(naam);
          r.onsuccess = r.onerror = r.onblocked = function (ev) {
            if (ev && ev.type !== 'success') console.warn('PLSchoon: IndexedDB ' + naam + ' — ' + ev.type);
            clearTimeout(t); klaar();
          };
        } catch (e) { console.warn('PLSchoon: IndexedDB ' + naam + ' niet gewist', e); clearTimeout(t); klaar(); }
      });
    }));
  }

  function verbonden() {
    try { return typeof connected !== 'undefined' && !!connected; }
    catch (e) { console.warn('PLSchoon: verbindingsstand onleesbaar', e); return false; }
  }

  function herstart() { try { location.reload(); } catch (e) { console.warn('PLSchoon: herstart mislukt — sluit en open de app', e); } }

  function melding(t) {
    try { if (typeof showToast === 'function') { showToast(t); return; } } catch (e) { console.warn('PLSchoon: showToast', e); }
    alert(t);
  }

  async function start() {
    if (verbonden()) { melding('Verbreek eerst de verbinding met de auto'); return false; }
    if (!confirm('Nieuwe auto — schone start?\n\n' +
      'Alles wat dit toestel over eerdere auto\'s weet gaat weg: gekozen sensoren, ' +
      'voertuigprofielen, het actieve voertuig, geschiedenis, bulk-opnames en ritten die ' +
      'nog niet verstuurd zijn.\n\nJe login, tegoed, adapter en weergave blijven. ' +
      'Mijn voertuigen in je account blijft ook. De app start daarna opnieuw.')) return false;
    var weg = lokaalWissen();
    await idbWissen();
    console.info('PLSchoon: ' + weg.length + ' sleutels gewist', weg);
    herstart();
    return true;
  }

  // Na een klantlogin met de vlag Schone start. Herstart alleen als er geen
  // akkoordscherm wacht: dat opent _neemSessie() alleen direct na het
  // inloggen, en een herstart zou het wegklikken. Het toestel is dan al leeg.
  async function naLogin(k) {
    if (!k || k.schoneStart !== true) return false;
    var weg = lokaalWissen();
    await idbWissen();
    console.info('PLSchoon: testaccount — ' + weg.length + ' sleutels gewist', weg);
    if (k.startTegoed === true && k.akkoordActueel === true) herstart();
    return true;
  }

  window.PLSchoon = { start: start, naLogin: naLogin, lokaalWissen: lokaalWissen, bewaar: bewaar, BEWAAR: BEWAAR };
})();
