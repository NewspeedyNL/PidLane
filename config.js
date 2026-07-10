// ══════════════════════════════════════════════════════
// PidLane config — GEEN plaintext wachtwoorden meer.
// Wachtwoorden staan als SHA-256-hash (passHash).
// Nieuwe hash maken (browser-console):
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('WACHTWOORD'))
//     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')));
// ══════════════════════════════════════════════════════

const APP_VERSION = '2.2';

// LET OP: roteer dit token in Cloudflare (Worker → Settings → Variables and
// Secrets → APP_TOKEN) en zet hier exact dezelfde nieuwe waarde. Het oude
// token stond publiek en moet als gelekt worden beschouwd.
const APP_TOKEN = 'kq!kcAMmP3q3Rvy8^KDP%nwitC$KPp24S@o7Y4L*3y6nNDS!3rwCR6QhcPhL!SPhr7BMimCE$G$UyvL4MWPu*QAy8cu&gvLq34e8eE@aFjS7AN@3vL2Ayqho9V6priyp';

const PROXY_URL = 'https://pidlane-proxy.newspeedynl.workers.dev';

window.USERS = {
  'Admin': {
    passHash: '0233647d3a3a140068f7b11705873d7aaf29bed66724250e279d78f8f0d5ae6c',
    apiKey: '', role: 'admin', label: 'Admin'
  },
  'Demo': {
    // Nog te doen: nieuw Demo-wachtwoord kiezen en de hash hier plakken.
    // Zolang passHash leeg is, kan Demo niet inloggen (bewust veilig default).
    passHash: '',
    apiKey: '', role: 'demo', label: 'Demo'
  }
  // Testaccounts (bv. Van Meel) op dezelfde manier: alleen passHash, geen password.
};
 
