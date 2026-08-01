// ══════════════════════════════════════════════════════════════════
// pidlane-rit.js
// Ritanalyse
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// RIT ANALYSE
// ════════════════════════════════════════
const RIT_FASEN=[
  {naam:'Motor & Vermogen',    icon:'⚡', duur:120, pids:['010C','0104','0111','010B','010E'], desc:'RPM, belasting, gasklep, inlaatdruk, timing'},
  {naam:'Brandstof & Emissie', icon:'⛽', duur:120, pids:['0106','0107','0110','0124','0134','0114','0115'], desc:'Brandstoftrim, MAF, breedband+smalband lambda'},
  {naam:'Temperatuur',         icon:'🌡️', duur:60,  pids:['0105','015C','010F','0146'],       desc:'Koelwater, olie, inlaatlucht, omgevingstemperatuur'},
  {naam:'Accu & Electrisch',   icon:'🔋', duur:60,  pids:['0142','0104','010C'],              desc:'Spanning, belasting onder belasting'},
  {naam:'Rijgedrag',           icon:'🚗', duur:120, pids:['010D','0149','010C','0104'],       desc:'Snelheid, gaspedaal, acceleratie patronen'},
  {naam:'Alles tegelijk',      icon:'📊', duur:120, pids:['010C','010D','0105','0142','0106','0107','0110'], desc:'Combinatie overzicht voor correlaties'},
];
// 2-min snelle technische check — ALLEEN technische staat, GEEN rijgedrag
const RIT_FASEN_2MIN=[
  {naam:'Motor & Vermogen',    icon:'⚡', duur:40, pids:['010C','0104','0111','010B','010E'], desc:'RPM, belasting, gasklep, inlaatdruk, timing'},
  {naam:'Brandstof & Emissie', icon:'⛽', duur:40, pids:['0106','0107','0110','0124','0134','0114','0115'], desc:'Brandstoftrim, MAF, breedband+smalband lambda'},
  {naam:'Temp & Accu',         icon:'🌡️', duur:40, pids:['0105','015C','010F','0142'],       desc:'Koelwater, olie, inlaatlucht, accuspanning'},
];
let ritMode='10min';                          // '2min' | '10min'
let RIT_FASEN_ACTIEF=RIT_FASEN;
let RIT_TOTAAL=RIT_FASEN.reduce((a,f)=>a+f.duur,0); // 10 minuten

let ritActive=false, ritFaseIdx=0, ritFaseTimer=null, ritTotalTimer=null, ritCollectInterval=null;
let ritStartTime=null, ritLogs=[], ritFaseData={};

/* ── ACHTERGROND ────────────────────────────────────────────────────────
   Een rit onder belasting vraagt dat je rijdt, en rijden vraagt navigatie.
   Precies dán legt Android de tab stil: setTimeout en setInterval bevriezen.
   Op 01-08-2026 stond daar het bewijs voor in de log — een TX om 14:04:19
   kreeg pas om 14:50:26 antwoord, 46 minuten later.

   Meedraaien in de achtergrond kan een webapp niet afdwingen. Wat wél kan is
   eerlijk zijn: de rit PAUZEERT als het scherm weggaat en gaat verder waar
   hij was zodra je terug bent. De fase loopt dus niet stilletjes door over
   tijd waarin niets gemeten is, en het rapport weet achteraf dat er gaten in
   zaten.

   ritFaseEind is wandkloktijd, niet een resterende duur: dat is het enige wat
   een bevroren tab overleeft.                                              */
let ritFaseEind=0, ritPauzeSinds=0, ritPauzeTotaal=0, ritOnderbrekingen=0;

function openRitAnalyse(mode='10min'){
  document.getElementById('welcomeScreen')?.classList.add('hidden');
  ritMode = mode;
  RIT_FASEN_ACTIEF = (mode==='2min') ? RIT_FASEN_2MIN : RIT_FASEN;
  RIT_TOTAAL = RIT_FASEN_ACTIEF.reduce((a,f)=>a+f.duur,0);
  document.getElementById('ritDash').style.display='block';
  resetRitUI();
}
function closeRitAnalyse(){
  if(ritActive) stopRitAnalyse();
  document.getElementById('ritDash').style.display='none';
  _removeRitPill();
  try{ goHome(); }catch(e){}
}

