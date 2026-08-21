# Alleen de gewijzigde bestanden — 21-08-2026

Dit is géén complete repo. Het zijn de 9 bestanden die nieuw zijn of gewijzigd
ten opzichte van de zip waarmee deze sessie begon, in dezelfde mapstructuur.
Uitpakken over je bestaande werkkopie heen.

`pidlane-busdiag.js` en `pidlane-copiloot.js` heb je zelf al uit de repo
gehaald — die zitten hier dus niet in en hoeven ook niet opnieuw weg.

## Uitpakken (Termux)

    cd ~
    unzip -o /sdcard/Download/PidLane-delta.zip -d /tmp/delta
    cp -r /tmp/delta/PidLane-main/. ~/PidLane/
    cd ~/PidLane
    plcheck

`plcheck` moet **73 bestanden, 21 tests** en verder alles groen melden, met een
div-balans van 782/782. Pas dan committen.

## Nieuw (2)

| bestand | wat |
|---|---|
| `public/pidlane-run.js` | de Run-chip: één plek waar staat wat er op de achtergrond draait, met vijf schakelaars |
| `public/test-run.js` | 18 toetsen op dat paneel, waaronder de script-scope-valkuil |

## Gewijzigd (7)

| bestand | wat er anders is |
|---|---|
| `public/pidlane-data.js` | `0143` rekende met deler `655.35` waar `2.55` hoort — stond 256x naast. `max` van 100 naar 400 |
| `public/index.html` | vierde chip in de topbar (`runChip` + `rdot`) en de script-tag voor `pidlane-run.js`, vóór de bedradingscontrole |
| `public/pidlane-export.js` | opmerkingveld in het opslaan-venster; gaat mee bovenaan de tekst en als kader in de PDF |
| `public/pidlane-testrun.js` | versie 2.8; blok 1 toetst het VIN-profiel nu écht, blok 5 en `CAMPAGNE` herschreven |
| `public/pidlane-bedrading.js` | vijf schakelfuncties geregistreerd, `obj` in `GEEN_GLOBALE` |
| `public/test-bedrading.js` | scanner ziet nu ook `typeof X !== 'function'`, niet alleen `===` |
| `PLAN.md` | punt 1 en 2 dicht, punt 4b afgehandeld, nieuwe bevindingen erin |

## Wat je in de auto moet nakijken

Staat in `CAMPAGNE` bovenaan het testrun-logboek. Kort: de chip moet vijf
regels tonen die kloppen met wat er draait, caravan en rit-analyse moeten om
bevestiging vragen bij **stoppen** (niet bij starten), het opmerkingveld moet
zowel in tekst als PDF terechtkomen, en blok 7 moet voor de vierde keer nul
ongevraagde remmomenten melden.

## Twee dingen die deze ronde boven water kwamen

**De bedradingsscanner keek maar naar de helft.** Hij zocht op
`typeof X === 'function'` en niet op `!==`. De vijf nieuwe guards in
`pidlane-run.js` gleden er zonder één melding doorheen. Dat is precies de
failliete controle waar dit project al eerder tegenaan liep: groen licht dat
niets betekent. Regex uitgebreid; daarmee kwam meteen één bestaand geval boven
(`obj`, lusvariabele in de dode-knoppencontrole).

**`window.caravanActive` bestaat niet.** `caravanActive` en `ritActive` zijn
top-level `let` in scripts zonder IIFE, dus ze staan in script-scope. Was het
paneel daarop gebouwd, dan hadden alle schakelaars permanent op UIT gestaan en
had je dat pas in de auto gemerkt. `test-run.js` bewaakt het.
