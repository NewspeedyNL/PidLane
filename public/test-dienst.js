// ══════════════════════════════════════════════════════════════════
// test-dienst.js — PLDienst: zegt de app wélke dienst stoort? (20-11-2026)
// ──────────────────────────────────────────────────────────────────
// Op 20-11 gaf het RDW 530 en zag de klant "RDW antwoordde niet goed": dat
// leek de app. Deze test laadt pidlane-dienst.js en de dienstfuncties uit
// worker.js (geknipt, niet overgeschreven) en toetst wat de klant leest.
//
// Draaien vanuit public/:  node test-dienst.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0, fout = 0;
function t(naam, gemeten, verwacht) {
  if (String(gemeten) === String(verwacht)) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + gemeten + ', wilde ' + verwacht); }
}

// ── de module, met een nep-net ────────────────────────────────────
function bouw(net) {
  const s = { console: { log() { }, warn() { }, info() { }, error() { } }, _toasts: [], _net: net || {} };
  s.window = s;
  s.navigator = { onLine: true };
  s.addEventListener = () => { };
  s.setTimeout = () => 0; s.setInterval = () => 0;
  s.showToast = (m) => { s._toasts.push(m); };
  s.plFetch = async (pad) => {
    if (s._net.weg) throw new Error('netwerk onbereikbaar bij ' + pad);
    return { ok: true, json: async () => s._net.j };
  };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-dienst.js'), 'utf8'), s, { filename: 'pidlane-dienst.js' });
  return s;
}

// ── de Worker: dienstRdw/dienstAi geknipt uit worker.js ───────────
const W = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
function knip(van, tot) {
  const i = W.indexOf(van), j = W.indexOf(tot, i);
  if (i < 0 || j < 0) { console.error('FOUT: "' + van + '" niet in worker.js'); process.exit(1); }
  return W.slice(i, j);
}
const WK = new Function('BRON_TRAAG_MS', 'bronJson', '__name',
  knip('function dienstRdw(h)', '__name(dienstRdw') + knip('function dienstAi(h)', '__name(dienstAi') + 'return { dienstRdw, dienstAi };')(
  4000, (x) => { try { return JSON.parse(x); } catch (e) { return undefined; } }, () => { });

