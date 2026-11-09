// ══════════════════════════════════════════════════════════════════
// test-zonderuit.js — PLZonderUit: een eigen uitkomst zonder adapter
// ──────────────────────────────────────────────────────────────────
// Laadt de echte pidlane-aankooprapport.js en pidlane-zonderuit.js in een vm.
// De signalen van het papierenrapport komen uit PLAankoop.signalen(): de test
// geeft RDW-rijen en kijkt of het oordeel klopt, en vooral dat het nooit
// "groen" wordt — de elektronica is niet gelezen.
//
// Draaien vanuit public/:  node test-zonderuit.js
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let n = 0, fout = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + naam);
  else { fout++; console.log('  FOUT  ' + naam + (uitleg ? ' — ' + uitleg : '')); }
}
const s = { console: { warn() {}, log() {} }, Date, Math, JSON, String, Number, isFinite, parseFloat, Error, Promise, Array, Object, RegExp };
s.window = s;
vm.createContext(s);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-aankooprapport.js'), 'utf8'), s);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'pidlane-zonderuit.js'), 'utf8'), s);
const K = s.PLZonderUit._kern;
const NU = Date.UTC(2026, 10, 9);
const dag = 864e5;
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
const rdw = (o) => Object.assign({ kenteken: 'AB123C', merk: 'VOLKSWAGEN', tellerstandoordeel: 'Logisch', vervaldatum_apk: ymd(NU + 200 * dag),
  export_indicator: 'Nee', tenaamstellen_mogelijk: 'Ja', wam_verzekerd: 'Ja', openstaande_terugroepactie_indicator: 'Nee', wacht_op_keuren: 'Geen verstrekking in Open Data' }, o || {});

console.log('\n1. Papierenrapport');
{
  const p = K.papieren({ kenteken: 'AB123C', ts: NU, rdw: rdw() });
  toets('alles in orde op papier → "papier-ok", nooit groen', p.oordeel === 'papier-ok', p.oordeel);
  toets('de kop zegt dat de elektronica niet is uitgelezen', /elektronica is niet uitgelezen/.test(p.kop));
  toets('alleen papieren signalen, geen foutcode- of zelftestregels', p.signalen.length > 0 && p.signalen.every(x => ['nap', 'apk', 'keuren', 'export', 'tenaam', 'wam', 'recall'].indexOf(x.id) >= 0), p.signalen.map(x => x.id).join(','));
  toets('NAP logisch → groene regel', p.signalen.some(x => x.id === 'nap' && x.kleur === 'groen'));
  toets('de bezichtigingslijst noemt de 1-euro-test', p.bezichtiging.some(t => /euromunt/.test(t)));
  toets('de vaste vragen staan erin', p.vragen.some(q => /onderhoudshistorie/.test(q)));
}
{
  const p = K.papieren({ kenteken: 'AB123C', ts: NU, rdw: rdw({ tellerstandoordeel: 'Onlogisch' }) });
  toets('TEGENPROEF: NAP onlogisch → rood oordeel', p.oordeel === 'rood' && p.signalen.some(x => x.id === 'nap' && x.kleur === 'rood'), p.oordeel);
  toets('en een vraag over de teller', p.vragen.some(q => /onlogisch/.test(q)));
}
{
  const p = K.papieren({ kenteken: 'AB123C', ts: NU, rdw: rdw({ vervaldatum_apk: ymd(NU + 20 * dag) }) });
  toets('APK binnen een maand → oranje', p.oordeel === 'oranje', p.oordeel);
  const q = K.papieren({ kenteken: 'AB123C', ts: NU, rdw: rdw({ export_indicator: 'Ja' }) });
  toets('gemeld voor export → rood', q.oordeel === 'rood', q.oordeel);
  const r = K.papieren({ kenteken: 'AB123C', ts: NU, rdw: rdw(), recall: { niveau: 'kritiek', tekst: '1 openstaande terugroepactie' } });
  const leeg = K.papieren({ kenteken: 'AB123C', ts: NU, rdw: rdw({ openstaande_terugroepactie_indicator: 'Ja' }), recall: { niveau: 'ok', aantalOpen: 0, aantalTotaal: 0, tekst: 'Geen terugroepacties bekend' } });
  toets('RDW zegt "terugroepactie open" en het opzoeken gaf niets → de RDW-vlag telt (oranje)', leeg.oordeel === 'oranje' && leeg.signalen.some(x => x.id === 'recall' && x.kleur === 'oranje'), JSON.stringify(leeg.signalen.find(x => x.id === 'recall')));
  const schoon = K.papieren({ kenteken: 'AB123C', ts: NU, rdw: rdw({ openstaande_terugroepactie_indicator: 'Ja' }), recall: { niveau: 'ok', aantalOpen: 0, aantalTotaal: 2, tekst: '2 acties, alle uitgevoerd' } });
  toets('TEGENPROEF: acties gevonden en allemaal uitgevoerd → groen (het detail wint)', schoon.signalen.some(x => x.id === 'recall' && x.kleur === 'groen'));
  toets('openstaande terugroepactie → oranje', r.oordeel === 'oranje' && r.signalen.some(x => x.id === 'recall'), r.oordeel);
}
{
  const p = K.papieren({ kenteken: 'AB123C', ts: NU, rdw: rdw(), kennis: { zwak: ['DSG-mechatronic (7-traps DQ200)'] } });
  toets('een zwak punt van het merk wordt een vraag', p.zwak.length === 1 && p.vragen.some(q => /DSG-mechatronic/.test(q)));
  toets('…vóór de vaste drie (die blijven onderaan)', /keuren voordat ik koop/.test(p.vragen[p.vragen.length - 1]));
  const g = K.papieren({ kenteken: 'XX999X', ts: NU, rdw: null });
  toets('niet bij het RDW → grijs, met de reden', g.oordeel === 'grijs' && g.signalen[0].id === 'rdw');
  const t = K.papierenTekst({ kent: 'AB123C', naam: 'VW Golf', p });
  toets('de tekst voor Rapporten heeft kop, vragen en de bron', /^PAPIERENRAPPORT/.test(t) && /Vragen voor de verkoper/.test(t) && /RDW open data/.test(t));
}

