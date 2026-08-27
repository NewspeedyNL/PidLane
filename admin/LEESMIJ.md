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
