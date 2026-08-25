// ══════════════════════════════════════════════════════════════════
// pidlane-totalcheck.js
// Total Check
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// TOTAL CHECK
// ════════════════════════════════════════
function setQ(el,key,val){
  el.closest('.chk-opts').querySelectorAll('.chk-opt').forEach(o=>o.className='chk-opt');
  el.classList.add('sel-'+val); checkAnswers[key]=val;
}
// ── ONDERDELEN-KEUZE (modal) ────────────────────────────────────────
// Laat de gebruiker vóór een langdurige analyse kiezen: compleet (alles aan)
// of een selectie. Belooft de gekozen keys, of null bij annuleren.
// → CHK_CAT_META verplaatst naar pidlane-data.js
// → CHK_CAT_ORDER verplaatst naar pidlane-data.js
function catsFromItems(items){
  const cnt={}; items.forEach(i=>{ const c=i.cat||'Overig'; cnt[c]=(cnt[c]||0)+1; });
  return CHK_CAT_ORDER.filter(c=>cnt[c]).map(c=>{
    const m=CHK_CAT_META[c]||{l:c,i:'•'};
    return {key:c, label:m.l, icon:m.i, sub:cnt[c]+(cnt[c]===1?' item':' items')};
  });
}
function pickOnderdelen(title, options){
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:20px';
    const rows=options.map(o=>`
      <label style="display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--bd);border-radius:9px;margin-bottom:6px;cursor:pointer">
        <input type="checkbox" data-k="${o.key}" checked style="width:18px;height:18px;accent-color:var(--ac,#4a9eff)">
        <span style="font-size:18px;width:22px;text-align:center">${o.icon||'•'}</span>
        <span style="flex:1;font-size:14px;font-weight:600">${o.label}</span>
        ${o.sub?`<span style="font-size:12px;color:var(--tx3)">${o.sub}</span>`:''}
      </label>`).join('');
    ov.innerHTML=`<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:18px;max-width:360px;width:100%;max-height:86vh;overflow:auto">
      <div style="font-weight:800;font-size:15px;margin-bottom:4px">${title}</div>
      <div style="font-size:12px;color:var(--tx3);margin-bottom:12px">Laat alles aan voor een complete analyse, of kies zelf de onderdelen.</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button id="poAll" class="mbtn s" style="flex:1;font-size:12px;padding:6px">Alles aan</button>
        <button id="poNone" class="mbtn s" style="flex:1;font-size:12px;padding:6px">Alles uit</button>
      </div>
      <div id="poList">${rows}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="poCancel" class="mbtn s" style="flex:1">Annuleren</button>
        <button id="poRun" class="mbtn p" style="flex:2">▶ Uitvoeren</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const boxes=()=>[...ov.querySelectorAll('input[type=checkbox]')];
    const runBtn=ov.querySelector('#poRun');
    const sync=()=>{ const n=boxes().filter(b=>b.checked).length;
      runBtn.disabled=(n===0);
      runBtn.textContent = n===0?'Kies minstens 1' : (n===options.length?'▶ Compleet uitvoeren':`▶ Uitvoeren (${n})`);
    };
    boxes().forEach(b=>b.onchange=sync);
    ov.querySelector('#poAll').onclick=()=>{boxes().forEach(b=>b.checked=true);sync();};
    ov.querySelector('#poNone').onclick=()=>{boxes().forEach(b=>b.checked=false);sync();};
    const close=v=>{ ov.remove(); resolve(v); };
    ov.querySelector('#poCancel').onclick=()=>close(null);
    runBtn.onclick=()=>close(boxes().filter(b=>b.checked).map(b=>b.dataset.k));
    ov.onclick=e=>{ if(e.target===ov) close(null); };
    sync();
  });
}

async function runTotalCheck(){
  if(!(await plVraagMeting('rit','totaalcheck','totaal'))) return;
  window._didTotalCheck=true;
  if(!(await preAnalysisCheck())) return;
  await ensurePIDsActive('totaal');
  const btn=document.getElementById('btnChk'); btn.disabled=true;
  document.getElementById('chkSummary').style.display='none';
  document.getElementById('chkResults').innerHTML='<div class="ai-ld"><div class="spin"></div> Systemen controleren...</div>';
  await delay(demoMode?1000:1500);
  const allItems=buildCheckItems(); 
  // Onderdelen-keuze: compleet of een selectie van categorieën
  const cats=catsFromItems(allItems);
  document.getElementById('chkResults').innerHTML='';
  btn.disabled=false;
  let items=allItems;
  if(cats.length>1){
    const sel=await pickOnderdelen('Totaalcheck — welke onderdelen?', cats);
    if(sel===null) return;                         // geannuleerd
    if(sel.length && sel.length<cats.length) items=allItems.filter(i=>sel.includes(i.cat||'Overig'));
  }
  document.getElementById('chkResults').innerHTML='<div class="ai-ld"><div class="spin"></div> Resultaten opbouwen...</div>';
  await delay(demoMode?300:400);
  checkResults=items;
  renderCheckResults(items);
  runCheckAI(items);
}
function buildCheckItems(){
  const items=[];
  const pc=(pid,name,verplicht=false)=>{
    // Sla over als de auto dit PID niet ondersteunt of de waarde fysiek
    // onmogelijk is (nodata = niet aanwezig, onzin = meet-/parsefout).
    // Zo ziet de itemlijst exact dezelfde schone set als de AI-prompt.
    if(!verplicht){
      const health=_pidHealth[pid];
      if(health==='nodata'||health==='onzin') return null;
      if(!vehiclePlausiblePid(pid)) return null; // diesel/SCR-sensor op benzineauto
      if(!demoMode && typeof supportedPIDs!=='undefined' && supportedPIDs.size>0 && !supportedPIDs.has(pid)) return null;
    }
    const val=pidVals[pid]; const d=getPidDef(pid);
    if(val===undefined) return null;  // geen data = niet tonen
    let status='ok',detail='Normaal.';
    if(d){
      if((d.dH&&val>=d.dH)||(d.dL&&val<=d.dL)){status='bad';detail='Kritieke afwijking!';}
      else if((d.wH&&val>=d.wH)||(d.wL&&val<=d.wL)){status='warn';detail='Buiten aanbevolen bereik.';}
    }
    return {pid,name,display:`${fv(val)} ${d?.unit||''}`,status,detail,cat:(d&&d.cat)||'Overig'};
  };
  // Kern-PIDs — alleen als aanwezig op dit voertuig
  const kernPids=[
    ['0105','Koelwater temp'],['0142','Accuspanning'],['015C','Motorolie temp'],
    ['0106','Brandstoftrim kort'],['0107','Brandstoftrim lang'],
    ['0110','MAF luchtmassameter'],['012F','Brandstofpeil'],
    ['010C','Motortoerental'],['010D','Voertuigsnelheid'],
    ['0104','Motorbelasting'],['010B','Inlaatdruk'],['010F','Inlaatlucht temp'],
    ['013C','Uitlaatgas temp B1S1'],['0159','Raildruk (direct)'],
    ['016B','DPF delta druk'],['018E','NOx doseerpomp'],
    ['01A4','AdBlue injectiedruk'],['015B','HV accu SoC'],['0142','Accuspanning'],
  ];
  kernPids.forEach(([pid,name])=>{ const i=pc(pid,name); if(i) items.push(i); });
  // Vul aan met ELKE relevante gezonde sensor die de auto óók levert maar niet
  // in de kernlijst staat — zo wordt niets relevants overgeslagen, terwijl de
  // kernlijst de gegarandeerde basis blijft.
  const kernSet=new Set(kernPids.map(k=>k[0]));
  relevantSupportedPIDs('totaal').forEach(pid=>{
    if(kernSet.has(pid)) return;
    const d=getPidDef(pid); if(!d) return;
    const i=pc(pid,d.name||pid); if(i) items.push(i);
  });
  // DTC altijd
  items.push({name:'DTC Foutcodes',display:dtcCodes.length===0?'Geen codes':dtcCodes.join(', '),status:dtcCodes.length===0?'ok':dtcCodes.some(c=>dtcInfo(c)?.sev==='high')?'bad':'warn',detail:dtcCodes.length===0?'Geen actieve foutcodes.':dtcCodes.length+' code(s).',cat:'Foutcodes'});
  // Bestuurder-vragen
  const qa=[['start','Koude start',{nee:'bad',soms:'warn',ja:'ok'}],['oil','Olie niveau',{nee:'bad',soms:'warn',ja:'ok'}],['cool','Koelwater niveau',{nee:'bad',soms:'warn',ja:'ok'}],['noise','Geluidscheck',{nee:'warn',soms:'warn',ja:'ok'}],['warn','Dashboard lampen',{nee:'warn',soms:'warn',ja:'ok'}],['fuel','Brandstofverbruik',{nee:'warn',soms:'warn',ja:'ok'}]];
  qa.forEach(([key,name,smap])=>{const ans=checkAnswers[key];if(ans)items.push({name,display:ans==='ja'?'Normaal':ans==='soms'?'Soms probleem':'Probleem',status:smap[ans]||'ok',detail:'Door bestuurder gerapporteerd.',cat:'Bestuurder'});});
  return items;
}
function renderCheckResults(items){
  const sum=document.getElementById('chkSummary'); sum.style.display='grid';
  document.getElementById('csOk').textContent=items.filter(i=>i.status==='ok').length;
  document.getElementById('csWarn').textContent=items.filter(i=>i.status==='warn').length;
  document.getElementById('csBad').textContent=items.filter(i=>i.status==='bad').length;
  const res=document.getElementById('chkResults'); res.innerHTML='';
  const sev={bad:0,warn:1,ok:2};
  const renderItem=item=>{
    const el=document.createElement('div'); el.className='chk-item';
    const bt=item.status==='ok'?'✅ Goed':item.status==='warn'?'⚠️ Let op':'🔴 Probleem';
    // Betrouwbaarheidslabel: alleen tonen bij afwijkende items met twijfel/onzin
    let qLabel='';
    if(item.status!=='ok' && item.pid && typeof pidVals!=='undefined' && pidVals[item.pid]!==undefined){
      const q=assessPidQuality(item.pid, pidVals[item.pid]);
      if(q.status==='onzin') qLabel='<div style="font-size:11px;color:var(--rd);margin-top:2px">⚠ Mogelijk meetfout — niet betrouwbaar, controleer sensor/verbinding</div>';
      else if(q.status==='twijfel') qLabel='<div style="font-size:11px;color:var(--or);margin-top:2px">⚠ Verifieer eerst — kan meetonzekerheid zijn</div>';
    }
    el.innerHTML=`<div class="chk-dot ${item.status}"></div><div style="flex:1"><div class="chk-name">${item.name}</div><div class="chk-val">${item.display} — ${item.detail}</div>${qLabel}</div><div class="chk-bdg ${item.status}">${bt}</div>`;
    res.appendChild(el);
  };
  // Groepeer per categorie (vaste volgorde), met een kop per groep.
  CHK_CAT_ORDER.forEach(cat=>{
    const grp=items.filter(i=>(i.cat||'Overig')===cat);
    if(!grp.length) return;
    const m=CHK_CAT_META[cat]||{l:cat,i:'•'};
    const bad=grp.filter(i=>i.status==='bad').length, warn=grp.filter(i=>i.status==='warn').length;
    const badge=bad?`<span style="color:var(--rd)">${bad} probleem</span>`:warn?`<span style="color:var(--or)">${warn} let op</span>`:`<span style="color:var(--gr,#3fbf6f)">ok</span>`;
    const hd=document.createElement('div');
    hd.style.cssText='display:flex;align-items:center;gap:8px;margin:14px 0 6px;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--tx3)';
    hd.innerHTML=`<span style="font-size:14px">${m.i}</span><span style="flex:1">${m.l}</span><span style="font-size:12px;font-weight:600;text-transform:none">${badge}</span>`;
    res.appendChild(hd);
    grp.sort((a,b)=>sev[a.status]-sev[b.status]).forEach(renderItem);
  });
}
async function runCheckAI(items){
  activateAIPane();
  const btn=document.getElementById('aiBtn'); btn.disabled=true;
  const v=getVehicle();
  const probItems=items.filter(i=>i.status!=='ok');
  const prob=probItems.map(i=>`• ${i.name}: ${i.display} — ${i.detail}`).join('\n');
  // FIX 09-07: stuur ALLE gemeten waarden mee, niet alleen afwijkingen. Op een
  // gezonde auto was prob leeg → de AI kreeg nul sensordata en schreef terecht
  // "geen beschikking over sensoren", terwijl de tegels wél waarden toonden.
  const meet=items.filter(i=>i.pid).slice(0,40).map(i=>`• ${i.name}: ${i.display}${i.status!=='ok'?'  ⚠ '+i.detail:''}`).join('\n');
  const pairs=items.filter(i=>i.pid).map(i=>[i.pid, (typeof pidVals!=='undefined'?pidVals[i.pid]:undefined)]);
  const q=buildQualityReport(pairs);
  // Als een test-scenario actief is: laat de AI weten dat deze data handmatig
  // is gezet (testdoeleinden), zodat het oordeel daar rekening mee houdt.
  let scenNote='';
  if(_scenario.enabled){
    const mp=Object.keys(_scenario.pids);
    scenNote=`\n\nLET OP — TESTSCENARIO: de volgende waarden zijn HANDMATIG ingesteld voor testdoeleinden (geen echte meting): `+
      (mp.length?mp.map(p=>(getPidDef(p)?.name||p)).join(', '):'(geen PIDs)')+
      (_scenario.dtcs.length?`; handmatige DTC's: ${_scenario.dtcs.join(', ')}`:'')+
      `. Beoordeel ze normaal, maar weet dat dit een simulatie is.`;
  }
  // Brandstof-specifieke instructie zodat het rapport geen onzin vertelt
  // (bv. brandstoftrim of verbruik op een elektrische auto).
  const ft=vehicleFuelType();
  let fuelNote='';
  if(ft==='elektrisch'){
    fuelNote=`\nDit is een VOLLEDIG ELEKTRISCH voertuig: er is GEEN verbrandingsmotor, GEEN brandstof, GEEN brandstoftrim, lambda/O2, MAF, EGR of uitlaatsysteem. Noem die zaken niet en geef geen brandstof- of verbruiksadvies in liters. Richt je op accu, laden, elektrische aandrijving en algemene staat.`;
  } else if(ft==='diesel'){
    fuelNote=`\nDit is een DIESEL: brandstoftrim-logica wijkt af; let op roetfilter (DPF), AdBlue/SCR en NOx waar relevant.`;
  }
  const prompt=`Je bent expert automonteur. Analyseer deze totaalcheck in het Nederlands.\n\nVoertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.brandstof?'('+v.brandstof+')':''}${fuelNote}\nAlleen sensoren die aanwezig zijn op dit voertuig zijn meegenomen. Beoordeel uitsluitend op basis van de meegeleverde data — maak geen aannames over turbo, diesel, AdBlue of hybride als dat niet blijkt uit het voertuig of de data.\nGemeten sensordata (${items.length} sensoren):\n${meet||'(geen meetdata — sensoren leverden nog geen waarden; zeg dit eerlijk in het rapport)'}\nAfwijkingen:\n${prob||'Geen'}\nDTC: ${formatDtcCodes(dtcCodes)}${q.promptBlok}${scenNote}\n\nGeef: Structureer je antwoord EXACT in onderstaande volgorde. Gebruik nergens sterretjes, emoji of woorden in hoofdletters in de lopende tekst; zet elke sectienaam op een eigen regel.

Voertuigscore: <0-100>/100
Diagnosebetrouwbaarheid: <0-100>%
Actieve storingen: <aantal>
Aandachtspunten: <aantal>

Systeemgezondheid:
Motor: <0-100>
Brandstofsysteem: <0-100>
Ontsteking: <0-100>
Emissies: <0-100>
Koeling: <0-100>
Elektrisch systeem: <0-100>
Transmissie: <0-100>

VOERTUIGGEGEVENS
Merk, model, bouwjaar, brandstof en motor — kort.

SYSTEEMSTATUS
Een of twee regels over de algehele staat op dit moment.

FOUTCODES
De actieve DTC-codes met korte uitleg, of: Geen actieve foutcodes.

SENSORANALYSE
Een tabel met exact deze kolommen: Sensor | Waarde | Referentie | Status. Status is precies een van: Normaal, Controle aanbevolen, Direct aandacht. Neem alleen sensoren op waarvoor meetdata beschikbaar is.

BEVINDINGEN
Korte, feitelijke punten; koppel elk punt aan een gemeten waarde.

WAARSCHIJNLIJKE OORZAAK
Een tabel met kolommen: Diagnose | Kans | Vertrouwen. Kans is Hoog, Gemiddeld of Laag; Vertrouwen is een percentage. Daarna een korte alinea van maximaal vier zinnen met de meest waarschijnlijke oorzaak en of er aanwijzingen voor ernstige schade zijn.

KOSTENINDICATIE
Een tabel met kolommen: Handeling | Kans | Indicatie. Indicatie is een prijsbereik in euro.

AANBEVOLEN VERVOLGONDERZOEK
Een korte lijst met concrete meet- of controlestappen om de diagnose te bevestigen..\nSluit af met deze exacte zin op een nieuwe regel: ${RAPPORT_DISCLAIMER}`;
  await callAI(prompt,document.getElementById('aiContent'));
  btn.disabled=false;
}
function exportCheckReport(){
  const v=getVehicle();
  const lines=[`PidLane — Totaalcheck`,`Datum: ${new Date().toLocaleString('nl')}`,v.merk?`Voertuig: ${v.merk} ${v.model} ${v.year}`:'',''];
  checkResults.forEach(i=>lines.push(`[${i.status.toUpperCase()}] ${i.name}: ${i.display}\n  ${i.detail}\n`));
  download('totaalcheck.txt',lines.join('\n'));
}

