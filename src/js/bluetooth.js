// ════════════════════════════════════════
// bluetooth.js — Bluetooth verbinding via Capacitor BLE
// ════════════════════════════════════════

// Vgate MX+ UUIDs
const VGATE_SERVICE  = '0000fff0-0000-1000-8000-00805f9b34fb';
const VGATE_WRITE    = '0000fff2-0000-1000-8000-00805f9b34fb';
const VGATE_NOTIFY   = '0000fff1-0000-1000-8000-00805f9b34fb';

// State
window.btDeviceId   = null;
window.btBuffer     = '';
window.connected    = false;
window.demoMode     = false;
window.selectedNetwork = null;
window.discoveredNetworks = [];
window.supportedPIDs = new Set();
window.discoveredPIDDefs = [];
window.vehicleInfo  = {merk:'',model:'',year:'',vin:''};
window.selectedProto = '0';

const BleClient = () => window.Capacitor?.Plugins?.BluetoothLe;

// ── STAP 1: SCAN & VERBINDEN ──
async function connectBluetooth() {
  const apiVal = document.getElementById('startApiKey')?.value.trim();
  if(apiVal?.startsWith('sk-ant-')) {
    window.anthropicKey = apiVal;
    try { localStorage.setItem('ns_api_key', apiVal); } catch(e) {}
    updateApiPill();
  }

  const ble = BleClient();

  // Capacitor BLE beschikbaar (native APK)
  if(ble) {
    await connectCapacitorBLE(ble);
    return;
  }

  // Fallback: Web Bluetooth (Chrome browser)
  if('bluetooth' in navigator) {
    await connectWebBluetooth();
    return;
  }

  alert('Bluetooth niet beschikbaar.\nGebruik de APK of Chrome browser.\nOf start Demo modus.');
}

// ── CAPACITOR BLE (Native APK — Vgate MX+) ──
async function connectCapacitorBLE(ble) {
  document.getElementById('btnConnect').disabled = true;
  document.getElementById('btnConnect').textContent = '📡 Verbinden...';

  try {
    await ble.initialize();
    log('Bluetooth geïnitialiseerd','info');

    // Scan specifiek voor Vgate MX+ service
    let foundDevice = null;
    await ble.requestLEScan({
      services: [VGATE_SERVICE],
      allowDuplicates: false,
    }, (result) => {
      if(!foundDevice) {
        foundDevice = result.device;
        log(`Gevonden: ${result.device.name || result.device.deviceId}`,'ok');
      }
    });

    // Stop scan na 5 seconden
    await delay(5000);
    await ble.stopLEScan();

    if(!foundDevice) {
      // Probeer zonder filter
      foundDevice = await ble.requestDevice({
        services: [VGATE_SERVICE],
        optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb'],
      });
    }

    if(!foundDevice) throw new Error('Geen OBD2 adapter gevonden. Zet adapter in en probeer opnieuw.');

    window.btDeviceId = foundDevice.deviceId;
    await ble.connect(window.btDeviceId, () => {
      window.connected = false;
      setConn(false);
      log('Bluetooth verbroken','warn');
    });

    log(`Verbonden met ${foundDevice.name || window.btDeviceId}`,'ok');

    // Start notificaties voor inkomende data
    await ble.startNotifications(
      window.btDeviceId,
      VGATE_SERVICE,
      VGATE_NOTIFY,
      (value) => {
        const text = new TextDecoder().decode(value.value);
        window.btBuffer += text;
      }
    );

    window.connected = true;
    window.demoMode = false;
    log('ELM327 initialiseren...','info');
    await initELM327();
    await scanNetworks();

  } catch(e) {
    log('BLE fout: '+e.message,'err');
    document.getElementById('btnConnect').disabled = false;
    document.getElementById('btnConnect').textContent = '📡 Verbinden via Bluetooth';
    showConnError(e.message);
  }
}

