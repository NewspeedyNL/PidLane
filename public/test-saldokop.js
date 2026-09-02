// ══════════════════════════════════════════════════════════════════
// test-saldokop.js — de teller volgt de server, niet de schatting
// ──────────────────────────────────────────────────────────────────
// WAT ER MIS WAS (02-09-2026). De Worker boekt af op het ECHTE verbruik uit
// `usage` en stuurt het saldo daarna mee terug in de header X-PidLane-Saldo.
// Die header staat zelfs in Access-Control-Expose-Headers, en §8 van
// PIDLANE.md beschreef al dat apiFetch hem uitleest en doorzet naar PLCredits.
// Dat deed niemand: er stond nergens in public/ een regel die die header las.
//
// De teller in beeld liep dus op de schatting van boek(), en die is nooit
// precies gelijk aan de afboeking. Drie manieren waarop de twee uiteenlopen,
// en alle drie in het nadeel van het vertrouwen:
//   - was het antwoord van Anthropic niet te ontleden, dan boekte de Worker
//     het minimumtarief af en de app een volle schatting;
//   - mislukte de PATCH op Airtable, dan ging er niets af terwijl de app wel
//     aftrok — de klant zag tokens verdwijnen die hij nog had;
//   - staan de CREDIT_PER_1K_*-variabelen in de Worker anders dan CFG in de
//     app, dan lopen de formules per definitie uiteen.
//
// Twee bronnen voor één getal, en de verkeerde was leidend. volgServer() maakt
// de server weer de bron. Deze test meet dat de schatting het altijd verliest
// van een getal dat de server meestuurt — en dat er niets gebeurt als er geen
// getal is, want fail-open is de regel van deze module.
//
// Draaien vanuit public/:  node test-saldokop.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

function laad() {
  const opslag = {};
  global.localStorage = {
    getItem: (k) => (k in opslag ? opslag[k] : null),
    setItem: (k, v) => { opslag[k] = String(v); },
    removeItem: (k) => { delete opslag[k]; }
  };
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const knop = () => ({ onclick: null, style: {}, checked: false });
  global.document = {
    readyState: 'complete',
    getElementById: () => null,
    addEventListener() {},
    createElement: () => ({ id: '', className: '', innerHTML: '', style: {}, appendChild() {}, querySelector: knop, onclick: null }),
    body: { appendChild() {} },
    querySelector: knop
  };
  global.window = { currentUser: { name: 'klant@voorbeeld.nl', role: 'klant' } };
  global.fetch = () => Promise.reject(new Error('geen net in de test'));
  eval(fs.readFileSync(__dirname + '/pidlane-credits.js', 'utf8'));
  return { PLC: global.window.PLCredits, opslag: opslag };
}

// Een antwoord van de Worker zoals fetch() het teruggeeft: alleen de kant die
// deze module aanraakt, dus headers.get().
function kop(waarde) {
  return { get: (n) => (String(n).toLowerCase() === 'x-pidlane-saldo' && waarde !== undefined ? waarde : null) };
}

console.log('1. De header zet het saldo, ook als de app iets anders dacht');
{
  const { PLC, opslag } = laad();
  PLC.zetServerSaldo(100);
  PLC.volgServer(kop('87'), {});
  toets('het saldo is dat van de server', PLC.saldo() === 87, 'saldo() geeft ' + PLC.saldo());
  toets('en het afschrift in de opslag ook', opslag[PLC.CFG.lsSaldo] === '87',
        'opslag: ' + JSON.stringify(opslag[PLC.CFG.lsSaldo]));
}

console.log('\n2. De schatting verliest het van de server — ook als die hoger uitkomt');
{
  // De echte volgorde in apiFetch: eerst boek() met de schatting, dan
  // volgServer() met het getal van de server. Dit is het geval "de PATCH op
  // Airtable mislukte": er ging niets af, en de app had al 12 afgetrokken.
  const { PLC } = laad();
  PLC.zetServerSaldo(200);
  const res = { credits: 12, tekensIn: 4000, maxTokens: 2048, model: 'claude-sonnet-5', geboekt: false };
  PLC.boek(res, { input_tokens: 3000, output_tokens: 1200 });
  const naSchatting = PLC.saldo();
  toets('de schatting haalt er iets af', naSchatting < 200, 'saldo() geeft ' + naSchatting);
  PLC.volgServer(kop('200'), {});
  toets('de server zet het terug op 200', PLC.saldo() === 200,
        'saldo() geeft ' + PLC.saldo() + ' — de schatting is leidend gebleven');
}

