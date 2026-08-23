# LEESMIJ-DELTA — 24-08-2026

Uitpakken over de werkkopie:

```
cd ~/
unzip -o pidlane-delta-2408.zip
cd PidLane-main
bash plcheck.sh $(pwd)      # 77 bestanden, 26 tests, groen
```

Acht bestanden. Twee onderwerpen: de opruimregel voor stille sensoren
(gebouwd naar het besluit van 23-08) en één reparatie aan een controle die
gisteren vals alarm gaf.

---

## Eerst: fix 2 was nooit stuk

Blok 5 meldde twee keer *"survey transport (veldlab) — dat bestand is niet
meegekomen"*. Dat klopte niet. De fix zat er gewoon in; `vlFullSurvey` staat
op regel 334 binnen de IIFE die op regel 18 opent, dus
`String(window.vlFullSurvey)` leverde een lege string op.

Dat is precies de val uit PIDLANE.md §20: **een statische definitie is geen
globale beschikbaarheid.** De controle deed broncode-inspectie op een functie
in een closure.

Rechtgezet door de regel zelf naar buiten te halen: `plSurveyUitkomst(status,
fout1, fout2)` staat nu als zuivere functie buiten de IIFE, en blok 5 roept
hem echt aan — twee lijnfouten op een nodata moeten `'transport'` opleveren,
één fout niet, geen fouten niet. Dat is gedrag, geen tekst.

Ik had dit gisteren als "fix 2 ontbreekt" aan je gemeld. Dat was fout van mij.

---

## De opruimregel — `pidOpruimen()`

Naar het besluit dat je op 23-08 vastlegde. **Geen nieuw systeem:** de
dode-PID-snoei in `pidlane-plload.js` bestond al (snoeien na een reeks
missers, elke twee minuten een herkansing) en liep alleen nooit ergens op uit.
Er is een uitgang aan toegevoegd.

`pidOpruimen(pid, reden)` in `pidlane-pidgate.js` is de tegenhanger van
`pidToevoegen()`: één deur naar binnen, één naar buiten. Hij haalt de sensor
uit `activePIDs`, laat `manualPIDs` met rust (wat jij bewust aanzette blijft
staan), meldt het in `btDiag` én `log`, en markeert een herijking.

`pidGate()` weert een opgeruimde sensor op de trede **kiesbaar**, binnen de
force-uitzondering. "Toon alles" blijft dus werken — het is jouw auto.

Drempels: `PID_DEAD_THRESHOLD` 4 → **5**, `PID_REPROBE_MS` 120 s → **60 s**,
nieuw `PID_OPRUIM_NA` = **5**.

### Eén afwijking van je besluit, en die wil ik expliciet noemen

Je zei "na 5 mislukte pogingen". In de praktijk wordt het er **zes**.

Snoeien vereist namelijk vier dingen tegelijk, niet alleen een reeks missers:
ook een kwaliteitsscore onder 35, een reeks die in échte tijd lang genoeg
duurt voor die cadans, en een bus die zelf gezond is. Die score begint op 100
en zakt 12 per misser, dus hij passeert de 35 pas bij de zesde.

Ik heb die kwaliteitspoort **niet** aangepast om het getal kloppend te maken.
Hij bestaat om te voorkomen dat een sensor gestraft wordt voor een zieke bus,
en dat is precies het scenario dat je gisteren in het log had staan: drie
socketdoden met foutgraad 100%. Wil je exact vijf, dan moet die poort mee — en
die raakt ook alle andere PIDs. Zeg het maar.

### Terugweg

Binnen de sessie is er geen. Een geslaagde herkansing wist de teller wél
volledig, met een melding erbij — een sensor die af en toe hapert wordt dus
niet alsnog opgeruimd door losse haperingen bij elkaar op te tellen. Een
nieuwe sessie doorloopt de hele volgorde opnieuw.

### AI-rapport

`plMeetPromptBlok()` meldt opgeruimde sensoren met de expliciete instructie ze
**niet** als afwezig op dit voertuig en **niet** als defect te behandelen — er
is alleen geen meting. Dat onderscheid is de hele reden dat die regel er staat.

### Test

`test-stilopruim.js`, 25 toetsen. Knippad: het blok tussen
`// ── DE UITGANGSDEUR` en `// ── einde gate-blok` in `pidlane-pidgate.js`.
Tegenproef: `PID_OPRUIM_NA` op 1 zetten maakt de test rood.

Bijvangst tijdens het bouwen: `test-herijking.js` viel om op een kale
`window.pidOpruimen=` in het geknipte blok, en `test-bedrading.js` ving beide
nieuwe functies af omdat ze achter een `typeof`-guard stonden zonder in
`KRITIEK` te staan. Allebei gedaan waarvoor ze bestaan.

---

## Wat er verder in zit

**`pidlane-testrun.js`** — versie 3.7. `CAMPAGNE` en `_blok5()` herschreven
voor déze update: vier nieuwe controles (bestaat de deur, wérkt de deur, staan
de drempels naar buiten, hoort de AI ervan) plus de gerepareerde
veldlab-controle. De vragen gaan nu over de opruimregel en over de twee
bevindingen van gisteren.

**`PIDLANE-WERK.md`** — de uitslag van de rit staat erin, per fix. Fix 11 op
✅ (86 → 6 verlagingen, waarvan 1 bij foutgraad 0, en die had 1198 ms dus
terecht), `0143` dicht, punt 12 dicht, de open keuze over stille sensoren
verwijderd omdat hij nu gebouwd is.

---

## Drie dingen die ik NIET heb aangeraakt

**De turbodrempel.** 1461 MAP-monsters, piek 105 kPa, `MAP_ATMOSF_MAX` staat
op 106. Eén kPa marge op een atmosferische motor. De verkeerde kant op is
veilig — als turbo beoordeeld worden verwijdert niets — maar dit is geen
marge. Aparte ronde, want het raakt de detectie zelf.

**"Pollbudget vastgehouden" staat op `info`.** Daardoor komt hij niet in de
logboek-export; ik vond hem alleen in de diagbundel binnen de testrun. Dat is
jammer voor precies de regel die moet bewijzen dat fix 11 werkt. Naar `warn`
is één teken, maar het is een bewuste keuze over logvolume.

**Het opmerkingveld kapt af op 20 tekens.** Zit niet in `pidlane-export.js`;
bron onbekend. Zeg waar het invoerveld staat, dan is het één regel.

En de demo-knop wacht nog steeds op een screenshot.

---

## Volgorde van committen

1. `pidlane-veldlab.js` + `pidlane-testrun.js` — `plSurveyUitkomst()` naar
   buiten, blok 5 toetst gedrag *(mechanisch: de regel zelf is ongewijzigd)*
2. `pidlane-pidgate.js` + `pidlane-bedrading.js` — de uitgangsdeur
3. `pidlane-plload.js` — drempels en de herkansingsteller
4. `pidlane-fuel.js` — melding in het AI-rapport
5. `test-stilopruim.js` + `PIDLANE-WERK.md` — test en administratie

`plcheck.sh`: 77 bestanden syntax, 26 tests exit 0, div-balans 728/728 en
99/99, alle modules in `index.html`, bedrading achteraan.
