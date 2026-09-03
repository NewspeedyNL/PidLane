// ══════════════════════════════════════════════════════════════════
// pidlane-uihelpers.js
// UI-helpers (kebabmenu, overlays, toasts)
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════

// ── Kloktijd voor mensen ──────────────────────────────────────────
// PIDLANE-CONTRACT.md §6: alle tijden zijn epoch-milliseconden in UTC, en
// omrekenen naar lokale tijd gebeurt pas op het scherm en in de export. Deze
// twee helpers zijn die omrekening — en alleen die. Ze horen NOOIT in
// opgeslagen data terecht te komen: daar hoort het epoch-getal.
//
// Waarom ze bestaan (#17). De bulk-recorder bouwde zijn sessie-id met
// toISOString(), dus met UTC, terwijl de app-log ernaast lokale tijd schrijft.
// Op 02-09-2026 gemeten: dezelfde seconde stond in het log als 23:16:03 en in
// de bestandsnaam als 21-16-03. Twee uur verschil, en wie die twee naast
// elkaar legt concludeert eerst dat ze niet bij elkaar horen. De fout was niet
// de opslag maar het ETIKET: een kloktijd die op het scherm komt hoort dezelfde
// klok te gebruiken als alles wat de gebruiker verder ziet.
//
// Bewust geen 'Z' erachter. Die letter betekent UTC, en dat is dit niet — dat
// was precies de leugen in de oude naam. Wie het exacte moment nodig heeft,
// heeft het epoch-getal: dat staat naast elk blok (van/tot) en in de meta.
function _plTweeCijfers(n){ return (n<10?'0':'') + n; }

// '2026-09-02T23-16-03-568' — sorteerbaar, veilig in een bestandsnaam, en
// dezelfde klok als de regel in het logboek ernaast.
function plStempelLokaal(ms){
  const d = (ms===undefined || ms===null) ? new Date() : new Date(ms);
  return d.getFullYear() + '-' + _plTweeCijfers(d.getMonth()+1) + '-' + _plTweeCijfers(d.getDate()) +
         'T' + _plTweeCijfers(d.getHours()) + '-' + _plTweeCijfers(d.getMinutes()) + '-' + _plTweeCijfers(d.getSeconds()) +
         '-' + String(d.getMilliseconds()).padStart(3,'0');
}

// '2026-09-02' — voor een bestandsnaam waar alleen de dag in hoort. Met
// toISOString() geeft die om 00:30 lokaal nog de dag ervóór, en dan lijkt een
// export van vannacht van gisteren te zijn.
function plDatumLokaal(ms){
  const d = (ms===undefined || ms===null) ? new Date() : new Date(ms);
  return d.getFullYear() + '-' + _plTweeCijfers(d.getMonth()+1) + '-' + _plTweeCijfers(d.getDate());
}

