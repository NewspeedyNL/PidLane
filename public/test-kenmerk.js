// ══════════════════════════════════════════════════════════════════
// test-kenmerk.js — de derde poort: geldt deze regel voor déze auto? (#532)
// ──────────────────────────────────────────────────────────────────
// Op de echte pidlane-kenmerk.js, met de echte pidlane-waarneming.js voor de
// antwoorden van een mens en de echte pidlane-data.js voor de regels:
//   1. het profiel: bewezen, waarschijnlijk, onbekend — en uit welke bron
//   2. geldt() en toepassen(): bewezen beslist, waarschijnlijk zwakt af tot
//      let op, onbekend = niet te beoordelen, bewezen afwezig = geen oordeel
//   3. één grens per grootheid: laadspanning en koelwater, met de harde
//      grenzen die nooit door de poort gaan
//   4. de bevindingen (CORRELATION_RULES) en het blok voor de AI
//   5. de antwoorden van een mens via PLWaarneming
// Draaien vanuit de repo:  node public/test-kenmerk.js    (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');
let fout = 0, ok = 0;
function t(naam, kreeg, wil) {
  const goed = JSON.stringify(kreeg) === JSON.stringify(wil);
  if (goed) { ok++; console.log('  ok    ' + naam); } else { fout++; console.log('  FOUT  ' + naam + '\n        kreeg ' + JSON.stringify(kreeg) + ', wilde ' + JSON.stringify(wil)); }
}
const lees = (f) => fs.readFileSync(__dirname + '/' + f, 'utf8');
function bouw(extra) {
  const opslag = {};
  const s = {
    console: { log() {}, warn() {}, error: console.error },
    localStorage: { getItem: (k) => (k in opslag ? opslag[k] : null), setItem: (k, v) => { opslag[k] = String(v); }, removeItem: (k) => { delete opslag[k]; } },
    document: { getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {} }) },
    pidVals: {}, pidHist: {}, supportedPIDs: new Set(), activePIDs: new Set(), demoMode: false,
    vehicleInfo: {}, Date, JSON, Math
  };
  Object.assign(s, extra || {});
  s.window = s;
  vm.createContext(s);
  vm.runInContext(lees('pidlane-data.js'), s, { filename: 'pidlane-data.js' });
  vm.runInContext(lees('pidlane-waarneming.js'), s, { filename: 'pidlane-waarneming.js' });
  vm.runInContext(lees('pidlane-kenmerk.js'), s, { filename: 'pidlane-kenmerk.js' });
  if (!s.PLKenmerk || !s.PLWaarneming || !Array.isArray(s.CORRELATION_RULES)) { console.error('FOUT: PLKenmerk, PLWaarneming of CORRELATION_RULES niet geladen'); process.exit(1); }
  return s;
}
const K = bouw().PLKenmerk;
const kort = (km) => km.waarde === null ? 'onbekend' : (km.waarde ? 'ja' : 'nee') + '/' + km.zeker;

