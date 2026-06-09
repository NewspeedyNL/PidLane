// ════════════════════════════════════════
// PidLane — config.js
// ════════════════════════════════════════
// Dit is het ENIGE bestand dat je hoeft aan te passen.
// index.html nooit meer aanraken voor credentials.
// ════════════════════════════════════════

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
    apiKey:   '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',   // ← Optioneel: aparte demo API key
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
const VERSION_URL = `https://${GITHUB_USER}.github.io/${GITHUB_REPO}/version.json`;
const UPDATE_URL  = `https://${GITHUB_USER}.github.io/${GITHUB_REPO}/index.html`;
