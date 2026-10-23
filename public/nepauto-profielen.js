// ═══════════════════════════════════════════════════════════════════
// nepauto-profielen.js — de nagebouwde auto's voor PLNepAuto (#541)
// ───────────────────────────────────────────────────────────────────
// DATA, GEEN CODE. Gegenereerd op 22-10-2026 uit:
//   • OBDb (github.com/OBDb/<Merk-Model>, tests/test_cases/<jaar>/
//     command_support.yaml): per bouwjaar de mode-01 PIDs die een échte
//     auto aanbood, per ECU. De ECU-sleutel zegt ook het protocol: 7E0 =
//     CAN 11-bit, DB33/DA01 = CAN 29-bit, C233 = KWP2000, 686A = ISO 9141.
//     7DF-regels (alleen op de rondvraag gezien) zijn bij de motor gevoegd.
//   • Ircama/ELM327-emulator, scenario "car": een opname van een Toyota
//     Auris hybride — elke waarde, mode 06, 0904/0906/0908/090A en de
//     hybride-ECU 7EA komen van de auto zelf.
//
// WAT ER NIET GEMETEN IS, en dus aangenomen:
//   • de waarden bij de OBDb-auto's: OBDb bewaart welke PIDs er zijn, niet
//     wat ze zeggen. Ze komen uit STATIONAIR in nepauto.js (warm, stationair).
//   • de ECU-adressen bij 29-bit (18DAF110; de Golf 2026 heeft DA01 en dus
//     18DAF101), de opvulbyte per merk, de foutcodes, en de VIN's (WMI en
//     modeljaarteken kloppen, de rest is nul).
//   • de UDS-codes bij golf16 en p208 (22-10-2026): code, adres en
//     omrekening uit OBDb (Volkswagen-Golf, Peugeot-208), de waarden niet.
//   • de diesel: OBDb komt uit de VS en heeft vrijwel geen diesels. De set
//     van "mercdiesel" is de enige met een dieselvingerafdruk (0123, geen
//     O2, geen ontsteking) — het bouwjaar is daar onzeker.
//   • of een niet-CAN-ECU een meer-PID-vraag negeert (hier: NO DATA).
// ═══════════════════════════════════════════════════════════════════
'use strict';
const PL_NEPAUTO_PROFIELEN = [
 {
  "id": "cx5",
  "naam": "Mazda CX-5 2018 (controle: op deze auto is de test goed)",
  "merk": "Mazda",
  "model": "CX-5",
  "jaar": 2018,
  "brandstof": "benzine",
  "proto": "6",
  "vin": "JMZKFGWLA00100001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 02 03 04 05 06 07 08 09 0B 0C 0D 0E 0F 10 11 13 15 19 1C 1F 21 23 2E 2F 30 31 32 33 34 3C 3D 41 42 43 44 45 46 47 49 4A 4C 51 55 56 59 62 63 67 68 6D 8E 9D 9E"
   },
   {
    "adres": "7E9",
    "naam": "TCM-Transmission",
    "pids": "01 04 05 0C 0D 0F 11 1C 1F 21 30 31 41 42 49"
   }
  ],
  "bron": "OBDb Mazda-CX-5 2018",
  "pad": "00"
 },
 {
  "id": "golf16",
  "naam": "Volkswagen Golf 2016 (TSI, DSG)",
  "merk": "Volkswagen",
  "model": "Golf",
  "jaar": 2016,
  "brandstof": "benzine",
  "proto": "6",
  "vin": "WVWZZZAUZGW000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 12 13 14 15 1C 1F 21 23 24 2E 2F 30 31 33 34 3C 41 42 43 44 45 46 47 49 4A 4C 4F 67 69"
   },
   {
    "adres": "7E9",
    "naam": "TCM-Transmission",
    "pids": "01 04 05 0C 0D 41 42 49"
   },
   {
    "adres": "77A",
    "tx": "710",
    "naam": "Accu (OBDb 710>77A)",
    "pids": "",
    "did": {
     "222A0C": "4B",
     "222A07": "21 34"
    }
   },
   {
    "adres": "77D",
    "tx": "713",
    "naam": "ABS (OBDb 713>77D)",
    "pids": "",
    "did": {
     "221821": "00 00 01 E2 40",
     "221800": "00 00"
    }
   }
  ],
  "bron": "OBDb Volkswagen-Golf 2016",
  "pad": "AA",
  "turbo": true,
  "dtc": {
   "03": [],
   "07": [
    "P0299"
   ]
  }
 },
 {
  "id": "octavia21",
  "naam": "Skoda Octavia 2021 (vier ECU's op 0100, mild hybride)",
  "merk": "Skoda",
  "model": "Octavia",
  "jaar": 2021,
  "brandstof": "benzine",
  "proto": "6",
  "vin": "TMBJJ7NX0M0000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 12 13 14 15 18 19 1C 1F 21 22 24 2C 2E 2F 30 31 33 34 3C 41 42 43 44 45 46 47 49 4A 4C 51 54 56 59 5B 5E 62 63 65 67 68 6D 70 8E 9A 9D 9E A6"
   },
   {
    "adres": "7E9",
    "naam": "TCM-Transmission",
    "pids": "01 04 05 07 09 0A 0C 0D 0F 14 18 19 1D 22 41 42 49"
   },
   {
    "adres": "7EC",
    "pids": "01 04 05 0C 0D 41 42 49"
   },
   {
    "adres": "7ED",
    "pids": "01 04 05 0C 0D 41 42 49 5B 9A"
   }
  ],
  "bron": "OBDb Skoda-Octavia 2021",
  "pad": "AA",
  "turbo": true
 },
 {
  "id": "corolla21",
  "naam": "Toyota Corolla 2021 hybride (motor uit, hybride-ECU 7EA)",
  "merk": "Toyota",
  "model": "Corolla",
  "jaar": 2021,
  "brandstof": "hybride",
  "proto": "6",
  "vin": "NMTBZ3BE00R000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 13 15 1C 1F 21 24 2E 2F 30 31 33 34 3C 3E 41 42 43 44 45 46 47 49 4A 4C 4D 4E 51 55 56 5B 62 63 69 6D 8E 9D 9E A6"
   },
   {
    "adres": "7EA",
    "naam": "HV-HybridControl",
    "pids": "41 42 46 49 4A 4D 4E 5B 65 9A A6"
   },
   {
    "adres": "7EE",
    "pids": "01",
    "m09": false
   }
  ],
  "bron": "OBDb Toyota-Corolla 2021",
  "pad": "00",
  "motorUit": true
 },
 {
  "id": "auris",
  "naam": "Toyota Auris hybride (echte opname, alle antwoorden van de auto zelf)",
  "merk": "Toyota",
  "model": "Auris",
  "jaar": 2014,
  "brandstof": "hybride",
  "proto": "6",
  "vin": "SB1ZS3JE00E000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 13 15 1C 1F 21 24 2C 2D 2E 2F 30 31 32 33 34 3C 3E 42 43 44 45 47 4C 4D 4E 51",
    "waarden": {
     "03": "0000",
     "04": "FF",
     "05": "5F",
     "06": "80",
     "07": "79",
     "0B": "26",
     "0C": "145F",
     "0D": "0A",
     "0E": "75",
     "0F": "39",
     "10": "181F",
     "11": "2B",
     "13": "03",
     "15": "07FF",
     "1C": "06",
     "1F": "0075",
     "21": "0000",
     "24": "7BA865D9",
     "2C": "00",
     "2D": "80",
     "2E": "00",
     "2F": "AA",
     "30": "04",
     "31": "0032",
     "32": "0000",
     "33": "61",
     "34": "7AF97FF1",
     "3C": "159A",
     "3E": "02B9",
     "42": "394B",
     "43": "0054",
     "44": "7E71",
     "45": "19",
     "47": "92",
     "4C": "71",
     "4D": "0000",
     "4E": "005B",
     "51": "01"
    },
    "opname": {
     "0600": "4600C0000001",
     "0601": "46018E0B022700A94DBA01918D019D00B4022F",
     "0602": "4602070B0088000000D602080B02F9024903E3028F8603C200001AE0",
     "0620": "462080008001",
     "0621": "4621A98602E502D07FFF",
     "0631": "4631BD1707470063FFFF",
     "0640": "464000000001",
     "0660": "466000000001",
     "0680": "468000000001",
     "06A0": "46A0F8000000",
     "06A1": "46A10B2400000000FFFFA10C2400000000FFFF",
     "06A2": "46A20B2400000000FFFFA20C2400000000FFFF",
     "06A3": "46A30B2400000000FFFFA30C2400000000FFFF",
     "06A4": "46A40B2400000000FFFFA40C2400000000FFFF",
     "06A5": "46A50B2400000000FFFFA50C2400000000FFFF",
     "0901": "490101",
     "0903": "490301",
     "0904": "4904023331324A36303030000000000000000041343730313030300000000000000000",
     "0906": "4906026953CD4B611F6EF2",
     "0908": "4908140018009A00110018000000000014001800000000001C00180000000000000000000C001800000000",
     "090A": "490A0145434D002D456E67696E65436F6E74726F6C0000"
    },
    "m06": true
   },
   {
    "adres": "7EA",
    "naam": "HV-HybridControl",
    "pids": "04 0B 5B",
    "waarden": {
     "5B": "95"
    }
   }
  ],
  "bron": "Ircama/ELM327-emulator, scenario car (opname Toyota Auris Hybrid)",
  "pad": "00"
 },
 {
  "id": "p208",
  "naam": "Peugeot 208 2019 (PureTech turbo, MIL aan)",
  "merk": "Peugeot",
  "model": "208",
  "jaar": 2019,
  "brandstof": "benzine",
  "proto": "6",
  "vin": "VF3CCHNSFKT000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 13 14 15 1C 1F 21 23 2C 2D 2E 30 31 33 34 3C 42 44 46 47 49 4A 4C 4D 4E 4F 50 51 72"
   },
   {
    "adres": "682",
    "tx": "6A2",
    "naam": "BSI (OBDb 6A2>682)",
    "pids": "",
    "did": {
     "22D49C": "01 E2 40",
     "22D402": "00 00"
    }
   }
  ],
  "bron": "OBDb Peugeot-208 2019",
  "pad": "55",
  "turbo": true,
  "dtc": {
   "03": [
    "P0420"
   ],
   "07": [
    "P0171"
   ],
   "0A": [
    "P0420"
   ]
  }
 },
 {
  "id": "p308",
  "naam": "Peugeot 308 2016",
  "merk": "Peugeot",
  "model": "308",
  "jaar": 2016,
  "brandstof": "benzine",
  "proto": "6",
  "vin": "VF3LBHNYHGS000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 13 15 1C 1F 21 23 2E 30 31 33 3C 42 44 47 49 4A 4C"
   }
  ],
  "bron": "OBDb Peugeot-308 2016",
  "pad": "55"
 },
 {
  "id": "focus06",
  "naam": "Ford Focus 2006 (vroege CAN, geen 0A)",
  "merk": "Ford",
  "model": "Focus",
  "jaar": 2006,
  "brandstof": "benzine",
  "proto": "6",
  "vin": "WF0AXXGCD6A000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0A 0B 0C 0D 0E 0F 10 11 13 14 15 1C 1F 21 23 2E 2F 30 31 33 34 3C 41 42 43 44 45 46"
   },
   {
    "adres": "7E9",
    "pids": "01 04 05 0C 0D 1C 1F 21",
    "m09": false
   }
  ],
  "bron": "OBDb Ford-Focus 2006",
  "pad": "00",
  "geen0A": true
 },
 {
  "id": "niro19",
  "naam": "Kia Niro 2019 hybride",
  "merk": "Kia",
  "model": "Niro",
  "jaar": 2019,
  "brandstof": "hybride",
  "proto": "6",
  "vin": "KNACC8AGXK5000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 13 15 1C 1F 21 2C 2D 2E 2F 30 31 32 33 34 3C 3E 41 42 43"
   }
  ],
  "bron": "OBDb Kia-Niro 2019",
  "pad": "AA"
 },
 {
  "id": "tucson18",
  "naam": "Hyundai Tucson 2018",
  "merk": "Hyundai",
  "model": "Tucson",
  "jaar": 2018,
  "brandstof": "benzine",
  "proto": "6",
  "vin": "TMAJ38LADJJ000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 11 13 15 1C 1F 21 23 2E 2F 30 31 32 33 34 3C 41 42 43 44 45 46 47 49 4A 4C 51 56"
   },
   {
    "adres": "7E9",
    "pids": "01 04 05 0C 0D 11 1C 1F"
   }
  ],
  "bron": "OBDb Hyundai-Tucson 2018",
  "pad": "AA"
 },
 {
  "id": "fiat500",
  "naam": "Fiat 500 2014 (CAN 29-bit)",
  "merk": "Fiat",
  "model": "500",
  "jaar": 2014,
  "brandstof": "benzine",
  "proto": "7",
  "vin": "ZFA3120000J000001",
  "ecus": [
   {
    "adres": "18DAF110",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 13 14 15 1C 1F 21 23 2C 2D 2F 30 31 33 3C 41 42 43 44 45 47 49 4A 4C 4F"
   }
  ],
  "bron": "OBDb Fiat-500 2014 (DB33 = 29-bit functioneel)",
  "pad": "55"
 },
 {
  "id": "clio20",
  "naam": "Renault Clio 2020 (CAN 29-bit)",
  "merk": "Renault",
  "model": "Clio",
  "jaar": 2020,
  "brandstof": "benzine",
  "proto": "7",
  "vin": "VF1RJA0AXL4000001",
  "ecus": [
   {
    "adres": "18DAF110",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 10 11 13 15 1C 1E 1F 21 23 24 2C 2D 2E 2F 30 31 33 3C 3E 41 42 43 44 45 46 47 49 4A 4C 4F 51 52 55 59 5C 5D 5E 61 62 63 65"
   }
  ],
  "bron": "OBDb Renault-Clio 2020 (DB33)",
  "pad": "55",
  "turbo": true
 },
 {
  "id": "golf26",
  "naam": "Volkswagen Golf 2026 (CAN 29-bit, motor op adres 01)",
  "merk": "Volkswagen",
  "model": "Golf",
  "jaar": 2026,
  "brandstof": "benzine",
  "proto": "7",
  "vin": "WVWZZZCDZTW000001",
  "ecus": [
   {
    "adres": "18DAF101",
    "pids": "01 03 04 05 06 07 0B 0C 0D 0E 0F 11 13 15 1C 1F 21 23 2E 2F 30 31 33 34 3C 41 42 43 44 45 46 47 49 4A 4C 51 53 54 56 5E 62 63 67 70"
   }
  ],
  "bron": "OBDb Volkswagen-Golf 2026 (DA01 + DB33)",
  "pad": "AA",
  "turbo": true
 },
 {
  "id": "bmw00",
  "naam": "BMW 3-serie 2000 (ISO 9141-2, geen VIN via OBD)",
  "merk": "BMW",
  "model": "3-serie",
  "jaar": 2000,
  "brandstof": "benzine",
  "proto": "3",
  "vin": "",
  "ecus": [
   {
    "adres": "10",
    "pids": "01 03 04 05 06 07 08 09 0C 0D 0E 0F 10 11 13 14 15 18 19 1C 21",
    "m09": false
   }
  ],
  "bron": "OBDb BMW-3-Series 2000 (686A = ISO 9141)",
  "geen0A": true,
  "readiness": "076500"
 },
 {
  "id": "merc00",
  "naam": "Mercedes C-klasse 2000 (KWP2000, drie codes)",
  "merk": "Mercedes-Benz",
  "model": "C-klasse",
  "jaar": 2000,
  "brandstof": "benzine",
  "proto": "5",
  "vin": "",
  "ecus": [
   {
    "adres": "10",
    "pids": "01 03 04 05 06 07 0C 0D 0E 0F 10 11 12 13 14 15 1C",
    "m09": false
   }
  ],
  "bron": "OBDb Mercedes-Benz-C-Class 2000 (C233 = KWP2000)",
  "geen0A": true,
  "dtc": {
   "03": [
    "P0170",
    "P1570"
   ],
   "07": []
  }
 },
 {
  "id": "mercdiesel",
  "naam": "Mercedes C-klasse diesel (CAN, geen O2, geen vonk)",
  "merk": "Mercedes-Benz",
  "model": "C-klasse",
  "jaar": 2008,
  "brandstof": "diesel",
  "proto": "6",
  "vin": "WDD2040088A000001",
  "ecus": [
   {
    "adres": "7E8",
    "pids": "01 04 05 0B 0C 0D 0F 10 1C 1E 1F 21 23 2F 30 31 33 41 42 49 4A 4D 4E"
   }
  ],
  "bron": "OBDb Mercedes-Benz-C-Class \"2000\", ECU 7E0: dieselvingerafdruk (0123, geen 0106/0113/010E)",
  "pad": "00",
  "turbo": true
 },
 {
  "id": "niroev",
  "naam": "Kia Niro EV 2022 (elektrisch, mode 01 bijna leeg)",
  "merk": "Kia",
  "model": "Niro",
  "jaar": 2022,
  "brandstof": "elektrisch",
  "proto": "6",
  "vin": "KNACC8AGXN5000001",
  "pad": "AA",
  "ecus": [
   {
    "adres": "7EB",
    "naam": "VCU",
    "pids": "01 21 30 31"
   },
   {
    "adres": "7EC",
    "naam": "BMS",
    "pids": "01 21 30 31 5B"
   }
  ],
  "bron": "OBDb Kia-Niro-EV 2022",
  "readiness": "000000",
  "minCijfer": 6,
  "minCijferWaarom": "mode 01 heeft geen snelheid: de basismeter blijft leeg; de waarde komt uit de BMS-codes van OBDb"
 },
 {
  "id": "konaev",
  "naam": "Hyundai Kona Electric 2021",
  "merk": "Hyundai",
  "model": "Kona",
  "jaar": 2021,
  "brandstof": "elektrisch",
  "proto": "6",
  "vin": "KMHK38AGXMU000001",
  "pad": "AA",
  "ecus": [
   {
    "adres": "7EB",
    "naam": "VCU",
    "pids": "01 21 30 31"
   },
   {
    "adres": "7EC",
    "naam": "BMS",
    "pids": "01 21 30 31 5B"
   }
  ],
  "bron": "OBDb Hyundai-Kona-Electric 2021",
  "readiness": "000000",
  "minCijfer": 6,
  "minCijferWaarom": "mode 01 heeft geen snelheid: de basismeter blijft leeg; de waarde komt uit de BMS-codes van OBDb"
 },
 {
  "id": "id3",
  "naam": "Volkswagen ID.3 2021 (elektrisch, 29-bit)",
  "merk": "Volkswagen",
  "model": "ID.3",
  "jaar": 2021,
  "brandstof": "elektrisch",
  "proto": "7",
  "vin": "WVWZZZE1ZMP000001",
  "pad": "AA",
  "ecus": [
   {
    "adres": "18DAF101",
    "pids": "01 0D 1C 42 49"
   },
   {
    "adres": "18DAF105",
    "naam": "BMS",
    "pids": "01 04 05 0C 0D 41 42 49 5B 9A"
   }
  ],
  "bron": "OBDb Volkswagen-ID3 2021 (DA01 + DA05)",
  "readiness": "000000"
 },
 {
  "id": "zoe",
  "naam": "Renault ZOE 2021 (elektrisch, 29-bit)",
  "merk": "Renault",
  "model": "Zoe",
  "jaar": 2021,
  "brandstof": "elektrisch",
  "proto": "7",
  "vin": "VF1AG0A0XM4000001",
  "pad": "55",
  "ecus": [
   {
    "adres": "18DAF1DA",
    "pids": "01 04 05 0A 0C 0D 0F 11 1C 1E 1F 21 22 23 30 31 33 41 42 43 45 46 47 49 4A 4D 4E 51 52 53 59 5B 5C 65 9A 9D"
   }
  ],
  "bron": "OBDb Renault-ZOE 2021 (DADA + DB33)",
  "readiness": "000000"
 },
 {
  "id": "mgzsev",
  "naam": "MG ZS EV 2021",
  "merk": "MG",
  "model": "ZS EV",
  "jaar": 2021,
  "brandstof": "elektrisch",
  "proto": "6",
  "vin": "LSJW74A95MZ000001",
  "pad": "00",
  "ecus": [
   {
    "adres": "7EB",
    "pids": "01 05 0C 0D 1C 1F 21 30 31 42 46 4E 51 5A"
   }
  ],
  "bron": "OBDb MG-ZS-EV 2021",
  "readiness": "000000"
 }
]
;
if (typeof window !== 'undefined') window.PL_NEPAUTO_PROFIELEN = PL_NEPAUTO_PROFIELEN;
if (typeof module !== 'undefined' && module.exports) module.exports = PL_NEPAUTO_PROFIELEN;
