# PIDLANE.md — architectuurkaart

> Doel van dit bestand: Claude (of een nieuwe medewerker) moet hiermee weten
> **welk bestand je nodig hebt** zonder de code te lezen. Zet dit in de
> project-kennisbank. Bij elke structuurwijziging bijwerken.
>
> Laatst bijgewerkt: 2026-07-31, na het serverzijdig maken van de
> tegoedafrekening. Daarvóór: 2026-07-28, opsplitsronde van `index.html`.

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
├─ worker.js               (117 KB) Cloudflare Worker: auth, proxy, Airtable, DO, tegoed
├─ wrangler.toml                    assets + R2 + DO-bindings
├─ capacitor.config.json            webDir "www", server.url app.pidlane.nl
├─ .github/workflows/build-apk.yml  APK-build
└─ public/
   ├─ index.html           (203 KB) HTML-structuur + bootstrap + script-tags
   ├─ admin.html           (44 KB)  admin-, gebruikers-, klant- en codebeheer
   ├─ config.js            (3 KB)   PROXY_URL, AIRTABLE_URL, APP_VERSION
   ├─ pidlane.css          (157 KB) hoofdstylesheet
   └─ pidlane-*.js         (37 modules, zie §4)
```

`index.html` was 735 KB en is op 2026-07-28 opgesplitst naar ~203 KB.
Daarvan is ~139 KB echte HTML-markup, ~42 KB build-changelog in commentaar,
~11 KB inline CSS en ~8,5 KB inline bootstrap-JS.

---

## 4. Modules — laadvolgorde en verantwoordelijkheid

> **De volgorde is functioneel, niet cosmetisch.** Zie §5.
> 39 script-tags: `capacitor.js`, `config.js` en 37 `pidlane-*.js`-modules.

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
| 5 | `pidlane-auth.js` | 56 | login, HMAC-sessietokens, adminpaneel, gebruikersbeheer, API-sleutelbeheer |
| 6 | `pidlane-veldlab.js` | 49 | meetsessieregistratie → Referentie-store (`PidLaneEvalLog`) |
| 7 | `pidlane-datalog.js` | 28 | datalog, `validateAndSmooth`, outlierdetectie, stabiliteit, protocolkeuze |
| 8 | `pidlane-archief.js` | 25 | sessierapportarchief, AI-rapporthook, TXT/PDF-export |
| 9 | `pidlane-pids.js` | 29 | PID-paneel, gauges, breedband-lambdacorrectie B1S1 |
| 10 | `pidlane-correlatie.js` | 3 | deterministische PID-correlatie-engine |
| 11 | `pidlane-totalcheck.js` | 51 | Total Check — volledige voertuigdoorlichting |
| 12 | `pidlane-diagnose.js` | 20 | Smart Diagnose + klacht-gestuurde PID-focus |
| 13 | `pidlane-graph.js` | 14 | multi-line groepstrends, DTC-scanstatus |
| 14 | `pidlane-fuel.js` | 74 | brandstofanalyse, `apiFetch` (alle AI-calls), modelkeuze/kosten |
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
| 25 | `pidlane-scheduler.js` | 26 | motortype-splitsing poll-scheduler, `autoExpertAsk`, `wizRdwLookup` |
| 26 | `pidlane-theme.js` | 14 | thema, lettertype, zoom, **sessieherstel bij boot** |
| 27 | `pidlane-neon.js` | 12 | neon dashboard — ronde meters |
| 28 | `pidlane-rit.js` | 29 | ritanalyse |
| 29 | `pidlane-koopcheck.js` | 133 | koopcheck / aankoopkeuring, proefritmodule |
| 30 | `pidlane-dossier.js` | 7 | export voertuigdossier |

### Fase 3 — onderaan de body (regel ~2291)

| # | Module | KB | Doet |
|---|---|---|---|
| 31 | `pidlane-remote.js` | 50 | `PLRemote` — remote-expertsessies, Durable Object, WebSocket-fanout, QR-pairing, vstate |
| 32 | `pidlane-caravan.js` | 30 | caravan-rittracker, live brandstofcoach, 10 coachregels met cooldowns |
| 33 | `pidlane-wizard.js` | 28 | `PLWizard` — vragenboom → meetplan → modules |
| 34 | `pidlane-onderdeel.js` | 24 | `PLOnderdeel` — DTC + live data → verdacht component |
| 35 | `pidlane-verify.js` | 13 | `PLVerify` — Laag C, focusverificatie (claimt bus via `window._pollBusy`) |
| 36 | `pidlane-monitor.js` | 18 | `PLMon` — Laag A, passieve foutoogst (mode 0101/07/03/0A/02) |
| 37 | `pidlane-credits.js` | 34 | `PLCredits` — kostenvenster vóór AI, saldoteller, activatiecode inwisselen |
| 38 | `pidlane-klant.js` | 30 | `PLKlant` — klantregistratie, klantlogin, wachtwoordherstel, "Mijn tokens" |
| 39 | `pidlane-watchers.js` | 20 | `PLWatch` — Laag B, ruwe-signaalwatchers op `pidHist` |

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
- `pidlane-verify.js` vóór `pidlane-monitor.js` vóór `pidlane-watchers.js`:
  PLMon roept PLVerify aan, PLWatch routeert events via `PLMon._event`.
- `pidlane-caravan.js` vóór `pidlane-monitor.js`.
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
| `/klant/saldo-muteer` | **ongebruikt sinds 31-07-2026** — de app boekt niet meer zelf af |
| `/credits/redeem` | activatiecode inwisselen (tabel `TokenCodes`) |
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
en in de Config-base `Users`, `Klanten` en `TokenCodes`.

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

---

## 8. AI-integratie

- Model: `claude-sonnet-4-6`. `thinking:{type:'disabled'}` is correct voor
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

**Bekende grens:** Airtable kent geen transacties. Twee gelijktijdige calls van
hetzelfde account (twee apparaten) kunnen elkaars afboeking overschrijven. Bij
normaal gebruik lopen calls achter elkaar. Wordt dit ooit een probleem, dan is
de Durable Object de plek om het saldo te serialiseren.

---

## 9. Werkafspraken

- **Nederlandstalige codebase.** Commentaar, changelogs, UI-teksten: Nederlands.
- **Complete, gevalideerde bestanden** — nooit patch-blokken in de chat.
  Sinds de opsplitsing: complete *module*bestanden, niet complete `index.html`.
  `worker.js` (117 KB) is inmiddels ook te groot voor de chat: lever die als
  downloadbaar bestand.
- Vóór elke oplevering: `node --check` op elk JS-bestand + div-balanscontrole.
  Bij geldcode ook een echte test met gestubte Airtable en Anthropic.
- Build-changelog bovenaan `index.html` (HTML-commentaar).
- `str_replace` voor chirurgische bewerkingen, met uniciteitscontrole.
- Mechanisch en inhoudelijk wijzigen nooit in dezelfde stap.

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

## 11. Bekende problemen — nog niet opgelost

Uit de codereview van 31-07-2026. Op volgorde van ernst.

1. **Race in `/credits/redeem`.** De compare-and-set vergelijkt
   `stempel.slice(0,19)`, en dat kapt juist het willekeurige deel eraf. Twee
   verzoeken binnen dezelfde seconde boeken allebei de credits bij. Vergelijk de
   volledige stempel. Let dan op het veldtype van `GebruiktOp`: die PATCH gaat
   zonder `typecast`, dus bij een datumveld faalt hij sowieso met 422.
2. **7 dubbele DTC-sleutels in `pidlane-data.js`** — P0401, P0420, P0340, P0016,
   P0012, P0011, P0128. De merksecties overschrijven de generieke, dus een Mazda
   krijgt bij P0128 "veel BMW/Mini". Die tekst gaat via `dtcInfo()` ook de
   AI-prompt in (`pidlane-scheduler.js:120`).
3. **`handleKlantLogin` valideert het e-mailadres niet** vóór `klantZoek()`. De
   `\'`-escaping die daar gebruikt wordt kent Airtable niet echt. Zet er een
   `klantEmailOk`-check voor en val door naar `misser()`.
