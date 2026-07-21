// pidlane-watchers.js — Laag B v2: passieve watchers + voorwaarde-gestuurde testbatterij
// Kernprincipe "doorstappen": elke test verklaart zélf wanneer hij geldig is
// (rij-fase, motortemp, benodigde PIDs, minimale duur in die fase). Klopt de
// voorwaarde niet, dan wordt de test overgeslagen en gaat de ronde door naar
// de volgende — geen valse meldingen uit een verkeerde context. Voorbeeld:
// "toerental stabiel" draait alleen bij CONSTANTE snelheid; bij stilstand
// stapt hij door en draait dáár de stationair-batterij.
//   • Leest ALLEEN pidHist/pidVals — nooit zelf I/O op de bus.
//   • Edge-triggered met cooldown per test: één melding per voorval.
//   • Events → PLMon (Laag A): zelfde samenvouwing, rapport en AI-context.
//   • Dekking wordt bijgehouden: het eindrapport meldt welke tests deze rit
//     wél/niet aan bod kwamen (n.v.t. ≠ geslaagd).
// Vereist: pidlane-monitor.js (PLMon) eerst geladen.
(function(){
'use strict';

const PLWatch = {
  cfg: {
    tickMs: 2000,
    stilNaMs: 8000, minSamples: 5, busStilFractie: 0.7,
    flatMinN: 8, flatMinMs: 6000, refVarMin: 40,
    cooldownMs: 60000, testCooldownMs: 120000,
    piekLimiet: { '0105':4, '010F':6, '0146':4, '015C':5, '0142':2 },
    dynamisch: ['010C','010D','0104','0111','010B','0110']
  },

  _timer:null, _seen:{}, _cool:{}, _flatCand:{}, _trimSinds:null, _busStil:false,
  _fase:'onbekend', _faseSinds:0,
  _dekking:{},            // testId → { runs:n, hits:n }
  _ritStart:0, _startECT:null, _thermoGemeld:false,

  // ═══════ TESTBATTERIJ — elk item verklaart z'n eigen voorwaarden ═══════
  // fase: in welke rij-fase(s) de test geldig is (null = elke fase)
  // warm: true = alleen bedrijfswarm (ECT≥65), false = alleen koud, null = n.v.t.
  // pids: welke PIDs met verse data aanwezig moeten zijn
  // duurMs: hoe lang de fase minimaal moet aanhouden vóór meten (in-schakel-rust)
  // check(c): null = geslaagd/geen bevinding; string = melding
  tests: [
    { id:'RPM_CONST', naam:'toerentalstabiliteit bij constante snelheid',
      fase:['constant'], warm:null, pids:['010C','010D'], duurMs:5000,
      check(c){ const r=c.win('010C',5000); if(r.length<6) return null;
        const sp=Math.max(...r)-Math.min(...r);
        if(sp>150 && c.val('010D')>30) return `toerental onrustig bij constante snelheid (spreiding ${Math.round(sp)} rpm) — kan wijzen op overslaan of slippende koppeling/omvormer`;
        return null; } },

    { id:'RATIO_CONST', naam:'overbrengingsverhouding bij constante snelheid',
      fase:['constant'], warm:null, pids:['010C','010D'], duurMs:6000,
      check(c){ const rpm=c.win('010C',6000), spd=c.win('010D',6000);
        if(rpm.length<6||spd.length<6||c.val('010D')<40) return null;
        const ratios=rpm.slice(-6).map((v,i)=>v/Math.max(1,spd.slice(-6)[i]||1));
        const mn=Math.min(...ratios), mx=Math.max(...ratios);
        if(mn>0 && (mx-mn)/mn>0.10) return `rpm/snelheid-verhouding drijft ${Math.round((mx-mn)/mn*100)}% bij constante snelheid — indicatie slip (koppeling/omvormer)`;
        return null; } },

    { id:'STAT_RPM', naam:'rustig stationair',
      fase:['stationair'], warm:true, pids:['010C'], duurMs:5000,
      check(c){ const r=c.win('010C',5000); if(r.length<6) return null;
        const sp=Math.max(...r)-Math.min(...r);
        if(sp>120) return `ruw stationair: toerental schommelt ${Math.round(sp)} rpm — denk aan valse lucht, bobine/bougie of stationairregeling`;
        return null; } },

    { id:'STAT_MAP', naam:'inlaatdruk bij stationair (vacuüm)',
      fase:['stationair'], warm:true, pids:['010B','0111','0106'], duurMs:5000,
      // guard: alleen met gesloten gasklep én aanwezige trims (benzine-smoorklepmotor);
      // een diesel heeft stationair vrijwel buitendruk en zou vals alarmeren.
      check(c){ if(c.val('0111')>10) return null;
        const m=c.win('010B',5000); if(m.length<4) return null;
        const gem=m.reduce((a,b)=>a+b,0)/m.length;
        if(gem>55) return `inlaatdruk stationair gemiddeld ${Math.round(gem)} kPa (verwacht ±25-45) — indicatie vacuümlek of lage compressie`;
        return null; } },

    { id:'ACCEL_LOAD', naam:'belastingrespons bij accelereren',
      fase:['accelereren'], warm:null, pids:['0104','0111'], duurMs:2500,
      check(c){ const th=c.win('0111',3000), ld=c.win('0104',3000);
        if(th.length<3||ld.length<3) return null;
        const thGem=th.reduce((a,b)=>a+b,0)/th.length;
        if(thGem>30 && Math.max(...ld)<35) return `motorbelasting blijft achter (max ${Math.round(Math.max(...ld))}%) bij ${Math.round(thGem)}% gaspedaal — MAF/MAP leest mogelijk te laag`;
        return null; } },

    { id:'LAADSPANNING', naam:'laadspanning bij draaiende motor',
      fase:null, warm:null, pids:['0142','010C'], duurMs:0,
      check(c){ if(c.val('010C')<500) return null;   // motor moet draaien
        const v=c.win('0142',8000); if(v.length<4) return null;
        const gem=v.reduce((a,b)=>a+b,0)/v.length;
        if(gem<13.2) return `laadspanning laag: gemiddeld ${gem.toFixed(1)} V bij draaiende motor — dynamo/riem/massaverbinding controleren`;
        if(gem>15.2) return `laadspanning hoog: gemiddeld ${gem.toFixed(1)} V — spanningsregelaar verdacht`;
        return null; } },

    { id:'O2_ACTIVITEIT', naam:'lambdasonde-activiteit (warm stationair)',
      fase:['stationair'], warm:true, pids:['0114','010C'], duurMs:10000,
      check(c){ const o=c.win('0114',10000); if(o.length<8) return null;
        if(Math.max(...o)-Math.min(...o)<0.2) return `lambdasonde B1S1 nauwelijks actief (spreiding ${(Math.max(...o)-Math.min(...o)).toFixed(2)} V over 10s) — luie of vlakke sonde`;
        return null; } },

    { id:'ECT_HOOG', naam:'oververhittingsbewaking',
      fase:null, warm:null, pids:['0105'], duurMs:0,
      check(c){ const t=c.val('0105');
        if(typeof t==='number' && t>108) return `koelwater ${t}°C — oververhitting, direct aandacht`;
        return null; } }
  ],

  boot(){
    if (this._timer) return;
    this._timer = setInterval(()=>{ try{ this._tick(); }catch(e){} }, this.cfg.tickMs);
  },

  _actief(){ return !!(window.PLMon && window.PLMon.active); },

  _tick(){
    if (!this._actief()){ this._seen={}; this._flatCand={}; this._trimSinds=null;
      this._fase='onbekend'; this._faseSinds=0; this._ritStart=0; this._startECT=null;
      this._thermoGemeld=false; this._dekking={}; return; }
    const h=(typeof pidHist!=='undefined')?pidHist:{};
    const v=(typeof pidVals!=='undefined')?pidVals:{};
    const nu=Date.now();
    if(!this._ritStart){ this._ritStart=nu; this._startECT=(typeof v['0105']==='number')?v['0105']:null; }

    // ── rij-fase + hoe lang die al aanhoudt (in-schakel-rust voor tests) ──
    const st=(window.PLMon&&window.PLMon._state)?window.PLMon._state():{fase:'onbekend',temp:'onbekend'};
    if(st.fase!==this._fase){ this._fase=st.fase; this._faseSinds=nu; }
    const faseDuur=nu-this._faseSinds;

    // ── bus-gezondheid (≥70% stil = adapter-hik: alles onderdrukken) ──
    const actieve=[]; let stil=0;
    for (const pid of Object.keys(h)){
      const arr=h[pid]; if(!Array.isArray(arr)||!arr.length) continue;
      const lastT=arr[arr.length-1].t;
      if(nu-lastT>30000) continue;
      actieve.push(pid);
      if(nu-lastT>this.cfg.stilNaMs) stil++;
    }
    const busStilNu=actieve.length>=3 && (stil/actieve.length)>=this.cfg.busStilFractie;
    if(busStilNu&&!this._busStil) this._log('Watchers: bus/adapter-hik — meldingen onderdrukt','info');
    this._busStil=busStilNu;

    // ── watcher 1: uitval per PID (met herstelmelding) ──
    for (const pid of actieve){
      const arr=h[pid]; const last=arr[arr.length-1];
      const s=this._seen[pid]||(this._seen[pid]={lastT:0,samples:0,uitgevallen:false,vanaf:0});
      if(last.t!==s.lastT){
        if(s.uitgevallen){
          this._meld('UITVAL:'+pid, `${this._naam(pid)} hersteld na ~${Math.round((nu-s.vanaf)/1000)}s uitval`, true);
          s.uitgevallen=false;
        }
        s.lastT=last.t; s.samples++; continue;
      }
      if(s.uitgevallen||this._busStil) continue;
      if(s.samples>=this.cfg.minSamples && nu-s.lastT>this.cfg.stilNaMs){
        s.uitgevallen=true; s.vanaf=s.lastT;
        this._meld('UITVAL:'+pid, `${this._naam(pid)} levert geen data meer terwijl de rest doorloopt`, false);
      }
    }
    if(this._busStil) return;

    // ── watcher 2: bevroren dynamische waarde (RPM als referentie) ──
    const rpmArr=(h['010C']||[]).filter(x=>x.t>nu-this.cfg.flatMinMs).map(x=>x.v);
    const rpmBeweegt=rpmArr.length>=4 && (Math.max(...rpmArr)-Math.min(...rpmArr))>=this.cfg.refVarMin;
    for (const pid of this.cfg.dynamisch){
      if(pid==='010C') continue;
      const recent=(h[pid]||[]).filter(x=>x.t>nu-this.cfg.flatMinMs);
      if(recent.length<this.cfg.flatMinN){ delete this._flatCand[pid]; continue; }
      const vlak=recent.every(x=>x.v===recent[0].v);
      if(vlak&&rpmBeweegt){
        if(!this._flatCand[pid]) this._flatCand[pid]=nu;
        else if(nu-this._flatCand[pid]>=this.cfg.flatMinMs){
          this._meld('BEVROREN:'+pid, `${this._naam(pid)} staat bevroren op ${recent[0].v} terwijl toerental varieert`, false);
          this._flatCand[pid]=nu+this.cfg.cooldownMs;
        }
      } else delete this._flatCand[pid];
    }

    // ── watcher 3: fysiek onmogelijke sprong (trage-fysica PIDs) ──
    for (const pid of Object.keys(this.cfg.piekLimiet)){
      const arr=h[pid]; if(!Array.isArray(arr)||arr.length<2) continue;
      const a=arr[arr.length-2], b=arr[arr.length-1];
      const dt=(b.t-a.t)/1000; if(dt<=0||dt>15) continue;
      if(Math.abs(b.v-a.v)/dt>this.cfg.piekLimiet[pid]){
        this._meld('PIEK:'+pid, `${this._naam(pid)} sprong ${a.v}→${b.v} in ${dt.toFixed(1)}s — fysiek niet plausibel, wijst op sensor/bedrading`, false);
      }
    }

    // ── watcher 4: structureel scheve brandstoftrim (warm, aanhoudend) ──
    const ect=v['0105'];
    if(typeof ect==='number'&&ect>=65){
      const stf=v['0106'], ltf=v['0107'];
      if(typeof stf==='number'&&typeof ltf==='number'){
        const som=stf+ltf;
        if(Math.abs(som)>20){
          if(!this._trimSinds) this._trimSinds=nu;
          else if(nu-this._trimSinds>=10000){
            this._meld('TRIM:B1', `brandstoftrim B1 aanhoudend ${som.toFixed(1)}% — mengsel ${som>0?'mager (ECU compenseert bij)':'rijk (ECU regelt terug)'}`, false);
            this._trimSinds=nu+120000;
          }
        } else this._trimSinds=null;
      }
    }

    // ── rit-niveau: thermostaat (koud gestart, wordt niet warm) ──
    if(!this._thermoGemeld && this._startECT!==null && this._startECT<50 &&
       nu-this._ritStart>12*60000 && typeof ect==='number' && ect<70 && (v['010C']||0)>500){
      this._thermoGemeld=true;
      this._meld('THERMOSTAAT', `motor na ${Math.round((nu-this._ritStart)/60000)} min rijden nog maar ${ect}°C (start ${this._startECT}°C) — thermostaat blijft vermoedelijk open hangen`, false);
    }

    // ── TESTBATTERIJ: voorwaarde klopt niet → doorstappen naar de volgende ──
    const ctx={
      val:(pid)=>v[pid],
      win:(pid,ms)=>((h[pid]||[]).filter(x=>x.t>nu-ms).map(x=>x.v))
    };
    for (const t of this.tests){
      // 1. fase-poort: verkeerde fase of nog te kort in deze fase → overslaan
      if(t.fase && (!t.fase.includes(st.fase) || faseDuur<t.duurMs)) continue;
      if(!t.fase && t.duurMs && faseDuur<t.duurMs) continue;
      // 2. temp-poort
      if(t.warm===true  && st.temp!=='warm') continue;
      if(t.warm===false && st.temp!=='koud') continue;
      // 3. data-poort: benodigde PIDs met verse waarde aanwezig
      if(t.pids && t.pids.some(p=>{
        const arr=h[p]; return !(Array.isArray(arr)&&arr.length&&nu-arr[arr.length-1].t<10000);
      })) continue;
      // → test draait daadwerkelijk: dekking bijhouden
      const d=this._dekking[t.id]||(this._dekking[t.id]={runs:0,hits:0});
      d.runs++;
      let uitkomst=null;
      try{ uitkomst=t.check(ctx); }catch(e){}
      if(uitkomst){
        d.hits++;
        this._meldTest('TEST:'+t.id, uitkomst);
      }
    }
  },

  // ── dekkingsoverzicht voor het eindrapport: n.v.t. ≠ geslaagd ──
  coverageText(){
    const gedaan=[], niet=[];
    for (const t of this.tests){
      const d=this._dekking[t.id];
      if(d&&d.runs) gedaan.push(`${t.naam} (${d.runs}× gemeten${d.hits?', '+d.hits+'× afwijkend':''})`);
      else niet.push(t.naam);
    }
    const L=['Testdekking deze rit:'];
    if(gedaan.length) L.push('  uitgevoerd: '+gedaan.join('; '));
    if(niet.length)  L.push('  niet aan bod (voorwaarde deed zich niet voor): '+niet.join('; '));
    return L.join('\n');
  },

  _meld(sig, reden, negeerCooldown){
    const nu=Date.now();
    if(!negeerCooldown && this._cool[sig] && nu-this._cool[sig]<this.cfg.cooldownMs) return;
    this._cool[sig]=nu;
    try{ window.PLMon._event(sig, 'watcher', reden, null, true); }catch(e){}
  },
  _meldTest(sig, reden){
    const nu=Date.now();
    if(this._cool[sig] && nu-this._cool[sig]<this.cfg.testCooldownMs) return;
    this._cool[sig]=nu;
    try{ window.PLMon._event(sig, 'test', reden, null, true); }catch(e){}
  },

  _naam(pid){
    try{ const d=(typeof getPidDef==='function')?getPidDef(pid):null;
      if(d&&d.name) return d.name+' ('+pid+')'; }catch(e){}
    return pid;
  },
  _log(msg,lvl){ try{ if(typeof log==='function') log(msg,lvl||'info'); }catch(e){} }
};

window.PLWatch = PLWatch;
PLWatch.boot();
})();
