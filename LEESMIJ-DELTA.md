# LEESMIJ-DELTA — 24-08-2026

Uitpakken over de werkkopie. De zip bevat `PidLane-main/…`, dus:

```
cd ~/                       # de map WAARIN PidLane-main staat
unzip -o pidlane-delta-2408.zip
cd PidLane-main
bash plcheck.sh $(pwd)      # moet groen zijn
```

Vier bestanden. Testrun gaat van 3.8 naar **4.0**.

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
modus", niet bij "staat in die rij".

---

## 2. `public/pidlane-auth.js` — de drie puntjes onder het wachtwoordveld

**Dit is geen CSS-probleem en geen los element.** `doLogin()` zette tijdens het
wachten letterlijk `err.textContent = '…'` in `#loginErr`, en dat vakje heeft
inline `color:var(--rd)` in `index.html`. Dus: een wachtindicator in de
foutkleur, precies onder het wachtwoordveld.

Twee dingen waren mis:

- **Verkeerde kleur.** Rood betekent in deze app "er is iets fout". Hier
  betekende het "even wachten".
- **Geen tijdslimiet.** Alle paden zetten het veld netjes weer leeg — bij
  succes, bij een fout wachtwoord, bij 429, bij 5xx, bij een onbereikbare
  server. Maar zolang de `fetch` naar `/auth/login` hángt geeft die nooit een
  fout, dus was er ook nooit een uitweg. Dat is vermoedelijk het moment van je
  screenshot.

**Nu één setter:**

```js
plLoginMeld(el, tekst, soort)   // 'bezig' grijs · 'fout' rood · 'leeg' leeg
```

Alle veertien schrijvers naar `#loginErr` lopen erdoorheen, ook die in
`logout()`. De tekst is `⏳ Inloggen…` in plaats van drie kale punten.
`data-soort` staat op het element zodat de testrun het van buitenaf kan
aflezen.

En `serverLogin()` breekt af na `LOGIN_TIMEOUT_MS` (12 s) via een
`AbortController`. Een afgebroken poging komt naar buiten als een gewone Error
zónder `.status` en `.code`, en valt in `doLogin()` dus in dezelfde tak als
"netwerk onbereikbaar" — daar hoort hij, en die tak bestond al.

Gecontroleerd: nul directe `err.textContent`-schrijvers over (alleen nog in een
commentaarregel die uitlegt wat er stond).

---

## 3. `public/pidlane-testrun.js` — knoppen weg, CAMPAGNE en blok 5 herschreven

### Weg: twee knoppen en b8 uit de standaardset

| was | nu |
|---|---|
| DID-scan (45 s) → `{b9}` | weg |
| Budget + olie → `{b7,b8}` | **Budget** → `{b7}` |
| standaardset bevatte `b8: true` | `b8` eruit |

Alle drie dienden de jacht op de mode 22-olietemperatuur, en die is op 23-08
losgelaten. **Die derde is de belangrijkste**: zonder hem waren de knoppen weg
maar scande élke volle run nog steeds, inclusief het header-gedoe op `7E0`.

`_blok8()` en `_blok9()` blijven staan en zijn los aan te roepen met
`startTestrun({b8:true})` of `{b9:true}`. Ze slopen is een mechanische stap van
ruim driehonderd regels en gaat apart.

### Blok 5 — vier nieuwe controles

**Waakknop overleeft een weergavewissel.** De knop wordt **bewust op `active`
gezet**, dan gaat `setPidView()` langs alle drie de standen, en na elke stand
wordt gekeken of de klasse er nog is. Daarna staan weergave én knop terug zoals
ze stonden. Dat opzetten is de kern van de tegenproef: bij een uitstaande
waakronde is "blijft dof" ook waar voor de oude, foute selector.

**Inlogmelding: bezig is grijs, fout is rood.** Draait `plLoginMeld()` op een
los element (het echte inlogscherm blijft ongemoeid) en toetst alle drie de
soorten, plus dat `LOGIN_TIMEOUT_MS` bestaat.

**Geen kale puntjes meer in doLogin.** Leest de bron. Dat mag hier: `doLogin`
wordt door niets gewrapt — `pidlane-remote.js` raakt `updPID`, `sendCmd`,
`clearDTC`, `realScanDTC`, `ensurePIDListActive` en `selectCategoryPIDs`, niet
de login. Een gedragstest kan dit niet zien, want daarvoor zou je een echte
inlogpoging moeten doen.

**Olieknoppen weg, b8 uit de standaardset.** Loopt de knoppen in `#testrunOv`
na en knipt de standaardset uit de bron van `startTestrun`. Knippad bewust smal
(`/blokken\s*\|\|\s*\{[^}]*\}/`), want een zoektocht op "b8" in de hele functie
vindt óók het commentaar erboven en meldt dan onterecht FOUT.

### Tegenproeven gedaan

- Oude setter (alles rood) nagebouwd → de nieuwe controle slaat af op "bezig in
  foutkleur". De test kan dus rood worden.
- Standaardset mét `b8` nagemaakt → knippad vindt hem. Echte set komt schoon
  door.
- `.pidview-btn` terugzetten → de waakknopcontrole slaat af.

### CAMPAGNE

19 vragen. Leidt met de drie wijzigingen van vandaag, daarna de openstaande
batch van 23-08 — die rit is nog niet gereden, dus die vragen blijven staan.

---

## 4. `PIDLANE-WERK.md`

§3 uitgebreid met "Nieuw op 24-08": waakknop, inlogmelding, testrun-opruiming.

---

## Eén patroon, drie keer

Alle drie de UI-vondsten van vandaag hebben dezelfde vorm: **één ding met twee
betekenissen, waarbij de ene de opmaak of de behandeling van de andere erft.**

- `active` op `#waakBtn` betekende zowel "waakronde loopt" als "dit is de
  gekozen weergave"
- `#loginErr` betekende zowel "er is een fout" als "we zijn bezig"
- `pidview-btn` betekende zowel "knop in deze rij" als "knop met een modus"

Dat is dezelfde soort fout als de fantoomsensor-familie uit §7 van het
werkdocument, maar dan in de UI. Als er straks nog UI-meldingen komen: kijk
eerst of het element of de klasse twee rollen heeft.

---

## Committen

Vier commits:

1. `pidlane-pids.js` — waakknop buiten de weergave-lus
2. `pidlane-auth.js` — inlogmelding via plLoginMeld, tijdslimiet op /auth/login
3. `pidlane-testrun.js` — 4.0: olieknoppen weg, b8 uit de standaardset,
   CAMPAGNE en blok 5 herschreven
4. `PIDLANE-WERK.md` — administratie

Gecontroleerd: `node --check` groen op alle drie de JS-bestanden, nul lege
catches in `pidlane-auth.js` en `pidlane-testrun.js` (ratel blijft op 0).
