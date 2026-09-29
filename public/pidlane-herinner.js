/* ═══════════════════════════════════════════════════════════════════
   pidlane-herinner.js — PLHerinner: APK en onderhoud als herinnering
   ───────────────────────────────────────────────────────────────────
   WAAROM DIT BESTAAT (29-09-2026)

   De app wist de APK-datum al: van "Dit is mijn auto" (PLZonder, uit het
   RDW) en van elk voertuig in Mijn voertuigen (PLGarage, apk_tot en
   onderhoud_datum). Hij zei het alleen als je de app opende — en de reden
   om een APK-herinnering te willen is juist dat je de app dan níét opent.

   Dit bestand plant op het toestel een melding 30 dagen, 7 dagen en op de
   dag zelf, om 09:00. Via @capacitor/local-notifications: de melding komt
   ook als de app dicht is en na een herstart van de telefoon. Niets gaat
   via een server; er is geen push-dienst en geen account voor nodig.

   KEUZES
   • Opt-in. Een meldingsvraag uit het niets is precies wat mensen wegtikken.
     De vraag komt pas als iemand zelf op "Herinner me" tikt.
   • Niet exact. De plugin brengt SCHEDULE_EXACT_ALARM mee; build-apk.yml
     haalt die er met tools:node="remove" weer uit. Play staat hem alleen toe
     voor wekker- en agenda-apps, en een APK-melding die om 09:07 komt in
     plaats van 09:00 is geen verlies.
   • Niet in de demo. De zandbak houdt localStorage en het net binnen, maar
     een ingeplande Android-melding staat daarbuiten. Daarom weigert deze
     module zelf in de demo, en haalt hij bij het stoppen niets weg dat hij
     niet zelf plande.
   • Zonder de plugin (de browser, of een oude APK) valt hij terug op een
     melding in de app: één keer per dag per punt, alleen als het binnen 30
     dagen valt. Wat Mijn voertuigen daar al zelf over zegt (apkMelding),
     zegt deze module niet nog eens.

   PUUR EN NIET PUUR. punten(), plan(), binnenkort(), meldId() en
   tekstVoor() zijn puur; test-herinner.js toetst ze met vm. De rest raakt
   de plugin, localStorage of de DOM.

   Laadvolgorde: ná pidlane-zonder.js (leest pl_zonder_mijn) en
   pidlane-garage.js. Gebruikt beide pas bij het aanroepen.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var OPSLAG = { aan: 'pl_herinner', ids: 'pl_herinner_ids', gezien: 'pl_herinner_gezien' };
  var TREDEN = [30, 7, 0];     // dagen vooraf
  var UUR = 9;                 // 09:00 lokale tijd
  var MAX = 60;                // Android houdt er per app een paar honderd vast; ruim eronder blijven

  // ════════════════════════════════════════════════════════════════
  //  PURE FUNCTIES
  // ════════════════════════════════════════════════════════════════

  function datum8(x) { var c = String(x || '').replace(/\D/g, '').slice(0, 8); return c.length === 8 ? c : null; }
  function kent(k) { return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function datumNl(d8) { return d8.slice(6, 8) + '-' + d8.slice(4, 6) + '-' + d8.slice(0, 4); }

  /* Alle data waar een herinnering bij hoort, uit de twee bronnen. `mijn` =
     pl_zonder_mijn ({ kent, keuring, merk, model }), `voertuigen` = de
     actieve voertuigen uit Mijn voertuigen. Hetzelfde kenteken telt één keer;
     het voertuig uit Mijn voertuigen wint (dat heeft de klant zelf bijgehouden). */
  function punten(mijn, voertuigen) {
    var uit = [], gehad = {};
    (voertuigen || []).forEach(function (v) {
      if (!v || v.status !== 'actief') return;
      var naam = v.naam || [v.merk, v.model].filter(Boolean).join(' ') || 'Je voertuig';
      var k = kent(v.kenteken), sl = k || ('v' + v.id);
      var apk = datum8(v.apk_tot), ond = datum8(v.onderhoud_datum);
      if (apk) uit.push({ soort: 'apk', sleutel: 'apk:' + sl, naam: naam, kenteken: k, datum: apk, bron: 'garage' });
      if (ond) uit.push({ soort: 'onderhoud', sleutel: 'ond:' + sl, naam: naam, kenteken: k, datum: ond, bron: 'garage' });
      if (k) gehad[k] = true;
    });
    if (mijn && mijn.kent && datum8(mijn.keuring) && !gehad[kent(mijn.kent)]) {
      uit.push({ soort: 'apk', sleutel: 'apk:' + kent(mijn.kent), naam: [mijn.merk, mijn.model].filter(Boolean).join(' ') || kent(mijn.kent),
        kenteken: kent(mijn.kent), datum: datum8(mijn.keuring), bron: 'mijn' });
    }
    return uit;
  }

  /* Een vast getal per herinnering: dezelfde sleutel en trede geven altijd
     hetzelfde id, zodat opnieuw plannen overschrijft in plaats van verdubbelt.
     Android wil een positief 32-bit getal. */
  function meldId(sleutel, trede) {
    var s = sleutel + '#' + trede, h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 1) || 1;
  }

  function tekstVoor(p, trede) {
    var wat = p.soort === 'apk' ? 'APK' : 'Onderhoud';
    var wie = p.naam + (p.kenteken ? ' (' + p.kenteken + ')' : '');
    var wanneer = trede === 0 ? (p.soort === 'apk' ? 'verloopt vandaag' : 'staat voor vandaag gepland')
      : trede === 7 ? (p.soort === 'apk' ? 'verloopt over een week' : 'over een week')
      : (p.soort === 'apk' ? 'verloopt over ' + trede + ' dagen' : 'over ' + trede + ' dagen');
    var wat2 = p.soort === 'apk'
      ? (trede === 0 ? 'Rijden zonder geldige APK levert een boete op.' : 'Plan op tijd een afspraak — tot twee maanden vooraf keuren kost je geen dag.')
      : 'Op tijd onderhoud houdt je onderhoudshistorie compleet.';
    return { titel: wat + ' ' + wanneer + ' — ' + wie, tekst: 'Geldig tot ' + datumNl(p.datum) + '. ' + wat2 };
  }

  /* Wat er ingepland moet worden: per punt de treden die nog in de toekomst
     liggen, om UUR uur lokale tijd. Gesorteerd, hoogstens MAX. */
  function plan(pts, nu) {
    var uit = [];
    (pts || []).forEach(function (p) {
      TREDEN.forEach(function (t) {
        var d = new Date(+p.datum.slice(0, 4), +p.datum.slice(4, 6) - 1, +p.datum.slice(6, 8) - t, UUR, 0, 0, 0);
        if (isNaN(d) || d.getTime() <= nu) return;
        var tk = tekstVoor(p, t);
        uit.push({ id: meldId(p.sleutel, t), at: d.getTime(), titel: tk.titel, tekst: tk.tekst, sleutel: p.sleutel, trede: t });
      });
    });
    uit.sort(function (a, b) { return a.at - b.at; });
    return uit.slice(0, MAX);
  }

  /* Voor de melding in de app: wat binnen 30 dagen valt of al verlopen is.
     `dagen` < 0 = verlopen. */
  function binnenkort(pts, nu) {
    var n = new Date(nu); n.setHours(0, 0, 0, 0);
    return (pts || []).map(function (p) {
      var d = new Date(+p.datum.slice(0, 4), +p.datum.slice(4, 6) - 1, +p.datum.slice(6, 8));
      return Object.assign({}, p, { dagen: Math.round((d - n) / 864e5) });
    }).filter(function (p) { return p.dagen <= 30 && p.dagen >= -60; });
  }

  // ════════════════════════════════════════════════════════════════
  //  TOESTAND
  // ════════════════════════════════════════════════════════════════
  function lees(k, std) {
    try { var s = localStorage.getItem(k); return s == null ? std : JSON.parse(s); }
    catch (e) { console.warn('PLHerinner: opslag ' + k + ' onleesbaar', e); return std; }
  }
  function schrijf(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { console.warn('PLHerinner: opslag ' + k + ' niet te schrijven', e); }
  }
  function isDemo() { try { return typeof demoMode !== 'undefined' && !!demoMode; } catch (e) { console.warn('PLHerinner: demoMode onleesbaar', e); return false; } }
  function melding(t, ms) { try { if (typeof showToast === 'function') showToast(t, ms); } catch (e) { console.warn('PLHerinner: melding', e); } }
  function plugin() { try { var C = window.Capacitor; return (C && C.Plugins && C.Plugins.LocalNotifications) || null; } catch (e) { return null; } }
  function aan() { return lees(OPSLAG.aan, false) === true; }

  function huidigePunten() {
    var mijn = lees('pl_zonder_mijn', null), vt = [];
    try {
      var st = window.PLGarage && PLGarage.staat ? PLGarage.staat() : null;
      var klant = window.PLKlant && PLKlant.isKlant();
      if (klant && st && st.stand && st.stand.akkoord) vt = st.stand.voertuigen || [];
    } catch (e) { console.warn('PLHerinner: Mijn voertuigen onleesbaar — alleen je eigen kenteken telt mee', e); }
    return punten(mijn, vt);
  }

  // ════════════════════════════════════════════════════════════════
  //  PLANNEN
  // ════════════════════════════════════════════════════════════════
  var _sig = null, _bezig = false;

  async function synchroniseer(forceer) {
    if (isDemo() || _bezig) return { gedaan: false, reden: isDemo() ? 'demo' : 'bezig' };
    var LN = plugin();
    var pts = aan() ? huidigePunten() : [];
    var p = plan(pts, Date.now());
    var sig = JSON.stringify(p.map(function (x) { return [x.id, x.at]; }));
    if (!forceer && sig === _sig) return { gedaan: false, reden: 'ongewijzigd' };
    if (!LN) { _sig = sig; return { gedaan: false, reden: 'geen plugin', aantal: p.length }; }
    _bezig = true;
    try {
      var oud = lees(OPSLAG.ids, []);
      if (oud.length) await LN.cancel({ notifications: oud.map(function (id) { return { id: id }; }) });
      var nieuw = [];
      if (p.length) {
        var perm = await LN.checkPermissions();
        if (perm && perm.display === 'granted') {
          await LN.schedule({ notifications: p.map(function (x) {
            return { id: x.id, title: x.titel, body: x.tekst, schedule: { at: new Date(x.at), allowWhileIdle: true }, extra: { sleutel: x.sleutel } };
          }) });
          nieuw = p.map(function (x) { return x.id; });
        } else {
          console.warn('PLHerinner: meldingen staan uit in Android — ' + p.length + ' herinnering(en) niet ingepland; de app meldt ze bij het openen');
        }
      }
      schrijf(OPSLAG.ids, nieuw);
      _sig = sig;
      try { if (typeof btDiag === 'function') btDiag('Herinneringen: ' + nieuw.length + ' ingepland, ' + oud.length + ' oude weggehaald', 'info'); } catch (e) { console.warn('PLHerinner: melding niet gelogd', e); }
      return { gedaan: true, aantal: nieuw.length };
    } catch (e) {
      console.warn('PLHerinner: inplannen mislukt — de app meldt het bij het openen', e);
      return { gedaan: false, reden: String(e && e.message || e) };
    } finally { _bezig = false; }
  }

  /* De knop. Aanzetten vraagt de toestemming van Android (alleen hier). */
  async function zet(opAan) {
    if (isDemo()) { melding('🧪 In de demo worden geen herinneringen ingesteld'); return false; }
    if (!opAan) {
      schrijf(OPSLAG.aan, false);
      await synchroniseer(true);
      melding('🔕 Herinneringen uit');
      teken();
      return true;
    }
    var LN = plugin();
    if (LN) {
      try {
        var p = await LN.checkPermissions();
        if (!p || p.display !== 'granted') p = await LN.requestPermissions();
        if (!p || p.display !== 'granted') melding('Meldingen staan uit voor PidLane in Android. De herinnering komt dan als je de app opent.', 5000);
      } catch (e) { console.warn('PLHerinner: toestemming vragen mislukt', e); }
    }
    schrijf(OPSLAG.aan, true);
    var r = await synchroniseer(true);
    var n = huidigePunten().length;
    melding(n ? '🔔 Herinnering aan — 30 dagen, 7 dagen en op de dag zelf' + (LN ? '' : ' (in de app; de melding op je telefoon werkt in de app uit de Play Store)')
      : '🔔 Herinnering aan — zodra je auto een APK-datum heeft, plant de app hem in', 4200);
    teken();
    return !!r;
  }

  /* Zonder plugin (of zonder toestemming): één keer per dag per punt een
     melding in de app. Wat Mijn voertuigen al zelf meldt, niet nog eens. */
  function inApp() {
    if (!aan() || isDemo()) return;
    var LN = plugin();
    if (LN && lees(OPSLAG.ids, []).length) return;   // de telefoon meldt het al
    var vandaag = new Date().toISOString().slice(0, 10), gezien = lees(OPSLAG.gezien, {});
    binnenkort(huidigePunten(), Date.now()).filter(function (p) { return p.bron === 'mijn'; }).forEach(function (p) {
      if (gezien[p.sleutel] === vandaag) return;
      gezien[p.sleutel] = vandaag;
      melding((p.dagen < 0 ? '⛔ APK verlopen' : '📅 APK over ' + p.dagen + ' dag' + (p.dagen === 1 ? '' : 'en')) + ' — ' + p.naam, 5000);
    });
    schrijf(OPSLAG.gezien, gezien);
  }

  // Een regel voor de kaart op het startscherm (PLZonder tekent hem).
  function regel() {
    var n = huidigePunten().length;
    if (!n) return null;
    return { aan: aan(), aantal: n, plugin: !!plugin() };
  }
  function teken() { try { if (window.PLZonder) PLZonder.teken(true); } catch (e) { console.warn('PLHerinner: kaart niet ververst', e); } }

  function start() {
    setTimeout(function () { synchroniseer(false); inApp(); }, 4000);
    // De bronnen hebben geen event: Mijn voertuigen ververst uit zichzelf, en
    // "Dit is mijn auto" komt uit een ander bestand. synchroniseer() doet
    // niets als het plan niet veranderd is.
    setInterval(function () { synchroniseer(false); }, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.PLHerinner = {
    zet: zet,
    aan: aan,
    synchroniseer: synchroniseer,
    regel: regel,
    // pure kern — voor test-herinner.js
    _kern: { punten: punten, plan: plan, binnenkort: binnenkort, meldId: meldId, tekstVoor: tekstVoor, TREDEN: TREDEN, UUR: UUR }
  };
})();
