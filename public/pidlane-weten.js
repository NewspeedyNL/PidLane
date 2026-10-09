/* ═══════════════════════════════════════════════════════════════════
   pidlane-weten.js — PLWeten: "Wat we al weten", vóór de eerste vraag
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (09-10-2026)

   De wizard vroeg eerst hoe lang je wilde meten, en vertelde pas daarna wat
   hij al over de auto wist — of helemaal niet. Wie een auto wil kopen, koos
   "Korte proefrit" zonder te weten dat de DSG van dat merk een bekend zwak
   punt is dat pas onder belasting boven komt. Alles wat daarvoor nodig was
   stond al in de app, alleen verspreid en onzichtbaar:

     • het RDW (APK, NAP-oordeel, terugroepacties, import, typekeurings-
       verbruik) zat in PLZonder en in koopcheck-stap 1;
     • de zwakke punten per merk (AUTO_KENNIS in pidlane-data.js) gingen
       alleen naar de AI-prompt van de Auto-expert, nooit naar de mens;
     • het dossier van een klant (PLGarage) en de laatste foutcode-uitlezing
       (PLFoutcodes) stonden elk in hun eigen scherm.

   De volgorde is nu: eerst wat we weten, dan wat jij invult, dan het
   meetplan, dan de uitkomst. Dit bestand doet alleen de eerste stap.

   ÉÉN DING, ÉÉN BETEKENIS. Dit is geen tweede kenteken-check en geen tweede
   dossier: de RDW-regels komen uit PLZonder.rdwOverzicht(), de dossierpunten
   uit de status() van PLGarage, de merkkennis uit autoKennisVoorMerk(). Hier
   staat alleen welke daarvan bij welke vraag horen, en wat je er tijdens een
   proefrit mee doet.

   WAT DE APP NIET WEET, ZEGT HIJ. Schadehistorie zit niet in de open RDW-
   data; de kaart belooft hem dus niet maar zegt waar je hem wél vindt.
   Modelspecifieke kennis ("dit model roest daar") staat niet in de tabel —
   die is per merk. Wie meer wil, tikt op "Meer over dit model": dat vraagt de
   AI, kost tegoed, en staat er zichtbaar als "volgens de AI, niet
   geverifieerd" bij.

   PUUR EN NIET PUUR. proefritPunten(), adviesMeting() en kaart() zijn puur;
   test-weten.js toetst ze met vm. verzamel() raakt het net, teken() de DOM.

   Laadvolgorde: vóór pidlane-wizard.js. Gebruikt op het moment van aanroepen
   getVehicle, autoKennisVoorMerk, PLZonder, PLRecall, PLGarage, PLFoutcodes
   en apiFetch; niets daarvan bij het laden.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════

  /* Van een bekend zwak punt naar iets wat je bij de auto of tijdens de
     proefrit kunt zien, horen of voelen. `last` = komt pas onder belasting
     boven; dat bepaalt het advies voor de meting. */
  var PROEF = [
    { kw: /dsg|mechatronic|powershift|versnellingsbak|automaat|cvt/i, last: true,
      t: 'Schakelen: trek rustig op van 1 naar 3. Schokken, slippen of een klap bij 1→2 wijst op de versnellingsbak.' },
    { kw: /ketting|distributie|timing chain|balanceer/i, last: false,
      t: 'Koude start: luister de eerste seconden. Ratelen dat na even wegtrekt wijst op de distributieketting — vraag de verkoper de motor niet vooraf warm te draaien.' },
    { kw: /dpf|roetfilter/i, last: true,
      t: 'Roetfilter: rook bij stevig optrekken, of een ventilator die na het afzetten blijft draaien (dan is hij aan het regenereren).' },
    { kw: /egr/i, last: true,
      t: 'EGR: inhouden of schokken bij laag toerental en weinig gas, vooral met een warme motor.' },
    { kw: /turbo/i, last: true,
      t: 'Turbo: fluiten of sissen bij optrekken, of een gat in het vermogen tussen 1500 en 2500 tpm.' },
    { kw: /injector/i, last: true,
      t: 'Injectoren: onrustig stationair, tikken of rammelen bij een koude start, of zwarte rook bij gas geven.' },
    { kw: /koel|waterpomp|thermostaat/i, last: false,
      t: 'Koeling: na tien minuten rijden hoort de temperatuurmeter stil in het midden te staan. Een zoete lucht of een lager reservoir na de rit is een teken.' },
    { kw: /olieverbruik|olielekk|kleppendeksel|olieslib|pcv/i, last: false,
      t: 'Olie: blauwe rook bij gas geven na stationair; kijk na de rit op de peilstok en onder de motor.' },
    { kw: /ophanging|luchtvering/i, last: false,
      t: 'Ophanging: klunken over drempels, en zakt de auto na het parkeren aan één kant?' },
    { kw: /roest/i, last: false,
      t: 'Roest: kijk met een lamp in de wielkasten, onder de dorpels en bij de achterklep.' },
    { kw: /hybride accu|accu-degradatie|inverter|phev|accu-balancering/i, last: true,
      t: 'Hybride: slaat de motor vaker aan dan je verwacht, of loopt de accumeter snel leeg bij rustig rijden?' },
    { kw: /adblue/i, last: false,
      t: 'AdBlue: een melding over AdBlue of emissie op het dashboard na de start.' },
    { kw: /vanos|disa|inlaatklep|carbon/i, last: true,
      t: 'Inlaat: onrustig stationair of inhouden bij optrekken uit laag toerental.' }
  ];
  var ALTIJD = [
    'Na de start horen alle lampjes binnen een paar seconden uit te gaan.',
    'Remmen: de auto trekt niet naar één kant en het pedaal voelt niet zacht.',
    'Rechtuit: het stuur staat recht en de auto loopt niet weg.'
  ];

  /* zwak = lijst teksten (autoKennisVoorMerk().zwak). Geeft
     { punten:[tekst], last:[zwak dat onder belasting boven komt] }. Eerst wat
     bij dit merk hoort, dan wat bij elke auto hoort. */
  function proefritPunten(zwak) {
    var punten = [], last = [];
    (zwak || []).forEach(function (z) {
      PROEF.forEach(function (p) {
        if (!p.kw.test(String(z))) return;
        if (punten.indexOf(p.t) < 0) punten.push(p.t);
        if (p.last && last.indexOf(z) < 0) last.push(z);
      });
    });
    return { punten: punten.concat(ALTIJD), last: last };
  }

  /* Welke meting we aanraden. Alleen een advies als er een reden is; anders
     null, en dan kiest de gebruiker zonder dat de app iets suggereert. */
  function adviesMeting(zwak) {
    var l = proefritPunten(zwak).last;
    if (!l.length) return null;
    return { meting: 'rit10', waarom: 'Bij dit merk ' + (l.length === 1 ? 'is ' : 'zijn ') + l.slice(0, 2).join(' en ') +
      ' een bekend zwak punt' + (l.length === 1 ? '' : 'en') + ', en dat komt pas onder belasting boven.' };
  }

  // Welke RDW-regels bij welke vraag horen. Op label, want dat is wat
  // rdwOverzicht() teruggeeft; een label dat daar verandert, valt hier weg
  // en dat vangt test-weten.js.
  var RDW_LABELS = {
    handel: ['APK geldig tot', 'Wacht op keuren', 'WAM-verzekerd', 'Tellerstand (NAP)', 'Terugroepactie', 'Export',
      'Eerste toelating', 'In Nederland sinds', 'Huidige eigenaar sinds', 'Brandstof'],
    verbruik: ['Verbruik volgens de typekeuring'],
    conditie: ['APK geldig tot', 'Terugroepactie'],
    voorbereiding: ['APK geldig tot', 'Terugroepactie'],
    storing: ['Terugroepactie']
  };

  function codesUit(scan) {
    var c = (scan && scan.codes) || {};
    var uit = [];
    [['bevestigd', 'rood', 'bevestigd'], ['permanent', 'rood', 'permanent'], ['pending', 'oranje', 'in afwachting']].forEach(function (s) {
      (c[s[0]] || []).forEach(function (x) {
        var code = typeof x === 'string' ? x : (x && (x.code || x.c)) || '';
        if (code) uit.push({ ico: '⚠️', label: code, waarde: s[2], ernst: s[1] });
      });
    });
    return uit;
  }

  /* Het model van de kaart. Puur.
     bron = { voertuig:{merk,model,jaar,brandstof}, rdw: rdwOverzicht()|null,
              recall:[open actie]|null, dossier: status()|null, scan|null,
              kennis: autoKennisVoorMerk()|null, fout: tekst|null }
     tak  = handel|storing|conditie|verbruik|voorbereiding
     rol  = koop|verkoop|inkoop|lease|occasion (alleen bij handel)
     Geeft { naam, blokken:[{kop, regels:[{ico,label,waarde,ernst}], bron?}],
             leeg, advies }. `leeg` telt alleen blokken met gegevens over déze
     auto; de algemene proefritregels en de schaderegel maken een kaart niet
     gevuld. */
  function kaart(bron, tak, rol) {
    bron = bron || {};
    var blokken = [], data = 0;
    var rdw = bron.rdw, v = bron.voertuig || {};
    var naam = (rdw && rdw.naam && rdw.naam !== 'Onbekend voertuig') ? rdw.naam
      : [v.merk, v.model].filter(Boolean).join(' ') + (v.jaar ? ' (' + v.jaar + ')' : '');
    var koper = tak === 'handel' && (rol === 'koop' || rol === 'inkoop' || rol === 'occasion' || !rol);

    // 1. De papieren
    var labels = RDW_LABELS[tak] || [];
    var regels = rdw ? (rdw.regels || []).filter(function (r) { return labels.indexOf(r.label) > -1; }) : [];
    if (tak === 'storing') regels = regels.filter(function (r) { return r.ernst === 'rood'; });   // alleen een open terugroepactie
    (bron.recall || []).forEach(function (a) {
      regels.push({ ico: '🔔', label: 'Terugroepactie ' + (a.referentiecode || ''), waarde: (a.omschrijving || 'zie RDW') + (a.status ? ' — ' + a.status : ''), ernst: 'rood' });
    });
    if (regels.length) {
      var kop = tak === 'handel' && rol === 'verkoop' ? 'Wat een koper straks ziet (RDW)'
        : tak === 'verbruik' ? 'De fabrieksopgave — daar meten we tegen' : 'De papieren (RDW)';
      blokken.push({ kop: kop, regels: regels, bron: 'RDW open data' });
      data++;
    }

    // 2. Het dossier en de laatste uitlezing — alleen voor je eigen auto
    if (tak !== 'handel') {
      var dp = ((bron.dossier && bron.dossier.punten) || []).map(function (p) {
        return { ico: p.ernst === 'rood' ? '🔴' : p.ernst === 'oranje' ? '🟠' : 'ℹ️', label: p.tekst, waarde: '', ernst: p.ernst };
      });
      if (dp.length) { blokken.push({ kop: 'Uit je dossier', regels: dp }); data++; }
      if (tak === 'storing' || tak === 'conditie') {
        var cs = codesUit(bron.scan);
        if (cs.length) { blokken.push({ kop: 'De laatste foutcode-uitlezing', regels: cs }); data++; }
        else if (bron.scan && bron.scan.tijd) { blokken.push({ kop: 'De laatste foutcode-uitlezing', regels: [{ ico: '✅', label: 'Geen foutcodes', waarde: '', ernst: 'groen' }] }); data++; }
      }
    }

    // 3. Merkkennis
    var kennis = bron.kennis;
    var zwak = (kennis && kennis.zwak) || [];
    if (zwak.length && tak !== 'verbruik' && tak !== 'voorbereiding') {
      var kr = zwak.map(function (z) { return { ico: '🔧', label: z, waarde: '', ernst: null }; });
      if (kennis.let_op) kr.push({ ico: '💡', label: kennis.let_op, waarde: '', ernst: 'info' });
      blokken.push({ kop: 'Let bij ' + (kennis.merk ? kennis.merk.charAt(0).toUpperCase() + kennis.merk.slice(1) : 'dit merk') + ' op',
        regels: kr, bron: 'PidLane-merktabel — per merk, niet per model' });
      data++;
    }

    // 4. Proefrit — voor wie de auto gaat beoordelen
    if (koper) {
      var pp = proefritPunten(zwak).punten;
      blokken.push({ kop: 'Bij de auto en tijdens de proefrit', regels: pp.map(function (t) { return { ico: '👀', label: t, waarde: '', ernst: null }; }) });
    }

    // 5. Wat de app niet weet
    if (koper) {
      blokken.push({ kop: 'Wat de app niet weet', regels: [{ ico: '❔', label: 'Schadehistorie',
        waarde: 'staat niet in de open RDW-data. Vraag de verkoper ernaar en laat hem op papier zetten wat er hersteld is, of vraag een historierapport op bij een betaalde dienst.', ernst: null }] });
    }
    if (bron.fout) blokken.push({ kop: 'Niet gelukt', regels: [{ ico: '⚠️', label: bron.fout, waarde: '', ernst: 'oranje' }] });

    return { naam: naam, blokken: blokken, leeg: data === 0, advies: tak === 'handel' || tak === 'conditie' ? adviesMeting(zwak) : null };
  }

  /* De vraag aan de AI voor "Meer over dit model". Puur, zodat de test kan
     zien dat er geen kenteken of VIN in staat. */
  function aiPrompt(bron) {
    var v = bron.voertuig || {}, r = bron.rdw || {};
    var merk = r.merk || v.merk || '', model = r.model || v.model || '', jaar = r.jaar || v.jaar || '';
    var brandstof = v.brandstof || '';
    return 'Je helpt iemand die een gebruikte auto beoordeelt. Auto: ' + [merk, model, jaar].filter(Boolean).join(' ') +
      (brandstof ? ' (' + brandstof + ')' : '') + '.\n' +
      'Noem de bekende zwakke punten van precies dit model en bouwjaar: roest en carrosserie, motor, versnellingsbak, elektronica. ' +
      'Per punt één regel: waar het zit en hoe je het bij een bezichtiging of proefrit herkent. Hoogstens acht regels, Nederlands, ' +
      'zonder inleiding. Weet je het voor dit model niet zeker, zeg dat dan in plaats van iets algemeens te noemen.';
  }

  // ════════════════════════════════════════════════════════════════
  //  DE APP
  // ════════════════════════════════════════════════════════════════
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function voertuig() {
    try {
      var v = (typeof getVehicle === 'function' && getVehicle()) || {};
      return { merk: v.merk || v.make || '', model: v.model || '', jaar: v.year || v.jaar || '', brandstof: v.brandstof || '' };
    } catch (e) { console.warn('PLWeten: voertuig onleesbaar', e); return {}; }
  }
  function mijnKenteken() {
    try { return String(localStorage.getItem('pl_kenteken') || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
    catch (e) { console.warn('PLWeten: kenteken onleesbaar', e); return ''; }
  }

  /* Wat er zonder net al bekend is. Bepaalt ook of het zin heeft te wachten
     op het net: zonder kenteken valt er bij het RDW niets te halen. */
  function lokaal(tak) {
    var b = { voertuig: voertuig(), rdw: null, recall: null, dossier: null, scan: null, kennis: null, fout: null };
    if (tak !== 'handel') {
      try { if (window.PLGarage && PLGarage.actief && PLGarage._kern) { var a = PLGarage.actief(); if (a) b.dossier = PLGarage._kern.status(a, Date.now()); } }
      catch (e) { console.warn('PLWeten: dossier niet gelezen', e); }
      try { if (window.PLFoutcodes && PLFoutcodes.staat) b.scan = PLFoutcodes.staat().scan || null; }
      catch (e) { console.warn('PLWeten: foutcode-uitlezing niet gelezen', e); }
    }
    return b;
  }
  function kennisVoor(b) {
    var merk = (b.rdw && b.rdw.merk) || (b.voertuig && b.voertuig.merk) || '';
    var bs = (b.voertuig && b.voertuig.brandstof) || '';
    if (b.rdw) (b.rdw.regels || []).forEach(function (r) { if (r.label === 'Brandstof') bs = r.waarde; });
    try { return typeof autoKennisVoorMerk === 'function' ? autoKennisVoorMerk(merk, bs) : null; }
    catch (e) { console.warn('PLWeten: merkkennis niet gelezen', e); return null; }
  }

  /* opts = { tak, kent }. Bij handel alleen het ingevulde kenteken: de auto
     die je wilt kopen is niet je eigen auto. Bij verbruik je eigen kenteken,
     voor de fabrieksopgave. */
  async function verzamel(opts) {
    opts = opts || {};
    var tak = opts.tak;
    var b = lokaal(tak);
    var kent = tak === 'handel' ? String(opts.kent || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      : tak === 'verbruik' ? mijnKenteken() : '';
    if (kent && window.PLZonder && typeof PLZonder.haal === 'function') {
      try {
        var d = await PLZonder.haal(kent);
        if (d) b.rdw = d.overzicht;
        else b.fout = kent + ' staat niet bij het RDW — controleer op een typefout.';
      } catch (e) {
        console.warn('PLWeten: RDW niet opgehaald', e);
        b.fout = 'RDW niet bereikbaar: ' + (e && e.message ? e.message : e);
      }
      if (tak === 'handel' && b.rdw && window.PLRecall && typeof PLRecall.check === 'function') {
        try { var rc = await PLRecall.check(kent); b.recall = ((rc && rc.acties) || []).filter(function (a) { return a.open; }); }
        catch (e) { console.warn('PLWeten: terugroepacties niet opgehaald — de RDW-vlag blijft staan', e); }
      }
    }
    b.kennis = kennisVoor(b);
    return b;
  }
  /* Is er zonder net iets te tonen, of komt er nog iets van het net? */
  function verwacht(opts) {
    opts = opts || {};
    var b = lokaal(opts.tak);
    b.kennis = kennisVoor(b);
    var net = opts.tak === 'handel' ? !!opts.kent : opts.tak === 'verbruik' ? !!mijnKenteken() : false;
    return { net: net, leeg: kaart(b, opts.tak, opts.rol).leeg };
  }

  // ── Weergave ────────────────────────────────────────────────────
  var CSS =
    '.plw{margin:0 0 14px;padding:12px 13px;border-radius:14px;border:1px solid var(--bd);background:var(--sur2);font-family:var(--f);color:var(--tx)}' +
    '.plw-kop{font-size:13px;font-weight:800;margin-bottom:2px}' +
    '.plw-naam{font-size:15px;font-weight:800;margin:2px 0 6px}' +
    '.plw-b{margin-top:10px}' +
    '.plw-bh{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--tx3);margin-bottom:4px}' +
    '.plw-r{display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px solid var(--bd);font-size:12.5px;line-height:1.45}' +
    '.plw-r b{font-weight:700}.plw-r .rood{color:var(--rd)}.plw-r .oranje{color:var(--or)}.plw-r .groen{color:var(--gn)}' +
    '.plw-bron{font-size:10.5px;color:var(--tx3);margin-top:3px}' +
    '.plw-st{font-size:12px;color:var(--tx3)}' +
    '.plw-ai{margin-top:10px;padding:10px 11px;border-radius:10px;border:1px dashed var(--bd);background:var(--sur);font-size:12.5px;line-height:1.5;white-space:pre-wrap}' +
    '.plw-k{margin-top:10px;padding:9px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-family:var(--f);font-size:12.5px;font-weight:800;cursor:pointer}';
  function zorgCss() {
    if (el('plWetenCss')) return;
    var s = document.createElement('style'); s.id = 'plWetenCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function html(m, opts) {
    opts = opts || {};
    var h = '<div class="plw"><div class="plw-kop">📋 Wat we al weten</div>';
    if (m.naam) h += '<div class="plw-naam">' + esc(m.naam) + '</div>';
    m.blokken.forEach(function (b) {
      h += '<div class="plw-b"><div class="plw-bh">' + esc(b.kop) + '</div>';
      b.regels.forEach(function (r) {
        h += '<div class="plw-r"><span>' + r.ico + '</span><span><b' + (r.ernst ? ' class="' + r.ernst + '"' : '') + '>' + esc(r.label) + '</b>' +
          (r.waarde ? ' — ' + esc(r.waarde) : '') + '</span></div>';
      });
      if (b.bron) h += '<div class="plw-bron">Bron: ' + esc(b.bron) + '</div>';
      h += '</div>';
    });
    if (opts.ai) h += '<div id="plwAi"></div><button type="button" class="plw-k" id="plwAiKnop" onclick="PLWeten._ai()">🤖 Meer over dit model (AI, kost tegoed)</button>';
    return h + '</div>';
  }

  var _laatste = null;   // { bron } van de laatst getekende kaart, voor de AI-knop
  // Terugbladeren in de wizard tekent de kaart opnieuw; dan niet opnieuw het
  // RDW vragen. Kort bewaard: een APK of terugroepactie verandert niet per minuut.
  var CACHE_MS = 10 * 60 * 1000, _cache = {};
  function sleutel(o) { return [o.tak, o.rol || '', String(o.kent || '').toUpperCase().replace(/[^A-Z0-9]/g, '')].join('|'); }
  /* Tekent de kaart in `doel`. opts = { tak, rol, kent, klaar(model) }.
     klaar() krijgt het model zodra alles binnen is — ook als hij leeg is,
     zodat de aanroeper kan besluiten de stap over te slaan. */
  async function teken(doel, opts) {
    opts = opts || {};
    if (!doel) return null;
    zorgCss();
    doel.innerHTML = '<div class="plw"><div class="plw-kop">📋 Wat we al weten</div><div class="plw-st">⏳ Even opzoeken…</div></div>';
    var k = sleutel(opts), c = _cache[k], b;
    if (c && Date.now() - c.t < CACHE_MS) b = c.b;
    else { b = await verzamel(opts); _cache[k] = { t: Date.now(), b: b }; }
    var m = kaart(b, opts.tak, opts.rol);
    _laatste = { bron: b };
    if (!doel.isConnected) return m;
    var kanAi = opts.tak === 'handel' && !!((b.rdw && b.rdw.merk) || (b.voertuig && b.voertuig.merk));
    doel.innerHTML = m.leeg && !m.blokken.length ? '' : html(m, { ai: kanAi });
    if (typeof opts.klaar === 'function') {
      try { opts.klaar(m); } catch (e) { console.warn('PLWeten: vervolg na de kaart mislukt', e); }
    }
    return m;
  }

  async function ai() {
    var vak = el('plwAi'), knop = el('plwAiKnop');
    if (!vak || !_laatste) return;
    if (typeof apiFetch !== 'function') { vak.innerHTML = '<div class="plw-ai">De AI is in deze versie niet beschikbaar.</div>'; return; }
    if (knop) { knop.disabled = true; knop.textContent = '⏳ De AI zoekt het op…'; }
    try {
      var t = String(await apiFetch(aiPrompt(_laatste.bron), 600, null, null, { meet: false }) || '').trim();
      vak.innerHTML = '<div class="plw-ai"><b>Volgens de AI — niet geverifieerd</b>\n' + esc(t || 'De AI gaf geen antwoord.') + '</div>';
      if (knop) knop.style.display = 'none';
    } catch (e) {
      console.warn('PLWeten: AI-aanvulling mislukt', e);
      vak.innerHTML = '<div class="plw-ai">De AI is nu niet bereikbaar: ' + esc(e && e.message ? e.message : e) + '</div>';
      if (knop) { knop.disabled = false; knop.textContent = '🤖 Opnieuw proberen'; }
    }
  }

  window.PLWeten = {
    teken: teken,
    verzamel: verzamel,
    verwacht: verwacht,
    _ai: ai,
    // pure kern — voor test-weten.js
    _kern: { proefritPunten: proefritPunten, adviesMeting: adviesMeting, kaart: kaart, aiPrompt: aiPrompt, RDW_LABELS: RDW_LABELS, PROEF: PROEF }
  };
})();
