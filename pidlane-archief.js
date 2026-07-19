/* pidlane-archief.js — uitgelicht uit index.html (build 2026-07-19, splitronde 2).
   Laadt als <script src> op exact de oorspronkelijke positie in de
   documentvolgorde; top-level declaraties zijn in klassieke scripts
   globaal over blokgrenzen heen, dus alle bestaande aanroepen blijven
   ongewijzigd werken. Inhoud: sessie-rapportarchief (Rapporten-overzicht) incl. AI-contextkeuze. */
// ════════════════════════════════════════════════════════════════
//  SESSIE-RAPPORTARCHIEF
//  Alle rapporten van deze sessie blijven in het geheugen bewaard tot de
//  app wordt gesloten (bewust GEEN localStorage — sessie-gebonden):
//   • AI-rapporten     — via setter-hook op window._lastAIReport
//   • Foutcode-scans   — via registratie in scanDTC()
//   • TXT-exports      — via wrapper om download() (on load)
//   • PDF-rapporten    — via registratie na window._lastPdf in exportAIReportPDF
//  De AI krijgt eerdere rapporten automatisch als context mee: apiFetch()
//  plakt _sessionReportsPromptBlock() achter de system prompt, zodat een
//  volgende prompt kan voortbouwen op wat er al geconcludeerd is.
// ════════════════════════════════════════════════════════════════
window._sessionReports = window._sessionReports || [];
window._srSilent = false;   // true = _lastAIReport-set NIET archiveren (bv. bij terugkijken)
let _srSeq = 0;

