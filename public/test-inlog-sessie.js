// ══════════════════════════════════════════════════════════════════
// test-inlog-sessie.js — wie komt binnen, en wat blijft er achter?
// ──────────────────────────────────────────────────────────────────
// TWEE FOUTEN UIT ISSUE #24, ALLEBEI ROND DE SESSIE.
//
// 1. INLOGGEN. doLogin() probeert bij een @ in de gebruikersnaam eerst de
//    klantroute (tabel Klanten). Tot 28-08 deed een AFGEWEZEN klantlogin
//    `return`, waardoor de Users-route onbereikbaar was voor iedereen met een
//    e-mailadres als gebruikersnaam. Een medewerker kwam er dus niet in — en
//    dat is net de vorm die je bij een testronde uitdeelt. Alleen een
//    uitzondering (server onbereikbaar) viel door; een nette afwijzing niet.
//
// 2. UITLOGGEN. logout() wiste pl_session en pl_autoconn, maar niet de drie
//    pl_credits_*-sleutels. Op een gedeeld werkplaatstoestel zag de volgende
//    gebruiker het saldo van de vorige.
//
// WAAROM DIT EEN GEDRAGSTEST IS EN GEEN BRONCONTROLE
// Bij allebei is de fout een ontbrekende weg, niet een verkeerde regel. Je
// ziet hem alleen door de functie echt te draaien en te kijken waar hij
// uitkomt. "Staat er een return" zegt niets — die return hoort er bij een
// blokkade juist wél te zijn.
//
// Draaien vanuit public/:  node test-inlog-sessie.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── doLogin() uit zijn bestand knippen ────────────────────────────
// Hij hangt aan een halve app (serverLogin, finishLogin, USERS, het DOM).
// Die worden hieronder als parameters meegegeven, zodat de functie zelf
// onveranderd draait en we kunnen zien welke route hij kiest.
const bron = fs.readFileSync(__dirname + '/pidlane-auth.js', 'utf8');
const van = bron.indexOf('async function doLogin(){');
const tot = bron.indexOf('\n}', bron.indexOf('// ── STAP 2: lokale fallback'));
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: doLogin() niet gevonden in pidlane-auth.js.');
  process.exit(1);
}
const doLoginSrc = bron.slice(van, tot + 2);

// Eén proef opzetten: welke routes bestaan er, en wat doen ze.
// klantAntwoord: het resultaat van PLKlant.login (null = afgewezen, object = ok,
//                Error = uitzondering, bv. server onbereikbaar of geblokkeerd)
// serverAntwoord: idem voor serverLogin (null = afgewezen)
function proef(gebruiker, klantAntwoord, serverAntwoord) {
  const gezien = { klant: 0, server: 0, klaar: null, melding: null, logs: [] };
  const veld = { loginUser: { value: gebruiker }, loginPass: { value: 'geheim', focus() {} },
                 loginErr: {} };

  // doLogin() toetst op window.PLKlant maar roept PLKlant bare aan. In de
  // browser is dat hetzelfde; hier niet, dus staat hij er twee keer in.
  const PLKlant = {
    login: async function () {
      gezien.klant++;
      if (klantAntwoord instanceof Error) throw klantAntwoord;
      return klantAntwoord;
    },
    neemSessie: function () { gezien.klaar = 'klant'; }
  };

  const omgeving = {
    document: { getElementById: id => veld[id] || null },
    window: { PLKlant: PLKlant },
    PLKlant: PLKlant,
    plLoginMeld: function (el, tekst) { if (tekst) gezien.melding = tekst; },
    serverLogin: async function () {
      gezien.server++;
      if (serverAntwoord instanceof Error) throw serverAntwoord;
      return serverAntwoord;
    },
    tokSave: function () {},
    finishLogin: function () { gezien.klaar = 'users'; },
    log: function (m, t) { gezien.logs.push(t + ': ' + m); },
    USERS: {},                       // leeg: de lokale fallback vindt niets
    currentUser: null
  };

  const maak = new Function(...Object.keys(omgeving), doLoginSrc + '\nreturn doLogin;');
  const fn = maak(...Object.values(omgeving));
  return fn().then(() => gezien);
}

// ── 1. de fout uit #24 ────────────────────────────────────────────
console.log('\n1. Medewerker met een e-mailadres als gebruikersnaam');
const deel1 = proef('nico@pidlane.nl', null, { user: 'nico@pidlane.nl', role: 'user', exp: 0 })
  .then(function (g) {
    toets('de klantroute is geprobeerd', g.klant === 1);
    toets('en daarna is de Users-route óók geprobeerd', g.server === 1,
          'serverLogin ' + g.server + '× aangeroepen — bij de oude code 0×, want een ' +
          'afgewezen klantlogin deed return');
    toets('de gebruiker is binnen via Users', g.klaar === 'users', 'kwam uit op: ' + g.klaar);
    toets('geen misleidende foutmelding onderweg', g.melding === null || !/onjuist/.test(g.melding),
          'melding: ' + g.melding);
  });

// ── 2. een echte klant gaat nog steeds langs de klantroute ────────
const deel2 = deel1.then(() => {
  console.log('\n2. Een echte klant komt nog gewoon binnen (niets kapot gemaakt)');
  return proef('klant@voorbeeld.nl', { id: 'k1' }, null).then(function (g) {
    toets('binnen via de klantroute', g.klaar === 'klant');
    toets('de Users-route is niet eens geprobeerd', g.server === 0,
          'die mag pas draaien als de klantroute afwijst');
  });
});

