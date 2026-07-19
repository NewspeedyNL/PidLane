/* pidlane-caravan.js — LIVE CARAVAN/AANHANGER-RITTRACKER (build 2026-07-19).
   Losse module in de PidLane-splitopzet; laadt als <script src> onderaan de
   body. Top-level declaraties zijn globaal over de klassieke scripts heen,
   dus index.html (wcBind, closeTopOverlay, openLiveView) kan de functies en
   de vlag caravanActive gewoon zien.

   DOEL: tijdens een lange, zware rit (bergen, caravan) real-time meedenken —
   brandstofgericht. De coach geeft onderweg concrete tips:
     • terugschakelen als de motor zwoegt (hoge belasting, laag toerental)
     • opschakelen als het toerental onnodig hoog is
     • cruise control op ~95 op vlak/gelijkmatig terrein (100→95 met caravan
       scheelt merkbaar: luchtweerstand telt kwadratisch)
     • rustiger/gelijkmatiger op het gas, anticiperen
     • laten uitrollen op de motor bij afdaling (overrun = 0 brandstof)
     • melding als het momentane verbruik piekt op vlak terrein
   Plus veiligheids-/thermische bewaking (koelwater, duurbelasting, boord-
   spanning, snelheidslimiet). Aan het eind: één AI-rapport dat techniek,
   rijgedrag én brandstof combineert, met de gegeven tips als bewijs.

   Alles draait op standaard OBD2 request-response (geen CAN-sniffing). In
   demo werkt het live-beeld direct; boordspanning (0142) en koppel (0162/
   0163) zitten niet in demo → die tonen '—' resp. vermogen als belasting%. */

// ═══════════════════ STATE ═══════════════════
let caravanActive       = false;
let caravanStartTime    = 0;
let caravanTimer        = null;   // 1s UI/timer-tick (handle → clear bij stop)
let caravanTickInterval = null;   // idem, gecombineerd in caravanTimer
let caravanLastTick     = 0;      // voor integratie met échte dt
let caravanHist         = {};     // { pid: [{t,v}] } ring, ~6 min
let caravanCoach        = [];     // gegeven tips (feed + rapportbewijs)
let caravanCooldown     = {};     // per-regel laatste-vuur-timestamp
let caravanKm           = 0;      // geïntegreerde afstand
let caravanLiters       = 0;      // geïntegreerd verbruik
let caravanSpeedLimit   = 100;    // instelbaar; caravan-snelweglimiet
let caravanClimbSecs    = { klim:0, afdaling:0, vlak:0 };
let caravanPeak         = { lkm:0, coolant:0, load:0, power:0 };
let caravanVermogenBron = 'belasting';

const CARAVAN_PIDS_BASE = ['010D','010C','0104','0105','0111','0142','015E','0110'];
const CARAVAN_HIST_CAP  = 400;    // ~6.5 min bij 1s

// ═══════════════════ OPEN / RESET ═══════════════════
function openCaravan(){
  const w=document.getElementById('welcomeScreen'); if(w) w.classList.add('hidden');
  try{ closeLades(); }catch(e){}
  const ov=document.getElementById('caravanDash'); if(!ov) return;
  ov.style.display='block';
  caravanResetUI();
}
window.openCaravan=openCaravan;

function caravanResetUI(){
  // terug naar het setup-scherm; live-scherm verborgen
  const setup=document.getElementById('carSetup'), live=document.getElementById('carLive');
  if(setup) setup.style.display='block';
  if(live)  live.style.display='none';
  const li=document.getElementById('carLimit');
  if(li && !li.value) li.value=String(caravanSpeedLimit);
  // toon de actuele brandstofprijs die ook elders wordt gebruikt
  const pr=document.getElementById('fuelPrice')?.value;
  const pe=document.getElementById('carPriceEcho');
  if(pe) pe.textContent = pr ? `€ ${(+pr).toFixed(2)}/liter` : '€ 2,05/liter';
  const st=document.getElementById('carStatus'); if(st) st.textContent='Klaar om te starten';
}

