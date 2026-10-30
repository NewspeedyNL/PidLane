/* PIDLANE-REMOTE.JS — remote-diagnosemodule (delen/meekijken), uitgelicht uit
   index.html (build 2026-07-19). Volledig additief: haakt via wrappers in op
   bestaande functies. Laadt op de oorspronkelijke plek onderaan de body;
   bijbehorende HTML (#remPill e.d.) en CSS staan nog in index.html. */
window.PLRemote=(function(){
  'use strict';
  const S={mode:null,ws:null,sess:null,stopFlag:false,dirty:{},flushT:null,recT:null,backoff:1000,exp:0,
           ews:null,expJoin:null,expStop:false,expClosed:false,backoffE:1000,recTE:null,expMeta:null,vals:{},lastExpN:0,pending:{},vstate:null,
           niveau:'basis',blijvend:false,expNiveau:null,expBlijvend:false,expVast:null};
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  // De tegenhanger van esc() voor de cijferkolommen. esc() stond wél op de
  // tekstvelden van de opnametabel, maar de getallen gingen er ruw langs — en
  // die komen net zo goed van de peer als de namen. Een peer die in plaats van
  // een meetwaarde een stukje HTML stuurt, schreef dat zo rechtstreeks in de
  // tabel. Alles wat als getal de HTML in gaat, moet hier eerst een getal
  // blijken; lukt dat niet, dan is het een streepje. Zie #142.
  const getal=v=>(v==null||v===''||!isFinite(v))?'—':String(Number(v));
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
  function openShare(){$('remShareOv').classList.add('open');deelMethode();}
  /* Welke manier van delen in beeld staat (02-10-2026). Eén tegelijk; de
     keuze blijft bewaard, zodat wie altijd een link stuurt niet elke keer
     hoeft te kiezen. Zonder keuze: de meekijk-code, want die werkt ook
     telefonisch. */
  const DEEL_SLEUTEL='pl_deel_methode', DEEL_MANIEREN=['code','qr','link','los'];
  function deelMethode(m){
    if(DEEL_MANIEREN.indexOf(m)<0){
      try{ m=localStorage.getItem(DEEL_SLEUTEL); }catch(e){ console.warn('Deelmanier niet te lezen', e); m=null; }
      if(DEEL_MANIEREN.indexOf(m)<0) m='code';
    } else {
      try{ localStorage.setItem(DEEL_SLEUTEL,m); }catch(e){ console.warn('Deelmanier niet op te slaan', e); }
    }
    document.querySelectorAll('#remShareOn [data-deel]').forEach(function(e){ e.classList.toggle('aan', e.getAttribute('data-deel')===m); });
    return m;
  }
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
    S.niveau='basis';S.blijvend=false;S.autoScan=false;K.vraag=null;
    $('remShareOff').style.display='none';$('remShareOn').style.display='';deelMethode();
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
    ws.onopen=()=>{S.backoff=1000;setShareStat('✅ Delen actief — alleen-lezen voor de expert');startFlush();showPill(true);
      sendWs({type:'toestemming',niveau:S.niveau,blijvend:S.blijvend});sendVState();};
    ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch(_){return;}handleLocalMsg(m);};
    ws.onclose=()=>{stopFlush();if(S.mode!=='local'||S.stopFlag)return;
      setShareStat('⚠ Verbinding weggevallen — opnieuw verbinden…');
      verbroken('de verbinding viel weg');
      if(S.exp&&Date.now()/1000>=S.exp){setShareStat('Sessie verlopen.');endShareUi();return;}
      clearTimeout(S.recT);S.recT=setTimeout(openLocalWs,S.backoff);S.backoff=Math.min(S.backoff*2,15000);};
    ws.onerror=()=>{};
  }
  async function handleLocalMsg(m){
    try{const a=klantActie(m);if(a)klantLog(a);}catch(_){ console.warn('Expert-actie niet in het meekijkscherm gezet', _); }
    if(m.type==='presence'){const n=m.experts|0;
      try{klantPresence(n,S.lastExpN);}catch(_){ console.warn('Meekijkscherm niet bijgewerkt na een wijziging in meekijkers', _); }
      $('remExpN').textContent=n;$('remPillN').textContent=n;
      if(n>S.lastExpN){logA('👁 Expert verbonden — '+n+' kijkt nu mee','info');sendVStateSoon();}
      else if(n<S.lastExpN){logA('👁 Expert weg — nog '+n+' verbonden','info');if(n===0){expertPollAfmelden();verbroken('de expert is weg');}}
      if(n>0&&S.lastExpN===0)autoSnelScan();
      S.lastExpN=n;return;}
    if(m.type==='closed'){S.stopFlag=true;setShareStat('Sessie gesloten.');endShareUi();return;}
    if(m.type==='vstate-rejected'){logA('⚠ Voertuigprofiel niet bij de expert aangekomen ('+(m.reason||'?')+', '+(m.bytes|0)+' van '+(m.max|0)+' tekens)','warn');return;}
    if(m.type==='vast'){K.vast={id:String(m.id||''),naam:String(m.naam||'je vaste expert').slice(0,80)};
      klantLog(K.vast.naam+' kijkt mee met je vaste toegang');logA('🔓 Vaste expert verbonden: '+K.vast.naam,'info');klantTeken();return;}
    // Een verzoek van een vaste expert (#646) draagt vast:true. Dat zet de
    // Worker erop na de controle van de ondertekende sessie; de klant zag de
    // koppeling bij het maken en ziet hem in het meekijkscherm.
    if(/^request-/.test(m.type)&&!verzoekToegestaan(m,m.vast===true?'volledig':S.niveau)){
      sendWs({type:'response',reqId:m.reqId,data:{geweigerd:'geen_toestemming',nodig:verzoekNiveau(m)}});
      logA('🔒 Verzoek van de expert vraagt volledige toegang: '+m.type,'info');return;}
    if(m.type==='request-toestemming'){vraagToestemming(m);return;}
    if(m.type==='request-snelscan'){const u=await snelScan();sendWs({type:'response',reqId:m.reqId,data:u});return;}
    if(m.type==='request-kaart'){await answerKaart(m);return;}
    if(m.type==='request-pids'){await answerPids(m);return;}
    if(m.type==='request-dtc'){await answerDtc(m);return;}
    if(m.type==='request-poll'){applyExpertPoll(m);return;}
    if(m.type==='request-vstate'){sendVState();return;}
    if(m.type==='request-record'){await answerRecord(m);return;}
    if(m.type==='request-analyze'){await answerAnalyze(m);return;}
    if(m.type==='request-rapport'){answerRapport(m);return;}
  }
  // Expert wil PIDs (blijvend) volgen → UNIE met de eigen actieve set. De
  // expert voegt toe, maar haalt nooit lokale keuzes weg — en het is altijd
  // zichtbaar in de log. Puur lezen: dit bepaalt enkel wát er gepolld wordt.
  // #602 punt 1: elke request-poll is de VOLLEDIGE wens van de expert, geen
  // aanvulling. Tot 24-10 werd hij bij de eigen set opgeteld en die som werd
  // de nieuwe eigen set — dus groeide hij per verzoek en ging er nooit iets af.
  // Nu: eigen set = wat de local zelf had (zonder wat de expert eerder
  // toevoegde) ∪ de nieuwste wens. Vertrekt de laatste expert, dan gaat zijn
  // deel er weer af.
  function pollSet(eigen,expAlleen,wens){
    const basis=[...eigen].filter(p=>!expAlleen.has(p));
    const b=new Set(basis);
    const nieuwExp=wens.filter(p=>!b.has(p));
    return {set:[...basis,...nieuwExp],expAlleen:new Set(nieuwExp)};
  }
  function applyExpertPoll(m){
    try{
      const wens=[...new Set((m.pids||[]).map(remPid).filter(Boolean))].slice(0,24);   // #645: ook mode 21/22
      if(typeof activePIDs!=='undefined'&&typeof ensurePIDListActive==='function'){
        const r=pollSet(activePIDs,S.expAlleen||new Set(),wens);
        S.expAlleen=r.expAlleen;
        ensurePIDListActive(r.set);
        logA('🔭 Expert volgt nu ook: '+(m.pids||[]).join(', '),'info');
      }
    }catch(_){ console.warn('Expert-PID-verzoek niet verwerkt — de respons meldt toch \'ok\' terug', _); }
    sendWs({type:'response',reqId:m.reqId,data:{poll:'ok'}});
  }
  function expertPollAfmelden(){
    try{
      if(!S.expAlleen||!S.expAlleen.size||typeof activePIDs==='undefined'||typeof ensurePIDListActive!=='function')return;
      const r=pollSet(activePIDs,S.expAlleen,[]);
      const n=S.expAlleen.size;S.expAlleen=new Set();
      ensurePIDListActive(r.set);
      logA('🔭 '+n+' sensor(en) van de expert weer uit de meetronde','info');
    }catch(_){ console.warn('Sensoren van de expert niet afgemeld — de meetronde blijft dan langer dan nodig', _); }
  }
  // Eén eerder rapport voor de expert, alleen op zijn verzoek (voorkennis
  // stuurt alleen de titels mee). De Worker laat alleen een archief-id door.
  function answerRapport(m){
    let r=null;
    try{r=window.PLVoorkennis?PLVoorkennis.rapport(String(m.id||'')):null;}catch(_){ console.warn('Rapport voor de expert niet opgezocht', _); }
    logA('🔭 Expert las rapport: '+(r?r.title:'(niet gevonden)'),'info');
    sendWs({type:'response',reqId:m.reqId,data:{rapport:r,err:r?undefined:'niet gevonden'}});
  }
  /* ── TOESTEMMING (#645) ───────────────────────────────────────────
     De meekijkcode geeft "basis": meekijken, lezen en de snelle scan.
     Opname, AI-analyse (jouw tegoed) en de volledige kaart vragen
     "volledig", en die geeft alleen de klant met een tik. Een
     verbindingsprobleem zet volledig terug op basis, tenzij de klant "tot ik
     stop met delen" aanvinkte. De Worker dwingt hetzelfde af
     (verzoekNiveau() in worker.js; test-toestemming.js houdt ze gelijk). */
  const VERZOEK_NIVEAU={'request-pids':'basis','request-dtc':'basis','request-poll':'basis',
    'request-vstate':'basis','request-rapport':'basis','request-snelscan':'basis','request-toestemming':'basis',
    'request-analyze':'volledig','request-kaart':'volledig'};
  function verzoekNiveau(req){
    if(!req||typeof req.type!=='string')return null;
    if(req.type==='request-record')return req.action==='stop'?'basis':'volledig';
    return VERZOEK_NIVEAU[req.type]||null;
  }
  function verzoekToegestaan(req,niveau){
    const nodig=verzoekNiveau(req);
    if(!nodig)return false;
    return nodig==='basis'||niveau==='volledig';
  }
  function zetNiveau(niveau,blijvend,waarom){
    const was=S.niveau;
    S.niveau=niveau==='volledig'?'volledig':'basis';
    S.blijvend=S.niveau==='volledig'&&!!blijvend;
    sendWs({type:'toestemming',niveau:S.niveau,blijvend:S.blijvend});
    if(waarom)klantLog(waarom);
    if(was==='volledig'&&S.niveau==='basis'){
      // Een opname van de expert loopt niet door zonder toestemming.
      try{if(_remRecStatT&&typeof _recActive!=='undefined'&&_recActive){pidRecStopRec();logA('🔒 Opname van de expert gestopt — volledige toegang vervallen','info');}}
      catch(e){console.warn('Opname van de expert niet gestopt bij het vervallen van de toestemming',e);}
      clearInterval(_remRecStatT);_remRecStatT=null;
    }
    klantTeken();
  }
  // Een verbindingsprobleem: zonder vinkje vervalt volledig.
  function verbroken(waarom){
    K.vraag=null;
    if(S.niveau==='volledig'&&!S.blijvend)zetNiveau('basis',false,waarom+' — volledige toegang vervallen');
  }
  function vraagToestemming(m){
    if(S.niveau==='volledig'){sendWs({type:'response',reqId:m.reqId,data:{toestemming:'al-gegeven',niveau:S.niveau,blijvend:S.blijvend}});return;}
    K.vraag={reqId:String(m.reqId||''),reden:String(m.reden||'').slice(0,200)};
    logA('🔓 De expert vraagt volledige toegang','info');
    klantToon();
  }
  function toestemmingAntwoord(ja){
    const v=K.vraag;K.vraag=null;
    let blijvend=false;
    try{const c=$('remKlantBlijvend');blijvend=!!(c&&c.checked);}catch(_){ /* stil: dan geen vinkje */ }
    if(ja)zetNiveau('volledig',blijvend,'je gaf volledige toegang'+(blijvend?' tot je stopt met delen':''));
    else klantLog('je weigerde volledige toegang');
    logA(ja?'🔓 Volledige toegang gegeven'+(blijvend?' (tot stop delen)':''):'🔒 Volledige toegang geweigerd',ja?'warn':'info');
    if(v)sendWs({type:'response',reqId:v.reqId,data:{toestemming:ja?'gegeven':'geweigerd',niveau:S.niveau,blijvend:S.blijvend}});
    klantTeken();
  }
  function terugNaarBasis(){zetNiveau('basis',false,'je zette de toegang terug op basis');}
  // #646: de vaste toegang intrekken — in deze sessie én de koppeling zelf.
  async function vastIntrekken(){
    const v=K.vast;if(!v)return;
    try{if(typeof confirm==='function'&&!confirm('De koppeling met '+v.naam+' intrekken? Daarna heeft deze expert alleen nog de toegang die je per keer geeft.'))return;}catch(_){ /* stil: geen dialoog, dan gewoon doorgaan */ }
    sendWs({type:'toestemming',niveau:S.niveau,blijvend:S.blijvend,vastIntrekken:true});
    K.vast=null;klantLog('je trok de vaste toegang van '+v.naam+' in');
    try{
      const r=await plFetch('/klant/platform',{method:'POST',json:{actie:'expert_ontkoppel',id:v.id}});
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||('HTTP '+r.status));
      _vast.experts=d.experts||[];
      logA('🔒 Koppeling met '+v.naam+' ingetrokken','ok');
    }catch(e){logA('⚠ Koppeling niet ingetrokken op de server — doe het in Mijn voertuigen → Vaste expert: '+((e&&e.message)||e),'warn');}
    klantTeken();
  }

  /* De snelle scan (basis): wat de auto zelf al weet — foutcodes in alle
     drie de soorten, de zelftests, het freeze frame, de km sinds het wissen
     en mode 06. Start vanzelf als de eerste expert binnenkomt en de app dat
     nog niet heeft; anders begint de expert bij nul (#645). Allebei claimen
     ze zelf de bus (metBus/withBus) — dus hier géén withBtLock eromheen. */
  function verbondenMetAuto(){
    try{return (typeof connected!=='undefined'&&!!connected)||(typeof demoMode!=='undefined'&&!!demoMode);}catch(_){return false;}
  }
  function heeftScan(){
    try{return !!(window.PLFoutcodes&&PLFoutcodes.staat&&(PLFoutcodes.staat()||{}).scan);}catch(_){return false;}
  }
  async function snelScan(){
    if(S.scanBezig)return {snelscan:'bezig'};
    if(!verbondenMetAuto())return {snelscan:'niet-verbonden'};
    S.scanBezig=true;
    const t0=Date.now(),uit={snelscan:'klaar',codes:false,m06:false,fouten:[]};
    klantLog('de app doet een snelle scan voor de expert: foutcodes, zelftests en monitortests');
    try{
      if(window.PLFoutcodes&&typeof PLFoutcodes.scan==='function'){
        const r=await PLFoutcodes.scan();
        uit.codes=!!r;
        if(!r)uit.fouten.push(String(((PLFoutcodes.staat()||{}).fout)||'foutcodes niet uitgelezen'));
      }else uit.fouten.push('foutcodescheck niet geladen');
      if(window.PLM06&&PLM06.laatste)uit.m06=true;
      else if(window.PLM06&&typeof PLM06.scan==='function'){
        try{const r=await PLM06.scan();PLM06.bewaarInSessie(r);uit.m06=true;}
        catch(e){uit.fouten.push('mode 06: '+String((e&&e.message)||e));}
      }
    }finally{S.scanBezig=false;}
    uit.ms=Date.now()-t0;
    if(!uit.codes&&!uit.m06)uit.snelscan='mislukt';
    sendVState();
    logA('🔍 Snelle scan voor de expert: '+uit.snelscan+(uit.fouten.length?' — '+uit.fouten.join('; '):''),uit.fouten.length?'warn':'ok');
    return uit;
  }
  function autoSnelScan(){
    if(S.autoScan||heeftScan())return;
    S.autoScan=true;
    if(!verbondenMetAuto()){klantLog('verbind de adapter met de auto — dan kan de expert een snelle scan laten doen');S.autoScan=false;return;}
    snelScan().then(u=>sendWs({type:'response',reqId:'auto-snelscan',data:u}))
      .catch(e=>logA('⚠ Snelle scan voor de expert mislukt: '+((e&&e.message)||e),'warn'));
  }

  /* De volledige kaart (volledig): alle mode 01-PIDs diep zoeken, de
     merkspecifieke PIDs proberen, mode 06 opnieuw, en de foutcodes als die er
     nog niet waren. Duurt minuten en legt de bus zo lang bezig — daarom
     alleen met toestemming en alleen bij stilstand. Wat een echte ECU met de
     duur doet is een vraag voor een rit (#645). */
  const KAART_MAX_KMH=3;
  function magKaart(kmh){
    if(typeof kmh==='number'&&isFinite(kmh)&&kmh>KAART_MAX_KMH)return {mag:false,waarom:'de auto rijdt ('+Math.round(kmh)+' km/u) — stil laten staan, contact aan'};
    return {mag:true};
  }
  async function answerKaart(m){
    const rid=m.reqId;
    klantLog('de app brengt je auto volledig in kaart voor de expert (enkele minuten) — laat de auto stil staan');
    const u=await volledigeKaart(d=>{sendWs({type:'response',reqId:rid,data:d});klantLog('kaart '+d.nr+'/'+d.van+': '+d.stap);});
    if(u.kaart==='rijdt')klantLog('volledige kaart niet gestart: '+u.err);
    else if(u.kaart==='klaar')klantLog('volledige kaart klaar: '+u.pids+' sensoren in '+Math.round(u.ms/1000)+' s');
    else if(u.kaart==='afgebroken')klantLog('volledige kaart afgebroken');
    sendVState();
    sendWs({type:'response',reqId:rid,data:u});
  }
  function kaartAfbreken(){if(S.kaartBezig){S.kaartAfbreken=true;logA('🗺 Volledige kaart: afbreken na de lopende stap','info');}}
  // De kaart zelf, los van wie erom vroeg: de expert in een sessie, of het
  // inleren bij de eerste koppeling voor een vaste expert (#646).
  async function volledigeKaart(stap){
    if(S.kaartBezig)return {kaart:'bezig'};
    if(!verbondenMetAuto())return {kaart:'niet-verbonden'};
    let kmh=null;try{kmh=(typeof pidVals!=='undefined')?pidVals['010D']:null;}catch(_){ /* stil: onbekend telt als stilstand */ }
    const mk=magKaart(kmh);
    if(!mk.mag)return {kaart:'rijdt',err:mk.waarom};
    S.kaartBezig=true;S.kaartAfbreken=false;
    const t0=Date.now(),fouten=[],perStap=[];
    let voor=0;try{voor=supportedPIDs.size;}catch(_){ /* stil: dan 0 */ }
    const stappen=[
      ['alle sensoren diep zoeken',()=>typeof deepRefreshPIDs==='function'?deepRefreshPIDs():Promise.reject(new Error('niet geladen'))],
      ['merkspecifieke sensoren',()=>window.PLUitgebreid?PLUitgebreid.probe(true):Promise.reject(new Error('niet geladen'))],
      ['monitortests (mode 06)',async()=>{if(!window.PLM06)throw new Error('niet geladen');const r=await PLM06.scan();PLM06.bewaarInSessie(r);}],
      ['foutcodes en zelftests',async()=>{if(heeftScan())return;if(!window.PLFoutcodes)throw new Error('niet geladen');if(!await PLFoutcodes.scan())throw new Error('niet uitgelezen');}]
    ];
    logA('🗺 Volledige kaart gestart','warn');
    try{
      for(let i=0;i<stappen.length;i++){
        // Afbreken kan tussen twee stappen: een lopende stap houdt zelf de bus vast.
        if(S.kaartAfbreken)break;
        try{stap({kaart:'stap',stap:stappen[i][0],nr:i+1,van:stappen.length});}catch(e){console.warn('Voortgang van de kaart niet gemeld',e);}
        const ts=Date.now();let fout=null;
        try{await stappen[i][1]();}catch(e){fout=String((e&&e.message)||e);fouten.push(stappen[i][0]+': '+fout);}
        // De duur per stap gaat mee in het antwoord: dat is wat #648 op een echte bus wil weten.
        perStap.push({stap:stappen[i][0],ms:Date.now()-ts,fout:fout});
      }
    }finally{S.kaartBezig=false;}
    let na=0;try{na=supportedPIDs.size;}catch(_){ /* stil: dan 0 */ }
    const af=S.kaartAfbreken;S.kaartAfbreken=false;
    logA('🗺 Volledige kaart '+(af?'afgebroken':'klaar')+' — '+na+' sensoren, '+Math.round((Date.now()-t0)/1000)+' s ('+perStap.map(x=>x.stap+' '+Math.round(x.ms/100)/10+' s').join(', ')+')'+(fouten.length?' · '+fouten.join('; '):''),fouten.length||af?'warn':'ok');
    return {kaart:af?'afgebroken':'klaar',pids:na,erbij:Math.max(0,na-voor),ms:Date.now()-t0,fouten:fouten,stappen:perStap};
  }

  /* Inleren voor een vaste expert (#646). Heeft de klant een verkoper of
     garage gekoppeld, dan brengt de app de auto bij de eerste verbinding één
     keer volledig in kaart — dan staat alles er al als de klant belt. Per
     auto één keer (pl_ingeleerd); de koppeling zelf staat op de server.
     Niet in demo, niet als expert op afstand, niet rijdend. De sleutel per
     auto is de WMI plus het merk en model: nooit de VIN (§7). */
  const INLEER_SLEUTEL='pl_ingeleerd',INLEER_WACHT_MS=20000;
  const _vast={experts:null,laadt:false,t:null};
  // Lopen de zoekronde of de gezondheidscheck nog? Geteld in hun wrappers onderaan.
  const _bezig={discovery:0,health:0};
  function inleerSleutel(v){
    v=v||{};
    const wmi=String(v.vin||'').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'').slice(0,3);
    const k=[v.merk,v.model,v.year].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean).join('|');
    return k?((wmi.length===3?wmi+'|':'')+k):null;
  }
  // Puur: moet deze auto nog ingeleerd worden?
  function moetInleren(o){
    if(!o||!o.verbonden||o.demo||o.remote||!o.sleutel)return false;
    if(!Array.isArray(o.experts)||!o.experts.length)return false;
    return !(o.gedaan&&o.gedaan[o.sleutel]);
  }
  function inleerGedaan(){try{return JSON.parse(localStorage.getItem(INLEER_SLEUTEL)||'{}')||{};}catch(e){console.warn('Inleerlijst niet te lezen',e);return {};}}
  function inleerMerk(sl){const g=inleerGedaan();g[sl]=new Date().toISOString();try{localStorage.setItem(INLEER_SLEUTEL,JSON.stringify(g));}catch(e){console.warn('Inleren niet bewaard — de volgende verbinding probeert het opnieuw',e);}}
  async function vasteExperts(){
    if(_vast.experts||_vast.laadt)return _vast.experts||[];
    let klant=false;try{klant=!!(window.PLKlant&&PLKlant.isKlant());}catch(_){ /* stil: dan geen klant */ }
    if(!klant||typeof plFetch!=='function')return [];
    _vast.laadt=true;
    try{
      const r=await plFetch('/klant/platform',{method:'POST',json:{actie:'experts'}});
      const d=await r.json();
      // Zonder akkoord op Mijn voertuigen kan er geen koppeling zijn: dan leeg.
      _vast.experts=(r.ok&&d.ok&&Array.isArray(d.experts))?d.experts:[];
    }catch(e){console.warn('Vaste experts niet opgehaald — dan geen inleren deze keer',e);_vast.experts=null;}
    finally{_vast.laadt=false;}
    return _vast.experts||[];
  }
  /* Wanneer mag het inleren beginnen? Pas als de zoekronde en de
     gezondheidscheck klaar zijn: die lopen anders tegelijk de bus op, en een
     trage auto heeft er langer dan INLEER_WACHT_MS voor nodig. Puur. */
  const INLEER_HERHAAL_MS=5000,INLEER_MAX_POGINGEN=60;
  function inleerBusVrij(b){
    if(!b)return true;
    return !(b.discovery>0||b.health>0||b.kaart);
  }
  function inlerenNaVerbinden(ms,poging){
    clearTimeout(_vast.t);
    poging=poging|0;
    _vast.t=setTimeout(async()=>{
      if(!inleerBusVrij({discovery:_bezig.discovery,health:_bezig.health,kaart:S.kaartBezig})){
        if(poging<INLEER_MAX_POGINGEN)inlerenNaVerbinden(INLEER_HERHAAL_MS,poging+1);
        else logA('🗺 Inleren voor de vaste expert niet gestart: de bus bleef bezet (de volgende verbinding probeert het opnieuw)','info');
        return;
      }
      try{
        let demo=false;try{demo=(typeof demoMode!=='undefined')&&!!demoMode;}catch(_){ /* stil: dan geen demo */ }
        let conn=false;try{conn=(typeof connected!=='undefined')&&!!connected;}catch(_){ /* stil: dan niet verbonden */ }
        const sl=inleerSleutel((typeof vehicleInfo!=='undefined'&&vehicleInfo)||{});
        if(!conn||demo||window._remoteVehicleMode||!sl)return;
        const ex=await vasteExperts();
        if(!moetInleren({verbonden:conn,demo:demo,remote:!!window._remoteVehicleMode,sleutel:sl,experts:ex,gedaan:inleerGedaan()}))return;
        const naam=ex.map(e=>e.naam).join(', ');
        try{showToast?.('🗺 PidLane leert je auto kennen voor '+naam+' — enkele minuten, laat de auto stil staan');}catch(_){ /* stil: melding mag nooit de stroom breken */ }
        const pill=d=>{try{if(typeof showBusyPill==='function')showBusyPill('🗺 Je auto leren kennen voor '+naam+' — '+d.nr+'/'+d.van+': '+d.stap,600000,kaartAfbreken);}catch(e){console.warn('Voortgang van het inleren niet getoond',e);}};
        let u;
        try{u=await volledigeKaart(pill);}
        finally{try{if(typeof hideBusyPill==='function')hideBusyPill();}catch(e){console.warn('Voortgang van het inleren niet weggehaald',e);}}
        if(u.kaart==='klaar'){inleerMerk(sl);sendVStateSoon();try{showToast?.('✓ Je auto is ingeleerd voor '+naam+' ('+Math.round(u.ms/1000)+' s)');}catch(_){ /* stil: melding mag nooit de stroom breken */ }}
        else logA('🗺 Inleren voor '+naam+' niet gedaan: '+u.kaart+(u.err?' — '+u.err:'')+' (de volgende verbinding probeert het opnieuw)','info');
      }catch(e){logA('⚠ Inleren voor de vaste expert mislukt: '+((e&&e.message)||e),'warn');}
    },ms==null?INLEER_WACHT_MS:ms);
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
      o.veh=Object.assign({merk:v.merk||'',model:v.model||'',year:v.year||'',brandstof:v.brandstof||'',motor:v.motor||''},_vinVoorExpert(v.vin));}catch(_){ console.warn('Voertuiginfo niet in het vstate-snapshot gezet — de expert ziet dan geen voertuig', _); }
    try{o.active=(typeof activePIDs!=='undefined')?[...activePIDs].slice(0,60):[];}catch(_){ console.warn('Actieve PIDs niet in het vstate-snapshot gezet', _); }
    try{const h={};if(typeof _pidHealth!=='undefined'){for(const k in _pidHealth){if(_pidHealth[k]&&_pidHealth[k]!=='ok')h[k]=_pidHealth[k];}}o.health=h;}catch(_){ console.warn('Sensor-gezondheid niet in het vstate-snapshot gezet', _); }
    try{o.dtc=(typeof dtcCodes!=='undefined'&&Array.isArray(dtcCodes))?dtcCodes.slice(0,40):[];}catch(_){ console.warn('Foutcodes niet in het vstate-snapshot gezet', _); }
    try{o.demo=(typeof demoMode!=='undefined')&&!!demoMode;}catch(_){ console.warn('Demo-vlag niet in het vstate-snapshot gezet', _); }
    try{o.rps=(typeof _connSpeed!=='undefined'&&_connSpeed&&_connSpeed.readsPerSec)||null;}catch(_){ console.warn('Leessnelheid niet in het vstate-snapshot gezet', _); }
    // Wat de app al wist over deze auto (pidlane-voorkennis.js): de expert
    // begint niet bij nul. Geen VIN, geen rapporttekst — alleen titels.
    try{if(window.PLVoorkennis)o.voorkennis=PLVoorkennis.uitApp();}catch(_){ console.warn('Voorkennis niet in het vstate-snapshot gezet — de expert ziet dan alleen het nu', _); }
    // #645: de foutcodecheck (alle drie de soorten, zelftests, freeze frame,
    // km sinds wissen). Die zette dtcCodes niet, dus de expert zag na een
    // geslaagde check "geen foutcodes".
    try{if(window.PLFoutcodes&&PLFoutcodes.staat)o.scan=scanVoorExpert((PLFoutcodes.staat()||{}).scan);}catch(_){ console.warn('Foutcodecheck niet in het vstate-snapshot gezet', _); }
    if(o.scan){const c=o.scan.codes,al=new Set(o.dtc||[]);
      c.bevestigd.concat(c.permanent).forEach(x=>{if(!al.has(x)&&al.size<40){al.add(x);}});o.dtc=[...al];}
    return vstateBinnenGrens(o,VSTATE_GRENS);
  }
  // Puur: het deel van PLFoutcodes.staat().scan dat de expert nodig heeft.
  // Alles begrensd; wat van de ECU komt is hier al geparst.
  function scanVoorExpert(s){
    if(!s||typeof s!=='object')return null;
    const lijst=(a,n)=>(Array.isArray(a)?a:[]).slice(0,n||20).map(x=>String(x).replace(/[^0-9A-Za-z ]/g,'').slice(0,40));
    const num=v=>(typeof v==='number'&&isFinite(v))?v:null;
    const c=s.codes||{},g=s.gelezen||{},rd=s.readiness,f=s.freeze;
    const ff={};
    if(f&&f.waarden)Object.keys(f.waarden).slice(0,12).forEach(k=>{const v=num(f.waarden[k]);if(v!==null&&/^[0-9A-F]{4}$/i.test(k))ff[k.toUpperCase()]=v;});
    return {t:num(s.tijd),
      codes:{bevestigd:lijst(c.bevestigd),pending:lijst(c.pending),permanent:lijst(c.permanent)},
      gelezen:{bevestigd:g.bevestigd===true,pending:g.pending===true,permanent:g.permanent===true},
      readiness:rd&&typeof rd==='object'?{mil:!!rd.mil,aantal:num(rd.aantal),ondersteund:num(rd.ondersteund),nietKlaar:lijst(rd.nietKlaar,12)}:null,
      sinds:{km:num(s.sinds&&s.sinds.km),milKm:num(s.sinds&&s.sinds.milKm)},
      freeze:f?{code:String(f.code||'').replace(/[^0-9A-Za-z]/g,'').slice(0,8),waarden:ff}:null};
  }
  /* Puur: de Durable Object weigert een vstate boven 32 KB (VSTATE_MAX in
     worker.js). Tot #645 deed hij dat zonder bericht. Hier blijft hij eronder,
     en wat eraf moest staat in o.ingekort — zodat de expert weet dat hij niet
     alles ziet. Eerst wat het minst zegt: de lange PID-lijst, dan de
     rapporttitels, dan de bekende zwakke punten, als laatste de voorkennis. */
  const VSTATE_GRENS=30000;
  function vstateBinnenGrens(o,grens){
    const lengte=x=>{try{return JSON.stringify(x).length;}catch(_){return Infinity;}};
    if(lengte(o)<=grens)return o;
    const uit=Object.assign({},o),weg=[];
    if(Array.isArray(uit.pids)&&uit.pids.length>120){uit.pids=uit.pids.slice(0,120);weg.push('sensorlijst');}
    if(lengte(uit)>grens&&uit.voorkennis&&typeof uit.voorkennis==='object'){
      const vk=Object.assign({},uit.voorkennis);uit.voorkennis=vk;
      if(Array.isArray(vk.rapporten)&&vk.rapporten.length){vk.rapporten=[];weg.push('rapporttitels');}
      if(lengte(uit)>grens&&Array.isArray(vk.bekend)&&vk.bekend.length){vk.bekend=[];weg.push('bekende zwakke punten');}
      if(lengte(uit)>grens){delete uit.voorkennis;weg.push('voorkennis');}
    }
    if(lengte(uit)>grens&&uit.health){uit.health={};weg.push('sensorgezondheid');}
    uit.ingekort=weg;
    return uit;
  }
  /* De VIN gaat nooit ruw de telefoon uit (§7). Tot 17-10-2026 deed hij dat
     hier wél: vstate ging met de volle VIN naar de Worker, die hem in de
     Durable Object-opslag bewaarde en aan elke expert doorgaf. Nu gaan alleen
     de WMI (fabrikantcode, zegt niets over één auto) en het pseudoniem van
     _vlVinPseudoniem() mee. Dat is async en buildVState niet: het pseudoniem
     wordt één keer berekend en daarna volgt een nieuwe vstate. Tot dan gaat
     alleen de WMI mee — nooit de ruwe VIN. */
  let _vinPs={vin:'',ps:null};
  function _vinVoorExpert(ruw){
    const vin=String(ruw||'').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'');
    if(!vin)return{wmi:'',vin_pseudo:null};
    if(_vinPs.vin!==vin){
      _vinPs={vin:vin,ps:null};
      if(typeof _vlVinPseudoniem==='function'){
        _vlVinPseudoniem(vin).then(ps=>{if(_vinPs.vin===vin&&ps){_vinPs.ps=ps;sendVStateSoon();}})
          .catch(e=>console.warn('VIN-pseudoniem voor de expert niet berekend — alleen de WMI gaat mee',e));
      }
    }
    return{wmi:vin.slice(0,3),vin_pseudo:_vinPs.ps};
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
        // #602 punt 4: ook volle sleutels (CA.., TL.., mode 21) — remPid() maakt
        // van een kale 2-hex mode 01 en laat de rest zoals hij is.
        const sfx=[...new Set((m.pids||[]).map(remPid).filter(Boolean))].slice(0,24);
        const wens=sfx.length?sfx:[...(activePIDs||[])];
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
  // #602 punt 2: PLBus.wait() geeft 0 na de time-out en "gaat tóch door" —
  // goed voor de eigen app, niet voor een verzoek van buiten. Dan liepen een
  // expert-one-shot en de poll-ronde door elkaar op de bus. Remote mag falen:
  // de expert ziet "niet gelezen", de klant houdt een schone meetronde.
  async function withBtLock(fn){
    const tok=await PLBus.wait('remote',5000);
    if(!tok)throw new Error('bus bezet — probeer het zo opnieuw');
    try{return await fn();}finally{ PLBus.release(tok); }
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
  // "Niet gelezen" is iets anders dan "geen codes" (24-10-2026). Tot dan
  // stuurde een niet-verbonden of mislukte uitlezing [] terug, en de expert
  // zag "Geen foutcodes — alle systemen OK".
  async function answerDtc(m){
    let codes=null,err='';
    try{
      if(typeof demoMode!=='undefined'&&demoMode){codes=(typeof dtcCodes!=='undefined'&&dtcCodes&&dtcCodes.length)?[...dtcCodes]:[];}
      else if(typeof connected!=='undefined'&&connected&&typeof realScanDTC==='function'){codes=await withBtLock(()=>realScanDTC());}
      else err='telefoon niet verbonden met de auto';
    }catch(e){codes=null;err='uitlezen mislukt: '+String((e&&e.message)||e);}
    if(!Array.isArray(codes)){
      sendWs({type:'response',reqId:m.reqId,data:{dtc:null,err:err||'geen antwoord van de auto'}});
      logA('🔭 Expert vroeg foutcodes — niet gelezen ('+(err||'geen antwoord')+')','warn');
      return;
    }
    sendWs({type:'response',reqId:m.reqId,data:{dtc:codes}});
    sendVStateSoon();   // nieuwe codes → de voorkennis van de expert schuift mee
    logA('🔭 Expert las foutcodes uit ('+codes.length+' code'+(codes.length===1?'':'s')+')','info');
  }
  function sendWs(o){try{if(S.ws&&S.ws.readyState===1)S.ws.send(JSON.stringify(o));}catch(_){ console.warn('Bericht niet naar de expert verstuurd', _); }}
  // Telemetrie draagt de VOLLEDIGE PID-sleutel (24-10-2026). Tot dan ging
  // alleen het achtervoegsel mee en plakte de expert er '01' voor: op de CX-5
  // werd mode-21 '210C'/'210D' (klep timing, rauw) zo 010C/010D en overschreef
  // toerental en snelheid bij de expert. Zie remPid() voor de ontvangstkant.
  // Zelfde lot voor berekende (CA05 → 0105 koelwater) en telefoonsensoren
  // (TL01 → 0101): ook die gaan nu met hun eigen sleutel.
  function remSleutel(pid){
    const k=String(pid==null?'':pid).toUpperCase();
    return /^[0-9A-Z]{4,8}$/.test(k)?k:null;
  }
  // Ontvangstkant: een kale 2-hex-sleutel is mode 01 (oude local, en de
  // antwoorden op request-pids); een volle sleutel blijft wat hij is.
  function remPid(k){
    const s=String(k==null?'':k).toUpperCase();
    if(/^[0-9A-F]{2}$/.test(s))return '01'+s;
    return /^[0-9A-Z]{4,8}$/.test(s)?s:null;
  }
  function feed(pid,val){
    if(S.mode!=='local'||!S.ws||S.ws.readyState!==1)return;
    if(typeof val!=='number'||!isFinite(val))return;
    const k=remSleutel(pid);if(!k)return;
    S.dirty[k]=Math.round(val*100)/100;
  }
  function startFlush(){stopFlush();S.flushT=setInterval(()=>{
    if(S.mode!=='local'||!S.ws||S.ws.readyState!==1)return;
    const k=Object.keys(S.dirty);if(!k.length)return;
    const d=S.dirty;S.dirty={};d.t=Date.now();
    sendWs({type:'telemetry',data:d});
    for(const kk of k)K.waarden[kk]=d[kk];K.laatsteT=d.t;
  },250);}
  function stopFlush(){if(S.flushT){clearInterval(S.flushT);S.flushT=null;}}
  async function shareStop(){
    S.stopFlag=true;clearTimeout(S.recT);stopFlush();
    clearInterval(_remRecStatT);_remRecStatT=null;
    expertPollAfmelden();
    try{if(S.sess)await plFetch('/session/close',{method:'POST',
      json:{sessionId:S.sess.sessionId}});}catch(_){ logA('Sessie niet netjes gesloten op de server — kan daar nog even actief blijven voor de expert','warn'); }
    try{if(S.ws)S.ws.close();}catch(_){ /* stil: opruimen: kan al gebeurd zijn */ }
    endShareUi();logA('📡 Delen gestopt','info');
    try{logUsage('remote_share_stop',(S.sess&&S.sess.sessionId)||'');}catch(_){ console.warn('Gebruiksstatistiek remote_share_stop niet gelogd', _); }
  }
  function endShareUi(){S.mode=null;S.ws=null;showPill(false);klantDicht();K.verborgen=false;K.log=[];K.waarden={};K.laatsteT=0;
    K.vraag=null;K.vast=null;S.niveau='basis';S.blijvend=false;
    $('remShareOn').style.display='none';$('remShareOff').style.display='';$('remShareErr').textContent='';
    try{$('remQr').innerHTML='';}catch(_){ /* stil: element kan al weg zijn */ }
    try{$('remShort').value='';$('remShort').placeholder='··· ··· ····';}catch(_){ /* stil: element kan al weg zijn */ }}

  /* ── KLANT-MEEKIJKSCHERM (24-10-2026) ─────────────────────────────
     Zodra er een expert meekijkt, ziet de klant wat er gebeurt: of zijn
     telefoon live data levert, welke waarden er naar de expert gaan en wat de
     expert opvraagt. Twee redenen. (1) De telefoon ís de meetbron: gaat de app
     naar de achtergrond, dan knijpt Android de meetlus af en ziet de expert
     niets meer — open laten staan is dus de beste hulp die de klant kan geven.
     (2) Het is andermans auto: wie meekijkt en wat hij doet hoort zichtbaar
     te zijn. Verbergen mag; de pill brengt het scherm terug. */
  const K={log:[],waarden:{},laatsteT:0,verborgen:false,t:null,wegT:0,vraag:null,vast:null};
  // Puur: één expert-verzoek als zin voor de klant, of null.
  function klantActie(m){
    if(!m||typeof m!=='object')return null;
    const lijst=a=>(Array.isArray(a)?a:[]).slice(0,8).map(x=>String(x).replace(/[^0-9A-Za-z]/g,'')).join(' ');
    switch(m.type){
      case 'request-pids': return 'vraagt waarden op: '+lijst(m.pids);
      case 'request-poll': return 'laat meten: '+lijst(m.pids);
      case 'request-dtc': return 'leest de foutcodes uit';
      case 'request-record':
        if(m.action==='start')return 'start een opname';
        if(m.action==='stop')return 'stopt de opname';
        if(m.action==='csv')return 'downloadt de opname';
        return null;
      case 'request-analyze': return 'vraagt een AI-analyse van de opname — dit gebruikt jouw tegoed';
      case 'request-rapport': return 'leest een eerder rapport';
      case 'request-snelscan': return 'vraagt een snelle scan: foutcodes, zelftests en monitortests';
      case 'request-kaart': return 'brengt je auto volledig in kaart';
      case 'request-toestemming': return 'vraagt volledige toegang';
      default: return null;
    }
  }
  // Puur: hoe staat de levering ervoor? soort: ok | wacht | stil | geen-auto
  function klantStatus(nu,laatsteT,verbonden){
    if(!verbonden)return {soort:'geen-auto',tekst:'Je telefoon is niet verbonden met de auto — de expert krijgt geen nieuwe waarden.'};
    if(!laatsteT)return {soort:'wacht',tekst:'Wacht op de eerste meting…'};
    const sec=Math.max(0,Math.round((nu-laatsteT)/1000));
    if(sec>5)return {soort:'stil',tekst:'Al '+sec+' s geen meting verstuurd — laat de app open en dichtbij de adapter.'};
    return {soort:'ok',tekst:'Live: je telefoon stuurt meetwaarden naar de expert.'};
  }
  // Puur: de inhoud van het scherm. Alles wat van buiten komt gaat door esc().
  function klantHtml(st){
    const kleur={ok:'var(--gn,#3ecf8e)',wacht:'var(--tx3,#9aa4b2)',stil:'var(--or,#f5a524)','geen-auto':'var(--rd,#ef5350)'}[st.status.soort]||'inherit';
    const rijen=st.waarden.slice(0,12).map(w=>'<div class="rem-klant-w"><span>'+esc(w.naam)+'</span><b>'+esc(w.waarde)+(w.eenheid?' <small>'+esc(w.eenheid)+'</small>':'')+'</b></div>').join('');
    const acties=st.log.map(l=>'<div class="rem-klant-l"><span>'+esc(l.tijd)+'</span> '+esc(l.tekst)+'</div>').join('');
    return klantVraagHtml(st.vraag)+'<div class="rem-h"><h3>👁 '+(st.n===1?'Een expert kijkt mee':esc(st.n)+' experts kijken mee')+'</h3><button class="rem-x" onclick="PLRemote.klantVerberg()" title="Verbergen — de pill bovenin brengt dit scherm terug">✕</button></div>'
      +'<div class="rem-klant-st" style="border-color:'+kleur+'"><span class="rem-klant-dot" style="background:'+kleur+'"></span>'+esc(st.status.tekst)+'</div>'
      +klantNiveauHtml(st.niveau,st.blijvend,st.vast)
      +'<div class="rem-lbl" style="margin-top:12px">Wat de expert ziet</div>'
      +(rijen||'<div class="rem-stat">Nog geen waarden verstuurd.</div>')
      +'<div class="rem-lbl" style="margin-top:12px">Wat de expert doet</div>'
      +(acties||'<div class="rem-stat">Nog niets opgevraagd. De expert kan alleen lezen; op afstand verandert er niets aan de auto.</div>')
      +'<p class="rem-stat" style="margin-top:12px">Laat dit scherm open staan: gaat de app naar de achtergrond, dan stopt de live data voor de expert.</p>'
      +'<div class="rem-flex" style="margin-top:8px"><button class="rem-btn" style="flex:1" onclick="PLRemote.klantVerberg()">Verberg</button><button class="rem-btn danger" style="flex:1" onclick="PLRemote.shareStop()">Stop delen</button></div>';
  }
  // Puur (#645): de vraag om volledige toegang, met wat dat inhoudt.
  function klantVraagHtml(v){
    if(!v)return '';
    return '<div class="rem-klant-vraag" id="remKlantVraag" role="alertdialog" aria-label="De expert vraagt volledige toegang">'
      +'<h3>🔓 De expert vraagt volledige toegang</h3>'
      +(v.reden?'<p class="rem-stat">„'+esc(v.reden)+'”</p>':'')
      +'<p class="rem-stat">Daarmee kan de expert ook:</p><ul class="rem-stat">'
      +'<li>een opname maken van je sensoren;</li>'
      +'<li>een AI-analyse laten doen — dat gebruikt <b>jouw tegoed</b>;</li>'
      +'<li>je auto volledig in kaart brengen: enkele minuten, de auto staat stil met het contact aan.</li></ul>'
      +'<p class="rem-stat">Foutcodes wissen of iets aan de auto veranderen kan ook dan niet.</p>'
      +'<label class="rem-stat"><input type="checkbox" id="remKlantBlijvend"> Tot ik stop met delen (anders vervalt het bij een verbindingsprobleem)</label>'
      +'<div class="rem-flex" style="margin-top:8px"><button class="rem-btn" style="flex:1" onclick="PLRemote.toestemmingAntwoord(false)">Weigeren</button><button class="rem-btn pri" style="flex:1" onclick="PLRemote.toestemmingAntwoord(true)">Toestaan</button></div>'
      +'</div>';
  }
  // Puur (#645): welk niveau de expert nu heeft.
  function klantNiveauHtml(niveau,blijvend,vast){
    if(vast)return '<div class="rem-stat rem-klant-niveau">🔓 Vaste toegang voor '+esc(vast.naam)+' — tot je de koppeling intrekt'
      +' <button class="rem-btn danger" onclick="PLRemote.vastIntrekken()">Koppeling intrekken</button></div>';
    if(niveau==='volledig')return '<div class="rem-stat rem-klant-niveau">🔓 Volledige toegang'+(blijvend?' — tot je stopt met delen':' — vervalt bij een verbindingsprobleem')
      +' <button class="rem-btn" onclick="PLRemote.terugNaarBasis()">Terug naar basis</button></div>';
    return '<div class="rem-stat rem-klant-niveau">🔒 Basistoegang: meekijken, waarden en foutcodes lezen, snelle scan</div>';
  }
  function klantLog(tekst){
    K.log.unshift({tijd:new Date().toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}),tekst:String(tekst)});
    if(K.log.length>8)K.log.length=8;
    klantTeken();
  }
  function klantWaarden(){
    return Object.keys(K.waarden).sort().map(k=>{
      let naam=k,eenheid='';
      try{const d=(typeof getPidDef==='function')?getPidDef(k):null;if(d){naam=d.n||d.name||k;eenheid=d.u||d.unit||'';}}catch(_){ /* stil: dan de sleutel als naam */ }
      return {naam:naam,waarde:K.waarden[k],eenheid:eenheid};
    });
  }
  function klantOpen(){return !!($('remKlantOv')&&$('remKlantOv').classList.contains('open'));}
  function klantTeken(){
    if(!klantOpen())return;
    let verbonden=false;
    try{verbonden=(typeof connected!=='undefined'&&connected)||(typeof demoMode!=='undefined'&&demoMode);}catch(_){ /* stil: dan "niet verbonden" */ }
    const c=$('remKlantCard');if(!c)return;
    // De open vraag niet elke seconde hertekenen: dan springt het vinkje terug.
    const vink=$('remKlantBlijvend'),aan=!!(vink&&vink.checked);
    c.innerHTML=klantHtml({n:S.lastExpN|0,status:klantStatus(Date.now(),K.laatsteT,verbonden),waarden:klantWaarden(),log:K.log,
      niveau:S.niveau,blijvend:S.blijvend,vraag:K.vraag,vast:K.vast});
    if(aan){const v2=$('remKlantBlijvend');if(v2)v2.checked=true;}
  }
  function klantToon(){
    const ov=$('remKlantOv');if(!ov)return;
    K.verborgen=false;ov.classList.add('open');klantTeken();
    clearInterval(K.t);K.t=setInterval(klantTeken,1000);
  }
  function klantDicht(){const ov=$('remKlantOv');if(ov)ov.classList.remove('open');clearInterval(K.t);K.t=null;}
  function klantVerberg(){K.verborgen=true;klantDicht();}
  function klantPresence(n,was){
    if(n>was){klantLog(n>1?'nog een expert kijkt mee':'een expert kijkt nu mee');if(!K.verborgen)klantToon();}
    else if(n<was){klantLog(n?'een expert is weg':'de expert is weg');if(!n){klantDicht();K.verborgen=false;}}
  }
  // De pill: kijkt er iemand mee, dan het meekijkscherm; anders het deelvenster.
  function pillTik(){ if(S.mode==='local'&&(S.lastExpN|0)>0)klantToon(); else openShare(); }
  try{ // achtergrond: de klant ziet achteraf hoe lang de expert niets kreeg
    document.addEventListener('visibilitychange',()=>{
      if(S.mode!=='local'||!(S.lastExpN>0))return;
      if(document.hidden){K.wegT=Date.now();return;}
      if(K.wegT){const sec=Math.round((Date.now()-K.wegT)/1000);K.wegT=0;
        if(sec>=3){klantLog('de app stond '+sec+' s op de achtergrond — de expert kreeg toen geen live data');
          logA('📡 App stond '+sec+' s op de achtergrond tijdens het delen — de expert kreeg toen geen live data','warn');}}
    });
  }catch(_){ console.warn('Achtergrondmelding voor het delen niet geïnstalleerd', _); }

  /* ── EXPERT: meekijken ────────────────────────────────────────── */
  function openExpert(){$('remExpertOv').classList.add('open');werkplek();}
  // De werkplek van de expert op een laptop (pidlane-expertwerk.js, 18-10-2026).
  function werkplek(){try{if(window.PLExpertWerk)PLExpertWerk.toon(S.vstate,S.expMeta);}catch(_){ console.warn('Expertwerkplek niet getekend — het gewone meekijkvenster blijft', _); }}
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
    S.lastFrameT=0;S.stilSt=null;clearInterval(S.stilT);S.stilT=setInterval(versheid,2000);
    err.textContent='Verbinden…';
    openExpertWs();
  }
  // Versheid (24-10-2026). De local stuurt alleen een frame als er gemeten
  // wordt; stopt dat (app naar de achtergrond, BT weg, telefoon dicht), dan
  // bleven de meters bij de expert stil op de laatste waarde staan alsof alles
  // live was. Nu: na STIL_MS zonder frame zegt de pill en de status dat.
  const STIL_MS=6000;
  function stilOordeel(nu,laatste,open){
    if(!open)return null;
    if(!laatste)return 'wacht';
    return (nu-laatste)>STIL_MS?'stil':'live';
  }
  // Puur (#648): wat de expert ziet als er geen live data komt. Tijdens de
  // volledige kaart is dat verwacht — de kaart houdt de bus vast — en geen alarm.
  function stilTekst(sec,kaartLoopt){
    if(kaartLoopt)return '⏸ Volledige kaart bezig — live data gepauzeerd ('+sec+' s), hij komt terug als de kaart klaar is.';
    return '⏸ Geen live data van de telefoon sinds '+sec+' s — app op de achtergrond of adapter weg? Getoonde waarden zijn oud.';
  }
  function versheid(){
    const st=stilOordeel(Date.now(),S.lastFrameT,!!(S.ews&&S.ews.readyState===1));
    if(st===S.stilSt)return;
    const was=S.stilSt;S.stilSt=st;
    const p=$('remDrivePill');
    const basis='🔭 remote · '+((S.expJoin&&S.expJoin.sid)||'');
    if(st==='stil'){
      const sec=Math.round((Date.now()-S.lastFrameT)/1000);
      if(p)p.textContent=basis+' · ⏸ geen live data';
      setExpStat(stilTekst(sec,!!S.expKaart));
      expLog(S.expKaart?'⏸ live data gepauzeerd tijdens de kaart':'⏸ live data gestopt');
      if(!S.expKaart)logA('🔭 Geen live data meer van de telefoon — getoonde waarden zijn niet actueel','warn');
    }else if(st==='live'){
      if(p)p.textContent=basis;
      if(was==='stil'){setExpStat('✅ Live data loopt weer');expLog('▶ live data hervat');logA('🔭 Live data van de telefoon loopt weer','ok');}
    }
  }
  function openExpertWs(){
    const j=S.expJoin;if(!j)return;
    let ws;
    try{ws=new WebSocket(wb()+'/session/connect?id='+encodeURIComponent(j.sid)+'&jt='+encodeURIComponent(j.jt));}
    catch(e){$('remExpErr').textContent='⚠ '+(e.message||e);return;}
    S.ews=ws;
    ws.onopen=()=>{S.backoffE=1000;$('remExpErr').textContent='';
      if(!S.lastFrameT)S.lastFrameT=Date.now(); // ijkpunt: ook "nooit iets ontvangen" wordt na STIL_MS gemeld
      $('remExpConn').style.display='none';$('remExpLive').style.display='';
      setExpStat('✅ Live verbonden — sessie '+j.sid);
      // #646: laat de eigen sessie zien; is dit de vaste expert van de klant,
      // dan geeft de Worker volledige toegang. Anders verandert er niets.
      if(tok())try{ws.send(JSON.stringify({type:'identiteit',token:tok()}));}catch(e){console.warn('Identiteit niet naar de sessie gestuurd',e);}};
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
    if(m.type==='identiteit')return;
    if(m.type==='toestemming'){S.expNiveau=m.niveau==='volledig'?'volledig':'basis';S.expBlijvend=!!m.blijvend;S.expVast=m.vast===true?String(m.naam||''):(m.vast===false?null:S.expVast);
      expLog(S.expVast!=null?'🔓 Vaste toegang: je bent de gekoppelde expert van deze klant':S.expNiveau==='volledig'?('🔓 Volledige toegang van de klant'+(S.expBlijvend?' (tot hij stopt met delen)':'')):'🔒 Toegang staat op basis');
      toegangTeken();return;}
    if(m.type==='meta'){S.expMeta=m.meta;
      S.expNiveau=(m.meta&&m.meta.niveau)||null;S.expBlijvend=!!(m.meta&&m.meta.blijvend);toegangTeken();
      setExpStat('✅ Live — '+(m.meta.vehicle||'voertuig onbekend')+' · gedeeld door '+(m.meta.ownerLabel||m.meta.owner));werkplek();return;}
    if(m.type==='backfill'){(m.frames||[]).forEach(f=>{mergeVals(f&&f.data);driveFeed(f&&f.data,true);});renderTiles();
      expLog('↺ '+((m.frames||[]).length)+' frame(s) historie ontvangen');return;}
    if(m.type==='frame'){S.lastFrameT=Date.now();mergeVals(m.frame&&m.frame.data);driveFeed(m.frame&&m.frame.data);renderTiles();versheid();return;}
    if(m.type==='vstate'){S.vstate=m.data||null;
      if(window._remoteVehicleMode)applyVState(S.vstate);
      try{const el=$('remVoorkennis');if(el&&window.PLVoorkennis)el.innerHTML=PLVoorkennis.html(S.vstate&&S.vstate.voorkennis,{knop:true});}catch(_){ console.warn('Voorkennis niet getoond aan de expert', _); }
      werkplek();toegangTeken();
      if(S.vstate&&Array.isArray(S.vstate.ingekort)&&S.vstate.ingekort.length)expLog('⚠ Profiel ingekort om onder de servergrens te blijven: '+S.vstate.ingekort.join(', '));
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
      if(d.geweigerd==='geen_toestemming')expLog('🔒 Hiervoor is volledige toegang nodig — vraag de klant erom');
      if(d.toestemming!==undefined)expLog(d.toestemming==='gegeven'?'🔓 De klant gaf volledige toegang':d.toestemming==='geweigerd'?'🔒 De klant weigerde volledige toegang':'🔓 Volledige toegang stond al aan');
      if(d.snelscan!==undefined)expLog('🔍 Snelle scan: '+({klaar:'klaar',bezig:'loopt al','niet-verbonden':'telefoon niet verbonden met de auto',mislukt:'mislukt'}[d.snelscan]||d.snelscan)
        +(Array.isArray(d.fouten)&&d.fouten.length?' — '+d.fouten.join('; '):''));
      if(d.kaart!==undefined){
        S.expKaart=d.kaart==='stap';
        if(d.kaart==='stap')expLog('🗺 '+(d.nr|0)+'/'+(d.van|0)+' '+(d.stap||''));
        else if(d.kaart==='klaar')expLog('🗺 Volledige kaart klaar in '+Math.round((d.ms|0)/1000)+' s: '+(d.pids|0)+' sensoren (+'+(d.erbij|0)+')'+(Array.isArray(d.fouten)&&d.fouten.length?' — '+d.fouten.join('; '):''));
        else expLog('🗺 Volledige kaart: '+d.kaart+(d.err?' — '+d.err:''));
      }
      if(d.csvChunk!==undefined){S.csvBuf=(S.csvBuf||'')+d.csvChunk;if((d.chunk|0)===(d.chunks|0))_csvDone();}
      if(d.analysisBusy){expLog('⏳ Local draait AI-analyse van de opname…');}
      if(d.analysis){const o=$('remRecOut');
        if(o)o.innerHTML='<div style="background:#0c1018;border:1px solid #232c40;border-radius:8px;padding:10px;font-size:12px;line-height:1.55;white-space:pre-wrap;max-height:40vh;overflow-y:auto">'+esc(d.analysis)+'</div>';
        expLog('🤖 AI-analyse ontvangen van de local');}
      if(d.analysis===null&&d.err){const o=$('remRecOut');if(o)o.innerHTML='<div class="rem-stat">✖ '+esc(d.err)+'</div>';expLog('✖ analyse: '+d.err);}
      if(d.rapport!==undefined){const o=$('remRecOut');const r=d.rapport;
        if(o)o.innerHTML=r?('<div style="background:#0c1018;border:1px solid #232c40;border-radius:8px;padding:10px;font-size:12px;line-height:1.55;white-space:pre-wrap;max-height:40vh;overflow-y:auto"><b>'+esc(r.title||'')+'</b>\n'+esc(r.text||'')+'</div>'):'<div class="rem-stat">✖ rapport niet gevonden op de local</div>';
        expLog(r?('📄 Rapport ontvangen: '+(r.title||'')):'✖ rapport niet gevonden');}
      if(('dtc' in d)&&m.reqId&&S.pending[m.reqId]){const f=S.pending[m.reqId];delete S.pending[m.reqId];
        f(Array.isArray(d.dtc)?[...d.dtc]:null,d.err||'geen antwoord van de telefoon');}
      if(('dtc' in d)&&!Array.isArray(d.dtc))expLog('✖ Foutcodes niet gelezen: '+(d.err||'onbekend'));
      if(d.pids){mergeVals(d.pids);driveFeed(d.pids);renderTiles();
        expLog('✔ Antwoord: '+Object.entries(d.pids).map(([k,v])=>k+'='+(v==null?'—':v)).join('  '));}
      if(d.dtc)expLog(d.dtc.length?('⚠ Foutcodes: '+d.dtc.join(', ')):'✅ Geen foutcodes aanwezig');
      return;}
    if(m.type==='request-sent'){return;}
    if(m.type==='request-rejected'){
      expLog(m.reason==='geen_toestemming'?'🔒 Geweigerd door de server: hiervoor is volledige toegang nodig — vraag de klant erom':('✖ geweigerd: '+(m.reason||'onbekend')));return;}
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
      const pid=remPid(k);
      if(!pid)continue;
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
      // Geen VIN meer van de local (17-10-2026): alleen WMI en pseudoniem.
      // Die gaan niet in vehicleInfo.vin — een pseudoniem is geen VIN, en een
      // tweede keer pseudonimiseren gaf een ander id dan dat van de klant.
      if(v.veh&&(v.veh.merk||v.veh.wmi)){
        const veh=Object.assign({},v.veh);delete veh.vin;
        try{mergeVehicleData('vin',veh);}catch(_){ console.warn('Voertuigdata van de local niet overgenomen', _); }
        try{const lbl=((vehicleInfo.merk||'')+' '+(vehicleInfo.model||'')).trim();
            showVtag(lbl||'Remote voertuig');}catch(_){ console.warn('Voertuigtag niet bijgewerkt', _); }
      }
      if(v.health&&typeof v.health==='object'){try{for(const k in v.health)_pidHealth[k]=v.health[k];}catch(_){ console.warn('Sensor-gezondheid van de local niet overgenomen', _); }}
      if(Array.isArray(v.pids)&&v.pids.length){
        // #645: ook mode 21/22 en merkspecifiek — tot dan vielen die hier weg.
        try{supportedPIDs=new Set(v.pids.filter(p=>typeof p==='string'&&!!remSleutel(p)).map(p=>p.toUpperCase()));}catch(_){ logA('Ondersteunde PIDs van de local niet overgenomen — de PID-keuzelijst kan leeg of verouderd blijven op deze expert-instantie: '+(_&&_.message||_),'warn'); }
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
  // Puur: welke sleutels de expert de local laat meten. Mode 01 als kaal
  // achtervoegsel (dat begrijpt elke local), de rest met de volle sleutel
  // (#645; een local van vóór 29-10 laat die vallen, er wordt niets verkeerds gemeten).
  function pollSleutels(list){
    return [...new Set((list||[]).map(p=>{const k=String(p==null?'':p).toUpperCase();
      return /^01[0-9A-F]{2}$/.test(k)?k.slice(2):remSleutel(k);}).filter(Boolean))].slice(0,24);
  }
  function remPollActive(){
    if(!window._remoteVehicleMode||!S.ews||S.ews.readyState!==1)return;
    clearTimeout(_rpaT);
    _rpaT=setTimeout(()=>{
      try{
        const sfx=pollSleutels([...(activePIDs||[])]);
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
    try{if(demoMode) plDemoStop(); connected=true;demoMode=false;}catch(_){ console.warn('Verbindingsstatus niet op actief gezet voor remote-modus', _); }
    try{setConn(true);}catch(_){ console.warn('Verbindingsindicator niet bijgewerkt voor remote-modus', _); }
    try{document.getElementById('connOv').classList.add('hidden');}catch(_){ /* stil: element kan al weg zijn */ }
    try{if(typeof goHome==='function')goHome();}catch(_){ console.warn('Niet naar het beginscherm genavigeerd bij het starten van remote-modus', _); }
    expertClose();
    const p=$('remDrivePill');if(p){p.style.display='flex';
      p.textContent='🔭 remote · '+((S.expJoin&&S.expJoin.sid)||'');}
    S.stilSt=null; // pill opnieuw laten beoordelen bij de volgende tik
    // Remote sessie = analyse-klaar: geen BT-gate ('Check connectie') meer.
    window._connReady=true;
    try{updateConnGate();}catch(_){ console.warn('Verbindingspoort niet bijgewerkt bij het starten van remote-modus', _); }
    // Voertuigprofiel van de local toepassen (of alsnog opvragen).
    if(S.vstate)applyVState(S.vstate);
    else if(S.ews&&S.ews.readyState===1)S.ews.send(JSON.stringify({type:'request-vstate',reqId:_rid()}));
    // Laatst ontvangen live-waarden meteen de meters/pijplijn in.
    try{for(const k in S.vals){const vv=S.vals[k];if(typeof vv==='number')updPID(k,vv);}}catch(_){ console.warn('Laatst bekende waarden niet meteen in de meters gezet', _); }
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
      const pid=remPid(k);
      if(pid&&typeof v==='number'&&isFinite(v))S.vals[pid]=v;}}
  function pidName(pid){
    const sfx=pid;
    try{const d=(typeof getPidDef==='function')?getPidDef(pid):null;
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
  function reqRapport(id){if(S.ews&&S.ews.readyState===1&&/^sr\d+_\d+$/.test(String(id||'')))
    S.ews.send(JSON.stringify({type:'request-rapport',id:String(id),reqId:Math.random().toString(36).slice(2,8)}));}
  // #645: toegang en de twee scans, vanaf de kant van de expert.
  function stuurE(o){if(S.ews&&S.ews.readyState===1){S.ews.send(JSON.stringify(Object.assign({reqId:Math.random().toString(36).slice(2,8)},o)));return true;}return false;}
  function reqSnelscan(){if(stuurE({type:'request-snelscan'}))expLog('🔍 Snelle scan gevraagd');}
  function reqKaart(){if(stuurE({type:'request-kaart'}))expLog('🗺 Volledige kaart gevraagd — de klant laat de auto stil staan');}
  function reqToestemming(){
    const reden=String((($('remToegangReden')||{}).value)||'').trim().slice(0,200);
    if(stuurE({type:'request-toestemming',niveau:'volledig',reden:reden}))expLog('🔓 Volledige toegang gevraagd aan de klant');
  }
  function toegangTeken(){
    const el=$('remToegang');if(!el)return;
    const n=S.expNiveau;
    const vast=S.expVast!=null;
    const tekst=vast?'🔓 Vaste toegang — je bent de gekoppelde expert van deze klant'
      :n==null?'Toegang: zonder niveaus (de app van de klant is ouder dan 29-10-2026)'
      :n==='volledig'?('🔓 Volledige toegang'+(S.expBlijvend?' — tot de klant stopt met delen':' — vervalt bij een verbindingsprobleem'))
      :'🔒 Basistoegang: meekijken, waarden en foutcodes lezen, snelle scan';
    let dek='';
    try{if(window.PLExpertWerk&&PLExpertWerk.dekkingHtml)dek=PLExpertWerk.dekkingHtml(S.vstate);}catch(_){ console.warn('Dekking niet getekend', _); }
    el.innerHTML='<div class="rem-stat">'+esc(tekst)+'</div>'
      +'<div class="rem-flex"><button class="rem-btn" onclick="PLRemote.reqSnelscan()">🔍 Snelle scan</button>'
      +'<button class="rem-btn"'+(n==='basis'&&!vast?' disabled title="Vraagt volledige toegang"':'')+' onclick="PLRemote.reqKaart()">🗺 Volledig in kaart</button></div>'
      +(n==='basis'&&!vast?'<div class="rem-flex" style="margin-top:6px"><input class="rem-in" id="remToegangReden" maxlength="200" placeholder="Waarom (de klant ziet dit), bv. opname tijdens een proefrit"><button class="rem-btn pri" onclick="PLRemote.reqToestemming()">🔓 Vraag volledige toegang</button></div>':'')
      +dek;
  }
  /* ── Opname & analyse op afstand: expert stuurt, LOCAL doet het werk ── */
  function _rid(){return Math.random().toString(36).slice(2,8);}
  function remRecStart(){
    if(!S.ews||S.ews.readyState!==1)return;
    const pids=String($('remReqPids').value||'').split(/[\s,;]+/)
      .map(s=>s.trim().toUpperCase()).filter(s=>/^([0-9A-F]{2}|[0-9A-Z]{4,8})$/.test(s)).slice(0,24);
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
    let h='<div class="rem-stat" style="margin-bottom:4px">✓ '+getal(dur)+'s · '+getal(n)+' metingen (opgenomen op de local)</div>';
    h+='<table style="width:100%;border-collapse:collapse;font-size:11px">';
    h+='<tr><th style="text-align:left;padding:3px;border-bottom:1px solid #232c40">Sensor</th><th style="padding:3px;border-bottom:1px solid #232c40">n</th><th style="padding:3px;border-bottom:1px solid #232c40">Min</th><th style="padding:3px;border-bottom:1px solid #232c40">Max</th><th style="padding:3px;border-bottom:1px solid #232c40">Gem.</th></tr>';
    (rows||[]).forEach(r=>{h+='<tr><td style="padding:3px">'+esc(r.name)+'</td><td style="padding:3px;text-align:center">'+getal(r.n)+'</td><td style="padding:3px;text-align:center">'+getal(r.mn)+'</td><td style="padding:3px;text-align:center">'+getal(r.mx)+'</td><td style="padding:3px;text-align:center">'+getal(r.av)+' '+esc(r.unit||'')+'</td></tr>';});
    return h+'</table>';
  }
  function _csvDone(){
    // Via download(): rechtstreeks naar Documenten/PidLane/ (27-09-2026).
    try{
      download('pidlane_opname_remote_'+Date.now()+'.csv', S.csvBuf||'');
      expLog('💾 CSV opgeslagen ('+(S.csvBuf||'').length+' tekens)');
    }catch(e){ console.warn('CSV opslaan mislukt', e); expLog('✖ CSV opslaan mislukt'); }
    S.csvBuf='';
  }
  /* #646: een koppelcode voor een klant. De klant voert hem in bij Mijn
     voertuigen → Vaste expert; daarna heeft dit account in elke sessie van
     die klant volledige toegang, tot de klant intrekt. */
  async function maakKoppelcode(){
    const el=$('remKoppelcode');if(el)el.textContent='Code maken…';
    try{
      const r=await plFetch('/expert/koppelcode',{method:'POST',json:{}});
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||('HTTP '+r.status));
      if(el)el.innerHTML='<b class="rem-koppelcode">'+esc(String(d.code).replace(/^(.{4})/,'$1 '))+'</b><br>De klant typt deze code bij Mijn voertuigen → Vaste expert. Eén keer te gebruiken, geldig tot '+esc(new Date(d.verloopt).toLocaleDateString('nl-NL'))+'.';
      logA('🔗 Koppelcode gemaakt voor een vaste klant','ok');
    }catch(e){if(el)el.textContent='⚠ Geen koppelcode: '+((e&&e.message)||e);}
  }
  function expertDisconnect(){S.expStop=true;S.expNiveau=null;S.expBlijvend=false;S.expVast=null;clearTimeout(S.recTE);clearInterval(S.stilT);S.stilT=null;S.stilSt=null;
    exitDrive();
    try{if(S.ews)S.ews.close();}catch(_){ /* stil: opruimen: kan al gebeurd zijn */ }
    S.ews=null;S.vals={};S.expClosed=false;S.expMeta=null;S.pending={};S.vstate=null;
    $('remExpLive').style.display='none';$('remExpConn').style.display='';
    $('remExpErr').textContent='';setExpStat('—');werkplek();}

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
    if(!pendingJoin){try{if(window.PLExpertWerk)PLExpertWerk.naLogin();}catch(_){ console.warn('Expertwerkplek niet geopend na het inloggen', _); }return;}
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
            const sfx=pollSleutels(list);
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
      initialHealthScan=async function(){ if(window._remoteVehicleMode)return;
        _bezig.health++;try{return await _ih.apply(this,arguments);}finally{_bezig.health--;} };
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
  try{ // DTC-deur remote: een mislukte uitlezing is een melding, geen "alles OK"
    if(typeof scanDTC==='function'){const _sd=scanDTC;
      scanDTC=async function(){
        if(!window._remoteVehicleMode)return _sd.apply(this,arguments);
        try{return await _sd.apply(this,arguments);}
        catch(e){
          const msg='Foutcodes niet opgehaald van de telefoon: '+String((e&&e.message)||e);
          try{const el=$('dtcList');if(el)el.innerHTML='<div class="emp"><div class="ei">⚠️</div><h3>Niet gelezen</h3><p>'+esc(msg)+'</p></div>';}catch(_){ console.warn('Foutmelding DTC niet getoond', _); }
          try{$('bscan').disabled=false;}catch(_){ /* stil: element kan al weg zijn */ }
          logA('🔭 '+msg,'warn');
        }
      }; window.scanDTC=scanDTC;}
  }catch(_){ console.warn('scanDTC-wrapper niet geïnstalleerd — een mislukte remote-uitlezing kan dan blijven hangen', _); }
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
  try{ // #648: het inleren wacht tot de zoekronde klaar is, en begint er pas daarna aan
    if(typeof startDiscovery==='function'){const _sd2=startDiscovery;
      startDiscovery=async function(){
        _bezig.discovery++;
        try{return await _sd2.apply(this,arguments);}
        finally{_bezig.discovery--;try{if(!S.kaartBezig)inlerenNaVerbinden(INLEER_HERHAAL_MS);}catch(_){ console.warn('Inleren na de zoekronde niet ingepland', _); }}
      }; window.startDiscovery=startDiscovery;}
  }catch(_){ console.warn('startDiscovery-wrapper niet geïnstalleerd — het inleren voor een vaste expert kan dan tegelijk met de zoekronde starten', _); }
  try{ // local: discovery/verversing van de PID-lijst → snapshot naar de expert
    if(typeof buildDiscoveredPIDList==='function'){const _bd=buildDiscoveredPIDList;
      buildDiscoveredPIDList=function(){ const r=_bd.apply(this,arguments); try{sendVStateSoon();}catch(_){ console.warn('Vernieuwd voertuigprofiel niet naar de expert gestuurd', _); }
        try{if(!S.kaartBezig)inlerenNaVerbinden();}catch(_){ console.warn('Inleren voor de vaste expert niet ingepland', _); } return r; };
      window.buildDiscoveredPIDList=buildDiscoveredPIDList;}
  }catch(_){ console.warn('buildDiscoveredPIDList-wrapper niet geïnstalleerd — de expert krijgt dan geen vers snapshot na een nieuwe discovery', _); }
  try{ // local: voertuiginfo (VIN/RDW) bijgewerkt → snapshot verversen
    if(typeof showVtag==='function'){const _svt=showVtag;
      showVtag=function(){ const r=_svt.apply(this,arguments); try{sendVStateSoon();}catch(_){ console.warn('Vernieuwd voertuigprofiel niet naar de expert gestuurd na VIN/RDW-update', _); } return r; };
      window.showVtag=showVtag;}
  }catch(_){ console.warn('showVtag-wrapper niet geïnstalleerd — de expert ziet dan geen bijgewerkte voertuiginfo', _); }
  function remoteDtc(){
    return new Promise((res,rej)=>{
      if(!S.ews||S.ews.readyState!==1)return rej(new Error('geen verbinding met de sessie'));
      const id=_rid();
      S.pending[id]=(codes,err)=>Array.isArray(codes)?res(codes):rej(new Error(err));
      setTimeout(()=>{if(S.pending[id]){delete S.pending[id];rej(new Error('telefoon antwoordde niet binnen 15 s'));}},15000);
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

  return {openShare,deelMethode,closeShare,shareStart,shareStop,copy,
          openExpert,expertClose,expertConnect,expertDisconnect,_staat:()=>({vstate:S.vstate,expMeta:S.expMeta}),_klantActie:klantActie,_klantStatus:klantStatus,_klantHtml:klantHtml,klantVerberg,klantToon,pillTik,_stilOordeel:stilOordeel,_pollSet:pollSet,_remSleutel:remSleutel,_remPid:remPid,reqPids,reqDtc,reqRapport,enterDrive,
          vernieuw:sendVStateSoon,_buildVState:buildVState,
          toestemmingAntwoord,terugNaarBasis,reqSnelscan,reqKaart,reqToestemming,vastIntrekken,maakKoppelcode,
          _inleerSleutel:inleerSleutel,_moetInleren:moetInleren,_inleerBusVrij:inleerBusVrij,_stilTekst:stilTekst,_bezig:()=>({discovery:_bezig.discovery,health:_bezig.health,kaart:!!S.kaartBezig}),
          kaartAfbreken,_inlerenNaVerbinden:inlerenNaVerbinden,_klantNiveauHtml:klantNiveauHtml,_vergeetExperts:()=>{_vast.experts=null;},
          _verzoekNiveau:verzoekNiveau,_verzoekToegestaan:verzoekToegestaan,_scanVoorExpert:scanVoorExpert,
          _vstateBinnenGrens:vstateBinnenGrens,_pollSleutels:pollSleutels,_magKaart:magKaart,_klantVraagHtml:klantVraagHtml,
          remRecStart,remRecStop,remRecCsv,remAnalyze,pairStart,
          stopQrScan,scanForJoin,scanForPair};
})();
