// Rooktest voor pidlane-start.js: rendert het in alle drie de toestanden
// zonder browser? Een fout in de opbouw is anders pas op het startscherm zichtbaar.
const fs=require('fs');
let ok=0,fout=0;
function t(naam,voorwaarde,detail){ if(voorwaarde){ok++;console.log('  ok    '+naam);} else {fout++;console.log('  FOUT  '+naam+(detail?' — '+detail:''));} }

// Minimale DOM-stub
function El(tag){ return {tagName:tag,id:'',style:{cssText:''},_html:'',children:[],
  set innerHTML(v){this._html=v;}, get innerHTML(){return this._html;},
  appendChild(c){this.children.push(c);return c;},
  querySelector(){return null;}, querySelectorAll(){return [];},
  removeChild(){}, remove(){}, addEventListener(){},
  set textContent(v){this._txt=v;}, get textContent(){return this._txt||'';}};}
const _opslag={};
global.localStorage={getItem:k=>k in _opslag?_opslag[k]:null,setItem:(k,v)=>{_opslag[k]=String(v);},removeItem:k=>{delete _opslag[k];}};
const _msteps=El('div');
global.document={readyState:'complete',
  createElement:El,
  getElementById:()=>null,
  querySelector:s=>s==='#step1 .msteps'?_msteps:null,
  addEventListener(){}, head:El('head'), body:El('body')};
_msteps.parentNode={replaceChild(nieuw,oud){ global.__vak=nieuw; }};
global.window={matchMedia:()=>({matches:false})};
global.matchMedia=global.window.matchMedia;

eval(fs.readFileSync('pidlane-start.js','utf8'));
const P=global.window.PLStart;
const vak=()=>global.__vak?global.__vak.innerHTML:'';

t('module exporteert PLStart', !!P);
t('vak is in de DOM geplaatst', !!global.__vak);
t('nieuwe gebruiker krijgt de kiezer', /Welke adapter heb je/.test(vak()));
t('WiFi-waarschuwing staat er meteen', /WiFi-adapters/.test(vak()));

P.kies('elm327');
t('ELM327 toont zijn eigen pincode-stap', /1234/.test(vak()), 'pincode ontbreekt');
t('ELM327 noemt GEEN pair-knop', !/pair-knop/.test(vak()), 'MX+-tekst lekt door');

P.kies('ble');
t('BLE waarschuwt tegen koppelen', /NIET in de Bluetooth-instellingen/.test(vak()));
t('BLE heeft minder stappen dan Classic', (vak().match(/<li/g)||[]).length===3);

P.kies('mxplus');
t('MX+ noemt de pair-knop wel', /pair-knop/.test(vak()));
t('stappen zijn genummerd 1..5', /">1</.test(vak()) && /">5</.test(vak()), 'nummers ontbreken in de opbouw');

// Terugkerende gebruiker
localStorage.setItem('pl_verbindingen','4');
localStorage.setItem('pl_laatsteVerbinding',String(Date.now()-3*3600*1000));
localStorage.setItem('spp_name','OBDLink MX+');
P.ververs();
t('bekende gebruiker krijgt de compacte kaart', /laatst verbonden/.test(vak()));
t('bekende gebruiker ziet geen stappenlijst', !/<li/.test(vak()), 'stappen nog zichtbaar');
t('tijdsaanduiding klopt', /3 uur geleden/.test(vak()), vak().slice(0,200));

// Cascade
P.begin();
t('cascade begint leeg', /Verbinding zoeken/.test(vak()));
P.poging('BLE',1);
t('poging verschijnt', /BLE/.test(vak()));
P.poging('SPP (Classic · scan)',1);
t('vorige poging is afgesloten', (vak().match(/✕/g)||[]).length===1, 'geen kruisje bij gepasseerde poging');
P.gelukt('SPP (Classic · scan)');
t('succes toont vinkje', /✓/.test(vak()));
t('verbinding is geteld', localStorage.getItem('pl_verbindingen')==='5');

P.begin(); P.poging('BLE',1); P.mislukt();
t('mislukt sluit de laatste poging af', /✕/.test(vak()) && !/•/.test(vak()));

console.log('\n'+(ok+fout)+' toetsen, '+fout+' fout');
process.exit(fout?1:0);
