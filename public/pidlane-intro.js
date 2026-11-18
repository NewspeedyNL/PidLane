// ══════════════════════════════════════════════════════════════════
// pidlane-intro.js
// DE OPSTART-INTRO — neon rijbaan, logo komt overeind, doorzoom naar login
// (de drie kaarten van 22-10-2026 zijn er op 14-11-2026 weer uit: korter en rustiger)
// ──────────────────────────────────────────────────────────────────
// WAT HET IS
// Bij het openen van de app: donker scherm, een neon rijbaan tekent zich
// naar de horizon, op het verdwijnpunt tekent het logo zich en komt het in
// 3D overeind uit het wegdek, en daarna zoom je dóór het logo heen naar wat
// eronder klaarstaat — het inlogscherm, of de app als de sessie hersteld is.
// Gekozen uit drie voorbeelden op 24-09-2026: variant A ("Lane") met de
// uittrede van variant B ("Signaal").
//
// WAAROM ER WEER EEN INTRO IS, TERWIJL DE VORIGE OP 26-07 WEG MOEST
// De vorige splash hield elke start 3,4 s op. Deze is met opzet anders
// gebouwd, en dat is de reden dat de regels hieronder er staan:
//
//   - hooguit één keer per sessie (sessionStorage). Een koude start van de
//     APK is een nieuwe sessie, "Nieuwste versie laden" is dat niet;
//   - één tik of toets en hij is weg;
//   - niet bij "minder beweging" in het besturingssysteem;
//   - niet als de opstart zelf al traag was (MAX_WACHT_MS): dan heeft de
//     gebruiker lang genoeg gewacht en komt er niets bovenop;
//   - niet onder automatisering (navigator.webdriver): de browserproeven
//     meten de app, niet de intro. bproef-intro.js start hem daar gericht.
//
// De app laadt er gewoon onder door. De intro speelt pas vanaf
// DOMContentLoaded, dus hij ligt over de opstart heen en niet ernaast.
//
// DE NOODREM
// Het donkere vlak staat al in de HTML, vóór dit script. Loopt dit script
// om welke reden ook niet, dan zou dat vlak de app blijvend afdekken. Daarom
// regelt de CSS het verdwijnen zelf ook (zie pidlane.css): zonder .pli-speel
// is het vlak na 8 s weg, en mét eindigt de laatste animatie onzichtbaar en
// onaanraakbaar. De timer hier ruimt alleen op.
// ══════════════════════════════════════════════════════════════════
window.PLIntro = (function () {
  var SLEUTEL = 'pl_intro_gezien';
  var DUUR_MS = 3100;       // tot en met de doorzoom; zie de tijdlijn in pidlane.css
  var WEG_MS = 240;         // uitfaden na een tik
  var MAX_WACHT_MS = 6000;  // trager dan dit tot DOMContentLoaded: geen intro meer

  var el = null, t0 = 0, timer = null, bezig = false;

  // ── DE TUNNEL (18-11-2026) ──
  // Tot deze datum lag er een CSS-raster onder de rijbaan; naast de tunnel
  // en de aura van Hyperlane zag dat er armoedig uit. Dit is dezelfde
  // tunnel (ringen, radialen, lichtstrepen) en aura in één kleine shader.
  // Een eigen kopie, geen gedeelde: de intro draait vóór elk ander script.
  // Geen WebGL: dan blijft de CSS-achtergrond, zonder raster.
  // M: hoogte van het verdwijnpunt (deel van het scherm, van onder).
  var FS = 'precision mediump float;uniform vec2 R;uniform float T,Z,D,W,M;' +
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'void main(){vec2 q=(gl_FragCoord.xy-vec2(.5*R.x,M*R.y))/R.y;' +
    'vec3 C1=vec3(.35,.78,1.),C2=vec3(.54,.36,1.),c=vec3(0.);' +
    'float r=mix(length(q),max(abs(q.x)*.55,abs(q.y)),.7)+1e-3,a=atan(q.y,q.x)/6.2831853;' +
    'float z=.32/r*(1.+W*1.8)+Z,fog=smoothstep(.02,.45,r);' +
    'float ring=exp(-pow(abs(fract(z)-.5)*(3.+55.*r),2.))*fog;' +
    'float rad=exp(-pow(abs(fract(a*28.)-.5)*r*70.,2.))*fog*.55;' +
    'vec2 cel=vec2(floor(a*56.),floor(z*3.+Z*2.));float sz=fract(z*3.+Z*2.);' +
    'float st=step(.95-W*.12,h(cel))*smoothstep(0.,.7,sz)*smoothstep(1.,.85,sz)*exp(-pow(abs(fract(a*56.)-.5)*r*90.,2.))*fog;' +
    'c+=C1*ring*.8+C2*rad*.6+mix(C2,vec3(1),.4)*st*(2.+W*3.)+C2*.06/(r*r*30.+.25)*(1.+W*3.);' +
    'for(int k=0;k<3;k++){float f=float(k);' +
    'float y=.30-f*.14+.09*sin(q.x*(1.1+f*.4)+T*(.5+f*.15)+f*2.)+.04*sin(q.x*3.1-T*.4+f);' +
    'c+=mix(C1,C2,f*.5)*exp(-pow((q.y-y)*(5.+f*2.),2.))*(.55+.45*sin(q.x*2.3+T*.8+f*1.7))*.35;}' +
    'c*=1.-.35*smoothstep(.6,1.2,length(q));gl_FragColor=vec4(c*D,1.);}';
  // Eén tunnel op een canvas: { teken(T, Z, W, D), weg() } of null zonder WebGL.
  // Gedeeld door de intro en de deur (inloggen en verbinden).
  function bouwTunnel(cv, midden, schaal) {
    var g = null;
    try {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(innerWidth * dpr * schaal)); cv.height = Math.max(1, Math.round(innerHeight * dpr * schaal));
      g = cv.getContext('webgl', { antialias: false, alpha: false });
      if (!g) return null;
      var sh = function (t, src) { var o = g.createShader(t); g.shaderSource(o, src); g.compileShader(o);
        if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(o)); return o; };
      var pr = g.createProgram();
      g.attachShader(pr, sh(g.VERTEX_SHADER, 'attribute vec2 v;void main(){gl_Position=vec4(v,0,1);}'));
      g.attachShader(pr, sh(g.FRAGMENT_SHADER, FS));
      g.linkProgram(pr); g.useProgram(pr);
      g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      g.viewport(0, 0, cv.width, cv.height);
      var U = {}; ['R', 'T', 'Z', 'D', 'W', 'M'].forEach(function (n) { U[n] = g.getUniformLocation(pr, n); });
      g.uniform2f(U.R, cv.width, cv.height); g.uniform1f(U.M, midden);
      return {
        teken: function (T, Z, W, D) {
          g.uniform1f(U.T, T); g.uniform1f(U.Z, Z); g.uniform1f(U.W, W); g.uniform1f(U.D, D);
          g.drawArrays(g.TRIANGLES, 0, 3);
        },
        weg: function () { var lc = g.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); }
      };
    } catch (e) { console.warn('PLIntro: tunnel niet te bouwen — de CSS-achtergrond blijft', e); return null; }
  }
  var tun = null, raf = 0;
  function tunnelOp() {
    var cv = el && el.querySelector('.pli-tunnel');
    tun = cv ? bouwTunnel(cv, .6, .6) : null;
    return !!tun;
  }
  // Puur: de stand van de tunnel op tijd t (s). Rustig in, versnellen naar de
  // doorzoom (2,45 s), dan warp en uitdoven met de rest.
  function tunnelStand(t) {
    var w = Math.max(0, Math.min(1, (t - 2.2) / .5));
    var d = Math.min(1, t / .6) * (1 - Math.max(0, Math.min(1, (t - 2.6) / .45)));
    return { Z: t * .55 + w * w * 2.2, W: w, D: d };
  }
  function tunnelTik(t1) {
    if (!tun || !el) return;
    var t = (t1 - tStart) / 1000, s = tunnelStand(t);
    tun.teken(t, s.Z, s.W, s.D);
    raf = requestAnimationFrame(tunnelTik);
  }
  var tStart = 0;

  // ── DE DEUR: dezelfde tunnel achter inloggen en verbinden (18-11-2026) ──
  // Vervangt het CSS-raster van .hlg (dat blijft als vangnet zonder WebGL).
  // Dit scherm kan uren openstaan (pidlane.css, HYPERLANE-DEUR), dus dezelfde
  // afspraak als daar: hij beweegt hoogstens DEUR_MS per keer dat hij in beeld
  // komt, op halve resolutie en ~30 beelden per seconde, en staat daarna stil
  // op het laatste beeld. Uit beeld of app op de achtergrond: geen beelden.
  // Geen timer: een MutationObserver ziet de vensters open- en dichtgaan.
  var DEUR_MS = 60000, DEUR_FPS_MS = 33;
  // Puur: hoe de deur er na ms bewegen uitziet, en of hij nog beweegt.
  function deurStand(ms, rust) {
    var t = Math.min(ms, DEUR_MS) / 1000;
    return { Z: t * .22, D: Math.min(1, .35 + t / 1.2), beweegt: !rust && ms < DEUR_MS };
  }
  var deur = { tun: null, laag: null, ms: 0, vorig: 0, raf: 0, rust: false };
  function deurZichtbaar() {
    var l = deur.laag;
    return !!l && !document.hidden && l.getClientRects().length > 0;
  }
  function deurTik(t1) {
    deur.raf = 0;
    if (!deur.tun || !deurZichtbaar()) { deur.vorig = 0; return; }
    if (deur.vorig && t1 - deur.vorig < DEUR_FPS_MS) { deur.raf = requestAnimationFrame(deurTik); return; }
    if (deur.vorig) deur.ms += Math.min(100, t1 - deur.vorig);
    deur.vorig = t1;
    var s = deurStand(deur.ms, deur.rust);
    deur.tun.teken(deur.ms / 1000, s.Z, 0, s.D);
    if (s.beweegt) deur.raf = requestAnimationFrame(deurTik);
  }
  function deurWek() {
    if (!deur.tun) return;
    if (!deurZichtbaar()) { deur.vorig = 0; return; }
    if (!deur.raf) { deur.ms = deur.ms >= DEUR_MS ? 0 : deur.ms; deur.vorig = 0; deur.raf = requestAnimationFrame(deurTik); }
  }
  function deurStart() {
    var laag = document.getElementById('lgWaveBg'), hlg = laag && laag.querySelector('.hlg');
    if (!hlg || deur.tun || !window.requestAnimationFrame) return false;
    var cv = document.createElement('canvas');
    cv.className = 'hlg-gl-doek';
    hlg.insertBefore(cv, hlg.firstChild);
    deur.tun = bouwTunnel(cv, .5, .5);
    if (!deur.tun) { cv.remove(); return false; }
    deur.laag = laag;
    hlg.classList.add('hlg-gl');
    try { deur.rust = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { console.warn('PLIntro: prefers-reduced-motion niet leesbaar — de deur beweegt', e); }
    // Onder automatisering één stilstaand beeld, net als de intro die dan niet
    // speelt: headless Chromium tekent WebGL in software, en een bewegende
    // tunnel vertraagde daar de pollus (bproef-antwoordtal, 18-11-2026).
    if (navigator.webdriver) deur.rust = true;
    if (window.MutationObserver) {
      var mo = new MutationObserver(deurWek);
      ['lgWaveBg', 'loginOv', 'connOv'].forEach(function (id) {
        var x = document.getElementById(id); if (x) mo.observe(x, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
      });
    }
    document.addEventListener('visibilitychange', deurWek);
    deurWek();
    return true;
  }

  // Het besluit, los van de omgeving — zodat het in node te toetsen is.
  // Geeft de reden terug waarom hij níét speelt, of '' als hij wél speelt.
  function reden(o) {
    if (o.verminderd) return 'minder beweging';
    if (o.gezien) return 'al getoond deze sessie';
    if (o.webdriver) return 'automatisering';
    if (o.wachtMs > MAX_WACHT_MS) return 'opstart te traag (' + Math.round(o.wachtMs) + ' ms)';
    return '';
  }

  function omgeving() {
    var o = { verminderd: false, gezien: false, webdriver: !!navigator.webdriver, wachtMs: 0 };
    try { o.verminderd = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { console.warn('PLIntro: prefers-reduced-motion niet leesbaar', e); }
    try { o.gezien = sessionStorage.getItem(SLEUTEL) === '1'; }
    catch (e) { console.warn('PLIntro: sessionStorage niet leesbaar — intro speelt gewoon', e); }
    return o;
  }

  function onthoud() {
    try { sessionStorage.setItem(SLEUTEL, '1'); }
    catch (e) { console.warn('PLIntro: sessionStorage niet schrijfbaar — intro kan opnieuw spelen', e); }
  }

  function weg() {
    clearTimeout(timer); timer = null;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    if (tun) { tun.weg(); tun = null; }
    document.removeEventListener('pointerdown', overslaan, true);
    document.removeEventListener('keydown', overslaan, true);
    // Verbergen, niet weghalen: bproef-intro.js speelt hem daarna nog eens
    // met start({forceer:true}). Wat blijft staan is een paar KB aan SVG.
    if (el) { el.hidden = true; el.classList.remove('pli-speel', 'pli-weg', 'pli-gl'); }
    el = null; bezig = false;
  }

  function overslaan(ev) {
    if (!el) return;
    // De tik is voor de intro, niet voor de knop die eronder ligt.
    if (ev && ev.type === 'pointerdown') { ev.preventDefault(); ev.stopPropagation(); }
    clearTimeout(timer);
    el.classList.add('pli-weg');
    timer = setTimeout(weg, WEG_MS);
  }

  function speel() {
    if (!el) return;
    bezig = true;
    onthoud();
    el.classList.add('pli-speel');
    if (window.requestAnimationFrame && tunnelOp()) {
      el.classList.add('pli-gl');
      tStart = performance.now(); raf = requestAnimationFrame(tunnelTik);
    }
    document.addEventListener('pointerdown', overslaan, true);
    document.addEventListener('keydown', overslaan, true);
    timer = setTimeout(weg, DUUR_MS);
  }

  // Aangeroepen direct na de markup in index.html. Beslist meteen of het
  // donkere vlak mag blijven staan, zodat er niets knippert als het niet mag.
  function start(opties) {
    var forceer = !!(opties && opties.forceer);
    el = document.getElementById('plIntro');
    if (!el) return 'geen #plIntro';
    if (bezig) return 'speelt al';
    el.hidden = false;
    t0 = (window.performance && performance.now) ? performance.now() : Date.now();

    var r = forceer ? '' : reden(omgeving());
    if (r) { weg(); return r; }

    var opDcl = function () {
      var nu = (window.performance && performance.now) ? performance.now() : Date.now();
      var r2 = forceer ? '' : reden({ wachtMs: nu - t0 });
      if (r2) { console.info('PLIntro: overgeslagen — ' + r2); weg(); return; }
      speel();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', opDcl, { once: true });
    else opDcl();
    return '';
  }

  // De deur na de opbouw: #lgWaveBg staat in de HTML ná dit script. Op
  // window, niet op document: de luisteraar van de intro zelf moet weg
  // kunnen zonder deze mee te nemen (test-intro.js, blok 2).
  if (document.readyState !== 'loading') deurStart();
  else if (typeof window.addEventListener === 'function') window.addEventListener('DOMContentLoaded', deurStart, { once: true });

  return {
    start: start, reden: reden, overslaan: overslaan, tunnelStand: tunnelStand, deurStand: deurStand, deurStart: deurStart, DEUR_MS: DEUR_MS,
    bezig: function () { return bezig; },
    SLEUTEL: SLEUTEL, DUUR_MS: DUUR_MS, MAX_WACHT_MS: MAX_WACHT_MS
  };
})();
