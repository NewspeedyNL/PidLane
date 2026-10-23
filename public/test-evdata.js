// test-evdata.js — PLEv: de accu van een elektrische auto (23-10-2026)
//
// Laadt de echte pidlane-evdata.js (met de data van open-ev-data). De
// RDW-records hieronder zijn echt (m9d7-ebf2 en 8ys7-d773, 23-10-2026); alleen
// de kentekens zijn verzonnen. Over een steekproef van 301 echte EV's vond
// PLEv 89% van de modellen en bij 87% de exacte accu.
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}
const BRON = fs.readFileSync(__dirname + '/pidlane-evdata.js', 'utf8');
function laad(b) { const c = {}; c.window = c; vm.createContext(c); vm.runInContext(b, c); return c.PLEv; }
const E = laad(BRON);
const RDW = [ { "rij": { "kenteken": "EV-001-X", "merk": "OPEL", "handelsbenaming": "ASTRA SPORTS TOURER", "datum_eerste_toelating": "20250210" }, "bs": [ { "brandstof_omschrijving": "Elektriciteit", "elektrisch_verbruik_enkel_elektrisch_wltp": "150.00", "actie_radius_enkel_elektrisch_wltp": "412" } ] }, { "rij": { "kenteken": "EV-002-X", "merk": "AUDI", "handelsbenaming": "Q4 45 E-TRON", "datum_eerste_toelating": "20250207" }, "bs": [ { "brandstof_omschrijving": "Elektriciteit", "elektrisch_verbruik_enkel_elektrisch_wltp": "175.00", "actie_radius_enkel_elektrisch_wltp": "504" } ] }, { "rij": { "kenteken": "EV-003-X", "merk": "POLESTAR", "handelsbenaming": "POLESTAR 2", "datum_eerste_toelating": "20250213" }, "bs": [ { "brandstof_omschrijving": "Elektriciteit", "elektrisch_verbruik_enkel_elektrisch_wltp": "151.00", "actie_radius_enkel_elektrisch_wltp": "548" } ] }, { "rij": { "kenteken": "EV-004-X", "merk": "RENAULT", "handelsbenaming": "RENAULT 5 E-TECH ELECTRIC", "datum_eerste_toelating": "20250206" }, "bs": [ { "brandstof_omschrijving": "Elektriciteit", "elektrisch_verbruik_enkel_elektrisch_wltp": "150.00", "actie_radius_enkel_elektrisch_wltp": "411" } ] }, { "rij": { "kenteken": "EV-005-X", "merk": "VOLKSWAGEN", "handelsbenaming": "ID.3 PRO 150 KW", "datum_eerste_toelating": "20260429" }, "bs": [ { "brandstof_omschrijving": "Elektriciteit", "elektrisch_verbruik_enkel_elektrisch_wltp": "156.00", "actie_radius_enkel_elektrisch_wltp": "426" } ] }, { "rij": { "kenteken": "EV-006-X", "merk": "KIA", "handelsbenaming": "NIRO", "datum_eerste_toelating": "20230718" }, "bs": [ { "brandstof_omschrijving": "Elektriciteit", "elektrisch_verbruik_enkel_elektrisch_wltp": "162.00", "actie_radius_enkel_elektrisch_wltp": "460" } ] } ];
const auto = (h) => RDW.find((x) => x.rij.handelsbenaming === h);

console.log('\n1. De bron');
toets('ruim 1200 uitvoeringen geladen', E.aantal() > 1200, String(E.aantal()));

console.log('\n2. Echte EV\'s uit het register: de accu gekozen op de WLTP-actieradius');
[['ID.3 PRO 150 KW', 'ID.3', 58], ['NIRO', 'Niro EV', 68.4], ['Q4 45 E-TRON', 'Q4 e-tron', 77], ['POLESTAR 2', '2', 75], ['RENAULT 5 E-TECH ELECTRIC', '5 E-Tech', null]].forEach(([h, model, kwh]) => {
  const x = auto(h), r = x && E.uitRdw(x.rij, x.bs);
  toets(h + ' → ' + model + (kwh ? ', ' + kwh + ' kWh' : ''), r && r.model === model && (kwh === null ? !!r.kwh : r.kwh === kwh) && r.wltpKm > 300, JSON.stringify(r));
});
const id3 = E.uitRdw(auto('ID.3 PRO 150 KW').rij, auto('ID.3 PRO 150 KW').bs);
toets('ID.3: gekozen op de actieradius, met de RDW-waarden erbij', id3.zeker === 'RDW-actieradius' && id3.wltpKm === 426 && id3.wltpWh === 156);
toets('bereik vol in de praktijk: kWh / verbruik', E.bereik(id3) === Math.round(58 / id3.verbruik * 100), String(E.bereik(id3)));
toets('bereik bij 40%', E.bereik(id3, 40) === Math.round(58 * 0.4 / id3.verbruik * 100));
toets('html noemt accu, WLTP en de bron met licentie', /58 kWh/.test(E.html(id3)) && /426 km/.test(E.html(id3)) && /Tijs Teulings, MIT/.test(E.html(id3)));
toets('AI-regel', /58 kWh bruikbaar/.test(E.naarPromptRegel(id3)), E.naarPromptRegel(id3));

console.log('\n3. Zonder RDW-actieradius: eerlijk over de keuze');
const zonder = E.zoek('VOLKSWAGEN', 'ID.3', 2021, null);
toets('ID.3 2021 zonder WLTP: geen gok, wel de opties', !zonder.kwh && zonder.kwhOpties.length >= 2 && /welke uitvoering/.test(E.html(zonder)), JSON.stringify(zonder));
toets('"ENYAQ 60" wordt gevonden', E.zoek('SKODA', 'ENYAQ 60', 2022, null) !== null);
toets('merkaliassen: Mercedes-Benz, Opel, Citroën', E.merkVan('MERCEDES-BENZ') === 'Mercedes' && E.merkVan('OPEL') === 'Opel / Vauxhall' && E.merkVan('CITROEN') === 'Citroën');

console.log('\n4. Wat geen EV is, of niet in de bron staat');
toets('benzine: null', E.uitRdw({ merk: 'VOLKSWAGEN', handelsbenaming: 'GOLF' }, [{ brandstof_omschrijving: 'Benzine' }]) === null);
toets('model na de bron (Opel Astra Sports Tourer Electric): null, geen verzinsel', E.uitRdw(auto('ASTRA SPORTS TOURER').rij, auto('ASTRA SPORTS TOURER').bs) === null);
toets('plug-in hybride wordt zo genoemd', (E.uitRdw({ merk: 'KIA', handelsbenaming: 'NIRO', datum_eerste_toelating: '20230101' }, [{ brandstof_omschrijving: 'Benzine' }, { brandstof_omschrijving: 'Elektriciteit' }]) || {}).hybride === true);

console.log('\n5. TEGENPROEF — zonder de WLTP-keuze');
const E2 = laad(BRON.replace("if (Math.abs(best - doelKwh) / doelKwh <= 0.15)", "if (false)"));
const r2 = E2.uitRdw(auto('NIRO').rij, auto('NIRO').bs);
toets('dan weet hij bij de Niro de accu niet meer zeker', !r2 || r2.zeker !== 'RDW-actieradius', JSON.stringify(r2));

console.log('\n' + (fout ? fout + ' van ' + n + ' fout' : 'Alles goed (' + n + ')'));
process.exit(fout ? 1 : 0);
