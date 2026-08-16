// ══════════════════════════════════════════════════════════════════
// pidlane-rijsituatie.js
// Rijsituatie / bijzonderheden
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
//  RIJSITUATIE / BIJZONDERHEDEN — de situatie van de auto op dít moment
//  ---------------------------------------------------------------
//  Zonder deze context beoordeelt de AI een caravanrit als een zieke auto:
//  verbruik hoog, belasting hoog, koelwater warm, laaddruk hoog → rood.
//  Terwijl dat exact is wat je verwacht met 1300 kg achter je. De vlaggen
//  hieronder vertellen elke analyse twee dingen: wat LOGISCH is bij deze
//  situatie (mag het eindoordeel niet verlagen) en wat juist EXTRA kritisch
//  wordt (koelmarge, olietemperatuur, laadspanning, laaddruk, DPF).
//  Opslag zit in userVehicleData → dus per voertuig (VIN/kenteken) en met
//  tijdstempel; na SITUATIE_TTL_MS vallen de vlaggen automatisch weg.
// ════════════════════════════════════════════════════════════════
function _sitDefs(){ try{ return (window.SITUATIES||[]); }catch(e){ return []; } }
function _sitDef(id){ return _sitDefs().filter(function(s){return s.id===id;})[0]||null; }
function situatieActief(){
  try{
    const ids=(userVehicleData&&Array.isArray(userVehicleData.sit))?userVehicleData.sit:[];
    return ids.map(_sitDef).filter(Boolean);
  }catch(e){ return []; }
}
function _sitVeldTxt(s){
  try{
    if(!s || !s.veld) return '';
    const v=String((userVehicleData||{})[s.veld.key]||'').trim();
    return v?(' — '+v):'';
  }catch(e){ return ''; }
}
// Korte, leesbare samenvatting voor chip, tooltip en logregel.
function situatieKort(){
  try{
    const p=situatieActief().map(function(s){ return s.label+_sitVeldTxt(s); });
    const extra=String((userVehicleData||{}).sitExtra||'').trim();
    if(extra) p.push(extra);
    return p.join(' · ');
  }catch(e){ return ''; }
}
// Badge naast de voertuignaam in de topbar, zodat niemand vergeet dat de
// analyses op dit moment situatie-gecorrigeerd worden.
function situatieChipHtml(){
  try{
    const act=situatieActief();
    const extra=String((userVehicleData||{}).sitExtra||'').trim();
    if(!act.length && !extra) return '';
    const icons=act.map(function(s){return s.icon;}).join('')||'📝';
    const ttl=situatieKort().replace(/"/g,'');
    return ' <span id="vtagSit" title="Rijsituatie: '+ttl+'" style="font-size:11px;font-weight:800;padding:1px 5px;border-radius:3px;background:rgba(94,124,255,.20);color:var(--bl)">'+icons+'</span>';
  }catch(e){ return ''; }
}
function _refreshVtag(){
  try{
    const el=document.getElementById('vtag');
    if(!el || el.style.display==='none') return;
    const naam=((vehicleInfo&&vehicleInfo.merk)||'')+' '+((vehicleInfo&&vehicleInfo.model)||'');
    showVtag(naam.trim()||'Voertuig');
  }catch(e){}
}

// ── Aan/uit zetten. Slaat direct op: geen "vergeten op te slaan"-risico. ──
function toggleSituatie(id){
  try{
    if(!userVehicleData) return;
    if(!Array.isArray(userVehicleData.sit)) userVehicleData.sit=[];
    const i=userVehicleData.sit.indexOf(id);
    if(i>=0) userVehicleData.sit.splice(i,1); else userVehicleData.sit.push(id);
    userVehicleData.sitTs = userVehicleData.sit.length ? Date.now() : 0;
    saveUserVehicleData();
    renderSituatie('sitBlok'); renderSituatie('sitSheetBody');
    _refreshVtag();
    try{ logUsage('situatie', userVehicleData.sit.join(',')||'leeg'); }catch(e){}
  }catch(e){}
}
function sitSetVeld(key,val){
  try{
    if(!userVehicleData) return;
    userVehicleData[key]=String(val||'').trim();
    if(!userVehicleData.sitTs) userVehicleData.sitTs=Date.now();
    saveUserVehicleData();
    if(key==='sitExtra') _refreshVtag();
  }catch(e){}
}
function situatieWis(){
  try{
    if(!userVehicleData) return;
    userVehicleData.sit=[]; userVehicleData.sitExtra='';
    userVehicleData.sitKg=''; userVehicleData.sitPax=''; userVehicleData.sitTs=0;
    saveUserVehicleData();
    renderSituatie('sitBlok'); renderSituatie('sitSheetBody');
    _refreshVtag();
    showToast?.('Rijsituatie gewist — analyses rekenen weer met een lege auto');
  }catch(e){}
}

// ── Chipraster + velden + voorbeeld van wat de AI ermee doet ──
function renderSituatie(hostId){
  const host=document.getElementById(hostId); if(!host) return;
  const defs=_sitDefs();
  if(!defs.length){ host.innerHTML='<div style="font-size:11px;color:var(--rd)">Situatielijst niet geladen — controleer pidlane-data.js.</div>'; return; }
  const u=userVehicleData||{};
  const aan=function(id){ return Array.isArray(u.sit)&&u.sit.indexOf(id)>=0; };
  const esc=function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); };

  const chips=defs.map(function(s){
    const a=aan(s.id);
    const st=a
      ? 'background:rgba(94,124,255,.18);border:1px solid var(--bl);color:var(--tx);box-shadow:0 0 0 1px rgba(94,124,255,.25) inset'
      : 'background:var(--sur2);border:1px solid var(--bd);color:var(--tx2)';
    return '<button type="button" onclick="toggleSituatie(\''+s.id+'\')" style="'+st+';border-radius:999px;padding:7px 11px;font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer;line-height:1.2">'+
           (a?'✓ ':'')+s.icon+' '+esc(s.label)+'</button>';
  }).join('');

  // Extra invoervelden alleen tonen bij de situaties die ze nodig hebben.
  const velden=defs.filter(function(s){ return s.veld && aan(s.id); }).map(function(s){
    return '<div style="margin-top:8px"><div style="font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:3px">'+s.icon+' '+esc(s.veld.lbl)+'</div>'+
      '<input value="'+esc(u[s.veld.key])+'" placeholder="'+esc(s.veld.ph)+'" oninput="sitSetVeld(\''+s.veld.key+'\',this.value)" '+
      'style="width:100%;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--f);font-size:13px;padding:8px 10px"></div>';
  }).join('');

  // Live voorbeeld: wat gaat de AI hier concreet mee doen?
  const act=situatieActief();
  const uniq=function(a){ const o=[]; a.forEach(function(x){ if(o.indexOf(x)<0) o.push(x); }); return o; };
  let verw=[], foc=[];
  act.forEach(function(s){ verw=verw.concat(s.verwacht||[]); foc=foc.concat(s.focus||[]); });
  verw=uniq(verw); foc=uniq(foc);
  let uitleg='';
  if(act.length){
    const li=function(arr,max){ return arr.slice(0,max).map(function(x){ return '<li style="margin:0 0 3px">'+esc(x)+'</li>'; }).join(''); };
    uitleg='<div style="margin-top:10px;background:var(--sur2);border:1px solid var(--bd);border-radius:10px;padding:10px">'+
      '<div style="font-size:11px;font-weight:800;color:var(--gn);margin-bottom:4px">✓ TELT NIET ALS DEFECT (logisch bij deze situatie)</div>'+
      '<ul style="margin:0 0 8px 15px;padding:0;font-size:11px;color:var(--tx2);line-height:1.45">'+li(verw,4)+
      (verw.length>4?'<li style="color:var(--tx3)">+ '+(verw.length-4)+' meer</li>':'')+'</ul>'+
      '<div style="font-size:11px;font-weight:800;color:var(--or);margin-bottom:4px">⚠ WORDT JUIST STRENGER BEOORDEELD</div>'+
      '<ul style="margin:0 0 0 15px;padding:0;font-size:11px;color:var(--tx2);line-height:1.45">'+li(foc,4)+
      (foc.length>4?'<li style="color:var(--tx3)">+ '+(foc.length-4)+' meer</li>':'')+'</ul></div>';
  }

  let sinds='';
  if(u.sitTs){
    const d=new Date(u.sitTs);
    const hh=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
    const uren=Math.round(((typeof SITUATIE_TTL_MS!=='undefined'&&SITUATIE_TTL_MS)?SITUATIE_TTL_MS:43200000)/3600000);
    sinds='<div style="font-size:11px;color:var(--tx3);margin-top:8px">Ingesteld om '+hh+' — vervalt automatisch na '+uren+' uur, zodat een oude vlag geen nieuwe analyse kleurt.</div>';
  }

  host.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'+
      '<b style="font-size:13px">🎒 Rijsituatie &amp; bijzonderheden</b>'+
      (act.length?'<span style="font-size:11px;font-weight:800;padding:2px 7px;border-radius:5px;background:rgba(94,124,255,.18);color:var(--bl)">'+act.length+' actief</span>':'')+
      '<button type="button" onclick="situatieWis()" style="margin-left:auto;padding:5px 9px;border-radius:7px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font-family:var(--f);font-size:11px;font-weight:700;cursor:pointer">Wissen</button>'+
    '</div>'+
    '<div style="font-size:11px;color:var(--tx3);margin-bottom:8px">Tik aan wat er <b>nu</b> speelt. Elke analyse rekent hiermee: wat logisch is bij deze situatie telt niet als defect, en wat juist kritisch wordt (koeling, laaddruk, laden) weegt zwaarder.</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:6px">'+chips+'</div>'+
    velden+
    '<div style="margin-top:9px"><div style="font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:3px">Overige bijzonderheden voor deze meting</div>'+
      '<textarea id="uvSitExtra" rows="2" oninput="sitSetVeld(\'sitExtra\',this.value)" placeholder="bv. rijdt met winterbanden, dakdragers gemonteerd, net getankt bij onbekende pomp" '+
      'style="width:100%;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--f);font-size:13px;padding:8px 10px;resize:vertical">'+esc(u.sitExtra)+'</textarea></div>'+
    uitleg+sinds;
}

