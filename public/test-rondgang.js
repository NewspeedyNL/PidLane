// ══════════════════════════════════════════════════════════════════
// test-rondgang.js — de rondgang in Slim: de pure kern (15-10-2026)
// ──────────────────────────────────────────────────────────────────
// Op de echte pidlane-rondgang.js:
//   1. de indeling: kop altijd, alleen wat de auto heeft, één sensor op één
//      plek, duo valt terug, aanvullen per categorie, een losse tegel gaat
//      bij de vorige dia, een te volle dia wordt gesplitst, vinkjes
//   2. de klok: wisselen na de wisseltijd, rondgaan, pauze, met de hand
//      verder (blijft staan), het alarm springt en houdt vast
//   3. de instellingen: wisseltijd en vinkjes, alles uit = niets uit
// Het scherm zit in bproef-rondgang.js.
//
// Draaien vanuit public/:  node test-rondgang.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fout = 0;
function waar(naam, v, uitleg) {
  if (v) { ok++; console.log('  ok    ' + naam); }
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : '')); }
}
const c = { console: { warn() {}, log() {} } };
c.window = c;
vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-rondgang.js', 'utf8'), c, { filename: 'pidlane-rondgang.js' });
const R = c.PLRond;
if (!R || typeof R.indeling !== 'function') { console.error('FOUT: PLRond niet geladen'); process.exit(1); }
const alles = () => true, uit = (l) => (p) => l.indexOf(p) > -1;
const ids = (ind) => ind.dias.map((d) => d.id).join(' ');
const pids = (d) => d.tegels.reduce((a, t) => a.concat(t.pids), []);

console.log('\n1. De indeling');
let ind = R.indeling('benzine', { heeft: alles });
waar('kop: snelheid en toerental, klein', ind.kop.map((t) => t.pids[0] + ':' + t.soort).join(' ') === '010D:kop 010C:kop', JSON.stringify(ind.kop));
waar('benzine: twaalf pagina\'s in vaste volgorde, per categorie, de motor begint bij het pedaal', ids(ind) === 'motor-gas motor motor-ontsteking temp temp-uitlaat brandstof mengsel brandstof-druk lucht uitlaat uitlaat-nabeh elektrisch', ids(ind));
waar('elke pagina draagt zijn categorie, de titel noemt beide', ind.dias.every((d) => R.CATS.some((c) => c.id === d.cat && d.naam.indexOf(c.naam + ' · ') === 0)), ind.dias.map((d) => d.cat + ':' + d.naam).join(' | '));
const alle = ind.kop.reduce((a, t) => a.concat(t.pids), []).concat(ind.dias.reduce((a, d) => a.concat(pids(d)), []));
waar('elke sensor staat op één plek', new Set(alle).size === alle.length, alle.join(','));
waar('elke tegel een unieke id', new Set(ind.kop.concat(...ind.dias.map((d) => d.tegels)).map((t) => t.id)).size === alle.length);
const br = ind.dias.find((d) => d.id === 'mengsel');
waar('verbruik: groot met lijn, kosten en tank eronder', ind.dias.find((d) => d.id === 'brandstof').tegels[0].soort === 'held' && ind.dias.find((d) => d.id === 'brandstof').tegels[0].pids[0] === 'CA03');
waar('mengsel: lambda gevraagd vóór gemeten, rond 1,00; trims vanuit het midden rond 0 %', br.tegels[0].pids[0] === '0144' && br.tegels[1].pids[0] === '0124' && br.tegels[0].midden === 1 && br.tegels.some((t) => t.pids[0] === '0106' && t.soort === 'mid' && t.midden === 0 && t.span === 25), JSON.stringify(br.tegels.slice(0, 5)));
waar('temperaturen: koelwater eerst, als rij met band', ind.dias.find((d) => d.id === 'temp').tegels[0].pids[0] === '0105' && ind.dias.find((d) => d.id === 'temp').tegels[0].soort === 'rij');
const ui = ind.dias.find((d) => d.id === 'uitlaat');
waar('uitlaat: sondes vóór en ná als staaf met de 0,45 V-lijn', ui.tegels.some((t) => t.pids[0] === '0114' && t.soort === 'staaf' && t.ref === 0.45 && t.label === 'Vóór') && ui.tegels.some((t) => t.pids[0] === '0115' && t.label === 'Ná'), JSON.stringify(ui.tegels.slice(0, 3)));
waar('elke verhaalpagina draagt zijn duiding', ['motor-gas:gas', 'temp:warmte', 'mengsel:mengsel', 'lucht:druk', 'uitlaat:kat', 'elektrisch:laden'].every((x) => { const [i, k] = x.split(':'); const d = ind.dias.find((y) => y.id === i); return d && d.duid.join() === k; }), ind.dias.map((d) => d.id + ':' + d.duid).join(' '));

