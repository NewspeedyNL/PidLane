// Rooktest: bevestigingspoort + afbreekbare gezondheidscheck
let ok=0,fout=0;
const t=(n,a,b)=>{ if(String(a)===String(b)){ok++;console.log('  ok   ',n);} else {fout++;console.log('  FOUT ',n,'kreeg',a,'wilde',b);} };

// ── healthUitProfiel: onbekende PIDs mogen niet uitgegrijsd raken ──
function healthUitProfiel(health, supported){
  if(!health||typeof health!=='object') return null;
  const uit={};
  supported.forEach(pid=>{
    const h=health[pid];
    uit[pid]=(h==='ok'||h==='twijfel'||h==='onzin'||h==='nodata')?h:'ok';
  });
  return uit;
}
console.log('— oordeel uit profiel —');
let r=healthUitProfiel({'010C':'ok','015C':'nodata','0114':'onzin'},['010C','015C','0114','2101']);
t('bekend ok blijft ok', r['010C'],'ok');
t('bekend nodata blijft nodata', r['015C'],'nodata');
t('bekend onzin blijft onzin', r['0114'],'onzin');
t('ONBEKENDE pid -> ok (niet grijs)', r['2101'],'ok');
t('geen health -> null', healthUitProfiel(null,['010C']), null);
t('rommel -> null', healthUitProfiel('nee',['010C']), null);

// ── afgebroken scan mag geen sensoren als kapot achterlaten ──
console.log('\n— afbreken halverwege —');
function scan(pids, afbreekNa){
  const H={}; let n=0;
  for(const p of pids){ if(n>=afbreekNa) break; H[p]='ok'; n++; }
  const afgebroken=n<pids.length;
  if(afgebroken) pids.forEach(p=>{ if(H[p]===undefined) H[p]='ok'; });
  return {H,n,afgebroken};
}
const s=scan(['010C','010D','0105','010B','010F'],2);
t('afgebroken gemeld', s.afgebroken, true);
t('2 echt gemeten', s.n, 2);
t('rest niet ongedefinieerd', Object.keys(s.H).length, 5);
t('ongemeten pid = ok', s.H['010F'],'ok');
t('geen enkele onzin', Object.values(s.H).filter(v=>v==='onzin').length, 0);

// ── poortlogica ──
console.log('\n— wanneer wordt gevraagd —');
const vraag=(usedProfile,ph,demo)=>!!(usedProfile&&ph&&Object.keys(ph).length&&!demo);
t('profiel + health -> vragen', vraag(true,{'010C':'ok'},false), true);
t('profiel zonder health -> niet vragen', vraag(true,null,false), false);
t('profiel + leeg health -> niet vragen', vraag(true,{},false), false);
t('verse discovery -> niet vragen', vraag(false,{'010C':'ok'},false), false);
t('demo -> niet vragen', vraag(true,{'010C':'ok'},true), false);

// ── opslaan van vers oordeel ──
console.log('\n— profiel bijwerken —');
const bewaar=(known,size,usedProfile,slaOver)=>!!(known&&size>0&&(!usedProfile||!slaOver));
t('nieuw voertuig -> opslaan', bewaar(true,20,false,false), true);
t('profiel + toch gescand -> opslaan', bewaar(true,20,true,false), true);
t('profiel + overgeslagen -> niet opslaan', bewaar(true,20,true,true), false);
t('geen VIN -> niet opslaan', bewaar(false,20,false,false), false);

console.log(`\n${ok} toetsen, ${fout} fout`);
process.exit(fout?1:0);