// ── Eigen sheet, bereikbaar via ☰ → 🎒 Rijsituatie (vlak vóór een analyse) ──
function openSituatie(){
  if(!featOn('feat_situatie')){ showToast?.('Functie uitgeschakeld door beheerder'); return; }
  loadUserVehicleData();
  let m=document.getElementById('situatieSheet');
  if(!m){
    m=document.createElement('div'); m.id='situatieSheet';
    m.style.cssText='position:fixed;inset:0;z-index:9700;background:rgba(10,14,23,.65);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center';
    m.addEventListener('click',function(e){ if(e.target===m) closeSituatie(); });
    document.body.appendChild(m);
  }
  m.innerHTML='<div style="background:var(--sur);width:100%;max-width:560px;max-height:92vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--bd)">'+
      '<b style="font-size:14px">🎒 Rijsituatie</b>'+
      '<button onclick="closeSituatie()" style="width:30px;height:30px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);cursor:pointer">✕</button>'+
    '</div>'+
    '<div id="sitSheetBody" style="overflow-y:auto;padding:14px 16px"></div>'+
    '<div style="padding:12px 16px;border-top:1px solid var(--bd)">'+
      '<button onclick="closeSituatie()" style="width:100%;padding:11px;border-radius:9px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:13px;font-weight:800;cursor:pointer">Klaar</button>'+
    '</div></div>';
  m.style.display='flex';
  renderSituatie('sitSheetBody');
}
function closeSituatie(){ const m=document.getElementById('situatieSheet'); if(m) m.style.display='none'; }