// ═══════════════════ START ═══════════════════
async function startCaravan(){
  if(caravanActive) return;                       // guard tegen dubbel starten
  window._didCaravan=true;
  if(!connected && !demoMode){ showToast('Verbind eerst een adapter'); return; }
  if(!(await preAnalysisCheck())) return;

  // snelheidslimiet overnemen uit het invoerveld
  const li=parseInt(document.getElementById('carLimit')?.value,10);
  if(!isNaN(li) && li>=50 && li<=140) caravanSpeedLimit=li;

  // PID-set activeren in de bestaande poll-scheduler. Koppel-PIDs alleen als
  // de auto ze ondersteunt → anders vermogen via belasting%.
  let pids=[...CARAVAN_PIDS_BASE];
  const heeftKoppel = (typeof supportedPIDs!=='undefined' && supportedPIDs.has && supportedPIDs.has('0162') && supportedPIDs.has('0163'));
  if(heeftKoppel){ pids.push('0162','0163'); caravanVermogenBron='koppel'; }
  else caravanVermogenBron='belasting';
  await ensurePIDListActive(pids);

  // reset meters
  caravanActive=true;
  caravanStartTime=Date.now();
  caravanLastTick=Date.now();
  caravanHist={}; caravanCoach=[]; caravanCooldown={};
  caravanKm=0; caravanLiters=0;
  caravanClimbSecs={ klim:0, afdaling:0, vlak:0 };
  caravanPeak={ lkm:0, coolant:0, load:0, power:0 };

  // UI naar live
  const setup=document.getElementById('carSetup'), live=document.getElementById('carLive');
  if(setup) setup.style.display='none';
  if(live)  live.style.display='block';
  const st=document.getElementById('carStatus'); if(st) st.textContent='Rit loopt — rij normaal';
  _carRenderCoach();
  log('🚐 Caravan-rittracker gestart','ok');

  // één gecombineerde tick per seconde (timer + integratie + coaching + UI)
  caravanTimer=setInterval(caravanTick,1000);
  caravanTickInterval=caravanTimer;
}
window.startCaravan=startCaravan;

// ═══════════════════ STOP → RAPPORT ═══════════════════
async function stopCaravan(){
  if(!caravanActive) return;
  caravanActive=false;
  if(caravanTimer){ clearInterval(caravanTimer); caravanTimer=null; caravanTickInterval=null; }
  _removeCaravanPill();
  const st=document.getElementById('carStatus'); if(st) st.textContent='Rit gestopt — rapport wordt gemaakt…';
  log('🚐 Caravan-rit gestopt — rapport genereren','info');
  await generateCaravanRapport();
}
window.stopCaravan=stopCaravan;

function closeCaravanDash(){
  if(caravanActive){ // niet stiekem doormeten: sluiten = stoppen
    caravanActive=false;
    if(caravanTimer){ clearInterval(caravanTimer); caravanTimer=null; caravanTickInterval=null; }
  }
  _removeCaravanPill();
  const ov=document.getElementById('caravanDash'); if(ov) ov.style.display='none';
  try{ goHome(); }catch(e){}
}
window.closeCaravanDash=closeCaravanDash;

// ═══════════════════ MINIMALISEREN (pill) ═══════════════════
function minimizeCaravanDash(){
  const ov=document.getElementById('caravanDash'); if(ov) ov.style.display='none';
  if(caravanActive) _showCaravanPill();
}
window.minimizeCaravanDash=minimizeCaravanDash;

function restoreCaravanDash(){
  const ov=document.getElementById('caravanDash'); if(ov) ov.style.display='block';
  _removeCaravanPill();
}
window.restoreCaravanDash=restoreCaravanDash;

function _showCaravanPill(){
  let p=document.getElementById('caravanPill');
  if(!p){
    p=document.createElement('div');
    p.id='caravanPill';
    p.style.cssText='position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:8500;background:linear-gradient(135deg,#0e9f6e,#1a6fff);color:#fff;font-size:12px;font-weight:800;padding:7px 14px;border-radius:16px;box-shadow:0 3px 14px rgba(0,0,0,.45);cursor:pointer;display:flex;align-items:center;gap:8px;letter-spacing:.3px';
    p.onclick=restoreCaravanDash;
    document.body.appendChild(p);
  }
  p.style.display='flex';
  _updateCaravanPill();
}
function _updateCaravanPill(){
  const p=document.getElementById('caravanPill'); if(!p) return;
  const t=document.getElementById('carTimer')?.textContent||'0:00';
  const lkm=document.getElementById('carLkm')?.textContent||'—';
  p.innerHTML=`🚐 Rit loopt · <span style="font-family:var(--m,monospace)">${t}</span> · ${lkm} L/100 <span style="opacity:.7">↑ open</span>`;
}
function _removeCaravanPill(){
  const p=document.getElementById('caravanPill'); if(p) p.style.display='none';
}

