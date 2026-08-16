// ══════════════════════════════════════════════════════════════════
// pidlane-diagbundel.js
// Diagnosebundel — ruwe TX/RX + parser-uitkomst
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// DIAGNOSEBUNDEL — ruwe TX/RX mét wat de parser ervan maakte
// ──────────────────────────────────────────────────────────────────
// Een bug in de parser is met een gewoon log niet te bewijzen: je ziet
// wél wat de ECU stuurde, maar niet wat PidLane erin las. Vandaar dat
// "0107 gesnoeid terwijl de ECU 0x82 teruggaf" pas na drie rondes boven
// water kwam. Hier leggen we beide kanten naast elkaar vast, in een vorm
// die los van de app opnieuw af te spelen is.
const _diagRing=[];
function _diagNote(cmd, raw, expect, out){
  try{
    const hex=v=>Array.isArray(v)?v.map(b=>Number(b).toString(16).padStart(2,'0').toUpperCase()).join(''):String(v);
    const gevraagd=Array.from(expect||[]);
    const gekregen={}; Object.keys(out||{}).forEach(k=>{ gekregen[k]=hex(out[k]); });
    _diagRing.push({
      t:new Date().toTimeString().slice(0,8),
      tx:String(cmd||''),
      rx:String(raw==null?'':raw).replace(/[\r\n]+/g,' ').trim().slice(0,160),
      gevraagd,
      gekregen,
      mist:gevraagd.filter(p=>!(p in gekregen))
    });
    if(_diagRing.length>400) _diagRing.shift();
  }catch(e){}
}
// De exportknop "Diagnosebundel" is vervallen: de testrun (pidlane-testrun.js)
// zet deze gevallen zelf in zijn logboek, op dezelfde tijdlijn als de rest.
// Het verzamelen blijft hier, want _diagNote() wordt vanuit de pollus
// aangeroepen en is geen UI.
function plDiagGevallen(){ return _diagRing.slice(); }
window.plDiagGevallen=plDiagGevallen;

