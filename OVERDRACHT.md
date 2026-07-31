# OVERDRACHT — werkbriefing voor de volgende chat

> Dit is GEEN architectuurdocument. PIDLANE.md blijft de bron van waarheid;
> de gate staat daar in §15. Dit bestand overbrugt alleen het gat tussen
> sessies en mag weg zodra ronde 5 klaar is.
>
> Bijgewerkt 01-08-2026, na ronde 4 van de PID-gate.

---

## Waar we staan

De PID-gate is ontworpen én grotendeels gebouwd. Ronde 1 t/m 4 zijn klaar,
geverifieerd en beschreven in PIDLANE.md §15. **Alleen ronde 5 staat open.**

Kern in twee zinnen: "mag deze PID mee" was geen enkele vraag maar vijf, die op
tien plekken in tien combinaties stonden — dát was de motor achter "een fix die
faalt door een fix". Die vijf bleken cumulatief, dus het is een ladder geworden:
`pidGate(pid, niveau, opt)` met `plausibel → bestaat → kiesbaar → duidbaar →
meetbaar`, waarbij elke trede de vorige bevat.

### Bestanden die klaarstaan om te committen

| Bestand | Wat erin veranderde |
|---|---|
| `pidlane-auth.js` | `pidGate()` toegevoegd (regel ~505 e.v.), `isReportableSensor` en `purgeImplausiblePids` erdoorheen |
| `pidlane-rijsituatie.js` | `buildDiscoveredPIDList`, `selectStandardSet`, `selectCategoryPIDs`, `applyPidPreset`, `buildPIDList` |
| `pidlane-pids.js` | `relevantSupportedPIDs` (2×), `analysisPidData`, `renderGauges` |
| `test-pidgate.js` | NIEUW, hoort in de repo-root |
| `PIDLANE.md` | §4, §11, §12 bijgewerkt; §15 nieuw |

Alle drie de modules zijn door `node --check`. `node test-pidgate.js` geeft
exit 0 met de melding dat alle verschillen verklaard zijn.

---

## Ronde 5 — herijking (de enige openstaande ronde)

Dit is de grootste van de vijf, want hij verandert **wanneer** de gate wordt
gesteld, niet alleen wat hij antwoordt.

### Het probleem

`discoveredPIDDefs` wordt gebouwd tijdens `initialHealthScan()`, op een moment
dat het brandstoftype meestal nog onbekend is en `_maxMapSeen` nog leeg. Komt
RDW later met "benzine", dan haalt `purgeImplausiblePids()` de AdBlue-tegel wel
uit `activePIDs`, maar de **bronlijst wordt niet herbouwd**. De fantoomsensor
staat dus nog gewoon in de keuzelijst — sinds ronde 4 uitgegrijsd in plaats van
normaal, maar hij hoort er helemaal niet te staan.

Onderliggend: de gate is geen zuivere functie van de PID, maar van
(PID, huidige kennis). Een gefilterde bronlijst zonder invalidatie is daarmee
per definitie te vroeg gebouwd.

### Wat te bouwen

1. `purgeImplausiblePids()` wordt `herijkPidGate()`: eerst
   `buildDiscoveredPIDList()` opnieuw draaien, dán pas `activePIDs` filteren,
   dan `renderGauges()` + `rebuildGSel()`.
2. Aanroepen op elk moment dat de voertuigkennis verandert: brandstoftype uit
   RDW binnen, `_maxMapSeen` over de turbo-drempel, VIN-profiel geladen.
3. `nodata` herzienbaar maken. `initialHealthScan()` doet één read per PID en
   zet de uitkomst vast. Dat is dun bewijs — J1939-71 beveelt niet voor niets
   aan om beschikbaarheid op "niet beschikbaar" te laten beginnen en pas op te
   waarderen bij geldige data. Andersom moet dus ook kunnen.
4. Daarna mag de pleisterregel in `renderGauges()` weg (`pidlane-pids.js`, staat
   met een `LET OP`-comment aangegeven).

### Verificatie

`test-pidgate.js` moet worden **uitgebreid**, niet alleen bijgewerkt: hij toetst
nu of de gate het juiste antwoord geeft, niet of hij op het juiste moment wordt
gesteld. Voor ronde 5 is een tweede test nodig met een tijdlijn — bronlijst
bouwen bij onbekende brandstof, daarna brandstof zetten, en controleren dat de
fantoom uit `discoveredPIDDefs` verdwijnt.

### Modules nodig

`pidlane-auth.js`, `pidlane-rijsituatie.js`, `pidlane-pids.js`, plus
`test-pidgate.js`. Dat is helaas alle drie — ronde 5 raakt ze alle.

---

## Nog te controleren (klein, één grep)

`selectStandardSet` loopt over `STANDAARD_PIDS` in `pidlane-data.js`, dat ik
niet heb gezien. Staat daar per ongeluk een ondersteuningsbitmap in (`0100`,
`0120`, `0140`, `0160`, `0180`, `01A0`, `01C0`, `0102`), dan valt die er sinds
ronde 1 uit. Verwachting: staat er niet in, want het is een samengestelde lijst.
Dit is de enige aanname uit de hele reeks die niet geverifieerd is.

---

## Losse eindjes die hierna aan de beurt zijn

- **`pidGate()` staat in `pidlane-auth.js`.** Daar stonden
  `vehiclePlausiblePid()` en `getPidDef()` al, maar volgens §4 is dat de
  login/adminmodule. Verplaatsen naar een eigen module: mechanische ronde,
  apart, niet mengen met ronde 5.
- **Merkgroepering-kopie.** `applyVehiclePIDPreset()` in
  `pidlane-rijsituatie.js` heeft nog een hardcoded merkgroepering
  (`BMW||MINI`, `VOLKSWAGEN||AUDI||SKODA||SEAT`, `TOYOTA||LEXUS`). Hoort naar
  `merkGroep()` in `pidlane-data.js`. Mechanisch, apart.
- **Dode code in `buildPIDList`:** `nodataTip` wordt berekend maar nergens
  gebruikt. Opgemerkt tijdens ronde 4, bewust niet meegenomen.
- **Overrun-detectie + tijdstempel per PID.** De AI krijgt een rijtje getallen
  zonder te weten of ze van hetzelfde moment komen, en de rijsituatie komt uit
  een invoerveld in plaats van uit de meting. Overrun is af te leiden uit wat al
  gelezen wordt (gasklep dicht, toerental boven stationair, snelheid > 0).
  Hoort bij de gate-categorie "AI-aanroepen".
- **Referentie-store en octrooien.** Een Snap-on-octrooifamilie beschrijft een
  server die uit vlootdata normaalbereiken afleidt en per voertuig + DTC een
  gefilterde PID-lijst uitlevert — sterk lijkend op waar §12 naartoe wil. Geen
  juridisch advies, wel iets om te laten checken vóórdat dat gebouwd wordt.
- **Opruimwerk** (PIDLANE.md §11): dode element-id's, `logout()` wist
  `pl_credits_*` niet, gebruikersnaam met `@` bereikt de Users-route niet meer,
  Tikkie-links hardcoded in publieke repo.

---

## Daarna: dezelfde aanpak per categorie

Connectie, UI-knoppen, vensters, rapporten, AI-aanroepen. `apiFetch()` in
`pidlane-fuel.js` is het bestaande voorbeeld van zo'n centrale plek.

De les uit deze reeks die daar meegaat: **kijk eerst of het één vraag is of
meerdere.** Was het er één geweest, dan had één functie volstaan. Het waren er
vijf, en juist het door elkaar heen lopen van die vijf maakte elke losse fix
tot de oorzaak van de volgende.
