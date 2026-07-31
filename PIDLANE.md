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

1. **7 dubbele DTC-sleutels in `pidlane-data.js`** — P0401, P0420, P0340, P0016,
   P0012, P0011, P0128. `DTCDB` is één objectliteraal met eerst een generieke
   sectie en daarna merksecties; de laatste wint, dus een Mazda krijgt bij P0128
   de BMW/Mini-tekst en bij P0420 de VAG-tekst. Gaat via `dtcInfo()` ook de
   AI-prompt in (`pidlane-scheduler.js:120`). Vraagt een keuze: merktekst
   samenvoegen in de generieke omschrijving, of `DTCDB` opsplitsen in een
   generiek deel plus een merkdeel met een merkbewuste `dtcInfo()`.
2. **Restjes.** `rebuildPidDefsCache()` bestaat niet (wel geguard);
   15 id's worden opgevraagd die nergens bestaan (`userLabel`, `apiPill`,
   `themeBtn`, `statusPill`, `cbtn`, `plEvalBtn`…); `logout()` wist de
   `pl_credits_*`-sleutels niet, dus een volgende klant op hetzelfde apparaat
   ziet even het saldo van de vorige (de eerste `verversSaldo()` corrigeert het); een gebruikersnaam mét `@` kan de
   Users-route nooit meer bereiken (klantlogin geeft 401 en `doLogin` stopt daar
   hard); de Tikkie-links staan hardcoded in een publieke repo.

### Opgelost op 31-07-2026

Voor de historie, zodat je niet opnieuw op zoek gaat:

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

---

## 13. Vervolgstappen na de opsplitsing

- `index.html` is nu ~203 KB, waarvan 139 KB HTML-markup. Verdere winst is
  mogelijk door paneel-HTML naar templates te verplaatsen, maar dat is een
  aparte ronde.
- Build-changelog (42 KB) kan naar `CHANGELOG.md` → `index.html` ~157 KB.
- Per module opschonen kan nu goedkoop, één module tegelijk.
