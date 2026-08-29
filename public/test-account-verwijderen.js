// ══════════════════════════════════════════════════════════════════
// test-account-verwijderen.js — de verwijderknop, en of de tekst hem dekt
// ──────────────────────────────────────────────────────────────────
// WAAROM (#41). privacy.html beloofde: "Gegevens bij je account verwijder je
// via Mijn account". Die knop bestond niet en er was geen /klant/verwijder in
// worker.js. Twee verklaringen die iets beloofden over persoonsgegevens wat de
// app niet kon. Google eist het bovendien voor elke app waarin je een account
// aanmaakt — in de app én op een publieke URL.
//
// DEZE TEST BEWAAKT DRIE DINGEN, en de derde is de reden dat hij bestaat.
//
//   1. TOEGANG. Een verwijderd account moet overal geweigerd worden, niet
//      alleen bij het inloggen. Tot 29-08-2026 stond `Status === "geblokkeerd"`
//      twee keer los in worker.js: in handleKlantLogin en in handleMessages.
//      Met een tweede afwijzende status erbij is dat de vorm waarin de tweede
//      plek wordt vergeten — en dan kan een verwijderd account met een lopend
//      sessietoken nog gewoon AI gebruiken.
//
//   2. OPRUIMEN. De cron mag alleen wissen wat de termijn voorbij is, en moet
//      een record zónder bruikbare datum MELDEN in plaats van hem stilzwijgend
//      te laten staan of juist te wissen. Allebei die fouten zijn onzichtbaar
//      in productie: de een laat persoonsgegevens staan terwijl de verklaring
//      zegt van niet, de ander gooit een account weg dat er nog hoorde te zijn.
//
//   3. DE BELOFTE DEKT DE LADING. De bewaartermijn staat één keer in code
//      (KLANT_BEWAARDAGEN in worker.js) en wordt op drie plekken aan de
//      gebruiker verteld: privacy.html, verwijderen.html en het scherm in
//      pidlane-klant.js. Zet iemand die termijn op 14 dagen en vergeet hij de
//      teksten, dan liegt de app tegen de gebruiker over zijn persoonsgegevens
//      zonder dat er iets stukgaat. Precies zoals test-toestemmingstekst.js de
//      claim "geanonimiseerd" bewaakt, bewaakt deze het getal.
//
// Draaien vanuit public/:  node test-account-verwijderen.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const wortel = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(wortel, 'worker.js'), 'utf8');

// ── De stukken uit worker.js knippen ──────────────────────────────
// Zelfde techniek als test-akkoord-heraccorderen.js en test-saldo-slot.js:
// worker.js is één groot bestand zonder exports, dus we snijden het blok eruit
// en voeren het los uit. __name() is de naamstempel die in een Cloudflare-
// stacktrace terechtkomt; hier is een lege stub genoeg.
function knip(vanaf, totEnMet, naam) {
  const van = src.indexOf(vanaf);
  const tot = src.indexOf(totEnMet);
  if (van < 0 || tot < 0 || tot < van) {
    console.error('FOUT: kon "' + naam + '" niet uit worker.js knippen.');
    console.error('      Gezocht vanaf: ' + vanaf.slice(0, 60));
    process.exit(1);
  }
  return src.slice(van, tot + totEnMet.length);
}

const blokToegang = knip(
  '// ── Verwijderen op verzoek: de bewaartermijn',
  '__name(klantToegangProbleem, "klantToegangProbleem");',
  'toegangsblok');

const blokOpruimen = knip(
  'async function klantWachtrijOpruimen(env, nu) {',
  '__name(klantWachtrijOpruimen, "klantWachtrijOpruimen");',
  'klantWachtrijOpruimen');

const PRELUDE = 'function __name(){}\n';

const M = new Function(
  'klantTabel', 'fetch', 'console',
  PRELUDE + blokToegang + '\n' + blokOpruimen + '\n' +
  'return { KLANT_BEWAARDAGEN, klantOpruimMoment, klantToegangProbleem, klantWachtrijOpruimen };'
);

