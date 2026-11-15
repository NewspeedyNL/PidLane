# marketing/hyperlane — de Hyperlane-beelden van de website

De echte app in demomodus: de Mazda CX-5 met het pakket van een echte CX-5
2018. Elke scène wordt opgewekt via het scenario van de demo (`_scenario`),
dus alles van poll tot tunnel is echte code. Altijd liggend en volledig
scherm, op twee toestellen: **telefoon** (915×412, de tunnel) en **tablet**
(1280×800, de cockpit).

```
node marketing/hyperlane/opname.js --proef        # één beeld per scène + controle (exit 1 = mis)
node marketing/hyperlane/opname.js                # de opname: beelden + tijden.json → opname/
node marketing/hyperlane/maak-video.js            # ffmpeg → uit/ (telefoon; --toestel tablet)
```

Kijk de video's in `uit/` na en zet ze dan met de hand in
`PidLane-Pitch/img/hl/`. `opname/` en `uit/` staan niet in git.

**Wat je aanpast** staat bovenin `opname.js`:

- `DRAAIBOEK`: per scène de duur, de stand, de vorm, het midden en de waarden
  per seconde. `verwacht` is de scène die Hyperlane moet laten zien; `--proef`
  controleert dat.
- `KEUZES`: de losse beelden van elke stand, vorm en elk midden.
- In `maak-video.js`: `KORT`, de scènes van de korte lus bovenaan de site.

**Drie dingen die je moet weten:**

- **Koelwater pollt traag.** Een nieuwe waarde komt na ongeveer 5 seconden.
  Koud, stil en hitte hebben daarom een lange aanloop.
- **De scenarioruis staat uit tijdens de opname.** Het scenario legt ±0,6% van
  het bereik over elke waarde (±1,7 km/h). Dan rijdt de auto nooit gelijkmatig
  en staat hij nooit stil. De app zelf houdt die ruis.
- **De tablet tekent traag in een headless browser** (software-GL, rond
  2,5 beelden per seconde). De tellers van Hyperlane (stilstand, cruise) lopen
  dan trager. Het script meet dat (`tempo`) en rekt alleen de aanlopen. Een
  tabletvideo krijgt daardoor weinig beelden per seconde; op een computer met
  een echte GPU gaat het beter.
