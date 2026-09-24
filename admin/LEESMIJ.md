# Beheerpagina — draaien

De beheerpagina (toen nog `admin.html`) stond tot 25-08-2026 in `public/` en werd
daarmee door de Worker meegeserveerd: hij was voor iedereen te openen op
`https://app.pidlane.nl/admin.html`.

Dat lekte geen gegevens — elke admin-route controleert `ADMIN_TOKEN` server-side
en zonder die token krijg je niets. Maar het zette wel de complete beheerkant
van PidLane publiek in de etalage: welke endpoints er zijn, hoe ze heten en wat
je ermee kunt. Dat is gratis verkenningswerk weggeven aan iemand die het op de
Worker gemunt heeft. Het bestand waarschuwde daar in regel 3 zelf al voor.

Nu staat hij buiten `public/` en wordt hij dus nergens geserveerd.

**Let op: dat is maar de helft.** Deze repo is openbaar, dus `admin/beheer.html`
is gewoon te lezen op GitHub. De verkenningswaarde die de verhuizing wilde
wegnemen — welke endpoints er zijn en hoe ze heten — ligt daarmee nog steeds op
straat. De echte bescherming is en blijft server-side: elke adminroute
controleert `ADMIN_TOKEN`. Wie dat argument helemaal wil sluiten, moet de repo
privé maken; het bestand hier weghalen helpt niet, want de geschiedenis bewaart
het toch. Zie ook `newspeedynl.github.io` in `ALLOWED_ORIGINS` van `worker.js`:
staat GitHub Pages aan voor deze repo, dan is de pagina via dat adres mogelijk
zelfs te openen én accepteert de Worker die herkomst.

## Openen

Vanuit de repo:

```
npm run admin
```

en open dan **http://127.0.0.1:8788/** — dat is `beheer.html`.

Dat draait `admin/serve.js` op node. Tot 28-08-2026 stond hier
`python3 -m http.server`; dat werkte, maar node is er in dit project sowieso
(de hele testreeks draait erop) en python3 niet per se. Op een kaal Windows-
toestel of een verse Termux was het eerste wat je bij het beheer tegenkwam dus
een installatieprobleem in plaats van de pagina.

De server bindt op `127.0.0.1` en niet op `0.0.0.0`: de adminpagina hoort niet
op je wifi te staan, ook niet even. Andere poort nodig? `PORT=9000 npm run admin`.

Liever iets anders? Elke statische server voldoet — het enige dat telt is dat de
pagina via `http://localhost` of `http://127.0.0.1` geopend wordt.

## Oefenen zonder iets kapot te maken

Op de toegangspoort staat **🧪 Oefenen met voorbeelden**. Geen token nodig, en er
gaat geen enkel verzoek naar de Worker: alle antwoorden komen uit
voorbeeldgegevens in de pagina zelf.

Je krijgt vijf klanten, drie gebruikers, drie activatiecodes, drie meetopdrachten en een logboek met ritten — met opzet niet
allemaal netjes. Er zit een geblokkeerde klant tussen, iemand met saldo nul, een
openstaand wachtwoordherstel en een gebruiker zonder wachtwoord. Dat zijn
precies de gevallen waarop je wilt kunnen oefenen en die je in een schone lijst
nooit tegenkomt.

Wijzigingen landen echt in die voorbeelden: pas je een saldo aan, dan zie je het
totaal bovenaan meebewegen. Bij het verversen van de pagina staat alles weer op
de begintoestand.

De modus wordt **niet onthouden** en is niet weg te klikken zolang hij aanstaat.
Er hoort geen toestand te bestaan waarin je denkt live te werken terwijl je
oefent — of andersom. Om dezelfde reden zegt de statuskaart in oefenmodus
"niet gemeten" in plaats van een groene vink: er is niets gemeten.

Elke sectie heeft daarnaast een uitklapbare **❔-uitleg**: wat het scherm doet,
en wat er gebeurt als je het fout doet. Vooral bij Klanten en Activatiecodes is
dat het lezen waard — daar zit geld achter.

## Saldo: bijboeken of zetten

Twee knoppen, en het verschil is opzettelijk.

