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
   lo/hi = het bereik van de vulling; dec = decimalen in de tekst.

   DIESEL (#393, 06-10-2026). Een diesel loopt arm en heeft geen ontsteking:
   lambda rond 1,00, de brandstoftrims, de O₂-sprong na de kat, de
   ontstekingshoek en verbruik uit de luchtmassa zeggen daar niets. Een plek
   met `diesel:{…}` krijgt op een diesel die velden in de plaats (ook rol en
   soort: het is dan een andere plek); `diesel:false` laat hem weg. Welke
   motor het is, komt van buiten (indeling(id, mag, motor)), net als mag. */
const SEG = 20;
const PROFIELEN = [
  { id:'basis', naam:'Basis', stijl:'basis', ondertitel:'De vaste meter' },
  { id:'temp', naam:'Temperatuur', stijl:'glas', ondertitel:'Glas',
    plekken:[
      { rol:'koel',   naam:'Koelwater',   kort:'Koel',    keten:['0105','0167'], eenheid:'°', soort:'thermo', lo:40, hi:130, dec:0 },
      { rol:'olie',   naam:'Motorolie',   kort:'Olie',    keten:['015C'],        eenheid:'°', soort:'thermo', lo:40, hi:150, dec:0 },
      { rol:'inlaat', naam:'Inlaatlucht', kort:'Inlaat',  keten:['010F'],        eenheid:'°', soort:'thermo', lo:-20, hi:80, dec:0 },
      { rol:'buiten', naam:'Buiten',      kort:'Buiten',  keten:['0146'],        eenheid:'°', soort:'thermo', lo:-20, hi:45, dec:0 },
      { rol:'kat',    naam:'Katalysator', kort:'Kat',     keten:['013C','013E','017C'], eenheid:'°', soort:'thermo', lo:100, hi:950, dec:0,
        diesel:{ rol:'uitlaat', naam:'Uitlaatgas', kort:'Uitlaat', keten:['0178','017C','013C'], hi:700 } }
    ] },
  { id:'emissie', naam:'Emissie', stijl:'licht', ondertitel:'Licht',
    plekken:[
      { rol:'lambda', naam:'Lambda',             keten:['0124','0134','0144'], eenheid:'λ', soort:'lambda', lo:0.8, hi:1.2, dec:2,
        diesel:{ rol:'dpf', naam:'Roetfilter drukverschil', keten:['017A','017B'], eenheid:'kPa', soort:'balk', lo:0, hi:30, dec:1 } },
      { rol:'kort',   naam:'Brandstoftrim kort', keten:['0106'], eenheid:'%', soort:'midden', lo:-25, hi:25, dec:1,
        diesel:{ rol:'dpftemp', naam:'Roetfilter temperatuur', keten:['017C','0178','013C'], eenheid:'°C', soort:'balk', lo:100, hi:700, dec:0 } },
      { rol:'lang',   naam:'Brandstoftrim lang', keten:['0107'], eenheid:'%', soort:'midden', lo:-25, hi:25, dec:1,
        diesel:{ rol:'regen', naam:'Regeneratie', keten:['018B'], eenheid:'%', soort:'balk', lo:0, hi:100, dec:0 } },
      { rol:'kat',    naam:'Katalysator',        keten:['013C','013E','017C'], eenheid:'°C', soort:'balk', lo:100, hi:950, dec:0,
        diesel:{ rol:'nox', naam:'NOx', keten:['0183'], eenheid:'ppm', lo:0, hi:1500 } },
      { rol:'o2',     naam:'O₂ na de kat',       keten:['0115'], eenheid:'V', soort:'balk', lo:0, hi:1, dec:2,
        diesel:{ rol:'adblue', naam:'AdBlue', keten:['0185'], eenheid:'%', lo:0, hi:100, dec:0 } },
      { rol:'egr',    naam:'EGR',                keten:['012C'], eenheid:'%', soort:'balk', lo:0, hi:100, dec:0 }
    ] },
  { id:'verbruik', naam:'Verbruik', stijl:'digitaal', ondertitel:'Digitaal',
    plekken:[
      { rol:'nu',     naam:'Verbruik nu', keten:['CA03','015E','CA02'], eenheid:'', soort:'segment', lo:0, hi:20, dec:1, groot:true },
      { rol:'snel',   naam:'Snelheid',    keten:['010D'], eenheid:'km/u', soort:'getal', lo:0, hi:200, dec:0 },
      { rol:'pedaal', naam:'Gaspedaal',   keten:['0149','015A','014A','0111'], eenheid:'%', soort:'segment', lo:0, hi:100, dec:0 },
      { rol:'maf',    naam:'Luchtmassa',  keten:['0110'], eenheid:'g/s', soort:'segment', lo:0, hi:150, dec:1,
        diesel:{ rol:'laad', naam:'Laaddruk', keten:['0170','0187','010B'], eenheid:'kPa', lo:0, hi:300, dec:0 } },
      { rol:'tank',   naam:'Tank',        keten:['012F'], eenheid:'%', soort:'segment', lo:0, hi:100, dec:0 }
    ] },
  { id:'motor', naam:'Motor', stijl:'neon', ondertitel:'Neon',
    plekken:[
      { rol:'toeren',   naam:'Toerental',   keten:['010C'], eenheid:'rpm', soort:'ring', lo:0, hi:8000, dec:0, groot:true,
        diesel:{ hi:6000 } },
      { rol:'last',     naam:'Belasting',   keten:['0104','0143'], eenheid:'%', soort:'ring', lo:0, hi:100, dec:0 },
      // Een diesel regelt met het pedaal, niet met de gasklep: die staat
      // vrijwel altijd open. De rol blijft 'gasklep' (de ring en zijn kleur).
      { rol:'gasklep',  naam:'Gasklep',     keten:['0111','0149'], eenheid:'%', soort:'ring', lo:0, hi:100, dec:0,
        diesel:{ naam:'Gaspedaal', keten:['0149','015A','014A','0111'] } },
      { rol:'map',      naam:'Inlaatdruk',  keten:['010B'], eenheid:'kPa', soort:'getal', lo:0, hi:255, dec:0,
        diesel:{ naam:'Laaddruk', keten:['0170','0187','010B'], hi:300 } },
      { rol:'timing',   naam:'Ontsteking',  keten:['010E','015D'], eenheid:'°', soort:'getal', lo:-40, hi:60, dec:0,
        diesel:{ naam:'Injectie', keten:['015D'] } },
      { rol:'maf',      naam:'Luchtmassa',  keten:['0110'], eenheid:'g/s', soort:'getal', lo:0, hi:655, dec:1 }
    ] },
  // Telemetrie (05-10-2026): de telefoonsensoren van pidlane-telemetrie.js.
  // Tot 06-10-2026 drie losse schermen (Horizon, Offroad, G-kracht); nu één,
  // uit het gebruik: helling en G-kracht horen bij hetzelfde moment, en
  // wisselen achter het stuur kost een tik te veel. De horizon draagt de
  // rollen hz-*: dezelfde PIDs als de autootjes, maar een eigen tekening, dus
  // eigen element-id's. De getallen staan bij de autootjes en de G-cirkel.
  { id:'telemetrie', naam:'Telemetrie', stijl:'telemetrie', ondertitel:'Helling en G-kracht',
    plekken:[
      { rol:'hz-helling',   naam:'Helling',   keten:['TL01'], eenheid:'°', soort:'schuif', lo:-30, hi:30, dec:1 },
      { rol:'hz-kanteling', naam:'Kanteling', keten:['TL02'], eenheid:'°', soort:'draai',  lo:-45, hi:45, dec:1 },
      { rol:'helling',   naam:'Helling',   keten:['TL01'], eenheid:'°', soort:'kantel', lo:-45, hi:45, dec:0, teken:-1 },
      { rol:'kanteling', naam:'Kanteling', keten:['TL02'], eenheid:'°', soort:'kantel', lo:-45, hi:45, dec:0, teken:1 },
      { rol:'lengte', naam:'Lengte-G', keten:['TL03'], eenheid:'g', soort:'gy', lo:-1.2, hi:1.2, dec:2 },
      { rol:'dwars',  naam:'Zij-G',    keten:['TL04'], eenheid:'g', soort:'gx', lo:-1.2, hi:1.2, dec:2 }
    ] }
];
// De ringen van buiten naar binnen; de straal staat hier en niet in de CSS,
// want de tekening is een SVG met een vaste viewBox.
const RING_R = { toeren:86, last:68, gasklep:50 };

function zoek(id){ for(let i=0;i<PROFIELEN.length;i++){ if(PROFIELEN[i].id===id) return PROFIELEN[i]; } return null; }
/* De plekken van een profiel voor deze motor. Puur. Een diesel krijgt de
   diesel-velden van een plek in de plaats, of de plek valt weg (false). */
function plekkenVan(p, motor){
  if(!p || !p.plekken) return null;
  if(motor!=='diesel') return p.plekken;
  return p.plekken.filter(function(x){ return x.diesel!==false; })
    .map(function(x){ return x.diesel ? Object.assign({}, x, x.diesel) : x; });
}
/* Het profiel zoals deze motor het ziet: dezelfde velden, andere plekken. */
function voor(id, motor){
  const p=zoek(id);
  return (p && p.plekken) ? Object.assign({}, p, { plekken:plekkenVan(p, motor) }) : p;
}
function geldig(id){ return !!zoek(id); }
/* Het profiel na `id`, rond. Onbekend = het eerste na de basis. */
function volgende(id){
  const i=PROFIELEN.findIndex(function(p){ return p.id===id; });
  return PROFIELEN[(i<0 ? 1 : i+1) % PROFIELEN.length].id;
}
// De drie losse telemetrieschermen van vóór 06-10-2026: wie er een gekozen
// had, komt op het samengevoegde scherm uit en niet terug op Basis.
const OUD_PROFIEL = { 'tel-horizon':'telemetrie', 'tel-offroad':'telemetrie', 'tel-g':'telemetrie' };
function lees(){
  try{ let v=localStorage.getItem(SLEUTEL); if(OUD_PROFIEL[v]) v=OUD_PROFIEL[v]; return geldig(v) ? v : 'basis'; }
  catch(e){ console.warn('PLVisProfiel: keuze niet te lezen, basis', e); return 'basis'; }
}
function bewaar(id){
  try{ localStorage.setItem(SLEUTEL, id); }
  catch(e){ console.warn('PLVisProfiel: keuze niet op te slaan', e); }
}

/* Welke PID staat op welke plek? Per plek de eerste uit de keten waarvoor
   `mag(pid)` waar is, anders null. Puur. `motor` = detectEngineType(). */
function indeling(id, mag, motor){
  const p=voor(id, motor);
  if(!p || !p.plekken) return null;
  const uit={ id:p.id, motor:motor||null, plekken:{} };
  p.plekken.forEach(function(x){
    let pid=null;
    for(let i=0;i<x.keten.length;i++){ if(mag(x.keten[i])){ pid=x.keten[i]; break; } }
    uit.plekken[x.rol]=pid;
  });
  return uit;
}
/* De ketens van een profiel: wat pidlane-visueel.js erbij moet zetten. */
function ketens(id, motor){
  const p=voor(id, motor);
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
  // Op een diesel is er geen lambdaschaal (#393): dan alleen de rijen.
  const l=p.plekken.filter(function(x){ return x.soort==='lambda'; })[0], lp=l ? ind.plekken[l.rol] : null;
  let h=!l ? '' : '<div class="vpf-lambda'+(lp?'':' leeg')+'" id="vpf-p-lambda" title="'+titel(l, lp)+'">'+
      '<small>Lambda — 1,00 is de ideale verbranding</small>'+
      '<b class="vpf-w" id="vpf-w-lambda">—</b>'+
      '<span class="vpf-schaal"><i class="vpf-rijk">rijk</i><i class="vpf-een"></i><i class="vpf-arm">arm</i>'+
        '<i class="vpf-wijzer" id="vpf-f-lambda" style="left:50%"></i></span></div>';
  h+='<div class="vpf-rijen">'+p.plekken.filter(function(x){ return x.soort!=='lambda'; }).map(function(x){
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
  let svg='<svg class="vpf-ringen" viewBox="0 0 200 200" role="img" aria-label="'+esc(ringen.map(function(x){ return x.naam; }).join(', '))+'">';
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
/* ── Telemetrie ── De getallen onder elke tekening; de tekening zelf draait
   via bij() hieronder (soort schuif/draai/kantel/gx/gy). */
function telGetallen(p, ind, rollen){
  return '<div class="vpf-tel-getallen">'+p.plekken.filter(function(x){ return !rollen || rollen.indexOf(x.rol)>=0; }).map(function(x){
    const pid=ind.plekken[x.rol];
    return '<div class="'+(pid?'':'leeg')+'" id="vpf-p-'+x.rol+'" title="'+titel(x, pid)+'"><small>'+esc(x.naam)+'</small>'+
      '<b class="vpf-w" id="vpf-w-'+x.rol+'">—</b><i class="vpf-e">'+esc(x.eenheid)+'</i></div>';
  }).join('')+'</div>';
}
/* `pre` = het voorvoegsel van de rollen ('' los, 'hz-' in het samengevoegde
   scherm); `getallen` = de getallen eronder of niet. */
function htmlHorizon(p, ind, pre, getallen){
  pre=pre||'';
  let ladder='';
  [-20,-10,10,20].forEach(function(d){
    const y=100-d*3, w=d%20 ? 18 : 30;
    ladder+='<line x1="'+(100-w)+'" y1="'+y+'" x2="'+(100+w)+'" y2="'+y+'"/><text x="'+(100+w+4)+'" y="'+(y+3)+'">'+Math.abs(d)+'</text>';
  });
  return '<svg class="vpf-horizon-svg" viewBox="0 0 200 200" role="img" aria-label="Kunstmatige horizon: helling en kanteling">'+
    '<defs><clipPath id="vpf-hz-clip"><circle cx="100" cy="100" r="92"/></clipPath></defs>'+
    '<g clip-path="url(#vpf-hz-clip)"><g class="vpf-f" id="vpf-f-'+pre+'kanteling" transform="rotate(0 100 100)">'+
      '<g class="vpf-f" id="vpf-f-'+pre+'helling" transform="translate(0 0)">'+
        '<rect class="vpf-hz-lucht" x="-150" y="-260" width="500" height="360"/>'+
        '<rect class="vpf-hz-grond" x="-150" y="100" width="500" height="360"/>'+
        '<line class="vpf-hz-lijn" x1="-150" y1="100" x2="350" y2="100"/>'+
        '<g class="vpf-hz-ladder">'+ladder+'</g></g></g></g>'+
    '<circle class="vpf-hz-rand" cx="100" cy="100" r="92"/>'+
    '<path class="vpf-hz-auto" d="M60 100 H86 L92 108 H108 L114 100 H140"/><circle class="vpf-hz-auto-stip" cx="100" cy="100" r="3"/>'+
    '</svg>'+(getallen===false ? '' : telGetallen(p, ind));
}
function htmlOffroad(p, ind){
  // Van opzij (helling) en van achteren (kanteling): de auto kantelt mee,
  // de grond blijft liggen. Zoals de hellingmeter in een terreinwagen.
  const zij='<g class="vpf-f vpf-or-auto" id="vpf-f-helling" transform="rotate(0 100 112)">'+
      '<path d="M38 112 V96 L58 94 L74 76 H128 L146 94 L164 98 V112 Z"/>'+
      '<circle cx="66" cy="114" r="11"/><circle cx="138" cy="114" r="11"/></g>';
  const achter='<g class="vpf-f vpf-or-auto" id="vpf-f-kanteling" transform="rotate(0 100 112)">'+
      '<path d="M54 112 V90 L66 70 H134 L146 90 V112 Z"/><rect class="vpf-or-ruit" x="72" y="76" width="56" height="14" rx="2"/>'+
      '<rect x="50" y="104" width="16" height="18" rx="3"/><rect x="134" y="104" width="16" height="18" rx="3"/></g>';
  function vak(rol, tekening, wat){
    const x=plekVan(p, rol), pid=ind.plekken[rol];
    return '<div class="vpf-or-vak'+(pid?'':' leeg')+'" id="vpf-p-'+rol+'" title="'+titel(x, pid)+'">'+
      '<svg viewBox="0 0 200 140" role="img" aria-label="'+esc(wat)+'"><line class="vpf-or-grond" x1="10" y1="126" x2="190" y2="126"/>'+tekening+'</svg>'+
      '<small>'+esc(x.naam)+'</small><b class="vpf-w" id="vpf-w-'+rol+'">—</b><i class="vpf-e">°</i></div>';
  }
  return '<div class="vpf-or">'+vak('helling', zij, 'De auto van opzij')+vak('kanteling', achter, 'De auto van achteren')+'</div>';
}
function htmlGcirkel(p, ind, rollen){
  return '<svg class="vpf-g-svg" viewBox="0 0 200 200" role="img" aria-label="G-cirkel: lengte- en zij-versnelling">'+
    '<circle class="vpf-g-ring" cx="100" cy="100" r="80"/><circle class="vpf-g-ring half" cx="100" cy="100" r="40"/>'+
    '<line class="vpf-g-as" x1="100" y1="14" x2="100" y2="186"/><line class="vpf-g-as" x1="14" y1="100" x2="186" y2="100"/>'+
    '<text class="vpf-g-label" x="100" y="11" text-anchor="middle">optrekken</text>'+
    '<text class="vpf-g-label" x="100" y="198" text-anchor="middle">remmen</text>'+
    '<text class="vpf-g-label" x="104" y="58">0,5 g</text><text class="vpf-g-label" x="104" y="18">1 g</text>'+
    '<circle class="vpf-g-piek weg" id="vpf-f-gpiek" cx="100" cy="100" r="9"/>'+
    '<circle class="vpf-g-stip vpf-f" id="vpf-f-gstip" cx="100" cy="100" r="7"/></svg>'+telGetallen(p, ind, rollen);
}
/* Het samengevoegde scherm (06-10-2026): boven de horizon en de G-cirkel naast
   elkaar, eronder de auto van opzij en van achteren met hun graden. */
function htmlTelemetrie(p, ind){
  return '<div class="vpf-tel-boven"><div>'+htmlHorizon(p, ind, 'hz-', false)+'</div>'+
    '<div>'+htmlGcirkel(p, ind, ['lengte','dwars'])+'</div></div>'+htmlOffroad(p, ind);
}
/* De HTML van het vak voor een profiel (niet de basis). */
function html(id, ind){
  const p=voor(id, ind && ind.motor);
  if(!p || !p.plekken || !ind) return '';
  const binnen = p.stijl==='glas' ? htmlGlas(p, ind) : p.stijl==='licht' ? htmlLicht(p, ind)
               : p.stijl==='digitaal' ? htmlDigitaal(p, ind) : p.stijl==='telemetrie' ? htmlTelemetrie(p, ind) : htmlNeon(p, ind);
  const geen=p.plekken.every(function(x){ return !ind.plekken[x.rol]; });
  return '<div class="vpf vpf-'+p.stijl+'" data-profiel="'+p.id+'">'+binnen+
    (geen ? '<p class="vpf-geen">Deze auto geeft geen van de sensoren voor '+esc(p.naam.toLowerCase())+'. Tik op <b>Volgende</b> voor een andere weergave.</p>' : '')+'</div>';
}

// ── EEN WAARDE OP ZIJN PLEK ───────────────────────────────────────
function el(id){ return document.getElementById(id); }
function zetTekst(id, t){ const e=el(id); if(e && e.textContent!==t) e.textContent=t; }
/* `st` = het oordeel (ok/warn/danger/geen), van buiten aangereikt. */
function bij(id, ind, pid, val, st){
  const p=voor(id, ind && ind.motor);
  if(!p || !p.plekken || !ind) return;
  p.plekken.forEach(function(x){
    if(ind.plekken[x.rol]!==pid) return;
    const d=deel(val, x.lo, x.hi);
    // De ring van het toerental: 0–8000, op een diesel 0–6000 (#393), net
    // als de schaal van de basismeter.
    const t=tekst(val, x.dec);
    // In een buis staat de eenheid achter het getal (90°); elders heeft hij een eigen vakje.
    zetTekst('vpf-w-'+x.rol, x.soort==='thermo' && t!=='—' ? t+x.eenheid : t);
    const f=el('vpf-f-'+x.rol), plek=el('vpf-p-'+x.rol);
    if(plek){ plek.classList.remove('warn','danger','oud'); if(st==='warn' || st==='danger') plek.classList.add(st); }
    // Telemetrie: de tekening draait of schuift met de waarde zelf, begrensd.
    if(x.soort==='schuif' || x.soort==='draai' || x.soort==='kantel' || x.soort==='gx' || x.soort==='gy'){ telBij(x, val); return; }
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
function klem(v, lo, hi){ const n=Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; }
/* De G-cirkel (#407, 06-10-2026).
   • Zij-G volgt het GEVOEL: rechts sturen duwt je lijf naar links, dus gaat
     de stip naar links. TL04 zelf meet de kracht op de auto (rechts = +) en
     blijft zo; alleen de tekening draait om. Lengte-G heeft dat verschil
     niet: optrekken drukt je in de stoel, en de stip gaat omhoog.
   • Het piekballetje blijft G_PIEK_MS staan op de grootste afstand tot het
     midden, zodat je een hard rem- of stuurmoment ziet zonder op het scherm
     te blijven kijken. Daarna, of bij Nulstellen, valt het terug. */
const G_PIEK_MS = 3000;
let _gNu = { x:0, y:0 }, _gPiek = null;
/* Puur. `piek` = {x,y,t} of null; x = zij-G, y = lengte-G, in g. */
function gPiek(piek, x, y, t){
  if(!piek || t-piek.t > G_PIEK_MS || Math.hypot(x, y) >= Math.hypot(piek.x, piek.y)) return { x:x, y:y, t:t };
  return piek;
}
/* In px: 1 g = 80 px (de buitenste ring). Zij-G gespiegeld, zie boven. */
function gPunt(x, y){ return { cx:(100-x*80).toFixed(1), cy:(100-y*80).toFixed(1) }; }
function gTeken(){
  const s=el('vpf-f-gstip'), pk=el('vpf-f-gpiek');
  const nu=gPunt(_gNu.x, _gNu.y);
  if(s){ s.setAttribute('cx', nu.cx); s.setAttribute('cy', nu.cy); }
  if(!pk) return;
  const weg=!_gPiek || Math.hypot(_gPiek.x-_gNu.x, _gPiek.y-_gNu.y) < 0.05;
  if(!weg){ const p=gPunt(_gPiek.x, _gPiek.y); pk.setAttribute('cx', p.cx); pk.setAttribute('cy', p.cy); }
  pk.classList.toggle('weg', weg);
}
function gWis(){ _gNu={ x:0, y:0 }; _gPiek=null; gTeken(); }
try{ if(typeof window.addEventListener==='function') window.addEventListener('pl:telemetrie-genuld', gWis); }
catch(e){ console.warn('PLVisProfiel: Nulstellen wist het piekballetje niet', e); }
function telBij(x, val){
  if(x.soort==='gx' || x.soort==='gy'){
    if(x.soort==='gx') _gNu.x=klem(val, x.lo, x.hi); else _gNu.y=klem(val, x.lo, x.hi);
    _gPiek=gPiek(_gPiek, _gNu.x, _gNu.y, Date.now());
    gTeken();
    return;
  }
  const f=el('vpf-f-'+x.rol); if(!f) return;
  const v=klem(val, x.lo, x.hi);
  // Horizon: neus omhoog = de horizon zakt (3 px per graad); rechts omlaag =
  // de horizon draait linksom. Offroad: de auto kantelt zelf, met het teken
  // van de tekening (van opzij wijst de neus naar rechts).
  if(x.soort==='schuif') f.setAttribute('transform', 'translate(0 '+(v*3).toFixed(1)+')');
  else if(x.soort==='draai') f.setAttribute('transform', 'rotate('+(-v).toFixed(1)+' 100 100)');
  else f.setAttribute('transform', 'rotate('+((x.teken||1)*v).toFixed(1)+' 100 112)');
}
/* Dof zetten wat oud is. `oud(pid)` komt uit pidlane-visueel.js. */
function dof(id, ind, oud){
  const p=voor(id, ind && ind.motor);
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
  zoek:zoek, geldig:geldig, plekkenVan:plekkenVan, volgende:volgende, lees:lees, bewaar:bewaar,
  indeling:indeling, ketens:ketens, deel:deel, tekst:tekst, html:html, bij:bij, dof:dof, pids:pids,
  G_PIEK_MS:G_PIEK_MS, gPiek:gPiek, gPunt:gPunt, gWis:gWis
};
})();
