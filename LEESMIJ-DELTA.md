# Delta — 21-08-2026 (nacht), versie 3.0.0 / testrun 3.3

20 bestanden. **Er wordt één bestand hernoemd**, dus overkopiëren alleen is niet
genoeg.

    cd ~
    unzip -o /sdcard/Download/PidLane-delta-21-08-nacht.zip -d /tmp/delta
    cp -r /tmp/delta/PidLane-main/. ~/PidLane/
    rm -f ~/PidLane/public/pidlane-scheduler.js      # heet nu pidlane-motortype.js
    cd ~/PidLane && plcheck

`plcheck` moet **76 bestanden, 25 tests**, div-balans **728/728** melden.
Blijft `pidlane-scheduler.js` staan, dan hangt hij nergens meer in maar heb je
wel twee kopieën van dezelfde module in de repo.

## Nieuw (3)

| bestand | wat |
|---|---|
| `public/pidlane-motortype.js` | hernoemd uit `pidlane-scheduler.js` — de echte scheduler zit in `pidlane-plload.js` |
| `public/test-stille-catches.js` | ratel: het aantal lege catches mag per module alleen omlaag |
| `public/test-demo-toegang.js` | bewaakt dat de demo bereikbaar blijft zonder account |

## Verwijderd (1)

`public/pidlane-scheduler.js` — hernoemd, zie hierboven.

## Gewijzigd (16)

| bestand | wat er anders is |
|---|---|
| `public/pidlane-bt.js` | **de race is dicht**: `initConnection` wacht op de RDW-opzoeking vóór `saveVinProfile()`. 54 lege catches → 0 |
| `public/pidlane-veldlab.js` | 54 lege catches → 0; drie vondsten, zie onder |
| `public/pidlane-voertuigdata.js` | aandachtspunten bij het voertuigdossier (`plVoertuigLet`), auto-chip wordt oranje |
| `public/pidlane-pids.js` | `renderGauges()`-vangnet verwijderd |
| `public/index.html` | demoknop op het loginscherm; `v2.1` eruit; script-tag hernoemd |
| `public/pidlane-demo.js` | `plDemoZonderLogin()` — demo zonder sessie te zetten |
| `public/pidlane-auth.js` | versie-terugval `'2.1'` → `'?'` |
| `public/pidlane-testrun.js` | versie 3.3, blok 5 en `CAMPAGNE` herschreven |
| `public/pidlane-bedrading.js` | vier nieuwe namen geregistreerd |
| `public/test-versie.js` | toets op hardcoded versie-terugvallen |
| `public/test-geen-gps.js` | witregel |
| `PIDLANE.md`, `PLAN.md`, `OVERDRACHT.md`, `ANDROID-PLAYSTORE.md`, `LEESMIJ-DELTA.md` | bijgewerkt |

## De race (punt 11)

`updateVehicleCard()` geeft de lopende `rdwLookup()` nu terug en
`initConnection` wacht erop. Twaalf seconden grens; daarna wordt het profiel
**niet** opgeslagen, want het zou merk, model en brandstof missen en dat blijft
hangen tot de volgende volle discovery.

Mislukt de opzoeking, dan kleurt de auto-chip oranje en staat in het dossier
waarom. Geen toast: een melding die wegvalt terwijl je rijdt is geen melding.

**Verbinden duurt hierdoor merkbaar langer** als de RDW traag is. Dat is de prijs.

## 108 stille catches opgeruimd

`pidlane-bt.js` en `pidlane-veldlab.js`, allebei van 54 naar 0. Bewezen dat
alleen catch-bodies en commentaar wijzigden — de rest is teken voor teken gelijk.

**Er komen dus meldingen in het logboek die er nooit waren.** Dat is de bedoeling.
Let vooral op `probeUitgebreid mislukt` en `Herijking na protocolvondst mislukt`:
die twee stonden in een lege catch, en daar zijn eerder weken aan verloren.

`test-stille-catches.js` is een ratel: per module de huidige stand, meer mag
niet, minder mag altijd. Een catch met een reden erin telt niet mee.
Nog te gaan: `remote` 105, `testrun` 66, `koopcheck` 42, `fuel` 40, `auth` 39.

## Wat veldlab opleverde — lees dit

**De Full Survey telt een transportfout als "PID bestaat niet".** Gooit
`sendCmd` (timeout, socket weg), dan blijft `raw` leeg en wordt de status
`nodata`. Dat oordeel gaat naar Airtable en voedt de dekkingsmatrix per merk.
Dezelfde verwarring die blok 10 met een ijkronde vermijdt, maar dan in het
instrument dat bepaalt wat een merk ondersteunt. Hoeveel bestaande records
hierdoor vervuild zijn is onbekend — zie `PLAN.md` punt 16.

`vlSave()` en `_vlAtQueuePush()` slikten QuotaExceeded stil, terwijl het
commentaar erboven waarschuwt voor "onzichtbaar dataverlies". Een mislukte
`vlSave()` betekent dat de veldlab-sessie weg is.