// ── WEB BLUETOOTH FALLBACK (Chrome browser) ──
async function connectWebBluetooth() {
  document.getElementById('btnConnect').disabled = true;
  document.getElementById('btnConnect').textContent = '📡 Verbinden...';

  try {
    log('Web Bluetooth scanner starten...','info');

    const device = await navigator.bluetooth.requestDevice({
      filters: [
        {services: [VGATE_SERVICE]},
        {services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2']},
        {namePrefix:'OBDII'},{namePrefix:'OBD2'},{namePrefix:'ELM327'},
        {namePrefix:'Vgate'},{namePrefix:'MX+'},{namePrefix:'iCar'},
        {namePrefix:'EOBD'},{namePrefix:'OBD'},
      ],
      optionalServices: [
        VGATE_SERVICE,
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      ]
    });

    log('Apparaat: '+device.name,'ok');
    const server = await device.gatt.connect();
    log('GATT verbonden','ok');

    // Zoek karakteristieken
    let writeChar = null, notifyChar = null;
    const services = await server.getPrimaryServices();

    for(const svc of services) {
      const chars = await svc.getCharacteristics();
      for(const ch of chars) {
        if(ch.uuid.includes('fff2') || ch.uuid.includes('ffe2')) {
          writeChar = ch;
          log('Write: '+ch.uuid,'ok');
        }
        if(ch.uuid.includes('fff1') || ch.uuid.includes('ffe1')) {
          notifyChar = ch;
          log('Notify: '+ch.uuid,'ok');
        }
        if(!writeChar && (ch.properties.write || ch.properties.writeWithoutResponse)) writeChar = ch;
        if(!notifyChar && (ch.properties.notify || ch.properties.indicate)) notifyChar = ch;
      }
      if(writeChar && notifyChar) break;
    }

    if(!writeChar) throw new Error('Geen write karakteristiek. Controleer of adapter aan staat.');

    // Sla op als globaal voor sendBT
    window._webBtWrite = writeChar;
    window._webBtNotify = notifyChar;

    if(notifyChar) {
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', e => {
        window.btBuffer += new TextDecoder().decode(e.target.value);
      });
      log('Notificaties actief','ok');
    }

    device.addEventListener('gattserverdisconnected', () => {
      window.connected = false;
      setConn(false);
      document.getElementById('vtag').style.display='none';
      log('Bluetooth verbroken','warn');
    });

    window.connected = true;
    window.demoMode = false;
    log('Verbonden met '+device.name,'ok');
    await initELM327();
    await scanNetworks();

  } catch(e) {
    log('Web BT fout: '+e.message,'err');
    document.getElementById('btnConnect').disabled = false;
    document.getElementById('btnConnect').textContent = '📡 Verbinden via Bluetooth';
    showConnError(e.message);
  }
}

// ── STUREN & ONTVANGEN ──
async function sendBT(cmd) {
  window.btBuffer = '';
  const data = new TextEncoder().encode(cmd + '\r');

  try {
    const ble = BleClient();
    if(ble && window.btDeviceId) {
      // Capacitor BLE
      const dataView = new DataView(data.buffer);
      await ble.write(window.btDeviceId, VGATE_SERVICE, VGATE_WRITE, dataView);
    } else if(window._webBtWrite) {
      // Web Bluetooth
      if(window._webBtWrite.properties.writeWithoutResponse) {
        await window._webBtWrite.writeValueWithoutResponse(data);
      } else {
        await window._webBtWrite.writeValue(data);
      }
    }
  } catch(e) {
    log('BT write fout: '+e.message,'err');
    return '';
  }

  // Wacht op respons
  const start = Date.now();
  while(Date.now()-start < 3000) {
    await delay(50);
    if(window.btBuffer.includes('>')) break;
    if(window.btBuffer.length > 0 && Date.now()-start > 800) break;
  }
  return window.btBuffer.trim();
}

async function sendCmd(cmd) {
  if(window.demoMode) return '';
  return await sendBT(cmd);
}

// ── ELM327 INIT ──
async function initELM327() {
  await sendCmd('ATZ');    await delay(600);
  await sendCmd('ATE0');   // echo uit
  await sendCmd('ATL0');   // geen linefeeds
  await sendCmd('ATS0');   // geen spaties
  await sendCmd('ATH0');   // geen headers
  await sendCmd('ATAT1'); // adaptive timing
  await sendCmd('ATST32');// kortere timeout
  await sendCmd('ATD');    // reset buffers
  await sendCmd('ATSP0'); // auto protocol
  log('ELM327 klaar (adaptive timing)','ok');
}