function _srTypeMeta(type){
  return {
    ai:  {ic:'🔬', lbl:'AI-rapport'},
    dtc: {ic:'🔴', lbl:'Foutcode-uitlezing'},
    txt: {ic:'📝', lbl:'TXT-rapport'},
    pdf: {ic:'📄', lbl:'PDF-rapport'}
  }[type] || {ic:'📄', lbl:'Rapport'};
}
function _srAutoTitle(entry){
  try{
    const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)?vehicleInfo:{};
    const veh=[v.merk,v.model].filter(Boolean).join(' ');
    // Eerste betekenisvolle regel van de tekst als titel (zonder markdown-ruis)
    const first=String(entry.text||'').split('\n').map(s=>s.replace(/[#*]/g,'').trim()).find(s=>s.length>3)||'';
    const base=first.slice(0,58)||_srTypeMeta(entry.type).lbl;
    return veh?base+(base.toLowerCase().includes((v.merk||'').toLowerCase())?'':' — '+veh):base;
  }catch(e){ return _srTypeMeta(entry.type).lbl; }
}
function registerSessionReport(entry){
  try{
    const list=window._sessionReports;
    const txt=String(entry.text||'').trim();
    if(!txt && entry.type!=='pdf') return null;
    // Dedupe: identieke tekst als de laatste entry van hetzelfde type → niet dubbel archiveren
    // (vangt o.a. TXT-download van een rapport dat al via de setter is gearchiveerd,
    //  en herhaald openen/opnieuw zetten van hetzelfde rapport)
    for(let i=list.length-1;i>=0;i--){
      if(list[i].type===entry.type){
        if(entry.type!=='pdf' && list[i].text===txt) return list[i];
        break;
      }
    }
    const rec={
      id:'sr'+(++_srSeq)+'_'+Date.now(),
      type:entry.type||'ai',
      title:entry.title||_srAutoTitle(entry),
      text:txt,
      html:entry.html||null,
      blob:entry.blob||null,
      fname:entry.fname||null,
      ts:(entry.ts instanceof Date && !isNaN(entry.ts))?entry.ts:new Date()
    };
    list.push(rec);
    _srUpdateBadge();
    try{ logUsage?.('sessie_rapport','type='+rec.type+';n='+list.length); }catch(e){}
    return rec;
  }catch(e){ return null; }
}
function _srUpdateBadge(){
  try{
    const b=document.getElementById('bnRepCnt'); if(!b) return;
    const n=(window._sessionReports||[]).length;
    b.textContent=n>9?'9+':String(n);
    b.style.display=n?'block':'none';
  }catch(e){}
}
// Setter-hook: elke bestaande (en toekomstige) toewijzing aan window._lastAIReport
// archiveert automatisch — geen 5+ losse callsites aanpassen.
(function _srHookLastAIReport(){
  let _val = window._lastAIReport || null;
  try{
    Object.defineProperty(window,'_lastAIReport',{
      configurable:true,
      get(){ return _val; },
      set(v){
        _val=v;
        try{
          if(v && v.text && !window._srSilent){
            registerSessionReport({type:'ai', text:v.text, html:v.html||null, ts:v.ts});
          }
        }catch(e){}
      }
    });
  }catch(e){ /* defineProperty geweigerd → archief werkt dan alleen via expliciete hooks */ }
})();
// TXT-download hook: pas na window-load wrappen zodat download() zeker bestaat.
window.addEventListener('load',function(){
  try{
    if(typeof window.download==='function' && !window.download._srWrapped){
      const _orig=window.download;
      const wrapped=async function(name,content){
        try{
          if(/\.txt$/i.test(String(name||'')) && typeof content==='string' && content.trim()){
            registerSessionReport({type:'txt', title:String(name), text:content, fname:String(name)});
          }
        }catch(e){}
        return _orig.apply(this,arguments);
      };
      wrapped._srWrapped=true;
      window.download=wrapped;
    }
  }catch(e){}
  _srUpdateBadge();
});
// Leesbare tekst van de huidige foutcode-stand (voor archief + AI-context)
function _srDtcText(){
  try{
    const v=(typeof getVehicle==='function')?getVehicle():{};
    const L=['Foutcode-uitlezing — '+new Date().toLocaleString('nl-NL')];
    if(v.merk) L.push('Voertuig: '+[v.merk,v.model,v.year].filter(Boolean).join(' '));
    if(!dtcCodes.length){ L.push('Geen actieve foutcodes — alle systemen OK.'); }
    else dtcCodes.forEach(c=>{ const i=(typeof dtcInfo==='function')?dtcInfo(c):null; L.push(c+' — '+(i?i.desc:'Onbekende code')+(i&&i.sev?' [ernst: '+i.sev+']':'')); });
    return L.join('\n');
  }catch(e){ return 'Foutcode-uitlezing: '+(Array.isArray(dtcCodes)?dtcCodes.join(', ')||'geen codes':'?'); }
}
// ── Keuze: eerdere rapporten meenemen in een nieuwe analyse? ──
// null = nog niet gekozen → vraag tonen bij de eerstvolgende analyse;
// true/false = onthouden sessiekeuze (aanpasbaar in het Rapporten-overzicht).
window._srUseContext = null;
let _srAskPending = null;
function _srAskUseContext(){
  if(_srAskPending) return _srAskPending;
  _srAskPending = new Promise(res=>{
    let ov=document.getElementById('srCtxAsk');
    if(!ov){ ov=document.createElement('div'); ov.id='srCtxAsk'; ov.className='ai-sheet-ov'; ov.style.zIndex='9920'; document.body.appendChild(ov); }
    const n=(window._sessionReports||[]).filter(r=>r.text&&r.type!=='pdf').length;
    ov.innerHTML='<div class="ai-sheet" style="max-width:420px">'+
      '<div class="ai-sheet-h"><b>📄 Eerdere rapporten meenemen?</b></div>'+
      '<div class="ai-sheet-b">'+
        '<div style="font-size:12px;color:var(--tx2);line-height:1.5">Er '+(n===1?'is 1 eerder rapport':'zijn '+n+' eerdere rapporten')+' in deze sessie. Wil je dat de AI die als context gebruikt bij deze analyse — bijvoorbeeld om te melden of een eerdere bevinding is verbeterd of verslechterd?</div>'+
        '<label style="display:flex;align-items:center;gap:7px;margin-top:12px;font-size:11px;color:var(--tx3);cursor:pointer"><input type="checkbox" id="srCtxRemember" checked style="accent-color:var(--bl)"> Onthoud mijn keuze voor deze sessie</label>'+
      '</div>'+
      '<div class="ai-sheet-f"><button class="ai-act" id="srCtxNo">Nee, alleen deze meting</button><button class="ai-act pri" id="srCtxYes">Ja, neem mee</button></div>'+
    '</div>';
    const done=(v,remember)=>{
      if(remember) window._srUseContext=v;
      ov.style.display='none'; _srAskPending=null; window._srCtxDismiss=null; res(v);
    };
    ov.querySelector('#srCtxYes').onclick=()=>done(true, !!document.getElementById('srCtxRemember')?.checked);
    ov.querySelector('#srCtxNo').onclick =()=>done(false, !!document.getElementById('srCtxRemember')?.checked);
    // Wegklikken / hardware-back = deze keer niet meenemen, keuze NIET onthouden
    window._srCtxDismiss=()=>done(false,false);
    ov.onclick=e=>{ if(e.target===ov) window._srCtxDismiss?.(); };
    ov.style.display='flex';
  });
  return _srAskPending;
}
function srSetCtxMode(m){
  window._srUseContext = m==='on' ? true : m==='off' ? false : null;
  try{ openReportsOverview(); }catch(e){}   // overzicht verversen met nieuwe stand
}
// Contextblok met eerdere sessie-rapporten voor AI-prompts.
// Compact gehouden (tokenbudget): max 4 rapporten, nieuwste eerst gekozen maar
// chronologisch gepresenteerd, per rapport ingekort, totaal ~6000 tekens.
function _sessionReportsPromptBlock(currentPrompt){
  try{
    const list=(window._sessionReports||[]).filter(r=>r.text && r.type!=='pdf');
    if(!list.length) return '';
    const cur=String(currentPrompt||'');
    const picked=[]; const seen=[];
    for(let i=list.length-1;i>=0 && picked.length<4;i--){
      const t=list[i].text.trim(); if(!t) continue;
      // Al (deels) in de huidige prompt (bv. bij "herzie rapport")? → overslaan
      if(cur && t.length>80 && cur.indexOf(t.slice(0,200))!==-1) continue;
      // Duplicaat/deelverzameling van al gekozen tekst? → overslaan
      if(seen.some(s=>s===t||s.indexOf(t)!==-1||t.indexOf(s)!==-1)) continue;
      seen.push(t); picked.unshift(list[i]);
    }
    if(!picked.length) return '';
    let out='\n\nEERDERE RAPPORTEN DEZE SESSIE (zelfde meetsessie — gebruik als context en verwijs ernaar waar relevant, bv. of een eerdere bevinding is verbeterd/verslechterd; herhaal ze niet integraal):';
    let budget=6000;
    picked.forEach((r,i)=>{
      let t=r.text.replace(/[ \t]+\n/g,'\n').trim();
      const cap=Math.max(400,Math.min(1800,budget));
      if(t.length>cap) t=t.slice(0,cap)+'\n[...rapport ingekort voor context...]';
      budget-=t.length;
      out+='\n--- Rapport '+(i+1)+' ('+_srTypeMeta(r.type).lbl+', '+r.ts.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})+') ---\n'+t;
    });
    return out;
  }catch(e){ return ''; }
}
// ── Overzicht-UI ──
function openReportsOverview(){
  let ov=document.getElementById('reportsOverviewSheet');
  if(!ov){ ov=document.createElement('div'); ov.id='reportsOverviewSheet'; ov.className='ai-sheet-ov'; ov.style.zIndex='9890'; document.body.appendChild(ov);
    ov.addEventListener('click',e=>{ if(e.target===ov) closeReportsOverview(); });
  }
  const list=[...(window._sessionReports||[])].reverse(); // nieuwste boven
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let rows='';
  if(!list.length){
    rows='<div class="emp" style="padding:26px 0"><div class="ei">📄</div><h3>Nog geen rapporten</h3><p>Start een analyse of scan foutcodes — alles verschijnt hier.</p></div>';
  }else{
    rows=list.map(r=>{
      const m=_srTypeMeta(r.type);
      const tijd=r.ts.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
      let acts='';
      if(r.type==='pdf'){ acts='<button class="ai-act pri" style="padding:6px 12px;font-size:11px" onclick="srShare(\''+r.id+'\')">💾 Delen / Download</button>'; }
      else { acts='<button class="ai-act pri" style="padding:6px 12px;font-size:11px" onclick="srOpen(\''+r.id+'\')">👁 Bekijk</button>'+
                  '<button class="ai-act" style="padding:6px 12px;font-size:11px" onclick="srShare(\''+r.id+'\')">↗ Deel</button>'; }
      return '<div style="display:flex;gap:10px;align-items:center;padding:11px 2px;border-bottom:1px solid var(--bd)">'+
        '<div style="font-size:20px;flex:none">'+m.ic+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:12px;font-weight:800;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(r.title)+'</div>'+
          '<div style="font-size:10px;color:var(--tx3)">'+m.lbl+' · '+tijd+(r.fname?' · '+esc(r.fname):'')+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex:none">'+acts+'</div>'+
      '</div>';
    }).join('');
  }
  const mode=window._srUseContext===true?'on':window._srUseContext===false?'off':'ask';
  const seg=(id,lbl)=>{const act=mode===id;return '<button onclick="srSetCtxMode(\''+id+'\')" style="flex:1;padding:6px 4px;border-radius:8px;border:1px solid '+(act?'var(--bl)':'var(--bd)')+';background:'+(act?'rgba(26,111,255,.12)':'var(--sur2)')+';color:'+(act?'var(--bl)':'var(--tx3)')+';font-size:10px;font-weight:800;cursor:pointer;font-family:var(--f)">'+lbl+'</button>';};
  ov.innerHTML='<div class="ai-sheet">'+
    '<div class="ai-sheet-h"><b>📄 Rapporten deze sessie ('+list.length+')</b><button class="ai-sheet-x" onclick="closeReportsOverview()">✕</button></div>'+
    '<div class="ai-sheet-b">'+
      '<div style="font-size:10px;color:var(--tx3);margin-bottom:6px">Bewaard tot de app wordt gesloten.</div>'+
      '<div style="border:1px solid var(--bd);border-radius:10px;padding:9px 10px;margin-bottom:10px;background:var(--sur2)">'+
        '<div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:2px">🤖 Meenemen in nieuwe analyse</div>'+
        '<div style="font-size:10px;color:var(--tx3);margin-bottom:7px">Gebruikt de AI eerdere rapporten als context bij een volgende analyse?</div>'+
        '<div style="display:flex;gap:5px">'+seg('ask','❓ Vragen')+seg('on','✅ Altijd')+seg('off','🚫 Nooit')+'</div>'+
      '</div>'+
      rows+
    '</div>'+
  '</div>';
  ov.style.display='flex';
}
function closeReportsOverview(){ const o=document.getElementById('reportsOverviewSheet'); if(o) o.style.display='none'; }
function srOpen(id){
  const r=(window._sessionReports||[]).find(x=>x.id===id); if(!r) return;
  if(r.type==='ai'){
    // Rapport terugzetten als "actief" rapport zodat Deel/PDF/Herzie erop werken.
    // _srSilent voorkomt dat het terugkijken een duplicaat in het archief zet.
    window._srSilent=true;
    try{ window._lastAIReport={text:r.text, html:r.html||_aiReportHtml(r.text), ts:r.ts}; }
    finally{ window._srSilent=false; }
    closeReportsOverview();
    try{ openAIReportSheet(); }catch(e){}
    return;
  }
  if(r.type==='pdf'){ srShare(id); return; }
  // dtc / txt: eenvoudige tekstweergave
  let ov=document.getElementById('srTextSheet');
  if(!ov){ ov=document.createElement('div'); ov.id='srTextSheet'; ov.className='ai-sheet-ov'; ov.style.zIndex='9910'; document.body.appendChild(ov);
    ov.addEventListener('click',e=>{ if(e.target===ov) ov.style.display='none'; });
  }
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const m=_srTypeMeta(r.type);
  ov.innerHTML='<div class="ai-sheet">'+
    '<div class="ai-sheet-h"><b>'+m.ic+' '+esc(r.title)+'</b><button class="ai-sheet-x" onclick="document.getElementById(\'srTextSheet\').style.display=\'none\'">✕</button></div>'+
    '<div class="ai-sheet-b"><div style="white-space:pre-wrap;font-size:12px;line-height:1.55;color:var(--tx)">'+esc(r.text)+'</div></div>'+
    '<div class="ai-sheet-f"><button class="ai-act" onclick="srShare(\''+r.id+'\')">↗ Deel</button><button class="ai-act pri" onclick="srDownloadTxt(\''+r.id+'\')">⬇ Download .txt</button></div>'+
  '</div>';
  ov.style.display='flex';
}
async function srShare(id){
  const r=(window._sessionReports||[]).find(x=>x.id===id); if(!r) return;
  if(r.type==='pdf'){
    if(!r.blob){ showToast?.('PDF niet meer beschikbaar — genereer opnieuw'); return; }
    window._lastPdf={blob:r.blob, fname:r.fname||'PidLane-rapport.pdf'};
    try{ showPdfReadyModal(); }catch(e){}
    return;
  }
  try{
    const blob=new Blob([r.text],{type:'text/plain'});
    const fname=r.fname||((typeof _niceReportName==='function')?_niceReportName('txt'):'PidLane-rapport.txt');
    if(await nativeShareFile(blob,fname)) return;
  }catch(e){}
  try{
    if(navigator.share){ await navigator.share({title:r.title, text:r.text}); }
    else if(navigator.clipboard){ await navigator.clipboard.writeText(r.text); showToast?.('Rapport naar klembord gekopieerd'); }
  }catch(e){}
}
async function srDownloadTxt(id){
  const r=(window._sessionReports||[]).find(x=>x.id===id); if(!r||!r.text) return;
  const fname=r.fname||((typeof _niceReportName==='function')?_niceReportName('txt'):'PidLane-rapport.txt');
  try{ await download(fname, r.text); }catch(e){}
}

