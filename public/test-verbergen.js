// ══════════════════════════════════════════════════════════════════
// test-verbergen.js — VERBERGEN IS GEEN UITZETTEN
// ──────────────────────────────────────────────────────────────────
// WAAROM DEZE TEST BESTAAT
//
// Tot 02-09-2026 deed een dubbeltik op een tegel twee dingen tegelijk: de PID
// uit de selectie halen (stoppen met meten — de pollus vraagt hem niet meer,
// de historie loopt leeg, de rit-opname en de analyse missen hem) én de tegel
// van het scherm halen. Eén handeling, twee betekenissen, en de dure helft
// was onzichtbaar: je klikte een tegel weg omdat hij in de weg stond en
// verloor er stilletjes een meting mee.
//
// Sindsdien zijn het twee dingen, en dat is precies wat hier getoetst wordt:
//
//   1. dubbeltik op een tegel VERBERGT — activePIDs blijft gelijk, en de
//      gedeelde selectiemelder (#31) hoort dan ook NIETS te melden;
//   2. de verborgen PIDs staan met een korte naam in een strook onderaan;
//   3. dubbeltik op zo'n naam haalt hem terug — één gebaar, één betekenis;
//   4. het kruisje in die strook is de ándere handeling: dát zet de sensor
//      echt uit, en dát meldt wél;
//   5. een PID die uit de selectie verdwijnt laat geen verborgen-spook
//      achter, want dan zou hij bij opnieuw aanvinken onzichtbaar blijven;
//   6. alles verborgen geeft een eigen lege staat en niet "geen sensoren
//      geselecteerd" — dat zou de verkeerde oorzaak noemen en je naar het
//      verkeerde scherm sturen;
//   7. het werkt in élke weergave, niet alleen in de slimme.
//
// Alles is gedrag: renderGauges(), pidTileTap(), pidVerberg(), pidToon() en
// renderVerborgenStrook() draaien echt uit pidlane-pids.js tegen een minimale
// DOM-nabootsing. Niets van die logica staat hier nagebouwd.
//
// Draaien vanuit public/:  node test-verbergen.js    (exit 0 = goed)
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

// ── de echte PID-definities ──────────────────────────────────────
const D = (function () {
  const s = {}; s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync('pidlane-data.js', 'utf8'), s, { filename: 'pidlane-data.js' });
  return s;
})();
const DEFS = D.ALL_PID_DEFS;

// ── de echte bron ────────────────────────────────────────────────
const PIDS_BRON = fs.readFileSync('pidlane-pids.js', 'utf8');
function knip(bron, van, tot, wat) {
  const i = bron.indexOf(van), j = bron.indexOf(tot);
  if (i < 0 || j < 0 || j <= i) throw new Error(wat + ' niet uit pidlane-pids.js te knippen — is het hernoemd?');
  return bron.slice(i, j);
}
const RENDER_BRON = knip(PIDS_BRON, 'function renderGauges(){', '// VERBERGEN IS GEEN UITZETTEN', 'renderGauges()');
// Van hiddenPIDs tot en met pidDeselect: verbergen, tonen, de strook, de
// dubbeltik-poort én het uitzetten. Die horen bij elkaar, want de hele vraag
// van deze test is of ze uit elkaar gehouden worden.
const VERBERG_BRON = knip(PIDS_BRON, 'const hiddenPIDs = new Set();', '\nfunction resetDataStream(', 'het verberg-blok');
const OORDEEL_BRON = knip(PIDS_BRON, 'function pidOordeel(', '\nfunction applyG(', 'pidOordeel()');
const SLIM_BRON = knip(PIDS_BRON, 'const SLIM_BEWEEG_DEEL', '\nfunction updPID(', 'het slim-blok');
// De echte afkorter, uit pidlane-neon.js. De strook belooft KORTE namen; met
// een nagebouwde afkorter zou die belofte niet getoetst worden.
const NEON_BRON = (function () {
  const bron = fs.readFileSync('pidlane-neon.js', 'utf8');
  const i = bron.indexOf('function hudShortLabel(name, max){');
  if (i < 0) throw new Error('hudShortLabel(name, max) niet gevonden in pidlane-neon.js — hernoemd of van handtekening veranderd?');
  const j = bron.indexOf('\nfunction ', i + 10);
  if (j < 0) throw new Error('het einde van hudShortLabel() is niet te vinden');
  return bron.slice(i, j);
})();