console.log('\n1. Het profiel');
let p = K.profiel({ merk: 'Mazda', jaar: 2018, brandstof: 'benzine' });
t('Mazda 2018: slim laden waarschijnlijk (bouwjaar)', kort(p.slimladen), 'ja/waarschijnlijk');
t('Mazda: geen kenveldthermostaat, waarschijnlijk (merk)', kort(p.kenveldthermostaat), 'nee/waarschijnlijk');
t('benzine: diesel nee, bewezen', kort(p.diesel), 'nee/bewezen');
t('LPG zonder bewijs: onbekend', kort(p.lpg), 'onbekend');
t('turbo zonder bewijs: onbekend', kort(p.turbo), 'onbekend');
p = K.profiel({ merk: 'Mazda', jaar: 2018, laadGevraagd: true });
t('de auto vraagt een laadspanning: slim laden bewezen', kort(p.slimladen), 'ja/bewezen');
p = K.profiel({ merk: 'Volkswagen', jaar: 2016 });
t('Volkswagen: kenveldthermostaat waarschijnlijk', kort(p.kenveldthermostaat), 'ja/waarschijnlijk');
t('Mercedes: kenveldthermostaat onbekend (wisselt per motor)', kort(K.profiel({ merk: 'Mercedes-Benz' }).kenveldthermostaat), 'onbekend');
t('Opel 2001: gewone dynamo waarschijnlijk', kort(K.profiel({ merk: 'Opel', jaar: 2001 }).slimladen), 'nee/waarschijnlijk');
t('turbo gezien (PLGate): bewezen', kort(K.profiel({ turboGezien: true }).turbo), 'ja/bewezen');
t('turbo "nee" in het profiel: bewezen nee', kort(K.profiel({ turboProfiel: 'nee' }).turbo), 'nee/bewezen');
t('diesel 2010 zonder meting: turbo waarschijnlijk', kort(K.profiel({ brandstof: 'diesel', jaar: 2010 }).turbo), 'ja/waarschijnlijk');
t('brandstof lpg: LPG bewezen', kort(K.profiel({ brandstof: 'lpg' }).lpg), 'ja/bewezen');
t('hybride: CVT waarschijnlijk', kort(K.profiel({ brandstof: 'hybride' }).cvt), 'ja/waarschijnlijk');
t('handgeschakeld: CVT bewezen nee', kort(K.profiel({ transmissie: 'handgeschakeld' }).cvt), 'nee/bewezen');
t('0134 aangeboden: breedband bewezen', kort(K.profiel({ supported: ['0114', '0134'] }).breedband_b1s1), 'ja/bewezen');
t('alleen 0114: breedband waarschijnlijk nee', kort(K.profiel({ supported: ['0105', '0114'] }).breedband_b1s1), 'nee/waarschijnlijk');
t('een mens wint van het bouwjaar', kort(K.profiel({ jaar: 2018, mens: { slimladen: false } }).slimladen), 'nee/bewezen');
t('onzinnig bouwjaar telt niet', kort(K.profiel({ jaar: 1234 }).slimladen), 'onbekend');

console.log('\n2. geldt() en toepassen()');
const G = (v, prof) => K.geldt(v, prof).uitkomst;
t('bewezen waar → geldt', G({ diesel: false }, K.profiel({ brandstof: 'benzine' })), 'geldt');
t('bewezen onwaar → geldt niet', G({ diesel: false }, K.profiel({ brandstof: 'diesel' })), 'geldt_niet');
t('waarschijnlijk waar → waarschijnlijk', G({ kenveldthermostaat: false }, K.profiel({ merk: 'Mazda' })), 'waarschijnlijk');
t('waarschijnlijk onwaar → onbekend (niet te beoordelen)', G({ kenveldthermostaat: false }, K.profiel({ merk: 'Audi' })), 'onbekend');
t('niets bekend → onbekend', G({ kenveldthermostaat: false }, K.profiel({})), 'onbekend');
t('niets bekend, gangbaar → geldt', G({ lpg: { is: false, gangbaar: true } }, K.profiel({})), 'geldt');
t('gangbaar, maar bewezen LPG → geldt niet', G({ lpg: { is: false, gangbaar: true } }, K.profiel({ brandstof: 'lpg' })), 'geldt_niet');
t('gangbaar, aanwijzing voor het tegendeel → onbekend', G({ cvt: { is: false, gangbaar: true } }, K.profiel({ brandstof: 'hybride' })), 'onbekend');
t('twee voorwaarden: de ergste telt', G({ diesel: false, kenveldthermostaat: false }, K.profiel({ brandstof: 'benzine', merk: 'Audi' })), 'onbekend');
t('de open kenmerken worden genoemd', K.geldt({ kenveldthermostaat: false }, K.profiel({ merk: 'BMW' })).open, ['kenveldthermostaat']);
t('toepassen: fout + geldt = fout', K.toepassen('fout', { uitkomst: 'geldt' }), 'fout');
t('toepassen: fout + waarschijnlijk = let op (afzwakken)', K.toepassen('fout', { uitkomst: 'waarschijnlijk' }), 'letop');
t('toepassen: fout + onbekend = onbeslist', K.toepassen('fout', { uitkomst: 'onbekend' }), 'onbeslist');
t('toepassen: fout + geldt niet = geen oordeel', K.toepassen('fout', { uitkomst: 'geldt_niet' }), null);
t('toepassen: let op wordt nooit fout (nooit ophogen)', K.toepassen('letop', { uitkomst: 'geldt' }), 'letop');

