# PIDLANE.md — architectuurkaart

> Doel van dit bestand: Claude (of een nieuwe medewerker) moet hiermee weten
> **welk bestand je nodig hebt** zonder de code te lezen. Zet dit in de
> project-kennisbank. Bij elke structuurwijziging bijwerken.
>
> Laatst bijgewerkt: 2026-07-28, na de opsplitsronde van `index.html`.

---

## 1. Wat is PidLane

Nederlandstalige B2B-webapp voor OBD2-voertuigdiagnose met AI-rapportage.
Doelgroep: garagehouders, autobedrijven, dealers en wagenparkbeheerders.
Solo-project, naast een baan — onderhoudslast is een harde ontwerprandvoorwaarde.

**Testvoertuigen:** Mazda CX-5 2.0 SkyActiv-G 2018 (CAN, benzine), Renault Clio 2007.
**Adapters:** OBDLink MX+ (STN-chipset, Bluetooth Classic SPP, 115200 baud) voor
garagegebruik; Vgate iCar Pro BT 3.0 voor consumenten.

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

---

## 3. Bestandsstructuur

```
PidLane/
├─ worker.js               (68 KB)  Cloudflare Worker: auth, proxy, Airtable, DO
├─ wrangler.toml                    assets + R2 + DO-bindings
├─ capacitor.config.json            webDir "www", server.url app.pidlane.nl
├─ .github/workflows/build-apk.yml  APK-build
└─ public/
   ├─ index.html           (202 KB) HTML-structuur + bootstrap + script-tags
   ├─ admin.html           (33 KB)  admin- en gebruikersbeheerpaneel
   ├─ config.js            (3 KB)   PROXY_URL, AIRTABLE_URL, APP_VERSION
   ├─ pidlane.css          (157 KB) hoofdstylesheet
   └─ pidlane-*.js         (37 modules, zie §4)
```

`index.html` was 735 KB en is op 2026-07-28 opgesplitst naar 202 KB.
Daarvan is ~139 KB echte HTML-markup, ~42 KB build-changelog in commentaar,
~11 KB inline CSS en ~8,5 KB inline bootstrap-JS.

---

## 4. Modules — laadvolgorde en verantwoordelijkheid

> **De volgorde is functioneel, niet cosmetisch.** Zie §5.

### Fase 1 — data en assets (in `<head>`)

| # | Module | KB | Doet |
|---|---|---|---|
| 1 | `capacitor.js` | — | alleen in APK aanwezig; `onerror` vangt het web-geval af |
| 2 | `config.js` | 3 | `PROXY_URL`, `AIRTABLE_URL`, `APP_VERSION`, repo-info |
| 3 | `pidlane-data.js` | 102 | statische referentiedata: 148 J1979-PID-definities, DTC-tabel, kennisbank, analysesets |
| 4 | `pidlane-assets.js` | 205 | ingebedde media (base64), o.a. `BANDEN_IMG` |

### Fase 2 — kern (in `<body>`, rond regel 2128)

