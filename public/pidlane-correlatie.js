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
//
// ── DE BRON VAN DE OVERSTROMING (issue #60, 30-08-2026) ──────────────
// De balk liep in demostand vol tot voorbij de onderkant van het scherm. De
// verleiding is dan om naar CORRELATION_RULES te kijken, maar dat zijn er
// vijf en die zijn hier niet het probleem. Het tweede deel van deze engine
// is dat wél: "leren-van-normaal" levert een bevinding PER ACTIEF PID dat
// meer dan BASE_DREMPEL sigma van zijn eigen historie afwijkt. Met 40
// aangevinkte sensoren zijn dat in het slechtste geval 40 regels — en in
// demostand is dat bijna het gunstigste geval, want die data is gesimuleerd
// en heeft met de opgebouwde historie van een échte auto niets te maken.
//
// Vandaar dat het plafond hier zit en niet bij de regels: het aantal
// bevindingen is niet fout, het aantal dat tegelijk IN BEELD past wel. De
// AI krijgt via correlationLines() nog steeds alles.
// ══════════════════════════════════════════════════════

// Hoeveel bevindingen er in de live view passen zonder hem over te nemen.
const BEV_MAX = 2;
const BEV_SLEUTEL = 'pl_bevindingen';

// Aan/uit. Alleen de BALK gaat uit — de engine blijft draaien en de AI krijgt
// de bevindingen gewoon mee. Dat verschil staat ook letterlijk in het venster,
// want "uit" dat stiekem ook de analyse verandert is precies het soort dubbele
// betekenis waar deze codebase al drie keer een bug aan overhield.
let _bevAan = true;
try { _bevAan = localStorage.getItem(BEV_SLEUTEL) !== '0'; }
catch(e){ console.warn('Voorkeur voor de bevindingenbalk niet te lezen, blijft aan:', e); }

let _lastCorrelations=[];
let _bevHits=[];          // de volledige set van de laatste ronde, voor het venster

function bevindingenAan(){ return _bevAan; }
function bevindingenZet(aan){
  _bevAan = !!aan;
  try { localStorage.setItem(BEV_SLEUTEL, _bevAan ? '1' : '0'); }
  catch(e){ console.warn('Voorkeur voor de bevindingenbalk niet op te slaan:', e); }
  bevindingenMenuBij();
  renderCorrelationBanner(_bevHits);
  try{ logUsage?.('bevindingen', _bevAan?'aan':'uit'); }catch(e){ console.warn('logUsage mislukt:', e); }
}
// Zet het aan/uit-knopje in het ☰-menu op de huidige stand.
function bevindingenMenuBij(){
  try{
    const a=document.getElementById('bevAanBtn'), u=document.getElementById('bevUitBtn');
    if(a) a.classList.toggle('on', _bevAan);
    if(u) u.classList.toggle('on', !_bevAan);
  }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
}
document.addEventListener('DOMContentLoaded', bevindingenMenuBij);

function runCorrelationEngine(){
  const hits=[];
  for(const r of CORRELATION_RULES){
    // ernst 2: een regel beschrijft een bekend defectpatroon en gaat dus vóór
    // een statistische afwijking, die alleen zegt "anders dan anders".
    try{ if(r.test()) hits.push({id:r.id, naam:r.naam, uitleg:r.uitleg, ernst:2, rang:0}); }
    catch(e){ /* stil: sonde — test alleen of dit patroon matcht */ }
  }
  // Idee 3: leren-van-normaal — voeg statistische afwijkingen t.o.v. de
  // eigen voertuighistorie toe als bevinding (alleen voor actieve PIDs).
  const baseHits=[];
  for(const pid of activePIDs){
    if(pidVals[pid]===undefined) continue;
    const b=(typeof baselineBevinding==='function')?baselineBevinding(pid):null;
    if(b) baseHits.push({id:'base_'+pid, naam:'Afwijkend t.o.v. normaal voor deze auto',
                         uitleg:b.tekst, ernst:1, rang:b.dev});
  }
  // Ernstigste eerst, en binnen de statistische afwijkingen de grootste sigma
  // bovenaan — want dát zijn de twee die straks als enige in beeld staan.
  const all=[...hits,...baseHits].sort((a,b)=> (b.ernst-a.ernst) || (b.rang-a.rang));
  _bevHits=all;
  // Alleen herrenderen als de set veranderd is (voorkomt flikkering)
  const sig=all.map(h=>h.id).join(',');
  if(sig===_lastCorrelations.join(',')) return;
  _lastCorrelations=all.map(h=>h.id);
  renderCorrelationBanner(all);
}

function _bevRegelHtml(h){
  return `<div style="padding:8px 10px;border-top:1px solid var(--bd);font-size:12px"><b>${h.naam}</b><br><span style="color:var(--tx2)">${h.uitleg}</span></div>`;
}