/* ══════════════════════════════════════════════════════════════════════════
   BASIC SYSTEM CHECK (deur 1) — 09-07-2026
   Reeks korte autotechniek-tests. Per test:
     • X-as = tijd, Y-as = relevante PID
     • Verwachte trend/band = referentielijn (grijs vlak)
     • Werkelijke waarde = live OBD-lijn (cyaan)
     • Slaagt de live-waarde X sec binnen de band → groen vinkje → volgende test
   Automatische PID-selectie: catalogus wordt gefilterd op motortype
   (universeel + benzine/diesel/hybride) én op wat de auto ondersteunt
   (supportedPIDs); ensurePIDListActive zet precies die PIDs aan.
   ══════════════════════════════════════════════════════════════════════════ */

// Elke test: {id, groep, naam, pids:[hoofd-PID...], uitleg, band:{lo,hi} of fn,
//   hold: seconden binnen band om te slagen, min? (min. sec meten)}
// band kan statisch zijn {lo,hi} of dynamisch via fn(vals,hist)->{lo,hi,ref?}.
// → BSC_TESTS verplaatst naar pidlane-data.js

// Baseline = mediaan van laatste n sec metingen (voor stabiliteitsbanden)
function bscBaseline(hist, sec){
  if(!Array.isArray(hist)||!hist.length) return null;
  const t0=Date.now()-sec*1000;
  const vals=hist.filter(x=>x.t>=t0).map(x=>x.v).sort((a,b)=>a-b);
  if(vals.length<3) return null;
  return vals[Math.floor(vals.length/2)];
}