console.log('\n1b. De panelen');
const pn = R.groepen(br.tegels);
waar('mengsel: lambdapaneel (gevraagd + drie sondes), één trimpaneel met alle zes, dan rijen', pn.map((g) => g.soort + ':' + g.tegels.length).join(' ') === 'mid:4 mid:6 rij:2', pn.map((g) => g.soort + ':' + g.tegels.length).join(' '));
waar('het trimpaneel heet Brandstoftrims', pn[1].titel === 'Brandstoftrims');
const motP = ind.dias.filter((d) => d.cat === 'motor'), motN = motP.reduce((a, d) => a + d.tegels.length, 0);
waar('motor en rijden: drie pagina\'s, samen minstens 23 sensoren', motP.length === 3 && motN >= 23, motP.map((d) => d.id + ':' + d.tegels.length).join(' '));
const kp = R.groepen(motP[1].tegels);
waar('vermogen groot met lijn, gevraagd/werkelijk/vrijloop/wrijving koppel op één tellerplaat', kp[0].soort === 'held' && kp[0].tegels[0].pids[0] === 'CA06' && kp[1].soort === 'staaf' && kp[1].titel === 'Koppel' && kp[1].tegels.length === 4, kp.map((g) => g.soort + ':' + g.titel + ':' + g.tegels.length).join(' '));
const gpG = R.groepen(motP[0].tegels), gp = gpG.map((g) => g.titel + ':' + g.tegels.length).join(' ');
waar('van pedaal tot motor: pedaal, gasklep en belasting op één tellerplaat, de rest als rij', gp === 'Pedaal → gasklep → belasting:4 :4' && gpG[0].tegels.map((t) => t.label).join() === 'Pedaal,Gasklep,Belasting,Abs.', gp);
const abs = gpG[0].tegels.find((t) => t.pids[0] === '0143');
waar('abs. belasting naast de gewone op 0–100 %, niet op zijn eigen 0–400', abs.lo === 0 && abs.hi === 100, JSON.stringify(abs));
const lp = R.groepen(ind.dias.find((d) => d.id === 'lucht').tegels);
waar('lucht: inlaatdruk en buitendruk naast elkaar op één schaal', lp[1].soort === 'staaf' && lp[1].tegels.map((t) => t.pids[0] + ':' + t.lo + '-' + t.hi).join() === '010B:0-250,0133:0-250', JSON.stringify(lp[1]));
const ub = R.groepen(ind.dias.find((d) => d.id === 'uitlaat').tegels).map((g) => g.titel + ':' + g.tegels.length).join(' ');
waar('sondes en katalysator: bank 1, bank 2 en de katalysator naast elkaar af te lezen', ub === 'Sondes bank 1:4 Sondes bank 2:4 Katalysator:4', ub);
waar('een losse meter wordt een rij, geen halve boog', R.groepen([{ id: 'r-012F', soort: 'meter', pids: ['012F'] }])[0].soort === 'rij');
const los = R.groepen([{ id: 'r-0106', soort: 'mid', pids: ['0106'], midden: 0, span: 25 }, { id: 'r-0105', soort: 'rij', pids: ['0105'] }]);
waar('een losse trim zonder buren wordt een rij, en komt in het rijenpaneel', los.length === 1 && los[0].soort === 'rij' && los[0].tegels.length === 2, JSON.stringify(los));
waar('twee helden staan elk in een eigen paneel', R.groepen([{ id: 'a', soort: 'held', pids: ['CA03'] }, { id: 'b', soort: 'held', pids: ['0110'] }]).length === 2);
let m = R.midVulling(-12.5, 0, 25);
waar('mid: −12,5 % vult van 25 % tot het midden', m.links === 25 && m.breed === 25, JSON.stringify(m));
m = R.midVulling(1.5, 1, 0.25);
waar('mid: lambda 1,5 loopt niet buiten de baan', m.links === 50 && m.breed === 50, JSON.stringify(m));
waar('mid: geen getal = leeg', R.midVulling(null, 0, 25).breed === 0 && R.midVulling(5, 0, 0).breed === 0);
waar('geen dia meer dan ' + R.MAX_PER_DIA + ' tegels', ind.dias.every((d) => d.tegels.length <= R.MAX_PER_DIA));

