// ════════════════════════════════════════
// config.js — Constanten, API key, PID database
// ════════════════════════════════════════

// ── API KEY ──
// Plak hier je Anthropic API key voor de demo:
window.DEMO_API_KEY = '';  // ← 'sk-ant-api03-...'

// Google Sheets logging URL (optioneel)
// Zie README.md voor setup instructies
window.SHEETS_LOG_URL = '';

// App versie
window.APP_VERSION = '2.0.0';

// ── PID HARD LIMITS ──
window.PID_HARD_LIMITS = {
  '010C':{min:0,   max:8000},  // RPM
  '010D':{min:0,   max:280},   // Snelheid
  '0105':{min:-20, max:130},   // Koelwater °C
  '015C':{min:-20, max:160},   // Olie temp
  '0104':{min:0,   max:100},   // Belasting %
  '0111':{min:0,   max:100},   // Gasklep %
  '010B':{min:10,  max:255},   // Inlaatdruk kPa
  '010F':{min:-40, max:80},    // IAT °C
  '012F':{min:0,   max:100},   // Brandstofpeil %
  '0110':{min:0,   max:500},   // MAF g/s
  '0142':{min:8,   max:16},    // Spanning V
  '0106':{min:-30, max:30},    // STFT %
  '0107':{min:-30, max:30},    // LTFT %
  '015E':{min:0,   max:40},    // Verbruik L/h
  '010E':{min:-15, max:60},    // Timing °
  '0113':{min:0,   max:1.3},   // O2 V
  '0115':{min:0,   max:1.3},
  '012C':{min:0,   max:100},   // EGR %
  '0149':{min:0,   max:100},   // Gaspedaal %
  '010A':{min:0,   max:700},   // Brandstofdruk kPa
  '0146':{min:-40, max:60},    // Omgevingstemperatuur
};

// ── VOLLEDIGE PID DATABASE ──
window.ALL_PID_DEFS = {
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
  '0113':{name:'O2 sensor B1S1',       unit:'V',   cat:'Emissie',    min:0,   max:1.3,                     parse:b=>(b[0]/200)},
  '0115':{name:'O2 sensor B1S2',       unit:'V',   cat:'Emissie',    min:0,   max:1.3,                     parse:b=>(b[0]/200)},
  '0117':{name:'O2 sensor B2S1',       unit:'V',   cat:'Emissie',    min:0,   max:1.3,                     parse:b=>(b[0]/200)},
  '0119':{name:'O2 sensor B2S2',       unit:'V',   cat:'Emissie',    min:0,   max:1.3,                     parse:b=>(b[0]/200)},
  '012C':{name:'EGR klep positie',     unit:'%',   cat:'Emissie',    min:0,   max:100,                     parse:b=>(b[0]*100/255)},
  '012D':{name:'EGR fout',             unit:'%',   cat:'Emissie',    min:-100,max:100,                     parse:b=>(b[0]/1.28-100)},
};

// ── DTC DATABASE ──
window.DTCDB = {
  P0171:{desc:'Systeem te mager (bank 1)',       body:'Vacuümlek, MAF sensor, brandstofpomp of injector.',    sev:'med'},
  P0172:{desc:'Systeem te rijk (bank 1)',        body:'Lekkende injector, defecte O2 sensor of hoge brandstofdruk.', sev:'med'},
  P0300:{desc:'Willekeurige ontsteking gemist',  body:'Bougies, bobines en brandstofdruk controleren.',       sev:'high'},
  P0301:{desc:'Cilinder 1 ontsteking gemist',    body:'Bougie, bobine of injector cilinder 1.',               sev:'high'},
  P0302:{desc:'Cilinder 2 ontsteking gemist',    body:'Bougie, bobine of injector cilinder 2.',               sev:'high'},
  P0420:{desc:'Katalysator efficiëntie laag',    body:'Versleten kat, defecte O2 sensor na-kat.',             sev:'med'},
  P0011:{desc:'Nokkenas te vroeg (intake B1)',   body:'VVT solenoïde, oliepeil, kettingspanning.',            sev:'high'},
  P0087:{desc:'Brandstofdruk te laag',           body:'Brandstofpomp, filter of drukregelaar.',               sev:'high'},
  P0101:{desc:'MAF circuit buiten bereik',       body:'Vuile/defecte MAF, luchtfilter of vacuümlek.',         sev:'med'},
  P0128:{desc:'Koelant temp te laag',            body:'Thermostaat vast open of defect.',                     sev:'low'},
  P0217:{desc:'Motor oververhitting',            body:'Waterpomp, thermostaat of radiateur.',                 sev:'high'},
  B1318:{desc:'Accu spanning laag',              body:'Accu, alternator of lekstroom.',                       sev:'med'},
  U0100:{desc:'Communicatie PCM verloren',       body:'CAN-bus bedrading of PCM voeding.',                    sev:'high'},
};