// ═══════════════════ RING-HELPERS ═══════════════════
function _carPush(pid,t,v){
  if(v===undefined||v===null||isNaN(v)) return;
  (caravanHist[pid]||(caravanHist[pid]=[])).push({t,v});
  const a=caravanHist[pid];
  if(a.length>CARAVAN_HIST_CAP) a.splice(0,a.length-CARAVAN_HIST_CAP);
}
// waarde van ~sec seconden geleden (dichtstbijzijnde sample); null als de
// historie nog niet zo ver teruggaat
function _carAgo(pid,sec){
  const a=caravanHist[pid]; if(!a||a.length<2) return null;
  const target=Date.now()-sec*1000;
  if(a[0].t>target) return null;                  // onvoldoende historie
  let best=a[0];
  for(const s of a){ if(Math.abs(s.t-target)<Math.abs(best.t-target)) best=s; else if(s.t>target) break; }
  return best.v;
}
function _carStats(pid){
  const a=caravanHist[pid]; if(!a||!a.length) return null;
  let mn=Infinity,mx=-Infinity,sum=0;
  for(const s of a){ if(s.v<mn)mn=s.v; if(s.v>mx)mx=s.v; sum+=s.v; }
  return { min:mn, max:mx, avg:sum/a.length, n:a.length };
}

// ═══════════════════ AFGELEIDE SIGNALEN ═══════════════════
function caravanFuelRate(){
  // direct: PID 015E (L/h). Anders benzine-schatting uit MAF (0110, g/s):
  //   L/h ≈ MAF ÷ (14.7 × 0.745 kg/L) × 3600 s
  const direct=(typeof pidVals!=='undefined')?pidVals['015E']:undefined;
  if(typeof direct==='number'&&direct>=0) return direct;
  const ft=vehicleFuelType();
  const maf=(typeof pidVals!=='undefined')?pidVals['0110']:undefined;
  if(ft!=='diesel'&&ft!=='elektrisch'&&typeof maf==='number'&&maf>0){
    return maf/(14.7*0.745)*3.6;                  // g/s → L/h
  }
  return null;
}

function caravanVermogen(rpm,load){
  // koppel-methode als 0162 (%) én 0163 (Nm) beschikbaar:
  //   kW = (koppel% ÷ 100 × ref-Nm × toeren) ÷ 9550
  if(caravanVermogenBron==='koppel'){
    const pct=(typeof pidVals!=='undefined')?pidVals['0162']:undefined;
    const nm =(typeof pidVals!=='undefined')?pidVals['0163']:undefined;
    if(typeof pct==='number'&&typeof nm==='number'&&typeof rpm==='number'&&rpm>0&&nm>0){
      const kw=(pct/100)*nm*rpm/9550;
      return { val: Math.max(0,kw), unit:'kW', bron:'koppel' };
    }
  }
  // fallback: belasting% als proxy voor hoe hard de motor werkt
  if(typeof load==='number') return { val:load, unit:'%', bron:'belasting' };
  return { val:null, unit:'', bron:'belasting' };
}

function caravanDetectClimb(load,speed,throttle,trend){
  // Zuivere OBD-heuristiek (geen GPS/hoogtemeter) — een inschatting:
  //  • klim:     motor werkt hard maar snelheid loopt niet op
  //  • afdaling: voet van het gas maar snelheid blijft/loopt op
  if(typeof speed==='number'&&speed>15&&typeof load==='number'&&load>=70&&(trend===null||trend<=0.3))
    return 'klim';
  if(typeof speed==='number'&&speed>30&&typeof throttle==='number'&&throttle<=6&&(trend===null||trend>=-0.15))
    return 'afdaling';
  return 'vlak';
}

// ═══════════════════ COACHING ═══════════════════
function _carAlert(key,msg,level,cooldownMs){
  const now=Date.now();
  if(caravanCooldown[key] && now-caravanCooldown[key]<cooldownMs) return;
  caravanCooldown[key]=now;
  caravanCoach.push({ t:now, msg, level, key });
  if(caravanCoach.length>60) caravanCoach.splice(0,caravanCoach.length-60);
  _carRenderCoach();
  // veiligheidswaarschuwing → OS-notificatie (buzz), gewone tip → korte toast.
  // fireAlert valt zelf al terug op showToast als native notificaties ontbreken.
  if(level==='warn') fireAlert(msg);
  else showToast(msg,4500);
}

