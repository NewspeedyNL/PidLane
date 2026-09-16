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
      // `t` is de kloktijd voor het scherm; het testrunverslag drukt hem zo af.
      // `ms` is het epoch ernaast, net als bij log() en btDiag() sinds #75 —
      // zonder dat getal is een regel niet met een andere bron te vergelijken
      // en valt hij over middernacht op de verkeerde plek in het logboek (#140).
      t:new Date().toTimeString().slice(0,8),
      ms:Date.now(),
      tx:String(cmd||''),
      rx:String(raw==null?'':raw).replace(/[\r\n]+/g,' ').trim().slice(0,160),
      gevraagd,
      gekregen,
      mist:gevraagd.filter(p=>!(p in gekregen))
    });
    if(_diagRing.length>400) _diagRing.shift();
  }catch(e){ /* stil: dit is alleen de interne diagnoseregistratie, geen kernpad */ }
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
  let hex='', declared=null, lenGezien=0, echo=false;
  // `min` beschermt tegen twee valkuilen. (1) Een losse korte regel kan óók de
  // PCI-byte van een single frame zijn ("03" = 3 databytes); die is geen
  // First-Frame lengte en zou de respons te vroeg afkappen. Een echte FF komt
  // alleen voor bij meer dan 7 bytes, vandaar min 8. (2) Vóór de lengte kan
  // nog een CAN-header staan ("7E8 015 0:"), dus we nemen de LAATSTE hexgroep,
  // niet de eerste — anders lazen we 0x7E8 als lengte.
  //
  // Geeft nu terug ÓF er een lengte-indicator herkend is, niet alleen of het de
  // eerste was. Die tweede vraag is sinds 16-09-2026 het hele punt — zie de
  // stop hieronder. `lenGezien` telt ze; `declared` blijft de eerste.
  //
  // EN EEN CAN-HEADER TELT NIET MEE (16-09-2026). "7E8" staat op precies
  // dezelfde plek als een lengte en heeft dezelfde vorm, dus zonder deze regel
  // zou elke frameregel met headers aan als een nieuw bericht gelden en zou de
  // stop hieronder meteen bij frame 0 toeslaan. Hij werd tot vandaag als lengte
  // 2024 gelezen — onschadelijk, want zo'n lengte kapt nooit iets af, maar
  // daarmee ook nooit opgemerkt.
  const _pakLen=(t,min)=>{
    const m=String(t||'').match(/[0-9A-Fa-f]{1,4}/g);
    if(!m) return false;
    const laatste=String(m[m.length-1]).toUpperCase();
    if(/^7E[0-9A-F]$/.test(laatste)) return false;
    const d=parseInt(laatste,16);
    if(!(d>=(min||2)&&d<=4095)) return false;
    lenGezien++;
    if(declared==null) declared=d;
    return true;
  };
  /* ── EEN TWEEDE LENGTE-INDICATOR IS EEN TWEEDE BERICHT (16-09-2026) ──────
     Gemeten met een goedkope ELM327-kloon op een Mazda CX-5. Die adapter zet
     soms midden in een multiframe-antwoord een nieuwe lengteregel neer,
     gevolgd door een frame dat opnieuw met 41 begint:

       goed    008  0:410C08A50D00  1:111C
       kapot   008  0:410C08670D00  008  1:410C  2:111C0000000000

     Tot vandaag gooide _pakLen() die tweede regel weg (hij keerde terug zodra
     `declared` gezet was) en plakte de lus het frame erachter gewoon aan
     dezelfde hexstroom. Daarna kapte de regel hieronder af op de EERSTE
     opgegeven lengte — en dan zit de echo van twee bytes bínnen die acht en
     duwt hij de laatste PID van de batch eruit.

     Meestal kostte dat één PID: 7 van de 20 batches 010C0D11 misten 0111. Eén
     keer was het duurder. Bij 010B0E10 vulden de echobytes (41 0B) de
     opgegeven lengte precies af, en "eindigt precies op het eind" is juist het
     kenmerk waarop route 1 haar beste kandidaat kiest:

       008 0:410B1E0E8B10 008 1:410B 2:00760000000000
         → 010B=30 kPa  010E=5,5°  0110=166,51 g/s   (geen MIST, geen melding)

     Een losse 0110 gaf in dezelfde seconde 1,45 g/s, en de harde limiet van
     MAF staat op 0-655, dus dat getal komt overal doorheen. Dit is letterlijk
     de fout die het commentaar hierboven sinds 26-07 aankondigt, alleen levert
     de adapter het materiaal aan in plaats van onze eigen parser.

     Vandaar: stoppen zodra er een tweede lengte-indicator langskomt terwijl er
     al data verzameld is. Wat daarna komt hoort bij een ander bericht en is
     niet ons antwoord. Een herhaling ZONDER lengteregel (410442 410442 410442)
     raakt hier niets: die parst vandaag goed en blijft dat doen, want de
     afkapregel hieronder haalt hem alsnog weg. Zie PIDLANE.md §11 en #210. */
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
      // deel 0 = de lengte-indicator. Is het de tweede en staat er al data,
      // dan begint hier een tweede bericht en houdt het antwoord op.
      if(_pakLen(delen[0], 2) && lenGezien>1 && hex){ echo=true; break; }
      for(let k=1;k<delen.length;k++) hex+=delen[k].replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
      continue;
    }
    let h=line.replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
    if(!h) continue;
    if(/^18DA/.test(h)) h=h.slice(8);              // 29-bit CAN header
    else if(/^7E[89A-F]/.test(h)) h=h.slice(3);    // 11-bit CAN header
    if(!/41/.test(h)&&h.length<=4){                              // losse lengte-regel "00E"
      if(_pakLen(h, 8) && lenGezien>1 && hex){ echo=true; break; }
      continue;
    }
    hex+=h;
  }
  /* Eén teller naar buiten, geen logregel per geval. Dit gebeurt op een
     echoënde adapter een paar keer per seconde; een btDiag() erbij zou het
     BT-log onleesbaar maken. Het adapterpaneel (PLAdapter) toont de teller, en
     daar is hij precies wat de gebruiker moet weten: deze adapter herhaalt
     frames. Stil wegkijken is het niet — hij staat op het scherm en in de
     testrun. */
  if(echo){ try{ if(window.PLBus && typeof PLBus.noteEcho==='function') PLBus.noteEcho(); }
            catch(e){ console.warn('PLBus.noteEcho mislukt — de echoteller van deze adapter loopt niet mee', e); } }
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
  /* ── DE ECU BELOOFDE MEER BYTES DAN ER LIGGEN (16-09-2026) ──────────────
     `kort` betekent: er is een lengte opgegeven en we hebben er minder. Dat
     gebeurt bij een afgekapt antwoord (de adapter zet de prompt neer vóór het
     laatste frame binnen is) en sinds de stop hierboven ook bij een echo.

     Waarom dat de kandidatenlijst hieronder raakt. Die lijst probeert naast de
     tabelwaarde ook 1, 2 en 4 bytes, omdat voertuigen van J1979 afwijken — op
     deze Mazda zijn 0155/0156 één byte in plaats van twee. Dat aftasten heeft
     alleen betekenis op een COMPLEET bericht: dan is "de parse eindigt precies
     op de opgegeven lengte" het bewijs dat de gekozen indeling klopt. Op een
     afgekapt bericht bestaat dat bewijs niet, en dan wint altijd de kortste
     gok die nog past.

     Gemeten op het echo-geval van 00B 0:4115A380347F: 0134 is vier bytes, er
     liggen er twee, en zonder deze regel komt 0134 als één byte (127) terug —
     een getal dat nergens op slaat en nergens als fout opvalt. Mét deze regel
     valt 0134 weg en staat hij als MIST in het verslag. Dat is het verschil
     tussen een gat dat je ziet en een gat dat je gelooft. */
  const kort=(declared!=null && eind===null);
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
        // Afgekapt bericht → alleen de bekende lengte. Zie `kort` hierboven:
        // aftasten zonder eindpunt levert de kortste gok op, niet de juiste.
        const kand=kort?[pidByteLen(suf)]:[pidByteLen(suf),1,2,4];
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
    }catch(e){ console.warn('PLPidLen.melden mislukt:', e); }
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
  try{ (window._pidRuw=window._pidRuw||{})[pid]=String(raw||'').trim().slice(0,40); }catch(e){ /* stil: alleen een cache voor weergave, geen kernpad */ }
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
  if(def?.parse){ try{rawVal=def.parse(b);}catch(e){ console.warn('def.parse mislukt:', e); } }
  else rawVal=b[0]??null;
  return validateAndSmooth(pid,rawVal);
}