console.log('\n3. Eén grens per grootheid');
const L = (u, ctx) => { const r = K.laadspanning(u, 1500, ctx); return r && r.niveau; };
const mazda = K.profiel({ merk: 'Mazda', jaar: 2018 }), opel = K.profiel({ merk: 'Opel', jaar: 2001 });
const klassiek = K.profiel({ mens: { slimladen: false } });
t('laadspanning 11,9 V: op elke auto fout (hard)', [L(11.9, { prof: mazda }), L(11.9, { prof: {} })], ['fout', 'fout']);
t('laadspanning 15,4 V: op elke auto fout (hard)', L(15.4, { prof: mazda }), 'fout');
t('12,8 V op een Mazda 2018 (slim laden waarschijnlijk): niet te beoordelen', L(12.8, { prof: mazda }), 'onbeslist');
t('12,8 V op een Opel 2001: let op, niet zeker', L(12.8, { prof: opel }), 'letop');
t('12,8 V, gewone dynamo door een mens bevestigd: fout', L(12.8, { prof: klassiek }), 'fout');
t('13,6 V: ok', L(13.6, { prof: klassiek }), 'ok');
t('de gevraagde spanning beslist: laadt niet → fout, ook boven 13,2 V', L(13.6, { prof: mazda, laad: { staat: 'laadt_niet', tekst: 'x' } }), 'fout');
t('de gevraagde spanning beslist: bewust laag → ok', L(12.8, { prof: klassiek, laad: { staat: 'bewust_laag', tekst: 'x' } }), 'ok');
t('… maar onder 12,2 V wint de harde grens', L(12.0, { prof: mazda, laad: { staat: 'bewust_laag', tekst: 'x' } }), 'fout');
t('motor uit: geen oordeel', K.laadspanning(12.4, 0, {}), null);
const C = (tmp, prof) => { const r = K.koelwater(tmp, { prof }); return r && r.niveau; };
t('koelwater 100 °C: ok', C(100, mazda), 'ok');
t('108 °C op een Mazda: let op (vaste thermostaat waarschijnlijk)', C(108, mazda), 'letop');
t('108 °C op een Golf: niet te beoordelen (kenveld waarschijnlijk)', C(108, K.profiel({ merk: 'Volkswagen' })), 'onbeslist');
t('108 °C, vaste thermostaat bevestigd: fout', C(108, K.profiel({ mens: { kenveldthermostaat: false } })), 'fout');
t('108 °C, kenveld bevestigd: ok', C(108, K.profiel({ mens: { kenveldthermostaat: true } })), 'ok');
t('113 °C: op elke motor fout, ook een Golf', C(113, K.profiel({ merk: 'Volkswagen' })), 'fout');
t('de tabellen volgen dezelfde grens: PIDS 0105 wH/dH = 105/112', (() => { const s = bouw(); const d = s.PIDS.find((x) => x.pid === '0105'); return [d.wH, d.dH]; })(), [K.KOEL_KLASSIEK, K.KOEL_HARD]);
t('PID_LET_OP 0105 max = KOEL_HARD', bouw().PID_LET_OP['0105'].max, K.KOEL_HARD);
t('laadband: gevraagd 13,1 → vanaf 12,6', K.laadBand(mazda, 13.1).lo, 12.6);
t('laadband: gewone dynamo bevestigd → 13,2', K.laadBand(klassiek, null).lo, 13.2);
t('laadband: onbekend → alleen de harde grens', K.laadBand(mazda, null).lo, K.LAAD_HARD_LAAG);
const tab = bouw().PID_LET_OP;
t('let op 010B: zonder turbo bewezen geen bovengrens van 110 kPa', K.letOp('010B', tab, K.profiel({})).max, 300);
t('let op 010B: bewezen geen turbo → 110 kPa', K.letOp('010B', tab, K.profiel({ turboProfiel: 'nee' })).max, 110);
t('let op 0107: LPG bewezen → geen bereik', K.letOp('0107', tab, K.profiel({ brandstof: 'lpg' })), null);
t('let op 0107: zonder LPG-bewijs gewoon ±25', K.letOp('0107', tab, K.profiel({})).max, 25);