// ── VOERTUIG MODELLEN ──
window.MODELS = {
  Ford:['Focus','Fiesta','Mondeo','Kuga','Puma','Transit','Ranger'],
  Volkswagen:['Golf','Polo','Passat','Tiguan','T-Roc','ID.3','ID.4'],
  BMW:['1 Serie','3 Serie','5 Serie','X1','X3','X5','M3'],
  Mercedes:['A-Klasse','C-Klasse','E-Klasse','GLA','GLC','GLE'],
  Audi:['A3','A4','A6','Q3','Q5','Q7'],
  Opel:['Astra','Corsa','Insignia','Mokka'],
  Peugeot:['208','308','2008','3008'],
  Renault:['Clio','Megane','Captur','Zoe'],
  Toyota:['Yaris','Corolla','RAV4','Prius'],
  Skoda:['Fabia','Octavia','Superb','Karoq'],
  Seat:['Ibiza','Leon','Ateca'],
  Hyundai:['i20','i30','Tucson','Kona'],
  Kia:['Picanto','Ceed','Sportage','EV6'],
  Volvo:['V60','XC40','XC60','XC90'],
  Nissan:['Juke','Qashqai','X-Trail','Leaf'],
  Mazda:['Mazda2','Mazda3','Mazda6','CX-5','CX-30','MX-5'],
  Citroën:['C3','C4','Berlingo'],
  Fiat:['500','Panda','Tipo'],
  Honda:['Jazz','Civic','CR-V'],
};

// ── TREND GROEPEN ──
window.TREND_GROUPS = {
  fuel: { name:'Brandstof', icon:'⛽', pids:['0106','0107','0110','015E','012F','010A'], colors:['#1a6fff','#00a86b','#f77f00','#7c3aed','#e53e3e','#d4a017'] },
  power:{ name:'Vermogen',  icon:'⚡', pids:['010C','0104','0111','010B','010E','0149'], colors:['#1a6fff','#00a86b','#f77f00','#7c3aed','#e53e3e','#d4a017'] },
  accu: { name:'Accu',      icon:'🔋', pids:['0142','0104','010C','015B'],              colors:['#1a6fff','#f77f00','#00a86b','#7c3aed'] },
  temp: { name:'Temperatuur',icon:'🌡️',pids:['0105','015C','010F','0146'],              colors:['#e53e3e','#f77f00','#1a6fff','#00a86b'] },
};

// ── RIT ANALYSE FASES ──
window.RIT_FASEN = [
  {naam:'Motor & Vermogen',    icon:'⚡', duur:120, pids:['010C','0104','0111','010B','010E'], desc:'RPM, belasting, gasklep, inlaatdruk, timing'},
  {naam:'Brandstof & Emissie', icon:'⛽', duur:120, pids:['0106','0107','0110','0113','0115'], desc:'Brandstoftrim, MAF, O2 sensoren'},
  {naam:'Temperatuur',         icon:'🌡️', duur:60,  pids:['0105','015C','010F','0146'],        desc:'Koelwater, olie, inlaatlucht, omgevingstemperatuur'},
  {naam:'Accu & Electrisch',   icon:'🔋', duur:60,  pids:['0142','0104','010C'],               desc:'Spanning, belasting onder belasting'},
  {naam:'Rijgedrag',           icon:'🚗', duur:120, pids:['010D','0149','010C','0104'],         desc:'Snelheid, gaspedaal, acceleratie patronen'},
  {naam:'Alles tegelijk',      icon:'📊', duur:120, pids:['010C','010D','0105','0142','0106','0107','0110'], desc:'Combinatie voor correlaties'},
];
