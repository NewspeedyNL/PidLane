// ══════════════════════════════════════════════════════════════════
// test-meetcontext.js — de vragen vóór de analyse komen ook bij de AI aan
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Issue #62 (30-08-2026): vóór een analyse werd alleen gevraagd of eerder
// gemaakte data hergebruikt mag worden. Wat ontbrak zijn een paar korte
// vragen over de meting zelf, zodat de AI geen verkeerde conclusie trekt
// uit iets wat normaal gedrag is.
//
// Start/stop is daar het duidelijkste voorbeeld van: een motor die bij
// stilstand uit gaat ziet er in de data uit als afslaan — toerental naar 0,
// spanning zakt in. Zonder die vraag kán de AI dat verschil niet maken.
//
// Een venster met vragen is pas nuttig als de antwoorden ook echt in de
// prompt terechtkomen. Dat is waar deze test op zit: het pad van klik naar
// promptregel, en niet alleen of het venster te openen valt.
//
// GEDRAGSTEST, GEEN BRONCONTROLE
// Het blok uit pidlane-archief.js draait hier echt, tegen een DOM- en
// opslagnabootsing. De vragenlijst PL_VOORVRAGEN staat NIET nagebouwd in dit
// bestand: er komt een vraag bij door hem daar toe te voegen, en deze test
// leest hem gewoon mee.
//
// Draaien vanuit public/:  node test-meetcontext.js      (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

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
  console.log('        de controle bleef stil terwijl hij "' + moetNoemen + '" had moeten noemen');
  console.log('        kreeg: ' + (gemeten.length ? gemeten.join(' | ') : '(niets)'));
}

// ── het blok uit pidlane-archief.js ──────────────────────────────
const ARCHIEF = fs.readFileSync('pidlane-archief.js', 'utf8');
function knip(van, tot) {
  const i = ARCHIEF.indexOf(van), j = ARCHIEF.indexOf(tot);
  if (i < 0 || j < 0 || j <= i) throw new Error('"' + van + '" niet uit pidlane-archief.js te knippen — is het hernoemd?');
  return ARCHIEF.slice(i, j);
}
const BRON = knip('window._srUseContext = null;', 'function srSetCtxMode(m){');

// ── DOM-nabootsing ───────────────────────────────────────────────
// Alleen wat het blok echt gebruikt. querySelector(All) draait op een
// tabel die de test zelf vult; de module krijgt daarmee echte knopjes waar
// hij zijn onclick op hangt, zodat een klik hier ook een klik is.
function Element(tag) {
  this.tagName = tag; this.id = ''; this.className = ''; this.innerHTML = '';
  this.style = { display: '' }; this.dataset = {}; this.onclick = null;
  this.value = ''; this.checked = false; this.children = [];
  this._sel = {};
  const zelf = this;
  Object.defineProperty(this, 'classList', {
    get: function () {
      return {
        add: function (c) { if (!zelf.className.split(/\s+/).includes(c)) zelf.className = (zelf.className + ' ' + c).trim(); },
        remove: function (c) { zelf.className = zelf.className.split(/\s+/).filter(function (x) { return x && x !== c; }).join(' '); },
        contains: function (c) { return zelf.className.split(/\s+/).includes(c); }
      };
    }
  });
}
Element.prototype.appendChild = function (k) { this.children.push(k); return k; };
Element.prototype.querySelectorAll = function (sel) { return this._sel[sel] || []; };
Element.prototype.querySelector = function (sel) { return (this._sel[sel] || [])[0] || null; };

function knop(vraag, waarde) {
  const b = new Element('button');
  b.className = 'pl-vk';
  b.dataset = { vraag: vraag, waarde: waarde };
  return b;
}

