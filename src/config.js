// ════════════════════════════════════════
// PidLane — config.js
// DIT IS HET ENIGE BESTAND DAT JE AANPAST
// ════════════════════════════════════════

// ── BLUETOOTH ADAPTER (optioneel maar aanbevolen) ──
// Vul het MAC adres in voor directe verbinding zonder scan
const OBDLINK_ADDRESS = '00:04:3E:8B:7B:32';  // OBDLink MX+ 90011
const OBDLINK_NAME    = 'OBDLink MX+ 90011';

// ── LOGIN ACCOUNTS ──
const USERS = {
  'Admin': {
    password: '1029384756',
    apiKey:   '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',  // ← Vervang door sk-ant-api03-...
    role:     'admin',
    label:    'Admin'
  },
  'Demo': {
    password: 'P!dL@n3',
    apiKey:   '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',   // ← Optioneel aparte demo API key
    role:     'demo',
    label:    'Demo gebruiker'
  }
};

// ── AIRTABLE LOGGING ──
const AIRTABLE_TOKEN = 'patXZNmjzWMK2zTxx.1f347f02fa720e690e7f4be48a65798d992eeefcc69b8eeeabbf461647a80a16';
const AIRTABLE_BASE  = 'appmj3M4r0AFhObjs';
const AIRTABLE_TABLE = 'tbl2AUw6V0Gy5YbRC';
const AIRTABLE_URL   = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`;

// ── APP VERSIE & AUTO-UPDATE ──
const APP_VERSION = '2.1';
const GITHUB_USER = 'NewspeedyNL';
const GITHUB_REPO = 'PidLane';
// version.json staat in de ROOT van de repo (niet in /src)
const VERSION_URL = `https://${GITHUB_USER}.github.io/${GITHUB_REPO}/version.json`;
const UPDATE_URL  = `https://${GITHUB_USER}.github.io/${GITHUB_REPO}/index.html`;




