// ══════════════════════════════════════════════════════════════════
// pidlane-kwaliteit.js
// Datakwaliteit: is deze meetwaarde te vertrouwen. assessPidQuality()
// geeft per sensor 'ok' / 'twijfel' / 'onzin' / 'nodata',
// buildQualityReport() maakt daar het DATAKWALITEIT-blok voor de AI van,
// _qualityBlokFor() doet dat voor een losse PID-lijst, en
// RAPPORT_DISCLAIMER + _withDisclaimer() zetten de vaste waarschuwing
// onder elk rapport.
//
// Afgesplitst uit pidlane-auth.js (ronde 8, 01-08-2026). Ronde 7 haalde
// de gate uit auth, dit is het cluster dat toen achterbleef. Gedragsneutrale
// verplaatsing: het blok hieronder is byte-identiek aan wat er stond.
// Classic script: geen module, geen IIFE — globals blijven globaal.
//
// Let op het verschil met de gate: de gate LEEST _pidHealth, dit cluster
// levert het oordeel waarmee _pidHealth gevuld wordt (initialHealthScan()
// in pidlane-rijsituatie.js). Vandaar een eigen module en niet bij de gate.
//
// Laadt direct NA pidlane-pidgate.js: dit gebruikt getPidDef() daaruit en
// pidHist/pidVals uit auth. Niets hier draait bij het laden, dus de volgorde
// telt alleen voor de leesbaarheid — maar hou hem zo.
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// PLAUSIBILITEITSCHECK — vóór elke AI-analyse / conclusie.
// Doel: voorkomen dat een meetfout, dode sensor of verkeerde drempel als
// "defect" wordt gerapporteerd → een klant niet onnodig op kosten jagen.
// Geeft per opvallende sensor een oordeel:
//   'ok'      → betrouwbaar gemeten, mag in de diagnose
//   'onzin'   → fysiek onmogelijk (parse-/schaalfout) → UITSLUITEN
//   'twijfel' → mogelijk meetfout/sensorprobleem → MÉT waarschuwing
// ══════════════════════════════════════════════════════════════════
function assessPidQuality(pid, val, scanMode=false){
  // scanMode=true: wordt aangeroepen vanuit initialHealthScan (2 reads).
  // In scanMode alleen harde onmogelijkheden eruit; "te weinig metingen" en
  // "platte sensor" zijn pas relevant na langere monitoring.
  const d=getPidDef(pid);
  const hist=(typeof pidHist!=='undefined'&&pidHist[pid])?pidHist[pid]:[];
  const n=hist.length;
  const name=(d&&d.name)||pid;
  const unit=(d&&d.unit)||'';

  // 1. HARD ONMOGELIJK → onzin (parse-/schaalfout of dode lijn)
  const lim=PID_HARD_LIMITS[pid];
  if(val===null||val===undefined||Number.isNaN(val))
    return {status:'onzin', reden:'geen geldige meetwaarde', name, val, unit};
  if(lim && (val<lim.min || val>lim.max))
    return {status:'onzin', reden:`waarde ${fv(val)} ${unit} buiten fysiek mogelijk bereik (${lim.min}–${lim.max})`, name, val, unit};
  // Generieke def-grenzen als fysieke check (ruim, alleen echt onmogelijke eruit)
  if(d && typeof d.min==='number' && typeof d.max==='number'){
    const marge=(d.max-d.min)*0.5;
    if(val < d.min-marge || val > d.max+marge)
      return {status:'onzin', reden:`waarde ${fv(val)} ${unit} ver buiten sensorbereik`, name, val, unit};
  }

  // In scanMode: alleen harde onmogelijkheden + dummy-waarden detecteren
  if(scanMode){
    // Dummy-detectie: als de waarde exact het minimum van de definitie is,
    // is dat een sterk signaal van een niet-aanwezige sensor die toch antwoordt.
    // Typisch: turbo-temp = -40°C (0x00), AdBlue = 0, NOx = 0, DPF-druk = 0.
    if(d && typeof d.min==='number' && val===d.min){
      // Extra check: is het min ook een "verdacht" getal (typisch default)?
      const verdacht=[-40,0,0.00].includes(d.min);
      // Alleen voor sensor-categorieën die niet standaard 0 kunnen zijn
      const sensorCat=['Temp','Emissie'].includes(d.cat||'');
      // …behalve waar nul juist het GEZONDE antwoord is (#78, 02-09-2026).
      // De MIL-familie zit in categorie Emissie met min 0, dus die viel hier
      // altijd binnen: een auto zonder storing meldt 0101=0 en 0121=0, en de
      // check las dat als "sensor waarschijnlijk niet aanwezig". Gevolg: de
      // PID-gate grijsde ze een sessie lang uit, en het oordeel ging mee het
      // voertuigprofiel in. De lijst staat in pidlane-data.js, zodat blok 14
      // van de testrun (MAG_STIL) en deze regel hetzelfde weten.
      const nulIsGoed=!!((window.PID_NUL_NORMAAL||{})[pid]);
      if(verdacht && sensorCat && !nulIsGoed){
        return {status:'nodata', reden:`waarde gelijk aan sensor-minimum (${d.min} ${unit}) — waarschijnlijk niet aanwezig`, name, val, unit};
      }
    }
    return {status:'ok', name, val, unit};
  }

  // 2. PLATTE / BEVROREN SENSOR → twijfel (alleen bij voldoende history)
  if(n>=8){
    const recent=hist.slice(-Math.min(n,10)).map(h=>typeof h==='object'?h.v:h);
    const spread=Math.max(...recent)-Math.min(...recent);
    const dynamisch=['0C','0D','04','11','0B','10','06','07','13','14','24','34'].includes(pid.slice(2).toUpperCase());
    if(spread===0 && dynamisch)
      return {status:'twijfel', reden:'sensor staat exact vast (0 variatie) — mogelijk dode sensor of verbindingsfout, niet per se een motordefect', name, val, unit};
    if(dynamisch && Math.abs(val)<0.01 && spread<0.01)
      return {status:'twijfel', reden:'sensor leest ~0 zonder beweging — controleer sensor/bedrading', name, val, unit};
  }

  // 3. TE WEINIG METINGEN → twijfel (alleen bij live monitoring, niet bij scan)
  if(n>0 && n<3)
    return {status:'twijfel', reden:`slechts ${n} meting(en) — te weinig voor een betrouwbare conclusie`, name, val, unit};

  // 4. NET OVER EEN (DOOR ONS INGESTELDE) DREMPEL → twijfel
  if(d && (typeof d.dH==='number' || typeof d.dL==='number')){
    const over = (typeof d.dH==='number' && val>=d.dH && val < d.dH*1.05);
    const onder = (typeof d.dL==='number' && val<=d.dL && val > d.dL*0.95);
    if(over||onder)
      return {status:'twijfel', reden:'waarde net over de waarschuwingsgrens — kan binnen meetonzekerheid vallen', name, val, unit};
  }

  return {status:'ok', name, val, unit};
}

