# scenariolog/echt — echte logs van anderen

Verzonnen logs (`scenariolog/*.csv`) toetsen of de keten doet wat we bedachten.
Deze map toetst iets anders: of hij overeind blijft bij een log die iemand
anders maakte, met zijn eigen kolomnamen, eenheden en gaten. De echte
storing is bekend, dus het oordeel van de app en het antwoord van de AI zijn
ertegen te leggen.

`test-scenariolog.js` leest alleen `scenariolog/*.csv`, niet deze map: hier
staat geen BASIS of SIGNAAL in de kop, want hoe de app hiermee om hoort te
gaan is nog een besluit. Inlezen gaat met de hand: adminmenu → 📂 Log inlezen.

## Bronnen en licenties

| bestand | bron | licentie | gewijzigd |
|---|---|---|---|
| `n53_airleak_MAF_NOx.csv`, `n53_healthy_MAF_NOx.csv` | [edgeimpulse/obd-automotive-data](https://github.com/edgeimpulse/obd-automotive-data) | BSD 3-Clause, © 2025 Edge Impulse — tekst in `LICENSE-edgeimpulse-BSD3.txt` | nee, letterlijk overgenomen |
| `diesel-*.csv` | DieselOBD, [AbouAbdallah-Lounis/OBD-Dataset](https://github.com/AbouAbdallah-Lounis/OBD-Dataset) — K. Lounis, H. Mekki, W. Hadjab, *AutoSense-ML* (2026) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | ja: uit `MASTER_TRAIN_X.xlsx` naar csv, 1800 rijen per voertuig, alleen de 11 PID-kolommen, kolom `t_ms` toegevoegd (zie hieronder); de kop van elk bestand zegt welke rijen |

Bekeken en **niet** overgenomen: de voorbeeldlogs van
[UltraLog](https://github.com/ClassicMiniDIY/UltraLog) (OBDLink, BlueDriver,
Torque). Die staan onder AGPL-3.0, en een BlueDriver-log draagt een VIN in de
bestandsnaam.

## Wat elke log op de proef stelt

**BMW N53 met en zonder luchtlek** (Edge Impulse). Benzine, 2 Hz, 1200 s.
Het lek is nagebootst door de luchtmassameter of een vacuümleiding los te
nemen. Kolommen: `time (ms.)`, `fault_label`, `RPM [RPM]`, `PEDAL INPUT [%]`,
`MAF [g/s]`, `NOx [ppm]`.
- De tijdkolom heet `time (ms.)`, met een punt erin.
- De eenheid staat tussen vierkante haken.
- Er staan geen brandstoftrims in. Het verschil tussen lek en gezond zit
  alleen in MAF tegenover toerental en pedaal.
- `fault_label` verklapt het antwoord. Die kolom hoort niet in de prompt.

**Vier diesels** (DieselOBD). Kolommen: `LOAD_PCT, ECT, MAP, RPM, VSS, IAT,
MAF, FRP, BARO, VPWR, AAT`. De DTC's komen van de bron (`# WAARHEID`):

| bestand | voertuig | DTC volgens de bron |
|---|---|---|
| `diesel-captiva-map-laag.csv` | Chevrolet Captiva 2.0 2011 | P0107 (MAP-signaal laag), P0069 (MAP/baro-correlatie), P0089 (brandstofdrukregelaar) |
| `diesel-expert-maf-iat.csv` | Peugeot Expert 2.0 2014 | P0406 (EGR), P0234 (overboost), P0102 (MAF laag), P0113 (IAT hoog); alleen stationair |
| `diesel-berlingo-maf-iat.csv` | Citroën Berlingo 1.6 2014 | P0113, P0102, P2562 (stand turbo-actuator) |
| `diesel-gezond.csv` | een van de drie foutvrije (welke zegt de bron niet) | geen |

Wat deze logs zwaar maakt:
- **De eenheden in de bron-README kloppen niet.** Daar staat °C, kPa en km/h.
  De getallen zijn °F en psi:
  - koelwater 144–207 (207 °F = 97 °C);
  - BARO 14,2–14,6 (psi, ongeveer 99 kPa);
  - MAP 14–37 (psi absoluut, tot ongeveer 2,5 bar laaddruk);
  - FRP tot 21 000 (psi, ongeveer 1450 bar railrdruk).
  De eenheid van MAF (0,0–0,3) is onduidelijk. De kolomkoppen hebben geen
  eenheid.
- **De Captiva laat de storing in het getal zien**: MAP staat bijna de hele
  tijd op 2,8 psi (19 kPa absoluut), onder de luchtdruk. Dat hoort bij P0107.
- **Afkortingen**: `ECT`, `VSS`, `VPWR`, `BARO`, `AAT`, `LOAD_PCT`, `FRP`.
- **Geen tijdstempels in de bron**:
  - `t_ms` is toegevoegd als rijnummer × 1000. Dat 1 Hz is een aanname.
  - Rijen herhalen zich vaak letterlijk: de scanner gaf blijkbaar minder vaak
    een nieuwe waarde dan hij een rij schreef.
- De foutvrije log moet een ander oordeel krijgen dan de drie met codes.
