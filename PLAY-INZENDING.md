# PLAY-INZENDING.md — alle tekst die de Play Console vraagt

Opgesteld 03-09-2026, bijgewerkt 10-09-2026 (§7, §16 en de taalkeuze). Dit bestand is
**kopieerwerk**: elk kopje hieronder is
een veld in de Play Console, en wat eronder staat gaat er letterlijk in.

Waarom dit een eigen bestand is en niet in `ANDROID-PLAYSTORE.md` staat: dat
document legt uit *wat er tussen jou en een goedkeuring staat* — de blokkades,
de redenering, wat er misging. Dit document is de **uitkomst**: de tekst zelf.
Twee verschillende vragen, en ze lopen anders uit de pas als ze in één bestand
staan.

> **De inzending is nl-NL only — besluit 10-09-2026 (#177).** Elk veld
> hieronder staat er één keer in, in het Nederlands. Dat is geen slordigheid
> maar de goedkoopste kant van een keuze: §3 is 3102 tekens en zou vertaald
> moeten worden, terwijl §15 Countries toch al op Nederland zet omdat de
> RDW-kentekenfunctie regiogebonden is. Tot vandaag hadden §2 en §14 wél een
> en-US-blok en §3 niet — zet je in de Console een tweede taal aan, dan krijgt
> een reviewer een Engelse regel onder de titel en Engelse release notes met
> een Nederlandse volledige beschrijving eronder, uitgerekend het veld waar de
> "minimum functionality"-toets op leunt. **Zet er dus geen tweede taal bij
> zonder §3 mee te vertalen**; `test-playteksten.js` telt de blokken van §1,
> §2, §3 en §14 en wordt rood zodra ze niet meer gelijk lopen.
>
> **De regel die alles bij elkaar houdt.** Vier plekken vertellen hetzelfde
> verhaal: deze teksten, `public/privacy.html`, `public/verwijderen.html` en
> het disclosurescherm in `public/pidlane-privacy.js`. Wijkt er één af, dan is
> dat precies wat een reviewer opmerkt — en het kost een ronde van weken.
> Verandert er iets aan de verwerking, dan verandert het op alle vier.

---

## 0. Wat waar hoort — het overzicht

| Play Console | veld | hieronder |
|---|---|---|
| Store listing | App name | §1 |
| Store listing | Short description | §2 |
| Store listing | Full description | §3 |
| Store listing | App icon, feature graphic, screenshots | §4 |
| Store settings | Category, tags, contactgegevens | §5 |
| App content → Privacy policy | URL | §6 |
| App content → App access | reviewnotitie + testaccount | §7 |
| App content → Ads | §8 |
| App content → Content ratings | vragenlijst | §9 |
| App content → Target audience | §10 |
| App content → Data safety | veld voor veld | §11 |
| App content → Data deletion | URL | §12 |
| App content → overige verklaringen | §13 |
| Release → Release notes | §14 |
| Testing → Closed testing | §15 |

Afvinklijst vóór de knop: §16.

---

## 1. App name

Maximaal 30 tekens.

```
PidLane — OBD2 autodiagnose
```

De koppelverklaring is bewust: "PidLane" alleen zegt een zoeker niets, en
"OBD2" is de term waarop deze app gezocht wordt. Zet er géén woorden als
"gratis", "beste" of "#1" in — dat is een afwijzingsgrond op zichzelf.

---

## 2. Short description

Maximaal 80 tekens. Dit is de regel onder de titel in de zoekresultaten en
het is de enige tekst die iedereen leest.

```
Lees je auto uit via een OBD2-adapter en krijg een diagnose in gewone taal.
```

---

## 3. Full description

Maximaal 4000 tekens. De eerste alinea doet het werk tegen de
"minimum functionality"-toets: hij moet meteen duidelijk maken dat er
hardware aan te pas komt die een browser niet kan aansturen.

```
PidLane maakt via Bluetooth verbinding met een OBD2-adapter in de
diagnosepoort van je auto en leest daar rechtstreeks de boordcomputer mee
uit. Geen omweg, geen handmatige invoer: de app praat met de ECU van het
voertuig en toont wat er werkelijk gemeten wordt.

Gemaakt voor monteurs, occasionhandelaren en wagenparkbeheerders — en
bruikbaar voor iedereen die wil weten wat dat lampje op zijn dashboard
betekent.

WAT PIDLANE DOET

• Foutcodes uitlezen — actuele, permanente en pending codes, plus de
  freeze frame: de momentopname van wat de auto deed toen de fout ontstond.
• Live sensorwaarden — toerental, temperaturen, druk, brandstoftrims,
  lambdawaarden en meer, als meters of als grafiek over de tijd.
• Diagnoserapport — de meting wordt uitgelegd in gewone taal: wat is er aan
  de hand, hoe zeker is dat, en welk onderdeel is de eerste verdachte.
• Ritmonitor — laat de app tijdens het rijden meekijken. Hij let op
  sensoruitval, bevroren waarden en uitschieters, en test verdachte
  signalen daarna gericht opnieuw.
• Koopcheck — een vaste doorloop voor wie een tweedehands auto beoordeelt,
  inclusief de readiness-monitors die verraden of er kort geleden fouten
  zijn gewist.
• Onderdeelaanwijzer — koppelt foutcode en meting aan het onderdeel dat er
  waarschijnlijk achter zit.
• Diagnose op afstand — een expert kijkt mee via een sessiecode of QR, zonder
  zelf een adapter nodig te hebben.
• Kenteken invullen (Nederland) — haalt merk, model en bouwjaar op bij de
  open data van de RDW.
• Rapporten opslaan en delen als PDF.

WAT JE NODIG HEBT

Een OBD2-adapter met Bluetooth. Getest met de OBDLink MX+ en de Vgate iCar
Pro BT 3.0; andere ELM327-adapters werken meestal ook. Vrijwel elke
personenauto vanaf bouwjaar 2001 (benzine) of 2004 (diesel) heeft een
OBD2-poort.

Zonder adapter kun je de app toch bekijken: er zit een demomodus in met
opgenomen meetdata van een echte auto. Geen account nodig.

OVER DE AI-ANALYSE

Het diagnoserapport wordt geschreven door een taalmodel. Daarvoor heb je een
account en tegoed nodig; vóór elke analyse zie je precies wat hij kost. De
rest van de app — uitlezen, meten, grafieken, foutcodes opzoeken — werkt
zonder tegoed.

Een rapport is een hulpmiddel, geen uitspraak van een monteur. Het vervangt
geen inspectie en geen APK.

PRIVACY

PidLane vraagt toegang tot Bluetooth om de adapter te vinden en ermee te
praten — meer niet. De scanpermissie is aangevraagd met de markering
neverForLocation: de app bepaalt je locatie niet en slaat hem niet op.

Metingen staan op je toestel. Vraag je een analyse, dan gaan de meetwaarden
en voertuiggegevens naar onze server en naar de aanbieder van het taalmodel.
Je naam, e-mailadres en kenteken gaan daar niet mee. Deel je meetdata voor
referentiewaarden, dan gaat je chassisnummer niet mee maar een daaruit
berekende code — dat is pseudonimisering, geen anonimisering, en we
behandelen die gegevens dan ook als persoonsgegevens.

Je account verwijder je zelf in de app, of via app.pidlane.nl/verwijderen.html.

De volledige privacyverklaring: app.pidlane.nl/privacy.html
Vragen: info@pidlane.nl
```

---

## 4. Grafisch materiaal

| wat | eis | stand |
|---|---|---|
| App icon | 512×512 PNG, 32-bit, geen transparantie | `icon-512.png` staat in de repo |
| Feature graphic | 1024×500 PNG/JPG, **verplicht** | zie §16c — staat niet in de repo |
| Telefoonschermen | 2 t/m 8, 16:9 of 9:16, korte zijde 320–3840 px | zie §16c — staan niet in de repo |
| Tabletschermen | optioneel | overslaan |

> **Deze drie zijn vanuit de repo niet te controleren.** Ze worden rechtstreeks
> in de Console geüpload en staan hier niet als bestand. Tot 10-09-2026 zei
> deze tabel "moet nog gemaakt" terwijl de afvinklijst ze al afgevinkt had —
> twee plekken die hetzelfde beweerden en uit de pas liepen. De stand staat nu
> op één plek: §16c.

### Feature graphic

Geen tekst die in de kleine weergave wegvalt. Werkende opzet: het logo links,
rechts een uitsnede van een gauge-scherm, donkere achtergrond (`#0D1117`,
dezelfde als de app). Eén regel tekst, hooguit: **"Diagnose uit je eigen
auto"**.

### Screenshots — schiet deze acht, in deze volgorde

De eerste twee zijn de enige die in de zoekresultaten worden getoond, dus daar
moet de kern in staan. Schiet ze in **demomodus** op een echt toestel: dan
staat er echte meetdata op en geen mockup, en dat is precies wat de
"minimum functionality"-toets wil zien.

| # | scherm | bijschrift (max ~40 tekens) |
|---|---|---|
| 1 | Live gauges met draaiende waarden | Live meetwaarden uit je eigen auto |
| 2 | Foutcodelijst met een uitgeklapte DTC | Foutcodes met uitleg, geen code |
| 3 | Diagnoserapport | Wat er aan de hand is, in gewone taal |
| 4 | Grafiek over de tijd | Zie het verloop, niet één moment |
| 5 | Verbindscherm met adapterlijst | Verbindt met je OBD2-adapter |
| 6 | Koopcheck | Weet wat je koopt |
| 7 | Ritmonitor tijdens een rit | Meekijken terwijl je rijdt |
| 8 | Onderdeelaanwijzer | Van foutcode naar onderdeel |

Zet **geen** verzonnen waarden in een screenshot en plak er geen randen of
telefoons omheen die suggereren dat het een ander toestel is. Een screenshot
die niet overeenkomt met de app is een afwijzingsgrond.

---

## 5. Store settings

| veld | waarde |
|---|---|
| App or game | App |
| Category | Auto & Vehicles |
| Tags | OBD2, Car Diagnostics, Vehicle Maintenance (max 5) |
| Email address | info@pidlane.nl |
| Website | https://pidlane.nl |
| Phone | leeg laten (optioneel, en een nummer dat je niet opneemt is erger dan geen nummer) |
| External marketing | uit — deze app doet geen marketing buiten Play om |

---

## 6. Privacy policy URL

```
https://app.pidlane.nl/privacy.html
```

Controleer vóór het inzenden dat die URL opent **in een private venster,
zonder ingelogd te zijn**. Hij wordt door `wrangler.toml` als statisch bestand
geserveerd en staat niet in `run_worker_first`, dus hij hoort publiek te zijn —
maar dat is een aanname tot je hem hebt aangeklikt.

---

## 7. App access

Dit is het belangrijkste veld van de hele inzending. Een reviewer heeft geen
auto, geen OBD2-adapter en geen account. Zonder uitleg krijgt hij een app die
blijft hangen op "verbinden", en dat leest als kapot in plaats van als
ontbrekende hardware.

Kies **"All or some functionality is restricted"** en vul twee regels in.

### Regel 1 — de demo

Instructions:

```
PidLane leest de boordcomputer van een auto uit via een OBD2-adapter in de
diagnosepoort. De hoofdfunctie vereist die hardware en een voertuig, en is
daarom niet volledig te beoordelen zonder beide.

Voor de review is er een demomodus die zonder adapter en zonder auto werkt.
Op het startscherm staat de knop "Try demo — no adapter needed", direct
onder de verbindknop. Daarna kies je een voorbeeldvoertuig (of vult een
Nederlands kenteken in) en draait de app op opgenomen meetdata: live
sensorwaarden, foutcodes, grafieken en het diagnoserapport.

Er is geen account nodig voor de demo.

De Bluetooth-permissie wordt uitsluitend gebruikt om de OBD2-adapter te
vinden en ermee te communiceren. De scanpermissie is aangevraagd met
neverForLocation; de app bepaalt geen locatie via Bluetooth. Vóór het eerste
verbinden toont de app hiervoor een aparte uitleg met een weigeroptie.

Vragen: info@pidlane.nl
```

### Regel 2 — een testaccount, en dit sla je niet over

De demo dekt het uitlezen, maar **niet** de AI-analyse: die loopt via de
server en vraagt een geldig sessietoken. Ziet een reviewer de kernfunctie uit
je storebeschrijving niet werken, dan is dat een afwijzing op "incomplete
access" — en die is volledig te voorkomen.

Maak vóór het inzenden een account aan met tegoed erop en vul het hier in.
Gebruik **niet** je eigen inlog: dat wachtwoord gaat naar Google.

| veld | waarde |
|---|---|
| Username | `demo@pidlane.nl` |
| Password | *staat alleen in het Console-veld — niet hier, zie de kader hieronder* |
| Any other instructions | zie hieronder |

Instructions:

```
Dit account heeft tegoed voor circa 10 AI-analyses.

Zo kom je bij de analyse: log in > "Try demo — no adapter needed" >
voorbeeldvoertuig kiezen > tabblad Diagnose > "Analyseer". Het rapport wordt
door een taalmodel geschreven en verschijnt na enkele seconden.

Het account bevat geen persoonsgegevens en is uitsluitend voor de review
aangemaakt.
```

> **Zet het wachtwoord nooit in deze repo — deze repository is PUBLIEK.**
> Een wachtwoord in een gecommit bestand staat binnen een minuut wereldwijd
> online, op een account waar tegoed op staat. Het hoort alleen in het
> Console-veld *App access*: dat gaat naar Google en verder nergens heen.
> Deze repo is de bron van de app, niet van de sleutels.
>
> `test-playteksten.js` bewaakt dit sinds 10-09-2026: staat er alsnog een
> wachtwoordregel in dit document, dan wordt CI rood vóór het gepusht is.

---

## 8. Ads

**Antwoord: No.** De app bevat geen advertenties.

Dat is te controleren en het klopt: er zit geen advertentie-SDK in
`package.json`, er wordt geen advertentie-id opgevraagd, en `privacy.html`
zegt het ook ("Geen advertenties en geen advertentie-identificatie").

---

## 9. Content rating — de IARC-vragenlijst

Categorie kiezen: **Utility, Productivity, Communication or Other**.

| vraag | antwoord |
|---|---|
| Geweld (elke vorm) | Nee |
| Seksualiteit, naaktheid | Nee |
| Grof taalgebruik | Nee |
| Drugs, alcohol, tabak | Nee |
| Gokken (echt geld of gesimuleerd) | Nee |
| Angstaanjagende of schokkende inhoud | Nee |
| Discriminatie of haat | Nee |
| Deelt de app de locatie van de gebruiker met anderen? | **Nee** |
| Staat de app gebruikers toe te communiceren of inhoud te delen? | **Ja** — de diagnose-op-afstand koppelt twee gebruikers via een sessiecode, en rapporten zijn te delen |
| Kunnen gebruikers digitale aankopen doen? | **Nee** — er staat geen koopknop in de app (zie #42) |
| Bevat de app door gebruikers gegenereerde inhoud die openbaar is? | Nee — een sessie is één-op-één en met een code |

Verwachte uitkomst: **PEGI 3 / Everyone**.

Antwoord "Ja" bij de communicatievraag ook echt met ja. Verzwijgen wat de
remote-sessie doet en het later ontdekt zien worden kost je de hele
classificatie opnieuw.

---

## 10. Target audience and content

| veld | antwoord |
|---|---|
| Doelgroep-leeftijden | **18 en ouder**, uitsluitend |
| Spreekt de app onbedoeld kinderen aan? | Nee |
| Is de app ontworpen voor kinderen? | Nee |

Waarom alleen 18+: dit is gereedschap voor monteurs en autobezitters. Zet je
er een leeftijdsgroep onder de 18 bij, dan val je onder het Families-beleid,
en dat brengt eisen mee (advertentiebeleid, aanvullende verklaringen) waar
deze app niets aan heeft. `privacy.html` zegt hetzelfde: niet gericht op
kinderen, geen bewuste verzameling onder de 16.

---

## 11. Data safety — veld voor veld

Dit is de vaakst genoemde afwijzingsgrond: een formulier dat afwijkt van wat
de app doet. Onderstaande antwoorden zijn nagelopen tegen de code
(`pidlane-veldlab.js`, `worker.js`, `pidlane-klant.js`) en tegen
`privacy.html`.

### Algemene vragen

| vraag | antwoord |
|---|---|
| Verzamelt of deelt je app de vereiste gebruikersgegevenstypen? | **Ja** |
| Worden alle verzamelde gegevens versleuteld verzonden? | **Ja** — alles gaat over HTTPS; `capacitor.config.json` zet `cleartext: false` |
| Bied je gebruikers een manier om verwijdering van hun gegevens te vragen? | **Ja** — in de app én via de URL in §12 |

> **Vink "Data is anonymized" NERGENS aan.** De VIN wordt
> gepseudonimiseerd, niet geanonimiseerd: het zout staat in clientcode, dus
> wie een VIN kent kan de code narekenen. Google's vragenlijst kent
> "anonymized" als expliciete keuze, en die is hier onjuist. `privacy.html`
> zegt in een eigen kader precies dit.

### Gegevenstypen — wat je aanvinkt

**Personal info → Email address**

| veld | antwoord |
|---|---|
| Verzameld | Ja |
| Gedeeld | Nee |
| Verplicht of optioneel | Verplicht (voor een account; de demo werkt zonder) |
| Doel | Account management |

**Personal info → User IDs**

| veld | antwoord |
|---|---|
| Verzameld | Ja |
| Gedeeld | Nee |
| Verplicht of optioneel | Verplicht |
| Doel | Account management, App functionality |

**Personal info → Other info** — voertuiggegevens: chassisnummer (als
pseudoniem), sensorwaarden, foutcodes

| veld | antwoord |
|---|---|
| Verzameld | Ja |
| **Gedeeld** | **Ja** — met de aanbieder van het taalmodel (Anthropic), die het rapport schrijft |
| Verplicht of optioneel | Optioneel — alleen als de gebruiker om een analyse vraagt of meetdata deelt |
| Doel | App functionality |

**App activity → Other user-generated content** — diagnoserapporten en
opgeslagen meetsessies

| veld | antwoord |
|---|---|
| Verzameld | Ja |
| Gedeeld | Nee |
| Verplicht of optioneel | Optioneel |
| Doel | App functionality |

### Wat je NIET aanvinkt, en waarom

| categorie | waarom niet |
|---|---|
| **Location** (precies of bij benadering) | De app leest geen positie. `pidlane-gps.js` is uit de repo, `ACCESS_FINE_LOCATION` staat op `maxSdkVersion=30` en is puur een Android 11-eis om te mógen scannen. `test-geen-gps.js` bewaakt dat. |
| Financial info | Geen betaling in de app |
| Health and fitness | — |
| Messages | De remote-sessie stuurt meetdata, geen berichten |
| Photos and videos | De camera scant een QR-code; er wordt geen beeld opgeslagen of verzonden |
| Audio files | — |
| Files and docs | Rapporten blijven op het toestel tot de gebruiker ze zelf deelt |
| Calendar, Contacts | — |
| Web browsing history | — |
| App info and performance → Crash logs / Diagnostics | Er gaat geen crashrapportage naar een dienst |
| **Device or other IDs** | Nagekeken: er gaat geen toestel-id mee. Het veldlab stuurt alleen de grofste soort (`telefoon` / `tablet` / `laptop`), en dat is geen identificatie. |

---

## 12. Data deletion

| veld | waarde |
|---|---|
| Kunnen gebruikers verwijdering aanvragen? | Ja |
| URL | `https://app.pidlane.nl/verwijderen.html` |
| Verwijdert de app het account zelf, of alleen gegevens? | **Beide** — account én bijbehorende gegevens |

Deze URL moet openen **zonder in te loggen en zonder de app** — dat is de hele
reden dat Google hem apart vraagt: iemand die de app al gewist heeft moet er
nog bij kunnen. `public/verwijderen.html` is daar precies voor gemaakt en
bevat bewust geen formulier: verwijderen vraagt een ingelogde sessie plus het
wachtwoord, en dat hoort in de app.

De termijn die je hier noemt (30 dagen) staat op één plek in de code:
`KLANT_BEWAARDAGEN` in `worker.js`. Verandert die, dan verandert deze regel
mee, plus `privacy.html` en `verwijderen.html`.

---

## 13. Overige verklaringen onder App content

| verklaring | antwoord |
|---|---|
| Government apps | Nee |
| Financial features | **Geen van toepassing** — geen lenen, geen beleggen, geen crypto, geen betaalverkeer in de app |
| Health apps | Nee |
| News app | Nee |
| COVID-19 contact tracing | Nee |
| Data safety (zie §11) | ingevuld |
| Advertising ID | **Niet gebruikt** — de app vraagt hem niet op en er zit geen SDK in die dat doet |
| Photo and Video permissions | Niet van toepassing — geen `READ_MEDIA_*` in het manifest |

---

## 14. Release notes

Maximaal 500 tekens per taal. `test-playteksten.js` telt dat mee, dus korten
gebeurt hier en niet tijdens het plakken.

**Dit wordt de eerste inzending**, en dat maakt dit veld iets anders dan een
changelog: er is niets "nieuw", dus de tekst beschrijft wat de app ís. Dat
betekent ook dat hij dezelfde belofte doet als §3 — en twee velden die met de
hand hetzelfde beschrijven, lopen hier uit de pas. Dat is de fout die §16 op
10-09 de kop kostte en die §11 twee keer eerder maakte. **`test-playteksten.js`
controleert daarom dat elke functie die dit veld noemt óók in §3 staat**; noem
je hier iets nieuws, dan hoort het daar eerst.

**Nagelezen tegen build #432, 10-09-2026.** De drie functies die hieronder bij
naam genoemd worden bestaan als eigen module (`pidlane-monitor.js`,
`pidlane-koopcheck.js`, `pidlane-remote.js`), en de demobelofte op de laatste
regel wordt woordelijk bewaakt door `test-demo-toegang.js` — dat is de zin die
een reviewer zonder auto als eerste probeert.

**Eén taal, en dat is een besluit** — zie de regel onder §0. Dit veld had tot
10-09-2026 ook een en-US-blok, net als §2, terwijl §3 er geen had (#177).

```
Eerste versie in de Play Store.

Verbindt via Bluetooth met een OBD2-adapter en leest de boordcomputer van je
auto uit: foutcodes, live sensorwaarden, grafieken en een diagnoserapport in
gewone taal. Met ritmonitor, koopcheck en diagnose op afstand.

Geen adapter? Probeer de demomodus op het startscherm — geen account nodig.
```

---

## 15. Closed testing

Google verlangt voor een nieuw ontwikkelaarsaccount een gesloten test vóór
productie. Wat je invult:

| veld | waarde |
|---|---|
| Track | Closed testing |
| Testers | e-mailadressen van het pilotbedrijf plus eigen adressen |
| Feedback channel | `info@pidlane.nl` |
| Countries | Nederland (breid uit zodra de RDW-kentekenfunctie niet meer het enige regiogebonden stuk is) |

De gesloten test is ook de plek waar de dingen uitkomen die de gate niet kan
zien: of `errorPath` op een toestel zónder netwerk echt de eigen foutpagina
toont, en of de bovenrand en onderrand op Android 15+ overal kloppen.

---

## 16. Vóór je op inzenden drukt

**Deze lijst had één fout, en die is op 10-09-2026 gerepareerd.** Hij stond vol
vinkjes die gezet waren op build #423 van 03-09. Sinds die dag zijn er negen
builds bij gekomen en is er fors verbouwd — laag 2 en 3 uit de meetketen weg,
de begeleide run herbouwd tot twee rondes, de ritwaarnemer uitgebreid. Een
aangevinkt hokje dat over een build gaat die je niet uploadt, is erger dan geen
hokje: het stelt je gerust over iets wat niet nagekeken is.

De lijst staat daarom in twee delen, en dat onderscheid is de hele reparatie.

### 16a — Wat een test bewaakt (blijft vanzelf waar)

Deze punten hoef je niet opnieuw na te lopen. Ze worden bij elke commit
gecontroleerd door `plcheck.sh`; gaat er iets stuk, dan wordt CI rood vóór er
iets gebouwd wordt. Vink ze één keer af en laat ze staan.

**Twee regels in deze tabel logen, en dat is op 10-09-2026 gerepareerd.**

De regel *"Geen koopknop in de app, geen APK-distributie in de app"* noemde
`test-playteksten.js` als wachter. Dat bestand toetst tekenlimieten, URL's,
anonimisering, versienummer, wachtwoorden, release notes en taalblokken —
koopknop noch APK komt erin voor. Er stond dus een vinkje onder "blijft vanzelf
waar" boven iets wat niemand nakeek. `test-schilgrenzen.js` doet het nu wél, en
`pidlane-klant.js` houdt de betaallink in de schil dicht ongeacht wat er in de
Config-tabel staat — want die knop was vanuit Airtable aan te zetten, zonder
commit, zonder gate en zonder build.

De regel over locatie stond er terecht, maar de toets eronder liep met
`.every()` over een lege lijst en stond daarom groen op nul regels, terwijl de
BT-plugins de permissie ongegrensd meebrachten. Zie `PIDLANE.md` §11.

Dat is dezelfde fout als 16b hieronder beschrijft: **een vinkje dat je
geruststelt over iets wat niet nagekeken is, is erger dan geen vinkje.** Staat
er een test bij een regel, dan hoort die regel in die test terug te vinden te
zijn.

| punt | bewaakt door |
|---|---|
| `versionName` in `package.json`, `public/config.js` en dit document gelijk (3.0.0) | `test-playteksten.js` |
| Geen locatie: manifest, code en de drie verklaringen zeggen hetzelfde | `test-geen-gps.js` |
| Foutpagina in de schil als de app niet laadt (`server.errorPath`) | `test-foutpagina.js` |
| `feat_demo` dekt beide demoknoppen — geen dode knop op het loginscherm | `test-demo-toegang.js` |
| Geen koopknop en geen APK-download in de Play-schil | `test-schilgrenzen.js` |
| Geen locatie zonder grens in de bundel zelf | `test-geen-gps.js` + de poort op het samengevoegde manifest |
| Privacy- en verwijder-URL wijzen naar dezelfde host als de app | `test-playteksten.js` |
| Elk invulveld past binnen de tekengrens van de Console | `test-playteksten.js` |
| Het document beweert nergens dat gegevens *anoniem* zijn | `test-playteksten.js` |
| Het icoon staat op een pad dat een build start | `test-icoonpad.js` |
| De APK-sleutel die de build schrijft, is die de Worker leest | `test-apkpad.js` |
| De toestemmingstekst noemt pseudonimisering, geen anonimisering | `test-toestemmingstekst.js` |

### 16b — Wat op een TOESTEL bewezen moet zijn, en op wélke build

Deze punten verlopen bij elke nieuwe build, en daarom staat het buildnummer
erbij in plaats van een kaal vinkje. Bij vijf van de zes moet er een mens met
een telefoon aan te pas komen; geen enkele test dekt ze.

De eerste regel is de uitzondering en staat hier om de andere reden: die wordt
door de build zélf bewezen — *Verify signature* en de stap *Controleer het
samengevoegde manifest* draaien op elke run — maar hij verloopt net zo hard,
want hij gaat over één bepaalde bundel. Vul hem dus bij, tik hem niet af.

> **Vul hier de build in die je gaat uploaden**, en zet er per regel het
> buildnummer bij waarop je het gezien hebt. Staat er een ouder nummer dan de
> build hierboven, dan is dat punt niet nagekeken.
>
> **Upload-build: `#___`  (datum: __-__-2026)**

| punt | laatst bewezen op |
|---|---|
| `.aab` gebouwd én ondertekend, `versionCode` loopt mee met `run_number` | build #435, 10-09-2026 — `versionCode 435` bij `run_number` 435, en *Verify signature* meldde "Bundle is ondertekend" |
| Foutpagina doet het echt: vliegtuigmodus aan, koud gestart, eigen scherm in plaats van `net::ERR_` | build #423, 03-09-2026 om 20:16 |
| Demo één keer helemaal doorlopen op een schoon toestel zonder adapter | build #423, 03-09-2026 |
| Disclosure verschijnt vóór het Android-permissiedialoog, niet erna | nog niet bewezen |
| Weigerknop: geen permissieverzoek, geen verbinding, app blijft heel | nog niet bewezen |
| De begeleide run opent en loopt door — dit is het scherm dat een reviewer als eerste ziet na de demo | nog niet bewezen |

**Let op bij de demo-doorloop.** De begeleide run is op 10-09 verbouwd tot twee
rondes (meetrit en toestelronde). Een doorloop van vóór die datum zegt niets
meer over wat een reviewer nu ziet.

### 16c — Buiten de repo, en dit is de helft die blijft liggen

Hier kan de code niets aan doen; dit is handwerk in andere systemen.

- [ ] `info@pidlane.nl` bestaat en wordt gelezen — een reviewer mag erop mailen
- [ ] `https://app.pidlane.nl/privacy.html` opent in een private venster
- [ ] `https://app.pidlane.nl/verwijderen.html` opent in een private venster
- [ ] `feat_demo` staat AAN in de AppConfig-tabel (Airtable) — staat hij uit,
      dan klopt §7 niet meer
- [ ] Het reviewaccount `demo@pidlane.nl` bestaat, heeft tegoed, en is
      **niet** je eigen inlog — zie §7
- [ ] Het wachtwoord van dat account staat in het Console-veld *App access*
      en **nergens in deze repo**: dit is een publieke repository
- [ ] Data safety-formulier ingevuld volgens §11, met "anonymized" NERGENS
      aangevinkt
- [x] Feature graphic gemaakt (1024×500)
- [x] Twee schermafbeeldingen met echte meetwaarden, op een echt toestel
