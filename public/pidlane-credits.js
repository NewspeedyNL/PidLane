/* ═══════════════════════════════════════════════════════════════════════
   pidlane-credits.js — Tegoed ("tokens") + kostenpreview vóór AI-analyse
   ───────────────────────────────────────────────────────────────────────
   DOEL (twee dingen, bewust gecombineerd in één sheet):
     1. "Dit kost X tokens"      → de gebruiker voelt dat AI geld kost.
     2. "Dit is de data die ik stuur" → de gebruiker ziet WAAROM het kost,
        en dus dat schone, gerichte meetdata goedkoper is dan een berg ruis.
        Daarmee krijgt de PID-recorder/veldlab-route zichtbaar waarde.

   WERKING
     Haakt op één plek in: apiFetch() in pidlane-fuel.js. Álle AI-calls in
     de app lopen daardoorheen (20 aanroepplekken), dus één hook dekt alles.
     Op dat punt zijn `prompt` én `sys` volledig samengesteld — we meten dus
     wat er ECHT over de lijn gaat, inclusief de onzichtbare kostenposten:
     het contextblok met eerdere rapporten (tot ~6 kB), de dossierregel en
     de rijsituatieregel.

   ONTWERPKEUZES
     - UI zegt "tokens" (herkenbaar voor de gebruiker), code zegt `credits`
       — anders botst het met de LLM-token-taal die overal in de AI-code zit.
     - FAIL-OPEN: gaat er hier iets stuk, dan draait de analyse gewoon door.
       Een bug in de tegoedmodule mag de app nooit blokkeren.
     - EEN BRON VOOR HET TEGOED: de server. Deze module deelt zelf geen
       credits uit en telt er zelf geen bij — localStorage is een afschrift
       van het serversaldo, nooit de bron. Tot 29-08-2026 was dat anders en
       leverde app-gegevens wissen telkens 25 nieuwe tokens op (#49).
     - Admin en demomodus betalen niet.
     - Kleine calls (onder de drempel) tonen geen sheet — anders zeurt de app
       bij elke achtergrond-call.
     - Zelfkalibrerend: de tekens→tokens-schatting wordt na elke call
       bijgesteld met de echte `usage` uit de API-respons.

   AFHANKELIJKHEDEN
     - CSS-klassen .ai-sheet-ov / .ai-sheet / .ai-sheet-h / .ai-sheet-b /
       .ai-sheet-f / .ai-act (bestaan al in pidlane.css)
     - optioneel: isAdmin(), showToast(), log()

   NOG NIET ACTIEF (stap 5 van het plan)
     Het inwisselen van een activatiecode praat met CFG.verzilverPad op de
     Worker. Zolang dat endpoint niet bestaat toont de sheet netjes
     "nog niet beschikbaar" in plaats van een harde fout.

   CHANGELOG
     2026-07-29  v1.0  Eerste versie: saldo, payload-ontleding, preview-sheet,
                       zelfkalibratie, saldochip, code-inwissel-stub.
     2026-08-29  v1.1  Proeftegoed weg uit de client (#49). saldo() kent drie
                       toestanden; een code wordt alleen nog op een account
                       bijgeschreven.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Instellingen — hier draai je aan de knoppen ──────────────────────
  const CFG = {
    // GEEN gratisStart meer (#49, 29-08-2026). Hier stond `gratisStart: 25`:
    // saldo() deelde dat uit zodra de localStorage-sleutel ontbrak, dus
    // app-gegevens wissen leverde onbeperkt nieuwe tokens op. Het echte
    // proeftegoed staat op het account — handleKlantOnboarding in worker.js
    // boekt KLANT_START_SALDO (20) bij en zet StartTegoedGegeven, zodat het
    // per account precies één keer gebeurt. Twee getallen (25 hier, 20 daar)
    // voor één begrip was bovendien precies de vorm die in dit project al
    // drie keer een bug is geweest.

    // Prijs per 1000 tokens, in credits. De verhouding in:uit (1:5) volgt
    // de echte inkoopprijs, zodat een lang antwoord ook echt zwaarder weegt.
    // IJKPUNT: een volwaardige analyse (~1,2k invoer + ~1,2k antwoord) komt
    // hiermee op ±6 credits, dus 25 gratis credits ≈ 4 analyses. Verhoog of
    // verlaag deze twee getallen om je marge en proefperiode te sturen.
    creditPer1kIn: 0.70,
    creditPer1kOut: 3.50,
    minCredits: 1,

    // Startwaarden voor de schatting; worden gekalibreerd op echte usage.
    tekensPerToken: 3.7,   // Nederlands + veel getallen/hex
    uitvoerFactor: 0.55,   // modellen halen het max_tokens-plafond zelden

    // Onder dit aantal credits geen preview-sheet (achtergrond/hulpcalls).
    previewDrempel: 3,

    // Saldochip linksonder. Zet op false als je 'm zelf wilt plaatsen.
    chipTonen: true,
    chipPositie: 'left:8px;bottom:110px',

    // Worker-endpoint voor het inwisselen van een activatiecode.
    // Route zit in worker.js (handleCreditsRedeem). Zet op null om de
    // codefunctie uit te schakelen; de sheet meldt dat dan netjes.
    verzilverPad: '/credits/redeem',

    // lsSaldo is sinds 29-08-2026 een AFSCHRIFT van het serversaldo, geen bron.
    // Ontbreekt hij, dan weten we het niet — zie saldoBekend().
    lsSaldo: 'pl_credits_saldo',
    lsKalib: 'pl_credits_kalib'
    // lsInit ('pl_credits_init') is weg. Dat was de vastlegging dát dit toestel
    // zijn proeftegoed al kreeg, en die vraag stelt het toestel niet meer.
    // Op toestellen die de sleutel al hebben blijft hij staan en doet niets.
  };

  // ── Kleine helpers ───────────────────────────────────────────────────
  const _log = (m, t) => { try { (window.log || function () {})(m, t || 'info'); } catch(e){ /* stil: melding mag nooit de stroom breken */ } };
  const _toast = (m) => { try { (window.showToast || function () {})(m); } catch(e){ /* stil: melding mag nooit de stroom breken */ } };
  const _esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const _nl = (n) => Number(n || 0).toLocaleString('nl-NL');

  function _lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function _lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function _lsDel(k) { try { localStorage.removeItem(k); return true; } catch (e) { return false; } }

  // Geheugen-fallback als localStorage geblokkeerd is (privémodus/webview).
  let _memSaldo = null;

  // Saldo van de server (tabel Klanten). Zodra dit gevuld is, is dít de
  // waarheid en dient localStorage alleen nog als cache voor een snelle
  // eerste weergave. Zo raakt een klant zijn tokens niet kwijt bij het
  // wissen van browsergegevens of bij inloggen op een tweede apparaat.
  let _serverSaldo = null;

  function zetServerSaldo(n) {
    const v = Number(n);
    if (n === null || n === undefined || !isFinite(v)) return;
    _serverSaldo = Math.max(0, Math.round(v));
    _memSaldo = _serverSaldo;
    _lsSet(CFG.lsSaldo, String(_serverSaldo));
    _chipVerversen();
  }


  // 31-07-2026 — _boekServer() is hier weg. Die riep /klant/saldo-muteer aan om
  // het verbruik af te boeken, maar afrekenen vanuit de app is een verzoek en
  // geen controle: wie dat verzoek blokkeert of localStorage wist, gebruikt de
  // AI gratis. De Worker boekt nu zelf af in handleMessages, op het echte
  // verbruik uit usage. Deze module doet nog twee dingen — het kostenvenster
  // vooraf tonen en de teller in beeld bijwerken — en raakt het saldo op de
  // server niet meer aan. Zou hij dat wél doen, dan betaalt de klant dubbel.

  // ── Saldo ────────────────────────────────────────────────────────────
  // DRIE TOESTANDEN, niet twee (#49, 29-08-2026). Naast "zoveel tokens" en
  // "nul tokens" bestaat er ONBEKEND: dit toestel heeft nog geen saldo van de
  // server gezien. Dat verschil is de hele fix. Onbekend als nul lezen zou de
  // app laten blokkeren op een getal dat wij verzonnen hebben; onbekend als
  // proeftegoed lezen was de bug — dan deelde elke wis-actie 25 tokens uit.
  //
  // Onbekend telt in saldo() als 0 omdat elke aanroeper een getal verwacht;
  // wie op dat getal een besluit neemt, vraagt er saldoBekend() bij. Dat zijn
  // er precies drie: _chipVerversen(), _sheet() en preflight().
  function saldoBekend() {
    if (_serverSaldo !== null || _memSaldo !== null) return true;
    const raw = _lsGet(CFG.lsSaldo);
    return !(raw === null || raw === '');
  }

  function saldo() {
    if (_serverSaldo !== null) return _serverSaldo;
    if (_memSaldo !== null) return _memSaldo;
    const raw = _lsGet(CFG.lsSaldo);
    if (raw === null || raw === '') return 0;
    const n = parseInt(raw, 10);
    return isFinite(n) ? Math.max(0, n) : 0;
  }

  function _setSaldo(n) {
    const v = Math.max(0, Math.round(Number(n) || 0));
    _memSaldo = v;
    _lsSet(CFG.lsSaldo, String(v));
    _chipVerversen();
    return v;
  }

  function bijboeken(n) {
    const v = _setSaldo(saldo() + Math.max(0, Math.round(Number(n) || 0)));
    _log('Tegoed bijgeboekt: +' + n + ' → ' + v, 'info');
    return v;
  }

  function afboeken(n) {
    const v = _setSaldo(saldo() - Math.max(0, Math.round(Number(n) || 0)));
    return v;
  }

  // ── Vrijstellingen ───────────────────────────────────────────────────
  // Admin betaalt niet (die beheert de pot), demomodus ook niet.
  //
  // TESTMODUS — omdat een beheerder normaal niets van deze module ziet, is
  // hij als beheerder ook niet te testen. Open de app daarom eenmalig met
  // ?tokentest=1 erachter, bijvoorbeeld:
  //     https://app.pidlane.nl/?tokentest=1
  // Vanaf dat moment doet de app alsof je een gewone klant bent: bolletje,
  // kostenvenster en afboeken werken allemaal. Dat blijft zo tot je het
  // tabblad sluit. Uitzetten kan ook meteen met ?tokentest=0.
  function _testModus() {
    try {
      const p = new URLSearchParams(location.search).get('tokentest');
      if (p === '1') sessionStorage.setItem('pl_credits_test', '1');
      if (p === '0') sessionStorage.removeItem('pl_credits_test');
      return sessionStorage.getItem('pl_credits_test') === '1';
    } catch (e) { return false; }
  }

  // Is de ingelogde gebruiker een zelf-geregistreerde klant? Die betaalt met
  // tokens. Accounts uit de tabel Users zijn zakelijk (abonnement) en dus vrij.
  function _isKlant() {
    try {
      const u = window.currentUser;
      return !!(u && String(u.role || '').toLowerCase() === 'klant');
    } catch (e) { return false; }
  }

  function _vrijgesteld() {
    if (_testModus()) return false;                  // testmodus wint
    if (_isKlant()) return false;                    // klant betaalt met tokens
    // Elk ander ingelogd account komt uit de tabel Users → abonnement, vrij.
    try { if (window.currentUser) return true; } catch(e){ /* stil: leest een globale die nog niet gezet hoeft te zijn */ }
    try { if (demoMode === true) return true; } catch(e){ /* stil: leest een globale die nog niet gezet hoeft te zijn */ }
    return false;
  }

  // ── Kalibratie tekens → tokens ───────────────────────────────────────
  // We schatten vooraf op tekens. Na elke call weten we via usage het echte
  // aantal tokens; die verhouding wordt met een lopend gemiddelde bijgesteld,
  // zodat de schatting per voertuig/taal steeds scherper wordt.
  function _kalib() {
    try {
      const o = JSON.parse(_lsGet(CFG.lsKalib) || 'null');
      if (o && isFinite(o.tpt) && o.tpt > 1.5 && o.tpt < 8) return o;
    } catch(e){ /* stil: JSON kan corrupt of leeg zijn */ }
    return { tpt: CFG.tekensPerToken, uf: CFG.uitvoerFactor, n: 0 };
  }

  function _kalibreer(tekensIn, usage, maxTokens) {
    try {
      const k = _kalib();
      const inTok = usage && usage.input_tokens;
      const uitTok = usage && usage.output_tokens;
      const w = Math.min(0.25, 1 / (k.n + 2));           // dempt uitschieters
      if (inTok > 50 && tekensIn > 200) {
        const tpt = tekensIn / inTok;
        if (tpt > 1.5 && tpt < 8) k.tpt = k.tpt * (1 - w) + tpt * w;
      }
      if (uitTok > 20 && maxTokens > 0) {
        const uf = Math.min(1, uitTok / maxTokens);
        k.uf = k.uf * (1 - w) + uf * w;
      }
      k.n = (k.n || 0) + 1;
      _lsSet(CFG.lsKalib, JSON.stringify(k));
    } catch(e){ /* stil: waarde kan niet-serialiseerbaar zijn */ }
  }

  function _schatTokens(txt) {
    const k = _kalib();
    return Math.ceil(String(txt || '').length / k.tpt);
  }

  function _credits(inTok, uitTok) {
    const c = (inTok / 1000) * CFG.creditPer1kIn + (uitTok / 1000) * CFG.creditPer1kOut;
    return Math.max(CFG.minCredits, Math.ceil(c));
  }

  // Kosten op basis van het ECHTE verbruik uit de API-respons in plaats van de
  // schatting vooraf. Geeft 0 terug als usage ontbreekt, zodat de aanroeper kan
  // terugvallen op de schatting.
  function _kostenUitUsage(usage) {
    const inTok = Number(usage && usage.input_tokens) || 0;
    const uitTok = Number(usage && usage.output_tokens) || 0;
    if (!inTok && !uitTok) return 0;
    return _credits(inTok, uitTok);
  }

  // ── Payload ontleden ─────────────────────────────────────────────────
  // Splitst wat er écht verstuurd wordt op in begrijpelijke blokken, zodat
  // de gebruiker ziet waar zijn tokens heen gaan. De markers hieronder komen
  // uit pidlane-fuel.js / -voertuigdata.js / -rijsituatie.js / -archief.js.
  const MRK_RAPPORTEN = '\n\nEERDERE RAPPORTEN DEZE SESSIE';
  const MRK_SITUATIE = '\n\nRIJSITUATIE / BIJZONDERHEDEN';
  const MRK_DOSSIER = '\nDOSSIER (door gebruiker bevestigd';
  // Mode 06 (pidlane-mode06.js) zet een eigen kop in de prompt. Zonder eigen
  // blok zou dat stilzwijgend onder "Vraag + opmaakinstructies" vallen en zag
  // de gebruiker niet dat een monitorscan tokens kost.
  const MRK_MONITOR = 'Mode 06 monitortests:';

  function _knip(S) {
    const iRap = S.indexOf(MRK_RAPPORTEN);
    const iSit = S.indexOf(MRK_SITUATIE);
    const eind = (a) => {
      const kand = [iRap, iSit].filter((x) => x > a);
      return kand.length ? Math.min.apply(null, kand) : S.length;
    };
    const rap = iRap >= 0 ? S.slice(iRap, eind(iRap)) : '';
    const sit = iSit >= 0 ? S.slice(iSit, eind(iSit)) : '';
    let basis = S.slice(0, Math.min.apply(null, [iRap, iSit].filter((x) => x >= 0).concat([S.length])));

    // Dossierregel zit ingebed in de basisinstructie → apart uitknippen.
    let dos = '';
    const iDos = basis.indexOf(MRK_DOSSIER);
    if (iDos >= 0) {
      let e = basis.indexOf('\n', iDos + 1);
      if (e < 0) e = basis.length;
      dos = basis.slice(iDos, e);
      basis = basis.slice(0, iDos) + basis.slice(e);
    }
    return { basis: basis, dossier: dos, situatie: sit, rapporten: rap };
  }

  // Regelclassificatie in de eigenlijke prompt: meetdata vs foutcodes vs tekst.
  const RX_DTC = /\b[PUBC][0-3][0-9A-F]{3}\b/g;
  const RX_HEXPID = /\b0[1-9A-F][0-9A-F]{2}\b/;
  const RX_EENHEID = /\d\s*(%|°\s?C|km\/u|km\/h|rpm|kPa|hPa|mbar|bar|\bV\b|g\/s|Nm|ms\b|mA|km\b|l\/100|kW|pk)/i;
  const RX_NULWAARDE = /[:=]\s*-?0(?:[.,]0+)?\s*(?:$|[^\d.,])/;

  function _regels(P) {
    const lijnen = String(P || '').split('\n');
    const r = { meetT: 0, dtcT: 0, restT: 0, nMeet: 0, nDtc: 0, nNul: 0, nDup: 0 };
    const gezien = Object.create(null);
    for (let i = 0; i < lijnen.length; i++) {
      const l = lijnen[i];
      const len = l.length + 1;
      const trimmed = l.trim();

      if (trimmed.length > 12) {
        if (gezien[trimmed]) r.nDup++; else gezien[trimmed] = 1;
      }

      const dtcs = trimmed.match(RX_DTC);
      if (dtcs && dtcs.length) { r.dtcT += len; r.nDtc += dtcs.length; continue; }

      const heeftCijfer = /\d/.test(trimmed);
      const lijktMeting = heeftCijfer && (RX_HEXPID.test(trimmed) || RX_EENHEID.test(trimmed) || /[:=]\s*-?\d/.test(trimmed));
      if (lijktMeting) {
        r.meetT += len; r.nMeet++;
        if (RX_NULWAARDE.test(trimmed)) r.nNul++;
        continue;
      }
      r.restT += len;
    }
    return r;
  }

  function ontleed(prompt, sys, maxTokens) {
    const P = String(prompt || ''), S = String(sys || '');
    const d = _knip(S);
    const r = _regels(P);
    const k = _kalib();

    // Mode 06-blok apart meten. Het staat in de prompt (niet in sys) en loopt
    // tot de volgende lege regel; de rest telt dan niet dubbel bij 'vraag'.
    const _m06 = (function () {
      const i = P.indexOf(MRK_MONITOR);
      if (i < 0) return { tekens: 0, n: 0 };
      let e = P.indexOf('\n\n', i);
      if (e < 0) e = P.length;
      const blok = P.slice(i, e);
      return { tekens: blok.length, n: (blok.match(/^- /gm) || []).length };
    })();

    const blokken = [
      { id: 'instructie', icoon: '🧭', naam: 'AI-instructies (rol + regels)', tekens: d.basis.length, kleur: '#8b5cf6', vast: true },
      { id: 'dossier', icoon: '📋', naam: 'Voertuigdossier', tekens: d.dossier.length, kleur: '#0ea5e9' },
      { id: 'situatie', icoon: '🛣️', naam: 'Rijsituatie', tekens: d.situatie.length, kleur: '#14b8a6' },
      { id: 'rapporten', icoon: '📄', naam: 'Eerdere rapporten (context)', tekens: d.rapporten.length, kleur: '#f59e0b' },
      { id: 'meet', icoon: '📡', naam: 'Meetwaarden' + (r.nMeet ? ' (' + r.nMeet + ' regels)' : ''), tekens: r.meetT, kleur: '#22c55e' },
      { id: 'dtc', icoon: '⚠️', naam: 'Foutcodes' + (r.nDtc ? ' (' + r.nDtc + ')' : ''), tekens: r.dtcT, kleur: '#ef4444' },
      { id: 'monitor', icoon: '🔬', naam: 'Monitortests (mode 06)' + (_m06.n ? ' (' + _m06.n + ')' : ''), tekens: _m06.tekens, kleur: '#a855f7' },
      { id: 'vraag', icoon: '❓', naam: 'Vraag + opmaakinstructies', tekens: Math.max(0, r.restT - _m06.tekens), kleur: '#64748b' }
    ].filter((b) => b.tekens > 0);

    const totTekens = P.length + S.length;
    const inTok = _schatTokens(P) + _schatTokens(S);
    const uitTok = Math.round((maxTokens || 1500) * k.uf);
    const credits = _credits(inTok, uitTok);

    blokken.forEach((b) => {
      b.tokens = Math.ceil(b.tekens / k.tpt);
      b.pct = totTekens ? (b.tekens / totTekens) * 100 : 0;
    });
    blokken.sort((a, b) => b.tekens - a.tekens);

    return {
      blokken: blokken,
      totTekens: totTekens,
      inTok: inTok,
      uitTok: uitTok,
      maxTokens: maxTokens,
      credits: credits,
      tellers: r,
      vlaggen: _vlaggen(r, blokken, totTekens, inTok)
    };
  }

  // ── Kwaliteitssignalen ───────────────────────────────────────────────
  // Dit is het educatieve deel: niet "je data is slecht", maar "hier zit
  // je geld in, en dit kun je eraan doen".
  function _vlaggen(r, blokken, totTekens, inTok) {
    const v = [];
    const vind = (id) => blokken.filter((b) => b.id === id)[0];

    const rap = vind('rapporten');
    if (rap && rap.pct > 22) {
      v.push({
        soort: 'let', icoon: '📄',
        tekst: 'Eerdere rapporten zijn ' + Math.round(rap.pct) + '% van deze verzending.',
        tip: 'Niet nodig voor een losse vraag? Zet contextgebruik uit via 📄 Rapporten.'
      });
    }

    if (r.nMeet >= 6 && r.nNul / r.nMeet > 0.30) {
      v.push({
        soort: 'let', icoon: '⭕',
        tekst: Math.round((r.nNul / r.nMeet) * 100) + '% van de meetregels staat op nul.',
        tip: 'Nulwaarden kosten evenveel als echte data. Meet met draaiende motor of bij belasting.'
      });
    }

    if (r.nMeet > 0 && r.nMeet < 5) {
      v.push({
        soort: 'let', icoon: '📊',
        tekst: 'Weinig meetdata (' + r.nMeet + ' regels) — de AI heeft weinig om op te bouwen.',
        tip: 'Een korte PID-opname geeft een veel scherper rapport voor nauwelijks meer tokens.'
      });
    }

    if (r.nDup >= 4) {
      v.push({
        soort: 'let', icoon: '🔁',
        tekst: r.nDup + ' identieke regels in de verzending.',
        tip: 'Herhaling levert geen extra inzicht op, maar wordt wel volledig meegerekend.'
      });
    }

    if (inTok > 12000) {
      v.push({
        soort: 'let', icoon: '📦',
        tekst: 'Grote verzending (' + _nl(inTok) + ' tokens invoer).',
        tip: 'Een gerichtere vraag over één klacht is meestal goedkoper én scherper.'
      });
    }

    if (!v.length) {
      v.push({
        soort: 'ok', icoon: '✅',
        tekst: 'Verzending ziet er efficiënt uit.',
        tip: 'Goede verhouding tussen meetdata en instructies.'
      });
    }
    return v;
  }

  // ── Saldochip ────────────────────────────────────────────────────────
  function _chipVerversen() {
    if (!CFG.chipTonen) return;
    try {
      if (_vrijgesteld()) { const o = document.getElementById('plCredChip'); if (o) o.remove(); return; }
      if (!document.body) return;
      let c = document.getElementById('plCredChip');
      if (!c) {
        c = document.createElement('div');
        c.id = 'plCredChip';
        c.style.cssText = 'position:fixed;' + CFG.chipPositie + ';z-index:var(--z-zwevend,9400);background:var(--sur2,#1a1f2e);' +
          'border:1px solid var(--bd,#2a3142);color:var(--tx2,#cbd5e1);font:700 10px/1 var(--f,sans-serif);' +
          'padding:6px 9px;border-radius:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)';
        c.onclick = function () {
          try {
            if (window.PLKlant && PLKlant.isKlant && PLKlant.isKlant()) { PLKlant.openMijnTokens(); return; }
          } catch(e){ console.warn('PLKlant.openMijnTokens mislukt:', e); }
          openVerzilver();
        };
        document.body.appendChild(c);
      }
      const s = saldo();
      if (!saldoBekend()) {
        // Nog geen saldo van de server gezien. "0 tokens" met een rode rand
        // zou hier een bewering zijn die we niet kunnen waarmaken.
        c.innerHTML = '\u26A1 tokens onbekend';
        c.style.borderColor = 'var(--bd,#2a3142)';
        return;
      }
      c.innerHTML = '\u26A1 ' + _nl(s) + ' tokens';
      c.style.borderColor = s <= 0 ? 'var(--rd,#ef4444)' : (s <= 5 ? 'var(--or,#f59e0b)' : 'var(--bd,#2a3142)');
    } catch(e){ console.warn('_nl mislukt:', e); }
  }

  // ── Overlay-hulp ─────────────────────────────────────────────────────
  function _overlay(id) {
    let ov = document.getElementById(id);
    if (!ov) {
      ov = document.createElement('div');
      ov.id = id;
      ov.className = 'ai-sheet-ov';
      ov.style.zIndex = '9930';
      document.body.appendChild(ov);
    }
    return ov;
  }

  // ── Preview-sheet ────────────────────────────────────────────────────
  let _sheetBezig = null;
  let _nietMeerVragen = false;   // per sessie, gezet via checkbox

  function _sheet(a) {
    if (_sheetBezig) return _sheetBezig;
    _sheetBezig = new Promise((res) => {
      const ov = _overlay('plCredSheet');
      const s = saldo();
      const bekend = saldoBekend();
      // Onbekend saldo mag geen "tekort" tonen: we weten het niet. Het venster
      // laat dan de kosten zien en laat doorgaan; de Worker weigert alsnog met
      // 402 als het tegoed echt op is. Dat is ook de bestaande verdeling —
      // zie de alinea bij _boekServer() hierboven: afrekenen vanuit de app is
      // een verzoek en geen controle.
      const genoeg = !bekend || s >= a.credits;

      const staafjes = a.blokken.map((b) =>
        '<div style="width:' + Math.max(1.5, b.pct).toFixed(1) + '%;background:' + b.kleur + '"></div>').join('');

      const rijen = a.blokken.map((b) =>
        '<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--bd)">' +
          '<span style="width:9px;height:9px;border-radius:2px;background:' + b.kleur + ';flex:none"></span>' +
          '<span style="flex:none;font-size:14px">' + b.icoon + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:12px;color:var(--tx,#e2e8f0);font-weight:600">' + _esc(b.naam) + '</div>' +
            '<div style="font-size:11px;color:var(--tx3,#94a3b8)">' + _nl(b.tokens) + ' tokens \u00b7 ' + Math.round(b.pct) + '%' +
              (b.vast ? ' \u00b7 vast' : '') + '</div>' +
          '</div>' +
        '</div>').join('');

      const vlaggen = a.vlaggen.map((f) => {
        const ok = f.soort === 'ok';
        return '<div style="display:flex;gap:8px;padding:8px 10px;margin-top:6px;border-radius:7px;' +
          'background:' + (ok ? 'var(--gns,rgba(34,197,94,.12))' : 'var(--ors,rgba(245,158,11,.12))') + ';' +
          'border-left:3px solid ' + (ok ? 'var(--gn,#22c55e)' : 'var(--or,#f59e0b)') + '">' +
          '<span style="flex:none">' + f.icoon + '</span>' +
          '<div style="min-width:0">' +
            '<div style="font-size:11.5px;font-weight:600;color:var(--tx,#e2e8f0)">' + _esc(f.tekst) + '</div>' +
            '<div style="font-size:10.5px;color:var(--tx3,#94a3b8);margin-top:2px">' + _esc(f.tip) + '</div>' +
          '</div></div>';
      }).join('');

      ov.innerHTML =
        '<div class="ai-sheet" style="max-width:470px">' +
          '<div class="ai-sheet-h"><b>\u26A1 Wat kost deze analyse?</b>' +
            '<button class="ai-sheet-x" id="plCredX">\u2715</button></div>' +
          '<div class="ai-sheet-b">' +

            // Kostenbanner
            '<div style="display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:10px;' +
              'background:var(--sur2,#1a1f2e);border:1px solid ' + (genoeg ? 'var(--bl,#6366f1)' : 'var(--rd,#ef4444)') + '">' +
              '<div style="font-size:30px;line-height:1">\u26A1</div>' +
              '<div style="flex:1">' +
                '<div style="font-size:27px;font-weight:800;line-height:1;color:' + (genoeg ? 'var(--bl,#6366f1)' : 'var(--rd,#ef4444)') + '">' + a.credits + '</div>' +
                '<div style="font-size:10.5px;color:var(--tx3,#94a3b8);margin-top:3px">tokens voor deze analyse</div>' +
              '</div>' +
              '<div style="text-align:right;font-size:10.5px;color:var(--tx3,#94a3b8);line-height:1.5">' +
                (bekend
                  ? 'saldo nu <b style="color:var(--tx2,#cbd5e1)">' + _nl(s) + '</b><br>' +
                    (genoeg
                      ? 'daarna <b style="color:var(--tx2,#cbd5e1)">' + _nl(s - a.credits) + '</b>'
                      : '<b style="color:var(--rd,#ef4444)">' + _nl(a.credits - s) + ' tekort</b>')
                  : 'saldo nog <b style="color:var(--tx2,#cbd5e1)">onbekend</b><br>wordt op de server geteld') +
              '</div>' +
            '</div>' +

            // Verdeelstaaf
            '<div style="display:flex;height:7px;border-radius:4px;overflow:hidden;margin:14px 0 3px;background:var(--bd,#2a3142)">' +
              staafjes + '</div>' +
            '<div style="font-size:10.5px;color:var(--tx3,#94a3b8);margin-bottom:8px">' +
              'Verzending: ' + _nl(a.totTekens) + ' tekens \u2248 ' + _nl(a.inTok) + ' tokens invoer' +
              ' + ~' + _nl(a.uitTok) + ' tokens antwoord</div>' +

            // Blokken
            '<div style="font-size:11px;font-weight:700;color:var(--tx2,#cbd5e1);margin:12px 0 2px">' +
              '\ud83d\udce6 Dit stuur ik mee</div>' +
            '<div>' + rijen + '</div>' +

            // Signalen
            '<div style="font-size:11px;font-weight:700;color:var(--tx2,#cbd5e1);margin:14px 0 2px">' +
              '\ud83d\udca1 Wat dit betekent</div>' +
            vlaggen +

            '<label style="display:flex;align-items:center;gap:7px;margin-top:14px;font-size:10.5px;' +
              'color:var(--tx3,#94a3b8);cursor:pointer">' +
              '<input type="checkbox" id="plCredStil" style="accent-color:var(--bl,#6366f1)"> ' +
              'Niet meer vragen deze sessie (tokens worden wel gewoon afgeboekt)</label>' +

          '</div>' +
          '<div class="ai-sheet-f">' +
            '<button class="ai-act" id="plCredNee">Annuleren</button>' +
            (genoeg
              ? '<button class="ai-act pri" id="plCredJa">Analyseer (' + a.credits + ')</button>'
              : '<button class="ai-act pri" id="plCredKoop">Tokens toevoegen</button>') +
          '</div>' +
        '</div>';

      const klaar = (v) => {
        try { _nietMeerVragen = !!(document.getElementById('plCredStil') || {}).checked; } catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
        ov.style.display = 'none';
        _sheetBezig = null;
        window._plCredDismiss = null;
        res(v);
      };

      const jaKnop = ov.querySelector('#plCredJa');
      if (jaKnop) jaKnop.onclick = () => klaar(true);
      const koopKnop = ov.querySelector('#plCredKoop');
      if (koopKnop) koopKnop.onclick = () => { klaar(false); openVerzilver(); };
      ov.querySelector('#plCredNee').onclick = () => klaar(false);
      ov.querySelector('#plCredX').onclick = () => klaar(false);

      window._plCredDismiss = () => klaar(false);
      ov.onclick = (e) => { if (e.target === ov) klaar(false); };
      ov.style.display = 'flex';
    });
    return _sheetBezig;
  }

  // ── Code inwisselen (stub tot stap 5) ────────────────────────────────
  function openVerzilver() {
    const ov = _overlay('plCredKoopSheet');
    ov.innerHTML =
      '<div class="ai-sheet" style="max-width:420px">' +
        '<div class="ai-sheet-h"><b>\u26A1 Tokens toevoegen</b>' +
          '<button class="ai-sheet-x" id="plKoopX">\u2715</button></div>' +
        '<div class="ai-sheet-b">' +
          '<div style="font-size:12px;color:var(--tx2,#cbd5e1);line-height:1.55">' +
            'Huidig saldo: <b>' + (saldoBekend() ? _nl(saldo()) + ' tokens' : 'nog onbekend') + '</b>.<br>' +
            'Heb je een activatiecode? Vul die hieronder in.</div>' +
          '<input id="plKoopCode" maxlength="20" placeholder="PIDL-XXXX-XXXXXX" ' +
            'style="width:100%;box-sizing:border-box;margin-top:12px;padding:11px;border-radius:9px;' +
            'border:1px solid var(--bd,#2a3142);background:var(--sur2,#1a1f2e);color:var(--tx,#e2e8f0);' +
            'font:700 15px/1 var(--f,sans-serif);letter-spacing:1.5px;text-transform:uppercase">' +
          '<div id="plKoopMsg" style="font-size:11.5px;margin-top:9px;min-height:16px"></div>' +
          '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd,#2a3142);' +
            'font-size:11px;color:var(--tx3,#94a3b8);line-height:1.6">' +
            'Nog geen code? Vraag er een aan via ' +
            '<a href="mailto:support@pidlane.nl?subject=Tokens%20voor%20PidLane" ' +
            'style="color:var(--bl,#6366f1)">support@pidlane.nl</a>. ' +
            'Een code is eenmalig te gebruiken en wordt bijgeschreven op je ' +
            'account \u2014 log dus eerst in.</div>' +
        '</div>' +
        '<div class="ai-sheet-f">' +
          '<button class="ai-act" id="plKoopSluit">Sluiten</button>' +
          '<button class="ai-act pri" id="plKoopOk">Activeer</button>' +
        '</div>' +
      '</div>';

    const msg = ov.querySelector('#plKoopMsg');
    const sluit = () => { ov.style.display = 'none'; };
    ov.querySelector('#plKoopX').onclick = sluit;
    ov.querySelector('#plKoopSluit').onclick = sluit;
    ov.onclick = (e) => { if (e.target === ov) sluit(); };

    ov.querySelector('#plKoopOk').onclick = async () => {
      const code = (ov.querySelector('#plKoopCode').value || '').trim().toUpperCase();
      if (!code) { msg.innerHTML = '<span style="color:var(--or,#f59e0b)">Vul eerst een code in.</span>'; return; }
      msg.innerHTML = '<span style="color:var(--tx3,#94a3b8)">Bezig met controleren\u2026</span>';
      const r = await verzilver(code);
      if (r.ok) {
        msg.innerHTML = '<span style="color:var(--gn,#22c55e)">\u2705 ' + _esc(r.bericht) + '</span>';
        ov.querySelector('#plKoopCode').value = '';
        setTimeout(sluit, 1800);
      } else {
        msg.innerHTML = '<span style="color:var(--rd,#ef4444)">' + _esc(r.bericht) + '</span>';
      }
    };
    ov.style.display = 'flex';
  }

  async function verzilver(code) {
    // Stap 5 van het plan: hier komt de Worker-route die de code tegen
    // Airtable checkt en eenmalig als gebruikt markeert. Zolang die er niet
    // is, geen nepbelofte doen maar eerlijk melden.
    if (!CFG.verzilverPad) {
      return { ok: false, bericht: 'Codes zijn nog niet actief in deze versie.' };
    }
    // Vóór het verzoek, niet erna (#49). De Worker stempelt de code af als
    // gebruikt en boekt hem daarna pas bij op het account; is er geen account,
    // dan is de code verbrand en kwamen de tokens hieronder in localStorage
    // terecht — een tegoed dat de server niet kent en dus nooit uitbetaalt.
    if (!_isKlant()) {
      return { ok: false, bericht: 'Log eerst in met je account \u2014 een code wordt daarop bijgeschreven. Zo raakt hij niet verloren.' };
    }
    try {
      const basis = (typeof PROXY_URL !== 'undefined' && PROXY_URL) ? PROXY_URL : '';
      const kop = { 'Content-Type': 'application/json' };
      try { if (window.APP_TOKEN) kop['X-App-Token'] = window.APP_TOKEN; } catch(e){ /* stil: APP_TOKEN kan nog niet gezet zijn */ }
      const resp = await fetch(basis + CFG.verzilverPad, {
        method: 'POST',
        headers: kop,
        body: JSON.stringify({ code: code })
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok || !d.ok) {
        return { ok: false, bericht: d.error || ('Code afgewezen (' + resp.status + ').') };
      }
      // Het nieuwe saldo komt van de server; een eigen optelling bestaat niet
      // meer. Ontbreekt het, dan is de code wél afgestempeld maar niet
      // bijgeboekt — dat moet de gebruiker weten in plaats van een lokaal
      // getal te zien dat de server niet kent.
      if (typeof d.saldo !== 'number') {
        _log('Code ' + code + ' afgestempeld zonder saldo in het antwoord', 'err');
        return { ok: false, bericht: 'De code is geldig, maar het bijboeken op je account is niet bevestigd. Neem contact op met support@pidlane.nl.' };
      }
      zetServerSaldo(d.saldo);
      return { ok: true, bericht: _nl(d.credits) + ' tokens toegevoegd.', credits: d.credits };
    } catch (e) {
      return { ok: false, bericht: 'Geen verbinding \u2014 probeer het later opnieuw.' };
    }
  }

  // ── Hoofdingang: aangeroepen vanuit apiFetch ─────────────────────────
  // Retourneert een boekingsobject, of null als er niets te boeken valt.
  // Gooit PLCreditAfgebroken als de gebruiker annuleert.
  function AfgebrokenFout(msg) {
    const e = new Error(msg || 'Analyse afgebroken \u2014 er zijn geen tokens gebruikt.');
    e.name = 'PLCreditAfgebroken';
    e.plAfgebroken = true;
    return e;
  }

  async function preflight(prompt, sys, maxTokens, mdl) {
    if (_vrijgesteld()) return null;

    let a;
    try {
      a = ontleed(prompt, sys, maxTokens);
    } catch (e) {
      _log('Kostenanalyse mislukt, analyse gaat door zonder afboeking: ' + e.message, 'warn');
      return null;                                   // fail-open
    }

    const s = saldo();

    // Onvoldoende tegoed → altijd tonen, ook bij kleine calls. Maar alleen op
    // een saldo dat we KENNEN: op een toestel dat nog geen serversaldo heeft
    // gezien zou saldo() 0 teruggeven en zou de app hier elke analyse
    // afbreken op een getal dat wij zelf verzonnen hebben (#49).
    if (saldoBekend() && s < a.credits) {
      await _sheet(a);
      throw AfgebrokenFout('Onvoldoende tokens \u2014 ' + a.credits + ' nodig, ' + s + ' beschikbaar.');
    }

    const klein = a.credits < CFG.previewDrempel;
    if (!klein && !_nietMeerVragen) {
      const ok = await _sheet(a);
      if (!ok) throw AfgebrokenFout();
    }

    return { credits: a.credits, tekensIn: a.totTekens, maxTokens: maxTokens, model: mdl, geboekt: false };
  }

  // Afboeken zodra er een geslaagd antwoord binnen is (één keer per apiFetch,
  // niet per vervolgdeel). Kalibreert meteen de schatting bij.
  function boek(res, usage) {
    try {
      if (!res || res.geboekt) return;
      res.geboekt = true;
      _kalibreer(res.tekensIn, usage, res.maxTokens);

      // Wat het écht kostte. De Worker rekent met exact dezelfde formule
      // (tegoedKosten in worker.js), dus dit getal komt overeen met wat er
      // daar van het saldo af gaat. Ontbreekt usage — bijvoorbeeld omdat de
      // respons anders was dan verwacht — dan valt hij terug op de schatting
      // uit het kostenvenster.
      const kosten = _kostenUitUsage(usage) || res.credits;

      if (_isKlant()) {
        // De Worker heeft al afgeboekt. Hier alleen de teller bijwerken, nooit
        // een verzoek sturen: dat zou dubbel tellen. Het definitieve getal komt
        // bij de volgende verversSaldo() of uit de X-PidLane-Saldo-header.
        if (_serverSaldo !== null) zetServerSaldo(Math.max(0, _serverSaldo - kosten));
        else if (saldoBekend()) afboeken(kosten);
      } else if (saldoBekend()) {
        afboeken(kosten);
      }

      // Kennen we het saldo niet, dan is er ook niets afgeboekt om te melden.
      // Zou afboeken() hier tóch draaien, dan schreef hij '0' weg en werd
      // "onbekend" stilzwijgend "nul" — waarna preflight alles blokkeert.
      if (!saldoBekend()) {
        _log('Tegoed afgeboekt op de server: -' + kosten + ' (lokaal saldo nog onbekend)', 'info');
        return;
      }

      const s = saldo();
      if (s <= 5) _toast('\u26A1 Nog ' + s + ' tokens over');
      _log('Tegoed afgeboekt: -' + kosten + ' (saldo ' + s + ')', 'info');
    } catch(e){ console.warn('_log mislukt:', e); }
  }

  // ── vergeetKlant() — het saldo van de vorige gebruiker weg bij uitloggen ──
  // logout() wiste tot 28-08 alleen pl_session en pl_autoconn. Op een gedeeld
  // werkplaatstoestel zag de volgende gebruiker daardoor even het saldo van de
  // vorige staan. Geen geldfout — de eerste verversSaldo() corrigeert het —
  // maar wel het eerste wat iemand ziet.
  //
  // HERZIEN OP 29-08-2026 (#49). Hier stond, met nadruk, dat het wissen van de
  // saldosleutel "de voor de hand liggende fix is en fout": saldo() deelde bij
  // een ontbrekende sleutel CFG.gratisStart uit, dus uitloggen werd dan een
  // knop die 25 tokens gaf. Die redenering klopte binnen zijn eigen aanname,
  // en de aanname was het probleem — niet de conclusie eruit. Nu de client
  // helemaal geen tegoed meer uitdeelt, is wissen juist wél goed:
  //
  //   lsSaldo  → VERWIJDEREN. Na uitloggen weten we het saldo niet meer, en
  //              "onbekend" is precies wat een ontbrekende sleutel nu betekent
  //              (zie saldoBekend()). '0' laten staan was onder de oude regel
  //              het beste dat kon, maar het is een bewering: het beweert dat
  //              de volgende gebruiker niets heeft, en dat weten we niet.
  //   lsKalib  → blijft. Dat is tekens-per-token van het AI-model, een
  //              eigenschap van het model en niet van de klant. Wissen maakt
  //              de eerstvolgende kostenschatting alleen maar slechter.
  //
  // De functie staat hier en niet in logout(), zodat de sleutelnamen op één
  // plek blijven. Een tweede plek die dezelfde namen moet kennen is in dit
  // project al drie keer een bug geweest.
  function vergeetKlant() {
    try {
      _lsDel(CFG.lsSaldo);
    } catch (e) { console.warn('saldosleutel wissen mislukt:', e); }
    // Het werkgeheugen is de andere helft: localStorage opschonen helpt niet
    // als het saldo nog in de module staat. Zonder deze drie regels geeft
    // saldo() gewoon weer het bedrag van de vorige gebruiker terug.
    _memSaldo = null;
    _serverSaldo = null;
    _nietMeerVragen = false;
    try { _chipVerversen(); } catch (e) { console.warn('saldochip verversen mislukt:', e); }
    _log('Saldo van de vorige gebruiker gewist bij uitloggen', 'info');
  }

  // ── Publieke API ─────────────────────────────────────────────────────
  window.PLCredits = {
    vergeetKlant: vergeetKlant,
    saldo: saldo,
    saldoBekend: saldoBekend,
    bijboeken: bijboeken,
    afboeken: afboeken,
    zetSaldo: _setSaldo,
    zetServerSaldo: zetServerSaldo,
    serverModus: function () { return _serverSaldo !== null; },
    isKlant: _isKlant,
    preflight: preflight,
    boek: boek,
    ontleed: ontleed,
    openVerzilver: openVerzilver,
    verzilver: verzilver,
    chip: _chipVerversen,
    stil: function (v) { _nietMeerVragen = !!v; },
    CFG: CFG
  };

  // Chip pas plaatsen als de DOM er is.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _chipVerversen);
  } else {
    _chipVerversen();
  }

  _log('pidlane-credits.js geladen \u2014 saldo ' +
       (saldoBekend() ? saldo() + ' tokens' : 'nog onbekend (komt van de server)'), 'info');
})();
