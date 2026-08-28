# CLAUDE.md — werkregels voor deze repo

> Claude Code leest dit bestand automatisch bij elke sessie. Hier staan de
> **harde regels**: wat er moet gebeuren voordat er iets weggaat. De houding en
> de samenwerkingsafspraken staan in `PROJECT-INSTRUCTIES.md` (dat is de tekst
> in het instructieveld van het Claude-project). Bij verschil wint dit bestand,
> want dit is de kant die de code raakt.

## Oriëntatie — in deze volgorde

| bestand | waarvoor |
|---|---|
| `PIDLANE.md` | architectuurkaart — §4 zegt in welk bestand iets zit zonder code te lezen; §11 is de lijst met bekende problemen |
| `PIDLANE-CONTRACT.md` | het ontwerp voor meetkwaliteit en sessiedekking (nog niet gebouwd) |
| GitHub-issues | wat er nú speelt en wat er gemeten moet worden |

Kortlopend werk hoort in een issue, niet in een document. `PIDLANE-WERK.md`
bestond daarvoor en is op 27-08-2026 opgeheven: het groeide tot 40 KB, en de
helft daarvan was verslag van ritten die al afgehandeld waren.

Zoek gericht (`grep`, `sed -n`) in plaats van hele bestanden te laden:
`index.html` is 203 KB, `worker.js` 134 KB, `pidlane.css` 157 KB. Weet je niet
welke module? Kijk eerst in §4 van `PIDLANE.md`.

## Vóór elke commit

```
bash plcheck.sh .
```

Exit 0 is de voorwaarde om te committen — niets daarboven. De controle doet
`node --check` op alle JS plus `worker.js`, draait de complete `test-*.js`-reeks,
telt de div-balans van `index.html` en `admin.html`, en controleert dat elke
module in `index.html` hangt met `pidlane-bedrading.js` als laatste.

Dezelfde controle draait in CI (`.github/workflows/tests.yml`) plus een
sleutelscan. Lokaal groen krijgen is dus niet optioneel maar goedkoper.

**Bij elke oplevering ook `CAMPAGNE` en `_blok5()` in `pidlane-testrun.js`
herschrijven**, zodat blok 5 toetst wat er in díé update veranderd is —
toegevoegd én verwijderd. Zie §20 van `PIDLANE.md`.

## Branch, PR, deploy

- Werk op een eigen branch. Nooit rechtstreeks naar `main`, nooit force-pushen.
- Open pas een PR als het werk af is en `plcheck.sh` groen staat.
- `automerge.yml` voegt de PR samen zodra de workflow *Tests* groen afrondt.
  Remmen: het label `handmatig`, of de PR in draft laten.