ind = R.indeling('ev', { heeft: uit(['010D', '015B', '0142', '0105']) });
waar('EV zonder toerental: de aandrijfaccu in de kop', ind.kop.map((t) => t.pids[0]).join() === '010D,015B', JSON.stringify(ind.kop));
waar('een dia met één tegel gaat op in de vorige (elektrisch eerst, dan temp)', ind.dias.length === 1 && pids(ind.dias[0]).join() === '0142,0105' && /Elektrisch · Temperaturen/.test(ind.dias[0].naam), JSON.stringify(ind.dias));

ind = R.indeling('benzine', { heeft: uit(['CA06', '0104']) });
waar('een losse pagina gaat bij de vorige van zijn categorie, de titel noemt beide pagina\'s', ind.dias.length === 1 && ind.dias[0].naam === 'Motor en rijden · Van pedaal tot motor · Vermogen en koppel', JSON.stringify(ind.dias));
ind = R.indeling('benzine', { heeft: uit(['0104', '0106', '0107', '0142']) });
waar('samengevoegd: de duiding van beide pagina\'s gaat mee', ind.dias.some((d) => d.duid.join() === 'mengsel,laden'), JSON.stringify(ind.dias.map((d) => d.id + ':' + d.duid)));

ind = R.indeling('hybride', { heeft: alles });
waar('hybride: elektrisch is de eerste dia', ind.dias[0].id === 'elektrisch', ids(ind));

ind = R.indeling('benzine', { heeft: uit(['010D', '010C', '0106', '0105', '015C', '0142', '0104']) });
waar('alleen wat de auto heeft; een dia met één sensor gaat bij de vorige', pids(ind.dias[1]).join() === '0105,015C,0106,0142' && JSON.stringify(ind).indexOf('"0107"') < 0, JSON.stringify(ind.dias));
ind = R.indeling('benzine', { heeft: uit(['0105']), heeftKop: alles });
waar('de kop kijkt naar wat de auto levert, de dia\'s naar wat aan staat', ind.kop.length === 2 && pids(ind.dias[0]).join() === '0105', JSON.stringify(ind));
waar('een auto zonder sensoren: niets', R.indeling('benzine', { heeft: () => false }).dias.length === 0);

const heeftT = (p) => /^01/.test(p);
const extra = ['0190', '0191', '0192', '0193', '0194', '0195', '0196', '0197', '0198', '0199', '019A', '019B'];
ind = R.indeling('benzine', { heeft: heeftT, extra: extra, cat: (p) => (extra.indexOf(p) > -1 ? 'temp' : null), balk: () => true });
const tmp = ind.dias.filter((d) => /^temp/.test(d.id));
waar('aanvullen: een eigen temperatuur komt op de laatste pagina van Temperaturen', tmp.some((d) => d.id.indexOf('temp-uitlaat') === 0 && pids(d).indexOf('0190') > -1), JSON.stringify(tmp));
waar('te vol: de pagina wordt gesplitst in (1/2) en (2/2)', tmp.length === 3 && /\(1\/2\)/.test(tmp[1].naam) && tmp[2].id === 'temp-uitlaat#2', tmp.map((d) => d.id + ':' + d.naam + ':' + d.tegels.length).join(' | '));
ind = R.indeling('benzine', { heeft: alles, extra: ['010D', '9999'], cat: () => 'motor' });
waar('aanvullen zet geen sensor dubbel en niets wat de auto niet heeft', JSON.stringify(ind).split('"010D"').length === 2);

