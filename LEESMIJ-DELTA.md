# Delta — stille catches, ronde 5 (laatste twee)

Datum 22-08-2026, avond. Vervolgt op de btflow-delta en de
auth/fuel/koopcheck-delta van eerder vandaag. Twee modules:
**`pidlane-remote.js` (105 → 0), `pidlane-testrun.js` (66 → 0).**

Met deze delta is de hele stille-catches-klus dicht: alle zes bestanden op 0.

Uitpakken over de repo heen — na de eerdere twee delta's, of in plaats
daarvan als die nog niet verwerkt zijn (`test-stille-catches.js` bevat de
grens voor alle zes bestanden):

    cp -r delta/PidLane-main/. ~/PidLane/

## Wat er in zit

| bestand | wat |
|---|---|
| `public/pidlane-remote.js` | 105 lege catches ingevuld |
| `public/pidlane-testrun.js` | 66 lege catches ingevuld (alleen catch-bodies, `CAMPAGNE`/`_blok5`-testlogica ongemoeid) |
| `public/test-stille-catches.js` | grens voor alle zes bestanden op 0 |
| `PLAN.md` | punt 5 gesloten, nieuw punt 19 en 20 met de vondsten |

Géén versiebump: geen gedrag veranderd, dus geen nieuwe APK.

## Validatie

    bash plcheck.sh

    ok  syntax — 9 bestanden
    ok  ratel — geen enkele lege catch erbij
    ok  pidlane-auth.js — lege catches: 39 → 0
    ok  pidlane-btflow.js — lege catches: 30 → 0
    ok  pidlane-fuel.js — lege catches: 40 → 0
    ok  pidlane-koopcheck.js — lege catches: 43 → 0
    ok  pidlane-remote.js — lege catches: 105 → 0
    ok  pidlane-testrun.js — lege catches: 66 → 0
    ok  alleen catch-bodies+commentaar gewijzigd: true   (beide bestanden)

## De klus is klaar: 584 opgeruimd

Op 0: `bt`, `veldlab` (21-08), `btflow`, `auth`, `fuel`, `koopcheck`, `remote`,
`testrun` (22-08). Van de oorspronkelijke 824 stille catches zijn er 584
opgeruimd. Wat overblijft is bewust: de zes categorieën "stil met reden"
(sondes, opruimen, cosmetisch) die overal in deze klus zijn blijven staan
omdat een fout daar functioneel hetzelfde is als het normale pad.

---

## De scherpste vondst: `remote.js`, de schrijfblokkade

`remote.js` haakt met vijftien wrapper-installaties in op bestaande functies.
Voor één daarvan is een mislukte installatie niet alleen vervelend maar
gevaarlijk:

```js
try{ // de éne schrijfactie in de app: op afstand hard geblokkeerd
  if(typeof clearDTC==='function'){ ... blokkeer clearDTC in remote-modus ... }
}catch(_){}
```

Dit is de garantie dat een remote sessie alleen-lezen is. Faalt de
installatie stil, dan is die garantie niet actief en zou een expert op
afstand foutcodes kunnen wissen. **Enige plek in de hele klus met
`console.error` in plaats van `console.warn`.**

Twee kleinere, verwante vondsten in hetzelfde bestand: `applyVState()` had
`supportedPIDs=new Set(...)` en de `pidToevoegen()`-poort allebei stil —
dezelfde fantoomsensor-familie als punt 1, nu via de remote-sessie. En
`shareStop()` kon de sessie op de server stil laten open staan terwijl de
lokale UI "gestopt" toont.

## `testrun.js`: twee "ALTIJD"-garanties die toch stil konden falen

**Header-reset.** Blok 8 en 9 zetten de ECU-header op 7E0 en moeten die
terugzetten — het eigen commentaar zegt "ALTIJD", anders praat de hele app
straks alleen nog met het motorblok. Beide reset-pogingen (en blok 9's
tweede, met opzet gebouwde vangnet) zaten stil. Boeken nu een `FOUT`-regel.

**Het herstelpunt.** `_bewaarSelectie()` legt vóór elke run de PID-selectie
vast zodat een crash die niet permanent verandert — de drie regels die dat
vastleggen zaten alle drie stil. Faalt de vastlegging, dan herstelt de app na
de run netjes een lege selectie in plaats van de echte.

**De test die zichzelf voor de gek houdt.** Twee controles in `_blok5()`
(zelf: "is dit oude ding echt weg?") vielen bij een leesfout de verkeerde
kant op — ze meldden "PASS" terwijl ze niets gecontroleerd hadden. Herschreven
naar `throw new Error(...)` zodat zo'n fout nu als `FOUT` boekt.

**Bewijsvoering.** De metingen die PLAN.md punt 2/13 nodig hebben
(`_budgetVoor`, en de `PLLoad`/`PLBus`-vergelijking in blok 10) lazen stil —
een mislukte meting hier ondermijnt het bewijs zonder een spoor achter te
laten.

Niets van dit alles is opgelost, alleen zichtbaar gemaakt. Zie `PLAN.md`
punt 19 en 20 voor het volledige verhaal.

## `CAMPAGNE`/`_blok5()`: de regel is gevolgd

Binnen `_blok5()` zijn **alleen de catch-bodies** gevuld, precies zoals
overal elders in het bestand — de testlogica zelf (welke controles er zijn,
wat ze toetsen) is niet aangeraakt. `CAMPAGNE` is niet herschreven. Dat blijft
een losse stap voor de volgende keer dat er inhoudelijk iets verandert.

## Twee keer mezelf op de vingers getikt

Bij het opruimen van `testrun.js` schreef ik zelf twee keer precies de fout
die deze klus moet voorkomen: een `return { staat:'FOUT', detail:'...' }` en
een geneste try/catch, allebei ín een catch-body. De niet-hebberige
verificatie-regex stopt bij de éérste `}` — dus zo'n object-literal of
geneste catch laat een stuk tekst achter dat niet meer als catch-body geldt.
`verifieer.js` zei meteen `false` in plaats van `true`; hersteld naar
`throw new Error(...)` (geen accolades nodig) respectievelijk één enkel
catch-niveau. Vermeldenswaard omdat de regel "geen `{`/`}` in een catch-body"
dus ook geldt voor `return`-statements, niet alleen voor `console.warn`.

## De klus zelf

Niets meer te doen op dit vlak. Punt 5 in `PLAN.md` staat op ~~doorgestreept~~
DICHT. Volgende sessie: kijk in `PLAN.md` welk punt nu aan de beurt is
(punt 13 — `PLLoad` regelt op bezetting — heeft door deze klus er trouwens
extra bewijsmateriaal bij gekregen, zie punt 20 hierboven).
