// ══════════════════════════════════════════════════════════════════
// pidlane-neon.js
// Wat er na het Neon-dashboard (weg sinds 19-11-2026) nog in staat: de
// afkorter voor sensornamen (hudShortLabel) en het herverbinden bij terugkeer.
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ── HUD: slimme korte labels ────────────────────────────────────────
// De hoekmeters zijn smal; brute afkapping ("BRANDSTOFTRI") is onleesbaar.
// hudShortLabel kort termen af op betekenis i.p.v. tekenaantal: eerst via
// een woordenboek van veelgebruikte automotive-termen, daarna door de
// minst informatieve woorden weg te laten, en pas als laatste redmiddel
// een nette afkapping op een woordgrens.
// → HUD_LABEL_DICT verplaatst naar pidlane-data.js
//
// De grens staat standaard op elf tekens. Dat is de HUD-hoekmeter: één regel,
// smal. De tellerplaat van de slimme weergave heeft er twee, en gaf die grens
// dus de helft van zijn ruimte weg — met "ABS. MOTO" als resultaat (#95).
// Daarom is de grens sinds 03-09-2026 een parameter en geen vaste waarde; wie
// hem niet meegeeft krijgt de HUD-grens, dus de hoekmeters veranderen niet.
function hudShortLabel(name, max){
  if(!name) return '';
  const MAX=(typeof max==='number' && max>=4) ? Math.floor(max) : 11;
  let n=name.trim();
  if(n.length<=MAX) return n.toUpperCase();
  // 1) woord-voor-woord vertalen via woordenboek, met bank-nummers behouden
  const words=n.split(/\s+/);
  const mapped=words.map(w=>{
    const key=w.toLowerCase().replace(/[^a-zà-ÿ0-9]/gi,'');
    if(HUD_LABEL_DICT[key]) return HUD_LABEL_DICT[key];
    // "B1"/"B2"/"K1" e.d. ongewijzigd laten
    if(/^[a-z]?\d$/i.test(w)) return w.toUpperCase();
    return w.toUpperCase();
  });
  let out=mapped.join(' ');
  if(out.length<=MAX) return out;
  // 1b) één lang samengesteld woord (geen spaties): zoek bekende deeltermen
  if(words.length===1){
    const low=n.toLowerCase();
    // langste woordenboek-sleutels eerst, zodat "koelvloeistoftemp" vóór "temp" matcht
    const keys=Object.keys(HUD_LABEL_DICT).sort((a,b)=>b.length-a.length);
    const parts=[];
    let rest=low;
    while(rest.length){
      const k=keys.find(k=>rest.startsWith(k));
      if(k){ parts.push(HUD_LABEL_DICT[k]); rest=rest.slice(k.length); }
      else { rest=rest.slice(1); }   // onbekend teken overslaan
    }
    if(parts.length){
      const combo=parts.join('.');
      if(combo.length<=MAX) return combo;
      return combo.slice(0,MAX);
    }
  }
  // 2) korte verbindingswoorden weglaten
  const drop=new Set(['VAN','MET','DE','HET','EN','OP','IN','ABS']);
  const trimmed=mapped.filter((w,i)=>i===0||!drop.has(w)).join(' ');
  if(trimmed.length<=MAX) return trimmed;
  // 3) inkorten — maar niet in het woord dat zegt WAT er gemeten wordt.
  //    Tot 03-09-2026 stond hier "eerste woord op zes tekens, tweede op vier".
  //    Van "ABS. MOTORBELAST" bleef daardoor "ABS. MOTO" over: de bepaling
  //    overleefde heel en de grootheid werd afgekapt, precies andersom dan je
  //    wilt (#95). De ruimte gaat nu eerst naar het LAATSTE woord — dat noemt
  //    de grootheid — en wat overblijft is voor de woorden ervoor, die de
  //    variant aanduiden. Onder de drie tekens korten we niet in: "MOT" zegt
  //    niets meer, en dan is weglaten eerlijker dan suggereren.
  if(mapped.length>=2){
    const laatst=mapped[mapped.length-1];
    const eerder=mapped.slice(0,-1);
    const over=MAX-laatst.length-eerder.length;      // de spaties meegerekend
    const perWoord=Math.floor(over/eerder.length);
    if(perWoord>=3){
      const combo=eerder.map(function(w){ return w.slice(0,perWoord); }).join(' ')+' '+laatst;
      if(combo.length<=MAX) return combo;
    }
  }
  // 4) laatste redmiddel: afkappen op woordgrens, nooit midden in een woord.
  //    Reikt die opsomming niet tot het laatste woord, dan zegt het label niet
  //    meer WAT er gemeten wordt — bij "Abs. motorbelasting" hield je dan
  //    alleen "ABS." over. Dat laatste woord alleen is dan het betere antwoord:
  //    het noemt de grootheid en is een echte naam. Dragen twee meters daardoor
  //    dezelfde naam, dan valt slimMeterLabels() terug op de volledige naam;
  //    die botsingscontrole is de plek die dat al beslist.
  let acc='';
  for(const w of mapped){
    if((acc+(acc?' ':'')+w).length>MAX) break;
    acc+=(acc?' ':'')+w;
  }
  const grootheid=mapped[mapped.length-1];
  if(acc.indexOf(grootheid)<0 && grootheid.length<=MAX) return grootheid;
  return acc||mapped[0].slice(0,MAX);
}