// Verwerk al-gesplitste bytes voor één PID (uit een batch-respons)
function applyParsedBytes(pid,bytes){
  if(!bytes||!bytes.length) return null;
  // Structuur meekijken vóór het parsen: PLPidVorm werkt op de RUWE bytes en
  // merkt zo op dat een PID helemaal geen enkelvoudige sensorwaarde is (zoals
  // 016D, dat als temperatuur wordt uitgelezen maar een regelblok is).
  try{ window.PLPidVorm && window.PLPidVorm.zie(pid, bytes); }catch(e){ console.warn('PLPidVorm.zie mislukt:', e); }
  const def=getPidDef(pid);
  let rawVal=null;
  if(def?.parse){ try{rawVal=def.parse(bytes);}catch(e){ console.warn('def.parse mislukt:', e); } }
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
  }catch(e){ console.warn('splitBatchResponse mislukt:', e); }
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
try{ _pollProfileVast=localStorage.getItem('pl_pollprofiel')||null; }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
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
    try{ btDiag('Pollprofiel: '+p.emoji+' '+p.label+(reden?' ('+reden+')':''),'info'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  }
}
// Handmatig vastzetten vanuit het busdiagnose-scherm (null = weer automatisch)
function zetPollProfielVast(naam){
  _pollProfileVast = (naam && window.POLL_PROFIELEN && POLL_PROFIELEN[naam]) ? naam : null;
  try{ if(_pollProfileVast) localStorage.setItem('pl_pollprofiel',_pollProfileVast);
       else localStorage.removeItem('pl_pollprofiel'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  _pidNextPoll={};
  try{ showToast(_pollProfileVast?('Pollprofiel vast: '+POLL_PROFIELEN[_pollProfileVast].label):'Pollprofiel weer automatisch'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
}
window.setPollProfile=setPollProfile; window.zetPollProfielVast=zetPollProfielVast;
