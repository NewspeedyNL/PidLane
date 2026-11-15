// ══════════════════════════════════════════════════════════════════
// pidlane-batterijmeting.js — PLBatterij: een lopende batterijmeting bij de
// beheerder (#691, besluit 15-11-2026)
// ──────────────────────────────────────────────────────────────────
// WAAROM. #691 heeft de timers, Hyperlane en de CSS zuiniger gemaakt. Of dat
// iets scheelt, zegt alleen de accu van een echte telefoon. Een losse meting
// van een halfuur zegt weinig; daarom meet de app een paar weken mee, alleen
// bij een beheerderslogin, en vraagt hij af en toe wat Android zelf zegt.
//
// WAT HIJ MEET. navigator.getBattery(): bij elke procent minder en bij elke
// wissel tussen voorgrond en achtergrond een monster. Elke tussenpoos zonder
// laden telt bij de toestand van het begin ervan: `hyperlane` (in beeld),
// `voorgrond` (de rest in beeld), `achtergrond-verbonden`, `achtergrond`.
// Dat wordt %/uur per toestand (segmenten(), puur). Elk kwartier dat er iets
// bij kwam, gaat de stand als logregel "batterij" naar D1.
//
// WAT HIJ VRAAGT. Android zegt per app hoeveel accu hij gebruikte; dat kan een
// webview niet lezen. Bij het sluiten van de app kan er geen venster meer
// komen, dus onthoudt hij dat er een sessie van 20 min of meer was, en vraagt
// hij het bij de volgende keer openen: het percentage van PidLane, en als je
// wilt een schermafdruk. Hoogstens één keer per 20 uur. Dat gaat naar
// POST /admin/batterij (worker.js), met de eigen meting erbij.
//
// TOT 13-12-2026 (vier weken). Daarna doet hij niets meer; haal hem dan weg.
// Klanten: nooit. Getoetst in test-batterijmeting.js en bproef-batterij.js.
// ══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  var CFG = {
    tot: Date.parse('2026-12-13T23:59:59Z'),
    vraagNaMs: 20 * 60 * 1000,     // een sessie van minstens 20 min in beeld
    vraagMinMs: 20 * 3600 * 1000,  // hoogstens één keer per 20 uur vragen
    logElkeMs: 15 * 60 * 1000,
    maxMonsters: 2000,
    fotoMax: 400 * 1024
  };
  var SL = { vraag: 'pl_bat_vraag', gevraagd: 'pl_bat_gevraagd', nooit: 'pl_bat_nooit' };
  var TOESTANDEN = ['hyperlane', 'voorgrond', 'achtergrond-verbonden', 'achtergrond'];

  /* Puur: monsters [{t, lvl (0..1), laden, toestand}] → per toestand
     { ms, pct (gedaald), pctUur }. Een tussenpoos met laden, of waarin het
     niveau steeg, telt niet. */
  function segmenten(m) {
    var uit = {};
    TOESTANDEN.forEach(function (k) { uit[k] = { ms: 0, pct: 0, pctUur: null }; });
    for (var i = 1; i < (m || []).length; i++) {
      var a = m[i - 1], b = m[i];
      if (!a || !b || a.laden || b.laden || !uit[a.toestand]) continue;
      var dt = b.t - a.t, d = (a.lvl - b.lvl) * 100;
      if (!(dt > 0) || d < 0) continue;
      uit[a.toestand].ms += dt; uit[a.toestand].pct += d;
    }
    TOESTANDEN.forEach(function (k) {
      var x = uit[k]; x.pct = Math.round(x.pct * 10) / 10;
      x.pctUur = x.ms >= 10 * 60 * 1000 ? Math.round(x.pct / (x.ms / 3600000) * 10) / 10 : null;
    });
    return uit;
  }

  /* Puur: moet de vraag nu komen? */
  function moetVragen(o) {
    o = o || {};
    if (!o.beheerder || o.nooit || !(o.nu <= CFG.tot) || !o.vraag) return false;
    if (o.gevraagd && o.nu - o.gevraagd < CFG.vraagMinMs) return false;
    return true;
  }

  // ── runtime ──────────────────────────────────────────────────────
  var _m = [], _batt = null, _zichtbaarSinds = 0, _laatstLog = 0, _actief = false, _logN = 0;
  function nu() { return Date.now(); }
  function lees(k) { try { return localStorage.getItem(k); } catch (e) { console.warn('PLBatterij: opslag onleesbaar', e); return null; } }
  function zet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); } catch (e) { console.warn('PLBatterij: opslag niet bijgewerkt', e); } }
  function beheerder() { try { return typeof isAdmin === 'function' && !!isAdmin(); } catch (e) { console.warn('PLBatterij: isAdmin onleesbaar', e); return false; } }
  function zichtbaar() { try { return document.visibilityState !== 'hidden'; } catch (e) { console.warn('PLBatterij: zichtbaarheid onleesbaar', e); return true; } }
  function verbonden() { try { return typeof connected !== 'undefined' && !!connected; } catch (e) { console.warn('PLBatterij: verbinding onleesbaar', e); return false; } }
  function hyperlane() {
    try { var w = document.querySelector('.vpf-hyper, .vhl-schil'); return !!(w && w.getClientRects().length); }
    catch (e) { console.warn('PLBatterij: Hyperlane niet te zien', e); return false; }
  }
  function toestand() {
    if (zichtbaar()) return hyperlane() ? 'hyperlane' : 'voorgrond';
    return verbonden() ? 'achtergrond-verbonden' : 'achtergrond';
  }
  function monster(waarom) {
    if (!_batt) return;
    _m.push({ t: nu(), lvl: Number(_batt.level), laden: !!_batt.charging, toestand: toestand(), w: waarom });
    if (_m.length > CFG.maxMonsters) _m.splice(0, _m.length - CFG.maxMonsters);
    if (nu() - _laatstLog >= CFG.logElkeMs) logNu();
  }
  function samenvatting() {
    var s = segmenten(_m), r = {};
    TOESTANDEN.forEach(function (k) { if (s[k].ms) r[k] = { min: Math.round(s[k].ms / 60000), pct: s[k].pct, pctUur: s[k].pctUur }; });
    return r;
  }
  function logNu() {
    _laatstLog = nu();
    var r = samenvatting(); if (!Object.keys(r).length) return;
    try {
      if (typeof logToSheets === 'function') {
        logToSheets('batterij', 'batterij %/uur per toestand', { stand: r, monsters: _m.length, Device: (navigator && navigator.userAgent || '').slice(0, 80) });
        _logN++;
      }
    } catch (e) { console.warn('PLBatterij: niet gelogd', e); }
  }
  function zicht() {
    monster(zichtbaar() ? 'zichtbaar' : 'verborgen');
    if (zichtbaar()) { _zichtbaarSinds = nu(); vraagMisschien(); }
    else {
      if (_zichtbaarSinds && nu() - _zichtbaarSinds >= CFG.vraagNaMs) zet(SL.vraag, nu());
      logNu();
    }
  }
  function start() {
    if (_actief || !beheerder() || nu() > CFG.tot) return false;
    if (typeof navigator === 'undefined' || typeof navigator.getBattery !== 'function') { console.warn('PLBatterij: geen Battery API — er wordt niets gemeten'); return false; }
    _actief = true; _zichtbaarSinds = zichtbaar() ? nu() : 0;
    navigator.getBattery().then(function (b) {
      _batt = b; monster('start');
      b.addEventListener('levelchange', function () { monster('niveau'); });
      b.addEventListener('chargingchange', function () { monster('laden'); });
    }).catch(function (e) { console.warn('PLBatterij: getBattery geweigerd', e); _actief = false; });
    try { document.addEventListener('visibilitychange', zicht); } catch (e) { console.warn('PLBatterij: geen visibilitychange', e); }
    vraagMisschien();
    return true;
  }

  // ── het venster ──────────────────────────────────────────────────
  function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function vraagMisschien() {
    var o = { beheerder: beheerder(), nooit: lees(SL.nooit) === '1', nu: nu(), vraag: Number(lees(SL.vraag)) || 0, gevraagd: Number(lees(SL.gevraagd)) || 0 };
    if (!moetVragen(o)) return false;
    open();
    return true;
  }
  var _foto = null;
  function open() {
    zet(SL.gevraagd, nu()); zet(SL.vraag, null); _foto = null;
    var ov = document.getElementById('plBatOv');
    if (!ov) { ov = document.createElement('div'); ov.id = 'plBatOv'; document.body.appendChild(ov); }
    ov.setAttribute('style', 'position:fixed;inset:0;z-index:var(--z-modal,9600);background:rgba(8,11,17,.92);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto');
    var st = samenvatting(), regels = Object.keys(st).map(function (k) { return k + ': ' + (st[k].pctUur === null ? st[k].min + ' min (te kort)' : st[k].pctUur + ' %/uur over ' + st[k].min + ' min'); });
    ov.innerHTML = '<div style="background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:520px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f);color:var(--tx)">' +
      '<div style="font:800 16px var(--f)">🔋 Batterijmeting (#691)</div>' +
      '<p style="font-size:13px;color:var(--tx2);line-height:1.45">Hoeveel accu gebruikte PidLane volgens Android? Instellingen → Batterij → Batterijgebruik → PidLane. Alleen voor beheerders, tot 13 december.</p>' +
      '<label style="display:block;margin:8px 0;font-size:13px">Percentage van PidLane <input id="plBatPct" type="number" inputmode="decimal" min="0" max="100" step="0.1" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx)"></label>' +
      '<label style="display:block;margin:8px 0;font-size:13px">Over hoeveel uur (sinds volledig opgeladen, als Android het zegt) <input id="plBatUren" type="number" inputmode="decimal" min="0" max="168" step="0.5" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx)"></label>' +
      '<label style="display:block;margin:8px 0;font-size:13px">Opmerking <input id="plBatNoot" type="text" maxlength="500" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx)"></label>' +
      '<label style="display:inline-block;margin:8px 0;padding:10px 14px;border-radius:10px;border:1px solid var(--bd);font-weight:700;cursor:pointer">📷 Schermafdruk toevoegen<input id="plBatFoto" type="file" accept="image/*" hidden onchange="PLBatterij._kies(this)"></label> <span id="plBatFotoTx" style="font-size:12px;color:var(--tx3)"></span>' +
      '<p style="font-size:12px;color:var(--tx3);margin:8px 0">Eigen meting: ' + (regels.length ? esc(regels.join(' · ')) : 'nog te weinig') + '</p>' +
      '<p id="plBatFout" style="font-size:13px;color:var(--rd,#ff5470);margin:6px 0"></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' +
      '<button type="button" id="plBatStuur" onclick="PLBatterij._stuur()" style="padding:10px 14px;border-radius:10px;font-weight:800;min-height:44px">Versturen</button>' +
      '<button type="button" onclick="PLBatterij.sluit()" style="padding:10px 14px;border-radius:10px;min-height:44px">Later</button>' +
      '<button type="button" onclick="PLBatterij._nooit()" style="padding:10px 14px;border-radius:10px;min-height:44px">Niet meer vragen</button></div></div>';
  }
  function sluit() { var ov = document.getElementById('plBatOv'); if (ov) ov.remove(); }
  /* Verklein tot hoogstens 1280 px en JPEG, tot hij onder 400 KB past. */
  function verklein(bestand) {
    return new Promise(function (ja, nee) {
      var r = new FileReader();
      r.onerror = function () { nee(new Error('bestand onleesbaar')); };
      r.onload = function () {
        var img = new Image();
        img.onerror = function () { nee(new Error('geen afbeelding')); };
        img.onload = function () {
          var schaal = Math.min(1, 1280 / Math.max(img.width, img.height)), q = 0.7, uit = '';
          for (var poging = 0; poging < 6; poging++) {
            var c = document.createElement('canvas');
            c.width = Math.round(img.width * schaal); c.height = Math.round(img.height * schaal);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            uit = c.toDataURL('image/jpeg', q);
            if (uit.length <= CFG.fotoMax) return ja(uit);
            schaal *= 0.75; q = Math.max(0.4, q - 0.1);
          }
          nee(new Error('te groot, ook verkleind'));
        };
        img.src = r.result;
      };
      r.readAsDataURL(bestand);
    });
  }
  function _kies(inp) {
    var f = inp && inp.files && inp.files[0], tx = document.getElementById('plBatFotoTx');
    if (!f) return;
    if (tx) tx.textContent = 'verkleinen…';
    verklein(f).then(function (d) { _foto = d; if (tx) tx.textContent = '✓ ' + Math.round(d.length / 1024) + ' KB'; })
      .catch(function (e) { _foto = null; if (tx) tx.textContent = '✗ ' + e.message; console.warn('PLBatterij: schermafdruk', e); });
  }
  async function _stuur() {
    var fout = document.getElementById('plBatFout'), knop = document.getElementById('plBatStuur');
    var pct = parseFloat(String((document.getElementById('plBatPct') || {}).value || '').replace(',', '.'));
    var uren = String((document.getElementById('plBatUren') || {}).value || '').replace(',', '.');
    if (!(pct >= 0 && pct <= 100)) { if (fout) fout.textContent = 'Vul het percentage van PidLane in (0–100).'; return false; }
    if (knop) knop.disabled = true;
    try {
      if (typeof plFetch !== 'function') throw new Error('plFetch ontbreekt');
      var r = await plFetch('/admin/batterij', { method: 'POST', json: { pct: pct, uren: uren === '' ? null : parseFloat(uren), notitie: (document.getElementById('plBatNoot') || {}).value || '', foto: _foto, meting: samenvatting() } });
      var d = {}; try { d = await r.json(); } catch (e) { throw new Error('onleesbaar antwoord (' + r.status + ')'); }
      if (!r.ok || !d.ok) throw new Error(d.error || ('serverfout ' + r.status));
      sluit();
      try { if (typeof showToast === 'function') showToast('Batterijmeting bewaard — dank'); } catch (e) { console.warn(e); }
      return true;
    } catch (e) {
      console.warn('PLBatterij: niet verstuurd', e);
      if (fout) fout.textContent = 'Niet verstuurd: ' + e.message;
      if (knop) knop.disabled = false;
      return false;
    }
  }
  function _nooit() { zet(SL.nooit, '1'); sluit(); }

  window.PLBatterij = {
    segmenten: segmenten, moetVragen: moetVragen, samenvatting: samenvatting, start: start, open: open, sluit: sluit,
    monsters: function () { return _m.slice(); }, actief: function () { return _actief; }, logN: function () { return _logN; },
    CFG: CFG, SL: SL, _kies: _kies, _stuur: _stuur, _nooit: _nooit, _monster: monster, _zicht: zicht
  };
  // Na de login: de rol is pas dan bekend. Tien minuten kijken, daarna niet meer.
  // Schermtimer via PLRust (#691): uit beeld slaapt hij mee.
  var n = 0, kijk = null;
  function tik() {
    n++;
    if ((start() || _actief || n > 200 || nu() > CFG.tot) && kijk !== null && window.PLRust) { PLRust.weg(kijk); kijk = null; }
  }
  kijk = window.PLRust ? PLRust.elke(3000, tik, 'batterij') : null;
  if (!window.PLRust) console.warn('PLBatterij: PLRust ontbreekt — de meting start niet vanzelf');
})();
