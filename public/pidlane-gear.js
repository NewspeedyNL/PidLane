// pidlane-gear.js — Versnellingsindicator (zelflerend, passief)
// ═══════════════════════════════════════════════════════════════════════════
// Wat hij doet
//   Berekent de ingeschakelde versnelling uit snelheid (010D) en toerental
//   (010C): in elke versnelling is  km/u per 1000 tpm  vast zolang de koppeling
//   dicht is. De waarden per versnelling LEERT hij zelf tijdens normaal rijden
//   (histogram in log-ruimte → pieken = versnellingen). Geen kalibratierit,
//   geen specs nodig. Het cijfer verschijnt in de topbalk op de plek van het
//   logo (#plGear in index.html); staat de auto stil of is er geen verbinding,
//   dan komt het logo terug.
//
// Principes (zelfde lijn als monitor/watchers)
//   • Leest ALLEEN pidHist — doet zelf nooit I/O op de bus.
//   • Alleen tijd-uitgelijnde, verse paren (snelheid en toerental ≤ 800 ms uit
//     elkaar) tellen. Oude waarden uit de cache leveren nooit een versnelling.
//   • Alleen STABIELE ratio's leren (spreiding < 3% over ~1 s): schakelen,
//     koppeling intrappen en een slippende koppelomvormer vallen er vanzelf uit.
//   • Model per voertuig, bewaard in localStorage onder het VIN-PSEUDONIEM
//     (_vlVinPseudoniem, §7 van PIDLANE.md) — nooit onder de ruwe VIN, en de
//     VIN komt ook niet in het logboek. Zonder VIN: gedeeld model 'onbekend'.
//   • Blijft doorleren, dus een versnelling die je pas later gebruikt komt er
//     vanzelf bij.
//   • Afwijking-detectie: passen >30% van de recente stabiele metingen bij geen
//     enkele geleerde versnelling (andere banden, andere auto zonder VIN, ...)
//     dan krijgt het cijfer een oranje stip en adviseert het venster "Leer
//     opnieuw".
//   • Aan/uit via ☰ → Versnellingsindicator; de keuze blijft bewaard.
//   • Gekoppeld aan het voertuig (27-09-2026). Voor een klant met Mijn
//     voertuigen legt PLGarage het actieve voertuig vast via koppel(); het
//     model heet dan 'kp_<voertuig-id>' en gaat via bewaar() mee naar de
//     server, zodat de leercurve een herinstallatie of een ander toestel
//     overleeft. Het profiel geeft het aantal versnellingen en of het een
//     automaat is; met het aantal is de nummering zeker zodra ze alle
//     geleerd zijn.
//   • De knop Fout: de klant zegt welke versnelling er écht in zit
//     (corrigeer(k)). Dat wordt een anker: de verhouding van dat moment is
//     versnelling k, en de nummering schuift zo dat dat klopt. Staat de
//     verhouding nog niet in het model, dan komt hij er als versnelling bij —
//     een anker is ook een snelle start van de leercurve.
//   • Achteruit (27-09-2026): OBD kent geen richting, dus de app kan R alleen
//     herkennen aan zijn verhouding. Die leert hij van de klant: Fout → R.
//     Ligt die verhouding binnen 7% van de 1e, dan zijn ze niet uit elkaar te
//     houden en zegt de knop dat in plaats van te gokken. Een herkende R telt
//     niet mee in het histogram: anders wordt hij een versnelling.
//   • Koppelomvormer-slip (automaat): slip() = hoeveel sneller de motor draait
//     dan de wielen in de getoonde versnelling vragen. Voedt CA16.
//   • Tijd per versnelling: model.tijd telt per versnelling de seconden en de
//     seconden boven het "hoge" toerental; rijstijl() maakt daar advies van.
//   • Uit = niet tonen. Ook met de indicator uit leert hij door (sinds
//     27-09-2026): wie hem later aanzet, heeft dan meteen een model.
//   • Per rit een klein histogram (ritHist()), dat PLGarage bij de rit op de
//     server zet. bouwUitRitten() maakt daar een nieuw model van — handig na
//     een verkeerd geleerde auto, zonder opnieuw te hoeven rijden. De
//     correcties (ankers, achteruit) blijven staan.
//   • Leren uit opnames van de bulk-recorder: histUitRegels() haalt uit
//     1 Hz-regels de stukken waarin de verhouding drie seconden stabiel blijft
//     (bij 1 Hz is dat het enige dat telt: snelheid en toerental in één regel
//     kunnen van verschillende momenten zijn, en in een stabiel stuk maakt
//     dat niet uit). leerUitHist() voegt dat toe aan het model en onthoudt de
//     bron, zodat dezelfde opname nooit twee keer telt.
//   • sessie(): wat deze sessie gemeten is (stabiele metingen, hoeveel daarvan
//     bij een versnelling pasten, correcties), voor de blok-5-proef.
//
// Publiek
//   window.PLGear                    — module-object (state, model, detectie)
//     .koppel(v) / .corrigeer(k) / .waarde() — voertuig, anker, berekende PID CA01
//   window.openGearInstellingen()    — instellingenvenster (aan/uit, leer opnieuw)
// Test: test-gear.js
// ═══════════════════════════════════════════════════════════════════════════
(function(){
'use strict';

const LS_UIT   = 'pl_gear_uit';
const LS_MODEL = 'pl_gear_model_';     // + voertuigsleutel (pseudoniem of 'onbekend')
const MODEL_V  = 1;

const CFG = {
  tickMs: 200,
  versMaxMs: 1500,        // meting ouder dan dit = niet vers
  alignMaxMs: 800,        // snelheid en toerental max zo ver uit elkaar
  minKmh: 8,              // daaronder: geen versnelling tonen
  stilNaMs: 2500,         // zo lang < minKmh → logo terug
  minRpm: 900, maxRpm: 7500,
  rMin: 3, rMax: 70,      // plausibele km/u per 1000 tpm
  stabielMs: 900,         // venster voor stabiliteitscheck
  stabielTol: 0.03,       // max relatieve spreiding binnen dat venster
  minStabielN: 3,
  binLog: 0.015,          // histogrambak ≈ 1,5%
  minLeerN: 250,          // stabiele metingen voor het eerste model
  piekMinFrac: 0.02,      // piek moet ≥ 2% van alle metingen bevatten …
  piekMinN: 20,           // … en minstens zoveel
  mergeTol: 0.08,         // pieken dichter bij elkaar = één versnelling
  matchTol: 0.07,         // meting past bij versnelling binnen ±7%
  wisselMs: 450,          // nieuwe versnelling moet zo lang kloppen
  houdMs: 1500,           // tijdens schakelen laatste cijfer zo lang vasthouden
  neutraalRpm: 1200,      // rijden + toerental hieronder + geen match = N
  herberekenMs: 8000,     // pieken opnieuw bepalen
  histMax: 20000,         // daarboven halveren (traag meebewegen)
  afwijkN: 400,           // venster afwijking-detectie (stabiele metingen)
  afwijkMinN: 150,
  afwijkFrac: 0.30,
  nieuweGearMin: 0.14,    // gevestigd model: nieuwe piek moet ≥14% afliggen
  eersteMax: 11.5,        // laagste piek hierboven: 1e nog niet gezien
  achteruitMaxKmh: 25,    // sneller dan dit is het geen achteruit
  hoogRpm: { benzine:3000, diesel:2500 },  // "hoogtoerig" voor het rijstijladvies
  opslaanMs: 15000,
  serverMs: 120000,       // zo vaak hoogstens naar het voertuig op de server
  ankerVersMs: 5000,      // een stabiele verhouding van hoogstens zo oud mag een anker worden
  ankerGewicht: 40,       // een aangegeven versnelling telt als zoveel stabiele metingen
  maxGear: 10
};

function nu(){ return Date.now(); }
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ console.warn('PLGear: localStorage lezen mislukt', k, e); return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){ console.warn('PLGear: localStorage schrijven mislukt', k, e); } }
function logI(t,s){ if(typeof log==='function') log(t,s||'info'); }
function toast(t){ if(typeof showToast==='function') showToast(t); }
function nl(x,d){ return x.toFixed(d).replace('.',','); }

