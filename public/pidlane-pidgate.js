// ══════════════════════════════════════════════════════════════════
// pidlane-pidgate.js
// De PID-gate: mag deze PID mee, wanneer wordt dat opnieuw gevraagd,
// en wie mag er in activePIDs schrijven. Zie PIDLANE.md §15.
// Afgesplitst uit pidlane-auth.js (ronde 7, 01-08-2026) — die was de
// login/adminmodule en had hier niets te zoeken. Gedragsneutrale
// verplaatsing: het blok hieronder is byte-identiek aan wat er stond.
// Classic script: geen module, geen IIFE — globals blijven globaal.
//
// Laadt direct NA pidlane-auth.js: daar staan activePIDs, manualPIDs,
// pidVals en _pidHealth. Niets hier draait bij het laden, dus de volgorde
// telt alleen voor de leesbaarheid — maar hou hem zo.
// ══════════════════════════════════════════════════════════════════

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
// ── Turbo-detectie: drempels ──────────────────────────────────────────
// Bijstellen na een rit; zie PIDLANE.md §15 voor de meetgegevens waarop deze
// waarden zijn gekozen. Bewust hier bovenaan en niet verstopt in de functie.
const MAP_BEWIJS_KPA   = 85;    // vanaf deze inlaatdruk staat de gasklep ver open
const MAP_BEWIJS_MIN   = 10;    // zoveel van zulke metingen voor een oordeel
const MAP_ATMOSF_MAX   = 106;   // piek hieronder = nooit boost = geen turbo
const MAP_MOTOR_RPM    = 300;   // daaronder draait de motor niet

// Houdt de hoogst gemeten inlaatdruk bij → bewijs of er turbo is.
let _maxMapSeen = 0, _mapSamples = 0;

// Zegt deze meting íets over boost? Stationair draaien zegt niets: ook een
// turbomotor zit dan rond 30-40 kPa, ruim onder omgevingsdruk. Alleen bij een
// ver geopende gasklep laat een turbo zien dat hij eroverheen gaat.
//
// Het bewijs zit in de MAP-waarde zelf: een hoge inlaatdruk BETEKENT dat de
// gasklep ver open staat. Daar is geen tweede PID voor nodig — en dat is maar
// goed ook, want 010B, 0111 en 0104 lopen op verschillende intervallen
// (1071 / 428 / 3570 ms op de CX-5). Kruisverwijzen naar pidVals['0111']
// leest dan een gasklepstand van een ander moment dan de drukmeting.
//
// Toerental wél meelezen, want dat verandert traag genoeg: contact aan met
// stilstaande motor geeft ~101 kPa (geen onderdruk) en dat zou anders als
// bewijs voor "atmosferisch" tellen.
function _mapBewijsMoment(m){
  if(m < MAP_BEWIJS_KPA) return false;
  const r = (typeof pidVals!=='undefined') ? pidVals['010C'] : undefined;
  return typeof r==='number' && r > MAP_MOTOR_RPM;
}

function _noteMap(){
  const m = (typeof pidVals!=='undefined') ? pidVals['010B'] : undefined;
  if(typeof m!=='number' || m <= 0 || m >= 300) return;
  if(m > _maxMapSeen) _maxMapSeen = m;                  // piek: altijd bijhouden
  if(_mapBewijsMoment(m)) _mapSamples++;                // bewijs: alleen hoge druk
}