// ── Promptblok: gaat mee met ELKE AI-rol (zie apiFetch) ──
// Twee lijsten plus één harde weegregel. De weegregel is het belangrijkste:
// zonder die regel noemt een model het hoge verbruik netjes "verklaarbaar"
// en zet het rapport daarna alsnog op oranje.
function _situatiePromptLine(){
  try{
    const act=situatieActief();
    const extra=String((userVehicleData||{}).sitExtra||'').trim();
    if(!act.length && !extra) return '';
    const uniq=function(a){ const o=[]; a.forEach(function(x){ if(o.indexOf(x)<0) o.push(x); }); return o; };
    let verw=[], foc=[];
    act.forEach(function(s){ verw=verw.concat(s.verwacht||[]); foc=foc.concat(s.focus||[]); });
    verw=uniq(verw); foc=uniq(foc);
    let txt='\n\nRIJSITUATIE / BIJZONDERHEDEN — door de gebruiker opgegeven, LEIDEND voor je interpretatie:\n';
    act.forEach(function(s){ txt+='- '+s.label+_sitVeldTxt(s)+'\n'; });
    if(extra) txt+='- Overig: '+extra+'\n';
    if(verw.length) txt+='\nVERWACHT BIJ DEZE SITUATIE — presenteer dit NIET als defect, maar benoem het als logisch gevolg van de situatie:\n'+verw.map(function(x){return '  - '+x;}).join('\n')+'\n';
    if(foc.length) txt+='\nJUIST EXTRA BELANGRIJK BIJ DEZE SITUATIE — geef dit voorrang en beoordeel het strenger dan normaal:\n'+foc.map(function(x){return '  - '+x;}).join('\n')+'\n';
    txt+='\nWEEGREGEL (hard): verlaag het eindoordeel/stoplicht NIET op grond van verschijnselen die hierboven onder VERWACHT staan — leg in plaats daarvan uit dat de opgegeven situatie ze verklaart. Verschuif je aandacht naar de punten onder EXTRA BELANGRIJK; daar mag je juist eerder aan de bel trekken. Noem de opgegeven situatie expliciet in je rapport en geef per relevante bevinding aan of die door de situatie wordt verklaard of niet. Zijn er geen meetwaarden voor een van de extra belangrijke punten, zeg dat dan eerlijk in plaats van er een oordeel over te geven.';
    return txt;
  }catch(e){ return ''; }
}
try{
  window.situatieActief=situatieActief; window.situatieKort=situatieKort;
  window.openSituatie=openSituatie;     window.closeSituatie=closeSituatie;
  window.toggleSituatie=toggleSituatie; window.situatieWis=situatieWis;
  window.sitSetVeld=sitSetVeld;         window.renderSituatie=renderSituatie;
  window._situatiePromptLine=_situatiePromptLine;
}catch(e){}

// ════════════════════════════════════════════════════════════════
//  LOG-CENTRUM — alle logstromen op één plek (via ⋯-menu)
//  App-log (localLog) + BT/verbindingslog (_btLog), met per-log Wissen,
//  Opslaan (bestand), Versturen (mail naar support) en Reset datastroom.
// ════════════════════════════════════════════════════════════════
// openLogCenter() is vervallen — de testrun bevat het app-log, het BT-log en
// de TX/RX-gevallen op één tijdlijn. Zie pidlane-testrun.js.
function _lcLines(kind){
  if(kind==='bt') return (typeof _btLog!=='undefined'?_btLog:[]).map(l=>`[${l.ts}][${(l.type||'info').toUpperCase()}] ${l.msg}`);
  return (typeof localLog!=='undefined'?localLog:[]).map(l=>`[${l.ts}][${(l.type||'info').toUpperCase()}] ${l.msg}`);
}
// lcTab() en lcClear() waren de tabbladen van het oude logscherm en zijn met
// dat scherm vervallen. _lcFullText() blijft: dat is het logformaat dat je al
// gewend bent en dat de testrun en de bugmelder allebei gebruiken.
function _lcFullText(){
  const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
  let ver='?'; try{ ver=(window.PID_CONFIG&&window.PID_CONFIG.app_version)||(typeof APP_VERSION!=='undefined'?APP_VERSION:'?'); }catch(e){}
  let usr='?'; try{ usr=(typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.user))||'?'; }catch(e){}
  return ['PidLane logs','Datum: '+new Date().toLocaleString('nl-NL'),'Versie: '+ver,'Gebruiker: '+usr,
    'Toestel: '+navigator.userAgent,
    'Verbinding: '+((typeof connected!=='undefined'&&connected)?((typeof demoMode!=='undefined'&&demoMode)?'demo':'verbonden'):'niet verbonden'),
    'Voertuig: '+([v.merk,v.model,v.year].filter(Boolean).join(' ')||'—'),
    '','===== APP-LOG =====',..._lcLines('app'),'','===== BT-LOG =====',..._lcLines('bt')].join('\n');
}
async function lcSave(btn){
  const txt=_lcFullText();
  const fname='PidLane_logs_'+new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')+'.txt';
  const o=btn?btn.textContent:''; if(btn){ btn.textContent='⏳'; btn.disabled=true; }
  try{
    const blob=new Blob([txt],{type:'text/plain'});
    const ok=await nativeShareFile(blob,fname);
    if(!ok) download(fname,txt);
  }catch(e){ try{ download(fname,txt); }catch(_){} }
  if(btn){ btn.textContent=o; btn.disabled=false; }
}
function lcSend(){
  const full=_lcFullText();
  const lines=full.split('\n');
  // mailto heeft een praktische lengtegrens — kop + laatste ~70 regels
  let body=lines.length>84?lines.slice(0,8).concat(['','(…ingekort — volledige log via 💾 Opslaan…)',''],lines.slice(-70)).join('\n'):full;
  if(body.length>1500) body=body.slice(0,1500)+'\n(…afgekapt)';
  const url='mailto:support@pidlane.nl?subject='+encodeURIComponent('PidLane log — '+new Date().toLocaleDateString('nl-NL'))+'&body='+encodeURIComponent(body);
  try{ window.open(url,'_self'); }catch(e){ location.href=url; }
}

function decodeVIN(vin){
  const wmi=vin.slice(0,3).toUpperCase();
  const wmiMap={
    'WVW':'Volkswagen','WVG':'Volkswagen','VWV':'Volkswagen',
    'WAU':'Audi','WA1':'Audi',
    'WBA':'BMW','WBS':'BMW','WBY':'BMW',
    'WDD':'Mercedes-Benz','WDC':'Mercedes-Benz','WD4':'Mercedes-Benz',
    'WF0':'Ford','WF1':'Ford','WF2':'Ford',
    'VF1':'Renault','VF3':'Peugeot','VF7':'Citroën',
    'TMB':'Skoda','VSS':'Seat',
    'W0L':'Opel','W0V':'Opel',
    'JHM':'Honda','JN1':'Nissan','JN8':'Nissan',
    'JT2':'Toyota','JT3':'Toyota','JT4':'Toyota',
    'JMZ':'Mazda','JM3':'Mazda','JM1':'Mazda','JM7':'Mazda',
    'KNA':'Kia','KMH':'Hyundai',
    'YV1':'Volvo','YV4':'Volvo',
    'ZAR':'Alfa Romeo','ZFA':'Fiat','ZFF':'Ferrari',
    'SAJ':'Jaguar','SAL':'Land Rover',
  };
  const merk=wmiMap[wmi]||null;
  // Positie-10 jaarcode heeft een 30-jaars cyclus: dezelfde code staat voor
  // jaar, jaar-30 én jaar+30 (bv. 'D' = 1983, 2013 of 2043). Positie-7
  // onderscheidt de periode: een LETTER betekent modeljaar 2010+, een CIJFER
  // betekent 1980-2009. Zo wordt een 2013-auto niet langer als 1983 gelezen.
  // (RDW/datum eerste toelating blijft de leidende bron en overschrijft dit.)
  const YR_CYCLE='ABCDEFGHJKLMNPRSTVWXY123456789'; // 30 codes, start 1980/2010
  const yc=vin[9]?.toUpperCase();
  const ci=YR_CYCLE.indexOf(yc);
  let year='';
  if(ci>=0){
    const p7=vin[6]?.toUpperCase()||'';
    const modern=/[A-Z]/.test(p7); // letter op positie 7 → 2010+
    let y=(modern?2010:1980)+ci;
    const nu=new Date().getFullYear();
    if(y>nu+1) y-=30; // nooit in de toekomst → vorige cyclus
    year=y.toString();
  }
  return{merk:merk||'Onbekend merk',model:'',year,vin,wmi,brandstof:'',motor:''};
}

