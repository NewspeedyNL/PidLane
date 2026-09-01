/* pidlane-archief.js — uitgelicht uit index.html (build 2026-07-19, splitronde 2).
   Laadt als <script src> op exact de oorspronkelijke positie in de
   documentvolgorde; top-level declaraties zijn in klassieke scripts
   globaal over blokgrenzen heen, dus alle bestaande aanroepen blijven
   ongewijzigd werken. Inhoud: sessie-rapportarchief (Rapporten-overzicht) incl. AI-contextkeuze. */
// ════════════════════════════════════════════════════════════════
//  SESSIE-RAPPORTARCHIEF
//  Alle rapporten van deze sessie blijven in het geheugen bewaard tot de
//  app wordt gesloten (bewust GEEN localStorage — sessie-gebonden):
//   • AI-rapporten     — via setter-hook op window._lastAIReport
//   • Foutcode-scans   — via registratie in scanDTC()
//   • TXT-exports      — via wrapper om download() (on load)
//   • PDF-rapporten    — via registratie na window._lastPdf in exportAIReportPDF
//  De AI krijgt eerdere rapporten automatisch als context mee: apiFetch()
//  plakt _sessionReportsPromptBlock() achter de system prompt, zodat een
//  volgende prompt kan voortbouwen op wat er al geconcludeerd is.
// ════════════════════════════════════════════════════════════════
window._sessionReports = window._sessionReports || [];
window._srSilent = false;   // true = _lastAIReport-set NIET archiveren (bv. bij terugkijken)
let _srSeq = 0;

