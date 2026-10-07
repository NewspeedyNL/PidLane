// ══════════════════════════════════════════════════════════════════
// pidlane-dashboard.js — Slim als je eigen dashboard (07-10-2026, #439)
// ──────────────────────────────────────────────────────────────────
// Slim deelde de sensoren tot vandaag zelf in: Dashboard, Tellerplaat,
// Temperaturen, Beweegt, Rustig. Slim, maar niet van jou — en de vakken
// verschoven met het gedrag van de sensoren. Nu is Overzicht het naslagwerk
// (alles, per categorie) en is Slim het dashboard dat je zelf inricht:
//
//   • tegels in vier soorten — getal, balk (met de normale band uit
//     Overzicht), grafiekje, meter — plus een duo: twee sensoren die bij
//     elkaar horen in één tegel (trim kort + lang, koelwater + olie);
//   • half of heel breed;
//   • aanpassen in een BEWERKSTAND (knop "Aanpassen"): pas dan staan er
//     ▲ ▼ ✎ ✕ op de tegels en "+ Sensor toevoegen" onderaan. Tijdens het
//     rijden is er dus niets per ongeluk aan te tikken;
//   • per AUTO onthouden (sleutel uit de VIN, net als pl_vinprof_). Een
//     nieuwe auto begint met een slim gekozen standaard voor zijn motorsoort.
//
// Wat hier NIET staat: welke sensoren de bus vraagt (pidToevoegen() in
// pidlane-pidgate.js beslist dat, met zijn eigen poort), het oordeel over een
// waarde (pidOordeel), de normale band (ovzBand, pidlane-pids.js) en de
// decimalen (fv). Die bestaan al en zijn getoetst; een tweede kopie hier zou
// uit de pas lopen.
//
// test-dashboard.js toetst de pure kern (standaard, bewerken, laden);
// bproef-dashboard.js de echte app.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const VERSIE = 1;
const SOORTEN = ['getal','balk','grafiek','meter'];
const MAX_TEGELS = 16;

// ── DE STANDAARD PER MOTORSOORT ─────────────────────────────────────
// Per tegel een keten: de eerste PID die deze auto heeft, telt. Wat de auto
// van een tegel niet heeft, valt weg — een lege tegel bij de eerste keer is
// een belofte die niet wordt ingelost.
const STANDAARD = {
  benzine: [
    { keten:['010D'], soort:'getal' },
    { keten:['010C'], soort:'meter' },
    { keten:['CA03','015E','CA02'], soort:'grafiek', breed:true },
    { keten:['0105','0167'], soort:'balk' },
    { keten:['0106'], tweede:['0107'], soort:'duo' },
    { keten:['0142'], soort:'balk' }
  ],
  diesel: [
    { keten:['010D'], soort:'getal' },
    { keten:['010C'], soort:'meter' },
    { keten:['CA03','015E','CA02'], soort:'grafiek', breed:true },
    { keten:['0105','0167'], tweede:['015C'], soort:'duo' },
    { keten:['CA04','0170','010B'], soort:'meter' },
    { keten:['0142'], soort:'balk' }
  ],
  hybride: [
    { keten:['010D'], soort:'getal' },
    { keten:['015B'], soort:'balk' },
    { keten:['CA03','015E','CA02'], soort:'grafiek', breed:true },
    { keten:['010C'], soort:'meter' },
    { keten:['0105','0167'], soort:'balk' },
    { keten:['0142'], soort:'balk' }
  ],
  ev: [
    { keten:['010D'], soort:'getal' },
    { keten:['015B'], soort:'balk' },
    { keten:['0142'], soort:'balk' },
    { keten:['0146'], soort:'getal' },
    { keten:['0105','0167'], soort:'balk' }
  ]
};
let _volg = 0;
function nieuwId(){ _volg++; return 't'+Date.now().toString(36)+_volg; }

