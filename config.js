// ════════════════════════════════════════════════════════════
//  PidLane config.js  —  SECRET-VRIJE VERSIE
//  Veilig om in een publieke repo te hebben: bevat GEEN Anthropic
//  key en GEEN Airtable-token meer. Die zitten nu in de Worker.
// ════════════════════════════════════════════════════════════

// ── Beschermlaag (Cloudflare Worker) ─────────────────────────
// Alle AI- en Airtable-calls lopen hierlangs.
const PROXY_URL = 'https://pidlane-proxy.newspeedynl.workers.dev';

// Publiek gate-token dat de app meestuurt (header X-App-Token).
// Geen waardevolle sleutel; in de Worker intrekbaar.
const APP_TOKEN = 'pl_app_58a5a5966c3a5f9585c9f70111decfe22a40b55b';

// Standaard model — hier bumpen i.p.v. in index.html.
const MODEL = 'claude-haiku-4-5-20251001';

// ── Login ────────────────────────────────────────────────────
// LET OP: geen apiKey-velden meer. Wachtwoorden zijn nu alleen nog
// een login-gate. Heb je in je huidige config.js MEER gebruikers
// dan Admin/Demo? Voeg die hier dan ook toe (zonder apiKey-veld).
const USERS = {
  'Admin': { password: '1029384756', role: 'admin', label: 'Admin' },
  'Demo':  { password: 'P!dL@n3',    role: 'demo',  label: 'Demo'  }
};

// ── Airtable (via proxy) ─────────────────────────────────────
// Geen token hier. De app post naar de Worker; die plakt de echte
// Authorization-header erop. AIRTABLE_TOKEN op een niet-lege
// placeholder zodat de bestaande "is geconfigureerd"-check slaagt.
const AIRTABLE_TOKEN = 'via-proxy';
const AIRTABLE_URL   = PROXY_URL + '/airtable/log';

// ── Auto-update (GitHub Pages) ───────────────────────────────
const APP_VERSION = '2.1';
const GITHUB_USER = 'newspeedynl';
const GITHUB_REPO = 'PidLane';
const VERSION_URL = 'https://newspeedynl.github.io/PidLane/version.json';
const UPDATE_URL  = 'https://newspeedynl.github.io/PidLane/index.html';
const GITHUB_REPO = 'PidLane';
const VERSION_URL = 'https://newspeedynl.github.io/PidLane/version.json';
const UPDATE_URL  = 'https://newspeedynl.github.io/PidLane/index.html';// version.json staat in de ROOT van de repo (niet in /src)
const VERSION_URL = `https://${GITHUB_USER}.github.io/${GITHUB_REPO}/version.json`;
const UPDATE_URL  = `https://${GITHUB_USER}.github.io/${GITHUB_REPO}/index.html`; 