function caravanCheckRules(ctx){
  const { speed,rpm,load,coolant,throttle,volt,lkm,climb,fuelType,cruiseTarget,limit } = ctx;
  const lugRpm = fuelType==='diesel'?1500:1900;
  const upRpm  = fuelType==='diesel'?2000:2400;
  const baseL  = fuelType==='diesel'?11:14;       // richt-verbruik caravan L/100km

  // 1) TERUGSCHAKELEN — motor zwoegt (hoge belasting, laag toerental)
  if(typeof load==='number'&&typeof rpm==='number'&&load>=85&&rpm<lugRpm&&speed>10){
    _carAlert('terug',`⬇️ Schakel terug — de motor zwoegt (belasting ${Math.round(load)}%, ${Math.round(rpm)} tpm). Een versnelling lager rijdt zuiniger én koelt beter op de klim.`,'tip',45000);
  }
  // 2) OPSCHAKELEN — onnodig hoog toerental bij licht werk
  else if(typeof rpm==='number'&&typeof load==='number'&&rpm>upRpm&&load<45&&climb!=='klim'&&speed>25){
    _carAlert('op',`⬆️ Je kunt opschakelen — ${Math.round(rpm)} tpm is meer dan nodig bij deze belasting. Lager toerental bespaart direct brandstof.`,'tip',120000);
  }

  // 3) CRUISE OP ~95 — vlak/gelijkmatig en snelheid boven het zuinige punt
  if(climb!=='klim'&&typeof speed==='number'&&speed>cruiseTarget+3){
    const trendFlat = Math.abs((ctx.trend??0))<0.4;
    if(trendFlat)
      _carAlert('cruise',`🎯 Zet cruise op ~${cruiseTarget} km/h — met caravan kost ${Math.round(speed)}→${cruiseTarget} al merkbaar minder; luchtweerstand telt kwadratisch.`,'tip',180000);
  }

  // 4) RUSTIGER OP HET GAS — grote gasklep-sprong (schokkerig = duur)
  if(typeof throttle==='number'){
    const thAgo=_carAgo('0111',2);
    if(thAgo!==null && throttle-thAgo>25 && climb!=='klim')
      _carAlert('gas','🪶 Rustiger op het gas — gelijkmatig rijden met een caravan bespaart het meest. Anticipeer op wat komt i.p.v. bijsturen met het pedaal.','tip',120000);
  }

  // 5) AFDALING — laat uitrollen op de motor (overrun = 0 brandstof, remt mee)
  if(climb==='afdaling'&&typeof throttle==='number'&&throttle<5&&speed>40){
    _carAlert('afdaling','🛞 Laat rollen op de motor — voet van het gas kost 0 brandstof (overrun-afsluiting) en de motor remt mee. Zo voorkom je ook oververhitte remmen op een lange afdaling.','tip',90000);
  }

  // 6) VERBRUIK PIEKT op vlak terrein (op een klim is hoog verbruik normaal)
  if(typeof lkm==='number'&&lkm>baseL*1.6&&climb!=='klim'&&speed>25){
    _carAlert('verbruik',`⛽ Verbruik piekt nu (${lkm.toFixed(1)} L/100km). Op vlak terrein kan dat zuiniger — let op toerental en een lichte gasvoet.`,'tip',150000);
  }

  // ── VEILIGHEID / THERMISCH (warn → notificatie) ──
  // 7) Koelwater loopt op boven 100°C
  if(typeof coolant==='number'&&coolant>100){
    const cAgo=_carAgo('0105',60);
    if(cAgo!==null && coolant-cAgo>=3)
      _carAlert('koel',`🌡️ Koelwater loopt op (${Math.round(coolant)}°C). Op een lange klim: toerental iets hoger houden voor betere koeling, of even inhouden.`,'warn',90000);
  }
  // 8) Duurbelasting — >60% van de laatste 5 min zwaar belast
  {
    const a=caravanHist['0104']; 
    if(a&&a.length>30){
      const since=Date.now()-300000; let hi=0,tot=0;
      for(const s of a){ if(s.t>=since){ tot++; if(s.v>=85) hi++; } }
      if(tot>20 && hi/tot>0.60)
        _carAlert('duur','🔥 Al langere tijd zwaar belast. Overweeg een korte pauze — laat motor en versnellingsbak even afkoelen voor de volgende klim.','warn',300000);
    }
  }
  // 9) Boordspanning laag terwijl de motor draait
  if(typeof volt==='number'&&volt>0&&volt<13.0&&typeof rpm==='number'&&rpm>400){
    _carAlert('volt',`🔋 Boordspanning laag (${volt.toFixed(1)}V) met draaiende motor — dynamo werkt hard; laat riem/accu nakijken als dit aanhoudt.`,'warn',180000);
  }
  // 10) Boven de ingestelde caravan-limiet
  if(typeof speed==='number'&&speed>limit+4){
    _carAlert('limiet',`⚠️ ${Math.round(speed)} km/h — boven je ingestelde caravanlimiet van ${limit}. Terug naar ~${cruiseTarget} is veiliger én zuiniger.`,'tip',120000);
  }
}

