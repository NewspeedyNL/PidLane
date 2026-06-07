// ════════════════════════════════════════
// diagnosis.js — Slimme diagnose flow
// Zie obd2-dashboard.html voor volledige implementatie
// Dit bestand bevat de diagnose-specifieke functies
// ════════════════════════════════════════

window.diagCauses = [];
window.selectedCause = null;

function tc(el){ el.classList.toggle('on'); }

async function findCauses(){
  const desc=document.getElementById('diagDesc').value.trim();
  const chips=[...document.querySelectorAll('#diagChips .chip.on')].map(c=>c.textContent);
  if(!desc&&!chips.length){alert('Beschrijf het probleem of selecteer symptomen.');return;}

  document.getElementById('dstep2').style.display='block';
  document.getElementById('dsn1').className='dsn done';
  document.getElementById('dsn1').textContent='✓';
  document.getElementById('dsn2').className='dsn active';
  document.getElementById('btnFindCauses').disabled=true;
  document.getElementById('causesBox').innerHTML='<div class="ai-ld"><div class="spin"></div> AI zoekt meest voorkomende oorzaken...</div>';
  document.getElementById('dstep3').style.display='none';

  const v=getVehicle();

  // PID beschikbaarheidscheck
  const KEY_DIAG_PIDS=[
    {pid:'0106',name:'Brandstoftrim kort',alt:'0107'},
    {pid:'0107',name:'Brandstoftrim lang',alt:null},
    {pid:'0110',name:'MAF luchtmassameter',alt:'010B'},
    {pid:'0105',name:'Koelwater temp',alt:'015C'},
    {pid:'0142',name:'Accuspanning',alt:null},
    {pid:'010C',name:'Motortoerental',alt:null},
    {pid:'010A',name:'Brandstofdruk',alt:'0110'},
    {pid:'0113',name:'O2 sensor B1S1',alt:'0115'},
    {pid:'012C',name:'EGR positie',alt:null},
  ];
  const pidStatus=KEY_DIAG_PIDS.map(p=>({
    ...p,
    available: window.supportedPIDs.size===0||window.supportedPIDs.has(p.pid),
    altAvailable: p.alt&&(window.supportedPIDs.size===0||window.supportedPIDs.has(p.alt)),
  }));
  const available=pidStatus.filter(p=>p.available);
  const missing=pidStatus.filter(p=>!p.available&&!p.altAvailable);
  const withAlt=pidStatus.filter(p=>!p.available&&p.altAvailable);
  const reliability=Math.round((available.length/KEY_DIAG_PIDS.length)*100);

  const pidInfoEl=document.createElement('div');
  pidInfoEl.style.cssText='background:var(--sur2);border:1px solid var(--bd);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:11px';
  const pidHeader=document.createElement('div');
  pidHeader.style.cssText='font-weight:700;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between';
  const pidTitle=document.createElement('span'); pidTitle.textContent='🔌 Diagnose PIDs';
  const pidScore=document.createElement('span');
  pidScore.style.cssText=`font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:${reliability>=75?'var(--gns)':reliability>=50?'var(--ors)':'var(--rds)'};color:${reliability>=75?'var(--gn)':reliability>=50?'var(--or)':'var(--rd)'}`;
  pidScore.textContent=`${reliability}% betrouwbaar`;
  pidHeader.appendChild(pidTitle); pidHeader.appendChild(pidScore);
  pidInfoEl.appendChild(pidHeader);

  const availEl=document.createElement('div');
  availEl.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px';
  available.forEach(p=>{
    const chip=document.createElement('span');
    chip.style.cssText='font-size:9px;padding:1px 6px;border-radius:4px;background:var(--gns);color:var(--gn);font-weight:600';
    chip.textContent='✅ '+p.name; availEl.appendChild(chip);
  });
  pidInfoEl.appendChild(availEl);

  const prompt=`Je bent expert automonteur met 20 jaar ervaring. Geef de 4 meest VOORKOMENDE oorzaken, gesorteerd op frequentie.

Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.motor||''}
Beschrijving: ${desc}
Symptomen: ${chips.join(', ')||'geen'}
DTC codes: ${(window.dtcCodes||[]).join(', ')||'geen'}
Beschikbare PIDs (${reliability}%): ${available.map(p=>p.name).join(', ')||'onbekend'}
Ontbrekende PIDs: ${missing.map(p=>p.name).join(', ')||'geen'}

Pas check_pids aan op beschikbare PIDs.
Geef EXACT dit JSON (puur JSON, geen markdown):
[{"naam":"Naam","kans":"hoog|med|laag","frequentie":"65% van gevallen","uitleg":"Waarom","check_pids":["0106","0107"],"check_uitleg":"Wat te zien","check_waarden":{"0106":{"min":10,"max":30,"beschrijving":"STFT hoog"}},"bewijs_logica":"Als X dan Y"}]`;

  try{
    const text=await apiFetch(prompt,1500);
    let causes=[];
    try{causes=JSON.parse(text.replace(/```json|```/g,'').trim());}
    catch(e){causes=[{naam:'Analyse',kans:'med',frequentie:'',uitleg:text.slice(0,300),check_pids:[],check_uitleg:'',check_waarden:{},bewijs_logica:''}];}
    window.diagCauses=causes;
    document.getElementById('causesBox').innerHTML='';
    document.getElementById('causesBox').appendChild(pidInfoEl);
    const causesContainer=document.createElement('div');
    document.getElementById('causesBox').appendChild(causesContainer);
    renderCauses(causes,causesContainer);
    log(`${causes.length} oorzaken gevonden (${reliability}% PID dekking)`,'ok');
  }catch(e){
    document.getElementById('causesBox').innerHTML='';
    document.getElementById('causesBox').appendChild(pidInfoEl);
    const errEl=document.createElement('div');
    errEl.style.cssText='padding:10px;background:var(--rds);border-radius:8px;font-size:12px;color:var(--rd)';
    errEl.textContent='Fout: '+e.message;
    document.getElementById('causesBox').appendChild(errEl);
  }
  document.getElementById('btnFindCauses').disabled=false;
}

