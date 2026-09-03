# ANDROID-PLAYSTORE.md — wat er nog tussen jou en een goedkeuring staat

Bijgewerkt: 03-09-2026. Nagelopen op de repo zoals hij nu is.

De invulteksten voor de Play Console staan in `PLAY-INZENDING.md`; dit bestand
legt uit waaróm ze zo luiden. Zie het kopje onderaan.

Dit gaat alleen over de Android-kant en de review. Voor de app zelf:
`PIDLANE.md`. Voor wat er nu speelt: de GitHub-issues.

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
| `ACCESS_FINE_LOCATION`, `maxSdkVersion=30` | eis van Android ≤11 om te mógen scannen — géén locatiefunctie, zie blokkade 1 |
| `bluetooth` / `bluetooth_le` als `uses-feature required=false` | installeerbaar op toestellen zonder BLE |

De controle in de workflow faalt nu hard als er iets uit die set ontbreekt, en
ook als er iets in staat wat er niet hoort (`ACCESS_BACKGROUND_LOCATION`,
`QUERY_ALL_PACKAGES`, `READ_PHONE_STATE`, `REQUEST_INSTALL_PACKAGES`). Een
plugin kan zulke permissies via manifest-merge meesmokkelen; dan wil je dat in
de build zien en niet in de reviewmail.

**De prominente disclosure staat er.** `pidlane-privacy.js`, getoond vanuit
`connectSerial()` vóórdat Android om "apparaten in de buurt" vraagt. Eigen
scherm, alleen over Bluetooth en voertuiggegevens, met een weigerknop die
werkt. Het akkoordscherm voor het delen van meetdata (`pidlane-klant.js`)
staat daar bewust los van: Google verbiedt het samenvoegen van een
data-disclosure met andere mededelingen.

> **27-08-2026 — let op bij het invullen van de Data safety-vragenlijst.** Dat
> akkoordscherm sprak tot die datum van "geanonimiseerde" meetdata, en dat was
> onjuist: de VIN wordt gepseudonimiseerd, niet geanonimiseerd. Google's
> vragenlijst kent "Data is anonymized" als expliciete keuze en die mag hier
> **niet** aangevinkt worden — een pseudoniem dat met een bekende VIN na te
> rekenen is, telt als persoonsgegeven. Vink aan dat er voertuiggegevens worden
> verzameld en gedeeld. Een Data safety-formulier dat afwijkt van wat de app
> doet, is een van de vaakst genoemde afwijzingsgronden.

**De privacyverklaring bestaat**, op `/privacy.html`, en de app linkt ernaar.
Vul het contactadres in vóór de inzending — `info@pidlane.nl` moet echt
bestaan, een reviewer mag erop mailen.

---

## ~~Blokkade 1 — locatie~~ — OPGELOST 21-08-2026, route (a)

**Keuze gemaakt: de app leest geen locatie meer.** `pidlane-gps.js` is uit de
repo, de bulk-recorder neemt geen positie meer op, en `privacy.html` en het
disclosurescherm zeggen dat nu ook.

Waarom (a) en niet (b): de functie wérkte al niet. `ACCESS_FINE_LOCATION` stond
op `maxSdkVersion="30"`, dus op Android 12 en hoger werd de permissie niet eens
aangevraagd en riep `watchPosition` nooit zijn callback aan — zonder foutmelding,
want de fout verdween in een lege catch. Er is dus niets verloren gegaan dat
werkte. Wat het opleverde was bovendien context, geen invoer: de klimdetectie in
de recorder draait op motorbelasting en snelheid, niet op hoogte.

Wat blijft staan is `ACCESS_FINE_LOCATION` **met** `maxSdkVersion=30`. Dat is
geen locatiefunctie maar een eis van Android 11 en ouder om überhaupt naar
Bluetooth te mogen scannen, waar `@ascentio-it/capacitor-bluetooth-serial` van afhangt.
Op moderne toestellen verschijnt hij niet in de permissielijst.

**Gevolg voor de inzending:** locatie is géén onderwerp in de Data safety-form.
Niet verzameld, niet gedeeld.

**Bewaakt door:**

- `public/test-geen-gps.js` — geen enkele module leest een positie, de module
  bestaat niet meer, en de drie verklaringen (Data safety, `privacy.html`,
  disclosurescherm) zeggen alle drie hetzelfde
- de CI faalt hard als `ACCESS_FINE_LOCATION` of `ACCESS_COARSE_LOCATION` ooit
  zónder `maxSdkVersion=30` in het manifest komt — bijvoorbeeld doordat een
  plugin hem via manifest-merge meesmokkelt
- blok 5 van de testrun controleert het in de draaiende app

Wil je hoogte ooit terug: de barometrische druk (PID `0133`) zit al in elke
meting en kost geen enkele permissie.

---

## ~~Blokkade 2 — je kunt geen APK inzenden~~ — OPGELOST 28-08-2026

