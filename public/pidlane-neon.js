// ══════════════════════════════════════════════════════════════════
// pidlane-neon.js
// Neon dashboard — ronde meters
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════
// NEON DASHBOARD — RONDE METERS
// ════════════════════════════════════════
let hudTimer=null;

function openNeonDashboard(){
  document.getElementById('neonDash').style.display='block';
  document.getElementById('hudPicker').style.display='none';
  buildHudTicks();
  renderHudPresets();
  applyHudPreset(hudPreset, true);
  renderHud();
  clearInterval(hudTimer);
  hudTimer=setInterval(renderHud, 250);
}
function closeNeonDashboard(){
  document.getElementById('neonDash').style.display='none';
  clearInterval(hudTimer);
}

// Ticks eenmalig tekenen
let _hudTicksDone=false;
function buildHudTicks(){
  if(_hudTicksDone) return; _hudTicksDone=true;
  const bt=document.getElementById('hudBigTicks');
  let s='';
  for(let i=0;i<=40;i++){
    const a=(-135+(i/40)*270)*Math.PI/180;
    const r1=i%5===0?68:73, r2=78;
    const x1=100+Math.cos(a)*r1,y1=100+Math.sin(a)*r1,x2=100+Math.cos(a)*r2,y2=100+Math.sin(a)*r2;
    s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i%5===0?'#5a6678':'#2a3340'}" stroke-width="${i%5===0?1.5:.8}"/>`;
    if(i%5===0){const lx=100+Math.cos(a)*60,ly=100+Math.sin(a)*60;
      s+=`<text x="${lx}" y="${ly+3}" fill="#7a8696" font-size="9" font-family="monospace" text-anchor="middle">${i/5}</text>`;}
  }
  bt.innerHTML=s;
  // mini-meter SVG's opbouwen + klik-handlers
  document.querySelectorAll('.hudMini').forEach(m=>{
    let ticks='';
    for(let i=0;i<=20;i++){const a=(-125+(i/20)*250)*Math.PI/180;
      const r1=i%5===0?40:43,r2=46;
      const x1=50+Math.cos(a)*r1,y1=50+Math.sin(a)*r1,x2=50+Math.cos(a)*r2,y2=50+Math.sin(a)*r2;
      ticks+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i%5===0?'#3a4454':'#222c3a'}" stroke-width="${i%5===0?1.2:.6}"/>`;}
    m.innerHTML=`<svg viewBox="0 0 100 100"><g>${ticks}</g><circle cx="50" cy="50" r="38" fill="none" stroke="#141d2a" stroke-width="4"/><path class="hmArc" fill="none" stroke-width="5" stroke-linecap="round"/></svg><div class="mc"><div class="mv">—</div><div class="ml"></div></div><div class="mu"></div>`;
    m.onclick=()=>openHudPicker(+m.dataset.slot);
  });
}

function renderHudPresets(){
  const row=document.getElementById('hudPresetRow'); if(!row) return;
  row.innerHTML='';
  Object.entries(HUD_PRESETS).forEach(([k,p])=>{
    const b=document.createElement('button');
    b.className='hudPresetBtn'+(k===hudPreset?' active':'');
    b.textContent=p.name;
    b.onclick=()=>{ applyHudPreset(k); renderHudPresets(); };
    row.appendChild(b);
  });
}

