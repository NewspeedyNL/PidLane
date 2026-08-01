# PIDLANE.md — architectuurkaart

> Doel van dit bestand: Claude (of een nieuwe medewerker) moet hiermee weten
> **welk bestand je nodig hebt** zonder de code te lezen. Zet dit in de
> project-kennisbank. Bij elke structuurwijziging bijwerken.
>
> Laatst bijgewerkt: 2026-08-01, na ronde 5 van de PID-gate (herijking).
> Daarvóór: 2026-07-31, serverzijdige tegoedafrekening.

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
| 3 | `pidlane-data.js` | 100 | statische referentiedata: 148 J1979-PID-definities, `DTCDB` (generiek) + `DTC_MERK` (merkbuckets) + `merkGroep()`, kennisbank, analysesets |
| 4 | `pidlane-assets.js` | 205 | ingebedde media (base64), o.a. `BANDEN_IMG` |

### Fase 2 — kern (in `<body>`, rond regel 2128)

| # | Module | KB | Doet |
|---|---|---|---|
| 5 | `pidlane-auth.js` | 57 | login, HMAC-sessietokens, adminpaneel, gebruikersbeheer, API-sleutelbeheer, **`pidGate()` + `herijkPidGate()` + `vehiclePlausiblePid()` + `getPidDef()`** (zie §15 — die PID-logica hoort hier eigenlijk niet, verplaatsen is een eigen ronde) |
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

Bijgewerkt 31-07-2026.

1. **Restjes.** `rebuildPidDefsCache()` bestaat niet (wel geguard);
   15 id's worden opgevraagd die nergens bestaan (`userLabel`, `apiPill`,
   `themeBtn`, `statusPill`, `cbtn`, `plEvalBtn`…); `logout()` wist de
   `pl_credits_*`-sleutels niet, dus een volgende klant op hetzelfde apparaat
   ziet even het saldo van de vorige (de eerste `verversSaldo()` corrigeert het); een gebruikersnaam mét `@` kan de
   Users-route nooit meer bereiken (klantlogin geeft 401 en `doLogin` stopt daar
   hard); de Tikkie-links staan hardcoded in een publieke repo.

2. **Geen herijking van de bronlijst.** `discoveredPIDDefs` wordt gebouwd
   tijdens de gezondheidsscan, wanneer het brandstoftype meestal nog onbekend
   is. Komt RDW later met "benzine", dan haalt `purgeImplausiblePids()` de
   AdBlue-tegel wel uit `activePIDs`, maar de bronlijst wordt niet herbouwd —
   dus de sensor staat nog gewoon in de keuzelijst. De gate is geen zuivere
   functie van de PID maar van (PID, huidige kennis); de bronlijst heeft dus
   invalidatie nodig. Ronde 5 in §15.

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

**Let op — openstaande kopie.** `applyVehiclePIDPreset()` in
`pidlane-rijsituatie.js` heeft nog een eigen, hardcoded merkgroepering
(`BMW||MINI`, `VOLKSWAGEN||AUDI||SKODA||SEAT`, `TOYOTA||LEXUS`). Dat is
dezelfde beslissing op een tweede plek en hoort naar `merkGroep()`. Bewust niet
in dezelfde ronde gedaan; dat is een mechanische wijziging en die gaat apart.

---

## 15. De PID-gate — één ladder, elf aanroepplekken

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

`pidGate(pid, niveau, opt)` in `pidlane-auth.js`. Elke trede bevat de vorige,
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
| `isReportableSensor` | auth | `meetbaar` |
| `buildPIDList` (dim) | rijsituatie | `kiesbaar` — vraagt de gate, toont tóch |
| `herijkPidGate` | auth | `plausibel` |

### Herijking — wanneer de gate opnieuw wordt gesteld