// ── Voertuig-blok en demo-balk inklapbaar ──
// Op het PID-keuzescherm eten "Voertuig" (kaart + demo-balk) samen zoveel
// vaste ruimte op dat de scrollbare PID-lijst eronder nauwelijks hoogte
// overhoudt. Beide onthouden hun stand (aan/uit) in localStorage, zodat een
// keer inklappen blijft staan bij de volgende sessie.
function toggleVehicleSection(){
  const body=document.getElementById('vehicleBody'); if(!body) return;
  const collapsing = body.style.display!=='none';
  body.style.display = collapsing?'none':'';
  const chev=document.getElementById('vehSecChev'); if(chev) chev.textContent = collapsing?'▸':'▾';
  try{ localStorage.setItem('pl_vehsec_collapsed', collapsing?'1':'0'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
}
function toggleDemoBarBody(){
  const body=document.getElementById('demoBarBody'); if(!body) return;
  const collapsing = body.style.display!=='none';
  body.style.display = collapsing?'none':'';
  const chev=document.getElementById('demoBarChev'); if(chev) chev.textContent = collapsing?'▸':'▾';
  try{ localStorage.setItem('pl_demobar_collapsed', collapsing?'1':'0'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
}
document.addEventListener('DOMContentLoaded', function(){
  try{
    if(localStorage.getItem('pl_vehsec_collapsed')==='1'){
      const body=document.getElementById('vehicleBody'), chev=document.getElementById('vehSecChev');
      if(body) body.style.display='none';
      if(chev) chev.textContent='▸';
    }
    if(localStorage.getItem('pl_demobar_collapsed')==='1'){
      const body=document.getElementById('demoBarBody'), chev=document.getElementById('demoBarChev');
      if(body) body.style.display='none';
      if(chev) chev.textContent='▸';
    }
  }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
});
// Zet BEIDE verbind-knoppen (topbar #cbtn + modal #btnConnect) in de
// "bezig"-staat tijdens de ~12 sec scan, zodat gebruikers niet herhaald
// kunnen klikken terwijl het verbindscript al loopt.
function setConnectingUI(busy){
  const cbtn = document.getElementById('cbtn');
  // Álle Verbinden-knoppen (hub + verbind-overlay delen dezelfde id).
  const mbtns = document.querySelectorAll('[id="btnConnect"]');
  if(busy){
    if(cbtn){ cbtn.textContent='⏳ Verbinden…'; cbtn.className='btn-t busy'; cbtn.disabled=true; }
    mbtns.forEach(b=>{ b.textContent='⏳ Verbinden… (±12 sec)'; b.disabled=true; });
  } else {
    // Niet-bezig: laat setConn de juiste eindstaat bepalen (verbonden/niet).
    if(cbtn){ cbtn.disabled=false; }
    mbtns.forEach(b=>{ b.disabled=false; });
  }
}
function setConn(on){
  const dot=document.getElementById('sdot'),txt=document.getElementById('stxt'),btn=document.getElementById('cbtn');
  const pill=document.querySelector('.pill');
  if(pill){ pill.classList.remove('attn'); if(pill.dataset.origTitle) pill.title=pill.dataset.origTitle; }
  document.getElementById('sysChip')?.classList.remove('attn');
  _btQual.length=0; _qualWarned=false;
  // Bezig-staat opheffen — verbinding heeft nu een eindstaat bereikt.
  document.querySelectorAll('[id="btnConnect"]').forEach(b=>{ b.disabled=false; if(on) b.textContent='✅ Verbonden'; });
  if(btn){ btn.disabled=false; }
  if(on){dot.className='dot '+(demoMode?'demo':'on');txt.textContent=demoMode?'Demo modus':'Verbonden';if(btn){btn.textContent='Verbreken';btn.className='btn-t off';}}
  else{dot.className='dot';txt.textContent='Niet verbonden';if(btn){btn.textContent='Verbinden';btn.className='btn-t';}_connSpeed=null;_connStrategy=null;_pollMult=1.0;window._connReady=false;}
  // Readiness kaartjes bijwerken na verbindingsstatus-wijziging
  setTimeout(()=>{ if(typeof refreshAllReadiness==='function') refreshAllReadiness(); }, 300);
  try{updateConnGate();}catch(e){ console.warn('updateConnGate mislukt:', e); }
}
// ── ⋯ kebab menu ──
function toggleKebab(e){
  if(e) e.stopPropagation();
  const m=document.getElementById('kebabMenu');
  if(!m) return;
  if(m.classList.contains('open')){ m.classList.remove('open'); return; }
  // Port het menu naar <body> en plaats het fixed onder de knop -> altijd bovenop,
  // ook boven het keuzescherm (voorheen viel het in een lagere stapelcontext).
  const btn=document.getElementById('kebabBtn');
  const r=btn?btn.getBoundingClientRect():null;
  if(m.parentElement!==document.body) document.body.appendChild(m);
  m.style.position='fixed';
  m.style.top=((r?r.bottom:46)+6)+'px';
  // Knop zit nu links in de topbar → menu links uitlijnen; anders rechts (fallback)
  if(r && r.left < window.innerWidth/2){
    m.style.left=Math.max(6,r.left)+'px';
    m.style.right='auto';
  } else {
    m.style.right=(r?Math.max(6,window.innerWidth-r.right):8)+'px';
    m.style.left='auto';
  }
  m.style.zIndex='9999';
  m.classList.add('open');
}
function closeKebab(){
  const m=document.getElementById('kebabMenu'); if(m) m.classList.remove('open');
  closeAdmGroup();     // groep altijd dicht achterlaten: volgende keer weer een kort menu
}
// ── 🛠️ Admin-groep in het kebab-menu open/dicht ──────────────────
// Bewust géén localStorage: de groep hoort standaard dicht te staan, zodat het
// menu bij openen kort blijft. Klik op de regel klapt hem uit; het menu zelf
// blijft daarbij open (stopPropagation, anders sluit de document-klikluisteraar).
function closeAdmGroup(){
  const g=document.getElementById('admGroup'), b=document.getElementById('admGroupBtn'), c=document.getElementById('admCaret');
  if(g) g.classList.remove('open');
  if(b) b.setAttribute('aria-expanded','false');
  if(c) c.textContent='▸';
}
function toggleAdmGroup(e){
  if(e){ e.preventDefault(); e.stopPropagation(); }
  const g=document.getElementById('admGroup'), b=document.getElementById('admGroupBtn'), c=document.getElementById('admCaret');
  if(!g) return;
  const open=!g.classList.contains('open');
  g.classList.toggle('open',open);
  if(b) b.setAttribute('aria-expanded',open?'true':'false');
  if(c) c.textContent=open?'▾':'▸';
}
document.addEventListener('click',(e)=>{
  // Let op: toggleKebab() verplaatst #kebabMenu naar <body>, dus het menu zit
  // niet meer ín #kebabWrap. Beide moeten daarom als "binnen" gelden, anders
  // klapt het menu dicht zodra je de Admin-groep uitklapt.
  const w=document.getElementById('kebabWrap'), m=document.getElementById('kebabMenu');
  const binnen = (w && w.contains(e.target)) || (m && m.contains(e.target));
  if(w && !binnen) closeKebab();
});
function showVtag(t){
  const el=document.getElementById('vtag'); if(!el) return;
  let pct=0; try{ pct=dossierPct(); }catch(e){ console.warn('dossierPct mislukt:', e); }
  let sitHtml=''; try{ sitHtml=situatieChipHtml(); }catch(e){ console.warn('situatieChipHtml mislukt:', e); }
  // 2026-07-26 — de voertuignaam ("DEMO — Mazda CX-5 …") stond hier voluit in
  // de topbalk en duwde bij tekstgrootte L de OBD- en AI-chip buiten beeld,
  // terwijl de balk bewust niet horizontaal scrollbaar is. De naam gaat nu naar
  // de tooltip + het voertuigoverzicht achter de chip; dát het om een demo gaat
  // zie je al aan de oranje OBD-stip. In de chip blijft alleen wat kort is:
  // het dossier-percentage en de rijsituatie-iconen.
  el.dataset.naam = t||'';
  el.innerHTML='<span id="vtagPct" style="font-size:11px;font-weight:800;padding:1px 5px;border-radius:3px;background:'+(pct>=80?'rgba(0,168,107,.18)':'rgba(247,127,0,.18)')+';color:'+(pct>=80?'var(--gn)':'var(--or)')+'">📋 '+pct+'%</span>'+sitHtml;
  el.style.display='block';
  // Klik loopt via de omliggende voertuig-chip (#vchip) — geen eigen onclick meer,
  // anders opent het voertuigoverzicht dubbel (event bubbelt naar de chip).
  try{ updateTopbarStatus(); }catch(e){ console.warn('updateTopbarStatus mislukt:', e); }
}

// ══════════════════════════════════════════════════════════════════
// TOPBAR STATUSDOTS — vier balletjes, sinds 27-08-2026 achter één
// samengevoegde "Systeem"-chip (#sysChip/#sysdot, zie updateSysDot()
// hieronder). Tik erop om ze uit te klappen — daarbinnen doen ze zelf nog
// precies wat ze altijd deden:
//   1️⃣ Voertuig : rood=geen auto herkend · oranje=dossier onvolledig · groen=dossier ≥80%
//   2️⃣ OBD      : rood=niet verbonden · oranje=demo of traag (<12 reads/s) · groen=snel verbonden
//              — tik = verbinden/verbreken (obdChipTap)
//   3️⃣ AI       : groen=proxy bereikbaar of geldige sleutel · rood=geen AI beschikbaar
//              — tik = AI-dialoog (openApiDialog)
//   4️⃣ Run      : grijs=niets draait op de achtergrond · groen=iets actief (zie pidlane-run.js)
//              — telt NIET mee in de kleur van de systeem-dot: niets draaien
//                 is de normale staat, geen probleem
// Systeem-dot = de ernstigste van 1/2/3 (rood > oranje > groen). Vervangt de
// oude statusPill + de menu-items "AI-sleutel" en "Verbinden".
// ══════════════════════════════════════════════════════════════════
let _aiReach=null;   // null=nog niet gemeten, true/false=laatste proxy-check
function updateTopbarStatus(){
  // 1️⃣ Voertuig-dot + label
  const vt=document.getElementById('vtag'), vd=document.getElementById('vdot'), vl=document.getElementById('vchipLbl');
  // De chip toont de naam niet meer (zie showVtag); of er een auto bekend is,
  // lezen we daarom uit data-naam i.p.v. uit de zichtbare tekst.
  const naam=(vt && vt.dataset && vt.dataset.naam) ? vt.dataset.naam : '';
  const known=!!(vt && vt.style.display!=='none' && naam);
  let pct=0; try{ pct=dossierPct(); }catch(e){ console.warn('dossierPct mislukt:', e); }
  if(vd) vd.className='tdot '+(known ? (pct>=80?'g':'o') : 'r');
  if(vl) vl.style.display=known?'none':'inline';
  const vc=document.getElementById('vchip');
  if(vc) vc.title=known?(naam+' — dossier '+pct+'%, tik voor overzicht'):'Nog geen voertuig herkend — verbind eerst';
  // Ernst voor de systeem-dot: 0=groen, 1=oranje, 2=rood — dezelfde regel als
  // hierboven voor vd, maar ook bruikbaar buiten de className-string.
  const vSev = known ? (pct>=80?0:1) : 2;
  // 2️⃣ OBD-dot: kleur op basis van verbinding + gemeten snelheid
  const sd=document.getElementById('sdot');
  let sSev=2;
  if(sd){
    if(!connected && !demoMode){ sd.className='dot'; sSev=2; }
    else if(demoMode){ sd.className='dot demo'; sSev=1; }
    else if(_connSpeed && _connSpeed.readsPerSec<12){ sd.className='dot slow'; sSev=1; }
    else { sd.className='dot on'; sSev=0; }
  }
  // Tooltip = de bestaande (verborgen) statusregel, zolang er geen kwaliteitswaarschuwing actief is
  const oc=document.getElementById('obdChip'), st=document.getElementById('stxt');
  if(oc && st && !oc.classList.contains('attn')) oc.title=st.textContent||'OBD-verbinding';
  // 3️⃣ AI-dot
  const ad=document.getElementById('adot');
  let aSev=2;
  if(ad){
    const hasProxy=(typeof PROXY_URL!=='undefined' && !!PROXY_URL);
    const hasKey=!!(window.anthropicKey && String(window.anthropicKey).startsWith('sk-ant-'));
    const ok=hasProxy ? (_aiReach!==false) : hasKey;
    ad.className='tdot '+(ok?'g':'r');
    aSev=ok?0:2;
    const ac=document.getElementById('aiChip');
    if(ac) ac.title=ok?'AI-verbinding actief':'Geen AI-verbinding — tik voor instellingen';
  }
  // 4️⃣ Systeem-dot: de ernstigste van voertuig/OBD/AI. Run telt hier bewust
  // niet in mee — "niets draait op de achtergrond" is geen probleem, dat is
  // de normale staat — Run krijgt zijn eigen telbadge via PLRun.verversDot().
  updateSysDot(Math.max(vSev, sSev, aSev));
}
// Kleur + tooltip van de samengevoegde systeem-chip. Losgetrokken van
// updateTopbarStatus() zodat de ernst-berekening op één plek staat i.p.v.
// verspreid over drie if-blokken.
function updateSysDot(ernst){
  const sd=document.getElementById('sysdot'); if(!sd) return;
  sd.className='tdot '+(ernst>=2?'r':(ernst===1?'o':'g'));
  const sc=document.getElementById('sysChip');
  if(sc) sc.title=ernst>=2?'Systeemstatus: actie nodig — tik voor details'
    :(ernst===1?'Systeemstatus: let op — tik voor details':'Systeemstatus: alles goed — tik voor details');
}
// Tik op de systeem-chip: klap de vier losse chips uit/in. Zelfde reparenting-
// truc als toggleKebab() hierboven — .sys-drop zit anders klem in .topbar,
// dat om lay-outredenen overflow:hidden heeft.
function toggleSysStatus(e){
  if(e) e.stopPropagation();
  const d=document.getElementById('tprDetail'); if(!d) return;
  if(d.classList.contains('open')){ d.classList.remove('open'); return; }
  const btn=document.getElementById('sysChip');
  const r=btn?btn.getBoundingClientRect():null;
  if(d.parentElement!==document.body) document.body.appendChild(d);
  d.style.position='fixed';
  d.style.top=((r?r.bottom:46)+6)+'px';
  d.style.right=(r?Math.max(6,window.innerWidth-r.right):8)+'px';
  d.style.left='auto';
  d.style.zIndex='9560';
  d.classList.add('open');
}
function closeSysStatus(){
  const d=document.getElementById('tprDetail'); if(d) d.classList.remove('open');
}
document.addEventListener('click',(e)=>{
  // Zie de kebab-listener hierboven voor dezelfde reden: na reparenting zit
  // #tprDetail niet meer ín #sysChip, dus allebei moeten als "binnen" gelden.
  const chip=document.getElementById('sysChip'), d=document.getElementById('tprDetail');
  const binnen=(chip && chip.contains(e.target)) || (d && d.contains(e.target));
  if(d && d.classList.contains('open') && !binnen) closeSysStatus();
});
// Lichte bereikbaarheidscheck van de proxy (no-cors: elke netwerkrespons telt als bereikbaar)
async function checkAiReachable(){
  if(typeof PROXY_URL==='undefined' || !PROXY_URL){ _aiReach=null; try{updateTopbarStatus();}catch(e){ console.warn('updateTopbarStatus mislukt:', e); } return; }
  try{ await fetch(PROXY_URL,{method:'GET',mode:'no-cors',cache:'no-store'}); _aiReach=true; }
  catch(e){ _aiReach=false; }
  try{ updateTopbarStatus(); }catch(e){ console.warn('updateTopbarStatus mislukt:', e); }
}
// Tik op OBD-dot: niet verbonden → verbindscherm; verbonden → verbreken bevestigen
function obdChipTap(){
  if(connected||demoMode){
    const info=_connSpeed?('⚡ '+_connSpeed.readsPerSec+' reads/s · 📡 '+_connSpeed.pids+' PIDs\n\n'):'';
    if(confirm(info+(demoMode?'Demo modus stoppen?':'OBD-verbinding verbreken?'))) handleConnect();
  } else {
    document.getElementById('connOv').classList.remove('hidden');
  }
}
// Fix 19-07: handles + guards zodat deze globale diensten niet stapelen
// wanneer dit blok bij een herstart nogmaals wordt doorlopen.
if(!window._topbarTimer) window._topbarTimer=setInterval(()=>{ try{updateTopbarStatus();}catch(e){ console.warn('updateTopbarStatus mislukt:', e); } },2000);   // dots actueel houden
if(!window._aiPingTimer) window._aiPingTimer=setInterval(()=>{ try{checkAiReachable();}catch(e){ console.warn('checkAiReachable mislukt:', e); } },300000);   // proxy elke 5 min pingen
setTimeout(()=>{ try{checkAiReachable();}catch(e){ console.warn('checkAiReachable mislukt:', e); } },1500);             // eerste check na opstart
async function handleConnect(){
  if(connected){
    saveSession();   // idee 2: sessie-stats in voertuigdossier bewaren vóór verbreken
    connected=false; demoMode=false; clearInterval(pollTimer);
    // Test-scenario opheffen wanneer demo/verbinding stopt
    _scenario={ enabled:false, pids:{}, dtcs:[], vehicle:null };
    try{ updateScenarioBadge(); }catch(e){ console.warn('updateScenarioBadge mislukt:', e); }
    try{ localStorage.removeItem('pl_autoconn'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ } // bewust verbroken — niet auto-herverbinden
    try{
      if(window._sppConn){
        await window._sppConn.spp.disconnect({address:window._sppConn.address}).catch(()=>{});
      }
    }catch(e){ /* stil: opruimen: verbinding kan al weg zijn */ }
    try{window._bleConn?.ble?.disconnect?.(window._bleConn.id);}catch(e){ /* stil: opruimen: verbinding kan al weg zijn */ }
    window._sppConn=null; window._bleConn=null; window._webBtWrite=null;
    setConn(false);
    try{ const _vt=document.getElementById('vtag'); if(_vt){ _vt.style.display='none'; _vt.dataset.naam=''; } }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
    pidVals={}; pidHist={}; pidSmooth={}; stabilityCount={}; dataStable=false; window._stabilityT0=null;
    log('Verbinding verbroken','warn');
  } else {
    document.getElementById('connOv').classList.remove('hidden');
  }
}

// BT-socket netjes loslaten als de app sluit of naar de achtergrond gaat —
// anders blijft de SPP-verbinding (en het blauwe lampje op de adapter) hangen.
// 2026-07-26: óók de Web Serial-poort. Die bleef bij een verversing in Chrome
// open staan mét een draaiende reader-loop terwijl de nieuwe pagina al aan het
// laden was. Dat verklaart zowel de "port already open"-fout bij herverbinden
// als het onderuitgaan van het tabblad bij een per ongeluk ververste pagina.
window.addEventListener('pagehide',()=>{
  try{ if(connected&&!demoMode) saveSession(); }catch(e){ console.warn('saveSession mislukt:', e); }
  try{ if(window._sppConn) window._sppConn.spp.disconnect({address:window._sppConn.address}).catch(()=>{}); }catch(e){ /* stil: opruimen: verbinding kan al weg zijn */ }
  try{ if(typeof disconnectWebSerial==='function') disconnectWebSerial(); }catch(e){ console.warn('disconnectWebSerial mislukt:', e); }
});
function sw(name,el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  if(el && el.classList) el.classList.add('active');
  const pane=document.getElementById('pane-'+name);
  if(pane) pane.classList.add('active');
  if(name==='graph') setTimeout(drawGraph,50);
  // PID-selectie alleen bij live/graph; andere panes vergrendeld verbergen
  if(typeof setLeftPanelForMode==='function') setLeftPanelForMode(name);
}
// Schakel het midden naar het AI-resultaatscherm (Snelle AI / losse analyses)
function activateAIPane(){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  const pane=document.getElementById('pane-ai'); if(pane) pane.classList.add('active');
  const tb=document.querySelector('.tb'); if(tb) tb.scrollTop=0;
  if(typeof setLeftPanelForMode==='function') setLeftPanelForMode('ai');
}
// Launcher vanuit de rechter AI-kolom: opent het invulscherm in het MIDDEN.
// De bijbehorende tab is verwijderd, dus geen tab-knop om te markeren.
// ══════════════════════════════════════════════════════
// READINESS KAARTJE — inline status boven elke analyse-startknop
// Toont % beschikbare PIDs, voortgangsbalk, motortype-badge
// ══════════════════════════════════════════════════════
// PIDs per analyse — welke wil je idealiter hebben?
// → ANALYSE_PID_SETS verplaatst naar pidlane-data.js

function renderReadinessCard(elId, profile){
  const el = document.getElementById(elId);
  if(!el) return;

  // Niet verbonden
  if(!connected && !demoMode){
    el.className = 'rdy-card off';
    el.innerHTML = '📡 Verbind adapter om sensorstatus te laden';
    return;
  }

  // Gebruik waar mogelijk de ECHTE analyse-PID-set (ANALYSE_PIDS), zodat de
  // kaart klopt met wat de analyse daadwerkelijk activeert. Voor profielen die
  // daar niet in staan (monteur/koop/dtc) valt het terug op ANALYSE_PID_SETS.
  const realMap = { totaal:'totaal', rit:'rit', monteur:'basis', koop:'totaal', dtc:'basis' };
  const realKey = realMap[profile];
  // Gebruik de slimme set (basis + relevante ondersteunde sensoren) waar mogelijk
  let pidList;
  if(realKey && typeof relevantSupportedPIDs==='function'){
    pidList = relevantSupportedPIDs(realKey);
  } else {
    pidList = (typeof ANALYSE_PIDS!=='undefined' && realKey && ANALYSE_PIDS[realKey])
              || ANALYSE_PID_SETS[profile] || [];
  }
  const discoveryDone = supportedPIDs && supportedPIDs.size > 0;
  let beschikbaar = 0, ontbreekt = 0;
  pidList.forEach(pid => {
    if(demoMode || !discoveryDone || supportedPIDs.has(pid)) beschikbaar++;
    else ontbreekt++;
  });
  const pct = pidList.length ? Math.round((beschikbaar / pidList.length) * 100) : 100;

  // Motortype badge
  const bf = (vehicleInfo?.brandstof || '').toLowerCase();
  let motorBadge = '';
  if(bf.includes('hybr')) motorBadge = ' 🔋 hybride';
  else if(bf.includes('elektr')) motorBadge = ' ⚡ elektrisch';
  else if(bf.includes('diesel')) motorBadge = ' 🛢 diesel';

  const cls = demoMode ? 'ok' : pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad';
  const barColor = cls === 'ok' ? 'var(--gn)' : cls === 'warn' ? 'var(--or)' : 'var(--rd)';
  const icon = cls === 'ok' ? '✅' : cls === 'warn' ? '⚠️' : '🔴';

  el.className = 'rdy-card ' + cls;
  el.innerHTML = `
    <div class="rdy-row">
      <span style="font-weight:700">${icon} ${demoMode ? 'Demo' : beschikbaar + ' van ' + pidList.length} PIDs beschikbaar${motorBadge}</span>
      <span class="rdy-badge">${pct}%</span>
    </div>
    <div class="rdy-bar"><div class="rdy-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
    ${ontbreekt > 0 && !demoMode ? `<div style="font-size:12px;color:var(--tx2)">⚠ ${ontbreekt} sensor(en) niet gevonden op dit voertuig</div>` : ''}`;
}

// Roep readiness bij tab-wissel aan
function refreshAllReadiness(){
  renderReadinessCard('rdyTotaal',  'totaal');
  renderReadinessCard('rdyMonteur', 'monteur');
  renderReadinessCard('rdyDtc',     'dtc');
  renderReadinessCard('rdyKoop',    'koop');
  renderReadinessCard('rdyRit',     'rit');
  try{ renderBasicReadiness(); }catch(e){ console.warn('renderBasicReadiness mislukt:', e); }
}
// Basic system check: toon hoeveel tests er voor deze auto beschikbaar zijn.
function renderBasicReadiness(){
  const el=document.getElementById('rdyBasic'); if(!el) return;
  if(!connected && !demoMode){ el.className='rdy-card off'; el.innerHTML='📡 Verbind adapter om te starten'; return; }
  let list=[]; try{ list=bscBuildList(); }catch(e){ console.warn('bscBuildList mislukt:', e); }
  const et=(typeof detectEngineType==='function')?detectEngineType():'benzine';
  if(!list.length){ el.className='rdy-card warn'; el.innerHTML='⚠ Geen geschikte sensoren gevonden — voer eerst een PID-scan uit'; return; }
  el.className='rdy-card ok';
  el.innerHTML=`✅ ${list.length} tests klaar voor <b>${et}</b> — sensoren worden automatisch gekozen`;
}
