// ══════════════════════════════════════════════════════════════════
// pidlane-dienst.js — PLDienst: liggen RDW, AI of onze server eruit?
// ──────────────────────────────────────────────────────────────────
// WAAROM (20-11-2026). Het RDW gaf 530 en de klant zag bij het kenteken
// alleen "RDW antwoordde niet goed". Dan lijkt de app kapot, terwijl de app
// het enige was dat wél werkte. Deze module zegt in gewone taal wélke dienst
// stoort en wat er nog wel kan.
//
// DRIE BRONNEN, ÉÉN STAND
//  • de achtergrondcheck: /v1/dienst van de Worker (RDW en de statuspagina
//    van Anthropic, een minuut gecachet), elke vijf minuten zolang de app in
//    beeld is, en meteen bij weer online;
//  • wat de app zelf ziet: elk RDW-antwoord via /proxy (zie() vanuit plFetch);
//  • het net: navigator.onLine, en of onze server antwoordt.
// Eén mislukte check is geen storing (zelfde les als de AI-stip, 09-10-2026):
// de server heet pas onbereikbaar na DIENST_MIS_ROOD missers op rij.
//
// Puur en los te toetsen: meldingen(), rdwTekst(), verwerk() (test-dienst.js).
// Laadt vlak na pidlane-plfetch.js, zodat elke RDW-aanroep rdwTekst() kent.
// ══════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';
  const DIENST_ELKE_MS = 300000, DIENST_EERSTE_MS = 6000, DIENST_MIS_ROOD = 2;
  let _stand = {}, _mis = 0, _gemeld = {};

  // De tekst voor een mislukte RDW-vraag, op de plek waar de klant hem deed.
  function rdwTekst(http) {
    const c = Number(http) || 0;
    if (!c || c >= 500) return 'Het RDW (kentekenregister) heeft op dit moment een storing' + (c ? ' (code ' + c + ')' : '') + '. Dat ligt niet aan PidLane — probeer het over een tijdje opnieuw.';
    if (c === 429) return 'Het RDW is even overbelast — probeer het over een minuut opnieuw.';
    if (c === 401) return 'Log eerst in — het RDW loopt via je account.';
    return 'Het RDW antwoordde niet goed (code ' + c + ') — probeer het zo opnieuw.';
  }

  // Puur: wat de klant moet weten, ernstigste eerst. ernst 2 = rood, 1 = oranje.
  function meldingen(stand, online) {
    const s = stand || {}, uit = [];
    if (online === false) return [{ dienst: 'net', ernst: 2, tekst: 'Geen internet. De meting via de adapter werkt gewoon; kenteken, AI-uitleg en opslaan wachten tot je weer online bent.' }];
    if (s.server && s.server.status === 'onbereikbaar') uit.push({ dienst: 'server', ernst: 2, tekst: 'De PidLane-server is even niet bereikbaar. De meting werkt; AI-uitleg, kenteken en opslaan wachten. De app probeert het vanzelf opnieuw.' });
    const r = s.rdw && s.rdw.status, a = s.ai && s.ai.status;
    if (r === 'storing') uit.push({ dienst: 'rdw', ernst: 1, tekst: 'Het RDW (kentekenregister) heeft een storing' + (s.rdw.detail ? ' (' + s.rdw.detail + ')' : '') + '. Kentekengegevens komen later; de rest van de app werkt.' });
    else if (r === 'traag') uit.push({ dienst: 'rdw', ernst: 1, tekst: 'Het RDW reageert traag — kentekengegevens kunnen even duren.' });
    if (a === 'storing' || a === 'verstoord') uit.push({ dienst: 'ai', ernst: 1, tekst: 'Anthropic, de AI achter de uitleg, meldt ' + (a === 'storing' ? 'een storing' : 'een verstoring') + '. AI-uitleg kan mislukken of trager zijn; metingen werken gewoon.' });
    return uit.sort((x, y) => y.ernst - x.ernst);
  }
  function ernst() {
    return meldingen(_stand, online()).reduce((m, x) => Math.max(m, x.ernst), 0);
  }
  function online() {
    try { return root.navigator && root.navigator.onLine === false ? false : true; }
    catch (e) { console.warn('PLDienst: navigator.onLine onleesbaar', e); return true; }
  }

  // Puur: de nieuwe stand na één achtergrondcheck. `j` = antwoord van
  // /v1/dienst, of null als de server niet antwoordde; `mis` = missers op rij.
  function verwerk(stand, j, mis, nu) {
    const s = Object.assign({}, stand || {}), t = nu || Date.now();
    if (!j) {
      mis = (mis || 0) + 1;
      if (mis >= DIENST_MIS_ROOD) s.server = { status: 'onbereikbaar', detail: '', t: t };
      return { stand: s, mis: mis };
    }
    s.server = { status: 'goed', detail: '', t: t };
    const d = (j && j.diensten) || {};
    ['rdw', 'ai'].forEach((k) => { if (d[k] && d[k].status) s[k] = { status: String(d[k].status), detail: String(d[k].detail || ''), t: t }; });
    return { stand: s, mis: 0 };
  }

  // Na elke verandering: de bovenbalk bijwerken, en één keer per omslag naar
  // slecht een melding. Herstel krijgt alleen een regel in het logboek.
  function na(oud) {
    const nieuw = meldingen(_stand, online()), was = {};
    meldingen(oud, online()).forEach((m) => { was[m.dienst] = m.tekst; });
    nieuw.forEach((m) => {
      if (!was[m.dienst] && !_gemeld[m.dienst]) {
        _gemeld[m.dienst] = true;
        try { if (typeof root.showToast === 'function') root.showToast('⚠️ ' + m.tekst, 7000); }
        catch (e) { console.warn('PLDienst: melding niet getoond', e); }
        console.warn('PLDienst: ' + m.tekst);
      }
    });
    Object.keys(_gemeld).forEach((k) => { if (!nieuw.some((m) => m.dienst === k)) { delete _gemeld[k]; console.info('PLDienst: ' + k + ' weer in orde'); } });
    try { if (typeof root.updateTopbarStatus === 'function') root.updateTopbarStatus(); }
    catch (e) { console.warn('PLDienst: bovenbalk niet bijgewerkt', e); }
    try { teken2(); } catch (e) { console.warn('PLDienst: venster niet bijgewerkt', e); }
  }

  // Wat de app zelf zag: een RDW-antwoord via /proxy (vanuit plFetch).
  function zie(dienst, http) {
    const c = Number(http) || 0, oud = Object.assign({}, _stand);
    if (dienst !== 'rdw') return;
    if (!c || c >= 500) _stand.rdw = { status: 'storing', detail: c ? 'code ' + c : 'geen antwoord', t: Date.now() };
    else if (c >= 200 && c < 300) _stand.rdw = { status: 'goed', detail: '', t: Date.now() };
    else return;
    na(oud);
  }

  let _bezig = false;
  async function check() {
    if (_bezig) return;
    _bezig = true;
    const oud = Object.assign({}, _stand);
    try {
      if (!online()) return;
      if (typeof root.plFetch !== 'function') return;
      let j = null;
      try {
        const r = await root.plFetch('/v1/dienst', { cache: 'no-store', geenToken: true });
        j = r && r.ok ? await r.json() : null;
      } catch (e) { console.warn('PLDienst: /v1/dienst niet bereikt', e); }
      const n = verwerk(_stand, j, _mis);
      _stand = n.stand; _mis = n.mis;
    } finally { _bezig = false; na(oud); }
  }

  // De regel in het systeemmenu (index.html, #dienstChip).
  function teken() {
    const doc = root.document; if (!doc) return 0;
    const m = meldingen(_stand, online()), e = m.reduce((x, y) => Math.max(x, y.ernst), 0);
    const dot = doc.getElementById('ddot'), sub = doc.getElementById('dSub'), chip = doc.getElementById('dienstChip');
    if (dot) dot.className = 'tdot ' + (e >= 2 ? 'r' : e === 1 ? 'o' : 'g');
    const t = m.length ? m[0].tekst : (_stand.server ? 'RDW, AI en server in orde' : 'nog niet gecontroleerd');
    if (sub && sub.textContent !== t) sub.textContent = t;
    if (chip) chip.title = m.map((x) => x.tekst).join('\n') || 'Alle diensten in orde';
    return e;
  }
  // Het venster achter de regel Diensten (20-11-2026): per dienst de stand,
  // wanneer gecontroleerd, en wat de klant ervan merkt. Een toast was te kort
  // om te lezen wat er nog wel werkt.
  const DIENSTEN = [
    ['net', '📶', 'Internet', 'Kenteken, AI-uitleg en opslaan gaan via internet. De meting via de adapter niet.'],
    ['server', '☁️', 'PidLane-server', 'Inloggen, tegoed, AI-uitleg, opslaan en het doorgeven van RDW-vragen.'],
    ['rdw', '🚗', 'RDW (kentekenregister)', 'Merk, model, bouwjaar, APK en terugroepacties bij een kenteken.'],
    ['ai', '🤖', 'AI (Anthropic)', 'De uitleg, rapporten en analyses. Metingen en foutcodes werken zonder.']];
  const WOORD = { goed: 'in orde', traag: 'traag', verstoord: 'verstoord', storing: 'storing', onbereikbaar: 'niet bereikbaar', offline: 'geen verbinding', onbekend: 'onbekend' };
  function regel(k) {
    if (k === 'net') return online() ? { status: 'goed', detail: '' } : { status: 'offline', detail: '' };
    return _stand[k] || null;
  }
  function venster() {
    const C = root.PLCheck, doc = root.document;
    if (!C || !doc) return '';
    const kleur = (st) => ({ goed: 'var(--gn,#22c55e)', traag: '#f59e0b', verstoord: '#f59e0b', storing: '#ef4444', onbereikbaar: '#ef4444', offline: '#ef4444' }[st] || '#94a3b8');
    const tijd = (t) => { try { return t ? new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : ''; } catch (e) { console.warn('PLDienst: tijd', e); return ''; } };
    const m = meldingen(_stand, online());
    const kaarten = DIENSTEN.map((d) => {
      const r = regel(d[0]), st = r ? r.status : null;
      return C.kaart('<div style="display:flex;gap:10px;align-items:flex-start">' +
        '<span style="flex:none;width:12px;height:12px;border-radius:50%;margin-top:5px;background:' + kleur(st) + '"></span>' +
        '<div style="flex:1"><b>' + d[1] + ' ' + C.esc(d[2]) + '</b> — ' + C.esc(st ? (WOORD[st] || st) : 'nog niet gecontroleerd') +
        (r && r.detail ? ' <span style="color:var(--tx3)">(' + C.esc(r.detail) + ')</span>' : '') +
        '<div style="font-size:12px;color:var(--tx3);margin-top:3px">' + C.esc(d[3]) + (r && r.t ? ' · gecontroleerd ' + tijd(r.t) : '') + '</div></div></div>');
    }).join('');
    return C.pagina(
      C.kop({ icoon: '🌐', titel: 'Diensten', sluit: 'PLDienst.sluit()', tekst: 'Waar PidLane op leunt, en of het nu werkt. Een storing hier ligt niet aan de app of aan je auto.' }) +
      (m.length ? m.map((x) => C.tip(C.esc(x.tekst), 'let')).join('') : C.tip('Alles in orde. De app kijkt elke vijf minuten opnieuw zolang hij in beeld is.')) +
      kaarten +
      C.tip('De meting via de adapter, de foutcodes en de sensoren werken altijd, ook zonder internet.') +
      C.knop('🔄 Nu controleren', 'PLDienst.ververs()') + C.knop('Sluiten', 'PLDienst.sluit()', 'sec'));
  }
  function teken2() {
    const el = root.document && root.document.getElementById('dienstVenster');
    if (el && el.style.display !== 'none') el.innerHTML = venster();
  }
  function open() {
    const doc = root.document; if (!doc) return;
    let el = doc.getElementById('dienstVenster');
    if (!el) { el = doc.createElement('div'); el.id = 'dienstVenster'; doc.body.appendChild(el); }
    if (root.PLCheck) root.PLCheck.ov(el);
    el.innerHTML = venster();
    el.style.display = 'block';
    ververs();
  }
  function sluit() {
    const el = root.document && root.document.getElementById('dienstVenster');
    if (el) el.style.display = 'none';
  }
  async function ververs() {
    try { await check(); } catch (e) { console.warn('PLDienst: controle mislukt', e); }
    teken2();
  }
  function uitleg() { open(); }

  function start() {
    if (root._plDienstGestart) return;
    root._plDienstGestart = true;
    const tik = () => { check(); };
    root.setTimeout(tik, DIENST_EERSTE_MS);
    if (root.PLRust && typeof root.PLRust.elke === 'function') root.PLRust.elke(DIENST_ELKE_MS, tik, 'dienst');
    else root.setInterval(tik, DIENST_ELKE_MS);
    root.addEventListener('online', () => { const oud = Object.assign({}, _stand); na(oud); check(); });
    root.addEventListener('offline', () => { na(Object.assign({}, _stand)); });
  }
  if (root.addEventListener) root.addEventListener('load', start);

  root.PLDienst = { rdwTekst, meldingen, verwerk, zie, check, ernst, teken, uitleg, open, sluit, ververs, stand: () => Object.assign({}, _stand), MIS_ROOD: DIENST_MIS_ROOD };
})(typeof window !== 'undefined' ? window : this);
