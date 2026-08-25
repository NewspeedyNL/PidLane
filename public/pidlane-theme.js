// ══════════════════════════════════════════════════════════════════
// pidlane-theme.js
// Thema, lettertype, zoom
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// THEME / FONT / ZOOM
// ════════════════════════════════════════
(function initThemeDefault(){
  var saved=null; try{ saved=localStorage.getItem('ns_theme'); }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
  isDark = true;            // thema-knop verwijderd: altijd donker thema
  document.documentElement.classList.toggle('dark',isDark);
  function setBtn(){ var b=document.getElementById('themeBtn'); if(b) b.textContent=isDark?'☀️':'🌙'; }
  setBtn(); try{ document.addEventListener('DOMContentLoaded',setBtn); }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
})();
// ── BUSY-INDICATOR: duidelijke animatie bij hoog busverkeer ──
// Toont een pill onder de topbar zolang discovery/health-scan/Full Survey de
// bus zwaar belasten (standaard de eerste minuut na verbinden). Zolang de
// Full Survey loopt blijft hij automatisch staan, ook voorbij de minuut.
let _busyPillT=null,_busyPillUntil=0,_busyPillAnnuleer=null;
function showBusyPill(txt,ms,onAnnuleer){
  const p=document.getElementById('busyPill');if(!p)return;
  const t=document.getElementById('busyPillTxt');if(t&&txt)t.textContent=txt;
  // ── ANNULEERKNOP ──────────────────────────────────────────────────
  // Een zware scan van 30-60s zonder uitweg is op een telefoon gewoon een
  // vastloper: de gebruiker weet niet of het hangt of werkt. Wie een
  // annuleerfunctie meegeeft krijgt een ✕ in de pill; wie dat niet doet
  // houdt exact het oude gedrag. De knop wordt hier aangemaakt en niet in
  // index.html gezet, zodat de div-balans van dat bestand ongemoeid blijft.
  _busyPillAnnuleer = (typeof onAnnuleer==='function') ? onAnnuleer : null;
  let x=document.getElementById('busyPillX');
  if(_busyPillAnnuleer){
    if(!x){
      x=document.createElement('button');
      x.id='busyPillX'; x.type='button';
      x.setAttribute('aria-label','Annuleren');
      x.textContent='✕';
      x.onclick=function(){
        const fn=_busyPillAnnuleer; _busyPillAnnuleer=null;
        try{ if(fn) fn(); }catch(e){ console.warn('fn() — callback van de aanroeper mislukt:', e); }
        hideBusyPill();
      };
      p.appendChild(x);
    }
    x.style.display='';
  } else if(x){ x.style.display='none'; }
  p.classList.add('on');
  _busyPillUntil=Math.max(_busyPillUntil,Date.now()+(ms||60000));
  if(_busyPillT)return;
  _busyPillT=setInterval(()=>{
    if(typeof _vlSvBusy!=='undefined'&&_vlSvBusy)
      _busyPillUntil=Math.max(_busyPillUntil,Date.now()+4000);   // survey loopt nog
    if(Date.now()>=_busyPillUntil)hideBusyPill();
  },1000);
}
function hideBusyPill(){
  const p=document.getElementById('busyPill');if(p)p.classList.remove('on');
  const x=document.getElementById('busyPillX'); if(x) x.style.display='none';
  _busyPillAnnuleer=null;
  clearInterval(_busyPillT);_busyPillT=null;_busyPillUntil=0;
}

