// ══════════════════════════════════════════════════════════════════
// pidlane-auth.js
// Login, tokens, admin-paneel, gebruikersbeheer
// Afgesplitst uit index.html (opsplitsronde 2026-07-28). Classic script:
// geen module, geen IIFE — globals blijven globaal voor inline handlers.
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// 🔐 LOGIN & CONFIG
// Laad uit config.js als beschikbaar, anders fallback hier
// ══════════════════════════════════════════════════════

// Fallback — werkt als config.js niet laadt
// USERS wordt overschreven door config.js als die wel laadt
// Wachtwoorden staan als SHA-256-hash (passHash), nooit meer plaintext.
if(typeof USERS === 'undefined'){
  // SECURITY: geen admin-hash in de client — niet in index.html én niet in
  // config.js. Echte accounts leven uitsluitend in de Worker (secret USERS_JSON)
  // en worden via POST /auth/login gecontroleerd. Deze lokale tabel is puur een
  // offline-vangnet en bevat alleen Demo.
  window.USERS = {
    'Demo':  { passHash: '2a97516c354b68848cdbd8f54a226a0a55b21ed138e207ad6c5cbb9c00aa5aea', apiKey: '', role: 'demo', label: 'Demo' } // wachtwoord: demo
  };
}

// SHA-256 van een string als hex. Vereist secure context (https / capacitor) —
// dat zijn GitHub Pages én de APK-WebView allebei.
async function sha256hex(s){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

// ══════════════════════════════════════════════════════════════════
// 🔑 SERVER-LOGIN (Cloudflare Worker)
// Wachtwoord-hashes staan NIET meer in de client. De Worker controleert het
// wachtwoord tegen zijn eigen secrets en geeft een ONDERTEKEND, tijdelijk
// sessietoken terug. Dat token gaat als X-App-Token mee naar élke proxy-route
// (AI, RDW, Airtable) en verloopt vanzelf. Een gestolen token is dus beperkt
// geldig en er staat niets geheims meer in config.js of index.html.
// ══════════════════════════════════════════════════════════════════
const TOK_KEY='pl_tok';

function tokLoad(){
  try{
    const t=JSON.parse(localStorage.getItem(TOK_KEY)||'null');
    if(!t||!t.token||!t.exp) return null;
    if(Date.now() >= t.exp*1000){ localStorage.removeItem(TOK_KEY); return null; }
    return t;
  }catch(e){ return null; }
}
function tokSave(t){
  try{ localStorage.setItem(TOK_KEY, JSON.stringify(t)); }catch(e){}
  window.APP_TOKEN = t.token;
}
function tokClear(){
  try{ localStorage.removeItem(TOK_KEY); }catch(e){}
  window.APP_TOKEN = '';
}

// Vraagt de Worker om een sessietoken. Retourneert:
//   object  = gelukt   ({token, exp, user, role, label})
//   null    = verkeerde gebruikersnaam/wachtwoord
//   throw   = server/netwerk onbereikbaar (→ lokale fallback)
async function serverLogin(user, pass){
  const base = (typeof PROXY_URL!=='undefined' && PROXY_URL) ? String(PROXY_URL).replace(/\/$/,'') : '';
  if(!base) throw new Error('PROXY_URL ontbreekt');
  const r = await fetch(base+'/auth/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({user:String(user||''), pass:String(pass||'')})
  });
  if(r.status===401) return null;
  if(!r.ok){
    // Worker-foutcode meenemen zodat doLogin de ÉCHTE oorzaak kan tonen
    // i.p.v. een misleidend "wachtwoord onjuist" via de lokale fallback.
    let code=''; try{ code=(await r.json())?.error||''; }catch(_){}
    const e = new Error('login-server gaf '+r.status+(code?' ('+code+')':''));
    e.status = r.status; e.code = code;
    throw e;
  }
  const j = await r.json();
  if(!j || !j.token) throw new Error('ongeldig antwoord van login-server');
  return j;
}

let currentUser = null;

// Centrale admin-check. LET OP: `let currentUser` maakt GEEN window.currentUser
// aan — daarom faalden alle checks op `window.currentUser` altijd ("Alleen voor
// admin" ondanks admin-login). doLogin/logout zetten window.currentUser nu
// expliciet, en élke admin-check loopt via deze ene helper (hoofdletter-ongevoelig).
function isAdmin(){
  try{
    const u = window.currentUser || currentUser;
    return !!(u && String(u.role||'').toLowerCase()==='admin');
  }catch(e){ return false; }
}
window.isAdmin = isAdmin;

