// ═══════════════════════════════════════════════════════════════════════════
// PIDLANE-GPS.JS — GPS-gekoppelde ritlogging
// ---------------------------------------------------------------------------
// Doel : elke meting en elke monitorgebeurtenis van een plaats voorzien, zodat
//        je achteraf kunt zien WAAR een storing optrad (helling, snelweg,
//        stad, koude start op de oprit). Levert daarnaast twee dingen op die
//        een garage direct kan gebruiken:
//          1. echte ritafstand en snelheidsprofiel, los van de kilometerteller
//          2. vergelijking GPS-snelheid tegen OBD-snelheid → wijst op afwijkende
//             bandenmaat, verkeerde tandwielverhouding of een defecte sensor
//
// PRIVACY (AVG)
//   Locatie van een bedrijfsvoertuig is persoonsgegeven zodra het aan een
//   bestuurder te koppelen is. Deze module is daarom standaard UIT en vraagt
//   expliciet toestemming. De bewaartermijn is instelbaar en oude punten
//   worden automatisch opgeruimd. Bij structurele inzet in een wagenpark met
//   werknemers spelen er ook medezeggenschapsregels; ik ben geen jurist, dus
//   laat dat toetsen voor je het bij een klant aanzet.
//
// Laadvolgorde: na pidlane-data.js, voor pidlane-monitor.js
// ═══════════════════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // ═══ CONFIGURATIE ════════════════════════════════════════════════════════

  var CFG = {
    minIntervalMs: 1000,      // niet vaker dan 1 punt per seconde
    minVerplaatsingM: 5,      // stilstand levert geen nieuwe punten op
    maxPunten: 20000,         // ringbuffer (~5,5 uur bij 1 punt/s)
    bewaarDagen: 30,          // ouder wordt bij elke start opgeruimd
    hogeNauwkeurigheid: true,
    timeoutMs: 15000,
    maxAgeMs: 2000,
    slechteFixM: 50,          // punten slechter dan dit markeren we als onbetrouwbaar
    opslagSleutel: 'pl_gps_toestemming'
  };

  // ═══ STATE ═══════════════════════════════════════════════════════════════

  var punten = [];          // { t, lat, lon, alt, spd (m/s), acc, hdg, slecht }
  var watchId = null;
  var laatstePunt = null;
  var toestemming = null;   // null = nog niet gevraagd, true/false = keuze
  var autoModus = false;

  // ═══ HULPFUNCTIES ════════════════════════════════════════════════════════

  function nu() { return Date.now(); }

  function leesToestemming() {
    try {
      var v = global.localStorage && global.localStorage.getItem(CFG.opslagSleutel);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (e) { /* private mode / geen storage */ }
    return null;
  }

  function schrijfToestemming(ja) {
    try {
      if (global.localStorage) global.localStorage.setItem(CFG.opslagSleutel, ja ? '1' : '0');
    } catch (e) { /* stil */ }
  }

  // Haversine in meters
  function afstandM(a, b) {
    if (!a || !b) return 0;
    var R = 6371000;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLon = (b.lon - a.lon) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180;
    var la2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function opschonen() {
    var grens = nu() - CFG.bewaarDagen * 24 * 3600 * 1000;
    var i = 0;
    while (i < punten.length && punten[i].t < grens) i++;
    if (i > 0) punten.splice(0, i);
  }

  // ═══ OPNAME ══════════════════════════════════════════════════════════════

  function verwerkFix(pos) {
    if (!pos || !pos.coords) return;
    var c = pos.coords;
    var t = pos.timestamp || nu();

    if (laatstePunt) {
      if ((t - laatstePunt.t) < CFG.minIntervalMs) return;
      var d = afstandM(laatstePunt, { lat: c.latitude, lon: c.longitude });
      // Bij stilstand geen punten stapelen, tenzij er lang niets is vastgelegd
      if (d < CFG.minVerplaatsingM && (t - laatstePunt.t) < 30000) return;
    }

    var p = {
      t: t,
      lat: c.latitude,
      lon: c.longitude,
      alt: (typeof c.altitude === 'number') ? c.altitude : null,
      spd: (typeof c.speed === 'number' && c.speed >= 0) ? c.speed : null,  // m/s
      acc: (typeof c.accuracy === 'number') ? c.accuracy : null,
      hdg: (typeof c.heading === 'number' && !isNaN(c.heading)) ? c.heading : null,
      slecht: (typeof c.accuracy === 'number' && c.accuracy > CFG.slechteFixM)
    };

    punten.push(p);
    laatstePunt = p;
    if (punten.length > CFG.maxPunten) punten.splice(0, punten.length - CFG.maxPunten);

    try {
      global.dispatchEvent(new CustomEvent('pl:gps-punt', { detail: p }));
    } catch (e) { /* oudere WebView */ }
  }

  function fixFout(err) {
    if (global.console) {
      console.warn('[PLGps] locatiefout:', err && err.message, '(code', err && err.code, ')');
    }
    try {
      global.dispatchEvent(new CustomEvent('pl:gps-fout', { detail: { code: err && err.code, bericht: err && err.message } }));
    } catch (e) { /* stil */ }
  }

  // ═══ PUBLIEKE API ════════════════════════════════════════════════════════

  var PLGps = {

    beschikbaar: function () {
      return !!(global.navigator && global.navigator.geolocation);
    },

    heeftToestemming: function () {
      if (toestemming === null) toestemming = leesToestemming();
      return toestemming === true;
    },

    /**
     * Toestemming vastleggen. Roep dit aan vanuit je instellingen-toggle,
     * niet automatisch — de gebruiker moet een bewuste keuze maken.
     */
    zetToestemming: function (ja) {
      toestemming = !!ja;
      schrijfToestemming(toestemming);
      if (!toestemming) PLGps.stop();
      return toestemming;
    },

    aan: function () { return watchId !== null; },

    /** Start opname. Geeft false terug als het niet mag of niet kan. */
    start: function () {
      if (!PLGps.beschikbaar()) {
        try { if (typeof btDiag === 'function') btDiag('GPS: geolocation niet beschikbaar', 'warn'); } catch (e) {}
        return false;
      }
      if (!PLGps.heeftToestemming()) {
        try { if (typeof btDiag === 'function') btDiag('GPS: geen toestemming — niet gestart', 'info'); } catch (e) {}
        return false;
      }
      if (watchId !== null) return true;

      opschonen();
      watchId = global.navigator.geolocation.watchPosition(verwerkFix, fixFout, {
        enableHighAccuracy: CFG.hogeNauwkeurigheid,
        timeout: CFG.timeoutMs,
        maximumAge: CFG.maxAgeMs
      });
      return true;
    },

    stop: function () {
      if (watchId !== null && global.navigator && global.navigator.geolocation) {
        global.navigator.geolocation.clearWatch(watchId);
      }
      watchId = null;
      laatstePunt = null;
    },

    /**
     * Koppel opname aan de rijstatus van de achtergrondmonitor: rijden = aan,
     * langdurig stil = uit. Scheelt accu en levert schonere ritten op.
     */
    autoVolgRijstatus: function (aanUit) {
      autoModus = (aanUit !== false);
      return autoModus;
    },

    // ── Bevragen ───────────────────────────────────────────────────────────

    /** Dichtstbijzijnde fix bij een tijdstip, binnen tolerantie (ms). */
    at: function (ts, tolMs) {
      tolMs = tolMs || 15000;
      var best = null, bestD = Infinity;
      for (var i = punten.length - 1; i >= 0; i--) {
        var d = Math.abs(punten[i].t - ts);
        if (d < bestD) { bestD = d; best = punten[i]; }
        if (punten[i].t < ts - tolMs) break;
      }
      return (best && bestD <= tolMs) ? best : null;
    },

    /** Alle punten in een tijdvenster. */
    segment: function (t0, t1) {
      return punten.filter(function (p) { return p.t >= t0 && p.t <= t1; });
    },

    aantal: function () { return punten.length; },

    /**
     * Plak locatie aan een gebeurtenis van PLMon/PLWatchers.
     * Muteert het object en geeft het terug.
     */
    stempel: function (evt, tsVeld) {
      if (!evt) return evt;
      var ts = evt[tsVeld || 't'] || evt.tijd || evt.timestamp || nu();
      var p = PLGps.at(ts);
      if (p) {
        evt.gps = {
          lat: p.lat, lon: p.lon,
          spd: p.spd, acc: p.acc,
          slecht: p.slecht
        };
      }
      return evt;
    },

    // ── Afgeleide waarden ──────────────────────────────────────────────────

    /** Statistiek over een rit: afstand, duur, snelheden, hoogteverschil. */
    ritStats: function (t0, t1) {
      var seg = PLGps.segment(t0, t1).filter(function (p) { return !p.slecht; });
      if (seg.length < 2) return null;

      var afstand = 0, maxSpd = 0, somSpd = 0, nSpd = 0;
      var minAlt = null, maxAlt = null, stijging = 0;

      for (var i = 1; i < seg.length; i++) {
        afstand += afstandM(seg[i - 1], seg[i]);
        if (seg[i].spd != null) {
          if (seg[i].spd > maxSpd) maxSpd = seg[i].spd;
          somSpd += seg[i].spd; nSpd++;
        }
        if (seg[i].alt != null) {
          if (minAlt === null || seg[i].alt < minAlt) minAlt = seg[i].alt;
          if (maxAlt === null || seg[i].alt > maxAlt) maxAlt = seg[i].alt;
          if (seg[i - 1].alt != null && seg[i].alt > seg[i - 1].alt) {
            stijging += (seg[i].alt - seg[i - 1].alt);
          }
        }
      }

      var duurMs = seg[seg.length - 1].t - seg[0].t;
      return {
        punten: seg.length,
        afstandKm: Math.round(afstand / 10) / 100,
        duurMin: Math.round(duurMs / 60000 * 10) / 10,
        maxKmh: Math.round(maxSpd * 3.6),
        gemKmh: nSpd ? Math.round((somSpd / nSpd) * 3.6) : null,
        hoogteMin: minAlt, hoogteMax: maxAlt,
        totaleStijgingM: Math.round(stijging)
      };
    },

    /**
     * Vergelijk GPS-snelheid met OBD-snelheid (PID 0x0D).
     * Structurele afwijking wijst op afwijkende bandenmaat, aangepaste
     * eindoverbrenging of een sensorprobleem. Nederlandse auto's mogen
     * volgens de EU-regels hoger aanwijzen dan de werkelijke snelheid,
     * nooit lager — een negatieve afwijking is dus opvallender.
     *
     * @param {Array} obdReeks  [{ t: ms, kmh: number }, ...]
     * @returns {object|null}   { n, medianeAfwijkingPct, richting, opmerking }
     */
    vergelijkMetObd: function (obdReeks) {
      if (!obdReeks || !obdReeks.length) return null;
      var paren = [];

      obdReeks.forEach(function (o) {
        if (o == null || typeof o.kmh !== 'number' || o.kmh < 30) return; // laag = te veel ruis
        var p = PLGps.at(o.t, 3000);
        if (!p || p.spd == null || p.slecht) return;
        var gpsKmh = p.spd * 3.6;
        if (gpsKmh < 25) return;
        paren.push(((o.kmh - gpsKmh) / gpsKmh) * 100);
      });

      if (paren.length < 15) return null; // te weinig data voor een uitspraak

      paren.sort(function (a, b) { return a - b; });
      var mid = Math.floor(paren.length / 2);
      var mediaan = paren.length % 2 ? paren[mid] : (paren[mid - 1] + paren[mid]) / 2;
      var afgerond = Math.round(mediaan * 10) / 10;

      var opmerking;
      if (afgerond < -1) {
        opmerking = 'Teller wijst LAGER aan dan werkelijk — dit hoort wettelijk niet te kunnen. ' +
                    'Denk aan grotere banden dan af fabriek, of een verkeerd geconfigureerde ECU.';
      } else if (afgerond > 10) {
        opmerking = 'Teller wijst fors hoger aan dan werkelijk. Denk aan kleinere banden ' +
                    'of een afwijkende eindoverbrenging.';
      } else if (afgerond >= 0 && afgerond <= 8) {
        opmerking = 'Afwijking valt binnen wat normaal is voor een fabrieksteller.';
      } else {
        opmerking = 'Lichte afwijking, waarschijnlijk bandenslijtage of -maat.';
      }

      return {
        n: paren.length,
        medianeAfwijkingPct: afgerond,
        richting: afgerond > 0 ? 'teller hoger dan GPS' : 'teller lager dan GPS',
        opmerking: opmerking
      };
    },

    // ── Export ─────────────────────────────────────────────────────────────

    toGeoJSON: function (t0, t1) {
      var seg = (t0 || t1) ? PLGps.segment(t0 || 0, t1 || nu()) : punten;
      return {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { bron: 'PidLane', punten: seg.length },
          geometry: {
            type: 'LineString',
            coordinates: seg.map(function (p) {
              return p.alt != null ? [p.lon, p.lat, p.alt] : [p.lon, p.lat];
            })
          }
        }]
      };
    },

    toGPX: function (t0, t1, naam) {
      var seg = (t0 || t1) ? PLGps.segment(t0 || 0, t1 || nu()) : punten;
      var x = '<?xml version="1.0" encoding="UTF-8"?>\n';
      x += '<gpx version="1.1" creator="PidLane" xmlns="http://www.topografix.com/GPX/1/1">\n';
      x += '<trk><name>' + String(naam || 'PidLane rit').replace(/[<>&]/g, '') + '</name><trkseg>\n';
      seg.forEach(function (p) {
        x += '<trkpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lon.toFixed(6) + '">';
        if (p.alt != null) x += '<ele>' + p.alt.toFixed(1) + '</ele>';
        x += '<time>' + new Date(p.t).toISOString() + '</time>';
        x += '</trkpt>\n';
      });
      x += '</trkseg></trk></gpx>\n';
      return x;
    },

    /** Alles wissen — bv. bij het afsluiten van een klantopdracht. */
    wis: function () { punten = []; laatstePunt = null; },

    cfg: CFG
  };

  // ═══ AUTO-INHAAK OP RIJSTATUS ════════════════════════════════════════════
  // PLMon bepaalt al of er gereden wordt. Vuurt die een event af, dan volgen
  // we mee. Zo niet, dan gebruik je PLGps.start()/stop() handmatig.

  // ── Inhaken op de bestaande ritanalyse ────────────────────────────────
  // pidlane-rit.js roept startRitAnalyse()/stopRitAnalyse() aan. In plaats
  // van daar regels in te plakken wikkelen we ze hier in: de ritmodule blijft
  // ongewijzigd en GPS is puur additief. Valt stil terug als de functies er
  // (nog) niet zijn — bv. wanneer dit bestand los getest wordt.
  function _omwikkelRit() {
    if (typeof global.startRitAnalyse === 'function' && !global.startRitAnalyse._plGps) {
      var _start = global.startRitAnalyse;
      var w1 = function () {
        if (autoModus) { try { PLGps.start(); } catch (e) {} }
        return _start.apply(this, arguments);
      };
      w1._plGps = true;
      global.startRitAnalyse = w1;
    }
    if (typeof global.stopRitAnalyse === 'function' && !global.stopRitAnalyse._plGps) {
      var _stop = global.stopRitAnalyse;
      var w2 = function () {
        if (autoModus) { try { PLGps.stop(); } catch (e) {} }
        return _stop.apply(this, arguments);
      };
      w2._plGps = true;
      global.stopRitAnalyse = w2;
    }
  }
  if (global.addEventListener) {
    global.addEventListener('load', _omwikkelRit);
    setTimeout(_omwikkelRit, 3000);   // ook als 'load' al voorbij was

    // Elke monitorgebeurtenis automatisch van een positie voorzien
    global.addEventListener('pl:monitor-event', function (ev) {
      if (ev && ev.detail) PLGps.stempel(ev.detail);
    });
  }

  global.PLGps = PLGps;

})(typeof window !== 'undefined' ? window : this);