// ── DOM-nabootsing ───────────────────────────────────────────────
function Element(tag) {
  this.tagName = tag; this.id = ''; this.className = ''; this.title = '';
  this.textContent = ''; this._html = ''; this.children = [];
  this.style = { cssText: '', display: '', width: '' };
  this.onclick = null; this.type = '';
  const zelf = this;
  // innerHTML='' is in deze app de manier om een container leeg te maken.
  // Zonder dat de kinderen ook echt weggaan, zou een test een strook zien die
  // bij elke opbouw langer wordt en dat nooit merken.
  Object.defineProperty(this, 'innerHTML', {
    get: function () { return zelf._html; },
    set: function (v) {
      zelf._html = String(v);
      // Losmaken, niet alleen vergeten: een browser gooit de oude knopen weg
      // en getElementById vindt ze daarna niet meer. Zonder deze regel blijft
      // een weggegooide tegel via zijn parentNode "bereikbaar" en bewijst een
      // groene test iets wat de browser nooit doet.
      zelf.children.forEach(function (k) { k.parentNode = null; });
      zelf.children = [];
    }
  });
  Object.defineProperty(this, 'classList', {
    get: function () {
      return {
        add: function (c) { if (!zelf.className.split(/\s+/).includes(c)) zelf.className = (zelf.className + ' ' + c).trim(); },
        remove: function () {
          const weg = Array.prototype.slice.call(arguments);
          zelf.className = zelf.className.split(/\s+/).filter(function (x) { return x && weg.indexOf(x) < 0; }).join(' ');
        },
        toggle: function (c, aan) {
          const heeft = zelf.className.split(/\s+/).includes(c);
          if (aan === undefined) aan = !heeft;
          if (aan && !heeft) zelf.className = (zelf.className + ' ' + c).trim();
          if (!aan && heeft) zelf.className = zelf.className.split(/\s+/).filter(function (x) { return x && x !== c; }).join(' ');
        },
        contains: function (c) { return zelf.className.split(/\s+/).includes(c); }
      };
    }
  });
}
Element.prototype.appendChild = function (k) {
  if (k.parentNode && k.parentNode !== this) {
    const i = k.parentNode.children.indexOf(k);
    if (i > -1) k.parentNode.children.splice(i, 1);
  }
  this.children.push(k); k.parentNode = this; return k;
};
Element.prototype.removeAttribute = function () {};
Element.prototype.setAttribute = function () {};