// ── BACK-NAVIGATIE + ANDROID HARDWARE-BACK ──
// De fysieke Android-back-knop sloot voorheen per ongeluk de app. Nu loopt
// back netjes terug: open overlay → terug; deur-paneel → terug naar de
// 4 keuzes; in een mode → terug naar home. Pas op de home-landing (root)
// vraagt een tweede tik om écht af te sluiten.
function appBack(){
  // 0. Open lade (sensoren/logs) eerst sluiten
  try{ if(ladeOpen()){ closeLades(); return true; } }catch(e){}
  // 0b. Context-keuzesheet open? Netjes afwijzen (promise resolven, niet hangen)
  try{ const c=document.getElementById('srCtxAsk'); if(c && getComputedStyle(c).display!=='none'){ window._srCtxDismiss?.(); return true; } }catch(e){}
  // 1. AI-rapport sheet of bekende modals/overlays open? sluit de bovenste.
  for(const id of ['srTextSheet','aiReportSheet','pdfReadyModal','reportsOverviewSheet','optResultModal','scenarioModal','btLogModal','ritFocusModal','apiDialog','hudPicker','bandenInfoModal','proefritKeuzeModal','logCenter','vehOverview','demoCarModal']){
    const el=document.getElementById(id);
    if(el && getComputedStyle(el).display!=='none'){ el.style.display='none'; return true; }
  }
  // 2. Dashboards / sub-overlays met eigen display
  let closed=false;
  ['onderhoudDash','evDash','langeRitDash'].forEach(id=>{ const el=document.getElementById(id); if(el && getComputedStyle(el).display!=='none'){ el.style.display='none'; closed=true; } });
  if(closed){ try{ goHome(); }catch(e){} return true; }
  try{ if(typeof closeRitAnalyse==='function'){ const r=document.getElementById('ritAnalyseOv')||document.getElementById('ritAnalyse'); if(r && getComputedStyle(r).display!=='none'){ closeRitAnalyse(); return true; } } }catch(e){}
  // 3. Welkomstscherm zichtbaar?
  const ws=document.getElementById('welcomeScreen');
  if(ws && !ws.classList.contains('hidden')){
    const doorOpen=[...document.querySelectorAll('.wm-door-panel')].some(p=>getComputedStyle(p).display!=='none');
    if(doorOpen){ backToDoors(); return true; }
    return false; // op de root-keuze → niet automatisch afsluiten
  }
  // 4. In een mode/pane → terug naar home
  try{ goHome(); return true; }catch(e){}
  return false;
}
function _plBackHandler(){
  let handled=false;
  try{ handled=appBack(); }catch(e){}
  if(!handled){
    // Root bereikt: tweede tik binnen 2s sluit de app pas écht af.
    if(window._plExitArmed){ try{ window.Capacitor?.Plugins?.App?.exitApp?.(); }catch(e){} }
    else { window._plExitArmed=true; try{ showToast?.('Tik nogmaals op terug om af te sluiten',2000); }catch(e){} setTimeout(()=>{ window._plExitArmed=false; },2000); }
  }
}
function setupBackButton(){
  if(window._plBackReady) return; window._plBackReady=true;
  const A=window.Capacitor?.Plugins?.App;
  if(A&&A.addListener){
    // Capacitor (APK): vang de hardware-back op; default (afsluiten) wordt onderdrukt.
    try{ A.addListener('backButton',()=>{ _plBackHandler(); }); return; }catch(e){}
  }
  // Browser/WebView zonder App-plugin: history-trap zodat back niet de pagina verlaat.
  try{
    history.pushState({pl:1},'');
    window.addEventListener('popstate',()=>{ _plBackHandler(); history.pushState({pl:1},''); });
  }catch(e){}
}
document.addEventListener('DOMContentLoaded', setupBackButton);

