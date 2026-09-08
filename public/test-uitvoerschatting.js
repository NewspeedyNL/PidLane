// ══════════════════════════════════════════════════════════════════
// test-uitvoerschatting.js — de kostenraming hangt aan de UITVOER,
//                            niet aan het plafond
// ──────────────────────────────────────────────────────────────────
// WAT HIER FOUT KON GAAN, EN WAAROM HET ERTOE DOET
//
// `ontleed()` schatte de uitvoer als `maxTokens × uitvoerFactor`. Dat getal
// gaat twee kanten op: het staat in het kostenvenster dat de gebruiker ziet,
// én het is de poort die in preflight() een analyse BLOKKEERT bij onvoldoende
// tegoed. Een schatting die te hoog uitvalt sluit dus klanten buiten.
//
// Gemeten op 08-09-2026: kapt een rapport af op max_tokens, dan stuurt
// apiFetch() de volledige invoer nog een of twee keer opnieuw — 2,21× en
// 3,64× de invoer, elk als eigen afboeking. De voor de hand liggende fix is
// het plafond verhogen; een plafond kost immers niets zolang het niet gehaald
// wordt, want er wordt op werkelijke uitvoer afgerekend.
//
// Maar met de oude formule verviervoudigde 4000 → 16000 de geschatte kosten.
// Twee dingen maakten dat erger:
//
//   • `uf = min(1, uitTok/maxTokens)` gaat bij een afgekapt rapport naar 1,0,
//     want dan ís uitTok gelijk aan maxTokens. Het te lage plafond leerde de
//     schatter dat de uitvoer altijd het plafond haalt.
//   • Het gewicht `1/(n+2)` bevriest: na honderd calls ~0,01, dus een
//     gewijzigd plafond zou honderden analyses lang verkeerd geschat blijven.
//
// De schatting kalibreert daarom nu op ABSOLUTE waargenomen uitvoer, per
// plafond. Deze toets bewaakt precies dat: **het plafond mag de raming niet
// meer sturen zodra er metingen zijn.** Zonder die eigenschap kan het plafond
// nooit omhoog, en blijft de hervraag-lus staan.
//
// WAAROM DIT DE ECHTE FUNCTIE LAADT
// De schatting overtypen zou bewijzen dat mijn kopie klopt. Deze test evalueert
// pidlane-credits.js zelf met een nagemaakte localStorage eronder, en stuurt de
// kalibratie aan via de publieke PLCredits.boek() — dezelfde weg die de app
// gebruikt na elke AI-call.
//
// Draaien vanuit public/:  node test-uitvoerschatting.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const BRON = fs.readFileSync(__dirname + '/pidlane-credits.js', 'utf8');

/* De module draaien met een opslag die onthoudt. `voorafKalib` zet een
   bestaande kalibratie klaar — zo is de opslag van vóór deze wijziging na te
   spelen zonder hem te verzinnen. */
function laad(voorafKalib, bron) {
  const opslag = {};
  if (voorafKalib) opslag['pl_credits_kalib'] = JSON.stringify(voorafKalib);
  global.localStorage = {
    getItem: (k) => (k in opslag ? opslag[k] : null),
    setItem: (k, v) => { opslag[k] = String(v); },
    removeItem: (k) => { delete opslag[k]; }
  };
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const maakEl = () => ({
    id: '', className: '', innerHTML: '', style: { cssText: '' }, onclick: null,
    appendChild() {}, querySelector: () => ({ onclick: null, style: {}, checked: false }),
    remove() {}
  });
  global.document = {
    readyState: 'complete', getElementById: () => null, addEventListener() {},
    createElement: maakEl, body: { appendChild() {} },
    querySelector: () => ({ onclick: null, style: {}, checked: false })
  };
  global.window = {};
  global.fetch = () => Promise.reject(new Error('geen net in de test'));

  eval(bron || BRON);
  const PLC = global.window.PLCredits;

  return {
    PLC: PLC,
    // Wat de app na elke geslaagde call doet. tekensIn > 200 en output > 20,
    // anders slaat _kalibreer() de meting bewust over.
    meet: (uitTokens, maxTokens) => PLC.boek(
      { credits: 1, tekensIn: 4000, maxTokens: maxTokens, model: 'x', geboekt: false },
      { input_tokens: 1100, output_tokens: uitTokens }),
    // De geschatte uitvoer bij een plafond. De prompt is verder niet het
    // onderwerp; hij moet alleen groot genoeg zijn om echt geteld te worden.
    schat: (maxTokens) => PLC.ontleed('x'.repeat(4000), 'y'.repeat(500), maxTokens).uitTok,
    kalib: () => JSON.parse(opslag['pl_credits_kalib'] || 'null')
  };
}

