# PidLane — wijzigingen sessie 2026-08-02

Basis: `PidLane-main__19_.zip`. Paden in deze zip komen overeen met de repo,
dus uitpakken over `PidLane-main/` heen en committen.

Validatie op het geheel: 56 JS-bestanden `node --check` schoon,
div 780/780, `<button>` 131/131, CSS-accolades 1040/1040, 11/11 tests groen.

---

## Nieuw (5)

| Bestand | Wat |
|---|---|
| `public/pidlane-uitgebreid.js` | `PLUitgebreid` — fabrikant-PIDs buiten mode 01. `pidCmd()` / `pidMode()` / `isMode01()`, vier Mazda mode-21-definities met parse-functies, probe na verbinden. |
| `public/pidlane-rondgang.js` | `PLRondgang` — vierde live-weergave. Roteert elke 100 s door de sensorcategorieën; basis blijft staan. |
| `public/test-mode21.js` | 20 toetsen: mode-01 blijft byte-identiek, mode 21 gaat niet meer naar mode 01, responseheaders, batchfilter, pollinterval. |
| `public/test-healthgate.js` | 20 toetsen: oordeel uit profiel, afbreken halverwege, wanneer er gevraagd wordt, wanneer het profiel wordt bijgewerkt. |
| `public/test-rondgang.js` | 19 toetsen: categorieselectie, alias, tekst-PID-filter, splitsen bij grote categorie, volgorde, rondlopen. |

Nieuwe testbestanden draaien met `node public/test-<naam>.js` en geven exitcode 1 bij een fout.

---

## Gewijzigd (15)

### Mode-01-bug — 10 plekken

`'01' + pid.slice(2)` was hardcoded. Een sleutel als `'2101'` werd daardoor
stilzwijgend `'0101'`: geen foutmelding, gewoon het verkeerde antwoord,
netjes geparsed en getoond. Alle tien nu via `pidCmd()`, met de oude
uitdrukking als fallback zodat er geen laadvolgorde-afhankelijkheid ontstaat.

| Bestand | Plek |
|---|---|
| `public/pidlane-plload.js` | pollus: batch-filter op mode 01, 2× solo-request, `pidPollInterval()` erft geen suffix meer |
| `public/pidlane-rijsituatie.js` | `initialHealthScan()` |
| `public/pidlane-veldlab.js` | Full survey, 2× |
| `public/pidlane-verify.js` | focusverificatie |
| `public/pidlane-rit.js` | rit-sweep |
| `public/pidlane-diagnose.js` | diagnose-uitlezing |
| `public/pidlane-fuel.js` | brandstofmeting |

### Gezondheidscheck: bevestiging + afbreekbaar

| Bestand | Wat |
|---|---|
| `public/pidlane-bt.js` | Bij bekend voertuig eerst `plBevestig()`: overslaan of toch scannen. Pill krijgt annuleerfunctie. Profiel wordt nu ook opgeslagen na een verse scan op een profiel-start (was bevroren na de eerste keer). Probe-aanroep voor fabrikant-PIDs na `showWelcome()`. |
| `public/pidlane-theme.js` | `showBusyPill(txt, ms, onAnnuleer)` — derde parameter optioneel, oude aanroepen ongewijzigd. Nieuw: `plBevestig()`, ja/nee-modaal met Promise, bouwt eigen DOM. |
| `public/pidlane-pids.js` | `saveVinProfile()` bewaart `health`; `applyVinProfileIfKnown()` parkeert het in `_profielHealth`, opvraagbaar via `profielHealth()`. |
| `public/pidlane-rijsituatie.js` | `_healthAbort` + `healthScanAfbreken()`; `healthUitProfiel()` neemt oordeel over; afgebroken scan zet ongemeten PIDs op `ok` i.p.v. ze te laten vallen. |

### Rondgang

| Bestand | Wat |
|---|---|
| `public/index.html` | Knop `🔄 Rondgang` in de weergaveschakelaar; script-tags voor `pidlane-uitgebreid.js` en `pidlane-rondgang.js`. |
| `public/pidlane.css` | `#busyPillX`, `.plBevestig*`, `#rondgangBar` + knoppen. |

### Overig

| Bestand | Wat |
|---|---|
| `public/pidlane-bulk.js` | Vier globale botsingen weg: `S`→`_blkS`, `nu`→`_blkNu`, `chipMaak`→`_blkChipMaak`, `el`→`_blkEl` (129 plekken). Roundtrip-geverifieerd: terugvertalen geeft byte-identiek het origineel. **Nog steeds niet in `index.html` geladen** — dat is bewust. |
| `public/pidlane-data.js` | `PIDS_EXTRA` gemarkeerd als vervangen door `UITGEBREID_DEFS`; wordt nergens gelezen. |
| `PIDLANE.md` | Modules 42 en 43 toegevoegd; `pidlane-bulk.js` als "niet geladen" gedocumenteerd. |

---

## Wat nog open staat

1. **Schaling van `2102` / `210C` / `210D` is ongeverifieerd.** Ze staan als
   `raw` met `onzeker:true` in categorie Overig, zodat `pidGate('duidbaar')`
   ze uit rapporten en AI-analyse houdt. De probe logt de rauwe bytes; één
   rit met bekende condities is genoeg om ze te ijken. `2101` staat wél op
   de −40-offset — bij temperatuur-PIDs vrijwel universeel.
2. **Eerste connectie na deze update toont nog gewoon de gezondheidscheck.**
   Het bestaande voertuigprofiel heeft nog geen `health`-veld, dus de vraag
   komt niet. Die scan slaat het oordeel op; vanaf de connectie daarna komt
   de bevestiging wel.
3. **`pidlane-bulk.js` is botsingsvrij maar ongebruikt.** Inladen kan nu
   veilig; er is verder niets aan gedaan.
4. **APK-workflow triggert op `icon-512.png` in de root**, terwijl het
   bestand in `public/` staat. Een icoonwijziging start dus geen build.
   De build zelf pakt beide paden wel. Niet aangeraakt.
5. **`package.json` staat op 2.1.0, `APP_VERSION` op 2.9.0.** Cosmetisch,
   alleen Capacitor-metadata. Niet aangeraakt.
