// ══════════════════════════════════════════════════════════════════
// pidlane-visprofiel.js — vijf weergaven in Slim visueel (02-10-2026)
// ──────────────────────────────────────────────────────────────────
// Uit het gebruik: "5 weergave-mogelijkheden, de basis blijft gelijk, alleen
// de specifieke profielen — temperatuur, emissie, verbruik, motor — krijgen
// een eigen visuele weergave. Via een knop 'volgende weergave' snel
// schakelen." Dat is dit bestand.
//
//   basis        de vaste meter uit pidlane-visueel.js — ongewijzigd
//   temperatuur  GLAS     vijf thermometerbuizen achter mat glas
//   emissie      LICHT    een lichte kaart: lambda op een schaal rond 1,00 en
//                         de brandstoftrims als balk vanuit het midden
//   verbruik     DIGITAAL een LCD-paneel met grote cijfers en segmentbalken
//   motor        NEON     ringen om elkaar heen: toeren, belasting, gasklep
//
// HET KADER BLIJFT. Lampjes bovenaan, meldingen en snelkoppelingen onderaan,
// de trekstrook: dat tekent pidlane-visueel.js zoals altijd. Alleen het vak
// van de meter wisselt. Een profiel is daarmee een tekening en geen tweede
// scherm: wat er loopt en wat er gevonden is staat op dezelfde plek.
//
// WAT HIER STAAT EN WAT NIET. Dit bestand kent de profielen (PROFIELEN), kiest
// per plek de eerste bruikbare PID uit een keten (indeling(), puur: de
// bruikbaarheid komt van buiten), tekent de HTML (html()) en zet één waarde
// op zijn plek (bij()). Welke PIDs aangezet worden, het remmen van de rest,
// "dit antwoord is oud" en het opnieuw opbouwen blijven in pidlane-visueel.js:
// die regels zijn daar al getoetst, en een tweede kopie loopt uit de pas.
//
// Eén waarde mag de tekening niet verstoren: elke vulling is begrensd op
// 0–100 (deel()), een ontbrekende PID is "—" met een lege balk, en de vaste
// maten staan in de CSS (.vpf-…), niet in de meetwaarden.
//
// De keuze wordt onthouden in localStorage (pl_vis_profiel), per toestel.
// test-visprofiel.js toetst indeling(), deel(), tekst() en de volgorde.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const SLEUTEL = 'pl_vis_profiel';

/* Soorten plekken:
     thermo   staande buis, vult van onder (glas)
     balk     liggende balk vanaf links
     midden   liggende balk vanuit het midden, voor iets dat om nul draait
     lambda   een schaal rond 1,00 met een wijzertje
     segment  een rij van SEG blokjes (digitaal)
     ring     een cirkel om het midden (neon)
     getal    alleen het getal
   lo/hi = het bereik van de vulling; dec = decimalen in de tekst. */