function splitBatchResponse(raw, expectPids){
  if(!raw||raw.includes('NO DATA')||raw.includes('UNABLE')||raw.includes('ERROR')||raw.includes('STOPPED')) return {};
  // Optioneel: de PIDs die in deze batch gevráágd zijn (bv. ['0141','0144','0145']).
  // Daarmee kan de parser "41" ondubbelzinnig duiden: is het een blok-echo
  // (formaat A) of PID 0x41 zelf? En stopt hij netjes op ISO-TP padding.
  const expect=new Set((expectPids||[]).map(p=>String(p).slice(2).toUpperCase()));
  // Per regel opschonen: "0:"/"1:" frame-nummers, CAN-headers (7E8/18DAxx —
  // alleen als headers aanstaan) en losse First-Frame lengteregels ("00E").
  // De oude aanpak plakte alles plat en scande daarna vrij op "41" — waardoor
  // een DATABYTE 0x41 (bv. 65 km/h of 25°C koelwater) als nieuw PID-blok kon
  // worden gelezen → verkeerde waarden. Nu: strikt sequentieel parsen.
  //
  // 2026-07-26 — de lengte-indicator werd hier weggegooid. Dat was precies de
  // informatie die de parser nodig had: de ECU zegt er exact mee hoeveel bytes
  // hij stuurt, en daarmee ligt bij een batch de lengte van een onbekend PID
  // dwingend vast (zie route 1). Hij wordt nu bewaard in `declared`.
  let hex='', declared=null;
  // `min` beschermt tegen twee valkuilen. (1) Een losse korte regel kan óók de
  // PCI-byte van een single frame zijn ("03" = 3 databytes); die is geen
  // First-Frame lengte en zou de respons te vroeg afkappen. Een echte FF komt
  // alleen voor bij meer dan 7 bytes, vandaar min 8. (2) Vóór de lengte kan
  // nog een CAN-header staan ("7E8 015 0:"), dus we nemen de LAATSTE hexgroep,
  // niet de eerste — anders lazen we 0x7E8 als lengte.
  const _pakLen=(t,min)=>{
    if(declared!=null) return;
    const m=String(t||'').match(/[0-9A-Fa-f]{1,4}/g);
    if(!m) return;
    const d=parseInt(m[m.length-1],16);
    if(d>=(min||2)&&d<=4095) declared=d;
  };
  for(let line of String(raw).split(/[\r\n]+/)){
    // ── Framemarkers eerst (fase 4-fix) ────────────────────────────
    // Een ISO-TP multiframe respons komt op deze adapter op ÉÉN regel binnen:
    //   "008 0:41430034067F 1:07820000000000"
    // De oude test keek alleen naar het BEGIN van de regel ("^N:") en zag hier
    // "008 0:" staan, dus gold de regel als ongenummerd. Gevolg: de lengte-
    // indicator én de framecijfers 0 en 1 belandden als hexcijfers in de
    // datastroom. Dat schoof alles op met één nibble en dan gebeurde er één
    // van twee dingen: de laatste PID van de batch viel weg (0107 werd
    // "gesnoeid" terwijl de ECU keurig 0x82 teruggaf), of — erger — het
    // framecijfer vormde toevallig een geldig PID-nummer en er kwam een
    // plausibele maar VERKEERDE waarde uit (0111 las 0x10 i.p.v. 0x0F).
    // Daarom nu: splits op élke framemarker, waar hij ook staat, en houd
    // alleen de payload erna. Deel 0 is de lengte-indicator en vervalt.
    if(/[0-9A-Fa-f]\s*:/.test(line)){
      const delen=line.split(/[0-9A-Fa-f]\s*:/);
      _pakLen(delen[0], 2);                        // deel 0 = de lengte-indicator
      for(let k=1;k<delen.length;k++) hex+=delen[k].replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
      continue;
    }
    let h=line.replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
    if(!h) continue;
    if(/^18DA/.test(h)) h=h.slice(8);              // 29-bit CAN header
    else if(/^7E[89A-F]/.test(h)) h=h.slice(3);    // 11-bit CAN header
    if(!/41/.test(h)&&h.length<=4){ _pakLen(h, 8); continue; }   // losse lengte-regel "00E"
    hex+=h;
  }
  // ISO-TP eerste-frame lengte-indicator (bijv "00E"=14 bytes) vooraan wegknippen
  const _mPre=hex.match(/^0[0-9A-F]{2}(?=41)/);
  if(_mPre){ _pakLen(_mPre[0], 8); hex=hex.slice(3); }
  let i=hex.indexOf('41');
  if(i<0) return {};
  // Afkappen op de opgegeven lengte: alles daarna is ISO-TP-vulling en heeft
  // hier niets te zoeken. Daarmee wordt "de parse eindigt precies op het eind"
  // een bruikbare toets in plaats van een gok over padding.
  let eind=null;
  if(declared!=null && (i+declared*2)<=hex.length){
    hex=hex.slice(0, i+declared*2);
    eind=hex.length;
  }
  i+=2;

  // ── Route 1: verwachte PID-lijst bekend → adaptieve backtracking-parser ──
  // Voertuigen wijken af van de J1979-bytelengtes: op de Mazda SkyActiv zijn
  // PID 55/56 bv. 1 byte i.p.v. de standaard 2. Een vaste tabel knipt dan
  // verkeerd en de rest van de batch gaat verloren. Omdat we wéten welke PIDs
  // gevraagd zijn, proberen we per PID meerdere plausibele lengtes
  // (tabelwaarde eerst, dan 1/2/4) en kiezen de segmentatie die de meeste
  // gevraagde PIDs verklaart — met voorkeur voor een parse die netjes eindigt
  // op padding of het einde van de respons. Max 3 PIDs per batch → hoogut
  // enkele tientallen paden, verwaarloosbaar qua rekenwerk.
  if(expect.size){
    let best=null;
    const exact=(eind!=null);
    const consider=(acc,clean)=>{
      const score=Object.keys(acc).length;
      if(!best||score>best.score||(score===best.score&&clean&&!best.clean))
        best={out:{...acc},score,clean};
    };
    const rec=(pos,remaining,acc,depth)=>{
      if(depth>16) return;
      const rest=hex.slice(pos);
      if(!remaining.length||!rest||(!exact&&/^0+$/.test(rest))||rest.length<2){
        // Met bekende lengte is "netjes" alléén: precies op het eind uitgekomen.
        consider(acc, exact ? (rest.length===0) : true);
        return;
      }
      const suf=rest.slice(0,2);
      // Blok-echo "41" (formaat A) overslaan — behalve als "41" hier als
      // PID zelf verwacht wordt (die tak wordt hieronder ook geprobeerd).
      if(suf==='41'&&!remaining.includes('41')){
        rec(pos+2,remaining,acc,depth+1);
      }
      if(remaining.includes(suf)){
        const kand=[pidByteLen(suf),1,2,4];
        // ── De lengtevergelijking ──────────────────────────────────
        // De ECU gaf het totaal aantal bytes. Nemen we voor de óverige
        // gevraagde PIDs de bekende lengte aan, dan ligt de lengte van dít
        // PID vast: hij is wat er overblijft. Dat is geen gok maar rekenwerk,
        // en precies wat 6D=11 oplost zonder dat de tabel het hoeft te weten.
        // Faalt de aanname over de anderen, dan is dit gewoon één kandidaat
        // extra die het niet wordt — de bestaande paden blijven bestaan.
        if(exact){
          let anderen=0;
          for(const j of remaining) if(j!==suf) anderen+=1+pidByteLen(j);
          const n=(eind-pos)/2-1-anderen;
          if(n>=1&&n<=64) kand.push(n);
        }
        for(const n of [...new Set(kand)]){
          const end=pos+2+n*2;
          if(end>hex.length) continue;
          const b=[];
          for(let k=0;k<n;k++) b.push(parseInt(hex.slice(pos+2+k*2,pos+2+k*2+2),16));
          rec(end,remaining.filter(x=>x!==suf),Object.assign({},acc,{['01'+suf]:b}),depth+1);
        }
      }
      consider(acc,false);                       // doodlopend pad → partial vastleggen
    };
    rec(i,[...expect],{},0);
    // ── Terugkoppeling naar PLPidLen ───────────────────────────────
    // Alleen leren van een parse die ALLE gevraagde PIDs verklaart én exact
    // op de opgegeven lengte eindigt. Anders zouden we ruis vastleggen en
    // zichzelf laten bevestigen. Eén PID gevraagd + lengte bekend = solo:
    // die meting is ondubbelzinnig en telt meteen.
    try{
      if(best && exact && best.clean && best.score===expect.size && window.PLPidLen){
        const bron=(expect.size===1)?'solo':'batch';
        for(const k of Object.keys(best.out)) window.PLPidLen.melden(k.slice(2), best.out[k].length, bron);
      }
    }catch(e){}
    return best?best.out:{};
  }

  // ── Route 2 (fallback, geen verwachting): sequentieel op tabelwaardes ──
  // Eén parser voor beide formaten: na elke "41" volgt PID-nummer + databytes;
  // daarna óf direct het volgende PID-nummer (formaat B: één 41-echo) óf een
  // nieuwe "41" (formaat A: los blok per PID).
  const out={};
  let guard=0;
  while(i+2<=hex.length&&guard++<24){
    let suf=hex.slice(i,i+2);
    if(suf==='41'&&PID_BYTE_LEN[hex.slice(i+2,i+4)]){ i+=2; suf=hex.slice(i,i+2); }  // blok-echo
    if(!PID_BYTE_LEN[suf]) break;                    // onbekend PID-nummer of padding → stop
    const n=pidByteLen(suf), b=[];
    for(let k=0;k<n&&i+2+k*2+2<=hex.length;k++) b.push(parseInt(hex.slice(i+2+k*2,i+2+k*2+2),16));
    if(b.length<n) break;
    out['01'+suf]=b;
    i+=2+n*2;
  }
  return out;
}

