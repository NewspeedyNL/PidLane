/* pidlane-koopcheck.js — uitgelicht uit index.html (build 2026-07-19, splitronde 2).
   Laadt als <script src> op exact de oorspronkelijke positie in de
   documentvolgorde; top-level declaraties zijn in klassieke scripts
   globaal over blokgrenzen heen, dus alle bestaande aanroepen blijven
   ongewijzigd werken. Inhoud: koopcheck-module incl. RDW-datavalidatie, onderhoud plannen, EV/hybride-check, lange-rit-voorbereiding en airco/winter-check. */
// ══════════════════════════════════════════════════════
// KOOPCHECK MODULE — v1.0  //  Datum: 2026-06-13
// RDW lookup · Onderhoudcheck · AI prijsschatting · Scan log
// ══════════════════════════════════════════════════════

// ── Scan Log (lokaal, per sessie) ──────────────────────
let _scanLog = [];
function scanLogAdd(entry){
  _scanLog.push({ ts: new Date().toISOString(), ...entry });
  try { localStorage.setItem('pl_scanlog', JSON.stringify(_scanLog.slice(-200))); } catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
}
function downloadScanLog(){
  try { const saved = localStorage.getItem('pl_scanlog'); if(saved) _scanLog = JSON.parse(saved); } catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
  if(!_scanLog.length){ alert('Nog geen scan log beschikbaar.'); return; }
  const lines = [
    `PidLane Scan Log — Gegenereerd: ${new Date().toLocaleString('nl')}`,
    '='.repeat(60),
    ...(_scanLog.map(e => {
      const ts = e.ts || '';
      const type = (e.type||'info').toUpperCase().padEnd(8);
      const msg = e.msg || JSON.stringify(e);
      return `[${ts}] [${type}] ${msg}`;
    }))
  ];
  download(`pidlane-scanlog-${new Date().toISOString().slice(0,10)}.txt`, lines.join('\n'));
}

// ── TESTER-CONSENT ──────────────────────────────────────────────
// De "🧪 Tester-modus"-knop + consent-vinkjes zijn verwijderd: het Veldlab
// legt elke echte sessie automatisch vast en admins geven impliciet consent.
// Deze helper blijft omdat de crash-bestendige live-log erop leunt.
function hasTesterConsent(){
  // Admins zijn de bouwer/tester zelf → impliciet consent, geen vinkje nodig.
  if(isAdmin()) return true;
  try { return localStorage.getItem('pl_tester_consent') === '1'; } catch(e){ return false; }
}

// ── LIVE-LOG ENGINE (crash-bestendig) ──────────────────────
// Schrijft logs continu naar schijf zodat ze bewaard blijven als de app
// crasht. Native (APK): Capacitor Filesystem (append, CACHE). Desktop-
// browser: File System Access API als beschikbaar. Universele fallback:
// localStorage-spiegel. Geactiveerd via tester-consent + extra logfunctie.
const _liveLog = { active:false, dir:'DATA', path:null, buffer:[], timer:null, handle:null, mode:null, _flushing:false };

function liveLogWrite(line){
  if(!_liveLog.active) return;
  _liveLog.buffer.push(line);
  if(_liveLog.buffer.length>8000) _liveLog.buffer.splice(0,_liveLog.buffer.length-8000);
}

async function liveLogFlush(){
  if(!_liveLog.active || _liveLog._flushing || !_liveLog.buffer.length) return;
  _liveLog._flushing=true;
  const lines=_liveLog.buffer.splice(0,_liveLog.buffer.length);
  const chunk=lines.join('\n')+'\n';
  try{
    if(_liveLog.mode==='native'){
      const FS=window.Capacitor?.Plugins?.Filesystem;
      await FS.appendFile({path:_liveLog.path,data:chunk,directory:_liveLog.dir,encoding:'utf8'});
    } else if(_liveLog.mode==='fsapi' && _liveLog.handle){
      const file=await _liveLog.handle.getFile();
      const w=await _liveLog.handle.createWritable({keepExistingData:true});
      await w.seek(file.size);
      await w.write(chunk);
      await w.close();
    } else { // localstorage-spiegel
      let cur=''; try{ cur=localStorage.getItem('pl_livelog_mirror')||''; }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
      cur+=chunk;
      if(cur.length>500000) cur=cur.slice(cur.length-500000);
      try{ localStorage.setItem('pl_livelog_mirror',cur); }
      catch(e){ try{ localStorage.setItem('pl_livelog_mirror',chunk.slice(-200000)); }catch(_){ /* stil: opslag kan vol of geblokkeerd zijn */ } }
    }
  }catch(e){
    // Mislukt — regels terugzetten voor volgende poging (begrensd)
    _liveLog.buffer.unshift(...lines);
    if(_liveLog.buffer.length>9000) _liveLog.buffer.splice(0,_liveLog.buffer.length-9000);
  }finally{ _liveLog._flushing=false; }
}