async function doLogin(){
  let user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const err  = document.getElementById('loginErr');

  // ── STAP 1: server-login (Worker) ──────────────────────────────
  // Dit is de normale weg. Alleen als de Worker onbereikbaar is vallen we
  // terug op de lokale USERS-tabel — die bevat uitsluitend het Demo-account.
  err.textContent = '…';
  try{
    const s = await serverLogin(user, pass);
    if(s === null){
      err.textContent = '⚠ Gebruikersnaam of wachtwoord onjuist';
      document.getElementById('loginPass').value = '';
      document.getElementById('loginPass').focus();
      return;
    }
    tokSave(s);
    err.textContent = '';
    finishLogin(s.user || user, { role: s.role || 'user', label: s.label || s.user || user, apiKey: '' });
    try{ log('Server-login ok — sessie geldig tot '+new Date(s.exp*1000).toLocaleString('nl-NL'),'ok'); }catch(e){}
    return;
  }catch(e){
    // Configuratiefouten van de Worker NIET maskeren met de lokale fallback —
    // dat gaf "wachtwoord onjuist" terwijl het probleem server-side zat.
    if(e && e.code==='no_session_secret'){
      err.textContent='⚠ Worker mist secret SESSION_SECRET — zet die in Cloudflare en deploy';
      return;
    }
    if(e && e.status===429){
      err.textContent='⚠ Te veel loginpogingen — wacht 1 minuut';
      return;
    }
    if(e && e.status>=500){
      err.textContent='⚠ Login-server fout: '+(e.code||e.status)+' — check Worker-secrets (USERS_JSON / SESSION_SECRET)';
      return;
    }
    // Écht onbereikbaar (netwerk/offline) → door naar lokale fallback (Demo).
    try{ log('Login-server onbereikbaar ('+(e?.message||e)+') — alleen lokale accounts','warn'); }catch(_){}
  }
  err.textContent = '';

  // ── STAP 2: lokale fallback (offline / Demo) ───────────────────
  // Tolerante login: eerst exacte match; anders hoofdletter-ongevoelig op de
  // sleutel of het label, waarbij spaties en underscores gelijkwaardig zijn.
  // Zo werken "nico"/"Nico" en "Autobedrijf Pieters"/"Autobedrijf_Pieters"
  // allebei. Het wachtwoord blijft exact (hoofdlettergevoelig).
  const _norm=s=>String(s||'').trim().toLowerCase().replace(/[\s_]+/g,'');
  const _key=Object.keys(USERS).find(k=>k===user)
         || Object.keys(USERS).find(k=>_norm(k)===_norm(user))
         || Object.keys(USERS).find(k=>_norm(USERS[k].label||'')===_norm(user));
  const account = _key ? USERS[_key] : undefined;
  if(_key) user=_key;   // canonieke sleutel gebruiken voor sessie/logs

  // Wachtwoordcontrole: passHash (SHA-256, nieuw) heeft voorrang; accounts die
  // nog niet gemigreerd zijn vallen terug op het oude plaintext password-veld.
  let passOk = false;
  try{
    if(account){
      if(account.passHash){
        passOk = (await sha256hex(pass)) === String(account.passHash).trim().toLowerCase();
      } else if(account.password){
        passOk = (account.password === pass);
      }
    }
  }catch(e){
    err.textContent = '⚠ Login-fout: '+(e?.message||e);
    return;
  }
  if(!account || !passOk){
    err.textContent = '⚠ Login-server onbereikbaar — offline werkt alleen Demo/demo';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginPass').focus();
    return;
  }
  err.textContent = '';
  finishLogin(user, account);
}

// Alles ná geslaagde wachtwoordcontrole. Apart zodat het sessieherstel dit
// direct kan aanroepen zonder wachtwoord (de gebruiker is op dit apparaat
// al eens geverifieerd) — met hashes kán het wachtwoord niet meer worden
// teruggelezen uit USERS.
function finishLogin(user, account){
  // Login geslaagd
  currentUser = {name: user, ...account};
  window.currentUser = currentUser; // expliciet — `let` maakt geen window-property aan
  // Rol: 'user' = alleen basisfuncties; 'admin' (default) = alles
  document.body.classList.toggle('role-user',(account.role||'admin')==='user');
  try{ localStorage.setItem('pl_session', user); }catch(e){} // sessie onthouden over herlaads heen

  // API key instellen — via window zodat het altijd beschikbaar is
  // Voorrang: handmatig ingevoerde key op login-scherm > account-key
  const manualKey = (document.getElementById('loginApiKey')?.value || '').trim();
  if(manualKey && manualKey.startsWith('sk-ant-')){
    window.anthropicKey = manualKey;
    try{ localStorage.setItem('ns_api_key', manualKey); }catch(e){}
    log('API key handmatig ingevoerd voor '+user,'ok');
  } else if(account.apiKey && account.apiKey.startsWith('sk-ant-')){
    window.anthropicKey = account.apiKey;
    try{ localStorage.setItem('ns_api_key', account.apiKey); }catch(e){}
    log('API key geladen voor '+user,'ok');
  } else {
    window.anthropicKey = '';
    log('AI via proxy actief — sleutel staat veilig server-side','ok');
  }

  // Login scherm sluiten, connect modal openen
  // Inlogscherm vervaagt, verbindscherm komt op — de golfachtergrond blijft
  // staan zodat het één doorlopend scherm lijkt in plaats van twee losse.
  // De achtergrond gaat pas uit als het verbindscherm sluit (zie closeConnOv).
  (function(){
    const lo=document.getElementById('loginOv');
    if(lo) lo.classList.add('lg-leave');
    setTimeout(()=>{ if(lo){ lo.classList.add('hidden'); lo.classList.remove('lg-leave'); } }, 260);
  })();
  document.getElementById('connOv').classList.remove('hidden');

  // Verberg API key veld in connect modal — niet nodig na login
  const apiRow = document.getElementById('connApiRow');
  if(apiRow) apiRow.style.display = 'none';

  // Toon gebruikersnaam in topbar
  const lbl=document.getElementById('userLabel');
  if(lbl){ lbl.textContent=`👤 ${user}`; lbl.style.display='block'; }

  updateApiPill();
  log(`Ingelogd als ${user} (${account.role})`,'ok');
  try{
    const _v=(typeof APP_VERSION!=='undefined')?APP_VERSION:'?';
    log('Config geladen: v'+_v+' \u2014 '+Object.keys(USERS).length+' gebruikers','info');
  }catch(e){}
  log('Klik "Verbinden" of "Demo modus" om te starten.','info');

  // Remote config NU pas ophalen. Bij boot bestond het sessietoken nog niet,
  // dus die eerste poging kon 401 opleveren. Hier is het token gegarandeerd
  // gezet: zowel de verse login (tokSave -> finishLogin) als het herstel van
  // een onthouden sessie (window.APP_TOKEN=_tok.token -> finishLogin) zetten
  // het ervoor. Zonder deze aanroep bereiken de admin-toggles de app nooit.
  try{ loadRemoteConfig(); }catch(e){}

  // Admin krijgt ALTIJD de beste (crash-vaste) live-log — geen drempel.
  try{
    if((account.role||'admin')==='admin'){
      liveLogStart({silent:true});
      log('🛠 Admin: crash-vaste live-log automatisch actief','ok');
    }
  }catch(e){}

  // Proxy-modus: test de AI-keten via de proxy (sleutel staat server-side)
  testApiKey();
}

