// ════════════════════════════════════════
// ai.js — Anthropic API, datalog analyse, rit analyse
// ════════════════════════════════════════

window.anthropicKey = '';

function loadApiKey() {
  if(window.DEMO_API_KEY?.startsWith('sk-ant-')) {
    window.anthropicKey = window.DEMO_API_KEY;
    try { localStorage.setItem('ns_api_key', window.DEMO_API_KEY); } catch(e) {}
  } else {
    try { window.anthropicKey = localStorage.getItem('ns_api_key') || ''; } catch(e) {}
  }
  updateApiPill();
}

function saveApiKey() {
  let val = document.getElementById('apiKeyInput').value.trim();
  if(val === '••••••••••••••••') val = window.anthropicKey;
  if(val && !val.startsWith('sk-ant-')) {
    document.getElementById('apiStatus').innerHTML = '<span style="color:var(--rd)">⚠ Moet beginnen met sk-ant-</span>';
    return;
  }
  window.anthropicKey = val;
  try { val ? localStorage.setItem('ns_api_key',val) : localStorage.removeItem('ns_api_key'); } catch(e) {}
  updateApiPill();
  closeApiDialog();
  log(val ? 'API key opgeslagen' : 'API key verwijderd', val ? 'ok' : 'warn');
}

function clearApiKey() {
  window.anthropicKey = '';
  try { localStorage.removeItem('ns_api_key'); } catch(e) {}
  updateApiPill();
  closeApiDialog();
}

function updateApiPill() {
  const p = document.getElementById('apiPill');
  if(!p) return;
  p.textContent = window.anthropicKey ? '🤖 AI ✓' : '🤖 AI';
  p.className = 'api-pill ' + (window.anthropicKey ? 'set' : 'unset');
}

function openApiDialog() {
  document.getElementById('apiKeyInput').value = window.anthropicKey ? '••••••••••••••••' : '';
  document.getElementById('apiStatus').innerHTML = window.anthropicKey
    ? '<span style="color:var(--gn)">✅ Key actief</span>'
    : '<span style="color:var(--or)">Geen key</span>';
  document.getElementById('apiDialog').classList.add('open');
}

function closeApiDialog() {
  document.getElementById('apiDialog').classList.remove('open');
}