async function liveLogStart(opts={}){
  if(_liveLog.active) return true;
  const C=window.Capacitor, FS=C?.Plugins?.Filesystem;
  const native=!!(C?.isNativePlatform?.() && FS);
  let resuming = (localStorage.getItem('pl_livelog')==='1') && !!localStorage.getItem('pl_livelog_path');
  const storedMode = localStorage.getItem('pl_livelog_mode');
  // fsapi-handle overleeft een herlaad niet → niet hervatten, vers beginnen
  if(resuming && storedMode==='fsapi') resuming=false;
  let path = resuming ? localStorage.getItem('pl_livelog_path') : null;
  if(!path){
    const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    path=`pidlane-livelog-${stamp}.txt`;
  }
  let mode = native ? 'native' : 'localstorage';
  const header=`PidLane — Live-log\nGestart: ${new Date().toLocaleString('nl')}\nOmgeving: ${native?'native APK':'browser'}\n${'='.repeat(50)}\n`;
  // Desktop-browser: echte "opslaan als"-dialoog (alleen bij vers starten)
  if(!native && !resuming && typeof window.showSaveFilePicker==='function' && !opts.silent){
    try{
      const h=await window.showSaveFilePicker({suggestedName:path,types:[{description:'Logbestand',accept:{'text/plain':['.txt']}}]});
      const w=await h.createWritable(); await w.write(header); await w.close();
      _liveLog.handle=h; mode='fsapi';
    }catch(e){ if(e&&e.name==='AbortError') return false; }
  }
  _liveLog.mode=mode; _liveLog.dir='DATA'; _liveLog.path=path;
  try{
    if(mode==='native' && !resuming){
      await FS.writeFile({path,data:header,directory:'DATA',encoding:'utf8',recursive:true});
    } else if(mode==='localstorage' && !resuming){
      try{ localStorage.setItem('pl_livelog_mirror',header); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
    }
  }catch(e){ try{ log('Live-log aanmaken mislukt: '+(e.message||e),'warn'); }catch(_){ /* stil: melding mag nooit de stroom breken */ } }
  _liveLog.active=true;
  try{
    localStorage.setItem('pl_livelog','1');
    localStorage.setItem('pl_livelog_path',path);
    localStorage.setItem('pl_livelog_mode',mode);
  }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  if(!_liveLog.timer) _liveLog.timer=setInterval(()=>{ liveLogFlush(); },4000);
  liveLogWrite('--- live-log '+(resuming?'hervat':'gestart')+' @ '+new Date().toTimeString().slice(0,8)+' ---');
  return true;
}

async function liveLogStop(o={}){
  await liveLogFlush();
  if(_liveLog.timer){ clearInterval(_liveLog.timer); _liveLog.timer=null; }
  _liveLog.active=false;
  try{ localStorage.setItem('pl_livelog','0'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ } // sessie afgesloten, pad bewaard voor delen
  if(o.share) await liveLogShare();
}

async function liveLogShare(){
  await liveLogFlush();
  const mode=_liveLog.mode||localStorage.getItem('pl_livelog_mode');
  const dir=_liveLog.dir||'DATA';
  const path=_liveLog.path||localStorage.getItem('pl_livelog_path')||'pidlane-livelog.txt';
  if(mode==='native'){
    const FS=window.Capacitor?.Plugins?.Filesystem;
    if(FS){
      try{
        // Lees het persistente DATA-bestand en deel via de bewezen route
        // (nativeShareFile schrijft een CACHE-kopie en opent het deelmenu —
        //  DATA is app-privé en niet rechtstreeks deelbaar op Android 7+).
        const r=await FS.readFile({path,directory:dir,encoding:'utf8'});
        const txt=(r&&typeof r.data==='string')?r.data:'';
        const blob=new Blob([txt],{type:'text/plain'});
        if(await nativeShareFile(blob,path)) return true;
        download(path,txt); return true;
      }catch(e){ try{ log('Live-log delen mislukt: '+(e.message||e),'warn'); }catch(_){ /* stil: melding mag nooit de stroom breken */ } }
    }
  }
  // Fallback: spiegel of gebundelde export
  let txt=''; try{ txt=localStorage.getItem('pl_livelog_mirror')||''; }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
  if(txt){ try{ download(path,txt); return true; }catch(e){ /* stil: valt door naar de bredere export hieronder */ } }
  try{ exportAllLogs(); }catch(e){ log('Live-log delen mislukt, ook de brede export lukte niet: '+(e.message||e),'err'); }
  return true;
}

// Crash-herstelmelding bij opstarten: was er een live-log van een vorige
// (niet net schoon afgesloten) sessie? Meld het één keer per app-start,
// niet-blokkerend. pl_livelog blijft '1' bij een crash; logout zet het op '0'.
async function liveLogRecoveryCheck(){
  try{
    if(localStorage.getItem('pl_livelog')!=='1') return;          // schoon afgesloten → geen melding
    if(sessionStorage.getItem('pl_livelog_seen')==='1') return;   // al gemeld in deze WebView-sessie
    const path=localStorage.getItem('pl_livelog_path');
    const mode=localStorage.getItem('pl_livelog_mode');
    if(!path) return;
    let bytes=0;
    if(mode==='native'){
      const FS=window.Capacitor?.Plugins?.Filesystem;
      if(FS){ try{ const st=await FS.stat({path,directory:'DATA'}); bytes=st?.size||0; }catch(e){ return; } }
    } else {
      try{ bytes=(localStorage.getItem('pl_livelog_mirror')||'').length; }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
    }
    if(bytes<200) return; // alleen header → niets zinnigs om te herstellen
    try{ sessionStorage.setItem('pl_livelog_seen','1'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
    const kb=Math.max(1,Math.round(bytes/1024));
    try{ log(`🛠 Live-log van vorige sessie hervat (${kb} kB bewaard) — tik 📤 Deel live-log om te exporteren`,'ok'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
    try{ showToast?.(`🛠 Vorige live-log bewaard (${kb} kB) — deelbaar via 📤`,5000); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  }catch(e){ console.warn('Live-log herstelcheck bij opstarten mislukt — niet-blokkerend, geen crash-melding getoond', e); }
}

// Prompt + start: zodra tester-consent én extra logfunctie aan staan
async function maybeStartLiveLog(){
  try{
    if(_liveLog.active) return;
    const consent = (typeof hasTesterConsent==='function') ? hasTesterConsent() : (localStorage.getItem('pl_tester_consent')==='1');
    const extra = !!document.getElementById('adminLogExport')?.checked;
    if(!(consent && extra)) return;
    const ok = window.confirm('Live-logbestand aanmaken?\n\nPidLane schrijft vanaf nu alle logs continu naar een bestand, zodat ze bewaard blijven — óók als de app crasht. Je kunt het later delen of exporteren.');
    if(!ok) return;
    const started=await liveLogStart();
    if(started){ try{ log('🛠 Live-log actief — '+_liveLog.path+' ('+_liveLog.mode+')','ok'); }catch(e){ /* stil: melding mag nooit de stroom breken */ } try{ showToast?.('🛠 Live-log actief'); }catch(e){ /* stil: melding mag nooit de stroom breken */ } }
  }catch(e){ console.warn('Live-log niet gestart na bevestiging', e); }
}

// Periodieke veiligheids-flush bij backgrounden/sluiten
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'){ liveLogFlush(); persistAppState(); } });
window.addEventListener('pagehide',()=>{ liveLogFlush(); persistAppState(); });

// ── GEBUNDELDE LOG-EXPORT (BT + scan + app) ────────────────
// Handmatig, op verzoek van de tester. Eén bestand met alles erin.
function exportAllLogs(){
  const v = vehicleInfo || {};
  const now = new Date();
  // Herstel uit storage indien arrays leeg
  try { const s = localStorage.getItem('pl_scanlog'); if(s && !_scanLog.length) _scanLog = JSON.parse(s); } catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
  let bt = _btLog || [];
  try { const sb = sessionStorage.getItem('pl_btlog'); if(sb && !bt.length) bt = JSON.parse(sb); } catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }

  const sep = '='.repeat(60);
  const lines = [
    'PidLane — Gebundelde Logexport',
    `Gegenereerd: ${now.toLocaleString('nl')}`,
    `Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.brandstof?'('+v.brandstof+')':''}`.trim(),
    `VIN: ${v.vin||'-'}  |  PIDs beschikbaar: ${(typeof supportedPIDs!=='undefined')?supportedPIDs.size:'?'}`,
    `Tester-toestemming: ${hasTesterConsent()?'JA':'nee'}`,
    sep, '',
    '### 1. BLUETOOTH-DIAGNOSTIEK ###',
    ...(bt.length ? bt.map(e=>`[${e.ts||''}] [${(e.type||'info').toUpperCase()}] ${e.msg||''}`) : ['(geen BT-log)']),
    '', '### 2. APP-LOG ###',
    ...((typeof localLog!=='undefined' && localLog.length) ? localLog.map(l=>`[${l.ts}] [${(l.type||'info').toUpperCase()}] ${l.msg}`) : ['(geen app-log)']),
    '', '### 3. SCAN-LOG (Koopcheck/RDW) ###',
    ...(_scanLog.length ? _scanLog.map(e=>`[${e.ts||''}] [${(e.type||'info').toUpperCase()}] ${e.msg||JSON.stringify(e)}`) : ['(geen scan-log)']),
  ];
  download(`pidlane-alle-logs-${now.toISOString().slice(0,16).replace(/[:T]/g,'-')}.txt`, lines.join('\n'));
  log('📦 Alle logs geëxporteerd','ok');
}

// ── Uitgebreide RDW lookup voor Koopcheck ──────────────
let _koopRdwData = null;
async function koopRdwLookup(){
  const inp = document.getElementById('koopKentInput');
  const st  = document.getElementById('koopRdwStatus');
  const cards = document.getElementById('koopRdwCards');
  const grid  = document.getElementById('koopRdwGrid');
  if(!inp) return;
  const kent = inp.value.replace(/[\s-]/g,'').toUpperCase();
  if(kent.length < 4){ st.textContent = 'Voer een geldig kenteken in (bijv. 01GNR6)'; return; }
  st.textContent = '⏳ RDW opzoeken...';
  cards.style.display = 'none';
  const btn = document.getElementById('koopRdwBtn');
  btn.disabled = true;

  try {
    // Hoofddata
    const r1 = await fetch(PROXY_URL+'/proxy?url='+encodeURIComponent(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${encodeURIComponent(kent)}`),{headers:{'X-App-Token':APP_TOKEN}});
    if(!r1.ok){ st.textContent='⚠️ RDW antwoordde niet goed — probeer het zo opnieuw'; btn.disabled=false; return; }
    const d1 = await r1.json();
    if(!d1||!d1.length){ st.textContent = `❌ Kenteken "${kent}" niet gevonden bij RDW — controleer op een typefout`; btn.disabled=false; return; }
    const v = d1[0];

    // Valideer: onbetrouwbare/rotzooi-velden eruit met reden
    const val = validateRdwVehicle(v);
    const f = val.velden;
    const _jaar = f.year || '';

    // (Verwijderd: extra fetch naar vkij-7mwc/Keuringen. Het resultaat werd
    //  in _koopRdwData._apk gezet maar nérgens gelezen — de getoonde APK-
    //  vervaldatum komt uit vervaldatum_apk in de hoofddataset. Scheelt één
    //  proxy-call per kentekenopzoek.)

    // Recall: gebruik de betrouwbare indicator uit de hoofddata zelf
    // (de oude merk-naam-match gaf false positives op élke auto van dat merk).
    const recallActief = String(v.openstaande_terugroepactie_indicator||'').toLowerCase()==='ja'
      || v.openstaande_terugroepactie_indicator===true;

    // Tellerstandoordeel (fraudecheck) — alleen erkende RDW-waarden
    const tellerOordeel = f.tellerstandoordeel || null;

    _koopRdwData = { ...v, _recall: recallActief, _teller: tellerOordeel, _kent: kent, _val: val };
    localStorage.setItem('pl_kenteken', kent);
    // Vlag → detail: PLRecall vult de banner met wélke actie en welk risico.
    try{ window.dispatchEvent(new CustomEvent('pl:kenteken-geladen',{detail:{kenteken:kent}})); }catch(e){ /* stil: element kan al weg zijn */ }

    // Voer ook vehicleInfo bij voor AI — alleen gevalideerde velden
    if(f.merk)      vehicleInfo.merk  = f.merk;
    if(f.model!==undefined) vehicleInfo.model = f.model||'';
    if(f.year)      vehicleInfo.year  = f.year;
    if(f.brandstof) vehicleInfo.brandstof = f.brandstof;

    // Datums (gevalideerd weergeven)
    const datTenaam   = _rdwPlausibleDate(v.datum_tenaamstelling) ? formatRdwDate(v.datum_tenaamstelling) : '?';
    const datEerste   = _rdwPlausibleDate(v.datum_eerste_toelating) ? formatRdwDate(v.datum_eerste_toelating) : '?';
    const datEersteNL = _rdwPlausibleDate(v.datum_eerste_tenaamstelling_in_nederland) ? formatRdwDate(v.datum_eerste_tenaamstelling_in_nederland) : '?';
    const apkVerval   = f.vervaldatum_apk ? formatRdwDate(f.vervaldatum_apk) : '?';
    const maandenTot  = f.vervaldatum_apk ? maandenTotAPK(f.vervaldatum_apk) : null;
    const bpm = (v.bruto_bpm && !isNaN(parseInt(v.bruto_bpm))) ? `€ ${parseInt(v.bruto_bpm).toLocaleString('nl')}` : '?';
    const import_auto = _rdwPlausibleDate(v.datum_eerste_tenaamstelling_in_nederland) && _jaar &&
      String(v.datum_eerste_tenaamstelling_in_nederland).replace(/\D/g,'').slice(0,4) !== _jaar;

    // APK kleur
    let apkKleur = '#6b7280';
    if(maandenTot !== null){
      if(maandenTot < 0) apkKleur = '#ef4444';
      else if(maandenTot < 3) apkKleur = '#f97316';
      else if(maandenTot < 6) apkKleur = '#eab308';
      else apkKleur = '#22c55e';
    }

    // Recall banner
    document.getElementById('koopRecallBanner').style.display = recallActief ? 'block' : 'none';

    // Tellerstand-kleur
    const tellerOnlogisch = tellerOordeel && /onlogisch/i.test(tellerOordeel);
    const tellerKleur = tellerOordeel ? (tellerOnlogisch ? '#ef4444' : '#22c55e') : '#6b7280';

    // Render kaarten — alleen plausibele waarden, anms een nette '?' / weglaten
    const kaarten = [
      { label:'Merk & Model',   val:`${f.merk||'?'} ${f.model||''}`.trim(), ico:'🚗' },
      { label:'Bouwjaar',       val:_jaar||'?', ico:'📅' },
      { label:'Brandstof',      val:(f.brandstof?cap(f.brandstof):'?'), ico:'⛽' },
      { label:'Eerste toelating', val:datEerste, ico:'🏭' },
      { label:'Eerste NL',      val:datEersteNL + (import_auto ? ' ⚠️ Import' : ''), ico:'🇳🇱' },
      { label:'Huidige eigenaar sinds', val:datTenaam, ico:'👤' },
      { label:'APK geldig tot', val:`${apkVerval}`, ico:'🔧', kleur:apkKleur },
      { label:'Tellerstandoordeel', val: tellerOordeel ? (tellerOnlogisch?'⚠️ '+tellerOordeel:'✅ '+tellerOordeel) : '?', ico:'⏱️', kleur:tellerKleur },
      { label:'Kleur',          val:`${f.kleur||'?'}${_rdwPlausibleName(v.tweede_kleur)?'+'+v.tweede_kleur:''}`, ico:'🎨' },
      { label:'Cilinderinhoud', val:f.cilinderinhoud ? f.cilinderinhoud+' cc' : '?', ico:'⚙️' },
      { label:'Bruto BPM',      val:bpm, ico:'💶' },
      { label:'Recall RDW',     val:recallActief ? '⚠️ JA' : '✅ Geen', ico:'🔔', kleur:recallActief?'#ef4444':'#22c55e' },
    ];
    grid.innerHTML = kaarten.map(k=>`
      <div style="background:var(--sur2);border:1px solid var(--bd);border-radius:6px;padding:7px 9px">
        <div style="font-size:11px;color:var(--tx3);margin-bottom:2px">${k.ico} ${k.label}</div>
        <div style="font-size:12px;font-weight:700;color:${k.kleur||'var(--tx)'}\">${k.val||'?'}</div>
      </div>`).join('');

    // Melding over door RDW onbetrouwbaar geleverde, weggelaten velden
    if(val.weggelaten.length){
      grid.innerHTML += `
        <div style="grid-column:1/-1;background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.4);border-radius:6px;padding:7px 9px;margin-top:4px">
          <div style="font-size:12px;font-weight:700;color:#eab308;margin-bottom:3px">⚠️ ${val.weggelaten.length} veld(en) weggelaten — RDW-data onbetrouwbaar</div>
          <div style="font-size:11px;color:var(--tx3);line-height:1.5">${val.weggelaten.map(w=>`• <b>${w.label}</b>: ${w.reden}`).join('<br>')}</div>
        </div>`;
    }

    cards.style.display = 'block';
    const naam=`${f.merk||'?'} ${f.model||''}`.trim();
    st.textContent = `✅ ${naam}${_jaar?' ('+_jaar+')':''}${f.kleur?' — '+f.kleur:''}`
      + (val.weggelaten.length?`  ·  ⚠️ ${val.weggelaten.length} veld(en) weggelaten`:'');

    // Log
    scanLogAdd({ type:'rdw', msg:`Kent:${kent} Merk:${f.merk||'?'} Model:${f.model||'?'} Jaar:${_jaar||'?'} APK:${apkVerval} Teller:${tellerOordeel||'?'} Recall:${recallActief} Import:${import_auto} Weggelaten:${val.weggelaten.length}` });
    log(`🔍 RDW Koopcheck: ${naam} — APK tot ${apkVerval}${tellerOordeel?' · teller '+tellerOordeel:''}${recallActief?' · ⚠️ RECALL':''}`, 'ok');

  } catch(e) {
    st.textContent = '⚠️ RDW tijdelijk niet bereikbaar — controleer je internet en probeer opnieuw';
  }
  btn.disabled = false;
}

// ══════════════════════════════════════════════════════
// RDW-DATAVALIDATIE — rotzooi/onzin-data herkennen en weglaten
// RDW open data bevat handmatig ingevoerde velden van wisselende
// kwaliteit (RDW erkent dit zelf). We tonen liever niets + reden,
// dan een merk "XKJ4" of een bouwjaar "0000".
// ══════════════════════════════════════════════════════

// Geldige merknaam/handelsbenaming? Weert random letterbrij en codes.
function _rdwPlausibleName(s){
  const t=String(s||'').trim();
  if(!t) return false;
  if(t.length<2) return false;                       // te kort
  const letters=(t.match(/[A-Za-z]/g)||[]).length;
  if(letters<1) return false;                        // moet minstens 1 letter hebben
  // Modelnamen als "320i","A3","Q5" zijn legitiem (cijfer-zwaar), dus we eisen
  // niet dat het overwegend letters is. Wel weren we tekenrommel.
  const symbols=(t.match(/[^A-Za-z0-9\s.\-]/g)||[]).length;
  const nonSpace=t.replace(/\s/g,'').length;
  if(nonSpace>0 && symbols/nonSpace > 0.3) return false; // >30% rare tekens = rommel
  // Klinker aanwezig? Langere echte namen (>4) hebben er vrijwel altijd een.
  // Korte tokens (BMW, MG, A3, CX-5) zijn legitiem en mogen zonder klinker door —
  // modelnamen bevatten juist vaak cijfers, dus die laten we staan.
  if(t.length>4 && !/[aeiouyAEIOUY]/.test(t) && !/[0-9]/.test(t)) return false;
  // Vijf+ identieke tekens op rij = toetsenbordrommel
  if(/(.)\1{4,}/.test(t)) return false;
  return true;
}

// Geldig bouwjaar? Tussen 1900 en volgend jaar.
function _rdwPlausibleYear(y){
  const n=parseInt(String(y||'').replace(/\D/g,'').slice(0,4),10);
  if(isNaN(n)) return false;
  return n>=1900 && n<=(new Date().getFullYear()+1);
}

// Geldige RDW-datum (YYYYMMDD)? Plausibele jaar/maand/dag.
function _rdwPlausibleDate(s){
  const c=String(s||'').replace(/\D/g,'').slice(0,8);
  if(c.length<8) return false;
  const y=+c.slice(0,4), m=+c.slice(4,6), d=+c.slice(6,8);
  return y>=1900 && y<=(new Date().getFullYear()+1) && m>=1 && m<=12 && d>=1 && d<=31;
}

// Centrale RDW-validatie. Geeft schone velden + een lijst van weggelaten
// velden met reden, zodat de UI kan tonen WAAROM iets ontbreekt.
function validateRdwVehicle(v){
  const out={ velden:{}, weggelaten:[] };
  const drop=(label,reden)=>out.weggelaten.push({label,reden});

  // Merk
  if(_rdwPlausibleName(v.merk)) out.velden.merk=String(v.merk).trim();
  else if(v.merk) drop('Merk',`RDW gaf "${String(v.merk).trim()}" — geen geldige merknaam`);

  // Handelsbenaming (model)
  if(_rdwPlausibleName(v.handelsbenaming)) out.velden.model=String(v.handelsbenaming).trim();
  else if(v.handelsbenaming) drop('Model',`RDW gaf "${String(v.handelsbenaming).trim()}" — onbetrouwbare modelnaam`);

  // Bouwjaar uit datum_eerste_toelating
  const jaar=String(v.datum_eerste_toelating||'').replace(/\D/g,'').slice(0,4);
  if(_rdwPlausibleYear(jaar)) out.velden.year=jaar;
  else if(v.datum_eerste_toelating) drop('Bouwjaar','ongeldige datum in RDW-registratie');

  // Brandstof zit NIET in deze hoofdtabel (m9d7-ebf2) maar in de aparte
  // dataset 8ys7-d773 — die haalt rdwLookup los op. Hier dus niets valideren
  // (deed voorheen een check op een veld dat nooit bestaat -> brandstof leeg).

  // Kleur
  if(_rdwPlausibleName(v.eerste_kleur)) out.velden.kleur=String(v.eerste_kleur).trim();

  // Cilinderinhoud (numeriek, plausibel 50–10000 cc)
  const cc=parseInt(v.cilinderinhoud,10);
  if(!isNaN(cc)&&cc>=50&&cc<=10000) out.velden.cilinderinhoud=cc;
  else if(v.cilinderinhoud) drop('Cilinderinhoud','onwaarschijnlijke waarde');

  // APK-vervaldatum
  if(_rdwPlausibleDate(v.vervaldatum_apk)) out.velden.vervaldatum_apk=v.vervaldatum_apk;
  else if(v.vervaldatum_apk) drop('APK-datum','ongeldige datum in RDW-registratie');

  // Tellerstandoordeel — alleen de erkende RDW-waarden toelaten
  const to=String(v.tellerstandoordeel||'').trim();
  if(to){
    if(/logisch/i.test(to)) out.velden.tellerstandoordeel=to;  // "Logisch"/"Onlogisch"
    else drop('Tellerstandoordeel','onbekende RDW-status');
  }

  return out;
}

function formatRdwDate(s){
  if(!s||s.length<8) return '?';
  // format: YYYYMMDD
  const clean = String(s).replace(/[^0-9]/g,'').slice(0,8);
  if(clean.length<8) return s;
  return `${clean.slice(6,8)}-${clean.slice(4,6)}-${clean.slice(0,4)}`;
}

function maandenTotAPK(s){
  try {
    const clean = String(s).replace(/[^0-9]/g,'').slice(0,8);
    const d = new Date(clean.slice(0,4)+'-'+clean.slice(4,6)+'-'+clean.slice(6,8));
    const now = new Date();
    return Math.round((d - now) / (1000*60*60*24*30.4));
  } catch(e){ return null; }
}


// ── Onderhoud bij km-stand (AI) ──────────────────────────
function buildOnderhoudPrompt(merk, model, jaar, km, boekje, laagsteBeurt){
  return `Jij bent een senior automonteur. Geef een concreet onderhoudsoordeel.

Voertuig: ${merk} ${model} bouwjaar ${jaar}
Kilometerstand: ${km.toLocaleString('nl')} km
Serviceboekje: ${boekje}
Laatste beurt geregistreerd bij: ${laagsteBeurt ? laagsteBeurt.toLocaleString('nl')+' km' : 'onbekend'}

Geef:
1. Welke onderhoudsintervals voor dit specifieke merk/model normaal zijn bij deze km-stand (distributieriem, vloeistoffen, remmen, bougies, etc.)
2. Of er achterstand is op basis van bovenstaande info
3. Schat de verwachte kosten voor eventuele achterstallig onderhoud in euro's

Antwoord in maximaal 200 woorden, Nederlands, concreet en zonder inleiding. Formaat:
ONDERHOUDSCHECK: [ok/aandacht/achterstand]
VERWACHTE KOSTEN: €[bedrag]
DETAILS: [max 150 woorden]`;
}

// ── AI prijsschatting prompt ──────────────────────────────
function buildInkoopPrompt(merk, model, jaar, km, apkMaanden, boekje, dtcCount, onderhoudKosten, tellerOordeel, recallActief, bandenLabel, proefritData, ink){
  const kanaalLabel = {showroom:'showroom/particulier',handel:'doorverkoop aan handel',export:'export',veiling:'veiling',sloop:'sloop/onderdelen'}[ink.kanaal]||ink.kanaal;
  const proefritBlok = proefritData
    ? `Proefrit (technische meting onder belasting): ${String(proefritData).slice(0,300)}`
    : 'Proefrit: niet uitgevoerd — beoordeling op stationaire meting (momentopname).';
  return `Jij bent een ervaren Nederlandse auto-inkoper bij een dealer/handelaar. Beoordeel of deze inkoop zakelijk verstandig is.

VOERTUIG
Voertuig: ${merk} ${model} bouwjaar ${jaar}
Kilometerstand: ${km.toLocaleString('nl')} km
APK nog geldig: ${apkMaanden !== null ? apkMaanden+' maanden' : 'onbekend'}
Serviceboekje: ${boekje}
Actieve DTC foutcodes: ${dtcCount}
Bandenstaat: ${bandenLabel||'niet gecontroleerd'}
RDW tellerstandoordeel: ${tellerOordeel || 'onbekend'}${tellerOordeel&&/onlogisch/i.test(tellerOordeel)?' (LET OP: mogelijk teruggedraaide km — sterk risicovol)':''}
Openstaande recall: ${recallActief ? 'JA' : 'nee'}${(()=>{try{return window._plRecall&&window.PLRecall?'\n'+PLRecall.naarPromptRegel(window._plRecall):'';}catch(e){return '';}})()}
Import: ${ink.import}
${proefritBlok}

ZAKELIJK
Geboden inkoopprijs: ${ink.inkoopprijs?'€'+ink.inkoopprijs.toLocaleString('nl'):'nog niet bepaald'}
Gewenste verkoopprijs: ${ink.verkoopprijs?'€'+ink.verkoopprijs.toLocaleString('nl'):'onbekend'}
Verkoopkanaal: ${kanaalLabel}
Type: ${ink.btw==='btw'?'BTW-auto':ink.btw==='marge'?'marge-auto':'onbekend'}
${ink.opknapHandmatig?'Door handelaar geschatte opknapkosten: €'+ink.opknapHandmatig.toLocaleString('nl'):'Opknapkosten: laat PidLane schatten op basis van technische staat (achterstallig onderhoud indicatie: €'+(onderhoudKosten||0)+')'}

Houd rekening met: kosten voor reconditioneren/poetsen, APK indien nodig, garantie bij verkoop via showroom, advertentiekosten en een redelijke handelsmarge. Wees realistisch en conservatief — een handelaar moet risico vermijden.

Antwoord in maximaal 170 woorden, Nederlands. Gebruik EXACT dit formaat met deze labels op nieuwe regels:
OPKNAPKOSTEN: €[bedrag] (korte onderbouwing)
VERWACHTE MARGE: €[bedrag] bij de opgegeven verkoopprijs/kanaal
MAX-INKOOP: €[bedrag] (de hoogste prijs die je veilig kunt bieden voor een gezonde marge)
INKOOPADVIES: [doen / scherp onderhandelen / niet doen] in 1 zin
RISICO: [belangrijkste risico's in 1 zin, of "geen bijzonderheden"]
TOELICHTING: [max 80 woorden; noem expliciet of dit op een proefrit of alleen stationair gebaseerd is]`;
}

function buildPrijsPrompt(merk, model, jaar, km, kleur, apkMaanden, boekje, vraagprijs, dtcCount, onderhoudKosten, tellerOordeel, recallActief, bandenLabel, proefritData, mode){
  const proefritBlok = proefritData
    ? `\nProefrit uitgevoerd (technische meting onder belasting): ${String(proefritData).slice(0,400)}`
    : `\nProefrit: NIET uitgevoerd — oordeel is gebaseerd op stationaire meting (momentopname, minder zeker over gedrag onder belasting).`;
  const verkoper = (mode==='verkoop'||mode==='occasion');
  const insteek = verkoper
    ? `Jij bent een Nederlandse automarkt expert. De EIGENAAR wil deze auto verkopen en wil weten wat hij oplevert via verschillende kanalen.`
    : `Jij bent een Nederlandse automarkt expert. Geef een marktwaardeschatting voor een koper.`;
  return `${insteek}

Voertuig: ${merk} ${model} bouwjaar ${jaar}
Kilometerstand: ${km.toLocaleString('nl')} km
Kleur: ${kleur||'onbekend'}
APK nog geldig: ${apkMaanden !== null ? apkMaanden+' maanden' : 'onbekend'}
Serviceboekje: ${boekje}
Actieve DTC foutcodes: ${dtcCount}
Bandenstaat: ${bandenLabel||'niet gecontroleerd'}
RDW tellerstandoordeel: ${tellerOordeel || 'onbekend'}${tellerOordeel&&/onlogisch/i.test(tellerOordeel)?' (LET OP: mogelijk teruggedraaide of onlogische km-historie — sterk waardedrukkend en risicovol)':''}
Openstaande terugroepactie (recall): ${recallActief ? 'JA — nog niet afgehandeld' : 'nee'}
Geschatte achterstallig onderhoud: €${onderhoudKosten||0}${proefritBlok}
${vraagprijs ? (verkoper?'Gewenste verkoopprijs eigenaar: €':'Vraagprijs dealer: €')+parseInt(vraagprijs).toLocaleString('nl') : ''}

${verkoper ? `Geef:
1. Particuliere verkoopprijs (Marktplaats/AutoTrack NL) — wat een privékoper betaalt
2. Inruilwaarde bij een dealer (bij aankoop andere auto)
3. Direct dealerbod / opkoop (snelste verkoop, laagste prijs)
4. Kort advies welk kanaal het beste past (verwerk bandenstaat en proefrit)

Antwoord in maximaal 160 woorden, Nederlands. Formaat:
PARTICULIER: €[min] – €[max]
INRUILWAARDE: €[bedrag]
DEALERBOD: €[bedrag]
ADVIES: [1-2 zinnen kanaalkeuze]
TOELICHTING: [max 80 woorden, noem of dit op proefrit of stationair is gebaseerd]` : `Geef:
1. Geschatte marktwaarde range op Marktplaats/AutoTrack NL
2. Of de vraagprijs reëel is (als opgegeven)
3. Onderhandelruimte advies in euro's (verwerk bandenstaat en proefrit-bevindingen)${tellerOordeel&&/onlogisch/i.test(tellerOordeel)?'\n4. Expliciete waarschuwing over het onlogische tellerstandoordeel':''}

Antwoord in maximaal 150 woorden, Nederlands. Formaat:
MARKTWAARDE: €[min] – €[max]
OORDEEL PRIJS: [te hoog/reëel/koopje] (alleen als vraagprijs opgegeven)
ONDERHANDELEN: [advies in 1 zin]
TOELICHTING: [max 100 woorden, noem expliciet of dit op een proefrit of alleen stationair is gebaseerd]`}`;
}

function buildLeasePrompt(merk, model, jaar, km, apkMaanden, boekje, dtcCount, bandenLabel, proefritData, lease){
  const overKm = (lease.kmMax>0) ? (km - lease.kmMax) : null;
  const kmKost = (overKm!=null && overKm>0 && lease.kmPrijs>0) ? overKm*lease.kmPrijs : 0;
  return `Jij bent een Nederlandse lease-expert. Beoordeel wat de berijder kan verwachten bij het inleveren van een ${lease.type==='private'?'private':'zakelijke'} leaseauto. Wees concreet over mogelijke naheffingen.

Voertuig: ${merk} ${model} bouwjaar ${jaar}
Huidige km-stand: ${km.toLocaleString('nl')} km
Toegestane km (contract): ${lease.kmMax?lease.kmMax.toLocaleString('nl'):'onbekend'}
${overKm!=null?(overKm>0?`Meer-kilometers: ${overKm.toLocaleString('nl')} km${lease.kmPrijs?` x EUR ${lease.kmPrijs} = ca. EUR ${kmKost.toFixed(0)} naheffing`:''}`:`Binnen de kilometergrens (${Math.abs(overKm).toLocaleString('nl')} km marge)`):'Kilometergrens onbekend'}
Inleverdatum: ${lease.datum||'onbekend'}
APK: ${apkMaanden!==null?apkMaanden+' maanden':'onbekend'}
Serviceboekje: ${boekje}
Actieve DTC foutcodes: ${dtcCount}
Bandenstaat: ${bandenLabel||'niet gecontroleerd'}${proefritData?`\nProefrit: ${String(proefritData).slice(0,300)}`:''}

Belangrijk innameprotocol-kader (NL lease): gebruikssporen door normaal gebruik zijn meestal acceptabel (kleine krasjes <10cm, steenslag, lakschade <24mm, max 2 beschadigingen per plaatdeel). NIET acceptabel en doorgaans verhaalbaar: diepe krassen/deuken met lakschade, roest, scheuren in ruiten, gebroken koplampglas, bandenprofiel onder de norm, ontbrekende sleutels/laadpas/documenten, niet-gemelde schade (vaak EUR 300+ eigen risico per schade).

Geef in maximaal 170 woorden, Nederlands. Formaat:
KM-STATUS: [binnen grens / overschrijding + geschatte naheffing]
TECHNISCH: [staat o.b.v. sensoren/foutcodes, 1-2 zinnen]
AANDACHTSPUNTEN: [waar de inspecteur op let - banden, lak, ruiten, accessoires]
KOSTENRISICO: [inschatting mogelijke naheffing, of "beperkt"]
ADVIES: [concrete stappen voor inlevering: schade melden, kleine reparatie zelf doen, auto laten reinigen]`;
}

// ── Support-mail met diagnostische gegevens ───────────────
// withDiag=true vult app-versie, gebruiker, toestel+Android, verbinding en
// de laatste logregels vooraf in, zodat support meteen context heeft.
function mailSupport(withDiag){
  const to = 'support@pidlane.nl';
  const subject = 'PidLane support';
  let body = '';
  if (withDiag){
    const ver = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '?';
    const plat = window.Capacitor?.getPlatform?.() || 'web';
    const am = navigator.userAgent.match(/Android\s+([\d.]+)/);
    const android = am ? ('Android ' + am[1]) : plat;
    const transport = window._sppConn ? 'SPP' : window._bleConn ? 'BLE' : window._webBtWrite ? 'WebBT' : window._webSerialWrite ? 'WebSerial' : 'geen';
    const v = (typeof vehicleInfo !== 'undefined') ? vehicleInfo : {};
    const logTail = (typeof _btLog !== 'undefined' && _btLog.length)
      ? _btLog.slice(-40).map(e => `${e.ts} [${e.type}] ${e.msg}`).join('\n')
      : '(geen log)';
    body =
      'Beschrijf hier je vraag of probleem:\n\n\n' +
      '────────────────────────\n' +
      'Diagnostische gegevens (laat staan a.u.b.):\n' +
      `App: PidLane v${ver}\n` +
      `Gebruiker: ${(typeof currentUser!=='undefined' && currentUser?.name) || '?'}\n` +
      `Toestel: ${android} (${plat})\n` +
      `Verbinding: ${connected ? (demoMode ? 'demo' : 'verbonden') : 'niet verbonden'} via ${transport}\n` +
      `Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''}\n` +
      '\nLaatste log:\n' + logTail;
  }
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try { window.location.href = url; }
  catch(e){ showToast?.('Kon mailprogramma niet openen — mail naar ' + to); }
}

// ── Hoofd Koopcheck functie ────────────────────────────────
// ── Bandencheck: 1-euro-test illustratie (ingesloten) ──
// → BANDEN_IMG (base64-afbeelding) verplaatst naar pidlane-assets.js
let _koopRit = 'nee';        // 'nee' | 'ja'
let _koopRitDuur = '';        // '2min' | '10min'
let _koopProefritData = null; // resultaat van proefrit, meegenomen in oordeel
let _koopMode = 'koop';       // 'koop' | 'inkoop'

const KOOP_MODES = {
  koop:    { icon:'🔍', titel:'Aankoopcheck',     btn:'🔍 Voer Aankoopcheck uit',    grad:'linear-gradient(135deg,#7c3aed,#4f46e5)', bd:'#7c3aed44',
             desc:'Verbind OBD2, voer kenteken in na verbinding. PidLane analyseert voertuighistorie, onderhoudsachterstand en schat de marktwaarde.' },
  inkoop:  { icon:'🏢', titel:'Inkoopcontrole',    btn:'🏢 Voer Inkoopcontrole uit',  grad:'linear-gradient(135deg,#0891b2,#0e7490)', bd:'#0891b288',
             desc:'Voor handelaren: technische staat + zakelijke inkoopcalculatie. Vul de inkoopgegevens in voor een marge-advies en een veilige max-inkoopprijs.' },
  verkoop: { icon:'💰', titel:'Verkoopcheck',      btn:'💰 Voer Verkoopcheck uit',    grad:'linear-gradient(135deg,#16a34a,#15803d)', bd:'#16a34a66',
             desc:'Wat levert jouw auto op? PidLane bepaalt de technische staat en schat dealerbod, inruilwaarde en particuliere verkoopprijs. Rapport deelbaar met een koper.' },
  lease:   { icon:'🚘', titel:'Lease Teruggave',   btn:'🚘 Voer Lease-check uit',     grad:'linear-gradient(135deg,#ea580c,#c2410c)', bd:'#ea580c66',
             desc:'Voorkom naheffingen bij inlevering. PidLane checkt km-stand t.o.v. contract, technische staat en bandenprofiel, en wijst op aandachtspunten uit het innameprotocol.' },
  occasion:{ icon:'📋', titel:'Occasion Rapport',  btn:'📋 Genereer Occasion Rapport', grad:'linear-gradient(135deg,#4f46e5,#6366f1)', bd:'#6366f166',
             desc:'Een net, deelbaar inspectierapport van de occasion: technische staat, historie, onderhoud en waarde-indicatie — klaar om mee te geven.' },
};
function setKoopMode(mode){
  _koopMode = mode;
  // Verse start: oude proefrit-data en keuzes wissen
  _koopProefritData = null; _koopRit='nee'; _koopRitDuur='';
  const klaar=document.getElementById('koopRitKlaar'); if(klaar) klaar.style.display='none';
  const duur=document.getElementById('koopRitDuur'); if(duur) duur.style.display='none';
  const cfg = KOOP_MODES[mode] || KOOP_MODES.koop;
  const set=(id,txt)=>{ const el=document.getElementById(id); if(el) el.textContent=txt; };
  const show=(id,on)=>{ const el=document.getElementById(id); if(el) el.style.display=on?'':'none'; };
  show('koopInkoopBlok', mode==='inkoop');
  show('koopLeaseBlok',  mode==='lease');
  set('koopHeaderIcon', cfg.icon);
  set('koopHeaderTitle', cfg.titel);
  set('koopHeaderDesc', cfg.desc);
  const hdr=document.getElementById('koopHeader');
  if(hdr) hdr.style.borderColor = cfg.bd;
  const btn=document.getElementById('koopBtn');
  if(btn){ btn.textContent = cfg.btn; btn.style.background = cfg.grad; }
}

// Losse Proefrit-mode (vanaf welkomstscherm): vraag 2 of 10 min, dan rijden
function openProefritKeuze(){
  let m=document.getElementById('proefritKeuzeModal');
  if(!m){
    m=document.createElement('div'); m.id='proefritKeuzeModal';
    m.style.cssText='position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:24px';
    m.onclick=(e)=>{ if(e.target.id==='proefritKeuzeModal'){ m.style.display='none'; try{ goHome(); }catch(err){ /* stil: element kan al weg zijn */ } } };
    m.innerHTML='<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:20px;max-width:320px;width:100%">'+
      '<div style="font-weight:800;font-size:15px;margin-bottom:4px;text-align:center">Proefrit Analyse</div>'+
      '<div style="font-size:12px;color:var(--tx3);margin-bottom:14px;text-align:center">Hoe lang wil je rijden? Beide meten puur de techniek onder belasting — geen rijgedrag.</div>'+
      '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<button onclick="proefritKeuzeStart(\'2min\')" style="padding:12px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">⚡ 2 minuten<div style="font-size:12px;color:var(--tx3);font-weight:400;margin-top:2px">Snelle technische indruk</div></button>'+
      '<button onclick="proefritKeuzeStart(\'10min\')" style="padding:12px;border-radius:9px;border:none;background:#00b4cc;color:#fff;font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">🚗 10 minuten<div style="font-size:12px;color:rgba(255,255,255,.75);font-weight:400;margin-top:2px">Volledig beeld onder echte belasting</div></button>'+
      '</div></div>';
    document.body.appendChild(m);
  }
  m.style.display='flex';
}
function proefritKeuzeStart(d){
  document.getElementById('proefritKeuzeModal').style.display='none';
  window._koopProefritActief=false; // losse proefrit, niet vanuit koopcheck
  openRitAnalyse(d);
}
function openKoopKeuze(){
  let m=document.getElementById('koopKeuzeModal');
  if(!m){
    m=document.createElement('div'); m.id='koopKeuzeModal';
    m.style.cssText='position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:24px';
    m.onclick=(e)=>{ if(e.target.id==='koopKeuzeModal') m.style.display='none'; };
    m.innerHTML='<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:20px;max-width:340px;width:100%">'+
      '<div style="font-weight:800;font-size:15px;margin-bottom:4px;text-align:center">Koop / Verkoop-check</div>'+
      '<div style="font-size:12px;color:var(--tx3);margin-bottom:14px;text-align:center">Kies je rol — dezelfde check, juiste invalshoek (waarde, staat en historie).</div>'+
      '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<button onclick="koopKeuzeStart(\'koop\')" style="padding:11px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">🛒 Auto kopen<div style="font-size:12px;color:var(--tx3);font-weight:400;margin-top:2px">Historie + staat + koopadvies</div></button>'+
      '<button onclick="koopKeuzeStart(\'verkoop\')" style="padding:11px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">🏷️ Verkopen / inruil<div style="font-size:12px;color:var(--tx3);font-weight:400;margin-top:2px">Wat is hij waard — deelbaar rapport</div></button>'+
      '<button onclick="koopKeuzeStart(\'inkoop\')" style="padding:11px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">🏢 Inkoop (handelaar)<div style="font-size:12px;color:var(--tx3);font-weight:400;margin-top:2px">Opknapkosten + veilige inkoopprijs</div></button>'+
      '<button onclick="koopKeuzeStart(\'lease\')" style="padding:11px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">🚘 Lease-teruggave<div style="font-size:12px;color:var(--tx3);font-weight:400;margin-top:2px">Voorkom naheffingen bij inlevering</div></button>'+
      '<button onclick="koopKeuzeStart(\'occasion\')" style="padding:11px;border-radius:9px;border:none;background:#00b4cc;color:#fff;font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">📄 Occasion-rapport<div style="font-size:12px;color:rgba(255,255,255,.75);font-weight:400;margin-top:2px">Professioneel inspectierapport, deelbaar</div></button>'+
      '</div></div>';
    document.body.appendChild(m);
  }
  m.style.display='flex';
}
function koopKeuzeStart(mode){ const m=document.getElementById('koopKeuzeModal'); if(m) m.style.display='none'; startChoice(mode); }
function openSeizoensCheck(){
  let m=document.getElementById('seizoenKeuzeModal');
  if(!m){
    m=document.createElement('div'); m.id='seizoenKeuzeModal';
    m.style.cssText='position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:24px';
    m.onclick=(e)=>{ if(e.target.id==='seizoenKeuzeModal') m.style.display='none'; };
    m.innerHTML='<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:20px;max-width:320px;width:100%">'+
      '<div style="font-weight:800;font-size:15px;margin-bottom:4px;text-align:center">Seizoenscheck</div>'+
      '<div style="font-size:12px;color:var(--tx3);margin-bottom:14px;text-align:center">Wat wil je checken voor het seizoen?</div>'+
      '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<button onclick="seizoenStart(\'winter\')" style="padding:11px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx);font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">❄️ Wintercheck<div style="font-size:12px;color:var(--tx3);font-weight:400;margin-top:2px">Thermostaat, opwarming, accu — klaar voor de kou</div></button>'+
      '<button onclick="seizoenStart(\'airco\')" style="padding:11px;border-radius:9px;border:none;background:#00b4cc;color:#fff;font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;text-align:left">🌬️ Airco-check<div style="font-size:12px;color:rgba(255,255,255,.75);font-weight:400;margin-top:2px">Koelvermogen + compressorwerking</div></button>'+
      '</div></div>';
    document.body.appendChild(m);
  }
  m.style.display='flex';
}
function seizoenStart(mode){ const m=document.getElementById('seizoenKeuzeModal'); if(m) m.style.display='none'; document.getElementById('welcomeScreen')?.classList.add('hidden'); openClimateCheck(mode); }
// ── Diepe storingsanalyse ──
var _ddStep=0;
function openDeepDiag(){
  document.getElementById('welcomeScreen')?.classList.add('hidden');
  var ov=document.getElementById('deepDiagOv');
  if(!ov){ ov=document.createElement('div'); ov.id='deepDiagOv'; document.body.appendChild(ov); }
  ov.style.cssText='position:fixed;inset:0;z-index:9800;background:#0a0e17;display:flex;flex-direction:column';
  var vi=(typeof vehicleInfo!=='undefined'&&vehicleInfo)?vehicleInfo:{};
  var mm=[vi.merk||vi.make||'',vi.model||''].filter(Boolean).join(' ');
  var ta='width:100%;box-sizing:border-box;background:#11151f;border:1px solid #232c40;border-radius:12px;color:#fff;font-family:var(--f);font-size:16px;padding:14px;resize:vertical;line-height:1.4';
  window._ddSteps=[
    {t:'Wat is het probleem?', sub:'Beschrijf zo concreet mogelijk wat er gebeurt.', req:'dd_probleem', html:'<textarea id="dd_probleem" rows="5" style="'+ta+'" placeholder="bijv. trilt bij optrekken, vermogensverlies bij 3000 tpm"></textarea>'},
    {t:'Eerdere checks of reparaties?', sub:'Wat is er al gedaan of gecontroleerd?', html:'<textarea id="dd_checks" rows="5" style="'+ta+'" placeholder="bijv. bougies vervangen, geen foutcodes eerder"></textarea>'},
    {t:'Merk en model', sub:'Voor merk/model-specifieke bekende problemen.', html:'<input id="dd_merk" value="'+mm.replace(/"/g,'&quot;')+'" style="'+ta+'" placeholder="bijv. Mazda CX-5 2.0 2018">'},
    {t:'Jouw gevoel of vermoeden', sub:'Waar denk jij dat het vandaan komt?', html:'<textarea id="dd_gevoel" rows="5" style="'+ta+'" placeholder="bijv. klinkt als de turbo, voelt brandstof-gerelateerd"></textarea>'},
    {t:'Datalog \u2014 reproduceer het probleem', sub:'Start de opname, rijd en wek het probleem op, stop daarna.', html:'<div style="display:flex;flex-direction:column;gap:12px"><button id="dd_logstart" onclick="deepLogStart()" style="padding:16px;border-radius:12px;border:none;background:#16a34a;color:#fff;font-family:var(--f);font-weight:800;font-size:17px;cursor:pointer">\u25b6 Start datalog</button><button id="dd_logstop" onclick="deepLogStop()" disabled style="padding:16px;border-radius:12px;border:1px solid #232c40;background:#11151f;color:#cdd5e5;font-family:var(--f);font-weight:700;font-size:16px;cursor:pointer">\u23f9 Stop opname</button><span id="dd_logstat" style="font-size:14px;color:#8a93a6;text-align:center"></span></div>'},
    {t:'Wat gebeurde er tijdens de datalog?', sub:'Koppel je waarneming aan het moment.', html:'<textarea id="dd_annot" rows="5" style="'+ta+'" placeholder="bijv. bij 2500 tpm begon het trillen, na 30s erger"></textarea>'},
    {t:'Extra info (optioneel)', sub:'Alles wat kan helpen \u2014 of laat leeg.', html:'<textarea id="dd_extra" rows="5" style="'+ta+'" placeholder="bijv. alleen koud / alleen snelweg"></textarea>'}
  ];
  _ddStep=0;
  ov.innerHTML=
    '<div style="display:flex;align-items:center;gap:12px;padding:18px 18px 10px;flex-shrink:0">'+
      '<div id="ddProgRow" style="display:flex;align-items:center;gap:12px;flex:1">'+
        '<div id="ddProgTxt" style="font-size:15px;font-weight:800;color:#7aa2ff;white-space:nowrap"></div>'+
        '<div style="flex:1;height:6px;background:#1a2030;border-radius:3px;overflow:hidden"><div id="ddProg" style="height:100%;width:0;background:#2f6bff;transition:width .3s"></div></div>'+
      '</div>'+
      '<button id="ddClose" onclick="closeDeepDiag()" style="background:none;border:none;color:#8a93a6;font-size:26px;cursor:pointer;line-height:1;flex-shrink:0;padding:0 4px">\u2715</button>'+
    '</div>'+
    '<div style="flex:1;overflow-y:auto;padding:18px 22px;display:flex;flex-direction:column">'+
      '<div id="ddStepTitle" style="font-size:25px;font-weight:800;color:#fff;line-height:1.25;margin-bottom:8px"></div>'+
      '<div id="ddStepSub" style="font-size:14px;color:#8a93a6;margin-bottom:24px;line-height:1.5"></div>'+
      window._ddSteps.map(function(s,i){ return '<div class="dd-step" data-i="'+i+'" style="display:none">'+s.html+'</div>'; }).join('')+
      '<div id="dd_result" style="display:none;margin-top:14px"></div>'+
    '</div>'+
    '<div id="ddFoot" style="display:flex;gap:12px;padding:14px 18px calc(20px + env(safe-area-inset-bottom));flex-shrink:0;border-top:1px solid #1a2030">'+
      '<button id="ddPrev" onclick="ddPrev()" style="padding:16px 22px;border-radius:12px;border:1px solid #2a3550;background:transparent;color:#cdd5e5;font-family:var(--f);font-size:18px;font-weight:800;cursor:pointer">\u2190</button>'+
      '<button id="ddNext" onclick="ddNext()" style="flex:1;padding:16px;border-radius:12px;border:none;background:#2f6bff;color:#fff;font-family:var(--f);font-size:17px;font-weight:800;cursor:pointer">Volgende \u2192</button>'+
    '</div>';
  ov.style.display='flex';
  ddRender();
}
function ddRender(){
  var steps=window._ddSteps||[], i=_ddStep, s=steps[i]; if(!s) return;
  var tt=document.getElementById('ddStepTitle'); if(tt) tt.textContent=s.t;
  var sb=document.getElementById('ddStepSub'); if(sb){ sb.textContent=s.sub||''; sb.style.display=s.sub?'block':'none'; }
  document.querySelectorAll('#deepDiagOv .dd-step').forEach(function(el){ el.style.display=(+el.getAttribute('data-i')===i)?'block':'none'; });
  var pct=Math.round(((i+1)/steps.length)*100);
  var pr=document.getElementById('ddProg'); if(pr) pr.style.width=pct+'%';
  var px=document.getElementById('ddProgTxt'); if(px) px.textContent=(i+1)+' / '+steps.length;
  var pv=document.getElementById('ddPrev'); if(pv) pv.style.visibility=(i===0)?'hidden':'visible';
  var nx=document.getElementById('ddNext'); if(nx) nx.textContent=(i===steps.length-1)?'\u25b6 Start analyse':'Volgende \u2192';
}
function ddNext(){
  var steps=window._ddSteps||[], s=steps[_ddStep];
  if(s && s.req){ var v=(document.getElementById(s.req)||{}).value||''; if(!v.trim()){ showToast?.('Vul dit veld eerst in'); return; } }
  if(_ddStep<steps.length-1){ _ddStep++; ddRender(); var sc=document.querySelector('#deepDiagOv > div:nth-child(2)'); if(sc) sc.scrollTop=0; } else { runDeepDiag(); }
}
function ddPrev(){ if(_ddStep>0){ _ddStep--; ddRender(); } }
function closeDeepDiag(){ var o=document.getElementById('deepDiagOv'); if(o) o.style.display='none'; }
function setUiScale(s){
  document.body.classList.remove('uiS','uiL');
  if(s==='s') document.body.classList.add('uiS');
  else if(s==='l') document.body.classList.add('uiL');
  try{ localStorage.setItem('pl_uiscale', s); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }
  ['uiS','uiM','uiL'].forEach(function(id){ var b=document.getElementById(id); if(b) b.classList.remove('on'); });
  var on=document.getElementById('ui'+s.toUpperCase()); if(on) on.classList.add('on');
}
function applyUiScale(){ var s='m'; try{ s=localStorage.getItem('pl_uiscale')||'m'; }catch(e){ /* stil: opslag kan leeg of corrupt zijn */ } setUiScale(s); }
try{ applyUiScale(); }catch(e){ console.warn('UI-schaal niet toegepast bij het laden', e); }
// ── Handmatige PID-recorder ──
var _recSel=new Set(), _recActive=false, _recT0=0, _recTimer=null;
function openPidRecorder(){
  document.getElementById('welcomeScreen')?.classList.add('hidden');
  var ov=document.getElementById('pidRecOv');
  if(!ov){ ov=document.createElement('div'); ov.id='pidRecOv'; ov.className='ai-sheet-ov'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="ai-sheet" style="max-height:94vh">'+
    '<div class="ai-sheet-h"><b>📼 PID-recorder</b><button class="ai-sheet-x" onclick="closePidRecorder()">✕</button></div>'+
    '<div class="ai-sheet-b">'+
      '<div style="font-size:12px;color:var(--tx3);line-height:1.5;margin-bottom:8px">Kies de sensoren die je wilt opnemen, druk op opnemen, rijd en reproduceer je probleem. Daarna stop je de opname.</div>'+
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">'+
        '<input id="pidRecSearch" oninput="pidRecFilter(this.value)" placeholder="🔎 Zoek sensor" style="flex:1;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--f);font-size:12px;padding:8px 10px">'+
        '<button onclick="pidRecSelectAll(true)" style="padding:8px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font-family:var(--f);font-size:11px;font-weight:700;cursor:pointer">Alles</button>'+
        '<button onclick="pidRecSelectAll(false)" style="padding:8px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font-family:var(--f);font-size:11px;font-weight:700;cursor:pointer">Niets</button>'+
      '</div>'+
      '<div id="pidRecList" style="max-height:38vh;overflow-y:auto;border:1px solid var(--bd);border-radius:8px;padding:4px"></div>'+
      '<div id="pidRecCount" style="font-size:11px;color:var(--tx3);margin:8px 0"></div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
        '<button id="pidRecBtn" onclick="pidRecToggleRec()" style="padding:12px 18px;border-radius:10px;border:none;background:#dc2626;color:#fff;font-family:var(--f);font-weight:800;font-size:14px;cursor:pointer">● Start opname</button>'+
        '<span id="pidRecStat" style="font-size:12px;color:var(--tx2)"></span>'+
      '</div>'+
      '<div id="pidRecResult" style="display:none;margin-top:14px"></div>'+
    '</div>'+
  '</div>';
  buildPidRecList();
  ov.style.display='flex';
}
function closePidRecorder(){ if(_recActive){ if(!confirm('Opname loopt nog — stoppen en sluiten?')) return; pidRecStopRec(); } var o=document.getElementById('pidRecOv'); if(o) o.style.display='none'; }
function _recPool(){
  var pool=(typeof supportedPIDs!=='undefined'&&supportedPIDs&&supportedPIDs.size)?[...supportedPIDs]:Object.keys(ALL_PID_DEFS||{});
  return pool.filter(function(p){ try{ return isReportableSensor(p); }catch(e){ return true; } });
}
function buildPidRecList(){
  var list=document.getElementById('pidRecList'); if(!list) return;
  if(!_recSel.size){ try{ [...(activePIDs||[])].forEach(function(p){ _recSel.add(p); }); }catch(e){ console.warn('Actieve PIDs niet voorgeselecteerd in de recorder', e); } }
  var pool=_recPool(), html='';
  pool.forEach(function(pid){
    var def=getPidDef(pid)||{}; var name=def.name||pid; var unit=def.unit?(' ('+def.unit+')'):'';
    var ck=_recSel.has(pid)?'checked':'';
    html+='<label class="pidrec-row" data-name="'+name.toLowerCase()+'" style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--bd);cursor:pointer;font-size:12px">'+
      '<input type="checkbox" data-pid="'+pid+'" '+ck+' onchange="pidRecToggle(\''+pid+'\',this.checked)" style="width:16px;height:16px">'+
      '<span style="color:var(--tx)">'+name+'</span><span style="color:var(--tx3);font-size:11px">'+unit+'</span>'+
      '<span style="margin-left:auto;color:var(--tx3);font-family:var(--m);font-size:11px">'+pid+'</span>'+
    '</label>';
  });
  list.innerHTML=html||'<div style="padding:10px;color:var(--tx3);font-size:11px">Geen sensoren beschikbaar — verbind eerst of zet demo aan.</div>';
  pidRecUpdCount();
}
function pidRecToggle(pid,on){ if(on) _recSel.add(pid); else _recSel.delete(pid); pidRecUpdCount(); }
function pidRecSelectAll(on){ document.querySelectorAll('#pidRecList .pidrec-row').forEach(function(r){ if(r.style.display==='none') return; var cb=r.querySelector('input'); var pid=cb.getAttribute('data-pid'); cb.checked=on; if(on)_recSel.add(pid); else _recSel.delete(pid); }); pidRecUpdCount(); }
function pidRecFilter(q){ q=(q||'').toLowerCase(); document.querySelectorAll('#pidRecList .pidrec-row').forEach(function(r){ r.style.display = r.getAttribute('data-name').indexOf(q)>=0?'flex':'none'; }); }
function pidRecUpdCount(){ var c=document.getElementById('pidRecCount'); if(c) c.textContent=_recSel.size+' sensor(en) geselecteerd'; }
/* ══ SENSORTWIJFEL — variant A (23-08-2026) ══════════════════════════════
   Zeven analyses zetten eerst het juiste PID-profiel aan en meten dan pas.
   Tot 22-08 stond die aanzet in een lege catch; sinds de opruimklus meldt hij
   in het logboek, maar het logboek is niet wat de monteur leest.

   Gekozen: doorgaan, maar het rapport zegt er zelf bij dat het op mogelijk
   verouderde sensordata kan draaien. Afbreken zou erger zijn — een koopcheck
   die halverwege stopt kost een klant, een koopcheck met een eerlijke
   waarschuwing niet.

   De vlag geldt per analyse: zetten bij het falen, opnemen én wissen bij het
   tonen van het resultaat. Zo lekt een waarschuwing van de ene analyse niet
   door naar de volgende. */
let _plSensorTwijfel = null;
function _plSensorVlag(watMislukte){
  _plSensorTwijfel = { wat: watMislukte, t: Date.now() };
}
// Geeft de bannerregel terug (of leeg) en wist de vlag.
function _plSensorBanner(){
  if(!_plSensorTwijfel) return '';
  const wat = _plSensorTwijfel.wat || 'de sensoren';
  _plSensorTwijfel = null;
  return '<div style="background:#7c2d12;border:1px solid #ea580c;border-radius:8px;'+
         'padding:10px 12px;margin-bottom:10px;font-size:13px;color:#fed7aa;line-height:1.5">'+
         '⚠ <b>Let op:</b> '+wat+' kon vlak vóór deze analyse niet ververst worden. '+
         'De beoordeling hieronder kan op verouderde of onvolledige sensordata draaien. '+
         'Verbreek en verbind opnieuw en draai de analyse nog een keer als je hier iets op baseert.</div>';
}
// Zelfde vlag, maar voor de tekstrapporten (export/archief) in plaats van HTML.
function _plSensorTekstregel(){
  if(!_plSensorTwijfel) return '';
  const wat = _plSensorTwijfel.wat || 'de sensoren';
  _plSensorTwijfel = null;
  return 'LET OP: '+wat+' kon vlak vóór deze analyse niet ververst worden — '+
         'de beoordeling kan op verouderde of onvolledige sensordata draaien.\n\n';
}

function pidRecToggleRec(){ if(_recActive) pidRecStopRec(); else pidRecStartRec(); }
function pidRecStartRec(){
  if(!_recSel.size){ showToast?.('Selecteer eerst minstens één sensor'); return; }
  if(!connected && !demoMode){ showToast?.('Verbind eerst een adapter (of demo)'); return; }
  try{ ensurePIDListActive([..._recSel]); }catch(e){ log('Geselecteerde sensoren niet actief gezet vóór de opname — de opname kan lege of oude waarden bevatten: '+(e.message||e),'warn'); }
  datalogActive=true; datalogBuffer={}; _recT0=Date.now();
  _recSel.forEach(function(p){ datalogBuffer[p]=[]; });
  _recActive=true;
  var b=document.getElementById('pidRecBtn'); if(b){ b.textContent='⏹ Stop opname'; b.style.background='#0c1018'; b.style.border='1px solid #dc2626'; }
  var r=document.getElementById('pidRecResult'); if(r){ r.style.display='none'; r.innerHTML=''; }
  if(_recTimer) clearInterval(_recTimer);
  _recTimer=setInterval(function(){ var s=document.getElementById('pidRecStat'); if(!s) return; var sec=Math.round((Date.now()-_recT0)/1000); var n=0; Object.values(datalogBuffer||{}).forEach(function(a){ n+=a.length; }); s.innerHTML='<span class="datalog-badge recording">● '+sec+'s · '+n+' metingen</span>'; },500);
  showToast?.('Opname gestart — rijd en reproduceer het probleem');
}
function pidRecStopRec(){
  datalogActive=false; _recActive=false;
  if(_recTimer){ clearInterval(_recTimer); _recTimer=null; }
  var dur=Math.round((Date.now()-_recT0)/1000);
  var buf={}; Object.keys(datalogBuffer||{}).forEach(function(p){ buf[p]=(datalogBuffer[p]||[]).slice(); });
  var n=0; Object.values(buf).forEach(function(a){ n+=a.length; });
  window._recData={ pids:[..._recSel], buffer:buf, dur:dur, n:n, ts:new Date() };
  var b=document.getElementById('pidRecBtn'); if(b){ b.textContent='● Start opname'; b.style.background='#dc2626'; b.style.border='none'; }
  var s=document.getElementById('pidRecStat'); if(s) s.innerHTML='<span class="datalog-badge">✓ '+dur+'s · '+n+' metingen opgenomen</span>';
  pidRecShowActions();
}
function pidRecShowActions(){
  var r=document.getElementById('pidRecResult'); if(!r) return;
  r.style.display='block';
  r.innerHTML='<div style="font-size:12px;font-weight:800;color:var(--tx2);margin-bottom:8px">Wat wil je met de opname doen?</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
      '<button class="ai-act" onclick="pidRecView()">👁 Bekijk</button>'+
      '<button class="ai-act" onclick="pidRecShare()">↗ Deel</button>'+
      '<button class="ai-act" onclick="pidRecDownload()">⬇ Download CSV</button>'+
      '<button class="ai-act pri" onclick="pidRecToAI()">🔧 Naar AI-Monteur</button>'+
    '</div>'+
    '<div id="pidRecOut" style="margin-top:12px"></div>';
}
function _recStats(){
  var d=window._recData; if(!d) return [];
  var rows=[];
  d.pids.forEach(function(pid){
    var arr=(d.buffer[pid]||[]).map(function(x){return x.v;}).filter(function(v){return typeof v==='number';});
    var def=getPidDef(pid)||{}; var name=def.name||pid; var unit=def.unit||'';
    if(!arr.length){ rows.push({pid:pid,name:name,unit:unit,n:0,mn:null,mx:null,av:null}); return; }
    var mn=Math.min.apply(null,arr),mx=Math.max.apply(null,arr),av=arr.reduce(function(a,b){return a+b;},0)/arr.length;
    rows.push({pid:pid,name:name,unit:unit,n:arr.length,mn:mn,mx:mx,av:av});
  });
  return rows;
}
function pidRecView(){
  var out=document.getElementById('pidRecOut'); if(!out) return;
  var rows=_recStats();
  var html='<table class="pidtab"><tr><th>Sensor</th><th>Metingen</th><th>Min</th><th>Max</th><th>Gem.</th></tr>';
  rows.forEach(function(r){ html+='<tr><td>'+r.name+'</td><td class="v">'+r.n+'</td><td class="v">'+(r.mn==null?'—':fv(r.mn))+'</td><td class="v">'+(r.mx==null?'—':fv(r.mx))+'</td><td class="v">'+(r.av==null?'—':fv(r.av))+' '+r.unit+'</td></tr>'; });
  html+='</table>';
  out.innerHTML='<div class="ai-sec blue"><div class="ai-sh blue">📊 Opname-overzicht ('+window._recData.dur+'s)</div><div class="ai-sb" style="padding:8px 4px">'+html+'</div></div>';
}
function pidRecCSV(){
  var d=window._recData; if(!d) return '';
  var lines=['tijd_ms,pid,sensor,waarde'];
  d.pids.forEach(function(pid){
    var def=getPidDef(pid)||{}; var name=(def.name||pid).replace(/,/g,' ');
    (d.buffer[pid]||[]).forEach(function(x){ lines.push(x.t+','+pid+','+name+','+x.v); });
  });
  return lines.join('\n');
}
function pidRecShare(){
  var rows=_recStats(); var d=window._recData;
  var txt='PidLane opname '+(d?d.ts.toLocaleString('nl-NL'):'')+' ('+(d?d.dur:0)+'s)\n';
  rows.forEach(function(r){ txt+=r.name+': '+r.n+' metingen, min '+(r.mn==null?'—':fv(r.mn))+', max '+(r.mx==null?'—':fv(r.mx))+', gem '+(r.av==null?'—':fv(r.av))+' '+r.unit+'\n'; });
  try{
    if(navigator.share){ navigator.share({title:'PidLane opname', text:txt}).catch(function(){ /* stil: gebruiker kan het deelmenu gewoon sluiten */ }); }
    else if(navigator.clipboard){ navigator.clipboard.writeText(txt); showToast?.('Samenvatting naar klembord'); }
    else showToast?.('Delen niet ondersteund');
  }catch(e){ showToast?.('Delen mislukt'); }
}
function pidRecDownload(){
  var csv=pidRecCSV(); if(!csv){ showToast?.('Geen data'); return; }
  try{
    var blob=new Blob([csv],{type:'text/csv'}); var url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download='pidlane_opname_'+Date.now()+'.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); },1000);
    showToast?.('CSV gedownload');
  }catch(e){ showToast?.('Download mislukt'); }
}
function pidRecToAI(){
  var out=document.getElementById('pidRecOut'); if(!out) return;
  out.innerHTML='<div class="ai-sec orange"><div class="ai-sh orange">🔧 Naar AI-Monteur</div><div class="ai-sb">'+
    '<div style="font-size:11px;color:var(--tx3);margin-bottom:6px">Beschrijf je probleem. De AI-Monteur gebruikt je opgenomen data als dataset om de oorzaak te vinden of uit te sluiten.</div>'+
    '<textarea id="pidRecProb" rows="3" style="width:100%;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--f);font-size:12px;padding:8px 10px;resize:vertical" placeholder="bijv. trilt bij optrekken tussen 2000-3000 tpm"></textarea>'+
    '<button id="pidRecAiBtn" class="ai-act pri" style="margin-top:8px;width:100%" onclick="pidRecRunAI()">▶ Analyseer met opname</button>'+
    '</div></div><div id="pidRecAiOut" style="margin-top:10px"></div>';
}
// Headless AI-analyse van de laatste opname — gedeeld door de recorder-UI
// én de remote-besturing (expert stuurt commando, LOCAL draait de analyse).
async function pidRecAiText(prob){
  var rows=_recStats(); var d=window._recData; var ds='';
  rows.forEach(function(r){ ds+='- '+r.name+': '+r.n+' metingen, bereik '+(r.mn==null?'—':fv(r.mn))+' t/m '+(r.mx==null?'—':fv(r.mx))+', gemiddeld '+(r.av==null?'—':fv(r.av))+' '+r.unit+'\n'; });
  var vi=(typeof vehicleInfo!=='undefined'&&vehicleInfo)?vehicleInfo:{};
  var mm=[vi.merk||vi.make||'',vi.model||''].filter(Boolean).join(' ');
  var p='Je bent een ervaren AI-automonteur. Een gebruiker heeft tijdens het rijden zelf een dataset opgenomen om een probleem te reproduceren. Gebruik UITSLUITEND deze opgenomen sensordata als bewijs om de mogelijke oorzaak te VINDEN of juist te ONTKRACHTEN.\n\n'+
    'KLACHT: '+prob+'\n'+(mm?('MERK/MODEL: '+mm+'\n'):'')+
    'OPNAMEDUUR: '+(d?d.dur:0)+' seconden\n'+
    'OPGENOMEN SENSORDATA:\n'+ds+'\n'+
    'Geef je antwoord in EXACT deze secties met deze koppen (hoofdletters):\n'+
    'MOGELIJKE OORZAAK\nDATA-OORDEEL\nADVIES';
  var txt=await apiFetch(p,1400);
  return _withDisclaimer(txt);
}
async function pidRecRunAI(){
  var prob=(document.getElementById('pidRecProb')||{}).value||'';
  if(!prob.trim()){ showToast?.('Beschrijf eerst je probleem'); return; }
  var btn=document.getElementById('pidRecAiBtn'); if(btn){ btn.disabled=true; btn.textContent='⏳ Analyseren'; }
  var aiout=document.getElementById('pidRecAiOut');
  if(aiout) aiout.innerHTML='<div class="ai-ld"><span class="spin"></span> AI analyseert je opname</div>';
  try{
    var txt=await pidRecAiText(prob);
    window._lastAIReport={ text:txt, html:_aiReportHtml(txt), ts:new Date() };
    var acts='<div class="ai-acts" style="margin-top:10px"><button class="ai-act pri" onclick="openAIReportSheet()">📄 Open rapport — bekijk, deel &amp; download</button></div>';
    if(aiout) aiout.innerHTML=_aiReportHtml(txt)+acts;
  }catch(e){ if(aiout) aiout.innerHTML='<div class="ai-sec red"><div class="ai-sh red">⚠ Fout</div><div class="ai-sb">'+((e&&e.message)||e)+'</div></div>'; }
  if(btn){ btn.disabled=false; btn.textContent='▶ Analyseer opnieuw'; }
}
function deepLogStart(){
  if(!connected && !demoMode){ showToast?.('Verbind eerst een adapter (of demo)'); return; }
  try{ ensurePIDsActive && ensurePIDsActive('totaal'); }catch(e){ log('Sensoren niet actief gezet vóór de deep-log — de opname kan lege of oude waarden bevatten: '+(e.message||e),'warn'); showToast?.('⚠ Sensoren niet ververst — de opname kan gaten bevatten'); }
  datalogActive=true; datalogBuffer={}; datalogStart=Date.now();
  [...(activePIDs||[])].forEach(function(pid){ datalogBuffer[pid]=[]; });
  var s=document.getElementById('dd_logstat'); if(s) s.innerHTML='<span class="datalog-badge recording">● Datalog loopt</span>';
  var sb=document.getElementById('dd_logstart'); if(sb) sb.disabled=true;
  var eb=document.getElementById('dd_logstop'); if(eb) eb.disabled=false;
  showToast?.('Datalog gestart — reproduceer nu het probleem');
}
function deepLogStop(){
  datalogActive=false;
  var n=0; Object.values(datalogBuffer||{}).forEach(function(a){ n+=a.length; });
  var dur=datalogStart?Math.round((Date.now()-datalogStart)/1000):0;
  var s=document.getElementById('dd_logstat'); if(s) s.innerHTML='<span class="datalog-badge">✓ '+dur+'s · '+n+' metingen</span>';
  var sb=document.getElementById('dd_logstart'); if(sb) sb.disabled=false;
  var eb=document.getElementById('dd_logstop'); if(eb) eb.disabled=true;
}
function _deepPidOverview(){
  var rows=[],promptLines=[];
  var pids=Object.keys(datalogBuffer||{}).filter(function(p){return datalogBuffer[p]&&datalogBuffer[p].length;});
  var useLog=pids.length>0;
  if(!useLog) pids=[...(activePIDs||[])];
  pids.forEach(function(pid){
    if(!isReportableSensor(pid)) return;
    var def=getPidDef(pid)||{}; var name=def.name||pid; var unit=def.unit||'';
    var mn,mx,av;
    if(useLog){
      var vals=datalogBuffer[pid].map(function(r){return r.v;}).filter(function(v){return typeof v==='number';});
      if(!vals.length) return;
      mn=Math.min.apply(null,vals); mx=Math.max.apply(null,vals); av=vals.reduce(function(a,b){return a+b;},0)/vals.length;
    } else {
      var cv=pidVals[pid]; if(typeof cv!=='number') return; mn=mx=av=cv;
    }
    var st='ok',stl='OK';
    if(def.max!=null && mx>def.max){st='bad';stl='TE HOOG';}
    else if(def.min!=null && mn<def.min){st='bad';stl='TE LAAG';}
    else if(def.wH!=null && mx>=def.wH){st='warn';stl='HOOG';}
    else if(def.wL!=null && mn<=def.wL){st='warn';stl='LAAG';}
    rows.push({name:name,mn:mn,mx:mx,av:av,unit:unit,st:st,stl:stl});
    if(st!=='ok') promptLines.push(name+': '+fv(mn)+'-'+fv(mx)+' '+unit+' ('+stl+')');
  });
  rows.sort(function(a,b){var o={bad:0,warn:1,ok:2};return o[a.st]-o[b.st];});
  var html='<table class="pidtab"><tr><th>Sensor</th><th>Min</th><th>Max</th><th>Gem.</th><th>Status</th></tr>';
  rows.slice(0,18).forEach(function(r){
    html+='<tr><td>'+r.name+'</td><td class="v">'+fv(r.mn)+'</td><td class="v">'+fv(r.mx)+'</td><td class="v">'+fv(r.av)+' '+r.unit+'</td><td><span class="st '+r.st+'">'+r.stl+'</span></td></tr>';
  });
  html+='</table>';
  return {html:html, summary:(promptLines.join('; ')||'geen duidelijke afwijkingen in de vastgelegde data'), useLog:useLog};
}
async function runDeepDiag(){
  var probleem=(document.getElementById('dd_probleem')||{}).value||'';
  if(!probleem.trim()){ showToast?.('Vul minimaal het probleem in'); return; }
  try{ ['ddProgRow','ddStepTitle','ddStepSub','ddFoot'].forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display='none'; }); document.querySelectorAll('#deepDiagOv .dd-step').forEach(function(el){ el.style.display='none'; }); }catch(e){ /* stil: element kan al weg zijn */ }
  var btn=document.getElementById('dd_eval'); if(btn){ btn.disabled=true; btn.textContent='⏳ Evalueren'; }
  var checks=(document.getElementById('dd_checks')||{}).value||'';
  var merk=(document.getElementById('dd_merk')||{}).value||'';
  var gevoel=(document.getElementById('dd_gevoel')||{}).value||'';
  var annot=(document.getElementById('dd_annot')||{}).value||'';
  var extra=(document.getElementById('dd_extra')||{}).value||'';
  var ov=_deepPidOverview();
  var p='Je bent een ervaren automonteur. Voer een DIEPGAANDE storingsanalyse uit op basis van ALLE onderstaande input. Wees concreet, gebruik de live sensordata als bewijs en noem merk/model-specifieke bekende problemen waar relevant.\n\n'+
    'KLACHT/PROBLEEM: '+(probleem||'(geen)')+'\n'+
    'EERDERE CHECKS/REPARATIES: '+(checks||'(geen)')+'\n'+
    'MERK/MODEL: '+(merk||'(onbekend)')+'\n'+
    'GEVOEL/VERMOEDEN BESTUURDER: '+(gevoel||'(geen)')+'\n'+
    'WAARNEMING TIJDENS DATALOG: '+(annot||'(geen)')+'\n'+
    'EXTRA INFO: '+(extra||'(geen)')+'\n'+
    'VASTGELEGDE SENSOR-AFWIJKINGEN (datalog): '+ov.summary+'\n\n'+
    'Geef je antwoord in EXACT deze secties met deze koppen (hoofdletters):\n'+
    'MOGELIJKE OORZAAK\nDATA-OORDEEL\nBEVINDINGEN\nADVIES\nGESCHATTE KOSTEN';
  var res=document.getElementById('dd_result');
  if(res){ res.style.display='block'; res.innerHTML='<div class="ai-ld"><span class="spin"></span> AI analyseert alle input</div>'; }
  try{
    var txt=await apiFetch(p,1600);
    txt=_withDisclaimer(txt);
    window._lastAIReport={ text:txt, html:_aiReportHtml(txt), ts:new Date() };
    var head='<div class="ai-res"><div class="ai-sec orange"><div class="ai-sh orange">🔁 Probleem-PID-overzicht ('+(ov.useLog?'datalog':'momentopname')+')</div><div class="ai-sb" style="padding:8px 4px">'+ov.html+'</div></div></div>';
    var acts='<div class="ai-acts" style="margin-top:10px"><button class="ai-act pri" onclick="openAIReportSheet()">📄 Open rapport — bekijk, deel &amp; download</button></div>';
    if(res) res.innerHTML=head+_aiReportHtml(txt)+acts;
  }catch(e){
    if(res) res.innerHTML='<div class="ai-sec red"><div class="ai-sh red">⚠ Fout</div><div class="ai-sb">'+((e&&e.message)||e)+'</div></div>';
  }
  if(btn){ btn.disabled=false; btn.textContent='▶ Evalueer opnieuw'; }
}

function setKoopRit(v){
  _koopRit = v;
  document.querySelectorAll('.koopRitOpt').forEach(b=>{
    const on = b.dataset.rit===v;
    b.style.borderColor = on?'var(--bl)':'var(--bd)';
    b.style.background  = on?'var(--bls)':'var(--sur2)';
    b.style.color       = on?'var(--bl)':'var(--tx2)';
  });
  document.getElementById('koopRitDuur').style.display = (v==='ja')?'block':'none';
}
function setKoopRitDuur(d){
  _koopRitDuur = d;
  document.querySelectorAll('.koopRitDuurOpt').forEach(b=>{
    const on = b.dataset.d===d;
    b.style.borderColor = on?'#00b4cc':'var(--bd)';
    b.style.background  = on?'rgba(0,180,204,.1)':'var(--sur2)';
    b.style.color       = on?'#0891b2':'var(--tx2)';
  });
}
function startKoopProefrit(){
  if(!_koopRitDuur){ showToast?.('Kies eerst 2 of 10 minuten'); return; }
  // Markeer dat na de rit terug naar koopcheck gesprongen wordt
  window._koopProefritActief = true;
  document.getElementById('welcomeScreen')?.classList.add('hidden');
  openRitAnalyse(_koopRitDuur);
  showToast?.('Proefrit gestart — rijd rustig. Data komt terug in de Koopcheck.');
}
// Wordt door de rit-analyse aangeroepen als de proefrit vanuit koopcheck liep
function koopProefritKlaar(samenvatting){
  _koopProefritData = samenvatting || 'Proefrit voltooid';
  window._koopProefritActief = false;
  const el = document.getElementById('koopRitKlaar');
  if(el) el.style.display='block';
}
function showBandenInfo(){
  let m=document.getElementById('bandenInfoModal');
  if(!m){
    m=document.createElement('div'); m.id='bandenInfoModal';
    m.style.cssText='position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:18px';
    m.onclick=(e)=>{ if(e.target.id==='bandenInfoModal') m.style.display='none'; };
    m.innerHTML='<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;max-width:380px;width:100%;overflow:hidden">'+
      '<div style="padding:14px 16px 10px"><div style="font-weight:800;font-size:15px;margin-bottom:3px">🛞 De 1-euro bandentest</div>'+
      '<div style="font-size:12px;color:var(--tx2);line-height:1.5">Steek een euromunt rechtop in de groef van de band. De gouden rand is ongeveer 3&nbsp;mm — de wettelijke minimum profieldiepte is 1,6&nbsp;mm, maar onder 3&nbsp;mm neemt de grip op nat wegdek snel af.</div></div>'+
      '<img src="'+BANDEN_IMG+'" style="width:100%;display:block" alt="1-euro bandentest">'+
      '<div style="padding:12px 16px 14px;font-size:12px;color:var(--tx2);line-height:1.6">'+
      '<div><b style="color:var(--rd)">Gouden gedeelte zichtbaar</b> → profiel te laag, banden vervangen.</div>'+
      '<div style="margin-top:4px"><b style="color:var(--gn)">Gouden rand verdwijnt in de groef</b> → profiel nog voldoende.</div>'+
      '<button id="bandenInfoClose" style="width:100%;margin-top:12px;padding:10px;border-radius:8px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:13px;font-weight:700;cursor:pointer">Begrepen</button>'+
      '</div></div>';
    document.body.appendChild(m);
    document.getElementById('bandenInfoClose').addEventListener('click',()=>{ m.style.display='none'; });
  }
  m.style.display='flex';
}

// ═══ ONDERHOUD / EV / LANGE RIT MODES ═══
// ══════════════════════════════════════════════════════════════════
// ONDERHOUD PLANNEN — schema-advies + sensorcheck of het écht nodig is
// ══════════════════════════════════════════════════════════════════
function openOnderhoud(){
  let ov=document.getElementById('onderhoudDash');
  if(!ov){ ov=document.createElement('div'); ov.id='onderhoudDash'; document.body.appendChild(ov); }
  ov.style.cssText='position:fixed;inset:0;background:linear-gradient(160deg,#0a1410,#0d1a22);z-index:9600;overflow-y:auto;font-family:var(--f)';
  const v=getVehicle();
  ov.innerHTML=`
  <div style="max-width:520px;margin:0 auto;padding:18px 16px 60px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#34d399;text-transform:uppercase">Onderhoud Plannen</div>
      <button onclick="closeExtraDash('onderhoudDash')" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer">✕</button>
    </div>
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:40px">🛠️</div>
      <div style="font-size:18px;font-weight:800;color:#f1f5f9;margin-top:4px">Is onderhoud écht nodig?</div>
      <div style="font-size:13px;color:#94a3b8;line-height:1.5;margin-top:6px">${v.merk?`${v.merk} ${v.model||''} ${v.year||''}`:'Verbind eerst de adapter'} — PidLane combineert het voorgeschreven schema met de actuele sensordata en zoekt naar gebreken.</div>
    </div>
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:13px;margin-bottom:12px">
      <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:5px">Km sinds laatste grote beurt (optioneel)</label>
      <input id="ondLaatste" type="number" placeholder="bijv. 12000" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#f1f5f9;font-family:var(--f);font-size:14px;box-sizing:border-box;margin-bottom:10px">
      <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:5px">Optioneel: rit voor betere meting</label>
      <div style="display:flex;gap:6px">
        <button class="ondRitOpt" data-r="geen" onclick="setOndRit('geen')" style="flex:1;padding:8px;border-radius:7px;border:1.5px solid #34d399;background:rgba(52,211,153,.12);color:#34d399;font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">Geen rit</button>
        <button class="ondRitOpt" data-r="2min" onclick="setOndRit('2min')" style="flex:1;padding:8px;border-radius:7px;border:1.5px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#cbd5e1;font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">⚡ 2 min</button>
        <button class="ondRitOpt" data-r="10min" onclick="setOndRit('10min')" style="flex:1;padding:8px;border-radius:7px;border:1.5px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#cbd5e1;font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">🚗 10 min</button>
      </div>
    </div>
    <div style="background:rgba(52,211,153,.06);border:1px solid #34d39944;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#cbd5e1;line-height:1.5">💡 Houd het serviceboekje altijd compleet — dat behoudt de waarde. PidLane kijkt of werk nu nodig is of veilig kan wachten.</div>
    <button onclick="runOnderhoud()" style="width:100%;padding:14px;border-radius:11px;border:none;background:#34d399;color:#04130d;font-family:var(--f);font-size:14px;font-weight:800;cursor:pointer">▶ Analyseer onderhoud</button>
    <div id="ondResult" style="margin-top:14px"></div>
  </div>`;
  ov.style.display='block';
  window._ondRit='geen';
}
function setOndRit(r){
  window._ondRit=r;
  document.querySelectorAll('.ondRitOpt').forEach(b=>{
    const on=b.dataset.r===r;
    b.style.borderColor=on?'#34d399':'rgba(255,255,255,.15)';
    b.style.background=on?'rgba(52,211,153,.12)':'rgba(255,255,255,.05)';
    b.style.color=on?'#34d399':'#cbd5e1';
  });
}
async function runOnderhoud(){
  const res=document.getElementById('ondResult');
  const rit=window._ondRit||'geen';
  if(rit!=='geen'){
    // Eerst rijden voor data, dan terug naar onderhoud
    window._ondPending=true;
    closeExtraDash('onderhoudDash');
    openRitAnalyse(rit);
    return;
  }
  res.innerHTML=`<div style="text-align:center;padding:20px;color:#cbd5e1;font-size:14px">🧠 AI analyseert het onderhoud…</div>`;
  try{ await ensurePIDsActive('totaal'); }catch(e){ log('Sensoren niet vers gezet vóór het onderhoudsadvies — het advies kan op oude data draaien: '+(e.message||e),'warn'); _plSensorVlag('De sensoren voor het onderhoudsadvies'); }
  const v=getVehicle();
  const laatste=parseInt(document.getElementById('ondLaatste')?.value)||0;
  const pdata=[...activePIDs].filter(isReportableSensor).map(pid=>{const d=getPidDef(pid);return d&&pidVals[pid]!=null?`${d.name}: ${fv(pidVals[pid])} ${d.unit}`:null;}).filter(Boolean).join('\n');
  const qBlok=_qualityBlokFor([...activePIDs].filter(isReportableSensor));
  const prompt=`Jij bent een Nederlandse APK-keurmeester/monteur. Bepaal of onderhoud nu nodig is of kan wachten.

Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''} ${v.motor||''}
Km-stand: ${v.km||'onbekend'}
Km sinds laatste grote beurt: ${laatste||'onbekend'}
Live sensordata:
${pdata||'(geen)'}
Foutcodes: ${(typeof dtcCodes!=='undefined'?dtcCodes.join(', '):'')||'geen'}${qBlok}

Gebruik de fabrieksintervallen van dit merk/model als referentie (olie, filters, distributieriem/-ketting, remvloeistof, bougies). Beoordeel daarnaast of de sensordata wijst op een actueel gebrek.

Geef in maximaal 160 woorden, Nederlands. Formaat:
NU NODIG: [wat echt niet kan wachten, of "niets dringends"]
BINNENKORT: [wat op korte termijn aankomt op basis van interval/km]
GEVONDEN GEBREKEN: [afwijkingen uit de sensordata, of "geen"]
ADVIES: [1-2 zinnen; benadruk serviceboekje compleet houden]`;
  try{
    const text=await apiFetch(prompt,900)||'Geen reactie';
    const _tw=_plSensorTwijfel?_plSensorTwijfel.wat:null;   // vlag lezen vóór de banner hem wist
    res.innerHTML=_plSensorBanner()+`<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;font-size:13px;color:#e2e8f0;line-height:1.6;white-space:pre-line">${text.replace(/</g,'&lt;')}</div>`;
    scanLogAdd?.({type:'onderhoud',msg:`${v.merk} ${v.model} ${v.km}km: ${text.slice(0,180)}`});
    // 15-07: óók in het 📄 Rapporten-archief — dit was (met EV/klimaat/koop) het enige AI-pad dat daar niet in kwam
    try{ registerSessionReport({type:'ai', title:'Onderhoudsadvies — '+[v.merk,v.model].filter(Boolean).join(' '), text:(_tw?'LET OP: '+_tw+' kon vlak vóór deze analyse niet ververst worden — de beoordeling kan op verouderde sensordata draaien.\n\n':'')+_withDisclaimer(text)}); }catch(e){ console.warn('Onderhoudsadvies niet in het rapportarchief gezet', e); }
  }catch(e){ res.innerHTML=`<div style="color:#fca5a5;font-size:13px;text-align:center;padding:14px">AI niet beschikbaar: ${e.message}</div>`; }
}

// ══════════════════════════════════════════════════════════════════
// EV / HYBRIDE CHECK — stilstaand + 2 min, focus op accu en systemen
// ══════════════════════════════════════════════════════════════════
function openEVCheck(){
  let ov=document.getElementById('evDash');
  if(!ov){ ov=document.createElement('div'); ov.id='evDash'; document.body.appendChild(ov); }
  ov.style.cssText='position:fixed;inset:0;background:linear-gradient(160deg,#0a0f1a,#10182a);z-index:9000;overflow-y:auto;font-family:var(--f)';
  const v=getVehicle();
  const ft=(typeof vehicleFuelType==='function')?vehicleFuelType():'';
  const isEV = ft==='elektrisch'||ft==='hybride';
  ov.innerHTML=`
  <div style="max-width:520px;margin:0 auto;padding:18px 16px 60px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#a78bfa;text-transform:uppercase">EV / Hybride Check</div>
      <button onclick="closeExtraDash('evDash')" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer">✕</button>
    </div>
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:40px">🔋</div>
      <div style="font-size:18px;font-weight:800;color:#f1f5f9;margin-top:4px">Accu & elektrisch systeem</div>
      <div style="font-size:13px;color:#94a3b8;line-height:1.5;margin-top:6px">${v.merk?`${v.merk} ${v.model||''}`:'Verbind eerst de adapter'} — verkorte analyse stilstaand, daarna een korte rit van 2 minuten met focus op accu en aandrijving.</div>
    </div>
    ${!isEV?`<div style="background:rgba(245,158,11,.1);border:1px solid #f59e0b55;border-radius:10px;padding:11px;margin-bottom:12px;font-size:12px;color:#fcd34d;line-height:1.5">⚠️ Deze auto lijkt geen EV/hybride. Veel accu-PID's zijn fabrieksspecifiek en mogelijk niet via standaard OBD2 beschikbaar — de analyse gebruikt wat de auto levert.</div>`:''}
    <div style="background:rgba(167,139,250,.06);border:1px solid #a78bfa44;border-radius:10px;padding:11px;margin-bottom:14px;font-size:12px;color:#cbd5e1;line-height:1.5">De check kijkt naar accuspanning/HV-systeem, laadgedrag, regeneratie en temperatuur waar beschikbaar. Standaard OBD2 toont beperkte EV-data; merk-specifieke PID's kunnen ontbreken.</div>
    <button onclick="runEVCheck()" style="width:100%;padding:13px;border-radius:11px;border:none;background:#a78bfa;color:#10081f;font-family:var(--f);font-size:14px;font-weight:800;cursor:pointer;margin-bottom:9px">⚡ Stilstaande analyse</button>
    <button onclick="runEVCheckRit()" style="width:100%;padding:12px;border-radius:11px;border:1px solid #a78bfa55;background:rgba(167,139,250,.12);color:#a78bfa;font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer">🚗 + 2 min rit erbij</button>
    <div id="evResult" style="margin-top:14px"></div>
  </div>`;
  ov.style.display='block';
}
function runEVCheckRit(){
  window._evPending=true;
  closeExtraDash('evDash');
  openRitAnalyse('2min');
}
async function runEVCheck(){
  const res=document.getElementById('evResult');
  res.innerHTML=`<div style="text-align:center;padding:20px;color:#cbd5e1;font-size:14px">🧠 AI analyseert accu & systemen…</div>`;
  try{ await ensurePIDsActive('accu'); }catch(e){ log('Sensoren niet vers gezet vóór de EV/accu-check — de beoordeling kan op oude data draaien: '+(e.message||e),'warn'); _plSensorVlag('De accu- en systeemsensoren'); }
  const v=getVehicle();
  const ft=(typeof vehicleFuelType==='function')?vehicleFuelType():'onbekend';
  const pdata=[...activePIDs].filter(isReportableSensor).map(pid=>{const d=getPidDef(pid);return d&&pidVals[pid]!=null?`${d.name}: ${fv(pidVals[pid])} ${d.unit}`:null;}).filter(Boolean).join('\n');
  const qBlok=_qualityBlokFor([...activePIDs].filter(isReportableSensor));
  const prompt=`Jij bent een Nederlandse EV/hybride specialist. Beoordeel de elektrische aandrijving en accu.

Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''}
Aandrijving: ${ft}
Live sensordata:
${pdata||'(geen)'}
Foutcodes: ${(typeof dtcCodes!=='undefined'?dtcCodes.join(', '):'')||'geen'}${qBlok}

Focus op: accu/HV-systeem conditie, laad- en ontlaadgedrag, regeneratie, temperatuurbeheer. Wees eerlijk dat standaard OBD2 beperkte EV-data geeft en dat sommige waarden merk-specifiek zijn en kunnen ontbreken. Verzin geen waarden.

Geef in maximaal 150 woorden, Nederlands. Formaat:
ACCU/SYSTEEM: [conditie o.b.v. beschikbare data, 1-2 zinnen]
LADEN/REGENERATIE: [wat zichtbaar is, of "niet uitleesbaar via OBD2"]
AANDACHTSPUNTEN: [afwijkingen of foutcodes, of "geen"]
ADVIES: [concrete vervolgstap, bijv. merk-dealer voor accu-SoH-test]`;
  try{
    const text=await apiFetch(prompt,900)||'Geen reactie';
    const _tw=_plSensorTwijfel?_plSensorTwijfel.wat:null;
    res.innerHTML=_plSensorBanner()+`<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;font-size:13px;color:#e2e8f0;line-height:1.6;white-space:pre-line">${text.replace(/</g,'&lt;')}</div>`;
    scanLogAdd?.({type:'ev-check',msg:`${v.merk} ${v.model} (${ft}): ${text.slice(0,180)}`});
    try{ registerSessionReport({type:'ai', title:'EV/Hybride check — '+[v.merk,v.model].filter(Boolean).join(' '), text:(_tw?'LET OP: '+_tw+' kon vlak vóór deze analyse niet ververst worden — de beoordeling kan op verouderde sensordata draaien.\n\n':'')+_withDisclaimer(text)}); }catch(e){ console.warn('EV/Hybride check niet in het rapportarchief gezet', e); }
  }catch(e){ res.innerHTML=`<div style="color:#fca5a5;font-size:13px;text-align:center;padding:14px">AI niet beschikbaar: ${e.message}</div>`; }
}

// ══════════════════════════════════════════════════════════════════
// LANGE RIT VOORBEREIDEN — techniek go/no-go + meeneem-checklist
// ══════════════════════════════════════════════════════════════════
function openLangeRit(){
  let ov=document.getElementById('langeRitDash');
  if(!ov){ ov=document.createElement('div'); ov.id='langeRitDash'; document.body.appendChild(ov); }
  ov.style.cssText='position:fixed;inset:0;background:linear-gradient(160deg,#0a1018,#101a26);z-index:9000;overflow-y:auto;font-family:var(--f)';
  const v=getVehicle();
  ov.innerHTML=`
  <div style="max-width:520px;margin:0 auto;padding:18px 16px 60px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:#38bdf8;text-transform:uppercase">Lange Rit Voorbereiden</div>
      <button onclick="closeExtraDash('langeRitDash')" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer">✕</button>
    </div>
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:40px">🧳</div>
      <div style="font-size:18px;font-weight:800;color:#f1f5f9;margin-top:4px">Klaar voor vertrek?</div>
      <div style="font-size:13px;color:#94a3b8;line-height:1.5;margin-top:6px">Technische go/no-go op basis van de sensoren, plus een meeneem-checklist voor veiligheid en buitenland.</div>
    </div>
    <div style="background:rgba(56,189,248,.06);border:1px solid #38bdf844;border-radius:10px;padding:11px;margin-bottom:12px">
      <label style="font-size:12px;color:#cbd5e1;display:block;margin-bottom:6px">Bestemming (voor landspecifieke eisen)</label>
      <select id="langeRitLand" class="api-inp" style="width:100%;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#f1f5f9;font-size:14px;box-sizing:border-box">
        <option value="nl">Nederland / binnenland</option>
        <option value="fr">Frankrijk</option>
        <option value="de">Duitsland</option>
        <option value="at">Oostenrijk</option>
        <option value="ch">Zwitserland</option>
        <option value="be">België</option>
        <option value="other">Ander EU-land</option>
      </select>
    </div>
    <button onclick="runLangeRitTech()" style="width:100%;padding:13px;border-radius:11px;border:none;background:#38bdf8;color:#04121c;font-family:var(--f);font-size:14px;font-weight:800;cursor:pointer;margin-bottom:9px">🔧 Technische check</button>
    <button onclick="renderLangeRitChecklist()" style="width:100%;padding:12px;border-radius:11px;border:1px solid #38bdf855;background:rgba(56,189,248,.12);color:#38bdf8;font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer">📋 Toon meeneem-checklist</button>
    <div id="langeRitResult" style="margin-top:14px"></div>
  </div>`;
  ov.style.display='block';
}
async function runLangeRitTech(){
  const res=document.getElementById('langeRitResult');
  res.innerHTML=`<div style="text-align:center;padding:20px;color:#cbd5e1;font-size:14px">🧠 Technische go/no-go…</div>`;
  try{ await ensurePIDsActive('totaal'); }catch(e){ log('Sensoren niet vers gezet vóór de lange-rit-check — de go/no-go kan op oude data draaien: '+(e.message||e),'warn'); _plSensorVlag('De sensoren voor de go/no-go'); }
  const v=getVehicle();
  const pdata=[...activePIDs].filter(isReportableSensor).map(pid=>{const d=getPidDef(pid);return d&&pidVals[pid]!=null?`${d.name}: ${fv(pidVals[pid])} ${d.unit}`:null;}).filter(Boolean).join('\n');
  const qBlok=_qualityBlokFor([...activePIDs].filter(isReportableSensor));
  const prompt=`Jij bent een Nederlandse monteur. Beoordeel of deze auto klaar is voor een lange rit (1000+ km).

Voertuig: ${v.merk||'?'} ${v.model||''} ${v.year||''}
Km-stand: ${v.km||'onbekend'}
Live sensordata:
${pdata||'(geen)'}
Foutcodes: ${(typeof dtcCodes!=='undefined'?dtcCodes.join(', '):'')||'geen'}

Let op zaken die juist op lange afstand kritisch zijn: koelsysteem/thermostaat, oliedruk/-temperatuur, accu/laadspanning, banden (indirect), foutcodes die op afstand verergeren.

Geef in maximaal 140 woorden, Nederlands. Formaat:
GO / NO-GO: [duidelijk oordeel]
KRITISCHE PUNTEN: [wat eerst gecheckt/verholpen moet, of "geen"]
ADVIES: [concrete stappen voor vertrek]`;
  try{
    const text=await apiFetch(prompt,900)||'Geen reactie';
    res.innerHTML=_plSensorBanner()+`<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;font-size:13px;color:#e2e8f0;line-height:1.6;white-space:pre-line;margin-bottom:12px">${text.replace(/</g,'&lt;')}</div>`+langeRitChecklistHTML();
    scanLogAdd?.({type:'lange-rit',msg:`${v.merk} ${v.model}: ${text.slice(0,150)}`});
  }catch(e){ res.innerHTML=`<div style="color:#fca5a5;font-size:13px;text-align:center;padding:14px">AI niet beschikbaar: ${e.message}</div>`+langeRitChecklistHTML(); }
}
function renderLangeRitChecklist(){
  const res=document.getElementById('langeRitResult');
  if(res) res.innerHTML=langeRitChecklistHTML();
}
function langeRitChecklistHTML(){
  const land=document.getElementById('langeRitLand')?.value||'nl';
  const altijd=[
    ['🛞','Banden incl. reserve/noodset','Profiel ≥3mm, spanning op orde, reservewiel of bandenreparatieset + compressor'],
    ['🛢️','Vloeistoffen','Olie (+ flesje bijvullen), koelvloeistof, ruitensproeier'],
    ['🔋','Accu & verlichting','Accu fit, alle lampen werkend, set reservelampjes'],
    ['🧰','Pech & veiligheid','Gevarendriehoek, startkabels, EHBO, zaklamp'],
    ['💧','Comfort','Water, dekens, opladers, contant geld kleingeld tol'],
  ];
  const perLand={
    fr:[['🦺','Veiligheidshesjes','Verplicht, binnen handbereik (niet in kofferbak) — voor alle inzittenden aangeraden'],['📐','Gevarendriehoek','Verplicht (ECE R27)'],['🍷','Alcoholtester','Aangeraden (niet meer verplicht sinds 2020); limiet 0,5‰ / 0,2‰ beginner'],['🏷️','Crit\u2019Air milieusticker','Verplicht in veel stadscentra'],['❄️','Winteruitrusting','In bergzones nov–mrt winterbanden of sneeuwkettingen']],
    de:[['🦺','Veiligheidshesjes','Verplicht, binnen handbereik'],['📐','Gevarendriehoek','Verplicht'],['🩹','Verbanddoos','Verplicht voor Duits kenteken; aangeraden voor NL'],['🏷️','Umweltplakette','Verplicht in Umweltzonen (stadscentra)']],
    at:[['🦺','Veiligheidshesjes','Verplicht'],['📐','Gevarendriehoek','Verplicht'],['🩹','Verbanddoos','Verplicht voor NL auto\u2019s'],['🛣️','Vignet','Tolvignet verplicht op snelwegen'],['❄️','Winterbanden','1 nov–15 apr bij winterse omstandigheden']],
    ch:[['🦺','Veiligheidshesjes','Verplicht'],['📐','Gevarendriehoek','Verplicht'],['🩹','Verbanddoos','Aangeraden'],['🛣️','Vignet','Jaarvignet verplicht op snelwegen']],
    be:[['🦺','Veiligheidshesje','Verplicht voor bestuurder'],['📐','Gevarendriehoek','Verplicht'],['🩹','Verbanddoos','Verplicht'],['🧯','Brandblusser','Verplicht']],
    other:[['🦺','Veiligheidshesjes','In veel EU-landen verplicht'],['📐','Gevarendriehoek','In de meeste landen verplicht'],['🩹','Verbanddoos','Vaak verplicht — check ANWB Reiswijzer']],
    nl:[],
  };
  const extra=perLand[land]||[];
  const row=(it)=>`<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:16px;flex-shrink:0">${it[0]}</span><div><div style="font-size:13px;font-weight:700;color:#e2e8f0">${it[1]}</div><div style="font-size:12px;color:#94a3b8;line-height:1.45">${it[2]}</div></div></div>`;
  return `
  <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:6px 14px 12px;margin-bottom:8px">
    <div style="font-size:12px;font-weight:700;color:#38bdf8;padding:10px 0 4px">📋 Altijd meenemen</div>
    ${altijd.map(row).join('')}
    ${extra.length?`<div style="font-size:12px;font-weight:700;color:#fbbf24;padding:12px 0 4px">🌍 Verplicht/aangeraden in dit land</div>${extra.map(row).join('')}<div style="font-size:11px;color:#96a2bb;padding-top:8px;line-height:1.4">Regels wijzigen; check vóór vertrek de actuele ANWB Reiswijzer voor je bestemming.</div>`:''}
  </div>`;
}

// Gedeelde sluit-helper voor de losse dashboards
function closeExtraDash(id){ const el=document.getElementById(id); if(el) el.style.display='none'; try{ goHome(); }catch(e){ /* stil: element kan al weg zijn */ } }


// ═══ AIRCO & WINTER CHECK MODULE ═══
function CLIMATE_THERMO_SVG(accent){
  return `<svg viewBox="0 0 420 240" style="width:100%;height:auto;display:block;border-radius:12px;background:#0a1420;border:1px solid rgba(255,255,255,.08)">
    <!-- ventilatierooster -->
    <rect x="24" y="60" width="180" height="120" rx="14" fill="#0d1d2b" stroke="#1e3a4f" stroke-width="2"/>
    ${[0,1,2,3,4,5,6].map(i=>`<rect x="36" y="${74+i*15}" width="156" height="7" rx="3.5" fill="#16314a"/>`).join('')}
    <text x="114" y="200" text-anchor="middle" fill="#5b7591" font-family="sans-serif" font-size="13" font-weight="700">Ventilatierooster</text>

    <!-- thermometer -->
    <g transform="rotate(-22 300 120)">
      <!-- body -->
      <rect x="250" y="104" width="120" height="30" rx="15" fill="#fff"/>
      <rect x="250" y="104" width="120" height="30" rx="15" fill="url(#thg)" opacity=".15"/>
      <!-- roze tip (de beruchte punt) -->
      <circle cx="250" cy="119" r="17" fill="#ff8fb3"/>
      <circle cx="250" cy="119" r="17" fill="#ff6fa0" opacity=".4"/>
      <!-- scherm -->
      <rect x="286" y="110" width="50" height="18" rx="4" fill="#06121c"/>
      <text x="311" y="124" text-anchor="middle" fill="${accent}" font-family="monospace" font-size="13" font-weight="700">7.2\u00b0</text>
      <!-- knopje -->
      <circle cx="356" cy="119" r="6" fill="#cbd5e1"/>
    </g>
    <!-- pijl tip → rooster -->
    <path d="M 232 132 Q 215 150 200 138" fill="none" stroke="${accent}" stroke-width="2.5" stroke-dasharray="4 4"/>
    <polygon points="200,138 207,134 206,143" fill="${accent}"/>

    <defs><linearGradient id="thg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#94a3b8"/></linearGradient></defs>
  </svg>
  <div style="font-size:12px;color:#96a2bb;text-align:center;margin-top:6px;font-style:italic">Ja, die thermometer. Hij is nu een diagnose-instrument. \u{1F605}</div>`;
}

// ══════════════════════════════════════════════════════════════════
// AIRCO & WINTER CHECK — herbruikbare module
// Meet primair via OBD-sensoren (RPM-dip, motorbelasting, temperaturen).
// Thermometer (bijv. een kinder-/oorthermometer) is optionele 2e bron,
// gemarkeerd als minder betrouwbaar. Aanroepbaar vanuit elke mode via
// openClimateCheck('airco') of openClimateCheck('winter').
// ══════════════════════════════════════════════════════════════════
let _climateMode='airco';      // 'airco' | 'winter'
let _climateTimer=null;
let _climateData={};

function openClimateCheck(mode='airco'){
  _climateMode=mode;
  _climateData={ mode, t0:null, samples:[], thermoT1:null, thermoT2:null };
  document.getElementById('welcomeScreen')?.classList.add('hidden');
  let ov=document.getElementById('climateDash');
  if(!ov){ ov=document.createElement('div'); ov.id='climateDash'; document.body.appendChild(ov); }
  ov.style.cssText='position:fixed;inset:0;background:linear-gradient(160deg,#04101a,#0a1622);z-index:9000;overflow-y:auto;font-family:var(--f)';
  ov.innerHTML=climateIntroHTML(mode);
  ov.style.display='block';
}
function closeClimateCheck(){
  if(_climateTimer){ clearInterval(_climateTimer); _climateTimer=null; }
  const ov=document.getElementById('climateDash'); if(ov) ov.style.display='none';
}

function climateIntroHTML(mode){
  const airco = mode==='airco';
  const accent = airco?'#22d3ee':'#60a5fa';
  const icon = airco?'❄️':'🔥';
  const titel = airco?'Airco Check':'Wintercheck';
  const sub = airco
    ? 'Hoe goed koelt de airco? We meten het koelvermogen via de auto-sensoren, met optioneel een thermometer als tweede check.'
    : 'Werkt de thermostaat en warmt de motor goed op? We volgen koelvloeistof, olie en accu tijdens het opwarmen.';
  const stappen = airco ? [
    ['1','Motor uit, contact aan','Zet het contact aan zonder de motor te starten. We lezen de begintemperatuur.'],
    ['2','Start motor + airco','Start de motor, zet de airco op het koudste standje en de ventilator laag.'],
    ['3','60 seconden meten','We meten de RPM-dip van de compressor en de temperatuurdaling.'],
    ['4','Oordeel','Werkt de airco goed, zwak, of slaat de compressor niet aan?'],
  ] : [
    ['1','Koude start','Start de meting met een koude motor (bij voorkeur \u2019s ochtends).'],
    ['2','Start motor','Start de motor en laat hem stationair draaien. Niet wegrijden.'],
    ['3','Opwarmen volgen','We volgen koelvloeistof en olie tot bedrijfstemperatuur (~90\u00b0C).'],
    ['4','Oordeel','Thermostaat, opwarmtijd, oliecirculatie en accuconditie.'],
  ];
  return `
  <div style="max-width:520px;margin:0 auto;padding:18px 16px 60px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <button onclick="closeClimateCheck()" style="background:none;border:none;color:#94a3b8;font-size:22px;cursor:pointer;padding:4px">\u2039</button>
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:${accent};text-transform:uppercase">PidLane</div>
      <button onclick="closeClimateCheck()" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px">\u2715</button>
    </div>
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:46px;margin-bottom:6px">${icon}</div>
      <div style="font-size:20px;font-weight:800;color:#f1f5f9">${titel}</div>
      <div style="font-size:13px;color:#94a3b8;line-height:1.55;margin-top:6px">${sub}</div>
    </div>
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;margin-bottom:14px">
      ${stappen.map(s=>`
        <div style="display:flex;gap:11px;align-items:flex-start;margin-bottom:11px">
          <div style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:${accent};color:#04101a;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center">${s[0]}</div>
          <div><div style="font-size:14px;font-weight:700;color:#e2e8f0">${s[1]}</div><div style="font-size:12px;color:#94a3b8;line-height:1.45;margin-top:1px">${s[2]}</div></div>
        </div>`).join('')}
    </div>
    <div style="background:rgba(34,211,238,.06);border:1px solid ${accent}44;border-radius:12px;padding:11px;margin-bottom:16px;display:flex;gap:9px;align-items:flex-start">
      <span style="font-size:15px">\u{1F4E1}</span>
      <div style="font-size:12px;color:#cbd5e1;line-height:1.5">De meting gebruikt vooral de <b style="color:${accent}">auto-sensoren</b>. Een thermometer kun je optioneel toevoegen voor een extra controle \u2014 dat resultaat is minder betrouwbaar.</div>
    </div>
    <button onclick="climateStart()" style="width:100%;padding:14px;border-radius:11px;border:none;background:${accent};color:#04101a;font-family:var(--f);font-size:14px;font-weight:800;cursor:pointer">\u25b6 Start ${titel}</button>
    <div style="text-align:center;font-size:12px;color:#96a2bb;margin-top:10px">${(typeof connected!=='undefined'&&connected)||(typeof demoMode!=='undefined'&&demoMode)?'\u2705 Adapter verbonden':'\u26a0\ufe0f Geen adapter \u2014 verbind eerst de OBD2 adapter'}</div>
  </div>`;
}

async function climateStart(){
  const airco = _climateMode==='airco';
  // Activeer de relevante sensoren
  const pids = airco ? ['010C','0104','010F','0105','010B'] : ['0105','015C','010C','0142','010F'];
  try{ await ensurePIDListActive(pids); }catch(e){ log('Sensoren niet actief gezet vóór de klimaatcheck — de meting kan op oude data starten: '+(e.message||e),'warn'); _plSensorVlag('De klimaatsensoren'); }
  // Baseline na korte stabilisatie
  _climateData.t0 = Date.now();
  _climateData.samples = [];
  _climateData.baseline = climateSnapshot();
  climateRenderLive();
  const DUUR = airco ? 60 : 600; // airco 60s, winter tot 10 min (of eerder klaar)
  _climateData.duur = DUUR;
  if(_climateTimer) clearInterval(_climateTimer);
  _climateTimer = setInterval(()=>{
    const snap = climateSnapshot();
    _climateData.samples.push({ t:(Date.now()-_climateData.t0)/1000, ...snap });
    climateRenderLive();
    const elapsed = (Date.now()-_climateData.t0)/1000;
    // Winter: stop zodra koelvloeistof bedrijfstemp bereikt (>=88) of tijd om
    const coolant = snap.coolant;
    if(!airco && coolant!=null && coolant>=88){ climateFinish(); return; }
    if(elapsed>=DUUR){ climateFinish(); }
  }, airco?2000:3000);
}

function climateSnapshot(){
  const g=pid=> (typeof pidVals!=='undefined' && pidVals[pid]!=null)?pidVals[pid]:null;
  return {
    rpm:    g('010C'),
    load:   g('0104'),
    iat:    g('010F'),
    coolant:g('0105'),
    oil:    g('015C'),
    volt:   g('0142'),
    map:    g('010B'),
  };
}

function climateRenderLive(){
  const ov=document.getElementById('climateDash'); if(!ov) return;
  const airco=_climateMode==='airco';
  const accent=airco?'#22d3ee':'#60a5fa';
  const s=climateSnapshot();
  const b=_climateData.baseline||{};
  const elapsed=Math.floor((Date.now()-_climateData.t0)/1000);
  const duur=_climateData.duur||60;
  const pct=Math.min(100,Math.round(elapsed/duur*100));
  const rpmDip = (b.rpm!=null && s.rpm!=null) ? (s.rpm-b.rpm) : null;
  const loadDelta = (b.load!=null && s.load!=null) ? (s.load-b.load) : null;
  const f=(v,d=0)=> v==null?'\u2014':v.toFixed(d);
  const row=(lbl,val,unit,hint)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)"><div><div style="font-size:13px;color:#e2e8f0;font-weight:600">${lbl}</div>${hint?`<div style="font-size:12px;color:#96a2bb">${hint}</div>`:''}</div><div style="font-size:16px;font-weight:800;color:${accent};font-variant-numeric:tabular-nums">${val}<span style="font-size:12px;color:#96a2bb;font-weight:400;margin-left:2px">${unit}</span></div></div>`;
  ov.innerHTML=`
  <div style="max-width:520px;margin:0 auto;padding:18px 16px 60px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-size:16px;font-weight:800;color:#f1f5f9">${airco?'\u2744\ufe0f Airco meten\u2026':'\u{1F525} Opwarmen volgen\u2026'}</div>
      <button onclick="climateFinish()" style="padding:6px 12px;border-radius:8px;border:1px solid ${accent}55;background:${accent}18;color:${accent};font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">Nu stoppen</button>
    </div>
    <div style="height:6px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;margin-bottom:4px"><div style="height:100%;width:${pct}%;background:${accent};transition:width .4s"></div></div>
    <div style="font-size:12px;color:#96a2bb;text-align:right;margin-bottom:14px">${elapsed}s / ${duur}s</div>
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:4px 14px;margin-bottom:14px">
      ${airco?`
        ${row('Compressor RPM-dip', rpmDip==null?'\u2014':(rpmDip>0?'+':'')+f(rpmDip), 'RPM', rpmDip!=null&&rpmDip<-30?'compressor belast de motor \u2014 goed teken':'wachten op inschakeling')}
        ${row('Motorbelasting', f(s.load), '%', loadDelta!=null?`\u0394 ${loadDelta>0?'+':''}${f(loadDelta)}%`:'')}
        ${row('Inlaatlucht temp', f(s.iat), '\u00b0C', 'referentie omgeving')}
        ${row('Toerental', f(s.rpm), 'RPM','')}
      `:`
        ${row('Koelvloeistof', f(s.coolant), '\u00b0C', s.coolant!=null&&s.coolant>=88?'bedrijfstemperatuur bereikt':'opwarmen\u2026 (doel ~90\u00b0C)')}
        ${row('Motorolie temp', f(s.oil), '\u00b0C', 'volgt koelvloeistof met vertraging')}
        ${row('Accuspanning', f(s.volt,1), 'V', s.volt!=null&&s.volt<12?'laag \u2014 koude accu':'')}
        ${row('Toerental', f(s.rpm), 'RPM', 'koude stationairtoeren liggen hoger')}
      `}
    </div>
    <div style="font-size:12px;color:#96a2bb;text-align:center">De meting stopt ${airco?'na 60 seconden':'zodra ~90\u00b0C is bereikt'} automatisch.</div>
  </div>`;
}

function climateFinish(){
  if(_climateTimer){ clearInterval(_climateTimer); _climateTimer=null; }
  _climateData.eind = climateSnapshot();
  // Vraag optioneel thermometer-meting (alleen airco standaard, winter optioneel)
  climateRenderThermoPrompt();
}

function climateRenderThermoPrompt(){
  const ov=document.getElementById('climateDash'); if(!ov) return;
  const airco=_climateMode==='airco';
  const accent=airco?'#22d3ee':'#60a5fa';
  ov.innerHTML=`
  <div style="max-width:520px;margin:0 auto;padding:18px 16px 60px">
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:38px">\u{1F321}\ufe0f</div>
      <div style="font-size:18px;font-weight:800;color:#f1f5f9;margin-top:4px">Thermometer-check?</div>
      <div style="font-size:13px;color:#94a3b8;line-height:1.5;margin-top:6px">Optioneel: meet met een thermometer (bijv. een oor-/kinderthermometer) voor een extra controle. <b style="color:#fbbf24">Minder betrouwbaar</b> dan de sensormeting, maar leuk als dubbelcheck.</div>
    </div>
    <button onclick="climateShowThermoGuide()" style="width:100%;padding:12px;border-radius:11px;border:1px solid ${accent}55;background:${accent}14;color:${accent};font-family:var(--f);font-size:14px;font-weight:700;cursor:pointer;margin-bottom:9px">\u{1F321}\ufe0f Ja, thermometer toevoegen</button>
    <button onclick="climateVerdict()" style="width:100%;padding:14px;border-radius:11px;border:none;background:${accent};color:#04101a;font-family:var(--f);font-size:14px;font-weight:800;cursor:pointer">Sla over \u2192 toon oordeel</button>
  </div>`;
}

function climateShowThermoGuide(){
  const ov=document.getElementById('climateDash'); if(!ov) return;
  const airco=_climateMode==='airco';
  const accent=airco?'#22d3ee':'#60a5fa';
  ov.innerHTML=`
  <div style="max-width:520px;margin:0 auto;padding:18px 16px 60px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button onclick="climateRenderThermoPrompt()" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer">\u2039</button>
      <div style="font-size:16px;font-weight:800;color:#f1f5f9">\u{1F321}\ufe0f Zo meet je</div>
    </div>
    ${CLIMATE_THERMO_SVG(accent)}
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:13px;margin:14px 0">
      <div style="font-size:13px;color:#cbd5e1;line-height:1.6">
        1. Steek de thermometer in het ${airco?'koudste':'warmste'} ventilatierooster.<br>
        2. Wacht tot de meting stabiel is (~10\u201315 sec).<br>
        3. Lees de temperatuur af en voer hem hieronder in.
      </div>
    </div>
    <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:6px">Gemeten uitblaastemperatuur (\u00b0C)</label>
    <input id="climateThermoInput" type="number" step="0.1" placeholder="bijv. ${airco?'7':'55'}" style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#f1f5f9;font-family:var(--f);font-size:15px;margin-bottom:12px;box-sizing:border-box">
    <button onclick="climateSaveThermo()" style="width:100%;padding:14px;border-radius:11px;border:none;background:${accent};color:#04101a;font-family:var(--f);font-size:14px;font-weight:800;cursor:pointer">Opslaan \u2192 oordeel</button>
  </div>`;
}

function climateSaveThermo(){
  const v=parseFloat(document.getElementById('climateThermoInput')?.value);
  if(!isNaN(v)) _climateData.thermoT2=v;
  climateVerdict();
}

async function climateVerdict(){
  const ov=document.getElementById('climateDash'); if(!ov) return;
  const airco=_climateMode==='airco';
  const accent=airco?'#22d3ee':'#60a5fa';
  ov.innerHTML=`<div style="max-width:520px;margin:0 auto;padding:40px 16px;text-align:center">
    <div style="font-size:38px;margin-bottom:10px">\u{1F9E0}</div>
    <div style="font-size:14px;color:#cbd5e1">AI beoordeelt de meting\u2026</div>
  </div>`;
  // Lokaal oordeel (altijd beschikbaar, ook zonder AI-sleutel)
  const local = airco ? aircoLocalVerdict() : winterLocalVerdict();
  let aiText='';
  try{
    const prompt = airco ? buildAircoPrompt(local) : buildWinterPrompt(local);
    aiText = await apiFetch(prompt, 600) || '';
  }catch(e){ aiText=''; }
  climateRenderResult(local, aiText);
}

function aircoLocalVerdict(){
  const samples=_climateData.samples||[];
  const b=_climateData.baseline||{}, e=_climateData.eind||{};
  // RPM-dip: laagste RPM tov baseline tijdens meting
  let minRpm=b.rpm, maxLoad=b.load;
  samples.forEach(s=>{ if(s.rpm!=null&&(minRpm==null||s.rpm<minRpm)) minRpm=s.rpm; if(s.load!=null&&(maxLoad==null||s.load>maxLoad)) maxLoad=s.load; });
  const rpmDip = (b.rpm!=null&&minRpm!=null)? (b.rpm-minRpm):null;     // positief = compressor belast
  const loadRise = (b.load!=null&&maxLoad!=null)? (maxLoad-b.load):null;
  const compressorAan = (rpmDip!=null&&Math.abs(rpmDip)>25) || (loadRise!=null&&loadRise>5);
  // Thermometer delta (T1 omgeving ~ baseline IAT, T2 uitblaas)
  const t1 = _climateData.thermoT1 ?? b.iat;
  const t2 = _climateData.thermoT2;
  const deltaT = (t1!=null&&t2!=null)? (t1-t2):null;
  let oordeel, kleur;
  if(deltaT!=null){
    if(deltaT>=15){ oordeel='Airco werkt goed'; kleur='#22c55e'; }
    else if(deltaT>=8){ oordeel='Airco zwak \u2014 mogelijk laag koudemiddel'; kleur='#f59e0b'; }
    else { oordeel='Airco probleem \u2014 check koudemiddel/compressor'; kleur='#ef4444'; }
  } else if(compressorAan){ oordeel='Compressor slaat aan \u2014 koelvermogen niet gemeten'; kleur='#22c55e'; }
  else { oordeel='Compressor lijkt niet in te schakelen'; kleur='#ef4444'; }
  return { type:'airco', rpmDip, loadRise, compressorAan, t1, t2, deltaT, oordeel, kleur };
}

function winterLocalVerdict(){
  const samples=_climateData.samples||[];
  const b=_climateData.baseline||{}, e=_climateData.eind||{};
  const startCoolant=b.coolant, eindCoolant=e.coolant;
  // Opwarmtijd tot 88C
  let tijd88=null;
  for(const s of samples){ if(s.coolant!=null&&s.coolant>=88){ tijd88=Math.round(s.t); break; } }
  const bereiktBedrijfstemp = eindCoolant!=null && eindCoolant>=85;
  const oilFollows = (e.oil!=null&&eindCoolant!=null)? (e.oil>=eindCoolant-30):null;
  const voltKoud = b.volt;
  let thermostaat, kleur;
  if(!bereiktBedrijfstemp){ thermostaat='Bereikt geen bedrijfstemperatuur \u2014 thermostaat mogelijk open vast'; kleur='#ef4444'; }
  else if(tijd88!=null && tijd88>420){ thermostaat='Warmt traag op \u2014 thermostaat of circulatie controleren'; kleur='#f59e0b'; }
  else { thermostaat='Thermostaat en opwarming OK'; kleur='#22c55e'; }
  let accu;
  if(voltKoud==null) accu='onbekend';
  else if(voltKoud<11.8) accu='zwak \u2014 koude accu, overweeg test/vervanging';
  else if(voltKoud<12.2) accu='matig';
  else accu='goed';
  return { type:'winter', startCoolant, eindCoolant, tijd88, bereiktBedrijfstemp, oilFollows, voltKoud, accu, oordeel:thermostaat, kleur };
}

function buildAircoPrompt(v){
  return `Je bent een Nederlandse autotechnicus. Beoordeel een airco-meting kort.
RPM-dip bij inschakelen compressor: ${v.rpmDip==null?'onbekend':v.rpmDip.toFixed(0)+' RPM'}
Stijging motorbelasting: ${v.loadRise==null?'onbekend':v.loadRise.toFixed(0)+'%'}
Compressor schakelt in: ${v.compressorAan?'ja':'niet gedetecteerd'}
Thermometer omgeving T1: ${v.t1==null?'n.v.t.':v.t1.toFixed(1)+'\u00b0C'}
Thermometer uitblaas T2: ${v.t2==null?'n.v.t.':v.t2.toFixed(1)+'\u00b0C'}
Delta T: ${v.deltaT==null?'niet gemeten (alleen sensoren)':v.deltaT.toFixed(1)+'\u00b0C'}
Voorlopig oordeel: ${v.oordeel}

Geef max 90 woorden Nederlands:
OORDEEL: [1 zin]
UITLEG: [wat de cijfers betekenen, max 50 woorden]
ADVIES: [concrete vervolgstap]`;
}
function buildWinterPrompt(v){
  return `Je bent een Nederlandse autotechnicus. Beoordeel een winter-/opwarmmeting kort.
Koelvloeistof start: ${v.startCoolant==null?'?':v.startCoolant.toFixed(0)+'\u00b0C'}
Koelvloeistof eind: ${v.eindCoolant==null?'?':v.eindCoolant.toFixed(0)+'\u00b0C'}
Tijd tot 88\u00b0C: ${v.tijd88==null?'niet bereikt':v.tijd88+' sec'}
Olietemp volgt koelvloeistof: ${v.oilFollows==null?'onbekend':(v.oilFollows?'ja':'achterblijvend')}
Accuspanning koud: ${v.voltKoud==null?'?':v.voltKoud.toFixed(1)+'V'} (${v.accu})
Voorlopig oordeel: ${v.oordeel}

Geef max 100 woorden Nederlands:
OORDEEL: [thermostaat/opwarming, 1 zin]
ACCU: [1 zin]
ADVIES: [concrete vervolgstap]`;
}

function climateRenderResult(v, aiText){
  const ov=document.getElementById('climateDash'); if(!ov) return;
  const airco=_climateMode==='airco';
  const accent=airco?'#22d3ee':'#60a5fa';
  const f=(x,d=0)=>x==null?'\u2014':x.toFixed(d);
  const stat = airco ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0">
      ${climateStatCard('Compressor RPM-dip', v.rpmDip==null?'\u2014':f(v.rpmDip)+' RPM', accent)}
      ${climateStatCard('Belasting +', v.loadRise==null?'\u2014':'+'+f(v.loadRise)+'%', accent)}
      ${climateStatCard('Omgeving T1', v.t1==null?'\u2014':f(v.t1,1)+'\u00b0C', accent)}
      ${climateStatCard('Uitblaas T2', v.t2==null?'niet gemeten':f(v.t2,1)+'\u00b0C', accent)}
      ${v.deltaT!=null?`<div style="grid-column:1/-1">${climateStatCard('\u0394 Temperatuurdaling', f(v.deltaT,1)+'\u00b0C', v.kleur)}</div>`:''}
    </div>` : `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0">
      ${climateStatCard('Koelvloeistof eind', f(v.eindCoolant)+'\u00b0C', accent)}
      ${climateStatCard('Opwarmtijd', v.tijd88==null?'>tijd':v.tijd88+'s', accent)}
      ${climateStatCard('Olietemp', f(_climateData.eind?.oil)+'\u00b0C', accent)}
      ${climateStatCard('Accu (koud)', f(v.voltKoud,1)+'V', accent)}
    </div>`;
  ov.innerHTML=`
  <div style="max-width:520px;margin:0 auto;padding:18px 16px 60px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;color:${accent};text-transform:uppercase">${airco?'Airco Check':'Wintercheck'} \u2014 resultaat</div>
      <button onclick="closeClimateCheck()" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer">\u2715</button>
    </div>
    <div style="background:${v.kleur}14;border:1px solid ${v.kleur}55;border-radius:14px;padding:16px;text-align:center;margin-bottom:6px">
      <div style="font-size:14px;font-weight:800;color:${v.kleur}">${v.oordeel}</div>
      ${!airco?`<div style="font-size:12px;color:#cbd5e1;margin-top:5px">Accu: ${v.accu}</div>`:''}
    </div>
    ${stat}
    ${v.deltaT==null&&airco?`<div style="font-size:12px;color:#fbbf24;text-align:center;margin-bottom:8px">\u26a0\ufe0f Geen thermometer gebruikt \u2014 oordeel op sensoren (compressorwerking), niet op koelvermogen.</div>`:''}
    ${aiText?`<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:13px;font-size:13px;color:#cbd5e1;line-height:1.6;white-space:pre-line">${aiText.replace(/</g,'&lt;')}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:14px">
      <button onclick="openClimateCheck('${_climateMode}')" style="flex:1;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#e2e8f0;font-family:var(--f);font-size:13px;font-weight:700;cursor:pointer">\u21ba Opnieuw</button>
      <button onclick="closeClimateCheck()" style="flex:1;padding:12px;border-radius:10px;border:none;background:${accent};color:#04101a;font-family:var(--f);font-size:13px;font-weight:800;cursor:pointer">Klaar</button>
    </div>
  </div>`;
  try{ scanLogAdd?.({ type:_climateMode==='airco'?'aircocheck':'wintercheck', msg:`${v.oordeel}${v.deltaT!=null?' (\u0394T '+v.deltaT.toFixed(1)+'\u00b0C)':''}` }); }catch(e){ console.warn('Klimaatcheck-resultaat niet in het scanlog gezet', e); }
  // 15-07: klimaatcheck ook in het 📄 Rapporten-archief (lokaal oordeel + evt. AI-toelichting)
  try{
    const _cl=[(airco?'AIRCO CHECK':'WINTERCHECK')+' — lokaal oordeel: '+v.oordeel];
    if(airco){ if(v.deltaT!=null)_cl.push('Delta T: '+v.deltaT.toFixed(1)+' °C (T1 '+(v.t1==null?'—':v.t1.toFixed(1))+' → T2 '+(v.t2==null?'—':v.t2.toFixed(1))+')'); _cl.push('Compressor schakelt in: '+(v.compressorAan?'ja':'niet gedetecteerd')); }
    else { _cl.push('Koelvloeistof eind: '+(v.eindCoolant==null?'—':v.eindCoolant.toFixed(0))+' °C · tijd tot 88°C: '+(v.tijd88==null?'niet bereikt':v.tijd88+'s')+' · accu koud: '+(v.voltKoud==null?'—':v.voltKoud.toFixed(1))+' V ('+v.accu+')'); }
    if(aiText) _cl.push('','AI-TOELICHTING:',aiText);
    registerSessionReport({type:'ai', title:(airco?'Airco check':'Wintercheck')+' — '+v.oordeel, text:_plSensorTekstregel()+_withDisclaimer(_cl.join('\n'))});
  }catch(e){ console.warn('Klimaatcheck niet in het rapportarchief gezet', e); }
}

function climateStatCard(lbl,val,col){
  return `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px"><div style="font-size:12px;color:#94a3b8;margin-bottom:3px">${lbl}</div><div style="font-size:16px;font-weight:800;color:${col};font-variant-numeric:tabular-nums">${val}</div></div>`;
}


async function runKoopcheck(){
  const btn = document.getElementById('koopBtn');
  const res = document.getElementById('koopResults');
  if(!(await preAnalysisCheck())) return;
  // P2: zorg dat de conditiecheck op de juiste, verse PIDs draait — niet op
  // toevallig-actieve of lege sensoren. (Koopcheck miste eerder een profiel.)
  if(connected||demoMode){ try{ await ensurePIDsActive('totaal'); }catch(e){ log('Sensoren niet vers gezet vóór de koopcheck — de conditiecheck kan alsnog op toevallig-actieve of lege sensoren draaien (zie P2): '+(e.message||e),'warn'); _plSensorVlag('De sensoren voor de conditiecheck'); } }
  const km  = parseInt(document.getElementById('koopKmInput').value)||0;
  const boekje = document.getElementById('koopBoekje').value;
  const laagsteBeurt = parseInt(document.getElementById('koopLaatsteBeurt').value)||0;
  const vraagprijs = document.getElementById('koopVraagprijs').value;
  const banden = document.getElementById('koopBanden')?.value || 'onbekend';
  const bandenLabel = {goed:'profiel OK (1-euro test)',twijfel:'twijfelachtig — bijna versleten',slecht:'versleten — vervangen nodig',onbekend:'niet gecontroleerd'}[banden];
  const proefritData = _koopProefritData; // null of technische samenvatting

  // Haal voertuig op
  const merk  = vehicleInfo.merk  || (_koopRdwData ? _koopRdwData.merk : '');
  const model = vehicleInfo.model || (_koopRdwData ? _koopRdwData.handelsbenaming : '');
  const jaar  = vehicleInfo.year  || (_koopRdwData ? (_koopRdwData.datum_eerste_toelating||'').slice(0,4) : '');
  const kleur = _koopRdwData ? (_koopRdwData._val?.velden?.kleur||'') : '';
  const apkMaanden = _koopRdwData ? maandenTotAPK(_koopRdwData.vervaldatum_apk) : null;
  const tellerOordeel = _koopRdwData ? _koopRdwData._teller : null;
  const recallActief = _koopRdwData ? !!_koopRdwData._recall : false;

  if(!merk){ res.innerHTML='<div style="color:var(--rd);font-size:12px;padding:8px">❌ Voer eerst het kenteken in en klik RDW opzoeken.</div>'; return; }
  if(!km){   res.innerHTML='<div style="color:var(--rd);font-size:12px;padding:8px">❌ Voer de kilometerstand in.</div>'; return; }

  btn.disabled = true;
  btn.textContent = '⏳ Analyseren...';

  // DTC count ophalen
  const dtcCount = (typeof dtcCodes !== 'undefined' && dtcCodes) ? dtcCodes.length : 0;

  // Scan log entry
  const scanEntry = {
    type: 'koopcheck',
    msg: `${merk} ${model} ${jaar} | ${km} km | boekje:${boekje} | dtc:${dtcCount} | vraagprijs:${vraagprijs||'n.v.t.'}`,
    kenteken: _koopRdwData?._kent||'',
    vin: vehicleInfo.vin||'',
    merk, model, jaar, km, boekje, dtcCount, vraagprijs,
    banden, proefrit_uitgevoerd: !!proefritData,
    rdw_apk_maanden: apkMaanden,
    rdw_recall: _koopRdwData?._recall||false,
  };

  res.innerHTML = _plSensorBanner() + `
    <div style="background:var(--sur);border:1px solid var(--bd);border-radius:var(--r);padding:12px;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;color:#a78bfa;margin-bottom:8px">⏳ Onderhoudcheck bezig...</div>
      <div id="koopOnderhoudRes" style="font-size:12px;color:var(--tx2)">AI analyseert onderhoudshistorie...</div>
    </div>
    <div style="background:var(--sur);border:1px solid var(--bd);border-radius:var(--r);padding:12px;margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;color:#22d3ee;margin-bottom:8px">⏳ Prijsschatting bezig...</div>
      <div id="koopPrijsRes" style="font-size:12px;color:var(--tx2)">AI schat marktwaarde...</div>
    </div>`;

  let onderhoudKosten = 0;
  const _koopArch = [];   // 15-07: verzamelt de volledige AI-teksten voor het 📄 Rapporten-archief

  // ── Onderhoudcheck AI call ──
  try {
    const prompt1 = buildOnderhoudPrompt(merk, model, jaar, km, boekje, laagsteBeurt);
    const text1 = await apiFetch(prompt1, 900) || 'Geen reactie';
    document.getElementById('koopOnderhoudRes').innerHTML = formatKoopAI(text1, 'onderhoud');

    // Kosten uit response extraheren
    const kostenMatch = text1.match(/VERWACHTE KOSTEN:\s*€?\s*([\d.,]+)/i);
    if(kostenMatch) onderhoudKosten = parseInt(kostenMatch[1].replace(/[.,]/g,''))||0;

    scanEntry.onderhoud_ai = text1.slice(0,300);
    _koopArch.push('— ONDERHOUDCHECK —\n'+text1);
    scanLogAdd({ type:'koopcheck-onderhoud', msg:`${merk} ${model} ${jaar} ${km}km: ${text1.slice(0,200)}` });
  } catch(e) {
    document.getElementById('koopOnderhoudRes').textContent = 'AI niet beschikbaar: ' + e.message;
  }

  // ── Prijsschatting AI call (modus-afhankelijke insteek) ──
  try {
    const prompt2 = buildPrijsPrompt(merk, model, jaar, km, kleur, apkMaanden, boekje, vraagprijs, dtcCount, onderhoudKosten, tellerOordeel, recallActief, bandenLabel, proefritData, _koopMode);
    const text2 = await apiFetch(prompt2, 900) || 'Geen reactie';
    document.getElementById('koopPrijsRes').innerHTML = formatKoopAI(text2, 'prijs');

    scanEntry.prijs_ai = text2.slice(0,300);
    _koopArch.push('— PRIJSSCHATTING —\n'+text2);
    scanLogAdd({ type:'koopcheck-prijs', msg:`${merk} ${model} ${jaar} ${km}km: ${text2.slice(0,200)}` });
  } catch(e) {
    document.getElementById('koopPrijsRes').textContent = 'AI niet beschikbaar: ' + e.message;
  }

  // ── Lease-calculatie (alleen lease-modus) ──
  if(_koopMode==='lease'){
    const lease = {
      kmMax: parseInt(document.getElementById('leaseKmMax')?.value)||0,
      kmPrijs: parseFloat(document.getElementById('leaseKmPrijs')?.value)||0,
      type: document.getElementById('leaseType')?.value||'private',
      datum: document.getElementById('leaseDatum')?.value||'',
    };
    scanEntry.lease = lease;
    document.getElementById('koopResults').innerHTML += `
      <div style="background:var(--sur);border:1px solid #ea580c;border-radius:var(--r);padding:12px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:#ea580c;margin-bottom:8px">⏳ Lease-inlevercheck bezig...</div>
        <div id="koopLeaseRes" style="font-size:12px;color:var(--tx2)">AI beoordeelt km-stand en inlever-aandachtspunten...</div>
      </div>`;
    try {
      const prompt3 = buildLeasePrompt(merk, model, jaar, km, apkMaanden, boekje, dtcCount, bandenLabel, proefritData, lease);
      const text3 = await apiFetch(prompt3, 900) || 'Geen reactie';
      document.getElementById('koopLeaseRes').innerHTML = formatKoopAI(text3, 'lease');
      scanEntry.lease_ai = text3.slice(0,300);
      _koopArch.push('— LEASE-INLEVERCHECK —\n'+text3);
      scanLogAdd({ type:'lease-teruggave', msg:`${merk} ${model} ${km}km / max ${lease.kmMax}: ${text3.slice(0,180)}` });
    } catch(e) {
      document.getElementById('koopLeaseRes').textContent = 'AI niet beschikbaar: ' + e.message;
    }
  }

  // ── Inkoop-calculatie (alleen handelaar-modus) ──
  if(_koopMode==='inkoop'){
    const ink = {
      inkoopprijs: parseInt(document.getElementById('inkInkoopprijs')?.value)||0,
      verkoopprijs: parseInt(document.getElementById('inkVerkoopprijs')?.value)||0,
      kanaal: document.getElementById('inkKanaal')?.value||'showroom',
      btw: document.getElementById('inkBtw')?.value||'marge',
      import: document.getElementById('inkImport')?.value||'onbekend',
      opknapHandmatig: parseInt(document.getElementById('inkOpknap')?.value)||0,
    };
    scanEntry.inkoop = ink;
    document.getElementById('koopResults').innerHTML += `
      <div style="background:var(--sur);border:1px solid #0891b2;border-radius:var(--r);padding:12px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:#22d3ee;margin-bottom:8px">⏳ Inkoopcalculatie bezig...</div>
        <div id="koopInkoopRes" style="font-size:12px;color:var(--tx2)">AI berekent marge en max-inkoop...</div>
      </div>`;
    try {
      const prompt3 = buildInkoopPrompt(merk, model, jaar, km, apkMaanden, boekje, dtcCount, onderhoudKosten, tellerOordeel, recallActief, bandenLabel, proefritData, ink);
      const text3 = await apiFetch(prompt3, 900) || 'Geen reactie';
      document.getElementById('koopInkoopRes').innerHTML = formatKoopAI(text3, 'inkoop');
      scanEntry.inkoop_ai = text3.slice(0,300);
      _koopArch.push('— INKOOPCALCULATIE —\n'+text3);
      scanLogAdd({ type:'inkoopcontrole', msg:`${merk} ${model} ${jaar} ${km}km inkoop:€${ink.inkoopprijs}: ${text3.slice(0,200)}` });
    } catch(e) {
      document.getElementById('koopInkoopRes').textContent = 'AI niet beschikbaar: ' + e.message;
    }
  }

  // Sla volledige scanEntry op
  scanLogAdd(scanEntry);
  // 15-07: gecombineerd koop-/lease-/inkooprapport in het 📄 Rapporten-archief
  try{ if(_koopArch.length) registerSessionReport({type:'ai', title:((KOOP_MODES[_koopMode]||{}).titel||'Koopcheck')+' — '+[merk,model,jaar].filter(Boolean).join(' '), text:_koopArch.join('\n\n')}); }catch(e){ console.warn('Koopcheck-rapport niet in het rapportarchief gezet', e); }

  // Voeg disclaimer toe
  const deelbaar = (_koopMode==='verkoop'||_koopMode==='occasion');
  document.getElementById('koopResults').innerHTML += `
    <div style="margin-top:12px;padding:8px 10px;background:var(--sur2);border:1px solid var(--bd);border-radius:6px;font-size:11px;color:var(--tx3);line-height:1.5">
      <strong>⚖️ Disclaimer:</strong> PidLane biedt deze analyse uitsluitend ter informatie. De AI-analyse, RDW-gegevens en prijsschatting zijn indicatief en kunnen fouten bevatten. PidLane, haar ontwikkelaars en medewerkers zijn niet aansprakelijk voor beslissingen genomen op basis van deze analyse, voor verborgen gebreken die niet detecteerbaar zijn via OBD2-uitlezing, noch voor enige directe of indirecte schade. Raadpleeg altijd een erkende BOVAG/RAI-garage voor een complete keuring. © PidLane 2026
    </div>
    ${deelbaar?`
    <div style="margin-top:10px;padding:11px;background:linear-gradient(135deg,rgba(22,163,74,.1),var(--sur));border:1px solid #16a34a55;border-radius:8px">
      <div style="font-size:12px;font-weight:700;color:#16a34a;margin-bottom:4px">📤 Rapport delen met koper</div>
      <div style="font-size:12px;color:var(--tx2);line-height:1.5;margin-bottom:8px">Deel dit rapport met een geïnteresseerde koper of dealer als bewijs van de staat en historie.</div>
      <button onclick="exportVehicleDossier(this)" style="width:100%;padding:9px;border-radius:7px;border:none;background:#16a34a;color:#fff;font-family:var(--f);font-size:12px;font-weight:700;cursor:pointer">📁 Deel als PDF-rapport</button>
    </div>`:''}
    <div style="margin-top:8px;text-align:center">
      <button onclick="mailSupport(true)" style="font-size:12px;font-weight:600;padding:6px 12px;border-radius:6px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);cursor:pointer">✉ Stuur naar support</button>
    </div>`;

  btn.disabled = false;
  const cfgEnd = KOOP_MODES[_koopMode] || KOOP_MODES.koop;
  btn.textContent = cfgEnd.btn.replace('Voer','Voer opnieuw').replace('Genereer','Genereer opnieuw');
  log(`${cfgEnd.icon} ${cfgEnd.titel} klaar: ${merk} ${model} ${jaar} — ${km.toLocaleString('nl')} km`, 'ok');
}

function formatKoopAI(text, type){
  // Maak AI output leesbaar met gekleurde labels
  const labels = [
    ['ONDERHOUDSCHECK:', '#22c55e'],
    ['VERWACHTE KOSTEN:', '#f97316'],
    ['DETAILS:', 'var(--tx)'],
    ['MARKTWAARDE:', '#22d3ee'],
    ['OORDEEL PRIJS:', '#a78bfa'],
    ['ONDERHANDELEN:', '#f97316'],
    ['TOELICHTING:', 'var(--tx)'],
    ['OPKNAPKOSTEN:', '#f97316'],
    ['VERWACHTE MARGE:', '#22c55e'],
    ['MAX-INKOOP:', '#22d3ee'],
    ['INKOOPADVIES:', '#a78bfa'],
    ['RISICO:', '#ef4444'],
    ['PARTICULIER:', '#22c55e'],
    ['INRUILWAARDE:', '#f59e0b'],
    ['DEALERBOD:', '#22d3ee'],
    ['ADVIES:', '#a78bfa'],
    ['KM-STATUS:', '#ea580c'],
    ['TECHNISCH:', 'var(--tx)'],
    ['AANDACHTSPUNTEN:', '#f59e0b'],
    ['KOSTENRISICO:', '#ef4444'],
  ];
  let html = text.replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Labels staan altijd aan het begin van een regel. Anker daarop (^ multiline)
  // zodat een korter label (RISICO:, ADVIES:) niet binnen een langer label
  // (KOSTENRISICO:, INKOOPADVIES:) of binnen een al-ingevoegde span matcht.
  const sortedLabels = labels.slice().sort((a,b)=>b[0].length-a[0].length);
  sortedLabels.forEach(function(pair){
    var label = pair[0], color = pair[1];
    var escaped = label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    var re = new RegExp('^\\s*'+escaped, 'gim');
    html = html.replace(re, '<span style="font-weight:700;color:'+color+'">'+label+'</span>');
  });
  return '<div style="white-space:pre-wrap;line-height:1.6">'+html+'</div>';
}

// ── Auto-prefill kenteken vanuit bestaande vehicleInfo ──
document.addEventListener('DOMContentLoaded', ()=>{
  const savedKent = localStorage.getItem('pl_kenteken')||'';
  if(savedKent){
    const el = document.getElementById('koopKentInput');
    if(el) el.value = savedKent;
  }
});

// ══ EINDE KOOPCHECK MODULE ══
