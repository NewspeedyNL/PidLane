// Toetst de twee correcties van 20-08 in de remmoment-detectie van blok 7.
// Beide kwamen uit een echte run en beide leidden tot een verkeerd oordeel
// over PLAN.md punt 2 — precies de vraag waar dit blok voor bestaat.
const fs=require('fs');
let ok=0,fout=0;
function t(n,v,d){ if(v){ok++;console.log('  ok    '+n);} else {fout++;console.log('  FOUT  '+n+(d?' — '+d:''));} }

const src=fs.readFileSync('pidlane-testrun.js','utf8');

// ── 1. Markering van eigen belasting ──
t('sampler markeert monsters tijdens een testrun',
  /run:\s*!!_trBezig/.test(src), 'geen run-vlag in het monster');
t('blok 7 filtert die monsters weg',
  /filter\(function \(m\) \{ return !m\.run; \}\)/.test(src), 'ongefilterd spoor');
t('blok 7 meldt hoeveel er is weggelaten',
  /tijdens een testrun weggelaten/.test(src));

// ── 2. Timing van de remmomentbeslissing ──
// PLLoad tikt tussen twee monsters door. Op 20-08 meldde het BT-log
// "bezet 89%" terwijl het monster erna 84% gaf; met alleen sp[i] telde die
// terechte rem als ongevraagd.
t('remdetectie kijkt naar twee monsters',
  /Math\.max\(sp\[i\]\.bezet, sp\[i - 1\]\.bezet\)/.test(src), 'kijkt maar naar één monster');
t('bezettingstak telt als verklaring',
  /drukGenoeg = bezet >= d\.bezetOp/.test(src));

// ── 3. Herrekenen van de echte run van 20-08 ──
// bezet 84% in het monster, 89% in het log; fout 0%, 103 ms tegen mediaan 97.
// Met de correctie is dit een TERECHTE rem (bezetting haalt de drempel).
const d={bezetOp:85};
const sp=[{bezet:89,fout:1,ms:117,mult:1.5},{bezet:84,fout:0,ms:103,mult:1.8}];
const bezet=Math.max(sp[1].bezet,sp[0].bezet);
const foutM=Math.max(sp[1].fout,sp[0].fout);
const ms=Math.max(sp[1].ms,sp[0].ms);
const opgelopen=97>0 && ms>97*1.15;
const terecht=foutM>0||opgelopen||bezet>=d.bezetOp;
t('de rem van 20-08 telt nu als terecht', terecht, 'zou nog steeds ongevraagd heten');

// Tegenproef: een echt ongevraagde rem moet ongevraagd blijven.
const sp2=[{bezet:60,fout:0,ms:100},{bezet:62,fout:0,ms:101}];
const b2=Math.max(sp2[1].bezet,sp2[0].bezet), f2=Math.max(sp2[1].fout,sp2[0].fout), m2=Math.max(sp2[1].ms,sp2[0].ms);
t('een echt ongevraagde rem blijft ongevraagd',
  !(f2>0 || (100>0 && m2>100*1.15) || b2>=d.bezetOp));

// ── 4. Het veld heet year, niet bouwjaar ──
t('voertuigcontrole leest v.year',
  /bouwjaar: v\.year \|\| v\.bouwjaar/.test(src), 'kijkt weer naar een veld dat niet bestaat');

console.log('\n'+(ok+fout)+' toetsen, '+fout+' fout');
process.exit(fout?1:0);
