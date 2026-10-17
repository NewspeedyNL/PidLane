// ══════════════════════════════════════════════════════════════════
// test-assetlinks.js — Android App Links voor app.pidlane.nl
// ──────────────────────────────────────────────────────────────────
// Android haalt https://app.pidlane.nl/.well-known/assetlinks.json op
// (autoVerify in het manifest). Gaat één van deze punten stil mis, dan
// openen links gewoon in Chrome en merk je het pas op een telefoon.
// ══════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PUB = __dirname;
const ROOT = path.join(PUB, '..');
let fout = 0;
const ok = m => console.log('  ok    ' + m);
const faal = m => { console.log('  FOUT  ' + m); fout++; };

const BESTAND = path.join(PUB, '.well-known', 'assetlinks.json');
let links = null;
try { links = JSON.parse(fs.readFileSync(BESTAND, 'utf8')); ok('assetlinks.json is geldige JSON'); }
catch (e) { faal('assetlinks.json ontbreekt of is geen JSON: ' + e.message); }

const appId = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8')).appId;
if (Array.isArray(links)) {
  const t = links.find(l => l && l.target && l.target.namespace === 'android_app' &&
    (l.relation || []).includes('delegate_permission/common.handle_all_urls'));
  if (!t) faal('geen android_app-regel met handle_all_urls');
  else {
    if (t.target.package_name === appId) ok('package_name = ' + appId);
    else faal('package_name ' + t.target.package_name + ' ≠ appId ' + appId);
    const fp = t.target.sha256_cert_fingerprints || [];
    const fmt = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
    if (fp.length && fp.every(f => fmt.test(f))) ok(fp.length + ' SHA-256-vingerafdruk(ken) in het juiste formaat');
    else faal('vingerafdruk ontbreekt of is niet 32 bytes AA:BB:…-hex');
  }
} else if (links) faal('assetlinks.json moet een array zijn');

// Wordt geüpload: niet onder .assetsignore
try {
  execFileSync('git', ['-c', 'core.excludesFile=' + path.join(PUB, '.assetsignore'),
    'check-ignore', '--no-index', '--', '.well-known/assetlinks.json'], { cwd: PUB });
  faal('.assetsignore houdt assetlinks.json tegen');
} catch (e) {
  if (e.status === 1) ok('assetlinks.json wordt geüpload');
  else faal('git check-ignore faalde: ' + e.message);
}

// Statisch geserveerd: niet via de Worker
const wr = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
const rwf = (wr.match(/run_worker_first\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1];
if (/\.well-known|"\/\*"/.test(rwf)) faal('run_worker_first vangt /.well-known af');
else ok('/.well-known wordt statisch geserveerd');

// Manifest krijgt de intent-filter
const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'build-apk.yml'), 'utf8');
if (/android:autoVerify="true"/.test(wf) && /android:host="app\.pidlane\.nl"/.test(wf)) ok('build-apk.yml injecteert de App Links-intent-filter');
else faal('build-apk.yml mist autoVerify/host app.pidlane.nl');

if (fout) { console.log('\n' + fout + ' fout(en)'); process.exit(1); }
console.log('\nalles groen');
