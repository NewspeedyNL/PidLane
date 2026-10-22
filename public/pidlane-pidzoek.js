// pidlane-pidzoek.js — PLPidZoek: zoek zoveel mogelijk sensoren voor deze auto (22-10-2026)
//
// Voor de Mazda kostte het weken om de eigen PIDs bij elkaar te krijgen: per
// code testen, kijken of het getal klopt, en dan toevoegen. Dit doet dat in
// één ronde: alle kandidaten uit de bibliotheek (OBDb + wat anderen met dit
// model deelden) één keer opvragen, de uitkomst toetsen op een plausibele
// waarde, en alleen wat klopt voorstellen. De indeling (weergave, analyse,
// dubbel) is die van het Sensoren-tabblad: PLGarage deelt in met
// sensGroepen(), dit bestand weet niets van de DOM.
//
// Puur en los te toetsen: plausibel(), kandidaten(), voorkeus(). zoek() is de
// ronde, met test/stem/stop als functies van buiten (PLEigen.test en de
// bibliotheekstem in de app, een nep-ECU in test-pidzoek.js).
(function () {
  'use strict';

  /* Grenzen per eenheid: ruim genoeg voor elke echte auto, krap genoeg om een
     verkeerd gelezen byte te vangen. Een hogedruk-railsensor in bar haalt
     2500 (diesel), een HV-accu 900 V; een koelwater van 600 °C bestaat niet. */
  const GRENS = {
    '°C': [-40, 250], '%': [-100, 101], 'V': [0, 1000], 'A': [-2000, 2000],
    'bar': [-1, 3000], 'psi': [-15, 45000], 'kPa': [-100, 300000],
    'km/h': [0, 350], 'rpm': [0, 12000], 'km': [0, 2000000], 'm': [0, 2e9],
    'Nm': [-1000, 3000], 'l': [0, 300], '°': [-720, 720], 'h': [0, 1e6], 'min': [0, 6e7], 's': [0, 4e9],
    'Ah': [0, 2000], 'kW': [-1000, 1000], 'W': [-1e6, 1e6], 'kWh': [0, 1e6], 'Hz': [0, 1e5], 'Ω': [0, 1e7]
  };
  // Een 12V-accu of laadspanning onder 6 of boven 17 V is een verkeerde formule.
  const LAAG_VOLT = /(12 ?v|battery voltage|accuspanning|generator output|laadspanning)/i;
  const HOOG_VOLT = /(\bhv\b|high.voltage|traction|48 ?v|pack|cell)/i;

  /* Klopt dit antwoord? r is wat PLEigen.test() teruggeeft ({ ok, bytes,
     waarde, eenheid }), c de kandidaat (naam). { ok:true } of { ok:false,
     reden }. Alleen een geldig antwoord komt hier; geen antwoord is geen
     vraag over plausibiliteit. */
  function plausibel(r, c) {
    const bytes = (r && r.bytes) || [];
    const w = r ? r.waarde : null;
    if (!bytes.length) return { ok: false, reden: 'leeg antwoord' };
    if (w === null || w === undefined || typeof w !== 'number' || !isFinite(w)) return { ok: false, reden: 'formule past niet op ' + bytes.length + ' byte(s)' };
    // Alles FF is bij de meeste ECU's "niet beschikbaar", geen meting.
    if (bytes.every(function (b) { return b === 0xFF; })) return { ok: false, reden: 'alleen FF — sensor niet beschikbaar' };
    const u = String((r && r.eenheid) || '').trim();
    const naam = String((c && c.naam) || '');
    // Precies −40 °C is de ondergrens van A−40: een losse of ontbrekende sensor.
    if (u === '°C' && w <= -40) return { ok: false, reden: '−40 °C — de ondergrens, meestal een ontbrekende sensor' };
    if (u === 'V' && LAAG_VOLT.test(naam) && !HOOG_VOLT.test(naam) && (w < 6 || w > 17)) return { ok: false, reden: waarde(w, u) + ' voor een 12V-spanning' };
    const g = GRENS[u];
    if (g && (w < g[0] || w > g[1])) return { ok: false, reden: waarde(w, u) + ' ligt buiten ' + g[0] + '…' + g[1] + ' ' + u };
    if (!g && Math.abs(w) > 1e7) return { ok: false, reden: 'onwaarschijnlijk groot getal' };
    return { ok: true };
  }
  function waarde(w, u) { return String(Math.round(w * 100) / 100).replace('.', ',') + (u ? ' ' + u : ''); }

  function sleutel(c) { return String(c.code || '').toUpperCase() + '@' + String(c.ecu || '').toUpperCase(); }

  /* Wat er getest wordt: de bibliotheek, zonder wat al bij de eigen sensoren
     staat en zonder dubbelen (zelfde code op hetzelfde adres). */
  function kandidaten(bib, eigen) {
    const al = {}, uit = [];
    (eigen || []).forEach(function (e) { al[sleutel(e)] = 1; al[String(e.code || '').toUpperCase() + '@'] = 1; });
    (bib || []).forEach(function (b) {
      if (!b || !b.code) return;
      const k = sleutel(b);
      if (al[k] || al[String(b.code).toUpperCase() + '@']) return;
      al[k] = 1; uit.push(b);
    });
    return uit;
  }

  /* De vinkjes vooraf: de groep weergave op volgorde, zolang er plekken vrij
     zijn. Analyse en dubbel staan uit — daar kiest de klant zelf. groepen is
     de uitvoer van sensGroepen ({ weergave:[{b}], ... }). Geeft sleutels. */
  function voorkeus(groepen, vrij) {
    const uit = [];
    ((groepen && groepen.weergave) || []).forEach(function (r) { if (uit.length < vrij) uit.push(sleutel(r.b)); });
    return uit;
  }

  /* De ronde. o.test(c) → Promise van PLEigen.test-uitvoer; o.stem(c, uitkomst)
     optioneel; o.stop() → true om te stoppen; o.voortgang(staat). Een test die
     zegt dat de auto niet meer verbonden is, stopt de ronde. */
  let _laatste = null;
  async function zoek(lijst, o) {
    o = o || {};
    const st = { gedaan: 0, totaal: (lijst || []).length, past: [], vreemd: [], nee: [], fout: [], gestopt: false, afgebroken: '' };
    for (const c of (lijst || [])) {
      if (o.stop && o.stop()) { st.gestopt = true; break; }
      let r;
      try { r = await o.test(c); }
      catch (x) { r = { ok: false, fout: (x && x.message) || String(x) }; }
      r = r || { ok: false, fout: 'geen uitkomst' };
      st.gedaan++;
      if (r.ok) {
        const p = plausibel(r, c);
        if (p.ok) st.past.push({ c: c, waarde: r.waarde, eenheid: r.eenheid || '' });
        else st.vreemd.push({ c: c, reden: p.reden });
        // Alleen een plausibele waarde is een "werkt" voor anderen met dit model.
        if (p.ok && o.stem) await stem(o, c, 'werkt');
      } else if (/weigert|Geen antwoord/.test(r.fout || '')) {
        st.nee.push({ c: c, reden: r.fout });
        if (o.stem) await stem(o, c, 'werkt_niet');
      } else {
        st.fout.push({ c: c, reden: r.fout || 'onbekende fout' });
        if (/Niet verbonden|Busfuncties ontbreken/.test(r.fout || '')) { st.afgebroken = r.fout; break; }
      }
      if (o.voortgang) {
        try { o.voortgang(st); } catch (x) { console.warn('PLPidZoek: voortgang', x); }
      }
    }
    _laatste = st;   // voor de survey V2 (stap 7 van #541)
    return st;
  }
  async function stem(o, c, uitkomst) {
    try { await o.stem(c, uitkomst); }
    catch (x) { console.warn('PLPidZoek: stem voor ' + c.code + ' niet bewaard', x); }
  }

  window.PLPidZoek = { GRENS: GRENS, plausibel: plausibel, kandidaten: kandidaten, voorkeus: voorkeus, zoek: zoek, sleutel: sleutel, laatste: function () { return _laatste; } };
})();
