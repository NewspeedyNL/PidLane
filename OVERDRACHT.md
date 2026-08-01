# OVERDRACHT — werkbriefing voor de volgende chat

> Dit is GEEN architectuurdocument. PIDLANE.md blijft de bron van waarheid;
> de gate staat daar in §15. Dit bestand overbrugt alleen het gat tussen
> sessies.
>
> Bijgewerkt 01-08-2026, na ronde 5 van de PID-gate.

---

## Waar we staan

**De PID-gate is af.** Ronde 1 t/m 5 zijn klaar, geverifieerd en beschreven in
PIDLANE.md §15. Er staat geen ronde meer open.

Kern in twee zinnen: "mag deze PID mee" was geen enkele vraag maar vijf, die op
elf plekken in wisselende combinaties stonden — dát was de motor achter "een fix
die faalt door een fix". Die vijf bleken cumulatief, dus het is een ladder
geworden: `pidGate(pid, niveau, opt)` met `plausibel → bestaat → kiesbaar →
duidbaar → meetbaar`, waarbij elke trede de vorige bevat. Ronde 5 voegde daar de
tijd aan toe: `herijkPidGate()` stelt de gate opnieuw zodra de voertuigkennis
verandert.

### Bestanden die klaarstaan om te committen

| Bestand | Wat erin veranderde |
|---|---|
| `public/pidlane-auth.js` | turbo-criterium herzien; `purgeImplausiblePids()` → `herijkPidGate()`; stempel + `plHerijkTick()` + `markeerHerijking()` |
| `public/pidlane-pids.js` | `updPID()`: `_noteMap()` bij 010B, `nodata`-opwaardering, herijk-tick; commentaar bij de laatste zeef in `renderGauges()` |
| `public/pidlane-voertuigdata.js` | aanroep hernoemd (1 regel) |
| `public/pidlane-bt.js` | aanroep hernoemd (1 regel) |
| `test-herijking.js` | NIEUW, hoort in de repo-root |
| `test-pidgate.js` | plaknaam `purgeImplausiblePids` → `herijkPidGate` |
| `PIDLANE.md` | §4 en §15 bijgewerkt; rondetabel afgerond |

Alle modules zijn door `node --check`. `node test-pidgate.js` geeft exit 0.
`node test-herijking.js` geeft 24 toetsen, 0 fout.

### Wat je op een echte auto moet zien

De drempels in de turbo-detectie (1200 tpm, 60% belasting of 50% gasklep, 12
belaste metingen) zijn beredeneerd, niet gemeten. Op de CX-5:

1. Rijd een normaal ritje met wat belasting.
2. Kijk of de laaddruk-PIDs (`0170`, `2102`, `0187`) verdwijnen. De CX-5 2.0
   SkyActiv-G is atmosferisch, dus dat hóórt te gebeuren.
3. Gebeurt het niet, dan is de drempel te streng en blijft de detectie stil —
   geen schade, wel nutteloos. Verlaag dan het aantal of de belastingseis.
4. Verdwijnt er een tegel die er wél hoorde te staan: drempel te soepel.

Op de Clio (2007, ook atmosferisch) geldt hetzelfde. Een turbo om tegen af te
zetten hebben we niet in de testvloot — dat is de zwakke plek in de verificatie.

---

## Wat hierna aan de beurt is

### 1. Toevoegpaden sluiten (klein, duidelijk afgebakend)

De laatste zeef in `renderGauges()` kan pas weg als deze drie door `pidGate()`
lopen:

| Plek | Wat |
|---|---|
| `pidlane-diagnose.js` (~r31) | focus-PIDs uit Smart Diagnose |
| `pidlane-remote.js` (~r596) | actieve selectie uit een remote-sessie |
| `pidlane-pids.js` (~r13) | handmatige klik, bereikbaar via "Toon alles" |

Let op bij de derde: die moet `force` respecteren, anders sloopt hij "Toon
alles". Modules nodig: die drie.

### 2. `pidGate()` uit `pidlane-auth.js` halen (mechanisch, apart)

Daar staan nu `pidGate`, `herijkPidGate`, `vehiclePlausiblePid`, `getPidDef`,
`_noteMap`, de stempel en `assessPidQuality`. Volgens §4 is dat de
login/adminmodule. Eigen module, gedragsneutraal, geverifieerd met beide tests.

### 3. Merkgroepering-kopie (mechanisch, apart)

`applyVehiclePIDPreset()` in `pidlane-rijsituatie.js` heeft nog een hardcoded
merkgroepering (`BMW||MINI`, `VOLKSWAGEN||AUDI||SKODA||SEAT`, `TOYOTA||LEXUS`).
Hoort naar `merkGroep()` in `pidlane-data.js`.

---

## Losse eindjes

- **Dode code in `buildPIDList`:** `nodataTip` wordt berekend maar nergens
  gebruikt.
- **`pidCnt` telt twee dingen.** Label zegt "Beschikbare PIDs", zeven van de
  negen schrijvers zetten er het *geselecteerde* aantal in. Cosmetisch.
- **Overrun-detectie + tijdstempel per PID.** De AI krijgt een rijtje getallen
  zonder te weten of ze van hetzelfde moment komen, en de rijsituatie komt uit
  een invoerveld in plaats van uit de meting. Overrun is af te leiden uit wat al
  gelezen wordt (gasklep dicht, toerental boven stationair, snelheid > 0).
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

Twee lessen uit deze reeks die daar meegaan:

**Kijk eerst of het één vraag is of meerdere.** Was het er één geweest, dan had
één functie volstaan. Het waren er vijf, en juist het door elkaar heen lopen van
die vijf maakte elke losse fix tot de oorzaak van de volgende.

**Een centrale plek is nog geen antwoord op wanneer.** De gate was na ronde 4
één beslisplek met het juiste antwoord, en stond nog steeds op het verkeerde
moment. Dode code kan dat verbergen: de turbo-detectie draaide nooit, dus het
kapotte criterium viel nooit op. Bij de volgende categorie dus ook vragen: wie
roept dit eigenlijk aan, en hoe vaak?