function _srTypeMeta(type){
  return {
    ai:  {ic:'🔬', lbl:'AI-rapport'},
    dtc: {ic:'🔴', lbl:'Foutcode-uitlezing'},
    txt: {ic:'📝', lbl:'TXT-rapport'},
    pdf: {ic:'📄', lbl:'PDF-rapport'}
  }[type] || {ic:'📄', lbl:'Rapport'};
}
function _srAutoTitle(entry){
  try{
    const v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)?vehicleInfo:{};
    const veh=[v.merk,v.model].filter(Boolean).join(' ');
    // Eerste betekenisvolle regel van de tekst als titel (zonder markdown-ruis)
    const first=String(entry.text||'').split('\n').map(s=>s.replace(/[#*]/g,'').trim()).find(s=>s.length>3)||'';
    const base=first.slice(0,58)||_srTypeMeta(entry.type).lbl;
    return veh?base+(base.toLowerCase().includes((v.merk||'').toLowerCase())?'':' — '+veh):base;
  }catch(e){ return _srTypeMeta(entry.type).lbl; }
}
function registerSessionReport(entry){
  try{
    const list=window._sessionReports;
    const txt=String(entry.text||'').trim();
    if(!txt && entry.type!=='pdf') return null;
    // Dedupe: identieke tekst als de laatste entry van hetzelfde type → niet dubbel archiveren
    // (vangt o.a. TXT-download van een rapport dat al via de setter is gearchiveerd,
    //  en herhaald openen/opnieuw zetten van hetzelfde rapport)
    for(let i=list.length-1;i>=0;i--){
      if(list[i].type===entry.type){
        if(entry.type!=='pdf' && list[i].text===txt) return list[i];
        break;
      }
    }
    const rec={
      id:'sr'+(++_srSeq)+'_'+Date.now(),
      type:entry.type||'ai',
      title:entry.title||_srAutoTitle(entry),
      text:txt,
      html:entry.html||null,
      blob:entry.blob||null,
      fname:entry.fname||null,
      ts:(entry.ts instanceof Date && !isNaN(entry.ts))?entry.ts:new Date()
    };
    list.push(rec);
    _srUpdateBadge();
    try{ logUsage?.('sessie_rapport','type='+rec.type+';n='+list.length); }catch(e){ console.warn('logUsage mislukt:', e); }
    return rec;
  }catch(e){ return null; }
}
function _srUpdateBadge(){
  try{
    const b=document.getElementById('bnRepCnt'); if(!b) return;
    const n=(window._sessionReports||[]).length;
    b.textContent=n>9?'9+':String(n);
    b.style.display=n?'block':'none';
  }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
}
// Setter-hook: elke bestaande (en toekomstige) toewijzing aan window._lastAIReport
// archiveert automatisch — geen 5+ losse callsites aanpassen.
(function _srHookLastAIReport(){
  let _val = window._lastAIReport || null;
  try{
    Object.defineProperty(window,'_lastAIReport',{
      configurable:true,
      get(){ return _val; },
      set(v){
        _val=v;
        try{
          if(v && v.text && !window._srSilent){
            registerSessionReport({type:'ai', text:v.text, html:v.html||null, ts:v.ts});
          }
        }catch(e){ console.warn('registerSessionReport mislukt:', e); }
      }
    });
  }catch(e){ /* defineProperty geweigerd → archief werkt dan alleen via expliciete hooks */ }
})();
// TXT-download hook: pas na window-load wrappen zodat download() zeker bestaat.
window.addEventListener('load',function(){
  try{
    if(typeof window.download==='function' && !window.download._srWrapped){
      const _orig=window.download;
      const wrapped=async function(name,content){
        try{
          if(/\.txt$/i.test(String(name||'')) && typeof content==='string' && content.trim()){
            registerSessionReport({type:'txt', title:String(name), text:content, fname:String(name)});
          }
        }catch(e){ console.warn('registerSessionReport mislukt:', e); }
        return _orig.apply(this,arguments);
      };
      wrapped._srWrapped=true;
      window.download=wrapped;
    }
  }catch(e){ /* stil: wrapt window.download alleen als die al bestaat; ontbreekt hij dan gebeurt er niets */ }
  _srUpdateBadge();
});
// Leesbare tekst van de huidige foutcode-stand (voor archief + AI-context)
function _srDtcText(){
  try{
    const v=(typeof getVehicle==='function')?getVehicle():{};
    const L=['Foutcode-uitlezing — '+new Date().toLocaleString('nl-NL')];
    if(v.merk) L.push('Voertuig: '+[v.merk,v.model,v.year].filter(Boolean).join(' '));
    if(!dtcCodes.length){ L.push('Geen actieve foutcodes — alle systemen OK.'); }
    else dtcCodes.forEach(c=>{ const i=(typeof dtcInfo==='function')?dtcInfo(c):null; L.push(c+' — '+(i?i.desc:'Onbekende code')+(i&&i.sev?' [ernst: '+i.sev+']':'')); });
    return L.join('\n');
  }catch(e){ return 'Foutcode-uitlezing: '+(Array.isArray(dtcCodes)?dtcCodes.join(', ')||'geen codes':'?'); }
}
// ══════════════════════════════════════════════════════════════════
//  VÓÓR DE ANALYSE — één venster, twee soorten vragen (issue #62)
// ──────────────────────────────────────────────────────────────────
//  Hier stond alleen de vraag "mogen eerdere rapporten mee?". Dat is een
//  vraag over HERGEBRUIK. Wat ontbrak is de andere kant: een paar korte
//  vragen over de meting zelf, waarmee de AI geen verkeerde conclusie
//  trekt uit iets wat helemaal normaal is.
//
//  Het duidelijkste voorbeeld is start/stop. Een motor die bij stilstand
//  uit gaat ziet er in de data uit als afslaan: toerental naar 0, spanning
//  zakt, koelwater loopt op zonder circulatie. Zonder die ene vraag is er
//  geen enkele manier waarop de AI dat onderscheid kan maken — en een
//  rapport dat "de motor slaat af" meldt op een auto die precies doet wat
//  hij hoort te doen, is erger dan geen rapport.
//
//  Eén venster en niet twee: de gebruiker staat op het punt een analyse te
//  starten en betaalt daar tokens voor. Drie schermen achter elkaar (vragen
//  → rapporten → kosten) is er één te veel.
//
//  Het element houdt bewust de id 'srCtxAsk': de Android-terugknopladder in
//  appBack() hieronder en test-terugknop.js kennen die naam. Een hernoeming
//  zou daar stil doorheen glippen.
// ══════════════════════════════════════════════════════════════════

// null = nog niet gekozen → vraag tonen bij de eerstvolgende analyse;
// true/false = onthouden sessiekeuze (aanpasbaar in het Rapporten-overzicht).
window._srUseContext = null;

// null = nog niet ingevuld. Daarna een object met een antwoord per vraag.
window._plMeetcontext = null;

// De vragen. Data en geen code, zodat er een vraag bij kan zonder dat het
// venster of de promptregel verandert. Antwoord '' = "weet ik niet" en
// levert BEWUST geen promptregel op: dat de gebruiker het niet weet helpt de
// AI niet, en elke regel kost tokens.
const PL_VOORVRAGEN = [
  { key:'startstop',
    vraag:'Start/stop-systeem',
    uitleg:'Zet de motor zichzelf uit bij stilstand, en stond dat aan tijdens deze meting?',
    opties:[['ja','Ja, actief'],['nee','Nee / uit'],['','Weet ik niet']],
    prompt:{
      ja:'Start/stop is actief en is tijdens deze meting gebruikt. Een toerental dat bij stilstand naar 0 gaat en een spanningsdip bij het herstarten zijn dan NORMAAL — rapporteer dat niet als afslaan of als accu-/dynamoprobleem.',
      nee:'Start/stop stond uit of ontbreekt op deze auto. De motor hoort bij stilstand dus gewoon door te draaien; gaat hij toch uit, dan is dat wél een bevinding.' } },
  { key:'klacht',
    vraag:'Deed de klacht zich voor?',
    uitleg:'Was het probleem waar je voor meet er tijdens deze meting ook echt?',
    opties:[['ja','Ja, tijdens deze meting'],['nee','Nee, niet nu'],['','Weet ik niet']],
    prompt:{
      ja:'De klacht deed zich tijdens deze meting daadwerkelijk voor. Afwijkingen in deze data mogen dus aan de klacht gekoppeld worden.',
      nee:'De klacht deed zich tijdens deze meting NIET voor. Concludeer daarom niet dat er niets aan de hand is: deze data kan de klacht niet ontkrachten, hoogstens bepaalde oorzaken minder waarschijnlijk maken.' } },
  { key:'stabiel',
    vraag:'Stabiele meting, geen gaten?',
    uitleg:'Bleef de verbinding staan en liep de datastroom door?',
    opties:[['ja','Ja, aaneengesloten'],['nee','Nee, onderbroken'],['','Weet ik niet']],
    prompt:{
      ja:'De meting liep aaneengesloten door zonder onderbrekingen.',
      nee:'De meting had onderbrekingen of gaten. Beoordeel ontbrekende, springende of bevroren waarden dus eerst als meetartefact en niet als defect.' } }
];

// Voorstel voor de stabiliteitsvraag. De app weet dit deels zelf, dus vragen
// zonder voor te vullen is de gebruiker laten raden naar wat er al gemeten is.
// Bewust een VOORSTEL en geen automatisch antwoord: alleen de gebruiker weet
// of de adapter tussendoor los heeft gezeten.
function plMeetStabielVoorstel(){
  try{
    const pids=[...(activePIDs||[])].filter(p=>Array.isArray(pidHist[p]) && pidHist[p].length>=5);
    if(!pids.length) return {waarde:'', reden:'nog te weinig metingen om hier iets over te zeggen'};
    let gaten=0;
    pids.forEach(p=>{
      const h=pidHist[p].slice(-60);
      const dt=[];
      for(let i=1;i<h.length;i++){ const d=(h[i].t||0)-(h[i-1].t||0); if(d>0) dt.push(d); }
      if(dt.length<4) return;
      const gesorteerd=dt.slice().sort((a,b)=>a-b);
      const mediaan=gesorteerd[Math.floor(gesorteerd.length/2)];
      // Vier keer het eigen ritme én minstens vier seconden: trage sensoren
      // (temperatuur, niveau) mogen niet als gat tellen omdat ze traag zijn.
      if(dt.some(d=>d>Math.max(mediaan*4, 4000))) gaten++;
    });
    if(gaten) return {waarde:'nee', reden:gaten+' van de '+pids.length+' sensoren heeft een gat in de reeks'};
    if(typeof dataStable!=='undefined' && !dataStable)
      return {waarde:'', reden:'geen gaten gezien, maar de datastroom is nog niet als stabiel gemeld'};
    return {waarde:'ja', reden:'geen gaten in de reeksen en de datastroom staat als stabiel'};
  }catch(e){ return {waarde:'', reden:'niet vast te stellen'}; }
}

// De regel die aan élke AI-prompt geplakt wordt.
function plMeetcontextPromptLine(){
  try{
    const m=window._plMeetcontext;
    if(!m) return '';
    const r=[];
    PL_VOORVRAGEN.forEach(v=>{
      const a=m[v.key];
      if(a && v.prompt && v.prompt[a]) r.push('- '+v.prompt[a]);
    });
    const extra=String(m.extra||'').trim();
    if(extra) r.push('- Opgegeven door de gebruiker: '+extra);
    if(!r.length) return '';
    return '\n\nMEETCONTEXT (door de gebruiker opgegeven vlak vóór deze analyse — weeg dit mee vóór je een conclusie trekt):\n'+r.join('\n');
  }catch(e){ return ''; }
}

// Korte samenvatting voor het Rapporten-overzicht.
function plMeetcontextKort(){
  const m=window._plMeetcontext;
  if(!m) return 'nog niet ingevuld';
  const p=PL_VOORVRAGEN
    .filter(v=>m[v.key])
    .map(v=>v.vraag.replace(/\?$/,'')+': '+(m[v.key]==='ja'?'ja':'nee'));
  if(String(m.extra||'').trim()) p.push('opmerking');
  return p.length?p.join(' · '):'alles op "weet ik niet"';
}

let _srAskPending = null;
// Vraagt wat er nog te vragen valt en lost op met {rapporten:bool}.
// Valt er niets meer te vragen, dan verschijnt er ook geen venster.
function plVoorAnalyse(heeftRapporten){
  const vraagRapporten = !!heeftRapporten && window._srUseContext===null;
  const vraagContext   = (window._plMeetcontext===null);
  if(!vraagRapporten && !vraagContext)
    return Promise.resolve({rapporten: window._srUseContext===true});
  if(_srAskPending) return _srAskPending;

  _srAskPending = new Promise(res=>{
    let ov=document.getElementById('srCtxAsk');
    if(!ov){ ov=document.createElement('div'); ov.id='srCtxAsk'; ov.className='ai-sheet-ov'; ov.style.zIndex='9920'; document.body.appendChild(ov); }

    const voorstel = plMeetStabielVoorstel();
    // Voorvullen met wat er al bekend is: het voorstel voor stabiliteit, en
    // voor de rest wat er in een eerdere ronde is geantwoord.
    const staat = Object.assign({startstop:'', klacht:'', stabiel:voorstel.waarde, extra:''}, window._plMeetcontext||{});

    const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const n=(window._sessionReports||[]).filter(r=>r.text&&r.type!=='pdf').length;

    const vraagHtml=v=>{
      const knoppen=v.opties.map(o=>
        '<button type="button" class="pl-vk'+(staat[v.key]===o[0]?' on':'')+'" data-vraag="'+v.key+'" data-waarde="'+esc(o[0])+'">'+esc(o[1])+'</button>').join('');
      const tip=(v.key==='stabiel'&&voorstel.reden)
        ? '<div style="font-size:10.5px;color:var(--tx3);margin-top:4px">Voorstel uit de meting: '+esc(voorstel.reden)+'</div>' : '';
      return '<div style="padding:9px 0;border-top:1px solid var(--bd)">'+
        '<div style="font-size:12px;font-weight:700;color:var(--tx)">'+esc(v.vraag)+'</div>'+
        '<div style="font-size:11px;color:var(--tx3);margin:2px 0 6px">'+esc(v.uitleg)+'</div>'+
        '<div style="display:flex;gap:5px;flex-wrap:wrap">'+knoppen+'</div>'+tip+
      '</div>';
    };

    const rapportBlok = vraagRapporten
      ? '<div style="border:1px solid var(--bd);border-radius:10px;padding:10px;margin-bottom:10px;background:var(--sur2)">'+
          '<div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:2px">📄 Eerdere rapporten meenemen?</div>'+
          '<div style="font-size:11px;color:var(--tx3);margin-bottom:7px">Er '+(n===1?'is 1 eerder rapport':'zijn '+n+' eerdere rapporten')+' in deze sessie. De AI kan daarmee melden of een eerdere bevinding is verbeterd of verslechterd.</div>'+
          '<div style="display:flex;gap:5px">'+
            '<button type="button" class="pl-vk on" data-vraag="_rap" data-waarde="ja">Ja, neem mee</button>'+
            '<button type="button" class="pl-vk" data-vraag="_rap" data-waarde="nee">Nee, alleen deze meting</button>'+
          '</div>'+
          '<label style="display:flex;align-items:center;gap:7px;margin-top:8px;font-size:10.5px;color:var(--tx3);cursor:pointer"><input type="checkbox" id="srCtxRemember" checked style="accent-color:var(--bl)"> Onthoud deze keuze voor de rest van de sessie</label>'+
        '</div>'
      : '';

    ov.innerHTML='<div class="ai-sheet" style="max-width:460px">'+
      '<div class="ai-sheet-h"><b>🧭 Voor de analyse</b></div>'+
      '<div class="ai-sheet-b">'+
        rapportBlok+
        (vraagContext
          ? '<div style="font-size:11.5px;color:var(--tx2);line-height:1.45">Vier korte vragen. Ze voorkomen dat de AI iets als storing leest wat gewoon normaal gedrag is — start/stop is daar het bekendste voorbeeld van.</div>'+
            PL_VOORVRAGEN.map(vraagHtml).join('')+
            '<div style="padding:9px 0;border-top:1px solid var(--bd)">'+
              '<div style="font-size:12px;font-weight:700;color:var(--tx)">Nog iets dat de AI moet weten?</div>'+
              '<div style="font-size:11px;color:var(--tx3);margin:2px 0 6px">Bijvoorbeeld: recent onderhoud, een net vervangen onderdeel, aanhanger achter de auto.</div>'+
              '<input id="plVaExtra" type="text" maxlength="200" placeholder="Optioneel — één zin is genoeg" value="'+esc(staat.extra||'')+'" style="width:100%;box-sizing:border-box;font-family:var(--f);font-size:12px;padding:8px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--sur2);color:var(--tx)">'+
            '</div>'
          : '')+
      '</div>'+
      '<div class="ai-sheet-f"><button class="ai-act" id="srCtxSkip">Overslaan</button><button class="ai-act pri" id="srCtxGo">Analyseer</button></div>'+
    '</div>';

    // De keuzeknoppen: één antwoord per vraag, direct zichtbaar.
    const gekozen={_rap:'ja'};
    Object.keys(staat).forEach(k=>{ gekozen[k]=staat[k]; });
    ov.querySelectorAll('.pl-vk').forEach(b=>{
      b.onclick=()=>{
        const v=b.dataset.vraag;
        gekozen[v]=b.dataset.waarde;
        ov.querySelectorAll('.pl-vk[data-vraag="'+v+'"]').forEach(x=>x.classList.remove('on'));
        b.classList.add('on');
      };
    });

    const done=(bewaarContext)=>{
      let rapporten=true;
      if(vraagRapporten){
        rapporten = gekozen._rap!=='nee';
        const onthoud=!!document.getElementById('srCtxRemember')?.checked;
        if(onthoud) window._srUseContext=rapporten;
      } else {
        rapporten = window._srUseContext===true;
      }
      if(bewaarContext && vraagContext){
        const extraEl=document.getElementById('plVaExtra');
        window._plMeetcontext={
          startstop:gekozen.startstop||'', klacht:gekozen.klacht||'', stabiel:gekozen.stabiel||'',
          extra:String((extraEl&&extraEl.value)||'').trim()
        };
        try{ logUsage?.('meetcontext', plMeetcontextKort()); }catch(e){ console.warn('logUsage mislukt:', e); }
      }
      ov.style.display='none'; _srAskPending=null; window._srCtxDismiss=null;
      res({rapporten:rapporten});
    };

    ov.querySelector('#srCtxGo').onclick=()=>done(true);
    // Overslaan legt de meetcontext WEL vast, maar leeg. Anders staat het
    // venster bij elke volgende analyse opnieuw in de weg — en dat is precies
    // hoe een nuttige vraag een klik wordt die niemand meer leest.
    ov.querySelector('#srCtxSkip').onclick=()=>{
      if(vraagContext) window._plMeetcontext={startstop:'',klacht:'',stabiel:'',extra:''};
      done(false);
    };
    // Wegklikken / hardware-back = deze keer niets meenemen, niets onthouden.
    window._srCtxDismiss=()=>{ gekozen._rap='nee'; done(false); };
    ov.onclick=e=>{ if(e.target===ov) window._srCtxDismiss?.(); };
    ov.style.display='flex';
  });
  return _srAskPending;
}

// Meetcontext opnieuw laten vragen (knop in het Rapporten-overzicht).
function plMeetcontextReset(){
  window._plMeetcontext=null;
  try{ openReportsOverview(); }catch(e){ console.warn('openReportsOverview mislukt:', e); }
}

function srSetCtxMode(m){
  window._srUseContext = m==='on' ? true : m==='off' ? false : null;
  try{ openReportsOverview(); }catch(e){ console.warn('openReportsOverview mislukt:', e); }   // overzicht verversen met nieuwe stand
}
// Contextblok met eerdere sessie-rapporten voor AI-prompts.
// Compact gehouden (tokenbudget): max 4 rapporten, nieuwste eerst gekozen maar
// chronologisch gepresenteerd, per rapport ingekort, totaal ~6000 tekens.
function _sessionReportsPromptBlock(currentPrompt){
  try{
    const list=(window._sessionReports||[]).filter(r=>r.text && r.type!=='pdf');
    if(!list.length) return '';
    const cur=String(currentPrompt||'');
    const picked=[]; const seen=[];
    for(let i=list.length-1;i>=0 && picked.length<4;i--){
      const t=list[i].text.trim(); if(!t) continue;
      // Al (deels) in de huidige prompt (bv. bij "herzie rapport")? → overslaan
      if(cur && t.length>80 && cur.indexOf(t.slice(0,200))!==-1) continue;
      // Duplicaat/deelverzameling van al gekozen tekst? → overslaan
      if(seen.some(s=>s===t||s.indexOf(t)!==-1||t.indexOf(s)!==-1)) continue;
      seen.push(t); picked.unshift(list[i]);
    }
    if(!picked.length) return '';
    let out='\n\nEERDERE RAPPORTEN DEZE SESSIE (zelfde meetsessie — gebruik als context en verwijs ernaar waar relevant, bv. of een eerdere bevinding is verbeterd/verslechterd; herhaal ze niet integraal):';
    let budget=6000;
    picked.forEach((r,i)=>{
      let t=r.text.replace(/[ \t]+\n/g,'\n').trim();
      const cap=Math.max(400,Math.min(1800,budget));
      if(t.length>cap) t=t.slice(0,cap)+'\n[...rapport ingekort voor context...]';
      budget-=t.length;
      out+='\n--- Rapport '+(i+1)+' ('+_srTypeMeta(r.type).lbl+', '+r.ts.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})+') ---\n'+t;
    });
    return out;
  }catch(e){ return ''; }
}
// ── Overzicht-UI ──
function openReportsOverview(){
  let ov=document.getElementById('reportsOverviewSheet');
  if(!ov){ ov=document.createElement('div'); ov.id='reportsOverviewSheet'; ov.className='ai-sheet-ov'; ov.style.zIndex='9890'; document.body.appendChild(ov);
    ov.addEventListener('click',e=>{ if(e.target===ov) closeReportsOverview(); });
  }
  const list=[...(window._sessionReports||[])].reverse(); // nieuwste boven
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let rows='';
  if(!list.length){
    rows='<div class="emp" style="padding:26px 0"><div class="ei">📄</div><h3>Nog geen rapporten</h3><p>Start een analyse of scan foutcodes — alles verschijnt hier.</p></div>';
  }else{
    rows=list.map(r=>{
      const m=_srTypeMeta(r.type);
      const tijd=r.ts.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
      let acts='';
      if(r.type==='pdf'){ acts='<button class="ai-act pri" style="padding:6px 12px;font-size:11px" onclick="srShare(\''+r.id+'\')">💾 Delen / Download</button>'; }
      else { acts='<button class="ai-act pri" style="padding:6px 12px;font-size:11px" onclick="srOpen(\''+r.id+'\')">👁 Bekijk</button>'+
                  '<button class="ai-act" style="padding:6px 12px;font-size:11px" onclick="srShare(\''+r.id+'\')">↗ Deel</button>'; }
      return '<div style="display:flex;gap:10px;align-items:center;padding:11px 2px;border-bottom:1px solid var(--bd)">'+
        '<div style="font-size:20px;flex:none">'+m.ic+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:12px;font-weight:800;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(r.title)+'</div>'+
          '<div style="font-size:11px;color:var(--tx3)">'+m.lbl+' · '+tijd+(r.fname?' · '+esc(r.fname):'')+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:5px;flex:none">'+acts+'</div>'+
      '</div>';
    }).join('');
  }
  const mode=window._srUseContext===true?'on':window._srUseContext===false?'off':'ask';
  const seg=(id,lbl)=>{const act=mode===id;return '<button onclick="srSetCtxMode(\''+id+'\')" style="flex:1;padding:6px 4px;border-radius:8px;border:1px solid '+(act?'var(--bl)':'var(--bd)')+';background:'+(act?'rgba(26,111,255,.12)':'var(--sur2)')+';color:'+(act?'var(--bl)':'var(--tx3)')+';font-size:11px;font-weight:800;cursor:pointer;font-family:var(--f)">'+lbl+'</button>';};
  ov.innerHTML='<div class="ai-sheet">'+
    '<div class="ai-sheet-h"><b>📄 Rapporten deze sessie ('+list.length+')</b><button class="ai-sheet-x" onclick="closeReportsOverview()">✕</button></div>'+
    '<div class="ai-sheet-b">'+
      '<div style="font-size:11px;color:var(--tx3);margin-bottom:6px">Bewaard tot de app wordt gesloten.</div>'+
      '<div style="border:1px solid var(--bd);border-radius:10px;padding:9px 10px;margin-bottom:10px;background:var(--sur2)">'+
        '<div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:2px">🤖 Meenemen in nieuwe analyse</div>'+
        '<div style="font-size:11px;color:var(--tx3);margin-bottom:7px">Gebruikt de AI eerdere rapporten als context bij een volgende analyse?</div>'+
        '<div style="display:flex;gap:5px">'+seg('ask','❓ Vragen')+seg('on','✅ Altijd')+seg('off','🚫 Nooit')+'</div>'+
      '</div>'+
      // De meetcontext staat hier omdat een fout antwoord élke volgende
      // analyse vergiftigt: "start/stop staat uit" op een auto die hem wél
      // heeft, en de AI blijft afslaan melden. Zichtbaar én corrigeerbaar.
      '<div style="border:1px solid var(--bd);border-radius:10px;padding:9px 10px;margin-bottom:10px;background:var(--sur2)">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:2px">🧭 Meetcontext</div>'+
            '<div style="font-size:11px;color:var(--tx3)">'+esc(plMeetcontextKort())+'</div>'+
          '</div>'+
          '<button class="ai-act" style="flex:none;padding:6px 12px;font-size:11px" onclick="plMeetcontextReset()">Opnieuw vragen</button>'+
        '</div>'+
      '</div>'+
      rows+
    '</div>'+
  '</div>';
  ov.style.display='flex';
}
function closeReportsOverview(){ const o=document.getElementById('reportsOverviewSheet'); if(o) o.style.display='none'; }
function srOpen(id){
  const r=(window._sessionReports||[]).find(x=>x.id===id); if(!r) return;
  if(r.type==='ai'){
    // Rapport terugzetten als "actief" rapport zodat Deel/PDF/Herzie erop werken.
    // _srSilent voorkomt dat het terugkijken een duplicaat in het archief zet.
    window._srSilent=true;
    try{ window._lastAIReport={text:r.text, html:r.html||_aiReportHtml(r.text), ts:r.ts}; }
    finally{ window._srSilent=false; }
    closeReportsOverview();
    try{ openAIReportSheet(); }catch(e){ console.warn('openAIReportSheet mislukt:', e); }
    return;
  }
  if(r.type==='pdf'){ srShare(id); return; }
  // dtc / txt: eenvoudige tekstweergave
  let ov=document.getElementById('srTextSheet');
  if(!ov){ ov=document.createElement('div'); ov.id='srTextSheet'; ov.className='ai-sheet-ov'; ov.style.zIndex='9910'; document.body.appendChild(ov);
    ov.addEventListener('click',e=>{ if(e.target===ov) ov.style.display='none'; });
  }
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const m=_srTypeMeta(r.type);
  ov.innerHTML='<div class="ai-sheet">'+
    '<div class="ai-sheet-h"><b>'+m.ic+' '+esc(r.title)+'</b><button class="ai-sheet-x" onclick="document.getElementById(\'srTextSheet\').style.display=\'none\'">✕</button></div>'+
    '<div class="ai-sheet-b"><div style="white-space:pre-wrap;font-size:12px;line-height:1.55;color:var(--tx)">'+esc(r.text)+'</div></div>'+
    '<div class="ai-sheet-f"><button class="ai-act" onclick="srShare(\''+r.id+'\')">↗ Deel</button><button class="ai-act pri" onclick="srDownloadTxt(\''+r.id+'\')">⬇ Download .txt</button></div>'+
  '</div>';
  ov.style.display='flex';
}
async function srShare(id){
  const r=(window._sessionReports||[]).find(x=>x.id===id); if(!r) return;
  if(r.type==='pdf'){
    if(!r.blob){ showToast?.('PDF niet meer beschikbaar — genereer opnieuw'); return; }
    window._lastPdf={blob:r.blob, fname:r.fname||'PidLane-rapport.pdf'};
    try{ showPdfReadyModal(); }catch(e){ console.warn('showPdfReadyModal mislukt:', e); }
    return;
  }
  // Ook hier eerst de formaatkeuze: een sessierapport is precies zo'n stuk dat
  // je aan een klant laat zien, en dan is platte tekst het verkeerde antwoord.
  try{
    if(typeof plOpslaan==='function'){
      const basis=(r.fname||((typeof _niceReportName==='function')?_niceReportName('txt'):'PidLane-rapport')).replace(/\.(txt|pdf)$/i,'');
      plOpslaan(basis, r.text, {titel:r.title||'Sessierapport'});
      return;
    }
  }catch(e){ console.warn('plOpslaan mislukt:', e); }
  try{
    const blob=new Blob([r.text],{type:'text/plain'});
    const fname=r.fname||((typeof _niceReportName==='function')?_niceReportName('txt'):'PidLane-rapport.txt');
    if(await nativeShareFile(blob,fname)) return;
  }catch(e){ console.warn('nativeShareFile mislukt:', e); }
  try{
    if(navigator.share){ await navigator.share({title:r.title, text:r.text}); }
    else if(navigator.clipboard){ await navigator.clipboard.writeText(r.text); showToast?.('Rapport naar klembord gekopieerd'); }
  }catch(e){ /* stil: melding mag nooit de stroom breken */ }
}
async function srDownloadTxt(id){
  const r=(window._sessionReports||[]).find(x=>x.id===id); if(!r||!r.text) return;
  const fname=r.fname||((typeof _niceReportName==='function')?_niceReportName('txt'):'PidLane-rapport.txt');
  try{ await download(fname, r.text); }catch(e){ console.warn('download mislukt:', e); }
}

