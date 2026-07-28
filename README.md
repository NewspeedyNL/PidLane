# PidLane

**AI-gestuurde OBD2-diagnose voor garages, occasion-handelaren en wagenparkbeheerders.**

PidLane is een webapp (ook als Android-APK) waarmee een monteur of beheerder via een OBD2-adapter live voertuigdata uitleest, foutcodes analyseert en een AI-diagnoserapport laat opstellen. Gericht op de Nederlandse B2B-markt: autobedrijven, occasion-verkopers en fleet management.

## Functies

- **Live PID-data** — real-time gauges met adaptieve multi-PID batchpolling (CAN)
- **Basic system check & volledige diagnose** — gestructureerde doorloop van sensoren en systemen
- **DTC-uitlezing** — actuele, permanente en freeze-frame foutcodes (mode 03/07/0A/02)
- **Rit-monitor** — passieve achtergrondbewaking tijdens het rijden, in drie lagen:
  - *Monitor* (Laag A): periodieke statuspolling en foutcode-harvesting
  - *Watchers* (Laag B): signaalanalyse op ruwe data (sensor-uitval, bevroren waarden, uitschieters)
  - *Verify* (Laag C): automatische focus-hertest bij verdachte signalen
- **Koopcheck (aankoopinspectie)** — checklist en metingen voor occasion-aankoop
- **Onderdeelaanwijzer** — koppelt foutcodes en live data aan het vermoedelijke defecte onderdeel
- **Caravan-rittracker** — live brandstofcoach met rij-adviezen (op-/afschakelen, cruise, remmen op de motor)
- **Verbindings-wizard** — 6-staps protocoldetectie voor uiteenlopende merken/adapters
- **AI-copilot** — diagnoserapporten gegenereerd via de Anthropic API, met voertuig- en rijcontext
- **Remote diagnose** — een expert kan op afstand meekijken via een sessiecode of QR, zonder zelf Bluetooth nodig te hebben
- **Veldlab (achtergrond)** — elke meetsessie draagt automatisch bij aan referentiewaarden per merk/model/CALID

## Architectuur

| Laag | Technologie |
|---|---|
| Frontend | Statische single-page app (`index.html` + modulaire JS-bestanden), vanilla JS, geen build-stap |
| Backend | Cloudflare Worker (`pidlane-proxy`) — auth, AI-proxy, Airtable-koppeling, remote-sessies |
| Data-opslag | Airtable (config, logs, sessies, referentiewaarden) |
| AI | Anthropic API (Claude) via Cloudflare AI Gateway |
| Bestandsopslag | Cloudflare R2 (APK-distributie) |
| Realtime sessies | Cloudflare Durable Objects (remote diagnose) |
| Android-app | Capacitor, gebouwd via GitHub Actions |

## Projectstructuur

```
index.html               hoofdapp (UI, state, routing)
config.js                publieke instellingen (Worker-URL, versie) — geen geheimen
pidlane.css              hoofd-CSS
pidlane-data.js           statische referentiedata (PIDs, DTC's, kennisbank)
pidlane-assets.js         ingebedde media (base64)
pidlane-bt.js             Bluetooth/Web Serial-koppeling met adapters
pidlane-veldlab.js        veldlab-metingen (achtergrond)
pidlane-archief.js        sessie-/rapportarchief
pidlane-koopcheck.js      aankoopinspectie-module
pidlane-remote.js         remote diagnose (expert-sessies)
pidlane-caravan.js        rittracker / brandstofcoach
pidlane-wizard.js         verbindings-wizard
pidlane-onderdeel.js      onderdeelaanwijzer
pidlane-verify.js         rit-monitor Laag C (focus-hertest)
pidlane-monitor.js        rit-monitor Laag A (foutcode-harvesting)
pidlane-watchers.js       rit-monitor Laag B (signaalanalyse)
worker.js                 Cloudflare Worker: auth, AI-proxy, Airtable, remote-sessies
admin.html                gebruikersbeheer
```

> De marketingsite (`pidlane.nl`) staat in een apart repo (`PidLane-Pitch`).

## Hardware & compatibiliteit

Geteste adapters: **OBDLink MX+** (STN-chipset, Bluetooth Classic SPP) en **Vgate iCar Pro BT 3.0**.

- **Web (Android Chrome):** Web Serial over Bluetooth RFCOMM/SPP (stabiel sinds Chrome 138)
- **Web (iOS/Safari):** Web Serial wordt niet ondersteund
- **Android-APK:** Capacitor Bluetooth Serial-plugin, onafhankelijk van browserondersteuning

## Ontwikkelen & deployen

- **Web-app:** statische bestanden, geen buildstap — direct bewerken en deployen.
- **Worker:** deploy via git push (Cloudflare Workers Builds); geen lokale `wrangler` nodig.
- **APK:** Capacitor + GitHub Actions (`.github/workflows/build-apk.yml`).

## Beveiliging

Login verloopt server-side tegen het Worker-secret `USERS_JSON`; sessies gebruiken HMAC-ondertekende tokens met beperkte geldigheid. Er staat geen vast app-token meer in de client.

## Status

Actief in ontwikkeling als solo-project, momenteel in pilotfase bij een eerste garagebedrijf.

## Eigendom

Propriëtaire software — alle rechten voorbehouden.