// ── PID DEFINITIELIJST BOUWEN NA DISCOVERY ──
// ════════════════════════════════════════
// PID DISCOVERY — 3 methoden met fallback
// ════════════════════════════════════════

// Methode 1: Bitmap — vraag 0100/0120/0140 etc.
async function discoverPIDsBitmap(){
  const ranges=['0100','0120','0140','0160','0180','01A0'];
  for(const rangeCmd of ranges){
    const resp=await sendCmd(rangeCmd);
    if(!resp||resp.includes('NO DATA')||resp.includes('UNABLE')||resp.includes('ERROR')) continue;

    // Per lijn strippen zoals PiOBDII doet
    // Zoek '41 XX' patroon in elke lijn
    const lines=resp.split(/[\r\n]+/).filter(l=>l.trim().length>0);
    let bitmapHex='';

    for(const line of lines){
      const hex=line.replace(/[\s:]/g,'').toUpperCase();
      const expected='41'+rangeCmd.slice(2).toUpperCase();
      const idx=hex.indexOf(expected);
      if(idx>=0){
        bitmapHex=hex.slice(idx+expected.length, idx+expected.length+8);
        break;
      }
      // Fallback: zoek gewoon 41xx
      const alt=hex.match(/41[0-9A-F]{2}([0-9A-F]{8})/);
      if(alt){ bitmapHex=alt[1]; break; }
    }

    if(!bitmapHex||bitmapHex.length<8) continue;
    const bitmap=parseInt(bitmapHex,16);
    if(isNaN(bitmap)||bitmap===0) continue;

    const base=parseInt(rangeCmd.slice(2),16);
    let found=0;
    for(let i=0;i<32;i++){
      if(bitmap&(0x80000000>>>i)){
        const pn=base+i+1;
        supportedPIDs.add('01'+pn.toString(16).toUpperCase().padStart(2,'0'));
        found++;
      }
    }
    btDiag(`${rangeCmd}: ${bitmapHex} → +${found} PIDs (totaal ${supportedPIDs.size})`,'info');

    // P6: NIET stoppen op een ontbrekende continuation-bit. Sommige ECU's
    // rapporteren ranges niet-aaneengesloten; door door te pollen vinden we
    // ook hogere PIDs (≥0160) die anders gemist zouden worden. De extra
    // queries kosten weinig en voorkomen "auto kan het wel, maar app vraagt
    // het niet op". (Was: break bij !lastBitSet.)
  }
}

// Methode 2: Directe poll — probeer bekende PIDs één voor één
async function discoverPIDsDirect(){
  const testPIDs=['010C','010D','0105','010B','010F','0111','0104','0146','0142','015C'];
  let found=0;
  for(const pid of testPIDs){
    const resp=await sendCmd(pid);
    if(resp&&!resp.includes('NO DATA')&&!resp.includes('ERROR')&&!resp.includes('UNABLE')&&resp.includes('41')){
      supportedPIDs.add(pid);
      found++;
      btDiag(`Direct poll: ${pid} werkt ✓`,'ok');
    }
    await delay(50);
  }
  btDiag(`Directe poll: ${found} PIDs gevonden`,'info');
}

// ── DIEP ZOEKEN: hervind PIDs + zoek namen voor naamloze PIDs ──────────
// Volledige SAE J1979 mode-01 standaardnamen (dekt de "PID XX"-gevallen)
// → SAE_PID_NAMES verplaatst naar pidlane-data.js
async function deepRefreshPIDs(){
  const st=document.getElementById('pidRefreshStatus');
  const btn=document.getElementById('pidRefreshBtn');
  if(!connected && !demoMode){ if(st) st.textContent='⚠ Eerst verbinden'; return; }
  if(demoMode){ if(st) st.textContent='Demo: PID-lijst verversen...'; try{ demoRefresh(); }catch(e){} if(st) st.textContent='✓ Ververst (demo)'; return; }
  if(btn){ btn.disabled=true; btn.textContent='⏳ Zoeken...'; }
  const before=supportedPIDs.size;
  try{
    if(st) st.textContent='Bitmap-ranges opnieuw scannen...';
    await discoverPIDsBitmap();
    if(st) st.textContent='Directe poll van bekende PIDs...';
    await discoverPIDsDirect();
    // Extra: poll óók range 01 01..60 één voor één
    if(st) st.textContent='Diepe poll extra PIDs...';
    const extra=[];
    for(let n=0x01;n<=0x60;n++){ extra.push('01'+n.toString(16).toUpperCase().padStart(2,'0')); }
    for(const pid of extra){
      if(supportedPIDs.has(pid)) continue;
      const resp=await sendCmd(pid,800);
      if(resp&&resp.includes('41')&&!/NO DATA|ERROR|UNABLE/.test(resp)){ supportedPIDs.add(pid); }
      await delay(30);
    }
    // Namen invullen voor naamloze PIDs via SAE-tabel
    if(st) st.textContent='Namen opzoeken...';
    let named=0;
    supportedPIDs.forEach(pid=>{
      if(ALL_PID_DEFS[pid]) return;             // heeft al een naam
      const suf=pid.slice(2).toUpperCase();
      if(SAE_PID_NAMES[suf]){
        ALL_PID_DEFS[pid]={name:SAE_PID_NAMES[suf],unit:'',min:0,max:255,cat:'Overig',parse:b=>b[0]};
        named++;
      }
    });
    // rebuildPidDefsCache() heeft nooit bestaan; de typeof-guard maakte dat
    // onzichtbaar. buildDiscoveredPIDList() hieronder doet het echte werk.
    buildDiscoveredPIDList();
    const gained=supportedPIDs.size-before;
    if(st) st.textContent=`✓ +${gained} PIDs, ${named} namen toegevoegd (totaal ${supportedPIDs.size})`;
    log(`🔄 Diep zoeken: +${gained} PIDs, ${named} namen, totaal ${supportedPIDs.size}`,'ok');
  }catch(e){
    if(st) st.textContent='Fout: '+e.message;
    log('Diep zoeken fout: '+e.message,'err');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='🔄 Diep zoeken'; }
  }
}