const SEG = 20;
const PROFIELEN = [
  { id:'basis', naam:'Basis', stijl:'basis', ondertitel:'De vaste meter' },
  { id:'temp', naam:'Temperatuur', stijl:'glas', ondertitel:'Glas',
    plekken:[
      { rol:'koel',   naam:'Koelwater',   kort:'Koel',    keten:['0105','0167'], eenheid:'°', soort:'thermo', lo:40, hi:130, dec:0 },
      { rol:'olie',   naam:'Motorolie',   kort:'Olie',    keten:['015C'],        eenheid:'°', soort:'thermo', lo:40, hi:150, dec:0 },
      { rol:'inlaat', naam:'Inlaatlucht', kort:'Inlaat',  keten:['010F'],        eenheid:'°', soort:'thermo', lo:-20, hi:80, dec:0 },
      { rol:'buiten', naam:'Buiten',      kort:'Buiten',  keten:['0146'],        eenheid:'°', soort:'thermo', lo:-20, hi:45, dec:0 },
      { rol:'kat',    naam:'Katalysator', kort:'Kat',     keten:['013C','013E','017C'], eenheid:'°', soort:'thermo', lo:100, hi:950, dec:0 }
    ] },
  { id:'emissie', naam:'Emissie', stijl:'licht', ondertitel:'Licht',
    plekken:[
      { rol:'lambda', naam:'Lambda',             keten:['0124','0134','0144'], eenheid:'λ', soort:'lambda', lo:0.8, hi:1.2, dec:2 },
      { rol:'kort',   naam:'Brandstoftrim kort', keten:['0106'], eenheid:'%', soort:'midden', lo:-25, hi:25, dec:1 },
      { rol:'lang',   naam:'Brandstoftrim lang', keten:['0107'], eenheid:'%', soort:'midden', lo:-25, hi:25, dec:1 },
      { rol:'kat',    naam:'Katalysator',        keten:['013C','013E','017C'], eenheid:'°C', soort:'balk', lo:100, hi:950, dec:0 },
      { rol:'o2',     naam:'O₂ na de kat',       keten:['0115'], eenheid:'V', soort:'balk', lo:0, hi:1, dec:2 },
      { rol:'egr',    naam:'EGR',                keten:['012C'], eenheid:'%', soort:'balk', lo:0, hi:100, dec:0 }
    ] },
  { id:'verbruik', naam:'Verbruik', stijl:'digitaal', ondertitel:'Digitaal',
    plekken:[
      { rol:'nu',     naam:'Verbruik nu', keten:['CA03','015E','CA02'], eenheid:'', soort:'segment', lo:0, hi:20, dec:1, groot:true },
      { rol:'snel',   naam:'Snelheid',    keten:['010D'], eenheid:'km/u', soort:'getal', lo:0, hi:200, dec:0 },
      { rol:'pedaal', naam:'Gaspedaal',   keten:['0149','015A','014A','0111'], eenheid:'%', soort:'segment', lo:0, hi:100, dec:0 },
      { rol:'maf',    naam:'Luchtmassa',  keten:['0110'], eenheid:'g/s', soort:'segment', lo:0, hi:150, dec:1 },
      { rol:'tank',   naam:'Tank',        keten:['012F'], eenheid:'%', soort:'segment', lo:0, hi:100, dec:0 }
    ] },
  { id:'motor', naam:'Motor', stijl:'neon', ondertitel:'Neon',
    plekken:[
      { rol:'toeren',   naam:'Toerental',   keten:['010C'], eenheid:'rpm', soort:'ring', lo:0, hi:8000, dec:0, groot:true },
      { rol:'last',     naam:'Belasting',   keten:['0104','0143'], eenheid:'%', soort:'ring', lo:0, hi:100, dec:0 },
      { rol:'gasklep',  naam:'Gasklep',     keten:['0111','0149'], eenheid:'%', soort:'ring', lo:0, hi:100, dec:0 },
      { rol:'map',      naam:'Inlaatdruk',  keten:['010B'], eenheid:'kPa', soort:'getal', lo:0, hi:255, dec:0 },
      { rol:'timing',   naam:'Ontsteking',  keten:['010E','015D'], eenheid:'°', soort:'getal', lo:-40, hi:60, dec:0 },
      { rol:'maf',      naam:'Luchtmassa',  keten:['0110'], eenheid:'g/s', soort:'getal', lo:0, hi:655, dec:1 }
    ] }
];
// De ringen van buiten naar binnen; de straal staat hier en niet in de CSS,
// want de tekening is een SVG met een vaste viewBox.
const RING_R = { toeren:86, last:68, gasklep:50 };

function zoek(id){ for(let i=0;i<PROFIELEN.length;i++){ if(PROFIELEN[i].id===id) return PROFIELEN[i]; } return null; }
function geldig(id){ return !!zoek(id); }
/* Het profiel na `id`, rond. Onbekend = het eerste na de basis. */
function volgende(id){
  const i=PROFIELEN.findIndex(function(p){ return p.id===id; });
  return PROFIELEN[(i<0 ? 1 : i+1) % PROFIELEN.length].id;
}
function lees(){
  try{ const v=localStorage.getItem(SLEUTEL); return geldig(v) ? v : 'basis'; }
  catch(e){ console.warn('PLVisProfiel: keuze niet te lezen, basis', e); return 'basis'; }
}
function bewaar(id){
  try{ localStorage.setItem(SLEUTEL, id); }
  catch(e){ console.warn('PLVisProfiel: keuze niet op te slaan', e); }
}