// ── NETWERK SCAN ──
const PROTOCOLS = [
  {id:'6',name:'CAN 11-bit (ISO 15765)',  icon:'📡',desc:'Meeste auto\'s 2008+'},
  {id:'7',name:'CAN 29-bit (ISO 15765)',  icon:'📡',desc:'Sommige CAN varianten'},
  {id:'3',name:'ISO 9141-2',              icon:'📟',desc:'Oudere Europese auto\'s'},
  {id:'4',name:'ISO 14230 KWP (5baud)',   icon:'🔧',desc:'K-Line langzame init'},
  {id:'5',name:'ISO 14230 KWP (fast)',    icon:'🔧',desc:'K-Line snelle init'},
  {id:'1',name:'SAE J1850 PWM',           icon:'🔌',desc:'Oudere Ford modellen'},
  {id:'2',name:'SAE J1850 VPW',           icon:'🔌',desc:'Oudere GM modellen'},
];

async function scanNetworks() {
  showModalStep(2);
  document.getElementById('step2Title').textContent = 'Netwerken scannen...';
  document.getElementById('step2Sub').textContent = 'Even geduld — protocollen worden getest';
  document.getElementById('networkList').innerHTML = '<div class="ai-ld" style="justify-content:center"><div class="spin"></div> Netwerken scannen...</div>';
  document.getElementById('connActions').innerHTML = `<button class="mbtn s" onclick="resetToStep1()">↺ Opnieuw beginnen</button>`;

  window.discoveredNetworks = [];

  // Auto detect eerst
  await sendCmd('ATSP0');
  await delay(400);
  const autoResp = await sendCmd('0100');

  if(autoResp && !autoResp.includes('NO DATA') && !autoResp.includes('UNABLE') && !autoResp.includes('ERROR')) {
    const protoResp = await sendCmd('ATDPN');
    const protoId = protoResp.replace(/[^0-9A-Fa-f]/g,'').trim() || '?';
    const protoName = (await sendCmd('ATDP')).replace(/[>\r\n]/g,'').trim();
    window.discoveredNetworks.push({
      id: protoId, name: protoName||'Auto-detected',
      icon: '✅', desc: 'Automatisch herkend', auto: true
    });
    log(`Auto-detect: ${protoName||protoId}`,'ok');
  }

  // Scan overige protocollen
  for(const p of PROTOCOLS) {
    if(window.discoveredNetworks.find(n=>n.id===p.id)) continue;
    await sendCmd('ATSP'+p.id);
    await delay(300);
    const r = await sendCmd('0100');
    if(r && r.includes('41') && !r.includes('UNABLE') && !r.includes('NO DATA')) {
      window.discoveredNetworks.push({...p});
      log(`Protocol gevonden: ${p.name}`,'ok');
    }
  }

  await sendCmd('ATSP0');
  renderNetworkCards();
}

// ── PID DISCOVERY ──
async function startDiscovery() {
  const net = window.selectedNetwork;
  showModalStep(3);
  document.getElementById('connActions').innerHTML = '';
  document.getElementById('step3Msg').textContent = `Netwerk: ${net.name}`;

  const prog = document.getElementById('step3Progress');
  prog.innerHTML = '';
  const addProg = (icon, msg) => {
    const el = document.createElement('div');
    el.className = 'step-prog';
    const sp = document.createElement('span'); sp.className='sp-icon'; sp.textContent=icon;
    const tx = document.createElement('span'); tx.textContent=msg;
    el.appendChild(sp); el.appendChild(tx);
    prog.appendChild(el);
  };

  const protoId = net.id==='?'?'0':net.id;
  await sendCmd('ATSP'+protoId);
  await delay(200);
  addProg('✅', `Protocol: ${net.name}`);

  // VIN
  addProg('🔍','VIN uitlezen...');
  const vinInfo = await tryReadVIN();
  if(vinInfo?.vin) {
    addProg('✅', `VIN: ${vinInfo.vin}`);
    if(vinInfo.merk) addProg('🚗', `${vinInfo.merk} ${vinInfo.year||''}`);
  } else {
    addProg('⚠️','VIN niet beschikbaar');
  }

  // PID discovery
  addProg('🔍','PIDs ophalen...');
  window.supportedPIDs = new Set();

  for(const rangeCmd of ['0100','0120','0140','0160','0180','01A0']) {
    const resp = await sendCmd(rangeCmd);
    if(!resp||resp.includes('NO DATA')||resp.includes('ERROR')) continue;
    const hex = resp.replace(/[^0-9A-Fa-f]/g,'');
    if(hex.length < 12) continue;
    const mHdr = ((parseInt(rangeCmd.slice(0,2),16)+0x40).toString(16).toUpperCase().padStart(2,'0'))+rangeCmd.slice(2).toUpperCase();
    const idx = hex.toUpperCase().indexOf(mHdr);
    const ds = idx>=0 ? idx+mHdr.length : 4;
    const bitmapHex = hex.slice(ds, ds+8);
    if(bitmapHex.length < 8) continue;
    const bitmap = parseInt(bitmapHex, 16);
    const base = parseInt(rangeCmd.slice(2), 16);
    for(let i=0;i<32;i++) {
      if(bitmap & (0x80000000>>>i)) {
        window.supportedPIDs.add('01'+((base+i+1).toString(16).toUpperCase().padStart(2,'0')));
      }
    }
  }

  addProg('✅', `${window.supportedPIDs.size} PIDs gevonden`);
  buildDiscoveredPIDList();
  addProg('✅', `${window.discoveredPIDDefs.length} sensoren beschikbaar`);

  updateVehicleCard(vinInfo);
  await delay(500);

  document.getElementById('connOv').classList.add('hidden');
  resetToStep1();
  setConn(true);
  startPoll();
  showWelcome(vinInfo);
  log(`Klaar — ${window.discoveredPIDDefs.length} PIDs beschikbaar`,'ok');
}