/* Puur. `heeft(pid)` = levert deze auto hem. Geeft een lijst tegels. */
function maakStandaard(motor, heeft){
  const lijst=STANDAARD[motor] || STANDAARD.benzine;
  const uit=[];
  lijst.forEach(function(s){
    const eerste=s.keten.filter(heeft)[0];
    if(!eerste) return;
    const t={ id:nieuwId(), soort:s.soort, pids:[eerste], breed:!!s.breed };
    if(s.soort==='duo'){
      const tw=(s.tweede||[]).filter(heeft)[0];
      if(tw) t.pids.push(tw); else t.soort='balk';
    }
    uit.push(t);
  });
  return uit;
}

// ── BEWERKEN — puur: een lijst in, een nieuwe lijst uit ─────────────
function kopie(l){ return (l||[]).map(function(t){ return { id:t.id, soort:t.soort, pids:t.pids.slice(), breed:!!t.breed }; }); }
function schuif(l, id, stap){
  const n=kopie(l), i=n.findIndex(function(t){ return t.id===id; }), j=i+stap;
  if(i<0 || j<0 || j>=n.length) return n;
  const t=n[i]; n[i]=n[j]; n[j]=t; return n;
}
function verwijder(l, id){ return kopie(l).filter(function(t){ return t.id!==id; }); }
function voegToe(l, pid, soort){
  const n=kopie(l);
  if(n.length>=MAX_TEGELS || n.some(function(t){ return t.pids.indexOf(pid)>-1; })) return n;
  n.push({ id:nieuwId(), soort:SOORTEN.indexOf(soort)>-1 ? soort : 'getal', pids:[pid], breed:false });
  return n;
}
/* Een soort kiezen. Een duo terugzetten naar een enkele soort laat de tweede
   sensor vallen; een duo wordt je via zetTweede(). */
function zetSoort(l, id, soort){
  if(SOORTEN.indexOf(soort)<0) return kopie(l);
  return kopie(l).map(function(t){ if(t.id===id){ t.soort=soort; t.pids=t.pids.slice(0,1); } return t; });
}
function zetTweede(l, id, pid){
  return kopie(l).map(function(t){
    if(t.id!==id) return t;
    if(!pid || pid===t.pids[0]){ t.pids=t.pids.slice(0,1); if(t.soort==='duo') t.soort='balk'; }
    else { t.pids=[t.pids[0], pid]; t.soort='duo'; }
    return t;
  });
}
function zetBreed(l, id, breed){ return kopie(l).map(function(t){ if(t.id===id) t.breed=!!breed; return t; }); }

/* Wat er uit de opslag komt is data van een eerdere versie of een kapotte
   schrijfactie. Alleen wat klopt komt erdoor; null = niets bruikbaars. */
function normaliseer(ruw){
  if(!ruw || ruw.versie!==VERSIE || !Array.isArray(ruw.tegels)) return null;
  const uit=[], gezien={};
  ruw.tegels.forEach(function(t){
    if(!t || !Array.isArray(t.pids) || !t.pids.length || uit.length>=MAX_TEGELS) return;
    const pids=t.pids.filter(function(p){ return typeof p==='string' && /^[0-9A-Z]{2,8}$/.test(p); }).slice(0,2);
    if(!pids.length) return;
    const soort = (pids.length===2) ? 'duo' : (SOORTEN.indexOf(t.soort)>-1 ? t.soort : 'getal');
    const id = (typeof t.id==='string' && t.id && !gezien[t.id]) ? t.id : nieuwId();
    gezien[id]=1;
    uit.push({ id:id, soort:soort, pids:pids, breed:!!t.breed });
  });
  return uit;
}
/* De opslagsleutel van deze auto. Dezelfde vorm als vinProfileKey() — de
   VIN blijft op het toestel. Zonder VIN (nog niet uitgelezen) is het één
   gedeeld dashboard, en dat staat er dan ook bij. */
