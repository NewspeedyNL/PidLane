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
| App-ID | `nl.pidlane.app` |

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
│  ├─ beheer.html        (190 KB)  de enige beheerpagina: klanten, codes, gebruikers,
│  │                               logboek, database (D1), meetopdrachten, tabellen,
│  │                               instellingen — admin.html is er op 24-09 in opgegaan
│  ├─ serve.js                      lokale server (npm run admin), plus precies twee
│  │                               bestanden uit public/: de opdrachtkeurder en de PID-tabel
│  └─ LEESMIJ.md                    hoe je hem lokaal draait, en wat elk tabblad doet
└─ public/                          ← alles hier wordt PUBLIEK geserveerd
   ├─ index.html           (203 KB) HTML-structuur + bootstrap + script-tags
   ├─ config.js            (3 KB)   PROXY_URL, AIRTABLE_URL, APP_VERSION
   ├─ pidlane.css          (157 KB) hoofdstylesheet
   ├─ pidlane-*.js         (39 modules, zie §4)
   └─ test-*.js            (38 tests, draaien via plcheck.sh)
```

> **De beheerpagina staat bewust buiten `public/`.** Alles in `public/` wordt door de
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
> 53 script-tags: `capacitor.js`, `config.js` en 51 `pidlane-*.js`-modules.
> (21-08: `pidlane-gps.js` eruit, `pidlane-run.js` erbij — telling ongewijzigd.
> 16-09: `pidlane-adapter.js` erbij, één tag meer.)
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
| 27 | `pidlane-motortype.js` | 26 | motortype-splitsing poll-scheduler, `autoExpertAsk`, `wizRdwLookup`. Ook `download()` — de enige uitgang voor elk exportbestand: mét verbinding rechtstreeks naar `Documenten/PidLane/` (#132), zonder verbinding via de deelkaart. Test: `test-opslagroute.js` |
| 28 | `pidlane-theme.js` | 14 | thema, lettertype, zoom, **sessieherstel bij boot**. `plThemaZet('licht'\|'donker')` is de enige plek die het thema zet; de keuze staat in `ns_theme` en de standaard is donker (#141). Proef: `bproef-contrast.js` |
| 29 | `pidlane-neon.js` | 12 | neon dashboard — ronde meters |
| 30 | `pidlane-rit.js` | 29 | ritanalyse — fases meten, `generateRitRapport()` bouwt het rapport en stuurt het naar de AI. Twee lijsten met elk één betekenis: `ritLogs` draagt de fases (mét `stats`), `ritPauzeLog` de onderbrekingen (mét de fase waarin ze vielen). Tests: `test-ritpauze.js`, `test-ritrapport.js`, `bproef-ritrapport.js`, blok 5 |
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
| 56 | `pidlane-adapter.js` | 10 | `PLAdapter` — **het verbindingspaneel achter de OBD-chip** (#210/#211/#212, 16-09-2026). Toont wat de app al wist maar nergens liet zien: verzoeken/s, responstijd, bezetting, foutgraad, onvolledige antwoorden, herhaalde frames, twee grafieken over twaalf minuten, en het actielogboek van `PLLoad` mét de reden per stap. Kan het tempo en de groepsgrootte laten overnemen door een mens (`PLLoad.handmatig()`, `PLBus.batchZet()`), en heeft een eigen snelheidstest van 40 s die **solo én batch** meet — dat verschil is precies wat blok 10 niet ziet. Regelt zelf niets: de automaat blijft `PLLoad`, de statistiek blijft `PLBus`. `advies()` is een pure functie en staat los van de meting. Tests: `test-adapterpaneel.js`, `bproef-adapterpaneel.js`, `bproef-schermranden.js` |
| 57 | `pidlane-waarneming.js` | 8 | `PLWaarneming` — **de autolaag** (#225, 17-09-2026): wat er op DÉZE auto is waargenomen, over ritten heen. `meld()` kan maar één ding zeggen — *gezien* — want "gemeten dat het er niet is" bestaat niet; `weerleg()` is de enige bron die *nee* mag zeggen en dat is een mens. Bij tegenspraak beslist het moment: een waarneming van vóór een weerlegging is juist wat er weerlegd is, een van erná is nieuw bewijs. Sleutel als `PLPidLen` (`vin \|\| merk\|model\|jaar`); geen sleutel = geen opslag, en dan zegt `reikwijdte` `sessie`. `PLAandrijving.tik()` promoveert de start/stop-stop erheen. Tests: `test-waarneming.js`, `test-meetcontext.js`, blok 5 |
| 58 | `pidlane-render.js` | 3 | `PLRender` — **meldt na een herstart of er een rendercrash aan voorafging** (#229, 22-09-2026). De native kant (`native/PLRender.java`) vangt `onRenderProcessGone` af, houdt het proces in leven en bouwt de activiteit opnieuw op; deze module vraagt daarna één keer `PLRender.laatste()` op en zet het moment plus de oorzaak (interne fout of geheugen) als fout in het logboek, en dus in D1. Zonder die regel leest een rendercrash als "het proces was bevroren". Test: `test-nativeschil.js` |
| — | `pidlane-bedrading.js` | 20 | `PLBedrading` — moet ALTIJD achteraan; controleert dat elke `typeof X === 'function'`-guard een geregistreerde naam is. Zie §19 |

### `native/` — de enige map met code die niet in de browser draait (11-09-2026)

Twee Java-bestanden, `PLMeetdienst.java` (de foreground service met zijn eigen
hartslag) en `PLMeetdienstPlugin.java` (de Capacitor-brug ernaartoe). Ze horen
in `android/app/src/main/java/nl/pidlane/app/`, en die map bestaat niet in de
repo: hij wordt elke build opnieuw gegenereerd uit het Capacitor-template.
`build-apk.yml` kopieert de bestanden er dus bij elke build in, leidt de doelmap
af uit de `package`-regel in de bestanden zelf, registreert de plugin in
`MainActivity` en injecteert de service plus zijn permissies in het manifest.

**Waarom ze hier staan en niet in de workflow.** Een heredoc in de YAML werkt
net zo goed en is onleesbaar: geen diff die iets zegt, geen test die hem
nakijkt, en native code die niemand ooit terugleest. `public/test-nativeschil.js`
legt deze bestanden naast de workflow en naast `pidlane-meetdienst.js`.

Sinds 22-09-2026 (#229) staat er ook `PLRender.java` plus `PLRenderPlugin.java`: een `WebViewListener` die `true` teruggeeft bij een rendercrash, zodat Android het proces — en daarmee de meetdienst — niet afschiet. Hij wordt ná `super.onCreate()` gekoppeld, want pas dan bestaat de bridge.

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
| `/admin/klanten` | klantbeheer voor beheer.html (GET/POST) |
| `/admin/codes` | activatiecodes genereren en beheren (GET/POST) |
| `/admin/users` | zakelijk gebruikersbeheer |
| `/admin/tabel` | de bekende bronnen lezen (GET) — Airtable én D1 — één record wijzigen, wissen, of (D1) opruimen na tellen (POST) — zie **De adminbrowser** hieronder |
| `/admin/d1` | de logdatabase als geheel: overzicht over álle rijen en één rit compleet (GET); SQL-console die alleen leest, en meetopdrachten aanmaken, bewaren, activeren, uitzetten (POST) — zie **De databasekant** hieronder |
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

**De databasekant — `/admin/d1` (24-09-2026).** `/admin/tabel` toont één bron
als lijst. Wat daar niet past zijn vragen over de hele database (hoeveel, per
dag, wat deed deze rit) en één handeling die bij geen enkele bron hoort: een
meetopdracht aanzetten zet de andere uit. Vier regels:

| wat | hoe | waarom |
|---|---|---|
| **cijfers** | SQLite telt over de hele tabel, elk deel in een eigen `try` met de fout in `fouten` | het Logboek telt wat er opgehaald is; een ontbrekende tabel hoort het logdeel niet mee te sleuren |
| **leesconsole** | `SELECT * FROM (<vraag>) LIMIT 501`, en daarvóór een tekstkeuring zonder tekstwaarden en commentaar | in een subquery past geen schrijfstatement; de keuring is de tweede laag. Elke laag apart uitzetten is rood (`test-admind1.js`, deel 2 en 3) |
| **één actieve opdracht** | activeren draait `Actief = 0` voor de rest en `Actief = 1` voor deze in één `batch()` | op 22-09 stonden er negen aan en won de verkeerde; een batch is in D1 één transactie |
| **`Gewijzigd`** | zet de Worker zelf; `Actief`, `Gewijzigd` en `id` zijn niet met de hand te schrijven | de app kiest op die tijd — bijstellen is stil kiezen welke opdracht rijdt |

De Worker keurt geen opdracht; dat blijft op één plek, in
`public/pidlane-opdracht.js`. `beheer.html` laadt dat bestand zelf en keurt
vóór het activeren. Gedekt door `test-admind1.js` (69 controles, op echte
SQLite uit `schema.sql`, met de leesroute van de app erbij geknipt), zes
mutaties in `plmutate.sh`, en deel 7 en 8 van `bproef-beheerpagina.js`.

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

## 11. Bekende problemen — de uitleg staat in het archief

**Verplaatst op 22-09-2026 (#265).** Dit hoofdstuk was 394 KB van de 515 KB
van dit bestand: driekwart van de architectuurkaart bestond uit de uitleg bij
bevindingen. Elke sessie die `PIDLANE.md` opensloeg om te zien wáár iets zit,
sleepte die 394 KB mee. Dat is precies de groei die `PIDLANE-WERK.md` op
27-08 de kop kostte, alleen een hoofdstuk lager.

De inhoud is niet weg — hij staat ongewijzigd in `PIDLANE-ARCHIEF.md`. Zoek
er gericht in met `grep`; dat is waar dat bestand voor is.

| wat je zoekt | waar het staat |
|---|---|
| wat er nú openstaat | de GitHub-issues, gelabeld op soort, kant en ernst |
| waarom iets stukging, wat er geprobeerd is, welke conclusie fout bleek | `PIDLANE-ARCHIEF.md` |
| in welk bestand iets zit | §4 hieronder |

**Nieuwe uitleg schrijf je vanaf nu rechtstreeks in `PIDLANE-ARCHIEF.md`**, met
een datumkop. Niet hier: een hoofdstuk dat weer begint te groeien is hetzelfde
probleem met een ander nummer.

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