function maakOmgeving(opties) {
  opties = opties || {};
  const reg = {};
  const gemaakt = [];
  const ctx = {
    document: {
      getElementById: function (id) { return reg[id] || null; },
      createElement: function (t) { const e = new Element(t); gemaakt.push(e); return e; },
      body: new Element('body')
    },
    console: { warn: function () {}, log: function () {} },
    logUsage: function () {},
    activePIDs: new Set(opties.pids || []),
    pidHist: opties.hist || {},
    dataStable: opties.stabiel !== false,
    _sessionReports: [],
    // De vragen staan sinds 24-09-2026 standaard uit (feat_voorvragen). De
    // toetsen hieronder gaan over het venster zelf, dus hier staat hij aan;
    // `vragenUit` toetst de standaard. _cfgBool is niet het onderwerp.
    PID_CONFIG: { feat_voorvragen: opties.vragenUit ? undefined : true },
    _cfgBool: function (v, def) { return v === undefined || v === null || v === '' ? def : (v === true || v === 'true' || v === '1' || v === 1); }
  };
  // De aandrijfstatus, zoals pidlane-aandrijving.js hem aanlevert. Niet de
  // hele module: het voorstel leest één uitkomst van laatste(), en dát is wat
  // hier nagebootst wordt. Laat `opties.stand` weg en er is geen module —
  // precies het geval "de balk is nog niet geladen".
  if (opties.stand !== undefined) {
    ctx.PLAandrijving = { laatste: function () { return opties.stand; } };
  }
  // Het register van waarnemingen per auto (#225). Ook hier alleen wat het
  // voorstel werkelijk leest: één uitkomst van lees(). Laat `opties.waarneming`
  // weg en er is geen register — dat is elke schil van vóór 17-09, en het
  // voorstel hoort dan te doen wat het daarvoor deed.
  if (opties.waarneming !== undefined) {
    ctx.PLWaarneming = { lees: function () { return opties.waarneming; } };
  }
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(opties.bron || BRON, ctx, { filename: 'pidlane-archief.js (voor de analyse)' });
  ctx.reg = reg;
  ctx.gemaakt = gemaakt;
  return ctx;
}

// Een reeks metingen op vast ritme, met eventueel één gat erin.
function reeks(n, stap, gatNa) {
  const uit = []; let t = 1000;
  for (let i = 0; i < n; i++) {
    uit.push({ t: t, v: 10 + i });
    t += (gatNa != null && i === gatNa) ? stap * 12 : stap;
  }
  return uit;
}

// ── 1. de promptregel ────────────────────────────────────────────
function keurPromptregel() {
  const ctx = maakOmgeving();
  const uit = [];

  if (ctx.plMeetcontextPromptLine() !== '')
    uit.push('zonder ingevulde meetcontext komt er tóch een promptregel');

  ctx.window._plMeetcontext = { startstop: 'ja', klacht: 'nee', stabiel: '', extra: '' };
  const t = ctx.plMeetcontextPromptLine();
  if (t.indexOf('MEETCONTEXT') < 0) uit.push('het blok heeft geen herkenbare kop');
  if (!/start\/stop/i.test(t)) uit.push('"start/stop is actief" komt niet in de prompt terecht');
  if (!/NIET voor/i.test(t)) uit.push('"de klacht deed zich niet voor" komt niet in de prompt terecht');
  if (/onderbrekingen of gaten/i.test(t))
    uit.push('een onbeantwoorde vraag ("weet ik niet") levert tóch een regel op');

  // De AI moet bij "klacht deed zich niet voor" NIET concluderen dat er niets
  // aan de hand is. Dat is de hele reden dat die vraag er staat.
  if (t.indexOf('kan de klacht niet ontkrachten') < 0)
    uit.push('de prompt waarschuwt niet dat afwezigheid van de klacht niets bewijst');

  ctx.window._plMeetcontext = { startstop: '', klacht: '', stabiel: '', extra: 'Distributieriem vorige week vervangen' };
  const t2 = ctx.plMeetcontextPromptLine();
  if (t2.indexOf('Distributieriem vorige week vervangen') < 0)
    uit.push('de vrije opmerking komt niet in de prompt terecht');

  ctx.window._plMeetcontext = { startstop: '', klacht: '', stabiel: '', extra: '' };
  if (ctx.plMeetcontextPromptLine() !== '')
    uit.push('alles op "weet ik niet" levert een leeg blok op in plaats van geen blok');
  return uit;
}

