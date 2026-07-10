// ════════════════════════════════════════════════════════════
// PidLane config.js
// Build: 2.2
// Geen secrets in frontend
// Anthropic- en Airtable-tokens zitten in Cloudflare Worker
// ════════════════════════════════════════════════════════════

// ── Cloudflare Worker ──────────────────────────────────────
const PROXY_URL = 'https://pidlane-proxy.newspeedynl.workers.dev';
const APP_TOKEN = 'kq!kcAMmP3q3Rvy8^KDP%nwitC$KPp24S@o7Y4L*3y6nNDS!3rwCR6QhcPhL!SPhr7BMimCE$G$UyvL4MWPu*QAy8cu&gvLq34e8eE@aFjS7AN@3vL2Ayqho9V6priyp';

// Claude model
const MODEL = 'claude-haiku-4-5-20251001';

// ── Worker API Endpoints ───────────────────────────────────
const AIRTABLE_TOKEN = 'via-proxy';

const AIRTABLE_URL =
    PROXY_URL + '/airtable/log';

const VELDLAB_ENDPOINT =
    PROXY_URL + '/airtable/veldlab';

const CONFIG_ENDPOINT =
    PROXY_URL + '/api/config';

const AI_ENDPOINT =
    PROXY_URL + '/v1/messages';

const PROXY_ENDPOINT =
    PROXY_URL + '/proxy';

// ── Auto Update ────────────────────────────────────────────
const APP_VERSION = '2.2';

const GITHUB_USER = 'newspeedynl';
const GITHUB_REPO = 'PidLane';

const VERSION_URL =
    'https://newspeedynl.github.io/PidLane/version.json';

const UPDATE_URL =
    'https://newspeedynl.github.io/PidLane/index.html';

// ── Gebruikers ─────────────────────────────────────────────
const USERS = {

    Admin: {
        password: '1029384756',
        role: 'admin',
        label: 'Admin'
    },

    Demo: {
        password: 'P!dL@n3',
        role: 'demo',
        label: 'Demo'
    },

    Garage_Jansen: {
        password: 'Test1234!',
        role: 'user',
        label: 'Garage Jansen'
    },

    Autobedrijf_Pieters: {
        password: 'Test1234!',
        role: 'user',
        label: 'Autobedrijf Pieters'
    },

    Occasions_DeVries: {
        password: 'Test1234!',
        role: 'user',
        label: 'Occasions De Vries'
    },

    AutoCentrum_Bakker: {
        password: 'Test1234!',
        role: 'user',
        label: 'AutoCentrum Bakker'
    },

    Garage_Mulder: {
        password: 'Test1234!',
        role: 'user',
        label: 'Garage Mulder'
    },

    Car_Service_Visser: {
        password: 'Test1234!',
        role: 'user',
        label: 'Car Service Visser'
    },

    Autohandel_Smit: {
        password: 'Test1234!',
        role: 'user',
        label: 'Autohandel Smit'
    },

    Garage_DeBoer: {
        password: 'Test1234!',
        role: 'user',
        label: 'Garage De Boer'
    },

    Occasions_Dijkstra: {
        password: 'Test1234!',
        role: 'user',
        label: 'Occasions Dijkstra'
    },

    AutoPlaza_Hendriks: {
        password: 'Test1234!',
        role: 'user',
        label: 'AutoPlaza Hendriks'
    }

};

// ── Headers voor Worker-calls ─────────────────────────────
const API_HEADERS = {
    'Content-Type': 'application/json',
    'X-App-Token': APP_TOKEN
};

// ── Helpers ────────────────────────────────────────────────
function getApiHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-App-Token': APP_TOKEN
    };
}

function isAdmin(user) {
    return USERS[user] && USERS[user].role === 'admin';
}

function isDemo(user) {
    return USERS[user] && USERS[user].role === 'demo';
}

function isUser(user) {
    return USERS[user] && USERS[user].role === 'user';
}

// ════════════════════════════════════════════════════════════
// Einde config.js
// ════════════════════════════════════════════════════════════
