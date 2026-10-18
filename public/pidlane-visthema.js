// ══════════════════════════════════════════════════════════════════
// pidlane-visthema.js — PLVisThema: Slim visueel op het volle scherm,
// met een eigen thema (18-10-2026)
// ──────────────────────────────────────────────────────────────────
// Uit het gebruik: "alleen voor Visueel een knop voor volledig scherm, met
// daarin een themaknop met meerdere thema's. Uit volledig scherm is gewoon
// weer standaard." Dus:
//   • de knop ⛶ boven de meter zet body.pl-vis-vol; pidlane.css maakt de
//     .vis dan schermvullend en verbergt de rest van de app;
//   • het thema geldt alléén op het volle scherm (data-vthema op .vis);
//     daarbuiten blijft de gewone weergave, en de keuze wordt onthouden
//     voor de volgende keer (localStorage pl_vis_thema);
//   • een thema is CSS: het zet de kleurvariabelen van de meter om en
//     voegt gloed of een verloop toe. De meetwaarden blijven via
//     PLVisueel lopen; dit bestand raakt geen PID en geen bus.
// Het ✕ op het volle scherm heet "Sluit volledig scherm", zodat de
// terugknop (_plBovensteSluitKnop in pidlane-archief.js) hem vindt.
// Test: test-visthema.js (puur), bproef-visthema.js (de echte app).
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const SLEUTEL = 'pl_vis_thema';
const STANDAARD = 'standaard';
const SWEEP_MS = 1400;

// voorbeeld: de achtergrond van het rondje in de keuzestrook.
const THEMAS = [
  { id:'standaard', naam:'Standaard', voorbeeld:'radial-gradient(circle at 50% 40%, #1e2a44, #0b1220)' },
  { id:'neon',      naam:'Neon',      voorbeeld:'radial-gradient(circle, #0b1030 45%, #22d3ee 47%, #a21caf 62%, #0b1030 66%)' },
  { id:'spectrum',  naam:'Spectrum',  voorbeeld:'conic-gradient(from 210deg, #2563eb, #10b981, #facc15, #f97316, #ef4444, #0a0a0a 300deg)' },
  { id:'chroom',    naam:'Chroom',    voorbeeld:'radial-gradient(circle at 35% 30%, #ffffff, #cbd5e1 40%, #64748b 75%, #1e293b)' },
  { id:'carbon',    naam:'Carbon',    voorbeeld:'repeating-linear-gradient(45deg, #1a1d21 0 4px, #0d0f12 4px 8px)' },
  { id:'nacht',     naam:'Nachtrood', voorbeeld:'radial-gradient(circle, #2a0505, #000 70%)' }
];

function geldig(id){ return THEMAS.some(function(t){ return t.id===id; }); }
function lees(){
  try{ const v=localStorage.getItem(SLEUTEL); return geldig(v) ? v : STANDAARD; }
  catch(e){ console.warn('PLVisThema: themakeuze onleesbaar — standaard', e); return STANDAARD; }
}
function bewaar(id){
  if(!geldig(id)) return false;
  try{ localStorage.setItem(SLEUTEL, id); }
  catch(e){ console.warn('PLVisThema: themakeuze niet bewaard', e); }
  return true;
}
// Het thema dat een .vis krijgt: alleen op het volle scherm (zie de kop).
function themaVoor(vol, gekozen){ return vol ? (geldig(gekozen) ? gekozen : STANDAARD) : null; }

// ── SVG: verlopen die CSS niet zelf kan maken ────────────────────────
// Spectrum loopt van links (0 tpm) over boven naar rechts (rood): een
// verloop over x in de coördinaten van de viewBox (0–320).
const DEFS = '<defs class="vt-defs">'+
  '<linearGradient id="vtSpectrum" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="300" y2="0">'+
    '<stop offset="0" stop-color="#2563eb"/><stop offset=".3" stop-color="#10b981"/><stop offset=".55" stop-color="#facc15"/>'+
    '<stop offset=".78" stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/></linearGradient>'+
  '<radialGradient id="vtChroom" cx=".38" cy=".3" r=".85">'+
    '<stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#e2e8f0"/><stop offset=".8" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/></radialGradient>'+
  '<linearGradient id="vtChroomRand" x1="0" y1="0" x2="1" y2="1">'+
    '<stop offset="0" stop-color="#f8fafc"/><stop offset=".5" stop-color="#475569"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient>'+
  '<pattern id="vtCarbon" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'+
    '<rect width="8" height="8" fill="#0d0f12"/><rect width="4" height="4" fill="#1b1f24"/><rect x="4" y="4" width="4" height="4" fill="#1b1f24"/></pattern>'+
  '</defs>';

const _st = { lock:null, natief:false };

function vol(){ return typeof document!=='undefined' && !!document.body && document.body.classList.contains('pl-vis-vol'); }
function visEl(){ return document.querySelector('.gg.view-visueel .vis') || document.querySelector('.vis'); }