**De ondertekening staat.** In build #405 (28-08, 00:51, main) draaiden de
stappen *Inject signing config* en *Verify signature* allebei echt — niet
overgeslagen. Die twee zitten achter `getekend == ja`, dus de vier
KEYSTORE-secrets staan en de `.aab` is ondertekend. `versionCode` liep mee op
405, `versionName` 3.0.0 gelijk aan `APP_VERSION`.

De uitleg hieronder blijft staan voor het geval de keystore ooit vervangen moet
worden.

### Hoe het er stond

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

### Stap 3b — de secrets voor de APK-download (03-09-2026)

Los van de ondertekening, en om een andere reden: **zonder deze twee blijft
`/download/pidlane.apk` de oude versie serveren.**

De build zette de APK tot 03-09 alleen in de artefacten van de workflow-run.
De Worker haalt hem uit R2 (`apk/pidlane.apk`). Niets verbond die twee, dus
een nieuwe build kwam nooit bij een gebruiker — zie `PIDLANE.md` §11.

Twee secrets erbij, op dezelfde plek als de KEYSTORE-secrets:

| naam | waarde |
|---|---|
| `CLOUDFLARE_API_TOKEN` | een API-token met **Object Read & Write** op de bucket `pidlane-files` |
| `CLOUDFLARE_ACCOUNT_ID` | het account-id uit het Cloudflare-dashboard (rechterkolom, of in de URL) |

Het token maak je in Cloudflare → **My Profile → API Tokens → Create Token**.
Geef hem niet meer rechten dan R2 op die ene bucket: dit token staat in een
CI-omgeving en hoeft niets anders te kunnen.

Staan ze niet, dan bouwt alles gewoon door en zegt de stap *Publiceer de APK
naar R2* in het logboek dat hij overslaat — met een `::warning`, zodat je het
in de samenvatting van de run ziet staan en niet alleen ergens halverwege een
logboek.

Staan ze wél, dan uploadt hij en **leest hij het object daarna terug om de
checksum te vergelijken**. Dat is met opzet: een upload die "ok" meldt maar
niets deed is precies de vorm waar Gradle het eerder liet afweten met een lege
signingConfig. Klopt de checksum niet, dan valt de build om in plaats van de
volgende gebruiker.

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
hangen op "verbinden…".

**Gedaan op 21-08-2026: de demoknop staat nu op het loginscherm.** Hij stond tot
die dag in het verbindscherm, dus achter de inlogmuur — terwijl de
reviewnotitie hieronder belooft dat hij op het startscherm staat. Een reviewer
zonder account zag alleen een loginformulier. De notitie en de app vertelden
twee verschillende verhalen, en juist dat is wat een reviewer opmerkt.

De knop zet géén sessie: geen token, geen rol. AI-analyse loopt via de worker en
die vraagt een geldig sessietoken, dus die route blijft dicht. Wat open gaat is
wat de demo altijd al was — gesimuleerde sensordata en de schermen eromheen.

`public/test-demo-toegang.js` bewaakt drie dingen samen: de knop staat binnen
`#loginOv` en niet in `#connOv`, hij roept een bestaande globale functie aan, en
de knoptekst is woordelijk gelijk aan wat de reviewnotitie belooft.

**Wat er nog moet:** screenshots waarop te zien is dat de app echte
meetgegevens toont, en een storebeschrijving die Bluetooth-diagnose als
kernfunctie noemt. Dat is geen code meer.

---

## ~~Blokkade 4 — targetSDK~~ — OPGELOST 28-08-2026, maar dit komt jaarlijks terug

**Play weigert per 31-08-2026 elke inzending onder API 36** — nieuwe apps én
updates. Er is verlenging aan te vragen tot 1 november. De app stond op 34.

Dat getal staat nergens in deze repo. `android/` wordt elke build opnieuw
gegenereerd, en het API-niveau komt uit het template van de Capacitor-versie in
`package.json`:

| Capacitor | targetSdk | AGP | Gradle | minSdk | JDK |
|---|---|---|---|---|---|
| 6.1.2 | 34 | 8.2.1 | 8.2.1 | 22 | 17 |
| 7.x | 35 | | | | |
| 8.5.0 | **36** | 8.13.0 | 8.14.3 | **24** | **21** |

Capacitor 7 is geen tussenstation: die geeft 35 en is ook te laag. Van 6 naar 8
dus, in één keer. minSdk 22 → 24 betekent dat Android 5.0 en 5.1 afvallen.

**De SPP-plugin moest mee en kon niet.** `@e-is/capacitor-bluetooth-serial`
staat sinds 31-12-2024 stil op 6.0.3. Vervangen door
`@ascentio-it/capacitor-bluetooth-serial` 8.0.1 — een fork die daar expliciet
voor gemaakt is. Zelfde bestandenset, zelfde namespace, zelfde plugin-naam
`BluetoothSerial`, zelfde `@CapacitorPlugin`-annotatie, alle zeven methodes die
`pidlane-bt.js` aanroept aanwezig. Zie `PIDLANE.md` §11 voor wat daaraan
onbewezen blijft.

