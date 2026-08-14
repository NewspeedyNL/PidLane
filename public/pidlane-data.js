/* ════════════════════════════════════════════════════════════════════
   PIDLANE-DATA.JS — statische referentiedata, uitgelicht uit index.html
   (build 2026-07-19) om het hoofdbestand te verkleinen.

   LAADVOLGORDE: dit bestand MOET vóór de scripts van index.html laden
   (staat als <script src="pidlane-data.js"> direct na config.js).
   Alles hangt aan window.* zodat bestaande verwijzingen — bare refs én
   typeof-guards — ongewijzigd blijven werken. Volgorde van de blokken is
   de originele volgorde uit index.html (onderlinge verwijzingen intact).

   INHOUD: PIDS · PID_HARD_LIMITS · MODELS/MOTORS · DTCDB · PIDS_EXTRA ·
   analyse-/checklijsten · BSC_TESTS · scenario-presets · ALL_PID_DEFS
   (+ uitgebreide set via Object.assign) · SAE_PID_NAMES · PROTOCOLS ·
   poll-classificatie · demo-voertuigen · AUTO_KENNIS (merk-kennisbank) ·
   HUD_LABEL_DICT. Gedrag: identiek aan vóór de split.
   ════════════════════════════════════════════════════════════════════ */


// ── PIDS (was index.html regel 2720) ──
window.PIDS = [
  {cat:'Motor',     pid:'010C',name:'Motortoerental',        unit:'RPM', min:0,   max:8000, wH:6000},
  {cat:'Motor',     pid:'0104',name:'Motorbelasting',        unit:'%',   min:0,   max:100,  wH:90},
  {cat:'Motor',     pid:'0111',name:'Gasklep positie',       unit:'%',   min:0,   max:100},
  {cat:'Motor',     pid:'010B',name:'Inlaatdruk',            unit:'kPa', min:0,   max:255},
  {cat:'Motor',     pid:'010F',name:'Inlaatlucht temp',      unit:'°C',  min:-40, max:150,  wH:55},
  {cat:'Motor',     pid:'010E',name:'Ontstekingstiming',     unit:'°',   min:-64, max:64},
  {cat:'Motor',     pid:'010A',name:'Brandstofdruk',         unit:'kPa', min:0,   max:765,  wL:200},
  {cat:'Temp',      pid:'0105',name:'Koelwater temp',        unit:'°C',  min:-40, max:215,  wH:100, dH:110},
  {cat:'Temp',      pid:'015C',name:'Motorolie temp',        unit:'°C',  min:-40, max:215,  wH:130, dH:150},
  {cat:'Temp',      pid:'0146',name:'Omgevingstemperatuur',  unit:'°C',  min:-40, max:85},
  {cat:'Brandstof', pid:'012F',name:'Brandstofpeil',         unit:'%',   min:0,   max:100,  wL:10},
  {cat:'Brandstof', pid:'015E',name:'Brandstofverbruik',     unit:'L/h', min:0,   max:50},
  {cat:'Brandstof', pid:'0110',name:'Luchtmassameter (MAF)', unit:'g/s', min:0,   max:500},
  {cat:'Brandstof', pid:'0106',name:'Brandstoftrim kort B1', unit:'%',   min:-30, max:30,   wH:10, wL:-10},
  {cat:'Brandstof', pid:'0107',name:'Brandstoftrim lang B1', unit:'%',   min:-30, max:30,   wH:10, wL:-10},
  {cat:'Rijden',    pid:'010D',name:'Voertuigsnelheid',      unit:'km/h',min:0,   max:280},
  {cat:'Rijden',    pid:'0149',name:'Gaspedaal positie',     unit:'%',   min:0,   max:100},
  {cat:'Electrisch',pid:'0142',name:'Accuspanning',          unit:'V',   min:8,   max:16,   wL:11.5, dL:10.5},
  {cat:'Emissie',   pid:'0114',name:'O2 sensor B1S1',      unit:'V',   min:0,   max:1.3},
  {cat:'Emissie',   pid:'0115',name:'Lambda sensor B1S2',    unit:'V',   min:0,   max:1.3},
  {cat:'Emissie',   pid:'012C',name:'EGR klep positie',      unit:'%',   min:0,   max:100},
];

// ── _B1B2_PAIR (was index.html regel 2786) ──
// 2026-07-26: 0167/0168 en 017A/017B eruit. Die koppelingen gingen ervan uit
// dat 0165-0168 bank1/bank2-uitlaattemperaturen waren; dat bleek onjuist (het
// zijn aux-I/O, MAF, koelvloeistof en inlaatlucht). De katalysatorparen
// 013C-013F kloppen wél en blijven staan.
window._B1B2_PAIR ={'013D':'013C','013F':'013E'};

// ── PID_HARD_LIMITS (was index.html regel 2888) ──
//
// WAT HIER HOORT, EN WAT NIET
//
// Laag 1 in validateAndSmooth() GOOIT WEG wat hier buiten valt: de waarde
// wordt null, verdwijnt uit de meter, uit de historie en uit de AI-analyse.
// Dat is een zwaar middel en het hoort dus maar één ding te betekenen: dit
// getal kan de motor niet geproduceerd hebben, dus is er iets misgegaan bij
// het lezen of parsen.
//
// Wat het NIET mag betekenen is "dit is ongebruikelijk". Een koelwater van
// 135 °C is niet onmogelijk, het is een kokende motor — precies de meting
// waarvoor je het apparaat aansluit. Die weggooien maakt het scherm leeg op
// het moment dat het iets moet laten zien. Ongebruikelijk-maar-echt gaat naar
// PID_LET_OP hieronder: gemeld, onthouden, doorgelaten.
//
// Aanleiding voor de herziening (rit 4-8, Mazda CX-5): "Ontstekingstiming
// -17.5° buiten fysiek bereik (-15–60)". De definitie van 010E zegt -64…64
// (J1979: A/2-64), de harde limiet zei -15. Sterke terugregeling bij
// katalysator-opwarming is normaal gedrag en werd als storing gemeld. De
// grenzen hieronder volgen nu de standaard, niet het gebruikelijke gedrag.
window.PID_HARD_LIMITS = {
  '010C':{min:0,max:10000},  // toerental — spec tot 16383,75; ruimte voor hoogtoerige motoren
  '010D':{min:0,max:255},    // snelheid — één byte, 255 km/h ÍS het maximum
  '0105':{min:-40,max:215},  // koelwater — spec; een oververhitte motor moet leesbaar blijven
  '015C':{min:-40,max:215},  // olietemperatuur — idem
  '0104':{min:0,max:100},'0111':{min:0,max:100},
  '010B':{min:2,max:255},    // MAP — diep vacuüm bij gas loslaten komt onder de 10 kPa
  '010F':{min:-40,max:215},  // inlaatlucht — heat-soak onder de kap gaat ruim over 80 °C
  '012F':{min:0,max:100},
  '0110':{min:0,max:655},    // MAF — spec 655,35 g/s
  '0142':{min:4,max:32},     // boordspanning — startmotordip omlaag, 24V-systemen omhoog
  '0106':{min:-100,max:100}, // korte-termijn trim — spec -100…99,2; de diagnose doet PLWatch
  '0107':{min:-100,max:100}, // lange-termijn trim — idem
  '015E':{min:0,max:200},    // brandstofdebiet — grote motor bij vollast haalt de 40 L/h ruim
  '010E':{min:-40,max:60},   // ontstekingstiming — was -15; koude-startretard valt daaronder
  '0114':{min:0,max:1.3},'0115':{min:0,max:1.3},'012C':{min:0,max:100},
  '0149':{min:0,max:100},'010A':{min:0,max:765},  // brandstofdruk — spec 765 kPa
  '0146':{min:-40,max:80},   // omgevingstemperatuur — sensor in de volle zon
};

// ── PID_LET_OP — laag 1b: opvallend maar echt ──
//
// Deze tabel werd in pidlane-datalog.js regel 47 al uitgelezen maar bestond
// nergens. `typeof PID_LET_OP !== 'undefined'` was dus altijd onwaar en de
// hele laag stond uit — inclusief het voorbeeld dat er in het commentaar bij
// staat ("sterke terugregeling van de ontsteking"). Nu wél gevuld.
//
// min/max beschrijven hier het GEBRUIKELIJKE bereik. Valt een meting daar
// buiten, dan wordt hij gemeld (hooguit één regel per PID per 30 s) en gaat
// hij gewoon door naar de meter en de historie. Geen markOutlier, geen null.
// Zo blijft het onderscheid intact: laag 1 = meetfout, laag 1b = bijzonderheid.
window.PID_LET_OP = {
  '010E':{min:-10, max:55,  waarom:'sterke terugregeling van de ontsteking — katalysator-opwarming of klopregeling'},
  '0105':{min:-15, max:110, waarom:'koelwater boven bedrijfstemperatuur'},
  '015C':{min:-15, max:140, waarom:'olietemperatuur boven normaal'},
  '010F':{min:-25, max:70,  waarom:'inlaatlucht warm — heat-soak of hoge buitentemperatuur'},
  '0142':{min:11.5,max:15.2,waarom:'boordspanning buiten het normale laadbereik'},
  '0106':{min:-25, max:25,  waarom:'korte-termijn brandstoftrim ver buiten neutraal'},
  '0107':{min:-25, max:25,  waarom:'lange-termijn brandstoftrim ver buiten neutraal'},
  '010B':{min:15,  max:110, waarom:'inlaatspruitstukdruk buiten het gebruikelijke bereik'},
  '010C':{min:0,   max:7000,waarom:'toerental boven het gebruikelijke maximum'},
  '015E':{min:0,   max:60,  waarom:'hoog brandstofdebiet'},
  '0146':{min:-25, max:45,  waarom:'omgevingstemperatuur buiten het gebruikelijke bereik'},
};

// ── MODELS (was index.html regel 3029) ──
window.MODELS ={Ford:['Focus','Fiesta','Mondeo','Kuga','Puma','Transit','Ranger'],Volkswagen:['Golf','Polo','Passat','Tiguan','T-Roc','ID.3','ID.4'],BMW:['1 Serie','3 Serie','5 Serie','X1','X3','X5','M3'],Mercedes:['A-Klasse','C-Klasse','E-Klasse','GLA','GLC','GLE'],Audi:['A3','A4','A6','Q3','Q5','Q7'],Opel:['Astra','Corsa','Insignia','Mokka'],Peugeot:['208','308','2008','3008'],Renault:['Clio','Megane','Captur','Zoe'],Toyota:['Yaris','Corolla','RAV4','Prius'],Skoda:['Fabia','Octavia','Superb','Karoq'],Seat:['Ibiza','Leon','Ateca'],Hyundai:['i20','i30','Tucson','Kona'],Kia:['Picanto','Ceed','Sportage','EV6'],Volvo:['V60','XC40','XC60','XC90'],Nissan:['Juke','Qashqai','X-Trail','Leaf'],Citroën:['C3','C4','Berlingo'],Fiat:['500','Panda','Tipo'],Honda:['Jazz','Civic','CR-V']};

// ── MOTORS (was index.html regel 3030) ──
window.MOTORS =['1.0 TSI/EcoBoost','1.2 TDI','1.4 TDI','1.5 TDI','1.5 TSI','1.6 TDI/HDI','1.8 TSI','2.0 TDI','2.0 TSI/TFSI','2.0 TDCi','Hybrid','PHEV','Elektrisch'];

// ── DTCDB (was index.html regel 3033) ──
window.DTCDB ={
  // Brandstof & Lucht
  P0087:{desc:'Brandstofdruk te laag',            body:'Brandstofpomp, filter of drukregelaar defect.',               sev:'high'},
  P0088:{desc:'Brandstofdruk te hoog',            body:'Drukregelaar defect of retourleiding geblokkeerd.',           sev:'high'},
  P0171:{desc:'Systeem te mager (bank 1)',         body:'Vacuümlek, MAF vuil, brandstofpomp zwak of injector verstopt.',sev:'med'},
  P0172:{desc:'Systeem te rijk (bank 1)',          body:'Lekkende injector, defecte O2 sensor of hoge brandstofdruk.',sev:'med'},
  P0174:{desc:'Systeem te mager (bank 2)',         body:'Zelfde als P0171 maar bank 2.',                              sev:'med'},
  P0175:{desc:'Systeem te rijk (bank 2)',          body:'Zelfde als P0172 maar bank 2.',                              sev:'med'},
  // Ontsteking
  P0300:{desc:'Willekeurige ontsteking gemist',   body:'Bougies, bobines, brandstofdruk of compressie controleren.',  sev:'high'},
  P0301:{desc:'Cilinder 1 ontsteking gemist',     body:'Bougie, bobine of injector cilinder 1.',                     sev:'high'},
  P0302:{desc:'Cilinder 2 ontsteking gemist',     body:'Bougie, bobine of injector cilinder 2.',                     sev:'high'},
  P0303:{desc:'Cilinder 3 ontsteking gemist',     body:'Bougie, bobine of injector cilinder 3.',                     sev:'high'},
  P0304:{desc:'Cilinder 4 ontsteking gemist',     body:'Bougie, bobine of injector cilinder 4.',                     sev:'high'},
  P0305:{desc:'Cilinder 5 ontsteking gemist',     body:'Bougie, bobine of injector cilinder 5.',                     sev:'high'},
  P0306:{desc:'Cilinder 6 ontsteking gemist',     body:'Bougie, bobine of injector cilinder 6.',                     sev:'high'},
  // MAF & Luchtinlaat
  P0100:{desc:'MAF sensor circuit probleem',      body:'MAF sensor defect of verbindingsprobleem.',                  sev:'med'},
  P0101:{desc:'MAF circuit buiten bereik',        body:'Vuile MAF, luchtfilter verstopt of vacuümlek.',              sev:'med'},
  P0102:{desc:'MAF circuit laag signaal',         body:'MAF sensor of bedrading defect.',                            sev:'med'},
  P0103:{desc:'MAF circuit hoog signaal',         body:'MAF sensor of bedrading defect.',                            sev:'med'},
  // Temperatuursensoren
  P0110:{desc:'Inlaatlucht temp sensor',          body:'IAT sensor of bedrading defect.',                            sev:'low'},
  P0115:{desc:'Koelwater temp sensor circuit',    body:'ECT sensor of bedrading defect.',                            sev:'med'},
  P0116:{desc:'Koelwater temp buiten bereik',     body:'ECT sensor of thermostaat probleem.',                        sev:'med'},
  P0128:{desc:'Koelant temp te laag',             body:'Thermostaat vast open of defect.',                           sev:'low'},
  P0217:{desc:'Motor oververhitting',             body:'Koelvloeistofpeil, waterpomp, thermostaat of radiateur.',    sev:'high'},
  // O2 Sensoren
  P0130:{desc:'O2 sensor circuit B1S1',           body:'Lambda sensor voor-kat defect.',                             sev:'med'},
  P0131:{desc:'O2 sensor laag voltage B1S1',      body:'Lambda sensor of vacuümlek.',                                sev:'med'},
  P0132:{desc:'O2 sensor hoog voltage B1S1',      body:'Lambda sensor of rijk mengsel.',                             sev:'med'},
  P0133:{desc:'O2 sensor traag B1S1',             body:'Lambda sensor versleten of vergiftigd.',                     sev:'med'},
  P0136:{desc:'O2 sensor circuit B1S2',           body:'Lambda sensor na-kat defect.',                               sev:'med'},
  P0141:{desc:'O2 sensor verwarming B1S2',        body:'Verwarmingselement lambda sensor defect.',                   sev:'med'},
  // Nokkenas & Timing
  P0010:{desc:'Nokkenas actuator circuit',        body:'VVT solenoïde of bedrading defect.',                         sev:'high'},
  P0011:{desc:'Nokkenas te vroeg (intake B1)',    body:'VVT solenoïde, oliepeil of kettingspanning.',                sev:'high'},
  P0012:{desc:'Nokkenas te laat (intake B1)',     body:'VVT solenoïde of camshaft positie sensor.',                  sev:'high'},
  P0016:{desc:'Krukas/nokkenas verhouding fout',  body:'Kettingrek, timing of sensor defect.',                       sev:'high'},
  P0340:{desc:'Nokkenas positie sensor circuit',  body:'CMP sensor of toonwiel defect.',                             sev:'high'},
  // Emissie
  P0400:{desc:'EGR stroom probleem',              body:'EGR klep of leiding verstopt.',                              sev:'med'},
  P0401:{desc:'EGR stroom te laag',               body:'EGR klep verstopt of defect.',                               sev:'med'},
  P0420:{desc:'Katalysator efficiëntie laag B1',  body:'Versleten kat of defecte O2 sensor na-kat.',                 sev:'med'},
  P0430:{desc:'Katalysator efficiëntie laag B2',  body:'Zelfde als P0420 maar bank 2.',                              sev:'med'},
  P0440:{desc:'Verdampingssysteem lek',           body:'Tankdop, EVAP systeem of leiding lek.',                      sev:'low'},
  P0442:{desc:'EVAP systeem klein lek',           body:'Tankdop of EVAP leiding lek.',                               sev:'low'},
  P0455:{desc:'EVAP systeem groot lek',           body:'Tankdop los, slang af of purge klep defect.',                sev:'low'},
  // Accu & Laden
  P0560:{desc:'Systeemspanning probleem',         body:'Accu of alternator probleem.',                               sev:'med'},
  P0562:{desc:'Systeemspanning te laag',          body:'Accu zwak of alternator ladt niet.',                         sev:'high'},
  P0563:{desc:'Systeemspanning te hoog',          body:'Spanningsregelaar in alternator defect.',                    sev:'high'},
  // Transmissie
  P0700:{desc:'Transmissie besturing fout',       body:'TCM fout — zie ook transmissie codes.',                      sev:'high'},
  P0715:{desc:'Ingangs/turbine speed sensor',     body:'Speed sensor of bedrading defect.',                          sev:'med'},
  P0720:{desc:'Uitgangs speed sensor',            body:'Speed sensor of bedrading defect.',                          sev:'med'},
  // Communicatie
  U0001:{desc:'CAN bus communicatie fout',        body:'CAN bus bedrading of module defect.',                        sev:'high'},
  U0100:{desc:'Communicatie PCM verloren',        body:'PCM voeding of CAN bus probleem.',                           sev:'high'},
  U0101:{desc:'Communicatie TCM verloren',        body:'TCM of CAN bus probleem.',                                   sev:'high'},
  // B-codes
  B1318:{desc:'Accu spanning laag',               body:'Accu, alternator of lekstroom.',                             sev:'med'}
};