// Methode 3: Standaard set — altijd beschikbaar als fallback
function loadDefaultPIDs(){
  // Gebruik voertuiginfo als beschikbaar, anders generieke benzine-set
  const merk = vehicleInfo?.merk || '';
  const brandstof = (vehicleInfo?.brandstof || '').toLowerCase();
  const jaar = parseInt(vehicleInfo?.year) || 0;
  applyVehiclePIDPreset(merk, brandstof, jaar);
}

// ── VOERTUIG-SPECIFIEKE PID PRESET ──────────────────────────────────────────
// Laadt de juiste PID-set op basis van brandstoftype + bouwjaar + merk.
// Roep aan na RDW-lookup (als verbonden) of als fallback bij lege discovery.
function applyVehiclePIDPreset(merk, brandstof, jaar){
  const b = (brandstof||'').toLowerCase();
  const y = parseInt(jaar) || 0;
  const m = (merk||'').toUpperCase();

  // Basis PIDs — altijd aanwezig op elke OBD2 auto (SAE J1979 verplicht)
  const basis = ['010C','010D','0105','010B','010F','0111','0104','0146','0142'];

  // Benzine-specifiek
  const benzine = ['0106','0107','0114','0115','010A','010E','012F','015E','012C'];

  // Diesel-specifiek (geen lambda, wel roetfilter en raildruk)
  const diesel = ['0104','010B','0123','012C','0142','015E'];

  // Hybride/elektrisch extra
  const hybride = ['0142','0143','015B'];

  // Modern (2010+): uitgebreidere set
  const modern = ['0143','015C','015A','014A','0133','0121','011F'];

  // Oud (voor 2004): minder PIDs beschikbaar
  const oud = ['010C','010D','0105','010B','010F','0104'];

  let preset;
  if(b.includes('elektr')){
    preset = [...basis, ...hybride, '015B','0142'];
    btDiag('PID preset: Elektrisch','info');
  } else if(b.includes('hybr')){
    preset = [...basis, ...benzine, ...hybride];
    btDiag('PID preset: Hybride','info');
  } else if(b.includes('diesel')){
    preset = [...basis, ...diesel, ...(y>=2010?modern:[])];
    btDiag(`PID preset: Diesel ${y>=2010?'(modern)':'(oud)'}`, 'info');
  } else if(y > 0 && y < 2004){
    preset = oud;
    btDiag('PID preset: Pre-2004 (beperkte set)','info');
  } else {
    // Benzine of onbekend
    preset = [...basis, ...benzine, ...(y>=2010?modern:[])];
    btDiag(`PID preset: Benzine ${y>=2010?'(modern)':'(standaard)'}`, 'info');
  }

  // Merk-specifieke aanvullingen — groepering komt uit merkGroep() in
  // pidlane-data.js (ronde 9). Hier stond een eigen kopie van dezelfde
  // groepering; die kende alleen exact gespelde merknamen. merkGroep()
  // normaliseert (accenten, spaties, streepjes) en matcht op voorvoegsel,
  // dus 'Volkswagen Golf', 'VW' en Cupra vallen nu ook in de VAG-bak.
  // De PIDs per bak zijn ongewijzigd. OPEL/VAUXHALL staat er bewust niet
  // in: de oude kopie had voor Opel ook geen aanvulling.
  const MERK_EXTRA_PIDS = {
    BMW:    ['015C','0143'],
    VAG:    ['0123','015C'],
    FORD:   ['0122','015D'],
    MAZDA:  ['015C','0110'],
    TOYOTA: ['015B','015C'],
  };
  const groep = (typeof merkGroep==='function') ? merkGroep(merk) : '';
  if(groep && MERK_EXTRA_PIDS[groep]) preset.push(...MERK_EXTRA_PIDS[groep]);

  // Dedupliceer en laad
  const uniq = [...new Set(preset)];
  uniq.forEach(p => supportedPIDs.add(p));
  btDiag(`Voertuig-preset geladen: ${uniq.length} PIDs (${m||'onbekend'} ${jaar||'?'} ${b||'benzine'})`, 'ok');
  log(`🔧 PID preset: ${uniq.length} PIDs voor ${m||'onbekend'} ${b||'benzine'} ${jaar||''}`, 'ok');
  buildDiscoveredPIDList();
}

// ── UITBREIDING: volledige standaard SAE J1979 mode-01 PID database ──
// Geeft alle via bitmap ontdekte PIDs een naam, eenheid en correcte formule
// → ALL_PID_DEFS_EXT verplaatst naar pidlane-data.js

// ══════════════════════════════════════════════════════════════════
// PID-GEZONDHEID — bepaalt bij eerste uitlezing welke PIDs gezond zijn,
// welke twijfelachtig en welke onzin (dood/parsefout/niet bij auto).
// Ongezonde PIDs worden in de lijst uitgegrijsd (niet selecteerbaar),
// tenzij de gebruiker "Toon alles" aanzet.
// ══════════════════════════════════════════════════════════════════
let _pidHealth={};            // pid -> 'ok' | 'twijfel' | 'onzin'
let _showAllPIDs=false;       // toggle: ook ongezonde PIDs selecteerbaar tonen

// Kern-PIDs die — als ze gezond zijn — automatisch geselecteerd worden
// → KERN_PIDS verplaatst naar pidlane-data.js

// Afbreekvlag voor de gezondheidscheck. Wordt gezet door de ✕ in de
// busy-pill (zie showBusyPill in pidlane-theme.js). De lus controleert hem
// per PID, zodat afbreken binnen één request-tijd merkbaar is en niet pas
// na de volle sweep.
let _healthAbort=false;
function healthScanAfbreken(){ _healthAbort=true; }
window.healthScanAfbreken=healthScanAfbreken;

