/* ═══════════════════════════════════════════════════════════════════════
   pidlane-klant.js — klantaccounts: registreren, inloggen, herstel, tokens
   ───────────────────────────────────────────────────────────────────────
   DOEL
     De app zit volledig achter een login. Deze module maakt daar een tweede
     deur naast: bezoekers kunnen zichzelf gratis registreren, krijgen
     proeftegoed, en kopen alleen tokens als ze verder willen. Kopen is
     nooit verplicht.

   TWEE SOORTEN ACCOUNTS, BEWUST GESCHEIDEN
     - Tabel Users   → jouw eigen B2B-logins (gebruikersnaam). Abonnement,
                       dus GEEN tokenverbruik.
     - Tabel Klanten → zelf-geregistreerde consumenten (e-mailadres).
                       Tokentegoed, verbruik per analyse.
     Het inlogveld herkent het verschil aan de @ in het e-mailadres.

   SALDO STAAT OP DE SERVER
     Zodra iemand als klant is ingelogd, is het saldo in Airtable de waarheid
     en is localStorage alleen nog een cache. Anders verliest een klant zijn
     tokens bij het wissen van browsergegevens of op een tweede apparaat.

   RAAKT DE BESTAANDE LOGIN NIET
     Alles hier is additief. Een gebruikersnaam zonder @ loopt exact dezelfde
     route als voorheen. Zie de haak in pidlane-auth.js → doLogin().

   CHANGELOG
     2026-07-30  v1.0  Registratie, klantlogin, wachtwoordherstel via mail,
                       herstellink-afhandeling, scherm "Mijn tokens".
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const CFG = {
    // Wat één token kost bij verkoop. Alleen voor de tekst in het scherm —
    // de echte prijs staat op de code in Airtable.
    euroPerToken: 0.05,
    supportMail: 'support@pidlane.nl'
  };

  const _esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const _nl = (n) => Number(n || 0).toLocaleString('nl-NL');
  const _log = (m, t) => { try { (window.log || function () {})(m, t || 'info'); } catch (e) {} };

  function _base() {
    try {
      if (typeof PROXY_URL !== 'undefined' && PROXY_URL) return String(PROXY_URL).replace(/\/$/, '');
    } catch (e) {}
    return '';
  }
  function _tok() { try { return window.APP_TOKEN || ''; } catch (e) { return ''; } }

  // Is de ingelogde gebruiker een klant (en dus tokenplichtig)?
  function isKlant() {
    try {
      const u = window.currentUser;
      return !!(u && String(u.role || '').toLowerCase() === 'klant');
    } catch (e) { return false; }
  }

  // ── Serveraanroepen ──────────────────────────────────────────────────
  async function _post(pad, body, metToken) {
    const b = _base();
    if (!b) throw new Error('PROXY_URL ontbreekt');
    const h = { 'Content-Type': 'application/json' };
    if (metToken && _tok()) h['X-App-Token'] = _tok();
    const r = await fetch(b + pad, { method: 'POST', headers: h, body: JSON.stringify(body || {}) });
    let d = {}; try { d = await r.json(); } catch (e) {}
    return { status: r.status, ok: r.ok && d && d.ok !== false, data: d || {} };
  }

  async function klantLogin(email, pass) {
    const r = await _post('/klant/login', { email, pass });
    if (r.status === 401) return null;                 // verkeerde gegevens
    if (r.status === 403) throw new Error(r.data.error || 'Account geblokkeerd.');
    if (!r.ok) {
      const e = new Error(r.data.error || ('loginserver gaf ' + r.status));
      e.status = r.status;
      throw e;
    }
    return r.data;
  }

  async function klantRegistreer(email, pass, naam) {
    return await _post('/klant/registreer', { email, pass, naam });
  }

  async function klantMij() {
    const b = _base();
    if (!b || !_tok()) return null;
    try {
      const r = await fetch(b + '/klant/mij', { headers: { 'X-App-Token': _tok() } });
      const d = await r.json();
      return (r.ok && d && d.ok) ? d.klant : null;
    } catch (e) { return null; }
  }

  // ── Overlay-hulp — gebruikt de bestaande .ov/.modal-stijl ─────────────
  function _ov(id) {
    let o = document.getElementById(id);
    if (!o) {
      o = document.createElement('div');
      o.id = id;
      o.className = 'ov hidden';
      o.style.zIndex = '9960';
      document.body.appendChild(o);
    }
    return o;
  }
  function _sluit(id) { const o = document.getElementById(id); if (o) o.classList.add('hidden'); }

  function _veld(id, type, ph, autoc) {
    return '<div class="lg-field" style="margin-bottom:10px">' +
      '<input class="api-inp" id="' + id + '" type="' + type + '" placeholder="' + _esc(ph) + '" ' +
      'autocomplete="' + (autoc || 'off') + '"></div>';
  }

  function _kop(titel, sub) {
    return '<div class="mh"><div class="mttl">' + _esc(titel) + '</div>' +
      '<div class="msub">' + _esc(sub) + '</div></div>';
  }

  // ── Registratie ──────────────────────────────────────────────────────
  function openRegistratie() {
    const gratis = Math.round(1 / CFG.euroPerToken);
    const o = _ov('klantRegOv');
    o.innerHTML =
      '<div class="modal"><div class="modal-scroll">' +
        _kop('Gratis account', 'Proeftegoed, geen abonnement, geen betaalgegevens') +
        '<div class="lg-form">' +
          '<div style="font-size:12px;color:var(--tx2);line-height:1.6;margin-bottom:14px">' +
            'Je krijgt <b style="color:var(--tx)">' + gratis + ' tokens</b> om de AI-analyses uit te ' +
            'proberen — genoeg voor een paar volledige rapporten. Daarna kun je bijkopen ' +
            'als je wilt. Je hoeft niets.' +
          '</div>' +
          _veld('regEmail', 'email', 'E-mailadres', 'email') +
          _veld('regNaam', 'text', 'Naam of bedrijf (optioneel)', 'name') +
          _veld('regPass', 'password', 'Wachtwoord (min. 10 tekens)', 'new-password') +
          _veld('regPass2', 'password', 'Wachtwoord herhalen', 'new-password') +
          '<div style="font-size:11px;color:var(--tx3,#7c8aa5);line-height:1.5;margin-bottom:4px">' +
            'Tip: een korte zin van een paar woorden is veiliger dan een kort ' +
            'wachtwoord met tekens, en makkelijker te onthouden.' +
          '</div>' +
          '<div id="regErr" style="font-size:12px;min-height:18px;text-align:center;margin-top:6px"></div>' +
        '</div>' +
      '</div>' +
      '<div class="mact">' +
        '<button class="mbtn" id="regTerug">Terug</button>' +
        '<button class="mbtn p" id="regGo">Account aanmaken</button>' +
      '</div></div>';

    o.querySelector('#regTerug').onclick = () => _sluit('klantRegOv');
    o.querySelector('#regGo').onclick = _doeRegistratie;
    o.querySelector('#regPass2').onkeydown = (e) => { if (e.key === 'Enter') _doeRegistratie(); };
    o.classList.remove('hidden');
    setTimeout(() => { try { o.querySelector('#regEmail').focus(); } catch (e) {} }, 80);
  }

  function _zetMelding(el, soort, tekst) {
    const kleur = soort === 'ok' ? 'var(--gn,#22c55e)' : soort === 'warn' ? 'var(--or,#f59e0b)' : 'var(--rd,#ef4444)';
    el.style.color = kleur;
    el.textContent = tekst;
  }

  async function _doeRegistratie() {
    const o = document.getElementById('klantRegOv');
    const err = o.querySelector('#regErr');
    const email = (o.querySelector('#regEmail').value || '').trim().toLowerCase();
    const naam = (o.querySelector('#regNaam').value || '').trim();
    const p1 = o.querySelector('#regPass').value;
    const p2 = o.querySelector('#regPass2').value;

    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return _zetMelding(err, 'warn', 'Vul een geldig e-mailadres in.');
    if (p1.length < 10) return _zetMelding(err, 'warn', 'Wachtwoord moet minstens 10 tekens zijn.');
    if (p1 !== p2) return _zetMelding(err, 'warn', 'De twee wachtwoorden zijn niet gelijk.');

    _zetMelding(err, 'ok', 'Account aanmaken\u2026');
    o.querySelector('#regGo').disabled = true;
    try {
      const r = await klantRegistreer(email, p1, naam);
      if (!r.ok) {
        o.querySelector('#regGo').disabled = false;
        return _zetMelding(err, 'err', r.data.error || 'Aanmaken mislukt.');
      }
      // Meteen inloggen met de sessie die de server teruggaf.
      _zetMelding(err, 'ok', 'Gelukt \u2014 je wordt ingelogd\u2026');
      _sluit('klantRegOv');
      _neemSessie(r.data, email);
    } catch (e) {
      o.querySelector('#regGo').disabled = false;
      _zetMelding(err, 'err', 'Geen verbinding met de server.');
    }
  }

  // Sessie overnemen en de bestaande app-loginroutine afmaken.
  function _neemSessie(d, email) {
    try {
      if (typeof tokSave === 'function') tokSave(d);
      else { window.APP_TOKEN = d.token; }
    } catch (e) { window.APP_TOKEN = d.token; }

    const k = d.klant || {};
    try {
      if (window.PLCredits && PLCredits.zetServerSaldo) PLCredits.zetServerSaldo(k.saldo);
    } catch (e) {}

    try {
      if (typeof finishLogin === 'function') {
        finishLogin(k.email || email, { role: 'klant', label: k.naam || k.email || email, apiKey: '' });
      }
    } catch (e) { _log('finishLogin faalde: ' + e.message, 'warn'); }
    _log('Klantlogin ok \u2014 ' + (k.email || email) + ', ' + (k.saldo || 0) + ' tokens', 'ok');
  }

  // ── Wachtwoord vergeten ──────────────────────────────────────────────
  function openHerstelAanvraag() {
    const o = _ov('klantHerstelOv');
    o.innerHTML =
      '<div class="modal"><div class="modal-scroll">' +
        _kop('Wachtwoord vergeten', 'We mailen je een link om een nieuw wachtwoord te kiezen') +
        '<div class="lg-form">' +
          _veld('hstEmail', 'email', 'E-mailadres van je account', 'email') +
          '<div id="hstErr" style="font-size:12px;min-height:18px;text-align:center;margin-top:6px"></div>' +
        '</div>' +
      '</div>' +
      '<div class="mact">' +
        '<button class="mbtn" id="hstTerug">Terug</button>' +
        '<button class="mbtn p" id="hstGo">Stuur link</button>' +
      '</div></div>';

    o.querySelector('#hstTerug').onclick = () => _sluit('klantHerstelOv');
    o.querySelector('#hstGo').onclick = async () => {
      const err = o.querySelector('#hstErr');
      const email = (o.querySelector('#hstEmail').value || '').trim().toLowerCase();
      if (!email) return _zetMelding(err, 'warn', 'Vul je e-mailadres in.');
      _zetMelding(err, 'ok', 'Versturen\u2026');
      try {
        const r = await _post('/klant/reset-aanvraag', { email });
        if (r.data && r.data.error === 'mail_not_configured') {
          return _zetMelding(err, 'warn', 'Herstelmail is nog niet ingeschakeld. Mail ' + CFG.supportMail + '.');
        }
        if (!r.ok) return _zetMelding(err, 'err', r.data.error || 'Versturen mislukt.');
        _zetMelding(err, 'ok', r.data.bericht || 'Check je mail.');
      } catch (e) {
        _zetMelding(err, 'err', 'Geen verbinding met de server.');
      }
    };
    o.classList.remove('hidden');
  }

  // Komt de gebruiker binnen via de link uit de mail (?herstel=...)?
  // Dan meteen het formulier voor een nieuw wachtwoord tonen, vóór de login.
  function checkHerstelLink() {
    let token = '';
    try { token = new URLSearchParams(location.search).get('herstel') || ''; } catch (e) {}
    if (!/^[0-9a-f]{64}$/.test(token)) return;

    const o = _ov('klantNieuwPwOv');
    o.innerHTML =
      '<div class="modal"><div class="modal-scroll">' +
        _kop('Nieuw wachtwoord', 'Kies een nieuw wachtwoord voor je account') +
        '<div class="lg-form">' +
          _veld('npPass', 'password', 'Nieuw wachtwoord (min. 10 tekens)', 'new-password') +
          _veld('npPass2', 'password', 'Herhaal het wachtwoord', 'new-password') +
          '<div id="npErr" style="font-size:12px;min-height:18px;text-align:center;margin-top:6px"></div>' +
        '</div>' +
      '</div>' +
      '<div class="mact"><button class="mbtn p" id="npGo" style="width:100%">Opslaan</button></div></div>';

    o.querySelector('#npGo').onclick = async () => {
      const err = o.querySelector('#npErr');
      const p1 = o.querySelector('#npPass').value;
      const p2 = o.querySelector('#npPass2').value;
      if (p1.length < 10) return _zetMelding(err, 'warn', 'Minstens 10 tekens.');
      if (p1 !== p2) return _zetMelding(err, 'warn', 'De twee wachtwoorden zijn niet gelijk.');
      _zetMelding(err, 'ok', 'Opslaan\u2026');
      try {
        const r = await _post('/klant/reset-uitvoeren', { token, pass: p1 });
        if (!r.ok) return _zetMelding(err, 'err', r.data.error || 'Opslaan mislukt.');
        _zetMelding(err, 'ok', 'Gelukt. Je kunt nu inloggen.');
        setTimeout(() => {
          _sluit('klantNieuwPwOv');
          try { history.replaceState(null, '', location.pathname); } catch (e) {}
        }, 1600);
      } catch (e) {
        _zetMelding(err, 'err', 'Geen verbinding met de server.');
      }
    };
    o.classList.remove('hidden');
  }

  // ── Scherm "Mijn tokens" ─────────────────────────────────────────────
  async function openMijnTokens() {
    const o = _ov('klantTokenOv');
    o.innerHTML =
      '<div class="modal"><div class="modal-scroll">' +
        _kop('Mijn tokens', 'Tegoed voor AI-analyses') +
        '<div class="lg-form" id="mtBody">' +
          '<div style="font-size:12px;color:var(--tx2)">Saldo ophalen\u2026</div>' +
        '</div>' +
      '</div>' +
      '<div class="mact"><button class="mbtn" id="mtSluit" style="width:100%">Sluiten</button></div></div>';
    o.querySelector('#mtSluit').onclick = () => _sluit('klantTokenOv');
    o.classList.remove('hidden');

    const body = o.querySelector('#mtBody');

    if (!isKlant()) {
      body.innerHTML =
        '<div style="font-size:12.5px;color:var(--tx2);line-height:1.65">' +
          'Je bent ingelogd met een zakelijk account. Daarvoor gelden geen tokens \u2014 ' +
          'analyses zitten in je abonnement.' +
        '</div>';
      return;
    }

    const k = await klantMij();
    const saldo = k ? k.saldo : (window.PLCredits ? PLCredits.saldo() : 0);
    if (k && window.PLCredits && PLCredits.zetServerSaldo) PLCredits.zetServerSaldo(k.saldo);

    const euro = (saldo * CFG.euroPerToken);
    body.innerHTML =
      '<div style="text-align:center;padding:14px 0 4px">' +
        '<div style="font-size:40px;line-height:1">\u26A1</div>' +
        '<div style="font-size:34px;font-weight:800;line-height:1.1;color:var(--bl,#6366f1)">' + _nl(saldo) + '</div>' +
        '<div style="font-size:11.5px;color:var(--tx3,#7c8aa5);margin-top:3px">tokens beschikbaar' +
          (saldo > 0 ? ' \u00b7 ongeveer \u20ac' + euro.toFixed(2).replace('.', ',') + ' waarde' : '') + '</div>' +
      '</div>' +

      (k ? '<div style="font-size:11.5px;color:var(--tx3,#7c8aa5);text-align:center;margin-bottom:14px">' +
        _esc(k.email) + (k.totaal ? ' \u00b7 ooit bijgekocht: ' + _nl(k.totaal) : '') + '</div>' : '') +

      (saldo <= 5
        ? '<div style="background:var(--ors,rgba(245,158,11,.12));border-left:3px solid var(--or,#f59e0b);' +
          'padding:10px 12px;border-radius:8px;font-size:11.5px;color:var(--tx2);line-height:1.55;margin-bottom:14px">' +
          (saldo <= 0 ? 'Je tegoed is op. ' : 'Je tegoed is bijna op. ') +
          'Vul een activatiecode in om verder te kunnen.</div>'
        : '') +

      '<button class="mbtn p" id="mtCode" style="width:100%;margin-bottom:9px">Activatiecode invullen</button>' +
      '<a class="mbtn" id="mtKoop" style="width:100%;display:block;text-align:center;text-decoration:none;box-sizing:border-box" ' +
        'href="mailto:' + CFG.supportMail + '?subject=Tokens%20voor%20PidLane">Tokens aanvragen</a>' +

      '<div style="font-size:11px;color:var(--tx3,#7c8aa5);line-height:1.6;margin-top:14px;' +
        'padding-top:12px;border-top:1px solid var(--bd,#26304a)">' +
        'Een analyse kost meestal 5 tot 10 tokens, afhankelijk van hoeveel meetdata je ' +
        'meestuurt. Vóór elke analyse zie je precies wat het kost en waarom.' +
      '</div>';

    const cb = body.querySelector('#mtCode');
    if (cb) cb.onclick = () => {
      _sluit('klantTokenOv');
      try { if (window.PLCredits) PLCredits.openVerzilver(); } catch (e) {}
    };
  }

  // ── Saldo verversen na het inwisselen van een code ───────────────────
  async function verversSaldo() {
    if (!isKlant()) return null;
    const k = await klantMij();
    if (k && window.PLCredits && PLCredits.zetServerSaldo) PLCredits.zetServerSaldo(k.saldo);
    return k;
  }

  // ── Publieke API ─────────────────────────────────────────────────────
  window.PLKlant = {
    isKlant: isKlant,
    login: klantLogin,
    registreer: klantRegistreer,
    mij: klantMij,
    neemSessie: _neemSessie,
    openRegistratie: openRegistratie,
    openHerstelAanvraag: openHerstelAanvraag,
    openMijnTokens: openMijnTokens,
    checkHerstelLink: checkHerstelLink,
    verversSaldo: verversSaldo,
    CFG: CFG
  };

  // Herstellink uit de mail direct oppakken.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkHerstelLink);
  } else {
    checkHerstelLink();
  }

  _log('pidlane-klant.js geladen', 'info');
})();
