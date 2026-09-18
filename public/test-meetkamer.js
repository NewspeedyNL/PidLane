// ══════════════════════════════════════════════════════════════════
// test-meetkamer.js — zegt het scherm hetzelfde als het verslag? (#246)
// ──────────────────────────────────────────────────────────────────
// WAT HIER OP HET SPEL STAAT.
//
// De meetkamer tekent de lus terwijl hij loopt. Dat maakt hem nuttig én
// gevaarlijk: een scherm dat groen wijst waar het verslag rood zegt, is
// erger dan geen scherm. Je stopt met kijken naar het verslag.
//
// Drie dingen moeten daarom waar zijn, en alle drie falen ze stil:
//
//   1. DE STATIONS MOETEN ONDERSCHEIDEN. "Geen opdracht opgehaald" en "er
//      stond er een klaar en die is afgekeurd" zijn twee verschillende
//      werelden: de eerste is de normale stand tussen twee rondes, de tweede
//      betekent dat de rit iets anders meet dan er in de tabel staat. Een
//      tegel die die twee op dezelfde grijze stand zet, verbergt precies de
//      fout waarvoor hij bestaat.
//   2. DE BALK MOET DE BAND VOLGEN. De positie op de balk is een verhouding.
//      Een deling door nul (band van één punt), een waarde ver buiten de
//      band, of een ontbrekende meting moeten alle drie iets zinnigs geven —
//      en "niet gemeten" moet zichtbaar anders zijn dan "nul".
//   3. DE ISSUEBAAN MAG GEEN TWEEDE LIJST WORDEN. Hij hoort afgeleid te zijn
//      uit PROEVEN_B5 en de opdracht, gekoppeld op de naam waarmee blok 5
//      boekt. Verandert die koppeling, dan hoort de baan leeg te vallen —
//      zichtbaar — in plaats van een verouderde stand te blijven tonen.
//
// Draaien vanuit public/:  node test-meetkamer.js        (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const vm = require('vm');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

/* De echte module inladen, niet nabouwen. Een test met een eigen kopie van
   de logica kan per definitie niet rood worden — zie test-healthgate.js in
   CLAUDE.md. */
function laad(extra) {
  const s = Object.assign({}, extra || {});
  s.window = s;
  s.gewaarschuwd = [];
  s.console = { warn: function (m) { s.gewaarschuwd.push(String(m)); }, error() { }, log() { } };
  s.document = {
    getElementById: function (id) { return (s.elems && s.elems[id]) || null; },
    createElement: function () {
      return { id: '', innerHTML: '', style: { cssText: '' },
               appendChild: function () { }, parentNode: null };
    }
  };
  s.setInterval = function () { return 1; };
  s.clearInterval = function () { };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-meetkamer.js', 'utf8'), s, { filename: 'pidlane-meetkamer.js' });
  if (!s.PLMeetkamer) { console.error('FOUT: PLMeetkamer hangt niet naar buiten'); process.exit(1); }
  return s.PLMeetkamer;
}

const M = laad();

/* Een opdracht zoals PLOpdracht.actief() hem teruggeeft. */
function opdracht(extra) {
  return Object.assign({
    schema: 1, naam: 'Boordspanning tijdens de rit', reden: '#217 - accu of adapter',
    sensoren: ['0142', '010D'], duurS: 600, tikS: 5, vragen: [], drempels: [],
    proeven: [{ issue: '#217', naam: 'spanning binnen bereik', pid: '0142', meet: 'min', tussen: [11.5, 15.2] }]
  }, extra || {});
}

/* Een uitslag zoals PLOpdracht.meet() hem sinds #246 teruggeeft. */
function uitslag(staat, waarde, extra) {
  return Object.assign({ staat: staat, detail: '', pid: '0142', maat: 'min',
                         waarde: waarde, lo: 11.5, hi: 15.2, n: 13 }, extra || {});
}