// Bouwt een betrouwbaarheidsrapport over een set sensoren (pid→val map of array).
// Retourneert {betrouwbaar[], twijfel[], onzin[], promptBlok, heeftTwijfel}.
function buildQualityReport(pidValPairs){
  const betrouwbaar=[], twijfel=[], onzin=[];
  pidValPairs.forEach(([pid,val])=>{
    const q=assessPidQuality(pid,val);
    if(q.status==='onzin') onzin.push(q);
    else if(q.status==='twijfel') twijfel.push(q);
    else betrouwbaar.push(q);
  });
  let promptBlok='\n\nDATAKWALITEIT (verplicht meenemen vóór je een diagnose stelt):';
  if(onzin.length){
    promptBlok+='\nUITGESLOTEN (fysiek onmogelijke waarden — NIET als defect rapporteren, dit is een meet-/parsefout):';
    onzin.forEach(q=>promptBlok+=`\n- ${q.name}: ${fv(q.val)} ${q.unit} (${q.reden})`);
  }
  if(twijfel.length){
    promptBlok+='\nONZEKER (mogelijk meetfout of sensorprobleem — adviseer EERST de sensor/meting te controleren, NIET meteen een dure reparatie):';
    twijfel.forEach(q=>promptBlok+=`\n- ${q.name}: ${fv(q.val)} ${q.unit} (${q.reden})`);
  }
  if(!onzin.length && !twijfel.length){
    promptBlok+='\nAlle opvallende sensoren zijn betrouwbaar gemeten (voldoende samples, binnen fysiek bereik).';
  }
  promptBlok+='\nREGEL: jaag de klant nooit op kosten door een waarschijnlijke meetfout als defect te presenteren. Bij twijfel: adviseer verifiëren/hermeten.';
  return {betrouwbaar, twijfel, onzin, promptBlok, heeftTwijfel:(twijfel.length>0||onzin.length>0)};
}

// Kwaliteitsblok voor een losse PID-lijst (2026-07-15). Meerdere AI-paden
// (Snelle analyse, Datalog, Diepe storings-check, Onderhoud/EV/Lange rit)
// stuurden hun sensordata ZONDER het DATAKWALITEIT-blok mee — alleen
// Totaalcheck/Brandstof/AI-monteur/Rit hadden het. Deze helper geeft elk
// pad hetzelfde blok over precies de PIDs die dat pad zelf al selecteerde
// (selectie blijft ongewijzigd; alleen de kwaliteitscontext komt erbij).
function _qualityBlokFor(pids){
  try{
    const pairs=(pids||[])
      .filter(p=>typeof pidVals!=='undefined' && pidVals[p]!==undefined && pidVals[p]!==null)
      .map(p=>[p,pidVals[p]]);
    if(!pairs.length) return '';
    return buildQualityReport(pairs).promptBlok;
  }catch(e){ return ''; }
}

// Standaard disclaimer onderaan elk rapport
const RAPPORT_DISCLAIMER='Let op: Deze analyse is gebaseerd op live OBD2-sensordata. Sensorwaarden kunnen afwijken door meetfouten, sensorslijtage of verbindingsproblemen. Laat een afwijking altijd door een monteur verifiëren vóór reparatie — voorkom onnodige kosten door een mogelijke meetfout.';
// Garandeert de disclaimer op ELK rapport (2026-07-15). Voorheen stond hij
// alleen in 2 van de ~10 rapport-prompts (Totaalcheck en Rit) en dan nog
// afhankelijk van of het model de zin netjes echode. Nu centraal toegevoegd
// bij deel/PDF/weergave; dubbel plakken wordt voorkomen via de vaste
// kernzin als herkenning.
function _withDisclaimer(t){
  const s=String(t||'');
  if(!s.trim()) return s;
  if(/mogelijke meetfout/i.test(s)) return s;   // zit er al in (prompt-echo)
  return s+'\n\n'+RAPPORT_DISCLAIMER;
}
