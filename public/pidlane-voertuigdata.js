// ══════════════════════════════════════════════════════════════════
// pidlane-voertuigdata.js
// Centrale voertuigdata-merge (VIN-WMI + NHTSA + RDW)
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
//  CENTRALE VOERTUIGDATA-MERGE (VIN-WMI + NHTSA + RDW)
//  Eén bron van waarheid. Elke bron schrijft via mergeVehicleData() i.p.v.
//  blind in vehicleInfo. Prioriteit per veld + normalisatie voorkomt dat
//  bronnen elkaar tegenwerken (bv. RDW 'MAZDA' die NHTSA 'Mazda' overschrijft,
//  of een lege brandstof die een goede waarde wist).
//  Bronrangorde per veld (hoog wint):
//    merk:      rdw > nhtsa > vin
//    model:     nhtsa > rdw
//    year:      rdw > nhtsa > vin
//    brandstof: rdw > nhtsa > vin
//    motor:     nhtsa > rdw
// ════════════════════════════════════════════════════════════════
const _SRC_RANK = { vin:1, nhtsa:2, rdw:3, user:4 };   // user = handmatige invoer, altijd leidend
const _FIELD_SRC_PREF = {
  merk:      { vin:1, nhtsa:2, rdw:3, user:4 },
  model:     { rdw:1, nhtsa:2, user:4 },
  year:      { vin:1, nhtsa:2, rdw:3, user:4 },
  brandstof: { vin:1, nhtsa:2, rdw:3, user:4 },
  motor:     { rdw:1, nhtsa:2, user:4 }
};
// Onthoudt met welke bron-rang elk veld is gevuld, zodat een zwakkere bron
// een sterkere niet overschrijft (per VIN/sessie).
let _vehSrc = {};
function resetVehicleSources(){ _vehSrc = {}; }

