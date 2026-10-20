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
['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-mode06.js', 'pidlane-onderzoek.js'].forEach((f) =>
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
    if (stap.soort === 'mode06') return opt.m06 ? { m06: opt.m06 } : { overgeslagen: true, reden: 'test' };
    if (stap.soort === 'lezen') {
      if (opt.scan === 'demo') return { scan: await F.leesUit(F.demoStuur()) };
      return { scan: opt.scan || GEEN_CODES, snap: opt.snap, kaart: opt.kaart };
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

  console.log('\n6b. Brandstofdruk en breedbandsonde (#428)');
  {
    const S = (id) => O.STAPPEN.filter((x) => x.id === id)[0];
    const RD = S('raildruk'), BB = S('breedband');
    eis(RD && BB, 'de stappen raildruk en breedband bestaan');
    const rpm = Array.from({ length: 30 }, (_, i) => (i < 15 ? 750 : 2500));
    const druk = (laag, hoog) => rpm.map((r, i) => (r < 1200 ? laag : hoog) + (i % 3));
    const v = (r) => r.filter((x) => x.h === 'brandstofdruk').map((x) => x.d).reduce((a, b) => a + b, 0);
    eis(v(RD.beoordeel({ reeks: { '0123': druk(5000, 3500), '010C': rpm } })) >= 2.5, 'raildruk zakt 30 % bij 2500 tpm: brandstofdruk verdacht');
    eis(v(RD.beoordeel({ reeks: { '0123': druk(5000, 5300), '010C': rpm } })) <= -2, 'raildruk houdt stand: brandstofdruk van tafel');
    eis(v(RD.beoordeel({ reeks: { '0123': druk(5000, 4600), '010C': rpm } })) === 0, 'een zakje van 8 % zegt niets, in geen van beide richtingen');
    eis(v(RD.beoordeel({ reeks: { '010A': druk(150, 150), '010C': rpm } })) >= 2, 'oude injectiemotor met 150 kPa: te laag');
    eis(v(RD.beoordeel({ reeks: { '0159': druk(5000, 3500), '010C': rpm } })) >= 2.5, 'ook de absolute raildruk (0159) telt');
    let r = RD.beoordeel({ reeks: { '010C': rpm } });
    eis(r.length === 1 && r[0].h === null, 'zonder brandstofdruk: niet beoordeeld, geen tegenbewijs', JSON.stringify(r));
    r = RD.beoordeel({ reeks: { '0123': druk(5000, 5000) } });
    eis(!r.some((x) => x.h === 'brandstofdruk' && x.d < 0), 'zonder toerental geen vrijspraak: stationair en 2500 tpm zijn niet te scheiden', JSON.stringify(r));

    const lam = (rust, piek) => rpm.map((x, i) => (i === 20 || i === 21 || i === 26 ? piek : rust + (i % 2 ? 0.005 : -0.005)));
    const h = (r, id) => r.filter((x) => x.h === id).map((x) => x.d).reduce((a, b) => a + b, 0);
    let st2 = O.nieuw({ klachten: ['lampje'] });
    eis(h(BB.beoordeel({ reeks: { '0124': rpm.map(() => 1.0), '010C': rpm } }, st2), 'lambda') >= 2.5, 'een breedbandsonde die stilstaat: sonde verdacht');
    eis(h(BB.beoordeel({ reeks: { '0124': lam(1.0, 1.9), '010C': rpm } }, st2), 'lambda') <= -2, 'de sonde ziet de brandstofafsluiting: sonde van tafel');
    eis(h(BB.beoordeel({ reeks: { '0134': lam(1.09, 1.9), '010C': rpm, '0144': rpm.map(() => 1.0) } }, st2), 'valselucht') >= 1, 'λ 1,09 stationair waar 1,00 gevraagd is: arm, past bij valse lucht');
    eis(h(BB.beoordeel({ reeks: { '0124': lam(0.92, 1.9), '010C': rpm } }, st2), 'injector') >= 1, 'λ 0,92 stationair: rijk, past bij een injector');
    r = BB.beoordeel({ reeks: { '010C': rpm } }, st2);
    eis(r.length === 1 && r[0].h === null, 'zonder breedbandsonde: niet beoordeeld');

    const kan = (b) => O.vooruit(O.nieuw({ klachten: ['vermogen', 'lampje', 'verbruik'], beschikbaar: b }), 20).map((x) => x.id);
    const zonder = kan((p) => ['0123', '0159', '010A', '0124', '0134'].indexOf(p) < 0), met = kan(() => true);
    eis(zonder.indexOf('raildruk') < 0 && zonder.indexOf('breedband') < 0, 'een auto zonder raildruk of breedband krijgt die stappen niet, ook al levert hij toeren', zonder.join());
    eis(met.indexOf('raildruk') >= 0 && met.indexOf('breedband') >= 0, 'een auto die ze wel levert, krijgt ze in het plan', met.join());
  }

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

  console.log('\nGeen klacht: de brede ronde (#434)');
  {
    const BREDE = ['valselucht', 'maf', 'lambda', 'kat', 'thermostaat', 'accu', 'laad', 'misfire'];
    let st = O.nieuw({ klachten: ['controle'], brandstof: 'benzine' });
    eis(JSON.stringify(Object.keys(st.v).sort()) === JSON.stringify(BREDE.slice().sort()), 'benzine: precies de brede ronde', Object.keys(st.v).join());
    eis(/^Geen klacht, brede controle\. 8 verdenkingen/.test(st.log[0].t), 'het verslag zegt dat er geen klacht was', st.log[0].t);
    st = O.nieuw({ klachten: ['controle'], brandstof: 'diesel' });
    eis(['dpf', 'egr', 'software'].every((h) => !!st.v[h]) && Object.keys(st.v).length === 11, 'diesel: roetfilter, EGR en software erbij', Object.keys(st.v).join());
    st = O.nieuw({ klachten: ['controle'], brandstof: 'hybride' });
    eis(!st.v.dpf, 'een hybride krijgt geen roetfilter');
    eis(O.klachtUitTekst('niets aan de hand, alles prima').indexOf('controle') < 0, 'vrije tekst zet de controle nooit aan');
    st = O.nieuw({ klachten: ['controle', 'warm'], brandstof: 'benzine' });
    eis(!!st.v.koeling && !!st.v.valselucht && /^Klacht: /.test(st.log[0].t), 'controle naast een klacht: allebei, en het heet een klacht');
    // Een gezonde auto: de brede ronde vindt niets en zegt dat.
    st = O.nieuw({ klachten: ['controle'], brandstof: 'benzine', liters: 2.0 });
    await O.draai(st, nepAuto({ waarde: gezond() }));
    const best = Object.keys(st.v).filter((h) => O.status(st.v[h].score) === 'bevestigd');
    eis(!best.length, 'gezonde auto: niets bevestigd', best.join());
    eis(Object.keys(st.v).some((h) => /uitgesloten|onwaarschijnlijk/.test(O.status(st.v[h].score))), 'gezonde auto: er is iets uitgesloten', JSON.stringify(Object.keys(st.v).map((h) => [h, st.v[h].score])));
    // De knop bij Check mijn auto: alleen bij groen.
    const groen = F._tekenOordeel(GEEN_CODES);
    const rood = F._tekenOordeel({ codes: { bevestigd: ['P0171'], pending: [], permanent: [] }, gelezen: GEEN_CODES.gelezen, readiness: null, sinds: {} });
    eis(/_vervolg\('controle'\)/.test(groen), 'groen: "Toch grondig onderzoeken"', groen.slice(-400));
    eis(!/_vervolg\('controle'\)/.test(rood) && /_vervolg\('oorzaak'\)/.test(rood), 'rood: "Oorzaak laten zoeken" en geen controle');
  }

  console.log('\n9. Wat bij het merk bekend is, stuurt het onderzoek');
  {
    // De echte autoKennisVoorMerk() uit pidlane-motortype.js, zoals test-weten.js.
    const mt = fs.readFileSync(__dirname + '/pidlane-motortype.js', 'utf8');
    const ki = mt.indexOf('function autoKennisVoorMerk(merk, brandstof, auto){'), kj = mt.indexOf('\n}\n', ki);
    eis(ki >= 0 && kj > ki, 'autoKennisVoorMerk() staat nog in pidlane-motortype.js');
    vm.runInContext(mt.slice(ki, kj + 2), s, { filename: 'autoKennisVoorMerk' });

    let st = O.nieuw({ klachten: ['controle'], merk: 'Volkswagen Golf', brandstof: 'benzine' });
    eis(!!st.v.distributie && /ketting/.test(st.v.distributie.bekend || ''), 'VW benzine: de ketting wordt een verdenking', JSON.stringify(st.v.distributie));
    eis(!!st.v.koeling && !!st.v.koeling.bekend, 'en de waterpomp (koeling)');
    eis(!st.v.egr && !st.v.dpf, 'een benzine-VW krijgt geen EGR of roetfilter uit de dieselkennis', Object.keys(st.v).join());
    eis(Object.keys(st.v).every((h) => st.v[h].score === 0), 'kennis is geen bewijs: alle scores 0');
    eis(st.log.some((l) => l.soort === 'kennis' && /Volkswagen bekend/.test(l.t)), 'het verloop zegt wat er bekend is');
    const met = O.vooruit(st, 20).map((x) => x.id);
    const zonder = O.vooruit(O.nieuw({ klachten: ['controle'], merk: 'Volkswagen Golf', brandstof: 'benzine', kennis: null }), 20).map((x) => x.id);
    eis(met.indexOf('koudstartgeluid') >= 0 && zonder.indexOf('koudstartgeluid') < 0, 'met kennis staat de koude-startvraag in het plan, zonder niet  <- tegenproef', met.join() + ' | ' + zonder.join());

    // De kennis bepaalt wat eerst komt (KENNIS_GEWICHT).
    const plan = (kennis) => O.vooruit(O.nieuw({ klachten: ['lampje'], kennis }), 10).map((x) => x.id);
    const mk = plan({ merk: 'x', zwak: ['thermostaat'] }), zk = plan(null);
    eis(mk.indexOf('temperatuur') < mk.indexOf('stationair') && zk.indexOf('temperatuur') > zk.indexOf('stationair'),
      'een bekende thermostaat haalt de temperatuurstap naar voren  <- tegenproef zonder kennis', mk.join() + ' | ' + zk.join());

    // Bij een klacht alleen wat erbij past.
    st = O.nieuw({ klachten: ['elektrisch'], merk: 'Volkswagen', brandstof: 'benzine' });
    eis(!st.v.distributie, 'bij een accuklacht geen ketting-onderzoek', Object.keys(st.v).join());
    eis(st.kennis.andereKlacht.some((t) => /ketting/.test(t)), 'maar wel genoemd als "past niet bij deze klacht"');

    // Bevestigd door een code; onbewezen kennis staat als niet getoetst in het rapport.
    st = O.nieuw({ klachten: ['controle'], merk: 'Volkswagen', brandstof: 'benzine' });
    await O.draai(st, nepAuto({ waarde: gezond(), antwoorden: { koudstartgeluid: 'kort' },
      scan: { codes: { bevestigd: ['P0016'], pending: [], permanent: [] }, gelezen: GEEN_CODES.gelezen, readiness: null, sinds: {} } }));
    eis(O.status(st.v.distributie.score) === 'bevestigd', 'P0016 + ratel bij koude start: distributie bevestigd', st.v.distributie.score);
    const t = O.alsTekst(st);
    eis(/=== BEKEND BIJ DIT MERK \(volkswagen\) ===[\s\S]*Distributie[^\n]*bevestigd/.test(t), 'het rapport heeft een eigen blok voor de merkkennis', t.slice(t.indexOf('BEKEND'), t.indexOf('BEKEND') + 400));

    // Wat de diagnosepoort niet ziet, verdwijnt niet.
    st = O.nieuw({ klachten: ['controle'], merk: 'Mercedes', brandstof: 'benzine' });
    eis(st.kennis.zelf.indexOf('luchtvering') >= 0 && /zelf nakijken: [^\n]*luchtvering/.test(O.alsTekst(st)), 'luchtvering: "zelf nakijken" in het rapport');

    // Een handbak sluit de DSG uit.
    st = O.nieuw({ klachten: ['controle'], merk: 'Skoda', brandstof: 'benzine' });
    eis(!!st.v.versnellingsbak, 'Skoda: DSG als verdenking');
    await O.draai(st, nepAuto({ waarde: gezond(), antwoorden: { schakelen: 'hand', koudstartgeluid: 'nee' } }));
    eis(O.status(st.v.versnellingsbak.score) === 'uitgesloten', 'handgeschakeld: DSG uitgesloten', st.v.versnellingsbak.score);

    // De vertaling zelf: de vergissingen die een trefwoord makkelijk maakt.
    const k = (t) => O.kennisNaarVerdenking({ zwak: [t] })[0].h.join();
    eis(k('hybride accu-degradatie') === '', 'hybride accu is geen EGR (degradatie bevat "egr")', k('hybride accu-degradatie'));
    eis(k('distributieketting (1.4 Turbo)') === 'distributie', 'een ketting op een turbomotor is geen turboverdenking', k('distributieketting (1.4 Turbo)'));
    eis(k('EGR-koeler') === 'koppakking,koeling', 'een EGR-koeler is koelvloeistof in de verbranding', k('EGR-koeler'));
    eis(k('EGR/DPF (TDI)') === 'egr,dpf', 'EGR/DPF wordt allebei', k('EGR/DPF (TDI)'));
    const onbekend = [];
    Object.keys(s.AUTO_KENNIS).forEach((m) => O.kennisNaarVerdenking({ zwak: s.AUTO_KENNIS[m].zwak.map((z) => z[0]) })
      .forEach((z) => z.h.forEach((h) => { if (!V[h]) onbekend.push(z.t + '→' + h); })));
    eis(!onbekend.length, 'elke vertaling wijst naar een bestaande verdenking', onbekend.join());
  }

  console.log('\n10. Mode 06: missers per cilinder en de zelftests (#428)');
  {
    // Records uit de echte bouwRecord() van pidlane-mode06.js, zoals een scan
    // ze teruggeeft. UAS 0x24 = tellingen; grens 0–65535 zoals de meeste
    // auto's die voor missers opgeven (dan zakt er nooit iets).
    const R = s.PLM06._intern.bouwRecord;
    const mis = (per, tid) => per.map((n, i) => R(0xA2 + i, tid || 0x0B, 0x24, n, 0, 0xFFFF));
    const stap = O.STAPPEN.find((x) => x.id === 'mode06');
    eis(!!stap && stap.soort === 'mode06' && (stap.na || []).indexOf('codes') >= 0, 'er is een mode 06-stap, na de foutcodes');
    const oordeel = (tests) => { const st = O.nieuw({ klachten: ['onrustig'] }); return { r: O.beoordeelMode06({ m06: { tests } }, st), st }; };
    const van = (r, h) => r.filter((b) => b.h === h);

    let u = oordeel(mis([2, 1, 40, 0]));
    eis(van(u.r, 'misfire').some((b) => b.d >= 2.5 && /cilinder 3/.test(b.t)), 'één cilinder met 40 missers: misfire bevestigd, op cilinder 3', JSON.stringify(u.r));
    eis(u.st.metingen.mode06.cilinder === 3, 'en de cilinder staat in de metingen');
    u = oordeel(mis([9, 11, 10, 12]));
    eis(van(u.r, 'misfire').some((b) => b.d > 0 && b.d < 2.5 && /verdeeld/.test(b.t)) && !u.st.metingen.mode06.cilinder,
      'TEGENPROEF: dezelfde missers over alle cilinders wijzen niet naar één cilinder', JSON.stringify(u.r));
    u = oordeel(mis([0, 1, 0, 2]));
    eis(van(u.r, 'misfire').some((b) => b.d < 0), 'nauwelijks missers: misfire uitgesloten', JSON.stringify(u.r));
    eis(van(u.r, 'misfire').length === 1, 'de grens 0–65535 telt niet nog eens als "ruim binnen de grens"', JSON.stringify(u.r));
    u = oordeel(mis([0, 0, 40, 0], 0x0C).concat(mis([0, 0, 0, 0], 0x0B)));
    eis(!u.st.metingen.mode06.cilinder, 'het gemiddelde over tien ritten (0B) gaat voor de laatste rit (0C)', JSON.stringify(u.st.metingen.mode06));

    u = oordeel([R(0x21, 0x01, 0x01, 800, 0, 750)]);
    eis(van(u.r, 'kat').some((b) => b.d >= 2.5), 'katalysatortest buiten de grens: kat bevestigd', JSON.stringify(u.r));
    // De tabel in het rapport: de hele uitlezing gaat mee, gezakt bovenaan.
    {
      const st = O.nieuw({ klachten: ['onrustig'] });
      O.beoordeelMode06({ m06: { tests: [R(0x21, 0x01, 0x01, 300, 0, 750), R(0x21, 0x02, 0x01, 800, 0, 750)] } }, st);
      const t = O.alsTekst(st), i = t.indexOf('=== MONITORTESTS (MODE 06) ===');
      const regels = i >= 0 ? t.slice(i).split('\n') : [];
      eis(i >= 0 && /\[GEZAKT\].*test 0x02/.test(regels[2] || '') && /\[ok\].*test 0x01/.test(regels[3] || ''),
        'het bewaarde rapport heeft alle zelftests, gezakt bovenaan', t.slice(i));
      eis(/GEZAKT/.test(s.PLM06.render(st.m06)) && st.m06.tests.length === 2, 'en de tabel in de conclusie krijgt dezelfde uitlezing');
      const leeg = O.nieuw({ klachten: ['onrustig'] });
      O.beoordeelMode06({ m06: { tests: [] } }, leeg);
      eis(O.alsTekst(leeg).indexOf('MONITORTESTS') < 0, 'TEGENPROEF: geen mode 06-gegevens, geen lege tabel in het rapport');
    }
    u = oordeel([R(0x21, 0x01, 0x01, 700, 0, 750)]);
    eis(van(u.r, 'kat').some((b) => b.d > 0 && b.d < 2.5 && /krap/.test(b.t)), 'krap binnen de grens: een aanwijzing, geen bevestiging', JSON.stringify(u.r));
    u = oordeel([R(0x21, 0x01, 0x01, 300, 0, 750)]);
    eis(van(u.r, 'kat').some((b) => b.d < 0), 'ruim binnen de grens: kat uitgesloten', JSON.stringify(u.r));
    u = oordeel([R(0x01, 0x01, 0x99, 0x10, 0x7000, 0x0100)]);
    eis(!van(u.r, 'lambda').length, 'onbekende schaal en grenzen die in geen lezing kloppen (min > max): geen oordeel', JSON.stringify(u.r));

    {
      const gemeld = [];
      s.registerSessionReport = (e) => { gemeld.push(e); return e; };
      const ok = s.PLM06.bewaarInSessie({ tests: [R(0x21, 0x02, 0x01, 800, 0, 750)] });
      eis(ok && gemeld.length === 1 && gemeld[0].type === 'm06' && /\[GEZAKT\]/.test(gemeld[0].text), 'een losse mode 06-uitlezing gaat naar Rapporten', JSON.stringify(gemeld).slice(0, 200));
      eis(s.PLM06.bewaarInSessie(null) === false && gemeld.length === 1, 'TEGENPROEF: zonder uitlezing niets in Rapporten');
      delete s.registerSessionReport;
    }

    // De Mazda CX-5 van 15-10-2026 (#515): MID 0x35 is de kleptiming (VVT),
    // geen "EGR bank 5", en grenzen 0x8000…0x05DC kunnen alleen signed.
    const vvt = R(0x35, 0x80, 0xB0, 14, 0x8000, 0x05DC);
    eis(/kleptiming/.test(vvt.midNaam) && /bank 1/.test(vvt.midNaam), 'MID 0x35 heet kleptiming bank 1', vvt.midNaam);
    eis(vvt.oordeelZeker && vvt.geslaagd && vvt.getoond.min === -32768 && vvt.getoond.max === 1500,
      'grenzen die alleen signed kloppen: zeker oordeel, en als −32768 – 1500 getoond', JSON.stringify(vvt.getoond));
    eis(s.PLM06._intern.midNaam(0x02) === 'Lambdasonde bank 1 sonde 2' && /0,040/.test(s.PLM06._intern.midNaam(0x3B)) && /cilinder 12/.test(s.PLM06._intern.midNaam(0xAD)),
      'sondes per bank, EVAP-lekmaat en cilinder 12 naar J1979');
    u = oordeel([R(0x35, 0x80, 0x01, 900, 0, 750)]);
    eis(van(u.r, 'distributie').some((b) => b.d >= 2.5) && !van(u.r, 'egr').length, 'een gezakte VVT-test bevestigt de kleptiming, niet de EGR-klep', JSON.stringify(u.r));
    u = oordeel([R(0x3B, 0x01, 0x01, 900, 0, 750)]);
    eis(!van(u.r, 'egr').length, 'TEGENPROEF: een gezakte EVAP-lektest zegt niets over de EGR-klep', JSON.stringify(u.r));
    u = oordeel([R(0x35, 0x80, 0x01, 300, 0, 750)]);
    eis(!van(u.r, 'distributie').some((b) => b.d < 0), 'een geslaagde VVT-test strept een gerekte ketting niet weg', JSON.stringify(u.r));
    u = oordeel([R(0x42, 0x01, 0x01, 300, 0, 750), R(0x02, 0x01, 0x01, 300, 0, 750)]);
    eis(van(u.r, 'lambda').length === 1, 'sonde en sondeverwarming tellen samen als één lambda-bewijs', JSON.stringify(u.r));
    u = oordeel([]);
    eis(u.r.length === 1 && !u.r[0].h, 'geen mode 06: alleen een opmerking, geen tegenbewijs', JSON.stringify(u.r));

    // In de lus: bij "onrustig" komt mode 06 na de codes aan de beurt, en een
    // cilinder die overslaat stuurt de conclusie.
    let st2 = O.nieuw({ klachten: ['onrustig'], liters: 2.0 });
    await O.draai(st2, nepAuto({ waarde: gezond(), m06: { tests: mis([0, 1, 60, 2]) }, antwoorden: { gevoel: 'stil' } }));
    const v2 = stappen(st2);
    eis(v2.indexOf('mode06') > 0 && v2.indexOf('mode06') <= 2, 'de onderzoeker leest mode 06 bij de eerste stappen', v2.join());
    eis(st2.uitkomst.top[0] && st2.uitkomst.top[0].id === 'misfire', 'geen foutcode, wel cilinder 3 en schudden: ontstekingsprobleem bovenaan', JSON.stringify(st2.uitkomst.top.map((x) => [x.id, x.score])));
    st2 = O.nieuw({ klachten: ['onrustig'], liters: 2.0 });
    await O.draai(st2, nepAuto({ waarde: gezond(), m06: { tests: mis([0, 1, 0, 2]) }, antwoorden: { gevoel: 'stil' } }));
    eis(!(st2.uitkomst.top[0] && st2.uitkomst.top[0].id === 'misfire'), 'TEGENPROEF: zonder missers in mode 06 alleen het schudden — niet bovenaan', JSON.stringify(st2.uitkomst.top.map((x) => [x.id, x.score])));
    st2 = O.nieuw({ klachten: ['onrustig'], liters: 2.0 });
    await O.draai(st2, nepAuto({ waarde: gezond() }));
    const ov = st2.log.find((l) => l.stap === 'mode06');
    eis(ov && /Overgeslagen/.test(ov.t) && !st2.v.misfire.bewijs.some((b) => b.stap === 'mode06'), 'zonder mode 06 overgeslagen, zonder tegenbewijs');
  }

  console.log('\nMomentopname: hoeveel verzoeken (#538)');
  {
    let verzoeken = 0;
    s.demoMode = false; s.supportedPIDs = new Set(['010C', '0105', '0106', '0107', '0108', '0109', '0142']);
    s.withBus = async (n, f) => f(); s.sendCmd = async () => { verzoeken++; return '41 0C 0B B8'; };
    s.parsePID = () => 750; s.validateAndSmooth = (p, v) => v;
    const r = await O._momentopname(['010C', '0105', '0106', '0107', '0108', '0109', '0142'], 'proef');
    eis(verzoeken === 14, 'V-motor: 7 PID\'s × 2 lezingen = 14 verzoeken (was 21; bij 400 ms per verzoek 5,6 s in plaats van 8,4 s)', 'verzoeken: ' + verzoeken);
    eis(r['010C'] && r['010C'].length === 2, 'elke PID twee waarden, genoeg voor beoordeelSnap', JSON.stringify(r));
    verzoeken = 0; s.supportedPIDs = new Set(['010C', '0105']);
    await O._momentopname(['010C', '0105', '0106', '0107', '0108', '0109', '0142'], 'proef');
    eis(verzoeken === 4, 'wat de auto niet levert, wordt niet gevraagd', 'verzoeken: ' + verzoeken);
    s.supportedPIDs = new Set();
  }

  console.log('\nDe derde poort (#532): laadspanning, koelwater, LPG en breedband volgens de auto');
  {
    // Een tweede app mét PLWaarneming en PLKenmerk, zoals index.html ze laadt.
    const k = {};
    k.window = k; k.globalThis = k;
    k.console = { log() { }, warn() { }, error() { } };
    const opslag = {};
    k.localStorage = { getItem: (x) => (x in opslag ? opslag[x] : null), setItem: (x, y) => { opslag[x] = String(y); }, removeItem: (x) => { delete opslag[x]; } };
    k.document = s.document; k.addEventListener = () => { }; k.navigator = {};
    k.setTimeout = (fn) => { fn(); return 0; }; k.setInterval = () => 0; k.clearTimeout = () => { }; k.clearInterval = () => { };
    k.vehicleInfo = { merk: 'Mazda', year: '2018', brandstof: 'benzine', vin: 'JMZKF000000000000' };
    k.pidVals = {}; k.pidHist = {}; k.supportedPIDs = new Set();
    vm.createContext(k);
    ['pidlane-data.js', 'pidlane-foutcodes.js', 'pidlane-mode06.js', 'pidlane-onderzoek.js', 'pidlane-waarneming.js', 'pidlane-kenmerk.js'].forEach((f) =>
      vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), k, { filename: f }));
    const S = (id) => k.PLOnderzoek.STAPPEN.filter((x) => x.id === id)[0];
    const reeks = (pid, v) => ({ reeks: { [pid]: Array(10).fill(v) } });
    let b = S('laden').beoordeel(reeks('0142', 12.8));
    eis(b.length === 1 && b[0].h === null && b[0].d === 0 && /niet te beoordelen/.test(b[0].t), 'Mazda 2018, 12,8 V stationair: niet te beoordelen, geen "dynamo laadt niet genoeg" in het rapport', JSON.stringify(b));
    b = S('laden').beoordeel(reeks('0142', 11.9));
    eis(b[0].h === 'laad' && b[0].d === 2.5, 'tegenproef: 11,9 V is op elke auto een laadfout', JSON.stringify(b));
    k.PLWaarneming.weerleg('slimladen'); k.PLKenmerk.vergeet();
    b = S('laden').beoordeel(reeks('0142', 12.8));
    eis(b[0].h === 'laad' && b[0].d === 2.5, 'gewone dynamo bevestigd door een mens: 12,8 V is wél een laadfout', JSON.stringify(b));
    b = S('laden_belast').beoordeel(reeks('0142', 12.7));
    eis(b[0].h === 'laad' && b[0].d === 2, 'laden onder belasting volgt dezelfde grens', JSON.stringify(b));
    k.vehicleInfo.merk = 'Audi'; k.PLKenmerk.vergeet();
    b = S('temperatuur').beoordeel({ reeks: { '0105': Array(10).fill(109) } }, { antwoorden: {} });
    eis(b.some((x) => x.h === null && /kenveld/.test(x.t)) && !b.some((x) => x.h === 'koeling' && x.d > 0), 'Audi op 109 °C: niet te beoordelen, geen "te warm"', JSON.stringify(b));
    k.vehicleInfo.merk = 'Mazda'; k.PLKenmerk.vergeet();
    b = S('temperatuur').beoordeel({ reeks: { '0105': Array(10).fill(109) } }, { antwoorden: {} });
    eis(b.some((x) => x.h === 'koeling' && x.d === 1.25 && /niet zeker/.test(x.t)), 'Mazda op 109 °C: halve weging, niet zeker voor deze auto', JSON.stringify(b));
    k.vehicleInfo.brandstof = 'lpg'; k.PLKenmerk.vergeet();
    const st = { metingen: {}, ctx: {} };
    b = S('stationair').beoordeel({ reeks: { '0106': Array(10).fill(10), '0107': Array(10).fill(10), '010C': Array(10).fill(800) } }, st);
    eis(!b.some((x) => x.h === 'valselucht' && x.d > 0) && st.metingen.trimStationair === undefined, 'LPG bewezen: de trims gaan niet als valse lucht het rapport in', JSON.stringify(b));
    k.supportedPIDs = new Set(['0114', '0134']); k.PLKenmerk.vergeet();
    b = S('lambda').beoordeel({ reeks: { '0114': Array(10).fill(0.45), '0115': Array(10).fill(0.7) } });
    eis(!b.some((x) => x.h === 'lambda' && x.d > 0), 'breedband bewezen: een vlakke 0114 is geen luie sonde', JSON.stringify(b));
  }

  console.log('\n20. De snelle scan: wat de auto al wist (16-10-2026)');
  {
    const leeg = () => ({ metingen: {}, ctx: {} });
    const ff = (w) => ({ scan: { freeze: { code: 'P0171', waarden: w } } });
    let st = leeg(), b = O.beoordeelFreeze(ff({ '010C': 780, '010D': 0, '0105': 88, '0104': 22, '0106': 9, '0107': 11 }), st);
    eis(b.some((x) => x.h === 'valselucht' && x.d === 1.5), 'freeze frame mager stationair → valse lucht', JSON.stringify(b));
    b = O.beoordeelFreeze(ff({ '010C': 2600, '010D': 70, '0105': 90, '0104': 75, '0106': 8, '0107': 10 }), leeg());
    eis(b.some((x) => x.h === 'brandstofdruk' && x.d > 0) && !b.some((x) => x.h === 'valselucht'), 'mager onder last → brandstofdruk, geen lek', JSON.stringify(b));
    b = O.beoordeelFreeze(ff({ '010C': 2200, '010D': 80, '0105': 90, '0104': 30, '0106': 8, '0107': 10 }), leeg());
    eis(!b.some((x) => x.h), 'tegenproef: mager bij lichte last rijdend zegt nog niets', JSON.stringify(b));
    b = O.beoordeelFreeze(ff({ '010C': 900, '0105': 35 }), st = leeg());
    eis(b.some((x) => !x.h && /koude motor/.test(x.t)) && st.metingen.freeze.trim === null, 'koude fout gemeld; zonder trim geen trim verzonnen', JSON.stringify(b));

    const snap = (o) => ({ snap: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v, v, v]])) });
    st = leeg();
    b = O.beoordeelSnap(snap({ '010C': 750, '0105': 90, '0107': 16, '0109': 1, '0142': 14 }), st);
    eis(b.some((x) => x.h === 'maf' && x.d < 0) && b.some((x) => x.h === 'brandstofdruk' && x.d < 0) && b.some((x) => x.h === 'valselucht' && x.d > 0 && /bank 1/.test(x.t)),
      'banken verschillen: lek aan bank 1, luchtmassameter en brandstofdruk vallen af', JSON.stringify(b));
    b = O.beoordeelSnap(snap({ '010C': 750, '0105': 90, '0107': 14, '0109': 13 }), leeg());
    eis(!b.some((x) => x.d < 0) && b.some((x) => x.h === 'maf' && x.d > 0), 'tegenproef: beide banken mager sluit niets uit', JSON.stringify(b));
    b = O.beoordeelSnap(snap({ '010C': 750, '0105': 40, '0107': 16, '0109': 1 }), st = leeg());
    eis(!b.length && st.metingen.ltft === undefined, 'koude motor: de trims tellen niet', JSON.stringify(b));
    b = O.beoordeelSnap(snap({ '010C': 760, '0105': 90, '0142': 12.4 }), leeg());
    eis(b.some((x) => x.h === 'laad' && x.d > 0), 'motor draait op 12,4 V → laadsysteem', JSON.stringify(b));
    b = O.beoordeelSnap(snap({ '010C': 0, '0142': 12.4 }), leeg());
    eis(!b.length, 'tegenproef: motor uit op 12,4 V is geen laadfout', JSON.stringify(b));

    const rit = (stat, deel, opt) => {
      opt = opt || {};
      const h = { '010C': [], '0106': [], '0107': [], '010D': [], '0105': [] };
      for (let i = 0; i < 40; i++) {
        const t = i * 1000, hoog = i >= 20;
        h['010C'].push({ t, v: hoog ? 2500 : 760 });
        h['010D'].push({ t, v: hoog ? 60 : 0 });
        h['0105'].push({ t, v: opt.koud ? 40 : 90 });
        h['0106'].push({ t: t + (opt.schuif || 0), v: 0 });
        h['0107'].push({ t: t + (opt.schuif || 0), v: hoog ? deel : stat });
      }
      return h;
    };
    let k = O.trimKaart(rit(15, 3), 'de testrit');
    eis(k && k.stationair.n === 20 && k.stationair.trim === 15 && k.deel.trim === 3 && k.bron === 'de testrit', 'trimkaart: stationair en deellast uit één rit', JSON.stringify(k));
    eis(O.trimKaart(rit(15, 3, { koud: true })) === null, 'koude motor: geen kaart');
    eis(O.trimKaart(rit(15, 3, { schuif: 100000 })) === null, 'trims die niet bij een toerental horen tellen niet');
    b = O.beoordeelKaart({ kaart: k }, leeg());
    eis(b.some((x) => x.h === 'valselucht' && x.d === 1.5) && b.some((x) => x.h === 'maf' && x.d < 0), 'kaart: mager stationair dat herstelt → lekpatroon', JSON.stringify(b));
    b = O.beoordeelKaart({ kaart: O.trimKaart(rit(14, 13)) }, leeg());
    eis(b.some((x) => x.h === 'maf' && x.d > 0) && b.some((x) => x.h === 'valselucht' && x.d < 0), 'tegenproef: mager over het hele bereik → luchtmassameter, geen lek', JSON.stringify(b));
    b = O.beoordeelKaart({ kaart: O.trimKaart(rit(2, 14)) }, leeg());
    eis(b.some((x) => x.h === 'brandstofdruk' && x.d === 1.5), 'alleen mager bij deellast → brandstofdruk', JSON.stringify(b));

    const sc = (codes, sinds, nietKlaar) => ({ metingen: { scan: { codes, sinds, readiness: { nietKlaar: nietKlaar || [] } } } });
    let inz = O.inzichten(sc({ bevestigd: [], pending: [], permanent: [] }, { km: 12, warm: 2 }, ['Katalysator']));
    eis(inz[0] && inz[0].niveau === 'let' && /gewist/.test(inz[0].kop) && /Katalysator/.test(inz[0].t), 'kort geleden gewist: bovenaan, met de zelftests die nog niet draaiden', JSON.stringify(inz));
    inz = O.inzichten(sc({ bevestigd: [], pending: [], permanent: [] }, { km: 5000, warm: 120 }));
    eis(!inz.some((x) => /gewist/.test(x.kop)), 'tegenproef: 5000 km na wissen is niet "kort geleden"', JSON.stringify(inz));
    inz = O.inzichten(sc({ bevestigd: ['P0420'], pending: ['P0420', 'P0302'], permanent: [] }, {}));
    eis(inz.some((x) => x.kop === 'Er komt iets aan' && /P0302/.test(x.t) && !/P0420/.test(x.t)), 'een code in afwachting die nog niet vast staat: "er komt iets aan"', JSON.stringify(inz));
    inz = O.inzichten({ metingen: { ltft: { b1: 11, b2: null } } });
    eis(inz.some((x) => /langere tijd/.test(x.kop) && /\+11 %/.test(x.t)), 'lange trim +11 %: de ECU stuurt al weken bij', JSON.stringify(inz));

    st = O.nieuw({ klachten: ['warm'], wanneer: ['belast', 'vocht'] });
    eis(!!st.v.misfire && st.v.misfire.score === 1.5, 'wanneer: belast + vocht zet ontsteking in spel, gekapt op 1,5', st.v.misfire && st.v.misfire.score);
    eis(O.status(st.v.misfire.score) !== 'bevestigd', 'een antwoord bevestigt nooit zelf');
    st = O.nieuw({ klachten: ['onrustig'], wanneer: ['belast'] });
    eis(st.v.valselucht.score === -0.5 && st.v.valselucht.bewijs[0].stap === 'intake', 'alleen onder last: een lek iets minder waarschijnlijk, met het antwoord als bewijs', JSON.stringify(st.v.valselucht));

    const lek = (p, stap) => O.demoWaarde(p, stap);
    st = O.nieuw({ klachten: ['onrustig'], liters: 2.0 });
    await O.draai(st, nepAuto({ waarde: lek }));
    const zonder = st.gedaan.length;
    st = O.nieuw({ klachten: ['onrustig'], liters: 2.0 });
    await O.draai(st, nepAuto({ waarde: lek, kaart: O.trimKaart(rit(15, 3), 'de rit van zojuist') }));
    eis(st.uitkomst.top[0] && st.uitkomst.top[0].id === 'valselucht' && st.gedaan.length < zonder, 'met een rit die er al is: zelfde conclusie in minder stappen', st.gedaan.length + ' vs ' + zonder);
    eis(/=== WAT DE AUTO AL WIST ===[\s\S]*Trimkaart uit de rit van zojuist/.test(O.alsTekst(st)), 'het rapport zegt wat de auto al wist');
  }

  console.log('\n21. App-maten voor de meetopdracht (#534)');
  {
    eis(O.maat('onderzoek-scans') === 0 && O.maat('onderzoek-ff') === null && O.maat('onderzoek-bank2') === null && O.maat('onderzoek-scan-ms') === null,
      'vóór een scan: 0 scans, de rest niet gemeten (null, geen 0)');
    O._noteerScan({ scan: { freeze: { code: 'P0171', waarden: { '010C': 800 } } }, snap: { '0107': [12, 12, 12] } }, 2300);
    eis(O.maat('onderzoek-scans') === 1 && O.maat('onderzoek-scan-ms') === 2300, 'een scan geteld, met zijn duur');
    eis(O.maat('onderzoek-ff') === 1 && O.maat('onderzoek-ff-trim') === 0, 'freeze frame zonder trims: ff 1, ff-trim 0');
    eis(O.maat('onderzoek-bank2') === 0, 'geen 0109 in de momentopname: bank2 0');
    O._noteerScan({ scan: { freeze: { code: 'P0171', waarden: { '0107': 9 } } }, snap: { '0109': [null, 4, 5] } });
    eis(O.maat('onderzoek-ff-trim') === 1 && O.maat('onderzoek-bank2') === 1 && O.maat('onderzoek-scan-ms') === 2300, 'met trims en bank 2: allebei 1; zonder duur blijft de vorige staan');
    O._noteerScan({ scan: {}, snap: {} });
    eis(O.maat('onderzoek-ff') === 0 && O.maat('onderzoek-ff-trim') === null, 'geen freeze frame: ff 0, ff-trim niet gemeten (null)');
    O._zetStaat({ metingen: { ltft: { b1: 14.2, b2: 1 }, kaart: { stationair: { trim: 15, n: 20 }, deel: { trim: 3, n: 20 } }, trimStationair: 12, trim2500: 3.5 } });
    eis(O.maat('onderzoek-bankverschil') === 13.2, 'bankverschil in %-punt', O.maat('onderzoek-bankverschil'));
    eis(O.maat('onderzoek-kaart-afwijking') === 3, 'kaart tegen de proef: het grootste verschil (stationair 15 tegen 12)', O.maat('onderzoek-kaart-afwijking'));
    O._zetStaat({ metingen: { ltft: { b1: 14, b2: null }, kaart: { stationair: { trim: 15, n: 20 }, deel: null } } });
    eis(O.maat('onderzoek-bankverschil') === null && O.maat('onderzoek-kaart-afwijking') === null, 'tegenproef: geen bank 2 en geen proef → niet gemeten, niet 0');
    s.pidHist = {};
    ['010C', '0106', '0107', '0105'].forEach((p) => { s.pidHist[p] = []; });
    for (let i = 0; i < 12; i++) {
      s.pidHist['010C'].push({ t: i * 1000, v: i < 5 ? 760 : 2400 });
      s.pidHist['0106'].push({ t: i * 1000, v: 0 }); s.pidHist['0107'].push({ t: i * 1000, v: 2 });
      s.pidHist['0105'].push({ t: i * 1000, v: i < 3 ? 40 : 90 });
    }
    eis(O.maat('onderzoek-kaart-stationair-n') === 2 && O.maat('onderzoek-kaart-deel-n') === 7, 'vaktelling uit de live-historie, koude monsters niet meegeteld, ook onder de kaartgrens',
      O.maat('onderzoek-kaart-stationair-n') + ' / ' + O.maat('onderzoek-kaart-deel-n'));
    delete s.pidHist;
    eis(O.maat('onderzoek-kaart-deel-n') === null, 'zonder bron: niet gemeten');
    eis(O.maat('bestaat-niet') === null, 'een onbekende naam: null');
  }

  console.log('\nDe intake uit de wizard (20-10-2026): geluid en een opgegeven foutcode');
  {
    eis(O.klachtUitTekst('hij tikt bij een koude start').indexOf('geluid') >= 0, '"tikt" is een geluid');
    eis(O.KLACHTEN.geluid.h.every((h) => !!O.VERDENKINGEN[h]), 'elke verdenking bij geluid bestaat');
    const zonder = O.nieuw({ klachten: ['onrustig'] }), met = O.nieuw({ klachten: ['onrustig'], codesHand: ['P0171', 'P0174'] });
    const vl = met.v.valselucht;
    eis(vl.score > zonder.v.valselucht.score && vl.score <= O.cfg.bevestigd / 2, 'een opgegeven P0171 maakt valse lucht waarschijnlijker, maar hoogstens de helft van bevestigd',
      zonder.v.valselucht.score + ' → ' + vl.score);
    eis(vl.bewijs.some((b) => /door jou opgegeven/.test(b.t)), '… en het bewijs zegt dat de code van de klant kwam');
    eis(O.status(vl) !== 'bevestigd', 'twee opgegeven codes bevestigen niets: de auto beslist');
    const brand = O.nieuw({ klachten: ['onrustig'], codesHand: ['P0171'] });
    eis(!!brand.v.brandstofdruk, 'een opgegeven code zet ook zijn andere verdenkingen in spel (brandstofdruk bij P0171)');
  }

  console.log('\n' + (fouten ? fouten + ' van ' + aantal + ' FOUT' : 'Alle ' + aantal + ' goed'));
  process.exit(fouten ? 1 : 0);
})().catch((e) => { console.log('  FOUT test brak af: ' + (e.stack || e)); process.exit(1); });
