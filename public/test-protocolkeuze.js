// ══════════════════════════════════════════════════════════════════
// test-protocolkeuze.js — de protocolkeuze biedt echt een keuze
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// PROTOCOLS staat sinds de opsplitsing in pidlane-data.js met negen protocollen
// erin, en werd door NIETS gelezen. scanNetworks() zette alleen het automatisch
// gevonden protocol in discoveredNetworks, dus stond er altijd precies één ding
// in — en renderNetworkCards() had een tak "één netwerk? niet laten kiezen,
// na 1,5 s vanzelf doorstappen". Die tak was daarmee de enige die ooit liep.
//
// Gevolg: het protocol werd vergrendeld (ATSP) voor je het scherm gelezen had,
// en zat de detectie ernaast dan was de enige uitweg opnieuw beginnen. Dat is
// geen theoretisch geval: de ELM327 kan de plank misslaan op een bus met
// meerdere snelheden, achter een gateway die 11-bit naar 29-bit spiegelt, of op
// een auto die CAN én K-Line voert.
//
// plProtocolLijst() bouwt de lijst nu op. Deze test legt drie dingen vast:
//   1. er staat ALTIJD meer dan één optie in, ook als de adapter iets herkende
//   2. het herkende protocol staat BOVENAAN (dat is de voorselectie)
//   3. het herkende protocol staat er niet dubbel in, ook niet als ATDPN het
//      als 'A6' teruggeeft in plaats van '6'
//
// Draaien vanuit public/:  node test-protocolkeuze.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

function laadData() {
  const s = {};
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  if (typeof s.plProtocolLijst !== 'function') throw new Error('plProtocolLijst() niet gevonden in pidlane-data.js');
  if (!Array.isArray(s.PROTOCOLS)) throw new Error('PROTOCOLS niet gevonden in pidlane-data.js');
  return s;
}

// Zo ziet het eruit als de adapter CAN 11-bit 500k herkent. ATDPN geeft daar
// 'A6' voor ("A" = automatisch gevonden), niet '6'.
const HERKEND_A6 = { id: 'A6', name: 'AUTO, ISO 15765-4 (CAN 11/500)', icon: '✅', desc: 'Automatisch herkend door ELM327' };
const HERKEND_6 = { id: '6', name: 'ISO 15765-4 (CAN 11/500)', icon: '✅', desc: 'Automatisch herkend door ELM327' };

// ── de controles ─────────────────────────────────────────────────

// De tabel zelf moet bruikbaar zijn: elk protocol een id, naam, icoon en
// omschrijving, en geen twee keer hetzelfde id.
function keurTabel(protocols) {
  const uit = [];
  if (protocols.length < 5) uit.push('maar ' + protocols.length + ' protocollen in PROTOCOLS');
  const gezien = new Set();
  protocols.forEach(function (p, i) {
    ['id', 'name', 'icon', 'desc'].forEach(function (v) {
      if (!p || !String(p[v] || '').trim()) uit.push('PROTOCOLS[' + i + '] mist ' + v);
    });
    if (p && p.id != null) {
      const k = String(p.id).toUpperCase();
      if (gezien.has(k)) uit.push('PROTOCOLS bevat id ' + k + ' twee keer');
      gezien.add(k);
    }
  });
  return uit;
}

// CAN 11-bit 500k is verreweg het gangbaarst (alles vanaf 2008). Dat hoort
// bovenaan te staan, want zonder detectie is het de voorselectie.
function keurBesteBovenaan(protocols) {
  if (!protocols.length) return ['PROTOCOLS is leeg'];
  return String(protocols[0].id) === '6' ? []
    : ['PROTOCOLS begint met id ' + protocols[0].id + ' (' + protocols[0].name + '), verwacht 6 (CAN 11-bit 500k)'];
}