let _bscState=null; // {list, idx, results:[], testT0, holdStart, raf}

// ── Voorwaarde per test (eis): klopt de context niet, dan stapt de check door
// naar de volgende test met status "n.v.t." i.p.v. 30s wachten op "twijfel".
// eis: {fase:['constant',...], warm:true, motorDraait:true, minSnelheid:40}
function bscConditie(t){
  if(!t.eis) return {ok:true, label:''};
  const st=(window.PLMon&&window.PLMon._state)?window.PLMon._state():{fase:'onbekend',temp:'onbekend'};
  const rpm=pidVals['010C'], spd=pidVals['010D'];
  const mis=[];
  if(t.eis.fase && !t.eis.fase.includes(st.fase)) mis.push(t.eis.fase.join('/'));
  if(t.eis.warm && st.temp!=='warm') mis.push('motor bedrijfswarm');
  if(t.eis.motorDraait && !(typeof rpm==='number'&&rpm>400)) mis.push('motor draaiend');
  // Rustspanning meten kan alleen met de motor uit; contact moet wél aan staan,
  // anders krijgen we sowieso geen data terug van de ECU.
  if(t.eis.motorUit && !(typeof rpm==='number'&&rpm<200)) mis.push('motor uit (contact aan)');
  if(t.eis.minSnelheid && !(typeof spd==='number'&&spd>=t.eis.minSnelheid)) mis.push('≥'+t.eis.minSnelheid+' km/u');
  return mis.length? {ok:false, label:mis.join(' + ')} : {ok:true, label:''};
}

// ── Uitbreiding van de catalogus: rijdende + voorwaardelijke tests.
// Toegevoegd vanuit index (BSC_TESTS zelf staat in pidlane-data.js);
// dubbel-id-guard zodat een latere verhuizing naar data.js niets breekt.
(function(){
  if(typeof BSC_TESTS==='undefined'||!Array.isArray(BSC_TESTS)) return;
  const extra=[
    {id:'x_rpm_const', groep:'universeel', naam:'Toerental stabiel bij constante snelheid',
     pids:['010C'], hold:5, eis:{fase:['constant'], minSnelheid:40}, eisWachtMs:15000,
     uitleg:'Bij constante snelheid hoort het toerental vlak te blijven. Schommelingen wijzen op overslaan of een slippende koppeling/omvormer.',
     band:(vals,hist)=>{ const m=bscBaseline(hist['010C'],5); return m==null?null:{lo:m-75,hi:m+75}; }},
    {id:'x_accel_load', groep:'universeel', naam:'Belasting reageert op gas geven',
     pids:['0104'], hold:2, eis:{fase:['accelereren']}, eisWachtMs:15000,
     uitleg:'Tijdens accelereren hoort de motorbelasting duidelijk op te lopen. Blijft die laag, dan leest MAF/MAP mogelijk te laag.',
     band:{lo:35,hi:100}},
    {id:'x_decel_load', groep:'universeel', naam:'Belasting valt weg bij uitrollen/remmen',
     pids:['0104'], hold:2, eis:{fase:['remmen']}, eisWachtMs:15000,
     uitleg:'Bij gas los/remmen hoort de belasting laag te zijn (brandstof-cut). Hoge belasting hier is verdacht.',
     band:{lo:0,hi:25}},
    {id:'x_laadspanning', groep:'universeel', naam:'Laadspanning bij draaiende motor',
     pids:['0142'], hold:4, eis:{motorDraait:true},
     uitleg:'Met draaiende motor hoort de dynamo 13,2\u201315,2 V te leveren. Daaronder: dynamo/riem/massa. Daarboven: spanningsregelaar.',
     band:{lo:13.2,hi:15.2}},
    {id:'x_map_stat', groep:'benzine', naam:'Vacu\u00fcm stationair (inlaatdruk)',
     pids:['010B'], hold:4, eis:{fase:['stationair'], warm:true},
     uitleg:'Een warme benzinemotor trekt stationair 20\u201345 kPa. Hogere inlaatdruk wijst op valse lucht of lage compressie.',
     band:{lo:18,hi:46}}
  ];
  for(const n of extra){ if(!BSC_TESTS.some(x=>x.id===n.id)) BSC_TESTS.push(n); }
})();