**Bijboeken** is de gewone handeling: "klant heeft 50 gekocht" → `50`. Een
negatief getal boekt af. De Worker leest het saldo vlak vóór het schrijven en
telt daar bij op. Dat is belangrijk: rekende de pagina zelf, dan zou hij het
saldo gebruiken uit een lijst die minuten geleden geladen is, en het verbruik
van elke analyse die de klant intussen deed terugschrijven.

**Saldo zetten** overschrijft het bedrag. Dat is de gevaarlijke variant — een
rekenfout in je hoofd schrijft rechtstreeks geld weg — en daarom vraagt hij een
extra bevestiging met het verschil erbij.

Airtable kent geen transacties. Twee beheerders die op dezelfde seconde
bijboeken kunnen elkaar nog steeds overschrijven. Bij één beheerder is dat geen
praktisch risico; het staat hier zodat niemand later denkt dat het atomair is.

## De auditregel — en wat hij niet is

Elke wijziging aan een klant (saldo, status, wachtwoord) schrijft een regel in
het veld **`Audit`** van de Klanten-tabel. Je ziet ze terug onder *Details* bij
de klant, nieuwste eerst.

**Dit veld moet je zelf aanmaken**: een lang-tekstveld met de naam `Audit` in de
Klanten-tabel. Bestaat het niet, dan werkt alles gewoon door — alleen de
vastlegging niet, en het antwoord zegt dat dan (`vastgelegd: false`). Dat is met
opzet zo gebouwd: een vergeten veld hoort het beheer niet plat te leggen. Om
dezelfde reden gaan de wijziging en de auditregel als twee losse schrijfacties
naar Airtable, met de wijziging eerst.

**De naam bij een regel bewijst niets.** Er is één `ADMIN_TOKEN` en dat draagt
geen identiteit. De naam komt uit de adminpagina (je wordt er één keer om
gevraagd, daarna staat hij in localStorage) en is dus zelf-opgegeven. Hij
onderscheidt collega's die hem invullen; hij houdt niemand tegen die dat niet
doet. Wil je een audit die wél sluitend is, dan is er een token per beheerder
nodig — dat is een andere verbouwing.

## Waarom niet gewoon dubbelklikken

Dan is de herkomst `file://` en stuurt de browser `Origin: null`. De Worker
weigert dat, en het foutbeeld ("Failed to fetch") lijkt sprekend op een
geweigerde token terwijl je token nooit is meegekeken. De pagina vangt dit
sinds 17-08 zelf af met een melding bovenaan.

## De Worker laat localhost bewust toe

In `worker.js` staat naast `ALLOWED_ORIGINS` een regexp `LOCALHOST_ORIGIN` die
`http://localhost` en `http://127.0.0.1` met een willekeurige poort toestaat.
Dat is nodig omdat de Origin-header de poort meeneemt: `http://localhost:8788`
matcht niet op `http://localhost`.

Alleen loopback, alleen `http`. Een pagina op een ander adres kan die Origin
niet vervalsen — de browser zet hem, niet de pagina.

## Eén pagina: `beheer.html`

Van 04-09 tot 24-09-2026 stonden hier twee beheerpagina's naast elkaar:
`admin.html` (de eerste, die echt geld beheerde) en `beheer.html` (de tweede
generatie, ernaast gezet zodat een fout in de verbouwing de saldoknoppen niet
kon raken). Op 24-09 is `admin.html` opgegaan in `beheer.html` en weggehaald.

**Waarom hij niet eerder weg kon.** Er hingen vier dingen aan: twee delen van
`test-bijboeken.js` (kent de pagina elke foutcode van de saldoroute, en stuurt
de knop `saldoWas` mee), heel `test-adminoefen.js` (lekt de oefenmodus niet),
drie mutaties in `plmutate.sh`, en de div-balans in `plcheck.sh`. Die wijzen nu
allemaal naar `beheer.html`. Bij het omzetten bleek er één echt gat: beheer.html
las de foutcode uit de leesbare tekst in plaats van uit `code`, en kende
`saldo_geen_email` niet. Beide zijn gerepareerd en nu ook als gedrag getoetst.

Wat `admin.html` had en hier ontbrak — bij een klant de verzilverde codes en
het verschil met "ooit gekocht" — staat nu onder **Details** bij de klant.

### De tabbladen

