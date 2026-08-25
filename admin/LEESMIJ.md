# Adminpagina — draaien

`admin.html` stond tot 25-08-2026 in `public/` en werd daarmee door de Worker
meegeserveerd: hij was voor iedereen te openen op `https://app.pidlane.nl/admin.html`.

Dat lekte geen gegevens — elke admin-route controleert `ADMIN_TOKEN` server-side
en zonder die token krijg je niets. Maar het zette wel de complete beheerkant
van PidLane publiek in de etalage: welke endpoints er zijn, hoe ze heten en wat
je ermee kunt. Dat is gratis verkenningswerk weggeven aan iemand die het op de
Worker gemunt heeft. Het bestand waarschuwde daar in regel 3 zelf al voor.

Nu staat hij buiten `public/` en wordt hij dus nergens geserveerd.

## Openen

Vanuit de repo:

```
npm run admin
```

en open dan **http://localhost:8788/admin.html**.

Dat start `python3 -m http.server` op de map `admin/`. Werkt op Termux, Linux,
macOS en Windows zolang `python3` in het pad staat. Liever iets anders? Elke
statische server voldoet — het enige dat telt is dat de pagina via
`http://localhost` of `http://127.0.0.1` geopend wordt.

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
