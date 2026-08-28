# PIDLANE.md — architectuurkaart

> Doel van dit bestand: Claude (of een nieuwe medewerker) moet hiermee weten
> **welk bestand je nodig hebt** zonder de code te lezen. Het staat in de repo en
> nergens anders — een kopie in een kennisbank loopt achter en gaat de code
> tegenspreken. Bij elke structuurwijziging bijwerken.
>
> Laatst bijgewerkt: 2026-08-27 — werkafspraken herschreven voor het werken
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
├─ PIDLANE-CONTRACT.md              ontwerp: meetkwaliteit en sessiedekking (nog niet gebouwd)
├─ PROJECT-INSTRUCTIES.md           de tekst voor het instructieveld van het Claude-project
├─ .github/workflows/
│  ├─ build-apk.yml                 APK- en .aab-build
│  ├─ tests.yml                     testgate: draait plcheck.sh op elke push
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

`index.html` was 735 KB en is op 2026-07-28 opgesplitst naar ~203 KB.
Daarvan is ~139 KB echte HTML-markup, ~42 KB build-changelog in commentaar,
~11 KB inline CSS en ~8,5 KB inline bootstrap-JS.

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
| 3 | `pidlane-data.js` | 100 | statische referentiedata: 148 J1979-PID-definities, `DTCDB` (generiek) + `DTC_MERK` (merkbuckets) + `merkGroep()`, kennisbank, analysesets |
| 4 | `pidlane-assets.js` | 205 | ingebedde media (base64), o.a. `BANDEN_IMG` |

### Fase 2 — kern (in `<body>`, rond regel 2128)

| # | Module | KB | Doet |
|---|---|---|---|
| 5 | `pidlane-auth.js` | 39 | login, HMAC-sessietokens, adminpaneel, gebruikersbeheer, API-sleutelbeheer |
| 6 | `pidlane-pidgate.js` | 18 | **de PID-gate**: `pidGate()`, `herijkPidGate()`, `pidToevoegen()`, `vehiclePlausiblePid()`, turbo-detectie, herijkstempel, `getPidDef()`, `isReportableSensor()` — zie §15 |
| 7 | `pidlane-kwaliteit.js` | 9 | **datakwaliteit**: `assessPidQuality()` (`ok`/`twijfel`/`onzin`/`nodata`), `buildQualityReport()`, `_qualityBlokFor()`, `RAPPORT_DISCLAIMER` + `_withDisclaimer()` — vult `_pidHealth`, zie §15 |
| 8 | `pidlane-veldlab.js` | 49 | meetsessieregistratie → Referentie-store (`PidLaneEvalLog`) |
| 9 | `pidlane-datalog.js` | 28 | datalog, `validateAndSmooth`, outlierdetectie, stabiliteit, protocolkeuze |
| 10 | `pidlane-archief.js` | 25 | sessierapportarchief, AI-rapporthook, TXT/PDF-export |
| 11 | `pidlane-pids.js` | 29 | PID-paneel, gauges, breedband-lambdacorrectie B1S1 |
| 12 | `pidlane-correlatie.js` | 3 | deterministische PID-correlatie-engine |
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
| `/credits/redeem` | activatiecode inwisselen (tabel `TokenCodes`), atomair via een Durable-Object-slot |
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
en in de Config-base `Users`, `Klanten`, `TokenCodes` en `TokenLog`
(`tblCrXVqEbaPTQQ2S`, aangemaakt 31-07-2026).

**Twee soorten accounts, bewust gescheiden.** `Users` zijn zakelijke logins op
gebruikersnaam (abonnement, geen tokenverbruik). `Klanten` zijn zelf-
geregistreerde consumenten op e-mailadres, met een `Saldo`-veld. Het inlogveld
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

### Kasboek — TokenLog

Elke mutatie op een tokensaldo krijgt een regel in `TokenLog` (Config-base),
geschreven door `tegoedLog()` in `worker.js`. Vier bronnen: `ai-call`,
`code-ingewisseld`, `proeftegoed` en `admin-mutatie`.

Velden: `Moment`, `Klant`, `Soort`, `Credits` (negatief bij afboeken),
`SaldoNa`, `TokensIn`, `TokensUit`, `Model`, `Details`. Lege cel = onbekend;
bij een adminmutatie blijft `Credits` bewust leeg omdat het oude saldo daar
niet gelezen wordt.

Twee regels die vastliggen:

- **Het kasboek is administratie, geen bron van waarheid.** Het saldo staat in
  `Klanten.Saldo`. Een mislukte logregel mag de call nooit laten stranden;
  daarom zit alles in een try en gaat de schrijfactie via `ctx.waitUntil`.
- **Een mislukte afboeking krijgt óók een regel**, met `Credits: 0` en een
  `Details` die dat meldt. Juist dan wil je later kunnen zien dat er AI is
  verbruikt zonder dat er iets van het saldo af ging.