// ── 2. het voorstel voor de stabiliteitsvraag ────────────────────
function keurStabielVoorstel() {
  const uit = [];

  const gaaf = maakOmgeving({ pids: ['010C', '0105'], hist: { '010C': reeks(30, 1000), '0105': reeks(30, 1000) } });
  if (gaaf.plMeetStabielVoorstel().waarde !== 'ja')
    uit.push('een aaneengesloten reeks levert geen voorstel "ja"');

  const gat = maakOmgeving({ pids: ['010C', '0105'], hist: { '010C': reeks(30, 1000, 12), '0105': reeks(30, 1000) } });
  const v = gat.plMeetStabielVoorstel();
  if (v.waarde !== 'nee') uit.push('een reeks met een gat van 12 seconden levert voorstel "' + v.waarde + '"');
  if (v.reden.indexOf('1 van de 2') < 0) uit.push('de reden noemt niet hoeveel sensoren een gat hebben: "' + v.reden + '"');

  const leeg = maakOmgeving({ pids: ['010C'], hist: { '010C': reeks(2, 1000) } });
  if (leeg.plMeetStabielVoorstel().waarde !== '')
    uit.push('met twee metingen wordt er al een uitspraak over stabiliteit gedaan');

  // Geen gaten, maar de datastroom is nog niet stabiel gemeld: dan geen "ja".
  const onrustig = maakOmgeving({ pids: ['010C'], hist: { '010C': reeks(30, 1000) }, stabiel: false });
  if (onrustig.plMeetStabielVoorstel().waarde !== '')
    uit.push('zonder stabiele datastroom wordt er tóch "ja" voorgesteld');

  // Een trage sensor (60 s ritme) mag niet als gat tellen puur omdat hij traag is.
  const traag = maakOmgeving({ pids: ['0146'], hist: { '0146': reeks(20, 60000) } });
  if (traag.plMeetStabielVoorstel().waarde !== 'ja')
    uit.push('een sensor die elke 60 seconden meet wordt als onderbroken gezien');
  return uit;
}

