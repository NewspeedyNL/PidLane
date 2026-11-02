// render.js — zet schermen.html en grafiek.html om in de PNG's voor de Play Console.
// node marketing/play/render.js   → marketing/play/uit/
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const UIT = path.join(__dirname, 'uit');
(async () => {
  fs.mkdirSync(UIT, { recursive: true });
  const b = await chromium.launch();
  const maak = async (bestand, w, h, doel) => {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto('file://' + path.join(__dirname, bestand));
    await p.waitForFunction(() => document.body.dataset.klaar === '1' || !document.querySelector('.scherm'), null, { timeout: 5000 }).catch(() => console.log('  LET OP ' + doel + ': niet alle beelden geladen'));
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(UIT, doel) });
    await p.close(); console.log('  ' + doel);
  };
  await maak('schermen.html?n=1', 1920, 1080, '1-hyperlane.png');
  const namen = ['', '', '2-meekijken', '3-foutcodes', '4-standen', '5-slim', '6-grafiek', '7-accu', '8-ik-wil'];
  for (let n = 2; n <= 8; n++) await maak('schermen.html?n=' + n, 1080, 1920, namen[n] + '.png');
  if (fs.existsSync(path.join(__dirname, 'grafiek.html'))) await maak('grafiek.html', 1024, 500, 'feature-graphic.png');
  await b.close();
})();