// Minimaliseer de Rit Analyse zónder hem te stoppen: het overlay verdwijnt,
// de timers en dataverzameling lopen door. Een zwevende pill toont de
// voortgang en brengt je terug. Zo kun je tussendoor het scenario-venster
// openen en waardes aanpassen terwijl de analyse doorloopt.
function minimizeRitAnalyse(){
  document.getElementById('ritDash').style.display='none';
  _showRitPill();
}
function restoreRitAnalyse(){
  document.getElementById('ritDash').style.display='block';
  _removeRitPill();
}
function _showRitPill(){
  let p=document.getElementById('ritPill');
  if(!p){
    p=document.createElement('div');
    p.id='ritPill';
    p.style.cssText='position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:8500;background:linear-gradient(135deg,#00b4cc,#7c3aed);color:#fff;font-size:12px;font-weight:800;padding:7px 14px;border-radius:16px;box-shadow:0 3px 14px rgba(0,0,0,.45);cursor:pointer;display:flex;align-items:center;gap:8px;letter-spacing:.3px';
    p.onclick=restoreRitAnalyse;
    document.body.appendChild(p);
  }
  p.style.display='flex';
  _updateRitPill();
}
function _updateRitPill(){
  const p=document.getElementById('ritPill'); if(!p) return;
  const t=document.getElementById('ritTimer')?.textContent||'0:00';
  const fase=document.getElementById('ritPhaseName')?.textContent||'';
  p.innerHTML=`🚗 Rit loopt · <span style="font-family:var(--m)">${t}</span>${fase&&fase!=='Wachten op start...'?` · ${fase}`:''} <span style="opacity:.7">↑ open</span>`;
}
function _removeRitPill(){
  const p=document.getElementById('ritPill'); if(p) p.style.display='none';
}

// Detecteer hybride/EV op basis van RDW-brandstof of merk-indicatie
function isHybrideOfEV(){
  const b = (vehicleInfo?.brandstof || '').toLowerCase();
  return b.includes('hybr') || b.includes('elektr') || b.includes('phev');
}

function resetRitUI(){
  const totMin = Math.round(RIT_TOTAAL/60);
  document.getElementById('ritProgress').style.width='0%';
  document.getElementById('ritTimer').textContent='0:00';
  document.getElementById('ritStatus').textContent = ritMode==='2min'
    ? 'Snelle technische check — ca. 2 minuten'
    : `Start rijden — minimaal ${totMin} minuten`;
  document.getElementById('ritPhaseName').textContent='Wachten op start...';
  document.getElementById('ritPhaseDesc').textContent='';
  document.getElementById('ritPhaseResults').innerHTML='';
  document.getElementById('ritStartBtn').style.display='block';
  document.getElementById('ritStopBtn').style.display='none';
  // Hybride/EV-waarschuwing: verbrandingsmotor moet meelopen
  if(isHybrideOfEV()){
    document.getElementById('ritPhaseResults').innerHTML =
      `<div style="background:rgba(255,170,0,.12);border:1px solid rgba(255,170,0,.4);border-radius:8px;padding:10px 12px;font-size:12px;color:#ffaa00;line-height:1.5;font-weight:600">
        ⚠️ Hybride/elektrisch voertuig gedetecteerd. Zorg dat de <strong>verbrandingsmotor meeloopt</strong> tijdens de analyse — anders worden alleen gegevens van de elektrische aandrijving gemeten en niet van de verbrandingsmotor.
      </div>`;
  }
  ritLogs=[]; ritFaseData={}; ritFaseIdx=0;
  ritFaseEind=0; ritPauzeSinds=0; ritPauzeTotaal=0; ritOnderbrekingen=0;
}

// 10-min uitgebreide analyse: lees ALLE ondersteunde sensoren één keer uit en
// leg vast welke buiten hun normaalwaarde vallen. Resultaat wordt meegenomen
// in het eind-rapport (ritSweepFindings).
let ritSweepFindings=[];
async function ritFullSweep(){
  ritSweepFindings=[];
  if(demoMode || typeof supportedPIDs==='undefined' || !supportedPIDs.size) return;
  const pids=[...supportedPIDs];
  log(`🔍 Volledige sensor-sweep gestart (${pids.length} sensoren)…`,'info');
  let gelezen=0, afwijkend=0;
  await withBus('rit-sweep', async()=>{
  for(const pid of pids){
    if(!ritActive && gelezen>0) break;   // gestopt? sweep afbreken
    try{
      const resp=parsePID(pid, await sendCmd('01'+pid.slice(2)+'1',2000));
      if(resp!=null){
        updPID(pid,resp); gelezen++;
        const d=getPidDef(pid);
        if(d && !isPIDOkVal(pid,resp)){
          afwijkend++;
          ritSweepFindings.push({pid, name:d.name||pid, val:resp, unit:d.unit||''});
        }
      }
    }catch(e){ /* sensor sloeg over, doorgaan */ }
  }
  }, 8000);
  log(`✅ Sweep klaar: ${gelezen} gelezen, ${afwijkend} afwijkend`, afwijkend?'warn':'ok');
  if(afwijkend){
    const lijst=ritSweepFindings.map(f=>`${f.name}: ${fv(f.val)} ${f.unit}`).join(', ');
    log(`⚠ Opvallende sensoren: ${lijst}`,'warn');
  }
}