// ── HUD: slimme korte labels ────────────────────────────────────────
// De hoekmeters zijn smal; brute afkapping ("BRANDSTOFTRI") is onleesbaar.
// hudShortLabel kort termen af op betekenis i.p.v. tekenaantal: eerst via
// een woordenboek van veelgebruikte automotive-termen, daarna door de
// minst informatieve woorden weg te laten, en pas als laatste redmiddel
// een nette afkapping op een woordgrens.
// → HUD_LABEL_DICT verplaatst naar pidlane-data.js
function hudShortLabel(name){
  if(!name) return '';
  const MAX=11;
  let n=name.trim();
  if(n.length<=MAX) return n.toUpperCase();
  // 1) woord-voor-woord vertalen via woordenboek, met bank-nummers behouden
  const words=n.split(/\s+/);
  const mapped=words.map(w=>{
    const key=w.toLowerCase().replace(/[^a-zà-ÿ0-9]/gi,'');
    if(HUD_LABEL_DICT[key]) return HUD_LABEL_DICT[key];
    // "B1"/"B2"/"K1" e.d. ongewijzigd laten
    if(/^[a-z]?\d$/i.test(w)) return w.toUpperCase();
    return w.toUpperCase();
  });
  let out=mapped.join(' ');
  if(out.length<=MAX) return out;
  // 1b) één lang samengesteld woord (geen spaties): zoek bekende deeltermen
  if(words.length===1){
    const low=n.toLowerCase();
    // langste woordenboek-sleutels eerst, zodat "koelvloeistoftemp" vóór "temp" matcht
    const keys=Object.keys(HUD_LABEL_DICT).sort((a,b)=>b.length-a.length);
    const parts=[];
    let rest=low;
    while(rest.length){
      const k=keys.find(k=>rest.startsWith(k));
      if(k){ parts.push(HUD_LABEL_DICT[k]); rest=rest.slice(k.length); }
      else { rest=rest.slice(1); }   // onbekend teken overslaan
    }
    if(parts.length){
      const combo=parts.join('.');
      if(combo.length<=MAX) return combo;
      return combo.slice(0,MAX);
    }
  }
  // 2) korte verbindingswoorden weglaten
  const drop=new Set(['VAN','MET','DE','HET','EN','OP','IN','ABS']);
  const trimmed=mapped.filter((w,i)=>i===0||!drop.has(w)).join(' ');
  if(trimmed.length<=MAX) return trimmed;
  // 3) eerste twee woorden, elk ingekort
  if(mapped.length>=2){
    const a=mapped[0].slice(0,6), b=mapped[1].slice(0,4);
    const combo=(a+' '+b);
    if(combo.length<=MAX+1) return combo;
  }
  // 4) laatste redmiddel: afkappen op woordgrens, nooit midden in een woord
  let acc='';
  for(const w of mapped){
    if((acc+(acc?' ':'')+w).length>MAX) break;
    acc+=(acc?' ':'')+w;
  }
  return acc||mapped[0].slice(0,MAX);
}

function applyHudPreset(key, silent){
  if(!HUD_PRESETS[key]) return;
  hudPreset=key;
  hudCenter=HUD_PRESETS[key].center;
  hudCorners=[...HUD_PRESETS[key].corners];
  // labels op de mini-meters zetten
  document.querySelectorAll('.hudMini').forEach((m,slot)=>{
    const d=getPidDef(hudCorners[slot]);
    if(!d) return;
    const ml=m.querySelector('.ml'), mu=m.querySelector('.mu'), mv=m.querySelector('.mv');
    const col=hudColor(slot);
    if(ml){ml.textContent=hudShortLabel(d.name); ml.title=d.name; ml.style.color=col;}
    if(mu){mu.textContent=d.unit||''; mu.style.color=col;}
    if(mv){mv.style.color=col;}
  });
  if(!silent) renderHud();
}

// Vaste kleuren per hoek (consistent met trendgroepen)
function hudColor(slot){ return ['#fde047','#fb923c','#60a5fa','#4ade80'][slot]||'#22d3ee'; }

function openHudPicker(slot){
  window._hudPickerSlot=slot;
  const list=document.getElementById('hudPickerList'); list.innerHTML='';
  // Alle ondersteunde PIDs aanbieden
  const pids=[...activePIDs];
  const all=(typeof supportedPIDs!=='undefined'&&supportedPIDs.size)?[...supportedPIDs]:pids;
  const seen=new Set();
  all.concat(pids).forEach(pid=>{
    if(seen.has(pid)) return; seen.add(pid);
    const d=getPidDef(pid); if(!d) return;
    const o=document.createElement('div');
    o.style.cssText='padding:12px 16px;border-bottom:1px solid #141a26;font-size:14px;cursor:pointer;display:flex;justify-content:space-between;color:#e6edf3';
    o.innerHTML=`<span>${d.name}</span><span style="font-family:var(--m);font-size:12px;color:#8a94a6">${d.unit||''}</span>`;
    o.onclick=()=>{
      hudCorners[window._hudPickerSlot]=pid;
      const m=document.querySelectorAll('.hudMini')[window._hudPickerSlot];
      const col=hudColor(window._hudPickerSlot);
      m.querySelector('.ml').textContent=hudShortLabel(d.name); m.querySelector('.ml').title=d.name; m.querySelector('.ml').style.color=col;
      m.querySelector('.mu').textContent=d.unit||''; m.querySelector('.mu').style.color=col;
      m.querySelector('.mv').style.color=col;
      document.getElementById('hudPicker').style.display='none';
      renderHud();
    };
    list.appendChild(o);
  });
  document.getElementById('hudPicker').style.display='flex';
}
document.getElementById('hudPicker').addEventListener('click',e=>{ if(e.target.id==='hudPicker') e.target.style.display='none'; });

