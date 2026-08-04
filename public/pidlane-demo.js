// ══════════════════════════════════════════════════════════════════
// pidlane-demo.js
// Demo-modus
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// DEMO MODE
// ════════════════════════════════════════
// ── DEMO-VOERTUIGEN (benzine / diesel / hybride / elektrisch) ──
// Laat in demo-modus van brandstoftype wisselen zodat de PID-lijst én het
// gedrag (verbranding vs EV) realistisch meeverandert. Zo kun je brandstof-
// én EV-flows testen zonder echte adapter.
function demoPIDsForFuel(brandstof){
  const b=String(brandstof||'').toLowerCase();
  const benzine=['010C','010D','0104','0111','0149','010E','010B','010F','0110',
    '0105','015C','0146','012F','015E','0106','0107','010A',
    '0114','0124','0134','0115','0142','0143','0133','012C'];
  if(/elektr|electric|\bev\b|bev/.test(b)){
    // EV: geen verbrandings-PIDs. Snelheid, temps, 12V-spanning, accupakket.
    return ['010D','0146','0142','015B','0105','0143','0133'];
  }
  if(/hybr|phev|hev/.test(b)) return [...benzine,'015B']; // verbrandingsmotor + accupakket
  if(/diesel|gasolie/.test(b)) return benzine.filter(p=>!['0114','0124','0134','0115'].includes(p)); // geen breedband-lambda/O2
  return benzine; // benzine / lpg / cng / default
}
// → DEMO_VEHICLES verplaatst naar pidlane-data.js
function loadDemoVehicle(key){
  const dv=DEMO_VEHICLES[key]||DEMO_VEHICLES.benzine;
  try{ if(window.PidLaneEvalLog&&PidLaneEvalLog.active) log('🚫 DEMO geactiveerd tijdens evaluatie — deze sessiedata is ongeldig','err'); }catch(e){}
  demoMode=true; connected=true; dataStable=true;
  const pids=demoPIDsForFuel(dv.brandstof);
  supportedPIDs=new Set(pids);
  activePIDs.clear(); manualPIDs.clear();
  pids.slice(0,16).forEach(p=>{ activePIDs.add(p); manualPIDs.add(p); });
  buildDiscoveredPIDList();
  updateVehicleCard({merk:dv.merk,model:dv.model,year:dv.year,vin:dv.vin||''});
  vehicleInfo.brandstof=dv.brandstof; vehicleInfo.motor=dv.motor||'';
  buildPIDList();
  const cntEl=document.getElementById('pidCnt'); if(cntEl) cntEl.textContent=discoveredPIDDefs.length;
  try{ renderGauges(); rebuildGSel(); }catch(e){}
  showVtag('DEMO — '+dv.merk+' '+dv.model);
  log('Demo-voertuig: '+dv.merk+' '+dv.model+' ('+dv.brandstof+') — '+pids.length+' PIDs','warn');
  startPoll();
  try{ initialHealthScan(); }catch(e){}
  renderDemoBar();
}
function demoRefresh(){
  const sel=document.getElementById('demoVehSel');
  loadDemoVehicle(sel?sel.value:'benzine');
  showToast?.('PID-lijst ververst (demo) ✓',2200);
}
function renderDemoBar(){
  const bar=document.getElementById('demoBar'); if(!bar) return;
  bar.style.display=demoMode?'block':'none';
  const sel=document.getElementById('demoVehSel'); if(!sel) return;
  const b=String(vehicleInfo.brandstof||'').toLowerCase();
  let key='benzine';
  if(/elektr|electric|\bev\b|bev/.test(b)) key='elektrisch';
  else if(/hybr|phev|hev/.test(b)) key='hybride';
  else if(/diesel|gasolie/.test(b)) key='diesel';
  sel.value=key;
}

