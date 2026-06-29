// ════════════════════════════════════════════════════════════
//  PidLane config.js  —  SECRET-VRIJE VERSIE
//  Geen Anthropic-key, geen Airtable-token: die zitten in de Worker.
//  Veilig om in een publieke repo te hebben.
// ════════════════════════════════════════════════════════════

// ── Beschermlaag (Cloudflare Worker) ─────────────────────────
const PROXY_URL = 'https://pidlane-proxy.newspeedynl.workers.dev';
const APP_TOKEN = 'pl_app_58a5a5966c3a5f9585c9f70111decfe22a40b55b';
const MODEL     = 'claude-haiku-4-5-20251001';

// ── Gebruikers ───────────────────────────────────────────────
// Uitleg per veld:
//   'Inlognaam'  = wat de gebruiker typt om in te loggen (UNIEK, geen spaties → gebruik _)
//   password     = wachtwoord
//   role         = 'admin' (alles + beheer/logs) | 'user' (alles BEHALVE beheer/logs) | 'demo'
//   label        = weergavenaam (mag spaties/hoofdletters, puur cosmetisch)
//
// LET OP: alles wat NIET role:'user' of 'demo' is, wordt als admin behandeld.
//         Geef klanten dus altijd bewust role:'user'.
const USERS = {
  // — Beheer —
  'Admin': { password: '1029384756', role: 'admin', label: 'Admin' },
  'Demo':  { password: 'P!dL@n3',    role: 'demo',  label: 'Demo'  },

  // — Test-gebruikers (rol: user) — vervang gerust namen/wachtwoorden —
  'Garage_Jansen':       { password: 'Test1234!', role: 'user', label: 'Garage Jansen' },
  'Autobedrijf_Pieters': { password: 'Test1234!', role: 'user', label: 'Autobedrijf Pieters' },
  'Occasions_DeVries':   { password: 'Test1234!', role: 'user', label: 'Occasions De Vries' },
  'AutoCentrum_Bakker':  { password: 'Test1234!', role: 'user', label: 'AutoCentrum Bakker' },
  'Garage_Mulder':       { password: 'Test1234!', role: 'user', label: 'Garage Mulder' },
  'Car_Service_Visser':  { password: 'Test1234!', role: 'user', label: 'Car Service Visser' },
  'Autohandel_Smit':     { password: 'Test1234!', role: 'user', label: 'Autohandel Smit' },
  'Garage_DeBoer':       { password: 'Test1234!', role: 'user', label: 'Garage De Boer' },
  'Occasions_Dijkstra':  { password: 'Test1234!', role: 'user', label: 'Occasions Dijkstra' },
  'AutoPlaza_Hendriks':  { password: 'Test1234!', role: 'user', label: 'AutoPlaza Hendriks' }
};

// ── Airtable (via proxy) ─────────────────────────────────────
const AIRTABLE_TOKEN = 'via-proxy';
const AIRTABLE_URL   = PROXY_URL + '/airtable/log';

// ── Auto-update (GitHub Pages) ───────────────────────────────
const APP_VERSION = '2.2';
const GITHUB_USER = 'newspeedynl';
const GITHUB_REPO = 'PidLane';
const VERSION_URL = 'https://newspeedynl.github.io/PidLane/version.json';
const UPDATE_URL  = 'https://newspeedynl.github.io/PidLane/index.html'; 