/* Welke PID staat op welke plek? Per plek de eerste uit de keten waarvoor
   `mag(pid)` waar is, anders null. Puur. */
function indeling(id, mag){
  const p=zoek(id);
  if(!p || !p.plekken) return null;
  const uit={ id:p.id, plekken:{} };
  p.plekken.forEach(function(x){
    let pid=null;
    for(let i=0;i<x.keten.length;i++){ if(mag(x.keten[i])){ pid=x.keten[i]; break; } }
    uit.plekken[x.rol]=pid;
  });
  return uit;
}
/* De ketens van een profiel: wat pidlane-visueel.js erbij moet zetten. */
function ketens(id){
  const p=zoek(id);
  return (p && p.plekken) ? p.plekken.map(function(x){ return x.keten.slice(); }) : [];
}
/* Hoe ver gevuld, 0–100. Niet te lezen = null. */
function deel(v, lo, hi){
  const n=Number(v);
  if(v===null || v===undefined || v==='' || !isFinite(n) || !(hi>lo)) return null;
  return Math.max(0, Math.min(100, (n-lo)/(hi-lo)*100));
}
/* De tekst bij een waarde: komma als decimaalteken, "—" als hij ontbreekt.
   Begrensd op vijf tekens voor het teken: een kapotte waarde van 65535
   duwt het vak niet open. */
