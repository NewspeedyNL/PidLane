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

## Als je aan tests werkt

```
bash plmutate.sh .
```

Geen commit-poort — `plcheck.sh` blijft dat. Dit is de vraag eronder: *stelt
die poort iets voor?* Het script zet zestien nagebouwde fouten één voor één in
de bron, draait telkens de test die daarvan rood hoort te worden, en zet het
bestand terug. Exit 0 = alles gevangen. Exit 1 = er kwam er een doorheen, en
dan dekt die test minder dan zijn naam belooft.

Draai hem als je een test toevoegt of verbouwt, en als je wilt weten of een
groene reeks nog iets betekent. Hij weigert op een werkmap met niet-vastgelegde
wijzigingen: hij schrijft in je bronbestanden. In CI draait hij als eigen job,
dus vergeten kan niet — daar is de checkout altijd schoon.

**Verandert er gedrag dat in de tabel staat, dan verandert de mutatie mee.**
Een anker dat niet meer past bouwt niets na, en dat is óók exit 1 — met de
naam van de mutatie erbij. Repareer het anker (er een regel bij nemen met `\n`
maakt hem langer en dus unieker) of haal de mutatie weg met de reden erbij.
Nieuwe mutatie? Neem een fout die je écht had kunnen maken. De vraag is niet
"kan ik dit stukmaken" maar "welke stille fout hoort gevangen te worden".

**Nagemeten op 02-09-2026, en dat is de reden dat dit script bestaat.** Vier
plausibele fouten in de meetketen — een off-by-one in de header-echo van
`parsePID`, de harde fysieke limiet uitgezet, de `NO DATA`-poort van de
waakronde open, en het oordeel over onbekende sensoren omgedraaid — en
`plcheck.sh` meldde `65 stuks, allemaal exit 0` met *"Alles goed — veilig om te
committen"* eronder. Elke push naar `main` is deployen. Zie §11 van
`PIDLANE.md`.

## Branch, PR, deploy

- Werk op een eigen branch. Nooit rechtstreeks naar `main`, nooit force-pushen.
- Open pas een PR als het werk af is en `plcheck.sh` groen staat.
- `automerge.yml` voegt de PR samen zodra de workflow *Tests* groen afrondt.
  Remmen: het label `handmatig`, of de PR in draft laten.
- **Push élke commit vóórdat je de PR opent.** Automerge kijkt niet of je nog
  bezig bent: hij merget de branch zoals die op dat moment is en sluit de PR.
  Een tweede commit die daarna binnenkomt blijft achter op de branch, en de
  PR kan hem niet meer dragen — een gemergede PR is klaar.

  **Nagemeten op 01-09-2026.** PR #80 werd om 20:52:56 geopend en om 20:53:08
  gemerged: twaalf seconden, op één van de twee commits. De titel was die van
  de eerste commit, en dat is precies wat het zo makkelijk maakt om te missen —
  de PR zag er compleet uit. Testrun 6.0 bleef achter op de branch terwijl
  `main` op 5.9 stond, en de deploy die eruit volgde bevatte alleen een
  bijgewerkte `PIDLANE.md`.

  De les is niet "let beter op" maar de volgorde: **af, groen, gepusht, dán
  pas de PR.** Bij twijfel de PR in draft openen; hem vrijgeven is één klik,
  een gemergede PR terugdraaien niet.
