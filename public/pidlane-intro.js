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
  var FS = 'precision mediump float;uniform vec2 R;uniform float T,Z,D,W;' +
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
    'void main(){vec2 q=(gl_FragCoord.xy-vec2(.5*R.x,.6*R.y))/R.y;' +
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
  var gl = null, glU = null, raf = 0;
  function tunnelOp() {
    var cv = el && el.querySelector('.pli-tunnel');
    if (!cv) return false;
    try {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(innerWidth * dpr * .6); cv.height = Math.round(innerHeight * dpr * .6);
      gl = cv.getContext('webgl', { antialias: false, alpha: false });
      if (!gl) return false;
      var sh = function (t, src) { var o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      var pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 v;void main(){gl_Position=vec4(v,0,1);}'));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr); gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.viewport(0, 0, cv.width, cv.height);
      glU = {}; ['R', 'T', 'Z', 'D', 'W'].forEach(function (n) { glU[n] = gl.getUniformLocation(pr, n); });
      gl.uniform2f(glU.R, cv.width, cv.height);
      return true;
    } catch (e) { console.warn('PLIntro: tunnel niet te bouwen — de CSS-achtergrond blijft', e); gl = null; return false; }
  }
  // Puur: de stand van de tunnel op tijd t (s). Rustig in, versnellen naar de
  // doorzoom (2,45 s), dan warp en uitdoven met de rest.
  function tunnelStand(t) {
    var w = Math.max(0, Math.min(1, (t - 2.2) / .5));
    var d = Math.min(1, t / .6) * (1 - Math.max(0, Math.min(1, (t - 2.6) / .45)));
    return { Z: t * .55 + w * w * 2.2, W: w, D: d };
  }
  function tunnelTik(t1) {
    if (!gl || !el) return;
    var t = (t1 - tStart) / 1000, s = tunnelStand(t);
    gl.uniform1f(glU.T, t); gl.uniform1f(glU.Z, s.Z); gl.uniform1f(glU.W, s.W); gl.uniform1f(glU.D, s.D);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(tunnelTik);
  }
  var tStart = 0;

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
    if (gl) { var lc = gl.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); gl = null; }
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

  return {
    start: start, reden: reden, overslaan: overslaan, tunnelStand: tunnelStand,
    bezig: function () { return bezig; },
    SLEUTEL: SLEUTEL, DUUR_MS: DUUR_MS, MAX_WACHT_MS: MAX_WACHT_MS
  };
})();