function setMiniArc(m,p,color){
  const arc=m.querySelector('.hmArc');
  const a0=-125*Math.PI/180, a1=(-125+p*250)*Math.PI/180, r=38;
  const x1=50+Math.cos(a0)*r,y1=50+Math.sin(a0)*r,x2=50+Math.cos(a1)*r,y2=50+Math.sin(a1)*r;
  arc.setAttribute('stroke',color); arc.style.filter=`drop-shadow(0 0 4px ${color})`;
  arc.setAttribute('d',`M ${x1} ${y1} A ${r} ${r} 0 ${p>0.5?1:0} 1 ${x2} ${y2}`);
}

function renderHud(){
  // centrale wijzerplaat
  const cd=getPidDef(hudCenter); const cv=pidVals[hudCenter];
  if(cd){
    const ok=isPIDOk(hudCenter);
    const col=ok?'#22d3ee':'#ff006e';
    document.getElementById('hudCenterVal').textContent=cv!==undefined?fv(cv):'—';
    document.getElementById('hudCenterVal').style.color=ok?'#fff':'#ff006e';
    document.getElementById('hudCenterUnit').textContent=(cd.unit||'').toUpperCase();
    document.getElementById('hudCenterName').textContent=cd.name.toUpperCase();
    const mn=cd.min??0, mx=cd.max??255;
    const p=cv!==undefined?Math.max(0,Math.min(1,(cv-mn)/(mx-mn))):0;
    const a0=-135*Math.PI/180, a1=(-135+p*270)*Math.PI/180, r=58;
    const x1=100+Math.cos(a0)*r,y1=100+Math.sin(a0)*r,x2=100+Math.cos(a1)*r,y2=100+Math.sin(a1)*r;
    const arc=document.getElementById('hudBigArc');
    arc.setAttribute('d',`M ${x1} ${y1} A ${r} ${r} 0 ${p>0.5?1:0} 1 ${x2} ${y2}`);
    arc.setAttribute('stroke',col); arc.style.filter=`drop-shadow(0 0 7px ${col})`;
  }
  // hoekmeters
  document.querySelectorAll('.hudMini').forEach((m,slot)=>{
    const pid=hudCorners[slot]; const d=getPidDef(pid); if(!d) return;
    const v=pidVals[pid]; const ok=isPIDOk(pid);
    const col=ok?hudColor(slot):'#ff006e';
    const mv=m.querySelector('.mv');
    mv.textContent=v!==undefined?fv(v):'—'; mv.style.color=col;
    const mn=d.min??0, mx=d.max??255;
    const p=v!==undefined?Math.max(0,Math.min(1,(v-mn)/(mx-mn))):0;
    setMiniArc(m,p,col);
  });
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closeNeonDashboard(); closeRitAnalyse(); }
});

// Terugkeer naar de app zonder volledige herlaad (tab-wissel, ander venster):
// is de verbinding ondertussen weggevallen, dan automatisch herverbinden.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible') return;
  try{
    if(localStorage.getItem('pl_autoconn')!=='1') return;
    if(demoMode||window._reconnBusy) return;
    if(!getSPP()) return;
    window._reconnBusy=true;
    log('App weer actief — verbinding controleren...','info');
    setTimeout(async()=>{
      try{
        // Android sluit de SPP-socket vaak STIL op de achtergrond terwijl
        // connected nog true is (bv. bij overschakelen naar Outlook). Dan denkt
        // de app onterecht dat hij nog verbonden is. Daarom eerst echt verifiëren.
        if(connected && window._sppConn){
          let alive=false;
          try{
            const c=await window._sppConn.spp.isConnected({address:window._sppConn.address});
            alive=(c?.isConnected!==false&&c?.connected!==false&&c!==false);
          }catch(e){ alive=false; }
          if(!alive){
            log('Verbinding viel weg op de achtergrond — herverbinden...','warn');
            connected=false; setConn(false);
          }
        }
        if(!connected) await connectSerial();
      }
      finally{ window._reconnBusy=false; }
    },800);
  }catch(e){ window._reconnBusy=false; }
});
window.addEventListener('resize',()=>{
  if(document.getElementById('neonDash').style.display!=='none') renderHud();
});