`pidGate()` is geen zuivere functie van de PID, maar van (PID, huidige kennis).
Die kennis druppelt binnen: brandstoftype pas als RDW antwoordt, turbo pas na
genoeg belaste MAP-metingen, uitlaat-fantomen pas als de motor warm is. De
bronlijst werd één keer gebouwd — tijdens `initialHealthScan()`, toen er nog
bijna niets bekend was — en daarna nooit meer.

`herijkPidGate(reden)` in `pidlane-auth.js` herbouwt **eerst** de bronlijst en
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

### Turbo-detectie — waarom belasting meetelt en aantal niet

`_isNaturallyAspirated()` besliste op `_mapSamples >= 8`: acht MAP-metingen,
piek onder 106 kPa, dus geen turbo. Dat klopte niet. Een auto die stationair
draait heeft een MAP van 30–40 kPa, turbo of niet. Acht metingen is een paar
seconden stilstaan.

Dat het nooit misging kwam door een tweede fout: `_noteMap()` werd alleen
aangeroepen vanuit `purgeImplausiblePids()` zelf, en die draaide twee keer per
sessie. `_mapSamples` kwam dus nooit boven de 8 en de hele turbo-detectie was
dode code.

Nu telt `_noteMap()` alleen als **bewijs** wanneer de motor belast wordt
(toerental > 1200 én belasting ≥ 60% of gasklep ≥ 50%), met een drempel van 12
zulke metingen. De piek wordt wél altijd bijgehouden. De aanroep zit in
`updPID()` en staat op `pid === '010B'` — anders telt dezelfde meting één keer
per PID in de pollronde mee.

Te weinig bewijs → geen oordeel → geen filter. Liever een boost-tegel te veel op
een atmosferische motor dan een ontbrekende tegel op een turbo.

### Wat bewust búiten de gate blijft

`buildPIDList()` en `pidTegelLeeg()` tonen juist wél wat de gate afkeurt —
uitgegrijsd, met "Toon alles" ernaast. **Weergave is niet de gate.** Zonder deze
regel past de volgende opruimronde de gate daar behulpzaam ook toe en verdwijnt
het grijs, dat precies de derde stand uit §12 is.

### Waar de ladder vandaan komt

Niet verzonnen. SAE J1939 codeert dezelfde standen in de byte zelf: 0xFF =
parameter niet beschikbaar, 0xFE = fout, geldig tot 0xFA. J1939-71 beveelt
bovendien aan om na inschakelen alle beschikbaarheidsbits op "niet beschikbaar"
te zetten en met standaardwaarden te werken tot er geldige data binnenkomt.
J1979 (waar wij op zitten) heeft dat niet, dus reconstrueren we het door te
meten. Twee gevolgen:

- **Health hoort niet in de bronlijst.** Beschikbaarheid is herzienbaar,
  capaciteit niet.
- **`nodata` uit één read is dun bewijs** en moet bij herijking opnieuw
  getoetst kunnen worden.

`python-OBD` bevestigt de bronlijst-aanpak en levert het model voor de
noodklep: alles buiten `supported_commands` is standaard "niet ondersteund", en
je komt er alleen langs met een expliciete `force`. Onze `_showAllPIDs` is dat,
maar zit nu op de weergavelaag — vandaar `opt.force` als toekomstige
gate-parameter in plaats van een tweede omweg.

Ter contrast: Torque Pro heeft geen plausibiliteitsfilter en laat de afweging
(NOx-PID op benzine of diesel) aan de gebruiker. Dat is precies het gedrag dat
we in §12 hebben weggehaald.

### Rondes

Mechanisch en inhoudelijk strikt gescheiden, één afwijking per commit.

