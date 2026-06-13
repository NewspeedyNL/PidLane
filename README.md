# PidLane

**De auto praat. Wij vertalen.**

PidLane is een AI-gestuurde OBD2-diagnosetool die via de OBD2-poort van een voertuig
een compleet, begrijpelijk voertuigrapport maakt — bedoeld voor autobedrijven,
occasionhandel en inkoop/inruil. De app draait als web-app (PWA) en als Android-APK
(Capacitor), en verbindt met ELM327/STN-adapters via Bluetooth.

🌐 [www.pidlane.nl](https://www.pidlane.nl) · ✉️ info@pidlane.nl

---

## Wat het doet

- **Koopcheck (2 min)** — snelle technische check voor aankoop of inruil. In twee
  minuten rijden een onderbouwd go/no-go met rapport. Dit is de primaire flow voor
  verkoop en inkoop.
- **Uitgebreide check (10 min)** — volledige rit-analyse over meer fases voor een diep
  beeld (motor & vermogen, brandstof & emissie, temperatuur, accu, rijgedrag, correlaties).
- **AI-diagnose op klacht** — beschrijf het symptoom; de AI zoekt de waarschijnlijke
  oorzaak en bewijst die met live PID-data.
- **Algemene voertuigcheck** — groen/oranje/rood conditieoverzicht.
- **Foutcodes (DTC) scannen** en uitleggen.
- **Specifieke PID-data** live uitlezen, plus een neon-HUD dashboard.
- **Brandstofbesparingsanalyse.**
- **PDF-rapport** dat de klant mee naar huis krijgt (delen/opslaan via Android).

---

## Techniek

- **Front-end:** één `index.html` (web-app/PWA), plus `index-desktop.html` voor desktop.
- **Native shell:** [Capacitor](https://capacitorjs.com/) 6 → Android-APK.
- **Bluetooth (cascade, valt automatisch terug):**
  1. **SPP / Bluetooth Classic** — `@e-is/capacitor-bluetooth-serial` (o.a. OBDLink MX+)
  2. **BLE** — `@capacitor-community/bluetooth-le` (ELM327-klonen, Vgate, e.d.)
  3. **Web Bluetooth** — in de browser
- **Opslaan/delen:** `@capacitor/filesystem` + `@capacitor/share`.
- **AI:** Anthropic API (optionele eigen key; lokaal opgeslagen).
- **Live laden:** de APK laadt de web-app van GitHub Pages
  (`server.url` in `capacitor.config.json`), zodat front-end-updates verschijnen zonder
  nieuwe APK. Wijzigingen aan plugins, permissies of icoon vereisen wél een nieuwe build.

---

## Projectstructuur

```
PidLane/
├─ index.html                     # web-app die GitHub Pages serveert (door APK geladen)
├─ src/
│  ├─ index.html                  # webDir-bundel (Capacitor)
│  ├─ index-desktop.html          # desktop-variant
│  ├─ config.js                   # adapterconfig (o.a. bekend MAC-adres)
│  └─ version.json                # versie voor auto-update-melding
├─ capacitor.config.json          # appId, webDir, server.url, plugin-strings
├─ package.json                   # dependencies (Capacitor + plugins)
├─ version.json
└─ .github/workflows/build-apk.yml # CI: bouwt de APK + injecteert permissies + icoon
```

> Let op de twee `index.html`-bestanden: de **root** wordt door GitHub Pages geserveerd
> (en dus door de APK geladen via `server.url`); `src/index.html` is de Capacitor-webDir.
> Houd ze in sync.

---

## Bouwen (APK)

De APK wordt automatisch gebouwd door GitHub Actions bij elke push naar `main`
(of handmatig via *workflow_dispatch*). De workflow:

1. installeert dependencies (`npm install --legacy-peer-deps`),
2. voegt het Android-platform toe en synct de web-assets,
3. **injecteert de Bluetooth-permissies** in `AndroidManifest.xml`
   (Android 12+: `BLUETOOTH_SCAN` met `neverForLocation` + `BLUETOOTH_CONNECT`;
   Android ≤ 11: klassieke BT + `ACCESS_FINE_LOCATION`),
4. **genereert het app-icoon** uit het PidLane-logo (alle dichtheden + adaptive icon),
5. bouwt de debug-APK en uploadt die als artifact.

De gebouwde APK staat onder *Actions → laatste run → Artifacts → `PidLane-debug`*.

---

## Bluetooth & permissies

De BLE-laag initialiseert met `androidNeverForLocation: true`; dat hoort één-op-één bij
de `neverForLocation`-vlag die de workflow in het manifest zet. Pas je het één aan, pas
dan ook het ander aan.

Voor SPP/Classic verbindt PidLane bij voorkeur op een **bekend, gekoppeld** MAC-adres
(`config.js`), zodat geen device-discovery — en dus geen locatie-permissie — nodig is.
Koppel de adapter daarom eenmalig via de Android Bluetooth-instellingen.

De ingebouwde **📡 Log** (met kopieerknop) dumpt platform, Android-versie en het gekozen
transport — handig voor diagnose bij verbindingsproblemen.

---

## Adapters

Getest met OBDLink MX+ (SPP) en diverse ELM327-BLE-klonen. De BLE-scan herkent zowel
`fff0`- als `ffe0`-services en kiest de adapter met het sterkste signaal.

---

## Roadmap

- [ ] Koopcheck prominenter en sneller in beeld in de hoofd-flow.
- [ ] Demo-rapport (PDF) op maat voor onafhankelijke occasionhandel.
- [ ] Verbindingsbetrouwbaarheid breder testen op oudere toestellen/tablets.
- [ ] Uitbreiding naar extra branches na validatie van de beachhead-markt.

---

## Licentie & eigendom

© PidLane / NewspeedyNL. Alle rechten voorbehouden. Niet voor herdistributie zonder
toestemming.
