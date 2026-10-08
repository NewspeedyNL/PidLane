// ══════════════════════════════════════════════════════════════════
// test-plinhaal.js — lost plinhaal.js alleen op wat geen besluit is?
// ──────────────────────────────────────────────────────────────────
// plinhaal.js haalt main binnen en lost een botsing zelf op als beide
// takken op dezelfde plek alleen regels TOEVOEGDEN (de diff3-basis is
// leeg). Dat was 08-10-2026 het geval bij 9 van de 11 botsende
// inhaalmerges sinds 01-09: plmutate.sh onderaan, PROEVEN_B5 bovenaan.
//
// De toets draait het echte script in echte git-repo's:
//   1. beide takken voegen een mutatie toe onderaan een tabel → opgelost,
//      beide regels erin, geen markering, exit 0, niets gecommit
//   2. TEGENPROEF: beide takken veranderen dezelfde regel → exit 1, de
//      markeringen blijven staan
//   3. TEGENPROEF: beide takken voegen dezelfde lange regel toe → niet
//      opgelost, want allebei houden verdubbelt hem
//   4. de oplossing levert ongeldige JS op → de merge gaat terug
//   5. niet-vastgelegd werk → niet begonnen (exit 2)
//
// Draaien vanuit public/:  node test-plinhaal.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', 'plinhaal.js');
let fouten = 0;
function eis(waar, wat, bewijs) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat + (bewijs ? '\n       ' + String(bewijs).slice(0, 400).replace(/\n/g, '\n       ') : ''));
  fouten++;
}

if (cp.spawnSync('git', ['--version']).status !== 0) {
  console.log('  LET OP geen git op dit toestel — niets getoetst');
  process.exit(0);
}

// Een repo met main en een tak; `basis`, `opMain` en `opTak` geven de inhoud
// van één bestand. Geeft de map terug, met de tak uitgecheckt.
function repo(naam, basis, opMain, opTak) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'plinhaal-'));
  const g = function (args) {
    const r = cp.spawnSync('git', args, { cwd: d, encoding: 'utf8' });
    if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr);
    return r;
  };
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't']);
  g(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(d, naam), basis); g(['add', '.']); g(['commit', '-qm', 'basis']);
  g(['checkout', '-q', '-b', 'tak']);
  fs.writeFileSync(path.join(d, naam), opTak); g(['commit', '-qam', 'tak']);
  g(['checkout', '-q', 'main']);
  fs.writeFileSync(path.join(d, naam), opMain); g(['commit', '-qam', 'main']);
  g(['checkout', '-q', 'tak']);
  return d;
}
function draai(d) {
  return cp.spawnSync(process.execPath, [SCRIPT, 'main'], { cwd: d, encoding: 'utf8' });
}
function lees(d, naam) { return fs.readFileSync(path.join(d, naam), 'utf8'); }
function opgeslagen(d) {
  return cp.spawnSync('git', ['log', '--oneline', '-1'], { cwd: d, encoding: 'utf8' }).stdout.trim();
}

const RIJ_A = '"public/a.js@@const x = 1;@@const x = 2;@@test-a.js@@de eerste nagebouwde fout van tak A, lang genoeg"';
const RIJ_B = '"public/b.js@@const y = 1;@@const y = 2;@@test-b.js@@de tweede nagebouwde fout van tak B, ook lang genoeg"';
const TABEL = function (rijen) { return '#!/bin/bash\nMUTATIES=(\n"bestaande@@regel@@x@@t@@oud"\n' + rijen.map(function (r) { return r + '\n'; }).join('') + ')\necho "${#MUTATIES[@]}"\n'; };

// ── 1 ────────────────────────────────────────────────────────────
console.log('\n1. beide takken voegen onderaan de tabel toe');
let d = repo('plmutate.sh', TABEL([]), TABEL([RIJ_B]), TABEL([RIJ_A]));
let r = draai(d);
let t = lees(d, 'plmutate.sh');
eis(r.status === 0, 'exit 0', r.stdout + r.stderr);
eis(t.indexOf(RIJ_A) >= 0 && t.indexOf(RIJ_B) >= 0, 'beide rijen staan erin', t);
eis(!/^(<<<<<<<|=======|>>>>>>>|\|\|\|\|\|\|\|)/m.test(t), 'geen conflictmarkering over', t);
eis(cp.spawnSync('bash', ['-n', path.join(d, 'plmutate.sh')]).status === 0, 'het script is nog geldige bash');
eis(opgeslagen(d).indexOf('tak') >= 0, 'er is niets gecommit: de merge wacht op je tests', opgeslagen(d));

// En bovenaan een JS-lijst, zoals PROEVEN_B5.
const LIJST = function (items) { return 'const P = [\n' + items.join('') + '  { naam: "oud" },\n];\n'; };
d = repo('t.js', LIJST([]), LIJST(['  { naam: "van main, een nieuwe proef bovenaan de lijst" },\n']),
  LIJST(['  { naam: "van de tak, ook een nieuwe proef bovenaan" },\n']));