| # | tabblad | wat |
|---|---|---|
| 1 | Overzicht | status van de keten, kerncijfers, logactiviteit, snelknoppen |
| 2 | Klanten | aanmaken, bijboeken, saldo zetten, status, wachtwoord, wissen |
| 3 | Codes | activatiecodes genereren, filteren, CSV |
| 4 | Gebruikers | app-gebruikers (monteur, admin, demo) |
| 5 | Logboek | regels ophalen en uittekenen — telt wat je ophaalt |
| 6 | **Database** | de D1-database als geheel: cijfers over álle rijen, ritten, SQL-console |
| 7 | **Meetopdrachten** | bewerken, keuren met de echte keurder, activeren |
| 8 | Tabellen | elke bekende bron (D1 en Airtable) bladeren, wijzigen, wissen, opruimen |
| 9 | Instellingen | deuren, functieschakelaars, banner, betaallinks, AI-instructie |
| 0 | Gereedschap | verwijderwachtrij, poorttest, routes, ruwe leesroute |

De cijfertoetsen **1–9 en 0** springen ertussen zolang je niet in een veld staat.

### Database (D1) — `/admin/d1`

- **Overzicht.** SQLite telt zelf, over de hele tabel: totaal, vandaag, ritten,
  fouten, uitkomsten, regels zonder rit, en het vangnet `onbekend` (hoort 0 te
  zijn; staat er iets, dan mist `schema.sql` een kolom). Daaronder per dag (met
  de lege dagen erbij), per type, soort, versie, merk en adapter, de meest
  voorkomende fouten, en elke tabel en view met rijen, kolommen en indexen.
  Staan er twee meetopdrachten aan, dan staat dat hier als rode balk.
- **Ritten.** De recente ritten uit de view `sessies`. Open er een en je ziet
  hem van begin tot eind in ontvangstvolgorde, met een filter op FOUT/LET OP/
  uitkomsten. **Bevindingen kopiëren** zet precies die regels op het klembord;
  CSV en JSON van de hele rit kan ook. **Deze rit opruimen** wist niets zelf:
  hij vult de voorwaarde in bij Tabellen → Opruimen, waar je eerst telt.
- **SQL-console, alleen lezen.** `SELECT` en `WITH`, één vraag, hoogstens 500
  rijen. De Worker pakt de vraag in als subquery (`SELECT * FROM (…) LIMIT 501`
  — daarin past geen DELETE of UPDATE) én keurt de tekst daarvóór op
  schrijfwoorden, met tekstwaarden en commentaar eruit. Elke laag apart
  uitzetten wordt rood in `test-admind1.js`. Voorbeeldvragen staan in het
  keuzemenu; je eigen laatste twaalf onthoudt de browser. Hij telt mee in de
  schrijfrem van het beheer (20 per minuut).

### Meetopdrachten

De pagina laadt `public/pidlane-opdracht.js` en `public/pidlane-data.js` — de
keurder en de PID-tabel die de app zelf draait. `serve.js` serveert precies die
twee bestanden uit `public/`, bij naam, en verder niets daarbuiten. Een
opdracht die hier afkeurt, wijst de app ook af; **activeren weigert** hem dan.
Opslaan als klad mag wel, met een bevestiging.

**Activeren zet de andere uit, in één transactie.** Op 22-09-2026 stonden er
negen aan en won de verkeerde (zie `schema.sql`). `Gewijzigd` zet de Worker
zelf bij elke opslag: de app kiest op die tijd, dus met de hand bijstellen zou
stil kiezen zijn welke opdracht er rijdt.

De keurder zegt of de *vorm* klopt. Of de opdracht iets kán meten (een proef
op een sensor die niet in `sensoren` staat) laat het tabblad als oranje regel
zien, en `node plopdracht.js` in de repo toetst het volledig.

### Wat er hetzelfde blijft

De oefenmodus (🧪 op de toegangspoort, geen token nodig, geen enkel verzoek
naar de Worker) dekt ook de nieuwe tabbladen. Eén ding kan hij niet: SQL
uitvoeren. De console zegt dan in beeld dat je vraag **niet** is uitgevoerd en
toont voorbeeldrijen. Er staan met opzet twee actieve meetopdrachten en een
regel in het vangnet in de voorbeelden, zodat je die waarschuwingen een keer
gezien hebt.

**De nieuwe Worker is nodig.** Staat er een oudere live, dan geeft de
statuskaart op Overzicht bij *Databaseroute* een rode 404.
