// ══════════════════════════════════════════════════════════════════
// test-meetcoach.js — meetproeven zonder meetkamer (24-10-2026)
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-meetcoach.js; PLOpdracht, PLToeschouwer,
// PLTestrunLive en de bus-proeven zijn nagemaakt aan hun rand.
//
// De onderscheidende vragen:
//   - één actie die twee opdrachten helpt, staat één keer in de balk
//   - een voorwaarde die al vervuld is, vraagt niets meer
//   - een situatie die deze rit niet kan (helling), sluit de opdracht uit
//   - verbreken en een minuut contact uit verzenden; dat gebeurt één keer
//   - de bus wordt alleen na een vraag overgenomen, en elke proef één keer
//   - tekst uit een opdracht komt geëscaped in de balk
//
// Draaien vanuit public/:  node test-meetcoach.js       (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

function maak() {
  const c = {
    console: { warn() {}, log() {} }, Promise, Date, JSON, Math, Object, String,
    setInterval: () => 1, clearInterval() {},
    connected: true, demoMode: false, magOntwikkelen: () => true, log() {},
    lijstN: 0, sensoren: null, verzonden: [], busRun: [], stand: { toestand: 'rijden', sinds: 0 }, alle: []
  };
  c.window = c;
  c.PLOpdracht = {
    lijst: () => { c.lijstN++; return Promise.resolve([]); },
    zetSensorenAlle: (max) => { c.sensoren = max; return ['0149']; },
    oordeelAlle: () => c.alle
  };
  c.PLToeschouwer = { stand: () => c.stand };
  c.PLTestrunLive = { verzendAlle: () => { c.verzonden.push(Date.now()); return { ok: true, aantal: 1 }; } };
  c.PLWaarneming = { lees: () => ({ status: c.canopen ? 'gezien' : 'onbekend' }) };
  c.PLMeeluister = { proef: () => { c.busRun.push('meeluister'); return Promise.resolve({ oordeel: 'open' }); } };
  c.PLM06 = { scan: () => { c.busRun.push('mode06'); return Promise.resolve({}); } };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-meetcoach.js'), 'utf8'), c, { filename: 'pidlane-meetcoach.js' });
  return c;
}
const flush = () => new Promise((r) => setImmediate(r));