// Merknaam netjes: 'MAZDA' -> 'Mazda', 'MERCEDES-BENZ' -> 'Mercedes-Benz',
// 'BMW'/'MG'/'CX-5' blijven zoals gangbaar. Woord-voor-woord Title Case,
// maar korte all-caps merken (<=3 letters, bv BMW/MG/DS/KIA) blijven caps.
function normMerk(s){
  s = String(s||'').trim();
  if(!s) return '';
  return s.split(/\s+/).map(w=>{
    const letters = w.replace(/[^A-Za-z]/g,'');
    if(letters.length<=3 && letters===letters.toUpperCase()) return w; // BMW, MG, KIA
    return w.split('-').map(p=>p? p.charAt(0).toUpperCase()+p.slice(1).toLowerCase() : p).join('-');
  }).join(' ');
}
// Model ontdubbelen t.o.v. merk: "MAZDA CX-5" met merk "Mazda" -> "CX-5".
function dedupModel(model, merk){
  let m = String(model||'').trim();
  const mk = String(merk||'').trim();
  if(!m || !mk) return m;
  // strip een leidend merk-woord (case-insensitief) uit het model
  const re = new RegExp('^'+mk.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+','i');
  m = m.replace(re,'').trim();
  return m;
}
// Brandstof normaliseren naar de woorden die vehicleFuelType()/filters kennen.
function normBrandstof(s){
  const f = String(s||'').toLowerCase().trim();
  if(!f) return '';
  // Hybride EERST: combinatie elektrisch + verbrandingsbrandstof (RDW geeft bv.
  // "Elektriciteit/Benzine"). Anders vangt de benzine/diesel-check 'm onterecht.
  if(/hybride|hybrid|phev|hev/.test(f)) return 'hybride';
  if(/(elektr|electric|bev)/.test(f) && /(benzine|diesel|petrol|gasoline)/.test(f)) return 'hybride';
  if(/waterstof|hydrogen/.test(f)) return 'waterstof';
  if(/diesel|gasolie/.test(f)) return 'diesel';
  if(/benzine|petrol|gasoline|euro95|e10|essence/.test(f)) return 'benzine';
  if(/elektr|electric/.test(f)) return 'elektrisch';
  if(/lpg|cng|aardgas|gas/.test(f)) return 'lpg';
  return f;
}

// Kern: neem een veld over als (a) er een waarde is en (b) de bron minstens
// even sterk is als wat het veld nu vulde. Lege waarden overschrijven NOOIT.
function _setField(field, value, src){
  if(value===undefined || value===null) return;
  const v = String(value).trim();
  if(!v) return; // leeg wist nooit
  const pref = _FIELD_SRC_PREF[field] || _SRC_RANK;
  const newRank = pref[src] || 0;
  const curRank = _vehSrc[field] || 0;
  if(newRank < curRank) return; // zwakkere bron mag sterkere niet overschrijven
  vehicleInfo[field] = v;
  _vehSrc[field] = newRank;
}

// Publieke merge: verwerkt een databron in vehicleInfo met normalisatie.
function mergeVehicleData(src, data){
  if(!data) return;
  if(typeof vehicleInfo==='undefined' || !vehicleInfo) return;
  if(data.merk!==undefined)      _setField('merk',      normMerk(data.merk), src);
  if(data.year!==undefined)      _setField('year',      String(data.year||'').replace(/\D/g,'').slice(0,4), src);
  if(data.brandstof!==undefined){
    const _hadB=vehicleInfo.brandstof;
    _setField('brandstof', normBrandstof(data.brandstof), src);
    // Brandstof (nieuw) bekend of gewijzigd → actieve selectie her-filteren,
    // zodat diesel-fantomen (AdBlue/NOx/DPF) van een benzineauto verdwijnen.
    // Idem: purgeImplausiblePids() bestaat sinds ronde 5b niet meer. Deze
    // aanroep faalde stil, waardoor §11-punt 2 ("geen herijking van de
    // bronlijst") in de praktijk nooit is opgelost — ook al stond 5b als ✅.
    if(vehicleInfo.brandstof && vehicleInfo.brandstof!==_hadB){ try{ herijkPidGate('brandstoftype bekend: '+vehicleInfo.brandstof); }catch(e){} }
  }
  if(data.motor!==undefined)     _setField('motor',     data.motor, src);
  // Model NA merk zetten, zodat dedup het (net genormaliseerde) merk kent.
  if(data.model!==undefined)     _setField('model',     dedupModel(data.model, vehicleInfo.merk), src);
}

// ════════════════════════════════════════════════════════════════
//  GEBRUIKERS-VOERTUIGDATA (dossier) — handmatige invoer is LEIDEND
//  Persistent per voertuig (VIN of kenteken). Voedt de AI-prompts en
//  de volledigheids-% naast de voertuignaam in de topbar.
// ════════════════════════════════════════════════════════════════
function _uvdDefault(){
  return { km:'', beurt:'', distributie:'', bijz:'', merk:'', model:'', year:'', brandstof:'',
           sit:[], sitExtra:'', sitKg:'', sitPax:'', sitTs:0 };
}
let userVehicleData=_uvdDefault();
function _uvKey(){
  let k=''; try{ k=(vehicleInfo&&vehicleInfo.vin)||localStorage.getItem('pl_kenteken')||''; }catch(e){}
  return 'pl_uvd_'+(k||'onbekend');
}
function loadUserVehicleData(){
  // Altijd vanaf een SCHONE basis. Voorheen werd er over het oude object heen
  // gemerged: had auto B nog geen eigen opslag, dan bleven km, onderhoud en
  // bijzonderheden van auto A gewoon staan en gingen die mee de AI-prompt in.
  userVehicleData=_uvdDefault();
  try{ const s=localStorage.getItem(_uvKey()); if(s) userVehicleData={...userVehicleData,...JSON.parse(s)}; }catch(e){}
  if(!Array.isArray(userVehicleData.sit)) userVehicleData.sit=[];
  // Rijsituatie verloopt vanzelf: een caravanvlag van gisteren mag de analyse
  // van vandaag niet kleuren.
  try{
    const ttl=(typeof SITUATIE_TTL_MS!=='undefined'&&SITUATIE_TTL_MS)?SITUATIE_TTL_MS:43200000;
    if(userVehicleData.sit.length && userVehicleData.sitTs && (Date.now()-userVehicleData.sitTs)>ttl){
      userVehicleData.sit=[]; userVehicleData.sitTs=0;
      saveUserVehicleData();
      try{ log('Rijsituatie verlopen (>'+Math.round(ttl/3600000)+' u) — vlaggen automatisch gewist','info'); }catch(e){}
    }
  }catch(e){}
}
function saveUserVehicleData(){
  try{ localStorage.setItem(_uvKey(), JSON.stringify(userVehicleData)); }catch(e){}
}
function applyUserOverrides(){
  const u=userVehicleData||{}; const core={};
  ['merk','model','year','brandstof'].forEach(k=>{ if(String(u[k]||'').trim()) core[k]=u[k]; });
  if(Object.keys(core).length){ try{ mergeVehicleData('user',core); }catch(e){} }
}
function dossierPct(){
  const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
  const u=userVehicleData||{};
  const checks=[v.merk,v.model,v.year,v.brandstof,v.vin,u.km,u.beurt,u.distributie];
  const filled=checks.filter(x=>String(x||'').trim()).length;
  return Math.round(filled/checks.length*100);
}
function openVehicleOverview(){
  if(!featOn('feat_dossier')){ showToast?.('Functie uitgeschakeld door beheerder'); return; }
  loadUserVehicleData();
  const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
  let m=document.getElementById('vehOverview');
  if(!m){
    m=document.createElement('div'); m.id='vehOverview';
    m.style.cssText='position:fixed;inset:0;z-index:9700;background:rgba(10,14,23,.65);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center';
    m.addEventListener('click',e=>{ if(e.target===m) m.style.display='none'; });
    document.body.appendChild(m);
  }
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const inp=(id,val,ph)=>`<input id="${id}" value="${esc(val)}" placeholder="${ph||''}" style="width:100%;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--f);font-size:13px;padding:8px 10px">`;
  const row=(lbl,html)=>`<div style="margin-bottom:9px"><div style="font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:3px">${lbl}</div>${html}</div>`;
  const pct=dossierPct();
  m.innerHTML=`<div style="background:var(--sur);width:100%;max-width:560px;max-height:92vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--bd)">
      <b style="font-size:14px">🚗 Voertuigoverzicht</b>
      <span style="font-size:11px;font-weight:800;padding:2px 8px;border-radius:5px;background:${pct>=80?'rgba(0,168,107,.15)':'rgba(247,127,0,.15)'};color:${pct>=80?'var(--gn)':'var(--or)'}">📋 ${pct}% compleet</span>
      <button onclick="document.getElementById('vehOverview').style.display='none'" style="width:30px;height:30px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);cursor:pointer">✕</button>
    </div>
    <div style="overflow-y:auto;padding:14px 16px">
      <div style="font-size:11px;color:var(--tx3);margin-bottom:10px">Alle data die de app nu kent (RDW + VIN + eerdere invoer). Pas aan of vul aan — <b>jouw invoer is leidend</b> en weegt mee in elke AI-analyse.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
        ${row('Merk',inp('uvMerk',v.merk))}${row('Model',inp('uvModel',v.model))}
        ${row('Bouwjaar',inp('uvYear',v.year))}${row('Brandstof',inp('uvBrand',v.brandstof,'benzine / diesel / hybride / elektrisch'))}
      </div>
      ${row('VIN (uitgelezen)',`<div style="font-family:monospace;font-size:12px;color:var(--tx2);word-break:break-all">${esc(v.vin)||'—'}</div>`)}
      <div style="border-top:1px solid var(--bd);margin:6px 0 12px"></div>
      <div id="sitBlok"></div>
      <div style="border-top:1px solid var(--bd);margin:12px 0"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
        ${row('KM-stand (teller)',inp('uvKm',userVehicleData.km,'bv. 142500'))}
        ${row('Laatste onderhoudsbeurt',inp('uvBeurt',userVehicleData.beurt,'bv. 03-2026 / 135.000 km'))}
      </div>
      ${row('Distributieriem/-ketting',inp('uvDistr',userVehicleData.distributie,'bv. vervangen bij 120.000 km / n.v.t.'))}
      ${row('Bijzonderheden',`<textarea id="uvBijz" rows="2" style="width:100%;box-sizing:border-box;background:var(--sur2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--f);font-size:13px;padding:8px 10px;resize:vertical" placeholder="bv. schade linksvoor, nieuwe accu 2025">${esc(userVehicleData.bijz)}</textarea>`)}
    </div>
    <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--bd)">
      <button onclick="document.getElementById('vehOverview').style.display='none'" style="flex:1;padding:11px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font-family:var(--f);font-size:13px;font-weight:700;cursor:pointer">Sluiten</button>
      <button onclick="saveVehicleOverview()" style="flex:2;padding:11px;border-radius:9px;border:none;background:var(--bl);color:#fff;font-family:var(--f);font-size:13px;font-weight:800;cursor:pointer">💾 Opslaan</button>
    </div>
  </div>`;
  m.style.display='flex';
  try{ renderSituatie('sitBlok'); }catch(e){}
}
function saveVehicleOverview(){
  const g=id=>((document.getElementById(id)||{}).value||'').trim();
  // Kernvelden via de merge-laag met bron 'user' (hoogste prioriteit)
  try{ mergeVehicleData('user',{ merk:g('uvMerk'), model:g('uvModel'), year:g('uvYear'), brandstof:g('uvBrand') }); }catch(e){}
  userVehicleData.merk=g('uvMerk'); userVehicleData.model=g('uvModel');
  userVehicleData.year=g('uvYear'); userVehicleData.brandstof=g('uvBrand');
  userVehicleData.km=g('uvKm'); userVehicleData.beurt=g('uvBeurt');
  userVehicleData.distributie=g('uvDistr'); userVehicleData.bijz=g('uvBijz');
  // De rijsituatie slaat zichzelf al op bij elke tik, maar het vrije tekstveld
  // pakken we hier nog een keer op zodat er niets verloren gaat bij snel sluiten.
  try{ const se=document.getElementById('uvSitExtra'); if(se) userVehicleData.sitExtra=String(se.value||'').trim(); }catch(e){}
  saveUserVehicleData();
  try{
    const naam=`${vehicleInfo.merk||''} ${vehicleInfo.model||''}`.trim()||'Voertuig';
    showVtag(naam);
    const me=document.getElementById('vicMerk'); if(me) me.textContent=naam;
  }catch(e){}
  const m=document.getElementById('vehOverview'); if(m) m.style.display='none';
  showToast?.('✓ Voertuigdata opgeslagen — telt mee in analyses');
  try{ logUsage('dossier_update','pct='+dossierPct()); }catch(e){}
}
// Dossier-regel voor AI-prompts: gebruikersdata is leidend en weegt zwaar mee.
function _dossierPromptLine(){
  try{
    const u=userVehicleData||{}; const p=[];
    if(String(u.km||'').trim()) p.push('km-stand: '+u.km);
    if(String(u.beurt||'').trim()) p.push('laatste onderhoud: '+u.beurt);
    if(String(u.distributie||'').trim()) p.push('distributie: '+u.distributie);
    if(String(u.bijz||'').trim()) p.push('bijzonderheden: '+u.bijz);
    if(!p.length) return '';
    return '\nDOSSIER (door gebruiker bevestigd, LEIDEND): '+p.join('; ')+'. Weeg km-stand en onderhoudshistorie zwaar mee; goede live-waarden sluiten achterstallig onderhoud of hoge km zonder beurt NIET uit — benoem dat als risico.';
  }catch(e){ return ''; }
}

// ══════════════════════════════════════════════════════════════════
// BRANDSTOFPOORT — zorgt dat het brandstoftype bekend is vóórdat er
// beslissingen op worden genomen
// ══════════════════════════════════════════════════════════════════
// HET PROBLEEM
//
// pidGate() filtert fantoomsensoren weg op basis van vehicleFuelType():
// geen NOx/AdBlue op een benzineauto, geen lambda-trims op een diesel.
// initialHealthScan() beoordeelt élke PID en gebruikt die gate. Maar de
// volgorde in initConnection() was:
//
//     VIN → NHTSA → updateVehicleCard → initialHealthScan → wizard(kenteken)
//
// Het kenteken kwam dus ná de scan die het had moeten sturen. Bij een
// voertuig dat al eens is uitgelezen viel dat niet op: updateVehicleCard
// doet een automatische rdwLookup() op het opgeslagen kenteken, ruim vóór
// de scan. Alleen de eerste keer ging het mis — precies de keer dat het
// profiel wordt aangemaakt dat daarna hergebruikt wordt.
//
// WAAROM DE VIN HET NIET OPLOST
//
// tryReadVIN() decodeert via vpic.nhtsa.dot.gov, de Amerikaanse
// voertuigdatabase. Voor een Japanse of Europese auto levert die vaak
// alleen het merk. Dat verklaart waarom vehicleInfo op 17-08 op enkel
// "Mazda" bleef staan en op 18-08 compleet was: op 18-08 stond het
// kenteken in localStorage en deed de RDW het werk.
//
// DE VOLGORDE HIER
//
// Van goedkoop naar duur, en de gebruiker komt als laatste:
//
//   1. Al bekend uit VIN/NHTSA/RDW? Klaar, niets vragen.
//   2. PID 0151 uitlezen. Eén commando, ~150 ms, en de auto weet het
//      zelf. Dit lost het in de praktijk meestal op.
//   3. Pas dan het kenteken vragen, met een overslaan-knop die werkt.
//
// Stap 2 is geen nieuwe kennis: vehicleFuelType() viel al terug op
// pidVals['0151']. Alleen stond die waarde er tijdens de scan nog niet
// betrouwbaar in — dat hing af van de pollvolgorde. Nu wordt hij
// expliciet opgehaald op het moment dat hij nodig is.
async function brandstofPoort(){
  const nu = () => { try{ return vehicleFuelType(); }catch(e){ return 'onbekend'; } };

  if(nu() !== 'onbekend') return { bron:'bekend', type:nu() };
  if(typeof connected === 'undefined' || !connected) return { bron:'geen verbinding', type:'onbekend' };
  if(typeof demoMode !== 'undefined' && demoMode) return { bron:'demo', type:nu() };

  // ── 2. De auto zelf vragen ──
  try{
    const r = await sendCmd('0151', 2500);
    const h = String(r||'').replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
    const i = h.indexOf('4151');
    if(i >= 0){
      const code = parseInt(h.substr(i+4,2), 16);
      if(isFinite(code) && code >= 1){
        // In pidVals zetten: vehicleFuelType() leest die als terugval, dus
        // hiermee weten de gate en de health-scan het meteen.
        try{ if(typeof pidVals !== 'undefined' && pidVals) pidVals['0151'] = code; }catch(e){}
        const type = nu();
        if(type !== 'onbekend'){
          try{ btDiag('Brandstof uit de auto (0151='+code+'): '+type, 'ok'); }catch(e){}
          return { bron:'obd', type, code };
        }
      }
    }
    try{ btDiag('0151 gaf geen bruikbaar brandstoftype', 'warn'); }catch(e){}
  }catch(e){
    try{ btDiag('0151 uitlezen mislukt: '+(e.message||e), 'warn'); }catch(_){}
  }

  // ── 3. Het kenteken vragen ──
  // Alleen hier, en alleen als er nog niets anders werkte. Een vraag die je
  // stelt terwijl je het antwoord al hebt, leert mensen om weg te klikken.
  const kent = await _vraagKenteken();
  if(!kent) return { bron:'overgeslagen', type:'onbekend' };

  try{
    const inp = document.getElementById('kentInput');
    if(inp) inp.value = kent;
    const res = await rdwLookup();
    if(res && res.ok){
      try{ localStorage.setItem('pl_kenteken', kent); }catch(e){}
      const type = nu();
      try{ btDiag('Brandstof via RDW ('+kent+'): '+type, 'ok'); }catch(e){}
      return { bron:'rdw', type, kenteken:kent };
    }
  }catch(e){
    try{ btDiag('RDW-lookup mislukt: '+(e.message||e), 'warn'); }catch(_){}
  }
  return { bron:'rdw-mislukt', type:nu() };
}

// Klein invoerscherm. Bewust géén plBevestig: dat is ja/nee, hier is een
// waarde nodig. Overslaan staat er even duidelijk bij als opzoeken — wie
// geen Nederlands kenteken heeft moet niet vast komen te zitten.
function _vraagKenteken(){
  return new Promise(function(klaar){
    let af = false;
    const sluit = function(waarde){
      if(af) return; af = true;
      try{ document.removeEventListener('keydown', esc); }catch(e){}
      try{ ov.remove(); }catch(e){}
      klaar(waarde || '');
    };
    const esc = function(e){ if(e.key === 'Escape') sluit(''); };

    const ov = document.createElement('div');
    ov.id = 'brandstofPoortOv';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10025;background:rgba(8,11,17,.975);' +
      'display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div style="width:100%;max-width:400px;background:var(--sur,#131926);border:1px solid var(--bd,#28324a);' +
        'border-radius:14px;padding:18px">' +
        '<div style="font-size:16px;font-weight:800;color:var(--tx,#eef2fa);margin-bottom:4px">' +
          'Benzine of diesel?</div>' +
        '<div style="font-size:12px;color:var(--tx2,#9aa6bd);line-height:1.55;margin-bottom:12px">' +
          'Deze auto geeft zijn brandstoftype niet prijs, en de VIN-database kent hem niet. ' +
          'Met het kenteken haalt PidLane het bij de RDW op.<br><br>' +
          'Zonder deze gegevens worden er sensoren getoond die deze auto niet heeft — ' +
          'roetfilter op een benzinemotor, of lambdatrims op een diesel.</div>' +
        '<input id="bpKent" placeholder="Kenteken" maxlength="8" autocomplete="off" ' +
          'style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;' +
          'border:1px solid var(--bd,#28324a);background:var(--sur2,#1b2333);color:var(--tx,#eef2fa);' +
          'font:600 15px var(--f);text-transform:uppercase;letter-spacing:.06em;text-align:center">' +
        '<button id="bpOk" style="width:100%;margin-top:10px;background:var(--ac,#4d82ff);color:#fff;border:0;' +
          'border-radius:9px;padding:12px;font:700 14px var(--f);cursor:pointer">Opzoeken bij de RDW</button>' +
        '<button id="bpSkip" style="width:100%;margin-top:7px;background:var(--sur2,#1b2333);' +
          'color:var(--tx2,#9aa6bd);border:1px solid var(--bd,#28324a);border-radius:9px;padding:11px;' +
          'font:600 13px var(--f);cursor:pointer">Overslaan — geen Nederlands kenteken</button>' +
      '</div>';
    document.body.appendChild(ov);

    const veld = ov.querySelector('#bpKent');
    const lees = function(){
      return String(veld.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    };
    ov.querySelector('#bpOk').onclick = function(){
      const k = lees();
      if(k.length < 4){ veld.style.borderColor = 'var(--rd,#ff5a5a)'; return; }
      sluit(k);
    };
    ov.querySelector('#bpSkip').onclick = function(){ sluit(''); };
    veld.addEventListener('keydown', function(e){ if(e.key === 'Enter') ov.querySelector('#bpOk').click(); });
    document.addEventListener('keydown', esc);
    try{ veld.focus(); }catch(e){}
  });
}

window.brandstofPoort = brandstofPoort;
