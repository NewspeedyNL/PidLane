// ════════════════════════════════════════
// data.js — Datavalidatie, smoothing, outliers, poll loop
// ════════════════════════════════════════

window.pidVals       = {};
window.pidHist       = {};
window.pidSmooth     = {};
window.activePIDs    = new Set();
window.outlierCount  = {};
window.stabilityCount= {};
window.dataStable    = false;
window.pollTimer     = null;

// ── 3-LAAGS VALIDATIE ──
function validateAndSmooth(pid, rawVal) {
  if(rawVal===null||rawVal===undefined||isNaN(rawVal)) return null;

  const def = window.discoveredPIDDefs?.find(d=>d.pid===pid) || window.ALL_PID_DEFS?.[pid];
  const lim = window.PID_HARD_LIMITS?.[pid];

  // Laag 1: Harde fysieke limieten
  if(lim && (rawVal<lim.min || rawVal>lim.max)) {
    log(`⚠ ${def?.name||pid}: ${rawVal}${def?.unit||''} buiten bereik (${lim.min}–${lim.max})`, 'warn');
    logToSheets('outlier', `${def?.name||pid}: ${rawVal} buiten bereik`, {pid,value:rawVal,reason:'hard_limit'});
    markOutlier(pid, rawVal, 'limiet');
    return null;
  }

  // Laag 2: Sprong filter (max 35% van bereik per meting)
  const prev = window.pidVals[pid];
  if(prev !== undefined && prev !== null) {
    const range = (def?.max??255) - (def?.min??0);
    const jumpPct = Math.abs(rawVal-prev) / range * 100;
    if(jumpPct > 35) {
      log(`⚠ ${def?.name||pid}: sprong ${fv(prev)}→${fv(rawVal)} (${jumpPct.toFixed(0)}%)`, 'warn');
      logToSheets('outlier', `${def?.name||pid}: sprong`, {pid,prev,value:rawVal,jumpPct,reason:'spike'});
      markOutlier(pid, rawVal, 'sprong');
      return null;
    }
  }

  // Laag 3: Statistische outlier detectie (>2.5σ)
  const hist = window.pidHist[pid];
  if(hist && hist.length >= 8) {
    const recent = hist.slice(-10).map(x=>x.v);
    const mean = recent.reduce((a,b)=>a+b,0) / recent.length;
    const std  = Math.sqrt(recent.reduce((a,b)=>a+(b-mean)**2,0) / recent.length);
    if(std > 0.01 && Math.abs(rawVal-mean) > 2.5*std) {
      log(`⚠ ${def?.name||pid}: ${fv(rawVal)} statistisch outlier (gem=${fv(mean)}, σ=${fv(std)})`, 'warn');
      markOutlier(pid, rawVal, 'outlier');
      return null;
    }
  }

  // Gewogen smoothing over 4 metingen
  if(!window.pidSmooth[pid]) window.pidSmooth[pid] = [];
  window.pidSmooth[pid].push(rawVal);
  if(window.pidSmooth[pid].length > 4) window.pidSmooth[pid].shift();
  const buf = window.pidSmooth[pid];
  let ws=0, wt=0;
  buf.forEach((v,i) => { const w=i+1; ws+=v*w; wt+=w; });
  return Math.round(ws/wt*100) / 100;
}

function markOutlier(pid, val, reason) {
  if(!window.outlierCount[pid]) window.outlierCount[pid] = 0;
  window.outlierCount[pid]++;
  const card = document.getElementById('gc-'+pid);
  if(card) {
    let ob = card.querySelector('.outlier-badge');
    if(!ob) {
      ob = document.createElement('div');
      ob.style.cssText = 'position:absolute;bottom:5px;right:5px;font-size:7px;font-weight:700;background:var(--ors);color:var(--or);padding:1px 4px;border-radius:3px;';
      card.appendChild(ob);
    }
    ob.textContent = `⚠ ${window.outlierCount[pid]}x`;
    ob.title = `Laatste gefilterd: ${fv(val)} — reden: ${reason}`;
  }
}

function checkStability(pid, val) {
  if(!window.stabilityCount[pid]) window.stabilityCount[pid] = 0;
  window.stabilityCount[pid]++;
  if(!window.dataStable) {
    const allOk = [...window.activePIDs].every(p => (window.stabilityCount[p]||0) >= 5);
    if(allOk && window.activePIDs.size > 0) {
      window.dataStable = true;
      document.getElementById('stxt').textContent = 'Verbonden ✅';
      log('✅ Data stabiel — AI analyse beschikbaar','ok');
      logToSheets('info','Data stabiel',{pidCount:window.activePIDs.size});
      const c = document.getElementById('aiContent');
      if(c?.querySelector('.ai-ph')) {
        c.innerHTML = `<div class="ai-ph"><div class="pi">✅</div><p>Data stabiel en gevalideerd.<br><br>Druk op <strong>📊 AI Datalog</strong> voor diepgaande analyse,<br>of <strong>Snelle AI analyse</strong> voor een momentopname.</p></div>`;
      }
    }
  }
}