// ── BACK-NAVIGATIE + ANDROID HARDWARE-BACK ──
// ══════════════════════════════════════════════════════════════════
// DE ANDROID-TERUGKNOP — één ketting, één plek
// ──────────────────────────────────────────────────────────────────
// Back loopt netjes terug: open overlay → dicht; deur-paneel → terug naar
// de 4 keuzes; in een mode → terug naar home. Op de root gebeurt er niets:
// de terugknop schakelt PidLane NIET weg.
//
// WAAROM DIE LAATSTE REGEL ER STAAT (01-09-2026)
// Tot vandaag hingen er TWEE luisteraars aan 'backButton': deze, en een
// tweede in pidlane-theme.js (closeTopOverlay). Capacitor roept ze allebei
// aan — een luisteraar onderdrukt de ander niet. De tweede deed
// minimizeApp() zodra zijn eigen, kortere lijst niets herkende. Op het
// welkomstscherm herkende die lijst per definitie niets, dus ging de app
// bij de eerste tik naar de achtergrond, dwars door de "tik nogmaals om af
// te sluiten"-melding van deze handler heen.
//
// Daarom hielpen twee eerdere reparaties niet: ze zaten allebei hier,
// terwijl de app hiernaast werd weggeschakeld. De les is niet welke van de
// twee gelijk had, maar de vorm: twee luisteraars op één hardwareknop zijn
// geen dubbele zekerheid maar een race, en de verliezer is onzichtbaar.
// Er is er nu nog precies één, en test-terugknop.js bewaakt dat.
//
// Ook weg: exitApp() op een tweede tik. De opdracht is dat de terugknop de
// app nooit wegschakelt — niet afsluiten en niet minimaliseren. Verlaten
// gaat met de home-knop of het takenoverzicht; dat is een bewuste handeling
// en geen tik die er net naast zat.
// ══════════════════════════════════════════════════════════════════

