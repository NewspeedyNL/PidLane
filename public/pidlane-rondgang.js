// ══════════════════════════════════════════════════════════════════
// pidlane-rondgang.js — PLRond: Slim als rondgang langs de categorieën
// (15-10-2026)
// ──────────────────────────────────────────────────────────────────
// Slim kent twee standen: "Mijn dashboard" (pidlane-dashboard.js, je eigen
// tegels) en de RONDGANG: elke 10 s (instelbaar) een andere categorie —
// motor, temperaturen, brandstof en trims, lucht en turbo, uitlaat,
// elektrisch — zodat in ongeveer een minuut alles in beeld is geweest.
//
// Besluiten met de eigenaar (15-10-2026):
//   • binnen Slim, niet als eigen weergave; de stand staat in pl_slim_modus
//   • snelheid en toerental staan altijd bovenaan, op elke dia
//   • wordt een waarde rood, dan springt de rondgang naar die dia en blijft
//     daar tot hij weer normaal is
//   • per dia een vinkje (pl_rond_uit) en de wisseltijd (pl_rond_ms) — in
//     het ⚙-blad en via Mijn voorkeuren → Op dit toestel
//   • Pauze wordt NIET onthouden: de app start altijd rollend
//
// De tegels zelf tekent PLDash: dezelfde soorten (getal, balk, grafiek,
// meter, duo), dezelfde band, hetzelfde oordeel. Deze module levert alleen
// de indeling, de klok en de rem op de bus.
//
// WAT ER IN BEELD KOMT. Een dia toont de sensoren die AAN staan (Sensoren,
// of de vaste selectie uit Mijn voertuigen). De rondgang zet zelf alleen de
// kop aan, zoals Mijn dashboard dat al deed. Alles aanzetten wat de auto
// voor de rondgang heeft is een knop in het ⚙-blad (alleAan()): de selectie
// is van de klant en het voertuig, niet van een weergave — een rondgang die
// er stil sensoren bij zette, maakte de selectie uit Mijn voertuigen
// ongedaan (bproef-garage.js zag het, 15-10-2026).
//
// DE BUS. Een ELM kan niet alles tegelijk snel vragen. remt() — gelezen in
// pidPollInterval() — zet de SNELLE sensoren van de andere dia's op REM_MS
// (dezelfde regel als Visueel); de
// huidige dia, de kop en vlak vóór de wissel (VOOR_MS) de volgende dia
// houden hun eigen tempo, zodat een nieuwe dia niet met "—" begint.
//
// Puur en getoetst in test-rondgang.js: indeling(), tik(), stap(),
// voortgang(), alarmDia(), schoonMs(), schoonUit(). Het scherm:
// bproef-rondgang.js.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const KEUZES_MS = [5000, 10000, 15000, 20000, 30000];
const STANDAARD_MS = 10000;
const HOLD_MS = 30000;   // na vegen of ‹ › blijft de dia zo lang staan
const VOOR_MS = 2500;    // zo lang vóór de wissel wordt de volgende dia al snel gevraagd
const REM_MS = 2000;     // tempo voor de snelle sensoren van de andere dia's
const SNEL_MS = 300;     // wat "snel" is in PID_POLL_CLASS — dezelfde grens als Visueel
const MAX_PER_DIA = 8;
const TIK_MS = 250;

