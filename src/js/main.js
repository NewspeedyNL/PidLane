// ════════════════════════════════════════
// main.js — INIT, UI helpers, event listeners
// ════════════════════════════════════════

// ── UTILITY ──
function fv(v) {
  return (v===undefined||v===null) ? '—' : (Math.abs(v)<10 ? v.toFixed(2) : v.toFixed(0));
}
function delay(ms) { return new Promise(r=>setTimeout(r,ms)); }
window.fv = fv;
window.delay = delay;

// ── SIDEBAR TOGGLE ──
let slCollapsed=false, srCollapsed=false;
function toggleSL() {
  slCollapsed=!slCollapsed;
  document.getElementById('appGrid').classList.toggle('sl-col',slCollapsed);
  document.getElementById('slToggle').textContent=slCollapsed?'▶':'◀';
  try{localStorage.setItem('ns_sl',slCollapsed);}catch(e){}
}
function toggleSR() {
  srCollapsed=!srCollapsed;
  document.getElementById('appGrid').classList.toggle('sr-col',srCollapsed);
  document.getElementById('srToggle').textContent=srCollapsed?'◀':'▶';
  try{localStorage.setItem('ns_sr',srCollapsed);}catch(e){}
}

// ── THEME ──
let isDark=false;
function toggleTheme() {
  isDark=!isDark;
  document.documentElement.classList.toggle('dark',isDark);
  document.getElementById('themeBtn').textContent=isDark?'☀️':'🌙';
  try{localStorage.setItem('ns_theme',isDark?'dark':'light');}catch(e){}
}
window.isDark=isDark;
window.toggleTheme=toggleTheme;

// ── FONT SIZE ──
let currentFont=13;
function fontSize(delta) {
  currentFont=Math.min(18,Math.max(10,currentFont+delta));
  document.documentElement.style.fontSize=currentFont+'px';
  document.getElementById('fontLbl').textContent=currentFont;
  try{localStorage.setItem('ns_font',currentFont);}catch(e){}
}

// ── ZOOM ──
let currentZoom=1.0;
function applyZoom() {
  const el=document.getElementById('appScale');
  if(el){el.style.transform=`scale(${currentZoom})`;el.style.width=`${100/currentZoom}%`;el.style.height=`${100/currentZoom}%`;}
  document.getElementById('zoomLbl').textContent=Math.round(currentZoom*100)+'%';
  try{localStorage.setItem('ns_zoom',currentZoom);}catch(e){}
}
function zoom(delta){currentZoom=Math.min(1.5,Math.max(0.5,currentZoom+delta));applyZoom();}
function zoomReset(){currentZoom=1.0;applyZoom();}

// ── CONNECTION UI ──
function setConn(on) {
  const dot=document.getElementById('sdot'),txt=document.getElementById('stxt'),btn=document.getElementById('cbtn');
  if(on){
    dot.className='dot '+(window.demoMode?'demo':'on');
    txt.textContent=window.demoMode?'Demo modus':'Verbonden';
    btn.textContent='Verbreken'; btn.className='btn-t off';
  } else {
    dot.className='dot'; txt.textContent='Niet verbonden';
    btn.textContent='Verbinden'; btn.className='btn-t';
  }
}
function showVtag(t) {
  const el=document.getElementById('vtag');
  el.textContent=t; el.style.display='block';
}
function handleConnect() {
  if(window.connected){
    window.connected=false; window.demoMode=false;
    clearInterval(window.pollTimer);
    setConn(false);
    document.getElementById('vtag').style.display='none';
    window.pidVals={}; window.pidHist={}; window.pidSmooth={};
    window.stabilityCount={}; window.dataStable=false;
    log('Verbinding verbroken','warn');
  } else {
    document.getElementById('connOv').classList.remove('hidden');
  }
}