console.log('De kostenraming volgt de uitvoer, niet het plafond\n');

console.log('1. Koude start: precies het oude gedrag');
{
  const a = laad();
  // Zonder ook maar één meting is er niets beters dan de oude vorm. Dat is met
  // opzet: de eerste analyse op een vers toestel mag niet ineens anders ramen.
  toets('zonder metingen is de raming maxTokens x 0,55', a.schat(4000) === Math.round(4000 * 0.55),
        'gemeten: ' + a.schat(4000));
  toets('en schaalt hij dus nog wél mee met het plafond', a.schat(8000) === Math.round(8000 * 0.55),
        'gemeten: ' + a.schat(8000));
}

console.log('\n2. DE KERN: met metingen stuurt het plafond de raming niet meer');
{
  const a = laad();
  for (let i = 0; i < 30; i++) a.meet(1200, 4000);   // rapporten van ~1200 tokens
  const bij4000 = a.schat(4000);
  const bij16000 = a.schat(16000);
  toets('de raming bij 4000 ligt bij de gemeten 1200, niet bij 2200',
        bij4000 > 1000 && bij4000 < 1500, 'gemeten: ' + bij4000);
  // Dit is de eigenschap waar alles aan hangt: viervoudig plafond, gelijke raming.
  toets('het plafond viervoudigen verandert de raming niet',
        bij16000 === bij4000,
        'bij 4000: ' + bij4000 + ', bij 16000: ' + bij16000 +
        ' — met de oude formule was dat ' + Math.round(4000 * 0.55) + ' tegen ' + Math.round(16000 * 0.55));
  toets('en dus blijven de geschatte kosten gelijk',
        a.PLC.ontleed('x'.repeat(4000), 'y'.repeat(500), 16000).credits ===
        a.PLC.ontleed('x'.repeat(4000), 'y'.repeat(500), 4000).credits);
}

console.log('\n3. Het plafond blijft wél een bovengrens');
{
  const a = laad();
  for (let i = 0; i < 30; i++) a.meet(1200, 4000);
  // Een hulpcall met een krap plafond kan nooit 1200 tokens uitvoer geven.
  toets('bij een plafond van 600 raamt hij hooguit 600', a.schat(600) <= 600,
        'gemeten: ' + a.schat(600));
}

console.log('\n4. Per plafond een eigen gemiddelde');
{
  const a = laad();
  for (let i = 0; i < 30; i++) a.meet(1800, 4000);   // volle rapporten
  for (let i = 0; i < 30; i++) a.meet(300, 900);     // korte hulpvragen
  toets('het grote plafond houdt zijn eigen, hogere gemiddelde',
        a.schat(4000) > 1400, 'gemeten: ' + a.schat(4000));
  toets('en het kleine plafond zijn eigen, lagere', a.schat(900) < 600,
        'gemeten: ' + a.schat(900));
  // Zonder aparte bakken zou één gemiddelde beide vertekenen: de hulpvragen
  // trekken het rapport omlaag en het rapport trekt de hulpvraag omhoog.
}