// De kop: altijd in beeld. Een EV zonder toerental krijgt de aandrijfaccu.
const KOP = [
  { keten:['010D'], soort:'getal' },
  { keten:['010C','015B'], soort:'getal' }
];
// Per dia een keten per tegel (de eerste PID die de auto heeft telt) en de
// categorieën uit Overzicht (ovzCat) waarmee hij wordt aangevuld met
// sensoren die je zelf aan hebt staan.
const DIAS = [
  { id:'motor', naam:'Motor en rijden', ico:'⚙️', vul:['rijden','motor'], tegels:[
    { keten:['0104'], soort:'meter' },
    { keten:['0149','015A','014A'], soort:'balk' },
    { keten:['0111','0145','014C','016C'], soort:'balk' },
    { keten:['0162','CA07'], tweede:['0161'], soort:'duo' },
    { keten:['CA06'], soort:'getal' },
    { keten:['010E'], soort:'getal' } ] },
  { id:'temp', naam:'Temperaturen', ico:'🌡️', vul:['temp'], tegels:[
    { keten:['0105','0167'], soort:'balk' },
    { keten:['015C'], soort:'balk' },
    { keten:['010F','0168','0184'], soort:'balk' },
    { keten:['0146'], soort:'balk' },
    { keten:['013C','013E'], soort:'balk' },
    { keten:['0177'], soort:'balk' },
    { keten:['0178','0179'], soort:'balk' },
    { keten:['017C'], soort:'balk' } ] },
  { id:'brandstof', naam:'Brandstof en trims', ico:'⛽', vul:['brandstof'], tegels:[
    { keten:['CA03','015E','CA02'], soort:'grafiek', breed:true },
    { keten:['0106'], tweede:['0107'], soort:'duo' },
    { keten:['0108'], tweede:['0109'], soort:'duo' },
    { keten:['012F'], soort:'balk' },
    { keten:['CA09'], soort:'getal' },
    { keten:['010A','0123','0159','016D','0122'], soort:'getal' } ] },
  { id:'lucht', naam:'Lucht en turbo', ico:'🌀', vul:[], tegels:[
    { keten:['0110','0166'], soort:'grafiek', breed:true },
    { keten:['010B','0187'], soort:'balk' },
    { keten:['CA04','0170'], soort:'meter' },
    { keten:['0171'], soort:'balk' },
    { keten:['0172'], soort:'balk' },
    { keten:['016F'], soort:'getal' },
    { keten:['0133'], soort:'getal' } ] },
  { id:'uitlaat', naam:'Uitlaat en emissie', ico:'💨', vul:['uitlaat'], tegels:[
    { keten:['0124','0134'], soort:'balk' },
    { keten:['0114'], tweede:['0115'], soort:'duo' },
    { keten:['0118'], tweede:['0119'], soort:'duo' },
    { keten:['012C','0169'], soort:'balk' },
    { keten:['017A'], soort:'balk' },
    { keten:['0186'], soort:'getal' },
    { keten:['0185'], soort:'balk' },
    { keten:['0183'], soort:'getal' } ] },
  { id:'elektrisch', naam:'Elektrisch', ico:'🔋', vul:['elektrisch'], tegels:[
    { keten:['015B'], soort:'balk' },
    { keten:['0142'], soort:'balk' } ] }
];
const DIA_IDS = DIAS.map(function(d){ return d.id; });