// ── MODAL STEPS ──
function showModalStep(n) {
  document.getElementById('step1').style.display=n===1?'':'none';
  document.getElementById('step2').style.display=n===2?'':'none';
  document.getElementById('step3').style.display=n===3?'':'none';
}
function showConnError(msg) {
  showModalStep(1);
  const actions=document.getElementById('connActions');
  const errDiv=document.createElement('div');
  errDiv.style.cssText='font-size:11px;color:var(--rd);padding:4px 0 8px;text-align:center';
  errDiv.textContent='⚠ '+msg;
  const btnRetry=document.createElement('button'); btnRetry.className='mbtn p'; btnRetry.id='btnConnect';
  btnRetry.textContent='📡 Opnieuw proberen'; btnRetry.onclick=()=>connectBluetooth();
  const btnDemo=document.createElement('button'); btnDemo.className='mbtn s'; btnDemo.id='btnDemo';
  btnDemo.textContent='▷ Demo modus'; btnDemo.onclick=()=>startDemo();
  actions.innerHTML=''; actions.appendChild(errDiv); actions.appendChild(btnRetry); actions.appendChild(btnDemo);
}
function resetToStep1() {
  showModalStep(1);
  document.getElementById('connActions').innerHTML=`
    <button class="mbtn p" id="btnConnect">📡 Verbinden via Bluetooth</button>
    <button class="mbtn s" id="btnDemo">▷ Demo modus (zonder adapter)</button>`;
  document.getElementById('btnConnect').onclick=()=>connectBluetooth();
  document.getElementById('btnDemo').onclick=()=>startDemo();
}

// ── WELCOME SCREEN ──
function showWelcome(vinInfo) {
  const ws=document.getElementById('welcomeScreen');
  ws.classList.remove('hidden');
  if(vinInfo?.merk) {
    document.getElementById('welcomeVin').style.display='inline-flex';
    document.getElementById('welcomeTitle').textContent=`${vinInfo.merk} ${vinInfo.year||''} herkend`;
  } else if(window.demoMode) {
    document.getElementById('welcomeTitle').textContent='Demo modus — kies een optie';
  }
}
function startChoice(choice) {
  document.getElementById('welcomeScreen').classList.add('hidden');
  const tabs=document.querySelectorAll('.tab');
  const map={live:0,check:1,diag:2,graph:3,dtc:4,fuel:5};
  if(map[choice]!==undefined) sw(choice,tabs[map[choice]]);
  if(choice==='dtc')      setTimeout(()=>scanDTC(),300);
  if(choice==='report')   setTimeout(()=>runQuickAI(),300);
  if(choice==='fuel')     setTimeout(()=>runFuelAnalysis(),400);
  if(choice==='ritanalyse') setTimeout(()=>openRitAnalyse(),300);
}

// ── VEHICLE CARD ──
function updateVehicleCard(vinInfo) {
  window.vehicleInfo = {
    merk:  vinInfo?.merk  || 'Onbekend',
    model: vinInfo?.model || '',
    year:  vinInfo?.year  || '',
    vin:   vinInfo?.vin   || '',
  };
  showVtag(window.vehicleInfo.vin || window.vehicleInfo.merk || 'Verbonden');
  const card=document.getElementById('vehicleCard');
  // Veilig opbouwen zonder innerHTML
  card.innerHTML='';
  const rows=[
    {lbl:'Merk', val:window.vehicleInfo.merk},
    {lbl:'Jaar', val:window.vehicleInfo.year},
    {lbl:'PIDs', val:`${window.supportedPIDs?.size||0} beschikbaar`},
  ];
  rows.forEach(r=>{
    if(!r.val) return;
    const row=document.createElement('div'); row.className='vic-row';
    const lbl=document.createElement('span'); lbl.className='vic-label'; lbl.textContent=r.lbl;
    const val=document.createElement('span'); val.className='vic-val'; val.textContent=r.val;
    row.appendChild(lbl); row.appendChild(val); card.appendChild(row);
  });
  if(window.vehicleInfo.vin) {
    const vin=document.createElement('div'); vin.className='vic-vin';
    vin.textContent='VIN: '+window.vehicleInfo.vin;
    card.appendChild(vin);
  }
}
function getVehicle() { return window.vehicleInfo || {merk:'',model:'',year:'',vin:''}; }

