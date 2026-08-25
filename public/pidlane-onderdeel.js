/* pidlane-onderdeel.js — "Welk onderdeel is kapot?" (27-07-2026)
   ═══════════════════════════════════════════════════════════════════════
   Eén functie die maar naar twee dingen kijkt: de foutcodes en de live
   meetwaarden. Geen brede analyse, geen rapport over de hele auto — alleen
   de vraag: kan ik hier een ONDERDEEL aanwijzen?

   OPZET — bewijs, geen gok
   Elke kandidaat is een regel met voorwaarden. Een voorwaarde kan:
     bevestigen  (+gewicht)  de meting past bij dit defect
     tegenspreken(−gewicht)  de meting sluit dit defect juist uit
     onbekend    (0)         we hebben de data niet
   De score is de som. Er wordt NIETS getoond zonder de meetwaarde waar het
   op rust — je moet altijd zelf kunnen nazien waarom de app dit zegt.

   WAT DEZE FUNCTIE BEWUST NIET DOET
   Een deel van "ratelen" is via OBD principieel onzichtbaar: motorsteunen,
   hitteschilden, uitlaatbeugels, ophanging, aandrijfassen. Daar is geen
   sensor voor. De app zegt dat dan ook met zoveel woorden in plaats van
   iets aan te wijzen wat toevallig het hoogst scoort. Een onterechte
   verdenking kost meer dan geen verdenking.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function V(pid){ try{ var v=pidVals[pid]; return (typeof v==='number'&&!isNaN(v))?v:null; }catch(e){ return null; } }
function heeftDTC(re){
  try{
    var l=(window._laatsteDTC||window.lastDTCs||[]);
    return l.some(function(d){ return re.test(String(d.code||d).toUpperCase()); });
  }catch(e){ return false; }
}
function dtcLijst(){
  try{ return (window._laatsteDTC||window.lastDTCs||[]).map(function(d){ return String(d.code||d).toUpperCase(); }); }
  catch(e){ return []; }
}

/* ── SENSORUITVAL vs UITLEESFOUT ────────────────────────────────────────
   Een sensor die niets meer levert is een sterke aanwijzing — maar alleen
   als we zeker weten dat het aan de SENSOR ligt en niet aan het uitlezen.
   Drie dingen kunnen namelijk hetzelfde beeld geven:
     1. de auto ondersteunt dat PID helemaal niet   → geen defect
     2. de bus hapert of de adapter mist antwoorden → geen defect
     3. de sensor of zijn bedrading is stuk         → wél een defect
   De scheiding komt uit dezelfde regel als pidlane-watchers.js gebruikt:
   valt er ÉÉN PID stil terwijl de rest gewoon doorloopt, dan zit het in die
   ene tak. Vallen er meerdere tegelijk stil, dan is het de bus.
   Daarnaast telt de bushealth mee: bij verhoogde fout- of onvolledigheids-
   percentages doen we geen enkele uitspraak, want dan is het meetkanaal
   zelf onbetrouwbaar en zou elke conclusie een gok zijn. */
var STIL_MS = 8000;          // zo lang geen verse waarde = stil
function busBetrouwbaar(){
  try{
    var s=PLBus.stats();
    if(s.foutPct>8) return {ok:false, reden:'de bus meldt '+s.foutPct+'% fouten'};
    if((s.onvolPct||0)>8) return {ok:false, reden:(s.onvolPct)+'% van de antwoorden was onvolledig'};
    if((s.totaal||0)<20)  return {ok:false, reden:'nog te weinig gemeten'};
    return {ok:true, reden:''};
  }catch(e){ return {ok:false, reden:'busstatistiek niet beschikbaar'}; }
}
/* Geeft {stil:[pids], levend:[pids]} over alles wat we ACTIEF opvragen en
   waarvan de auto zegt dat hij het ondersteunt. */
