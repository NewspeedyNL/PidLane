// ══════════════════════════════════════════════════════════════════
// pidlane-rapport.js — PLRapport: één analyserapport, altijd dezelfde opbouw
// (07-10-2026)
// ══════════════════════════════════════════════════════════════════
// Tot nu toe was de PDF van een analyse de AI-tekst, regel voor regel onder
// een blauwe kop gezet. Elke analyse gaf de AI andere koppen, dus elk rapport
// zag er anders uit, en wat de app zelf gemeten had (het verzamelscherm, de
// samenhang, de foutcodes) stond er niet in — alleen een momentopname.
//
// NU: vaste secties, in de volgorde van het onderzoek (keuze van 07-10):
//   voorblad (met "In het kort") · 1 autokennis · 2 probleemstelling ·
//   3 staat van het voertuig · 4 plan van aanpak en testplan ·
//   5 uitvoering en metingen (met grafieken) · 6 hypothesen en bewijs ·
//   7 conclusie en aanbevelingen · 8 disclaimer en grenzen ·
//   bijlage A meetdata per sensor · bijlage B de volledige AI-toelichting
//
// WIE WAT LEVERT. Elk getal, elke tabel en elk stoplicht maakt de app uit de
// meting zelf. De AI levert alleen de woorden: probleem, aanpak, hypothesen
// met bewijs, conclusie, advies — in een vast <rapport>-blok (instructie()).
// Zo kan de AI geen meetwaarde in een tabel zetten die er niet was. Ontbreekt
// het blok (een oudere route, een afgebroken antwoord), dan haalt leesAI() de
// conclusie en het advies uit de bekende koppen van de tekst, en zegt het
// rapport dat erbij.
//
// LEEG IS NIET GOED. Een sectie zonder data krijgt "niet gemeten" met de
// reden; een systeem zonder sensoren is grijs, nooit groen.
//
// Puur en getoetst: leesAI, model, grafiekData (test-rapport.js). De PDF zelf
// (pdf) tekent het model; uitApp() haalt het uit de app.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Een meting hoort bij een rapport als hij er vlak vóór verzameld is.
  const VERS_MS = 30 * 60000;
  const MAX_GRAFIEK = 8;
  const MAX_PUNTEN = 300;
  // Sensoren die de toestand van de motor bepalen (PLSamenhang.toestandOp)
  // gaan altijd mee in de meting, ook als ze niet in de samenvatting staan.
  const TOESTAND_PIDS = ['010C', '010D', '0105', '0104', '0103'];
  // Na de opvallende sensoren: deze laten het verloop van de motor het best zien.
  const GRAFIEK_VOORKEUR = ['010C', '010D', '0105', '0106', '0107', '0142', '0104', '0110', '0114', '0115'];

  const STATUS_KLEUR = { afwijkend: 'rood', let: 'oranje', meetfout: 'grijs', twijfel: 'grijs', ok: 'groen', nodata: 'grijs' };
  const STATUS_TEKST = { afwijkend: 'afwijkend', let: 'let op', meetfout: 'meetfout', twijfel: 'twijfel', ok: 'normaal', nodata: 'geen data' };
  const ERNST = { afwijkend: 4, let: 3, meetfout: 2, twijfel: 2, ok: 1, nodata: 0 };
  const SYSTEEM = { Motor: 'Motor', Brandstof: 'Brandstofsysteem', Emissie: 'Emissie en lambda', Temp: 'Koeling en temperaturen',
                    Temperatuur: 'Koeling en temperaturen', Electrisch: 'Elektrisch systeem', Rijden: 'Rijden en aandrijving' };
  const UITKOMST = { bevestigd: 'bevestigd', waarschijnlijk: 'waarschijnlijk', onwaarschijnlijk: 'onwaarschijnlijk',
                     uitgesloten: 'uitgesloten', open: 'niet te beoordelen' };
  const UITKOMST_KLEUR = { bevestigd: 'rood', waarschijnlijk: 'oranje', onwaarschijnlijk: 'groen', uitgesloten: 'groen', open: 'grijs' };
  const URGENTIE = { direct: 'direct', binnenkort: 'binnenkort', later: 'bij gelegenheid' };
  const URGENTIE_KLEUR = { direct: 'rood', binnenkort: 'oranje', later: 'groen' };
  const KORT = {
    groen: 'Geen urgente problemen gevonden',
    oranje: 'Let op — niet direct kritiek',
    rood: 'Aandacht vereist — laat dit nakijken',
    grijs: 'Geen oordeel'
  };
  const PROMO = 'PidLane leest je auto uit via de OBD-aansluiting en legt in gewone taal uit wat de sensoren zeggen: ' +
    'live meten, foutcodes lezen, ritten vastleggen en analyses zoals deze. Meer op pidlane.nl.';

  const getal = v => typeof v === 'number' && isFinite(v);
  const tekst = v => (v === null || v === undefined) ? '' : String(v).trim();

  function fmt(v) {
    if (!getal(v)) return '–';
    const a = Math.abs(v);
    const r = a >= 100 ? Math.round(v) : a >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
    return String(r).replace('.', ',');
  }
  function duur(sec) {
    if (!getal(sec)) return 'onbekend';
    const s = Math.round(sec), m = Math.floor(s / 60);
    return m ? m + ':' + String(s % 60).padStart(2, '0') + ' min' : s + ' s';
  }

  // ── WAT DE AI LEVERT ───────────────────────────────────────────────
  /* Achter elke rapportprompt. Het blok komt aan het eind, zodat een
     afgebroken antwoord de leesbare tekst niet kost. */
  function instructie() {
    return '\n\nSLUIT AF MET HET RAPPORTBLOK. Zet na je antwoord een blok tussen <rapport> en </rapport> met uitsluitend geldige JSON. ' +
      'De app bouwt daarmee een vast PDF-rapport; tabellen, meetwaarden en grafieken maakt de app zelf uit de meting, dus herhaal die niet. Vorm:\n' +
      '<rapport>{"probleem":"de vraag of klacht, in één of twee zinnen","aanpak":"hoe je de meting hebt gelezen en waarom zo, twee à drie zinnen",' +
      '"hypothesen":[{"naam":"mogelijke oorzaak","uitkomst":"bevestigd|waarschijnlijk|onwaarschijnlijk|uitgesloten|open","voor":["feit uit de meting, met de waarde"],"tegen":["feit uit de meting, met de waarde"]}],' +
      '"conclusie":"drie à vijf zinnen","advies":[{"wat":"concrete stap","urgentie":"direct|binnenkort|later"}],' +
      '"nameten":["wat een monteur nog moet meten om het zeker te weten"],"oordeel":"groen|oranje|rood"}</rapport>\n' +
      'Regels voor het blok: voor en tegen zijn feiten uit déze meting, geen algemene kennis; "open" als de meting het niet kan beslissen; ' +
      'geen getallen die niet in de data staan; geen prijzen; hoogstens 5 hypothesen en 6 adviezen; ' +
      'oordeel rood alleen voor iets dat niet kan wachten (veiligheid, of schade bij doorrijden).';
  }

  function zonderBlok(text) {
    // Afgebroken (geen </rapport>): tot de eerste lege regel, zodat de
    // disclaimer die _withDisclaimer() erachter zet blijft staan.
    return String(text == null ? '' : text).replace(/<rapport>[\s\S]*?(<\/rapport>|\n\s*\n|$)/i, '').replace(/\s+$/, '');
  }

  function jsonUit(s) {
    const t = String(s).replace(/```(?:json)?/gi, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('geen JSON-object in het rapportblok');
    return t.slice(a, b + 1);
  }
  function lijst(a, max) {
    return (Array.isArray(a) ? a : (a ? [a] : [])).map(tekst).filter(Boolean).slice(0, max || 8);
  }
  function normaliseer(j) {
    j = j || {};
    const hyp = (Array.isArray(j.hypothesen) ? j.hypothesen : []).slice(0, 5).map(h => ({
      naam: tekst(h && h.naam) || 'onbenoemde oorzaak',
      uitkomst: UITKOMST[tekst(h && h.uitkomst).toLowerCase()] ? tekst(h.uitkomst).toLowerCase() : 'open',
      voor: lijst(h && h.voor, 6), tegen: lijst(h && h.tegen, 6)
    }));
    const adv = (Array.isArray(j.advies) ? j.advies : []).slice(0, 6).map(a => {
      if (typeof a === 'string') return { wat: tekst(a), urgentie: null };
      const u = tekst(a && a.urgentie).toLowerCase();
      return { wat: tekst(a && a.wat), urgentie: URGENTIE[u] ? u : null };
    }).filter(a => a.wat);
    const o = tekst(j.oordeel).toLowerCase();
    return { bron: 'blok', probleem: tekst(j.probleem), aanpak: tekst(j.aanpak), hypothesen: hyp,
             conclusie: tekst(j.conclusie), advies: adv, nameten: lijst(j.nameten, 6),
             oordeel: (o === 'groen' || o === 'oranje' || o === 'rood') ? o : null };
  }

  /* Geen blok: conclusie en advies uit de koppen die de routes al vragen. */
  const KOP_CONCLUSIE = ['WAARSCHIJNLIJKE OORZAAK', 'MOGELIJKE OORZAAK', 'SAMENVATTING', 'CONCLUSIE', 'HUIDIGE SITUATIE', 'SYSTEEMSTATUS', 'DATA-OORDEEL'];
  const KOP_ADVIES = ['AANBEVOLEN VERVOLGONDERZOEK', 'PRIORITEIT ACTIES', 'ADVIES', 'ONDERHOUDSADVIES', 'REPARATIE STAPPEN'];
  function koppen(text) {
    const regels = String(text).split('\n'), uit = {};
    let huidig = null;
    regels.forEach(r => {
      const kaal = r.replace(/[#*]/g, '').replace(/:\s*$/, '').trim().toUpperCase();
      if (kaal && KOP_CONCLUSIE.concat(KOP_ADVIES).indexOf(kaal) >= 0) { huidig = kaal; uit[huidig] = []; return; }
      // Een andere kop in hoofdletters sluit de sectie af.
      if (kaal && kaal.length >= 4 && kaal === r.replace(/[#*:]/g, '').trim() && /^[A-ZÀ-Ý \-?]+$/.test(kaal)) { huidig = null; return; }
      if (huidig) uit[huidig].push(r);
    });
    return uit;
  }
  function uitKoppen(text) {
    const k = koppen(text);
    const eerste = lijstKoppen => { for (const n of lijstKoppen) if (k[n] && k[n].join('').trim()) return k[n]; return null; };
    const c = eerste(KOP_CONCLUSIE), a = eerste(KOP_ADVIES);
    const schoon = r => r.replace(/^[\s\-•*\d.)]+/, '').replace(/\*\*/g, '').trim();
    // Een tabelregel (met |) is geen conclusie: die staat in bijlage B.
    const conclusie = c ? c.filter(r => r.indexOf('|') < 0).map(schoon).filter(Boolean).join(' ') : '';
    const advies = a ? a.map(schoon).filter(r => r && r.indexOf('|') < 0).slice(0, 6).map(w => ({ wat: w, urgentie: null })) : [];
    return { bron: 'tekst', probleem: '', aanpak: '', hypothesen: [], conclusie, advies, nameten: [], oordeel: null };
  }

  /* {velden, rest, fout}. rest = de tekst zonder blok (bijlage B). */
  function leesAI(text) {
    const t = String(text == null ? '' : text);
    const m = t.match(/<rapport>([\s\S]*?)<\/rapport>/i);
    const rest = zonderBlok(t).trim();
    let velden = null, fout = '';
    if (m) {
      try { velden = normaliseer(JSON.parse(jsonUit(m[1]))); }
      catch (e) { fout = 'het rapportblok van de AI was geen geldige JSON (' + ((e && e.message) || e) + ')'; console.warn('PLRapport: ' + fout); }
    } else if (/<rapport>/i.test(t)) fout = 'het rapportblok van de AI was afgebroken';
    if (!velden) velden = uitKoppen(rest);
    return { velden, rest, fout };
  }

  // ── GRAFIEK ────────────────────────────────────────────────────────
  /* Een sensor als lijn over de tijd, genormaliseerd (0..1), met de grenzen
     uit de PID-definitie en de toestanden van de motor als banden.
     toestanden = {t:[ms], label:[toestand]} of null. Puur. */
  function grafiekData(hist, pid, def, toestanden) {
    const d = def || {};
    const reeks = ((hist || {})[pid] || []).filter(m => m && getal(m.t) && getal(m.v)).slice().sort((a, b) => a.t - b.t);
    if (reeks.length < 3) return null;
    const t0 = reeks[0].t, t1 = reeks[reeks.length - 1].t;
    if (!(t1 > t0)) return null;
    const vals = reeks.map(m => m.v);
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const span = Math.max(hi - lo, Math.abs(hi) * 0.05, 1);
    // Een grens die ver buiten de meting ligt, drukt de lijn plat: alleen
    // tonen wat binnen één meetbreedte van de meting valt.
    const grenzen = [['dH', 'alarm'], ['wH', 'waarschuwing'], ['wL', 'waarschuwing'], ['dL', 'alarm']]
      .filter(g => getal(d[g[0]]) && d[g[0]] >= lo - span && d[g[0]] <= hi + span)
      .map(g => ({ waarde: d[g[0]], soort: g[1] }));
    const alle = vals.concat(grenzen.map(g => g.waarde));
    let ylo = Math.min.apply(null, alle), yhi = Math.max.apply(null, alle);
    if (yhi === ylo) { ylo -= 1; yhi += 1; }
    const pad = (yhi - ylo) * 0.08; ylo -= pad; yhi += pad;
    const x = t => (t - t0) / (t1 - t0), y = v => (v - ylo) / (yhi - ylo);
    const stap = Math.max(1, Math.ceil(reeks.length / MAX_PUNTEN));
    const punten = reeks.filter((_, i) => i % stap === 0 || i === reeks.length - 1).map(m => [x(m.t), y(m.v)]);
    const banden = [];
    if (toestanden && toestanden.t && toestanden.t.length) {
      let van = null, huidig = null;
      toestanden.t.forEach((tt, i) => {
        const l = toestanden.label[i];
        if (l !== huidig) { if (huidig !== null) banden.push({ van, tot: tt, toestand: huidig }); huidig = l; van = tt; }
      });
      if (huidig !== null) banden.push({ van, tot: toestanden.t[toestanden.t.length - 1], toestand: huidig });
    }
    return {
      pid, naam: d.name || pid, eenheid: d.unit || '', min: lo, max: hi, ylo, yhi, duurS: (t1 - t0) / 1000, punten,
      grenzen: grenzen.map(g => ({ y: y(g.waarde), waarde: g.waarde, soort: g.soort })),
      banden: banden.map(b => ({ van: Math.max(0, x(b.van)), tot: Math.min(1, x(b.tot)), toestand: b.toestand }))
        .filter(b => b.tot > b.van)
    };
  }

  function toestandenUit(hist, S, grens) {
    if (!S || !S.tijdlijn || !S.toestandOp || !grens) return null;
    const tl = S.tijdlijn(hist || {});
    if (!tl) return null;
    return { t: tl.t, label: tl.t.map((_, i) => S.toestandOp(tl, i, grens)) };
  }

  // ── HET MODEL ──────────────────────────────────────────────────────
  /* ctx (uitApp() of een test):
       ts, titel, voertuig {merk, model, year, motor, brandstof, vin},
       garage {kent, kmstand, apk_tot, motor, vermogen_kw, bouwjaar}, kenteken,
       recall {tekst, open:[{code, omschrijving, risico}]},
       dtc {gelezen, bevestigd, pending, permanent} of null,
       readiness {ondersteund, nietKlaar, mil} of null,
       meting {sam, sec, rijSec, beperkt, bron, hist, watVoor, klacht, eisNaam} of null,
       def(pid), S (PLSamenhang), grens, ai {text}, verdict 'groen'|'oranje'|'rood'|null,
       disclaimer
     Geeft {titel, datum, voertuigNaam, voorblad, secties, bijlagen, ai}. Puur. */
  function model(ctx) {
    const c = ctx || {};
    const def = typeof c.def === 'function' ? c.def : () => null;
    const v = c.voertuig || {}, g = c.garage || {};
    const m = c.meting || null;
    const sam = m && m.sam && m.sam.rijen ? m.sam : null;
    const sh = sam && sam.samenhang ? sam.samenhang : null;
    const ai = leesAI(c.ai && c.ai.text);
    const f = ai.velden;
    const naamToestand = k => (c.S && c.S.NAAM && c.S.NAAM[k]) || k;
    const ts = getal(c.ts) ? c.ts : Date.now();
    const datum = new Date(ts).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const voertuigNaam = [v.merk, v.model].filter(x => x && x !== 'Onbekend').join(' ') || 'Onbekend voertuig';
    const soort = tekst(c.titel) || (m && m.watVoor ? hoofd(m.watVoor.replace(/^(de|het|een)\s+/i, '')) : 'Voertuiganalyse');
    const kenteken = tekst(c.kenteken || g.kent);

    // ── voorblad ──
    const kleur = f.oordeel || c.verdict || 'grijs';
    const kortTekst = eersteZinnen(f.conclusie, 260) ||
      (c.ai && c.ai.text ? 'Zie de conclusie in hoofdstuk 7.' : 'Er is geen AI-beoordeling bij dit rapport; de meting staat in hoofdstuk 5.');
    const voorRegels = [
      ['Voertuig', voertuigNaam + (v.year || g.bouwjaar ? ' (' + (v.year || g.bouwjaar) + ')' : '')],
      kenteken ? ['Kenteken', kenteken] : null,
      ['Analyse', soort],
      ['Datum', datum],
      m ? ['Meting', duur(m.sec) + (getal(m.rijSec) && m.rijSec > 0 ? ', waarvan ' + duur(m.rijSec) + ' rijdend' : '') +
                     (m.bron ? ' — ' + m.bron : '')] : ['Meting', 'geen meting bij dit rapport']
    ].filter(Boolean);

    const secties = [];
    const sectie = (titel, blokken) => secties.push({ nr: secties.length + 1, titel, blokken: blokken.filter(Boolean) });

    // ── 1 autokennis ──
    const auto = [
      ['Merk en model', voertuigNaam],
      (v.year || g.bouwjaar) ? ['Bouwjaar', String(v.year || g.bouwjaar)] : null,
      (g.motor || v.motor) ? ['Motor', tekst(g.motor || v.motor)] : null,
      (v.brandstof || g.brandstof) ? ['Brandstof', tekst(v.brandstof || g.brandstof)] : null,
      kenteken ? ['Kenteken', kenteken] : null,
      v.vin ? ['VIN', tekst(v.vin)] : null,
      getal(g.kmstand) ? ['Kilometerstand', g.kmstand.toLocaleString('nl-NL') + ' km (opgegeven)'] : null,
      g.apk_tot ? ['APK geldig tot', tekst(g.apk_tot)] : null
    ].filter(Boolean);
    sectie('Autokennis', [
      { soort: 'kv', regels: auto },
      c.recall ? { soort: 'kader', titel: 'Terugroepacties (RDW)', tekst: c.recall.tekst || '', kleur: (c.recall.open || []).length ? 'oranje' : 'groen',
                   items: (c.recall.open || []).map(a => '[' + a.code + '] ' + (a.omschrijving || 'geen omschrijving') + (a.risico ? ' — risico: ' + a.risico : '')) }
               : { soort: 'leeg', tekst: 'Terugroepacties niet opgevraagd in deze sessie (geen kenteken bekend).' }
    ]);

    // ── 2 probleemstelling ──
    const klacht = tekst(m && m.klacht);
    sectie('Probleemstelling', [
      { soort: 'kader', titel: 'Vraag van de klant', tekst: klacht || 'Geen klacht opgegeven: een algemene controle (' + soort.toLowerCase() + ').', kleur: 'blauw' },
      f.probleem ? { soort: 'tekst', tekst: f.probleem } : null
    ]);

    // ── 3 staat van het voertuig ──
    const staat = [];
    const d = c.dtc;
    if (!d || !d.gelezen) staat.push({ soort: 'leeg', tekst: 'Foutcodes niet uitgelezen in deze sessie.' });
    else {
      const rijen = [];
      (d.bevestigd || []).forEach(x => rijen.push([x, 'bevestigd', 'rood']));
      (d.permanent || []).filter(x => (d.bevestigd || []).indexOf(x) < 0).forEach(x => rijen.push([x, 'permanent', 'rood']));
      (d.pending || []).forEach(x => rijen.push([x, 'in afwachting', 'oranje']));
      staat.push(rijen.length
        ? { soort: 'tabel', titel: 'Foutcodes', kop: ['Code', 'Soort'], breedtes: [0.3, 0.7], statusKol: 1,
            rijen: rijen.map(r => ({ cellen: [r[0], r[1]], kleur: r[2] })) }
        : { soort: 'kader', titel: 'Foutcodes', tekst: 'Geen actieve foutcodes gevonden.', kleur: 'groen' });
    }
    const rd = c.readiness;
    if (rd && rd.ondersteund) {
      const klaar = rd.ondersteund - (rd.nietKlaar || []).length;
      staat.push({ soort: 'kader', titel: 'Keuringsstatus (readiness)', kleur: (rd.nietKlaar || []).length ? 'oranje' : 'groen',
        tekst: klaar + ' van ' + rd.ondersteund + ' zelftests klaar' + ((rd.nietKlaar || []).length ? '; niet klaar: ' + rd.nietKlaar.join(', ') : '') +
               (rd.mil ? '. Het motorlampje brandt.' : '.') });
    } else staat.push({ soort: 'leeg', tekst: 'Keuringsstatus (readiness) niet gelezen.' });
    if (sam) staat.push({ soort: 'stoplicht', titel: 'Per systeem, uit de meting', items: systemen(sam, def) });
    sectie('Staat van het voertuig', staat);

    // ── 4 plan van aanpak en testplan ──
    const plan = [];
    if (f.aanpak) plan.push({ soort: 'tekst', tekst: f.aanpak });
    if (m) {
      const gemeten = sam ? sam.rijen.length - (sam.tel ? sam.tel.nodata : 0) : 0;
      plan.push({ soort: 'kv', regels: [
        ['Soort analyse', soort],
        ['Meetopzet', m.bron ? 'bestaande meting: ' + m.bron : 'live meting' + (m.eisNaam ? ', ' + m.eisNaam : '')],
        ['Sensoren', sam ? gemeten + ' gemeten van ' + sam.rijen.length + ' gevraagd' : 'onbekend'],
        ['Aanpak van de app', 'eerst de toestand van de motor vaststellen, dan elke waarde alleen beoordelen waar hij iets zegt (warm, stationair, rijdend)']
      ] });
    }
    if (sh && !sh.geen) {
      const rijen = (sh.gelezen || []).map(x => ({ cellen: [x.titel, 'uitgevoerd', 'op ' + duur(x.ms / 1000) + ' passende meting'], kleur: 'groen' }))
        .concat((sh.niet || []).map(x => ({ cellen: [x.titel, 'niet uitgevoerd', x.reden], kleur: 'grijs' })));
      if (rijen.length) plan.push({ soort: 'tabel', titel: 'Testplan', kop: ['Test', 'Status', 'Toelichting'], breedtes: [0.32, 0.2, 0.48], statusKol: 1, rijen });
    } else if (sh && sh.geen) plan.push({ soort: 'leeg', tekst: 'Testplan niet uit te voeren: ' + sh.geen + '.' });
    if (!plan.length) plan.push({ soort: 'leeg', tekst: 'Geen meting bij dit rapport, dus ook geen testplan.' });
    sectie('Plan van aanpak en testplan', plan);

    // ── 5 uitvoering en metingen ──
    const uitv = [];
    if (!m) uitv.push({ soort: 'leeg', tekst: 'Geen meting bij dit rapport. Een rapport uit het archief, of een analyse zonder verzamelscherm.' });
    else {
      if (m.beperkt) uitv.push({ soort: 'kader', titel: 'Beperking van deze meting', tekst: m.beperkt, kleur: 'oranje' });
      if (sh && sh.toestanden) {
        const t = Object.keys(sh.toestanden).filter(k => sh.toestanden[k] >= 1000).sort((a, b) => sh.toestanden[b] - sh.toestanden[a]);
        if (t.length) uitv.push({ soort: 'tabel', titel: 'Toestanden van de motor tijdens de meting', kop: ['Toestand', 'Duur'], breedtes: [0.6, 0.4],
                                  rijen: t.map(k => ({ cellen: [naamToestand(k), duur(sh.toestanden[k] / 1000)] })) });
      }
      const opv = sam ? sam.rijen.filter(r => r.oordeel !== 'ok' && r.oordeel !== 'nodata') : [];
      uitv.push(opv.length
        ? { soort: 'tabel', titel: 'Wat opviel', kop: ['Sensor', 'Bereik', 'Oordeel', 'Waarom'], breedtes: [0.26, 0.2, 0.14, 0.4], statusKol: 2,
            rijen: opv.map(r => ({ cellen: [r.naam, fmt(r.min) + ' – ' + fmt(r.max) + ' ' + r.eenheid, STATUS_TEKST[r.oordeel], r.reden], kleur: STATUS_KLEUR[r.oordeel] })) }
        : { soort: 'kader', titel: 'Wat opviel', tekst: sam ? 'Geen waarde buiten het gebruikelijke bereik.' : 'Geen samenvatting van de meting.', kleur: sam ? 'groen' : 'grijs' });
      if (opv.length) uitv.push({ soort: 'tekst', klein: true, tekst: 'Opvallend is een vlag op vaste grenzen uit de sensordefinitie, nog geen defect. Of het in de toestand van de motor normaal is, staat in hoofdstuk 6.' });
      const gr = grafieken(m.hist, sam, def, toestandenUit(m.hist, c.S, c.grens));
      if (gr.length) {
        uitv.push({ soort: 'tussenkop', tekst: 'Verloop per sensor', ruimte: 64 });   // samen met de eerste grafiek
        gr.forEach(x => uitv.push({ soort: 'grafiek', g: x, naam: naamToestand }));
      } else uitv.push({ soort: 'leeg', tekst: 'Geen grafieken: de meting heeft per sensor te weinig punten met tijd.' });
    }
    sectie('Uitvoering en metingen', uitv);

    // ── 6 hypothesen en bewijs ──
    const hyp = [];
    if (sh && !sh.geen && sh.conclusie) {
      const items = (sh.conclusie.top || []).concat(sh.conclusie.uitgesloten || []).map(x => ({
        naam: x.naam, uitkomst: UITKOMST[x.status] ? x.status : 'open',
        voor: (x.bewijs || []).filter(b => b.d > 0).map(b => b.t), tegen: (x.bewijs || []).filter(b => !(b.d > 0)).map(b => b.t)
      }));
      hyp.push({ soort: 'tussenkop', tekst: 'Uit de meetregels van de app' });
      hyp.push(items.length ? { soort: 'bewijs', items }
        : { soort: 'tekst', tekst: (sh.gelezen || []).length ? 'Geen verdenking: wat de regels in deze meting konden lezen, klopt.' : 'Niets te beoordelen: geen stuk van de meting voldeed aan de voorwaarden.' });
    }
    hyp.push({ soort: 'tussenkop', tekst: 'Beoordeling door de AI' });
    if (f.hypothesen.length) hyp.push({ soort: 'bewijs', items: f.hypothesen });
    else hyp.push({ soort: 'leeg', tekst: c.ai && c.ai.text ? 'De AI gaf geen hypothesen in de vaste vorm; de redenering staat in bijlage B.' : 'Geen AI-beoordeling bij dit rapport.' });
    sectie('Hypothesen en bewijs', hyp);

    // ── 7 conclusie en aanbevelingen ──
    const concl = [];
    concl.push(f.conclusie ? { soort: 'tekst', tekst: f.conclusie } : { soort: 'leeg', tekst: 'Geen conclusie van de AI bij dit rapport.' });
    if (f.advies.length) concl.push({ soort: 'tabel', titel: 'Aanbevelingen', kop: ['Wat', 'Wanneer'], breedtes: [0.75, 0.25], statusKol: 1,
      rijen: f.advies.map(a => ({ cellen: [a.wat, a.urgentie ? URGENTIE[a.urgentie] : '–'], kleur: a.urgentie ? URGENTIE_KLEUR[a.urgentie] : null })) });
    if (f.nameten.length) concl.push({ soort: 'lijst', titel: 'Nog na te meten door een monteur', items: f.nameten });
    if (f.bron === 'tekst' && (f.conclusie || f.advies.length)) concl.push({ soort: 'tekst', klein: true, tekst: 'Conclusie en advies zijn uit de koppen van de AI-tekst gehaald; de volledige tekst staat in bijlage B.' });
    if (ai.fout) concl.push({ soort: 'tekst', klein: true, tekst: 'Let op: ' + ai.fout + '.' });
    sectie('Conclusie en aanbevelingen', concl);

    // ── 8 disclaimer en grenzen ──
    const grenzenMeting = [];
    if (sh && !sh.geen) (sh.niet || []).forEach(x => grenzenMeting.push(x.titel + ': ' + x.reden));
    if (sam) { const leeg = sam.rijen.filter(r => r.oordeel === 'nodata').map(r => r.naam); if (leeg.length) grenzenMeting.push('Geen data van: ' + leeg.join(', ')); }
    if (m && m.beperkt) grenzenMeting.push('Meting: ' + m.beperkt);
    sectie('Disclaimer en grenzen van deze meting', [
      { soort: 'kader', titel: 'Disclaimer', kleur: 'grijs', tekst: tekst(c.disclaimer) ||
        'Deze analyse is gebaseerd op OBD2-sensordata. Laat een afwijking altijd door een monteur verifiëren vóór reparatie.' },
      { soort: 'tekst', tekst: 'Dit rapport is gemaakt met een OBD-adapter en de sensoren die deze auto via de diagnose-aansluiting deelt. ' +
        'Het is geen keuring en vervangt geen inspectie door een monteur: mechanische slijtage, lekkage en de staat van banden, remmen en carrosserie zijn hiermee niet te zien.' },
      grenzenMeting.length ? { soort: 'lijst', titel: 'Niet beoordeeld in deze meting', items: grenzenMeting } : null
    ]);

    // ── bijlagen ──
    const bijlagen = [];
    bijlagen.push({ titel: 'Bijlage A — Meetdata per sensor', blokken: sam
      ? [{ soort: 'tabel', kop: ['Sensor', 'Min', 'Max', 'Gem.', 'Laatste', 'n', 'Oordeel'], breedtes: [0.3, 0.11, 0.11, 0.11, 0.11, 0.08, 0.18], statusKol: 6, klein: true,
           rijen: sam.rijen.map(r => ({ cellen: [r.naam + (r.eenheid ? ' (' + r.eenheid + ')' : ''), fmt(r.min), fmt(r.max), fmt(r.gem), fmt(r.laatste), String(r.n), STATUS_TEKST[r.oordeel]],
                                        kleur: STATUS_KLEUR[r.oordeel] })) },
         { soort: 'tekst', klein: true, tekst: 'n = aantal metingen in het meetvenster. Oordeel per sensor over het hele venster (hoogste en laagste waarde), met de grenzen uit de sensordefinitie van de app.' }]
      : [{ soort: 'leeg', tekst: 'Geen meetdata bij dit rapport.' }] });
    bijlagen.push({ titel: 'Bijlage B — Volledige toelichting van de AI', blokken: ai.rest
      ? [{ soort: 'ai', tekst: ai.rest }] : [{ soort: 'leeg', tekst: 'Geen AI-tekst bij dit rapport.' }] });

    return { titel: soort, datum, ts, voertuigNaam, kenteken,
             voorblad: { regels: voorRegels, kort: { kleur, kop: KORT[kleur], tekst: kortTekst } },
             secties, bijlagen, promo: PROMO, ai: { bron: f.bron, fout: ai.fout } };
  }

  function hoofd(s) { s = tekst(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function eersteZinnen(s, max) {
    s = tekst(s); if (!s) return '';
    if (s.length <= max) return s;
    const knip = s.slice(0, max), p = knip.lastIndexOf('. ');
    return p > max * 0.4 ? knip.slice(0, p + 1) : knip.replace(/\s+\S*$/, '') + ' …';
  }

  /* Per systeem het zwaarste oordeel van zijn sensoren. Alleen "geen data"
     is grijs: niet gemeten is niet goed. */
  function systemen(sam, def) {
    const per = {};
    sam.rijen.forEach(r => {
      const dd = def(r.pid) || {};
      const naam = SYSTEEM[dd.cat] || 'Overig';
      (per[naam] = per[naam] || []).push(r);
    });
    const volgorde = ['Motor', 'Brandstofsysteem', 'Emissie en lambda', 'Koeling en temperaturen', 'Elektrisch systeem', 'Rijden en aandrijving', 'Overig'];
    return volgorde.filter(n => per[n]).map(n => {
      const rs = per[n], gemeten = rs.filter(r => r.oordeel !== 'nodata');
      const ergste = rs.slice().sort((a, b) => ERNST[b.oordeel] - ERNST[a.oordeel])[0];
      const opv = rs.filter(r => r.oordeel === 'afwijkend' || r.oordeel === 'let');
      let kleur = gemeten.length ? STATUS_KLEUR[ergste.oordeel] : 'grijs';
      const t = !gemeten.length ? 'niet gemeten'
        : opv.length ? opv.length + ' van ' + gemeten.length + ' sensoren vallen op: ' + opv.map(r => r.naam).join(', ')
        : (ergste.oordeel === 'meetfout' || ergste.oordeel === 'twijfel') ? 'meting twijfelachtig: ' + rs.filter(r => r.oordeel === ergste.oordeel).map(r => r.naam).join(', ')
        : gemeten.length + ' sensor' + (gemeten.length === 1 ? '' : 'en') + ' binnen het gebruikelijke bereik';
      return { naam: n, kleur, tekst: t };
    });
  }

  function grafieken(hist, sam, def, toestanden) {
    if (!hist) return [];
    const opv = sam ? sam.rijen.filter(r => r.oordeel === 'afwijkend' || r.oordeel === 'let').map(r => r.pid) : [];
    const gemeten = sam ? sam.rijen.filter(r => r.oordeel !== 'nodata').map(r => r.pid) : Object.keys(hist);
    const kandidaten = opv.concat(GRAFIEK_VOORKEUR.filter(p => gemeten.indexOf(p) >= 0), gemeten);
    const uit = [];
    kandidaten.forEach(p => {
      if (uit.length >= MAX_GRAFIEK || uit.some(x => x.pid === p)) return;
      const g = grafiekData(hist, p, def(p), toestanden);
      if (g) uit.push(g);
    });
    return uit;
  }

  // ── UIT DE APP ─────────────────────────────────────────────────────
  /* De meting die bij een rapport van tijdstip ts hoort, of null. */
  function versMeting(ts) {
    const m = window._plVerzameld;
    const t = getal(ts) ? ts : Date.now();
    return (m && getal(m.ts) && m.ts <= t + 1000 && t - m.ts < VERS_MS) ? m : null;
  }

  function uitApp(r) {
    const rep = r || {};
    const ts = rep.ts ? new Date(rep.ts).getTime() : Date.now();
    const v = (typeof vehicleInfo !== 'undefined' && vehicleInfo) || {};
    let garage = null, kenteken = '';
    try { garage = (window.PLGarage && PLGarage.actief) ? PLGarage.actief() : null; } catch (e) { console.warn('PLRapport: actief voertuig onbekend', e); }
    try { kenteken = localStorage.getItem('pl_kenteken') || ''; } catch (e) { console.warn('PLRapport: kenteken niet leesbaar', e); }
    let recall = null;
    try {
      const res = window._plRecall;
      if (res && window.PLRecall) {
        const s = res.samenvatting || PLRecall.samenvat(res);
        recall = { tekst: s && s.tekst ? s.tekst : (s && s.niveau === 'ok' ? 'geen terugroepacties bekend' : ''),
                   open: (res.acties || []).filter(a => a.open).map(a => ({ code: a.referentiecode, omschrijving: a.omschrijving, risico: a.risico })) };
      }
    } catch (e) { console.warn('PLRapport: terugroepacties niet leesbaar', e); }
    let dtc = null, readiness = null;
    try {
      const scan = window.PLFoutcodes && PLFoutcodes.staat ? (PLFoutcodes.staat() || {}).scan : null;
      if (scan && scan.codes) {
        dtc = { gelezen: true, bevestigd: scan.codes.bevestigd || [], pending: scan.codes.pending || [], permanent: scan.codes.permanent || [] };
        readiness = scan.readiness || null;
      } else if (typeof dtcCodes !== 'undefined' && Array.isArray(dtcCodes) && dtcCodes.length) {
        // Alleen de snelle lijst: wat erin staat is gelezen, maar "leeg" zegt
        // niet dat er gelezen is — dus geen groen zonder scan.
        dtc = { gelezen: true, bevestigd: dtcCodes.slice(), pending: [], permanent: [] };
      }
    } catch (e) { console.warn('PLRapport: foutcodes niet leesbaar', e); }
    let grens = null;
    try { grens = window.PLOnderzoek && PLOnderzoek.cfg ? PLOnderzoek.cfg.grens : null; } catch (e) { console.warn('PLRapport: toestandsgrenzen onbekend', e); }
    // Het stoplicht dat renderAIText() al toonde (aiVerdict). Opnieuw
    // berekenen zou de telemetrie van dat oordeel dubbel tellen.
    const verdict = { green: 'groen', amber: 'oranje', red: 'rood' }[rep.oordeel] || null;
    return {
      ts, voertuig: v, garage: garage || {}, kenteken, recall, dtc, readiness,
      meting: rep.meting || versMeting(ts),
      def: pid => (typeof getPidDef === 'function' ? getPidDef(pid) : null),
      S: window.PLSamenhang || null, grens, ai: { text: rep.text || '' }, verdict,
      disclaimer: typeof RAPPORT_DISCLAIMER !== 'undefined' ? RAPPORT_DISCLAIMER : ''
    };
  }

  /* Het logo als dataURL voor jsPDF. Via een <img> en een canvas, niet met
     fetch: serververkeer loopt hier via plFetch (test-plfetch.js), en dit is
     een bestand van de app zelf. Mislukt het, dan een tekstlogo. */
  let _logo = null;
  function laadLogo() {
    if (_logo) return Promise.resolve(_logo);
    return new Promise(klaar => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          _logo = c.toDataURL('image/png');
        } catch (e) { console.warn('PLRapport: logo niet omgezet — het rapport krijgt een tekstlogo', e); }
        klaar(_logo);
      };
      img.onerror = () => { console.warn('PLRapport: icon-192.png niet geladen — het rapport krijgt een tekstlogo'); klaar(null); };
      img.src = 'icon-192.png';
    });
  }

  // ── DE PDF ─────────────────────────────────────────────────────────
  const W = 210, H = 297, M = 15, CW = W - 2 * M, ONDER = 278;
  const RGB = { blauw: [26, 111, 255], donker: [26, 32, 44], grijs: [113, 128, 150], licht: [237, 242, 247], wit: [255, 255, 255],
                groen: [22, 128, 61], oranje: [180, 95, 6], rood: [190, 30, 45] };
  const ZACHT = { groen: [232, 245, 236], oranje: [253, 243, 226], rood: [252, 232, 234], grijs: [241, 243, 246], blauw: [232, 240, 255] };
  const BAND = { uit: [235, 235, 235], start: [225, 225, 225], stationair_koud: [221, 234, 252], stationair_warm: [222, 244, 228],
                 stil_gas: [238, 230, 250], toeren2500: [238, 230, 250], rijden_koud: [252, 246, 214], rijden_warm: [253, 240, 205], vollast: [253, 226, 205] };

  // jsPDF's standaardletters kennen geen emoji of pijlen: vervangen of weg.
  function schoon(t) {
    return String(t == null ? '' : t)
      .replace(/▲/g, '+').replace(/▼/g, '-').replace(/→/g, '->').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/λ/g, 'lambda')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2100}-\u{214F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
      .replace(/\*\*/g, '');
  }

  function pdf(mod, JsPDF, opts) {
    const o = opts || {};
    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    const kl = (k) => RGB[k] || RGB.donker;
    const vul = c => doc.setFillColor(c[0], c[1], c[2]);
    const lijn = c => doc.setDrawColor(c[0], c[1], c[2]);
    const inkt = c => doc.setTextColor(c[0], c[1], c[2]);
    const font = (stijl, maat) => { doc.setFont('helvetica', stijl); doc.setFontSize(maat); };
    const streep = (aan) => { if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern(aan ? [1, 1] : [], 0); };
    let y = 0;

    const kopKlein = () => {
      vul(RGB.blauw); doc.rect(0, 0, W, 12, 'F');
      inkt(RGB.wit); font('bold', 9); doc.text('PidLane — Analyserapport', M, 8);
      font('normal', 9); doc.text(schoon(mod.voertuigNaam + (mod.kenteken ? ' · ' + mod.kenteken : '')), W - M, 8, { align: 'right' });
      y = 20;
    };
    const nieuwePagina = () => { doc.addPage(); kopKlein(); };
    const ruimte = (nodig) => { if (y + nodig > ONDER) nieuwePagina(); };
    const alinea = (t, maat, kleur, stijl, inspring) => {
      const x = M + (inspring || 0);
      font(stijl || 'normal', maat || 10); inkt(kleur || RGB.donker);
      const regels = doc.splitTextToSize(schoon(t), CW - (inspring || 0));
      const lh = (maat || 10) * 0.45;
      regels.forEach(r => { ruimte(lh + 1); doc.text(r, x, y); y += lh; });
      y += 1.5;
    };

    // ── voorblad ──
    vul(RGB.blauw); doc.rect(0, 0, W, 52, 'F');
    let tx = M;
    if (o.logo && typeof doc.addImage === 'function') {
      try { doc.addImage(o.logo, 'PNG', M, 12, 26, 26); tx = M + 32; }
      catch (e) { console.warn('PLRapport: logo niet in de PDF gezet', e); }
    }
    inkt(RGB.wit); font('bold', 26); doc.text('PidLane', tx, 25);
    font('normal', 10); doc.text('Your car talks. We translate.', tx, 32);
    font('bold', 12); doc.text('ANALYSERAPPORT', W - M, 22, { align: 'right' });
    font('normal', 9); doc.text(schoon(mod.datum), W - M, 29, { align: 'right' });
    y = 66;
    inkt(RGB.donker); font('bold', 20); doc.text(doc.splitTextToSize(schoon(mod.titel), CW), M, y); y += 10;
    inkt(RGB.grijs); font('normal', 13); doc.text(schoon(mod.voertuigNaam), M, y); y += 10;
    // voertuig- en meetgegevens
    const vr = mod.voorblad.regels;
    vul(RGB.licht); doc.roundedRect(M, y, CW, 8 + vr.length * 6.5, 2, 2, 'F');
    let my = y + 8;
    vr.forEach(r => {
      font('bold', 9); inkt(RGB.grijs); doc.text(schoon(r[0]).toUpperCase(), M + 5, my);
      font('normal', 10); inkt(RGB.donker); doc.text(doc.splitTextToSize(schoon(r[1]), CW - 50)[0], M + 45, my);
      my += 6.5;
    });
    y = my + 8;
    // In het kort
    const kort = mod.voorblad.kort;
    const kRegels = (() => { font('normal', 10.5); return doc.splitTextToSize(schoon(kort.tekst), CW - 30); })();
    const kH = 20 + kRegels.length * 5;
    vul(ZACHT[kort.kleur] || ZACHT.grijs); lijn(kl(kort.kleur)); doc.setLineWidth(0.6);
    doc.roundedRect(M, y, CW, kH, 3, 3, 'FD'); doc.setLineWidth(0.2);
    vul(kl(kort.kleur)); doc.circle(M + 11, y + 11, 5, 'F');
    font('bold', 8); inkt(RGB.grijs); doc.text('IN HET KORT', M + 22, y + 8);
    font('bold', 13); inkt(kl(kort.kleur)); doc.text(schoon(kort.kop), M + 22, y + 14.5);
    font('normal', 10.5); inkt(RGB.donker); doc.text(kRegels, M + 22, y + 21);
    y += kH + 10;
    // inhoud
    font('bold', 11); inkt(RGB.blauw); doc.text('Inhoud', M, y); y += 6;
    font('normal', 10); inkt(RGB.donker);
    mod.secties.map(s => s.nr + '.  ' + s.titel).concat(mod.bijlagen.map(b => b.titel)).forEach(t => { doc.text(schoon(t), M + 2, y); y += 5.5; });

    // ── blokken ──
    // Een tussenkop blijft niet alleen onderaan een pagina staan.
    const tussenkop = (t, nodig) => { ruimte(nodig || 24); y += 2; font('bold', 10.5); inkt(RGB.donker); doc.text(schoon(t), M, y); y += 5.5; };
    const blok = (b) => {
      if (b.soort === 'tekst') return alinea(b.tekst, b.klein ? 8.5 : 10, b.klein ? RGB.grijs : RGB.donker);
      if (b.soort === 'tussenkop') return tussenkop(b.tekst, b.ruimte);
      if (b.soort === 'leeg') {
        ruimte(9); vul(ZACHT.grijs); font('italic', 9.5);
        const r = doc.splitTextToSize(schoon(b.tekst), CW - 8);
        doc.roundedRect(M, y - 4, CW, r.length * 4.4 + 4, 1.5, 1.5, 'F');
        inkt(RGB.grijs); doc.text(r, M + 4, y); y += r.length * 4.4 + 4; return;
      }
      if (b.soort === 'kv') {
        b.regels.forEach(r => {
          const w = (() => { font('normal', 10); return doc.splitTextToSize(schoon(r[1]), CW - 48); })();
          ruimte(w.length * 4.6 + 1.5);
          font('bold', 9); inkt(RGB.grijs); doc.text(schoon(r[0]), M, y);
          font('normal', 10); inkt(RGB.donker); doc.text(w, M + 48, y); y += w.length * 4.6 + 1.5;
        });
        y += 2; return;
      }
      if (b.soort === 'kader') {
        font('normal', 9.5);
        const r = doc.splitTextToSize(schoon(b.tekst), CW - 10);
        const items = (b.items || []).map(i => doc.splitTextToSize('- ' + schoon(i), CW - 14));
        const h = 9 + r.length * 4.4 + items.reduce((a, i) => a + i.length * 4.4, 0) + 2;
        ruimte(h + 3);
        vul(ZACHT[b.kleur] || ZACHT.grijs); doc.roundedRect(M, y, CW, h, 2, 2, 'F');
        vul(kl(b.kleur === 'blauw' ? 'blauw' : b.kleur)); doc.rect(M, y, 1.4, h, 'F');
        font('bold', 8.5); inkt(kl(b.kleur === 'blauw' ? 'blauw' : b.kleur)); doc.text(schoon(b.titel || '').toUpperCase(), M + 5, y + 5.5);
        font('normal', 9.5); inkt(RGB.donker); let yy = y + 10.5; doc.text(r, M + 5, yy); yy += r.length * 4.4;
        items.forEach(i => { doc.text(i, M + 8, yy); yy += i.length * 4.4; });
        y += h + 4; return;
      }
      if (b.soort === 'lijst') {
        if (b.titel) tussenkop(b.titel);
        b.items.forEach(i => {
          font('normal', 10); const r = doc.splitTextToSize(schoon(i), CW - 7);
          ruimte(r.length * 4.6 + 1); inkt(RGB.blauw); doc.text('•', M + 1, y); inkt(RGB.donker); doc.text(r, M + 6, y); y += r.length * 4.6 + 1;
        });
        y += 2; return;
      }
      if (b.soort === 'stoplicht') {
        if (b.titel) tussenkop(b.titel);
        b.items.forEach(i => {
          font('normal', 9.5); const r = doc.splitTextToSize(schoon(i.tekst), CW - 62);
          const h = Math.max(7, r.length * 4.3 + 3);
          ruimte(h + 1);
          vul(ZACHT[i.kleur] || ZACHT.grijs); doc.roundedRect(M, y - 4.5, CW, h, 1.5, 1.5, 'F');
          vul(kl(i.kleur)); doc.circle(M + 4.5, y - 1, 2.2, 'F');
          font('bold', 9.5); inkt(RGB.donker); doc.text(schoon(i.naam), M + 9, y);
          font('normal', 9.5); doc.text(r, M + 60, y); y += h + 1;
        });
        y += 2; return;
      }
      if (b.soort === 'tabel') return tabel(b);
      if (b.soort === 'bewijs') return bewijs(b);
      if (b.soort === 'grafiek') return grafiek(b.g, b.naam);
      if (b.soort === 'ai') return aiTekst(b.tekst);
      console.warn('PLRapport: onbekend blok ' + b.soort);
    };

    const tabel = (b) => {
      if (b.titel) tussenkop(b.titel);
      const maat = b.klein ? 8 : 9, lh = maat * 0.43;
      const bw = b.breedtes.map(f => f * CW);
      const xs = bw.reduce((a, w, i) => a.concat(i ? a[i - 1] + bw[i - 1] : M), []);
      const kop = () => {
        ruimte(8); vul(RGB.licht); doc.rect(M, y - 4, CW, 6.5, 'F');
        font('bold', maat); inkt(RGB.grijs);
        b.kop.forEach((k, i) => doc.text(schoon(k), xs[i] + 1.5, y));
        y += 6.5;
      };
      kop();
      b.rijen.forEach((r, ri) => {
        font('normal', maat);
        const cel = r.cellen.map((c, i) => doc.splitTextToSize(schoon(c), bw[i] - 3));
        const h = Math.max.apply(null, cel.map(c => c.length)) * lh + 2.6;
        if (y + h > ONDER) { nieuwePagina(); kop(); }
        if (ri % 2) { vul([248, 250, 252]); doc.rect(M, y - lh - 0.4, CW, h, 'F'); }
        cel.forEach((c, i) => {
          const status = i === b.statusKol && r.kleur;
          font(status ? 'bold' : 'normal', maat); inkt(status ? kl(r.kleur) : RGB.donker);
          doc.text(c, xs[i] + 1.5, y);
        });
        y += h;
      });
      lijn(RGB.licht); doc.line(M, y - lh, M + CW, y - lh);
      y += 3;
    };

    const bewijs = (b) => {
      b.items.forEach(h => {
        font('normal', 9.5);
        const voor = h.voor.map(t => doc.splitTextToSize(schoon(t), CW - 12));
        const tegen = h.tegen.map(t => doc.splitTextToSize(schoon(t), CW - 12));
        const n = voor.concat(tegen).reduce((a, r) => a + r.length, 0);
        const hgt = 9 + n * 4.4 + (n ? 0 : 4.4) + 2;
        ruimte(Math.min(hgt, 60));
        const k = UITKOMST_KLEUR[h.uitkomst] || 'grijs';
        vul(ZACHT[k]); doc.roundedRect(M, y - 4.5, CW, 7.5, 1.5, 1.5, 'F');
        font('bold', 10); inkt(RGB.donker); doc.text(doc.splitTextToSize(schoon(h.naam), CW - 48)[0], M + 3, y);
        font('bold', 8.5); inkt(kl(k)); doc.text(schoon(UITKOMST[h.uitkomst] || h.uitkomst).toUpperCase(), M + CW - 3, y, { align: 'right' });
        y += 6.5;
        const regel = (r, plus) => {
          ruimte(r.length * 4.4 + 1);
          font('bold', 10); inkt(plus ? RGB.rood : RGB.groen); doc.text(plus ? '+' : '–', M + 4, y);
          font('normal', 9.5); inkt(RGB.donker); doc.text(r, M + 9, y); y += r.length * 4.4;
        };
        voor.forEach(r => regel(r, true));
        tegen.forEach(r => regel(r, false));
        if (!n) { font('italic', 9); inkt(RGB.grijs); doc.text('geen bewijs genoemd', M + 9, y); y += 4.4; }
        y += 3;
      });
      font('normal', 8); inkt(RGB.grijs); ruimte(5); doc.text('+ spreekt vóór deze oorzaak   – spreekt ertegen', M, y); y += 6;
    };

    const grafiek = (g, naamVan) => {
      const GH = 38, GW = CW - 16, gx = M + 14;
      ruimte(GH + 16);
      font('bold', 9.5); inkt(RGB.donker);
      doc.text(schoon(g.naam + (g.eenheid ? ' (' + g.eenheid + ')' : '')), M, y);
      font('normal', 8.5); inkt(RGB.grijs);
      doc.text(schoon('min ' + fmt(g.min) + ' · max ' + fmt(g.max) + ' · ' + duur(g.duurS)), M + CW, y, { align: 'right' });
      y += 2.5;
      const top = y, X = f => gx + f * GW, Y = f => top + GH - f * GH;
      g.banden.forEach(bd => { const c = BAND[bd.toestand] || ZACHT.grijs; vul(c); doc.rect(X(bd.van), top, Math.max(0.3, X(bd.tot) - X(bd.van)), GH, 'F'); });
      lijn(RGB.licht); doc.setLineWidth(0.2);
      [0, 0.5, 1].forEach(f => doc.line(gx, Y(f), gx + GW, Y(f)));
      lijn(RGB.grijs); doc.rect(gx, top, GW, GH);
      font('normal', 7.5); inkt(RGB.grijs);
      doc.text(fmt(g.yhi), gx - 1.5, Y(1) + 1, { align: 'right' });
      doc.text(fmt((g.ylo + g.yhi) / 2), gx - 1.5, Y(0.5) + 1, { align: 'right' });
      doc.text(fmt(g.ylo), gx - 1.5, Y(0) + 1, { align: 'right' });
      doc.text('0 s', gx, top + GH + 3.5); doc.text(duur(g.duurS), gx + GW, top + GH + 3.5, { align: 'right' });
      g.grenzen.forEach(gr => {
        const c = gr.soort === 'alarm' ? RGB.rood : RGB.oranje;
        lijn(c); streep(true); doc.line(gx, Y(gr.y), gx + GW, Y(gr.y)); streep(false);
        inkt(c); doc.text(schoon(gr.soort + ' ' + fmt(gr.waarde)), gx + GW - 1, Y(gr.y) - 0.8, { align: 'right' });
      });
      lijn(RGB.blauw); doc.setLineWidth(0.45);
      for (let i = 1; i < g.punten.length; i++) doc.line(X(g.punten[i - 1][0]), Y(g.punten[i - 1][1]), X(g.punten[i][0]), Y(g.punten[i][1]));
      doc.setLineWidth(0.2);
      y = top + GH + 6;
      // legenda van de toestanden in déze grafiek
      const t = g.banden.map(bd => bd.toestand).filter((x, i, a) => a.indexOf(x) === i);
      if (t.length) {
        let lx = gx; font('normal', 7.5);
        t.forEach(k => {
          const label = schoon(naamVan(k)), w = doc.getTextWidth(label);
          if (lx + w + 8 > M + CW) { lx = gx; y += 4; }
          vul(BAND[k] || ZACHT.grijs); doc.rect(lx, y - 2.6, 3.5, 3, 'F'); inkt(RGB.grijs); doc.text(label, lx + 4.5, y);
          lx += w + 9;
        });
        y += 5;
      }
      y += 2;
    };

    const aiTekst = (t) => {
      schoon(t).split('\n').forEach(raw => {
        const r = raw.trim();
        if (!r) { y += 1.5; return; }
        if (/^#{1,3}\s/.test(r) || (/^[A-ZÀ-Ý][A-ZÀ-Ý \-?:]{3,}$/.test(r))) { ruimte(10); y += 2; font('bold', 10); inkt(RGB.blauw); doc.text(r.replace(/^#{1,3}\s*/, '').replace(/:$/, ''), M, y); y += 5; return; }
        if (/^[-•*]\s/.test(r)) {
          font('normal', 9); const w = doc.splitTextToSize(r.replace(/^[-•*]\s*/, ''), CW - 6);
          ruimte(w.length * 4.1 + 1); inkt(RGB.donker); doc.text('•', M + 1, y); doc.text(w, M + 5, y); y += w.length * 4.1 + 0.8; return;
        }
        font('normal', 9); const w = doc.splitTextToSize(r, CW);
        ruimte(w.length * 4.1 + 1); inkt(RGB.donker); doc.text(w, M, y); y += w.length * 4.1 + 1;
      });
    };

    // ── secties ──
    const sectieKop = (t) => {
      ruimte(30); y += 3;
      font('bold', 14); inkt(RGB.blauw); doc.text(schoon(t), M, y); y += 2;
      lijn(RGB.blauw); doc.setLineWidth(0.5); doc.line(M, y, M + 40, y); doc.setLineWidth(0.2); y += 7;
    };
    nieuwePagina();
    mod.secties.forEach((s, i) => {
      // Elk hoofdstuk op een nieuwe pagina als er minder dan een derde over is.
      if (i && y > 190) nieuwePagina();
      sectieKop(s.nr + '. ' + s.titel);
      s.blokken.forEach(blok);
      y += 3;
    });
    mod.bijlagen.forEach(b => { nieuwePagina(); sectieKop(b.titel); b.blokken.forEach(blok); });
    // Over PidLane
    ruimte(30); y += 4;
    blok({ soort: 'kader', titel: 'Over PidLane', tekst: mod.promo, kleur: 'blauw' });

    // ── voettekst op elke pagina ──
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      lijn(RGB.licht); doc.line(M, 285, W - M, 285);
      font('normal', 7.5); inkt(RGB.grijs);
      doc.text('Gemaakt met PidLane · pidlane.nl · Your car talks. We translate.', M, 290);
      doc.text('Pagina ' + i + ' van ' + n, W - M, 290, { align: 'right' });
    }
    return doc;
  }

  /* Het hele rapport bij een AI-rapport ({text, ts, meting}). */
  async function maak(JsPDF, r) {
    const mod = model(uitApp(r));
    const logo = await laadLogo();
    return { doc: pdf(mod, JsPDF, { logo }), model: mod };
  }

  window.PLRapport = { VERS_MS, TOESTAND_PIDS, MAX_GRAFIEK, instructie, zonderBlok, leesAI, grafiekData, toestandenUit, model,
                       versMeting, uitApp, laadLogo, pdf, maak, schoon };
})();