ind = R.indeling('benzine', { heeft: alles, uit: ['temp', 'lucht', 'onzin'] });
waar('vinkjes per categorie: temp en lucht doen met al hun pagina\'s niet mee, een onbekende id telt niet', ids(ind) === 'motor-gas motor motor-ontsteking brandstof mengsel brandstof-druk uitlaat uitlaat-nabeh elektrisch', ids(ind));
ind = R.indeling('benzine', { heeft: alles, uit: R.CATS.map((d) => d.id) });
waar('alles uit = niets uit', ind.dias.length === 12, ids(ind));

console.log('\n1c. Wat dit zegt (duiding)');
const D = R.duiding;
waar('gas: belasting is wat de motor geeft van wat hij kan', D('gas', { '0104': 34.4 }) === 'Belasting 34 %: de motor geeft 34 % van wat hij bij dit toerental kan', D('gas', { '0104': 34.4 }));
waar('gas: vanaf 85 % "bijna alles"', /bijna alles/.test(D('gas', { '0104': 90 })));
waar('gas los bij snelheid en toeren: de motor remt mee', /^Gas los/.test(D('gas', { '0104': 20, pedaal: 0, '010C': 1800, '010D': 60 })));
waar('gas los in stilstand is gewoon stationair, geen "remt mee"', !/Gas los/.test(D('gas', { '0104': 20, pedaal: 0, '010C': 800, '010D': 0 })));
waar('druk: 110 tegen 101 kPa = de turbo perst, in bar', D('druk', { '010B': 110, '0133': 101 }) === 'Inlaat 0,09 bar boven de buitenlucht: de turbo perst lucht de motor in', D('druk', { '010B': 110, '0133': 101 }));
waar('druk: 35 kPa = de gasklep knijpt af', /0,66 bar onder.*knijpt/.test(D('druk', { '010B': 35, '0133': 101 })));
waar('druk: een diesel zonder laaddruk heeft geen gasklep die knijpt', /blaast nu niet/.test(D('druk', { '010B': 60, '0133': 101 }, { diesel: true })));
waar('druk: zonder buitendruk geen uitspraak', D('druk', { '010B': 110 }) === null);
waar('mengsel: +3,2 % is in orde', D('mengsel', { '0106': -0.3, '0107': 3.5, '0105': 90 }) === 'Mengsel in orde: de ECU corrigeert +3,2 % (binnen ±10 %)', D('mengsel', { '0106': -0.3, '0107': 3.5, '0105': 90 }));
waar('mengsel: +14 % = de motor loopt van zichzelf arm (valse lucht)', /14,0 % extra.*arm.*valse lucht/.test(D('mengsel', { '0106': 4, '0107': 10, '0105': 90 })));
waar('mengsel: −12 % = rijk', /12,0 % minder.*rijk/.test(D('mengsel', { '0106': -2, '0107': -10, '0105': 90 })));
waar('mengsel: koude motor = geen oordeel over de trims', /nog koud/.test(D('mengsel', { '0106': 4, '0107': 10, '0105': 40 })));
waar('warmte: 45 °C warmt op, met het verschil met buiten', D('warmte', { '0105': 45, '0146': 15 }) === 'Motor warmt op: koud verbruikt en slijt hij meer, dus nog even rustig aan — 30 °C warmer dan buiten');
waar('warmte: 90 °C op temperatuur, 110 °C heet', /op temperatuur$/.test(D('warmte', { '0105': 90 })) && /heet/.test(D('warmte', { '0105': 110 })));
waar('laden: 14,1 V met draaiende motor = de dynamo laadt', D('laden', { '0142': 14.07, '010C': 1600 }) === 'De dynamo laadt de accu (14,1 V)', D('laden', { '0142': 14.07, '010C': 1600 }));
waar('laden: 12,6 V draaiend is met een slimme laadregeling normaal, geen defect', /slimme laadregeling normaal/.test(D('laden', { '0142': 12.6, '010C': 1600 })));
waar('laden: onbeslist (PLKenmerk) zegt niet "nakijken"', /slimme laadregeling normaal/.test(D('laden', { '0142': 12.5, '010C': 1600 }, { laad: { niveau: 'onbeslist', tekst: 'x' } })) && !/nakijken/.test(D('laden', { '0142': 12.5, '010C': 1600 }, { laad: { niveau: 'onbeslist' } })));
waar('laden: fout (PLKenmerk) zegt wél nakijken', /nakijken/.test(D('laden', { '0142': 12.8, '010C': 1600 }, { laad: { niveau: 'fout', tekst: 'x' } })));
waar('warmte: 108 °C onbeslist (kenveld) is niet "heet"', !/heet/.test(D('warmte', { '0105': 108 }, { koel: { niveau: 'onbeslist' } })) && /heet/.test(D('warmte', { '0105': 108 })));
waar('laden: 12,0 V draaiend = laat nakijken', /nakijken/.test(D('laden', { '0142': 12.0, '010C': 1600 })));
waar('laden: motor uit, 12,7 V = vol; 12,0 V = zwak', /vol$/.test(D('laden', { '0142': 12.7, '010C': 0 })) && /zwak/.test(D('laden', { '0142': 12.0, '010C': 0 })));
waar('laden: zonder toerental (EV) alleen "wordt geladen"', D('laden', { '0142': 12.5 }) === null && /geladen/.test(D('laden', { '0142': 14 })));
const zw = (a, b) => ({ zwaai: (p) => (p === '0114' ? a : p === '0115' ? b : null) });
waar('kat: voor schakelt, na rustig = de katalysator werkt', /doet zijn werk/.test(D('kat', { '0105': 90 }, zw(0.7, 0.1))));
waar('kat: na schakelt mee = mogelijk vermoeid', /vermoeide/.test(D('kat', { '0105': 90 }, zw(0.7, 0.6))));
waar('kat: koud, of voor schakelt niet = geen uitspraak', D('kat', { '0105': 50 }, zw(0.7, 0.6)) === null && D('kat', { '0105': 90 }, zw(0.1, 0.1)) === null);
waar('onbekende sleutel of geen waarden: null, nooit een halve zin', D('x', {}) === null && D('gas', {}) === null && D('mengsel', {}) === null && D('laden', {}) === null);