r = draai(d);
t = lees(d, 't.js');
eis(r.status === 0 && /van main/.test(t) && /van de tak/.test(t), 'PROEVEN_B5-vorm: beide proeven bovenaan gehouden', r.stdout + t);

// ── 2 ────────────────────────────────────────────────────────────
console.log('\n2. TEGENPROEF: beide takken veranderen dezelfde regel');
d = repo('a.js', 'const GRENS = 10;\n', 'const GRENS = 12;\n', 'const GRENS = 15;\n');
r = draai(d);
t = lees(d, 'a.js');
eis(r.status === 1, 'exit 1: handwerk', r.stdout + r.stderr);
eis(/^<<<<<<< /m.test(t) && /12/.test(t) && /15/.test(t), 'de markeringen en beide waarden blijven staan', t);

// ── 3 ────────────────────────────────────────────────────────────
console.log('\n3. TEGENPROEF: beide takken voegen dezelfde lange regel toe');
d = repo('plmutate.sh', TABEL([]), TABEL([RIJ_A, RIJ_B]), TABEL([RIJ_A]));
r = draai(d);
t = lees(d, 'plmutate.sh');
eis(r.status === 1, 'exit 1: niet opgelost', r.stdout + r.stderr);
eis(t.split(RIJ_A).length - 1 <= 2 && /^<<<<<<< /m.test(t), 'de regel is niet stil verdubbeld; de markering staat er', t);

// ── 4 ────────────────────────────────────────────────────────────
console.log('\n4. de oplossing is geen geldige JS');
// Elke kant opent een blok dat de andere kant sluit; samen klopt het niet.
d = repo('b.js', 'function f() {\n}\n', 'function f() {\n  if (a) {\n}\n', 'function f() {\n  if (b) {\n}\n');
r = draai(d);
const status = cp.spawnSync('git', ['status', '--porcelain'], { cwd: d, encoding: 'utf8' }).stdout.trim();
eis(r.status === 1 && /geen geldige code/.test(r.stdout), 'teruggedraaid met de reden erbij', r.stdout + r.stderr);
eis(!fs.existsSync(path.join(d, '.git', 'MERGE_HEAD')) && !status, 'geen halve merge achtergelaten', status);

// ── 4b ───────────────────────────────────────────────────────────
console.log('\n4b. de telling: niets dubbel, niets weg');
// Nagemeten op e499d880 (10-09): git gaf de ene kant het slot van een
// bestaande proef mee, en allebei houden zette dat slot er twee keer in.
// node --check zag niets. Dat precies in een repo nabouwen hangt af van hoe
// git de botsing indeelt, dus hier op de echte functie met de vorm van toen.
const { telKlopt } = require(SCRIPT);
const BASIS = 'const P = [\n  { a: 1,\n      return kop;\n  },\n];\n';
const ONS = 'const P = [\n  { x: 1 },\n  { a: 1,\n      return kop;\n  },\n];\n';
const HUN = 'const P = [\n  { y: 1 },\n  { a: 1,\n      return kop;\n  },\n];\n';
const GOED = 'const P = [\n  { x: 1 },\n  { y: 1 },\n  { a: 1,\n      return kop;\n  },\n];\n';
const DUBBEL = 'const P = [\n  { x: 1 },\n      return kop;\n  { y: 1 },\n  { a: 1,\n      return kop;\n  },\n];\n';
eis(telKlopt(GOED, ONS, HUN, BASIS) === null, 'twee zuivere toevoegingen: de telling klopt');
eis(telKlopt(DUBBEL, ONS, HUN, BASIS) === '      return kop;', 'een regel te veel wordt gevonden, met de regel erbij', telKlopt(DUBBEL, ONS, HUN, BASIS));
eis(telKlopt(GOED.replace('  { y: 1 },\n', ''), ONS, HUN, BASIS) === '  { y: 1 },', 'een toevoeging die wegvalt wordt ook gevonden');

// ── 5 ────────────────────────────────────────────────────────────
console.log('\n5. niet-vastgelegd werk');
d = repo('plmutate.sh', TABEL([]), TABEL([RIJ_B]), TABEL([RIJ_A]));
fs.appendFileSync(path.join(d, 'plmutate.sh'), '# half werk\n');
r = draai(d);
eis(r.status === 2 && /niet-vastgelegde/.test(r.stdout), 'exit 2, niet begonnen', r.stdout);
eis(/# half werk/.test(lees(d, 'plmutate.sh')), 'het werk staat er nog');

console.log('\n' + (fouten ? fouten + ' fout(en)' : 'Alles goed — plinhaal lost alleen toevoegingen op.'));
process.exit(fouten ? 1 : 0);