// DE KERN: met een herkend protocol moet er nog steeds iets te kiezen zijn.
function keurKeuzeBlijftBestaan(fn, protocols) {
  const uit = [];
  [HERKEND_A6, HERKEND_6, null].forEach(function (det) {
    const lijst = fn(det, protocols);
    const label = det ? 'herkend ' + det.id : 'niets herkend';
    if (lijst.length < 2) uit.push(label + ': maar ' + lijst.length + ' optie(s) — dan valt er niets te kiezen');
    const handmatig = lijst.filter(function (n) { return n.handmatig; });
    if (!handmatig.length) uit.push(label + ': geen enkele handmatige optie in de lijst');
  });
  return uit;
}

// Het herkende protocol staat bovenaan en is als enige gemarkeerd als auto.
function keurHerkendBovenaan(fn, protocols) {
  const uit = [];
  [HERKEND_A6, HERKEND_6].forEach(function (det) {
    const lijst = fn(det, protocols);
    if (!lijst.length) { uit.push('herkend ' + det.id + ': lege lijst'); return; }
    if (!lijst[0].auto) uit.push('herkend ' + det.id + ': bovenste optie is niet het herkende protocol');
    if (String(lijst[0].id) !== String(det.id)) uit.push('herkend ' + det.id + ': bovenaan staat id ' + lijst[0].id);
    const autos = lijst.filter(function (n) { return n.auto; });
    if (autos.length !== 1) uit.push('herkend ' + det.id + ': ' + autos.length + ' opties gemarkeerd als herkend, hoort 1');
  });
  // Zonder detectie mag er niets als "herkend" gemarkeerd staan.
  const zonder = fn(null, protocols);
  if (zonder.some(function (n) { return n.auto; })) uit.push('zonder detectie staat er tóch iets als herkend gemarkeerd');
  return uit;
}

// Geen dubbele id's in de uiteindelijke lijst — dit is waar de 'A' van ATDPN
// stukging: 'A6' naast '6' zou het gedetecteerde protocol twee keer tonen.
function keurGeenDubbele(fn, protocols) {
  const uit = [];
  [HERKEND_A6, HERKEND_6, null].forEach(function (det) {
    const lijst = fn(det, protocols);
    const gezien = new Set();
    lijst.forEach(function (n) {
      const k = String(n.id).replace(/^A/i, '').toUpperCase();
      if (gezien.has(k)) uit.push((det ? 'herkend ' + det.id : 'niets herkend') + ': protocol ' + k + ' staat dubbel in de lijst');
      gezien.add(k);
    });
  });
  return uit;
}

// Rommelige invoer mag geen kapotte lijst geven — de adapter kan van alles
// terugsturen en dit scherm is het eerste dat de gebruiker ziet.
function keurRommel(fn, protocols) {
  const uit = [];
  [undefined, null, {}, { id: '' }, { id: null }].forEach(function (det) {
    let lijst;
    try { lijst = fn(det, protocols); }
    catch (e) { uit.push(JSON.stringify(det) + ' laat plProtocolLijst klappen: ' + e.message); return; }
    if (!Array.isArray(lijst)) { uit.push(JSON.stringify(det) + ' geeft geen array'); return; }
    if (lijst.length !== protocols.length) uit.push(JSON.stringify(det) + ' geeft ' + lijst.length + ' opties, verwacht ' + protocols.length);
    if (lijst.some(function (n) { return n.auto; })) uit.push(JSON.stringify(det) + ' markeert iets als herkend zonder geldig id');
  });
  return uit;
}

// ── toetshulpjes ─────────────────────────────────────────────────
let fout = 0;

function toetsSchoon(naam, gemeten) {
  if (gemeten.length === 0) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  gemeten.forEach(function (r) { console.log('        ' + r); });
}