function stilteBeeld(){
  var nu=Date.now(), stil=[], levend=[];
  try{
    var actief = (typeof activePIDs!=='undefined' && activePIDs) ? Array.from(activePIDs) : [];
    var scan   = (typeof supportedPIDs!=='undefined' && supportedPIDs && supportedPIDs.size) ? supportedPIDs : null;
    actief.forEach(function(pid){
      if(scan && !scan.has(pid)) return;                 // auto ondersteunt hem niet: geen defect
      var t = (typeof _pidLastUpd!=='undefined' && _pidLastUpd) ? _pidLastUpd[pid] : null;
      if(!t) return;                                     // nooit iets gehad: geen bewijs, geen uitspraak
      if(nu-t > STIL_MS) stil.push(pid); else levend.push(pid);
    });
  }catch(e){ /* stil: activePIDs/supportedPIDs/_pidLastUpd kunnen nog niet bestaan */ }
  return {stil:stil, levend:levend};
}
/* Railwaarden: een sensor kan óók "dood" zijn terwijl hij wél een getal geeft.
   Bij een onderbroken of kortgesloten draad slaat de meting tegen de
   elektrische eindwaarde aan. Die waarden zijn per sensortype bekend. */
var RAIL = {
  '0105':[{v:-40,r:'draadbreuk of losse stekker'},{v:215,r:'kortsluiting naar massa'}],
  '010F':[{v:-40,r:'draadbreuk of losse stekker'},{v:215,r:'kortsluiting naar massa'}],
  '0146':[{v:-40,r:'draadbreuk of losse stekker'},{v:215,r:'kortsluiting naar massa'}],
  '015C':[{v:-40,r:'draadbreuk of losse stekker'},{v:215,r:'kortsluiting naar massa'}],
  '010B':[{v:0,  r:'draadbreuk of geen voeding'},{v:255,r:'kortsluiting'}],
  '0110':[{v:0,  r:'geen signaal — draadbreuk of vervuild element'}],
  '0111':[{v:0,  r:'geen signaal van de gasklepstand'}]
};
function railTreffers(){
  var uit=[];
  Object.keys(RAIL).forEach(function(pid){
    var v=V(pid); if(v===null) return;
    RAIL[pid].forEach(function(r){
      if(Math.abs(v-r.v)<0.6) uit.push({pid:pid, waarde:v, reden:r.r});
    });
  });
  return uit;
}

/* Een voorwaarde: {tekst, w, test}
   test() geeft true (bevestigt), false (spreekt tegen) of null (geen data). */
function C(tekst, w, test, opt){
  var c={tekst:tekst, w:w, test:test};
  if(opt){ c.xor=opt.xor; c.steun=opt.steun; }
  return c;
}