async function testApiKey(){
  // Zelfde key-prioriteit als apiFetch
  let key = '';
  try{
    if(currentUser && typeof USERS!=='undefined' && USERS[currentUser?.name||currentUser]?.apiKey?.startsWith('sk-ant-')){
      key = USERS[currentUser?.name||currentUser].apiKey;
    }
  }catch(e){}
  if(!key) key = window.anthropicKey||'';
  if(!key) try{ key=localStorage.getItem('ns_api_key')||''; }catch(e){}

  const keyStart=key?.slice(0,15)||'(leeg)';
  log(`API test — key: ${keyStart}... (${key.length} tekens)`,'info');

  // Proxy-modus: geen sk-ant- sleutel meer nodig in de app — de Worker houdt 'm server-side.

  try{
    const resp=await fetch(PROXY_URL+'/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-App-Token':APP_TOKEN
      },
      body:JSON.stringify({
        model:'claude-sonnet-5',
        max_tokens:20,
        system:'Reply only: yes',
        messages:[{role:'user',content:'ping'}],
        thinking:{ type:'disabled' }
      })
    });
    if(resp.ok){
      const data=await resp.json();
      const reply=(extractAIText(data)||'').trim();
      log(`API key OK ✅ — antwoord: "${reply}"`,'ok');
      // Sla werkende key op
      window.anthropicKey=key;
      try{localStorage.setItem('ns_api_key',key);}catch(e){}
      const pill=document.getElementById('apiPill');
      if(pill){pill.textContent='🤖 AI-sleutel ✓';pill.className='api-pill kebab-item set';}
    } else {
      const errData=await resp.json().catch(()=>({}));
      const errMsg=errData?.error?.message||`HTTP ${resp.status}`;
      log(`API key fout (${resp.status}): ${errMsg}`,'err');
      const pill=document.getElementById('apiPill');
      if(pill){pill.textContent='🤖 AI-sleutel ❌';pill.className='api-pill kebab-item unset';}
    }
  }catch(e){
    log('API netwerk fout: '+e.message,'warn');
  }
}

// ── Extra logfunctie (admin-only) ──────────────────────
// Vinkje op het inlogscherm: verschijnt alleen als een admin-account
// is ingetypt. Staat het aan, dan wordt bij uitloggen automatisch de
// volledige gebundelde log gedownload. Keuze onthouden in localStorage.
function refreshAdminLogRow(){
  const row=document.getElementById('loginAdminLogRow');
  if(!row) return;
  const typed=(document.getElementById('loginUser')?.value||'').trim().toLowerCase();
  let isAdminName=false;
  try{
    for(const name in USERS){
      if(name.toLowerCase()===typed && (USERS[name].role||'admin')==='admin'){ isAdminName=true; break; }
    }
  }catch(e){}
  row.style.display = isAdminName ? 'block' : 'none';
  const cb=document.getElementById('adminLogExport');
  if(cb){ try{ cb.checked = localStorage.getItem('pl_admin_logexport')==='1'; }catch(e){} }
}
function saveAdminLogExport(){
  const cb=document.getElementById('adminLogExport');
  try{ localStorage.setItem('pl_admin_logexport', (cb&&cb.checked)?'1':'0'); }catch(e){}
  if(cb&&cb.checked){ try{ maybeStartLiveLog(); }catch(e){} }
}

async function logout(){
  // Admin logt uit → ALTIJD eerst vragen of de volledige log bewaard moet
  // worden. Pas daarna uitloggen. De vraag wordt gesteld vóór het wissen van
  // currentUser/voertuigdata zodat de geëxporteerde log compleet is.
  // (Het oude inlog-vinkje 'Extra logfunctie' is hiermee vervallen.)
  try{
    if(currentUser?.role==='admin'){
      const bewaar = window.confirm(
        'Uitloggen als admin.\n\n'+
        'Volledige log (Bluetooth + app + scan) opslaan vóór je uitlogt?\n\n'+
        'OK = log opslaan/delen, daarna uitloggen\n'+
        'Annuleren = direct uitloggen zonder opslaan'
      );
      if(bewaar){
        log('🛠 Log wordt bewaard/gedeeld vóór uitloggen','info');
        // Live-log actief? Stop netjes (flush) en deel dat bestand. Anders een
        // eenmalige gebundelde export. Await zodat opslaan/delen klaar is vóór
        // we de verbinding verbreken en de sessie wissen.
        if(localStorage.getItem('pl_livelog')==='1' || _liveLog.active){
          await liveLogStop({share:true});
        } else {
          exportAllLogs();
        }
      } else {
        log('Uitgelogd zonder log op te slaan','info');
      }
    }
  }catch(e){ try{ log('Log opslaan bij uitloggen mislukt: '+(e.message||e),'warn'); }catch(_){} }
  currentUser = null;
  window.currentUser = null;
  tokClear();                                       // sessietoken ongeldig maken
  try{ localStorage.removeItem('pl_session'); }catch(e){}
  try{ localStorage.removeItem('pl_appstate'); }catch(e){} // sessiestaat niet meenemen naar volgende login
  window.anthropicKey = '';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginErr').textContent = '';
  closeConnOv();
  document.getElementById('loginOv').classList.remove('hidden');
  try{ document.getElementById('lgWaveBg').classList.remove('off'); }catch(e){} // golfachtergrond terug bij uitloggen
  handleConnect(); // verbreek verbinding
}

// ══════════════════════════════════════════════════════
// ⚙️ CONFIGURATIE — zie config.js
// ════════════════════════════════════════
// DATA
// ════════════════════════════════════════
// → PIDS verplaatst naar pidlane-data.js

// ── VOERTUIG-PLAUSIBILITEIT ─────────────────────────────────────────
// Aandrijflijn-specifieke sensoren bestaan niet op elk voertuig. Een benzine-
// auto heeft geen DPF/roetfilter/AdBlue/NOx/SCR — maar de ECU antwoordt soms
// tóch met een dummy-waarde op die PIDs (zo verschenen 'Afgastemp dieselfilter',
// 'NOx doseerpomp' en 'AdBlue injectiedruk' op een Mazda SkyActiv-G benzine).
// We filteren ze ALLEEN weg als we zeker weten dat het voertuig ze niet heeft;
// bij onbekend brandstoftype verbergen we niets.
/* 27-07-2026 — deze lijst was te kort: op een benzineauto verschenen tóch
   NOx-sensoren, AdBlue-injectiedruk en roetfilterwaarden. Nu afgeleid uit de
   definities zelf (alles wat NOx, AdBlue, SCR, DPF, roetfilter of partikel
   heet), zodat er niets meer doorheen glipt.
   0186D is er bewust UIT: dat is brandstofraildruk-regeling en die zit óók op
   benzine met directe inspuiting — jouw CX-5 levert hem gewoon. */