async function startRitAnalyse(){
  window._didRit=true;
  if(!connected && !demoMode){log('Verbind eerst een adapter','warn');return;}
  // Onderdelen-keuze: welke fases draaien? (compleet of een selectie)
  const fullList=(ritMode==='2min')?RIT_FASEN_2MIN:RIT_FASEN;
  const faseOpts=fullList.map((f,idx)=>({key:String(idx),label:f.naam,icon:f.icon,sub:(f.duur>=60?Math.round(f.duur/60)+' min':f.duur+'s')}));
  const sel=await pickOnderdelen(ritMode==='2min'?'Snelle check — welke fases?':'Rit analyse — welke fases?', faseOpts);
  if(sel===null) return;                              // geannuleerd
  RIT_FASEN_ACTIEF=(sel.length?sel:fullList.map((_,i)=>String(i))).map(i=>fullList[+i]);
  RIT_TOTAAL=RIT_FASEN_ACTIEF.reduce((a,f)=>a+f.duur,0);
  resetRitUI();
  if(!(await preAnalysisCheck())) return;
  // PID-activering verschilt per modus:
  if(ritMode==='10min'){
    // UITGEBREID: activeer ALLE sensoren die de auto ondersteunt. De
    // poll-scheduler regelt het tempo (snel: RPM/lambda; "heel soms":
    // temp/niveau/tellers). Vooraf één volledige sweep voor de baseline.
    const fasePids=[...new Set(RIT_FASEN_ACTIEF.flatMap(f=>f.pids))];
    const alle = (!demoMode && typeof supportedPIDs!=='undefined' && supportedPIDs.size)
      ? [...new Set([...fasePids, ...supportedPIDs])]
      : fasePids;
    ensurePIDListActive(alle);
    ritFullSweep();   // async, leest alles 1x en legt afwijkingen vast
  } else {
    // SNEL (2-min): gerichte beperkte set, maar filter op gezonde PIDs.
    // PIDs die NO DATA geven (nodata) overslaan zodat de analyse niet blokkeert.
    const alleFasePids=[...new Set(RIT_FASEN_ACTIEF.flatMap(f=>f.pids))];
    const gezond=alleFasePids.filter(pid=>{
      const h=(typeof _pidHealth!=='undefined')?_pidHealth[pid]:undefined;
      // Meenemen als: gezond, onbekend (nog niet gecheckt), of in demo
      return demoMode || !h || h==='ok' || h==='twijfel';
    });
    // Altijd minimaal de kern-PIDs meenemen (zijn gegarandeerd aanwezig)
    const kern=KERN_PIDS.filter(pid=>
      typeof supportedPIDs==='undefined'||!supportedPIDs.size||supportedPIDs.has(pid)
    );
    const actief=[...new Set([...gezond,...kern])];
    log(`⚡ 2-min analyse: ${actief.length} PIDs geselecteerd (${alleFasePids.length-gezond.length} overgeslagen — NO DATA)`,'info');
    ensurePIDListActive(actief);
  }
  ritActive=true; ritStartTime=Date.now(); ritFaseIdx=0; ritLogs=[]; ritFaseData={};
  ritPauzeSinds=0; ritPauzeTotaal=0; ritOnderbrekingen=0; ritFaseEind=0;
  document.getElementById('ritStartBtn').style.display='none';
  document.getElementById('ritStopBtn').style.display='block';
  document.getElementById('ritStatus').textContent = ritMode==='2min'
    ? 'Technische check actief — laat motor draaien (rijden niet vereist)'
    : 'Rit analyse actief — rij normaal';
  log(ritMode==='2min' ? '⚡ Snelle technische check gestart' : '🚗 Rit analyse gestart','ok');
  startRitFase(0);

  // Total timer + progress bar
  ritTotalTimer=setInterval(()=>{
    // Pauzetijd telt niet mee: anders loopt de balk vol terwijl de app op de
    // achtergrond stond en stopt de rit zonder dat er iets gemeten is.
    const stil=ritPauzeTotaal+(ritPauzeSinds?Date.now()-ritPauzeSinds:0);
    const elapsed=Math.floor((Date.now()-ritStartTime-stil)/1000);
    const mins=Math.floor(elapsed/60), secs=elapsed%60;
    document.getElementById('ritTimer').textContent=`${mins}:${secs.toString().padStart(2,'0')}`;
    const pct=Math.min(100,(elapsed/RIT_TOTAAL)*100);
    document.getElementById('ritProgress').style.width=pct+'%';
    _updateRitPill();   // houd de zwevende pill bij als de rit geminimaliseerd is
    if(elapsed>=RIT_TOTAAL) stopRitAnalyse();
  },1000);
}