function maakOmgeving(actief, weergave, verbergBron, renderBron) {
  const reg = {};
  ['gGrid', 'vasteData', 'pidViewSwitch', 'verborgenStrook'].forEach(function (id) {
    reg[id] = new Element('div'); reg[id].id = id;
  });
  const basis = Element.prototype.appendChild;
  Element.prototype.appendChild = function (k) {
    const r = basis.call(this, k);
    if (k && k.id) reg[k.id] = k;
    return r;
  };
  // Een element dat losgeknipt is, is voor getElementById niet meer te vinden.
  // De registratie hierboven onthoudt élk element dat ooit is aangemaakt, en
  // dat is precies één stap te veel: na een herbouw van het rooster hangen de
  // oude tegels nergens meer aan.
  const wortels = ['gGrid', 'vasteData', 'pidViewSwitch', 'verborgenStrook'].map(function (id) { return reg[id]; });
  const levend = function (el) {
    let n = el;
    while (n.parentNode) n = n.parentNode;
    return n === el ? wortels.indexOf(el) > -1 : wortels.indexOf(n) > -1;
  };

  const meldingen = [], toasts = [];
  const ctx = {
    document: {
      getElementById: function (id) { return (reg[id] && levend(reg[id])) ? reg[id] : null; },
      createElement: function (t) { return new Element(t); },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; }
    },
    console: { warn: function () {}, log: function () {} },
    activePIDs: new Set(actief),
    manualPIDs: new Set(),
    pidVals: {},
    pidHist: {},
    pidViewMode: weergave || 'slim',
    discoveredPIDDefs: actief.map(function (p) { return { pid: p }; }),
    _scenario: { enabled: false, pids: {} },
    LEEG_TIP: 'leeg',
    getPidDef: function (pid) { return DEFS[pid] || null; },
    pidIsTekst: function () { return false; },
    pidTegelLeeg: function () { return false; },
    fv: function (v) { return String(v); },
    applyG: function () {},
    PID_ALT_KANAAL: {},
    showToast: function (t) { toasts.push(String(t)); },
    // De gedeelde selectiemelder (#31). Verbergen hoort hier NIET langs te
    // komen; uitzetten wél. Dat verschil is de kern van deze test.
    plSelectieVoor: function () { return { n: 1 }; },
    plSelectieMeld: function (voor, aanleiding) { meldingen.push(String(aanleiding)); },
    rebuildGSel: function () {},
    setTimeout: function () { return 1; },
    clearTimeout: function () {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(NEON_BRON + '\n' + 'const HUD_LABEL_DICT = window.__dict;', ctx, { filename: 'pidlane-neon.js' });
  ctx.__dict = D.HUD_LABEL_DICT;
  vm.runInContext(OORDEEL_BRON + '\n' + (verbergBron || VERBERG_BRON) + '\n' + SLIM_BRON + '\n' +
    (renderBron || RENDER_BRON), ctx, { filename: 'pidlane-pids.js (verbergen)' });
  ctx.reg = reg;
  ctx.meldingen = meldingen;
  ctx.toasts = toasts;
  // pidTileTap heeft een poort van 420 ms; twee tikken achter elkaar in een
  // test vallen daar ruim binnen.
  ctx.dubbeltik = function (pid) { ctx.pidTileTap(pid); ctx.pidTileTap(pid); };
  return ctx;
}

// Welke PIDs staan er als tegel in beeld? Over alle vakken heen, zodat het
// antwoord niet aan de gekozen weergave hangt.
function tegelsIn(ctx) {
  const uit = [];
  const loop = function (el) {
    (el.children || []).forEach(function (k) {
      if (String(k.id).indexOf('gc-') === 0) uit.push(String(k.id).slice(3));
      loop(k);
    });
  };
  loop(ctx.reg.gGrid);
  return uit.sort();
}
function strookNamen(ctx) {
  const el = ctx.reg.verborgenStrook;
  return (el.children || []).filter(function (k) { return String(k.id).indexOf('vb-') === 0; })
    .map(function (k) { return String(k.id).slice(3); }).sort();
}
function chipVan(ctx, pid) {
  return (ctx.reg.verborgenStrook.children || []).find(function (k) { return k.id === 'vb-' + pid; }) || null;
}

// ── 1. verbergen raakt de selectie niet ──────────────────────────
function keurVerbergen(verbergBron, renderBron) {
  const ctx = maakOmgeving(['010D', '012F', '0105'], 'slim', verbergBron, renderBron);
  ctx.renderGauges();
  const uit = [];
  if (tegelsIn(ctx).join(',') !== '0105,010D,012F')
    uit.push('vooraf staan er ' + tegelsIn(ctx).join(',') + ' in beeld, verwacht alle drie');

  ctx.dubbeltik('012F');

  // DE KERN: het scherm verandert, de meting niet.
  if (tegelsIn(ctx).indexOf('012F') > -1)
    uit.push('na de dubbeltik staat de tegel er nog steeds');
  if (!ctx.activePIDs.has('012F'))
    uit.push('verbergen heeft de PID uit activePIDs gehaald — dan wordt er niet meer gemeten, en dat is precies wat verbergen NIET is');
  if (ctx.activePIDs.size !== 3)
    uit.push('de selectie is van 3 naar ' + ctx.activePIDs.size + ' gegaan door alleen maar iets te verbergen');
  if (ctx.meldingen.length)
    uit.push('verbergen meldde in het selectielog: "' + ctx.meldingen.join(', ') + '" — een schermkeuze is geen selectiewijziging');
  // En de gebruiker moet weten dat er dóórgemeten wordt, anders is "verborgen"
  // niet van "uit" te onderscheiden en is er niets opgelost.
  if (!ctx.toasts.some(function (t) { return /gemeten/i.test(t); }))
    uit.push('de melding zegt niet dat er nog gemeten wordt: "' + ctx.toasts.join(' | ') + '"');

  // Eén tik doet niets: je zit in een rijdende auto en een tegel is groot.
  const los = maakOmgeving(['010D', '012F'], 'slim', verbergBron, renderBron);
  los.renderGauges();
  los.pidTileTap('012F');
  if (tegelsIn(los).indexOf('012F') < 0)
    uit.push('één enkele tik verbergt de tegel al');
  return uit;
}

// ── 2. de strook, en de weg terug ────────────────────────────────
function keurStrook(verbergBron, renderBron) {
  const ctx = maakOmgeving(['010D', '012F', '0105'], 'slim', verbergBron, renderBron);
  ctx.renderGauges();
  const uit = [];
  if (ctx.reg.verborgenStrook.style.display !== 'none')
    uit.push('de strook staat in beeld terwijl er niets verborgen is');

  ctx.dubbeltik('012F');
  ctx.dubbeltik('0105');

  if (strookNamen(ctx).join(',') !== '0105,012F')
    uit.push('de strook noemt ' + (strookNamen(ctx).join(',') || '(niets)') + ', verwacht 0105,012F');
  if (ctx.reg.verborgenStrook.style.display === 'none')
    uit.push('de strook staat op display:none terwijl er twee tegels verborgen zijn');

  // De naam is kort: "Brandstofpeil" past, maar een lange naam hoort afgekort
  // te worden — daar is de strook te smal voor.
  const chip = chipVan(ctx, '0105');
  const naam = chip ? String((chip.children[0] || {}).textContent || '') : '';
  const vol = DEFS['0105'].name;
  if (!naam) uit.push('de verborgen PID 0105 heeft geen naam in de strook');
  else if (naam.length > vol.length)
    uit.push('de naam in de strook ("' + naam + '") is langer dan de volledige naam ("' + vol + '")');
  if (chip && String(chip.title).indexOf(vol) < 0)
    uit.push('de volledige naam staat nergens: tooltip is "' + chip.title + '"');

  // Dubbeltik op de naam haalt hem terug — hetzelfde gebaar, andere kant op.
  ctx.dubbeltik('0105');
  if (tegelsIn(ctx).indexOf('0105') < 0)
    uit.push('een dubbeltik op de naam in de strook haalt de tegel niet terug');
  if (strookNamen(ctx).indexOf('0105') > -1)
    uit.push('de teruggehaalde PID staat nog steeds in de strook');

  // En "Alles tonen" voor wie er tien heeft weggeklikt.
  ctx.dubbeltik('0105');
  ctx.dubbeltik('010D');
  if (strookNamen(ctx).length !== 3)
    uit.push('vóór "Alles tonen" staan er ' + strookNamen(ctx).length + ' in de strook, verwacht 3');
  ctx.pidToonAlles();
  if (strookNamen(ctx).length)
    uit.push('na "Alles tonen" staan er nog ' + strookNamen(ctx).length + ' in de strook');
  if (tegelsIn(ctx).length !== 3)
    uit.push('na "Alles tonen" staan er ' + tegelsIn(ctx).length + ' tegels in beeld, verwacht 3');
  return uit;
}

// ── 3. het kruisje is de ándere handeling ────────────────────────
function keurKruisje(verbergBron, renderBron) {
  const ctx = maakOmgeving(['010D', '012F'], 'slim', verbergBron, renderBron);
  ctx.renderGauges();
  ctx.dubbeltik('012F');
  const uit = [];
  const chip = chipVan(ctx, '012F');
  if (!chip) return ['de verborgen PID staat niet in de strook; het kruisje is niet te toetsen'];
  const kruis = chip.children[1];
  if (!kruis || String(kruis.textContent).indexOf('✕') < 0)
    uit.push('er staat geen kruisje naast de naam — dan is uitzetten vanuit de live view onbereikbaar geworden');
  if (kruis) kruis.onclick({ stopPropagation: function () {} });

  if (ctx.activePIDs.has('012F'))
    uit.push('het kruisje heeft de PID niet uit de selectie gehaald — dan zet het niets uit');
  if (!ctx.meldingen.some(function (m) { return /kruisje/i.test(m); }))
    uit.push('het uitzetten meldde niet in het selectielog: "' + ctx.meldingen.join(', ') + '" (#31)');
  if (!ctx.toasts.some(function (t) { return /niet meer gemeten/i.test(t); }))
    uit.push('de melding bij het kruisje zegt niet dat het meten stopt: "' + ctx.toasts.join(' | ') + '"');
  // En de strook is hem kwijt: hij is niet verborgen, hij is weg.
  if (strookNamen(ctx).indexOf('012F') > -1)
    uit.push('een uitgezette PID blijft in de verborgen-strook staan');
  return uit;
}

// ── 4. geen verborgen-spook na een selectiewijziging ─────────────
function keurGeenSpook(verbergBron, renderBron) {
  const ctx = maakOmgeving(['010D', '012F'], 'slim', verbergBron, renderBron);
  ctx.renderGauges();
  ctx.dubbeltik('012F');
  const uit = [];
  // Uit de selectie halen zoals het keuzescherm dat doet, en later weer terug.
  ctx.activePIDs.delete('012F');
  ctx.renderGauges();
  ctx.activePIDs.add('012F');
  ctx.renderGauges();
  if (tegelsIn(ctx).indexOf('012F') < 0)
    uit.push('een opnieuw aangevinkte sensor blijft onzichtbaar — de verborgen-stand van vóór het uitzetten hangt er nog aan');
  if (strookNamen(ctx).indexOf('012F') > -1)
    uit.push('hij staat na het opnieuw aanvinken in de verborgen-strook');
  return uit;
}

// ── 5. alles verborgen zegt wat er werkelijk aan de hand is ──────
function keurAllesVerborgen(verbergBron, renderBron) {
  const ctx = maakOmgeving(['010D', '012F'], 'slim', verbergBron, renderBron);
  ctx.renderGauges();
  ctx.dubbeltik('010D');
  ctx.dubbeltik('012F');
  const uit = [];
  const tekst = String(ctx.reg.gGrid.innerHTML || '');
  if (/Geen sensoren geselecteerd/i.test(tekst))
    uit.push('het scherm zegt "geen sensoren geselecteerd" terwijl ze geselecteerd zijn en gemeten worden — dat stuurt je naar het verkeerde scherm');
  if (!/verborgen/i.test(tekst))
    uit.push('er staat geen uitleg in het lege rooster: "' + tekst.slice(0, 80) + '"');
  if (strookNamen(ctx).length !== 2)
    uit.push('de strook noemt er ' + strookNamen(ctx).length + ' terwijl alle twee verborgen zijn');
  return uit;
}

// ── 6. het werkt in élke weergave ────────────────────────────────
// De strook hoort bij de live view en niet bij één modus. Zou hij aan de
// slimme weergave hangen, dan is een tegel wegklikken in "Puntjes" een
// eenrichtingsweg.
function keurAlleWeergaven(verbergBron, renderBron) {
  const uit = [];
  ['full', 'numbers', 'dots', 'slim'].forEach(function (modus) {
    const ctx = maakOmgeving(['010D', '012F'], modus, verbergBron, renderBron);
    ctx.renderGauges();
    ctx.dubbeltik('012F');
    if (tegelsIn(ctx).indexOf('012F') > -1)
      uit.push('in weergave "' + modus + '" blijft de tegel na een dubbeltik staan');
    if (strookNamen(ctx).indexOf('012F') < 0)
      uit.push('in weergave "' + modus + '" komt de verborgen PID niet in de strook');
    ctx.dubbeltik('012F');
    if (tegelsIn(ctx).indexOf('012F') < 0)
      uit.push('in weergave "' + modus + '" is de tegel niet terug te halen');
  });
  return uit;
}

// ── draaien ──────────────────────────────────────────────────────
console.log('Verbergen is geen uitzetten — de live view en de sensorkeuze zijn twee dingen\n');

toetsSchoon('een dubbeltik verbergt de tegel en laat de meting met rust', keurVerbergen());
toetsSchoon('de strook somt de verborgen PIDs op, en een dubbeltik haalt ze terug', keurStrook());
toetsSchoon('het kruisje zet de sensor écht uit, en meldt dat ook', keurKruisje());
toetsSchoon('een opnieuw aangevinkte sensor is niet stiekem nog verborgen', keurGeenSpook());
toetsSchoon('alles verborgen noemt de juiste oorzaak', keurAllesVerborgen());
toetsSchoon('verbergen werkt in alle vier de weergaven', keurAlleWeergaven());

// ── tegenproef ───────────────────────────────────────────────────
console.log('');
function bouw(bron, van, naar, wat) {
  if (bron.indexOf(van) < 0) throw new Error('tegenproef "' + wat + '" kon "' + van + '" niet vinden — hernoemd?');
  return bron.replace(van, naar);
}

// 1. De toestand van vóór deze wijziging: de dubbeltik zet de sensor uit in
//    plaats van hem te verbergen. Dat is de fout die deze test bestaat om te
//    vangen — en hij was jarenlang geen fout maar het gedrag.
toetsMeldt('een dubbeltik die de sensor uitzet valt door de mand (tegenproef)',
  keurVerbergen(bouw(VERBERG_BRON,
    '    if(hiddenPIDs.has(pid)) pidToon(pid); else pidVerberg(pid);',
    '    pidDeselect(pid);', 'dubbeltik zet uit')),
  'uit activePIDs gehaald');

// 2. Verbergen dat tóch langs de selectiemelder gaat. Het scherm klopt dan,
//    maar het selectielog vult zich met wijzigingen die nooit gebeurd zijn —
//    precies de scheve boekhouding van #31, alleen andersom.
toetsMeldt('verbergen dat zich als selectiewijziging meldt valt door de mand (tegenproef)',
  keurVerbergen(bouw(VERBERG_BRON,
    "  showToast?.('🙈 '+((d&&d.name)||pid)+' verborgen",
    "  plSelectieMeld(plSelectieVoor(),'verbergen');\n  showToast?.('🙈 '+((d&&d.name)||pid)+' verborgen", 'verbergen meldt')),
  'een schermkeuze is geen selectiewijziging');

// 3. De opruiming weg: een PID die je uitzet en later weer aanvinkt blijft
//    onzichtbaar, zonder dat er iets zegt waarom.
toetsMeldt('een achtergebleven verborgen-stand valt door de mand (tegenproef)',
  keurGeenSpook(null, bouw(RENDER_BRON,
    '  hiddenPIDs.forEach(function(p){ if(!activePIDs.has(p)) hiddenPIDs.delete(p); });', '', 'opruiming')),
  'blijft onzichtbaar');

// 4. De lege staat die de verkeerde oorzaak noemt: "geen sensoren
//    geselecteerd" terwijl ze geselecteerd zijn én gemeten worden.
toetsMeldt('een lege staat met de verkeerde oorzaak valt door de mand (tegenproef)',
  keurAllesVerborgen(null, bouw(RENDER_BRON,
    '🙈</div><h3>Alles verborgen</h3>', '📡</div><h3>Geen sensoren geselecteerd</h3>', 'lege staat')),
  'verkeerde scherm');

// 5. De strook die alleen in de slimme weergave gevuld wordt. Dan is een tegel
//    wegklikken in "Puntjes" een eenrichtingsweg.
toetsMeldt('een strook die maar in één weergave werkt valt door de mand (tegenproef)',
  keurAlleWeergaven(bouw(VERBERG_BRON,
    "  const el=document.getElementById('verborgenStrook');\n  if(!el) return 0;",
    "  const el=document.getElementById('verborgenStrook');\n  if(!el || pidViewMode!=='slim') return 0;", 'strook alleen slim')),
  'komt de verborgen PID niet in de strook');

// 6. Het kruisje dat óók alleen maar verbergt. Dan is er geen enkele manier
//    meer om vanuit de live view met meten te stoppen, en dat is de andere
//    helft van de scheiding.
toetsMeldt('een kruisje dat niets uitzet valt door de mand (tegenproef)',
  keurKruisje(bouw(VERBERG_BRON,
    'pidDeselect(pid); };', 'pidVerberg(pid); };', 'kruisje zet uit')),
  'niet uit de selectie gehaald');

console.log('\n' + (fout ? fout + ' test(s) gefaald' : 'alle tests geslaagd'));
process.exit(fout ? 1 : 0);