(async () => {
  console.log('\n1. Worker: RDW en de statuspagina van Anthropic');
  const r = (h) => { const u = WK.dienstRdw(h); return u.status + (u.detail ? ':' + u.detail : ''); };
  t('RDW 530 (20-11-2026) = storing met de code', r({ http: 530, ms: 300, tekst: '' }), 'storing:code 530');
  t('RDW geen antwoord = storing', r({ http: 0, ms: 8000, fout: 'geen antwoord binnen 8 s' }), 'storing:geen antwoord binnen 8 s');
  t('RDW 200 met een lijst = goed', r({ http: 200, ms: 300, tekst: '[{"kenteken":"XX"}]' }), 'goed');
  t('RDW 200 maar een HTML-foutpagina = storing', /^storing/.test(r({ http: 200, ms: 300, tekst: '<html>' })), true);
  t('RDW 429 = traag (overbelast), geen storing', r({ http: 429, ms: 300, tekst: '' }), 'traag:overbelast (429)');
  t('RDW 200 in 5 s = traag', /^traag/.test(r({ http: 200, ms: 5000, tekst: '[]' })), true);
  const a = (ind) => WK.dienstAi({ http: 200, tekst: JSON.stringify({ status: { indicator: ind, description: 'x' } }) }).status;
  t('Anthropic none/minor/major/critical', ['none', 'minor', 'major', 'critical'].map(a).join(','), 'goed,verstoord,storing,storing');
  t('statuspagina zelf weg = onbekend, geen alarm', WK.dienstAi({ http: 0 }).status, 'onbekend');

  console.log('\n2. De tekst bij een mislukte RDW-vraag');
  const s = bouw();
  const D = s.PLDienst;
  t('530: storing, met code, en niet de app', /storing \(code 530\)\. Dat ligt niet aan PidLane/.test(D.rdwTekst(530)), true);
  t('429: overbelast', /overbelast/.test(D.rdwTekst(429)), true);
  t('401: inloggen', /Log eerst in/.test(D.rdwTekst(401)), true);
  t('404: geen storing, wel de code', !/storing/.test(D.rdwTekst(404)) && /404/.test(D.rdwTekst(404)), true);

  console.log('\n3. Meldingen: wat de klant leest');
  const m = (st, on) => D.meldingen(st, on).map((x) => x.dienst + x.ernst).join(',');
  t('alles goed = niets', m({ rdw: { status: 'goed' }, ai: { status: 'goed' }, server: { status: 'goed' } }, true), '');
  t('offline wint van alles, en zegt dat de meting werkt', m({ rdw: { status: 'storing' } }, false) + ' ' + /adapter werkt gewoon/.test(D.meldingen({}, false)[0].tekst), 'net2 true');
  t('server weg = rood, RDW-storing = oranje, AI-verstoring = oranje', m({ server: { status: 'onbereikbaar' }, rdw: { status: 'storing' }, ai: { status: 'verstoord' } }, true), 'server2,rdw1,ai1');
  t('AI onbekend (statuspagina weg) = geen melding', m({ ai: { status: 'onbekend' } }, true), '');

  console.log('\n4. De achtergrondcheck');
  let n = D.verwerk({}, null, 0);
  t('één misser: server nog niet onbereikbaar', n.stand.server === undefined && n.mis === 1, true);
  n = D.verwerk(n.stand, null, n.mis);
  t('twee missers op rij: onbereikbaar', n.stand.server.status, 'onbereikbaar');
  n = D.verwerk(n.stand, { diensten: { rdw: { status: 'storing', detail: 'code 530' }, ai: { status: 'goed' } } }, n.mis);
  t('antwoord: server goed, missers terug op 0, RDW-storing overgenomen', [n.stand.server.status, n.mis, n.stand.rdw.status, n.stand.rdw.detail].join(','), 'goed,0,storing,code 530');

  console.log('\n5. Eén melding per omslag, niet bij elke check');
  const b = bouw({ j: { diensten: { rdw: { status: 'storing', detail: 'code 530' }, ai: { status: 'goed' } } } });
  await b.PLDienst.check();
  await b.PLDienst.check();
  t('twee checks met dezelfde storing: één toast', b._toasts.length, 1);
  t('de toast noemt het RDW', /RDW/.test(b._toasts[0]), true);
  b._net.j = { diensten: { rdw: { status: 'goed' }, ai: { status: 'goed' } } };
  await b.PLDienst.check();
  b._net.j = { diensten: { rdw: { status: 'storing', detail: 'code 530' }, ai: { status: 'goed' } } };
  await b.PLDienst.check();
  t('hersteld en daarna opnieuw stuk: een nieuwe toast', b._toasts.length, 2);
  const c = bouw();
  c.PLDienst.zie('rdw', 530);
  t('zelf gezien (plFetch): RDW 530 = storing en een toast', c.PLDienst.stand().rdw.status + ' ' + c._toasts.length, 'storing 1');
  c.PLDienst.zie('rdw', 404);
  t('een 404 (kenteken bestaat niet) verandert de stand niet', c.PLDienst.stand().rdw.status, 'storing');
  c.PLDienst.zie('rdw', 200);
  t('een goed antwoord herstelt hem', c.PLDienst.stand().rdw.status, 'goed');
  const w = bouw({ weg: true });
  await w.PLDienst.check(); await w.PLDienst.check();
  t('server twee keer onbereikbaar: rood', w.PLDienst.ernst(), 2);

  console.log('\n6. Bedrading: plFetch geeft RDW-antwoorden door, de RDW-plekken gebruiken rdwTekst');
  const lees = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  t('plFetch meldt /proxy-antwoorden van opendata.rdw.nl', /PLDienst\.zie\('rdw', resp\.status\)/.test(lees('pidlane-plfetch.js')), true);
  // Het patroon in plFetch moet een echte encodeURIComponent-URL vangen.
  const pf = lees('pidlane-plfetch.js').match(/if\((\/\^\\\/proxy[^)]*?\/i)\.test/);
  t('dat patroon past op de vorm die de app echt verstuurt', !!pf && new Function('return ' + pf[1])().test('/proxy?url=' + encodeURIComponent('https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=AB12CD')), true);
  t('vier RDW-plekken met rdwTekst', ['pidlane-bt.js', 'pidlane-koopcheck.js', 'pidlane-garage.js', 'pidlane-zonder.js'].filter((f) => /PLDienst\.rdwTekst\(/.test(lees(f))).length, 4);
  t('index.html laadt pidlane-dienst.js direct na plfetch', /pidlane-plfetch\.js"><\/script>[^\n]*\n<script src="pidlane-dienst\.js">/.test(lees('index.html')), true);

  console.log('\n─────────────────────────────────────────');
  console.log(ok + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error('FOUT: ' + (e && e.stack || e)); process.exit(1); });