const DIESEL_SCR_PIDS=new Set(['0169','016A','016B','016E','017C','017D','017E','0187','0188','0189','018A','018C','018E','018F','0190','0191','0195','0196','01A4']);
// Verbrandingsmotor-specifieke sensoren: bestaan NIET op een volledig
// elektrisch voertuig (geen brandstoftrim, lambda/O2, MAF, brandstofdruk/-peil,
// EGR, inlaatdruk, ontstekingstiming). Bij 'elektrisch' filteren we die weg.
const EV_AFWEZIGE_PIDS=new Set([
  '0106','0107','0108','0109', // brandstoftrim kort/lang B1/B2
  '0114','0115','0116','0117','0118','0119','011A','011B', // O2/lambda sensoren
  '0124','0125','0126','0127','0128','0129','012A','012B', // breedband lambda
  '0134','0135','0136','0137','0138','0139','013A','013B', // breedband lambda stroom
  '010A','010B','010E','010F','0110','0111','012F','015E','012C', // brandstofdruk, inlaatdruk, timing, inlaatlucht-temp, MAF, gasklep, brandstofpeil, verbruik, EGR
  '0151' // brandstoftype (n.v.t.)
]);
function vehicleFuelType(){
  const b=((typeof vehicleInfo!=='undefined'&&vehicleInfo&&vehicleInfo.brandstof)||'').toString().toLowerCase();
  if(b){
    // Hybride heeft een verbrandingsmotor mét trim/lambda → niet als 'puur
    // elektrisch' behandelen. Alleen volledig elektrisch zet die sensoren uit.
    const hybride=/hybr|phev|hev/.test(b);
    if(!hybride && /elektr|electric|\bev\b|bev/.test(b)) return 'elektrisch';
    if(/diesel|gasolie/.test(b)) return 'diesel';
    if(/benzine|petrol|gasoline|lpg|cng|alcohol|ethanol|waterstof|hybr|phev|hev/.test(b)) return 'benzine';
  }
  // Fallback wanneer RDW-data ontbreekt: live OBD brandstoftype (PID 0151).
  // 4=diesel, 11=bifuel-diesel; 1-3/5-10 = niet-diesel (geen DPF/SCR).
  const ft=(typeof pidVals!=='undefined')?pidVals['0151']:undefined;
  if(typeof ft==='number'&&ft>=1){
    if(ft===4||ft===11) return 'diesel';
    if(ft<=10) return 'benzine';
  }
  return 'onbekend';
}
// Aandrijflijn-fantomen: sensoren die de ECU wél beantwoordt maar die op dit
// voertuig fysiek niet bestaan — turbo/tussenkoeler op een atmosferische motor,
// of een tweede bank op een 1-bank motor. De waarde verraadt ze: onmogelijk
// koud/negatief, of een koude "bank 2" terwijl bank 1 gloeiend heet is.
// → _B1B2_PAIR verplaatst naar pidlane-data.js
function _engineWarmRunning(){
  const c=(typeof pidVals!=='undefined')?pidVals['0105']:undefined;
  const r=(typeof pidVals!=='undefined')?pidVals['010C']:undefined;
  return (typeof c==='number'&&c>60)&&(typeof r==='number'&&r>300);
}
function _powertrainPhantom(pid){
  const d=getPidDef(pid); if(!d||d.cat!=='Temp') return false;
  const v=(typeof pidVals!=='undefined')?pidVals[pid]:undefined;
  if(typeof v!=='number') return false;
  const nm=String(d.name||'');
  const turboIC=/Turbo temp|Tussenkoeler temp/.test(nm);
  const exhaustCat=/Uitlaatgas temp|Katalysator temp/.test(nm);
  if(!turboIC&&!exhaustCat) return false;
  // 1) Fysiek onmogelijk koud voor uitlaat/kat/turbo/tussenkoeler → placeholder
  if(v<=-10) return true;
  // 2) Bank-2 koud terwijl bank-1 heet = niet-bestaande tweede bank
  const b1=_B1B2_PAIR[pid];
  if(b1!==undefined){
    const bv=(typeof pidVals!=='undefined')?pidVals[b1]:undefined;
    if(typeof bv==='number'&&bv>150&&v<bv-120) return true;
  }
  // 3) Warm draaiende motor maar uitlaat/kat onder 80°C = geen echte sensor
  if(exhaustCat&&_engineWarmRunning()&&v<80) return true;
  return false;
}
// Boost/laaddruk-PID's die alleen zin hebben op een motor met turbo/compressor.
const BOOST_PIDS = new Set(['0170','2102','0187']);
// Houdt de hoogst gemeten inlaatdruk bij → bewijs of er turbo is.
let _maxMapSeen = 0, _mapSamples = 0;
function _noteMap(){
  const m = (typeof pidVals!=='undefined') ? pidVals['010B'] : undefined;
  if(typeof m==='number' && m>0 && m<300){ _mapSamples++; if(m>_maxMapSeen) _maxMapSeen=m; }
}
// Atmosferisch = genoeg MAP-metingen én piek bleef onder ~106 kPa (nooit boost).
// Onbekend (te weinig data) → niet als atmosferisch bestempelen (geen filter).
function _isNaturallyAspirated(){
  if(_mapSamples < 8) return false;      // te weinig bewijs → geen aanname
  return _maxMapSeen <= 106;             // nooit boven omgevingsdruk → geen turbo
}
function _boostPhantom(pid){
  if(!BOOST_PIDS.has(pid)) return false;
  return _isNaturallyAspirated();        // boost-sensor op atmosferische motor = onzin
}

// true = sensor past bij dit voertuig (of brandstoftype onbekend → toelaten)
function vehiclePlausiblePid(pid){
  const ft=vehicleFuelType();
  if(ft==='benzine' && DIESEL_SCR_PIDS.has(pid)) return false;
  if(ft==='elektrisch' && EV_AFWEZIGE_PIDS.has(pid)) return false; // EV heeft geen trim/lambda/MAF/etc.
  if(_powertrainPhantom(pid)) return false;
  if(_boostPhantom(pid)) return false;   // turbo/laaddruk op atmosferische motor
  return true;
}