// ── PID PANEL ──
function buildPIDList(filter='') {
  const el=document.getElementById('pidList'); el.innerHTML='';
  const source=window.discoveredPIDDefs?.length>0 ? window.discoveredPIDDefs : [];
  if(!source.length){
    const msg=document.createElement('div');
    msg.style.cssText='padding:16px;text-align:center;color:var(--tx3);font-size:11px';
    msg.textContent='Verbind adapter om beschikbare PIDs te laden';
    el.appendChild(msg); return;
  }
  const f=filter.toLowerCase();
  const filtered=f ? source.filter(p=>p.name.toLowerCase().includes(f)||p.pid.includes(filter.toUpperCase())) : source;
  const cats=[...new Set(filtered.map(p=>p.cat||'Overig'))];
  cats.forEach(cat=>{
    const items=filtered.filter(p=>(p.cat||'Overig')===cat);
    if(!items.length) return;
    const lbl=document.createElement('div'); lbl.className='clbl'; lbl.textContent=cat; el.appendChild(lbl);
    items.forEach(p=>{
      const row=document.createElement('div');
      row.className='pr'+(window.activePIDs.has(p.pid)?' sel':'');
      const pck=document.createElement('div'); pck.className='pck';
      const ck=document.createElement('span'); ck.className='ckm'; ck.textContent='✓';
      pck.appendChild(ck);
      const nm=document.createElement('span'); nm.className='pn'; nm.textContent=p.name;
      const un=document.createElement('span'); un.className='pu2'; un.textContent=p.unit||p.pid;
      row.appendChild(pck); row.appendChild(nm); row.appendChild(un);
      row.onclick=()=>togglePID(p.pid);
      el.appendChild(row);
    });
  });
}
function filterPIDs(v) { buildPIDList(v); }
function togglePID(pid) {
  window.activePIDs.has(pid) ? window.activePIDs.delete(pid) : window.activePIDs.add(pid);
  buildPIDList(document.getElementById('psrch').value);
  document.getElementById('pidCnt').textContent=window.activePIDs.size;
  renderGauges(); rebuildGSel();
}

// ── TABS ──
function sw(name, el) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('pane-'+name)?.classList.add('active');
  if(name==='graph') setTimeout(drawGraph,50);
}

// ── NETWORK CARDS ──
function renderNetworkCards() {
  document.getElementById('step2Title').textContent =
    window.discoveredNetworks.length===0 ? 'Geen netwerken gevonden' :
    `${window.discoveredNetworks.length} netwerk${window.discoveredNetworks.length!==1?'en':''} gevonden`;
  document.getElementById('step2Sub').textContent =
    window.discoveredNetworks.length===0 ? 'Controleer verbinding en contact' : 'Selecteer het netwerk voor diagnose';

  const list=document.getElementById('networkList'); list.innerHTML='';
  if(!window.discoveredNetworks.length) {
    list.innerHTML=`<div style="text-align:center;padding:14px;font-size:12px;color:var(--rd)">⚠ Geen netwerken gevonden.<br><small style="color:var(--tx3)">Zet contact aan en controleer adapter.</small></div>`;
    document.getElementById('connActions').innerHTML=`<button class="mbtn p" onclick="scanNetworks()">🔄 Opnieuw scannen</button><button class="mbtn s" onclick="resetToStep1()">↺ Terug</button>`;
    return;
  }
  window.discoveredNetworks.forEach((net,i)=>{
    const card=document.createElement('div'); card.className='network-card'+(i===0?' sel':'');
    card.id='ncard-'+i;
    const icon=document.createElement('div'); icon.className='network-icon'; icon.textContent=net.icon;
    const info=document.createElement('div'); info.style.flex='1';
    const nm=document.createElement('div'); nm.className='network-name'; nm.textContent=net.name;
    const ds=document.createElement('div'); ds.className='network-desc'; ds.textContent=net.desc;
    const bdg=document.createElement('div'); bdg.className='network-badge nb-ok'; bdg.textContent='Actief';
    info.appendChild(nm); info.appendChild(ds);
    card.appendChild(icon); card.appendChild(info); card.appendChild(bdg);
    card.onclick=()=>{
      document.querySelectorAll('.network-card').forEach(c=>c.classList.remove('sel'));
      card.classList.add('sel'); window.selectedNetwork=net; updateNetworkBtn(net);
    };
    list.appendChild(card);
  });
  window.selectedNetwork=window.discoveredNetworks[0];
  updateNetworkBtn(window.selectedNetwork);
}