function _carRenderCoach(){
  const box=document.getElementById('carCoach'); if(!box) return;
  if(!caravanCoach.length){ box.innerHTML='<div style="color:rgba(255,255,255,.35);font-size:12px;padding:6px 2px">Nog geen tips — de coach kijkt mee zodra je rijdt.</div>'; return; }
  const clr={ warn:'#ffb020', tip:'#7cf5c0' };
  box.innerHTML=caravanCoach.slice(-8).reverse().map(c=>{
    const ts=new Date(c.t).toTimeString().slice(0,5);
    return `<div style="display:flex;gap:7px;padding:6px 8px;border-left:3px solid ${clr[c.level]||'#7cf5c0'};background:rgba(255,255,255,.04);border-radius:0 8px 8px 0;margin-bottom:5px">
      <span style="color:rgba(255,255,255,.3);font-size:11px;font-family:var(--m,monospace);flex-shrink:0">${ts}</span>
      <span style="font-size:12.5px;color:rgba(255,255,255,.9);line-height:1.35">${c.msg}</span></div>`;
  }).join('');
}

// ═══════════════════ TICK (de motor) ═══════════════════
function caravanTick(){
  if(!caravanActive) return;
  const now=Date.now();
  let dt=(now-caravanLastTick)/1000; caravanLastTick=now;
  if(dt<0) dt=0; if(dt>5) dt=5;                    // na pauze/lag niet wegdrijven

  const g=pid=> (typeof pidVals!=='undefined')?pidVals[pid]:undefined;
  const speed=g('010D'), rpm=g('010C'), load=g('0104'),
        coolant=g('0105'), throttle=g('0111'), volt=g('0142');
  const fuelRate=caravanFuelRate();

  // historie bijhouden
  _carPush('010D',now,speed); _carPush('010C',now,rpm); _carPush('0104',now,load);
  _carPush('0105',now,coolant); _carPush('0111',now,throttle);
  if(volt!==undefined) _carPush('0142',now,volt);
  if(fuelRate!==null)  _carPush('015E',now,fuelRate);

  // integreren met échte dt
  if(typeof speed==='number'&&speed>0) caravanKm    += speed*dt/3600;
  if(fuelRate!==null&&fuelRate>0)       caravanLiters+= fuelRate*dt/3600;

  // momentaan L/100km
  let lkm=null;
  if(fuelRate!==null&&typeof speed==='number'&&speed>3) lkm=fuelRate/speed*100;

  // afgeleiden
  const spdAgo=_carAgo('010D',5);
  const trend = (spdAgo!==null)?(speed-spdAgo)/5:null;   // km/h per s
  const climb = caravanDetectClimb(load,speed,throttle,trend);
  caravanClimbSecs[climb]=(caravanClimbSecs[climb]||0)+dt;
  const pw=caravanVermogen(rpm,load);
  const cruiseTarget=Math.max(80,caravanSpeedLimit-5);
  const fuelType=vehicleFuelType();

  // pieken
  if(lkm!==null&&lkm>caravanPeak.lkm&&speed>5) caravanPeak.lkm=lkm;
  if(typeof coolant==='number'&&coolant>caravanPeak.coolant) caravanPeak.coolant=coolant;
  if(typeof load==='number'&&load>caravanPeak.load) caravanPeak.load=load;
  if(pw.unit==='kW'&&pw.val>caravanPeak.power) caravanPeak.power=pw.val;

  const ctx={ speed,rpm,load,coolant,throttle,volt,fuelRate,lkm,climb,trend,
              fuelType,cruiseTarget,limit:caravanSpeedLimit };

  caravanRenderLive(ctx,pw);
  caravanCheckRules(ctx);
  _updateCaravanPill();
}

