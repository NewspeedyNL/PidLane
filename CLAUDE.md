# CLAUDE.md — werkregels voor deze repo

Harde regels; bij verschil met `PROJECT-INSTRUCTIES.md` wint dit bestand. De
onderbouwing van elke regel (wanneer, waarom, wat er misging) staat in
`PIDLANE-ARCHIEF.md` onder "20-10-2026 — CLAUDE.md ingekort".

## Oriëntatie

| bestand | waarvoor |
|---|---|
| GitHub-issues | de enige stand van zaken — geen tweede lijst in een document |
| `PIDLANE.md` | architectuurkaart; §4 zegt in welk bestand iets zit |
| `PIDLANE-CONTRACT.md` | ontwerp meetkwaliteit en sessiedekking |
| `PIDLANE-ARCHIEF.md` | waaróm iets stukging; gericht in zoeken, niet laden |
| `CHANGELOG-ARCHIEF.md` | changelog ouder dan vier weken |

Zoek gericht (`grep`, `sed -n` met een smal bereik). Grote bestanden
(`pidlane-testrun.js`, `worker.js`, `pidlane.css`, `index.html`, de archieven)
nooit heel laden; meet met `wc -c` als het ertoe doet. Van een testrunverslag
alleen `FOUT` en `LET OP` met hun blokkop.

## Zuinig werken (tokens en tijd)

- Lokaal per commit alleen:
  ```
  node --check <bestand dat je raakte>
  node public/test-<onderwerp>.js
  ```
  `plcheck.sh`, `plmutate.sh`, `plbrowser.sh` en de sleutelscan draait CI op
  elke PR. Lees de CI-uitslag alleen als hij rood is.
- `bash plcheck.sh .` lokaal alleen bij bedrading, modulevolgorde of
  `index.html` zelf, en eenmaal vóór een PR.
- `plmutate.sh` lokaal alleen als je een test bouwt of verbouwt, dan met
  `--sinds origin/main`. Een nieuw of gewijzigd mutatie-anker eerst toetsen
  met `grep -cF '<anker>' <bestand>` (moet 1 zijn).
- Niet binnen de sessie wachten op lange achtergrondtaken; pushen en CI laten
  rekenen.
- Eén sessie per onderwerp. Korte antwoorden; geen hele bestanden in de chat.

## Meetopdrachten en blok 5

- Een meetopdracht is data: keuren met `node plopdracht.js <bestand>`.
- Elke oplevering: een entry in `PROEVEN_B5` (`pidlane-testrun.js`) met
  `issue`, `naam`, `waarom`, `proef`. Geen handgeschreven opsomming van wat
  erbij kwam; `CAMPAGNE` alleen voor wat een mens tijdens de rit moet doen.
  `test-blok5lijst.js` bewaakt dat.

## Tests

- **Een controle zonder tegenproef telt niet.** Bouw de fout na en zie hem
  rood worden; zet hem in `plmutate.sh`, bij zijn onderwerp (niet onderaan).
- Verandert gedrag dat in de mutatietabel staat, dan verandert de mutatie
  mee: anker repareren, of weghalen met de reden.
- **Een test laadt zijn onderwerp** (`vm`/`new Function` met een anker dat
  stopt als het verdwijnt); geen eigen kopie van de logica.
- **Verzin geen tabellen die de app ook heeft**: laad `pidlane-data.js`.
- **De toets moet onderscheiden**: kies invoer waarbij de fout echt rood wordt.
- Blok 5 toetst gedrag, geen broncode (behalve waar gedrag onmogelijk is, met
  reden).
- Ontbrekende voorwaarden (niet verbonden, pagina onzichtbaar) zijn LET OP,
  geen FOUT. "Niet geladen" in blok 5: eerst herladen (HTTP-cache).