// ── 3. een blokkade moet WEL hard stoppen ─────────────────────────
// Dit is de helft die niet mag meeveranderen: doorlopen naar Users zou het
// slot omzeilen dat de klantroute net dichtdeed.
const deel3 = deel2.then(() => {
  console.log('\n3. Tegenproef: een geblokkeerd account mag niet doorvallen');
  const blok = new Error('Te veel pogingen — account geblokkeerd');
  return proef('klant@voorbeeld.nl', blok, { user: 'x', role: 'user', exp: 0 }).then(function (g) {
    toets('de Users-route is NIET geprobeerd', g.server === 0,
          'serverLogin draaide ' + g.server + '× — dan omzeilt een blokkade zichzelf');
    toets('niemand is binnen', g.klaar === null, 'kwam uit op: ' + g.klaar);
    toets('de blokkade is gemeld', /geblokkeerd|Te veel/i.test(g.melding || ''), 'melding: ' + g.melding);
  });
});

// ── 4. gebruikersnaam zonder @ blijft ongemoeid ───────────────────
const deel4 = deel3.then(() => {
  console.log('\n4. Zonder @ verandert er niets aan de weg');
  return proef('nico', null, { user: 'nico', role: 'admin', exp: 0 }).then(function (g) {
    toets('de klantroute is overgeslagen', g.klant === 0);
    toets('binnen via Users', g.klaar === 'users');
  });
});

// ── 5. beide routes wijzen af → melding past bij het scherm ───────
const deel5 = deel4.then(() => {
  console.log('\n5. Beide routes wijzen af');
  return proef('klant@voorbeeld.nl', null, null).then(function (g) {
    toets('beide routes zijn geprobeerd', g.klant === 1 && g.server === 1);
    toets('niemand is binnen', g.klaar === null);
    toets('de melding spreekt over een e-mailadres', /mailadres/i.test(g.melding || ''),
          'melding: ' + g.melding);
  });
});

// ── 6. uitloggen wist het tegoed van de vorige gebruiker ──────────
// PLCredits.vergeetKlant() draaien met een nagemaakte localStorage. De
// sleutelnamen komen uit CFG, niet uit deze test — zou iemand ze hernoemen
// zonder vergeetKlant() bij te werken, dan valt dat hier om.
const deel6 = deel5.then(() => {
  console.log('\n6. Uitloggen laat geen saldo van de vorige gebruiker achter');
  const opslag = {};
  global.localStorage = {
    getItem: k => (k in opslag ? opslag[k] : null),
    setItem: (k, v) => { opslag[k] = String(v); },
    removeItem: k => { delete opslag[k]; }
  };
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  global.document = { readyState: 'complete', getElementById: () => null,
                      addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }),
                      body: { appendChild() {} }, querySelector: () => null };
  global.window = global.window || {};
  global.fetch = () => Promise.reject(new Error('geen net in de test'));

  eval(fs.readFileSync(__dirname + '/pidlane-credits.js', 'utf8'));
  const PLC = global.window.PLCredits;

  toets('PLCredits.vergeetKlant() bestaat', typeof PLC.vergeetKlant === 'function');
  if (typeof PLC.vergeetKlant !== 'function') return;

  // Een ingelogde klant laat een saldo achter, plus de kalibratie van het model.
  PLC.zetServerSaldo(250);
  opslag[PLC.CFG.lsKalib] = '{"tpt":3.2,"uf":1,"n":9}';
  toets('er staat saldo vóór het uitloggen', PLC.saldo() === 250, 'saldo: ' + PLC.saldo());

  PLC.vergeetKlant();

  toets('het saldo van de vorige gebruiker is weg', PLC.saldo() !== 250,
        'saldo() geeft nog ' + PLC.saldo() + ' — het werkgeheugen is niet gewist');

  // DE TEGENPROEF, en dit is het hele punt van deze test. Hij stond hier
  // omgekeerd tot 29-08-2026: toen eiste hij dat de sleutel op '0' bleef
  // staan, omdat saldo() bij een ONTBREKENDE sleutel 25 gratis tokens
  // uitdeelde en uitloggen daarmee een gelduitgifteknop werd. Sinds #49 deelt
  // de client helemaal geen tegoed meer uit, en is een ontbrekende sleutel de
  // juiste manier om "we weten het niet" op te schrijven. De eis draait dus
  // mee: weg is goed, '0' is een bewering over iemand die we niet kennen.
  toets('er is GEEN nieuw proeftegoed uitgedeeld', PLC.saldo() === 0,
        'saldo() geeft ' + PLC.saldo() + ' — de client deelt weer tegoed uit');
  toets('de saldosleutel is weg', opslag[PLC.CFG.lsSaldo] === undefined,
        'opslag: ' + JSON.stringify(opslag[PLC.CFG.lsSaldo]));
  toets('en het saldo geldt daarna als onbekend, niet als nul',
        PLC.saldoBekend() === false,
        'saldoBekend() geeft ' + PLC.saldoBekend() + ' — dan blokkeert preflight op een verzonnen nul');
  toets('de modelkalibratie blijft staan (die is niet van de klant)',
        opslag[PLC.CFG.lsKalib] !== undefined);
});

deel6.then(function () {
  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
}).catch(function (e) {
  console.log('  FOUT test brak af — ' + (e && e.stack || e));
  process.exit(1);
});
