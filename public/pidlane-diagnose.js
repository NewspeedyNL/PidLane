// ══════════════════════════════════════════════════════════════════
// pidlane-diagnose.js
// Smart Diagnose + klacht-gestuurde PID-focus
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// SMART DIAGNOSE
// ════════════════════════════════════════
function tc(el){el.classList.toggle('on');}

// ══════════════════════════════════════════════════════
// IDEE 5 — KLACHT-GESTUURDE PID-FOCUS
// Op basis van de klachtomschrijving worden de meest relevante PIDs aan
// activePIDs toegevoegd én via _focusPIDs op het snelste poll-tempo gezet.
// ══════════════════════════════════════════════════════
// → COMPLAINT_FOCUS verplaatst naar pidlane-data.js
function applyComplaintFocus(text){
  _focusPIDs=new Set();
  const matched=new Set();
  for(const rule of COMPLAINT_FOCUS){
    if(rule.kw.some(k=>text.includes(k))){
      rule.pids.forEach(p=>matched.add(p));
    }
  }
  if(!matched.size) return;
  // Alleen PIDs die de auto kan leveren (of in demo) — als handmatige keuze
  // markeren zodat ensurePIDListActive ze niet wegfiltert.
  matched.forEach(p=>{
    if(demoMode || (supportedPIDs.size>0?supportedPIDs.has(p):getPidDef(p))){
      // Toevoegpoort (§15, ronde 6). De klachtregels zijn generiek — "rook"
      // trekt roet- en NOx-sensoren aan, ook op een benzineauto. Dat ging
      // hier ongefilterd naar binnen; de gate zegt nu of het mag.
      if(!pidToevoegen(p).ok.length) return;
      _focusPIDs.add(p);
      _pidNextPoll[p]=0; // direct aan de beurt
    }
  });
  log(`🎯 Klacht-focus: ${_focusPIDs.size} sensoren op hoog tempo`,'info');
}

