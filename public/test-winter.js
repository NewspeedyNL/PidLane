// ══════════════════════════════════════════════════════════════════
// test-winter.js — winterprofiel, seizoensbanner, adviezen en bandentabel (#556/#559)
// ──────────────────────────────────────────────────────────────────
// WAT HIER ROOD HOORT TE WORDEN
//   • een banner die vaker dan één keer per seizoen komt, in de zomer
//     verschijnt bij zomerbanden, of wegblijft in oktober zonder weer;
//   • zomervloeistof bij vorst zonder rood advies, of wintervloeistof tot
//     −20 °C die bij −5 °C toch alarm slaat;
//   • zomerbanden onder 7 °C zonder advies, all-season wél;
//   • een bandentabel die bij 17 °C een winterband "past goed" noemt;
//   • keuzes in de app die de Worker weigert (of andersom);
//   • een advies zonder bron.
//
// Laadt de echte pidlane-winter.js en pidlane-weer.js (vm) en voor de
// keuzes de echte KP_VELDEN uit worker.js.
// Draaien vanuit public/:  node test-winter.js     (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const opslag = {};
const ctx = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
  JSON, Date, Math, Promise, encodeURIComponent, setInterval() {}
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-weer.js'), 'utf8'), ctx, { filename: 'pidlane-weer.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-winter.js'), 'utf8'), ctx, { filename: 'pidlane-winter.js' });
if (!ctx.PLWinter || !ctx.PLWinter._kern) { console.log('FOUT PLWinter hangt zijn kern niet meer naar buiten'); process.exit(1); }
const K = ctx.PLWinter._kern, WK = ctx.PLWeer._kern;

const t = (j, m, d, u) => new Date(j, m - 1, d, u == null ? 12 : u).getTime();
const NOV = t(2026, 11, 20);
const weer = (dagen) => WK.samenvat(dagen.map((x, i) => Object.assign({ datum: WK.lokaleDatum(NOV + i * 864e5) }, x)), NOV);
const KOUD = weer([{ min: 4, max: 8 }, { min: 2, max: 6 }, { min: 3, max: 7 }]);
const VORST = weer([{ min: -4, max: 2 }, { min: -2, max: 3 }, { min: 1, max: 5 }]);
const STRENG = weer([{ min: -12, max: -3 }, { min: -8, max: -1 }, { min: -5, max: 0 }]);
const ZACHT = weer([{ min: 9, max: 13 }, { min: 8, max: 12 }, { min: 10, max: 14 }]);
const WARM = weer([{ min: 10, max: 19 }, { min: 11, max: 21 }, { min: 9, max: 17 }]);
const ids = (l) => l.map((a) => a.id);

console.log('1. Het seizoen');
toets('oktober is winter, met het jaar van oktober', K.seizoen(t(2026, 10, 1)).sleutel === 'winter-2026');
toets('januari hoort bij de winter van het jaar ervoor', K.seizoen(t(2027, 1, 15)).sleutel === 'winter-2026');
toets('maart is nog winter, april zomer', K.seizoen(t(2027, 3, 31)).soort === 'winter' && K.seizoen(t(2027, 4, 1)).sleutel === 'zomer-2027');
toets('30 september is nog zomer', K.seizoen(t(2026, 9, 30)).soort === 'zomer');

