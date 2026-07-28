// ══════════════════════════════════════════════════════════════════
// pidlane-busdiag.js
// Busdiagnose — live inzicht in de OBD-bus
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// BUSDIAGNOSE — live inzicht in wat de OBD-bus doet   (fase 4)
// ──────────────────────────────────────────────────────────────────
// Het meest gevraagde stuk: als de responstijd van 25ms naar 180ms
// springt, wil je dát zien in plaats van te gissen waarom de data
// onrustig wordt. Toont doorvoer, foutpercentage, ECU-belasting,
// batchgrootte, wie de bus vasthoudt, de traagste PIDs en de PIDs met
// de laagste kwaliteitsscore. Plus: pollprofiel handmatig vastzetten.
// Alleen voor admin — dit is gereedschap, geen gebruikersfunctie.
// ══════════════════════════════════════════════════════════════════
let _busDiagTimer=null;

function openBusDiag(){
  if(!isAdmin()){ showToast?.('Alleen voor admin'); return; }
  let ov=document.getElementById('busDiagOv');
  if(!ov){
    ov=document.createElement('div'); ov.id='busDiagOv';
    ov.style.cssText='position:fixed;inset:0;z-index:9970;background:rgba(8,11,17,.94);display:flex;flex-direction:column;padding:14px;gap:10px;overflow-y:auto;-webkit-overflow-scrolling:touch';
    ov.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">'+
      '<div style="font-size:16px;font-weight:800;color:var(--tx)">🩺 Busdiagnose</div>'+
      '<button onclick="PLBus.resetStats();renderBusDiag()" style="margin-left:auto;background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:7px 12px;font:600 12px var(--f);cursor:pointer">Reset</button>'+
      '<button onclick="closeBusDiag()" style="background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:8px;padding:7px 14px;font:600 12px var(--f);cursor:pointer">Sluiten</button>'+
      '</div><div id="busDiagBody" style="flex:1"></div>';
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  renderBusDiag();
  clearInterval(_busDiagTimer);
  _busDiagTimer=setInterval(renderBusDiag,1000);
}
function closeBusDiag(){
  clearInterval(_busDiagTimer); _busDiagTimer=null;
  const ov=document.getElementById('busDiagOv'); if(ov) ov.style.display='none';
}
window.openBusDiag=openBusDiag; window.closeBusDiag=closeBusDiag;

function _bdKaart(titel, rijen){
  return '<div style="background:var(--sur);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;margin-bottom:9px">'+
    '<div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.4px;text-transform:uppercase;margin-bottom:7px">'+titel+'</div>'+
    rijen.map(r=>'<div style="display:flex;gap:8px;font-size:13px;line-height:1.9"><span style="color:var(--tx2)">'+r[0]+'</span><span style="margin-left:auto;font-weight:700;color:'+(r[2]||'var(--tx)')+'">'+r[1]+'</span></div>').join('')+
    '</div>';
}
function _bdKleur(waarde, waarschuw, slecht){
  if(waarde>=slecht) return 'var(--rd)';
  if(waarde>=waarschuw) return 'var(--or)';
  return 'var(--gn)';
}

function renderBusDiag(){
  const box=document.getElementById('busDiagBody'); if(!box) return;
  const s=PLBus.stats();
  const eig=PLBus.owner();
  const prof=POLL_PROFIELEN[actiefPollProfiel()]||{label:'?',emoji:''};

  let h='';

  // ── BUSTOESTAND: afgeleid, niet gekozen (fase 4) ──
  // Vervangt het handmatig instellen van "snel/langzaam": dit toont wat de
  // bus feitelijk doet en op welk percentage van het gevraagde tempo de
  // regelkring is uitgekomen.
  try{
    const L=PLLoad.staat();
    const vulPct=Math.max(4,Math.min(100,L.tempoPct));
    h+='<div style="background:var(--sur);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;margin-bottom:9px">'+
       '<div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.4px;text-transform:uppercase;margin-bottom:7px">Bustoestand</div>'+
       '<div style="display:flex;align-items:baseline;gap:8px">'+
         '<span style="font-size:16px;font-weight:800;color:'+L.kleur+'">'+L.label+'</span>'+
         '<span style="margin-left:auto;font-size:13px;font-weight:700;color:var(--tx)">'+L.tempoPct+'% tempo</span>'+
       '</div>'+
       '<div style="height:7px;border-radius:4px;background:var(--sur2);margin:8px 0 6px;overflow:hidden">'+
         '<div style="height:100%;width:'+vulPct+'%;background:'+L.kleur+';transition:width .4s"></div>'+
       '</div>'+
       '<div style="font-size:12px;color:var(--tx2);line-height:1.5">'+L.uitleg+'</div>'+
       '</div>';
  }catch(e){}

  // ── verbinding & slot ──
  h+=_bdKaart('Bus', [
    ['Status', connected?(demoMode?'demo':'verbonden'):'niet verbonden', connected&&!demoMode?'var(--gn)':'var(--or)'],
    ['Slot', eig?(eig+' — '+Math.round(PLBus.heldMs())+' ms'):'vrij', eig&&eig!=='poll'?'var(--or)':'var(--tx)'],
    ['Pauze totaal', Math.round(PLBus.pausedTotal()/100)/10+' s'],
  ]);

  // ── doorvoer (10s-venster) ──
  h+=_bdKaart('Doorvoer (laatste 10 s)', [
    ['Commando/sec', s.perSec],
    ['Responstijd nu', s.venGemMs+' ms', _bdKleur(s.venGemMs,120,250)],
    ['Responstijd sessie', s.gemMs+' ms'],
    ['Foutpercentage', s.foutPct+' %', _bdKleur(s.foutPct,15,35)],
    // 2026-07-26 — nieuw. Foutpercentage telt alleen TRANSPORTfouten; een
    // respons die netjes binnenkomt maar waarin een gevraagde PID ontbreekt
    // was tot nu toe volledig onzichtbaar. Precies daardoor kon de 6D-desync
    // maandenlang doorlopen met een dashboard dat 0 % fouten meldde.
    ['Onvolledige responsen', (s.onvolPct||0)+' % <span style="opacity:.55">('+(s.reqOnvol||0)+'/'+(s.reqTot||0)+')</span>', _bdKleur(s.onvolPct||0,3,10)],
    ['ECU-belasting', s.belasting+' %', _bdKleur(s.belasting,70,90)],
    ['Commando totaal', s.totaal+' ('+s.bad+' mis)'],
  ]);

  // ── polling ──
  const gesnoeid=_pidDead.size;
  h+=_bdKaart('Polling', [
    ['Actieve PIDs', activePIDs.size],
    ['Gesnoeid (dood)', gesnoeid, gesnoeid?'var(--or)':'var(--gn)'],
    ['Multi-PID groep', (window._batchSupported===false?'uit':s.batchGroep+' PIDs'), window._batchSupported===false?'var(--or)':'var(--tx)'],
    ['Strategie', (typeof _connStrategy!=='undefined'&&_connStrategy)?_connStrategy:'—'],
  ]);

  // ── pollprofiel + handmatig vastzetten ──
  h+='<div style="background:var(--sur);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;margin-bottom:9px">'+
     '<div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.4px;text-transform:uppercase;margin-bottom:7px">Pollprofiel</div>'+
     '<div style="font-size:13px;color:var(--tx);font-weight:700;margin-bottom:2px">'+prof.emoji+' '+prof.label+(_pollProfileVast?' (vastgezet)':' (automatisch)')+'</div>'+
     '<div style="font-size:12px;color:var(--tx2);margin-bottom:9px">'+(prof.desc||'')+'</div>'+
     '<div style="display:flex;flex-wrap:wrap;gap:6px">'+
     Object.keys(POLL_PROFIELEN).filter(k=>k!=='auto').map(k=>{
       const p=POLL_PROFIELEN[k], aan=(_pollProfileVast===k);
       return '<button onclick="zetPollProfielVast('+(aan?'null':("'"+k+"'"))+')" style="background:'+(aan?'var(--bl)':'var(--sur2)')+';color:'+(aan?'#fff':'var(--tx2)')+';border:1px solid '+(aan?'var(--bl)':'var(--bd)')+';border-radius:8px;padding:6px 10px;font:700 11px var(--f);cursor:pointer">'+p.emoji+' '+p.label+'</button>';
     }).join('')+
     '</div><div style="font-size:11px;color:var(--tx3);margin-top:7px">Nogmaals tikken = weer automatisch (volgt de analyse).</div></div>';

  // ── traagste PIDs ──
  const perPid=s.perPid||{};
  const traag=Object.keys(perPid).filter(p=>perPid[p].n>=3)
    .map(p=>({pid:p, ms:Math.round(perPid[p].msSom/perPid[p].n), n:perPid[p].n, mis:perPid[p].mis}))
    .sort((a,b)=>b.ms-a.ms).slice(0,6);
  if(traag.length){
    h+=_bdKaart('Traagste sensoren', traag.map(x=>{
      const d=(typeof getPidDef==='function')?getPidDef(x.pid):null;
      return [((d&&d.name)||x.pid)+' <span style="opacity:.55">'+x.pid+'</span>', x.ms+' ms', _bdKleur(x.ms,150,300)];
    }));
  }

  // ── laagste kwaliteitsscore ──
  const zwak=[...activePIDs].map(p=>({pid:p,q:pidQuality(p)})).filter(x=>x.q<100)
    .sort((a,b)=>a.q-b.q).slice(0,6);
  if(zwak.length){
    h+=_bdKaart('Laagste betrouwbaarheid', zwak.map(x=>{
      const d=(typeof getPidDef==='function')?getPidDef(x.pid):null;
      return [((d&&d.name)||x.pid)+' <span style="opacity:.55">'+x.pid+'</span>', x.q+' %', _bdKleur(100-x.q,40,70)];
    }));
  } else {
    h+=_bdKaart('Laagste betrouwbaarheid', [['Alle actieve sensoren','100 %','var(--gn)']]);
  }

  // ── bytelengtes: waar wijkt dit voertuig af van de J1979-tabel? ──
  // Zonder deze kaart is de zelfcorrectie onzichtbaar, en dan is een stille
  // correctie net zo lastig te vertrouwen als de stille fout die eraan
  // voorafging. Leeg = de tabel klopt voor dit voertuig.
  try{
    const afw=(window.PLPidLen&&window.PLPidLen.afwijkingen())||[];
    if(afw.length){
      h+=_bdKaart('Bytelengte — gemeten ≠ tabel', afw.slice(0,8).map(a=>{
        const d=(typeof getPidDef==='function')?getPidDef(a.pid):null;
        return [((d&&d.name)||a.pid)+' <span style="opacity:.55">'+a.pid+'</span>',
                a.tabel+' → '+a.gemeten+' byte'+(a.gemeten===1?'':'s')+' <span style="opacity:.55">('+a.n+'×)</span>',
                'var(--or)'];
      }));
    } else {
      h+=_bdKaart('Bytelengte — gemeten ≠ tabel', [['Geen afwijkingen gemeten','tabel klopt','var(--gn)']]);
    }
  }catch(e){}

  // ── structuurtwijfel: PID is waarschijnlijk geen enkelvoudige sensor ──
  // Bewust alleen MELDEN. De waarde wordt niet weggefilterd en het label niet
  // aangepast: een sensor stilletjes uit een diagnose laten vallen op grond
  // van een heuristiek is erger dan de fout die we opsporen.
  try{
    const vt=(window.PLPidVorm&&window.PLPidVorm.verdacht())||[];
    if(vt.length){
      h+=_bdKaart('Structuur wijkt af van definitie', vt.slice(0,6).map(v=>{
        const d=(typeof getPidDef==='function')?getPidDef(v.pid):null;
        return [((d&&d.name)||v.pid)+' <span style="opacity:.55">'+v.pid+'</span>',
                'controleren <span style="opacity:.55">('+v.n+' metingen)</span>', 'var(--or)'];
      }));
    }
  }catch(e){}

  // ── monitor ──
  h+=_bdKaart('Rit-monitor', [
    ['Status', (typeof monitorStatusTekst==='function')?monitorStatusTekst():'—'],
  ]);

  box.innerHTML=h;
}
window.renderBusDiag=renderBusDiag;