// ── ON-TOP LADES (sensoren + logs) ──
// PID-menu (#slPanel) en logboek (#logbar) schuiven als bottom-sheet op,
// blijven boven het werkscherm (niets cancelt) en zijn uitvouwbaar naar boven.
function initLades(){
  const sl=document.getElementById('slPanel');
  if(sl && !sl.querySelector('.lade-bar')){
    const bar=document.createElement('div'); bar.className='lade-bar';
    bar.innerHTML='<b style="font-size:13px">🚗 Sensoren &amp; PIDs</b><div class="sp"></div>'
      +'<button class="lade-x" title="Vergroten/verkleinen" onclick="toggleLadeTall(\'slPanel\')">⤢</button>'
      +'<button class="lade-x" title="Sluiten" onclick="closeLades()">✕</button>';
    sl.insertBefore(bar, sl.firstChild);
  }
  // Portal: #slPanel naar <body>. #appScale krijgt transform:scale() (zoom)
  // en een transform maakt de voorouder het referentiepunt voor position:fixed-
  // kinderen — daardoor belandde de lade zwevend/half zichtbaar in de content
  // (verticale label, lege inhoud). Op <body> is fixed altijd viewport-gebonden
  // (zelfde bewezen patroon als het ⋯-menu).
  if(sl && sl.parentNode!==document.body) document.body.appendChild(sl);
  // Log-lade bewust NIET meer aanmaken: logs lopen uitsluitend via het
  // log-centrum (⋯-menu → "📋 Logs & data"). #logbar blijft verborgen bestaan
  // als schrijfdoel van log(); localLog voedt het log-centrum.
}
function toggleLade(id){
  const el=document.getElementById(id); if(!el) return;
  const open=el.classList.contains('lade-open');
  closeLades();
  if(!open){ el.classList.add('lade-open'); if(id==='slPanel'){ el.classList.add('lade-tall'); try{ setPidView('dots'); }catch(e){} } }
}
function closeLades(){ ['slPanel','logLade'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.remove('lade-open'); }); }
function toggleLadeTall(id){ const el=document.getElementById(id); if(el) el.classList.toggle('lade-tall'); }
function ladeOpen(){ return ['slPanel','logLade'].some(id=>{ const el=document.getElementById(id); return el && el.classList.contains('lade-open'); }); }
document.addEventListener('DOMContentLoaded', initLades);

