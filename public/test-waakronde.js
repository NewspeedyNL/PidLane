// Rooktest: oordeelvorming en kandidaatselectie van de Waakronde
let ok=0,fout=0;
const t=(n,a,b)=>{ if(String(a)===String(b)){ok++;console.log('  ok   ',n);} else {fout++;console.log('  FOUT ',n,'kreeg',a,'wilde',b);} };

/* ── antwoordHerkend: staat er een geldige header in? ── */
function antwoordHerkend(pid, raw){
  if(!raw) return false;
  const s=String(raw);
  if(/NO DATA|ERROR|UNABLE|STOPPED|SEARCHING|\?/i.test(s)) return false;
  const hdr=((parseInt(pid.slice(0,2),16)+0x40).toString(16).toUpperCase().padStart(2,'0'))+pid.slice(2).toUpperCase();
  return s.replace(/[^0-9A-Fa-f]/g,'').toUpperCase().indexOf(hdr)>=0;
}
console.log('— heeft de ECU geantwoord —');
t('mode 01 header', antwoordHerkend('0105','41 05 5A'), true);
t('mode 21 header', antwoordHerkend('2101','61 01 7B'), true);
t('NO DATA', antwoordHerkend('0105','NO DATA'), false);
t('ERROR', antwoordHerkend('0105','BUS ERROR'), false);
t('SEARCHING', antwoordHerkend('0105','SEARCHING...'), false);
t('leeg', antwoordHerkend('0105',''), false);
t('verkeerde pid in antwoord', antwoordHerkend('0105','410C1AF8'), false);
t('vraagteken', antwoordHerkend('0105','?'), false);

/* ── beoordeel: stil / buiten fysiek / buiten verwacht / ok ── */
const HARD={'0105':{min:-20,max:130}};
const DEFS={'0105':{name:'Koelwater',unit:'°C',min:-40,max:215},
            '010C':{name:'Toerental',unit:'rpm',min:0,max:8000}};
// parsePID-vervanger: geeft null bij overschrijding van de harde limiet,
// precies zoals validateAndSmooth() dat in de app doet.
function parsePIDNep(pid,raw){
  const hex=String(raw).replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
  const hdr=((parseInt(pid.slice(0,2),16)+0x40).toString(16).toUpperCase().padStart(2,'0'))+pid.slice(2).toUpperCase();
  const i=hex.indexOf(hdr); if(i<0) return null;
  const b=parseInt(hex.slice(i+hdr.length,i+hdr.length+2),16);
  let v = pid==='0105' ? b-40 : b;
  const lim=HARD[pid];
  if(lim && (v<lim.min||v>lim.max)) return null;   // laag 1 keurt af
  return v;
}
function beoordeel(pid,raw){
  if(!antwoordHerkend(pid,raw)) return {staat:'stil',v:undefined,reden:'geen antwoord'};
  const v=parsePIDNep(pid,raw);
  if(v===null||v===undefined||!isFinite(v)) return {staat:'let',v:undefined,reden:'buiten fysiek bereik'};
  const d=DEFS[pid];
  if(d&&d.max>d.min){
    const m=(d.max-d.min)*0.02;
    if(v<d.min-m) return {staat:'let',v,reden:'onder verwacht bereik'};
    if(v>d.max+m) return {staat:'let',v,reden:'boven verwacht bereik'};
  }
  return {staat:'ok',v,reden:''};
}
console.log('\n— oordeel —');
t('normale waarde', beoordeel('0105','410582').staat, 'ok');            // 0x82-40 = 90 °C
t('normale waarde v', beoordeel('0105','410582').v, 90);
t('geen antwoord', beoordeel('0105','NO DATA').staat, 'stil');
// 0xFF-40 = 215 -> boven harde limiet 130 -> parsePID null
t('fysiek onmogelijk = bevinding', beoordeel('0105','4105FF').staat, 'let');
t('en NIET als stil gemeld', beoordeel('0105','4105FF').staat==='stil', false);
t('reden benoemd', beoordeel('0105','4105FF').reden, 'buiten fysiek bereik');
t('randwaarde binnen marge', beoordeel('010C','410C00').staat, 'ok');

console.log('\n— dit is de kern van de correctie —');
console.log('  een sensor die 215 °C meldt is een BEVINDING, geen stilte.');
t('let != stil', beoordeel('0105','4105FF').staat!==beoordeel('0105','NO DATA').staat, true);

/* ── kandidaten: alleen wat je NIET volgt ── */
function kandidaten({supported, actief, tekst, kiesbaar, defs}){
  return supported.filter(p=>{
    if(actief.has(p)) return false;
    if(tekst.has(p)) return false;
    if(!kiesbaar(p)) return false;
    if(!defs[p]) return false;
    return true;
  });
}
console.log('\n— kandidaatselectie —');
const k=kandidaten({
  supported:['010C','0105','015C','0151','0146','019Z'],
  actief:new Set(['010C']),
  tekst:new Set(['0151']),
  kiesbaar:p=>p!=='0146',
  defs:{'010C':1,'0105':1,'015C':1,'0151':1,'0146':1}
});
t('aangevinkte pid eruit', k.includes('010C'), false);
t('tekst-pid eruit', k.includes('0151'), false);
t('niet-kiesbaar eruit', k.includes('0146'), false);
t('zonder definitie eruit', k.includes('019Z'), false);
t('rest blijft', k.join(','), '0105,015C');

console.log(`\n${ok} toetsen, ${fout} fout`);
process.exit(fout?1:0);
