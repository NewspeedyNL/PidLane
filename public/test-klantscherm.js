// ══════════════════════════════════════════════════════════════════
// test-klantscherm.js — het meekijkscherm van de klant zegt de waarheid
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT (24-10-2026)
//
// Kijkt er een expert mee, dan ziet de klant of zijn telefoon levert, welke
// waarden er weggaan en wat de expert opvraagt. Drie dingen mogen daar niet
// misgaan:
//  1. "Live" zeggen terwijl er niets meer verstuurd wordt (of de auto niet
//     verbonden is). Dat is precies wat het scherm moet voorkomen.
//  2. Een AI-analyse door de expert verzwijgen: die gaat van het tegoed van
//     de klant af.
//  3. Waarden of PID-lijsten van de peer ruw in de HTML zetten.
// Naast elk faalgeval staat het gewone geval.
//
// Draaien vanuit public/:  node test-klantscherm.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) console.log('  ok  ' + naam);
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}
const bron = fs.readFileSync(path.join(__dirname, 'pidlane-remote.js'), 'utf8');
function knip(van, tot, wat) {
  const a = bron.indexOf(van);
  if (a < 0) { console.error('FOUT: anker voor ' + wat + ' niet gevonden: ' + van); process.exit(1); }
  const b = bron.indexOf(tot, a);
  if (b < 0) { console.error('FOUT: eindanker voor ' + wat + ' niet gevonden: ' + tot); process.exit(1); }
  return bron.slice(a, b);
}
const escSrc = knip('const esc=s=>String(s)', '\n', 'esc') + '\n';
const pure = knip('function klantActie(m){', 'function klantLog(tekst){', 'klantActie/klantStatus/klantHtml');
const F = new Function(escSrc + pure + '\nreturn {klantActie,klantStatus,klantHtml};')();

console.log('\n1. Status: live alleen als er echt verstuurd wordt');
{
  const nu = 100000;
  toets('vers verstuurd + verbonden → ok', F.klantStatus(nu, nu - 1000, true).soort === 'ok');
  toets('8 s niets verstuurd → stil', F.klantStatus(nu, nu - 8000, true).soort === 'stil', JSON.stringify(F.klantStatus(nu, nu - 8000, true)));
  toets('niet verbonden → geen-auto, ook met verse waarde', F.klantStatus(nu, nu - 500, false).soort === 'geen-auto');
  toets('nog niets verstuurd → wacht', F.klantStatus(nu, 0, true).soort === 'wacht');
}

console.log('\n2. Wat de expert doet');
{
  toets('foutcodes lezen wordt gemeld', /foutcodes/.test(F.klantActie({ type: 'request-dtc' }) || ''));
  toets('AI-analyse noemt het tegoed', /tegoed/.test(F.klantActie({ type: 'request-analyze' }) || ''));
  toets('opname start wordt gemeld', /opname/.test(F.klantActie({ type: 'request-record', action: 'start' }) || ''));
  toets('PID-lijst komt mee', /0C 05/.test(F.klantActie({ type: 'request-pids', pids: ['0C', '05'] }) || ''));
  toets('presence is geen expert-actie', F.klantActie({ type: 'presence', experts: 1 }) === null);
  toets('onbekend type → niets', F.klantActie({ type: 'iets' }) === null);
}

console.log('\n3. Niets van de peer ruw in de HTML');
{
  const NASTY = '<img src=x onerror=alert(1)>';
  const st = (extra) => Object.assign({ n: 1, status: F.klantStatus(1000, 900, true),
    waarden: [{ naam: 'Toerental', waarde: 649, eenheid: 'RPM' }], log: [{ tijd: '13:44', tekst: 'leest de foutcodes uit' }] }, extra);
  let h = F.klantHtml(st({ waarden: [{ naam: NASTY, waarde: NASTY, eenheid: NASTY }] }));
  toets('waarde/naam/eenheid met markup', h.indexOf('<img') < 0, h.slice(0, 200));
  h = F.klantHtml(st({ log: [{ tijd: NASTY, tekst: F.klantActie({ type: 'request-pids', pids: [NASTY] }) }] }));
  toets('tijd en PID-lijst van de peer met markup', h.indexOf('<img') < 0, h);
  h = F.klantHtml(st());
  toets('gewone waarde blijft staan', /649/.test(h) && /Toerental/.test(h) && /RPM/.test(h));
  toets('stopknop staat erin', /PLRemote\.shareStop\(\)/.test(h));
}

console.log(fouten ? '\n' + fouten + ' FOUT(EN)' : '\nAlles goed');
process.exit(fouten ? 1 : 0);