4. **`/klant/reset-aanvraag` lekt of een account bestaat**: mislukte mail geeft
   502 mét detail, een onbekend adres altijd 200.
5. **Vervalcontrole activatiecodes** — `Date.parse(f.Vervalt + "T23:59:59Z")`
   breekt zodra dat veld ooit een tijd bevat; de controle valt dan stil weg.
6. **Restjes.** `rebuildPidDefsCache()` bestaat niet (wel geguard);
   15 id's worden opgevraagd die nergens bestaan (`userLabel`, `apiPill`,
   `themeBtn`, `statusPill`, `cbtn`, `plEvalBtn`…); `logout()` wist de
   `pl_credits_*`-sleutels niet; een gebruikersnaam mét `@` kan de Users-route
   nooit meer bereiken (klantlogin geeft 401 en `doLogin` stopt daar hard);
   `/klant/saldo-muteer` is ongebruikt en kan weg; de Tikkie-links staan
   hardcoded in een publieke repo.

## 12. Vervolgstappen na de opsplitsing

- `index.html` is nu ~203 KB, waarvan 139 KB HTML-markup. Verdere winst is
  mogelijk door paneel-HTML naar templates te verplaatsen, maar dat is een
  aparte ronde.
- Build-changelog (42 KB) kan naar `CHANGELOG.md` → `index.html` ~157 KB.
- Per module opschonen kan nu goedkoop, één module tegelijk.