console.log('\n3. Een weigering draagt het saldo in de body (402 onvoldoende_tegoed)');
{
  const { PLC } = laad();
  PLC.zetServerSaldo(50);
  PLC.volgServer(kop(undefined), { ok: false, code: 'onvoldoende_tegoed', saldo: 0, error: { message: 'op' } });
  toets('het saldo staat op nul', PLC.saldo() === 0, 'saldo() geeft ' + PLC.saldo());
  toets('en geldt als bekend, niet als onbekend', PLC.saldoBekend() === true,
        'dan zou preflight de volgende analyse gewoon doorlaten');
}

console.log('\n4. Geen getal, geen wijziging — fail-open');
{
  const { PLC } = laad();
  PLC.zetServerSaldo(64);
  PLC.volgServer(kop(undefined), {});
  toets('zonder header en zonder saldo blijft 64 staan', PLC.saldo() === 64, 'saldo() geeft ' + PLC.saldo());
  PLC.volgServer(kop(''), {});
  toets('een lege header telt niet als nul', PLC.saldo() === 64, 'saldo() geeft ' + PLC.saldo());
  PLC.volgServer(kop('onzin'), {});
  toets('onleesbare inhoud verandert niets', PLC.saldo() === 64, 'saldo() geeft ' + PLC.saldo());
  PLC.volgServer(null, null);
  toets('en helemaal geen antwoord laat de module niet omvallen', PLC.saldo() === 64);
}

console.log('\n5. Een onbekend saldo wordt bekend zodra de server iets zegt');
{
  const { PLC } = laad();
  toets('vers toestel: saldo onbekend', PLC.saldoBekend() === false);
  PLC.volgServer(kop('9'), {});
  toets('na de header is het bekend', PLC.saldoBekend() === true && PLC.saldo() === 9,
        'saldo() geeft ' + PLC.saldo());
}

console.log('\n6. TEGENPROEF — de haak zit in apiFetch, niet alleen in deze module');
{
  // volgServer() kan nog zo goed werken; wordt hij niet aangeroepen, dan is er
  // niets veranderd. Dat is precies de toestand van vóór 02-09-2026: de header
  // bestond, de expose-header stond in de CORS-kop, PIDLANE.md beschreef het,
  // en er las niemand. Deze toets is de enige in dit bestand die de bron leest,
  // want de aanroepplek zelf is in node niet te draaien: apiFetch hangt aan de
  // hele app. De reden staat er dus bij, zoals de regel in CLAUDE.md vraagt.
  const fuel = fs.readFileSync(__dirname + '/pidlane-fuel.js', 'utf8');
  // Let op de schrijfwijze: de aanroepen staan er als `PLCredits?.volgServer?.(`
  // — een gewone /volgServer\s*\(/ mist die, en dan is deze toets groen terwijl
  // er niets wordt aangeroepen. Daarom tellen we de naam zelf.
  const raak = (fuel.match(/volgServer/g) || []).length;
  toets('apiFetch roept volgServer aan', raak >= 1, 'gevonden: ' + raak + ' aanroep(en)');
  toets('op beide paden — geslaagd antwoord én weigering', raak >= 2,
        'gevonden: ' + raak + ' aanroep(en); bij 402 blijft de teller anders te hoog staan');
  const worker = fs.readFileSync(__dirname + '/../worker.js', 'utf8');
  toets('en de Worker stuurt de header nog steeds mee', /X-PidLane-Saldo/.test(worker),
        'zonder die header valt er niets te volgen');
  toets('en zet hem in Access-Control-Expose-Headers', /Expose-Headers[^\n]*X-PidLane-Saldo/.test(worker),
        'zonder expose-header geeft headers.get() in de browser null terug, ook al staat hij op de lijn');
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