// Her-filter: verwijder fantoomsensoren uit de actieve selectie zodra het
// brandstoftype (alsnog) bekend wordt. Bij verbinden is brandstof vaak nog
// onbekend → alles toegelaten; RDW levert 'benzine' pas later. Zonder deze
// purge bleven AdBlue/NOx/DPF-tegels dan gewoon staan.
function purgeImplausiblePids(){
  try{
    _noteMap();   // MAP-piek bijhouden voor turbo/atmosferisch-detectie
    if(typeof activePIDs==='undefined') return 0;
    const weg=[];
    activePIDs.forEach(pid=>{ if(!vehiclePlausiblePid(pid)) weg.push(pid); });
    if(!weg.length) return 0;
    weg.forEach(pid=>{ activePIDs.delete(pid); try{ manualPIDs.delete(pid); }catch(e){} });
    try{ renderGauges(); }catch(e){}
    try{ rebuildGSel(); }catch(e){}
    try{ const cnt=document.getElementById('pidCnt'); if(cnt) cnt.textContent=activePIDs.size; }catch(e){}
    try{ log('🚫 '+weg.length+' sensor(en) verborgen — niet aanwezig op dit brandstoftype ('+vehicleFuelType()+')','info'); }catch(e){}
  }catch(e){}
  return 0;
}

// Mag deze sensor in een rapport/momentopname? Filtert naamloze 'raw'-PIDs
// (PID 01XX zonder parser), fysiek-onmogelijke/niet-aanwezige waarden en
// aandrijflijn-fantoomsensoren (diesel/SCR op benzine). Zo bevat het rapport
// alleen sensoren met een echte naam en een betrouwbare waarde.
function isReportableSensor(pid){
  const d=getPidDef(pid);
  if(!d) return false;
  if(d.unit==='raw') return false;
  if(typeof d.name==='string' && /^PID\s/i.test(d.name)) return false;
  if(typeof pidVals!=='undefined' && pidVals[pid]===undefined) return false;
  const h=(typeof _pidHealth!=='undefined')?_pidHealth[pid]:undefined;
  if(h==='onzin'||h==='nodata') return false;
  if(!vehiclePlausiblePid(pid)) return false;
  return true;
}

// Centrale PID-definitie lookup: eerst ontdekte PIDs, dan volledige database,
// dan de klassieke vaste lijst. Vervangt 9 losse PIDS.find() aanroepen die
// nieuwe PIDs stilletjes lieten vallen in gauges, grafieken en AI-analyses.
function getPidDef(pid){
  return (typeof discoveredPIDDefs!=='undefined'&&Array.isArray(discoveredPIDDefs)&&discoveredPIDDefs.find(d=>d.pid===pid))
      || (typeof ALL_PID_DEFS!=='undefined'&&ALL_PID_DEFS[pid])
      || PIDS.find(p=>p.pid===pid)
      || null;
}