// ── Linkerpaneel (PID-selectie) per analyse vergrendelen ───────────
// Veel modes hebben geen handmatige PID-keuze nodig. Die verbergen we dan
// vergrendeld (geen auto-hide-flikker), met een knop om hem toch te tonen.
// PID-selectie is alleen zinvol bij Live data en Grafiek.
const PID_RELEVANT = new Set(['live','graph']);
let _slLocked=false;
function setLeftPanelForMode(mode){
  const needsPID = PID_RELEVANT.has(mode);
  if(needsPID){
    _slLocked=false;
    unlockLeftPanel();        // gebruiker mag zelf in/uitklappen
    if(slCollapsed) toggleSL();// en standaard open
  } else {
    _slLocked=true;
    if(!slCollapsed){ slCollapsed=true; document.getElementById('appGrid').classList.add('sl-col'); clearSLAutoHide?.(); }
    lockLeftPanel();             // verberg de toggle-knop, toon 'toon'-knopje
  }
  updateSLToggleIcon();
}
function lockLeftPanel(){
  const grid=document.getElementById('appGrid');
  if(grid) grid.classList.add('sl-locked');
  clearSLAutoHide?.();
  updateSLToggleIcon();
}
function unlockLeftPanel(){
  const grid=document.getElementById('appGrid');
  if(grid) grid.classList.remove('sl-locked');
  updateSLToggleIcon();
}
// Tijdelijk tonen ondanks lock (gebruiker tikt 'Sensoren tonen')
function revealLeftPanel(){
  slCollapsed=false;
  document.getElementById('appGrid').classList.remove('sl-col');
  unlockLeftPanel();
  _slLocked=false;
  updateSLToggleIcon();
}

