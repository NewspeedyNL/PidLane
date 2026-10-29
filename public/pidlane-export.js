// ══════════════════════════════════════════════════════════════════
// pidlane-export.js
// OPSLAAN — één keuze, één huisstijl
// ──────────────────────────────────────────────────────────────────
// WAAROM
// Elk logpad had zijn eigen opslaan-knop en zijn eigen formaat: de testrun
// leverde platte tekst, het logscherm ook, rapporten soms PDF en soms niet.
// Zodra er iemand meekijkt tijdens een test is platte tekst het verkeerde
// antwoord — dan wil je iets dat er verzorgd uitziet zonder dat je het
// achteraf moet overtypen.
//
// Daarom: `plOpslaan()` vraagt eerst wat je wilt, en maakt in beide gevallen
// hetzelfde bestand met dezelfde kop. Tekst voor jezelf en voor mij, PDF voor
// als er een klant of collega naast je staat.
//
// DE PDF
// Gebouwd met jsPDF, dezelfde bibliotheek die het AI-rapport al gebruikt, en
// bewust met dezelfde kopband: blauwe balk, PidLane-logo, voertuigblok,
// paginanummers. Zo hoort alles wat de app uitspuugt bij elkaar.
//
// Monospace voor de inhoud, want deze logs bevatten uitgelijnde kolommen en
// ruwe hex. Statuswoorden krijgen kleur (ok groen, FOUT rood, LET OP oranje)
// zodat een lezer die het bestand voor het eerst ziet meteen weet waar hij
// moet kijken.
// ══════════════════════════════════════════════════════════════════
(function () {
'use strict';

// ── jsPDF ophalen ──────────────────────────────────────────────────
// Staat hij al klaar (het AI-rapport laadt hem ook), dan hergebruiken we die.
// Internet nodig bij de eerste keer; daarom valt de PDF-knop netjes terug op
// tekst als het laden mislukt in plaats van stil te blijven hangen.
async function _laadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  await new Promise(function (res, rej) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = res;
    s.onerror = function () { rej(new Error('PDF-bibliotheek laden mislukt — internet nodig')); };
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

// jsPDF's standaardletters (helvetica, courier) kennen alleen WinAnsi
// (cp1252). Alles daarbuiten wordt geen blokje maar een ánder teken: het
// minteken U+2212 kwam in het onderzoeksrapport van 29-10-2026 als " uit
// de PDF, op elke regel tegenbewijs. Eerst vertalen wat betekenis draagt,
// dan weg wat overblijft — één plek voor élke PDF (ook PLRapport.pdf).
const _PDF_VERTAAL = { '\u2212': '-', '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2015': '-', '\u2264': '<=', '\u2265': '>=',
  '\u2192': '->', '\u2190': '<-', '\u21AA': '->', '\u21D2': '=>', '\u2194': '<->', '\u2248': '~', '\u2260': '!=',
  '\u25B2': '+', '\u25BC': '-', '\u2713': 'v', '\u2714': 'v', '\u2717': 'x', '\u2718': 'x', '\u2715': 'x', '\u2716': 'x',
  '\u03BB': 'lambda', '\u0394': 'delta', '\u2103': '°C', '\u2009': ' ', '\u202F': ' ', '\u200B': '' };
const _WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function plPdfTekst(t) {
  let uit = '';
  for (const c of String(t == null ? '' : t)) {
    if (_PDF_VERTAAL[c] !== undefined) { uit += _PDF_VERTAAL[c]; continue; }
    const n = c.codePointAt(0);
    if (n === 9 || n === 10 || (n >= 0x20 && n <= 0x7E) || (n >= 0xA0 && n <= 0xFF) || _WINANSI_EXTRA.indexOf(c) >= 0) uit += c;
    // de rest (emoji, kaderlijnen buiten de tabel hieronder) valt weg
  }
  return uit;
}

function _schoon(t) {
  return plPdfTekst(String(t == null ? '' : t)
    .replace(/[═─━│┌┐└┘·•]/g, function (c) { return (c === '·' || c === '•') ? '-' : (c === '│' ? '|' : '-'); })
    .replace(/\*\*/g, ''));
}

// ── de keuring: is dit deelbaar? ───────────────────────────────────
// Een rapport gaat naar een klant, een garage, een koper. Wat daar niet in
// hoort is geen opmaakvraag maar een datafout: "NaN V", "undefined", een
// grens van 0 tot 0 die als oordeel wordt gepresenteerd. Zo'n rapport wordt
// niet gemaakt — beter geen PDF dan een PDF die de klant laat twijfelen aan
// alles wat er wél klopt (Mazda 5, 29-10-2026). Ruwe logs (testrun,
// logboek) zijn diagnose voor ons en worden alleen op leegte gekeurd.
const _KEURING = [
  { re: /\b(NaN|undefined|Infinity)\b/, waarom: 'een waarde die niet berekend kon worden' },
  { re: /\[object [A-Za-z]+\]/, waarom: 'een programmaobject in plaats van tekst' },
  { re: /(?:^|[\s:=(])null(?:\s?(?:V|%|°C|km|tpm|kPa|g\/s)\b|\s*$)/, waarom: 'een lege meetwaarde' },
  { re: /grens (-?\d+(?:[.,]\d+)?)\s?[–-]\s?\1(?![\d.,])/, waarom: 'een grens zonder venster (van X tot X) als oordeel' }
];
function plKeurExport(tekst, opties) {
  const o = opties || {};
  const regels = String(tekst == null ? '' : tekst).split('\n');
  const redenen = [];
  if (regels.filter(function (r) { return /[A-Za-z0-9]/.test(r); }).length < 2) redenen.push({ waarom: 'het rapport is leeg', regel: '' });
  if (!o.ruw) regels.forEach(function (r, i) {
    _KEURING.forEach(function (k) { if (k.re.test(r)) redenen.push({ waarom: k.waarom, regel: r.trim(), nr: i + 1 }); });
  });
  return { ok: !redenen.length, redenen: redenen };
}
function _keuringTekst(k) {
  return 'Dit rapport is niet deelbaar: ' + k.redenen.slice(0, 3).map(function (r) {
    return r.waarom + (r.regel ? ' ("' + r.regel.slice(0, 60) + '")' : '');
  }).join('; ') + (k.redenen.length > 3 ? ' en nog ' + (k.redenen.length - 3) : '') + '.';
}

function _voertuigRegels() {
  const v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) ? vehicleInfo : {};
  const uit = [];
  const naam = [v.merk, v.model, (v.year || v.bouwjaar) ? '(' + (v.year || v.bouwjaar) + ')' : ''].filter(Boolean).join(' ').trim();
  if (naam) uit.push(['Voertuig', naam]);
  if (v.brandstof) uit.push(['Brandstof', v.brandstof]);
  if (v.vin) uit.push(['VIN', v.vin]);
  try { const k = localStorage.getItem('pl_kenteken'); if (k) uit.push(['Kenteken', k]); } catch(e){ /* stil: opslag kan leeg of corrupt zijn */ }
  try { if (typeof activePIDs !== 'undefined') uit.push(['Sensoren', activePIDs.size + ' actief']); } catch(e){ /* stil: activePIDs kan nog niet bestaan bij export vóór een sessie */ }
  return uit;
}

// ── de PDF ─────────────────────────────────────────────────────────
async function plMaakPdf(bestandsnaam, tekst, opties) {
  const o = opties || {};
  const k = plKeurExport(tekst, o);
  if (!k.ok) throw new Error(_keuringTekst(k));
  const jsPDF = await _laadJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const W = 210, H = 297, M = 15, CW = W - 2 * M;
  const BLAUW = [26, 111, 255], DONKER = [26, 32, 44], GRIJS = [113, 128, 150], LICHT = [237, 242, 247];
  const GROEN = [22, 128, 61], ROOD = [190, 30, 45], ORANJE = [180, 95, 6];

  function kopband() {
    doc.setFillColor(BLAUW[0], BLAUW[1], BLAUW[2]); doc.rect(0, 0, W, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('PidLane', M, 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Your car talks. We translate.', M, 19);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(_schoon(o.titel || 'Rapport').toUpperCase(), W - M, 13, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(new Date().toLocaleString('nl-NL'), W - M, 19, { align: 'right' });
  }

  kopband();
  let y = 38;

  // Voertuigblok
  const meta = _voertuigRegels();
  if (meta.length) {
    doc.setFillColor(LICHT[0], LICHT[1], LICHT[2]);
    doc.roundedRect(M, y, CW, 8 + meta.length * 6, 2, 2, 'F');
    let my = y + 7;
    meta.forEach(function (r) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.setTextColor(GRIJS[0], GRIJS[1], GRIJS[2]);
      doc.text(String(r[0]).toUpperCase(), M + 5, my);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(DONKER[0], DONKER[1], DONKER[2]);
      doc.text(_schoon(r[1]), M + 45, my);
      my += 6;
    });
    y = my + 6;
  }

  // De opmerking van de gebruiker, in een eigen kader. Bewust vóór de
  // ondertitel en de inhoud: dit is wat de lezer als eerste moet weten over
  // deze meting — welke rit het was, wat eraan opviel.
  if (o.opmerking) {
    const rgls = doc.splitTextToSize(_schoon(o.opmerking), W - 2 * M - 10);
    const hoogte = rgls.length * 4.6 + 10;
    doc.setFillColor(247, 249, 252);
    doc.setDrawColor(LICHT[0], LICHT[1], LICHT[2]);
    doc.roundedRect(M, y, W - 2 * M, hoogte, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.setTextColor(GRIJS[0], GRIJS[1], GRIJS[2]);
    doc.text('OPMERKING', M + 5, y + 5.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.setTextColor(DONKER[0], DONKER[1], DONKER[2]);
    let oy = y + 11;
    rgls.forEach(function (r) { doc.text(r, M + 5, oy); oy += 4.6; });
    y += hoogte + 6;
  }

  if (o.ondertitel) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.setTextColor(DONKER[0], DONKER[1], DONKER[2]);
    doc.text(_schoon(o.ondertitel), M, y); y += 7;
  }

  // Twee soorten inhoud. Een log (testrun, logboek) leunt op uitlijning en
  // blijft monospace. Een rapport met === KOPPEN === (onderzoek, foutcodes,
  // garage) is voor een klant: proportionele letter, echte kopjes, labels
  // in kleur en tegenbewijs als opsomming. Het onderzoeksrapport van
  // 29-10-2026 stond als courier-dump met "=== CONCLUSIE ===" erin.
  const proza = o.proza != null ? !!o.proza : /^=== .+ ===\s*$/m.test(String(tekst || ''));
  const regels = String(tekst || '').split('\n');
  const nieuweBlz = function () { doc.addPage(); kopband(); y = 38; };
  if (proza) _proza(); else _log();

  function _log() {
    doc.setFont('courier', 'normal'); doc.setFontSize(8);
    const regelH = 3.9;
    for (let i = 0; i < regels.length; i++) {
      const ruw = _schoon(regels[i]).replace(/\t/g, '  ');

      if (y > H - 20) { nieuweBlz(); doc.setFont('courier', 'normal'); doc.setFontSize(8); }

      // Scheidingslijnen tekenen in plaats van uitschrijven: veel netter dan een
      // rij streepjes in courier.
      if (/^-{10,}$/.test(ruw.trim())) {
        doc.setDrawColor(LICHT[0], LICHT[1], LICHT[2]);
        doc.line(M, y - 1.2, W - M, y - 1.2);
        y += 2.2;
        continue;
      }

      // Kopjes: HOOFDLETTERREGELS zonder tijdstempel.
      if (/^[A-Z0-9 —·\-]{6,}$/.test(ruw.trim()) && !/^\[/.test(ruw.trim())) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        doc.setTextColor(BLAUW[0], BLAUW[1], BLAUW[2]);
        doc.text(ruw.trim(), M, y);
        doc.setFont('courier', 'normal'); doc.setFontSize(8);
        y += 5.2;
        continue;
      }

      // Statuskleur: de lezer moet in één oogopslag de rode regels zien.
      if (/\bFOUT\b|\bGEWEIGERD\b|SYNTAXFOUT/.test(ruw)) doc.setTextColor(ROOD[0], ROOD[1], ROOD[2]);
      else if (/LET OP|LETOP|\bwarn\b/.test(ruw)) doc.setTextColor(ORANJE[0], ORANJE[1], ORANJE[2]);
      else if (/\bok\b/.test(ruw)) doc.setTextColor(GROEN[0], GROEN[1], GROEN[2]);
      else doc.setTextColor(DONKER[0], DONKER[1], DONKER[2]);

      // Lange regels (ruwe JSON uit de busstatistiek) afbreken in plaats van
      // over de rand laten lopen.
      const stukken = doc.splitTextToSize(ruw, CW);
      for (let j = 0; j < stukken.length; j++) {
        if (y > H - 20) { nieuweBlz(); doc.setFont('courier', 'normal'); doc.setFontSize(8); }
        doc.text(stukken[j], M, y);
        y += regelH;
      }
    }
  }

  function _proza() {
    const LABELS = { 'let op': ORANJE, 'bevestigd': ROOD, 'waarschijnlijk': ORANJE, 'gezakt': ROOD, 'krap': ORANJE, 'ok': GROEN, 'onzeker': GRIJS };
    const regelH = 4.5;
    const breed = function (t) { return typeof doc.getTextWidth === 'function' ? doc.getTextWidth(t) : t.length * 1.7; };
    // Eén alinea met inspringing, afgebroken op de breedte die overblijft.
    function alinea(t, x, kleur, stijl) {
      doc.setFont('helvetica', stijl || 'normal'); doc.setFontSize(9.5);
      doc.setTextColor(kleur[0], kleur[1], kleur[2]);
      const stukken = doc.splitTextToSize(t, W - M - x);
      for (let j = 0; j < stukken.length; j++) {
        if (y > H - 20) nieuweBlz();
        doc.setFont('helvetica', stijl || 'normal'); doc.setFontSize(9.5);
        doc.setTextColor(kleur[0], kleur[1], kleur[2]);
        doc.text(stukken[j], x, y);
        y += regelH;
      }
    }
    let eersteKop = false;
    for (let i = 0; i < regels.length; i++) {
      const ruw = _schoon(regels[i]).replace(/\t/g, '  ');
      const kaal = ruw.trim();
      const inspring = M + Math.min(12, (ruw.length - ruw.replace(/^ +/, '').length) * 1.3);
      if (!kaal) { y += 2; continue; }
      if (y > H - 20) nieuweBlz();

      // Vóór de eerste kop: de titel en de gegevens van de meting. Wat de
      // kopband en het voertuigblok al zeggen niet nog eens.
      if (!eersteKop) {
        if (/^=== /.test(kaal)) eersteKop = true;
        else {
          if (i === 0 && /^PidLane\b/.test(kaal)) continue;
          const kv = /^([A-Z][^:]{1,30}):\s+(.+)$/.exec(kaal);
          if (kv && /^voertuig$/i.test(kv[1]) && meta.length) continue;
          if (kv) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
            doc.setTextColor(GRIJS[0], GRIJS[1], GRIJS[2]);
            doc.text(kv[1].toUpperCase(), M + 5, y);   // lijnt uit met het voertuigblok
            alinea(kv[2], M + 45, DONKER);
            continue;
          }
          alinea(kaal, M, DONKER, i === 0 ? 'bold' : 'normal');
          continue;
        }
      }

      const kop = /^=== (.+) ===$/.exec(kaal);
      if (kop) {
        if (y > H - 34) nieuweBlz();          // geen kop als laatste regel van een bladzijde
        y += 3;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
        doc.setTextColor(BLAUW[0], BLAUW[1], BLAUW[2]);
        doc.text(kop[1].trim(), M, y);
        doc.setDrawColor(BLAUW[0], BLAUW[1], BLAUW[2]);
        doc.line(M, y + 1.6, W - M, y + 1.6);
        y += 7;
        continue;
      }

      // [label] tekst: het label in zijn kleur, vet, dan de tekst.
      const lab = /^\[([A-Za-z ]+)\]\s*(.*)$/.exec(kaal);
      if (lab && LABELS[lab[1].toLowerCase()]) {
        const kl = LABELS[lab[1].toLowerCase()], woord = lab[1].toUpperCase();
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.setTextColor(kl[0], kl[1], kl[2]);
        doc.text(woord, inspring, y);
        const x = inspring + Math.max(breed(woord) + 2.5, 16);
        alinea(lab[2], x, DONKER, lab[1].toLowerCase() === 'bevestigd' || lab[1].toLowerCase() === 'waarschijnlijk' ? 'bold' : 'normal');
        continue;
      }

      // Verloop zonder oordeel (· in de bron): grijs, schuin.
      if (/^[·•]\s/.test(String(regels[i]).trim())) { alinea(kaal.replace(/^-\s+/, ''), inspring, GRIJS, 'italic'); continue; }

      // Bewijs: + wijst naar een fout, - spreekt hem tegen.
      const bw = /^([+-])\s+(.*)$/.exec(kaal);
      if (bw) {
        const kl = bw[1] === '+' ? ORANJE : GROEN;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        doc.setTextColor(kl[0], kl[1], kl[2]);
        doc.text(bw[1] === '+' ? '+' : '-', inspring, y);
        alinea(bw[2], inspring + 4, DONKER);
        continue;
      }

      // Genummerde stap: het nummer vet.
      const nr = /^(\d+\.)\s+(.*)$/.exec(kaal);
      if (nr) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        doc.setTextColor(BLAUW[0], BLAUW[1], BLAUW[2]);
        doc.text(nr[1], inspring, y);
        alinea(nr[2], inspring + 7, DONKER, 'bold');
        continue;
      }

      alinea(kaal, inspring, /^(-|vervolg:)/.test(kaal) ? GRIJS : DONKER);
    }
    // De grens van het instrument, onderaan elk klantrapport.
    y += 4;
    alinea('Dit rapport is gemaakt via de diagnosepoort (OBD) en is zo goed als wat de auto daar laat zien. Het vervangt geen onderzoek in de werkplaats.', M, GRIJS, 'italic');
  }

  // Voettekst met paginanummers, achteraf zodat het totaal bekend is.
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(LICHT[0], LICHT[1], LICHT[2]); doc.line(M, H - 12, W - M, H - 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(GRIJS[0], GRIJS[1], GRIJS[2]);
    doc.text('Gegenereerd door PidLane - ' + new Date().toLocaleString('nl-NL'), M, H - 7);
    doc.text('Pagina ' + p + ' van ' + n, W - M, H - 7, { align: 'right' });
  }

  return doc.output('blob');
}

// ── opslaan zelf ───────────────────────────────────────────────────
async function _bewaar(blob, naam, tekstAlsFallback) {
  // Eén opslagweg (#326, 28-09-2026): dezelfde als download() en de PDF-
  // exports, plBewaarBestand() in pidlane-motortype.js. Die schrijft naar
  // Documenten/PidLane, zet de reden in het logboek als dat mislukt, zegt
  // hem tegen de klant en valt dan terug op het deelvenster. Hier stond een
  // tweede versie die de reden alleen in de console zette.
  try {
    if (typeof plBewaarBestand === 'function' && await plBewaarBestand(blob, naam)) return true;
  } catch(e){ console.warn('Opslaan mislukt:', e); }
  try {
    if (tekstAlsFallback && navigator.clipboard) {
      await navigator.clipboard.writeText(tekstAlsFallback);
      try { showToast('Opslaan mislukt — naar klembord gekopieerd'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
      return true;
    }
  } catch(e){ /* stil: klembord-toegang kan geweigerd worden */ }
  return false;
}

// ── de keuze ───────────────────────────────────────────────────────
// basisnaam zonder extensie; die zetten we er zelf achter.
/* ═══════════════════ DE BESTANDSNAAM ═══════════════════ */
/* #207 — je kunt de naam nu zelf intikken, en dat is precies waarom hier
   iets tussen moet staan. Een naam die een mens typt bevat vroeg of laat een
   schuine streep ("rit 12/9"), een dubbele punt ("meting 10:45") of een
   geplakte regel met een tab erin. Op Android levert dat een bestand op dat
   niet te openen is, en op Windows er helemaal geen.

   Bewust GEEN witte lijst van toegestane tekens: dan sneuvelen é, ü en ø, en
   dat is precies het soort stille verminking waar niemand op bedacht is. Wat
   eruit moet is de korte lijst die bestandssystemen breekt.

   De terugval is de naam die de aanroeper al had. Typt iemand het veld leeg,
   of alleen leestekens, dan krijgt hij het bestand dat hij zonder dit veld
   ook gekregen zou hebben — nooit een bestand met een lege naam. */
function _veiligeNaam(ruw, terugval) {
  var t = String(ruw == null ? '' : ruw).trim();
  // Een zelf getypte extensie eraf, anders wordt het rapport.txt.txt — de
  // knop bepaalt de extensie, niet het veld.
  t = t.replace(/\.(txt|pdf)$/i, '');
  // Padscheiders, de Windows-verbodenlijst en stuurtekens (een geplakte
  // regel draagt een \n mee die je in het veld niet ziet staan).
  t = t.replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '-');
  // Een naam die met een punt begint is op Android een verborgen bestand.
  t = t.replace(/^\.+/, '');
  t = t.replace(/\s+/g, ' ');
  // Punten en spaties aan het eind: Windows kapt die zelf af en dan klopt de
  // naam in de app niet meer met de naam op de schijf.
  t = t.replace(/[. ]+$/, '');
  t = t.slice(0, 80).replace(/[. ]+$/, '').trim();
  // Alleen streepjes over? Dan is er niets bruikbaars getypt.
  if (!/[a-z0-9]/i.test(t)) return terugval;
  return t;
}

// Niet deelbaar: zeggen waarom, en geen bestand. Ook geen tekstbestand als
// uitwijk — dezelfde fout staat daar net zo in.
function _weiger(k) {
  const t = _keuringTekst(k);
  console.warn('Export geweigerd:', k.redenen);
  try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('melding mislukt:', e); }
  return t;
}

function plOpslaan(basisnaam, tekst, opties) {
  const o = opties || {};
  const bestaand = document.getElementById('plExportOv');
  if (bestaand) bestaand.remove();
  const keuring = plKeurExport(tekst, o);
  if (!keuring.ok) { _weiger(keuring); return false; }

  const ov = document.createElement('div');
  ov.id = 'plExportOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(8,11,17,.88);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML =
    '<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:18px;max-width:340px;width:100%">' +
      '<div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:4px">Hoe wil je dit opslaan?</div>' +
      '<div style="font-size:12px;color:var(--tx3);margin-bottom:12px">' + (o.titel || 'Rapport') + '</div>' +
      // Bestandsnaam (#207). Voorgevuld met wat de aanroeper koos, zodat
      // niets doen hetzelfde bestand oplevert als voorheen. De extensie staat
      // er als vast label naast: die volgt uit de knop die je kiest, niet uit
      // wat je hier typt.
      '<div style="font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:4px">Bestandsnaam</div>' +
      '<div style="display:flex;align-items:center;gap:7px;margin-bottom:12px">' +
        '<input id="plExpNaam" type="text" value="' + String(basisnaam).replace(/"/g, '&quot;') + '" ' +
          'style="flex:1;min-width:0;background:var(--sur2);color:var(--tx);border:1px solid var(--bd);' +
          'border-radius:9px;padding:9px 10px;font:600 12px var(--f)">' +
        '<span style="font-size:11px;color:var(--tx3);white-space:nowrap">.txt / .pdf</span>' +
      '</div>' +
      // Het opmerkingveld. Een log zonder context kost aan de andere kant een
      // ronde vragen: was dit stationair of rijdend, wat viel er op, waarom is
      // deze run bewaard. Dat weet je nú, niet meer als je het bestand
      // terugkijkt. Leeg laten mag; dan verandert er niets aan het bestand.
      '<textarea id="plExpOpm" rows="3" placeholder="Wat is dit voor log? Wat viel er op? (mag leeg)" ' +
        'style="width:100%;box-sizing:border-box;background:var(--sur2);color:var(--tx);border:1px solid var(--bd);' +
        'border-radius:9px;padding:9px 10px;font:400 12px var(--f);resize:vertical;margin-bottom:12px"></textarea>' +
      '<button id="plExpPdf" style="width:100%;background:var(--ac);color:#fff;border:0;border-radius:9px;padding:12px;font:700 13px var(--f);cursor:pointer;margin-bottom:8px;text-align:left">' +
        '📕 PDF — nette opmaak<div style="font-weight:400;font-size:11px;opacity:.85;margin-top:2px">Met kopband en voertuiggegevens. Voor als er iemand meekijkt.</div></button>' +
      '<button id="plExpTxt" style="width:100%;background:var(--sur2);color:var(--tx2);border:1px solid var(--bd);border-radius:9px;padding:12px;font:600 13px var(--f);cursor:pointer;text-align:left">' +
        '📄 Tekst — kaal en compleet<div style="font-weight:400;font-size:11px;color:var(--tx3);margin-top:2px">Kleinste bestand, makkelijk door te sturen.</div></button>' +
      '<button id="plExpAf" style="width:100%;background:none;color:var(--tx3);border:0;padding:10px;font:600 12px var(--f);cursor:pointer;margin-top:6px">Annuleren</button>' +
    '</div>';
  document.body.appendChild(ov);

  // Wat er in het veld staat op het moment dat je op een knop drukt. Apart
  // uitgelezen per klik, niet bij het openen: anders mist de laatste zin die
  // je nog intikte voordat je op PDF drukte.
  // Zelfde reden als _opm() hieronder: per klik uitlezen, niet bij het openen.
  // Anders mist de naam die je nog aanpaste voordat je op PDF drukte.
  function _naam() {
    try {
      const el = document.getElementById('plExpNaam');
      return _veiligeNaam(el ? el.value : '', basisnaam);
    } catch (e) { console.warn('bestandsnaam onleesbaar, terugval op de standaard:', e); return basisnaam; }
  }

  function _opm() {
    try {
      const el = document.getElementById('plExpOpm');
      return el ? String(el.value || '').trim() : '';
    } catch (e) { return ''; }
  }

  // In het tekstbestand komt de opmerking bovenaan, vóór de bestaande kop.
  // Zo staat hij in beeld zonder dat de aanroepers hun eigen kop hoeven aan
  // te passen — die vier (archief, logboek, rijsituatie, testrun) leveren de
  // tekst kant-en-klaar aan.
  function _metOpmerking(t, opm) {
    if (!opm) return t;
    const streep = '════════════════════════════════════════════════';
    return 'OPMERKING\n' + streep + '\n' + opm + '\n' + streep + '\n\n' + t;
  }

  const sluit = function () { try { ov.remove(); } catch(e){ /* stil: element kan al weg zijn of ondersteunt dit niet */ } };
  ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
  document.getElementById('plExpAf').onclick = sluit;

  document.getElementById('plExpTxt').onclick = function () {
    const uit = _metOpmerking(tekst, _opm());
    const naam = _naam();
    sluit();
    // _bewaar meldt zelf waar het bestand terecht is gekomen.
    _bewaar(new Blob([uit], { type: 'text/plain;charset=utf-8' }), naam + '.txt', uit);
  };

  document.getElementById('plExpPdf').onclick = async function () {
    const knop = this;
    const opm = _opm();
    const naam = _naam();
    knop.disabled = true;
    knop.innerHTML = '⏳ PDF maken…';
    try {
      const blob = await plMaakPdf(naam + '.pdf', tekst, Object.assign({}, o, { opmerking: opm }));
      sluit();
      await _bewaar(blob, naam + '.pdf', null);
    } catch (e) {
      // Geen internet of bibliotheek stuk: dan is tekst beter dan niets, maar
      // wel zeggen waarom — anders lijkt het of de knop niets doet.
      sluit();
      try { showToast('PDF lukte niet (' + (e.message || e) + ') — als tekst opgeslagen'); } catch(e2){ /* stil: melding mag nooit de stroom breken */ }
      const uit = _metOpmerking(tekst, opm);
      await _bewaar(new Blob([uit], { type: 'text/plain;charset=utf-8' }), naam + '.txt', uit);
    }
  };
}

// Rechtstreeks als PDF, zonder de keuze tekst/PDF ervoor (Mijn voertuigen →
// rapport → 📕 PDF). Zelfde opmaak en dezelfde uitgang als de PDF-knop hierboven.
async function plOpslaanPdf(basisnaam, tekst, opties) {
  const naam = _veiligeNaam(basisnaam, 'PidLane-rapport');
  const keuring = plKeurExport(tekst, opties);
  if (!keuring.ok) { _weiger(keuring); return false; }
  const blob = await plMaakPdf(naam + '.pdf', tekst, opties || {});
  await _bewaar(blob, naam + '.pdf', null);
}

window.plOpslaan = plOpslaan;
window.plOpslaanPdf = plOpslaanPdf;
window.plMaakPdf = plMaakPdf;
window.plKeurExport = plKeurExport;
window.plPdfTekst = plPdfTekst;
// Los ontsloten zodat test-export.js de schoonmaak op de echte functie kan
// toetsen in plaats van op een kopie ervan.
window._plVeiligeNaam = _veiligeNaam;

})();