// Neemt het bewaarde oordeel uit het voertuigprofiel over i.p.v. opnieuw te
// meten. Alleen aanroepen na expliciete bevestiging van de gebruiker.
// PIDs die in het profiel ontbreken krijgen 'ok' — een onbekende sensor
// mag niet stilzwijgend uitgegrijsd raken.
function healthUitProfiel(health){
  if(!health || typeof health!=='object') return false;
  _pidHealth={};
  let n=0;
  supportedPIDs.forEach(pid=>{
    const h=health[pid];
    _pidHealth[pid] = (h==='ok'||h==='twijfel'||h==='onzin'||h==='nodata') ? h : 'ok';
    if(health[pid]!==undefined) n++;
  });
  btDiag(`⚡ Gezondheid uit profiel overgenomen (${n}/${supportedPIDs.size} bekend) — scan overgeslagen`,'info');
  autoSelectHealthyKern();
  buildDiscoveredPIDList();
  try{ refreshLegeTegels(); }catch(e){}
  return true;
}
window.healthUitProfiel=healthUitProfiel;

async function initialHealthScan(){
  _pidHealth={};
  _healthAbort=false;
  if(demoMode){
    supportedPIDs.forEach(pid=>_pidHealth[pid]='ok');
    autoSelectHealthyKern();
    buildDiscoveredPIDList();
    return;
  }
  if(!connected || !supportedPIDs.size) return;
  const pids=[...supportedPIDs];
  btDiag(`🔬 Gezondheidscheck van ${pids.length} sensoren…`,'info');
  let ok=0, geen=0, onzin=0;
  // Zware sweep: de bus is hier van ÓNS. De poll-loop slaat z'n rondes over
  // en de stale-watchdog krijgt de pauzetijd als krediet, dus de live view
  // kleurt niet onterecht rood.
  await withBus('gezondheidscheck', async()=>{
  for(const pid of pids){
    if(_healthAbort) break;
    try{
      // 1 read per PID in scanMode — history is leeg en irrelevant
      const raw=await sendCmd((typeof pidCmd==='function')?pidCmd(pid,true):('01'+pid.slice(2)+'1'),1500);
      // NO DATA = sensor niet aanwezig op dit voertuig (grijs maar ander label)
      if(!raw || raw.includes('NO DATA') || raw.includes('UNABLE') || raw.includes('ERROR') || raw.includes('STOPPED')){
        _pidHealth[pid]='nodata'; geen++; continue;
      }
      const val=parsePID(pid, raw);
      if(val==null){ _pidHealth[pid]='onzin'; onzin++; continue; }
      updPID(pid,val);
      // scanMode=true: alleen harde fysieke onmogelijkheden markeren als onzin
      const q=assessPidQuality(pid,val,true);
      _pidHealth[pid]=q.status;
      if(q.status==='ok') ok++; else onzin++;
    }catch(e){ _pidHealth[pid]='onzin'; onzin++; }
  }
  }, 8000);
  // Veiligheidsfallback: als 0 PIDs ok zijn maar wel data was, check gefaald
  if(ok===0 && geen<pids.length){
    btDiag('⚠ Gezondheidscheck: 0 geldig — fallback alles beschikbaar','warn');
    pids.forEach(pid=>{ if(_pidHealth[pid]==='onzin') _pidHealth[pid]='ok'; });
    ok=pids.filter(p=>_pidHealth[p]==='ok').length;
  }
  if(_healthAbort){
    // Afgebroken: alles wat nog niet beoordeeld is krijgt 'ok'. Anders zou een
    // sensor die simpelweg niet aan de beurt kwam als kapot worden getoond —
    // erger dan geen oordeel hebben.
    pids.forEach(pid=>{ if(_pidHealth[pid]===undefined) _pidHealth[pid]='ok'; });
    btDiag(`⏹ Gezondheidscheck afgebroken na ${ok+geen+onzin}/${pids.length} sensoren — rest ongefilterd`,'warn');
    log('⏹ Gezondheidscheck afgebroken — alle sensoren blijven kiesbaar','info');
  } else
  btDiag(`✅ Gezondheidscheck: ${ok} ondersteund, ${geen} niet aanwezig, ${onzin} ongeldig`, 'info');
  autoSelectHealthyKern();
  buildDiscoveredPIDList();
  // Pas hier weten we welke sensoren wél gemeld maar niet geleverd worden.
  // De tegels zijn op dat moment al opgebouwd, dus even bijwerken.
  try{ refreshLegeTegels(); }catch(e){}
}

// Selecteer automatisch de gezonde kern-PIDs (optie 3 + alleen gezonde)
function autoSelectHealthyKern(){
  // Live-scherm leeg laten bij opstarten — gebruiker kiest zelf of wizard selecteert
  const cnt=document.getElementById('pidCnt'); if(cnt) cnt.textContent=activePIDs.size;
}

// Standaard uitgebreide PID-set voor wizard (geen exotische sensoren)
// Motor + Temp + Brandstof + Emissie — maar geen turbo/DPF/AdBlue/NOx/raildruk/hybride
// → STANDAARD_PIDS verplaatst naar pidlane-data.js

function selectStandardSet(){
  // Selecteer alleen PIDs die de auto ondersteunt, gezond zijn, en in de standaard-set zitten
  let n=0;
  STANDAARD_PIDS.forEach(pid=>{
    if(!supportedPIDs.has(pid)) return;     // meldt de auto hem — staat los van de ladder
    if(!pidGate(pid,'kiesbaar')) return;
    activePIDs.add(pid); manualPIDs.add(pid); n++;
  });
  const cnt=document.getElementById('pidCnt'); if(cnt) cnt.textContent=activePIDs.size;
  log(`📡 Standaard set: ${n} PIDs geselecteerd`,'ok');
  buildPIDList(); renderGauges?.(); rebuildGSel?.();
  return n;
}

// Toggle "Toon alles" — ook ongezonde PIDs selecteerbaar maken
function toggleShowAllPIDs(){
  _showAllPIDs=!_showAllPIDs;
  const b=document.getElementById('showAllPidBtn');
  if(b){ b.textContent=_showAllPIDs?'👁 Alles getoond':'👁 Toon alles'; b.classList.toggle('on',_showAllPIDs); }
  buildPIDList(document.getElementById('psrch')?.value||'');
}

