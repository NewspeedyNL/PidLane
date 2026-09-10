// ══════════════════════════════════════════════════════════════════
// test-gitattributes.js — samenvoegen mag vanzelf, maar niet overal
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Gemeten op 10-09-2026 over de laatste 40 samenvoegingen op main: zeven
// daarvan waren geen PR maar een reparatie met de hand ("Merge branch
// 'main' into <tak>"), en zes van die zeven hadden PIDLANE.md in het
// conflict. Elke PR zet bovenaan §11 een nieuw blok; twee takken die
// tegelijk openstaan botsen dus per definitie, op dezelfde plek, met
// altijd dezelfde oplossing: allebei houden.
//
// Sinds 10-09-2026 doet .gitattributes dat met de union-driver van git.
// Dat haalt een handeling weg die nooit een besluit was — maar het zet er
// een risico voor terug, en dat risico is de reden dat deze test bestaat.
//
// Union verliest nooit tekst, maar kan tekst VERDUBBELEN: raken twee
// takken dezelfde regel, dan staan béide regels in het resultaat. In
// proza is dat zichtbaar bij de eerste blik op de diff. In JS of in een
// shellscript is het een stille breuk — twee keer dezelfde regel, of een
// if zonder zijn haakje — en dat is precies de klasse fout die hier
// maanden blijft staan. Union mag daarom alleen op documenten.
//
// Wat hier getoetst wordt:
//
//   1. .gitattributes bestaat, en git zelf zegt dat CHANGELOG.md en
//      PIDLANE.md onder union vallen — gevraagd met 'check-attr', niet
//      met een eigen naspelling van zijn patroonregels, zodat een ander
//      maar geldig patroon hier terecht groen blijft
//   2. geen enkel patroon met merge=union kan een codebestand raken
//      (.js .sh .html .css .json .yml .yaml), en geen kaal '*'
//   3. GEDRAG: twee takken die allebei bovenaan CHANGELOG.md en
//      PIDLANE.md invoegen, voegen samen zonder conflict, met beide
//      blokken erin en zonder conflictmarkeringen
//   4. TEGENPROEF IN DE TOETS ZELF: hetzelfde patroon op een bestand
//      dat NIET in .gitattributes staat, moet wél conflicteren. Zonder
//      die controle zou stap 3 ook groen staan als git de twee
//      invoegingen om een heel andere reden had kunnen samenvoegen, en
//      dan meet deze test niets.
//
// Wat hier NIET getoetst wordt: of GitHub server-side dezelfde driver
// gebruikt bij "Update branch". Dat is buiten de repo en blijkt uit de
// eerste PR die na 10-09 openstond terwijl main doorliep.
//
// Draaien vanuit public/:  node test-gitattributes.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

let fouten = 0;
function eis(waar, wat) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat);
  fouten++;
}
function letop(wat) { console.log('  LET OP ' + wat); }

const PAD = path.join('..', '.gitattributes');

// ── 1. het bestand en de twee botsers ──────────────────────────────
console.log('');
console.log('1. .gitattributes bestaat en dekt wat botst');

if (!fs.existsSync(PAD)) {
  console.log('  FOUT .gitattributes ontbreekt — de conflictreparaties van 10-09 komen terug');
  process.exit(1);
}
const ruw = fs.readFileSync(PAD, 'utf8');

// Regels ontleden: patroon gevolgd door attributen, commentaar en leegte weg.
const regels = ruw.split('\n')
  .map(function (r) { return r.trim(); })
  .filter(function (r) { return r && r.charAt(0) !== '#'; })
  .map(function (r) {
    const stukken = r.split(/\s+/);
    return { patroon: stukken[0], attr: stukken.slice(1) };
  });

// Niet zelf patronen naspellen: git weet als enige hoe hij zijn eigen
// patronen leest. 'check-attr' geeft het antwoord dat de merge straks ook
// gebruikt, dus een ander maar geldig patroon (bijvoorbeeld '*.md') blijft
// hier terecht groen. Zonder git valt hij terug op de letterlijke naam.
const heeftGit = cp.spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
function unionVoor(naam) {
  if (heeftGit) {
    const uit = cp.spawnSync('git', ['-C', '..', 'check-attr', 'merge', '--', naam],
      { encoding: 'utf8' });
    if (uit.status === 0) return /:\s*merge:\s*union\s*$/.test((uit.stdout || '').trim());
  }
  return regels.some(function (r) {
    return r.patroon === naam && r.attr.indexOf('merge=union') !== -1;
  });
}

eis(regels.length > 0, 'er staat minstens één regel in');
eis(unionVoor('CHANGELOG.md'), 'CHANGELOG.md heeft merge=union');
eis(unionVoor('PIDLANE.md'), 'PIDLANE.md heeft merge=union');

// ── 2. de grens: union nooit op code ───────────────────────────────
console.log('');
console.log('2. union raakt geen code');

