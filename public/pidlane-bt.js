/* pidlane-bt.js — uitgelicht uit index.html (build 2026-07-19, splitronde 2).
   Laadt als <script src> op exact de oorspronkelijke positie in de
   documentvolgorde; top-level declaraties zijn in klassieke scripts
   globaal over blokgrenzen heen, dus alle bestaande aanroepen blijven
   ongewijzigd werken. Inhoud: universele Bluetooth-laag: SPP/BLE/Web Serial/Web Bluetooth, mutex, connectie-optimalisatie. */
// ════════════════════════════════════════════════════════════════════
//  PidLane — Universele Bluetooth-verbindingslaag
//  Cascade: SPP (Classic) → BLE → Web Bluetooth.
//  Werkt op telefoons + tablets, oud + nieuw. Logt elke stap.
//  SPP-API: connect/write/read(polling 50ms)/disconnect/requestPermissions
// ════════════════════════════════════════════════════════════════════
/* 28-08-2026 — de SPP-plugin is van @e-is naar @ascentio-it gegaan. Die eerste
   is op 6.0.3 blijven staan (31-12-2024) en is nooit voorbij Capacitor 6
   gekomen; het Android-API-niveau komt uit het Capacitor-template, dus daarmee
   kon de app de Play-eis van 31-08-2026 niet halen. De fork registreert onder
   dezelfde naam BluetoothSerial en heeft dezelfde methodes en hetzelfde
   antwoordformaat ({value:"..."} bij read), dus hieronder verandert niets.
   Die naam is de koppeling: hij staat nergens in een import maar alleen hier. */
function getSPP(){ return window.Capacitor?.Plugins?.BluetoothSerial || null; }
function getBLE(){ return window.Capacitor?.Plugins?.BluetoothLe   || null; }

// ── BLE service/kanaal-definities ──────────────────────────────────
// fff0 = standaard, ffe0 = veel ELM327-klonen, e7810a71 = oudere Vgate
const BLE_SERVICE  = '0000fff0-0000-1000-8000-00805f9b34fb';
const BLE_WRITE    = '0000fff2-0000-1000-8000-00805f9b34fb';
const BLE_NOTIFY   = '0000fff1-0000-1000-8000-00805f9b34fb';
const BLE_SERVICE2 = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2';
// [service, notifyChar, writeChar] — in volgorde van waarschijnlijkheid
const BLE_CHANNELS = [
  ['0000fff0-0000-1000-8000-00805f9b34fb','0000fff1-0000-1000-8000-00805f9b34fb','0000fff2-0000-1000-8000-00805f9b34fb'],
  ['0000ffe0-0000-1000-8000-00805f9b34fb','0000ffe1-0000-1000-8000-00805f9b34fb','0000ffe1-0000-1000-8000-00805f9b34fb'],
  [BLE_SERVICE2, BLE_SERVICE2, BLE_SERVICE2],
];
const OBD_NAME_RX = /obd|elm|vgate|mx\+|icar|viecar|konnwei|vlink|obdii|obd2|eobd|scantool/i;
// Apparaten die zéker geen OBD2-adapter zijn — nooit als kandidaat scoren.
// Voorkomt dat PidLane verbindt met een Shelly-stekker, oordopjes, TV, etc.
const NON_OBD_RX = /shelly|govee|buds|airpod|watch|band|mi\s?smart|tv|cast|chromecast|speaker|soundbar|tile|tracker|printer|mouse|keyboard|fitbit|garmin|tag|beacon|lamp|bulb|hue|led|thermo|kettle|plug|socket/i;

// ── Omgevingsdump bovenaan de log (voor triage) ────────────────────
function btEnvDump(){
  const c = window.Capacitor;
  const native = !!c?.isNativePlatform?.();
  const plat   = c?.getPlatform?.() || 'web';
  const m = navigator.userAgent.match(/Android\s+([\d.]+)/);
  const androidVer = m ? m[1] : (plat === 'android' ? '?' : 'n.v.t.');
  btDiag(`Omgeving: ${plat}${native ? ' (native APK)' : ' (browser)'}`, 'proto');
  if (androidVer !== 'n.v.t.') btDiag(`Android ${androidVer}`, 'info');
  btDiag(`Transports: SPP=${!!getSPP()}  BLE=${!!getBLE()}  Web=${'bluetooth' in navigator}`, 'info');
  return { native, plat, androidVer: parseFloat(androidVer) || 0 };
}