// ── API FETCH ──
async function apiFetch(prompt, maxTokens=1200) {
  const key = window.anthropicKey || window.DEMO_API_KEY || '';
  if(!key || !key.startsWith('sk-ant-')) {
    throw new Error('Geen API key. Stel in via 🤖 rechtsboven.');
  }
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{role:'user', content:prompt}]
    })
  });
  if(!resp.ok) {
    const err = await resp.json().catch(()=>({}));
    if(resp.status===401) throw new Error('API key ongeldig of verlopen.');
    if(resp.status===429) throw new Error('Te veel verzoeken. Even wachten.');
    throw new Error(err.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text || '';
}

// ── RENDER AI TEKST ──
function renderAIText(text, contentEl) {
  const secs = [
    {k:'SAMENVATTING',         i:'📋',c:'blue'},
    {k:'BEVINDINGEN',          i:'🔍',c:'orange'},
    {k:'PRIORITEIT ACTIES',    i:'⚡',c:'red'},
    {k:'REPARATIE STAPPEN',    i:'🔧',c:'orange'},
    {k:'KAN IK HET ZELF?',     i:'🛠️',c:'green'},
    {k:'KOSTEN SCHATTING',     i:'💶',c:'purple'},
    {k:'GESCHATTE KOSTEN',     i:'💶',c:'purple'},
    {k:'URGENTIE',             i:'🚨',c:'red'},
    {k:'HUIDIGE SITUATIE',     i:'📊',c:'blue'},
    {k:'GEVONDEN INEFFICIËNTIES',i:'🔍',c:'orange'},
    {k:'BESPAARTIPS',          i:'💡',c:'green'},
    {k:'TOTALE BESPARING',     i:'💶',c:'purple'},
    {k:'RIJSTIJL TIPS',        i:'🚗',c:'blue'},
    {k:'AANBEVELINGEN',        i:'✅',c:'green'},
  ];
  const found = [];
  secs.forEach(s => {
    if(text.toLowerCase().includes(s.k.toLowerCase()))
      found.push({...s, idx:text.toLowerCase().indexOf(s.k.toLowerCase())});
  });
  found.sort((a,b) => a.idx-b.idx);

  const frag = document.createDocumentFragment();
  const res = document.createElement('div'); res.className='ai-res';

  found.forEach((s,i) => {
    const next = found[i+1];
    const re = new RegExp(`${s.k}\\s*([\\s\\S]*?)${next?`(?=${next.k})`:'$'}`, 'i');
    const m = text.match(re); if(!m) return;
    const body = m[1].trim(); if(!body) return;
    const sec = document.createElement('div'); sec.className='ai-sec';
    const hd = document.createElement('div'); hd.className=`ai-sh ${s.c}`; hd.textContent=`${s.i} ${s.k}`;
    const bd = document.createElement('div'); bd.className='ai-sb';
    // Veilig — geen innerHTML met externe data
    bd.textContent = body;
    sec.appendChild(hd); sec.appendChild(bd);
    res.appendChild(sec);
  });

  if(!found.length) {
    const sec = document.createElement('div'); sec.className='ai-sec';
    const hd = document.createElement('div'); hd.className='ai-sh blue'; hd.textContent='📋 Analyse';
    const bd = document.createElement('div'); bd.className='ai-sb'; bd.textContent=text;
    sec.appendChild(hd); sec.appendChild(bd); res.appendChild(sec);
  }

  frag.appendChild(res);
  contentEl.innerHTML = '';
  contentEl.appendChild(frag);
}

async function callAI(prompt, contentEl) {
  contentEl.innerHTML = '<div class="ai-ld"><div class="spin"></div> AI analyseert...</div>';
  try {
    if(!window.dataStable && window.connected && !window.demoMode && window.activePIDs.size>0) {
      contentEl.innerHTML = `<div class="ai-sec"><div class="ai-sh orange">⏳ Data stabiliseert</div><div class="ai-sb">Even geduld — sensorwaarden worden gevalideerd.</div></div>`;
      return;
    }
    const text = await apiFetch(prompt);
    renderAIText(text, contentEl);
    log('AI analyse klaar','ok');
  } catch(e) {
    const isAuth = e.message.includes('ongeldig')||e.message.includes('401');
    const sec = document.createElement('div'); sec.className='ai-sec';
    const hd = document.createElement('div'); hd.className='ai-sh red';
    hd.textContent = `⚠ ${isAuth?'API Key fout':'Verbindingsfout'}`;
    const bd = document.createElement('div'); bd.className='ai-sb'; bd.textContent=e.message;
    sec.appendChild(hd); sec.appendChild(bd);
    contentEl.innerHTML = ''; contentEl.appendChild(sec);
    log('AI fout: '+e.message,'err');
  }
}

async function runQuickAI() {
  const v = window.vehicleInfo || {};
  const liveLines = [...window.activePIDs].map(pid => {
    const d = window.discoveredPIDDefs?.find(p=>p.pid===pid) || window.ALL_PID_DEFS?.[pid];
    return d && window.pidVals[pid]!==undefined ? `• ${d.name}: ${fv(window.pidVals[pid])} ${d.unit}` : null;
  }).filter(Boolean);
  const prompt = `Analyseer dit voertuig in het Nederlands als expert automonteur.\n\nVoertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''}\nSensordata:\n${liveLines.join('\n')||'(geen)'}\nDTC: ${(window.dtcCodes||[]).join(', ')||'geen'}\n\nGeef: SAMENVATTING, BEVINDINGEN, PRIORITEIT ACTIES (🔴/🟡/🟢), KAN IK HET ZELF?, GESCHATTE KOSTEN`;
  const btn = document.getElementById('aiBtn'); if(btn) btn.disabled=true;
  await callAI(prompt, document.getElementById('aiContent'));
  if(btn) btn.disabled=false;
}

async function runDatalogAI() {
  const stats = getDatalogStats();
  if(!Object.keys(stats).length) { log('Geen datalog data','warn'); return; }
  const v = window.vehicleInfo || {};
  const statLines = Object.values(stats).map(s =>
    `• ${s.name}: gem=${fv(s.avg)} ${s.unit}, min=${fv(s.min)}, max=${fv(s.max)}, trend=${s.trend}`
  ).join('\n');
  const prompt = `Analyseer deze 20-seconden datalog in het Nederlands.\n\nVoertuig: ${v.merk||'?'} ${v.year||''}\nDTC: ${(window.dtcCodes||[]).join(', ')||'geen'}\n\nDATALOG:\n${statLines}\n\nLet op correlaties, trends en afwijkingen.\n\nGeef: SAMENVATTING, BEVINDINGEN, PRIORITEIT ACTIES (🔴/🟡/🟢), KAN IK HET ZELF?, GESCHATTE KOSTEN`;
  const btn = document.getElementById('aiBtn'); if(btn) btn.disabled=true;
  await callAI(prompt, document.getElementById('aiContent'));
  if(btn) btn.disabled=false;
  log('Datalog AI klaar','ok');
}

// ── RIT ANALYSE AI ──
window.ritLogs = [];
window.ritFaseData = {};
window.ritActive = false;
window.ritFaseIdx = 0;

function isPIDOkVal(pid, val) {
  const def = window.discoveredPIDDefs?.find(d=>d.pid===pid) || window.ALL_PID_DEFS?.[pid];
  if(!def) return true;
  if(def.dH&&val>=def.dH) return false; if(def.dL&&val<=def.dL) return false;
  if(def.wH&&val>=def.wH) return false; if(def.wL&&val<=def.wL) return false;
  return true;
}

async function analyseRitFase(idx) {
  const {fase, data} = window.ritFaseData[idx];
  const stats = {};
  Object.entries(data).forEach(([pid,readings]) => {
    if(!readings.length) return;
    const vals = readings.map(r=>r.v);
    const min=Math.min(...vals),max=Math.max(...vals),avg=vals.reduce((a,b)=>a+b,0)/vals.length;
    const first=vals.slice(0,3).reduce((a,b)=>a+b,0)/3;
    const last =vals.slice(-3).reduce((a,b)=>a+b,0)/3;
    const trend=((last-first)/Math.max(Math.abs(first),.001))*100;
    const def = window.discoveredPIDDefs?.find(d=>d.pid===pid)||window.ALL_PID_DEFS?.[pid];
    stats[pid] = {name:def?.name||pid,unit:def?.unit||'',min,max,avg,trend,ok:isPIDOkVal(pid,avg),count:vals.length};
  });
  window.ritLogs.push({fase:fase.naam, duur:fase.duur, stats});

  // Toon fase kaart
  const card = document.createElement('div');
  card.style.cssText = 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:12px;margin-bottom:8px;';
  const hasProbleem = Object.values(stats).some(s=>!s.ok);
  const titleEl = document.createElement('div');
  titleEl.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
  const tLeft = document.createElement('div'); tLeft.style.cssText='font-size:12px;font-weight:700;color:#fff;';
  tLeft.textContent=`${fase.icon} ${fase.naam}`;
  const tRight = document.createElement('div');
  tRight.style.cssText=`font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:${hasProbleem?'rgba(255,0,110,.15)':'rgba(0,255,200,.1)'};color:${hasProbleem?'#ff6464':'#00ffc8'}`;
  tRight.textContent = hasProbleem ? '⚠ AFWIJKING' : '✅ OK';
  titleEl.appendChild(tLeft); titleEl.appendChild(tRight);
  card.appendChild(titleEl);

  const statsEl = document.createElement('div');
  statsEl.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;';
  Object.values(stats).forEach(s => {
    const chip = document.createElement('div');
    chip.style.cssText=`font-size:10px;padding:3px 8px;border-radius:5px;background:${s.ok?'rgba(255,255,255,.05)':'rgba(255,0,110,.1)'};color:${s.ok?'rgba(255,255,255,.6)':'#ff6464'}`;
    chip.textContent = `${s.name}: ${fv(s.avg)} ${s.unit} ${s.trend>5?'↑':s.trend<-5?'↓':'→'}`;
    statsEl.appendChild(chip);
  });
  card.appendChild(statsEl);

  const aiEl = document.createElement('div');
  aiEl.style.cssText='font-size:10px;color:rgba(255,255,255,.3);font-style:italic;';
  aiEl.id = 'rit-ai-'+idx;
  aiEl.textContent = 'AI analyseert...';
  card.appendChild(aiEl);

  document.getElementById('ritPhaseResults').prepend(card);

  // AI analyse
  const v = window.vehicleInfo || {};
  const statLines = Object.values(stats).map(s=>
    `• ${s.name}: gem=${fv(s.avg)} ${s.unit}, min=${fv(s.min)}, max=${fv(s.max)}`
  ).join('\n');
  try {
    const text = await apiFetch(
      `Rit fase — ${fase.naam} (${fase.duur}s)\nVoertuig: ${v.merk||'?'} ${v.year||''}\n\n${statLines}\n\nGeef in 2-3 zinnen: wat valt op, is er een probleem?`,
      400
    );
    const el = document.getElementById('rit-ai-'+idx);
    if(el) el.textContent = text.slice(0,200);
    window.ritLogs[window.ritLogs.length-1].aiAnalyse = text;
  } catch(e) {}
}

async function generateRitRapport() {
  const v = window.vehicleInfo || {};
  const elapsed = Math.floor((Date.now()-window.ritStartTime)/1000);
  const mins=Math.floor(elapsed/60), secs=elapsed%60;

  const lines = [
    `NEWSPEEDY AI OBD — RIT ANALYSE RAPPORT`,
    `Datum: ${new Date().toLocaleString('nl')}`,
    `Voertuig: ${v.merk||'?'} ${v.year||''} ${v.vin||''}`,
    `Rit duur: ${mins}:${secs.toString().padStart(2,'0')} min`,
    `Fases: ${window.ritLogs.length}`, '',
    '═══════════════════════════════════', '',
  ];
  window.ritLogs.forEach((l,i) => {
    lines.push(`FASE ${i+1}: ${l.fase} (${l.duur}s)`);
    Object.values(l.stats).forEach(s => {
      lines.push(`  • ${s.name}: gem=${fv(s.avg)} ${s.unit}${!s.ok?' ⚠':''}`);
    });
    if(l.aiAnalyse) lines.push(`  → AI: ${l.aiAnalyse.slice(0,200)}`);
    lines.push('');
  });

  document.getElementById('ritStatus').textContent = 'AI totaalanalyse...';
  const allStats = window.ritLogs.map(l=>
    `${l.fase}: ${Object.values(l.stats).map(s=>`${s.name}=${fv(s.avg)}${s.unit}${!s.ok?' (!)':''}`).join(', ')}`
  ).join('\n');

  try {
    const totalAnalysis = await apiFetch(
      `Analyseer complete rit van ${mins} min voor ${v.merk||'auto'} in het Nederlands.\n\nFase data:\n${allStats}\n\nGeef: SAMENVATTING, BEVINDINGEN, PRIORITEIT ACTIES (🔴/🟡/🟢), AANBEVELINGEN`,
      1200
    );
    lines.push('═══════════════════════════════════','TOTAAL AI ANALYSE:',totalAnalysis);
    document.getElementById('ritStatus').textContent = `✅ Rit rapport klaar — ${mins}:${secs.toString().padStart(2,'0')} min`;
    closeRitAnalyse();
    renderAIText(totalAnalysis, document.getElementById('aiContent'));

    // Toon ook in rechter AI paneel als rit evaluatie
    showRitEvaluatieInAI(totalAnalysis, window.ritLogs);
  } catch(e) {
    document.getElementById('ritStatus').textContent = 'Rapport klaar (geen AI beschikbaar)';
  }

  downloadFile(`rit-analyse-${new Date().toISOString().slice(0,10)}.txt`, lines.join('\n'));
  log('🚗 Rit rapport gedownload','ok');
}

function showRitEvaluatieInAI(totalText, ritLogs) {
  const content = document.getElementById('aiContent');
  const frag = document.createDocumentFragment();

  // Header
  const header = document.createElement('div');
  header.style.cssText='background:linear-gradient(135deg,rgba(0,245,255,.1),rgba(167,139,250,.1));border:1px solid rgba(0,245,255,.2);border-radius:8px;padding:10px 12px;margin-bottom:10px;';
  const ht = document.createElement('div'); ht.style.cssText='font-size:12px;font-weight:700;margin-bottom:3px;';
  ht.textContent='🚗 Rit Evaluatie';
  const hs = document.createElement('div'); hs.style.cssText='font-size:10px;color:var(--tx3);';
  hs.textContent=`${ritLogs.length} fases geanalyseerd`;
  header.appendChild(ht); header.appendChild(hs);
  frag.appendChild(header);

  // Fase samenvatting chips
  const chips = document.createElement('div');
  chips.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;';
  ritLogs.forEach((l,i) => {
    const hasProbleem = Object.values(l.stats).some(s=>!s.ok);
    const chip = document.createElement('div');
    chip.style.cssText=`font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;background:${hasProbleem?'var(--rds)':'var(--gns)'};color:${hasProbleem?'var(--rd)':'var(--gn)'}`;
    chip.textContent=`${l.fase.split(' ')[0]} ${hasProbleem?'⚠':'✅'}`;
    chips.appendChild(chip);
  });
  frag.appendChild(chips);

  // AI analyse
  const aiDiv = document.createElement('div');
  renderAIText(totalText, aiDiv);
  frag.appendChild(aiDiv);

  content.innerHTML='';
  content.appendChild(frag);
}

// Exporteer
window.loadApiKey      = loadApiKey;
window.saveApiKey      = saveApiKey;
window.clearApiKey     = clearApiKey;
window.updateApiPill   = updateApiPill;
window.openApiDialog   = openApiDialog;
window.closeApiDialog  = closeApiDialog;
window.apiFetch        = apiFetch;
window.renderAIText    = renderAIText;
window.callAI          = callAI;
window.runQuickAI      = runQuickAI;
window.runDatalogAI    = runDatalogAI;
window.analyseRitFase  = analyseRitFase;
window.generateRitRapport = generateRitRapport;
window.isPIDOkVal      = isPIDOkVal;
