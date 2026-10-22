<div align="center">

<img src="icon-512.png" width="96" alt="PidLane-logo">

# PidLane

**Your car talks. We translate.**

OBD2-diagnose in gewone taal — voor autobezitters, garages, occasion-handelaren en wagenparkbeheer.

![versie](https://img.shields.io/badge/versie-3.4.0-1fd189)
![platform](https://img.shields.io/badge/platform-Android%20%7C%20web-4fd6f0)
![tests](https://github.com/NewspeedyNL/PidLane/actions/workflows/tests.yml/badge.svg)

[pidlane.nl](https://pidlane.nl) · [app.pidlane.nl](https://app.pidlane.nl) · [Changelog](CHANGELOG.md) · [Architectuur](PIDLANE.md)

</div>

---

Steek een OBD2-adapter onder het stuur, verbind met PidLane en je ziet live wat de auto
meet, welke foutcodes er staan en wat dat betekent — met een AI-diagnose die uitlegt wat je
nu moet doen. Draait als webapp en als Android-app; gericht op de Nederlandse markt.

## Nieuw in 3.4

| | |
|---|---|
| 📄 **Aankooprapport** | De koopcheck als PDF, met een oordeel uit vaste regels. Onvolledig is nooit groen. |
| ❄️ **Wintercheck** | Banden, ruitensproeier en het weer voor je woonplaats (plaats uit een lijst, geen locatie). |
| ⏱️ **Beeld-in-beeld** | Een klokje met naald en een stopknop, zichtbaar boven je navigatie. |
| ⚡ **Snel verbinden** | Een auto die de app al kent, verbindt zonder opnieuw te zoeken. |
| 🚦 **Slimmer oordeel** | Houdt rekening met stilstaan of rijden. |
| 💶 **Kosten per maand** | Met de wegenbelasting uit de wettabel en pompprijzen van nu. |

Geen adapter? Probeer de **demomodus** op het startscherm.

## Functies

**Voor iedereen**
- **Check mijn auto** — stoplichtoordeel met uitleg in gewone taal
- **Live meten** — real-time meters met adaptieve multi-PID-polling
- **Foutcodes** — actueel, permanent en freeze frame (mode 03/07/0A/02), mode 06-testresultaten, alle stuurapparaten via UDS
- **Lampjesgids** — maak een foto van een dashboardlampje en zie wat het betekent
- **Mijn voertuigen** — kenteken-check, terugroepmeldingen, tankbeurten, conditiescore en herinneringen
- **Rit-monitor** — passieve bewaking tijdens het rijden (monitor, signaalwatchers, automatische hertest)

**Voor professionals**
- **Koopcheck & aankooprapport** — inspectie bij occasions, inclusief kilometerstandcontrole
- **Onderdeelaanwijzer** — koppelt foutcodes en live data aan het vermoedelijke onderdeel
- **Expert op afstand** — een monteur kijkt live mee via sessiecode of QR
- **Meetkwaliteit** — waakronde, bus- en PID-poorten houden onbetrouwbare metingen uit het rapport
- **Verbindingswizard** — gefaseerde protocoldetectie voor uiteenlopende merken en adapters

## Hardware

Getest met **OBDLink MX+** (STN, Bluetooth Classic SPP) en **Vgate iCar Pro BT 3.0**.

| platform | verbinding |
|---|---|
| Android-app | Capacitor Bluetooth Serial-plugin |
| Chrome op Android | Web Serial over Bluetooth RFCOMM/SPP (Chrome 138+) |
| iOS / Safari | niet ondersteund (geen Web Serial) |

## Architectuur

| laag | technologie |
|---|---|
| Frontend | statische single-page app: `index.html` + losse JS-modules, vanilla JS, geen buildstap |
| Backend | Cloudflare Worker `pidlane-proxy` — auth, AI-proxy, data, remote-sessies |
| Realtime | Cloudflare Durable Objects (meekijken op afstand) |
| Opslag | Cloudflare D1/R2 en Airtable |
| AI | Anthropic API (Claude) via Cloudflare AI Gateway |
| Android | Capacitor, gebouwd via GitHub Actions |

```
public/index.html      hoofdapp (UI, state, routing)
public/config.js       publieke instellingen (Worker-URL, versie) — geen geheimen
public/pidlane-*.js    de modules; pidlane-bedrading.js hangt ze aan elkaar
public/test-*.js       node-tests
public/bproef-*.js     browserproeven tegen de echte app
worker.js              Cloudflare Worker (bewerk rechtstreeks, niet bundelen)
admin/beheer.html      beheerpagina: klanten, codes, database, meetopdrachten
marketing/             advertenties en video's, gerenderd uit HTML
```

Welke module waarvoor is: **§4 van [`PIDLANE.md`](PIDLANE.md)**. Waaróm iets ooit stukging:
[`PIDLANE-ARCHIEF.md`](PIDLANE-ARCHIEF.md). Wat er nu openstaat: de GitHub-issues.

## Ontwikkelen

Geen buildstap, geen frameworks — bewerken en deployen is hetzelfde bestand.

```bash
node --check <bestand>          # vóór elke commit
node public/test-<onderwerp>.js # de test van wat je raakte
bash plcheck.sh .               # volledige poort (ook in CI)
bash plmutate.sh .              # tegenproef: wordt elke nagebouwde fout gevangen?
bash plbrowser.sh .             # browserproeven in Chromium
```

> **Elke push naar `main` die code raakt is een deploy** naar 100% van het verkeer
> (Cloudflare Workers Builds). Werk op een eigen branch van de huidige `main`;
> automerge gebeurt alleen met het label `klaar`. De werkregels staan in [`CLAUDE.md`](CLAUDE.md).

## Privacy

Een VIN verlaat de telefoon **nooit ruw**: uitgaande paden pseudonimiseren hem met
`SHA-256(zout + VIN)`. Dat is pseudonimisering, geen anonimisering. Login loopt
server-side met HMAC-ondertekende tokens; er staat geen app-sleutel in de client.
Zie de [privacyverklaring](public/privacy.html).

## Status & eigendom

Actief in ontwikkeling als soloproject, in pilot bij garagebedrijven en te vinden in de Play Store.
De marketingsite staat in een aparte repo (`PidLane-Pitch`).

Propriëtaire software — alle rechten voorbehouden.
