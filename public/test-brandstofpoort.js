// Toetst de volgorde van brandstofPoort(): goedkoop vóór duur, en de
// gebruiker pas als laatste. De hele reden voor deze module is dat de
// brandstof vaststaat vóórdat pidGate() erop beslist.
const fs=require('fs');
let ok=0,fout=0;
function t(n,v,d){ if(v){ok++;console.log('  ok    '+n);} else {fout++;console.log('  FOUT  '+n+(d?' — '+d:''));} }

// ── de echte meetketen erbij (#116) ──────────────────────────────────
// brandstofPoort() pakte zijn 4151-antwoord zelf uit met indexOf. Sinds #116
// gaat dat door splitBatchResponse(), en die functie wordt hier UIT DE BRON
// geladen en niet nagebouwd: een eigen kopie kan per definitie niet rood
// worden en loopt uit de pas zonder dat iemand het ziet. De bytelengtes komen
// om dezelfde reden uit pidlane-data.js en niet uit een tabelletje hier.
// pidByteLen() is wél nagebouwd, met dezelfde reden als in test-parser.js: die
// woont in pidlane-rijsituatie.js, en die module hangt de halve app aan het
// scherm terwijl splitBatchResponse er alleen de tabelopzoeking van nodig heeft.
function laadMeetketen(){
  const dataSrc=fs.readFileSync('pidlane-data.js','utf8');
  const a=dataSrc.indexOf('window.PID_BYTE_LEN');
  const ha=dataSrc.indexOf('{',a), hb=dataSrc.indexOf('};',ha);
  if(a<0||ha<0||hb<0) throw new Error('PID_BYTE_LEN niet uit pidlane-data.js te knippen');
  global.PID_BYTE_LEN=eval('('+dataSrc.slice(ha,hb+1)+')');
  global.pidByteLen=function(sfx){ return global.PID_BYTE_LEN[String(sfx).toUpperCase()]||1; };
  const dsrc=fs.readFileSync('pidlane-diagbundel.js','utf8');
  const p=dsrc.indexOf('function splitBatchResponse'), q=dsrc.indexOf('function parsePID',p);
  if(p<0||q<0) throw new Error('splitBatchResponse niet uit pidlane-diagbundel.js te knippen');
  global.splitBatchResponse=eval('('+dsrc.slice(p,q)+')');
}
laadMeetketen();

function stel(opties){
  global.window={};
  global.vehicleInfo={merk:'',model:'',year:'',vin:'',brandstof:opties.brandstof||'',motor:''};
  global.pidVals=opties.pidVals||{};
  global.connected=opties.connected!==false;
  global.demoMode=!!opties.demo;
  global.__cmds=[];
  global.__gevraagd=false;
  global.sendCmd=async c=>{ global.__cmds.push(c); return opties.antwoord||'NO DATA'; };
  global.btDiag=()=>{};
  global.rdwLookup=async()=>{ global.vehicleInfo.brandstof=opties.rdwBrandstof||''; return {ok:!!opties.rdwBrandstof}; };
  global.document={getElementById:()=>({value:''}),createElement:()=>({style:{},querySelector:()=>({}),remove(){}}),
    body:{appendChild(){}},addEventListener(){},removeEventListener(){}};
  global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  global.vehicleFuelType=function(){
    const b=String(global.vehicleInfo.brandstof||'').toLowerCase();
    if(/diesel/.test(b)) return 'diesel';
    if(/benzine|petrol/.test(b)) return 'benzine';
    const ft=global.pidVals['0151'];
    if(typeof ft==='number'&&ft>=1){ if(ft===4||ft===11) return 'diesel'; if(ft<=10) return 'benzine'; }
    return 'onbekend';
  };
  // Alleen de poort-functies laden, niet de hele merge-laag.
  const src=fs.readFileSync('pidlane-voertuigdata.js','utf8');
  const vanaf=src.indexOf('async function brandstofPoort');
  eval(src.slice(vanaf).replace('window.brandstofPoort = brandstofPoort;',''));
  // _vraagKenteken vervangen: de test wil weten ÓF er gevraagd wordt.
  global.__vraag=()=>{ global.__gevraagd=true; return Promise.resolve(opties.kenteken||''); };
  return eval('(async()=>{ const _o=_vraagKenteken; _vraagKenteken=global.__vraag; const r=await brandstofPoort(); _vraagKenteken=_o; return r; })()');
}

(async()=>{
  let r=await stel({brandstof:'Benzine'});
  t('al bekend: geen commando, geen vraag', global.__cmds.length===0 && !global.__gevraagd, 'cmds='+global.__cmds.join(','));
  t('al bekend: type klopt', r.type==='benzine' && r.bron==='bekend');

  r=await stel({antwoord:'41 51 04'});
  t('onbekend: vraagt eerst 0151 aan de auto', global.__cmds[0]==='0151');
  t('0151=04 wordt diesel', r.type==='diesel' && r.bron==='obd', JSON.stringify(r));
  t('auto antwoordde: gebruiker niet lastiggevallen', !global.__gevraagd);
  t('0151 staat in pidVals voor de gate', global.pidVals['0151']===4);

  r=await stel({antwoord:'41 51 01'});
  t('0151=01 wordt benzine', r.type==='benzine');

  r=await stel({antwoord:'NO DATA', kenteken:'R054XD', rdwBrandstof:'Diesel'});
  t('auto zwijgt: dan pas het kenteken', global.__gevraagd);
  t('RDW vult de brandstof aan', r.type==='diesel' && r.bron==='rdw');

  r=await stel({antwoord:'NO DATA', kenteken:''});
  t('overslaan blokkeert niets', r.bron==='overgeslagen' && r.type==='onbekend');

  r=await stel({connected:false});
  t('geen verbinding: niets proberen', global.__cmds.length===0 && !global.__gevraagd);

  r=await stel({demo:true});
  t('demomodus: geen kentekenvraag', !global.__gevraagd);

  console.log('\n'+(ok+fout)+' toetsen, '+fout+' fout');
  process.exit(fout?1:0);
})();