function knoppenHtml(){
  return '<div class="vt-knoppen">'+
    '<button type="button" class="vt-knop vt-vol" aria-label="Volledig scherm" title="Volledig scherm" onclick="PLVisThema.aan()">'+
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'+
    '<button type="button" class="vt-knop vt-thema" aria-label="Thema kiezen" title="Thema" onclick="PLVisThema.kies()">🎨</button>'+
    '<button type="button" class="vt-knop vt-uit" aria-label="Sluit volledig scherm" title="Sluit volledig scherm" onclick="PLVisThema.uit()">✕</button>'+
  '</div>';
}
function strookHtml(nu){
  return '<div class="vt-strook" role="listbox" aria-label="Thema">'+THEMAS.map(function(t){
    return '<button type="button" role="option" class="vt-keus'+(t.id===nu?' aan':'')+'" data-thema="'+t.id+'" aria-selected="'+(t.id===nu)+'" onclick="PLVisThema.zet(\''+t.id+'\')">'+
      '<i style="background:'+t.voorbeeld+'"></i><span>'+t.naam+'</span></button>';
  }).join('')+'</div>';
}

// Na elke opbouw van Slim visueel (PLVisueel.bouw): knoppen erin, verlopen in
// de meter, en het thema zetten. Mag vaker; doet dan niets dubbel.
function pas(vis){
  vis = vis || visEl();
  if(!vis) return;
  const t=themaVoor(vol(), lees());
  if(t) vis.setAttribute('data-vthema', t); else vis.removeAttribute('data-vthema');
  if(!vis.querySelector('.vt-knoppen')){
    const bak=vis.querySelector('.vis-bak') || vis;
    bak.insertAdjacentHTML('afterbegin', knoppenHtml());
  }
  vis.querySelectorAll('svg.vis-meter').forEach(function(s){ if(!s.querySelector('.vt-defs')) s.insertAdjacentHTML('afterbegin', DEFS); });
  const oud=vis.querySelector('.vt-strook');
  if(oud && !vol()) oud.remove();
}

// De naald zwaait één keer helemaal uit, zoals een echt dashboard bij het
// starten. CSS-animatie op de klasse; daarna staat hij weer op zijn waarde.
function zwaai(vis){
  const s=vis && vis.querySelector('svg.vis-meter');
  if(!s) return;
  s.classList.remove('vt-sweep'); void s.getBoundingClientRect(); s.classList.add('vt-sweep');
  setTimeout(function(){ s.classList.remove('vt-sweep'); }, SWEEP_MS);
}

function wakker(aan){
  try{
    if(aan && !_st.lock && navigator.wakeLock && navigator.wakeLock.request){
      navigator.wakeLock.request('screen').then(function(l){ _st.lock=l; })
        .catch(function(e){ console.warn('PLVisThema: scherm blijft niet aan', e); });
    } else if(!aan && _st.lock){ const l=_st.lock; _st.lock=null; l.release().catch(function(e){ console.warn('PLVisThema: wakelock loslaten mislukt', e); }); }
  }catch(e){ console.warn('PLVisThema: wakelock', e); }
}

function aan(){
  if(vol()) return;
  document.body.classList.add('pl-vis-vol');
  const vis=visEl();
  pas(vis); zwaai(vis); wakker(true);
  // Het echte volle scherm (statusbalk weg) waar de WebView het toestaat;
  // zonder dat blijft het CSS-scherm, en dat is genoeg.
  try{
    const d=document.documentElement;
    if(d.requestFullscreen && !document.fullscreenElement){
      d.requestFullscreen({ navigationUI:'hide' }).then(function(){ _st.natief=true; })
        .catch(function(e){ console.info('PLVisThema: geen systeemvolscherm, CSS-volscherm blijft', e && e.message); });
    }
  }catch(e){ console.info('PLVisThema: geen systeemvolscherm', e); }
}
function uit(){
  const was=vol();
  if(typeof document==='undefined' || !document.body) return;
  document.body.classList.remove('pl-vis-vol');
  wakker(false);
  if(_st.natief){
    _st.natief=false;
    try{ if(document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(e){ console.warn('PLVisThema: systeemvolscherm sluiten mislukt', e); }); }
    catch(e){ console.warn('PLVisThema: systeemvolscherm sluiten mislukt', e); }
  }
  if(was) pas();
}
function kies(){
  const vis=visEl();
  if(!vis || !vol()) return;
  const o=vis.querySelector('.vt-strook');
  if(o){ o.remove(); return; }
  vis.insertAdjacentHTML('beforeend', strookHtml(lees()));
}
function zet(id){
  if(!bewaar(id)) return false;
  const vis=visEl();
  pas(vis);
  if(vis){
    vis.querySelectorAll('.vt-keus').forEach(function(b){ const a=b.getAttribute('data-thema')===id; b.classList.toggle('aan', a); b.setAttribute('aria-selected', String(a)); });
    if(vol()) zwaai(vis);
  }
  return true;
}

// Systeemvolscherm door het toestel gesloten (veeggebaar): ook het onze dicht.
if(typeof document!=='undefined' && document.addEventListener){
  document.addEventListener('fullscreenchange', function(){
    if(!document.fullscreenElement && _st.natief){ _st.natief=false; uit(); }
  });
}

window.PLVisThema = {
  THEMAS:THEMAS, STANDAARD:STANDAARD, SLEUTEL:SLEUTEL,
  geldig:geldig, lees:lees, bewaar:bewaar, themaVoor:themaVoor,
  pas:pas, aan:aan, uit:uit, kies:kies, zet:zet, vol:vol
};
})();
