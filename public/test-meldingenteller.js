// ══════════════════════════════════════════════════════════════════
// test-meldingenteller.js — "sinds het begin van deze run" gaat over de run
// ──────────────────────────────────────────────────────────────────
// DE FOUT (#75). De regel in blok 11 heet "Meldingen sinds het begin van deze
// run" en telde `app.length` en `bt.length`: de volledige inhoud van beide
// ringbuffers, zonder enige tijdsgrens.
//
// Het bewijs uit de run van 01-09: de regel meldde "app-log 33 regels". In het
// opgeslagen rapport staat de complete app-log — precies 33 regels, waarvan de
// laatste van 22:29:21, terwijl de run om 22:32:02 begon. Er was tijdens de run
// geen enkele regel bij gekomen; gemeld werd 33. Voor de BT-log kwam er nog wat
// bij: het rapport wordt ná de run opgeslagen, dus de 1232 getelde regels
// bevatten ook twee minuten polverkeer van daarna.
//
// Waarom dat hindert: de regel eindigt met "kijk in de staart van het logboek
// of er meldingen bij zitten die je nog nooit gezien hebt". Dat advies
// veronderstelt dat het getal over de run gaat. Het stuurde je een ringbuffer
// door waarvan het overgrote deel van vóór de run was.
//
// DE TWEEDE HELFT: DE TIJDSTEMPEL. Beide logs droegen alleen `ts` als
// kloktijdstring ("22:33:41"). Vergelijken met een starttijd vraagt dan een
// omrekening die om middernacht stukgaat. log() en btDiag() zetten er sinds
// 02-09-2026 `t` (epoch) bij — PIDLANE-CONTRACT.md §6: tijden zijn epoch, de
// kloktijd is voor het scherm. Deze test bewaakt beide helften: de telling én
// dat de bron dat veld levert.
//
// Draaien vanuit public/:  node test-meldingenteller.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

// ── de controle uit pidlane-testrun.js knippen ────────────────────
// Zelfde aanpak als test-bezetting.js: de body van de _doe()-aanroep eruit
// halen en met eigen logs draaien. De functie leest _appLogRegels(), _btLog en
// _trStart — die leveren we hier.
const bron = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');
const anker = "await _doe(11, 'Meldingen sinds het begin van deze run', function () {";
const van = bron.indexOf(anker);
if (van < 0) {
  console.error('FOUT: de controle "Meldingen sinds het begin van deze run" is niet gevonden.');
  process.exit(1);
}
const body = bron.slice(van + anker.length, bron.indexOf('\n  });', van));
const maak = new Function('_appLogRegels', '_btLog', '_trStart', body);

const T = 1700000000000;          // startmoment van de "run"
const regel = (t, type) => ({ ts: '00:00:00', t: t, type: type || 'info', msg: 'x' });

function draai(app, bt, start) {
  return maak(function () { return app; }, bt, start === undefined ? T : start);
}
const tekst = (r) => (r && r.detail) ? r.detail : String(r);
const getal = (r, wat) => {
  const m = new RegExp(wat + ' (\\d+) regels').exec(tekst(r));
  return m ? Number(m[1]) : -1;
};

console.log('1. De run van 01-09: 33 regels van vóór de run, nul erin');
{
  const app = [];
  for (let i = 0; i < 33; i++) app.push(regel(T - 180000 + i * 1000));   // allemaal ~3 min vóór de start
  const r = draai(app, [], T);
  toets('app-log telt 0 regels', getal(r, 'app-log') === 0,
        'gemeld: ' + tekst(r));
}