function startRitFase(idx){
  if(idx>=RIT_FASEN_ACTIEF.length){stopRitAnalyse();return;}
  const fase=RIT_FASEN_ACTIEF[idx];
  // Stond hier niet, terwijl ritFaseIdx wel bestond en op 0 bleef staan.
  // Pauzeren/hervatten moet weten welke fase loopt.
  ritFaseIdx=idx;
  ritFaseEind=Date.now()+fase.duur*1000;
  document.getElementById('ritPhaseName').textContent=`${fase.icon} ${fase.naam}`;
  document.getElementById('ritPhaseDesc').textContent=fase.desc+` — ${fase.duur} seconden`;
  log(`Fase ${idx+1}: ${fase.naam}`,'info');

  // Init data buffer voor deze fase
  ritFaseData[idx]={fase, data:{}, startTime:Date.now()};
  fase.pids.forEach(pid=>{ritFaseData[idx].data[pid]=[];});

  // FIX D: zorg dat de PIDs van DEZE fase actief gepolld worden. Zonder dit
  // bleven niet-geactiveerde PIDs (bv. 0124/0134/015C) undefined → lege data.
  ensurePIDListActive([...new Set(RIT_FASEN_ACTIEF.flatMap(f=>f.pids))]);

  _ritStartVerzamelen();
  _ritPlanFaseTimer();
}

/* Verzamelen van meetwaarden voor de LOPENDE fase. Apart gezet omdat het na
   een onderbreking opnieuw moet starten. */
function _ritStartVerzamelen(){
  if(ritCollectInterval){clearInterval(ritCollectInterval);ritCollectInterval=null;}
  const idx=ritFaseIdx, fase=RIT_FASEN_ACTIEF[idx];
  if(!fase||!ritFaseData[idx]) return;
  ritCollectInterval=setInterval(()=>{
    if(!ritActive){clearInterval(ritCollectInterval);ritCollectInterval=null;return;}
    fase.pids.forEach(pid=>{
      if(pidVals[pid]!==undefined) ritFaseData[idx].data[pid].push({t:Date.now(),v:pidVals[pid]});
    });
  },500);
}

/* Fasetimer op basis van wandkloktijd. Bij hervatten is ritFaseEind al
   opgeschoven met de weggevallen tijd, dus dit klopt vanzelf. */
function _ritPlanFaseTimer(){
  if(ritFaseTimer) clearTimeout(ritFaseTimer);
  const idx=ritFaseIdx;
  ritFaseTimer=setTimeout(async()=>{
    ritFaseTimer=null;
    if(!ritActive) return;
    clearInterval(ritCollectInterval);ritCollectInterval=null;
    await analyseRitFase(idx);
    if(ritActive) startRitFase(idx+1);
  },Math.max(0,ritFaseEind-Date.now()));
}

/* ── Pauzeren en hervatten ──────────────────────────────────────────── */
function _ritPauzeer(){
  if(!ritActive||ritPauzeSinds) return;
  ritPauzeSinds=Date.now();
  if(ritFaseTimer){ clearTimeout(ritFaseTimer); ritFaseTimer=null; }
  if(ritCollectInterval){ clearInterval(ritCollectInterval); ritCollectInterval=null; }
}

function _ritHervat(){
  if(!ritActive||!ritPauzeSinds) return;
  const weg=Date.now()-ritPauzeSinds;
  ritPauzeSinds=0;
  // Korte wissels (menu, notificatie) niet als onderbreking tellen: die
  // kosten geen meetdata van betekenis en zouden het rapport vervuilen.
  if(weg<3000){ _ritStartVerzamelen(); _ritPlanFaseTimer(); return; }
  ritPauzeTotaal+=weg;
  ritOnderbrekingen++;
  ritFaseEind+=weg;
  const s=Math.round(weg/1000);
  log(`⏸ Rit stond ${s>90?Math.round(s/60)+' min':s+' s'} stil — app was op de achtergrond. Fase gaat verder waar hij was.`,'warn');
  ritLogs.push({t:Date.now(), type:'onderbreking', sec:s});
  // Terug uit de achtergrond met een dode verbinding heeft geen zin: dan
  // vult de fase zich met niets en levert het rapport lege grafieken.
  if(typeof connected!=='undefined' && !connected && !(typeof demoMode!=='undefined'&&demoMode)){
    log('Verbinding is weg na de onderbreking — rit gestopt met wat er tot nu toe is gemeten.','warn');
    stopRitAnalyse();
    return;
  }
  _ritStartVerzamelen();
  _ritPlanFaseTimer();
}

document.addEventListener('visibilitychange',()=>{
  if(!ritActive) return;
  if(document.visibilityState==='hidden') _ritPauzeer(); else _ritHervat();
});

