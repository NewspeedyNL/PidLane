# CLAUDE.md — werkregels voor deze repo

> Claude Code leest dit bestand automatisch bij elke sessie. Hier staan de
> **harde regels**: wat er moet gebeuren voordat er iets weggaat. De houding en
> de samenwerkingsafspraken staan in `PROJECT-INSTRUCTIES.md` (dat is de tekst
> in het instructieveld van het Claude-project). Bij verschil wint dit bestand,
> want dit is de kant die de code raakt.

## Oriëntatie — in deze volgorde

| bestand | waarvoor |
|---|---|
| GitHub-issues | **wat er nú openstaat** — gelabeld op soort, kant en ernst; dit is de enige stand van zaken |
| `PIDLANE.md` | architectuurkaart — §4 zegt in welk bestand iets zit zonder code te lezen; §11 legt uit waaróm iets stukging |
| `PIDLANE-CONTRACT.md` | het ontwerp voor meetkwaliteit en sessiedekking (nog niet gebouwd) |
| `PIDLANE-ARCHIEF.md` | afgehandelde bevindingen ouder dan twee weken — niet standaard lezen, gericht in zoeken |

Kortlopend werk hoort in een issue, niet in een document. `PIDLANE-WERK.md`
bestond daarvoor en is op 27-08-2026 opgeheven: het groeide tot 40 KB, en de
helft daarvan was verslag van ritten die al afgehandeld waren.

**Op 02-09-2026 bleek §11 datzelfde aan het doen** — 77 KB, met een tabel van
open issues erin. Die tabel noemde #65 als open terwijl hij die ochtend om
09:48 als duplicaat was gesloten, en miste #90 van 11:18: één dag, twee
fouten, in een lijst met de waarschuwing "twee lijsten van hetzelfde lopen uit
de pas" er drie regels boven. De regel is dus niet "beter bijhouden" maar
**geen tweede lijst**: de stand van zaken staat in de issues, §11 bewaart de
uitleg, en wat afgehandeld én ouder dan twee weken is gaat naar
`PIDLANE-ARCHIEF.md`.

Zoek gericht (`grep`, `sed -n`) in plaats van hele bestanden te laden:
`index.html` is 176 KB, `worker.js` 155 KB, `pidlane.css` 182 KB,
`PIDLANE.md` 164 KB en `pidlane-testrun.js` 237 KB. Weet je niet welke module?
Kijk eerst in §4 van `PIDLANE.md`. Een ruw testrun-verslag hoort ook niet heel
de sessie in: haal er `FOUT` en `LET OP` met hun blokkop uit, en plak dat.

## Vóór elke commit

```
bash plcheck.sh .
```

Exit 0 is de voorwaarde om te committen — niets daarboven. De controle doet
`node --check` op alle JS plus `worker.js`, draait de complete `test-*.js`-reeks,
telt de div-balans van `index.html` en `admin.html`, en controleert dat elke
module in `index.html` hangt met `pidlane-bedrading.js` als laatste.

Dezelfde controle draait in CI (`.github/workflows/tests.yml`), met de
tegenproef (`plmutate.sh`) en de sleutelscan als eigen jobs ernaast — drie in
totaal. Lokaal groen krijgen is dus niet optioneel maar goedkoper.

**Bij elke oplevering toetst blok 5 wat er in díé update veranderd is.** Sinds
testrun 6.6 is dat een lijst en geen functie: voeg een entry toe aan
`PROEVEN_B5` in `pidlane-testrun.js`, of haal er een weg. Elke entry draagt
`issue`, `naam`, `waarom` en `proef`; `_blok5()` eronder loopt de lijst af en
verandert niet mee. Zie §20 van `PIDLANE.md`.

- **Schrijf geen opsomming van wat erbij kwam of eruit ging.** Die stond tot
  6.5 twee keer met de hand — in de banner boven `_blok5()` en in `CAMPAGNE` —
  en dat is dezelfde vorm die §11 en `PIDLANE-WERK.md` de kop kostte. De regel
  "BLOK 5 DEKT DEZE RONDE" in `CAMPAGNE` wordt uit de lijst afgeleid. Wat er
  vorige ronde uitging is een vraag voor `git log`.
