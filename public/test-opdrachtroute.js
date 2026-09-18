// ══════════════════════════════════════════════════════════════════
// test-opdrachtroute.js — de Worker-kant van de meetopdracht (#241)
// ──────────────────────────────────────────────────────────────────
// WAT HIER GETOETST WORDT.
//
// `handleOpdracht()` is de enige route waarlangs iets van buiten de meting
// kan sturen. Hij hoort drie dingen te doen en niets meer: de tokenpoort
// dicht houden, de ACTIEVE rij pakken (en de nieuwste als er meer staan), en
// afkappen op de groottegrens vóór er iets naar een telefoon gaat.
//
// WAT HIJ MET OPZET NIET DOET: keuren. De vorm van een opdracht wordt in
// pidlane-opdracht.js gecontroleerd, op één plek, waar ook de code staat die
// hem uitvoert. Zou deze route óók gaan keuren, dan zijn er twee keurders en
// is de vraag welke van de twee klopt — en dat is precies de vorm die in dit
// project al drie keer een bug is geweest.
//
// De echte functie wordt uit worker.js geknipt met een anker; verdwijnt of
// hernoemt hij, dan stopt deze test in plaats van groen te blijven op code
// die niet meer draait.
//
// Draaien vanuit public/:  node test-opdrachtroute.js   (exit 0 = goed)
// ══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

let fout = 0, n = 0;
function toets(naam, waar, uitleg) {
  n++;
  if (waar) { console.log('  ok    ' + naam); return; }
  fout++;
  console.log('  FOUT  ' + naam + (uitleg ? '\n        ' + uitleg : ''));
}

const bron = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const van = bron.indexOf('async function handleOpdracht(request, env) {');
const tot = bron.indexOf('__name(handleOpdracht, "handleOpdracht");');
if (van < 0 || tot < 0 || tot < van) {
  console.error('FOUT: handleOpdracht() is niet gevonden in worker.js — de route is hernoemd of weg.');
  process.exit(1);
}
const src = bron.slice(van, tot);

/* De nagemaakte omgeving. `verzoeken` legt vast wat er werkelijk naar Airtable
   ging: daar kijkt deze test naar, niet alleen naar wat de handler teruggeeft. */
function bouw(o) {
  o = o || {};
  const staat = { verzoeken: [] };
  const omg = {
    appTokenOk: async () => o.token !== false,
    json: (body, status) => ({ body, status: status || 200 }),
    resolveBase: () => 'appLOGBASE12345',
    cfg: () => 'Meetopdracht',
    fetch: async (url, init) => {
      staat.verzoeken.push({ url: String(url), init: init || {} });
      if (o.gooi) throw new Error('netwerk weg');
      if (o.status && o.status >= 400) {
        return { ok: false, status: o.status, text: async () => o.tekst || 'stuk' };
      }
      return { ok: true, status: 200, json: async () => ({ records: o.records || [] }) };
    },
    __name: () => { }
  };
  const maak = new Function(...Object.keys(omg), src + '\nreturn handleOpdracht;');
  const fn = maak(...Object.values(omg));
  const env = o.env === undefined ? { AIRTABLE_TOKEN: 'x' } : o.env;
  // `request.url` hoort erbij sinds ?alle=1 (#248): de handler leest zijn
  // eigen querystring, dus een nagemaakt verzoek zonder url is geen nagemaakt
  // verzoek meer.
  const url = o.url || 'https://pidlane-proxy.example/airtable/opdracht';
  return { staat, roep: () => fn({ url, headers: { get: () => '' } }, env) };
}

