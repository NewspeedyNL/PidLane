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
│  ├─ admin.html          (49 KB)  admin-, gebruikers-, klant- en codebeheer
│  └─ LEESMIJ.md                    hoe je hem lokaal draait
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
| 48 | `pidlane-export.js` | 20 | `plOpslaan`/`plMaakPdf` — jsPDF in huisstijl |
| 49 | `pidlane-testrun.js` | 76 | één knop, één rit, één logboek. Vervangt busdiag/zelftest/opdracht/diagbundel/logscherm/copiloot — zie §20 |
| 50 | `pidlane-logboek.js` | 16 | `PLLogboek` — voegt vier logbronnen samen in één tijdlijn: `log()` (500 regels, via `plLokaalLog()`), `btDiag()` (1400, met kopie in localStorage), de diagbundel-ring (400) en de live-log-spiegel. Kebab → Logboek. **Trekt** data op bij openen; hangt zich niet in `log()` of `btDiag()` — die codebase heeft al één laag wrappers (`pidlane-remote.js`) en een tweede zou broncode-inspectie onbruikbaar maken |
| 51 | `pidlane-privacy.js` | 12 | `PLPrivacy` — prominente Bluetooth-disclosure vóór `connectSerial()`, plus privacyscherm in het menu. Play Store-eis, zie `ANDROID-PLAYSTORE.md` |
| 52 | `pidlane-start.js` | 20 | `PLStart` — startscherm: adapterprofielen per type, geheugen van eerdere verbindingen, verbindingscascade als live voortgang. Stuurt óók de ketenvolgorde in `connectSerial()` |
| — | `pidlane-bedrading.js` | 20 | `PLBedrading` — moet ALTIJD achteraan; controleert dat elke `typeof X === 'function'`-guard een geregistreerde naam is. Zie §19 |

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
| `/proxy` | generieke uitgaande proxy (RDW/NHTSA), whitelist op host |
| `/download/*`, `/version.json` | APK uit R2 |
| `/health` | statuscheck |

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
en in de Config-base `Users`, `Klanten` en `TokenCodes`. `TokenLog`
(`tblCrXVqEbaPTQQ2S`, aangemaakt 31-07-2026) staat er ook, maar er schrijft
niets in — zie het kasboek-kader in §8 en issue #83.

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

Het tweede pad was het ergere van de twee en werd bij de eerste ronde gemist:
`logToSheets()` schreef de volledige VIN in een **eigen kolom**, op élke
logregel, met de kolom `User` in dezelfde rij. Niet weggestopt in een JSON-blob
zoals bij Veldlab, maar gewoon zichtbaar in de tabel.

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

### Kasboek — TokenLog: ONTWORPEN, NIET GEBOUWD

**Herzien op 02-09-2026 (#83).** Hier stond een volledige beschrijving van een
kasboek: tabel `TokenLog`, negen velden, vier bronnen, twee regels die
vastliggen, en de zin "geschreven door `tegoedLog()` in `worker.js`". Die
functie bestaat niet, en blijkens `git log -S tegoedLog` heeft ze nooit in dit
bestand gestaan. Er wordt bij een saldomutatie nergens iets weggeschreven.

De tekst is bewaard in de geschiedenis en het ontwerp staat als issue #83; het
staat hier niet meer als beschrijving, want dat is precies wat het onzichtbaar
hield: wie §8 las, kruiste dit punt af.

Waarom het er hoort te komen: op 31-07-2026 verdwenen er tokens zonder
analyses. Oorzaak bleek `testApiKey()`, die bij élke app-start een echte call
deed. Dat was alleen te achterhalen door de code te lezen — met een kasboek was
het één blik geweest. Die aanleiding klopt nog steeds, en zolang er geen kasboek
is blijft een verdwenen token een leesklus.

**De les is niet de ontbrekende functie maar de vorm.** Documentatie die een
ontwerp in de tegenwoordige tijd beschrijft, leest als een beschrijving van wat
er staat. Twee dingen zijn er zo blijven liggen: dit kasboek, en het uitlezen
van `X-PidLane-Saldo` (punt 3 hierboven), dat sinds juli beschreven stond en pas
op 02-09-2026 gebouwd is. Wat nog niet bestaat, staat vanaf nu als issue met een
vooruitwijzing hier — niet als alinea in de tegenwoordige tijd.

**Achtergrondcalls kosten geld.** Sinds de Worker afrekent is élke call naar
`/v1/messages` billable, ook calls die nooit langs `PLCredits.preflight` gaan
en die de gebruiker niet als analyse ziet. Voeg je een AI-call toe die vanzelf
afgaat, bedenk dan eerst wie hem betaalt. `testApiKey()` draait daarom niet
meer voor klantaccounts.

**Die grens is er niet meer, op één plek na.** Hier stond dat Airtable geen
transacties kent en dat twee gelijktijdige calls van hetzelfde account elkaars
afboeking konden overschrijven — met de Durable Object als toekomstige
oplossing. Die is er sinds 26-08-2026: `metSaldoSlot()` serialiseert elke
saldomutatie per klant (zie §7). Sinds 02-09-2026 lopen **alle vier** de
schrijvers erdoorheen: `handleMessages` (AI-afboeking), `handleCreditsRedeem`
(activatiecode), `handleKlantOnboarding` (proeftegoed) en
`handleAdminKlantenPost` met actie `bijboeken`.

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

De actie `update` (saldo op een absoluut bedrag zetten) loopt bewust niet door
het slot: daar stuurt de beheerder het eindbedrag en ziet hij een getal dat hij
zelf heeft ingetikt. Dat is een ander geval.

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

Bijgewerkt 02-09-2026. `PLAN.md`, `OVERDRACHT.md` en `PIDLANE-WERK.md` bestaan
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