// ════════════════════════════════════════════════════════════════════
//  ENTRY — bouwt de cascade en probeert transports ná elkaar
// ════════════════════════════════════════════════════════════════════
async function connectSerial(){
  // Prominente disclosure vóór álles. Google Play eist dat de gebruiker weet
  // waarom Bluetooth wordt gevraagd vóórdat het systeemdialoog verschijnt —
  // niet erna, en niet weggestopt in een menu. Eenmalig; PLPrivacy onthoudt
  // het akkoord per versie van de tekst.
  //
  // Faalt de module (niet geladen), dan gaan we door: een ontbrekend
  // privacyscherm mag de app niet onbruikbaar maken. Dat het ontbreekt is
  // zichtbaar in de testrun, niet hier.
  try{
    if(window.PLPrivacy && typeof PLPrivacy.disclosureOk === 'function'){
      const mag = await PLPrivacy.disclosureOk();
      if(!mag){
        try{ btDiag('Verbinden afgebroken — geen toestemming voor Bluetooth','warn'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
        return;
      }
    }
  }catch(e){ try{ btDiag('Disclosure overgeslagen: '+(e.message||e),'warn'); }catch(_){ /* stil: melding mag nooit de stroom breken */ } }

  // Desktop/Chrome: Web Bluetooth werkt alleen in een secure context.
  if(window.PIDLANE_DESKTOP && !window.isSecureContext && !/^(localhost|127\.)/.test(location.hostname)){
    showConnError('Web Bluetooth vereist een beveiligde verbinding.\nOpen PidLane via https:// (GitHub Pages) of via http://localhost.\nEen dubbelgeklikt file://-bestand kan geen Bluetooth gebruiken.');
    return;
  }
  // Zombie poll-loop van vorige sessie stoppen
  clearInterval(pollTimer);
  try{ PLBus.breek('nieuwe verbinding'); }catch(e){ window._pollBusy=false; }
  // Een poort uit de vorige sessie zou de init van déze verbinding blokkeren.
  // Bewust ná PLBus.breek(): dezelfde plek, dezelfde reden.
  try{ _elmPoortOpen('nieuwe verbinding'); window._reinitBusy=false; }
  catch(e){ console.warn('ELM-poort openen mislukt: '+(e.message||e)); }
  try{ PLBus.batchReset(); PLBus.resetStats(); }
  catch(e){ console.warn('Busstatistieken resetten mislukt: '+(e.message||e)); }
  connected = false;
  window._btGen = (window._btGen || 0) + 1;   // oude commando's ongeldig maken
  window._batchSupported = undefined;         // multi-PID opnieuw testen bij nieuwe auto
  _btQueue = Promise.resolve();               // commandowachtrij leegmaken

  // API-key uit het startscherm overnemen (ongewijzigd gedrag)
  const apiVal = document.getElementById('startApiKey').value.trim();
  if (apiVal?.startsWith('sk-ant-')){
    window.anthropicKey = apiVal;
    try { localStorage.setItem('ns_api_key', apiVal); } catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
    updateApiPill();
  }

  const btn = document.getElementById('btnConnect');
  setConnectingUI(true);   // beide knoppen "bezig" — voorkomt herhaald klikken

  const env = btEnvDump();
  const spp = getSPP(), ble = getBLE();
  const haveCfgMac = (typeof OBDLINK_ADDRESS !== 'undefined' && OBDLINK_ADDRESS);

  // Volgorde: bekend MAC → SPP-direct eerst (geen scan/locatie). Anders BLE eerst.
  // FAST LANE: is er eerder succesvol via SPP verbonden (opgeslagen adres) en
  // was SPP het laatst gebruikte transport, dan proberen we dát adres direct —
  // zonder BLE-scan (12s) en zonder SPP-discovery. Dit maakt herverbinden na
  // een app-herstart vrijwel direct: Android houdt de bond vast en een directe
  // connect op een gekoppeld adres slaagt binnen enkele seconden. Mislukt de
  // directe poging (adapter weg/andere auto), dan valt de cascade gewoon
  // terug op de normale volgorde.
  const savedAddr = (()=>{ try{ return localStorage.getItem('spp_address'); }catch(e){ return null; } })();
  const savedName = (()=>{ try{ return localStorage.getItem('spp_name'); }catch(e){ return null; } })() || 'OBDLink';
  // Wat werkte de vorige keer? Leeg bij de eerste verbinding — en dan valt de
  // keuze terug op het adaptertype dat de gebruiker in het startscherm heeft
  // aangeklikt. Zonder dat begint elke eerste verbinding met een BLE-scan van
  // 12 tot 18 seconden, ook bij een adapter die aantoonbaar Classic is.
  let lastTransport = (()=>{ try{ return localStorage.getItem('pl_lastTransport'); }catch(e){ return null; } })();
  if(!lastTransport){
    try{
      const kanaal = (window.PLStart && typeof PLStart.adapterTransport==='function') ? PLStart.adapterTransport() : '';
      if(kanaal==='classic'){ lastTransport='spp'; btDiag('Keten: Classic eerst (gekozen adaptertype)','proto'); }
      else if(kanaal==='ble'){ lastTransport='ble'; btDiag('Keten: BLE eerst (gekozen adaptertype)','proto'); }
    }catch(e){ /* stil: adaptertype nog niet gekozen, keten valt terug op de standaardvolgorde */ }
  }
  const chain = [];
  if (spp && savedAddr && lastTransport !== 'ble' && !haveCfgMac)
                          chain.push(['SPP (laatst gebruikte adapter)', async () => {
                            btDiag(`Direct herverbinden: ${savedName} (${savedAddr})`, 'info');
                            try { await doSPPConnect(spp, savedAddr, savedName); }
                            catch(e){
                              // Vlak na een app-herstart/socket-dood houdt de
                              // adapter de oude socket soms nog vast — één keer
                              // kort wachten en nogmaals direct proberen.
                              btDiag(`Directe poging mislukt (${e.message}) — 1,5s wachten, nogmaals...`, 'warn');
                              await delay(1500);
                              await doSPPConnect(spp, savedAddr, savedName);
                            }
                          }]);
  // Volgorde afhankelijk van het laatst gebruikte transport: was dat SPP,
  // dan SPP-routes vóór BLE — zo blokkeert de 12s BLE-scan een herverbinding
  // met een bekende Classic-adapter (OBDLink MX+) niet.
  const sppEntries = [];
  if (spp && haveCfgMac)  sppEntries.push(['SPP (Classic · direct MAC)', () => connectSPP(spp)]);
  if (spp && !haveCfgMac) sppEntries.push(['SPP (Classic · scan)',       () => connectSPP(spp)]);
  if (spp && lastTransport === 'spp'){
    chain.push(...sppEntries);
    if (ble) chain.push(['BLE', () => connectBLE(ble)]);
  } else {
    if (ble) chain.push(['BLE', () => connectBLE(ble)]);
    chain.push(...sppEntries);
  }
  // Desktop (Chrome): Web Serial eerst — de OBDLink MX+ verschijnt op Windows
  // als seriële Bluetooth-COM-poort en werkt daar het betrouwbaarst.
  if (('serial' in navigator) && !env.native)
                          chain.push(['Web Serial (COM-poort)',     () => connectWebSerial()]);
  if (('bluetooth' in navigator) && !env.native)
                          chain.push(['Web Bluetooth',              () => connectWebBluetooth()]);

  if (!chain.length){
    btDiag('Geen Bluetooth-transport beschikbaar', 'err');
    resetConnectBtn();
    showConnError(('bluetooth' in navigator)
      ? 'Kon geen verbinding maken.\nZet de OBDLink MX+ aan, zorg dat hij in bereik is en kies hem in de Chrome-popup.'
      : 'Web Bluetooth is niet beschikbaar in deze browser.\nGebruik Google Chrome (of Edge) op de desktop, via https.');
    return;
  }

  // Startscherm laten zien dat de keten begint. De keten is hier pas
  // samengesteld — welke transports erin zitten hangt af van wat de vorige
  // keer werkte — dus dit kan niet eerder.
  try{ if(window.PLStart) PLStart.begin(); }
  catch(e){ btDiag('Startscherm (begin) mislukt: '+(e.message||e),'warn'); }

  let lastErr = null;
  let permissionBlocked = false;
  // 2 pogingen: de eerste scan mist de adapter vaak (BLE-cache koud);
  // een automatische tweede ronde vindt 'm dan meestal wel. Dit maakt het
  // bekende "tweede keer verbinden lukt wel" onzichtbaar voor de gebruiker.
  for (let pass = 1; pass <= 2 && !connected && !permissionBlocked; pass++){
    if (pass === 2) btDiag('↻ Automatische tweede scanronde...', 'proto');
    for (const [label, fn] of chain){
      btDiag(`▶ Poging${pass>1?' (ronde '+pass+')':''}: ${label}`, 'proto');
      try{ if(window.PLStart) PLStart.poging(label, pass); }
      catch(e){ btDiag('Startscherm (poging) mislukt: '+(e.message||e),'warn'); }
      try {
        await fn();
        if (connected){
          btDiag(`✓ Verbonden via ${label}`, 'ok');
          try{ if(window.PLStart) PLStart.gelukt(label); }
          catch(e){ btDiag('Startscherm (gelukt) mislukt: '+(e.message||e),'warn'); }
          return;
        }
        btDiag(`${label}: geen verbinding — volgende transport`, 'warn');
      } catch(e){
        lastErr = e;
        btDiag(`✗ ${label}: ${e.message}`, 'err');
        // Gebruiker annuleerde de poortkiezer → stil stoppen, geen tweede
        // (lege) kiezer openen en geen foutmelding.
        if (e.__plCancel){
          btDiag('Poortkeuze geannuleerd — cascade gestopt', 'warn');
          resetConnectBtn();
          return;
        }
        // COM-poort geselecteerd maar openen mislukte → dit is de bedoelde
        // route; NIET doorvallen naar de Web Bluetooth-kiezer.
        if (e.__plTerminal){
          btDiag('COM-poort openen mislukt — cascade gestopt', 'warn');
          permissionBlocked = true;   // hergebruikt: stopt beide lussen
          break;
        }
        // Permissie permanent geweigerd → doorgaan is zinloos
        if (/denied|permission|toestemming|geweigerd/i.test(e.message || '')){
          btDiag('Permissie-blokkade gedetecteerd — cascade gestopt', 'warn');
          lastErr = new Error(
            'Bluetooth-permissie geweigerd.\n\n' +
            'Ga naar Instellingen → Apps → PidLane → Machtigingen en sta ' +
            '"Bluetooth/Apparaten in de buurt" toe. Op oudere toestellen ook "Locatie".'
          );
          permissionBlocked = true;
          break;
        }
      }
      connected = false; // tussen pogingen schoon beginnen
    }
    if (!connected && !permissionBlocked && pass === 1) await delay(800);
  }

  // Keten helemaal afgelopen zonder verbinding: de laatste poging in het
  // startscherm nog van "bezig" naar "mislukt" zetten, anders blijft daar een
  // regel staan pulseren terwijl er niets meer gebeurt.
  try{ if(window.PLStart) PLStart.mislukt(); }
  catch(e){ btDiag('Startscherm (mislukt) mislukt: '+(e.message||e),'warn'); }

  resetConnectBtn();
  showConnError((lastErr?.message || 'Geen OBD2-adapter gevonden.') +
    '\n\n💡 Open 📡 Log en kopieer de inhoud voor diagnose.');
}

function resetConnectBtn(){
  setConnectingUI(false);          // topbar #cbtn weer klikbaar
  const btn = document.getElementById('btnConnect');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = '📡 Verbinden via Bluetooth';
}

// ════════════════════════════════════════════════════════════════════
//  MODUS 1 — SPP (Bluetooth Classic, @ascentio-it/capacitor-bluetooth-serial)
//  Werkende API: connect/write/read(polling 50ms)/disconnect/requestPermissions
//  Gooit een error bij mislukken — de cascade vangt 'm op.
// ════════════════════════════════════════════════════════════════════
async function connectSPP(spp){
  btDiag('Bluetooth Classic SPP starten...', 'info');

  try { await spp.requestPermissions(); btDiag('SPP permissies OK', 'ok'); }
  catch(pe){
    // Alleen oranje (warn) bij een échte weigering; anders grijs (info).
    // Veel toestellen gooien hier een onschuldige "already granted"-achtige
    // melding die ten onrechte als waarschuwing oplichtte.
    const real = /denied|geweigerd|not granted|toestemming/i.test(pe.message || '');
    btDiag('SPP permissie: ' + pe.message, real ? 'warn' : 'info');
  }

  const cfgAddress = (typeof OBDLINK_ADDRESS !== 'undefined' && OBDLINK_ADDRESS) ? OBDLINK_ADDRESS : null;
  const cfgName    = (typeof OBDLINK_NAME    !== 'undefined' && OBDLINK_NAME)    ? OBDLINK_NAME    : 'OBDLink MX+';

  // Voorkeursroute: direct op bekend MAC (geen scan, geen locatie nodig)
  if (cfgAddress){
    btDiag(`Direct: ${cfgName} (${cfgAddress})`, 'info');
    btDiagDevice(cfgName, cfgAddress, null);
    await doSPPConnect(spp, cfgAddress, cfgName);   // gooit bij fout
    return;
  }

  // Fallback: discovery (vereist op 12+ locatie/SCAN-permissie)
  btDiag('SPP scannen...', 'info');
  let devices = [];
  try {
    const result = await spp.scan();
    devices = result?.devices || [];
    btDiag(`${devices.length} apparaten`, 'info');
    devices.forEach(d => btDiagDevice(d.name || '?', d.address || d.id || '', null));
  } catch(se){ btDiag('SPP scan: ' + se.message, 'warn'); }

  const OBD = ['obdlink','obd','elm','vgate','icar','eobd','scan','link'];
  // Bekende niet-OBD apparaten (Shelly, watches, buds...) nooit als kandidaat.
  const usable = devices.filter(d => !NON_OBD_RX.test(d.name || ''));
  // ALLEEN verbinden met iets dat op een OBD2-adapter lijkt. De oude fallback
  // "pak dan maar het eerste apparaat" verbond met Shelly's en smartwatches —
  // en de echte adapter ontbreekt vaak juist in de scan omdat de OS-verbinding
  // nog bestaat. Daarom: naam-match → opgeslagen adres → anders eerlijk falen.
  let target = usable.find(d => OBD.some(n => (d.name || '').toLowerCase().includes(n)));

  if (!target){
    try {
      const sa = localStorage.getItem('spp_address');
      const sn = localStorage.getItem('spp_name');
      if (sa){ target = { address: sa, name: sn || 'OBDLink MX+' }; btDiag('Geen OBD2-naam in scan — opgeslagen adres proberen...', 'info'); }
    } catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  }

  if (!target) throw new Error(
    'Geen SPP OBD2-adapter gevonden.\n\n• Adapter in OBD-poort?\n• Contact aan?\n• Eenmalig gekoppeld via Android Bluetooth-instellingen?'
  );

  await doSPPConnect(spp, target.address || target.id, target.name || 'OBDLink');
}

async function doSPPConnect(spp, address, name){
  btDiag(`Verbinden met ${name}...`, 'info');
  await spp.connect({ address });               // gooit bij fout
  btDiag('Verbonden ✓', 'ok');

  try { localStorage.setItem('spp_address', address); localStorage.setItem('spp_name', name); localStorage.setItem('pl_lastTransport', 'spp'); } catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }

  window._sppConn = { spp, address, name };     // read()-polling gebruikt dit in sendBT
  connected = true; demoMode = false;
  btDiag(`SPP actief: ${name}`, 'ok');
  log(`SPP verbonden: ${name}`, 'ok');
  try { logToSheets('connect', `SPP verbonden: ${name}`, { address }); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
  setConn(true);
  await initELM327();
  await scanNetworks();
}

// ════════════════════════════════════════════════════════════════════
//  MODUS 2 — BLE (capacitor-community/bluetooth-le)
//  Eén gecombineerde scan, kandidaten op RSSI-score, vroege stop.
//  Gooit een error bij mislukken — de cascade vangt 'm op.
// ════════════════════════════════════════════════════════════════════
async function connectBLE(ble){
  btDiag('BLE initialiseren...', 'info');
  try {
    // androidNeverForLocation: op 12+ geen locatie-permissie nodig
    await ble.initialize({ androidNeverForLocation: true });
  } catch(e){
    throw new Error('BLE init/permissie geweigerd: ' + (e.message || e) +
      ' — sta Bluetooth (en op oudere toestellen Locatie) toe.');
  }

  // Eén scan; kandidaten verzamelen en scoren
  const cands = new Map();
  btDiag('BLE scannen (max 12s)...', 'proto');
  let scanErr = null;
  try {
    await ble.requestLEScan({ allowDuplicates: false }, (r) => {
      const id   = r.device.deviceId;
      const name = r.device.name || '';
      const adv  = (r.uuids || r.serviceUuids || []).map(u => String(u).toLowerCase());
      const uuidHit = adv.some(u => /fff0|ffe0|e7810a71/.test(u));
      const nameHit = OBD_NAME_RX.test(name);
      btDiagDevice(name || '?', id, r.rssi);
      // Bekend NIET-OBD apparaat (Shelly/buds/watch/tv...)? Nooit kandidaat,
      // ook niet als het toevallig een fff0/ffe0-service adverteert.
      if (NON_OBD_RX.test(name)){
        btDiag(`Genegeerd (geen OBD2): ${name}`, 'info');
        return;
      }
      if (uuidHit || nameHit){
        const score = (r.rssi || -999) + (uuidHit ? 20 : 0) + (nameHit ? 10 : 0);
        const prev = cands.get(id);
        if (!prev || score > prev.score) cands.set(id, { id, name: name || id, score });
      }
    });
  } catch(e){ scanErr = e; }

  // Wachten: vroege stop bij sterk signaal, anders 12s timeout
  await new Promise(res => {
    const t0 = Date.now();
    const c  = setInterval(() => {
      const best = [...cands.values()].sort((a,b) => b.score - a.score)[0];
      if ((best && best.score > -50) || (Date.now() - t0 > 12000)){ clearInterval(c); res(); }
    }, 300);
  });
  await ble.stopLEScan().catch(() => {});

  if (scanErr && !cands.size) throw new Error('BLE scan mislukt: ' + scanErr.message);

  // Alle kandidaten op score (sterkste eerst) — we proberen er max 4,
  // want de sterkste hoeft niet de OBD2-adapter te zijn (kan een buur-BLE zijn).
  const ranked = [...cands.values()].sort((a,b) => b.score - a.score).slice(0, 4);
  if (!ranked.length) throw new Error(
    'Geen BLE OBD2-adapter gevonden.\n\n• Adapter in poort + contact aan?\n• Niet al verbonden met een ander toestel/app?'
  );
  btDiag(`${ranked.length} kandidaat(en): ${ranked.map(c=>c.name).join(', ')}`, 'info');

  let lastBleErr = null;
  for (const cand of ranked){
    btDiag(`▶ Kandidaat: ${cand.name} (score ${cand.score})`, 'proto');
    let connectedThis = false;
    try {
      await ble.connect(cand.id, () => {
        connected = false; setConn(false);
        const vt = document.getElementById('vtag'); if (vt) vt.style.display = 'none';
        btDiag('BLE verbroken', 'err');
      });
      connectedThis = true;
      btDiag(`BLE gekoppeld: ${cand.name}`, 'ok');

      // Samsung-toestellen (o.a. S22) hebben soms tijd nodig tot GATT
      // service-discovery klaar is; direct startNotifications kan NATIVE crashen.
      await delay(600);

      // Kanaal-detectie: bekende service/characteristic-combinaties, met retry
      let notifyOk = false;
      for (const [svc, notify, write] of BLE_CHANNELS){
        for (let attempt = 1; attempt <= 2 && !notifyOk; attempt++){
          try {
            await ble.startNotifications(cand.id, svc, notify, (val) => {
              btBuffer += new TextDecoder().decode(val.value);
            });
            window._bleConn = { ble, id: cand.id, svc, write };
            notifyOk = true;
            btDiag(`BLE kanaal: ${svc.slice(4,8)}`, 'proto');
          } catch(e){
            btDiag(`Kanaal ${svc.slice(4,8)} poging ${attempt} mislukt`, 'warn');
            await delay(400);
          }
        }
        if (notifyOk) break;
      }
      if (!notifyOk) throw new Error('geen communicatiekanaal');

      // ── ELM-VERIFICATIE — bewijs dat dit écht een OBD2-adapter is ──
      // Stuur ATI/ATZ en eis een ELM/OBD-achtig antwoord. Zonder dit zou
      // PidLane "verbonden" melden met een willekeurig BLE-apparaat.
      connected = true; demoMode = false; // tijdelijk, zodat sendCmd werkt
      const ok = await bleVerifyELM();
      if (!ok){
        connected = false;
        throw new Error('geen ELM327-antwoord (geen OBD2-adapter)');
      }

      // Bevestigd!
      btDiag(`✓ ELM327 bevestigd: ${cand.name}`, 'ok');
      log('BLE verbonden: ' + cand.name, 'ok');
      try { localStorage.setItem('pl_lastTransport', 'ble'); } catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
      setConn(true);
      await initELM327();
      await scanNetworks();
      return; // klaar — cascade in connectSerial stopt hier
    } catch(e){
      lastBleErr = e;
      btDiag(`✗ ${cand.name}: ${e.message} — volgende kandidaat`, 'warn');
      // Net geopende verbinding/notify netjes loslaten vóór de volgende
      try { if (window._bleConn) await ble.stopNotifications(window._bleConn.id, window._bleConn.svc, BLE_CHANNELS.find(c=>c[0]===window._bleConn.svc)?.[1]||window._bleConn.svc).catch(()=>{}); } catch(_){ /* stil: opruimen: we zijn al aan het afbreken */ }
      try { if (connectedThis) await ble.disconnect(cand.id).catch(()=>{}); } catch(_){ /* stil: opruimen: we zijn al aan het afbreken */ }
      window._bleConn = null;
      connected = false;
      await delay(300);
    }
  }

  throw new Error(
    (lastBleErr ? 'Geen werkende OBD2-adapter: ' + lastBleErr.message : 'Geen OBD2-adapter gevonden.') +
    '\n\nControleer of de adapter in de poort zit, contact aan staat, en niet met een ander toestel verbonden is.'
  );
}

// Stuurt ATI (en ATZ als fallback) en controleert of het antwoord op een
// ELM327/STN-adapter wijst. Voorkomt "verbonden" met een niet-OBD apparaat.
async function bleVerifyELM(){
  const looksElm = (s) => /ELM\s?327|OBD|STN\d|v\d\.\d/i.test(String(s||''));
  try {
    let r = await sendBT('ATI', 2500);
    btDiag(`ATI → "${(r||'').slice(0,40)}"`, 'info');
    if (looksElm(r)) return true;
    r = await sendBT('ATZ', 3000);
    btDiag(`ATZ → "${(r||'').slice(0,40)}"`, 'info');
    if (looksElm(r)) return true;
    // Laatste kans: vraag of het OBD2-protocol antwoordt
    r = await sendBT('0100', 3000);
    btDiag(`0100 → "${(r||'').slice(0,40)}"`, 'info');
    return /41\s?00/i.test(String(r||''));
  } catch(e){
    btDiag('ELM-verificatie fout: ' + e.message, 'warn');
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════
//  MODUS 2b — Web Serial (Chrome desktop, OBDLink MX+ via COM-poort)
//  De MX+ verschijnt op Windows als seriële Bluetooth-poort. Web Serial geeft
//  een poortkiezer en een stabiele stroom; de reader vult dezelfde btBuffer
//  als de andere transports, zodat sendBT/initELM327/scanNetworks meewerken.
// ════════════════════════════════════════════════════════════════════
// Globale Web Serial-staat: poort, writer, en een lopende leesbuffer die de
// dedicated reader-loop vult. _webSerialSend() leest hieruit tot de '>'-prompt.
let _wsPort=null, _wsWriter=null, _wsReader=null, _wsBuf='', _wsReadAbort=false;
let _wsConnecting=false;   // guard: voorkomt gestapelde connect-pogingen (cascade)

// Volledige, idempotente teardown van de Web Serial-poort. Zonder deze close()
// bleef de COM-poort na een verbroken sessie open staan -> de volgende connect
// gaf "The port is already open" en alleen een page-reload hielp. Veilig om
// dubbel aan te roepen; elke stap is geguard.
async function disconnectWebSerial(){
  _wsReadAbort = true;                           // stopt de reader-loop
  if (_wsReader){
    try{ await _wsReader.cancel(); }catch(e){ /* stil: opruimen: we zijn al aan het afbreken */ }
    try{ _wsReader.releaseLock(); }catch(e){ /* stil: opruimen: we zijn al aan het afbreken */ }
    _wsReader = null;
  }
  if (_wsWriter){
    try{ await _wsWriter.close(); }catch(e){ /* stil: opruimen: we zijn al aan het afbreken */ }
    try{ _wsWriter.releaseLock(); }catch(e){ /* stil: opruimen: we zijn al aan het afbreken */ }
    _wsWriter = null;
  }
  if (_wsPort){
    try{ await _wsPort.close(); }catch(e){ /* stil: opruimen: we zijn al aan het afbreken */ }       // <- dit ontbrak: poort echt sluiten
    _wsPort = null;
  }
  _wsBuf = '';
  window._webSerialWrite = null;
  window._webSerialPort = null;
}

async function connectWebSerial(){
  // Guard: een automatische tweede scanronde of dubbelklik mag geen tweede
  // open() stapelen op een poort die nog bezig is — dat voedde de cascade.
  if (_wsConnecting){ const e=new Error('Web Serial verbinden is al bezig'); e.__plCancel=true; throw e; }
  _wsConnecting = true;
  try{
  // Altijd eerst een eventuele oude poort netjes sluiten, zodat een
  // herverbinding nooit op een nog-open COM-poort stuit.
  await disconnectWebSerial();
  _wsReadAbort = false;

  log('Web Serial: poort kiezen...', 'info');
  // Poortkiezer. Annuleren (NotFoundError) mag NIET doorvallen naar de
  // Web Bluetooth-kiezer — dat gaf het "lege connect-scherm". Markeer als
  // gebruikersannulering zodat de cascade stopt.
  try{
    // Android Chrome ziet Bluetooth-adapters (SPP/RFCOMM) alleen als je het
    // service-UUID meegeeft. SPP = 00001101-...; hiermee verschijnt de MX+ in
    // de poortkiezer op de telefoon. Op desktop is dit onschadelijk: er staat
    // GEEN filter, dus gewone COM-poorten blijven zichtbaar, en oudere browsers
    // negeren deze optie gewoon.
    _wsPort = await navigator.serial.requestPort({
      allowedBluetoothServiceClassIds: ['00001101-0000-1000-8000-00805f9b34fb']
    });                                                    // Chrome-poortkiezer
  }catch(e){ e.__plCancel = true; throw e; }
  // OBDLink MX+ op Windows: standaard 115200. Bij twijfel is 38400 de bewezen
  // fallback, maar de MX+ COM-poort draait vast op 115200 (fabrikant-default).
  // Openen kan op Windows falen als de COM-poort nog bezet is (vorige sessie /
  // ander programma). Dan is de COM-poort de bedoelde route — NIET doorvallen
  // naar een lege Bluetooth-kiezer; toon een gerichte fout met opnieuw-knop.
  try{
    await _wsPort.open({ baudRate: 115200, bufferSize: 4096 });
  }catch(e){
    // Poort tóch nog open (restant van een eerdere cascade of ander programma):
    // forceer één keer sluiten en probeer opnieuw voordat we opgeven.
    if (/already open/i.test((e && e.message) || '')){
      try{ await _wsPort.close(); }catch(_){ /* stil: opruimen: we zijn al aan het afbreken */ }
      try{
        await _wsPort.open({ baudRate: 115200, bufferSize: 4096 });
      }catch(e2){
        e2.__plTerminal = true;
        e2.message = 'COM-poort kon niet worden geopend.\nSluit andere programma\'s die de poort gebruiken (of trek de adapter kort los) en probeer opnieuw.\n\nDetail: ' + (e2.message || e2);
        throw e2;
      }
    } else {
      e.__plTerminal = true;
      e.message = 'COM-poort kon niet worden geopend.\nSluit andere programma\'s die de poort gebruiken (of trek de adapter kort los) en probeer opnieuw.\n\nDetail: ' + (e.message || e);
      throw e;
    }
  }
  log('Web Serial poort geopend (115200)', 'ok');

  const encoder = new TextEncoder();
  _wsWriter = _wsPort.writable.getWriter();
  _wsBuf=''; _wsReadAbort=false;

  // Dedicated reader-loop: vult _wsBuf byte-voor-byte. Losgekoppeld van de
  // oude btBuffer-polling; _webSerialSend leest synchroon tot de prompt.
  const decoder = new TextDecoder();
  (async () => {
    while (_wsPort && _wsPort.readable && !_wsReadAbort) {
      let reader;
      try { reader = _wsPort.readable.getReader(); _wsReader = reader; }
      catch(e){ break; }
      try {
        while (true){
          const { value, done } = await reader.read();
          if (done) break;
          if (value) _wsBuf += decoder.decode(value, {stream:true});
        }
      } catch(e){ /* onderbroken */ }
      finally { try{ reader.releaseLock(); }catch(e){ /* stil: opruimen: we zijn al aan het afbreken */ } }
    }
  })();

  // Schrijf-hook (rauw) — het echte protocol loopt via _webSerialSend hieronder.
  window._webSerialWrite = async (str) => { await _wsWriter.write(encoder.encode(str)); };
  window._webSerialPort = _wsPort;

  _wsPort.addEventListener('disconnect', () => {
    log('Web Serial verbroken', 'warn');
    connected = false; setConn(false);
    const vt = document.getElementById('vtag'); if (vt) vt.style.display = 'none';
    // Volledige teardown (incl. port.close) zodat een reconnect schoon start.
    disconnectWebSerial();
  });

  connected = true; demoMode = false;
  log('Web Serial verbonden', 'ok');
  setConn(true);
  await initELM327Serial();   // bewezen ELM327-init voor de COM-poort
  await scanNetworks();
  } finally { _wsConnecting = false; }
}

// ── Kern: stuur één commando en lees TOT de '>'-prompt (OBDLink-spec) ──
// Geen vaste delays; we wachten op wat de adapter zelf als "klaar" signaleert.
// SEARCHING... wordt netjes overgeslagen; timeout voorkomt eeuwig hangen.
async function _webSerialSend(cmd, timeoutMs){
  if(!_wsWriter){ return ''; }
  const TIMEOUT = timeoutMs || 5000;
  _wsBuf = '';                                   // buffer leeg vóór verzenden
  const enc = new TextEncoder();
  try { await _wsWriter.write(enc.encode(cmd + '\r')); }
  catch(e){ btDiag('serial write fout: '+(e.message||e),'err'); return ''; }
  btDiag('TX(serial): '+cmd,'info');

  const start = Date.now();
  // Lees tot de prompt '>' (0x3E) in de buffer staat, of tot timeout.
  while (Date.now() - start < TIMEOUT){
    if (_wsBuf.includes('>')) break;
    await delay(15);
  }
  // Response opschonen: echo, CR/LF, SEARCHING en de prompt eruit.
  let out = _wsBuf
    .replace(/\r/g,'\n')
    .split('\n')
    .map(s=>s.trim())
    .filter(s=>s && s!==cmd && !/^SEARCHING/i.test(s) && s!=='>')
    .join(' ')
    .replace(/>/g,'')
    .trim();
  btDiag('RX(serial): "'+out.slice(0,70)+'"', out?'info':'warn');
  return out;
}

// ── ELM-INIT BUSSLOT ──
// De reinit-reeks (ATZ/ATWS...ATSP0) bestaat uit meerdere losse commando's,
// elk een eigen entry in _btQueue. Zonder een geclaimd slot kan de poll-loop
// tussen die entries door zijn eigen PID-request queuen — en dat commando
// landt dan soms vlak ná ATSP0, middenin de protocoldetectie (SEARCHING...,
// ~10 s foute/rommelige data per keer, op een lange rit soms tientallen
// keren). withBus() (pidlane-data.js) claimt 'elm-init' als eigenaar zodat
// de poll-loop's eigen PLBus.claim('poll') tijdelijk faalt en die cyclus
// overslaat i.p.v. ertussen te kruipen. Fallback op ongated uitvoeren als
// PLBus/withBus (nog) niet geladen is — zelfde defensieve stijl als de
// bestaande PLBus-aanroepen elders in dit bestand.
// ── DE ELM-POORT (hard) ──
// Het busslot hierboven is ADVISEREND: het werkt alleen voor aanroepers die
// eerst PLBus.claim() doen. Drie gaten bleven daardoor open:
//   1. sppReconnectGuard plant de re-init met setTimeout(60) buiten de queue —
//      de poll-loop geeft zijn slot vrij en kan in dat gat één vuile batch op
//      een net gereset ELM zetten (echo aan, spaties aan, geen protocol).
//   2. PLBus.wait() geeft na 8s 0 terug en de aanroeper gaat TOCH door. Houdt
//      een survey/sweep de bus langer vast, dan draait de init ongelokt — het
//      oorspronkelijke gedrag, alleen zeldzamer.
//   3. PLBus.breek() (connectSerial) breekt élke houder open, ook een lopende
//      elm-init.
// Plus de aanroepers die PLBus überhaupt niet raken (03/04 in graph.js, de
// AT-baseline-rollback in btflow.js).
//
// Daarom een tweede, hárde poort die niet om medewerking vraagt: zolang de
// poort dicht staat weigert sendCmd/sendBT ALLES wat niet met een eenmalig
// doorlaatbewijs komt. Alleen de init-reeks zelf heeft dat bewijs (_elmSend).
//
// Waarom een one-shot en geen "init loopt"-boolean: de init doet awaits, en
// tijdens zo'n await draait andere code. Een periode-vlag zou die code óók
// doorlaten. Het bewijs wordt daarom synchroon gezet vlak vóór de aanroep en
// synchroon gewist bij binnenkomst — daar zit geen await tussen, dus er kan
// niets tussen glippen.
//
// Vervaltijd: een init die vastloopt mag de bus niet permanent dichtgooien.
// Na ELM_POORT_MAX_MS gaat de poort vanzelf open, met een melding in het log.
const ELM_POORT_MAX_MS = 15000;
let _elmPoortTot = 0;    // 0 = open; anders het tijdstip waarop hij vanzelf opengaat
let _elmPas      = false; // eenmalig doorlaatbewijs voor de init-reeks zelf

function _elmPoortDicht(reden){
  _elmPoortTot = Date.now() + ELM_POORT_MAX_MS;
  btDiag('ELM-poort dicht ('+reden+') — overig busverkeer wordt geweigerd','warn');
}
function _elmPoortOpen(reden){
  if(!_elmPoortTot) return;
  _elmPoortTot = 0;
  btDiag('ELM-poort open ('+reden+')','ok');
}
function _elmPoortDicht_(){    // interne lezer: regelt ook het vanzelf opengaan
  if(!_elmPoortTot) return false;
  if(Date.now() >= _elmPoortTot){
    _elmPoortTot = 0;
    btDiag('ELM-poort stond langer dan '+(ELM_POORT_MAX_MS/1000)+'s dicht — vervallen, verkeer weer toegestaan','warn');
    return false;
  }
  return true;
}

// Poortstatus naar buiten voor de testrun. Broncode-inspectie op window.sendCmd
// werkt hier niet: pidlane-remote.js wrapt sendCmd, dus je leest de wrapper.
window.PLElm = {
  poortDicht: function(){ try{ return _elmPoortDicht_(); }catch(e){ return null; } },
  heeftPoort: true
};

// Zenden mét doorlaatbewijs. Alleen de init-reeks gebruikt dit.
function _elmSend(cmd, timeoutMs){ _elmPas = true; return sendCmd(cmd, timeoutMs); }

async function _metElmBus(fn){
  _elmPoortDicht('elm-init');
  try{
    // Het busslot blijft staan: het houdt nette aanroepers netjes buiten, wat
    // beter is dan ze te laten afketsen op de poort. De poort is het vangnet
    // voor iedereen die zich er niets van aantrekt.
    if(typeof withBus==='function') return await withBus('elm-init', fn, 8000); // 8s: ruimer dan de default 4s, een lopende poll mag uitlopen tot zijn eigen timeout
    return await fn();
  } finally {
    _elmPoortOpen('elm-init klaar');
  }
}

// ── Bewezen ELM327-init voor Web Serial (ATZ-patroon) ──
// Op een COM-poort mag ATZ (volledige reset) — anders dan bij Android-SPP waar
// ATZ de BT-module sloopt. Volgorde volgt python-OBD/ELMduino/ScanDoc.
async function initELM327Serial(){
  await _metElmBus(async()=>{
    btDiag('ELM327 init (serial)...','proto');
    await _webSerialSend('ATZ', 3000);   // volledige reset
    await delay(1000);
    await _webSerialSend('ATE0', 2000);  // echo uit
    await _webSerialSend('ATL0', 2000);  // linefeeds uit
    await _webSerialSend('ATS0', 2000);  // spaties uit
    await _webSerialSend('ATH0', 2000);  // headers uit (standaard OBD)
    await _webSerialSend('ATSP0', 2000); // protocol auto
    const v = await _webSerialSend('ATRV', 2000); // accuspanning als levensteken
    log('ELM327 serial klaar'+(v?(' — accu: '+v):''),'ok');
  });
}

// ════════════════════════════════════════════════════════════════════
//  MODUS 3 — Web Bluetooth (browser-fallback)
//  Gooit een error bij mislukken — de cascade vangt 'm op.
// ════════════════════════════════════════════════════════════════════
async function connectWebBluetooth(){
  log('Web Bluetooth zoeken...', 'info');
  // Eerst gefilterd (nette lijst). OBDLink MX+ heet vaak "OBDLink MX+ 9xxxx"
  // → namePrefix 'OBDLink'/'OBDL' toegevoegd. Vindt de scan niets, dan een
  // tweede poging met acceptAllDevices zodat élke adapter kiesbaar is.
  const OPT_SVC = [BLE_SERVICE, '0000ffe0-0000-1000-8000-00805f9b34fb', BLE_SERVICE2];
  let device;
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [BLE_SERVICE] },
        { namePrefix: 'OBDLink' }, { namePrefix: 'OBDL' },
        { namePrefix: 'OBDII' }, { namePrefix: 'OBD2' }, { namePrefix: 'ELM327' },
        { namePrefix: 'Vgate' }, { namePrefix: 'MX+' }, { namePrefix: 'iCar' }
      ],
      optionalServices: OPT_SVC
    });
  } catch(e) {
    if (e && e.name === 'NotFoundError') {
      log('Geen match op filter — toon alle Bluetooth-apparaten...', 'info');
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: OPT_SVC
      });
    } else { throw e; }
  }
  log('Apparaat: ' + device.name, 'ok');

  const server = await device.gatt.connect();
  let writeChar = null, notifyChar = null;
  const services = await server.getPrimaryServices();
  for (const svc of services){
    const chars = await svc.getCharacteristics();
    for (const ch of chars){
      if (ch.uuid.includes('fff2') || ch.uuid.includes('ffe2')) writeChar = ch;
      if (ch.uuid.includes('fff1') || ch.uuid.includes('ffe1')) notifyChar = ch;
      if (!writeChar  && (ch.properties.write || ch.properties.writeWithoutResponse)) writeChar  = ch;
      if (!notifyChar && (ch.properties.notify || ch.properties.indicate))           notifyChar = ch;
    }
    if (writeChar && notifyChar) break;
  }
  if (!writeChar) throw new Error('Geen write-karakteristiek gevonden.');

  if (notifyChar){
    await notifyChar.startNotifications();
    notifyChar.addEventListener('characteristicvaluechanged',
      e => { btBuffer += new TextDecoder().decode(e.target.value); });
  }
  device.addEventListener('gattserverdisconnected', () => {
    connected = false; setConn(false);
    const vt = document.getElementById('vtag'); if (vt) vt.style.display = 'none';
    log('Web BT verbroken', 'warn');
  });

  window._webBtWrite = writeChar;
  connected = true; demoMode = false;
  log('Web BT verbonden: ' + device.name, 'ok');
  setConn(true);
  await initELM327();
  await scanNetworks();
}