// ── VIN ──
async function tryReadVIN() {
  try {
    await sendCmd('ATH1');
    const r = await sendCmd('0902');
    await sendCmd('ATH0');
    if(!r||r.includes('NO DATA')||r.includes('ERROR')) return null;
    const hex = r.replace(/[^0-9A-Fa-f]/g,'');
    let vin = '';
    for(let i=0;i<hex.length-1;i+=2) {
      const c = parseInt(hex.slice(i,i+2),16);
      if(c>=32&&c<=126) vin += String.fromCharCode(c);
    }
    vin = vin.replace(/[^A-HJ-NPR-Z0-9]/gi,'').slice(-17);
    if(vin.length < 5) return null;
    log('VIN: '+vin,'ok');
    return decodeVIN(vin);
  } catch(e) { log('VIN: '+e.message,'warn'); return null; }
}

function decodeVIN(vin) {
  const wmi = vin.slice(0,3).toUpperCase();
  const wmiMap = {
    'WVW':'Volkswagen','WVG':'Volkswagen','WAU':'Audi','WA1':'Audi',
    'WBA':'BMW','WBS':'BMW','WDD':'Mercedes-Benz','WDC':'Mercedes-Benz',
    'WF0':'Ford','WF1':'Ford','VF1':'Renault','VF3':'Peugeot','VF7':'Citroën',
    'TMB':'Skoda','VSS':'Seat','W0L':'Opel','W0V':'Opel',
    'JHM':'Honda','JN1':'Nissan','JT2':'Toyota','JT3':'Toyota',
    'KNA':'Kia','KMH':'Hyundai','YV1':'Volvo','YV4':'Volvo',
    'SAJ':'Jaguar','SAL':'Land Rover',
    'JS3':'Suzuki','JS1':'Suzuki',
    'MNA':'Mazda','JM1':'Mazda','JM3':'Mazda',
  };
  const merk = wmiMap[wmi] || null;
  const yearMap = {
    'A':1980,'B':1981,'C':1982,'D':1983,'E':1984,'F':1985,'G':1986,'H':1987,
    'J':1988,'K':1989,'L':1990,'M':1991,'N':1992,'P':1993,'R':1994,'S':1995,
    'T':1996,'V':1997,'W':1998,'X':1999,'Y':2000,'1':2001,'2':2002,'3':2003,
    '4':2004,'5':2005,'6':2006,'7':2007,'8':2008,'9':2009,
  };
  const yr10 = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','R'];
  const yc = vin[9]?.toUpperCase();
  let year = (yearMap[yc]||'').toString();
  if(!year) { const i=yr10.indexOf(yc); if(i>=0) year=(2010+i).toString(); }
  return {merk:merk||'Onbekend', model:'', year, vin, wmi};
}

// ── PID LIJST BOUWEN ──
function buildDiscoveredPIDList() {
  window.discoveredPIDDefs = [];
  const catOrder = {Motor:0,Temp:1,Brandstof:2,Rijden:3,Electrisch:4,Emissie:5,Overig:9};
  window.supportedPIDs.forEach(pid => {
    const def = window.ALL_PID_DEFS[pid];
    if(def) window.discoveredPIDDefs.push({pid, ...def});
    else window.discoveredPIDDefs.push({pid,name:`PID ${pid}`,unit:'raw',cat:'Overig',min:0,max:255,parse:b=>b[0]});
  });
  window.discoveredPIDDefs.sort((a,b) =>
    (catOrder[a.cat]??9)-(catOrder[b.cat]??9) || (a.name>b.name?1:-1)
  );
  buildPIDList();
  document.getElementById('pidCnt').textContent = window.discoveredPIDDefs.length;
}

