# SPP-plugin 8.0.1 — het origineel, als proefmateriaal (#352)

Dit zijn twee bestanden uit `@ascentio-it/capacitor-bluetooth-serial` 8.0.1,
ongewijzigd, met de MIT-licentie van het pakket ernaast.

Ze staan hier alleen voor `public/test-spppatch.js`: die voert `plspppatch.js`
uit op precies deze bestanden, zonder `npm install`. De APK wordt er niet mee
gebouwd — daar patcht `build-apk.yml` de kopie in `node_modules`.

De injectiestap in `build-apk.yml` kopieert alleen `native/*.java`, niet deze
submap. Verandert `package.json` van versie, dan horen deze twee bestanden mee
te veranderen; `test-spppatch.js` bewaakt dat de versies gelijk zijn.