- **Elke push is deployen — óók naar een branch.** Cloudflare Workers Builds
  bouwt op elke push en zet `worker.js` live op `app.pidlane.nl`. Niet pas bij
  de merge: bij PR #34 stond de Worker 33 minuten vóór de merge al live, op de
  branchcommit. `wrangler.toml` zei het al precies ("`git push` → Workers Builds
  bouwt en deployt automatisch"); bevestigd door de eigenaar op 28-08-2026.

  **Herzien, niet weggepoetst** (zie #35): hier stond tot 28-08 "samenvoegen in
  `main` is deployen". Dat las als "een branch is een veilige werkplek en de PR
  is de poort". Het omgekeerde is waar — de PR is een verslag achteraf, geen
  poort. De fout is bewaard omdat hij verklaart waarom er sessies zijn geweest
  waarin halfaf werk naar een branch ging "om het later af te maken".

  Wat dat betekent voor het werk:
  - `bash plcheck.sh .` groen vóór **elke** push die `worker.js` raakt, niet
    vóór de merge.
  - Push geen worker-wijziging die je niet wilt uitleveren. Nog niet af? Houd
    hem lokaal, of raak `worker.js` in die push niet aan.
  - Dit geldt alleen voor de Worker. `public/` wordt door dezelfde build
    meegenomen, maar `admin/` staat daarbuiten en gaat nergens heen.
- Bij tegoed- of API-wijzigingen moeten `worker.js` en `public/` in **dezelfde**
  push mee. Loopt de een voor, dan draait er even een versie waarin niemand
  betaalt of juist dubbel.

## Codeafspraken

- **Nederlands**: commentaar, commitberichten, PR-titels, UI-teksten, changelog.
- Commitbericht = één regel die zegt wat er inhoudelijk veranderde, niet welk
  bestand. Stijl: `Testrun 4.9: blok 14 meet de rit, blok 13 meldt de omstandigheden`.
- Bouw-changelog bovenaan `index.html` (HTML-commentaar) bijwerken.
- **Mechanisch en inhoudelijk wijzigen nooit in dezelfde commit.** Hernoemen,
  verplaatsen en herindelen is een eigen commit, los van gedragswijziging.
- Geen stille `catch`-blokken. Een fout die niemand ziet, is de fout die maanden
  blijft staan — zie §19 van `PIDLANE.md` (626 stille catches).
- Geen buildstap, geen frameworks, geen `src/`-map. Onderhoudslast is een harde
  ontwerprandvoorwaarde: dit is een soloproject naast een baan.
- Eén ding heeft één betekenis. Een class, een vlag of een element met twee
  rollen is hier al drie keer een bug geweest.

## worker.js is zijn eigen bron

Het bestand ziet eruit als build-uitvoer, maar de esbuild-invoer bestaat niet
meer en komt niet terug. Bewerk hem rechtstreeks.

- Elke top-level `function X` krijgt `__name(X, "X");` erachter — dat is wat er
  in een Cloudflare-stacktrace terechtkomt.
- Niet opnieuw bundelen: dat herschrijft het hele bestand, maakt de diff
  onleesbaar en gooit het Nederlandse commentaar weg. Dat commentaar is hier de
  dure helft.
- Geen lokale `wrangler`, geen secrets in de repo. Secrets gaan via het
  Cloudflare-dashboard.

## Privacy — de regel die niet buigt

Een VIN is via het RDW herleidbaar tot een persoon. Hij gaat **nooit ruw** de
telefoon uit: beide uitgaande paden lopen via `_vlVinPseudoniem()`
(`SHA-256(zout + VIN)`, eerste 16 hextekens). Zie §7 van `PIDLANE.md`.

Dit is **pseudonimisering, geen anonimisering** — het zout staat in clientcode.
Noem het in gebruikersteksten dus nooit "anoniem"; `test-toestemmingstekst.js`
bewaakt dat. Verandert de verwerking, dan verandert de toestemmingstekst mee, en
dan is een eerder gegeven akkoord niet meer geldig.

## Tests

- Een controle zonder tegenproef telt niet. Bouw de fout na en laat zien dat de
  test dán rood wordt; anders weet je alleen dat hij groen kán staan.
- Blok 5 toetst **gedrag**, geen broncode. Broncode lezen mag alleen waar een
  gedragstest onmogelijk is, en dan met de reden erbij.
- Een test die altijd rood staat wordt genegeerd. Ontbreken de voorwaarden
  (niet verbonden, pagina onzichtbaar), dan is dat LET OP, geen FOUT.
- "Niet geladen" in blok 5 is twee keer de HTTP-cache geweest. Eerst herladen,
  dan concluderen.

## Documentatie bijwerken hoort bij het werk

In dezelfde PR:

- **`PIDLANE.md` §11** — bevindingen die blijven staan, ook die je níét
  gerepareerd hebt. De rest van `PIDLANE.md` alleen bij een structuur-,
  contract- of architectuurwijziging.
- **Een GitHub-issue** voor wat af te ronden valt: een fix die nog getoetst moet
  worden, een vraag die alleen tijdens een rit te beantwoorden is.
- Een eerdere conclusie die fout blijkt, wordt **herzien vastgelegd, niet
  weggepoetst**. De `ATI`-vergissing (§1) is bewaard omdat de fout leerzamer is
  dan de correctie.

## Wat je niet doet

- Bugs die je onderweg vindt: **vastleggen in `PIDLANE.md` §11 of als issue,
  niet in dezelfde sessie repareren** — tenzij er expliciet om gevraagd wordt.
  Eén onderwerp per PR.
- Geen bestanden verwijderen, hernoemen of verplaatsen zonder te vragen.
- Geen "opruimacties" of stijlrefactors erbij die niemand gevraagd heeft.
- Niets live zetten wat niet getoetst is. Kan iets alleen in de auto getoetst
  worden, dan is het een vraag voor `CAMPAGNE`, geen aanname in de code.