// ═══════════════════ LIVE-WEERGAVE ═══════════════════
function caravanRenderLive(ctx,pw){
  const set=(id,txt,color)=>{ const el=document.getElementById(id); if(el){ el.textContent=txt; if(color)el.style.color=color; } };

  // timer
  const el=Math.floor((Date.now()-caravanStartTime)/1000);
  set('carTimer',`${Math.floor(el/60)}:${String(el%60).padStart(2,'0')}`);

  // klim-badge
  const cb={ klim:{t:'⛰️ Klim',c:'#ffb020'}, afdaling:{t:'🛞 Afdaling',c:'#7cf5c0'}, vlak:{t:'➖ Vlak',c:'#8fd3ff'} }[ctx.climb];
  const cbEl=document.getElementById('carClimb');
  if(cbEl){ cbEl.textContent=cb.t; cbEl.style.background=cb.c+'22'; cbEl.style.color=cb.c; }

  // momentaan verbruik (kleur t.o.v. richtwaarde)
  const baseL=ctx.fuelType==='diesel'?11:14;
  let lkmTxt='—', lkmClr='#fff';
  if(ctx.lkm!==null){ lkmTxt=ctx.lkm.toFixed(1); lkmClr=ctx.lkm>baseL*1.5?'#ff6b6b':ctx.lkm>baseL*1.15?'#ffb020':'#7cf5c0'; }
  set('carLkm',lkmTxt,lkmClr);
  set('carLh', ctx.fuelRate!==null?`${ctx.fuelRate.toFixed(1)} L/u`:'—');

  // snelheid + cruise-hint
  set('carSpeed', typeof ctx.speed==='number'?Math.round(ctx.speed):'—');
  const cruiseTarget=ctx.cruiseTarget;
  const ch=document.getElementById('carCruise');
  if(ch){
    if(ctx.climb!=='klim'&&typeof ctx.speed==='number'&&ctx.speed>cruiseTarget+3){ ch.textContent=`cruise ~${cruiseTarget}`; ch.style.color='#ffb020'; }
    else { ch.textContent=`doel ~${cruiseTarget}`; ch.style.color='rgba(255,255,255,.35)'; }
  }

  // toerental + schakel-hint (glow)
  set('carRpm', typeof ctx.rpm==='number'?Math.round(ctx.rpm):'—');
  const lugRpm=ctx.fuelType==='diesel'?1500:1900, upRpm=ctx.fuelType==='diesel'?2000:2400;
  const gEl=document.getElementById('carGear');
  if(gEl){
    if(typeof ctx.load==='number'&&typeof ctx.rpm==='number'&&ctx.load>=85&&ctx.rpm<lugRpm){ gEl.textContent='⬇️ terug'; gEl.style.color='#ffb020'; }
    else if(typeof ctx.rpm==='number'&&typeof ctx.load==='number'&&ctx.rpm>upRpm&&ctx.load<45&&ctx.climb!=='klim'){ gEl.textContent='⬆️ op'; gEl.style.color='#8fd3ff'; }
    else { gEl.textContent='✓ ok'; gEl.style.color='#7cf5c0'; }
  }

  // vermogen (kW of belasting%)
  set('carPower', pw.val==null?'—':(pw.unit==='kW'?Math.round(pw.val):Math.round(pw.val)));
  set('carPowerLbl', pw.unit==='kW'?'kW vermogen':'% belasting');

  // koelwater (kleur)
  let coolClr='#7cf5c0';
  if(typeof ctx.coolant==='number'){ coolClr=ctx.coolant>=108?'#ff6b6b':ctx.coolant>=102?'#ffb020':'#7cf5c0'; }
  set('carCoolant', typeof ctx.coolant==='number'?`${Math.round(ctx.coolant)}°`:'—',coolClr);

  // boordspanning
  let vTxt='—', vClr='#8fd3ff';
  if(typeof ctx.volt==='number'&&ctx.volt>0){ vTxt=ctx.volt.toFixed(1)+'V'; vClr=ctx.volt<13.0?'#ffb020':'#8fd3ff'; }
  set('carVolt',vTxt,vClr);

  // trip-balk
  set('carKm', caravanKm.toFixed(1));
  const avg = caravanKm>0.1 ? (caravanLiters/caravanKm*100) : null;
  set('carAvg', avg!==null?avg.toFixed(1):'—');
  set('carLiters', caravanLiters.toFixed(2));
  const price=parseFloat(document.getElementById('fuelPrice')?.value)||2.05;
  set('carCost', '€ '+(caravanLiters*price).toFixed(2));
}