/* ── 🛡️ RIT-MONITOR dashboard: 1s-verversing zolang de pane zichtbaar is ── */
// Opener volgens het activateAIPane-patroon: welkomstscherm dicht, alle
// tabs/panes uit, alleen pane-monitor aan.
// Verbergt de uitleg boven de rit-monitor 10 s nadat de pane opent. Bewust
// geen localStorage: bij een volgende sessie mag je hem best nog eens lezen.
let _monIntroT=0;
function _monIntroStart(){
  const el=document.getElementById('monIntroTxt'); if(!el) return;
  el.classList.remove('weg');
  clearTimeout(_monIntroT);
  _monIntroT=setTimeout(()=>{ try{ el.classList.add('weg'); }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ } }, 10000);
}
function openMonitorView(){
  try{ document.getElementById('welcomeScreen').classList.add('hidden'); }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
  const pane=document.getElementById('pane-monitor'); if(pane) pane.classList.add('active');
  const tb=document.querySelector('.tb'); if(tb) tb.scrollTop=0;
  if(typeof setLeftPanelForMode==='function') setLeftPanelForMode('monitor');
  // PID-lade hoort niet op de monitor: setLeftPanelForMode (externe module)
  // is ouder dan deze pane en kent de modus 'monitor' niet — dus zelf hard
  // sluiten, plus twee nakomertjes voor alles wat 'm async weer opent.
  _monSluitPidLade();
  setTimeout(_monSluitPidLade,350); setTimeout(_monSluitPidLade,1200);
  _monDemoChip=false;               // demo-testchipje weg zodra de pane open is
  try{ _monTick(); }catch(e){ console.warn('_monTick mislukt:', e); }      // meteen vullen, niet wachten op de 1s-tik
  try{ _monChipTick(); }catch(e){ console.warn('_monChipTick mislukt:', e); }  // chipje direct weg zodra de pane open is
  try{ _monIntroStart(); }catch(e){ console.warn('_monIntroStart mislukt:', e); }
}
// ── PID-lade-bewaking op de monitor ─────────────────────────────
// Staat het sensorenpaneel (#slPanel: zijbalk op desktop, sheet op mobiel)
// zichtbaar in beeld? Geometrie-check, want de open/dicht-klasse van de
// lade leeft in de externe module/pidlane.css.
function _monPidLadeOpen(){
  const sl=document.getElementById('slPanel'); if(!sl) return false;
  const cs=getComputedStyle(sl);
  if(cs.display==='none'||cs.visibility==='hidden') return false;
  const r=sl.getBoundingClientRect();
  return r.width>80 && r.height>80 && r.bottom>0 && r.top<(window.innerHeight-24);
}
// Sluit lade + zijbalk. Uitzondering: opende de gebruiker hem net zélf via
// 🎛️ PID-keuze, dan 2 minuten met rust laten.
function _monSluitPidLade(){
  try{
    if(Date.now()-(window._pidLadeUserTs||0)<120000) return;
    if(typeof closeLades==='function') closeLades();
    slCollapsed=true;
    const g=document.getElementById('appGrid'); if(g) g.classList.add('sl-col');
    if(typeof updateSLToggleIcon==='function') updateSLToggleIcon();
    if(typeof clearSLAutoHide==='function') clearSLAutoHide();
    try{ localStorage.setItem('ns_sl','true'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  }catch(e){ console.warn('clearSLAutoHide mislukt:', e); }
}
// Is de monitor-pane wat de gebruiker NU ziet? Let op: goHome() legt het
// welkomstscherm als overlay BOVENOP — de pane houdt dan gewoon z'n
// offsetParent, dus die check alleen is niet genoeg.
function _monPaneZichtbaar(){
  const pane=document.getElementById('pane-monitor');
  if(!pane||!pane.classList.contains('active')||!pane.offsetParent) return false;
  const ws=document.getElementById('welcomeScreen');
  if(ws&&!ws.classList.contains('hidden')) return false;   // home-overlay erboven
  return true;
}
// ➖ op de pane: terug naar home; monitor waakt door, chipje neemt het over.
// In demo slaapt PLMon — dan tonen we het chipje tóch (testbaar zonder rit);
// vlag gaat weer uit zodra de pane opnieuw opent.
let _monDemoChip=false;
function monMinimize(){
  if(typeof demoMode!=='undefined'&&demoMode) _monDemoChip=true;
  try{ goHome(); }catch(e){ console.warn('goHome mislukt:', e); }
  try{ _monChipTick(); }catch(e){ console.warn('_monChipTick mislukt:', e); }
}
const _MON_ERNSTIG=/^(ECT_HOOG|PIEK:|UITVAL:|THERMOSTAAT|TEST:x_laadspanning)/;

/* ── Zuinig rijden (26-07-2026) ────────────────────────────────────────
   Twee soorten advies onder elkaar. Boven een LIVE regel die op de echte
   meetwaarden van dít moment slaat; daaronder een algemene tip die elke
   14 seconden doorrouleert.

   Over de schakelmomenten: een tabel met fabrieksschakelpunten per model
   heb ik niet, en die ga ik ook niet verzinnen. De grenzen hieronder komen
   uit het brandstoftype — het verschil tussen benzine en diesel is groot en
   wél hard te bepalen (PID 0151, anders het voertuigdossier). Het advies
   zelf is verder volledig op deze auto gebaseerd: het kijkt naar het echte
   toerental, de echte belasting en de echte gaspedaalstand. */
function _monBenzine(){
  try{
    const f=pidVals['0151'];
    if(typeof f==='number') return !(f===4||f===5);       // 4/5 = diesel volgens J1979
    const b=String((vehicleInfo&&(vehicleInfo.brandstof||vehicleInfo.fuel))||'').toLowerCase();
    if(/diesel|tdi|hdi|dci|cdi|crdi/.test(b)) return false;
  }catch(e){ /* stil: pidVals/vehicleInfo kunnen nog ontbreken vóór de eerste meting */ }
  return true;                                            // bij twijfel benzinegrenzen
}
const _MON_TIPS=[
  '🛞 Rol uit met de auto in de versnelling. Zolang je de koppeling niet indrukt en het gas los is, spuit de ECU niets in — je rijdt dan letterlijk op nul. In z\'n vrij of ontkoppeld draait de motor stationair door en kost dat wél brandstof.',
  '👀 Kijk ver vooruit. Elke keer dat je moet remmen, gooi je snelheid weg waar je brandstof voor betaald hebt. Vroeg gas los kost niets, hard remmen kost alles.',
  '🌬️ Boven ongeveer 80 km/u kost een open raam meer dan de airco. Daaronder is het andersom.',
  '🧳 Dakdrager of fietsendrager eraf als je hem niet gebruikt. Leeg scheelt dat al snel een halve liter per 100 km op snelweg.',
  '🛞 Controleer je bandenspanning maandelijks. Een halve bar te laag kost enkele procenten verbruik en gaat ten koste van je banden.',
  '🐢 Snelheid weegt kwadratisch mee in luchtweerstand. 110 in plaats van 130 rijden scheelt op een lange rit meer dan welke rijstijltruc dan ook.',
  '❄️ Korte ritten met een koude motor zijn veruit het duurst per kilometer. Combineer boodschappen in één rit in plaats van drie losse.',
  '⏱️ Sta je langer dan een halve minuut stil? Motor uit. Opnieuw starten kost minder dan stationair blijven draaien.'
];
let _monTipIdx=0, _monTipT=0;
function _monZuinigTip(spd,rpm,thr,load){
  const live=document.getElementById('monTipLive'), alg=document.getElementById('monTipAlg');
  if(!live||!alg) return;
  // Algemene tip rouleert
  const nu=Date.now();
  if(!_monTipT||nu-_monTipT>14000){ _monTipT=nu; alg.textContent=_MON_TIPS[_monTipIdx%_MON_TIPS.length]; _monTipIdx++; }
  // Live advies
  const benz=_monBenzine();
  const opschakel = benz?2300:1900, terugschakel = benz?1300:1150, stationair = benz?900:800;
  let t='⛽ Zuinig rijden — advies verschijnt zodra je rijdt.', kleur='';
  if(typeof rpm==='number'&&typeof spd==='number'){
    const gasLos = (typeof thr==='number') ? thr<=12 : (typeof load==='number'&&load<20);
    if(spd>20&&gasLos&&rpm>stationair+250){
      t='🛞 Je rolt nu uit mét gas los en in de versnelling — op dit moment gaat er geen druppel in. Laat de koppeling omhoog zolang je nog vaart hebt.'; kleur='goed';
    } else if(spd>15&&rpm>opschakel&&(typeof load!=='number'||load<65)){
      t='⬆️ '+Math.round(rpm)+' toeren bij deze belasting — een versnelling hoger kan. '+(benz?'Benzine':'Diesel')+' loopt het zuinigst rond '+(benz?'1800-2200':'1400-1800')+' toeren.'; kleur='let';
    } else if(spd>25&&rpm<terugschakel&&typeof load==='number'&&load>70){
      t='⬇️ Laag toerental met veel gas belast de motor zwaar en levert nauwelijks zuinigheid op. Schakel hier een versnelling terug.'; kleur='let';
    } else if(spd>0&&rpm>stationair){
      t='✅ Toerental en belasting zitten in een zuinig gebied. Zo doorrijden.'; kleur='goed';
    } else if(spd<=0&&rpm>stationair-150){
      t='⏱️ Stilstaand met draaiende motor. Duurt het langer dan een halve minuut, dan is de motor uitzetten goedkoper dan stationair draaien.'; kleur='let';
    }
  }
  live.textContent=t;
  live.className='mon-tip-live'+(kleur?' '+kleur:'');
}
let _monLaatstGetekend='';
function _monTegel(id, v, warnCls){
  const t=document.getElementById('monT_'+id), e=document.getElementById('monV_'+id);
  if(!t||!e) return;
  e.textContent=(v===undefined||v===null||isNaN(v))?'—':(typeof fv==='function'?fv(v):v);
  t.className='mon-tile'+(warnCls?' '+warnCls:'');
}
function _monTick(){
  if(!_monPaneZichtbaar()) return;                      // pane niet in beeld: niks doen
  if(_monPidLadeOpen()) _monSluitPidLade();             // lade sluipt terug? dicht ermee
  const M=window.PLMon;
  const spd=pidVals['010D'], rpm=pidVals['010C'], ect=pidVals['0105'];
  const load=pidVals['0104'], volt=pidVals['0142'], map=pidVals['010B'];
  const st6=pidVals['0106'], lt7=pidVals['0107'];
  const trim=(typeof st6==='number'&&typeof lt7==='number')?Math.round((st6+lt7)*10)/10:undefined;
  // Tegels + kleuring op basis van dezelfde grenzen als de watchers
  _monTegel('spd',spd); _monTegel('rpm',rpm!==undefined?Math.round(rpm):undefined);
  _monTegel('ect',ect, (typeof ect==='number'&&ect>108)?'alarm':(typeof ect==='number'&&ect>100)?'warn':'');
  _monTegel('load',load);
  _monTegel('volt',volt, (typeof volt==='number'&&typeof rpm==='number'&&rpm>500&&(volt<13.2||volt>15.2))?'warn':'');
  _monTegel('trim',trim, (typeof trim==='number'&&Math.abs(trim)>20&&typeof ect==='number'&&ect>=65)?'warn':'');
  _monTegel('map',map);
  // ── Extra meetwaarden ──
  const iat=pidVals['010F'], thr=pidVals['0111'], adv=pidVals['010E'], maf=pidVals['0110'];
  _monTegel('iat',iat);
  _monTegel('thr',thr);
  _monTegel('adv',adv);
  // Momentaan verbruik uit massaluchtstroom. Boven 5 km/u in L/100 km, daaronder
  // (stilstaand, stationair) in L/uur — anders deel je door bijna nul.
  let lph, lphU='L/100';
  if(typeof maf==='number'&&maf>0){
    const afr=_monBenzine()?14.7:14.5, dich=_monBenzine()?745:835;   // g/L
    const lu=(maf/afr)*3600/dich;                                    // liter per uur
    if(typeof spd==='number'&&spd>5){ lph=Math.round(lu/spd*100*10)/10; }
    else { lph=Math.round(lu*10)/10; lphU='L/uur'; }
  }
  _monTegel('lph',lph);
  const uEl=document.getElementById('monU_lph'); if(uEl) uEl.textContent=lphU;
  _monZuinigTip(spd,rpm,thr,load);
  // Statusbalk
  const sEl=document.getElementById('monStatus'), tEl=document.getElementById('monStatusTxt');
  const actief=!!(M&&M.active);
  sEl.classList.toggle('slaap',!actief);
  const chips=['monChipFase','monChipTemp','monChipTijd'].map(i=>document.getElementById(i));
  if(actief){
    const st=M._state?M._state():{fase:'onbekend',temp:'onbekend'};
    const n=M._order.length;
    tEl.textContent=n?('Monitor waakt — '+n+' bevinding'+(n===1?'':'en')):'Monitor waakt — alles rustig';
    chips[0].textContent='🚗 '+st.fase; chips[1].textContent='🌡️ motor '+st.temp;
    chips[2].textContent='⏱ '+Math.max(0,Math.round((Date.now()-(M.startedAt||Date.now()))/60000))+' min mee';
    chips.forEach(c=>c.style.display='');
  } else {
    tEl.textContent=demoMode?'Monitor slaapt — demo-modus (alleen echte ritten)':'Monitor slaapt — verbind met de auto';
    chips.forEach(c=>c.style.display='none');
  }
  // Waarschuwingsfeed alleen hertekenen als er iets veranderde
  const lijst=document.getElementById('monWarnLijst');
  const events=(M&&M.events)||{}; const orde=(M&&M._order)||[];
  const vinger=orde.map(k=>k+':'+events[k].count+':'+(events[k].verif?events[k].verif.status:'')).join('|');
  if(vinger===_monLaatstGetekend) return;
  _monLaatstGetekend=vinger;
  if(!orde.length) return;                              // lege-staat blijft staan
  const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  lijst.innerHTML=[...orde].reverse().map(sig=>{
    const e=events[sig];
    const ernstig=_MON_ERNSTIG.test(sig);
    const fasen=Object.entries(e.fasen||{}).map(([k,n])=>k+'×'+n).join(', ');
    const redenen=(e.redenen||[]).slice(-2).map(esc).join('<br>');
    let verif='';
    if(e.verif){
      const cls=e.verif.status==='bevestigd'?'bev':e.verif.status==='meetprobleem'?'meet':'niet';
      const ic=e.verif.status==='bevestigd'?'❗':e.verif.status==='meetprobleem'?'⚠️':'✅';
      verif='<span class="mon-verif '+cls+'">'+ic+' '+esc(e.verif.status)+'</span>';
    } else if(ernstig&&connected&&!demoMode&&window.PLVerify){
      verif='<button class="btn" style="padding:3px 9px;font-size:11px" onclick="plRunVerify(this,{sig:\''+esc(sig)+'\',titel:\''+esc(e.code)+'\'})">🔍 Verifieer</button>';
    }
    return '<div class="mon-ev'+(ernstig?' ernstig':'')+'">'
      +'<div class="mon-ev-kop"><span>'+(ernstig?'🔴':'🟠')+' '+esc(e.code)+'</span><span style="opacity:.6;font-weight:700">'+e.count+'×</span>'+verif+'</div>'
      +'<div class="mon-ev-body">'+redenen+(e.verif?'<br><i>'+esc(e.verif.tekst)+'</i>':'')+'</div>'
      +'<div class="mon-ev-meta">rij-situatie: '+esc(fasen||'onbekend')+' · laatst: '+new Date(e.laatste).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})+'</div>'
      +'</div>';
  }).join('');
}
/* ── 🛡️ Zwevend monitor-chipje: zichtbaar zodra de monitor waakt terwijl de
   pane niet in beeld is. Toont snelheid + waarschuwingsteller; rand/teller
   kleuren oranje bij bevindingen en rood bij een ernstige. Tik = pane open.
   Via JS aan document.body gehangen (buiten #appScale, dus position:fixed
   blijft echt viewport-vast, net als de toast). ── */
