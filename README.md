# PidLane 🚗⚡

**Your car talks. We translate.**

PidLane is een AI-gestuurde OBD2 auto diagnostics app voor Android. Verbind via Bluetooth met een OBD2 adapter en krijg real-time sensordata, AI-diagnoses, DTC foutcode uitleg, rit analyses en brandstofbesparingstips.

---

## 📱 Features

- **Live dashboard** — real-time gauges van alle beschikbare sensoren
- **AI Diagnose** — beschrijf een probleem, AI vindt de meest voorkomende oorzaak en bewijst het via live PID data
- **Voertuigcheck** — groen/oranje/rood per systeem
- **DTC foutcodes** — uitlezen, uitleg en wissen
- **Rit Analyse** — rijd 10 minuten, krijg een volledig rapport per fase
- **Brandstofbesparing** — meet hoeveel jij per jaar kunt besparen
- **Neon Dashboard** — fullscreen ronde meters
- **Auto-update** — app update zichzelf via GitHub Pages
- **Airtable logging** — errors en outliers automatisch gelogd
- **Demo modus** — Mazda CX-5 2018 simulatie zonder adapter

---

## 🔌 Ondersteunde adapters

| Adapter | Protocol | Status |
|---|---|---|
| OBDLink MX+ | Bluetooth Classic SPP | ✅ Primair |
| Vgate MX+ | BLE (fff0/fff1/fff2) | ✅ Ondersteund |
| Andere ELM327 | BLE of SPP | ✅ Automatisch |

---

## 🚀 Installatie APK

1. Download de APK uit **Actions → Artifacts → PidLane-debug**
2. Installeer op Android (Instellingen → Onbekende bronnen → toestaan)
3. **Eenmalig:** koppel OBDLink MX+ via Android Bluetooth instellingen
4. Open PidLane → inloggen → Verbinden

---

## ⚙️ Configuratie

Pas **alleen** `src/config.js` aan — nooit `index.html`.

```javascript
// src/config.js

const USERS = {
  'Admin': {
    password: 'jouw_wachtwoord',
    apiKey:   'sk-ant-api03-...',   // ← Anthropic API key
    role:     'admin',
  },
  'Demo': {
    password: 'demo_wachtwoord',
    apiKey:   '',                   // ← Optioneel aparte demo key
    role:     'demo',
  }
};

const APP_VERSION = '2.1';          // ← Verhoog bij elke update
```

---

## 🔄 Update uitrollen

1. Pas `src/index.html` aan
2. Verhoog `APP_VERSION` in `src/config.js`
3. Commit → GitHub Actions bouwt automatisch nieuwe APK
4. Gebruikers zien update-banner bij volgende start → 1 tik om te updaten

---

## 📁 Projectstructuur

```
src/
├── index.html          ← App (HTML/CSS/JS — niet aanpassen voor config)
├── config.js           ← Credentials, API keys, versie ← ALLEEN DIT AANPASSEN
└── version.json        ← {"version":"2.1"} — voor auto-update check

.github/
└── workflows/
    └── build-apk.yml   ← Automatische APK build bij push naar main

capacitor.config.json   ← App ID: app.pidlane.obd
package.json            ← Dependencies
```

---

## 🤖 AI Setup

Maak een gratis Anthropic API key aan via [console.anthropic.com](https://console.anthropic.com/settings/keys) ($5 gratis tegoed).

Vul de key in `src/config.js` bij het Admin account.

---

## 📊 Airtable Logging

Errors, outliers en verbindingsgebeurtenissen worden automatisch gelogd naar Airtable.

Base ID en token staan in `src/config.js`.

---

## 🔑 Login accounts

| Account | Rol | Toegang |
|---|---|---|
| Admin | admin | Volledige toegang + eigen API key |
| Demo | demo | Beperkt — voor presentaties |

---

## 📋 GitHub Pages (auto-update)

Activeer GitHub Pages in je repo:
**Settings → Pages → Source: main branch / src folder**

Dan is `NewspeedyNL.github.io/PidLane/version.json` beschikbaar voor de update check.

---

## 🛠️ Lokaal bouwen

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android   # Android Studio
```

Of push naar `main` — GitHub Actions bouwt automatisch.

---

## 📄 Licentie

© 2025 PidLane / Newspeedy. Alle rechten voorbehouden.

---

*PidLane — Your car talks. We translate.*
