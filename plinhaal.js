#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
// plinhaal.js — main binnenhalen, en de botsingen die geen besluit zijn
// zelf oplossen
// ──────────────────────────────────────────────────────────────────
//   node plinhaal.js                 haalt origin/main binnen
//   node plinhaal.js <ref>           of een andere basis (zonder fetch)
//
// GEMETEN OP 08-10-2026, over de inhaalmerges op main sinds 01-09: 11 van
// de 39 botsten. 8 keer plmutate.sh, 2 keer PROEVEN_B5 in
// pidlane-testrun.js, 1 keer elders. Op twee na hadden ze dezelfde vorm:
// beide takken voegden op dezelfde plek regels TOE — onderaan de
// mutatietabel, bovenaan de blok-5-lijst — en niemand veranderde een
// bestaande regel. De oplossing is dan altijd dezelfde: allebei houden.
//
// Union (.gitattributes) doet dat ook, maar mag hier niet: dit is code, en
// union verdubbelt stil een regel die beide takken veranderden. Dit script
// is smaller. Het lost een botsing alleen op als git's eigen basis-sectie
// (diff3) LEEG is: geen van beide kanten verving iets, ze voegden alleen
// toe. Staat er in de basis-sectie ook maar één regel, dan veranderden
// beide takken hetzelfde stuk, en dat blijft handwerk.
//
// Twee extra remmen:
//   - staat dezelfde lange regel (≥ 60 tekens) aan béide kanten, dan voegden
//     ze waarschijnlijk hetzelfde toe; allebei houden zou hem verdubbelen
//   - de TELLING moet kloppen: als beide kanten alleen toevoegden, staat elke
//     regel in het resultaat precies zo vaak als in onze versie plus hun
//     versie min de gemeenschappelijke basis. Nagemeten op e499d880 (10-09):
//     git deelde de botsing zo in dat de ene kant het slot van een bestaande
//     proef ("return kop; } },") meekreeg, en allebei houden zette dat slot
//     er twee keer in. node --check zag niets; deze telling wel.
//   - na het oplossen moet elk aangeraakt .js-bestand door `node --check`
//     en elk .sh-bestand door `bash -n`; anders gaat de merge terug
//
// Het script COMMIT NIET. De merge staat klaar in de index; draai je tests
// (CLAUDE.md: node --check en de test van je onderwerp) en commit dan.
//
// Exit 0 = binnengehaald (vanzelf of opgelost), 1 = er blijft handwerk
// over (de markeringen staan nog in de bestanden), 2 = niet begonnen.
//
// Test: public/test-plinhaal.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const LANG = 60;   // zo lang moet een regel zijn om als "dezelfde toevoeging" te tellen

function git(args, opt) {
  return cp.spawnSync('git', args, Object.assign({ encoding: 'utf8' }, opt || {}));
}

// Eén bestand met diff3-markeringen. Geeft de nieuwe tekst en wat er bleef.
function losOp(tekst) {
  const regels = tekst.split('\n');
  const uit = [];
  let opgelost = 0, over = 0, i = 0;
  while (i < regels.length) {
    if (!regels[i].startsWith('<<<<<<< ')) { uit.push(regels[i]); i++; continue; }
    const begin = i;
    const ons = [], basis = [], hun = [];
    let deel = ons, heeftBasis = false;
    i++;
    while (i < regels.length && !regels[i].startsWith('>>>>>>> ')) {
      if (regels[i].startsWith('||||||| ')) { deel = basis; heeftBasis = true; }
      else if (regels[i] === '=======') deel = hun;
      else deel.push(regels[i]);
      i++;
    }
    const einde = i;
    i++;
    const lang = new Set(ons.filter(function (r) { return r.trim().length >= LANG; }).map(function (r) { return r.trim(); }));
    const dubbel = hun.some(function (r) { return lang.has(r.trim()); });
    if (heeftBasis && basis.length === 0 && !dubbel && einde < regels.length) {
      Array.prototype.push.apply(uit, ons);
      Array.prototype.push.apply(uit, hun);
      opgelost++;
    } else {
      Array.prototype.push.apply(uit, regels.slice(begin, einde + 1));
      over++;
    }
  }
  return { tekst: uit.join('\n'), opgelost: opgelost, over: over };
}