// Zichtbaar = hangt in de DOM, heeft geen .hidden en is niet display:none.
// De .hidden-toets komt uit de oude closeTopOverlay(): een deel van de app
// verbergt met die class in plaats van met een inline display, en zonder
// die toets "sluit" back een venster dat allang dicht is — en doet de knop
// in de ogen van de gebruiker dus niets.
function _plZichtbaar(el){
  if(!el) return false;
  if(el.classList && el.classList.contains('hidden')) return false;
  try{ return getComputedStyle(el).display!=='none'; }
  catch(e){ /* stil: element hangt (nog) niet in de DOM — dan is het niet zichtbaar */ return false; }
}

function appBack(){
  // 0. Open lade (sensoren/logs) eerst sluiten
  try{ if(ladeOpen()){ closeLades(); return true; } }catch(e){ console.warn('closeLades mislukt:', e); }
  // 0b. Context-keuzesheet open? Netjes afwijzen (promise resolven, niet hangen)
  try{ const c=document.getElementById('srCtxAsk'); if(_plZichtbaar(c)){ window._srCtxDismiss?.(); return true; } }catch(e){ /* stil: element bestaat niet of DOM is nog niet klaar */ }
  // 1. AI-rapport sheet of bekende modals/overlays open? sluit de bovenste.
  //    needsUpdateModal kwam uit de tweede handler; die id stond hier niet en
  //    was dus onbereikbaar voor back zodra die handler weg is.
  for(const id of ['srTextSheet','aiReportSheet','pdfReadyModal','needsUpdateModal','reportsOverviewSheet','optResultModal','scenarioModal','btLogModal','ritFocusModal','apiDialog','hudPicker','bandenInfoModal','proefritKeuzeModal','logCenter','vehOverview','demoCarModal']){
    const el=document.getElementById(id);
    if(_plZichtbaar(el)){ el.style.display='none'; return true; }
  }
  // 1b. Onderdelen-/scenario-picker (heeft geen vaste id, alleen een class)
  const picker=document.querySelector('.pick-overlay, .onderdelen-overlay');
  if(_plZichtbaar(picker)){ picker.style.display='none'; return true; }
  // 2. Dashboards / sub-overlays met eigen display
  let closed=false;
  ['onderhoudDash','evDash','langeRitDash'].forEach(id=>{ const el=document.getElementById(id); if(_plZichtbaar(el)){ el.style.display='none'; closed=true; } });
  if(closed){ try{ goHome(); }catch(e){ console.warn('goHome mislukt:', e); } return true; }
  // 27-07-2026 — hier stonden twee id's die nergens in de app bestaan
  // ('ritAnalyseOv' en 'ritAnalyse'). Het echte element heet #ritDash. Gevolg:
  // de Android-terugknop deed tijdens een lopende rit-analyse niets — hij viel
  // stil door naar de volgende tak. Ook de caravan-dash ontbrak hier.
  // Een LOPENDE meting wordt geminimaliseerd (loopt door, met pill), een
  // afgeronde wordt gesloten. Zelfde gedrag als plCloseModeOverlays().
  try{
    const rd=document.getElementById('ritDash');
    if(_plZichtbaar(rd)){
      if(typeof ritActive!=='undefined' && ritActive && typeof minimizeRitAnalyse==='function') minimizeRitAnalyse();
      else if(typeof closeRitAnalyse==='function') closeRitAnalyse();
      else rd.style.display='none';
      return true;
    }
    const cd=document.getElementById('caravanDash');
    if(_plZichtbaar(cd)){
      if(typeof caravanActive!=='undefined' && caravanActive && typeof minimizeCaravanDash==='function') minimizeCaravanDash();
      else if(typeof closeCaravanDash==='function') closeCaravanDash();
      else cd.style.display='none';
      return true;
    }
  }catch(e){ console.warn('closeCaravanDash mislukt:', e); }
  // 2b. Neon-dashboard, airco/wintercheck — kwamen uit de tweede handler
  const neon=document.getElementById('neonDash');
  if(_plZichtbaar(neon)){
    if(typeof closeNeonDashboard==='function') closeNeonDashboard(); else neon.style.display='none';
    return true;
  }
  const clim=document.getElementById('climateDash');
  if(_plZichtbaar(clim)){
    if(typeof closeClimateCheck==='function') closeClimateCheck(); else clim.style.display='none';
    return true;
  }
  // 2c. Kebabmenu open? Dat is de bovenste laag zodra er verder niets openstaat.
  const kebab=document.getElementById('kebabMenu');
  if(kebab && kebab.classList.contains('open')){
    try{ closeKebab(); }catch(e){ console.warn('closeKebab mislukt:', e); }
    return true;
  }
  // 2d. Verbind-overlay: alleen sluiten als er al verbinding is (of demo).
  //     Staat hij er omdat er nog NIETS is, dan moet hij blijven staan — anders
  //     kijkt de gebruiker naar een leeg scherm zonder weg terug.
  const connOv=document.getElementById('connOv');
  if(_plZichtbaar(connOv) && ((typeof connected!=='undefined' && connected) || (typeof demoMode!=='undefined' && demoMode))){
    try{ closeConnOv(); }catch(e){ console.warn('closeConnOv mislukt:', e); }
    return true;
  }
  // 3. Welkomstscherm zichtbaar?
  const ws=document.getElementById('welcomeScreen');
  if(ws && !ws.classList.contains('hidden')){
    const doorOpen=[...document.querySelectorAll('.wm-door-panel')].some(p=>getComputedStyle(p).display!=='none');
    if(doorOpen){ backToDoors(); return true; }
    return false; // op de root-keuze → niets te doen, en niet afsluiten
  }
  // 4. In een mode/pane → terug naar home
  try{ goHome(); return true; }catch(e){ console.warn('goHome mislukt:', e); }
  return false;
}