// ── 2b. het voorstel voor de start/stop-vraag (#64) ──────────────
// Deze vraag werd tot 17-09-2026 blind gesteld. Sinds er een aandrijfstatus
// is, weet de app het vaak zelf — maar alleen één kant op. Wat hier moet
// onderscheiden worden is precies die asymmetrie: "gezien" mag "ja" opleveren,
// "niet gezien" mag NOOIT "nee" opleveren.
function keurStartStopVoorstel() {
  const uit = [];

  const zonder = maakOmgeving();
  if (zonder.plMeetStartStopVoorstel().waarde !== '')
    uit.push('zonder aandrijfmodule wordt er tóch een antwoord voorgesteld');

  const nietsGemeten = maakOmgeving({ stand: null });
  if (nietsGemeten.plMeetStartStopVoorstel().waarde !== '')
    uit.push('zonder aandrijfstand wordt er tóch een antwoord voorgesteld');

  const nu = maakOmgeving({ stand: { toestand: 'STARTSTOP', startStopGezien: true, heeftGedraaid: true } });
  const a = nu.plMeetStartStopVoorstel();
  if (a.waarde !== 'ja') uit.push('een lopende start/stop-stop levert voorstel "' + a.waarde + '"');
  if (a.reden.indexOf('stilstaat') < 0) uit.push('de reden zegt niet waaróp het voorstel rust: "' + a.reden + '"');

  // DE KERN. De stop is voorbij, de motor draait weer — en dat is het
  // gewone geval, want je drukt op Analyseer nadat je gereden hebt.
  const eerder = maakOmgeving({ stand: { toestand: 'DRAAIT_RIJDT', startStopGezien: true, heeftGedraaid: true } });
  if (eerder.plMeetStartStopVoorstel().waarde !== 'ja')
    uit.push('een eerder waargenomen start/stop-stop telt niet meer zodra de motor weer draait');

  // DE ASYMMETRIE. Niets gezien is geen bewijs van het tegendeel: dit mag
  // "weet ik niet" worden en nooit "nee".
  const gereden = maakOmgeving({ stand: { toestand: 'DRAAIT_RIJDT', startStopGezien: false, heeftGedraaid: true } });
  const g = gereden.plMeetStartStopVoorstel();
  if (g.waarde !== '') uit.push('niets gezien levert voorstel "' + g.waarde + '" in plaats van geen oordeel');
  if (g.reden.indexOf('stilstond') < 0)
    uit.push('de reden legt niet uit dat niet-zien geen bewijs is: "' + g.reden + '"');

  const koud = maakOmgeving({ stand: { toestand: 'UIT_VOOR_START', startStopGezien: false, heeftGedraaid: false } });
  const k = koud.plMeetStartStopVoorstel();
  if (k.waarde !== '') uit.push('met een motor die nooit draaide wordt er tóch iets voorgesteld');
  if (k.reden.indexOf('nog niet gedraaid') < 0)
    uit.push('de reden noemt niet dat de motor nog niet gedraaid heeft: "' + k.reden + '"');

  /* HET REGISTER PER AUTO (#225). Tot vandaag begon deze vraag elke sessie
     opnieuw op nul, terwijl het antwoord een eigenschap van de AUTO is die
     nooit verandert. Drie gevallen, en het middelste is het gewone: je rijdt,
     je staat deze rit niet lang genoeg stil, en de app weet het toch. */
  const gisteren = { status: 'gezien', wanneer: Date.now() - 86400000, bron: 'meting', reikwijdte: 'auto' };
  const rijdt = { toestand: 'DRAAIT_RIJDT', startStopGezien: false, heeftGedraaid: true };

  const bekend = maakOmgeving({ stand: rijdt, waarneming: gisteren });
  const b = bekend.plMeetStartStopVoorstel();
  if (b.waarde !== 'ja') uit.push('een waarneming van een eerdere rit op deze auto telt niet mee: voorstel "' + b.waarde + '"');
  if (b.reden.indexOf('eerder') < 0) uit.push('de reden zegt niet dat het om een eerdere waarneming gaat: "' + b.reden + '"');

  // De enige bron die 'nee' mag zeggen is een mens, en die hoeft dat per auto
  // één keer te doen.
  const weerlegd = maakOmgeving({ stand: rijdt, waarneming: { status: 'weerlegd', wanneer: Date.now() - 3600000, bron: 'mens', reikwijdte: 'auto' } });
  const wl = weerlegd.plMeetStartStopVoorstel();
  if (wl.waarde !== 'nee') uit.push('een weerlegging van de gebruiker levert voorstel "' + wl.waarde + '" in plaats van "nee"');

  // EN DE ASYMMETRIE HOUDT OOK MÉT REGISTER STAND. Een register dat niets
  // weet mag nooit als 'nee' gelezen worden — dat is dezelfde fout als
  // hierboven, alleen een laag dieper.
  const leeg = maakOmgeving({ stand: rijdt, waarneming: { status: 'onbekend', wanneer: null, bron: null, reikwijdte: 'auto' } });
  if (leeg.plMeetStartStopVoorstel().waarde !== '')
    uit.push('een leeg register levert een antwoord op in plaats van geen oordeel');
  return uit;
}

// ── 3. het venster: alleen vragen wat er te vragen valt ──────────
function keurGeenVensterZonderVraag() {
  const ctx = maakOmgeving();
  ctx.window._plMeetcontext = { startstop: 'ja', klacht: '', stabiel: '', extra: '' };
  ctx.window._srUseContext = true;
  const voor = ctx.gemaakt.length;
  let uitkomst = null;
  ctx.plVoorAnalyse(true).then(function (r) { uitkomst = r; });
  const uit = [];
  if (ctx.gemaakt.length !== voor) uit.push('er wordt een venster opgebouwd terwijl alles al beantwoord is');
  return { uit: uit, wacht: function () { return uitkomst; } };
}