// Harde validatiegrens per PID (buiten = onzin, weggooien)
// → PID_HARD_LIMITS verplaatst naar pidlane-data.js

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
      if(verdacht && sensorCat){
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

// → MODELS verplaatst naar pidlane-data.js
// → MOTORS verplaatst naar pidlane-data.js
const YEARS=Array.from({length:22},(_,i)=>(2024-i).toString());

// → DTCDB verplaatst naar pidlane-data.js

// ── UITGEBREIDE STANDAARD OBD2 PID DEFINITIES ──
// Incl. fabrikant-specifieke PIDs (mode 21/22)
// → PIDS_EXTRA verplaatst naar pidlane-data.js

// ════════════════════════════════════════
// STATE
// ════════════════════════════════════════
let port=null, reader=null, writer=null, connected=false, demoMode=false;
let activePIDs=new Set(), pidVals={}, pidHist={}, pidSmooth={};
// ── P4: handmatige PID-keuzes scheiden van analyse-toevoegingen ──
// manualPIDs = door de gebruiker zelf aangevinkte sensoren; die blijven
// altijd staan, ook als een analyse de set naar zijn eigen profiel reset.
let manualPIDs=new Set();
// ── P5: per-PID poll-scheduler — wanneer elk PID weer aan de beurt is ──
let _pidNextPoll={};            // pid -> ms-timestamp wanneer weer pollen
// ── Idee 5: klacht-gestuurde focus — PIDs tijdelijk op hoog tempo ──
let _focusPIDs=new Set();       // deze PIDs krijgen het snelste interval
// ── Idee 1/2/3: sessie-stats verzameld tijdens de huidige rit ──
let _sessionStats={};           // pid -> {n,sum,min,max,last}
let dtcCodes=[], pollTimer=null, graphPID=null;
let checkAnswers={}, checkResults=[];
let diagCauses=[], selectedCause=null;
let selectedProto='0';
if(!window.anthropicKey) window.anthropicKey=''; // Niet overschrijven als login al key heeft gezet

// Globale foutafhandeling — crashes zichtbaar in log ipv stil falen
window.addEventListener('unhandledrejection', e=>{
  const msg = e.reason?.message || String(e.reason) || 'Onbekende fout';
  console.error('Unhandled promise rejection:', msg);
  try{ log('App fout: '+msg,'err'); }catch(le){}
  try{ btDiag('Crash: '+msg,'err'); }catch(be){}
  try{ liveLogFlush(); }catch(fe){}
  e.preventDefault(); // Voorkom app crash
});
window.addEventListener('error', e=>{
  const msg = e.message || 'Onbekende fout';
  console.error('Global error:', msg);
  try{ log('Script fout: '+msg,'err'); }catch(le){}
  try{ liveLogFlush(); }catch(fe){}
});
let dataStable=false, stabilityCount={};
let slCollapsed=false, srCollapsed=false;
let isDark=false, currentZoom=1.0, currentFont=13;

// ════════════════════════════════════════
// DEMO DATA GENERATOR
// ════════════════════════════════════════
const _ds={};
// Scenario-override (admin-only, demo-modus): handmatig gezette PID-waarden,
// DTC-codes en voertuiggegevens om de beoordeling/het rapport te testen.
// Alles wat hier gezet wordt, wordt in de UI als "MANUEEL" gelabeld.
let _scenario={ enabled:false, pids:{}, dtcs:[], vehicle:null };
function demo(pid){
  const d=getPidDef(pid); if(!d) return null;
  // ── SCENARIO-OVERRIDE (admin, demo-modus) ──
  // Heeft de admin voor deze PID handmatig een waarde gezet? Gebruik die,
  // met lichte ruis eromheen zodat het realistisch oogt i.p.v. kaarsrecht.
  if(_scenario.enabled && _scenario.pids[pid]!==undefined){
    const base=_scenario.pids[pid];
    const r=(d.max-d.min)||Math.abs(base)||1;
    let v=base+(Math.random()-.5)*r*0.012;   // ±0.6% ruis
    v=Math.max(d.min,Math.min(d.max,v));
    return Math.round(v*100)/100;
  }
  if(_ds[pid]===undefined) _ds[pid]=(d.min+d.max)/2;
  const r=d.max-d.min;
  _ds[pid]+=(Math.random()-.5)*r*.03;
  _ds[pid]=Math.max(d.min,Math.min(d.max,_ds[pid]));

  // ── Mazda CX-5 2018 2.0 SkyActiv-G — realistische rijsimulatie ──
  const t=Date.now();
  const rijcyclus=Math.sin(t/8000);  // langzame rijcyclus

  // Motor
  if(pid==='010C') _ds[pid]=800+(rijcyclus*0.5+0.5)*900+Math.random()*40; // 800-1740 RPM — gezonde stadsrit, blijft boven stationair
  if(pid==='010D') _ds[pid]=Math.max(0,45+rijcyclus*35+Math.random()*5); // 10-80 km/h
  if(pid==='0104') _ds[pid]=Math.max(5,22+rijcyclus*28+Math.random()*5); // 5-50% belasting
  if(pid==='0111') _ds[pid]=Math.max(5,18+rijcyclus*22+Math.random()*4); // gasklep 5-40%
  if(pid==='0149') _ds[pid]=Math.max(2,15+rijcyclus*20+Math.random()*5); // gaspedaal
  if(pid==='010E') _ds[pid]=8+rijcyclus*6+Math.random()*2;               // timing 2-14°
  if(pid==='010B') _ds[pid]=98+rijcyclus*12+Math.random()*3;             // MAP 86-110 kPa
  if(pid==='010F') _ds[pid]=22+Math.sin(t/30000)*5;                      // IAT 17-27°C

  // MAF — realistisch voor 2.0L
  if(pid==='0110') _ds[pid]=Math.max(2,8+rijcyclus*14+Math.random()*2);  // 2-22 g/s

  // Temperatuur
  if(pid==='0105') _ds[pid]=89+Math.sin(t/20000)*4+Math.random()*1;      // koelwater 85-93°C
  if(pid==='015C') _ds[pid]=95+Math.sin(t/25000)*8;                      // olie 87-103°C warmer
  if(pid==='0146') _ds[pid]=19+Math.sin(t/60000)*3;                      // buiten 16-22°C

  // Brandstof
  if(pid==='012F') _ds[pid]=68;                                           // tank 68% vol
  if(pid==='015E') _ds[pid]=Math.max(0.5,6.5+rijcyclus*4+Math.random()); // verbruik 2.5-10.5 L/h
  if(pid==='0106') _ds[pid]=(Math.random()-.5)*4;                        // STFT ±2%
  if(pid==='0107') _ds[pid]=1.5+Math.random()*2;                         // LTFT +1.5-3.5%
  if(pid==='010A') _ds[pid]=330+Math.random()*10;                        // brandstofdruk 330 kPa

  // O2 sensoren — moderne auto (Mazda CX-5): B1S1 upstream is BREEDBAND.
  // De smalband-spanning B1S1 = PID 0114 staat daarom dood/plat (~0.05V); de
  // echte B1S1-waarde komt van breedband 0124 in lambda. 0115 (B1S2 na-kat) is
  // wél smalband. 0113 is GEEN spanning maar de "O2-sensoren aanwezig"-bitmap.
  if(pid==='0114') _ds[pid]=0.05+Math.random()*0.02;                    // smalband B1S1 upstream afwezig/plat
  if(pid==='0113') _ds[pid]=51;                                         // bitmap: sensoren aanwezig (0x33)
  if(pid==='0124') _ds[pid]=1.0+Math.sin(t/2500)*0.06+Math.random()*0.01;// breedband B1S1 ~1.00 λ
  if(pid==='0134') _ds[pid]=1.0+Math.sin(t/2500)*0.06;                   // idem (stroom-variant)
  if(pid==='0115') _ds[pid]=0.72+Math.sin(t/4000)*.05;                   // O2 B1S2 stabiel ~0.72V

  // Electrisch
  if(pid==='0142') _ds[pid]=13.9+Math.sin(t/4000)*.2+Math.random()*.1;   // accu 13.7-14.1V
  if(pid==='0143') _ds[pid]=Math.max(5,22+rijcyclus*28);                  // abs belasting

  // Emissie/overig
  if(pid==='0133') _ds[pid]=101+Math.random()*.5;                        // barometer ~101 kPa
  if(pid==='012C') _ds[pid]=Math.max(0,12+rijcyclus*8);                  // EGR 4-20%

  return Math.round(_ds[pid]*100)/100;
}

// ════════════════════════════════════════
// GOOGLE SHEETS LOGGING
// ════════════════════════════════════════
// 🔄 AUTO-UPDATE SYSTEEM — VERWIJDERD (21-07-2026). Klanten krijgen
// updates voortaan per mail met changelog; geen banner/versie-check meer.
// APP_VERSION (config.js) blijft in gebruik voor logging + loginscherm.

function showToast(msg, duration=3000){
  document.getElementById('pidToast')?.remove();
  const t=document.createElement('div');
  t.id='pidToast';
  t.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:12px 20px;border-radius:10px;font-family:var(--f);font-size:13px;z-index:9999;max-width:80%;text-align:center;white-space:pre-line;box-shadow:0 4px 20px rgba(0,0,0,.3);';
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), duration);
}

// ════════════════════════════════════════
// AIRTABLE LOGGING
// ════════════════════════════════════════
// AIRTABLE_TOKEN, AIRTABLE_BASE, AIRTABLE_TABLE, AIRTABLE_URL → config.js

// Buffer — stuur in batches van max 10 om rate limit te vermijden
const _atBuffer=[];
let _atTimer=null;