function renderCauses(causes, container){
  const box=container||document.getElementById('causesBox');
  box.innerHTML='';
  if(!causes.length){
    const p=document.createElement('p');
    p.style.cssText='color:var(--tx3);font-size:12px;padding:8px';
    p.textContent='Geen oorzaken gevonden. Probeer uitgebreider te beschrijven.';
    box.appendChild(p); return;
  }
  const grid=document.createElement('div'); grid.className='causes-grid'; box.appendChild(grid);
  causes.forEach((c,i)=>{
    const card=document.createElement('div'); card.className='cause-card'; card.id='cc-'+i;
    const pcls=c.kans==='hoog'?'ph':c.kans==='med'?'pm':'pl';
    const ptxt=c.kans==='hoog'?'HOOG':c.kans==='med'?'MED':'LAAG';
    const prob=document.createElement('div'); prob.className='cause-prob '+pcls; prob.textContent=ptxt;
    const info=document.createElement('div'); info.style.flex='1';
    const ttl=document.createElement('div'); ttl.className='cause-ttl'; ttl.textContent=`${i+1}. ${c.naam}`;
    const freq=document.createElement('div'); freq.className='cause-freq';
    if(c.frequentie) freq.textContent='📊 '+c.frequentie;
    const body=document.createElement('div'); body.className='cause-body'; body.textContent=c.uitleg;
    const pids=document.createElement('div'); pids.className='cause-pids';
    (c.check_pids||[]).forEach(p=>{
      const d=window.discoveredPIDDefs?.find(x=>x.pid===p)||window.ALL_PID_DEFS?.[p];
      const hint=document.createElement('span'); hint.className='pid-hint'; hint.textContent=d?d.name:p;
      pids.appendChild(hint);
    });
    info.appendChild(ttl); if(c.frequentie) info.appendChild(freq);
    info.appendChild(body); info.appendChild(pids);
    card.appendChild(prob); card.appendChild(info);
    card.onclick=()=>verifyCause(i,c);
    grid.appendChild(card);
  });
  const hint=document.createElement('div');
  hint.style.cssText='font-size:10px;color:var(--tx3);padding:7px 10px;background:var(--bls);border-radius:7px;margin-top:6px';
  hint.textContent='👆 Klik op een oorzaak om live PID-data te meten';
  box.appendChild(hint);
}