// ── DE INDELING — puur ──────────────────────────────────────────────
// o.heeft(pid): staat aan op deze auto; o.heeftKop(pid): kan de kop hem
// tonen (standaard o.heeft); o.extra: PIDs die aan staan (voor het
// aanvullen); o.cat(pid): de Overzicht-categorie, of null = niet aanvullen;
// o.uit: dia-ids met het vinkje uit. Eén sensor staat op één plek.
function indeling(motor, o){
  o=o||{};
  const heeft=o.heeft || function(){ return false; };
  const heeftKop=o.heeftKop || heeft;
  const cat=o.cat || function(){ return null; };
  const uit=schoonUit(o.uit);
  const gebruikt={};
  function tegel(s, kop){
    const h=kop ? heeftKop : heeft;
    const p=s.keten.filter(function(x){ return !gebruikt[x] && h(x); })[0];
    if(!p) return null;
    gebruikt[p]=1;
    const t={ id:'r-'+p, soort:s.soort, pids:[p], breed:!!s.breed };
    if(kop) t.kop=true;
    if(s.soort==='duo'){
      const tw=(s.tweede||[]).filter(function(x){ return !gebruikt[x] && heeft(x); })[0];
      if(tw){ gebruikt[tw]=1; t.pids.push(tw); } else t.soort='balk';
    }
    return t;
  }
  const kop=KOP.map(function(s){ return tegel(s, true); }).filter(Boolean);
  let volg=DIAS.slice();
  if(motor==='hybride' || motor==='ev'){
    const e=volg.filter(function(d){ return d.id==='elektrisch'; });
    volg=e.concat(volg.filter(function(d){ return d.id!=='elektrisch'; }));
  }
  const aan=volg.filter(function(d){ return uit.indexOf(d.id)<0; });
  let dias=aan.map(function(d){
    return { id:d.id, naam:d.naam, ico:d.ico, tegels:d.tegels.map(function(s){ return tegel(s, false); }).filter(Boolean) };
  });
  // Aanvullen met wat je zelf aan hebt staan, in de dia van zijn categorie.
  (o.extra||[]).forEach(function(p){
    if(gebruikt[p] || !heeft(p)) return;
    const c=cat(p); if(!c) return;
    const bron=aan.filter(function(d){ return d.vul.indexOf(c)>-1; })[0]; if(!bron) return;
    const d=dias.filter(function(x){ return x.id===bron.id; })[0];
    gebruikt[p]=1;
    d.tegels.push({ id:'r-'+p, soort:o.balk && o.balk(p) ? 'balk' : 'getal', pids:[p], breed:false });
  });
  dias=dias.filter(function(d){ return d.tegels.length; });
  // Eén tegel is geen dia: hij gaat bij de vorige als daar plaats is.
  const samen=[];
  dias.forEach(function(d){
    const vorig=samen[samen.length-1];
    if(d.tegels.length===1 && vorig && vorig.tegels.length<MAX_PER_DIA){
      vorig.tegels=vorig.tegels.concat(d.tegels); vorig.naam+=' · '+d.naam; return;
    }
    samen.push(d);
  });
  // Te vol: in delen van hoogstens MAX_PER_DIA.
  const uitL=[];
  samen.forEach(function(d){
    const n=Math.ceil(d.tegels.length/MAX_PER_DIA);
    for(let i=0;i<n;i++) uitL.push({ id:d.id+(i?'#'+(i+1):''), naam:d.naam+(n>1?' ('+(i+1)+'/'+n+')':''), ico:d.ico,
      tegels:d.tegels.slice(i*MAX_PER_DIA, (i+1)*MAX_PER_DIA) });
  });
  return { kop:kop, dias:uitL };
}
function pidsVan(tegels){ return (tegels||[]).reduce(function(a,t){ return a.concat(t.pids); }, []); }

// ── DE KLOK — puur ──────────────────────────────────────────────────
// st = { i, start, pauze, alarm }. o = { n, ms, alarm: dia-index of -1 }.
function tik(st, nu, o){
  const n=o.n|0; if(n<1) return st;
  const s={ i:(st.i>=0 && st.i<n) ? st.i : 0, start:st.start, pauze:!!st.pauze, alarm:(typeof st.alarm==='number') ? st.alarm : -1 };
  const a=(typeof o.alarm==='number' && o.alarm>=0 && o.alarm<n) ? o.alarm : -1;
  if(a>=0){
    if(a!==s.alarm){ s.i=a; s.alarm=a; }
    s.start=nu; return s;           // blijft staan zolang het alarm er is
  }
  if(s.alarm>=0){ s.alarm=-1; s.start=nu; return s; }
  if(s.pauze){ s.start=Math.max(s.start, nu); return s; }
  if(nu-s.start>=o.ms){ s.i=(s.i+1)%n; s.start=nu; }
  return s;
}
// Met de hand een dia verder of terug: die blijft HOLD_MS staan.
function stap(st, r, nu, n){
  if(n<1) return st;
  const i=(((st.i|0)+r)%n+n)%n;
  return { i:i, start:nu+HOLD_MS, pauze:!!st.pauze, alarm:st.alarm };
}
function voortgang(st, nu, ms){ return Math.max(0, Math.min(1, (nu-st.start)/(ms||STANDAARD_MS))); }
// De eerste dia met een sensor in rood; -1 = geen.
function alarmDia(dias, oordeel){
  for(let i=0;i<(dias||[]).length;i++){
    if(pidsVan(dias[i].tegels).some(function(p){ return oordeel(p)==='danger'; })) return i;
  }
  return -1;
}
function schoonMs(v){ const n=Number(v); return KEUZES_MS.indexOf(n)>-1 ? n : STANDAARD_MS; }
function schoonUit(l){
  const u=(Array.isArray(l) ? l : []).filter(function(x, i, a){ return DIA_IDS.indexOf(x)>-1 && a.indexOf(x)===i; });
  return u.length>=DIA_IDS.length ? [] : u;   // alles uit = niets uit
}

