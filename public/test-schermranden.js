// ══════════════════════════════════════════════════════════════════
// test-schermranden.js — volle-schermvensters blijven onder de statusbalk
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// Op 28-08-2026 kreeg de topbalk een veilige marge (--pl-sat/--pl-sab in
// pidlane.css) voor Android 15+ edge-to-edge — gemeten in een browser, niet
// op een toestel. Diezelfde dag meldde een schermfoto dat het Logboek WEL
// onder de statusbalk uitschoof: "Logboek", "Sluiten" en de teller stonden
// half achter de systeemklok. De topbalk was de enige plek die was
// aangepakt; de app heeft ~20 andere volschermvensters die zichzelf met een
// losse <div style="position:fixed;inset:0;..."> opbouwen, allemaal met hun
// eigen padding, en zonder gedeelde class is er geen CSS-regel die ze in
// één keer meeneemt.
//
// Dit bestand somt de vensters op die met het oog ECHT tegen de bovenrand
// aan liggen (het venster zelf is de eerste laag onder de systeembalk, geen
// backdrop ertussen) en toetst dat hun opening naar --pl-sat/--pl-sab wijst.
// Gecentreerde dialogen en onderaan-uitschuivende vellen staan er BEWUST
// niet in: daarboven of -onder blijft alleen de halfdoorzichtige achtergrond
// staan, en die mag prima onder de statusbalk doorlopen.
//
// WAAROM BRONCONTROLE EN GEEN GEDRAGSTEST
// Playwright kan dit gedrag meten — en heeft dat voor het Logboek ook echt
// gedaan, met tegenproef (zie PIDLANE.md §11). Voor de rest lukt dat hier
// niet zonder de hele app-boot na te bouwen: openTestrun() bijvoorbeeld
// weigert zonder isAdmin(), en dat hangt aan een ingelogde sessie die een
// kale testomgeving niet heeft. Vandaar bron, met de reden erbij, zoals
// CLAUDE.md voorschrijft.
//
// Draaien vanuit public/:  node test-schermranden.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let fouten = 0;
function toets(naam, waar, uitleg) {
  if (waar) { console.log('  ok  ' + naam); }
  else { console.log('  FOUT ' + naam + (uitleg ? ' — ' + uitleg : '')); fouten++; }
}

function lees(bestand) {
  return fs.readFileSync(path.join(__dirname, bestand), 'utf8');
}
const wortel = (b) => fs.readFileSync(path.join(__dirname, '..', b), 'utf8');

// Elk item: het bestand, een fragment dat de declaratie uniek vindt, en welke
// tokens erin moeten staan. 'top' hoort in de padding/top-regel die het
// venster van de bovenrand afhoudt, 'bottom' in de regel die het van de
// onderrand afhoudt (alleen waar dat venster ook echt tot de onderrand komt).
const VENSTERS = [
  { naam: 'Logboek',                bestand: 'pidlane-logboek.js',
    fragment: "id = 'logboekOv'",   nodig: ['top', 'bottom'] },
  { naam: 'Testrunpaneel',          bestand: 'pidlane-testrun.js',
    fragment: "z-index:9980",       nodig: ['top', 'bottom'] },
  { naam: 'Veldlab-dashboard (vlDash)', bestand: 'pidlane-veldlab.js',
    fragment: "id='vlDash'",        nodig: ['top', 'bottom'] },
  { naam: 'Diepe diagnose — koptekst',  bestand: 'pidlane-koopcheck.js',
    fragment: 'id="ddProgRow"',     nodig: ['top'] },
  { naam: 'Diepe diagnose — voettekst', bestand: 'pidlane-koopcheck.js',
    fragment: 'id="ddFoot"',        nodig: ['bottom'] }
];

console.log('\n1. De bekende volschermvensters wijzen naar de veilige-zonetokens');
for (const v of VENSTERS) {
  const bron = lees(v.bestand);
  const i = bron.indexOf(v.fragment);
  if (i < 0) { toets(v.naam + ': fragment gevonden', false, 'markering "' + v.fragment + '" niet aangetroffen — is het venster hernoemd?'); continue; }
  // Het venster kan over meerdere regels lopen (string-concatenatie); pak een
  // ruim venster eromheen zodat de style-declaratie er zeker in zit.
  const stuk = bron.slice(Math.max(0, i - 400), i + 800);
  if (v.nodig.includes('top'))
    toets(v.naam + ': bovenkant gebruikt --pl-sat', /var\(--pl-sat/.test(stuk),
          'geen var(--pl-sat…) gevonden rond deze declaratie — dan ligt de inhoud weer flush tegen de statusbalk');
  if (v.nodig.includes('bottom'))
    toets(v.naam + ': onderkant gebruikt --pl-sab', /var\(--pl-sab/.test(stuk),
          'geen var(--pl-sab…) gevonden — de onderkant kan dan onder de gebarenbalk komen');
}

console.log('\n2. Twee vensters in index.html (HUD en rittracker)');
{
  const html = wortel('public/index.html');

  const iHud = html.indexOf('id="neonDash"');
  toets('neonDash gevonden', iHud >= 0);
  if (iHud >= 0) {
    const stuk = html.slice(iHud, iHud + 1200);
    toets('HUD-koptekst gebruikt --pl-sat', /var\(--pl-sat/.test(stuk));
    toets('hudScreen schuift evenveel mee', /top:calc\(44px \+ var\(--pl-sat/.test(stuk),
          'de inhoud onder de koptekst moet met dezelfde marge verschuiven, anders overlapt hij de koptekst');
  }

  const iRit = html.indexOf('id="ritDash"');
  toets('ritDash gevonden', iRit >= 0);
  if (iRit >= 0) {
    const stuk = html.slice(iRit, iRit + 500);
    toets('ritDash gebruikt --pl-sat en --pl-sab', /var\(--pl-sat/.test(stuk) && /var\(--pl-sab/.test(stuk));
  }

  const iCar = html.indexOf('id="caravanDash"');
  toets('caravanDash gevonden', iCar >= 0);
  if (iCar >= 0) {
    const stuk = html.slice(iCar, iCar + 500);
    toets('caravanDash gebruikt --pl-sat en --pl-sab', /var\(--pl-sat/.test(stuk) && /var\(--pl-sab/.test(stuk));
  }
}

console.log('\n3. Tegenproef — wordt een teruggedraaide regel ook echt rood?');
// Zonder dit weet je alleen dat de toets GROEN kan staan, niet dat hij ooit
// ROOD wordt. Simuleer de oude, kapotte staat van het Logboek-venster.
{
  const oudeStijl = "position:fixed;inset:0;z-index:9975;background:rgba(8,11,17,.97);display:flex;flex-direction:column;padding:12px;gap:8px";
  const kunstmatig = "  ov.style.cssText = '" + oudeStijl + "';";
  const nepbron = "function x(){\n" + kunstmatig + "\n}";
  toets('een teruggedraaide declaratie bevat geen --pl-sat (tegenproef)',
        !/var\(--pl-sat/.test(nepbron),
        'als dit WEL matcht is de regex hierboven te ruim en meet hij niets');
}

console.log('\n' + (fouten ? fouten + ' FOUT(en)' : 'alles goed'));
process.exit(fouten ? 1 : 0);