async function verifyCause(idx,cause){
  document.querySelectorAll('.cause-card').forEach(c=>c.classList.remove('sel'));
  document.getElementById('cc-'+idx)?.classList.add('sel');
  window.selectedCause=cause;
  document.getElementById('dstep3').style.display='block';
  document.getElementById('dsn3').className='dsn active';
  document.getElementById('pidCheckBox').innerHTML='<div class="ai-ld"><div class="spin"></div> PIDs meten...</div>';
  document.getElementById('verdictBox').innerHTML='';
  document.getElementById('nextCauseBox').innerHTML='';

  const results=[];
  for(const pid of (cause.check_pids||[])){
    const def=window.discoveredPIDDefs?.find(p=>p.pid===pid)||window.ALL_PID_DEFS?.[pid]; if(!def) continue;
    let val=window.pidVals[pid];
    if(val===undefined) val=window.demoMode?demo(pid):parsePID(pid,await sendCmd('01'+pid.slice(2)));
    if(val!==null&&val!==undefined) updPID(pid,val);
    const exp=cause.check_waarden?.[pid];
    let color='unknown',verdict='';
    if(val!==null&&val!==undefined){
      if(exp){
        if(val>=exp.min&&val<=exp.max){color='bad';verdict=`⚠️ ${fv(val)} ${def.unit} — bevestigt diagnose`;}
        else{color='ok';verdict=`✅ ${fv(val)} ${def.unit} — normaal`;}
      } else {
        if((def.dH&&val>=def.dH)||(def.dL&&val<=def.dL)){color='bad';verdict=`🔴 ${fv(val)} ${def.unit} — kritiek`;}
        else if((def.wH&&val>=def.wH)||(def.wL&&val<=def.wL)){color='warn';verdict=`⚠️ ${fv(val)} ${def.unit} — afwijkend`;}
        else{color='ok';verdict=`✅ ${fv(val)} ${def.unit} — normaal`;}
      }
    } else { verdict='Geen data'; }
    results.push({pid,name:def.name,unit:def.unit,val,verdict,color,exp});
  }
  renderPIDCheck(results,cause);
  generateVerdict(results,cause,idx);
}

