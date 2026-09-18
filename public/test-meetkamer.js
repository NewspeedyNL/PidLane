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
console.log('\n6. "deze ronde" is afgeleid en blijft klein');
// ══════════════════════════════════════════════════════════════════
{
  // De eerste versie zette ELK issue dat blok 5 dekt op het scherm: 43 chips,
  // waarvan vijf naar hoofdstukken uit PIDLANE.md verwezen. Dat was geen
  // overzicht maar een muur. Wat hier getoetst wordt is de correctie: alleen
  // wat deze rit werkelijk aangaat, de rest geteld.
  const proeven = [
    { issue: '#241', naam: 'De meetopdracht van buiten is uitgevoerd' },
    { issue: '#228', naam: 'De meting blijft in beeld' },
    { issue: '#235', naam: 'De live-log komt aan' },
    { issue: '§11',  naam: 'een hoofdstukcontrole' },
    { issue: '§4',   naam: 'nog een hoofdstukcontrole' },
    { issue: '\u2014', naam: 'een proef zonder issue' }
  ];

  const stil = M.ronde({ proeven: proeven });
  toets('zonder bevinding staat er geen enkele chip', stil.deze.length === 0,
    JSON.stringify(stil.deze.map(function (b) { return b.issue; })));
  toets('de drie echte issues worden geteld als bewaking', stil.bewaking === 3, String(stil.bewaking));
  toets('de hoofdstukken worden apart geteld', stil.delen === 2, String(stil.delen));
  toets('en tellen dus niet mee als issue', stil.bewaking !== 5, String(stil.bewaking));

  // EEN § IS GEEN ISSUE. Dit is de fout uit de schermafdruk van 18-09: §11,
  // §21, §4, §7 en §8 stonden als issuechip op het scherm en verwijzen naar
  // niets. Een filter dat alleen op "niet leeg" kijkt, laat ze er alle vijf in.
  const metDeel = M.ronde({ proeven: proeven, log: [{ blok: 5, naam: 'een hoofdstukcontrole', staat: 'FOUT' }] });
  toets('een hoofdstukcontrole komt zelfs met een FOUT niet in de chips',
    metDeel.deze.every(function (b) { return !/^§/.test(b.issue); }),
    JSON.stringify(metDeel.deze.map(function (b) { return b.issue; })));

  // ALLEEN WAT AANDACHT VRAAGT. Een proef die gewoon groen staat is geen
  // nieuws en hoort bij de veertig die meelopen — anders is de muur terug.
  const gemengd = M.ronde({ proeven: proeven, log: [
    { blok: 5, naam: 'De meetopdracht van buiten is uitgevoerd', staat: 'FOUT' },
    { blok: 5, naam: 'De meting blijft in beeld', staat: 'LET OP' },
    { blok: 5, naam: 'De live-log komt aan', staat: 'ok' }
  ]});
  const qs = gemengd.deze.map(function (b) { return b.issue; });
  toets('een FOUT komt in de chips', qs.indexOf('#241') >= 0, JSON.stringify(qs));
  toets('een LET OP ook', qs.indexOf('#228') >= 0, JSON.stringify(qs));
  toets('maar een groene proef NIET', qs.indexOf('#235') === -1, JSON.stringify(qs));
  toets('die telt als bewaking', gemengd.bewaking === 1, String(gemengd.bewaking));
  toets('rood staat vóór oranje', gemengd.deze[0].issue === '#241', gemengd.deze[0].issue);

  // Regels van een ander blok mogen niets kleuren, en dat moet blijken uit een
  // BOTSING: een blok-14-regel met een naam die toch al niet in de lijst staat
  // bewijst niets over de filter.
  const botsing = M.ronde({
    proeven: [{ issue: '#241', naam: 'X' }],
    log: [{ blok: 5, naam: 'X', staat: 'FOUT' }, { blok: 14, naam: 'X', staat: 'ok' }]
  });
  toets('een blok-14-regel overschrijft het oordeel van blok 5 niet',
    botsing.deze.length === 1 && botsing.deze[0].staat === 'fout',
    JSON.stringify(botsing.deze));

  // DE OPDRACHT VAN BUITEN STAAT ER ALTIJD OP, ook als hij groen is: dat is
  // per definitie de vraag van deze rit.
  const vanBuiten = M.ronde({
    proeven: proeven, log: [],
    opdracht: opdracht(),
    uitslagen: [{ naam: 'spanning binnen bereik', staat: 'ok' }]
  });
  const q217 = vanBuiten.deze.filter(function (b) { return b.issue === '#217'; })[0];
  toets('een groen issue uit de opdracht staat er wél op', !!q217);
  toets('gemerkt als van buiten gekomen', q217 && q217.herkomst === 'opdracht', q217 && q217.herkomst);
  toets('met de uitslag van de opdracht erin', q217 && q217.staat === 'ja', q217 && q217.staat);

  // Eén issue met twee proeven: de zwaarste wint, niet de laatste. De volgorde
  // is hier het bewijs — andersom geven beide regels hetzelfde antwoord.
  const twee = M.ronde({
    proeven: [{ issue: '#217', naam: 'a' }, { issue: '#217', naam: 'b' }],
    log: [{ blok: 5, naam: 'a', staat: 'FOUT' }, { blok: 5, naam: 'b', staat: 'LET OP' }]
  });
  toets('een LET OP erna verzacht een FOUT niet', twee.deze[0].staat === 'fout', twee.deze[0].staat);
  toets('en beide proeven hangen eronder', twee.deze[0].proeven.length === 2);
}