| de vraag gaat over | hoort in |
|---|---|
| een functie los | `test-*.js` (node) |
| koppeling tussen modules, DOM, opstartvolgorde | `bproef-*.js` (`plbrowser.sh`, echte `index.html` in Chromium) |
| wat een echte ECU of volle bus doet | `CAMPAGNE`, met de reden waarom een browserproef het niet kan |

## Branch, PR, deploy

- Eigen branch, gesneden van de huidige `main`. Nooit direct naar `main`,
  nooit force-pushen. Een branch met een samengevoegde PR is klaar: geen
  tweede PR erop.
- Inhalen met `node plinhaal.js` (niet `git merge`); hij commit niet.
  `PIDLANE.md` en `CHANGELOG.md` staan op `merge=union`: lees na een
  inhaalmerge hun diff op verdubbelde alinea's. Haal main binnen vlak vóór
  je de PR opent.
- PR pas als het werk af is. Automerge alleen met het label `klaar`;
  `handmatig` is een veto. **Claude zet `klaar` niet zelf**, tenzij de
  gebruiker in díé sessie zegt dat het werk af is.
- Elke push naar `main` die code raakt is een deploy naar 100% van het
  verkeer (Cloudflare Workers Builds). Commits met alleen `*.md` deployen
  niet. Branch-builds deployen niet, maar zijn nodig voor de preview-bron —
  niet uitzetten.
- Een botmelding ("Deployment successful") is een waarneming, geen bewijs:
  nakijken in Cloudflare → Deployments vóór je een werkregel omgooit.
- Tegoed- of API-wijzigingen: `worker.js` en `public/` in dezelfde push.

## Codeafspraken

- Nederlands: commentaar, commits, PR's, UI, changelog.
- Commitbericht: hoogstens drie regels (attributie niet meegeteld), zegt wat
  er inhoudelijk veranderde. Uitleg hoort in `PIDLANE-ARCHIEF.md`.
- Bouw-changelog bovenaan `CHANGELOG.md` (niet in `index.html`).
- Mechanisch (hernoemen, verplaatsen) en inhoudelijk nooit in één commit.
- Geen stille `catch`-blokken.
- Geen buildstap, geen frameworks, geen `src/`-map.
- Raak je een knop, menuregel of venster uit de handleiding, pas dan
  `public/pidlane-help-inhoud.js` in dezelfde commit aan en zet
  `gecontroleerd`. Geen prijzen in die tekst.
- Eén ding heeft één betekenis (class, vlag, element).

## worker.js

Is zijn eigen bron: rechtstreeks bewerken, niet opnieuw bundelen. Elke
top-level `function X` krijgt `__name(X, "X");`. Geen lokale `wrangler`, geen
secrets in de repo.

## Privacy — buigt niet

Een VIN gaat nooit ruw de telefoon uit: altijd via `_vlVinPseudoniem()`
(§7 van `PIDLANE.md`). Dat is pseudonimisering, geen anonimisering: nooit
"anoniem" in gebruikersteksten (`test-toestemmingstekst.js`). Verandert de
verwerking, dan verandert de toestemmingstekst mee.

## Documentatie hoort bij het werk (zelfde PR)

- `PIDLANE-ARCHIEF.md`: uitleg bij bevindingen, bovenaan met een datumkop —
  ook wat niet gerepareerd is. Geen stand van zaken of open-puntenlijst.
- `PIDLANE.md`: alleen bij structuur-, contract- of architectuurwijziging.
- Een issue voor wat nog getoetst moet worden of een rit nodig heeft.
- Een fout gebleken conclusie herzien vastleggen, niet wegpoetsen.

## Wat je niet doet

- Onderweg gevonden bugs niet in dezelfde sessie repareren (tenzij gevraagd):
  archief of issue. Eén onderwerp per PR.
- Geen bestanden verwijderen, hernoemen of verplaatsen zonder te vragen.
- Geen opruimacties of stijlrefactors die niemand vroeg.
- Niets live zetten wat niet getoetst is.
