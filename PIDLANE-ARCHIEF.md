# PIDLANE-ARCHIEF.md — afgehandelde bevindingen

Dit is de staart van §11 van `PIDLANE.md`: bevindingen die zijn afgehandeld en
waarvan de uitleg ouder is dan twee weken. Ze staan hier omdat een herziene
conclusie meer waard is dan een weggepoetste — de `ATI`-vergissing in §1 van
`PIDLANE.md` is daar het voorbeeld van.

**Dit bestand wordt niet standaard gelezen.** Zoek er gericht in (`grep`) als
je wilt weten of iets eerder is geprobeerd en waarom het toen niet werkte.
Voor de huidige stand van zaken zijn de GitHub-issues de bron, voor de
architectuur `PIDLANE.md`.

Verplaatst op 02-09-2026. Snijlijn: alles gedateerd op of vóór 19-08-2026.

---

### De blijvende lijst

**Opgelost op 27-08:** wie vóór de tekstcorrectie akkoord gaf, gaf dat op een
onjuiste voorstelling van zaken (meetdata heette anoniem, is pseudoniem) — dat
akkoord is aanvechtbaar en mocht niet blijven gelden. `klantPubliek()` in
`worker.js` rekent nu `akkoordActueel` uit door `AkkoordOp` te vergelijken met
het moment van de correctie (`AKKOORD_TEKST_SINDS`); `_neemSessie()` in
`pidlane-klant.js` toont `openOnboarding()` opnieuw zolang dat niet actueel is,
zónder het proeftegoed er nog eens aan te koppelen — `StartTegoedGegeven` blijft
de enige gate daarvoor. Geen nieuw Airtable-veld nodig: `AkkoordOp` bestond al
en wordt al bij elk akkoord bijgewerkt. Getest in
`test-akkoord-heraccorderen.js`.

De bugmelder (`_bugDiag()` in `pidlane-auth.js`) stuurt bij het handmatig
melden van een bug de ruwe VIN mee, en dat is bewust: anders dan de logroute is
dit door de gebruiker zelf aangezwengeld, het staat sinds 27-08 bij het knopje
vermeld, en bij een bug over één specifiek voertuig is de VIN juist bruikbaar.
Geen open punt.

