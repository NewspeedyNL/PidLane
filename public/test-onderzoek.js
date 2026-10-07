// ══════════════════════════════════════════════════════════════════
// test-onderzoek.js — PLOnderzoek, het volledige onderzoek (#428)
// ──────────────────────────────────────────────────────────────────
// Toetst wat de onderzoeker BESLIST: welke stap hij kiest, hoe hij het bewijs
// weegt, wanneer hij een andere richting op gaat, wanneer hij verbreedt en
// wanneer hij stopt. Daarvoor draait de echte draai() — dezelfde lus als in
// de app — met een nep-auto als uitvoerder. De foutcodes komen uit de echte
// leesUit() van pidlane-foutcodes.js tegen zijn eigen demo-ECU.
//
// Draaien vanuit public/:  node test-onderzoek.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fouten = 0, aantal = 0;
function eis(waar, wat, extra) {
  aantal++;
  if (waar) { console.log('  ok   ' + wat); return; }
  fouten++;
  console.log('  FOUT ' + wat + (extra ? '\n       ' + extra : ''));
}

const s = {};
s.window = s; s.globalThis = s;
s.console = { log() { }, warn() { }, error() { } };
s.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
s.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, addEventListener() { } }), addEventListener() { }, head: { appendChild() { } }, body: { appendChild() { } } };
s.addEventListener = () => { };
s.navigator = {};
s.setTimeout = (fn) => { fn(); return 0; };
s.setInterval = () => 0; s.clearTimeout = () => { }; s.clearInterval = () => { };
vm.createContext(s);
['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-onderzoek.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), s, { filename: f }));
const O = s.PLOnderzoek, F = s.PLFoutcodes;
if (!O || typeof O.draai !== 'function') throw new Error('PLOnderzoek.draai niet gevonden');

const GEZOND = { '010C': 760, '0106': 1, '0107': 2, '0110': 3.2, '0142': 14.1, '0105': 90, '010F': 22, '0133': 101, '010B': 30, '0104': 20, '010D': 0, '0115': 0.7 };
const GEEN_CODES = { codes: { bevestigd: [], pending: [], permanent: [] }, gelezen: { bevestigd: true, pending: true, permanent: true }, readiness: null, sinds: {} };

/* Een nep-auto. waarde(pid, stapId, i) geeft de meting; antwoorden per
   vraag-id; scan is de uitlezing (of 'demo' voor de echte demo-ECU). */
function nepAuto(opt) {
  return async function (stap, st) {
    if (stap.soort === 'vraag') {
      const w = (opt.antwoorden || {})[stap.id];
      return w ? { w } : { overgeslagen: true, reden: 'test' };
    }
    if (stap.soort === 'lezen') {
      if (opt.scan === 'demo') return { scan: await F.leesUit(F.demoStuur()) };
      return { scan: opt.scan || GEEN_CODES };
    }
    const reeks = {}, ontbreekt = [];
    stap.pids.forEach((p) => {
      if (st.ctx.beschikbaar && !st.ctx.beschikbaar(p)) { ontbreekt.push(p); return; }
      reeks[p] = [];
      for (let i = 0; i < 30; i++) reeks[p].push(opt.waarde(p, stap.id, i));
    });
    return { reeks, ontbreekt };
  };
}
const gezond = (over) => (p, stap, i) => {
  const o = over && over(p, stap, i);
  if (o !== undefined) return o;
  if (p === '0114') return i % 2 ? 0.15 : 0.75;
  return GEZOND[p] !== undefined ? GEZOND[p] + Math.sin(i) * 0.01 : null;
};
const ids = (l) => l.map((x) => x.id || x);
const stappen = (st) => st.log.filter((l) => l.soort === 'stap').map((l) => l.stap);

(async function () {
  console.log('\n1. Klacht uit vrije tekst');
  eis(JSON.stringify(O.klachtUitTekst('Hij is onrustig stationair en verbruikt veel')) === JSON.stringify(['onrustig', 'verbruik']), 'onrustig + verbruik herkend', JSON.stringify(O.klachtUitTekst('Hij is onrustig stationair en verbruikt veel')));
  eis(!O.klachtUitTekst('').length, 'lege tekst → geen klacht');

  console.log('\n2. De demo-auto: een lek, gevonden langs een andere richting');
  let st = O.nieuw({ klachten: ['onrustig'], liters: 2.0 });
  eis(Object.keys(st.v).indexOf('kat') < 0, 'de katalysator is bij "onrustig" geen verdenking');
  await O.draai(st, nepAuto({ scan: 'demo', waarde: (p, stap) => O.demoWaarde(p, stap) }));
  const c = st.uitkomst, volg = stappen(st);
  eis(volg[0] === 'codes', 'eerst de foutcodes', volg.join());
  eis(volg.indexOf('stationair') >= 0 && volg.indexOf('toeren2500') > volg.indexOf('stationair'), 'stationair vóór 2500 tpm', volg.join());
  eis(c.oordeel === 'gevonden' && c.top[0].id === 'valselucht', 'conclusie: valse lucht, bevestigd', JSON.stringify(c.top.map((x) => [x.id, x.score])));
  eis(st.log.some((l) => (l.nieuw || []).indexOf('kat') >= 0), 'P0420 opent de katalysator als nieuwe richting');
  eis(O.status(st.v.injector.score) === 'uitgesloten' || O.status(st.v.injector.score) === 'onwaarschijnlijk', 'een lekkende injector is van tafel (positieve trim)', st.v.injector.score);
  eis(st.v.misfire.bewijs.some((b) => /P0301/.test(b.t) && /nog niet bevestigd/.test(b.t) && b.d < 3), 'P0301 in afwachting weegt minder dan een bevestigde code');
  eis(c.top[0].bewijs.some((b) => /\+1[0-9],?\d* %/.test(b.t)), 'het bewijs draagt de gemeten trim', JSON.stringify(c.top[0].bewijs.map((b) => b.t)));
  const tekst = O.alsTekst(st);
  eis(/=== CONCLUSIE ===/.test(tekst) && /Valse lucht/.test(tekst) && /=== VERLOOP ===/.test(tekst), 'het rapport heeft conclusie en verloop');
  eis(/=== NOG OPEN, MET AANWIJZINGEN ===[\s\S]*Katalysator[\s\S]*P0420/.test(tekst), 'de katalysator staat als tegenstrijdig open, met P0420 erbij');

  console.log('\n3. Hetzelfde begin, maar de trim blijft hoog bij 2500 tpm');
  st = O.nieuw({ klachten: ['onrustig'], liters: 2.0 });
  await O.draai(st, nepAuto({ waarde: gezond((p, stap) => (p === '0107' ? 12 : p === '010C' && stap === 'toeren2500' ? 2500 : undefined)) }));
  eis(O.status(st.v.valselucht.score) !== 'bevestigd', 'geen valse lucht als de trim niet herstelt', st.v.valselucht.score);
  eis(st.v.maf.score > st.v.valselucht.score, 'de luchtmassameter komt boven het lek', JSON.stringify([st.v.maf.score, st.v.valselucht.score]));
  eis(!!st.v.brandstofdruk, 'brandstofdruk komt als nieuwe richting in beeld');

  console.log('\n4. Een lege accu');
  st = O.nieuw({ klachten: ['start'] });
  await O.draai(st, nepAuto({ waarde: gezond((p, stap) => (p === '0142' && stap === 'rust' ? 11.9 : undefined)), antwoorden: { startgedrag: 'traag' } }));
  eis(st.uitkomst.top[0] && st.uitkomst.top[0].id === 'accu' && st.uitkomst.oordeel === 'gevonden', 'accu bevestigd', JSON.stringify(st.uitkomst.top.map((x) => [x.id, x.score])));
  eis(O.status(st.v.laad.score) === 'onwaarschijnlijk' || O.status(st.v.laad.score) === 'uitgesloten', 'de dynamo is vrijgesproken (14,1 V)', st.v.laad.score);
  eis(stappen(st).indexOf('laden') > stappen(st).indexOf('rust'), 'na "accu zwak" kijkt hij nog of de dynamo laadt', stappen(st).join());

  console.log('\n5. Een gezonde auto: verbreden, en eerlijk stoppen');
  st = O.nieuw({ klachten: ['warm'] });
  await O.draai(st, nepAuto({ waarde: gezond(), antwoorden: { looptijd: 'lang', koud: 'nee' } }));
  eis(st.log.some((l) => l.soort === 'verbreed'), 'na de klacht-verdenkingen verbreedt hij');
  eis(st.uitkomst.oordeel === 'niets', 'conclusie: niets gevonden', st.uitkomst.oordeel);
  eis(st.stappen <= O.cfg.maxStappen, 'en hij stopt binnen ' + O.cfg.maxStappen + ' stappen', st.stappen);
  eis(O.status(st.v.koeling.score) !== 'open' && O.status(st.v.thermostaat.score) !== 'open', 'koeling en thermostaat zijn beoordeeld', JSON.stringify([st.v.koeling.score, st.v.thermostaat.score]));

  console.log('\n6. Sensoren die de auto niet levert zijn onbekend, geen tegenbewijs');
  st = O.nieuw({ klachten: ['onrustig'], beschikbaar: (p) => ['0106', '0107', '0110'].indexOf(p) < 0 });
  await O.draai(st, nepAuto({ waarde: gezond() }));
  eis(!st.v.valselucht.bewijs.some((b) => /trim/.test(b.t)), 'zonder trims geen trim-oordeel over valse lucht');
  eis(stappen(st).indexOf('toeren2500') < 0, 'de 2500-tpm-proef wordt niet gedaan zonder trim om te vergelijken');

  console.log('\n7. Software als oorzaak (#426)');
  st = O.nieuw({ klachten: ['onrustig'], merk: 'Volkswagen Golf', brandstof: 'benzine', vervangen: ['gasklep'] });
  eis(!!st.v.software, 'een vervangen onderdeel zet software in spel');
  await O.draai(st, nepAuto({ waarde: gezond(), scan: { codes: { bevestigd: ['P0507'], pending: [], permanent: [] }, gelezen: { bevestigd: true, pending: true, permanent: true }, readiness: null, sinds: {} } }));
  eis(O.status(st.v.software.score) === 'waarschijnlijk' || O.status(st.v.software.score) === 'bevestigd', 'P0507 na een nieuwe gasklep wijst naar inleren', st.v.software.score);
  eis((st.metingen.software || []).some((a) => a.tools.indexOf('VCDS') >= 0), 'met de VAG-software erbij');

  console.log('\n7b. De laaddrukproef alleen in de garagemodus');
  const turbo = (garage) => O.nieuw({ klachten: ['vermogen'], garage });
  const zonder = turbo(false), met = turbo(true);
  eis(O.vooruit(zonder, 20).every((x) => x.id !== 'laaddruk'), 'zonder garagemodus komt de rijproef nooit in het plan');
  eis(O.vooruit(met, 20).some((x) => x.id === 'laaddruk'), 'in de garagemodus wel  <- tegenproef');

  console.log('\n8. De kaart klopt');
  const V = O.VERDENKINGEN, alleH = [];
  Object.keys(O.KLACHTEN).forEach((k) => O.KLACHTEN[k].h.forEach((h) => { alleH.push(h); }));
  O.STAPPEN.forEach((x) => { Object.keys(x.test).forEach((h) => alleH.push(h)); (x.opties || []).forEach((o) => (o.b || []).forEach((b) => alleH.push(b.h))); });
  O.CODEREGELS.forEach((r) => alleH.push(r.h));
  const onbekend = alleH.filter((h) => !V[h]);
  eis(!onbekend.length, 'elke verdenking die genoemd wordt bestaat', onbekend.join());
  const stapIds = O.STAPPEN.map((x) => x.id);
  eis(O.STAPPEN.every((x) => (x.na || []).every((n) => stapIds.indexOf(n) >= 0)), 'elke "na" wijst naar een bestaande stap');
  const geenDef = [].concat(...O.STAPPEN.map((x) => x.pids || [])).filter((p) => !s.ALL_PID_DEFS[p]);
  eis(!geenDef.length, 'elke PID staat in ALL_PID_DEFS', geenDef.join());
  eis(O.STAPPEN.filter((x) => x.soort === 'meten').every((x) => typeof x.beoordeel === 'function' && x.duurMs > 0), 'elke meetstap heeft een duur en een oordeel');
  const ondekt = Object.keys(V).filter((h) => !O.STAPPEN.some((x) => x.test[h]));
  eis(!ondekt.length, 'voor elke verdenking bestaat een stap die haar toetst', ondekt.join());

  console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT test brak af: ' + (e.stack || e)); process.exit(1); });
