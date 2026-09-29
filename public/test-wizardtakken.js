// ══════════════════════════════════════════════════════════════════
// test-wizardtakken.js — de tegels op het startscherm landen op een echte tak
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (29-09-2026)
// De vier "Ik wil…"-tegels openen PLWizard niet op de eerste vraag maar
// meteen op hun eigen tak (PLWizard.open('storing') enz.). Een tegel die naar
// een knooppunt wijst dat niet bestaat, toont een leeg scherm: toonVraag()
// valt dan door naar toonPlan() met een halve opdracht. Dat zie je pas als
// iemand er in de auto op tikt.
//
// Wat hier bewaakt wordt:
//   1. elke tak wijst naar een knooppunt dat bestaat;
//   2. elke keuze in de boom leidt ergens heen: een volgend knooppunt, het
//      plan (next:null), of een module die bestaat (direct);
//   3. de tegels in index.html en de takken hier zijn dezelfde set;
//   4. de tak "onderweg" start de rit-monitor en de caravancoach meteen, en
//      de verbruiksvragen lopen door naar de bestaande verbruikstak.
//
// Laadt de echte pidlane-wizard.js met vm; niets van de boom is nagebouwd.
// Draaien vanuit public/:  node test-wizardtakken.js   (exit 0 = goed)
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

const ctx = { window: {}, console: console };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/pidlane-wizard.js', 'utf8'), ctx, { filename: 'pidlane-wizard.js' });
const W = ctx.window.PLWizard;
if (!W || !W._boom || !W._takken) { console.log('FAAL PLWizard hangt zijn boom of takken niet meer naar buiten'); process.exit(1); }
const BOOM = W._boom, TAK = W._takken, MOD = W._modules;

console.log('\n1. Elke tak landt op een bestaand knooppunt');
Object.keys(TAK).forEach(function (t) {
  eis('tak ' + t + ' → ' + TAK[t].nu, !!BOOM[TAK[t].nu]);
});

console.log('\n2. Elke keuze leidt ergens heen');
let doodlopend = [];
Object.keys(BOOM).forEach(function (k) {
  const kn = BOOM[k];
  if (kn.type) { if (kn.next !== null && !BOOM[kn.next]) doodlopend.push(k + ' → ' + kn.next); return; }
  (kn.opt || []).forEach(function (o) {
    if (o.direct) { if (!MOD[o.direct]) doodlopend.push(k + ' / ' + o.t + ' → module ' + o.direct); }
    else if (o.next !== null && !BOOM[o.next]) doodlopend.push(k + ' / ' + o.t + ' → ' + o.next);
  });
});
eis('geen keuze wijst naar niets', doodlopend.length === 0, doodlopend.join('; '));

console.log('\n3. De tegels op het startscherm en de takken zijn dezelfde set');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const tegels = [];
html.replace(/PLNav\.tegel\('([a-z]+)'\)/g, function (_, t) { tegels.push(t); });
eis('er staan vier tegels', tegels.length === 4, tegels.join(','));
tegels.forEach(function (t) { eis('tegel ' + t + ' heeft een tak', !!TAK[t]); });

console.log('\n4. De tak onderweg');
const ow = BOOM.onderweg_wat.opt;
const direct = ow.filter(function (o) { return o.direct; }).map(function (o) { return o.direct; });
eis('rit-monitor en caravancoach starten meteen', direct.indexOf('monitor') > -1 && direct.indexOf('trekken') > -1, direct.join(','));
eis('de verbruiksvragen lopen door naar verbruik_nu', ow.filter(function (o) { return o.next === 'verbruik_nu'; }).length === 2);

console.log('\n5. Voorbereiden gaat niet meer over trekken');
eis('caravan staat onder Rit starten en niet ook onder Voorbereiden',
  BOOM.voorb_wat.opt.every(function (o) { return o.set.voorb !== 'caravan'; }));
eis('het plan voor een winterklaar-onderzoek bevat de klimaatcheck',
  W._plan({ doel: 'voorbereiding', voorb: 'winter', meting: 'stil' }).indexOf('klimaat') > -1);

console.log('\n6. Een functie die beheer uitzet, verdwijnt ook uit het plan');
{
  const uit = {};
  ctx.featOn = function (k) { return !uit[k]; };
  const job = { doel: 'storing', meting: 'monitor', lampje: 'soms' };
  eis('met alles aan staat de AI-monteur in het plan', W._plan(job).indexOf('aimonteur') > -1);
  uit.feat_ai_monteur = true;
  eis('feat_ai_monteur uit → de AI-monteur is weg  <- de schakelaar deed anders niets meer', W._plan(job).indexOf('aimonteur') < 0);
  eis('foutcodes blijven: daar hoort geen schakelaar bij', W._plan(job).indexOf('dtc') === 0);
  const bekend = ['feat_ai_monteur','feat_deepdiag','feat_pidrecorder','feat_conditiecheck','feat_basiccheck','feat_onderhoud',
    'feat_koopcheck','feat_verbruik','feat_monitor','feat_caravan','feat_langerit','feat_seizoen','feat_ev'];
  const fuel = fs.readFileSync(__dirname + '/pidlane-fuel.js', 'utf8');
  const onbekend = Object.keys(W._feat).map(function (k) { return W._feat[k]; })
    .filter(function (f) { return fuel.indexOf(f + ':') < 0; });
  eis('elke schakelaar die de wizard volgt bestaat in FEATURE_TOGGLES', onbekend.length === 0, onbekend.join(','));
  eis('en in de lijst die beheer.html toont', bekend.every(function (f) {
    return fs.readFileSync(__dirname + '/../admin/beheer.html', 'utf8').indexOf("'" + f + "'") > -1; }));
  delete ctx.featOn;
}

console.log('\n' + (fout ? fout + ' van ' + n + ' FAAL' : 'Alle ' + n + ' goed'));
process.exit(fout ? 1 : 0);