// ══ HET SCHERM ═══════════════════════════════════════════════════════
let _st={ i:0, start:Date.now(), pauze:false, alarm:-1 };
let _ind={ kop:[], dias:[] }, _klok=null, _blad=null, _vorigeI=-1;

function lees(k){ try{ return localStorage.getItem(k); }catch(e){ console.warn('PLRond: '+k+' niet leesbaar', e); return null; } }
function schrijf(k, v){ try{ localStorage.setItem(k, v); }catch(e){ console.warn('PLRond: '+k+' niet bewaard', e); } }
function ms(){ return schoonMs(lees('pl_rond_ms')); }
function uitLijst(){ try{ return schoonUit(JSON.parse(lees('pl_rond_uit')||'[]')); }catch(e){ console.warn('PLRond: pl_rond_uit onleesbaar', e); return []; } }
function aan(){ return lees('pl_slim_modus')!=='dash'; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function def(pid){ try{ return (typeof getPidDef==='function') ? getPidDef(pid) : null; }catch(e){ console.warn('PLRond: getPidDef('+pid+')', e); return null; } }
function motor(){ try{ return (typeof detectEngineType==='function') ? (detectEngineType() || 'benzine') : 'benzine'; }catch(e){ console.warn('PLRond: motorsoort onleesbaar', e); return 'benzine'; } }
function inLijst(){ try{ return (typeof discoveredPIDDefs!=='undefined' && Array.isArray(discoveredPIDDefs)) ? discoveredPIDDefs : []; }catch(e){ console.warn('PLRond: keuzelijst onleesbaar', e); return []; } }
function actief(pid){
  try{ return typeof activePIDs!=='undefined' && activePIDs.has(pid) && levert(pid); }
  catch(e){ console.warn('PLRond: activePIDs onleesbaar', e); return false; }
}
function levert(pid){
  const l=inLijst();
  if(typeof plIsTelemetrie==='function' && plIsTelemetrie(pid)) return false;
  if(typeof pidIsTekst==='function' && pidIsTekst(pid)) return false;
  return l.length ? l.some(function(d){ return d.pid===pid; }) : !!def(pid);
}
function catVan(pid){
  const d=def(pid); if(!d) return null;
  if(d.unit==='°C') return 'temp';
  return (typeof ovzCat==='function') ? ovzCat(d, pid) : null;
}
function opbouw(){
  let extra=[];
  try{ if(typeof activePIDs!=='undefined') extra=Array.from(activePIDs); }catch(e){ console.warn('PLRond: activePIDs onleesbaar', e); }
  _ind=indeling(motor(), { heeft:actief, heeftKop:levert, extra:extra, cat:catVan, uit:uitLijst(),
    balk:function(p){ const d=def(p); return !!(d && (typeof d.wL==='number' || typeof d.wH==='number')); } });
  if(_st.i>=_ind.dias.length) _st.i=0;
  return _ind;
}
function oordeel(pid){
  const v=(typeof pidVals!=='undefined') ? pidVals[pid] : undefined;
  if(v===undefined || v===null || typeof pidOordeel!=='function') return 'ok';
  try{ if(typeof plOud==='function' && plOud(pid, Date.now())) return 'ok'; }catch(e){ console.warn('PLRond: plOud('+pid+')', e); }
  return pidOordeel(def(pid), v, pid);
}
// Alleen de kop: snelheid en toerental horen altijd in beeld.
function zorgPids(){
  const nodig=pidsVan(_ind.kop)
    .filter(function(p){ return !(typeof activePIDs!=='undefined' && activePIDs.has(p)); });
  if(!nodig.length || typeof pidToevoegen!=='function') return;
  console.warn("RONDZORG", nodig.join(), new Error().stack.split(String.fromCharCode(10)).slice(1,6).join(" | "));
  try{ pidToevoegen(nodig, { handmatig:false }); }catch(e){ console.warn('PLRond: sensoren aanzetten mislukt', e); }
}
function draait(){
  return aan() && typeof pidViewMode!=='undefined' && pidViewMode==='slim' && !!document.getElementById('rondVoort');
}
// Live in beeld? Zo niet, dan wisselt de rondgang niet en remt hij niets.
function inBeeld(){
  const v=document.getElementById('rondVoort');
  return !!v && v.getClientRects().length>0 && !document.hidden;
}

// De tegels voor PLDash: de kop en de huidige dia.
function tegels(){
  opbouw(); zorgPids();
  const d=_ind.dias[_st.i];
  return _ind.kop.concat(d ? d.tegels : []);
}
function balkHtml(){
  const n=_ind.dias.length, d=_ind.dias[_st.i];
  const alarmPid=(_st.alarm>=0 && d) ? pidsVan(d.tegels).filter(function(p){ return oordeel(p)==='danger'; })[0] : null;
  const ad=alarmPid ? def(alarmPid) : null;
  return '<div class="dash-balk"><span>Rondgang · elke '+(ms()/1000)+' s</span>'+
      '<button type="button" class="dash-knop" onclick="PLRond.modus(\'dash\')">Mijn dashboard</button></div>'+
    '<div class="rond-kop">'+
      '<button type="button" class="rond-k" onclick="PLRond.stap(-1)" aria-label="Vorige categorie">‹</button>'+
      '<h3 id="rondTitel">'+(d ? esc(d.ico+' '+d.naam) : 'Nog geen sensoren')+'<small>'+(n ? (_st.i+1)+'/'+n : '')+'</small></h3>'+
      '<button type="button" class="rond-k" onclick="PLRond.stap(1)" aria-label="Volgende categorie">›</button>'+
      '<button type="button" class="rond-k'+(_st.pauze?' aan':'')+'" id="rondPauze" onclick="PLRond.pauze()" aria-label="'+(_st.pauze?'Verder':'Pauze')+'">'+(_st.pauze?'▶':'⏸')+'</button>'+
      '<button type="button" class="rond-k" onclick="PLRond.instellingen()" aria-label="Rondgang instellen">⚙</button></div>'+
    '<div class="rond-voort'+(_st.alarm>=0?' alarm':'')+(_st.pauze?' stil':'')+'" id="rondVoort"><i></i></div>'+
    (alarmPid ? '<div class="rond-alarm" id="rondAlarm">⚠ '+esc((ad && ad.name) || alarmPid)+' buiten de grens — de rondgang blijft hier staan</div>' : '')+
    '<div class="rond-punten" aria-hidden="true">'+_ind.dias.map(function(x, i){ return '<b'+(i===_st.i?' class="aan"':'')+'></b>'; }).join('')+'</div>';
}
function voortBij(){
  const v=document.getElementById('rondVoort'); if(!v || !v.firstChild) return;
  v.firstChild.style.width=(_st.alarm>=0 ? 100 : voortgang(_st, Date.now(), ms())*100).toFixed(1)+'%';
}
function herbouw(){ if(window.PLDash) PLDash.bouw(); }
function klokTik(){
  if(!draait()){ stopKlok(); return; }
  if(!inBeeld()) return;
  const nu=Date.now(), was=_st.i, wasAlarm=_st.alarm;
  _st=tik(_st, nu, { n:_ind.dias.length, ms:ms(), alarm:alarmDia(_ind.dias, oordeel) });
  if(_st.i!==was || _st.alarm!==wasAlarm) herbouw(); else voortBij();
}
function startKlok(){ if(!_klok) _klok=setInterval(klokTik, TIK_MS); }
function stopKlok(){ if(_klok){ clearInterval(_klok); _klok=null; } }
// Na het tekenen door PLDash: vegen, de klok en de overgang.
function na(){
  const r=document.getElementById('dashRaster');
  if(r){
    if(_vorigeI!==_st.i) r.classList.add('rond-in');
    _vorigeI=_st.i;
    let x0=null, y0=null;
    r.addEventListener('touchstart', function(e){ const t=e.touches[0]; x0=t.clientX; y0=t.clientY; }, { passive:true });
    r.addEventListener('touchend', function(e){
      if(x0===null) return;
      const t=e.changedTouches[0], dx=t.clientX-x0, dy=t.clientY-y0; x0=null;
      if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.5) api.stap(dx<0 ? 1 : -1);
    }, { passive:true });
  }
  voortBij(); startKlok();
}