// ── DTC_MERK — merkspecifieke codes en teksten ──
// Gesplitst van DTCDB op 31-07-2026: 7 codes (P0011, P0012, P0016, P0128,
// P0340, P0401, P0420) stonden zowel generiek als merkspecifiek in één
// objectliteraal. De laatste won, dus een Mazda kreeg BMW-tekst bij P0128.
// dtcInfo() in pidlane-bt.js kiest nu op merk en valt terug op generiek.
window.DTC_MERK = {
  // ── MAZDA SPECIFIEK (CX-5, Mazda3, Mazda6, CX-30) ──
  MAZDA: {
    P2006:{desc:'Inlaatspruitstuk klep gesloten (bank 1)',  body:'IMRC actuator of bedrading. CX-5 2.0/2.5: vacuümsysteem controleren.',sev:'med'},
    P2004:{desc:'Inlaatspruitstuk klep vast open',          body:'IMRC klep mechanisch vastgelopen.',                   sev:'med'},
    P2187:{desc:'Systeem te mager bij stationair (bank 1)', body:'Vacuümlek of brandstofsysteem. Mazda SkyActiv: inlaatgasket controleren.',sev:'med'},
    P0AA6:{desc:'Hybride accupakket spanning laag',         body:'Mazda M Hybrid: 24V mild-hybrid systeem fout.',       sev:'high'},
    P1260:{desc:'Diefstalbeveiliging actief',               body:'Immobiliser probleem — contactsleutel of transponder.',sev:'high'},
    P0A0F:{desc:'Aandrijfsysteem noodloopprogramma',        body:'Mazda M Hybrid: systeem vereist diagnose.',           sev:'high'},
    C1155:{desc:'ABS linksvoor wielsnelheid sensor',        body:'Wielsnelheidsensor of tand-ring defect.',             sev:'high'},
    C1165:{desc:'ABS rechtsvoor wielsnelheid sensor',       body:'Wielsnelheidsensor of tand-ring defect.',             sev:'high'},
  },
  // ── VOLKSWAGEN / AUDI / SKODA / SEAT (VAG) ──
  VAG: {
    P0299:{desc:'Turbo/compressor ondervermogen',    body:'Turbo defect, intercooler lek of wastegate probleem.',      sev:'high'},
    P2015:{desc:'Inlaatspruitstuk positiesensor',    body:'Beroemd VW 2.0 TDI probleem — kleppenvlinder kapot.',      sev:'med'},
    P0401:{desc:'EGR onvoldoende doorstroom',        body:'EGR klep vastgelopen of vuil. Veel bij VW TDI.',           sev:'med'},
    P0420:{desc:'Katalysator efficiëntie laag (bank 1)',body:'Katalysator versleten of O2 sensor defect.',            sev:'med'},
    P0411:{desc:'Secundaire luchtinjectie fout',     body:'Secundaire luchtpomp of klep defect. VW/Audi benzine.',    sev:'med'},
    P0507:{desc:'Stationair toerental te hoog',      body:'Gasklep of luchtstroom meting fout.',                      sev:'med'},
    P1296:{desc:'Koelvloeistof temperatuursensor',   body:'CTS wisselt — veel bij VW/Audi 1.8/2.0 TSI.',             sev:'med'},
  },
  // ── TOYOTA / LEXUS ──
  TOYOTA: {
    P3000:{desc:'HV accusysteem fout',              body:'Hybride accupakket of BMS systeem.',                        sev:'high'},
    P0A80:{desc:'Vervang hybride accu',             body:'Toyota Prius/Auris/Yaris hybride: accu versleten.',         sev:'high'},
    P0500:{desc:'Voertuigsnelheid sensor',          body:'VSS sensor of bedrading defect.',                          sev:'med'},
    C1201:{desc:'Motorbesturing systeem fout',      body:'Toyota: ABS lamp + motorlamp samen — vaak MAP/TPS fout.',  sev:'high'},
    P1120:{desc:'Gasklep positiesensor',            body:'Toyota: TPS sub-sensor buiten bereik.',                    sev:'med'},
  },
  // ── FORD ──
  FORD: {
    P0191:{desc:'Brandstofdruk sensor bereik',      body:'Ford 1.0 EcoBoost: brandstofdruksensor of pomp.',          sev:'med'},
    P0340:{desc:'Nokkenas positiesensor circuit A', body:'CMP sensor of kettingrek. Ford 1.6 TDCi veel voorkomend.',sev:'high'},
    P246A:{desc:'Dieselroetfilter te vol',          body:'Ford TDCi: DPF regeneratie mislukt — snelweg rijden.',     sev:'med'},
    P2263:{desc:'Turbo/supercharger boost sensor',  body:'Ford EcoBoost: boost sensor of inlaatleiding lek.',        sev:'med'},
  },
  // ── OPEL / VAUXHALL ──
  OPEL: {
    P0597:{desc:'Thermostaat verwarmingselement',   body:'Thermostaat met elektrische verwarming defect. Veel Opel.', sev:'med'},
    P0016:{desc:'Krukas/nokkenas koppeling (bank 1 inlaat)',body:'Kettingrek of variabele klepdistributie fout.',     sev:'high'},
    P0017:{desc:'Krukas/nokkenas koppeling (bank 1 uitlaat)',body:'Kettingrek of VVT magneetventiel.',                sev:'high'},
  },
  // ── BMW / MINI ──
  BMW: {
    P0012:{desc:'A nokkenas timing over-teruggetrokken',body:'BMW: VANOS actuator of oliepeil te laag.',             sev:'high'},
    P0011:{desc:'A nokkenas timing over-gevorderd',  body:'BMW: VANOS magneetventiel of oliedruk.',                  sev:'high'},
    P0128:{desc:'Koelwater te laag (thermostaat)',   body:'Thermostaat vast open — veel BMW/Mini.',                  sev:'med'},
    P1340:{desc:'Ontstekingssysteem krukas sensor',  body:'BMW: CKP sensor of vliegwiel tand.',                      sev:'high'},
  },
};

// Labels voor in de tekst als een code van een ánder merk wordt geleend.
window.DTC_MERK_LABEL = {
  MAZDA: 'Mazda',
  VAG: 'VW/Audi/Skoda/Seat',
  TOYOTA: 'Toyota/Lexus',
  FORD: 'Ford',
  OPEL: 'Opel/Vauxhall',
  BMW: 'BMW/Mini',
};