function _plBackHandler(){
  let handled=false;
  try{ handled=appBack(); }catch(e){ console.warn('appBack mislukt:', e); }
  if(handled) return;
  // Root bereikt en er valt niets te sluiten. Hier stond exitApp(); dat is er
  // uit. De terugknop mag de app niet wegschakelen — niet afsluiten en niet
  // minimaliseren. Wel één korte melding, hooguit eens per twee seconden,
  // zodat de knop niet stuk lijkt.
  if(window._plBackMelding) return;
  window._plBackMelding=true;
  setTimeout(()=>{ window._plBackMelding=false; },2000);
  try{ showToast?.('Je bent op het startscherm — de terugknop sluit PidLane niet',1800); }
  catch(e){ console.warn('showToast mislukt:', e); }
}

function setupBackButton(){
  if(window._plBackReady) return; window._plBackReady=true;
  const A=window.Capacitor?.Plugins?.App;
  if(A&&A.addListener){
    // Capacitor (APK): vang de hardware-back op. Zolang er één JS-luisteraar
    // is, doet de native AppPlugin zelf niets meer — daarom mag er ook maar
    // één zijn, en daarom staat hij hier.
    try{ A.addListener('backButton',()=>{ _plBackHandler(); }); return; }catch(e){ console.warn('_plBackHandler mislukt:', e); }
  }
  // Browser/WebView zonder App-plugin: history-trap zodat back niet de pagina verlaat.
  try{
    history.pushState({pl:1},'');
    window.addEventListener('popstate',()=>{ _plBackHandler(); history.pushState({pl:1},''); });
  }catch(e){ console.warn('_plBackHandler mislukt:', e); }
}
document.addEventListener('DOMContentLoaded', setupBackButton);

