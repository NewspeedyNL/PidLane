// ══════════════════════════════════════════════════════════════════
// test-export.js — de PDF-opbouw en de bestandsnaam van pidlane-export.js
// ──────────────────────────────────────────────────────────────────
// Draait plMaakPdf() met een nagemaakte jsPDF en kijkt welke tekenopdrachten
// eruit komen. Zo is te toetsen wat je anders alleen met je ogen op een
// telefoon kunt zien: staat de kopband op élke pagina, wordt een regel van
// 400 tekens afgebroken in plaats van over de rand geschreven, krijgen FOUT
// en LET OP echt een andere kleur, en kloppen de paginanummers.
//
// Waarom niet de echte jsPDF: die haalt hij van een CDN en dat kan hier niet.
// De nabootsing hoeft alleen de aanroepen te registreren — de vraag is of
// PidLane de juiste opdrachten geeft, niet of jsPDF ze goed uitvoert.
//
// Draaien vanuit public/:  node test-export.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const opdrachten=[];
let pagina=1, paginas=1;
function NepDoc(){ }
NepDoc.prototype.setFillColor=function(){opdrachten.push(['fill',[...arguments].join(',')]);};
NepDoc.prototype.rect=function(){opdrachten.push(['rect',[...arguments].join(',')]);};
NepDoc.prototype.roundedRect=function(){opdrachten.push(['roundedRect',[...arguments].join(',')]);};
NepDoc.prototype.setTextColor=function(){opdrachten.push(['kleur',[...arguments].join(',')]);};
NepDoc.prototype.setDrawColor=function(){};
NepDoc.prototype.line=function(){opdrachten.push(['lijn','']);};
NepDoc.prototype.setFont=function(f,st){opdrachten.push(['font',f+' '+(st||'')]);};
NepDoc.prototype.setFontSize=function(n){opdrachten.push(['grootte',n]);};
NepDoc.prototype.text=function(t,x,y,o){opdrachten.push(['tekst',String(t)]);};
NepDoc.prototype.addPage=function(){paginas++;opdrachten.push(['nieuwePagina',paginas]);};
NepDoc.prototype.setPage=function(p){pagina=p;};
NepDoc.prototype.getNumberOfPages=function(){return paginas;};
NepDoc.prototype.splitTextToSize=function(t,w){ const uit=[]; for(let i=0;i<t.length;i+=95) uit.push(t.slice(i,i+95)); return uit.length?uit:['']; };
NepDoc.prototype.output=function(){return {nep:true,bytes:opdrachten.length};};

global.window={ jspdf:{ jsPDF:function(){ return new NepDoc(); } } };
global.document={ createElement:()=>({style:{},setAttribute(){}}), head:{appendChild(){}}, body:{appendChild(){}}, getElementById:()=>null };
// navigator bestaat al in Node 22 en is alleen-lezen; niet nodig voor deze test
global.localStorage={getItem:()=>null};
global.vehicleInfo={merk:'Mazda',model:'CX-5',year:2018,brandstof:'benzine',vin:'JMZKF6W7600766507'};
global.activePIDs=new Set(['010C','0105']);
global.Blob=function(){}; global.URL={createObjectURL:()=>'',revokeObjectURL(){}};

eval(fs.readFileSync(path.join(__dirname,'pidlane-export.js'),'utf8'));