Aanleiding: op 31-07-2026 verdwenen er tokens zonder analyses. Oorzaak bleek
`testApiKey()`, die bij élke app-start een echte call deed. Dat was alleen te
achterhalen door de code te lezen — met een kasboek was het één blik geweest.

**Achtergrondcalls kosten geld.** Sinds de Worker afrekent is élke call naar
`/v1/messages` billable, ook calls die nooit langs `PLCredits.preflight` gaan
en die de gebruiker niet als analyse ziet. Voeg je een AI-call toe die vanzelf
afgaat, bedenk dan eerst wie hem betaalt. `testApiKey()` draait daarom niet
meer voor klantaccounts.

**Bekende grens:** Airtable kent geen transacties. Twee gelijktijdige calls van
hetzelfde account (twee apparaten) kunnen elkaars afboeking overschrijven. Bij
normaal gebruik lopen calls achter elkaar. Wordt dit ooit een probleem, dan is
de Durable Object de plek om het saldo te serialiseren.

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
  mag committen. `tests.yml` draait hetzelfde in CI, plus een sleutelscan.
- **Bij elke oplevering ook `CAMPAGNE` en `_blok5()` in `pidlane-testrun.js`
  herschrijven**, zodat blok 5 toetst wat er in díé update veranderd is —
  toegevoegd én verwijderd. Zie §20.
- Build-changelog bovenaan `index.html` (HTML-commentaar).
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

Bijgewerkt 27-08-2026. `PLAN.md`, `OVERDRACHT.md` en `PIDLANE-WERK.md` bestaan
niet meer. **Wat er open staat, staat in de issues** — dit hoofdstuk verwijst
ernaar en bewaart de uitleg eromheen: waarom iets stuk was, wat er al geprobeerd
is, en welke conclusie achteraf fout bleek. Dat laatste is de reden dat de
opgeloste punten hieronder blijven staan.

### Wat er open staat — de issues

Op 27-08-2026 is alles wat hier als open stond naar GitHub-issues verhuisd. De
beschrijving staat daar en niet meer hier: twee lijsten van hetzelfde lopen uit
de pas, en dan is de vraag welke klopt.

