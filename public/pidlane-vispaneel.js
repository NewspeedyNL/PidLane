// ═══════════════════════════════════════════════════════════════════
// pidlane-vispaneel.js — PLVisPaneel: de panelen onder Slim visueel (19-11-2026)
// ───────────────────────────────────────────────────────────────────
// Twee panelen onder de meter, in dezelfde vormtaal als de meter erboven:
//
//   TREK — met een caravan of zware last. Tot deze datum zes tegels met een
//   getal, "totaal niet visueel toevoegend". Nu wat er bij zware last telt,
//   als beeld: de helling als een weg met de combinatie erop, het
//   schakeladvies als grote pijl met de doelversnelling, de belasting als
//   boog met het aandeel zwaar van de laatste vijf minuten, en elke
//   temperatuur als balk met zijn trend. De laatste coachtip in één regel.
//
//   RIT-MONITOR — wat de monitor doet: één segment per controle op een ring
//   (wacht · getoetst · zag iets), in het midden de meldingen van de ECU, en
//   ernaast wat de ECU zegt (MIL, teller) en welke controle iets zag. Tot
//   deze datum stond dat alleen in het oude Live-paneel.
//
// Puur: model in, HTML uit. Het lezen van pidVals, pidHist, PLMon en PLWatch
// doet pidlane-visueel.js (trekBij/ritMonBij). Geen bus-I/O, geen opslag.
// Laadt vóór pidlane-visueel.js. Test: test-vispaneel.js
// ═══════════════════════════════════════════════════════════════════
(function(){
'use strict';

// Schaal van de temperatuurbalken. Het oordeel (kleur) komt uit de app
// (pidOordeel); dit is alleen hoe ver de balk vol staat.
const TEMP = { koel:{ van:40, tot:120 }, olie:{ van:40, tot:140 }, inlaat:{ van:-10, tot:70 }, atf:{ van:20, tot:130 } };
const ZWAAR = { grens:85, vensterMs:300000, minN:20, letop:0.6 };   // dezelfde regel als de duurbelasting van de caravancoach
const HELLING_BEELD = { factor:2, max:24 };   // de weg in beeld: twee keer zo steil, hoogstens 24°
const TIP_MS = 90000;                         // een coachtip blijft zo lang staan
const TIP_MAX = 48;

function klem(x, a, b){ return Math.min(b, Math.max(a, x)); }
function getal(v){ return (v===null || v===undefined || v==='') ? null : (isFinite(Number(v)) ? Number(v) : null); }
function esc(s){ return String(s===null || s===undefined ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function komma(n, d){ return n.toFixed(d).replace('.', ','); }

/* Hoe ver een temperatuurbalk vol staat (0…1), of null zonder waarde. */
function tempFrac(rol, v){
  const n=getal(v), s=TEMP[rol];
  if(n===null || !s) return null;
  return Math.round(klem((n-s.van)/(s.tot-s.van), 0, 1)*1000)/1000;
}
/* Graden → procent, zoals op een verkeersbord. */
function procent(deg){ const n=getal(deg); return n===null ? null : Math.round(Math.tan(n*Math.PI/180)*100); }
function hellingTekst(deg){
  const p=procent(deg);
  if(p===null) return '';
  return (p>0 ? '+' : p<0 ? '−' : '')+Math.abs(p)+' %';
}
/* De hoek van de weg in beeld: overdreven, begrensd; omhoog = naar rechts op. */
function hellingBeeld(deg){
  const n=getal(deg);
  if(n===null) return 0;
  return Math.round(klem(n*HELLING_BEELD.factor, -HELLING_BEELD.max, HELLING_BEELD.max)*10)/10;
}
/* Aandeel van de laatste vijf minuten met belasting ≥ 85%. null = te weinig. */
function zwaarAandeel(hist, nu){
  if(!Array.isArray(hist)) return null;
  const van=(nu||Date.now())-ZWAAR.vensterMs;
  let n=0, hi=0;
  hist.forEach(function(x){ if(x && x.t>=van && getal(x.v)!==null){ n++; if(Number(x.v)>=ZWAAR.grens) hi++; } });
  return n>=ZWAAR.minN ? Math.round(hi/n*100)/100 : null;
}
/* Een coachtip in één regel: tot de eerste gedachtestreep of punt. */
function tipKort(msg){
  let s=String(msg||'').trim();
  const i=[s.indexOf(' — '), s.indexOf('. ')].filter(function(x){ return x>0; }).sort(function(a,b){ return a-b; })[0];
  if(i>0) s=s.slice(0, i);
  if(s.length>TIP_MAX) s=s.slice(0, TIP_MAX-1).replace(/\s+\S*$/, '')+'…';
  return s;
}
/* De laatste tip die nog vers is, of null. Een schakeltip niet: die staat al
   groot in het rad ernaast. */
const TIP_NIET = ['terug','op'];
function tipVan(coach, nu){
  if(!Array.isArray(coach) || !coach.length) return null;
  const rest=coach.filter(function(c){ return c && TIP_NIET.indexOf(c.key)<0; });
  const c=rest[rest.length-1];
  if(!c || !(c.t>(nu||Date.now())-TIP_MS)) return null;
  return { tekst:tipKort(c.msg), level:c.level==='warn' ? 'warn' : 'tip' };
}
function trendTekst(tr){
  const n=getal(tr);
  if(n===null) return '';
  return (n>0.2 ? '↑ ' : n<-0.2 ? '↓ ' : '→ ')+komma(Math.abs(n), 1)+'/min';
}

/* Het model van het trekpaneel. i = {
     terrein:{climb, bron}|null, helling:graden|null,
     schakel:{advies, doel}|null, gear:versnelling|null,
     last:{v, st}|null, lastHist:pidHist['0104'],
     temps:[{rol, naam, v, st, trend}],   (v null = niet gemeten)
     verbruik:{v, eenheid}|null, laaddruk:v|null, coach:caravanCoach, nu } */
function trekModel(i){
  i=i||{};
  const t=i.terrein||null, h=getal(i.helling);
  const terrein={ climb:t ? t.climb : null, bron:h!==null && t && t.bron==='helling' ? 'helling' : t ? 'obd' : 'geen',
                  helling:h, hoek:hellingBeeld(h), tekst:hellingTekst(h) };
  terrein.label=(terrein.climb==='klim' ? 'klim' : terrein.climb==='afdaling' ? 'afdaling' : terrein.climb==='vlak' ? 'vlak' : 'terrein onbekend')+
                (terrein.bron==='helling' ? ' · gemeten' : terrein.bron==='obd' ? ' · geschat' : '');
  const s=i.schakel||null, g=getal(i.gear);
  const schakel={ advies:s ? s.advies : null, doel:s && getal(s.doel)!==null ? s.doel : null, gear:g!==null && g>=1 ? g : null };
  schakel.tekst = schakel.advies==='terug' ? (schakel.doel ? 'terug naar '+schakel.doel : 'schakel terug')
               : schakel.advies==='op' ? (schakel.doel ? 'naar '+schakel.doel : 'schakel op')
               : schakel.advies==='ok' ? 'goed zo' : 'wacht';
  schakel.groot = schakel.advies==='terug' || schakel.advies==='op' ? (schakel.doel ? String(schakel.doel) : '') : (schakel.gear ? String(schakel.gear) : '—');
  const lv=i.last ? getal(i.last.v) : null;
  const aandeel=zwaarAandeel(i.lastHist, i.nu);
  const last={ v:lv, frac:lv===null ? null : klem(lv/100, 0, 1), st:i.last && lv!==null ? (i.last.st||'ok') : 'geen', aandeel:aandeel,
               lang:aandeel!==null && aandeel>ZWAAR.letop };
  if(last.lang && last.st==='ok') last.st='warn';
  const temps=(i.temps||[]).map(function(x){
    const v=getal(x.v);
    return { rol:x.rol, naam:x.naam, v:v, frac:tempFrac(x.rol, v), st:v===null ? 'geen' : (x.st||'ok'), trend:trendTekst(x.trend),
             stijgt:getal(x.trend)!==null && x.trend>0.2 };
  });
  const voet=[];
  if(i.verbruik && getal(i.verbruik.v)!==null) voet.push('⛽ '+komma(Number(i.verbruik.v), 1)+' '+(i.verbruik.eenheid||''));
  if(getal(i.laaddruk)!==null) voet.push('turbo '+(i.laaddruk>0.04 ? '+' : '')+komma(Number(i.laaddruk), 2)+' bar');
  return { terrein:terrein, schakel:schakel, last:last, temps:temps, voet:voet, tip:tipVan(i.coach, i.nu), caravan:caravanModel(i.caravan) };
}
/* De caravanrit onderin het paneel (19-11-2026): loopt hij, hoe lang, hoe
   ver, en de limiet als knop. null = geen caravan (alleen beladen). */
function caravanModel(c){
  if(!c) return null;
  const sec=Math.max(0, Math.floor(getal(c.sec)||0)), km=getal(c.km);
  return { actief:!!c.actief, limiet:getal(c.limiet)||100,
           tekst:c.actief ? Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')+(km!==null ? ' · '+komma(km, 1)+' km' : '')
                          : 'start zodra de adapter klaar is' };
}

// De combinatie op de weg: een caravan met een auto ervoor, naar rechts.
const COMBI = '<rect class="vtp-car" x="22" y="22" width="36" height="20" rx="4"/>'+
  '<rect class="vtp-raam" x="27" y="26" width="10" height="6" rx="1.5"/>'+
  '<line class="vtp-dissel" x1="58" y1="39" x2="68" y2="39"/>'+
  '<path class="vtp-auto" d="M68 42 V33 Q68 30 71 30 H80 L86 24 H96 Q99 24 100 27 L103 33 Q105 34 105 37 V42 Z"/>'+
  '<circle class="vtp-wiel" cx="40" cy="43" r="4"/><circle class="vtp-wiel" cx="76" cy="43" r="4"/><circle class="vtp-wiel" cx="97" cy="43" r="4"/>';

function hellingHtml(t){
  return '<div class="vtp-cel vtp-helling" data-terrein="'+(t.climb||'geen')+'" data-bron="'+t.bron+'"><span class="vtp-kop">Helling</span>'+
    '<svg viewBox="0 0 120 60" aria-hidden="true"><line class="vtp-horizon" x1="0" y1="47" x2="120" y2="47"/>'+
    '<g class="vtp-kantel" style="transform:rotate('+(-t.hoek)+'deg)"><line class="vtp-weg" x1="-20" y1="47" x2="140" y2="47"/>'+COMBI+'</g></svg>'+
    '<b>'+esc(t.tekst || (t.climb==='klim' ? '⛰' : t.climb==='afdaling' ? '↘' : '—'))+'</b><small>'+esc(t.label)+'</small></div>';
}
function schakelHtml(s){
  const pijl=s.advies==='terug' ? '▼' : s.advies==='op' ? '▲' : s.advies==='ok' ? '✓' : '';
  return '<div class="vtp-cel vtp-schakel" data-advies="'+(s.advies||'geen')+'" aria-live="polite"><span class="vtp-kop">Schakelen</span>'+
    '<div class="vtp-rad"><span class="vtp-pijl">'+pijl+'</span><b>'+esc(s.groot)+'</b></div><small>'+esc(s.tekst)+'</small></div>';
}
function lastHtml(l){
  // Halve boog, lengte 100 (pathLength), zodat de vulling gewoon een percentage is.
  const v=l.frac===null ? 0 : Math.round(l.frac*100), a=l.aandeel===null ? 0 : Math.round(l.aandeel*100);
  return '<div class="vtp-cel vtp-last" data-st="'+l.st+'"><span class="vtp-kop">Belasting</span>'+
    '<svg viewBox="0 0 100 56" aria-hidden="true">'+
      '<path class="vtp-boog-bg" d="M10 50 A40 40 0 0 1 90 50" pathLength="100"/>'+
      '<path class="vtp-boog" d="M10 50 A40 40 0 0 1 90 50" pathLength="100" stroke-dasharray="'+v+' 100"/>'+
      '<path class="vtp-boog-5" d="M18 50 A32 32 0 0 1 82 50" pathLength="100" stroke-dasharray="'+a+' 100"/></svg>'+
    '<b>'+(l.v===null ? '—' : Math.round(l.v))+'<i>%</i></b>'+
    '<small title="aandeel zwaar in de laatste 5 minuten">'+(l.aandeel===null ? 'nu' : a+'% zwaar')+'</small></div>';
}
function tempHtml(t){
  return '<div class="vtp-temp" data-rol="'+esc(t.rol)+'" data-st="'+t.st+'"'+(t.stijgt ? ' data-stijgt="1"' : '')+'>'+
    '<span class="vtp-tn">'+esc(t.naam)+'</span>'+
    '<span class="vtp-bar"><i style="width:'+(t.frac===null ? 0 : Math.round(t.frac*100))+'%"></i></span>'+
    '<b>'+(t.v===null ? '—' : Math.round(t.v)+'°')+'</b><em>'+esc(t.trend)+'</em></div>';
}
function trekHtml(m){
  return '<div class="vtp" role="group" aria-label="Trekmodus: helling, schakelen, belasting en temperaturen">'+
    '<div class="vtp-top">'+hellingHtml(m.terrein)+schakelHtml(m.schakel)+lastHtml(m.last)+'</div>'+
    (m.temps.length ? '<div class="vtp-temps">'+m.temps.map(tempHtml).join('')+'</div>' : '')+
    (m.voet.length ? '<div class="vtp-voet">'+m.voet.map(esc).join('<span aria-hidden="true">·</span>')+'</div>' : '')+
    (m.tip ? '<div class="vtp-tip" data-level="'+m.tip.level+'">'+esc(m.tip.tekst)+'</div>' : '')+
    (m.caravan ? caravanHtml(m.caravan) : '')+
    '</div>';
}
function caravanHtml(c){
  return '<div class="vtp-rit" data-actief="'+(c.actief ? '1' : '0')+'">'+
    '<span class="vtp-rit-tx"><b>🚐 Caravanrit</b><small>'+esc(c.tekst)+'</small></span>'+
    '<button type="button" class="vtp-limiet" onclick="PLVisueel.limiet()" aria-label="Snelheidslimiet met caravan: '+c.limiet+' km/u. Tik voor de volgende.">'+
      '<b>'+c.limiet+'</b><small>max km/u</small></button></div>';
}

/* Het model van de rit-monitor. i = { tests:PLWatch.tests, dekking:PLWatch._dekking,
   meldingen:PLMon._order.length, ernstig, mil, teller, fase, draait } */
function ritModel(i){
  i=i||{};
  const dek=i.dekking||{};
  const stippen=(i.tests||[]).map(function(t){
    const d=dek[t.id];
    return { id:t.id, naam:t.naam||t.id, staat:!d || !d.runs ? 'wacht' : (d.hits>0 ? 'hit' : 'ok') };
  });
  const getoetst=stippen.filter(function(s){ return s.staat!=='wacht'; }).length;
  const gezien=stippen.filter(function(s){ return s.staat==='hit'; }).map(function(s){ return s.naam; });
  const n=getal(i.meldingen)||0;
  const st=!i.draait ? 'wacht' : (i.ernstig || i.mil===true) ? 'ernstig' : (n>0 || gezien.length) ? 'let' : 'ok';
  const ecu=i.mil===true ? 'motorlampje AAN' : i.teller>0 ? i.teller+' foutcode'+(i.teller===1 ? '' : 's')+' in de ECU'
          : i.mil===false ? 'ECU: geen foutcodes' : 'ECU nog niet gelezen';
  return { stippen:stippen, getoetst:getoetst, totaal:stippen.length, gezien:gezien, meldingen:n, st:st, ecu:ecu,
           kop:!i.draait ? 'wacht op verbinding' : st==='ok' ? 'kijkt mee' : n ? n+' melding'+(n===1 ? '' : 'en') : 'let op',
           fase:i.fase && i.fase!=='onbekend' ? i.fase : '' };
}
/* Eén segment per controle op een ring van r=26 (omtrek ≈ 163,4). */
function ringHtml(st){
  const n=st.length, R=26, O=2*Math.PI*R;
  if(!n) return '';
  const gat=n>1 ? Math.min(4, O/n*0.25) : 0, len=O/n-gat;
  return st.map(function(s, k){
    return '<circle class="vrm-seg" data-s="'+s.staat+'" cx="32" cy="32" r="'+R+'" stroke-dasharray="'+len.toFixed(2)+' '+(O-len).toFixed(2)+'"'+
      ' stroke-dashoffset="'+(-(k*O/n)).toFixed(2)+'" transform="rotate(-90 32 32)"><title>'+esc(s.naam)+'</title></circle>';
  }).join('');
}
function ritHtml(m){
  const midden=m.st==='wacht' ? '…' : m.meldingen ? String(m.meldingen) : m.gezien.length ? '!' : '✓';
  return '<button type="button" class="vrm" data-st="'+m.st+'" onclick="PLVisueel.open(\'monitor\')" aria-label="Rit-monitor: '+esc(m.kop)+'. Tik voor details.">'+
    '<svg class="vrm-ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="vrm-bg" cx="32" cy="32" r="26"/>'+ringHtml(m.stippen)+
      '<text class="vrm-n" x="32" y="38" text-anchor="middle">'+esc(midden)+'</text></svg>'+
    '<span class="vrm-tx"><b>Rit-monitor · '+esc(m.kop)+'</b>'+
      '<small>'+m.getoetst+'/'+m.totaal+' controles getoetst'+(m.fase ? ' · '+esc(m.fase) : '')+'</small>'+
      '<small class="vrm-ecu">'+esc(m.ecu)+'</small>'+
      (m.gezien.length ? '<em>zag iets: '+esc(m.gezien.slice(0, 2).join(' · '))+(m.gezien.length>2 ? ' +'+(m.gezien.length-2) : '')+'</em>' : '')+
    '</span></button>';
}

/* De rit-pil (20-11-2026): het volle paneel staat alleen in Slim visueel.
   In Overzicht, Slim en de andere tabbladen één regel in #fabLane met de
   stand; een tik brengt je naar Slim visueel. Caravanrit en rit-monitor
   lopen nooit tegelijk; mocht het toch, dan wint de caravanrit (zoals bij
   het starten). null = geen pil: niets loopt, of Slim visueel is in beeld.
   i = { caravan: caravanInvoer() of null, mon: { aan, draait, meldingen,
   ernstig, mil } of null, visueelInBeeld }. */
function ritPilModel(i){
  i=i||{};
  if(i.visueelInBeeld) return null;
  const c=caravanModel(i.caravan);
  if(c) return { soort:'caravan', ic:'🚐', st:'ok',
    tekst:'Caravanrit · '+(c.actief ? c.tekst+' · max '+c.limiet+' km/u' : c.tekst) };
  const mo=i.mon;
  if(!mo || !mo.aan) return null;
  const n=getal(mo.meldingen)||0;
  const st=!mo.draait ? 'wacht' : (mo.ernstig || mo.mil===true) ? 'ernstig' : n>0 ? 'let' : 'ok';
  const kop=!mo.draait ? 'wacht op verbinding' : n ? n+' melding'+(n===1 ? '' : 'en') : mo.mil===true ? 'motorlampje AAN' : 'kijkt mee';
  return { soort:'monitor', ic:'🛡️', st:st, tekst:'Rit-monitor · '+kop };
}
function ritPilHtml(m){
  if(!m) return '';
  return '<span class="rp-ic" aria-hidden="true">'+esc(m.ic)+'</span><span class="rp-tx">'+esc(m.tekst)+'</span><span class="rp-pijl" aria-hidden="true">›</span>';
}

window.PLVisPaneel = { TEMP:TEMP, ZWAAR:ZWAAR, HELLING_BEELD:HELLING_BEELD, TIP_MS:TIP_MS,
  tempFrac:tempFrac, procent:procent, hellingTekst:hellingTekst, hellingBeeld:hellingBeeld, zwaarAandeel:zwaarAandeel,
  tipKort:tipKort, tipVan:tipVan, caravanModel:caravanModel, trekModel:trekModel, trekHtml:trekHtml, ritModel:ritModel, ritHtml:ritHtml,
  ritPilModel:ritPilModel, ritPilHtml:ritPilHtml };
})();
