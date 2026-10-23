// ══════════════════════════════════════════════════════════════════
// test-opdrachtverslag.js — het verslag zegt wat er van de meetopdrachten
// terechtkwam (#599)
// ──────────────────────────────────────────────────────────────────
// Testrun 23-10-2026 22:59: twintig minuten gereden met #594 gekozen, vier
// opstellingen gekeurd, vier keer gewisseld — en in het verslag stond niet
// of er iets verzonden was. Een verzending ging alleen naar de live-log.
//
// Getoetst: een verzending krijgt een regel in het app-log en in het blok
// MEETOPDRACHTEN, en een opdracht die afgerond is maar niet verzonden heet
// daar zo — dát is de regel waar het verslag van 23-10 om vroeg.
//
// Draaien vanuit public/:  node test-opdrachtverslag.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

const A = { naam: 'Gewone rit (#594)', proeven: [{ naam: 'gat', issue: '#594' }] };
const B = { naam: 'Contact uit (#487)', proeven: [{ naam: 'stilte', issue: '#487' }] };
const VONNIS = {
  'Gewone rit (#594)': { staat: 'gesloten', reden: 'alles binnen de grens', venster: { start: 0, s: 1260 } },
  'Contact uit (#487)': { staat: 'bevinding', reden: '3 weigeringen', venster: { start: 0, s: 95 } }
};

function laad() {
  const s = { _logs: [] };
  s.window = s;
  s.connected = false;
  s.demoMode = false;
  s.pidVals = {};
  s._pidLastUpd = {};
  s.activePIDs = new Set();
  s.console = { warn: function () { }, error: function () { }, log: function () { } };
  s.localStorage = { getItem: function () { return null; }, setItem: function () { }, removeItem: function () { }, key: function () { return null; }, length: 0 };
  s.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, classList: { add: function () { }, remove: function () { } } }; },
    querySelectorAll: function () { return []; },
    body: { appendChild: function () { } }
  };
  s.navigator = { userAgent: 'node' };
  s.setInterval = function () { return 0; };
  s.clearInterval = function () { };
  s.setTimeout = function () { return 0; };
  s.isAdmin = function () { return true; };
  s.showToast = function () { };
  s.log = function (m, n) { s._logs.push({ m: String(m), n: n }); };
  let actief = A;
  s.PLOpdracht = {
    actief: function () { return actief; },
    kies: function (o) { actief = o; return o; },
    herkomst: function () { return { id: actief === A ? '40' : '41', naam: actief.naam }; },
    meet: function () { return { staat: 'ok', detail: 'binnen' }; },
    noteer: function () { },
    oordeel: function (o) { return VONNIS[o.naam]; },
    oordeelAlle: function () {
      return [A, B].map(function (o, i) { return { id: String(40 + i), naam: o.naam, opdracht: o, vonnis: VONNIS[o.naam] }; });
    },
    keuring: function (id) { return { staat: id === '40' ? 'groen' : 'ongekeurd' }; },
    antwoordTekst: function () { return ''; },
    bewijs: function (o, v) { return { opdracht: o.naam, staat: v.staat }; },
    stuurUitkomst: function (id, sessie, v, opst, bw) { s._gestuurd.push({ id: id, sessie: sessie, staat: v.staat, opst: opst, bw: bw }); }
  };
  s._gestuurd = [];
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-testrun.js', 'utf8'), s, { filename: 'pidlane-testrun.js' });
  if (!s.PLTestrunLive || typeof s.PLTestrunLive.verzend !== 'function')
    throw new Error('PLTestrunLive.verzend() ontbreekt — is de export hernoemd?');
  if (typeof s.testrunTekst !== 'function') throw new Error('testrunTekst() ontbreekt — is hij hernoemd?');
  return s;
}

let fouten = 0;
function eis(waar, wat, extra) {
  if (waar) { console.log('  ok   ' + wat); return; }
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
  fouten++;
}

const s = laad();

console.log('1. zonder verzending zegt het verslag dat ook');
let t = s.testrunTekst();
eis(/MEETOPDRACHTEN \(2\)/.test(t), 'het blok MEETOPDRACHTEN staat erin, met beide opdrachten');
eis(/VERZONDEN DEZE SESSIE: \(niets\)/.test(t), 'er is niets verzonden, en dat staat er');
eis(/Gewone rit \(#594\)\n\s+gesloten — alles binnen de grens · rit 21:00 min · opstelling groen · AFGEROND, NIET VERZONDEN/.test(t),
  'een afgeronde opdracht die nog niet weg is heet AFGEROND, NIET VERZONDEN', t.split('MEETOPDRACHTEN')[1]);

console.log('2. na verzenden: app-log en verslag');
const r = s.PLTestrunLive.verzend();
eis(r && r.ok, 'de verzending lukt', JSON.stringify(r));
const regel = s._logs.filter(function (l) { return /^↑ Verzonden: Gewone rit \(#594\) — gesloten · opstelling groen$/.test(l.m); });
eis(regel.length === 1, 'één regel in het app-log met opdracht, uitkomst en opstelling', JSON.stringify(s._logs));
const g = s._gestuurd[0];
eis(s._gestuurd.length === 1 && g.id === '40' && /^\d{4}-\d\d-\d\d-/.test(g.sessie) && g.staat === 'gesloten' && g.opst === 'groen' && g.bw.opdracht === 'Gewone rit (#594)',
  'de uitkomst gaat met zijn bewijs, sessie en opstelling naar de second opinion (#599)', JSON.stringify(s._gestuurd));
t = s.testrunTekst();
eis(/▶ Gewone rit \(#594\)\n\s+gesloten[^\n]*· verzonden\n/.test(t), 'de actieve opdracht draagt ▶ en staat op verzonden', t.split('MEETOPDRACHTEN')[1]);
eis(/Contact uit \(#487\)\n\s+bevinding — 3 weigeringen · rit 1:35 min · opstelling ongekeurd · AFGEROND, NIET VERZONDEN/.test(t),
  'de andere opdracht blijft AFGEROND, NIET VERZONDEN');
eis(/VERZONDEN DEZE SESSIE: \n\[[^\]]+\] Gewone rit \(#594\) — gesloten · opstelling groen/.test(t), 'de verzending staat met tijd onder VERZONDEN DEZE SESSIE');

console.log('3. een nieuwe sessie is een nieuwe poging voor de bovengrens');
let pogingen = 0;
s.PLToeschouwer = { nieuwePoging: function () { pogingen++; } };
s.PLTestrunLive.nieuweSessie('proef');
eis(pogingen === 1, 'nieuweSessie() zet bij de toeschouwer een nieuwe poging', String(pogingen));

console.log(fouten ? '\n' + fouten + ' fout(en)' : '\nAlles goed.');
process.exit(fouten ? 1 : 0);