- **`CAMPAGNE` blijft met de hand**, maar alleen voor wat een mens moet dóen:
  waarom deze ronde, de stappen van de rit, wat deze ronde níét oplost.
- `test-blok5lijst.js` bewaakt de vorm van de lijst en de koppeling met
  `CAMPAGNE`; `plmutate.sh` maakt allebei rood.

## Als je aan tests werkt

```
bash plmutate.sh .
```

Geen commit-poort — `plcheck.sh` blijft dat. Dit is de vraag eronder: *stelt
die poort iets voor?* Het script zet elke nagebouwde fout uit zijn tabel één
voor één in de bron, draait telkens de test die daarvan rood hoort te worden, en zet het
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

## Als iets een draaiende app nodig heeft

```
bash plbrowser.sh .
```

Start de **echte** `index.html` in Chromium en draait de `bproef-*.js`-reeks
ertegenaan. Geen npm, geen Playwright, geen buildstap: node praat rechtstreeks
met het debugprotocol. Geen Chromium op dit toestel? Dan slaat hij over met
exit 0 en zegt erbij dat er niets gemeten is. In CI draait hij als eigen job,
en daar is overslaan een fout — anders gaat "overgeslagen" stilletijk "goed"
betekenen.

**Waarom dit er is, gemeten op 03-09-2026.** Er stonden 22 issues open.
Vijftien daarvan hadden geen auto nodig maar een dráaiende app, en die was er
alleen tijdens een rit. Daardoor stond een te kort afgekapt tekstlabel (#95)
in dezelfde wachtrij als een vraag die echt een motor nodig heeft (#20).

De reden dat het zo gegroeid was staat in `test-schermranden.js`: *"lukt hier
niet zonder de hele app-boot na te bouwen"*. Dat klopte niet. De boot hoeft
niet nagebouwd te worden, hij kan gewoon draaien — alle 57 modules, alle
kernobjecten, 146 PIDs, nul fouten, in vijftien seconden. Wat het tegenhield
was één regel in de `<head>`: de stylesheet van Google Fonts. Een `<script>`
wacht op openstaande CSS, en die CSS kwam zonder internet nooit.

**De werkregel die daarmee verandert.** "Kan iets alleen in de auto getoetst
worden, dan is het een vraag voor `CAMPAGNE`" stond er al, en is de goede
regel — maar hij werd op alles toegepast. Voortaan:

| de vraag gaat over | waar hij thuishoort |
|---|---|
| een functie los | `test-*.js` (node) |
| de koppeling tussen modules, de DOM, de opstartvolgorde | `bproef-*.js` (browser) |
| wat een echte ECU of een volle bus doet | `CAMPAGNE`, dus een rit |

Naar `CAMPAGNE` verhuizen is dus een **besluit met een reden**, geen
restcategorie. Staat er "wachten op een rit" bij een issue, dan hoort erbij
waarom een browserproef het niet kan.

**Wat een browserproef níét is.** Er zit geen auto achter. De nep-adapter
vervangt `_sendBTOnce()` — het laagste punt waar één commando één antwoord
krijgt — zodat alles erboven (`sendBT` met zijn herhaalgedrag, `sendCmd` met
`PLBus.note()` en `trackBtQuality()`) échte code blijft. De antwoorden komen
bij voorkeur uit een echt testrunverslag: daar staat elke TX met zijn RX in.
Wat een bus onder belasting doet blijft een vraag voor een rit.

Dezelfde regel als bij de andere tests geldt hier dubbel: **een proef zonder
tegenproef telt niet.** `bproef-meetketen.js` is nagemeten door laag 1 uit te
zetten; hij wordt dan rood met de gemeten waarde erbij.

## Branch, PR, deploy

- Werk op een eigen branch. Nooit rechtstreeks naar `main`, nooit force-pushen.
- Open pas een PR als het werk af is en `plcheck.sh` groen staat.
- **Automerge is opt-in sinds 03-09-2026: het label `klaar`.** Zonder dat
  label wordt er niets samengevoegd, hoe groen de gate ook staat. `klaar`
  betekent één ding: **dit werk is af en álles staat gepusht.** Wie het label
  zet, zegt dat.

  | label | betekenis |
  |---|---|
  | `klaar` | af en gepusht — samenvoegen zodra *Tests* groen is |
  | `handmatig` | hard veto, wint van `klaar` |
  | (geen label) | blijft liggen; de workflow zegt dat op de PR |

  Een draft blijft ook liggen, en een PR uit een fork wordt nooit door de bot
  samengevoegd.

  **Waarom omgekeerd, nagemeten op 03-09-2026 over 56 samengevoegde PR's.**
  De mediaan van openen tot samenvoegen was **29 seconden**; 43 ervan gingen
  binnen 40 seconden, de snelste in 9. Er was dus geen moment waarop iemand
  kon ingrijpen — en elke merge is hier een deploy naar 100% van het verkeer.
  Daar bovenop volgde er **14 keer binnen twee uur nóg een PR op dezelfde
  branch** (`rico-test` zes keer, `testrun-log-prep` vier keer, met gaten van
  12 en 17 minuten). Deels legitiem nieuw werk, maar PR #80 hieronder is
  dezelfde vorm en dat was het niet.

  **PR #80, 01-09-2026.** Geopend om 20:52:56, gemerged om 20:53:08: twaalf
  seconden, op één van de twee commits. De titel was die van de eerste commit,
  en dat is precies wat het zo makkelijk maakt om te missen — de PR zag er
  compleet uit. Testrun 6.0 bleef achter op de branch terwijl `main` op 5.9
  stond, en de deploy die eruit volgde bevatte alleen een bijgewerkte
  `PIDLANE.md`.

  Daar stond tot 03-09 een gedragsregel onder — *"af, groen, gepusht, dán pas
  de PR"* — en die regel is goed. Maar hij draaide op oplettendheid, en dat
  ging te vaak mis. Nu is het een mechanisme: geen label, geen merge.
- **De basis mag niet zijn opgeschoven.** Een testrun op een PR toetst je
  branch samengevoegd met `main` *zoals `main` toen was*. Landt er daarna iets
  anders, dan is die groene vlag verlopen. De workflow blokkeert daarop en
  vraagt om **Update branch**; hij werkt de branch met opzet niet zelf bij,
  want een push met `GITHUB_TOKEN` start geen nieuwe testrun (zie hieronder).
- **Het besluit staat in `automerge-besluit.js`, niet in de YAML.** Als inline
  script was het niet te toetsen, en een fout daar merk je pas als er iets
  verkeerds live staat. `public/test-automerge.js` voert de echte functie uit;
  vier mutaties in `plmutate.sh` houden hem scherp. Verandert de strategie, dan
  verandert die test mee — en de tabel hierboven.
- **Een automerge levert géén Tests-run op `main`.** Nagemeten op 03-09-2026:
  GitHub start geen workflows voor pushes die met de standaard `GITHUB_TOKEN`
  gedaan zijn (de rem tegen oneindige lussen). PR #120 werd door een mens
  gemerged en gaf run 173; #121 ging via automerge en gaf niets. Cloudflare
  Workers Builds is een aparte integratie en deployt wél.

  Gevolg voor het lezen van de Actions-pagina: **de laatste Tests-run op `main`
  gaat niet per se over wat er nu op `main` staat.** Dat is geen gat in de
  dekking — de PR-run toetst het samenvoegresultaat, en daarom is de
  achterstand-poort hierboven de poort die dát waar houdt. Wil je `main` zelf
  getoetst zien, start *Tests* met de hand via `workflow_dispatch`.
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

- **`PIDLANE.md` §11** — de uitleg bij bevindingen die blijven staan, ook die
  je níét gerepareerd hebt: waarom het stukging, wat er al geprobeerd is, welke
  conclusie achteraf fout bleek. **Geen stand van zaken en geen lijst van open
  punten** — die staat in de issues. De rest van `PIDLANE.md` alleen bij een
  structuur-, contract- of architectuurwijziging.
- **`PIDLANE-ARCHIEF.md`** — is een §11-kopje afgehandeld én ouder dan twee
  weken, verplaats het daarheen. Verplaatsen is een eigen commit: dat is
  mechanisch werk, en dat gaat hier nooit samen met een gedragswijziging.
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