| # | Module | KB | Doet |
|---|---|---|---|
| 5 | `pidlane-auth.js` | 54 | login, HMAC-sessietokens, adminpaneel, gebruikersbeheer, API-sleutelbeheer |
| 6 | `pidlane-veldlab.js` | 49 | meetsessieregistratie → Referentie-store (`PidLaneEvalLog`) |
| 7 | `pidlane-datalog.js` | 28 | datalog, `validateAndSmooth`, outlierdetectie, stabiliteit, protocolkeuze |
| 8 | `pidlane-archief.js` | 25 | sessierapportarchief, AI-rapporthook, TXT/PDF-export |
| 9 | `pidlane-pids.js` | 29 | PID-paneel, gauges, breedband-lambdacorrectie B1S1 |
| 10 | `pidlane-correlatie.js` | 3 | deterministische PID-correlatie-engine |
| 11 | `pidlane-totalcheck.js` | 51 | Total Check — volledige voertuigdoorlichting |
| 12 | `pidlane-diagnose.js` | 20 | Smart Diagnose + klacht-gestuurde PID-focus |
| 13 | `pidlane-graph.js` | 14 | multi-line groepstrends, DTC-scanstatus |
| 14 | `pidlane-fuel.js` | 72 | brandstofanalyse, AI-rapportgeneratie, modelkeuze/kosten |
| 15 | `pidlane-btflow.js` | 42 | Bluetooth-verbindingsflow (multi-step) + diagnostieklog |
| 16 | `pidlane-bt.js` | 84 | **transportlaag**: BLE, SPP, Web Serial, batch-polling, protocolinit |
| 17 | `pidlane-voertuigdata.js` | 15 | voertuigdata-merge: VIN-WMI + NHTSA + RDW |
| 18 | `pidlane-rijsituatie.js` | 44 | rijsituatie/bijzonderheden — context voor de AI |
| 19 | `pidlane-copiloot.js` | 9 | in-app ontwikkelassistent (admin-only), praat met `/copilot` |
| 20 | `pidlane-diagbundel.js` | 17 | diagnosebundel: ruwe TX/RX mét parser-uitkomst |
| 21 | `pidlane-plload.js` | 22 | `PLLoad` — automatische busbelastingsregeling (AIMD) |
| 22 | `pidlane-busdiag.js` | 11 | busdiagnose: live responstijden en busgedrag |
| 23 | `pidlane-demo.js` | 11 | demomodus met gesimuleerde data |
| 24 | `pidlane-uihelpers.js` | 18 | kebabmenu, overlays, toasts, topbalkstatus |
| 25 | `pidlane-scheduler.js` | 26 | motortype-splitsing poll-scheduler |
| 26 | `pidlane-theme.js` | 14 | thema, lettertype, zoom |
| 27 | `pidlane-neon.js` | 12 | neon dashboard — ronde meters |
| 28 | `pidlane-rit.js` | 29 | ritanalyse |
| 29 | `pidlane-koopcheck.js` | 133 | koopcheck / aankoopkeuring, proefritmodule |
| 30 | `pidlane-dossier.js` | 7 | export voertuigdossier |

### Fase 3 — onderaan de body (regel ~2291)

| # | Module | KB | Doet |
|---|---|---|---|
| 31 | `pidlane-remote.js` | 50 | `PLRemote` — remote-expertsessies, Durable Object, WebSocket-fanout, QR-pairing, vstate |
| 32 | `pidlane-caravan.js` | 30 | caravan-rittracker, live brandstofcoach, 10 coachregels met cooldowns |
| 33 | `pidlane-wizard.js` | 22 | `PLWizard` — vragenboom → meetplan → modules |
| 34 | `pidlane-onderdeel.js` | 24 | `PLOnderdeel` — DTC + live data → verdacht component |
| 35 | `pidlane-verify.js` | 13 | `PLVerify` — Laag C, focusverificatie (claimt bus via `window._pollBusy`) |
| 36 | `pidlane-monitor.js` | 18 | `PLMon` — Laag A, passieve foutoogst (mode 0101/07/03/0A/02) |
| 37 | `pidlane-watchers.js` | 20 | `PLWatch` — Laag B, ruwe-signaalwatchers op `pidHist` |

---

## 5. Waarom de volgorde vastligt

- **Alle modules zijn classic scripts.** Geen `type="module"`, geen IIFE-wrapper.
  In `index.html` staan **273 inline `on*=`-handlers** die functies in de globale
  scope opzoeken. Een module of IIFE breekt die allemaal in één klap.
- Top-level `function` → globaal. Top-level `const`/`let` → gedeelde globale
  lexicale scope, zichtbaar voor élk later script. Gecontroleerd: **0 dubbele
  top-level declaraties** over alle modules.
- `pidlane-data.js` en `pidlane-assets.js` moeten vóór alles, want ze leveren
  definitietijd-constanten.
- `pidlane-verify.js` vóór `pidlane-monitor.js` vóór `pidlane-watchers.js`:
  PLMon roept PLVerify aan, PLWatch routeert events via `PLMon._event`.
- `pidlane-caravan.js` vóór `pidlane-monitor.js`.
- `BLE_CHANNELS` staat bewust nog in `index.html`: definitietijd-referentie op
  `BLE_SERVICE2`.