console.log('\n2. De klok');
const MS = 10000;
let st = { i: 0, start: 0, pauze: false, alarm: -1 };
st = R.tik(st, 9999, { n: 6, ms: MS, alarm: -1 });
waar('vóór de wisseltijd: blijft staan', st.i === 0);
st = R.tik(st, 10000, { n: 6, ms: MS, alarm: -1 });
waar('na de wisseltijd: volgende dia, klok opnieuw', st.i === 1 && st.start === 10000, JSON.stringify(st));
waar('voortgang halverwege is 0,5', Math.abs(R.voortgang(st, 15000, MS) - 0.5) < 1e-9);
st = R.tik({ i: 5, start: 0, pauze: false, alarm: -1 }, 10000, { n: 6, ms: MS, alarm: -1 });
waar('na de laatste: terug naar de eerste', st.i === 0);
waar('zes dia\'s van 10 s: rond in een minuut', (() => { let s = { i: 0, start: 0, alarm: -1 }; for (let t = 0; t <= 60000; t += 250) s = R.tik(s, t, { n: 6, ms: MS, alarm: -1 }); return s.i === 0; })());
st = R.tik({ i: 2, start: 0, pauze: true, alarm: -1 }, 50000, { n: 6, ms: MS, alarm: -1 });
waar('pauze: blijft staan, hoe lang ook', st.i === 2 && st.pauze);
st = R.stapPuur({ i: 0, start: 0, pauze: false, alarm: -1 }, -1, 1000, 6);
waar('‹ op de eerste: de laatste', st.i === 5);
waar('met de hand: blijft ' + R.HOLD_MS / 1000 + ' s staan', R.tik(st, 1000 + R.HOLD_MS + MS - 1, { n: 6, ms: MS, alarm: -1 }).i === 5 && R.tik(st, 1000 + R.HOLD_MS + MS, { n: 6, ms: MS, alarm: -1 }).i === 0);
waar('met de hand: de voortgang staat zolang op 0', R.voortgang(st, 2000, MS) === 0);
st = R.tik({ i: 0, start: 0, pauze: true, alarm: -1 }, 3000, { n: 6, ms: MS, alarm: 3 });
waar('alarm: springt naar zijn dia, ook in pauze', st.i === 3 && st.alarm === 3, JSON.stringify(st));
st = R.tik(st, 90000, { n: 6, ms: MS, alarm: 3 });
waar('alarm: blijft staan zolang het er is', st.i === 3);
st = R.stapPuur(st, 1, 90000, 6); st = R.tik(st, 91000, { n: 6, ms: MS, alarm: 3 });
waar('alarm: met de hand weg kan, hetzelfde alarm springt niet terug', st.i === 4, JSON.stringify(st));
st = R.tik(st, 92000, { n: 6, ms: MS, alarm: -1 });
waar('alarm weg: klok opnieuw, gewoon verder', st.alarm === -1 && st.start === 92000);
waar('geen dia\'s: de klok doet niets', R.tik({ i: 0, start: 0, alarm: -1 }, 99999, { n: 0, ms: MS, alarm: -1 }).i === 0);