// ═══════════════════ AI-EINDRAPPORT ═══════════════════
async function generateCaravanRapport(){
  const v=getVehicle();
  const el=Math.floor((Date.now()-caravanStartTime)/1000);
  const mins=Math.floor(el/60), secs=el%60;
  const price=parseFloat(document.getElementById('fuelPrice')?.value)||2.05;
  const F=fv;
  const avg = caravanKm>0.1 ? (caravanLiters/caravanKm*100) : null;
  const ft  = vehicleFuelType();

  const secToMin=s=>`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
  const sp=_carStats('010D'), rp=_carStats('010C'), ld=_carStats('0104'), co=_carStats('0105');

  // uniek gegeven tips + hoe vaak
  const tipCount={};
  caravanCoach.forEach(c=>{ tipCount[c.key]=(tipCount[c.key]||0)+1; });
  const tipLabels={ terug:'Terugschakelen (motor zwoegt)', op:'Opschakelen (toerental te hoog)',
    cruise:`Cruise op ~${Math.max(80,caravanSpeedLimit-5)}`, gas:'Rustiger/gelijkmatiger gas',
    afdaling:'Laten uitrollen bij afdaling', verbruik:'Verbruikspiek op vlak terrein',
    koel:'Koelwater liep op', duur:'Duurbelasting — pauze geadviseerd',
    volt:'Lage boordspanning', limiet:'Boven caravanlimiet' };

  const lines=[
    'PIDLANE — CARAVAN/AANHANGER RIT: BRANDSTOF + TECHNIEK + RIJGEDRAG',
    `Datum: ${new Date().toLocaleString('nl')}`,
    `Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.vin||''}`.trim(),
    `Duur: ${mins}:${secs.toString().padStart(2,'0')}   Afstand: ${caravanKm.toFixed(1)} km`,
    `Verbruik: ${caravanLiters.toFixed(2)} L   Gemiddeld: ${avg!==null?avg.toFixed(1)+' L/100km':'—'}   Kosten: € ${(caravanLiters*price).toFixed(2)} (à € ${price.toFixed(2)}/L)`,
    `Vermogensbron: ${caravanVermogenBron==='koppel'?'gemeten koppel (PID 0162/0163)':'belasting% (koppel-PID niet beschikbaar)'}`,
    '',
    'TERREINVERDELING (inschatting op OBD-basis):',
    `  ⛰️ Klim: ${secToMin(caravanClimbSecs.klim)}   🛞 Afdaling: ${secToMin(caravanClimbSecs.afdaling)}   ➖ Vlak: ${secToMin(caravanClimbSecs.vlak)}`,
    '',
    'GEMETEN WAARDEN (min / gem / max):',
    sp?`  Snelheid: ${F(sp.min)} / ${F(sp.avg)} / ${F(sp.max)} km/h`:'  Snelheid: —',
    rp?`  Toerental: ${F(rp.min)} / ${F(rp.avg)} / ${F(rp.max)} tpm`:'  Toerental: —',
    ld?`  Belasting: ${F(ld.min)} / ${F(ld.avg)} / ${F(ld.max)} %`:'  Belasting: —',
    co?`  Koelwater: ${F(co.min)} / ${F(co.avg)} / ${F(co.max)} °C`:'  Koelwater: —',
    `  Piek verbruik: ${caravanPeak.lkm?caravanPeak.lkm.toFixed(1)+' L/100km':'—'}   Piek koelwater: ${caravanPeak.coolant?Math.round(caravanPeak.coolant)+'°C':'—'}`,
    '',
    'COACHING TIJDENS DE RIT (aantal keer):',
    ...(Object.keys(tipCount).length
        ? Object.entries(tipCount).map(([k,n])=>`  • ${tipLabels[k]||k}: ${n}×`)
        : ['  • Geen tips nodig — rustige, gelijkmatige rit.']),
    '',
  ];

  const st=document.getElementById('carStatus'); if(st) st.textContent='AI stelt het rapport op…';

  const coachEvidence = Object.keys(tipCount).length
    ? Object.entries(tipCount).map(([k,n])=>`${tipLabels[k]||k} (${n}×)`).join('; ')
    : 'geen — gelijkmatige rit';
  const fuelNote = ft==='elektrisch'
    ? 'LET OP: elektrisch voertuig — praat over kWh-verbruik en efficiëntie, niet over liters/toerental.'
    : ft==='diesel' ? 'Dit is een diesel — betrek DPF/roetfilter en koeling op lange klimmen waar relevant.' : '';

  let ai='';
  try{
    ai=await apiFetch(
`Je bent een rij- en techniekcoach. Analyseer één lange rit met CARAVAN/AANHANGER door BERGACHTIG terrein. De focus is BRANDSTOF: hoe kon deze bestuurder zuiniger rijden, gecombineerd met de technische staat en het rijgedrag onder zware belasting.
${fuelNote}

Gebruik de meetdata en vooral de coaching-momenten hieronder als concreet bewijs — verwijs ernaar (bv. hoe vaak de motor zwoeg, of cruise nuttig was). Wees concreet en praktisch, geen algemeenheden.