// ── ON-TOP LADES (sensoren + logs) ──
// PID-menu (#slPanel) en logboek (#logbar) schuiven als bottom-sheet op,
// blijven boven het werkscherm (niets cancelt) en zijn uitvouwbaar naar boven.
function initLades(){
  const sl=document.getElementById('slPanel');
  if(sl && !sl.querySelector('.lade-bar')){
    const bar=document.createElement('div'); bar.className='lade-bar';
    bar.innerHTML='<b style="font-size:13px">🚗 Sensoren &amp; PIDs</b><div class="sp"></div>'
      +'<button class="lade-x" title="Vergroten/verkleinen" onclick="toggleLadeTall(\'slPanel\')">⤢</button>'
      +'<button class="lade-x" title="Sluiten" onclick="closeLades()">✕</button>';
    sl.insertBefore(bar, sl.firstChild);
  }
  // Portal: #slPanel naar <body>. #appScale krijgt transform:scale() (zoom)
  // en een transform maakt de voorouder het referentiepunt voor position:fixed-
  // kinderen — daardoor belandde de lade zwevend/half zichtbaar in de content
  // (verticale label, lege inhoud). Op <body> is fixed altijd viewport-gebonden
  // (zelfde bewezen patroon als het ⋯-menu).
  if(sl && sl.parentNode!==document.body) document.body.appendChild(sl);
  // Log-lade bewust NIET meer aanmaken: logs lopen uitsluitend via het
  // log-centrum (⋯-menu → "📋 Logs & data"). #logbar blijft verborgen bestaan
  // als schrijfdoel van log(); localLog voedt het log-centrum.
}
function toggleLade(id){
  const el=document.getElementById(id); if(!el) return;
  const open=el.classList.contains('lade-open');
  closeLades();
  if(!open){ el.classList.add('lade-open'); if(id==='slPanel'){ el.classList.add('lade-tall'); try{ setPidView('dots'); }catch(e){ console.warn('setPidView mislukt:', e); } } }
}
function closeLades(){ ['slPanel','logLade'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.remove('lade-open'); }); }
function toggleLadeTall(id){ const el=document.getElementById(id); if(el) el.classList.toggle('lade-tall'); }
function ladeOpen(){ return ['slPanel','logLade'].some(id=>{ const el=document.getElementById(id); return el && el.classList.contains('lade-open'); }); }
document.addEventListener('DOMContentLoaded', initLades);