// ── Remmen op de bus — gelezen in pidPollInterval() ──
function remt(pid){
  if(!pid || !draait() || !inBeeld()) return false;
  // Alleen snelle PIDs, net als Visueel: een trage sensor staat al ver
  // boven REM_MS, en alles remmen houdt de groepsregelaar in de pollus te
  // weinig verzoeken over om een kloon te herkennen (bproef-groepsproef.js).
  if(!/^01/i.test(String(pid))) return false;
  const klasse=(window.PID_POLL_CLASS||{})[String(pid).slice(2).toUpperCase()];
  if(!(typeof klasse==='number' && klasse<=SNEL_MS)) return false;
  if(pidsVan(_ind.kop).indexOf(pid)>-1) return false;
  const n=_ind.dias.length; if(n<2) return false;
  const iDia=_ind.dias.findIndex(function(d){ return pidsVan(d.tegels).indexOf(pid)>-1; });
  if(iDia<0 || iDia===_st.i) return false;
  if(_st.alarm<0 && !_st.pauze && iDia===(_st.i+1)%n && ms()*(1-voortgang(_st, Date.now(), ms()))<=VOOR_MS) return false;
  return true;
}

// Wat de auto voor de rondgang heeft maar nog uit staat.
function nogUit(){
  const vol=indeling(motor(), { heeft:levert, uit:uitLijst() });
  return vol.dias.reduce(function(a,d){ return a.concat(pidsVan(d.tegels)); }, [])
    .filter(function(p){ return !actief(p); });
}
function alleAan(){
  const n=nogUit();
  if(n.length && typeof pidToevoegen==='function'){
    try{ pidToevoegen(n, { handmatig:true }); }catch(e){ console.warn('PLRond: sensoren aanzetten mislukt', e); }
  }
  return n.length;
}