// Het volledige pad: venster openen, drie vragen beantwoorden, op Analyseer
// drukken, en kijken of dat in de promptregel terechtkomt.
function keurAntwoordenKomenAan() {
  const ctx = maakOmgeving({ pids: ['010C'], hist: { '010C': reeks(30, 1000) } });
  const uit = [];

  // De knoppen die de module straks in het venster zou vinden.
  const knoppen = [
    knop('startstop', 'ja'), knop('startstop', 'nee'), knop('startstop', ''),
    knop('klacht', 'ja'), knop('klacht', 'nee'), knop('klacht', ''),
    knop('stabiel', 'ja'), knop('stabiel', 'nee'), knop('stabiel', '')
  ];
  const go = new Element('button'), skip = new Element('button');
  const extra = new Element('input'); extra.id = 'plVaExtra'; extra.value = 'Koude ochtend, aanhanger achter de auto';
  ctx.reg['plVaExtra'] = extra;

  // createElement geeft het overlay-element terug; daar hangen we de tabel
  // aan die querySelector(All) leest.
  const echteCreate = ctx.document.createElement;
  ctx.document.createElement = function (t) {
    const e = echteCreate(t);
    e._sel['.pl-vk'] = knoppen;
    knoppen.forEach(function (b) {
      const s = '.pl-vk[data-vraag="' + b.dataset.vraag + '"]';
      (e._sel[s] = e._sel[s] || []).push(b);
    });
    e._sel['#srCtxGo'] = [go];
    e._sel['#srCtxSkip'] = [skip];
    ctx.reg['srCtxAsk'] = e;
    return e;
  };

  let uitkomst = null;
  ctx.plVoorAnalyse(false).then(function (r) { uitkomst = r; });

  if (!go.onclick) return ['het venster heeft geen Analyseer-knop gekregen'];

  // Klikken zoals een gebruiker dat doet.
  knoppen.filter(function (b) { return b.dataset.vraag === 'startstop' && b.dataset.waarde === 'ja'; })[0].onclick();
  knoppen.filter(function (b) { return b.dataset.vraag === 'klacht' && b.dataset.waarde === 'nee'; })[0].onclick();
  go.onclick();

  const m = ctx.window._plMeetcontext;
  if (!m) return ['na Analyseer is er geen meetcontext vastgelegd'];
  if (m.startstop !== 'ja') uit.push('start/stop staat op "' + m.startstop + '" in plaats van "ja"');
  if (m.klacht !== 'nee') uit.push('de klachtvraag staat op "' + m.klacht + '" in plaats van "nee"');
  // De stabiliteitsvraag is niet aangeklikt: het voorstel uit de meting hoort
  // te blijven staan, anders is voorvullen alleen versiering.
  if (m.stabiel !== 'ja') uit.push('het voorstel voor stabiliteit ("ja") is niet overgenomen, maar "' + m.stabiel + '"');
  if (m.extra.indexOf('aanhanger') < 0) uit.push('het vrije tekstveld is niet opgeslagen');
  /* En wie het antwoord gaf. Zonder dat onderscheid telt een blijven-staand
     voorstel als een antwoord, en dan meet punt 3 van #64 zichzelf kapot. */
  if (!m.bron) uit.push('er wordt niet vastgelegd waar de antwoorden vandaan komen');
  else {
    if (m.bron.startstop !== 'klik')
      uit.push('een aangeklikt antwoord staat als "' + m.bron.startstop + '" in plaats van "klik"');
    if (m.bron.stabiel !== 'voorstel')
      uit.push('een overgenomen voorstel staat als "' + m.bron.stabiel + '" in plaats van "voorstel"');
  }

  const t = ctx.plMeetcontextPromptLine();
  if (!/start\/stop/i.test(t)) uit.push('de aangeklikte start/stop komt niet in de promptregel');
  if (t.indexOf('aanhanger') < 0) uit.push('de opmerking komt niet in de promptregel');
  return uit;
}

/* Wat voorgevuld staat, telt ook als er niets aangeklikt wordt. Een voorstel
   dat je eerst moet bevestigen is geen voorstel maar een extra handeling.
   Deze proef opent het venster met een waargenomen start/stop-stop, klikt
   NIETS aan, en drukt op Analyseer. */
