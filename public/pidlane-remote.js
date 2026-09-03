/* PIDLANE-REMOTE.JS — remote-diagnosemodule (delen/meekijken), uitgelicht uit
   index.html (build 2026-07-19). Volledig additief: haakt via wrappers in op
   bestaande functies. Laadt op de oorspronkelijke plek onderaan de body;
   bijbehorende HTML (#remPill e.d.) en CSS staan nog in index.html. */
window.PLRemote=(function(){
  'use strict';
  const S={mode:null,ws:null,sess:null,stopFlag:false,dirty:{},flushT:null,recT:null,backoff:1000,exp:0,
           ews:null,expJoin:null,expStop:false,expClosed:false,backoffE:1000,recTE:null,expMeta:null,vals:{},lastExpN:0,pending:{},vstate:null};
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function hb(){return String(window.PROXY_URL||'').replace(/\/$/,'');}
  function wb(){return hb().replace(/^http/i,'ws');}
  function tok(){return (typeof window.APP_TOKEN==='string'&&window.APP_TOKEN)||'';}
  function logA(m,c){try{if(typeof log==='function')log(m,c||'info');}catch(_){ /* stil: melding mag nooit de stroom breken */ }}
  function vehLabel(){
    try{if(window.rdwData&&rdwData.merk)return (rdwData.merk+' '+(rdwData.handelsbenaming||'')).trim();}catch(_){ /* stil: valt door naar de volgende bron hieronder */ }
    try{if(typeof selectedDemoVehicle!=='undefined'&&selectedDemoVehicle&&selectedDemoVehicle.naam)return selectedDemoVehicle.naam;}catch(_){ /* stil: valt door naar null hieronder */ }
    return null;
  }

  /* ── LOCAL: delen ─────────────────────────────────────────────── */
  function openShare(){$('remShareOv').classList.add('open');}
  function closeShare(){$('remShareOv').classList.remove('open');}
  function setShareStat(s){$('remShareStat').textContent=s;}
  /* 2026-07-22: naast tonen/verbergen zetten we ook .rem-pill-on op <html>.
     De pill staat position:fixed rechtsboven en dekte anders de PID-keuze-knop
     in de tabbalk af; met die klasse reserveert .tabs rechts ruimte (pidlane.css). */
  function showPill(on){$('remPill').style.display=on?'flex':'none';
    try{document.documentElement.classList.toggle('rem-pill-on',!!on);}catch(_){ /* stil: element kan al weg zijn */ }
    try{window.PLWake&&PLWake.sync();}catch(_){ console.warn('PLWake niet gesynchroniseerd na het tonen/verbergen van de pill', _); }}

  async function shareStart(){
    const err=$('remShareErr');err.textContent='';
    if(!tok()){err.textContent='⚠ Delen vereist een server-login (het lokale demo-account kan niet delen).';return;}
    err.textContent='Sessie aanmaken…';
    let j;
    try{
      const r=await plFetch('/session/create',{method:'POST',
        json:{ttlMin:240,vehicle:vehLabel()}});
      j=await r.json();
      if(!r.ok||!j.sessionId)throw new Error((j&&j.error)||('HTTP '+r.status));
    }catch(e){err.textContent='⚠ Kon geen sessie starten: '+(e.message||e);return;}
    err.textContent='';
    S.sess=j;S.mode='local';S.stopFlag=false;S.backoff=1000;S.exp=j.exp||0;S.lastExpN=0;
    $('remShareOff').style.display='none';$('remShareOn').style.display='';
    $('remSid').textContent=j.sessionId;
    $('remLink').value=shareLink(j.sessionId,j.joinToken);
    renderShareQr($('remLink').value);
    $('remCode').value=j.sessionId+'~'+j.joinToken;
    $('remExpN').textContent='0';$('remPillN').textContent='0';
    setShareStat('Verbinden met server…');
    openLocalWs();
    requestShortCode(j);   // 10-cijferige meekijk-code ophalen (niet-blokkerend)
    logA('📡 Diagnose delen gestart — sessie '+j.sessionId,'ok');
    try{logUsage('remote_share_start',j.sessionId);}catch(_){ console.warn('Gebruiksstatistiek remote_share_start niet gelogd', _); }
    // GEEN auto Full Survey meer bij het starten van een remote sessie.
    // Die legde de bus juist plat op het moment dat de expert begint mee te
    // kijken: de survey leest élke ondersteunde PID (soms 2x) plus bitmaps en
    // DTC-modes, waardoor de live view de eerste minuut onbruikbaar was.
    // De survey blijft beschikbaar via ☰ → 📋 Full survey, op een moment dat
    // de gebruiker zelf kiest.
    // QR-koppeling: sessie-info deponeren zodat de expert-laptop vanzelf verbindt.
    if(S.pendingClaim){
      const pp=S.pendingClaim;S.pendingClaim=null;
      plFetch('/pair/claim',{method:'POST',
        json:{pairId:pp.pid,claimToken:pp.ct,sessionId:j.sessionId,joinToken:j.joinToken}})
        .then(r=>r.json())
        .then(cj=>{ if(cj&&cj.ok){logA('🔗 Gekoppeld aan expert via QR','ok');try{logUsage('remote_pair_claim',pp.pid);}catch(_){ console.warn('Gebruiksstatistiek remote_pair_claim niet gelogd', _); }}
                    else logA('⚠ QR-koppeling mislukt: '+((cj&&cj.error)||'onbekend'),'warn'); })
        .catch(e=>logA('⚠ QR-koppeling mislukt: '+(e.message||e),'warn'));
    }
  }
  /* ── QR-koppeling: local toont QR van de deel-link; het expert-toestel
     scant met de camera → link opent de app → bestaande deep-link-flow
     (#remote=1&sid&jt → pendingJoin → auto-verbinden na login).
     De bibliotheek laadt lazy vanaf cdnjs — remote delen vereist toch al
     internet. Lukt het laden niet, dan verdwijnt alleen het QR-blok en
     blijven link + losse code gewoon bruikbaar. ── */
  let _qrLibP=null;
  function _qrLib(){
    if(window.QRCode)return Promise.resolve();
    if(_qrLibP)return _qrLibP;
    _qrLibP=new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload=()=>res();
      s.onerror=()=>{_qrLibP=null;rej(new Error('QR-bibliotheek niet geladen'));};
      document.head.appendChild(s);
    });
    return _qrLibP;
  }
  async function renderQrInto(elId,rowId,link){
    const el=$(elId),row=$(rowId);if(!el)return false;
    el.innerHTML='';if(row)row.style.display='';
    try{
      await _qrLib();
      new QRCode(el,{text:String(link||''),width:180,height:180,
        colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
      return true;
    }catch(e){ if(row)row.style.display='none'; return false; }
  }
  function renderShareQr(link){ return renderQrInto('remQr','remQrRow',link); }
  // 10 cijfers leesbaar groeperen: 123 456 7890 (3-3-4, telefoon-stijl).
  function fmtCode(c){c=String(c||'').replace(/\D/g,'');
    return c.length===10?(c.slice(0,3)+' '+c.slice(3,6)+' '+c.slice(6)):c;}
  // Vraag de server om een korte meekijk-code voor deze sessie. Faalt dit
  // (offline/oude Worker), dan blijven link + QR gewoon werken; het codeveld
  // toont dan een nette melding i.p.v. de app te blokkeren.
  async function requestShortCode(j){
    const inp=$('remShort'),st=$('remShortStat');if(!inp)return;
    inp.value='';inp.placeholder='code ophalen…';if(st)st.textContent='';
    try{
      const r=await plFetch('/code/create',{method:'POST',
        json:{sessionId:j.sessionId,joinToken:j.joinToken}});
      const cj=await r.json();
      if(!r.ok||!cj.code)throw new Error((cj&&cj.error)||('HTTP '+r.status));
      inp.value=fmtCode(cj.code);
      if(st)st.textContent='De expert kiest “Meekijken” en typt deze code.';
    }catch(e){
      inp.value='';inp.placeholder='niet beschikbaar';
      if(st)st.textContent='Korte code lukt niet — gebruik de link of QR hieronder.';
      logA('⚠ Korte code niet beschikbaar: '+(e.message||e),'warn');
    }
  }
  function shareLink(sid,jt){
    let base='';
    try{if(location.protocol==='http:'||location.protocol==='https:')base=location.origin+location.pathname;}catch(_){ /* stil: valt terug op PUBLIC_APP_URL hieronder */ }
    if(!base&&typeof window.PUBLIC_APP_URL==='string')base=window.PUBLIC_APP_URL;
    return base+'#remote=1&sid='+sid+'&jt='+encodeURIComponent(jt);
  }
  function openLocalWs(){
    if(!S.sess)return;
    let ws;
    try{ws=new WebSocket(wb()+'/session/connect?id='+encodeURIComponent(S.sess.sessionId)+'&jt='+encodeURIComponent(S.sess.localToken));}
    catch(e){setShareStat('⚠ '+(e.message||e));return;}
    S.ws=ws;
    ws.onopen=()=>{S.backoff=1000;setShareStat('✅ Delen actief — alleen-lezen voor de expert');startFlush();showPill(true);sendVState();};
    ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch(_){return;}handleLocalMsg(m);};
    ws.onclose=()=>{stopFlush();if(S.mode!=='local'||S.stopFlag)return;
      setShareStat('⚠ Verbinding weggevallen — opnieuw verbinden…');
      if(S.exp&&Date.now()/1000>=S.exp){setShareStat('Sessie verlopen.');endShareUi();return;}
      clearTimeout(S.recT);S.recT=setTimeout(openLocalWs,S.backoff);S.backoff=Math.min(S.backoff*2,15000);};
    ws.onerror=()=>{};
  }
  async function handleLocalMsg(m){
    if(m.type==='presence'){const n=m.experts|0;
      $('remExpN').textContent=n;$('remPillN').textContent=n;
      if(n>S.lastExpN){logA('👁 Expert verbonden — '+n+' kijkt nu mee','info');sendVStateSoon();}
      else if(n<S.lastExpN)logA('👁 Expert weg — nog '+n+' verbonden','info');
      S.lastExpN=n;return;}
    if(m.type==='closed'){S.stopFlag=true;setShareStat('Sessie gesloten.');endShareUi();return;}
    if(m.type==='request-pids'){await answerPids(m);return;}
    if(m.type==='request-dtc'){await answerDtc(m);return;}
    if(m.type==='request-poll'){applyExpertPoll(m);return;}
    if(m.type==='request-vstate'){sendVState();return;}
    if(m.type==='request-record'){await answerRecord(m);return;}
    if(m.type==='request-analyze'){await answerAnalyze(m);return;}
  }
  // Expert wil PIDs (blijvend) volgen → UNIE met de eigen actieve set. De
  // expert voegt toe, maar haalt nooit lokale keuzes weg — en het is altijd
  // zichtbaar in de log. Puur lezen: dit bepaalt enkel wát er gepolld wordt.
  function applyExpertPoll(m){
    try{
      const add=(m.pids||[]).map(s=>'01'+String(s).toUpperCase());
      if(typeof activePIDs!=='undefined'&&typeof ensurePIDListActive==='function'){
        ensurePIDListActive([...activePIDs,...add]);
        logA('🔭 Expert volgt nu ook: '+(m.pids||[]).join(', '),'info');
      }
    }catch(_){ console.warn('Expert-PID-verzoek niet verwerkt — de respons meldt toch \'ok\' terug', _); }
    sendWs({type:'response',reqId:m.reqId,data:{poll:'ok'}});
  }
  /* ── VOERTUIGPROFIEL (vstate) ─────────────────────────────────────
     De expert-app is dezelfde app, maar zonder BT-discovery: zijn
     PID-keuzelijst en deuren zouden leeg blijven. Daarom deelt de local
     zijn complete voertuigprofiel — supported PIDs, voertuiginfo,
     actieve selectie, sensor-gezondheid en laatst bekende foutcodes.
     Verstuurd bij WS-open, bij een nieuw aanhakende expert, op verzoek
     (request-vstate) en (gedebounced) na elke discovery/RDW-update.
     De Worker cachet het laatste snapshot voor late joiners. Puur lezen. */
  function buildVState(){
    const o={t:Date.now()};
    try{o.pids=(typeof supportedPIDs!=='undefined')?[...supportedPIDs].slice(0,200):[];}catch(_){o.pids=[];}
    try{const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
      o.veh={merk:v.merk||'',model:v.model||'',year:v.year||'',vin:v.vin||'',brandstof:v.brandstof||'',motor:v.motor||''};}catch(_){ console.warn('Voertuiginfo niet in het vstate-snapshot gezet — de expert ziet dan geen voertuig', _); }
    try{o.active=(typeof activePIDs!=='undefined')?[...activePIDs].slice(0,60):[];}catch(_){ console.warn('Actieve PIDs niet in het vstate-snapshot gezet', _); }
    try{const h={};if(typeof _pidHealth!=='undefined'){for(const k in _pidHealth){if(_pidHealth[k]&&_pidHealth[k]!=='ok')h[k]=_pidHealth[k];}}o.health=h;}catch(_){ console.warn('Sensor-gezondheid niet in het vstate-snapshot gezet', _); }
    try{o.dtc=(typeof dtcCodes!=='undefined'&&Array.isArray(dtcCodes))?dtcCodes.slice(0,40):[];}catch(_){ console.warn('Foutcodes niet in het vstate-snapshot gezet', _); }
    try{o.demo=(typeof demoMode!=='undefined')&&!!demoMode;}catch(_){ console.warn('Demo-vlag niet in het vstate-snapshot gezet', _); }
    try{o.rps=(typeof _connSpeed!=='undefined'&&_connSpeed&&_connSpeed.readsPerSec)||null;}catch(_){ console.warn('Leessnelheid niet in het vstate-snapshot gezet', _); }
    return o;
  }
  let _vstT=null;
  function sendVState(){ if(S.mode!=='local')return; sendWs({type:'vstate',data:buildVState()}); }
  function sendVStateSoon(){ if(S.mode!=='local')return; clearTimeout(_vstT); _vstT=setTimeout(sendVState,1200); }
  /* ── EXPERT-BESTURING: opname + AI-analyse draaien op de LOCAL ──
     De expert stuurt alleen commando's; de local (met de echte BT-verbinding,
     volle busfrequentie en het AI-tegoed) doet het werk en stuurt resultaat
     terug. Alles zichtbaar in de lokale app-log als audit trail. */
  let _remRecStatT=null;
  function _remRecStatus(extra){
    try{
      const n=Object.values(datalogBuffer||{}).reduce((a,arr)=>a+arr.length,0);
      const act=(typeof _recActive!=='undefined')&&_recActive;
      const sec=act?Math.round((Date.now()-_recT0)/1000):0;
      sendWs({type:'record-status',data:Object.assign({rec:!!act,sec:sec,n:n},extra||{})});
    }catch(_){ console.warn('Opnamestatus niet naar de expert gestuurd (volgende tik probeert opnieuw)', _); }
  }
  async function answerRecord(m){
    const act=String(m.action||'');
    try{
      if(act==='start'){
        if(typeof _recActive!=='undefined'&&_recActive){sendWs({type:'response',reqId:m.reqId,data:{record:'al-bezig'}});return;}
        const sfx=[...new Set((m.pids||[]).map(s=>String(s).toUpperCase()).filter(s=>/^[0-9A-F]{2}$/.test(s)))].slice(0,24);
        const wens=sfx.length?sfx.map(s=>'01'+s):[...(activePIDs||[])];
        const bruikbaar=wens.filter(p=>{try{return !!getPidDef(p)||(typeof supportedPIDs!=='undefined'&&supportedPIDs.has&&supportedPIDs.has(p));}catch(_){return true;}});
        if(!bruikbaar.length){sendWs({type:'response',reqId:m.reqId,data:{record:'geen-pids'}});return;}
        _recSel.clear();bruikbaar.forEach(p=>_recSel.add(p));
        pidRecStartRec();   // zelfde machinerie als de recorder-UI — DOM-guarded, headless-veilig
        if(typeof _recActive==='undefined'||!_recActive){sendWs({type:'response',reqId:m.reqId,data:{record:'start-mislukt'}});return;}
        logA('🔭 Expert startte een opname op dit toestel ('+bruikbaar.length+' sensoren)','warn');
        try{logUsage('remote_record_start',bruikbaar.join(' '));}catch(_){ console.warn('Gebruiksstatistiek remote_record_start niet gelogd', _); }
        clearInterval(_remRecStatT);_remRecStatT=setInterval(()=>_remRecStatus(),1000);
        sendWs({type:'response',reqId:m.reqId,data:{record:'gestart',pids:bruikbaar}});
        _remRecStatus();
        return;
      }
      if(act==='stop'){
        clearInterval(_remRecStatT);_remRecStatT=null;
        if(typeof _recActive==='undefined'||!_recActive){sendWs({type:'response',reqId:m.reqId,data:{record:'niet-actief'}});return;}
        pidRecStopRec();
        logA('🔭 Expert stopte de opname','info');
        try{logUsage('remote_record_stop',((window._recData&&window._recData.dur)||0)+'s');}catch(_){ console.warn('Gebruiksstatistiek remote_record_stop niet gelogd', _); }
        const d=window._recData||{};
        const rows=(typeof _recStats==='function')?_recStats():[];
        sendWs({type:'response',reqId:m.reqId,data:{record:'gestopt',dur:d.dur||0,n:d.n||0,
          rows:rows.map(r=>({pid:r.pid,name:r.name,unit:r.unit,n:r.n,mn:r.mn,mx:r.mx,
            av:r.av==null?null:Math.round(r.av*100)/100}))}});
        _remRecStatus({rec:false});
        return;
      }
      if(act==='csv'){
        const csv=(typeof pidRecCSV==='function')?pidRecCSV():'';
        if(!csv){sendWs({type:'response',reqId:m.reqId,data:{record:'geen-data'}});return;}
        // WS-frames klein houden: in chunks van ~30 kB versturen
        const CH=30000;const total=Math.max(1,Math.ceil(csv.length/CH));
        for(let i=0;i<total;i++)sendWs({type:'response',reqId:m.reqId,
          data:{csvChunk:csv.slice(i*CH,(i+1)*CH),chunk:i+1,chunks:total}});
        logA('🔭 Expert downloadde de opname-CSV ('+csv.length+' tekens)','info');
        return;
      }
    }catch(e){sendWs({type:'response',reqId:m.reqId,data:{record:'fout',err:String((e&&e.message)||e)}});}
  }
  async function answerAnalyze(m){
    const prob=String(m.problem||'').slice(0,500);
    if(!window._recData||!window._recData.n){sendWs({type:'response',reqId:m.reqId,data:{analysis:null,err:'geen opname beschikbaar — eerst opnemen en stoppen'}});return;}
    logA('🔭 Expert vroeg AI-analyse van de opname (gebruikt AI-tegoed van dit account)','warn');
    try{logUsage('remote_analyze',prob.slice(0,80));}catch(_){ console.warn('Gebruiksstatistiek remote_analyze niet gelogd', _); }
    sendWs({type:'response',reqId:m.reqId,data:{analysisBusy:true}});
    try{
      const txt=await pidRecAiText(prob||'Algemene beoordeling van de opgenomen sensordata; benoem afwijkingen en waarschijnlijke oorzaken.');
      window._lastAIReport={text:txt,html:_aiReportHtml(txt),ts:new Date()};
      sendWs({type:'response',reqId:m.reqId,data:{analysis:txt}});
    }catch(e){sendWs({type:'response',reqId:m.reqId,data:{analysis:null,err:String((e&&e.message)||e)}});}
  }
  // BT-kanaal delen met de poll-loop: wacht tot de lopende ronde klaar is en
  // claim daarna kort het kanaal, zodat one-shots en polls elkaar niet storen.
  async function withBtLock(fn){
    const t0=Date.now();
    const tok=await PLBus.wait('remote',5000);
    try{return await fn();}finally{ if(tok) PLBus.release(tok); }
  }
  async function readSuffix(sfx){
    const pid='01'+sfx;
    try{ // verse waarde uit de lopende poll? geen extra buskanaal nodig
      if(typeof pidVals!=='undefined'&&pidVals[pid]!==undefined&&
         (Date.now()-((typeof _pidLastUpd!=='undefined'&&_pidLastUpd[pid])||0))<5000)return pidVals[pid];
    }catch(_){ /* stil: valt door naar een verse meting hieronder */ }
    try{
      if(typeof demoMode!=='undefined'&&demoMode&&typeof demo==='function'){
        const v=demo(pid);try{updPID(pid,v);}catch(_){ console.warn('Demo-waarde niet in de lokale pijplijn gezet, de expert krijgt de waarde nog wel', _); }
        return (typeof v==='number')?v:null;
      }
      if(typeof connected==='undefined'||!connected)return null;
      return await withBtLock(async()=>{
        const raw=await sendCmd('01'+sfx+'1',2500);
        const v=parsePID(pid,raw);
        if(v!=null){try{updPID(pid,v);}catch(_){ console.warn('Gemeten waarde niet in de lokale pijplijn gezet, de expert krijgt de waarde nog wel', _); }}
        return (v==null?null:v);
      });
    }catch(_){return null;}
  }
  async function answerPids(m){
    const out={};
    for(const s of (m.pids||[])){const sfx=String(s).toUpperCase();out[sfx]=await readSuffix(sfx);}
    sendWs({type:'response',reqId:m.reqId,data:{pids:out}});
    logA('🔭 Expert vroeg PIDs op: '+(m.pids||[]).join(', '),'info');
  }
  async function answerDtc(m){
    let codes=[];
    try{
      if(typeof demoMode!=='undefined'&&demoMode){codes=(typeof dtcCodes!=='undefined'&&dtcCodes&&dtcCodes.length)?[...dtcCodes]:[];}
      else if(typeof connected!=='undefined'&&connected&&typeof realScanDTC==='function'){codes=await withBtLock(()=>realScanDTC());}
    }catch(_){codes=[];}
    sendWs({type:'response',reqId:m.reqId,data:{dtc:codes}});
    logA('🔭 Expert las foutcodes uit ('+codes.length+' code'+(codes.length===1?'':'s')+')','info');
  }
  function sendWs(o){try{if(S.ws&&S.ws.readyState===1)S.ws.send(JSON.stringify(o));}catch(_){ console.warn('Bericht niet naar de expert verstuurd', _); }}
  function feed(pid,val){
    if(S.mode!=='local'||!S.ws||S.ws.readyState!==1)return;
    if(typeof val!=='number'||!isFinite(val))return;
    S.dirty[String(pid).slice(2).toUpperCase()]=Math.round(val*100)/100;
  }
  function startFlush(){stopFlush();S.flushT=setInterval(()=>{
    if(S.mode!=='local'||!S.ws||S.ws.readyState!==1)return;
    const k=Object.keys(S.dirty);if(!k.length)return;
    const d=S.dirty;S.dirty={};d.t=Date.now();
    sendWs({type:'telemetry',data:d});
  },250);}
  function stopFlush(){if(S.flushT){clearInterval(S.flushT);S.flushT=null;}}
  async function shareStop(){
    S.stopFlag=true;clearTimeout(S.recT);stopFlush();
    clearInterval(_remRecStatT);_remRecStatT=null;
    try{if(S.sess)await plFetch('/session/close',{method:'POST',
      json:{sessionId:S.sess.sessionId}});}catch(_){ logA('Sessie niet netjes gesloten op de server — kan daar nog even actief blijven voor de expert','warn'); }
    try{if(S.ws)S.ws.close();}catch(_){ /* stil: opruimen: kan al gebeurd zijn */ }
    endShareUi();logA('📡 Delen gestopt','info');
    try{logUsage('remote_share_stop',(S.sess&&S.sess.sessionId)||'');}catch(_){ console.warn('Gebruiksstatistiek remote_share_stop niet gelogd', _); }
  }
  function endShareUi(){S.mode=null;S.ws=null;showPill(false);
    $('remShareOn').style.display='none';$('remShareOff').style.display='';$('remShareErr').textContent='';
    try{$('remQr').innerHTML='';}catch(_){ /* stil: element kan al weg zijn */ }
    try{$('remShort').value='';$('remShort').placeholder='··· ··· ····';}catch(_){ /* stil: element kan al weg zijn */ }}

  /* ── EXPERT: meekijken ────────────────────────────────────────── */
  function openExpert(){$('remExpertOv').classList.add('open');}
  function expertClose(){$('remExpertOv').classList.remove('open');pairStop();}
  function setExpStat(s){$('remExpStat').textContent=s;}
  /* ── OMGEKEERDE KOPPELING: expert toont QR, local scant ──
     Expert maakt bij de Worker een kortlevende pairing (10 min) met twee
     gescheiden tokens: het CLAIM-token zit in de QR (mag alleen sessie-info
     deponeren), het POLL-token blijft op dit toestel (mag alleen ophalen).
     Een foto van de QR geeft dus nooit meekijkrechten. De local scant,
     start automatisch met delen en deponeert sid+joinToken; wij pollen tot
     dat er is en verbinden dan vanzelf. ── */
  /* ── IN-APP QR-SCANNER ──
     BarcodeDetector + getUserMedia: native in Chrome/Edge en de Android
     WebView — precies onze doelplatforms. Geen bibliotheek nodig. Op
     browsers zonder BarcodeDetector (Firefox/Safari) fail-soft met de tip
     om de camera-app te gebruiken; de link-flow werkt daar gewoon. */
  let _scanStream=null,_scanRun=false;
  async function startQrScan(onHit,hint){
    const ov=$('remScanOv');if(!ov)return;
    if(!('BarcodeDetector' in window)){
      try{showToast?.('QR-scannen wordt hier niet ondersteund — gebruik de camera-app van je toestel');}catch(_){ /* stil: melding mag nooit de stroom breken */ }
      return;
    }
    $('remScanHint').textContent=hint||'Richt de camera op de QR-code';
    ov.style.display='flex';
    try{
      _scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
      const v=$('remScanVid');v.srcObject=_scanStream;await v.play();
      const det=new BarcodeDetector({formats:['qr_code']});
      _scanRun=true;
      const loop=async()=>{
        if(!_scanRun)return;
        try{
          const codes=await det.detect(v);
          if(codes&&codes.length){const txt=String(codes[0].rawValue||'');stopQrScan();onHit(txt);return;}
        }catch(_){ /* stil: volgend beeldje probeert het opnieuw */ }
        setTimeout(loop,180);
      };
      loop();
    }catch(e){
      stopQrScan();
      try{showToast?.('Camera niet beschikbaar: '+(e.message||e));}catch(_){ /* stil: melding mag nooit de stroom breken */ }
    }
  }
  function stopQrScan(){
    _scanRun=false;
    try{if(_scanStream)_scanStream.getTracks().forEach(t=>t.stop());}catch(_){ /* stil: opruimen, camera kan al gestopt zijn */ }
    _scanStream=null;
    const ov=$('remScanOv');if(ov)ov.style.display='none';
    const v=$('remScanVid');if(v)v.srcObject=null;
  }
  // Expert scant de deel-QR van de local (laptop-webcam of tablet).
  function scanForJoin(){
    startQrScan(txt=>{
      const p=parseJoin(txt);
      if(!p){try{showToast?.('Geen geldige PidLane-QR');}catch(_){ /* stil: melding mag nooit de stroom breken */ }return;}
      try{$('remJoinIn').value=p.sid+'~'+p.jt;}catch(_){ console.warn('Code-veld niet vooringevuld na het scannen', _); }
      expertConnect(p);
    },'Scan de deel-QR op het toestel bij de auto');
  }
  // Local scant de koppel-QR op het scherm van de expert.
  function scanForPair(){
    startQrScan(txt=>{
      const pid=(txt.match(/[#&]pid=([A-Za-z0-9]+)/)||[])[1]||'';
      const ct=(txt.match(/[#&]ct=([^&\s]+)/)||[])[1]||'';
      if(!pid||!ct){try{showToast?.('Geen geldige koppel-QR');}catch(_){ /* stil: melding mag nooit de stroom breken */ }return;}
      S.pendingClaim={pid:pid,ct:decodeURIComponent(ct)};
      shareStart();
    },'Scan de koppel-QR op het scherm van de expert');
  }
  async function pairStart(){
    const err=$('remExpErr');err.textContent='';
    if(!tok()){err.textContent='⚠ Inloggen vereist om een koppel-QR te maken.';return;}
    const st=$('remPairStat');
    try{
      const r=await plFetch('/pair/create',{method:'POST',json:{}});
      const j=await r.json();
      if(!r.ok||!j.pairId)throw new Error((j&&j.error)||('HTTP '+r.status));
      S.pair=j;
      let base='';
      try{if(location.protocol==='http:'||location.protocol==='https:')base=location.origin+location.pathname;}catch(_){ /* stil: valt terug op PUBLIC_APP_URL hieronder */ }
      if(!base&&typeof window.PUBLIC_APP_URL==='string')base=window.PUBLIC_APP_URL;
      const link=base+'#pair=1&pid='+j.pairId+'&ct='+encodeURIComponent(j.claimToken);
      const ok=await renderQrInto('remPairQr','remPairRow',link);
      if(!ok){err.textContent='⚠ QR-weergave niet beschikbaar (CDN geblokkeerd?)';return;}
      if(st)st.textContent='Wacht op scan… (10 min geldig)';
      clearInterval(S.pairT);
      S.pairT=setInterval(async()=>{
        try{
          const pr=await plFetch('/pair/poll?id='+encodeURIComponent(j.pairId)+'&pt='+encodeURIComponent(j.pollToken));
          const pj=await pr.json();
          if(pj&&pj.status==='ready'&&pj.sessionId&&pj.joinToken){
            clearInterval(S.pairT);S.pairT=null;
            if(st)st.textContent='✅ Gescand — verbinden…';
            try{$('remJoinIn').value=pj.sessionId+'~'+pj.joinToken;}catch(_){ console.warn('Code-veld niet vooringevuld na koppelen', _); }
            expertConnect({sid:pj.sessionId,jt:pj.joinToken});
            const row=$('remPairRow');if(row)row.style.display='none';
          }else if(pj&&pj.status==='expired'){
            clearInterval(S.pairT);S.pairT=null;
            if(st)st.textContent='⏰ Verlopen — maak een nieuwe QR.';
          }
        }catch(_){ /* stil: volgende tik (2s) probeert het opnieuw */ }
      },2000);
    }catch(e){err.textContent='⚠ Koppel-QR mislukt: '+(e.message||e);}
  }
  function pairStop(){clearInterval(S.pairT);S.pairT=null;const row=$('remPairRow');if(row)row.style.display='none';}
  function parseJoin(str){
    str=String(str||'').trim();if(!str)return null;
    const h=str.indexOf('#');if(h>=0)str=str.slice(h+1);
    if(/(^|&)sid=/.test(str)){
      try{const p=new URLSearchParams(str);const sid=p.get('sid'),jt=p.get('jt');
        if(sid&&jt)return{sid:sid.trim(),jt:jt.trim()};}catch(_){ /* stil: valt door naar de eenvoudige vorm hieronder */ }
    }
    const t=str.split('~');
    if(t.length===2&&t[0].trim()&&t[1].trim())return{sid:t[0].trim(),jt:t[1].trim()};
    return null;
  }
  async function resolveShortCode(code){
    const r=await plFetch('/code/resolve',{method:'POST',
      json:{code}});
    let cj={};try{cj=await r.json();}catch(_){ /* stil: foutbody hoeft geen geldige JSON te zijn */ }
    if(r.status===429)throw new Error('te veel pogingen — wacht even');
    if(r.status===410||(cj&&cj.error==='expired'))throw new Error('code verlopen');
    if(r.status===404||(cj&&cj.error==='unknown_code'))throw new Error('onbekende code');
    if(!r.ok||!cj.sessionId||!cj.joinToken)throw new Error((cj&&cj.error)||('HTTP '+r.status));
    return{sid:String(cj.sessionId).trim(),jt:String(cj.joinToken).trim()};
  }
  async function expertConnect(pre){
    const err=$('remExpErr');err.textContent='';
    let j=(pre&&pre.sid)?pre:null;
    if(!j){
      const raw=($('remJoinIn').value||'').trim();
      const digits=raw.replace(/\D/g,'');
      // Puur 10 cijfers (evt. met spaties/streepjes) → korte code: eerst inruilen.
      if(/^\d{10}$/.test(digits)&&!/[a-z:/#~=]/i.test(raw)){
        if(!tok()){err.textContent='⚠ Meekijken via code vereist een login.';return;}
        err.textContent='Code controleren…';
        try{j=await resolveShortCode(digits);}
        catch(e){err.textContent='⚠ '+(e.message||e);return;}
      }else{
        j=parseJoin(raw);
      }
    }
    if(!j){err.textContent='⚠ Onherkenbare code of link.';return;}
    S.expJoin=j;S.expStop=false;S.expClosed=false;S.backoffE=1000;S.vals={};S.expMeta=null;S.vstate=null;S.demoWarned=false;
    err.textContent='Verbinden…';
    openExpertWs();
  }
  function openExpertWs(){
    const j=S.expJoin;if(!j)return;
    let ws;
    try{ws=new WebSocket(wb()+'/session/connect?id='+encodeURIComponent(j.sid)+'&jt='+encodeURIComponent(j.jt));}
    catch(e){$('remExpErr').textContent='⚠ '+(e.message||e);return;}
    S.ews=ws;
    ws.onopen=()=>{S.backoffE=1000;$('remExpErr').textContent='';
      $('remExpConn').style.display='none';$('remExpLive').style.display='';
      setExpStat('✅ Live verbonden — sessie '+j.sid);};
    ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch(_){return;}handleExpMsg(m);};
    ws.onclose=(ev)=>{
      if(S.expStop||S.expClosed)return;
      if(S.expMeta&&S.expMeta.exp&&Date.now()/1000>=S.expMeta.exp){setExpStat('Sessie verlopen.');return;}
      // 1006 zonder ooit open: waarschijnlijk verlopen/ongeldig token
      if(!S.expMeta&&$('remExpLive').style.display==='none'){
        $('remExpErr').textContent='⚠ Verbinden mislukt — code verlopen of onjuist?';return;}
      setExpStat('⚠ Verbinding weggevallen — opnieuw verbinden…');
      clearTimeout(S.recTE);S.recTE=setTimeout(openExpertWs,S.backoffE);S.backoffE=Math.min(S.backoffE*2,15000);
    };
    ws.onerror=()=>{};
  }
  function handleExpMsg(m){
    if(m.type==='meta'){S.expMeta=m.meta;
      setExpStat('✅ Live — '+(m.meta.vehicle||'voertuig onbekend')+' · gedeeld door '+(m.meta.ownerLabel||m.meta.owner));return;}
    if(m.type==='backfill'){(m.frames||[]).forEach(f=>{mergeVals(f&&f.data);driveFeed(f&&f.data,true);});renderTiles();
      expLog('↺ '+((m.frames||[]).length)+' frame(s) historie ontvangen');return;}
    if(m.type==='frame'){mergeVals(m.frame&&m.frame.data);driveFeed(m.frame&&m.frame.data);renderTiles();return;}
    if(m.type==='vstate'){S.vstate=m.data||null;
      if(window._remoteVehicleMode)applyVState(S.vstate);
      const n=((S.vstate&&S.vstate.pids&&S.vstate.pids.length)|0);
      const vh=(S.vstate&&S.vstate.veh)||{};
      if(n)expLog('🚗 Voertuigprofiel — '+n+' sensoren'+(vh.merk?(' · '+(vh.merk+' '+(vh.model||'')).trim()):'')
        +(S.vstate.rps?(' · ~'+S.vstate.rps+' reads/s'):'')+(S.vstate.demo?' · ⚠ DEMO-data':''));
      return;}
    if(m.type==='record-status'){const d=m.data||{};
      const el=$('remRecStat');
      if(el)el.innerHTML=d.rec?('● REC '+(d.sec|0)+'s · '+(d.n|0)+' metingen op de local'):('✓ opname gestopt · '+(d.n|0)+' metingen');
      _recBtns(!!d.rec,(d.n|0)>0);
      return;}
    if(m.type==='response'){const d=m.data||{};
      if(d.record!==undefined){
        expLog('📼 '+d.record+(d.err?(' — '+d.err):''));
        if(d.record==='gestart'){_recBtns(true,false);const o=$('remRecOut');if(o)o.innerHTML='';}
        if(d.record==='gestopt'){_recBtns(false,(d.n|0)>0);const o=$('remRecOut');if(o)o.innerHTML=_recRowsHtml(d.rows,d.dur|0,d.n|0);}
        if(d.record==='al-bezig')_recBtns(true,false);
        if(d.record==='niet-actief'||d.record==='geen-pids'||d.record==='start-mislukt'||d.record==='fout')_recBtns(false,false);
      }
      if(d.csvChunk!==undefined){S.csvBuf=(S.csvBuf||'')+d.csvChunk;if((d.chunk|0)===(d.chunks|0))_csvDone();}
      if(d.analysisBusy){expLog('⏳ Local draait AI-analyse van de opname…');}
      if(d.analysis){const o=$('remRecOut');
        if(o)o.innerHTML='<div style="background:#0c1018;border:1px solid #232c40;border-radius:8px;padding:10px;font-size:12px;line-height:1.55;white-space:pre-wrap;max-height:40vh;overflow-y:auto">'+esc(d.analysis)+'</div>';
        expLog('🤖 AI-analyse ontvangen van de local');}
      if(d.analysis===null&&d.err){const o=$('remRecOut');if(o)o.innerHTML='<div class="rem-stat">✖ '+esc(d.err)+'</div>';expLog('✖ analyse: '+d.err);}
      if(d.dtc&&m.reqId&&S.pending[m.reqId]){const f=S.pending[m.reqId];delete S.pending[m.reqId];f([...d.dtc]);}
      if(d.pids){mergeVals(d.pids);driveFeed(d.pids);renderTiles();
        expLog('✔ Antwoord: '+Object.entries(d.pids).map(([k,v])=>k+'='+(v==null?'—':v)).join('  '));}
      if(d.dtc)expLog(d.dtc.length?('⚠ Foutcodes: '+d.dtc.join(', ')):'✅ Geen foutcodes aanwezig');
      return;}
    if(m.type==='request-sent'){return;}
    if(m.type==='request-rejected'){expLog('✖ geweigerd: '+(m.reason||'onbekend'));return;}
    if(m.type==='closed'){S.expClosed=true;exitDrive();setExpStat('Sessie is door de deler gestopt.');expLog('■ sessie gesloten');return;}
  }
  // Remote-voertuig-modus: binnenkomende waarden de gewone app-pijplijn in
  // voeren (updPID), zodat meters, deuren, analyses en AI-rapporten er lokaal
  // gewoon mee werken — de sessie IS dan de databron.
  function driveFeed(d,isBackfill){
    if(!window._remoteVehicleMode||!d||typeof d!=='object')return;
    for(const k in d){
      if(k==='t'||k==='reqId')continue;
      const v=d[k];
      if(typeof v!=='number'||!isFinite(v))continue;
      const pid='01'+String(k).toUpperCase();
      try{updPID(pid,v);}catch(_){ console.warn('Remote-waarde niet in de meters gezet: '+pid, _); }
      // Historie-frames (backfill bij verbinden): alleen meters/pidVals vullen,
      // NIET de opname/stabiliteit in — die frames hebben oude tijdstippen.
      if(isBackfill)continue;
      try{checkStability(pid,v);}catch(_){ console.warn('Stabiliteitscheck niet gedaan voor: '+pid, _); }
      try{feedDatalog(pid,v);}catch(_){ console.warn('Waarde niet in de opnamebuffer gezet: '+pid, _); }
      try{feedSessionStat(pid,v);}catch(_){ console.warn('Sessiestatistiek niet bijgewerkt voor: '+pid, _); }
    }
    // De poll-loop draait remote niet (polling zit op de telefoon) → de
    // per-ronde engines hier zelf aftrappen, gethrottled tot ~1×/s.
    if(!isBackfill&&(!window._remEngT||Date.now()-window._remEngT>900)){
      window._remEngT=Date.now();
      try{runCorrelationEngine();}catch(_){ console.warn('Correlatie-engine niet gedraaid op remote-data', _); }
      try{updateEVMode();}catch(_){ console.warn('EV-modusdetectie niet gedraaid op remote-data', _); }
    }
  }
  // Voertuigprofiel van de local toepassen op déze app-instantie: vult
  // dezelfde variabelen die normaal door een lokale BT-discovery gevuld
  // worden (supportedPIDs → discoveredPIDDefs, vehicleInfo, _pidHealth,
  // activePIDs). Daarna werken PID-keuzelijst, deuren, readiness en
  // analyses volwaardig — met de remote sessie als databron.
  function applyVState(v){
    if(!v||typeof v!=='object'||!window._remoteVehicleMode)return;
    try{
      if(v.veh&&(v.veh.merk||v.veh.vin)){
        try{mergeVehicleData('vin',v.veh);}catch(_){ console.warn('Voertuigdata van de local niet overgenomen', _); }
        try{if(v.veh.vin)vehicleInfo.vin=v.veh.vin;}catch(_){ console.warn('VIN niet overgenomen van de local', _); }
        try{const lbl=((vehicleInfo.merk||'')+' '+(vehicleInfo.model||'')).trim();
            showVtag(lbl||vehicleInfo.vin||'Remote voertuig');}catch(_){ console.warn('Voertuigtag niet bijgewerkt', _); }
      }
      if(v.health&&typeof v.health==='object'){try{for(const k in v.health)_pidHealth[k]=v.health[k];}catch(_){ console.warn('Sensor-gezondheid van de local niet overgenomen', _); }}
      if(Array.isArray(v.pids)&&v.pids.length){
        try{supportedPIDs=new Set(v.pids.filter(p=>typeof p==='string'&&/^01[0-9A-F]{2}$/i.test(p)));}catch(_){ logA('Ondersteunde PIDs van de local niet overgenomen — de PID-keuzelijst kan leeg of verouderd blijven op deze expert-instantie: '+(_&&_.message||_),'warn'); }
        try{buildDiscoveredPIDList();}catch(_){ console.warn('PID-lijst niet opnieuw opgebouwd na het overnemen van de remote sensoren', _); }
      }
      if(Array.isArray(v.active)&&v.active.length){
        // Toevoegpoort (§15, ronde 6). Deze regel staat bewust ná supportedPIDs
        // en _pidHealth hierboven: pas dan kent de gate het voertuig van de
        // local en kan hij oordelen. handmatig:false — het is de keuze van de
        // local, niet van deze gebruiker, precies zoals het hiervoor ook ging.
        try{
          const _kand=v.active.filter(p=>typeof p==='string'&&getPidDef(p));
          const _r=pidToevoegen(_kand,{handmatig:false});
          if(_r.weg.length)logA('🚫 '+_r.weg.length+' sensor(en) uit de remote-selectie overgeslagen — niet bruikbaar op dit voertuig','info');
        }catch(_){
          // 23-08: hier stond alleen een melding. Faalt pidToevoegen(), dan
          // bleef de remote-selectie ONGEFILTERD staan — dezelfde
          // fantoomsensor-familie als punt 1, nu via de remote-sessie. Nu
          // vallen we terug op de steunbits: liever een kleinere set die
          // klopt dan een volledige set die de expert misleidt.
          logA('PID-gate niet doorlopen voor de remote-selectie: '+(_&&_.message||_)+' — terugval op de steunbits','warn');
          try{
            const _veilig=v.active.filter(function(p){ return typeof p==='string' && getPidDef(p) && (typeof ecuSteunt!=='function' || ecuSteunt(p)!==false); });
            if(typeof activePIDs!=='undefined'){ activePIDs.clear(); _veilig.forEach(function(p){ activePIDs.add(p); }); }
            logA(_veilig.length+' van '+v.active.length+' remote-sensoren overgenomen na terugval','info');
          }catch(__){ logA('Ook de terugval mislukte — de sensorset van de local is NIET overgenomen: '+(__&&__.message||__),'err'); }
        }
      }
      try{if(Array.isArray(v.dtc)&&v.dtc.length&&!dtcCodes.length){dtcCodes=[...v.dtc];try{renderDTC();}catch(_){ console.warn('Foutcodelijst niet opnieuw getekend na overname van de local', _); }}}catch(_){ console.warn('Foutcodes van de local niet overgenomen', _); }
      if(v.demo&&!S.demoWarned){S.demoWarned=true;
        logA('⚠ Let op: de local draait DEMO-data — dit is geen echt voertuig','warn');}
      try{buildPIDList(document.getElementById('psrch')?.value||'');}catch(_){ /* stil: element kan al weg zijn */ }
      try{document.getElementById('pidCnt').textContent=activePIDs.size;}catch(_){ /* stil: element kan al weg zijn */ }
      try{renderGauges();rebuildGSel();}catch(_){ console.warn('Meters/selectielijst niet ververst na het overnemen van het voertuigprofiel', _); }
      try{refreshAllReadiness();}catch(_){ console.warn('Meetgereedheid niet herberekend na het overnemen van het voertuigprofiel', _); }
      window._connReady=true;
      try{updateConnGate();}catch(_){ console.warn('Verbindingspoort niet bijgewerkt na het overnemen van het voertuigprofiel', _); }
      logA('🔭 Voertuigprofiel toegepast — '+(((v.pids&&v.pids.length)|0))+' sensoren van de local beschikbaar','ok');
    }catch(_){ logA('Voertuigprofiel van de local niet (volledig) toegepast — analyses op deze expert-instantie kunnen op een onvolledig profiel draaien: '+(_&&_.message||_),'warn'); }
  }
  // Volledige actieve set (gedebounced) naar de local sturen na een handmatige
  // PID-keuze op de expert. De local doet een UNIE met zijn eigen selectie en
  // pollt de sensoren mee — hij haalt nooit lokale keuzes weg.
  let _rpaT=null;
  function remPollActive(){
    if(!window._remoteVehicleMode||!S.ews||S.ews.readyState!==1)return;
    clearTimeout(_rpaT);
    _rpaT=setTimeout(()=>{
      try{
        const sfx=[...new Set([...(activePIDs||[])].map(p=>String(p).slice(2).toUpperCase()))]
          .filter(s=>/^[0-9A-F]{2}$/.test(s)).slice(0,24);
        if(sfx.length&&S.ews&&S.ews.readyState===1)
          S.ews.send(JSON.stringify({type:'request-poll',pids:sfx,reqId:Math.random().toString(36).slice(2,8)}));
      }catch(_){ console.warn('Handmatige PID-keuze niet doorgestuurd naar de local om mee te pollen', _); }
    },400);
  }
  function enterDrive(){
    if(!S.ews||S.ews.readyState!==1){expLog('✖ Eerst verbinden met een sessie');return;}
    try{if(typeof connected!=='undefined'&&connected&&!window._remoteVehicleMode){
      expLog('✖ Verbreek eerst je eigen Bluetooth-verbinding');return;}}catch(_){ console.warn('Eigen-verbinding-check bij het starten van remote-modus mislukt', _); }
    window._remoteVehicleMode=true;
    try{connected=true;demoMode=false;}catch(_){ console.warn('Verbindingsstatus niet op actief gezet voor remote-modus', _); }
    try{setConn(true);}catch(_){ console.warn('Verbindingsindicator niet bijgewerkt voor remote-modus', _); }
    try{document.getElementById('connOv').classList.add('hidden');}catch(_){ /* stil: element kan al weg zijn */ }
    try{if(typeof goHome==='function')goHome();}catch(_){ console.warn('Niet naar het beginscherm genavigeerd bij het starten van remote-modus', _); }
    expertClose();
    const p=$('remDrivePill');if(p){p.style.display='flex';
      p.textContent='🔭 remote · '+((S.expJoin&&S.expJoin.sid)||'');}
    // Remote sessie = analyse-klaar: geen BT-gate ('Check connectie') meer.
    window._connReady=true;
    try{updateConnGate();}catch(_){ console.warn('Verbindingspoort niet bijgewerkt bij het starten van remote-modus', _); }
    // Voertuigprofiel van de local toepassen (of alsnog opvragen).
    if(S.vstate)applyVState(S.vstate);
    else if(S.ews&&S.ews.readyState===1)S.ews.send(JSON.stringify({type:'request-vstate',reqId:_rid()}));
    // Laatst ontvangen live-waarden meteen de meters/pijplijn in.
    try{for(const k in S.vals){const vv=S.vals[k];if(typeof vv==='number')updPID('01'+k,vv);}}catch(_){ console.warn('Laatst bekende waarden niet meteen in de meters gezet', _); }
    // Huidige actieve set meteen bij de local laten meepollen → meters vullen
    try{if(typeof activePIDs!=='undefined'&&activePIDs.size)ensurePIDListActive([...activePIDs]);}catch(_){ logA('Actieve sensoren niet aangezet op de local bij het starten van remote-modus — de meters kunnen leeg blijven: '+(_&&_.message||_),'warn'); }
    logA('🔭 Remote sessie is nu de databron — deuren en analyses bruikbaar (alleen-lezen)','ok');
  }
  function exitDrive(){
    if(!window._remoteVehicleMode)return;
    window._remoteVehicleMode=false;
    try{connected=false;}catch(_){ console.warn('Verbindingsstatus niet uitgezet bij het verlaten van remote-modus', _); }
    try{setConn(false);}catch(_){ console.warn('Verbindingsindicator niet bijgewerkt bij het verlaten van remote-modus', _); }
    window._connReady=false;
    try{updateConnGate();}catch(_){ console.warn('Verbindingspoort niet bijgewerkt bij het verlaten van remote-modus', _); }
    const p=$('remDrivePill');if(p)p.style.display='none';
  }
  function mergeVals(d){if(!d||typeof d!=='object')return;
    for(const k in d){if(k==='t'||k==='reqId')continue;const v=d[k];
      if(typeof v==='number'&&isFinite(v))S.vals[String(k).toUpperCase()]=v;}}
  function pidName(sfx){
    try{const d=(typeof getPidDef==='function')?getPidDef('01'+sfx):null;
      if(d){const n=d.n||d.name||('PID '+sfx);const u=d.u||d.unit||'';return n+(u?' ('+u+')':'');}}catch(_){ /* stil: valt terug op de generieke naam hieronder */ }
    return 'PID '+sfx;
  }
  function renderTiles(){
    const g=$('remTiles');if(!g)return;
    const keys=Object.keys(S.vals).sort();
    g.innerHTML=keys.map(k=>'<div class="rem-tile"><div class="tn">'+esc(pidName(k))+'</div><div class="tv">'+esc(S.vals[k])+'</div></div>').join('');
  }
  function expLog(s){const el=$('remExpLog');if(!el)return;
    const d=document.createElement('div');
    d.textContent=new Date().toLocaleTimeString('nl-NL')+'  '+s;
    el.prepend(d);while(el.children.length>60)el.removeChild(el.lastChild);}
  function reqPids(){
    if(!S.ews||S.ews.readyState!==1)return;
    const pids=String($('remReqPids').value||'').split(/[\s,;]+/)
      .map(s=>s.trim().toUpperCase()).filter(s=>/^[0-9A-F]{2}$/.test(s)).slice(0,12);
    if(!pids.length){expLog('✖ geen geldige PID-codes (2 hex-tekens, bv. 0C)');return;}
    S.ews.send(JSON.stringify({type:'request-pids',pids,reqId:Math.random().toString(36).slice(2,8)}));
  }
  function reqDtc(){if(S.ews&&S.ews.readyState===1)
    S.ews.send(JSON.stringify({type:'request-dtc',reqId:Math.random().toString(36).slice(2,8)}));}
  /* ── Opname & analyse op afstand: expert stuurt, LOCAL doet het werk ── */
  function _rid(){return Math.random().toString(36).slice(2,8);}
  function remRecStart(){
    if(!S.ews||S.ews.readyState!==1)return;
    const pids=String($('remReqPids').value||'').split(/[\s,;]+/)
      .map(s=>s.trim().toUpperCase()).filter(s=>/^[0-9A-F]{2}$/.test(s)).slice(0,24);
    S.ews.send(JSON.stringify({type:'request-record',action:'start',pids:pids,reqId:_rid()}));
    expLog('● Opname-start gestuurd'+(pids.length?(' — '+pids.join(' ')):' — actieve set local'));
  }
  function remRecStop(){if(S.ews&&S.ews.readyState===1)S.ews.send(JSON.stringify({type:'request-record',action:'stop',reqId:_rid()}));}
  function remRecCsv(){S.csvBuf='';if(S.ews&&S.ews.readyState===1)S.ews.send(JSON.stringify({type:'request-record',action:'csv',reqId:_rid()}));}
  function remAnalyze(){
    if(!S.ews||S.ews.readyState!==1)return;
    const prob=String(($('remAnaProb')||{}).value||'').trim();
    const o=$('remRecOut');if(o)o.innerHTML='<div class="rem-stat">⏳ Local draait AI-analyse…</div>';
    S.ews.send(JSON.stringify({type:'request-analyze',problem:prob,reqId:_rid()}));
  }
  function _recBtns(rec,hasData){
    const s1=$('remRecStartBtn'),s2=$('remRecStopBtn'),s3=$('remRecCsvBtn'),s4=$('remAnaBtn');
    if(s1)s1.disabled=!!rec;if(s2)s2.disabled=!rec;
    if(s3)s3.disabled=rec||!hasData;if(s4)s4.disabled=rec||!hasData;
  }
  function _recRowsHtml(rows,dur,n){
    let h='<div class="rem-stat" style="margin-bottom:4px">✓ '+dur+'s · '+n+' metingen (opgenomen op de local)</div>';
    h+='<table style="width:100%;border-collapse:collapse;font-size:11px">';
    h+='<tr><th style="text-align:left;padding:3px;border-bottom:1px solid #232c40">Sensor</th><th style="padding:3px;border-bottom:1px solid #232c40">n</th><th style="padding:3px;border-bottom:1px solid #232c40">Min</th><th style="padding:3px;border-bottom:1px solid #232c40">Max</th><th style="padding:3px;border-bottom:1px solid #232c40">Gem.</th></tr>';
    (rows||[]).forEach(r=>{h+='<tr><td style="padding:3px">'+esc(r.name)+'</td><td style="padding:3px;text-align:center">'+r.n+'</td><td style="padding:3px;text-align:center">'+(r.mn==null?'—':r.mn)+'</td><td style="padding:3px;text-align:center">'+(r.mx==null?'—':r.mx)+'</td><td style="padding:3px;text-align:center">'+(r.av==null?'—':r.av)+' '+esc(r.unit||'')+'</td></tr>';});
    return h+'</table>';
  }
  function _csvDone(){
    try{
      const blob=new Blob([S.csvBuf||''],{type:'text/csv'});const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='pidlane_opname_remote_'+Date.now()+'.csv';
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      expLog('⬇ CSV gedownload ('+(S.csvBuf||'').length+' tekens)');
    }catch(e){expLog('✖ CSV-download mislukt');}
    S.csvBuf='';
  }
  function expertDisconnect(){S.expStop=true;clearTimeout(S.recTE);
    exitDrive();
    try{if(S.ews)S.ews.close();}catch(_){ /* stil: opruimen: kan al gebeurd zijn */ }
    S.ews=null;S.vals={};S.expClosed=false;S.expMeta=null;S.pending={};S.vstate=null;
    $('remExpLive').style.display='none';$('remExpConn').style.display='';
    $('remExpErr').textContent='';setExpStat('—');}

  /* ── Deep link + wrappers (additief inhaken op de app) ────────── */
  let pendingJoin=null,pendingPair=null;
  try{
    const h=String(location.hash||'');
    if(/pair=1/.test(h)){
      const pid=(h.match(/[#&]pid=([A-Za-z0-9]+)/)||[])[1]||'';
      const ct=(h.match(/[#&]ct=([^&]+)/)||[])[1]||'';
      if(pid&&ct){pendingPair={pid:pid,ct:decodeURIComponent(ct)};
        try{history.replaceState(null,'',location.pathname+location.search);}catch(_){ /* stil: cosmetisch, url-balk opschonen */ }}
    }else if(/remote=1/.test(h)||/sid=/.test(h)){
      const p=parseJoin(h);
      if(p){pendingJoin=p;
        try{history.replaceState(null,'',location.pathname+location.search);}catch(_){ /* stil: cosmetisch, url-balk opschonen */ }}
    }
  }catch(_){ console.warn('Deep-link uit de URL-hash niet verwerkt — een gedeelde link opent dan niet vanzelf de juiste sessie', _); }
  function afterLogin(){
    if(pendingPair){
      const pp=pendingPair;pendingPair=null;
      // Scannen = toestemming om te delen: paneel openen en meteen starten.
      S.pendingClaim=pp;
      openShare();
      shareStart();
      return;
    }
    if(!pendingJoin)return;
    const p=pendingJoin;pendingJoin=null;
    openExpert();
    try{$('remJoinIn').value=p.sid+'~'+p.jt;}catch(_){ console.warn('Code-veld niet vooringevuld na deep-link', _); }
    expertConnect(p);
  }
  try{ // telemetrie-tap: elke live-waarde die de app verwerkt óók (throttled) delen
    if(typeof updPID==='function'){const _u=updPID;
      updPID=function(pid,val){_u(pid,val);try{feed(pid,val);}catch(_){ console.warn('Live-waarde niet doorgegeven aan de expert-tap: '+pid, _); }};
      window.updPID=updPID;}
  }catch(_){ console.warn('updPID-wrapper (kernfunctie) niet geïnstalleerd — telemetrie naar de expert werkt dan niet tijdens het delen', _); }
  /* ── Remote-voertuig-wrappers (alleen actief als _remoteVehicleMode aan is) ── */
  try{ // PID-selectie: elke analyse/deur die sensoren activeert → local pollt ze mee
    if(typeof ensurePIDListActive==='function'){const _e=ensurePIDListActive;
      ensurePIDListActive=async function(list){
        const r=await _e(list);
        try{
          if(window._remoteVehicleMode&&S.ews&&S.ews.readyState===1){
            const sfx=[...new Set((list||[]).map(p=>String(p).slice(2).toUpperCase()))]
              .filter(s=>/^[0-9A-F]{2}$/.test(s)).slice(0,24);
            if(sfx.length)S.ews.send(JSON.stringify({type:'request-poll',pids:sfx,
              reqId:Math.random().toString(36).slice(2,8)}));
          }
        }catch(_){ console.warn('PID-selectie niet doorgestuurd naar de local om mee te pollen', _); }
        return r;
      }; window.ensurePIDListActive=ensurePIDListActive;}
  }catch(_){ console.warn('ensurePIDListActive-wrapper (kernfunctie) niet geïnstalleerd — sensoractivatie synct dan niet naar de remote-sessie', _); }
  try{ // polling gebeurt op de telefoon; hier stroomt de data binnen via de sessie
    if(typeof startPoll==='function'){const _sp=startPoll;
      startPoll=function(){
        if(window._remoteVehicleMode){logA('Remote: polling loopt op de telefoon — live data stroomt vanzelf binnen','info');return;}
        return _sp.apply(this,arguments);
      }; window.startPoll=startPoll;}
  }catch(_){ console.warn('startPoll-wrapper niet geïnstalleerd — in remote-modus kan dit toestel dan proberen zelf te pollen zonder adapter', _); }
  try{ // analyse-gate: een actieve remote sessie telt als gecheckte verbinding
    if(typeof preAnalysisCheck==='function'){const _pa=preAnalysisCheck;
      preAnalysisCheck=async function(){ if(window._remoteVehicleMode)return true; return _pa.apply(this,arguments); };
      window.preAnalysisCheck=preAnalysisCheck;}
  }catch(_){ console.warn('preAnalysisCheck-wrapper niet geïnstalleerd — analyses kunnen dan onterecht blijven vragen om een lokale verbinding', _); }
  try{ // snelheidsmeting leest de bus — remote overslaan (aanroepers vangen null af)
    if(typeof measureConnSpeed==='function'){const _mc=measureConnSpeed;
      measureConnSpeed=async function(){ if(window._remoteVehicleMode)return null; return _mc.apply(this,arguments); };
      window.measureConnSpeed=measureConnSpeed;}
  }catch(_){ console.warn('measureConnSpeed-wrapper niet geïnstalleerd — in remote-modus kan dit een echte busmeting proberen zonder adapter', _); }
  try{ // gezondheidsscan leest de bus — remote komt de gezondheid uit het vstate-snapshot
    if(typeof initialHealthScan==='function'){const _ih=initialHealthScan;
      initialHealthScan=async function(){ if(window._remoteVehicleMode)return; return _ih.apply(this,arguments); };
      window.initialHealthScan=initialHealthScan;}
  }catch(_){ console.warn('initialHealthScan-wrapper niet geïnstalleerd — in remote-modus kan dit een echte scan proberen zonder adapter', _); }
  try{ // handmatige PID-keuze op de expert → local pollt de set mee (uniewerking)
    if(typeof togglePID==='function'){const _tg=togglePID;
      togglePID=function(){ const r=_tg.apply(this,arguments); try{remPollActive();}catch(_){ console.warn('PID-keuze niet doorgestuurd naar de local om mee te pollen', _); } return r; };
      window.togglePID=togglePID;}
  }catch(_){ console.warn('togglePID-wrapper niet geïnstalleerd — handmatige PID-keuze op de expert synct dan niet naar de local', _); }
  try{ // '+ Alles'-categorieknop idem
    if(typeof selectCategoryPIDs==='function'){const _sc2=selectCategoryPIDs;
      selectCategoryPIDs=function(){ const r=_sc2.apply(this,arguments); try{remPollActive();}catch(_){ console.warn('Categorie-keuze niet doorgestuurd naar de local om mee te pollen', _); } return r; };
      window.selectCategoryPIDs=selectCategoryPIDs;}
  }catch(_){ console.warn('selectCategoryPIDs-wrapper (kernfunctie) niet geïnstalleerd — de \'+ Alles\'-knop synct dan niet naar de remote-sessie', _); }
  try{ // geen Bluetooth hier: stray one-shots krijgen een lege (NO DATA-achtige) respons
    if(typeof sendCmd==='function'){const _sc=sendCmd;
      sendCmd=async function(cmd,t){ if(window._remoteVehicleMode)return ''; return _sc(cmd,t); };
      window.sendCmd=sendCmd;}
  }catch(_){ console.warn('sendCmd-wrapper (kernfunctie) niet geïnstalleerd — losse commando\'s kunnen dan in remote-modus een echte (niet-bestaande) BT-verbinding proberen', _); }
  try{ // DTC-deur werkt remote via het read-only verzoek naar de telefoon
    if(typeof realScanDTC==='function'){const _rd=realScanDTC;
      realScanDTC=async function(){ if(window._remoteVehicleMode)return remoteDtc(); return _rd(); };
      window.realScanDTC=realScanDTC;}
  }catch(_){ console.warn('realScanDTC-wrapper (kernfunctie) niet geïnstalleerd — de DTC-deur kan dan in remote-modus een echte (niet-bestaande) BT-verbinding proberen', _); }
  try{ // de éne schrijfactie in de app: op afstand hard geblokkeerd
    if(typeof clearDTC==='function'){const _cd=clearDTC;
      clearDTC=async function(){
        if(window._remoteVehicleMode){
          try{showToast?.('🔒 Foutcodes wissen kan niet op afstand — alleen-lezen');}catch(_){ /* stil: melding mag nooit de stroom breken */ }
          logA('🔒 Wissen geblokkeerd: remote sessie is alleen-lezen','warn');return;}
        return _cd.apply(this,arguments);
      }; window.clearDTC=clearDTC;}
  }catch(_){ console.error('KRITIEK: clearDTC-wrapper niet geïnstalleerd — de alleen-lezen-blokkade op foutcodes wissen is dan NIET actief in een remote sessie', _); }
  try{ // adapter-survey is per definitie hardware-lokaal
    if(typeof vlFullSurvey==='function'){const _vs=vlFullSurvey;
      vlFullSurvey=function(){
        if(window._remoteVehicleMode){try{showToast?.('Veldlab-survey werkt alleen bij de auto zelf');}catch(_){ /* stil: melding mag nooit de stroom breken */ }return;}
        return _vs.apply(this,arguments);
      }; window.vlFullSurvey=vlFullSurvey;}
  }catch(_){ console.warn('vlFullSurvey-wrapper niet geïnstalleerd — de survey-knop kan dan in remote-modus proberen een echte scan te starten', _); }
  try{ // local: discovery/verversing van de PID-lijst → snapshot naar de expert
    if(typeof buildDiscoveredPIDList==='function'){const _bd=buildDiscoveredPIDList;
      buildDiscoveredPIDList=function(){ const r=_bd.apply(this,arguments); try{sendVStateSoon();}catch(_){ console.warn('Vernieuwd voertuigprofiel niet naar de expert gestuurd', _); } return r; };
      window.buildDiscoveredPIDList=buildDiscoveredPIDList;}
  }catch(_){ console.warn('buildDiscoveredPIDList-wrapper niet geïnstalleerd — de expert krijgt dan geen vers snapshot na een nieuwe discovery', _); }
  try{ // local: voertuiginfo (VIN/RDW) bijgewerkt → snapshot verversen
    if(typeof showVtag==='function'){const _svt=showVtag;
      showVtag=function(){ const r=_svt.apply(this,arguments); try{sendVStateSoon();}catch(_){ console.warn('Vernieuwd voertuigprofiel niet naar de expert gestuurd na VIN/RDW-update', _); } return r; };
      window.showVtag=showVtag;}
  }catch(_){ console.warn('showVtag-wrapper niet geïnstalleerd — de expert ziet dan geen bijgewerkte voertuiginfo', _); }
  function remoteDtc(){
    return new Promise(res=>{
      if(!S.ews||S.ews.readyState!==1)return res([]);
      const id=Math.random().toString(36).slice(2,8);
      S.pending[id]=res;
      setTimeout(()=>{if(S.pending[id]){delete S.pending[id];res([]);}},15000);
      S.ews.send(JSON.stringify({type:'request-dtc',reqId:id}));
    });
  }
  try{ // na login: eventuele deep-link naar een gedeelde sessie afhandelen
    if(typeof finishLogin==='function'){const _f=finishLogin;
      finishLogin=function(u,a){_f(u,a);try{afterLogin();}catch(_){ console.warn('Deep-link na login niet afgehandeld — een gedeelde sessie opent dan niet vanzelf', _); }};
      window.finishLogin=finishLogin;}
  }catch(_){ console.warn('finishLogin-wrapper niet geïnstalleerd — deep-links naar een gedeelde sessie werken dan niet na inloggen', _); }

  function copy(id){
    const el=$(id);if(!el)return;
    try{el.select();el.setSelectionRange(0,99999);}catch(_){ /* stil: niet elke input ondersteunt setSelectionRange; select() erboven is genoeg */ }
    try{navigator.clipboard.writeText(el.value);}catch(_){try{document.execCommand('copy');}catch(__){ /* stil: browserfunctie ontbreekt of is geweigerd */ }}
    logA('Gekopieerd naar klembord','ok');
  }

  return {openShare,closeShare,shareStart,shareStop,copy,
          openExpert,expertClose,expertConnect,expertDisconnect,reqPids,reqDtc,enterDrive,
          remRecStart,remRecStop,remRecCsv,remAnalyze,pairStart,
          stopQrScan,scanForJoin,scanForPair};
})();