function parsePID(pid,raw){
  // Ruwe respons per PID bewaren. Kost niets en maakt een opvallende meting
  // achteraf naspeurbaar: de let-op-melding in pidlane-datalog.js zet 'm erbij,
  // zodat je bij een rare waarde de bytes ziet in plaats van te moeten gokken
  // of het de motor was of de batch-splitsing.
  try{ (window._pidRuw=window._pidRuw||{})[pid]=String(raw||'').trim().slice(0,40); }catch(e){}
  if(!raw||raw.includes('NO DATA')||raw.includes('ERROR')||raw.includes('UNABLE')||raw.includes('?')) return null;
  const cleaned=raw.replace(/[^0-9A-Fa-f]/g,'');
  if(cleaned.length<4) return null;
  // Vind data bytes na mode+pid echo
  const hdr=((parseInt(pid.slice(0,2),16)+0x40).toString(16).toUpperCase().padStart(2,'0'))+pid.slice(2).toUpperCase();
  const idx=cleaned.toUpperCase().indexOf(hdr);
  const ds=idx>=0?idx+hdr.length:4;
  const b=[];
  for(let i=ds;i<cleaned.length-1;i+=2) b.push(parseInt(cleaned.slice(i,i+2),16));
  if(!b.length) return null;
  // Gebruik parse functie uit discovery definitie
  const def=discoveredPIDDefs.find(d=>d.pid===pid)||ALL_PID_DEFS[pid];
  let rawVal=null;
  if(def?.parse){ try{rawVal=def.parse(b);}catch(e){} }
  else rawVal=b[0]??null;
  return validateAndSmooth(pid,rawVal);
}