console.log('\n4. Bevindingen en het blok voor de AI');
{
  const s = bouw({ vehicleInfo: { merk: 'Mazda', year: '2018', brandstof: 'benzine' } });
  const R = (id) => s.CORRELATION_RULES.find((r) => r.id === id);
  s.pidVals['0142'] = 12.7; s.pidVals['010C'] = 1800;
  t('Mazda 2018, 12,7 V: de dynamo-bevinding gaat NIET af', R('alternator').test(), false);
  t('… en is onbeslist', R('alternator').oordeel().niveau, 'onbeslist');
  s.pidVals['0142'] = 11.8;
  t('tegenproef: 11,8 V gaat wél af', R('alternator').test(), true);
  s.pidVals['0105'] = 109;
  t('Mazda 109 °C: oververhitting gaat af als let op', [R('oververhitting').test(), R('oververhitting').oordeel().niveau], [true, 'letop']);
  s.vehicleInfo.merk = 'Audi'; s.PLKenmerk.vergeet();
  t('Audi 109 °C: niet te beoordelen, gaat niet af', [R('oververhitting').test(), R('oververhitting').oordeel().niveau], [false, 'onbeslist']);
  s.pidVals['0105'] = 50; s.pidHist['0105'] = [{ t: 0, v: 40 }, { t: 1000, v: 50 }];
  t('thermostaat: 50 °C na een seconde zegt niets', R('thermostaat').test(), false);
  s.pidVals['011F'] = 900;
  t('… na 15 minuten draaien wél', R('thermostaat').test(), true);
  s.vehicleInfo.brandstof = 'hybride'; s.PLKenmerk.vergeet();
  t('… maar niet op een hybride (motor gaat tussendoor uit)', R('thermostaat').test(), false);
  s.PLKenmerk.noteer('bev_x', 'Koelwater loopt op', K.geldt({ kenveldthermostaat: false }, K.profiel({ merk: 'Audi' })));
  const blok = s.PLKenmerk.blok();
  t('het blok noemt de bekende kenmerken', /KENMERKEN VAN DEZE AUTO[\s\S]*hybride aandrijving: ja/.test(blok), true);
  t('het blok noemt wat niet te beoordelen is, met de instructie', /NIET TE BEOORDELEN[\s\S]*Koelwater loopt op[\s\S]*GEEN conclusie/.test(blok), true);
  t('de vragen: één per open kenmerk', s.PLKenmerk.vragen(s.PLKenmerk.onbeslist()).map((v) => v.id), ['kenveldthermostaat']);
  t('een leeg profiel zonder notities: geen blok', K.promptBlok({}, []), '');
}

console.log('\n5. Een mens beantwoordt de vraag');
{
  const s = bouw({ vehicleInfo: { merk: 'Audi', year: '2016', vin: 'WAUZZZ8V0GA000000' } });
  const R = s.CORRELATION_RULES.find((r) => r.id === 'oververhitting');
  s.pidVals['0105'] = 109;
  t('Audi 109 °C eerst onbeslist', R.oordeel().niveau, 'onbeslist');
  s.PLKenmerk.noteer('bev_oververhitting', 'Koelwater loopt op', K.geldt({ kenveldthermostaat: false }, K.profiel({ merk: 'Audi' })));
  t('antwoord "nee, geen kenveld" wordt bewaard', s.PLKenmerk.antwoord('kenveldthermostaat', false), true);
  t('PLWaarneming: weerlegd door een mens', [s.PLWaarneming.lees('kenveldthermostaat').status, s.PLWaarneming.lees('kenveldthermostaat').bron], ['weerlegd', 'mens']);
  t('daarna: fout, bewezen', R.oordeel().niveau, 'fout');
  t('de notitie met dat open kenmerk is weg', s.PLKenmerk.onbeslist().length, 0);
  s.PLKenmerk.antwoord('kenveldthermostaat', true);
  t('antwoord "ja" = gezien, bron mens', [s.PLWaarneming.lees('kenveldthermostaat').status, s.PLWaarneming.lees('kenveldthermostaat').bron], ['gezien', 'mens']);
  t('daarna: geen bevinding (de regel geldt niet)', R.oordeel(), null);
  t('… en de grens zegt: normaal voor deze motor', s.PLKenmerk.koelLive(109).niveau, 'ok');
  t('een onbekend kenmerk wordt geweigerd', s.PLKenmerk.antwoord('vliegende_auto', true), false);
}

console.log('\n' + ok + ' goed, ' + fout + ' fout');
process.exit(fout ? 1 : 0);
