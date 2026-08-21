# Alleen de gewijzigde bestanden — 21-08-2026, versie 3.0.0

Dit is géén complete repo. Het zijn de 20 bestanden die nieuw zijn of gewijzigd
ten opzichte van de zip waarmee deze sessie begon, in dezelfde mapstructuur.

## LET OP — hier wordt wél iets verwijderd

Overkopiëren is deze keer niet genoeg. `public/pidlane-gps.js` is uit de app
gehaald; blijft dat bestand staan, dan laadt het niet meer (de script-tag is
weg) maar `test-geen-gps.js` faalt er wel op. Verwijder hem dus expliciet.

`pidlane-busdiag.js` en `pidlane-copiloot.js` had je zelf al weggehaald.

## Uitpakken (Termux)

    cd ~
    unzip -o /sdcard/Download/PidLane-delta-21-08-avond.zip -d /tmp/delta
    cp -r /tmp/delta/PidLane-main/. ~/PidLane/
    rm -f ~/PidLane/public/pidlane-gps.js
    cd ~/PidLane
    plcheck

`plcheck` moet **74 bestanden, 23 tests** melden, div-balans **728/728**, en
verder alles groen. Pas dan committen.

## Nieuw (4)

| bestand | wat |
|---|---|
| `public/pidlane-run.js` | de Run-chip: één plek waar staat wat er op de achtergrond draait, met vijf schakelaars |
| `public/test-run.js` | toetsen op dat paneel, waaronder de script-scope-valkuil |
| `public/test-versie.js` | houdt `package.json` en `config.js` op hetzelfde versienummer |
| `public/test-geen-gps.js` | bewaakt dat de app locatievrij blijft en dat de drie verklaringen kloppen |

## Verwijderd (1)

| bestand | waarom |
|---|---|
| `public/pidlane-gps.js` | alle locatiefunctionaliteit is eruit — zie hieronder |

## Gewijzigd (15)

| bestand | wat er anders is |
|---|---|
| `public/index.html` | Run-chip in de topbar; wizard-stappenbalk en `wizS1..wizS5` eruit (782 → 728 divs); script-tags bijgewerkt |
| `public/config.js` | `APP_VERSION` naar **3.0.0** |
| `package.json` | `version` naar **3.0.0** — stond op 2.1.0 |
| `public/pidlane-data.js` | `0143` rekende met deler `655.35` waar `2.55` hoort; `max` 100 → 400 |
| `public/pidlane-scheduler.js` | `wizNext`, `wizRdwLookup`, `_wizRefreshKnown`, `wizToggleDetail` verwijderd; `wizGo()` teruggebracht |
| `public/pidlane-bulk.js` | neemt geen positie meer op; `gpsStart`/`gpsStop`/veld `g` weg |
| `public/pidlane-export.js` | opmerkingveld in het opslaan-venster, gaat mee in tekst en PDF |
| `public/pidlane-testrun.js` | versie 2.9; blok 1 toetst het VIN-profiel echt; blok 5 en `CAMPAGNE` herschreven |
| `public/pidlane-privacy.js` | disclosure zegt nu dat er helemaal geen locatie wordt bepaald |
| `public/privacy.html` | locatie uit de datatabel, expliciete regel bij "wat we niet doen" |
| `public/pidlane-bedrading.js` | vijf schakelfuncties geregistreerd, `obj` in `GEEN_GLOBALE` |
| `public/test-bedrading.js` | scanner ziet nu ook `typeof X !== 'function'` |
| `.github/workflows/build-apk.yml` | versiecontrole faalt hard; locatiekeuze vastgelegd en bewaakt; `config.js` als build-trigger |
| `ANDROID-PLAYSTORE.md` | blokkade 1 gesloten op route (a) |
| `PIDLANE.md`, `PLAN.md` | modultabel en werkplan bijgewerkt |

## De drie klussen in het kort

**Wizard opgeruimd.** De HTML van vier stappen die niets deden stond er nog
omdat weghalen de div-balans raakt en dat een aparte stap hoorde te zijn. Dat is
deze. Vier functies werden daardoor dood en zijn ook weg — dode functies maken
de dode-knoppencontrole waardeloos, want die kan dan niet meer zien of iets bij
een knop hoort of gewoon nooit opgeruimd is.

**Versies gelijk.** `package.json` zei 2.1.0, `config.js` zei 2.9.0, en de CI
zet `versionName` uit package.json — een bugmelding op "2.9.0" ging dus over een
APK die 2.1.0 heette. Beide op 3.0.0, bewaakt door `test-versie.js` én door een
harde stap in de workflow. `versionCode` blijft het buildnummer; die hoort juist
niet gelijk te zijn, want Play eist dat hij bij elke inzending oploopt.

**Locatie eruit.** De functie wérkte al niet: `ACCESS_FINE_LOCATION` liep tot
API 30, dus op Android 12+ kreeg `watchPosition` nooit een fix en verdween de
fout in een lege catch. Wat het opleverde was context, geen invoer — de
klimdetectie draait op belasting en snelheid. In ruil kostte het een sensitive
permission met eigen disclosure en een Data safety-verklaring. De permissie
blijft staan mét `maxSdkVersion=30`, want Android 11 en ouder eisen hem om
überhaupt naar Bluetooth te mogen scannen.

Wil je hoogte ooit terug: PID `0133` (barometrische druk) zit al in elke meting
en kost geen enkele permissie.

## Vanaf nu bij elke update

`package.json` en `public/config.js` met een opgehoogde versie meeleveren in de
delta-zip. De workflow faalt als ze uiteenlopen, dus vergeten wordt gezien —
maar dan pas ná de push.