let _monChipEl=null;
function _monChipMaak(){
  if(_monChipEl) return _monChipEl;
  const c=document.createElement('div');
  c.id='monChipFab';
  /* Geen eigen bottom/right/z-index meer: de chip hangt in #fabLane (zie
     pidlane.css), die de stapeling rechtsonder regelt. Zo botst hij niet meer
     met #remDrivePill wanneer de monitor geminimaliseerd is tijdens een
     expert-sessie. */
  c.style.cssText='display:none;align-items:center;gap:7px;background:var(--sur,#151b24);border:1.5px solid var(--bd,#26303b);color:var(--tx,#e6e9ef);border-radius:22px;padding:7px 13px;font-family:var(--f);font-size:13px;font-weight:800;box-shadow:0 6px 18px rgba(0,0,0,.45);cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent';
  c.innerHTML='<span>🛡️</span><span id="monChipSpd">— km/u</span><span id="monChipCnt" style="display:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--or,#f2820c);color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center"></span>';
  c.title='Rit-monitor openen';
  c.onclick=()=>{ try{ openMonitorView(); }catch(e){ console.warn('openMonitorView mislukt:', e); } };
  const lane=document.getElementById('fabLane');
  if(lane){ lane.appendChild(c); }
  else{
    // Baan nog niet geparsed (praktisch onmogelijk: _monChipTick draait pas na
    // een timer of gebruikersactie). Dan positioneert de chip zichzelf, zodat
    // hij nooit als los blok in de body-flow belandt.
    c.style.position='fixed'; c.style.right='12px'; c.style.bottom='14px'; c.style.zIndex='9600';
    document.body.appendChild(c);
  }
  _monChipEl=c;
  return c;
}
function _monChipTick(){
  const M=window.PLMon;
  const toon=(!!(M&&M.active)||((typeof demoMode!=='undefined')&&demoMode&&_monDemoChip))&&!_monPaneZichtbaar();
  const c=_monChipEl||(toon?_monChipMaak():null);
  if(!c) return;                                        // nog nooit nodig geweest
  c.style.display=toon?'flex':'none';
  if(!toon) return;
  const spd=pidVals['010D'];
  const s=document.getElementById('monChipSpd');
  if(s) s.textContent=(typeof spd==='number'&&!isNaN(spd))?Math.round(spd)+' km/u':'— km/u';
  const orde=(M&&M._order)||[];
  const n=orde.length;
  const ernstig=orde.some(k=>_MON_ERNSTIG.test(k));
  const kleur=n?(ernstig?'var(--rd,#e5484d)':'var(--or,#f2820c)'):'var(--bd,#26303b)';
  const b=document.getElementById('monChipCnt');
  if(b){ b.style.display=n?'':'none'; b.textContent=n; b.style.background=n?kleur:''; }
  c.style.borderColor=kleur;
}
// Chip élke seconde verversen (ook buiten de pane); pane alleen indien zichtbaar
// — die guard zit in _monTick zelf.
setInterval(()=>{ try{ _monChipTick(); }catch(e){ console.warn('_monChipTick mislukt:', e); } try{ _monTick(); }catch(e){ console.warn('_monTick mislukt:', e); } },1000);

