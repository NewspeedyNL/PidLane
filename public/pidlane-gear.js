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
//
// Publiek
//   window.PLGear                    — module-object (state, model, detectie)
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
  opslaanMs: 15000
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

  // ═══════════════ voertuigsleutel ═══════════════
  _volgVoertuig(){
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
    this._opslaan(true); this._laad(sleutel); this.toon=null; this._render();
  },

  // ═══════════════ model ═══════════════
  _leegModel(sleutel){
    return { v:MODEL_V, sleutel, hist:{}, totaal:0, gears:[], sinds:nu(), bijgewerkt:0 };
  },
  _laad(sleutel){
    let m=null;
    const ruw=lsGet(LS_MODEL+sleutel);
    if (ruw){
      try{ m=JSON.parse(ruw); }
      catch(e){ console.warn('PLGear: opgeslagen model onleesbaar, begint opnieuw', e); m=null; }
    }
    if (!m || m.v!==MODEL_V || typeof m.hist!=='object') m=this._leegModel(sleutel);
    this.model=m; this.sleutel=sleutel;
    this._recentMatch=[]; this.afwijking=false;
    this._herberekend=0; this._vuil=false;
  },
  _opslaan(force){
    if (!this.model || (!this._vuil && !force)) return;
    lsSet(LS_MODEL+this.sleutel, JSON.stringify(this.model));
    this._opgeslagen=nu(); this._vuil=false;
  },
  leerOpnieuw(){
    const s=this.sleutel||'onbekend';
    this.model=this._leegModel(s); this.sleutel=s;
    this._recentMatch=[]; this.afwijking=false; this.toon=null;
    this._vuil=true; this._opslaan(true);
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
    if (m.totaal<CFG.minLeerN){ m.gears=[]; return; }
    const keys=Object.keys(m.hist).map(Number);
    if (!keys.length) return;
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
    m.bijgewerkt=nu(); this._vuil=true;
    if (m.gears.length!==oud)
      logI(`⚙️ Versnellingen geleerd: ${m.gears.length} (${m.gears.map(g=>nl(g,1)).join(' · ')} km/u per 1000 tpm)`);
  },

  // welke versnelling past bij ratio r? → {gear, fout} of null
  _match(r){
    const g=(this.model&&this.model.gears)||[];
    let best=-1, fout=Infinity;
    for (let i=0;i<g.length;i++){
      const f=Math.abs(r-g[i])/g[i];
      if (f<fout){ fout=f; best=i; }
    }
    return (best>=0 && fout<=CFG.matchTol) ? {gear:best+1, fout} : null;
  },
  nummeringZeker(){
    const g=(this.model&&this.model.gears)||[];
    return g.length>0 && g[0]<=CFG.eersteMax;
  },
  status(){
    const m=this.model||{totaal:0,gears:[]};
    return {
      uit:this.uit, voertuigBekend:!!(this.sleutel && this.sleutel!=='onbekend'),
      metingen:m.totaal,
      leren: m.totaal<CFG.minLeerN, voortgang: Math.min(1, m.totaal/CFG.minLeerN),
      versnellingen: m.gears.slice(), nummeringZeker:this.nummeringZeker(),
      afwijking:this.afwijking, toon:this.toon
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

      if (this.uit || !verbonden()){ this._zet(null); this._buf=[]; return; }

      const p=this._paar(), t=nu();
      if (!p || p.oud){ this._zet(null); return; }

      if (p.kmh>=CFG.minKmh) this._laatstRijden=t;
      const rijdt = (t-this._laatstRijden) < CFG.stilNaMs;
      if (!rijdt){ this._buf=[]; this._zet(null); return; }

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
      if (stabiel!==null){
        if (geldig) this._voegToe(stabiel);
        this._laatstStabiel=t;
      }

      if (t-this._herberekend>CFG.herberekenMs) this._herbereken();
      if (t-this._opgeslagen>CFG.opslaanMs) this._opslaan(false);

      const g=this.model.gears;
      if (!g.length){ this._zet(null); return; }   // nog aan het leren

      // ── detectie ──
      let doel;
      if (stabiel!==null){
        const m=this._match(stabiel);
        if (geldig) this._afwijkRegistreer(!!m);
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
    const g=this.model.gears.length;
    const toonRij = g>=2 && g<=9;
    const zeker=this.nummeringZeker();
    const cijfer = this.toon==='N' ? 'N' : String(this.toon);
    const oudCijfer = b.dataset.c;
    b.dataset.c=cijfer;
    let h=`<span class="pl-gear-cijfer${this.toon==='N'?' n':''}${oudCijfer!==cijfer?' wissel':''}">`+
          cijfer+(this.toon!=='N'&&!zeker?'<span class="v">?</span>':'')+`</span>`;
    if (toonRij){
      h+='<span class="pl-gear-rij" aria-hidden="true">';
      for (let i=1;i<=g;i++) h+=`<i class="${i===this.toon?'nu':''}"></i>`;
      h+='</span>';
    }
    if (this.afwijking) h+='<span class="pl-gear-stip" aria-hidden="true"></span>';
    b.innerHTML=h;
    b.setAttribute('aria-label', this.toon==='N'
      ? 'Neutraal of koppeling ingetrapt — tik voor instellingen'
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
let _wisBevestig=0;
function openGearInstellingen(){
  let ov=document.getElementById('plGearOv');
  if (!ov){
    ov=document.createElement('div'); ov.id='plGearOv';
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true');
    ov.setAttribute('aria-labelledby','plGearTtl');
    ov.addEventListener('click',e=>{ if(e.target===ov) sluitGearInstellingen(); });
    document.body.appendChild(ov);
  }
  _wisBevestig=0;
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
      const nuTxt = st.toon===i+1;
      return `<div class="plg-rij${nuTxt?' nu':''}">
        <span class="plg-nr">${i+1}</span>
        <span class="plg-balk"><span style="width:${Math.round(r/maxR*100)}%"></span></span>
        <span class="plg-r">${nl(r,1)}</span></div>`;
    }).join('');
    lijst=`<div class="plg-klein" style="margin:14px 0 4px">km/u per 1000 tpm</div>`+lijst;
    if (!st.nummeringZeker) lijst+=`<p class="plg-klein" style="margin:8px 0 0">
      De 1e versnelling is nog niet gezien, dus de nummering is voorlopig (herkenbaar aan het vraagteken). Die klopt vanzelf zodra je even in de 1e rijdt.</p>`;
  }
  const stTxt = st.uit ? 'Staat uit. Het PidLane-logo blijft gewoon staan.'
    : st.leren ? `Aan het leren: rij normaal door, in zoveel mogelijk versnellingen.`
    : `Tik op het cijfer in de topbalk om hier terug te komen.`;
  const wisTxt = _wisBevestig && nu()-_wisBevestig<4000 ? 'Tik nogmaals om te wissen' : 'Leer opnieuw';
  const naam = voertuigNaam();
  const vTxt = st.voertuigBekend ? (naam || 'herkend aan de VIN') : 'onbekend (geen VIN) — gedeeld model';
  ov.innerHTML=`<div class="plg-vel">
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
    ${lijst}
    <div class="plg-klein" style="margin-top:12px">Voertuig: ${vTxt} · ${st.metingen} metingen</div>
    <button type="button" class="plg-wis${st.afwijking?' let':''}" onclick="plGearWis()">${wisTxt}</button>
  </div>`;
}
function plGearWis(){
  if (_wisBevestig && nu()-_wisBevestig<4000){ _wisBevestig=0; PLGear.leerOpnieuw(); }
  else _wisBevestig=nu();
  tekenInstellingen();
}

window.PLGear = PLGear;
window.openGearInstellingen = openGearInstellingen;
window.sluitGearInstellingen = sluitGearInstellingen;
window.plGearWis = plGearWis;
PLGear.boot();
})();