// ── Demo-garage: gezonde demo-auto's om uit te kiezen (of eigen kenteken) ──
// → DEMO_CARS verplaatst naar pidlane-data.js
function startDemo(){
  if(!featOn('feat_demo')){ showToast?.('Demo-modus is uitgeschakeld door beheerder'); return; }
  const apiVal=document.getElementById('startApiKey').value.trim();
  if(apiVal&&apiVal.startsWith('sk-ant-')){window.anthropicKey=apiVal;try{localStorage.setItem('ns_api_key',apiVal);}catch(e){}updateApiPill();}
  openDemoCarChooser();   // eerst kiezen — niet automatisch één vaste auto
}
function openDemoCarChooser(){
  let m=document.getElementById('demoCarModal');
  if(!m){
    m=document.createElement('div'); m.id='demoCarModal';
    m.style.cssText='position:fixed;inset:0;z-index:9750;background:rgba(10,14,23,.65);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center';
    m.addEventListener('click',e=>{ if(e.target===m) m.style.display='none'; });
    document.body.appendChild(m);
  }
  const cards=DEMO_CARS.map((c,i)=>`
    <button onclick="startDemoCar(${i})" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;border-radius:12px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);cursor:pointer;margin-bottom:8px">
      <span style="font-size:22px">${c.icon}</span>
      <span style="flex:1"><b style="font-size:14px">${c.merk} ${c.model} ${c.year}</b><br><span style="font-size:11px;color:var(--tx3)">${c.motortype} · ${c.brandstof} · gezond ✅</span></span>
      <span style="color:var(--tx3)">›</span>
    </button>`).join('');
  m.innerHTML=`<div style="background:var(--sur);width:100%;max-width:560px;max-height:90vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--bd)">
      <b style="font-size:14px">▷ Demo — kies een auto</b>
      <button onclick="document.getElementById('demoCarModal').style.display='none'" style="width:30px;height:30px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);cursor:pointer">✕</button>
    </div>
    <div style="overflow-y:auto;padding:14px 16px">
      <div style="font-size:11px;color:var(--tx3);margin-bottom:10px">Alle demo-auto's zijn gezond en in orde. RDW-opzoeking en PID-selectie werken gewoon.</div>
      ${cards}
      <div style="border-top:1px solid var(--bd);margin:12px 0 10px"></div>
      <div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:6px">Of gebruik een echt kenteken als demo-auto (RDW)</div>
      <div style="display:flex;gap:8px">
        <input id="demoKentInput" placeholder="bv. KF660K" maxlength="8" style="flex:1;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:9px;color:var(--tx);font-family:var(--f);font-size:14px;padding:10px 12px;text-transform:uppercase">
        <button onclick="startDemoKenteken()" style="padding:10px 16px;border-radius:9px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:13px;font-weight:800;cursor:pointer">Start</button>
      </div>
    </div>
  </div>`;
  m.style.display='flex';
}
function startDemoCar(i){
  const m=document.getElementById('demoCarModal'); if(m) m.style.display='none';
  _startDemoCore(DEMO_CARS[i]||DEMO_CARS[0], null);
}
function startDemoKenteken(){
  const kent=((document.getElementById('demoKentInput')||{}).value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(!kent){ showToast?.('Vul een kenteken in'); return; }
  const m=document.getElementById('demoCarModal'); if(m) m.style.display='none';
  _startDemoCore(null, kent);
}
function _startDemoCore(car, kent){
  try{ if(window.PidLaneEvalLog&&PidLaneEvalLog.active) log('🚫 DEMO geactiveerd tijdens evaluatie — deze sessiedata is ongeldig','err'); }catch(e){}
  demoMode=true; connected=true; dataStable=true;
  closeConnOv();
  resetToStep1();
  setConn(true);

  const demoVin = car
    ? { merk:car.merk, model:car.model, year:car.year, vin:car.vin, wmi:car.wmi, motortype:car.motortype, brandstof:car.brandstof }
    : { merk:'Onbekend', model:'', year:'', vin:'', wmi:'', motortype:'', brandstof:'' };
  vehicleInfo=demoVin;
  // Merge-laag voeden: normalisatie + fantoomfilter (purge bij brandstof) draaien
  // direct mee — dus een diesel-demo toont diesel-sensoren, benzine niet, enz.
  try{ resetVehicleSources(); mergeVehicleData('vin', { merk:demoVin.merk, model:demoVin.model, year:demoVin.year, brandstof:demoVin.brandstof }); }catch(e){}

  // Alle PIDs die een Mazda CX-5 2018 typisch ondersteunt
  const demoPIDs=[
    // Motor
    '010C', // RPM
    '010D', // Snelheid
    '0104', // Motorbelasting
    '0111', // Gasklep positie
    '0149', // Gaspedaal
    '010E', // Ontstekingstiming
    '010B', // Inlaatdruk (MAP)
    '010F', // Inlaatlucht temp
    '0110', // MAF
    // Temperatuur
    '0105', // Koelwater temp
    '015C', // Olie temp
    '0146', // Omgevingstemperatuur
    // Brandstof
    '012F', // Brandstofpeil
    '015E', // Verbruik L/h
    '0106', // STFT bank 1
    '0107', // LTFT bank 1
    '010A', // Brandstofdruk
    // O2 sensoren
    '0114', // O2 B1S1 (smalband — dood op breedband-auto)
    '0124', // Lambda B1S1 breedband (de échte B1S1-bron)
    '0134', // Lambda B1S1 breedband (stroom-variant)
    '0115', // O2 B1S2
    // Electrisch
    '0142', // Accuspanning
    '0143', // Absolute motorbelasting
    // Emissie
    '0133', // Barometerdruk
    '012C', // EGR
  ];
  supportedPIDs=new Set(demoPIDs);
  buildDiscoveredPIDList();

  updateVehicleCard(demoVin);
  const _dNaam=[demoVin.merk,demoVin.model,demoVin.year].filter(Boolean).join(' ')||'demo-auto';
  showVtag('DEMO — '+_dNaam);
  log('Demo modus — '+_dNaam+(demoVin.motortype?(' '+demoVin.motortype):'')+' gesimuleerd','warn');

  // Toon auto info in welcome title
  document.getElementById('welcomeTitle').textContent = kent ? ('Demo met kenteken '+kent) : (_dNaam+' herkend ✅');

  // Selecteer een uitgebreide standaard set voor directe weergave
  [
    '010C','010D','0105','0142',  // Motor essentials
    '012F','015E','0104','0111',  // Brandstof & belasting
    '0106','0107','0110','010F',  // Brandstoftrim & MAF
    '015C','0114','0124','010B','0146',  // Temp, O2 smalband+breedband, druk
  ].forEach(pid=>{ activePIDs.add(pid); manualPIDs.add(pid); });

  buildPIDList();
  document.getElementById('pidCnt').textContent=discoveredPIDDefs.length;
  renderGauges(); rebuildGSel();
  startPoll();
  // Demo: markeer alles gezond + toon connectie-status (geen popup nodig)
  initialHealthScan();
  measureConnSpeed().then(sp=>{ applyStrategy(suggestStrategy(sp)); });
  renderDemoBar();
  showWelcome(demoVin);

  // Kenteken als demo-auto: echte RDW-opzoeking vult merk/model/brandstof in
  // en het fantoomfilter draait mee — net als bij een echte verbinding.
  if(kent){
    try{ localStorage.setItem('pl_kenteken', kent); }catch(e){}
    setTimeout(()=>{ try{
      const i=document.getElementById('kentInput'); if(i) i.value=kent;
      rdwLookup(false);
    }catch(e){} }, 300);
  }
}