**Nieuw op 20-08 en nog open** — beide staan nu als issue: `0143` staat er 256×
naast (#14) en mode 22 leeft op deze CX-5 terwijl de identifier onbekend blijft
(#20).

**Opgelost op 20-08:** de merk-preset zette PIDs terug die de ECU ontkent
(§15 ronde 6); het brandstoftype kwam ná de scan die het moest sturen (§15b);
de wizard toonde voortgang voor voltooid werk (§15b).

1. **Restjes** — vijf losse eindjes uit de bedradingssweep, verzameld in #24.

2. **Geen herijking van de bronlijst.** `discoveredPIDDefs` wordt gebouwd
   tijdens de gezondheidsscan, wanneer het brandstoftype meestal nog onbekend
   is. Komt RDW later met "benzine", dan haalt `purgeImplausiblePids()` de
   AdBlue-tegel wel uit `activePIDs`, maar de bronlijst wordt niet herbouwd —
   dus de sensor staat nog gewoon in de keuzelijst. De gate is geen zuivere
   functie van de PID maar van (PID, huidige kennis); de bronlijst heeft dus
   invalidatie nodig. Ronde 5 in §15.
   **15-08-2026:** ronde 5 was al gebouwd om dit op te lossen, maar was nooit
   bedraad — zie §18. Nu wel. Dit punt geldt daarmee als opgelost, maar is nog
   niet in de praktijk bevestigd: eerste rit erna nakijken.

### Opgelost op 15-08-2026 — de ELM-poort en drie halve sloten

Aanleiding: het veldlog van 15-08 liet zien dat na een socket-dip de
ELM-herinitialisatie dwars door de pollus liep — `ATWS`/`ATE0`/`ATSP0`
afgewisseld met PID-requests, echo nog aan, protocoldetectie weggegooid, per
dip ~10 s onbruikbare data. Op een lange rit tientallen keren.

De `withBus('elm-init')`-wrapper in `pidlane-bt.js` was er al, maar dekte het
niet, om drie redenen die op één ding neerkomen: **het busslot is
adviserend.** Het werkt alleen voor code die eerst `PLBus.claim()` doet.

1. `sppReconnectGuard` plant de re-init met `setTimeout(60)` buiten de queue;
   in dat gat gaf de pollus zijn slot vrij en kon één vuile batch erdoorheen.
2. `PLBus.wait()` geeft na de limiet `0` terug en de aanroeper gaat tóch door
   — bewust, want de guard draait ín de `sendCmd` van de houder en zou anders
   deadlocken. Duurt een survey langer dan 8 s, dan draait de init ongelokt.
3. `PLBus.breek()` bij een nieuwe verbinding breekt élke houder open, ook een
   lopende `elm-init`.
   Plus de aanroepers die `PLBus` überhaupt niet raken: `03`/`04` in
   `pidlane-graph.js`, de AT-baseline-rollback in `pidlane-btflow.js`.

**Nu: een tweede, hárde poort naast het slot** (`pidlane-bt.js`,
`_elmPoortDicht/_elmPoortOpen/_elmSend`). Staat de poort dicht, dan weigeren
`sendCmd` én `sendBT` alles wat geen eenmalig doorlaatbewijs meebrengt; alleen
de init-reeks heeft dat. Het bewijs is one-shot en wordt synchroon gezet en
gewist — een "init loopt"-boolean zou de code die tijdens een `await` van de
init draait óók doorlaten. De poort gaat dicht op het moment dat de socket
dood wordt verklaard (niet pas in de `setTimeout`), open in de `finally` van
`_metElmBus` en ook bij een gefaalde of overgeslagen re-init, en vervalt na
15 s zodat een vastgelopen init de bus niet gijzelt. Een weigering gaat vóór
`PLBus.note()` en `trackBtQuality()` langs: telde hij mee, dan haalde
`_emptyStreak` binnen zes weigeringen de "verbinding dood"-drempel en trok de
app een herverbinding op gang — een reconnect-lus veroorzaakt door de
bescherming tegen reconnects. Test: `test-elmpoort.js`.

Drie fixes van dezelfde soort, gevonden bij het nalopen van "waar staat er nog
een slot dat niemand hoeft te gehoorzamen":

- **`pidlane-uitgebreid.js`** claimde de bus en negeerde de uitslag: bij
  `tok = 0` zond hij gewoon door een lopende sweep heen. Erger nog stond
  `_gedraaid = true` vóór de claim, en de probe draait maar één keer — één
  ongelukkig getimede probe boekte de hele uitgebreide PID-set voorgoed als
  "geen antwoord". Nu: bezet → overslaan, en `_gedraaid` pas zetten als er
  echt gemeten wordt.
- **`PLBus.claim()`** (`pidlane-data.js`) had een legacy-uitgang voor een
  verweesde `window._pollBusy`. Zonder eigenaar greep de `MAX_HOLD_MS`-noodrem
  daar niet — de bus kon dus permanent dichtstaan, precies in het geval
  waarvoor die noodrem bestaat. Nu `LEGACY_MAX_MS` (10 s), met het moment van
  signaleren als startpunt. Test: `test-busslot.js`.
- **De ATDPN-mismatchtak in `initELM327`** zette de fix uit het
  protocolgeheugen terug: week het bevestigde protocol af, dan stuurde hij
  `ATSP0` en klaar — terwijl het herverbindpad nooit doorgaat naar
  `scanNetworks()`. Adapter bleef in zoekmodus, `SEARCHING...` per commando
  (8,8 min over 101 commando's in het log van 04-08), en `pl_proto_id` bleef
  staan zodat de volgende reconnect hetzelfde foute protocol probeerde. Nu
  maakt die tak de detectie zelf af (`0100` + `ATDPN`), onthoudt het resultaat
  en werkt óók `selectedNetwork.id` bij — `_bekendProtocolId()` geeft die
  namelijk voorrang boven localStorage.
- **`_btGen`** werd alleen in de SPP-tak van `_sendBTOnce` gecontroleerd. In de
  BLE-, Web-BT- en Web-Serial-takken kon een commando uit de vorige sessie de
  buffer van de nieuwe leeglezen. Nu in alle vier.

### Opgelost op 31-07-2026

Voor de historie, zodat je niet opnieuw op zoek gaat:

- 7 dubbele DTC-sleutels (P0011, P0012, P0016, P0128, P0340, P0401, P0420).
  `DTCDB` was één objectliteraal met eerst een generieke en daarna merksecties;
  de laatste won, dus een Mazda kreeg bij P0128 de BMW-tekst. Nu gesplitst in
  `DTCDB` (generiek) plus `DTC_MERK` (zes merkbuckets), met een merkbewuste
  `dtcInfo()`. Zie §14.

- AI-calls werden serverzijdig niet afgerekend — nu wel, op echt verbruik (§8).
- Serversaldo ging verloren na herladen; `finishLogin` haalt het nu op.
- `fireAlert()` bestond nergens: elke waarschuwing van de caravancoach gooide
  een ReferenceError en brak de tick af.
- `/credits/redeem`: kapotte compare-and-set én een ongeldige datum in een
  dateTime-veld. Nu een DO-slot en een geldige ISO-tijd.
- Vervalcontrole activatiecodes brak op een gewijzigd veldtype.
- `handleKlantLogin` valideerde het e-mailadres niet vóór de Airtable-lookup.
- `/klant/reset-aanvraag` verklapte via een mislukte mail of een account bestond.
- `/klant/saldo-muteer` verwijderd — de app boekt niet meer zelf af.
- `testApiKey()` deed bij elke app-start een billable call: 1 token per keer dat
  een klant de app opende. Draait nu niet meer voor klantaccounts.
- Kasboek `TokenLog` toegevoegd, zodat saldomutaties navolgbaar zijn.
- Ondersteuningsbitmaps (`0120`, `0140`, `0160`…) en de freeze frame-DTC stonden
  als aankruisbare "raw"-sensor in de keuzelijst.
- Fantoomsensoren (AdBlue, NOx, SCR) werden aangeboden en gepollt op een
  benzineauto; het filter draaide alleen bij het rapport.
- Het bolletje op een tegel was groen tenzij een drempel werd overschreden, dus
  ook bij een sensor die nooit een waarde gaf.
- `applyG()` overschreef `className` en wiste daarmee `gc-manueel` bij de eerste
  meting.