function keurVoorvullenStartStop() {
  const ctx = maakOmgeving({ stand: { toestand: 'DRAAIT_RIJDT', startStopGezien: true, heeftGedraaid: true } });
  const go = new Element('button'), skip = new Element('button');
  const echteCreate = ctx.document.createElement;
  ctx.document.createElement = function (t) {
    const e = echteCreate(t);
    e._sel['.pl-vk'] = []; e._sel['#srCtxGo'] = [go]; e._sel['#srCtxSkip'] = [skip];
    ctx.reg['srCtxAsk'] = e;
    return e;
  };
  ctx.plVoorAnalyse(false);
  if (!go.onclick) return ['het venster heeft geen Analyseer-knop gekregen'];
  go.onclick();

  const uit = [];
  const m = ctx.window._plMeetcontext;
  if (!m) return ['na Analyseer is er geen meetcontext vastgelegd'];
  if (m.startstop !== 'ja')
    uit.push('de waargenomen start/stop is niet voorgevuld: "' + m.startstop + '"');
  if (!/start\/stop is actief/i.test(ctx.plMeetcontextPromptLine()))
    uit.push('en hij komt dus ook niet in de promptregel terecht');
  if (!m.bron || m.bron.startstop !== 'voorstel')
    uit.push('een niet-aangeklikt voorstel wordt als antwoord van de gebruiker geboekt: "' +
      (m.bron ? m.bron.startstop : 'geen bron') + '"');

  // TEGENPROEF: zonder waarneming mag er niets voorgevuld staan. Zonder deze
  // helft blijft de controle hierboven ook groen op een venster dat altijd
  // "ja" invult.
  const blind = maakOmgeving({ stand: { toestand: 'DRAAIT_RIJDT', startStopGezien: false, heeftGedraaid: true } });
  const go2 = new Element('button');
  const echteCreate2 = blind.document.createElement;
  blind.document.createElement = function (t) {
    const e = echteCreate2(t);
    e._sel['.pl-vk'] = []; e._sel['#srCtxGo'] = [go2]; e._sel['#srCtxSkip'] = [new Element('button')];
    blind.reg['srCtxAsk'] = e;
    return e;
  };
  blind.plVoorAnalyse(false);
  if (go2.onclick) go2.onclick();
  if (blind.window._plMeetcontext && blind.window._plMeetcontext.startstop !== '')
    uit.push('zonder waarneming staat start/stop tóch voorgevuld op "' +
      blind.window._plMeetcontext.startstop + '"');
  return uit;
}

// Overslaan mag, maar dan moet het venster ook wegblijven — anders wordt het
// een klik die niemand meer leest.
function keurOverslaan() {
  const ctx = maakOmgeving();
  const go = new Element('button'), skip = new Element('button');
  const echteCreate = ctx.document.createElement;
  ctx.document.createElement = function (t) {
    const e = echteCreate(t);
    e._sel['#srCtxGo'] = [go]; e._sel['#srCtxSkip'] = [skip]; e._sel['.pl-vk'] = [];
    ctx.reg['srCtxAsk'] = e;
    return e;
  };
  ctx.plVoorAnalyse(false);
  if (!skip.onclick) return ['het venster heeft geen Overslaan-knop'];
  skip.onclick();
  const uit = [];
  if (ctx.window._plMeetcontext === null) uit.push('na Overslaan staat de meetcontext nog op "nog niet gevraagd"');
  if (ctx.plMeetcontextPromptLine() !== '') uit.push('Overslaan levert tóch een promptregel op');
  const voor = ctx.gemaakt.length;
  ctx.plVoorAnalyse(false);
  if (ctx.gemaakt.length !== voor) uit.push('het venster komt bij de volgende analyse opnieuw terug');
  return uit;
}

/* De standaard sinds 24-09-2026: geen venster, en wat de meting zelf zegt
   gaat zonder vraag mee. Een gat in de reeks en een geziene start/stop-stop
   moeten dus in de prompt staan, als door de app vastgesteld. */
function keurStandaardZonderVragen() {
  const ctx = maakOmgeving({ vragenUit: true, pids: ['010C'],
    hist: { '010C': reeks(40, 1000, 20) },
    stand: { toestand: 'RIJDT', startStopGezien: true, heeftGedraaid: true } });
  const uit = [];
  let opgelost = null;
  ctx.plVoorAnalyse(false).then(function (r) { opgelost = r; });
  if (ctx.gemaakt.length) uit.push('er verschijnt tóch een venster terwijl de vragen uit staan');
  const regel = ctx.plMeetcontextPromptLine();
  if (!/vastgesteld uit de meting/.test(regel)) uit.push('de promptregel zegt niet dat de app het zelf vaststelde: ' + JSON.stringify(regel.slice(0, 120)));
  if (!/start\/stop/i.test(regel)) uit.push('de geziene start/stop-stop gaat niet mee naar de AI');
  if (!/onderbrekingen|gaten/i.test(regel)) uit.push('het gat in de reeks gaat niet mee naar de AI');
  return { uit: uit, opgelost: function () { return opgelost; } };
}

