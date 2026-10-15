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
waar('benzine: zes dia\'s in vaste volgorde', ids(ind) === 'motor temp brandstof lucht uitlaat elektrisch', ids(ind));
const alle = ind.kop.reduce((a, t) => a.concat(t.pids), []).concat(ind.dias.reduce((a, d) => a.concat(pids(d)), []));
waar('elke sensor staat op één plek', new Set(alle).size === alle.length, alle.join(','));
waar('elke tegel een unieke id', new Set(ind.kop.concat(...ind.dias.map((d) => d.tegels)).map((t) => t.id)).size === alle.length);
const br = ind.dias.find((d) => d.id === 'brandstof');
waar('brandstof: verbruik groot met lijn, trims vanuit het midden rond 0 %', br.tegels[0].soort === 'held' && br.tegels[0].pids[0] === 'CA03' && br.tegels[1].soort === 'mid' && br.tegels[1].midden === 0 && br.tegels[1].span === 25, JSON.stringify(br.tegels.slice(0, 2)));
waar('temperaturen: koelwater eerst, als rij met band', ind.dias[1].tegels[0].pids[0] === '0105' && ind.dias[1].tegels[0].soort === 'rij');
const ui = ind.dias.find((d) => d.id === 'uitlaat');
waar('uitlaat: lambda rond 1,00, sondes als staaf met de 0,45 V-lijn', ui.tegels[0].soort === 'mid' && ui.tegels[0].midden === 1 && ui.tegels.some((t) => t.pids[0] === '0114' && t.soort === 'staaf' && t.ref === 0.45), JSON.stringify(ui.tegels.slice(0, 3)));

console.log('\n1b. De panelen');
const pn = R.groepen(br.tegels);
waar('brandstof: held, één trimpaneel met alle vier, dan rijen', pn.map((g) => g.soort + ':' + g.tegels.length).join(' ') === 'held:1 mid:4 rij:3', pn.map((g) => g.soort + ':' + g.tegels.length).join(' '));
waar('het trimpaneel heet Brandstoftrims', pn[1].titel === 'Brandstoftrims');
const mot = R.groepen(ind.dias[0].tegels);
waar('motor: belasting, pedaal, gasklep en koppel staan samen op één tellerplaat', mot.filter((g) => g.soort === 'staaf').length === 1 && mot.find((g) => g.soort === 'staaf').tegels.length === 4, mot.map((g) => g.soort + ':' + g.tegels.length).join(' '));
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

ind = R.indeling('hybride', { heeft: alles });
waar('hybride: elektrisch is de eerste dia', ind.dias[0].id === 'elektrisch', ids(ind));

ind = R.indeling('benzine', { heeft: uit(['010D', '010C', '0106', '0105', '015C', '0142', '0104']) });
waar('alleen wat de auto heeft; een dia met één sensor gaat bij de vorige', pids(ind.dias[1]).join() === '0105,015C,0106,0142' && JSON.stringify(ind).indexOf('"0107"') < 0, JSON.stringify(ind.dias));
ind = R.indeling('benzine', { heeft: uit(['0105']), heeftKop: alles });
waar('de kop kijkt naar wat de auto levert, de dia\'s naar wat aan staat', ind.kop.length === 2 && pids(ind.dias[0]).join() === '0105', JSON.stringify(ind));
waar('een auto zonder sensoren: niets', R.indeling('benzine', { heeft: () => false }).dias.length === 0);

const heeftT = (p) => /^01/.test(p);
const extra = ['0175', '0176', '016B', '013D', '013F'];
ind = R.indeling('benzine', { heeft: heeftT, extra: extra, cat: (p) => (extra.indexOf(p) > -1 ? 'temp' : null), balk: () => true });
const tmp = ind.dias.filter((d) => /^temp/.test(d.id));
waar('aanvullen: een eigen temperatuur komt bij Temperaturen', tmp.some((d) => pids(d).indexOf('0175') > -1), JSON.stringify(tmp));
waar('te vol: Temperaturen wordt gesplitst in (1/2) en (2/2)', tmp.length === 2 && /\(1\/2\)/.test(tmp[0].naam) && tmp[1].id === 'temp#2', tmp.map((d) => d.naam + ':' + d.tegels.length).join(' | '));
ind = R.indeling('benzine', { heeft: alles, extra: ['010D', '9999'], cat: () => 'motor' });
waar('aanvullen zet geen sensor dubbel en niets wat de auto niet heeft', JSON.stringify(ind).split('"010D"').length === 2);

ind = R.indeling('benzine', { heeft: alles, uit: ['temp', 'lucht', 'onzin'] });
waar('vinkjes: temp en lucht doen niet mee, een onbekende id telt niet', ids(ind) === 'motor brandstof uitlaat elektrisch', ids(ind));
ind = R.indeling('benzine', { heeft: alles, uit: R.DIAS.map((d) => d.id) });
waar('alles uit = niets uit', ind.dias.length === 6, ids(ind));

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

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