// ── Linkerpaneel (PID-selectie) per analyse vergrendelen ───────────
// Veel modes hebben geen handmatige PID-keuze nodig. Die verbergen we dan
// vergrendeld (geen auto-hide-flikker), met een knop om hem toch te tonen.
// PID-selectie is alleen zinvol bij Live data en Grafiek.
const PID_RELEVANT = new Set(['live','graph']);
let _slLocked=false;
function setLeftPanelForMode(mode){
  const needsPID = PID_RELEVANT.has(mode);
  if(needsPID){
    _slLocked=false;
    unlockLeftPanel();        // gebruiker mag zelf in/uitklappen
    if(slCollapsed) toggleSL();// en standaard open
  } else {
    _slLocked=true;
    if(!slCollapsed){ slCollapsed=true; document.getElementById('appGrid').classList.add('sl-col'); clearSLAutoHide?.(); }
    lockLeftPanel();             // verberg de toggle-knop, toon 'toon'-knopje
  }
  updateSLToggleIcon();
}
function lockLeftPanel(){
  const grid=document.getElementById('appGrid');
  if(grid) grid.classList.add('sl-locked');
  clearSLAutoHide?.();
  updateSLToggleIcon();
}
function unlockLeftPanel(){
  const grid=document.getElementById('appGrid');
  if(grid) grid.classList.remove('sl-locked');
  updateSLToggleIcon();
}
// Tijdelijk tonen ondanks lock (gebruiker tikt 'Sensoren tonen')
function revealLeftPanel(){
  slCollapsed=false;
  document.getElementById('appGrid').classList.remove('sl-col');
  unlockLeftPanel();
  _slLocked=false;
  updateSLToggleIcon();
}