**Bij het toevoegen van een script-tag: check of de module iets gebruikt dat
op definitietijd (niet in een functie) moet bestaan.** Zo niet, dan is de
positie vrij.

---

## 6. Backend — worker.js

Endpoints (uit `run_worker_first`):

| Route | Doet |
|---|---|
| `/auth/login` | valideert tegen `USERS_JSON`-secret, geeft HMAC-token (12u) |
| `/v1/messages` | Anthropic-proxy via AI Gateway |
| `/copilot` | in-app ontwikkelassistent |
| `/airtable/log`, `/airtable/veldlab`, `/airtable/reference` | Airtable-opslag |
| `/session/create,connect,state,telemetry,close` | remote-sessies (Durable Object) |
| `/pair/create,claim,poll` + `/code/create,resolve` | QR-pairing, 10-cijferige sessiecodes |
| `/proxy` | generieke uitgaande proxy (RDW/NHTSA) |
| `/admin/users` | gebruikersbeheer |
| `/download/*`, `/version.json` | APK uit R2 |
| `/health` | statuscheck |

**Secrets** (nooit in de repo): `AIRTABLE_TOKEN`, `ADMIN_TOKEN`,
`SESSION_SECRET`, `USERS_JSON`, `ANTHROPIC_API_KEY`.

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

Tabellen: Referentie `tblkfxKcjR6gf0Ahe`, Sessies `tblwbyWN1L6AKwgoy`.

**Referentie-pipeline:** elke echte adapterverbinding wordt automatisch een
meetsessie. PID-kwaliteit wordt geclassificeerd als `ok` / `unsupported` /
`expected_missing` / `implausible`. Schone surveys (≥2 onafhankelijke
bevestigingen per `merk|model|jaar|CALID`-cel) promoveren naar de
Referentie-store met p5/p50/p95-bereiken per PID.

---

## 8. AI-integratie

- Model: `claude-sonnet-4-6`. `thinking:{type:'disabled'}` is correct voor
  Sonnet; Haiku laat het veld weg.
- AI Gateway-route:
  `gateway.ai.cloudflare.com/v1/11390e49dd8b8cd940f262cc35c41b94/pid-lane/anthropic/v1/messages`
- Tokenkosten per model via `_modelPriceEur()`. Prijswijziging staat gepland
  op 2026-09-01.
- Systeemprompt bevat **regel 7**: conditionele, rijsituatie-afhankelijke
  referentiebereiken. Zonder die context beoordeelt de AI een caravanrit als
  een zieke auto.
- AI-contextinjectie is gecentraliseerd in `apiFetch`, met deduplicatie.

---

## 9. Werkafspraken

- **Nederlandstalige codebase.** Commentaar, changelogs, UI-teksten: Nederlands.
- **Complete, gevalideerde bestanden** — nooit patch-blokken in de chat.
  Sinds de opsplitsing: complete *module*bestanden, niet complete `index.html`.
- Vóór elke oplevering: `node --check` op elk JS-bestand + div-balanscontrole.
- Build-changelog bovenaan `index.html` (HTML-commentaar).
- `str_replace` voor chirurgische bewerkingen, met uniciteitscontrole.

### Zuinig omgaan met context

Deel **alleen de module waar je aan werkt**. De hele repo als zip kost
~500 K tokens; één module kost er 5–20 K. Weet je niet welke module?
Zoek in de tabel in §4 — daar staat dit bestand voor.

---

## 10. Openstaande UI-taken

1. Rit-monitorpaneel minimaliseerbaar maken met zwevende statuschip
2. Veldlab uit de UI halen, achtergrondlogging behouden
3. Auto-update/versiecheck verwijderen
4. Overbodig menu-item "Achtergrond monitor" verwijderen

## 11. Vervolgstappen na de opsplitsing

- `index.html` is nu 202 KB, waarvan 139 KB HTML-markup. Verdere winst is
  mogelijk door paneel-HTML naar templates te verplaatsen, maar dat is een
  aparte ronde.
- Build-changelog (42 KB) kan naar `CHANGELOG.md` → `index.html` ~157 KB.
- Per module opschonen kan nu goedkoop, één module tegelijk.