function renderPIDCheck(results,cause){
  const box=document.getElementById('pidCheckBox'); box.innerHTML='';
  if(cause.bewijs_logica){
    const l=document.createElement('div');
    l.style.cssText='font-size:10px;color:var(--tx2);padding:8px;background:var(--bls);border-radius:7px;margin-bottom:8px;line-height:1.5';
    const strong=document.createElement('strong'); strong.textContent='Bewijs logica: ';
    const txt=document.createTextNode(cause.bewijs_logica);
    l.appendChild(strong); l.appendChild(txt); box.appendChild(l);
  }
  if(!results.length){
    const d=document.createElement('div');
    d.style.cssText='font-size:11px;color:var(--tx3);padding:8px';
    d.textContent='Geen specifieke PIDs voor deze oorzaak.';
    box.appendChild(d); return;
  }
  results.forEach(r=>{
    const el=document.createElement('div'); el.className='pcr-item';
    el.style.borderLeft=`3px solid ${r.color==='ok'?'var(--gn)':r.color==='bad'?'var(--rd)':r.color==='warn'?'var(--or)':'var(--bd)'}`;
    const icon=document.createElement('div'); icon.className='pcr-icon';
    icon.textContent=r.color==='ok'?'✅':r.color==='bad'?'🔴':r.color==='warn'?'⚠️':'❓';
    const info=document.createElement('div'); info.style.flex='1';
    const nm=document.createElement('div'); nm.className='pcr-nm'; nm.textContent=r.name;
    const vd=document.createElement('div'); vd.className='pcr-val '+r.color; vd.textContent=r.verdict;
    info.appendChild(nm); info.appendChild(vd);
    el.appendChild(icon); el.appendChild(info); box.appendChild(el);
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
  if(bad>=Math.ceil(total*.6)){cls='confirmed';title='🔴 Diagnose bevestigd';body=`PID-data wijst op <strong>${cause.naam}</strong>.`;}
  else if(ok>=Math.ceil(total*.7)){cls='cleared';title='✅ Oorzaak uitgesloten';body=`Geen bewijs voor <strong>${cause.naam}</strong>. Probeer de volgende oorzaak.`;}
  else{cls='likely';title='⚠️ Gemengd bewijs';body=`Niet eenduidig voor <strong>${cause.naam}</strong>.`;}
  const vEl=document.createElement('div'); vEl.className='verdict-box '+cls;
  const vTitle=document.createElement('div'); vTitle.className='verdict-title'; vTitle.textContent=title;
  const vBody=document.createElement('div'); vBody.className='verdict-body'; vBody.innerHTML=body;
  const vBtn=document.createElement('button'); vBtn.className='btn pri';
  vBtn.style.marginTop='10px'; vBtn.textContent='🤖 Volledige AI analyse →';
  vBtn.onclick=()=>runDiagAI(cause.naam);
  vEl.appendChild(vTitle); vEl.appendChild(vBody); vEl.appendChild(vBtn);
  vbox.innerHTML=''; vbox.appendChild(vEl);
  log('Verdict: '+title,'info');
  renderNextCause(idx);
}

function renderNextCause(idx){
  const nb=document.getElementById('nextCauseBox'); nb.innerHTML='';
  const next=window.diagCauses[idx+1]; if(!next) return;
  const btn=document.createElement('button'); btn.className='next-cause-btn';
  btn.textContent=`→ Volgende: ${idx+2}. ${next.naam}`;
  btn.onclick=()=>verifyCause(idx+1,next); nb.appendChild(btn);
}

async function runDiagAI(causeName){
  const v=getVehicle();
  const desc=document.getElementById('diagDesc').value;
  const chips=[...document.querySelectorAll('#diagChips .chip.on')].map(c=>c.textContent).join(', ');
  const pdata=[...window.activePIDs].map(pid=>{
    const d=window.discoveredPIDDefs?.find(p=>p.pid===pid)||window.ALL_PID_DEFS?.[pid];
    return d&&window.pidVals[pid]!==undefined?`${d.name}: ${fv(window.pidVals[pid])} ${d.unit}`:null;
  }).filter(Boolean).join('\n');
  const prompt=`Voertuig: ${v.merk} ${v.model} ${v.year}\nProbleem: ${desc}\nSymptomen: ${chips}\nOorzaak: ${causeName}\nPID data:\n${pdata}\nDTC: ${(window.dtcCodes||[]).join(', ')||'geen'}\n\nGeef: SAMENVATTING, REPARATIE STAPPEN, KAN IK HET ZELF?, KOSTEN SCHATTING, URGENTIE`;
  const btn=document.getElementById('aiBtn'); if(btn) btn.disabled=true;
  await callAI(prompt,document.getElementById('aiContent'));
  if(btn) btn.disabled=false;
}

window.tc=tc;
window.findCauses=findCauses;
window.renderCauses=renderCauses;
window.verifyCause=verifyCause;
window.runDiagAI=runDiagAI;