async function analyseRitFase(idx){
  const {fase,data}=ritFaseData[idx];

  // Bereken statistieken per PID
  const stats={};
  Object.entries(data).forEach(([pid,readings])=>{
    if(!readings.length) return;
    const vals=readings.map(r=>r.v);
    const min=Math.min(...vals),max=Math.max(...vals),avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    const first=vals.slice(0,3).reduce((a,b)=>a+b,0)/3;
    const last=vals.slice(-3).reduce((a,b)=>a+b,0)/3;
    const trend=((last-first)/Math.max(Math.abs(first),.001))*100;
    const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
    const ok=isPIDOkVal(pid,avg);
    stats[pid]={name:def?.name||pid,unit:def?.unit||'',min,max,avg,trend,ok,count:vals.length};
  });

  ritLogs.push({fase:fase.naam,duur:fase.duur,stats});

  // Toon fase kaart
  const card=document.createElement('div');
  card.style.cssText='background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:12px;';
  const hasProbleem=Object.values(stats).some(s=>!s.ok);
  card.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;color:#fff">${fase.icon} ${fase.naam}</div>
      <div style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;background:${hasProbleem?'rgba(255,0,110,.15)':'rgba(0,255,200,.1)'};color:${hasProbleem?'#ff6464':'#00ffc8'}">${hasProbleem?'⚠ AFWIJKING':'✅ OK'}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      ${Object.values(stats).map(s=>`
        <div style="font-size:12px;padding:3px 8px;border-radius:5px;background:${s.ok?'rgba(255,255,255,.05)':'rgba(255,0,110,.1)'};color:${s.ok?'rgba(255,255,255,.6)':'#ff6464'}">
          ${s.name}: ${fv(s.avg)} ${s.unit} ${s.trend>5?'↑':s.trend<-5?'↓':'→'}
        </div>`).join('')}
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,.45)" id="rit-ai-${idx}"></div>
  `;
  document.getElementById('ritPhaseResults').prepend(card);

  // ── LOKALE DUIDING (geen AI) ──
  // Per-fase commentaar wordt nu lokaal berekend uit de statistieken i.p.v.
  // een AI-call per fase. Bespaart ~6 AI-calls per rit; de AI duidt straks
  // alleen nog het volledige eindrapport. De afwijkingen voeden dat rapport.
  const duiding=_faseLokaleDuiding(stats, fase);
  const el=document.getElementById('rit-ai-'+idx);
  if(el) el.textContent=duiding;
  ritLogs[ritLogs.length-1].aiAnalyse=duiding;
  ritLogs[ritLogs.length-1].lokaal=true;
}

// Regelgebaseerde fase-duiding zonder AI. Gebruikt de drempels uit de
// PID-definitie (dH/dL/wH/wL) plus trend; produceert 1-3 korte zinnen NL.
function _faseLokaleDuiding(stats, fase){
  const afw=Object.values(stats).filter(s=>!s.ok);
  const stijgend=Object.values(stats).filter(s=>s.trend>15);
  if(!Object.keys(stats).length) return 'Geen meetdata in deze fase.';
  if(!afw.length){
    let t='Alle gemeten waarden binnen normaal bereik.';
    if(stijgend.length) t+=` ${stijgend.map(s=>s.name).join(', ')} liep op tijdens de fase — bij een opwarmfase is dat normaal.`;
    return t;
  }
  // Beschrijf de afwijkingen kort en concreet
  const delen=afw.map(s=>{
    const def=getPidDef?.(Object.keys(stats).find(p=>stats[p]===s))||null;
    const richting=(def&&def.dH&&s.avg>=def.dH)||(def&&def.wH&&s.avg>=def.wH)?'te hoog'
                  :(def&&def.dL&&s.avg<=def.dL)||(def&&def.wL&&s.avg<=def.wL)?'te laag':'afwijkend';
    return `${s.name} ${richting} (${fv(s.avg)} ${s.unit})`;
  });
  return `Afwijking in deze fase: ${delen.join('; ')}. Wordt meegenomen in de eindbeoordeling.`;
}

function isPIDOkVal(pid,val){
  // FIX C: gebruik centrale getPidDef() (dekt discoveredPIDDefs, ALL_PID_DEFS
  // én de uitgebreide PIDs 0164+) i.p.v. alleen discoveredPIDDefs/ALL_PID_DEFS.
  const def=(typeof getPidDef==='function'?getPidDef(pid):null)||discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
  if(!def) return true;
  if(def.dH&&val>=def.dH) return false; if(def.dL&&val<=def.dL) return false;
  if(def.wH&&val>=def.wH) return false; if(def.wL&&val<=def.wL) return false;
  return true;
}

