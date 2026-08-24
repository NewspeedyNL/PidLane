# LEESMIJ-DELTA — 24-08-2026

Uitpakken over de werkkopie. De zip bevat `PidLane-main/…`, dus:

```
cd ~/                       # de map WAARIN PidLane-main staat
unzip -o pidlane-delta-2408.zip
cd PidLane-main
bash plcheck.sh $(pwd)      # moet groen zijn
```

Drie bestanden. Testrun gaat van 3.8 naar **3.9**.

---

## 1. `public/pidlane-pids.js` — de waakknop dooft niet meer

**Melding:** "als ik in live view schakel van puntjes naar getallen of
grafieken, gaat waakronde uit."

**Wat er werkelijk gebeurde:** hij ging niet uit. `_aan` bleef `true`, de strook
bleef staan, de bus werd nog elke twaalf seconden geclaimd. Alleen de knop zag
eruit als uit.

`#waakBtn` staat in dezelfde rij als de drie weergaveknoppen en draagt daarom de
klasse `pidview-btn` (regel 1452 in `index.html`). Maar hij heeft geen
`data-mode` — hij ís geen weergave. En `setPidView()` deed:

```js
document.querySelectorAll('.pidview-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
```

`b.dataset.mode` is daar `undefined`, de vergelijking dus altijd `false`, dus
`active` gaat eraf — bij élke wissel. `PLWaak.schakel()` beheert diezelfde
klasse zelf. Twee schrijvers op één klasse, en de verkeerde won.

**Nu:** `.pidview-btn[data-mode]`. De grens ligt waar hij hoort — bij "heeft een
modus", niet bij "staat in die rij". Komt er ooit nog een knop bij naast de
waakknop, dan valt die vanzelf buiten de lus.

Diff tegen het origineel is precies die ene regel plus commentaar. `node --check`
groen.

---

## 2. `public/pidlane-testrun.js` — knoppen weg, CAMPAGNE en blok 5 herschreven

### Weg: twee knoppen en b8 uit de standaardset

| was | nu |
|---|---|
| DID-scan (45 s) → `{b9}` | weg |
| Budget + olie → `{b7,b8}` | **Budget** → `{b7}` |
| standaardset bevatte `b8: true` | `b8` eruit |

Alle drie dienden de jacht op de mode 22-olietemperatuur, en die is op 23-08
losgelaten. **Die derde is de belangrijkste**: zonder hem waren de knoppen weg
maar scande élke volle run nog steeds, inclusief het header-gedoe op `7E0`. Dat
had je pas in het logboek gezien.

`_blok8()` en `_blok9()` blijven staan en zijn los aan te roepen met
`startTestrun({b8:true})` of `{b9:true}` vanuit de console. Ze slopen is een
mechanische stap van ruim driehonderd regels en die gaat apart — niet in dezelfde
commit als een inhoudelijke wijziging.

### Blok 5 — twee nieuwe controles

**TOEGEVOEGD — "Waakknop overleeft een weergavewissel".** Twee helften:

1. `.pidview-btn[data-mode]` moet minder knoppen vinden dan `.pidview-btn`. Zijn
   ze gelijk, dan heeft de waakknop een `data-mode` gekregen en valt hij weer
   binnen de lus.
2. De echte proef: de knop wordt **bewust op `active` gezet**, dan gaat
   `setPidView()` langs alle drie de standen, en na elke stand wordt gekeken of
   de klasse er nog is. Daarna staat de weergave terug zoals hij stond en de
   knop zoals hij stond.

Die eerste stap is de kern van de tegenproef. Zonder hem bewijst de test niets:
bij een uitstaande waakronde is "blijft dof" ook waar voor de oude, foute
selector. Zet je de selector terug op `.pidview-btn`, dan slaat deze controle af
— hij kan dus rood worden.

**VERWIJDERD — "Olieknoppen weg, b8 uit de standaardset".** Loopt de knoppen in
`#testrunOv` na op `b8`/`b9`, en knipt daarna de standaardset uit de bron van
`startTestrun`. Let op het knippad: bewust smal op precies dat objectliteraal
(`/blokken\s*\|\|\s*\{[^}]*\}/`), want een zoektocht op "b8" in de hele functie
vindt óók het commentaar erboven en meldt dan onterecht FOUT. Dat is nagerekend:
de echte set komt er zonder `b8` uit, een nagemaakte mét `b8` slaat af.

### CAMPAGNE

18 vragen. Leidt met de twee wijzigingen van vandaag, daarna de openstaande
batch van 23-08 — die rit is nog niet gereden, dus die vragen blijven staan.
Het opmerkingveld (kapt af op 20 tekens) staat er nog steeds in, nu expliciet
als "nog steeds open".

---

## 3. `PIDLANE-WERK.md`

§3 uitgebreid met "Nieuw op 24-08": de waakknop-fix en de testrun-opruiming.

---

## Wat er NIET in zit

**De drie oranje puntjes onder het wachtwoordveld.** Ik heb het blok niet.
`#loginOv` begint op regel 529 van `index.html` en daar houdt mijn kennis op.
Drie oranje stipjes zijn een element — een laadindicator die na een afgebroken
poging blijft staan, een sterkte-indicator in drie segmenten, of een statusstip
in de LET OP-kleur (`#e0972f`, dezelfde die de waakronde gebruikt). Welke van de
drie het is bepaalt of de fix in de HTML of in de CSS zit.

```
sed -n '529,620p' public/index.html
```

Blind gokken is hier duurder dan één ronde wachten: dat is letterlijk wat op
21-08 met het opmerkingveld gebeurde, en dat staat nog steeds als "gebouwd maar
werkt niet" in het werkdocument.

---

## Committen

Drie commits:

1. `pidlane-pids.js` — waakknop buiten de weergave-lus
2. `pidlane-testrun.js` — 3.9: olieknoppen weg, b8 uit de standaardset, CAMPAGNE
   en blok 5 herschreven
3. `PIDLANE-WERK.md` — administratie

Gecontroleerd: `node --check` groen op beide JS-bestanden, nul lege catches in
`pidlane-testrun.js` (ratel blijft op 0), knoppenbalk telt nu 8 knoppen zonder
`b8`/`b9`.
