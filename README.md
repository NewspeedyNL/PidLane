# PidLane

**AI-gestuurde OBD2-diagnose voor garages, occasion-handelaren en wagenparkbeheerders.**

PidLane is een webapp (ook als Android-APK) waarmee een monteur of beheerder via een
OBD2-adapter live voertuigdata uitleest, foutcodes analyseert en een AI-diagnoserapport
laat opstellen. Gericht op de Nederlandse B2B-markt: autobedrijven, occasion-verkopers
en fleet management.

## Functies

- **Live PID-data** — real-time gauges met adaptieve multi-PID batchpolling (CAN)
- **Basic system check & volledige diagnose** — gestructureerde doorloop van sensoren en systemen
- **DTC-uitlezing** — actuele, permanente en freeze-frame foutcodes (mode 03/07/0A/02), plus mode 06 testresultaten
- **Rit-monitor** — passieve achtergrondbewaking tijdens het rijden, in drie lagen:
  - *Monitor* (Laag A): periodieke statuspolling en foutcode-harvesting
  - *Watchers* (Laag B): signaalanalyse op ruwe data (sensor-uitval, bevroren waarden, uitschieters)
  - *Verify* (Laag C): automatische focus-hertest bij verdachte signalen
- **Meetkwaliteit** — waakronde, bus- en PID-poorten die onbetrouwbare metingen tegenhouden vóór ze in een rapport belanden
- **Koopcheck (aankoopinspectie)** — checklist en metingen voor occasion-aankoop, inclusief kilometerstand-controle
- **Onderdeelaanwijzer** — koppelt foutcodes en live data aan het vermoedelijke defecte onderdeel
- **Caravan-rittracker** — live brandstofcoach met rij-adviezen (op-/afschakelen, cruise, remmen op de motor)
- **Verbindings-wizard** — gefaseerde protocoldetectie voor uiteenlopende merken en adapters
- **AI-copilot** — diagnoserapporten gegenereerd via de Anthropic API, met voertuig- en rijcontext
- **Remote diagnose** — een expert kijkt op afstand mee via sessiecode of QR, zonder zelf Bluetooth nodig te hebben
- **Veldlab (achtergrond)** — elke meetsessie draagt automatisch bij aan referentiewaarden per merk/model/CALID

## Architectuur

| Laag | Technologie |
|---|---|
| Frontend | Statische single-page app (`index.html` + ~57 losse JS-modules), vanilla JS, geen buildstap |
| Backend | Cloudflare Worker (`pidlane-proxy`) — auth, AI-proxy, Airtable-koppeling, remote-sessies |
| Data-opslag | Airtable (config, logs, sessies, referentiewaarden) |
| AI | Anthropic API (Claude) via Cloudflare AI Gateway |
| Bestandsopslag | Cloudflare R2 (APK-distributie) |
| Realtime sessies | Cloudflare Durable Objects (remote diagnose) |
| Android-app | Capacitor, gebouwd via GitHub Actions |

## Projectstructuur

```
public/index.html          hoofdapp (UI, state, routing)
public/config.js           publieke instellingen (Worker-URL, versie) — geen geheimen
public/pidlane.css         hoofd-CSS
public/pidlane-*.js        de modules; pidlane-bedrading.js hangt ze aan elkaar en laadt als laatste
public/test-*.js           node-tests (losse functies)
public/bproef-*.js         browserproeven (module-koppeling, DOM, opstartvolgorde)
worker.js                  Cloudflare Worker: auth, AI-proxy, Airtable, remote-sessies
admin/admin.html           gebruikersbeheer (lokaal draaien: npm run admin)
plcheck.sh                 commit-poort: syntax, testreeks, div-balans, modulebedrading
plmutate.sh                tegenproef: bouwt bekende fouten na en eist dat een test rood wordt
plbrowser.sh               start de echte index.html in Chromium en draait de bproeven
```

Welke module waarvoor is, staat in **§4 van `PIDLANE.md`** — dat is de kaart, niet deze
lijst. `PIDLANE.md` §11 bewaart waaróm iets stukging; de stand van zaken staat in de
GitHub-issues.

> De marketingsite (`pidlane.nl`) staat in een apart repo (`PidLane-Pitch`).

## Hardware & compatibiliteit

Geteste adapters: **OBDLink MX+** (STN-chipset, Bluetooth Classic SPP) en
**Vgate iCar Pro BT 3.0**.

- **Web (Android Chrome):** Web Serial over Bluetooth RFCOMM/SPP (stabiel sinds Chrome 138)
- **Web (iOS/Safari):** Web Serial wordt niet ondersteund
- **Android-APK:** Capacitor Bluetooth Serial-plugin, onafhankelijk van browserondersteuning

## Ontwikkelen & deployen

Geen buildstap, geen frameworks, geen `src/`-map — bewerken en deployen is hetzelfde bestand.

```bash
bash plcheck.sh .     # commit-poort; exit 0 is de voorwaarde om te committen
bash plmutate.sh .    # tegenproef: stelt die poort iets voor?
bash plbrowser.sh .   # browserproeven tegen de echte app
```

Dezelfde drie draaien in CI. **Elke push naar `main` is een deploy** naar 100% van het
verkeer (Cloudflare Workers Builds); er zit geen mens tussen merge en klant. Daarom:
werk op een eigen branch, gesneden van de huidige `main`, en voeg pas samen als de poort
groen staat. Automerge is opt-in via het label `klaar`.

De APK komt uit Capacitor via GitHub Actions (`.github/workflows/build-apk.yml`).

De volledige werkregels staan in `CLAUDE.md`.

## Beveiliging & privacy

Login verloopt server-side tegen het Worker-secret `USERS_JSON`; sessies gebruiken
HMAC-ondertekende tokens met beperkte geldigheid. Er staat geen vast app-token in de client.

Een VIN verlaat de telefoon **nooit ruw**: beide uitgaande paden pseudonimiseren hem met
`SHA-256(zout + VIN)`, eerste 16 hextekens. Dat is pseudonimisering, geen anonimisering —
het zout staat in clientcode, en gebruikersteksten noemen het daarom nooit "anoniem".

## Status

Actief in ontwikkeling als solo-project, momenteel in pilotfase bij een eerste garagebedrijf.

## Eigendom

Propriëtaire software — alle rechten voorbehouden.
