// ══════════════════════════════════════════════════════════════════
// pidlane-functietest.js — het oordeel van de Full function test (05-10-2026)
// ──────────────────────────────────────────────────────────────────
// De Full survey (vlFullSurvey in pidlane-veldlab.js) meet. Dit bestand
// OORDEELT over wat er gemeten is, en geeft één cijfer van 1 tot 10 op de
// vraag: is deze verbinding met deze auto bruikbaar om de app te gebruiken?
//
// Vijf onderdelen, elk 0–10, gewogen:
//   verbinding  25%  transportfouten, responstijd, spreiding, haperingen,
//                    vertraagt de ECU naarmate de sweep vordert (belasting)
//   basis       20%  adapter, accuspanning, bitmaps, VIN, CALID, readiness,
//                    brandstof ECU (0151) tegen brandstof RDW/gebruiker
//   dekking     20%  aandeel PIDs met een bruikbare waarde + de kern-PIDs
//   weergaven   20%  welke weergaven van Slim visueel op DEZE auto iets
//                    betekenen — per brandstof: een diesel loopt arm, dus
//                    lambda rond 1,00 en verbruik uit de luchtmassa zeggen
//                    daar niets
//   afwijkend   15%  ongeldig, buiten de harde grens, hapert, of veel trager
//                    dan de rest
// Daarnaast: per PID de categorie en de weergaven waarin hij staat, en een
// vergelijking van de gekozen configuratie (strategie, groepsgrootte, ATST,
// protocol) met wat de meting zelf laat zien.
//
// Puur: geen bus-I/O, geen DOM. Alles wat van buiten komt gaat via `ctx`, met
// de globals van de app als terugval. Test: test-functietest.js.
// ══════════════════════════════════════════════════════════════════
(function(){
'use strict';

const GEWICHT = { verbinding:0.25, basis:0.20, dekking:0.20, weergaven:0.20, afwijkend:0.15 };
// Zonder deze kan de app zijn kernwerk niet: meter, rijden, motortemperatuur.
const KERN = ['010C','010D','0105','0104'];
// Responstijd per PID (ms) → deelscore. K-line/ISO 9141 is van nature trager
// dan CAN; dezelfde 150 ms is daar goed en op CAN matig.
const TEMPO_CAN    = [[60,10],[100,9],[150,8],[250,6],[400,4],[700,2]];
const TEMPO_LEGACY = [[120,10],[180,9],[250,8],[400,6],[600,4],[900,2]];
const CAT_NAAM = { Temp:'Temperatuur', Temperatuur:'Temperatuur', Electrisch:'Elektrisch' };

function g(naam){ try{ return (typeof window!=='undefined' && window[naam]!==undefined) ? window[naam] : undefined; }catch(e){ return undefined; } }
function r1(x){ return Math.round(x*10)/10; }
function klem(x){ return Math.max(0, Math.min(10, x)); }
function mediaan(a){ if(!a.length) return null; const s=a.slice().sort((x,y)=>x-y), m=s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
function tempoScore(ms, tabel){ if(ms==null) return 5; for(const [grens,sc] of tabel) if(ms<=grens) return sc; return 1; }

/* Brandstof van de auto: eerst wat de app al weet (RDW/gebruiker), anders de
   ECU zelf (0151). 'diesel' | 'benzine' | 'elektrisch' | 'onbekend'. */
function brandstofVan(opgegeven, ecuFuel){
  const b=String(opgegeven||'').toLowerCase();
  if(b==='diesel' || b==='benzine' || b==='elektrisch') return b;
  const c=ecuFuel && ecuFuel.code;
  if(c===4 || c===19 || c===24) return 'diesel';
  if(c===8) return 'elektrisch';
  if(c>=1) return 'benzine';
  return 'onbekend';
}
function brandstofEcu(ecuFuel){
  const c=ecuFuel && ecuFuel.code;
  if(c==null) return null;
  if(c===4 || c===19 || c===24) return 'diesel';
  if(c===8) return 'elektrisch';
  return c>=1 ? 'benzine' : null;
}

/* ── 1. Verbinding ── */
function oordeelVerbinding(sv, ctx){
  const d=(sv.pids && sv.pids.detail) || [], tot=d.length || 1;
  const transport=(sv.pids && sv.pids.transport) || 0, flaky=d.filter(x=>x.flaky).length;
  const legacy=!ctx.can;
  const ms=d.filter(x=>x.st==='ok').map(x=>x.ms);
  const med=mediaan(ms);
  const tim=(sv.timing && sv.timing.rpm5) || [];
  const spreiding=tim.length>1 ? Math.max(...tim)-Math.min(...tim) : 0;
  // Belasting: wordt de ECU trager naarmate de sweep langer duurt?
  const kop=mediaan(ms.slice(0,10)), staart=mediaan(ms.slice(-10));
  const vertraagt=ms.length>=20 && kop>0 && staart>kop*1.5;
  const notities=[];
  let sc=tempoScore(sv.timing && sv.timing.avgMs!=null ? sv.timing.avgMs : med, legacy ? TEMPO_LEGACY : TEMPO_CAN);
  const tPct=transport/tot, fPct=flaky/tot;
  if(transport){ sc-=Math.min(6, tPct*30); notities.push(transport+' PID(s) met een transportfout — de lijn zelf hapert'); }
  if(flaky){ sc-=Math.min(2, fPct*10); notities.push(flaky+' PID(s) gaven pas bij de herkansing antwoord'); }
  if(spreiding>Math.max(150,(sv.timing && sv.timing.avgMs) || 0)){ sc-=1; notities.push('responstijd springt '+spreiding+' ms tussen vijf gelijke vragen'); }
  if(vertraagt){ sc-=1.5; notities.push('ECU vertraagt onder belasting: mediaan '+kop+' → '+staart+' ms van begin naar eind van de sweep'); }
  const bus=ctx.bus;
  if(bus && bus.foutPct>=20){ sc-=1; notities.push(bus.foutPct+'% foute antwoorden op de bus in de laatste 10 s'); }
  return { score:r1(klem(sc)), gemMs:sv.timing ? sv.timing.avgMs : null, mediaanMs:med, spreidingMs:spreiding,
    transport, flaky, vertraagt, kopMs:kop, staartMs:staart, protocol:legacy?'legacy':'CAN', notities };
}

/* ── 2. Basisgegevens ── */
function oordeelBasis(sv, ctx){
  const p=[], n=[]; let sc=10;
  const a=sv.adapter||{};
  if(!/ELM|STN|OBD|v\d/i.test(a.id||'')){ sc-=1; n.push('adapter gaf geen herkenbare identiteit op ATI'); }
  const v=parseFloat(String(a.volt||'').replace(',','.'));
  if(isNaN(v)){ sc-=1; n.push('accuspanning (ATRV) niet leesbaar'); }
  else if(v<11.5 || v>15.5){ sc-=1.5; n.push('accuspanning '+v+' V buiten 11,5–15,5 V — de ECU kan zich vreemd gedragen'); }
  if(!sv.bitmaps || !sv.bitmaps['0100']){ sc-=3; n.push('geen 0100-bitmap: de lijst ondersteunde PIDs is niet van de ECU zelf'); }
  if(!(sv.veh && sv.veh.vin)){ sc-=1.5; n.push('geen VIN — koppeling aan RDW en merkregels mist'); }
  if(!(sv.calid && sv.calid.ascii)){ sc-=0.5; n.push('geen CALID (0904)'); }
  if(!sv.readiness){ sc-=1.5; n.push('readiness (0101) niet te ontleden'); }
  const ecu=brandstofEcu(sv.ecuFuel), opg=String(ctx.brandstofOpgegeven||'').toLowerCase();
  if(ecu && (opg==='diesel'||opg==='benzine'||opg==='elektrisch') && ecu!==opg){
    sc-=2; n.push('brandstof volgens ECU ('+ecu+') wijkt af van de opgegeven brandstof ('+opg+') — weergaven en berekeningen kiezen dan verkeerd');
  }
  if(!(sv.pids && sv.pids.total)){ sc-=4; n.push('geen enkele ondersteunde PID'); }
  return { score:r1(klem(sc)), notities:n, ecuBrandstof:ecu };
}

/* ── 3. Dekking ── */
function oordeelDekking(sv){
  const d=(sv.pids && sv.pids.detail) || [];
  const gevraagd=d.filter(x=>x.st!=='transport').length;
  const ok=d.filter(x=>x.st==='ok').length;
  const okSet=new Set(d.filter(x=>x.st==='ok').map(x=>x.pid));
  const kernMis=KERN.filter(p=>!okSet.has(p));
  let sc=gevraagd ? 10*ok/gevraagd : 0;
  // Een auto met 12 PIDs die allemaal werken is bruikbaar, maar minder dan 30.
  if(ok<10) sc=Math.min(sc, 3+ok*0.4);
  sc-=kernMis.length*1.5;
  const n=[];
  if(kernMis.length) n.push('kern-PID(s) zonder bruikbare waarde: '+kernMis.join(', '));
  return { score:r1(klem(sc)), ok, gevraagd, kernMis, notities:n };
}

/* ── per PID: categorie en weergaven ── */
function okSetVan(sv){ return new Set(((sv.pids && sv.pids.detail) || []).filter(x=>x.st==='ok').map(x=>x.pid)); }
/* Mag deze PID op een plek staan? Berekende PIDs hangen af van hun bronnen,
   en voor een diesel telt de luchtmassa niet als bron van verbruik. */
function bruikbaar(pid, okSet, brandstof){
  if(/^CA/.test(pid)){
    const debiet=okSet.has('015E') || (okSet.has('0110') && brandstof!=='diesel');
    if(pid==='CA02') return debiet;
    if(pid==='CA03') return debiet && okSet.has('010D');
    return false;
  }
  return okSet.has(pid);
}

function oordeelWeergaven(sv, ctx, brandstof){
  const P=ctx.profielen || [], okSet=okSetVan(sv), uit=[];
  const elektrisch=brandstof==='elektrisch';
  P.forEach(function(p){
    const r={ id:p.id, naam:p.naam, oordeel:'goed', gevuld:0, plekken:0, reden:'', indeling:{} };
    if(!p.plekken){   // basis: de vaste meter
      const heeft=okSet.has('010C') && okSet.has('010D');
      r.oordeel=heeft ? 'goed' : (okSet.has('010D') ? 'matig' : 'ongeschikt');
      r.reden=heeft ? 'toerental en snelheid lezen' : 'toerental of snelheid ontbreekt';
      uit.push(r); return;
    }
    p.plekken.forEach(function(x){
      let pid=null; for(const k of x.keten){ if(bruikbaar(k, okSet, brandstof)){ pid=k; break; } }
      r.indeling[x.rol]=pid; r.plekken++; if(pid) r.gevuld++;
    });
    const f=r.gevuld/r.plekken;
    if(elektrisch && p.id!=='temp'){ r.oordeel='ongeschikt'; r.reden='geen verbrandingsmotor'; }
    else if(p.id==='temp'){
      r.oordeel = r.gevuld>=3 ? 'goed' : r.gevuld===2 ? 'matig' : 'ongeschikt';
      r.reden = r.gevuld<=1 ? 'maar '+r.gevuld+' temperatuursensor — een rij thermometers met één buis zegt niets' : r.gevuld+' van '+r.plekken+' temperaturen';
    }
    else if(p.id==='emissie' && brandstof==='diesel'){
      r.oordeel='ongeschikt';
      r.reden='diesel loopt arm: lambda rond 1,00 en de brandstoftrims gelden voor benzine'+(okSet.has('012C')?' (EGR wel aanwezig)':'');
    }
    else if(p.id==='verbruik' && !r.indeling.nu){
      r.oordeel='ongeschikt';
      r.reden = brandstof==='diesel'
        ? 'diesel zonder brandstofdebiet (015E): verbruik uit de luchtmassa klopt niet bij een arm lopende motor'
        : 'geen brandstofdebiet (015E) en geen luchtmassa (0110)';
    }
    else if(p.id==='motor' && !r.indeling.toeren){ r.oordeel='ongeschikt'; r.reden='geen toerental'; }
    else {
      r.oordeel = f>=0.6 ? 'goed' : f>=0.4 ? 'matig' : 'ongeschikt';
      r.reden = r.gevuld+' van '+r.plekken+' plekken gevuld';
    }
    uit.push(r);
  });
  const w={goed:10, matig:6, ongeschikt:0};
  const tel=uit.length ? uit.reduce((a,r)=>a+w[r.oordeel],0)/uit.length : 0;
  return { score:r1(klem(tel)), lijst:uit, aanbevolen:uit.filter(r=>r.oordeel==='goed').map(r=>r.id) };
}

function pidOverzicht(sv, ctx, weergaven){
  const defs=ctx.defs || {}, slim=ctx.slimGroep;
  const inWeergave={};
  weergaven.lijst.forEach(function(r){
    Object.keys(r.indeling).forEach(function(rol){ const pid=r.indeling[rol]; if(pid) (inWeergave[pid]=inWeergave[pid]||[]).push(r.id); });
  });
  return ((sv.pids && sv.pids.detail) || []).map(function(x){
    const def=defs[x.pid] || {};
    const cat=CAT_NAAM[def.cat] || def.cat || 'Overig';
    let groep=null; try{ groep = slim ? slim(x.pid, def) : null; }catch(e){ groep=null; }
    return { pid:x.pid, naam:x.naam || def.name || '', cat, st:x.st,
      slim: x.st==='ok' ? groep : null, visueel: inWeergave[x.pid] || [] };
  });
}

/* ── 5. Afwijkende antwoorden ── */
function oordeelAfwijkend(sv, ctx){
  const d=(sv.pids && sv.pids.detail) || [], hard=ctx.hard || {};
  const med=mediaan(d.filter(x=>x.st==='ok').map(x=>x.ms)) || 0;
  const traagGrens=Math.max(400, med*3);
  const lijst=[];
  d.forEach(function(x){
    if(x.st==='invalid'){ lijst.push({pid:x.pid, naam:x.naam, soort:'ongeldig', detail:'waarde '+x.val+(x.q?' ('+x.q+')':'')}); return; }
    if(x.st!=='ok') return;
    const h=hard[x.pid];
    if(h && typeof x.val==='number' && (x.val<h.min || x.val>h.max)){ lijst.push({pid:x.pid, naam:x.naam, soort:'buiten grens', detail:x.val+' buiten '+h.min+'…'+h.max}); return; }
    if(x.flaky){ lijst.push({pid:x.pid, naam:x.naam, soort:'hapert', detail:'pas bij de herkansing'}); return; }
    if(x.ms>traagGrens) lijst.push({pid:x.pid, naam:x.naam, soort:'traag', detail:x.ms+' ms (mediaan '+Math.round(med)+')'});
  });
  const zwaar=lijst.filter(a=>a.soort==='ongeldig'||a.soort==='buiten grens').length;
  const tot=d.length || 1;
  const sc=10 - Math.min(8, zwaar/tot*40) - Math.min(2, (lijst.length-zwaar)/tot*20);
  return { score:r1(klem(sc)), lijst };
}

/* ── Configuratie: wat er gekozen is tegen wat de meting laat zien ── */
function oordeelConfig(sv, ctx, verb){
  const adv=[];
  const avg=sv.timing && sv.timing.avgMs;
  if(avg>0 && ctx.strategie){
    const rps=1000/avg, zou = rps>=12 ? 'snel' : rps>=5 ? 'gebalanceerd' : 'conservatief';
    if(zou!==ctx.strategie) adv.push({ wat:'strategie', nu:ctx.strategie, beter:zou, reden:'gemeten '+r1(rps)+' antwoorden/s past bij '+zou });
    else adv.push({ wat:'strategie', nu:ctx.strategie, beter:null, reden:'past bij de gemeten '+r1(rps)+' antwoorden/s' });
  }
  const b=sv.batch||{}, gr=ctx.profiel && ctx.profiel.groep;
  if(ctx.can && b.ladder){
    const enkel=verb.mediaanMs;
    const beste=b.ladder.filter(l=>l.ok && l.ms>0).map(l=>({n:l.n, perPid:l.ms/l.n})).sort((x,y)=>x.perPid-y.perPid)[0];
    if(beste && enkel) adv.push({ wat:'groepsvragen', nu:gr?gr.start:null, beter:beste.n,
      reden:'per PID '+Math.round(beste.perPid)+' ms in een groep van '+beste.n+' tegen '+Math.round(enkel)+' ms los ('+r1(enkel/beste.perPid)+'× zo snel)' });
    if(gr && b.maxPids>0 && gr.start>b.maxPids) adv.push({ wat:'groepsvragen', nu:gr.start, beter:b.maxPids, reden:'het profiel vraagt '+gr.start+' tegelijk, de meting haalde er '+b.maxPids });
    if(!b.ok) adv.push({ wat:'groepsvragen', nu:gr?gr.start:null, beter:1, reden:'deze ECU beantwoordt geen groepsvraag van 2 — losse vragen zijn hier de juiste keuze' });
  }
  const st=ctx.profiel && ctx.profiel.st;
  if(st && st.ms && verb.mediaanMs && verb.mediaanMs>st.ms*0.9)
    adv.push({ wat:'ATST', nu:st.hex, beter:null, reden:'mediaan antwoord '+Math.round(verb.mediaanMs)+' ms zit tegen de wachttijd van '+st.ms+' ms aan — kans op afgekapte antwoorden' });
  if(/^A/i.test(String((sv.adapter||{}).protoNum||'')))
    adv.push({ wat:'protocol', nu:'automatisch', beter:String(sv.adapter.protoNum).slice(1), reden:'vast instellen spaart de zoekronde bij elke start' });
  if(!ctx.can) adv.push({ wat:'protocol', nu:'legacy', beter:null, reden:'K-line/ISO 9141: trager van aard, de tempogrenzen zijn daarop aangepast' });
  if(sv.adapter && !sv.adapter.stn && verb.score<6)
    adv.push({ wat:'adapter', nu:'ELM-kloon', beter:'STN-adapter', reden:'traag of haperend op een kloon-ELM; een STN-chip (bv. OBDLink) is doorgaans sneller en stabieler' });
  return adv;
}

/* Het hele oordeel. sv = het survey-object; ctx zie bovenaan. */
function beoordeel(sv, ctx){
  sv=sv||{}; ctx=Object.assign({}, ctx||{});
  if(!ctx.defs) ctx.defs=g('ALL_PID_DEFS')||{};
  if(!ctx.hard) ctx.hard=g('PID_HARD_LIMITS')||{};
  if(!ctx.slimGroep) ctx.slimGroep=g('slimGroep');
  if(!ctx.profielen){ const V=g('PLVisProfiel'); ctx.profielen=(V && V.PROFIELEN) || []; }
  if(ctx.can===undefined) ctx.can=!(sv.batch && sv.batch.reden==='geen CAN-protocol');
  const brandstof=brandstofVan(ctx.brandstofOpgegeven, sv.ecuFuel);
  const verbinding=oordeelVerbinding(sv, ctx);
  const basis=oordeelBasis(sv, ctx);
  const dekking=oordeelDekking(sv);
  const weergaven=oordeelWeergaven(sv, ctx, brandstof);
  const afwijkend=oordeelAfwijkend(sv, ctx);
  const delen={verbinding, basis, dekking, weergaven, afwijkend};
  let c=0; Object.keys(GEWICHT).forEach(k=>{ c+=GEWICHT[k]*delen[k].score; });
  // Plafonds: een gemiddelde mag een ramp niet wegpoetsen.
  const plafond=[];
  if(verbinding.transport/(((sv.pids&&sv.pids.detail)||[]).length||1)>0.2){ c=Math.min(c,4); plafond.push('meer dan 20% transportfouten'); }
  if(dekking.kernMis.indexOf('010C')>-1){ c=Math.min(c,5); plafond.push('geen toerental'); }
  if(!(sv.pids && sv.pids.total)){ c=1; plafond.push('geen PIDs'); }
  const cijfer=Math.max(1, Math.min(10, Math.round(c*10)/10));
  return { cijfer, oordeel: cijfer>=8 ? 'goed bruikbaar' : cijfer>=6 ? 'bruikbaar met beperkingen' : cijfer>=4 ? 'matig' : 'niet bruikbaar',
    brandstof, delen, plafond, config:oordeelConfig(sv, ctx, verbinding), pids:pidOverzicht(sv, ctx, weergaven) };
}

/* Compact voor opslag (Veldlab/Airtable): zonder de PID-tabel, die is af te leiden. */
function compact(res){
  const d=res.delen, uit={ cijfer:res.cijfer, brandstof:res.brandstof, plafond:res.plafond, delen:{} };
  Object.keys(d).forEach(k=>{ uit.delen[k]=d[k].score; });
  uit.weergaven=d.weergaven.lijst.map(r=>({id:r.id, oordeel:r.oordeel}));
  uit.afwijkend=d.afwijkend.lijst.map(a=>a.pid+':'+a.soort);
  uit.config=res.config.filter(a=>a.beter!=null).map(a=>a.wat+'→'+a.beter);
  return uit;
}

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const KLEUR={goed:'#4ade80', matig:'#fbbf24', ongeschikt:'#f87171'};
function html(res){
  const d=res.delen, kl=res.cijfer>=8?KLEUR.goed:res.cijfer>=6?KLEUR.matig:KLEUR.ongeschikt;
  const naam={verbinding:'Verbinding', basis:'Basisgegevens', dekking:'PID-dekking', weergaven:'Weergaven', afwijkend:'Afwijkende antwoorden'};
  let h='<div style="text-align:center"><div style="font-size:44px;font-weight:800;color:'+kl+'">'+res.cijfer.toFixed(1)+'</div>'+
    '<div>'+esc(res.oordeel)+' · '+esc(res.brandstof)+'</div>'+
    (res.plafond.length?'<div style="color:#f87171;font-size:13px">begrensd: '+esc(res.plafond.join(', '))+'</div>':'')+'</div>';
  h+='<h4>Onderdelen</h4><ul>';
  Object.keys(naam).forEach(k=>{
    const n=d[k].notities||[];
    h+='<li><b>'+naam[k]+' '+d[k].score.toFixed(1)+'</b>'+(n.length?'<br><span style="opacity:.8">'+n.map(esc).join('<br>')+'</span>':'')+'</li>';
  });
  h+='</ul><h4>Weergaven op deze auto</h4><ul>';
  d.weergaven.lijst.forEach(r=>{ h+='<li><span style="color:'+KLEUR[r.oordeel]+'">●</span> '+esc(r.naam)+' — '+esc(r.oordeel)+': '+esc(r.reden)+'</li>'; });
  h+='</ul>';
  if(d.afwijkend.lijst.length){
    h+='<h4>Afwijkende antwoorden</h4><ul>';
    d.afwijkend.lijst.slice(0,30).forEach(a=>{ h+='<li>'+esc(a.pid)+' '+esc(a.naam)+' — '+esc(a.soort)+': '+esc(a.detail)+'</li>'; });
    h+='</ul>';
  }
  if(res.config.length){
    h+='<h4>Configuratie</h4><ul>';
    res.config.forEach(a=>{ h+='<li>'+esc(a.wat)+': '+(a.beter!=null?esc(a.nu)+' → <b>'+esc(a.beter)+'</b>':'✓ '+esc(a.nu))+' — '+esc(a.reden)+'</li>'; });
    h+='</ul>';
  }
  const perCat={};
  res.pids.filter(p=>p.st==='ok').forEach(p=>{ (perCat[p.cat]=perCat[p.cat]||[]).push(p); });
  h+='<h4>PIDs per categorie</h4>';
  Object.keys(perCat).sort().forEach(c=>{
    h+='<details><summary>'+esc(c)+' ('+perCat[c].length+')</summary><ul>'+perCat[c].map(p=>
      '<li>'+esc(p.pid)+' '+esc(p.naam)+' — Slim: '+esc(p.slim||'—')+(p.visueel.length?' · visueel: '+esc(p.visueel.join(', ')):'')+'</li>').join('')+'</ul></details>';
  });
  return '<div style="text-align:left;font-weight:400;font-size:13px;line-height:1.45;max-height:62vh;overflow:auto;width:min(560px,92vw)">'+h+'</div>';
}

const API={ GEWICHT, KERN, beoordeel, compact, html, bruikbaar, brandstofVan };
if(typeof window!=='undefined') window.PLFunctieTest=API;
})();