// Filter de catalogus op motortype + welke PIDs de auto levert.
function bscBuildList(){
  const et=(typeof detectEngineType==='function')?detectEngineType():'benzine';
  const groepen=new Set(['universeel', et]); // ev valt terug op universeel
  // 27-07-2026 — hier zat de oorzaak van "⏳ Wachten op sensordata…" dat nooit
  // afliep. De laatste voorwaarde (|| !!getPidDef(pid)) maakte deze controle
  // waardeloos: élk PID dat in ALL_PID_DEFS staat gaf `true`, ook als de auto
  // hem aantoonbaar niet levert. Op een Mazda CX-5 2018 werd zo de test op
  // PID 0114 gekozen terwijl die ECU alleen 0134 (breedband) en 0115 (achterste
  // sensor) ondersteunt — de test wachtte dus eeuwig op data die nooit kwam.
  // De definitie-terugval geldt nu alleen nog als we ECHT geen scanresultaat
  // hebben; met een gescande PID-lijst is die lijst leidend.
  const heeftScan = (typeof supportedPIDs!=='undefined') && supportedPIDs && supportedPIDs.size>0;
  const heeft = pid => demoMode || !heeftScan || supportedPIDs.has(pid);
  const list=[];
  for(const t of BSC_TESTS){
    if(!groepen.has(t.groep)) continue;
    // Kies de eerste ondersteunde PID uit t.pids als hoofdmeter; test vervalt
    // als de auto geen enkele bijbehorende PID levert.
    const bruik=t.pids.filter(heeft);
    if(!bruik.length){ continue; }
    list.push({...t, pid:bruik[0], usePids:bruik});
  }
  return list;
}

async function startBasicCheck(){
  if(!(await preAnalysisCheck())) return;
  const list=bscBuildList();
  if(!list.length){ bscRender(`<div class="bsc-empty">Geen geschikte sensoren gevonden voor deze auto. Verbind en voer eerst een PID-scan uit.</div>`); return; }
  // Automatische PID-selectie: alle hoofd- en hulp-PIDs van de reeks aanzetten.
  const allPids=[...new Set(list.flatMap(t=>t.usePids))];
  try{ await ensurePIDListActive(allPids); }catch(e){ console.warn('ensurePIDListActive mislukt:', e); }
  _bscState={list, idx:0, results:[], testT0:0, holdStart:0, raf:null};
  const et=(typeof detectEngineType==='function')?detectEngineType():'benzine';
  bscToast(`${list.length} tests geselecteerd voor ${et} · ${allPids.length} sensoren aangezet`);
  bscNextTest();
}