function toetsMeldt(naam, gemeten, moetNoemen) {
  const raak = gemeten.some(function (r) { return r.indexOf(moetNoemen) > -1; });
  if (raak) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam);
  console.log('        de controle bleef stil terwijl hij ' + moetNoemen + ' had moeten noemen');
  console.log('        kreeg: ' + (gemeten.length ? gemeten.join(' | ') : '(niets)'));
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Protocolkeuze — er valt echt iets te kiezen\n');

const S = laadData();
const PROTOCOLS = S.PROTOCOLS;

toetsSchoon('PROTOCOLS is gevuld en goed gevormd', keurTabel(PROTOCOLS));
toetsSchoon('het gangbaarste protocol staat bovenaan in PROTOCOLS', keurBesteBovenaan(PROTOCOLS));
toetsSchoon('met én zonder detectie valt er te kiezen (de fout van vóór 26-08)',
  keurKeuzeBlijftBestaan(S.plProtocolLijst, PROTOCOLS));
toetsSchoon('het herkende protocol staat bovenaan en is als enige "herkend"',
  keurHerkendBovenaan(S.plProtocolLijst, PROTOCOLS));
toetsSchoon('geen protocol staat dubbel in de lijst (de A van ATDPN)',
  keurGeenDubbele(S.plProtocolLijst, PROTOCOLS));
toetsSchoon('rommelige invoer geeft een bruikbare lijst', keurRommel(S.plProtocolLijst, PROTOCOLS));

// ── tegenproef ───────────────────────────────────────────────────
// Het oude gedrag: alleen het gedetecteerde protocol, verder niets.
function lijstOud(gedetecteerd) {
  return gedetecteerd ? [{ id: gedetecteerd.id, name: gedetecteerd.name, icon: '✅', desc: '', auto: true, handmatig: false }] : [];
}

toetsMeldt('het oude gedrag (alleen het gevonden protocol) wordt gezien',
  keurKeuzeBlijftBestaan(lijstOud, PROTOCOLS), 'maar 1 optie(s)');

toetsMeldt('het oude gedrag had ook geen enkele handmatige optie',
  keurKeuzeBlijftBestaan(lijstOud, PROTOCOLS), 'geen enkele handmatige optie');

// Een versie die de 'A' van ATDPN niet strippt, toont het protocol dubbel.
function lijstZonderAStrip(gedetecteerd, tabel) {
  const uit = [], gezien = new Set();
  if (gedetecteerd && gedetecteerd.id) {
    uit.push({ id: gedetecteerd.id, name: gedetecteerd.name, icon: '✅', desc: '', auto: true, handmatig: false });
    gezien.add(String(gedetecteerd.id).toUpperCase());   // <- zonder .replace(/^A/i,'')
  }
  (tabel || []).forEach(function (p) {
    if (gezien.has(String(p.id).toUpperCase())) return;
    uit.push({ id: p.id, name: p.name, icon: p.icon, desc: p.desc, auto: false, handmatig: true });
  });
  return uit;
}

toetsMeldt('een versie die de A van ATDPN niet stript toont het protocol dubbel',
  keurGeenDubbele(lijstZonderAStrip, PROTOCOLS), 'staat dubbel in de lijst');

// En de bijbehorende valstrik: die versie markeert dan twee dingen als herkend?
// Nee — hij markeert er één, maar toont id 6 twee keer. Vastleggen dat de
// dubbele-controle dat vindt en de bovenaan-controle níét, zodat duidelijk is
// dat ze verschillende dingen toetsen.
toetsSchoon('de bovenaan-controle vindt de A-fout juist NIET (andere controle, ander doel)',
  keurHerkendBovenaan(lijstZonderAStrip, PROTOCOLS));

toetsMeldt('een lijst die het herkende protocol niet vooraan zet wordt gezien',
  keurHerkendBovenaan(function (det, tabel) {
    const l = S.plProtocolLijst(det, tabel);
    return l.slice(1).concat(l.slice(0, 1));   // herkende naar achteren
  }, PROTOCOLS), 'bovenste optie is niet het herkende protocol');

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