// ══════════════════════════════════════════════════════════════════
console.log('\n6b. het oordeel bovenaan vat samen zonder te verzachten');
// ══════════════════════════════════════════════════════════════════
{
  toets('zonder opdracht is er geen oordeel', M.oordeel({}).totaal === 0);

  const bezig = M.oordeel({ opdracht: opdracht(), bezig: true });
  toets('bezig zonder uitslag meldt dat het loopt', bezig.staat === 'bezig', bezig.staat);

  const alles = M.oordeel({ opdracht: opdracht(), uitslagen: [uitslag('ok', 13.7), uitslag('ok', 13.9)] });
  toets('alles goed geeft 2/2 groen', alles.goed === 2 && alles.totaal === 2 && alles.staat === 'ja',
    JSON.stringify(alles));

  const twee3 = M.oordeel({ opdracht: opdracht(),
    uitslagen: [uitslag('ok', 13.7), uitslag('ok', 13.9), uitslag('LET OP', null, { naam: 'er is gereden' })] });
  toets('2 van de 3 telt de goede, niet alle', twee3.goed === 2 && twee3.totaal === 3, JSON.stringify(twee3));
  toets('en de regel eronder noemt wat er ontbreekt', /gereden/.test(twee3.regel), twee3.regel);

  // ÉÉN FOUT WINT VAN TWEE KEER GOED.
  const stuk = M.oordeel({ opdracht: opdracht(),
    uitslagen: [uitslag('ok', 13.7), uitslag('ok', 13.9), uitslag('FOUT', 9.1, { detail: '0142 min = 9.1 — buiten de band' })] });
  toets('één FOUT maakt het oordeel rood', stuk.staat === 'fout', stuk.staat);
  toets('en de regel toont de detailtekst van die proef', /9\.1/.test(stuk.regel), stuk.regel);
  toets('de teller blijft eerlijk: 2 van de 3', stuk.goed === 2 && stuk.totaal === 3, JSON.stringify(stuk));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n6c. de logtelling telt wat er staat');
// ══════════════════════════════════════════════════════════════════
{
  const t = M.logtelling([
    { staat: 'ok' }, { staat: 'ok' }, { staat: 'FOUT' }, { staat: 'LET OP' }, { staat: 'overgeslagen' }
  ]);
  toets('alle regels geteld', t.n === 5, String(t.n));
  toets('fout apart', t.fout === 1, String(t.fout));
  toets('let op apart', t.letop === 1, String(t.letop));
  toets('een lege log geeft nul', M.logtelling([]).n === 0);
  toets('en onzin geeft ook nul', M.logtelling(null).n === 0);
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

  // Getallen lezen als een Nederlander ze schrijft, zonder een precisie te
  // suggereren die er niet is.
  toets('een komma in plaats van een punt', M.getal(13.77) === '13,77', M.getal(13.77));
  toets('een rond getal blijft rond', M.getal(12) === '12', M.getal(12));
  toets('een groot getal krijgt geen decimalen', M.getal(100000) === '100000', M.getal(100000));
  toets('nul is nul en niet leeg', M.getal(0) === '0', M.getal(0));
  toets('niets geeft leeg', M.getal(null) === '');
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
  toets('en bevat de vier stations van de lus',
    /Opdracht/.test(h) && /Meten/.test(h) && /Airtable/.test(h) && /Claude/.test(h));
  toets('zonder opdracht staat er geen muur maar één uitnodiging',
    /Nog geen meetopdracht/.test(h), h.slice(0, 200));

  // Met een opdracht erbij hoort de vraag zelf op het scherm te staan.
  const vol = laad().html({
    nu: Date.now(), opdracht: opdracht(), herkomst: { id: 'rec1', gewijzigd: Date.now() },
    reden: '', toggleAan: true, uitslagen: [uitslag('FOUT', 9.2, { naam: 'spanning binnen bereik', issue: '#217' })],
    live: { ok: true, status: 200, aantal: 4, tijd: Date.now(), fout: '' },
    log: [], proeven: [], bezig: true, bron: 'productie (https://app.pidlane.nl)', ritId: '2026-09-18-0807'
  });
  toets('de naam van de opdracht staat op het scherm', /Boordspanning tijdens de rit/.test(vol));
  toets('het ritnummer ook', /2026-09-18-0807/.test(vol));
  toets('de PID van de proef staat erbij', /0142/.test(vol));
  // Het getal leest als een Nederlander het schrijft: 9,2 en niet 9.2.
  toets('de gemeten waarde staat erbij, met een komma', /9,2/.test(vol));
  toets('en de bandgrenzen eromheen', /11,5/.test(vol) && /15,2/.test(vol));

  // DE MUUR MAG NIET TERUGKOMEN. Veertig issues als chip was de bevinding van
  // 18-09; een paneel met een handvol proeven hoort een handvol chips te geven.
  const veel = laad().html({
    nu: Date.now(), toggleAan: true, uitslagen: [], log: [],
    proeven: Array.from({ length: 44 }, function (_, i) { return { issue: '#' + (100 + i), naam: 'p' + i }; })
  });
  const chips = (veel.match(/class="mk-chip"/g) || []).length;
  toets('44 gedekte issues leveren geen 44 chips op', chips === 0, String(chips));
  toets('ze worden geteld in plaats van opgesomd', /44<\/b> andere proeven/.test(veel),
    (veel.match(/andere proeven[^<]*/) || [''])[0]);

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

// ══════════════════════════════════════════════════════════════════
console.log('\n11. de opdrachtkiezer: meerdere vragen per rit (#248)');
// ══════════════════════════════════════════════════════════════════
{
  /* Een sandbox met een nep-PLOpdracht, zodat de kiezer getoetst kan worden
     zonder netwerk. De ECHTE koppeling met PLOpdracht staat in
     bproef-meetkamer.js — daar draait de app. */
  function metLijst(rijen, gedaan, herkomst) {
    const k = laad({
      PLOpdracht: {
        gelijst: function () { return rijen; },
        gedaan: function () { return gedaan || {}; },
        kies: function (id) { k._gekozen = id; return (rijen || []).filter(function (r) { return r.id === id; })[0] || null; },
        reden: function () { return 'afgekeurd: onbekende sleutel'; }
      }
    });
    return k._kiezer({ nu: Date.now(), herkomst: herkomst || null });
  }

  const zonder = metLijst(null);
  toets('zonder opgehaalde lijst staat er een ophaalknop', /Ophalen/.test(zonder), zonder.slice(0, 120));
  toets('en geen enkele keuzeknop', !/mk-kies/.test(zonder));

  toets('een lege tabel zegt dat er niets staat', /geen enkele opdracht/.test(metLijst([])));

  const rijen = [
    { id: 'rec1', naam: 'Boordspanning tijdens de rit', reden: '#217', actief: true,  opdracht: { naam: 'a' }, fout: '' },
    { id: 'rec2', naam: 'Raildruk over een hele rit',   reden: '#19',  actief: false, opdracht: { naam: 'b' }, fout: '' },
    { id: 'rec3', naam: 'Kapotte rij',                  reden: '#99',  actief: false, opdracht: null,          fout: 'afgekeurd: onbekende sleutel "snelheid"' }
  ];

  const drie = metLijst(rijen, {});
  toets('elke rij krijgt een knop', (drie.match(/class="mk-kies/g) || []).length === 3,
    String((drie.match(/class="mk-kies/g) || []).length));
  toets('met de naam erop', /Boordspanning tijdens de rit/.test(drie) && /Raildruk/.test(drie));

  // EEN AFGEKEURDE RIJ BLIJFT STAAN, MET ZIJN REDEN. Verdwijnen betekent dat
  // je in Airtable naar een opdracht kijkt die op je telefoon nergens is, en
  // dat niets zegt waarom.
  toets('een afgekeurde rij staat er ook', /Kapotte rij/.test(drie));
  toets('met de reden erbij', /onbekende sleutel/.test(drie), drie.slice(-260));
  toets('maar is niet aanklikbaar', (drie.match(/disabled/g) || []).length === 1,
    String((drie.match(/disabled/g) || []).length));
  toets('en de bruikbare rijen wél', (drie.match(/PLMeetkamer\.pak/g) || []).length === 2,
    String((drie.match(/PLMeetkamer\.pak/g) || []).length));

  // WAT ER DEZE SESSIE MEE GEBEURD IS, KOMT UIT PLOpdracht.gedaan() — het
  // scherm telt niet zelf. Zou het dat wel doen, dan is er een tweede telling
  // naast die van blok 5.
  const met = metLijst(rijen, { rec1: { staat: 'fout', goed: 2, aantal: 3, tijd: Date.now() - 60000 } });
  toets('een gemeten opdracht toont zijn uitslag', /2\/3 binnen bereik/.test(met), met.slice(0, 400));
  toets('met hoe lang geleden', /1 min geleden/.test(met));
  toets('een ongemeten opdracht zegt dat hij nog wacht', /nog niet gemeten deze sessie/.test(met));

  // De lopende opdracht is herkenbaar, anders druk je hem nog een keer aan.
  const nu = metLijst(rijen, {}, { id: 'rec2' });
  toets('de lopende opdracht is gemerkt', /mk-kies nu/.test(nu));
  toets('en er is er maar één', (nu.match(/mk-kies nu/g) || []).length === 1);

  // Een naam uit Airtable wordt niet als HTML uitgevoerd.
  const stout = metLijst([{ id: 'r', naam: '<img src=x>', reden: '', actief: false, opdracht: {}, fout: '' }], {});
  toets('een naam met HTML erin wordt ontsmet', !/<img/.test(stout) && /&lt;img/.test(stout));

  // EEN id MET EEN APOSTROF MAG DE onclick NIET BREKEN. Airtable-ids zijn
  // alfanumeriek, maar de knop bouwt een JavaScript-aanroep als tekst en dan
  // is "het kan niet voorkomen" geen argument.
  const raar = metLijst([{ id: "re'c", naam: 'x', reden: '', actief: false, opdracht: {}, fout: '' }], {});
  toets('een apostrof in het id wordt ontsmet', !/pak\('re'c'\)/.test(raar), raar.slice(0, 300));
}

// ══════════════════════════════════════════════════════════════════
console.log('\n12. kiezen begint een nieuwe sessie');
// ══════════════════════════════════════════════════════════════════
{
  // DIT IS WAAROM DE KEUZE EEN KNOP IS EN GEEN INSTELLING. Twee opdrachten
  // onder één ritnummer betekent dat buiten de app niet te zien is welke
  // regel bij welke vraag hoorde — en dat is precies de koppeling waar de
  // hele lus op rust.
  let sessies = [];
  const k = laad({
    PLOpdracht: {
      gelijst: function () { return [{ id: 'rec2', naam: 'Raildruk', opdracht: { naam: 'Raildruk' }, fout: '' }]; },
      gedaan: function () { return {}; },
      kies: function (id) { return id === 'rec2' ? { naam: 'Raildruk', sensoren: [] } : null; },
      reden: function () { return 'geen opdracht met dat id'; }
    },
    PLTestrunLive: { nieuweSessie: function (r) { sessies.push(r); return '2026-09-18-2000'; } },
    showToast: function () { }
  });

  const gekozen = k.pak('rec2');
  toets('kiezen levert de opdracht op', gekozen && gekozen.naam === 'Raildruk', JSON.stringify(gekozen));
  toets('en begint precies één nieuwe sessie', sessies.length === 1, JSON.stringify(sessies));
  toets('met de naam van de opdracht in de reden', /Raildruk/.test(sessies[0] || ''), sessies[0]);

  // EEN MISLUKTE KEUZE MAG GEEN SESSIE BEGINNEN. Anders staat er een leeg
  // ritnummer in de tabel waar nooit iets onder komt.
  const weg = k.pak('bestaat-niet');
  toets('een onbekende opdracht levert niets op', weg === null);
  toets('en begint géén nieuwe sessie', sessies.length === 1, String(sessies.length));

  // Ontbreekt PLTestrunLive helemaal, dan mag de keuze niet klappen.
  const kaal = laad({
    PLOpdracht: {
      gelijst: function () { return []; }, gedaan: function () { return {}; },
      kies: function () { return { naam: 'x', sensoren: [] }; }, reden: function () { return ''; }
    }
  });
  toets('zonder PLTestrunLive lukt de keuze nog steeds',
    (function () { try { return !!kaal.pak('wat dan ook'); } catch (e) { return false; } })());
}

// ══════════════════════════════════════════════════════════════════
console.log('\n13. het ophalen gebeurt één keer tegelijk');
// ══════════════════════════════════════════════════════════════════
{
  // Twee verzoeken tegelijk leveren twee lijsten op waarvan de laatste wint,
  // en welke dat is hangt van het netwerk af.
  let keer = 0;
  let los;
  const k = laad({
    PLOpdracht: {
      lijst: function () { keer++; return new Promise(function (r) { los = r; }); },
      gelijst: function () { return null; }, gedaan: function () { return {}; }
    }
  });

  k.laad();
  k.laad();
  toets('twee keer drukken geeft één verzoek', keer === 1, String(keer));

  // Losmaken zodat er geen belofte blijft hangen; de uitkomst doet er hier
  // niet toe, alleen dát er één verzoek uitging. GEEN `return` op dit niveau:
  // node wikkelt een module in een functie, dus een return hier slaat de
  // eindtelling over en dan meldt een rode test zich als groen.
  if (typeof los === 'function') los([]);
  toets('en daarna kan er opnieuw opgehaald worden', typeof k.laad === 'function');
}

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles' : 'goed: alle ' + n + ' controles'));
process.exit(fout ? 1 : 0);
