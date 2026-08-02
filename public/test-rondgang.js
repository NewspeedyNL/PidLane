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
if(fout) process.exit(1);

/* ── ronde 2: venster, normalisatie, richting ─────────────────────── */
console.log('\n══ vol scherm ══');
let ok2=0,fout2=0;
const t2=(n,a,b)=>{ if(String(a)===String(b)){ok2++;console.log('  ok   ',n);} else {fout2++;console.log('  FOUT ',n,'kreeg',a,'wilde',b);} };

const VENSTER_MS=20000, MIN_PUNTEN=2;
function punten(hist,vanaf){
  return (hist||[]).filter(p=>p&&p.t>=vanaf&&typeof p.v==='number'&&isFinite(p.v));
}
const NU=1000000;
const snel=Array.from({length:60},(_,i)=>({t:NU-59000+i*1000,v:i}));      // 1 Hz, 60s
const traag=Array.from({length:12},(_,i)=>({t:NU-110000+i*10000,v:i}));   // 0,1 Hz

console.log('— venster op TIJD, niet op aantal —');
t2('snelle pid: 20s venster', punten(snel,NU-VENSTER_MS).length, 21);
t2('trage pid: 20s venster', punten(traag,NU-VENSTER_MS).length, 3);
t2('trage pid haalt minimum', punten(traag,NU-VENSTER_MS).length>=MIN_PUNTEN, true);
t2('niets ouder dan venster', punten(snel,NU-VENSTER_MS).every(p=>p.t>=NU-VENSTER_MS), true);
t2('NaN eruit', punten([{t:NU,v:NaN},{t:NU,v:5}],NU-VENSTER_MS).length, 1);
t2('null-punt eruit', punten([null,{t:NU,v:5}],NU-VENSTER_MS).length, 1);
t2('lege historie', punten(undefined,NU-VENSTER_MS).length, 0);

console.log('\n— normalisatie per lijn —');
function schaal(pts){
  let mn=Infinity,mx=-Infinity;
  pts.forEach(p=>{ if(p.v<mn)mn=p.v; if(p.v>mx)mx=p.v; });
  if(mx-mn<1e-9){mn-=1;mx+=1;}
  return {mn,mx,bereik:mx-mn};
}
const s1=schaal([{v:800},{v:4000}]), s2=schaal([{v:0.98},{v:1.02}]);
t2('groot bereik ok', s1.bereik, 3200);
t2('klein bereik blijft klein', Math.round(s2.bereik*100)/100, 0.04);
t2('beide vullen 0-1', ((4000-s1.mn)/s1.bereik)===((1.02-s2.mn)/s2.bereik), true);
const vlak=schaal([{v:7},{v:7},{v:7}]);
t2('vlakke lijn geen deling door nul', vlak.bereik, 2);
t2('vlakke lijn in het midden', (7-vlak.mn)/vlak.bereik, 0.5);

console.log('\n— richting van de beurtwissel —');
function wissel(idx,n,richting){ return (idx+(richting===-1?-1:1)+n)%n; }
t2('vooruit', wissel(0,5,1), 1);
t2('vooruit wikkelt', wissel(4,5,1), 0);
t2('terug', wissel(3,5,-1), 2);
t2('terug wikkelt', wissel(0,5,-1), 4);

console.log(`\n${ok2} toetsen, ${fout2} fout`);
if(fout2) process.exit(1);

console.log(`\nTOTAAL ${ok+ok2} toetsen, ${fout+fout2} fout`);
process.exit((fout+fout2)?1:0);