// Hoe vaak staat elke regel erin?
function telling(tekst) {
  const t = new Map();
  tekst.split('\n').forEach(function (r) { t.set(r, (t.get(r) || 0) + 1); });
  return t;
}
// Klopt resultaat = ons + hun − basis voor elke regel? Zo niet, dan is er
// iets dubbel of weg, en was het geen zuivere toevoeging.
function telKlopt(resultaat, ons, hun, basis) {
  const R = telling(resultaat), O = telling(ons), H = telling(hun), B = telling(basis);
  const alle = new Set([].concat(Array.from(R.keys()), Array.from(O.keys()), Array.from(H.keys())));
  for (const r of alle) {
    if ((R.get(r) || 0) !== (O.get(r) || 0) + (H.get(r) || 0) - (B.get(r) || 0)) return r;
  }
  return null;
}
function versie(stadium, bestand) {
  const r = git(['show', ':' + stadium + ':' + bestand]);
  return r.status === 0 ? r.stdout : '';
}

function controleer(bestand) {
  if (/\.(js|mjs|cjs)$/.test(bestand)) return cp.spawnSync(process.execPath, ['--check', bestand], { encoding: 'utf8' });
  if (/\.sh$/.test(bestand)) return cp.spawnSync('bash', ['-n', bestand], { encoding: 'utf8' });
  return { status: 0 };
}

function main() {
  const ref = process.argv[2] || 'origin/main';
  if (git(['status', '--porcelain', '--untracked-files=no']).stdout.trim()) {
    console.log('Niet begonnen: er staan niet-vastgelegde wijzigingen. Commit of stash ze eerst.');
    return 2;
  }
  if (ref.startsWith('origin/')) {
    const f = git(['fetch', '-q', 'origin', ref.slice(7)]);
    if (f.status !== 0) { console.log('Niet begonnen: fetch van ' + ref + ' mislukte.\n' + f.stderr); return 2; }
  }
  const m = git(['-c', 'merge.conflictStyle=diff3', 'merge', '--no-commit', '--no-ff', ref]);
  const botst = git(['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter(Boolean);
  if (m.status !== 0 && !botst.length) { console.log('De merge mislukte zonder botsing:\n' + m.stdout + m.stderr); return 2; }
  if (!botst.length) {
    const al = /Already up to date|Al bijgewerkt/i.test(m.stdout);
    console.log(al ? 'Niets te doen: ' + ref + ' zit er al in.' : ref + ' binnengehaald zonder botsing. Draai je tests en commit.');
    return 0;
  }
  let over = 0;
  const gedaan = [];
  for (const b of botst) {
    const r = losOp(fs.readFileSync(b, 'utf8'));
    if (r.opgelost && !r.over) {
      const mis = telKlopt(r.tekst, versie(2, b), versie(3, b), versie(1, b));
      if (mis !== null) {
        console.log('  handwerk  ' + b + ' — allebei houden zet deze regel er een keer te veel of te weinig in: ' + JSON.stringify(mis.trim().slice(0, 60)));
        over += r.opgelost;
        continue;
      }
    }
    over += r.over;
    if (!r.opgelost) continue;
    fs.writeFileSync(b, r.tekst);
    gedaan.push(b + ' (' + r.opgelost + 'x allebei gehouden' + (r.over ? ', ' + r.over + 'x handwerk' : '') + ')');
    if (!r.over) {
      const c = controleer(b);
      if (c.status !== 0) {
        git(['merge', '--abort']);
        console.log('Teruggedraaid: na het oplossen is ' + b + ' geen geldige code meer.\n' + (c.stderr || ''));
        console.log('Dat is handwerk: git merge ' + ref);
        return 1;
      }
      git(['add', '--', b]);
    }
  }
  gedaan.forEach(function (g) { console.log('  opgelost  ' + g); });
  if (over) {
    const nog = git(['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter(Boolean);
    console.log('\n' + over + ' botsing(en) waar beide kanten hetzelfde stuk veranderden — handwerk:');
    nog.forEach(function (b) { console.log('  ' + b); });
    return 1;
  }
  console.log('\n' + ref + ' binnengehaald; alle botsingen waren alleen toevoegingen. Draai je tests en commit.');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { losOp: losOp, telKlopt: telKlopt };
