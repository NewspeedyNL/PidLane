# PIDLANE.md — architectuurkaart

> Doel van dit bestand: Claude (of een nieuwe medewerker) moet hiermee weten
> **welk bestand je nodig hebt** zonder de code te lezen. Het staat in de repo en
> nergens anders — een kopie in een kennisbank loopt achter en gaat de code
> tegenspreken. Bij elke structuurwijziging bijwerken.
>
> Laatst bijgewerkt: 2026-09-01 — testrun 6.0: #74 gerepareerd (de ritwaarnemer
> telt verversingen in plaats van geheugen, §11) en de begeleide rit erbij —
> tien stappen met markeringen, pauze en een afrondknop die het verslag altijd
> wegschrijft, plus wat er verder te automatiseren valt (§20).
> Daarvóór dezelfde dag: evaluatie van de testrun van 22:32, de eerste rit sinds
> drie opleveringen: zes meetfouten in de testrun zelf (§11, issues #74 t/m
> #79), waarvan één de sluiting van #19 onderuithaalt.
> Daarvóór dezelfde dag: issues #68 en #66: de slimme weergave is de
> STANDAARDweergave (en de opgeslagen voorkeur wordt eindelijk teruggelezen),
> er is een vierde vak "Tellerplaat" met verticale meters voor het gaspad, en
> een temperatuurbalk zonder bekende grens zegt dat zelf (§11).
> Daarvóór dezelfde dag: issues #58 t/m #62 — één token `--pl-top`
> voor de onderkant van de topbalk (§11), plafond op de bevindingenbalk,
> vierde weergave "Slim", en het venster "Voor de analyse" dat de AI vertelt
> of start/stop meedeed.
> Daarvóór: 2026-08-27 — werkafspraken herschreven voor het werken
> rechtstreeks in de repo (§9), `CLAUDE.md` en `PROJECT-INSTRUCTIES.md` erbij.
> Daarvóór dezelfde dag: toestemmingsteksten kloppen weer met de
> verwerking (pseudoniem, niet anoniem), tweede VIN-lek in de logroute dicht,
> akkoord op de oude tekst telt niet meer mee, `worker.js` vastgelegd als
> eigen bron, auto-merge na een groene testgate, topbar van vier chips naar
> één systeem-chip.
> Daarvóór: 2026-08-25 — testgate in CI, CORS dicht op de AI- en
> dataroutes, VIN niet langer ruw naar Airtable, admin.html uit `public/`.
> Daarvóór: 2026-08-20 — steunbitpoort, logboek, privacy-disclosure,
> startscherm per adaptertype, wizard van zes stappen naar één.
> Daarvóór: 2026-08-01, na ronde 5 van de PID-gate (herijking).

---

## 1. Wat is PidLane

Nederlandstalige B2B-webapp voor OBD2-voertuigdiagnose met AI-rapportage.
Doelgroep: garagehouders, autobedrijven, dealers en wagenparkbeheerders.
Sinds juli 2026 ook een consumentenkant: bezoekers registreren zichzelf en
betalen per analyse met tokens (zie §7 en §8).
Solo-project, naast een baan — onderhoudslast is een harde ontwerprandvoorwaarde.

**Testvoertuigen:** Mazda CX-5 2.0 SkyActiv-G 2018 (CAN, benzine), Renault Clio 2007.
**Adapters:** OBDLink MX+ (STN-chipset, Bluetooth Classic SPP, 115200 baud) voor
garagegebruik; Vgate iCar Pro BT 3.0 voor consumenten.

**De MX+ liegt op `ATI` — bevestigd 25-08 en opnieuw 26-08-2026.** Hij antwoordt
daar met `ELM327 v1.4b`, puur voor compatibiliteit. Eerder is daar de conclusie
"clone zonder STN-chip" uit getrokken en die stond een tijd als feit in dit
document. Het onderscheid is één commando dat geen enkele echte ELM327 kent:

| commando | antwoord op de MX+ |
|---|---|
| `ATI`  | `ELM327 v1.4b` — zegt niets over de chip |
| `STI`  | `STN2255 v5.12.4` — een clone antwoordt hier `?` of niets |
| `STDI` | `OBDLink MX+ r3.1.3` |

Gevolg: **STPX en MS-CAN zijn beschikbaar.** Met STPX geef je per commando een
eigen timeout en een verwacht aantal frames mee, waarmee het gokken met
batchgroottes, de zelflerende `PLPidLen` en de terugval van drie-naar-één op
termijn kunnen verdwijnen — geen optimalisatie maar een hele laag minder.

Nog niet ingebouwd, en één meting waarschuwt tegen haast: blok 13 van testrun
4.7 mat bij stilstand gewoon 154 ms tegen STPX 167 ms (+8%). Dat is het
gúnstigste geval (rustige bus). De vraag is of STPX wint als de bus vol staat,
en die meet je alleen tijdens het rijden met alle vier de aanvragers aan.
Blok 12 toont de identiteit, blok 13 de snelheid; MS-CAN is bewust ongemoeid,
want dat vraagt een protocolwissel en die hoort niet in een rijdende testrun.

---

## 2. Domeinen en deploy

| Wat | Waar |
|---|---|
| App | `app.pidlane.nl` — custom domain op Worker `pidlane-proxy` |
| Marketing/pitch | `pidlane.nl` — GitHub Pages, aparte repo `PidLane-Pitch` |
| App-repo | `NewspeedyNL/PidLane` |
| Deploy | **Cloudflare Workers Builds via `git push`** — enige deploypad |
| APK | R2-bucket `pidlane-files`, gebouwd met Capacitor + GitHub Actions |
| App-ID | `app.pidlane.obd` |

> **Geen lokale wrangler.** De werklaptop blokkeert Node.js. Secrets gaan via
> Dashboard → Worker → Settings → Variables and Secrets, niet via CLI.

`wrangler.toml`: assets uit `./public/`, R2-binding `FILES`, Durable Object
`REMOTE_SESSION` (class `RemoteSessionDO`, SQLite-opslag). Alles wat niet in
`run_worker_first` staat wordt direct als bestand geserveerd.

> **Let op bij tegoedwijzigingen:** `worker.js` en `public/` moeten in dezelfde
> push mee. Loopt de een voor op de ander, dan draait er even een versie waarin
> niemand betaalt of juist dubbel.

---

## 3. Bestandsstructuur

```
PidLane/
├─ worker.js               (134 KB) Cloudflare Worker: auth, proxy, Airtable, DO, tegoed
│                                  ← bundel én bron, met de hand onderhouden (§6)
├─ wrangler.toml                    assets + R2 + DO-bindings
├─ capacitor.config.json            webDir "www", server.url app.pidlane.nl
├─ plcheck.sh                       validatie voor een commit (zie §11)
├─ CLAUDE.md                        werkregels die Claude Code elke sessie leest (§9)
├─ PIDLANE-ARCHIEF.md               afgehandelde bevindingen ouder dan twee weken (staart van §11)
├─ PIDLANE-CONTRACT.md              ontwerp: meetkwaliteit en sessiedekking (nog niet gebouwd)
├─ PROJECT-INSTRUCTIES.md           de tekst voor het instructieveld van het Claude-project
├─ .github/workflows/
│  ├─ build-apk.yml                 APK- en .aab-build
│  ├─ tests.yml                     testgate: plcheck.sh, plmutate.sh, sleutelscan
│  └─ automerge.yml                 voegt een PR samen zodra de testgate groen is
├─ admin/
│  ├─ admin.html          (85 KB)  admin-, gebruikers-, klant- en codebeheer
│  ├─ beheer.html         (95 KB)  tweede generatie: idem + klanten aanmaken,
│  │                               logboek uittekenen, tabellenbrowser, CSV
│  ├─ serve.js                      lokale server voor allebei (npm run admin)
│  └─ LEESMIJ.md                    hoe je ze lokaal draait
└─ public/                          ← alles hier wordt PUBLIEK geserveerd
   ├─ index.html           (203 KB) HTML-structuur + bootstrap + script-tags
   ├─ config.js            (3 KB)   PROXY_URL, AIRTABLE_URL, APP_VERSION
   ├─ pidlane.css          (157 KB) hoofdstylesheet
   ├─ pidlane-*.js         (39 modules, zie §4)
   └─ test-*.js            (38 tests, draaien via plcheck.sh)
```

> **admin.html staat bewust buiten `public/`.** Alles in `public/` wordt door de
> Worker als statisch bestand geserveerd; tot 25-08-2026 was de beheerpagina
> daarmee voor iedereen te openen op `https://app.pidlane.nl/admin.html`. Dat
> lekte geen gegevens — elke admin-route controleert `ADMIN_TOKEN` server-side —
> maar het zette de complete beheerkant publiek in de etalage. Draaien doe je
> hem nu lokaal met `npm run admin`; zie `admin/LEESMIJ.md`.

`index.html` was 735 KB en is op 2026-07-28 opgesplitst naar ~203 KB. Daarvan
was ~139 KB echte HTML-markup, ~42 KB build-changelog in commentaar, ~11 KB
inline CSS en ~8,5 KB inline bootstrap-JS. Die changelog is op 28-08-2026 naar
`CHANGELOG.md` gegaan; gemeten op 02-09-2026 is het bestand 176 KB.

---

## 4. Modules — laadvolgorde en verantwoordelijkheid

> **De volgorde is functioneel, niet cosmetisch.** Zie §5.
> 52 script-tags: `capacitor.js`, `config.js` en 50 `pidlane-*.js`-modules.
> (21-08: `pidlane-gps.js` eruit, `pidlane-run.js` erbij — telling ongewijzigd.)
> `plcheck.sh` controleert dat elke module in `index.html` hangt en dat
> `pidlane-bedrading.js` achteraan staat.

### Fase 1 — data en assets (in `<head>`)

| # | Module | KB | Doet |
|---|---|---|---|
| 1 | `capacitor.js` | — | alleen in APK aanwezig; `onerror` vangt het web-geval af |
| 2 | `config.js` | 3 | `PROXY_URL`, `AIRTABLE_URL`, `APP_VERSION`, repo-info |
| 3 | `pidlane-data.js` | 100 | statische referentiedata: 148 J1979-PID-definities, `DTCDB` (generiek) + `DTC_MERK` (merkbuckets) + `merkGroep()`, kennisbank, analysesets, `PID_TEKST`, `slimGroep()`/`SLIM_DASH`/`SLIM_METER` (de VORM van de slimme weergave; de MAAT — en daarmee het vijfde vak "Rustig" — zit in `slimMaat()` in `pidlane-pids.js`) |
| 4 | `pidlane-assets.js` | 205 | ingebedde media (base64), o.a. `BANDEN_IMG` |

### Fase 2 — kern (in `<body>`, rond regel 2128)

| # | Module | KB | Doet |
|---|---|---|---|
| 5 | `pidlane-auth.js` | 39 | login, HMAC-sessietokens, adminpaneel, gebruikersbeheer, API-sleutelbeheer |
| 6 | `pidlane-pidgate.js` | 18 | **de PID-gate**: `pidGate()`, `herijkPidGate()`, `pidToevoegen()`, `vehiclePlausiblePid()`, turbo-detectie, herijkstempel, `getPidDef()`, `isReportableSensor()` — zie §15 |
| 7 | `pidlane-kwaliteit.js` | 9 | **datakwaliteit**: `assessPidQuality()` (`ok`/`twijfel`/`onzin`/`nodata`), `buildQualityReport()`, `_qualityBlokFor()`, `RAPPORT_DISCLAIMER` + `_withDisclaimer()` — vult `_pidHealth`, zie §15 |
| 8 | `pidlane-veldlab.js` | 49 | meetsessieregistratie → Referentie-store (`PidLaneEvalLog`) |
| 9 | `pidlane-datalog.js` | 28 | datalog, `validateAndSmooth`, outlierdetectie, stabiliteit, protocolkeuze |
| 10 | `pidlane-archief.js` | 30 | sessierapportarchief, AI-rapporthook, TXT/PDF-export, **de Android-terugknop** (`appBack`) — de enige luisteraar op `backButton`, zie §11 01-09 — en **het venster "Voor de analyse"** (`plVoorAnalyse`, `PL_VOORVRAGEN`, `plMeetcontextPromptLine`): hergebruik van eerdere rapporten én de meetcontext-vragen in één sheet, zie §11 01-09 |
| 11 | `pidlane-pids.js` | 31 | PID-paneel, gauges, breedband-lambdacorrectie B1S1, de vier weergaven (Trends/Getallen/Puntjes/**Slim**, met Slim als standaard) incl. `slimTempSchaal()`, `slimBeweegt()`, `slimMeterSchaal()`/`slimPiek()` (de tellerplaat) en `plPidViewHerstel()` — de enige plek die bepaalt waarin de live view start |
| 12 | `pidlane-correlatie.js` | 8 | deterministische PID-correlatie-engine + de bevindingenbalk: hoogstens `BEV_MAX` (2) in beeld, de rest in een venster, aan/uit via ☰ — de AI krijgt via `correlationLines()` altijd alles |
| 13 | `pidlane-totalcheck.js` | 51 | Total Check — volledige voertuigdoorlichting |
| 14 | `pidlane-diagnose.js` | 20 | Smart Diagnose + klacht-gestuurde PID-focus |
| 15 | `pidlane-graph.js` | 14 | multi-line groepstrends, DTC-scanstatus |
| 16 | `pidlane-fuel.js` | 74 | brandstofanalyse, `apiFetch` (alle AI-calls), modelkeuze/kosten |
| 17 | `pidlane-btflow.js` | 42 | Bluetooth-verbindingsflow (multi-step) + diagnostieklog |
| 18 | `pidlane-bt.js` | 84 | **transportlaag**: BLE, SPP, Web Serial, batch-polling, protocolinit. Bevat de **ELM-poort**: tijdens een (her)initialisatie weigeren `sendCmd`/`sendBT` al het overige verkeer — hard, niet adviserend zoals `PLBus`. Zie §11, opgelost 15-08 |
| 19 | `pidlane-voertuigdata.js` | 15 | voertuigdata-merge: VIN-WMI + NHTSA + RDW |
| 20 | `pidlane-rijsituatie.js` | 44 | rijsituatie/bijzonderheden — context voor de AI |
| 22 | `pidlane-diagbundel.js` | 17 | diagnosebundel: ruwe TX/RX mét parser-uitkomst |
| 22b | `pidlane-busgate.js` | 6 | `PLBusGate` — **de bus-poort**: één ladder `adapter → ecu → betrouwbaar` voor "leeft de bus, mag ik hier een oordeel op bouwen". Vereist `PLBus` uit `pidlane-data.js` |
| 22d | `pidlane-aanlevering.js` | 25 | `PLAanlevering` — **wat de AI over de MEETKWALITEIT hoort** (#188). Eén blok aan de systeemprompt via `apiFetch`: de vraag, het meetvenster, de dekking (welke sensoren nodig waren, welke ontbreken en waaróm), de onderbrekingen mét hun naam (telefoon of bus, via `plGatDuiding()`), het `DATAKWALITEIT`-blok en de weegregels. Leest alles bij de aanroep uit `PLRit`/`PLAchtergrond`/`buildQualityReport`; velt zelf geen enkel oordeel dat elders al staat. Tests: `test-aanlevering.js`, blok 5 |
| 22c | `pidlane-bedrading.js` | 1 | **bedradingscontrole** — lijst van functies die modules van elkaar verwachten + controle of ze bestaan. **Moet als laatste script geladen worden.** Zie §19 |
| 22f | `pidlane-testrun.js` | 1 | **de testrun** — één admin-knop die de app in vier blokken nameet (bedrading, schermen, PID-sweep over álles, bus en regelkringen) en één logboek oplevert. Overschrijft de PID-selectie tijdelijk en herstelt die in een `finally` én na een crash. Vervangt busdiagnose, zelftest, opdracht, diagnosebundel-UI, logscherm en copiloot |
| 22g | `pidlane-export.js` | 1 | **opslaan** — `plOpslaan()` vraagt eerst tekst of PDF en maakt in beide gevallen hetzelfde bestand. De PDF krijgt de huisstijl van het AI-rapport: blauwe kopband op elke pagina, voertuigblok, monospace inhoud met statuskleuren, paginanummers. Gebruikt door testrun, logboek en sessierapporten. Test: `test-export.js` |
| 23 | `pidlane-plload.js` | 22 | `PLLoad` — automatische busbelastingsregeling (AIMD) |
| 25 | `pidlane-demo.js` | 11 | demomodus met gesimuleerde data |
| 26 | `pidlane-uihelpers.js` | 18 | kebabmenu, overlays, toasts, topbalkstatus — `updateTopbarStatus()`/`updateSysDot()`, zie de topbar-paragraaf in §4 |
| 27 | `pidlane-motortype.js` | 26 | motortype-splitsing poll-scheduler, `autoExpertAsk`, `wizRdwLookup` |
| 28 | `pidlane-theme.js` | 14 | thema, lettertype, zoom, **sessieherstel bij boot** |
| 29 | `pidlane-neon.js` | 12 | neon dashboard — ronde meters |
| 30 | `pidlane-rit.js` | 29 | ritanalyse |
| 31 | `pidlane-koopcheck.js` | 133 | koopcheck / aankoopkeuring, proefritmodule |
| 32 | `pidlane-dossier.js` | 7 | export voertuigdossier |

### Fase 3 — onderaan de body (regel ~2291)

| # | Module | KB | Doet |
|---|---|---|---|
| 33 | `pidlane-remote.js` | 50 | `PLRemote` — remote-expertsessies, Durable Object, WebSocket-fanout, QR-pairing, vstate |
| 34 | `pidlane-caravan.js` | 30 | caravan-rittracker, live brandstofcoach, 10 coachregels met cooldowns |
| 35 | `pidlane-wizard.js` | 28 | `PLWizard` — vragenboom → meetplan → modules |
| 36 | `pidlane-onderdeel.js` | 24 | `PLOnderdeel` — DTC + live data → verdacht component |
| 37 | `pidlane-verify.js` | 13 | `PLVerify` — Laag C, focusverificatie (claimt bus via `window._pollBusy`) |
| 38 | `pidlane-monitor.js` | 18 | `PLMon` — Laag A, passieve foutoogst (mode 0101/07/03/0A/02) |
| 39 | `pidlane-credits.js` | 34 | `PLCredits` — kostenvenster vóór AI, saldoteller, activatiecode inwisselen |
| 40 | `pidlane-klant.js` | 30 | `PLKlant` — klantregistratie, klantlogin, wachtwoordherstel, "Mijn tokens" |
| 41 | `pidlane-watchers.js` | 20 | `PLWatch` — Laag B, ruwe-signaalwatchers op `pidHist` |
| 42 | `pidlane-uitgebreid.js` | 8 | `PLUitgebreid` — fabrikant-PIDs buiten mode 01 (mode 21), `pidCmd()`/`isMode01()`, probe na verbinden |
| 43 | `pidlane-waakronde.js` | 13 | `PLWaak` — stille achtergrondcontrole van sensoren buiten je selectie; claimt de bus 3 PIDs per 12s, oordeelt per meting, ambient strook |
| 44 | `pidlane-bulk.js` | 27 | `PLBulk` — passieve bulk-datarecorder (IndexedDB). Eerste echte opname 19-08: 101 monsters op 1 Hz, 55 PIDs, geen gaten |
| 45 | `pidlane-recall.js` | 16 | terugroepacties en servicebulletins per voertuig |
| 46 | `pidlane-run.js` | 15 | `PLRun` — de Run-chip in de topbar: één plek waar staat wat er op de achtergrond draait (rit-monitor, bulk-recorder, waakronde, caravan, rit-analyse) en waar het uit kan. Leest de staat bij het tekenen uit de bron; wrapt niets. Caravan en rit-analyse vragen bevestiging bij stoppen. **Let op:** `caravanActive` en `ritActive` staan in script-scope, niet op `window` — zie `test-run.js` |
| 47 | `pidlane-mode06.js` | 16 | mode 06 — testresultaten van de boordmonitors |
| 47b | `pidlane-kmcheck.js` | 26 | `PLKm` — de kilometerstand-check. Vraagt 01A6 en 0131 functioneel, en mode 22 per stuurapparaat met een eigen `ATSH`/`ATCRA` (7E0 PCM, 720 IPC, 726 BCM, 760/7B0 ABS). Kruist de antwoorden op **CAN-adres**, niet op identifier: twee DIDs uit dezelfde doos bevestigen elkaar niet. Zet de adapter in een `finally` terug op 7DF. Vereist `sendCmd` + `withBus`; hangt in `index.html` direct ná `pidlane-mode06.js`. Knop in stap 2 van de koopcheck |
| 47c | `pidlane-kaart.js` | 27 | `PLKaart` — de datapuntenkaart. **Neemt de verbinding over**: busslot met `PLBus.raak()`-hartslag, `ATH1`, `ATAT0`, korte `ATST`, en zet alles in een `finally` terug. Ontdekt stuurapparaten door de sweep 700-7FF (of 18DAxxF1 bij 29-bit) en leest het antwoordadres **uit de header**, niet uit zender+8. Enumereert daarna per module de mode 01/06/09-bitmaps, de mode 22-identifiers uit een getrapte lijst, en mode 21. Tweede pas markeert wat beweegt. `magVerzenden()` is één leespoort: niets dat schrijft komt erdoor. Knop in het testrunpaneel (blok 15) |
| 48 | `pidlane-export.js` | 20 | `plOpslaan`/`plMaakPdf` — jsPDF in huisstijl |
| 49 | `pidlane-testrun.js` | 76 | één knop, één rit, één logboek. Vervangt busdiag/zelftest/opdracht/diagbundel/logscherm/copiloot — zie §20 |
| 50 | `pidlane-logboek.js` | 16 | `PLLogboek` — voegt vier logbronnen samen in één tijdlijn: `log()` (500 regels, via `plLokaalLog()`), `btDiag()` (1400, met kopie in localStorage), de diagbundel-ring (400) en de live-log-spiegel. Kebab → Logboek. **Trekt** data op bij openen; hangt zich niet in `log()` of `btDiag()` — die codebase heeft al één laag wrappers (`pidlane-remote.js`) en een tweede zou broncode-inspectie onbruikbaar maken |
| 51 | `pidlane-privacy.js` | 12 | `PLPrivacy` — prominente Bluetooth-disclosure vóór `connectSerial()`, plus privacyscherm in het menu. Play Store-eis, zie `ANDROID-PLAYSTORE.md` |
| 52 | `pidlane-start.js` | 20 | `PLStart` — startscherm: adapterprofielen per type, geheugen van eerdere verbindingen, verbindingscascade als live voortgang. Stuurt óók de ketenvolgorde in `connectSerial()` |
| 53 | `pidlane-meetdienst.js` | 11 | `PLMeetdienst` — de app-kant van de **native foreground service** (#18). Start/stopt de dienst met de adapterverbinding mee (wikkelt `setConn`, net als `PLWake`), zet de native hartslagteller op nul bij het wegschakelen en vertaalt het ruwe native rapport naar een oordeel: hoeveel liep het proces door, hoe lang lag het stil, kwam het uit zichzelf terug. Het **oordeel staat hier en niet in Java** — daar is het zonder toestel te toetsen. Geen schil met dienst? Dan is de uitkomst `gemeten: false` met de reden erbij, en nooit nul. Tests: `test-meetdienst.js`, `test-nativeschil.js` |
| 55 | `pidlane-scanslot.js` | 6 | `PLScanSlot` — **één plek waar een scan de bus overneemt** (#191). `doe(naam, opties, werk)` claimt het busslot (en tikt het aan met `PLBus.raak()`), zet `window._plScanActief`, en geeft het werk een bewaakte `stuur()` mee met een `ATI`-hartslag. Die drie horen bij elkaar: de vlag zet de dode-socket-detectie uit, dus wie hem aanzet moet zelf merken dat de verbinding weg is. Nestelt veilig — een geneste scan zet de vlag van de lopende niet uit. Gebruikt door `deepRefreshPIDs()`; `PLKaart` heeft nog zijn eigen, in een rit getoetste uitvoering. Tests: `test-scanslot.js`, `test-diepzoeken.js` |
| 54 | `pidlane-schil.js` | 5 | `PLSchil` — **welke APK draait dit** (#18). Leest de `versionCode` van de schil via Capacitor `App.getInfo()` en de nieuwste uit `/version.json` (die de Worker uit R2 serveert), en legt die twee naast elkaar. De kop van het testrunverslag draagt de regel `APK : build N`; blok 5 waarschuwt vóór de rit als de schil achterloopt. Ontbreekt één van beide getallen, dan is `achterstand()` **null** en nooit 0. Tests: `test-schil.js`, `test-schilproef.js` |
| — | `pidlane-bedrading.js` | 20 | `PLBedrading` — moet ALTIJD achteraan; controleert dat elke `typeof X === 'function'`-guard een geregistreerde naam is. Zie §19 |

### `native/` — de enige map met code die niet in de browser draait (11-09-2026)

Twee Java-bestanden, `PLMeetdienst.java` (de foreground service met zijn eigen
hartslag) en `PLMeetdienstPlugin.java` (de Capacitor-brug ernaartoe). Ze horen
in `android/app/src/main/java/app/pidlane/obd/`, en die map bestaat niet in de
repo: hij wordt elke build opnieuw gegenereerd uit het Capacitor-template.
`build-apk.yml` kopieert de bestanden er dus bij elke build in, leidt de doelmap
af uit de `package`-regel in de bestanden zelf, registreert de plugin in
`MainActivity` en injecteert de service plus zijn permissies in het manifest.

**Waarom ze hier staan en niet in de workflow.** Een heredoc in de YAML werkt
net zo goed en is onleesbaar: geen diff die iets zegt, geen test die hem
nakijkt, en native code die niemand ooit terugleest. `public/test-nativeschil.js`
legt deze bestanden naast de workflow en naast `pidlane-meetdienst.js`.

Dit is géén buildstap voor de web-app — die heeft er nog steeds geen. Het is de
enige plek in de repo waar code staat die op Android draait in plaats van in de
WebView. Zie §11, 11-09-2026.

### De topbar-statuschip — vier bolletjes achter één (27-08-2026)

De topbar had vier losse chips naast elkaar: Voertuig (dossier-%), OBD, AI,
Run. Op smalle schermen kostte dat structureel ruimte voor iets dat ~95% van
de tijd toch gewoon groen stond. Ze zijn samengevoegd achter één
`#sysChip`/`#sysdot` — tik erop en de vier oorspronkelijke chips (zelfde ids,
zelfde onclick's, ongewijzigd) klappen uit in een dropdown; tik op één ervan,
of ernaast, en hij klapt weer dicht.

- **Kleur = de ernstigste van Voertuig/OBD/AI** (rood > oranje > groen),
  berekend in `updateSysDot()` (`pidlane-uihelpers.js`). **Run telt niet mee**:
  "niets draait op de achtergrond" is de normale staat, geen probleem — Run
  krijgt in plaats daarvan zijn telbadge (`#runTel`) doorgespiegeld naar
  `#sysTel`, zodat een actieve achtergrondtaak niet onzichtbaar wordt zodra de
  chips zijn ingeklapt.
- De `.attn`-waarschuwing (veel lege ECU-antwoorden, `pidlane-bt.js`) spiegelt
  om dezelfde reden mee naar `#sysChip` — anders verdwijnt die pulserende rand
  net als bij Run zodra alles is ingeklapt.
- Reparenting-truc identiek aan `toggleKebab()`: `.sys-drop` verhuist bij het
  openen naar `<body>` met `position:fixed`, want `.topbar` heeft
  `overflow:hidden` en zou een kind dat naar buiten uitklapt afsnijden.
- En passant weggehaald: `#statusPill`, een dode `getElementById` naar een
  element dat al niet meer in `index.html` stond sinds een eerdere
  topbar-ronde — het eigen commentaar zei het letterlijk ("vervangt de oude
  statusPill") maar de regel die ernaar zocht was blijven staan.

---

## 5. Waarom de volgorde vastligt

- **Alle modules zijn classic scripts.** Geen `type="module"`, geen IIFE-wrapper
  op moduleniveau. In `index.html` staan **217 inline `on*=`-handlers** die
  functies in de globale scope opzoeken. Een echte module of een IIFE om álles
  heen breekt die allemaal in één klap.
- Top-level `function` → globaal. Top-level `const`/`let` → gedeelde globale
  lexicale scope, zichtbaar voor élk later script. Gecontroleerd: **0 dubbele
  top-level declaraties** over alle modules (876 namen).
- `pidlane-data.js` en `pidlane-assets.js` moeten vóór alles, want ze leveren
  definitietijd-constanten.
- `pidlane-busgate.js` ná `pidlane-data.js` (heeft `PLBus.stats()` nodig) en vóór
  `pidlane-watchers.js`, dat hem raadpleegt. Staat in index.html direct vóór
  `pidlane-plload.js`, bij de rest van het buscluster.
- `pidlane-verify.js` vóór `pidlane-monitor.js` vóór `pidlane-watchers.js`:
  PLMon roept PLVerify aan, PLWatch routeert events via `PLMon._event`.
- `pidlane-caravan.js` vóór `pidlane-monitor.js`.
- `pidlane-pidgate.js` staat direct ná `pidlane-auth.js`. Strikt genomen is die
  positie vrij — niets in de gate draait op definitietijd — maar `activePIDs`,
  `manualPIDs`, `pidVals` en `_pidHealth` staan als top-level `let` in
  `pidlane-auth.js`, en die zijn pas ná uitvoering daarvan uit hun TDZ. Zou er
  ooit iets in de gate op definitietijd gaan draaien, dan valt het daar om.
  Laat hem dus staan waar hij staat.
- `pidlane-kwaliteit.js` staat direct ná `pidlane-pidgate.js`, om dezelfde
  reden: niets draait daar op definitietijd, maar het leunt op `getPidDef()`
  uit de gate en op `pidHist`/`pidVals` uit auth. `fv()` komt pas later
  (`pidlane-pids.js`) en dat mag, want het wordt alleen binnen functies
  aangeroepen — precies zoals het vóór de afsplitsing ook al ging.
- `pidlane-credits.js` en `pidlane-klant.js` zitten wél in een IIFE en hangen
  alleen `window.PLCredits` / `window.PLKlant` op. Alle verwijzingen over en
  weer (auth → PLKlant, fuel → PLCredits, klant → PLCredits) zijn runtime, geen
  definitietijd. **Hun positie is dus vrij.**
- `BLE_CHANNELS` staat bewust nog in `index.html`: definitietijd-referentie op
  `BLE_SERVICE2`.

**Bij het toevoegen van een script-tag: check of de module iets gebruikt dat
op definitietijd (niet in een functie) moet bestaan.** Zo niet, dan is de
positie vrij.

---

## 6. Backend — worker.js

### `worker.js` is de bron — vastgelegd 27-08-2026

Het bestand ziet eruit als build-uitvoer en dat wás het ook: `__defProp`,
`__name`, `worker_default`, `@__PURE__`-markeringen — allemaal esbuild. **De
esbuild-invoer bestaat niet meer en komt ook niet terug.** Er is geen
buildstap: Cloudflare Workers Builds pakt bij `git push` dit bestand zoals het
is. De bundel ís dus de bron, en iedereen bewerkt hem al maanden met de hand.

Dat stond nergens, en aan de vorm van het bestand is het niet af te lezen —
vandaar deze paragraaf. De afspraken die erbij horen:

| | |
|---|---|
| **Bewerken** | rechtstreeks in `worker.js`. Geen `src/`-map aanleggen: die loopt vanaf dag twee uit de pas met wat er draait. |
| **`__name`-conventie** | aanhouden. Elke top-level `function X` krijgt `__name(X, "X");` erachter; een functie-expressie krijgt `__name((...) => ..., "naam")`. |
| **Niet bundelen** | een bundler er opnieuw overheen halen herschrijft het hele bestand, maakt de diff onleesbaar en gooit het Nederlandse commentaar weg. Dat commentaar is hier de dure helft. |
| **Controle** | `plcheck.sh` doet `node --check worker.js`; de testgate in CI doet hetzelfde. |

De `__name`-conventie is geen cosmetiek: `__name` zet de `.name` van de
functie, en dát is wat er in een stacktrace in de Cloudflare-logs staat. Sla je
het over, dan heet je functie daar `(anonymous)` op het moment dat je hem het
hardst nodig hebt.

> **Weg per 27-08-2026: de `//# sourceMappingURL=worker.js.map` aan het eind.**
> Die `.map` heeft in deze repo nooit bestaan — restant van de build waar dit
> ooit uit kwam. Hij kostte een 404 bij elke devtools-sessie en suggereerde dat
> er ergens een originele bron lag. Die ligt er niet.

De volledige versie van deze afspraak staat ook in de kop van `worker.js` zelf,
want dat is waar iemand hem nodig heeft.

### Endpoints

Endpoints (alles hieronder moet óók in `run_worker_first` in `wrangler.toml`
staan, anders wordt het als bestand geserveerd en krijg je een 404 die eruitziet
als een routingfout):

| Route | Doet |
|---|---|
| `/auth/login` | zakelijke login; valideert tegen Airtable `Users` + `USERS_JSON`-secret, geeft HMAC-token (12u) |
| `/v1/messages` | Anthropic-proxy **+ tegoedcontrole en afboeking voor klantaccounts** (zie §8) |
| `/v1/ping` | dezelfde poorten als `/v1/messages` (sessie, rol, sleutel) **zonder het model aan te roepen**; GET, kost niets — de keten-test na het inloggen (#179) |
| `/copilot` | in-app ontwikkelassistent, admin-only |
| `/airtable/log`, `/airtable/veldlab`, `/airtable/reference` | Airtable-opslag |
| `/session/create,connect,state,telemetry,close` | remote-sessies (Durable Object) |
| `/pair/create,claim,poll` + `/code/create,resolve` | QR-pairing, 10-cijferige sessiecodes |
| `/klant/registreer`, `/klant/login` | zelfregistratie en login van consumenten (tabel `Klanten`, rol `klant`) |
| `/klant/onboarding` | akkoorden vastleggen + eenmalig proeftegoed uitkeren |
| `/klant/mij` | eigen account + saldo opvragen |
| `/klant/wachtwoord` | wachtwoord wijzigen (ingelogd) |
| `/klant/reset-aanvraag`, `/klant/reset-uitvoeren` | wachtwoordherstel per mail (token-hash in Airtable) |
| `/klant/admin-wachtwoord` | noodklep: admin zet handmatig een klantwachtwoord |
| `/credits/redeem` | activatiecode inwisselen (tabel `TokenCodes`), atomair via een Durable-Object-slot; **vraagt een klantsessie** — zonder account wordt er niets afgestempeld (02-09-2026) |
| `/admin/klanten` | klantbeheer voor admin.html (GET/POST) |
| `/admin/codes` | activatiecodes genereren en beheren (GET/POST) |
| `/admin/users` | zakelijk gebruikersbeheer |
| `/admin/tabel` | de bekende Airtable-tabellen lezen (GET), één record wijzigen of maximaal tien wissen (POST) — zie **De adminbrowser** hieronder |
| `/proxy` | generieke uitgaande proxy (RDW/NHTSA), whitelist op host |
| `/download/*`, `/version.json` | APK uit R2 |
| `/health` | statuscheck |

**De adminbrowser — `/admin/tabel` (04-09-2026).** Er waren drie leesroutes
voor het beheer (klanten, codes, gebruikers) en geen enkele voor het logboek of
het veldlab. Wie wilde weten wat de app de afgelopen week gemeld had, moest in
Airtable zelf gaan kijken — en dat is het moment waarop iemand met een
browsersessie in de verkeerde base belandt. Deze route leest elke tabel die het
beheer nodig heeft, achter dezelfde `ADMIN_TOKEN`, en geeft de ruwe velden
terug zodat `admin/beheer.html` er een lijst of een grafiek van maakt.

Drie ontwerpkeuzes, en alle drie zijn ze een grendel en geen netheid:

| begrip | wat het doet | waarom |
|---|---|---|
| **witte lijst** | `ADMIN_BRONNEN` koppelt een sleutel (`log`, `klanten`, …) aan de base- en tabelsleutels die de rest van de Worker ook gebruikt | een route die een vrije base- en tabelnaam aanneemt, is met één gelekte `ADMIN_TOKEN` een sleutel tot het hele Airtable-account — ook tot bases buiten PidLane |
| **`beschermd`** | die velden zijn hier niet te schrijven: `Saldo`, `PassHash`, `ResetToken`, `ResetVerloopt`, `Email` (klanten) en `PassHash`, `User` (gebruikers) | `Saldo` hoort door `metSaldoSlot()` (#82, #93) — een PATCH hierlangs brengt precies die race terug. `PassHash` hoort door `hashPassword()`: een met de hand ingetikte waarde is een hash die op niets slaat, en dan kan niemand meer inloggen |
| **`geheim`** | die velden verlaten de Worker niet; er komt `••• verborgen` voor in de plaats | een hash en een resettoken zijn genoeg om een account over te nemen. `••• verborgen` in plaats van leeg, zodat je wél ziet dát er een wachtwoord staat |

`AppConfig` staat bewust op alleen-lezen: `/api/config` schrijft daar én gooit
daarna de randcache weg. Een PATCH langs die route heen laat een oude waarde in
de cache achter, en dan staat er dagen iets anders live dan wat de tabel zegt.

Gedekt door `test-adminbron.js` (witte lijst, masker, grendels, wisgrenzen,
zoekformule-ontsnapping, de terugval bij een onbekend sorteerveld) en door vijf
mutaties in `plmutate.sh`. `test-klant-aanmaken.js` dekt de nieuwe actie
`aanmaken` op `/admin/klanten` — inclusief de tegenproef dat een ruw wachtwoord
nergens in de verzendbody terechtkomt.

**Secrets** (nooit in de repo): `AIRTABLE_TOKEN`, `ADMIN_TOKEN`,
`SESSION_SECRET`, `USERS_JSON`, `ANTHROPIC_API_KEY`, en voor wachtwoordherstel
per mail `MAIL_API_KEY` + `MAIL_FROM`. Zonder die laatste twee antwoordt
`/klant/reset-aanvraag` met `mail_not_configured` en loopt herstel via
`/klant/admin-wachtwoord`.

**Worker-variabelen** (allemaal met werkende standaard in de code, alleen
invullen om te overschrijven):

| Variabele | Standaard | Doet |
|---|---|---|
| `TOKEN_TTL_HOURS` | 12 | geldigheid sessietoken |
| `PBKDF2_ITERS` | 100000 | wachtwoord-hashing; **Workers staat niet méér toe** |
| `KLANT_START_SALDO` | 20 | proeftegoed na onboarding |
| `APP_BASE_URL` | `https://app.pidlane.nl` | basis voor de herstellink |
| `MAIL_API_URL` | Resend | andere mailprovider |
| `RL_REGISTREER` | 25/uur/IP | rem op zelfregistratie |
| `RL_RESET` | 3/uur/adres | rem op herstelmails |
| `CREDIT_PER_1K_IN` | 0.70 | credits per 1000 invoertokens |
| `CREDIT_PER_1K_UIT` | 3.50 | credits per 1000 uitvoertokens |
| `CREDIT_MIN` | 1 | minimum per AI-call |

### Activatiecodes inwisselen — waarom er een slot omheen zit

Airtable kent geen transacties, dus twee gelijktijdige verzoeken met dezelfde
code konden allebei slagen. `/credits/redeem` pakt daarom eerst een kortstondig
slot in een Durable Object met de naam `redeem:<code>` (`redeem-lock` /
`redeem-unlock` in `RemoteSessionDO`), leest de code binnen dat slot opnieuw en
stempelt hem pas daarna af.

Het slot is bewust **niet** de administratie van "code is op" — dat blijft het
veld `Gebruikt` in Airtable. Handmatig uitvinken werkt dus gewoon, en een
verzoek dat halverwege sneuvelt blokkeert een code niet voorgoed: het slot
verloopt na 30 seconden.

`GebruiktOp` is een **dateTime**-veld. Er moet dus een geldige ISO-tijd in.
Tot 31-07-2026 schreef de Worker daar een zelfgemaakte "stempel" met een
willekeurig staartje in, zonder `typecast` — als datum ongeldig, dus Airtable
gaf 422 en inwisselen werkte vermoedelijk helemaal niet. `Vervalt` is een
**date**-veld (`YYYY-MM-DD`); de controle kan sinds 31-07-2026 ook overweg met
een volledige ISO-tijd, voor als dat veldtype ooit verandert.

**Rollen.** `auth()` levert `{u, r, l}`. `r` is `admin`, `user`, `demo` of
`klant`. Demo en het oude `legacy`-token hebben geen AI-toegang; `klant` wel,
maar tegen tegoed. Een klanttoken kan nooit voor een beheerderstoken doorgaan.

---

## 7. Data

**Airtable** is de opslag. Definitief besluit (20 jul 2026): de
MariaDB/Synology-pipeline is laten vallen — te veel onderhoud voor een
solo-project. Als er ooit echt SQL nodig is: **Cloudflare D1**, niet MariaDB.

| Base | ID |
|---|---|
| PidLane Config | `appUAuyRxK18T7ImK` |
| Veldlab | `apphsUwG4WAeWjEwH` |
| Logs | `appdRasY8ZVJCMkPJ` |

Tabellen: Referentie `tblkfxKcjR6gf0Ahe`, Sessies `tblwbyWN1L6AKwgoy`,
en in de Config-base `Users`, `Klanten`, `TokenCodes` en `TokenLog`
(`tblCrXVqEbaPTQQ2S`, aangemaakt 31-07-2026). Die laatste stond hier tot
08-09-2026 als "staat er wel, maar er schrijft niets in"; sinds #83 schrijft
`tegoedLog()` er bij elke saldomutatie een regel in — zie het kasboek-kader
in §8.

**Twee soorten accounts, bewust gescheiden.** `Users` zijn logins op
gebruikersnaam voor **personeel** — de beheerder, een monteur, de noodingang.
Die draaien op de sleutel van de beheerder en verbruiken geen tokens. Er hoort
géén abonnement bij; dat woord stond hier tot 02-09-2026 en het abonnement
bestaat niet (#49). `Klanten` zijn zelf-geregistreerde consumenten op
e-mailadres, met een `Saldo`-veld. Het inlogveld
herkent het verschil aan de `@`. Een lek of fout aan de consumentenkant raakt de
zakelijke accounts niet.

**Referentie-pipeline:** elke echte adapterverbinding wordt automatisch een
meetsessie. PID-kwaliteit wordt geclassificeerd als `ok` / `unsupported` /
`expected_missing` / `implausible`. Schone surveys (≥2 onafhankelijke
bevestigingen per `merk|model|jaar|CALID`-cel) promoveren naar de
Referentie-store met p5/p50/p95-bereiken per PID.

### De VIN — twee uitgaande paden, één pseudoniem

Een VIN is via het RDW herleidbaar tot een kentekenhouder, dus hij hoort niet
ruw in Airtable. Er zijn precies **twee** plekken waar voertuigdata de telefoon
uit gaat, en ze zijn allebei op een andere dag gedicht — dat is het waard om te
onthouden, want de eerste fix wekte de indruk dat het klaar was:

| Pad | Functie | Dicht sinds |
|---|---|---|
| Veldlab-sessies → `Sessies` | `_vlSchoonVoorVerzending()` in `pidlane-veldlab.js` | 25-08-2026 |
| Logregels → `Logs` | `_plVinVoorLog()` in `pidlane-auth.js` | 27-08-2026 |
| App-logbuffer → testrunverslag | `_plVinVoorLog()` op de schrijvers | 03-09-2026 |

Het tweede pad was het ergere van de twee en werd bij de eerste ronde gemist:
`logToSheets()` schreef de volledige VIN in een **eigen kolom**, op élke
logregel, met de kolom `User` in dezelfde rij. Niet weggestopt in een JSON-blob
zoals bij Veldlab, maar gewoon zichtbaar in de tabel.

**Het derde pad is op 02-09-2026 gevonden en op 03-09 gedicht** (`#102`). Deze
tabel was twee keer compleet en was het geen van beide keren. `_plVinVoorLog()`
beschermde de route naar Airtable, niet de logbuffer waar die route uit put —
en het testrunverslag exporteert die buffer integraal. Het is ook het pad met
de ruimste bestemming: bij de andere twee gaat er een kolom naar een tabel die
alleen ik zie, hier kiest de gebruiker zelf waar het bestand heen gaat.

Er bleken **drie** schrijvers te zijn, niet twee. Naast `pidlane-bt.js` en
`pidlane-pids.js` drukte de profielproef van blok 1 bij een FOUT de huidige VIN
áf plus die van élk profiel dat ooit op het toestel was opgeslagen — één
melding die niet één auto lekt maar alle auto's die dat toestel heeft gezien.

De vorm die er nu staat is `…766507 (JMZ:9f2c…)`: de laatste zes tekens zodat je
je eigen auto herkent, en het pseudoniem dat hetzelfde staartje draagt als de
Airtable-logkolom, zodat een logregel te koppelen blijft aan een
Veldlab-sessie.

**Het vierde pad blijft open, en dat is besloten op 03-09-2026 (#109).**
`_voertuigRegels()` in `pidlane-export.js` zet de volledige VIN in de kop van
élk geëxporteerd rapport en élke PDF. Dat is **geen vergeten pad maar een
opengelaten pad**, en het staat hier zodat die twee niet meer door elkaar te
halen zijn — dat is de hele les van #102, waar deze tabel twee keer "compleet"
was en het geen van beide keren was.

| Pad | Functie | Stand |
|---|---|---|
| Rapport-/PDF-export → bestand | `_voertuigRegels()` in `pidlane-export.js` | **volledige VIN, met opzet** |

De reden. Een geëxporteerd rapport is een **werkstuk over een auto**, geen
diagnosebestand over de app. Gaat het naar een klant, een garage of een
keuring, dan is de VIN precies het veld dat het rapport aan díé auto
vastknoopt; maskeren maakt het onbruikbaar voor waarschijnlijk het
belangrijkste gebruik dat het heeft. Bij #102 lag dat andersom: daar voegde de
VIN niets toe aan een testrunverslag, en deden de laatste zes tekens plus het
pseudoniem hetzelfde werk.

Wat dit besluit **niet** zegt. Het rekt de regel uit `CLAUDE.md` niet op: een
VIN gaat nooit ruw naar Airtable of naar een van onze eigen bestemmingen. Het
verschil is de bestemming — hier kiest de gebruiker zelf waar het bestand heen
gaat, en hij weet dat hij een rapport over zijn auto exporteert. Zou er ooit
een pad bij komen dat een rapport automatisch ergens heen stuurt, dan valt dat
niet onder dit besluit en is het een nieuwe vraag.

De afgewogen alternatieven staan in #109 en zijn niet gekozen: maskeren zoals
#102 (kost de koppeling aan het voertuig) en een vinkje bij het exporteren
(inhoudelijk het beste, maar een extra stand die in elk exportpad mee moet en
onderhoudslast is hier een harde ontwerprandvoorwaarde).

**Eén randgeval uit dezelfde zoektocht, bewust blijven staan.**
`pidlane-bt.js` rond regel 2292 logt bij een mislukte VIN-lezing de ruwe
ELM-antwoorden, en die hex kan een VIN bevatten die de parser net niet
accepteerde. Zwakker dan een leesbare VIN, en de regel heeft echte
diagnosewaarde — hij bestaat om te kunnen zien of de auto zwijgt of de parser
faalt. Genoemd zodat hij niet ongemerkt blijft, niet omdat hij weg moet.

`bproef-vinlek.js` bewaakt dit voortaan op de manier die bij de les hoort: hij
toetst niet de drie aanroepen maar **de buffer**. Dat is de enige vorm die ook
een vierde schrijver vangt die nog niet bestaat.

Beide paden delen één functie, `_vlVinPseudoniem()`: `SHA-256(zout + VIN)`,
eerste 16 hextekens. Dezelfde auto krijgt daardoor in beide tabellen hetzelfde
staartje en logregels blijven te koppelen aan een Veldlab-sessie — precies
waarvoor de VIN-kolom werd gebruikt. Veldlab bewaart daarnaast de `wmi` (de
eerste drie tekens, de fabrikantcode); de logkolom `VIN` bevat sinds 27-08 de
vorm `JM3:9f2c…`.

> **De kolom heet nog steeds `VIN` en dat blijft zo.** Een nieuwe naam is een
> veld dat in de Airtable-logtabel niet bestaat, en `typecast: true` maakt geen
> velden aan: dat geeft 422 `UNKNOWN_FIELD_NAME` en dan valt álle logging om.
> De inhoud is veranderd, de kolom niet.

**Dit is pseudonimisering, geen anonimisering.** Het zout staat in clientcode en
is dus niet geheim; wie een VIN al kent kan hem toetsen. Onder de AVG blijft een
pseudoniem een persoonsgegeven. De vier teksten die dat aan de gebruiker
uitleggen — het akkoordscherm in `pidlane-klant.js`, `privacy.html`, de
BT-disclosure in `pidlane-privacy.js` en de foutmelding in `worker.js` — zeiden
tot 27-08-2026 alle vier "geanonimiseerd". `test-toestemmingstekst.js` bewaakt
sindsdien dat die claim niet terugkomt; `test-vin-anoniem.js` bewaakt het
gedrag van beide paden. Die twee horen bij elkaar: de een toetst wat de code
doet, de ander of we er eerlijk over zijn.

Een derde stuk hoort hierbij: een akkoord dat vóór de correctie is gegeven, is
gegeven op de onjuiste tekst en telt niet meer. `klantPubliek()` in `worker.js`
rekent dat uit als `akkoordActueel` (§11, "Opgelost op 27-08"), getest in
`test-akkoord-heraccorderen.js`.

---

## 8. AI-integratie

- Model: `claude-sonnet-5` (standaard in `apiFetch`); snelle antwoorden gaan
  op `claude-haiku-4-5-20251001`. De Worker heeft `claude-sonnet-4-6` als
  terugval, maar de app stuurt altijd een expliciet model mee.
  `thinking:{type:'disabled'}` is correct voor
  Sonnet; Haiku laat het veld weg.
- AI Gateway-route:
  `gateway.ai.cloudflare.com/v1/11390e49dd8b8cd940f262cc35c41b94/pid-lane/anthropic/v1/messages`
- Alle AI-calls lopen door `apiFetch()` in `pidlane-fuel.js`. Eén haak, twintig
  aanroepplekken. Bij `stop_reason: max_tokens` doet hij tot 2 vervolgcalls.
- Systeemprompt bevat **regel 7**: conditionele, rijsituatie-afhankelijke
  referentiebereiken. Zonder die context beoordeelt de AI een caravanrit als
  een zieke auto.
- AI-contextinjectie is gecentraliseerd in `apiFetch`, met deduplicatie.
- **De aanlevering** (`PLAanlevering`, 11-09-2026, #188) hangt als zesde blok
  aan diezelfde haak: dekking (welke sensoren deze analyse nodig had en welke
  ontbreken, mét reden), de onderbrekingen met hun naam, het kwaliteitsblok en
  vijf weegregels. Standaard aan, leeg als er niets gemeten is, uit te zetten
  met `{meet:false}` als vijfde parameter van `apiFetch`. Zie §11 11-09.

### Twee accountsoorten, één verdienmodel — besluit 03-09-2026 (#49)

**Vastgelegd, niet meer open.** `Klanten` + credits is het model voor iedereen
die zich van buiten registreert — consument én garage. `Users` is wat het
feitelijk al was: **personeel**. De beheerder, een monteur, de noodingang. Een
beheerrol, geen klantcategorie. Een zakelijke garage krijgt een klantaccount
met een grote of periodiek bijgevulde bundel: zelfde mechanisme, ander bedrag.

**Het doorslaggevende argument is niet de omzet maar de kostenblootstelling.**
Bij tien garages die je persoonlijk kent is een onbegrensd account prima. Bij
vijfhonderd geregistreerde gebruikers kan één enthousiaste gebruiker — of één
lus in onze eigen code — in een nacht meer kosten dan een maand omzet, en dat
merk je pas op de factuur. Credits maken dat structureel onmogelijk: niemand
kan meer kosten dan hij gekocht heeft. Dat is geen prijsmodel maar een
veiligheidsklep. De marge (ruwweg 19×, ~95% bruto) is een gevolg, geen reden.

**Wat dit in de code betekent, en wat níét.** De grens staat in één regel in
`handleMessages`: `if (session.r === "klant" && !clientKey)`. Een `user` valt
daarbuiten en zijn calls lopen op de sleutel van de Worker — dat is precies de
bedoeling, want personeel is geen klant. Wat er dus **niet** komt is een tweede
betaalmodel voor `Users`; dat was juist de variatie die dit besluit wegneemt.

**Play beslist dit niet.** Credits verkopen in de app raakt Play's
betaalregels (#42), maar een abonnement is ook digitale content, dus dat
ontsnapt er niet aan. Het enige model dat de regels volledig vermijdt is
"gratis app, de beheerder betaalt de rekening" — en dat is nou juist het
onbegrensde model. Play beslist dus niet credits-versus-vast, Play beslist hoe
het geld binnenkomt. Die vraag ligt er in beide gevallen.

**Zichtbaar gevolg in de app.** "👤 Mijn account" staat achter `isKlant()` en
is dus weg bij rol `user` — dat is dit besluit, geen bug. Zie #69, dat op deze
grond gesloten is.

**Twee gaten die dit besluit niet dicht** en die daarom hun eigen issue hebben
gekregen in plaats van met #49 mee te sluiten: het proeftegoed van 25 credits
staat in localStorage en groeit terug bij het wissen van app-gegevens, en
promptcaching staat uit terwijl de systeemprompt plus `AUTO_KENNIS` bij elke
analyse opnieuw meegaat.

### Tegoed — waar wordt er geteld

**Afrekenen gebeurt in de Worker, niet in de app** (sinds 31-07-2026). Daarvóór
schatte `pidlane-credits.js` de kosten en riep daarna `/klant/saldo-muteer` aan.
Dat is een verzoek, geen controle: wie dat verzoek blokkeerde of localStorage
wiste, gebruikte de AI gratis.

Nu, in `handleMessages`:

1. Is de rol `klant` én gebruikt hij onze API-sleutel, dan wordt eerst het saldo
   uit Airtable gelezen. Te weinig → **402** vóór er iets naar Anthropic gaat.
   Airtable onbereikbaar → **503**, bewust dicht: een storing mag geen gratis AI
   opleveren.
2. Na een geslaagd antwoord wordt afgeboekt op het **echte** verbruik uit
   `usage`, niet op de schatting. Daardoor tellen vervolgcalls bij `max_tokens`
   ook mee — die waren voorheen gratis.
3. Het saldo ná afboeking gaat mee terug in de header `X-PidLane-Saldo` (staat
   in `Access-Control-Expose-Headers`). `apiFetch` leest die uit en zet 'm door
   naar `PLCredits`, zodat de teller de server volgt en niet de schatting.
4. Een fout van Anthropic (429, 500) kost de klant niets.
5. Brengt iemand zijn eigen API-sleutel mee, dan betaalt hij Anthropic al
   rechtstreeks en rekenen we niets af.

`pidlane-credits.js` doet nog twee dingen: het kostenvenster vóóraf tonen en de
teller in beeld bijwerken. Het raakt het saldo op de server niet meer aan — zou
het dat wél doen, dan betaalt de klant dubbel.

**De kostenformule staat dubbel** en moet dat blijven doen: `_credits()` in
`pidlane-credits.js` voor het venster vooraf, `tegoedKosten()` in `worker.js`
voor de echte afboeking. Wijzig je er één, pas de ander aan — of zet de tarieven
via Worker-variabelen zodat alleen de schatting nog in de app staat.

### Kasboek — TokenLog

**Gebouwd op 08-09-2026 (#83), en deze alinea staat nu terecht in de
tegenwoordige tijd.** Elke mutatie op een tokensaldo krijgt een regel in
`TokenLog` (Config-base), geschreven door `tegoedLog()` in `worker.js`. Vier
bronnen, zes aanroepen: `ai-call` (afgeboekt én mislukt), `code-ingewisseld`
(bijgeboekt én afgestempeld-maar-niet-bijgeboekt), `proeftegoed` en
`admin-mutatie` (bijboeken en zetten).

Velden: `Moment`, `Klant`, `Soort`, `Credits` (negatief bij afboeken),
`SaldoNa`, `TokensIn`, `TokensUit`, `Model`, `Details`.

**Drie regels die vastliggen**, en die alle drie in `test-kasboek.js` een
tegenproef hebben:

1. **Het kasboek is administratie, geen bron van waarheid.** Het saldo staat in
   `Klanten.Saldo`. Een mislukte logregel mag een call daarom nooit laten
   stranden: alles staat in een `try` en het wegschrijven gaat via
   `ctx.waitUntil`. Die `ctx` had geen van de vier handlers — dat was het eerste
   wat je tegenkwam, en het is nu doorgegeven vanuit `worker_default.fetch`.
2. **Een mislukte mutatie krijgt óók een regel**, met `Credits: 0` en een
   `Details` die zegt wat er misging. Dat is het geval waarvoor dit boek
   bestaat: AI verbruikt (of een code afgestempeld) terwijl het saldo níét
   meebewoog. Zonder die regel is het kasboek juist blind voor de situatie die
   hem zijn bestaansrecht geeft.
3. **`Credits` is wat er wérkelijk af ging, niet wat de call kostte.** Staat er
   3 op de teller en kost de analyse er 9, dan kapt het saldo af op 0 en gaat er
   3 af; het verschil staat in `Details`. Zou er -9 staan, dan telt de kolom
   niet meer op tegen `SaldoNa` en is de eerste vraag die je het boek ooit stelt
   meteen fout beantwoord.

Het proeftegoed wijkt bewust af: een tweede onboarding kent niets toe en levert
dus géén regel op. Bij de AI-call en de activatiecode is er iets verbruikt
terwijl het saldo stil bleef staan — dáár valt iets recht te zetten. Bij het
toekennen is de patch zelf de mutatie: lukt hij niet, dan is er niets gebeurd.

**Te lezen zonder Airtable open te doen.** `ADMIN_BRONNEN.kasboek` zet de tabel
op de beheerpagina onder Tabellen, **alleen-lezen** — en dat is geen netheid.
Een boek dat je vanaf een pagina kunt bijstellen of waar je een regel uit kunt
halen, bewijst alleen nog wat erin staat, en dan is de enige vraag die je eraan
stelt niet meer te beantwoorden.

**Waarom het er moest komen.** Op 31-07-2026 verdwenen er tokens zonder
analyses. Oorzaak bleek `testApiKey()`, die bij élke app-start een echte call
deed. Dat was alleen te achterhalen door de code te lezen — met een kasboek was
het één blik geweest. Sindsdien raken er vijf schrijvers aan het saldo, en drie
daarvan hebben een foutpad waarin de mutatie mislukt terwijl de verbruikte kant
doorgaat. Precies die gevallen waren onzichtbaar.

**De les is niet de ontbrekende functie maar de vorm, en die blijft staan.**
Hier stond tussen juli en 02-09-2026 exact de beschrijving die je hierboven
leest — negen velden, vier bronnen, een functienaam — terwijl `tegoedLog` nooit
in `worker.js` had gestaan; `git log -S tegoedLog` gaf geen enkele commit. Wie
§8 las, kruiste dit punt af. Twee dingen zijn er zo blijven liggen: dit kasboek,
en het uitlezen van `X-PidLane-Saldo` (punt 3 hierboven), dat sinds juli
beschreven stond en pas op 02-09-2026 gebouwd is. **Wat nog niet bestaat, staat
als issue met een vooruitwijzing hier — niet als alinea in de tegenwoordige
tijd.** Dat het bovenstaande er nu weer in staat, is alleen goed omdat
`test-kasboek.js` het waar houdt: acht mutaties in `plmutate.sh` maken deze
alinea rood zodra ze niet meer klopt.

**Achtergrondcalls kosten geld.** Sinds de Worker afrekent is élke call naar
`/v1/messages` billable, ook calls die nooit langs `PLCredits.preflight` gaan
en die de gebruiker niet als analyse ziet. Voeg je een AI-call toe die vanzelf
afgaat, bedenk dan eerst wie hem betaalt.

**Hier stond tot 10-09-2026 dat `testApiKey()` "daarom niet meer voor
klantaccounts draait", en die zin heeft nooit geklopt** — er stond geen enkele
rolcontrole omheen, en het saldo zakte bij elke login met precies 1. Sinds
10-09-2026 klopt de conclusie wél, maar op een andere manier dan die zin
beweerde: de functie draait voor iedereen en gaat langs `/v1/ping`, dat het
model niet aanroept (#179). Waarom die vergissing hier bleef staan, staat in
§11.

**Die grens is er niet meer, op één plek na.** Hier stond dat Airtable geen
transacties kent en dat twee gelijktijdige calls van hetzelfde account elkaars
afboeking konden overschrijven — met de Durable Object als toekomstige
oplossing. Die is er sinds 26-08-2026: `metSaldoSlot()` serialiseert elke
saldomutatie per klant (zie §7). Sinds 03-09-2026 lopen **alle vijf** de
schrijvers erdoorheen: `handleMessages` (AI-afboeking), `handleCreditsRedeem`
(activatiecode), `handleKlantOnboarding` (proeftegoed) en
`handleAdminKlantenPost` met de acties `bijboeken` (sinds 02-09, #82) en
`update` (sinds 03-09, #93).

Die vierde ging er tot dan buitenom (**#82**), en het commentaar erboven wees
de verkeerde kant op: het waarschuwde voor twee beheerders die op dezelfde
seconde bijboeken, en noemde dat bij één beheerder geen praktisch risico. Dat
klopt allebei — maar de botsing die ertoe doet is **beheerder × klant**. Je
boekt 100 bij terwijl de klant een analyse draait; die leest 30 binnen het slot
en schrijft 19 terug, jij las 30 buiten het slot en schrijft 130. Eén van beide
mutaties verdwijnt geruisloos, en welke hangt af van wie het laatst schrijft.

**De les is de vorm.** Er stond wel degelijk een waarschuwing, en die was
gedetailleerd genoeg om vertrouwd te worden. Alleen ging hij over het geval dat
niet voorkomt. Een risico dat benoemd is voelt als een risico dat afgewogen is,
en dat is precies waarom deze anderhalve maand bleef staan.

Twee praktische punten die eruit volgden. Het slot staat op het e-mailadres en
deze route krijgt een record-id binnen, dus er wordt nu twee keer gelezen: één
keer buiten het slot voor het adres, één keer erbinnen voor het saldo waarmee
gerekend wordt. En een klant zonder e-mailadres wordt geweigerd in plaats van
buitenom geschreven — er is dan geen naamruimte om het slot op te zetten.

**En toen was er een vijfde.** Hierboven stond dat de actie `update` (saldo op
een absoluut bedrag zetten) bewust niet door het slot liep, omdat de beheerder
daar het eindbedrag stuurt en dus een getal ziet dat hij zelf heeft ingetikt.
Die redenering is op 03-09-2026 met **#93** omgevallen, en op precies dezelfde
manier als bij #82: hij was gedetailleerd genoeg om vertrouwd te worden, maar
ging over de verkeerde helft van het probleem.

Zetten rekent inderdaad niet. Maar het **overschrijft**, en dat is even
onzichtbaar: draait de klant op dat moment een analyse, dan boekt die binnen
het slot af naar 19 en schrijft terug, waarna deze PATCH er het getal overheen
zet dat de beheerder minuten geleden op zijn scherm zag. De afboeking verdwijnt
en de klant houdt tokens die hij verbruikt heeft — het spiegelbeeld van #82.
Sinds 03-09-2026 loopt het saldogedeelte van `update` daarom door hetzelfde
slot, met dezelfde twee lezingen. `Status`, `Naam` en `Opmerking` niet: een
klant deblokkeren hoort niet te wachten op een analyse, en een klant zónder
e-mailadres moet hernoembaar blijven.

**Een slot beschermt het schrijven, niet het besluit.** Dat is het tweede stuk
van #93 en het interessantere. `kSaldo()` in `admin/admin.html` vulde het
invoerveld voor met het saldo uit de klantenlijst — mogelijk minuten oud — en
rekende in de bevestiging een verschil uit: *"Dat is een verschil van +50
tokens."* Staat de klant intussen op 150 in plaats van 180, dan wordt het in
werkelijkheid +80. Je bevestigt dan precies het getal dat je aan het afwegen
bent, en het klopt niet. Het onderscheid dat #82 maakte — bijboeken rekent,
zetten niet — hield dus maar half stand: de Worker rekende niet, de pagina wél,
en met een bron die niet vers was.

Dat verschil is nu geen schatting meer maar een **voorwaarde**. De pagina
stuurt mee wát er stond (`saldoWas`); klopt dat niet meer met wat er binnen het
slot gelezen wordt, dan wordt er niets geschreven en komt `saldo_verschoven`
terug met het verse getal erbij. Zonder `saldoWas` — een oudere pagina — gaat
het door zoals het ging; het slot beschermt dan nog steeds het schrijven zelf.
Dat is bewust: een harde eis zou een pagina die nog niet ververst is stilzwijgend
onbruikbaar maken, en dat is een ander soort stille fout.

---

## 9. Werkafspraken

**Sinds 27-08-2026 gaat het werk rechtstreeks door de repo.** Claude Code leest
en wijzigt de bestanden zelf; er worden geen modules meer in een chat geplakt en
er komt geen delta-zip meer uit een sessie. Wat daarvan aan afspraken overblijft
staat hieronder; de dagelijkse regels staan in `CLAUDE.md` in de repo-root, en
de houding waarmee er gewerkt wordt in `PROJECT-INSTRUCTIES.md` (de tekst in het
instructieveld van het Claude-project).

**Twee documenten en een issuelijst.** `PIDLANE.md` beschrijft hoe het systeem
in elkaar zit (bron van waarheid) en houdt in §11 bij wat er bekend en
onopgelost is; `PIDLANE-CONTRACT.md` is het ontwerp voor meetkwaliteit dat nog
gebouwd moet worden. Wat er nú speelt staat in de GitHub-issues.

`PLAN.md`, `OVERDRACHT.md`, `OVERDRACHT-NIEUWE-CHAT.md`, `LEESMIJ-DELTA.md` en
`PIDLANE-WERK.md` zijn op 27-08-2026 opgeheven. Ze waren allemaal een vorm van
hetzelfde: een document dat een chat moest overleven omdat de volgende sessie
niet bij de repo kon. Dat is niet meer zo. Wat er nog open in stond staat in
§11.

- **Nederlandstalige codebase.** Commentaar, changelogs, commitberichten,
  PR-titels en UI-teksten: Nederlands.
- **Een PR wacht op de testgate, niet op aandacht.** `automerge.yml` voegt hem
  samen zodra de workflow *Tests* groen afrondt. Wil je dat een PR blijft
  liggen, zet er het label `handmatig` op of hou hem in draft — dat zijn de
  twee remmen. De workflow draait altijd de versie die op `main` staat, dus
  een PR die `automerge.yml` zelf wijzigt gaat die ene keer met de hand.
- **Samenvoegen is deployen.** Cloudflare Workers Builds pakt de push naar
  `main` en zet hem live. Er zit geen mens tussen de PR en de klant; daarom moet
  de gate vóór de push groen zijn, niet erna.
- Vóór elke oplevering: **`plcheck.sh`** in de repo-root. Die doet
  syntaxcontrole op alle bestanden, draait alle `test-*.js` (38 op 27-08-2026 —
  tel ze liever dan dit getal te geloven), telt de div-balans van `index.html`
  en `admin.html`, controleert dat elke module in `index.html` hangt en dat
  `pidlane-bedrading.js` achteraan staat. Exit 0 is de enige uitkomst waarna je
  mag committen. `tests.yml` draait hetzelfde in CI, met de tegenproef
  (`plmutate.sh`) en een sleutelscan als eigen jobs ernaast.
- **Bij elke oplevering ook `CAMPAGNE` en `_blok5()` in `pidlane-testrun.js`
  herschrijven**, zodat blok 5 toetst wat er in díé update veranderd is —
  toegevoegd én verwijderd. Zie §20.
- Build-changelog bovenaan `CHANGELOG.md`, niet meer in `index.html`:
  `build-apk.yml` triggert op elke wijziging aan `public/index.html`, dus een
  nieuwe changelogregel startte daar een Android-build zonder dat er iets aan
  de app veranderde. Verplaatst op 28-08-2026.
- Chirurgische bewerkingen met een unieke zoekstring, niet met een hele
  bestandsherschrijving — dan blijft de diff leesbaar.
- Mechanisch en inhoudelijk wijzigen nooit in dezelfde commit.
- `worker.js` bewerk je rechtstreeks: hij is zijn eigen bron, zie §6.

### Zuinig omgaan met context

De repo staat er nu in zijn geheel, en dat is precies waarom dit blijft gelden:
alles kúnnen lezen is niet hetzelfde als alles moeten lezen. `index.html` is
203 KB, `worker.js` 134 KB, `pidlane.css` 157 KB — één zo'n bestand blind
inladen kost de ruimte die je verderop in de sessie nodig hebt.

Zoek gericht op naam of symbool en lees het stuk eromheen. Weet je niet in welk
bestand iets zit, kijk dan eerst in de tabel in §4 — daar staat dit document
voor.

---

## 10. Openstaande UI-taken

1. Rit-monitorpaneel minimaliseerbaar maken met zwevende statuschip
2. Veldlab uit de UI halen, achtergrondlogging behouden
3. Auto-update/versiecheck verwijderen
4. Overbodig menu-item "Achtergrond monitor" verwijderen

## 11. Bekende problemen — nog niet opgelost

Bijgewerkt 03-09-2026. `PLAN.md`, `OVERDRACHT.md` en `PIDLANE-WERK.md` bestaan
niet meer. **Wat er open staat, staat in de issues** — dit hoofdstuk noemt geen
enkele stand van zaken en bewaart alleen de uitleg eromheen: waarom iets stuk
was, wat er al geprobeerd is, en welke conclusie achteraf fout bleek. Dat
laatste is de reden dat de opgeloste punten hieronder blijven staan.

**Twee regels houden dit hoofdstuk klein**, want het was de kant op aan het
groeien die `PIDLANE-WERK.md` de kop kostte:

1. Geen lijst van open punten hier. De issues zijn de bron en zijn gelabeld op
   soort, kant en ernst; een tweede lijst loopt uit de pas en dan is de vraag
   welke klopt.
2. Afgehandeld én ouder dan twee weken gaat naar `PIDLANE-ARCHIEF.md`. Niet
   weggegooid — verplaatst naar een bestand dat je gericht doorzoekt in plaats
   van standaard laadt.


### Alles wat de app over zijn meting wist, ging naar één lezer — 11-09-2026 (#188)

De app weet sinds weken hoe goed zijn eigen meting was. `PLRit` telt loopgaten,
meetgaten en herverbindingen. `PLAchtergrond` weet hoe lang de app weg was en —
sinds de hartslag van 08-09 — hoeveel daarvan de meetlus wérkelijk stillag.
`plGatDuiding()` legt die twee naast elkaar en beantwoordt daarmee de vraag
*waardoor* een gat er is: de telefoon die bevroor, of de bus die niets gaf.
`buildQualityReport()` zegt per sensor of de waarde te vertrouwen is.
`supportedPIDs` zegt wat de auto überhaupt kan.

**Dat ging allemaal naar precies één lezer: het testrunverslag.** De AI-analyse
kreeg er niets van mee. Een rapport kon dus geschreven worden over een reeks met
een gat van twee minuten erin, zonder dat er in de prompt stond dat dat gat er
was — laat staan waardoor.

**Vier vormen waarin dat misgaat, en de tweede is de duurste.**

1. Een gat leest als een sensor die uitvalt; een waarde die na een herverbinding
   springt leest als een defect. Dat is een vals alarm met een factuur eronder.
2. Een sensor die niet in de selectie stond leest als *"niets gevonden, dus in
   orde"*. Dat is het spiegelbeeld — een gemist defect — en het ziet er precies
   zo uit als een goede uitslag.
3. De vraag zelf stond nergens. Elk van de twintig aanroepplekken schreef met de
   hand in proza op wat er geanalyseerd moest worden.
4. Het `DATAKWALITEIT`-blok ging mee als de aanroeper eraan dácht. Dat is geen
   dekking maar een gewoonte.

**De oplossing is geen zesde promptregel maar één eigenaar.**
`pidlane-aanlevering.js` (`PLAanlevering`) is de enige plek die antwoord geeft
op *"wat weet de AI over de kwaliteit van deze meting"*, en hij hangt op één
punt in — in `apiFetch()`, naast de rijsituatie en de meetcontext — zodat geen
aanroepplek hem kan vergeten. Zelfde vorm als `pidlane-achtergrond.js` koos voor
de vijf `visibilitychange`-luisteraars: de deelnemers doen hun eigen werk, het
oordeel staat op één plek.

Het blok draagt zeven delen: de vraag, het meetvenster, de **dekking** (welke
sensoren deze analyse nodig had en welke daarvan ontbreken, mét de reden), de
**onderbrekingen** met hun naam, het bestaande kwaliteitsblok, de
correlatiebevindingen, en vijf weegregels die zeggen wat er per geval níét
geconcludeerd mag worden.

**Drie beslissingen die de moeite van het onthouden waard zijn.**

- **De reden waaróm een sensor ontbreekt is de hele waarde van dat blok.**
  Niet-ondersteund, niet-geselecteerd en geen-antwoord leiden tot drie
  verschillende adviezen, en de volgorde van de controles ligt daarom vast:
  eerst ondersteuning, dan selectie, dan het antwoord. Andersom zou een sensor
  die de auto niet heeft een monteur naar een knop sturen die niets oplost.
- **Is `supportedPIDs` leeg, dan wéten we het niet.** `ondersteuningBekend` is
  dan `null` en niet `false`, en het blok zegt het erbij. Een lege verzameling
  als *"de auto kan niets"* lezen verklaart elke ontbrekende sensor weg, en dat
  is de gevaarlijkste kant om op te vallen.
- **Of een wáárde bruikbaar is, vragen we aan `assessPidQuality()` en niet aan
  `_pidHealth`.** Die twee lijken hetzelfde maar beantwoorden een andere vraag:
  `_pidHealth` gaat over of de sensor er ís (het oordeel van de
  gezondheidscheck bij het verbinden, soms minuten oud), `assessPidQuality()`
  over de waarde die er nú staat. Zonder dat onderscheid zegt de dekking
  "geleverd" over een waarde die het kwaliteitsblok drie regels verderop
  uitsluit.

**Standaard aan, met een opt-out — en dat is met opzet omgekeerd.** Promptcaching
staat hier uit (§8), dus elke regel gaat bij elke analyse opnieuw over de lijn en
kost geld. De verleiding is dus het blok alleen mee te sturen waar de aanroeper
zegt dat het nodig is — en dat is exact de gewoonte die onder punt 4 hierboven
misging. De module beslist het daarom zelf, op één meetbaar gegeven: **is er
gemeten.** Staat er niets in de selectie en is er geen historie, dan is het blok
leeg en betaalt de verbindingsvraag uit `pidlane-btflow.js` er niet voor. Zegt
een aanroeper wél wat hij wil laten analyseren (`vraag` of `set`), dan komt het
blok er altijd — juist dan, want *"je vraagt een oordeel over een meting die er
niet is"* is op dat moment het nuttigste dat een model kan horen.

**En een tegenproef die eerst niet deugde.** De eerste versie van de controle op
de haak keek of de tekst `PLAanlevering.blok` in `apiFetch` stond. Die is
nagemeten door de haak op `if(false)` te zetten, en hij bleef groen: hij bewees
dat er een regel stond, niet dat die regel iets deed — precies de proef die
CLAUDE.md waardeloos noemt. `bproef-aanlevering.js` doet het nu als gedrag:
`plFetch` wordt onderschept, `apiFetch()` draait voor het overige echt, en er
wordt gekeken of het blok in de `system` staat die verstuurd zou worden. Geen
byte naar Anthropic, geen tegoed. Diezelfde ingreep maakt hem nu wél rood.

Blok 5 doet daarom alleen nog wat alleen daar kan: op een echte rit de
gatentelling van de aanlevering naast die van `PLRit` en `PLAchtergrond` leggen.
De verzendlaag onderuit halen midden in de app van een klant hoort niet bij een
testrun.

### De aanroepkant: twaalf analyses zeggen nu wat ze wilden meten — 11-09-2026 (#188)

De ronde hierboven bouwde de aanlevering en hing hem in `apiFetch`. Daarmee
kreeg elke analyse het meetvenster, de onderbrekingen, de datakwaliteit en de
bevindingen — maar **niet de dekking**, want die hangt af van wat de aanroeper
wilde meten en dat wist niemand. Dit is het tweede deel: de aanroepplekken
zeggen het.

**Ze zeiden het trouwens al.** Elke analyse in deze app noemt zijn PID-set één
regel hoger: `ensurePIDsActive('brandstof')`, `('totaal')`, `('rit')`,
`('accu')`, `('emissie')`. Een aanroeper geeft nu die naam door en niets meer:

```js
await callAI(prompt, el, { vraag: '…', profiel: 'totaal' });
```

Daardoor is de dekking geen tweede lijst die iemand moet bijhouden maar een
gevolg van een keuze die er al stond. Verandert `ANALYSE_PIDS`, dan verandert de
dekking mee. `PLAanlevering.profielSet()` vertaalt de naam op precies één
manier — `BASIS_PIDS ∪ ANALYSE_PIDS[profiel]`, dezelfde vereniging die
`relevantSupportedPIDs()` als basis neemt.

**De kern is ongefilterd, en dat is het hele punt.**
`relevantSupportedPIDs()` filtert die basis daarna door de PID-gate en vult hem
aan met wat de auto verder nog levert. Dat is de goede lijst om te **meten** en
de verkeerde om dekking aan af te lezen: alles wat de auto niet heeft of wat de
gate afkeurt, is er dan al uit. De sensoren die in het blok hóren te staan zouden
onzichtbaar zijn, en dan meldt de dekking vrolijk "compleet" over een analyse die
de helft mist.

**Twaalf paden wél, twee met opzet niet.** Wél: brandstofanalyse, AI-monteur,
Total Check, datalog, diepe storingscheck, ritrapport, caravanrapport,
onderhoudsadvies, EV/accu-check, lange-rit-check, koopcheck en de
AI-Automonteur (die laatste zonder profiel — hij draait op wat er op dát moment
in de selectie staat, en een profielnaam zou daar een dekking beloven over een
set die de vraag nooit opvroeg; een verkeerde dekking is erger dan geen).

Niet: de verbindingsvraag in `pidlane-btflow.js` — die gaat niet over
sensordata. En de oorzakenlijst in `pidlane-diagnose.js`, en dáár zit een echte
botsing: die aanroep vraagt om **uitsluitend een JSON-array**, terwijl de
weegregels om uitleg in woorden vragen. Een model dat netjes toelicht dat iets
niet beoordeeld is, levert JSON op die `parseCausesJSON()` weggooit. Dat pad
bouwt zijn eigen dekkingslijst al in de prompt (✅/⚠/❌) en verliest er dus
niets mee. Allebei krijgen `{meet:false}`, met de reden erbij in de code.

**Een typefout in een profielnaam is de stille fout van deze ronde**, en de enige
die niet met gedrag te vangen is: `profielSet()` geeft dan `null`, `dekking()`
geeft `null`, en het blok gaat gewoon mee — zonder dekking, zonder melding, tot
iemand dat ene knopje indrukt. `test-aanlevering.js` leest daarom de bron en
toetst dat elke `profiel:'x'` in de modules ook in `ANALYSE_PIDS` staat. Dat is
broncode lezen, en het is hier de juiste vorm: de vraag is of een naam in een
tabel voorkomt, en dat is een statisch feit. Blok 5 doet hetzelfde op de rit met
`window._laatstProfiel`, dus daar wordt het ook op de echte naam betrapt.

De eerste versie van die scan sloeg trouwens meteen alarm — op
`'Pollprofiel: ' + p.emoji` in `pidlane-diagbundel.js`. De regex was te los en
las een stuk tekst in een string als een sleutel. Vandaar dat hij nu een
object-context én een kale kleine-letternaam eist.

---

**Wat deze twee rondes samen niet oplossen.** Of een rápport er werkelijk anders
van wordt, is hier niet te meten. `test-aanlevering.js` toetst de regels in node
(43 toetsen, acht mutaties in `plmutate.sh`) en `bproef-aanlevering.js` de
koppeling in de draaiende app (27 toetsen, met de haak én de trechter `callAI()`
als gedrag). Wat een model met die tekst doet, staat alleen in de tekst die eruit
komt — dat is een vraag voor `CAMPAGNE` en staat daar.

En acht aanroepplekken draaien nog op de standaard: ze krijgen wél het
meetvenster, de onderbrekingen, de datakwaliteit en de weegregels, maar geen
dekking. Dat is voor de meeste terecht — een herzien rapport, een lease-check, de
klimaatcheck — maar de twee deep-log-paden in `pidlane-koopcheck.js` analyseren
een ópgenomen dataset, en wat dáár de dekking van is, is een andere vraag dan wat
er nu in de selectie staat. Dat is niet opgelost en het heeft geen issue: het
wacht op de vraag of een opname zijn eigen dekking hoort te dragen.

---

### De scanvlag was op één plek aangesloten — 11-09-2026 (#191)

Gemeld uit het gebruik: *bij diep zoeken op de PID-keuzepagina gaat de ECU
tijdelijk veel lege antwoorden teruggeven, en die dip genereert meerdere
waarschuwingen in rapporten.*

Dat is precies het mechanisme van de adresscan hierboven (04-09, *"Elke scan
mislukte, en dat lag niet aan de adressen"*), oorzaken 3 en 4 — alleen was de
reparatie daar nooit op dit pad aangesloten.

`deepRefreshPIDs()` pollt na de twee discovery-rondes nog **96 PIDs** los
(`0x01`–`0x60`). De meeste bestaan op een gegeven auto niet, dus die lege
antwoorden zijn het meetresultaat. Twee bewakers lezen ze anders:

| bewaker | wat hij ervan maakt |
|---|---|
| `PLBus.note()` | telt ze als fout → `foutPct` naar ~100% → `PLBusGate` dicht → waakronde en watchers melden gezonde sensoren als uitgevallen |
| `trackBtQuality()` | zes lege op rij = "socket dood" → volledige herverbinding, midden in de scan |

Allebei houden zich stil zodra `window._plScanActief` aan staat. Die vlag
bestond sinds 04-09 en werkte — maar hij stond op precies één plek, in
`PLKaart`.

**De val zit niet in de vlag maar in wat hij wegneemt.** `_plScanActief` zet de
dode-socket-detectie uit. Wie hem aanzet en verder niets doet, ruilt valse
waarschuwingen in voor een scan die stilletjes doorploetert op een verbinding
die al weg is: dezelfde fout in spiegelbeeld, en stiller — je merkt hem pas als
de rit voorbij is. `PLKaart` loste dat op met een `ATI`-hartslag (elke 60
commando's, of na 25 lege op rij; afbreken na twee stille).

`pidlane-scanslot.js` maakt van die drie dingen één plek, en ze zijn niet los
te krijgen: je kunt de vlag niet aanzetten zonder het vangnet mee te krijgen.
`doe()` geeft je een `stuur()`, en dát is het enige punt waar een commando de
bus op gaat — wie eromheen `sendCmd()` aanroept doet dat zichtbaar.

1. busslot claimen, en blijven aantikken met `PLBus.raak()` zodat de noodrem
   (`MAX_HOLD_MS`, drie minuten) het slot niet halverwege onteigent — 96 PIDs
   × tot 800 ms komt daarbij in de buurt
2. `window._plScanActief` aan, en in een `finally` weer uit
3. de `ATI`-hartslag als vervanging voor het vangnet dat punt 2 weghaalt

**Nestelen moet kloppen.** Draait er al een scan, dan stond de vlag al aan en
zet deze `finally` hem níét uit — anders zet de ene scan het vangnet van de
andere terug terwijl die nog midden in een adressweep zit. Daarom onthoudt
`doe()` wat er stond.

**Alleen de 96-sweep gaat erdoorheen.** `discoverPIDsBitmap()` en
`discoverPIDsDirect()` vragen tien bekende PIDs, hebben het probleem niet, en
houden dus hun gewone bescherming. Een vlag aanzetten voor code die hem niet
nodig heeft is vangnet weggeven voor niets.

**`PLKaart` staat nog op zijn eigen uitvoering.** Die is in een rit getoetst, en
verhuist pas als daar een reden voor is die groter is dan netheid. Wat er nu
staat is de plek voor elke nieuwe scan; dat er twee uitvoeringen zijn is
bekend en opgeschreven in plaats van stilzwijgend.

**Wat er niet mee gemeten is:** of de dip werkelijk uit de rapporten verdwijnt.
Dat leest af aan de blok 5-proef op `PLBusGate` en aan de waakrondemeldingen,
en het vraagt een rit met een druk op *Diep zoeken*.


### Twee keer op één dag de vraag: welke schil draait dit? — 11-09-2026 (#18)

Bij de meetdienst en later bij de wake lock stond dezelfde vraag op tafel:
*draait deze meting op de nieuwe APK of op de oude?* Beide keren was dat uit
het testrunverslag niet te halen. Er staan twee versienummers in de kop —
`TESTRUN_VERSIE` en `APP_VERSION` — en die komen allebei uit de **webpagina**.
Op elke schil zijn ze gelijk.

**Dat is geen schoonheidsfoutje.** Een native wijziging zit uitsluitend in de
APK, terwijl de pagina los bijlaadt. Draai je de nieuwe pagina op een oude
schil, dan meet je oude native code terwijl het verslag er nieuw uitziet. De
tweede keer kostte dat bijna een verkeerde conclusie: de rit van 12:33 leek een
meting mét wake lock, en de enige reden dat dat klopte was dat de bestuurder de
APK inderdaad had bijgewerkt — niet iets wat het verslag zei.

De build-workflow schrijft `apk/version.json` naar R2 met precies dit doel. Het
commentaar daar zegt het letterlijk: *"dat was precies wat vandaag ontbrak toen
de vraag was of het toestel de nieuwe APK had"*. De Worker serveert het al op
`/version.json`. Alleen keek de app er nooit in.

`pidlane-schil.js` legt daarom twee getallen naast elkaar:

| | waar het vandaan komt |
|---|---|
| `bouw()` | de `versionCode` van de draaiende schil, via Capacitor `App.getInfo()` |
| `nieuwste()` | de `versionCode` die de Worker uit R2 serveert |

De kop van het verslag draagt vanaf nu een regel `APK : build 438 (3.0.0)`, en
blok 5 zegt het **vóór** de rit als de schil achterloopt — een kop lees je pas
als er al gereden is.

**De valkuil zit in het derde antwoord, niet in de eerste twee.** Een
achterstand van nul omdat er niets op te halen viel, leest als "je bent bij".
Daarom is `achterstand()` `null` zodra één van beide getallen ontbreekt, geeft
`bouw()` `null` in plaats van 0 bij een onleesbare build, en boekt de proef
"niet te vergelijken" als LET OP met de reden erbij. Dat is dezelfde regel als
overal in dit dossier: niet-gemeten is geen nul.

**Vooruitlopen is expliciet geen fout.** Een zelf gebouwde schil ligt vóór op
R2; dat mag, maar het hoort zichtbaar te zijn, want wat je dan meet heeft
niemand anders.

Onderweg gerepareerd: `test-achtergrondproef.js` zocht zijn proef met een
filter op issue en nam daarvan de eerste. Er staan nu drie proeven onder #18,
dus dat filter pakte de eerste die toevallig bovenaan stond. Hij zoekt nu op
naam, en `test-blok5lijst.js` bewaakt al dat namen uniek zijn.

### De renderer wordt stilgezet, niet afgeknepen — en de wake lock ontbrak — 11-09-2026 (#18)

De meetdienst van gisteren heeft zijn eerste rit gedaan, en hij heeft de vraag
beantwoord waar hij voor gebouwd is. Drie afwezigheden in één sessie, SM-S947B
op Android 16, APK build #437, melding zichtbaar in de statusbalk.

| tijd | app weg | proces (native hartslag) | webview |
|---|---:|---|---|
| 10:46 | 77 s | 77 s door, 0 s stil (78 slagen) | 59 s door, 18 s stil |
| 10:52 | 310 s | 310 s door, **0 s stil** (310 slagen) | 59 s door, **251 s stil** |
| 11:02 | 485 s | 222 s door, **34 s stil** (373 slagen) | 60 s door, 426 s stil |

**De procesbevriezing is weg.** 310 slagen over 310 seconden zonder één gat, op
hetzelfde toestel dat op 09-09 na 50 seconden volledig stilviel. Richting 1
werkt voor de helft waar hij over gaat: een proces met een draaiende foreground
service komt niet in de cached-toestand en wordt niet bevroren.

**En de tweede helft is nu ook beslist.** De meting van 10:52 is de lange
afwezigheid die daarvoor nodig was: 251 seconden aaneengesloten stilte in de
WebView. Was het throttling naar één tik per minuut geweest, dan was de
grootste stilte ongeveer 60 s — herhaalde gaten van een minuut, niet één van
ruim vier. De renderer wordt dus **stilgezet**, niet afgeknepen.

De aanlooptijd daarheen is opvallend hard: **59, 59 en 60 seconden**, bij
afwezigheden van 77, 310 en 485 s. Drie metingen, één getal, ongeacht hoe lang
de app wegblijft. Dat is een drempel en geen toeval — en het is een andere klok
dan de 36 s en 50 s van de procesbevriezing van vóór de meetdienst.

**Wat daaruit volgt voor richting C.** Picture-in-picture is de kandidaat, en
het is de kleine variant: in PiP blijft de WebView zichtbaar, dus blijft de
renderer voorgrond. Een zwaardere of tweede service voegt niets toe — het
app-proces was aantoonbaar niet het probleem. Een volledig native meetlus in
Kotlin, de dure kant van richting C, lijkt daarmee overbodig. Dat is precies de
keuze die deze opzet moest onderbouwen in plaats van gokken.

#### De derde meting wees op iets anders: de wake lock ontbrak

373 slagen waar er ongeveer 485 hoorden te staan, met het grootste gat (34 s)
vanaf 222 s. Naast dat ene gat zijn er verspreid nog eens ~78 seconden aan
slagen gemist. De dienst draaide, maar het proces werd onderbroken.

Het issue schrijft richting 1 als *"foreground service **plus wake lock**"*, en
die tweede helft stond er niet. Een foreground service houdt het proces uit de
cached-toestand; hij houdt de **CPU** niet wakker. Gaat het scherm uit en gaat
het toestel slapen, dan vuurt de handler van de hartslag niet meer.

`PLWake` in `index.html` lost dat niet op en is iets anders: dat is een
**scherm**-wake-lock via de Screen Wake Lock API, en het OS geeft die vrij
zodra de app verborgen raakt — je ziet in het log dat hij bij elke terugkomst
opnieuw geclaimd wordt. Juist tijdens de afwezigheid is hij er dus niet.

De knik op ~3,7 minuten past bij een gebruikelijke schermtime-out gevolgd door
een slapend toestel. De twee kortere afwezigheden bleven daarbinnen en hadden
er geen last van.

`PLMeetdienst` neemt daarom sinds vandaag een `PARTIAL_WAKE_LOCK`, met
`WAKE_LOCK` in het manifest en een poort op het samengevoegde manifest ernaast
— zonder die permissie gooit `acquire()` een `SecurityException`, draait de
dienst gewoon door en hapert de hartslag pas na minuten. Dat is het soort
uitval dat je pas terugvindt in een rit die je al gereden hebt.

**Geen time-out op de lock, en dat is een keuze.** Een `acquire()` met
tijdslimiet stopt midden in een rit met beschermen zonder dat iets dat meldt —
precies de stille vorm waar dit hele issue over gaat. De lock leeft exact zo
lang als de dienst, en de dienst zo lang als er een echte adapterverbinding is.

**De prijs is batterij.** Zolang je verbonden bent blijft de CPU wakker, ook
met het scherm uit. In de auto hangt het toestel meestal aan de lader; staat
het dat niet, dan kost een lange rit merkbaar lading.

#### En de melding beweerde alweer wat hij niet gemeten had

De derde meting kwam het logboek in als:

```
native: 222 s doorgelopen, 34 s stil (373 slagen) — allebei stil:
het hele proces is bevroren, ondanks de meetdienst
```

Dat draagt de meting niet. Het proces liep 222 seconden, viel 34 seconden stil,
en tikte daarna nog ruim 150 keer. *"Het hele proces is bevroren"* is een
uitspraak over 485 seconden op grond van 34. De drempel in `duiding()` stond op
drie seconden, en daarboven volgde meteen het zwaarste verdict.

**Dit is letterlijk dezelfde vorm als de bevinding van 08-09 hieronder** — een
melding die beweert wat hij niet gemeten heeft — en hij stond drie dagen later
alweer in nieuwe code, geschreven door dezelfde hand die de vorige repareerde.
Dat is de reden dat deze notitie er staat: de fout is niet "een verkeerde
drempel" maar de neiging om een meting als een oordeel te formuleren.

De duiding noemt nu een **verhouding**: 34 s van 485 s, 373 van de ~485 slagen.
Lag het proces meer dan de helft van het venster stil, dan heet dat nog steeds
zo; daaronder heet het een hapering, met de verklaring erbij die erbij past.
`test-meetdienst.js` toetst allebei de kanten met de echte getallen van deze
rit, en `plmutate.sh` maakt ze rood.

#### Wat er nog niet gemeten is

De wake lock zelf. De aanleiding is gemeten, de reparatie niet — een
afwezigheid van acht minuten of langer op een niet-opgeladen toestel is de
proef, en die staat nog open.


### De native meetdienst: een oplossing die tegelijk een meting is — 11-09-2026 (#18)

`#18` stond sinds 27-08 open en is twee keer hard gemeten. Wat openbleef was
niet *wat* er gebeurt maar *waardoor*, en die vraag houdt de keuze van de
oplossing gegijzeld.

| rit | app weg | nog doorgelopen | werkelijk stil |
|---|---:|---:|---:|
| 02-09 (stationair) | 120 s | ~36 s | ~84 s |
| 09-09 (rijdend, 4 aanvragers, bus 93%) | 182 s | ~50 s | ~132 s |

**Twee mechanismen leveren exact dit beeld op, en ze vragen om een andere
oplossing.** Android zet een proces dat in de cached-toestand komt helemaal
stil (de freezer): dan staat álles stil, JavaScript én native code. Chromium
knijpt een verborgen pagina af: dan loopt het proces door en ligt alleen de
WebView stil. Van buiten is het verschil onzichtbaar — de meetlus doet niets —
en een foreground service helpt tegen het eerste en niets tegen het tweede,
want die throttelt op zichtbaarheid en niet op procesprioriteit.

Dat stond op 01-09 al in het issue, als *lezing* en met het voorbehoud erbij
dat een plausibele redenering geen bewijs is (de #35-les). Een jaar architectuur
bouwen op de verkeerde helft van die tweedeling kost weken: richting C is de
hele meetketen een tweede keer bouwen in Kotlin, tegen de harde randvoorwaarde
onderhoudslast.

**De uitweg is niet kiezen maar meten, en dat kan met precies hetzelfde bouwsel
als de oplossing zelf.** Er draait nu een foreground service
(`FOREGROUND_SERVICE_CONNECTED_DEVICE`, zolang er een echte adapterverbinding
is) met een eigen hartslag van één seconde — dezelfde seconde als de hartslag
die `pidlane-achtergrond.js` sinds 08-09 in de WebView laat lopen. Twee tellers
over hetzelfde venster, genulstel op hetzelfde moment (`visibilitychange` →
hidden, want dán loopt de app aantoonbaar nog), en het verschil ertussen is het
antwoord:

| native hartslag | webview-hartslag | wat dat betekent |
|---|---|---|
| liep | liep | opgelost |
| liep | lag stil | het proces leefde, Chromium kneep de pagina af — dan is dit niet genoeg en volgt picture-in-picture of een native meetlus |
| lag stil | lag stil | het hele proces is bevroren, ondanks de dienst |

**Het oordeel staat in JavaScript en niet in Java**, en dat is geen
smaakkwestie. De native kant levert ruwe getallen: wanneer begon het venster,
wanneer vuurde de hartslag voor het laatst, hoe vaak, wat was de grootste
stilte. Wat dat *betekent* — aanlooptijd, stilte, kwam hij uit zichzelf terug —
rekent `pidlane-meetdienst.js` uit, met dezelfde staartregel als de
JS-hartslag. Daarmee is het in node te toetsen zonder toestel, en is er één
plek waar het staat. Twee plekken die hetzelfde uitrekenen is hier al drie keer
een bug geweest.

**De staartregel is de reden dat die code niet triviaal is.** De hartslag stopt
niet uit zichzelf op het moment dat de app terugkomt. Ontdooit het proces een
fractie vóór het uitlezen, dan zit de bevriezing in `stilMs`; ontdooit het
niet, dan zit hij in de afstand tussen de laatste slag en nu. Zonder de staart
meet de module soms nul terwijl het proces twee minuten stillag — afhankelijk
van de volgorde van twee gebeurtenissen waar niemand invloed op heeft. Dat is
precies de stille meetfout die een teller onbruikbaar maakt, en hij is aan
beide kanten (JS en native) hetzelfde opgelost.

**Waarom de Java in `native/` staat en niet in de workflow.** De `android/`-map
wordt elke build opnieuw gegenereerd uit het Capacitor-template, dus native code
moet er bij elke build in gezet worden. Dat kan met een heredoc in
`build-apk.yml` — en dan leest niemand hem ooit terug, zegt de diff niets en kan
geen test hem nakijken. De twee bestanden staan daarom in de repo; de workflow
kopieert ze, registreert de plugin in `MainActivity` (vóór `super.onCreate()`,
want de bridge leest die lijst tijdens het opstarten) en injecteert service en
permissies in het manifest.

**Wat hier stil kan falen, en wat daartegen staat.** Een plugin die in de app
zelf woont staat niet in `capacitor.plugins.json` — dat bestand gaat alleen over
`node_modules`. Zonder `registerPlugin` bestaat `Capacitor.Plugins.PLMeetdienst`
niet, en dan zegt de app *"geen native meetdienst in deze schil"*: exact dezelfde
zin als een browser. Je ziet het dus niet aan het logboek, je ziet het pas als
er een rit voor niets gereden is. Vier plekken die elkaar niet kennen moeten
daarvoor gelijk blijven — de pluginnaam, de servicenaam, het servicetype en de
hartslagfrequentie — en `public/test-nativeschil.js` legt ze naast elkaar.
Daarnaast eist de poort op het **samengevoegde** manifest (na `bundleRelease`,
dus op wat er werkelijk in de `.aab` staat) de service, `exported="false"`,
`foregroundServiceType="connectedDevice"` en de permissie die bij dat type
hoort. Android 14 weigert `startForeground()` als die laatste twee niet bij
elkaar passen, en dat merk je anders pas op het moment dat iemand verbindt.

**Wat er níét gemeten is.** De dienst compileert en het manifest wordt bij elke
build op drie punten nagekeken, maar hij heeft nog nooit op een toestel
gedraaid. Of Android de service accepteert, of de melding verschijnt, of het
proces werkelijk wakker blijft: dat is niet na te bouwen zonder toestel, en het
is de bevinding van de eerstvolgende rit — welke kant hij ook op valt. Blok 5
boekt de uitslag daarom als LET OP en niet als FOUT zolang er iets stillag:
alle drie de uitkomsten hierboven zijn een geldige meting, twee ervan wijzen
alleen een andere kant op dan gehoopt. Er een bevinding van maken zou de meting
met het oordeel verwarren — dezelfde fout die de #18-proef op 08-09 kwam
repareren.

**Onderweg gevonden, en niet in deze ronde gerepareerd: `window.connected`
zetten doet niets.** `connected` en `demoMode` staan in `pidlane-auth.js` met
`let` op het hoogste niveau. Dat maakt ze globaal maar géén eigenschap van
`window` — een lexicale binding en een window-property zijn twee verschillende
dingen. Code die de kale naam leest ziet een `window.connected = true` dus
niet. `bproef-meetdienst.js` liep daar bij het schrijven op vast (de dienst
kreeg `stop()` waar `start()` hoorde) en zet ze nu zonder voorvoegsel.
`bproef-vinlek.js` zet ze nog wél met `window.` — die proef staat groen, maar
die ene regel doet daar niets, en een regel die niets doet terwijl hij iets
lijkt te doen is hier al vaker het begin van een dud geweest. Vastgelegd als
issue, niet in deze ronde aangeraakt: één onderwerp per PR.

**Eén ding kan de app niet zelf vaststellen: stond de melding in de
statusbalk.** Zonder `POST_NOTIFICATIONS` onderdrukt Android 13+ de melding
terwijl de service gewoon doorloopt, en van binnenuit is dat verschil niet te
zien. De achtergrondstap van de begeleide rit vraagt er daarom om, en dat is
de enige waarneming van deze ronde die een mens moet doen.


### De .aab vroeg locatie op elke Android-versie, en twee toetsen zeiden van niet — 10-09-2026 (opgelost)

`build-apk.yml` injecteert de permissieset in `android/app/src/main/AndroidManifest.xml`.
Daar stonden BLUETOOTH_SCAN met `neverForLocation`, BLUETOOTH_CONNECT, de twee
legacy-BT-permissies en CAMERA. Er stond een uitvoerig commentaarblok bij over
locatie — *"vandaar dat de permissie blijft staan MET maxSdkVersion=30"* — maar
in de geïnjecteerde tekst zelf stond geen enkele locatieregel.

Dat was geen slordigheid met alleen documentaire gevolgen. Beide BT-plugins
declareren de permissie zélf, in hun bibliotheekmanifest, zonder grens:

```
node_modules/@capacitor-community/bluetooth-le/android/src/main/AndroidManifest.xml
node_modules/@ascentio-it/capacitor-bluetooth-serial/android/src/main/AndroidManifest.xml
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

Noemt het app-manifest een permissie niet, dan neemt de manifest-merge die van
de bibliotheek ongewijzigd over. De bundel vroeg dus locatie op élke
Android-versie, terwijl §11 van `PLAY-INZENDING.md` locatie nergens aanvinkt in
Data safety. Dat verschil tussen gevraagde permissies en het ingevulde
formulier is een afwijsgrond, en het haalt `neverForLocation` onderuit: de app
verklaart dat een scan niet voor plaatsbepaling is en vraagt er tegelijk
onbeperkt locatie bij.

**Waarom niets dit zag, en dat is het eigenlijke punt.** Er stonden twee
wachters, en allebei keken ze naar het verkeerde bestand.

De CI-controle stond ín de injectiestap:

```python
for _p in ('ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'):
    for _m in _re.finditer(r'<uses-permission[^>]*' + _p + r'[^>]*/>', xml):
        if 'maxSdkVersion="30"' not in _m.group(0):
            ...
```

`xml` is daar het APP-manifest, dus de INVOER van de merge. Wat een plugin
meebrengt staat daar per definitie niet in. De lus vond nul regels en meldde
`OK: permissieset compleet, niets verbodens gevonden`. Hetzelfde gold voor de
verbodenlijst eronder (ACCESS_BACKGROUND_LOCATION, READ_PHONE_STATE,
QUERY_ALL_PACKAGES, REQUEST_INSTALL_PACKAGES) — met in het commentaar erbij:
*"Als een plugin hem ooit meesmokkelt via manifest-merge wil je dat hier
zien."* Precies dat kon hij niet.

`test-geen-gps.js` deed het in zijn eigen vorm nog een keer:

```js
const locRegels = (wf.match(/uses-permission[^\n]*ACCESS_(FINE|COARSE)_LOCATION[^\n]*/g) || [])
toets('locatiepermissie staat alleen met maxSdkVersion=30 in het manifest',
  locRegels.every(r => /maxSdkVersion="30"/.test(r)));
```

De workflow injecteerde geen locatieregels, dus `locRegels` was leeg, en
`[].every(...)` is `true`. Nagemeten: `aantal gevonden regels: 0`,
`every() op lege lijst => true`. De toets ernaast — *"de CI controleert dat zelf
ook"* — stond groen omdat de tekst van die vacuüme controle in de workflow te
vinden was.

**Wat er is nagemeten.** Er is geen Android-SDK op de machine waar dit
onderzocht is, dus er is geen echte `.aab` gebouwd. Het template is wel
gegenereerd (`npx cap add android`: minSdk 24, compileSdk 36, targetSdk 36) en
de merge is gedraaid met de standalone `manifest-merger`. Uitkomst zonder de
twee regels: `ACCESS_COARSE_LOCATION` en `ACCESS_FINE_LOCATION` kaal in het
samengevoegde manifest. Met de twee regels erbij: allebei met
`maxSdkVersion="30"`, en geen dubbele. Het app-manifest heeft voorrang bij de
merge, dus de grens wint.

Eén waarneming uit die proef hoort hier als vergissing bij bewaard te worden:
de eerste run toonde ook `WRITE_EXTERNAL_STORAGE`, `READ_PHONE_STATE` en
`READ_EXTERNAL_STORAGE`. Dat leek een tweede vondst en was het niet — het is de
legacy-regel van de merger die die permissies toevoegt als een bibliotheek geen
`uses-sdk` draagt. Zodra de plugin-manifesten er een kregen, verdwenen ze.
AGP levert die informatie in een echte build uit de AAR. Een gereedschap dat
buiten zijn gewone omgeving draait, meet ook zijn eigen omgeving mee.

**Wat er veranderd is.** De injectie zet de twee regels er nu bij, met
`maxSdkVersion=30`. De controle is verplaatst naar een eigen stap ná
`bundleRelease`, die het SAMENGEVOEGDE manifest leest uit
`android/app/build/intermediates/merged_manifests/`, de hele permissielijst in
het logboek zet, en hard omvalt als dat pad niet bestaat — een controle die
zichzelf uitzet omdat AGP een map hernoemt, is dezelfde val als hierboven. Die
stap eist bovendien dát de locatiepermissie er ís: de plugins brengen hem toch
mee, dus "niet gevonden" betekent daar dat er een verkeerd bestand gelezen
wordt. `test-geen-gps.js` eist nu beide regels (`r.length === 2`) en draagt zijn
eigen tegenproef; vier mutaties in `plmutate.sh` houden het geheel scherp.

**De les is niet "beter opletten".** Het is dat een controle die over een
verzameling loopt eerst moet eisen dát die verzameling gevuld is. `every()`,
`all()` en `for x in []` geven alle drie groen op niets, en dan meet je de
afwezigheid van bewijs en noemt dat bewijs van afwezigheid. Dezelfde vorm zit
in `test-healthgate.js` (§11 hieronder) en in `test-waakronde.js`: een toets die
groen kán staan is nog geen toets die iets onderscheidt.

---

### De koopknop was vanuit Airtable aan te zetten, in een app die Play beoordeeld had — 10-09-2026 (#42)

`PLKlant.CFG.tikkieKopen` leest `tikkie_kopen` uit de Config-tabel in Airtable,
via `/api/config`. Staat daar een geldige `https://tikkie.me/…`-link, dan
verschijnt in "Mijn tokens" de knop *"100 tokens kopen — €4,99"*. Dat was sinds
28-08 met opzet zo: de link hoorde te wisselen zonder deploy (#24).

Wat daar niet bij bedacht was: de Play-schil laadt `app.pidlane.nl` live. Die
knop verschijnt dus in dezelfde app die Play beoordeeld heeft, en tokens zijn
digitale content die in de app verbruikt wordt — het terrein van Google's
betaalregels. Eén veld in een Airtable-tabel kon de app in overtreding brengen:
geen commit, geen `plcheck.sh`, geen build, niets dat het ziet. Een
beleidskeuze die van buiten de repo aangezet kan worden is geen beleidskeuze.

De code was zich van de vraag wél bewust — `pidlane-klant.js` droeg er een
comment over, en blok 5 had een proef die eiste dat `tikkie_kopen` leeg was.
Maar dat was een afspraak, geen grens: de proef draait alleen als iemand op een
toestel een testrun start, en de knop stond dan allang in de app.

`_betaallink()` geeft nu niets terug zodra `Capacitor.isNativePlatform()` waar
is. Bij een fout in die detectie ook niet: een knop die ten onrechte wegblijft
kost een mailtje, andersom kost het de inzending. De browserversie houdt de
link — die wordt niet door Play gedistribueerd, dus daar speelt de vraag niet.
De grens zit op het punt waar zo'n link de app binnenkomt en geldt daarmee voor
kopen én doneren; een tweede plek zou een tweede waarheid zijn.

**Dit sluit #42 niet.** De vraag of tokens ín de app verkocht mogen worden en
onder welke voorwaarde, is nog steeds niet beantwoord. Wat hier veranderd is,
is alleen dat het antwoord niet meer per ongeluk gegeven kan worden.

---

### §16a van de inzendlijst noemde een wachter die niet bestond — 10-09-2026

De tabel *"Wat een test bewaakt (blijft vanzelf waar)"* zette achter de regel
*"Geen koopknop in de app, geen APK-distributie in de app"* het bestand
`test-playteksten.js`. Dat bestand toetst tekenlimieten, URL's, anonimisering,
versienummer, wachtwoorden, release notes en taalblokken. Koopknop noch APK
komt erin voor.

Die tabel is op 10-09 gemaakt om precies deze fout op te lossen: §16 stond vol
vinkjes over een build van 03-09 die je niet meer uploadt. De reparatie
scheidde "wat een test bewaakt" van "wat op een toestel bewezen moet zijn" —
en in de eerste categorie belandde meteen een regel die geen test had. De vorm
van de fout overleefde de reparatie van de fout.

`test-schilgrenzen.js` dekt beide claims nu wel: de betaallink in de schil (met
als tegenproef dat hij in de browser juist wél doorkomt, anders meet de toets
niets) en een scan over `index.html`, `privacy.html`, `verwijderen.html` en alle
`pidlane-*.js` op verwijzingen naar een APK. `worker.js` valt er bewust buiten:
die mag `/download/pidlane.apk` blijven serveren voor wie naast Play om
installeert — de grens is dat de app er niet naartoe wijst.

---

### De mutatietabel is bash, en bash leest backticks — 10-09-2026 (#180, opgelost)

`plmutate.sh` bewaart zijn tabel als bash-array met dubbele aanhalingstekens.
Daarin voert een backtick een commando uit. Regel 253 droeg `` `Klaar` `` zonder
ontsnapping, dus draaide bash dat bij het inlezen van de array: een
`command not found` op stderr die in een groene run wegvalt, en een
omschrijving waaruit stilletjes twee woorden verdwenen waren.

**De onschuldige variant, en dat is niet de reden dat het gerepareerd is.** Zit
zo'n backtick in het zóekanker — een template literal uit een `.js`, of ` ``` `
uit een `.md` — dan wordt dat anker door de substitutie korter en schuiven de
`@@`-velden op. Bij de twee nieuwe mutaties op `PLAY-INZENDING.md` van vandaag
gebeurde precies dat: plmutate meldde *"test-playteksten.js bestaat niet"*
terwijl dat bestand er gewoon stond, want het vierde veld was inmiddels de
omschrijving. Exit 1 met een reden die nergens klopt, in een bestand dat
niemand als code leest.

**Waarom de tegenproef in dit ene geval niet in `plmutate.sh` staat.**
`plmutate.sh` schrijft in het bestand dat op dat moment zelf draait, en bash
leest een script per stuk op byte-positie: een mutatie die de lengte verandert
laat de rest van het script op een verschoven punt verder lezen. De controles
zitten daarom als losse functies in `test-mutatietabel.js`, met deel 5 dat ze
op verzonnen regels loslaat. Die test draait mee in `plcheck.sh` — de tabel
wordt zo bij de commit gelezen als wat hij is: uitvoerbare shell.

### Elke login kostte precies één credit — 10-09-2026 (#179, opgelost)

Het saldo stond op 40 en direct na het inloggen op 39. Elke keer 1, ook zonder
één analyse te draaien.

**De keten.** `finishLogin()` roept `testApiKey()` aan, en die deed een echte
`POST /v1/messages` naar de proxy om "🤖 AI-sleutel ✓" te kunnen tonen. De
Worker rekent daar af op écht verbruik — 8 tokens in, 3 uit voor "ping" → "yes"
— maar `tegoedTarief()` heeft een ondergrens: `min: Math.max(1, …)`. Het
antwoord is drie woorden lang; voor het minimumtarief maakt dat niets uit.
Inloggen zélf raakt het saldo dus niet, de controle erachter wel.

**Waarom het uitgerekend nu opviel.** Het reviewaccount `demo@pidlane.nl`
krijgt tegoed mee voor de Play-review, en **een reviewer logt vaker in dan hij
analyseert**. Dat is precies het saldo dat op zijn moment niet leeg mag zijn.

**Dit is de tweede keer dat deze functie geld kostte.** Op 31-07-2026
verdwenen er tokens zonder analyses; de oorzaak was dezelfde functie, die toen
bij élke app-start vuurde (#83, §8). Die ronde leverde het kasboek op en
verplaatste de call naar de login — en daarmee was hij niet weg maar
goedkoper. De reparatie van vandaag haalt de AI-call zelf weg in plaats van hem
minder vaak te doen: `/v1/ping` loopt door dezelfde drie poorten (sessie, rol,
sleutel) en raakt het model niet aan. Dat was richting 2 van de drie in het
issue; richting 1 (de uitkomst onthouden in `localStorage`) was de goedkopere
tussenstap en is overgeslagen, omdat hij de kosten spreidt in plaats van
wegneemt.

**De conclusie in §8 was fout, en dat is de duurdere helft van dit kopje.**
Daar stond sinds 03-09-2026: *"`testApiKey()` draait daarom niet meer voor
klantaccounts."* Er stond geen enkele rolcontrole omheen — niet in
`pidlane-auth.js`, nergens. `git log -S` laat zien dat die zin bij een grote
documentatieronde is geschreven en nooit bij een codewijziging hoorde. Het is
dezelfde vorm als het kasboek dat in §8 in de tegenwoordige tijd beschreven
stond terwijl `tegoedLog` niet bestond: **een geruststellende zin over geld,
die niemand nameet.** De zin is nu herzien vastgelegd en niet weggepoetst.

**Wat het onherhaalbaar maakt.** `test-inlogkosten.js` laat één login door de
echte keten lopen — de echte `testApiKey()`, de echte router, de echte
`handlePing` — en kijkt daarna naar het saldo. Dat bewijst op zichzelf niets,
dus staat de tegenproef er in dezelfde opzet naast: dezelfde drie woorden via
`/v1/messages`, en dan staat er 39. Zonder die tweede helft meet deel 6 alleen
dat er niets gemeten is. Deel 4 zet de statuscodes van `handlePing` en
`handleMessages` naast elkaar voor vier weigeringen: een ping die groen meldt
waar de echte analyse 401 of 403 geeft, is een chip die liegt. Vijf mutaties in
`plmutate.sh` houden het scherp, en de eerste daarvan is precies de code zoals
hij vanmorgen nog in de app stond.

**Wat de ping bewust níét toetst, is het saldo.** Dat kost een Airtable-lezing
per login terwijl `/klant/mij` die na het inloggen toch al doet, en het tegoed
heeft zijn eigen chip. Een klant met 0 credits ziet dus een groene AI-chip en
loopt bij de eerste analyse tegen 402 aan. Dat is de bestaande verdeling —
sleutelchip zegt iets over de sleutel, tokenchip over het tegoed — en geen
nieuwe onduidelijkheid.

### §14 was 03-09 geschreven en nooit meer nagelezen — 10-09-2026 (#177)

Dezelfde vorm als #174, één kopje verderop. §16 stond vol vinkjes van build
#423; §14 was op diezelfde dag geschreven en sindsdien niet meer aangeraakt,
terwijl er negen builds bij kwamen en de meetketen en de begeleide run
verbouwd zijn.

**De tekst bleek te kloppen, en dat is niet hetzelfde als in orde.** De drie
functies die §14 bij naam noemt bestaan als eigen module (`pidlane-monitor.js`,
`pidlane-koopcheck.js`, `pidlane-remote.js`), en de demobelofte op de laatste
regel wordt woordelijk bewaakt door `test-demo-toegang.js`. Maar niets in het
document zei dat, en niets zou het gezegd hebben als het níét meer klopte. Er
staat nu bij tegen welke build hij is nagelezen — dezelfde reparatie die §16
kreeg.

**Wat er wél stuk was, is de koppeling met §3.** De release notes zijn een
ingedikte volledige beschrijving, met de hand. Twee velden die hetzelfde
beloven en allebei door een reviewer gelezen worden — dat is de vorm die dit
hoofdstuk twee keer eerder de kop kostte. `test-playteksten.js` vergelijkt ze
nu, één kant op: elke functie die §14 belooft moet in §3 opgesomd staan.
Andersom niet, want §3 mag 4000 tekens en noemt meer.

**De eerste versie van die vergelijking deugde niet, en `plmutate.sh` liet dat
binnen één run zien.** Hij hield een lijstje functienamen bij dat ik zelf had
opgeschreven, en toetste daarmee mijn woordenschat in plaats van het document:
een functie die niet op dat lijstje stond glipte er per definitie doorheen. De
mutatie die dat had moeten aantonen ontsnapte bovendien om een tweede reden —
ik had er "kenteken" in gezet, en dat stáát in §3. Twee fouten in één regel,
allebei van de soort waar de tegenproef voor bestaat. De lijst komt nu uit §3
zelf: dat veld somt zijn functies op als `• Naam — uitleg`, en §14 noemt ze in
één `Met A, B en C.`-zin. Verdwijnt een van die twee vormen, dan stopt de toets
met een FOUT in plaats van met een lege lijst stilletjes door te gaan.

Twee mutaties houden het scherp, in allebei de richtingen: §14 belooft een
functie die §3 niet opsomt, en §3 hernoemt een functie terwijl §14 de oude naam
blijft beloven. Die tweede is de stillere — je verbetert de beschrijving en
raakt het veld ernaast niet aan.

**En er kwam een echte bevinding uit die vergelijking (#177).** §1, §2 en §14
hebben een en-US-blok, §3 niet. Zet je Engels aan in de Console, dan krijgt een
reviewer een Engelse titel en Engelse release notes met een Nederlandse
volledige beschrijving eronder — uitgerekend het veld waar de
"minimum functionality"-toets op leunt. Niet in dezelfde PR opgelost: het is een
besluit over de inzending (Engels erbij, of Engels eruit), geen reparatie.
Daarom vergeleek de test voorlopig alleen het Nederlandse blok.

**Besluit 10-09-2026: de inzending is nl-NL only (#177, opgelost).** De en-US-
blokken van §2 en §14 zijn weg, §3 wordt niet vertaald. §1 had er nooit een —
de titel is in beide talen dezelfde, en dat is precies waarom de telling in het
issue daar geen tweede blok vond. De keuze is de goedkoopste kant van iets wat
toch al vaststond: §15 zet Countries op Nederland omdat de RDW-kentekenfunctie
regiogebonden is, dus een Engelse etalage bedient niemand die de app kan
gebruiken.

**Wat de test nu bewaakt is niet "één taal" maar "even veel talen".** De
verleiding was om te toetsen dat elk veld precies één blok heeft. Dat zou
kloppen tot de dag dat er wél vertaald wordt — en dan wordt zo'n test
weggehaald in plaats van bijgewerkt, want hij staat het werk in de weg. Deel 7
van `test-playteksten.js` telt daarom de blokken van §1, §2, §3 en §14 en eist
dat ze gelijk zijn. Bij één taal is dat 1-1-1-1, bij twee talen 2-2-2-2, en de
scheefstand die #177 wás (2-2-1-2) valt in beide werelden af. Twee mutaties
houden het scherp, één per richting: een tweede taal terug in §2 zonder §3, en
§3 als enige vertaald.

De regel zelf staat nu bovenaan `PLAY-INZENDING.md` en niet alleen hier: dat is
het document dat iemand openslaat als hij in de Console een taal aanzet.

### Zes van de zeven inhaalmerges waren met de hand, en niemand had daar iets te kiezen — 10-09-2026

Er stonden deze week telkens twee PR's tegelijk open, en telkens moest de
tweede na de eerste merge met de hand worden bijgetrokken. Dat voelde als pech
tot het geteld werd.

**Gemeten over de laatste 40 samenvoegingen op `main`.** Zeven daarvan zijn
geen PR maar een reparatie: `Merge branch 'main' into <tak>`. Zes van die zeven
hadden `PIDLANE.md` in het conflict, drie `CHANGELOG.md`, drie `plmutate.sh`.
Over de laatste twintig PR's raakte `PIDLANE.md` er negentien en `CHANGELOG.md`
veertien.

**De oorzaak is de vorm, niet de slordigheid.** Elke PR zet bovenaan §11 en
bovenaan de changelog een nieuw blok. Twee takken die tegelijk openstaan
botsen dus per definitie — op dezelfde plek, met altijd dezelfde oplossing:
allebei houden, nieuwste boven. Dat is geen besluit. Het was alleen een
handeling die er telkens tussen zat, en die hier duur is: elke reparatie kost
een ronde die niet over de app gaat.

**Wat er nu staat.** Een `.gitattributes` zet `CHANGELOG.md` en `PIDLANE.md` op
`merge=union` — de ingebouwde driver van git die bij een botsing beide kanten
bewaart in plaats van te stoppen. In een proef met twee takken die allebei
bovenaan invoegen komt het resultaat er compleet uit, zonder markeringen, met
de eigen tak boven de binnengehaalde.

**Waarom `plmutate.sh` er níét bij staat, terwijl hij drie keer in het conflict
zat.** Union verliest nooit tekst, maar kan tekst *verdubbelen*: raken twee
takken dezelfde regel, dan staan beide regels in het resultaat. In proza is dat
zichtbaar bij de eerste blik op de diff. In een script is het een stille breuk,
en dat is precies de klasse fout die hier maanden blijft staan (§19). De grens
loopt dus langs proza en code, niet langs "hoe vaak botst het".

**`test-gitattributes.js` bewaakt die grens**, en doet dat in drie lagen:
`git check-attr` vraagt aan git zélf of de twee documenten onder union vallen —
niet met een eigen naspelling van zijn patroonregels, zodat een ander maar
geldig patroon (`*.md`) hier terecht groen blijft. Daarnaast wordt elk
union-patroon nagelopen op codebestanden. En tot slot draait er een echte merge
in een wegwerprepo. Die laatste laag draagt zijn eigen tegenproef mee: een
`controle.js` met exact dezelfde invoeging **moet** botsen. Zonder dat punt zou
de proef ook groen staan als git de twee invoegingen om een heel andere reden
had kunnen samenvoegen, en dan meet hij niets. Twee mutaties in `plmutate.sh`
houden het scherp: union weghalen bij `PIDLANE.md`, en union uitbreiden naar
`*.js`.

**Nagemeten tegen een tak die op dat moment openstond.** PR #173 en deze tak,
in beide richtingen samengevoegd: vanuit de tak die `.gitattributes` heeft botst
alleen `plmutate.sh`, vanuit de tak die het niet heeft botst `PIDLANE.md` er
nog bij. Git leest de attributen namelijk uit de werkmap waarin hij samenvoegt,
niet uit wat er binnenkomt. Een tak van vóór vandaag botst dus nog één keer op
§11 — die ene merge haalt het bestand binnen — en daarna niet meer. Dat is de
hele overgangskost, en hij is eenmalig per tak.

**Wat dit niet oplost.** Botst een tak op `pidlane-testrun.js` of op
`plmutate.sh`, dan is dat nog steeds handwerk — terecht. En union is geen reden
om drie PR's tegelijk open te zetten: de werkregel in `CLAUDE.md` blijft dat een
nieuwe tak van de *huidige* `main` wordt gesneden en dat een tak waarvan de PR
al samengevoegd is niet hergebruikt wordt.

### De afvinklijst voor de Play Store vinkte een build af die je niet uploadt — 10-09-2026 (#174)

`PLAY-INZENDING.md` §16 stond vol gezette vinkjes. Ze waren allemaal waar — op
**build #423 van 03-09-2026**. Sindsdien staat de teller op build #432 en is er
fors verbouwd: laag 2 en 3 uit de meetketen weg, de begeleide run herbouwd tot
twee rondes, de ritwaarnemer uitgebreid.

**Een vinkje dat over een andere build gaat is erger dan geen vinkje**, want het
stelt je gerust over iets wat niet nagekeken is. Twee regels laten zien wat dat
concreet betekende: *"Foutpagina op een toestel bewezen op 03-09 om 20:16"* en
*"Demo één keer helemaal doorlopen op een schoon toestel"*. Dat tweede punt gaat
over het scherm dat een reviewer als eerste opent, en dat scherm is sindsdien
verbouwd.

**De lijst staat nu in drie delen, en dat onderscheid is de hele reparatie.**
16a is wat een test bewaakt — met de testnaam erbij, want die punten blijven
vanzelf waar en hoeven nooit opnieuw. 16b is wat een mens op een toestel moet
zien, met het **buildnummer** erbij in plaats van een kaal hokje: staat daar een
ouder nummer dan de build die je uploadt, dan is dat punt zichtbaar niet
nagekeken. 16c is wat buiten de repo ligt.

Elf punten bleken in 16a te horen. Die waren dus al die tijd dubbel geborgd —
door een test én door een handmatig hokje — terwijl de zes punten die alleen op
oplettendheid draaiden er precies zo uitzagen. Dat is dezelfde vorm als de
onderrandproef hierboven: een geruststelling die niemand meer naleest.

**En er lag een gat dat niets bewaakte.** §7 vraagt om een reviewaccount met
tegoed erop, en deze repository is **publiek**. De sleutelscan in CI zoekt naar
API-sleutels en tokens, niet naar een wachtwoord in lopende tekst — een
wachtwoord in dit document zou er ongehinderd in zijn gegaan en binnen een
minuut wereldwijd leesbaar zijn geweest. Het document waarschuwde er zelf voor,
maar een waarschuwing draait op oplettendheid. `test-playteksten.js` bewaakt het
nu, met een tegenproef op een echt wachtwoordpatroon en een mutatie eronder.

Twee documenten die hetzelfde beweerden liepen ook uit de pas: §4 zei dat de
feature graphic *"nog gemaakt moet worden"* terwijl §16 hem afgevinkt had. De
stand staat nu op één plek.

### De onderrand-proef vroeg of het paste, niet of je erbij kon — 10-09-2026 (#172)

Boven deze blok-5-proef stond sinds 01-09 met zoveel woorden dat het onbeslist
was *"of de melding klopt of de meting"*, en dat een oog dat moest beslissen.
Dat oog heeft gesproken: in de toestelronde van 10-09 beoordeelde de bestuurder
de onderrand met **"Alles vrij — er valt niets weg"**, terwijl de proef in
dezelfde sessie twee keer FOUT meldde (41px en 46px). Het was de enige harde
FOUT in beide verslagen, en hij stond er al een handvol ritten.

**De melding klopte niet — de meting stelde de verkeerde vraag.** De regel was:

```js
if (app.getBoundingClientRect().bottom > window.innerHeight - sab + 1) → FOUT
```

Dat `#appGrid` langer is dan het scherm is op ≤760px **met opzet** zo: `.app`
krijgt daar `height:auto` en de pagina scrollt. De proef mat of het element
binnen de vouw paste; wat een mens hindert is of hij bij de onderste regel kan.
Op een pagina die scrollt vallen die twee nooit samen — en dan is de melding
altijd waar en nooit iets waard.

**Wat het onderscheid maakt is de scrollruimte.** Kun je nog `rest` pixels
omlaag, dan komt de onderrand `rest` omhoog. Wat dán nog achter de balk staat,
staat er vast, en dát is #58. `plOnderrandOordeel(onder, grens, scrollRest)`
draagt die regel; de DOM-kant (welke maten) blijft in de proef.

**De twee helften zijn apart getoetst, en dat is hier het punt.** De regel staat
in `test-schermranden.js` met de echte getallen van de rit (830 tegen 784) en
een tegenproef: met en zonder scrollruimte móét het oordeel verschillen, anders
weegt de scrollruimte niet mee. De meetkant is in `bproef-schermranden.js`
getoetst, want "welke bak scrollt hier eigenlijk" is een DOM-vraag die node niet
kan beantwoorden — een `_plScrollRestOnder()` die stilletjes 0 teruggeeft laat
elke scrollende pagina weer rood staan. Op het korte scherm forceert die proef
de situatie met 600px vulling: 892px werkscherm, balk op 592px, 300px
scrollruimte → bereikbaar; scrollen uitgezet → wél een bevinding.

**De les.** Deze proef heeft maandenlang eerlijk in zijn eigen commentaar gezet
dat hij onbeslist was, en is intussen elke rit afgegaan. Een FOUT met een
kanttekening blijft een FOUT in het verslag, en na een paar ritten leest niemand
de kanttekening meer. De vraag "meet dit wat de gebruiker hindert" is goedkoper
vooraf dan een openstaande melding die je elke rit opnieuw wegdenkt.

### Vier lezers van hetzelfde gat, en een gat dat de testrun zelf maakte — 10-09-2026 (#170)

De eerste twee ritten met de oogstpoort (#166) en het meetgat (#133) erin.
**Allebei die dingen werkten meteen**, en dat staat hier omdat het de eerste
keer is dat ze in een auto gedraaid hebben: de rijstap sloot na **2 minuten**
(`gereden tot 31 km/u; MAP 19–81 kPa; alle 9 meet-PIDs twee keer ververst`) in
plaats van tien af te dwingen, en blok 14 scheidde de twee oorzaken —
89 s loopgat → *"dat is #18 en niet de bus"*, 35 s meetgat bij de adaptertrek.
Ook de z-index-fix hield: `3 van de 3 vragen beantwoord … de promptregel draagt
4 regel(s) mee`, waarmee #64 voor het eerst echt beantwoord is.

De vier bevindingen eronder delen één vorm: **een gat dat door de verkeerde
lezer wordt uitgelegd.**

**1. De adapterstap las alleen het loopgat.** Stap 7 van de meetrit meldde *"de
adapter is losgetrokken maar PLRit ziet geen gat"* terwijl blok 14 in dezelfde
run een meetgat van 35 s meldde over dezelfde trek. Bij #133 zijn blok 14, de
#133-proef en de #75-proef omgezet — juist de stap die #133 moet toetsen bleef
achter, de vierde lezer van die teller. Het verslag boekte #133 daarna als
`AANGERAAKT MAAR NIET BINNEN` terwijl de meting geslaagd was.

**2. De #19-proef hield een lat vast die niemand meer haalt.** Hij eiste tien
minuten én vier aanvragers. De meetrit viel af op *"maar 7 min gereden van de
tien"*, de toestelronde op *"maar 3 van de 4 aanvragers aan"* — twee rondes,
twee verschillende halve eisen, en geen van beide kan hem nog halen sinds de
rijstap op de oogst sluit. Een proef die altijd LET OP staat wordt genegeerd.
De omstandigheden staan er nu als context bij in plaats van als drempel.

**3. Meetgaten kregen geen duiding, loopgaten wel.** Er stond `Meetgaten: 15 s,
35 s, 75 s` zonder te zien welke de adapter was. Dat is niet cosmetisch: bij een
**afgeknepen** achtergrond (gemeten: 146 s weg, waarvan 60 s doorgelopen en 86 s
stil) blijft de lus tikken zonder loopgat te boeken, maar staat de data stil —
er opent dan een meetgat, en de regel eronder wees dat toe aan "de adapter of de
bus". Precies de verwisseling die het meetgat moest wegnemen, één laag hoger
teruggekomen. De kanten betekenen bij een meetgat het omgekeerde van bij een
loopgat: binnen de achtergrond is het de afknijping, erbuiten pas de bus. De
overlapregel staat nu op één plek, de twee duidingen erboven.

**4. De testrun fabriceerde zijn eigen loopgat.** Nagemeten met de echte
`PLRit`, een run van 70 s waarin de meetlus wordt overgeslagen: één loopgat van
75 s. De `_trBezig`- en `demoMode`-guards returnden vóór `laatstT = nu`, dus zag
de eerstvolgende tik na de run een gat ter grootte van die hele run. In het
verslag van 19:17 stond daardoor *"de lus lag daar stil terwijl de app in beeld
stond … kijk naar de adapter, de bus of een vastgelopen sweep"* — een jacht op
iets wat de guard van de testrun zelf veroorzaakte. `laatstLoop` houdt nu bij
wanneer de lus voor het laatst LIEP; `laatstT` blijft de laatste tik waarin er
werkelijk bemonsterd is, want dat is de klok waar het meetgat zijn einde aan
ontleent.

**Wat bewust NIET is meegenomen.** Bij een verbroken verbinding loopt de lus
óók door, dus strikt genomen is dat evenmin een loopgat. Maar een onderbreking
van tien minuten zou dan alleen nog als "1 herverbinding" zichtbaar zijn, en dat
is minder dan er nu staat. Dat vraagt een derde soort gat en een eigen meting;
het staat als open punt in #170.

**Twee dingen die het toetsen zelf opleverde.** De broncontrole op de
`_trBezig`-guard toetste de *spelling* (`if (... _trBezig) return`) in plaats
van de belofte, en viel om toen die guard er een deelgenoot bij kreeg. En
`test-achtergrondproef.js` pinde `/stap 7/` vast; toen de achtergrondstap bij
#166 naar stap 6 schoof, hield die toets de foute verwijzing overeind in plaats
van hem te vangen. Een toets die een nummer vastlegt in plaats van een
verwijzing, bewaakt de rot.

### De browserproef mat drie keer de animatie in plaats van de marge — 10-09-2026 (#168)

PR #165 kreeg een rode browserproef op een scherm dat die PR niet aanraakt:
`PID-recorder: 22px onder knop`, vier keer. Dezelfde commit werd in de run
ernáást groen, en op het ontwikkeltoestel drie keer achter elkaar met 62px.

**Het verschil is beide keren exact 40px** — 62 → 22 en 74 → 34. Dat getal
stond al in de kop van `bproef-schermranden.js`: `.ai-sheet` draagt
`animation: sheetUp .25s`, en het vel moest nog 40px omhoog. Het scenario stond
er ook al, van 09-09, mét hetzelfde getal 22. Dit was dus de derde ronde van
dezelfde film.

**Waarom de reparatie van 09-09 niet genoeg was.** `wachtTotStil()` meet tot
twee metingen achter elkaar hetzelfde zeggen. Dat lijkt op "het staat stil",
maar het is een gok op frames, en die verliest op twee manieren: twee monsters
vóórdat de animatie zijn eerste frame kreeg zijn gelijk (je meet de beginstand),
en hapert de runner tussen twee monsters dan zijn ze óók gelijk (je meet het
midden). Beide keren staat er een getal dat niets met de marge te maken heeft.

De browser weet zelf wanneer een animatie klaar is, en dat is geen gok maar een
belofte: `getAnimations()` geeft ze en elke animatie heeft een `finished`.
`wachtAnimatiesKlaar()` wacht die af; `wachtTotStil()` blijft daarna staan voor
wat er ná de animatie nog verschuift, maar begint pas als het vel stilstaat.

**De tegenproef is deterministisch geworden, en dat is de winst.** Blok 3 meet
de PID-recorder twee keer — meteen en na het wachten — en meldt *"tijdens de
animatie 22px, uitgeschoven 62px"*. Precies het getal uit de rode CI-run. De
fout is daarmee niet meer "soms" maar op commando na te maken, en een wachtregel
die stilletjes niets meer doet laat die controle omvallen.

**De les is niet de fix maar de vorm.** Twee keer is hier een tijdsgok gebruikt
waar de browser een gebeurtenis had: eerst 400 ms, toen "twee gelijke metingen".
Allebei haalden ze het meestal, en dat is precies wat een flake is. Wachten op
wat je wilt weten is bijna altijd mogelijk; wachten op de klok is een gok die
in CI vroeg of laat verliest.

### Het loopgat was blind voor een adapter die zijn voeding verliest — 10-09-2026 (#133)

Gemeten op de rit van 10-09-2026, met de stekker er echt uit. Blok 14 meldde
`0 gat(en), 2 herverbinding(en)` over een onderbreking van 39 s, terwijl blok
5 in dezelfde rit al wist dat het mis was: `plMeetStabielVoorstel()` (#62) zag
28 van de 31 sensoren met een gat in `pidHist` en oordeelde "niet stabiel". De
twee metingen spraken elkaar tegen op precies het punt waar #133 om gaat.

**Waarom `PLRit.gaten()` niets zag.** Een BT-SPP-socket sterft niet als de
adapter zijn voeding verliest — de verzoeken lopen in een buffer en komen
terug als niets. `connected` bleef de hele 39 s `true`. `PLRit.tik()` telt een
gat alleen als de lus zelf een tik miste (`laatstT` niet bijgewerkt omdat
`!verbonden` de tik overslaat); hier bleef de lus gewoon om de 5 s tikken.
`PLRit.gaten()` meet dus niet "viel de data weg" maar "lag de lus zelf stil"
— eerlijk gedocumenteerd in het commentaar erboven, maar die tweede vraag had
nooit een eigen meting. Voor #18 (de achtergrondkwestie, Android die
WebView-timers bevriest) is dat precies de goede meting. Voor #133 was het de
verkeerde, en er stond niets naast.

**De reparatie: het meetgat naast het loopgat.** Geen nieuwe bron — `neem()`
in `PLRit` telt per PID al op wanneer een stempel niet verschuift (`gemist`).
Een tik waarin elke al bekende PID `gemist` oplevert (dus geen enkele
`gemeten`) is nu een meetgat. Opeenvolgende meetgat-tikken worden tot één
interval samengevoegd, exposed via `PLRit.meetgaten()`, met dezelfde
`{van, tot, s}`-vorm als `gaten()`. De eerste waarneming van een PID telt
bewust niet mee (die geeft nooit `gemeten` terug, zie `neem()`): anders zou de
openingstik van élke rit zichzelf als meetgat melden. `test-rit.js` speelt de
rit van 10-09 na door tijdens de "adapter los"-fase niets naar `pidVals` te
schrijven, en `plmutate.sh` bouwt beide foutmodi terug — de bekendeTik-guard
weg (valse meetgaten bij elke ritstart) en het sluiten van het interval weg
(een meetgat dat na herstel blijft doorgroeien).

**En de spiegelfout die er meteen in zat.** De eerste versie van deze meting
opende óók een meetgat bij een pure achtergrondbevriezing. Bij bevriezen staan
de pollus en de tiklus namelijk samen stil — dat is wat bevriezen ís — dus de
eerste tik terug boekt terecht een loopgat en leest daarna stempels die nog
van vóór de stilte zijn. Nagemeten: 90 s bevriezing gaf een loopgat van 90 s
**én** een meetgat van 5 s, en blok 14 wees daarmee tegelijk naar de
achtergrondkwestie en naar de bus. Precies de vorm van #77 (één herverbinding
te veel) en #103 (één te weinig): een signaal dat je bij de meting die #18 moet
beantwoorden de verkeerde kant op stuurt. De tik die zelf een loopgat boekt
oordeelt daarom niet meer over de data — hij opent geen meetgat en sluit er ook
geen. `test-rit.js` speelt die bevriezing na en `plmutate.sh` bouwt de fout
terug.

Blok 14 ("Liep de app door tijdens de rit?") meldt loopgat en meetgat nu
apart en zegt bij een herverbinding welke van de twee eraan voorafging: een
loopgat wijst naar de achtergrondkwestie, een meetgat naar de adapter of de
bus, en geen van beide betekent een socket die stierf en herstelde tussen
twee tikken. De blok-5-proef van #133 toetste eerst alleen `PLRit.gaten()`
tegen `plMeetStabielVoorstel()` en zou de rit van 10-09 zelf niet gevangen
hebben — 0 loopgaten, dus geen tegenspraak om op te reageren. Hij telt nu
`gaten().length + meetgaten().length` mee.

Er was nóg een lezer van dezelfde teller, en die is meegegaan: de #75-proef in
blok 5 meldde *"herverbinding(en) zonder enig gat in de meetlus … of de app is
heropgestart"* op basis van alleen het loopgat. Op de rit van 10-09 zou die
regel je dus naar een heropstart hebben gestuurd. Hij noemt loopgat en meetgat
nu apart, en "zonder allebei" is daar wat het is: een socket die stierf en
herstelde tussen twee tikken (#103).

**Wat dit niet oplost.** `plMeetStabielVoorstel()` werkte al vóór deze
wijziging en gaf de AI-analyse het juiste oordeel over de meetkwaliteit — dat
mechanisme leest rechtstreeks uit `pidHist`, los van `PLRit`. Dit issue ging
over het ritbeeld (blok 14) en de duiding eronder, de tweede lezer van
dezelfde onderbreking, niet over de eerste.

Aanvullend gemeten op 10-09-2026 (#164): een tweede, ongerelateerde bron van
dezelfde verwarring lag in laag 2 van de meetketen — een gefilterde meting
werd geboekt als NO DATA van de ECU, niet te onderscheiden van een dode bus.
Die laag is dezelfde dag weggehaald (zie hieronder); de bevinding hierboven
komt daar niet vandaan en blijft ongewijzigd staan.

### De begeleide run kostte ritminuten aan issues die dicht waren — 10-09-2026 (#166)

Geteld op 10-09: de begeleide run had vijftien stappen, en negen daarvan
noemden een issue als reden. **Zeven van die negen waren gesloten** — #19, #15,
#29, #68, #66, #79 en #58. Er werd nergens iets rood van, want de koppeling
tussen een stap en zijn issue stond in proza.

De duurste was de rijstap. Die eiste tien minuten (`minS: 600`) met als enige
onderbouwing: *"De opruimregel heeft vijf pogingen plus vijf herkansingen
nodig"* — dat is #29, gesloten op 02-09 mét `test-opruimmelding.js` als
tegenproef. Die tien minuten kochten dus niets meer, en ze stonden vóór álles
wat daarna nog moest.

**Waarom dit meer is dan opruimen.** De rit is de schaarse grondstof. Wat een
rit kost en niets oplevert, kost ook de stappen die er niet meer bij passen: op
08-09 stonden er zes issues te wachten op een rit, en werd er één ronde
gereden. Daar kwam bij dat elf van de vijftien stappen helemaal geen *rijdende*
auto nodig hadden — ze hadden de app nodig, of de app met de motor aan.

**Wat er nu staat.** Eén lijst, twee rondes. Elke stap draagt `nodig`
(`rijden`, `auto` of `toestel`), `ronde` en `issues` als data. De meetrit bevat
alleen wat een rijdende auto nodig heeft plus de voorbereiding die eraan
vastzit; de toestelronde draait stilstaand. Geen tweede lijst — twee filters op
dezelfde lijst, want een tweede lijst is precies wat `PIDLANE-WERK.md` en §11
eerder de kop kostte.

**De as die het onderscheid draagt, is bij het toetsen pas scherp geworden.**
Eerst stond er `nodig: 'rijden' | 'stilstaand'`, met de regel "iets stilstaands
mag in de rit als het een open issue dient". `plmutate.sh` liet zien dat die
regel niets afdwingt: de meetcontextvragen dienen #64, dus die mochten er onder
die regel gewoon in blijven staan — en dat is nu juist wat weg moest. Met drie
waarden klopt het wel. Het adaptergat (#133) heeft de **auto** nodig, want het
gat moet in déze meetreeks vallen; de meetcontextvragen hebben aan het
**toestel** genoeg. Een open issue is geen vrijbrief voor ritminuten.

**De optrekstap is weg.** Hij vroeg om een stevige acceleratie plus een druk op
een markeerknop, voor "de turbo-vraag en de sleepwijzer van #68". #68 is dicht,
en de turbovraag had die markering sowieso nooit nodig: blok 14 leidt hem af
uit de min/max die `PLRit` over de hele rit bijhoudt, niet uit een moment in
het log. Wat de stap wél deed — de bestuurder laten weten dát er onder
belasting gemeten moest worden — staat nu als punt in de oogstpoort.

**De rijstap sluit op de oogst en niet op de klok.** `_ritOogst()` noemt drie
dingen: is er gereden (snelheid bewezen, niet uit het geheugen), is er onder
belasting gemeten (spreiding op de MAP), en zijn de meet-PIDs uit de selectie
twee keer ververst. Tien minuten stapvoets in de file leverden minder op dan
drie minuten met wisselend gas, en de bestuurder kreeg in beide gevallen
hetzelfde antwoord. Een punt dat op deze auto niet te halen is — de MAP staat
niet in de selectie — blokkeert bewust niet, anders is de poort een muur.

**En een ladderfout die er los onder lag.** Het testrunscherm staat op
`z-index:9980`; de vensters die de begeleide run vanuit dat scherm opent staan
eronder — de meetcontextvragen op 9920, het logboek op 9975. Ze openden dus
achter het scherm waar de stap in staat. Zo mislukte de #64-proef op de rit van
10-09: de drie vragen wáren geopend, alleen onzichtbaar, en de stap meldde
daarna "het venster is niet beantwoord" — een bevinding over het issue, terwijl
het de ladder was. Het scherm zakt nu onder een venster zolang die stap loopt.
Voor stappen die je naar de app zélf sturen helpt dat niet (die zit onder álle
overlays) en daar blijft sluiten de goede zet; dat verschil staat als
`opent: 'venster'` of `opent: 'app'` in de stap.

**Wat hiervan nog onbewezen is.** De drempels van de oogstpoort — 15 km/u voor
"gereden", 10 kPa spreiding voor "onder belasting" — zijn gekozen en niet
gemeten. `test-begeleid.js` toetst dat de poort sluit en opent op de juiste
punten, maar niet of dat in een echte auto op het goede moment gebeurt. Sluit
hij te vroeg, dan levert de rit minder op dan hij kan; te laat, en de tien
minuten zijn terug onder een andere naam.

### Laag 2+3 stonden uit voor álle PIDs, een week lang zichtbaar — 09-09-2026 (#158)

> **HERZIEN OP 10-09-2026.** Wat hieronder staat over de sleutelvorm klopt en
> blijft staan. De conclusie die eruit getrokken werd — *dus moeten laag 2 en 3
> aan* — was fout, en de lagen zijn een dag later weer weggehaald. De meting die
> dat besliste staat in het kopje hierna. Deze tekst blijft ongewijzigd omdat de
> fout leerzamer is dan de correctie.


`FILTERED_PIDS` in `pidlane-datalog.js` droeg **suffixen** (`'05'`), terwijl
`validateAndSmooth()` twee regels verderop `FILTERED_PIDS.has(pid)` doet en de
meetketen de **volledige** pid doorgeeft (`'0105'`). Die opzoeking miste dus
altijd, en laag 2 (spike-filter) en laag 3 (smoothing) draaiden nergens.

Gemeten in blok 2 van de rit van 09-09: `validateAndSmooth("0105",200)` gaf
`200`. Tweehonderd graden koelwater kwam er ongefilterd doorheen — laag 1 vangt
alleen wat fysiek onmogelijk is, en 200 valt binnen −40…215.

**De reparatie gaat de andere kant op dan je zou gokken.** Niet `.slice(2)` in
`datalog.js` erbij, maar de tabel op volledige PIDs zetten. Reden: elke andere
tabel die diezelfde functie in dezelfde regels aanraakt — `PID_HARD_LIMITS`,
`pidVals`, `pidHist`, `getPidDef()` — is op de volledige pid gesleuteld.
`FILTERED_PIDS` was de enige uitzondering. Eén ding heeft één betekenis.

Er zat een tweede winst in die pas bij het schrijven opviel: een suffix is
dubbelzinnig over modes heen. `'05'` is zowel `0105` (live koelwater) als
`0205` (dezelfde waarde uit een freeze frame), en smoothing over een freeze
frame is zinloos — dat is één momentopname, geen reeks. Met de volledige pid
kan dat niet meer per ongeluk gebeuren.

`pidlane-fuel.js` compenseerde de suffixvorm met `traagSet.has(pid.slice(2))`
en werkte dus wél goed; die slice moest mee weg, anders zoekt hij `'05'` in een
lijst met `'0105'` en telt elke trage sensor ineens als dynamisch.

**Wat het inschakelen zichtbaar maakte, is het vermelden waard.** Twee bestaande
toetsen vielen om zodra laag 3 ging draaien, en allebei terecht:

- `test-parser.js` — *"koelwater precies op 215 mag door"* gaf 152,5. Dat is het
  gemiddelde van 90 en 215: laag 3 doet zijn werk. De toets meet nu op een verse
  reeks, zodat hij weer laag 1 meet in plaats van laag 3.
- `bproef-meetketen.js` — *"laag 1 laat 90 °C door"* gaf 91,5, want de 93 uit de
  parserproef erboven stond nog in `pidSmooth`. Dezelfde oorzaak, dezelfde fix.

Dat twee toetsen omvielen bij het aanzetten van een filter is het beste bewijs
dat het filter daarvoor niets deed.

**Hoe lang dit zichtbaar heeft gestaan, is de eigenlijke les.** De bevinding
stond sinds 02-09 in `test-parser.js` als LET OP, met de reden erbij dat hij
niet in diezelfde PR gerepareerd werd — één onderwerp per PR, en dat is een
goede regel. Ook blok 2 van de testrun meldde hem elke rit, en
`bproef-meetketen.js` schreef er zelfs bij: *"DIT IS VERANDERD: werk §11 en deze
proef bij"*. Drie plekken die het wisten, een week lang, en niemand die het
oppakte tot het als issue op de lijst kwam.

Een LET OP met een goede reden is geen bewaarplaats. Wat blijft staan hoort een
issue te zijn, want dat is de enige lijst die nagelopen wordt — dat staat al
bovenaan `CLAUDE.md` en dit is er de duurste illustratie van tot nu toe. Alle
drie de plekken zijn nu een toets die rood wordt in plaats van een melding die
je kunt lezen en laten staan.

### Laag 2 en 3 zijn weggehaald, en dit is waarom — 10-09-2026

Ze stonden één dag aan. Dit is wat er in die dag gemeten is, en waarom het
antwoord "weg" is en niet "beter afstellen".

**Eerst de basis, want die was ouder dan gedacht.** `FILTERED_PIDS` draagt
suffixen sinds `0135e85`, de **eerste commit in deze repo**. Laag 2 (spike-filter)
en laag 3 (middeling over twee monsters) hebben in de hele levensduur van deze
app nooit één keer gedraaid. Er is dus geen versie geweest die er beter van werd,
en geen klacht die eruit voortkwam.

**Wat het probleem eigenlijk was.** Niet "laag 2+3 staat uit". Wat er op 02-09
gevonden werd is dat `test-parser.js` beweerde de meetketen te dekken en dat niet
deed. Dat is een testprobleem. "Laag 2+3 draait nooit" was een *vondst van* dat
testprobleem, geen symptoom dat iemand ooit gezien had. Het onderscheid is niet
academisch: het bepaalt of je iets repareert of iets aanzet.

**Wat aanzetten opleverde, gemeten.**

| PID | bereik over de rit van 09-09 (10 min, 97 km/u) | laag 2 vuurt bij |
|---|---|---|
| Koelwater temp | 5 °C | sprong 89,3 of 26,8 van het gemiddelde |
| Inlaatlucht temp | 3 °C | 66,5 of 19,9 |
| Brandstoftrim lang B1 | 5,47 | 21,0 of 6,3 |
| **Accuspanning** | **2,76 V** | 2,8 of **0,8** |

Op zeven van de negen is laag 2 dus inert: de drempel ligt een orde van grootte
boven wat het signaal doet. De rit van 10-09 bevestigt het van de andere kant —
in vier minuten over 31 sensoren sloeg het filter **één keer** aan, en dat was de
testrun die er zelf 200 °C in duwde. Nul echte metingen geraakt.

Accuspanning is de uitzondering, en juist daar gaat het de verkeerde kant op: een
uitschieterdrempel van 0,8 V tegen een gemeten ritswing van 2,76 V. Daar vuurt
het filter wél, herhaaldelijk, zodra er gereden wordt — op precies de dips die je
in een diagnose-app wílt zien.

**En dan de gevolgketen die niemand had nagelopen.** `pidlane-plload.js`, de
hoofdmeetlus:

```js
const r = applyParsedBytes(pid, parsed[pid]);
if (r != null) { markPidData(pid); updPID(pid, r); checkStability(pid, r); … }
else markPidNoData(pid);
```

Een waarde die laag 2 weggooit wordt geboekt als **NO DATA van de ECU**. Er is
geen derde uitkomst. Gevolg: geen `_pidLastUpd`-stempel, dus PLRit telt `gemist`,
dus een gat in de reeks, dus `plMeetStabielVoorstel()` meldt dat de meting niet
stabiel was. En `markPidNoData()` voedt `_noDataStreak` en de kwaliteitsscore,
die via `pidOpruimen()` de sensor uit de selectie kan gooien.

**Een filter dat een echte meting weggooit is dus niet te onderscheiden van een
dode bus.** Dat is exact de verwarring waar #133 over gaat, en aanzetten bouwde
er een tweede bron voor.

**Laag 3 was niet inert.** Die verving elke opgeslagen waarde van die negen PIDs
door het gemiddelde van de laatste twee. Koelwater komt als hele graden van de
ECU (`A−40`), dus de app sloeg 89,5 op — een waarde die de sensor niet kán geven.
Op een signaal met 5 °C bereik over tien minuten viel er niets te ontruisen; wat
er wél veranderde is de meetgetrouwheid, en een krimpend bereik op precies de
PIDs die #66 al niet "bewegend" kan noemen.

**Wat blijft staan.** Laag 1 (harde fysieke limieten) en laag 1b (opvallend maar
echt: melden, onthouden, doorlaten) doen wél iets, en het goede. `FILTERED_PIDS`
blijft ook, maar heeft nog één lezer: `pidlane-fuel.js` gebruikt hem om trage van
dynamische sensoren te scheiden. Dat is een eerlijke tweede rol voor een lijst
die "welke signalen bewegen langzaam" betekent.

**De les zit niet in de uitkomst maar in de volgorde.** Drie kopjes hierboven,
op 02-09, stond het antwoord al opgeschreven:

> *"Laag 2 en 3 aanzetten is een gedragswijziging in de meetketen … Of de
> drempels (35 % sprong, 3,5σ, de 5-seconden bevestiging) na maanden uitstaan
> nog kloppen, is niet vanaf een bureau te zeggen. Dat verdient een eigen rit en
> een eigen PR."*

Die regel klopte. #158 deed het alsnog vanaf het bureau, op een syntactisch
argument — elke andere tabel is op de volledige pid gesleuteld, dus deze ook. Dat
is een goed argument voor consistentie en géén meting van wat er gebeurt als het
filter loopt. Elke merge hier is een deploy naar 100% van het verkeer.

Wat daarna volgde is de vorm om te herkennen: twee toetsen die omvielen, een
valse FOUT op de eerste rit, vervuilde reeksen in de testrun, en een PR om dat te
repareren. **Vier reparaties op een verandering die niemand gevraagd had.** Het
signaal dat je op het verkeerde niveau bezig bent, is dat elke fix een nieuwe
fix nodig heeft. Dan is de vraag niet "hoe repareer ik dit" maar "waarom doe ik
dit".

**Wat de toetsen nu bewaken.** Omgekeerd aan wat er stond: niet *wordt er
gefilterd* maar *komt de meting ongewijzigd door*. `test-parser.js` toetst dat
twee metingen op een traag signaal allebei onveranderd terugkomen — dat vangt een
teruggekeerde middeling, wat een null-of-niet-null-toets niet zou doen — en dat
een sensor met hele graden geen halve graad oplevert. Blok 5 doet hetzelfde op de
draaiende app, want juist een reeks die er al staat maakte de middeling zichtbaar.
`plmutate.sh` bouwt allebei de lagen terug als mutatie: dat is geen verzonnen
fout, die code stond er tot vandaag.

### De nieuwe proef sloeg op zijn eerste rit alarm, en hij had ongelijk — 09-09-2026 (#66)

De rit van 09-09 (Mazda CX-5, 10 minuten gereden, 97 km/u, alle vier de
aanvragers aan, busbelasting 93%) leverde precies wat de ronde ervan verwachtte:
131 proeven, één FOUT. Die ene FOUT was de proef die ik er de dag ervoor zelf in
had gezet.

```
FOUT De drempel voor "beweegt" scheidt beweging van stilstand
     drempel 2% van het bereik; 13 bewegen, 19 stil.
     Vlak onder de drempel: Motortoerental 108/160, …
     — de motor draait (652 rpm) maar het toerental telt niet als bewegend.
       Dan is niet de drempel verkeerd maar de reeks eronder (#66)
```

**De meting klopte; de gevolgtrekking niet.** Gemeten om 13:27, stationair op
652 rpm: het toerental had een bereik van 108 tegen een drempel van 160. Dat is
geen kapotte reeks maar een motor die stationair 108 toeren op en neer gaat. De
bestuurder antwoordde bij stap 9 van de begeleide run dan ook *"balken én lijnen
kloppen"* — mens en proef spraken elkaar tegen, en de mens had gelijk.

**De vorm is het punt, niet de fix.** De melding gaf een OORZAAK die nergens uit
bleek: *"dan is niet de drempel verkeerd maar de reeks eronder"*. Dat is
letterlijk dezelfde fout als #18 — de melding die beweerde wat hij niet gemeten
had — en die staat één kopje verderop in dit hoofdstuk beschreven. Ik heb hem
opnieuw gemaakt in een proef die er juist was om van opletten naar meten te gaan.

Wat de proef wél kon vaststellen: dát het toerental de drempel niet haalt. Wat
hij niet kon vaststellen: waaróm. Die twee zijn nu gescheiden:

- **bereik nul terwijl de motor draait** → FOUT. Dan staat de reeks werkelijk
  stil, en dat is een defect dat losstaat van de drempel.
- **bereik onder de drempel** → LET OP met het getal erbij. Dat is geen
  bevinding maar de meetwaarde waar #66 om vroeg.

**En daarmee heeft #66 zijn antwoord**, na twee weken wachten: bij stationair
toerental is 2% van het volle bereik (160 rpm op een schaal tot ~8000) te grof
om een trendlijn te geven, terwijl er 108 rpm échte beweging is. De vraag uit
het issue — te hoog of te laag — is daarmee een getal geworden in plaats van een
gevoel. Wat er níét uit volgt is welke drempel dan wél goed is; dat blijft een
ontwerpkeuze, nu met een gemeten ondergrens eronder.

**Losse waarneming over de rit zelf.** De bestuurder liep de *begeleide run* af
(13 stappen), niet de stappen uit `CAMPAGNE`. Daardoor is het
meetcontextvenster nooit beantwoord (#64 meldt dat zelf als LET OP, en dat ís
het gevraagde cijfer) en is de adapter niet bewust losgetrokken (#133 kwam op
"ok" zonder dat de proef ooit onder spanning stond). Twee lijsten met stappen
naast elkaar is dezelfde vorm waar dit hoofdstuk al twee keer aan ten onder
ging; de volgende ronde hoort te kiezen welke van de twee de rit stuurt.

**Die keuze is gemaakt, dezelfde dag: de begeleide run stuurt.** De twee
stappen zijn erin verhuisd (`meetcontext` en `adapterlos`), en `CAMPAGNE` zegt
dat nu ook met zoveel woorden in plaats van ze een tweede keer op te sommen. De
reden dat het die kant op gaat en niet andersom is bewijsbaar: de begeleide run
is degene die gevolgd wérd, en hij dwingt af wat `CAMPAGNE` alleen kon vragen —
elke stap doet wat de app zelf kan, laat zien wat er gebeurde, en overslaan kost
een reden die in het verslag komt.

Wat er bewust in `CAMPAGNE` blijft staan, is precies wat de run niet kan
afdwingen: de leesbaarheidsronde (#141, een oordeel met daglicht erbij) en de
A/B-proef van #64, want die kost twee betaalde analyses. De stap in de run toont
het venster los en toetst of een antwoord de promptregel haalt — dat is gratis;
of het antwoord het *rapport* verandert is een andere vraag en een andere prijs.

De volgorde binnen het staartje is niet vrij, en dat staat nu als eis in
`test-begeleid.js`: `meetcontext` vóór `adapterlos` (de vragen beantwoord je met
een verbinding die nog heel is), `slimweergave` vóór `adapterlos` (het
zelfgemaakte gat vervuilt precies de reeks waarop #66 beoordeeld is), en beide
vóór `meten` (anders leest blok 5 ze niet). Twee tegenproeven laten zien dat die
eisen rood kunnen worden.

### Zes issues wachtten op een rit, en de rit leverde herinneringen — 08-09-2026

Er stonden negen issues open en zes daarvan wachtten op iets dat alleen achter
het stuur gebeurt: #18, #64, #66, #132, #133 en #141. Sommige al twee weken.

**Wat ze deelden was niet het onderwerp maar de vórm.** In alle zes stond het
gevraagde als *"kijk of het klopt"*. Kijk of de trendlijn staat waar je er een
wilt. Kijk of het rapport het afslaan niet als storing meldt. Kijk of de
onderste regel leesbaar is.

Kijken is geen meten. Wat er van zo'n rit terugkomt is een herinnering, en die
is er bij de volgende ronde niet meer — en dan staat het issue er nóg een keer
met dezelfde zin in. Dat is precies waarom er per rit één ding tegelijk werd
nagekeken: elk ding kostte aandacht die niet vastgelegd werd.

**De ingreep is dat de rit zichzelf opschrijft.** Drie proeven in blok 5 leggen
nu vast wat tot nu toe van opletten afhing:

| proef | wat hij vastlegt | wanneer hij FOUT geeft |
|---|---|---|
| #66 | per sensor het gemeten bereik tegen de drempel, en apart de groep die er vlak onder zit | de motor draait maar het toerental telt niet als bewegend |
| #64 | welke meetcontextvragen beantwoord zijn en hoeveel regels dat de prompt oplevert | er is geantwoord en de promptregel is leeg |
| #133 | het voorstel "stabiele meting" naast het aantal gaten dat `PLRit` telt | de rit zag een gat en het voorstel zegt "ja, stabiel" |

**Alle drie hebben met opzet een echte faaltoestand.** Een blok dat alleen kán
rapporteren wordt een melder, en melders worden na twee ritten niet meer
gelezen — dat staat niet voor niets al in `CLAUDE.md` over altijd-rode tests, en
het geldt net zo hard voor altijd-groene. De faaltoestand is bij alle drie de
tegenspraak, niet het oordeel: de machine beslist niet of 2% de goede drempel
is (dat kan hij niet), maar wel dat een draaiende motor hoort te bewegen.

**En `CAMPAGNE` is één rit geworden in plaats van zes.** Zes momenten in één
rit, geordend op wat elkaar niet in de weg zit: eerst wat stilstaand kan
(leesbaarheid, meetcontext), dan wat rijdend moet (slimme weergave,
achtergrond, bulk-recorder), en de twee die de verbinding bewust stukmaken
helemaal aan het eind — want daarna is de meetreeks van die rit niet meer
schoon voor de stap ervoor. Die volgorde is het halve werk: in de oude opzet
kon stap 6 stap 3 ongeldig maken zonder dat iemand dat merkte.

Bewust buiten deze rit gehouden: de DID-sweep van de kaartmaker (1,9 uur, de
vorige twee ritten liepen hem grotendeels af, en F4A6 is gemeten en bestaat
niet) en de km-standmodule (#138), die een checklist wordt en geen diepere data
nodig heeft.

### Waar de AI-rekening werkelijk zit — gemeten 08-09-2026 (na #114)

Vervolg op #114. Toen bleek caching niet te kunnen; de vraag daarna was waar de
kosten dán zitten. Twee metingen, en de eerste keert het beeld om waar #114 op
gebouwd was.

**1. De invoer is zes keer kleiner dan aangenomen.** #114 rekende met *"een
realistische analyse van 8k invoer + 1,5k uitvoer"*. Nagemeten met de échte
`runQuickAI()` — 20 actieve sensoren, twee DTC's, `plFetch` vervangen om de
uitgaande body op te vangen:

| deel | tekens | aandeel |
|---|---:|---:|
| systeemprompt | 2049 | 43% |
| vaste opmaakinstructie in de user-prompt | 1481 | 31% |
| **werkelijke meetdata (sensoren + DTC's)** | **1239** | **26%** |
| totaal | 4769 | ~1289 tokens |

Geen 8k maar ~1,3k tokens. **Daarmee is de hele invoerkant ongeveer een tiende
van de rekening**, want de uitvoer staat op `maxTokens` 4000 × `uitvoerFactor`
0,55 ≈ 2200 tokens: 7,7 credits tegen 0,9 voor de invoer. De uitvoer is ~90%.

Dat zet #114 in verhouding: dat issue mikte op de systeemprompt, ~3,6% van een
analyse. Maar het zet óók de voor de hand liggende opvolger in verhouding — de
meetdata snoeien raakt 26% van 10%. **Wat de rekening bepaalt is de lengte van
het rapport, en dat is een productbesluit, geen technische ingreep.**

Bijvangst: van de user-prompt is 54% vaste opmaakinstructie en 46% data. De
grootste post in het "snoeien"-hoekje is dus niet de meetdata maar de
sjabloontekst — en die staat er met reden, want hij dwingt de rapportstructuur af.

**2. De hervraag-lus bij `max_tokens` stuurt de invoer opnieuw.** Kapt een
rapport af, dan doet `apiFetch()` tot twee vervolgcalls met "ga exact verder", en
elke call draagt de volledige invoer plus alles wat er al beantwoord is:

| | invoer totaal | factor |
|---|---:|---:|
| niet afgekapt | 26.780 tekens | 1,00× |
| 1× afgekapt | 59.234 | 2,21× |
| 2× afgekapt | 97.362 | 3,64× |

(gemeten met een prompt van 24.700 tekens, zodat de factor los van de promptmaat
te lezen is). Elke vervolgcall is een eigen `handleMessages` en dus een eigen
afboeking binnen het saldo-slot. Bij de werkelijke promptmaat hierboven is dat
in absolute zin bescheiden — ~2,3 credits per dubbel afgekapte analyse — juist
omdát de invoer klein is.

**En hier zit de val, want de voor de hand liggende fix is niet gratis.**
`max_tokens` verhogen lijkt kosteloos: een plafond kost niets zolang het niet
gehaald wordt, en er wordt op werkelijke uitvoer afgerekend. Maar deze app
koppelt dat plafond aan haar eigen kostenpreview: `ontleed()` schat de uitvoer
als `maxTokens × uitvoerFactor`, en dat getal voedt zowel het previewvenster als
de saldopoort die een analyse blokkeert bij onvoldoende tegoed. Van 4000 naar
16000 gaan verviervoudigt dus de geschatte kosten en kan klanten buitensluiten
voor een analyse die in werkelijkheid niets duurder is.

Twee dingen maken dat erger, en ze zijn allebei het opschrijven waard:

- **Afkappen leert de schatter precies het verkeerde.** `uf` wordt bijgesteld
  met `min(1, uitTok / maxTokens)`. Bij een afgekapt rapport ís `uitTok` gelijk
  aan `maxTokens`, dus elke afkapping duwt `uf` naar 1,0. Het te lage plafond
  leert de schatter dat de uitvoer altijd het plafond haalt.
- **De bijstelling bevriest.** Het gewicht is `min(0,25, 1/(n+2))`. Na honderd
  calls is dat ~0,01, dus een verhoogd plafond zou honderden analyses lang een
  te dure schatting geven voordat `uf` meezakt.

De volgorde die daaruit volgt: **eerst de schatting losmaken van het plafond**
(schatten op waargenomen uitvoer in plaats van op de bovengrens), en pas daarna
het plafond verhogen. Andersom zet je de saldopoort dicht voor klanten die niets
verkeerd doen.

**Die eerste stap is gebouwd (08-09-2026).** `_uitSchat()` in
`pidlane-credits.js` kalibreert nu op absolute waargenomen uitvoer in plaats van
op een fractie van het plafond, met drie bronnen in deze volgorde: het
gemiddelde voor dít plafond, anders het algemene gemiddelde afgetopt op het
plafond, anders — alleen bij een koude start zonder metingen — de oude vorm. Die
derde stap is er met opzet: de eerste analyse op een vers toestel raamt precies
zoals hij deed.

Twee ontwerpkeuzes die het waard zijn te onthouden:

- **Per plafond een eigen gemiddelde.** Eén gemiddelde over alles zou de
  hulpvragen (plafond 600–900) en de volle rapporten (4000) door elkaar halen:
  de een trekt de ander omhoog, de ander de een omlaag. De aftopping op het
  plafond doet de rest — een hulpcall kan nooit meer ramen dan hij mag uitvoeren.
- **Een bodem van 0,05 op het bijstelgewicht**, die `uf` niet heeft. Zonder
  bodem zakt `1/(n+2)` naar nul en volgt de raming een veranderde rapportlengte
  nooit meer. 0,05 is effectief een venster van ~20 metingen.

De sleutel `pl_credits_kalib` migreert vanzelf: een opslag met alleen
`{tpt, uf, n}` krijgt de nieuwe velden erbij en valt tot de eerste meting terug
op de oude vorm. Dat aanvullen is geen netheid — zonder die regel rekent
`_uitSchat()` `max * undefined` = `NaN`, en een `NaN`-vergelijking in
`preflight()` is altijd false, dus dan laat de saldopoort stilletjes álles door.
Daar staat een eigen toets op, en het is ook de vierde mutatie in `plmutate.sh`.

`test-uitvoerschatting.js` (19 toetsen) laadt de echte module en stuurt de
kalibratie aan via de publieke `PLCredits.boek()` — dezelfde weg als de app na
elke AI-call. De tegenproef zet de oude formule terug in de bron en eist dat de
raming dán wél viervoudigt. Blok 5 meet hetzelfde op het toestel, waar een écht
gegroeide kalibratie in localStorage staat; bij nul metingen meldt hij LET OP in
plaats van FOUT, want dan is meeschalen juist het goede gedrag.

**Wat hiermee nog niet opgelost is:** het plafond zelf staat nog op 4000. Dat
verhogen is stap twee en hoort een eigen ronde te krijgen, met de vraag erbij
hoe vaak rapporten werkelijk afkappen — te tellen in het kasboek, zoals
hieronder beschreven.

**Hoe vaak het gebeurt, weten we niet.** `PidLaneEvalLog.log()` begint met
`if(!s) return;` — buiten een actieve veldlabsessie wordt er niets vastgelegd,
en `vlDerive()` laat `part` en `stop` sowieso uit de afgeleide vallen. De
persistente bron is sinds #83 het kasboek: elke vervolgcall is een eigen
`handleMessages` en dus een eigen `TokenLog`-regel, dus meerdere `ai-call`-regels
van dezelfde klant binnen enkele seconden zijn een afgekapt rapport. Dat is de
plek om het te tellen zodra er productiedata staat.

### Promptcaching kan hier niet aan — gemeten 08-09-2026 (#114)

#114 vroeg om promptcaching aan te zetten: de systeemprompt en `AUTO_KENNIS`
gaan bij elke analyse opnieuw als verse invoer mee. Het issue zei er zelf bij:
**meten vóór bouwen**, en *"levert dat weinig op, dan is 'niet doen, met dat
getal erbij' ook een goede uitkomst."* Dat is het geworden.

**Hoe er gemeten is.** `plFetch` vervangen — het laagste punt, net als de
nep-adapter bij de browserproeven — zodat de échte promptopbouw in `apiFetch()`
onveranderd draait en alleen het uitgaande `body.system` wordt opgevangen. Daarna
drie keer een analyse: zelfde auto met andere live toestand, en een andere auto.

| meting | tekens | tokens (÷ 3,7) |
|---|---:|---:|
| systeemprompt totaal | 2054 | ~555 |
| gedeelde prefix — zelfde auto, andere toestand | 1339 | ~362 |
| gedeelde prefix — andere auto | 142 | ~38 |

De 3,7 is niet gegokt: dat is `CFG.tekensPerToken` uit `pidlane-credits.js`, en
die wordt na elke call op de echte `usage` bijgeijkt.

**Het getal dat de vraag beslist: de minimum cachebare prefix van
`claude-sonnet-5` is 1024 tokens.** Onder die grens cachet de API niet — zonder
foutmelding, met `cache_creation_input_tokens: 0`. De hele systeemprompt is
~555 tokens en zit daar 46% onder. De stabiele prefix die er werkelijk is, zit
er 65% onder.

**Dat maakt dit geen "nog niet doen" maar een "kan niet".** Zelfs de perfecte
verbouwing — alles wat varieert naar achteren, zodat 100% van de systeemprompt
één vaste prefix wordt — komt uit op ~555 tokens en cachet nog steeds niet. Er
valt hier geen herordening te bedenken die de drempel haalt, want de drempel
ligt boven het totaal.

**Waarom de prefix sowieso vroeg breekt, voor wie het later toch nameet.** De
vaste en variabele stukken staan door elkaar, niet na elkaar:

1. vaste aanhef (`Jij bent PidLane AI-Monteur…`)
2. **`VOERTUIG: …` plus de dossierregel** — per auto
3. `pidlaneBasisRegels()` — de HARDE REGELS zijn vast, maar de brandstofregel
   erbovenop hangt aan het voertuig
4. regel 6 — vast
5. **regel 7 met `GEMETEN TOESTAND NU: …`** — toerental en snelheid, dus per call

Daar komen `_situatiePromptLine()`, het rapportenblok en
`plMeetcontextPromptLine()` achteraan, alle drie variabel. Vandaar 142 tekens
tussen twee auto's: dat is de aanhef plus het begin van "VOERTUIG: ".

**Eén aanname uit het issue klopte niet.** *"systeemprompt + AUTO_KENNIS gaan
bij elke analyse opnieuw mee."* De bank telt 14 merken en 3679 tekens, maar
`autoKennisVoorMerk()` geeft alleen de gevonden merkregel terug, gefilterd op
brandstof. Er gaat dus nooit meer dan één merk mee — en dat stuk is per
definitie voertuigafhankelijk, dus het zou ook na een verbouwing buiten elke
gedeelde prefix vallen.

**En de bovengrens van de winst, voor het geval het wél had gecachet.** Een
cache-read kost 0,1× de gewone invoerprijs, dus caching van de volle 555 tokens
scheelt ~500 tokens invoer per analyse. Tegen het tarief uit het issue (0,7
credits per 1k invoer) is dat ~0,35 credit, op een realistische analyse van 8k
invoer plus 1,5k uitvoer (~10,9 credits): **ruim 3%.** Dat is de theoretische
bovengrens van iets dat niet kan.

**De sterkste tegenwerping, en waarom die het ook niet haalt.** Nagemeten op
08-09: van de 2054 tekens systeemprompt is ~1775 identiek tussen twee
verschillende auto's (~480 tokens) — er varieert veel minder dan de karige
gedeelde prefix van 142 tekens doet vermoeden; het vaste zit alleen dóór het
variabele heen. Daar komt bij dat de user-prompt nog 1481 tekens vaste
opmaakinstructie draagt (~400 tokens), die je naar de systeemprompt zou kunnen
verhuizen. De maximale herordening is dus: alles wat vast is naar voren, de
opmaakinstructie erbij, al het variabele erachter. Dat komt uit op **~880
tokens** — nog altijd 14% onder de 1024 van `claude-sonnet-5`. Het scheelt niet
veel, en het haalt het niet.

**Wanneer dit herzien moet worden — en dat is het enige wat hier open blijft.**
De uitkomst hangt aan het model, niet aan onze code: `claude-opus-5` heeft een
minimum van 512 tokens. Een volledig herordende systeemprompt van ~555 tokens
zou daar nét overheen komen, met 8% speling en alleen als de prefix 100% vast
is — wat hij niet kan zijn, want de voertuigregel hoort erin. Stapt de app ooit
over op een model met een lagere drempel én groeit de vaste tekst, dan is dit
opnieuw een vraag. Nu niet.

### De wachter mat de knop en niet de tekst — 08-09-2026 (#144)

Een schermfoto: de onderkant van het Run-venster valt weg achter de drie
Android-knoppen. Met de opmerking erbij dat er al meerdere vensters voor
gerepareerd zijn, en of er niet een test van te maken viel.

**Die test bestond al, en dit venster stond er al in.** `bproef-schermranden.js`
bewaakt sinds #71 dat elk onderste vel boven de navigatiebalk blijft, en de
ronde van #134/#135 had het Run-venster expliciet nagelopen. De conclusie die
daar is opgeschreven:

> De vier volschermvensters uit koopcheck.js en het Run-venster hadden geen
> `--pl-sab` in de bron en waren tóch ruim: ze eindigen met een knop hoog in
> een lang paneel. Nog een reden om te meten en niet te lezen.

Die laatste zin is goed en klopt nog steeds. De conclusie eromheen was een
meting op één toestelmaat, en is als eigenschap van het venster opgeschreven.
Twee dingen maakten hem onwaar:

1. **Het paneel groeide.** #123 verhuisde diezelfde dag de
   bevindingenschakelaar mét zijn uitleg van het ☰-menu naar dit venster. Op
   een kort scherm gaat `#runOv` daardoor scrollen, en pas dán komt de
   onderrand tegen de knoppenbalk aan.
2. **De proef mat de verkeerde maat** — en dat is de kant die het waard is te
   onthouden, want de les stond al ín het bestand. Onder "twee meetlessen,
   allebei duur betaald" staat sinds #135 letterlijk: *de laagste knop is niet
   altijd de maat.* Die les was daar toegepast op het keuzescherm, en nergens
   anders. Nagemeten op 360×640 met een balk van 48px:

   | maat | Run-venster |
   |---|---|
   | laagste **knop** ("Aan") | 65px — ruim |
   | laagste **tekst** ("staat de balk uit, dan…") | 43px — eronder |

   De knop was te raken; de zin die uitlegt wat hij doet, niet te lezen.

**De reparatie is één regel** — de onderrand van `#runOv` telt `--pl-sab` mee,
zoals elk ander vel dat doet. Dat is de kleinste helft.

**De andere helft is dat de wachter nu twee maten heeft, en op twee maten
kijkt.** Elk van de dertien vellen wordt sindsdien óók op zijn laagste
*zichtbare tekst* gemeten, en de hele reeks draait een tweede keer op 360×640.

Bij het bouwen van die tekstmaat viel de voor de hand liggende variant meteen
om: "het laagste element" gaf voor twaalf van de dertien vellen exact 0px. Een
vel is een volschermwikkel met `inset:0` waarin een kaart hangt, en die wikkel
lóópt tot de onderrand — dat mag, hij is de halfdoorzichtige achtergrond. Een
maat die overal hetzelfde antwoord geeft, onderscheidt niets. Tekst is wel de
klacht: "komt niet geheel in beeld" gaat over iets dat je moet kunnen lezen.
Een `Range` om de tekstknoop meet de regel zelf in plaats van de doos eromheen,
en dan is er precies één vel rood — het vel uit het issue.

Het korte scherm is de tweede helft daarvan, en even belangrijk. Op 412×915 had
dit paneel 257px over: daar valt niets te zien, hoe je ook meet. Een paneel dat
moet scrollen is de voorwaarde waaronder deze fout bestaat, en die voorwaarde
hoort de proef zélf te maken in plaats van te wachten tot iemand er een
schermfoto van stuurt. `plbrowser.js` kan het venster daarvoor nu verkleinen
zonder opnieuw op te starten.

**De vorm om te onthouden.** Dit is dezelfde als bij #142 (*"beide keren stónd
de wachter er al"*) en bij #116 (*"de meetlat mat naast"*), en dat is nu drie
keer in één week. Een groene proef zegt: wat ik meet, is in orde. Hij zegt niet
dat ik meet wat er misgaat. De vraag bij een bevinding die langs een bestaande
wachter kwam, is daarom nooit alleen "waarom is dit stuk" maar ook **"wat kijkt
die wachter aan, en waar houdt dat op"** — en die vraag stond hier drie regels
boven het antwoord.

### De melding beweerde wat hij niet gemeten had — 08-09-2026 (#18)

`PLAchtergrond` schreef bij elke terugkomst één regel in het logboek:

```
📴 De app was 120 s weg — de meetlus stond in die tijd stil (#18)
```

Het eerste deel is een meting. Het tweede is een oordeel, en dat is er
anderhalve week lang stilzwijgend bij gezet. De module hangt aan
`visibilitychange` en weet daarmee precies één ding: hoe lang de app
onzichtbaar was. Of de meetlus in die tijd ook werkelijk stillag, weet hij
niet.

**Op de rit van 02-09 om 23:22 was dat oordeel aantoonbaar fout, en het log
eronder sprak het in dezelfde seconde tegen.**

| tijd | wat |
|---|---|
| 23:17:59 | app verborgen |
| 23:18:05 | `SPP automatisch herverbonden` |
| 23:18:18 | `ELM327 initialisatie klaar` |
| 23:18:20 | `Monitor: UITVAL:0105 — levert geen data meer` |
| 23:18:32 | `0105 hersteld na ~34s uitval` |
| 23:18:35 | `Verificatie: Niet gereproduceerd` |
| *stilte* | |
| 23:19:59 | terug — "de app was 120 s weg, de meetlus stond stil" |

De app deed in de eerste ~36 seconden ná het verbergen een volledige
herverbinding mét ELM-init, zag een sensoruitval, startte een verificatie en
rondde die af. Pas dáárna heeft Android hem bevroren. Werkelijk stil: ~84 s.
Gemeld: 120 s.

**En dat verkeerde getal werd doorgegeven.** Blok 5 legde het gat dat `PLRit`
uit zijn eigen tikken afleidt (64 s) naast de afwezigheid die `PLAchtergrond`
kent (120 s), en zette LET OP zodra die meer dan een kwart uiteenliepen —
*"een van beide meet iets anders dan de onderbreking zelf"*. Dat was ook zo, en
het was geen bevinding: de aanlooptijd tot de bevriezing zit er per definitie
tussen. De proef sloeg dus alarm op precies het getal dat hij hoorde te
rapporteren.

**De reparatie is een hartslag die alleen loopt terwijl de app weg is.** Elke
seconde één tik die niets doet behalve `Date.now()` opschrijven. Vuurt hij, dan
liep de lus; vuurt hij niet, dan lag hij stil. De grootste stilte tussen twee
tikken ís de bevriezing — gemeten, niet aangenomen. Kosten: één `setInterval`
tijdens een vensterwissel, en die staat stil zodra de pollus stilstaat, wat
juist het punt is.

Dat levert in één keer de getallen op waar richting B van het issue om vraagt:

| veld | wat het zegt |
|---|---|
| `door` | hoe lang de app na het verbergen nog doorliep — de aanlooptijd |
| `stil` | hoe lang de meetlus werkelijk niets deed |
| `na` | liep hij daarna uit zichzelf weer? Dan was het **afknijpen**, geen bevriezing |
| `slagen` | hoe vaak de hartslag vuurde; nul betekent meteen bevroren |

**`na` is niet de minst belangrijke van de vier.** Chromium knijpt een
verborgen tab eerst af naar één tik per minuut vóórdat Android het proces
stilzet. Dat leest als een bevriezing van een minuut, maar de lus komt uit
zichzelf terug — en dat vraagt om een andere oplossing dan een foreground
service. Zonder dit getal zijn die twee niet uit elkaar te houden.

**Drie plekken die nu het onderscheid volhouden.**

1. *De melding.* Noemt de duur zonder het oordeel, of het gemeten oordeel mét
   de duur. Liep de lus door, dan is dat `info` en geen `warn`: het log-niveau
   is daarmee zelf een meetwaarde geworden.
2. *Blok 5.* Het **bestaan** blijft het alarm — ziet `PLRit` een gat waar
   `PLAchtergrond` niets van weet, dan lag de lus stil zonder dat de app het
   doorhad, en dat is FOUT. De **duur** is een meetwaarde, en die vergelijking
   loopt nu tussen twee getallen die hetzelfde meten: het gat van `PLRit` tegen
   de gemeten stilte. De aanlooptijd staat als getal in het verslag.
3. *Blok 14.* Stond *"een gat betekent dat de meetlus zelf niet liep (Android
   bevriest WebView-timers op de achtergrond)"* — waar voor het eerste deel, een
   toegeschreven oorzaak voor het tweede. `plGatDuiding()` legt nu elk gat naast
   de perioden die `PLAchtergrond` werkelijk heeft vastgelegd. Valt het
   erbuiten, dan lag de lus stil terwijl de app in beeld stond, en dat is #18
   niet — dan is het de adapter, de bus of een vastgelopen sweep.

**`null` is geen nul, en dat is de kern.** Startte de hartslag niet, dan staat
`stil` op `null` en niet op `0`. Nul betekent "de lus liep door" — een
uitspraak. Niet-gemeten is iets anders dan niet-gebeurd, en die twee als
hetzelfde lezen is exact de fout die dit issue anderhalve week open hield, één
laag hoger. Hetzelfde geldt in `plGatDuiding()`: `null` (geen module) is
"niet te zeggen", `[]` (module, geen perioden) is "de app was niet weg".

**Wat dit voor richting 1 betekent.** De aanlooptijd van ~36 s was het
bruikbaarste getal van de hele rit van 02-09, en het kwam er met de hand uit
door twee logs naast elkaar te leggen. Nu meet de app het zelf, elke keer. Twee
dingen worden daarmee concreter: een korte vensterwissel kost waarschijnlijk
niets (de drempel van 10 s waarop de socket wordt nagekeken zit ruim binnen die
36 s, en is daarmee onderbouwd in plaats van gekozen), en een foreground service
hoeft geen milliseconden te winnen maar een gat van deze orde te overbruggen.

**Wat er níét mee opgelost is.** De bevriezing zelf. Dat blijft richting 1
(foreground service plus wake lock) of de vierde richting uit het issue
(picture-in-picture), en dat is native werk. Deze ronde levert de getallen
waarmee die keuze onderbouwd wordt in plaats van gegokt — dat was punt B van de
route die op 01-09 gekozen is. Punt A, de vensterwissel bij het opslaan
weghalen, loopt via #132: alle twaalf exportknoppen lopen door dezelfde
`download()` die eerst `nativeShareFile()` probeert, en dát is de vensterwissel.

**Twee toetsen erbij, en ze zijn allebei nieuw van vorm.**
`test-achtergrondproef.js` speelt de rit van 02-09 na met béide echte modules
in één sandbox op één gestuurde klok — `PLRit` krijgt zijn gaten via
`tik(nuOverride)`, `PLAchtergrond` zijn stilte via de hartslag — en eist dat
dezelfde rit die toen LET OP opleverde nu groen is, mét de aanlooptijd erbij.
`test-gatduiding.js` toetst de toewijzing in blok 14 los, want dat blok heeft
een halve testrun nodig om te draaien en een oordeel dat alleen in de auto te
toetsen is, wordt niet getoetst.

### Twee wachters die net niet ver genoeg reikten — 08-09-2026 (#142)

#142 kwam binnen als een CodeQL-samenvatting van buiten: elf bevindingen,
waarvan zes "CRITICAL, fix now". Nagemeten in de bron bleven er twee over die
werkelijk iets waren, en die twee hadden dezelfde vorm — en dát is het punt
van dit kopje, niet de fixes zelf.

**Beide keren stónd de wachter er al.** Dat is precies waarom ze bleven staan.

*Airtable-formules.* Op vier plekken ging een tekst als letterlijke waarde een
`filterByFormula` in, geëscaped met `.replace(/'/g, "\\'")`. Die vervanging is
globaal, dus de bekende "alleen het eerste voorkomen"-fout was het niet — daar
had ik bij de eerste lezing dan ook op gekeken en hem goedgekeurd. Het gat zat
een laag dieper: de **backslash zelf** werd niet ontsnapt. Bij invoer `a\` plus
een quote maakt de oude regel er `a\\'` van, en in de formule is `\\` een
ontsnapte backslash met daarna een quote die de string alsnog sluit. Alles wat
er dan volgt staat als formule-syntax in de vraag aan Airtable. Schrijven kan
een formule niet, maar filteren wel — en daarmee is het een orakel dat per
verzoek één ja/nee over een afgeschermd veld prijsgeeft, `PassHash` incluis.

*De opnametabel van de expert.* `_recRowsHtml()` in `pidlane-remote.js` zette
`esc()` netjes op `r.name` en `r.unit`, maar de vier cijferkolommen gingen ruw
de `innerHTML` in, met alleen een null-controle ervoor. Die rijen komen van de
andere kant van de remote-sessie. Een peer die in plaats van een meetwaarde een
stukje markup stuurt, schreef dat rechtstreeks in het venster van de expert.

**De les zit in wat de eerste beoordeling wél en niet zag.** Ik heb #142 eerst
per punt afgelopen en de Airtable-bevinding afgedaan als "deels reëel,
medium-laag: de replace is wél globaal". Dat klopte, en het was toch het
verkeerde antwoord — ik had de bevinding getoetst aan de fout die ik verwáchtte
(niet-globale replace) in plaats van aan de vraag die ertoe doet: *gaat de
string ergens open?* Pas bij het bouwen van de test kwam die vraag boven, en
toen viel het gat in één keer om. Een externe scanner die de goede plek
aanwijst met de verkeerde reden erbij, is nog steeds de goede plek.

Dat is meteen de reden dat de toetsen hier niet kijken of er geëscaped is maar
of de string dichtgaat. `test-formule-escape.js` leest een stringliteral zoals
een formule-parser dat doet; `test-adminbron.js` deel 11 vergelijkt het
**syntaxskelet** van de uitgaande formule met dat van een onschuldige zoekterm
— lukt het een zoekterm om ook maar één teken syntax toe te voegen, dan valt
hij om. Bij de eerste opzet had ik daar een zwakkere controle staan die de
oude, kapotte regel gewoon goedkeurde; dat bleek pas door de tegenproef met de
hand te draaien, vóór de mutaties in `plmutate.sh` stonden. Vier mutaties
houden het nu vast.

**Wat er níét gerepareerd is, en waarom.** De negen andere punten uit #142
staan beoordeeld in de issue zelf. Twee ervan zijn het noemen waard omdat de
conclusie tegen de scan in gaat: de sleutel in `localStorage` is een bewuste
afweging (de standaardmodus is proxy, en `sessionStorage` botst met het
herladen van de Android-WebView), en de "stack trace exposure" zit uitsluitend
in `test-*.js`-harnassen — `worker.js` geeft naar buiten alleen `error.message`.
Het pad-traversalpunt in `plbrowser.js` is echt maar draagt geen risico: die
server bindt op `127.0.0.1`, draait alleen tijdens een testrun en heeft als
enige client de Chromium die het script zelf start.

Los daarvan gevonden en met opzet laten staan: `esc(r.name)` toont bij een
ontbrekende naam nog steeds het woord "undefined" in de naamkolom. Dat is een
weergavenetheid in een tekstkolom, geen injectiepad, en hoort dus niet in
dezelfde wijziging. Vastgelegd in `test-remote-tabel.js` deel 6 zodat het niet
zoekraakt.
### De beheerpagina sloeg niet op: de nep-worker was een tweede waarheid — 08-09-2026 (#146, opgelost)

"Opslaan" op de instellingenkaart van `admin/beheer.html` gaf **"no_items"**.
`saveAll()` stuurde een plat object (`{door_saving_active:true, feat_demo:…}`)
naar `POST /api/config`, terwijl de Worker (`handleConfigPost`) een
`items:[{Key,Value,Description}]`-array verwacht en op een lege `payload.items`
met `no_items` (400) afkapt. Het oude, werkende `admin.html` bouwde die array
wél — bij de overstap naar `beheer.html` (#139) is die vorm niet meegekomen.

**Waarom niemand het zag tot een klant het meldde.** De oefenmodus in
`beheer.html` heeft een eigen nep-worker (`oefenAntwoord`) die de echte route
naspeelt, zodat de pagina te leren valt zonder op productie te werken. Die nep
deed voor `/api/config` POST een `Object.assign(D.config, body)` — hij *mergede
een plat object*. Daarmee "werkte" opslaan in oefenmodus precies zolang
`saveAll` het verkeerd deed: de nep en de fout pasten bij elkaar, en de echte
Worker was de enige die de mismatch liet zien. Dat is dezelfde vorm als de
gewaarschuwde "tweede waarheid" uit CLAUDE.md: een testdubbel dat soepeler is
dan het origineel bewijst niets.

De reparatie is dus twee kanten: `saveAll()` bouwt weer een `items`-array (met
`String()`-waarden, zoals GET ze ook teruggeeft), én de nep eist nu net zo hard
`items:[…]` en geeft anders `no_items`. Pas daarmee kan een browserproef de
fout vangen: `bproef-beheerpagina.js` deel 6 zet een schakelaar om, bewaart, en
kijkt of `OEFEN_DATA.config` de waarde echt draagt — met de oude platte body
blijft die `undefined` en wordt de proef rood. Een detail dat bij die proef
hoort: `callWorker()` gooit in oefenmodus niet op `ok:false`, dus `saveMsg`
toont sowieso "opgeslagen" — het enige eerlijke signaal is de config zelf.

### Proeftegoed aan het account: de kolom bestáát écht — 08-09-2026 (#113, opgelost)

#113 was het zwaarste open punt in de credits-hoek: het proeftegoed hing aan
het toestel (`gratisStart: 25` in localStorage), dus app-gegevens wissen of een
tweede profiel gaf telkens opnieuw credits. De **code** loste dat al op bij #49
(29-08): de client deelt niets meer uit, en `handleKlantOnboarding` in
`worker.js` boekt `KLANT_START_SALDO` (20) bij en zet het vinkje
`StartTegoedGegeven` — één keer per account, binnen `metSaldoSlot()`. `alGehad =
f.StartTegoedGegeven === true` is de hele grendel.

**De vergissing die bewaard hoort te blijven.** Zowel de issue-tekst als
`CAMPAGNE` bleven ná #49 nog zeggen *"gratisStart: 25 staat in localStorage"*.
Dat was toen al onjuist. Een beschrijving die ooit klopte en het niet meer doet
leest even dwingend als een die klopt — precies de vorm waar CLAUDE.md voor
waarschuwt. De `CAMPAGNE`-regel is er in deze ronde uit; hij hoorde niet meer in
"wat deze ronde niet oplost".

**De enige echt open vraag, nu beantwoord.** De vorige analyse (03-09) kon van
buitenaf niet zien of de kolom `StartTegoedGegeven` in de Airtable-tabel
`Klanten` bestond. Bestond hij niet, dan zou `klantPatch` (met `typecast:true`)
het veld kwijtraken, las `f.StartTegoedGegeven` altijd `undefined`, bleef
`alGehad` op `false` en keerde **elke** onboarding-call opnieuw 20 uit —
hetzelfde gat, verplaatst van het toestel naar de route. Op 08-09 nagekeken in
de base *PidLane Config* (`appUAuyRxK18T7ImK`): het veld bestaat
(`fldmAOV9iBsHrMepW`, type checkbox, met de beschrijving die zegt waarvoor het
dient). De grendel wordt dus niet stil ondergraven.

**Wat er nog getoetst moest worden, is er nu.** `test-saldo-slot.js` bewees met
een bronscan dát de functie binnen het slot schrijft; dat is niet hetzelfde als
bewijzen dat de grendel wérkt. `test-onboarding-tegoed.js` draait nu de echte
handler: eerste call kent 20 toe en zet de vlag, tweede call kent 0 toe en laat
het saldo staan, en de tegenproef laat zien dat de **vlag** beslist en niet het
saldo (vlag aan + saldo 0 → niets erbij; vlag uit + saldo 500 → tóch de
eenmalige 20). Een mutatie in `plmutate.sh` legt `alGehad` plat en maakt die
delen rood.

**De migratie uit "Klaar als" is grotendeels een non-issue.** Wie in het oude
model zijn 25 kreeg, had geen `Klanten`-account — dat tegoed leefde op
localStorage zónder registratie (zie de tabelbeschrijving). Er is dus geen
serversaldo dat "stilletjes verloren" kan gaan. Een account dat al bestond vóór
de vlag er was, krijgt bij zijn eerstvolgende onboarding eenmalig 20 (de vlag
stond nog niet aan) en daarna nooit meer — mild, geen herhaalbaar gat. Wil je
dat ook dat eenmalige restje dichtgaat, dan is dat één handmatige zet
`StartTegoedGegeven: true` over de bestaande rijen; dat is een bewuste
productie-ingreep en staat los van deze fix.

### Twee schermfoto's, dertien vensters, drie echte gaten — 08-09-2026 (#134, #135)

#134 ("Rapporten", uit het ☰-menu) en #135 (de deur "Wat is er met mijn auto?")
kwamen binnen als twee foto's met dezelfde klacht: de onderkant is weg. De
#71-ronde van 03-09 had drie onderste vellen gerepareerd, maar allebei deze
schermen zijn een ándere vorm — en dat is de reden dat ze eromheen liepen:

| vorm | wie | waarom hij buiten #71 viel |
|---|---|---|
| `.ai-sheet` zonder voettekst | Rapporten, Bevindingen, PID-recorder | de veilige marge zat in `.ai-sheet-f`, en die drie bouwen alleen een kop en een romp |
| `.rem-card` in `index.html` | Deel mijn data, Expert op afstand | staat in de HTML en droeg dus geen klasse uit de #58-ronde |
| het keuzescherm zelf | de vijf deuren | `#welcomeScreen` heeft sinds 04-08 een eigen regeling — en juist die maakte het gat |

Een bronscan over álle vensters met `position:fixed;inset:0` gaf zes
kandidaten zonder `var(--pl-sab)`. De meting in `bproef-schermranden.js` (met
een navigatiebalk van 48px) wees uit welke daarvan het ook echt waren:

```
PID-recorder            14px  →  62px
Expert op afstand       29px  →  77px
Keuzescherm, laatste kaart   24px  →  72px
```

De vier volschermvensters uit `pidlane-koopcheck.js` en het Run-venster stonden
niet in de bron maar waren tóch ruim (269 tot 541px): ze eindigen met een knop
hoog in een lang paneel. Broncontrole alleen had daar dus vier keer werk
opgeleverd dat niets oplost.

**Waarom het keuzescherm juist door zijn eigen reparatie omviel.**
`#welcomeScreen` loopt met opzet tot ónder de veilige zone door
(`bottom: calc(0px - var(--pl-sab))`) zodat er geen strook overblijft waar de
live view doorheen schemert — dat was de reparatie van 04-08. De
`padding-bottom` daar compenseert precies die overhang, dus de inhoud eindigt op
de onderrand van de layout-viewport, en dát is op Android edge-to-edge exact
waar de drie knoppen liggen. De scrollende inhoud had die marge dus zélf nodig.
Een reparatie die zijn eigen randgeval maakt.

**Twee meetlessen, allebei duur betaald in deze ronde.**

1. **De animatie meet mee.** `.ai-sheet` schuift omhoog (`animation: sheetUp
   .25s`). Meteen na het openen meten gaf voor de PID-recorder "26px ONDER de
   onderrand" — dat was het vel dat nog omhoog moest. De inline gebouwde vellen
   hebben die animatie niet en kwamen er wél goed uit, waardoor het verschil
   juist overtuigend leek. De proef wacht nu 400 ms.
2. **De laagste knop is niet altijd de maat.** Bij #135 stond de laagste knop op
   153px en was er niets aan de hand; het was de laatste KAART die 24px boven de
   rand eindigde. Een scherm vol tekst heeft een inhoudsmaat nodig, een vel met
   een knoppenrij onderin niet. De proef meet nu allebei.

`test-schermranden.js` bewaakt de drie CSS-regels op de toestellen waar geen
Chromium staat; `plmutate.sh` maakt ze rood als iemand ze weghaalt.

### Het logboek had de tijd wél, en pakte de andere helft — 08-09-2026 (#140)

Gemeld op 05-09: "items van 22:00 staan onderaan en nieuwe regels komen na
middernacht daarboven". Dat klopt, en de oorzaak stond in de kop van
`pidlane-logboek.js` zelf opgeschreven:

> Elke bron levert `{t, bron, type, msg}`. `t` is een tijdstring HH:MM:SS zoals
> de bronnen hem zelf maken — **geen enkele bewaart een echte timestamp**, dus
> sorteren gaat op die string.

Die zin was al onwaar toen hij er stond. `log()` in `pidlane-auth.js` en
`btDiag()` in `pidlane-btflow.js` zetten sinds **#75** `t: Date.now()` naast de
kloktijd, met in het commentaar erbij precies de reden: *"`ts` is alleen
HH:MM:SS en dus niet te vergelijken met een starttijd"*. Het logboek las de
verkeerde helft van hetzelfde object. Als string is `"00:15:03"` kleiner dan
`"22:14:07"`, dus alles van na twaalven schoof naar boven.

**Wat dit laat zien is niet de bug maar de vorm.** Een module die een tweede
module leest, herhaalt in zijn eigen kop wat die eerste module doet — en dat is
een kopie die veroudert zonder dat er iets rood wordt. Hier stond de correctie
(#75, augustus) in de bron, en de verouderde samenvatting in de lezer. Dezelfde
vorm als de tabel die §11 op 02-09 de kop kostte, één laag lager.

De regels worden nu op het epoch gesorteerd; de kloktijd blijft wat hij was —
de string voor het scherm, het zoekveld en de export. Twee bronnen hebben geen
epoch (de tekstspiegel is platte tekst, de diagring bewaart alleen een
kloktijd); die krijgen er een afgeleid uit hun eigen volgorde, want beide worden
alleen aangevuld en nooit herschikt. Dat geeft geen exacte datum en pretendeert
dat ook niet — het geeft de juiste volgorde. `test-logboeksort.js` toetst het op
de echte module, met de oude sortering als tegenproef op hetzelfde materiaal.

**Onderweg gevonden, en op 08-09 alsnog gerepareerd.** `_uitDiagRing()` las
`r.ts || r.tijd`, terwijl `_diagRing` zijn kloktijd in `r.t` zet
(`pidlane-diagbundel.js`, rond regel 22). Die twee namen zijn elkaar nooit
tegengekomen, dus élke PID-regel kwam zonder tijd binnen en belandde onderaan
het logboek in plaats van op de tijdlijn — precies de regels waarvoor je dit
scherm opent ("wat gebeurde er rond 14:38:25"). De ring schrijft nu ook een
epoch mee, net als `log()` en `btDiag()` sinds #75; blok 5 van
`test-logboeksort.js` toetst het met de oude veldnaam als tegenproef.

### De extensie was niet de oorzaak — het opslagvenster ís #18 — 08-09-2026 (#132)

Het issue vermoedt de bestandsextensie: het opslagvenster van de Bulk Recorder
zou een dialoog geven waar andere opslaanknoppen rechtstreeks wegschrijven. Bij
het nalopen bleek die aanname niet te houden. **Alle twaalf modules die een
bestand wegschrijven lopen door dezelfde `download()`** in
`pidlane-motortype.js`, en die bouwt zijn Blob altijd als `text/plain` —
de extensie komt er niet in voor. Wat die functie wél doet is eerst
`nativeShareFile()` proberen, en dat opent de Android-deelkaart.

Daarmee is dit hetzelfde mechanisme als #18: een venster dat de WebView naar de
achtergrond duwt, waar Android de JS-timers bevriest en de socket opruimt. Dat
het juist hier opvalt is te verklaren zonder een tweede oorzaak: de
bulk-export is het grootste bestand (NDJSON, lineair groeiend) én de enige
opslagknop die je typisch indrukt terwijl de verbinding nog staat. De andere
exports gebruik je ná een rit, en dan is er geen verbinding meer om te verliezen.

**Nog niet gemeten, en dat is de volgende stap:** doe een andere exportknop
tijdens een lopende BT-sessie. Verbreekt die óók, dan hoort #132 bij #18 en is
een aparte reparatie voor de recorder verspilde moeite.

### Elke scan mislukte, en dat lag niet aan de adressen — 04-09-2026

De jacht op datapunten liep hier al maanden op raden. Blok 9 gokte 256
identifiers in de 11xx-reeks op 7E0 en vond niets; de km-check gokt
Ford-nummers op Mazda-adressen. De conclusie was steeds "verkeerde lijst,
volgende keer een betere lijst". Die conclusie was fout.

**De omgeving liet geen enkele lange scan overleven.** Vier oorzaken, geen
ervan in de scan zelf:

| # | wat | gevolg |
|---|---|---|
| 1 | `ATH0` staat in béide init-reeksen van `pidlane-bt.js` | een antwoord is anoniem — blok 9 kon niet vaststellen wélk stuurapparaat sprak |
| 2 | `PLBus.MAX_HOLD_MS` = 180 s | een scan die langer duurt wordt onteigend, midden in een `ATSH`-reeks |
| 3 | `trackBtQuality()`: 6× leeg = socket dood | een sweep over 256 adressen waarvan 250 niet bestaan verbreekt zijn eigen verbinding |
| 4 | `PLBus.note()` telt NO DATA als fout | `foutPct` → ~100%, `PLBusGate` dicht, waakronde meldt sensoren als uitgevallen |

Oorzaak 1 is de fundamentele: **zonder headers is er geen kaart, alleen een
lijst.** De andere drie zorgden ervoor dat je nooit lang genoeg mocht meten om
dat te merken.

**Wat er is veranderd.** `PLBus.raak()` erbij: een houder die zich blijft
melden hangt per definitie niet, dus de noodrem meet vanaf de laatste melding
in plaats van vanaf de claim — en een houder die stópt met melden valt
onveranderd na drie minuten om (`test-busslot.js` toetst beide helften).
`window._plScanActief` zet oorzaak 3 en 4 uit voor de duur van een scan; in
ruil daarvoor bewaakt `PLKaart` de verbinding zélf met een `ATI`-hartslag en
breekt af als die twee keer stil blijft. Een `write()`-fout (`force`) gaat
onveranderd door de reconnect-guard: dát is wél een kapotte socket.

**Twee bugs die de test bij zijn eerste run vond.**

*Geen ISO-TP-hersamenstelling.* Met de headers UIT plakt de adapter een lang
antwoord zelf aan elkaar en zet er `0:` / `1:` voor. Met de headers AAN doet
hij dat niet: je krijgt losse CAN-frames, elk met hetzelfde id en een eigen
stuurbyte. Een VIN is 20 bytes en past nooit in één frame. De eerste versie
las daar zes bytes van en hield de rest voor twee extra stuurapparaten. Dat is
geen randgeval — `F190` is de identifier waar je mee begint.

*De bitmap telde zichzelf mee.* Het laatste bit van een mode 01-bitmap zegt
"er volgt nog een bitmap"; dat is PID `0x20`, `0x40`, … De eerste versie zette
die als datapunt in de kaart. Een verzonnen datapunt in een module die
verzinsels moet uitbannen.

**Wat de kaart wél en niet zegt.** Hij zegt wat er BESTAAT (het stuurapparaat
declareert het zelf, of antwoordt met `62` in plaats van `7F 22 31`) en wat er
BEWEEGT — een tweede pas leest elke treffer opnieuw en markeert wat veranderde,
wat sensoren van configuratie scheidt zonder één gok. Hij zegt niet wat de
bytes betekenen. Dat is handwerk achteraf, met koelwater en toerental ernaast.

**Wat er niet gerepareerd is.** `_sendBTOnce()` pollt de SPP-socket elke 50 ms
op een prompt. Daarmee ligt de bodem van één commando rond de 60-110 ms, hoe
snel de adapter ook is. Bij 65.536 identifiers is dat uren. Dat is een
verbouwing van de transportlaag en hoort niet in dezelfde commit; de
tijdschatting vóór de scan rekent er voorlopig met 85 ms per commando.

**Gemeten op de CX-5, 04-09-2026 om 11:49 — en hij werkte.** 171 seconden, 1260
commando's, **achttien stuurapparaten**, gevonden door waarneming:

```
706/70E  720/728  726/72E  730/738  731/739  733/73B  734/73C  736/73E
737/73F  756/75E  760/768  784/78C  7B7/7BF  7C1/7C9  7C4/7CC  7C6/7CE
7DF/7E8  7F1/7F9
```

Elk antwoordadres is precies zender+8, dus de conventie klopt op deze auto —
maar dat is nu *gemeten* in plaats van aangenomen, en dat was het hele punt.
Op 70E stond de oogst:

| DID | bytes → tekst | wat het is |
|---|---|---|
| `F190` | `JMZKF6W7600766507` | de VIN, en hij klopt met wat `0902` gaf |
| `F180` | `01` + `B61L-67XK6-B` | Mazda-onderdeelnummer |
| `F188` | `B61L-67XK2-T` | tweede onderdeelnummer |
| `F18C` | `031816401145B1` | serienummer |
| `F191` | `202758AB` | hardwareversie |
| `F40D` | `00` | de OBD-spiegel van PID 0D (snelheid), dus F4xx léé́ft hier |

Op 7E8 kwamen 50 mode 01-PIDs met ruwe bytes, negen mode 06-monitors en vijf
mode 09-items. **`01A6` staat er niet bij** — de generieke odometer bestaat op
deze auto niet, precies zoals bij de km-check voorspeld.

**En de rit legde vijf fouten bloot, waarvan één ernstig.**

*Het verslag loog over zeventien stuurapparaten.* De scan liep per module de
hele trap af: 2944 identifiers op 70E vóórdat 728 aan de beurt kwam. Hij brak
na 171 s af bij **193 van de 2944, op de eerste module**. De andere zeventien
waren nooit aangeraakt — en het verslag zei van elk *"geen enkele identifier
uit de trap bestaat hier"*. Dat is afwezigheid als bewijs, in de module die
daar juist tegen is. Nu is de buitenste lus de TREDE en de binnenste de module
(breedte vóór diepte), en elke module houdt per trede bij of hij `volledig`,
`afgebroken na n van m`, of `niet bereikt` is. Wat er nu sneuvelt bij een
afbreking is de minst waardevolle trede, niet zeventien stuurapparaten.

*Het herstel werd nooit bewezen.* `sendCmd()` **gooit niet** als de ELM-poort
dicht staat na een socketdood — hij geeft een lege string. De `try/catch`
eromheen ving dus niets, en het verslag meldde een geslaagd herstel terwijl
geen van de vijf commando's de adapter had bereikt. Dat de adapter tóch goed
stond, kwam doordat de ELM-herinitialisatie om 11:52:16 toevallig hetzelfde
zet. Geluk, geen ontwerp. Nu wordt elk herstelcommando op zijn bevestiging
gecontroleerd; leeg of `?` telt als mislukt en komt boven in het verslag.

*De tijdschatting was een factor vier mis.* `schatting()` rekent vooraf met
zes modules omdat het aantal dan nog onbekend is. Deze auto heeft er achttien,
en de gemeten snelheid was 136 ms per commando in plaats van de aangenomen 85.
De gebruiker kreeg "27 min" te zien waar de volledige trap er ~120 zou kosten.
De schatting wordt nu **na de ontdekking opnieuw gemaakt**, met het echte
aantal modules en de gemeten snelheid, en gemeld voordat de trap begint.

*NRC 78 werd als weigering gelezen.* Op 73F kwam `7F 19 78` — "antwoord volgt
later", een belofte en geen afwijzing. Nu wordt er één keer opnieuw gelezen.

*De afbreking zelf was correct gedrag.* De app-log toont `📴 De app was 53 s
weg` en `31 s weg` (#18): de WebView werd op de achtergrond bevroren, de
SPP-socket viel om 11:52:01 weg, en de ATI-hartslag brak de scan twee seconden
later af. Dat is precies waarvoor die hartslag bestaat. De oorzaak is #18 en
die is native werk — maar het maakt de breedte-eerst-volgorde des te
belangrijker, want een scan van twee uur op dit toestel gaat het niet halen.

**De tweede rit, 04-09-2026 om 13:43 — en die liep helemaal door.** 969 s,
5378 commando's, 18 stuurapparaten, 114 datapunten, met de hand gestopt en
zónder afbreking of herstelfout. Alle vijf reparaties waren in het log terug te
zien: `gemeten 127 ms per commando … kost nog 1.9 uur`, `NIET BEREIKT` per
trede, en `half: OBD-spiegel (afgebroken na 454 van 768)` op 72E. Achttien
modules met onderdeelnummer:

| adres | onderdeelnummer | waarschijnlijk |
|---|---|---|
| 706/70E | `B61L-67XK2-T` | draagt de VIN én `F40D` |
| 720/728 | `KL2K-554K2-A` | instrumentenpaneel (554 = meter, én het klassieke IPC-adres) |
| 726/72E | `TK52-675X2-C-00` | carrosserie/BCM |
| 730/738 | `KJ01-3210X-G-00` | stuurbekrachtiging |
| 731/739 | `GMB6-675S1-A-07` | carrosserie |
| 733/73B | `K123-61190-0200-Q5690` | klimaat |
| 734/73C | — | antwoordt, geeft geen identificatie |
| 736/73E | `180711-00063` | alleen een serienummer |
| 737/73F | `K123-57KK2-B0` | draagt de VIN |
| 756/75E | `K123-430K2-D` | ABS/DSC |
| 760/768 | `KL2K-437K2-A` | remmen |
| 784/78C | `MAZ_CMU-150_70.00.021` | infotainment (zegt het zelf) |
| 7B7/7BF | `TK52-675Y0-D-00` | carrosserie |
| 7C1/7C9 | `KB9G-67RK2-B` | — |
| 7C4/7CC + 7C6/7CE | `KB8C-67YK2-H` (tweeling) | zelfde nummer, ander serienummer |
| 7DF/7E8 | `PA97-188K2-A` | motor-ECU |
| 7F1/7F9 | — | draagt alleen de VIN |

De duiding komt uit Mazda's nummerschema (de middengroep codeert het systeem)
en is dus aannemelijk, niet bewezen. De nummers zelf zijn gemeten.

**`F4A6` bestaat niet — die draad is dicht.** Het OBD-spiegelblok (F400–F6FF)
is vólledig afgelopen op 70E en op 728, en tot F5C0 op 72E. `F4A6` zit op
positie 167 van 768, dus hij is op alle drie gevraagd en op alle drie
geweigerd. Alleen `F40D` (snelheid, op 70E en 72E) en `F467` (op 72E)
antwoordden. Belangrijkst: het instrumentenpaneel op 728 liep het hele blok af
en levert in de héle identificatie- plus spiegelreeks maar twee identifiers op.
Die teller is dicht. Wat nog openstaat is het OEM-blok `60xx` — het
dashboardblok, op geen enkele module ooit aangeraakt.

### De kaartmaker heropende het derde VIN-pad — 04-09-2026 (opgelost)

Die rit vond vier stuurapparaten die `22F190` beantwoorden (70E, 73F, 7E8, 7F9)
en het verslag drukte de VIN vier keer als **ruwe hex** af. Het testrunlogboek
wordt geplakt en gedeeld; dat is precies het pad dat §11 op 03-09 gesloten had,
door deze module opnieuw geopend.

De reparatie zit niet bij het **tonen** maar bij het **opslaan**: wat de kaart
nooit vasthoudt, kan hij ook niet lekken via een render, een export, een
AI-prompt of een logboek. Elke reeks bytes gaat door `bewaarBytes()`; ziet die
er een geldig voertuignummer in (17 tekens uit de ISO 3779-set — geen I, O of
Q, dus een onderdeelnummer met streepjes valt af), dan bewaart hij de staart
plus het pseudoniem in plaats van de bytes. Mislukt het pseudonimiseren, dan
gaan de bytes er alsnog niet in: minder informatie is de goede kant om op te
falen.

**En dat leverde een controle op die niemand zocht.** Alle vier de VIN's waren
gelijk; 7CC en 7CE dragen er een van louter nullen. Twee *verschillende*
nummers in één auto kan maar op één manier — één stuurapparaat komt ergens
anders vandaan, en bij een teruggezette teller is een vervangen
instrumentenpaneel de gebruikelijke weg. Het oordeel staat in
`PLKm.vinConsistentie()` (de betekenis hoort bij de fraudemodule, niet bij de
scanner) en wordt door zowel PLKm — die `22F190` nu op zijn vijf adressen
vraagt — als PLKaart gebruikt. Een blanco nummer is **LET OP en geen
beschuldiging**: veel modules krijgen er nooit een.

### "Waarvan 0 bewegend" was geen nul maar niets — 04-09-2026 (opgelost)

De tweede pas zit achter `!_stop`. De rit was met de hand gestopt, dus die pas
liep nooit — en tóch meldde elke module *"6 identifiers, waarvan 0 bewegend"*.
Achttien keer een meting die niet gedaan was. Dezelfde fout als *"geen enkele
identifier bestaat hier"* van de rit ervoor, één laag hoger: de eerste ging
over niet-gevraagde identifiers, deze over een niet-gedraaide tweede pas.

Er staat nu `tweede pas niet gedraaid, dus over bewegen valt hier niets te
zeggen`, per datapunt `(niet herlezen)`, en `K.tweedePas` draagt of hij
gedraaid, uitgezet, overgeslagen of halverwege gestopt is. Dat er twee keer
achter elkaar dezelfde soort fout in zat, is de reden dat `plmutate.sh` er nu
mutaties voor draagt in plaats van alleen een regel commentaar.

### Gericht zoeken — 04-09-2026

De volledige trap kost op deze auto 1,9 uur (18 × 2944 identifiers × 127 ms).
De vraag na de tweede rit was veel smaller: de OEM-blokken op *alleen* het
instrumentenpaneel, 1792 identifiers, ruim vier minuten. Daar was geen knop
voor — de kaartmaker deed alle modules of niets.

`PLKaart.scan({modules:['728'], trap:'oem', hergebruikAdressen:true})` doet dat
nu, met de knop **🎯 Gericht** in het testrunpaneel ervoor. De adreskaart wordt
onder het **VIN-pseudoniem** bewaard, niet onder de VIN: een andere auto krijgt
een andere sleutel, en zonder pseudoniem wordt er niets bewaard — liever
opnieuw sweepen dan de adressen van de ene auto op de andere loslaten. Dat
scheelt de 256-adressensweep, 89 van de 171 seconden van de eerste rit.

Modules die buiten de keuze vallen krijgen `niet gevraagd — deze scan was
gericht op …`, en niet de indruk dat er niets te vinden was.

**Wat er nog steeds ongemeten is.** Of `ATCRA` op de niet-7Ex-adressen
werkelijk filtert, is niet apart aangetoond: alle achttien antwoordden op
zender+8, dus een verkeerd filter zou hier hetzelfde beeld geven. En de OEM-
blokken van de trap zijn op géén enkele module afgelopen — de rit stopte in
het identificatieblok.


### De km-stand stond in de app als "niet uitleesbaar" — 04-09-2026 (nieuw, ongemeten)

De koopcheck droeg onder het invoerveld de tekst *"OBD2 geeft de echte
tellerstand niet vrij"*. Dat is de stand van 1996 en al jaren niet meer waar:

| bron | vorm | wat het is |
|---|---|---|
| `01A6` | mode 01, 4 bytes, ÷10 | SAE J1979-2 / WWH-OBD totale afstand, functioneel gevraagd |
| `0131` | mode 01, 2 bytes | afstand sinds het wissen van storingen — géén tellerstand |
| `22 xxxx` | UDS, per CAN-adres | wat één stuurapparaat zelf onthoudt |

`pidlane-kmcheck.js` (`PLKm`) leest die drie en trekt er één oordeel uit. Het
punt is niet de stand maar het **verschil**: terugdraaien gebeurt op het
instrumentenpaneel, en het motorblok en de ABS tellen door.

**Wat er onderweg fout ging, en waarom het hier staat.**

*Onafhankelijkheid zit in het adres, niet in de identifier.* De eerste opzet
groepeerde op modulenaam. Dan bevestigen `220201` en `220200` op 7E0 elkaar —
terwijl dat één doos is die twee keer hetzelfde zegt. De kruisvergelijking
groepeert daarom op CAN-adres. `01A6` gaat functioneel de bus op en wordt in de
praktijk door het motorblok beantwoord; die krijgt de groep `broadcast` mét de
aantekening dat hij dezelfde doos kán zijn als 7E0. Vallen alleen die twee
samen, dan is de uitkomst `onbevestigd` en niet `ok`.

*De ankerregel gooide eerst juist de fraude weg.* Voor een OEM-identifier ligt
de schaal niet vast: dezelfde vier bytes zijn kilometers óf tienden daarvan.
De eerste regel koos de kandidaat die het dichtst bij een anker lag, mits
minstens vier keer dichterbij dan de andere. Die regel werkt precies in het
geval waarin niets aan de hand is, en faalt in het geval waarvoor de module
bestaat: 118.000 naast een anker van 214.000 geeft afstanden 96.000 en
202.200 — ratio 2,1, dus "te dicht bij elkaar", dus geen oordeel. De
teruggedraaide teller viel uit de meting.

Wat een anker wél mag beslissen is de **orde van grootte**: de kandidaten
schelen een factor 10, twee stuurapparaten in dezelfde auto nooit een factor 5.
Precies één kandidaat binnen dat venster → de schaal staat vast, en het
vérschil met het anker blijft daarna gewoon staan om beoordeeld te worden.
Schaalkeuze en oordeel zijn twee stappen, en dat moeten ze blijven.

*Een negatief antwoord draagt de SID van het verzoek.* De weigering is
`7F 22 31`, niet `7F 62 31`. De eerste versie zocht op `'7F' + kop.slice(0,2)`
en vond dus nooit iets: "identifier bestaat niet op dit adres" viel stil in de
bak *geen antwoord*, waarmee het niet meer te onderscheiden was van "dit
stuurapparaat is er niet". `test-kmcheck.js` ving dat bij de eerste run.

**Wat er níét gemeten is, en dus openstaat.**

1. **`ATCRA` is op geen enkele adapter nagemeten.** Een ELM327 zet het
   ontvangstfilter zelf voor 7Ex; voor 720/726/760/7B0 is dat niet
   gegarandeerd, en zonder filter kan het antwoord van een ander stuurapparaat
   ertussen komen. Weigert de adapter het commando (`?`), dan meet de module
   door zónder filter en zet dat in het verslag — nooit stil overslaan. Staat
   er "ATCRA geweigerd" bij een adres, dan is elk antwoord van dat adres
   verdacht.
2. **De identifiers in `BRONNEN` zijn Ford-nummers.** Op de CX-5 is de
   verwachting dat de meeste `7F 22 31` teruggeven. Dat is de meting die de
   tabel moet vullen, geen mislukking — en daarom logt elke bron zijn ruwe
   bytes.
3. **De speling van 1% (minimaal 500 km) is beredeneerd, niet gemeten.** Een
   ABS rekent uit wielomtrek, een motorblok uit snelheid maal tijd. Hoe ver die
   op 200.000 km werkelijk uiteenlopen, weet ik pas na een auto waarvan de
   historie vaststaat.

Waarom dit géén browserproef heeft: `PLKm.oordeel()` is puur en `check()`
praat alleen met `sendCmd`. Dat is node-werk, en `test-kmcheck.js` doet het met
50 toetsen plus zeven mutaties in `plmutate.sh`. Wat node niet kan zien — hangt
de module in de pagina, wijst de knop in de koopcheck ergens op — staat als
proef in blok 5.

### De browserproeven vielen om op hun eigen koude start — 03-09-2026 (opgelost)

`main` stond na de merge van 03-09 rood, en de melding wees de verkeerde kant
op.

**Wat het logboek zei.** `bproef-meetketen.js`, de eerste van de vijf, brak af
met *"Chromium gaf geen debugpoort binnen 30 s"*, met daaronder vier regels
`Failed to connect to the bus: Could not parse server address`. Die dbus-regels
zijn op een headless runner volstrekt normaal en zeggen niets, maar ze stonden
bovenaan de melding — en dat is precies het soort spoor waar je een uur aan
kwijt bent.

**Wat er werkelijk stond, één scherm lager.** De vier proeven ná die eerste
draaiden in dezelfde job, op dezelfde Chromium, en startten elk in ongeveer
**drie seconden**. Het was dus geen kapotte browser, geen ontbrekende poort en
geen ontbrekende bibliotheek. Het was een **koude start**: de eerste launch op
een verse runner betaalt voor het inlezen van het binaire bestand en zijn
bibliotheken en voor het aanmaken van het profiel. Daarna staat dat in de
paginacache van de kernel en is het weg.

**Waarom dit zo lang goed ging.** De grens raakt per definitie alleen de eerste
proef, en of die het haalt hangt af van hoe warm de runner toevallig is. Dat
maakt hem willekeurig rood: de run een half uur eerder (#119) was groen op
dezelfde code. Dat is de vorm waarin een reeks stilletjes waardeloos wordt —
niet doordat hij faalt, maar doordat hij zó vaak zonder oorzaak faalt dat
niemand de melding nog leest. **"Flake" was hier geen oorzaak maar een naam
voor niet gekeken hebben**; het getal stond gewoon in het logboek.

**Wat er is veranderd**, alle drie in `plbrowser.js`:

1. De grens van 30 naar 90 seconden, met de meting erbij in het commentaar.
   Ophogen kost niets als het goed gaat — de lus stopt zodra de ws-regel er is,
   dus een warme start blijft drie seconden. De enige prijs is dat een Chromium
   die écht niet kan starten er langer over doet om dat te zeggen, en dat is de
   goedkopere kant om fout te zitten.
2. De melding zegt nu hoeveel seconden er gewacht is en zet erbij dat de
   dbus-regels normaal zijn en niet de oorzaak.
3. `SIGKILL` als vangnet achter `ch.kill()`. De runner meldde na afloop
   *"Terminate orphan process: chrome"* voor precies deze mislukte start: de
   Chromium die niet opstartte pakte SIGTERM niet op en liep dóór tijdens de
   vier proeven erna, om dezelfde processor vechtend. Een mislukte eerste proef
   maakte de rest van de reeks dus trager — en daarmee zichzelf waarschijnlijker
   de volgende keer.

**De tegenproef.** De fouttak is de code die in een groene run nooit draait, dus
die is apart afgedwongen: met `PL_CHROME=/bin/cat` en de grens tijdelijk op twee
seconden breekt hij af op exact die twee seconden, met de nieuwe melding en de
echte stderr eronder. Twee eerdere pogingen daartoe maten niets — Chromium start
op deze machine binnen een halve seconde, dus een lage grens alléén raakt de tak
niet. Dat is dezelfde les als bij de andere toetsen: een proef die niet
onderscheidt, bewijst niets.

### De build kwam nooit bij de telefoon — 03-09-2026 (opgelost)

De duidelijkste vondst van de dag, en hij verklaart een proef die op niets
leek te slaan.

**Wat er gebeurde.** De vliegtuigmodus-proef uit `CAMPAGNE` (stap A) werd om
18:45 gedaan en toonde de kale WebView-fout, precies wat de nieuwe foutpagina
moest vervangen. De eerste conclusie lag voor de hand: `errorPath` werkt niet.

Dat bleek onjuist, en het uitzoeken loonde. De Android-bron van Capacitor
8.5.0 is opgehaald en nagelezen: `BridgeWebViewClient.onReceivedError()` vuurt
bij elke hoofdframe-fout — `ERR_NAME_NOT_RESOLVED` is er één — en laadt dan
`Bridge.getErrorUrl()`. Die bouwt `scheme://hostname/error.html`, en
`hostname` staat op de standaard `localhost` omdat wij `server.hostname` niet
zetten. De pagina komt dus uit de APK zelf en heeft geen netwerk nodig. De
opzet klopte.

**Waar het wél op stukliep.** `build-apk.yml` zette de APK in de ARTEFACTEN
van de workflow-run. De Worker serveert `/download/pidlane.apk` uit R2
(`apk/pidlane.apk`, zie `handleApkDownload`). Niets verbond die twee. Wie de
app installeerde kreeg dus wat er ooit met de hand in R2 was gezet.

Build #424 draaide om 14:37 volledig door — ondertekend, met de nieuwe
foutpagina erin. Vier uur later stond op het toestel nog de oude schil, en er
was geen weg waarlangs die nieuwe APK daar had kunnen komen.

**Waarom dit zo lang onzichtbaar bleef.** Alles wat je normaal controleert
stond groen: de build slaagde, de handtekening klopte, de artefacten waren
geüpload. Er was geen enkel signaal dat "gebouwd" en "geïnstalleerd" over
verschillende dingen gingen. Dat is dezelfde vorm als de Cloudflare-bot met
zijn "✅ Deployment successful" (#35): een groene melding die een andere vraag
beantwoordt dan de vraag die je stelde.

**Wat er nu staat.** Een publicatiestap die de APK en een `version.json` naar
R2 schrijft — alléén vanaf `main`, want een branch-build als publieke download
zou ongetoetste code tot "de app" maken. Zonder Cloudflare-secret slaat hij
over met een `::warning`, niet stil: doorbouwen mag, zwijgen niet.

De stap **leest het object terug en vergelijkt de checksum**. Dat is geen
overdaad maar dezelfde les als de lege `signingConfig` waarmee Gradle stil
doortekent: een melding van gereedschap is een waarneming, geen bewijs. Landt
er niets of iets anders, dan valt de build om in plaats van de volgende
gebruiker.

`version.json` draagt versionName, versionCode, commit, run-id, bouwtijd,
sha256 en grootte. Dat was precies wat vandaag ontbrak toen de vraag was
*welke* build er op het toestel stond: die vraag was van buitenaf niet te
beantwoorden.

**Bewaakt door `public/test-apkpad.js`**: de sleutel die de build schrijft is
die de Worker leest, de bucket komt uit `wrangler.toml`, de stap is
main-only, hij verifieert zichzelf, en hij slaat zichtbaar over zonder
secret. Drie mutaties in `plmutate.sh`.

**Onbewezen tot de eerste echte run.** Of `wrangler r2 object put` in deze
vorm slaagt, is hier niet te draaien: dat vraagt een bucket en een token. De
terugleescontrole is er juist om dat niet op vertrouwen te laten aankomen —
de eerste build op `main` mét secret zegt het, en anders valt hij om.

### Het icoon startte geen build — 03-09-2026 (opgelost)

Klein, en dezelfde vorm als hierboven: twee lijsten die elkaar niet kenden.

De `paths:`-trigger van `build-apk.yml` noemde `icon-512.png` in de wortel van
de repo; het bestand staat in `public/`. De build vond het logo wel — de
`ls`-zoeklijst in de icoonstap valt terug op `public/` — maar een gewijzigd
icoon startte geen build. Groene historie, draaiende APK, en het logo van
vorige maand er nog in.

`public/test-icoonpad.js` koppelt de twee lijsten nu: elk bestand dat als
icoon gebruikt kán worden, moet ook een build starten. Hij kijkt en passant of
het gekozen icoon bestaat, een echte PNG is, vierkant, en minstens 432px — dat
is de grootste Android-mipmap, daaronder wordt er opgeschaald en dat zie je.

Twee mutaties, want deze koppeling breekt van twee kanten: een pad dat uit de
trigger valt, en een kandidaat die aan de zoeklijst wordt toegevoegd zonder
dat de trigger meegaat.

### Automerge voegde samen in 29 seconden — 03-09-2026 (strategie omgekeerd)

Niet één bevinding maar een meting, en die meting is de reden dat de strategie
om is.

**Wat er gemeten is.** Over 56 samengevoegde PR's was de mediaan van openen
tot samenvoegen **29 seconden**. 43 ervan gingen binnen 40 seconden, de
snelste in 9. Daar bovenop: **14 keer** volgde er binnen twee uur nóg een PR
op dezelfde branch — `rico-test` zes keer, `testrun-log-prep` vier keer, met
gaten van 12 en 17 minuten.

**Waarom die 29 seconden het probleem zijn en niet de prestatie.** Elke merge
op dit project is een deploy naar 100% van het verkeer; er zit geen mens
tussen die merge en de klant. Bij 29 seconden is er dus geen toestand waarin
iets "eraan komt" en je het nog kunt tegenhouden. Je ziet het pas als het live
staat.

De 14 vervolg-PR's zijn deels legitiem nieuw werk op een lange branch. Maar
PR #80 van 01-09 is dezelfde vorm en dat was het niet: geopend om 20:52:56,
gemerged om 20:53:08, op één van de twee commits. De PR zág er compleet uit —
de titel was die van de eerste commit. Testrun 6.0 bleef achter op de branch
terwijl `main` op 5.9 stond, en de deploy die eruit volgde bevatte alleen een
bijgewerkte `PIDLANE.md`.

**Wat er toen gebeurde, en waarom dat niet werkte.** Er kwam een gedragsregel
in `CLAUDE.md`: *"af, groen, gepusht, dán pas de PR."* Die regel is juist. Hij
draait op oplettendheid, en over de dagen erna ging dat te vaak mis — vandaar
het verzoek op 03-09 om het anders te doen. Dat is het patroon dat in deze
repo al drie keer is teruggekomen: **een regel die op oplettendheid draait,
verliest van een mechanisme.** Zie ook `plmutate.sh` (de gate die groen stond
op vier nagebouwde fouten) en `PIDLANE-WERK.md` (de lijst die zichzelf bijhield).

**De omkering.** `handmatig` was de rem op een standaard die "samenvoegen"
was. Nu is de standaard "niets doen" en is `klaar` het gaspedaal. Dat label
betekent precies één ding: dit werk is af en álles staat gepusht. `handmatig`
blijft bestaan als hard veto en wint van `klaar` — dat is een ánder ding dan
"nog niet af", en twee labels die elkaar tegenspreken is geen patstelling: nee
gaat voor ja.

**De prijs, en die is echt.** Een PR zonder label blijft liggen, en dat is
precies de toestand waar automerge op 26-08 voor gebouwd is: vier uur wachten
terwijl de gate na drie minuten groen stond. Daarom meldt de workflow op de PR
zelf waarom er niets gebeurt. Zwijgend laten liggen zou de kwaal erger maken
dan het middel.

**De poort die er nog niet was: een verlopen groene vlag.** Een testrun op een
pull_request toetst je branch samengevoegd met `main` *zoals `main` toen was*.
Landt er daarna iets anders, dan zegt die groene vlag niets meer over de
combinatie die nu zou ontstaan — en op dit project landen PR's kort na elkaar
(#120 en #121 21 minuten, de rico-test-PR's 17). De workflow blokkeert nu op
`behind_by > 0` en vraagt om **Update branch**.

Hij werkt de branch **met opzet niet zelf bij**, en de reden daarvoor is
dezelfde vondst als hieronder: een push met `GITHUB_TOKEN` start geen nieuwe
testrun. Zelf bijwerken zou dus een branch opleveren met een head die nooit
getoetst is — erger dan het probleem.

**Wat er van deze vondst het meest waard is.** Niet de omkering maar dit: de
beslissing stond als inline script in `automerge.yml` en was daarmee **niet te
toetsen**. Je merkt een fout in die logica pas als er iets verkeerds is
samengevoegd, en dat is hier meteen een deploy. Hij staat nu in
`automerge-besluit.js` als gewone functie zonder netwerk;
`public/test-automerge.js` voert hem uit met de gevallen die er echt zijn
geweest (#80 staat er als eigen proef in), en vier mutaties in `plmutate.sh`
bouwen de fouten na. De subtielste van die vier is niet "de poort staat open"
maar **"de poort blijft dicht en zegt het niet meer"** — dan blijft een PR
liggen zoals vóór automerge, en dat is de fout die je maanden niet ziet.

**Eén ding is nog een aanname.** `actions/checkout` zonder `ref` pakt bij een
`workflow_run` de standaardbranch, en dáár hangt een veiligheidseigenschap
aan: zou de PR-head uitgecheckt worden, dan kan een PR zijn eigen mergeregels
meebrengen — `automerge-besluit.js` herschrijven naar "altijd ja" en zichzelf
binnenlaten. Dit is gedocumenteerd gedrag van de action, niet gemeten op deze
repo. Wie hier ooit een `ref:` toevoegt, haalt die eigenschap weg.

### Een automerge laat geen spoor na op `main` — 03-09-2026

Gevonden doordat `main` rood bleef staan op een run die niet meer over de code
ging, en dat is precies de vorm waar §11 al een kopje over heeft.

**Wat er aan de hand is.** GitHub start geen workflows voor pushes die met de
standaard `GITHUB_TOKEN` gedaan zijn — de rem tegen oneindige lussen. De
automerge-workflow gebruikt die token, dus een automerge geeft **geen
Tests-run op `main`**.

Meetbaar naast elkaar op 03-09: PR #120 werd door een mens gemerged en gaf run
173; PR #121 ging via automerge en gaf niets. Cloudflare Workers Builds is een
aparte integratie en deployt in beide gevallen wél.

**Waarom dit geen dekkingsgat is, en waar het wél op knelt.** De PR-run toetst
het samenvoegresultaat, dus de inhoud die op `main` belandt ís getoetst — mits
de basis niet is opgeschoven, en dat is precies waarom de achterstand-poort
hierboven bestaat. Wat er wél knelt is het lezen: **de laatste Tests-run op
`main` gaat niet per se over wat er nu op `main` staat.** Op 03-09 stond daar
een rood kruis van een commit die al twee merges oud was.

Dat is dezelfde fout als de Cloudflare-bot met zijn "✅ Deployment
successful" (§11, #35): een melding is een waarneming, geen conclusie. Toen
kostte het drie PR's aan documentatie die niets verbeterde; nu is het één
regel in `CLAUDE.md` en de wetenschap dat je *Tests* met de hand via
`workflow_dispatch` op `main` kunt starten als je het echt wil zien.

### De schil had geen scherm voor "de app laadt niet" — 03-09-2026 (opgelost)

Gevonden bij de Play Store-ronde, en het is een blinde vlek die er vanaf de
eerste APK in zat.

`capacitor.config.json` zet `server.url` op `https://app.pidlane.nl`. De APK is
dus een schil om een live site: alles wat je ziet komt van die URL. Dat is een
bewuste keuze en hij is goed — een wijziging in de webcode staat meteen op elk
toestel, zonder nieuwe build. Wat er niet bij bedacht was, is wat er gebeurt
als die URL níét komt.

**Dan neemt de Android-WebView het over**, met zijn eigen foutpagina:
`net::ERR_NAME_NOT_RESOLVED` op een wit vlak. Er staat geen naam op, geen
uitleg, geen knop. Wie dat ziet concludeert niet "ik heb geen internet" maar
"deze app is stuk", en er is geen tweede scherm dat hem op andere gedachten
brengt.

De gevallen waarin dit gebeurt zijn niet exotisch: vliegtuigmodus, een
parkeergarage, een gastnetwerk dat eerst om een inlogpagina vraagt, of
Cloudflare die even stil is. Voor een Play-reviewer op een kantoornetwerk is
het laatste geval genoeg om de app als kapot af te schrijven — en dat is een
afwijzing waar weken op gewacht wordt, op een oorzaak die niets met de app te
maken heeft.

**Waarom dit niet eerder opviel.** Elke test die er is draait op een machine
mét netwerk. `plbrowser.sh` start de echte `index.html` in Chromium, en die
laadt van schijf. De browserproeven meten dus de app, nooit de schil eromheen.
Dat is geen gat in de proeven maar in de vraag: er wás geen proef die "en als
er niets komt?" stelde.

**Wat er nu staat.** `server.errorPath` wijst naar `error.html` in de webDir;
Capacitor laadt dat bestand zodra de hoofdpagina niet komt. `build-apk.yml`
schrijft die pagina naast de bestaande stub. Hij noemt `app.pidlane.nl` bij
naam, geeft drie dingen om te proberen, zegt erbij dat de adapter zelf geen
internet nodig heeft — dat is de vraag die een gebruiker hier stelt — en heeft
een knop die herlaadt.

De pagina haalt **niets** van het net. Geen lettertype, geen stylesheet, geen
plaatje. Dat klinkt vanzelfsprekend en is het niet: precies deze fout hield de
browserproef maandenlang tegen, waar één `<link>` naar Google Fonts in de
`<head>` ervoor zorgde dat elk `<script>` op openstaande CSS bleef wachten die
zonder internet nooit kwam. Een foutpagina met een externe verwijzing laadt
niet op het enige moment waarop hij getoond wordt.

**Wat de gate hiervan wél en niet kan zien.** De naam `error.html` staat op
twee plekken — in `capacitor.config.json` en in `build-apk.yml` — en dat is de
vorm waar dit project al drie keer op is stukgelopen. `test-foutpagina.js`
koppelt ze: hij haalt de heredocs uit de workflow, kijkt of het bestand dat
`errorPath` noemt er echt bij zit, en toetst dat de pagina zelfstandig is.
Drie mutaties in `plmutate.sh` houden dat scherp.

Wat hij **niet** kan zien is of Capacitor die pagina ook werkelijk laadt. Dat
is de werking van de schil, niet van deze repo, en het vraagt een APK op een
toestel zonder netwerk. Het stond daarom als stap A in `CAMPAGNE`.

**GEMETEN OP 03-09-2026 OM 20:16 — hij werkt.** Vliegtuigmodus aan, app koud
gestart op de APK van build #424: het eigen scherm verschijnt. Kop "Geen
verbinding", `app.pidlane.nl` bij naam genoemd, de drie dingen om te proberen,
de regel over Bluetooth, en de knop "Opnieuw proberen". Geen wit vlak, geen
`net::ERR_`. De tekst staat bovendien netjes onder de statusbalk, dus de
`viewport-fit`-regel doet ook wat hij moet.

Daarmee is de laatste onbewezen aanname van deze reeks weg. Dat is het
vermelden waard, want de weg ernaartoe was leerzamer dan de uitkomst: de
eerste proef, om 18:45, tóónde de kale WebView-fout. De verleiding was toen om
te concluderen dat `errorPath` niet werkt. Wat er werkelijk aan de hand was,
stond twee lagen dieper — de build kwam nooit bij de telefoon (zie het kopje
hieronder). **Een mislukte proef is een waarneming over de hele keten, niet
over het ding dat je aan het toetsen was.**

### De featureschakelaar dekte één van twee knoppen — 03-09-2026 (opgelost)

`FEATURE_TOGGLES.feat_demo` in `pidlane-fuel.js` noemde één selector:
`[id="btnDemo"]`, de demoknop in het verbindscherm. Op 21-08 kwam er een tweede
demoknop bij, `#btnDemoLogin` op het loginscherm, en wel om een goede reden:
een reviewer zonder account zag daarvoor alleen een loginformulier. Die knop
werd toen niet aan deze lijst toegevoegd.

Het gevolg is de vervelendste soort: niet kapot, maar half. Met `feat_demo` op
`false` in de AppConfig-tabel verbergt `applyFeatureToggles()` de ene knop en
laat de andere staan. Die andere doet dan niets meer dan een toast tonen —
`plDemoZonderLogin()` weigert immers netjes. Een zichtbare knop die niets doet
is voor een reviewer erger dan een knop die er niet is: de reviewnotitie wijst
er letterlijk naar, dus hij zoekt hem, vindt hem, en drukt op iets doods.

**Het patroon erachter is bekend in dit project**: één ding, twee plekken. De
demoknop is één functie met twee ingangen, en er was één plek die dat wist en
één die het niet wist. Aan of uit mag de beheerder bepalen; half niet.

**Twee toetsen, en ze doen expres iets anders.**
`test-demo-toegang.js` leest de lijst en eist dat beide id's erin staan — dat
vangt de fout zoals hij ontstond. De nieuwe proef in blok 5 draait de
schakelaar in de draaiende app werkelijk om en kijkt wat de gegenereerde CSS
raakt. Dat is het geval dat de eerste niet ziet: een selector die netjes in de
lijst staat maar niets treft, doordat een id hernoemd is of een specifiekere
regel hem overstemt.

### De reviewnotitie stond even in twee bestanden — 03-09-2026

Klein, maar het hoort hier omdat het dezelfde fout is als twee eerdere.

Bij het opstellen van `PLAY-INZENDING.md` — het kopieerdocument voor de Play
Console — kwamen de reviewnotitie, de Data safety-tabel en de afvinklijst in
dat nieuwe bestand te staan terwijl ze ook in `ANDROID-PLAYSTORE.md` bleven.
Twee lijsten van hetzelfde, en dat is precies waar `PIDLANE-WERK.md` (27-08) en
§11 zelf (02-09) op zijn stukgelopen.

Bij een reviewnotitie is de schade bovendien uitgesteld en gericht: je merkt
pas dat de twee uit de pas lopen wanneer een reviewer een knop zoekt die sinds
de vorige ronde anders heet. Dan staat er in het ene bestand de oude tekst, in
het andere de nieuwe, en in de Console wat je toevallig het laatst hebt
geplakt.

**Opgelost langs de regel die er al stond.** `PLAY-INZENDING.md` draagt de
tekst, `ANDROID-PLAYSTORE.md` de redenering eromheen — wat er tussen jou en een
goedkeuring staat, waarom een keuze zo gemaakt is, wat er misging. Het tweede
verwijst naar het eerste en herhaalt het niet.

**Wat hier het vermelden waard is: de gate ving het zelf.**
`test-demo-toegang.js` las de belofte "Try demo — no adapter needed" uit
`ANDROID-PLAYSTORE.md` om te toetsen dat de knoptekst in `index.html` er
woordelijk gelijk aan is. Zodra die tekst verhuisde werd die toets rood, met de
naam van de controle erbij. Dat is het verschil tussen een koppeling die
bewaakt wordt en een afspraak die op oplettendheid draait — en het is de reden
dat die toets nu naar het nieuwe bestand wijst in plaats van dat de controle is
weggehaald.

### De buspoort: drie vormen die hetzelfde deden — 03-09-2026 (#115/#116/#117)

Drie issues die uit #15 zijn losgemaakt, en alle drie hetzelfde patroon: niet
twee plekken die hetzelfde moeten *weten*, maar twee vormen die hetzelfde
moeten *doen*. Geen van drieën had een bekende bug onder zich — dat stond ook
zo in de issues. Bij twee van de drie bleek er tóch een te zitten, en bij geen
van beide waar het issue hem zocht. Dat is de reden dat deze drie hier samen
staan en niet als drie losse regels: het is één les.

**#115 — vijf handgeschreven sloten.** De pollus, de monitor, de waakronde, de
uitgebreide probe en een hersteltik in blok 10 claimden `PLBus` zelf, elk met
een eigen `finally`. Wat een handgeschreven `finally` fout kan doen is precies
één ding: hem vergeten. En een houder die nooit vrijgeeft valt buiten élke
noodrem die `PLBus` heeft — `MAX_HOLD_MS` breekt hem pas na drie minuten open,
en `WACHT_MAX_MS` (#98) gaat over wáchters, niet over houders.

`withBusOfNiets()` staat nu naast `withBus()`. Dat is geen tweede vorm maar de
tweede *helft*: de vijf plekken wachtten bewust niet, want het zijn ronde-lussen
die elke tik terugkomen, en wachten zou de bus dichthouden voor werk dat over
100 ms net zo goed kan. De hersteltik in blok 10 wilde juist wél doorgaan op een
bezette bus — die meet hoe snel de bus na een trap herstelt, en een meting náást
een andere lezer is óók een meting — en gebruikt `withBus` met wachttijd 0.
`wait()` heeft daarvoor een afslag gekregen: eenmalig proberen, geen plek in de
wachtrij (wie niet wacht hoort geen voorrang te krijgen), en geen "niet vrij na
0 ms" in het logboek, want er is niet gewacht.

**#116 — de meetlat mat naast.** Acht plekken zochten zelf naar een
41-antwoordkop in plaats van via `splitBatchResponse()`. Dat was de meting van
blok 11, en die klopte niet: hij liep een met de hand bijgehouden lijstje
bestandsnamen af, en `pidlane-testrun.js` en `pidlane-voertuigdata.js` stonden
er niet in. Het waren er elf over zeven modules. De inventarisatie die de maat
moest zijn, was zélf de tweede lijst waar `CLAUDE.md` voor waarschuwt — nu leest
blok 11 de `<script>`-regels van `index.html`, en dat is de enige lijst die niet
kan verouderen: staat een module er niet in, dan draait hij ook niet.

En er zat één echte fout onder. **PID `A6` (odometer) ontbrak in
`PID_BYTE_LEN`**, dus `pidByteLen('A6')` viel terug op de bodem van één byte.
Zolang `pidlane-veldlab.js` dat PID met de hand uitpakte viel dat niet op — die
las de vier bytes zelf met `slice(i+4, i+12)`. Door de helper is die ene
ontbrekende tabelregel het verschil tussen 248.000 km en 24 km. Dít is wat het
issue bedoelde met "een vorm die er een kan verbergen", en het is leerzaam dat
het omgekeerd uitpakte van wat je verwacht: het uitpakwerk zelf was niet fout,
de tabel eronder was leeg, en de eigen kopie dekte dat toe.

**#117 — vier beslissingen, zesentwintig keer genomen.** De basis-URL, de kop
`X-App-Token`, wat er bij een 401 gebeurt, en of er iets gelogd wordt. Ook hier
telde blok 11 te laag (achttien over zeven; `bt`, `recall`, `uihelpers` en
`testrun` ontbraken in het lijstje). `plFetch()` in `pidlane-plfetch.js` neemt
die vier en géén vijfde: hij geeft de gewone `Response` terug, want 410 betekent
"code verlopen" bij remote, 402 "onvoldoende tegoed" bij de AI-haak en 429 "te
veel pogingen" bij het inloggen. Die betekenis hoort bij de aanroeper. De winst
waar het issue om vroeg is meteen zichtbaar: `X-PidLane-Saldo` komt op élk
antwoord van de Worker mee en werd op één plek uitgelezen — nu gaat elk antwoord
langs `PLCredits.volgServer()`.

**Wat er bewust NIET gerepareerd is, met de reden.**

- **Drie DTC-decoders.** `realScanDTC()` in `pidlane-graph.js`, `_parseDTC()` in
  `pidlane-monitor.js` en `_svDtc()` in `pidlane-veldlab.js` ontleden alle drie
  een mode-03-antwoord, elk op hun eigen manier. Dat is #116 één mode verderop.
  `splitBatchResponse()` kan het niet overnemen: zijn sleutels zijn `'01'+suffix`
  en zijn lengtetabel is `PID_BYTE_LEN` — hij spreekt alleen mode 01. Een eigen
  helper ernaast is een sessie op zich, en één onderwerp per PR.
- **De freeze frame van de monitor** (`indexOf('42'+pid)`) om dezelfde reden:
  mode 02. Blok 11 telt die twee sinds deze ronde apart, als stand en niet als
  bevinding, zodat het zichtbaar blijft zonder elke rit als LET OP te melden.
- **`_bitAan()` in `pidlane-testrun.js`** zoekt wél naar een 41-kop, maar naar
  een *samengestelde* (`'41'` plus het bitmapnummer) in een antwoord dat
  meerdere bitmapblokken kan dragen. `splitBatchResponse()` parseert sequentieel
  en stopt bij het eerste blok dat niet in de verwachtingslijst staat — hij zou
  dat tweede blok dus niet vinden. Daar zou de reparatie een regressie zijn.
- **Het inlezen van eigen bronbestanden** door blok 11 (`_bron()`) blijft een
  kale `fetch()`: geen server, geen token, geen basis-URL. Zou dat door
  `plFetch()` lopen, dan kreeg elke bestandsnaam er `PROXY_URL` voor geplakt.

**De les die overblijft** is niet "trek dubbele code samen". Dat wisten we. Het
is dat een *inventarisatie van dubbele code zelf ook dubbele code is*: blok 11
hield twee lijstjes bij van bestanden die het moest bekijken, en allebei liepen
ze achter. Een telling die naast meet is erger dan geen telling, want hij ziet
er groen uit. Beide lijstjes komen nu uit de app zelf.

### De verwijderroute stond in de tekst maar niet in het menu — 03-09-2026 (#69)

**Waar het over ging.** #69 meldde dat "👤 Mijn account" ontbreekt in het
kebabmenu bij rol `user`. Nagemeten in de draaiende app, alle vier de rollen
door `pasMenuAan()`: bij `klant` staat het item er, bij `admin`, `user` en
`demo` niet. Dat is geen defect maar de reparatie van 29-08 bij #49 — een
beheeraccount heeft geen record in `Klanten` en geen tegoed, dus het item
opende een scherm dat alleen kon uitleggen dat er niets te zien was. Met #49
op 03-09 vastgelegd is dit het bedoelde gedrag, en #69 is op die grond
gesloten.

**Wat er wél stuk was, en niet in het issue stond.** De privacytekst zei tegen
íédereen: *"Je account verwijder je onder Mijn account met de knop Account
verwijderen."* Die knop staat in `openMijnTokens()` achter dezelfde
`isKlant()`-poort. Personeel las dus een route die voor hem niet bestaat.

Dat is exact de fout van #41 — toen beloofde `privacy.html` "verwijder je via
Mijn account" terwijl die knop nergens bestond — alleen nu voor één groep in
plaats van voor iedereen. En het is een fout die pas ontstond doordat het menu
per rol ging verschillen: de tekst is niet meeverhuisd met de poort die eronder
kwam. **Een tekst die naar een knop wijst, hoort dezelfde voorwaarde te dragen
als die knop.**

`_verwijderTekst()` in `pidlane-privacy.js` splitst nu op `isKlant()`: een
klant krijgt de knop en de bewaartermijn, personeel krijgt de publieke pagina
`app.pidlane.nl/verwijderen` — die bestaat al en legt uit hoe het zonder de app
gaat. Bewust een functie en geen tweede vaste tekst: twee zinnen die allebei
"de verwijderroute" heten is dezelfde valkuil een trede lager.

Blok 8 van `test-account-verwijderen.js` laadt die functie en toetst beide
takken, met de tegenproef erbij (verschillen ze werkelijk?) en met wat voor
állebei moet gelden: het wissen op het toestel mag bij het splitsen niet uit
één van de twee vallen. `plmutate.sh` zet de rolsplitsing uit en de test wordt
dan rood.

### Recorder en logboek liepen op twee klokken — 03-09-2026 (#17)

**Wat er gebeurde.** De bulk-recorder bouwde zijn sessie-id met
`toISOString()`, dus in UTC, terwijl `log()` ernaast lokale tijd schrijft. Uit
de rit van 02-09, twee regels over hetzelfde moment:

```
{"ts":"23:16:03", ... "msg":"📼 bulk-recorder gestart (blk-2026-09-02T21-16-03-568Z)"}
```

Zelfde seconde, twee uur verschil. Wie die twee bestanden naast elkaar legt
concludeert eerst dat ze niet bij elkaar horen — en dat is precies wat er twee
keer gebeurde.

**De fout zat niet in de opslag maar in het etiket.** De blokken van de
recorder dragen `van`/`tot` als epoch-milliseconden, en het app-log draagt
`t: Date.now()` naast zijn `ts`. Allebei volgen ze
`PIDLANE-CONTRACT.md` §6 gewoon. Wat scheefliep was de omrekening naar een
kloktijd die de gebruiker leest: die gebeurde één keer in UTC en één keer
lokaal.

Er is nu één plek waar epoch naar kloktijd gaat: `plStempelLokaal()` en
`plDatumLokaal()` in `pidlane-uihelpers.js`. De `Z` is eraf — die letter
betekent UTC, en dat was de leugen in de oude naam.

**Wat er nog niet mee opgelost is.** Vijftien andere plekken bouwen een
exportbestandsnaam met `toISOString().slice(0,10)`, en die geven om half één
's nachts de datum van gisteren mee — `pidlane-fuel.js`, `pidlane-rit.js`,
`pidlane-koopcheck.js`, `pidlane-caravan.js`, `pidlane-dossier.js` en
`pidlane-rijsituatie.js` onder meer. Dat is dezelfde fout, maar het overzetten
is mechanisch werk over zes bestanden, en dat hoort niet in dezelfde commit als
een gedragswijziging. Het `export`-veld ín het bulkbestand blijft bewust
`toISOString()`: dat is machinegegeven met een `Z` erachter en dus ondubbelzinnig.

**Waarom een browserproef en niet alleen een node-test.** Een CI-runner staat
op UTC, en dáár geeft `toISOString()` precies dezelfde tijd als de lokale klok:
de fout is er onzichtbaar. `test-tijdklok.js` zet daarom `process.env.TZ` vóór
de eerste `Date` en toetst de helpers op vaste momenten, met de oude vorm
ernaast als tegenproef. `bproef-tijdklok.js` doet hetzelfde een laag hoger: hij
zet `TZ` vóórdat Chromium start — die variabele erft de browser mee — start de
echte recorder met een echte IndexedDB eronder, en legt het sessie-id naast de
regel die `log()` op datzelfde moment schreef. Zonder die tijdzone meet geen
van beide iets.

**En blok 5 is van melder naar toets geworden.** De proef meldde tot nu toe
alleen dát er verschil was. Hij vergelijkt nu het sessie-id met
`plStempelLokaal(st.gestart)` — het epoch-moment waarop de recorder begon, dat
`PLBulk.status()` daarvoor is gaan meegeven. Niet met de klok van dít moment:
de recorder kan uren eerder begonnen zijn, en dan zou elke proef falen om de
verkeerde reden.

### "ABS. MOTO" is geen naam — de afkorter kapte het verkeerde weg — 03-09-2026 (#95)

**Wat er gebeurde.** `hudShortLabel('Abs. motorbelasting')` gaf `ABS. MOTO`.
Stap 3 van die functie zette het eerste woord op zes tekens en het tweede op
vier; van `["ABS.", "MOTORBELAST"]` bleef daardoor de bepaling heel en werd de
grootheid afgekapt — precies andersom dan je wilt. Op de tellerplaat stond dat
fragment naast `MOTORBELAST` van 0104: twee meters die hetzelfde meten, waarvan
er één een naam had.

**Hoe groot het was.** Niet één naam. Alle 146 PID-namen zijn in de draaiende
app door de functie gehaald: **45 daarvan eindigden midden in een woord**
(`TURBOD (RAU`, `WARMLO SIND`, `RAILDR (REL`, `O2-SEN AANW`, …). Na de
reparatie is dat er **één**: `Referentiekoppel` → `REFERENTIEKOP`. Dat is één
samengesteld woord zonder woordenboektreffer, en daar valt niets weg te laten —
afkappen is dan het enige wat rest.

**Twee ingrepen, allebei klein.**

1. *De grens is een parameter geworden.* Elf tekens is de maat van de
   HUD-hoekmeter: één regel, smal. De tellerplaat heeft er twee
   (`-webkit-line-clamp:2`) en gaf met diezelfde elf de helft van zijn ruimte
   weg. `hudShortLabel(name, max)` gebruikt elf als je niets meegeeft, dus de
   HUD verandert niet.
2. *Stap 3 verdeelt de ruimte anders.* Het laatste woord noemt de grootheid en
   krijgt de ruimte eerst; wat overblijft is voor de woorden ervoor, en onder de
   drie tekens korten we niet in. Reikt de opsomming in stap 4 niet tot dat
   laatste woord, dan is dat woord alleen het antwoord — `MOTORBELAST` is een
   naam, `ABS.` niet.

**De grens van de plaat is gemeten, niet gekozen.** Bij zeven meters is een
kolom 54px breed en staat de naam op 8,5px. Elke uitkomst is in het echte
element opgemeten:

| grens | namen die niet in twee regels passen |
|---|---|
| 11 t/m 13 | 0 |
| 14 | 3 (`LAM DOELWAARDE`, `ETH PERCENTAGE`, `NOX DOSEERPOMP`) |
| 16 | 13 |
| 20 | 50 |

Dertien is dus de ruimste grens die de plaat draagt, en dat is `SLIM_METER_MAX`
in `pidlane-pids.js`. `bproef-plaatnamen.js` bewaakt hem met de tegenproef
erbij: bij één teken meer moet er wél iets uitvallen. Wordt de grens ooit te
laag gezet, dan zegt die proef dat met de gemeten waarde erbij in plaats van
groen te blijven.

**Wat er niet mee opgelost is.** Bij 0104 en 0143 komen beide korte namen op
`MOTORBELAST` uit, en dan valt `slimMeterLabels()` met opzet terug op de
volledige naam — "leesbaar verkeerd is erger dan lang". Die volledige naam
(`Abs. motorbelasting`) loopt over drie regels en wordt na twee afgekapt, met
een beletselteken. Dat is beter dan wat er stond — `ABS. MOTO` zag er compleet
uit en was het niet — maar het is geen volledige oplossing: op 54px past die
naam gewoon niet. De proef in blok 5 telt dat geval apart en meldt het als
waarneming, niet als fout, zodat het zichtbaar blijft zonder de proef
permanent rood te zetten.

**Waarom er zowel een browserproef als een blok 5-proef is.**
`bproef-plaatnamen.js` meet alle 146 namen, maar op de standaardtekstgrootte,
in één vensterbreedte, met een demo-auto. De proef in blok 5 meet de plaat
zoals hij op dat moment is: de sensoren die déze auto levert, de tekstgrootte
die de gebruiker koos (S/M/L schaalt de hele app) en het lettertype van dat
toestel. Dat is een andere vraag, en alleen daar te stellen.

**Terzijde, gemeten en niet gebruikt.** Het label van de HUD-hoekmeter is op
een 412px-scherm 107px breed bij 7,4px lettergrootte; daar past vijftien tekens
op één regel. De elf van de HUD is dus zelf ook aan de krappe kant. Niet
aangeraakt: `.hudMini` is 26% van de HUD-breedte en de lettergrootte is een
`clamp()`, dus op een smaller toestel valt die ruimte weg. Wie dat wil
verruimen, meet het eerst op het smalste toestel dat telt.

### Onderste vellen vielen achter de Android-knoppen — 03-09-2026 (#71)

**Wat er gebeurde.** De demo-autokiezer liet zijn kentekenveld en Start-knop
half achter de drie Android-navigatieknoppen vallen. `openDemoCarChooser()`
bouwt `#demoCarModal` met een eigen `style.cssText`, los van de
`.modal`-klasse, en droeg nergens `--pl-sab`. De #58-ronde van 01-09 gaf
veilige marge aan `.app`, `body`, `#fabLane`, `.ov`, `.modal` en de
bottom-sheets — dit vel zat daar niet bij, omdat het met inline styles is
gebouwd en geen klasse draagt.

**Wat de conclusie in het issue miste: het waren er drie.** Het issue vroeg na
te kijken of `openDemoCarChooser()` de enige met dit patroon is. Dat is niet
met `grep` beantwoord maar gemeten, in `plbrowser.js` met de insets aan zoals
Capacitor ze op Android zet (`--safe-area-inset-bottom: 48px`), door elk vel te
openen, helemaal naar beneden te scrollen en de laagste knop op te meten:

| vel | ruimte onder de laagste knop | nodig |
|---|---|---|
| `openDemoCarChooser` (#demoCarModal) | 14px | 48px |
| `openSituatie` (#situatieSheet) | 12px | 48px |
| `openVehicleOverview` (#vehOverview) | 12px | 48px |

Alle drie dus, en alle drie om dezelfde reden: `align-items:flex-end` met een
vaste `padding` onderin. De reparatie is per vel één waarde —
`calc(14px + var(--pl-sab))` op de scrollende `div` bij de demo-kiezer, en
`calc(12px + var(--pl-sab))` op de voetbalk bij de andere twee. Nagemeten:
62px, 60px en 60px.

**En een conclusie die fout bleek.** `test-schermranden.js` sloot de
onderaan-uitschuivende vellen bewust uit, met deze reden:

> Gecentreerde dialogen en onderaan-uitschuivende vellen staan er BEWUST niet
> in: daarboven of -onder blijft alleen de halfdoorzichtige achtergrond staan,
> en die mag prima onder de statusbalk doorlopen.

Voor een gecentreerde dialoog klopt dat. Voor een onderste vel niet: dat staat
op `flex-end`, ligt dus zélf tegen de onderrand, en er blijft daaronder geen
achtergrond over. Die regel is herzien in de kop van `test-schermranden.js`,
niet weggehaald.

**Waarom dit een gedragsproef werd en geen broncontrole.**
`test-schermranden.js` leest de bron en vraagt of `var(--pl-sab)` in de buurt
van een declaratie staat. Dat zegt niets over de vraag die telt — is de
onderste knop te raken? — en in een gewone browser is `--pl-sab` 0px, dus
zonder insets ziet elk vel er goed uit. `bproef-schermranden.js` meet het in de
draaiende app, met een eigen tegenproef: hij zet de marge bij één vel terug op
een vast getal en toetst dat de meting dan rood wordt.

### Verbergen is geen uitzetten — 02-09-2026

**Wat er gevraagd werd:** scheiding tussen de PID-keuze en de live view. "Nu is
PID-keuze altijd ook een weergave in live view."

**Wat eronder zat.** Een dubbeltik op een tegel riep `pidDeselect()` aan, en
die deed twee dingen tegelijk: de PID uit `activePIDs` halen én de tegel van
het scherm halen. Het eerste is duur en onzichtbaar — de pollus vraagt de PID
niet meer, `pidHist` loopt leeg, de rit-opname en de analyse missen hem — en
het tweede is wat de gebruiker bedoelde. Je klikte een tegel weg omdat hij in
de weg stond, en je verloor er stilletjes een meting mee. De toast zei "uit —
aanzetten via sensorkeuze", en dat is waar, maar het leest als een
schermhandeling.

Nu zijn het twee dingen, met één regel voor de gebruiker: **dubbeltik wisselt
de zichtbaarheid, waar je hem ook doet.** Op een tegel verbergt hij, op een
naam in de strook onderaan haalt hij hem terug. Uitzetten is een aparte,
benoemde handeling geworden: het kruisje in die strook, of het keuzescherm.

| | raakt `activePIDs` | er wordt gemeten | tegel in beeld |
|---|---|---|---|
| verbergen (dubbeltik) | nee | ja | nee |
| uitzetten (✕ of keuzescherm) | ja | nee | nee |

**De strook moest er zijn, niet alleen de scheiding.** Verbergen zonder
zichtbare weg terug is een put: je klikt iets weg en het bestaat niet meer.
Daarom de opsomming onderaan, met korte namen (`hudShortLabel()`, dezelfde als
de tellerplaat gebruikt) en een "Alles tonen" ernaast — met tien verborgen
tegels is tien keer dubbeltikken geen weg terug.

**De kop van die strook zegt "wordt nog gemeten", en dat is geen versiering.**
Zonder die zin is "verborgen" niet van "uit" te onderscheiden, en dan is er
niets opgelost maar alleen verplaatst: iemand verwacht een snellere pollus, of
schrikt van een analyse die een sensor noemt die hij dacht te hebben
uitgezet. Dezelfde zin staat in de toast. `test-verbergen.js` toetst dat hij
er staat — een melding die de helft van de waarheid vertelt is hier al eerder
een bug geweest.

**Waar dit stil fout had kunnen gaan.** Een PID die je verbergt en daarna via
het keuzescherm uitzet, laat een verborgen-stand achter. Vink je hem later
opnieuw aan, dan verschijnt er geen tegel en zegt niets waarom. Dat wordt
opgeruimd in `renderGauges()` en niet in `togglePID()` c.s.: er zijn vier
paden die de selectie wijzigen (keuzescherm, standaardset, categorie, preset)
en dit is de plek waar ze alle vier langskomen.

Tweede plek: klik je *alles* weg, dan stond er "Geen sensoren geselecteerd".
Dat noemt de verkeerde oorzaak — ze zijn wél geselecteerd en ze worden gemeten
— en het stuurt je naar het verkeerde scherm om het op te lossen.

**En één die de test bijna niet had gezien.** De DOM-nabootsing in
`test-verbergen.js` onthield elk element dat ooit was aangemaakt, en
`getElementById()` gaf dat ook terug nadat het rooster opnieuw was opgebouwd.
`slimHerweeg()` hing zo'n weggegooide tegel netjes terug in een vak, en de
toets "de tegel is weg" stond groen op een tegel die in de browser niet meer
bestaat. `innerHTML=''` koppelt de kinderen nu ook echt los en
`getElementById()` geeft alleen terug wat nog aan het document hangt. Dat is
dezelfde soort fout als de `appendChild` van gisteren: **een nabootsing die
soepeler is dan de browser bewijst niets.**

**Alleen voor deze sessie.** `hiddenPIDs` staat in het geheugen en wordt niet
bewaard. Bewaren per auto is #94, met de vragen die daarbij horen: waar hoort
een verborgen PID als je een andere auto aansluit, en wat gebeurt er bij een
gewiste opslag. Een herstart geeft dus alle tegels terug, en dat is hier de
veilige kant — een tegel die je een maand geleden hebt weggeklikt en niet meer
kent, is erger dan een tegel te veel.

**Wat het níét sneller maakt.** Verbergen scheelt niets in de pollus: de PID
wordt gewoon gevraagd. Wil je de ronde korter, dan is dat de sensorkeuze. Dat
is precies waarom die twee nu uit elkaar staan.

### Fase 2 van de slimme weergave komt er niet — besluit 03-09-2026 (#94)

**Wat er gevraagd was.** Tegels met de hand groot/klein/verbergen kunnen zetten,
bewaard per auto. De tweede helft van de fijnafstemming van 02-09; fase 1
(`slimMaat()`, het vak "Rustig", korte namen op de tellerplaat) staat er wél.

**Het besluit is: niet bouwen.** De automatische indeling voldoet. Dat scheelt
blijvende staat per voertuig — en daarmee de vraag wat er gebeurt bij een andere
auto, een gewiste opslag of een nieuwe versie, het patroon dat bij #86 een vals
alarm opleverde. Het scheelt ook een vijfde modus op een scherm dat er al vier
draagt plus de waakronde.

**Wat hier bewaard moet blijven is niet de wens maar de grenzen.** Dit is het
deel dat over een half jaar opnieuw ter tafel komt, en dan hoort de redenering
er nog te staan:

- **Geen schakelaar auto/handmatig.** Twee standen maken twee bronnen voor één
  scherm, en dan is onbeantwoordbaar waar een sensor hoort die vanavond nieuw
  ontdekt wordt: in de handlijst staat hij niet, dus hij valt nergens. Wie dit
  ooit bouwt, doet het als *uitzonderingen bovenop de automaat* — automatisch
  rekent altijd, alleen de afwijkingen worden bewaard.
- **Geen min/max met de hand.** Het puntje op een tegel is een
  veiligheidsoordeel uit `dH`, `wH` en `PID_HARD_LIMITS`. Een handmatige grens
  die een tegel groen kleurt is het gevaarlijkste knopje dat deze app zou
  kunnen krijgen. Wat er onder die wens zit is #66 (de grove schaal), en het
  betere antwoord daarop is het *waargenomen* bereik per auto leren.
- **Geen keuze tussen trend liggend of staand.** Liggend betekent "marge tot de
  grens", staand "stand binnen het bereik". Dat verschil draagt betekenis; een
  gebruiker die het omzet breekt het stilletjes.
- **Geen actief/niet-actief in een bewerkscherm.** Dat is de PID-keuze, en een
  dubbeltik op een tegel doet het al (zie "Verbergen is geen uitzetten"
  hieronder). Een derde deur naar dezelfde kamer.

**Wat er wél openstaat en er los van is.** Bij een naambotsing valt
`slimMeterLabels()` terug op de volledige naam, en die loopt op een kolom van
54px over drie regels en wordt na twee afgekapt. Gemeten bij #95, en dat is een
vraag over die terugval — niet over of tegels met de hand verzet moeten kunnen
worden.

### De maat van een tegel volgt zijn gedrag — 02-09-2026 (#61, #68)

**Wat er gevraagd werd:** fijnafstemming van de slimme weergave. Concreet:
"brandstofpeil is zeer statisch, die hoeft niet zo groot in beeld", en de vraag
of het scherm zichzelf moet indelen of dat er een bewerkknop moet komen.

**Wat eronder zat.** `slimGroep()` deelde in op wat voor SOORT signaal iets is,
en die soort bepaalde meteen de maat: `dash` betekende 30 px. Een brandstofpeil
dat een uur lang 68 % aanwijst kreeg daardoor het grootste cijfer van het
scherm, terwijl een MAF die op 2,00 g/s vastligt er even opgewekt bij stond als
een koelwater dat klimt. De indeling was niet fout — hij beantwoordde alleen
één vraag (*wat voor signaal is dit?*) en niet de tweede (*hoeveel zegt het
nú?*). De vorm hoort bij de soort, de maat bij het gedrag; dat waren twee
vragen die aan één antwoord vastzaten.

`slimMaat()` beantwoordt de tweede. Drie uitkomsten, en **de volgorde van de
regels is de hele beslissing:**

| volgorde | regel | waarom |
|---|---|---|
| 1 | oordeel op `warn`/`danger` → **groot** | een waarde die vastligt maar op oranje staat is het gevaarlijkste geval dat er is |
| 2 | minder dan 24 metingen → **normaal** | "ligt hij stil?" is een uitspraak over wat er níét gebeurde, en die is pas iets waard na lang genoeg kijken |
| 3 | beweegt niet → **regel** | één regel in het nieuwe vak "Rustig" |

Zou regel 1 ná regel 3 komen, dan zakt een brandstoftrim die op +25 % blijft
plakken naar één regeltje omdát hij niet beweegt. Dat is geen randgeval maar
precies het beeld van een storing: een regelkring die vastloopt beweegt niet
meer. `plmutate.sh` draait die volgorde om en `test-slimmeweergave.js` wordt
daar rood van.

**SLIM_MAAT_MIN is bewust 24 en niet 4.** `SLIM_BEWEEG_MIN` (4) hoort bij een
andere vraag. "Beweegt hij?" is met vier metingen te beantwoorden — je ziet
beweging of niet. "Ligt hij stil?" niet: dat is een bewering over afwezigheid,
en vier metingen die toevallig gelijk zijn bewijzen niets. Tot dat aantal
gehaald is, is de maat `normaal` — de veilige kant, net als bij de allowlists
van `slimGroep()`.

**Omhoog mag altijd, omlaag alleen bij de herweging.** Dit is de regel die het
scherm leesbaar houdt, en hij is asymmetrisch met opzet. Er is één herweging
per opbouw (30 s na het tekenen); daarna staat de indeling stil. Uitzondering:
een tegel die uit "Rustig" omhoog moet, gaat meteen. De aanleiding is concreet
— zet je de app aan terwijl de auto stilstaat, dan is de snelheid 0 en ligt hij
stil, en zonder deze uitzondering zou de snelheid de hele rit een regeltje
blijven. Andersom is er geen haast: dat iets stil is komen te liggen is opmaak,
en een tegel die tijdens het rijden van vak wisselt is onleesbaarder dan een
tegel met het verkeerde formaat. Zonder de asymmetrie zou een signaal dat op de
grens van "beweegt" balanceert heen en weer springen tussen twee vakken.

**Waarom verplaatsen en niet opnieuw tekenen.** `slimPlaats()` verhuist het
bestaande element met `appendChild`. Een `renderGauges()` zou alle tegels
weggooien en terugbouwen, en dan is elke sparkline, elke balkstand en elke
tooltip opnieuw gezet voor één tegel die van vak wisselt. Het DOM-model in
`test-slimmeweergave.js` bootste dat aanvankelijk verkeerd na: het duwde het
element in de nieuwe ouder zonder het bij de oude weg te halen, zodat een tegel
in twee vakken tegelijk had kunnen staan zonder dat de test dat merkte. Dat is
nu gerepareerd én het is een eigen toets — een groene test die iets bewijst wat
de browser nooit doet, is erger dan geen test.

**De tellerplaat: korte namen, en nooit twee keer dezelfde (#68).** Vijf
gaspad-signalen pasten niet naast elkaar; de vijfde viel op een tweede rij en
de namen werden afgekapt tot `MOTORTOE…`, `GASKLEP P…` en `ABS. MOTO…`. Een
plaat waarop je niet ziet wélke meter je leest doet precies niet wat #68 vroeg.
Afkorten doet `hudShortLabel()` al voor de HUD — op betekenis en niet op
tekenaantal — dus dat is hergebruik en geen tweede lijst.

Wat er wél bij moest is een garantie die de HUD niet nodig heeft: **op één
plaat mogen twee meters nooit dezelfde naam dragen.** "Gaspedaal positie D" en
"... E" korten allebei af tot `GASPED POS`. Bij een botsing valt de hele groep
terug op de volledige naam — de hele groep, niet alleen de tweede, want één
afgekorte naast één volledige leest als twee verschillende soorten. Dat de
namen op de plaat twee regels mogen gebruiken hoort daarbij: een ellipsis knipt
juist het onderscheidende deel weg.

**Wat hiervan niet is opgelost.** `Abs. motorbelasting` kort nog steeds af tot
`ABS. MOTO`. Dat komt uit stap 3 van `hudShortLabel()` (eerste zes tekens van
het eerste woord, eerste vier van het tweede), en die functie is van de HUD:
hem verbouwen verandert ook de hoekmeters daar, en dat is een eigen onderwerp.
De botsingscontrole vangt het niet, want het botst met niets — het is alleen
geen naam. Vastgelegd als #95.

**De handmatige kant is bewust niet gebouwd.** De vraag was ook: auto of een
bewerkknop? Het antwoord is *allebei, maar niet als twee standen*. Een
schakelaar auto/handmatig maakt twee bronnen voor één scherm, en dan is
onbeantwoordbaar waar een sensor hoort die vanavond nieuw ontdekt wordt: in de
handlijst staat hij niet, dus hij valt nergens. Automatisch rekent altijd; met
de hand komen er hooguit *uitzonderingen* overheen (groot/klein/verbergen als
diff per auto, met dezelfde sleutel als `PLPidLen`: VIN, anders merk|model|jaar).
Dat is fase 2, en het staat als #94 open — het voegt blijvende staat per
voertuig toe, een extra modus aan een scherm dat er al vier draagt, en het raakt
de sensorkeuze die met #90 nog niet op orde is.

Twee onderdelen van dat voorstel zijn **afgewezen** en dat is het bewaren
waard. *Actief/niet-actief in het bewerkscherm* niet: dat is de PID-keuze, en
een dubbeltik op een tegel doet het al — een derde deur naar dezelfde kamer is
hier al drie keer een bug geweest. *Min/max met de hand* niet: het puntje op
een tegel is een veiligheidsoordeel uit `dH`, `wH` en `PID_HARD_LIMITS`, en een
handmatige grens die een tegel groen kleurt is het gevaarlijkste knopje dat
deze app zou kunnen krijgen. Wat er onder die wens zit is #66 (de grove
schaal), en het betere antwoord daarop is het *waargenomen* bereik per auto
leren — niet een getal dat iemand intypt.

**Wat een rit moet uitwijzen.** Of het vak "Rustig" op een echte auto bevat wat
je verwacht, en of er niet iets in belandt dat je juist groot wilde zien. Blok 5
van de testrun schrijft per vak de aantallen op plus de namen van wat er stil
lag, en meldt FOUT als een tegel in twee vakken hangt of als twee meters op de
plaat dezelfde naam dragen — dat laatste hangt aan de combinatie van PIDs die
déze auto levert, en die is in node verzonnen.

### De vierde saldoschrijver ging om het slot heen — 02-09-2026 (#82, opgelost)

`metSaldoSlot()` bestaat sinds 26-08 en serialiseert elke saldomutatie per
klant. Drie schrijvers liepen erdoorheen, de vierde niet: bijboeken vanuit
`admin.html` las `Saldo` met een eigen `fetch` en schreef het opgetelde bedrag
terug — lezen-optellen-terugschrijven, precies het patroon waar het slot voor
gebouwd is. Sinds 02-09 loopt hij erdoor; de uitleg staat in §8.

**Waarom dit hier staat en niet alleen in het issue.** Er stond een
waarschuwing boven die code, en een uitgebreide: Airtable kent geen transacties,
twee beheerders die op dezelfde seconde bijboeken kunnen elkaar overschrijven,
bij één beheerder is dat geen praktisch risico. Elke zin klopt. Alleen ging het
geheel over de botsing die niet voorkomt, terwijl de botsing die wél voorkomt —
beheerder × klant, en juist op het moment dat een klant belt dat zijn tegoed op
is — er niet in stond.

Dat is dezelfde vorm als de rest van dit hoofdstuk: **een controle die zijn
antwoord uit de verkeerde bron haalt.** Hier is de bron een waarschuwing die
zichzelf compleet laat lijken. Een benoemd risico leest als een afgewogen
risico, en dat is waarom dit anderhalve maand bleef staan zonder dat iemand er
overheen las.

**Wat er nu bewaakt wordt.** `test-bijboeken.js` toetst de volgorde en niet
alleen de aanroep: slot dicht, lezen, schrijven, slot open, en twee lezingen
waarvan de tweede binnen het slot valt. "Roept metSaldoSlot aan" zou ook groen
staan als het lezen en schrijven ernaast liep. Vier mutaties in `plmutate.sh`
maken die test rood.

### De testreeks stond groen op vier nagebouwde fouten — 02-09-2026

Gemeten, niet vermoed. Er zijn vier plausibele fouten in de meetketen gezet en
daarna is `plcheck.sh` gedraaid:

| nagebouwde fout | gevolg in de app |
|---|---|
| `parsePID`: `idx+hdr.length` → `idx+hdr.length-2` | elke sensorwaarde schuift een byte op |
| `validateAndSmooth`: de harde-limiettak → `if(false)` | onmogelijke waarden gaan mee de AI-prompt in |
| `antwoordHerkend`: de NO DATA-poort → `if(false)` | de waakronde leest een foutmelding als een antwoord |
| `healthUitProfiel`: de terugval op `'ok'` weg | onbekende sensoren raken uitgegrijsd |

Uitkomst: **`65 stuks, allemaal exit 0`** en daaronder *"Alles goed — veilig om
te committen."* Elke push naar `main` is deployen, dus dat was de poort die er
niet was.

De oorzaak had twee vormen. **Drie tests laadden hun onderwerp niet.**
`test-healthgate.js`, `test-mode21.js` en `test-waakronde.js` schreven de te
toetsen functie in de test zelf over; zo'n test kan per definitie niet rood
worden. De kopie loopt bovendien uit de pas: `healthUitProfiel()` had in de test
twee parameters en gaf een object terug, terwijl de app er één heeft en
`true`/`false` geeft. Die test stond groen op een functie die niet bestaat.

**En de toets zelf moet onderscheiden.** Dat bleek pas bij het herschrijven: de
drie tests op de echte bron richten was niet genoeg. `antwoordHerkend('0105',
'NO DATA')` bewijst niets over de tekstpoort — in "NO DATA" zit toch al geen
geldige header, dus de controle eronder keurt hem hoe dan ook af. De poort werd
pas zichtbaar met `'SEARCHING...41055A'` en `'41055A STOPPED'`: een foutwoord
én iets dat op data lijkt in dezelfde regel. Dat is de vorm die een ELM327 ook
echt stuurt.

Een derde vorm zat in `test-waakronde.js`: die rekende met een verzonnen tabel
`HARD={'0105':{min:-20,max:130}}` en concludeerde dat koelwater van 215 °C een
bevinding is. `PID_HARD_LIMITS['0105']` staat op −40…215, dus 215 °C is
doodnormaal — en méér dan 215 kan er uit één byte niet komen. De kernbewering
van die test werd bevestigd door een geval dat niet kan optreden, terwijl de
gevallen die wél voorkomen (inlaatdruk onder 2 kPa, boordspanning onder 4 V)
nooit langs een test kwamen.

Wat er sindsdien staat: `test-parser.js`, `test-token.js` en `test-baseline.js`
zijn nieuw, de drie kopie-tests laden nu hun onderwerp, en `plmutate.sh` doet
bovenstaande meting voortaan zelf — zestien nagebouwde fouten, elk met de test
die daarvan rood hoort te worden.

**De les is de vorm, niet de uitkomst.** `plcheck.sh` meldt hoeveel tests er
gedráaid zijn. Dat is iets anders dan wat ze zouden merken, en tussen die twee
zat hier een gat van vier fouten. Een groene reeks is pas een uitspraak als er
een tegenproef onder ligt.

### De sweep verhongerde op het busslot — 03-09-2026 (opgelost)

Gevonden in de rit van 02-09 22:15, de eerste met **vier** aanvragers tegelijk:

```
[22:13:04]  ·      PID-sweep — 46 PIDs
[22:13:13] LETOP   Busslot — bus niet vrijgekomen binnen 8 s
[22:14:17] LETOP   Busslot — vastgehouden door "poll"
```

| | rustige rit | vier aanvragers |
|---|---|---|
| per PID | ~200 ms | **1000–1250 ms** |
| hele sweep | ~12 s | **73 s** |
| `venGemMs` | 182 ms | **1267 ms** |

Alle 46 PIDs kwamen binnen. Het viel dus niet op als storing maar als
traagheid — en de waarden zijn gemeten terwijl de pollus ertussendoor liep,
precies waar dat slot voor bestaat.

**De oorzaak die ik in het issue schreef, klopte niet.** Daar stond dat 8
seconden te krap was en dat de wachttijd met de bezetting mee moest schalen.
Dat zou het niet hebben opgelost. `wait()` kijkt elke 50 ms of het slot vrij
is; de pollus geeft het vrij en claimt het in dezelfde tel opnieuw. Het slot is
dan een paar milliseconden vrij, en de wachter kijkt er net naast. Langer
wachten vergroot de kans, maar maakt hem nooit zeker — **het is geen kwestie
van duur maar van eerlijkheid.** Die vergissing staat hier omdat de correctie
minder leerzaam is dan de fout: "het duurt te lang" is de eerste verklaring die
opkomt bij een timeout, en hij is hier aantoonbaar de verkeerde.

**Wat er nu staat.** `PLBus` houdt een wachtrij bij. Wie via `wait()`
binnenkomt staat erin; een losse `claim()` krijgt geen voorrang meer. De
noodrem eronder is dezelfde als bij de verweesde `_pollBusy`: een wachter die
zijn beurt binnen `WACHT_MAX_MS` niet pakt wordt vergeten, zodat één module de
bus niet kan gijzelen.

**Wat de test hier leerde.** `test-busslot.js` draait op een bevroren klok. De
mutatie die de wachtrij uitzet liet hem daardoor niet falen maar **hangen** —
`wait()` haalt zijn eigen vervaltijd nooit, dus hij wacht eeuwig. `plmutate.sh`
liep er twee minuten op vast en liet bovendien de mutatie in de bron staan,
want hij werd afgebroken vóór het herstel. Er staat nu een echte klok naast de
bevroren. Een hangende test is erger dan een falende: in CI is hij niet te
onderscheiden van een trage runner, en de tegenproef eronder zegt intussen
niets.

### De app bevroor stil, en wist het zelf niet — 03-09-2026 (half opgelost)

`#18` stond sinds 27-08 open als vermoeden. Op 02-09 om 22:04 is hij voor het
eerst met opzet nagemeten: twee minuten uit de app, en de meetlus stond **190
seconden** stil. Dat is de bevinding; hieronder staat wat er wel en niet aan
gedaan is.

**Wat er niet aan gedaan is.** De bevriezing zelf. Android bevriest de
JS-timers van een WebView en daar is vanuit JavaScript niets tegen te doen —
dat is richting 1 uit het issue (foreground service plus wake lock) en dat is
native werk.

**Wat er wel aan gedaan is.** Richting 2: de app weet er nu van. `PLAchtergrond`
in `pidlane-achtergrond.js` legt elke onderbreking vast en kijkt vanaf tien
seconden de SPP-socket na. Dat tweede is het dure deel. Uit het log van 23-08:

```
23:31:00  app hervat
23:31:16  socket dood na 012E1 — herverbinden...
```

Zestien seconden. Android had de socket allang opgeruimd, maar dat bleek pas
toen de pollus er een commando in probeerde te schrijven — met de
ELM-interpreter in een andere staat dan de app dacht. De controle draait met
`force` **uit**: de guard doet dan eerst `isConnected()` en grijpt alleen in
als de socket echt dood is. Een gezonde verbinding mag een achtergrondpauze
overleven; nakijken is iets anders dan herstarten.

**En het was al vijf keer half geregeld.** Er stonden vijf luisteraars op
`visibilitychange` — btflow, bulk, fuel, koopcheck, neon en rit. Elk beslist
voor zichzelf wat "weg" betekent, geen van alle legt het gat vast. Dat is
"één ding heeft één betekenis" in het klein. Ze blijven hun eigen werk doen;
het oordeel staat nu op één plek.

**Hoe je ziet of het werkt.** Blok 5 legt sinds 7.0 twee bronnen naast elkaar:
`PLRit` **leidt** een gat af uit zijn eigen tikken, `PLAchtergrond` **weet**
het van `visibilitychange`. Ziet PLRit een gat dat PLAchtergrond niet kent, dan
is dat FOUT — dan lag de lus stil zonder dat de app het doorhad, en dat is
precies wat deze ronde moest wegnemen.

**Wat de bedradingscontrole hier ving.** `sppReconnectGuard` wordt achter een
`typeof`-guard aangeroepen, want die functie woont in `pidlane-bt.js` en dat
laadt eerder. `test-bedrading.js` gaf daar meteen FOUT op: *"zit achter een
typeof-guard maar staat niet in KRITIEK"*. Terecht — verdwijnt hij, dan doet de
controle niets en komt de app weer per ongeluk achter een dode socket. Die
controle deed hier dus precies waar hij voor bestaat, zonder dat iemand eraan
hoefde te denken.

**NAGEMETEN OP 02-09-2026 23:22, EN DE PROEF STELT DE VERKEERDE VRAAG.** De rit
met testrun 7.1 leverde dit op:

```
PLRit leidt 1 onderbreking(en) af, grootste 64 s
PLAchtergrond wéét er 1, grootste 120 s
— de twee bronnen verschillen meer dan een kwart
```

Dat leest als een meetfout in een van beide. Het is er geen. Het app-log van
dezelfde rit laat zien wat er gebeurde:

| tijd | wat |
|---|---|
| 23:17:59 | app verborgen |
| 23:18:05 | `SPP automatisch herverbonden` |
| 23:18:18 | `ELM327 initialisatie klaar` |
| 23:18:20 | monitor ziet `0105` uitvallen |
| 23:18:22 | verificatie gestart |
| 23:18:35 | verificatie afgerond — `0105 antwoordt nu vlot` |
| *stilte* | |
| 23:19:59 | terug |

**De app draaide nog ruim een halve minuut door nadat hij verborgen was.** Hij
deed in die tijd een volledige herverbinding mét ELM-init, zag een sensoruitval
en rondde een verificatieronde af. Pas daarna bevroor Android hem. De twee
bronnen meten dus twee verschillende dingen, en allebei goed: PLAchtergrond
meet hoe lang de app **verborgen** was (dat is wat `visibilitychange` weet),
PLRit meet hoe lang de meetlus **stillag** (dat is wat de tikken laten zien).
Tussen die twee zit per definitie de aanlooptijd tot de bevriezing.

Daarmee klopt de regel hierboven — *"ziet PLRit een gat dat PLAchtergrond niet
kent, dan is dat FOUT"* — nog steeds, maar de proef doet iets anders: hij
vergelijkt de **duur**, en zet LET OP op een verschil dat de normale uitkomst
is. De vraag hoort over het **bestaan** te gaan. Het verschil in duur is de
interessante meetwaarde, niet het alarm.

Dezelfde verwarring zit in de melding zelf: *"De app was 120 s weg — de meetlus
stond in die tijd stil"* beweert iets wat PLAchtergrond niet meet, en het log
eronder spreekt het tegen. De duur is van PLAchtergrond, het oordeel over de
lus is van PLRit.

**Wat deze rit opleverde is dus geen bevestiging maar een getal: ~36 seconden
tussen verbergen en bevriezen**, op de SM-S947B bij stationair draaien. Dat
maakt twee dingen concreter. De drempel van tien seconden waarop PLAchtergrond
de socket nakijkt zit ruim binnen die aanloop, en dat is nu onderbouwd in
plaats van gekozen. En richting 1 hoeft geen milliseconden te winnen: hij moet
een gat van deze orde overbruggen. Of de aanloop korter is als het toestel
meer te doen heeft — er is deze rit niet gereden — staat nog open.

### Het meetinstrument was zelf niet nagemeten — 03-09-2026 (#103 t/m #106)

Vier bevindingen uit de rit van 02-09 23:22 gingen niet over de app maar over
de **testrun**. Dat is geen toeval en het is het vermelden waard, want het is
één patroon: elk stuk gereedschap in dit project heeft een tegenproef behalve
het gereedschap dat de tegenproeven leest.

**#104 — dubbel tellen, en niet elke keer.** `pidOpruimen()` schrijft dezelfde
opruiming twee keer weg: via `btDiag()` naar de BT-log en via `log()` naar de
app-log, die tweede met een 🧹 ervoor. Blok 14 plakt beide buffers aan elkaar,
dus elke opruiming telde dubbel. Wat het van een schoonheidsfoutje een echte
bevinding maakt is de instabiliteit: de BT-log is een ringbuffer met zware
doorloop, dus om 23:22:13 stond er *"de gate zegt 1, het log bevestigt er 2"*
en om 23:23:54 *"bevestigt er 1"* — dezelfde ene gebeurtenis, twee antwoorden,
afhankelijk van hoeveel busverkeer er intussen langs was gekomen. En de proef
zegt er zelf bij dat dit de meting is waar de drempel op gekozen moet worden.

**#103 — de teller keek net naast de gebeurtenis.** `PLRit.tik()` leest
`connected` als momentopname. Op 02-09 stierf de socket zes seconden na het
naar de achtergrond gaan en herstelde hij zichzelf, met een volledige ELM-init
erachteraan — en het verslag meldde `0 herverbinding(en) bij 1 gat(en)`.

Dat is exact dezelfde vorm als het busslot van #98: iets is even waar tussen
twee metingen door, en wie bemonstert kijkt ernaast. De oplossing is ook
dezelfde: niet vaker kijken maar het laten mélden. `sppReconnectGuard` weet
zéker dát het gebeurde.

En het is het spiegelbeeld van #77, dat er juist één te veel telde. Dezelfde
teller, twee keer fout, twee kanten op — met beide keren een verslag dat je
naar de verkeerde oorzaak stuurt.

**#105 — de toets schreef in de bron die hij toetst.** Blok 5 schiet 300 °C en
200 °C op `0105` in om laag 1 en laag 2+3 te toetsen. Dat is de goede manier om
gedrag te meten. Maar `validateAndSmooth()` schrijft die waarden ook wég, en
twaalf seconden later rapporteerde blok 4:

```
Opvallende metingen — 0105 uiterste 200 (1x)
```

De werkelijke koelwatertemperatuur was 91–93 °C. Blok 3 deed het al goed
(*"selectie tijdelijk overschreven"* … *"Selectie hersteld"*); blok 5 niet.

**#106 — een advies dat bewust was afgewezen, elke rit opnieuw.** De
`#40`-proef eindigde met *"#40 KAN DICHT, de tabel in pidlane-data.js hoort
naar de gemeten waarde"*. #40 was op 02-09 om 20:27 al gesloten, met de
tegenovergestelde uitkomst: de tabel klopt (J1979 — twee bytes, één per bank),
deze CX-5 heeft één bank, en de lerende laag hoort te winnen.

De denkfout eronder is de bruikbaarste van de vier. De proef besloot op
*"gemeten wijkt af van de tabel"* en concludeerde *"de tabel is fout"*. Bij een
lerende laag is afwijken geen bevinding maar **de bedoeling**. Zo'n proef staat
vanaf de eerste rit in deze auto permanent oranje, en dan geldt wat `CLAUDE.md`
erover zegt: een test die altijd rood staat wordt genegeerd.

Beide proeven vragen nu naar gedrag: *pakt de app de bytes goed uit* — wint
`PLPidLen.lengte()` van de tabel, en pakt een batch mét `0155` erin de PID
eráchter nog goed uit. Wijkt de meting af terwijl de app hem correct leest, dan
is dat `ok` met de afwijking als toelichting.

**Wat de bedradingscontrole hier ving.** Die nieuwe vraag roept `pidByteLen()`
aan achter een `typeof`-guard, want `pidlane-testrun.js` laadt later dan de
parser. `test-bedrading.js` gaf daar meteen FOUT op: *"zit achter een
typeof-guard maar staat niet in KRITIEK"*. Tweede keer deze week dat die
controle een verse guard ving zonder dat iemand eraan hoefde te denken — de
eerste was `sppReconnectGuard`.

### De app kon al die tijd gewoon in een browser draaien — 03-09-2026

Op 02-09 stonden er 22 issues open en kwamen er die dag vijf bij. De klacht
was niet dat er te weinig gevonden werd, maar dat er te weinig dícht ging.

**De meting die dat verklaart.** Van die 22 hadden er ongeveer vijftien geen
auto nodig. Ze hadden een dráaiende app nodig — een tekstlabel dat verkeerd
afkapt, een selectie die door de sweep wordt overschreven, een melding die te
vroeg alarm slaat. Maar de enige plek waar de app draaide was een rit, en een
rit duurt een kwartier en gebeurt één keer per dag. Daardoor stond #95 (een
label van elf tekens) in dezelfde wachtrij als #20 (een identifier die alleen
een echte ECU kan bevestigen).

**De conclusie die dat in stand hield stond in `test-schermranden.js`:**

> Playwright kan dit gedrag meten [...] Voor de rest lukt dat hier niet zonder
> de hele app-boot na te bouwen: `openTestrun()` weigert zonder `isAdmin()`,
> en dat hangt aan een ingelogde sessie die een kale testomgeving niet heeft.

Die redenering is logisch en hij is fout, en het is dezelfde vorm als de
`ATI`-vergissing in §1: een waarneming ("het lukt niet") werd een conclusie
("het kan niet") zonder de bron op te zoeken. **De app-boot hoeft niet
nagebouwd te worden — hij kan gewoon draaien.** Nagemeten op 03-09: alle 57
modules laden, `PLBus`/`PLLoad`/`PLSched`/`PLBedrading`/`PLRit`/`PLAchtergrond`
leven, 146 PIDs staan in de tabel, nul JS-fouten, geen enkel dialoogvenster.
Vijftien seconden.

**Wat het al die tijd tegenhield was één regel in de `<head>`:**

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans..." rel="stylesheet">
```

Een `<script>` wacht op nog openstaande stylesheets voordat het draait. In een
testomgeving zonder internet komt die CSS nooit, dus bleef de parser hangen op
script 1 van 57 — met `readyState: "loading"`, geen foutmelding en geen
tijdslimiet. Het zag eruit als "de app start niet", en dat leest als een
fundamenteel probleem in plaats van als een ontbrekende download. Blokkeer
extern verkeer en de boot loopt door.

Dat extern verkeer blokkeren hoort er trouwens sowieso bij: een proef die het
net op kan meet de dag en niet de code.

**Wat dit oplevert.** `plbrowser.js` start de echte app en `bproef-*.js` stelt
er vragen aan. De eerste proef reproduceert meteen de bevinding waar de rit van
02-09 23:22 een kwartier voor nodig had: `validateAndSmooth('0105', 200)` geeft
`200` in plaats van `null`, want `FILTERED_PIDS` is met suffix-sleutels gevuld
terwijl de meetketen de volledige PID doorgeeft. Dat is een fout in de
KOPPELING tussen twee modules, en die is per definitie onzichtbaar voor een
test die één van de twee uit zijn verband knipt met `vm`.

**Geen npm, geen Playwright, geen buildstap.** Node 22 heeft een ingebouwde
WebSocket en praat daarmee rechtstreeks met het debugprotocol van Chromium.
Dat is geen puristische keuze maar dezelfde randvoorwaarde als altijd: dit is
een soloproject naast een baan, en gereedschap dat zelf onderhoud vraagt wordt
niet gedraaid.

**Wat dit niet oplost.** Er zit geen auto achter. De nep-adapter vervangt
`_sendBTOnce()` en levert antwoorden uit een tabel; wat een echte ECU doet
onder een volle bus blijft een vraag voor een rit. De scheiding staat nu in
`CLAUDE.md`: een functie los is node, een koppeling is de browser, een echte
bus is `CAMPAGNE` — en dat laatste is voortaan een besluit met een reden in
plaats van de restcategorie waar alles in belandde.

### Het testrunverslag was het derde VIN-pad — 03-09-2026

De rit van 02-09 23:22 leverde een verslag op met de volledige VIN erin, twee
keer, in de app-logdump onderaan:

```
{"ts":"23:15:37","type":"ok","msg":"VIN: JMZKF6W7600766507"}
{"ts":"23:15:42","type":"ok","msg":"💾 Voertuigprofiel opgeslagen (55 PIDs) voor JMZKF6W7600766507"}
```

Blok 1 van datzelfde verslag maskeert wél: `VIN 766507`. De maskering zat dus in
de testrun en niet in de bron.

**Waarom §7 dit niet ving.** Die paragraaf noemt twee uitgaande paden en beide
zijn dicht. Maar `_plVinVoorLog()` beschermt de route naar Airtable — niet de
logbuffer zelf. Twee aanroepen schrijven de ruwe VIN rechtstreeks in die
buffer (`pidlane-bt.js:2289` en `pidlane-pids.js:1097`), en het verslag
exporteert de buffer integraal.

**En dat maakt het het gevaarlijkste van de drie.** Bij de andere twee gaat er
een gecontroleerde kolom naar een tabel die alleen ik zie. Een testrunverslag
is bedoeld om gedeeld te worden: het gaat naar een issue, een chat, een
bestand op een pc. Het is de enige van de drie waar de gebruiker zelf de
bestemming kiest.

**De les is niet "nog een pad dichtzetten".** Het is dat "uitgaand pad" hier
twee keer verkeerd is afgebakend: eerst als *de verzendfunctie*, nu als *de
route naar Airtable*. De buffer zelf was steeds de plek waar het misging, en
zolang de ruwe VIN daarin staat is de volgende afnemer weer een nieuw pad.

**Gedicht op 03-09-2026, en er waren drie schrijvers.** Het issue noemde er
twee. De derde stond in de testrun zelf: de profielproef van blok 1 drukte bij
een FOUT de huidige VIN áf plus die van élk profiel dat ooit op het toestel was
opgeslagen. Eén melding die niet één auto lekt maar alle auto's die dat toestel
heeft gezien — en hij stond in het bestand dat over lekken zou moeten
rapporteren.

Dat die derde er was, is het bewijs voor de les hierboven. Ik had twee
aanroepen gevonden door te zoeken naar `log(...vin...)` in de modules; deze
stond in een string-concatenatie in een proef, waar ik niet keek. **Daarom
toetst `bproef-vinlek.js` niet de aanroepen maar de buffer**: hij vult die met
de echte codepaden (`tryReadVIN()` via een nep-ECU, `saveVinProfile()`) en
zoekt de ruwe VIN dan terug in `plLokaalLog()`. Dat is de enige vorm die ook
een vierde schrijver vangt die nog niet bestaat.

Met tegenproef aan allebei de kanten: één ruwe VIN in de buffer schrijven en
eisen dat de scan hem ziet, én de reparatie in `pidlane-bt.js` terugdraaien en
zien dat de proef rood wordt met de gemeten waarde erbij.

**Wat bewust is blijven staan.** `_voertuigRegels()` in `pidlane-export.js` zet
de volledige VIN in de kop van elk geëxporteerd rapport. Dat is geen vergissing
maar een ontwerpkeuze — een rapport over een auto knoopt zich juist aan de VIN
vast — en dus een besluit (`#109`), niet iets om in deze PR mee te nemen. Dat
het in §7 staat is het punt: een bewust opengelaten pad dat niet in de tabel
staat, is over een maand niet te onderscheiden van een vergeten pad.

### Vier ritten, nul gesloten issues — 02-09-2026

Niet één bevinding maar een patroon, en het is de reden dat testrun 6.5
bestaat. Vijf issues staan als "meten" open: #19, #29, #66, #79 en #20. Er zijn
sinds 27-08 vier ritten gereden. Er is er geen enkele van dichtgegaan.

Niet omdat de metingen mislukten. Elke keer sneuvelde er één **voorwaarde**:

| rit | wat er ontbrak |
|---|---|
| 27-08 | de opruimregel vuurde wél, blok 14 las het verkeerde log (#29) |
| 01-09 | vijf minuten gereden waar er tien nodig zijn; 0123/0159 stonden buiten de selectie |
| 02-09 12:05 | drie aanvragers in plaats van vier — de caravan-tracker stond uit |
| 02-09 13:14 | vier minuten gereden; 0155/0156 kwamen niet langs, dus "0 afwijkend" (#40) |

**Wat die vier gemeen hebben.** De voorwaarde stond wél ergens: in de tekst van
stap 3 ("wil je de caravan-tracker erbij, start die dan zelf"), in het issue, of
in de campagne. Alleen niet als iets dat de app zelf doet of zelf afdwingt. En
het gemis bleek pas achteraf, verspreid over blok 4, 7 en 14 — nergens stond de
vraag die je eigenlijk had: *is dit issue nu dicht te doen?*

Dat is dezelfde vorm als de rest van §11: **een controle die zijn antwoord uit
de verkeerde bron haalt.** Hier is de verkeerde bron de bestuurder zijn
geheugen. Een voorwaarde die je achteraf meldt is een verwijt; dezelfde
voorwaarde vooraf is een knop — dat stond al in de kop van de begeleide rit,
maar gold nog niet voor de vierde aanvrager en de twee bytelengte-PIDs.

**Wat er nu staat.** De begeleide rit start de caravan-tracker zelf, `RIT_PIDS`
bevat 0155 en 0156, en er zijn drie stappen bij: twee minuten achtergrond
(#18) en twee oordelen die alleen een mens kan geven (#66, #79). Blok 5 heeft
een blok DE RIT-OOGST met zes proeven die per issue zeggen of hij dicht kan, en
anders wat er ontbrak. `test-begeleid.js` bewaakt de volgorde van de nieuwe
stappen én de inhoud van `RIT_PIDS`; `plmutate.sh` maakt allebei rood als ze
verdwijnen.

**Wat dit niet is.** Geen garantie dat de issues dichtgaan. De rit kan nog
steeds uitwijzen dat 0123 stilstaat of dat de app niet bevriest — dat zijn
antwoorden, en antwoorden zijn precies wat er tot nu toe niet kwam.

**UITKOMST — de rit van 02-09 22:15.** Dertien van de dertien stappen, vier
aanvragers, tweeëntwintig minuten, en de run sloot af met **109 ok, 0 fout**.
Vier issues kregen hun antwoord in één rit:

| issue | wat de rit opleverde |
|---|---|
| #19 | 0123 en 0159 allebei in beweging: 193 verversingen, 187 resp. 181 wijzigingen, 9730–23790 |
| #40 | 0155 en 0156 allebei 1 byte uit tien metingen, zonder tegenspraak — de tabel zegt 2 |
| #29 | de gate meldt 015E opgeruimd, en het log bevestigt hem: blok 14 ziet wat er echt gebeurde |
| #18 | 190 s stilte in de meetlus terwijl de app op de achtergrond stond — van vermoeden naar bevinding |

Plus twee oordelen die alleen een mens kon geven: de slimme indeling klopt op
deze auto (#66), en er valt niets achter de Android-knoppen (#79/#58) — daar
was de melding dus fout en niet de layout.

**En de rit vond zelf twee dingen die niemand had gevraagd.** De eigen proeven
van 6.5 waren op twee plekken slordig: de #29-proef zette `gate: [object
Object]` in het verslag en trok daar wél een stellige conclusie uit, en de
#15-proef telde de achtergrondpauze mee als responstijd (`hoogst 185785 ms` —
dat is de bevriezing, niet de bus). Allebei gerepareerd. Het patroon is
inmiddels vertrouwd: *een proef die een stellige uitspraak doet op een bron die
hij niet goed leest.*

Het derde is [#98](https://github.com/NewspeedyNL/PidLane/issues/98): met vier
aanvragers krijgt de sweep het busslot niet meer binnen 8 s en meet hij naast
de pollus — 1250 ms per PID in plaats van 200. Geen regressie, maar een grens
die er altijd was en die nu voor het eerst gehaald wordt.

### De gezondheidscheck stempelde vóór hij oordeelde — 02-09-2026 (opgelost)

Gevonden in de testrun van 02-09 om 12:05, als een van de twee FOUTen:
*"019D staat als niet-ok terwijl hij meet — de herziening vuurt niet (#78)"*.
De proef had gelijk, de oorzaak die hij noemde niet.

`initialHealthScan()` in `pidlane-rijsituatie.js` deed dit:

```js
const val=parsePID(pid, raw);
if(val==null){ _pidHealth[pid]='onzin'; onzin++; continue; }
updPID(pid,val);                          // ← stempelt
const q=assessPidQuality(pid,val,true);   // ← en oordeelt dan pas
_pidHealth[pid]=q.status;
```

`updPID()` zet `_pidLastUpd[pid]`. Dat is de **versheidsbron**: blok 5, blok 14
en de stale-watchdog lezen hem als "deze sensor heeft in deze sessie een
meting opgeleverd". Stond het oordeel daarna op `nodata` of `onzin`, dan
vertelde het verslag twee dingen tegelijk die elkaar uitsluiten.

**Waarom uitgerekend 019D.** Turbo temp inlaat B parseert als `b[0]-40`. Een
atmosferische motor antwoordt met `0x00`, dus -40 °C — exact het
definitie-minimum. Daar is de dummy-detectie in `assessPidQuality()` voor: een
waarde precies op het minimum in categorie Temp/Emissie leest als "sensor niet
aanwezig". Dat oordeel is goed en is niet aangeraakt.

**En daarom kon de herziening het niet rechtzetten.** `plHealthHerzien()` legt
een nieuwe meting langs diezelfde regel. Voor een sensor die er niet is komt
daar elke keer weer -40 uit, dus elke keer weer `nodata`. Wie naar de melding
keek zocht dus in een functie die correct werkte, terwijl de fout een regel
eerder stond. Dat is het patroon van §11 in het klein: *de melding wees naar de
laatste stap in de keten, niet naar de stap waar het misging.*

**Wat er nu staat.** De scan oordeelt eerst en stempelt daarna, en alleen bij
`ok`. Een tweede gevolg dat er gratis bij komt: een waarde die de scan afkeurt
belandt niet meer in `pidVals` en `pidHist` — tot nu toe bleef die staan,
terwijl de app hem net zelf onbruikbaar had verklaard.

`test-healthherziening.js` stap 6 draait `initialHealthScan()` in een sandbox
met de echte defs, de echte parser, laag 1 en het echte oordeel erachter. Er
wordt eerst vastgesteld dát 019D tot -40 parseert en dát het oordeel die -40
afkeurt; zonder die twee zou "de scan doet helemaal niets" ook groen geven.
`plmutate.sh` zet de oude volgorde terug en verwacht die test rood.

### Het voertuigprofiel-alarm heeft een te krappe marge — 02-09-2026

Ook uit de run van 12:05, als LET OP in blok 1: *"55 PIDs, 55 health-oordelen,
0.3 uur oud — staat in de opslag maar is bij het verbinden NIET geladen; de app
deed een volle discovery"*.

Dat is vals alarm, en het is dezelfde vorm als de correctie van 26-08 die er al
in zit. Het profiel is in díé sessie zelf ontstaan: opgeslagen om 11:48:52, de
testrun draaide om 12:04:29. Zo'n profiel *kán* bij dit verbinden niet geladen
zijn, want het bestond toen nog niet. De uitzondering daarvoor kijkt naar
`uur <= 0.1` — zes minuten — en die marge is te krap zodra je een kwartier na
het verbinden gaat meten, wat bij een begeleide rit van tien minuten de
normale gang van zaken is.

**En de oorzaak van dat verse profiel staat vast, want die is nagevraagd
(02-09-2026):** het profiel is leeg omdat er een nieuwe versie was geladen of
omdat de opslag gewist was. Wordt dat níét gedaan, dan laadt het profiel
gewoon en meldt blok 1 "bij het verbinden geladen, snelle start". **Het laden
zelf mankeert dus niets — dit is een melding, geen app-fout.** Dat onderscheid
is het hele punt: precies in de sessies waarin je een oplevering uitprobeert
(nieuwe versie erop, opslag schoon) slaat deze proef vals alarm, en dat zijn
juist de sessies waarin je hem het meest vertrouwt.

De marge oprekken is niet de goede reparatie: dan verschuift alleen de grens.
De vraag is "is dit profiel ná het verbinden ontstaan", en daar hoort het
verbindingsmoment bij, niet een vaste hoeveelheid uren. Niet in deze PR
opgelost — één onderwerp per PR. Staat als [#86](https://github.com/NewspeedyNL/PidLane/issues/86).

### Laag 2 en 3 van de meetketen staan uit — 02-09-2026

Gevonden bij het schrijven van `test-parser.js`, en niet in dezelfde oplevering
gerepareerd (één onderwerp per PR).

`FILTERED_PIDS` in `pidlane-datalog.js` is gevuld met **suffixen**:

```js
const FILTERED_PIDS=new Set(['05','0F','46','5C','2F','42','33','07','09']);
```

Regel 75 van datzelfde bestand bevraagt hem met de **volledige** PID:

```js
if(!FILTERED_PIDS.has(pid)) return Math.round(rawVal*100)/100;
```

`parsePID()` en `applyParsedBytes()` geven `'0105'` door, niet `'05'`. De test
slaat dus altijd aan en de functie keert terug vóór laag 2 en 3 — het
spike-filter mét herstel en de smoothing over twee metingen staan daarmee uit
voor **álle** PIDs, niet alleen voor de trage.

Nagemeten in de sandbox van `test-parser.js`, met de vorige waarde op 50:

| aanroep | uitkomst |
|---|---|
| `validateAndSmooth('0105', 200)` | `200` — ongefilterd |
| `validateAndSmooth('05', 200)` | `null` — wacht op bevestiging |

Dat de logica zelf klopt is dus vastgesteld; alleen de sleutel waarmee hij
bevraagd wordt is de verkeerde. `pidlane-fuel.js` regel 1287 doet het bij
dezelfde set wél goed:

```js
const traag = traagSet.has(pid.slice(2).toUpperCase());
```

Twee plekken, dezelfde set, twee sleutelvormen — precies het patroon dat
CLAUDE.md verbiedt met "één ding heeft één betekenis". De andere tabellen in
diezelfde functie (`PID_HARD_LIMITS`, `PID_LET_OP`) zijn wél op de volledige
PID gesleuteld, wat de verwarring verklaart.

**Waarom dit niet zomaar een eenregelige fix is.** Laag 2 en 3 aanzetten is een
gedragswijziging in de meetketen: waarden die nu direct doorlopen gaan dan op
bevestiging wachten, en dat kost één meetcyclus vertraging op de trage
sensoren. Of de drempels (35 % sprong, 3,5σ, de 5-seconden bevestiging) na
maanden uitstaan nog kloppen, is niet vanaf een bureau te zeggen. Dat verdient
een eigen rit en een eigen PR.

Blok 5 van testrun 6.3 meldt dit als **LET OP** zolang het zo is, en slaat
vanzelf om naar ok zodra regel 75 gerepareerd is.

> **AFGELOOP, 10-09-2026.** Regel 75 is op 09-09 gerepareerd (#158) en de lagen
> zijn een dag later weggehaald. De waarschuwing hierboven — *"niet vanaf een
> bureau te zeggen, dat verdient een eigen rit en een eigen PR"* — bleek precies
> goed, en werd genegeerd. Zie het kopje *"Laag 2 en 3 zijn weggehaald, en dit is
> waarom"* bovenaan §11.

### Wat er open staat

**In de issues, en nergens anders.** Ze zijn gelabeld op soort (`bug`, `wens`,
`besluit`, `extern`), op kant (`app`, `worker`, `ui`, `meten`, `bt`) en op
ernst (`ernst:1` t/m `ernst:4`); daarmee is een tweede lijst hier alleen maar
een lijst die uit de pas gaat lopen.

**Nagemeten op 02-09-2026, en dat is de reden dat dit kopje geen tabel meer
is.** Hier stond er een. Op dat moment vermeldde hij #65 als open — gesloten
als duplicaat om 09:48 diezelfde dag — en ontbrak #90, aangemaakt om 11:18.
Eén dag, twee fouten, in een tabel waar drie regels boven stonden dat twee
lijsten van hetzelfde uit de pas lopen. De waarschuwing klopte; het antwoord
erop was de tabel schrappen, niet hem bijhouden.

Wat hieronder blijft staan is de **uitleg** die je nodig hebt om die issues te
begrijpen: hoe het systeem in elkaar zit en welke fouten er eerder zijn
gemaakt. De stand van zaken staat in de issues.

### De ritwaarnemer telt geheugen, geen metingen — 01-09-2026 (issue #74)

Gevonden bij het nalezen van de testrun van 01-09 om 22:32, de eerste rit sinds
drie opleveringen. **Dit is de duurste bevinding van die run en hij raakt drie
regels in blok 14 tegelijk.**

**Wat er misgaat.** `PLRit.tik()` loopt elke 5 s over álle sleutels van
`pidVals` en verhoogt daar `n`. `pidVals` is een laatst-bekende-waarde-kaart
zonder houdbaarheid: geschreven door `updPID()`, gewist bij het verbreken van
de verbinding, en verder nooit. Een PID die één keer gelezen is — door de
gezondheidscheck bij het verbinden, door een eerdere sweep, door blok 6 —
blijft daarna in `pidVals` staan. PLRit telt daarvoor elke vijf seconden een
"monster" met nul veranderingen. Dat kán niet anders, want niemand ververst hem.
Blok 14 leest dat als *"deze sensor bewoog niet tijdens de rit"*.

**Hoe je het in het rapport ziet.** Alle PIDs melden precies hetzelfde aantal
monsters, hoe verschillend hun busactiviteit ook is:

| PID | monsters in blok 14 | echte busreads (`PLBus.stats().perPid`) |
|---|---|---|
| `010B` MAP | 56 | 390 |
| `0123` raildruk | 56 | niet in `perPid` — 0 |
| `0159` raildruk | 56 | niet in `perPid` — 0 |

Identieke tellingen bij 390 tegen 0 reads: PLRit telt tikken, geen metingen.
De verhouding klopt ook: van de 53 "bemonsterde" PIDs bewogen er 21, en dat is
exact de groep die het pollus uitvraagt.

**Welke conclusies daardoor niet klopten.**

- *"Raildruk 0123/0159 — nog steeds bevroren tijdens het rijden. Op directe
  inspuiting kan dat niet: dit is een parser- of definitiefout."* Allebei
  stonden ze niet in de actieve selectie en zijn ze tijdens de rit geen enkele
  keer uitgevraagd. De waarden komen van vóór de rit. De juiste uitkomst is
  "niet gemeten". Dit is dezelfde meting waarop #19 gesloten is.
- *"22 bewogen niet ... dit is de populatie voor de opruimregel"* — die
  populatie is grotendeels de verzameling PIDs die niemand uitvraagt. Een
  drempel daarop kiezen (#16) is een drempel op een artefact. Er staan zelfs
  steunbitmaskers in: `0120` "vast op 160" en `0140` "vast op 250" zijn de
  eerste byte van het antwoord op `0120`/`0140` uit blok 6.
- `0144` laat de vorm zien: de sweep leest `41447FE0` → 1,00 terwijl blok 14
  "vast op 2" meldt. Twee getallen voor één PID, want het tweede komt uit een
  oude `pidVals`-inschrijving.

**Issue #19 is hierdoor heropend, en de fout zat er al twee keer eerder in.**
De raildrukvraag is op 27-08 gesloten met deze meting: *"0123: 1 wijzigingen,
10130–15040 (108 monsters) — allebei in beweging"*. Eén wijziging met een
spreiding van 4910 kPa over 108 monsters is geen bewegende sensor; dat is een
PID die in de hele sessie twee keer gelezen is en verder uit het geheugen werd
geteld. Op 28-08 stond hij weer op 0 wijzigingen en is de sluiting al eens
tegengesproken, maar zonder verklaring — en toen bleef hij dicht. De
kanttekening die er destijds bij stond (*"1 wijzigingen telt hier waarschijnlijk
overgangen tussen sample-blokken; het bereik is het bewijs, niet de teller"*)
was de goede waarneming met de verkeerde verklaring: de teller klopte, hij
telde alleen iets anders dan gedacht. Zolang `0123` en `0159` niet in de
actieve selectie staan, meet blok 14 over die twee helemaal niets — en dat is
in geen van de drie ritten het geval geweest.

**De tegenspraak stond in het rapport zelf.** Blok 14 punt 2 meldt 22 bevroren
sensoren; punt 4, dat sinds #29 bij de gate meet, meldt *"geen enkele sensor
bleef lang genoeg stil"*. De gate had gelijk. Dat de twee elkaar tegenspreken
was de ingang.

**Waarom dit hier apart staat.** Dit is voor de derde keer dezelfde vorm als
#29 en #12: niet een drempel die verkeerd staat, maar een controle die zijn
antwoord uit de verkeerde bron haalt en er tóch een stellige conclusie op
plakt — inclusief een advies dat je onderzoek kost. De reparatiehaak bestaat
al: `updPID()` zet `_pidLastUpd[pid]`, en dat versheidsstempel maakt "niet
gemeten" onderscheidbaar van "gemeten en niet bewogen". PLRit gebruikt het niet.


**GEREPAREERD op 01-09-2026 (testrun 6.0).** `PLRit` leest nu `_pidLastUpd` —
het versheidsstempel dat `updPID()` bij élke geparste waarde zet, ook als de
waarde gelijk bleef. Verschuift dat stempel niet tussen twee tikken, dan is er
niets gemeten. De telregel zit in `PLRit._neem()` met vier uitkomsten: gemeten,
ongewijzigd stempel, geen stempel, en *eerste waarneming*.

Die laatste is een bewuste keuze die één meting per PID kost. Bij de eerste tik
waarin een PID opduikt is zijn stempel nog onbekend en kan de waarde van vóór de
rit zijn. Alleen een stempel dat verschúift bewijst een leesbeurt binnen deze
rit. De telling dwaalt daarmee altijd naar "nog niet gemeten" in plaats van naar
een verzonnen monster — en dat is de kant waar hij moet dwalen, want de
omgekeerde fout is deze bug.

**Er is geen stille terugval.** Ontbreekt `_pidLastUpd` helemaal, dan meet
`PLRit` niets en meldt blok 14 dat als FOUT. Een terugval die "gewoon iets"
meet is precies hoe dit vier ritten lang onzichtbaar bleef.

Blok 14 scheidt nu vijf groepen waar er twee waren: bewogen, gemeten maar stil,
hoort stil te staan, te weinig gemeten, en niet gemeten. Alleen de tweede is de
populatie voor de opruimregel (#16). De steunbitmaskers `0100`/`0120`/`0140`/
`0160` en `0102` zijn aan de "hoort stil te staan"-lijst toegevoegd: *"0120 vast
op 160"* was de eerste byte van een bitmasker en betekende niets.

`test-rit.js` modelleert de stempels sinds deze ronde met een `Proxy` op
`pidVals`, precies zoals `updPID()` ze zet — de oude test slaagde omdat hij de
bug modelleerde. Vier nieuwe toetsen plus een tegenproef die de oude telregel
nabouwt; bouw je de fout terug in `PLRit`, dan worden zeven toetsen rood.

Wat hier **niet** mee opgelost is: #19 is heropend maar nog niet beantwoord.
Daarvoor is een rit nodig waarin `0123` en `0159` in de pollronde staan, en dat
is stap 2 van de begeleide rit (§20).

### Vier kleinere meetfouten uit dezelfde run — 01-09-2026 (issues #75 t/m #78)

Alle vier gevonden door het rapport tegen de code te leggen, geen van vieren
gerepareerd in deze ronde.

**#75 — "Meldingen sinds het begin van deze run" telt de hele ringbuffer.**
De regel telt `app.length` en `bt.length` zonder tijdsgrens. Het rapport meldt
"app-log 33 regels" terwijl de complete app-log 33 regels telt waarvan de
laatste van 22:29:21 is — de run begon om 22:32:02. Er kwam dus niets bij en
er werd 33 gemeld. Bij een lange rit liegt hetzelfde getal de andere kant op,
want dan is de buffer afgekapt (#72).

**#76 — blok 7 spiegelt de PLLoad-regel van vóór 23-08.** `PLBudget.zone()`
rekent `bezet >= bezetOp || fout >= foutOp` — precies de OF die op 23-08 uit
`PLLoad` is gehaald, met een half scherm commentaar erboven waarom bezetting
alléén geen tegendruk is. De spiegel is niet meeverhuisd. Daardoor meldt het
rapport "druk 87%" naast "geen enkele stap omlaag", wat leest als een defecte
regelkring terwijl `PLLoad` deed wat hij hoort te doen: met de echte regel was
`druk` nul keer waar (foutgraad ≤1%, `venGemMs` 193 tegen `traagMs` 400).
In dezelfde regel: de Slotsom kan "0 van de N remmomenten was ongevraagd" niet
onderscheiden van "er is nooit geremd, dus deze run zegt niets" — en op die
Slotsom hangt of #15 dicht kan.

**#77 — de eerste verbinding telt als herverbinding.** `vorigVerbonden` begint
op `null` en de teller kijkt alleen naar `false`; de tikken vóór het verbinden
zetten hem op `false`, dus de eerste normale verbinding telt mee. Het rapport
meldt "0 gaten, 1 herverbinding" voor een rit waarin niets is verbroken, en de
tekst eronder wijst je dan naar de bus of de adapter. Vals spoor in precies de
meting die #18 moet beantwoorden.

**#78 — `_pidHealth` wordt na de eerste scan nooit herzien.** Eén uitvraag per
PID met 1500 ms timeout bij het verbinden, en dat oordeel blijft staan — het
gaat bovendien mee het voertuigprofiel in. Het rapport noemt `0101`, `0121`,
`012E` en `016D` "NIET-OK maar wél in de actieve selectie", terwijl blok 3 ze
in dezelfde run alle vier gewoon uitleest en afsluit met "0 geen data, 0
parserprobleem". `0101` en `0121` staan bovendien in de `MAG_STIL`-lijst van
blok 14: twee modules die het over dezelfde twee PIDs oneens zijn. Blok 11 zegt
zelf dat alle vier de haken voor een terugweg bestaan — wat ontbreekt is dat
iemand ze aanroept met een geslaagde meting als aanleiding (hoort bij #16).

### De veilige zones op een toestel — 01-09-2026 (issue #79, na #58 en #65)

De enige FOUT van de run: *"het werkscherm loopt tot 854px door terwijl er op
784px een navigatiebalk begint — de onderste 70px valt daarachter weg"*, op een
SM-S947B met Android 16. De twee proeven erboven (`--pl-top` tegen
`46 + --pl-sat`, en de onderkant van `.topbar`) staan groen, dus de bovenkant
klopt en het token wordt gelezen. Het verschil is exact `--pl-sab`.

Waarom dit nog geen reparatie is: de proef meet `#appGrid` tegen
`innerHeight - sab`, en dat is een geldige toets voor de desktopregel
(`height: calc(100dvh - --pl-top - --pl-sab)`) maar niet vanzelf voor de regel
uit `@media (max-width:760px)`, waar `.app` `height:auto` krijgt en bewust de
scrollende kolom is die langer dan het scherm mág zijn. Het kan dus de layout
zijn óf de meting. Wat het uitmaakt is één blik op het toestel — scroll de live
view helemaal naar beneden en kijk of de onderste regel vrij blijft van de drie
knoppen, STAP 9 van de campagne, die deze rit niet is uitgevoerd. Dat #71 laat
zien dat het probleem op deze app echt bestaat, maakt het onderzoeken waard;
het maakt de meting nog niet juist.

### Blok 14 las de opruimregel in het verkeerde boek — 01-09-2026 (issue #29)

**De melding.** Op de rit van 27-08 zei blok 14: *"niets opgeruimd in 9 min — na
vijf minuten had de regel moeten kunnen vuren; controleer of hij aanstaat"*.
Het app-log van diezelfde rit bevatte twee opruimacties, allebei binnen het
meetvenster. De regel stond dus aan en had gevuurd; het advies stuurde je naar
precies het onderzoek dat je niet moest doen. Dezelfde soort fout als #12: een
controle die de omgekeerde conclusie presenteert is duurder dan geen controle.

**Twee oorzaken, achter elkaar gevonden.**

1. *Gerepareerd op 28-08.* De testrun las de app-log als
   `window._appLog || window.logBuffer || []`. Geen van beide globals bestaat
   in `public/`, dus alle drie de leesplekken kregen altijd een lege lijst —
   zonder ooit een fout, want de `|| []` ving het op. De echte bron is
   `plLokaalLog()`. Bewaakt door `test-applog.js`.
2. *Gerepareerd op 01-09.* De bron die er daarna wél was, was nog steeds de
   verkeerde. **Beide logs zijn ringbuffers.** `localLog` in
   `pidlane-auth.js` doet `shift()` bij 500 regels; `_btLog` in
   `pidlane-btflow.js` kapt af op 1400. Een rit van een half uur wist daarmee
   zijn eigen bewijs — en wat als eerste sneuvelt is het *oudste*, dus juist de
   opruimactie van vroeg in de rit.

**Wat er nu staat.** Blok 14 punt 4 leest `pidOpgeruimdLijst()` uit
`pidlane-pidgate.js`: een `Set` die de hele sessie blijft staan, met per PID de
reden erbij. Het log doet nog mee voor de tijdstippen, maar beslist niets meer.
De melding zit in `_opruimStand()` — een eigen functie zonder browser-afhankelijk-
heden, met vier standen:

| stand | oordeel |
|---|---|
| gate gevuld | LET OP — telling met PID, naam en reden; dit is de meting waar #16 een drempel op moet kiezen |
| gate leeg | ok — *"gemeten aan de gate zelf"*, een uitkomst en geen storing |
| gate leeg, log noemt er wél een | FOUT — twee bronnen die hetzelfde horen te weten spreken elkaar tegen |
| geen bron | LET OP — geen conclusie |

`test-opruimmelding.js` toetst dat met 27 toetsen en een tegenproef: de oude,
log-lezende versie is nagebouwd en zakt op dezelfde invoer. Bouw je de fout terug
in de echte functie, dan worden 13 toetsen rood.

**Wat hier niet is opgelost, en waarom het blijft staan.** `localLog` kapt nog
steeds *stil* af: `shift()` laat niets achter dat zegt dat er iets weg is. De
BT-log doet dat wél (`… N regels weggelaten (geheugen-cap) …`). Blok 14 heeft er
geen last meer van, maar het logboek dat je zelf openslaat nog wel — daar mist
zwijgend het begin van een lange rit, en dat is precies de vorm waarin deze bug
maanden bleef staan. Aparte wijziging in een apart bestand, dus een eigen commit.

**Wat een rit nog moet uitwijzen.** Of blok 14 in de draaiende app inderdaad
sensoren noemt die in het logboek niet meer terug te vinden zijn. Dat verschil
is het bewijs dat het log afkapte — en tot nu toe is dat een redenering en geen
meting.

### De slimme weergave werd de standaard — 01-09-2026 (issues #68, #66)

**Wat er gevraagd werd:** de weergave uit #61 meteen als startweergave, en
toerental, gaspedaal en motorbelasting in een vorm waarin ze naast elkaar te
lezen zijn (#68).

**Wat er onderweg boven water kwam, en dat is het bewaren waard.**
`setPidView()` schreef de gekozen weergave keurig weg in `pl_pidview`, en
**niemand las die sleutel ooit terug**. De aanroep in `pidlane-theme.js` zei
het er zelfs bij: `setPidView('dots'); // live view start altijd in
puntjes-weergave (genegeerde voorkeur)`. Dat is geen halve functie maar een
belofte die niet werd nagekomen: je kiest iets, de app slaat het op, en gooit
het bij de volgende start weg. Zichtbaar voor de gebruiker, onzichtbaar in de
code, want er ging niets kapot.

Eronder zat het patroon dat hier vaker toeslaat: **drie plekken die iets over
dezelfde vraag zeiden, en alle drie iets anders.** `let pidViewMode='dots'` in
`pidlane-pids.js`, `class="pidview-btn active"` op de Trends-knop in
`index.html`, en de aanroep met `'dots'` in `pidlane-theme.js`. Bij het openen
stond de Trends-knop dus actief terwijl je naar puntjes keek. Er is nu één
bron (`PID_VIEW_STANDAARD`) en één plek die hem toepast
(`plPidViewHerstel()`); `test-slimmeweergave.js` toetst bovendien dat de
actieve knop in de HTML dezelfde weergave aanwijst als de code.

**En een derde stille overschrijving:** `toggleLade()` zette de weergave op
`'dots'` zodra het sensorkeuzescherm openging. Zolang `'dots'` óók de
standaard was viel dat niet op. Met Slim als standaard zou het elke sessie
raak zijn geweest — sensoren kiezen is het eerste wat je doet, dus je had de
nieuwe standaard nooit gezien, en er komt geen melding bij: je staat gewoon
ineens ergens anders. Die regel is weg.

**De tellerplaat (#68) en waarom hij een andere meetlat heeft.** Toerental,
gaspedaal, gasklep en motorbelasting staan nu als staande meters naast elkaar
in één paneel (`SLIM_METER` in `pidlane-data.js`, `slimMeterBouw()` in
`pidlane-pids.js`). De meter toont de **stand binnen het eigen bereik**
(0-8000 rpm), terwijl de temperatuurbalk de **marge tot de eigen grens**
toont. Dat verschil is met opzet en het is ook precies waarom ze niet in één
diagram kunnen: een gaspedaal *heeft* geen gevarengrens — vol gas is geen
storing — dus "hoe dicht bij de grens" is daar een vraag zonder antwoord.
Liggend en staand zijn daarom twee vormen met twee betekenissen; hetzelfde
plaatje voor allebei zou de fout van "één ding, twee rollen" herhalen.

De EGR-klep (`012C`) en de EVAP-spoelklep (`012E`) staan er bewust **niet**
op. Ze zijn ook een kleppositie in procenten, maar ze horen bij de
emissieregeling en niet bij wat de bestuurder doet; naast een gaspedaal
gelegd nodigen ze uit tot een vergelijking die niets betekent. Dat is een
redenering en geen meting — blijkt tijdens een rit het tegendeel, dan is het
één regel in `SLIM_METER`.

**Wat hiermee van #66 af is, en wat niet.** De eerste helft van #66 ging over
`slimTempSchaal()`, die zonder `dH` en zonder `wH` terugvalt op het maximum
uit de PID-definitie. Zo'n balk staat laag omdat de grens onbekend is en niet
omdat het koud is, en dat verschil was op het scherm niet te zien. De schaal
is **niet** veranderd — dat zou een verzonnen getal zijn — maar die balken
zijn nu gearceerd met uitleg in de tooltip, en blok 5 van de testrun schrijft
op wélke sensoren van déze auto het betreft. Daarmee is de vraag uit #66
beantwoordbaar geworden in plaats van beantwoord. De tweede helft (de drempel
van 2% voor "beweegt") staat nog open, maar is wel minder zwaar: de
duidelijkste bewegers staan nu op de tellerplaat, dus het vak "Beweegt" is
een stuk rustiger dan vanmiddag.

### Vijf meldingen uit het gebruik — 01-09-2026 (issues #58 t/m #62)

Vijf losse klachten, geen ervan diep, alle vijf elke rit in beeld. Twee ervan
zijn hier het bewaren waard omdat de oorzaak ergens anders zat dan waar hij
leek te zitten.

**#58 — het getal 46, negen keer gekopieerd.** De onderkant van het scherm viel
weg achter de drie Android-knoppen (Galaxy S10+). De verleiding is dan te
zoeken naar het venster dat te lang is. Dat was het niet: `.app` stond op
`calc(100vh - 46px)`, en 46 was de hoogte van de topbalk **in de tijd dat die
balk ook echt 46px hoog was**. Sinds Android edge-to-edge afdwingt is hij
`46px + --pl-sat`, en dat verschil viel er onderaan uit — samen met de
navigatiebalk, die nergens werd meegeteld. Datzelfde getal stond op negen
plekken: `#welcomeScreen`, de zijpaneel-lade, `#remPill`, `#busyPill`.

De ronde van 28-08 had de veilige zones al ingevoerd (`--pl-sat`/`--pl-sab`) en
`test-schermranden.js` bewaakte ~20 volschermvensters. Wat er ontbrak was de
gewone app-schil — precies het scherm dat je het vaakst ziet. Er is nu één
token erbij, `--pl-top` (= `46px + var(--pl-sat)`), en blok 3 van
`test-schermranden.js` wijst elk kaal `calc(100vh - 46px)` af.

> **Nog niet nagemeten op een toestel — issue #65.** De hele rekensom hangt
> aan wat Capacitor in `--safe-area-inset-*` zet. Levert dat verkeerde
> getallen, dan klopt de som nog steeds en staat het beeld tóch fout. Blok 5
> van de testrun logt daarom de gemeten hoogtes; staan die op 0 terwijl er
> zichtbaar een balk is, dan zit het probleem daar en niet in de CSS.

**#60 — de balk liep vol, maar niet door de regels.** In demostand groeide
"🔗 Automatische bevindingen" door tot voorbij de onderkant van het scherm.
`CORRELATION_RULES` telt vijf regels, dus daar kon het niet aan liggen — en
dat is ook zo. Het tweede deel van de engine is de bron: *leren-van-normaal*
levert één bevinding **per actief PID** dat meer dan `BASE_DREMPEL` sigma van
zijn eigen historie afwijkt. Met veertig aangevinkte sensoren zijn dat veertig
regels, en gesimuleerde demodata wijkt per definitie overal af.

Het plafond zit daarom in de weergave en niet op de bevindingen zelf: er staan
er hoogstens twee in beeld, de rest zit achter een venster, en
`correlationLines()` geeft de AI nog steeds álles. De schakelaar in het
☰-menu is dus een schermkeuze en verandert de diagnose niet — dat staat ook
letterlijk in het venster, want "uit" dat stiekem ook de analyse verandert is
precies het soort dubbele betekenis waar deze codebase al drie keer een bug
aan overhield.

**#61 — de slimme weergave leunt op één aanname.** De temperatuurbalk zet elke
sensor af tegen zijn **eigen** gevarengrens (`dH`, anders `wH × 1,2`, anders
`max`) en niet tegen een gedeelde graden-as. Zonder dat is het diagram
onleesbaar: koelwater op 90 °C naast uitlaatgas op 600 °C zou een streepje
naast een volle balk zijn, terwijl het eerste alarmerend is en het tweede
volstrekt normaal. Voor een PID zonder `dH` én zonder `wH` valt de schaal
terug op het maximum uit de definitie, en dan is de balk grof. Welke dat in de
praktijk zijn, blijkt pas met een auto ernaast — issue #66, samen met de
drempel van 2% waarboven een signaal een trendlijn krijgt.

**#62 — de vraag die de diagnose raakt.** Vóór een analyse werd alleen gevraagd
of eerder gemaakte data hergebruikt mocht worden. Een auto met start/stop zet
bij stilstand de motor uit: toerental naar 0, spanning zakt in, koelwater loopt
op zonder circulatie. In de data is dat niet te onderscheiden van afslaan.
Zonder die ene vraag kán de AI dat verschil niet maken, en meldt hij een
storing op een auto die precies doet wat hij hoort te doen.

De vragenlijst staat als data in `PL_VOORVRAGEN` (`pidlane-archief.js`), dus
een vraag erbij is één item. **Wélke vraag ontbreekt, is niet vanaf een bureau
te bepalen** — dat leert alleen een rit met een rapport dat ernaast zat. Zie
issue #64.

**#59 — geen les, wel een grens.** De ronde van 26-08 gaf de gebruiker terecht
de keuze terug over het protocol, maar zette daarvoor alle negen protocollen
onder elkaar op het scherm. De keuze is niet ingeperkt (`PROTOCOLS` is
ongewijzigd en `test-protocolkeuze.js` bewaakt nog steeds dat er meer dan één
optie in de lijst zit); alleen het aantal dat *tegelijk* in beeld staat.

### De terugknop schakelde de app weg — 01-09-2026

**Klacht:** de Android-terugknop sloot PidLane onbedoeld. Twee reparaties
lang bleef dat staan, allebei in `pidlane-archief.js`, en allebei terecht —
daar was niets mis.

**Oorzaak:** er hingen **twee** luisteraars aan `backButton`. Eén in
`pidlane-archief.js` (`appBack`) en één in `pidlane-theme.js`
(`closeTopOverlay`). Capacitor roept élke luisteraar aan; een luisteraar
onderdrukt de ander niet. De tweede deed `minimizeApp()` zodra zijn eigen,
kortere lijst niets herkende — en op het welkomstscherm herkende die lijst
per definitie niets. Eén tik op terug zette de app dus op de achtergrond,
dwars door de melding "tik nogmaals om af te sluiten" van de eerste heen.

**Waarom het niet te vinden was.** Wie in `archief.js` keek, zag een handler
die precies deed wat hij moest doen. De fout stond ernaast. En vanuit JS is
een tweede luisteraar niet te tellen: Capacitor houdt die lijst native bij
(`AppPlugin.hasListeners`), er is geen registry, en de handler die je wél
kunt aanroepen draait gewoon door alsof er niets anders is. Een gedragstest
van de ene handler staat dan groen terwijl de andere de app wegschakelt.

De les is niet welke van de twee gelijk had, maar de vorm: **twee luisteraars
op één hardwareknop zijn geen dubbele zekerheid maar een race, en de
verliezer is onzichtbaar.** Dezelfde vorm als "één ding heeft één betekenis"
in `CLAUDE.md`, nu voor een gebeurtenis in plaats van een class.

**Wat het níét was**, hoewel het daarop leek — nagemeten, niet aangenomen:

| verdachte | wat de meting zei |
|---|---|
| de `www`-map | stub; de app laadt live via `server.url`. Raakt de terugknop niet |
| `@capacitor/app` ontbreekt | zit erin (8.1.1) en `cap add android` vindt de plugin |
| de native AppPlugin sluit af | doet hij niet: zonder JS-luisteraar hooguit `webView.goBack()`, nooit `finish()` |
| bridge-JS ontbreekt bij een remote `server.url` | `WebViewLocalServer.handleProxyRequest()` injecteert hem in het HTML-antwoord; `window.Capacitor.Plugins.App` bestaat in de APK |
| predictive back (targetSdk 36) | AndroidX 1.11 stuurt door naar de `OnBackPressedDispatcher`; de callback van de plugin staat altijd aan |

**Opgelost:** `closeTopOverlay()` is weg, luisteraar en al. De takken die
alleen daar stonden (`needsUpdateModal`, `.pick-overlay`, `neonDash`,
`climateDash`, `kebabMenu`, `connOv`) zijn opgenomen in `appBack()`, op hun
plek in de volgorde meest-modaal → minst-modaal. `exitApp()` is eruit: de
terugknop schakelt de app niet meer weg — niet afsluiten en niet
minimaliseren. Verlaten gaat met de home-knop of het takenoverzicht.

Nieuw is `_plZichtbaar()`: één zichtbaarheidstoets voor de hele ketting,
inclusief de `.hidden`-class. Die toets kwam uit `closeTopOverlay` en stond
niet in `appBack` — een venster dat met `.hidden` dicht staat gold daar als
open, dus "sloot" back iets wat allang dicht was en deed de knop in de ogen
van de gebruiker niets.

`test-terugknop.js` bewaakt beide helften: de echte ketting draait in een
nagebouwde DOM (gedrag), en een bronregel-toets telt de luisteraars — dat
laatste met reden, want dat is vanuit JS niet waarneembaar.

**Wat open blijft:** dat de terugknop de app nooit meer verlaat is een keuze,
geen natuurwet. Voelt het bij gebruik te streng, dan is `_plBackHandler()` in
`pidlane-archief.js` de enige plek om het terug te draaien.

### De belofte zonder knop — 29-08-2026

`#41` is opgelost, en het is de derde van dezelfde soort op één dag. `#31` was
een spoor dat maar één kant op wees, `#49` een teller die iets anders beweerde
dan de server wist, en dit was een **verklaring over persoonsgegevens die de app
niet kon waarmaken**.

`privacy.html` zei letterlijk "Gegevens bij je account verwijder je via *Mijn
account*", en `pidlane-privacy.js` herhaalde dat in het disclosurescherm. Die
knop bestond niet, en er was geen verwijderroute in `worker.js`. Google eist het
bovendien voor elke app waarin je een account kunt aanmaken: een verwijderoptie
ín de app én een publiek bereikbare URL voor het veld *Data deletion*.

**Markeren in plaats van meteen wissen.** `POST /klant/verwijder` zet `Status`
op `"verwijderd"` en het moment in het nieuwe veld `VerwijderdOp`; het record
verdwijnt `KLANT_BEWAARDAGEN` (30) dagen later. Voor de gebruiker is het account
meteen weg — inloggen wordt geweigerd en een lopend sessietoken ook — maar een
vergissing is nog te herstellen. Het wachtwoord moet erbij: een sessie is genoeg
om je saldo te bekijken, niet voor iets onomkeerbaars op een toestel dat even
onbeheerd op de werkbank ligt.

**Wat er ontbrak en het meeste werk was: de opruimer.** Er was geen cron en geen
`scheduled()`-handler in dit project. "Binnen 30 dagen" hing dus aan iemand die
eraan denkt, en dat is precies de vorm van belofte die na een half jaar niet meer
klopt. Er staat nu een dagelijkse cron (`[triggers]` in `wrangler.toml`, 03:00
UTC) én een knop in `admin.html` die dezelfde functie draait. Die twee samen zijn
een bewuste keuze: **een automaat die je niet kunt zien is een automaat waarvan
je maar moet aannemen dat hij draait.** De adminlijst toont de wachtrij met de
datum waarop elk record weggaat.

**De regel die het meest fout kan gaan, en waarom hij is zoals hij is:** een
record met `Status = "verwijderd"` maar zónder bruikbare `VerwijderdOp` wordt
*niet* gewist en *wel* gemeld. Wissen mag niet — de termijn is niet aantoonbaar
om — en stil laten staan mag ook niet, want dan blijft er persoonsgegeven staan
terwijl de verklaring zegt van niet. Beide fouten zijn in productie onzichtbaar;
daarom staat de mislukt-lijst zowel in het cron-log als in het adminscherm.

**Eén beslisplek voor toegang.** `Status === "geblokkeerd"` stond twee keer los
in `worker.js`: in `handleKlantLogin` en in `handleMessages`. Dat ging goed
zolang er één afwijzende status was. Met "verwijderd" erbij is het de vorm waarin
de tweede plek wordt vergeten — en dan kan een verwijderd account met een lopend
sessietoken nog gewoon AI gebruiken. `klantToegangProbleem()` is nu de enige die
daarover gaat.

**Het akkoord blijft geldig.** `CLAUDE.md` waarschuwt dat een gewijzigde
verwerking de toestemmingstekst meeverandert en een eerder akkoord ongeldig
maakt. Dat speelt hier niet: er wordt niets méér of anders verwerkt. De belofte
werd waargemaakt, niet veranderd. `test-toestemmingstekst.js` bewaakt de claim
over de meetdata en staat hier los van.

**Een valkuil bij het uitbreiden van `worker.js`.** `test-akkoord-heraccorderen.js`
knipt het stuk tussen de akkoordgrens en `klantPubliek` uit het bestand en voert
dat los uit. Alles wat je daartussen zet valt om op `__name is not defined`. De
nieuwe klanthelpers staan daarom bewust vóór die grens, met een waarschuwing
erbij — die tijdens het schrijven hiervan één keer is opgelopen.

### Twee sporen die er niet waren — 29-08-2026

`#31` en `#49` zijn opgelost, en ze deelden een vorm die het benoemen waard is:
**de app kon iets doen zonder dat er iets van overbleef.** Dat is niet hetzelfde
als een ontbrekende logregel. Wie een half spoor ziet, trekt er een hele
conclusie uit — en dat is precies wat er gebeurde.

**#31 — de asymmetrie was misleidend, niet onvolledig.** Een sensor uitzetten
werd gelogd, aanzetten niet. Het log van 27-08 had dertien regels "Sensor
uitgezet via dubbeltik" en nul regels over een sensor die erbij kwam. Wie dat
leest concludeert redelijkerwijs dat de selectie alleen kleiner is geworden. Bij
het nakijken van die rit was daardoor niet te beantwoorden of de vijftien
niet-bewegende sensoren uit blok 14 het gedrag van de auto waren of handmatig
aangezette PIDs die de ECU niet kent — het verschil tussen een bevinding en ruis.

De fix is niet "voeg een regel toe bij het aanzetten". Vijf gebruikershandelingen
wijzigen `activePIDs` (vinkje in het keuzescherm, dubbeltik op een tegel,
standaardset, "+ Alles" per categorie, preset), en die melden nu alle vijf via
één plek: `plSelectieMeld()` in `pidlane-pidgate.js`. Drie losse regels die
sommige van die plekken zelf schreven zijn weg, inclusief `Sensor uitgezet via
dubbeltik`.

De ontwerpkeuze die het meeste oplevert: **de melder krijgt geen lijst van wat
er zou veranderen, maar een momentopname van vóór de handeling**, en rekent het
verschil zelf uit tegen de echte `activePIDs`. Een aanroeper kán daardoor niet
iets anders melden dan wat er gebeurd is. `selectStandardSet()` telde
bijvoorbeeld hoeveel PIDs er in de standaardset zaten — maar zodra er al iets
aanstond is dat niet hetzelfde als wat erbij kwam.

**#49 — het proeftegoed hing aan het toestel.** `saldo()` in
`pidlane-credits.js` deelde `CFG.gratisStart` (25) uit zodra de
localStorage-sleutel ontbrak. App-gegevens wissen was daarmee een knop die
onbeperkt nieuwe tokens gaf. Zolang de Worker het echte saldo bijhield was dat
onschadelijk, en zo stond het ook in het issue — maar het besluit van 28-08
maakt credits het enige verdienmodel, en dan is een tweede plek die tegoed
uitdeelt het grootste gat. Bijkomend: het toestel deelde er 25 uit en
`handleKlantOnboarding` 20, twee getallen voor één begrip.

De client deelt nu niets meer uit en telt niets meer bij. Het proeftegoed komt
uitsluitend van `/klant/onboarding`, dat `KLANT_START_SALDO` bijboekt en
`StartTegoedGegeven` zet — per account precies één keer. localStorage is nog een
afschrift van het serversaldo.

**Wat daarbij het makkelijkst fout gaat, en hier expres niet fout ging:** het
gat dichten door "geen sleutel" als nul te lezen. Dan blokkeert `preflight()`
elke analyse op een nul die de client zelf verzon. `saldo()` kent daarom **drie**
toestanden — zoveel, nul, en *onbekend* — en de drie plekken die er een besluit
op nemen (de saldochip, het kostenvenster, `preflight()`) vragen
`saldoBekend()` erbij. Onbekend laat door; de Worker weigert alsnog met 402 als
het tegoed echt op is. Dat is dezelfde verdeling als bij `_boekServer()`:
afrekenen vanuit de app is een verzoek, geen controle.

**Een eerdere conclusie die herzien is.** In `vergeetKlant()` stond met nadruk
dat het wissen van de saldosleutel "de voor de hand liggende fix is en fout":
wissen leidde tot een ontbrekende sleutel, en die deelde 25 tokens uit, dus
uitloggen werd een gelduitgifteknop. Die redenering klopte binnen haar eigen
aanname — en de aanname was het probleem, niet de conclusie eruit. Nu de client
geen tegoed meer uitdeelt is wissen juist wél goed, want "onbekend" is precies
wat we na uitloggen weten. `test-inlog-sessie.js` eiste het omgekeerde en is
meegedraaid, met de oude reden erbij.

Van #49 blijft open: **promptcaching** (meten vóór bouwen — de cache werkt op
een exacte prefix en `ai_system_override` zit daarin) en de structurele kant,
**`Users` als beheerrol in plaats van klantcategorie**. Het menu-item "Mijn
account" is wel al meegenomen: `pasMenuAan()` verbergt `kbAccount` voor een
niet-klant, om dezelfde reden en in dezelfde functie als het adminblok.

### Zetten is de gevaarlijke variant, en die liep buitenom — 03-09-2026

**#93.** Bij het repareren van #82 is `bijboeken` door `metSaldoSlot()` gehaald
en is de actie `update` er bewust buiten gelaten, met een reden die opgeschreven
is en er goed uitzag: bij zetten stuurt de beheerder het eindbedrag, dus gaat er
iets mis dan ziet hij een getal dat hij zelf heeft ingetikt. Bij bijboeken rekent
de Worker, en dáár is een rekenfout onzichtbaar.

Die redenering dekt de helft. Zetten rekent niet, maar het overschrijft, en
overschrijven is even onzichtbaar als verkeerd rekenen — zie §8 voor het
mechanisme en voor wat er nu staat. Wat hier de moeite waard is, is dat dit
**dezelfde fout in dezelfde week** is: bij #82 stond er ook een gedetailleerde
waarschuwing die over het verkeerde geval ging, en die anderhalve maand bleef
staan omdat een benoemd risico voelt als een afgewogen risico. Bij #93 was het
geen waarschuwing maar een vrijstelling — "dit geval hoeft niet" — en die leest
nog dwingender, want er staat een reden bij.

**De vraag die het onderscheid had gemaakt** is niet "kan hier iets misgaan"
maar *welke botsing bedoelen we eigenlijk?* Bij #82 werd beheerder × beheerder
afgewogen terwijl beheerder × klant het geval was. Bij #93 werd "rekent de
Worker?" afgewogen terwijl "wordt er overschreven?" de vraag was. Beide keren
was het antwoord op de gestelde vraag juist.

**En er zat een tweede helft in die niet in de Worker zat.** Een slot beschermt
het schrijven, niet het besluit: de knop in `admin/admin.html` liet de beheerder
een verschil bevestigen dat op een mogelijk minuten oude lijst was uitgerekend.
Dat verschil is nu een voorwaarde (`saldoWas`) die de Worker binnen het slot
natelt — de reparatie liep dus over twee bestanden, en de Worker-helft alleen
zou de misleidende belofte hebben laten staan.

**Wat dit nog niet oplost.** Of "zetten" überhaupt moet blijven bestaan nu
`bijboeken` het veilige pad is, is niet beantwoord. Hij bestaat voor het geval
dat je een verkeerd getal moet rechttrekken; dat is zeldzaam en het is de
gevaarlijke variant. De vraag staat in #93 beschreven en is bewust niet in deze
ronde beslist.

### De tokenketen nagelopen — 02-09-2026

Aanleiding: de vraag of de openstaande tokenissues klopten. Ze klopten, maar er
lag meer omheen. Vier vondsten, en drie ervan waren in het gebruik onzichtbaar —
geen foutmelding, geen rode rand, niets.

**Een activatiecode kon verbranden.** `handleCreditsRedeem` stempelde de code
eerst af als gebruikt en keek pás daarna of er een ingelogde klant was om hem op
bij te schrijven. Was die er niet, dan kwam er `ok:true` met `saldo:null` terug:
code verbruikt, tegoed nergens. De app haakte daar sinds 29-08 zelf al op af
(`verzilver()` weigert zonder klantaccount) — maar een controle in de app is een
verzoek en geen grens. De sessiecontrole staat nu vóór de eerste schrijfactie,
en `GebruiktDoor` komt uit die sessie in plaats van uit de body, waar de
aanvrager hem zelf kon invullen.

Het commentaar erboven legde die vorm nog uit als een bewuste keuze: "werkt
BEWUST zonder account — de gratis proef en de eerste aankopen moeten drempelloos
zijn". Die keuze was met #49 vervallen; het commentaar was blijven staan. **Een
uitleg van een keuze veroudert net zo hard als de code, en leest dwingender.**

**De teller liep op de schatting.** De Worker boekt af op het echte verbruik en
stuurt het saldo terug in `X-PidLane-Saldo`; §8 hierboven beschreef sinds juli
dat `apiFetch` die uitleest. Er las niemand — nergens in `public/` stond die
header. De schatting van `boek()` is nooit precies de afboeking: bij een
mislukte PATCH ging er niets af terwijl de app wel aftrok, en bij een
onleesbaar antwoord boekte de Worker het minimum en de app een volle schatting.
`PLCredits.volgServer()` leest hem nu uit, op beide paden — na een geslaagd
antwoord en bij een 402, waar het saldo in de body staat.

**De tokenchip volgde het laadmoment (#52).** Uitgebreid beschreven in het
issue; de kern is dat `PLCredits.chip()` als publieke ingang bestond en door
niemand werd aangeroepen. `finishLogin()` en `logout()` doen dat nu. Daarbij
kwam een toestand aan het licht die niet in het issue stond: `_vrijgesteld()`
had drie takken en NIEMAND ingelogd viel er doorheen, waardoor er ook op het
loginscherm een chip stond. De regel is nu één zin — alleen een ingelogde klant
betaalt met tokens, en alleen die ziet de chip.

**En het kasboek dat niet bestaat (#83).** Zie §8. Dat is de vondst die het
patroon zichtbaar maakt: twee keer stond er een correcte beschrijving van iets
dat niet gebouwd was, en beide keren was dat genoeg om het jaren te laten
liggen.

Wat níét in díé ronde is meegenomen was **#82**, bijboeken vanuit
`admin.html` als enige saldoschrijver buiten `metSaldoSlot()` om. Dat is op
02-09-2026 in een eigen commit gerepareerd; zie §8 voor waarom de waarschuwing
die er stond de verkeerde botsing beschreef.

### Het verslag klopt weer met de meting — 02-09-2026

De vijf bevindingen uit de run van 01-09 die geen rit nodig hadden: #78, #76,
#77, #75 en #72. Vier ervan zijn dezelfde soort fout als #29, #30 en #74 — **de
app meet goed en rapporteert iets anders** — en de vijfde is de bron waaruit twee
van die rapporten putten.

**#78 zat niet in het verslag maar in de app, en het waren twee fouten.**
`_pidHealth` werd op precies twee momenten gevuld (de scan bij het verbinden, of
een bewaard voertuigprofiel) en daarna nooit meer herzien. De scan doet één
uitvraag per PID met een timeout van 1500 ms; komt daar niets uit, dan staat
`nodata` er de hele sessie — en het gaat mee het profiel in, dus de volgende
sessie ook. `autoSelectHealthyKern()` en de PID-gate draaien op dat oordeel, dus
een sensor die één keer te traag was blijft uitgegrijsd. `plHealthHerzien()` laat
zo'n oordeel nu vervallen zodra er een geldige meting binnenkomt: alleen naar
boven, alleen als de waarde dezelfde meetlat haalt als de scan, en zichtbaar in
het logboek.

Van de vier PIDs uit de run waren er echter twee helemaal niet gemist. `0101` en
`0121` werden **actief** op `nodata` gezet door de dummy-detectie in
`assessPidQuality()`: een waarde exact op het definitie-minimum in categorie
Temp/Emissie heet daar "waarschijnlijk niet aanwezig". Voor de MIL-familie is
nul juist het antwoord dat je hoopt te krijgen. Blok 14 van de testrun wist dat
al — dezelfde PIDs staan daar in `MAG_STIL`. Twee plekken in dezelfde app met
een tegenstrijdig oordeel over dezelfde PID. `PID_NUL_NORMAAL` in
`pidlane-data.js` is nu de ene plek; beide lezen hem.

**#76 was een kopie die niet meeverhuisde.** `PLBudget.zone()` in de testrun
hield een eigen versie bij van de beslissing die `PLLoad.tick()` neemt, en die
kopie stond nog op de regel van vóór 23-08 (`bezet >= bezetOp || fout >=
foutOp`). Blok 7 meldde daardoor "druk 87%" naast "tempo 100% → 100%" en "geen
enkele stap omlaag" — met de echte regel was druk 0%. `PLLoad.zoneVan()` is nu
een pure functie die `tick()` zelf gebruikt en die de testrun leent; ontbreekt
PLLoad, dan meldt blok 7 "niet te bepalen" in plaats van een nabouw.

Daar hoorde een tweede correctie bij die niet over de zones ging: de **Slotsom
van blok 7 kon twee standen niet onderscheiden**. "0 ongevraagde remmomenten"
betekende zowel "hij remde en deed dat steeds terecht" als "hij heeft nooit
geremd". Alleen de eerste zegt iets over de vraag; de tweede is een rit waarin
de meting niet heeft plaatsgevonden. #15 zou op die tweede zijn gesloten.

**#77 telde de eerste verbinding als herverbinding.** `PLRit.start()` draait bij
het laden van de app, dus de tikken vóór het verbinden zetten `vorigVerbonden`
op false. Elke sessie meldde er zo minstens één, bij 0 gaten — en de regel
eronder stuurt je bij "herverbinding zonder gat" naar de bus of de adapter. Een
vals spoor in precies de meting die #18 moet beantwoorden.

**#75 en #72 waren één probleem in twee bestanden.** "Meldingen sinds het begin
van deze run" telde `app.length` en `bt.length`: de hele ringbuffer, zonder
tijdsgrens. In de run van 01-09 meldde hij 33 app-logregels, waarvan de laatste
van 22:29:21 — de run begon om 22:32:02. Dat viel niet te repareren zonder #72,
want beide logs droegen alleen een kloktijdstring en geen epoch. Nu zetten
`log()` en `btDiag()` er `t` bij (`PIDLANE-CONTRACT.md` §6: tijden zijn epoch,
de kloktijd is voor het scherm), telt de regel vanaf `_trStart`, en meldt hij
hoeveel regels hij niet kon dateren in plaats van ze stilzwijgend weg te laten.

En de app-log kapt eerlijk af: kop (300), staart (700) en een zichtbare regel
ertussen, precies zoals de BT-log dat al deed, met de cap van 500 naar 1200. Wat
er als eerste uitrolde was juist het oudste — de opstart, de protocolkeuze, de
eerste opruimacties — en dat is het deel dat je na een lange rit wilt teruglezen.

### Drie stille fouten in de meetkant — 28-08-2026

Alle drie van dezelfde soort, en die soort is het waard om te benoemen: **de
app mat goed en rapporteerde verkeerd.** Niet "de meting deugt niet", maar "de
conclusie eronder hoort niet bij de meting". Van buitenaf niet te onderscheiden
van een echte bevinding, en daarom het duurste type dat dit project kent — het
kost vertrouwen in álle uitkomsten, niet alleen in die ene.

**De app-log kwam nooit binnen (#29).** Op drie plekken stond
`window._appLog || window.logBuffer || []`, en beide globals bestaan nergens in
`public/`. De `|| []` ving het netjes op, dus er was nooit een fout — alleen
altijd een lege lijst. Gevolgen: blok 14 zei "niets opgeruimd" terwijl de
opruimregel twee keer had gevuurd, blok 11 meldde "app-log 0 regels" naast 1183
BT-regels, en het opgeslagen rapport had nooit een APP-LOG-sectie.

Het venijn zat in het advies: *"na vijf minuten had de regel moeten kunnen
vuren; controleer of hij aanstaat"*. Dat stuurt je naar precies het onderzoek
dat je niet moet doen. Een controle die een verkeerde conclusie trékt is erger
dan een controle die zwijgt.

De echte bron is `plLokaalLog()` — die `pidlane-logboek.js` al las. Nu één
helper `_appLogRegels()`, die bij een fout **meldt** in plaats van stil nul
terug te geven.

**Blok 7 presenteerde een nulmeting als "geen verschil" (#12).** De
deel-door-nul-vangst gaf `0`, en `0` viel door `|verschil| < 15` in de tak
"vrijwel geen verschil". 0 ms tegen 144 ms werd zo `+0%`. Nulmetingen vallen nu
vóór de mediaan uit de groep; een lege groep en een mediaan van nul krijgen
allebei een eigen uitkomst.

**De prijstabel klopte niet meer (#48).** Opus stond op de tarieven van de
Opus 3-generatie, en er stond een introductieprijs voor Sonnet 5 in die niet
bestaat — met een `Date.now()`-vergelijking die op 01-09-2026 vanzelf 50% te
hoog zou gaan tellen. **Een fout die geen enkele commit veroorzaakt, en die dus
door geen enkele review gevangen wordt.** Dat is het soort dat een test
verdient die op de klok-afhankelijkheid zelf let, niet alleen op de getallen.

**De les die hier onder ligt.** Alle drie waren onzichtbaar omdat er iets
*veiligs* omheen stond: een `|| []`, een deel-door-nul-vangst, een
`typeof`-guard. Die constructies verbergen precies wat ze horen te melden.
Waar een terugval een lege of neutrale waarde oplevert, hoort een melding —
anders is het verschil tussen "niets gevonden" en "verkeerd gezocht" van buiten
niet te zien.

Drie tests in de gate, alle drie met tegenproef: `test-applog.js`,
`test-bezetting.js`, `test-modelprijs.js`.

**Nog niet bewezen:** dat blok 14 de opruimregel nu écht meldt. Dat vraagt een
rit van minstens vijf minuten waarin de regel vuurt — de fix is aantoonbaar in
de gate, maar niet in de auto. Staat als STAP 2 in CAMPAGNE van testrun 5.3.

### Capacitor 8 — 28-08-2026, en wat er onbewezen blijft

De Play Store weigert per 31-08-2026 alles onder API 36. Het API-niveau van de
app komt niet uit deze repo maar uit het Capacitor-template: `android/` wordt
elke build opnieuw gegenereerd, en Capacitor 6 brengt API 34 mee. **Daarmee is
`package.json` het bestand dat bepaalt of de Play Store de bundel aanneemt**, en
dat stond nergens opgeschreven — de workflow controleerde de permissieset hard
en het API-niveau helemaal niet.

Dat is nu omgedraaid: `PLAY_MIN_TARGET_SDK` staat als één getal in
`build-apk.yml`, de build leest `android/variables.gradle` en stopt als het
daaronder zit. **Controleren, niet injecteren** — injecteren zet het getal op
twee plekken en dan is bij de volgende verhoging niet te zien welke wint. De
tegenproef is gedraaid op de echte templates: Capacitor 6 (34) wordt rood,
Capacitor 8 (36) groen, en een eis van 37 wordt weer rood.

De reden dat deze upgrade goedkoop was, is een eigenschap die het waard is te
bewaken: **de webcode importeert Capacitor nergens.** Alles loopt via
`window.Capacitor.Plugins.<naam>`. De SPP-plugin wisselde van `@e-is` naar
`@ascentio-it` — beide registreren als `BluetoothSerial` — en daardoor hoefde er
in `public/` geen regel code mee. Een `import` zou de volgende ronde duurder
maken.

**Wat hierbij níét bewezen is, en dus open staat:**

1. ~~**De vervangende SPP-plugin is niet aan een adapter getoetst.**~~ **BEWEZEN
   op 28-08-2026, 19:08** — testrun 5.2 op de Mazda CX-5 met de OBDLink MX+
   (STN2255), Android 16, Capacitor 8:

   - `read()` geeft nog steeds `{value:…}`, aangetoond met een echte gelogde
     regel: `read() #1 → {"value":"009\r0:410C0A150D00\r…}`
   - de volledige PID-sweep: **45 gelezen, 0 geen data, 0 parserprobleem**
   - 375 busverzoeken, 1 slecht, foutgraad 0%, gemiddeld 117 ms

   Daarmee is de zwaarste onbekende van de Capacitor-upgrade weg: de fork van
   `@ascentio-it` gedraagt zich op een echte adapter identiek aan `@e-is`. De
   statische vergelijking (zelfde bestandenset, namespace, plugin-naam,
   `@CapacitorPlugin`-annotatie, alle zeven methodes) is dus bevestigd door
   gedrag en niet alleen door lezen.
2. **`@ascentio-it` is een eenmansfork.** Beter dan een pakket dat sinds
   31-12-2024 stilstaat, maar geen garantie. Valt hij stil, dan is de terugval het
   plugin-mapje als lokale Capacitor-plugin in deze repo opnemen. Nu niet doen:
   dat is onderhoudslast die pas nodig is als het zover is.
3. **Edge-to-edge — bevestigd op een echt toestel, en meteen een gat gevonden.**
   Een schermfoto van 28-08 liet zien dat de topbalk netjes onder de statusbalk
   bleef, maar het Logboek-venster niet: "Logboek", "Sluiten" en de regelteller
   lagen half achter de systeemklok. De topbalk was op 28-08 de ENIGE plek die
   was aangepakt; de app bouwt ~20 andere volschermvensters zelf op met een
   losse `<div style="position:fixed;inset:0;...">`, elk met eigen padding en
   zonder gedeelde class — dus zonder gemeenschappelijke CSS-regel die ze in
   één keer meeneemt.

   Nagelopen welke vensters écht tegen de rand liggen (geen backdrop ertussen,
   in tegenstelling tot gecentreerde dialogen en onderaan-uitschuivende vellen —
   die blijven bewust ongemoeid) en van dezelfde `--pl-sat`/`--pl-sab`-tokens
   voorzien: het Logboek, het testrunpaneel, het Veldlab-dashboard, de "diepe
   diagnose"-stappen, en in `index.html` de neon-HUD, de rittracker en de
   caravantracker. `test-schermranden.js` bewaakt dat met tegenproef: alle vijf
   teruggedraaide varianten worden rood.

   Het Logboek is ook echt gemeten (Playwright, 412px): zonder inset staat de
   kop op 12px van de rand zoals altijd; met een gesimuleerde inset van 36px
   schuift hij mee naar 48px. De overige vensters zijn broncontrole — met
   reden erbij in `test-schermranden.js` — omdat ze pas openen na app-boot
   (netwerkverzoeken, voertuigstatus) die een kale testomgeving niet nabootst.

   **Op het toestel bevestigd (28-08-2026, 19:08, testrun 5.2):** de topbalk
   krijgt 37px marge (balk 83px), en het Logboek net zo — `padding-top volgt
   --pl-sat (37px marge)`. Twee van de zeven vensters zijn daarmee op een echt
   Android 16-toestel gemeten; de andere vijf (testrunpaneel, Veldlab, diepe
   diagnose, neon-HUD, rittracker/caravantracker) staan nog op broncontrole en
   vragen nog één blik met het oog.
4. **De topbalk is in `uiL` hoger dan zijn eigen `height`-regel zegt** (47px waar
   `height:42px` staat). Oorzaak: een flexitem heeft `min-height:auto`, dus de
   balk kan niet kleiner dan zijn inhoud. Dat gedrag is ouder dan deze wijziging
   en is hier niet aangeraakt — het staat genoteerd omdat het bij het meten
   verwarring gaf en de volgende keer weer zal geven.
5. **Blok 5 vroor de hele testrun dicht — zelfgemaakt, en meteen hersteld.**
   De controle die read()'s antwoordformaat wilde bewijzen deed dat eerst met
   een eigen `conn.spp.read({address})`, los van de normale poll-lus. Die
   poll-lus in `pidlane-bt.js` leest dezelfde serial-verbinding al elke 50ms;
   een tweede, losstaande read() ernaast concurreert om dezelfde bytes, en
   bleef hangen omdat de plugin kennelijk geen tweede gelijktijdige read
   verwacht. Gevolg: de hele testrun — een lange `await`-keten — liep vast op
   die ene regel, en "Sluiten" reageerde niet meer omdat de rest van de keten
   nooit aan de beurt kwam. Gemeld als "testrun-venster komt in beeld maar
   niets werkt, ook niet scrollen".
   Fix: geen eigen read() meer. `pidlane-bt.js` logt zelf al de eerste read()
   van elk commando (`read() #1 → …`, alleen bij `pollCount===1`) naar
   `_btLog`; blok 5 leest nu die bestaande regel terug in plaats van er zelf
   nog een uit te lokken. Les: een diagnostische controle die meeleeft in de
   testrun mag nooit I/O doen op een verbinding die de app zelf ook actief
   gebruikt — lezen uit wat er al gelogd is, nooit een eigen verzoek ernaast.

### Opmaakronde 27-08 — vier schermfouten, en drie issues die al dood waren

Aanleiding waren twee screenshots van een telefoon. Wat daarop te zien was, was
op een breed scherm onzichtbaar: **een opmaakfout die alleen bij weinig ruimte
ontstaat, bewijs je niet in een browservenster.** Alle vier de fouten hieronder
zijn dan ook op 412 px nagemeten, niet met het oog beoordeeld.

1. **Het logo werd doormidden geknipt.** `.logo` is het enige krimpbare kind van
   een balk met `overflow:hidden`, dus at elk chipje dat erbij kwam een stukje
   logo op. De regel onder 480 px zette alleen de *tekst* op `font-size:0` en
   liet het icoon staan — precies het verkeerde deel. Een half logo is geen
   kleiner logo maar een weergavefout, dus verdwijnt het daar nu in zijn geheel.
   De volgorde staat er nu bij: chips (bediening) gaan vóór het logo (versiering).

2. **Het tegelraster van de rit-monitor liep het scherm uit.** `repeat(4,1fr)`
   is `minmax(auto,1fr)`: een spoor mag niet smaller worden dan zijn langste
   woord. `INLAATLUCHT` duwde het raster 19 px buiten beeld, waardoor "Verbruik
   nu" er half afviel en de tegels 103/95/98/83 px breed werden in plaats van
   even breed. Met `minmax(0,1fr)` zijn het er vier van 90 px. Dit is de enige
   van de vier die met een tegenproef is vastgelegd: met de oude regel terug
   komt de overloop meetbaar terug.

3. **De waarschuwingskop botste met de Rapport-knop.** Zelfde soort oorzaak: een
   flexkind staat op `min-width:auto` en kan niet krimpen onder zijn langste
   woord, dus liep wat niet paste het scherm uit in plaats van af te breken.
   `min-width:0` haalt die bodem weg. **Let op — deze is niet gereproduceerd.**
   Op 412 px en op 320 px, ook op tekstgrootte L, brak de kop gewoon netjes af.
   De fix is dus onderbouwd met de oorzaak en niet met een nagebouwde fout; als
   het terugkomt, is de tekstgrootte-instelling het eerste wat erbij moet.

4. **Engels in een Nederlandse app.** "Basic system check" en "Start basic
   check" zijn vertaald. De demoknop op het loginscherm blijft wél Engels: die
   tekst staat woordelijk in de Play-reviewnotitie, en wat de reviewer leest en
   wat hij ziet moet kloppen. Dat is een besluit, geen vergeten regel.

**Drie issues waren al opgelost voordat ze werden aangemaakt.** #21, #22 en #23
zijn op 27-08 uit deze lijst naar GitHub verhuisd, maar #21 en #23 bleken op
`main` al te werken — de fixes waren op 24-08 meegekomen zonder dat de lijst
werd bijgewerkt. Dat is precies het risico dat het verhuizen naar issues moest
wegnemen en dat bij de verhuizing zelf één keer is misgegaan. #22 was half
opgelost: het symptoom was weg doordat die éne modal was opgehoogd, maar de
chips stonden nog op vier verschillende hoogtes (8500/9400/9400/9450), dus er
lag niets vast en de volgende modal zou er weer onderuit duiken. Er is nu één
rangorde in `pidlane.css` (`zwevend < topbalk < modal < opslaanvenster`) met
benoemde `--z-*`-variabelen; wie een chip of modal toevoegt leest die uit in
plaats van een eigen getal te kiezen.

`test-opmerkingveld.js` is nieuw: die draait `plOpslaan()` met een nagemaakte
DOM en kijkt of de ingetikte opmerking in de Blob terechtkomt — voor tekst én,
via een nagemaakte jsPDF, voor de PDF-route. Met de fout uit #23 nagebouwd (het
veld bij het ópenen uitlezen in plaats van bij de klik) wordt hij rood. Zonder
zo'n test zegt "het werkt" hier niets: je moet het bestand openen om het te
weten, en dan is de rit voorbij.

### Uitloggen mocht geen gratis tokens gaan uitdelen (28-08)

Issue #24 meldde dat `logout()` de `pl_credits_*`-sleutels niet wist: op een
gedeeld werkplaatstoestel zag de volgende gebruiker even het saldo van de
vorige. De voor de hand liggende fix — die drie sleutels weggooien — is fout,
en dat is hier het bewaarde stuk.

`saldo()` kent bij een **ontbrekende** saldosleutel het gratis proeftegoed toe
(`CFG.gratisStart`, 25). Wie de sleutel verwijdert maakt uitloggen dus een knop
die 25 nieuwe tokens uitdeelt, zo vaak als je erop drukt. De tegenproef in
`test-inlog-sessie.js` laat dat zien: met de naïeve variant geeft `saldo()`
na het uitloggen weer 25 en staat er `"25"` in de opslag.

`vergeetKlant()` zet de sleutel daarom op **nul** in plaats van hem te
verwijderen, en laat twee sleutels met opzet staan: `pl_credits_init` (de
vastlegging dát dit toestel zijn proeftegoed al kreeg — die moet een uitlogactie
juist overleven) en `pl_credits_kalib` (tekens-per-token van het AI-model, een
eigenschap van het model en niet van de klant).

Algemener: **"wis alles wat van de vorige gebruiker was" botst hier met "onthoud
wat dit toestel al gehad heeft".** Bij elke volgende schoonmaakactie is dat de
vraag die eerst beantwoord moet worden.

### Betaallinks uit de code (28-08) — en waarom dat geen sleutelkwestie was

De Tikkie-links stonden hardcoded in `pidlane-klant.js` (#24). Ze staan nu in de
Config-tabel en komen via `/api/config` binnen; `admin.html` beheert ze.

**De reden is niet geheimhouding.** Een Tikkie-link is geen sleutel: wie hem
heeft kan betalen, niet incasseren. Hij hoort ook gewoon bij klanten terecht te
komen. De winst zit ergens anders — een link in de code kun je niet wisselen
zonder een deploy, en dat is precies wat je wél wilt kunnen op het moment dat er
een verkeerde rondgaat. Wie dit als "secret lekt" leest, verplaatst hem naar een
env-var en denkt klaar te zijn; dan is de beheerbaarheid er nog steeds niet.

**Wat de verplaatsing wél binnenhaalt is een nieuw risico**, en dat is het stuk
om te onthouden. De waarde stond eerst in code die door de gate kwam; nu komt hij
uit een tabel die je vanuit een webpagina vult, en hij belandt in een `href`. Zet
daar iemand `javascript:…` neer, dan voert een klik op de koopknop dat uit.
`_esc()` dekt dat niet af: die ontsnapt HTML, niet het schema van een URL.

Daarom `_betaallink()`, met een toets op `https://tikkie.me/`. Dat is een
veiligheidsgrens en geen invoercontrole, dus staat hij in `test-betaallinks.js`
met twaalf varianten die geweigerd moeten worden — inclusief
`javascript:alert(1)//https://tikkie.me/`, dat door een naïeve `/tikkie\.me/`
gewoon heen komt. De tegenproef rekt de toets op en laat zien dat de test dan
rood wordt.

**Algemener: een waarde die van code naar configuratie verhuist, verhuist ook van
"door de gate" naar "door wie schrijfrechten heeft".** Bij elke volgende
verplaatsing is de vraag dus niet alleen waar de waarde staat, maar wat er
gebeurt als iemand er iets anders neerzet dan bedoeld.

**Blijft open:** de oude links staan in de git-geschiedenis en gaan daar niet
meer uit. Alleen een nieuwe Tikkie aanmaken haalt ze echt uit omloop. Voor een
betaallink is dat een afweging, geen noodzaak.

### Werkregel uit de mislukte rit van 26-08

Er is 27 minuten gereden en er is niets opgenomen: het toestel draaide testrun
4.8, waarin blok 14 nog niet bestond. **Kijk vóór het wegrijden naar het
versienummer in de kop van de testrun**, niet alleen naar blok 5 — blok 5 kan
niet melden dat een blok ontbreekt dat in die build nog niet bestaat.

### Ouder dan twee weken — naar het archief

Alles wat hierboven stond en gedateerd is op of vóór 19-08-2026 staat sinds
02-09-2026 in `PIDLANE-ARCHIEF.md`: "De blijvende lijst", de ELM-poort van
15-08 en de ronde van 31-07. Die uitleg is niet weggegooid — hij is verplaatst
naar een bestand dat je gericht doorzoekt in plaats van standaard laadt.

**De regel die daarbij hoort:** een bevinding die is afgehandeld én ouder is
dan twee weken, gaat naar het archief. `PIDLANE-WERK.md` groeide tot 40 KB
omdat die regel er niet was, en §11 was hem aan het overdoen — 77 KB, waarvan
de helft verslag van ritten die al afgehandeld waren.

## 12. PID-strategie boven database

Besluit van 31-07-2026, na een ronde waarin er tien dingen tegelijk misgingen
op een Mazda CX-5.

**Mode 01 is niet merkgebonden.** De J1979-formules zijn identiek op elk merk:
`010C` is overal `((A*256)+B)/4`. Wat verschilt is *welke* PIDs een ECU
ondersteunt, en dat vertelt de auto zelf via de bitmaps `0100/0120/0140/…`.
Daar heb je geen database voor nodig, maar één request. Echt merkgebonden wordt
het pas bij mode 22 (fabrikantspecifieke adressen met eigen schaling), en daar
helpt statistiek niet: je hebt het adres nodig, niet een gemiddelde.

**Wat de Referentie-store dus wél oplevert** is niet "kan ik deze PID lezen"
maar "is deze waarde normaal voor dit blok". Dat is waardevol, maar schaalt met
het aantal voertuigen per `merk|model|jaar|CALID`-cel. Solo duurt dat jaren, en
een p50 uit drie auto's is erger dan geen p50 — die ziet er gezaghebbend uit.

**Daarom: strategie eerst, database als bijvangst.** Toon geen bereiken zolang
een cel te dun gevuld is. Laat de referentiepijplijn draaien, maar laat hem niet
de architectuur bepalen.

### Drie standen per sensor

De auto geeft je gratis kennis die geen database ooit levert: hij claimt een
sensor en zwijgt. Dat verdient een eigen stand.

| Stand | Betekenis |
|---|---|
| groen | in de bitmap én levert een plausibele waarde |
| grijs (`.leeg`) | in de bitmap, maar levert niets of onzin |
| niet getoond | staat niet in de bitmap |

Geïmplementeerd met `pidTegelLeeg()` en `refreshLegeTegels()` in
`pidlane-pids.js`. Let op: een waarde van **0 is een geldige waarde** en hoort
groen te blijven — alleen `undefined`/`null` of health `nodata`/`onzin` maken
een tegel grijs.

### Filter aan de bron, niet aan de uitvoer

`vehiclePlausiblePid()` bestond al, maar draaide alleen in
`isReportableSensor()` — dus pas bij het rapport. Gevolg: fantoomsensoren
stonden in de keuzelijst, werden elke ronde gepollt en kostten busbandbreedte
die de echte sensoren nodig hadden. `buildDiscoveredPIDList()` past het filter
nu meteen toe, samen met `GEEN_SENSOR_PIDS` (de ondersteuningsbitmaps en de
freeze frame-DTC — wel `0101` behouden, dat is de monitorstatus met het
motorlampje).

**Vuistregel:** wat een voertuig niet heeft, hoort niet in de keuzelijst en zeker
niet in de pollronde.

Deze vuistregel stond vanaf 31-07-2026 op negen plekken in negen varianten. De
uitwerking tot één ladder staat in §15.

---

## 13. Vervolgstappen na de opsplitsing

- `index.html` is 176 KB (gemeten 02-09-2026), waarvan het grootste deel
  HTML-markup. Verdere winst is mogelijk door paneel-HTML naar templates te
  verplaatsen, maar dat is een aparte ronde.
- Build-changelog (42 KB) naar `CHANGELOG.md`: gedaan op 28-08-2026.
- Per module opschonen kan nu goedkoop, één module tegelijk.

---

## 14. DTC-lookup — merkbewust, één beslisplek

Besluit van 31-07-2026. `DTCDB` was één objectliteraal met eerst een generieke
sectie en daarna zes merksecties. Zeven codes stonden er twee keer in en in een
objectliteraal wint de laatste, dus élk voertuig kreeg de merktekst van het
merk dat toevallig onderaan stond. Een Mazda met P0128 las "veel BMW/Mini".

**De opzet nu**, alles in `pidlane-data.js`:

| Global | Inhoud |
|---|---|
| `DTCDB` | 50 generieke codes, geen merknamen in de tekst |
| `DTC_MERK` | 31 codes in zes buckets: `MAZDA`, `VAG`, `TOYOTA`, `FORD`, `OPEL`, `BMW` |
| `DTC_MERK_LABEL` | leesbaar label per bucket, voor in de tekst |
| `merkGroep(merk)` | merknaam → bucket, of `''` als het merk onbekend is |

`dtcInfo()` in `pidlane-bt.js` is en blijft de enige beslisplek — acht
aanroepplekken, één functie. Hij zoekt via `_dtcBron()` in drie stappen:

1. de bucket van dít voertuig (`merkGroep(vehicleInfo.merk)`)
2. `DTCDB`, de generieke tabel
3. een willekeurig ander merk dat de code wel kent, met een noot erbij
   ("tekst van VW/Audi/Skoda/Seat")

Stap 3 bestaat om dekking te houden: codes als P2015 en P0A80 komen alleen in
één merksectie voor. Zonder die stap zou een Mazda daar "Onbekende code" op
krijgen, terwijl de oude opzet er wél een tekst voor had. De noot maakt
zichtbaar dat de tekst geleend is.

Onbekend of leeg merk valt vanzelf terug op generiek — `merkGroep()` geeft dan
een lege string en stap 1 wordt overgeslagen.

**De tweede kopie is weg (ronde 9).** `applyVehiclePIDPreset()` in
`pidlane-rijsituatie.js` had een eigen, hardcoded merkgroepering
(`BMW||MINI`, `VOLKSWAGEN||AUDI||SKODA||SEAT`, `TOYOTA||LEXUS`) die alleen
exact gespelde merknamen kende. Die roept nu `merkGroep()` aan; de PIDs per bak
zijn ongewijzigd gebleven. Er is dus nog één beslisplek voor merkgroepering, en
dat is de reden dat de fix van 26-08 hieronder maar op één plaats hoefde.

**Elk merk matcht op prefix — 26-08-2026.** Zeven merkregels deden dat al, twee
toetsten op gelijkheid (`m==='BMW'`, `m==='VW'`). `merkGroep()` normaliseert weg
wat geen letter is, dus `BMW 320D` wordt `BMWD` en `VW GOLF` wordt `VWGOLF`:
allebei ongelijk, allebei terug naar `''`. Een BMW met zijn model erbij kreeg
daardoor generieke DTC-teksten in plaats van de BMW-bucket, en geen merk-preset
— zonder één melding, want `''` is de geldige uitkomst voor een onbekend merk.
`MINI COOPER` had er via zijn prefix nooit last van. Testrun 4.7 vond de
BMW-helft; de VW-helft kwam pas boven bij het narekenen. De regel is daarom
structureel gelijkgetrokken in plaats van per merk goedgezet, en vastgelegd in
`test-merkgroep.js` met de oude implementatie als tegenproef.

---

## 15. De PID-gate — één ladder, vijftien aanroepplekken

Besluit van 31-07-2026, na het patroon dat "een fix die faalt door een fix"
heette: de fix voor fantoomsensoren brak de sensorstatus, de fix daarvoor liet
de fantomen terugkomen.

### Waarom het jojode

Niet "zes plekken met dezelfde regel", maar **twee bronlijsten en vijf vragen**.
`supportedPIDs` (rauw uit de bitmaps) en `discoveredPIDDefs` (gefilterd) leefden
naast elkaar; welke filters je kreeg hing af van welke lijst je toevallig
aanriep. En "mag deze PID mee" bleek geen enkele vraag maar vijf, die overal in
een andere combinatie stonden:

1. past hij bij dit voertuig (`vehiclePlausiblePid` — brandstof, turbo, bank 2)
2. is het een sensor of een ondersteuningsbitmap (`GEEN_SENSOR_PIDS`)
3. levert hij iets (`_pidHealth`)
4. heeft hij een echte naam en eenheid (`unit!=='raw'`)
5. is er nú een verse waarde (`pidVals`)

Eén boolean-gate lost dat niet op. Wat wél werkt: die vijf zijn cumulatief.

### De ladder

`pidGate(pid, niveau, opt)` in `pidlane-pidgate.js`. Elke trede bevat de vorige,
dus je kunt niet meer per ongeluk een strengere check op een lager niveau
zetten — dat was de mechaniek achter het jojo-en.

| Trede | Erbij |
|---|---|
| `plausibel` | past bij dit voertuig |
| `bestaat` | + is een sensor, geen bitmap |
| `kiesbaar` | + health niet `onzin`/`nodata` |
| `duidbaar` | + echte naam en eenheid |
| `meetbaar` | + verse waarde |

"Meldt de auto hem" (`supportedPIDs.has`) zit **bewust niet** in de ladder: dat
is een orthogonale vraag en maar één aanroepplek stelt hem
(`selectStandardSet`), met een eigen regel ernaast.

### Wie welke trede krijgt

| Plek | Bestand | Trede |
|---|---|---|
| `buildDiscoveredPIDList` | rijsituatie | bouwt de lijst — `bestaat` |
| `selectStandardSet` | rijsituatie | `kiesbaar` |
| `selectCategoryPIDs` | rijsituatie | `kiesbaar`, met `force` uit "Toon alles" |
| `applyPidPreset` | rijsituatie | `plausibel` |
| `relevantSupportedPIDs` (basis) | pids | `plausibel` |
| `relevantSupportedPIDs` (lus) | pids | `kiesbaar` |
| `analysisPidData` | pids | `meetbaar` |
| `renderGauges` | pids | `plausibel` — laatste zeef, zie hieronder |
| `isReportableSensor` | pidgate | `meetbaar` |
| `buildPIDList` (dim) | rijsituatie | `kiesbaar` — vraagt de gate, toont tóch |
| `herijkPidGate` | pidgate | `plausibel` |
| `togglePID` | pids | `kiesbaar`, met `force` uit "Toon alles" |
| `ensurePIDListActive` | pids | `kiesbaar` — de drukste deur, zes aanroepers |
| `applyComplaintFocus` | diagnose | `kiesbaar` |
| `applyVState` | remote | `kiesbaar` |

### Herijking — wanneer de gate opnieuw wordt gesteld

`pidGate()` is geen zuivere functie van de PID, maar van (PID, huidige kennis).
Die kennis druppelt binnen: brandstoftype pas als RDW antwoordt, turbo pas na
genoeg belaste MAP-metingen, uitlaat-fantomen pas als de motor warm is. De
bronlijst werd één keer gebouwd — tijdens `initialHealthScan()`, toen er nog
bijna niets bekend was — en daarna nooit meer.

`herijkPidGate(reden)` in `pidlane-pidgate.js` herbouwt **eerst** de bronlijst en
filtert **daarna** pas `activePIDs`. Die volgorde is de kern: andersom filter je
tegen een verouderde lijst en komt het fantoom bij de volgende opbouw terug.

Herijken gebeurt niet bij elke meting — dan bouwt de lijst zich tientallen keren
per minuut opnieuw op. Wél zodra een invoer van `vehiclePlausiblePid()` wijzigt.
Die drie invoeren zitten in één stempel:

```
brandstoftype | atmosferisch-oordeel | ooit-warm-gedraaid
```

`plHerijkTick()` maakt die stempel bij elke meting (vanuit `updPID()`) en
vergelijkt hem met de vorige — één stringvergelijking. Alleen bij verschil volgt
de herbouw. `markeerHerijking()` is de tweede ingang, voor wat niet in de stempel
zit: een PID die van `nodata` naar `ok` is bijgewerkt.

`ooit-warm-gedraaid` is bewust een **grendel**. Zonder grendel klapt de stempel
heen en weer bij elke keer dat de motor uitgaat, met een herbouw per keer.

Vaste aanroepplekken daarnaast: `mergeVehicleData()` in
`pidlane-voertuigdata.js` (brandstoftype wijzigt) en de protocolherkenning in
`pidlane-bt.js`.

### De toevoegpoort — wie mag er eigenlijk schrijven

Ronde 6, 01-08-2026. De gate gaf het juiste **antwoord** (ronde 1-4) en de
herijking stelde hem op het juiste **moment** (ronde 5). De derde vraag bleef
staan: wie mag er in `activePIDs` schrijven. Vier plekken deden dat zonder te
vragen, en konden dat ná een herijking doen — daarom kon de zeef in
`renderGauges()` niet weg.

`pidToevoegen(pids, opt)` in `pidlane-pidgate.js` is die deur. Het neemt een PID of
een lijst, toetst elk item met `pidGate()` en geeft `{ok, weg}` terug — `weg`
bestaat zodat een aanroeper kan uitleggen waarom er niets gebeurde in plaats van
stil te falen.

| Deur | Bestand | Was |
|---|---|---|
| `togglePID` | pids | ongefilterd; de keuzelijst maakte een afgekeurde regel al niet klikbaar |
| `ensurePIDListActive` | pids | ongefilterd — caravan, grafiek, koopcheck, rit, totaalcheck en remote komen hier binnen |
| `applyComplaintFocus` | diagnose | ongefilterd; "rook" trekt roet- en NOx-sensoren aan, ook op benzine |
| `applyVState` | remote | ongefilterd; de selectie van de local |

**`ensurePIDListActive` stond niet in de lijst van drie** waarmee deze ronde
begon. Die was opgesteld door te zoeken naar `activePIDs.add`, en deze plek
vervangt de hele set (`activePIDs = nieuw`). Het is wél de drukste van de vier:
zes modules komen er met een eigen lijst binnen. Wie de deuren telt, moet niet
op één schrijfvorm zoeken.

**`manualPIDs` wordt bewust niet opnieuw getoetst.** Wat daarin staat is al een
keer door een deur gekomen, en `herijkPidGate()` haalt het eruit zodra het niet
meer klopt. Zou elke deur het opnieuw toetsen, dan verdwijnt een sensor die de
gebruiker met "Toon alles" bewust aanzette bij de eerstvolgende analyse alsnog.
Regel: **elke deur gate't zijn eigen invoer, niet die van een ander.**

**Demo is de uitzondering.** `loadDemoVehicle()` en `startDemo()` schrijven
rechtstreeks. Dat is geen vergeten deur: demo bouwt met `demoPIDsForFuel()` zijn
eigen sluitende wereld, en in `loadDemoVehicle()` staat de PID-selectie vóór het
zetten van `vehicleInfo.brandstof` — de gate zou daar op de kennis van de vórige
demo-auto oordelen. Dezelfde wanneer-val als in ronde 5. Het vangnet in
`renderGauges()` slaat demo daarom over.

### Turbo-detectie — waarom het bewijs uit de meting zelf komt

`_isNaturallyAspirated()` besliste op `_mapSamples >= 8`: acht MAP-metingen,
piek onder 106 kPa, dus geen turbo. Dat klopte niet. Een auto die stationair
draait heeft een MAP van 30–40 kPa, turbo of niet. Acht metingen is een paar
seconden stilstaan.

Dat het nooit misging kwam door een tweede fout: `_noteMap()` werd alleen
aangeroepen vanuit `purgeImplausiblePids()` zelf, en die draaide twee keer per
sessie. `_mapSamples` kwam dus nooit boven de 8 en de hele turbo-detectie was
dode code.

De eerste herstelpoging eiste "belaste" metingen: toerental > 1200 én
motorbelasting ≥ 60% of gasklep ≥ 50%. Een rit met de CX-5 (01-08-2026, vier
minuten stadsverkeer) liet zien dat dat niet werkt:

| Gemeten | Uitkomst |
|---|---|
| MAP-piek | 100 kPa — de 106-grens klopt |
| Gasklep | gemiddeld 16%, piek 74,9% |
| Metingen die het criterium haalden | 1 van de 56 |

Een moderne automaat opent in stadsverkeer de gasklep bijna nooit ver; de motor
is er groot genoeg voor. Het bewijs kwam dus nooit binnen.

Er zat bovendien een fout in die niets met drempels te maken had. `010B`,
`0111` en `0104` worden op verschillende intervallen gepolld — op deze rit
1071, 428 en 3570 ms. `_mapBewijsMoment()` las `pidVals['0111']` op het moment
dat er een drukmeting binnenkwam, en kreeg dus een gasklepstand van een ander
moment. Tijdens accelereren verandert die sneller dan het verschil.

**Nu komt het bewijs uit de MAP-waarde zelf.** Een hoge inlaatdruk *betekent*
dat de gasklep ver open staat; een tweede PID is overbodig. Bij een turbo gaat
de druk dan boven omgevingsdruk, bij een atmosferische motor nadert hij 100 en
stopt daar. Eén PID, geen synchronisatieprobleem.

Toerental wordt wel meegelezen, want dat verandert traag genoeg: contact aan met
stilstaande motor geeft ~101 kPa (geen onderdruk) en zou anders als bewijs voor
"atmosferisch" tellen.

De drempels staan als benoemde constanten bovenaan het blok in
`pidlane-pidgate.js`, juist omdat ze na een rit bijgesteld gaan worden:

```
MAP_BEWIJS_KPA   85    vanaf deze druk staat de gasklep ver open
MAP_BEWIJS_MIN   10    zoveel metingen voor een oordeel
MAP_ATMOSF_MAX  106    piek hieronder = geen turbo
MAP_MOTOR_RPM   300    daaronder draait de motor niet
```

De aanroep zit in `updPID()` en staat op `pid === '010B'` — anders telt dezelfde
meting één keer per PID in de pollronde mee.

Te weinig bewijs → geen oordeel → geen filter. Liever een boost-tegel te veel op
een atmosferische motor dan een ontbrekende tegel op een turbo.

**Wat drie ritten met de CX-5 lieten zien (01-08-2026):**

| Rit | MAP-metingen | Piek | Bruikbaar als bewijs |
|---|---|---|---|
| 11:18 | 56 (sessie 238) | 100 kPa | 5 |
| 12:02 | 37 | 42 kPa | 0 |
| 12:04 | 70 (sessie 128) | 98 kPa | 1 |

De piek bleef alle drie de keren onder de 106-grens, wat klopt voor een
atmosferische motor. Maar het bewijs komt bij normaal rijden nauwelijks binnen:
96% van de metingen zit onder 60 kPa. Zonder een bewuste acceleratie valt het
oordeel niet, en dat is de veilige uitkomst — er verdwijnt dan niets.

Eén meting stond op 96 kPa bij 0 toeren: contact aan, motor uit, dus geen
onderdruk. Dat bevestigt dat de toerentalcheck nodig is; zonder die check zou
elke keer contact aanzetten als bewijs voor "atmosferisch" tellen.

**Wat er níet is aangetoond.** In geen van de drie ritten stond een boost-PID in
de lijst — `0170`, `2102` en `2187` kwamen niet voor, net zomin als de
diesel-PIDs. `_boostPhantom()` had dus niets te filteren. De detectie is
opgezet voor een ECU die laaddruk-PIDs meldt terwijl er geen turbo in zit, maar
dat dát voorkomt is nooit vastgesteld. De code is getest, het probleem niet.

Beide meetgevallen (te weinig bewijs, en genoeg bewijs) staan als scenario in
`test-herijking.js`, met de echte meetreeks als fixture.

### Rondes

Mechanisch en inhoudelijk strikt gescheiden, één afwijking per commit.

| Ronde | Wat | Zichtbaar effect |
|---|---|---|
| 1 ✅ | `pidGate()` erbij, tien plekken erdoorheen | geen (drie aanscherpingen op onbereikbare toestanden) |
| 2 ✅ | `healthStreng` weg | `twijfel` selecteerbaar, `nodata` niet meer via de categorieknop |
| 3 ✅ | `ruwToegestaan` weg | geen naamloze raw-PIDs meer richting de AI |
| 4 ✅ | `force` doorgegeven aan `selectCategoryPIDs` en `buildPIDList` | "Toon alles" werkt ook op `+ Alles`; `dim` komt uit de gate |
| 5a-1 ✅ | turbo-criterium herzien; na een testrit nogmaals, nu op MAP-waarde | geen — `_noteMap()` hing nog in de purge, teller haalde de drempel niet |
| 5a-2 ✅ | `_noteMap()` naar `updPID()` | turbo-detectie gaat leven; boost-PIDs verdwijnen op een bewezen atmosferische motor |
| 5b ✅ | `purgeImplausiblePids()` → `herijkPidGate()`, stempel + tick, `nodata` herzienbaar | fantoom verdwijnt óók uit de keuzelijst; een PID die alsnog data levert komt terug |
| 6 ✅ | `pidToevoegen()` erbij; vier toevoegpaden erdoorheen; zeef in `renderGauges()` wordt vangnet dat zich meldt | analyseprofiel, klacht-focus en remote-selectie kunnen geen fantoom meer aanzetten |
| 7 ✅ | mechanisch: gate-blok uit `pidlane-auth.js` naar `pidlane-pidgate.js` | geen — byte-identiek verplaatst, beide tests ongewijzigd groen |
| 8 ✅ | mechanisch: kwaliteitscluster uit `pidlane-auth.js` naar `pidlane-kwaliteit.js` | geen — byte-identiek verplaatst, beide tests ongewijzigd groen |
| 9 ✅ | merkgroepering in `applyVehiclePIDPreset()` vervangen door `merkGroep()` | merken die vóórdien alleen exact gespeld werden herkend, krijgen nu hun aanvulling (zie hieronder) |

De splitsing van ronde 5 in drie stappen was geen planning maar noodzaak.
5a-2 alléén zou een echte bug hebben geïntroduceerd: een turbomotor die een
minuut stationair draait, verliest onder het oude criterium zijn boost-tegels.
Daarom eerst het criterium herzien (5a-1, aantoonbaar gedragsneutraal zolang de
teller de drempel niet haalt) en pas daarna de meting verplaatsen.

**Twee tests, twee vragen.**

`test-pidgate.js` (`public/`) toetst of de gate het juiste **antwoord** geeft:
1600 toestanden × 15 aanroepplekken, met per plek een `verwacht`-predicaat dat
vastlegt wanneer een verschil met het gedrag van vóór de gate BEDOELD is. Alles
daarbuiten is een regressie en de test eindigt met exit 1. Werkwijze per ronde:
wijzig de gate, draai de test, werk precies één `verwacht` bij. Moet je er twee
bijwerken, dan heeft je wijziging meer geraakt dan de bedoeling was. Een nieuwe
aanroepplek erbij zetten telt niet mee — ronde 6 voegde er vier toe zonder één
bestaande `verwacht` aan te raken, en dát is het bewijs dat de deuren alleen
zichzelf raakten.

`test-herijking.js` (`public/`) toetst of de gate op het juiste **moment** wordt
gesteld — een andere vraag, die de eerste test niet kan stellen. Elf scenario's
op een tijdlijn: bronlijst bouwen bij onbekende brandstof, kennis laten
binnendruppelen, en controleren dat de lijst meebeweegt. Inclusief de
turbo-gevallen (lage druk bewijst niets, hoge wel), een echte meetreeks van de
CX-5 als fixture, en de eis dat 200 metingen
zonder kennisverandering nul herbouwen opleveren.

Beide tests trekken hun code uit de echte modules in plaats van een kopie bij te
houden. Gaat de module uit de pas lopen, dan valt de test om in plaats van
stilletjes iets anders te testen dan wat er draait.

Let op bij het lezen van de aantallen in `test-pidgate.js`: dat is
matrixrekenwerk, geen maat voor praktische impact — de helft van de matrix
bestaat uit implausibele of bitmap-PIDs die in de echte lijst niet voorkomen.

Na ronde 4 is er nog één vlag: `force`. Die is geen schuld maar ontwerp — de
bewuste noodklep, naar het model van `force=True` in python-OBD. Hij hoort
alleen bij handmatige selectie en nooit richting analyse of rapport.

### Nog open

**De zeef in `renderGauges()` is een vangnet geworden, geen poort.** Sinds
ronde 6 lopen alle toevoegpaden door `pidToevoegen()`, dus er kán daar niets
implausibels meer langskomen. De regel is blijven staan omdat "er kán niets
langskomen" een redenering is en geen meting — precies het soort redenering dat
in ronde 5 niet klopte. Hij filtert nu niet stil, maar meldt zich één keer per
PID in de diagnosebundel:

```
Vangnet renderGauges ving 019A af — er is een toevoegpad dat pidToevoegen() overslaat
```

Blijft die melding een tijd uit bij echt gebruik, dan mag de regel weg — dat is
dan een gedragsneutrale verwijdering met bewijs, in plaats van op hoop. Demo
wordt overgeslagen (zie hierboven), anders piept hij daar onterecht.

**Wie de deuren telt, moet niet op één schrijfvorm zoeken.** De ronde begon met
drie paden, gevonden door te zoeken op `activePIDs.add`. De vierde en drukste,
`ensurePIDListActive()`, vervangt de hele set en stond dus niet in die lijst.
Bij de volgende categorie (§13) is dat de eerste controlevraag: op welke manieren
kán deze toestand veranderen, niet welke ervan lijken op elkaar.

**`pidCnt` telt twee dingen.** Het label in `index.html` zegt "Beschikbare
PIDs", maar zeven van de negen schrijvers zetten er `activePIDs.size` in (het
aantal *geselecteerde*) en twee `discoveredPIDDefs.length`. `herijkPidGate()`
houdt de meerderheidskeuze aan. Opruimen is cosmetisch en hoort bij §11.

**Het kwaliteitscluster staat sinds ronde 8 in `pidlane-kwaliteit.js`.** Ronde 7
verhuisde alleen het gate-blok — plausibiliteit, de ladder, de herijking, de deur.
De kwaliteitsbeoordeling die `_pidHealth` vult (`assessPidQuality`,
`buildQualityReport`, `_qualityBlokFor`, plus `RAPPORT_DISCLAIMER` en
`_withDisclaimer`) is een eigen cluster: de gate *leest* `_pidHealth`, hij
schrijft het niet. Vandaar een eigen module en niet erbij in de gate.
`_withDisclaimer()` ging mee omdat het zonder `RAPPORT_DISCLAIMER` nergens op
slaat. Beide tests raken dit cluster niet — ze knippen alleen uit
`pidlane-pidgate.js` — dus ze draaiden ongewijzigd groen.

**Ronde 9: de merkgroepering staat nu ook op één plek.** `applyVehiclePIDPreset()`
in `pidlane-rijsituatie.js` had een eigen kopie (`BMW||MINI`,
`VOLKSWAGEN||AUDI||SKODA||SEAT`, `TOYOTA||LEXUS`) naast `merkGroep()` in
`pidlane-data.js`. De PIDs per merkbak zijn ongewijzigd, maar dit is **niet
gedragsneutraal**: de oude kopie vergeleek exact, `merkGroep()` normaliseert en
matcht op voorvoegsel. 40 merkstrings naast elkaar gelegd: 30 identiek, 10
anders, en alle tien dezelfde kant op — merken die eerst niets kregen krijgen nu
wél hun aanvulling (`MINI Cooper`, `VOLKSWAGEN GOLF`, `VW`, `AUDI A3`,
`Škoda Octavia`, `SEAT Leon`, `Cupra`, `FORD FOCUS`, `MAZDA CX-5`,
`TOYOTA YARIS`). Niemand raakt iets kwijt. Die extra PIDs komen binnen via
`supportedPIDs` en gaan daarna alsnog door de gate, dus een implausibele wordt
gewoon geweerd.

Eén oneffenheid blijft, en die is van `merkGroep()` zelf: `MINI` matcht op
voorvoegsel maar `BMW` op gelijkheid, dus `MINI Cooper` valt in de bak en
`BMW 320d` niet. Dat rechttrekken is een inhoudelijke wijziging in de DTC-lookup
(§14) en hoort dus in een eigen ronde, niet hier.

**De knippaden van de tests horen bij de module.** Beide tests trekken hun code
letterlijk uit `pidlane-pidgate.js`: `test-pidgate.js` matcht op
`function pidGate(pid, niveau, opt){`, `test-herijking.js` pakt alles tussen
`function _engineWarmRunning` en de sluitmarkering `// ── einde gate-blok`.
Die markering staat er expliciet voor. Verplaats je iets, verplaats dan ook de
knippaden — anders faalt de test met "niet gevonden" in plaats van met een
echte regressie.

---

### Ronde 6 — de steunbitpoort (20-08-2026)

De gate hierboven beantwoordt *"mag deze PID mee naar de UI"*. Er bleek een
tweede vraag te bestaan die nergens centraal stond: **"mag deze PID überhaupt
in `supportedPIDs`"**. Vier ritten lang leek `profielTegenSteunbits()` te
falen. Uit het logboek van 20-08:

```
19:36:22  discovery uit de bitmaps      → 55 PIDs, precies conform
19:36:26  profiel opgeslagen            → 55 PIDs, schoon
19:36:49  applyVehiclePIDPreset()       → 26 PIDs erbij, waaronder 015C
19:37:51  blok 6 telt supportedPIDs     → 62, waarvan 7 ontkend
```

`MERK_EXTRA_PIDS.MAZDA = ['015C','0110']` zette de motorolietemperatuur terug
die de bitmap net had ontkend. De controle zat in `profielTegenSteunbits()`,
niet in de preset — dus de preset liep er dwars doorheen. Precies het patroon
uit de kop van dit hoofdstuk, één niveau lager.

**De oplossing: de bitmaps worden bewaard.** Ze leefden alleen lokaal in die
ene functie, dus geen andere plek kón ze raadplegen.

| naam | in | doet |
|---|---|---|
| `_steunbits` | `pidlane-rijsituatie.js` | blokstart (0/32/64/96) → 32-bits woord |
| `ecuSteunt(pid)` | idem, global | `true` / `false` / `null` (onbekend) |
| `magToevoegen(pid)` | idem, global | `ecuSteunt(pid) !== false` |
| `steunbitsRuw()` | idem, global | kopie voor diagnostiek |

Gevuld door **zowel** `discoverPIDsBitmap()` als `profielTegenSteunbits()` —
beide lezen dezelfde vier vragen (`0100`/`0120`/`0140`/`0160`), dus welke route
de sessie ook neemt, de bits zijn bekend.

**De scheidslijn is niet "welke module" maar "op bewijs of op aanname".**
Alle vijf plekken die `supportedPIDs` uitbreiden, nagelopen op 20-08:

| plek | voegt toe | zeef |
|---|---|---|
| `discoverPIDsBitmap()` | omdat de bit aan staat | nee — dat ís de bron |
| `discoverPIDsDirect()` | na een echt antwoord | nee |
| `deepRefreshPIDs()` | na een echt antwoord | nee |
| `probeUitgebreid()` | mode 21/22, geen steunbits | n.v.t. |
| `applyVehiclePIDPreset()` | **merk + brandstof, ongemeten** | **ja** |

Een PID die daadwerkelijk antwoordt bestáát, wat de bitmap ook beweert —
bitmaps liegen soms, een geldig antwoord niet. Alleen wie toevoegt zónder te
meten gaat langs `magToevoegen()`. **Onbekend telt als toegestaan**: is het
blok niet gelezen, dan beweert de zeef niets. Een te gretige zeef is erger dan
de kwaal, want deze fix verwijdert sensoren.

Komt er ooit een zesde plek bij: bepaal eerst in welke van die twee
categorieën hij valt. `test-steunbits.js` telt het aantal
`supportedPIDs.add`-aanroepen, dus een nieuwe plek valt op.

**Wat het opleverde.** De fantoom-PIDs waren óók de bron van het pollbudget dat
terugschroefde. In de run van 19:40 kwamen **alle 18 missers** van 230
verzoeken van vier ontkende PIDs (`0114`, `015E`, `015C`, `0146`) — nul
geslaagde metingen, alleen missers. Dat gaf 15% foutgraad, een pollbudget van
55% en de waarschuwing "veel lege antwoorden van de ECU" aan de gebruiker.

De testrun vraagt ontkende PIDs nu ook niet meer op: de sweep slaat ze over,
blok 6 stelt met één regel vast wat hij eerst in dertig verzoeken uitzocht, en
blok 8 slaat `015C` over. De meting maakte anders zelf het probleem dat hij mat.

---

## 15b. Na het verbinden — brandstofpoort en de wizard (20-08-2026)

`initConnection()` doet alles: protocol, VIN, discovery, health-scan,
snelheidsmeting, profiel opslaan. Twee dingen zaten daarin op de verkeerde
plek.

**Het brandstoftype kwam te laat.** `pidGate()` filtert fantoomsensoren op
`vehicleFuelType()`, en `initialHealthScan()` beoordeelt élke PID met die gate.
Maar het kenteken werd pas in de wizard gevraagd — ná de scan die het had
moeten sturen. Bij een voertuig dat al eens is uitgelezen viel dat niet op:
`updateVehicleCard()` doet een automatische `rdwLookup()` op het opgeslagen
kenteken. Alleen de eerste keer ging het mis — precies de keer dat het profiel
wordt aangemaakt dat daarna hergebruikt wordt.

`brandstofPoort()` in `pidlane-voertuigdata.js` staat nu tussen
`updateVehicleCard()` en de health-scan, en werkt van goedkoop naar duur:

1. al bekend uit VIN/NHTSA/RDW → niets doen, niets vragen
2. PID `0151` uitlezen (~150 ms) en in `pidVals` zetten, zodat de gate hem ziet
3. pas dán het kenteken vragen, met een overslaan-knop die werkt

Let op bij de VIN-route: `tryReadVIN()` decodeert via `vpic.nhtsa.dot.gov`, de
Amerikaanse database. Voor een Japanse of Europese auto levert die vaak alleen
het merk. De bronprioriteit is `rdw > nhtsa > vin`; RDW is dus de betere bron.

**De wizard is van zes stappen naar één.** Vier ervan toonden voortgang voor
werk dat `initConnection()` al had gedaan — inclusief een tweede
`measureConnSpeed()` van acht reads bovenop die van `pidlane-bt.js`, en twee
voortgangsbalken met een deadline erin om te voorkomen dat de nep-animatie
bleef hangen. Wat overblijft is de samenvatting (`_wizStep6`), die echt werk
doet: `selectStandardSet()`.

`wizNext()` en `wizRdwLookup()` bestaan nog omdat de knoppen in `wizS4` ze
aanroepen. Die HTML wordt niet meer getoond, maar een verdwenen functie achter
een bestaande onclick is een dode knop. De HTML zelf weghalen raakt de
div-balans en is een aparte, mechanische stap.

---

## 16. De categorie "connectie en meten" — ronde 1 t/m 4

Besluit van 02-08-2026, na de logs van 01-08. Vier bevindingen uit één sessie,
en drie ervan hebben dezelfde vorm als de PID-gate uit §15: één vraag, meerdere
antwoorden, en de deur die het hardst nodig had geen poort.

### Ronde 1 — de meetfase-poort had maar één deur

`plVraagMeting()` stond op `PLWizard.start()`, maar niet op `PLWizard.draai()`
— en dat is precies de knop waar het planscherm naar wees, want stap 1
("Meten") was een kale `<div>` zonder knop terwijl elke analyse eronder wél een
"Openen"-knop had. Resultaat op 01-08: nul rittests aangevraagd, wel een
AI-rapport, opgebouwd op elf minuten stilstand.

Er zat nog een tweede gat in. De poort mat alleen HOEVEELHEID (seconden,
monsters, dekking) en werd aangeroepen met een vaste letterlijke `'normaal'`.
Elf minuten stationair haalde daarmee moeiteloos ook het zwaarste niveau,
terwijl `job.meting` op `rit10` stond.

**Nu:**
- `plMeetNiveau(gevraagd)` leidt het niveau af uit `window._wizJob.meting`
  (`rit10` → `rit`, `rit2` → `kortrit`) en hoogt alleen op, nooit af.
- `MEET_EIS` heeft een vierde niveau `kortrit` en per niveau een `rij`-eis in
  seconden. `plMeetRijSec()` telt aaneengesloten meetdata boven 15 km/h en
  negeert gaten >5 s, zodat een bevroren tab geen rijtijd oplevert.
- Geen snelheids-PID → `rijSec` is `null` → de rij-eis blokkeert niet. Geen
  bewijs is geen oordeel.
- `PLWizard.draai()` gaat langs de poort. De uitzonderingen staan expliciet in
  `GEEN_MEETEIS` (`dtc`, `monitor`, `recorder`); die drie oordelen niet over
  live meetwaarden. Nieuwe module? Standaard achter de poort.
- Stap 1 in het plan heeft een eigen startknop.
- `plMeetPromptBlok()` vertelt de AI of er gereden is. Bij <10 s rijdata staat
  er expliciet dat er geen uitspraken over belasting gedaan mogen worden.

### Ronde 2 — de ritanalyse overleefde de achtergrond niet

Een rit onder belasting vraagt dat je rijdt, en rijden vraagt navigatie —
precies dan bevriest Android de tab. Het bewijs staat in de log van 01-08: een
TX om 14:04:19 kreeg antwoord om 14:50:26, 46 minuten later. `pidlane-rit.js`
had geen enkele `visibilitychange`-afhandeling; fases liepen op `setTimeout`,
verzamelen op `setInterval(500)`.

Meedraaien in de achtergrond kan een webapp niet afdwingen. Eerlijk zijn wel:
de rit **pauzeert** nu en gaat verder waar hij was. `ritFaseEind` is
wandkloktijd (het enige dat een bevroren tab overleeft), pauzetijd telt niet
mee in balk, teller of rapportduur, wissels <3 s tellen niet als onderbreking,
en is de verbinding weg na terugkeer dan stopt de rit met wat er is. Het
rapport noemt het aantal onderbrekingen en de verloren seconden.

Bijvangst: `ritFaseIdx` werd nooit bijgewerkt (stond altijd 0) en
`window._didRit` werd gezet maar nergens gelezen.

### Ronde 3 — de bus-poort (`pidlane-busgate.js`, nieuw)

"Leeft de bus" werd op zes plekken beantwoord met zes criteria: watchers 0.70,
bt 6 lege responsen, plload 80% en 40%, verify 60% respons, onderdeel 8%.

Op 01-08 om 20:53:02 viel alles stil (contact uit, alles NO DATA) en negen
seconden later meldde de watcher veertien sensoren als uitgevallen, met de tekst
"terwijl de rest doorloopt".

**Let op — eerdere analyse was mis.** Er is beweerd dat die 0.70 op dit voertuig
onbereikbaar was. Dat klopt niet; `test-busgate.js` rekent het na met de echte
cadansen. De oude poort sluit wél, maar pas na **13 s** stilte, als ook de
4200 ms-groep zijn drempel van 12,6 s passeert en de fractie van 0,28 naar 0,78
springt. Het probleem is dus **naloop**, geen onbereikbaarheid: de melding stond
er al na 9 s. (Curiositeit: bij 30 s zakt de fractie weer naar 0,69, omdat de
snelle PIDs dan buiten beeld vallen. Niet-monotoon.)

`PLBusGate` kijkt naar `PLBus.stats()`, dat een venster van 10 s hanteert, en
hoeft dus niet op de traagste cadans te wachten. In de test sluit hij na 5 s.
Ladder: `adapter` → `ecu` → `betrouwbaar`. Polariteit als bij de PID-gate: de
poort beantwoordt "mag ik hier een uitspraak op baseren", dus geen verkeer =
geen bewijs = dicht. Na herstel geldt 5 s rust, anders glipt er in de eerste
halve reeksen alsnog een melding door.

De watchers combineren poort en oude fractie met **OF**, niet EN: allebei
onderdrukken meldingen, dus samen onderdrukken ze strikt meer dan elk apart.
De oude fractie blijft ook als terugval als de module niet geladen is.

**Nog niet gedaan:** bt, plload, verify en onderdeel hebben nog hun eigen
antwoord. Die migreren is een eigen ronde, want daar verandert gedrag op
plekken die nu niet stuk zijn.

### Ronde 4 — de dode zone van PLLoad was een val

Om 14:03:29 ging `_mult` naar 6.0 (MAX, tempo 17%) en daar bleef hij vijf uur
staan: in de bundel van 20:48 staat mult 6 bij foutPct 0 en belasting 67. Alle
vier de logregels zeggen "verlaagd", geen enkele "verhoogd".

Tussen `bezetAf` (55%) en `bezetOp` (85%) was `_mult` bevroren — bedoeld als
demping, in de praktijk een eenrichtingsdeur. De kern: `ruim` was
**onbereikbaar**. Bezetting is aanvraagtempo × responstijd, en met 40 PIDs à
~105 ms komt zelfs op MAX niet lager dan ~67%. Wachten op <55% is wachten op
iets dat niet kan gebeuren — dezelfde vorm als de poort die op 0.70 wachtte.

**Nu** tast de regeling af in plaats van te wachten: is het niet druk en is de
foutgraad ≤5% en buffert de adapter niet, dan zakt `_mult` met stapjes van 0,03
tot de bezetting tegen `bezetOp` aan loopt, waar `druk` weer toeslaat. Dat is
AIMD zoals het hoort. In de test landt hij op mult ~5,0 bij 81% bezetting in
plaats van op MAX. Bescheiden winst — deze bus kán niet veel sneller met 40
PIDs — maar hij vindt nu de echte grens. Tegendruk wint nog steeds meteen.

De trage stapjes zouden nooit in de log komen (drempel 0,2), daarom logt hij
ook vanaf de laatst gelogde stand bij ≥0,5 verschil.

### Tests

`test-meetpoort.js` (16), `test-ritpauze.js` (17), `test-busgate.js` (24),
`test-plload.js` (17). Alle vier groen, en `test-pidgate.js` en
`test-herijking.js` blijven groen.

Knippaden, zoals bij §15: `test-meetpoort.js` knipt uit `pidlane-fuel.js`
tussen `const MEET_EIS = {` en `/* Toont het meetscherm`. `test-ritpauze.js` en
`test-plload.js` laden hun module in een `vm`-context; omdat top-level `let` in
een classic script géén eigenschap van het globale object wordt, plakt
`test-ritpauze.js` een accessor-blok achter de bron om bij de echte variabelen
te kunnen. Verplaats je die ankers, verplaats dan ook de test.


---

## 17. Twee losse fixes uit de log van 02-08-2026

Kleine ronde, twee onafhankelijke ingrepen. De sessie zelf was schoon: foutPct
0, geen UITVAL, geen seriële fouten. Wat er wél in stond:

**Fix 4 uit §16 is bevestigd op echte data.** Om 08:37:17 staat de nieuwe
logregel `Pollbudget stapsgewijs verhoogd naar 18% (bezet 65%, fout 0%, 98ms)`
en de bundel van 08:38:13 geeft mult 4,74 bij bezetting 76%. Dat is 0,82 in
56 s = 28 ticks x 0,03, precies de ontworpen stap. Het plantmodel uit
`test-plload.js` klopt ook: 65 x 5,56 = 361 en 76 x 4,74 = 360, dus bezetting
is inderdaad omgekeerd evenredig met mult. Verwacht eindpunt op deze auto:
mult ~4,2 bij `bezetOp`, tempo ~24%.

### De ruw-stationair-test had geen gasklep-poort

`fase='stationair'` wordt in `pidlane-monitor.js` gezet zodra `spd<3 &&
rpm>300`. Geen gasklepcontrole, dus stilstaan en gas geven telt als stationair.
Op 02-08 om 08:29:05 gaf dat `toerental schommelt 547 rpm (50%
richtingswisselingen)` terwijl er simpelweg getoerd werd; een echt ruw
stationair zit eerder op 60-150 rpm.

Buurman `STAT_MAP` had de poort al (`if(c.val('0111')>10) return null`). Hij
stond alleen niet op deze deur — hetzelfde patroon als §15 en §16.

STAT_RPM kijkt nu over het héle venster van 5 s naar 0111, niet naar één
monster: na een gasstoot is de klep alweer dicht terwijl de naschommeling nog
in het venster zit. `0111` staat in `pids`, dus de data-poort van de runner
slaat de test over op een voertuig zonder gaskleppositie. Geen bewijs, geen
oordeel.

### PID_LET_OP — opvallend is niet hetzelfde als onmogelijk

`PID_HARD_LIMITS` is een WEGGOOI-filter: buiten bereik betekent dat
`validateAndSmooth()` null teruggeeft en het monster verdwijnt. Voor
ontstekingstiming stond daar een aanname in plaats van natuurkunde: ondergrens
-15 graden, terwijl SAE J1979 voor PID 0E -64..+63,5 definieert (A/2 - 64). Op
een SkyActiv-G met 13:1 compressie is fors terugregelen normaal, dus -17,5 en
-19 werden weggegooid.

Het gevaar zat in de eenzijdigheid: alleen de terugregelkant verdween, dus een
gemiddelde zag er beter uit dan de motor draaide, en juist een klopprobleem
werd onzichtbaar gemaakt door het filter dat de datakwaliteit moest bewaken.

**Nu:** `010E` staat op het SAE-bereik. De oude grenzen zijn verhuisd naar
`window.PID_LET_OP` in `pidlane-data.js`, een SIGNAAL-tabel in plaats van een
filter. Laag 1b in `validateAndSmooth()` logt zulke waarden hooguit eens per
30 s, telt ze in `window._pidLetOp` (aantal + uiterste), en laat de meting
gewoon door. Geen `markOutlier`, geen `return null`.

**Kandidaat voor een volgende ronde, bewust niet meegenomen:** `0106`/`0107`
staan op +/-30% terwijl SAE -100..+99,2% toestaat. Zelfde patroon, maar er is
geen bewijs uit de logs. Eerst meten, dan verbouwen.

### Tests

`test-statrpm-letop.js` (24 toetsen) dekt beide. Knippaden: de STAT_RPM-helft
laadt `pidlane-watchers.js` in een `vm` en pakt
`PLWatch.tests.find(t => t.id === 'STAT_RPM')`. De let-op-helft knipt uit
`pidlane-datalog.js` vanaf `const FILTERED_PIDS=new Set([` tot de functie ná
`validateAndSmooth`, en haalt de grenzen uit `pidlane-data.js` tussen
`window.PID_HARD_LIMITS` en `// -- MODELS`. Verplaats je die ankers, verplaats
dan ook de test.

Alle zeven tests groen: pidgate, herijking, meetpoort, ritpauze, busgate,
plload, statrpm-letop.


---

## 18. Kern-dekking in het rapport (02-08-2026) — en wat bewust NIET gedaan is

### Het echte probleem is groter dan deze fix

De meetfase-poort uit §16 vraagt om genoeg data, niet om de JUISTE data. Twee
gaten, allebei bevestigd in de log van 02-08:

1. **Geen registratiefase.** `ensurePIDListActive()` wacht maximaal 5 s en dan
   alleen op PIDs met `pidPollInterval <= 1000`, met in het commentaar dat trage
   sensoren "vanzelf binnendruppelen tijdens de analyse". Om 08:31:16 werden 12
   sensoren aangezet, om 08:31:20 ging het AI-verzoek de deur uit. Vier
   seconden. Van de 30 PIDs vielen er 8 binnen de wachtgrens; de 13 op 3318 ms
   kregen hooguit 1 monster, de 9 op 33-199 s kregen er nul.

2. **`plMeetStatus()` meet de verkeerde grootheid.** `maxN` is het MAXIMUM
   aantal monsters over alle sensoren, dus één PID die al tien minuten meeloopt
   haalt de eis in zijn eentje. En `dekking` telt over `activePIDs`, niet over
   wat de analyse nodig heeft.

**De volledige oplossing is een drie-fasenpoort** (aanzetten -> testen ->
registreren -> pas dan analyse), met de eis per kern-PID in plaats van via
`maxN`. Dat raakt `ensurePIDListActive()`, en daar komen caravan, grafiek,
koopcheck, rit, totaalcheck, remote en datalog alle zeven binnen. Bewust
uitgesteld: te groot om vlak voor 3000 km vakantie in te bouwen zonder
onderweg te kunnen testen.

Uitgerekend voor als die ronde komt, met de echte intervallen van 02-08
(mult 4,74). Eis "3 monsters van elke kern-PID": basis/totaal/rit/emissie/accu
~300 s, brandstof ~600 s. Onwerkbaar. Eis gesplitst naar de AARD van de sensor
(dynamisch = reeks, traag = één waarde) maakt de traagste dynamische kern-PID
maatgevend: 10 x 3318 ms = ~33 s. Dat is de route.

De traag-lijst hoeft niet nieuw: `FILTERED_PIDS` in `pidlane-datalog.js` is
precies die set. En de kern/aanvullend-splitsing bestaat ook al —
`BASIS_PIDS + ANALYSE_PIDS[profiel]` is de kern, de categorie-extra's uit
`relevantSupportedPIDs()` zijn aanvulling.

Open besluiten voor die ronde: maximale wachttijd (voorstel 45 s met verleng-
knop), blokkeren onder 60% kern of alleen melden, en of bestaande historie de
registratiefase mag overslaan.

### Wat nu wél gebeurd is: melden zonder te blokkeren

`analysisPidData()` filtert kern-sensoren die niets leveren stilzwijgend weg,
waarna het rapport leest als compleet. Op de CX-5 miste profiel `brandstof`
vier kern-PIDs (0110, 0124, 0144, 015E) en had `accu` er één dood (0146) en
één afwezig (015B) — nergens zichtbaar.

`plKernDekking(profiel)` in `pidlane-fuel.js` telt nu per kern-PID hoeveel
monsters er zijn, met de eis afhankelijk van de aard: `FILTERED_PIDS` -> 1
geldige waarde, de rest -> `KERN_REEKS_MIN` (10). Uitkomst gaat in
`plMeetPromptBlok()`:

- hoeveel kernsensoren voldoende gemeten zijn;
- welke te weinig monsters hebben, met aantal, plus de instructie ze hooguit
  als momentopname te gebruiken;
- welke GEVRAAGD MAAR NIETS GELEVERD hebben, met de instructie daar geen
  uitspraken over te doen, ook niet impliciet;
- onder 60% bruikbare kern: "indicatie, geen diagnose".

Dit blokkeert niets, zet niets aan en verandert geen enkele poort. Het profiel
komt uit `window._laatstProfiel`, gezet in `relevantSupportedPIDs()` —
één regel, puur een notitie.

Let op de robuustheid: de kernlijst leest `BASIS_PIDS` en `ANALYSE_PIDS`
zowel kaal als via `window`. De eerste versie las alleen `window.BASIS_PIDS`,
en toen de test dat niet zette meldde het blok doodleuk "alles voldoende
gemeten" terwijl de hele basisset ontbrak. Precies het soort stille
half-antwoord dat dit blok moet uitbannen; vandaar beide.

Onbekend of ontbrekend profiel -> `null` -> geen kern-blok, de rest van
`plMeetPromptBlok()` blijft gewoon staan.

### Tests

`test-kerndekking.js` (20 toetsen), knippad `const KERN_REEKS_MIN` tot
`async function runQuickAI`. Alle acht tests groen: pidgate, herijking,
meetpoort, ritpauze, busgate, plload, statrpm-letop, kerndekking.

---

## 19. De bedradingssweep van 15-08-2026

Aanleiding: de vraag of we ergens een verkeerde afslag hebben genomen. Antwoord:
ja, en niet in één module.

### Ronde 5 heeft nooit gedraaid

`PIDLANE.md` had 5a-2 en 5b allebei als ✅ staan, `test-herijking.js` was groen,
en toch gebeurde er niets. Drie oorzaken, alle drie dezelfde soort:

- **`updPID()` riep `_noteMap()` noch `plHerijkTick()` aan.** De haken stonden in
  de documentatie als gelegd; de test riep ze zélf aan en zag de ontbrekende
  bedrading dus niet. Gevolg: `_mapSamples` bleef structureel 0 en de
  turbo-detectie was nog steeds dode code — precies de fout die 5a-1 had moeten
  verhelpen, alleen via een andere deur. De "nog te valideren met een geschikt
  voertuig"-openstaander kon dus nooit slagen, ook niet met de juiste auto.
- **`purgeImplausiblePids()` bestond niet meer.** Ronde 5b verving hem door
  `herijkPidGate()`, maar de twee aanroepplekken (`pidlane-bt.js` na
  protocoldetectie, `pidlane-voertuigdata.js` bij een nieuw brandstoftype)
  bleven de oude naam gebruiken — binnen een kale `try{ }catch(e){}`, dus de
  `ReferenceError` verdween geruisloos.
- **`rebuildPidDefsCache()` in `pidlane-rijsituatie.js` heeft nooit bestaan**,
  verstopt achter een `typeof`-guard.

Alle vier gerepareerd. **Let op: dit activeert slapend gedrag.** De eerste rit
hierna kan tegels zien verdwijnen die er altijd stonden — op de CX-5 de
boost-PIDs, want die is atmosferisch, dus dat is de bedoeling. Aparte commit,
apart bekijken.

### Het patroon: 626 stille catch-blokken

Op 948 `try`'s gooien er 626 de fout weg zonder spoor. Tweederde van alle
foutafhandeling in dit project maakt een hernoemde of verwijderde functie
onzichtbaar. Dat is de verkeerde afslag — niet één module, maar een gewoonte.

Werkregel vanaf nu: **een `catch` mag stil zijn als je de fout verwacht**
(localStorage vol, DOM-element weg), **nooit rond een aanroep van eigen code.**
Niet in één keer op te ruimen; wel per module, bij de eerstvolgende keer dat je
er toch bent.

### De tegenkracht: `pidlane-bedrading.js` + `test-bedrading.js`

Eén lijst met de functies die modules van elkaar verwachten (afgeleid uit élke
`typeof X === 'function'`-guard in de bron: precies de plekken waar een
ontbrekende functie stil faalt), en twee controles:

- **runtime**: na het laden wordt gecontroleerd of ze er allemaal zijn; wat
  ontbreekt gaat luid het log in via `btDiag` én `log`.
- **statisch** (`test-bedrading.js`): elke naam in `KRITIEK` moet in de bron
  gedefinieerd zijn, én elke guard in de bron moet in `KRITIEK` staan. Die
  tweede richting is er zodat de blinde vlek niet gewoon opnieuw uitdijt.

Bewust géén statische analyse van álle aanroepen. Een parser die door
HTML-in-template-literals met apostrofs en geneste `${}` heen komt, is een eigen
project met eigen bugs — en dat is exact het soort omweg dat hier al te vaak is
genomen. Een lijst van zeventig namen is saai en werkt. Bewezen: hernoem
`herijkPidGate` en de test valt om.

### Opgeruimd

Negentien functies die nergens werden aangeroepen (ook niet vanuit HTML of een
`onclick` in een template literal) zijn verwijderd: `confirmStrategy`,
`toggleKentInput`, `openAutoExpert`, `openBtLogModal`, `recoAction`,
`toggleTheme`, `zoomReset`, `openLiveData`, `selectProto`, `setWmTab`,
`loadApiKey`, `downloadLog`, `saveAdminLogExport`, `getObdKmStand`, `isDiesel`,
`_proxy`. Samen 119 regels.

### Nog open uit deze sweep

- `pidlane-motortype.js` heet scheduler, maar de echte scheduler (`PLSched`,
  `pidPollInterval`, `pidsDueNow`) zit in `pidlane-plload.js`. Verwarrende naam,
  geen kapotte code.
- Elf modules doen hun eigen `fetch` naar de worker; er is geen centrale ingang.
- Acht modules pakken zelf een `41`-header uit in plaats van
  `splitBatchResponse()` te gebruiken. Dat is dezelfde soort verspreiding als de
  PID-filtering vóór de gate.

---

## 20. De testrun vervangt zes losse ingangen (16-08-2026)

Er waren zes kebab-ingangen die allemaal hetzelfde deden — data verzamelen en
zichtbaar maken — elk met een eigen exportformaat en een eigen half beeld:
busdiagnose, zelftest, opdracht, diagnosebundel, logscherm en copiloot. Wie een
probleem wilde natrekken moest ze alle zes langs en zelf de tijdlijnen op elkaar
leggen. Vandaar de samenvoeging tot `pidlane-testrun.js`: één knop, één rit,
één logboek.

### Blok 5 is een lijst (6.6, 02-09-2026)

Blok 5 is de plek waar elke oplevering zijn eigen proeven neerzet. Tot 6.5 was
dat één functie van 585 regels waarin geknipt en geplakt werd, met bovenaan een
banner die opsomde welke proeven erbij kwamen en welke eruit gingen — en die
opsomming stond ook in `CAMPAGNE`.

**Dat is twee lijsten van hetzelfde, met de hand bijgehouden, en dat is in dit
project de terugkerende fout.** `PIDLANE-WERK.md` ging er op 27-08 aan onderdoor
en §11 van dit bestand op 02-09; blok 5 was hem aan het overdoen. De vorm van de
fout is elke keer dezelfde: twee plekken die hetzelfde beweren, waarvan er één
stil veroudert.

Nu is elke proef een entry in `PROEVEN_B5`:

```js
{
  issue: '#40',
  naam: '#40 — de bytelengte van 0155 en 0156, gemeten',
  waarom: 'PLPidLen leert uit metingen; zonder 0155/0156 in de pollronde leert hij niets.',
  proef: function () { /* … */ }
}
```

`_blok5()` is een lus van vier regels die de lijst afloopt en verandert bij een
oplevering niet mee. `_dekkingB5()` leidt uit dezelfde lijst af welke issues
deze ronde gedekt zijn — ontdubbeld, en zonder de streep die "geen issue"
betekent — en `CAMPAGNE` draagt die regel als afleiding in plaats van als
overgeschreven tekst.

`test-blok5lijst.js` toetst wat de lijst belooft: elke entry compleet, geen twee
proeven met dezelfde naam, een dekking die echt ontdubbelt, en een `CAMPAGNE`
die elk issue uit de lijst noemt. Drie mutaties in `plmutate.sh` maken die test
rood: de dekking die niet meer ontdubbelt, een entry die zijn issue kwijt is, en
een dekkingsregel die weer met de hand is overgeschreven.

**Wat dit niet oplost.** De proeven zelf zijn niet korter geworden en de
inhoudelijke vraag "wat moet deze ronde gemeten worden" blijft mensenwerk. Wat
weg is, is de boekhouding eromheen.

### Wat wél en niet is samengevoegd

Twee van die "pagina's" waren geen pagina. `pidlane-diagbundel.js` bevat
`splitBatchResponse()`, `parsePID()` en `applyParsedBytes()` — de parser waar de
hele app op draait. `pidlane-datalog.js` bevat `validateAndSmooth()`,
`markOutlier()` en `checkStability()` — laag 1 t/m 3 van de meetketen. Alleen de
UI is daar weggehaald; de kern staat waar hij stond. `_diagNote()` blijft
verzamelen en levert via het nieuwe `plDiagGevallen()` aan het logboek.
`_lcFullText()` blijft ook: dat is het logformaat dat al in gebruik was en dat
de bugmelder gebruikt.

`verify`, `veldlab`, `waakronde` en `kwaliteit` zijn meetmotoren, geen schermen.
Die worden door de testrun *aangestuurd*, niet opgeslokt.

Copiloot is bewust vervallen in plaats van ingebouwd: dat was een live AI-chat
die functies op runtime kon patchen. In een rijdende auto is dat een ander
risico dan een leesbare meetronde, en het hoort niet achter dezelfde knop.

### De campagne

Onderaan `pidlane-testrun.js` staat `CAMPAGNE`: de vragen die déze versie moet
beantwoorden. Elke update herschrijft dat blok; de rest van het bestand blijft.
Het staat bovenaan het logboek, zodat achteraf zichtbaar is welke vraag een run
moest beantwoorden en of hij dat deed.

### De begeleide rit (01-09-2026, testrun 6.0)

De campagne hierboven was een tekst die je vóór het wegrijden las en onderweg
moest onthouden. Dat werkte niet. De rit van 01-09 22:32 verloor drie vragen
tegelijk, geen van drieën door een bug: er werd vijf minuten gereden waar er
tien nodig waren, "Rit nulstellen" is niet ingedrukt, en `0123`/`0159` stonden
niet in de pollronde terwijl de hoofdvraag over die twee ging. Het verslag
meldde dat pas achteraf, als *"staat hij in de actieve selectie?"* en *"niet
uitgevoerd deze run"*.

**Een voorwaarde die je achteraf meldt is een verwijt; dezelfde voorwaarde
vóóraf is een knop.** Dat is de hele gedachte. `PLBegeleid` loopt tien stappen
af. Elke stap zegt wat hij is, wáárom hij moet, wat de app zojuist zelf gedaan
heeft en wat jij moet doen — en je sluit hem af met een knop.

| # | stap | wat de app zelf doet |
|---|---|---|
| 1 | verbinding en versheidsbron | controleert `connected`, `_pidLastUpd`, `PLRit`, `PLBudget` |
| 2 | de meet-PIDs in de selectie | `pidToevoegen(RIT_PIDS)` en meldt de weigeringen |
| 3 | alle aanvragers aan | start waakronde, rit-monitor en bulk-recorder |
| 4 | nulmeting | `PLRit.wis()` + `PLBudget.wis()` op een eigen knop |
| 5 | rijden (≥10 min) | toont live hoeveel PIDs er écht ververst worden |
| 6 | één keer stevig optrekken | markeert het moment met snelheid en toerental |
| 7 | live view beoordelen | sluit het scherm, vraagt om een oordeel |
| 8 | logboek nalopen | opent het logboek |
| 9 | de meetblokken | `startTestrun()` |
| 10 | afronden | schrijft het verslag weg |

Drie ontwerpkeuzes, en ze hangen samen:

1. **De stappen zijn data, geen doorlopende code.** Volgorde en voorwaarden
   staan in één lijst, zodat `test-begeleid.js` ze zonder browser kan nalopen
   en een volgende oplevering er een stap in kan zetten zonder de motor aan te
   raken.
2. **`controle()` beslist niet óf je door mag, maar wát er in het verslag
   komt.** Doorgaan kan altijd — de auto staat stil terwijl je in dit scherm
   zit en de bestuurder heeft het laatste woord. Wel is er verschil tussen
   `gedaan`, `gedaan-met-bezwaar` (je zag de waarschuwing en ging door) en
   `overgeslagen` (je drukte op Overslaan). Alle drie komen ze in het verslag.
3. **Pauzeren en afronden staan bij élke stap.** Een rit die halverwege moet
   stoppen levert een half verslag op, met een regel `NIET MEER AAN
   TOEGEKOMEN` die de open stappen bij naam noemt. Dat is oneindig veel meer
   waard dan een verloren rit, en het is de reden dat de afrondknop overal
   staat.

**Markeringen.** `plMarkeer(tekst, opmerking)` schrijft naar vier plekken
tegelijk: de app-log, de BT-log, de bulk-recorder en een eigen lijst die
bovenaan het verslag komt. Vier, omdat ze op vier verschillende momenten
teruggelezen worden en er anders precies één wordt bijgehouden. Snelheid en
toerental gaan mee uit `pidVals` — dat is de laatst bekende waarde en niet per
se een verse meting, en dat staat er in het verslag zo bij.

### Wat hierna nog te automatiseren valt, en wat niet

Nagedacht bij het bouwen van 6.0, opgeschreven zodat de volgende ronde niet
opnieuw begint. In volgorde van opbrengst.

**1. Een meetgeschiktheidspoort vóór elk blok.** De begeleide rit dwingt de
voorwaarden nu af aan de vóórkant, maar de meetblokken zelf doen dat nog niet:
blok 13 meet STPX ook als de auto stilstaat, en meldt daarna zelf dat de meting
daarom niets zegt. Dat is een halve stap. Elk blok zou moeten kunnen zeggen
*"deze vraag is nu niet te beantwoorden, en dít ontbreekt eraan"* — vóórdat het
de bus belast. Blok 14 doet dat sinds #74 wél (`_meetStand()`); dat patroon is
uit te breiden naar 7, 10 en 13.

**2. Een machineleesbare voet onder het verslag.** Het verslag is nu tekst voor
mensen. Eén JSON-blok onderaan met de uitslagen per controle (id, staat, getal)
maakt twee dingen mogelijk die nu handwerk zijn: automatisch verschillen zien
tussen twee ritten, en een regressie herkennen die als "LET OP" wegvalt tussen
honderd regels. De id's bestaan al — `_boek()` krijgt blok en naam mee.

**3. Runvergelijking.** Met die voet erbij kan de testrun bij de start de
vorige run uit `localStorage` lezen en meteen melden wat er veranderd is. De
raildruk-geschiedenis van #19 (bewoog / bewoog niet / bewoog niet) had dan
meteen als tegenstrijdig gemeld kunnen worden in plaats van drie ritten lang
per stuk beoordeeld.

**4. Een zelfcontrole op de meetinstrumenten.** #29, #74, #75 en #76 zijn alle
vier dezelfde fout: een controle die zijn antwoord uit de verkeerde bron haalt
en er tóch een stellige conclusie op plakt. Dat is een patroon, geen reeks
toevalligheden. Een blok dat aan het begin van elke run naloopt of elke bron
bestaat en beweegt — `_pidLastUpd`, `pidOpgeruimdLijst`, `PLBus.stats().perPid`,
`_pidHealth` — vangt de volgende voordat er een rit aan opgaat. Blok 5 doet dit
sinds 6.0 voor twee bronnen; het hoort een eigen, blijvend blok te zijn in
plaats van iets dat per oplevering wordt herschreven.

**5. Automatisch markeren op gebeurtenissen.** Optrekken, remmen, een
herverbinding en een DTC zijn uit de data te herkennen. Zelf markeren blijft
nodig voor wat alleen de bestuurder weet ("hier klonk het raar"), maar de
mechanische helft hoeft niet met de hand.

**Wat niet te automatiseren is, en waarom dat geen tekortkoming is.** Of de
tellerplaat *iets zegt* als je intrapt; of een temperatuurschaal leesbaar is;
of de onderste regel vrij van de Android-knoppen blijft; of een geluid
verontrustend klinkt. Dat zijn oordelen, en een oordeel dat je automatiseert is
een aanname die je niet meer terugziet. Wat wél kan, en wat 6.0 doet, is ze op
het juiste moment vrágen en het antwoord vastleggen — inclusief "niet kunnen
kijken", want ook dat is een uitkomst.

### De selectie overschrijven

Blok 3 zet álle ontdekte PIDs actief, leest ze één voor één los uit en zet de
ruwe respons naast de parser-uitkomst in het log. Dat vraagt om waterdicht
herstel: een momentopname vooraf, terugzetten in een `finally`, én een kopie in
`localStorage` zodat een crash of een weggezwiepte app de selectie niet
permanent wijzigt — bij het laden wordt die rest opgemerkt en teruggezet.

### Bij het bouwen gevangen

`test-bedrading.js` betrapte drie verzinsels van Claude in één sessie: zes
schermnamen die niet bestaan, een niet-geregistreerde guard, en
`savePidSelection()` — een functie die nooit heeft bestaan (de PID-selectie
wordt per sessie opnieuw opgebouwd, niet bewaard). Precies waarvoor die test er
is.

### Broncode-inspectie werkt hier niet

De eerste testrun controleerde of `updPID` de ronde-5-haken aanroept door
`String(window.updPID)` te doorzoeken. Dat meldde "ronde 5 staat stil" terwijl
alles bedraad was: `pidlane-remote.js` vervangt `updPID`, `sendCmd`,
`ensurePIDListActive`, `selectCategoryPIDs` en `realScanDTC` door wrappers die
de originelen in een closure houden. Wie de broncode van de globale leest, ziet
de wrapper.

**Regel: controleer gedrag, niet broncode.** Daarvoor zijn er nu twee uitgangen:
`PLGate.stats()` (MAP-monsters, herijkingen, ticks) en `PLElm.poortDicht()`.
Tellers kunnen niet door een wrapper verstopt worden.

Zelfde run, tweede les: `openShare` bestaat als functie maar staat lokaal in de
IIFE van `pidlane-remote.js`. `test-bedrading.js` vond de definitie in de bron
en gaf groen; de runtime-controle vond niets op `window`. **Een statische
definitie is geen globale beschikbaarheid** — de runtime-controle is de
autoriteit, de statische test is de eerste zeef.

### Opslaan: eerst vragen, dan opmaken (17-08-2026)

Elk logpad had zijn eigen opslaan-knop en zijn eigen formaat. Zodra er iemand
meekijkt tijdens een test is platte tekst het verkeerde antwoord, en zodra je
zelf iets moet natrekken is een PDF juist onhandig. Daarom vraagt
`plOpslaan(basisnaam, tekst, opties)` het nu gewoon, en leveren beide knoppen
dezelfde inhoud.

De PDF hergebruikt bewust de opmaak van het AI-rapport (jsPDF, blauwe kopband,
voertuigblok, paginanummers), zodat alles wat de app uitspuugt bij elkaar hoort.
De inhoud staat in monospace omdat deze logs op uitlijning en ruwe hex leunen;
statuswoorden krijgen kleur zodat een lezer die het bestand voor het eerst ziet
weet waar hij moet kijken. Scheidingslijnen worden getekend in plaats van als
rij streepjes geschreven, en te lange regels (de busstatistiek is één JSON van
honderden tekens) worden afgebroken in plaats van over de rand geschreven.

Lukt het laden van jsPDF niet — het komt van een CDN, dus internet nodig — dan
valt de knop terug op tekst mét een melding waarom, in plaats van stil niets te
doen.

`test-export.js` draait `plMaakPdf()` tegen een nagemaakte jsPDF en toetst de
tekenopdrachten: kopband op élke pagina, één voertuigblok, drie statuskleuren,
afgebroken lange regels, kloppende paginanummers. Daarmee is te controleren wat
je anders alleen met je ogen op een telefoonscherm kunt zien.

### Blok 5: de update zelf toetsen (17-08-2026)

`CAMPAGNE` was een beschrijving — vijf zinnen die in het logboek belanden.
Er werd niets van getoetst. De vier meetblokken keken naar de app in het
algemeen, dus je zag wél dat de app draaide en níét of de wijziging van
gisteren werkte.

`_blok5()` is de tegenhanger: daar staat de controle, in `CAMPAGNE` de vraag.
Herschrijf ze samen bij elke update. Twee soorten controles horen er altijd in:

- **TOEGEVOEGD** — bestaat het nieuwe én werkt het. Niet "staat het in de
  bron": op 17-08 bleek broncode-inspectie waardeloos omdat `pidlane-remote.js`
  globals wrapt. De PDF-controle maakt daarom écht een PDF van een paar regels;
  dat is meteen de enige manier om te merken dat jsPDF van een CDN komt en dus
  internet nodig heeft.
- **VERWIJDERD** — is het oude echt weg. Dit is de belangrijkste en de
  makkelijkst te vergeten helft: op 16-08 zijn zes ingangen gesloopt, en een
  achtergebleven verwijzing merk je pas als een klant erop drukt. Blok 5
  controleert daarom dat `openBusDiag`, `openZelftest`, `openOpdracht`,
  `plCopilotOpen`, `openLogCenter` en `plDiagBundle` niet meer bestaan, én
  loopt élk `onclick` in de DOM na op functies die er niet zijn.

Blok 5 draait als eerste: gaat er iets mis met de update, dan staat dat bovenaan
en niet onder driehonderd regels sweep.

### Het voertuigprofiel werd nooit tegen de ECU gehouden (18-08-2026)

Vier sensoren stonden in de actieve selectie die deze CX-5 niet ondersteunt.
Blok 6 van de testrun mat het uit: elke verdachte PID los, met ruime timeout, in
een paar, in een groep van zes en met headers aan, met `010C` als controle door
dezelfde molen. Uitkomst: de controle-PID antwoordde overal (adres `7E8`), de
vier verdachten nergens, en hun steunbit stond op nul. Breed gemeten: **7 van de
62 PIDs in het profiel worden door de ECU ontkend** — exact de zeven die in de
sweep nooit antwoordden.

Oorzaak: `initConnection()` slaat de ontdekking over zodra het VIN bekend is en
laadt `supportedPIDs` uit een opgeslagen profiel. Dat profiel is ooit gemaakt —
vermoedelijk door de directe-poll-fallback — en werd sindsdien elke sessie
hergebruikt zonder ooit tegen de bitmap gehouden te worden. **Een fout die één
keer is opgeslagen bleef daardoor voor altijd staan**, met tegels die nooit iets
tonen en pollbudget dat naar niets ging.

`profielTegenSteunbits()` (in `pidlane-rijsituatie.js`) leest nu alsnog
`0100/0120/0140/0160`, gooit eruit wat de ECU ontkent, en schrijft het profiel
opnieuw weg zodat het zichzelf herstelt. Vier verzoeken, dus de snelle start
blijft snel. Wat de ECU niet noemt — mode 21/22, fabrikant-PIDs — blijft staan:
daar bestaan geen steunbits voor, dus afwezigheid zegt daar niets. Is geen enkel
steunblok leesbaar, dan wordt er níéts verwijderd.

Deze functie verwijdert sensoren, dus `test-steunbits.js` toetst de telling met
de échte antwoorden van de CX-5 (`4100FE3FA813`, `4120A007B011`,
`4140FAD08C81`, `41606B080001`) tegen wat er in het veld aantoonbaar wél en niet
antwoordde. Inclusief de randgevallen: een niet-gelezen blok mag nooit tot
verwijderen leiden, en mode 22 heeft geen steunbits.