// Lichte usage-event helper bovenop logToSheets — geen nieuwe Airtable-kolommen
// nodig, hergebruikt Type='usage' + Message. Best-effort, faalt nooit hardop.
function logUsage(action, detail){
  try{ logToSheets('usage', `${action}${detail?': '+detail:''}`); }catch(e){}
}

async function logToSheets(type, message, extra={}){
  // Controleer of Airtable geconfigureerd is. NB: verzending loopt via de
  // Worker (X-App-Token) — de Airtable-token hoort server-side en de client
  // gate op AIRTABLE_TOKEN is vervallen (die schakelde logging stil uit
  // zodra config.js geen token meer bevat — wat juist de bedoeling is).
  if(typeof AIRTABLE_URL==='undefined'||!AIRTABLE_URL) return;
  try{
    const v=vehicleInfo||{};
    _atBuffer.push({
      fields:{
        Timestamp:  new Date().toISOString(),
        Type:       String(type||'info'),
        Message:    String(message||'').slice(0,500),
        Merk:       String(v.merk||''),
        Year:       String(v.year||''),
        VIN:        String(v.vin||''),
        Protocol:   String(selectedNetwork?.name||''),
        ActivePIDs: [...(activePIDs||[])].join(' '),
        AppVersion: String(typeof APP_VERSION!=='undefined'?APP_VERSION:'2.1'),
        User:       String(currentUser?.name||''),
        Role:       String(currentUser?.role||''),
      }
    });
    clearTimeout(_atTimer);
    _atTimer=setTimeout(flushAirtable, 3000);
  }catch(e){}
}

async function flushAirtable(){
  if(!_atBuffer.length) return;
  if(typeof AIRTABLE_URL==='undefined'||!AIRTABLE_URL) return;
  const batch=_atBuffer.splice(0,10);
  try{
    const resp=await fetch(AIRTABLE_URL,{
      method:'POST',
      headers:{
        'X-App-Token':APP_TOKEN,
        'Content-Type':'application/json'
      },
      // Airtable verwacht: {"records":[{"fields":{...}},{"fields":{...}}]}
      body:JSON.stringify({records:batch,typecast:true})
    });
    if(!resp.ok){
      const err=await resp.json().catch(()=>({}));
      console.warn('Airtable fout:',resp.status,err?.error?.message||'');
      // Zet terug in buffer bij fout
      _atBuffer.unshift(...batch);
    }
  }catch(e){
    console.warn('Airtable netwerk fout:',e.message);
    // Netwerkfout: batch niet weggooien maar terugzetten (was: stil verlies)
    _atBuffer.unshift(...batch);
  }
  // FIX: cap tegen onbegrensde groei als Airtable lang onbereikbaar is
  while(_atBuffer.length>200) _atBuffer.shift();
  // FIX: opnieuw inplannen — voorheen bleef een mislukte/resterende batch
  // hangen tot de vólgende log-event; nu wordt er vanzelf opnieuw geprobeerd.
  if(_atBuffer.length){ clearTimeout(_atTimer); _atTimer=setTimeout(flushAirtable, 15000); }
}

// ════════════════════════════════════════
//  BUGMELDER — Airtable (Type=bug) + e-mail-fallback
// ════════════════════════════════════════
function _bugDiag(){
  let android='?', plat='web', native=false;
  try{ const c=window.Capacitor; native=!!c?.isNativePlatform?.(); plat=c?.getPlatform?.()||'web';
    const m=navigator.userAgent.match(/Android\s+([\d.]+)/); if(m) android=m[1]; }catch(e){}
  const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
  let conn='onbekend';
  try{ if(typeof isConnected!=='undefined') conn=isConnected?'verbonden':'niet verbonden'; }catch(e){}
  let lastErr='';
  try{ lastErr=(_btLog||[]).filter(l=>l.type==='err'||l.type==='warn').slice(-3).map(l=>l.msg).join(' | '); }catch(e){}
  return {
    device:`${plat}${native?' APK':' browser'} · Android ${android}`,
    app:String(typeof APP_VERSION!=='undefined'?APP_VERSION:'?'),
    user:String((typeof currentUser!=='undefined'&&currentUser?.name)||''),
    role:String((typeof currentUser!=='undefined'&&currentUser?.role)||''),
    merk:String(v.merk||''), model:String(v.model||''), year:String(v.year||''), vin:String(v.vin||''),
    voertuig:[v.merk,v.model,v.year].filter(Boolean).join(' ')||'—',
    protocol:String((typeof selectedNetwork!=='undefined'&&selectedNetwork?.name)||'—'),
    conn, lastErr
  };
}