console.log('\n2. De banner — één keer per seizoen');
const leeg = {};
const ban = (c) => K.bannerNodig(Object.assign({ nu: NOV, profiel: leeg, weer: null, gezien: null }, c));
toets('november zonder weer: banner', ban({}) && ban({}).soort === 'winter' && /pas je profiel aan voor de winterperiode/i.test(ban({}).tekst));
toets('de verwachting onder 7 °C: banner', !!ban({ weer: KOUD }));
toets('nog zacht weer (elke nacht ≥ 7 °C): wachten', ban({ weer: ZACHT }) === null);
toets('al gezien dit seizoen: geen banner', ban({ gezien: 'winter-2026' }) === null);
toets('gezien vorig seizoen: wel weer', !!ban({ gezien: 'winter-2025' }));
const klaar = { banden: 'winter', sproeier: 'winter', sproeier_datum: '2026-10-05', plaats: 'utrecht' };
toets('profiel al klaar voor de winter: geen banner', ban({ profiel: klaar, weer: VORST }) === null);
toets('maar wintervloeistof van vorig jaar telt niet als klaar', !!ban({ profiel: Object.assign({}, klaar, { sproeier_datum: '2026-02-01' }) }));
toets('zomerbanden in mei: geen voorjaarsbanner', K.bannerNodig({ nu: t(2027, 5, 10), profiel: { banden: 'zomer' } }) === null);
toets('winterbanden in mei zonder weer: voorjaarsbanner', (K.bannerNodig({ nu: t(2027, 5, 10), profiel: { banden: 'winter' } }) || {}).soort === 'zomer');
toets('winterbanden in april, nog koud: wachten', K.bannerNodig({ nu: t(2027, 4, 10), profiel: { banden: 'winter' }, weer: KOUD }) === null);
toets('winterbanden in april, elke dag warm: voorjaarsbanner', (K.bannerNodig({ nu: t(2027, 4, 10), profiel: { banden: 'winter' }, weer: WARM }) || {}).sleutel === 'zomer-2027');

console.log('\n3. Ruitensproeiervloeistof');
const adv = (p, w, extra) => K.adviezen(Object.assign({ nu: NOV, profiel: p || {}, weer: w }, extra || {}));
const sp = (p, w) => adv(p, w).filter((a) => /^sproeier/.test(a.id))[0] || null;
toets('zomervloeistof en vorst: rood', (sp({ sproeier: 'zomer' }, VORST) || {}).ernst === 'rood');
toets('zomervloeistof en 2 °C: nog niets', sp({ sproeier: 'zomer' }, KOUD) === null);
toets('weet niet en vorst: oranje met de vraag', (sp({ sproeier: 'weet niet' }, VORST) || {}).ernst === 'oranje');
toets('niets ingevuld en vorst: ook oranje', (sp({}, VORST) || {}).ernst === 'oranje');
toets('winterversie (standaard −20 °C) en −4 °C: niets', sp({ sproeier: 'winter' }, VORST) === null);
toets('winterversie tot −5 °C en −4 °C: rood (binnen de marge)', (sp({ sproeier: 'winter', sproeier_tot: -5 }, VORST) || {}).ernst === 'rood');
toets('winterversie tot −10 °C en −12 °C: rood', (sp({ sproeier: 'winter', sproeier_tot: -10 }, STRENG) || {}).ernst === 'rood');
toets('winterversie, strenge vorst, lang geleden bijgevuld: controleer het mengsel',
  (sp({ sproeier: 'winter', sproeier_tot: -30, sproeier_datum: '2026-08-01' }, STRENG) || {}).id === 'sproeier-oud');
toets('net bijgevuld: geen herinnering', sp({ sproeier: 'winter', sproeier_tot: -30, sproeier_datum: '2026-11-10' }, STRENG) === null);
toets('zonder weer geen sproeieradvies', sp({ sproeier: 'zomer' }, null) === null);

console.log('\n4. Banden');
toets('zomerbanden onder 7 °C: wisselen (oranje)', (adv({ banden: 'zomer' }, KOUD).find((a) => a.id === 'banden-wissel') || {}).ernst === 'oranje');
toets('zomerbanden en vorst: rood', (adv({ banden: 'zomer' }, VORST).find((a) => a.id === 'banden-wissel') || {}).ernst === 'rood');
toets('all-season onder 7 °C: geen wisseladvies', !ids(adv({ banden: 'all-season' }, VORST)).includes('banden-wissel'));
toets('winterbanden en vorst: geen wisseladvies', !ids(adv({ banden: 'winter' }, VORST)).includes('banden-wissel'));
toets('zomerbanden bij zacht weer: niets', !ids(adv({ banden: 'zomer' }, ZACHT)).includes('banden-wissel'));
toets('banden onbekend en koud: de vraag', ids(adv({}, KOUD)).includes('banden-onbekend'));
toets('winterbanden en elke dag warm: slijtage', ids(adv({ banden: 'winter' }, WARM)).includes('banden-warm'));
toets('winterband op 3 mm: oranje', (adv({ banden: 'winter', banden_mm: 3 }, null).find((a) => a.id === 'banden-mm') || {}).ernst === 'oranje');
toets('winterband op 5 mm: niets', !ids(adv({ banden: 'winter', banden_mm: 5 }, null)).includes('banden-mm'));
toets('DOT 4518 (acht jaar): te oud', ids(adv({ banden_dot: '4518' }, null)).includes('banden-oud'));
toets('DOT 4523: niet te oud', !ids(adv({ banden_dot: '4523' }, null)).includes('banden-oud'));
toets('een DOT uit de toekomst telt niet', K.dotLeeftijd('0130', NOV) === null);
toets('alleen M+S: de Duitsland-opmerking', ids(adv({ banden: 'winter', banden_alpine: 'alleen m+s' }, null)).includes('banden-ms'));
toets('bergsymbool: geen opmerking', !ids(adv({ banden: 'winter', banden_alpine: 'ja' }, null)).includes('banden-ms'));