function bscNextTest(){
  if(!_bscState) return;
  if(_bscState.raf){ cancelAnimationFrame(_bscState.raf); _bscState.raf=null; }
  if(_bscState.idx>=_bscState.list.length){ bscFinish(); return; }
  _bscState.testT0=Date.now();
  _bscState.holdStart=0;
  _bscState._eisOk=false;
  bscDrawFrame(); // start de live-loop
}

function bscCurrentBand(t){
  try{
    if(typeof t.band==='function') return t.band(pidVals, pidHist)||null;
    return t.band||null;
  }catch(e){ return null; }
}

// Slaag-logica per frame. Retourneert {inBand, extra} en beheert hold-timer.
function bscEvaluate(t, band){
  const v=pidVals[t.pid];
  if(v===undefined || band==null) return {v, inBand:false, wacht:true};
  let inBand = v>=band.lo && v<=band.hi;
  // Oscillatie-eis (O2): binnen X sec zowel < 0,3 als > 0,6 gezien
  if(t.oscilleren){
    const h=(pidHist[t.pid]||[]).slice(-40).map(x=>x.v);
    inBand = inBand && h.some(x=>x<0.3) && h.some(x=>x>0.6);
  }
  // Dynamiek-eis: er moet beweging zijn (spreiding > 5% van bereik)
  if(t.dynamiek){
    const h=(pidHist[t.pid]||[]).slice(-30).map(x=>x.v);
    if(h.length>4){ const sp=Math.max(...h)-Math.min(...h); inBand = inBand && sp>Math.max(2,(band.hi-band.lo)*0.05); }
  }
  return {v, inBand, wacht:false};
}

function bscDrawFrame(){
  if(!_bscState) return;
  const t=_bscState.list[_bscState.idx];
  const now=Date.now();
  // ── voorwaarde-poort: eis niet vervuld → even wachten, dan doorstappen ──
  const eis=bscConditie(t);
  if(!eis.ok){
    bscPaint(t, bscCurrentBand(t), undefined, 0, false, true);
    if(_bscState._eisToast!==t.id){
      _bscState._eisToast=t.id;
      bscToast('Wacht op voorwaarde: '+eis.label+' \u2014 anders wordt de test overgeslagen');
    }
    if(now-_bscState.testT0>(t.eisWachtMs||12000)){
      _bscState.results.push({id:t.id, naam:t.naam, status:'nvt', reden:eis.label});
      _bscState.idx++;
      setTimeout(bscNextTest, 300);
      return;
    }
    _bscState.raf=requestAnimationFrame(bscDrawFrame);
    return;
  }
  // Eerste keer dat de voorwaarde vervuld raakt: meettimer opnieuw starten,
  // zodat de test de volle meettijd krijgt en de wachttijd niet meetelt.
  if(!_bscState._eisOk){ _bscState._eisOk=true; _bscState.testT0=now; }
  const band=bscCurrentBand(t);
  const {v, inBand, wacht}=bscEvaluate(t, band);
  // hold-timer: aaneengesloten tijd binnen band
  if(inBand){ if(!_bscState.holdStart) _bscState.holdStart=now; }
  else { _bscState.holdStart=0; }
  const held=_bscState.holdStart? (now-_bscState.holdStart)/1000 : 0;
  const geslaagd = held>=(t.hold||4);

  bscPaint(t, band, v, held, geslaagd, wacht);

  if(geslaagd){
    _bscState.results.push({id:t.id, naam:t.naam, status:'ok', waarde:v, unit:(getPidDef(t.pid)?.unit||''), pid:t.pid});
    _bscState.idx++;
    setTimeout(bscNextTest, 650); // even groen tonen, dan door
    return;
  }
  // Nooit ook maar één meetwaarde gezien? Dan wachten we op een PID die deze
  // auto niet levert. Na 12 s stoppen met een eerlijke reden, i.p.v. 30 s lang
  // "wachten op sensordata" tonen zonder uit te leggen waarom.
  if(v===undefined && now-_bscState.testT0>12000){
    _bscState.results.push({id:t.id, naam:t.naam, status:'geen', pid:t.pid,
      reden:'deze auto levert '+t.pid+' niet'});
    _bscState.idx++;
    setTimeout(bscNextTest, 300);
    return;
  }
  // timeout per test: 30s → markeer als "niet bevestigd" en ga door
  if(now-_bscState.testT0>30000){
    _bscState.results.push({id:t.id, naam:t.naam, status:v===undefined?'geen':'twijfel', waarde:v, unit:(getPidDef(t.pid)?.unit||''), pid:t.pid});
    _bscState.idx++;
    setTimeout(bscNextTest, 300);
    return;
  }
  _bscState.raf=requestAnimationFrame(bscDrawFrame);
}

function bscFinish(){
  if(_bscState&&_bscState.raf) cancelAnimationFrame(_bscState.raf);
  const R=_bscState?_bscState.results:[];
  const ok=R.filter(r=>r.status==='ok').length;
  const tw=R.filter(r=>r.status==='twijfel').length;
  const gn=R.filter(r=>r.status==='geen').length;
  const nv=R.filter(r=>r.status==='nvt').length;
  const rows=R.map(r=>{
    const ic=r.status==='ok'?'✅':r.status==='twijfel'?'⚠️':r.status==='nvt'?'⏭️':'⚪';
    const kl=r.status==='ok'?'ok':r.status==='twijfel'?'warn':'mut';
    const val=r.status==='nvt'
      ? ('n.v.t. \u2014 voorwaarde niet voorgekomen'+(r.reden?': '+r.reden:''))
      : (r.waarde!==undefined?`${(typeof fv==='function')?fv(r.waarde, r.pid):r.waarde} ${r.unit}`
                             :('geen data'+(r.reden?' — '+r.reden:'')));
    const vb=(r.status==='twijfel'&&r.pid&&window.PLVerify&&connected&&!demoMode)
      ?` <button class="btn" style="padding:4px 9px;font-size:11px" onclick="plVerifyBscRow('${r.id}','${r.pid}',this)">🔍</button>`:'';
    return `<div class="bsc-row ${kl}"><span>${ic} ${r.naam}${vb}</span><span class="bsc-val">${val}</span></div>`;
  }).join('');
  bscRender(
    `<div class="bsc-done">
       <div class="bsc-score"><b>${ok}</b>/${R.length-nv} tests groen${tw?` · ${tw} twijfel`:''}${gn?` · ${gn} geen data`:''}${nv?` · ${nv} n.v.t.`:''}</div>
       <div class="bsc-rows">${rows||'<div class="bsc-empty">Geen resultaten.</div>'}</div>
       <div class="toolbar" style="margin-top:12px">
         <button class="btn pri" onclick="startBasicCheck()">🔄 Opnieuw</button>
         <button class="btn" onclick="bscExport()">💾 Exporteer</button>
       </div>
     </div>`);
  try{ scanLogAdd?.({type:'basischeck', msg:`${ok}/${R.length-nv} groen (${tw} twijfel, ${gn} geen data, ${nv} n.v.t.)`}); }catch(e){ console.warn('scanLogAdd mislukt:', e); }
  try{ if(window.PidLaneEvalLog&&PidLaneEvalLog.active) PidLaneEvalLog.log('app','basischeck: '+ok+'/'+R.length+' groen'); }catch(e){ /* stil: eigen telemetrielog (PidLaneEvalLog) — mag de basischeck nooit blokkeren */ }
  _bscState=null;
}