function renderCorrelationBanner(hits){
  hits = hits || [];
  let box=document.getElementById('corrBanner');
  // Uit, of niets gevonden: geen balk. Twee verschillende redenen, dezelfde
  // uitkomst — maar de sheet blijft wél werken als hij openstaat.
  if(!_bevAan || !hits.length){ if(box) box.style.display='none'; _bevSheetBij(); return; }
  if(!box){
    box=document.createElement('div'); box.id='corrBanner';
    box.style.cssText='margin:0 0 12px;border-radius:var(--r);overflow:hidden;border:1px solid var(--or)';
    const live=document.getElementById('pane-live');
    if(live) live.insertBefore(box, live.firstChild);
  }
  box.style.display='block';
  const zichtbaar=hits.slice(0, BEV_MAX);
  const rest=hits.length-zichtbaar.length;
  box.innerHTML=
    `<div style="display:flex;align-items:center;gap:8px;background:var(--ors);color:var(--or);font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:6px 10px">`+
      `<span style="flex:1;min-width:0">🔗 Automatische bevindingen (${hits.length})</span>`+
      `<button type="button" onclick="bevindingenZet(false)" title="Balk uitzetten — de AI krijgt de bevindingen wél gewoon mee" style="flex:none;width:20px;height:20px;border-radius:5px;border:1px solid var(--or);background:transparent;color:var(--or);font-size:11px;font-weight:800;cursor:pointer;line-height:1">✕</button>`+
    `</div>`+
    zichtbaar.map(_bevRegelHtml).join('')+
    (rest>0
      ? `<button type="button" onclick="openBevindingen()" style="display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-top:1px solid var(--bd);background:var(--sur2);color:var(--bl);font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">nog ${rest} bevinding${rest===1?'':'en'} — bekijk alles →</button>`
      : `<button type="button" onclick="openBevindingen()" style="display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-top:1px solid var(--bd);background:var(--sur2);color:var(--tx3);font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">bekijk in een venster →</button>`);
  _bevSheetBij();
}

// ── Het venster met álle bevindingen ────────────────────────────────
// Twee in de balk is een keuze over schermruimte, geen oordeel dat de rest
// er niet toe doet. Hier staat de volledige set, met dezelfde volgorde.
function openBevindingen(){
  let ov=document.getElementById('bevSheet');
  if(!ov){
    ov=document.createElement('div'); ov.id='bevSheet'; ov.className='ai-sheet-ov';
    ov.style.zIndex='9890'; document.body.appendChild(ov);
    ov.addEventListener('click', e=>{ if(e.target===ov) closeBevindingen(); });
  }
  _bevSheetBij(true);
  ov.style.display='flex';
}
function closeBevindingen(){
  const o=document.getElementById('bevSheet'); if(o) o.style.display='none';
}
// Vult het venster met de huidige stand. Wordt ook aangeroepen als de balk
// hertekent, zodat een openstaand venster niet naar oude data staat te kijken.
function _bevSheetBij(forceer){
  const ov=document.getElementById('bevSheet');
  if(!ov) return;
  if(!forceer && ov.style.display!=='flex') return;
  const hits=_bevHits||[];
  const rijen = hits.length
    ? hits.map(_bevRegelHtml).join('')
    : '<div class="emp" style="padding:22px 0"><div class="ei">🔗</div><h3>Geen bevindingen</h3><p>De correlatie-engine ziet op dit moment geen verdacht patroon.</p></div>';
  const seg=(aan,lbl)=>'<button type="button" class="kb-seg'+((_bevAan===aan)?' on':'')+'" onclick="bevindingenZet('+aan+')">'+lbl+'</button>';
  ov.innerHTML='<div class="ai-sheet">'+
    '<div class="ai-sheet-h"><b>🔗 Automatische bevindingen ('+hits.length+')</b>'+
      '<button class="ai-sheet-x" onclick="closeBevindingen()">✕</button></div>'+
    '<div class="ai-sheet-b">'+
      '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--bd);border-radius:10px;padding:9px 10px;margin-bottom:10px;background:var(--sur2)">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:11px;font-weight:800;color:var(--tx2)">Balk in de live view</div>'+
          '<div style="font-size:11px;color:var(--tx3)">Uit = alleen deze balk verdwijnt. De AI krijgt de bevindingen bij een analyse gewoon mee.</div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex:none">'+seg(true,'Aan')+seg(false,'Uit')+'</div>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--tx3);margin-bottom:4px">In de live view staan de '+BEV_MAX+' ernstigste; hieronder staat alles.</div>'+
      '<div style="border:1px solid var(--bd);border-radius:10px;overflow:hidden">'+rijen+'</div>'+
    '</div>'+
  '</div>';
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