Rit: ${mins} min, ${caravanKm.toFixed(1)} km, gemiddeld ${avg!==null?avg.toFixed(1)+' L/100km':'onbekend'}, kosten € ${(caravanLiters*price).toFixed(2)}.
Terrein (OBD-inschatting): klim ${secToMin(caravanClimbSecs.klim)}, afdaling ${secToMin(caravanClimbSecs.afdaling)}, vlak ${secToMin(caravanClimbSecs.vlak)}.
Meetwaarden min/gem/max — snelheid ${sp?`${F(sp.min)}/${F(sp.avg)}/${F(sp.max)}`:'—'} km/h, toerental ${rp?`${F(rp.min)}/${F(rp.avg)}/${F(rp.max)}`:'—'} tpm, belasting ${ld?`${F(ld.min)}/${F(ld.avg)}/${F(ld.max)}`:'—'}%, koelwater ${co?`${F(co.min)}/${F(co.avg)}/${F(co.max)}`:'—'}°C.
Coaching gegeven: ${coachEvidence}.

Geef in het Nederlands, met kopjes:
SAMENVATTING
BRANDSTOF & ZUINIGER RIJDEN (concrete winst: schakelen, cruise ~${Math.max(80,caravanSpeedLimit-5)}, gasvoet, afdalingen)
TECHNISCHE STAAT ONDER BELASTING (koeling, thermiek, spanning)
RIJGEDRAG MET CARAVAN
TOP 3 ACTIES VOOR DE VOLGENDE BERGRIT (🔴/🟡/🟢)

Sluit af met exact deze zin op een nieuwe regel: ${RAPPORT_DISCLAIMER}`,
      3000
    );
  }catch(e){
    ai='(AI niet beschikbaar — hierboven staat de volledige meet- en coachingsamenvatting.)';
  }

  lines.push('═══════════════════════════════════','AI-ANALYSE:',ai);

  // tonen in het AI-paneel (renderAIText beheert zelf _lastAIReport + disclaimer)
  try{
    activateAIPane();
    const host=document.getElementById('aiContent');
    if(host){
      host.innerHTML='';
      const header=document.createElement('div');
      header.style.cssText='background:linear-gradient(135deg,rgba(14,159,110,.12),rgba(26,111,255,.12));border:1px solid rgba(14,159,110,.25);border-radius:8px;padding:10px 12px;margin-bottom:10px';
      const ht=document.createElement('div'); ht.style.cssText='font-size:13px;font-weight:700;margin-bottom:3px'; ht.textContent='🚐 Caravan-rit — brandstof & techniek';
      const hs=document.createElement('div'); hs.style.cssText='font-size:12px;color:var(--tx3)';
      hs.textContent=`${caravanKm.toFixed(1)} km · ${mins}:${secs.toString().padStart(2,'0')} · ${avg!==null?avg.toFixed(1)+' L/100km':'—'} · € ${(caravanLiters*price).toFixed(2)}`;
      header.appendChild(ht); header.appendChild(hs); host.appendChild(header);

      const aiDiv=document.createElement('div');
      renderAIText(ai,aiDiv);
      host.appendChild(aiDiv);

      const row=document.createElement('div'); row.style.cssText='display:flex;gap:6px;margin-top:8px';
      const dl=document.createElement('button'); dl.className='btn'; dl.style.cssText='flex:1;justify-content:center'; dl.textContent='💾 Tekst';
      dl.onclick=()=>{ try{ download(`caravan-rit-${new Date().toISOString().slice(0,10)}.txt`,lines.join('\n')); }catch(e){} };
      const pdf=document.createElement('button'); pdf.className='btn'; pdf.style.cssText='flex:1;justify-content:center'; pdf.textContent='📄 PDF';
      pdf.onclick=function(){ try{ exportAIReportPDF(this); }catch(e){} };
      row.appendChild(dl); row.appendChild(pdf); host.appendChild(row);
    }
  }catch(e){ log('Caravan-rapport tonen mislukt: '+e.message,'warn'); }

  // overlay sluiten en naar home; tekstrapport ook meteen wegschrijven
  const ov=document.getElementById('caravanDash'); if(ov) ov.style.display='none';
  _removeCaravanPill();
  try{ download(`caravan-rit-${new Date().toISOString().slice(0,10)}.txt`,lines.join('\n')); }catch(e){}
  log('🚐 Caravan-rapport klaar','ok');
  try{ goHome(); }catch(e){}
}
window.generateCaravanRapport=generateCaravanRapport;