// Terugkeer naar de app zonder volledige herlaad (tab-wissel, ander venster):
// is de verbinding ondertussen weggevallen, dan automatisch herverbinden.
// Alleen een verbinding die er wás toen de app wegging (14-11-2026). Tot dan
// las dit alleen pl_autoconn, en die blijft staan na elke verbinding: wie het
// aftellen had geannuleerd en de app wilde sluiten, kreeg bij de eerste
// terugkeer meteen "Adapter zoeken" — ook op het inlogscherm. En herverbinden
// gaat via de aftelbalk (PLStrook.aftellen): vijf seconden met Annuleren.
let _plVerbondenBijWeg=false;
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible'){ _plVerbondenBijWeg=(typeof connected!=='undefined' && !!connected); return; }
  const was=_plVerbondenBijWeg; _plVerbondenBijWeg=false;
  try{
    if(!was) return;
    if(localStorage.getItem('pl_autoconn')!=='1') return;
    if(demoMode||window._reconnBusy) return;
    if(!getSPP()) return;
    window._reconnBusy=true;
    log('App weer actief — verbinding controleren...','info');
    setTimeout(async()=>{
      try{
        // Android sluit de SPP-socket vaak STIL op de achtergrond terwijl
        // connected nog true is (bv. bij overschakelen naar Outlook). Dan denkt
        // de app onterecht dat hij nog verbonden is. Daarom eerst echt verifiëren.
        if(connected && window._sppConn){
          let alive=false;
          try{
            const c=await window._sppConn.spp.isConnected({address:window._sppConn.address});
            alive=(c?.isConnected!==false&&c?.connected!==false&&c!==false);
          }catch(e){ alive=false; }
          if(!alive){
            log('Verbinding viel weg op de achtergrond — herverbinden...','warn');
            connected=false; setConn(false);
          }
        }
        if(connected) return;
        const ga=()=>{ if(!connected) return connectSerial({ hervat: 'terugkeer naar de app' }); };
        if(window.PLStrook && typeof PLStrook.aftellen==='function'){
          try{ PLStrook.aftellen(ga); return; }
          catch(e){ console.warn('Aftellen niet gestart — meteen herverbinden:', e); }
        }
        await ga();
      }
      finally{ window._reconnBusy=false; }
    },800);
  }catch(e){ window._reconnBusy=false; }
});
// ── einde terugkeer ──