async function stopRitAnalyse(){
  if(!ritActive) return;
  // Stoppen terwijl de app nog op de achtergrond stond: die laatste pauze
  // hoort ook van de meettijd af, anders telt hij stilte als meting.
  if(ritPauzeSinds){ ritPauzeTotaal+=Date.now()-ritPauzeSinds; ritPauzeSinds=0; }
  ritActive=false;
  clearTimeout(ritFaseTimer); ritFaseTimer=null; clearInterval(ritTotalTimer);
  if(ritCollectInterval){ clearInterval(ritCollectInterval); ritCollectInterval=null; }
  // Was de rit geminimaliseerd? Toon het overlay weer zodat het rapport
  // zichtbaar wordt, en verwijder de zwevende pill.
  _removeRitPill();
  if(document.getElementById('ritDash')) document.getElementById('ritDash').style.display='block';
  document.getElementById('ritStopBtn').style.display='none';
  // Proefrit vanuit Koopcheck/Inkoop: altijd technisch, geen focus-keuze.
  // De technische uitslag wordt teruggegeven en gaat mee in het eindoordeel.
  if(window._koopProefritActief){
    document.getElementById('ritStatus').textContent='Proefrit klaar — technisch rapport...';
    log('Proefrit (koopcheck) klaar — technisch rapport','info');
    await generateRitRapport('techniek');
    try{
      const tech=(ritLogs||[]).map(l=>`${l.fase}: ${l.samenvatting||l.desc||''}`).filter(Boolean).join(' | ');
      koopProefritKlaar(tech || 'Proefrit voltooid (geen afwijkingen geregistreerd)');
    }catch(e){ koopProefritKlaar('Proefrit voltooid'); }
    return;
  }
  // Rit gestart vanuit Onderhoud Plannen → terug en analyse draaien
  if(window._ondPending){
    window._ondPending=false;
    try{ closeRitAnalyse?.(); }catch(e){}
    openOnderhoud();
    setTimeout(()=>{ setOndRit('geen'); runOnderhoud(); }, 300);
    return;
  }
  // Rit gestart vanuit EV-check → terug en analyse draaien
  if(window._evPending){
    window._evPending=false;
    try{ closeRitAnalyse?.(); }catch(e){}
    openEVCheck();
    setTimeout(()=>runEVCheck(), 300);
    return;
  }
  // 2-min check is altijd technisch (geen rijgedrag) → direct technisch rapport
  if(ritMode==='2min'){
    document.getElementById('ritStatus').textContent='Technische check klaar — rapport wordt gegenereerd...';
    log('Snelle technische check klaar — technisch rapport','info');
    await generateRitRapport('techniek');
    return;
  }
  document.getElementById('ritStatus').textContent='Analyse klaar — kies rapporttype';
  log('Rit analyse gestopt — rapporttype kiezen','info');
  showRitFocusModal();
}

// Keuze: voor wie is het rapport? Een garage/ANWB hoeft het rijgedrag
// niet te zien; de bestuurder wil soms juist alleen rijstijl-feedback.
function showRitFocusModal(){
  let m=document.getElementById('ritFocusModal');
  if(!m){
    m=document.createElement('div'); m.id='ritFocusModal';
    m.style.cssText='position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:24px';
    m.innerHTML=`<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:20px;max-width:320px;width:100%">
      <div style="font-weight:800;font-size:15px;margin-bottom:4px;text-align:center">Wat moet in het rapport?</div>
      <div style="font-size:12px;color:var(--tx3);margin-bottom:14px;text-align:center">Voor een garage of ANWB kies je Techniek — dan blijft je rijgedrag buiten beeld</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="ritFocusChosen('techniek')" style="padding:12px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">🔧 Alleen techniek<div style="font-size:12px;color:var(--tx3);font-weight:400;margin-top:2px">Staat van het voertuig — geschikt voor garage/ANWB</div></button>
        <button onclick="ritFocusChosen('rijgedrag')" style="padding:12px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">🧍 Alleen rijgedrag<div style="font-size:12px;color:var(--tx3);font-weight:400;margin-top:2px">Rijstijl, efficiëntie en tips — voor jezelf</div></button>
        <button onclick="ritFocusChosen('beide')" style="padding:12px;border-radius:9px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">📋 Beide<div style="font-size:12px;color:rgba(255,255,255,.7);font-weight:400;margin-top:2px">Volledig rapport met techniek én rijgedrag</div></button>
      </div></div>`;
    document.body.appendChild(m);
  }
  m.style.display='flex';
}
async function ritFocusChosen(focus){
  document.getElementById('ritFocusModal').style.display='none';
  document.getElementById('ritStatus').textContent='Analyse klaar — rapport wordt gegenereerd...';
  await generateRitRapport(focus);
}

