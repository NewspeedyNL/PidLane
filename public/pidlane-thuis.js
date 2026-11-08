/* ══════════════════════════════════════════════════════════════════
   pidlane-thuis.js — PLThuis: het startscherm in drie lagen (06-11-2026)
   ──────────────────────────────────────────────────────────────────
   Tot deze datum stond Home vol losse kaarten die elk door een eigen module
   bovenaan gezet werden: Mijn voertuigen, Niet in de auto?, winter, Expert
   op afstand, en pas daaronder Check mijn auto. Zestien knoppen, zes
   kaartstijlen, en verbonden geen enkele waarde in beeld.

   Nu, in de vormtaal van Hyperlane (één held, de rest stil eromheen):
     1. De auto (vast): naam, verbindingspil, statusring en drie chips, met
        één hoofdknop die met de toestand meegaat — Verbind adapter, Check
        mijn auto, of Naar Live als de check vandaag al gedaan is.
     2. Voor jou nu: hoogstens één kaart, de urgentste (open punt, APK,
        winter, koude motor, herinnering). "›" bladert naar de volgende.
     3. Snel naar: vier tot zes doelen; de klikdata van sept–nov 2026 zette
        de volgorde (storing 94, onderweg 43, handel 30, voorbereiding 24).
   Zelf in te delen via Meer → Startscherm aanpassen: blokken aan/uit en in
   volgorde, Snel naar kiezen, of beginnen vanaf Bestuurder/Kenner/Garage.
   Een klant bewaart dat in zijn account (PLVoorkeur, sleutel `thuis`),
   anderen op dit toestel.

   Alleen lezen: pidVals, PLGarage, PLFoutcodes, PLOpstart, PLZonder,
   PLHerinner. Geen busverkeer. Expert op afstand staat sinds deze datum in
   het verbindscherm en in Meer (1 % van de tikken). De oude kaarten
   #plGarageKaart en #plZonderKaart blijven bestaan voor hun eigen modules,
   maar staan niet meer in beeld; #plWinterKaart verhuist naar laag 2.
   Laadt ná pidlane-winter.js en pidlane-herinner.js. Test: test-thuis.js,
   proef: bproef-thuis.js.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── De kern (puur) ───────────────────────────────────────────────
  var BLOKKEN = {
    nu: { naam: 'Voor jou nu', uitleg: 'APK, open punten, winter en wat nu speelt' },
    snel: { naam: 'Snel naar', uitleg: 'je vaste doelen' },
    fav: { naam: 'Favorieten', uitleg: 'je eigen snelstart' },
    alle: { naam: 'Alle functies', uitleg: 'de volle lijst, voor de vakman' }
  };
  var SNEL = {
    storing: { t: 'Er is iets mis', d: 'Klacht, lampje of geluid', on: "PLNav.tegel('storing')" },
    onderweg: { t: 'Rit starten', d: 'Ritmonitor, zuinig, caravan', on: "PLNav.tegel('onderweg')", cfg: 'door_saving_active' },
    handel: { t: 'Kopen of verkopen', d: 'Staat, historie en waarde', on: "PLNav.tegel('handel')", cfg: 'door_deal_active' },
    voorbereiding: { t: 'Voorbereiden', d: 'Winter, lange rit, onderhoud', on: "PLNav.tegel('voorbereiding')", cfg: 'door_prep_active' },
    live: { t: 'Live data', d: 'Alle sensoren nu', on: "PLNav.tab('live')" },
    rapporten: { t: 'Rapporten', d: 'Wat eerder gemaakt is', on: "PLNav.tab('rapporten')" },
    voertuigen: { t: 'Mijn voertuigen', d: 'Profiel, ritten, sensoren', on: 'PLGarage.open()', klant: true },
    kenteken: { t: 'Kenteken-check', d: 'APK, NAP, terugroep', on: 'PLZonder.kenteken()' },
    lampje: { t: 'Lampje brandt?', d: 'Mag ik doorrijden?', on: 'PLLampjes.open()' }
  };
  // `cfg`: de schakelaar in de externe config (TEGEL_SLEUTELS in pidlane-fuel.js) die deze tegel uitzet.
  var SNEL_MAX = 6;
  var BASIS = {
    bestuurder: { naam: 'Bestuurder', blokken: ['nu', 'snel', '-fav', '-alle'], snel: ['storing', 'onderweg', 'handel', 'voorbereiding'] },
    kenner: { naam: 'Kenner', blokken: ['nu', 'snel', 'fav', '-alle'], snel: ['storing', 'onderweg', 'live', 'rapporten'] },
    garage: { naam: 'Garage', blokken: ['snel', 'alle', 'nu', '-fav'], snel: ['storing', 'handel', 'live', 'voertuigen'] }
  };
  // Eén sleutel in het account: b:<blok> (aan), -b:<blok> (uit), s:<doel>, p:<basis>.
  var PATROON = /^-?[bsp]:[a-z]{2,14}$/;

  /* Waar staat de auto? geen | demo | verbonden | gecheckt */
  function toestand(c) {
    c = c || {};
    if (c.demo) return 'demo';
    if (!c.verbonden) return 'geen';
    return c.checkVandaag ? 'gecheckt' : 'verbonden';
  }
  /* De ene hoofdknop: zonder verbinding verbinden, verbonden eerst de check,
     daarna Live. De demo krijgt de check: daar kiest de reviewer zelf. */
  function hoofdknop(t) {
    if (t === 'geen') return 'verbind';
    if (t === 'gecheckt') return 'live';
    return 'check';
  }

  function nl1(x) { return String(Math.round(x * 10) / 10).replace('.', ','); }
  /* De drie chips. Verbonden: foutcodes, laadspanning, koelwater uit de
     meting van nu. Zonder verbinding: wat er van de auto bekend is. Een
     waarde die er niet is, staat er als "—" en niet als 0. */
  function chips(c) {
    c = c || {};
    var u = [], pv = c.pidVals || {};
    if (c.verbonden || c.demo) {
      var f = c.foutcodes;
      u.push(f == null ? { k: 'fout', w: '—', l: 'foutcodes', n: 'stil' } : { k: 'fout', w: String(f), l: f === 1 ? 'foutcode' : 'foutcodes', n: f ? 'rood' : 'ok' });
      var v = Number(pv['0142']);
      u.push(isFinite(v) && v > 0 ? { k: 'volt', w: nl1(v) + ' V', l: 'spanning', n: (v < 12 || v > 15.2) ? 'let' : 'ok' } : { k: 'volt', w: '—', l: 'spanning', n: 'stil' });
      var kw = Number(pv['0105']);
      u.push(isFinite(kw) && pv['0105'] != null ? { k: 'koel', w: Math.round(kw) + '°', l: 'koelwater', n: kw >= 110 ? 'rood' : kw < 60 ? 'let' : 'ok' } : { k: 'koel', w: '—', l: 'koelwater', n: 'stil' });
      return u;
    }
    var o = c.open;
    u.push(o == null ? { k: 'open', w: '—', l: 'open punten', n: 'stil' } : { k: 'open', w: String(o), l: o === 1 ? 'open punt' : 'open punten', n: o ? 'let' : 'ok' });
    var a = c.apkDagen;
    u.push(a == null ? { k: 'apk', w: '—', l: 'tot APK', n: 'stil' } : { k: 'apk', w: a < 0 ? 'verlopen' : a + ' d', l: 'tot APK', n: a < 0 ? 'rood' : a <= 30 ? 'let' : 'ok' });
    var g = c.gezienDagen;
    u.push(g == null ? { k: 'gezien', w: 'nooit', l: 'uitgelezen', n: 'stil' } : { k: 'gezien', w: g === 0 ? 'vandaag' : g + ' d', l: 'geleden gelezen', n: g > 60 ? 'let' : 'ok' });
    return u;
  }
  /* De kleur van de ring: rood boven oranje boven groen; zonder gegevens stil. */
  function ringKleur(lijst) {
    var n = (lijst || []).map(function (x) { return x.n; });
    if (n.indexOf('rood') >= 0) return 'rood';
    if (n.indexOf('let') >= 0) return 'let';
    if (n.indexOf('ok') >= 0) return 'ok';
    return 'stil';
  }

  // Wat de auto nú zegt (koude motor) gaat voor seizoensadvies.
  var GEWICHT = { rood: 30, oranje: 20, live: 16, winter: 15, info: 5, herinner: 3 };
  /* Wat er nu speelt, urgentste eerst. `punten` komt uit PLGarage.status():
     "Nog nooit uitgelezen" en "N dagen niet uitgelezen" staan al als chip en
     tellen hier niet. Gelijke urgentie houdt de volgorde van de bron. */
  function kandidaten(c) {
    c = c || {};
    var u = [];
    (c.punten || []).forEach(function (p, i) {
      if (!p || !p.tekst || /uitgelezen$/.test(p.tekst)) return;
      var soort = p.ernst === 'rood' ? 'rood' : p.ernst === 'oranje' ? 'oranje' : 'info';
      u.push({ id: 'punt' + i, soort: soort, titel: p.tekst, tekst: soort === 'rood' ? 'Laat dit snel nakijken' : 'Bekijk het in Mijn voertuigen', actie: 'garage', gewicht: GEWICHT[soort] });
    });
    if (c.winter) u.push({ id: 'winter', soort: 'winter', gewicht: GEWICHT.winter });
    var kw = c.pidVals ? Number(c.pidVals['0105']) : NaN;
    if ((c.verbonden || c.demo) && c.pidVals && c.pidVals['0105'] != null && isFinite(kw) && kw < 60)
      u.push({ id: 'koud', soort: 'live', titel: 'Motor nog koud (' + Math.round(kw) + ' °C)', tekst: 'Rustig optrekken tot het koelwater rond 70 °C is', gewicht: GEWICHT.live });
    if (c.herinner && !c.herinner.aan)
      u.push({ id: 'herinner', soort: 'herinner', titel: 'Herinner me aan de APK', tekst: 'Ook onderhoud en terugroepacties, 30 en 7 dagen vooraf', actie: 'herinner', gewicht: GEWICHT.herinner });
    return u.map(function (x, i) { x._i = i; return x; })
      .sort(function (a, b) { return b.gewicht - a.gewicht || a._i - b._i; });
  }

  /* De indeling uit de opgeslagen lijst, aangevuld tot hij compleet is. Een
     onbekend blok of doel valt weg; een blok dat ontbreekt komt achteraan,
     uit. Zonder lijst: de basis. Geeft { basis, blokken:[{id,aan}], snel }. */
  function indeling(lijst, standaard) {
    var basisId = BASIS[standaard] ? standaard : 'bestuurder';
    var l = Array.isArray(lijst) ? lijst.filter(function (x) { return PATROON.test(String(x)); }) : [];
    l.forEach(function (x) { var m = /^p:(.+)$/.exec(x); if (m && BASIS[m[1]]) basisId = m[1]; });
    var bron = l.some(function (x) { return /^-?b:/.test(x); }) ? l : BASIS[basisId].blokken.map(function (x) { return x.charAt(0) === '-' ? '-b:' + x.slice(1) : 'b:' + x; });
    var blokken = [], gezien = {};
    bron.forEach(function (x) {
      var m = /^(-?)b:(.+)$/.exec(x);
      if (!m || !BLOKKEN[m[2]] || gezien[m[2]]) return;
      gezien[m[2]] = true; blokken.push({ id: m[2], aan: !m[1] });
    });
    Object.keys(BLOKKEN).forEach(function (id) { if (!gezien[id]) blokken.push({ id: id, aan: false }); });
    var snel = l.filter(function (x) { return /^s:/.test(x); }).map(function (x) { return x.slice(2); })
      .filter(function (x, i, a) { return SNEL[x] && a.indexOf(x) === i; });
    if (!l.some(function (x) { return /^s:/.test(x); })) snel = BASIS[basisId].snel.slice();
    return { basis: basisId, blokken: blokken, snel: snel.slice(0, SNEL_MAX) };
  }
  function naarLijst(ind) {
    var u = ['p:' + ind.basis];
    ind.blokken.forEach(function (b) { u.push((b.aan ? '' : '-') + 'b:' + b.id); });
    ind.snel.slice(0, SNEL_MAX).forEach(function (s) { u.push('s:' + s); });
    // Alles uitgezet is een keuze: zonder s:-regel zou het laden de standaard teruggeven.
    if (!ind.snel.length) u.push('s:geen');
    return u;
  }
  /* Een blok of doel één plek op of neer. Puur: geeft een nieuwe lijst. */
  function verschuif(lijst, i, stap) {
    var j = i + stap, l = lijst.slice();
    if (i < 0 || j < 0 || i >= l.length || j >= l.length) return l;
    var x = l[i]; l[i] = l[j]; l[j] = x;
    return l;
  }

  // ── De app ───────────────────────────────────────────────────────
  var el = function (id) { return document.getElementById(id); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function melding(t) { try { if (typeof showToast === 'function') showToast(t); } catch (e) { console.warn('PLThuis: melding', e); } }
  function wie() { try { return String((window.currentUser && window.currentUser.user) || '').toLowerCase(); } catch (e) { return ''; } }
  function isKlant() { try { var u = window.currentUser; return !!(u && String(u.role || '').toLowerCase() === 'klant'); } catch (e) { return false; } }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { return false; } }
  function isVerbonden() { try { return typeof connected !== 'undefined' && !!connected && !isDemo(); } catch (e) { return false; } }
  function cfgAan(d) { try { return !d.cfg || typeof featOn !== 'function' || featOn(d.cfg); } catch (e) { console.warn('PLThuis: config onleesbaar', e); return true; } }
  function garageModus() { try { return document.body.classList.contains('pl-garage'); } catch (e) { return false; } }

  var LOKAAL = 'pl_thuis';
  function opgeslagen() {
    try { var p = window.PLVoorkeur && PLVoorkeur.huidig && PLVoorkeur.huidig(); if (isKlant() && p && Array.isArray(p.thuis)) return p.thuis; }
    catch (e) { console.warn('PLThuis: voorkeur onleesbaar', e); }
    try { var k = JSON.parse(localStorage.getItem(LOKAAL) || 'null'); if (k && k.u === wie() && Array.isArray(k.l)) return k.l; }
    catch (e) { console.warn('PLThuis: indeling op dit toestel onleesbaar', e); }
    return null;
  }
  function huidig() { return indeling(opgeslagen(), garageModus() ? 'garage' : 'bestuurder'); }

  function apkDagen(datum) {
    if (!datum) return null;
    var d = Date.parse(String(datum).length === 8 ? String(datum).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : datum);
    return isFinite(d) ? Math.round((d - Date.now()) / 864e5) : null;
  }
  function context() {
    var c = { verbonden: isVerbonden(), demo: isDemo(), pidVals: null, foutcodes: null, punten: [], open: null, apkDagen: null, gezienDagen: null, naam: '', sub: '', foto: null, winter: false, herinner: null };
    try { c.pidVals = typeof pidVals !== 'undefined' ? pidVals : null; } catch (e) { c.pidVals = null; }
    try { c.checkVandaag = !!(c.verbonden && window.PLOpstart && PLOpstart.checkVandaag()); } catch (e) { console.warn('PLThuis: dagcheck onleesbaar', e); }
    try {
      var s = window.PLFoutcodes && PLFoutcodes.staat().scan;
      if (s && s.codes) c.foutcodes = (s.codes.bevestigd || []).length + (s.codes.permanent || []).length;
    } catch (e) { console.warn('PLThuis: foutcodes onleesbaar', e); }
    var v = null;
    try { v = window.PLGarage && PLGarage.actief ? PLGarage.actief() : null; } catch (e) { console.warn('PLThuis: voertuig onleesbaar', e); }
    // Verbonden met een auto die niet het actieve voertuig is: dan de auto aan de adapter.
    var vi = null; try { vi = typeof vehicleInfo !== 'undefined' ? vehicleInfo : null; } catch (e) { vi = null; }
    var gekoppeld = null; try { gekoppeld = window.PLGarage && PLGarage.gekoppeld ? PLGarage.gekoppeld() : null; } catch (e) { gekoppeld = null; }
    if ((c.verbonden || c.demo) && vi && vi.merk && !(gekoppeld && v && gekoppeld.id === v.id)) {
      c.naam = [vi.merk, vi.model, vi.year].filter(Boolean).join(' ');
      c.sub = c.demo ? 'Gesimuleerd — er wordt niets bewaard' : 'Herkend aan de adapter';
      v = c.demo ? null : (gekoppeld || null);
    }
    if (v) {
      c.naam = c.naam || v.naam || [v.merk, v.model].filter(Boolean).join(' ') || 'Mijn voertuig';
      if (!c.sub) c.sub = v.kenteken ? String(v.kenteken).toUpperCase() : [v.merk, v.model].filter(Boolean).join(' ');
      try { var st = PLGarage.status ? PLGarage.status(v) : null; if (st) c.punten = st.punten; } catch (e) { console.warn('PLThuis: status onleesbaar', e); }
      c.open = (v.aantal && typeof v.aantal.openIssues === 'number') ? v.aantal.openIssues : null;
      c.apkDagen = apkDagen(v.apk_tot);
      c.gezienDagen = v.laatst_gezien ? Math.max(0, Math.round((Date.now() - new Date(v.laatst_gezien)) / 864e5)) : null;
    } else if (!c.naam) {
      var m = null; try { m = window.PLZonder && PLZonder.mijnAuto ? PLZonder.mijnAuto() : null; } catch (e) { console.warn('PLThuis: mijn auto onleesbaar', e); }
      if (m && m.kent) { c.naam = [m.merk, m.model].filter(Boolean).join(' ') || m.kent; c.sub = m.kent; c.apkDagen = apkDagen(m.keuring); }
    }
    try { var img = el('welcomeAuto'); if (img && !img.hidden && img.getAttribute('src')) c.foto = img.getAttribute('src'); } catch (e) { c.foto = null; }
    try { var w = el('plWinterKaart'); c.winter = !!(w && w.innerHTML.trim()); } catch (e) { c.winter = false; }
    try { c.herinner = window.PLHerinner ? PLHerinner.regel() : null; } catch (e) { console.warn('PLThuis: herinnering onleesbaar', e); }
    return c;
  }

  var CSS =
    '#plThuis{display:flex;flex-direction:column;gap:12px;--th-c:#3ee6ff;--th-v:#9b7bff;--th-g:#2dff9a;--th-a:#ffb020;--th-r:#ff5470;--th-glas:rgba(140,170,255,.07);--th-rand:rgba(140,170,255,.18);--th-dim:#8d99b6}' +
    '.th-held{position:relative;border-radius:22px;padding:16px 14px 14px;display:flex;flex-direction:column;gap:12px;overflow:hidden;' +
      'background:radial-gradient(ellipse 90% 70% at 50% 0%,rgba(62,230,255,.13),transparent 65%),linear-gradient(160deg,rgba(18,26,44,.92),rgba(10,14,24,.92));border:1px solid rgba(62,230,255,.28);box-shadow:0 12px 40px rgba(0,0,0,.35)}' +
    '.th-kop{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '.th-kop-t{font:800 12px var(--m);letter-spacing:.14em;text-transform:uppercase;color:var(--th-dim)}' +
    '.th-pil{font:600 11px var(--m);letter-spacing:.06em;padding:4px 9px;border-radius:99px;border:1px solid var(--th-rand);color:var(--th-dim);background:transparent;cursor:pointer}' +
    '.th-pil[data-t="verbonden"],.th-pil[data-t="gecheckt"]{color:var(--th-g);border-color:rgba(45,255,154,.45);box-shadow:0 0 12px rgba(45,255,154,.25)}' +
    '.th-pil[data-t="demo"]{color:var(--th-v);border-color:rgba(155,123,255,.5)}' +
    '.th-auto{display:flex;align-items:center;gap:14px;cursor:pointer;min-width:0}' +
    '.th-ring{flex:0 0 76px;width:76px;height:76px;border-radius:50%;display:grid;place-items:center;position:relative;' +
      'background:radial-gradient(circle,#0b1120 56%,transparent 57%),conic-gradient(var(--th-k) 0 100%);box-shadow:0 0 18px color-mix(in srgb,var(--th-k) 45%,transparent)}' +
    '.th-ring[data-k="ok"]{--th-k:var(--th-g)} .th-ring[data-k="let"]{--th-k:var(--th-a)} .th-ring[data-k="rood"]{--th-k:var(--th-r)} .th-ring[data-k="stil"]{--th-k:rgba(140,170,255,.28);box-shadow:none}' +
    '.th-ring svg{width:30px;height:30px;color:var(--tx)}' +
    '.th-foto{flex:0 0 104px;width:104px;height:64px;object-fit:contain;filter:drop-shadow(0 6px 12px rgba(0,0,0,.5))}' +
    '.th-naam{font:800 19px/1.2 var(--f);color:var(--tx);text-wrap:balance}' +
    '.th-sub{font-size:12.5px;color:var(--tx3);margin-top:3px;letter-spacing:.02em}' +
    '.th-chips{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}' +
    '.th-chip{background:var(--th-glas);border:1px solid var(--th-rand);border-radius:12px;padding:8px 6px;text-align:center;min-width:0}' +
    '.th-chip b{display:block;font:600 16px var(--m);font-variant-numeric:tabular-nums;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.th-chip small{display:block;font-size:11px;color:var(--th-dim);margin-top:1px}' +
    '.th-chip[data-n="ok"] b{color:var(--th-g)} .th-chip[data-n="let"] b{color:var(--th-a)} .th-chip[data-n="rood"] b{color:var(--th-r)} .th-chip[data-n="stil"] b{color:var(--th-dim)}' +
    '.th-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border:0;border-radius:15px;cursor:pointer;' +
      'font:800 16px var(--f);color:#04121a;background:linear-gradient(90deg,#3ee6ff,#7fb6ff);box-shadow:0 0 22px rgba(62,230,255,.35)}' +
    '.th-cta small{font:600 12px var(--m);opacity:.7}' +
    '.th-cta:focus-visible,.th-mini button:focus-visible,.th-tegel:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.th-mini{display:flex;gap:7px}' +
    '.th-mini button{flex:1;min-height:40px;border-radius:11px;border:1px solid var(--th-rand);background:transparent;color:var(--tx2);font:700 12.5px var(--f);cursor:pointer;padding:6px 4px}' +
    '.th-blok{display:flex;flex-direction:column;gap:8px}' +
    '.th-blok-kop{font:700 11px var(--m);letter-spacing:.16em;text-transform:uppercase;color:var(--th-dim);padding:2px 2px 0}' +
    '.th-nu{display:flex;align-items:center;gap:11px;border-radius:15px;padding:12px;border:1px solid var(--th-rand);background:var(--th-glas);cursor:pointer;text-align:left;width:100%;color:var(--tx);font-family:var(--f)}' +
    '.th-nu[data-s="rood"]{border-color:rgba(255,84,112,.5);background:rgba(255,84,112,.08)} .th-nu[data-s="oranje"],.th-nu[data-s="live"]{border-color:rgba(255,176,32,.45);background:rgba(255,176,32,.07)}' +
    '.th-nu-dot{flex:0 0 9px;height:9px;border-radius:50%;background:var(--th-a);box-shadow:0 0 9px var(--th-a)} .th-nu[data-s="rood"] .th-nu-dot{background:var(--th-r);box-shadow:0 0 9px var(--th-r)} .th-nu[data-s="info"] .th-nu-dot,.th-nu[data-s="herinner"] .th-nu-dot{background:var(--th-c);box-shadow:0 0 9px var(--th-c)}' +
    '.th-nu-tx{flex:1;min-width:0} .th-nu-tx b{display:block;font-size:14.5px} .th-nu-tx small{display:block;color:var(--tx3);font-size:12.5px;margin-top:1px}' +
    '.th-volgende{border:1px solid var(--th-rand);background:transparent;color:var(--th-dim);font:600 12px var(--m);border-radius:9px;padding:6px 9px;cursor:pointer}' +
    '.th-tegels{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.th-tegel{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:64px;padding:11px 12px;border-radius:14px;border:1px solid var(--th-rand);background:var(--th-glas);color:var(--tx);cursor:pointer;text-align:left;font-family:var(--f)}' +
    '.th-tegel b{font-size:14.5px;font-weight:800} .th-tegel small{font-size:12px;color:var(--tx3)}' +
    '.th-rij{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:48px;padding:0 14px;border-radius:14px;border:1px solid var(--th-rand);background:var(--th-glas);color:var(--tx);font:700 14.5px var(--f);cursor:pointer}' +
    '.th-aanpas{align-self:center;background:none;border:0;color:var(--th-dim);font:600 12.5px var(--f);text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:8px}' +
    '#plThuis [hidden],#plThuisOv[hidden]{display:none!important}' +
    '#plGarageKaart,#plZonderKaart{display:none}' +
    // De winterkaart van PLWinter in de glasstijl van laag 2 (zijn eigen CSS blijft voor elders).
    '#plThuis #plWinterKaart .plw{margin:0;border-radius:15px;border-color:var(--th-rand);background:var(--th-glas)}' +
    '#plThuis #plWinterKaart .plw-banner{border-color:rgba(62,230,255,.35);background:rgba(62,230,255,.06)}' +
    '#plThuis #plWinterKaart .plw-banner.zomer{border-color:rgba(255,176,32,.4);background:rgba(255,176,32,.06)}' +
    '#plThuis #plWinterKaart .plw-k{min-height:40px;border-radius:11px;border-color:var(--th-rand);background:transparent}' +
    '#plThuis #plWinterKaart .plw-k.hoofd{border:0;color:#04121a;background:linear-gradient(90deg,#3ee6ff,#7fb6ff)}' +
    '#welcomeScreen .welcome-header{display:none}' +
    // De editor
    '#plThuisOv{position:fixed;inset:0;z-index:var(--z-modal,9600);background:rgba(5,8,14,.9);display:flex;align-items:flex-end;justify-content:center}' +
    '#plThuisOv .th-doos{width:100%;max-width:520px;max-height:88vh;overflow-y:auto;background:#0d1322;border:1px solid var(--th-rand,rgba(140,170,255,.18));border-radius:20px 20px 0 0;padding:16px 16px calc(18px + var(--pl-sab,0px));display:flex;flex-direction:column;gap:12px;color:var(--tx)}' +
    '#plThuisOv .th-ek{display:flex;align-items:center;justify-content:space-between} #plThuisOv .th-ek b{font:800 17px var(--f)}' +
    '#plThuisOv .th-x{width:40px;height:40px;border-radius:10px;border:1px solid rgba(140,170,255,.18);background:transparent;color:var(--tx2);font-size:16px;cursor:pointer}' +
    '#plThuisOv .th-er{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:12px;border:1px solid rgba(140,170,255,.18);background:rgba(140,170,255,.06)}' +
    '#plThuisOv .th-er .tx{flex:1;min-width:0} #plThuisOv .th-er .tx b{display:block;font-size:14px} #plThuisOv .th-er .tx small{color:var(--tx3);font-size:12px}' +
    '#plThuisOv .th-pk{width:36px;height:36px;border-radius:9px;border:1px solid rgba(140,170,255,.18);background:transparent;color:var(--tx2);cursor:pointer;font-size:14px}' +
    '#plThuisOv .th-pk:disabled{opacity:.3;cursor:default}' +
    '#plThuisOv .th-vast{font:600 11px var(--m);color:#8d99b6;padding:0 6px}' +
    '#plThuisOv input[type=checkbox]{width:22px;height:22px;accent-color:#9b7bff}' +
    '#plThuisOv .th-sk{font:700 11px var(--m);letter-spacing:.14em;text-transform:uppercase;color:#8d99b6;margin-top:4px}' +
    '#plThuisOv .th-basis{display:flex;gap:7px} #plThuisOv .th-basis button{flex:1;min-height:42px;border-radius:11px;border:1px solid rgba(140,170,255,.18);background:transparent;color:var(--tx);font:700 13px var(--f);cursor:pointer}' +
    '#plThuisOv .th-basis button[aria-pressed="true"]{border-color:#9b7bff;color:#c9b8ff;box-shadow:0 0 10px rgba(155,123,255,.35)}' +
    '#plThuisOv .th-bewaar{min-height:50px;border:0;border-radius:14px;background:linear-gradient(90deg,#3ee6ff,#7fb6ff);color:#04121a;font:800 15px var(--f);cursor:pointer}' +
    '@media (prefers-reduced-motion:no-preference){.th-ring[data-k="ok"]{animation:thAdem 4s ease-in-out infinite}@keyframes thAdem{50%{box-shadow:0 0 28px color-mix(in srgb,var(--th-k) 60%,transparent)}}}';
  function zorgCss() {
    if (el('plThuisCss')) return;
    var s = document.createElement('style'); s.id = 'plThuisCss'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var IC_AUTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15l1.6-4.8A2 2 0 0 1 6.5 9h11a2 2 0 0 1 1.9 1.2L21 15v3a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-11v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="15" r="1.2"/><circle cx="16.5" cy="15" r="1.2"/></svg>';
  var PIL = { geen: '○ Geen adapter', demo: '◇ Simulatie', verbonden: '● Live', gecheckt: '● Live · gecheckt' };

  var _nuI = 0, _sleutel = '', _nuLijst = [];
  function bouw() {
    var doel = el('plThuis');
    if (!doel || doel.dataset.gebouwd) return !!doel;
    zorgCss();
    doel.dataset.gebouwd = '1';
    doel.innerHTML =
      '<section class="th-held" id="plThuisHeld" aria-label="Je auto">' +
        '<div class="th-kop"><span class="th-kop-t">Mijn auto</span><button type="button" class="th-pil" id="plThuisPil" onclick="PLThuis.pil()"></button></div>' +
        '<div class="th-auto" id="plThuisAuto" onclick="PLThuis.auto()"><span class="th-ring" id="plThuisRing" data-k="stil">' + IC_AUTO + '</span>' +
          '<img class="th-foto" id="plThuisFoto" alt="" hidden><div style="min-width:0"><div class="th-naam" id="plThuisNaam">Mijn auto</div><div class="th-sub" id="plThuisSub"></div></div></div>' +
        '<div class="th-chips" id="plThuisChips"></div>' +
        '<button type="button" class="th-cta" id="plVerbindBtn" onclick="PLThuis.verbind()" hidden>⚡ Verbind adapter</button>' +
        '<button type="button" class="th-cta" id="plCheckBtn" onclick="PLNav.check()" hidden>Check mijn auto <small>±30 s</small></button>' +
        '<button type="button" class="th-cta" id="plLiveBtn" onclick="PLNav.tab(\'live\')" hidden>Naar Live</button>' +
        '<div class="th-mini" id="plThuisMini"></div>' +
      '</section>' +
      '<div id="plThuisBlokken" style="display:flex;flex-direction:column;gap:12px">' +
        '<section class="th-blok" data-blok="nu" id="plThuisNu"><div id="plThuisNuKaart"></div></section>' +
        '<section class="th-blok" data-blok="snel" id="plThuisSnel"><div class="th-blok-kop">Snel naar</div><div class="th-tegels" id="plThuisTegels"></div></section>' +
        '<section class="th-blok" data-blok="fav" id="plThuisFav"><button type="button" class="th-rij" onclick="PLThuis.favorieten()">⭐ Favorieten<span aria-hidden="true">→</span></button></section>' +
        '<section class="th-blok" data-blok="alle" id="plThuisAlle"><button type="button" class="th-rij" id="plAllesBtn" onclick="openDoor(\'alle\')">Alle functies<span aria-hidden="true">→</span></button></section>' +
      '</div>' +
      '<button type="button" class="th-aanpas" id="plThuisAanpas" onclick="PLThuis.aanpassen()">Startscherm aanpassen</button>';
    // De winterkaart hoort voortaan in laag 2; PLWinter blijft hem zelf tekenen.
    var w = el('plWinterKaart'); if (w) el('plThuisNu').appendChild(w);
    return true;
  }

  function miniKnoppen(t) {
    if (t === 'geen') return [['Kenteken-check', 'PLZonder.kenteken()'], ['Foutcode opzoeken', 'PLZonder.foutcode()'], ['Probeer demo', 'PLZonder.simuleer()']];
    if (t === 'demo') return [['Live', "PLNav.tab('live')"], ['Rapporten', "PLNav.tab('rapporten')"], ['Stop simulatie', 'PLZonder.stopDemo()']];
    return t === 'gecheckt' ? [['Check opnieuw', 'PLNav.check()'], ['Rapporten', "PLNav.tab('rapporten')"], ['Laat meekijken', "PLNav.expert('deel')"]]
      : [['Live', "PLNav.tab('live')"], ['Rapporten', "PLNav.tab('rapporten')"], ['Laat meekijken', "PLNav.expert('deel')"]];
  }

  function teken() {
    if (!bouw()) return;
    var c = context(), t = toestand(c), hk = hoofdknop(t), ch = chips(c), ind = huidig();
    var nu = kandidaten(c);
    var snel = ind.snel.filter(function (id) { return (!SNEL[id].klant || isKlant()) && cfgAan(SNEL[id]); });
    var sleutel = JSON.stringify([t, hk, ch, c.naam, c.sub, c.foto, nu.map(function (x) { return x.id + x.titel; }), ind, snel, isKlant(), _nuI]);
    if (sleutel === _sleutel) return;
    _sleutel = sleutel;
    var pil = el('plThuisPil'); pil.textContent = PIL[t]; pil.dataset.t = t;
    pil.setAttribute('aria-label', t === 'geen' ? 'Geen adapter verbonden — tik om te verbinden' : 'Verbindingspaneel openen');
    el('plThuisNaam').textContent = c.naam || 'Mijn auto';
    el('plThuisSub').textContent = c.sub || (t === 'geen' ? 'Verbind je adapter of kies hieronder wat zonder kan' : '');
    var foto = el('plThuisFoto'), ring = el('plThuisRing');
    if (c.foto) { if (foto.getAttribute('src') !== c.foto) foto.src = c.foto; foto.hidden = false; } else foto.hidden = true;
    ring.dataset.k = ringKleur(ch); ring.hidden = !!c.foto;
    el('plThuisChips').innerHTML = ch.map(function (x) { return '<div class="th-chip" data-k="' + x.k + '" data-n="' + x.n + '"><b>' + esc(x.w) + '</b><small>' + esc(x.l) + '</small></div>'; }).join('');
    el('plVerbindBtn').hidden = hk !== 'verbind';
    el('plCheckBtn').hidden = hk !== 'check';
    el('plLiveBtn').hidden = hk !== 'live';
    el('plThuisMini').innerHTML = miniKnoppen(t).map(function (b) { return '<button type="button" onclick="' + b[1] + '">' + esc(b[0]) + '</button>'; }).join('');
    // Laag 2: één kaart. De winterkaart is een eigen element van PLWinter.
    _nuLijst = nu;
    if (_nuI >= nu.length) _nuI = 0;
    var k = nu[_nuI], w = el('plWinterKaart'), kaart = el('plThuisNuKaart');
    var volg = nu.length > 1 ? '<button type="button" class="th-volgende" onclick="event.stopPropagation();PLThuis.volgende()" aria-label="Volgende melding">' + (_nuI + 1) + '/' + nu.length + ' ›</button>' : '';
    if (w) w.hidden = !(k && k.soort === 'winter');
    if (!k || k.soort === 'winter') kaart.innerHTML = k && nu.length > 1 ? '<div style="display:flex;justify-content:flex-end">' + volg + '</div>' : '';
    else kaart.innerHTML = '<button type="button" class="th-nu" data-s="' + k.soort + '" data-nu="' + esc(k.id) + '" onclick="PLThuis.nuActie()"><span class="th-nu-dot"></span><span class="th-nu-tx"><b>' + esc(k.titel) + '</b><small>' + esc(k.tekst) + '</small></span>' + volg + '</button>';
    // Laag 3: de blokken in hun volgorde.
    var bl = el('plThuisBlokken');
    ind.blokken.forEach(function (b, i) {
      var s = bl.querySelector('[data-blok="' + b.id + '"]'); if (!s) return;
      s.style.order = i;
      s.hidden = !b.aan || (b.id === 'nu' && !nu.length) || (b.id === 'snel' && !snel.length);
    });
    el('plThuisTegels').innerHTML = snel.map(function (id) {
      var d = SNEL[id];
      return '<button type="button" class="th-tegel" data-snel="' + id + '" onclick="' + d.on + '"><b>' + esc(d.t) + '</b><small>' + esc(d.d) + '</small></button>';
    }).join('');
  }

  // ── Handelingen ──────────────────────────────────────────────────
  function verbind() {
    try { if (typeof logUsage === 'function') logUsage('thuis', 'verbind'); } catch (e) { console.warn('PLThuis: logUsage', e); }
    try { if (typeof obdChipTap === 'function') { obdChipTap(); return; } el('connOv').classList.remove('hidden'); }
    catch (e) { console.warn('PLThuis: verbindscherm opent niet', e); melding('Het verbindscherm opent nu niet — probeer het opnieuw'); }
  }
  function nuActie() {
    var k = _nuLijst[_nuI]; if (!k) return;
    try { if (typeof logUsage === 'function') logUsage('thuis_nu', k.id); } catch (e) { console.warn('PLThuis: logUsage', e); }
    try {
      if (k.actie === 'herinner' && window.PLHerinner) PLHerinner.zet(true);
      else if (k.actie === 'garage' && window.PLGarage) { var v = PLGarage.actief(); PLGarage.open(v ? v.id : undefined); }
    } catch (e) { console.warn('PLThuis: actie ' + k.id + ' mislukt', e); melding('Dit opent nu niet — probeer het opnieuw'); }
  }

  // ── De editor ────────────────────────────────────────────────────
  var _form = null;
  function aanpassen() {
    try { if (typeof closeKebab === 'function') closeKebab(); } catch (e) { console.warn('PLThuis: Meer niet gesloten', e); }
    zorgCss();
    _form = JSON.parse(JSON.stringify(huidig()));
    var ov = el('plThuisOv');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'plThuisOv'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Startscherm aanpassen');
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) sluit(); });
    }
    ov.hidden = false;
    tekenForm();
  }
  function sluit() { var ov = el('plThuisOv'); if (ov) ov.hidden = true; _form = null; }
  function knopOpNeer(soort, i, n) {
    return '<button type="button" class="th-pk" aria-label="Omhoog" onclick="PLThuis._schuif(\'' + soort + '\',' + i + ',-1)"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="th-pk" aria-label="Omlaag" onclick="PLThuis._schuif(\'' + soort + '\',' + i + ',1)"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>';
  }
  function tekenForm() {
    var ov = el('plThuisOv'); if (!ov || !_form) return;
    var f = _form, h = '<div class="th-doos"><div class="th-ek"><b>Startscherm aanpassen</b><button type="button" class="th-x" aria-label="Sluiten" onclick="PLThuis._sluit()">✕</button></div>';
    h += '<div class="th-sk">Beginnen vanaf</div><div class="th-basis">' + Object.keys(BASIS).map(function (b) {
      return '<button type="button" aria-pressed="' + (f.basis === b) + '" onclick="PLThuis._basis(\'' + b + '\')">' + esc(BASIS[b].naam) + '</button>';
    }).join('') + '</div>';
    h += '<div class="th-sk">Blokken</div><div class="th-er"><div class="tx"><b>De auto</b><small>status en hoofdknop, altijd bovenaan</small></div><span class="th-vast">VAST</span></div>';
    f.blokken.forEach(function (b, i) {
      h += '<div class="th-er" data-blok="' + b.id + '"><input type="checkbox" id="thB_' + b.id + '" ' + (b.aan ? 'checked ' : '') + 'onchange="PLThuis._blok(\'' + b.id + '\',this.checked)">' +
        '<label class="tx" for="thB_' + b.id + '"><b>' + esc(BLOKKEN[b.id].naam) + '</b><small>' + esc(BLOKKEN[b.id].uitleg) + '</small></label>' + knopOpNeer('blok', i, f.blokken.length) + '</div>';
    });
    h += '<div class="th-sk">Snel naar · ' + f.snel.length + ' van hoogstens ' + SNEL_MAX + '</div>';
    f.snel.forEach(function (id, i) {
      h += '<div class="th-er" data-snel="' + id + '"><input type="checkbox" id="thS_' + id + '" checked onchange="PLThuis._snel(\'' + id + '\',this.checked)"><label class="tx" for="thS_' + id + '"><b>' + esc(SNEL[id].t) + '</b><small>' + esc(SNEL[id].d) + '</small></label>' + knopOpNeer('snel', i, f.snel.length) + '</div>';
    });
    Object.keys(SNEL).filter(function (id) { return f.snel.indexOf(id) < 0 && (!SNEL[id].klant || isKlant()); }).forEach(function (id) {
      h += '<div class="th-er" data-snel="' + id + '"><input type="checkbox" id="thS_' + id + '" onchange="PLThuis._snel(\'' + id + '\',this.checked)"' + (f.snel.length >= SNEL_MAX ? ' disabled' : '') + '><label class="tx" for="thS_' + id + '"><b>' + esc(SNEL[id].t) + '</b><small>' + esc(SNEL[id].d) + '</small></label></div>';
    });
    h += '<div class="th-sub" style="color:var(--tx3);font-size:12.5px">Wat je verbergt blijft bereikbaar via Meer en de wizard.' + (isKlant() ? ' Je indeling staat in je account en geldt op elk toestel.' : ' Je indeling staat op dit toestel.') + '</div>';
    h += '<button type="button" class="th-bewaar" onclick="PLThuis._bewaar()">Bewaren</button></div>';
    ov.innerHTML = h;
  }
  async function bewaar() {
    if (!_form) return;
    var l = naarLijst(_form);
    try { localStorage.setItem(LOKAAL, JSON.stringify({ u: wie(), l: l })); } catch (e) { console.warn('PLThuis: indeling niet op dit toestel bewaard', e); }
    var waar = 'op dit toestel';
    if (isKlant() && window.PLVoorkeur && PLVoorkeur.zetEen) {
      try { await PLVoorkeur.zetEen('thuis', l); waar = 'in je account'; }
      catch (e) { console.warn('PLThuis: indeling niet in het account bewaard', e); melding('⚠️ Niet in je account bewaard (' + (e && e.message || e) + ') — wel op dit toestel'); }
    }
    try { if (typeof logUsage === 'function') logUsage('thuis_indeling', l.join(',')); } catch (e) { console.warn('PLThuis: logUsage', e); }
    sluit(); _sleutel = ''; teken();
    melding('✓ Startscherm bewaard ' + waar);
  }

  function start() {
    teken();
    var tik = function () {
      try { var ws = el('welcomeScreen'); if (ws && !ws.classList.contains('hidden')) teken(); }
      catch (e) { console.warn('PLThuis: verversen mislukt', e); }
    };
    // Alleen in beeld (PLRust, #691).
    if (window.PLRust) PLRust.elke(1000, tik, 'startscherm'); else setInterval(tik, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.PLThuis = {
    teken: function () { _sleutel = ''; teken(); },
    verbind: verbind,
    aanpassen: aanpassen,
    auto: function () {
      try {
        var v = window.PLGarage && PLGarage.actief && PLGarage.actief();
        if (v && isKlant()) PLGarage.open(v.id);
        else if (isVerbonden() || isDemo()) PLNav.tab('live');
        else if (window.PLZonder) PLZonder.kenteken();
      } catch (e) { console.warn('PLThuis: auto opent niet', e); }
    },
    pil: function () { if (isVerbonden() || isDemo()) { try { obdChipTap(); } catch (e) { console.warn('PLThuis: verbindingspaneel', e); } } else verbind(); },
    favorieten: function () { var b = el('favBtn'); if (b) b.click(); },
    volgende: function () { _nuI = _nuLijst.length ? (_nuI + 1) % _nuLijst.length : 0; _sleutel = ''; teken(); },
    nuActie: nuActie,
    _sluit: sluit,
    _bewaar: bewaar,
    _basis: function (b) { if (!BASIS[b]) return; _form = indeling(['p:' + b], b); tekenForm(); },
    _blok: function (id, aan) { _form.blokken.forEach(function (b) { if (b.id === id) b.aan = !!aan; }); tekenForm(); },
    _snel: function (id, aan) {
      var i = _form.snel.indexOf(id);
      if (aan && i < 0 && _form.snel.length < SNEL_MAX) _form.snel.push(id);
      else if (!aan && i >= 0) _form.snel.splice(i, 1);
      tekenForm();
    },
    _schuif: function (soort, i, stap) {
      if (soort === 'blok') _form.blokken = verschuif(_form.blokken, i, stap);
      else _form.snel = verschuif(_form.snel, i, stap);
      tekenForm();
    },
    _kern: { BLOKKEN: BLOKKEN, SNEL: SNEL, SNEL_MAX: SNEL_MAX, BASIS: BASIS, PATROON: PATROON, toestand: toestand, hoofdknop: hoofdknop, chips: chips, ringKleur: ringKleur, kandidaten: kandidaten, indeling: indeling, naarLijst: naarLijst, verschuif: verschuif, miniKnoppen: miniKnoppen }
  };
})();
