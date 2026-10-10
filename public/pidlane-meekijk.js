/* ═══════════════════════════════════════════════════════════════════
   pidlane-meekijk.js — PLMeekijk: beheer kijkt mee met een code van de klant
   ───────────────────────────────────────────────────────────────────
   WAT DIT IS (10-10-2026)
   Een klant maakt in Mijn voertuigen een meekijkcode (zes tekens, zeven
   dagen, intrekbaar). Met die code ziet een beheerder hier de voertuigen van
   die klant, met de open punten en de eigen sensoren, en kan hij eigen
   sensoren (PIDs) toevoegen — zo voorzie je een klant van meer PIDs of kijk je
   mee bij een probleem.

   WAT HET NIET KAN, MET OPZET
   Niets wijzigen en niets verwijderen: een sensor die er al staat weigert de
   server (409). Zonder geldige code is er niets te zien: de toegang hangt aan
   wat de klant zelf aanzette, niet aan de rol beheerder alleen. De klant ziet
   in Mijn voertuigen hoe vaak er gekeken is en hoeveel sensoren erbij kwamen.

   Server: POST /admin/meekijk (handleAdminMeekijk in worker.js), alleen met
   een sessie met rol admin. Test: test-meekijk.js (server), bproef-meekijk.js
   (dit scherm). Laadvolgorde: na pidlane-plfetch.js.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var _st = { code: '', data: null, fout: '', bezig: false, form: null };

  var esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function melding(t) { try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('PLMeekijk: melding', e); } }

  async function api(actie, data) {
    if (typeof plFetch !== 'function') throw new Error('plFetch ontbreekt');
    var r = await plFetch('/admin/meekijk', { method: 'POST', json: Object.assign({ actie: actie, code: _st.code }, data || {}) });
    var d = {};
    try { d = await r.json(); } catch (e) { throw new Error('Onleesbaar antwoord van de server (' + r.status + ')'); }
    if (!r.ok || !d.ok) throw new Error(d.error || ('Serverfout ' + r.status));
    return d;
  }

  var CSS =
    '#plMkOv{position:fixed;inset:0;z-index:var(--z-modal,9600);background:rgba(8,11,17,.92);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px calc(16px + var(--pl-sab,0px));overflow-y:auto}' +
    '#plMkOv .mk-doos{background:var(--sur2);border:1px solid var(--bd);border-radius:14px;padding:14px;max-width:620px;width:100%;margin-top:calc(8px + var(--pl-sat,0px));font-family:var(--f);color:var(--tx)}' +
    '#plMkOv .mk-kop{display:flex;align-items:center;gap:9px}#plMkOv .mk-t{font:800 16px var(--f);flex:1}' +
    '#plMkOv .mk-x{width:40px;height:40px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font-size:18px}' +
    '#plMkOv .mk-sub,#plMkOv .mk-klein{font-size:13px;color:var(--tx2);line-height:1.45;margin:6px 0}' +
    '#plMkOv .mk-rij{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}' +
    '#plMkOv input{flex:1;min-width:0;padding:11px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:600 15px var(--f)}' +
    '#plMkOv input.mk-code{font:800 20px ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}' +
    '#plMkOv .mk-k{padding:10px 14px;border-radius:10px;border:1px solid var(--bd);background:var(--sur);color:var(--tx);font:700 14px var(--f);min-height:44px}' +
    '#plMkOv .mk-k.hoofd{background:var(--bl);border-color:var(--bl);color:#fff}' +
    '#plMkOv .mk-v{border:1px solid var(--bd);border-radius:12px;padding:11px 12px;margin:10px 0;background:var(--sur)}' +
    '#plMkOv .mk-naam{font:800 15px var(--f)}#plMkOv .mk-bh{font:800 12px var(--f);letter-spacing:.05em;text-transform:uppercase;color:var(--tx2);margin:10px 0 4px}' +
    '#plMkOv ul{margin:0;padding-left:18px;font-size:13px;line-height:1.5}' +
    '#plMkOv .mk-melding{border:1px solid rgba(239,68,68,.45);background:rgba(239,68,68,.1);border-radius:10px;padding:9px 11px;font-size:13px;margin:8px 0}';

  function open() {
    if (!(typeof isAdmin === 'function' && isAdmin())) { melding('Meekijken is er voor beheerders'); return; }
    if (!document.getElementById('plMkCss')) { var s = document.createElement('style'); s.id = 'plMkCss'; s.textContent = CSS; document.head.appendChild(s); }
    var ov = document.getElementById('plMkOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plMkOv';
      ov.innerHTML = '<div class="mk-doos"><div class="mk-kop"><div class="mk-t">🔑 Voertuigen van een klant</div>' +
        '<button class="mk-x" aria-label="Sluiten" onclick="PLMeekijk.sluit()">✕</button></div><div id="plMkBody"></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
    }
    ov.style.display = 'flex';
    teken();
  }
  // Dicht = alles weg: een volgende klant begint niet met de gegevens van de vorige.
  function sluit() {
    var ov = document.getElementById('plMkOv'); if (ov) ov.style.display = 'none';
    _st = { code: '', data: null, fout: '', bezig: false, form: null };
  }

  function waarde(v, k) { return v[k] === null || v[k] === undefined || v[k] === '' ? '' : v[k]; }
  function tekenVoertuig(v, issues) {
    var tech = [waarde(v, 'merk'), waarde(v, 'model'), waarde(v, 'bouwjaar'), waarde(v, 'motor'), waarde(v, 'brandstof'), waarde(v, 'transmissie')].filter(Boolean).join(' · ');
    var h = '<div class="mk-v" data-vid="' + esc(v.id) + '"><div class="mk-naam">' + esc(v.naam || v.merk || 'Voertuig') +
      (v.status === 'archief' ? ' <span class="mk-klein">(archief)</span>' : '') + '</div>' +
      '<div class="mk-klein">' + (v.kenteken ? esc(v.kenteken) + ' · ' : '') + esc(tech || '—') + '</div>' +
      '<div class="mk-klein">' + (v.kmstand ? esc(v.kmstand) + ' km' : 'km onbekend') + (v.apk_tot ? ' · APK tot ' + esc(v.apk_tot) : '') + '</div>';
    var eigen = v.eigen_pids || [];
    h += '<div class="mk-bh">Eigen sensoren (' + eigen.length + ')</div>' + (eigen.length ? '<ul>' + eigen.map(function (e) {
      return '<li><b>' + esc(e.code) + '</b>' + (e.ecu ? ' @ ' + esc(e.ecu) : '') + ' — ' + esc(e.naam) + ' = ' + esc(e.formule) + (e.eenheid ? ' ' + esc(e.eenheid) : '') + '</li>';
    }).join('') + '</ul>' : '<div class="mk-klein">Nog geen.</div>');
    var mijn = issues.filter(function (i) { return i.voertuig_id === v.id; });
    h += '<div class="mk-bh">Open punten (' + mijn.length + ')</div>' + (mijn.length ? '<ul>' + mijn.map(function (i) {
      return '<li>' + esc(i.titel || i.sleutel) + (i.aantal > 1 ? ' <span class="mk-klein">(' + esc(i.aantal) + '×)</span>' : '') + '</li>';
    }).join('') + '</ul>' : '<div class="mk-klein">Geen.</div>');
    if (_st.form === v.id) {
      h += '<div class="mk-bh">Sensor toevoegen</div>' +
        '<div class="mk-rij"><input id="mkPidCode" placeholder="Code, bv. 222A06" autocomplete="off"><input id="mkPidEcu" placeholder="ECU, bv. 720 (mag leeg)" autocomplete="off"></div>' +
        '<div class="mk-rij"><input id="mkPidNaam" placeholder="Naam, bv. Band rechtsvoor" autocomplete="off"></div>' +
        '<div class="mk-rij"><input id="mkPidFormule" placeholder="Formule, bv. A*4" autocomplete="off"><input id="mkPidEenheid" placeholder="Eenheid, bv. kPa" autocomplete="off"></div>' +
        '<div class="mk-klein">Alleen leescodes 21xx of 22xxxx. Een sensor die er al staat blijft zoals hij is — wijzigen doet de klant.</div>' +
        '<div class="mk-rij"><button class="mk-k hoofd" onclick="PLMeekijk._bewaar(\'' + esc(v.id) + '\')"' + (_st.bezig ? ' disabled' : '') + '>Toevoegen</button>' +
        '<button class="mk-k" onclick="PLMeekijk._form(null)">Annuleren</button></div>';
    } else {
      h += '<div class="mk-rij"><button class="mk-k" onclick="PLMeekijk._form(\'' + esc(v.id) + '\')">➕ Sensor toevoegen</button></div>';
    }
    return h + '</div>';
  }

  function teken() {
    var b = document.getElementById('plMkBody');
    if (!b) return;
    var h = '';
    if (_st.fout) h += '<div class="mk-melding">' + esc(_st.fout) + '</div>';
    if (!_st.data) {
      h += '<div class="mk-sub">Vraag de klant om de meekijkcode uit Mijn voertuigen. Met die code zie je zijn voertuigen en kun je eigen sensoren toevoegen; wijzigen of verwijderen kan niet. De klant ziet dat er is meegekeken.</div>' +
        '<div class="mk-rij"><input id="mkCode" class="mk-code" maxlength="6" placeholder="ABC234" autocomplete="off" value="' + esc(_st.code) + '"' +
        ' onkeydown="if(event.key===\'Enter\')PLMeekijk._open()">' +
        '<button class="mk-k hoofd" onclick="PLMeekijk._open()"' + (_st.bezig ? ' disabled' : '') + '>' + (_st.bezig ? '⏳' : 'Openen') + '</button></div>';
      b.innerHTML = h;
      return;
    }
    var d = _st.data;
    h += '<div class="mk-sub">Code <b>' + esc(_st.code) + '</b> · geldig tot ' + esc(new Date(d.verloopt).toLocaleString('nl')) + ' · ' + d.voertuigen.length + ' voertuig(en)</div>';
    if (!d.voertuigen.length) h += '<div class="mk-klein">Deze klant heeft nog geen voertuigen.</div>';
    d.voertuigen.forEach(function (v) { h += tekenVoertuig(v, d.issues || []); });
    h += '<div class="mk-rij"><button class="mk-k" onclick="PLMeekijk._ander()">Andere code</button></div>';
    b.innerHTML = h;
  }

  async function laad() {
    _st.bezig = true; _st.fout = ''; teken();
    try { _st.data = await api('open'); }
    catch (e) { _st.data = null; _st.fout = e.message; console.warn('PLMeekijk: openen', e); }
    finally { _st.bezig = false; teken(); }
  }

  window.PLMeekijk = {
    open: open,
    sluit: sluit,
    staat: function () { return _st; },
    _open: function () {
      var el = document.getElementById('mkCode');
      _st.code = String((el && el.value) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (_st.code.length !== 6) { _st.fout = 'Een meekijkcode heeft zes tekens.'; teken(); return; }
      laad();
    },
    _ander: function () { _st.data = null; _st.code = ''; _st.fout = ''; _st.form = null; teken(); },
    _form: function (vid) { _st.form = vid; teken(); },
    _bewaar: async function (vid) {
      var lees = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
      var pid = { code: lees('mkPidCode').toUpperCase(), ecu: lees('mkPidEcu').toUpperCase(), naam: lees('mkPidNaam'), formule: lees('mkPidFormule') || 'A', eenheid: lees('mkPidEenheid') };
      _st.bezig = true; _st.fout = ''; teken();
      try {
        await api('pid_erbij', { voertuig_id: vid, pid: pid });
        melding('Sensor ' + pid.code + ' toegevoegd');
        _st.form = null;
        _st.data = await api('open');
      } catch (e) { _st.fout = e.message; console.warn('PLMeekijk: sensor toevoegen', e); }
      finally { _st.bezig = false; teken(); }
    }
  };
})();