// ════════════════════════════════════════
// STUREN & ONTVANGEN
// SPP: write({address,value}) + read({address}) polling elke 50ms
// readUntil gaf lege responses — read() polling is de enige werkende methode
// Promise.race timeouts annuleren readUntil NIET → hangende reads aten responses op
// BLE/WebBT: accumulator patroon met veilige null-checks
// ════════════════════════════════════════
// Globale BT mutex — één commando tegelijk op de socket.
// Parallelle sendBT calls stelen anders elkaars response-chunks.
let _btQueue=Promise.resolve();

async function sendBT(cmd, timeoutMs){
  // Vangnet voor de vier directe sendBT-aanroepen (ATI/ATZ/0100 bij de
  // BLE-kandidaatcontrole). Die lopen buiten sendCmd om en zouden de poort
  // anders passeren. sendCmd heeft het bewijs hierboven al gewist, dus deze
  // check ziet alleen nog écht ongelokt verkeer.
  const _pas = _elmPas; _elmPas = false;
  if(!_pas && _elmPoortDicht_()){
    btDiag(`sendBT "${cmd}" geweigerd: ELM-herinitialisatie bezig`,'warn');
    return '';
  }
  const run=_btQueue.then(()=>_sendBTRaw(cmd,timeoutMs));
  _btQueue=run.catch(()=>{}); // ketting nooit laten breken
  return run;
}

async function _sendBTRaw(cmd, timeoutMs){
  let res=await _sendBTOnce(cmd,timeoutMs);
  // STOPPED = ons commando onderbrak een lopende protocol search.
  // Even wachten en één keer opnieuw — de search is dan afgebroken.
  if(res==='STOPPED'){
    btDiag(`"${cmd}" → STOPPED (search onderbroken) — retry`,'warn');
    await delay(300);
    res=await _sendBTOnce(cmd,timeoutMs);
  }
  return res;
}

async function _sendBTOnce(cmd, timeoutMs){
  if(!window._sppConn&&!window._bleConn&&!window._webBtWrite&&!window._webSerialWrite){
    btDiag(`sendBT "${cmd}" geblokkeerd: GEEN actieve verbinding (spp=${!!window._sppConn} ble=${!!window._bleConn} web=${!!window._webBtWrite} serial=${!!window._webSerialWrite})`,'err');
    return '';
  }
  if(!cmd) return '';
  const myGen=window._btGen||0;
  const str=cmd+'\r';
  const TIMEOUT=timeoutMs||6000;

  // Web Serial (desktop): gebruik de bewezen prompt-gebaseerde transportlaag.
  // 0100 (protocoldetectie) krijgt automatisch meer tijd voor SEARCHING...
  if(window._webSerialWrite){
    const isSearch = /^01/.test(cmd);
    const _r = await _webSerialSend(cmd, isSearch ? Math.max(TIMEOUT, 10000) : TIMEOUT);
    // Antwoord van een commando uit de vorige sessie niet doorgeven: het hoort
    // bij een andere adapterstaat. Zelfde regel als in de andere drie takken.
    if((window._btGen||0)!==myGen){
      btDiag(`"${cmd}" verworpen: nieuwe verbindsessie gestart (serial)`,'warn');
      return '';
    }
    return _r;
  }

  try{
    if(window._sppConn){
      const {spp,address}=window._sppConn;

      // Oude data wegspoelen zodat vorige (late) responses niet meegelezen worden
      try{
        const stale=await spp.read({address});
        const staleStr=(stale?.value!=null)?String(stale.value):((stale?.data!=null)?String(stale.data):'');
        if(staleStr) btDiag(`RX flush: "${staleStr.slice(0,40)}"`,'warn');
      }catch(e){ btDiag(`flush read() fout: ${e.message}`,'warn'); }

      btDiag(`TX: ${cmd}`,'info');
      const start=Date.now();
      try{
        await spp.write({address, value:str});
      }catch(we){
        btDiag(`write() fout na ${Date.now()-start}ms: ${we.message}`,'err');
        await sppReconnectGuard(spp,address,cmd,true);
        return '';
      }

      // Polling: elke 50ms read() tot '>' prompt of timeout
      // ⚠ KRITIEK: read() geeft {value:"..."} terug, NIET {data:"..."}!
      // Dit was maandenlang de oorzaak van "lege" responses.
      let buf='';
      let pollCount=0;
      let deadline=start+TIMEOUT;
      let searchExtended=false;
      while(Date.now()<deadline){
        await delay(50);
        pollCount++;
        // Verouderd commando uit vorige sessie? Direct stoppen — en vooral
        // NIET de reconnect-guard draaien (die zou de nieuwe socket slopen)
        if((window._btGen||0)!==myGen){
          btDiag(`"${cmd}" afgebroken: nieuwe verbindsessie gestart`,'warn');
          return '';
        }
        try{
          const r=await spp.read({address});
          if(pollCount===1) btDiag(`read() #1 → ${JSON.stringify(r).slice(0,80)}`,'info');
          const chunk=(r?.value!=null)?String(r.value):((r?.data!=null)?String(r.data):'');
          if(chunk.length>0){
            buf+=chunk;
            btDiag(`RX chunk: "${chunk.slice(0,60)}"`,'info');
            // Protocol search bezig? NIET onderbreken — volgende commando
            // zou STOPPED veroorzaken. Deadline verlengen tot search klaar is.
            if(!searchExtended&&buf.includes('SEARCHING')){
              searchExtended=true;
              deadline=start+13000;
            }
          }
        }catch(re){
          btDiag(`read() fout (poll #${pollCount}): ${re.message}`,'err');
          break;
        }
        if(buf.includes('>')) break;
      }

      btDiag(`${cmd} klaar: ${Date.now()-start}ms, ${buf.length} tekens, ${pollCount} polls`,'info');

      // Reconnect-guard: lege buffer kan stille socket-dood betekenen
      if(!buf){
        await sppReconnectGuard(spp,address,cmd);
      }

      // Echo van eigen commando strippen (adapter echoot tot ATE0 actief is)
      let out=buf.replace(/>/g,'').trim();
      if(out.toUpperCase().startsWith(cmd.toUpperCase())) out=out.slice(cmd.length).trim();
      return out;

    } else if(window._bleConn){
      btBuffer='';
      const data=new TextEncoder().encode(str);
      const {ble,id,svc,write}=window._bleConn;
      await ble.write(id,svc,write,new DataView(data.buffer));
      // Accumulator wacht tot '>' in buffer
      const start=Date.now();
      while(Date.now()-start<4000){
        await delay(50);
        // Generatiecheck — stond alleen in de SPP-tak. Zonder deze regel leest
        // een commando uit de vórige sessie hier de buffer van de nieuwe leeg,
        // en dan is het antwoord van de nieuwe sessie spoorloos.
        if((window._btGen||0)!==myGen){
          btDiag(`"${cmd}" afgebroken: nieuwe verbindsessie gestart (BLE)`,'warn');
          return '';
        }
        if(typeof btBuffer==='string' && btBuffer.includes('>')) break;
      }
      const raw = typeof btBuffer==='string' ? btBuffer : '';
      btBuffer='';
      return raw.replace(/>/g,'').trim();

    } else if(window._webBtWrite){
      btBuffer='';
      const data=new TextEncoder().encode(str);
      const ch=window._webBtWrite;
      if(ch.properties?.writeWithoutResponse) await ch.writeValueWithoutResponse(data);
      else await ch.writeValue(data);
      const start=Date.now();
      while(Date.now()-start<4000){
        await delay(50);
        if((window._btGen||0)!==myGen){          // zelfde reden als in de BLE-tak
          btDiag(`"${cmd}" afgebroken: nieuwe verbindsessie gestart (Web BT)`,'warn');
          return '';
        }
        if(typeof btBuffer==='string' && btBuffer.includes('>')) break;
      }
      const raw = typeof btBuffer==='string' ? btBuffer : '';
      btBuffer='';
      return raw.replace(/>/g,'').trim();
    }

  }catch(e){
    log('BT fout: '+e.message,'err');
    btDiag('BT fout: '+e.message,'err');
    return '';
  }
  return '';
}