console.log('\n2. Onderhoud volgens richtwaarden');
const regel = (p, id) => p.regels.find(x => x.id === id) || {};
{
  const p = K.onderhoudPlan({ bouwjaar: 2022, brandstof: 'benzine', km: 40000, laatsteDatum: new Date(NU - 14 * 30 * dag).toISOString().slice(0, 10), laatsteKm: 30000, nu: NU });
  toets('laatste beurt 14 maanden geleden → olie nu', regel(p, 'olie').staat === 'nu', JSON.stringify(regel(p, 'olie')));
  toets('benzine → bougies in de lijst', !!regel(p, 'bougies').id);
  const q = K.onderhoudPlan({ bouwjaar: 2022, brandstof: 'benzine', km: 40000, laatsteDatum: new Date(NU - 11 * 30.4 * dag).toISOString().slice(0, 10), laatsteKm: 38000, nu: NU });
  toets('11 maanden → olie binnenkort', regel(q, 'olie').staat === 'binnenkort', regel(q, 'olie').staat);
  const r = K.onderhoudPlan({ bouwjaar: 2026, brandstof: 'benzine', km: 3000, laatsteDatum: new Date(NU - 60 * dag).toISOString().slice(0, 10), laatsteKm: 1000, nu: NU });
  toets('TEGENPROEF: net een beurt gehad → olie ok', regel(r, 'olie').staat === 'ok', regel(r, 'olie').staat);
}
{
  const ev = K.onderhoudPlan({ bouwjaar: 2020, brandstof: 'elektriciteit', km: 60000, nu: NU });
  toets('EV: geen olie, luchtfilter, bougies of distributie', !regel(ev, 'olie').id && !regel(ev, 'lucht').id && !regel(ev, 'bougies').id && !regel(ev, 'distributie').id, ev.regels.map(x => x.id).join(','));
  toets('EV: remvloeistof wel', !!regel(ev, 'remvloeistof').id);
  const d = K.onderhoudPlan({ bouwjaar: 2016, brandstof: 'diesel', km: 150000, nu: NU });
  toets('diesel: geen bougies', !regel(d, 'bougies').id);
  toets('oude diesel zonder factuur: riem is "nagaan", geen "nu"', regel(d, 'distributie').staat === 'nagaan', regel(d, 'distributie').staat);
  const k = K.onderhoudPlan({ bouwjaar: 2016, brandstof: 'benzine', km: 150000, distributie: 'ketting', nu: NU });
  toets('ketting: geen vervangmoment', regel(k, 'distributie').wat === 'Distributieketting' && regel(k, 'distributie').staat === 'ok');
  const z = K.onderhoudPlan({ nu: NU });
  toets('zonder gegevens: zegt wat er ontbreekt', z.tekort.length === 2 && z.regels.every(x => x.staat === 'onbekend'), JSON.stringify(z.tekort));
  const g = K.onderhoudPlan({ bouwjaar: 2022, brandstof: 'benzine', km: 40000, volgendeDatum: new Date(NU - 5 * dag).toISOString().slice(0, 10), nu: NU });
  toets('een ingevulde volgende beurt die voorbij is → nu', regel(g, 'gepland').staat === 'nu', JSON.stringify(regel(g, 'gepland')));
}