function startChoice(choice){
  document.getElementById('welcomeScreen').classList.add('hidden');
  // Inkoop/Verkoop/Lease/Occasion hergebruiken de Koopcheck-pane in eigen modus
  if(choice==='inkoop'||choice==='verkoop'||choice==='lease'||choice==='occasion'){
    setKoopMode(choice);
    openAnalysis('koop');
    return;
  }
  if(choice==='koop') setKoopMode('koop');
  // Verplaatste analyses openen in het midden via de launcher
  if(choice==='check'||choice==='diag'||choice==='fuel'||choice==='koop'||choice==='basiccheck'){
    openAnalysis(choice);
  } else if(choice==='report'){
    openAnalysis('diag');
  } else {
    // Overgebleven tabs: live, graph. Foutcodes is een kaart in deur 1
    // (geen tab meer) — de gebruiker start de scan daar zelf.
    const tabMap={live:0,graph:1};
    const tabs=document.querySelectorAll('.tab');
    if(tabMap[choice]!==undefined) sw(choice,tabs[tabMap[choice]]);
    else if(choice==='dtc') sw('dtc',null);
  }
  if(choice==='report') setTimeout(()=>runQuickAI(),300);
  if(choice==='fuel') setTimeout(()=>runFuelAnalysis(),400);
}
