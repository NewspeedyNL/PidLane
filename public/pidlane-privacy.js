/* ═══════════════════════════════════════════════════════════════════
   pidlane-privacy.js — prominente disclosure + privacyverklaring
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT

   Google Play weigert apps die Bluetooth-permissies vragen zonder een
   "prominent disclosure". De eisen uit de User Data-policy zijn hard en
   letterlijk te controleren:

     · in de app zelf, niet alleen in de storebeschrijving of op een site
     · zichtbaar tijdens normaal gebruik, NIET weggestopt in een menu
     · benoemt WELKE gegevens worden benaderd
     · benoemt HOE ze gebruikt en gedeeld worden
     · staat niet uitsluitend in een privacybeleid
     · staat NIET samen met andere mededelingen die er los van staan

   Die laatste twee bepalen de vorm hier. De disclosure is een eigen
   scherm dat alleen over Bluetooth en voertuiggegevens gaat — er staat
   geen nieuwsbrief, geen tegoed en geen algemene voorwaarden bij. Het
   akkoordscherm van pidlane-klant.js (openOnboarding) blijft bestaan en
   gaat over iets anders: het delen van geanonimiseerde meetdata. Ze zijn
   bewust NIET samengevoegd, hoe verleidelijk dat ook is.

   WAAR HET STAAT IN DE FLOW

   Vlak vóór connectSerial() zijn werk doet, dus vóór de eerste keer dat
   Android om "apparaten in de buurt" vraagt. Dat is de plek waar de
   policy hem wil hebben: de gebruiker moet weten waaróm het gevraagd
   wordt vóórdat het systeemdialoog verschijnt, niet erna.

   Eenmalig: na akkoord onthoudt localStorage dat, met versienummer. Gaat
   de tekst inhoudelijk op de schop, dan hoogt DISCLOSURE_VERSIE op en
   ziet iedereen hem opnieuw. Dat is geen pesterij maar dezelfde eis:
   toestemming hoort bij de tekst waarop hij gegeven is.

   WAT ER NIET IN STAAT

   Geen dark pattern. De weigerknop is even zichtbaar als de akkoordknop
   en doet wat hij belooft: niet verbinden, geen permissie vragen. Een
   disclosure met een verstopte weigerknop is een reden tot afwijzing, en
   los daarvan is het gewoon niet netjes.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const DISCLOSURE_VERSIE = 2;              // ophogen bij inhoudelijke wijziging
  const SLEUTEL = 'pl_bt_disclosure';
  const PRIVACY_URL = 'https://app.pidlane.nl/privacy.html';

  function gegeven() {
    try { return Number(localStorage.getItem(SLEUTEL) || 0) >= DISCLOSURE_VERSIE; }
    catch (e) { return false; }   // geen opslag = elke keer tonen, liever te vaak dan te weinig
  }
  function bewaar() {
    try { localStorage.setItem(SLEUTEL, String(DISCLOSURE_VERSIE)); } catch (e) {}
  }

  // ── De tekst ──────────────────────────────────────────────────────
  // Concreet blijven. "Wij hechten waarde aan uw privacy" zegt niets en
  // wordt door een reviewer als ontwijkend gelezen. Benoem het apparaat,
  // de gegevens, de bestemming en de bewaartermijn.
  const REGELS = [
    ['🔌', 'Verbinding met je OBD2-adapter',
      'PidLane gebruikt Bluetooth om te praten met de adapter in de OBD2-poort van je auto. ' +
      'Android noemt die permissie "apparaten in de buurt". Zonder die permissie kan de app niets uitlezen.'],
    ['📍', 'Geen locatiebepaling',
      'PidLane bepaalt of bewaart je locatie niet via Bluetooth. De scanpermissie is aangevraagd met de ' +
      'markering neverForLocation, waarmee Android het gebruik voor plaatsbepaling blokkeert.'],
    ['🚗', 'Wat er uit de auto komt',
      'Foutcodes, sensorwaarden, motorgegevens en het chassisnummer (VIN). Die gegevens gaan naar het ' +
      'scherm en, als je om een AI-analyse vraagt, naar onze server om daar een rapport van te maken.'],
    ['💾', 'Wat er bewaard wordt',
      'Metingen en logboeken staan op je eigen toestel. Vraag je een analyse aan, dan wordt de meting ' +
      'op onze server verwerkt en bewaard bij je account. Je kunt ze daar verwijderen.']
  ];

  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _regel(icoon, titel, tekst) {
    return '<div style="display:flex;gap:11px;padding:10px 0;border-bottom:1px solid var(--bd,#28324a)">' +
      '<span style="font-size:19px;flex:none;line-height:1.2">' + icoon + '</span>' +
      '<span style="min-width:0">' +
        '<span style="display:block;font-size:13px;font-weight:700;color:var(--tx,#eef2fa)">' + _esc(titel) + '</span>' +
        '<span style="display:block;font-size:11.5px;color:var(--tx2,#9aa6bd);line-height:1.55;margin-top:3px">' + _esc(tekst) + '</span>' +
      '</span></div>';
  }

  // ── Het scherm ────────────────────────────────────────────────────
  // Geeft een Promise terug: true = akkoord, false = geweigerd. De
  // aanroeper (connectSerial) stopt bij false.
  function toonDisclosure() {
    return new Promise(function (klaar) {
      let ov = document.getElementById('btDisclosureOv');
      if (ov) ov.remove();
      ov = document.createElement('div');
      ov.id = 'btDisclosureOv';
      ov.style.cssText = 'position:fixed;inset:0;z-index:10020;background:rgba(8,11,17,.975);' +
        'display:flex;align-items:center;justify-content:center;padding:16px';
      ov.innerHTML =
        '<div style="width:100%;max-width:460px;max-height:90vh;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
          'background:var(--sur,#131a27);border:1px solid var(--bd,#28324a);border-radius:14px;padding:18px">' +
          '<div style="font-size:17px;font-weight:800;color:var(--tx,#eef2fa);margin-bottom:3px">Voordat we verbinden</div>' +
          '<div style="font-size:12px;color:var(--tx2,#9aa6bd);line-height:1.5;margin-bottom:10px">' +
            'PidLane vraagt zo toegang tot Bluetooth. Dit is waarvoor.</div>' +
          REGELS.map(function (r) { return _regel(r[0], r[1], r[2]); }).join('') +
          '<div style="font-size:11px;color:var(--tx3,#5b6783);line-height:1.5;margin:11px 0 13px">' +
            'De volledige privacyverklaring staat op ' +
            '<a href="' + PRIVACY_URL + '" target="_blank" rel="noopener" style="color:var(--bl,#4d82ff)">app.pidlane.nl/privacy</a>. ' +
            'Je kunt deze uitleg later teruglezen via het menu.</div>' +
          '<button id="btDiscOk" style="width:100%;background:var(--ac,#4d82ff);color:#fff;border:0;border-radius:9px;' +
            'padding:13px;font:700 14px var(--f);cursor:pointer;margin-bottom:8px">Akkoord, verbind met mijn auto</button>' +
          '<button id="btDiscNee" style="width:100%;background:var(--sur2,#1b2333);color:var(--tx2,#9aa6bd);' +
            'border:1px solid var(--bd,#28324a);border-radius:9px;padding:12px;font:600 13px var(--f);cursor:pointer">' +
            'Nee, niet verbinden</button>' +
        '</div>';
      document.body.appendChild(ov);

      function sluit(akkoord) {
        try { ov.remove(); } catch (e) {}
        if (akkoord) bewaar();
        try { if (typeof btDiag === 'function') btDiag('BT-disclosure v' + DISCLOSURE_VERSIE + ': ' + (akkoord ? 'akkoord' : 'geweigerd'), akkoord ? 'ok' : 'warn'); } catch (e) {}
        klaar(akkoord);
      }
      ov.querySelector('#btDiscOk').onclick = function () { sluit(true); };
      ov.querySelector('#btDiscNee').onclick = function () { sluit(false); };
    });
  }

  // Poortwachter voor connectSerial. Geeft true als er verbonden mag worden.
  async function disclosureOk() {
    if (gegeven()) return true;
    return await toonDisclosure();
  }

  // ── Teruglezen via het menu ───────────────────────────────────────
  // Dit is NIET de prominente disclosure — die zit in de flow hierboven.
  // Dit is de plek waar je hem terugvindt als je hem nog eens wilt zien,
  // plus de knop om je keuze in te trekken.
  function openPrivacy() {
    let ov = document.getElementById('privacyOv');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'privacyOv';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10015;background:rgba(8,11,17,.975);' +
      'display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div style="width:100%;max-width:460px;max-height:90vh;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
        'background:var(--sur,#131a27);border:1px solid var(--bd,#28324a);border-radius:14px;padding:18px">' +
        '<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">' +
          '<div style="font-size:17px;font-weight:800;color:var(--tx,#eef2fa)">🔒 Privacy</div>' +
          '<button onclick="document.getElementById(\'privacyOv\').remove()" ' +
            'style="margin-left:auto;background:var(--sur2,#1b2333);color:var(--tx2,#9aa6bd);border:1px solid var(--bd,#28324a);' +
            'border-radius:8px;padding:6px 13px;font:600 12px var(--f);cursor:pointer">Sluiten</button>' +
        '</div>' +
        REGELS.map(function (r) { return _regel(r[0], r[1], r[2]); }).join('') +
        _regel('🗑️', 'Je gegevens verwijderen',
          'Metingen op dit toestel wis je met "Alles wissen" hieronder. Gegevens bij je account ' +
          'verwijder je via Mijn account, of door een bericht te sturen via Meld een bug.') +
        '<div style="font-size:11px;color:var(--tx3,#5b6783);line-height:1.5;margin:11px 0 13px">' +
          'Volledige verklaring: <a href="' + PRIVACY_URL + '" target="_blank" rel="noopener" ' +
          'style="color:var(--bl,#4d82ff)">app.pidlane.nl/privacy</a><br>' +
          'Toestemming Bluetooth: <span id="privStatus"></span></div>' +
        '<button onclick="PLPrivacy.trekIn()" style="width:100%;background:var(--sur2,#1b2333);color:var(--tx2,#9aa6bd);' +
          'border:1px solid var(--bd,#28324a);border-radius:9px;padding:12px;font:600 13px var(--f);cursor:pointer">' +
          'Toestemming intrekken</button>' +
      '</div>';
    document.body.appendChild(ov);
    const st = ov.querySelector('#privStatus');
    if (st) st.textContent = gegeven() ? 'gegeven (versie ' + DISCLOSURE_VERSIE + ')' : 'nog niet gegeven';
  }

  function trekIn() {
    try { localStorage.removeItem(SLEUTEL); } catch (e) {}
    try { showToast('Toestemming ingetrokken — je krijgt de uitleg opnieuw bij het verbinden'); } catch (e) {}
    const ov = document.getElementById('privacyOv');
    if (ov) ov.remove();
  }

  window.openPrivacy = openPrivacy;
  window.PLPrivacy = {
    open: openPrivacy,
    disclosureOk: disclosureOk,
    gegeven: gegeven,
    trekIn: trekIn,
    versie: DISCLOSURE_VERSIE
  };

  try { if (typeof btDiag === 'function') btDiag('pidlane-privacy.js geladen — disclosure v' + DISCLOSURE_VERSIE, 'info'); } catch (e) {}
})();
