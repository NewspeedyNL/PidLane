# ANDROID-PLAYSTORE.md — wat er nog tussen jou en een goedkeuring staat

Bijgewerkt: 20-08-2026. Nagelopen op de repo zoals hij nu is.

Dit gaat alleen over de Android-kant en de review. Voor de app zelf:
`PIDLANE.md`. Voor het werkplan: `PLAN.md`.

---

## Wat er nu goed staat

**De Bluetooth-permissies kloppen.** `.github/workflows/build-apk.yml`
injecteert ze na `cap add android`, want de `android/`-map staat niet in de
repo — die wordt elke build opnieuw gegenereerd. De set:

| permissie | waarom |
|---|---|
| `BLUETOOTH_SCAN` + `neverForLocation` | adapter zoeken, zonder plaatsbepaling |
| `BLUETOOTH_CONNECT` | praten met een gekoppelde adapter |
| `BLUETOOTH` / `BLUETOOTH_ADMIN`, `maxSdkVersion=30` | Android 11 en ouder |
| `ACCESS_FINE_LOCATION`, `maxSdkVersion=30` | eis van Android ≤11 om te mógen scannen |
| `bluetooth` / `bluetooth_le` als `uses-feature required=false` | installeerbaar op toestellen zonder BLE |

De controle in de workflow faalt nu hard als er iets uit die set ontbreekt, en
ook als er iets in staat wat er niet hoort (`ACCESS_BACKGROUND_LOCATION`,
`QUERY_ALL_PACKAGES`, `READ_PHONE_STATE`, `REQUEST_INSTALL_PACKAGES`). Een
plugin kan zulke permissies via manifest-merge meesmokkelen; dan wil je dat in
de build zien en niet in de reviewmail.

**De prominente disclosure staat er.** `pidlane-privacy.js`, getoond vanuit
`connectSerial()` vóórdat Android om "apparaten in de buurt" vraagt. Eigen
scherm, alleen over Bluetooth en voertuiggegevens, met een weigerknop die
werkt. Het akkoordscherm voor geanonimiseerde meetdata (`pidlane-klant.js`)
staat daar bewust los van: Google verbiedt het samenvoegen van een
data-disclosure met andere mededelingen.

**De privacyverklaring bestaat**, op `/privacy.html`, en de app linkt ernaar.
Vul het contactadres in vóór de inzending — `privacy@pidlane.nl` moet echt
bestaan, een reviewer mag erop mailen.

---

## Blokkade 1 — locatie: kies, en doe het vóór de inzending

De app gebruikt `navigator.geolocation.watchPosition` in `pidlane-bulk.js`
(`gpsStart`) en `pidlane-gps.js`, voor hoogteverschil bij klimbelasting. Maar
het manifest zet `ACCESS_FINE_LOCATION` op `maxSdkVersion="30"`. Op Android 12
en hoger wordt die permissie dus niet eens aangevraagd: **de GPS-functie is
daar stil kapot.** Niet met een foutmelding — `watchPosition` roept gewoon nooit
zijn callback aan.

Twee wegen, en er is geen derde:

**(a) GPS laten vallen.** Laat `maxSdkVersion=30` staan en haal de
`geolocation`-aanroepen uit `pidlane-bulk.js` en `pidlane-gps.js`. Dan is
locatie geen onderwerp in de Data safety-form en is dit hoofdstuk klaar. Dit is
de snelste route door de review.

**(b) GPS houden.** Haal `maxSdkVersion` weg bij `ACCESS_FINE_LOCATION`,
declareer locatie in de Data safety-form, en bouw een aparte disclosure vóór de
eerste ritopname — locatie is een *sensitive permission*, en zonder eigen
disclosure is afwijzing vrijwel zeker. `pidlane-privacy.js` heeft de vorm al;
er moet een tweede scherm bij met een eigen versienummer.

Tot die keuze gemaakt is staat (a) aan. Liever een functie die aantoonbaar uit
staat dan een permissie die je in een reviewgesprek niet kunt verdedigen.

---

## Blokkade 2 — je kunt geen APK inzenden

De workflow bouwde alleen `assembleDebug`. Daar komt de Play Store niet mee
overweg: nieuwe apps moeten als **Android App Bundle (.aab)** worden ingezonden,
en een debug-build wordt sowieso geweigerd.

Toegevoegd: `bundleRelease`, met de `.aab` als apart artefact. Die is
**ongetekend** — een keystore hoort niet in een repo en niet in een
build-artefact.