// ── merkGroep() — één plek waar merknamen op een bucket worden gemapt ──
// Gebruikt door pidlane-bt.js en, sinds ronde 9, door applyVehiclePIDPreset()
// in pidlane-rijsituatie.js. Nieuwe merkregels horen hier en nergens anders.
window.merkGroep = function merkGroep(merk){
  const m = String(merk||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                            .toUpperCase().replace(/[^A-Z]/g,'');
  if(!m) return '';
  if(m.indexOf('MAZDA')===0) return 'MAZDA';
  if(m.indexOf('VOLKSWAGEN')===0||m==='VW'||m.indexOf('AUDI')===0||m.indexOf('SKODA')===0||m.indexOf('SEAT')===0||m.indexOf('CUPRA')===0) return 'VAG';
  if(m.indexOf('TOYOTA')===0||m.indexOf('LEXUS')===0) return 'TOYOTA';
  if(m.indexOf('FORD')===0) return 'FORD';
  if(m.indexOf('OPEL')===0||m.indexOf('VAUXHALL')===0) return 'OPEL';
  if(m==='BMW'||m.indexOf('MINI')===0) return 'BMW';
  return '';
};


// ── PIDS_EXTRA (was index.html regel 3142) ──
window.PIDS_EXTRA = {
  // Mazda CX-5 2018 specifieke PIDs (mode 21 — de comment zei ooit 22)
  // LET OP: dit object wordt NERGENS gelezen. De werkende definities staan
  // in pidlane-uitgebreid.js (UITGEBREID_DEFS), inclusief parse-functies en
  // een probe. Hier laten staan als historische referentie; niet uitbreiden.
  '2101':{name:'Motorolie temp',      unit:'°C', min:-40, max:150, cat:'Mazda'},
  '2102':{name:'Turbodruk actueel',   unit:'kPa',min:0,   max:250, cat:'Mazda'},
  '210C':{name:'Klep timing inlaat',  unit:'°',  min:-50, max:50,  cat:'Mazda'},
  '210D':{name:'Klep timing uitlaat', unit:'°',  min:-50, max:50,  cat:'Mazda'},
  // Algemeen mode 01 extra
  '0149':{name:'Gaspedaal positie',   unit:'%',  min:0,   max:100, cat:'Rijden'},
  '015A':{name:'Hybride accu %',      unit:'%',  min:0,   max:100, cat:'Electrisch'},
  '015B':{name:'Hybride accu temp',   unit:'°C', min:-40, max:80,  cat:'Electrisch'},
  '0143':{name:'Abs motorbelasting',  unit:'%',  min:0,   max:100, cat:'Motor'},
  '0146':{name:'Omgevingstemperatuur',unit:'°C', min:-40, max:60,  cat:'Temperatuur'},
  '015E':{name:'Brandstofverbruik',   unit:'L/h',min:0,   max:20,  cat:'Brandstof'},
  '015C':{name:'Motorolie temp',      unit:'°C', min:-40, max:150, cat:'Temperatuur'},
};

// ── BASIS_PIDS (was index.html regel 5150) ──
window.BASIS_PIDS = ['010C','0105','0104','010F','0142'];

// ── ANALYSE_PIDS (was index.html regel 5152) ──
window.ANALYSE_PIDS ={
  basis:     ['010C','0105','0104','0111','010D','0142','010F','010B'],
  brandstof: ['010C','010D','0104','0106','0107','0110','010B','010F','0144','0124','0115','015E','012F'],
  emissie:   ['0106','0107','0114','0115','0124','0134','0144','013C','013E','012E','0121'],
  rit:       ['010C','010D','0104','0111','0105','0110','010B','0106','0107','0149'],
  totaal:    ['010C','0105','0104','0111','010D','0142','010F','010B','0106','0107','0115','010E','011F'],
  // Accu-check: schakel naar accuspanning + laadcontext; basis blijft meelopen.
  accu:      ['0142','010C','0104','0105','0146','015B']
};

// ── ANALYSE_CATS (was index.html regel 5169) ──
window.ANALYSE_CATS = {
  basis:     ['Motor','Temp','Brandstof'],
  brandstof: ['Motor','Brandstof','Emissie'],
  emissie:   ['Emissie','Brandstof'],
  rit:       ['Motor','Brandstof','Temp','Emissie'],
  totaal:    ['Motor','Temp','Brandstof','Emissie','Overig'],
  accu:      ['Motor','Temp'],
};

// ── CORRELATION_RULES (was index.html regel 5605) ──
window.CORRELATION_RULES =[
  {
    id:'alternator',
    naam:'Mogelijk dynamo-/laadprobleem',
    test:()=>{ const v=pidVals['0142'], rpm=pidVals['010C'];
      return v!==undefined&&rpm!==undefined&&rpm>1000&&v<13.0; },
    uitleg:'Accuspanning blijft laag terwijl de motor draait — dynamo laadt mogelijk onvoldoende.'
  },
  {
    id:'vacuumlek',
    naam:'Mogelijk vacuümlek',
    test:()=>{ const stft=pidVals['0106'], ltft=pidVals['0107'], tps=pidVals['0111'];
      return stft!==undefined&&ltft!==undefined&&(stft+ltft)>18&&(tps===undefined||tps<15); },
    uitleg:'Brandstoftrims staan hoog positief bij gesloten gasklep — wijst op bijgemengde valse lucht (vacuümlek).'
  },
  {
    id:'maf',
    naam:'Mogelijk vuile MAF / verstopt luchtfilter',
    test:()=>{ const maf=pidVals['0110'], rpm=pidVals['010C'], load=pidVals['0104'];
      return maf!==undefined&&rpm!==undefined&&rpm>1500&&load>40&&maf<3; },
    uitleg:'Luchtmassa blijft laag bij hoog toerental en belasting — mogelijk vervuilde MAF of luchtfilter.'
  },
  {
    id:'thermostaat',
    naam:'Mogelijk thermostaatprobleem',
    test:()=>{ const ect=pidVals['0105'];
      return ect!==undefined&&pidHist['0105']?.length>40&&ect<70; },
    uitleg:'Koelwater blijft langdurig onder bedrijfstemperatuur — thermostaat mogelijk vast open.'
  },
  {
    id:'oververhitting',
    naam:'Koelwater loopt op',
    test:()=>{ const ect=pidVals['0105']; return ect!==undefined&&ect>105; },
    uitleg:'Koelvloeistoftemperatuur is hoog — controleer koeling vóór doorrijden.'
  },
];

// ── CHK_CAT_META (was index.html regel 5699) ──
window.CHK_CAT_META ={Motor:{l:'Motor',i:'⚙️'},Temp:{l:'Temperatuur',i:'🌡️'},Brandstof:{l:'Brandstof',i:'⛽'},Emissie:{l:'Emissie',i:'💨'},Electrisch:{l:'Electrisch',i:'🔋'},Rijden:{l:'Rijden',i:'🚗'},Overig:{l:'Overig',i:'📊'},Foutcodes:{l:'Foutcodes',i:'⚠️'},Bestuurder:{l:'Bestuurder',i:'🧑'}};

// ── CHK_CAT_ORDER (was index.html regel 5700) ──
window.CHK_CAT_ORDER =['Motor','Temp','Brandstof','Emissie','Electrisch','Rijden','Overig','Foutcodes','Bestuurder'];

// ── BSC_TESTS (was index.html regel 5953) ──
window.BSC_TESTS = [
  // ── UNIVERSEEL ──────────────────────────────────────────────────
  {id:'idle_stab', groep:'universeel', naam:'Stationair stabiliteit', pids:['010C'],
   uitleg:'RPM stabiel binnen ±50 rpm', hold:5,
   band:(v,h)=>{ const b=bscBaseline(h['010C'],3); return b==null?null:{lo:b-50,hi:b+50,ref:b}; }},
  {id:'cool_warm', groep:'universeel', naam:'Koelvloeistof opwarmen', pids:['0105'],
   uitleg:'Geleidelijke stijging naar bedrijfstemperatuur (80–100 °C)', hold:4,
   band:{lo:70,hi:105}, trend:'stijgend'},
  /* 27-07-2026 — deze test toetste tegen de LAADband (13,3-15,0 V) maar had
     geen enkele voorwaarde. Met de motor uit staat een gezonde accu op ~12,5 V
     en zakte hij dus altijd. De laadspanning wordt al correct getest door
     x_laadspanning (mét eis motorDraait); deze meet nu waar hij goed in is:
     de rustspanning, juist mét de motor UIT. Samen dekken ze het hele beeld.
     12,6 V = vol · 12,4 V = ~75% · onder 12,0 V = diep ontladen. */
  {id:'batt_rust', groep:'universeel', naam:'Accuspanning in rust', pids:['0142'],
   uitleg:'Contact aan maar motor uit: een gezonde accu staat op 12,4-12,8 V. Onder 12,2 V is hij half leeg of versleten.',
   hold:4, eis:{motorUit:true}, eisWachtMs:10000,
   band:{lo:12.2,hi:12.9, ref:12.6}},
  {id:'map_idle', groep:'universeel', naam:'MAP-druk stationair', pids:['010B'],
   uitleg:'30–40 kPa stationair = geen vacuümlek', hold:4, band:{lo:25,hi:45}},
  {id:'tps_lin', groep:'universeel', naam:'Gasklep respons', pids:['0111'],
   uitleg:'Trap gas rustig in: 0→100 % vloeiend', hold:3, band:{lo:0,hi:100}, dynamiek:true},
  {id:'iat_amb', groep:'universeel', naam:'Inlaatlucht bij koude start', pids:['010F','0146'],
   uitleg:'IAT ≈ buitentemperatuur bij koude motor', hold:3,
   band:(v)=>{ const amb=v['0146']; return amb==null?{lo:-10,hi:45}:{lo:amb-8,hi:amb+15,ref:amb}; }},
  {id:'ltft', groep:'universeel', naam:'Brandstoftrim (LTFT)', pids:['0107'],
   uitleg:'Lange trim tussen −10 % en +10 %', hold:4, band:{lo:-10,hi:10}},
  {id:'misfire', groep:'universeel', naam:'Misfire-monitor', pids:['010C','0104'],
   uitleg:'RPM mag niet plots inzakken onder lichte belasting (indirecte misfire)', hold:5,
   band:(v,h)=>{ const b=bscBaseline(h['010C'],4); return b==null?null:{lo:b-120,hi:b+400,ref:b}; }},
  /* ── 27-07-2026 — LAMBDA: twee sensortypen, twee verschillende tests ──
     Deze test ging uit van één PID: 0114, de klassieke smalband-spanning.
     Vanaf ongeveer 2012 leveren veel motoren (o.a. Mazda SkyActiv-G) de
     vóórste sensor helemaal niet als spanning maar als breedband-lambda,
     via 0124-012B (lambda + spanning) of 0134-013B (lambda + stroom).
     Op de CX-5 2018 uit de diagnosebundel ontbreekt 0114 volledig; die auto
     heeft 0134 en 0115. De test wachtte dus op data die nooit kon komen.

     Belangrijker dan alleen het PID: een breedbandsensor SCHAKELT NIET.
     Een smalbandsensor pendelt tussen 0,1 en 0,9 V; een breedbandsensor
     houdt in closed loop juist lambda ≈ 1,00 aan met een kleine rimpel.
     De oscillatie-eis op een gezonde breedbandsensor loslaten zou hem dus
     ten onrechte laten zakken. Vandaar twee losse tests met eigen criteria.
     Ze sluiten elkaar vanzelf uit: welke van de twee wordt gekozen hangt af
     van welke PID de auto daadwerkelijk levert. */
  {id:'o2_switch', groep:'universeel', naam:'Lambdasensor schakelt (smalband)', pids:['0114'],
   uitleg:'Motor warm en stationair: de voorste smalbandsensor hoort meerdere keren per seconde tussen 0,1 en 0,9 V te pendelen.',
   hold:4, eis:{warm:true, motorDraait:true}, eisWachtMs:15000,
   band:{lo:0.05,hi:0.95}, oscilleren:true},
  /* Achterste sensor (ná de katalysator). Die hoort zich juist ANDERS te
     gedragen dan de voorste: een werkende kat buffert zuurstof, waardoor de
     achterste sensor traag en vlak rond 0,6-0,8 V blijft hangen. Gaat hij
     mee schakelen met de voorste, dan is de kat op — een van de sterkste
     aanwijzingen die je zonder demontage kunt krijgen.
     Let op: dit is bewust GEEN oscillatietest maar het omgekeerde. */
  {id:'o2_rear', groep:'universeel', naam:'Katalysator — achterste sensor', pids:['0115','0116'],
   uitleg:'Motor warm en stationair: achter de katalysator hoort de spanning traag en vlak rond 0,6-0,8 V te blijven staan. Schommelt hij net zo hard als de voorste sensor, dan buffert de kat geen zuurstof meer.',
   hold:5, eis:{warm:true, motorDraait:true}, eisWachtMs:15000,
   band:{lo:0.55,hi:0.85, ref:0.70}},
  {id:'o2_wide', groep:'universeel', naam:'Lambdaregeling (breedband)', pids:['0124','0134','0125','0135'],
   uitleg:'Motor warm en stationair: een breedbandsensor pendelt niet, maar houdt lambda rond 1,00. Blijft de waarde daar netjes omheen, dan regelt het brandstofsysteem goed.',
   hold:4, eis:{warm:true, motorDraait:true}, eisWachtMs:15000,
   band:{lo:0.97,hi:1.03, ref:1.00}},
  {id:'spd_rpm', groep:'universeel', naam:'Snelheid vs toerental', pids:['010D','010C'],
   uitleg:'Rij constant: snelheid en RPM lopen lineair mee (koppeling/automaat OK)', hold:4,
   band:{lo:0,hi:280}},
  {id:'fuel_flow', groep:'universeel', naam:'Verbruik bij constante snelheid', pids:['015E'],
   uitleg:'Verbruik stabiel bij gelijkmatig rijden', hold:4, band:{lo:0,hi:50}},
  {id:'fan_act', groep:'universeel', naam:'Koelventilator-venster', pids:['0105'],
   uitleg:'Bij 95–105 °C hoort de fan te schakelen', hold:3, band:{lo:60,hi:115}, ref:100},

  // ── BENZINE ─────────────────────────────────────────────────────
  {id:'maf_curve', groep:'benzine', naam:'MAF luchtflow', pids:['0110','010C'],
   uitleg:'MAF stijgt vloeiend met RPM', hold:4, band:{lo:1,hi:500}},
  {id:'ign_time', groep:'benzine', naam:'Ontstekingstiming', pids:['010E'],
   uitleg:'Timing verandert bij accelereren', hold:3, band:{lo:-15,hi:50}, dynamiek:true},
  {id:'stft_resp', groep:'benzine', naam:'STFT op gasstoot', pids:['0106'],
   uitleg:'Korte positieve piek, daarna terug naar ~0 %', hold:3, band:{lo:-15,hi:20}, dynamiek:true},
  {id:'cat_eff', groep:'benzine', naam:'Katalysator-efficiëntie', pids:['0115'],
   uitleg:'Achterste O2 stabiel rond 0,6–0,8 V', hold:5, band:{lo:0.5,hi:0.85}},
  {id:'fuel_lvl', groep:'benzine', naam:'Tankniveau plausibel', pids:['012F'],
   uitleg:'Geen abrupte sprongen in tankniveau', hold:4, band:{lo:0,hi:100}, stabiel:true},

  // ── DIESEL ──────────────────────────────────────────────────────
  {id:'rail_stab', groep:'diesel', naam:'Raildruk stabiliteit', pids:['0159','0123'],
   uitleg:'Stationair stabiel, stijgt netjes bij gas', hold:4, band:{lo:200,hi:2200}},
  {id:'egr_flow', groep:'diesel', naam:'EGR-flow', pids:['012C'],
   uitleg:'EGR-positie verandert bij lichte belasting', hold:3, band:{lo:0,hi:100}, dynamiek:true},
  {id:'boost', groep:'diesel', naam:'Turbo-boost curve', pids:['0170','010B'],
   uitleg:'Boost stijgt vloeiend, geen pieken', hold:4, band:{lo:0,hi:300}},
  {id:'dpf_soot', groep:'diesel', naam:'DPF roetlast', pids:['017C','016B'],
   uitleg:'Roetlast binnen normale band (0–45 %)', hold:3, band:{lo:0,hi:45}},
  {id:'nox_plaus', groep:'diesel', naam:'NOx plausibiliteit', pids:['0183','018E'],
   uitleg:'NOx-waarden stijgen bij accelereren', hold:3, band:{lo:0,hi:2000}, dynamiek:true},

  // ── HYBRIDE ─────────────────────────────────────────────────────
  {id:'hv_soc', groep:'hybride', naam:'HV-batterij SOC', pids:['015B'],
   uitleg:'SOC blijft binnen 30–80 %', hold:4, band:{lo:25,hi:85}},
  {id:'ev_ice', groep:'hybride', naam:'EV ↔ ICE overgang', pids:['010C'],
   uitleg:'RPM springt vloeiend in/uit (motor start/stopt netjes)', hold:4, band:{lo:0,hi:6000}},
  {id:'regen', groep:'hybride', naam:'Regeneratie laadstroom', pids:['0142','015B'],
   uitleg:'Spanning/laden stijgt bij remmen', hold:3, band:{lo:12,hi:15.5}, dynamiek:true},
];

// ── COMPLAINT_FOCUS (was index.html regel 6264) ──
window.COMPLAINT_FOCUS =[
  {kw:['start','aanslaan','starten','opstart'],           pids:['0105','010A','0106','0107','010C']},
  {kw:['stationair','onrustig','schommel','idle'],        pids:['010C','010E','0106','0107','0110']},
  {kw:['accelerat','optrekk','vermogen','trekt','puff'],  pids:['010B','0110','010A','0104','010C']},
  {kw:['verbruik','benzine','zuinig','dorst'],            pids:['015E','0110','0114','0115','0106','0107']},
  {kw:['oververhit','heet','temperatuur','koel'],         pids:['0105','015C','0104']},
  {kw:['rook','uitlaat','stink'],                         pids:['0106','0107','0114','012C','0110']},
  {kw:['accu','start niet','laden','dynamo','spanning'],  pids:['0142','010C','0104']},
  {kw:['trilling','schok','schakel'],                     pids:['010C','0104','010D','0111']},
];

// ── FUEL_PIDS (was index.html regel 6854) ──
window.FUEL_PIDS =[
  {pid:'0106',name:'Brandstoftrim kort B1',unit:'%',ok:[-5,5],desc:'Hoog=vacuümlek/MAF. Laag=injector.'},
  {pid:'0107',name:'Brandstoftrim lang B1',unit:'%',ok:[-5,5],desc:'Langdurige afwijking=structureel probleem.'},
  {pid:'0110',name:'MAF Luchtmassameter',unit:'g/s',ok:null,desc:'Te laag=vuile MAF of luchtfilter.'},
  {pid:'010E',name:'Ontstekingstiming',unit:'°',ok:[5,25],desc:'Afwijking=minder efficiënte verbranding.'},
  {pid:'0105',name:'Koelwater temp',unit:'°C',ok:[80,100],desc:'Te koud=10-20% meer verbruik.'},
  {pid:'0142',name:'Accuspanning',unit:'V',ok:[13.5,14.8],desc:'Laag=alternator belasting verhoogd.'},
  {pid:'015E',name:'Live brandstofverbruik',unit:'L/h',ok:null,desc:'Directe verbruiksmeting.'},
];

// ── ELM_BASELINE (was index.html regel 7992) ──
window.ELM_BASELINE =['ATE0','ATL0','ATS0','ATH0','ATAT1','ATST64']; // bekende goede staat

// ── SCENARIO_PID_SUGGEST (was index.html regel 8251) ──
window.SCENARIO_PID_SUGGEST =['010C','010D','0105','015C','0104','0142','0106','0107','0110','010B','010F','0114','0115','012F','015E','010A','012C'];

// ── SCENARIO_PRESETS (was index.html regel 8256) ──
window.SCENARIO_PRESETS =[
  {id:'waterpomp',  label:'💧 Waterpomp / koelcirculatie', desc:'Geen circulatie, koelwater loopt op',  fuels:['benzine','diesel'], pids:{'0105':118,'015C':127,'010C':850,'0104':30}, dtcs:['P0128','P0217']},
  {id:'thermostaat',label:'🌡️ Thermostaat hangt open',     desc:'Motor wordt niet op temperatuur',       fuels:['benzine','diesel'], pids:{'0105':61,'015C':57}, dtcs:['P0128']},
  {id:'oververhit', label:'🔥 Oververhitting',              desc:'Koelwater + olie te heet onder last',   fuels:['benzine','diesel'], pids:{'0105':120,'015C':129,'010C':3000,'0104':85}, dtcs:['P0217']},
  {id:'dynamo',     label:'🔋 Dynamo / laadspanning laag',  desc:'Accuspanning zakt weg, niet laden',                                pids:{'0142':11.7,'010C':1600}, dtcs:['P0562','P0620']},
  {id:'overspanning',label:'⚡ Spanningsregelaar overlaadt',desc:'Te hoge laadspanning',                                             pids:{'0142':15.7}, dtcs:['P0563']},
  {id:'arm',        label:'🫧 Mengsel te arm',              desc:'Vacuümlek of MAF — positieve trim',     fuels:['benzine'], pids:{'0106':23,'0107':20,'0124':1.16}, dtcs:['P0171']},
  {id:'rijk',       label:'⛽ Mengsel te rijk',             desc:'Negatieve trim',                        fuels:['benzine'], pids:{'0106':-22,'0107':-19,'0124':0.84}, dtcs:['P0172']},
  {id:'misfire',    label:'💥 Ontstekingsfout (misfire)',  desc:'Onregelmatig stationair toerental',     fuels:['benzine'], pids:{'010C':760,'0104':26}, dtcs:['P0300','P0301']},
  {id:'kat',        label:'♻️ Katalysator rendement laag', desc:'B1S2 volgt B1S1 te veel',               fuels:['benzine'], pids:{'0114':0.6,'0115':0.58}, dtcs:['P0420']},
  {id:'egr',        label:'🌀 EGR vast / verstopt',         desc:'EGR reageert niet',                     fuels:['diesel','benzine'], pids:{'012C':0,'0105':96}, dtcs:['P0401']},
];

// ── STRATEGIE_INFO (was index.html regel 9388) ──
window.STRATEGIE_INFO ={
  snel:         {label:'Snel',         emoji:'🚀', mult:0.7, desc:'Agressief pollen — alle sensoren, korte intervallen'},
  gebalanceerd: {label:'Gebalanceerd', emoji:'⚖️', mult:1.0, desc:'Standaard tempo — goede balans snelheid/stabiliteit'},
  conservatief: {label:'Conservatief', emoji:'🐢', mult:1.8, desc:'Rustig pollen — voorkomt timeouts op trage adapters'},
};

// ── ALL_PID_DEFS (was index.html regel 9544) ──
window.ALL_PID_DEFS ={
  '010C':{name:'Motortoerental',       unit:'RPM', cat:'Motor',      min:0,   max:8000, wH:6000,           parse:b=>((b[0]*256+b[1])/4)},
  '0104':{name:'Motorbelasting',       unit:'%',   cat:'Motor',      min:0,   max:100,  wH:90,             parse:b=>(b[0]*100/255)},
  '0111':{name:'Gasklep positie',      unit:'%',   cat:'Motor',      min:0,   max:100,                     parse:b=>(b[0]*100/255)},
  '010B':{name:'Inlaatdruk',           unit:'kPa', cat:'Motor',      min:0,   max:255,                     parse:b=>b[0]},
  '010F':{name:'Inlaatlucht temp',     unit:'°C',  cat:'Motor',      min:-40, max:150,  wH:55,             parse:b=>(b[0]-40)},
  '010E':{name:'Ontstekingstiming',    unit:'°',   cat:'Motor',      min:-64, max:64,                      parse:b=>(b[0]/2-64)},
  '010A':{name:'Brandstofdruk',        unit:'kPa', cat:'Motor',      min:0,   max:765,                     parse:b=>(b[0]*3)},
  '0145':{name:'Relatieve gasklep',    unit:'%',   cat:'Motor',      min:0,   max:100,                     parse:b=>(b[0]*100/255)},
  '014C':{name:'Gasklep B positie',    unit:'%',   cat:'Motor',      min:0,   max:100,                     parse:b=>(b[0]*100/255)},
  '0105':{name:'Koelwater temp',       unit:'°C',  cat:'Temp',       min:-40, max:215,  wH:100, dH:110,   parse:b=>(b[0]-40)},
  '015C':{name:'Motorolie temp',       unit:'°C',  cat:'Temp',       min:-40, max:215,  wH:130, dH:150,   parse:b=>(b[0]-40)},
  '0146':{name:'Omgevingstemperatuur', unit:'°C',  cat:'Temp',       min:-40, max:85,                      parse:b=>(b[0]-40)},
  '0133':{name:'Barometerdruk',        unit:'kPa', cat:'Temp',       min:0,   max:255,                     parse:b=>b[0]},
  '012F':{name:'Brandstofpeil',        unit:'%',   cat:'Brandstof',  min:0,   max:100,  wL:10,             parse:b=>(b[0]*100/255)},
  '015E':{name:'Brandstofverbruik',    unit:'L/h', cat:'Brandstof',  min:0,   max:50,                      parse:b=>((b[0]*256+b[1])/20)},
  '0110':{name:'MAF luchtmassameter',  unit:'g/s', cat:'Brandstof',  min:0,   max:500,                     parse:b=>((b[0]*256+b[1])/100)},
  '0106':{name:'Brandstoftrim kort B1',unit:'%',   cat:'Brandstof',  min:-30, max:30,   wH:10, wL:-10,    parse:b=>(b[0]/1.28-100)},
  '0107':{name:'Brandstoftrim lang B1',unit:'%',   cat:'Brandstof',  min:-30, max:30,   wH:10, wL:-10,    parse:b=>(b[0]/1.28-100)},
  '0108':{name:'Brandstoftrim kort B2',unit:'%',   cat:'Brandstof',  min:-30, max:30,   wH:10, wL:-10,    parse:b=>(b[0]/1.28-100)},
  '0109':{name:'Brandstoftrim lang B2',unit:'%',   cat:'Brandstof',  min:-30, max:30,   wH:10, wL:-10,    parse:b=>(b[0]/1.28-100)},
  '010D':{name:'Voertuigsnelheid',     unit:'km/h',cat:'Rijden',     min:0,   max:280,                     parse:b=>b[0]},
  '0149':{name:'Gaspedaal positie',    unit:'%',   cat:'Rijden',     min:0,   max:100,                     parse:b=>(b[0]*100/255)},
  '0142':{name:'Accuspanning',         unit:'V',   cat:'Electrisch', min:8,   max:16,   wL:11.5, dL:10.5, parse:b=>((b[0]*256+b[1])/1000)},
  '0143':{name:'Abs. motorbelasting',  unit:'%',   cat:'Electrisch', min:0,   max:100,                     parse:b=>((b[0]*256+b[1])/655.35)},
  '015B':{name:'Hybride accu %',       unit:'%',   cat:'Electrisch', min:0,   max:100,                     parse:b=>(b[0]*100/255)},
  '0113':{name:'O2-sensoren aanwezig', unit:'',   cat:'Emissie',    min:0,   max:255,  bitmap:true,         parse:b=>b[0]},
  '0115':{name:'O2 sensor B1S2',       unit:'V',   cat:'Emissie',    min:0,   max:1.3,                     parse:b=>(b[0]/200)},
  '0117':{name:'O2 sensor B2S1',       unit:'V',   cat:'Emissie',    min:0,   max:1.3,                     parse:b=>(b[0]/200)},
  '0119':{name:'O2 sensor B2S2',       unit:'V',   cat:'Emissie',    min:0,   max:1.3,                     parse:b=>(b[0]/200)},
  '012C':{name:'EGR klep positie',     unit:'%',   cat:'Emissie',    min:0,   max:100,                     parse:b=>(b[0]*100/255)},
  '012D':{name:'EGR fout',             unit:'%',   cat:'Emissie',    min:-100,max:100,                     parse:b=>(b[0]/1.28-100)},
};

// ── PROTOCOLS (was index.html regel 9622) ──
window.PROTOCOLS =[
  {id:'6',name:'CAN 11-bit 500k (ISO 15765)',icon:'📡',desc:'Meeste auto\'s 2008+'},
  {id:'7',name:'CAN 29-bit 500k (ISO 15765)',icon:'📡',desc:'Sommige CAN varianten'},
  {id:'8',name:'CAN 11-bit 250k (ISO 15765)',icon:'📡',desc:'Langzame CAN'},
  {id:'9',name:'CAN 29-bit 250k (ISO 15765)',icon:'📡',desc:'Langzame CAN varianten'},
  {id:'3',name:'ISO 9141-2',                 icon:'📟',desc:'Oudere Europese auto\'s'},
  {id:'4',name:'ISO 14230 KWP (5baud)',       icon:'🔧',desc:'K-Line langzame init'},
  {id:'5',name:'ISO 14230 KWP (fast)',        icon:'🔧',desc:'K-Line snelle init'},
  {id:'1',name:'SAE J1850 PWM',              icon:'🔌',desc:'Oudere Ford modellen'},
  {id:'2',name:'SAE J1850 VPW',              icon:'🔌',desc:'Oudere GM modellen'},
];

// ── SAE_PID_NAMES (was index.html regel 10596) ──
window.SAE_PID_NAMES ={
  '04':'Motorbelasting berekend','05':'Koelvloeistof temp','06':'Korte trim bank1','07':'Lange trim bank1',
  '08':'Korte trim bank2','09':'Lange trim bank2','0A':'Brandstofdruk','0B':'Inlaatspruitstuk druk',
  '0C':'Motortoerental','0D':'Voertuigsnelheid','0E':'Ontstekingstiming','0F':'Inlaatlucht temp',
  '10':'Luchtmassa (MAF)','11':'Gasklep positie','12':'Secundaire lucht status','13':'O2 sensoren aanwezig',
  '14':'O2 sensor 1','15':'O2 sensor 2','16':'O2 sensor 3','17':'O2 sensor 4','1C':'OBD standaard',
  '1F':'Looptijd sinds start','21':'Afstand met MIL aan','22':'Brandstofrail druk (rel)','23':'Brandstofrail druk (dir)',
  '24':'O2 sensor 1 (breed)','2C':'EGR commando','2D':'EGR fout','2E':'Verdamping purge','2F':'Brandstofniveau',
  '30':'Warm-ups sinds wis','31':'Afstand sinds wis','32':'Verdampingsdruk','33':'Barometrische druk',
  '34':'O2 sensor 1 (lambda)','3C':'Katalysator temp B1S1','3D':'Katalysator temp B2S1','42':'Boordspanning',
  '43':'Absolute belasting','44':'Brandstof equivalentie','45':'Relatieve gasklep','46':'Omgevingstemp',
  '47':'Absolute gasklep B','49':'Gaspedaal positie D','4A':'Gaspedaal positie E','4C':'Commando gasklep',
  '4D':'Tijd met MIL aan','4E':'Tijd sinds wis','5C':'Motorolie temp','5E':'Brandstofverbruik','5F':'Emissie eis',
  '60':'Beschikbare PIDs 61-80','61':'Rijder koppelwens','62':'Werkelijk koppel','63':'Referentiekoppel',
  '64':'Motor koppeldata','65':'Hulpinputs','66':'MAF sensor B','67':'Koelwater temp sensor B',
  '68':'Inlaatlucht temp sensor B','69':'EGR commando B','6A':'EGR fout B','6D':'Turbo laaddruk A',
  '6E':'Turbo laaddruk B','70':'Boost druk sensor','75':'Turbo A RPM','76':'Turbo B RPM',
  '78':'Uitlaatgas temp B1S1','79':'Uitlaatgas temp B1S2','7A':'DPF B1','7B':'DPF B2',
  '7C':'DPF temp B1','7D':'DPF temp B2','80':'Beschikbare PIDs 81-A0',
  '8D':'Brandstof injectietiming','8E':'Motor koeling status',
  'A0':'Beschikbare PIDs A1-C0','A6':'Brandstof verbruik absoluut'
};

// ── ALL_PID_DEFS_EXT (was index.html regel 10735) ──
Object.assign(ALL_PID_DEFS,{
  '0101':{name:'Motorlampje (MIL)',      unit:'aan/uit',cat:'Emissie',  min:0,max:1,    parse:b=>((b[0]&0x80)?1:0)},
  '0103':{name:'Brandstofsysteem status',unit:'code',cat:'Brandstof',min:0,max:255,  parse:b=>b[0]},
  '0112':{name:'Secundaire lucht status',unit:'code',cat:'Emissie',  min:0,max:255,  parse:b=>b[0]},
  '0114':{name:'O2 sensor B1S1',         unit:'V',   cat:'Emissie',  min:0,max:1.3,  parse:b=>(b[0]/200)},
  '0116':{name:'Lambda B1S3 spanning',   unit:'V',   cat:'Emissie',  min:0,max:1.3,  parse:b=>(b[0]/200)},
  '0118':{name:'Lambda B2S1 spanning',   unit:'V',   cat:'Emissie',  min:0,max:1.3,  parse:b=>(b[0]/200)},
  '011A':{name:'Lambda B2S3 spanning',   unit:'V',   cat:'Emissie',  min:0,max:1.3,  parse:b=>(b[0]/200)},
  '011B':{name:'Lambda B2S4 spanning',   unit:'V',   cat:'Emissie',  min:0,max:1.3,  parse:b=>(b[0]/200)},
  '011C':{name:'OBD norm',               unit:'code',cat:'Overig',   min:0,max:255,  parse:b=>b[0]},
  '011E':{name:'PTO status',             unit:'code',cat:'Overig',   min:0,max:255,  parse:b=>b[0]},
  '011F':{name:'Motorlooptijd',          unit:'s',   cat:'Motor',    min:0,max:65535,parse:b=>(b[0]*256+b[1])},
  '0121':{name:'Afstand met MIL aan',    unit:'km',  cat:'Emissie',  min:0,max:65535,parse:b=>(b[0]*256+b[1])},
  '0122':{name:'Raildruk (relatief)',    unit:'kPa', cat:'Brandstof',min:0,max:5178, parse:b=>((b[0]*256+b[1])*0.079)},
  '0123':{name:'Raildruk (direct)',      unit:'kPa', cat:'Brandstof',min:0,max:655350,parse:b=>((b[0]*256+b[1])*10)},
  '0124':{name:'Lambda B1S1 (breedband)',unit:'λ',   cat:'Emissie',  min:0,max:2,    parse:b=>((b[0]*256+b[1])*2/65536)},
  '0125':{name:'Lambda B1S2 (breedband)',unit:'λ',   cat:'Emissie',  min:0,max:2,    parse:b=>((b[0]*256+b[1])*2/65536)},
  '0126':{name:'Lambda B1S3 (breedband)',unit:'λ',   cat:'Emissie',  min:0,max:2,    parse:b=>((b[0]*256+b[1])*2/65536)},
  '0128':{name:'Lambda B2S1 (breedband)',unit:'λ',   cat:'Emissie',  min:0,max:2,    parse:b=>((b[0]*256+b[1])*2/65536)},
  '012E':{name:'EVAP spoelklep',         unit:'%',   cat:'Emissie',  min:0,max:100,  parse:b=>(b[0]*100/255)},
  '0130':{name:'Warmlopen sinds wissen', unit:'x',   cat:'Overig',   min:0,max:255,  parse:b=>b[0]},
  '0131':{name:'Afstand sinds wissen',   unit:'km',  cat:'Overig',   min:0,max:65535,parse:b=>(b[0]*256+b[1])},
  '0132':{name:'EVAP dampdruk',          unit:'Pa',  cat:'Emissie',  min:-8192,max:8192,parse:b=>{const v=(b[0]<<8)|b[1];return (v>32767?v-65536:v)/4;}},
  '0134':{name:'Lambda B1S1 (stroom)',   unit:'λ',   cat:'Emissie',  min:0,max:2,    parse:b=>((b[0]*256+b[1])*2/65536)},
  '0135':{name:'Lambda B1S2 (stroom)',   unit:'λ',   cat:'Emissie',  min:0,max:2,    parse:b=>((b[0]*256+b[1])*2/65536)},
  '0138':{name:'Lambda B2S1 (stroom)',   unit:'λ',   cat:'Emissie',  min:0,max:2,    parse:b=>((b[0]*256+b[1])*2/65536)},
  '013C':{name:'Katalysator temp B1S1',  unit:'°C',  cat:'Temp',     min:-40,max:1200,wH:900,parse:b=>((b[0]*256+b[1])/10-40)},
  '013D':{name:'Katalysator temp B2S1',  unit:'°C',  cat:'Temp',     min:-40,max:1200,wH:900,parse:b=>((b[0]*256+b[1])/10-40)},
  '013E':{name:'Katalysator temp B1S2',  unit:'°C',  cat:'Temp',     min:-40,max:1200,wH:900,parse:b=>((b[0]*256+b[1])/10-40)},
  '013F':{name:'Katalysator temp B2S2',  unit:'°C',  cat:'Temp',     min:-40,max:1200,wH:900,parse:b=>((b[0]*256+b[1])/10-40)},
  '0141':{name:'Monitors deze rit',      unit:'code',cat:'Overig',   min:0,max:255,  parse:b=>b[0]},
  '0144':{name:'Lambda doelwaarde',      unit:'λ',   cat:'Emissie',  min:0,max:2,    parse:b=>((b[0]*256+b[1])*2/65536)},
  '0147':{name:'Absolute gasklep B',     unit:'%',   cat:'Motor',    min:0,max:100,  parse:b=>(b[0]*100/255)},
  '0148':{name:'Absolute gasklep C',     unit:'%',   cat:'Motor',    min:0,max:100,  parse:b=>(b[0]*100/255)},
  '014A':{name:'Gaspedaal positie D',    unit:'%',   cat:'Rijden',   min:0,max:100,  parse:b=>(b[0]*100/255)},
  '014B':{name:'Gaspedaal positie E',    unit:'%',   cat:'Rijden',   min:0,max:100,  parse:b=>(b[0]*100/255)},
  '014D':{name:'Tijd met MIL aan',       unit:'min', cat:'Emissie',  min:0,max:65535,parse:b=>(b[0]*256+b[1])},
  '014E':{name:'Tijd sinds wissen',      unit:'min', cat:'Overig',   min:0,max:65535,parse:b=>(b[0]*256+b[1])},
  '0151':{name:'Brandstoftype',          unit:'code',cat:'Brandstof',min:0,max:255,  parse:b=>b[0]},
  '0152':{name:'Ethanol percentage',     unit:'%',   cat:'Brandstof',min:0,max:100,  parse:b=>(b[0]*100/255)},
  '0159':{name:'Raildruk (absoluut)',    unit:'kPa', cat:'Brandstof',min:0,max:655350,parse:b=>((b[0]*256+b[1])*10)},
  '015A':{name:'Relatief gaspedaal',     unit:'%',   cat:'Rijden',   min:0,max:100,  parse:b=>(b[0]*100/255)},
  '015D':{name:'Injectietiming',         unit:'°',   cat:'Motor',    min:-210,max:302,parse:b=>(((b[0]*256+b[1])-26880)/128)},
  '0161':{name:'Gevraagd koppel',        unit:'%',   cat:'Motor',    min:-125,max:130,parse:b=>(b[0]-125)},
  '0162':{name:'Werkelijk koppel',       unit:'%',   cat:'Motor',    min:-125,max:130,parse:b=>(b[0]-125)},
  '0163':{name:'Referentiekoppel',       unit:'Nm',  cat:'Motor',    min:0,max:65535,parse:b=>(b[0]*256+b[1])},
  // ── Uitgebreide PID-database (PIDs 0164–01FF) — fix voor "PID 01XX raw" ──
  '0164':{name:'Motorvrijloop koppel',   unit:'%',   cat:'Motor',    min:-125,max:130,parse:b=>(b[0]-125)},
  // ── 2026-07-26 — CORRECTIE 0165-0168 (+ 016D, 0178, 0179 verderop) ──
  // Deze hele familie stond als "Uitlaatgas temp" met parse b[0]*256+b[1].
  // Dat klopt voor geen van allen. Het zijn J1979-BLOKKEN die beginnen met een
  // support-bitmap; de app las die bitmap als hoge databyte en schoof daarmee
  // alles één byte op. De uitkomst was telkens een geloofwaardig ogend getal,
  // en juist daarom viel het niemand op. De echte uitlaatgastemperatuur zit op
  // 0178/0179, niet hier.
  //
  // Aangetoond op de diagnosebundel van 26-07 (Mazda CX-5 2018, benzine):
  //   0165  RX 1040        oud: 376 °C "uitlaatgas"   → is een bitmap, geen sensor
  //   0167  RX 03 82 7F    oud: 49,8 °C "uitlaatgas"  → koelvloeistof 90 / 87 °C
  //   0168  RX 03 3D 43 …  oud: 43 °C "uitlaatgas"    → inlaatlucht 21 / 27 °C
  // 0166/0178/0179 zijn op dit voertuig niet ondersteund en dus NIET met
  // meetdata bevestigd — die volgen puur de J1979-structuur.
  //
  // Byte 0 is overal de bitmap die zegt wélke sensoren bestaan. Staat de bit
  // uit, dan geven we null terug in plaats van een verzonnen waarde.
  '0165':{name:'Aux in/uit ondersteund',  unit:'',   cat:'Status',   min:0,max:65535,parse:b=>(b[0]*256+b[1])},
  '0166':{name:'Massaluchtstroom sens.A', unit:'g/s',cat:'Motor',    min:0,max:2048, parse:b=>((b[0]&1)?((b[1]*256+b[2])/32):((b[0]&2)?((b[3]*256+b[4])/32):null))},
  '0167':{name:'Koelvloeistoftemp sens.', unit:'°C', cat:'Temp',     min:-40,max:215, parse:b=>((b[0]&1)?(b[1]-40):((b[0]&2)?(b[2]-40):null))},
  '0168':{name:'Inlaatluchttemp sensor',  unit:'°C', cat:'Temp',     min:-40,max:215, parse:b=>((b[0]&1)?(b[1]-40):((b[0]&2)?(b[2]-40):null))},
  '0169':{name:'Dieselroetfilter druk',  unit:'kPa', cat:'Emissie',  min:0,max:655,  parse:b=>((b[0]*256+b[1])*0.01)},
  '016A':{name:'Dieselroetfilter temp',  unit:'°C',  cat:'Temp',     min:-40,max:6513,parse:b=>(((b[0]*256+b[1])*0.1)-40)},
  '016B':{name:'DPF delta druk',         unit:'kPa', cat:'Emissie',  min:0,max:655,  parse:b=>((b[0]*256+b[1])*0.01)},
  '016C':{name:'EGR B tempsensor',       unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  // 016D is 11 bytes (zie PID_BYTE_LEN): bitmap + commanded/actual raildruk.
  // Bevestigd door de meting: b1..b2 en b3..b4 lopen strak parallel
  // (1000/1002 … 1743/1783), precies wat een gesloten regelkring doet, en
  // 10 kPa/bit geeft 10,0-17,4 MPa — normaal voor SkyActiv-G directe inspuiting.
  // Getoond wordt de WERKELIJKE druk; de gevraagde waarde zit in b1..b2.
  '016D':{name:'Brandstofraildruk',      unit:'MPa', cat:'Motor',    min:0,max:655,  parse:b=>((b[0]&1)?(((b[3]*256+b[4])*10)/1000):null)},
  '016E':{name:'Nox sensor A',           unit:'ppm', cat:'Emissie',  min:0,max:3212, parse:b=>((b[0]*256+b[1])*0.05)},
  '016F':{name:'Turbolader inlet druk',  unit:'kPa', cat:'Motor',    min:-350,max:514,parse:b=>(((b[0]*256+b[1])*0.03125)-350)},
  '0170':{name:'Turbolader A druk',      unit:'kPa', cat:'Motor',    min:0,max:500,  parse:b=>((b[0]*256+b[1])*0.03125)},
  '0171':{name:'Turbolader B druk',      unit:'kPa', cat:'Motor',    min:0,max:500,  parse:b=>((b[0]*256+b[1])*0.03125)},
  '0172':{name:'Turbo compressor outlet',unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '0173':{name:'Turbo luchtinlaat temp', unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '0174':{name:'EGR temperatuur B',      unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '0175':{name:'EGR fout B',             unit:'%',   cat:'Emissie',  min:-100,max:100,parse:b=>((b[0]-128)*100/128)},
  '0176':{name:'Injectiesysteem rail A', unit:'kPa', cat:'Brandstof',min:0,max:655350,parse:b=>((b[0]*256+b[1])*10)},
  '0177':{name:'Injectiesysteem rail B', unit:'kPa', cat:'Brandstof',min:0,max:655350,parse:b=>((b[0]*256+b[1])*10)},
  // 0178/0179 zijn de ECHTE uitlaatgastemperaturen (blok van 9 bytes: bitmap +
  // vier 16-bits waarden op 0,1 °C met -40 offset). 0178 = bank 1, 0179 = bank 2
  // — niet B1S3/B1S4 zoals hier stond. Op dit voertuig niet ondersteund, dus
  // niet met meetdata bevestigd.
  '0178':{name:'Uitlaatgastemp B1S1',    unit:'°C',  cat:'Temp',     min:-40,max:6513,parse:b=>((b[0]&1)?(((b[1]*256+b[2])*0.1)-40):null)},
  '0179':{name:'Uitlaatgastemp B2S1',    unit:'°C',  cat:'Temp',     min:-40,max:6513,parse:b=>((b[0]&1)?(((b[1]*256+b[2])*0.1)-40):null)},
  '017A':{name:'Uitlaatgas temp B2S3',   unit:'°C',  cat:'Temp',     min:-40,max:6513,parse:b=>(((b[0]*256+b[1])*0.1)-40)},
  '017B':{name:'Uitlaatgas temp B2S4',   unit:'°C',  cat:'Temp',     min:-40,max:6513,parse:b=>(((b[0]*256+b[1])*0.1)-40)},
  '017C':{name:'DPF temp B1',            unit:'°C',  cat:'Temp',     min:-40,max:6513,parse:b=>(((b[0]*256+b[1])*0.1)-40)},
  '017D':{name:'DPF temp B2',            unit:'°C',  cat:'Temp',     min:-40,max:6513,parse:b=>(((b[0]*256+b[1])*0.1)-40)},
  '017E':{name:'NOx NTE status',         unit:'code',cat:'Emissie',  min:0,max:255,  parse:b=>b[0]},
  '017F':{name:'PM NTE status',          unit:'code',cat:'Emissie',  min:0,max:255,  parse:b=>b[0]},
  '0180':{name:'Motor looptijd totaal',  unit:'s',   cat:'Motor',    min:0,max:4294967295,parse:b=>(((b[0]<<24)>>>0)+(b[1]<<16)+(b[2]<<8)+b[3])},
  '0181':{name:'MIL looptijd totaal',    unit:'min', cat:'Emissie',  min:0,max:4294967295,parse:b=>(((b[0]<<24)>>>0)+(b[1]<<16)+(b[2]<<8)+b[3])},
  '0182':{name:'Afstand MIL totaal',     unit:'km',  cat:'Emissie',  min:0,max:4294967295,parse:b=>(((b[0]<<24)>>>0)+(b[1]<<16)+(b[2]<<8)+b[3])},
  '0183':{name:'Afstand na wissen totaal',unit:'km', cat:'Overig',   min:0,max:4294967295,parse:b=>(((b[0]<<24)>>>0)+(b[1]<<16)+(b[2]<<8)+b[3])},
  '0184':{name:'Warmlopen totaal',       unit:'x',   cat:'Overig',   min:0,max:4294967295,parse:b=>(((b[0]<<24)>>>0)+(b[1]<<16)+(b[2]<<8)+b[3])},
  '0185':{name:'Continu MIL teller',     unit:'min', cat:'Emissie',  min:0,max:4294967295,parse:b=>(((b[0]<<24)>>>0)+(b[1]<<16)+(b[2]<<8)+b[3])},
  '0186':{name:'Continu afstand MIL',    unit:'km',  cat:'Emissie',  min:0,max:4294967295,parse:b=>(((b[0]<<24)>>>0)+(b[1]<<16)+(b[2]<<8)+b[3])},
  '0187':{name:'NOx sensor B1S1',        unit:'ppm', cat:'Emissie',  min:0,max:3212, parse:b=>((b[0]*256+b[1])*0.05)},
  '0188':{name:'NOx sensor B1S2',        unit:'ppm', cat:'Emissie',  min:0,max:3212, parse:b=>((b[0]*256+b[1])*0.05)},
  '0189':{name:'NOx sensor B2S1',        unit:'ppm', cat:'Emissie',  min:0,max:3212, parse:b=>((b[0]*256+b[1])*0.05)},
  '018A':{name:'NOx sensor B2S2',        unit:'ppm', cat:'Emissie',  min:0,max:3212, parse:b=>((b[0]*256+b[1])*0.05)},
  '018B':{name:'Brandstoftype systeem',  unit:'code',cat:'Brandstof',min:0,max:255,  parse:b=>b[0]},
  '018C':{name:'Dieselpartikelmassa',    unit:'mg',  cat:'Emissie',  min:0,max:655,  parse:b=>((b[0]*256+b[1])*0.01)},
  '018D':{name:'Motorlooptijd PTO',      unit:'s',   cat:'Motor',    min:0,max:4294967295,parse:b=>(((b[0]<<24)>>>0)+(b[1]<<16)+(b[2]<<8)+b[3])},
  '018E':{name:'NOx doseerpomp',         unit:'%',   cat:'Emissie',  min:0,max:100,  parse:b=>(b[0]*100/255)},
  '018F':{name:'AdBlue tank niveau',     unit:'%',   cat:'Emissie',  min:0,max:100,  parse:b=>(b[0]*100/255)},
  '0190':{name:'SCR efficiëntie',        unit:'%',   cat:'Emissie',  min:0,max:100,  parse:b=>(b[0]*100/255)},
  '0191':{name:'NOx reductie',           unit:'%',   cat:'Emissie',  min:0,max:100,  parse:b=>(b[0]*100/255)},
  '0192':{name:'PM sensor B1',           unit:'mg',  cat:'Emissie',  min:0,max:655,  parse:b=>((b[0]*256+b[1])*0.01)},
  '0193':{name:'PM sensor B2',           unit:'mg',  cat:'Emissie',  min:0,max:655,  parse:b=>((b[0]*256+b[1])*0.01)},
  '0194':{name:'WWH-OBD teller',         unit:'min', cat:'Overig',   min:0,max:65535,parse:b=>(b[0]*256+b[1])},
  '0195':{name:'NOx sensor corr. B1S1',  unit:'ppm', cat:'Emissie',  min:0,max:3212, parse:b=>((b[0]*256+b[1])*0.05)},
  '0196':{name:'NOx sensor corr. B2S1',  unit:'ppm', cat:'Emissie',  min:0,max:3212, parse:b=>((b[0]*256+b[1])*0.05)},
  '0197':{name:'Uitlaatgas stroom',      unit:'kg/h',cat:'Emissie',  min:0,max:655,  parse:b=>((b[0]*256+b[1])*0.01)},
  '0198':{name:'Turbo laaddruk A',       unit:'kPa', cat:'Motor',    min:0,max:500,  parse:b=>((b[0]*256+b[1])*0.03125)},
  '0199':{name:'Turbo laaddruk B',       unit:'kPa', cat:'Motor',    min:0,max:500,  parse:b=>((b[0]*256+b[1])*0.03125)},
  '019A':{name:'Turbo RPM A',            unit:'rpm', cat:'Motor',    min:0,max:655350,parse:b=>((b[0]*256+b[1])*10)},
  '019B':{name:'Turbo RPM B',            unit:'rpm', cat:'Motor',    min:0,max:655350,parse:b=>((b[0]*256+b[1])*10)},
  '019C':{name:'Turbo temp inlaat A',    unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '019D':{name:'Turbo temp inlaat B',    unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '019E':{name:'Turbo temp uitlaat A',   unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '019F':{name:'Turbo temp uitlaat B',   unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '01A0':{name:'Tussenkoeler temp A',    unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '01A1':{name:'Tussenkoeler temp B',    unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '01A2':{name:'EGR koeler temp B1',     unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '01A3':{name:'EGR koeler temp B2',     unit:'°C',  cat:'Temp',     min:-40,max:215,parse:b=>(b[0]-40)},
  '01A4':{name:'AdBlue injectiedruk',    unit:'kPa', cat:'Emissie',  min:0,max:655,  parse:b=>((b[0]*256+b[1])*0.01)},
  '01A5':{name:'Compressor inlaat druk', unit:'kPa', cat:'Motor',    min:0,max:500,  parse:b=>((b[0]*256+b[1])*0.03125)},
  '01A6':{name:'Brandstof verbruik abs', unit:'g/s', cat:'Brandstof',min:0,max:655,  parse:b=>((b[0]*256+b[1])*0.03125)}
});

// ── KERN_PIDS (was index.html regel 10861) ──
window.KERN_PIDS =['010C','010D','0105','0104','010B','0106','0107','0142','010F','0111'];

// ── STANDAARD_PIDS (was index.html regel 10911) ──
window.STANDAARD_PIDS =[
  // Motor
  '010C','010D','0104','0111','010B','010E','011F','0143',
  // Temperatuur
  '0105','015C','010F','0146',
  // Brandstof
  '0106','0107','0110','0114','0115','012F','015E','0134','0124',
  // Emissie & diagnose
  '0142','0121','012E','013C','0149','014C','0147',
  // Overig standaard
  '011C','0151','0133',
];

// ── PID_ALT_KANAAL — dezelfde grootheid, andere bron (27-07-2026) ──────
// Een aantal J1979-blokken meet iets wat óók een eigen standaard-PID heeft.
// Sinds de correctie van 0165-0168/016D leveren die blokken echte waarden op,
// en dan staan er ineens twee koelwatertemperaturen of twee raildrukken in
// beeld die net niet gelijk zijn — want het zijn andere sensoren, of dezelfde
// sensor via een ander kanaal van de ECU. Zonder markering lijkt dat een fout.
// Sleutel = het alternatieve kanaal, waarde = het standaard-PID ernaast.
window.PID_ALT_KANAAL = {
  '0166':'0110',   // massaluchtstroom sensor A  ←→ standaard MAF
  '0167':'0105',   // koelvloeistof sensorblok   ←→ standaard koelwatertemp
  '0168':'010F',   // inlaatlucht sensorblok     ←→ standaard inlaatluchttemp
  '016D':'0123',   // raildruk regelblok         ←→ standaard raildruk
  '0178':'013C',   // uitlaatgastemp bank 1      ←→ katalysatortemp B1S1
  '0179':'013D'    // uitlaatgastemp bank 2      ←→ katalysatortemp B2S1
};
// Korte omschrijving voor de tooltip.
window.pidAltKanaalTip = function(pid){
  try{
    const alt=(window.PID_ALT_KANAAL||{})[pid]; if(!alt) return '';
    const d=(window.ALL_PID_DEFS||{})[alt];
    return 'Ander kanaal: meet hetzelfde als '+alt+(d&&d.name?' ('+d.name+')':'')
         + '. Afwijkende waarden zijn normaal — het is een andere sensor of een andere uitleesweg.';
  }catch(e){ return ''; }
};

// ── PID_BYTE_LEN (was index.html regel 11049) ──
window.PID_BYTE_LEN ={
  // Volledige SAE J1979 mode-01 bytelengtes (00–80 + hogere bitmaps).
  // 2026-07-26 — CORRECTIE 6D/6E. PID 6D stond op 6 bytes, J1979 zegt 11.
  // Bewijs uit de eigen diagnosebundel (26-07, Mazda CX-5): op een losse
  // aanvraag "016D" antwoordt de ECU met ISO-TP lengte 0x00D = 13 bytes =
  // 1 (0x41) + 1 (0x6D) + 11 databytes. Precies passend. Met 6 verloor de
  // parser na 6D de synchronisatie en vond hij het VOLGENDE PID in dezelfde
  // batch niet meer: elke batch waarin 6D niet als laatste stond leverde een
  // valse "mist" op (4 van de 4 keer, o.a. 0168 zakte daardoor naar
  // kwaliteit 84 en liep risico als dood gesnoeid te worden). De backtracking
  // van route 1 kon dit niet repareren: die probeert alleen tabelwaarde, 1, 2
  // en 4 bytes — 11 zat er nooit bij. 6E is meegenomen (5 -> 9) op dezelfde
  // spec-grond; die is op dit voertuig niet in gebruik, dus preventief.
  // BELANGRIJK: ook bitmaps (00/20/40/60/80), status-PIDs (01/41) en de
  // O2-trim PIDs (53–58) horen erin. De batch-parser brak vroeger af op het
  // eerste ONBEKENDE PID-nummer en gooide dan de complete respons weg —
  // dat gaf valse "dips" (bv. 01414445, 01555659) die multi-PID onterecht
  // uitschakelden terwijl de data gewoon geldig binnenkwam.
  '00':4,'01':4,'02':2,'03':2,'04':1,'05':1,'06':1,'07':1,'08':1,'09':1,
  '0A':1,'0B':1,'0C':2,'0D':1,'0E':1,'0F':1,'10':2,'11':1,'12':1,'13':1,
  '14':2,'15':2,'16':2,'17':2,'18':2,'19':2,'1A':2,'1B':2,'1C':1,'1D':1,
  '1E':1,'1F':2,'20':4,'21':2,'22':2,'23':2,'24':4,'25':4,'26':4,'27':4,
  '28':4,'29':4,'2A':4,'2B':4,'2C':1,'2D':1,'2E':1,'2F':1,'30':1,'31':2,
  '32':2,'33':1,'34':4,'35':4,'36':4,'37':4,'38':4,'39':4,'3A':4,'3B':4,
  '3C':2,'3D':2,'3E':2,'3F':2,'40':4,'41':4,'42':2,'43':2,'44':2,'45':1,
  '46':1,'47':1,'48':1,'49':1,'4A':1,'4B':1,'4C':1,'4D':2,'4E':2,'4F':4,
  '50':4,'51':1,'52':1,'53':2,'54':2,'55':2,'56':2,'57':2,'58':2,'59':2,
  '5A':1,'5B':1,'5C':1,'5D':2,'5E':2,'5F':1,'60':4,'61':1,'62':1,'63':2,
  '64':5,'65':2,'66':5,'67':3,'68':7,'69':7,'6A':5,'6B':5,'6C':5,'6D':11,
  '6E':9,'6F':3,'70':9,'71':5,'72':5,'73':5,'74':5,'75':7,'76':7,'77':5,
  '78':9,'79':9,'7A':7,'7B':7,'7C':9,'7D':1,'7E':1,'7F':13,'80':4,'A0':4,'C0':4
};

// ── PLPidLen — zelfcorrigerende bytelengtes (2026-07-26) ──────────────
// De tabel hierboven is vanaf nu een STARTGOK, geen waarheid. Voertuigen
// wijken af (Mazda SkyActiv geeft PID 55/56 in 1 byte i.p.v. 2) en de tabel
// zelf kan fout staan (6D stond op 6, moest 11). Beide gevallen hebben
// dezelfde oplossing: de ECU vertelt in de ISO-TP lengte-indicator exact
// hoeveel bytes hij stuurt. splitBatchResponse() gebruikt dat als harde
// randvoorwaarde en meldt hier wat hij daadwerkelijk gemeten heeft.
//
// Betrouwbaarheid van een meting:
//   'solo'  = één PID gevraagd én lengte bekend → lengte = declared - 2.
//             Ondubbelzinnig, meteen geldig.
//   'batch' = afgeleid uit de lengtevergelijking van een batch. Sterk, maar
//             leunt op de tabelwaarde van de ándere PIDs in die batch →
//             pas geldig na 2 overeenstemmende waarnemingen.
// Alles wordt per voertuig bewaard (VIN, anders merk|model|jaar), zodat een
// andere auto nooit met andermans afwijkingen begint.
window.PLPidLen = (function(){
  var LEER={}, AFW={}, SLEUTEL=null;
  function sleutel(){
    try{
      var v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
      return v.vin || [v.merk,v.model,v.year].filter(Boolean).join('|') || null;
    }catch(e){ return null; }
  }
  function laad(){
    var k=sleutel(); if(!k||k===SLEUTEL) return;
    SLEUTEL=k; LEER={};
    try{ LEER=JSON.parse(localStorage.getItem('pl_pidlen_'+k)||'{}')||{}; }catch(e){ LEER={}; }
  }
  function bewaar(){
    if(!SLEUTEL) return;
    try{ localStorage.setItem('pl_pidlen_'+SLEUTEL, JSON.stringify(LEER)); }catch(e){}
  }
  return {
    // Gemeten lengte melden. Alleen aanroepen vanuit een parse die volledig
    // én exact op de opgegeven lengte uitkwam — anders leren we ruis aan.
    melden: function(suf, n, bron){
      suf=String(suf).toUpperCase();
      if(!(n>=1&&n<=64)) return;
      laad();
      var tbl=(window.PID_BYTE_LEN||{})[suf];
      if(tbl!=null && n!==tbl){
        AFW[suf]=AFW[suf]||{tabel:tbl,gemeten:n,n:0};
        AFW[suf].gemeten=n; AFW[suf].n++;
      }
      var e=LEER[suf];
      if(!e){ LEER[suf]={n:n, hits:1, bron:bron||'batch', conflict:0}; }
      else if(e.n===n){ e.hits++; if(bron==='solo') e.bron='solo'; }
      else {
        // Tegenspraak met wat we eerder maten. Eerder verving één afwijkende
        // solo-meting de opgeslagen waarde meteen én werd hij direct
        // vertrouwd — één verminkte respons vergiftigde die PID dan permanent.
        // Nu telt de tegenspraak mee en moet de nieuwe waarde opnieuw bevestigd
        // worden voor hij gebruikt wordt, ongeacht de bron.
        LEER[suf]={n:n, hits:1, bron:'batch', conflict:(e.conflict||0)+1};
      }
      bewaar();
    },
    // Geleerde lengte, of null als er nog te weinig bewijs is.
    lengte: function(suf){
      laad();
      var e=LEER[String(suf).toUpperCase()];
      if(!e) return null;
      // Na een eerdere tegenspraak nooit meer op één meting vertrouwen.
      if(e.conflict) return (e.hits>=2) ? e.n : null;
      return (e.bron==='solo' || e.hits>=2) ? e.n : null;
    },
    // Voor Busdiagnose: waar wijkt dit voertuig af van de tabel?
    afwijkingen: function(){
      return Object.keys(AFW).map(function(s){
        return {pid:'01'+s, tabel:AFW[s].tabel, gemeten:AFW[s].gemeten, n:AFW[s].n};
      });
    },
    geleerd: function(){ laad(); return JSON.parse(JSON.stringify(LEER)); },
    wis: function(){ LEER={}; AFW={}; bewaar(); }
  };
})();

// ── PLPidVorm — structuurverdenking (2026-07-26) ──────────────────────
// Bytelengte is objectief af te leiden uit de transportlaag (zie PLPidLen).
// BETEKENIS niet. 016D staat in deze app als "Afgastemp dieselfilter" met
// parse b[0]*256+b[1], terwijl de Mazda daar het J1979-regelblok "fuel
// pressure control system" op teruggeeft. Het resultaat is een geloofwaardig
// ogend getal (~140 °C) dat nergens op slaat en tóch in AI-rapporten belandt.
//
// Zoiets valt niet automatisch te CORRIGEREN, maar wel te WANTROUWEN. Twee
// goedkope structuursignalen die 016D er direct uitpikken:
//   A. byte 0 is over alle metingen constant terwijl er verderop wél variatie
//      zit → dat is een support-bitmap, geen meetwaarde.
//   B. de 16-bits paren (B,C) en (D,E) lopen strak parallel → commanded-
//      versus-actual, dus een regelblok en geen enkelvoudige sensor.
// Verdicht: markeren en melden. NIET automatisch herlabelen of wegfilteren —
// een sensor stilletjes uit een diagnose laten vallen op grond van een
// heuristiek is een ergere fout dan de fout die we opsporen.
window.PLPidVorm = (function(){
  var S={}, MIN=15, SLEUTEL=null;
  // Per voertuig, net als PLPidLen. Zonder deze sleutel liepen de byte-
  // statistieken van twee auto's in één sessie door elkaar heen — in een
  // werkplaats waar je achter elkaar aankoppelt is dat geen randgeval maar de
  // normale gang van zaken, en het levert onzinnige oordelen op.
  function check(){
    var k=null;
    try{
      var v=(typeof vehicleInfo!=='undefined'&&vehicleInfo)||{};
      k=v.vin || [v.merk,v.model,v.year].filter(Boolean).join('|') || null;
    }catch(e){}
    if(k && k!==SLEUTEL){ SLEUTEL=k; S={}; }
  }
  return {
    zie: function(pid, bytes){
      check();
      if(!bytes || bytes.length<3) return;
      // Drempel op 3 bytes, niet 5: PID 0167 is een blok van 3 (bitmap + twee
      // 1-byte temperaturen) en viel er anders doorheen. De 4-bytes lambda-
      // PIDs zijn wél echte scalars, en dáár staat de hoge byte van een
      // verhouding rond 1,00 bijna stil — die zouden vals alarm geven en
      // worden daarom overgeslagen.
      var nr=parseInt(String(pid).slice(2),16);
      if(bytes.length===4 && ((nr>=0x24&&nr<=0x2B)||(nr>=0x34&&nr<=0x3B))) return;
      var k=String(pid).slice(2).toUpperCase();
      var s=S[k];
      if(!s){ s=S[k]={n:0, kop:bytes[0], kopVast:true, varieert:false, paar:0, paarN:0, vorig:null}; }
      s.n++;
      if(bytes[0]!==s.kop) s.kopVast=false;
      if(s.vorig){
        for(var i=1;i<bytes.length && i<s.vorig.length;i++){
          if(bytes[i]!==s.vorig[i]){ s.varieert=true; break; }
        }
      }
      s.vorig=bytes.slice(0,12);
      var a=bytes[1]*256+bytes[2], b=bytes[3]*256+bytes[4];
      if(a>0 && b>0){ s.paarN++; if(Math.abs(a-b) <= 0.15*Math.max(a,b)) s.paar++; }
    },
    // Waarom verdacht, of null als er geen bezwaar is.
    reden: function(pid){
      var s=S[String(pid).slice(2).toUpperCase()];
      if(!s || s.n<MIN) return null;
      if(!(s.kopVast && s.varieert)) return null;
      var parallel = s.paarN>=MIN && (s.paar/s.paarN)>0.8;
      return parallel
        ? 'byte 0 constant (support-bitmap) + parallelle 16-bits paren → regelblok, geen enkelvoudige sensor'
        : 'byte 0 constant over alle metingen terwijl de rest varieert → waarschijnlijk een support-bitmap';
    },
    verdacht: function(){
      var uit=[], self=this;
      Object.keys(S).forEach(function(k){
        var r=self.reden('01'+k);
        if(r) uit.push({pid:'01'+k, n:S[k].n, reden:r});
      });
      return uit;
    },
    wis: function(){ S={}; }
  };
})();
// ── PID_PRESETS — voorinstellingen voor de PID-keuze (27-07-2026) ──────
// Bewust GEEN kleine setjes van drie sensoren: daar heb je in de praktijk
// niets aan, want je mist dan altijd de context om te zien of iets klopt.
// Elke voorinstelling is daarom "basis + focus": de tien kern-PIDs blijven
// altijd staan, en daar komt een blok bovenop dat bij de vraag past.
// Niet-ondersteunde PIDs worden er bij het toepassen uitgefilterd.
window.PID_PRESETS = [
  {id:'basis', naam:'Basis', tip:'De tien kernwaarden die je bij elke rit wilt zien.',
   extra:[]},
  {id:'plus', naam:'Basis plus', tip:'Kern plus de meest gebruikte extra sensoren — goed startpunt.',
   extra:['0110','010E','0143','015C','0146','0133','014C']},
  {id:'verbruik', naam:'Basis + focus verbruik', tip:'Alles wat meeweegt in brandstofverbruik en rijstijl.',
   extra:['0110','0166','015E','0123','016D','0162','0163','0145','0149','014C','012F','0131']},
  {id:'elektrisch', naam:'Basis + focus elektrisch', tip:'Boordnet, accu en aandrijving van EV of hybride.',
   extra:['0142','015B','015C','0165','015D','0170','018B','018C','0183','019A','019B','019C','019D']},
  {id:'motor', naam:'Basis + focus motor & belasting', tip:'Vullingsgraad, koppel en belasting onder alle omstandigheden.',
   extra:['0143','0144','0162','0163','0164','010E','0110','0166','0187','0170','010B','0133']},
  {id:'temp', naam:'Basis + focus temperatuur', tip:'Alle temperaturen die de app kan uitlezen, in één beeld.',
   extra:['0105','010F','0146','015C','0167','0168','013C','013D','013E','013F','0178','0179','016B','016A']},
  {id:'emissie', naam:'Basis + focus emissie & lambda', tip:'Brandstoftrim, lambda en nabehandeling — voor APK en storingzoeken.',
   extra:['0106','0107','0108','0109','0113','0114','0115','0124','0134','0135','012E','012F','013C','013D','0169','016A','016B','017C']},
  {id:'diesel', naam:'Basis + focus diesel & roetfilter', tip:'Raildruk, EGR en roetfilter — alleen zinvol op een diesel.',
   extra:['0123','016D','0169','016A','016B','016C','017C','0178','0179','0187','015E']}
];

// ── PID_POLL_CLASS (was index.html regel 11209) ──
window.PID_POLL_CLASS ={
  // ⚡ SNEL (120ms) — verandert continu, wil je vloeiend zien
  '0C':120,'0D':120,'11':120,'04':120,'49':120,'45':120,'5A':120,
  // 🔴 SNEL-MEDIUM (300ms) — druk/lucht/timing
  '0B':300,'10':300,'0A':300,'0E':300,'22':300,'23':300,'59':300,
  // 🟠 MEDIUM (1s) — trims, lambda, verbruik
  '06':1000,'07':1000,'08':1000,'09':1000,'13':1000,'14':1000,'15':1000,
  '24':1000,'34':1000,'44':1000,'5E':1000,'2C':1000,
  // 🟡 TRAAG (10s) — temperaturen
  '05':10000,'0F':10000,'5C':10000,'46':10000,'3C':10000,'3D':10000,'33':10000,
  // 🟢 ZELDEN (60s) — peil, tellers, spanning(ECU-stabiel)
  '2F':60000,'42':30000,'31':60000,'21':60000,'30':60000,'1F':30000,
};

// ── DEMO_VEHICLES (was index.html regel 11435) ──
window.DEMO_VEHICLES ={
  benzine:    {merk:'Mazda',      model:'CX-5',    year:'2018', brandstof:'Benzine',    motor:'2.0 SkyActiv-G 165pk', vin:'JM3KFBCL8J0123456'},
  diesel:     {merk:'Volkswagen', model:'Passat',  year:'2017', brandstof:'Diesel',     motor:'2.0 TDI 150pk',        vin:'WVWZZZ3CZHE000000'},
  hybride:    {merk:'Toyota',     model:'Prius',   year:'2019', brandstof:'Hybride',    motor:'1.8 VVT-i Hybrid',     vin:'JTDKB3FUXG3000000'},
  elektrisch: {merk:'Tesla',      model:'Model 3', year:'2021', brandstof:'Elektrisch', motor:'EV Long Range',        vin:'5YJ3E1EA7MF000000'},
};

// ── DEMO_CARS (was index.html regel 11479) ──
window.DEMO_CARS =[
  { merk:'Mazda',      model:'CX-5',  year:'2018', brandstof:'benzine', vin:'JM3KFBCL8J0123456', wmi:'JM3', motortype:'2.0 SkyActiv-G 165pk', icon:'🚙' },
  { merk:'Volkswagen', model:'Golf',  year:'2017', brandstof:'benzine', vin:'WVWZZZAUZHW123456', wmi:'WVW', motortype:'1.4 TSI 125pk',        icon:'🚗' },
  { merk:'Toyota',     model:'Yaris', year:'2019', brandstof:'hybride', vin:'VNKKD3D310A123456', wmi:'VNK', motortype:'1.5 Hybrid 100pk',     icon:'🚕' },
  { merk:'Volvo',      model:'V40',   year:'2016', brandstof:'diesel',  vin:'YV1MV7431G2123456', wmi:'YV1', motortype:'D2 120pk',             icon:'🚘' },
];

// ── ANALYSE_PID_SETS (was index.html regel 11810) ──
window.ANALYSE_PID_SETS = {
  totaal:  ['010C','010D','0105','015C','0104','010B','010F','0110','0111',
             '0106','0107','0114','0124','010A','015E','012F','0142'],
  monteur: ['010C','010D','0105','015C','0104','010B','0110','0106','0107',
             '0114','0124','010A','010E','012F','0142'],
  dtc:     ['010C','0105','0104','0142'],
  koop:    ['010C','010D','0105','015C','0104','010B','0110','0106','0107',
             '0114','0124','010A','015E','012F','0142','013C'],
  rit:     ['010C','010D','0105','015C','0104','010B','010F','0110','0111',
             '0106','0107','0114','0124','010A','015E','012F','0142','010E','012C'],
};

// ── AUTO_KENNIS (was index.html regel 11946) ──
window.AUTO_KENNIS = {
  // Elk zwak-punt: [tekst, brandstof] — brandstof: 'diesel'|'benzine'|null (null = alle/onbekend)
  'volkswagen': {zwak:[['EGR-klep vervuiling (TDI)','diesel'],['DPF-regeneratie problemen','diesel'],['distributieketting-spanner (1.2/1.4 TSI)','benzine'],['timing chain rek','benzine'],['waterpomp lekkage',null]],pids:['0106','0107','016B','016D','0105'],let_op:'1.4 TSI tot ±2014: ketting-spanner; TDI: roetfilter + EGR.'},
  'audi':       {zwak:[['olieverbruik (2.0 TFSI EA888)','benzine'],['distributieketting (2.0 TFSI)','benzine'],['DPF/EGR (TDI)','diesel'],['carbon-opbouw inlaatkleppen',null]],pids:['0106','0107','010B','016B'],let_op:'2.0 TFSI EA888 gen2: berucht olieverbruik via zuigerveren.'},
  'skoda':      {zwak:[['EGR/DPF (TDI)','diesel'],['TSI ketting-spanner','benzine'],['DSG-mechatronic',null]],pids:['0106','0107','016B'],let_op:'Deelt motoren met VW/Audi — zelfde aandachtspunten.'},
  'seat':       {zwak:[['TSI ketting','benzine'],['DPF (TDI)','diesel'],['DSG',null]],pids:['0106','0107','016B'],let_op:'VAG-platform, zie VW.'},
  'bmw':        {zwak:[['koelsysteem (waterpomp/thermostaat)',null],['VANOS-magneetkleppen','benzine'],['timing chain (N47 diesel)','diesel'],['DISA-klep','benzine'],['olielekkage kleppendeksel',null]],pids:['0105','010E','010C','0142'],let_op:'N47 diesel: ketting achterzijde motor, dure reparatie. Controleer koelwatertemp-gedrag.'},
  'mercedes':   {zwak:[['balanceer-as (M272)','benzine'],['roestkettingstrekker',null],['luchtvering',null],['injectoren (CDI diesel)','diesel'],['EGR-koeler','diesel']],pids:['0105','0106','0107','016B'],let_op:'CDI diesel: injector-lektest via trims; let op koelwatertemp.'},
  'toyota':     {zwak:[['hybride accu-degradatie','hybride'],['EGR-vervuiling (diesel)','diesel'],['olieverbruik oudere 1.8 VVT-i','benzine'],['inverterkoeling','hybride']],pids:['015B','0105','0142','0106'],let_op:'Hybride: check SoC + inverter-temp. Laat verbrandingsmotor meelopen bij meting.'},
  'mazda':      {zwak:[['inlaatklep-vervuiling (SkyActiv-D diesel)','diesel'],['DPF kortritten','diesel'],['roest wielkasten oudere modellen',null],['breedband-lambda B1S1',null]],pids:['0124','0134','0106','016B'],let_op:'SkyActiv-D: gevoelig voor kortritten/DPF. B1S1 = breedband (0124), niet 0113.'},
  'ford':       {zwak:[['EcoBoost koelvloeistof-verlies (1.0)','benzine'],['DPF (TDCi)','diesel'],['waterpomp intern (1.0 EcoBoost)','benzine'],['versnellingsbak PowerShift',null]],pids:['0105','0106','016B','0142'],let_op:'1.0 EcoBoost: interne waterpomp kan koelvloeistof in olie brengen.'},
  'opel':       {zwak:[['distributieketting (1.4 Turbo)','benzine'],['thermostaat',null],['waterpomp',null],['EGR (CDTi)','diesel']],pids:['0105','010C','0106'],let_op:'1.4 Turbo: ketting-rek geeft P-codes; controleer timing.'},
  'renault':    {zwak:[['injectoren (dCi diesel)','diesel'],['EGR-klep','diesel'],['DPF','diesel'],['turbo-actuator',null]],pids:['0106','0107','016B','0170'],let_op:'dCi: injector-codering + EGR. PSA/Renault diesel gevoelig voor kortritten.'},
  'peugeot':    {zwak:[['distributieketting (1.2 PureTech)','benzine'],['EGR/DPF (HDi)','diesel'],['AdBlue-systeem','diesel'],['olieslib 1.2 PureTech','benzine']],pids:['0106','016B','01A4','0105'],let_op:'1.2 PureTech: ketting met natte riem — controleer olie + timing.'},
  'citroen':    {zwak:[['1.2 PureTech ketting/riem','benzine'],['HDi DPF','diesel'],['AdBlue (BlueHDi)','diesel'],['ophanging',null]],pids:['0106','016B','01A4'],let_op:'Deelt motoren met Peugeot — zelfde PureTech/HDi aandachtspunten.'},
  'volvo':      {zwak:[['PCV-systeem (oudere 5-cil)',null],['DPF (diesel)','diesel'],['PHEV accu-balancering','hybride'],['turbo',null]],pids:['0106','016B','015B','0170'],let_op:'PHEV (XC60/XC90): laat verbrandingsmotor meedraaien voor volledige meting.'}
};

// ── HUD_LABEL_DICT (was index.html regel 12763) ──
window.HUD_LABEL_DICT ={
  'brandstoftrim':'B.TRIM','brandstof':'BRANDST','koelvloeistof':'KOELVLST',
  'koelvloeistoftemp':'KOELTEMP','temperatuur':'TEMP','temp':'TEMP',
  'inlaatlucht':'INLAAT','inlaat':'INLAAT','aanzuiglucht':'AANZUIG',
  'absolute':'ABS','absoluut':'ABS','motorbelasting':'MOTORBELAST',
  'belasting':'BELAST','gasklep':'GASKLEP','gaspedaal':'GASPED',
  'toerental':'RPM','snelheid':'SNELH','barometerdruk':'BARO',
  'inlaatdruk':'INL.DRUK','luchtmassa':'MAF','luchtstroom':'MAF',
  'ontstekingstiming':'TIMING','timing':'TIMING','lambda':'LAMBDA',
  'breedband':'BREEDB','smalband':'SMALB','zuurstofsensor':'O2-SENS',
  'accuspanning':'ACCU','spanning':'SPANNING','voltage':'VOLT',
  'dieselroetfilter':'DPF','dieselpartikel':'DPF','adblue':'ADBLUE',
  'katalysator':'KAT','uitlaat':'UITLAAT','afgas':'AFGAS',
  'afgastemp':'AFGASTEMP','olietemp':'OLIETEMP','olie':'OLIE',
  'verbruik':'VERBR','bank':'B','positie':'POS','niveau':'NIVEAU',
  'kort':'K','lang':'L','status':'STAT','systeem':'SYS','sensor':'SENS',
  'druk':'DRUK','motor':'MOTOR','turbo':'TURBO','compressor':'COMPR',
};

/* ════════════════════════════════════════════════════════════════════
   PID_TEKST — PIDs die géén meetwaarde zijn maar een CODE of BITVLAG.
   (toegevoegd 2026-07-22)

   Een sparkline of een cijfer van 32px is verspilde ruimte bij zulke PIDs:
   "Brandstoftype 4" zegt niemand iets, "Brandstoftype · Diesel" wel. Deze
   tabel vertaalt de ruwe code naar gewone woorden; de live view zet ze in
   een compact tekstblok in plaats van in een tegel.

   vast:true  → verandert niet tijdens een sessie (brandstoftype, OBD-norm)
   vast:false → wel een code/vlag, maar kan wisselen tijdens het rijden
                (brandstofsysteem open/gesloten lus, motorlampje)
   map        → directe code→woord vertaling
   fn         → decoder voor bitvlaggen/samengestelde waarden

   Bewust ADDITIEF: de bestaande PID-definities blijven ongewijzigd, dit is
   een aparte opzoektabel. Een PID hier toevoegen is genoeg om hem uit de
   tegelweergave te halen.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  // SAE J1979 PID 51/8B — brandstoftype
  const BRANDSTOF = {
    0:'Niet opgegeven', 1:'Benzine', 2:'Methanol', 3:'Ethanol', 4:'Diesel',
    5:'LPG', 6:'CNG (aardgas)', 7:'Propaan', 8:'Elektrisch',
    9:'Bifuel — rijdt op benzine', 10:'Bifuel — rijdt op methanol',
    11:'Bifuel — rijdt op ethanol', 12:'Bifuel — rijdt op LPG',
    13:'Bifuel — rijdt op CNG', 14:'Bifuel — rijdt op propaan',
    15:'Bifuel — rijdt elektrisch', 16:'Bifuel — elektrisch + verbranding',
    17:'Hybride benzine', 18:'Hybride ethanol', 19:'Hybride diesel',
    20:'Hybride elektrisch', 21:'Hybride — elektrisch + verbranding',
    22:'Hybride regeneratief', 23:'Bifuel — rijdt op diesel'
  };
  // SAE J1979 PID 1C — welke OBD-norm de auto volgt
  const OBDNORM = {
    1:'OBD-II (Californië ARB)', 2:'OBD (federaal EPA)', 3:'OBD en OBD-II',
    4:'OBD-I', 5:'Niet OBD-compliant', 6:'EOBD (Europa)', 7:'EOBD en OBD-II',
    8:'EOBD en OBD', 9:'EOBD, OBD en OBD-II', 10:'JOBD (Japan)',
    11:'JOBD en OBD-II', 12:'JOBD en EOBD', 13:'JOBD, EOBD en OBD-II',
    17:'EMD', 18:'EMD+', 19:'HD OBD-C (zwaar transport)', 20:'HD OBD',
    21:'WWH OBD', 23:'HD EOBD-I', 24:'HD EOBD-I N', 25:'HD EOBD-II',
    26:'HD EOBD-II N', 28:'OBDBr-1 (Brazilië)', 29:'OBDBr-2',
    30:'KOBD (Korea)', 31:'IOBD I (India)', 32:'IOBD II', 33:'HD EOBD-IV'
  };
  // Bitvlaggen → lijstje woorden. Geen enkele vlag gezet = null.
  function vlaggen(v, tabel){
    const uit=[];
    Object.keys(tabel).forEach(bit=>{ if(v & Number(bit)) uit.push(tabel[bit]); });
    return uit.length ? uit.join(' · ') : null;
  }
  // O2-sensoren aanwezig (PID 13): bit 0-3 = bank 1 sensor 1-4, bit 4-7 = bank 2
  function o2Bank2x4(v){
    const b1=[],b2=[];
    for(let i=0;i<4;i++){ if(v&(1<<i)) b1.push(i+1); }
    for(let i=4;i<8;i++){ if(v&(1<<i)) b2.push(i-3); }
    const d=[];
    if(b1.length) d.push('bank 1: sensor '+b1.join(', '));
    if(b2.length) d.push('bank 2: sensor '+b2.join(', '));
    return d.length ? d.join(' · ') : null;
  }
  // O2-sensoren aanwezig (PID 1D): 2 sensoren per bank, 4 banken
  function o2Bank4x2(v){
    const d=[];
    for(let bank=0;bank<4;bank++){
      const s=[];
      if(v&(1<<(bank*2)))   s.push(1);
      if(v&(1<<(bank*2+1))) s.push(2);
      if(s.length) d.push('bank '+(bank+1)+': sensor '+s.join(', '));
    }
    return d.length ? d.join(' · ') : null;
  }

  window.PID_TEKST = {
    // ── Vast: verandert niet tijdens een sessie ──
    '0151':{ vast:true,  map:BRANDSTOF },
    '018B':{ vast:true,  map:BRANDSTOF },
    '011C':{ vast:true,  map:OBDNORM },
    '0113':{ vast:true,  fn:o2Bank2x4, leeg:'Geen O2-sensoren gemeld' },
    '011D':{ vast:true,  fn:o2Bank4x2, leeg:'Geen O2-sensoren gemeld' },
    // ── Code/vlag, maar kan wisselen tijdens het rijden ──
    '0101':{ vast:false, map:{0:'Uit', 1:'AAN — motorlampje brandt'} },
    '0103':{ vast:false, leeg:'Geen status gemeld', fn:v=>vlaggen(v,{
              1:'Open lus — motor nog te koud',
              2:'Gesloten lus — O2-regeling actief',
              4:'Open lus — vollast of gas los',
              8:'Open lus — systeemstoring',
              16:'Gesloten lus — storing in de regelkring'}) },
    '0112':{ vast:false, leeg:'Geen status gemeld', fn:v=>vlaggen(v,{
              1:'Naar uitlaat (upstream)',
              2:'Na katalysator (downstream)',
              4:'Uit / naar buitenlucht',
              8:'Naar inlaat (diagnose)'}) },
    '011E':{ vast:false, map:{0:'Uit', 1:'Actief'} }
  };

  /* Staat deze PID in het tekstblok in plaats van in een tegel? */
  window.pidIsTekst = function(pid){
    return !!(window.PID_TEKST && window.PID_TEKST[pid]);
  };
  /* Ruwe waarde → gewone woorden. Altijd een string, nooit null. */
  window.pidTekstWaarde = function(pid, val){
    const t = window.PID_TEKST && window.PID_TEKST[pid];
    if(!t) return null;
    if(val===undefined || val===null || (typeof val==='number' && isNaN(val))) return '—';
    const n = Math.round(Number(val));
    if(!isFinite(n)) return '—';
    if(typeof t.fn==='function'){
      let r=null; try{ r=t.fn(n); }catch(e){}
      return r || t.leeg || ('code '+n);
    }
    if(t.map && t.map[n]!==undefined) return t.map[n];
    return 'onbekende code ('+n+')';
  };
})();


/* ═══════════════════════════════════════════════════════════════════
   PLBus — ÉÉN SLOT OP DE OBD-BUS   (fase 1)
   ───────────────────────────────────────────────────────────────────
   Waarom: de fast-lane poll-loop én een handvol losse lezers (verificatie,
   gezondheidscheck, rit-sweep, veldlab-survey, monitor, remote) duwden
   allemaal commando's in dezelfde seriële _btQueue. De scheduler liep dan
   seconden achter en ÁLLE PIDs werden tegelijk stale — precies het patroon
   uit de veldlogs. Het oude window._pollBusy was een kale boolean: iedere
   houder zette 'm in z'n finally op false, dus houder B gaf het slot van
   houder A vrij.
   Nu: echt slot met eigenaar + token. Alleen wie het token heeft mag
   vrijgeven. Een houder die langer dan MAX_HOLD_MS blijft hangen wordt
   afgebroken (noodrem, geen deadlock). window._pollBusy blijft als spiegel
   bestaan zodat oude checks blijven werken.
   Extra: pausedTotal() telt hoeveel ms de bus door NIET-poll-eigenaren
   bezet was. De stale-watchdog trekt dat eraf, zodat tegels niet rood
   knipperen tijdens een sweep die ze zelf veroorzaakt.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const S={
  owner:null, token:0, since:0, seq:1,
  pausedTotal:0, pauseStart:0, wildSinds:0,
  tx:0, ok:0, bad:0, msSom:0, msN:0,
  perPid:Object.create(null),
  reqTot:0, reqOnvol:0,      // requests totaal / met ontbrekende PIDs
  batchGroep:3, batchGoed:0,
  hist:[]
};
const nu=()=>Date.now();
function diag(m,l){ try{ if(typeof btDiag==='function') btDiag(m,l||'info'); }catch(e){} }

window.PLBus={
  MAX_HOLD_MS:180000,      // 3 min: daarna geldt een houder als vastgelopen
  LEGACY_MAX_MS:10000,     // verweesde window._pollBusy: na 10s negeren

  claim(naam){
    if(S.owner){
      if(nu()-S.since>this.MAX_HOLD_MS){
        diag('Busslot van "'+S.owner+'" hing '+Math.round((nu()-S.since)/1000)+'s — afgebroken door '+naam,'warn');
        this._release(S.token,true);
      } else return 0;
    }
    // Legacy-houder die window._pollBusy zelf zette (module die ik gemist heb).
    // MET noodrem: zonder eigenaar grijpt de MAX_HOLD_MS-check hierboven niet,
    // dus een verweesde true zou de bus permanent dichtzetten — precies het
    // geval waarvoor die check bestaat, en juist daar werkte hij niet. Nu
    // wordt het moment van signaleren onthouden en na LEGACY_MAX_MS de vlag
    // weggegooid: één module die zich misdraagt mag de hele bus niet gijzelen.
    if(!S.owner && window._pollBusy===true){
      if(!S.wildSinds){ S.wildSinds=nu(); diag('window._pollBusy staat aan zonder eigenaar — noodrem loopt','warn'); return 0; }
      if(nu()-S.wildSinds < this.LEGACY_MAX_MS) return 0;
      diag('Verweesde _pollBusy stond '+Math.round((nu()-S.wildSinds)/1000)+'s aan — genegeerd door '+naam,'warn');
      window._pollBusy=false; S.wildSinds=0;
    } else if(S.wildSinds){ S.wildSinds=0; }
    S.owner=naam||'?'; S.token=++S.seq; S.since=nu();
    if(S.owner!=='poll') S.pauseStart=S.since;
    window._pollBusy=true;
    return S.token;
  },

  release(tok){ return this._release(tok,false); },

  _release(tok,forceer){
    if(!S.owner) return false;
    if(!forceer && tok!==S.token) return false;   // niet jouw slot → niet vrijgeven
    if(S.owner!=='poll' && S.pauseStart) S.pausedTotal += nu()-S.pauseStart;
    S.pauseStart=0; S.owner=null; S.token=0; S.since=0;
    window._pollBusy=false;
    return true;
  },

  /* Wacht netjes op het slot. Geeft 0 terug als het niet lukt binnen maxMs —
     de aanroeper gaat dan tóch door (functionaliteit boven discipline). */
  async wait(naam,maxMs){
    const t0=nu(), lim=(maxMs===undefined?4000:maxMs);
    for(;;){
      const t=this.claim(naam);
      if(t) return t;
      if(nu()-t0>lim){ diag('Bus niet vrij voor "'+naam+'" na '+lim+'ms (houder: '+(S.owner||'?')+') — gaat tóch door','warn'); return 0; }
      await new Promise(r=>setTimeout(r,50));
    }
  },

  busy(){ return !!S.owner; },
  owner(){ return S.owner; },
  heldMs(){ return S.owner?(nu()-S.since):0; },
  pausedTotal(){ return S.pausedTotal + (S.pauseStart?(nu()-S.pauseStart):0); },
  breek(reden){
    if(S.owner) diag('Busslot geforceerd vrij ('+reden+'), was van "'+S.owner+'"','warn');
    this._release(0,true); S.pausedTotal=0; S.pauseStart=0;
  },

  /* ── telemetrie (voedt het busdiagnose-scherm) ── */
  note(cmd,ms,bad){
    S.tx++; if(bad) S.bad++; else S.ok++;
    if(ms>0){ S.msSom+=ms; S.msN++; }
    S.hist.push({t:nu(),ms:ms||0,bad:!!bad});
    if(S.hist.length>400) S.hist.splice(0,S.hist.length-400);
    // Let op: de per-PID boekhouding zat hier met een regex die ALLEEN losse
    // commando's matchte (/^01xx1?$/). Batches als "016D68" vielen er dus
    // buiten — en omdat vrijwel alles in batches gaat, telde perPid maar een
    // fractie mee en bleef `mis` structureel op 0 staan. Dát is de reden dat
    // de 6D-desync maanden onzichtbaar bleef: hij verscheen in geen enkele
    // KPI. De boekhouding staat nu in notePids(), die vanuit de pollus wordt
    // aangeroepen met de volledige gevraagd/gekregen-vergelijking.
  },

  /* Per-PID telemetrie op basis van wat er GEVRAAGD en GEKREGEN is.
     `gevraagd` = array PIDs in deze request, `gekregen` = object uit
     splitBatchResponse. Werkt voor batches én voor groepen van één. */
  notePids(gevraagd, ms, gekregen){
    if(!Array.isArray(gevraagd)||!gevraagd.length) return;
    const per=Math.round((ms||0)/gevraagd.length);
    let ontbrak=0;
    for(const p of gevraagd){
      const e=S.perPid[p]||(S.perPid[p]={n:0,msSom:0,mis:0});
      if(gekregen && (p in gekregen)){ e.n++; e.msSom+=per; }
      else { e.mis++; ontbrak++; }
    }
    // Een respons waarin gevraagde PIDs ontbreken is niet per se een
    // TRANSPORTfout (een niet-ondersteunde PID hoort er ook niet in), dus dit
    // gaat NIET in `bad`/foutPct. Wel in een eigen teller, zodat een
    // systematische parse-desync zichtbaar wordt zonder de foutgraad te
    // vervuilen.
    S.reqTot++; if(ontbrak) S.reqOnvol++;
  },
  stats(){
    const t=nu(), w=S.hist.filter(h=>t-h.t<10000);
    const n=w.length, badN=w.filter(h=>h.bad).length;
    const msSom=w.reduce((a,h)=>a+h.ms,0);
    const bezet=Math.min(100,Math.round(msSom/100));   // 10s venster → % bustijd
    return {
      totaal:S.tx, ok:S.ok, bad:S.bad,
      gemMs: S.msN?Math.round(S.msSom/S.msN):0,
      venGemMs: n?Math.round(msSom/n):0,
      perSec: +(n/10).toFixed(1),
      foutPct: n?Math.round(badN/n*100):0,
      belasting: bezet,
      batchGroep:S.batchGroep,
      reqTot:S.reqTot, reqOnvol:S.reqOnvol,
      onvolPct: S.reqTot?Math.round(S.reqOnvol/S.reqTot*100):0,
      perPid:S.perPid
    };
  },
  resetStats(){
    S.tx=S.ok=S.bad=S.msSom=S.msN=0; S.reqTot=S.reqOnvol=0;
    S.perPid=Object.create(null); S.hist=[];
    // Ook de geleerde bytelengtes en structuurverdenkingen wissen: die horen
    // bij dít voertuig en deze sessie. Zonder deze weg terug bleef een eenmaal
    // verkeerd geleerde lengte permanent in localStorage staan.
    try{ window.PLPidLen && window.PLPidLen.wis(); }catch(e){}
    try{ window.PLPidVorm && window.PLPidVorm.wis(); }catch(e){}
  },

  /* ── adaptieve batchgrootte (fase 2) ── */
  batchGroep(){ return S.batchGroep; },
  batchKleiner(){
    S.batchGoed=0;
    if(S.batchGroep>1){ S.batchGroep--; diag('Multi-PID groep verkleind naar '+S.batchGroep,'warn'); return true; }
    return false;
  },
  batchGroter(){
    if(S.batchGroep>=3) return false;
    if(++S.batchGoed<25) return false;
    S.batchGoed=0; S.batchGroep++; diag('Multi-PID groep terug omhoog naar '+S.batchGroep,'ok'); return true;
  },
  batchReset(){ S.batchGroep=3; S.batchGoed=0; }
};

/* Handige wrapper: alles binnen fn() draait met de bus geclaimd. */
window.withBus=async function(naam,fn,maxWachtMs){
  const tok=await window.PLBus.wait(naam,maxWachtMs);
  try{ return await fn(); }
  finally{ if(tok) window.PLBus.release(tok); }
};
})();

/* ═══════════════════════════════════════════════════════════════════
   POLL_PROFIELEN — pollstrategie per situatie   (fase 3)
   ───────────────────────────────────────────────────────────────────
   Eén universeel tempo werkt niet: de accucheck wil 0142 elke halve
   seconde, terwijl de rit-monitor juist een rustige bus wil zodat de
   ECU-buffers gelezen kunnen worden. mult = globale vermenigvuldiger op
   álle intervallen; ovr = harde override per PID-suffix (ms).
   ═══════════════════════════════════════════════════════════════════ */
window.POLL_PROFIELEN={
  basis:   {label:'Basis',       emoji:'⚖️', mult:1.0,  ovr:{}, desc:'Standaardtempo'},
  live:    {label:'Live view',   emoji:'📊', mult:0.85, ovr:{'0C':120,'0D':120,'11':120,'04':150},
            desc:'Vloeiende tegels — toeren/snelheid/gas voorop'},
  expert:  {label:'Expert',      emoji:'🔬', mult:1.0,  ovr:{}, desc:'Alles bevraagbaar, geen inperking'},
  monitor: {label:'Rit-monitor', emoji:'🔔', mult:1.4,  ovr:{'0C':250,'0D':250,'05':5000,'42':5000},
            desc:'Bus rustig houden zodat de ECU-buffers ruimte krijgen'},
  caravan: {label:'Caravan',     emoji:'🚐', mult:1.1,  ovr:{'0C':200,'0D':200,'04':300,'10':400,'05':5000,'5C':10000},
            desc:'Belasting/koeling voorop, rest rustig'},
  accu:    {label:'Accucheck',   emoji:'🔋', mult:1.2,  ovr:{'42':500,'0C':300,'04':1000,'05':10000},
            desc:'Accuspanning snel, motorcontext traag'},
  rustig:  {label:'Rustig',      emoji:'🐢', mult:2.2,  ovr:{}, desc:'Voor trage adapters of kieskeurige ECU\u2019s'}
};

/* Welke analyse kiest automatisch welk pollprofiel? */
window.ANALYSE2POLL={ basis:'basis', brandstof:'basis', emissie:'basis',
                      rit:'monitor', totaal:'basis', accu:'accu' };

/* ═══════════════════════════════════════════════════════════════════
   SITUATIES — rijomstandigheden / bijzonderheden   (build 2026-07-26)
   ───────────────────────────────────────────────────────────────────
   Een analyse is alleen bruikbaar als hij de situatie van de auto kent.
   Veel verbruik met een caravan achter de auto is geen defect maar een
   natuurwet; koelmarge en laaddruk zijn op dat moment juist wél kritisch.
   Per situatie leggen we daarom twee dingen vast:
     verwacht  → verschijnselen die logisch zijn en NIET als defect mogen
                 worden gepresenteerd (mogen het stoplicht niet verlagen)
     focus     → waar de AI juist strenger op moet oordelen
   De gebruiker zet deze vlaggen aan bij de auto-gegevens; ze worden per
   voertuig bewaard en verlopen automatisch (zie SITUATIE_TTL_MS).
   ═══════════════════════════════════════════════════════════════════ */
window.SITUATIE_TTL_MS = 12*60*60*1000;   // 12 uur; daarna automatisch uit

window.SITUATIES = [
  { id:'caravan', icon:'🚐', label:'Caravan / aanhanger', zwaar:true,
    veld:{ key:'sitKg', lbl:'Gewicht aanhanger', ph:'bv. 1300 kg' },
    verwacht:[
      'fors hoger brandstofverbruik — met caravan/aanhanger ligt l/100 km al snel 40–80% boven normaal',
      'hoge berekende motorbelasting (60–95%) en langdurig vollastbedrijf, ook op vlak terrein',
      'hogere inlaatdruk/laaddruk (MAP/boost) en hogere MAF-waarden bij dezelfde snelheid',
      'hoger toerental: de auto schakelt later op en eerder terug',
      'hogere koelvloeistof-, olie- en uitlaatgastemperatuur; koelventilator draait vaker of continu',
      'tragere acceleratie en een lagere gemiddelde snelheid'
    ],
    focus:[
      'koelmarge: blijft de koelvloeistoftemperatuur onder duurbelasting STABIEL, of klimt hij door? Doorklimmen is wél een echte bevinding',
      'olietemperatuur en, bij een automaat, transmissietemperatuur',
      'laadspanning onder de extra verbruikers van de aanhanger (verlichting, koelkast)',
      'bij turbo: houdt de laaddruk zijn waarde vast onder vollast of zakt hij weg (wastegate, lek, verstopte intercooler)?',
      'bij benzine: terugname van de ontstekingsvervroeging door de klopregeling onder vollast',
      'bij diesel: roetlading van het DPF en of een regeneratie kan afronden',
      'beoordeel brandstoftrim op DEELLAST, niet op de vollastmomenten met de aanhanger'
    ]},

  { id:'beladen', icon:'📦', label:'Zwaar beladen / vol', zwaar:true,
    veld:{ key:'sitPax', lbl:'Belading', ph:'bv. 5 personen + bagage' },
    verwacht:[
      'hoger brandstofverbruik (grofweg 10–30% afhankelijk van gewicht en terrein)',
      'hogere motorbelasting bij optrekken en op hellingen; langere acceleratietijden',
      'iets hogere koelvloeistof- en olietemperatuur bij duurbelasting',
      'lager schakelpunt / hoger toerental bij dezelfde snelheid'
    ],
    focus:[
      'temperatuurgedrag onder duurbelasting: stabiliseren of doorklimmen',
      'laadspanning wanneer er veel verbruikers aan hangen',
      'rem- en koelgedrag bij afdalingen (niet volledig via OBD2 meetbaar — benoem dit als handmatige controle)',
      'bandenspanning en ophanging horen bij deze belading handmatig gecontroleerd te worden; presenteer dat als advies, niet als meting'
    ]},

  { id:'dakkoffer', icon:'🎿', label:'Dakkoffer / fietsendrager',
    verwacht:[
      'boven ± 90 km/u een 10–25% hoger verbruik door luchtweerstand',
      'hogere motorbelasting op de snelweg bij gelijke snelheid',
      'meer windgeruis — geen technische klacht'
    ],
    focus:[
      'de verbruiksafwijking hoort SNELHEIDSAFHANKELIJK te zijn. Is het verbruik ook bij lage snelheid of stationair verhoogd, dan ligt de oorzaak in de techniek en niet in de dakbelading — zeg dat expliciet'
    ]},

  { id:'berg', icon:'⛰️', label:'Bergachtig / veel klimmen', zwaar:true,
    verwacht:[
      'lange vollastperiodes met hoge belasting en hoge temperaturen',
      'momentaan verbruik zeer hoog tijdens klimmen en vrijwel nul tijdens afdalen (overrun-afsluiting)',
      'op hoogte lagere absolute luchtdruk: lagere MAF- en MAP-waarden en minder vermogen bij atmosferisch aangezogen motoren',
      'een turbomotor werkt op hoogte harder om dezelfde laaddruk te halen'
    ],
    focus:[
      'koelmarge tijdens de klim en hoe snel de temperatuur daarna herstelt',
      'motorrem/terugschakelgedrag bij afdaling (remmen zijn niet via OBD2 te meten — benoem als handmatige controle)',
      'klopregeling en uitlaatgastemperatuur onder langdurige vollast',
      'laaddrukopbouw op hoogte'
    ]},

  { id:'snelweg', icon:'🛣️', label:'Lange snelwegrit / hoge snelheid',
    verwacht:[
      'constante duurbelasting van grofweg 40–70%',
      'hoger verbruik boven ± 120 km/u',
      'stabiel hoge koelvloeistof- en olietemperatuur'
    ],
    focus:[
      'temperatuurstabiliteit over langere tijd, niet één momentopname',
      'laadspanning en accuconditie tijdens langdurig rijden',
      'trillings- of geluidsklachten zijn hier snelheidsafhankelijk; koppel ze aan de gemeten snelheid'
    ]},

  { id:'stad', icon:'🏙️', label:'Stadsverkeer / korte ritten',
    verwacht:[
      'hoog verbruik per 100 km en veel stationair-tijd',
      'de motor komt mogelijk niet of laat op bedrijfstemperatuur',
      'de accu laadt onvoldoende bij, zeker met veel start-stop'
    ],
    focus:[
      'bij diesel: roetlading van het DPF en niet-afgeronde regeneraties — dit is bij dit rijprofiel de belangrijkste kandidaat',
      'accuconditie en laadbalans',
      'stationaire loopkwaliteit en misfire-telling bij stationair',
      'werking van de koelventilator bij stilstand'
    ]},

  { id:'koud', icon:'❄️', label:'Koud weer / koude start',
    verwacht:[
      'verrijking en afwijkende korte-termijn brandstoftrim tot de motor bedrijfswarm is',
      'verhoogd stationair toerental en trage opwarming',
      'hoger verbruik en een lagere accuspanning tijdens het starten'
    ],
    focus:[
      'bereikt de motor überhaupt bedrijfstemperatuur? Blijft hij steken, dan is de thermostaat de eerste verdachte',
      'de spanningsdip tijdens het starten',
      'beoordeel brandstoftrim, lambda en emissiegerelateerde waarden pas als de motor aantoonbaar bedrijfswarm is'
    ]},

  { id:'hitte', icon:'🌡️', label:'Hitte / hoge buitentemperatuur',
    verwacht:[
      'hogere koelvloeistof- en inlaatluchttemperatuur',
      'koelventilator die vaker of continu draait',
      'de airco belast de motor extra en verhoogt het verbruik'
    ],
    focus:[
      'hoe dicht zit de koelvloeistoftemperatuur bij het ingrijppunt en houdt hij zich daar',
      'werking en inschakelmoment van de koelventilator',
      'hoge inlaatluchttemperatuur bij turbo wijst op beperkte intercoolerwerking'
    ]},

  { id:'airco', icon:'🧊', label:'Airco / verwarming continu aan',
    verwacht:[
      '5–10% hoger brandstofverbruik',
      'hogere stationaire belasting en een licht verhoogd stationair toerental',
      'sprongen in belasting en toerental doordat de aircocompressor in- en uitschakelt'
    ],
    focus:[
      'die sprongen in belasting/toerental zijn compressorschakelingen — presenteer ze NIET als misfire of als een onrustig stationair toerental',
      'koelvloeistoftemperatuur bij stilstand met de airco aan'
    ]},

  { id:'lpg', icon:'⛽', label:'LPG / CNG-installatie',
    verwacht:[
      'de brandstoftrim van de benzine-ECU kan tijdens gasbedrijf structureel afwijken (vaak positief)',
      'verbruikswaarden die uit MAF of injectietijd worden afgeleid kloppen niet in l/100 km tijdens gasbedrijf',
      'licht afwijkende lambda-regeling'
    ],
    focus:[
      'beoordeel brandstoftrim en lambda alleen als de auto aantoonbaar op benzine loopt; zeg er anders bij dat het oordeel niet betrouwbaar is',
      'klepspeling en klepslijtage zijn bij LPG een bekend aandachtspunt',
      'presenteer verbruikscijfers uit de app hier nadrukkelijk niet als hard feit'
    ]},

  { id:'tuning', icon:'🔧', label:'Chiptuning / softwareaanpassing',
    verwacht:[
      'hogere laaddruk dan de fabrieksspecificatie',
      'afwijkende brandstoftrim en een hogere uitlaatgastemperatuur',
      'hogere belasting- en koppelwaarden dan standaard'
    ],
    focus:[
      'standaardreferentiewaarden gelden hier niet zonder meer — benoem dat expliciet bij elk oordeel',
      'klopregeling, uitlaatgastemperatuur en koelmarge onder vollast',
      'duurzaamheid van koppeling, automaat en turbo bij het verhoogde koppel'
    ]}
];