function openBugReport(){
  try{ const m=document.getElementById('btLogModal'); if(m) m.style.display='none'; }catch(e){}
  try{ if(typeof closeKebab==='function') closeKebab(); }catch(e){}
  const d=_bugDiag();
  let ov=document.getElementById('bugModal');
  if(!ov){ ov=document.createElement('div'); ov.id='bugModal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9700;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(ov); }
  ov.innerHTML=`
    <div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;max-width:520px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--bd)">
        <strong style="font-size:15px">🐞 Meld een bug</strong>
        <button onclick="document.getElementById('bugModal').style.display='none'" style="border:none;background:none;color:var(--tx3);font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px">
        <div style="font-size:12px;color:var(--tx3);line-height:1.5;background:var(--sur2);border:1px solid var(--bd);border-radius:8px;padding:8px 10px">
          📎 Automatisch meegestuurd: ${d.device} · app ${d.app} · ${d.voertuig} · ${d.protocol} · ${d.conn}
        </div>
        <div>
          <label style="font-size:13px;font-weight:700;display:block;margin-bottom:5px">Wat ging er mis? *</label>
          <textarea id="bugDesc" rows="3" placeholder="Beschrijf de bug…" style="width:100%;padding:10px;background:var(--sur2);border:1.5px solid var(--bd2);border-radius:8px;font-size:13px;color:var(--tx);outline:none;resize:vertical;box-sizing:border-box"></textarea>
        </div>
        <div>
          <label style="font-size:13px;font-weight:700;display:block;margin-bottom:5px">Hoe kunnen we het nadoen?</label>
          <textarea id="bugRepro" rows="3" placeholder="Stap 1… Stap 2… Wat gebeurde er, en wat verwachtte je?" style="width:100%;padding:10px;background:var(--sur2);border:1.5px solid var(--bd2);border-radius:8px;font-size:13px;color:var(--tx);outline:none;resize:vertical;box-sizing:border-box"></textarea>
        </div>
        <div id="bugMsg" style="font-size:12px;min-height:16px"></div>
        <div style="display:flex;gap:8px">
          <button onclick="submitBugReport(this)" style="flex:1;padding:11px;border-radius:9px;border:none;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;font-size:14px;font-weight:800;cursor:pointer">Verstuur</button>
          <button onclick="bugEmailFallback()" title="Open je e-mail naar support" style="padding:11px 12px;border-radius:9px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx2);font-size:13px;font-weight:700;cursor:pointer">✉ E-mail</button>
        </div>
      </div>
    </div>`;
  ov.style.display='flex';
  setTimeout(()=>{ try{ document.getElementById('bugDesc').focus(); }catch(e){} },50);
}

async function submitBugReport(btn){
  const desc=(document.getElementById('bugDesc')?.value||'').trim();
  const repro=(document.getElementById('bugRepro')?.value||'').trim();
  const msgEl=document.getElementById('bugMsg');
  if(!desc){ if(msgEl){ msgEl.style.color='var(--rd)'; msgEl.textContent='Vul eerst een korte beschrijving in.'; } return; }
  const d=_bugDiag();
  if(btn){ btn.disabled=true; btn.textContent='Versturen…'; }
  const rec={ fields:{
    Timestamp:new Date().toISOString(), Type:'bug', Message:desc.slice(0,500),
    Repro:repro.slice(0,2000), Device:d.device, AppVersion:d.app,
    User:d.user, Role:d.role, Merk:d.merk, Model:d.model, Year:d.year, VIN:d.vin,
    Protocol:d.protocol, DTC:(d.lastErr||'').slice(0,500)
  }};
  let ok=false;
  try{
    if(typeof AIRTABLE_URL!=='undefined' && AIRTABLE_URL){
      const resp=await fetch(AIRTABLE_URL,{ method:'POST',
        headers:{'X-App-Token':(typeof APP_TOKEN!=='undefined'?APP_TOKEN:''),'Content-Type':'application/json'},
        body:JSON.stringify({records:[rec],typecast:true}) });
      ok=resp.ok;
    }
  }catch(e){ ok=false; }
  if(ok){
    if(msgEl){ msgEl.style.color='var(--gn)'; msgEl.textContent='✓ Bug gemeld — bedankt!'; }
    try{ if(typeof showToast==='function') showToast('🐞 Bug gemeld, bedankt!',3000); }catch(e){}
    setTimeout(()=>{ try{ document.getElementById('bugModal').style.display='none'; }catch(e){} },1200);
  }else{
    if(msgEl){ msgEl.style.color='var(--or)'; msgEl.innerHTML='Verzenden lukte niet. Gebruik de <b>✉ E-mail</b>-knop om het naar support te sturen.'; }
    if(btn){ btn.disabled=false; btn.textContent='Opnieuw'; }
  }
}

function bugEmailFallback(){
  const desc=(document.getElementById('bugDesc')?.value||'').trim();
  const repro=(document.getElementById('bugRepro')?.value||'').trim();
  const d=_bugDiag();
  const body=
'-- Bugmelding PidLane --\n\n'+
'Wat ging er mis:\n'+(desc||'(niet ingevuld)')+'\n\n'+
'Hoe na te doen:\n'+(repro||'(niet ingevuld)')+'\n\n'+
'-- Automatische info --\n'+
'App: '+d.app+'\n'+
'Toestel: '+d.device+'\n'+
'Gebruiker: '+d.user+' ('+d.role+')\n'+
'Voertuig: '+d.voertuig+'\n'+
'Protocol: '+d.protocol+'\n'+
'Verbinding: '+d.conn+'\n'+
'Laatste fouten: '+(d.lastErr||'—');
  const url='mailto:support@pidlane.nl?subject='+encodeURIComponent('PidLane bug - '+(desc.slice(0,50)||'melding'))+'&body='+encodeURIComponent(body);
  try{ window.location.href=url; }catch(e){ try{ window.open(url,'_blank'); }catch(_){} }
}

// ════════════════════════════════════════
// API KEY UI
// ════════════════════════════════════════
// ════════════════════════════════════════
// API KEY UI
// ════════════════════════════════════════
function updateApiPill(){
  const p=document.getElementById('apiPill'); if(!p) return;
  // Proxy-modus: AI loopt via de Worker (sleutel server-side) -> altijd beschikbaar.
  if(typeof PROXY_URL!=='undefined' && PROXY_URL){
    p.textContent='🤖 AI ✓ (proxy)';
    p.className='api-pill kebab-item set';
    return;
  }
  const hasKey=window.anthropicKey?.startsWith('sk-ant-');
  p.textContent=hasKey?'🤖 AI-sleutel ✓':'🤖 AI-sleutel';
  p.className='api-pill kebab-item '+(hasKey?'set':'unset');
}

const localLog=[];
function log(msg,type=''){
  const bar=document.getElementById('logbar');
  const ts=new Date().toTimeString().slice(0,8);
  const row=document.createElement('div'); row.className='le';
  row.innerHTML=`<span class="lt2">${ts}</span><span class="lm ${type}">${msg}</span>`;
  bar.appendChild(row); bar.scrollTop=bar.scrollHeight;
  while(bar.children.length>100) bar.removeChild(bar.firstChild);
  localLog.push({ts,type,msg});
  try{ liveLogWrite(`[${ts}] [${(type||'info').toUpperCase()}] ${msg}`); }catch(e){}
  if(localLog.length>500) localLog.shift();
  if(type==='err')  logToSheets('error',  msg);
  if(type==='warn'&&msg.includes('buiten')||msg.includes('sprong')||msg.includes('outlier')) logToSheets('outlier',msg);
}
function downloadLog(){
  const v=vehicleInfo||{};
  const lines=[`PidLane — Log`,`Datum: ${new Date().toLocaleString('nl')}`,`Voertuig: ${v.merk||'?'} ${v.year||''} ${v.vin||''}`,'',...localLog.map(l=>`[${l.ts}][${l.type||'info'}] ${l.msg}`)];
  download('newspeedy-log.txt',lines.join('\n'));
}
