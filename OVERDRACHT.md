# OVERDRACHT — werkbriefing voor de volgende chat

> Dit is GEEN architectuurdocument. PIDLANE.md blijft de bron van waarheid;
> de gate staat daar in §15. Dit bestand overbrugt alleen het gat tussen
> sessies.
>
> Bijgewerkt 01-08-2026, na ronde 9.

---

## Waar we staan

**De PID-gate is af, inclusief de deuren, en `pidlane-auth.js` is weer een
login-module.** Ronde 1 t/m 9 zijn klaar, geverifieerd en beschreven in
PIDLANE.md §15. Er staat geen ronde meer open.

Kern in drie zinnen: "mag deze PID mee" was geen enkele vraag maar vijf, die op
elf plekken in wisselende combinaties stonden — dát was de motor achter "een fix
die faalt door een fix". Die vijf bleken cumulatief, dus het is een ladder
geworden: `pidGate(pid, niveau, opt)` met `plausibel → bestaat → kiesbaar →
duidbaar → meetbaar`. Ronde 5 voegde daar de tijd aan toe (`herijkPidGate()`
zodra de voertuigkennis verandert) en ronde 6 de schrijfkant
(`pidToevoegen()` als enige deur naar `activePIDs`).

Drie vragen, drie rondes: **welk antwoord** (1-4), **op welk moment** (5),
**wie mag schrijven** (6).

### Bestanden die klaarstaan om te committen

| Bestand | Wat erin veranderde |
|---|---|
| `public/pidlane-kwaliteit.js` | NIEUW (9 KB) — het kwaliteitscluster, byte-identiek uit `pidlane-auth.js` |
| `public/pidlane-auth.js` | kwaliteitscluster eruit (ronde 8) — 46 → 39 KB; verder byte-identiek op vier regels wijzer-commentaar na |
| `public/pidlane-rijsituatie.js` | merkgroepering in `applyVehiclePIDPreset()` vervangen door `merkGroep()` (ronde 9) |
| `public/pidlane-data.js` | alleen het commentaarblok boven `merkGroep()`: de "aparte ronde"-notitie klopte niet meer |
| `public/index.html` | één regel: script-tag voor `pidlane-kwaliteit.js`, direct ná pidgate |
| `PIDLANE.md` | §3, §4 (module 7 erbij, 7 t/m 40 hernummerd), §5 en §15 bijgewerkt |

Alle 39 modules zijn door `node --check`. `node test-pidgate.js` geeft exit 0,
`node test-herijking.js` 42 toetsen 0 fout — beide ongewijzigd, want ze knippen
alleen uit `pidlane-pidgate.js` en dat bestand is niet aangeraakt.
`index.html`: div-balans 0, 41 script-tags, precies één regel gewijzigd.

> De tests staan in `public/`, niet in de repo-root. Draaien dus vanuit `public/`.

### Wat ronde 8 opleverde

Puur mechanisch en bewijsbaar zo: het verplaatste blok (130 regels, regel 416
t/m 545 van de oude `pidlane-auth.js`) komt letterlijk voor in
`pidlane-kwaliteit.js`, komt niet meer voor in `pidlane-auth.js`, en de rest van
`pidlane-auth.js` is byte-identiek — letterlijk getoetst met
`origineel.replace(blok, wijzer) == nieuw`.

Keuze die openstond: bij de gate of een eigen module. Eigen module geworden,
omdat de gate `_pidHealth` *leest* en dit cluster het oordeel levert waarmee het
gevuld wordt. Dat is de andere kant van dezelfde pijl, geen zelfde taak.
`_withDisclaimer()` ging mee (stond niet in de lijst van vier), want zonder
`RAPPORT_DISCLAIMER` slaat het nergens op.

### Wat ronde 9 opleverde — en waar het níét gedragsneutraal is

De PIDs per merkbak zijn ongewijzigd, maar de herkenning is ruimer geworden:
`merkGroep()` normaliseert accenten en spaties en matcht op voorvoegsel, de oude
kopie vergeleek exact. 40 merkstrings naast elkaar gelegd: 30 identiek, 10
anders, allemaal dezelfde kant op — `MINI Cooper`, `VOLKSWAGEN GOLF`, `VW`,
`AUDI A3`, `Škoda Octavia`, `SEAT Leon`, `Cupra`, `FORD FOCUS`, `MAZDA CX-5` en
`TOYOTA YARIS` kregen eerst niets en krijgen nu wél hun aanvulling. Niemand
raakt iets kwijt.

Die extra PIDs komen binnen via `supportedPIDs` en gaan daarna alsnog door de
gate, dus een implausibele wordt geweerd zoals altijd. Wil je het tóch strikt
gedragsneutraal, dan is de knop `merkGroep()` zelf — niet deze module.

Oneffenheid die blijft staan, want die is van `merkGroep()`: `MINI` matcht op
voorvoegsel, `BMW` op gelijkheid. `MINI Cooper` valt dus in de bak en `BMW 320d`
niet. Rechttrekken raakt óók de DTC-lookup (§14) en is dus inhoudelijk werk in
een eigen ronde.

### Wat ronde 7 opleverde (vorige sessie)

Puur mechanisch en bewijsbaar zo: het verplaatste blok (327 regels, regel 407
t/m 733 van de oude `pidlane-auth.js`) komt letterlijk voor in
`pidlane-pidgate.js`, komt niet meer voor in `pidlane-auth.js`, en de rest van
`pidlane-auth.js` is byte-identiek op de vijf regels wijzer-commentaar na. Van
`index.html` is precies één regel veranderd; div-balans 0, 40 script-tags.
Beide tests draaien ongewijzigd groen tegen de nieuwe module.