const dias = [{ tegels: [{ pids: ['0105'] }] }, { tegels: [{ pids: ['0106', '0107'] }] }];
waar('alarmDia: de dia met een sensor in rood', R.alarmDia(dias, (p) => (p === '0107' ? 'danger' : 'ok')) === 1);
waar('alarmDia: oranje is geen alarm', R.alarmDia(dias, (p) => (p === '0105' ? 'warn' : 'ok')) === -1);

console.log('\n3. Instellingen');
waar('wisseltijd: 15 s mag', R.schoonMs('15000') === 15000);
waar('wisseltijd: onzin of 7 s wordt 10 s', R.schoonMs('x') === 10000 && R.schoonMs(7000) === 10000 && R.STANDAARD_MS === 10000);
waar('vinkjes: dubbel en onbekend eruit', JSON.stringify(R.schoonUit(['temp', 'temp', 'x'])) === '["temp"]');

console.log('\n4. Eigen keuze per categorie (16-10-2026)');
const eig = { heeft: uit(['010D', '010C', '0105', '0146', '0142', '221310', '22402B']), eigen: { temp: ['221310'], elektrisch: ['22402B'] } };
ind = R.indeling('benzine', eig);
const tempD = ind.dias.filter((d) => d.cat === 'temp').pop(), elD = ind.dias.find((d) => d.cat === 'elektrisch');
waar('een eigen PID die ovzCat nergens onderbrengt staat in zijn gekozen categorie', tempD && pids(tempD).indexOf('221310') > -1, ids(ind) + ' ' + JSON.stringify(ind.dias.map(pids)));
waar('accustroom in Elektrisch, onder de accuspanning', elD && pids(elD).join() === '0142,22402B', JSON.stringify(ind.dias.map(pids)));
ind = R.indeling('benzine', { heeft: uit(['010D', '010C', '0105', '0146', '0142']), eigen: { elektrisch: ['0146'] } });
const plek = ind.dias.filter((d) => pids(d).indexOf('0146') > -1);
waar('jouw keuze wint: 0146 in Elektrisch en niet meer bij Temperaturen', plek.length === 1 && plek[0].cat === 'elektrisch', JSON.stringify(ind.dias.map((d) => d.cat + ':' + pids(d))));
ind = R.indeling('benzine', { heeft: uit(['010D', '010C', '0105']), eigen: { temp: ['221310'] } });
waar('wat de auto niet geeft, verschijnt ook niet', ind.dias.every((d) => pids(d).indexOf('221310') < 0));
ind = R.indeling('benzine', { heeft: uit(['010D', '010C', '0105', '221310']), eigen: { temp: ['221310'] }, uit: ['temp'] });
waar('categorie uit: ook de eigen keuze doet niet mee', ind.dias.every((d) => pids(d).indexOf('221310') < 0));
const se = JSON.stringify(R.schoonEigen({ temp: ['221310', '221310', 5, '<x>'], motor: ['221310', '0104'], bestaatniet: ['0105'] }));
waar('schoonEigen: onbekende categorie, rommel en dubbel eruit; de eerste categorie wint', se === '{"motor":["221310","0104"]}', se);
waar('schoonEigen: geen object → leeg', JSON.stringify(R.schoonEigen('x')) === '{}' && JSON.stringify(R.schoonEigen(['temp'])) === '{}');

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
