// ══════════════════════════════════════════════════════════════════
// pidlane-plfetch.js — de ene plek waar de app het net op gaat
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT (#117, 03-09-2026)
//
// Er stonden zesentwintig losse fetch-aanroepen verspreid over elf modules.
// Elke aanroep besliste zélf over vier dingen:
//
//   1. de basis-URL          — PROXY_URL, met of zonder afsluitende slash,
//                              soms met een eigen ontbreekt-controle en soms
//                              zonder;
//   2. de kop X-App-Token    — soms alleen als er een token is, soms altijd
//                              (dan met een lege waarde), soms helemaal niet;
//   3. wat er bij 401 gebeurt — twee plekken kennen "sessie verlopen", de rest
//                              geeft een kale HTTP-code door;
//   4. of er iets gelogd wordt — meestal niet.
//
// Vier beslissingen, zesentwintig keer genomen. Dat is geen stijlkwestie:
// X-PidLane-Saldo wordt maar op één plek uitgelezen (in de AI-haak van
// pidlane-fuel.js), en dat werkte pas nadat het daar met de hand in was gezet.
// Een gedeelde helper had dat voor alle zesentwintig gedaan — en doet dat nu.
//
// WAT DEZE HELPER NIET IS
// Geen wrapper die het antwoord voor je uitleest. plFetch() geeft de gewone
// Response terug, want elke aanroeper heeft zijn eigen statuscodes die iets
// betekenen: 410 is "code verlopen" bij remote, 402 is "onvoldoende tegoed"
// bij de AI-haak, 429 is "te veel pogingen" bij het inloggen. Die betekenis
// hoort bij de aanroeper. Wat híér hoort is alleen wat voor iedereen
// hetzelfde is.
//
// apiFetch() in pidlane-fuel.js blijft ook wat het was: dat is de AI-haak met
// contextinjectie en vervolgcalls, geen HTTP-helper. plFetch zit daar ónder.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

function basis(){
  try{ return String(window.PROXY_URL||'').replace(/\/$/,''); }catch(e){ return ''; }
}
function token(){
  try{ return (typeof window.APP_TOKEN==='string' && window.APP_TOKEN) || ''; }catch(e){ return ''; }
}
function diag(m,l){
  try{ if(typeof btDiag==='function') btDiag(m,l||'info'); }
  catch(e){ console.warn('plFetch: melding niet gelogd', e); }
}

/* Bouwt de volledige URL. Een absolute http(s)-URL gaat ongemoeid door — dat
   is het Airtable-eindpunt, dat zijn eigen host heeft. Al het andere hangt
   onder PROXY_URL. */
function plFetchUrl(pad){
  const p=String(pad||'');
  if(/^https?:\/\//i.test(p)) return p;
  const b=basis();
  if(!b) throw new Error('PROXY_URL ontbreekt — kan "'+p+'" niet opvragen');
  return b + (p.charAt(0)==='/' ? p : '/'+p);
}

/* De aanroep zelf. Opties zijn die van fetch(), plus:
     json        object → wordt de body, met Content-Type erbij
     geenToken   true   → stuur GEEN X-App-Token mee (voor het inloggen zelf:
                          dáár is er nog geen sessie en zou een oude kop de
                          server op het verkeerde been zetten)
   De Response komt onveranderd terug. Een netwerkfout komt naar buiten als
   Error mét het pad erin, zodat de catch van de aanroeper iets te melden
   heeft in plaats van "Failed to fetch". */
window.plFetch = async function(pad, opties){
  const o = Object.assign({}, opties||{});
  const url = plFetchUrl(pad);
  const kop = Object.assign({}, o.headers||{});
  delete o.headers;

  if(o.json !== undefined){
    if(o.body !== undefined) throw new Error('plFetch: json en body samen is dubbelop ('+pad+')');
    if(!kop['Content-Type']) kop['Content-Type']='application/json';
    o.body = JSON.stringify(o.json);
  }
  delete o.json;

  const zonder = !!o.geenToken; delete o.geenToken;
  const t = token();
  if(!zonder && t && !kop['X-App-Token']) kop['X-App-Token']=t;

  let resp;
  try{
    resp = await fetch(url, Object.assign(o, { headers: kop }));
  }catch(e){
    // Geen stille catch: de fout gaat door naar de aanroeper, alleen met het
    // pad erbij. Zonder dat staat er in het logboek "TypeError: Failed to
    // fetch" en is er geen manier om te zien wélke aanroep het was.
    const f = new Error('netwerk onbereikbaar bij ' + pad + ': ' + ((e && e.message) || e));
    f.oorzaak = e;
    throw f;
  }

  // ── het saldo dat de server meestuurt ──
  // X-PidLane-Saldo staat in Access-Control-Expose-Headers en komt op ELK
  // antwoord van de Worker mee. Tot #117 las alleen de AI-haak hem uit; alle
  // andere aanroepen lieten hem liggen terwijl de teller in beeld op een
  // schatting liep. volgServer() doet niets als de kop er niet is.
  try{ if(window.PLCredits && PLCredits.volgServer) PLCredits.volgServer(resp.headers, null); }
  catch(e){ console.warn('plFetch: serversaldo niet overgenomen', e); }

  // ── 401 op één plek ──
  // Niet afhandelen: alleen zichtbaar maken. Wat er MOET gebeuren verschilt
  // (uitloggen, opnieuw proberen, de gebruiker iets vragen) en is de keuze van
  // de aanroeper. Wat hier hoort is dat een verlopen sessie nooit meer stil is.
  if(resp.status===401) diag('Server weigert (401) bij '+pad+' — sessie verlopen of ongeldig','warn');

  return resp;
};

window.plFetchUrl = plFetchUrl;
})();