(async () => {
  const M = maak().PLMeetcoach;

  console.log('\n1. Wat een voorwaarde vraagt');
  toets('contact uit 20–90 s: tel tot 30', /tel tot 30/.test(M.actieVoor({ toestand: 'contact-uit', minS: 20, maxS: 90 }).tekst));
  toets('stilstaan is een actie bij stilstaan', M.actieVoor({ toestand: 'stil', minS: 30 }).sit === 'stilstaan');
  toets('rijden doet zichzelf (geen actie)', M.actieVoor({ toestand: 'rijden', minS: 600 }).actief === false);
  toets('toeren boven 1800 is een actie', M.actieVoor({ pid: '010C', meet: 'max', tussen: [1800, 8000] }).actief === true);
  toets('onbekende voorwaarde: de tekst van de opdracht', /fietsenrek/.test(M.actieVoor({ wat: 'fietsenrek erop' }).tekst));

  console.log('\n2. Het plan');
  const o = (naam, vw) => ({ id: naam, naam, opdracht: { naam, voorwaarden: vw }, vonnis: { staat: 'nog niet', voorwaarden: vw.map(() => ({ vervuld: false })) } });
  const contact = { toestand: 'contact-uit', minS: 20, maxS: 90 }, helling = { toestand: 'helling', minS: 10 }, rijden = { toestand: 'rijden', minS: 300 };
  let alle = [o('A', [contact, rijden]), o('B', [contact]), o('C', [helling]),
    { id: 'D', naam: 'D', opdracht: { naam: 'D', voorwaarden: [] }, vonnis: { staat: 'gesloten' } }];
  let p = M.plan(alle, null);
  const c1 = p.acties.filter((a) => a.soort === 'contact')[0];
  toets('één actie voor twee opdrachten', c1 && c1.opdrachten.length === 2, JSON.stringify(p.acties));
  const dubbel = M.plan([o('E', [{ toestand: 'contact-uit', minS: 20, maxS: 90 }, { toestand: 'contact-uit', minS: 30, maxS: 90 }])], null);
  toets('een opdracht die een actie twee keer nodig heeft, telt één keer', dubbel.acties[0].opdrachten.length === 1, JSON.stringify(dubbel.acties));
  toets('gesloten telt als klaar', p.klaar === 1 && p.open === 3, JSON.stringify(p));
  toets('de actie die het meest helpt staat eerst', p.acties[0].soort === 'contact', p.acties[0].soort);
  alle[0].vonnis.voorwaarden[0].vervuld = true; alle[1].vonnis.voorwaarden[0].vervuld = true;
  p = M.plan(alle, null);
  toets('vervulde voorwaarde vraagt niets meer', !p.acties.some((a) => a.soort === 'contact'), JSON.stringify(p.acties));
  alle = [o('A', [contact]), o('C', [helling])];
  p = M.plan(alle, { duurS: 1800, sit: { stoplicht: true } });
  toets('zonder helling deze rit: de hellingopdracht valt af', p.uitgesloten === 1 && !p.acties.some((a) => a.soort === 'helling'), JSON.stringify(p));
  p = M.plan([o('L', [{ toestand: 'rijden', minS: 1200 }])], { duurS: 600, sit: {} });
  toets('20 min rijden in een rit van 10 min: valt af', p.uitgesloten === 1 && p.open === 0, JSON.stringify(p));

  console.log('\n3. De balk');
  p = M.plan([o('A', [contact]), o('C', [helling])], null);
  toets('de balk toont de eerste actie', /contact uit/.test(M.balkHtml(p, {})));
  toets('"kan nu niet" schuift naar de volgende', /helling/.test(M.balkHtml(p, { overslaan: ['contact'] })) && !/contact uit/.test(M.balkHtml(p, { overslaan: ['contact'] })));
  toets('tekst uit een opdracht wordt geëscaped', !/<img/.test(M.balkHtml(M.plan([o('X', [{ wat: '<img src=x>' }])], null), {})));
  toets('de bus-vraag heeft Ja en Later', /busJa/.test(M.balkHtml(p, { bus: 'vraag' })) && /busLater/.test(M.balkHtml(p, { bus: 'vraag' })));
  toets('de vraag: Start pas met een duur', /disabled/.test(M.vraagHtml({ duurS: 0, sit: {} })) && !/disabled/.test(M.vraagHtml({ duurS: 600, sit: {} })));

  console.log('\n4. De automatiek');
  let c = maak();
  c.PLMeetcoach.tik(); await flush(); c.PLMeetcoach.tik(); await flush();
  toets('verbonden: de lijst één keer geladen, sensoren erbij met het plafond', c.lijstN === 1 && c.sensoren === 12, c.lijstN + ' ' + c.sensoren);
  c.connected = false; c.PLMeetcoach.tik(); c.PLMeetcoach.tik();
  toets('verbreken verzendt, één keer', c.verzonden.length === 1, c.verzonden.length);
  c = maak(); c.stand = { toestand: 'contact-uit', sinds: Date.now() - 61000 };
  c.PLMeetcoach.tik(); c.PLMeetcoach.tik();
  toets('een minuut contact uit verzendt, één keer per stilte', c.verzonden.length === 1, c.verzonden.length);
  c = maak(); c.magOntwikkelen = () => false; c.PLMeetcoach.tik(); await flush();
  toets('geen admin: niets geladen, niets verzonden', c.lijstN === 0 && c.verzonden.length === 0);

  console.log('\n5. De bus');
  c = maak(); c.stand = { toestand: 'stil', sinds: Date.now() - 20000 };
  c.PLMeetcoach.tik();
  toets('zonder gekozen rit: geen bus-vraag', c.PLMeetcoach._staat().bus === null);
  c.PLMeetcoach.kiesDuur('kort'); c.PLMeetcoach.start(); c.PLMeetcoach.tik();
  toets('stil met een gekozen rit: de bus-vraag', c.PLMeetcoach._staat().bus === 'vraag');
  toets('zonder Ja draait er niets', c.busRun.length === 0);
  await c.PLMeetcoach.busJa();
  toets('Ja: de proeven één voor één, en de bus terug', c.busRun.join(',') === 'meeluister,mode06' && c.PLMeetcoach._staat().bus === null, c.busRun.join(','));
  c.PLMeetcoach.tik();
  toets('elke proef één keer per sessie: daarna geen vraag meer', c.PLMeetcoach._staat().bus === null);
  c = maak(); c.canopen = true; c.PLM06 = null; c.stand = { toestand: 'stil', sinds: Date.now() - 20000 };
  c.PLMeetcoach.kiesDuur('kort'); c.PLMeetcoach.start(); c.PLMeetcoach.tik();
  toets('niets te doen op de bus (CAN al open gezien, geen mode 06): geen vraag', c.PLMeetcoach._staat().bus === null);
  c = maak(); c.stand = { toestand: 'stil', sinds: Date.now() - 20000 };
  c.PLMeetcoach.kiesDuur('kort'); c.PLMeetcoach.start(); c.PLMeetcoach.tik(); c.PLMeetcoach.busLater(); c.PLMeetcoach.tik();
  toets('Later: vijf minuten geen vraag', c.PLMeetcoach._staat().bus === null);

  console.log('\n' + n + ' toetsen, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.log('FOUT  test gooide: ' + (e.stack || e)); process.exit(1); });
