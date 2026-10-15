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
waar('kop: snelheid en toerental, als getal', ind.kop.map((t) => t.pids[0] + ':' + t.soort).join(' ') === '010D:getal 010C:getal', JSON.stringify(ind.kop));
waar('benzine: zes dia\'s in vaste volgorde', ids(ind) === 'motor temp brandstof lucht uitlaat elektrisch', ids(ind));
const alle = ind.kop.reduce((a, t) => a.concat(t.pids), []).concat(ind.dias.reduce((a, d) => a.concat(pids(d)), []));
waar('elke sensor staat op één plek', new Set(alle).size === alle.length, alle.join(','));
waar('elke tegel een unieke id', new Set(ind.kop.concat(...ind.dias.map((d) => d.tegels)).map((t) => t.id)).size === alle.length - ind.dias.reduce((n, d) => n + d.tegels.filter((t) => t.pids.length === 2).length, 0));
const br = ind.dias.find((d) => d.id === 'brandstof');
waar('brandstof: verbruik breed als grafiek, trims kort+lang als duo', br.tegels[0].soort === 'grafiek' && br.tegels[0].breed && br.tegels[1].soort === 'duo' && br.tegels[1].pids.join() === '0106,0107', JSON.stringify(br.tegels.slice(0, 2)));
waar('temperaturen: koelwater eerst, als balk', ind.dias[1].tegels[0].pids[0] === '0105' && ind.dias[1].tegels[0].soort === 'balk');
waar('geen dia meer dan ' + R.MAX_PER_DIA + ' tegels', ind.dias.every((d) => d.tegels.length <= R.MAX_PER_DIA));

ind = R.indeling('ev', { heeft: uit(['010D', '015B', '0142', '0105']) });
waar('EV zonder toerental: de aandrijfaccu in de kop', ind.kop.map((t) => t.pids[0]).join() === '010D,015B', JSON.stringify(ind.kop));
waar('een dia met één tegel gaat op in de vorige (elektrisch eerst, dan temp)', ind.dias.length === 1 && pids(ind.dias[0]).join() === '0142,0105' && /Elektrisch · Temperaturen/.test(ind.dias[0].naam), JSON.stringify(ind.dias));

ind = R.indeling('hybride', { heeft: alles });
waar('hybride: elektrisch is de eerste dia', ind.dias[0].id === 'elektrisch', ids(ind));

ind = R.indeling('benzine', { heeft: uit(['010D', '010C', '0106', '0105', '015C', '0142', '0104']) });
waar('alleen wat de auto heeft; trim zonder lange wordt een balk', pids(ind.dias[1]).slice(0, 2).join() === '0105,015C' && JSON.stringify(ind).indexOf('"0107"') < 0 && /"soort":"balk","pids":\["0106"\]/.test(JSON.stringify(ind)), JSON.stringify(ind.dias));
ind = R.indeling('benzine', { heeft: uit(['0105']), heeftKop: alles });
waar('de kop kijkt naar wat de auto levert, de dia\'s naar wat aan staat', ind.kop.length === 2 && pids(ind.dias[0]).join() === '0105', JSON.stringify(ind));
waar('een auto zonder sensoren: niets', R.indeling('benzine', { heeft: () => false }).dias.length === 0);

const heeftT = (p) => /^01/.test(p);
const extra = ['0175', '0176', '016B'];
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
