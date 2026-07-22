// pidlane-verify.js — Verificatiemodus: focus-hertest van ernstige waarschuwingen
// Als een waarschuwing als ernstig/hoog-risico/duur geldt, claimt deze module
// kort (±12s) de bus, bemonstert ALLEEN de betrokken PIDs op hoog tempo,
// toetst eerst de GEZONDHEID van de data zelf (respons-rate, uitval, vastzitten,
// harde grenzen) en hertest daarna de oorspronkelijke waarschuwing — zonder
// last van andere data. Uitkomst is één van drie:
//   • bevestigd            — afwijking reproduceert op schone focusdata
//   • niet gereproduceerd  — nu niet zichtbaar (kan intermitterend blijven)
//   • meetprobleem         — de DATA is onbetrouwbaar; wantrouw de melding,
//                            verdenk adapter/bedrading vóór het onderdeel
// Buslogica: de fast-lane poll-loop slaat rondes over zolang window._pollBusy
// waar is; wij zetten die vlag vóór elke eigen meting en geven 'm daarna terug.
// Koppeling: PLMon roept PLVerify.consider(sig) aan bij luide events; de rest
// van de app kan overal PLVerify.start({titel,pids,sig}) aanroepen (AI-rapport,
// DTC-scherm, basic check). Resultaat wordt aan het monitor-event gehangen én
// als klein rapport gearchiveerd (→ AI-context).
// Vereist: pidlane-monitor.js eerst geladen; sendCmd/pidVals/connected globals.
(function(){
'use strict';

const PLVerify = {
  cfg: {
    duurMs: 12000,        // lengte van het focus-venster
    maxAuto: 3,           // max. automatische verificaties per sessie
    tussenMs: 60000,      // minimale pauze tussen automatische verificaties
    sampleGapMs: 120      // adempauze tussen focus-samples
  },

  // Welke signaturen gelden als ernstig genoeg voor automatische verificatie.
  ERNSTIG: [/^ECT_HOOG/, /^PIEK:/, /^UITVAL:/, /^BEVROREN:/, /^TRIM/, /^THERMOSTAAT/,
            /^TEST:x_laadspanning/, /^TEST:ECT_HOOG/],

  _bezig:false, _autoCount:0, _lastAuto:0, _gedaan:{},

  // ── automatische trigger vanuit PLMon (Laag A/B) ──
  consider(sig){
    if (!this.ERNSTIG.some(rx=>rx.test(sig))) return;
    if (this._gedaan[sig]) return;                       // 1× per signatuur
    const nu=Date.now();
    if (this._autoCount>=this.cfg.maxAuto) return;
    if (nu-this._lastAuto<this.cfg.tussenMs) return;
    this._autoCount++; this._lastAuto=nu; this._gedaan[sig]=true;
    // Klein moment later starten zodat het event zelf eerst is afgerond.
    setTimeout(()=>{ this.start({sig, titel:'Verificatie '+sig, pids:this._pidsVoor(sig)}); }, 1500);
  },

  // Betrokken PIDs afleiden uit de signatuur; RPM gaat altijd mee als referentie.
  _pidsVoor(sig){
    const m=sig.match(/:(01[0-9A-Fa-f]{2})$/);
    if (m) return [m[1], '010C'];
    if (/^TRIM/.test(sig))        return ['0106','0107','0105','010C'];
    if (/^ECT_HOOG|^THERMOSTAAT/.test(sig)) return ['0105','010C'];
    if (/laadspanning/i.test(sig)) return ['0142','010C'];
    return ['010C','010D'];
  },

  // ── publieke ingang, overal aanroepbaar ──
  // opts: { titel, pids:['010B',...], sig? }  →  Promise<resultaat|null>
  async start(opts){
    opts=opts||{};
    if (this._bezig) { this._log('Verificatie al bezig — overgeslagen','info'); return null; }
    if (!(typeof connected!=='undefined'&&connected) || (typeof demoMode!=='undefined'&&demoMode)) return null;
    const pids=[...new Set((opts.pids&&opts.pids.length?opts.pids:this._pidsVoor(opts.sig||'')))].slice(0,6);
    if (!pids.length) return null;

    this._bezig=true;
    this._log(`🔍 Verificatie gestart: ${opts.titel||opts.sig||pids.join(',')} — focus op ${pids.join(', ')}`,'warn');
    const t0=Date.now(), data={};
    pids.forEach(p=>data[p]={ pogingen:0, ok:0, waarden:[], tijden:[] });

    let _busTok=0;
    try{
      // ── Focus-bemonstering: alleen deze PIDs, rond-om-rond ──
      // Per ronde claimen en weer vrijgeven: tijdens de sampleGap krijgt de
      // poll-loop een beurt, zodat de live view blijft lopen. Één claim over
      // de hele lus zou de tegels seconden bevriezen.
      while (Date.now()-t0 < this.cfg.duurMs){
        if (!(typeof connected!=='undefined'&&connected)) break;
        _busTok=await PLBus.wait('verificatie',2000);
        try{
          for (const pid of pids){
            const d=data[pid]; d.pogingen++;
            try{
              const r=await sendCmd('01'+pid.slice(2)+'1', 1500);
              const v=this._decode(pid, r);
              if (v!==null){ d.ok++; d.waarden.push(v); d.tijden.push(Date.now()); }
            }catch(e){}
          }
        } finally {
          if(_busTok){ PLBus.release(_busTok); _busTok=0; }   // alleen ONS slot teruggeven
        }
        await new Promise(res=>setTimeout(res, this.cfg.sampleGapMs));
      }
    } finally {
      if(_busTok){ PLBus.release(_busTok); _busTok=0; }
    }

    // ── Stap 1: datagezondheid per PID ──
    const duurS=(Date.now()-t0)/1000;
    const gezond={};
    for (const pid of pids){
      const d=data[pid];
      const rate=d.ok/Math.max(1,duurS);
      const okPct=d.pogingen? d.ok/d.pogingen : 0;
      const vast=d.waarden.length>=6 && d.waarden.every(v=>v===d.waarden[0]);
      let buiten=false;
      try{
        const lim=(typeof PID_HARD_LIMITS!=='undefined')?PID_HARD_LIMITS[pid]:null;
        if (lim && d.waarden.length) buiten=d.waarden.some(v=>v<lim.min||v>lim.max);
      }catch(e){}
      gezond[pid]={ rate:+rate.toFixed(1), okPct:+(okPct*100).toFixed(0), vast, buiten,
                    min:d.waarden.length?Math.min(...d.waarden):null,
                    max:d.waarden.length?Math.max(...d.waarden):null, n:d.waarden.length };
    }
    const doelPid=pids[0];
    const g=gezond[doelPid];
    // Bij een UITVAL-melding is "doel zwijgt" juist de bevinding, geen dataprobleem;
    // dan bepaalt de REFERENTIE-PID (RPM) of de bus zelf gezond is.
    const refG=gezond['010C']||null;
    const busOk=refG? refG.okPct>=60 : true;
    const isUitval=/^UITVAL:/.test(opts.sig||'');
    const dataZiek = isUitval ? !busOk : (g.okPct<60 || g.buiten);

    // ── Stap 2: hertest van de oorspronkelijke waarschuwing ──
    let status, tekst;
    const sig=opts.sig||'';
    if (dataZiek){
      status='meetprobleem';
      tekst = isUitval
        ? `ook de referentie-PID (toerental) hapert onder focus (${refG?refG.okPct:'?'}% respons) — verdenk adapter/OBD-aansluiting/bus, niet het onderdeel`
        : `focusdata van ${doelPid} is onbetrouwbaar (${g.okPct}% respons${g.buiten?', waarden buiten fysieke grens':''}) — verdenk adapter/bedrading/aansluiting vóór het onderdeel zelf`;
    } else {
      const her=this._hertest(sig, pids, data, gezond);
      status=her.status; tekst=her.tekst;
    }

    const res={ sig, pids, status, tekst, gezond, duurS:+duurS.toFixed(1) };
    this._publiceer(opts, res);
    this._bezig=false;
    return res;
  },

  // Signatuur-specifieke herbeoordeling op de schone focusdata.
  _hertest(sig, pids, data, gezond){
    const doel=pids[0], d=data[doel], g=gezond[doel];
    const rpmG=gezond['010C'];

    if (/^UITVAL:/.test(sig)){
      if (g.okPct>=90) return {status:'niet gereproduceerd', tekst:`${doel} antwoordt nu vlot (${g.okPct}%, ${g.n} samples) — uitval was tijdelijk; blijf alert op intermitterend gedrag (bedrading/connector bij trilling)`};
      return {status:'bevestigd', tekst:`${doel} mist ook onder focus ${100-g.okPct}% van de responsen — structureel probleem`};
    }
    if (/^BEVROREN:/.test(sig)){
      const rpmBeweegt=rpmG && rpmG.n>=4 && (rpmG.max-rpmG.min)>=40;
      if (g.vast && rpmBeweegt) return {status:'bevestigd', tekst:`${doel} blijft vastzitten op ${d.waarden[0]} terwijl toerental ${Math.round(rpmG.min)}–${Math.round(rpmG.max)} rpm beweegt`};
      if (!g.vast) return {status:'niet gereproduceerd', tekst:`${doel} varieert nu weer (${g.min}–${g.max})`};
      return {status:'niet gereproduceerd', tekst:`geen oordeel: toerental bewoog niet genoeg tijdens de focus voor een eerlijke hertest`};
    }
    if (/^PIEK:/.test(sig)){
      let maxSprong=0;
      for (let i=1;i<d.waarden.length;i++){
        const dt=(d.tijden[i]-d.tijden[i-1])/1000;
        if (dt>0) maxSprong=Math.max(maxSprong, Math.abs(d.waarden[i]-d.waarden[i-1])/dt);
      }
      if (maxSprong>4) return {status:'bevestigd', tekst:`${doel} maakt ook onder focus sprongen tot ${maxSprong.toFixed(1)}/s — sensor of bedrading defect`};
      return {status:'niet gereproduceerd', tekst:`${doel} verloopt nu vloeiend (max ${maxSprong.toFixed(1)}/s over ${g.n} samples) — eenmalige uitschieter of contactstoring`};
    }
    if (/^TRIM/.test(sig)){
      const st=data['0106'], lt=data['0107'];
      if (st&&lt&&st.waarden.length&&lt.waarden.length){
        const som=st.waarden[st.waarden.length-1]+lt.waarden[lt.waarden.length-1];
        if (Math.abs(som)>20) return {status:'bevestigd', tekst:`trim-som is onder focus nog steeds ${som.toFixed(1)}% — structurele mengselafwijking`};
        return {status:'niet gereproduceerd', tekst:`trim-som nu ${som.toFixed(1)}% (binnen norm) — was mogelijk bedrijfspunt-afhankelijk`};
      }
      return {status:'niet gereproduceerd', tekst:'trim-PIDs gaven onvoldoende focusdata voor een oordeel'};
    }
    if (/^ECT_HOOG|^TEST:ECT_HOOG/.test(sig)){
      if (g.max!==null && g.max>108) return {status:'bevestigd', tekst:`koelwater onder focus nog ${g.max}°C — oververhitting reëel, direct aandacht`};
      return {status:'niet gereproduceerd', tekst:`koelwater nu max ${g.max}°C — piek gezakt; hou temperatuur in de gaten`};
    }
    if (/laadspanning/i.test(sig)){
      const gem=d.waarden.length? d.waarden.reduce((a,b)=>a+b,0)/d.waarden.length : null;
      if (gem!==null && gem<13.2) return {status:'bevestigd', tekst:`laadspanning onder focus gemiddeld ${gem.toFixed(1)} V — laadprobleem bevestigd`};
      if (gem!==null && gem>15.2) return {status:'bevestigd', tekst:`laadspanning onder focus gemiddeld ${gem.toFixed(1)} V — regelaar verdacht`};
      return {status:'niet gereproduceerd', tekst:`laadspanning nu ${gem!==null?gem.toFixed(1):'?'} V — binnen norm`};
    }
    // Generiek: nette meetsamenvatting zodat elke bron bruikbaar antwoord krijgt.
    return {status:'niet gereproduceerd',
      tekst:`focusmeting ${doel}: ${g.n} samples, bereik ${g.min}–${g.max}, respons ${g.okPct}% — geen afwijking op de geteste conditie zichtbaar`};
  },

  // Resultaat vasthangen aan het monitor-event + archiveren + loggen.
  _publiceer(opts, res){
    try{
      if (res.sig && window.PLMon && window.PLMon.events[res.sig]){
        window.PLMon.events[res.sig].verif=res;
      }
    }catch(e){}
    const kop = res.status==='bevestigd' ? '❗ Bevestigd'
              : res.status==='meetprobleem' ? '⚠️ Meetprobleem'
              : '✅ Niet gereproduceerd';
    this._log(`Verificatie: ${kop} — ${res.tekst}`, res.status==='bevestigd'?'warn':'ok');
    try{
      registerSessionReport({ type:'verificatie',
        title:`Verificatie ${opts.titel||res.sig||res.pids.join(',')} — ${res.status}`,
        text:[`Focus-hertest (${res.duurS}s, alleen ${res.pids.join(', ')})`,
              `Uitkomst: ${res.status.toUpperCase()} — ${res.tekst}`,
              '',
              'Datagezondheid per PID:',
              ...Object.entries(res.gezond).map(([p,q])=>`  ${p}: ${q.n} samples, ${q.okPct}% respons, ${q.rate}/s, bereik ${q.min}–${q.max}${q.vast?', WAARDE ZIT VAST':''}${q.buiten?', BUITEN FYSIEKE GRENS':''}`)
             ].join('\n') });
    }catch(e){}
  },

  // Minimale decoder voor focus-samples (respons '41 PP ...').
  _decode(pid, r){
    if (!r || /NO DATA|ERROR|UNABLE/i.test(r)) return null;
    const pp=pid.slice(2).toUpperCase();
    const hex=String(r).replace(/[^0-9A-Fa-f]/g,'').toUpperCase();
    const i=hex.indexOf('41'+pp);
    if (i<0 || hex.length<i+6) return null;
    const A=parseInt(hex.slice(i+4,i+6),16);
    const B=hex.length>=i+8 ? parseInt(hex.slice(i+6,i+8),16) : 0;
    if (isNaN(A)) return null;
    switch(pp){
      case '0C': return Math.round((A*256+B)/4);
      case '0D': return A;
      case '05': case '0F': case '46': case '5C': return A-40;
      case '04': case '11': return Math.round(A/2.55);
      case '06': case '07': return Math.round((A-128)*100/128*10)/10;
      case '0B': return A;
      case '10': return Math.round((A*256+B)/100*10)/10;
      case '42': return Math.round((A*256+B)/1000*10)/10;
      case '14': return Math.round(A/200*100)/100;
      default:   return A;
    }
  },

  _log(msg,lvl){ try{ if (typeof log==='function') log(msg,lvl||'info'); }catch(e){} }
};

window.PLVerify = PLVerify;
})();