// ── Deur 1: efficiente opslag/ophalen van diagnose-resultaten (cache + historie) ──
function _diagNorm(s){ return String(s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
function _diagSig(v, desc, chips, whenChips, dtc){
  return JSON.stringify({
    m:_diagNorm(v&&v.merk), mo:_diagNorm(v&&v.model), y:_diagNorm(v&&v.year), b:_diagNorm(v&&v.brandstof),
    d:_diagNorm(desc),
    s:(chips||[]).map(_diagNorm).sort(),
    w:(whenChips||[]).map(_diagNorm).sort(),
    t:(dtc||[]).map(_diagNorm).sort()
  });
}
function _diagKey(sig){ let h=0; for(let i=0;i<sig.length;i++){ h=(h*31+sig.charCodeAt(i))|0; } return 'pl_diag_'+(h>>>0).toString(36); }
const DIAG_CACHE_TTL=1000*60*60*24*14; // 14 dagen
function diagCacheGet(sig){
  try{ const raw=localStorage.getItem(_diagKey(sig)); if(!raw) return null;
    const o=JSON.parse(raw); if(!o||o.sig!==sig) return null;
    if(Date.now()-(o.ts||0)>DIAG_CACHE_TTL) return null;
    return Array.isArray(o.causes)?o.causes:null;
  }catch(e){ return null; }
}
function diagCacheSet(sig, causes){
  try{ localStorage.setItem(_diagKey(sig), JSON.stringify({sig, ts:Date.now(), causes})); }catch(e){}
}
function diagHistoryAdd(v, desc, causes){
  try{
    const id=_diagNorm((v&&(v.vin||v.merk))||'algemeen').replace(/\s+/g,'');
    const key='pl_diaghist_'+id;
    const arr=JSON.parse(localStorage.getItem(key)||'[]');
    arr.unshift({ ts:Date.now(), desc:String(desc||'').slice(0,120),
      top:(causes||[]).slice(0,3).map(c=>({ n:String(c.naam||'').slice(0,60), k:c.kans||'' })) });
    localStorage.setItem(key, JSON.stringify(arr.slice(0,25)));
  }catch(e){}
}
async function findCauses(force){
  const desc=document.getElementById('diagDesc').value.trim();
  const chips=[...document.querySelectorAll('#diagChips .chip.on')].map(c=>c.textContent);
  const whenChips=[...document.querySelectorAll('#diagWhen .chip.on')].map(c=>c.textContent);
  const whenLine=whenChips.length?('\nWanneer: '+whenChips.join(', ')):'';
  if(!desc&&!chips.length&&!whenChips.length){showToast('Beschrijf het probleem of selecteer symptomen.', 3000);return;}
  if(!(await preAnalysisCheck())) return;

  // ── IDEE 5: klacht-gestuurde focus — relevante PIDs op hoog tempo ──
  applyComplaintFocus((desc+' '+chips.join(' ')).toLowerCase());
  await ensurePIDsActive('emissie');

  document.getElementById('dstep2').style.display='block';
  document.getElementById('dsn1').className='dsn done'; document.getElementById('dsn1').textContent='✓';
  document.getElementById('dsn2').className='dsn active';
  document.getElementById('btnFindCauses').disabled=true;
  document.getElementById('causesBox').innerHTML='<div class="ai-ld"><div class="spin"></div> AI zoekt meest voorkomende oorzaken...</div>';
  document.getElementById('dstep3').style.display='none';

  const v=getVehicle();

  // PID beschikbaarheidscheck — welke diagnostische PIDs heeft deze auto?
  const KEY_DIAG_PIDS=[
    {pid:'0106',name:'Brandstoftrim kort',alt:'0107'},
    {pid:'0107',name:'Brandstoftrim lang',alt:null},
    {pid:'0110',name:'MAF luchtmassameter',alt:'010B'},
    {pid:'0105',name:'Koelwater temp',alt:'015C'},
    {pid:'0142',name:'Accuspanning',alt:null},
    {pid:'010C',name:'Motortoerental',alt:null},
    {pid:'010A',name:'Brandstofdruk',alt:'0110'},
    {pid:'0114',name:'O2 sensor B1S1',alt:'0124'},
    {pid:'0115',name:'O2 sensor B1S2',alt:'0125'},
    {pid:'012C',name:'EGR positie',alt:null},
  ];
  const pidStatus=KEY_DIAG_PIDS.map(p=>({
    ...p,
    available: supportedPIDs.size===0||supportedPIDs.has(p.pid),
    altAvailable: p.alt&&(supportedPIDs.size===0||supportedPIDs.has(p.alt)),
    hasData: pidVals[p.pid]!==undefined,
  }));
  const available=pidStatus.filter(p=>p.available);
  const missing=pidStatus.filter(p=>!p.available&&!p.altAvailable);
  const withAlt=pidStatus.filter(p=>!p.available&&p.altAvailable);
  const reliability=Math.round((available.length/KEY_DIAG_PIDS.length)*100);

  // Toon PID beschikbaarheid boven de oorzaken
  const pidInfoHtml=`
    <div style="background:var(--sur2);border:1px solid var(--bd);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px">
      <div style="font-weight:700;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
        <span>🔌 Diagnose PIDs</span>
        <span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:${reliability>=75?'var(--gns)':reliability>=50?'var(--ors)':'var(--rds)'};color:${reliability>=75?'var(--gn)':reliability>=50?'var(--or)':'var(--rd)'}">${reliability}% betrouwbaar</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:${missing.length||withAlt.length?'6px':'0'}">
        ${available.map(p=>`<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:var(--gns);color:var(--gn);font-weight:600">✅ ${p.name}</span>`).join('')}
      </div>
      ${withAlt.length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px">${withAlt.map(p=>`<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:var(--ors);color:var(--or);font-weight:600">⚠ ${p.name} → alternatief: ${KEY_DIAG_PIDS.find(x=>x.pid===p.alt)?.name||p.alt}</span>`).join('')}</div>`:''}
      ${missing.length?`<div style="display:flex;flex-wrap:wrap;gap:4px">${missing.map(p=>`<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:var(--rds);color:var(--rd);font-weight:600">❌ ${p.name} ontbreekt</span>`).join('')}</div>`:''}
    </div>`;
  const prompt=`Je bent expert automonteur met 20 jaar ervaring. Geef de 4 meest VOORKOMENDE oorzaken voor dit probleem, gesorteerd op hoe vaak je ze ziet.

Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.motor||''} ${v.brandstof?'('+v.brandstof+')':''}
Beoordeel alleen op basis van beschikbare sensordata. Geen aannames over turbo/diesel/AdBlue/hybride tenzij het voertuigtype of de data dit aantoont.
Beschrijving: ${desc}
Symptomen: ${chips.join(', ')||'geen'}${whenLine}
DTC codes: ${formatDtcCodes(dtcCodes)}

Beschikbare diagnose PIDs (${reliability}% dekking):
✅ Beschikbaar: ${available.map(p=>p.name).join(', ')||'geen'}
⚠ Alternatief: ${withAlt.map(p=>p.name).join(', ')||'geen'}
❌ Ontbreekt: ${missing.map(p=>p.name).join(', ')||'geen'}

Pas je check_pids aan op basis van wat beschikbaar is. Gebruik alternatieven waar nodig.

Antwoord met UITSLUITEND een geldige JSON-array — geen inleiding, geen tekst eromheen, geen markdown of backticks. Houd 'uitleg' kort (max 25 woorden). Gebruik in check_pids ALLEEN hex-PID-codes uit de beschikbare lijst hierboven.
Formaat (exact deze sleutels):
[{"naam":"Naam","kans":"hoog|med|laag","frequentie":"65% van gevallen","uitleg":"Waarom","check_pids":["0106","0107"],"check_uitleg":"Wat te zien","check_waarden":{"0106":{"min":10,"max":30,"beschrijving":"STFT hoog"}},"bewijs_logica":"Als X dan Y"}]`;

  try{
    const _sig=_diagSig(v, desc, chips, whenChips, dtcCodes);
    let causes=null, fromCache=false;
    if(!force){ const c=diagCacheGet(_sig); if(c&&c.length){ causes=c; fromCache=true; } }
    if(!causes){
      const text=await apiFetch(prompt,2200);
      causes=parseCausesJSON(text);
      if(!causes.length){ causes=[{naam:'Analyse',kans:'med',frequentie:'',uitleg:String(text).replace(/```json|```/g,'').trim().slice(0,300),check_pids:[],check_uitleg:'',check_waarden:{},bewijs_logica:''}]; }
      try{ fillCausePids(causes, (available||[]).map(p=>p.pid).concat((withAlt||[]).map(p=>p.alt))); }catch(e){}
      diagCacheSet(_sig, causes);
      diagHistoryAdd(v, desc, causes);
    }
    diagCauses=causes;
    document.getElementById('causesBox').innerHTML=pidInfoHtml + (fromCache?'<div style="font-size:11px;color:var(--tx3);padding:5px 2px">⚡ Uit geheugen (zelfde voertuig + symptomen) — <a href="#" onclick="findCauses(true);return false" style="color:var(--bl);font-weight:700">opnieuw analyseren</a></div>':'');
    const causesEl=document.createElement('div');
    document.getElementById('causesBox').appendChild(causesEl);
    renderCauses(causes,causesEl);
    log(`${causes.length} oorzaken ${fromCache?'(uit geheugen)':'gevonden'} (${reliability}% PID dekking)`,'ok');
  }catch(e){
    document.getElementById('causesBox').innerHTML=pidInfoHtml+`<div style="padding:10px;background:var(--rds);border-radius:8px;font-size:13px;color:var(--rd)">Fout: ${e.message}</div>`;
  }
  document.getElementById('btnFindCauses').disabled=false;
}

// ── Robuuste JSON-parser voor AI-oorzaken (vangt markdown-fences + afkapping op) ──
function parseCausesJSON(text){
  if(!text) return [];
  let t=String(text).replace(/```json/gi,'').replace(/```/g,'').trim();
  const a=t.indexOf('['); if(a>=0) t=t.slice(a);
  try{ const r=JSON.parse(t); if(Array.isArray(r)) return r; }catch(e){}
  // afkap-reparatie: knip tot laatste volledige object en sluit de array
  try{ const lb=t.lastIndexOf('}'); if(lb>0){ const r=JSON.parse(t.slice(0,lb+1)+']'); if(Array.isArray(r)) return r; } }catch(e){}
  // laatste redmiddel: losse objecten eruit vissen
  try{ const objs=t.match(/\{[^{}]*\}/g)||[]; const r=objs.map(o=>{try{return JSON.parse(o);}catch(_){return null;}}).filter(Boolean); if(r.length) return r; }catch(e){}
  return [];
}
// ── Leid relevante PIDs af uit oorzaak-tekst (alleen wat de auto echt levert) ──
function _pidKeywordCandidates(txt){
  txt=(txt||'').toLowerCase(); const m=[]; const add=(...c)=>c.forEach(x=>{ if(!m.includes(x)) m.push(x); });
  if(/trim|mengsel|lambda|injector|rijk|arm|brandstofverhouding|sproei|spuitpat/.test(txt)) add('0106','0107','0108','0109','0134','0114');
  if(/misfire|ontsteking|bougie|stotter|hapert|overslaan|cilinder/.test(txt)) add('010C','0104','0111','0106');
  if(/maf|luchtmassa|lucht|inlaat|luchtfilter/.test(txt)) add('0110','010B','010F');
  if(/egr/.test(txt)) add('012C','0105');
  if(/koel|oververhit|temperat|thermostaat/.test(txt)) add('0105');
  if(/druk|pomp|toevoer/.test(txt)) add('010A','010B');
  if(/turbo|laaddruk|boost/.test(txt)) add('010B','0170');
  if(/accu|spanning|dynamo|alternator|start/.test(txt)) add('0142');
  if(/gasklep|throttle|vermogen/.test(txt)) add('0111','0104','010C');
  if(/toerental|stationair|idle|rpm/.test(txt)) add('010C','0104');
  return m;
}
function fillCausePids(causes, availCodes){
  const avail=(availCodes||[]).map(String).filter(Boolean); const availSet=new Set(avail);
  (causes||[]).forEach(c=>{
    let pids=Array.isArray(c.check_pids)?c.check_pids.map(String):[];
    if(availSet.size) pids=pids.filter(p=>availSet.has(p));            // alleen leverbare PIDs
    if(!pids.length){
      let cand=_pidKeywordCandidates((c.naam||'')+' '+(c.uitleg||''));
      if(availSet.size) cand=cand.filter(p=>availSet.has(p));
      if(!cand.length && avail.length) cand=avail.slice(0,4);          // fallback: kern-PIDs van deze auto
      pids=cand;
    }
    c.check_pids=pids.slice(0,6);
  });
  return causes;
}
function renderCauses(causes, container){
  const box=container||document.getElementById('causesBox'); box.innerHTML='';
  if(!causes.length){box.innerHTML='<p style="color:var(--tx3);font-size:13px;padding:8px">Geen oorzaken gevonden. Probeer uitgebreider te beschrijven.</p>';return;}
  const grid=document.createElement('div'); grid.className='causes-grid'; box.appendChild(grid);
  causes.forEach((c,i)=>{
    const card=document.createElement('div'); card.className='cause-card'; card.id='cc-'+i;
    const pcls=c.kans==='hoog'?'ph':c.kans==='med'?'pm':'pl';
    const ptxt=c.kans==='hoog'?'HOOG':c.kans==='med'?'MED':'LAAG';
    card.innerHTML=`<div class="cause-prob ${pcls}">${ptxt}</div><div style="flex:1"><div class="cause-ttl">${i+1}. ${c.naam}</div>${c.frequentie?`<div class="cause-freq">📊 ${c.frequentie}</div>`:''}<div class="cause-body">${c.uitleg}</div><div class="cause-pids">${(c.check_pids||[]).map(p=>{const d=PIDS.find(x=>x.pid===p);return`<span class="pid-hint">${d?d.name:p}</span>`;}).join('')}</div></div>`;
    card.onclick=()=>verifyCause(i,c);
    grid.appendChild(card);
  });
  const hint=document.createElement('div');
  hint.style.cssText='font-size:12px;color:var(--tx3);padding:7px 10px;background:var(--bls);border-radius:7px;margin-top:6px';
  hint.textContent='👆 Klik op een oorzaak om live PID-data te meten en de diagnose te bewijzen of uit te sluiten';
  box.appendChild(hint);
}

async function verifyCause(idx,cause){
  document.querySelectorAll('.cause-card').forEach(c=>c.classList.remove('sel'));
  document.getElementById('cc-'+idx)?.classList.add('sel');
  selectedCause=cause;
  document.getElementById('dstep3').style.display='block';
  document.getElementById('dsn3').className='dsn active';
  document.getElementById('pidCheckBox').innerHTML='<div class="ai-ld"><div class="spin"></div> PIDs meten voor verificatie...</div>';
  document.getElementById('verdictBox').innerHTML='';
  document.getElementById('nextCauseBox').innerHTML='';

  const results=[];
  for(const pid of (cause.check_pids||[])){
    const def=getPidDef(pid); if(!def) continue;
    let val=pidVals[pid];
    // Bus per read claimen (fase 1): korte lezer, dus eerlijk delen met de
    // poll-loop i.p.v. de hele lus blokkeren.
    if(val===undefined) val=demoMode?demo(pid):validateAndSmooth(pid,parsePID(pid,await withBus('verificatie',()=>sendCmd('01'+pid.slice(2)))));
    if(val!==null&&val!==undefined) updPID(pid,val);

    const exp=cause.check_waarden?.[pid];
    let color='unknown',verdict='';
    if(val!==null&&val!==undefined){
      if(exp){
        if(val>=exp.min&&val<=exp.max){color='bad';verdict=`⚠️ ${fv(val)} ${def.unit} — bevestigt diagnose (${exp.min}–${exp.max})`;}
        else{color='ok';verdict=`✅ ${fv(val)} ${def.unit} — normaal`;}
      } else {
        const d2=getPidDef(pid);
        if(d2){
          if((d2.dH&&val>=d2.dH)||(d2.dL&&val<=d2.dL)){color='bad';verdict=`🔴 ${fv(val)} ${def.unit} — kritiek`;}
          else if((d2.wH&&val>=d2.wH)||(d2.wL&&val<=d2.wL)){color='warn';verdict=`⚠️ ${fv(val)} ${def.unit} — afwijkend`;}
          else{color='ok';verdict=`✅ ${fv(val)} ${def.unit} — normaal`;}
        } else {color='ok';verdict=`📊 ${fv(val)} ${def.unit}`;}
      }
    } else {verdict='Geen data';}
    results.push({pid,name:def.name,unit:def.unit,val,verdict,color,exp});
  }
  renderPIDCheck(results,cause);
  generateVerdict(results,cause,idx);
}

function renderPIDCheck(results,cause){
  const box=document.getElementById('pidCheckBox'); box.innerHTML='';
  if(cause.bewijs_logica){
    const l=document.createElement('div');
    l.style.cssText='font-size:12px;color:var(--tx2);padding:8px;background:var(--bls);border-radius:7px;margin-bottom:8px;line-height:1.5';
    l.innerHTML=`<strong>Bewijs logica:</strong> ${cause.bewijs_logica}`;
    box.appendChild(l);
  }
  if(!results.length){box.innerHTML='<div style="font-size:12px;color:var(--tx3);padding:8px">Geen specifieke PIDs voor deze oorzaak.</div>';return;}
  results.forEach(r=>{
    const el=document.createElement('div'); el.className='pcr-item';
    el.style.borderLeft=`3px solid ${r.color==='ok'?'var(--gn)':r.color==='bad'?'var(--rd)':r.color==='warn'?'var(--or)':'var(--bd)'}`;
    const icon=r.color==='ok'?'✅':r.color==='bad'?'🔴':r.color==='warn'?'⚠️':'❓';
    el.innerHTML=`<div class="pcr-icon">${icon}</div><div style="flex:1"><div class="pcr-nm">${r.name}</div>${r.exp?`<div class="pcr-expected">Afwijkend bereik: ${r.exp.min}–${r.exp.max} ${r.unit}</div>`:''}<div class="pcr-val ${r.color}">${r.verdict}</div></div>`;
    box.appendChild(el);
  });
}

function generateVerdict(results,cause,idx){
  const vbox=document.getElementById('verdictBox');
  const measured=results.filter(r=>r.val!==null&&r.val!==undefined);
  if(!measured.length){renderNextCause(idx);return;}
  const bad=results.filter(r=>r.color==='bad').length;
  const ok=results.filter(r=>r.color==='ok').length;
  const total=measured.length;
  let cls,title,body;
  if(bad>=Math.ceil(total*.6)){cls='confirmed';title='🔴 Diagnose bevestigd';body=`PID-data wijst sterk op <strong>${cause.naam}</strong>. ${bad}/${total} sensoren tonen afwijkingen.`;}
  else if(ok>=Math.ceil(total*.7)){cls='cleared';title='✅ Oorzaak uitgesloten';body=`Geen bewijs voor <strong>${cause.naam}</strong> in de live data. Probeer de volgende oorzaak.`;}
  else{cls='likely';title='⚠️ Gemengd bewijs';body=`Niet eenduidig voor <strong>${cause.naam}</strong>. Meer meting aanbevolen.`;}
  vbox.innerHTML=`<div class="verdict-box ${cls}"><div class="verdict-title">${title}</div><div class="verdict-body">${body}</div><div style="margin-top:10px"><button class="btn pri" onclick="runDiagAI('${cause.naam.replace(/'/g,'')}')">🤖 Volledige AI analyse →</button></div></div>`;
  log(`Verdict: ${title}`,'info');
  renderNextCause(idx);
}
function renderNextCause(idx){
  const nb=document.getElementById('nextCauseBox'); nb.innerHTML='';
  const next=diagCauses[idx+1];
  if(!next) return;
  const btn=document.createElement('button'); btn.className='next-cause-btn';
  btn.textContent=`→ Volgende: ${idx+2}. ${next.naam}`;
  btn.onclick=()=>verifyCause(idx+1,next);
  nb.appendChild(btn);
}
async function runDiagAI(causeName){
  const v=getVehicle();
  const desc=document.getElementById('diagDesc').value;
  const chips=[...document.querySelectorAll('#diagChips .chip.on')].map(c=>c.textContent).join(', ');
  const pdata=[...activePIDs].filter(isReportableSensor).map(pid=>{const d=getPidDef(pid);return d&&pidVals[pid]!==undefined?`${d.name}: ${fv(pidVals[pid])} ${d.unit}`:null;}).filter(Boolean).join('\n');
  const qBlok=_qualityBlokFor([...activePIDs].filter(isReportableSensor));
  const prompt=`Voertuig: ${v.merk} ${v.model} ${v.year}\nProbleem: ${desc}\nSymptomen: ${chips}\nOorzaak: ${causeName}\nPID data:\n${pdata}\nDTC: ${formatDtcCodes(dtcCodes)}${qBlok}\n\nGeef: SAMENVATTING, REPARATIE STAPPEN, KAN IK HET ZELF?, KOSTEN SCHATTING, URGENTIE`;
  const btn=document.getElementById('aiBtn'); if(btn) btn.disabled=true;
  const diagOut=document.getElementById('aiContentDiag');
  await callAI(prompt,diagOut);
  try{ diagOut.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){}
  if(btn) btn.disabled=false;
}
