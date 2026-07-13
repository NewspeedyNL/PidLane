/* ══════════════════════════════════════════════════════════════════
   PidLane — config.js  (PUBLIEK — mag gewoon in de GitHub-repo)

   Hier staat GEEN enkel geheim meer:
   • geen APP_TOKEN      → komt bij login van de Worker (sessietoken)
   • geen wachtwoorden   → Worker-secret USERS_JSON
   • geen wachtwoordhash → idem
   • geen Anthropic-key  → Worker-secret ANTHROPIC_API_KEY
   • geen Airtable-token → Worker-secret AIRTABLE_TOKEN

   Alles hieronder is informatie die de browser toch al prijsgeeft
   (endpoints, versienummer, reponaam). Publiek = geen probleem.
   ══════════════════════════════════════════════════════════════════ */

/* ── Versie & updates ────────────────────────────────────────────── */
const APP_VERSION = '2.7.0';
const GITHUB_USER = 'newspeedynl';
const GITHUB_REPO = 'PidLane';
const VERSION_URL = 'https://newspeedynl.github.io/PidLane/version.json';
const UPDATE_URL  = 'https://newspeedynl.github.io/PidLane/';

/* ── Cloudflare Worker proxy ─────────────────────────────────────── */
/* Alle geheimen zitten server-side in deze Worker.                   */
const PROXY_URL = 'https://pidlane-proxy.newspeedynl.workers.dev';

/* Afgeleide routes — laat staan, ze volgen automatisch de PROXY_URL. */
const AIRTABLE_URL      = PROXY_URL + '/airtable/log';
const VELDLAB_ENDPOINT  = PROXY_URL + '/airtable/veldlab';

/* ── Lokaal noodaccount ──────────────────────────────────────────── */
/* Werkt alleen offline / als de Worker onbereikbaar is. Demo heeft geen
   toegang tot AI, RDW of Airtable (die lopen allemaal via de Worker en
   vereisen een geldig sessietoken). Wachtwoord: demo                   */
const USERS = {
  'Demo': {
    passHash: '2a97516c354b68848cdbd8f54a226a0a55b21ed138e207ad6c5cbb9c00aa5aea',
    apiKey  : '',
    role    : 'demo',
    label   : 'Demo'
  }
};

/* Beschikbaar maken voor index.html (die leest window.*). */
try{
  window.APP_VERSION      = APP_VERSION;
  window.GITHUB_USER      = GITHUB_USER;
  window.GITHUB_REPO      = GITHUB_REPO;
  window.VERSION_URL      = VERSION_URL;
  window.UPDATE_URL       = UPDATE_URL;
  window.PROXY_URL        = PROXY_URL;
  window.AIRTABLE_URL     = AIRTABLE_URL;
  window.VELDLAB_ENDPOINT = VELDLAB_ENDPOINT;
  window.USERS            = USERS;
}catch(e){}