| # | wat | soort |
|---|---|---|
| [#12](https://github.com/NewspeedyNL/PidLane/issues/12) | blok 7 presenteert een nulmeting als "vrijwel geen verschil" | bug |
| [#13](https://github.com/NewspeedyNL/PidLane/issues/13) | `merkGroep()`: BMW matcht op gelijkheid, MINI op prefix | bug |
| [#14](https://github.com/NewspeedyNL/PidLane/issues/14) | PID `0143` staat er 256× naast | bug |
| [#17](https://github.com/NewspeedyNL/PidLane/issues/17) | bulkrecorder schrijft UTC, logger lokale tijd | bug |
| [#22](https://github.com/NewspeedyNL/PidLane/issues/22) | zwevende chips liggen over de bulk-recorder | UI — oorzaak weggenomen 27-08 |
| [#18](https://github.com/NewspeedyNL/PidLane/issues/18) | de app bevriest op de achtergrond | groot |
| [#15](https://github.com/NewspeedyNL/PidLane/issues/15) | vier aanvragers op één bus — wordt dat één poort? | besluit |
| [#16](https://github.com/NewspeedyNL/PidLane/issues/16) | opruimregel: drempel en terugweg | besluit |
| [#19](https://github.com/NewspeedyNL/PidLane/issues/19) | raildruk `0123`/`0159` over een hele rit | meten |
| [#20](https://github.com/NewspeedyNL/PidLane/issues/20) | mode 22 olietemperatuur: dienst leeft, identifier onbekend | meten |
| [#24](https://github.com/NewspeedyNL/PidLane/issues/24) | restjes uit de bedradingssweep (vijf eindjes) | opruimen |
| [#25](https://github.com/NewspeedyNL/PidLane/issues/25) | kleine staarten uit de testruns van 26-08 | opruimen |

Wat hieronder blijft staan is de **uitleg** die je nodig hebt om die issues te
begrijpen: hoe het systeem in elkaar zit en welke fouten er eerder zijn gemaakt.
De stand van zaken staat in de issues.

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

### De blijvende lijst

**Opgelost op 27-08:** wie vóór de tekstcorrectie akkoord gaf, gaf dat op een
onjuiste voorstelling van zaken (meetdata heette anoniem, is pseudoniem) — dat
akkoord is aanvechtbaar en mocht niet blijven gelden. `klantPubliek()` in
`worker.js` rekent nu `akkoordActueel` uit door `AkkoordOp` te vergelijken met
het moment van de correctie (`AKKOORD_TEKST_SINDS`); `_neemSessie()` in
`pidlane-klant.js` toont `openOnboarding()` opnieuw zolang dat niet actueel is,
zónder het proeftegoed er nog eens aan te koppelen — `StartTegoedGegeven` blijft
de enige gate daarvoor. Geen nieuw Airtable-veld nodig: `AkkoordOp` bestond al
en wordt al bij elk akkoord bijgewerkt. Getest in
`test-akkoord-heraccorderen.js`.

De bugmelder (`_bugDiag()` in `pidlane-auth.js`) stuurt bij het handmatig
melden van een bug de ruwe VIN mee, en dat is bewust: anders dan de logroute is
dit door de gebruiker zelf aangezwengeld, het staat sinds 27-08 bij het knopje
vermeld, en bij een bug over één specifiek voertuig is de VIN juist bruikbaar.
Geen open punt.

**Nieuw op 20-08 en nog open** — beide staan nu als issue: `0143` staat er 256×
naast (#14) en mode 22 leeft op deze CX-5 terwijl de identifier onbekend blijft
(#20).

**Opgelost op 20-08:** de merk-preset zette PIDs terug die de ECU ontkent
(§15 ronde 6); het brandstoftype kwam ná de scan die het moest sturen (§15b);
de wizard toonde voortgang voor voltooid werk (§15b).

1. **Restjes** — vijf losse eindjes uit de bedradingssweep, verzameld in #24.

2. **Geen herijking van de bronlijst.** `discoveredPIDDefs` wordt gebouwd
   tijdens de gezondheidsscan, wanneer het brandstoftype meestal nog onbekend
   is. Komt RDW later met "benzine", dan haalt `purgeImplausiblePids()` de
   AdBlue-tegel wel uit `activePIDs`, maar de bronlijst wordt niet herbouwd —
   dus de sensor staat nog gewoon in de keuzelijst. De gate is geen zuivere
   functie van de PID maar van (PID, huidige kennis); de bronlijst heeft dus
   invalidatie nodig. Ronde 5 in §15.
   **15-08-2026:** ronde 5 was al gebouwd om dit op te lossen, maar was nooit
   bedraad — zie §18. Nu wel. Dit punt geldt daarmee als opgelost, maar is nog
   niet in de praktijk bevestigd: eerste rit erna nakijken.

### Opgelost op 15-08-2026 — de ELM-poort en drie halve sloten

Aanleiding: het veldlog van 15-08 liet zien dat na een socket-dip de
ELM-herinitialisatie dwars door de pollus liep — `ATWS`/`ATE0`/`ATSP0`
afgewisseld met PID-requests, echo nog aan, protocoldetectie weggegooid, per
dip ~10 s onbruikbare data. Op een lange rit tientallen keren.

De `withBus('elm-init')`-wrapper in `pidlane-bt.js` was er al, maar dekte het
niet, om drie redenen die op één ding neerkomen: **het busslot is
adviserend.** Het werkt alleen voor code die eerst `PLBus.claim()` doet.

1. `sppReconnectGuard` plant de re-init met `setTimeout(60)` buiten de queue;
   in dat gat gaf de pollus zijn slot vrij en kon één vuile batch erdoorheen.
2. `PLBus.wait()` geeft na de limiet `0` terug en de aanroeper gaat tóch door
   — bewust, want de guard draait ín de `sendCmd` van de houder en zou anders
   deadlocken. Duurt een survey langer dan 8 s, dan draait de init ongelokt.
3. `PLBus.breek()` bij een nieuwe verbinding breekt élke houder open, ook een
   lopende `elm-init`.
   Plus de aanroepers die `PLBus` überhaupt niet raken: `03`/`04` in
   `pidlane-graph.js`, de AT-baseline-rollback in `pidlane-btflow.js`.

**Nu: een tweede, hárde poort naast het slot** (`pidlane-bt.js`,
`_elmPoortDicht/_elmPoortOpen/_elmSend`). Staat de poort dicht, dan weigeren
`sendCmd` én `sendBT` alles wat geen eenmalig doorlaatbewijs meebrengt; alleen
de init-reeks heeft dat. Het bewijs is one-shot en wordt synchroon gezet en
gewist — een "init loopt"-boolean zou de code die tijdens een `await` van de
init draait óók doorlaten. De poort gaat dicht op het moment dat de socket
dood wordt verklaard (niet pas in de `setTimeout`), open in de `finally` van
`_metElmBus` en ook bij een gefaalde of overgeslagen re-init, en vervalt na
15 s zodat een vastgelopen init de bus niet gijzelt. Een weigering gaat vóór
`PLBus.note()` en `trackBtQuality()` langs: telde hij mee, dan haalde
`_emptyStreak` binnen zes weigeringen de "verbinding dood"-drempel en trok de
app een herverbinding op gang — een reconnect-lus veroorzaakt door de
bescherming tegen reconnects. Test: `test-elmpoort.js`.

Drie fixes van dezelfde soort, gevonden bij het nalopen van "waar staat er nog
een slot dat niemand hoeft te gehoorzamen":

- **`pidlane-uitgebreid.js`** claimde de bus en negeerde de uitslag: bij
  `tok = 0` zond hij gewoon door een lopende sweep heen. Erger nog stond
  `_gedraaid = true` vóór de claim, en de probe draait maar één keer — één
  ongelukkig getimede probe boekte de hele uitgebreide PID-set voorgoed als
  "geen antwoord". Nu: bezet → overslaan, en `_gedraaid` pas zetten als er
  echt gemeten wordt.
- **`PLBus.claim()`** (`pidlane-data.js`) had een legacy-uitgang voor een
  verweesde `window._pollBusy`. Zonder eigenaar greep de `MAX_HOLD_MS`-noodrem
  daar niet — de bus kon dus permanent dichtstaan, precies in het geval
  waarvoor die noodrem bestaat. Nu `LEGACY_MAX_MS` (10 s), met het moment van
  signaleren als startpunt. Test: `test-busslot.js`.
- **De ATDPN-mismatchtak in `initELM327`** zette de fix uit het
  protocolgeheugen terug: week het bevestigde protocol af, dan stuurde hij
  `ATSP0` en klaar — terwijl het herverbindpad nooit doorgaat naar
  `scanNetworks()`. Adapter bleef in zoekmodus, `SEARCHING...` per commando
  (8,8 min over 101 commando's in het log van 04-08), en `pl_proto_id` bleef
  staan zodat de volgende reconnect hetzelfde foute protocol probeerde. Nu
  maakt die tak de detectie zelf af (`0100` + `ATDPN`), onthoudt het resultaat
  en werkt óók `selectedNetwork.id` bij — `_bekendProtocolId()` geeft die
  namelijk voorrang boven localStorage.
- **`_btGen`** werd alleen in de SPP-tak van `_sendBTOnce` gecontroleerd. In de
  BLE-, Web-BT- en Web-Serial-takken kon een commando uit de vorige sessie de
  buffer van de nieuwe leeglezen. Nu in alle vier.

### Opgelost op 31-07-2026

Voor de historie, zodat je niet opnieuw op zoek gaat:

- 7 dubbele DTC-sleutels (P0011, P0012, P0016, P0128, P0340, P0401, P0420).
  `DTCDB` was één objectliteraal met eerst een generieke en daarna merksecties;
  de laatste won, dus een Mazda kreeg bij P0128 de BMW-tekst. Nu gesplitst in
  `DTCDB` (generiek) plus `DTC_MERK` (zes merkbuckets), met een merkbewuste
  `dtcInfo()`. Zie §14.

- AI-calls werden serverzijdig niet afgerekend — nu wel, op echt verbruik (§8).
- Serversaldo ging verloren na herladen; `finishLogin` haalt het nu op.
- `fireAlert()` bestond nergens: elke waarschuwing van de caravancoach gooide
  een ReferenceError en brak de tick af.
- `/credits/redeem`: kapotte compare-and-set én een ongeldige datum in een
  dateTime-veld. Nu een DO-slot en een geldige ISO-tijd.
- Vervalcontrole activatiecodes brak op een gewijzigd veldtype.
- `handleKlantLogin` valideerde het e-mailadres niet vóór de Airtable-lookup.
- `/klant/reset-aanvraag` verklapte via een mislukte mail of een account bestond.
- `/klant/saldo-muteer` verwijderd — de app boekt niet meer zelf af.
- `testApiKey()` deed bij elke app-start een billable call: 1 token per keer dat
  een klant de app opende. Draait nu niet meer voor klantaccounts.
- Kasboek `TokenLog` toegevoegd, zodat saldomutaties navolgbaar zijn.
- Ondersteuningsbitmaps (`0120`, `0140`, `0160`…) en de freeze frame-DTC stonden
  als aankruisbare "raw"-sensor in de keuzelijst.
- Fantoomsensoren (AdBlue, NOx, SCR) werden aangeboden en gepollt op een
  benzineauto; het filter draaide alleen bij het rapport.
- Het bolletje op een tegel was groen tenzij een drempel werd overschreden, dus
  ook bij een sensor die nooit een waarde gaf.
- `applyG()` overschreef `className` en wiste daarmee `gc-manueel` bij de eerste
  meting.

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

- `index.html` is nu ~203 KB, waarvan 139 KB HTML-markup. Verdere winst is
  mogelijk door paneel-HTML naar templates te verplaatsen, maar dat is een
  aparte ronde.
- Build-changelog (42 KB) kan naar `CHANGELOG.md` → `index.html` ~157 KB.
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