// ══════════════════════════════════════════════════════════════════
// DE BESTANDSNAAM (#207)
// ──────────────────────────────────────────────────────────────────
// Sinds #207 typt een mens de naam zelf, en dan komt er vroeg of laat een
// schuine streep, een dubbele punt of een geplakte regel met een tab in.
// _veiligeNaam() moet dat opruimen zonder é en ü te slopen, en moet nooit
// een lege naam teruggeven — dan heet het bestand ".txt" en is het weg.
//
// Op de échte functie: window._plVeiligeNaam komt uit de module hierboven.
var naamFout = 0;
{
  const V = window._plVeiligeNaam;
  if (typeof V !== 'function') {
    console.log('  FOUT  _plVeiligeNaam ontbreekt — is de export gewijzigd?');
    process.exit(1);
  }
  const T = 'pidlane-rapport';
  const nt = (naam, gemeten, verwacht) => {
    if (String(gemeten) === String(verwacht)) { console.log('  ok    ' + naam); }
    else { naamFout++; console.log('  FOUT  ' + naam + '\n        kreeg "' + gemeten + '", wilde "' + verwacht + '"'); }
  };

  console.log('\n— de bestandsnaam —');
  nt('een gewone naam blijft heel',        V('rit naar Zwolle', T), 'rit naar Zwolle');
  nt('accenten overleven',                 V('meting café ü ø', T), 'meting café ü ø');
  nt('een schuine streep wordt een streepje', V('rit 12/9', T), 'rit 12-9');
  nt('een dubbele punt ook',               V('meting 10:45', T), 'meting 10-45');
  nt('backslash ook',                      V('map\\rit', T), 'map-rit');
  nt('een geplakte regel met een tab',     V('rit\tnaar\nhuis', T), 'rit-naar-huis');
  nt('zelf getypte .txt gaat eraf',        V('rapport.txt', T), 'rapport');
  nt('zelf getypte .PDF ook',              V('rapport.PDF', T), 'rapport');
  nt('maar een punt middenin blijft',      V('rit 12.9 naar huis', T), 'rit 12.9 naar huis');
  nt('een beginpunt gaat eraf (verborgen bestand)', V('.verborgen', T), 'verborgen');
  nt('een punt aan het eind gaat eraf',    V('rapport.', T), 'rapport');
  nt('dubbele spaties worden er een',      V('rit    naar   huis', T), 'rit naar huis');

  // De twee die het ergst zijn: een naam die verdwijnt.
  nt('leeg valt terug op de standaard',    V('', T), T);
  nt('alleen spaties ook',                 V('   ', T), T);
  nt('alleen leestekens ook',              V('///:::', T), T);
  nt('null valt terug',                    V(null, T), T);

  // Lengte: een geplakte alinea mag geen bestandsnaam van 4 kB worden.
  const lang = V('x'.repeat(400), T);
  nt('een te lange naam wordt afgekapt op 80', lang.length, 80);
}


const tekst=[
 'PIDLANE TESTRUN 1.1 (17-08-2026)',
 '════════════════════════════════════════════════',
 'Datum     : 17-8-2026, 10:21:38',
 '',
 'BLOK 1 — bedrading en omgeving',
 '────────────────────────────────────────────────',
 '[10:21:21]  ok  Bedradingscontrole  (0 ms)',
 '                95 verwachte functies aanwezig',
 '[10:21:21] FOUT Iets kapots',
 '                met een detailregel',
 '[10:21:21]LETOP Busslot',
 '                vastgehouden door "poll"',
 'Busstatistiek — '+JSON.stringify({totaal:284,ok:284,perPid:Object.fromEntries(Array.from({length:40},(_,i)=>['01'+i,{n:i}]))})
].concat(Array.from({length:120},(_,i)=>'[10:2'+(i%9)+':00]  ok  Regel '+i+'  (8'+(i%9)+' ms)')).join('\n');

let fout=0;
function toets(naam,waar){ if(waar){console.log('  ok    '+naam);} else {fout++;console.log('  FOUT  '+naam);} }

console.log('PDF-opbouw — pidlane-export.js\n');
window.plMaakPdf('proef.pdf',tekst,{titel:'Testrun 1.1',ondertitel:'Koude start'}).then(function(){
  const tel=n=>opdrachten.filter(o=>o[0]===n).length;
  const teksten=opdrachten.filter(o=>o[0]==='tekst').map(o=>o[1]);
  const kleuren=opdrachten.filter(o=>o[0]==='kleur').map(o=>o[1]);

  toets('meerdere pagina\'s bij een lang log ('+paginas+')', paginas>1);
  toets('kopband op elke pagina', tel('rect')===paginas);
  toets('voertuigblok precies een keer', tel('roundedRect')===1);
  toets('voertuiggegevens staan erin', teksten.some(t=>t.indexOf('Mazda CX-5')>-1));
  toets('titel uit de opties staat in de kop', teksten.some(t=>t.indexOf('TESTRUN 1.1')>-1));
  toets('FOUT krijgt rood', kleuren.indexOf('190,30,45')>-1);
  toets('LET OP krijgt oranje', kleuren.indexOf('180,95,6')>-1);
  toets('ok krijgt groen', kleuren.indexOf('22,128,61')>-1);
  toets('paginanummers in de voettekst', teksten.some(t=>/^Pagina 1 van [0-9]+$/.test(t)));
  toets('lange regels worden afgebroken', teksten.filter(t=>t.length>95).length===0);
  toets('emoji zijn eruit gefilterd', !teksten.some(t=>/[\u{1F000}-\u{1FAFF}]/u.test(t)));
  toets('scheidingslijnen als lijn, niet als streepjes', !teksten.some(t=>/^-{10,}$/.test(t.trim())));

  const totaal = fout + naamFout;
  console.log('\n'+(totaal?totaal+' test(s) gefaald':'alle tests geslaagd'));
  process.exit(totaal?1:0);
}).catch(function(e){ console.log('  FOUT  plMaakPdf gooide: '+e.message); process.exit(1); });