// ── voertuig ──
// De ruwe VIN gaat nooit een sleutel, logregel of scherm van deze module in:
// de sleutel is het pseudoniem uit _vlVinPseudoniem(). Dat is async, dus de
// eerste tikken na een nieuwe VIN leren nog in het vorige model; dat valt in de
// praktijk bij stilstand (verbinden), en stilstand leert niets.
function huidigeVin(){
  const vi=(typeof vehicleInfo!=='undefined' && vehicleInfo) || null;
  const v=vi && typeof vi.vin==='string' ? vi.vin.trim().toUpperCase() : '';
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? v : '';
}
function voertuigNaam(){
  const vi=(typeof vehicleInfo!=='undefined' && vehicleInfo) || {};
  return [vi.merk, vi.model].filter(Boolean).join(' ').trim();
}

function verbonden(){
  return (typeof connected!=='undefined' && connected) &&
         !(typeof demoMode!=='undefined' && demoMode);
}

/* Rijstijladvies uit de tijd per versnelling. tijd = { k: {s, hoog} }. Puur:
   test-gear.js toetst het los. Advies alleen met genoeg rijtijd (5 min),
   want een oordeel over een kwartier op de oprit is geen rijstijl. */
function rijstijl(tijd, motor){
  const ks=Object.keys(tijd||{}).map(Number).filter(k=>k>=1).sort((a,b)=>a-b);
  const tot=ks.reduce((a,k)=>a+(tijd[k].s||0),0);
  const hoog=ks.reduce((a,k)=>a+(tijd[k].hoog||0),0);
  const verdeling=ks.map(k=>({ k, s:Math.round(tijd[k].s), pct:tot?Math.round(tijd[k].s/tot*100):0,
    hoogPct:tijd[k].s?Math.round((tijd[k].hoog||0)/tijd[k].s*100):0 }));
  const uit={ verdeling, totaalS:Math.round(tot), hoogPct:tot?Math.round(hoog/tot*100):0, advies:[] };
  if (tot<300) return uit;
  const grens=CFG.hoogRpm[motor==='diesel'?'diesel':'benzine'];
  if (uit.hoogPct>=25)
    uit.advies.push(`Je rijdt ${uit.hoogPct}% van de tijd boven ${grens} tpm. Eerder opschakelen scheelt brandstof en slijtage.`);
  const hoogste=ks.length ? ks[ks.length-1] : null;
  const laag=verdeling.filter(x=>hoogste && x.k<=Math.max(2, hoogste-3)).reduce((a,x)=>a+x.pct,0);
  if (hoogste>=5 && laag>=60)
    uit.advies.push(`${laag}% van de rijtijd staat hij in de 1e of 2e. Dat is veel stadsverkeer of lang doortrekken in een lage versnelling.`);
  if (!uit.advies.length) uit.advies.push('Rustig toerental en een gewone verdeling over de versnellingen. Niets op aan te merken.');
  return uit;
}

/* Uit regels van de bulk-recorder ({t, v:{'010D','010C'}}, 1 Hz) een
   histogram van stabiele verhoudingen. Een regel telt als hij en de drie
   ervoor (samen minstens drie seconden, geen gat groter dan 2,5 s) binnen de
   stabiliteitsgrens liggen. Puur: test-gear.js toetst hem los. */
function histUitRegels(regels){
  const h={}; let n=0, reeks=[];
  const rs=(regels||[]).slice().sort((a,b)=>(a.t||0)-(b.t||0));
  rs.forEach(x=>{
    const v=(x && x.v) || {}, kmh=v['010D'], rpm=v['010C'];
    const ok=typeof kmh==='number' && typeof rpm==='number' && kmh>=CFG.minKmh && rpm>=CFG.minRpm && rpm<=CFG.maxRpm;
    const r=ok ? kmh/(rpm/1000) : null;
    const vorige=reeks.length ? reeks[reeks.length-1] : null;
    if (!ok || r<CFG.rMin || r>CFG.rMax || (vorige && x.t-vorige.t>2500)){ reeks=ok&&r>=CFG.rMin&&r<=CFG.rMax ? [{t:x.t, r}] : []; return; }
    reeks.push({t:x.t, r}); if (reeks.length>4) reeks.shift();
    if (reeks.length<4 || reeks[3].t-reeks[0].t<2500) return;
    let mn=Infinity, mx=-Infinity, som=0;
    reeks.forEach(y=>{ mn=Math.min(mn,y.r); mx=Math.max(mx,y.r); som+=y.r; });
    const gem=som/reeks.length;
    if ((mx-mn)/gem>CFG.stabielTol) return;
    const b=Math.round(Math.log(r)/CFG.binLog);
    h[b]=(h[b]||0)+1; n++;
  });
  return { v:MODEL_V, bin:CFG.binLog, n, h };
}