// ── Het ⚙-blad: wisseltijd en vinkjes ──
function sluitBlad(){ if(_blad && _blad.parentNode) _blad.parentNode.removeChild(_blad); _blad=null; }
function instellingen(){
  sluitBlad();
  const nu=ms(), uit=uitLijst(), mist=nogUit().length;
  _blad=document.createElement('div'); _blad.className='dash-blad-ov'; _blad.id='rondBlad'; _blad.style.zIndex='9900';
  _blad.onclick=function(e){ if(e.target===_blad) sluitBlad(); };
  _blad.innerHTML='<div class="dash-blad"><h5>Rondgang in Slim</h5><p>Elke categorie blijft zo lang in beeld</p>'+
    '<div class="dash-keus rond-tijd">'+KEUZES_MS.map(function(m){ return '<button type="button"'+(m===nu?' class="aan"':'')+' onclick="PLRond.zetMs('+m+')">'+(m/1000)+' s</button>'; }).join('')+'</div>'+
    '<p>Welke categorieën meedoen</p>'+DIAS.map(function(d){
      const op=uit.indexOf(d.id)<0;
      return '<button type="button" class="dash-regel" role="switch" aria-checked="'+op+'" data-dia="'+d.id+'" onclick="PLRond.zetDia(\''+d.id+'\')">'+esc(d.ico+' '+d.naam)+'<small>'+(op?'☑':'☐')+'</small></button>';
    }).join('')+
    '<p>De rondgang toont de sensoren die aan staan. '+(mist ? mist+' sensoren van deze auto horen erbij maar staan uit.' : 'Alles wat deze auto ervoor heeft staat aan.')+'</p>'+
    (mist ? '<div class="dash-keus twee" style="grid-template-columns:1fr"><button type="button" id="rondAlleAan" onclick="PLRond.alleAan()">Zet ze aan ('+mist+')</button></div>' : '')+
    '<p>Snelheid en toerental staan altijd bovenaan. Een sensor in het rood houdt de rondgang op zijn categorie vast.</p>'+
    '<div class="dash-keus twee"><button type="button" onclick="PLRond.modus(\'dash\');PLRond.sluit()">Mijn dashboard</button><button type="button" class="hoofd" onclick="PLRond.sluit()">Klaar</button></div></div>';
  document.body.appendChild(_blad);
}