// ══════════════════════════════════════════════════════════════════
console.log('\n1. de vier stations staan er, in de goede volgorde');
// ══════════════════════════════════════════════════════════════════
{
  const st = M.stations({});
  toets('het zijn er vier', st.length === 4, 'kreeg ' + st.length);
  toets('de volgorde is binnen → meten → terug → lezen',
    st.map(function (x) { return x.sleutel; }).join(',') === 'binnen,meten,terug,lezen',
    st.map(function (x) { return x.sleutel; }).join(','));
  toets('elk station draagt een titel en een regel',
    st.every(function (x) { return x.titel && typeof x.regel === 'string'; }));
  toets('zonder enige bron staat er niets op groen',
    st.every(function (x) { return x.staat !== 'ja'; }),
    JSON.stringify(st.map(function (x) { return x.staat; })));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n2. station 1 onderscheidt afgekeurd van niets-klaargezet');
// ══════════════════════════════════════════════════════════════════
{
  function binnen(snap) { return M.stations(snap)[0]; }

  // DE KERN VAN DEZE TOETS. Beide gevallen hebben opdracht === null. Een
  // controle die alleen op "is er een opdracht" kijkt, keurt ze allebei
  // hetzelfde goed — en dan is de afgekeurde opdracht onzichtbaar, precies
  // het geval waarvoor dit station bestaat.
  const leeg = binnen({ reden: 'geen actieve opdracht in de tabel' });
  const kapot = binnen({ reden: 'afgekeurd: onbekende sleutel "snelheid"' });

  toets('niets klaargezet is een wachtstand', leeg.staat === 'wacht', leeg.staat);
  toets('een AFGEKEURDE opdracht is een FOUT', kapot.staat === 'fout', kapot.staat);
  toets('en die twee zijn dus niet dezelfde stand', leeg.staat !== kapot.staat);
  toets('de fouttegel noemt de reden', /onbekende sleutel/.test(kapot.regel), kapot.regel);

  // De Config-schakelaar is een derde geval: uit is een keuze en geen fout.
  const uit = binnen({ toggleAan: false, reden: 'staat uit' });
  toets('het ophalen uitgezet is geen fout', uit.staat === 'wacht', uit.staat);
  toets('en dat wordt ook zo benoemd', /Config/.test(uit.regel), uit.regel);

  const goed = binnen({ opdracht: opdracht(), herkomst: { id: 'rec1', gewijzigd: Date.now() - 3600000 } });
  toets('een geladen opdracht staat op groen', goed.staat === 'ja', goed.staat);
  toets('met zijn naam erin', /Boordspanning/.test(goed.regel), goed.regel);
  toets('en de ouderdom ernaast', /1 u geleden/.test(goed.bij), goed.bij);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n3. station 2 vat de uitslagen samen zonder ze te verzachten');
// ══════════════════════════════════════════════════════════════════
{
  function meten(snap) { return M.stations(Object.assign({ opdracht: opdracht() }, snap))[1]; }

  toets('bezig zonder uitslag is "bezig"', meten({ bezig: true }).staat === 'bezig');
  toets('stil zonder uitslag is "wacht"', meten({ bezig: false }).staat === 'wacht');

  const alles = meten({ uitslagen: [uitslag('ok', 13.7), uitslag('ok', 13.9)] });
  toets('alles binnen de band is groen', alles.staat === 'ja', alles.staat);

  // ÉÉN FOUT WINT VAN TWEE KEER GOED. Een scherm dat "2 van de 3 goed" groen
  // maakt, meldt een rit als geslaagd terwijl het verslag FOUT zegt.
  const een = meten({ uitslagen: [uitslag('ok', 13.7), uitslag('ok', 13.9), uitslag('FOUT', 0)] });
  toets('één FOUT tussen twee goede maakt de tegel rood', een.staat === 'fout', een.staat);
  toets('en noemt hoeveel er buiten vielen', /1 van de 3/.test(een.regel), een.regel);

  // LET OP is niet hetzelfde als FOUT: niet-gemeten is geen afkeuring.
  const let_ = meten({ uitslagen: [uitslag('ok', 13.7), uitslag('LET OP', null)] });
  toets('LET OP geeft oranje en geen rood', let_.staat === 'let op', let_.staat);

  // En FOUT wint van LET OP als ze samen voorkomen.
  const beide = meten({ uitslagen: [uitslag('LET OP', null), uitslag('FOUT', 0)] });
  toets('FOUT wint van LET OP', beide.staat === 'fout', beide.staat);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n4. station 3 is de tegel die #235 opleverde');
// ══════════════════════════════════════════════════════════════════
{
  function terug(live) { return M.stations({ live: live })[2]; }

  toets('nog niets verstuurd is een wachtstand', terug(null).staat === 'wacht');

  const ok = terug({ ok: true, status: 200, aantal: 12, tijd: Date.now() - 5000, fout: '' });
  toets('een geslaagde zending is groen', ok.staat === 'ja', ok.staat);
  toets('met het aantal regels erbij', /12 regel/.test(ok.regel), ok.regel);

  // DIT IS HET GEVAL DAT MAANDEN ONZICHTBAAR WAS: 722 regels geschreven, nul
  // aangekomen, en het enige spoor was een console.warn.
  const stuk = terug({ ok: false, status: 422, aantal: 12, tijd: Date.now() - 5000, fout: 'UNKNOWN_FIELD_NAME' });
  toets('een MISLUKTE zending is rood', stuk.staat === 'fout', stuk.staat);
  toets('met de HTTP-status erin', /422/.test(stuk.regel), stuk.regel);
  toets('en de reden van Airtable erbij', /UNKNOWN_FIELD_NAME/.test(stuk.regel), stuk.regel);

  // Een netwerkfout heeft geen status; dan mag er geen "HTTP null" staan.
  const net = terug({ ok: false, status: null, aantal: 3, tijd: Date.now(), fout: 'netwerkfout' });
  toets('zonder status staat er geen "HTTP null"', !/HTTP/.test(net.regel), net.regel);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n5. de balk volgt de band, ook op de randgevallen');
// ══════════════════════════════════════════════════════════════════
{
  const rand = M._rand();

  // Het midden van de band hoort in het midden van de balk te staan.
  const mid = M.meter(uitslag('ok', 13.35));      // precies tussen 11.5 en 15.2
  toets('het midden van de band staat in het midden van de balk',
    Math.abs(mid.pos - 0.5) < 0.001, String(mid.pos));

  const onder = M.meter(uitslag('ok', 11.5));
  const boven = M.meter(uitslag('ok', 15.2));
  toets('de ondergrens valt op de linkerrand van de band',
    Math.abs(onder.pos - rand) < 0.001, String(onder.pos));
  toets('de bovengrens valt op de rechterrand van de band',
    Math.abs(boven.pos - (1 - rand)) < 0.001, String(boven.pos));

  // Ver buiten de band mag niet buiten de balk vallen; hij plakt tegen de rand.
  const ver = M.meter(uitslag('FOUT', -999));
  toets('ver eronder plakt tegen de linkerrand', ver.pos === 0, String(ver.pos));
  toets('ver erboven plakt tegen de rechterrand', M.meter(uitslag('FOUT', 9999)).pos === 1);

  // NIET GEMETEN IS GEEN NUL. Dit is het onderscheid waar de hele tegel op
  // rust: pos === null betekent "geen balk tekenen", pos === 0 betekent "ver
  // onder de band". Worden die twee hetzelfde, dan leest een rit zonder
  // meting als een rit die catastrofaal buiten de band lag.
  const geen = M.meter(uitslag('LET OP', null));
  toets('niet gemeten geeft géén positie', geen.pos === null, String(geen.pos));
  toets('en is dus onderscheiden van nul', geen.pos !== M.meter(uitslag('FOUT', 0)).pos);
  toets('nul is wél een positie', typeof M.meter(uitslag('FOUT', 0)).pos === 'number');

  // Een band van één punt heeft geen breedte: zonder vangnet is dit 0/0.
  const punt = M.meter({ staat: 'ok', waarde: 5, lo: 5, hi: 5, n: 1, pid: '0142', maat: 'min' });
  toets('een band zonder breedte geeft geen NaN', !isNaN(punt.pos), String(punt.pos));
  toets('en zet de waarde in het midden', Math.abs(punt.pos - 0.5) < 0.001, String(punt.pos));

  // Onleesbare invoer mag geen NaN op het scherm zetten.
  toets('een ontbrekende band geeft geen positie',
    M.meter({ staat: 'LET OP', waarde: 3, lo: null, hi: null }).pos === null);
  toets('een waarde die geen getal is geeft geen positie',
    M.meter(uitslag('LET OP', 'onbekend')).pos === null);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n6. de issuebaan wordt afgeleid, niet bijgehouden');
// ══════════════════════════════════════════════════════════════════
{
  const proeven = [
    { issue: '#241', naam: 'De meetopdracht van buiten is uitgevoerd' },
    { issue: '#228', naam: 'De meting blijft in beeld' },
    { issue: '—', naam: 'een proef zonder issue' }
  ];

  const leeg = M.issuebaan({ proeven: proeven });
  toets('een proef zonder issuenummer komt niet in de baan',
    leeg.every(function (b) { return b.issue !== '—'; }));
  toets('de andere twee staan er wel', leeg.length === 2, String(leeg.length));
  toets('zonder log staat alles op wachten',
    leeg.every(function (b) { return b.staat === 'wacht'; }));

  // De koppeling loopt via de NAAM waarmee blok 5 boekt.
  const log = [
    { blok: 5, naam: 'De meetopdracht van buiten is uitgevoerd', staat: 'FOUT' },
    { blok: 5, naam: 'De meting blijft in beeld', staat: 'ok' },
    { blok: 14, naam: 'Is er gereden?', staat: 'LET OP' }
  ];
  const baan = M.issuebaan({ proeven: proeven, log: log });
  const bij = function (q) { return baan.filter(function (b) { return b.issue === q; })[0]; };

  toets('een FOUT-regel kleurt zijn issue rood', bij('#241').staat === 'fout', bij('#241').staat);
  toets('een ok-regel kleurt zijn issue groen', bij('#228').staat === 'ja', bij('#228').staat);
  toets('rood staat vooraan in de baan', baan[0].issue === '#241', baan[0].issue);

  // REGELS VAN EEN ANDER BLOK TELLEN NIET MEE, EN DAT MOET BLIJKEN UIT EEN
  // BOTSING. Een blok-14-regel met een naam die níét in de lijst staat, wordt
  // sowieso genegeerd — die bewijst dus niets over de blokfilter. Alleen een
  // regel met DEZELFDE naam als een blok-5-proef laat zien of de filter iets
  // doet: zonder filter overschrijft blok 14 hier het oordeel van blok 5.
  const botsing = M.issuebaan({
    proeven: [{ issue: '#241', naam: 'De meetopdracht van buiten is uitgevoerd' }],
    log: [
      { blok: 5, naam: 'De meetopdracht van buiten is uitgevoerd', staat: 'FOUT' },
      { blok: 14, naam: 'De meetopdracht van buiten is uitgevoerd', staat: 'ok' }
    ]
  });
  toets('een blok-14-regel overschrijft het oordeel van blok 5 niet',
    botsing[0].staat === 'fout', botsing[0].staat);

  // DE AFLEIDING MOET BREKEN ALS DE KOPPELING BREEKT. Dit is de toets die
  // "geen tweede lijst" waar houdt: verandert de naam waarmee blok 5 boekt,
  // dan valt de baan terug op wachten in plaats van een oude stand te tonen.
  const scheef = M.issuebaan({ proeven: proeven, log: [{ blok: 5, naam: 'De meetopdracht van buiten is UITGEVOERD', staat: 'ok' }] });
  toets('een naam die niet meer past kleurt niets groen',
    scheef.every(function (b) { return b.staat === 'wacht'; }),
    JSON.stringify(scheef.map(function (b) { return b.issue + '=' + b.staat; })));

  // EÉN ISSUE MET MEER PROEVEN: DE ZWAARSTE WINT, NIET DE LAATSTE.
  // De volgorde is hier het bewijs. Staat de FOUT vooraan en de ok erachter,
  // dan geeft "de laatste wint" groen en "de zwaarste wint" rood — alleen zó
  // laat deze toets zien welke van de twee er in de code staat. Andersom
  // geven ze allebei rood en bewijst hij niets.
  const twee = M.issuebaan({
    proeven: [{ issue: '#217', naam: 'a' }, { issue: '#217', naam: 'b' }],
    log: [{ blok: 5, naam: 'a', staat: 'FOUT' }, { blok: 5, naam: 'b', staat: 'ok' }]
  });
  toets('half goed is niet goed, ook als de goede proef als laatste komt',
    twee[0].staat === 'fout', twee[0].staat);
  toets('en beide proeven hangen eronder', twee[0].proeven.length === 2);

  // Dezelfde vraag met LET OP erachter: die mag een FOUT ook niet verzachten.
  const zacht = M.issuebaan({
    proeven: [{ issue: '#217', naam: 'a' }, { issue: '#217', naam: 'b' }],
    log: [{ blok: 5, naam: 'a', staat: 'FOUT' }, { blok: 5, naam: 'b', staat: 'LET OP' }]
  });
  toets('een LET OP erna verzacht een FOUT niet', zacht[0].staat === 'fout', zacht[0].staat);

  // De opdracht van buiten levert eigen issues aan, en die zijn herkenbaar.
  const vanBuiten = M.issuebaan({
    proeven: proeven, log: [],
    opdracht: opdracht(),
    uitslagen: [{ naam: 'spanning binnen bereik', staat: 'ok' }]
  });
  const q217 = vanBuiten.filter(function (b) { return b.issue === '#217'; })[0];
  toets('een issue uit de opdracht staat in de baan', !!q217);
  toets('en is gemerkt als van buiten gekomen', q217 && q217.herkomst === 'opdracht', q217 && q217.herkomst);
  toets('met de uitslag van de opdracht erin', q217 && q217.staat === 'ja', q217 && q217.staat);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n7. de ouderdom leest als mensentaal en verzint niets');
// ══════════════════════════════════════════════════════════════════
{
  const nu = 1758000000000;
  toets('seconden', M.ouderdom(nu - 30000, nu) === '30 s geleden', M.ouderdom(nu - 30000, nu));
  toets('minuten', M.ouderdom(nu - 300000, nu) === '5 min geleden', M.ouderdom(nu - 300000, nu));
  toets('uren', M.ouderdom(nu - 7200000, nu) === '2 u geleden', M.ouderdom(nu - 7200000, nu));
  toets('dagen', /dag/.test(M.ouderdom(nu - 172800000, nu)), M.ouderdom(nu - 172800000, nu));
  toets('een ISO-tekst mag ook', /u geleden/.test(M.ouderdom(new Date(nu - 7200000).toISOString(), nu)));

  // ONLEESBARE INVOER MAG GEEN "NaN geleden" OPLEVEREN. Airtable geeft een
  // leeg veld terug als lege tekst, en dat komt hier binnen.
  toets('lege invoer geeft niets', M.ouderdom('', nu) === '');
  toets('onzin geeft niets', M.ouderdom('gisteren', nu) === '');
  toets('null geeft niets', M.ouderdom(null, nu) === '');
  toets('een toekomstige tijd heet "zojuist"', M.ouderdom(nu + 5000, nu) === 'zojuist');
}

// ══════════════════════════════════════════════════════════════════
console.log('\n8. het paneel tekent zonder bronnen, en zegt dat dan ook');
// ══════════════════════════════════════════════════════════════════
{
  // Een scherm dat stukloopt op een ontbrekende module is een scherm dat je
  // niet meer opent — en dan is de lus weer onzichtbaar.
  const kaal = laad();
  const s = kaal.momentopname();
  toets('een momentopname zonder enige module lukt', !!s);
  toets('en meldt dat PLOpdracht ontbreekt', /PLOpdracht ontbreekt/.test(s.reden), s.reden);

  let h = '';
  toets('het paneel tekent zonder te klappen', (function () {
    try { h = kaal.html(s); return true; } catch (e) { return false; }
  })());
  toets('en bevat de vier stations',
    /Opdracht binnen/.test(h) && /De rit meet/.test(h) && /Naar Airtable/.test(h) && /Claude leest/.test(h));

  // Met een opdracht erbij hoort de vraag zelf op het scherm te staan.
  const vol = laad().html({
    nu: Date.now(), opdracht: opdracht(), herkomst: { id: 'rec1', gewijzigd: Date.now() },
    reden: '', toggleAan: true, uitslagen: [uitslag('FOUT', 9.2, { naam: 'spanning binnen bereik', issue: '#217' })],
    live: { ok: true, status: 200, aantal: 4, tijd: Date.now(), fout: '' },
    log: [], proeven: [], bezig: true, bron: 'productie (https://app.pidlane.nl)', ritId: '2026-09-18-0807'
  });
  toets('de naam van de opdracht staat op het scherm', /Boordspanning tijdens de rit/.test(vol));
  toets('het ritnummer ook', /2026-09-18-0807/.test(vol));
  toets('de sensoren staan er als chips', /0142/.test(vol) && /010D/.test(vol));
  toets('de gemeten waarde staat erbij', /9\.2/.test(vol));

  // TEKST UIT AIRTABLE WORDT NIET ALS HTML UITGEVOERD. De naam en de reden
  // komen uit een tabel die buiten de app bewerkt wordt.
  const stout = laad().html({
    nu: Date.now(), toggleAan: true, uitslagen: [], log: [], proeven: [],
    opdracht: opdracht({ naam: '<img src=x onerror=alert(1)>', proeven: [] })
  });
  toets('een naam met HTML erin wordt ontsmet', !/<img/.test(stout) && /&lt;img/.test(stout));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n9. de tikker loopt alleen als het scherm open staat');
// ══════════════════════════════════════════════════════════════════
{
  const k = laad();
  let gestart = 0, gestopt = 0;
  // De module heeft zijn eigen setInterval uit de sandbox; die tellen we hier
  // opnieuw op door een verse context met tellers te maken.
  const s = { window: null, console: { warn() { }, error() { }, log() { } },
              document: { getElementById: function () { return null; }, createElement: function () { return { style: {} }; } },
              setInterval: function () { gestart++; return 7; },
              clearInterval: function () { gestopt++; } };
  s.window = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-meetkamer.js', 'utf8'), s, { filename: 'pidlane-meetkamer.js' });

  toets('hij staat uit tot hij geopend wordt', s.PLMeetkamer.open() === false);
  s.PLMeetkamer.start();
  toets('starten zet één tikker aan', gestart === 1, String(gestart));
  toets('en meldt zich als open', s.PLMeetkamer.open() === true);

  // TWEE KEER STARTEN MAG GEEN TWEEDE TIKKER OPLEVEREN. Het scherm kan
  // opnieuw geopend worden zonder dat het eerst gesloten is; elke extra
  // tikker ververst dan onzichtbaar mee en kost accu tijdens het rijden.
  s.PLMeetkamer.start();
  toets('twee keer starten geeft geen tweede tikker', gestart === 1, String(gestart));

  s.PLMeetkamer.stop();
  toets('stoppen ruimt de tikker op', gestopt === 1, String(gestopt));
  toets('en meldt zich als dicht', s.PLMeetkamer.open() === false);
  s.PLMeetkamer.stop();
  toets('twee keer stoppen doet niets extra', gestopt === 1, String(gestopt));

  toets('na stoppen kan hij opnieuw', (function () { s.PLMeetkamer.start(); return gestart === 2; })(), String(gestart));
  void k;
}

// ══════════════════════════════════════════════════════════════════
console.log('\n10. de meetkamer leest dezelfde uitslagvorm als blok 5');
// ══════════════════════════════════════════════════════════════════
{
  // DE KOPPELING DIE NIET MAG VERSCHUIVEN. PLOpdracht.meet() levert de
  // velden waarop de balk rust. Verdwijnt er één, dan tekent de meetkamer
  // stil geen balken meer — en dat is precies het soort stilte waar §11 vol
  // mee staat. Deze toets laadt de ECHTE opdrachtmodule en kijkt of de vorm
  // nog past.
  const s = { window: null, console: { warn() { }, error() { }, log() { } }, PID_CONFIG: {} };
  s.window = s;
  s.PLRit = { per: function () { return { '0142': { n: 13, min: 13.77, max: 14.1, laatst: 14.0, veranderingen: 12 } }; } };
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(__dirname + '/pidlane-opdracht.js', 'utf8'), s, { filename: 'pidlane-opdracht.js' });

  const p = { issue: '#217', naam: 'spanning', pid: '0142', meet: 'min', tussen: [11.5, 15.2] };
  const u = s.PLOpdracht.meet(p);

  toets('meet() geeft een staat', u.staat === 'ok', u.staat);
  ['waarde', 'lo', 'hi', 'n', 'pid', 'maat'].forEach(function (v) {
    toets('meet() draagt "' + v + '"', u[v] !== undefined, JSON.stringify(u));
  });
  toets('en de waarde is de gemeten waarde', u.waarde === 13.77, String(u.waarde));

  // De meter moet hem zonder vertaalslag kunnen lezen.
  const m = M.meter(u);
  toets('de meter leest die uitslag rechtstreeks', typeof m.pos === 'number', JSON.stringify(m));
  toets('en zet hem binnen de band', m.pos > M._rand() && m.pos < 1 - M._rand(), String(m.pos));

  // Ook op het niet-gemeten pad moeten de velden erop zitten, anders moet het
  // scherm gaan controleren óf ze er zijn — en dan vult het ze zelf in.
  const weg = s.PLOpdracht.meet({ issue: '#x', naam: 'y', pid: '0199', meet: 'min', tussen: [1, 2] });
  toets('een niet-gemeten PID geeft LET OP', weg.staat === 'LET OP', weg.staat);
  toets('met waarde null en niet 0', weg.waarde === null, String(weg.waarde));
  toets('en de band staat er nog wel op', weg.lo === 1 && weg.hi === 2);
  toets('de meter tekent daar geen balk', M.meter(weg).pos === null);
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles' : 'goed: alle ' + n + ' controles'));
process.exit(fout ? 1 : 0);
