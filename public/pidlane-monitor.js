// pidlane-monitor.js — Laag A: passieve intermittente-foutvangst (ECU-native)
// Doel: tijdens normaal rijden continu de eigen foutuitvoer van de ECU oogsten.
// De ECU bemonstert honderden keren sneller dan OBD-polling ooit kan; een echte
// intermittente fout (50ms draadbreuk over een hobbel) zien wij nooit in
// pidHist — de ECU wél, in z'n pending-buffer (mode 07). Deze module:
//   1. Polt goedkoop mode 0101 (MIL + DTC-teller + readiness) elke ~20s.
//   2. Bij verandering: oogst mode 07 (pending), 03 (bevestigd), 0A (permanent).
//   3. Bij een NIEUWE code: grijpt de freeze frame (mode 02) van de ECU zelf
//      + een 5s-terugkijk uit pidHist, getagd met rij-status.
//   4. Vouwt herhalingen samen op signatuur met teller + rij-status-histogram
//      ("MAP viel 7× uit, allemaal tijdens accelereren" = de diagnose).
//   5. Pending die verdwijnt zonder bevestigd te worden = klassiek intermittent.
//   6. Eén compacte samenvatting naar het rapportarchief (→ AI-context), geen
//      AI-calls per event (kostendiscipline).
// Integratie: leunt op bestaande globals — sendCmd(), pidVals, pidHist,
// connected, demoMode, selectedNetwork, log(), registerSessionReport().
// Start/stopt zichzelf via een watchdog; geen wijzigingen elders nodig.
(function(){
'use strict';

const PLMon = {
  // ── instellingen ──
  cfg: {
    checkMs: 20000,      // interval statuscheck (0101) — traag en goedkoop
    watchdogMs: 2000,    // hoe vaak we kijken of we moeten starten/stoppen
    snapshotMs: 5000,    // terugkijkvenster uit pidHist bij een event
    snapshotPids: ['010C','010D','0104','0105','0106','0107','0111','010B','0110'],
    ffPids: ['0C','0D','05','04','06','07','11'], // freeze frame: rpm,snelh,koelw,load,trims,gasklep
    maxEvents: 60        // harde cap op het event-log (geheugen)
  },

  // ── runtime state ──
  // userAan: de gebruiker heeft de rit-monitor zelf AANgezet.
  // Bewust omgekeerd t.o.v. de oude userOff-vlag: de monitor start niet meer
  // vanzelf bij het verbinden. Hij greep tijdens de eerste seconden na een
  // PID-setwissel naar een bus die nog aan het inregelen was en trok daaruit
  // conclusies (STAT_RPM, RPM_CONST) die niets met de motor te maken hadden.
  // Meten is nu een bewuste handeling.
  // 2026-07-26: de stand wordt NIET meer hersteld uit localStorage. De monitor
  // begint elke sessie uit; een vergeten "aan" van weken terug mocht niet
  // ongemerkt weer gaan meten zodra je verbindt. De schakelaar zit op de
  // Rit-monitor-pane zelf (deur Live PID-data), niet meer in het ☰-menu.
  userAan: false,
  active: false,
  _timer: null,
  _watchdog: null,
  _busy: false,
  _baselineDone: false,
  prev: { mil:null, count:null, ready:null },
  sets: { pending:new Set(), confirmed:new Set(), permanent:new Set() },
  events: {},            // sig → eventrecord
  _order: [],            // volgorde van signaturen (voor cap + rapportage)
  startedAt: null,
  _reported: false,

  // ═══════════════ levenscyclus ═══════════════
  boot(){
    if (this._watchdog) return;
    this._watchdog = setInterval(()=>{
      // Remote uitschakelbaar via admin (feat_monitor); ontbrekende key = AAN.
      const featOk = (typeof featOn!=='function') || featOn('feat_monitor');
      // De watchdog START niet meer uit zichzelf: dat doet alleen de gebruiker
      // via toggleRitMonitor(). Hij bewaakt nog wél het STOPPEN, zodat een
      // losgekoppelde of demo-sessie geen monitor laat doordraaien.
      const mag = featOk && this.userAan &&
                  (typeof connected!=='undefined' && connected) &&
                  !(typeof demoMode!=='undefined' && demoMode);
      if (!mag && this.active) this.stop();
    }, this.cfg.watchdogMs);
  },

  start(){
    if (this.active) return;
    this.active = true;
    this._baselineDone = false;
    this._reported = false;
    this.prev = { mil:null, count:null, ready:null };
    this.sets = { pending:new Set(), confirmed:new Set(), permanent:new Set() };
    this.events = {}; this._order = [];
    this.startedAt = Date.now();
    this._log('Monitor actief: passieve foutbewaking gestart','info');
    // Eerste check snel na start (baseline), daarna op interval.
    setTimeout(()=>this._cycle(), 3000);
    this._timer = setInterval(()=>this._cycle(), this.cfg.checkMs);
  },

  stop(){
    if (!this.active) return;
    this.active = false;
    clearInterval(this._timer); this._timer = null;
    // Eindrapport alleen als er iets te melden valt.
    if (this._order.length && !this._reported) this.report();
    this._log('Monitor gestopt','info');
  },

  // ═══════════════ hoofdcyclus ═══════════════
  async _cycle(){
    if (!this.active || this._busy) return;
    // Netjes wachten als de fast-lane midden in een pollronde zit: bij een
    // bezet slot slaan we deze tik over en proberen we het bij de volgende
    // opnieuw. withBusOfNiets() geeft het slot ALTIJD terug, ook als het werk
    // hieronder er met een fout uitspringt (#115) — en geeft nooit per
    // ongeluk het slot van een ander vrij.
    return await withBusOfNiets('monitor', ()=>this._cycleWerk());
  },

  // Het werk van één cyclus, met het busslot al in handen. Los van _cycle()
  // zodat de inspringing van dit blok ongemoeid blijft naast de poort.
  async _cycleWerk(){
    this._busy = true;
    try{
      const st = await this._readStatus();          // mode 0101
      if (!st) return;                              // NO DATA / storing: overslaan (finally geeft de bus terug)

      if (!this._baselineDone){
        // Nulmeting: bestaande situatie vastleggen zonder events te maken.
        this.prev = st;
        await this._harvest(true);
        this._baselineDone = true;
        return;
      }

      const telVeranderd = st.count !== this.prev.count;
      const milVeranderd = st.mil   !== this.prev.mil;
      if (telVeranderd || milVeranderd){
        this._log(`Monitor: DTC-status veranderd (teller ${this.prev.count}→${st.count}${milVeranderd?', MIL '+(st.mil?'AAN':'uit'):''}) — buffers oogsten`,'warn');
        await this._harvest(false);
      } else if (st.ready !== this.prev.ready){
        // Readiness-flip: informatief (monitor afgerond/gereset), geen fout.
        this._event('READINESS','info','readiness-bits gewijzigd', null, false);
      }
      this.prev = st;
    }catch(e){ /* bus-hik: stil overslaan, volgende cyclus opnieuw */ }
    finally{ this._busy = false; }
  },

  // ── mode 0101: MIL-bit, DTC-teller, readiness ──
  async _readStatus(){
    const r = await sendCmd('0101', 4000);
    if (!r || /NO DATA|ERROR|UNABLE/i.test(r)) return null;
    // Multi-ECU: elke ECU stuurt zijn eigen 4101-regel, dus per regel door
    // splitBatchResponse(); teller = hoogste over ECU's.
    //
    // Dat uitpakken gebeurde hier tot #116 met een eigen zoekactie naar de
    // 41-echo, en daarmee ging deze module om de ene plek heen waar een
    // antwoord in stukken valt én de meetkwaliteit geteld wordt. Wat deze lus niet kende
    // maar de helper wél: framemarkers midden in een regel, 29-bits
    // CAN-headers, en ISO-TP-padding achteraan.
    let mil=null, count=null, ready='';
    for (const line of String(r).split(/[\r\n]+/)){
      const b = splitBatchResponse(line, ['0101'])['0101'];
      if (!b || b.length < 4) continue;
      const A = b[0];
      const rdy = b.slice(1,4).map(x=>x.toString(16).toUpperCase().padStart(2,'0')).join('');  // bytes B,C,D
      const m = (A & 0x80) !== 0;
      const c = A & 0x7F;
      if (count===null || c>count){ count=c; mil=m; }
      ready += rdy;                                  // alle ECU's samen als vingerafdruk
    }
    if (count===null) return null;
    return { mil, count, ready };
  },

  // ── buffers oogsten: 07 pending, 03 bevestigd, 0A permanent ──
  async _harvest(isBaseline){
    const bronnen = [ ['07','47','pending'], ['03','43','confirmed'], ['0A','4A','permanent'] ];
    for (const [mode, hdr, naam] of bronnen){
      let raw='';
      try{ raw = await sendCmd(mode, 6000); }catch(e){ continue; }
      const codes = this._parseDTC(raw, hdr);
      if (codes===null) continue;                    // NO DATA op deze mode: sets laten staan
      const nieuw = new Set(codes);
      const oud = this.sets[naam];

      // Nieuwe codes → event (+ freeze frame bij niet-baseline).
      for (const code of nieuw){
        if (!oud.has(code)){
          if (isBaseline){
            this._event(code, naam, `al aanwezig bij start (${naam})`, null, false);
          } else {
            const ff = await this._freezeFrame();
            this._event(code, naam, `nieuw in ${naam}-buffer`, ff, true);
          }
        }
      }
      // Pending dat verdwijnt zónder bevestigd te raken = intermittent gedrag.
      if (naam==='pending'){
        for (const code of oud){
          if (!nieuw.has(code) && !this.sets.confirmed.has(code)){
            this._event(code, 'pending', 'verdwenen uit pending zonder bevestiging — intermitterend', null, !isBaseline);
          }
        }
      }
      this.sets[naam] = nieuw;
    }
  },

  // DTC-parser, gegeneraliseerd uit realScanDTC(): respHeader '43'/'47'/'4A'.
  _parseDTC(r, respHeader){
    if (!r) return null;
    if (/NO DATA/i.test(r)) return [];               // expliciet leeg
    const codes=[];
    const isCAN=/^[6-9A-Ca-c]/.test(String((typeof selectedNetwork!=='undefined'&&selectedNetwork?.id)||'6'));
    for (const line of String(r).split(/[\r\n]+/)){
      const hex=line.replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
      const idx=hex.indexOf(respHeader);
      if (idx<0) continue;
      let body=hex.slice(idx+2);
      if (isCAN && body.length>=2){
        const cnt=parseInt(body.slice(0,2),16);
        if (cnt>=0 && cnt<=20 && body.length-2>=cnt*4) body=body.slice(2,2+cnt*4);
      }
      for (let i=0;i+4<=body.length;i+=4){
        const w=parseInt(body.slice(i,i+4),16);
        if (w===0||isNaN(w)) continue;
        const t=['P','C','B','U'][(w>>14)&3];
        const code=t+((w>>12)&3)+((w>>8)&0xF).toString(16).toUpperCase()+('00'+(w&0xFF).toString(16).toUpperCase()).slice(-2);
        if (!codes.includes(code)) codes.push(code);
      }
    }
    return codes;
  },

  // ── freeze frame (mode 02, frame 00): de snapshot van de ECU zelf ──
  async _freezeFrame(){
    const ff={};
    for (const pid of this.cfg.ffPids){
      try{
        const r = await sendCmd('02'+pid+'00', 3000);
        if (!r || /NO DATA/i.test(r)) continue;
        const hex=String(r).replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
        const i=hex.indexOf('42'+pid);
        if (i<0) continue;
        const d=hex.slice(i+6);                      // na 42 PP FF(frame)
        const A=parseInt(d.slice(0,2),16), B=parseInt(d.slice(2,4),16);
        if (isNaN(A)) continue;
        ff[pid] = pid==='0C' ? Math.round((A*256+B)/4)      // rpm
               : pid==='05' ? A-40                          // koelwater °C
               : (pid==='06'||pid==='07') ? Math.round((A-128)/1.28*10)/10 // trim %
               : pid==='04'||pid==='11' ? Math.round(A/2.55) // load/gasklep %
               : A;                                          // snelheid e.d.
      }catch(e){ console.warn('sendCmd mislukt:', e); }
    }
    return Object.keys(ff).length?ff:null;
  },

  // ── rij-status uit live data (poort voor context, geen aparte feature) ──
  _state(){
    const v = (typeof pidVals!=='undefined')?pidVals:{};
    const h = (typeof pidHist!=='undefined')?pidHist:{};
    const spd=v['010D'], rpm=v['010C'], ect=v['0105'];
    let fase='onbekend';
    if (typeof spd==='number'){
      // helling van de snelheid over de laatste ~3s bepaalt de fase
      const sh=(h['010D']||[]).filter(x=>x.t>Date.now()-3000).map(x=>x.v);
      const d=sh.length>=2 ? sh[sh.length-1]-sh[0] : 0;
      if (spd<3 && (rpm===undefined||rpm>300)) fase='stationair';
      else if (d>4) fase='accelereren';
      else if (d<-4) fase='remmen';
      else fase='constant';
    }
    const temp = typeof ect==='number' ? (ect<65?'koud':'warm') : 'onbekend';
    return { fase, temp };
  },

  // ── 5s-terugkijk uit pidHist (grofkorrelig, maar context) ──
  _snapshot(){
    const h=(typeof pidHist!=='undefined')?pidHist:{};
    const t0=Date.now()-this.cfg.snapshotMs, out={};
    for (const pid of this.cfg.snapshotPids){
      const arr=(h[pid]||[]).filter(x=>x.t>=t0).map(x=>x.v);
      if (arr.length) out[pid]=arr;
    }
    return Object.keys(out).length?out:null;
  },

  // ── event samenvouwen op signatuur ──
  _event(code, bron, reden, freezeFrame, meldLuid){
    const sig=code;
    const st=this._state();
    let ev=this.events[sig];
    if (!ev){
      if (this._order.length>=this.cfg.maxEvents) return;  // cap bereikt
      ev=this.events[sig]={ code, count:0, eerste:Date.now(), laatste:0,
        bronnen:new Set(), redenen:[], fasen:{}, temp:{}, ff:null, snap:null };
      this._order.push(sig);
    }
    ev.count++;
    ev.laatste=Date.now();
    ev.bronnen.add(bron);
    if (ev.redenen.length<5) ev.redenen.push(reden);
    ev.fasen[st.fase]=(ev.fasen[st.fase]||0)+1;
    ev.temp[st.temp]=(ev.temp[st.temp]||0)+1;
    if (freezeFrame && !ev.ff) ev.ff=freezeFrame;          // eerste FF is genoeg
    if (!ev.snap){ const s=this._snapshot(); if (s) ev.snap=s; }
    if (meldLuid) this._log(`Monitor: ${code} — ${reden} [${st.fase}/${st.temp}]`,'warn');
    // Ernstige waarschuwingen automatisch laten verifiëren (focus-hertest).
    if (meldLuid) try{ if (window.PLVerify) window.PLVerify.consider(sig); }catch(e){ console.warn('PLVerify.consider mislukt:', e); }
  },

  // ═══════════════ rapportage ═══════════════
  summaryText(){
    const dur=Math.round((Date.now()-(this.startedAt||Date.now()))/60000);
    const L=[`PidLane passieve foutbewaking — ${dur} min meegereden`,
             `Eindstand ECU: MIL ${this.prev.mil?'AAN':'uit'}, DTC-teller ${this.prev.count??'?'}`,''];
    if (!this._order.length){
      L.push('Geen afwijkingen waargenomen tijdens de rit.');
      try{ if (window.PLWatch && window.PLWatch.coverageText) L.push('', window.PLWatch.coverageText()); }catch(e){ console.warn('PLWatch.coverageText mislukt:', e); }
      return L.join('\n');
    }
    for (const sig of this._order){
      const e=this.events[sig];
      const fasen=Object.entries(e.fasen).map(([k,n])=>`${k}×${n}`).join(', ');
      const temp=Object.entries(e.temp).map(([k,n])=>`${k}×${n}`).join(', ');
      L.push(`• ${e.code} — ${e.count}× (${[...e.bronnen].join('+')})`);
      L.push(`  waarnemingen: ${e.redenen.join(' | ')}`);
      L.push(`  rij-status: ${fasen}; motortemp: ${temp}`);
      if (e.ff) L.push(`  freeze frame (ECU): ${Object.entries(e.ff).map(([p,v])=>p+'='+v).join(' ')}`);
      if (e.verif) L.push(`  verificatie (focus-hertest): ${e.verif.status.toUpperCase()} — ${e.verif.tekst}`);
      if (e.snap) L.push(`  5s-terugkijk: ${Object.entries(e.snap).map(([p,a])=>p+'['+a.slice(-6).join(',')+']').join(' ')}`);
    }
    L.push('','Interpretatie-hint: clustering van herhalingen in één rij-fase (bijv. alleen bij accelereren) wijst op belasting-/trillingsafhankelijk falen: bedrading, connector, of een sensor die onder last wegvalt.');
    try{ if (window.PLWatch && window.PLWatch.coverageText) L.push('', window.PLWatch.coverageText()); }catch(e){ console.warn('PLWatch.coverageText mislukt:', e); }
    return L.join('\n');
  },

  report(){
    this._reported=true;
    const n=this._order.length;
    try{
      registerSessionReport({ type:'monitor',
        title:`Passieve foutbewaking — ${n?n+' bevinding'+(n===1?'':'en'):'geen bevindingen'}`,
        text:this.summaryText() });
    }catch(e){ console.warn('registerSessionReport mislukt:', e); }
    this._log(`Monitor-rapport opgeslagen (${n} bevinding${n===1?'':'en'})`, n?'warn':'ok');
  },

  _log(msg,lvl){ try{ if (typeof log==='function') log(msg,lvl||'info'); }catch(e){ /* stil: melding mag nooit de stroom breken */ } }
};

window.PLMon = PLMon;

/* ── Gebruikersschakelaar (fase 4) ────────────────────────────────────
   Tot nu toe startte en stopte de monitor zichzelf en was hij alleen op
   afstand uit te zetten via de feature-flag. Er was dus geen enkele knop
   voor de gebruiker. Deze twee functies vullen dat gat; de knop zit sinds
   2026-07-26 op de Rit-monitor-pane zelf (#monPaneToggle) i.p.v. in het
   ☰-menu, en de stand wordt niet meer bewaard tussen sessies. */
window.toggleRitMonitor = function(){
  PLMon.userAan = !PLMon.userAan;
  const verbonden = (typeof connected!=='undefined' && connected) &&
                    !(typeof demoMode!=='undefined' && demoMode);
  const featOk = (typeof featOn!=='function') || featOn('feat_monitor');
  if (!PLMon.userAan){
    if (PLMon.active) PLMon.stop();
  } else if (verbonden && featOk && !PLMon.active){
    PLMon.start();          // meteen starten, niet wachten op de watchdog-tik
  }
  try{ if(typeof log==='function') log(PLMon.userAan?'🔔 Rit-monitor door gebruiker AANgezet':'🔕 Rit-monitor door gebruiker UITgezet','info'); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  try{ if(typeof showToast==='function') showToast(
        !PLMon.userAan ? '🔕 Rit-monitor uit'
        : (verbonden ? '🔔 Rit-monitor gestart' : '🔔 Rit-monitor aan — start zodra je verbonden bent')); }catch(e){ /* stil: melding mag nooit de stroom breken */ }
  window.updateMonitorBtn();
};
window.monitorStatusTekst = function(){
  if (!PLMon.userAan) return 'uit';
  if (PLMon.active)   return 'actief';
  if (typeof featOn==='function' && !featOn('feat_monitor')) return 'geblokkeerd';
  return 'wacht op verbinding';
};
window.updateMonitorBtn = function(){
  const st=window.monitorStatusTekst();
  // Knop op de pane (huidige plek).
  const p=document.getElementById('monPaneToggle');
  if(p){
    const aan=PLMon.userAan;
    p.innerHTML = (aan?'🔔':'🔕') + ' Rit-monitor ' + (aan?'uitzetten':'aanzetten')
      + '<span style="font-size:10.5px;font-weight:700;opacity:.75">'+st+'</span>';
    p.style.borderColor = aan ? 'var(--gn,#00a86b)' : 'var(--bd,#26303b)';
    p.style.color       = aan ? 'var(--gn,#00a86b)' : 'var(--tx,#e6e9ef)';
  }
  // Oud menu-item: alleen nog bijwerken als het er (in een oudere build) is.
  const b=document.getElementById('monitorBtn');
  if(b){
    b.innerHTML = (PLMon.userAan?'🔔':'🔕') + ' Rit-monitor'
      + '<span style="margin-left:auto;font-size:11px;font-weight:700;opacity:.75">'+st+'</span>';
    b.style.display='flex'; b.style.alignItems='center'; b.style.gap='6px';
  }
};
setInterval(()=>{ try{ window.updateMonitorBtn(); }catch(e){ console.warn('updateMonitorBtn mislukt:', e); } }, 3000);

// De oude bewaarde stand wordt niet meer gelezen — sleutel opruimen zodat er
// niets blijft rondslingeren dat suggereert dat de monitor nog aan zou staan.
try{ localStorage.removeItem('pl_monitor_aan'); }catch(e){ /* stil: opslag kan vol of geblokkeerd zijn */ }

PLMon.boot();
})();