const CODE = ['.js', '.sh', '.html', '.css', '.json', '.yml', '.yaml', '.mjs', '.cjs'];

// Een patroon raakt code als het letterlijk op zo'n extensie eindigt, als
// het een jokerteken heeft dat er overheen kan lopen, of als het kaal is.
function raaktCode(patroon) {
  const p = patroon.toLowerCase();
  for (let i = 0; i < CODE.length; i++) {
    if (p.slice(-CODE[i].length) === CODE[i]) return CODE[i];
  }
  if (p === '*' || p === '**' || p === '.' || p === '/') return 'alles';
  // '*' of '?' zonder vaste documentextensie erachter: kan van alles raken.
  if (/[*?\[]/.test(p) && !/\.(md|txt)$/.test(p)) return 'jokerteken';
  return null;
}

regels.forEach(function (r) {
  if (r.attr.indexOf('merge=union') === -1) return;
  const raak = raaktCode(r.patroon);
  eis(!raak, 'merge=union op "' + r.patroon + '" raakt geen code' +
    (raak ? ' — maar wel ' + raak + ': een verdubbelde regel breekt daar stil' : ''));
});

// ── 3 en 4. gedrag, in een echte repo ──────────────────────────────
console.log('');
console.log('3. twee takken voegen bovenaan in, en dat merget vanzelf');

function git(map, args) {
  return cp.spawnSync('git', args, {
    cwd: map, encoding: 'utf8',
    env: Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'proef', GIT_AUTHOR_EMAIL: 'proef@pidlane',
      GIT_COMMITTER_NAME: 'proef', GIT_COMMITTER_EMAIL: 'proef@pidlane',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null'
    })
  });
}

if (!heeftGit) {
  letop('geen git op dit toestel — de gedragsproef is overgeslagen, de grens hierboven is wél gemeten');
} else {
  const map = fs.mkdtempSync(path.join(os.tmpdir(), 'plattr-'));
  try {
    git(map, ['init', '-q', '-b', 'main']);
    fs.writeFileSync(path.join(map, '.gitattributes'), ruw);

    // Drie bestanden met dezelfde vorm: twee onder union, één als controle.
    const BASIS = 'KOP\n\n### oud\ntekst van eerder\n';
    const PROEFJES = ['CHANGELOG.md', 'PIDLANE.md', 'controle.js'];
    PROEFJES.forEach(function (n) { fs.writeFileSync(path.join(map, n), BASIS); });
    git(map, ['add', '-A']);
    git(map, ['commit', '-qm', 'basis']);

    function tak(naam, merk) {
      git(map, ['checkout', '-q', '-b', naam, 'main']);
      PROEFJES.forEach(function (n) {
        const oud = fs.readFileSync(path.join(map, n), 'utf8');
        fs.writeFileSync(path.join(map, n),
          oud.replace('KOP\n', 'KOP\n\n### ' + merk + '\nregel van ' + merk + '\n'));
      });
      git(map, ['commit', '-qam', 'blok van ' + merk]);
    }
    tak('takA', 'A');
    tak('takB', 'B');

    // takB voegt takA binnen — precies de "Update branch" van een PR.
    git(map, ['checkout', '-q', 'takB']);
    const res = git(map, ['merge', '--no-edit', 'takA']);
    const botsend = git(map, ['diff', '--name-only', '--diff-filter=U']).stdout.trim().split('\n')
      .filter(function (x) { return x; });

    ['CHANGELOG.md', 'PIDLANE.md'].forEach(function (n) {
      eis(botsend.indexOf(n) === -1, n + ' botst niet meer bij het samenvoegen');
      const uit = fs.readFileSync(path.join(map, n), 'utf8');
      eis(/regel van A/.test(uit) && /regel van B/.test(uit),
        n + ' houdt beide blokken — er gaat niets verloren');
      eis(!/^<{7}|^={7}$|^>{7}/m.test(uit),
        n + ' bevat geen conflictmarkeringen');
      eis(/regel van B[\s\S]*regel van A/.test(uit),
        n + ' zet de eigen tak boven de binnengehaalde — nieuwste boven');
    });

    console.log('');
    console.log('4. tegenproef: zonder union botst dezelfde vorm wél');
    eis(botsend.indexOf('controle.js') !== -1,
      'controle.js staat niet in .gitattributes en botst dus wél — de proef hierboven meet de driver, niet het toeval');
    eis(res.status !== 0,
      'de merge als geheel faalt op dat ene bestand, dus union is geen vrijbrief voor de rest');
  } finally {
    fs.rmSync(map, { recursive: true, force: true });
  }
}

console.log('');
if (fouten) { console.log('FOUT — ' + fouten + ' eis(en) niet gehaald'); process.exit(1); }
console.log('Alles goed — union staat waar het proza is, en nergens anders.');