const api = {
  // de pure kern — voor test-rondgang.js
  DIAS:DIAS, KOP:KOP, KEUZES_MS:KEUZES_MS, STANDAARD_MS:STANDAARD_MS, HOLD_MS:HOLD_MS, VOOR_MS:VOOR_MS, REM_MS:REM_MS, SNEL_MS:SNEL_MS, MAX_PER_DIA:MAX_PER_DIA,
  indeling:indeling, tik:tik, stapPuur:stap, voortgang:voortgang, alarmDia:alarmDia, schoonMs:schoonMs, schoonUit:schoonUit,
  // het scherm
  aan:aan, tegels:tegels, nogUit:nogUit,
  alleAan:function(){ const n=alleAan(); if(n && typeof showToast==='function') showToast(n+' sensoren aangezet voor de rondgang'); instellingen(); herbouw(); return n; }, balkHtml:balkHtml, na:na, remt:remt, instellingen:instellingen, sluit:sluitBlad,
  staat:function(){ return { i:_st.i, pauze:_st.pauze, alarm:_st.alarm, ms:ms(), dias:_ind.dias.map(function(d){ return { id:d.id, naam:d.naam, pids:pidsVan(d.tegels) }; }), kop:pidsVan(_ind.kop) }; },
  modus:function(m){ schrijf('pl_slim_modus', m==='dash' ? 'dash' : 'rond'); if(m==='dash') stopKlok(); _vorigeI=-1; herbouw(); },
  stap:function(r){ _st=stap(_st, r, Date.now(), _ind.dias.length); herbouw(); },
  pauze:function(){ _st.pauze=!_st.pauze; _st.start=Date.now(); herbouw(); },
  zetMs:function(m){ schrijf('pl_rond_ms', String(schoonMs(m))); _st.start=Date.now(); instellingen(); herbouw(); },
  zetDia:function(id){
    const u=uitLijst(), i=u.indexOf(id);
    if(i>-1) u.splice(i,1); else u.push(id);
    if(schoonUit(u).length!==u.length){ if(typeof showToast==='function') showToast('Er moet minstens één categorie meedoen'); return; }
    schrijf('pl_rond_uit', JSON.stringify(u)); _st.i=0; _st.start=Date.now(); instellingen(); herbouw();
  }
};
window.PLRond = api;
})();