// ── PID PARSING ──
function parsePID(pid, raw) {
  if(!raw||raw.includes('NO DATA')||raw.includes('ERROR')||raw.includes('UNABLE')||raw.includes('?')) return null;
  const cleaned = raw.replace(/[^0-9A-Fa-f]/g,'');
  if(cleaned.length < 4) return null;
  const hdr = ((parseInt(pid.slice(0,2),16)+0x40).toString(16).toUpperCase().padStart(2,'0'))+pid.slice(2).toUpperCase();
  const idx = cleaned.toUpperCase().indexOf(hdr);
  const ds = idx>=0 ? idx+hdr.length : 4;
  const b = [];
  for(let i=ds; i<cleaned.length-1; i+=2) b.push(parseInt(cleaned.slice(i,i+2),16));
  if(!b.length) return null;
  const def = window.discoveredPIDDefs.find(d=>d.pid===pid) || window.ALL_PID_DEFS[pid];
  let rawVal = null;
  if(def?.parse) { try { rawVal = def.parse(b); } catch(e) {} }
  else rawVal = b[0] ?? null;
  return validateAndSmooth(pid, rawVal);
}

// ── DEMO MODE ──
const _ds = {};
function demo(pid) {
  const d = window.discoveredPIDDefs.find(p=>p.pid===pid) || window.ALL_PID_DEFS[pid];
  if(!d) return null;
  if(_ds[pid]===undefined) _ds[pid] = (d.min+d.max)/2;
  const r = d.max - d.min;
  _ds[pid] += (Math.random()-.5)*r*.04;
  _ds[pid] = Math.max(d.min, Math.min(d.max, _ds[pid]));
  if(pid==='010C') _ds[pid] = 820+Math.sin(Date.now()/3000)*600+Math.random()*80;
  if(pid==='010D') _ds[pid] = Math.max(0,60+Math.sin(Date.now()/6000)*30);
  if(pid==='0105') _ds[pid] = 87+Math.sin(Date.now()/12000)*3;
  if(pid==='0142') _ds[pid] = 13.8+Math.sin(Date.now()/5000)*.3;
  if(pid==='012F') _ds[pid] = 72;
  if(pid==='0106') _ds[pid] = 3+Math.random()*3;
  if(pid==='0107') _ds[pid] = 2+Math.random()*2;
  return Math.round(_ds[pid]*100)/100;
}

function startDemo() {
  const apiVal = document.getElementById('startApiKey')?.value.trim();
  if(apiVal?.startsWith('sk-ant-')) {
    window.anthropicKey = apiVal;
    try { localStorage.setItem('ns_api_key',apiVal); } catch(e) {}
    updateApiPill();
  }
  window.demoMode = true;
  window.connected = true;
  window.dataStable = true;
  document.getElementById('connOv').classList.add('hidden');
  resetToStep1();
  setConn(true);

  const demoVin = {merk:'Volkswagen',model:'Golf',year:'2019',vin:'WVWZZZ1KZAM123456',wmi:'WVW'};
  window.vehicleInfo = demoVin;

  const demoPIDs = ['010C','010D','0105','0142','012F','0104','0106','0107','0110','0111','010B','010F','010E','015C','0113','0115'];
  window.supportedPIDs = new Set(demoPIDs);
  buildDiscoveredPIDList();
  updateVehicleCard(demoVin);
  showVtag('DEMO — VW Golf 2019');
  log('Demo modus — VW Golf 1.5 TSI 2019','warn');

  ['010C','010D','0105','0142','012F','0104','0106','0107'].forEach(pid=>window.activePIDs.add(pid));
  buildPIDList();
  document.getElementById('pidCnt').textContent = window.discoveredPIDDefs.length;
  renderGauges(); rebuildGSel();
  startPoll();
  showWelcome(demoVin);
}

// Exporteer
window.connectBluetooth = connectBluetooth;
window.sendCmd = sendCmd;
window.sendBT = sendBT;
window.scanNetworks = scanNetworks;
window.startDiscovery = startDiscovery;
window.startDemo = startDemo;
window.buildDiscoveredPIDList = buildDiscoveredPIDList;
window.parsePID = parsePID;
window.demo = demo;
window.PROTOCOLS = PROTOCOLS;