// Reconnect-guard: na lege response checken of de SPP socket nog leeft.
// Max 1 herverbindpoging per 10 sec om loops te voorkomen.
async function sppReconnectGuard(spp,address,cmd,force){
  try{
    const now=Date.now();
    if(window._lastSppReconnect&&now-window._lastSppReconnect<10000) return;

    // force=true (bv. na een write()-fout): socket is zéker kapot — de
    // isConnected-check overslaan, die rapporteert dan soms nog "verbonden".
    let alive=!force;
    if(!force){
      try{
        const c=await spp.isConnected({address});
        alive=(c?.isConnected!==false&&c?.connected!==false&&c!==false);
      }catch(e){ alive=false; }
    }

    if(!alive){
      window._lastSppReconnect=now;
      // Poort NU dicht, niet pas in de setTimeout hieronder. Vanaf dit moment
      // is de ELM-interpreter niet meer in de staat die de app denkt: de
      // nieuwe socket komt met echo aan, spaties aan en zonder vergrendeld
      // protocol. Alles wat tussen hier en het einde van de re-init de bus op
      // wil, levert rommel. De vervaltijd dekt het geval dat de herverbinding
      // faalt en de re-init dus nooit start.
      _elmPoortDicht('socket dood — herverbinden');
      btDiag(`Socket dood na "${cmd}" — herverbinden...`,'warn');
      try{ await spp.disconnect({address}); }catch(e){ /* stil: opruimen: we zijn al aan het afbreken */ }
      // Direct herverbinden op hetzelfde (gebonde) adres: 3 pogingen met
      // oplopende pauze. Vlak na een socket-dood houdt de adapter de oude
      // socket vaak nog even vast — even wachten en opnieuw proberen slaagt
      // vrijwel altijd, en voorkomt de trage volledige cascade (12s BLE-scan,
      // discovery, verkeerde apparaten). De pair-knop is hierbij NOOIT nodig:
      // een gebonded adapter accepteert een directe connect zonder discoverable
      // te zijn.
      let _rcOk=false,_rcErr=null;
      for(let _a=1;_a<=3&&!_rcOk;_a++){
        await delay(_a===1?500:1500);
        try{ await spp.connect({address}); _rcOk=true; }
        catch(_e){ _rcErr=_e; btDiag(`Herverbindpoging ${_a}/3 mislukt: ${_e.message}`,'warn'); }
      }
      if(!_rcOk) throw (_rcErr||new Error('herverbinden mislukt'));
      btDiag('Herverbonden ✓','ok');
      log('SPP automatisch herverbonden','warn');
      // Nieuwe socket = ELM327-interpreter is gereset. Opnieuw initialiseren zodat
      // de gebruiker niets hoeft te doen. BELANGRIJK: buiten de BT-queue plannen
      // (initELM327 stuurt zelf commando's → in de queue zou dat deadlocken).
      setTimeout(async()=>{
        // Elke uitgang moet de poort weer opendoen, ook de vroege return:
        // stond hij dicht en gebeurde er niets meer, dan lag de bus stil tot
        // de vervaltijd. _metElmBus doet dat zelf voor het normale pad; deze
        // twee gevallen komen daar niet eens.
        if(window._reinitBusy){ return; }   // andere init loopt al → die doet de poort
        window._reinitBusy=true;
        try{
          if(connected){ await initELM327({herstelProtocol:true}); btDiag('ELM327 opnieuw klaar na herverbinden','ok'); }
          else { _elmPoortOpen('geen verbinding meer — re-init overgeslagen'); }
        }
        catch(e){ btDiag('Re-init na herverbinden faalde: '+e.message,'warn'); _elmPoortOpen('re-init gefaald'); }
        finally{ window._reinitBusy=false; }
      },60);
    }
  }catch(e){
    btDiag('Herverbinden mislukt: '+e.message,'err');
  }
}

async function sendCmd(cmd, timeoutMs){
  if(demoMode){ btDiag(`sendCmd "${cmd}" geblokkeerd: demoMode staat AAN`,'warn'); return ''; }
  // Doorlaatbewijs synchroon lezen én wissen: één aanroep, geen await ertussen.
  const _pas = _elmPas; _elmPas = false;
  if(!_pas && _elmPoortDicht_()){
    btDiag(`"${cmd}" geweigerd: ELM-herinitialisatie bezig`,'warn');
    // BEWUST vóór PLBus.note() en trackBtQuality(): een geweigerd commando is
    // geen busfout en al helemaal geen lege respons. Zou het wél meetellen,
    // dan schoot _emptyStreak binnen zes weigeringen naar de "verbinding dood"-
    // drempel en trok de app een volledige herverbinding op gang — een
    // reconnect-lus veroorzaakt door de bescherming tegen reconnects.
    return '';
  }
  const _t0 = Date.now();
  // Bewijs doorzetten naar sendBT: dat is de tweede poort, en die weet niet
  // dat sendCmd het al had. Zonder deze regel weigert de backstop de
  // init-reeks zelf — de fix die zichzelf sloopt. sendBT wordt hieronder
  // SYNCHROON aangeroepen (het await geldt de terugkeer, niet de aanroep),
  // dus er kan niets tussen deze regel en die check glippen.
  if(_pas) _elmPas = true;
  const r = await sendBT(cmd, timeoutMs);
  // Telemetrie (fase 4): hoe lang duurde dit commando en kwam er iets zinnigs
  // terug? Voedt het busdiagnose-scherm (polls/sec, gem. ms, ECU-belasting).
  try{
    const slecht = !r || !String(r).trim() || /NO DATA|ERROR|UNABLE|STOPPED|BUFFER/i.test(String(r));
    PLBus.note(cmd, Date.now()-_t0, slecht);
  }catch(e){ console.warn('PLBus.note mislukt - busstatistieken lopen achter: '+(e.message||e)); }
  trackBtQuality(cmd, r);
  return r;
}

// ── VERBINDINGSKWALITEIT — knipperende pill bij matige dataverwerking ──
const _btQual=[]; let _qualWarned=false;
function trackBtQuality(cmd, r){
  if(!connected || demoMode) return;
  // Alleen data-PIDs tellen. LET OP: echte polls zijn '010C1' ('1'-suffix voor
  // snelle terugkeer) en batches '010C0D05...' — de oude regex /^01XX$/ matchte
  // die nooit, waardoor kwaliteitspill én dode-socket-detectie nooit draaiden.
  if(!/^01([0-9A-F]{2})+1?$/i.test(cmd)) return;
  // Stille socketdood: een dode socket geeft NIETS terug (geen bytes), terwijl
  // 'NO DATA' juist betekent dat de adapter wél leeft. Tel daarom alleen écht
  // lege responses. Meerdere achter elkaar = verbinding feitelijk weg.
  const noResponse = !r || !r.trim();
  if(noResponse){ window._emptyStreak=(window._emptyStreak||0)+1; } else { window._emptyStreak=0; }
  if(window._emptyStreak>=6 && connected && !demoMode){
    window._emptyStreak=0;
    btDiag('6× lege respons achtereen — verbinding lijkt dood','err');
    log('Verbinding lijkt weggevallen — herverbinden...','warn');
    connected=false; setConn(false);                   // UI eerlijk bijwerken
    // Automatisch herverbinden als de gebruiker niet bewust verbroken heeft
    if(localStorage.getItem('pl_autoconn')==='1' && getSPP() && !window._reconnBusy){
      window._reconnBusy=true;
      setTimeout(async()=>{ try{ if(!connected) await connectSerial(); } finally{ window._reconnBusy=false; } },800);
    }
    return;
  }
  const bad = !r || !r.trim() || r.includes('NO DATA') || r.includes('ERROR') || r.includes('STOPPED');
  _btQual.push(bad?1:0); if(_btQual.length>20) _btQual.shift();
  if(_btQual.length<10) return;
  const ratio=_btQual.reduce((a,b)=>a+b,0)/_btQual.length;
  const pill=document.querySelector('.pill');
  if(ratio>=0.3){
    if(pill && !pill.classList.contains('attn')){
      if(!pill.dataset.origTitle) pill.dataset.origTitle=pill.title||'';
      pill.classList.add('attn');
      pill.title='Veel lege antwoorden van de ECU — PidLane regelt het tempo automatisch bij';
      // Ook op de samengevoegde systeem-chip: anders verdwijnt deze waarschuwing
      // zodra de vier losse chips zijn ingeklapt.
      try{ document.getElementById('sysChip')?.classList.add('attn'); }catch(e){ /* stil: sysChip bestaat pas na de topbar-splitsing */ }
    }
    if(!_qualWarned){
      // Tijdens discovery/health-scan/survey levert de ECU van nature veel
      // NO DATA: we proberen dan juist PIDs uit die de auto níét heeft.
      // Waarschuwen is dan onzin. En de oude tekst verwees naar "🤖 Optimaliseer",
      // wat sinds PLLoad geen keuze meer is maar automatisch gebeurt.
      let scanBezig=false;
      try{ scanBezig = (typeof _busyPillUntil!=='undefined' && Date.now() < _busyPillUntil); }
      catch(e){ /* stil: _busyPillUntil bestaat pas na de eerste scan */ }
      if(!scanBezig){
        _qualWarned=true;
        showToast?.('⚠ Veel lege antwoorden van de ECU — tempo wordt automatisch teruggeschroefd', 5000);
      }
    }
  } else if(ratio<=0.1 && pill && pill.classList.contains('attn')){
    pill.classList.remove('attn');
    pill.title=pill.dataset.origTitle||'';
    try{ document.getElementById('sysChip')?.classList.remove('attn'); }catch(e){ /* stil: sysChip bestaat pas na de topbar-splitsing */ }
  }
}

// ══════════════════════════════════════════════════════════════════
// CONNECTIE-OPTIMALISATIE — meet adaptersnelheid, stelt readiness-
// strategie voor (Snel/Gebalanceerd/Conservatief), toont compacte status
// in de topbar. Draait na verbinden + lichte hercontrole vóór elke analyse.
// ══════════════════════════════════════════════════════════════════
let _connSpeed=null;        // {readsPerSec, avgMs, protocol, pids, ts}
let _connStrategy=null;     // 'snel' | 'gebalanceerd' | 'conservatief'

// → STRATEGIE_INFO verplaatst naar pidlane-data.js

// Meet de werkelijke doorvoer: stuur N PID-reads en klok de tijd.
async function measureConnSpeed(samples=8){
  if(demoMode){
    _connSpeed={readsPerSec:25, avgMs:40, protocol:'Demo', pids:supportedPIDs.size, ts:Date.now()};
    return _connSpeed;
  }
  if(!connected) return null;
  // BT-OPTIMALISATIE-VOLGORDE: nooit snelheid meten terwijl de Full Survey de
  // bus bezet houdt — dat geeft valse (trage) responstijden en dus een
  // verkeerde poll-strategie. Wachten tot de bus vrij is (max 2 min);
  // tijdens discovery/survey doet strategie er toch niet toe.
  for(let _w=0;_w<120&&typeof _vlSvBusy!=='undefined'&&_vlSvBusy;_w++){
    await new Promise(r=>setTimeout(r,1000));
    if(!connected) return null;
  }
  // Kies een bestaande, gezonde PID om mee te testen (RPM of eerste supported)
  let testPid='010C';
  if(!supportedPIDs.has(testPid)) testPid=[...supportedPIDs][0]||'010C';
  let proto='?';
  try{ const dp=await sendCmd('ATDP',1500); if(dp) proto=dp.replace(/[\r\n>]/g,'').trim(); }
  catch(e){ /* stil: ATDP is optioneel, de protocolnaam blijft dan leeg */ }
  const times=[];
  for(let i=0;i<samples;i++){
    const t0=performance.now();
    try{ await sendCmd('01'+testPid.slice(2)+'1',2000); }
    catch(e){ /* stil: opwarmvraag, een misser hier zegt niets */ }
    times.push(performance.now()-t0);
  }
  const valid=times.filter(t=>t>0);
  const avgMs=valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length):999;
  const readsPerSec=avgMs>0?+(1000/avgMs).toFixed(1):0;
  _connSpeed={readsPerSec, avgMs, protocol:proto, pids:supportedPIDs.size, ts:Date.now()};
  return _connSpeed;
}

function suggestStrategy(speed){
  if(!speed) return 'gebalanceerd';
  if(speed.readsPerSec>=12) return 'snel';
  if(speed.readsPerSec>=5)  return 'gebalanceerd';
  return 'conservatief';
}

// Past de gekozen strategie toe op de poll-intervallen (via globale multiplier)
let _pollMult=1.0;
function applyStrategy(strat){
  _connStrategy=strat;
  _pollMult=STRATEGIE_INFO[strat]?.mult||1.0;
  updateConnStatusBar();
  window._connReady=true;
  try{ updateConnGate(); }
  catch(e){ btDiag('updateConnGate mislukt — de verbindknop kan in de verkeerde stand staan: '+(e.message||e),'warn'); }
}

// Compacte status in de topbar-statusregel
function updateConnStatusBar(){
  const txt=document.getElementById('stxt'); if(!txt) return;
  if(!connected){ return; }
  if(_connSpeed && _connStrategy){
    const s=STRATEGIE_INFO[_connStrategy];
    txt.innerHTML=`${demoMode?'Demo':'Verbonden'} · ⚡${_connSpeed.readsPerSec}/s · 📡${_connSpeed.pids} · ${s.emoji}${s.label}`;
  }
}

// Hoofd-flow: meet → stel voor → laat bevestigen via overlay
async function optimizeConnection(silent=false){
  if(!connected && !demoMode){ showToast?.('Verbind eerst een adapter'); return; }
  const txt=document.getElementById('stxt'); if(txt && !silent) txt.textContent='⏳ Verbinding meten…';
  const speed=await measureConnSpeed();
  if(!speed){ if(txt) txt.textContent='Verbonden'; return; }
  const voorstel=suggestStrategy(speed);
  if(silent){ applyStrategy(_connStrategy||voorstel); return; }
  showStrategyConfirm(speed, voorstel);
}

