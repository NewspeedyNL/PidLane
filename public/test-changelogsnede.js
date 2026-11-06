// test-changelogsnede.js — CHANGELOG.md houdt zich aan zijn vier weken
//
// De regel stond er sinds 22-09-2026 en werd twee keer niet gehaald (363 KB
// op 16-10, 313 KB op 06-11). Deze test maakt hem een poort: overspant het
// bestand meer dan MAX_DAGEN, dan wordt de PR die het nieuwste blok toevoegt
// rood, met de handeling erbij. Hij meet tussen de blokken onderling en niet
// tegen vandaag, dus hij wordt nooit rood op een dag dat er niets veranderde.
'use strict';
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', 'plsnede.js'));

let fout = 0;
function toets(naam, ok, waarom) {
  console.log((ok ? '  ok  ' : '  FOUT ') + naam + (ok || !waarom ? '' : '\n        → ' + waarom));
  if (!ok) fout++;
}

const kop = (d, t) => ' ═════════════════════════════\n ' + d + ' — ' + t + '\n ═════════════════════════════\n\n - regel\n';

console.log('1. De echte CHANGELOG.md');
const cl = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const k = S.koppen(cl);
toets('er zijn koppen gevonden (' + k.length + ')', k.length > 0,
      'de vorm ═══ / "DD-MM-JJJJ — titel" / ═══ is weg; deze test meet dan niets');
const zonder = k.filter(x => x.dag === null).map(x => x.titel);
toets('elke kop draagt een datum vooraan', zonder.length === 0,
      'zonder datum kan de snede hem niet plaatsen: ' + zonder.slice(0, 3).join(' | '));
const s = S.snede(cl);
toets('het bestand overspant hoogstens ' + S.MAX_DAGEN + ' dagen (nu ' + (s ? s.spanne : '?') + ', van ' +
      (s ? S.alsTekst(s.oudste) + ' tot ' + S.alsTekst(s.nieuwste) : '?') + ')',
      !!s && s.spanne <= S.MAX_DAGEN,
      'draai `node plsnede.js --schrijf` en commit dat als eigen, mechanische commit');

console.log('\n2. De snede zelf');
const proef = '# kop\n\n> inleiding\n\n' + kop('06-11-2026', 'nieuw') + '\n' + kop('20-10-2026', 'midden') +
              '\n' + kop('01-10-2026', 'oud') + '\n' + kop('03-10-2026', 'bijgeschreven') + '\n' + kop('20-09-2026', 'ouder');
const p = S.snede(proef);
toets('spanne is nieuwste min oudste (47)', p.spanne === 47);
const blijft = proef.split('\n').slice(0, p.vanRegel).join('\n');
toets('vier weken terug vanaf het nieuwste blijft staan', /nieuw/.test(blijft) && /midden/.test(blijft));
toets('alles ouder dan de grens gaat, ook een blok dat een plek te laag staat',
      !/— oud\b/.test(blijft) && !/bijgeschreven/.test(blijft) && !/ouder/.test(blijft));
const p2 = S.snede(kop('06-11-2026', 'nieuw') + '\n' + kop('05-10-2026', 'te hoog') + '\n' +
                   kop('20-10-2026', 'midden') + '\n' + kop('01-10-2026', 'oud'));
const blijft2 = (kop('06-11-2026', 'nieuw') + '\n' + kop('05-10-2026', 'te hoog') + '\n' + kop('20-10-2026', 'midden') +
                 '\n' + kop('01-10-2026', 'oud')).split('\n').slice(0, p2.vanRegel).join('\n');
toets('een oud blok dat te hoog staat sleept geen nieuwer blok mee', /midden/.test(blijft2) && !/— oud\b/.test(blijft2),
      'de snede zocht van boven naar het eerste oude blok en verhuisde alles eronder, ook wat binnen vier weken valt');
toets('de lege regel boven de eerste verhuisde kop gaat mee', !/\n$/.test(blijft));
const ar = S.voegIn('# archief\n\nInleiding.\n\n' + kop('01-09-2026', 'al gearchiveerd'), ' X-BLOK');
toets('het archief krijgt de blokken onder de inleiding, nieuwste boven',
      ar.indexOf('Inleiding.') < ar.indexOf('X-BLOK') && ar.indexOf('X-BLOK') < ar.indexOf('al gearchiveerd'));

console.log('\n3. Tegenproef');
const binnen = S.snede(kop('06-11-2026', 'a') + '\n' + kop('10-10-2026', 'b'));
toets('binnen vier weken verhuist er niets', binnen.vanRegel === null && binnen.spanne <= S.MAX_DAGEN);
toets('een ongesneden bestand zou hij afkeuren', p.spanne > S.MAX_DAGEN,
      'zonder deze tegenproef weet je alleen dat de toets groen kán staan');

console.log(fout ? '\ntest-changelogsnede: ' + fout + ' fout' : '\ntest-changelogsnede: alles goed');
process.exit(fout ? 1 : 0);