/* Wegklikken of terug is annuleren, en Overslaan is dat niet (24-09-2026:
   na "terug" liep de analyse toch). */
function keurAnnulerenIsAnnuleren() {
  const uit = [];
  const ctx = maakOmgeving();
  const echt = ctx.document.createElement;
  ctx.document.createElement = function (t) {
    const e = echt(t);
    e._sel['#srCtxGo'] = [new Element('button')]; e._sel['#srCtxSkip'] = [new Element('button')]; e._sel['.pl-vk'] = [];
    ctx.reg['srCtxAsk'] = e; return e;
  };
  let r = null;
  ctx.plVoorAnalyse(false).then(function (x) { r = x; });
  if (typeof ctx.window._srCtxDismiss !== 'function') return Promise.resolve(['het venster kent geen wegklik-route']);
  ctx.window._srCtxDismiss();
  return new Promise(function (klaar) {
    setImmediate(function () {
      if (!r || r.geannuleerd !== true) uit.push('wegklikken lost niet op als geannuleerd: ' + JSON.stringify(r));
      // Tegenproef: Overslaan gaat door, zonder context.
      const ctx2 = maakOmgeving();
      const go = new Element('button'), skip = new Element('button');
      const echteCreate = ctx2.document.createElement;
      ctx2.document.createElement = function (t) {
        const e = echteCreate(t);
        e._sel['#srCtxGo'] = [go]; e._sel['#srCtxSkip'] = [skip]; e._sel['.pl-vk'] = [];
        ctx2.reg['srCtxAsk'] = e; return e;
      };
      let r2 = null;
      ctx2.plVoorAnalyse(false).then(function (x) { r2 = x; });
      skip.onclick();
      setImmediate(function () {
        if (!r2 || r2.geannuleerd) uit.push('TEGENPROEF: Overslaan annuleert de analyse, terwijl dat "ga door zonder context" is');
        klaar(uit);
      });
    });
  });
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Voor de analyse — de vragen komen bij de AI aan (issue #62)\n');

toetsSchoon('de antwoorden worden promptregels, "weet ik niet" niet', keurPromptregel());
toetsSchoon('het voorstel voor "stabiele meting" komt uit de meting zelf', keurStabielVoorstel());
toetsSchoon('het voorstel voor start/stop komt uit de aandrijfstatus, en durft geen "nee"', keurStartStopVoorstel());
toetsSchoon('is alles al beantwoord, dan komt er geen venster', keurGeenVensterZonderVraag().uit);
toetsSchoon('klikken → opslaan → promptregel', keurAntwoordenKomenAan());
toetsSchoon('een voorgevulde start/stop telt ook zonder klik', keurVoorvullenStartStop());
toetsSchoon('overslaan mag, en blijft dan ook weg', keurOverslaan());
toetsSchoon('standaard: geen vragen, de meting zelf gaat mee naar de AI (24-09-2026)', keurStandaardZonderVragen().uit);

// ── tegenproef ───────────────────────────────────────────────────
console.log('');
// Haal de start/stop-uitleg uit de vragenlijst weg: dan mag de promptregel
// er niet meer over gaan. Staat de controle dan nog groen, dan leest hij iets
// anders dan wat er werkelijk verstuurd wordt.
const ZONDER = BRON.replace(
  /ja:'Start\/stop is actief[^']*'/,
  "ja:'GEEN UITLEG'");
if (ZONDER === BRON) throw new Error('de tegenproef kon de start/stop-uitleg niet vervangen — is de tekst gewijzigd?');
toetsMeldt('zonder de start/stop-uitleg valt de promptregel door de mand (tegenproef)', (function () {
  const ctx = maakOmgeving({ bron: ZONDER });
  ctx.window._plMeetcontext = { startstop: 'ja', klacht: 'nee', stabiel: '', extra: '' };
  const t = ctx.plMeetcontextPromptLine();
  return /start\/stop/i.test(t) ? [] : ['"start/stop is actief" komt niet in de prompt terecht'];
})(), 'komt niet in de prompt terecht');

keurAnnulerenIsAnnuleren().then(function (uit) {
  toetsSchoon('wegklikken annuleert de analyse, Overslaan niet', uit);
  console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
  process.exit(fout ? 1 : 0);
});