// Atmosferisch = genoeg metingen bij ver geopende gasklep én piek bleef onder
// omgevingsdruk. Te weinig bewijs → geen oordeel, dus geen filter. Veilige
// kant: liever een boost-tegel te veel op een atmosferische motor dan een
// ontbrekende tegel op een turbo.
function _isNaturallyAspirated(){
  if(_mapSamples < MAP_BEWIJS_MIN) return false;
  return _maxMapSeen <= MAP_ATMOSF_MAX;
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

// ══════════════════════════════════════════════════════════════════
// PID-GATE — één ladder, vijf treden, één beslisplek
// ══════════════════════════════════════════════════════════════════
// "Mag deze PID mee" bleek niet één vraag maar vijf, die verspreid over
// acht plekken in wisselende combinaties stonden. Dát is de motor achter
// het jojo-patroon: een fix raakt één plek, de rest valt terug.
//
// De treden zijn CUMULATIEF — elke trede bevat de vorige. Daardoor kun je
// niet meer per ongeluk een strengere check op een lager niveau zetten.
//
//   plausibel → past bij dit voertuig (brandstof, turbo, bank 2)
//   bestaat   → + is een sensor, geen ondersteuningsbitmap
//   kiesbaar  → + levert iets (health niet 'onzin'/'nodata')
//   duidbaar  → + echte naam en eenheid, geen rauwe PID
//   meetbaar  → + heeft nú een verse waarde
//
// "Meldt de auto hem" (supportedPIDs) zit BEWUST niet in de ladder: dat is
// een orthogonale vraag en maar één aanroepplek stelt hem.
//
// De vlag in `opt`:
//   force   bewuste noodklep ("Toon alles"): slaat de health-trede over, zodat
//           de gebruiker een sensor die niets levert tóch kan kiezen. Hoort
//           alleen bij handmatige selectie — nooit richting analyse of rapport.
function pidGate(pid, niveau, opt){
  opt = opt || {};

  // 1 — plausibel
  if(!vehiclePlausiblePid(pid)) return false;
  if(niveau==='plausibel') return true;

  // 2 — bestaat
  if(typeof GEEN_SENSOR_PIDS!=='undefined' && GEEN_SENSOR_PIDS.has(pid)) return false;
  if(niveau==='bestaat') return true;

  // 3 — kiesbaar
  if(!opt.force){
    // 'twijfel' mag hier BEWUST door: de analyses gebruiken twijfelachtige
    // sensoren wél, met een waarschuwing uit buildQualityReport. Wat niet
    // meetelt is een sensor die niets levert ('nodata') of onzin ('onzin').
    const h=(typeof _pidHealth!=='undefined')?_pidHealth[pid]:undefined;
    if(h==='onzin'||h==='nodata') return false;
  }
  if(niveau==='kiesbaar') return true;

  // 4 — duidbaar
  const d=getPidDef(pid);
  if(!d) return false;
  if(d.unit==='raw') return false;
  if(typeof d.name==='string' && /^PID\s/i.test(d.name)) return false;
  if(niveau==='duidbaar') return true;

  // 5 — meetbaar
  const v=(typeof pidVals!=='undefined')?pidVals[pid]:undefined;
  if(v===undefined||v===null) return false;
  return true;
}

// ══════════════════════════════════════════════════════════════════
// HERIJKING — de gate opnieuw stellen zodra de voertuigkennis verandert
// ══════════════════════════════════════════════════════════════════
// pidGate() is geen zuivere functie van de PID, maar van (PID, huidige
// kennis). En die kennis komt binnendruppelen: het brandstoftype pas als RDW
// antwoordt, turbo pas na genoeg belaste MAP-metingen, uitlaat-fantomen pas
// als de motor warm genoeg is. De bronlijst werd één keer gebouwd — tijdens
// initialHealthScan(), op het moment dat er nog bijna niets bekend was — en
// daarna nooit meer. Gevolg: een AdBlue-tegel op een benzineauto verdween wel
// uit activePIDs, maar bleef gewoon in de keuzelijst staan.
//
// Volgorde is hier de kern: EERST de bronlijst herbouwen, DAN pas de selectie
// filteren. Andersom filter je de selectie tegen een verouderde lijst en komt
// het fantoom bij de volgende opbouw gewoon terug.
function herijkPidGate(reden){
  const weg=[];
  try{
    // 1 — bronlijst opnieuw bouwen tegen de kennis van nú
    try{ if(typeof buildDiscoveredPIDList==='function') buildDiscoveredPIDList(); }catch(e){}

    // 2 — pas daarna de actieve selectie opschonen
    if(typeof activePIDs==='undefined') return 0;
    activePIDs.forEach(pid=>{ if(!pidGate(pid,'plausibel')) weg.push(pid); });
    weg.forEach(pid=>{ activePIDs.delete(pid); try{ manualPIDs.delete(pid); }catch(e){} });

    // 3 — beeld bijwerken
    try{ renderGauges(); }catch(e){}
    try{ rebuildGSel(); }catch(e){}
    try{ const cnt=document.getElementById('pidCnt'); if(cnt) cnt.textContent=activePIDs.size; }catch(e){}
    if(weg.length){
      try{ log('🚫 '+weg.length+' sensor(en) verborgen — niet aanwezig op dit voertuig ('+vehicleFuelType()+')','info'); }catch(e){}
    }
    if(reden){ try{ btDiag('Herijking PID-gate: '+reden+(weg.length?` → ${weg.length} weg`:' → geen wijziging'),'info'); }catch(e){} }
  }catch(e){}
  return weg.length;
}

// ══════════════════════════════════════════════════════════════════
// TOEVOEGPOORT — de enige deur naar activePIDs (ronde 6)
// ══════════════════════════════════════════════════════════════════
// De gate gaf het juiste ANTWOORD (ronde 1-4) en de herijking stelde hem op
// het juiste MOMENT (ronde 5). Wat nog ontbrak is de derde vraag: wie mag er
// eigenlijk schrijven. Vier plekken zetten ongefilterd iets in activePIDs en
// konden dat ná een herijking doen — daarom kon de zeef in renderGauges()
// niet weg.
//
// Deze functie is die deur. Wat er niet doorheen komt, komt er niet in.
//
//   pidToevoegen('0170')                        één PID, trede 'kiesbaar'
//   pidToevoegen(lijst,{force:_showAllPIDs})    handmatige keuze met noodklep
//   pidToevoegen(lijst,{handmatig:false})       niet als eigen keuze onthouden
//
// manualPIDs wordt bewust NIET opnieuw gefilterd door de aanroepers: wat
// daarin staat is al een keer door deze deur gekomen, en herijkPidGate()
// haalt het eruit zodra het niet meer klopt. Zou je het wél elke keer
// opnieuw toetsen, dan verdwijnt een sensor die de gebruiker met "Toon
// alles" bewust aanzette bij de eerstvolgende analyse alsnog.
//
// Terug komt {ok:[...], weg:[...]}: ok = staat nu in activePIDs, weg =
// geweigerd. Die tweede is er zodat de aanroeper kan uitleggen waarom er
// niets gebeurde, in plaats van stil te falen.
function pidToevoegen(pids, opt){
  opt = opt || {};
  const niveau    = opt.niveau || 'kiesbaar';
  const handmatig = opt.handmatig !== false;
  const force     = !!opt.force;
  const ok = [], weg = [];
  if(typeof activePIDs==='undefined') return {ok, weg};
  const lijst = (typeof pids==='string') ? [pids] : [...(pids||[])];
  lijst.forEach(pid=>{
    if(typeof pid!=='string' || !pid) return;
    if(!pidGate(pid, niveau, {force})){ weg.push(pid); return; }
    activePIDs.add(pid);
    if(handmatig){ try{ manualPIDs.add(pid); }catch(e){} }
    ok.push(pid);
  });
  return {ok, weg};
}

// ── Wanneer moet er herijkt worden? ────────────────────────────────────
// Niet bij elke meting — dan bouwt de lijst zich tientallen keren per minuut
// opnieuw op en flikkert het beeld. Wél zodra een van de invoeren van
// vehiclePlausiblePid() verandert. Die zijn met z'n drieën in één stempel te
// vangen; verandert de stempel, dan is herijken nodig en anders niet.
//
// 'ooitWarm' is bewust een grendel. Zonder grendel klapt de stempel heen en
// weer bij elke keer dat de motor uitgaat, met een herbouw per keer.
let _plausStempel='', _ooitWarm=false, _herijkVuil=false;

function _maakPlausStempel(){
  try{ if(_engineWarmRunning()) _ooitWarm=true; }catch(e){}
  let ft=''; try{ ft=vehicleFuelType()||''; }catch(e){}
  let na=false; try{ na=_isNaturallyAspirated(); }catch(e){}
  return ft+'|'+(na?'atmosferisch':'onbekend')+'|'+(_ooitWarm?'warm':'koud');
}

// Iets veranderde dat niet in de stempel zit — bijvoorbeeld een PID die van
// 'nodata' naar 'ok' is bijgewerkt. Zet de vlag; de eerstvolgende tick herijkt.
function markeerHerijking(){ _herijkVuil=true; }

// Wordt vanuit updPID() aangeroepen, dus bij élke meting. Daarom goedkoop
// gehouden: één stempel maken en één stringvergelijking. Alleen als er echt
// iets veranderd is volgt de dure herbouw.
function plHerijkTick(){
  try{
    const s=_maakPlausStempel();
    if(s===_plausStempel && !_herijkVuil) return false;
    const eersteKeer=(_plausStempel==='');
    _plausStempel=s; _herijkVuil=false;
    // Eerste meting van de sessie: alleen de stempel vastleggen. De bronlijst
    // wordt vlak daarna toch door initialHealthScan() opgebouwd.
    if(eersteKeer) return false;
    herijkPidGate('kennis gewijzigd → '+s);
    return true;
  }catch(e){ return false; }
}

// Mag deze sensor in een rapport/momentopname? Filtert naamloze 'raw'-PIDs
// (PID 01XX zonder parser), fysiek-onmogelijke/niet-aanwezige waarden en
// aandrijflijn-fantoomsensoren (diesel/SCR op benzine). Zo bevat het rapport
// alleen sensoren met een echte naam en een betrouwbare waarde.
function isReportableSensor(pid){
  return pidGate(pid,'meetbaar');
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

// ── einde gate-blok ───────────────────────────────────────────────
// Beide tests (test-pidgate.js, test-herijking.js) knippen hun code
// letterlijk uit dit bestand. test-herijking.js pakt alles tussen
// 'function _engineWarmRunning' en de regel hierboven. Verplaats je iets,
// verplaats dan ook die knippaden — anders faalt de test met "niet
// gevonden" in plaats van met een echte regressie.