console.log('\n5. Een afgekapt rapport trekt de raming niet meer naar het plafond');
{
  const a = laad();
  // Precies het geval uit de meting: uitTok == maxTokens, dus uf gaat naar 1,0.
  for (let i = 0; i < 30; i++) a.meet(4000, 4000);
  const k = a.kalib();
  toets('uf is inderdaad naar 1,0 gelopen', k.uf > 0.9, 'uf = ' + k.uf);
  // Maar de RAMING hangt daar niet meer aan: bij een ruimer plafond blijft hij
  // op de waargenomen 4000 staan in plaats van mee te schalen naar 8800.
  toets('bij een ruimer plafond blijft de raming op de gemeten 4000',
        a.schat(16000) < 4400,
        'gemeten: ' + a.schat(16000) + ' — met de oude formule ~' + Math.round(16000 * 1.0));
}

console.log('\n6. Een opslag van vóór deze wijziging migreert zonder NaN');
{
  // Zo zag pl_credits_kalib eruit tot 08-09-2026: drie velden, meer niet.
  const a = laad({ tpt: 3.9, uf: 0.6, n: 140 });
  const s = a.schat(4000);
  toets('de raming is een getal', isFinite(s) && s > 0, 'gemeten: ' + s);
  toets('en volgt de oude vorm tot er gemeten is', s === Math.round(4000 * 0.6),
        'gemeten: ' + s);
  a.meet(1000, 4000);
  toets('na één meting stapt hij over op het gemeten getal', a.schat(4000) <= 1000,
        'gemeten: ' + a.schat(4000));
  // Een kapotte opslag mag ook geen NaN geven: dat zou stilzwijgend elke
  // analyse blokkeren, want een NaN-vergelijking in preflight is altijd false.
  const b = laad({ tpt: 3.9, n: 5 });          // uf ontbreekt
  toets('een opslag zonder uf geeft geen NaN', isFinite(b.schat(4000)) && b.schat(4000) > 0,
        'gemeten: ' + b.schat(4000));
}

console.log('\n7. De bakken groeien niet onbeperkt');
{
  const a = laad();
  for (let i = 0; i < 20; i++) a.meet(500, 1000 + i);   // 20 verschillende plafonds
  const k = a.kalib();
  toets('er blijven hooguit 12 plafondbakken staan', Object.keys(k.perMax).length <= 12,
        'gemeten: ' + Object.keys(k.perMax).length);
}

// ══════════════════════════════════════════════════════════════════
// 8. TEGENPROEF — meet deze test werkelijk iets?
// ──────────────────────────────────────────────────────────────────
// De oude formule terugzetten in de bron en dezelfde toetsen draaien. Blijft
// het dan groen, dan bewijst blok 2 niets.
console.log('\n8. Tegenproef — de oude formule terug in de bron');
{
  const oud = BRON.replace(
    'const uitTok = _uitSchat(maxTokens, k);',
    'const uitTok = Math.round((maxTokens || 1500) * k.uf);');
  toets('de oude regel is werkelijk teruggezet', oud !== BRON,
        'het anker is verschoven — repareer dit anker, anders bouwt de tegenproef niets na');

  const a = laad(null, oud);
  for (let i = 0; i < 30; i++) a.meet(1200, 4000);
  const bij4000 = a.schat(4000), bij16000 = a.schat(16000);
  toets('met de oude formule schaalt de raming WEL mee met het plafond (dus rood)',
        bij16000 > bij4000 * 3,
        'bij 4000: ' + bij4000 + ', bij 16000: ' + bij16000 +
        ' — schaalt hij niet mee, dan toetst blok 2 iets anders dan het denkt');

  // En de tweede helft van de fout: het afgekapte rapport dat uf naar 1,0 duwt.
  const b = laad(null, oud);
  for (let i = 0; i < 30; i++) b.meet(4000, 4000);
  toets('en een afgekapt rapport laat de oude formule naar het plafond lopen (dus rood)',
        b.schat(16000) > 10000, 'gemeten: ' + b.schat(16000));
}

console.log(fouten === 0 ? '\ntest-uitvoerschatting: alles goed'
                         : '\ntest-uitvoerschatting: ' + fouten + ' fout(en)');
process.exit(fouten === 0 ? 0 : 1);