console.log('\n2. Alleen wat er tijdens de run bij kwam');
{
  const app = [];
  for (let i = 0; i < 20; i++) app.push(regel(T - 60000 + i * 1000));    // vóór
  for (let i = 0; i < 7; i++) app.push(regel(T + 1000 + i * 1000, i < 2 ? 'warn' : 'info'));
  app.push(regel(T + 20000, 'err'));
  const r = draai(app, [], T);
  toets('8 van de 28 regels geteld', getal(r, 'app-log') === 8, 'gemeld: ' + tekst(r));
  toets('2 warn geteld', /8 regels \(2 warn/.test(tekst(r)), 'gemeld: ' + tekst(r));
  toets('1 err geteld', /2 warn, 1 err/.test(tekst(r)), 'gemeld: ' + tekst(r));
}

console.log('\n3. De BT-log wordt op dezelfde klok afgekapt');
{
  // Het rapport wordt ná de run opgeslagen. Regels van ná de start tellen mee —
  // dat is bewust: de run loopt op het moment van meten nog.
  const bt = [regel(T - 5000), regel(T - 1), regel(T), regel(T + 5000, 'warn')];
  const r = draai([], bt, T);
  toets('2 van de 4 BT-regels geteld', getal(r, 'BT-log') === 2, 'gemeld: ' + tekst(r));
}

console.log('\n4. Regels zonder tijdstempel worden gemeld, niet verzwegen');
{
  // Uit een vorige sessie teruggezet (restoreBtLog) of van vóór deze versie.
  // Ze horen niet bij deze run — maar stilzwijgend weglaten is dezelfde fout
  // als stilzwijgend meetellen.
  const bt = [{ ts: '10:00:00', msg: 'oud', type: 'info' }, { ts: '10:00:01', msg: 'oud', type: 'info' }, regel(T + 1000)];
  const r = draai([], bt, T);
  toets('1 BT-regel geteld', getal(r, 'BT-log') === 1, 'gemeld: ' + tekst(r));
  toets('en de 2 ongedateerde worden genoemd', /2 regel\(s\) zonder tijdstempel/.test(tekst(r)),
        'gemeld: ' + tekst(r));
}

console.log('\n5. TEGENPROEF — de hele buffer tellen wordt gezien');
{
  // Dit is de oude implementatie, letterlijk. Hij hoort de toetsen hierboven
  // niet te halen; deed hij dat wel, dan meten die iets anders dan ze denken.
  const oud = function (app, bt) {
    const tel = (arr, soort) => (arr || []).filter((l) => String((l && l.type) || '') === soort).length;
    return 'app-log ' + (app.length || 0) + ' regels (' + tel(app, 'warn') + ' warn, ' + tel(app, 'err') + ' err)' +
           '  |  BT-log ' + (bt.length || 0) + ' regels (' + tel(bt, 'warn') + ' warn, ' + tel(bt, 'err') + ' err)';
  };
  const app = [];
  for (let i = 0; i < 33; i++) app.push(regel(T - 180000 + i * 1000));
  const r = oud(app, []);
  toets('de oude telling geeft hier 33', /app-log 33 regels/.test(r), 'gaf: ' + r);
  toets('en de nieuwe geeft 0', getal(draai(app, [], T), 'app-log') === 0);
}

console.log('\n6. De bron levert het epoch-veld dat dit mogelijk maakt');
{
  // Zonder `t` in log() en btDiag() valt er niets af te kappen en telt de
  // controle hierboven altijd nul. Broncontrole, want log() hangt aan de DOM
  // en btDiag aan de BT-laag; het gedrag van de cap zelf staat in
  // test-applog.js. De reden staat erbij, zoals §20 vraagt.
  const auth = fs.readFileSync(__dirname + '/pidlane-auth.js', 'utf8');
  const btflow = fs.readFileSync(__dirname + '/pidlane-btflow.js', 'utf8');
  toets('log() zet t:Date.now() bij elke regel', /localLog\.push\(\{ts,t:Date\.now\(\)/.test(auth),
        'niet gevonden in pidlane-auth.js');
  toets('btDiag() ook', /_btLog\.push\(\{ts,t:Date\.now\(\)/.test(btflow),
        'niet gevonden in pidlane-btflow.js');
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
