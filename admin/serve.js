// ══════════════════════════════════════════════════════════════════
// admin/serve.js — de adminpagina lokaal serveren
// ──────────────────────────────────────────────────────────────────
// WAAROM DIT BESTAAT
// `npm run admin` draaide op `python3 -m http.server`. Dat werkt, maar het
// voegt een afhankelijkheid toe die dit project verder nergens heeft: node is
// er sowieso (de hele testreeks draait erop), python3 niet per se. Op een kaal
// Windows-toestel of een verse Termux is python3 er meestal níét, en dan is het
// eerste wat je bij het beheer tegenkomt een installatieprobleem in plaats van
// de pagina.
//
// WAAROM NIET GEWOON DUBBELKLIKKEN
// Dan is de herkomst `file://` en stuurt de browser `Origin: null`. De Worker
// weigert dat, en het foutbeeld ("Failed to fetch") lijkt sprekend op een
// geweigerde token — terwijl je token nooit is meegekeken. Zie admin/LEESMIJ.md.
// Daarom moet er iets serveren, hoe klein ook. Dit is dat kleine ding.
//
// Alleen loopback: hij bindt bewust op 127.0.0.1 en niet op 0.0.0.0. De
// adminpagina hoort niet op je wifi te staan, ook niet even.
//
// Draaien:  npm run admin      → http://127.0.0.1:8788/admin.html
//           PORT=9000 npm run admin   voor een andere poort
// ══════════════════════════════════════════════════════════════════
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const MAP = __dirname;
const POORT = Number(process.env.PORT || 8788);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

const srv = http.createServer(function (req, res) {
  let pad = decodeURIComponent(String(req.url || '/').split('?')[0]);
  if (pad === '/' || pad === '') pad = '/admin.html';

  // Buiten de map komen we niet: resolve() lost ../ op, en daarna moet het
  // resultaat nog steeds binnen MAP liggen. Zonder deze regel is elke
  // ../-reeks in de URL genoeg om de hele schijf uit te serveren.
  const doel = path.resolve(MAP, '.' + pad);
  if (doel !== MAP && !doel.startsWith(MAP + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 — buiten de adminmap');
    return;
  }

  fs.readFile(doel, function (err, body) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — niet gevonden: ' + pad);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(doel).toLowerCase()] || 'application/octet-stream',
      // Geen caching: bij het beheer wil je zien wat er nú in het bestand
      // staat. "Niet geladen" is in dit project al twee keer de HTTP-cache
      // geweest — zie CLAUDE.md.
      'Cache-Control': 'no-store'
    });
    res.end(body);
  });
});

srv.on('error', function (e) {
  if (e && e.code === 'EADDRINUSE') {
    console.error('Poort ' + POORT + ' is bezet. Draait er al een adminserver?');
    console.error('Anders: PORT=9000 npm run admin');
  } else {
    console.error('Serveren mislukt:', e && e.message || e);
  }
  process.exit(1);
});

srv.listen(POORT, '127.0.0.1', function () {
  console.log('');
  console.log('  PidLane Admin draait op:');
  console.log('    http://127.0.0.1:' + POORT + '/admin.html');
  console.log('');
  console.log('  Alleen op dit toestel bereikbaar. Stoppen met Ctrl-C.');
  console.log('');
});