// Vroeger een overlay met drie knoppen ("Kies een poll-strategie"). Sinds
// PLLoad de busbezetting meet en het pollbudget zelf bijregelt is die vraag
// zinloos: wat de gebruiker ook koos, de regelkring corrigeerde het binnen
// ~8 seconden naar dezelfde uitkomst. We passen het gemeten voorstel nu stil
// toe als startpunt en melden alleen nog de uitkomst.
function showStrategyConfirm(speed, voorstel){
  applyStrategy(voorstel);
  const s=STRATEGIE_INFO[voorstel];
  try{ if(typeof showToast==='function') showToast(`⚡ ${speed.readsPerSec} reads/s · ${speed.avgMs}ms — tempo wordt automatisch geregeld`); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  try{ btDiag(`Verbinding gemeten: ${speed.readsPerSec} reads/s, ${speed.avgMs}ms → startpunt ${s?s.label:voorstel}; PLLoad regelt vanaf hier`,'ok'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
}


// Lichte hercontrole vóór een analyse: snelle gezondheids-check zonder popup,
// tenzij de verbinding merkbaar verslechterd is.
// Lichte gate vóór analyse: vereist een expliciete connectie-check (knop) zodat
// de optimalisatie-popup niet meer vanzelf midden in een analyse verschijnt.
async function preAnalysisCheck(){
  if(demoMode) return true;
  if(!connected){ showToast?.('Verbind eerst een adapter'); return false; }
  if(window._connReady) return true;
  showToast?.('Klik eerst \ud83d\udd0c Check connectie'); pulseConnGate(); return false;
}
// De échte check + optimalisatie — gekoppeld aan de "Check connectie"-knop.
async function runConnectionCheck(){
  if(demoMode){ window._connReady=true; updateConnGate(); return true; }
  if(!connected){ showToast?.('Verbind eerst een adapter'); return false; }
  if(!_connStrategy){ await optimizeConnection(false); return false; } // gebruiker kiest strategie -> applyStrategy zet _connReady
  const before=_connSpeed?.readsPerSec||0;
  const speed=await measureConnSpeed(3);
  updateConnStatusBar();
  if(speed && before && speed.readsPerSec < before*0.5 && speed.readsPerSec<5){
    showStrategyConfirm(speed, suggestStrategy(speed));
    return false;
  }
  window._connReady=true; updateConnGate(); return true;
}
// Connectie-gate UI: knop verschijnt als verbonden maar nog niet gecheckt.
function updateConnGate(){
  let g=document.getElementById('connGate');
  const need = connected && !demoMode && !window._connReady;
  if(!g){
    if(!need) return;
    g=document.createElement('div'); g.id='connGate';
    g.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:80px;z-index:var(--z-zwevend,9400);background:#1a6fff;color:#fff;font:800 13px/1 var(--f,sans-serif);padding:11px 16px;border-radius:24px;cursor:pointer;box-shadow:0 4px 16px rgba(26,111,255,.45);border:none;transition:transform .15s';
    g.textContent='\ud83d\udd0c Check connectie';
    g.onclick=async()=>{ g.textContent='\u23f3 Checken\u2026'; const ok=await runConnectionCheck(); if(ok){ showToast?.('\u2705 Klaar voor analyse'); } else { g.textContent='\ud83d\udd0c Check connectie'; } };
    document.body.appendChild(g);
  }
  g.style.display = need ? 'block' : 'none';
}
function pulseConnGate(){
  updateConnGate();
  const g=document.getElementById('connGate'); if(!g) return;
  g.style.transform='translateX(-50%) scale(1.12)';
  setTimeout(()=>{ if(g) g.style.transform='translateX(-50%) scale(1)'; },180);
}

// Complete OBD2 PID definitiedatabase met parse functies
// → ALL_PID_DEFS verplaatst naar pidlane-data.js

function showConnError(msg){
  document.getElementById('step1').style.display='';
  document.getElementById('step2').style.display='none';
  document.getElementById('step3').style.display='none';
  document.getElementById('connActions').innerHTML=`
    <div style="font-size:12px;color:var(--rd);padding:4px 0 8px;text-align:center">⚠ ${msg}</div>
    <button class="mbtn p" id="btnConnect">📡 Opnieuw proberen</button>
    <button class="mbtn s" id="btnDemo">▷ Demo modus</button>`;
  // Scoped bedraden: er bestaat óók een #btnConnect/#btnDemo op de hub
  // (dubbele id) — getElementById pakt de eerste en liet deze knoppen dood.
  const _ca=document.getElementById('connActions');
  _ca.querySelector('#btnConnect').onclick=()=>connectSerial();
  _ca.querySelector('#btnDemo').onclick=()=>startDemo();
}

// ── PROTOCOLGEHEUGEN ──────────────────────────────────────────────────────
// ATWS reset de interpreter en ATSP0 zet het protocol expliciet terug op AUTO.
// Bij een koude start is dat precies goed: scanNetworks() detecteert daarna en
// vergrendelt met ATSP<id>. Maar het herverbindpad (sppReconnectGuard) roept
// alleen initELM327() aan en gaat NIET door naar scanNetworks(). De adapter
// bleef daardoor in zoekmodus staan, waarna élk volgend commando opnieuw
// "SEARCHING..." deed — ~5 seconden per commando, vaak eindigend in
// UNABLE TO CONNECT. In het veldlog van 4-8 kostte dat 8,8 minuten wachttijd
// over 101 commando's, plus de vervolgschade (pollbudget naar 17%, multi-PID
// helemaal uit) omdat de regelkringen een verzadigde bus zágen die er niet was.
//
// Oplossing: onthoud het gedetecteerde protocol en vergrendel het na een
// herverbinding opnieuw, in plaats van terug te vallen op AUTO.

// Eén plek voor "is dit een bruikbaar ELM-protocol-id". Stond als losse regex
// in _bekendProtocolId(); nu ook nodig bij de herdetectie na een afwijking.
// ELM327 kent 1..C, en ATDPN zet er een 'A' voor bij automatisch gevonden
// ("A6"); ATSPA6 is de geldige manier om dat te vergrendelen.
function _schoonProtocolId(id){
  const v=String(id||'').trim().toUpperCase();
  if(!v||v==='?'||v==='0'||v==='A0') return '';
  return /^A?[0-9A-C]$/.test(v) ? v : '';
}

function _onthoudProtocol(id){
  const v=String(id||'').trim().toUpperCase();
  if(!v||v==='?'||v==='0') return;          // '0' = AUTO, dat is geen vergrendeling
  try{ localStorage.setItem('pl_proto_id', v); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
}

function _bekendProtocolId(){
  // Voorkeur: de netwerkkeuze van deze sessie. Valt terug op de opgeslagen
  // waarde, zodat ook een herstart + direct herverbinden meteen goed zit.
  let v='';
  try{ v=String(selectedNetwork?.id||'').trim().toUpperCase(); }
  catch(e){ /* stil: nog geen netwerk gekozen */ }
  if(!v||v==='?'||v==='0'){
    try{ v=String(localStorage.getItem('pl_proto_id')||'').trim().toUpperCase(); }catch(e){ v=''; }
  }
  if(!v||v==='?'||v==='0'||v==='A0') return null;
  // ELM327 kent protocol 1..C. ATDPN zet er een 'A' voor als het protocol
  // automatisch gevonden is ("A6"), en ATSPA6 is de geldige manier om dat
  // te vergrendelen. Beide vormen moeten dus door de controle komen.
  if(!/^A?[0-9A-C]$/.test(v)) return null;
  return v;
}

// ── BLUETOOTH SEND/RECEIVE ──
// opts.herstelProtocol : vergrendel na de init het eerder gedetecteerde
//                        protocol i.p.v. ATSP0. Gebruikt door het
//                        herverbindpad, niet door de eerste verbinding.
async function initELM327(opts){
  const _herstel = !!(opts && opts.herstelProtocol);
  await _metElmBus(async()=>{
    btDiag('ELM327 initialiseren...','proto');

    // Stap 1: Warm start — ATWS ipv ATZ!
    // ATZ is een volledige hardware reset die op OBDLink (STN chip) ook de
    // Bluetooth module reset → SPP socket sterft stil. ATWS reset alleen de
    // ELM327 interpreter en houdt de BT verbinding in leven.
    await _elmSend('ATWS');
    await delay(1000); // ELM327 heeft tijd nodig na reset
    btDiag('ATWS warm start OK','ok');

    // Stap 2: Basisinstellingen
    await _elmSend('ATE0');  // Echo uit
    await _elmSend('ATL0');  // Linefeeds uit
    await _elmSend('ATS0');  // Spaties uit
    await _elmSend('ATH0');  // Headers uit (standaard)
    await _elmSend('ATAT1'); // Adaptive timing
    await _elmSend('ATST64');// 400ms timeout per commando

    // Stap 3: Protocol instellen
    const _proto = _herstel ? _bekendProtocolId() : null;
    if(_proto){
      // Herverbinding met een bekend protocol: direct vergrendelen. Scheelt de
      // volledige SEARCHING-cyclus bij élk volgend commando.
      await _elmSend('ATSP'+_proto);
      await delay(200);

      // Verifiëren dat de adapter de vergrendeling ook echt overnam. ATDPN
      // kost ~60ms en geeft in het log harde zekerheid i.p.v. een aanname.
      let _bevestigd='';
      try{
        _bevestigd=(await _elmSend('ATDPN')).replace(/[^0-9A-Fa-f]/g,'').trim().toUpperCase();
      }catch(e){ /* stil: bevestiging via ATDPN is extra zekerheid, geen voorwaarde */ }
      if(_bevestigd && _bevestigd.replace(/^A/,'') === _proto.replace(/^A/,'')){
        btDiag(`Protocol opnieuw vergrendeld: ${_proto} (bevestigd via ATDPN)`,'ok');
      }else if(_bevestigd){
        // Adapter zegt iets anders. Alleen ATSP0 sturen was hier de val: het
        // herverbindpad gaat NIET door naar scanNetworks(), dus de adapter
        // bleef in zoekmodus staan en élk volgend commando deed opnieuw
        // "SEARCHING..." — precies de 8,8 minuten over 101 commando's uit het
        // veldlog van 4-8, veroorzaakt door de fix die dat moest voorkomen.
        // Nu: terug naar AUTO én de detectie hier zelf afmaken, zodat de
        // adapter vergrendeld achterblijft in plaats van zoekend.
        btDiag(`Protocolvergrendeling week af (gevraagd ${_proto}, kreeg ${_bevestigd}) — terug naar AUTO`,'warn');
        try{ localStorage.removeItem('pl_proto_id'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }   // fout onthouden protocol niet nóg eens proberen
        await _elmSend('ATSP0');
        await delay(200);
        // 0100 dwingt de automatische detectie af; ruime timeout want dit is
        // precies het commando dat de SEARCHING-cyclus doorloopt.
        let _det='';
        try{ _det=await _elmSend('0100', 12000); }
        catch(e){ /* stil: hier wordt juist getest OF de bus antwoordt */ }
        if(_det && /41/.test(_det) && !/UNABLE|ERROR|STOPPED|NO DATA/i.test(_det)){
          let _nieuw='';
          try{ _nieuw=_schoonProtocolId((await _elmSend('ATDPN')).replace(/[^0-9A-Fa-f]/g,'')); }
          catch(e){ /* stil: protocolnummer opvragen mag mislukken, dan blijft de oude staan */ }
          if(_nieuw){
            _onthoudProtocol(_nieuw);
            // ÓÓK selectedNetwork bijwerken: _bekendProtocolId() geeft daar
            // voorrang aan boven localStorage. Zonder deze regel wist de
            // opslag het goede id en probeerde de volgende herverbinding
            // alsnog het foute — de fix die zichzelf overslaat.
            try{ if(selectedNetwork) selectedNetwork.id=_nieuw; }
            catch(e){ /* stil: selectedNetwork kan al opgeruimd zijn */ }
            btDiag(`Protocol opnieuw gedetecteerd na afwijking: ${_nieuw} — vergrendeld`,'ok');
          }else{
            btDiag('Detectie gelukt maar ATDPN gaf geen bruikbaar id — AUTO aangehouden','warn');
          }
        }else{
          btDiag('Herdetectie na afwijking gaf geen antwoord — AUTO aangehouden','warn');
        }
      }else{
        btDiag(`Protocol ${_proto} gestuurd, ATDPN gaf geen antwoord — voorlopig aangehouden`,'warn');
      }

      // De regelkringen hebben zich aangepast aan een bus die traag léék.
      // Nu de oorzaak weg is: budget en multi-PID meteen terugzetten, anders
      // blijft de app minutenlang onnodig in een lage stand hangen.
      try{ if(window.PLLoad&&PLLoad.herstelNaProtocolLock) PLLoad.herstelNaProtocolLock(); }
      catch(e){ btDiag('PLLoad herstellen na protocol-lock mislukt — het pollbudget kan laag blijven hangen: '+(e.message||e),'warn'); }
    }else{
      // Koude start (of geen bekend protocol): AUTO, scanNetworks() detecteert.
      await _elmSend('ATSP0');
      await delay(200);
    }

    btDiag(_proto?'ELM327 klaar — protocol hersteld':'ELM327 klaar — klaar voor protocol detectie','ok');
    log('ELM327 initialisatie klaar','ok');
  });
}

// ── STAP 2: NETWERK SCAN ──
// → PROTOCOLS verplaatst naar pidlane-data.js

// ── STAP 1b — DE KENTEKENPOORT (26-08-2026) ──────────────────────────
// Het kenteken stond op de voertuigkaart, dus ná de volledige discovery. Maar
// het bepaalt merk, model, bouwjaar en brandstof, en dat voedt merkGroep(), de
// DTC-lookup (§14) en de brandstofafhankelijke PID-gates. Achteraf invullen
// betekent dat de discovery draait op een voertuig zonder eigenschappen —
// precies de "Voertuig — mist: model, bouwjaar, brandstof" uit testrun 4.7.
//
// De poort zit in scanNetworks() en niet in de vier transports (SPP, BLE,
// WebSerial, WebBT) die er allemaal op uitkomen: één beslisplek, geen vier
// kopieën die uiteen kunnen lopen.
//
// Overslaan mag en is zichtbaar. Een buitenlands kenteken, een RDW die plat
// ligt of een telefoon zonder bereik mag een diagnose nooit blokkeren; de VIN
// wordt straks alsnog gelezen. Wat NIET meer kan is er ongemerkt langslopen.
let _kentPoortKlaar = false;
function kentPoortReset(){ _kentPoortKlaar = false; }

// Wat de adapter zelf herkende, of null. Apart van discoveredNetworks omdat die
// lijst sinds 26-08 óók de handmatige alternatieven bevat.
let _gedetecteerdProtocol = null;

function toonKentekenStap(){
  ['step1','step2','step3'].forEach(function(id){
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  const st=document.getElementById('stepKent'); if(st) st.style.display='';
  const inp=document.getElementById('kentWizInput');
  const stat=document.getElementById('kentWizStatus');
  if(stat) stat.textContent='';
  if(inp){
    // Voorvullen met het laatst gebruikte kenteken, maar de gebruiker moet het
    // wél bevestigen. Tot nu toe werd dat kenteken stilzwijgend hergebruikt op
    // élke auto waarmee je verbond — de plaat van gisteren op de auto van nu.
    let vorig=''; try{ vorig=localStorage.getItem('pl_kenteken')||''; }catch(e){ /* stil: opslag kan geblokkeerd zijn */ }
    inp.value=vorig;
    if(vorig && stat) stat.textContent='Laatst gebruikt — controleer of dit de auto is waar je nu in zit';
    try{ inp.focus(); inp.select(); }catch(e){ /* stil: focus mag falen op een verborgen veld */ }
  }
  const acts=document.getElementById('connActions');
  if(acts) acts.innerHTML=
    '<button class="mbtn p" id="kentOkBtn" onclick="kentekenBevestig()">🇳🇱 Opzoeken en doorgaan</button>'+
    '<button class="mbtn s" onclick="kentekenOverslaan()">Overslaan — geen kenteken</button>';
  btDiag('Kentekenstap — wacht op invoer vóór de protocolscan','info');
}

async function kentekenBevestig(){
  const inp=document.getElementById('kentWizInput');
  const stat=document.getElementById('kentWizStatus');
  const btn=document.getElementById('kentOkBtn');
  const kent=String((inp&&inp.value)||'').replace(/[\s-]/g,'').toUpperCase();
  if(kent.length<4){
    if(stat) stat.textContent='Voer een geldig kenteken in (minimaal 4 tekens)';
    return;
  }
  if(btn){ btn.disabled=true; btn.textContent='Opzoeken...'; }
  let r=null;
  try{
    r=await rdwLookup(false,{kenteken:kent, statusEl:stat});
  }catch(e){
    if(stat) stat.textContent='Opzoeken mislukt: '+(e.message||e);
    btDiag('RDW-opzoeking in de kentekenstap mislukte: '+(e.message||e),'warn');
  }
  if(btn){ btn.disabled=false; btn.textContent='🇳🇱 Opzoeken en doorgaan'; }
  if(!r||!r.ok){
    // rdwLookup heeft de reden al in stat gezet (niet gevonden, RDW down,
    // typefout). Niet doorstappen: de gebruiker kan corrigeren of overslaan.
    return;
  }
  _kentPoortKlaar=true;
  await scanNetworks();
}

function kentekenOverslaan(){
  _kentPoortKlaar=true;
  btDiag('Kenteken overgeslagen — merk/model/brandstof komen straks alleen uit de VIN','warn');
  try{ log('Kenteken overgeslagen bij het verbinden','warn'); }catch(e){ /* stil: melding mag de stroom niet breken */ }
  scanNetworks();
}

async function scanNetworks(){
  // De poort. Demo heeft geen echte auto en stelt zijn eigen kenteken in.
  if(!_kentPoortKlaar && !demoMode){ toonKentekenStap(); return; }
  const _sk=document.getElementById('stepKent'); if(_sk) _sk.style.display='none';
  document.getElementById('step1').style.display='none';
  document.getElementById('step2').style.display='';
  document.getElementById('step3').style.display='none';
  document.getElementById('step2Title').textContent='Protocol detecteren...';
  document.getElementById('step2Sub').textContent='Zet contact aan — even geduld (max 15 sec)';
  document.getElementById('networkList').innerHTML='<div class="ai-ld" style="justify-content:center"><div class="spin"></div> Protocol zoeken...</div>';
  document.getElementById('connActions').innerHTML=`<button class="mbtn s" onclick="resetToStep1()">↺ Opnieuw beginnen</button>`;
  discoveredNetworks=[];
  _gedetecteerdProtocol=null;

  // 0100 triggert automatische protocol detectie — kan 3-8 seconden duren
  // Verhoog sendBT timeout tijdelijk naar 12 seconden voor deze stap
  btDiag('Protocol detectie — 0100 sturen (wacht max 12 sec)...','info');
  await sendCmd('ATSP0');
  await delay(300);

  // Stuur 0100 met extra lange timeout (12 sec) via de normale sendCmd —
  // geen aparte readUntil meer, die gaf lege responses
  let autoResp='';
  try{
    autoResp=await sendCmd('0100', 12000);
  }catch(e){ autoResp=''; }

  btDiag(`0100 response: "${autoResp||'(geen)'}"`, 'info');

  if(autoResp && !autoResp.includes('UNABLE') && !autoResp.includes('NO DATA') && !autoResp.includes('ERROR') && !autoResp.includes('STOPPED') && autoResp.includes('41')){
    // Succesvol — protocol gevonden
    const protoResp=(await sendCmd('ATDPN')).replace(/[^0-9A-Fa-f]/g,'').trim()||'6';
    const protoName=(await sendCmd('ATDP')).replace(/[>\r\n]/g,'').trim()||'Auto-detected';
    _gedetecteerdProtocol={
      id:protoResp, name:protoName, icon:'✅',
      desc:'Automatisch herkend door ELM327'
    };
    log(`Protocol: ${protoName} (${protoResp})`,'ok');
    btDiag(`Protocol gevonden: ${protoName}`,'ok');
    _onthoudProtocol(protoResp);   // zodat een herverbinding niet terugvalt op AUTO
    // Inventaris opschonen zodra bekend is wat de auto levert + welk type het is.
    // Heette purgeImplausiblePids(); die functie is in ronde 5b vervangen door
    // herijkPidGate(), maar deze aanroep bleef staan — binnen een stille catch,
    // dus de ReferenceError verdween en het opschonen gebeurde nooit meer.
    try{ herijkPidGate('protocol gevonden'); }
    catch(e){ btDiag('Herijking na protocolvondst mislukt — de PID-zeef draait op oude kennis: '+(e.message||e),'warn'); }
  } else {
    // Geen auto-detect — geen contact of auto reageert niet
    btDiag('Geen auto-detect response — contact aan?','warn');
    if(!autoResp||autoResp.length===0){
      document.getElementById('step2Sub').textContent='Zet contact aan en probeer opnieuw';
    }
  }

  // Het gedetecteerde protocol bovenaan, daarna de handmatige alternatieven uit
  // PROTOCOLS. De opbouw zelf staat als pure functie in pidlane-data.js zodat
  // test-protocolkeuze.js hem zonder DOM kan toetsen.
  discoveredNetworks = (typeof plProtocolLijst==='function')
    ? plProtocolLijst(_gedetecteerdProtocol)
    : (_gedetecteerdProtocol ? [Object.assign({auto:true},_gedetecteerdProtocol)] : []);
  if(discoveredNetworks.length<=1 && _gedetecteerdProtocol)
    btDiag('PROTOCOLS-tabel ontbreekt — alleen het gedetecteerde protocol is kiesbaar','warn');
  renderNetworkCards();
}

function renderNetworkCards(){
  // 26-08-2026 — GEEN AUTOMATISCHE DOORSTAP MEER. Hier stond: bij precies één
  // netwerk niet laten kiezen maar na 1,5 s vanzelf startDiscovery() aanroepen.
  // Omdat scanNetworks() er altijd precies één in de lijst zette, kwam de
  // gebruiker dus nooit aan een keuze toe — het protocol was al vergrendeld
  // (ATSP) voor je het scherm had gelezen, en zat de detectie ernaast dan was
  // de enige uitweg opnieuw beginnen. De adapter doet nog steeds het voorwerk
  // en zijn vondst staat bovenaan en voorgeselecteerd; de bevestiging is nu
  // van de gebruiker.
  const auto=discoveredNetworks.filter(function(n){ return n.auto; });
  const heeftAuto=auto.length>0;

  document.getElementById('step2Title').textContent=
    !discoveredNetworks.length ? 'Geen protocol gevonden' :
    heeftAuto ? 'Protocol herkend' : 'Kies het protocol handmatig';
  document.getElementById('step2Sub').textContent=
    !discoveredNetworks.length ? 'Controleer verbinding en contact' :
    heeftAuto ? 'Bevestig de herkenning, of kies zelf een ander protocol'
              // Mislukte detectie komt meestal doordat het contact uit staat.
              // Handmatig kiezen kan, maar is zelden wat je nodig hebt — dus
              // eerst die hint, dan pas de lijst.
              : 'Meestal staat het contact uit. Zet het aan en scan opnieuw, of kies zelf een protocol';

  const list=document.getElementById('networkList');
  list.innerHTML='';

  if(discoveredNetworks.length===0){
    list.innerHTML=`
      <div style="text-align:center;padding:14px;font-size:13px;color:var(--rd)">
        ⚠ Geen protocol gevonden.<br>
        <small style="color:var(--tx3)">Controleer of contact aan staat en adapter goed zit.</small>
      </div>`;
    document.getElementById('connActions').innerHTML=`
      <button class="mbtn p" onclick="scanNetworks()">🔄 Opnieuw scannen</button>
      <button class="mbtn s" onclick="resetToStep1()">↺ Terug</button>`;
    return;
  }

  // Kopje boven het handmatige deel, zodat "herkend" en "zelf kiezen" niet als
  // één ononderscheiden rij kaarten lezen.
  let kopjeGezet=false;
  discoveredNetworks.forEach((net,i)=>{
    if(net.handmatig&&!kopjeGezet){
      kopjeGezet=true;
      const kop=document.createElement('div');
      kop.style.cssText='font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--tx3);margin:10px 0 2px';
      kop.textContent=heeftAuto?'Of kies handmatig':'Beschikbare protocollen';
      list.appendChild(kop);
    }
    const card=document.createElement('div');
    card.className='network-card'+(i===0?' sel':'');
    card.id='ncard-'+i;
    const badge=net.auto
      ? '<div class="network-badge nb-ok">Herkend</div>'
      : '<div class="network-badge" style="background:var(--sur);color:var(--tx3)">Handmatig</div>';
    card.innerHTML=`
      <div class="network-icon">${net.icon}</div>
      <div style="flex:1;min-width:0">
        <div class="network-name">${net.name}</div>
        <div class="network-desc">${net.desc}</div>
      </div>
      ${badge}`;
    card.onclick=()=>{
      document.querySelectorAll('.network-card').forEach(c=>c.classList.remove('sel'));
      card.classList.add('sel');
      selectedNetwork=net;
      updateNetworkBtn(net);
    };
    list.appendChild(card);
  });

  // Het gedetecteerde protocol staat vooraan en is de voorselectie; zonder
  // detectie is dat de eerste uit PROTOCOLS (CAN 11-bit 500k).
  selectedNetwork=discoveredNetworks[0];
  updateNetworkBtn(selectedNetwork);
}

function updateNetworkBtn(net){
  const handmatig=net&&net.handmatig;
  const kiesKnop=`<button class="mbtn ${_gedetecteerdProtocol?'p':'s'}" onclick="startDiscovery()">${handmatig?'⚙ Forceer':'✓ Gebruik'}: ${String(net.name||'').slice(0,28)}</button>`;
  const scanKnop=`<button class="mbtn ${_gedetecteerdProtocol?'s':'p'}" onclick="scanNetworks()">🔄 Opnieuw scannen</button>`;
  // Herkende de adapter niets, dan is opnieuw scannen (na het contact aanzetten)
  // vrijwel altijd het juiste vervolg en handmatig forceren de uitzondering.
  // Dan staat die knop dus vooraan, en niet andersom.
  document.getElementById('connActions').innerHTML=
    _gedetecteerdProtocol ? kiesKnop+scanKnop : scanKnop+kiesKnop;
}

function resetToStep1(){
  // Terug naar het begin betekent ook: de kentekenpoort weer scherp. Een
  // volgende verbinding kan een andere auto zijn.
  kentPoortReset();
  const _sk=document.getElementById('stepKent'); if(_sk) _sk.style.display='none';
  document.getElementById('step1').style.display='';
  document.getElementById('step2').style.display='none';
  document.getElementById('step3').style.display='none';
  document.getElementById('connActions').innerHTML=`
    <button class="mbtn p" id="btnConnect">📡 Verbinden via Bluetooth</button>
    <button class="mbtn s" id="btnDemo">▷ Demo modus (zonder adapter)</button>`;
  // Scoped bedraden: er bestaat óók een #btnConnect/#btnDemo op de hub
  // (dubbele id) — getElementById pakt de eerste en liet deze knoppen dood.
  const _ca=document.getElementById('connActions');
  _ca.querySelector('#btnConnect').onclick=()=>connectSerial();
  _ca.querySelector('#btnDemo').onclick=()=>startDemo();
}

// ── STAP 3: PID DISCOVERY + VIN ──
async function startDiscovery(){
  const net=selectedNetwork;
  btDiag(`Discovery start — spp=${!!window._sppConn} demo=${demoMode} connected=${connected} net=${net?.id}`,'info');

  // Zelfherstel: verbinding weg (bijv. via Verbreken-knop)? Automatisch
  // herverbinden op het opgeslagen adres en ELM opnieuw initialiseren.
  if(!window._sppConn&&!window._bleConn&&!window._webBtWrite&&!window._webSerialWrite&&!demoMode){
    btDiag('Geen actieve verbinding bij discovery — automatisch herverbinden...','warn');
    const spp=getSPP();
    const sa=localStorage.getItem('spp_address');
    if(spp&&sa){
      try{
        window._btGen=(window._btGen||0)+1;
        await spp.connect({address:sa});
        window._sppConn={spp,address:sa,name:localStorage.getItem('spp_name')||'OBDLink'};
        connected=true; demoMode=false;
        setConn(true);
        btDiag('Herverbonden ✓ — ELM opnieuw initialiseren','ok');
        await initELM327();
      }catch(e){
        btDiag('Automatisch herverbinden mislukt: '+e.message,'err');
        document.getElementById('step3Msg').textContent='Geen verbinding — verbind opnieuw';
        return;
      }
    } else {
      btDiag('Geen opgeslagen adapter-adres — verbind eerst opnieuw','err');
      return;
    }
  }
  document.getElementById('step1').style.display='none';
  document.getElementById('step2').style.display='none';
  document.getElementById('step3').style.display='';
  document.getElementById('connActions').innerHTML='';
  document.getElementById('step3Msg').textContent=`Netwerk: ${net.name}`;

  const prog=document.getElementById('step3Progress');
  prog.innerHTML='';
  const addProg=(icon,msg)=>{
    const el=document.createElement('div');
    el.className='step-prog';
    el.innerHTML=`<span class="sp-icon">${icon}</span><span>${msg}</span>`;
    prog.appendChild(el);
    prog.scrollTop=prog.scrollHeight;
  };

  // Stel protocol in
  const protoId=net.id==='?'?'0':net.id;
  await sendCmd('ATSP'+protoId);
  await delay(200);
  _onthoudProtocol(protoId);   // herverbindpad kan hier straks op terugvallen
  addProg('✅',`Protocol ingesteld: ${net.name}`);

  // VIN uitlezen
  addProg('🔍','VIN uitlezen...');
  const vinInfo=await tryReadVIN();
  if(vinInfo?.vin){
    addProg('✅',`VIN: ${vinInfo.vin}`);
    if(vinInfo.merk) addProg('🚗',`${vinInfo.merk}${vinInfo.year?' '+vinInfo.year:''}`);
  } else {
    addProg('⚠️','VIN niet beschikbaar (wordt overgeslagen)');
  }

  // ── PID DISCOVERY met fallback strategie ──
  // Gebaseerd op PiOBDII aanpak: per lijn strippen, chained discovery
  supportedPIDs=new Set();
  discoveredPIDDefs=[];

  // ── IDEE 1: bekend voertuig? Laad PID-profiel en sla discovery over ──
  const knownVin = vinInfo?.vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(vinInfo.vin);
  let usedProfile=false;
  if(knownVin && applyVinProfileIfKnown(vinInfo.vin)){
    addProg('⚡',`Bekend voertuig — ${supportedPIDs.size} PIDs uit profiel (snelle start)`);
    usedProfile=true;
    // Het profiel wordt hier NIET blind vertrouwd. Zie profielTegenSteunbits()
    // in pidlane-rijsituatie.js: op 18-08 bleken 7 van de 62 PIDs in dit
    // profiel door de ECU ontkend te worden, en die stonden er al maanden in.
    // Vier verzoeken, dus de snelle start blijft snel.
    try{
      const weg=await profielTegenSteunbits();
      if(weg) addProg('🧹',`${weg} sensoren verwijderd die deze auto niet ondersteunt`);
    }catch(e){ btDiag('Steunbitcontrole overgeslagen: '+(e.message||e),'warn'); }
  } else {
    addProg('🔍','PIDs ophalen (0100, 0120, 0140...)');
    // Stap 1: probeer discovery via bitmap methode
    await discoverPIDsBitmap();

    // Stap 2: als geen PIDs gevonden → probeer directe PID polling (fallback)
    if(supportedPIDs.size===0){
      addProg('⚠️','Bitmap methode gaf 0 PIDs — directe poll fallback');
      btDiag('PID bitmap leeg — directe poll proberen','warn');
      await discoverPIDsDirect();
    }

    // Stap 3: als nog steeds leeg → gebruik ingebouwde standaard set
    if(supportedPIDs.size===0){
      addProg('⚠️','Geen PIDs via polling — standaard set laden');
      btDiag('Geen PIDs gevonden — standaard set gebruiken','warn');
      loadDefaultPIDs();
    }
  }

  addProg('✅',`${supportedPIDs.size} PIDs gevonden`);
  buildDiscoveredPIDList();
  addProg('✅',`${discoveredPIDDefs.length} sensoren beschikbaar`);

  // Voertuiggegevens (merk/model/brandstof/motor uit VIN+NHTSA) nu al vastleggen,
  // zódat de gezondheidsscan hieronder het brandstoftype kent en diesel/SCR- of
  // turbo-fantoomsensoren correct kan wegfilteren op een benzineauto.
  // De lookup die hier eventueel start, moet klaar zijn vóór saveVinProfile()
  // verderop. Zie de uitleg bij updateVehicleCard().
  const _rdwBezig = updateVehicleCard(vinInfo);

  // Brandstoftype vaststellen vóórdat de gate erop gaat beslissen. Zie
  // brandstofPoort() in pidlane-voertuigdata.js: eerst kijken of het al
  // bekend is, dan de auto zelf vragen (0151), en pas als laatste de
  // gebruiker om een kenteken. Stond dit er niet, dan draaide de scan
  // hieronder blind en werd het kenteken pas in de wizard gevraagd —
  // ruim ná de beslissingen die het had moeten sturen.
  try{
    if(typeof brandstofPoort === 'function'){
      const bp = await brandstofPoort();
      if(bp && bp.type && bp.type !== 'onbekend') addProg('⛽', `Brandstof: ${bp.type} (${bp.bron})`);
      else addProg('⚠️', 'Brandstoftype onbekend — sommige sensoren zijn niet te filteren');
    }
  }catch(e){ btDiag('Brandstofpoort overgeslagen: '+(e.message||e), 'warn'); }

  // Eerste gezondheidsscan: lees elke PID 1x en beoordeel of die gezond/bij
  // de auto hoort. Ongezonde/dode PIDs worden in de lijst uitgegrijsd.
  //
  // BEKEND VOERTUIG → EERST VRAGEN (2026-08-02)
  // Bij een profiel-start weten we het antwoord al: het oordeel van de vorige
  // keer zit in het profiel. De scan opnieuw draaien kost 30-60s zware bus
  // voor informatie die er al is. Toch niet stilzwijgend overslaan — na een
  // reparatie of een nieuwe sensor wil je juist wél verse meting. Dus vragen.
  // Geen profiel-health beschikbaar (oud profiel van vóór deze wijziging) →
  // gewoon scannen, geen vraag.
  let _slaScanOver=false;
  const _ph=(typeof profielHealth==='function')?profielHealth():null;
  if(usedProfile && _ph && Object.keys(_ph).length && typeof plBevestig==='function' && !demoMode){
    try{
      _slaScanOver = await plBevestig(
        `Dit voertuig is bekend en ${supportedPIDs.size} sensoren zijn al eerder beoordeeld.\n\nDe gezondheidscheck opnieuw draaien duurt ongeveer een halve minuut met zware busbelasting. Overslaan?`,
        'Overslaan', 'Toch scannen', '⚡ Voertuig bekend');
    }catch(e){ _slaScanOver=false; }
  }

  if(_slaScanOver && typeof healthUitProfiel==='function' && healthUitProfiel(_ph)){
    addProg('⚡','Gezondheidscheck overgeslagen — oordeel uit profiel');
  } else {
    // ✕ in de pill breekt de scan af; de flow loopt daarna gewoon door.
    try{showBusyPill('⚡ Hoge busactiviteit — sensoren en voertuig in kaart brengen…',60000,
      ()=>{ try{ healthScanAfbreken(); }
            catch(_){ btDiag('Gezondheidsscan afbreken mislukt: '+(_.message||_),'warn'); } });}
    catch(_){ btDiag('Afbreekknop tonen mislukt: '+(_.message||_),'warn'); }
    await initialHealthScan();
    try{ hideBusyPill(); }
    catch(_){ console.warn('hideBusyPill mislukt: '+(_.message||_)); }
  }

  // Connectie-snelheid meten en strategie STIL toepassen (geen popup hier).
  // De strategie-keuze komt pas later in de wizard (na PID-verbetering),
  // niet als losse popup vóór de wizard opent.
  try{
    const _sp=await measureConnSpeed(demoMode?0:6);
    if(_sp) applyStrategy(suggestStrategy(_sp));
  }catch(e){ btDiag('Snelheidsmeting overgeslagen: '+e.message,'warn'); }

  // ── IDEE 1: nieuw voertuig met verse discovery? Profiel opslaan ──
  // Ook opslaan als we WEL van een profiel startten maar de gebruiker de
  // gezondheidscheck toch liet draaien: dan is er een vers oordeel dat het
  // oude in het profiel hoort te vervangen. Zonder deze tweede voorwaarde
  // bleef een profiel na de allereerste scan voor altijd bevroren.
  /* ── Eerst de RDW-opzoeking afmaken, dan pas opslaan ────────────────
     Wachten kost tijd op het verbindscherm, maar een profiel dat halverwege
     een lookup wordt weggeschreven is maanden fout gebleven zonder dat
     iemand het zag. Liever een paar seconden langer.

     Twaalf seconden is de grens. Daarna is er geen internet of ligt de
     RDW-dienst plat, en dan is doorgaan beter dan blijven staan — maar
     opslaan doen we dán niet: het profiel zou merk, model en brandstof
     missen en dat blijft hangen tot de volgende volle discovery. Er komt
     een aandachtspunt in het voertuigdossier zodat het terug te vinden is.  */
  let _rdwOk = true;
  if(_rdwBezig && typeof _rdwBezig.then === 'function'){
    try{
      const _r = await Promise.race([
        _rdwBezig,
        new Promise(res => setTimeout(() => res({ok:false, reason:'timeout'}), 12000))
      ]);
      _rdwOk = !(_r && _r.ok === false);
      if(!_rdwOk) btDiag('RDW-opzoeking mislukt ('+((_r&&_r.reason)||'onbekend')+') — voertuigprofiel NIET opgeslagen','warn');
    }catch(e){
      _rdwOk = false;
      btDiag('RDW-opzoeking klapte: '+(e.message||e)+' — voertuigprofiel NIET opgeslagen','warn');
    }
  }

  if(!_rdwOk){
    try{
      if(typeof plVoertuigLet==='function')
        plVoertuigLet('rdw', 'De kentekenopzoeking lukte niet bij het verbinden. Merk, model en brandstof kunnen onvolledig zijn, en het voertuigprofiel is daarom niet opgeslagen. Vul het kenteken opnieuw in als je online bent.');
    }catch(e){ btDiag('aandachtspunt zetten mislukt: '+(e.message||e),'warn'); }
  } else {
    try{ if(typeof plVoertuigLet==='function') plVoertuigLet('rdw', null); }
    catch(e){ console.warn('Aandachtspunt opheffen mislukt: '+(e.message||e)); }
  }

  if(knownVin && supportedPIDs.size>0 && _rdwOk && (!usedProfile || !_slaScanOver)) saveVinProfile(vinInfo.vin);
  // Nieuwe sessie-stats beginnen
  _sessionStats={};

  await delay(600);

  // Sluit verbind-modal, open wizard
  document.getElementById('connOv').classList.add('hidden');
  resetToStep1();
  setConn(true);
  startPoll();
  // Open de verbinding-wizard (toont stap-voor-stap wat er gevonden is)
  wizShow();
  log(`Verbinding compleet — ${discoveredPIDDefs.length} PIDs beschikbaar`,'ok');
  showWelcome(vehicleInfo&&vehicleInfo.merk?vehicleInfo:null);  // land op de hub, niet op live view
  // Fabrikant-PIDs (mode 21) staan niet in de mode-01 bitmap en kunnen dus
  // alleen gevonden worden door ze te vragen. Bewust NA showWelcome en zonder
  // await: de probe claimt zelf het busslot en mag de verbindingsflow niet
  // ophouden. Zie pidlane-uitgebreid.js.
  // Dit is de aanroep die maandenlang stil kon falen: PLAN.md punt 4 stond
  // op "mode 21 wordt nergens opgevraagd" terwijl het hier gebeurde, in een
  // lege catch.
  try{ if(typeof probeUitgebreid==='function') probeUitgebreid(); }
  catch(e){ btDiag('probeUitgebreid mislukt — uitgebreide PIDs (mode 21/22) niet onderzocht: '+(e.message||e),'warn'); }
}

// ── VOERTUIGKAART LINKS BOVENIN ──
function updateVehicleCard(vinInfo){
  // Basis-object; velden worden via de merge-laag (bronprioriteit) gevuld,
  // zodat een latere RDW-lookup ze netjes kan verrijken i.p.v. botsen.
  //
  // De voorwaarde was `vehicleInfo.vin===(vinInfo?.vin||'')`: alles weggooien
  // zodra de binnenkomende VIN niet gelijk was aan wat er stond. Een LEGE oude
  // VIN telde daarbij als ongelijk, dus het lezen van de VIN wiste op dat
  // moment alles wat er al bekend was. Zolang de VIN het eerste was wat de app
  // over een auto wist, viel dat niet op; met de kentekenstap vóór de
  // protocolscan staat er dan al RDW-data (merk, model, jaar, brandstof) en die
  // is sterker dan wat de VIN oplevert. Zie plAnderVoertuig().
  const _anderVoertuig = (typeof plAnderVoertuig==='function')
    ? plAnderVoertuig(vehicleInfo && vehicleInfo.vin, vinInfo?.vin)
    : !(vehicleInfo && vehicleInfo.vin===(vinInfo?.vin||''));
  if(!vehicleInfo || _anderVoertuig){
    vehicleInfo = { merk: 'Onbekend', model:'', year:'', vin:'', brandstof:'', motor:'' };
    // Ander voertuig → ook de bron-rangen leeg, anders houdt een veld de rang
    // van de vórige auto vast en weigert het de nieuwe (zwakkere) bron.
    try{ resetVehicleSources(); }catch(e){ /* stil: module kan ontbreken in een deelbuild */ }
  }
  vehicleInfo.vin = vinInfo?.vin || vehicleInfo.vin || '';
  // vinInfo bevat reeds ge-merancte data uit tryReadVIN; hier alleen aanvullen
  // voor het geval updateVehicleCard los wordt aangeroepen.
  if(vinInfo){ mergeVehicleData('vin', vinInfo); }
  showVtag(vehicleInfo.vin||vehicleInfo.merk||'Verbonden');
  const card=document.getElementById('vehicleCard');
  const savedKent=localStorage.getItem('pl_kenteken')||'';
  const vinValid=/^[A-HJ-NPR-Z0-9]{17}$/.test(vehicleInfo.vin||'');
  if(!vinValid) vehicleInfo.vin='';
  card.innerHTML=`
    <div style="display:flex;flex-direction:column;gap:3px;">
      <div class="vic-row"><span class="vic-label">Merk</span><span class="vic-val" id="vicMerk">${vehicleInfo.merk}${vehicleInfo.model?' '+vehicleInfo.model:''}</span></div>
      ${vehicleInfo.year?`<div class="vic-row"><span class="vic-label">Jaar</span><span class="vic-val">${vehicleInfo.year}</span></div>`:''}
      <div class="vic-row"><span class="vic-label">PIDs</span><span class="vic-val">${supportedPIDs.size} beschikbaar</span></div>
      ${vehicleInfo.vin?`<div class="vic-vin" style="opacity:.85">VIN: ${vehicleInfo.vin}</div>`:''}
      <div id="kentWrap" style="display:block">
        <div style="display:flex;gap:4px;margin-top:6px;align-items:center">
          <input id="kentInput" placeholder="Kenteken" value="${savedKent}" maxlength="8"
            onkeydown="if(event.key==='Enter')rdwLookup(true)"
            style="flex:1;min-width:0;padding:5px 7px;border-radius:6px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-size:12px;text-transform:uppercase">
          <button onclick="rdwLookup(true)" style="padding:5px 9px;border-radius:6px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">🇳🇱 RDW</button>
        </div>
        <div id="kentStatus" style="font-size:12px;color:var(--tx3)"></div>
        <div style="font-size:11px;color:var(--tx3);margin-top:2px">Vul kenteken in voor merk, model en bouwjaar via RDW</div>
      </div>
    </div>`;
  // Opgeslagen kenteken? Direct automatisch opzoeken (ook bij geldige VIN,
  // om merk/model/jaar aan te vullen die de VIN-decoder niet kon bepalen).
  //
  // De Promise wordt TERUGGEGEVEN, sinds 21-08-2026. Tot die dag liep deze
  // aanroep los: rdwLookup() is async en niemand wachtte erop. Gevolg was een
  // race met saveVinProfile() verderop in initConnection — de preset kon
  // supportedPIDs bijwerken vlak vóór het opslaan, en zo kwamen er zeven PIDs
  // in het profiel die de ECU ontkent. Die stonden er maanden in.
  // Aanroepers die niets met de Promise doen (btflow, demo) merken er niets
  // van; initConnection wacht er nu wél op.
  if(savedKent && (!vehicleInfo.vin || !vehicleInfo.model)) return rdwLookup();
  return null;
}

// VIN-regel aangetikt → kenteken-invoer tonen/verbergen

// RDW open data: voertuiggegevens op Nederlands kenteken (gratis, geen key)
// `opties` (26-08-2026) laat een aanroeper het kenteken en het meldingsvakje
// meegeven in plaats van ze uit #kentInput/#kentStatus te lezen. Dat is er
// bijgekomen voor de kentekenstap in de verbindwizard, die zijn eigen invoer
// heeft. BEWUST géén tweede element met id 'kentInput': dat is precies de fout
// die pidlane-motortype.js documenteert ("stap 4 vroeg het kenteken in een
// tweede invoerveld, naast kentInput"). Eén veld per plek, één functie die het
// opzoekwerk doet. Zonder opties gedraagt hij zich exact als voorheen.
async function rdwLookup(showOverview, opties){
  const inp=document.getElementById('kentInput');
  const st=(opties&&opties.statusEl)||document.getElementById('kentStatus');
  const ruw=(opties&&opties.kenteken!==undefined&&opties.kenteken!==null)
    ? opties.kenteken
    : (inp?inp.value:null);
  if(ruw===null||ruw===undefined) return {ok:false,reason:'no-input'};
  const kent=String(ruw).replace(/[\s-]/g,'').toUpperCase();
  if(kent.length<4){ if(st) st.textContent='Voer een geldig kenteken in (minimaal 4 tekens)'; return {ok:false,reason:'invalid'}; }
  if(st) st.textContent='RDW opzoeken...';
  try{
    const r=await fetch(PROXY_URL+'/proxy?url='+encodeURIComponent(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${encodeURIComponent(kent)}`),{headers:{'X-App-Token':APP_TOKEN}});
    if(!r.ok){ if(st) st.textContent='RDW antwoordde niet goed — probeer het zo opnieuw'; return {ok:false,reason:'http'}; }
    const data=await r.json();
    if(!data||!data.length){
      if(st) st.textContent=`Kenteken "${kent}" niet gevonden bij de RDW — controleer op een typefout`;
      logUsage('rdw_kwaliteit', 'notfound');
      return {ok:false,reason:'notfound',kent};
    }
    const v=data[0];
    // Valideer alle RDW-velden: onzin (rotzooi-namen, ongeldige data) eruit.
    const val=validateRdwVehicle(v);
    const f=val.velden;
    // Via centrale merge: RDW heeft hoogste prioriteit voor merk/jaar, maar
    // overschrijft nooit met leegte en normaliseert (MAZDA -> Mazda).
    mergeVehicleData('rdw', { merk:f.merk, model:f.model, year:f.year });
    // Brandstof staat in een APARTE RDW-tabel (8ys7-d773), niet in m9d7-ebf2.
    // Zonder deze call blijft brandstof leeg -> 'diesel bij benzine' + verkeerde kenteken-info.
    try{
      const rb=await fetch(PROXY_URL+'/proxy?url='+encodeURIComponent(`https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=${encodeURIComponent(kent)}`),{headers:{'X-App-Token':APP_TOKEN}});
      if(rb.ok){
        const bd=await rb.json();
        if(Array.isArray(bd)&&bd.length){
          const oms=bd.map(x=>String(x.brandstof_omschrijving||'').trim()).filter(Boolean);
          if(oms.length){
            const low=oms.join('+').toLowerCase();
            let bf='';
            if(oms.length>1 && /elektric/.test(low) && /(benzine|diesel)/.test(low)) bf='hybride';
            else if(/diesel/.test(low)) bf='diesel';
            else if(/benzine/.test(low)) bf='benzine';
            else if(/elektric/.test(low)) bf='elektrisch';
            else if(/lpg|cng|aardgas|waterstof/.test(low)) bf='lpg';
            else bf=oms[0].toLowerCase();
            if(bf){ mergeVehicleData('rdw', { brandstof:bf }); try{ log('RDW brandstof: '+vehicleInfo.brandstof,'info'); }catch(_){ /* stil: melding mag nooit de stroom breken */ } }
          }
        }
      }
    }catch(e){ try{ log('RDW brandstof-ophalen mislukt: '+(e.message||e),'warn'); }catch(_){ /* stil: melding mag nooit de stroom breken */ } }
    const jaar=f.year||vehicleInfo.year||'';
    // f komt uit de RDW-tabel m9d7-ebf2 en bevat GEEN brandstof — die staat in
    // 8ys7-d773 en is hierboven al via mergeVehicleData gezet. f.brandstof was
    // dus altijd leeg, waardoor het log "brandstof:?" meldde terwijl het veld
    // wél goed stond. Op de rit van 16-08 leek dat op een niet-gevulde
    // brandstof; het was alleen de logregel. Nu uit de echte bron lezen.
    const brandstof=vehicleInfo.brandstof||f.brandstof||'';
    localStorage.setItem('pl_kenteken',kent);
    // PLRecall haakt hierop in en haalt de terugroepdetails op (welke actie,
    // welk risico, welke status) bovenop de ja/nee-vlag die we al hadden.
    try{ window.dispatchEvent(new CustomEvent('pl:kenteken-geladen',{detail:{kenteken:kent}})); }catch(e){ /* stil: element kan weg zijn */ }
    // Sla ook gevalideerde extra RDW velden op voor Koopcheck/rapport
    _koopRdwData = { ...v, _kent: kent, _val: val };
    // Prefill Koopcheck kenteken input
    const ki = document.getElementById('koopKentInput');
    if(ki && !ki.value) ki.value = kent;
    // handmatige invoer blijft leidend
    try{ loadUserVehicleData(); applyUserOverrides(); }
    catch(e){ btDiag('Handmatige voertuiginvoer toepassen mislukt — RDW-gegevens kunnen jouw invoer overschrijven: '+(e.message||e),'warn'); }
    const naam=`${vehicleInfo.merk||''} ${vehicleInfo.model||''}`.trim()||'Voertuig';
    const merkEl=document.getElementById('vicMerk');
    if(merkEl) merkEl.textContent=naam;
    // Statusregel + eventuele waarschuwing over weggelaten velden
    let stTxt=`✓ ${naam}${jaar?' ('+jaar+')':''}${f.kleur?' — '+f.kleur:''}`.trim();
    if(val.weggelaten.length){
      stTxt+=`  ·  ⚠️ ${val.weggelaten.length} veld(en) door RDW onbetrouwbaar — weggelaten`;
    }
    if(st) st.textContent=stTxt;
    showVtag(naam);
    log(`RDW: ${naam} ${jaar} brandstof:${brandstof||'?'} (${kent})`,'ok');
    if(val.weggelaten.length){
      val.weggelaten.forEach(w=>log(`RDW weggelaten — ${w.label}: ${w.reden}`,'warn'));
    }
    // Geen kenteken in dit usage-event — alleen een merk/model-trend (AVG).
    // Let op: logToSheets() hangt er zelf nog kolommen aan (Merk, Year, VIN,
    // User). Die VIN is sinds 27-08-2026 een pseudoniem, geen ruw nummer —
    // zie _plVinVoorLog() in pidlane-auth.js. Dit commentaar beweerde tot
    // die datum dat er niets herleidbaars meeging, en dat was onjuist.
    logUsage('rdw_kwaliteit', `${vehicleInfo.merk||'?'} ${vehicleInfo.model||''} ${jaar||'?'} brandstof=${brandstof||'?'} weggelaten=${val.weggelaten.length}`);
    // Pas voertuig-specifieke PID-preset toe als verbinding al actief is
    // kenteken gewijzigd → scenario-PIDs verversen
    try{ scenarioRefreshIfOpen(); }
    catch(e){ btDiag('Scenario verversen na kentekenwijziging mislukt: '+(e.message||e),'warn'); }
    if(demoMode){
      // In demo: herbouw de PID-lijst naar het RDW-brandstoftype, zodat de
      // simulatie (verbranding vs EV) klopt met het ingevoerde kenteken.
      try{
        const pids=demoPIDsForFuel(brandstof||vehicleInfo.brandstof);
        supportedPIDs=new Set(pids);
        activePIDs.clear(); manualPIDs.clear();
        pids.slice(0,16).forEach(p=>{ activePIDs.add(p); manualPIDs.add(p); });
        buildDiscoveredPIDList(); buildPIDList();
        const c=document.getElementById('pidCnt'); if(c) c.textContent=discoveredPIDDefs.length;
        renderGauges(); rebuildGSel(); startPoll(); initialHealthScan(); renderDemoBar();
        log('Demo: PID-lijst herbouwd naar '+(brandstof||'?')+' ('+pids.length+' PIDs)','ok');
      }catch(e){ console.warn('Demo: PID-lijst herbouwen mislukt: '+(e.message||e)); }
    } else if(connected && vehicleInfo.merk){
      applyVehiclePIDPreset(vehicleInfo.merk, brandstof, jaar);
    }
    // overzicht van alle bekende data + aanvullen
    try{ if(showOverview) openVehicleOverview(); }
    catch(e){ btDiag('Voertuigoverzicht openen mislukt: '+(e.message||e),'warn'); }
    return {ok:true,kent,v,val};
  }catch(e){
    if(st) st.textContent='RDW tijdelijk niet bereikbaar — controleer je internet en probeer opnieuw';
    return {ok:false,reason:'network',error:e.message};
  }
}

function getVehicle(){
  return vehicleInfo;
}

// ── VIN UITLEZEN EN DECODEREN ──
async function tryReadVIN(){
  // Multi-frame ISO-TP respons → VIN. Per REGEL parsen: het CAN-header (7E8)
  // is 3 hex-tekens (oneven!) waardoor naïef aan elkaar plakken alle
  // byte-paren laat verschuiven — dát produceerde eerder de garbage-VINs.
  const extractVIN=(raw)=>{
    if(!raw||raw.includes('NO DATA')||raw.includes('ERROR')) return null;
    // ── Frames scheiden (fase 4-fix) ───────────────────────────────
    // De vorige versie splitste alleen op regeleindes. Deze adapter levert
    // een multiframe-respons echter op ÉÉN regel — net als bij de batch-
    // parser. Gevolg: alleen de EERSTE CAN-header werd gestript en de
    // headers van frame 2 en 3 bleven midden in de bytestroom staan, wat
    // een onleesbare VIN opleverde. Beide vormen komen voor:
    //   "7E8 10 14 4902.. 7E8 21 .. 7E8 22 .."   (headers aan)
    //   "014 0:4902.. 1:.. 2:.."                 (framemarkers)
    const frames=[];
    for(const line of String(raw).split(/[\r\n]+/)){
      if(!line.trim()) continue;
      if(/[0-9A-Fa-f]\s*:/.test(line)){          // framemarkers: deel 0 = lengte
        const d=line.split(/[0-9A-Fa-f]\s*:/);
        for(let k=1;k<d.length;k++) frames.push(d[k]);
        continue;
      }
      const plat=line.replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
      if(!plat) continue;
      if((plat.match(/7E[89A-F]/g)||[]).length>1)
        frames.push(...plat.split(/(?=7E[89A-F])/).filter(Boolean));
      else if((plat.match(/18DA/g)||[]).length>1)
        frames.push(...plat.split(/(?=18DA)/).filter(Boolean));
      else frames.push(plat);
    }
    let vin='';
    for(const frame of frames){
      let hex=frame.replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
      if(!hex) continue;
      // CAN-header strippen: 11-bit (7E8/7E9... = 3 tekens) of 29-bit (18DAF1xx = 8)
      if(/^18DA/.test(hex)) hex=hex.slice(8);
      else if(/^7E[89A-F]/.test(hex)) hex=hex.slice(3);
      // ISO-TP PCI strippen: First Frame (1x xx) = 4 tekens, Consecutive (2x) = 2
      if(/^1[0-9A-F]/.test(hex)) hex=hex.slice(4);
      else if(/^2[0-9A-F]/.test(hex)) hex=hex.slice(2);
      // Respons-markers strippen: mode 09 (4902 + telbyte) of UDS (62F190)
      if(hex.startsWith('4902')) hex=hex.slice(4);
      if(hex.startsWith('62F190')) hex=hex.slice(6);
      if(/^0[0-9A-F]/.test(hex)&&vin==='') hex=hex.slice(2); // telbyte na 4902
      for(let i=0;i+2<=hex.length;i+=2){
        const c=parseInt(hex.slice(i,i+2),16);
        if(c>=32&&c<=126) vin+=String.fromCharCode(c);
      }
    }
    vin=vin.replace(/[^A-HJ-NPR-Z0-9]/g,'').slice(0,17);
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin)?vin:null;
  };

  let vin=null;
  const ruw={};        // ruwe antwoorden bewaren voor diagnose bij mislukking
  try{
    await sendCmd('ATH1');

    // Poging 1: standaard mode 09 via broadcast (7DF)
    ruw['0902 broadcast']=await sendCmd('0902',4000);
    vin=extractVIN(ruw['0902 broadcast']);
    if(vin) btDiag('VIN via standaard 0902 ✓','ok');

    // Poging 2: zelfde verzoek maar rechtstreeks aan de motor-ECU (7E0).
    // Sommige ECU's (o.a. Mazda) vullen de VIN alleen bij fysieke adressering.
    if(!vin){
      btDiag('VIN leeg via broadcast — fysiek adres 7E0 proberen','info');
      await sendCmd('ATSH7E0');
      ruw['0902 via 7E0']=await sendCmd('0902',4000);
      vin=extractVIN(ruw['0902 via 7E0']);
      if(vin) btDiag('VIN via 7E0 + 0902 ✓','ok');
    }

    // Poging 3: UDS 22 F190 (ReadDataByIdentifier VIN) — moderne standaard,
    // respons begint met 62F190 gevolgd door 17 ASCII-bytes.
    if(!vin){
      btDiag('VIN via UDS 22F190 proberen','info');
      const r=await sendCmd('22F190',4000);
      ruw['22F190']=r;
      if(r&&r.replace(/[^0-9A-Fa-f]/g,'').includes('62F190')){
        const hex=r.replace(/[^0-9A-Fa-f]/g,'');
        vin=extractVIN(hex.slice(hex.indexOf('62F190')+6));
        if(vin) btDiag('VIN via UDS 22F190 ✓','ok');
      }
    }

    // Adressering en headers altijd netjes herstellen
    await sendCmd('ATSH7DF');
    await sendCmd('ATH0');

    if(!vin){
      log('Geen geldige VIN ontvangen (auto geeft hem niet vrij) — gebruik kenteken/RDW','info');
      // Ruwe antwoorden in de APP-log, niet de BT-log: die rolt binnen een
      // minuut om, waardoor de VIN-poging bij exporteren altijd al weg was en
      // niet te beoordelen viel of de auto zwijgt of de parser faalt.
      try{
        Object.keys(ruw).forEach(k=>{
          const r=String(ruw[k]==null?'':ruw[k]).replace(/\s+/g,' ').trim().slice(0,140);
          log('   VIN-poging ['+k+'] → '+(r||'(leeg)'),'info');
        });
      }catch(e){ /* stil: dit is alleen de logweergave van de ruwe VIN-pogingen */ }
      return null;
    }
    log('VIN: '+vin,'ok');
    // Bron-tracking alleen resetten bij een AANTOONBAAR ander voertuig. Stond
    // hier onvoorwaardelijk: dan verloor een RDW-lookup die vóór de VIN liep
    // (de kentekenstap) zijn rang, en overschreef het zwakkere WMI-merk uit de
    // VIN het sterkere RDW-merk alsnog. Zie plAnderVoertuig().
    if(typeof plAnderVoertuig!=='function' || plAnderVoertuig(vehicleInfo&&vehicleInfo.vin, vin)){
      resetVehicleSources();
    } else if(vehicleInfo && vehicleInfo.merk && vehicleInfo.merk!=='Onbekend'){
      log('   VIN hoort bij de al bekende voertuigdata — bronrangen blijven staan','info');
    }
    const info=decodeVIN(vin);
    mergeVehicleData('vin', info);       // WMI-merk/jaar als basis
    // NHTSA API als merk onbekend — gratis, officieel, 2000+ merken.
    // Haalt naast merk/model/jaar ook brandstoftype en motorgegevens op,
    // zodat PID-filtering en rapporten ook zonder kenteken kloppen.
    if(!info.merk||info.merk==='Onbekend merk'){
      try{
        const resp=await fetch(PROXY_URL+'/proxy?url='+encodeURIComponent(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`),{headers:{'X-App-Token':APP_TOKEN}});
        if(resp.ok){
          const data=await resp.json();
          const get=v=>(data.Results||[]).find(r=>r.Variable===v)?.Value||'';
          const ok=s=>s&&s!=='Not Applicable'&&s!=='Not Available'&&s!=='0';
          const make=get('Make'),model=get('Model'),year=get('Model Year');
          if(ok(make)){
            info.merk=make.charAt(0)+make.slice(1).toLowerCase();
            info.model=model||''; info.year=year||info.year;
            mergeVehicleData('nhtsa', { merk:info.merk, model:info.model, year:info.year });
            log(`NHTSA: ${info.merk} ${info.model} ${info.year}`,'ok');
          }
          // Brandstoftype → normaliseren naar 'benzine'/'diesel' woordkeus
          // die vehicleFuelType() herkent. Alleen vullen als nog leeg.
          const fuel=get('Fuel Type - Primary');
          if(ok(fuel)&&!info.brandstof){
            const f=fuel.toLowerCase();
            if(/diesel/.test(f)) info.brandstof='diesel';
            else if(/gasoline|petrol|flexible|ethanol|e85/.test(f)) info.brandstof='benzine';
            else if(/electric/.test(f)) info.brandstof='elektrisch';
            else info.brandstof=f;
            mergeVehicleData('nhtsa', { brandstof:info.brandstof });
          }
          // Motortype samenstellen: cilinders + cilinderinhoud (L)
          const cyl=get('Engine Number of Cylinders');
          const disp=get('Displacement (L)');
          const cfg=get('Engine Configuration');
          const mp=[];
          if(ok(disp)) mp.push(parseFloat(disp).toFixed(1)+'L');
          if(ok(cyl)) mp.push(cyl+'-cil');
          if(ok(cfg)) mp.push(cfg);
          if(mp.length&&!info.motor){ info.motor=mp.join(' '); mergeVehicleData('nhtsa', { motor:info.motor }); }
          if(info.motor) log(`NHTSA motor: ${info.motor}${info.brandstof?' ('+info.brandstof+')':''}`,'ok');
        }
      }catch(e){ log('NHTSA API offline — lokale VIN database gebruikt','info'); }
    }
    return info;
  }catch(e){ log('VIN fout: '+e.message,'warn'); return null; }
}

// ── CILINDERAANTAL & FANTOOM-MISFIRE GATE ──
// Een cilinderspecifieke misfire-code (ontsteking P030X of injector P020X)
// voor een cilindernummer hoger dan het werkelijke aantal cilinders is fysiek
// onmogelijk (bv. P0306 'cilinder 6' op een 3-cilinder Ford 1.5 EcoBoost).
// Net als _powertrainPhantom() markeren we die als onwaarschijnlijk i.p.v.
// hem als echte storing uit te (laten) leggen.
function vehicleCylinderCount(){
  try{
    const m=String(vehicleInfo?.motor||'').match(/(\d+)\s*-?\s*cil/i);
    if(m) return parseInt(m[1],10);
    const rdw=(typeof _koopRdwData!=='undefined'&&_koopRdwData)?_koopRdwData.aantal_cilinders:null;
    const n=parseInt(rdw,10);
    if(!isNaN(n)&&n>0&&n<=16) return n;
  }catch(e){ /* stil: cilinderaantal is een gok uit losse bronnen, mag ontbreken */ }
  return 0; // onbekend → geen gate
}
function _misfireCylNo(code){
  const m=String(code||'').toUpperCase().match(/^P0([23])(0[1-9]|1[0-6])$/);
  return m?parseInt(m[2],10):0;
}
function _implausibleMisfire(code){
  const cyl=_misfireCylNo(code), total=vehicleCylinderCount();
  return cyl>0 && total>0 && cyl>total;
}
// Zoekt de DTC-omschrijving in drie stappen, in deze volgorde:
//   1. de merkbucket van dít voertuig  (Mazda krijgt Mazda-tekst)
//   2. de generieke tabel              (Mazda krijgt bij P0128 de neutrale tekst)
//   3. een willekeurig ander merk      (behoudt dekking van unieke merkcodes
//      als P2015, met een noot erbij dat de tekst van een ander merk komt)
function _dtcBron(code){
  const merk = (typeof vehicleInfo!=='undefined'&&vehicleInfo) ? vehicleInfo.merk : '';
  const groep = (typeof merkGroep==='function') ? merkGroep(merk) : '';
  const M = (typeof DTC_MERK!=='undefined') ? DTC_MERK : null;
  if(groep&&M&&M[groep]&&M[groep][code]) return {rij:M[groep][code],noot:''};
  if(typeof DTCDB!=='undefined'&&DTCDB[code])   return {rij:DTCDB[code],noot:''};
  if(M){
    for(const g of Object.keys(M)){
      if(M[g][code]){
        const lab=(typeof DTC_MERK_LABEL!=='undefined'&&DTC_MERK_LABEL[g])?DTC_MERK_LABEL[g]:g;
        return {rij:M[g][code],noot:` (tekst van ${lab})`};
      }
    }
  }
  return null;
}
function dtcInfo(code){
  const bron=_dtcBron(code);
  const base=bron
    ? Object.assign({},bron.rij)
    : {desc:'Onbekende code',body:'Raadpleeg fabrikantdocumentatie.',sev:'med'};
  if(bron&&bron.noot) base.desc=base.desc+bron.noot;
  if(_implausibleMisfire(code)){
    const total=vehicleCylinderCount();
    base.desc=base.desc+` — ⚠️ onwaarschijnlijk (voertuig heeft ${total} cilinder(s))`;
    base.body=`Cilindernummer hoger dan het aantal cilinders (${total}). Vrijwel zeker een uitlees-/communicatiefout of restcode, geen echte storing op deze cilinder.`;
    base.sev='warn';
  }
  return base;
}
function formatDtcCodes(arr){
  if(!arr||!arr.length) return 'geen';
  return arr.map(c=>_implausibleMisfire(c)
    ? `${c} (LET OP: voertuig heeft ${vehicleCylinderCount()} cilinders — onwaarschijnlijk, niet als echte cilinderstoring behandelen)`
    : c
  ).join(', ');
}