function sleutel(vin){
  const v=String(vin||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
  return 'pl_dash_'+(v.length>=11 ? v : 'onbekend');
}

/* De slechtste van een rij oordelen. Puur. */
function tegelOordeel(lijst){
  return (lijst||[]).indexOf('danger')>-1 ? 'danger' : (lijst||[]).indexOf('warn')>-1 ? 'warn' : 'ok';
}

// ── DE METER ────────────────────────────────────────────────────────
// Een halve cirkel als pad met pathLength=100: de vulling is dasharray,
// dezelfde truc als op de basismeter, dus hij kan nooit buiten zijn spoor.
function meterDeel(d, val){
  const n=Number(val);
  if(val===null || val===undefined || val==='' || !isFinite(n) || !d) return 0;
  const lo=(typeof d.min==='number') ? d.min : 0, hi=(typeof d.max==='number' && d.max>lo) ? d.max : lo+100;
  return Math.max(0, Math.min(100, (n-lo)/(hi-lo)*100));
}

// ══ HET SCHERM ═══════════════════════════════════════════════════════
let _tegels = [], _sleutel = '', _bewerk = false, _g = null, _blad = null;
const _lijnVuil = {}; let _lijnGepland = false;

function el(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function def(pid){ try{ return (typeof getPidDef==='function') ? getPidDef(pid) : null; }catch(e){ console.warn('PLDash: getPidDef('+pid+')', e); return null; } }
function naam(pid){ const d=def(pid); return (typeof ovzNaam==='function') ? ovzNaam(pid, d) : ((d && d.name) || pid); }
function motor(){ try{ return (typeof detectEngineType==='function') ? (detectEngineType() || 'benzine') : 'benzine'; }catch(e){ console.warn('PLDash: motorsoort onleesbaar', e); return 'benzine'; } }
function vin(){ try{ return (typeof vehicleInfo!=='undefined' && vehicleInfo) ? vehicleInfo.vin : ''; }catch(e){ return ''; } }
function heeft(pid){
  try{
    if(typeof discoveredPIDDefs!=='undefined' && Array.isArray(discoveredPIDDefs) && discoveredPIDDefs.length)
      return discoveredPIDDefs.some(function(d){ return d.pid===pid; });
    return !!def(pid);
  }catch(e){ console.warn('PLDash: keuzelijst onleesbaar', e); return false; }
}
function laad(){
  _sleutel=sleutel(vin());
  let ruw=null;
  try{ ruw=JSON.parse(localStorage.getItem(_sleutel)||'null'); }
  catch(e){ console.warn('PLDash: opgeslagen dashboard onleesbaar, standaard', e); }
  const t=normaliseer(ruw);
  _tegels = t && t.length ? t : maakStandaard(motor(), heeft);
}
function bewaar(){
  try{ localStorage.setItem(_sleutel, JSON.stringify({ versie:VERSIE, tegels:_tegels })); }
  catch(e){ console.warn('PLDash: dashboard niet opgeslagen', e); }
}
function zorgPids(){
  const nodig=[];
  _tegels.forEach(function(t){ t.pids.forEach(function(p){ if(nodig.indexOf(p)<0 && !(typeof activePIDs!=='undefined' && activePIDs.has(p))) nodig.push(p); }); });
  if(!nodig.length || typeof pidToevoegen!=='function') return;
  try{ pidToevoegen(nodig, { handmatig:false }); }catch(e){ console.warn('PLDash: sensoren aanzetten mislukt', e); }
}

// ── Eén tegel als HTML ──
function waardeHtml(pid, groot){
  const d=def(pid)||{};
  return '<div class="dt-w'+(groot?' groot':'')+'"><b id="dv-'+pid+'">—</b><i>'+esc(d.unit||'')+'</i></div>';
}
function bandHtml(pid){
  const d=def(pid), b=(typeof ovzBand==='function') ? ovzBand(d, null) : { heeft:false, z0:0, z1:100 };
  return '<div class="gband dt-band'+(b.heeft?'':' geen')+'" id="db-'+pid+'"><i style="left:'+b.z0.toFixed(1)+'%;width:'+(b.z1-b.z0).toFixed(1)+'%"></i><u></u></div>';
}
function tegelHtml(t){
  const p=t.pids[0], k=_bewerk ? '<div class="dt-knop">'+
      '<button type="button" onclick="PLDash.schuif(\''+t.id+'\',-1)" aria-label="Naar voren">▲</button>'+
      '<button type="button" onclick="PLDash.schuif(\''+t.id+'\',1)" aria-label="Naar achteren">▼</button>'+
      '<button type="button" onclick="PLDash.blad(\''+t.id+'\')" aria-label="Weergave kiezen">✎</button>'+
      '<button type="button" onclick="PLDash.weg(\''+t.id+'\')" aria-label="Verwijderen">✕</button></div>' : '';
  let binnen='';
  if(t.soort==='duo'){
    binnen=t.pids.map(function(q){ return '<div class="dt-duo"><span>'+esc(naam(q))+'</span>'+waardeHtml(q, false)+bandHtml(q)+'</div>'; }).join('');
  } else if(t.soort==='meter'){
    binnen='<h4>'+esc(naam(p))+'</h4><svg class="dt-meter" viewBox="0 0 120 66" aria-hidden="true">'+
      '<path class="dt-meter-bak" d="M12 60A48 48 0 0 1 108 60" pathLength="100"/>'+
      '<path class="dt-meter-vul" id="dm-'+p+'" d="M12 60A48 48 0 0 1 108 60" pathLength="100" stroke-dasharray="0 200"/></svg>'+waardeHtml(p, false);
  } else {
    binnen='<h4>'+esc(naam(p))+'</h4>'+waardeHtml(p, t.soort==='getal')+
      (t.soort==='balk' ? bandHtml(p) : '')+
      (t.soort==='grafiek' ? '<svg class="dt-lijn" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline id="dl-'+p+'" points=""/></svg>' : '');
  }
  const d=def(p);
  return '<div class="dt dt-s-'+t.soort+(t.breed?' breed':'')+'" id="dt-'+t.id+'" data-pids="'+t.pids.join(',')+'" title="'+esc(t.pids.map(function(q){ const x=def(q); return (x&&x.name)||q; }).join(' · '))+'">'+k+binnen+'</div>';
}
function bouw(g){
  _g=g||_g; if(!_g) return;
  laad();
  zorgPids();
  const leeg=!_tegels.length;
  _g.innerHTML='<div class="dash-balk"><span>'+(_bewerk ? 'Aanpassen · ▲▼ verplaatsen, ✎ weergave, ✕ weg' : 'Mijn dashboard'+(_sleutel==='pl_dash_onbekend' ? ' · nog geen VIN' : ''))+'</span>'+
      '<button type="button" class="dash-knop'+(_bewerk?' aan':'')+'" onclick="PLDash.bewerk()">'+(_bewerk ? 'Klaar' : 'Aanpassen')+'</button></div>'+
    '<div class="dash'+(_bewerk?' bewerk':'')+'" id="dashRaster">'+_tegels.map(tegelHtml).join('')+
      (_bewerk || leeg ? '<button type="button" class="dt-voeg" onclick="PLDash.kies()">+ Sensor toevoegen</button>' : '')+
    '</div>'+
    (_bewerk ? '<button type="button" class="dash-herstel" onclick="PLDash.herstel()">Standaard voor deze auto herstellen</button>' : '');
  _tegels.forEach(function(t){ t.pids.forEach(function(p){ if(typeof pidVals!=='undefined' && pidVals[p]!==undefined) bij(p, pidVals[p]); }); });
}

// ── Eén binnenkomende waarde ──
function bij(pid, val){
  if(!_tegels.some(function(t){ return t.pids.indexOf(pid)>-1; })) return;
  const d=def(pid);
  const st=(typeof pidOordeel==='function') ? pidOordeel(d, val, pid) : 'ok';
  const w=el('dv-'+pid);
  if(w){
    const t=(typeof fv==='function') ? fv(val, d) : String(val);
    if(w.textContent!==t) w.textContent=t;
  }
  // De kleur van de tegel: de slechtste van zijn sensoren (een duo heeft er twee).
  _tegels.forEach(function(t){
    if(t.pids.indexOf(pid)<0) return;
    const tg=el('dt-'+t.id); if(!tg) return;
    const erg=tegelOordeel(t.pids.map(function(q){
      if(q===pid) return st;
      const v=(typeof pidVals!=='undefined') ? pidVals[q] : undefined;
      return (v===undefined || typeof pidOordeel!=='function') ? 'ok' : pidOordeel(def(q), v, q);
    }));
    tg.classList.toggle('warn', erg==='warn'); tg.classList.toggle('danger', erg==='danger');
  });
  const b=el('db-'+pid);
  if(b && typeof ovzBand==='function'){
    const r=ovzBand(d, val), u=b.lastChild;
    if(u && r.pos!==null) u.style.left='calc('+r.pos.toFixed(1)+'% - 1.5px)';
    b.classList.toggle('warn', st==='warn'); b.classList.toggle('danger', st==='danger');
  }
  const m=el('dm-'+pid);
  if(m) m.setAttribute('stroke-dasharray', meterDeel(d, val).toFixed(1)+' 200');
  if(el('dl-'+pid)) lijnVraag(pid);
}
// Grafiekjes gebundeld tekenen, hoogstens elke 400 ms: dezelfde les als #302.
function lijnVraag(pid){
  _lijnVuil[pid]=1;
  if(_lijnGepland) return;
  _lijnGepland=true;
  setTimeout(function(){ _lijnGepland=false; Object.keys(_lijnVuil).forEach(lijnTeken); }, 400);
}
function lijnTeken(pid){
  delete _lijnVuil[pid];
  const l=el('dl-'+pid), h=(typeof pidHist!=='undefined') ? pidHist[pid] : null;
  if(!l || !h || h.length<2) return;
  const v=h.slice(-30).map(function(x){ return x.v; }).filter(function(x){ return typeof x==='number' && isFinite(x); });
  if(v.length<2) return;
  const mn=Math.min.apply(null,v), mx=Math.max.apply(null,v), rg=(mx-mn)||1;
  l.setAttribute('points', v.map(function(y,i){ return (i/(v.length-1)*100).toFixed(1)+','+(26-(y-mn)/rg*24).toFixed(1); }).join(' '));
}

// ── Bewerken ──
function zet(nieuw){ _tegels=nieuw; bewaar(); bouw(); }
function blad(html){
  sluitBlad();
  _blad=document.createElement('div'); _blad.className='dash-blad-ov'; _blad.onclick=function(e){ if(e.target===_blad) sluitBlad(); };
  _blad.innerHTML='<div class="dash-blad">'+html+'</div>';
  document.body.appendChild(_blad);
}
function sluitBlad(){ if(_blad && _blad.parentNode) _blad.parentNode.removeChild(_blad); _blad=null; }
function bladTegel(id){
  const t=_tegels.filter(function(x){ return x.id===id; })[0]; if(!t) return;
  const p=t.pids[0], cat=(typeof ovzCat==='function') ? ovzCat(def(p), p) : '';
  // Een tweede sensor die al ergens op het dashboard staat kan niet: één
  // sensor, één plek (de element-ids zijn per sensor).
  const op=_tegels.reduce(function(a,x){ return x.id===id ? a : a.concat(x.pids); }, []);
  const maat=(typeof discoveredPIDDefs!=='undefined' && Array.isArray(discoveredPIDDefs)) ? discoveredPIDDefs.filter(function(d){
    return d.pid!==p && op.indexOf(d.pid)<0 && (typeof ovzCat!=='function' || ovzCat(d, d.pid)===cat); }) : [];
  blad('<h5>'+esc(naam(p))+'</h5><p>Hoe wil je deze sensor zien?</p>'+
    '<div class="dash-keus">'+SOORTEN.map(function(s){ return '<button type="button"'+(t.soort===s?' class="aan"':'')+' onclick="PLDash.soort(\''+id+'\',\''+s+'\')">'+{getal:'Getal',balk:'Balk',grafiek:'Grafiekje',meter:'Meter'}[s]+'</button>'; }).join('')+'</div>'+
    '<div class="dash-keus twee"><button type="button"'+(!t.breed?' class="aan"':'')+' onclick="PLDash.breed(\''+id+'\',false)">Half breed</button>'+
      '<button type="button"'+(t.breed?' class="aan"':'')+' onclick="PLDash.breed(\''+id+'\',true)">Heel breed</button></div>'+
    '<p>Duo: een tweede sensor uit dezelfde categorie erbij</p>'+
    '<select class="dash-tweede" onchange="PLDash.tweede(\''+id+'\', this.value)"><option value="">Geen</option>'+
      maat.map(function(d){ return '<option value="'+d.pid+'"'+(t.pids[1]===d.pid?' selected':'')+'>'+esc(naam(d.pid))+'</option>'; }).join('')+'</select>'+
    '<div class="dash-keus twee"><button type="button" onclick="PLDash.weg(\''+id+'\')">Verwijderen</button><button type="button" class="hoofd" onclick="PLDash.sluit()">Klaar</button></div>');
}
function kies(){
  const op=_tegels.reduce(function(a,t){ return a.concat(t.pids); }, []);
  const lijst=((typeof discoveredPIDDefs!=='undefined' && Array.isArray(discoveredPIDDefs)) ? discoveredPIDDefs : [])
    .filter(function(d){ return op.indexOf(d.pid)<0 && !(typeof pidIsTekst==='function' && pidIsTekst(d.pid)); });
  const groep={};
  lijst.forEach(function(d){ const c=(typeof ovzCat==='function') ? ovzCat(d, d.pid) : 'overig'; (groep[c]=groep[c]||[]).push(d); });
  const volg=(typeof ovzVolgorde==='function') ? ovzVolgorde(motor()) : Object.keys(groep);
  const namen=(typeof OVZ_CATS!=='undefined') ? OVZ_CATS : {};
  blad('<h5>Sensor toevoegen</h5>'+(lijst.length ? '' : '<p>Alles wat deze auto levert staat al op je dashboard.</p>')+
    volg.filter(function(c){ return groep[c]; }).map(function(c){
      return '<div class="dash-groep">'+esc(namen[c]||c)+'</div>'+groep[c].map(function(d){
        return '<button type="button" class="dash-regel" onclick="PLDash.voeg(\''+d.pid+'\')">'+esc(naam(d.pid))+'<small>'+esc(d.unit||'')+'</small></button>'; }).join('');
    }).join('')+
    '<div class="dash-keus twee"><button type="button" class="hoofd" onclick="PLDash.sluit()">Sluiten</button></div>');
}

window.PLDash = {
  // de pure kern — voor test-dashboard.js
  VERSIE:VERSIE, SOORTEN:SOORTEN, STANDAARD:STANDAARD, MAX_TEGELS:MAX_TEGELS,
  maakStandaard:maakStandaard, schuifIn:schuif, verwijder:verwijder, voegToe:voegToe, zetSoort:zetSoort,
  zetTweede:zetTweede, zetBreed:zetBreed, normaliseer:normaliseer, sleutel:sleutel, meterDeel:meterDeel, tegelOordeel:tegelOordeel,
  // het scherm
  bouw:bouw, bij:bij, tegels:function(){ return kopie(_tegels); }, sleutelNu:function(){ return _sleutel; },
  bewerk:function(){ _bewerk=!_bewerk; sluitBlad(); bouw(); },
  schuif:function(id, stap){ zet(schuif(_tegels, id, stap)); },
  weg:function(id){ sluitBlad(); zet(verwijder(_tegels, id)); },
  blad:bladTegel, kies:kies, sluit:sluitBlad,
  soort:function(id, s){ zet(zetSoort(_tegels, id, s)); bladTegel(id); },
  breed:function(id, b){ zet(zetBreed(_tegels, id, b)); bladTegel(id); },
  tweede:function(id, p){ zet(zetTweede(_tegels, id, p)); bladTegel(id); },
  voeg:function(pid){ sluitBlad(); const d=def(pid); zet(voegToe(_tegels, pid, (d && (typeof d.wL==='number' || typeof d.wH==='number')) ? 'balk' : 'getal')); },
  herstel:function(){ zet(maakStandaard(motor(), heeft)); }
};
})();
