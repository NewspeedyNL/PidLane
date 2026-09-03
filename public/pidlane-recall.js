/* ═══════════════════════════════════════════════════════════════════
   pidlane-recall.js — PLRecall: terugroepacties met detail, niet alleen ja/nee
   ───────────────────────────────────────────────────────────────────
   WAT ER AL WAS

   pidlane-koopcheck.js leest `openstaande_terugroepactie_indicator` uit
   de RDW-basistabel en zet daar een banner op: RECALL ACTIEF, ja of nee.
   Dat is correct maar het stopt precies waar het gesprek met de klant
   begint. "Er staat een terugroepactie open" roept meteen drie vragen op
   die de banner niet beantwoordt: wélke actie, wat is het risico, en is
   hij al uitgevoerd of niet.

   WAT DEZE MODULE TOEVOEGT

   RDW publiceert die details in drie losse tabellen die je op
   referentiecode aan elkaar moet knopen:

     m9d7-ebf2  Gekentekende_voertuigen  → de ja/nee-vlag (had koopcheck al)
     t49b-isb7  Terugroep_actie_status   → kenteken → referentiecode + status
     j9yg-7rg9  Terugroep_actie          → referentiecode → omschrijving
     9ihi-jgpf  Terugroep_actie_risico   → referentiecode → risico

   PLRecall doet die koppeling en maakt van één vlag een lijst met per
   actie: code, status, omschrijving en risico. Dat is het verschil tussen
   "er is iets" en "de brandstofpomp kan uitvallen, actie loopt nog".

   VOORZICHTIG MET VELDNAMEN

   Van t49b-isb7 staan de velden vast (kenteken, referentiecode_rdw,
   status, code_status). Van j9yg-7rg9 en 9ihi-jgpf niet met zekerheid.
   Daarom haalt deze module het hele record op en toont hij onbekende
   velden onder een uitklapper in plaats van ze weg te gooien. Na één
   lookup op een auto met een echte actie zie je in PLRecall.laatsteRuwe()
   welke namen er werkelijk uit komen; dan kun je VELD_VOORKEUR
   aanscherpen en verdwijnt de uitklapper vanzelf.

   NETWERK

   Gebruikt de bestaande proxy (PROXY_URL + '/proxy?url=') met APP_TOKEN,
   net als pidlane-bt.js en pidlane-koopcheck.js al doen. opendata.rdw.nl
   staat al in PROXY_ALLOWED_HOSTS in worker.js — er hoeft dus niets aan
   de Worker te veranderen.

   Laadvolgorde: ná pidlane-koopcheck.js (gebruikt _koopRdwData niet, maar
   vult wel de banner die koopcheck neerzet).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const DS = {
    voertuig: 'm9d7-ebf2',
    status:   't49b-isb7',
    actie:    'j9yg-7rg9',
    risico:   '9ihi-jgpf'
  };

  const CACHE_TTL = 6 * 60 * 60 * 1000;   // RDW ververst dagelijks
  const MAX_ACTIES = 25;

  // Statussen die "klaar" betekenen. RDW gebruikt vrije tekst, dus we
  // matchen op deelstring. Onbekend telt als open — dat is de veilige kant
  // bij een aankoopadvies.
  const AFGEHANDELD = ['afgehandeld', 'uitgevoerd', 'hersteld', 'beeindigd', 'beëindigd', 'afgesloten'];

  const VELD_VOORKEUR = {
    omschrijving: ['omschrijving', 'omschrijving_terugroepactie', 'onderwerp', 'beschrijving', 'defect_omschrijving'],
    risico:       ['risico_omschrijving', 'omschrijving_risico', 'risico', 'gevaar_omschrijving', 'omschrijving'],
    datum:        ['datum_registratie_terugroepactie_dt', 'datum_registratie_terugroepactie', 'startdatum', 'datum']
  };

  const _cache = new Map();
  let _laatsteRuwe = null;

  // ── Hulp ──────────────────────────────────────────────────────────────

  const normKent = k => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function afgehandeld(status) {
    const s = String(status || '').toLowerCase();
    return !!s && AFGEHANDELD.some(a => s.includes(a));
  }

  function pak(rec, namen) {
    if (!rec) return null;
    for (const n of namen) {
      const v = rec[n];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return null;
  }

  // Overige tekstvelden, zodat een onbekende veldnaam nooit informatie kost
  function rest(rec, gebruikt) {
    if (!rec) return [];
    const negeer = new Set(['referentiecode_rdw', 'kenteken', 'code_status', ...gebruikt]);
    return Object.keys(rec)
      .filter(k => !negeer.has(k) && !/^api_/.test(k))
      .map(k => ({ veld: k, waarde: rec[k] }))
      .filter(x => x.waarde != null && typeof x.waarde !== 'object' && String(x.waarde).trim() !== '')
      .map(x => ({ veld: x.veld, waarde: String(x.waarde).trim() }));
  }

  async function rdw(dataset, query) {
    const doel = `https://opendata.rdw.nl/resource/${dataset}.json?${query}`;
    const r = await plFetch('/proxy?url=' + encodeURIComponent(doel));
    if (!r.ok) throw new Error(`RDW ${dataset}: HTTP ${r.status}`);
    return r.json();
  }

  function diag(msg, lvl) {
    try { if (typeof btDiag === 'function') btDiag(msg, lvl || 'info'); } catch(e){ /* stil: melding mag nooit de stroom breken */ }
  }

  // ── Ophalen ───────────────────────────────────────────────────────────

  async function haal(kt) {
    const [voertuigArr, statusArr] = await Promise.all([
      rdw(DS.voertuig,
        `$select=kenteken,merk,handelsbenaming,openstaande_terugroepactie_indicator&kenteken=${kt}`
      ).catch(() => []),
      rdw(DS.status, `kenteken=${kt}&$limit=${MAX_ACTIES}`).catch(() => [])
    ]);

    const v = voertuigArr[0] || null;
    const codes = [...new Set(statusArr.map(s => s.referentiecode_rdw).filter(Boolean))].slice(0, MAX_ACTIES);

    const acties = await Promise.all(codes.map(async code => {
      const q = `referentiecode_rdw=${encodeURIComponent(code)}&$limit=5`;
      const [a, r] = await Promise.all([
        rdw(DS.actie, q).catch(() => []),
        rdw(DS.risico, q).catch(() => [])
      ]);
      const st = statusArr.find(s => s.referentiecode_rdw === code) || null;
      const statusTekst = pak(st, ['status', 'code_status']) || 'onbekend';

      return {
        referentiecode: code,
        status: statusTekst,
        open: !afgehandeld(statusTekst),
        omschrijving: pak(a[0], VELD_VOORKEUR.omschrijving),
        risico: pak(r[0], VELD_VOORKEUR.risico),
        datum: pak(a[0], VELD_VOORKEUR.datum),
        extra: [
          ...rest(a[0], [...VELD_VOORKEUR.omschrijving, ...VELD_VOORKEUR.datum]),
          ...rest(r[0], VELD_VOORKEUR.risico)
        ]
      };
    }));

    _laatsteRuwe = { voertuig: v, status: statusArr, acties };

    return {
      kenteken: kt,
      indicator: v ? (v.openstaande_terugroepactie_indicator || null) : null,
      merk: v ? (v.merk || null) : null,
      handelsbenaming: v ? (v.handelsbenaming || null) : null,
      acties,
      opgehaald: new Date().toISOString()
    };
  }

  // ── API ───────────────────────────────────────────────────────────────

  const PLRecall = {

    async check(kenteken, opts) {
      const kt = normKent(kenteken);
      if (!kt) throw new Error('Geen geldig kenteken');

      if (!(opts && opts.negeerCache)) {
        const c = _cache.get(kt);
        if (c && Date.now() - c.t < CACHE_TTL) return c.data;
      }

      const res = await haal(kt);
      res.samenvatting = PLRecall.samenvat(res);
      _cache.set(kt, { t: Date.now(), data: res });

      const s = res.samenvatting;
      diag(`Terugroepacties ${kt}: ${s.tekst}`, s.niveau === 'kritiek' ? 'warn' : 'ok');
      return res;
    },

    samenvat(res) {
      const acties = (res && res.acties) || [];
      const open = acties.filter(a => a.open);

      if (open.length) return {
        niveau: 'kritiek', aantalOpen: open.length, aantalTotaal: acties.length,
        tekst: `${open.length} openstaande terugroepactie${open.length === 1 ? '' : 's'}`
      };

      if (/^j/i.test(String(res && res.indicator || ''))) return {
        // RDW-vlag staat op ja maar de detailtabel geeft niets terug. Dat komt
        // voor bij vertraagde koppeling in de open data — niet wegpoetsen.
        niveau: 'let-op', aantalOpen: 0, aantalTotaal: acties.length,
        tekst: 'RDW meldt een openstaande actie, details nog niet beschikbaar'
      };

      if (acties.length) return {
        niveau: 'ok', aantalOpen: 0, aantalTotaal: acties.length,
        tekst: `${acties.length} terugroepactie${acties.length === 1 ? '' : 's'}, allemaal afgehandeld`
      };

      return { niveau: 'ok', aantalOpen: 0, aantalTotaal: 0, tekst: 'Geen terugroepacties bekend' };
    },

    render(res) {
      if (!res) return '';
      const s = res.samenvatting || PLRecall.samenvat(res);
      const klasse = 'pl-rc-' + s.niveau;
      const icoon = s.niveau === 'kritiek' ? '⚠️' : s.niveau === 'let-op' ? '❓' : '✅';

      let h = `<div class="pl-rc ${klasse}">`;
      h += `<div class="pl-rc-kop">${icoon} Terugroepacties — ${esc(s.tekst)}</div>`;

      if (res.acties && res.acties.length) {
        h += '<ul class="pl-rc-lijst">';
        for (const a of res.acties) {
          h += `<li class="pl-rc-item${a.open ? ' open' : ''}">`;
          h += `<span class="pl-rc-code">${esc(a.referentiecode)}</span>`;
          h += `<span class="pl-rc-status">${esc(a.status)}</span>`;
          if (a.datum) h += `<span class="pl-rc-datum">${esc(a.datum)}</span>`;
          if (a.omschrijving) h += `<div class="pl-rc-oms">${esc(a.omschrijving)}</div>`;
          if (a.risico) h += `<div class="pl-rc-risico"><b>Risico:</b> ${esc(a.risico)}</div>`;
          if (a.extra && a.extra.length) {
            h += '<details class="pl-rc-extra"><summary>Overige RDW-velden</summary><ul>';
            for (const e of a.extra) h += `<li>${esc(e.veld)}: ${esc(e.waarde)}</li>`;
            h += '</ul></details>';
          }
          h += '</li>';
        }
        h += '</ul>';
      }
      return h + '</div>';
    },

    // Compacte regel voor de AI-prompt. Koopcheck stuurt nu alleen "JA"/"nee";
    // hiermee weet het model ook waaróver het gaat en kan het dat meewegen in
    // het inkoopadvies in plaats van er los een waarschuwing bij te zetten.
    naarPromptRegel(res) {
      if (!res) return '';
      const s = res.samenvatting || PLRecall.samenvat(res);
      if (s.niveau === 'ok' && !s.aantalTotaal) return 'Terugroepacties: geen bekend.';
      let r = `Terugroepacties: ${s.tekst}.`;
      for (const a of (res.acties || []).filter(x => x.open)) {
        r += ` [${a.referentiecode}] ${a.omschrijving || 'geen omschrijving'}` +
             (a.risico ? ` Risico: ${a.risico}` : '');
      }
      return r;
    },

    // Vult de bestaande koopRecallBanner aan met de details. Koopcheck zet de
    // banner zelf op zichtbaar op basis van de ja/nee-vlag; wij vullen 'm.
    async vulKoopcheckBanner(kenteken) {
      const el = document.getElementById('koopRecallBanner');
      if (!el) return null;
      try {
        const res = await PLRecall.check(kenteken);
        const s = res.samenvatting;
        if (s.niveau === 'ok' && !s.aantalOpen) { el.style.display = 'none'; return res; }
        el.style.display = 'block';
        el.innerHTML = PLRecall.render(res);
        return res;
      } catch (e) {
        diag('Terugroepdetails ophalen mislukt: ' + (e.message || e), 'warn');
        return null;
      }
    },

    laatsteRuwe() { return _laatsteRuwe; },
    wisCache() { _cache.clear(); }
  };

  // Automatisch meeliften op de bestaande kentekenlookups. Zowel pidlane-bt.js
  // als pidlane-koopcheck.js vuren dit af nadat ze pl_kenteken hebben gezet.
  window.addEventListener('pl:kenteken-geladen', ev => {
    const kt = ev && ev.detail && ev.detail.kenteken;
    if (!kt) return;
    PLRecall.vulKoopcheckBanner(kt).then(res => {
      if (!res) return;
      window._plRecall = res;   // beschikbaar voor de AI-prompts
      try { window.dispatchEvent(new CustomEvent('pl:recall-klaar', { detail: res })); } catch(e){ /* stil: browser-API kan ontbreken of geweigerd worden */ }
    });
  });

  window.PLRecall = PLRecall;
})();