var REGELS = [
  {
    id:'ontsteking', naam:'Ontstekingsspoel of bougie',
    hint:'Meestal één cilinder. Ratelen of schokken dat erger wordt onder belasting.',
    vc:[
      C('Misfire-code aanwezig (P030x)', 4, function(){ return dtcLijst().length? heeftDTC(/^P030[1-9A-C]$/) : null; }),
      C('Algemene misfire-code (P0300)', 2, function(){ return dtcLijst().length? heeftDTC(/^P0300$/) : null; }),
      C('Brandstoftrim niet weggelopen — wijst eerder op ontsteking dan op mengsel', 2, function(){
        var lt=V('0107'); return lt===null?null:(Math.abs(lt)<10);
      }, {steun:true}),
      C('Ontstekingsvervroeging wordt teruggenomen (ECU corrigeert)', 2, function(){
        var a=V('010E'); return a===null?null:(a<6);
      }, {steun:true})
    ]
  },
  {
    id:'injector', naam:'Injector',
    hint:'Misfire op één cilinder, maar mét een mengselafwijking op die bank.',
    vc:[
      C('Misfire-code op één cilinder', 3, function(){ return dtcLijst().length? heeftDTC(/^P030[1-9A-C]$/) : null; }),
      C('Lange brandstoftrim boven +10 % (bank loopt arm)', 3, function(){
        var lt=V('0107'); return lt===null?null:(lt>10);
      }),
      C('Injector-/mengselcode aanwezig (P020x, P017x)', 3, function(){
        return dtcLijst().length? heeftDTC(/^P02(0|6)\d|^P017[1-4]$/) : null;
      })
    ]
  },
  {
    id:'vacuumlek', naam:'Vacuümlek (slang, inlaatpakking, PCV)',
    hint:'Onrustig stationair, dat juist beter wordt zodra je gas geeft.',
    vc:[
      C('Lange trim ver positief — de ECU compenseert valse lucht', 4, function(){
        var lt=V('0107'); return lt===null?null:(lt>12);
      }),
      C('Inlaatdruk stationair te hoog (te weinig vacuüm)', 3, function(){
        var map=V('010B'), rpm=V('010C');
        if(map===null||rpm===null) return null;
        if(rpm>1200) return null;              // alleen stationair zinvol
        return map>46;
      }),
      C('Arm-mengselcode aanwezig (P0171 / P0174)', 3, function(){
        return dtcLijst().length? heeftDTC(/^P017[14]$/) : null;
      })
    ]
  },
  {
    id:'maf', naam:'Luchtmassameter (MAF) vervuild of defect',
    hint:'Slecht optrekken, vermogensverlies, trim die alle kanten op loopt.',
    vc:[
      C('MAF-code aanwezig (P010x)', 4, function(){ return dtcLijst().length? heeftDTC(/^P010[0-4]$/) : null; }),
      C('Luchtmassa past niet bij het toerental', 3, function(){
        var maf=V('0110'), rpm=V('010C');
        if(maf===null||rpm===null||rpm<600) return null;
        var verwacht = rpm/1000*3.5;           // ruwe vuistregel voor een viercilinder
        return (maf < verwacht*0.45) || (maf > verwacht*2.4);
      }),
      C('Trim ver negatief — de ECU haalt brandstof weg', 2, function(){
        var lt=V('0107'); return lt===null?null:(lt<-12);
      }, {steun:true})
    ]
  },
  {
    id:'lambdavoor', naam:'Voorste lambdasonde',
    hint:'De regeling zelf loopt niet meer — trim loopt weg zonder dat er lucht bij komt.',
    vc:[
      C('Lambdacode aanwezig (P013x / P014x / P2A00)', 4, function(){
        return dtcLijst().length? heeftDTC(/^P01[34]\d$|^P2A00$/) : null;
      }),
      C('Breedbandlambda staat ver van 1,00 terwijl de motor warm draait', 3, function(){
        var l=V('0134')||V('0124'), ect=V('0105');
        if(l===null||ect===null||ect<70) return null;
        return (l<0.93||l>1.07);
      }),
      C('Beide trims lopen dezelfde kant op en ver door', 2, function(){
        var st=V('0106'), lt=V('0107');
        if(st===null||lt===null) return null;
        return Math.abs(st+lt)>25;
      })
    ]
  },
  {
    id:'kat', naam:'Katalysator',
    hint:'Vermogensverlies, rammelend geluid van onderen, of code P0420.',
    vc:[
      C('Katalysatorcode aanwezig (P0420 / P0430)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P04[23]0$/) : null;
      }),
      C('Achterste sensor schommelt net zo hard als de voorste — geen zuurstofbuffer meer', 4, function(){
        var achter=V('0115'); if(achter===null) return null;
        return (achter<0.45||achter>0.85);
      }),
      C('Inlaatdruk hoog bij gas geven — mogelijke verstopping', 2, function(){
        var map=V('010B'), rpm=V('010C');
        if(map===null||rpm===null||rpm<2000) return null;
        return map>85;
      })
    ]
  },
  {
    id:'egr', naam:'EGR-klep',
    hint:'Onrustig stationair, roet, of slecht optrekken bij lage toeren.',
    vc:[
      C('EGR-code aanwezig (P040x)', 5, function(){ return dtcLijst().length? heeftDTC(/^P040[0-9A-F]$/) : null; }),
      C('Inlaatdruk stationair verhoogd', 2, function(){
        var map=V('010B'), rpm=V('010C');
        if(map===null||rpm===null||rpm>1200) return null;
        return map>48;
      })
    ]
  },
  {
    id:'thermostaat', naam:'Thermostaat of koelsysteem',
    hint:'Motor komt niet op temperatuur, of juist te warm.',
    vc:[
      C('Thermostaatcode aanwezig (P0128 / P0125)', 5, function(){ return dtcLijst().length? heeftDTC(/^P012[58]$/) : null; }),
      C('Koelwater blijft onder 75 °C terwijl de motor al draait', 4, function(){
        var e=V('0105'); return e===null?null:(e<75);
      }),
      C('Koelwater boven 105 °C', 4, function(){ var e=V('0105'); return e===null?null:(e>105); })
    ]
  },
  {
    id:'dynamo', naam:'Dynamo of spanningsregelaar',
    hint:'Dimmende verlichting, waarschuwingslampjes, of een accu die steeds leeg is.',
    vc:[
      C('Laadspanning te laag met draaiende motor', 5, function(){
        var v=V('0142'), rpm=V('010C');
        if(v===null||rpm===null||rpm<800) return null;
        return v<13.2;
      }, {xor:'laad'}),
      C('Laadspanning te hoog — regelaar regelt niet af', 5, function(){
        var v=V('0142'), rpm=V('010C');
        if(v===null||rpm===null||rpm<800) return null;
        return v>15.2;
      }, {xor:'laad'})
    ]
  },
  {
    id:'accu', naam:'Accu',
    hint:'Moeizaam starten, vooral als hij een nacht heeft gestaan.',
    vc:[
      C('Rustspanning onder 12,2 V met de motor uit', 5, function(){
        var v=V('0142'), rpm=V('010C');
        if(v===null||rpm===null||rpm>200) return null;
        return v<12.2;
      })
    ]
  },
  {
    id:'krukas_nok', naam:'Krukas- of nokkenaspositiesensor',
    hint:'Slaat af, start soms niet, of valt willekeurig stil.',
    vc:[
      C('Positiesensorcode aanwezig (P0335-P0344)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P03(3[5-9]|4[0-4])$/) : null; })
    ]
  },
  {
    id:'klopsensor', naam:'Klopsensor',
    hint:'Vermogensverlies zonder duidelijke oorzaak; de ECU haalt vervroeging weg.',
    vc:[
      C('Klopsensorcode aanwezig (P0325-P0332)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P03(2[5-9]|3[0-2])$/) : null; }),
      C('Ontsteking staat ver terug terwijl de motor warm is', 2, function(){
        var a=V('010E'), e=V('0105');
        if(a===null||e===null||e<70) return null;
        return a<2; }, {steun:true})
    ]
  },
  {
    id:'brandstofdruk', naam:'Brandstofpomp, filter of drukregelaar',
    hint:'Slecht optrekken onder belasting, terugvallen bij hoge snelheid.',
    vc:[
      C('Brandstofdrukcode aanwezig (P0087 / P0088 / P018x)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P008[7-9]$|^P018[0-9]$/) : null; }),
      C('Raildruk blijft ver onder wat bij deze belasting hoort', 4, function(){
        var d=V('0123')||V('016D'), load=V('0104');
        if(d===null||load===null) return null;
        var mpa = d>1000 ? d/1000 : d;          // kPa of MPa binnengekomen
        return (load>60 && mpa<3); }),
      C('Trim loopt positief weg onder belasting', 2, function(){
        var lt=V('0107'), load=V('0104');
        if(lt===null||load===null||load<50) return null;
        return lt>12; }, {steun:true})
    ]
  },
  {
    id:'turbo', naam:'Turbo, laaddruksysteem of intercoolerslang',
    hint:'Vermogensverlies onder belasting, soms fluiten of noodloop.',
    vc:[
      C('Laaddrukcode aanwezig (P0234 / P0299 / P00Ax)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P02(34|99)$|^P00A[0-9]$/) : null; }),
      C('Inlaatdruk blijft rond omgevingsdruk terwijl de belasting hoog is', 4, function(){
        var map=V('010B'), load=V('0104'), rpm=V('010C');
        if(map===null||load===null||rpm===null) return null;
        if(load<70||rpm<2000) return null;
        return map<110; })
    ]
  },
  {
    id:'roetfilter', naam:'Roetfilter (DPF)',
    hint:'Vermogensverlies, veel regeneraties, of de motor gaat in noodloop.',
    vc:[
      C('Roetfiltercode aanwezig (P24xx / P042x)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P24[0-9A-F]{2}$|^P04(2[1-9A-F])$/) : null; }),
      C('Uitlaattegendruk hoog', 3, function(){
        var d=V('0187'); return d===null?null:(d>120); })
    ]
  },
  {
    id:'adblue', naam:'AdBlue-systeem (SCR)',
    hint:'Waarschuwing over startblokkering, of een NOx-code.',
    vc:[
      C('SCR-/NOx-code aanwezig (P20xx / P2BAx)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P20[0-9A-F]{2}$|^P2BA[0-9]$/) : null; })
    ]
  },
  {
    id:'gasklep', naam:'Gasklephuis of gaspedaalsensor',
    hint:'Onregelmatig stationair, gas dat niet reageert, of noodloop.',
    vc:[
      C('Gasklep-/pedaalcode aanwezig (P012x / P022x / P2135)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P012[0-9A-F]$|^P022[0-9A-F]$|^P213[0-9]$/) : null; }),
      C('Gasklepstand blijft hangen terwijl het toerental wel verandert', 3, function(){
        var t=V('0111'), rpm=V('010C');
        if(t===null||rpm===null) return null;
        return (rpm>1800 && t<3); })
    ]
  },
  {
    id:'distributie', naam:'Distributieketting of -spanner',
    hint:'Ratelen bij koude start dat na een paar seconden minder wordt — juist waar jij naar vraagt.',
    vc:[
      C('Nokkenas-/krukaspositiecode aanwezig (P0011-P0019, P034x)', 5, function(){
        return dtcLijst().length? heeftDTC(/^P001[1-9]$|^P034[0-9]$/) : null;
      }),
      C('Ontstekingsvervroeging springt heen en weer', 3, function(){
        var a=V('010E'); return a===null?null:(a<-5||a>45);
      }, {steun:true})
    ]
  }
];

/* ── Beoordelen ────────────────────────────────────────────────────────── */
function beoordeel(){
  var uit=[];
  REGELS.forEach(function(r){
    var score=0, voor=[], tegen=[], onbekend=0, maxScore=0;
    var xorGeraakt={};
    // Eerst de dragende voorwaarden, daarna pas het steunbewijs — steun telt
    // alleen mee als er al iets zelfstandigs naar dit onderdeel wees. Anders
    // wijst "trim is normaal" op een kerngezonde auto ineens naar een defecte
    // bougie, en dat is precies het soort valse verdenking dat je niet wilt.
    var dragend=r.vc.filter(function(c){ return !c.steun; });
    var steun  =r.vc.filter(function(c){ return  c.steun; });

    dragend.forEach(function(c){
      var t=c.test();
      // Elkaar uitsluitende voorwaarden (te laag / te hoog) tellen samen voor
      // één keer mee in het maximum, en straffen elkaar niet af.
      if(c.xor){
        if(!xorGeraakt[c.xor]){ maxScore+=c.w; xorGeraakt[c.xor]=true; }
        if(t===null){ onbekend++; return; }
        if(t){ score+=c.w; voor.push(c.tekst); }
        return;                                  // geen aftrek bij de tegenhanger
      }
      maxScore+=c.w;
      if(t===null){ onbekend++; return; }
      if(t){ score+=c.w; voor.push(c.tekst); }
      else { score-=Math.round(c.w/2); tegen.push(c.tekst); }
    });

    if(voor.length){
      steun.forEach(function(c){
        maxScore+=c.w;
        var t=c.test();
        if(t===null){ onbekend++; return; }
        if(t){ score+=c.w; voor.push(c.tekst); }
        else { score-=Math.round(c.w/2); tegen.push(c.tekst); }
      });
    }
    // Ondergrens: minder dan een kwart van het haalbare is geen aanwijzing
    // maar ruis, en die hoort niet als verdachte op het scherm.
    if(voor.length && score>0 && (score/Math.max(1,maxScore))>=0.25) uit.push({
      id:r.id, naam:r.naam, hint:r.hint,
      score:score, max:maxScore, voor:voor, tegen:tegen, onbekend:onbekend
    });
  });
  uit.sort(function(a,b){ return b.score-a.score; });
  return uit;
}

/* ── Weergave ──────────────────────────────────────────────────────────── */
function zekerheid(r){
  var p = r.max? Math.max(0, Math.round(r.score/r.max*100)) : 0;
  if(p>=65) return {t:'sterke aanwijzing', k:'#ef4444'};
  if(p>=35) return {t:'aanwijzing',        k:'#f59e0b'};
  return          {t:'zwakke aanwijzing',  k:'#94a3b8'};
}

function render(){
  var host=document.getElementById('odBody'); if(!host) return;
  var dtc=dtcLijst();
  var R=beoordeel();
  var h='';

  h+='<div class="od-bron">Gekeken naar <b>'+(dtc.length?dtc.length+' foutcode'+(dtc.length===1?'':'s'):'geen foutcodes')+
     '</b> en de live meetwaarden van dit moment.</div>';

  if(!R.length){
    h+='<div class="od-leeg"><b>Geen enkel onderdeel aan te wijzen.</b><br>'+
       'Er is niets in de foutcodes of de meetwaarden dat naar een specifiek onderdeel wijst. '+
       'Dat is op zich goed nieuws voor de elektronica, maar het betekent ook dat een geluid of trilling '+
       'waarschijnlijk mechanisch is.</div>';
  } else {
    R.forEach(function(r){
      var z=zekerheid(r);
      h+='<div class="od-kaart" style="border-left-color:'+z.k+'">'+
           '<div class="od-kop"><b>'+r.naam+'</b><span style="color:'+z.k+'">'+z.t+'</span></div>'+
           '<div class="od-hint">'+r.hint+'</div>'+
           '<div class="od-bew">Waarop dit rust:</div><ul class="od-lijst">';
      r.voor.forEach(function(t){ h+='<li class="ja">'+t+'</li>'; });
      r.tegen.forEach(function(t){ h+='<li class="nee">'+t+' — dit spreekt het juist tegen</li>'; });
      h+='</ul>';
      if(r.onbekend) h+='<div class="od-mis">'+r.onbekend+' controle'+(r.onbekend===1?'':'s')+' kon ik niet doen: die sensor levert nu geen data.</div>';
      h+='</div>';
    });
  }

  // ── Sensoruitval, mét de uitleesfout-poort ervoor ──
  var bus=busBetrouwbaar(), beeld=stilteBeeld(), rails=railTreffers();
  if(rails.length){
    h+='<div class="od-kaart" style="border-left-color:#ef4444">'+
       '<div class="od-kop"><b>Sensor leest een onmogelijke waarde</b><span style="color:#ef4444">sterke aanwijzing</span></div>'+
       '<div class="od-hint">De meting staat exact tegen de elektrische eindwaarde aan. Dat is geen temperatuur of druk meer, dat is de bedrading.</div>'+
       '<ul class="od-lijst">';
    rails.forEach(function(r){
      var d=(typeof getPidDef==='function')?getPidDef(r.pid):null;
      h+='<li class="ja">'+((d&&d.name)||r.pid)+' staat op '+r.waarde+((d&&d.unit)||'')+' — '+r.reden+'</li>';
    });
    h+='</ul></div>';
  }
  if(!bus.ok){
    h+='<div class="od-grens" style="border-left-color:#94a3b8;background:rgba(148,163,184,.07)">'+
       '<b>Over ontbrekende sensoren zeg ik nu niets</b><br>'+
       'Het meetkanaal zelf is op dit moment niet betrouwbaar genoeg ('+bus.reden+'). '+
       'Een sensor die stil lijkt te vallen kan dan net zo goed een gemist antwoord zijn. '+
       'Rijd even door of verbind opnieuw, dan kijk ik er wél naar.</div>';
  } else if(beeld.stil.length){
    var totaal=beeld.stil.length+beeld.levend.length;
    var deelStil=beeld.stil.length/Math.max(1,totaal);
    if(deelStil>0.30){
      h+='<div class="od-grens" style="border-left-color:#94a3b8;background:rgba(148,163,184,.07)">'+
         '<b>Meerdere sensoren tegelijk stil — dit is geen defect</b><br>'+
         beeld.stil.length+' van de '+totaal+' opgevraagde sensoren zwijgt tegelijk. '+
         'Eén kapotte sensor doet dat niet; dit wijst op de verbinding, de adapter of een overbelaste bus.</div>';
    } else {
      h+='<div class="od-kaart" style="border-left-color:#ef4444">'+
         '<div class="od-kop"><b>Sensor levert niets meer</b><span style="color:#ef4444">sterke aanwijzing</span></div>'+
         '<div class="od-hint">Deze sensoren gaven eerder in deze sessie wél data en zijn nu al meer dan '+
         Math.round(STIL_MS/1000)+' seconden stil, terwijl '+beeld.levend.length+' andere sensoren gewoon doorlopen. '+
         'Dat sluit een uitleesfout uit: bij een busprobleem valt alles tegelijk weg.</div>'+
         '<ul class="od-lijst">';
      beeld.stil.forEach(function(pid){
        var d=(typeof getPidDef==='function')?getPidDef(pid):null;
        h+='<li class="ja">'+((d&&d.name)||pid)+' <span style="opacity:.6">('+pid+')</span> — draadbreuk, stekker of sensor</li>';
      });
      h+='</ul></div>';
    }
  }

  // Wat OBD principieel niet kan zien — altijd tonen, juist bij ratelen.
  h+='<div class="od-grens"><b>Wat ik hiermee niet kan zien</b><br>'+
     'Motorsteunen, hitteschilden, uitlaatbeugels, ophanging, aandrijfassen, remmen en '+
     'wielophanging hebben geen sensor. Ratelt het daar, dan komt er via de OBD-poort '+
     'niets binnen — hoe lang je ook meet. Blijft deze lijst leeg terwijl je duidelijk iets hoort, '+
     'dan is dat zelf een uitkomst: zoek het mechanisch.</div>';

  host.innerHTML=h;
}

/* ── Publiek ───────────────────────────────────────────────────────────── */
window.openOnderdeelCheck = function(){
  var ov=document.getElementById('onderdeelOv');
  if(!ov){
    ov=document.createElement('div');
    ov.id='onderdeelOv'; ov.className='od-ov';
    ov.innerHTML=
      '<div class="od-top">'+
        '<div class="od-titel">🔩 Welk onderdeel?</div>'+
        '<button class="od-x" onclick="document.getElementById(\'onderdeelOv\').style.display=\'none\'">✕</button>'+
      '</div>'+
      '<div class="od-body" id="odBody"></div>'+
      '<div class="od-foot">'+
        '<button class="od-btn" onclick="openOnderdeelCheck()">🔄 Opnieuw kijken</button>'+
      '</div>';
    document.body.appendChild(ov);
  }
  ov.style.display='flex';
  render();
};
// Ook los aanroepbaar: handig voor de diagnosebundel en om de
// uitleesfout-poort te kunnen natoetsen zonder de UI te openen.
window.PLOnderdeel = { beoordeel:beoordeel, _regels:REGELS,
  busBetrouwbaar:busBetrouwbaar, stilteBeeld:stilteBeeld, railTreffers:railTreffers };

})();