const PLGear = {
  cfg: CFG,
  uit: lsGet(LS_UIT)==='1',
  sleutel: null,
  model: null,            // {v, sleutel, hist:{bin:count}, totaal, gears:[r...], sinds, bijgewerkt}
  _buf: [],               // recente verse paren {t, r, kmh, rpm}
  _laatstePaar: '',
  _recentMatch: [],       // 1 = paste, 0 = paste niet (stabiele metingen)
  afwijking: false,
  toon: null,             // wat nu getoond wordt: null | 1..n | 'N'
  _kand: null, _kandSinds: 0,
  _laatstStabiel: 0, _laatstRijden: 0,
  _herberekend: 0, _opgeslagen: 0, _vuil: false,
  _timer: null,
  _vinGezien: null,       // de VIN waarvoor het pseudoniem is aangevraagd
  _tickFout: '',
  voertuig: null,         // {id, naam, versnellingen, transmissie, model, bewaar} uit PLGarage, of null
  _laatsteR: null, _laatsteRT: 0,   // laatste stabiele verhouding en wanneer
  _naarServer: 0, _serverSleutel: '',
  _paarNu: null,          // laatste verse, uitgelijnde meting {t, kmh, rpm}
  _ritHist: {}, _ritN: 0, // wat deze rit aan stabiele verhoudingen opleverde
  _tijdT: 0,
  _sessie: { sinds: Date.now(), stabiel:0, pasten:0, correcties:0, achteruit:0, tijd:{} },

  // ═══════════════ voertuigsleutel ═══════════════
  _volgVoertuig(){
    if (this.voertuig && this.voertuig.id){ this._wissel('kp_'+this.voertuig.id); return; }
    const vin=huidigeVin();
    if (vin===this._vinGezien) return;
    this._vinGezien=vin;
    if (!vin || typeof _vlVinPseudoniem!=='function'){ this._wissel('onbekend'); return; }
    Promise.resolve(_vlVinPseudoniem(vin)).then(ps=>{
      if (this._vinGezien!==vin) return;                  // intussen andere auto
      this._wissel(ps ? 'v_'+ps : 'onbekend');
    }).catch(e=>{
      console.warn('PLGear: VIN-pseudoniem niet te maken, gedeeld model', e);
      if (this._vinGezien===vin) this._wissel('onbekend');
    });
  },
  _wissel(sleutel){
    if (sleutel===this.sleutel) return;
    this._opslaan(true); this._laad(sleutel);
    if (/^kp_/.test(sleutel)) this._neemServerModel();
    this.toon=null; this._render();
  },

  // ═══════════════ voertuig (Mijn voertuigen) ═══════════════
  // v = { id, naam, versnellingen, transmissie, model, bewaar(model) } of null.
  // Alleen PLGarage roept dit aan, en alleen als de verbonden auto dit
  // voertuig ís (herkend op het chassisnummer, of het actieve voertuig
  // zonder VIN in beeld). null = terug naar de sleutel uit de VIN.
  koppel(v){
    const was=this.voertuig && this.voertuig.id;
    this.voertuig = (v && v.id) ? v : null;
    if ((this.voertuig && this.voertuig.id)!==was){
      this._vinGezien=null; this._serverSleutel='';
      if (this.voertuig) this._wissel('kp_'+this.voertuig.id);
      else this._volgVoertuig();
    } else if (this.voertuig) this._neemServerModel();
    this._render();
  },
  verwacht(){
    const n=this.voertuig && Number(this.voertuig.versnellingen);
    return (n>=1 && n<=CFG.maxGear) ? Math.round(n) : null;
  },
  automaat(){ return !!(this.voertuig && this.voertuig.transmissie==='automaat'); },
  // Heeft de server een model dat verder is dan wat hier staat? Dan dat.
  // "Verder" = meer metingen, of evenveel met meer correcties.
  _neemServerModel(){
    const sm=this.voertuig && this.voertuig.model;
    if (!sm || sm.v!==MODEL_V || typeof sm.hist!=='object' || !this.model) return;
    const hier=this.model.totaal||0, daar=sm.totaal||0;
    const ankersDaar=(sm.ankers||[]).length, ankersHier=(this.model.ankers||[]).length;
    if (daar>hier || (daar===hier && ankersDaar>ankersHier)){
      this.model=Object.assign(this._leegModel(this.sleutel), JSON.parse(JSON.stringify(sm)), { sleutel:this.sleutel });
      if (!Array.isArray(this.model.ankers)) this.model.ankers=[];
      this._vuil=true; this._opslaan(true);
      this._herbereken();
      logI(`⚙️ Versnellingen van ${this.voertuig.naam||'dit voertuig'} overgenomen uit Mijn voertuigen (${this.model.gears.length} geleerd)`);
    }
  },
  _naarVoertuig(force){
    const v=this.voertuig;
    if (!v || typeof v.bewaar!=='function' || !this.model || !/^kp_/.test(this.sleutel||'')) return;
    if (!force && nu()-this._naarServer<CFG.serverMs) return;
    const sleutel=(this.model.totaal||0)+'|'+(this.model.ankers||[]).length+'|'+(this.model.gears||[]).join(',');
    if (sleutel===this._serverSleutel) return;
    this._naarServer=nu(); this._serverSleutel=sleutel;
    try{
      const kopie=JSON.parse(JSON.stringify(this.model));
      v.model=kopie;
      Promise.resolve(v.bewaar(kopie)).catch(e=>{ this._serverSleutel=''; console.warn('PLGear: model niet naar het voertuig', e); });
    }catch(e){ this._serverSleutel=''; console.warn('PLGear: model niet naar het voertuig', e); }
  },

  // ═══════════════ model ═══════════════
  _leegModel(sleutel){
    return { v:MODEL_V, sleutel, hist:{}, totaal:0, gears:[], ankers:[], offset:0, achteruit:null, tijd:{}, sinds:nu(), bijgewerkt:0 };
  },
  _laad(sleutel){
    let m=null;
    const ruw=lsGet(LS_MODEL+sleutel);
    if (ruw){
      try{ m=JSON.parse(ruw); }
      catch(e){ console.warn('PLGear: opgeslagen model onleesbaar, begint opnieuw', e); m=null; }
    }
    if (!m || m.v!==MODEL_V || typeof m.hist!=='object') m=this._leegModel(sleutel);
    if (!Array.isArray(m.ankers)) m.ankers=[];
    if (typeof m.offset!=='number') m.offset=0;
    if (!m.tijd || typeof m.tijd!=='object') m.tijd={};
    if (typeof m.achteruit!=='number') m.achteruit=null;
    this.model=m; this.sleutel=sleutel;
    this._recentMatch=[]; this.afwijking=false;
    this._herberekend=0; this._vuil=false;
  },
  _opslaan(force){
    if (!this.model || (!this._vuil && !force)) return;
    // Demo: het model hangt aan het actieve (echte) voertuig. Een ingetikte
    // versnelling op een demo-auto hoort daar niet in, lokaal noch op de server.
    if (typeof demoMode!=='undefined' && demoMode) return;
    lsSet(LS_MODEL+this.sleutel, JSON.stringify(this.model));
    this._opgeslagen=nu(); this._vuil=false;
    this._naarVoertuig(!!force);
  },
  leerOpnieuw(){
    const s=this.sleutel||'onbekend';
    this.model=this._leegModel(s); this.sleutel=s;
    this._recentMatch=[]; this.afwijking=false; this.toon=null;
    this._vuil=true; this._opslaan(true); this._naarVoertuig(true);
    logI('⚙️ Versnellingsindicator: opnieuw leren gestart');
    toast('⚙️ Versnellingen worden opnieuw geleerd — rij gewoon door');
    this._render();
  },
  zetUit(uit){
    this.uit=!!uit; lsSet(LS_UIT, this.uit?'1':'0');
    if (this.uit){ this.toon=null; }
    logI(this.uit?'⚙️ Versnellingsindicator UIT':'⚙️ Versnellingsindicator AAN');
    this._render();
  },

  // histogram in log-ruimte
  _voegToe(r){
    const m=this.model, b=Math.round(Math.log(r)/CFG.binLog);
    this._ritHist[b]=(this._ritHist[b]||0)+1; this._ritN++;
    m.hist[b]=(m.hist[b]||0)+1; m.totaal++;
    if (m.totaal>CFG.histMax){
      let t=0;
      for (const k of Object.keys(m.hist)){
        const c=Math.floor(m.hist[k]/2);
        if (c>0){ m.hist[k]=c; t+=c; } else delete m.hist[k];
      }
      m.totaal=t;
    }
    this._vuil=true;
  },

  // pieken zoeken → versnellingen (oplopende ratio = 1e, 2e, …)
  _herbereken(){
    const m=this.model; if (!m) return;
    this._herberekend=nu();
    if (m.totaal<CFG.minLeerN){ m.gears=[]; this._pasAnkers(); return; }
    const keys=Object.keys(m.hist).map(Number);
    if (!keys.length){ this._pasAnkers(); return; }
    const lo=Math.min(...keys)-3, hi=Math.max(...keys)+3;
    const w=[1,2,3,2,1];
    const glad={};
    for (let b=lo;b<=hi;b++){
      let s=0; for (let i=-2;i<=2;i++) s+=(m.hist[b+i]||0)*w[i+2];
      glad[b]=s/9;
    }
    const drempel=Math.max(CFG.piekMinN, m.totaal*CFG.piekMinFrac);
    const straal=Math.round(CFG.mergeTol/2/CFG.binLog);   // bakken rond piek
    let pieken=[];
    for (let b=lo+1;b<hi;b++){
      if (glad[b]>=glad[b-1] && glad[b]>glad[b+1]){
        // massa rond de piek + gewogen gemiddelde
        let n=0, s=0;
        for (let i=-straal;i<=straal;i++){
          const c=m.hist[b+i]||0; n+=c; s+=c*(b+i);
        }
        if (n>=drempel) pieken.push({ln:(s/n)*CFG.binLog, n});
      }
    }
    pieken.sort((a,b)=>a.ln-b.ln);
    // samenvoegen wat te dicht bij elkaar ligt
    const samen=[];
    for (const p of pieken){
      const q=samen[samen.length-1];
      if (q && (p.ln-q.ln)<Math.log(1+CFG.mergeTol)){
        const n=q.n+p.n; q.ln=(q.ln*q.n+p.ln*p.n)/n; q.n=n;
      } else samen.push({...p});
    }
    const oud=m.gears.length;
    const nieuw=samen.map(p=>Math.round(Math.exp(p.ln)*100)/100);
    if (oud>=2 && m.totaal>=CFG.minLeerN*3){
      // Gevestigd model: bestaande versnellingen alleen verfijnen. Een nieuwe
      // piek telt pas als echte extra versnelling als hij ≥14% van alles wat
      // er al is afligt (kleinste echte trap in een 8/9-bak). Een verschoven
      // patroon (andere banden, andere auto) levert pieken op 5–12% naast de
      // oude — die worden géén extra versnellingen maar vallen onder de
      // afwijking-detectie → "Leer opnieuw". Tijdens afwijking: niets toevoegen.
      const g=m.gears.map(r=>{
        let best=null, f=Infinity;
        for (const q of nieuw){ const d=Math.abs(q-r)/r; if(d<f){f=d;best=q;} }
        return (best!==null && f<=CFG.matchTol/2) ? best : r;
      });
      if (!this.afwijking){
        for (const q of nieuw){
          if (g.every(r=>Math.abs(q-r)/Math.min(q,r)>=CFG.nieuweGearMin)) g.push(q);
        }
      }
      m.gears=g.sort((a,b)=>a-b);
    } else m.gears=nieuw;
    // Een herkende achteruit is geen versnelling.
    if (typeof m.achteruit==='number') m.gears=m.gears.filter(r=>Math.abs(r-m.achteruit)/m.achteruit>CFG.matchTol);
    this._pasAnkers();
    m.bijgewerkt=nu(); this._vuil=true;
    if (m.gears.length!==oud)
      logI(`⚙️ Versnellingen geleerd: ${m.gears.length} (${m.gears.map(g=>nl(g,1)).join(' · ')} km/u per 1000 tpm)`);
  },

  // welke versnelling past bij ratio r? → {gear, idx, fout} of null. `gear`
  // is het nummer dat getoond wordt: de plek in de lijst plus de verschuiving
  // uit de correcties van de klant. Onder de 1 = niet te nummeren.
  _match(r){
    const g=(this.model&&this.model.gears)||[];
    let best=-1, fout=Infinity;
    for (let i=0;i<g.length;i++){
      const f=Math.abs(r-g[i])/g[i];
      if (f<fout){ fout=f; best=i; }
    }
    if (best<0 || fout>CFG.matchTol) return null;
    const gear=this.nummer(best);
    return gear>=1 ? {gear, idx:best, fout} : null;
  },
  // Het nummer van plek `idx`. Met ankers: vanaf het dichtstbijzijnde
  // aangegeven anker geteld (28-09-2026). Eén verschuiving voor de hele rij
  // klopt niet zolang er een versnelling ontbreekt: 2e, 4e en 5e aangegeven
  // en de 3e nog niet gezien, dan is plek 0 de 2e en plek 1 de 4e.
  nummer(idx){
    const m=this.model, a=(m && m._ankerPlek) || [];
    if (!a.length) return idx+1+((m&&m.offset)||0);
    let best=a[0];
    a.forEach(x=>{ if (Math.abs(x.idx-idx)<Math.abs(best.idx-idx)) best=x; });
    return best.k+(idx-best.idx);
  },
  // De correcties (ankers) van de klant toepassen: het nieuwste anker bepaalt
  // de verschuiving. Staat zijn verhouding niet in de lijst, dan komt hij erin.
  // Sinds 28-09-2026 tellen ALLE ankers, niet alleen het nieuwste:
  //  • elke aangegeven verhouding is een versnelling — staat hij niet in de
  //    lijst, dan komt hij erin (ook vóór er genoeg metingen zijn: wie drie
  //    keer aangeeft waar hij zit, heeft meteen drie versnellingen);
  //  • de nummering is die waar de meeste ankers het over eens zijn; bij
  //    gelijke stand wint het nieuwste.
  _pasAnkers(){
    const m=this.model; if (!m) return;
    if (!Array.isArray(m.ankers) || !m.ankers.length){ m.offset=0; m._ankerPlek=[]; return; }
    const plek=(r)=>{ let idx=-1, fout=Infinity; m.gears.forEach((g,i)=>{ const f=Math.abs(r-g)/g; if (f<fout){ fout=f; idx=i; } }); return fout<=CFG.matchTol ? idx : -1; };
    m.ankers.forEach(a=>{ if (plek(a.r)<0) m.gears=m.gears.concat([a.r]).sort((x,y)=>x-y); });
    // Per plek het nummer waar de meeste ankers het over eens zijn (gelijk:
    // het nieuwste). Een verkeerde tik wordt zo door twee goede overstemd.
    const perPlek={};
    m.ankers.forEach((a,i)=>{ const p=plek(a.r); if (p<0) return; const s=perPlek[p]=perPlek[p]||{}; s[a.k]=s[a.k]||{ n:0, laatst:-1 }; s[a.k].n++; s[a.k].laatst=i; });
    const lijst=[];
    Object.keys(perPlek).forEach(p=>{
      let best=null; Object.keys(perPlek[p]).forEach(k=>{ const x=perPlek[p][k]; if (!best || x.n>best.n || (x.n===best.n && x.laatst>best.laatst)) best={ k:Number(k), n:x.n, laatst:x.laatst }; });
      lijst.push({ idx:Number(p), k:best.k, n:best.n, laatst:best.laatst });
    });
    // Twee plekken met ankers die elkaar tegenspreken (plek 1 = 3e, plek 2 =
    // 3e): eerst de ankers die precies met andere kloppen (dezelfde
    // verschuiving: 1e op plek 0 en 3e op plek 2), dan de sterkste, dan de
    // nieuwste. Wat daarna nog tegenspreekt, valt weg.
    lijst.forEach(x=>{ x.steun=lijst.filter(y=>y!==x && y.k-y.idx===x.k-x.idx).length; });
    lijst.sort((a,b)=>(b.steun-a.steun)||(b.n-a.n)||(b.laatst-a.laatst));
    const ok=[];
    lijst.forEach(x=>{ if (ok.every(y=>(x.k-y.k)*(x.idx-y.idx)>0 && Math.abs(x.k-y.k)>=Math.abs(x.idx-y.idx))) ok.push(x); });
    m._ankerPlek=ok.sort((a,b)=>a.idx-b.idx).map(x=>({ idx:x.idx, k:x.k }));
    // De oude verschuiving blijft voor wie er nog naar kijkt (status, test).
    const sterk=ok.slice().sort((a,b)=>(b.n-a.n)||(b.laatst-a.laatst))[0];
    m.offset=sterk ? sterk.k-(sterk.idx+1) : 0;
  },
  // De knop Fout: "nu zit hij in de k-de". Gebruikt de laatste stabiele
  // verhouding (hoogstens ankerVersMs oud); zonder die weigert hij met een
  // reden, want een anker op een schakelmoment maakt de nummering stuk.
  corrigeer(k){
    if (k==='R') return this._achteruit();
    k=Math.round(Number(k));
    if (!(k>=1 && k<=CFG.maxGear)) return { ok:false, reden:'Kies een versnelling van 1 tot '+CFG.maxGear };
    if (!this.model) this._laad(this.sleutel||'onbekend');
    const r=this._laatsteR;
    if (r===null || nu()-this._laatsteRT>CFG.ankerVersMs)
      return { ok:false, reden:'Rij eerst een paar seconden rustig in die versnelling, met de koppeling los, en tik dan opnieuw' };
    const m=this.model;
    m.ankers=(m.ankers||[]).filter(a=>a.k!==k && Math.abs(a.r-r)/r>CFG.matchTol);
    m.ankers.push({ k, r:Math.round(r*100)/100, t:nu() });
    if (m.ankers.length>CFG.maxGear) m.ankers.shift();
    // Een aangegeven versnelling is zekerder dan een meting: hij telt in het
    // histogram als ankerGewicht metingen, zodat het leren sneller rond is.
    const b=Math.round(Math.log(r)/CFG.binLog);
    m.hist[b]=(m.hist[b]||0)+CFG.ankerGewicht; m.totaal+=CFG.ankerGewicht;
    this._herbereken();
    this.toon=k; this._kand=null; this._sessie.correcties++;
    this._vuil=true; this._opslaan(true); this._naarVoertuig(true);
    logI(`⚙️ Versnellingsindicator gecorrigeerd: dit is de ${k}e (${nl(r,1)} km/u per 1000 tpm)`);
    this._render();
    return { ok:true, gear:k, r };
  },
  // Fout → R. Zie de kop: alleen als R van de 1e te onderscheiden is.
  _achteruit(){
    if (!this.model) this._laad(this.sleutel||'onbekend');
    const r=this._laatsteR;
    if (r===null || nu()-this._laatsteRT>CFG.ankerVersMs)
      return { ok:false, reden:'Rij eerst een paar meter rustig achteruit en tik dan opnieuw' };
    const een=this.ratioVan(1);
    if (een && Math.abs(r-een)/een<=CFG.matchTol)
      return { ok:false, reden:'Achteruit heeft op deze auto bijna dezelfde verhouding als de 1e; die kan de indicator niet uit elkaar houden' };
    const m=this.model;
    m.achteruit=Math.round(r*100)/100;
    m.gears=m.gears.filter(x=>Math.abs(x-r)/r>CFG.matchTol);
    this._pasAnkers();
    this.toon='R'; this._kand=null; this._sessie.correcties++;
    this._vuil=true; this._opslaan(true); this._naarVoertuig(true);
    logI(`⚙️ Versnellingsindicator: achteruit onthouden (${nl(r,1)} km/u per 1000 tpm)`);
    this._render();
    return { ok:true, gear:'R', r };
  },
  _isAchteruit(r, kmh){
    const a=this.model && this.model.achteruit;
    return typeof a==='number' && kmh<=CFG.achteruitMaxKmh && Math.abs(r-a)/a<=CFG.matchTol;
  },
  // De verhouding van versnelling k (met de verschuiving uit de correcties).
  ratioVan(k){
    const g=(this.model&&this.model.gears)||[];
    for (let i=0;i<g.length;i++) if (this.nummer(i)===k) return g[i];
    return null;
  },
  /* Koppelomvormer-slip in %, alleen bij een automaat met een getoonde
     versnelling en een verse meting. Negatief (de wielen drijven de motor)
     telt als 0; boven de 60% is het geen slip maar een schakelmoment. */
  slip(){
    if (!this.automaat() || typeof this.toon!=='number') return null;
    const p=this._paarNu, r=this.ratioVan(this.toon);
    if (!p || !r || nu()-p.t>CFG.versMaxMs || p.rpm<CFG.minRpm || p.kmh<CFG.minKmh) return null;
    const s=(1-(p.kmh/(p.rpm/1000))/r)*100;
    return s>60 ? null : Math.max(0, Math.round(s*10)/10);
  },
  _motor(){
    try{ return (typeof detectEngineType==='function' && detectEngineType()==='diesel') ? 'diesel' : 'benzine'; }
    catch(e){ console.warn('PLGear: detectEngineType() mislukt', e); return 'benzine'; }
  },
  // Tijd in de getoonde versnelling bijtellen: model (over ritten heen) en sessie.
  _telTijd(t, p){
    const dt=this._tijdT ? Math.min(1000, t-this._tijdT) : 0;
    this._tijdT=t;
    if (!(dt>0) || typeof this.toon!=='number' || this.toon<1) return;
    const hoog=p && typeof p.rpm==='number' && p.rpm>CFG.hoogRpm[this._motor()];
    [this.model.tijd, this._sessie.tijd].forEach(tb=>{
      const x=tb[this.toon]=tb[this.toon]||{ s:0, hoog:0 };
      x.s+=dt/1000; if (hoog) x.hoog+=dt/1000;
    });
  },
  // Het histogram van deze rit, voor de ritsamenvatting. `pak` = daarna leeg
  // (de rit is afgerond). null als er niets stabiels was.
  ritHist(pak){
    const uit=this._ritN ? { v:MODEL_V, bin:CFG.binLog, n:this._ritN, h:Object.assign({}, this._ritHist) } : null;
    if (pak){ this._ritHist={}; this._ritN=0; }
    return uit;
  },
  /* Een histogram erbij, uit een rit of een opname. `bron` = een sleutel
     (rit-id of opnamesessie): die telt maar één keer. */
  leerUitHist(h, bron){
    if (!h || typeof h.h!=='object' || h.bin!==CFG.binLog) return { ok:false, reden:'geen bruikbaar histogram' };
    if (!this.model) this._laad(this.sleutel||'onbekend');
    const m=this.model;
    m.bronnen=m.bronnen||{};
    if (bron && m.bronnen[bron]) return { ok:false, reden:'deze bron is al meegeteld', dubbel:true };
    let n=0;
    Object.keys(h.h).forEach(b=>{ const c=Math.max(0, Math.round(Number(h.h[b])||0)); if (c){ m.hist[b]=(m.hist[b]||0)+c; n+=c; } });
    m.totaal+=n;
    if (bron) m.bronnen[bron]=n;
    this._herbereken(); this._vuil=true; this._opslaan(true);
    return { ok:true, n, versnellingen:m.gears.length };
  },
  /* Een nieuw model uit de histogrammen van eerdere ritten. De correcties
     van de klant (ankers, achteruit) en de tijd per versnelling blijven. */
  bouwUitRitten(lijst){
    if (!this.model) this._laad(this.sleutel||'onbekend');
    const oud=this.model, m=this._leegModel(this.sleutel);
    m.ankers=oud.ankers||[]; m.achteruit=oud.achteruit; m.tijd=oud.tijd||{};
    this.model=m; this._recentMatch=[]; this.afwijking=false;
    let ritten=0;
    (lijst||[]).forEach(x=>{
      const h=x && x.h;
      if (!h || typeof h.h!=='object' || h.bin!==CFG.binLog) return;
      Object.keys(h.h).forEach(b=>{ const c=Math.max(0, Math.round(Number(h.h[b])||0)); if (c){ m.hist[b]=(m.hist[b]||0)+c; m.totaal+=c; } });
      if (x.id) (m.bronnen=m.bronnen||{})[x.id]=h.n||0;
      ritten++;
    });
    this._herbereken(); this._vuil=true; this._opslaan(true); this._naarVoertuig(true);
    logI(`⚙️ Versnellingen opnieuw opgebouwd uit ${ritten} ritten: ${m.gears.length} gevonden`);
    this._render();
    return { ok:true, ritten, metingen:m.totaal, versnellingen:m.gears.length };
  },
  rijstijl(tijd){ return rijstijl(tijd || (this.model && this.model.tijd) || {}, this._motor()); },
  sessie(){ return JSON.parse(JSON.stringify(this._sessie)); },
  nummeringZeker(){
    const m=this.model, g=(m&&m.gears)||[];
    if (!g.length) return false;
    if (m.ankers && m.ankers.length) return true;
    const n=this.verwacht();
    if (n && g.length===n) return true;
    return g[0]<=CFG.eersteMax;
  },
  // Voor de berekende PID CA01: het getal, 0 voor neutraal, null = niets.
  waarde(){
    if (this.uit || this.toon===null) return null;
    return this.toon==='N' ? 0 : this.toon==='R' ? -1 : this.toon;
  },
  status(){
    const m=this.model||{totaal:0,gears:[]};
    return {
      uit:this.uit, voertuigBekend:!!(this.sleutel && this.sleutel!=='onbekend'),
      metingen:m.totaal,
      leren: m.totaal<CFG.minLeerN, voortgang: Math.min(1, m.totaal/CFG.minLeerN),
      versnellingen: m.gears.slice(), nummeringZeker:this.nummeringZeker(),
      afwijking:this.afwijking, toon:this.toon,
      offset:m.offset||0, ankers:(m.ankers||[]).length, achteruit:(typeof m.achteruit==='number') ? m.achteruit : null,
      verwacht:this.verwacht(), automaat:this.automaat(),
      voertuig:this.voertuig ? (this.voertuig.naam||'je voertuig') : null,
      kanCorrigeren: this._laatsteR!==null && nu()-this._laatsteRT<=CFG.ankerVersMs
    };
  },

  // ═══════════════ meten ═══════════════
  _paar(){
    const h=(typeof pidHist!=='undefined')?pidHist:null;
    if (!h) return null;
    const S=h['010D'], R=h['010C'];
    if (!Array.isArray(S)||!S.length||!Array.isArray(R)||!R.length) return null;
    const s=S[S.length-1], r=R[R.length-1];
    if (!s||!r||typeof s.v!=='number'||typeof r.v!=='number') return null;
    const t=nu();
    const ts=s.t||0, tr=r.t||0;
    if (t-ts>CFG.versMaxMs || t-tr>CFG.versMaxMs) return {oud:true};
    if (Math.abs(ts-tr)>CFG.alignMaxMs) return {los:true, kmh:s.v, rpm:r.v};
    const sleutel=ts+'|'+tr;
    const nieuw = sleutel!==this._laatstePaar;
    this._laatstePaar=sleutel;
    return {t:Math.max(ts,tr), kmh:s.v, rpm:r.v, nieuw};
  },

  _stabiel(){
    const t=nu(), b=this._buf.filter(x=>x.t>=t-CFG.stabielMs-300);
    if (b.length<CFG.minStabielN) return null;
    if (b[b.length-1].t-b[0].t < CFG.stabielMs*0.6) return null;
    let mn=Infinity, mx=-Infinity, s=0;
    for (const x of b){ if(x.r<mn)mn=x.r; if(x.r>mx)mx=x.r; s+=x.r; }
    const gem=s/b.length;
    return ((mx-mn)/gem <= CFG.stabielTol) ? gem : null;
  },

  _tick(){
    try{
      this._volgVoertuig();
      if (!this.model) this._laad('onbekend');

      if (!verbonden()){ this._zet(null); this._buf=[]; return; }

      const p=this._paar(), t=nu();
      if (!p || p.oud){ this._zet(null); return; }

      if (p.kmh>=CFG.minKmh) this._laatstRijden=t;
      const rijdt = (t-this._laatstRijden) < CFG.stilNaMs;
      if (!rijdt){ this._buf=[]; this._zet(null); this._tijdT=0; return; }
      if (!p.los) this._paarNu={ t:p.t, kmh:p.kmh, rpm:p.rpm };
      this._telTijd(t, p);

      // Nieuw vers paar → in de buffer. Stabiliteit wordt elke tik bepaald
      // (ook als de adapter nog geen nieuw paar leverde), maar het histogram en
      // de afwijking-teller krijgen elk paar maar één keer.
      let geldig=false;
      if (!p.los && p.nieuw && p.kmh>=CFG.minKmh &&
          p.rpm>=CFG.minRpm && p.rpm<=CFG.maxRpm){
        const r=p.kmh/(p.rpm/1000);
        if (r>=CFG.rMin && r<=CFG.rMax){
          this._buf.push({t:p.t, r, kmh:p.kmh, rpm:p.rpm});
          if (this._buf.length>40) this._buf.shift();
          geldig=true;
        } else this._buf=[];
      } else if (!p.los && p.nieuw) this._buf=[];   // stationair/koppeling: reeks breekt
      const stabiel = this._buf.length ? this._stabiel() : null;
      const achteruit = stabiel!==null && this._isAchteruit(stabiel, p.kmh);
      if (stabiel!==null){
        if (geldig && !achteruit) this._voegToe(stabiel);
        this._laatstStabiel=t;
        this._laatsteR=stabiel; this._laatsteRT=t;
      }

      if (t-this._herberekend>CFG.herberekenMs) this._herbereken();
      if (t-this._opgeslagen>CFG.opslaanMs) this._opslaan(false);

      const g=this.model.gears;
      if (!g.length){ this._zet(null); return; }   // nog aan het leren
      this._naarVoertuig(false);                    // hoogstens elke serverMs, en alleen als er iets veranderde

      // ── detectie ──
      let doel;
      if (achteruit){
        doel='R';
        if (geldig) this._sessie.achteruit++;
      } else if (stabiel!==null){
        const m=this._match(stabiel);
        if (geldig){ this._afwijkRegistreer(!!m); this._sessie.stabiel++; if (m) this._sessie.pasten++; }
        doel = m ? m.gear : (p.rpm<CFG.neutraalRpm ? 'N' : undefined);
      } else if (p.kmh>=CFG.minKmh && p.rpm<CFG.neutraalRpm && !p.los){
        // rijden met toerental rond stationair en geen stabiele ratio → N
        const r=p.kmh/(Math.max(p.rpm,1)/1000);
        doel = this._match(r) ? undefined : 'N';
      }
      if (doel===undefined){
        // schakelmoment / onzeker: laatste cijfer even vasthouden
        if (t-this._laatstStabiel>CFG.houdMs && this.toon!=='N'){ this._zet(null); this._kand=null; }
        return;
      }
      if (doel===this.toon){ this._kand=null; return; }
      if (this._kand!==doel){ this._kand=doel; this._kandSinds=t; return; }
      if (t-this._kandSinds>=CFG.wisselMs || this.toon===null){ this._zet(doel); this._kand=null; }
    }catch(e){
      // De indicator mag de app nooit laten omvallen, maar een fout moet wel
      // zichtbaar zijn: één keer per soort, anders vult hij de console 5×/s.
      const k=String(e && e.message);
      if (k!==this._tickFout){ this._tickFout=k; console.warn('PLGear: tick mislukt', e); }
    }
  },

  _afwijkRegistreer(past){
    const a=this._recentMatch;
    a.push(past?1:0); if (a.length>CFG.afwijkN) a.shift();
    if (a.length<CFG.afwijkMinN) return;
    const mis=1 - a.reduce((x,y)=>x+y,0)/a.length;
    const was=this.afwijking;
    this.afwijking = mis>CFG.afwijkFrac;
    if (this.afwijking && !was){
      logI(`⚙️ Versnellingsindicator: ${Math.round(mis*100)}% van de metingen past niet — opnieuw leren aanbevolen`,'warn');
      this._render();
    } else if (!this.afwijking && was) this._render();
  },

  _zet(v){
    if (v===this.toon) return;
    this.toon=v; this._render();
  },

  // ═══════════════ weergave in de topbalk ═══════════════
  // #plGear staat in index.html direct na .logo. Zichtbaar = body.pl-gear-aan:
  // dan verbergt pidlane.css het logo en toont dit vak op die plek. Op ≤480px is
  // het logo er al niet; het cijfer komt dan tussen menu en chips.
  _render(){
    if (typeof document==='undefined' || !document.body) return;
    const b=document.getElementById('plGear');
    if (!b) return;
    const zicht = this.toon!==null && !this.uit;
    document.body.classList.toggle('pl-gear-aan', zicht);
    b.hidden=!zicht;
    if (!zicht){ b.dataset.c=''; return; }
    const g=Math.max(this.verwacht()||0, this.nummer(this.model.gears.length-1));
    const toonRij = g>=2 && g<=CFG.maxGear;
    const zeker=this.nummeringZeker();
    const letter = this.toon==='N' || this.toon==='R';
    const cijfer = String(this.toon);
    const oudCijfer = b.dataset.c;
    b.dataset.c=cijfer;
    let h=`<span class="pl-gear-cijfer${letter?' n':''}${oudCijfer!==cijfer?' wissel':''}">`+
          cijfer+(!letter&&!zeker?'<span class="v">?</span>':'')+`</span>`;
    if (toonRij){
      h+='<span class="pl-gear-rij" aria-hidden="true">';
      for (let i=1;i<=g;i++) h+=`<i class="${i===this.toon?'nu':''}"></i>`;
      h+='</span>';
    }
    if (this.afwijking) h+='<span class="pl-gear-stip" aria-hidden="true"></span>';
    b.innerHTML=h;
    b.setAttribute('aria-label', this.toon==='N'
      ? 'Neutraal of koppeling ingetrapt — tik voor instellingen'
      : this.toon==='R' ? 'Achteruit — tik voor instellingen'
      : `Versnelling ${this.toon}${zeker?'':' (voorlopig)'} — tik voor instellingen`);
  },

  // ═══════════════ opstarten ═══════════════
  boot(){
    if (this._timer) return;
    this._laad('onbekend');
    this._timer=setInterval(()=>this._tick(), CFG.tickMs);
    if (typeof window!=='undefined' && window.addEventListener)
      window.addEventListener('pagehide', ()=>this._opslaan(true));
    if (typeof document!=='undefined' && document.addEventListener)
      document.addEventListener('visibilitychange', ()=>{ if(document.hidden) this._opslaan(true); });
  }
};

