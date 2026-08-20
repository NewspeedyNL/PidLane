/* ═══════════════════════════════════════════════════════════════════
   pidlane-start.js — het startscherm
   ───────────────────────────────────────────────────────────────────
   WAT ER MIS WAS

   Vijf genummerde stappen, altijd zichtbaar, hard geschreven op de
   OBDLink MX+. Twee problemen tegelijk:

   1. Wie de app dagelijks gebruikt leest die vijf stappen nooit meer.
      Voor hem is het ruis boven de enige knop die hij nodig heeft.
   2. Wie een ándere adapter heeft — een ELM327-kloon, een Vgate — krijgt
      instructies die niet kloppen. "Druk op de pair-knop" bestaat daar
      niet, en een ELM327 vraagt juist om een pincode die hier nergens
      genoemd wordt.

   HOE HET NU WERKT

   Het scherm kent drie toestanden, en welke je krijgt hangt af van wat
   de app over je weet:

     eerste keer     → "Welke adapter heb je?" met vier keuzes, daarna de
                       stappen die bij díé adapter horen
     al eens verbonden → compacte kaart met je adapter en één knop; de
                       instructies zitten achter "Hoe werkt het ook alweer"
     bezig met verbinden → de cascade, live

   Genummerde stappen zijn gebleven waar het écht een volgorde is: het
   koppelen van een adapter is een proces waarin de volgorde uitmaakt
   (eerst pair-knop, dán koppelen). Bij de terugkerende gebruiker is die
   volgorde geen informatie meer, en daar staan ze dus niet.

   DE CASCADE ALS VOORTGANG

   connectSerial() bouwt een keten van transports en loopt die af: SPP
   direct, BLE, SPP-scan, Web Serial, Web Bluetooth — de volgorde hangt
   af van wat de vorige keer werkte. Dat duurt soms twintig seconden en
   tot nu toe zag je in die tijd alleen een knop die "bezig" zei.

   Die keten wordt nu getoond zoals hij is. Geen verzonnen animatie: elke
   regel is een echte poging, en hij kleurt op het moment dat die poging
   werkelijk loopt. Daarmee is wachten te volgen in plaats van te raden,
   en een mislukking wijst zichzelf aan — je ziet wélk transport het niet
   deed. pidlane-bt.js roept PLStart.poging() en PLStart.gelukt() aan;
   die aanroepen staan expliciet in de cascade en zijn geen wrapper.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const START_VERSIE = '1.0 (20-08-2026)';

  // ── ADAPTERPROFIELEN ──────────────────────────────────────────────
  // De stappen verschillen echt per adapter, en dat is de reden dat dit
  // bestand bestaat. Wat hieronder staat is niet cosmetisch: een MX+ heeft
  // een pair-knop en geen pincode, een ELM327-kloon heeft geen knop en wél
  // een pincode, en een BLE-adapter wil je juist NIET koppelen in de
  // Android-instellingen — daar wordt hij onzichtbaar van voor de app.
  const ADAPTERS = {
    mxplus: {
      naam: 'OBDLink MX+',
      kort: 'MX+',
      merk: 'OBDLink MX+ of LX',
      transport: 'Bluetooth Classic',
      // Stuurt de vololgorde van de verbindingsketen; zie adapterTransport().
      kanaal: 'classic',
      stappen: [
        'Steek de adapter in de OBD-poort — meestal onder het dashboard, links',
        'Zet het contact aan; de adapter start vanzelf op',
        'Druk op de pair-knop op de adapter — de LED gaat knipperen',
        'Koppel hem in de Bluetooth-instellingen van Android (eenmalig, geen pincode)',
        'Terug naar PidLane en verbinden'
      ],
      tip: 'De pair-knop moet je vóór het koppelen indrukken. Doe je dat niet, dan ' +
           'verschijnt de adapter niet in de lijst van Android.'
    },
    elm327: {
      naam: 'ELM327',
      kort: 'ELM327',
      merk: 'ELM327 (v1.5 / v2.1 en klonen)',
      transport: 'Bluetooth Classic',
      kanaal: 'classic',
      stappen: [
        'Steek de adapter in de OBD-poort',
        'Zet het contact aan; er gaat een lampje branden',
        'Koppel hem in de Bluetooth-instellingen van Android (eenmalig)',
        'Vraagt hij een pincode, vul dan 1234 in — anders 0000',
        'Terug naar PidLane en verbinden'
      ],
      tip: 'Goedkope klonen verschillen onderling sterk. Lukt het verbinden niet, ' +
           'trek de adapter er dan even uit en zet het contact opnieuw aan.'
    },
    ble: {
      naam: 'BLE-adapter',
      kort: 'BLE',
      merk: 'Vgate iCar Pro, Veepeak BLE, LELink',
      transport: 'Bluetooth Low Energy',
      kanaal: 'ble',
      stappen: [
        'Steek de adapter in de OBD-poort',
        'Zet het contact aan',
        'Verbinden — PidLane zoekt hem zelf'
      ],
      tip: 'Koppel een BLE-adapter NIET in de Bluetooth-instellingen van Android. ' +
           'Staat hij daar al gekoppeld, verwijder hem dan: gekoppelde BLE-adapters ' +
           'zijn voor apps vaak onbereikbaar.'
    },
    onbekend: {
      naam: 'Weet ik niet',
      kort: 'Onbekend',
      merk: 'PidLane zoekt zelf',
      transport: 'alles achter elkaar',
      // Bewust leeg: wie het niet weet, krijgt de volledige keten.
      kanaal: '',
      stappen: [
        'Steek de adapter in de OBD-poort',
        'Zet het contact aan',
        'Staat er een pair-knop op de adapter, druk die dan in',
        'Verbinden — PidLane probeert alle manieren achter elkaar'
      ],
      tip: 'Dit werkt bijna altijd, maar duurt langer: elke manier krijgt zijn eigen ' +
           'poging. Weet je na een geslaagde verbinding welk type het was, kies dat ' +
           'dan — de volgende keer is het meteen raak.'
    }
  };

  // Een WiFi-dongle is geen adapter die het straks niet doet: hij kan
  // principieel niet werken, want deze app praat over Bluetooth. Dat hoort
  // vóór de eerste mislukte poging op het scherm te staan, niet erna.
  const WIFI_WAARSCHUWING =
    'WiFi-adapters (ELM327 WiFi) werken niet met PidLane. Die maken een eigen ' +
    'netwerk in plaats van een Bluetooth-verbinding. Je hebt een Bluetooth-adapter nodig.';

  // ── GEHEUGEN ──────────────────────────────────────────────────────
  function gekozenType() {
    try { return localStorage.getItem('pl_adaptertype') || ''; } catch (e) { return ''; }
  }
  function zetType(t) {
    try { localStorage.setItem('pl_adaptertype', t); } catch (e) {}
  }
  function aantalVerbindingen() {
    try { return Number(localStorage.getItem('pl_verbindingen') || 0); } catch (e) { return 0; }
  }
  function telVerbinding() {
    try { localStorage.setItem('pl_verbindingen', String(aantalVerbindingen() + 1)); } catch (e) {}
    try { localStorage.setItem('pl_laatsteVerbinding', String(Date.now())); } catch (e) {}
  }
  function laatsteAdapterNaam() {
    try { return localStorage.getItem('spp_name') || ''; } catch (e) { return ''; }
  }
  function geledenTekst() {
    let t = 0;
    try { t = Number(localStorage.getItem('pl_laatsteVerbinding') || 0); } catch (e) {}
    if (!t) return '';
    const min = Math.floor((Date.now() - t) / 60000);
    if (min < 2) return 'zojuist';
    if (min < 60) return min + ' minuten geleden';
    const uur = Math.floor(min / 60);
    if (uur < 24) return uur === 1 ? 'een uur geleden' : uur + ' uur geleden';
    const dag = Math.floor(uur / 24);
    if (dag === 1) return 'gisteren';
    if (dag < 7) return dag + ' dagen geleden';
    return 'langer geleden';
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── DE DRIE TOESTANDEN ────────────────────────────────────────────
  const VAK = document.createElement('div');   // vervangt .msteps
  VAK.id = 'startVak';

  function tekenKiezer() {
    const keys = ['mxplus', 'elm327', 'ble', 'onbekend'];
    VAK.innerHTML =
      '<div style="padding:0 20px 4px">' +
        '<div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:3px">Welke adapter heb je?</div>' +
        '<div style="font-size:11.5px;color:var(--tx3);line-height:1.5;margin-bottom:10px">' +
          'De stappen verschillen per type. Kies er een, dan krijg je alleen wat voor jou geldt.</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">' +
          keys.map(function (k) {
            const a = ADAPTERS[k];
            return '<button onclick="PLStart.kies(\'' + k + '\')" ' +
              'style="text-align:left;background:var(--sur2);border:1px solid var(--bd);border-radius:10px;' +
              'padding:10px 11px;cursor:pointer;font-family:var(--f)">' +
              '<span style="display:block;font-size:13px;font-weight:700;color:var(--tx)">' + _esc(a.naam) + '</span>' +
              '<span style="display:block;font-size:10.5px;color:var(--tx3);line-height:1.4;margin-top:2px">' + _esc(a.merk) + '</span>' +
              '</button>';
          }).join('') +
        '</div>' +
        '<div style="font-size:10.5px;color:var(--tx3);line-height:1.5;margin-top:9px;padding-left:2px">' +
          '⚠ ' + _esc(WIFI_WAARSCHUWING) + '</div>' +
      '</div>';
  }

  function tekenStappen(type) {
    const a = ADAPTERS[type] || ADAPTERS.onbekend;
    VAK.innerHTML =
      '<div style="padding:0 20px 4px">' +
        '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">' +
          '<span style="font-size:13px;font-weight:700;color:var(--tx)">' + _esc(a.naam) + '</span>' +
          '<span style="font-size:10.5px;color:var(--tx3)">' + _esc(a.transport) + '</span>' +
          '<button onclick="PLStart.terugNaarKiezer()" style="margin-left:auto;background:none;border:none;' +
            'color:var(--bl);font:600 11px var(--f);cursor:pointer;padding:2px 0">Ander type</button>' +
        '</div>' +
        // Genummerd, want hier is de volgorde echte informatie: de pair-knop
        // moet vóór het koppelen, niet erna.
        '<ol style="margin:0;padding:0 0 0 4px;list-style:none">' +
          a.stappen.map(function (s, i) {
            return '<li style="display:flex;gap:9px;align-items:flex-start;padding:6px 0;' +
              'border-bottom:1px solid var(--bd);font-size:12.5px;color:var(--tx2);line-height:1.45">' +
              '<span style="flex:none;width:19px;height:19px;border-radius:6px;background:var(--bl);color:#fff;' +
                'font:700 11px var(--f);display:flex;align-items:center;justify-content:center;margin-top:1px">' +
                (i + 1) + '</span>' +
              '<span style="min-width:0">' + _esc(s) + '</span></li>';
          }).join('') +
        '</ol>' +
        '<div style="font-size:11px;color:var(--tx3);line-height:1.55;margin-top:8px;padding:8px 10px;' +
          'background:var(--sur2);border-radius:8px;border:1px solid var(--bd)">' + _esc(a.tip) + '</div>' +
      '</div>';
  }

  function tekenBekend() {
    const type = gekozenType() || 'onbekend';
    const a = ADAPTERS[type] || ADAPTERS.onbekend;
    const naam = laatsteAdapterNaam() || a.naam;
    const wanneer = geledenTekst();
    VAK.innerHTML =
      '<div style="padding:0 20px 4px">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:11px 12px;background:var(--sur2);' +
          'border:1px solid var(--bd);border-radius:10px">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:var(--gn);flex:none"></span>' +
          '<span style="min-width:0">' +
            '<span style="display:block;font-size:13px;font-weight:700;color:var(--tx)">' + _esc(naam) + '</span>' +
            '<span style="display:block;font-size:10.5px;color:var(--tx3);margin-top:1px">' +
              (wanneer ? 'laatst verbonden ' + _esc(wanneer) : _esc(a.transport)) + '</span>' +
          '</span>' +
        '</div>' +
        '<div style="display:flex;gap:14px;margin-top:8px;padding-left:2px">' +
          '<button onclick="PLStart.terugNaarKiezer()" style="background:none;border:none;color:var(--bl);' +
            'font:600 11.5px var(--f);cursor:pointer;padding:0">Andere adapter</button>' +
          '<button onclick="PLStart.toonHulp()" style="background:none;border:none;color:var(--tx3);' +
            'font:600 11.5px var(--f);cursor:pointer;padding:0">Hoe werkt het ook alweer</button>' +
        '</div>' +
      '</div>';
  }

  // ── DE CASCADE, LIVE ──────────────────────────────────────────────
  // Elke regel is een echte poging uit connectSerial(). Ze verschijnen
  // terwijl ze gebeuren, want de keten wordt pas tijdens het verbinden
  // samengesteld: welke transports erin zitten en in welke volgorde hangt
  // af van wat de vorige keer werkte.
  let _pogingen = [];
  const _rustig = (function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  })();

  function tekenCascade() {
    const rij = function (p) {
      const kleur = p.staat === 'bezig' ? 'var(--bl)' : p.staat === 'ok' ? 'var(--gn)' : p.staat === 'fout' ? 'var(--rd)' : 'var(--tx3)';
      const teken = p.staat === 'bezig' ? '•' : p.staat === 'ok' ? '✓' : p.staat === 'fout' ? '✕' : '·';
      const puls = (p.staat === 'bezig' && !_rustig) ? ';animation:plStartPuls 1.1s ease-in-out infinite' : '';
      return '<div style="display:flex;gap:9px;align-items:baseline;padding:5px 0;font-size:12.5px;color:' + kleur + puls + '">' +
        '<span style="flex:none;width:13px;text-align:center;font-weight:700">' + teken + '</span>' +
        '<span style="min-width:0">' + _esc(p.label) +
          (p.detail ? '<span style="display:block;font-size:10.5px;color:var(--tx3);margin-top:1px">' + _esc(p.detail) + '</span>' : '') +
        '</span></div>';
    };
    VAK.innerHTML =
      '<div style="padding:0 20px 4px">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;' +
          'color:var(--tx3);margin-bottom:5px">Verbinding zoeken</div>' +
        _pogingen.map(rij).join('') +
        '<div style="font-size:10.5px;color:var(--tx3);line-height:1.5;margin-top:7px">' +
          'PidLane probeert de manieren achter elkaar. Dit kan tot een halve minuut duren.</div>' +
      '</div>';
  }

  // Aangeroepen vanuit de cascade in pidlane-bt.js.
  function poging(label, ronde) {
    // Vorige poging afsluiten: die is gepasseerd zonder verbinding.
    for (const p of _pogingen) if (p.staat === 'bezig') p.staat = 'fout';
    _pogingen.push({
      label: String(label || 'onbekend'),
      detail: ronde > 1 ? 'tweede ronde' : '',
      staat: 'bezig'
    });
    tekenCascade();
  }
  function gelukt(label) {
    for (const p of _pogingen) if (p.staat === 'bezig') { p.staat = 'ok'; p.detail = 'verbonden'; }
    telVerbinding();
    tekenCascade();
  }
  function mislukt() {
    for (const p of _pogingen) if (p.staat === 'bezig') p.staat = 'fout';
    tekenCascade();
  }
  function begin() {
    _pogingen = [];
    tekenCascade();
  }

  // ── HULPSCHERM ────────────────────────────────────────────────────
  function toonHulp() {
    const type = gekozenType() || 'onbekend';
    const a = ADAPTERS[type] || ADAPTERS.onbekend;
    let ov = document.getElementById('startHulpOv');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'startHulpOv';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(8,11,17,.97);' +
      'display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div style="width:100%;max-width:420px;max-height:88vh;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
        'background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:17px">' +
        '<div style="display:flex;align-items:center;gap:9px;margin-bottom:11px">' +
          '<span style="font-size:15px;font-weight:800;color:var(--tx)">' + _esc(a.naam) + '</span>' +
          '<button onclick="document.getElementById(\'startHulpOv\').remove()" style="margin-left:auto;' +
            'background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;' +
            'padding:6px 13px;font:600 12px var(--f);cursor:pointer">Sluiten</button>' +
        '</div>' +
        '<ol style="margin:0 0 11px;padding-left:20px">' +
          a.stappen.map(function (s) {
            return '<li style="font-size:12.5px;color:var(--tx2);line-height:1.5;margin-bottom:6px">' + _esc(s) + '</li>';
          }).join('') +
        '</ol>' +
        '<div style="font-size:11.5px;color:var(--tx3);line-height:1.55;padding:9px 11px;background:var(--sur2);' +
          'border-radius:8px;border:1px solid var(--bd);margin-bottom:9px">' + _esc(a.tip) + '</div>' +
        '<div style="font-size:11px;color:var(--tx3);line-height:1.55">⚠ ' + _esc(WIFI_WAARSCHUWING) + '</div>' +
      '</div>';
    document.body.appendChild(ov);
  }

  // ── STUREN ────────────────────────────────────────────────────────
  // Welk kanaal hoort bij het gekozen adaptertype? connectSerial() gebruikt dit
  // om de keten te ordenen.
  //
  // Waarom dit bestaat: op 20-08 kostte een verbinding met de OBDLink MX+
  // 44 seconden, waarvan 18 aan een BLE-scan die op een Classic-adapter nooit
  // kan slagen. De keten kende wel pl_lastTransport, maar dat staat er pas ná
  // een geslaagde verbinding — precies niet de eerste keer, wanneer wachten
  // het meest kost en de gebruiker het minst vertrouwen heeft.
  //
  // Het adaptertype is er wél al: dat is het eerste wat het startscherm vraagt.
  // Geen gok, maar wat de gebruiker zelf heeft aangeklikt.
  function adapterTransport() {
    const a = ADAPTERS[gekozenType()];
    return (a && a.kanaal) || '';
  }

  function kies(type) {
    zetType(type);
    tekenStappen(type);
  }
  function terugNaarKiezer() { tekenKiezer(); }

  function ververs() {
    if (aantalVerbindingen() > 0 && gekozenType()) tekenBekend();
    else if (gekozenType()) tekenStappen(gekozenType());
    else tekenKiezer();
  }

  // ── INHAKEN IN HET BESTAANDE SCHERM ───────────────────────────────
  function plaats() {
    const oud = document.querySelector('#step1 .msteps');
    if (!oud) return false;
    oud.parentNode.replaceChild(VAK, oud);
    ververs();
    return true;
  }

  function init() {
    if (!plaats()) return;
    if (!document.getElementById('plStartCss')) {
      const st = document.createElement('style');
      st.id = 'plStartCss';
      st.textContent = '@keyframes plStartPuls{0%,100%{opacity:1}50%{opacity:.45}}';
      document.head.appendChild(st);
    }
    try { if (typeof btDiag === 'function') btDiag('pidlane-start.js geladen — ' + START_VERSIE, 'info'); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.PLStart = {
    kies: kies,
    terugNaarKiezer: terugNaarKiezer,
    toonHulp: toonHulp,
    adapterTransport: adapterTransport,
    ververs: ververs,
    begin: begin,
    poging: poging,
    gelukt: gelukt,
    mislukt: mislukt,
    adapters: ADAPTERS,
    versie: START_VERSIE
  };
})();