// ══════════════════════════════════════════════════════════════════
console.log('1. Wie mag dit account nog gebruiken?');
{
  const { klantToegangProbleem } = M(null, null, console);

  toets('een actief account mag door', klantToegangProbleem({ Status: 'actief' }) === null);
  toets('een account zonder status telt als actief', klantToegangProbleem({}) === null);

  const g = klantToegangProbleem({ Status: 'geblokkeerd' });
  toets('een geblokkeerd account wordt geweigerd', !!g && g.status === 403,
        JSON.stringify(g));
  toets('en heeft code "geblokkeerd"', !!g && g.code === 'geblokkeerd');

  const v = klantToegangProbleem({ Status: 'verwijderd' });
  toets('een verwijderd account wordt geweigerd', !!v && v.status === 403,
        JSON.stringify(v));
  toets('en heeft een eigen code, niet die van geblokkeerd',
        !!v && v.code === 'verwijderd' && v.code !== g.code,
        JSON.stringify(v));
  toets('de melding zegt dat het op eigen verzoek was',
        !!v && /eigen verzoek/i.test(v.bericht), v && v.bericht);
}

// ══════════════════════════════════════════════════════════════════
// BEWUST BRONCONTROLE, met de reden erbij. Wat hier telt is niet wat
// handleKlantLogin en handleMessages dóén — dat hangt aan Airtable, aan een
// Durable Object en aan een echte Anthropic-call — maar DÁT ze allebei langs
// dezelfde beslisplek gaan. Dat is aan de bron te zien en in een test niet
// na te bootsen zonder de halve Worker op te tuigen. Zelfde afweging als bij
// test-selectielog.js.
console.log('\n2. Beide plekken vragen het aan dezelfde functie');
{
  const losseControles = src.split('\n')
    .map((t, i) => ({ nr: i + 1, t: t }))
    .filter((x) => /Status\s*===\s*"geblokkeerd"/.test(x.t) && !/^\s*(\/\/|\*)/.test(x.t));
  toets('er staat nergens meer een losse "geblokkeerd"-controle',
        losseControles.length === 0,
        losseControles.map((x) => 'regel ' + x.nr).join(', '));

  const aanroepen = (src.match(/klantToegangProbleem\(/g) || []).length;
  // Eén keer de declaratie, één keer de __name-stempel, plus twee aanroepen.
  toets('klantToegangProbleem wordt op twee plekken aangeroepen', aanroepen >= 4,
        'gevonden: ' + aanroepen);
  toets('handleKlantLogin gaat erlangs',
        /handleKlantLogin[\s\S]{0,4000}klantToegangProbleem\(/.test(src));
  toets('handleMessages gaat erlangs',
        /handleMessages[\s\S]{0,6000}klantToegangProbleem\(/.test(src));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. Wanneer mag een record definitief weg?');
{
  const { KLANT_BEWAARDAGEN, klantOpruimMoment } = M(null, null, console);
  toets('de bewaartermijn is 30 dagen', KLANT_BEWAARDAGEN === 30,
        'KLANT_BEWAARDAGEN = ' + KLANT_BEWAARDAGEN);

  const nu = new Date('2026-09-01T12:00:00.000Z');
  const weg = klantOpruimMoment({ Status: 'verwijderd', VerwijderdOp: nu.toISOString() });
  toets('de opruimdatum ligt precies de termijn later',
        !!weg && weg.getTime() === nu.getTime() + 30 * 864e5,
        weg && weg.toISOString());

  toets('een actief account heeft geen opruimdatum',
        klantOpruimMoment({ Status: 'actief', VerwijderdOp: nu.toISOString() }) === null);
  toets('gemarkeerd zonder datum geeft null, geen gok',
        klantOpruimMoment({ Status: 'verwijderd' }) === null);
  toets('een onleesbare datum geeft null, geen Invalid Date',
        klantOpruimMoment({ Status: 'verwijderd', VerwijderdOp: 'ooit' }) === null);
}

// ══════════════════════════════════════════════════════════════════
// De opruimronde met een nagebootste Airtable. De fetch-stub telt wat er
// gevraagd wordt, zodat we kunnen zien dat er niet méér gewist wordt dan mag.
function nepAirtable(records, opties) {
  const o = opties || {};
  const gewist = [];
  const fetch = async (url, init) => {
    if (init && init.method === 'DELETE') {
      if (o.deleteFaalt) return { ok: false, status: 500, text: async () => 'nee' };
      const ids = (String(url).split('records[]=').slice(1)).map((x) => decodeURIComponent(x.split('&')[0]));
      ids.forEach((id) => gewist.push(id));
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (o.lezenFaalt) return { ok: false, status: 502, text: async () => 'nee' };
    return { ok: true, status: 200, json: async () => ({ records: records }) };
  };
  return { fetch, gewist };
}

function rec(id, status, verwijderdOp) {
  return { id: id, fields: { Status: status, VerwijderdOp: verwijderdOp } };
}

const NU = new Date('2026-10-01T00:00:00.000Z');
const LANG_GELEDEN = new Date(NU.getTime() - 40 * 864e5).toISOString();  // termijn om
const NET_GELEDEN = new Date(NU.getTime() - 3 * 864e5).toISOString();    // nog binnen

const deel4 = (async function () {
  console.log('\n4. De opruimronde wist alleen wat rijp is');
  const nep = nepAirtable([
    rec('recAAAAAAAAAAAAAA', 'verwijderd', LANG_GELEDEN),
    rec('recBBBBBBBBBBBBBB', 'verwijderd', NET_GELEDEN),
    rec('recCCCCCCCCCCCCCC', 'verwijderd', '')
  ]);
  const { klantWachtrijOpruimen } = M(
    () => ({ base: 'appX', table: 'Klanten', hdr: {} }), nep.fetch, console);

  const uit = await klantWachtrijOpruimen({}, NU);

  toets('alle drie de gemarkeerde records zijn bekeken', uit.bekeken === 3, 'bekeken: ' + uit.bekeken);
  toets('het oude record is gewist', uit.verwijderd.indexOf('recAAAAAAAAAAAAAA') >= 0,
        JSON.stringify(uit.verwijderd));
  toets('het verse record staat er nog', uit.wacht.some((w) => w.id === 'recBBBBBBBBBBBBBB'),
        JSON.stringify(uit.wacht));

  // DE BELANGRIJKSTE REGEL VAN DEZE TEST. Een record met Status "verwijderd"
  // maar zonder bruikbare datum weten we niets van: hoe lang staat het er al?
  // Wissen mag niet (termijn niet aantoonbaar om) en stil laten staan mag ook
  // niet (dan blijft het er eeuwig, terwijl de verklaring zegt van niet).
  toets('een record zonder datum wordt NIET gewist',
        uit.verwijderd.indexOf('recCCCCCCCCCCCCCC') < 0,
        'het is toch gewist, zonder dat de termijn aantoonbaar om was');
  toets('en wordt gemeld als mislukt in plaats van te verdwijnen',
        uit.mislukt.some((m) => m.id === 'recCCCCCCCCCCCCCC'),
        JSON.stringify(uit.mislukt));

  toets('er is precies één record echt gewist', nep.gewist.length === 1,
        'gewist: ' + JSON.stringify(nep.gewist));
})();

const deel5 = deel4.then(async function () {
  console.log('\n5. Een mislukte wisactie wordt gemeld, niet weggeslikt');
  const nep = nepAirtable([rec('recAAAAAAAAAAAAAA', 'verwijderd', LANG_GELEDEN)],
                          { deleteFaalt: true });
  const stil = { log() {}, error() {} };
  const { klantWachtrijOpruimen } = M(
    () => ({ base: 'appX', table: 'Klanten', hdr: {} }), nep.fetch, stil);

  const uit = await klantWachtrijOpruimen({}, NU);
  toets('niets gemeld als verwijderd', uit.verwijderd.length === 0, JSON.stringify(uit.verwijderd));
  toets('het staat in de mislukt-lijst', uit.mislukt.length === 1, JSON.stringify(uit.mislukt));
  toets('met de reden erbij', /airtable_500/.test(JSON.stringify(uit.mislukt)),
        JSON.stringify(uit.mislukt));
});

const deel6 = deel5.then(async function () {
  console.log('\n6. Een onbereikbare Airtable is een fout, geen lege ronde');
  const nep = nepAirtable([], { lezenFaalt: true });
  const stil = { log() {}, error() {} };
  const { klantWachtrijOpruimen } = M(
    () => ({ base: 'appX', table: 'Klanten', hdr: {} }), nep.fetch, stil);

  let gooide = null;
  try { await klantWachtrijOpruimen({}, NU); } catch (e) { gooide = e; }
  // Stil "0 verwijderd" teruggeven zou in de log niet te onderscheiden zijn van
  // een ronde waarin niets rijp was — en dan merkt niemand dat de opruimer al
  // weken niets doet.
  toets('de ronde gooit in plaats van 0 te melden', !!gooide,
        'er kwam een normaal resultaat terug');
  toets('met de status van Airtable erin', !!gooide && /502/.test(gooide.message),
        gooide && gooide.message);
});

// ══════════════════════════════════════════════════════════════════
const deel7 = deel6.then(function () {
  console.log('\n7. De belofte dekt de lading — dezelfde termijn overal');
  const { KLANT_BEWAARDAGEN } = M(null, null, console);
  const dagen = String(KLANT_BEWAARDAGEN);

  const plekken = [
    ['privacy.html', path.join(__dirname, 'privacy.html')],
    ['verwijderen.html', path.join(__dirname, 'verwijderen.html')],
    ['pidlane-klant.js', path.join(__dirname, 'pidlane-klant.js')],
    ['pidlane-privacy.js', path.join(__dirname, 'pidlane-privacy.js')]
  ];

  plekken.forEach(function (p) {
    let t = '';
    try { t = fs.readFileSync(p[1], 'utf8'); } catch (e) { /* bestaat niet — de toets hieronder meldt dat */ }
    // Bewust op het GETAL en niet op een hele zin. "binnen 30 dagen",
    // "uiterlijk 30 dagen later" en "na 30 dagen" zijn alle drie goed; wat
    // niet mag is dat de termijn in de code verandert en in de tekst blijft
    // staan. Zet KLANT_BEWAARDAGEN op 14 en alle vier deze regels worden rood.
    toets(p[0] + ' noemt de bewaartermijn van ' + dagen + ' dagen',
          new RegExp('\\b' + dagen + '\\s+dagen\\b', 'i').test(t),
          t ? 'de tekst noemt die termijn niet — zet KLANT_BEWAARDAGEN en de tekst gelijk'
            : 'bestand niet te lezen');
  });

  // De publieke URL die de Play Console in het veld "Data deletion" wil. Zonder
  // dit bestand is het veld niet in te vullen en komt de app er niet door.
  const weg = path.join(__dirname, 'verwijderen.html');
  toets('de publieke verwijderpagina bestaat', fs.existsSync(weg));
  const wegT = fs.existsSync(weg) ? fs.readFileSync(weg, 'utf8') : '';
  toets('en legt uit hoe het zonder de app moet', /support@pidlane\.nl/.test(wegT));
  toets('privacy.html wijst naar die pagina',
        /verwijderen\.html/.test(fs.readFileSync(path.join(__dirname, 'privacy.html'), 'utf8')));

  // De oude belofte mag niet blijven staan naast de nieuwe: "verwijder je via
  // Mijn account" was waar het misging, en zonder knop is dat weer een tekst
  // die iets belooft wat er niet is.
  const klantJs = fs.readFileSync(path.join(__dirname, 'pidlane-klant.js'), 'utf8');
  toets('het tokenscherm heeft de knop echt', /id="mtWeg"/.test(klantJs));
  toets('en die roept de verwijderroute aan', /'\/klant\/verwijder'/.test(klantJs));
  toets('de Worker kent die route', /"\/klant\/verwijder"/.test(src));
  // Let op de ^ met de m-vlag: /crons\s*=/ matcht ook "# crons = [...]", en
  // uitcommentariëren is nou juist de manier waarop de opruimer stilletjes
  // uitgezet raakt. Deze regel moet ONgecommentarieerd in wrangler.toml staan.
  toets('en er staat een cron ingeroosterd',
        /^\s*crons\s*=/m.test(fs.readFileSync(path.join(wortel, 'wrangler.toml'), 'utf8')),
        'zonder cron ruimt niemand op en is de termijn een loze belofte');
  toets('met een scheduled() die hem opvangt', /async scheduled\(/.test(src));
});

deel7.then(function () {
  console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
  process.exit(fouten ? 1 : 0);
}).catch(function (e) {
  console.log('  FOUT test brak af — ' + (e && e.stack || e));
  process.exit(1);
});