// ══════════════════════════════════════════════════════════════════
console.log('\n1. de poorten vóór Airtable');
// ══════════════════════════════════════════════════════════════════
(async function () {
  {
    const b = bouw({ token: false });
    const r = await b.roep();
    toets('zonder geldig app-token: 401', r.status === 401 && r.body.error === 'unauthorized', JSON.stringify(r));
    toets('en er is niets naar Airtable gegaan', b.staat.verzoeken.length === 0,
      'anders is de token-poort een formaliteit en kost elke aanroep een Airtable-call');
  }
  {
    const b = bouw({ env: {} });
    const r = await b.roep();
    toets('zonder AIRTABLE_TOKEN: 500 met een eigen code',
      r.status === 500 && r.body.error === 'no_airtable_token', JSON.stringify(r));
    toets('en ook dan gaat er niets de deur uit', b.staat.verzoeken.length === 0);
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n2. hij vraagt om de actieve rij, en om de nieuwste eerst');
  // ══════════════════════════════════════════════════════════════════
  {
    const b = bouw({ records: [] });
    await b.roep();
    const u = b.staat.verzoeken[0].url;
    toets('er wordt op Actief gefilterd', /filterByFormula=/.test(u) && /Actief/.test(decodeURIComponent(u)), u);
    toets('en op Gewijzigd aflopend gesorteerd',
      /sort/.test(u) && /Gewijzigd/.test(decodeURIComponent(u)) && /desc/.test(decodeURIComponent(u)), u);
    toets('de tokenkop gaat mee', /Bearer/.test(String(b.staat.verzoeken[0].init.headers.Authorization)));
  }
  {
    const b = bouw({ records: [] });
    const r = await b.roep();
    toets('geen actieve rij → opdracht null, met een reden',
      r.body.ok === true && r.body.opdracht === null && /geen actieve/.test(r.body.reden), JSON.stringify(r.body));
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n3. de rij komt door zoals hij is — keuren doet de app');
  // ══════════════════════════════════════════════════════════════════
  {
    const tekst = '{"schema":1,"naam":"proef"}';
    const b = bouw({ records: [{ id: 'rec1', createdTime: 'T0', fields: { Naam: 'proef', Opdracht: tekst, Gewijzigd: 'T1' } }] });
    const r = await b.roep();
    toets('de tekst gaat ongewijzigd mee', r.body.opdracht === tekst, JSON.stringify(r.body));
    toets('met id en naam erbij', r.body.id === 'rec1' && r.body.naam === 'proef', JSON.stringify(r.body));
    toets('en het tijdstip van wijzigen', r.body.gewijzigd === 'T1', JSON.stringify(r.body));
  }
  {
    // Twee actieve rijen is een fout van de schrijver. De route pakt de
    // nieuwste en MELDT dat er meer stonden — stil de eerste pakken zou
    // betekenen dat je een opdracht aanzet en er een andere gaat draaien.
    const b = bouw({ records: [
      { id: 'recNieuw', fields: { Naam: 'nieuw', Opdracht: '{"a":1}' } },
      { id: 'recOud', fields: { Naam: 'oud', Opdracht: '{"a":2}' } }
    ] });
    const r = await b.roep();
    toets('bij twee actieve rijen wint de eerste uit de sortering',
      r.body.id === 'recNieuw', JSON.stringify(r.body));
    toets('en het antwoord zegt dat er meer stonden', r.body.meer === 2, JSON.stringify(r.body));
  }
  {
    // TEGENPROEF op die melding: bij één rij hoort er geen alarm te staan,
    // anders betekent `meer` niets meer.
    const b = bouw({ records: [{ id: 'r', fields: { Opdracht: '{}' } }] });
    const r = await b.roep();
    toets('TEGENPROEF: bij één rij staat er geen "meer"', !r.body.meer, JSON.stringify(r.body));
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n4. de groottegrens valt hier, niet pas op de telefoon');
  // ══════════════════════════════════════════════════════════════════
  {
    const b = bouw({ records: [{ id: 'r', fields: { Opdracht: 'x'.repeat(8193) } }] });
    const r = await b.roep();
    toets('een opdracht over 8192 tekens gaat niet mee',
      r.body.opdracht === null && /8193/.test(r.body.reden), JSON.stringify(r.body).slice(0, 200));
  }
  {
    const b = bouw({ records: [{ id: 'r', fields: { Opdracht: 'x'.repeat(8192) } }] });
    const r = await b.roep();
    toets('TEGENPROEF: precies op de grens gaat hij wél mee',
      typeof r.body.opdracht === 'string' && r.body.opdracht.length === 8192,
      'een grens die er één te vroeg dichtvalt is net zo goed een fout');
  }
  {
    const b = bouw({ records: [{ id: 'r', fields: { Naam: 'zonder tekst' } }] });
    const r = await b.roep();
    toets('een rij zonder Opdracht-veld levert een lege tekst en geen crash',
      r.body.opdracht === '', JSON.stringify(r.body));
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\n5. als Airtable niet meewerkt');
  // ══════════════════════════════════════════════════════════════════
  {
    const b = bouw({ status: 422, tekst: 'Unknown field Actief' });
    const r = await b.roep();
    toets('een fout van Airtable wordt een 502 met de reden erbij',
      r.status === 502 && r.body.error === 'opdracht_lezen_mislukt' && /Unknown field/.test(r.body.detail),
      JSON.stringify(r.body));
  }
  {
    const b = bouw({ gooi: true });
    const r = await b.roep();
    toets('een netwerkfout wordt gemeld en niet stil geslikt',
      r.status === 502 && r.body.error === 'opdracht_onbereikbaar' && /netwerk weg/.test(r.body.detail),
      JSON.stringify(r.body));
  }

    // ══════════════════════════════════════════════════════════════════
  console.log('\n6. ?alle=1 geeft de hele tabel (#248)');
  // ══════════════════════════════════════════════════════════════════
  {
    const rijen = [
      { id: 'rec1', createdTime: '2026-09-17T22:19:52.000Z',
        fields: { Naam: 'Boordspanning', Reden: '#217', Actief: true,
                  Gewijzigd: '2026-09-18T10:00:00.000Z', Opdracht: '{"schema":1}' } },
      { id: 'rec2', createdTime: '2026-09-16T09:00:00.000Z',
        fields: { Naam: 'Raildruk', Reden: '#19', Opdracht: '{"schema":1,"naam":"x"}' } }
    ];

    const b = bouw({ url: 'https://p.example/airtable/opdracht?alle=1', records: rijen });
    const r = await b.roep();
    const q = b.staat.verzoeken[0].url;

    // DE FILTER MOET WEG, ANDERS IS "alles" NOG STEEDS ALLEEN DE ACTIEVE RIJ.
    toets('zonder ?alle=1 filtert hij nog steeds op Actief',
      /filterByFormula/.test((await (async () => { const c = bouw({ records: [] }); await c.roep(); return c.staat.verzoeken[0]; })()).url));
    toets('met ?alle=1 staat er geen filter meer in', !/filterByFormula/.test(q), q);
    toets('maar wel dezelfde sortering op Gewijzigd', /Gewijzigd/.test(q) && /desc/.test(q), q);
    toets('en een ruimere pageSize', /pageSize=12/.test(q), q);

    toets('het antwoord is gemerkt als lijst', r.body.alle === true, JSON.stringify(r.body).slice(0, 120));
    toets('met beide rijen erin', r.body.opdrachten.length === 2, String(r.body.opdrachten.length));
    toets('de naam gaat mee', r.body.opdrachten[0].naam === 'Boordspanning', r.body.opdrachten[0].naam);
    toets('de reden ook', r.body.opdrachten[0].reden === '#217', r.body.opdrachten[0].reden);
    toets('en of hij actief is', r.body.opdrachten[0].actief === true && r.body.opdrachten[1].actief === false,
      JSON.stringify(r.body.opdrachten.map(function (x) { return x.actief; })));
    toets('de ruwe tekst gaat mee', /schema/.test(r.body.opdrachten[0].opdracht));

    // EEN LEGE TABEL IS GEEN FOUT bij ?alle=1: dan zijn er gewoon geen vragen.
    const leeg = await bouw({ url: 'https://p.example/airtable/opdracht?alle=1', records: [] }).roep();
    toets('een lege tabel geeft een lege lijst en geen foutmelding',
      leeg.body.alle === true && leeg.body.opdrachten.length === 0, JSON.stringify(leeg.body));

    // EEN TE GROTE RIJ VERDWIJNT NIET STIL. Hij blijft in de lijst staan met
    // de reden erbij, anders zoek je in Airtable naar een opdracht die op je
    // telefoon nergens te bekennen is.
    const groot = await bouw({ url: 'https://p.example/airtable/opdracht?alle=1',
      records: [{ id: 'recX', fields: { Naam: 'Te groot', Opdracht: 'x'.repeat(9000) } }] }).roep();
    toets('een te grote opdracht blijft in de lijst', groot.body.opdrachten.length === 1);
    toets('zonder zijn tekst', groot.body.opdrachten[0].opdracht === '');
    toets('maar mét de reden', /9000 tekens/.test(groot.body.opdrachten[0].weg), groot.body.opdrachten[0].weg);

    const zonder = await bouw({ url: 'https://p.example/airtable/opdracht?alle=1',
      records: [{ id: 'recY', fields: { Naam: 'Leeg' } }] }).roep();
    toets('een rij zonder opdrachttekst zegt dat ook', /geen opdrachttekst/.test(zonder.body.opdrachten[0].weg),
      zonder.body.opdrachten[0].weg);

    // ?alle=0 of iets anders telt NIET als alles: een halve waarde mag geen
    // hele tabel opleveren.
    const half = bouw({ url: 'https://p.example/airtable/opdracht?alle=ja', records: rijen });
    const hr = await half.roep();
    toets('?alle=ja is geen ?alle=1', !hr.body.alle && /filterByFormula/.test(half.staat.verzoeken[0].url),
      half.staat.verzoeken[0].url);
  }

console.log('\n' + (fout ? 'FOUT: ' + fout + ' van de ' + n + ' controles'
                            : 'goed: alle ' + n + ' controles') + '\n');
  process.exit(fout ? 1 : 0);
})();