- **Elke push naar `main` is deployen.** Cloudflare Workers Builds bouwt en
  draait `wrangler deploy`; die deployment krijgt meteen 100% van het verkeer.
  Er zit geen mens tussen die merge en de klant — dat is de reden dat de gate
  vóór de push groen moet zijn. Geldt ook voor een directe commit op `main`
  (bijvoorbeeld via de webeditor), niet alleen voor een merge.

  **Een push naar een branch bouwt wél, maar deployt niet.** Workers Builds
  draait op élke branch en ongeacht welke bestanden veranderden — een commit
  die alleen `CLAUDE.md` raakt geeft ook een build. Maar zo'n build wordt geen
  deployment. Nagemeten op 28-08-2026: zeven builds sinds middernacht, vier
  deployments, en die vier vallen exact samen met de vier keer dat er iets op
  `main` kwam.

  **Waar dit twee keer misging** (#35, gesloten): de Cloudflare-bot zet onder
  elke PR "✅ Deployment successful", óók voor een branch-build die nooit
  verkeer heeft gezien. Die tekst is een bouwstatus, geen bewijs dat er iets
  live staat. Ik las hem als het laatste, concludeerde dat branches
  rechtstreeks naar productie gingen, en herschreef deze regel — twee keer,
  in de verkeerde richting. De regel die er stond klopte gewoon.

  De les is niet de uitkomst maar de vorm: **een geruststellende of
  alarmerende melding van een bot is een waarneming, geen conclusie.** Zoek de
  bron op — hier: Deployments → View all deployments — vóórdat je een werkregel
  omgooit. Dat kostte hier drie PR's aan documentatie die niets verbeterde.

  De instelling die dit bepaalt staat overigens níét in deze repo maar in
  Cloudflare → Workers → `pidlane-proxy` → Settings → Builds. Verandert daar
  iets, dan is dat hier onzichtbaar; bij twijfel kijk je het na met dezelfde
  Deployments-lijst.
- Bij tegoed- of API-wijzigingen moeten `worker.js` en `public/` in **dezelfde**
  push mee. Loopt de een voor, dan draait er even een versie waarin niemand
  betaalt of juist dubbel.

## Issues — drie labels, en ze zijn alle drie verplicht

Elk issue krijgt **waar** het zit, **wat** het is en **hoe erg** het is. Eén
label uit elke rij, niet meer en niet minder. De labels in GitHub zijn leidend;
de tabel in `PIDLANE.md` §11 is een momentopname.

### Categorie — waar zit het

| label | wat eronder valt |
|---|---|
| `app` | meetketen, parser, PID-logica, testrun, rapport |
| `ui` | scherm, layout, weergave, navigatie, teksten |
| `bt` | verbinding, adapter, ELM, busprotocol, poll-ronde |
| `worker` | backend, tegoed, auth, admin, Airtable |
| `algemeen` | repo, werkregels, CI, documentatie, build |

Twijfel je tussen twee? Kies waar de **reparatie** landt, niet waar de klacht
zichtbaar werd. Een meetfout die je in de live view ziet is `app`, niet `ui`.

### Soort — wat is er nodig om het te sluiten

Dit is de belangrijkste van de drie, en dat is gemeten (zie hieronder).

| label | om het te sluiten heb je nodig |
|---|---|
| `bug` | het doet iets anders dan het hoort — **een bureau** |
| `wens` | het kan beter, maar het is niet stuk — **een bureau** |
| `meten` | het antwoord komt alleen uit een rit — **een auto** |
| `besluit` | er moet gekozen worden, niet gebouwd — **jij** |
| `extern` | het antwoord ligt buiten deze repo (Play, Cloudflare, RDW) — **opzoeken** |

`bug` en `wens` sluit je met code. De andere drie niet, en dat is precies
waarom ze blijven liggen. Zie de saldoregel.

### Ernst — hoe erg is het

| label | betekenis | wanneer pak je het |
|---|---|---|
| `ernst:1-noodgeval` | de dienst ligt plat, of er lekt geld of persoonsgegevens | **nu**, alles opzij, mag alle regels hieronder breken |
| `ernst:2-ernstig` | een kernfunctie geeft een fout antwoord: de meting klopt niet, het saldo klopt niet | eerstvolgende oplevering |
| `ernst:3-hinder` | het werkt maar verkeerd of lelijk, en er is een omweg | als het uitkomt |
| `ernst:4-klein` | nice to have, cosmetisch, niemand struikelt erover | mag eeuwig blijven liggen, of dicht |

**Ernst gaat over het gevolg, niet over de moeite.** Een fout die één regel
kost maar de hele meting scheeftrekt is `ernst:2`; een verbouwing van een week
die niemand mist is `ernst:4`. Zodra "hoe moeilijk is het" in dit label
sluipt, is het geen prioriteit meer maar een planning, en dan zakken de dure
dingen vanzelf naar onderen.

Een privacy-bevinding is **altijd** `ernst:1`. Een VIN die ruw de telefoon uit
gaat is geen hinder.

## De saldoregel — waarom de lijst groeide

**Nagemeten op 02-09-2026.** Van 27-08 tot 02-09: **46 issues geopend, 28
gesloten.** Netto +18 in zes dagen, 1,64 geopend per gesloten. Dat loopt niet
vanzelf leeg.

De verdeling laat zien waar het vastloopt — en het is niet waar je het zoekt:

|  | `bug` | `wens` | `meten` | `besluit` | `extern` |
|---|---|---|---|---|---|
| **app** | 3 | · | 2 | 1 | · |
| **ui** | 2 | 1 | 3 | · | · |
| **worker** | 1 | 1 | · | 1 | 1 |
| **bt** | · | · | 1 | 1 | · |

**Tien van de achttien (56%) zijn met code niet te sluiten.** De doorlooptijd
bevestigt het: gesloten issues leefden mediaan **één dag**, terwijl negen
issues ouder dan drie dagen open staan — en die negen zijn vrijwel allemaal
`meten`, `besluit` of `extern`. Het probleem is dus niet dat er te traag
gerepareerd wordt. Het is dat de helft van de lijst wacht op iets wat achter
een bureau niet gebeurt, en dat daar geen moment voor is ingepland.

Vier regels, en ze grijpen op verschillende helften aan:

1. **Elke oplevering sluit er minstens evenveel als hij opent.** Laat je een
   bevinding achter, sluit er dan ook een. Netto nul is het minimum, netto
   negatief is het doel. Lukt dat niet, dan zeg je in de PR waarom.

2. **`meten` hangt aan een rit of hij bestaat niet.** Een `meten`-issue dat
   niet in de `CAMPAGNE` van de volgende testrun staat, wordt niet
   beantwoord — dat is zes dagen lang bewezen door #19, #20 en #29. Bij elke
   oplevering: zet ze in de campagne, of sluit ze met de reden erbij. Een
   vraag die je niet gaat stellen is geen openstaande vraag.

3. **`besluit` krijgt een houdbaarheidsdatum van veertien dagen.** Daarna
   beslis je, of hij gaat dicht als *"niet nu"* met wat je toen wist. #15 en
   #49 staan open sinds 27 en 28 augustus zonder dat er iets aan veranderde;
   die hebben geen tijd nodig maar een knoop. Dicht is geen verlies — het
   staat in de historie en heropenen kost één klik.

4. **`extern` is één poging, dan geparkeerd.** Zoek het uit of laat het los.
   Een issue dat wacht op iemand anders is geen werk, hooguit een
   herinnering.

### Wat je NIET meer als issue opschrijft

Dit is de regel die het hardst duwt, en hij vervangt de oude *"nooit in
dezelfde sessie repareren"*:

- **`ernst:1`: repareren, nu, altijd** — ook midden in ander werk, ook als het
  de PR breed maakt. Zeg het in het commitbericht.
- **`ernst:4` in een bestand dat je tóch al openhebt: gewoon doen.** Een issue
  schrijven voor een fix van één regel kost meer dan de fix, en levert een
  regel op die maanden blijft staan. Noem hem in het commitbericht en klaar.
- **Alles daartussen blijft zoals het was**: vastleggen, niet in dezelfde
  sessie repareren. Eén gedragswijziging per PR.

De grens ligt bij gedrag: raakt het de meetketen, het tegoed of de privacy,
dan is het nooit "even meenemen", hoe klein het ook lijkt. Daar geldt de oude
regel onverkort — dat is de reden dat hij bestaat.

### Een plafond

Boven de **twintig** open issues gaat een oplevering eerst omlaag: geen nieuwe
functies tot de lijst weer onder de twintig staat. Twintig is geen natuurwet
maar het punt waarop deze lijst ophoudt leesbaar te zijn, en een lijst die
niemand meer leest is hetzelfde als geen lijst.

## Codeafspraken

- **Nederlands**: commentaar, commitberichten, PR-titels, UI-teksten, changelog.
- Commitbericht = één regel die zegt wat er inhoudelijk veranderde, niet welk
  bestand. Stijl: `Testrun 4.9: blok 14 meet de rit, blok 13 meldt de omstandigheden`.
- Bouw-changelog bovenaan `CHANGELOG.md` bijwerken (niet meer in `index.html`
  zelf sinds 28-08-2026: die tekst veranderde bij elke oplevering mee terwijl
  `build-apk.yml` op elke wijziging aan `index.html` een Android-build start).
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
  test dán rood wordt; anders weet je alleen dat hij groen kán staan. Staat de
  fout in `plmutate.sh`, dan blijft die tegenproef ook draaien als jij er niet
  meer aan denkt.
- **Een test laadt zijn onderwerp, hij schrijft het niet over.** Lees de echte
  functie in met `vm` of `new Function` en knip erop met een anker dat de test
  laat stoppen als het verdwijnt. Een test met een eigen kopie van de logica
  kan per definitie niet rood worden — en de kopie loopt uit de pas zonder dat
  iemand het ziet. `test-healthgate.js` stond maanden groen op een
  `healthUitProfiel()` met twee parameters die een object teruggaf, terwijl de
  app er één heeft en `true`/`false` geeft.
- **Verzin geen tabellen die de app ook heeft.** `test-waakronde.js` rekende
  met `HARD={'0105':{min:-20,max:130}}` en bewees daarmee dat 215 °C koelwater
  een bevinding is. Echt staat `PID_HARD_LIMITS['0105']` op −40…215, en méér
  dan 215 komt er uit één byte niet uit: het bewijs ging over een geval dat
  niet bestaat. Laad `pidlane-data.js`; dan toets je de tabel meteen mee.
- **De toets moet onderscheiden, niet alleen kloppen.** Op de echte bron
  richten is niet genoeg. `antwoordHerkend('0105','NO DATA')` zegt niets over
  de tekstpoort — in "NO DATA" zit toch al geen geldige header, dus de
  controle eronder keurt hem hoe dan ook af. Pas `'SEARCHING...41055A'` en
  `'41055A STOPPED'` laten zien of die poort werkelijk iets doet. Vraag bij
  elke toets: welke fout zou hier rood worden, en welke glipt erdoor?
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
  Eén gedragswijziging per PR. **Uitzondering sinds 02-09-2026**, want deze
  regel alleen liet de lijst met 1,64 geopend per gesloten groeien: een
  `ernst:1` repareer je altijd meteen, en een `ernst:4` in een bestand dat je
  tóch al openhebt neem je mee in plaats van hem op te schrijven. De grens
  ligt bij gedrag — meetketen, tegoed en privacy nooit "even meenemen". Zie
  "De saldoregel".
- Geen bestanden verwijderen, hernoemen of verplaatsen zonder te vragen.
- Geen "opruimacties" of stijlrefactors erbij die niemand gevraagd heeft.
- Niets live zetten wat niet getoetst is. Kan iets alleen in de auto getoetst
  worden, dan is het een vraag voor `CAMPAGNE`, geen aanname in de code.
