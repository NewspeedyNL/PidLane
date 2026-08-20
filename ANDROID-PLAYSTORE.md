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
Vul het contactadres in vóór de inzending — `info@pidlane.nl` moet echt
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

Toegevoegd: `bundleRelease`, plus ondertekening in CI zodra de secrets staan.
Zonder die secrets bouwt alles gewoon door en komt er een ongetekende `.aab`
uit — de stap "Prepare signing" zegt in het logboek welke van de twee het is
geworden. De debug-APK is het dagelijkse werkpaard en mag niet stukgaan omdat
de Play Store-route nog niet af is.

### Stap 1 — keystore maken

Kies **Play App Signing**. Je maakt dan een *upload*-keystore. Raak je die
kwijt, dan kan Google hem resetten; bij zelfbeheer is je app definitief
onbereikbaar en is er geen beroepsprocedure.

In Termux:

    pkg install openjdk-17
    cd ~
    keytool -genkeypair -v \
      -keystore pidlane-upload.jks \
      -alias pidlane \
      -keyalg RSA -keysize 2048 \
      -validity 10000

Wat hij vraagt:

- **Keystore-wachtwoord** — sterk, en meteen in je wachtwoordmanager. Je krijgt
  hem nooit meer te zien.
- **Voor- en achternaam (CN)** — vul `PidLane` in. Dit is geen
  identiteitscontrole; het staat alleen in het certificaat.
- **Key-wachtwoord** — enter drukken gebruikt hetzelfde als de keystore. Dat is
  eenvoudiger en niet minder veilig.

`-validity 10000` is bijna 27 jaar. Google eist geldigheid tot ver na 2033, dus
korter niet doen.

### Stap 2 — back-up, meteen

Dit is de stap die wordt overgeslagen en waar het misgaat.

    gpg --symmetric --cipher-algo AES256 ~/pidlane-upload.jks

Dat geeft `pidlane-upload.jks.gpg` — kies daarvoor een **ander** wachtwoord dan
de keystore. Die versleutelde kopie kan naar R2 (`pidlane-files`, in een eigen
map zoals `keys/`, **niet** onder `apk/` want dat pad serveert de Worker
publiek).

Drie dingen apart houden; één lek mag nooit genoeg zijn:

| wat | waar |
|---|---|
| het bestand | R2, versleuteld |
| GPG-wachtwoord | wachtwoordmanager |
| keystore-wachtwoord | wachtwoordmanager, aparte regel |

Cloudflare Worker Secrets en Secrets Store zijn hiervoor **ongeschikt**: die
zijn write-only. Je stopt er iets in en krijgt het nooit meer terug — precies
het scenario waarin je een back-up nodig had.

Zet in `.gitignore`:

    *.jks
    *.keystore

### Stap 3 — secrets in GitHub

De keystore moet als tekst in een secret, dus eerst omzetten:

    base64 -w0 ~/pidlane-upload.jks > ~/keystore.b64

Ga naar de repo op github.com → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**. Vier stuks:

| naam | waarde |
|---|---|
| `KEYSTORE_BASE64` | de volledige inhoud van `keystore.b64` |
| `KEYSTORE_PASSWORD` | het keystore-wachtwoord |
| `KEY_ALIAS` | `pidlane` |
| `KEY_PASSWORD` | het key-wachtwoord (gelijk aan het keystore-wachtwoord als je enter drukte) |

Let op bij het plakken van `KEYSTORE_BASE64`: het is één lange regel zonder
witruimte. `-w0` zorgt daarvoor; zonder die vlag knipt base64 op 76 tekens en
werkt het niet.

Verwijder daarna `~/keystore.b64` van je toestel. De keystore zelf houd je.

### Stap 4 — bouwen en controleren

Push, of start de workflow handmatig. In het logboek hoort te staan:

    Keystore geladen en leesbaar.
    OK: signingConfig toegevoegd
    Bundle is ondertekend.

