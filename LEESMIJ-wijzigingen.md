# Wijzigingen — 4 augustus 2026

Uitpakken in de repo-root: de bestanden staan al onder `public/` en overschrijven
op hun plek. Veertien bestanden, geen nieuwe bestanden, geen verwijderde.

---

## 1. Waakronde: bevindingen wegtikken of negeren

**Aanleiding.** Waarschuwingen in de live-view flitsten voorbij. De strook boven
`#gGrid` herschreef `#wkRegel` elke seconde, dus een bevinding als "accuspanning
buiten bereik" verdween binnen een paar tellen onder de volgende "meet X…".

**Wat er is nagekeken.** `#wkStrook` is het enige dat boven `#gGrid` schrijft.
PLMon en PLWatch gaan naar `log()`, `showToast()` staat op `bottom:100px`. De
diagnose klopte dus; de plek was goed.

**Twee fouten in de eerste opzet, nu verholpen:**

- `#wkRegel` viel terug op `bev` (álle bevindingen) in plaats van `open`
  (openstaande). Je tikte een kaartje weg en dezelfde tekst kwam een regel lager
  terug zodra de meting stillag — tussen twee groepjes zit 12 s.
- Wegtikken gold één ronde. Bij ~30 sensoren is dat ruim drie minuten, dus een
  aanhoudende afwijking meldde zich de hele rit opnieuw.

**Nu:**

| gebaar | betekenis | levensduur |
|---|---|---|
| kort tikken op ✓ | gezien | tot de volgende ronde |
| ≥550 ms indrukken | negeren | hele sessie |

Genegeerde sensoren staan met 🔕 in de uitklaplijst en gaan met één tik weer aan
— ook wanneer ze inmiddels binnen bereik lezen en dus niet meer in `bev` zitten.
Anders was negeren een eenrichtingsdeur.

De badge in de kop telt alleen wat openstaat; het rondetotaal staat in de
tooltip. De statusregel meldt nu de voortgang halverwege een ronde in plaats van
"ronde start…".

**Bug gevonden tijdens het bouwen.** `teken()` loopt elke seconde en herschreef
`#wkVind` volledig. Viel dat midden in een druk, dan verdween de knop onder de
vinger uit het document, ging de impliciete pointer capture verloren en kwam
`pointerup` nooit aan bij `bindVind()`. De lang-indrukken-timer liep door en een
korte tik werd alsnog een negeer — ruwweg één op de tien keer. Opgelost door de
kaartjes niet te hertekenen zolang `_drukPid` gezet is, plus een `pointerup`-
vangnet op document-niveau.

Nieuw op `window.PLWaak`: `negeer(pid)`, `herstel(pid?)`, `genegeerd()`.

**Bestanden:** `pidlane-waakronde.js`, `pidlane.css`, `test-waakronde.js`
(9 nieuwe toetsen voor de gezien/negeer-filterlogica, 43 totaal).

---

## 2. Leesbaarheid: contrast

Grijze tekst op donkere achtergrond was niet alleen gevoelsmatig slecht
leesbaar, het viel ook onder de norm. WCAG vraagt 4,5:1 voor kleine tekst.

| token | was | nu | contrast |
|---|---|---|---|
| `--tx3` donker | `#5b6783` | `#8b97b2` | 3,41 → 6,59 |
| `--tx3` licht | `#8b95a8` | `#5f6a7d` | 3,02 → 5,46 |

`--tx3` wordt 111× gebruikt, dus dit is de hoofdmoot. Daarnaast negen plekken
met een eigen hardcoded grijs, buiten het tokenstelsel om: de Waakronde-strook
(`#5f7196` 4×, pijltje `#4a5b7d` op 2,83 — vrijwel onzichtbaar), de
categoriekopjes op het welkomstscherm, de mode06-oordeelregel, zeven labels in
Koopcheck, de HUD-naamregel, en de AI-laadtekst.

Nagerekend tegen alle drie de donkere ondergronden (`--bg`, `--sur`, `--sur2`).
Slechtste combinatie haalt nu 5,37:1. Geen lichte tekst meer onder 4,5:1.

---

## 3. Leesbaarheid: grootte en dekking

Alle `font-size:10px` naar 11px: 13 regels in de stylesheet, 37 inline verspreid
over `index.html` en tien modules. Ook de twee resterende 10,5px-labels.
Uitzondering: `body.uiL #vtag` blijft 10px, want die zit binnen `zoom:1.13` en
rendert al als ~11,3px.

Contrast is niet alleen kleur — `opacity` doet hetzelfde. Drie plekken haalden
de winst weer weg:

- `.gc.leeg .gv/.gunit` stond op 40% → 60%; het label 55% → 72%; de balk 35% → 50%.
- `.pl-m06-ruw` had beide problemen: 10px én 45% → nu 11px en 72%.
- `.wkRij.wkGen` (genegeerd) 50% → 62%.

Het signaal "nog geen data" of "genegeerd" blijft, maar is nu leesbaar.

**Let op:** er bestaat al een tekstgrootte S/M/L in het ☰-menu (`setUiScale`,
CSS-zoom, L = 1,13×). Die werkt hier bovenop.

---

## Validatie

- `node --check` op alle 37 modules
- `node test-waakronde.js` — 43 toetsen, 0 fout
- div-balans `index.html`: 780/780
- CSS-accolades: 1116/1116
- Diff tegen de vorige zip: alleen kleur- en fontgroottewaarden buiten
  `pidlane-waakronde.js`; geen structuur- of logicawijzigingen elders.