function tekst(v, dec){
  const n=Number(v);
  if(v===null || v===undefined || v==='' || !isFinite(n)) return '—';
  if(Math.abs(n)>=100000) return n<0 ? '−99k+' : '99k+';
  return n.toFixed(dec||0).replace('.',',').replace('-','−');
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function plekVan(p, rol){ for(let i=0;i<p.plekken.length;i++){ if(p.plekken[i].rol===rol) return p.plekken[i]; } return null; }

// ── DE TEKENINGEN ─────────────────────────────────────────────────
function titel(x, pid){ return esc(x.naam)+(pid ? ' ('+pid+')' : ': niet beschikbaar op deze auto'); }

function htmlGlas(p, ind){
  return '<div class="vpf-buizen">'+p.plekken.map(function(x){
    const pid=ind.plekken[x.rol];
    return '<div class="vpf-buis'+(pid?'':' leeg')+'" id="vpf-p-'+x.rol+'" title="'+titel(x, pid)+'">'+
      '<b class="vpf-w" id="vpf-w-'+x.rol+'">—</b>'+
      '<span class="vpf-tube"><i class="vpf-f" id="vpf-f-'+x.rol+'" style="height:0%"></i></span>'+
      '<span class="vpf-bol"></span>'+
      '<small>'+esc(x.kort||x.naam)+'</small></div>';
  }).join('')+'</div>';
}
function htmlLicht(p, ind){
  const l=plekVan(p, 'lambda'), lp=ind.plekken.lambda;
  let h='<div class="vpf-lambda'+(lp?'':' leeg')+'" id="vpf-p-lambda" title="'+titel(l, lp)+'">'+
      '<small>Lambda — 1,00 is de ideale verbranding</small>'+
      '<b class="vpf-w" id="vpf-w-lambda">—</b>'+
      '<span class="vpf-schaal"><i class="vpf-rijk">rijk</i><i class="vpf-een"></i><i class="vpf-arm">arm</i>'+
        '<i class="vpf-wijzer" id="vpf-f-lambda" style="left:50%"></i></span></div>';
  h+='<div class="vpf-rijen">'+p.plekken.filter(function(x){ return x.rol!=='lambda'; }).map(function(x){
    const pid=ind.plekken[x.rol];
    return '<div class="vpf-rij '+x.soort+(pid?'':' leeg')+'" id="vpf-p-'+x.rol+'" title="'+titel(x, pid)+'">'+
      '<small>'+esc(x.naam)+'</small>'+
      '<span class="vpf-baan">'+(x.soort==='midden' ? '<i class="vpf-nul"></i>' : '')+
        '<i class="vpf-f" id="vpf-f-'+x.rol+'" style="'+(x.soort==='midden' ? 'left:50%;width:0%' : 'width:0%')+'"></i></span>'+
      '<b class="vpf-w" id="vpf-w-'+x.rol+'">—</b><i class="vpf-e">'+esc(x.eenheid)+'</i></div>';
  }).join('')+'</div>';
  return h;
}
function segmenten(rol){
  let s='';
  for(let i=0;i<SEG;i++) s+='<i></i>';
  return '<span class="vpf-seg" id="vpf-f-'+rol+'" data-n="0">'+s+'</span>';
}
function htmlDigitaal(p, ind){
  const g=p.plekken.filter(function(x){ return x.groot; })[0], gp=ind.plekken[g.rol];
  let h='<div class="vpf-lcd-groot'+(gp?'':' leeg')+'" id="vpf-p-'+g.rol+'" title="'+titel(g, gp)+'">'+
    '<small>'+esc(g.naam)+'</small>'+
    '<b class="vpf-w" id="vpf-w-'+g.rol+'">—</b><i class="vpf-e" id="vpf-e-'+g.rol+'">'+(gp==='CA03' ? 'l/100 km' : gp ? 'l/u' : '')+'</i>'+
    segmenten(g.rol)+'</div>';
  h+='<div class="vpf-lcd-rijen">'+p.plekken.filter(function(x){ return !x.groot; }).map(function(x){
    const pid=ind.plekken[x.rol];
    return '<div class="vpf-lcd-rij'+(pid?'':' leeg')+'" id="vpf-p-'+x.rol+'" title="'+titel(x, pid)+'">'+
      '<small>'+esc(x.naam)+'</small><b class="vpf-w" id="vpf-w-'+x.rol+'">—</b><i class="vpf-e">'+esc(x.eenheid)+'</i>'+
      (x.soort==='segment' ? segmenten(x.rol) : '')+'</div>';
  }).join('')+'</div>';
  return h;
}
function htmlNeon(p, ind){
  const ringen=p.plekken.filter(function(x){ return x.soort==='ring'; });
  let svg='<svg class="vpf-ringen" viewBox="0 0 200 200" role="img" aria-label="Toerental, belasting en gasklep">';
  ringen.forEach(function(x){
    const r=RING_R[x.rol], pid=ind.plekken[x.rol];
    // Een cirkel als pad met pathLength=100, begin linksonder (zeven uur):
    // de vulling is dan stroke-dasharray, net als op de basismeter.
    svg+='<g class="vpf-ring r-'+x.rol+(pid?'':' leeg')+'" id="vpf-p-'+x.rol+'"><title>'+titel(x, pid)+'</title>'+
      '<circle class="vpf-ring-bak" cx="100" cy="100" r="'+r+'" pathLength="100" stroke-dasharray="75 100" transform="rotate(135 100 100)"/>'+
      '<circle class="vpf-ring-vul vpf-f" id="vpf-f-'+x.rol+'" cx="100" cy="100" r="'+r+'" pathLength="100" stroke-dasharray="0 100" transform="rotate(135 100 100)"/></g>';
  });
  svg+='<text class="vpf-neon-groot vpf-w" id="vpf-w-toeren" x="100" y="104" text-anchor="middle">—</text>'+
       '<text class="vpf-neon-eenheid" x="100" y="124" text-anchor="middle">rpm</text></svg>';
  const leg='<div class="vpf-legenda">'+ringen.filter(function(x){ return !x.groot; }).map(function(x){
    return '<span class="r-'+x.rol+'"><i></i>'+esc(x.naam)+' <b class="vpf-w" id="vpf-w-'+x.rol+'">—</b>'+esc(x.eenheid)+'</span>';
  }).join('')+'</div>';
  const getallen='<div class="vpf-neon-getallen">'+p.plekken.filter(function(x){ return x.soort==='getal'; }).map(function(x){
    const pid=ind.plekken[x.rol];
    return '<div class="'+(pid?'':'leeg')+'" id="vpf-p-'+x.rol+'" title="'+titel(x, pid)+'"><small>'+esc(x.naam)+'</small>'+
      '<b class="vpf-w" id="vpf-w-'+x.rol+'">—</b><i class="vpf-e">'+esc(x.eenheid)+'</i></div>';
  }).join('')+'</div>';
  return svg+leg+getallen;
}
/* De HTML van het vak voor een profiel (niet de basis). */
function html(id, ind){
  const p=zoek(id);
  if(!p || !p.plekken || !ind) return '';
  const binnen = p.stijl==='glas' ? htmlGlas(p, ind) : p.stijl==='licht' ? htmlLicht(p, ind)
               : p.stijl==='digitaal' ? htmlDigitaal(p, ind) : htmlNeon(p, ind);
  const geen=p.plekken.every(function(x){ return !ind.plekken[x.rol]; });
  return '<div class="vpf vpf-'+p.stijl+'" data-profiel="'+p.id+'">'+binnen+
    (geen ? '<p class="vpf-geen">Deze auto geeft geen van de sensoren voor '+esc(p.naam.toLowerCase())+'. Tik op <b>Volgende</b> voor een andere weergave.</p>' : '')+'</div>';
}

// ── EEN WAARDE OP ZIJN PLEK ───────────────────────────────────────
function el(id){ return document.getElementById(id); }
function zetTekst(id, t){ const e=el(id); if(e && e.textContent!==t) e.textContent=t; }
/* `st` = het oordeel (ok/warn/danger/geen), van buiten aangereikt. */
function bij(id, ind, pid, val, st){
  const p=zoek(id);
  if(!p || !p.plekken || !ind) return;
  p.plekken.forEach(function(x){
    if(ind.plekken[x.rol]!==pid) return;
    const d=deel(val, x.lo, x.hi);
    // De ring van het toerental volgt de dieselschaal van de basismeter
    // niet: hier is hij altijd 0–8000, want de neonringen hebben geen cijfers.
    const t=tekst(val, x.dec);
    // In een buis staat de eenheid achter het getal (90°); elders heeft hij een eigen vakje.
    zetTekst('vpf-w-'+x.rol, x.soort==='thermo' && t!=='—' ? t+x.eenheid : t);
    const f=el('vpf-f-'+x.rol), plek=el('vpf-p-'+x.rol);
    if(plek){ plek.classList.remove('warn','danger','oud'); if(st==='warn' || st==='danger') plek.classList.add(st); }
    if(!f) return;
    const v=d===null ? 0 : d;
    if(x.soort==='thermo') f.style.height=v.toFixed(1)+'%';
    else if(x.soort==='balk') f.style.width=v.toFixed(1)+'%';
    else if(x.soort==='midden'){
      // Vanuit het midden: links van 50% is negatief (rijker), rechts positief.
      const a=Math.min(v,50), b=Math.max(v,50);
      f.style.left=a.toFixed(1)+'%'; f.style.width=(b-a).toFixed(1)+'%';
    }
    else if(x.soort==='lambda') f.style.left=v.toFixed(1)+'%';
    else if(x.soort==='segment'){ const n=String(Math.round(v/100*SEG)); if(f.getAttribute('data-n')!==n) f.setAttribute('data-n', n); }
    else if(x.soort==='ring') f.setAttribute('stroke-dasharray', (v*0.75).toFixed(1)+' 100');
  });
}
/* Dof zetten wat oud is. `oud(pid)` komt uit pidlane-visueel.js. */
function dof(id, ind, oud){
  const p=zoek(id);
  if(!p || !p.plekken || !ind) return;
  p.plekken.forEach(function(x){
    const pid=ind.plekken[x.rol], e=el('vpf-p-'+x.rol);
    if(e && pid) e.classList.toggle('oud', !!oud(pid));
  });
}
function pids(ind){
  const s=new Set();
  if(ind) Object.keys(ind.plekken).forEach(function(k){ if(ind.plekken[k]) s.add(ind.plekken[k]); });
  return s;
}

window.PLVisProfiel = {
  PROFIELEN:PROFIELEN, SEG:SEG, SLEUTEL:SLEUTEL,
  zoek:zoek, geldig:geldig, volgende:volgende, lees:lees, bewaar:bewaar,
  indeling:indeling, ketens:ketens, deel:deel, tekst:tekst, html:html, bij:bij, dof:dof, pids:pids
};
})();