function bscExport(){
  const R=(_bscState&&_bscState.results)||window._bscLast||[];
  const v=(typeof getVehicle==='function')?getVehicle():{};
  const lines=['PidLane — Basic System Check', 'Datum: '+new Date().toLocaleString('nl'),
    v.merk?`Voertuig: ${v.merk} ${v.model||''} ${v.year||''}`:'',''];
  R.forEach(r=>lines.push(`[${(r.status||'').toUpperCase()}] ${r.naam}: ${r.waarde!==undefined?r.waarde+' '+r.unit:'geen data'}`));
  try{ download('basic-system-check.txt', lines.join('\n')); }catch(e){ console.warn('download mislukt:', e); }
}

/* ---- weergave ---- */
function bscRender(html){ const el=document.getElementById('bscBody'); if(el) el.innerHTML=html; }
function bscToast(m){ try{ showToast?.(m,2600); }catch(e){ /* stil: melding mag nooit de stroom breken */ } }

// Live-scherm van de lopende test (progress + canvas).
function bscPaint(t, band, v, held, geslaagd, wacht){
  const el=document.getElementById('bscBody'); if(!el) return;
  const idx=_bscState.idx+1, tot=_bscState.list.length;
  const d=getPidDef(t.pid)||{}; const unit=d.unit||'';
  const pct=Math.min(100, Math.round(held/(t.hold||4)*100));
  // Toon hoe lang we al wachten. Blijft data helemaal uit, dan stopt bscDrawFrame
  // de test na 20 s met "geen data" i.p.v. eindeloos te blijven staan.
  const wachtS = wacht ? Math.round((Date.now()-(_bscState.testT0||Date.now()))/1000) : 0;
  const statusTxt = geslaagd?'✅ Geslaagd'
    : wacht?`⏳ Wachten op sensordata… ${wachtS}s`
    : (held>0?`🟢 Binnen band — ${pct}%`:'🔴 Buiten band');
  if(!document.getElementById('bscCanvas') || el.dataset.test!==t.id){
    el.dataset.test=t.id;
    el.innerHTML=
      `<div class="bsc-head">
         <div class="bsc-cnt">Test ${idx}/${tot} · <span class="bsc-grp">${t.groep}</span></div>
         <div class="bsc-name">${t.naam}</div>
         <div class="bsc-uit">${t.uitleg}</div>
       </div>
       <canvas id="bscCanvas" height="200"></canvas>
       <div class="bsc-meta">
         <div id="bscStatus" class="bsc-status">${statusTxt}</div>
         <div class="bsc-live"><span id="bscVal">${v!==undefined?((typeof fv==='function')?fv(v,t.pid):v):'—'}</span> <span class="bsc-unit">${unit}</span></div>
       </div>
       <div class="bsc-prog"><div id="bscBar" style="width:${pct}%"></div></div>
       <button class="btn bsc-skip" onclick="bscSkip()">Overslaan →</button>`;
  } else {
    const st=document.getElementById('bscStatus'); if(st){ st.textContent=statusTxt; st.className='bsc-status '+(geslaagd?'ok':held>0?'go':'no'); }
    const vv=document.getElementById('bscVal'); if(vv) vv.textContent=v!==undefined?((typeof fv==='function')?fv(v):v):'—';
    const bar=document.getElementById('bscBar'); if(bar) bar.style.width=pct+'%';
  }
  bscDrawCanvas(t, band, unit);
}

function bscSkip(){
  if(!_bscState) return;
  const t=_bscState.list[_bscState.idx];
  _bscState.results.push({id:t.id, naam:t.naam, status:'twijfel', waarde:pidVals[t.pid], unit:(getPidDef(t.pid)?.unit||'')});
  _bscState.idx++;
  bscNextTest();
}

// Canvas: tijd op X, PID op Y, referentieband als grijs vlak, live lijn cyaan.
function bscDrawCanvas(t, band, unit){
  const c=document.getElementById('bscCanvas'); if(!c) return;
  const dpr=window.devicePixelRatio||1;
  const w=c.clientWidth||c.parentElement.clientWidth||320, h=200;
  if(c.width!==Math.round(w*dpr)){ c.width=Math.round(w*dpr); c.height=Math.round(h*dpr); }
  const g=c.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
  const css=getComputedStyle(document.documentElement);
  const col={bg:(css.getPropertyValue('--sur')||'#141b23').trim(), line:(css.getPropertyValue('--bd')||'#2a3644').trim(),
    ink:(css.getPropertyValue('--tx2')||'#9db0c4').trim(), cy:'#2fd0d6', gn:'#3fd07a'};
  const padL=40, padR=10, padT=10, padB=18, plotW=w-padL-padR, plotH=h-padT-padB;

  const hist=(pidHist[t.pid]||[]).slice(-60);
  // Y-bereik: band + data, met marge
  let ylo=band?band.lo:(d=>d.min)(getPidDef(t.pid)||{min:0}), yhi=band?band.hi:(getPidDef(t.pid)?.max||100);
  const vals=hist.map(x=>x.v);
  if(vals.length){ ylo=Math.min(ylo, Math.min(...vals)); yhi=Math.max(yhi, Math.max(...vals)); }
  if(yhi<=ylo) yhi=ylo+1;
  const mrg=(yhi-ylo)*0.12; ylo-=mrg; yhi+=mrg;
  const Y=val=>padT+plotH-((val-ylo)/(yhi-ylo))*plotH;
  const X=i=>padL+(i/Math.max(1,59))*plotW;

  // referentieband
  if(band){
    g.fillStyle='rgba(63,208,122,.12)';
    const y1=Y(band.hi), y2=Y(band.lo);
    g.fillRect(padL, Math.min(y1,y2), plotW, Math.abs(y2-y1));
    g.strokeStyle='rgba(63,208,122,.5)'; g.setLineDash([4,4]); g.lineWidth=1;
    g.beginPath(); g.moveTo(padL,y1); g.lineTo(padL+plotW,y1); g.moveTo(padL,y2); g.lineTo(padL+plotW,y2); g.stroke();
    g.setLineDash([]);
    if(band.ref!=null){ g.strokeStyle='rgba(159,176,196,.55)'; g.beginPath(); g.moveTo(padL,Y(band.ref)); g.lineTo(padL+plotW,Y(band.ref)); g.stroke(); }
  }
  // assen
  g.strokeStyle=col.line; g.lineWidth=1; g.beginPath();
  g.moveTo(padL,padT); g.lineTo(padL,padT+plotH); g.lineTo(padL+plotW,padT+plotH); g.stroke();
  g.fillStyle=col.ink; g.font='10px system-ui'; g.textAlign='right';
  g.fillText(((typeof fv==='function')?fv(yhi):yhi.toFixed(0)), padL-4, padT+8);
  g.fillText(((typeof fv==='function')?fv(ylo):ylo.toFixed(0)), padL-4, padT+plotH);
  g.textAlign='left'; g.fillText('tijd →', padL+2, padT+plotH+14);

  // live lijn
  if(hist.length>1){
    const n=hist.length; const off=60-n;
    g.strokeStyle=col.cy; g.lineWidth=2; g.beginPath();
    hist.forEach((p,i)=>{ const x=X(off+i), y=Y(p.v); i?g.lineTo(x,y):g.moveTo(x,y); });
    g.stroke();
    // laatste punt
    const last=hist[hist.length-1]; const inB=band && last.v>=band.lo && last.v<=band.hi;
    g.fillStyle=inB?col.gn:col.cy; g.beginPath(); g.arc(X(off+n-1),Y(last.v),3.5,0,7); g.fill();
  }
}