// ── DATALOG ──
window.datalogActive  = false;
window.datalogBuffer  = {};
window.datalogStart   = null;
const DATALOG_DURATION = 20000;

function startDatalog() {
  if(!window.connected) { log('Verbind eerst een adapter','warn'); return; }
  if(window.datalogActive) return;
  if(!window.activePIDs.size) { log('Selecteer eerst sensoren links','warn'); return; }
  window.datalogActive = true;
  window.datalogBuffer = {};
  window.datalogStart  = Date.now();
  window.activePIDs.forEach(pid => { window.datalogBuffer[pid] = []; });
  log('📊 Datalog gestart — 20 seconden meten...','info');
  const btn = document.getElementById('aiBtn');
  if(btn) btn.textContent='⏺ Opnemen... 20s';
  let sec = 20;
  const countdown = setInterval(() => {
    sec--;
    const b = document.getElementById('aiBtn');
    if(b && sec > 0) b.textContent = `⏺ Opnemen... ${sec}s`;
    if(sec <= 0) clearInterval(countdown);
  }, 1000);
  setTimeout(() => { clearInterval(countdown); stopDatalog(); }, DATALOG_DURATION);
}

function feedDatalog(pid, val) {
  if(!window.datalogActive || !window.datalogBuffer[pid]) return;
  window.datalogBuffer[pid].push({t:Date.now()-window.datalogStart, v:val});
}

function stopDatalog() {
  window.datalogActive = false;
  const btn = document.getElementById('aiBtn');
  if(btn) { btn.textContent = '🔬 Snelle AI analyse'; btn.style.background=''; }
  log('📊 Datalog klaar — analyseren...','ok');
  runDatalogAI();
}

function getDatalogStats() {
  const stats = {};
  Object.entries(window.datalogBuffer).forEach(([pid,readings]) => {
    if(!readings.length) return;
    const vals = readings.map(r=>r.v);
    const min = Math.min(...vals), max = Math.max(...vals), avg = vals.reduce((a,b)=>a+b,0)/vals.length;
    const first = vals.slice(0,Math.ceil(vals.length/4)).reduce((a,b)=>a+b,0)/Math.ceil(vals.length/4);
    const last  = vals.slice(-Math.ceil(vals.length/4)).reduce((a,b)=>a+b,0)/Math.ceil(vals.length/4);
    const trendPct = ((last-first)/Math.max(Math.abs(first),.001))*100;
    const trend = trendPct>8?'↑ stijgend':trendPct<-8?'↓ dalend':'→ stabiel';
    const def = window.discoveredPIDDefs?.find(d=>d.pid===pid) || window.ALL_PID_DEFS?.[pid];
    stats[pid] = {name:def?.name||pid, unit:def?.unit||'', min, max, avg, trend, count:vals.length};
  });
  return stats;
}

// ── POLL LOOP ──
function startPoll() {
  clearInterval(window.pollTimer);
  window.dataStable = false;
  window.stabilityCount = {};
  window.pidSmooth = {};
  window.outlierCount = {};
  const c = document.getElementById('aiContent');
  if(c) c.innerHTML = `<div class="ai-ph"><div class="pi">📡</div><p>Data valideren...<br><br>Even geduld — outliers worden gefilterd.</p></div>`;

  window.pollTimer = setInterval(async () => {
    if(!window.connected || !window.activePIDs.size) return;
    for(const pid of window.activePIDs) {
      const raw = window.demoMode ? demo(pid) : parsePID(pid, await sendCmd('01'+pid.slice(2)));
      if(raw !== null && raw !== undefined) {
        updPID(pid, raw);
        checkStability(pid, raw);
        feedDatalog(pid, raw);
      }
    }
  }, window.demoMode ? 600 : 1500);
}

function updPID(pid, val) {
  window.pidVals[pid] = val;
  if(!window.pidHist[pid]) window.pidHist[pid] = [];
  window.pidHist[pid].push({t:Date.now(), v:val});
  if(window.pidHist[pid].length > 120) window.pidHist[pid].shift();
  applyG(pid, val);
  if(window.graphPID===pid || window.trendPIDs?.includes(pid)) drawGraph();
}

// Exporteer
window.validateAndSmooth = validateAndSmooth;
window.checkStability    = checkStability;
window.startDatalog      = startDatalog;
window.feedDatalog       = feedDatalog;
window.stopDatalog       = stopDatalog;
window.getDatalogStats   = getDatalogStats;
window.startPoll         = startPoll;
window.updPID            = updPID;
