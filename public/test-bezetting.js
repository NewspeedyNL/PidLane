// ══════════════════════════════════════════════════════════════════
// test-bezetting.js — blok 7 mag een nulmeting nooit "geen verschil" noemen
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (#12)
// De controle "Zegt bezetting iets over de responstijd?" voedt de Slotsom die
// bepaalt of de PLLoad-vraag (#15) dicht kan. Op 26-08-2026 stond daar:
//
//   const verschil = mLaag ? Math.round((mHoog - mLaag) / mLaag * 100) : 0;
//
// De deel-door-nul-vangst gaf 0, en 0 viel daarna door |verschil| < 15 in de
// tak "vrijwel geen verschil". Gemeten: 0 ms tegen 144 ms, gepresenteerd als
// +0% — "bezetting voorspelt hier geen tegendruk", precies andersom.
//
// Dit is de gevaarlijkste soort fout in dit project (zie ook #29 en #30): de
// app meet goed en presenteert het als iets anders. Van buitenaf niet te
// onderscheiden van een echte bevinding, en hier stuurt het een besluit.
//
// Getoetst wordt het GEDRAG van de uitkomst, niet de brontekst: de functie
// wordt uit de module geknipt en met verzonnen sporen echt uitgevoerd.
//
// Draaien vanuit public/:  node test-bezetting.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de controle uit pidlane-testrun.js knippen ────────────────────
// De controle zit in een _doe()-aanroep. We pakken de functiebody eruit en
// draaien hem met onze eigen sp/d/med, zodat we sporen kunnen verzinnen.
const bron = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');
const anker = "await _doe(7, 'Zegt bezetting iets over de responstijd?', function () {";
const van = bron.indexOf(anker);
if (van < 0) {
  console.error('FOUT: de controle "Zegt bezetting iets over de responstijd?" is niet gevonden.');
  process.exit(1);
}
const body = bron.slice(van + anker.length, bron.indexOf('\n  });', van));
const maak = new Function('sp', 'd', 'med', body);

// Dezelfde drempels als de app gebruikt, en een echte mediaan.
const D = { bezetAf: 55, bezetOp: 85 };
const med = (a) => { const s = a.slice().sort((x, y) => x - y); const h = s.length >> 1;
  return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2); };
const draai = (sp) => maak(sp, D, med);
const isLetOp = (r) => r && r.staat === 'LET OP';
const tekst   = (r) => (r && r.detail) ? r.detail : String(r);

// spoorhulp: n monsters met een bezetting en een responstijd
const mon = (bezet, ms, n) => Array.from({ length: n }, () => ({ bezet, ms }));

console.log('\n1. HET GEVAL VAN 26-08 — 0 ms laag, 144 ms hoog');
{
  // Precies de situatie uit het issue: de lage groep bestaat uit nulmetingen.
  const r = draai([].concat(mon(20, 0, 6), mon(95, 144, 6)));
  const t = tekst(r);
  toets('wordt NIET "vrijwel geen verschil" genoemd', !/vrijwel geen verschil/.test(t), t);
  toets('presenteert geen +0%', !/\+0%/.test(t), t);
  toets('zegt dat er te weinig bruikbare monsters zijn', /te weinig bruikbare spreiding/.test(t), t);
  toets('meldt hoeveel nulmonsters er weg zijn', /6 monster\(s\) van 0 ms/.test(t), t);
  toets('is een LET OP en geen stille ok', isLetOp(r), JSON.stringify(r));
}

console.log('\n2. Een echt verschil wordt nog steeds gewoon gemeld');
{
  const r = draai([].concat(mon(20, 100, 6), mon(95, 160, 6)));
  const t = tekst(r);
  toets('meldt +60%', /\+60%/.test(t), t);
  toets('geen LET OP', !isLetOp(r), JSON.stringify(r));
}

console.log('\n3. Een écht klein verschil heet nog steeds "vrijwel geen verschil"');
// De oude tak moet blijven werken — hij was niet fout, hij kreeg alleen de
// verkeerde invoer. Weghalen zou het probleem omdraaien.
{
  const r = draai([].concat(mon(20, 100, 6), mon(95, 105, 6)));
  const t = tekst(r);
  toets('meldt +5%', /\+5%/.test(t), t);
  toets('noemt het vrijwel geen verschil', /vrijwel geen verschil/.test(t), t);
  toets('en is een LET OP', isLetOp(r), JSON.stringify(r));
}

console.log('\n4. Losse nullen tussen echte metingen vervuilen de mediaan niet');
{
  // Zonder het filter zou de lage mediaan hier naar 0 zakken en opnieuw de
  // omgekeerde conclusie opleveren.
  const r = draai([].concat(mon(20, 0, 4), mon(20, 100, 3), mon(95, 160, 6)));
  const t = tekst(r);
  toets('rekent met 100 ms, niet met 0', /lage bezetting 100 ms/.test(t), t);
  toets('meldt de weggelaten monsters', /4 monster\(s\) van 0 ms/.test(t), t);
}

console.log('\n5. Te weinig spreiding blijft te weinig spreiding');
{
  const r = draai(mon(20, 100, 8));            // alleen lage bezetting
  toets('meldt dat vergelijken niet kan', /te weinig bruikbare spreiding/.test(tekst(r)), tekst(r));
  toets('en is een LET OP', isLetOp(r), JSON.stringify(r));
}

console.log('\n6. TEGENPROEF — vangt deze test de oude code?');
// Zonder dit weet je alleen dat de nieuwe code groen staat, niet dat de test
// de fout van 26-08 daadwerkelijk zou hebben gezien.
{
  const oud = `
    const laag = sp.filter(function (m) { return m.bezet < d.bezetAf; }).map(function (m) { return m.ms; });
    const hoog = sp.filter(function (m) { return m.bezet >= d.bezetOp; }).map(function (m) { return m.ms; });
    if (!laag.length || !hoog.length) return 'te weinig spreiding';
    const mLaag = med(laag), mHoog = med(hoog);
    const verschil = mLaag ? Math.round((mHoog - mLaag) / mLaag * 100) : 0;
    const tekst = 'responstijd bij lage bezetting ' + mLaag + ' ms, bij hoge bezetting ' + mHoog + ' ms (' +
      (verschil >= 0 ? '+' : '') + verschil + '%)';
    if (Math.abs(verschil) < 15)
      return { staat: 'LET OP', detail: tekst + ' — vrijwel geen verschil, dus bezetting voorspelt hier geen tegendruk' };
    return tekst;`;
  const oudeFn = new Function('sp', 'd', 'med', oud);
  const r = oudeFn([].concat(mon(20, 0, 6), mon(95, 144, 6)), D, med);
  const t = tekst(r);
  toets('de oude code zegt inderdaad "vrijwel geen verschil"', /vrijwel geen verschil/.test(t), t);
  toets('en presenteert inderdaad +0%', /\+0%/.test(t), t);
  toets('deel 1 van deze test zou daarop dus rood worden', /vrijwel geen verschil/.test(t));
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