// ═══════════════ instellingenvenster ═══════════════
let _wisBevestig=0, _foutMelding='';
function openGearInstellingen(){
  let ov=document.getElementById('plGearOv');
  if (!ov){
    ov=document.createElement('div'); ov.id='plGearOv';
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
    ov.setAttribute('aria-labelledby','plGearTtl');
    ov.addEventListener('click',e=>{ if(e.target===ov) sluitGearInstellingen(); });
    document.body.appendChild(ov);
  }
  _wisBevestig=0; _foutMelding=''; _opnames=null; _opnameMelding='';
  tekenInstellingen();
  ov.style.display='flex';
  if (!ov._ververs) ov._ververs=setInterval(()=>{
    if (ov.style.display==='none') return;
    // niet hertekenen terwijl de gebruiker op een knop drukt
    if (ov.querySelector(':active')) return;
    tekenInstellingen();
  }, 1000);
  setTimeout(()=>{ const k=ov.querySelector('#plGearSw'); if(k) k.focus(); },50);
}
function sluitGearInstellingen(){
  const ov=document.getElementById('plGearOv'); if (ov) ov.style.display='none';
}

function tekenInstellingen(){
  const ov=document.getElementById('plGearOv'); if(!ov) return;
  const st=PLGear.status();
  const g=st.versnellingen;
  const maxR=g.length?Math.max(...g):1;
  let lijst='';
  if (g.length){
    lijst=g.map((r,i)=>{
      const nr=PLGear.nummer(i);
      const nuTxt = st.toon===nr;
      return `<div class="plg-rij${nuTxt?' nu':''}">
        <span class="plg-nr">${nr>=1?nr:'?'}</span>
        <span class="plg-balk"><span style="width:${Math.round(r/maxR*100)}%"></span></span>
        <span class="plg-r">${nl(r,1)}</span></div>`;
    }).join('');
    lijst=`<div class="plg-klein" style="margin:14px 0 4px">km/u per 1000 tpm${st.verwacht?` · ${g.length} van ${st.verwacht} geleerd`:''}</div>`+lijst;
    if (!st.nummeringZeker) lijst+=`<p class="plg-klein" style="margin:8px 0 0">
      De 1e versnelling is nog niet gezien, dus de nummering is voorlopig (herkenbaar aan het vraagteken). Die klopt vanzelf zodra je even in de 1e rijdt.</p>`;
  }
  const stTxt = st.uit ? 'Staat uit: het PidLane-logo blijft staan. Hij leert wel door, zodat hij meteen klopt als je hem weer aanzet.'
    : st.leren ? `Aan het leren: rij normaal door, in zoveel mogelijk versnellingen.`
    : `Tik op het cijfer in de topbalk om hier terug te komen.`;
  const wisTxt = _wisBevestig && nu()-_wisBevestig<4000 ? 'Tik nogmaals om te wissen' : 'Leer opnieuw';
  const naam = voertuigNaam();
  const vTxt = st.voertuig ? `${st.voertuig} (Mijn voertuigen — bewaard bij dit voertuig)`
    : st.voertuigBekend ? (naam || 'herkend aan de VIN') : 'onbekend (geen VIN) — gedeeld model';
  // De knop Fout: welke versnelling zit er écht in? Tot het hoogste van wat
  // het profiel zegt, wat er geleerd is en zes.
  const maxK = Math.min(10, Math.max(st.verwacht||0, g.length, 6));
  let fout='';
  if (!st.uit){
    // Altijd in beeld (28-09-2026): zelf aangeven waar je in zit is geen
    // foutmelding maar de snelste manier van leren. Elke tik is een anker.
    let k='';
    for (let i=1;i<=maxK;i++) k+=`<button type="button" class="plg-k${st.toon===i?' nu':''}" onclick="plGearKies(${i})">${i}</button>`;
    k+=`<button type="button" class="plg-k${st.toon==='R'?' nu':''}" onclick="plGearKies('R')" aria-label="Achteruit">R</button>`;
    fout=`<div class="plg-kies"><div class="plg-klein"><b>In welke versnelling zit je nu?</b> Klopt het cijfer niet, of leert hij nog: tik hem aan. Elke tik leert hem je auto sneller. ${st.kanCorrigeren?'':'<b>Rij eerst een paar seconden rustig door in die versnelling, koppeling los.</b>'}</div>
      <div class="plg-krij">${k}</div></div>`;
    if (_foutMelding) fout+=`<p class="plg-uitleg">${_foutMelding}</p>`;
  }
  const autoTxt = st.automaat ? `<p class="plg-klein" style="margin:8px 0 0">Automaat: tijdens het schakelen en zolang de koppelomvormer slipt staat er geen cijfer. Dat is geen fout.</p>` : '';
  const html=`<div class="plg-vel">
    <div style="display:flex;align-items:center;gap:12px">
      <h2 id="plGearTtl">Versnellingsindicator</h2>
      <button type="button" class="plg-sluit" onclick="sluitGearInstellingen()" aria-label="Sluiten">✕</button></div>
    <label class="plg-schakel">
      <span style="flex:1">Toon versnelling in beeld</span>
      <input id="plGearSw" type="checkbox" ${st.uit?'':'checked'} onchange="PLGear.zetUit(!this.checked)"></label>
    <p class="plg-uitleg">${stTxt}</p>
    ${st.leren&&!st.uit?`<div class="plg-voortgang"><span style="width:${Math.round(st.voortgang*100)}%"></span></div>`:''}
    ${st.afwijking&&!st.uit?`<div class="plg-afwijking">
      De metingen passen niet meer goed bij wat eerder is geleerd, bijvoorbeeld door andere banden of een andere auto. Kies Leer opnieuw.</div>`:''}
    ${fout}
    ${lijst}
    ${st.achteruit?`<div class="plg-klein" style="margin-top:6px">Achteruit: ${nl(st.achteruit,1)} km/u per 1000 tpm</div>`:''}
    ${tijdBlok()}
    ${autoTxt}
    <div class="plg-klein" style="margin-top:12px">Voertuig: ${vTxt} · ${st.metingen} metingen${st.ankers?` · ${st.ankers} correctie${st.ankers===1?'':'s'}`:''}</div>
    ${opnameBlok()}
    <button type="button" class="plg-wis${st.afwijking?' let':''}" onclick="plGearWis()">${wisTxt}</button>
  </div>`;
  // Het venster ververst elke seconde. Tot 28-09-2026 zette dat het hele
  // venster opnieuw neer, en daarmee sprong het terug naar boven: omlaag
  // scrollen kon niet. Nu: niets doen als er niets veranderde, en anders de
  // scrollpositie meenemen.
  if (ov._html===html) return;
  const oud=ov.querySelector('.plg-vel'), top=oud ? oud.scrollTop : 0;
  ov.innerHTML=html; ov._html=html;
  const nieuw=ov.querySelector('.plg-vel'); if (nieuw && top) nieuw.scrollTop=top;
}
// Tijd per versnelling en het rijstijladvies, onder de geleerde verhoudingen.
function tijdBlok(){
  const rs=PLGear.rijstijl();
  if (!rs.verdeling.length) return '';
  const max=Math.max(...rs.verdeling.map(x=>x.pct), 1);
  return `<div class="plg-klein" style="margin:14px 0 4px">Tijd per versnelling · ${Math.round(rs.totaalS/60)} min gereden</div>`+
    rs.verdeling.map(x=>`<div class="plg-rij"><span class="plg-nr">${x.k}</span>
      <span class="plg-balk"><span style="width:${Math.round(x.pct/max*100)}%"></span></span>
      <span class="plg-r plg-r2">${x.pct}%${x.hoogPct?` · ${x.hoogPct}% hoog`:''}</span></div>`).join('')+
    rs.advies.map(a=>`<p class="plg-uitleg">💡 ${a}</p>`).join('');
}
// ── Leren uit opnames van de bulk-recorder ──
let _opnames=null, _opnameMelding='';
async function plGearOpnames(){
  _opnames='laden'; _opnameMelding=''; tekenInstellingen();
  try{
    if (!window.PLBulk || typeof PLBulk.lees!=='function') throw new Error('de bulk-recorder is er op dit toestel niet');
    const blokken=await PLBulk.lees();
    const per={};
    (blokken||[]).forEach(b=>{
      const k=b.sessie||'onbekend';
      const s=per[k]=per[k]||{ id:k, van:b.van, tot:b.tot, regels:[], voertuigen:{} };
      s.van=Math.min(s.van, b.van); s.tot=Math.max(s.tot, b.tot);
      (b.regels||[]).forEach(r=>s.regels.push(r));
      s.voertuigen[b.voertuig||'?']=true;
    });
    _opnames=Object.keys(per).map(k=>{
      const s=per[k], h=histUitRegels(s.regels), vs=Object.keys(s.voertuigen);
      return { id:k, van:s.van, tot:s.tot, h, voertuig: vs.length===1 ? vs[0] : '?' };
    }).filter(x=>x.h.n>0).sort((a,b)=>b.van-a.van);
  }catch(e){ _opnames=null; _opnameMelding='⚠️ '+e.message; console.warn('PLGear: opnames lezen', e); }
  tekenInstellingen();
}
function plGearLeerOpname(id){
  const o=(_opnames||[]).find(x=>x.id===id); if (!o) return;
  const r=PLGear.leerUitHist(o.h, 'opname:'+id);
  _opnameMelding = r.ok ? `✓ ${r.n} stabiele metingen uit de opname geleerd — nu ${r.versnellingen} versnellingen` : (r.dubbel ? 'Deze opname is al meegeteld.' : '⚠️ '+r.reden);
  tekenInstellingen();
}
function opnameBlok(){
  let h=`<button type="button" class="plg-wis" style="margin-top:10px" onclick="plGearOpnames()">📂 Leren uit opnames van de bulk-recorder</button>`;
  if (_opnames==='laden') h+=`<p class="plg-klein">⏳ Opnames lezen…</p>`;
  else if (Array.isArray(_opnames)){
    if (!_opnames.length) h+=`<p class="plg-klein">Geen opname met stabiel rijden gevonden.</p>`;
    const bronnen=(PLGear.model && PLGear.model.bronnen) || {};
    _opnames.forEach(o=>{
      const d=new Date(o.van), dat=isNaN(d)?'':d.toLocaleDateString('nl',{day:'numeric',month:'short'})+' '+d.toLocaleTimeString('nl',{hour:'2-digit',minute:'2-digit'});
      const zelfde = o.voertuig===PLGear.sleutel ? '✓ deze auto' : o.voertuig==='?' ? '? voertuig onbekend (opname van vóór 27-09)' : '✗ een andere auto';
      const al=!!bronnen['opname:'+o.id];
      h+=`<div class="plg-rij" style="align-items:flex-start"><span style="flex:1" class="plg-klein">${dat} · ${Math.round((o.tot-o.van)/60000)} min · ${o.h.n} stabiel<br>${zelfde}</span>
        <button type="button" class="plg-k" style="width:auto;padding:0 12px;font-size:13px;height:36px" ${al||o.voertuig!==PLGear.sleutel&&o.voertuig!=='?'?'disabled':''} onclick="plGearLeerOpname('${String(o.id).replace(/[^\w:.-]/g,'')}')">${al?'geteld':'Leer'}</button></div>`;
    });
    h+=`<p class="plg-klein">Alleen een opname van deze auto helpt; een andere auto of andere banden vervuilt het model. Een opname telt maar één keer.</p>`;
  }
  if (_opnameMelding) h+=`<p class="plg-uitleg">${_opnameMelding}</p>`;
  return h;
}
function plGearWis(){
  if (_wisBevestig && nu()-_wisBevestig<4000){ _wisBevestig=0; PLGear.leerOpnieuw(); }
  else _wisBevestig=nu();
  tekenInstellingen();
}

