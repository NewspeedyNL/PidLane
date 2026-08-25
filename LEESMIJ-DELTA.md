# LEESMIJ-DELTA — 24-08-2026

```
cd ~/                       # de map WAARIN PidLane-main staat
unzip -o pidlane-delta-2408.zip
cd PidLane-main
bash plcheck.sh $(pwd)
```

Vijf bestanden. Testrun 3.8 → **4.5**. Zie ook OVERDRACHT-NIEUWE-CHAT.md.

---

## De correctie voorop

In een eerdere versie van deze delta stond de socket-instabiliteit als
hoofdprobleem in `PIDLANE-WERK.md`. **Dat was fout**, en de fout is leerzaam
genoeg om te bewaren: hij staat als herziening in het werkdocument, niet
weggepoetst.

Ik keek naar de meetdata (9 herverbindingen, drie gaten in de bulkopname) en
concludeerde "instabiele verbinding". Wat ik niet had gedaan is naar het
**logboek zelf** kijken. Dat heeft veertien stiltes op precies dezelfde
kloktijden — 179 s, 168 s, 177 s, 66 s. En dat is het bewijs: een dode socket
lógt fouten. Hier logt niets. Geen fout, geen poging, geen watchdog. Het proces
liep niet.

Android bevriest de JS-timers van een WebView op de achtergrond. Pollus,
recorder en logger stoppen tegelijk. Sluitstuk: elke herverbinding volgt direct
op een stilte. Om 23:31:00 hervat de app, 16 s later "socket dood na 012E1" —
het eerste commando in een socket die Android intussen heeft opgeruimd.

Aanleiding, van Nico: het logboek openen of opslaan schakelt naar een ander
venster, en bij terugkomst moet er herverbonden worden.

---

## 1. `public/pidlane-testrun.js` — 4.2

### Nieuw: blok 12, wie is deze adapter

Het logboek zegt `OBD2 adapter: OBDLink MX+ 90011` en pas daarna
`ELM327 v1.4b`. Dat tweede is de `ATI`-string, en juist die staat in
`PIDLANE.md` als bewijs dat dit een clone zonder STN-chip is. Maar een echte
OBDLink MX+ antwoordt op `ATI` óók met een ELM327-versie, puur voor
compatibiliteit.

Het onderscheid is één commando. `STI` kent geen enkele ELM327: een STN-adapter
antwoordt met eigen firmware, een clone met `?` of niets. Blok 12 vraagt `ATI`,
`STI` en `STDI`, meer niet — geen header, geen protocolwissel, niets richting de
auto.

Zegt hij "STN-adapter", dan zijn **STPX en MS-CAN wél beschikbaar** en raakt dat
de hele pollstrategie. Blok 12 staat daarom bewust op LET OP in dat geval: het
is geen fout, het is iets wat je moet weten.

Staat in de standaardset (`b12`), kost een seconde of twee.

### CAMPAGNE — 20 vragen, opnieuw opgezet rond de openstaande punten

Leidt met blok 12 en met de achtergrondproef, die in twee helften uiteenvalt:
eerst tien minuten rijden **zonder de app te verlaten**, daarna bewust drie keer
kort weg. Als de verklaring klopt, volgt op elke afwezigheid een herverbinding —
en op de eerste helft geen enkele. Dat is de tegenproef.

Verder erin: de klokvergelijking (UTC versus lokaal), de bevroren `0155`/`0156`
op 128, de raildruk die stilstond, de bitmaps in de bulkopname, en de opruimregel
met zeven concrete kandidaten in plaats van drie — de vier uit blok `0180`
(`018E`, `019D`, `019E`, `01A0`) horen erbij, want de ECU claimt ze en levert
niets.

Eruit: de tegelvraag over `0170`/`2102`/`2187`. Die kan op deze auto nooit "ja"
opleveren — steunbitblok `0160 = 41606B080001` decodeert naar
`62 63 65 67 68 6D 80`, dus geen `70`. De reden staat in de vervangende vraag,
zodat niemand hem over een half jaar terugzet.

### Eerder in deze delta, ongewijzigd

- Blok 5: vier controles erbij (waakknop, inlogmelding grijs/rood,
  `LOGIN_TIMEOUT_MS`, geen kale puntjes, olieknoppen weg). Alle vier met
  tegenproef nagerekend: de oude setter slaat af op "bezig in foutkleur", een
  standaardset mét `b8` wordt gevonden, `.pidview-btn` terugzetten laat de
  waakknopcontrole afgaan.
- "Niet geladen"-melding noemt nu de cache. Blok 5 stond twee keer op FOUT
  (23-08 veldlab, 24-08 pidgate) en beide keren was het weg na herladen.
- Olieknoppen weg, `b8` uit de standaardset.

---

## 2. `public/pidlane-pids.js` — waakknop dooft niet meer

`#waakBtn` draagt de klasse `pidview-btn` maar heeft geen `data-mode`, dus de
`active`-lus in `setPidView()` haalde zijn markering eraf terwijl `PLWaak`
gewoon doorliep. Selector nu `.pidview-btn[data-mode]`.

## 3. `public/pidlane-auth.js` — de drie puntjes + PLWake

### Uitloggen blijft uitloggen

