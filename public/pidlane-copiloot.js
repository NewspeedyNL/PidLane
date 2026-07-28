// ══════════════════════════════════════════════════════════════════
// pidlane-copiloot.js
// Copiloot — ontwikkelassistent (admin-only)
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// COPILOOT — ontwikkelassistent in de app (admin-only)
// ──────────────────────────────────────────────────────────────────
// Een chatpaneel dat live meekijkt: elke vraag gaat naar /copilot in de
// Worker samen met een momentopname (busstaat, PID-cadans, recente log,
// diagnosebundel). Zo hoeft er geen log meer geëxporteerd en geüpload te
// worden, en draait dit op de eigen Anthropic-key via de Worker — los van
// het chatlimiet van de ontwikkelaar.
//
// De assistent kan code TONEN in een blok. Toepassen gebeurt nooit vanzelf:
// de ontwikkelaar drukt op Toepassen, de originele functie wordt eerst
// bewaard, en Ongedaan maken zet 'm exact terug. Alleen window.*-functies
// (scheduler, parser) zijn zo te patchen; closures niet.
const _plCopilotHist=[];              // {role, content}
const _plPatchBackup={};              // naam -> originele functie, voor undo

function plCopilotContext(){
  const veilig=f=>{ try{ return f(); }catch(e){ return null; } };
  return {
    bus: veilig(()=>PLBus.stats()),
    belasting: veilig(()=>PLLoad.staat()),
    pids: veilig(()=>PLSched.actief().map(p=>PLSched.info(p)))||[],
    applog: veilig(()=>_lcLines('app').slice(-40))||[],
    btlog: veilig(()=>_lcLines('bt').slice(-40))||[],
    diag: veilig(()=>JSON.parse(plDiagBundle()).gevallen.slice(-20))||[]
  };
}

function plCopilotOpen(){
  let ov=document.getElementById('plCopilotOverlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='plCopilotOverlay';
    ov.style.cssText='position:fixed;inset:0;z-index:9998;background:var(--bg);display:flex;flex-direction:column';
    ov.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--bd)">'+
        '<span style="font-size:17px;font-weight:800">🤝 Copiloot</span>'+
        '<span style="font-size:11px;color:var(--tx3)">kijkt live mee · admin</span>'+
        '<button id="plCopilotClose" style="margin-left:auto;background:var(--sur2);border:none;color:var(--tx);font-size:15px;padding:6px 12px;border-radius:8px;cursor:pointer">✕</button>'+
      '</div>'+
      '<div id="plCopilotStream" style="flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px"></div>'+
      '<div style="padding:10px 12px;border-top:1px solid var(--bd);display:flex;gap:8px">'+
        '<textarea id="plCopilotIn" rows="1" placeholder="Vraag of beschrijf de bug…" style="flex:1;resize:none;background:var(--sur2);border:1px solid var(--bd);color:var(--tx);border-radius:10px;padding:9px 11px;font-size:14px;font-family:inherit"></textarea>'+
        '<button id="plCopilotSend" onclick="plCopilotSend()" style="background:var(--ac);border:none;color:#fff;font-weight:700;padding:0 16px;border-radius:10px;cursor:pointer">➤</button>'+
      '</div>';
    document.body.appendChild(ov);
    const cl=ov.querySelector('#plCopilotClose'); if(cl) cl.addEventListener('click',()=>{ ov.style.display='none'; });
    const ta=ov.querySelector('#plCopilotIn');
    ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); plCopilotSend(); }});
    if(!_plCopilotHist.length) _plCopilotBubble('assistant','Ik kijk mee met de busstaat, PID-cadans en de laatste logregels. Beschrijf de bug of stel een vraag — vraag me om de diagnosebundel als ik bytes nodig heb.');
  }
  ov.style.display='flex';
}

function _plCopilotBubble(role, tekst){
  const stream=document.getElementById('plCopilotStream'); if(!stream) return null;
  const b=document.createElement('div');
  const mij=role==='user';
  b.style.cssText='max-width:88%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;'+
    (mij?'align-self:flex-end;background:var(--ac);color:#fff':'align-self:flex-start;background:var(--sur2);color:var(--tx)');
  b.textContent=tekst;
  stream.appendChild(b); stream.scrollTop=stream.scrollHeight;
  return b;
}