| Ronde | Wat | Zichtbaar effect |
|---|---|---|
| 1 ✅ | `pidGate()` erbij, tien plekken erdoorheen | geen (drie aanscherpingen op onbereikbare toestanden) |
| 2 ✅ | `healthStreng` weg | `twijfel` selecteerbaar, `nodata` niet meer via de categorieknop |
| 3 ✅ | `ruwToegestaan` weg | geen naamloze raw-PIDs meer richting de AI |
| 4 ✅ | `force` doorgegeven aan `selectCategoryPIDs` en `buildPIDList` | "Toon alles" werkt ook op `+ Alles`; `dim` komt uit de gate |
| 5a-1 ✅ | turbo-criterium herzien: belast bewijs i.p.v. aantal metingen | geen — `_noteMap()` hing nog in de purge, teller haalde de drempel niet |
| 5a-2 ✅ | `_noteMap()` naar `updPID()` | turbo-detectie gaat leven; boost-PIDs verdwijnen op een bewezen atmosferische motor |
| 5b ✅ | `purgeImplausiblePids()` → `herijkPidGate()`, stempel + tick, `nodata` herzienbaar | fantoom verdwijnt óók uit de keuzelijst; een PID die alsnog data levert komt terug |

De splitsing van ronde 5 in drie stappen was geen planning maar noodzaak.
5a-2 alléén zou een echte bug hebben geïntroduceerd: een turbomotor die een
minuut stationair draait, verliest onder het oude criterium zijn boost-tegels.
Daarom eerst het criterium herzien (5a-1, aantoonbaar gedragsneutraal zolang de
teller de drempel niet haalt) en pas daarna de meting verplaatsen.

**Twee tests, twee vragen.**

`test-pidgate.js` (repo-root) toetst of de gate het juiste **antwoord** geeft:
1600 toestanden × 11 aanroepplekken, met per plek een `verwacht`-predicaat dat
vastlegt wanneer een verschil met het gedrag van vóór de gate BEDOELD is. Alles
daarbuiten is een regressie en de test eindigt met exit 1. Werkwijze per ronde:
wijzig de gate, draai de test, werk precies één `verwacht` bij. Moet je er twee
bijwerken, dan heeft je wijziging meer geraakt dan de bedoeling was.

`test-herijking.js` (repo-root) toetst of de gate op het juiste **moment** wordt
gesteld — een andere vraag, die de eerste test niet kan stellen. Acht scenario's
op een tijdlijn: bronlijst bouwen bij onbekende brandstof, kennis laten
binnendruppelen, en controleren dat de lijst meebeweegt. Inclusief de
turbo-gevallen (stationair bewijst niets, belast wel) en de eis dat 200 metingen
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

**De pleister in `renderGauges()` kan nog niet weg.** Het plan was dat na de
herijking geen implausibele PID meer in `activePIDs` kón zitten, waarmee de
laatste zeef overbodig werd. Dat klopt niet: drie toevoegpaden schrijven
ongefilterd in `activePIDs` en kunnen dat ná een herijking doen.

| Plek | Wat |
|---|---|
| `pidlane-diagnose.js` | focus-PIDs uit Smart Diagnose |
| `pidlane-remote.js` | actieve selectie uit een remote-sessie |
| `pidlane-pids.js` (toggle) | handmatige klik, bereikbaar via "Toon alles" |

Die drie door `pidGate()` laten lopen is een eigen ronde. Pas daarna is de
regel in `renderGauges()` echt overbodig. Tot dan is het geen pleister maar de
laatste zeef, en dat staat er nu ook zo bij.

**`pidCnt` telt twee dingen.** Het label in `index.html` zegt "Beschikbare
PIDs", maar zeven van de negen schrijvers zetten er `activePIDs.size` in (het
aantal *geselecteerde*) en twee `discoveredPIDDefs.length`. `herijkPidGate()`
houdt de meerderheidskeuze aan. Opruimen is cosmetisch en hoort bij §11.

**`pidGate()` staat in `pidlane-auth.js`** omdat `vehiclePlausiblePid()` en
`getPidDef()` daar al stonden. Volgens §4 is dat de login/adminmodule.
Verplaatsen naar een eigen module is een mechanische ronde en hoort niet in de
opruimrondes hierboven gemengd te worden. Inmiddels staat er ook
`herijkPidGate()`, `plHerijkTick()` en de stempel bij — de module is er niet
kleiner op geworden.