// Verwerk al-gesplitste bytes voor één PID (uit een batch-respons)
function applyParsedBytes(pid,bytes){
  if(!bytes||!bytes.length) return null;
  // Structuur meekijken vóór het parsen: PLPidVorm werkt op de RUWE bytes en
  // merkt zo op dat een PID helemaal geen enkelvoudige sensorwaarde is (zoals
  // 016D, dat als temperatuur wordt uitgelezen maar een regelblok is).
  try{ window.PLPidVorm && window.PLPidVorm.zie(pid, bytes); }catch(e){}
  const def=getPidDef(pid);
  let rawVal=null;
  if(def?.parse){ try{rawVal=def.parse(bytes);}catch(e){} }
  else rawVal=bytes[0]??null;
  if(rawVal===null||rawVal===undefined||isNaN(rawVal)) return null;
  return validateAndSmooth(pid,rawVal);
}

// Meet de bytelengte van één PID uit een solo-antwoord en geef de ruwe bytes
// door aan de structuurdetector. De Full Survey vraagt élke ondersteunde PID
// afzonderlijk op — dat is het ideale ijkmoment — maar die lus gebruikt
// parsePID() en kwam dus nooit langs splitBatchResponse(), waar het meten
// gebeurt. Deze functie sluit dat gat; de waarde zelf blijft van parsePID().
window.plMeetPidLengte=function(pid, raw){
  try{
    const out=splitBatchResponse(raw,[pid]);
    const b=out && out[pid];
    if(b && b.length) window.PLPidVorm && window.PLPidVorm.zie(pid, b);
  }catch(e){}
};

// ════════════════════════════════════════
// POLL LOOP — P5: per-PID frequentie-scheduler
// ════════════════════════════════════════
// Elk PID krijgt een poll-klasse (interval in ms). Snelle signalen (toerental,
// snelheid, gaspedaal) worden veel vaker bevraagd dan trage (temperatuur,
// brandstofpeil). Dit voorkomt dat 15 PIDs op één traag tempo de hele ronde
// vertragen — de kandidaat-oorzaak van "slim filter maakt de app traag".
// Suffix = PID zonder '01'-prefix. Niet vermeld = MID (default).
// → PID_POLL_CLASS verplaatst naar pidlane-data.js
// ── POLLPROFIEL (fase 3) ────────────────────────────────────────────
// Twee lagen, meer niet:
//   _pollProfileAuto = wat de situatie vraagt (analyse, live view, caravan)
//   _pollProfileVast = wat de gebruiker handmatig heeft vastgezet (wint altijd)
let _pollProfileVast=null, _pollProfileAuto='basis';
try{ _pollProfileVast=localStorage.getItem('pl_pollprofiel')||null; }catch(e){}
function actiefPollProfiel(){
  const naam=_pollProfileVast || _pollProfileAuto;
  return (window.POLL_PROFIELEN && POLL_PROFIELEN[naam]) ? naam : 'basis';
}
function setPollProfile(naam, reden){
  if(!window.POLL_PROFIELEN || !POLL_PROFIELEN[naam]) return;
  if(_pollProfileAuto===naam) return;
  _pollProfileAuto=naam;
  _pidNextPoll={};                       // nieuw tempo direct laten ingaan
  if(!_pollProfileVast){
    const p=POLL_PROFIELEN[naam];
    try{ btDiag('Pollprofiel: '+p.emoji+' '+p.label+(reden?' ('+reden+')':''),'info'); }catch(e){}
  }
}
// Handmatig vastzetten vanuit het busdiagnose-scherm (null = weer automatisch)
function zetPollProfielVast(naam){
  _pollProfileVast = (naam && window.POLL_PROFIELEN && POLL_PROFIELEN[naam]) ? naam : null;
  try{ if(_pollProfileVast) localStorage.setItem('pl_pollprofiel',_pollProfileVast);
       else localStorage.removeItem('pl_pollprofiel'); }catch(e){}
  _pidNextPoll={};
  try{ showToast(_pollProfileVast?('Pollprofiel vast: '+POLL_PROFIELEN[_pollProfileVast].label):'Pollprofiel weer automatisch'); }catch(e){}
}
window.setPollProfile=setPollProfile; window.zetPollProfielVast=zetPollProfielVast;