// ── BEVESTIGING: ja/nee-modaal ────────────────────────────────────────
// De app had geen eigen bevestigingsdialoog. Native confirm() blokkeert de
// hele JS-thread — funest terwijl een OBD-poll loopt — en negeert het thema.
// Deze bouwt zijn eigen DOM (dus geen markup in index.html, geen invloed op
// de div-balans) en geeft een Promise<boolean> terug.
//   Esc / klik-buiten / ✕  → false, net als "Nee".
function plBevestig(vraag, jaTekst, neeTekst, titel){
  return new Promise(resolve=>{
    let klaar=false;
    const af=v=>{ if(klaar)return; klaar=true;
      try{ document.removeEventListener('keydown',esc); }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
      try{ ov.remove(); }catch(e){ /* stil: element kan al weg zijn of ondersteunt dit niet */ }
      resolve(!!v);
    };
    const esc=e=>{ if(e.key==='Escape') af(false); };

    const ov=document.createElement('div');
    ov.className='plBevestigOv';
    ov.onclick=e=>{ if(e.target===ov) af(false); };

    const box=document.createElement('div');
    box.className='plBevestigBox';
    box.setAttribute('role','dialog');
    box.setAttribute('aria-modal','true');

    if(titel){
      const h=document.createElement('div');
      h.className='plBevestigTitel'; h.textContent=titel; box.appendChild(h);
    }
    const p=document.createElement('div');
    p.className='plBevestigTxt'; p.textContent=String(vraag||'');
    box.appendChild(p);

    const rij=document.createElement('div');
    rij.className='plBevestigRij';
    const nee=document.createElement('button');
    nee.type='button'; nee.className='plBevestigBtn nee';
    nee.textContent=neeTekst||'Nee'; nee.onclick=()=>af(false);
    const ja=document.createElement('button');
    ja.type='button'; ja.className='plBevestigBtn ja';
    ja.textContent=jaTekst||'Ja'; ja.onclick=()=>af(true);
    rij.appendChild(nee); rij.appendChild(ja);
    box.appendChild(rij);

    ov.appendChild(box);
    document.body.appendChild(ov);
    try{ document.addEventListener('keydown',esc); }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
    try{ ja.focus(); }catch(e){ /* stil: element kan al weg zijn of ondersteunt dit niet */ }
  });
}
window.plBevestig=plBevestig;
function fontSize(delta){
  currentFont=Math.min(18,Math.max(10,currentFont+delta));
  document.documentElement.style.fontSize=currentFont+'px';
  const fl=document.getElementById('fontLbl'); if(fl) fl.textContent=currentFont;   // ctrl-bar verwijderd — label optioneel
  try{localStorage.setItem('ns_font',currentFont);}catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
}
// TABLET-HARDENING (2026-07-15): het transform-zoom mechanisme is VOLLEDIG
// uitgeschakeld. Er is geen UI meer die zoom() aanroept, en een scale() op
// #appScale was de bron van de "alles staat rechts / topbalk te lang"-bug
// op tablets (en maakt #appScale bovendien containing block voor fixed
// overlays). applyZoom() WIST nu uitsluitend elke eventueel achtergebleven
// inline transform en ruimt de oude ns_zoom-sleutel op. Tekstgrootte gaat
// uitsluitend via S/M/L in het ☰-menu (body.uiS/uiL, CSS zoom).
function applyZoom(){
  const el=document.getElementById('appScale');
  if(el){ el.style.transform=''; el.style.width=''; el.style.height=''; el.style.transformOrigin=''; }
  try{ localStorage.removeItem('ns_zoom'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
}
function zoom(){ /* verwijderd — transform-zoom bestaat niet meer, zie applyZoom() */ }

// ════════════════════════════════════════
// INIT — alles in DOMContentLoaded zodat HTML zeker geladen is
// ════════════════════════════════════════
// Sluit het bovenste open venster/overlay (voor de Android-backknop).
// Geeft true terug als er iets is gesloten, anders false (dan mag de app
// naar de achtergrond). Volgorde = van meest-modaal naar minst-modaal.
function closeTopOverlay(){
  const vis=el=>el && el.style.display!=='none' && getComputedStyle(el).display!=='none' && !el.classList.contains('hidden');
  // 1) Losse modals die met display:flex/block worden getoond
  for(const id of ['pdfReadyModal','needsUpdateModal','optResultModal','scenarioModal','btLogModal','ritFocusModal','apiDialog','hudPicker']){
    const el=document.getElementById(id);
    if(vis(el)){ el.style.display='none'; return true; }
  }
  // 2) Onderdelen-/scenario-picker (kan dynamisch andere id's hebben)
  const picker=document.querySelector('.pick-overlay, .onderdelen-overlay');
  if(vis(picker)){ picker.style.display='none'; return true; }
  // 3) Rit Analyse: minimaliseren i.p.v. stoppen (analyse loopt door)
  const rit=document.getElementById('ritDash');
  if(typeof caravanActive!=='undefined' && document.getElementById('caravanDash')?.style.display!=='none' && document.getElementById('caravanDash')){ if(caravanActive){ minimizeCaravanDash(); } else { closeCaravanDash(); } return true; }
  if(vis(rit)){ if(typeof ritActive!=='undefined'&&ritActive){ minimizeRitAnalyse(); } else { closeRitAnalyse(); } return true; }
  // 4) Neon-dashboard
  const neon=document.getElementById('neonDash');
  if(vis(neon)){ try{ closeNeonDashboard(); }catch(_){ neon.style.display='none'; } return true; }
  // 4b) Airco/Winter check
  const clim=document.getElementById('climateDash');
  if(vis(clim)){ try{ closeClimateCheck(); }catch(_){ clim.style.display='none'; } return true; }
  // 4c) Onderhoud / EV / Lange rit dashboards
  for(const id of ['onderhoudDash','evDash','langeRitDash']){
    const el=document.getElementById(id);
    if(vis(el)){ el.style.display='none'; return true; }
  }
  // 5) Kebab-menu open?
  const kebab=document.getElementById('kebabMenu');
  if(kebab && kebab.classList.contains('open')){ try{ closeKebab(); }catch(_){ console.warn('closeKebab mislukt:', _); } return true; }
  // 6) Verbind-overlay (alleen sluiten als al verbonden/demo — anders laten staan)
  const connOv=document.getElementById('connOv');
  if(vis(connOv) && (connected||demoMode)){ closeConnOv(); return true; }
  // 7) In een analyse maar niet op het startscherm? Back gaat naar home.
  const welcome=document.getElementById('welcomeScreen');
  if(welcome && welcome.classList.contains('hidden') && (connected||demoMode)){
    goHome(); return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', function(){

  // ── Android hardware-backknop ──────────────────────────────
  // Zonder deze handler sluit de backknop (of een tik naast een venster) de
  // hele app. Nu sluit hij eerst een open venster/overlay; pas als er niets
  // open staat, mag de app naar de achtergrond.
  try{
    const AppPlugin=window.Capacitor?.Plugins?.App;
    if(AppPlugin?.addListener){
      AppPlugin.addListener('backButton',()=>{
        if(closeTopOverlay()) return;          // er stond iets open → alleen dat sluiten
        AppPlugin.minimizeApp?.();             // niets open → app naar achtergrond (niet afsluiten)
      });
    }
  }catch(e){ /* stil: alleen beschikbaar op het native platform */ }

  // Welcome card klikkers
  // 2026-07-26: elke kaart ruimt eerst achtergebleven modus-overlays op. Zonder
  // die stap bleef bv. een geopende Wintercheck (#climateDash, z-index 9000)
  // onder het welkomstscherm staan en dook hij weer op zodra dat scherm sloot.
  const wcBind=(id,fn)=>{
    const el=document.getElementById(id); if(!el) return;
    el.onclick=function(ev){ try{ plCloseModeOverlays(); }catch(e){ console.warn('plCloseModeOverlays mislukt:', e); } return fn.call(this,ev); };
  };
  wcBind('wc-diag',()=>startChoice('diag'));
  wcBind('wc-onderdeel', ()=>{ document.getElementById('welcomeScreen').classList.add('hidden'); openOnderdeelCheck(); });
  wcBind('wc-deepdiag',()=>openDeepDiag());
  wcBind('wc-pidrec',()=>openPidRecorder());
  wcBind('wc-check',()=>startChoice('check'));
  wcBind('wc-basiccheck',()=>startChoice('basiccheck'));
  wcBind('wc-monitor',()=>openMonitorView());   // eigen opener: startChoice kent 'monitor' niet en viel terug op live view
  wcBind('wc-live',()=>openLiveView());   // opent de live view zelf; PID-keuze zit nu als knop in de Live/Grafiek-balk
  wcBind('wc-liveshare',()=>{ try{ PLRemote.openShare(); }catch(e){ alert('Delen is nu niet beschikbaar.'); } });   // deur 5: deel mijn live data
  wcBind('wc-liveexpert',()=>{ try{ PLRemote.openExpert(); }catch(e){ alert('Meekijken is nu niet beschikbaar.'); } }); // deur 5: ontvang data op afstand
  wcBind('wc-dtc',()=>startChoice('dtc'));
  wcBind('wc-fuel',()=>startChoice('fuel'));
  wcBind('wc-koop',()=>openKoopKeuze());
  wcBind('wc-proefrit',()=>{ document.getElementById('welcomeScreen').classList.add('hidden'); openProefritKeuze(); });
  wcBind('wc-onderhoud',()=>{ document.getElementById('welcomeScreen').classList.add('hidden'); openOnderhoud(); });
  wcBind('wc-ev',()=>{ document.getElementById('welcomeScreen').classList.add('hidden'); openEVCheck(); });
  wcBind('wc-langerit',()=>{ document.getElementById('welcomeScreen').classList.add('hidden'); openLangeRit(); });
  wcBind('wc-caravan',()=>{ document.getElementById('welcomeScreen').classList.add('hidden'); if(typeof openCaravan==='function') openCaravan(); });
  wcBind('wc-seizoen',()=>openSeizoensCheck());
  try{ injectFavStars(); }catch(e){ console.warn('injectFavStars mislukt:', e); }   // ⭐ sterretjes op alle functiekaarten
  try{ favBarInit(); }catch(e){ console.warn('favBarInit mislukt:', e); }       // ⭐ favorieten-knop in de welkom-header
  // soon-kaarten: tik geeft korte feedback, geen actie (momenteel geen)
  [].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('click',()=>{
      el.style.transition='border-color .1s';
      el.style.borderColor='var(--yw)';
      setTimeout(()=>{ el.style.borderColor=''; },600);
    });
  });
  document.getElementById('btnConnect').onclick=()=>connectSerial();
  document.getElementById('btnDemo').onclick=()=>startDemo();

  // Remote config: pas direct de gecachte/fallback-config toe, ververs op achtergrond
  try{ applyConfigToUI(); }catch(e){ console.warn('applyConfigToUI mislukt:', e); }
  try{ loadRemoteConfig(); }catch(e){ console.warn('loadRemoteConfig mislukt:', e); }

  buildPIDList();
  // Laad API key alleen als al eerder ingelogd
  try{
    const saved=localStorage.getItem('ns_api_key');
    if(saved&&saved.startsWith('sk-ant-')){
      window.anthropicKey=saved; updateApiPill();
    }
  }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }

  // Restore opgeslagen voorkeuren
  try{
    // donker/licht-toggle verwijderd — app gebruikt standaard het lichte thema
    const sf=localStorage.getItem('ns_font');
    if(sf){currentFont=parseInt(sf)||13;document.documentElement.style.fontSize=currentFont+'px';const _fl=document.getElementById('fontLbl');if(_fl)_fl.textContent=currentFont;}
    // ns_zoom NIET meer herstellen (2026-07-15): de zoombalk is verwijderd,
    // dus een oud opgeslagen zoomniveau was voor de gebruiker onzichtbaar én
    // onherstelbaar — precies de bron van de "alles staat rechts"-bug op
    // tablet. Sleutel opruimen en vast op 100% starten (tekstgrootte S/M/L
    // in het ☰-menu blijft de bedoelde schaalknop).
    try{ localStorage.removeItem('ns_zoom'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
    currentZoom=1.0; applyZoom();
    // PID-scherm standaard ingeklapt; opent via uitvouw-knop. Sluit na 15s inactiviteit.
    if(!slCollapsed){ slCollapsed=true; document.getElementById('appGrid').classList.add('sl-col'); const b=document.getElementById('slToggle'); if(b) b.textContent='▶'; }
    if(localStorage.getItem('ns_sr')==='true') toggleSR();
    initSLActivityReset();
    setPidView('dots'); // live view start altijd in puntjes-weergave (genegeerde voorkeur)
  }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }

  window.addEventListener('resize',()=>{ if(graphPID||trendPIDs.length) drawGraph(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeNeonDashboard?.(); closeRitAnalyse?.(); }});

  // Focus op login veld — tenzij er een onthouden sessie is
  // (Android herlaadt de WebView bij terugkeer uit achtergrond; zonder dit
  //  moet je elke keer opnieuw inloggen)
  try{
    const sess=localStorage.getItem('pl_session');
    const _tok=tokLoad();                       // nog geldig, niet verlopen?
    const _acc=(_tok && _tok.user)
      ? { role:_tok.role||'user', label:_tok.label||_tok.user, apiKey:'' }
      : ((sess && typeof USERS!=='undefined' && USERS[sess]) ? USERS[sess] : null);
    const _name=(_tok && _tok.user) ? _tok.user : sess;
    if(_acc && _name){
      document.getElementById('loginUser').value=_name;
      // Geen wachtwoord meer nodig: het sessietoken (server-ondertekend, met
      // vervaldatum) bewijst dat dit apparaat al geverifieerd is. Verlopen
      // token → tokLoad() geeft null en het loginscherm blijft staan.
      if(_tok) window.APP_TOKEN=_tok.token;
      finishLogin(_name, _acc);
      log(`Sessie hersteld: ${_name}`,'ok');
      try{ restoreAppState(); }catch(e){ console.warn('restoreAppState mislukt:', e); }
      try{
        const P=window.Capacitor?.Plugins||{};
        if(window.Capacitor?.isNativePlatform?.())
          log(`Native plugins — Filesystem: ${P.Filesystem?'✓':'✗ (rebuild nodig)'} | Share: ${P.Share?'✓':'✗ (rebuild nodig)'}`, (P.Filesystem&&P.Share)?'ok':'warn');
      }catch(e){ /* stil: melding mag nooit de stroom breken */ }
      // Was er een actieve BT-verbinding vóór Android de app herlaadde?
      // Dan direct opnieuw verbinden via het opgeslagen MAC-adres.
      try{
        if(localStorage.getItem('pl_autoconn')==='1' && getSPP()){
          log('Automatisch herverbinden...','info');
          setTimeout(()=>{ if(!connected) connectSerial(); },800);
        }
      }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
    } else {
      setTimeout(()=>document.getElementById('loginUser')?.focus(),300);
    }
  }catch(e){
    setTimeout(()=>document.getElementById('loginUser')?.focus(),300);
  }

  try{ refreshAdminLogRow(); }catch(e){ console.warn('refreshAdminLogRow mislukt:', e); }
  // Live-log hervatten als een vorige sessie nog "actief" was (crash/herlaad):
  // het bestaande bestand wordt voortgezet, vorige regels blijven behouden.
  try{
    if(localStorage.getItem('pl_livelog')==='1'){ liveLogStart({silent:true}); liveLogRecoveryCheck(); }
  }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }

  log('PidLane geladen.','info');
});
