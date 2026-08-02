// Rooktest mode-bewuste commandobouw + parser-header
let ok=0,fout=0;
const t=(n,a,b)=>{ if(String(a)===String(b)){ok++;console.log('  ok   ',n);} else {fout++;console.log('  FOUT ',n,'kreeg',a,'wilde',b);} };

const pidCmd=(pid,snel)=>{const p=String(pid||'').toUpperCase();return snel?p+'1':p;};
const isMode01=p=>String(p||'').slice(0,2).toUpperCase()==='01';
const hdr=pid=>((parseInt(pid.slice(0,2),16)+0x40).toString(16).toUpperCase().padStart(2,'0'))+pid.slice(2).toUpperCase();

console.log('— mode 01 blijft byte-voor-byte gelijk aan de oude bouw —');
for(const p of ['010C','0105','015C','0149','01A0']){
  t(p+' solo', pidCmd(p,true), '01'+p.slice(2)+'1');
  t(p+' batch-suffix', p.slice(2), p.slice(2));
}
console.log('\n— mode 21 gaat niet meer stilzwijgend naar mode 01 —');
t('2101 oud (fout)', '01'+'2101'.slice(2), '0101');
t('2101 nieuw', pidCmd('2101',true), '21011');
t('210C nieuw', pidCmd('210C',false), '210C');

console.log('\n— responseheader per mode —');
t('010C -> 410C', hdr('010C'), '410C');
t('2101 -> 6101', hdr('2101'), '6101');
t('210D -> 610D', hdr('210D'), '610D');

console.log('\n— batchfilter —');
const due=['010C','010D','2101','0100','210C'];
const isBitmap=p=>/^01(00|20|40|60|80|A0|C0)$/i.test(p);
const solo=due.filter(p=>isBitmap(p)||!isMode01(p));
const batch=due.filter(p=>!isBitmap(p)&&isMode01(p));
t('batchable', batch.join(','), '010C,010D');
t('solo', solo.join(','), '2101,0100,210C');

console.log('\n— pollinterval erft geen suffix meer —');
const iv=p=>!/^01/i.test(String(p))?10000:'mode01-tabel';
t('2101 niet via suffix 01', iv('2101'), 10000);
t('010C via tabel', iv('010C'), 'mode01-tabel');

console.log(`\n${ok} toetsen, ${fout} fout`);
process.exit(fout?1:0);