### Wat ronde 6 leerde (vorige sessie)

**Het waren geen drie toevoegpaden maar vier.** De lijst van drie was opgesteld
door te zoeken op `activePIDs.add`. `ensurePIDListActive()` vervangt de hele set
(`activePIDs = nieuw`) en viel dus buiten die zoekopdracht — terwijl het de
drukste deur is: caravan, grafiek, koopcheck, rit, totaalcheck en remote komen er
alle zes met een eigen lijst binnen. Les voor de volgende categorie: zoek naar
manieren waarop de toestand kán veranderen, niet naar één schrijfvorm.

**Twee bewuste uitzonderingen**, beide in §15 vastgelegd:

- `manualPIDs` wordt niet opnieuw getoetst. Wat daarin staat is al een keer door
  een deur gekomen; `herijkPidGate()` ruimt het op als het niet meer klopt. Zou
  elke deur het opnieuw toetsen, dan verdwijnt een sensor die je met "Toon alles"
  bewust aanzette bij de eerstvolgende analyse alsnog.
- Demo schrijft rechtstreeks. In `loadDemoVehicle()` staat de PID-selectie vóór
  `vehicleInfo.brandstof=…`, dus de gate zou daar op de kennis van de vórige
  demo-auto oordelen — dezelfde wanneer-val als ronde 5. Demo bouwt met
  `demoPIDsForFuel()` zijn eigen sluitende wereld. Het vangnet slaat demo over.

### Turbo-detectie: al één keer gemeten, nog niet af

De eerste drempels (toerental > 1200, belasting ≥ 60% of gasklep ≥ 50%, 12
metingen) zijn op 01-08-2026 getoetst tegen een echte rit met de CX-5 en
afgekeurd: 1 van de 56 metingen haalde het criterium. Ook bleek het criterium
drie PIDs tegen elkaar uit te lezen die op verschillende intervallen worden
gepolld (1071 / 428 / 3570 ms).

Het criterium kijkt nu naar de MAP-waarde zelf (≥ 85 kPa) plus toerental
(> 300). Meetgegevens en redenering staan in PIDLANE.md §15; de meetreeks zelf
zit als fixture in `test-herijking.js`.

Op 01-08-2026 zijn drie ritten nagemeten (11:18, 12:02, 12:04). De piek bleef
alle drie de keren onder de 106-grens (100, 42, 98 kPa) — dat klopt voor een
atmosferische motor. Maar het bewijs komt bij normaal rijden nauwelijks binnen:
96% van de metingen zit onder 60 kPa, en geen van de drie ritten haalde de
drempel van tien metingen boven 85 kPa.

Dat is de veilige uitkomst: geen oordeel, dus geen filter, dus geen tegel kwijt.
De drempels blijven daarom staan zoals ze zijn. Ze te soepel maken kost een
tegel op een turbo; ze te streng laten kost niets.

**Belangrijker: het probleem is nooit aangetoond.** In geen van de drie ritten
stond een boost-PID in de lijst (`0170`, `2102`, `0187` kwamen niet voor). Er
viel dus niets te filteren. `_boostPhantom()` is gebouwd voor een ECU die
laaddruk-PIDs meldt zonder turbo, maar dat scenario is nooit waargenomen.

Wil je het toch een keer zien werken: één oprit met flink gas geeft binnen tien
seconden tien metingen boven 85 kPa. Op een auto met laaddruk-PIDs zou de tegel
dan moeten verdwijnen.

---

## Wat hierna aan de beurt is

### 1. Het vangnet in `renderGauges()` opruimen — pas met bewijs

Blijft de melding "Vangnet renderGauges ving … af" een tijd uit bij echt
gebruik, dan mag de regel weg. Dat is dan gedragsneutraal mét bewijs in plaats
van op hoop. Meldt hij zich wél, dan staat er een deur open en is dát de ronde.

Dit is de enige openstaande ronde uit de PID-reeks, en hij wacht op gebruik,
niet op werk.

### 2. Daarna: de volgende categorie (§13)

Connectie, UI-knoppen, vensters, rapporten, AI-aanroepen. `apiFetch()` in
`pidlane-fuel.js` is het bestaande voorbeeld van zo'n centrale plek.

### Let op bij elke volgende verhuizing

Beide tests knippen hun code letterlijk uit `pidlane-pidgate.js`.
`test-herijking.js` pakt alles tussen `function _engineWarmRunning` en de
sluitmarkering `// ── einde gate-blok`, die er expliciet voor staat. Knippaden
verhuizen mee, anders faalt de test met "niet gevonden" in plaats van met een
echte regressie. Bij ronde 8 speelde dat niet: het kwaliteitscluster zat niet in
het knipbereik.

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

Drie lessen uit deze reeks die daar meegaan:

**Kijk eerst of het één vraag is of meerdere.** Was het er één geweest, dan had
één functie volstaan. Het waren er vijf, en juist het door elkaar heen lopen van
die vijf maakte elke losse fix tot de oorzaak van de volgende.

**Een centrale plek is nog geen antwoord op wanneer.** De gate was na ronde 4
één beslisplek met het juiste antwoord, en stond nog steeds op het verkeerde
moment. Dode code kan dat verbergen: de turbo-detectie draaide nooit, dus het
kapotte criterium viel nooit op.

**En ook niet op wie.** Na ronde 5 klopten antwoord en moment, en toch kon elke
willekeurige module er nog ongefilterd iets in schrijven. Vraag per categorie
dus alle drie: wat is het antwoord, wanneer wordt het gesteld, en wie mag het
omzeilen.