console.log('\n5. Vorst, gladheid, rubbers');
const GLAD = weer([{ min: -1, max: 3, neerslag: 4 }, { min: 2, max: 6 }, { min: 3, max: 7 }]);
const g = adv({}, GLAD, { opwarmMin: 7 });
toets('gladheid: oranje, met niet-warmdraaien', (g.find((a) => a.id === 'glad') || {}).ernst === 'oranje' && /niet stationair warmdraaien/i.test(g.find((a) => a.id === 'glad').tekst));
toets('de opwarmtijd van DEZE auto staat erin', /na ongeveer 7 minuten/.test(g.find((a) => a.id === 'glad').tekst));
toets('gladheid en vorst: niet allebei', !ids(g).includes('vorst'));
toets('droge vorst: het vorstadvies, met folie en airco', /folie/.test((adv({}, VORST).find((a) => a.id === 'vorst') || {}).tekst || '') && /airco aan/.test(adv({}, VORST).find((a) => a.id === 'vorst').tekst));
toets('rubbers: géén vaseline', /Geen vaseline/.test((adv({}, VORST).find((a) => a.id === 'rubbers') || {}).tekst || ''));
toets('zonder vorst geen rubbers', !ids(adv({}, KOUD)).includes('rubbers'));

console.log('\n6. Volgorde en bron');
const alles = adv({ banden: 'zomer', sproeier: 'zomer', banden_dot: '4518' }, VORST);
toets('de zwaarste eerst', alles[0].ernst === 'rood' && alles[alles.length - 1].ernst === 'info', ids(alles).join());
toets('elk advies heeft een bron, een duur en een titel', alles.every((a) => a.bron && (a.duur === 'weer' || a.duur === 'seizoen') && a.titel));
toets('banden-advies zegt dat de tabel een model is', /model/.test(alles.find((a) => a.id === 'banden-wissel').bron));

console.log('\n7. De bandentabel (#559) — een model');
const B = K.bandenStand;
toets('winterband bij 17 °C: matig, niet goed', B('winter', 17).label === 'matig', JSON.stringify(B('winter', 17)));
toets('winterband bij 25 °C: past slecht', B('winter', 25).label === 'past slecht');
toets('winterband bij −5 °C: past goed', B('winter', -5).label === 'past goed');
toets('zomerband bij 3 °C: past slecht of matig, nooit goed', B('zomer', 3).label !== 'past goed');
toets('zomerband bij −5 °C: past slecht', B('zomer', -5).label === 'past slecht');
toets('zomerband bij 15 °C: past goed', B('zomer', 15).label === 'past goed');
toets('all-season bij −5 en 15 °C: nergens slecht', B('all-season', -5).label !== 'past slecht' && B('all-season', 15).label !== 'past slecht');
toets('het omslagpunt: onder 7 °C wint de winterband, boven 10 °C de zomerband',
  B('winter', 5).w > B('zomer', 5).w && B('zomer', 12).w > B('winter', 12).w);
