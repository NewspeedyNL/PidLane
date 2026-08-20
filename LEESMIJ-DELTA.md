# Alleen de gewijzigde bestanden — 20-08-2026

Dit is géén complete repo. Het zijn de 19 bestanden die nieuw zijn of
gewijzigd ten opzichte van de zip waarmee deze sessie begon, in dezelfde
mapstructuur. Uitpakken over je bestaande werkkopie heen.

Er is **niets verwijderd** in deze ronde, dus overkopiëren is veilig: er
blijven geen weesbestanden achter.

## Uitpakken (Termux)

    cd ~
    unzip -o /sdcard/Download/PidLane-delta.zip -d /tmp/delta
    cp -r /tmp/delta/PidLane-main/. ~/PidLane/
    cd ~/PidLane
    plcheck

`plcheck` moet 71 bestanden, 20 tests en alles groen melden. Pas dan committen.

## Nieuw (8)

| bestand | wat |
|---|---|
| `public/pidlane-logboek.js` | logscherm dat BT-, app- en PID-logs samenvoegt; kebab → Logboek |
| `public/pidlane-privacy.js` | prominente Bluetooth-disclosure vóór `connectSerial()` + privacyscherm |
| `public/pidlane-start.js` | startscherm: adapterprofielen, geheugen, cascade als voortgang |
| `public/privacy.html` | publieke privacyverklaring waar de app naar linkt |
| `public/test-start.js` | 23 toetsen op het startscherm |
| `public/test-brandstofpoort.js` | 12 toetsen op de volgorde van de brandstofpoort |
| `public/test-budget.js` | 8 toetsen op de blok 7-correcties van 20-08 |
| `ANDROID-PLAYSTORE.md` | reviewchecklist en de twee openstaande blokkades |

## Gewijzigd (11)

| bestand | wat |
|---|---|
| `public/index.html` | kebab-knoppen Logboek en Privacy, drie script-tags, statische stappen als vangnet |
| `public/pidlane-bt.js` | disclosure-poort, brandstofpoort vóór de health-scan, cascade meldt zich aan het startscherm, ketenvolgorde volgt het adaptertype |
| `public/pidlane-voertuigdata.js` | `brandstofPoort()` — brandstof vaststellen vóórdat de gate erop beslist |
| `public/pidlane-uitgebreid.js` | `2101` verwijderd (gemeten NO DATA), met de meting als aantekening |
| `public/pidlane-data.js` | `2101` in `PIDS_EXTRA` gemarkeerd als dood op CX-5 2018 |
| `public/pidlane-testrun.js` | versie 2.2: blok 7 (pollbudget), 8 (olietemp), 9 (DID-scan), herschreven blok 5 en `CAMPAGNE` |
| `public/pidlane-auth.js` | één regel: `window.plLokaalLog` zodat het logboek het app-log kan lezen |
| `public/pidlane-bedrading.js` | `plLokaalLog` en `brandstofPoort` in `KRITIEK` |
| `.github/workflows/build-apk.yml` | release-bundle (.aab), versiebeheer, strengere permissiecontrole |
| `PLAN.md` | punt 4 gesloten, punt 2 herschreven, 4b (`0143`) en 4c (Play Store) toegevoegd |
| `OVERDRACHT.md` | bevindingen 19 en 20 augustus, plus twee nieuwe valkuilen |

## Let op bij de volgende rit

Dit wordt de **tweede** verbinding op dit toestel. Pas nu laadt het profiel
van 55 PIDs en draait `profielTegenSteunbits()` werkelijk — de run van 20-08
deed volle discovery en kon punt 1 dus niet bevestigen.