Ondertekenen kan op twee manieren:

1. **Play App Signing** (aanbevolen). Je maakt eenmalig een upload-keystore, tekent
   daarmee, en Google beheert de distributiesleutel. Raak je je upload-sleutel kwijt,
   dan kun je hem laten resetten — bij zelfbeheer is je app definitief onbereikbaar.
2. **Zelf tekenen** met `jarsigner`/`apksigner` vóór de upload.

Wil je het in CI doen, dan gaan keystore (base64) en wachtwoorden in GitHub
Secrets en komt er een signing-stap bij. Doe dat pas als de rest staat; een
lekkende keystore is niet te repareren.

---

## Blokkade 3 — "minimum functionality"

`capacitor.config.json` zet `server.url` op `https://app.pidlane.nl`. De APK is
dus een WebView-schil om de live site. Google weigert apps die niet meer zijn
dan een verpakte website.

PidLane is verdedigbaar — er zit echte native functionaliteit in (Bluetooth
Serial en BLE naar de OBD2-adapter, bestandsopslag, delen) en dát is precies wat
een browser niet kan. Maar je moet het wel uitleggen. Zet in de
storebeschrijving en in de reviewnotitie expliciet dat de app via Bluetooth met
diagnosehardware in het voertuig praat.

Reken erop dat een reviewer het probeert zonder auto en zonder adapter. Zorg dat
het scherm dat hij dan ziet uitlegt wat hij mist, in plaats van te blijven
hangen op "verbinden…". Overweeg een demomodus die zonder hardware iets laat
zien — dat is het verschil tussen "onbruikbaar" en "ik had geen adapter".

---

## Data safety-form

Wat je aankruist moet kloppen met `privacy.html` én met de disclosure in de app.
Een tegenstrijdigheid tussen die drie is een afwijzing waar je lang op wacht.

| categorie | verzameld | gedeeld | reden |
|---|---|---|---|
| E-mailadres | ja | nee | account en inloggen |
| App-activiteit (diagnoses) | ja | nee | rapporten bewaren bij het account |
| Apparaat-/andere gegevens (VIN, sensorwaarden) | ja | ja | AI-analyse via Anthropic |
| Locatie | **hangt af van blokkade 1** | nee | hoogte bij ritopname |
| Foto's/media, contacten, agenda, sms | nee | nee | — |

Vermeld bij "gedeeld" dat meetwaarden naar de aanbieder van het taalmodel gaan.
Dat is echt delen met een derde partij, ook al staat er geen naam bij.

---

## Vóór je op inzenden drukt

- [ ] Keuze gemaakt bij blokkade 1, en het manifest komt overeen met de code
- [ ] `.aab` gebouwd, ondertekend, `versionCode` hoger dan de vorige inzending
- [ ] `privacy@pidlane.nl` bestaat en wordt gelezen
- [ ] `privacy.html` bereikbaar op de publieke URL
- [ ] Disclosure getest op een schoon toestel: hij hoort te verschijnen vóór het
      Android-permissiedialoog, niet erna
- [ ] Weigerknop getest: geen permissieverzoek, geen verbinding, app blijft heel
- [ ] Data safety-form ingevuld en gelijk aan `privacy.html`
- [ ] Reviewnotitie met uitleg over de OBD2-hardware, en wat een reviewer
      zonder adapter te zien krijgt
- [ ] Storebeschrijving noemt de Bluetooth-diagnosefunctie als kernfunctie

---

## Wat er verder opviel

**De build-trigger is smal.** Hij vuurt op `public/index.html`,
`public/privacy.html`, `package.json`, `capacitor.config.json`, het icoon en de
workflow zelf. De ~40 losse JS-modules staan er niet in, en dat klopt: de APK
laadt de app live via `server.url`, dus JS-wijzigingen komen vanzelf mee zodra
Cloudflare ze serveert. Een nieuwe APK is alleen nodig bij een verandering in
config, icoon of permissies.

**De camera-permissie zit er nog in** voor de QR-scanner in
`pidlane-remote.js` (`BarcodeDetector` + `getUserMedia`, koppelen local ↔
expert). Die is in gebruik, dus hij mag blijven. Sloop je die functie ooit, haal
dan ook de permissie en de `uses-feature`-regels weg — een permissie die je niet
gebruikt is een vraag die je niet wilt krijgen.