toets('onbekende band: null', B('weet niet', 5) === null);
const tab = K.bandenTabel('winter', VORST.dagen);
toets('de tabel markeert jouw band', /plw-bt-rij mijn[^]*jouw band/.test(tab) && (tab.match(/jouw band/g) || []).length === 1);
toets('de stippen van de verwachting staan op jouw rij', (tab.match(/plw-bt-dot/g) || []).length === 3);
toets('het omslagpunt van 7 °C staat erin', /7 °C/.test(tab) && (tab.match(/plw-bt-7/g) || []).length === 3);
toets('zonder eigen band geen stippen', !/plw-bt-dot/.test(K.bandenTabel(null, VORST.dagen)));
toets('geen percentages in beeld', !/\d+\s?%<|\d+ %/.test(tab.replace(/style="[^"]*"/g, '')));

console.log('\n8. De opwarmtijd van deze auto');
const rit = (kk, ow) => ({ extra: { cd: { kk, ow } } });
toets('mediaan van de koude starts, in minuten', K.opwarmMin([rit(1, 360), rit(1, 480), rit(1, 420), rit(0, 60)]) === 7);
toets('onder drie koude starts: null', K.opwarmMin([rit(1, 360), rit(1, 480)]) === null);

console.log('\n9. Keuren — dezelfde regels als de Worker');
const C = K.controleer;
toets('een geldig profiel', !C({ plaats: 'utrecht', banden: 'winter', banden_dot: '4521', banden_mm: '6,5', sproeier: 'winter', sproeier_tot: '−20', sproeier_datum: '2026-11-01' }).fout);
toets('mm met een komma wordt een getal', C({ banden_mm: '6,5' }).velden.banden_mm === 6.5);
toets('−20 met een echt minteken', C({ sproeier: 'winter', sproeier_tot: '−20' }).velden.sproeier_tot === -20);
toets('grens zonder wintervloeistof wordt niet bewaard', C({ sproeier: 'zomer', sproeier_tot: '-20' }).velden.sproeier_tot === null);
toets('een plaats buiten de lijst: fout', !!C({ plaats: 'mijnstraat 12' }).fout);
toets('DOT 5521 (week 55): fout', !!C({ banden_dot: '5521' }).fout);
toets('profiel 20 mm: fout', !!C({ banden_mm: '20' }).fout);

// De keuzes van de app tegen KP_VELDEN in worker.js — dezelfde regels.
const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const i0 = bron.indexOf('var KP_VELDEN = {'), i1 = bron.indexOf('\n};', i0);
const j0 = bron.indexOf('var WEER_PLAATSEN = {'), j1 = bron.indexOf('\n};', j0);
if (i0 < 0 || i1 < 0 || j0 < 0 || j1 < 0) { console.log('FOUT KP_VELDEN of WEER_PLAATSEN niet gevonden in worker.js'); process.exit(1); }
const V = new Function(bron.slice(j0, j1 + 3) + bron.slice(i0, i1 + 3) + '\nreturn KP_VELDEN;')();
['banden', 'banden_alpine', 'sproeier'].forEach((k) => {
  toets('keuzes van ' + k + ' gelijk aan KP_VELDEN', JSON.stringify(V[k] && V[k].uit) === JSON.stringify(ctx.PLWinter.WINTER_KEUZES[k]), JSON.stringify(V[k]));
});
toets('de plaatsen in KP_VELDEN zijn die van het weer', JSON.stringify(V.plaats.uit.slice().sort()) === JSON.stringify(ctx.PLWeer.PLAATSEN.map((p) => p[0]).sort()));
toets('DOT-patroon gelijk: 4521 goed, 5521 fout aan beide kanten', V.banden_dot.patroon.test('4521') && !V.banden_dot.patroon.test('5521'));
toets('de banner-sleutel past in winter_gezien', V.winter_gezien.patroon.test(K.seizoen(NOV).sleutel) && V.winter_gezien.patroon.test(K.seizoen(t(2027, 6, 1)).sleutel));
toets('profiel en grens: zelfde bereik als de Worker', V.banden_mm.min === 0 && V.banden_mm.max === 15 && V.sproeier_tot.min === -60 && V.sproeier_tot.max === 0);

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen goed'));
process.exit(fout ? 1 : 0);