function startChoice(choice){
  document.getElementById('welcomeScreen').classList.add('hidden');
  // Inkoop/Verkoop/Lease/Occasion hergebruiken de Koopcheck-pane in eigen modus
  if(choice==='inkoop'||choice==='verkoop'||choice==='lease'||choice==='occasion'){
    setKoopMode(choice);
    openAnalysis('koop');
    return;
  }
  if(choice==='koop') setKoopMode('koop');
  // Verplaatste analyses openen in het midden via de launcher
  if(choice==='check'||choice==='diag'||choice==='fuel'||choice==='koop'||choice==='basiccheck'){
    openAnalysis(choice);
  } else if(choice==='report'){
    openAnalysis('diag');
  } else {
    // Overgebleven tabs: live, graph. Foutcodes is een kaart in deur 1
    // (geen tab meer) — de gebruiker start de scan daar zelf.
    const tabMap={live:0,graph:1};
    const tabs=document.querySelectorAll('.tab');
    if(tabMap[choice]!==undefined) sw(choice,tabs[tabMap[choice]]);
    else if(choice==='dtc') sw('dtc',null);
  }
  if(choice==='report') setTimeout(()=>runQuickAI(),300);
  if(choice==='fuel') setTimeout(()=>runFuelAnalysis(),400);
}