// Activeer alle gezonde PIDs van één categorie in één klik
function selectCategoryPIDs(cat){
  let added=0;
  discoveredPIDDefs.forEach(p=>{
    if((p.cat||'Overig')===cat){
      // force volgt "Toon alles": stond dat aan, dan kon je een dode sensor al
      // handmatig aanvinken maar sloeg '+ Alles' hem over. Nu consistent.
      if(!activePIDs.has(p.pid) && pidGate(p.pid,'kiesbaar',{force:_showAllPIDs})){ activePIDs.add(p.pid); manualPIDs.add(p.pid); added++; }
    }
  });
  buildPIDList(document.getElementById('psrch')?.value||'');
  const cnt=document.getElementById('pidCnt'); if(cnt) cnt.textContent=activePIDs.size;
  if(added) showToast?.(`📡 ${added} ${cat}-sensoren toegevoegd`);
  renderGauges?.(); rebuildGSel?.();
}

// PIDs die een auto wél als "ondersteund" meldt, maar die geen sensor zijn.
// 0100/0120/0140/0160/0180/01A0/01C0 zijn de ondersteuningsbitmaps: de
// inhoudsopgave van mode 01, niet de inhoud. 0102 is de freeze frame-DTC.
// Ze horen thuis in de ontdekkingsroutine hierboven, niet in een lijst waar
// je ze kunt aanvinken om te monitoren.
//
// 31-07-2026 — stonden hier gewoon tussen en verschenen als aankruisbare
// "PID 0120 · raw" in het sensorkeuzescherm. 0101 blijft er BEWUST uit: dat is
// de monitorstatus met het motorlampje erin, en die gebruiken we echt.
const GEEN_SENSOR_PIDS = new Set(['0100','0120','0140','0160','0180','01A0','01C0','0102']);

function buildDiscoveredPIDList(){
  discoveredPIDDefs=[];
  const catOrder={Motor:0,Temp:1,Brandstof:2,Rijden:3,Electrisch:4,Emissie:5,Overig:9};

  supportedPIDs.forEach(pid=>{
    if(!pidGate(pid,'bestaat')) return;
    // Fantoomsensoren (AdBlue/NOx/SCR op benzine, verbrandingsmotor-PIDs op
    // een EV) er hier al uit. Dit filter draaide alleen in isReportableSensor
    // — dus aan de uitvoerkant, bij het rapport. Gevolg: ze stonden in de
    // keuzelijst, werden gepollt en kostten busbandbreedte die de echte
    // sensoren nodig hadden. selectStandardSet() hieronder doet dit al goed.
    const def=ALL_PID_DEFS[pid];
    if(def){
      discoveredPIDDefs.push({pid,...def});
    } else {
      discoveredPIDDefs.push({pid,name:`PID ${pid}`,unit:'raw',cat:'Overig',min:0,max:255,parse:b=>b[0]});
    }
  });

  // Sorteer: eerst per onderdeel (Motor voorop, Overig achteraan), daarbinnen
  // in de samengestelde volgorde van ALL_PID_DEFS (toerental eerst) i.p.v.
  // alfabetisch — dat is de volgorde die een monteur verwacht.
  const defIdx={}; Object.keys(ALL_PID_DEFS).forEach((pid,i)=>{ defIdx[pid]=i; });
  discoveredPIDDefs.sort((a,b)=>(catOrder[a.cat]??9)-(catOrder[b.cat]??9)||(defIdx[a.pid]??999)-(defIdx[b.pid]??999)||(a.pid>b.pid?1:-1));
  buildPIDList();
  document.getElementById('pidCnt').textContent=discoveredPIDDefs.length;
}

// ── VOORINSTELLINGEN VOOR DE PID-KEUZE (27-07-2026) ───────────────────
// Vult de keuzelijst en past een samenstelling toe. Elke voorinstelling is
// "kern + focus": de basis blijft altijd staan, zodat je nooit naar een paar
// losse sensoren zit te kijken zonder de context om ze te beoordelen.
// PIDs die dit voertuig niet ondersteunt worden er stil uitgefilterd; wat er
// overblijft wordt gemeld, zodat je weet waaróm je er minder ziet dan verwacht.
function _pidPresetVulSelect(){
  const sel=document.getElementById('pidPresetSel');
  if(!sel || sel._gevuld || !window.PID_PRESETS) return;
  PID_PRESETS.forEach(pr=>{
    const o=document.createElement('option');
    o.value=pr.id; o.textContent=pr.naam; o.title=pr.tip||'';
    sel.appendChild(o);
  });
  sel._gevuld=true;
}
function applyPidPreset(id){
  const tip=document.getElementById('pidPresetTip');
  if(!id){ if(tip) tip.textContent=''; return; }
  const pr=(window.PID_PRESETS||[]).find(x=>x.id===id);
  if(!pr) return;
  const kern=(window.KERN_PIDS||[]);
  const gewenst=[...new Set([...kern, ...(pr.extra||[])])];
  // Alleen wat dit voertuig daadwerkelijk kan leveren.
  const beschikbaar=new Set((discoveredPIDDefs||[]).map(d=>d.pid));
  // Nog geen health-controle: dat is ronde 3. Trede 'plausibel' houdt het
  // gedrag exact zoals het was.
  const bruikbaar=gewenst.filter(p=>beschikbaar.has(p) && pidGate(p,'plausibel'));
  const ontbreekt=gewenst.length-bruikbaar.length;
  if(!bruikbaar.length){
    if(tip) tip.textContent='Geen van deze sensoren is op dit voertuig beschikbaar.';
    return;
  }
  // Zelfde route als togglePID() gebruikt, zodat scheduler, tegels en
  // grafiekkeuze allemaal meegaan.
  activePIDs.clear(); manualPIDs.clear();
  bruikbaar.forEach(p=>{ activePIDs.add(p); manualPIDs.add(p); });
  try{ buildPIDList(document.getElementById('psrch')?.value||''); }catch(e){}
  try{ document.getElementById('pidCnt').textContent=activePIDs.size; }catch(e){}
  try{ renderGauges(); rebuildGSel(); }catch(e){}
  if(tip){
    tip.textContent=pr.tip+' — '+bruikbaar.length+' sensoren actief'
      + (ontbreekt?(', '+ontbreekt+' niet beschikbaar op deze auto'):'');
  }
  try{ showToast?.('🎚️ '+pr.naam+' — '+bruikbaar.length+' sensoren actief'); }catch(e){}
}