console.log('\n3. Lange rit');
{
  const l = K.langeRit({ apkDagen: -3, recallOpen: true, winter: { banden_mm: 2.5, banden_dot: '1218' }, bandenJaren: 8.6, trekgewicht: 1500 });
  toets('APK verlopen → rood, bovenaan', l[0].ernst === 'rood' && /APK/.test(l[0].tekst));
  toets('profiel onder 3 mm → rood', l.some(x => x.ernst === 'rood' && /2,5 mm/.test(x.tekst)));
  toets('banden ouder dan zes jaar → oranje', l.some(x => x.ernst === 'oranje' && /8 jaar/.test(x.tekst)));
  toets('terugroepactie → oranje', l.some(x => /terugroepactie/.test(x.tekst)));
  toets('trekgewicht uit het RDW', l.some(x => /1\.500 kg/.test(x.tekst)));
  const ok = K.langeRit({ apkDagen: 200, recallOpen: false, winter: { banden_mm: 6 }, bandenJaren: 2 });
  toets('TEGENPROEF: alles in orde → alleen de vaste lijst', ok.every(x => x.ernst === 'info'), JSON.stringify(ok.filter(x => x.ernst !== 'info')));
}

console.log('\n4. Verbruik');
{
  const u = K.verbruik({ volleTank: [{ km: 600, liters: 39, l100: 6.5 }, { km: 400, liters: 30, l100: 7.5 }], typekeuring: 5.5 });
  toets('gewogen over de km, niet het gemiddelde van de cycli', u.echt === 6.9, String(u.echt));
  toets('verschil met de typekeuring in procenten', u.verschilPct === 25 && /25 % boven/.test(u.tekst), u.tekst);
  const leeg = K.verbruik({ volleTank: [], typekeuring: 5.5 });
  toets('zonder volle tanks: geen getal, wel wat je moet doen', leeg.echt === null && /twee keer/.test(leeg.tekst));
}

console.log('\n5. Welke uitkomst bij welke module');
toets('markt → papieren', K.soortVoor('markt') === 'papieren');
toets('Beginnen bij kopen → papieren', K.soortVoor(null, { doel: 'handel' }) === 'papieren');
toets('onderhoud → onderhoud', K.soortVoor('onderhoud') === 'onderhoud');
toets('klimaat in de winter → winter, in de zomer niets', K.soortVoor('klimaat', { voorb: 'winter' }) === 'winter' && K.soortVoor('klimaat', { voorb: 'airco' }) === null);
toets('"Wat verbruikt hij écht" zonder module → verbruik', K.soortVoor(null, { doel: 'verbruik', vraag: 'werkelijk' }) === 'verbruik');
toets('Er is iets mis → de klachtenwijzer, ook vanuit de AI-monteur', K.soortVoor(null, { doel: 'storing' }) === 'klacht' && K.soortVoor('aimonteur', { doel: 'storing' }) === 'klacht');
toets('TEGENPROEF: de sensorcontrole heeft geen uitkomst zonder adapter', K.soortVoor('systeem') === null);

console.log('\n6. Elke kaart onder Alle functies heeft een besluit');
{
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const kaarten = [...new Set((html.match(/id="wc-[a-z0-9-]+"/g) || []).map(x => x.slice(4, -1)))];
  const VRIJ = { 'wc-liveexpert': 'je kijkt mee bij een ander', 'wc-deepdiag': 'begint met een vragenlijst' };
  const zonder = kaarten.filter(id => !(id in K.KAART) && !VRIJ[id]);
  toets('elke wc-kaart staat in KAART of is vrijgesteld (' + kaarten.length + ' kaarten)', kaarten.length > 15 && zonder.length === 0, zonder.join(', '));
  const weg = Object.keys(K.KAART).filter(id => kaarten.indexOf(id) < 0);
  toets('KAART noemt geen kaart die niet meer bestaat', weg.length === 0, weg.join(', '));
  const soorten = Object.keys(K.KAART).map(k => K.KAART[k]).filter(Boolean);
  toets('elke uitkomst in KAART heeft een titel', soorten.every(x => s.PLZonderUit.TITEL[x]), soorten.filter(x => !s.PLZonderUit.TITEL[x]).join(','));
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FOUT' : 'Alle ' + n + ' toetsen ok'));
process.exit(fout ? 1 : 0);
