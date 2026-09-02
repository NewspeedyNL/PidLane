// ══════════════════════════════════════════════════════════════════
// test-applog.js — de testrun leest de app-log uit de juiste bron
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (#29)
// De testrun las de app-log op drie plekken als:
//
//     window._appLog || window.logBuffer || []
//
// Beide globals bestaan nergens in public/. Alle drie de plekken kregen dus
// altijd een lege array — zonder ooit een fout te geven, want de `|| []` ving
// het netjes op. Een stille nul, precies het soort dat maanden blijft staan.
//
// Drie gevolgen, alle drie terug te zien in de run van 28-08-2026:
//   1. Blok 14 meldde "niets opgeruimd" terwijl de opruimregel twee keer had
//      gevuurd. Die regels staan met "🧹 ... opgeruimd" in de APP-log.
//      Het advies eronder — "controleer of hij aanstaat" — stuurde je naar
//      precies het onderzoek dat je niet moest doen.
//   2. "Meldingen sinds het begin van deze run" gaf structureel
//      "app-log 0 regels" naast een BT-log van 1183 regels.
//   3. Het opgeslagen rapport had nooit een APP-LOG-sectie.
//
// De echte bron is plLokaalLog() uit pidlane-auth.js, zoals pidlane-logboek.js
// hem al las. Deze test bewaakt twee dingen: dat de helper de juiste bron
// gebruikt, en dat de dode globals niet terugsluipen.
//
// Draaien vanuit public/:  node test-applog.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

const bron = fs.readFileSync(__dirname + '/pidlane-testrun.js', 'utf8');

console.log('\n1. De dode globals zijn weg uit de code die draait');
{
  // Alleen de uitvoerbare regels tellen. Twee soorten regels noemen de dode
  // globals met opzet en horen er dus niet in mee:
  //   - commentaar: de helper legt bovenaan uit wat de fout wás
  //   - prozaregels: CAMPAGNE beschrijft de fout woordelijk voor de gebruiker
  // Een prozaregel herken je eraan dat hij begint met een aanhalingsteken.
  // Grof, maar in dit bestand precies genoeg: echte code die deze globals
  // leest begint met const/let/var of een toewijzing, nooit met een quote.
  const zonderCommentaar = bron
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .split('\n').map(r => r.replace(/\/\/.*$/, '')).join('\n');
  const treffers = zonderCommentaar.split('\n')
    .map((t, i) => ({ nr: i + 1, t }))
    .filter(x => /window\.(_appLog|logBuffer)/.test(x.t) && !/^\s*['"]/.test(x.t));
  toets('geen window._appLog / window.logBuffer meer', treffers.length === 0,
        treffers.map(x => 'regel ' + x.nr).join(', '));
}

console.log('\n2. Er is één gedeelde helper, en die wordt overal gebruikt');
{
  toets('_appLogRegels() bestaat', /function _appLogRegels\s*\(/.test(bron));
  const n = (bron.match(/_appLogRegels\(\)/g) || []).length - 0;
  // 1 definitie-aanroepnaam telt niet mee; we verwachten 3 gebruiksplekken.
  toets('op drie plekken gebruikt', n >= 3, n + ' aanroepen gevonden');
  toets('leest plLokaalLog()', /plLokaalLog\(\)/.test(bron),
        'de helper hoort dezelfde bron te gebruiken als pidlane-logboek.js');
}

console.log('\n3. De helper doet wat hij belooft');
{
  const van = bron.indexOf('function _appLogRegels()');
  const tot = bron.indexOf('\n}', van) + 2;
  const maak = new Function('plLokaalLog', 'console', bron.slice(van, tot) + '\nreturn _appLogRegels;');
  const stilleConsole = { warn: function () {} };

  const regels = [{ ts: '14:11:25', msg: '🧹 Sensor 015E opgeruimd', type: 'warn' }];
  toets('geeft de regels van plLokaalLog() terug',
        JSON.stringify(maak(() => regels, stilleConsole)()) === JSON.stringify(regels));

  toets('geeft [] als plLokaalLog ontbreekt',
        JSON.stringify(maak(undefined, stilleConsole)()) === '[]');

  toets('geeft [] als plLokaalLog geen array geeft',
        JSON.stringify(maak(() => 'kapot', stilleConsole)()) === '[]');

  let gemeld = 0;
  const luideConsole = { warn: function () { gemeld++; } };
  const stuk = maak(() => { throw new Error('stuk'); }, luideConsole);
  toets('een fout geeft [] én een melding — geen stille nul',
        JSON.stringify(stuk()) === '[]' && gemeld === 1,
        'gemeld=' + gemeld);
}

console.log('\n4. TEGENPROEF — zou de oude situatie hier opvallen?');
// Zonder dit weet je alleen dat het nu groen staat, niet dat de test de fout
// van 28-08 daadwerkelijk zou hebben gezien.
{
  const oud = '    const app = (window._appLog || window.logBuffer || []);';
  toets('de oude regel matcht de controle uit deel 1',
        /window\.(_appLog|logBuffer)/.test(oud),
        'de regexp vangt de dode globals niet — dan meet deel 1 niets');

  // En het gedrag: de oude vorm levert een lege lijst op in een omgeving waar
  // de app-log wél gevuld is. Dat is de kern van het issue.
  const window_ = {};                 // geen _appLog, geen logBuffer — zoals in de app
  const oudeFn = new Function('window', 'return (window._appLog || window.logBuffer || []);');
  toets('de oude vorm geeft inderdaad een lege lijst', oudeFn(window_).length === 0);
}

console.log('\n5. De app-log kapt eerlijk af (#72)');
// DE FOUT. `if(localLog.length>500) localLog.shift();` liet NIETS achter dat
// zei dat er iets weg was. Wie het logboek opensloeg na een rit van een half
// uur zag een lijst die er compleet uitzag en dat niet was — en wat er als
// eerste uit rolt is juist het oudste: de opstart, de protocolkeuze, de eerste
// opruimacties. Precies de vorm waarin #29 maanden bleef staan: een bron die
// stil minder oplevert dan hij belooft.
//
// De BT-log deed dit al goed (kop + staart + een zichtbare regel ertussen).
// Deze toets draait de ECHTE log() uit pidlane-auth.js — met een nagemaakte
// DOM, want die functie schrijft ook naar het scherm.
{
  const auth = fs.readFileSync(__dirname + '/pidlane-auth.js', 'utf8');
  const van = auth.indexOf('const APPLOG_CAP');
  const tot = auth.indexOf('\n}', auth.indexOf('function log(msg,type=', van)) + 2;
  if (van < 0 || tot < 2) {
    toets('log() met geheugen-cap gevonden in pidlane-auth.js', false,
          'APPLOG_CAP niet gevonden — de cap is stil of hernoemd');
  } else {
    const localLog = [];
    const bal = { children: [], appendChild(el) { this.children.push(el); },
                  removeChild(el) { const i = this.children.indexOf(el); if (i > -1) this.children.splice(i, 1); },
                  get firstChild() { return this.children[0]; }, scrollTop: 0, scrollHeight: 0 };
    const doc = { getElementById: () => bal, createElement: () => ({ className: '', innerHTML: '' }) };
    const maakLog = new Function('localLog', 'document', 'liveLogWrite', 'logToSheets', 'console',
      auth.slice(van, tot) + '\nreturn {log:log, CAP:APPLOG_CAP, KOP:APPLOG_KOP};');
    const L = maakLog(localLog, doc, function () {}, function () {}, { warn() {} });

    for (let i = 0; i < L.CAP + 200; i++) L.log('regel ' + i, 'info');

    toets('de buffer blijft binnen de cap', localLog.length <= L.CAP + 1,
          localLog.length + ' regels bij een cap van ' + L.CAP);
    // DE KERN: het begin van de rit overleeft.
    toets('de allereerste regel staat er nog', localLog[0] && localLog[0].msg === 'regel 0',
          'eerste regel is nu: ' + (localLog[0] && localLog[0].msg));
    // En de afkapping is zichtbaar.
    const weg = localLog.filter((l) => /weggelaten \(geheugen-cap\)/.test(l.msg || ''));
    toets('er staat een zichtbare "weggelaten"-regel in', weg.length === 1,
          weg.length + ' zulke regels gevonden — 0 betekent dat de afkapping weer stil is');
    toets('en die noemt hoeveel er weg zijn', weg.length === 1 && /… \d+ regels weggelaten/.test(weg[0].msg),
          'regel: ' + (weg[0] && weg[0].msg));
    // De staart is de meest recente, anders lees je een oude rit terug.
    toets('de laatste regel is de nieuwste', localLog[localLog.length - 1].msg === 'regel ' + (L.CAP + 199),
          'laatste regel: ' + localLog[localLog.length - 1].msg);
    toets('elke regel draagt een epoch-tijdstempel (#75)',
          localLog.every((l) => typeof l.t === 'number'),
          'er zijn regels zonder t — dan telt de testrun ze niet mee');

    // TEGENPROEF: de oude shift()-vorm op dezelfde reeks.
    const oudeBuffer = [];
    for (let i = 0; i < 700; i++) { oudeBuffer.push({ msg: 'regel ' + i }); if (oudeBuffer.length > 500) oudeBuffer.shift(); }
    toets('de oude vorm verliest het begin zonder melding',
          oudeBuffer[0].msg !== 'regel 0' && !oudeBuffer.some((l) => /weggelaten/.test(l.msg)),
          'de tegenproef bewijst niets — de oude vorm zou hier al slagen');
  }
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
