# PidLane 🚗

AI-gestuurde OBD2 auto diagnostics app — Android APK via Capacitor.

## Project structuur

```
src/
├── index.html          ← HTML structuur
├── css/
│   ├── theme.css       ← kleuren, dark/light
│   ├── layout.css      ← topbar, sidebars, grid
│   ├── components.css  ← gauges, cards, buttons
│   └── dashboard.css   ← neon dashboard stijlen
└── js/
    ├── config.js       ← API key, PID database, constanten
    ├── logging.js      ← lokale log + Google Sheets
    ├── bluetooth.js    ← BLE verbinding, netwerk scan, VIN
    ├── data.js         ← 3-laags validatie, poll loop, datalog
    ├── ai.js           ← Anthropic API, rit analyse AI
    ├── diagnosis.js    ← slimme diagnose flow
    ├── ui.js           ← gauges, grafieken, neon dashboard
    └── main.js         ← INIT, event listeners
```

## Aanpassen per bestand

| Wat aanpassen | Bestand |
|---|---|
| API key | `js/config.js` → `DEMO_API_KEY` |
| Google Sheets URL | `js/config.js` → `SHEETS_LOG_URL` |
| PID definities | `js/config.js` → `ALL_PID_DEFS` |
| Bluetooth verbinding | `js/bluetooth.js` |
| Data validatie | `js/data.js` → `validateAndSmooth()` |
| AI prompts | `js/ai.js` → `runQuickAI()`, `runDatalogAI()` |
| Diagnose flow | `js/diagnosis.js` |
| Kleuren/thema | `css/theme.css` |

## APK bouwen

### Automatisch via GitHub Actions
1. Push naar `main` branch
2. GitHub bouwt automatisch een APK
3. Download via Actions → Artifacts

### Handmatig
```bash
npm install
npx cap add android
npx cap sync android
npx cap open android  # Android Studio
```

## Google Sheets logging instellen

1. Ga naar [script.google.com](https://script.google.com)
2. Nieuw project → plak dit:

```javascript
function doPost(e){
  var sheet = SpreadsheetApp.openById('JOUW_SHEET_ID').getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([
    data.timestamp, data.type, data.message,
    data.merk, data.year, data.vin,
    data.protocol, data.activePIDs
  ]);
  return ContentService.createTextOutput('ok');
}
```

3. Implementeren → Als webapp → Iedereen toegang
4. Kopieer URL → plak in `js/config.js` bij `SHEETS_LOG_URL`

## Vgate MX+ verbinden

De app ondersteunt zowel Capacitor BLE (APK) als Web Bluetooth (Chrome).

**BLE UUIDs Vgate MX+:**
- Service: `0000fff0-0000-1000-8000-00805f9b34fb`
- Write:   `0000fff2-0000-1000-8000-00805f9b34fb`
- Notify:  `0000fff1-0000-1000-8000-00805f9b34fb`

**Tip:** Als verbinden niet lukt, verwijder de adapter eerst uit Android Bluetooth instellingen en probeer opnieuw.

---
© 2025 PidLane — Alle rechten voorbehouden
