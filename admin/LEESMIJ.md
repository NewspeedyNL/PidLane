# Adminpagina — draaien

`admin.html` stond tot 25-08-2026 in `public/` en werd daarmee door de Worker
meegeserveerd: hij was voor iedereen te openen op `https://app.pidlane.nl/admin.html`.

Dat lekte geen gegevens — elke admin-route controleert `ADMIN_TOKEN` server-side
en zonder die token krijg je niets. Maar het zette wel de complete beheerkant
van PidLane publiek in de etalage: welke endpoints er zijn, hoe ze heten en wat
je ermee kunt. Dat is gratis verkenningswerk weggeven aan iemand die het op de
Worker gemunt heeft. Het bestand waarschuwde daar in regel 3 zelf al voor.

Nu staat hij buiten `public/` en wordt hij dus nergens geserveerd.

**Let op: dat is maar de helft.** Deze repo is openbaar, dus `admin/admin.html`
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

en open dan **http://127.0.0.1:8788/admin.html**.

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

Je krijgt vier klanten, drie gebruikers en drie activatiecodes — met opzet niet
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

## Twee pagina's: `admin.html` en `beheer.html`

Sinds 04-09-2026 staat er een tweede beheerpagina naast de eerste:

| bestand | openen op | wat het is |
|---|---|---|
| `admin.html` | `http://127.0.0.1:8788/admin.html` | de vertrouwde pagina, ongewijzigd |
| `beheer.html` | `http://127.0.0.1:8788/beheer.html` | tweede generatie |

`npm run admin` serveert de hele map, dus allebei draaien ze zonder extra
stappen. Ze praten met dezelfde Worker en dezelfde routes.

**Waarom een tweede bestand en geen verbouwing.** `admin.html` werkt en beheert
echt geld. Hem openbreken voor een tabellenbrowser en een logvisualisatie
betekent dat één fout in de verbouwing ook de saldoknoppen raakt die het al
deden. Valt er in `beheer.html` iets om, dan pak je de oude en gaat het beheer
door.

### Wat `beheer.html` erbij kan

- **Klanten aanmaken.** Was er niet: een klant kon alleen zichzelf registreren.
  Het wachtwoord is optioneel — laat je het leeg, dan bestaat het account wel
  maar kan er nog niet op ingelogd worden en zet de klant er zelf een via
  "wachtwoord vergeten". Dat is de veiligste variant, want dan heb jij er nooit
  een gekend.
- **Het logboek ophalen en uittekenen.** Per dag, per type, en de koplijstjes
  van gebruiker, app-versie en merk. Let op wat er onder de grafiek staat: die
  telt *wat je opgehaald hebt*. Haal je 300 regels op, dan gaat "laatste 14
  dagen" over die 300 regels en niet over de hele tabel.
- **Elke bekende Airtable-tabel doorbladeren**, rijen wijzigen en wissen.
  Sommige velden zijn afgeschermd en staan grijs met een 🔒: `Saldo` hoort door
  het saldoslot (via de klantenkaart), `PassHash` door de wachtwoordroute, en
  `Email` is de sleutel waar dat slot op staat. Een wachtwoordhash en een
  resettoken worden niet eens getoond — die verlaten de Worker niet.
  `AppConfig` is alleen-lezen: schrijven gaat via de instellingenkaart, want
  die gooit ook de randcache weg.
- **CSV van elke lijst** die je op het scherm hebt (puntkomma en een BOM, dus
  Excel opent hem zonder importvenster).
- **Gereedschap**: de poorttest, de verwijderwachtrij, een lijst van de routes
  waar de pagina mee praat, en een ruwe GET om te zien wat de Worker werkelijk
  antwoordt.
- Sneltoetsen **1 t/m 8** springen tussen de tabbladen zolang je niet in een
  invoerveld staat.

### Wat er hetzelfde blijft

Dezelfde oefenmodus (🧪 op de toegangspoort, geen token nodig, geen enkel
verzoek naar de Worker), dezelfde ❔-uitleg per scherm, dezelfde uitleg bij een
weigering, en dezelfde regel over de auditregel: de naam erbij is
zelf-opgegeven en bewijst niets.

**De nieuwe Worker is nodig.** De tabellenbrowser en het logboek draaien op
`/admin/tabel`; klanten aanmaken op `actie=aanmaken` in `/admin/klanten`. Staat
er nog een oudere Worker live, dan geeft de poorttest onder *Gereedschap* dat
als enige rode stap terug met "deze Worker kent /admin/tabel nog niet".