function plGearKies(k){
  const r=PLGear.corrigeer(k);
  _foutMelding = r.ok ? (k==='R' ? '✓ Onthouden: dit is achteruit.' : `✓ Onthouden: dit is de ${k}e. De rest schuift mee.`) : '⚠️ '+r.reden;
  toast(r.ok ? (k==='R' ? '⚙️ Achteruit onthouden' : `⚙️ Versnelling ${k} onthouden`) : r.reden);
  tekenInstellingen();
}

/* Het oordeel voor blok 5, puur: minstens 300 stabiele metingen deze sessie
   (ruwweg tien minuten rijden door de versnellingen). Past minder dan 70%
   bij een geleerde versnelling, of zijn er meer geleerd dan het profiel zegt,
   dan is dat de bevinding. */
function gearOordeel(se, st){
  se=se||{}; st=st||{};
  const n=se.stabiel||0, p=se.pasten||0, g=(st.versnellingen||[]).length;
  if (n<300) return { staat:'LET OP', detail:'maar '+n+' stabiele metingen deze rit; nodig: 300 (tien minuten door alle versnellingen)' };
  const pct=Math.round(p/n*100);
  const kop=pct+'% van '+n+' stabiele metingen paste bij een versnelling; '+g+(st.verwacht?' van '+st.verwacht:'')+' geleerd'+
    (se.correcties?', '+se.correcties+' correctie(s)':'')+(st.achteruit?', achteruit bekend':'')+(se.achteruit?' ('+se.achteruit+'× herkend)':'');
  if (st.verwacht && g>st.verwacht) return { staat:'FOUT', detail:kop+' — meer versnellingen dan het profiel zegt: slippende koppeling, andere banden of een verkeerd profiel' };
  if (pct<70) return { staat:'FOUT', detail:kop+' — te weinig: de geleerde verhoudingen passen niet bij deze auto' };
  return { staat:'ok', detail:kop };
}
PLGear._rijstijl = rijstijl;
PLGear.histUitRegels = histUitRegels;
PLGear.oordeel = gearOordeel;
window.PLGear = PLGear;
window.plGearOpnames = plGearOpnames;
window.plGearLeerOpname = plGearLeerOpname;
window.plGearKies = plGearKies;
window.openGearInstellingen = openGearInstellingen;
window.sluitGearInstellingen = sluitGearInstellingen;
window.plGearWis = plGearWis;
PLGear.boot();
})();