### Zo blijft het volgend jaar klein

Drie afspraken, en ze zijn belangrijker dan de upgrade zelf.

**1. Geen SDK-nummers in de workflow.** De verleiding is om `targetSdkVersion`
te injecteren zoals de permissies. Niet doen: dan staat het getal op twee
plekken, gaat `compileSdk` er niet vanzelf in mee, en is bij de volgende
verhoging niet te zien welke wint. Laat het template het zeggen.

**2. Controleer wél, met één getal.** `PLAY_MIN_TARGET_SDK` staat bovenaan
`build-apk.yml`; de stap *Controleer target API-niveau* leest
`android/variables.gradle` en stopt de build als het daaronder zit, met de
mededeling welke Capacitor-versie je nodig hebt. Twintig seconden, in plaats van
een afwijzing bij de upload met een melding die nergens naar de oorzaak wijst.
Getoetst met tegenproef op de echte templates: 34 rood, 36 groen, eis 37 rood.

**3. Importeer Capacitor nooit in `public/`.** Alles loopt via
`window.Capacitor.Plugins.<naam>`. Daardoor koste deze major-upgrade in de
webcode nul regels — alleen commentaar. `test-capversies.js` bewaakt dat de
Capacitor-pakketten dezelfde major houden en dat de JDK meebeweegt.

**De ronde van volgend jaar is dan:** versienummer in `package.json` omhoog,
`PLAY_MIN_TARGET_SDK` omhoog, `npm install`, workflow draaien op een branch.

### En dan het deel dat geen versienummer is: edge-to-edge

Vanaf targetSdk 35 tekent de WebView onder de status- en navigatiebalk, en bij
targetSdk 36 doet de oude ontsnapping (`overlaysWebView:false` op de
StatusBar-plugin) niets meer. `pidlane.css` gebruikt daarvoor twee tokens,
`--pl-sat` en `--pl-sab`, die Capacitor's `--safe-area-inset-*` vóór `env()`
zetten — WebView onder versie 140 geeft bij `env()` verkeerde waarden terug.

Let op bij het wijzigen van de topbalk: die heeft **drie** regels (gewoon, onder
480px, en `uiL`) en alle drie zetten de padding opnieuw. Twee daarvan gooiden de
marge weg terwijl de hoogte hem wél meetelde — dan wordt de balk hoger zonder
dat de inhoud meeschuift, en dat zie je op één schermbreedte niet.

---

## De teksten zelf staan ergens anders

Alles wat de Play Console als **invulveld** vraagt — app-naam, korte en
volledige beschrijving, reviewnotitie, Data safety veld voor veld,
contentclassificatie, releasenotities, het screenshotplan — staat in
**`PLAY-INZENDING.md`**. Eén bestand, kopieerklaar.

Waarom het daar staat en niet hier: die tekst stond op 03-09-2026 even in
allebei, en dat is dezelfde vorm die `PIDLANE-WERK.md` en §11 van
`PIDLANE.md` de kop kostte. Twee lijsten van hetzelfde lopen uit de pas, en
bij een reviewnotitie merk je dat pas als de reviewer een knop zoekt die
sinds de vorige ronde anders heet.

De taakverdeling is dus:

| bestand | waarvoor |
|---|---|
| dit bestand | wat er tussen jou en een goedkeuring stáát — de blokkades, waarom een keuze zo gemaakt is, wat er misging |
| `PLAY-INZENDING.md` | de uitkomst: de tekst die je plakt, en de afvinklijst vóór de knop |

**De regel die eronder ligt blijft gelden.** Vier plekken vertellen hetzelfde
verhaal: `PLAY-INZENDING.md`, `public/privacy.html`, `public/verwijderen.html`
en het disclosurescherm in `public/pidlane-privacy.js`. Loopt er één uiteen,
dan is dat precies wat een reviewer opmerkt.

Twee dingen die de gate daarvan bewaakt, zodat ze niet op oplettendheid
hoeven te draaien:

- `public/test-demo-toegang.js` — de knoptekst in `index.html` is woordelijk
  gelijk aan wat de reviewnotitie in `PLAY-INZENDING.md` belooft, de knop
  staat vóór de inlogmuur, en de beheerdersschakelaar `feat_demo` dekt beide
  demoknoppen.
- `public/test-playteksten.js` — de invulvelden passen binnen de limieten van
  de Console, en de URL's in het inzenddocument zijn dezelfde als die de app
  en `privacy.html` noemen.

Wat de gate *niet* kan zien, en wat dus met de hand langs moet vóór het
inzenden, staat als open vinkje in §16 van `PLAY-INZENDING.md`.


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
