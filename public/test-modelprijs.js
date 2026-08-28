// ══════════════════════════════════════════════════════════════════
// test-modelprijs.js — klopt de prijstabel nog met wat Anthropic vraagt?
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// _modelPriceEur() voedt de euroteller die je als beheerder ziet. Dat is niet
// de klantafrekening (die loopt langs tegoedTarief() in worker.js), maar het
// is wél het getal waarop je je marge beoordeelt en je model kiest. Een
// verouderde prijs stuurt dus een besluit, en niets meldt het.
//
// Op 28-08-2026 stonden er twee fouten in (#48):
//   - Opus op $15/$75 — de Opus 3-generatie; huidige Opus is $5/$25
//   - een "introductieprijs" voor Sonnet 5 die niet bestaat, met een
//     Date.now()-vergelijking die op 01-09-2026 vanzelf naar $3/$15 sprong
//
// Die tweede is het gevaarlijkste soort: er verandert niets aan de code en
// toch klopt hij op een dag niet meer. Vandaar dat deze test niet alleen de
// getallen toetst maar ook dat er GEEN datumafhankelijkheid meer in zit.
//
// ONDERHOUD: verandert Anthropic zijn tarieven, dan hoort deze test rood te
// worden. Dat is de bedoeling — pas dan VERWACHT hieronder aan, met de datum
// waarop je het hebt nagekeken.
//
// Draaien vanuit public/:  node test-modelprijs.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(__dirname + '/pidlane-fuel.js', 'utf8');

// ── de functie plus zijn twee constanten uit de module knippen ────
const vanK = bron.indexOf('const USD_EUR');
const vanF = bron.indexOf('function _modelPriceEur(');
const totF = bron.indexOf('\n}', vanF) + 2;
if (vanK < 0 || vanF < 0) {
  console.error('FOUT: USD_EUR of _modelPriceEur() niet gevonden in pidlane-fuel.js.');
  process.exit(1);
}
const stuk = bron.slice(vanK, totF);
const maak = new Function(stuk + '\nreturn { prijs:_modelPriceEur, koers:USD_EUR, tabel:MODEL_USD };');
const M = maak();

// Tarieven per miljoen tokens in dollar, nagekeken bij de bron op 28-08-2026.
const VERWACHT = {
  'claude-haiku-4-5':  { inp: 1, out: 5  },
  'claude-opus-5':     { inp: 5, out: 25 },
  'claude-opus-4-8':   { inp: 5, out: 25 },
  'claude-sonnet-5':   { inp: 2, out: 10 }
};

console.log('\n1. De tarieven kloppen met de gepubliceerde prijzen');
for (const [naam, d] of Object.entries(VERWACHT)) {
  const p = M.prijs(naam);
  const inUsd  = p.inp / M.koers;
  const uitUsd = p.out / M.koers;
  toets(naam + ' invoer $' + d.inp,  Math.abs(inUsd  - d.inp) < 0.005,
        'tabel geeft $' + inUsd.toFixed(2));
  toets(naam + ' uitvoer $' + d.out, Math.abs(uitUsd - d.out) < 0.005,
        'tabel geeft $' + uitUsd.toFixed(2));
}

console.log('\n2. Geen datumafhankelijkheid meer');
// Dit is de kern van #48. Een prijs die vanzelf verandert als de klok
// doortikt is een fout die geen enkele commit veroorzaakt en die dus ook
// door geen enkele review wordt gevangen.
toets('geen Date.now() of Date.parse() in de prijsbepaling',
      !/Date\.(now|parse)/.test(stuk),
      'de prijs hangt weer aan de klok — dan verandert hij op een dag zonder dat iemand iets wijzigde');

console.log('\n3. De koers staat apart en is leesbaar');
toets('USD_EUR is een getal tussen 0,5 en 1,5', typeof M.koers === 'number' && M.koers > 0.5 && M.koers < 1.5,
      'koers = ' + M.koers);
toets('de omrekening gebruikt die koers ook echt',
      Math.abs(M.prijs('claude-sonnet-5').inp - 2 * M.koers) < 1e-9);

console.log('\n4. Onbekende modelnamen vallen op sonnet terug, niet op niets');
// Een lege of onbekende naam mag nooit 0 kosten opleveren: dan lijkt een
// analyse gratis en klopt de teller stil niet meer.
for (const raar of ['', 'onbekend-model', null, undefined]) {
  const p = M.prijs(raar);
  toets('terugval voor ' + JSON.stringify(raar) + ' is niet nul',
        p && p.inp > 0 && p.out > 0, JSON.stringify(p));
}

console.log('\n5. Tegenproef — vangt deze test de oude fouten?');
// Zonder deze stap weet je alleen dat de test groen KAN staan. Hier bouwen we
// de twee fouten van 28-08 na en eisen we dat ze alsnog opvallen.
{
  const oud = `const USD_EUR = 0.92;
const MODEL_USD = { haiku:{inp:1,out:5}, opus:{inp:15,out:75}, sonnet:{inp:2,out:10} };
function _modelPriceEur(mdl){
  const m=String(mdl||'').toLowerCase();
  const t = m.includes('haiku') ? MODEL_USD.haiku : m.includes('opus') ? MODEL_USD.opus : MODEL_USD.sonnet;
  return { inp: t.inp * USD_EUR, out: t.out * USD_EUR };
}`;
  const O = new Function(oud + '\nreturn { prijs:_modelPriceEur, koers:USD_EUR };')();
  const opusUsd = O.prijs('claude-opus-5').inp / O.koers;
  toets('de oude Opus-prijs ($15) zou hier rood worden', Math.abs(opusUsd - 5) >= 0.005,
        'de controle laat $' + opusUsd.toFixed(2) + ' door — dan meet hij niets');

  const metDatum = 'const x = Date.now() < Date.parse("2026-09-01T00:00:00Z") ? 1 : 2;';
  toets('een teruggekeerde datumtak zou hier rood worden', /Date\.(now|parse)/.test(metDatum),
        'de regexp op de klok-afhankelijkheid vangt niets');
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
