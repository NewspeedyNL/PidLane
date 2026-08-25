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

// Emoji en opmaaktekens eruit: jsPDF's standaardlettertypes kennen ze niet en
// maken er blokjes van.
function _schoon(t) {
  return String(t == null ? '' : t)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2100}-\u{214F}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[═─━│┌┐└┘·•]/g, function (c) { return (c === '·' || c === '•') ? '-' : (c === '│' ? '|' : '-'); })
    .replace(/\*\*/g, '');
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

  // Inhoud, regel voor regel. Monospace omdat deze logs op uitlijning leunen.
  doc.setFont('courier', 'normal'); doc.setFontSize(8);
  const regels = String(tekst || '').split('\n');
  const regelH = 3.9;

  for (let i = 0; i < regels.length; i++) {
    const ruw = _schoon(regels[i]).replace(/\t/g, '  ');

    if (y > H - 20) { doc.addPage(); kopband(); y = 38; doc.setFont('courier', 'normal'); doc.setFontSize(8); }

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
      if (y > H - 20) { doc.addPage(); kopband(); y = 38; doc.setFont('courier', 'normal'); doc.setFontSize(8); }
      doc.text(stukken[j], M, y);
      y += regelH;
    }
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
  try {
    if (typeof nativeShareFile === 'function' && await nativeShareFile(blob, naam)) return true;
  } catch(e){ console.warn('nativeShareFile mislukt:', e); }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = naam;
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch(e){ /* stil: element kan al weg zijn */ } }, 1500);
    return true;
  } catch(e){ /* stil: element kan al weg zijn of ondersteunt dit niet */ }
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
function plOpslaan(basisnaam, tekst, opties) {
  const o = opties || {};
  const bestaand = document.getElementById('plExportOv');
  if (bestaand) bestaand.remove();

  const ov = document.createElement('div');
  ov.id = 'plExportOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(8,11,17,.88);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML =
    '<div style="background:var(--sur);border:1px solid var(--bd);border-radius:14px;padding:18px;max-width:340px;width:100%">' +
      '<div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:4px">Hoe wil je dit opslaan?</div>' +
      '<div style="font-size:12px;color:var(--tx3);margin-bottom:12px">' + (o.titel || 'Rapport') + '</div>' +
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
    sluit();
    _bewaar(new Blob([uit], { type: 'text/plain;charset=utf-8' }), basisnaam + '.txt', uit)
      .then(function (ok) { if (ok) { try { showToast('Opgeslagen: ' + basisnaam + '.txt'); } catch(e){ /* stil: melding mag nooit de stroom breken */ } } });
  };

  document.getElementById('plExpPdf').onclick = async function () {
    const knop = this;
    const opm = _opm();
    knop.disabled = true;
    knop.innerHTML = '⏳ PDF maken…';
    try {
      const blob = await plMaakPdf(basisnaam + '.pdf', tekst, Object.assign({}, o, { opmerking: opm }));
      sluit();
      const ok = await _bewaar(blob, basisnaam + '.pdf', null);
      if (ok) { try { showToast('Opgeslagen: ' + basisnaam + '.pdf'); } catch(e){ /* stil: melding mag nooit de stroom breken */ } }
    } catch (e) {
      // Geen internet of bibliotheek stuk: dan is tekst beter dan niets, maar
      // wel zeggen waarom — anders lijkt het of de knop niets doet.
      sluit();
      try { showToast('PDF lukte niet (' + (e.message || e) + ') — als tekst opgeslagen'); } catch(e2){ /* stil: melding mag nooit de stroom breken */ }
      const uit = _metOpmerking(tekst, opm);
      await _bewaar(new Blob([uit], { type: 'text/plain;charset=utf-8' }), basisnaam + '.txt', uit);
    }
  };
}

window.plOpslaan = plOpslaan;
window.plMaakPdf = plMaakPdf;

})();
