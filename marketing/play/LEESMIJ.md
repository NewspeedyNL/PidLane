# marketing/play — de Play Store-vermelding

Wat er in de Console moet en waarom staat in `PLAY-INZENDING.md` §1–4 (één
plek). Dit is alleen hoe de beelden gemaakt worden.

```
node marketing/meekijken/opname.js   # meekijkschermen (twee toestellen, nep-server)
cp marketing/meekijken/opname/{delen,check}/0000.png marketing/play/rauw/
cp marketing/meekijken/opname/meekijken/0050.png marketing/play/rauw/meekijken.png
node marketing/play/opname.js        # de rest, in demomodus → rauw/
node marketing/play/render.js        # kop en lijst eromheen → uit/
```

`schermen.html` (de acht schermen, `?n=1..8`) en `grafiek.html` (1024×500) zijn
de opmaak; de koppen staan in `SCHERMEN` bovenin `schermen.html`.