function updateNetworkBtn(net) {
  document.getElementById('connActions').innerHTML=`
    <button class="mbtn p" onclick="startDiscovery()">✓ Gebruik: ${net.name.slice(0,30)}</button>
    <button class="mbtn s" onclick="scanNetworks()">🔄 Opnieuw scannen</button>`;
}

// ── PROTOCOL SELECT ──
function selectProto(el, p) {
  document.querySelectorAll('.proto-btn').forEach(b=>b.classList.remove('sel'));
  el.classList.add('sel'); window.selectedProto=p;
}

// ── GAUGES ──
window.graphPID=null;
function renderGauges() {
  const g=document.getElementById('gGrid'); g.innerHTML='';
  if(!window.activePIDs.size){
    g.innerHTML=`<div class="emp" style="grid-column:1/-1"><div class="ei">📡</div><h3>Geen sensoren geselecteerd</h3><p>Kies sensoren links voor live data</p></div>`;
    return;
  }
  window.activePIDs.forEach(pid=>{
    const d=window.discoveredPIDDefs?.find(p=>p.pid===pid)||window.ALL_PID_DEFS?.[pid]; if(!d) return;
    const c=document.createElement('div'); c.className='gc'; c.id='gc-'+pid;
    const gn=document.createElement('div'); gn.className='gn2'; gn.textContent=d.name;
    const gv=document.createElement('div'); gv.className='gv'; gv.id='gv-'+pid; gv.textContent='—';
    const gu=document.createElement('div'); gu.className='gunit'; gu.textContent=d.unit;
    const gb=document.createElement('div'); gb.className='gbar';
    const gf=document.createElement('div'); gf.className='gfil'; gf.id='gf-'+pid;
    gb.appendChild(gf);
    c.appendChild(gn); c.appendChild(gv); c.appendChild(gu); c.appendChild(gb);
    g.appendChild(c);
    if(window.pidVals[pid]!==undefined) applyG(pid,window.pidVals[pid]);
  });
}

function applyG(pid, val) {
  const d=window.discoveredPIDDefs?.find(p=>p.pid===pid)||window.ALL_PID_DEFS?.[pid]; if(!d) return;
  const card=document.getElementById('gc-'+pid); if(!card) return;
  const pct=Math.max(0,Math.min(100,((val-d.min)/(d.max-d.min))*100));
  let st='ok';
  if((d.dH&&val>=d.dH)||(d.dL&&val<=d.dL)) st='danger';
  else if((d.wH&&val>=d.wH)||(d.wL&&val<=d.wL)) st='warn';
  card.className='gc'+(st!=='ok'?' '+st:'');
  let bdg=card.querySelector('.gbdg');
  if(!bdg){bdg=document.createElement('div');bdg.className='gbdg';card.appendChild(bdg);}
  bdg.className='gbdg '+st; bdg.textContent=st==='ok'?'OK':st==='warn'?'LET OP':'KRITIEK';
  const gv=document.getElementById('gv-'+pid); if(gv) gv.textContent=fv(val);
  const gf=document.getElementById('gf-'+pid); if(gf) gf.style.width=pct+'%';
}