**Je logde niet automatisch opnieuw in — je bent nooit uitgelogd geraakt.**

`logout()` vraagt een admin eerst of de volledige log bewaard moet worden. Zeg
je OK, dan opent een deel- of bestandsvenster, de app gaat naar de achtergrond,
en Android herlaadt de WebView bij terugkomst. Op dát moment stonden
`pl_session` en het sessietoken er nog gewoon, want het wissen gebeurde pas ná
de export. Het sessieherstel in `pidlane-theme.js` (regel 277, `tokLoad()`)
vindt een geldig token, roept `finishLogin()` aan, en je bent weer binnen.

Dezelfde achtergrondkwestie dus als de herverbindingen, maar met een ander
gevolg.

**Waarom niet gewoon alles vóór de export wissen:** de export leunt op
`window.APP_TOKEN`, en `tokClear()` maakt die leeg. Dan gaat de logbundel stuk —
precies de reden dat die vraag oorspronkelijk vooraan stond.

De uitlogvlag (`pl_uitloggen`) scheidt de twee. Bij het begin van `logout()`
gaat de vlag aan en verdwijnen `pl_session` en `pl_autoconn`; `tokLoad()` geeft
`null` zolang de vlag staat. Het token in het geheugen blijft leven tot de
export klaar is. Herstart de app tussendoor, dan vindt het herstel niets. De
vlag verdwijnt aan het einde van `logout()` en bij elke geslaagde `tokSave()` —
dat tweede is het vangnet, zodat een halverwege afgebroken uitlogpoging je niet
permanent buitensluit.

Gecontroleerd met een nagebouwde tegenproef: de oude `tokLoad()` zonder vlag
laat de nieuwe blok 5-controle afgaan op "tokLoad geeft nog een sessie", de
nieuwe komt groen door, en de vlag staat na afloop weer uit.

**Voor `PIDLANE.md`:** het sessieherstel staat in `pidlane-theme.js` — een
boot-kritisch pad in de module voor opmaak. Ik had er drie greps voor nodig.
Dat hoort op de architectuurkaart, los van deze bug.

### PLWake — scherm blijft aan tijdens de meting

Dekt één helft van het achtergrondprobleem: het scherm dat uitgaat. **Niet** de
andere helft — verlaat je de app echt, dan bevriest hij alsnog. Daarvoor is een
foreground service nodig en dat is native werk.

Twee dingen over de API die de implementatie sturen:

- De browser geeft de lock **zelf** vrij zodra de pagina uit beeld gaat. Geen
  risico dat hij blijft hangen, wel de plicht om hem bij terugkomst opnieuw aan
  te vragen — vandaar de `visibilitychange`-haak.
- Aanvragen terwijl de pagina verborgen is gooit een fout. Die slikken we; de
  volgende tik pakt het op.

Bewust **geen** haak in `handleConnect()`. Dat zou een tweede plek worden die
moet weten wanneer er gemeten wordt, en dat is precies het patroon waar dit
project al drie keer op is gestruikeld. `connected` staat in dit bestand en is
de enige waarheid; een tik van 5 s is goedkoop genoeg om die te volgen.

Weigert batterijbesparing de lock, dan komt er **één** melding, niet elke vijf
seconden. Dat is geen storing maar een instelling van de gebruiker.

`PLWake` hoort nog in de KRITIEK-lijst van `pidlane-bedrading.js` — dat bestand
zit niet in deze sessie, dus dat is aan jou of aan een volgende ronde.

### De drie puntjes

`doLogin()` zette `err.textContent = '…'` tijdens het wachten, en `#loginErr`
heeft inline `color:var(--rd)`. Een wachtindicator in de foutkleur. Alle veertien
schrijvers lopen nu via `plLoginMeld(el, tekst, soort)`, en `serverLogin()`
breekt af na 12 s — zonder tijdslimiet gaf een hangende fetch nooit een fout en
dus nooit een uitweg.

## 4. `PIDLANE-WERK.md`

Ritbevindingen van 23-08, de herziene oorzaak, de adapter als open vraag met de
`STI`-test, en de klokkwestie.

---

## Wat er NIET in zit

De vier vondsten uit de bulkopname zijn **vastgelegd, niet gerepareerd**:
`0155`/`0156` op de rauwe byte, raildruk bevroren op 9900, de bitmaps die
`pidlane-bulk.js` als sensorwaarde opneemt, en de twee klokbases. Vandaag
ontdekt, dus vandaag niet gefixt. Ze staan genummerd klaar.

Ook niet: de foreground service. Dat is de echte oplossing voor het
achtergrondprobleem en het is een eigen sessie waard — Capacitor-plugin, wake
lock, en een pollus die niet meer aan `setInterval` in een WebView hangt.

---

## Committen

1. `pidlane-pids.js` — waakknop buiten de weergave-lus
2. `pidlane-auth.js` — inlogmelding via plLoginMeld, tijdslimiet op /auth/login
3. `pidlane-testrun.js` — 4.2: blok 12, CAMPAGNE herzien, olieknoppen weg,
   blok 5 uitgebreid
4. `PIDLANE-WERK.md` — administratie

`node --check` groen op alle drie de JS-bestanden, nul lege catches.
