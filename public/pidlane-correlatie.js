// ══════════════════════════════════════════════════════════════════
// pidlane-correlatie.js
// Deterministische PID-correlatie-engine
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// IDEE 4 — DETERMINISTISCHE PID-CORRELATIE-ENGINE
// Detecteert bekende verdachte combinaties zonder AI (snel, offline, altijd).
// Draait na elke pollronde; resultaat verschijnt als bevindingen-banner.
// ══════════════════════════════════════════════════════
// → CORRELATION_RULES verplaatst naar pidlane-data.js
let _lastCorrelations=[];
function runCorrelationEngine(){
  const hits=[];
  for(const r of CORRELATION_RULES){
    try{ if(r.test()) hits.push(r); }catch(e){ /* stil: sonde — test alleen of dit patroon matcht */ }
  }
  // Idee 3: leren-van-normaal — voeg statistische afwijkingen t.o.v. de
  // eigen voertuighistorie toe als bevinding (alleen voor actieve PIDs).
  const baseHits=[];
  for(const pid of activePIDs){
    const v=pidVals[pid]; if(v===undefined) continue;
    const w=baselineWarning(pid,v);
    if(w) baseHits.push({id:'base_'+pid, naam:'Afwijkend t.o.v. normaal voor deze auto', uitleg:w});
  }
  const all=[...hits,...baseHits];
  // Alleen herrenderen als de set veranderd is (voorkomt flikkering)
  const sig=all.map(h=>h.id).join(',');
  if(sig===_lastCorrelations.join(',')) return;
  _lastCorrelations=all.map(h=>h.id);
  renderCorrelationBanner(all);
}
function renderCorrelationBanner(hits){
  let box=document.getElementById('corrBanner');
  if(!hits.length){ if(box) box.style.display='none'; return; }
  if(!box){
    box=document.createElement('div'); box.id='corrBanner';
    box.style.cssText='margin:0 0 12px;border-radius:var(--r);overflow:hidden;border:1px solid var(--or)';
    const live=document.getElementById('pane-live');
    if(live) live.insertBefore(box, live.firstChild);
  }
  box.style.display='block';
  box.innerHTML=`<div style="background:var(--ors);color:var(--or);font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:6px 10px">🔗 Automatische bevindingen (${hits.length})</div>`+
    hits.map(h=>`<div style="padding:8px 10px;border-top:1px solid var(--bd);font-size:12px"><b>${h.naam}</b><br><span style="color:var(--tx2)">${h.uitleg}</span></div>`).join('');
}
// Tekstregels voor in AI-prompts en rapporten
function correlationLines(){
  const lines=CORRELATION_RULES.filter(r=>{try{return r.test();}catch(e){return false;}})
    .map(r=>`• ${r.naam}: ${r.uitleg}`);
  for(const pid of activePIDs){
    const v=pidVals[pid]; if(v===undefined) continue;
    const w=baselineWarning(pid,v); if(w) lines.push('• '+w);
  }
  // B1S1 breedband-fix: geef de AI de juiste lambda-bron, zodat het een dode
  // smalband 0113 niet als "B1S1 abnormaal laag" rapporteert.
  const b=b1s1Line(); if(b) lines.push('• '+b);
  return lines;
}