async function generateRitRapport(focus='beide'){
  const v=getVehicle();
  // Werkelijke meettijd, dus zonder de tijd dat de app op de achtergrond lag.
  // Anders staat er "10:00 minuten" boven een rapport dat op vier minuten data
  // rust, en dat is precies het soort valse stelligheid dat we willen weren.
  const elapsed=Math.floor((Date.now()-ritStartTime-ritPauzeTotaal)/1000);
  const mins=Math.floor(elapsed/60), secs=elapsed%60;
  const focusLabel={techniek:'Technisch rapport',rijgedrag:'Rijgedrag rapport',beide:'Volledig rapport'}[focus];

  // Bouw rapport tekst
  const lines=[
    `PIDLANE — RIT ANALYSE: ${focusLabel.toUpperCase()}`,
    `Datum: ${new Date().toLocaleString('nl')}`,
    `Voertuig: ${v.merk||'?'} ${v.year||''} ${v.vin||''}`,
    `Rit duur: ${mins}:${secs.toString().padStart(2,'0')} minuten (werkelijk gemeten)`,
    ...(ritOnderbrekingen ? [`LET OP: ${ritOnderbrekingen}× onderbroken doordat de app op de achtergrond stond; ` +
        `${Math.round(ritPauzeTotaal/1000)} s zonder meetdata. Beoordeel de reeksen met die gaten in gedachten.`] : []),
    `Fases geanalyseerd: ${ritLogs.length}`,
    '',
    '═══════════════════════════════════',
    'FASE RESULTATEN:',
    '',
  ];

  ritLogs.forEach((log,i)=>{
    lines.push(`FASE ${i+1}: ${log.fase} (${log.duur}s)`);
    Object.values(log.stats).forEach(s=>{
      lines.push(`  • ${s.name}: gem=${fv(s.avg)} ${s.unit}, min=${fv(s.min)}, max=${fv(s.max)}${!s.ok?' ⚠ AFWIJKING':''}`);
    });
    if(log.aiAnalyse) lines.push(`  → AI: ${log.aiAnalyse.slice(0,200)}`);
    lines.push('');
  });

  // 10-min uitgebreide analyse: volledige sensor-sweep meenemen,
  // mét plausibiliteitscheck zodat meetfouten niet als defect gelden.
  let sweepBlok='';
  if(ritMode==='10min' && ritSweepFindings.length){
    const sweepPairs=ritSweepFindings.map(f=>[f.pid,f.val]);
    const sq=buildQualityReport(sweepPairs);
    sweepBlok=sq.promptBlok;
    lines.push('═══════════════════════════════════');
    lines.push('VOLLEDIGE SENSOR-SWEEP — OPVALLENDE WAARDEN:');
    lines.push('');
    ritSweepFindings.forEach(f=>lines.push(`  ⚠ ${f.name}: ${fv(f.val)} ${f.unit}`));
    lines.push('');
  } else if(ritMode==='10min'){
    sweepBlok='\n\nVOLLEDIGE SENSOR-SWEEP: alle ondersteunde sensoren 1x uitgelezen, geen waarden buiten norm.';
  }

  // Totaalanalyse via AI — opdracht afgestemd op het gekozen publiek
  document.getElementById('ritStatus').textContent='AI totaalanalyse...';
  const allStats=ritLogs.map(l=>`${l.fase}: ${Object.values(l.stats).map(s=>`${s.name}=${fv(s.avg)}${s.unit}${!s.ok?' (!)':''}`).join(', ')}`).join('\n');

  const focusPrompt={
    techniek:`Schrijf een TECHNISCH conditierapport van het voertuig voor een garage of wegenwacht.
Beoordeel uitsluitend de technische staat: brandstoftrims, temperaturen, drukken, sensorwaarden, afwijkingen, slijtage-indicaties.
BELANGRIJK: zeg NIETS over rijstijl, rijgedrag, acceleratiepatronen of de bestuurder — alleen de techniek.
Geef: SAMENVATTING, BEVINDINGEN, PRIORITEIT ACTIES (🔴/🟡/🟢), ONDERHOUDSADVIES`,
    rijgedrag:`Schrijf een RIJGEDRAG-rapport voor de bestuurder zelf.
Beoordeel uitsluitend de rijstijl: toerentalgebruik, gasklep/pedaalgedrag, acceleratiepatronen, zuinigheid, schakelmomenten.
BELANGRIJK: zeg NIETS over technische defecten of onderhoudsadvies — alleen rijstijl en concrete bespaartips.
Geef: SAMENVATTING, RIJSTIJL ANALYSE, BESPAARPOTENTIEEL, TIPS`,
    beide:`Analyseer deze complete rit volledig: zowel de technische staat van het voertuig als het rijgedrag van de bestuurder.
Geef: SAMENVATTING, TECHNISCHE BEVINDINGEN, RIJGEDRAG, PRIORITEIT ACTIES (🔴/🟡/🟢), AANBEVELINGEN`
  }[focus];

  try{
    const _ftr=vehicleFuelType();
    const ritFuelNote = _ftr==='elektrisch'
      ? '\nLET OP: dit is een ELEKTRISCH voertuig — praat over energieverbruik (kWh) en rij-efficiëntie, NIET over brandstof, brandstoftrim, toerental-zuinigheid of liters.'
      : _ftr==='diesel' ? '\nDit is een diesel — let op DPF/roetfilter en AdBlue/SCR waar relevant.' : '';
    const totalAnalysis=await apiFetch(
      `${focusPrompt}${ritFuelNote}\n\nRit van ${mins} minuten met een ${v.merk||'auto'} ${v.model||''}. Antwoord in het Nederlands.\n\nFase data:\n${allStats}${sweepBlok}\n\nSluit het rapport af met deze exacte zin op een nieuwe regel: ${RAPPORT_DISCLAIMER}`,
      3000
    );
    // Rapport beschikbaar maken voor PDF-export
    lines.push('═══════════════════════════════════');
    lines.push(focus==='techniek'?'TECHNISCHE ANALYSE:':focus==='rijgedrag'?'RIJGEDRAG ANALYSE:':'TOTAAL AI ANALYSE:');
    lines.push(totalAnalysis);
    // Fix 15-07: _lastAIReport werd hier al gezet én daarna nogmaals door
    // renderAIText() hieronder (met andere tekst) → twee archief-entries voor
    // één rit-rapport. renderAIText zet hem nu als enige (incl. html + disclaimer).
    document.getElementById('ritStatus').textContent=`✅ Rit rapport klaar — ${mins}:${secs.toString().padStart(2,'0')} min geanalyseerd`;

    // Sluit het rit-overlay en toon de evaluatie in het rechter AI-paneel.
    // (Fix 19-07: stond hier dubbel — closeRitAnalyse roept zelf al goHome aan.)
    closeRitAnalyse();
    activateAIPane();
    const aiContent=document.getElementById('aiContent');
    aiContent.innerHTML='';

    // Header kaart
    const header=document.createElement('div');
    header.style.cssText='background:linear-gradient(135deg,rgba(0,245,255,.1),rgba(167,139,250,.1));border:1px solid rgba(0,245,255,.2);border-radius:8px;padding:10px 12px;margin-bottom:10px;';
    const ht=document.createElement('div'); ht.style.cssText='font-size:13px;font-weight:700;margin-bottom:3px;'; ht.textContent=`🚗 Rit Evaluatie — ${focusLabel}`;
    const hs=document.createElement('div'); hs.style.cssText='font-size:12px;color:var(--tx3);'; hs.textContent=`${ritLogs.length} fases — ${mins}:${secs.toString().padStart(2,'0')} minuten`;
    header.appendChild(ht); header.appendChild(hs); aiContent.appendChild(header);

    // Fase samenvatting chips
    const chips=document.createElement('div'); chips.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;';
    ritLogs.forEach(l=>{
      const hasProbleem=Object.values(l.stats||{}).some(s=>!s.ok);
      const chip=document.createElement('div');
      chip.style.cssText=`font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;background:${hasProbleem?'var(--rds)':'var(--gns)'};color:${hasProbleem?'var(--rd)':'var(--gn)'}`;
      chip.textContent=`${l.fase} ${hasProbleem?'⚠':'✅'}`;
      chips.appendChild(chip);
    });
    aiContent.appendChild(chips);

    // AI totaalanalyse
    const aiDiv=document.createElement('div');
    renderAIText(totalAnalysis,aiDiv);
    aiContent.appendChild(aiDiv);

    // Download + PDF knoppen
    const btnRow=document.createElement('div');
    btnRow.style.cssText='display:flex;gap:6px;margin-top:8px;';
    const dlBtn=document.createElement('button');
    dlBtn.className='btn'; dlBtn.style.cssText='flex:1;justify-content:center;';
    dlBtn.textContent='💾 Tekst';
    dlBtn.onclick=()=>download(`rit-analyse-${new Date().toISOString().slice(0,10)}.txt`,lines.join('\n'));
    const pdfBtn=document.createElement('button');
    pdfBtn.className='btn'; pdfBtn.style.cssText='flex:1;justify-content:center;';
    pdfBtn.textContent='📄 PDF';
    pdfBtn.onclick=function(){exportAIReportPDF(this);};
    btnRow.appendChild(dlBtn); btnRow.appendChild(pdfBtn);
    aiContent.appendChild(btnRow);

  }catch(e){
    const el=document.getElementById('ritStatus');
    if(el) el.textContent='Rapport klaar (geen AI beschikbaar)';
    closeRitAnalyse();
  }

  // Auto download rapport
  download(`rit-analyse-${new Date().toISOString().slice(0,10)}.txt`,lines.join('\n'));
  log('🚗 Rit rapport gedownload','ok');
}
