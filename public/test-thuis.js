// ══════════════════════════════════════════════════════════════════
// test-thuis.js — de regels achter het startscherm (PLThuis, 06-11-2026)
// ──────────────────────────────────────────────────────────────────
// Het startscherm kiest zelf zijn hoofdknop, zijn chips, de ene kaart van
// "Voor jou nu" en de indeling die de klant bewaarde. Elk daarvan kan stil
// verkeerd gaan: een Check-knop zonder adapter, een "0 foutcodes" terwijl er
// nooit gelezen is, de winter boven een verlopen APK, of een bewaarde
// indeling die een blok kwijtraakt.
//
// Laadt de echte pidlane-thuis.js (geen kopie van de logica).
// Draaien vanuit public/:  node test-thuis.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function eis(wat, waar, uitleg) {
  n++;
  if (waar) console.log('  ok    ' + wat);
  else { fout++; console.log('  FAAL  ' + wat + (uitleg ? ' — ' + uitleg : '')); }
}

const ctx = { window: {}, console: console, document: { readyState: 'loading', addEventListener: function () {} } };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-thuis.js', 'utf8'), ctx, { filename: 'pidlane-thuis.js' });
const T = ctx.window.PLThuis;
if (!T || !T._kern) { console.log('FAAL PLThuis hangt zijn kern niet meer naar buiten'); process.exit(1); }
const K = T._kern;
const J = x => JSON.stringify(x);

console.log('\n1. Toestand en hoofdknop');
eis('niet verbonden → verbinden', K.hoofdknop(K.toestand({ verbonden: false })) === 'verbind');
eis('verbonden, nog geen check vandaag → Check mijn auto', K.hoofdknop(K.toestand({ verbonden: true, checkVandaag: false })) === 'check');
eis('verbonden en vandaag al gecheckt → Naar Live', K.hoofdknop(K.toestand({ verbonden: true, checkVandaag: true })) === 'live');
eis('demo gaat voor: ook "verbonden" wordt demo, met de check', K.toestand({ demo: true, verbonden: true, checkVandaag: true }) === 'demo' && K.hoofdknop('demo') === 'check');
eis('zonder adapter geen knop "Laat meekijken" (meekijken heeft een verbinding nodig)', !J(K.miniKnoppen('geen')).includes('expert'));
eis('verbonden wél "Laat meekijken"', J(K.miniKnoppen('verbonden')).includes("PLNav.expert('deel')"));
eis('in de demo een knop om de simulatie te stoppen', J(K.miniKnoppen('demo')).includes('PLZonder.stopDemo()'));

console.log('\n2. Chips');
let c = K.chips({ verbonden: true, pidVals: {} });
eis('verbonden zonder uitlezing: foutcodes "—", niet 0', c[0].w === '—' && c[0].n === 'stil', J(c[0]));
c = K.chips({ verbonden: true, foutcodes: 0, pidVals: { '0142': 14.2, '0105': 88 } });
eis('verbonden: 0 foutcodes, 14,2 V en 88° zijn groen', c.map(x => x.w).join('|') === '0|14,2 V|88°' && c.every(x => x.n === 'ok'), J(c));
c = K.chips({ verbonden: true, foutcodes: 2, pidVals: { '0142': 11.6, '0105': 45 } });
eis('2 foutcodes rood, 11,6 V en 45° (koud) aandacht', c[0].n === 'rood' && c[0].l === 'foutcodes' && c[1].n === 'let' && c[2].n === 'let', J(c));
eis('koelwater 0 °C is een waarde, geen ontbrekende meting', K.chips({ verbonden: true, pidVals: { '0105': 0 } })[2].w === '0°');
eis('spanning 0 V is geen meting (adapter zonder 0142)', K.chips({ verbonden: true, pidVals: { '0142': 0 } })[1].w === '—');
c = K.chips({ verbonden: false, open: 1, apkDagen: 12, gezienDagen: 3 });
eis('niet verbonden: open punt, APK over 12 d (aandacht), 3 d geleden', c.map(x => x.w).join('|') === '1|12 d|3 d' && c[1].n === 'let', J(c));
eis('APK verlopen is rood', K.chips({ apkDagen: -2 })[1].n === 'rood');
eis('ring: rood wint van aandacht', K.ringKleur([{ n: 'ok' }, { n: 'let' }, { n: 'rood' }]) === 'rood');
eis('ring zonder gegevens blijft stil, niet groen', K.ringKleur([{ n: 'stil' }, { n: 'stil' }]) === 'stil');