function rebuildGSel() {
  const sel=document.getElementById('gsel'); const cur=sel.value;
  sel.innerHTML='<option value="">— Of kies individuele sensor —</option>';
  const source=window.discoveredPIDDefs?.length>0?window.discoveredPIDDefs:[];
  source.forEach(p=>{
    const o=document.createElement('option'); o.value=p.pid;
    o.textContent=p.name+(p.unit?' ('+p.unit+')':'');
    if(p.pid===cur) o.selected=true; sel.appendChild(o);
  });
  window.graphPID=(cur&&source.find(d=>d.pid===cur))?cur:null;
}

// Exporteer alles globaal
window.toggleSL=toggleSL; window.toggleSR=toggleSR;
window.fontSize=fontSize; window.zoom=zoom; window.zoomReset=zoomReset;
window.setConn=setConn; window.showVtag=showVtag; window.handleConnect=handleConnect;
window.showModalStep=showModalStep; window.showConnError=showConnError; window.resetToStep1=resetToStep1;
window.showWelcome=showWelcome; window.startChoice=startChoice;
window.updateVehicleCard=updateVehicleCard; window.getVehicle=getVehicle;
window.buildPIDList=buildPIDList; window.filterPIDs=filterPIDs; window.togglePID=togglePID;
window.sw=sw; window.renderNetworkCards=renderNetworkCards; window.updateNetworkBtn=updateNetworkBtn;
window.selectProto=selectProto; window.renderGauges=renderGauges; window.applyG=applyG;
window.rebuildGSel=rebuildGSel;

// ════════════════════════════════════════
// INIT — altijd als laatste
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  buildPIDList();
  loadApiKey();

  // Restore preferences
  try {
    if(localStorage.getItem('ns_theme')==='dark') toggleTheme();
    const sf=localStorage.getItem('ns_font');
    if(sf){currentFont=parseInt(sf)||13;document.documentElement.style.fontSize=currentFont+'px';document.getElementById('fontLbl').textContent=currentFont;}
    const sz=localStorage.getItem('ns_zoom');
    if(sz){currentZoom=parseFloat(sz)||1.0;applyZoom();}
    if(localStorage.getItem('ns_sl')==='true') toggleSL();
    if(localStorage.getItem('ns_sr')==='true') toggleSR();
  } catch(e) {}

  // Event listeners — veilig via addEventListener, geen inline onclick nodig
  document.getElementById('btnConnect')?.addEventListener('click', ()=>connectBluetooth());
  document.getElementById('btnDemo')?.addEventListener('click',    ()=>startDemo());

  // Welcome cards
  document.getElementById('wc-diag')?.addEventListener('click',    ()=>startChoice('diag'));
  document.getElementById('wc-check')?.addEventListener('click',   ()=>startChoice('check'));
  document.getElementById('wc-live')?.addEventListener('click',    ()=>startChoice('live'));
  document.getElementById('wc-dtc')?.addEventListener('click',     ()=>startChoice('dtc'));
  document.getElementById('wc-report')?.addEventListener('click',  ()=>startChoice('report'));
  document.getElementById('wc-fuel')?.addEventListener('click',    ()=>startChoice('fuel'));
  document.getElementById('wc-rit')?.addEventListener('click',     ()=>startChoice('ritanalyse'));

  window.addEventListener('resize', ()=>{ if(window.graphPID||window.trendPIDs?.length) drawGraph(); });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape'){closeNeonDashboard?.();closeRitAnalyse?.();}});

  log('PidLane v'+APP_VERSION+' geladen.','info');
  log('Klik "Verbinden" of "Demo modus" om te starten.','info');
});