// ── PID PANEL — nu dynamisch vanuit discovery ──
function buildPIDList(filter=''){
  try{ _pidPresetVulSelect(); }catch(e){}
  // Onzin-sensoren horen niet eens in de keuzelijst: een benzineauto met een
  // AdBlue-regel erin ziet er kapot uit, ook als je hem nooit aanvinkt.
  const el=document.getElementById('pidList');
  el.innerHTML='';

  // Gebruik discovery resultaten als beschikbaar, anders lege staat
  const source=discoveredPIDDefs.length>0 ? discoveredPIDDefs : [];

  if(source.length===0){
    el.innerHTML=`<div style="padding:16px;text-align:center;color:var(--tx3);font-size:12px">Verbind adapter om<br>beschikbare PIDs te laden</div>`;
    return;
  }

  const f=filter.toLowerCase();
  const filtered=f ? source.filter(p=>p.name.toLowerCase().includes(f)||p.pid.includes(filter.toUpperCase())) : source;

  // Vaste volgorde per motoronderdeel; onbekende PIDs als laatste onder 'Overig'.
  const CAT_ORDER=['Motor','Temp','Brandstof','Rijden','Electrisch','Emissie','Overig'];
  window._pidCatCollapsed=window._pidCatCollapsed||new Set();
  const present=[...new Set(filtered.map(p=>p.cat||'Overig'))];
  const cats=[...CAT_ORDER.filter(c=>present.includes(c)), ...present.filter(c=>!CAT_ORDER.includes(c))];
  cats.forEach(cat=>{
    const items=filtered.filter(p=>(p.cat||'Overig')===cat);
    if(!items.length) return;
    const collapsed=window._pidCatCollapsed.has(cat) && !f;   // bij zoeken alles tonen
    // Categorie-BALK: tikken klapt in/uit; '+ Alles' activeert alle gezonde PIDs
    const lbl=document.createElement('div'); lbl.className='clbl';
    lbl.style.display='flex'; lbl.style.alignItems='center'; lbl.style.justifyContent='space-between';
    const nSel=items.filter(p=>activePIDs.has(p.pid)).length;
    lbl.innerHTML=`<span><span class="cchev">${collapsed?'▶':'▼'}</span>${cat}<span class="ccnt">${nSel?nSel+'/':''}${items.length}</span></span>`;
    lbl.onclick=()=>{ if(window._pidCatCollapsed.has(cat)) window._pidCatCollapsed.delete(cat); else window._pidCatCollapsed.add(cat); buildPIDList(filter); };
    const addBtn=document.createElement('button');
    addBtn.className='catadd'; addBtn.textContent='+ Alles';
    addBtn.title=`Alle bruikbare ${cat}-sensoren selecteren`;
    addBtn.onclick=(e)=>{ e.stopPropagation(); selectCategoryPIDs(cat); };
    lbl.appendChild(addBtn);
    el.appendChild(lbl);
    if(collapsed) return;
    items.forEach(p=>{
      const health=_pidHealth[p.pid]||'ok';
      // health stuurt alleen nog het ICOON:
      //   nodata = sensor niet aanwezig op dit voertuig (grijs, geen ⚠)
      //   onzin  = waarde ongeldig/parse-fout (oranje ⚠)
      // Of een regel uitgegrijsd is, vraagt de gate — die is de enige plek waar
      // "mag deze PID mee" wordt beslist. De lijst kiest vervolgens om hem tóch
      // te tonen; dat is het verschil tussen weergave en poort (PIDLANE.md §15).
      const dim = !pidGate(p.pid,'kiesbaar',{force:_showAllPIDs});
      const row=document.createElement('div');
      row.className='pr'+(activePIDs.has(p.pid)?' sel':'')+(dim?' dim':'');
      const tag = health==='onzin' ? '<span class="phealth bad" title="Ongeldige waarde — mogelijke meetfout">⚠</span>'
                : health==='twijfel' ? '<span class="phealth warn" title="Twijfelachtige meting — verifieer">⚠</span>'
                : health==='nodata' ? '' : '';   // nodata: geen icoon, gewoon grijs
      const nodataTip = health==='nodata' ? 'Niet aanwezig op dit voertuig (NO DATA)' : '';
      // Meet dit PID hetzelfde als een standaard-PID, maar via een ander
      // kanaal? Dan hoort dat hier te staan — anders lijken twee net
      // verschillende koelwatertemperaturen op een fout.
      const altP=(window.PID_ALT_KANAAL||{})[p.pid];
      const altTag = altP ? `<span class="palt" title="${(window.pidAltKanaalTip?pidAltKanaalTip(p.pid):'').replace(/"/g,'&quot;')}">⇄ ${altP}</span>` : '';
      row.innerHTML=`<div class="pck"><span class="ckm">✓</span></div><span class="pn">${p.name}</span>${altTag}${tag}<span class="pu2">${p.unit||p.pid}</span>`;
      if(dim){
        row.title=health==='nodata'?'Niet beschikbaar op dit voertuig — zet "Toon alles" aan om toch te kiezen':'Twijfelachtige meting — zet "Toon alles" aan om toch te kiezen';
      } else {
        row.onclick=()=>togglePID(p.pid);
      }
      el.appendChild(row);
    });
  });
}

// ── PID PARSING — gebruikt discoveredPIDDefs parse functies ──
// Aantal databytes per mode-01 PID (SAE J1979). Nodig om een multi-PID
// respons (41 0C .. 41 0D .. 41 05 ..) correct in stukken te knippen.
// → PID_BYTE_LEN verplaatst naar pidlane-data.js
// Opzoekvolgorde sinds 2026-07-26: wat op DIT voertuig gemeten is gaat vóór de
// J1979-tabel. De tabel is de startgok voor een auto die we nog niet kennen.
function pidByteLen(suffix){
  const s=String(suffix).toUpperCase();
  try{ const g=window.PLPidLen&&window.PLPidLen.lengte(s); if(g) return g; }catch(e){}
  return PID_BYTE_LEN[s]||1;
}

// Knip een multi-PID respons op in losse {pid,bytes}-blokken.
// Ondersteunt twee formaten:
//  A) los: "410C0A98 410D00 410584" (elk PID herhaalt 41)
//  B) Mazda/ISO-TP multiframe: "00E 0:410C0B95 0469 1:11200B24..." 
//     één 41, dan per PID: nummer + databytes aaneengeregen