console.log('\n3. Voor jou nu: één kaart, de urgentste eerst');
let k = K.kandidaten({ punten: [{ ernst: 'info', tekst: 'Nog nooit uitgelezen' }, { ernst: 'oranje', tekst: 'APK verloopt over 12 dagen' }, { ernst: 'rood', tekst: 'Motorlampje brandt' }], winter: true });
eis('rood › oranje › winter; "nooit uitgelezen" staat al als chip', J(k.map(x => x.titel || x.id)) === J(['Motorlampje brandt', 'APK verloopt over 12 dagen', 'winter']), J(k.map(x => x.titel || x.id)));
k = K.kandidaten({ punten: [{ ernst: 'info', tekst: '2 zelftests nog niet klaar' }], winter: true, herinner: { aan: false } });
eis('winter boven een info-punt, herinnering onderaan', J(k.map(x => x.id)) === J(['winter', 'punt0', 'herinner']), J(k.map(x => x.id)));
eis('herinnering die al aan staat: geen kaart', !K.kandidaten({ herinner: { aan: true } }).length);
k = K.kandidaten({ verbonden: true, pidVals: { '0105': 41 } });
eis('verbonden met koude motor: een kaart "Motor nog koud"', k.length === 1 && /koud/.test(k[0].titel), J(k));
eis('de koude motor van nu gaat voor het winteradvies, een open punt niet', J(K.kandidaten({ verbonden: true, pidVals: { '0105': 41 }, winter: true, punten: [{ ernst: 'oranje', tekst: 'APK' }] }).map(x => x.id)) === J(['punt0', 'koud', 'winter']));
eis('niet verbonden: geen koude-motorkaart uit een oude meting', !K.kandidaten({ verbonden: false, pidVals: { '0105': 41 } }).length);
k = K.kandidaten({ punten: [{ ernst: 'oranje', tekst: 'A' }, { ernst: 'oranje', tekst: 'B' }] });
eis('gelijke urgentie houdt de volgorde van de bron', k[0].titel === 'A' && k[1].titel === 'B');

console.log('\n4. Indeling: bewaren en terugladen');
let ind = K.indeling(null, 'bestuurder');
eis('zonder lijst: Bestuurder — Voor jou nu en Snel naar aan, de rest uit', J(ind.blokken) === J([{ id: 'nu', aan: true }, { id: 'snel', aan: true }, { id: 'fav', aan: false }, { id: 'alle', aan: false }]), J(ind.blokken));
eis('Snel naar in de volgorde van de klikdata (storing 94 › onderweg 43 › handel 30 › voorbereiding 24)', J(ind.snel) === J(['storing', 'onderweg', 'handel', 'voorbereiding']));
eis('de garagemodus begint bij Garage, met Alle functies aan', K.indeling(null, 'garage').blokken.some(b => b.id === 'alle' && b.aan));
const terug = K.indeling(K.naarLijst(ind), 'garage');
eis('heen en terug: dezelfde indeling, ook als de standaard nu Garage is', J(terug) === J(ind), J(terug));
ind = K.indeling(['b:snel', '-b:nu', 's:live', 's:onbekend', 's:live', 'x:fout'], 'bestuurder');
eis('onbekend doel en dubbel vallen weg, rommel telt niet', J(ind.snel) === J(['live']), J(ind.snel));
eis('een ontbrekend blok komt achteraan, uit (niets raakt zoek)', J(ind.blokken.map(b => b.id)) === J(['snel', 'nu', 'fav', 'alle']) && !ind.blokken[2].aan, J(ind.blokken));
const leeg = K.indeling(null, 'bestuurder'); leeg.snel = [];
eis('alle snel-doelen uitgezet blijft na herladen leeg, en wordt niet de standaard', J(K.indeling(K.naarLijst(leeg), 'bestuurder').snel) === J([]), J(K.naarLijst(leeg)));
eis('zonder enige s:-regel (oude lijst): de standaard', J(K.indeling(['b:nu', 'b:snel'], 'bestuurder').snel) === J(['storing', 'onderweg', 'handel', 'voorbereiding']));
eis('hoogstens ' + K.SNEL_MAX + ' doelen', K.indeling(Object.keys(K.SNEL).map(s => 's:' + s), 'bestuurder').snel.length === K.SNEL_MAX);
eis('elke sleutel van naarLijst past op het patroon (en dus door de Worker)', K.naarLijst(K.indeling(null, 'kenner')).every(x => K.PATROON.test(x)));
eis('verschuif: één plek omhoog, en niet voorbij de rand', J(K.verschuif(['a', 'b', 'c'], 1, -1)) === J(['b', 'a', 'c']) && J(K.verschuif(['a', 'b'], 0, -1)) === J(['a', 'b']));

console.log('\n5. Dezelfde sleutel in app en Worker');
const vk = fs.readFileSync(__dirname + '/pidlane-voorkeur.js', 'utf8'), wk = fs.readFileSync(__dirname + '/../worker.js', 'utf8');
const pat = String(K.PATROON).replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
eis('VOORKEUR_SPEC kent thuis met hetzelfde patroon', new RegExp("thuis: \\{ soort: 'lijst', patroon: " + pat).test(vk));
eis('KP_VOORKEUR in de Worker ook', new RegExp('thuis: \\{ soort: "lijst", patroon: ' + pat).test(wk));

console.log('\n' + (fout ? fout + ' van ' + n + ' FAAL' : 'Alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
