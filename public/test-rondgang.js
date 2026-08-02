// Rooktest: beurtenopbouw van de categorie-rondgang
let ok=0,fout=0;
const t=(n,a,b)=>{ if(String(a)===String(b)){ok++;console.log('  ok   ',n);} else {fout++;console.log('  FOUT ',n,'kreeg',a,'wilde',b);} };

const MIN_PIDS=2, MAX_PIDS=12;
const VOLGORDE=['Temp','Motor','Brandstof','Emissie','Electrisch','Rijden','Mazda','Overig'];
const ALIAS={'Temperatuur':'Temp','Elektrisch':'Electrisch'};

function bouw({defs, supported, basis, tekst}){
  const catVan=p=>{const c=(defs[p]&&defs[p].cat)||'Overig';return ALIAS[c]||c;};
  const perCat={};
  supported.forEach(pid=>{
    if(basis.has(pid)) return;
    if(tekst.has(pid)) return;
    if(!defs[pid]) return;
    const c=catVan(pid); (perCat[c]||(perCat[c]=[])).push(pid);
  });
  const beurten=[];
  const cats=VOLGORDE.filter(c=>perCat[c]).concat(Object.keys(perCat).filter(c=>VOLGORDE.indexOf(c)<0).sort());
  cats.forEach(c=>{
    const l=perCat[c];
    if(l.length<MIN_PIDS) return;
    if(l.length<=MAX_PIDS){ beurten.push({cat:c,label:c,pids:l}); return; }
    const n=Math.ceil(l.length/MAX_PIDS);
    for(let i=0;i<n;i++) beurten.push({cat:c,label:`${c} ${i+1}/${n}`,pids:l.slice(i*MAX_PIDS,(i+1)*MAX_PIDS)});
  });
  return beurten;
}

const defs={}; const mk=(p,c)=>{defs[p]={cat:c};return p;};
// 4 temp, 3 motor, 1 brandstof (te mager), 14 emissie (splitst), 2 tekst-PIDs
const temp=['T1','T2','T3','T4'].map(p=>mk(p,'Temp'));
const temp2=[mk('T5','Temperatuur')];                       // alias
const motor=['M1','M2','M3'].map(p=>mk(p,'Motor'));
const brand=[mk('B1','Brandstof')];                          // 1 stuk -> overslaan
const emis=Array.from({length:14},(_,i)=>mk('E'+i,'Emissie'));
const txt=[mk('0151','Brandstof'), mk('011C','Overig')];
const basis=new Set(['010C','0105']);
const supported=[...basis,...temp,...temp2,...motor,...brand,...emis,...txt];

const b=bouw({defs,supported,basis,tekst:new Set(txt)});
const labels=b.map(x=>x.label);

console.log('— categorieselectie —');
t('Temp bevat alias Temperatuur', b.find(x=>x.cat==='Temp').pids.length, 5);
t('Motor aanwezig', labels.includes('Motor'), true);
t('Brandstof met 1 pid overgeslagen', labels.some(l=>l.startsWith('Brandstof')), false);
t('tekst-PID 0151 nergens', b.some(x=>x.pids.includes('0151')), false);
t('tekst-PID 011C nergens', b.some(x=>x.pids.includes('011C')), false);
t('basis nergens in een beurt', b.some(x=>x.pids.some(p=>basis.has(p))), false);

console.log('\n— splitsen bij grote categorie —');
t('Emissie in 2 beurten', labels.filter(l=>l.startsWith('Emissie')).length, 2);
t('label 1/2', labels.includes('Emissie 1/2'), true);
t('label 2/2', labels.includes('Emissie 2/2'), true);
t('eerste blok vol', b.find(x=>x.label==='Emissie 1/2').pids.length, 12);
t('tweede blok rest', b.find(x=>x.label==='Emissie 2/2').pids.length, 2);
t('geen enkel scherm > MAX', b.every(x=>x.pids.length<=MAX_PIDS), true);
t('geen enkel scherm < MIN', b.every(x=>x.pids.length>=MIN_PIDS), true);

console.log('\n— volgorde —');
t('Temp voor Motor', labels.indexOf('Temp')<labels.indexOf('Motor'), true);
t('Motor voor Emissie', labels.indexOf('Motor')<labels.indexOf('Emissie 1/2'), true);

console.log('\n— rondlopen —');
let idx=-1; const seq=[];
for(let i=0;i<b.length+2;i++){ idx=(idx+1)%b.length; seq.push(idx); }
t('wikkelt terug naar 0', seq[b.length], 0);
t('geen index buiten bereik', seq.every(i=>i>=0&&i<b.length), true);

console.log('\n— te weinig categorieen -> niet starten —');
const mini=bouw({defs,supported:[...basis,...brand],basis,tekst:new Set(txt)});
t('1 losse pid -> 0 beurten', mini.length, 0);
t('start weigert onder 2', mini.length<2, true);

console.log(`\n${ok} toetsen, ${fout} fout`);
process.exit(fout?1:0);