// Codeblokken uit het antwoord halen en er een Toepassen-knop bij zetten.
function _plCopilotRenderCode(tekst){
  const stream=document.getElementById('plCopilotStream'); if(!stream) return;
  const re=/```(?:js|javascript)?\\n([\\s\\S]*?)```/g; let m;
  while((m=re.exec(tekst))){
    const code=m[1].trim();
    const naam=(code.match(/window\\.([A-Za-z_$][\\w$]*)\\s*=/)||code.match(/function\\s+([A-Za-z_$][\\w$]*)/)||[])[1]||null;
    const wrap=document.createElement('div');
    wrap.style.cssText='align-self:flex-start;max-width:95%;background:#0d1117;border:1px solid var(--bd);border-radius:12px;overflow:hidden';
    const pre=document.createElement('pre');
    pre.style.cssText='margin:0;padding:10px 12px;overflow-x:auto;font-size:12px;color:#c9d1d9';
    pre.textContent=code;
    wrap.appendChild(pre);
    const bar=document.createElement('div');
    bar.style.cssText='display:flex;gap:8px;padding:8px 10px;border-top:1px solid var(--bd);align-items:center';
    const info=document.createElement('span');
    info.style.cssText='font-size:11px;color:var(--tx3);margin-right:auto';
    info.textContent=naam?('patcht '+naam):'geen window.*-functie herkend';
    bar.appendChild(info);
    if(naam){
      const bT=document.createElement('button');
      bT.textContent='⚠ Toepassen (test)';
      bT.style.cssText='background:var(--or);border:none;color:#000;font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px;cursor:pointer';
      bT.onclick=()=>_plApplyPatch(naam, code, bar);
      bar.appendChild(bT);
    }
    wrap.appendChild(bar);
    stream.appendChild(wrap);
  }
  stream.scrollTop=stream.scrollHeight;
}

function _plApplyPatch(naam, code, bar){
  try{
    if(!(naam in _plPatchBackup)) _plPatchBackup[naam]=window[naam];   // origineel bewaren
    (0,eval)(code);                                                     // in global scope
    if(typeof window[naam]!=='function') throw new Error(naam+' is na patch geen functie');
    btDiag('🧪 Live patch toegepast op '+naam+' (test)','warn');
    bar.querySelectorAll('button').forEach(b=>b.remove());
    const ok=document.createElement('span'); ok.style.cssText='font-size:12px;color:var(--gn);font-weight:700'; ok.textContent='✓ actief';
    const un=document.createElement('button');
    un.textContent='↩ Ongedaan';
    un.style.cssText='background:var(--sur2);border:1px solid var(--bd);color:var(--tx);font-size:12px;padding:6px 12px;border-radius:8px;cursor:pointer';
    un.onclick=()=>{ window[naam]=_plPatchBackup[naam]; delete _plPatchBackup[naam];
      btDiag('↩ Patch op '+naam+' teruggedraaid','info'); un.remove(); ok.textContent='✓ origineel terug'; };
    bar.appendChild(ok); bar.appendChild(un);
  }catch(e){
    btDiag('Patch mislukt: '+e.message,'err');
    showToast?.('Patch mislukt: '+e.message);
  }
}

async function plCopilotSend(){
  const ta=document.getElementById('plCopilotIn'); if(!ta) return;
  const vraag=ta.value.trim(); if(!vraag) return;
  ta.value='';
  _plCopilotBubble('user',vraag);
  _plCopilotHist.push({role:'user',content:vraag});
  const btn=document.getElementById('plCopilotSend'); if(btn){ btn.disabled=true; btn.textContent='…'; }
  const denk=_plCopilotBubble('assistant','…');
  try{
    const resp=await fetch(PROXY_URL+'/copilot',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-App-Token':(typeof APP_TOKEN!=='undefined'?APP_TOKEN:'')},
      body:JSON.stringify({
        model:'claude-sonnet-4-6',
        max_tokens:2048,
        messages:_plCopilotHist.slice(-16),
        context: plCopilotContext()
      })
    });
    const data=await resp.json();
    let txt='';
    if(Array.isArray(data.content)) txt=data.content.filter(x=>x.type==='text').map(x=>x.text).join('\\n');
    else if(data.error) txt='⚠ '+(data.error.hint||data.error.message||JSON.stringify(data.error));
    txt=txt||'(leeg antwoord)';
    if(denk) denk.textContent=txt;
    _plCopilotHist.push({role:'assistant',content:txt});
    _plCopilotRenderCode(txt);
  }catch(e){
    if(denk) denk.textContent='⚠ Verbinding mislukt: '+e.message;
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='➤'; }
  }
}
window.plCopilotOpen=plCopilotOpen;
window.plCopilotSend=plCopilotSend;