Die laatste controle is er niet voor niets: Gradle tekent stil door met een
lege signingConfig als een omgevingsvariabele ontbreekt. Dan krijg je een
`.aab` die er goed uitziet en pas bij de upload naar Play wordt geweigerd, met
een melding die nergens naar de oorzaak wijst.

De keystore wordt na de build van de runner verwijderd (`if: always()`), ook
als de build faalt.

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

## Reviewnotitie en storebeschrijving

Vier plekken moeten hetzelfde verhaal vertellen. Loopt er één uiteen, dan is
dat precies wat een reviewer opmerkt — en het kost je een afwijzing waar je
weken op wacht.

| plek | waar | wat |
|---|---|---|
| Reviewnotitie | Play Console → release → *App access* | hoe je zonder hardware bij de functionaliteit komt |
| Storebeschrijving | Play Console → *Store listing* | Bluetooth-diagnose als kernfunctie |
| Data safety-form | Play Console → *App content* | gelijk aan `privacy.html` |
| In de app | `pidlane-privacy.js` + `privacy.html` | onderling gelijk |

### De reviewnotitie zelf

Een reviewer heeft geen auto en geen OBD2-adapter. Zonder uitleg krijgt hij een
app die blijft hangen op "verbinden", en dat leest als kapot in plaats van als
ontbrekende hardware. De demoknop is hier je sterkste kaart. Tekst om te
plakken in *App access*:

> PidLane leest de boordcomputer van een auto uit via een OBD2-adapter in de
> diagnosepoort. De hoofdfunctie vereist die hardware en een voertuig, en is
> daarom niet volledig te beoordelen zonder beide.
>
> Voor de review is er een demomodus die zonder adapter en zonder auto werkt.
> Op het startscherm staat de knop "Try demo — no adapter needed", direct
> onder de verbindknop. Daarna kies je een voorbeeldvoertuig (of vult een
> Nederlands kenteken in) en draait de app op opgenomen meetdata: live
> sensorwaarden, foutcodes, grafieken en het diagnoserapport.
>
> Er is geen account nodig voor de demo.
>
> De Bluetooth-permissie wordt uitsluitend gebruikt om de OBD2-adapter te
> vinden en ermee te communiceren. De scanpermissie is aangevraagd met
> neverForLocation; de app bepaalt geen locatie via Bluetooth. Vóór het eerste
> verbinden toont de app hiervoor een aparte uitleg met een weigeroptie.
>
> Vragen: info@pidlane.nl

**Controleer vóór de inzending dat de demo aanstaat.** `startDemo()` zit achter
`featOn('feat_demo')`, en die leest `PID_CONFIG` uit Airtable (AppConfig-tabel).
Staat `feat_demo` daar op `false`, dan verbergt `applyFeatureToggles()` de knop
zelfs met CSS — de reviewer ziet hem dan niet eens, terwijl je notitie ernaar
verwijst. Standaard staat hij aan; het risico zit in een oude configregel.

### Storebeschrijving

Tegen de "minimum functionality"-toets moet de beschrijving expliciet maken dat
er native hardwarefunctionaliteit in zit die een browser niet kan. Noem in de
eerste alinea:

- verbinding met een OBD2-adapter via Bluetooth
- uitlezen van foutcodes en live sensorwaarden uit het voertuig
- dat het om diagnose van een echte auto gaat, niet om een informatie-app

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
- [ ] `info@pidlane.nl` bestaat en wordt gelezen
- [ ] `privacy.html` bereikbaar op de publieke URL
- [ ] Disclosure getest op een schoon toestel: hij hoort te verschijnen vóór het
      Android-permissiedialoog, niet erna
- [ ] Weigerknop getest: geen permissieverzoek, geen verbinding, app blijft heel
- [ ] Data safety-form ingevuld en gelijk aan `privacy.html`
- [ ] Reviewnotitie ingevuld in *App access* (tekst hierboven)
- [ ] `feat_demo` staat AAN in de AppConfig-tabel — anders is de demoknop
      verborgen en klopt je reviewnotitie niet
- [ ] Demo één keer doorlopen op een schoon toestel zonder adapter
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
