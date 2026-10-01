-- ══════════════════════════════════════════════════════════════════
--  schema.sql — de logtabel in Cloudflare D1 (#262, #260)
--  Database: pidlane_log_db, binding LOGDB in wrangler.toml
--
--  WAAROM DIT BESTAND BESTAAT
--  Een schema dat alleen in een console-venster is ingetikt, bestaat
--  nergens: je kunt het niet teruglezen, niet vergelijken met wat de app
--  stuurt, en niet herstellen als de database weg is. Hier staat het wél,
--  en het verandert mee in dezelfde PR als de code die erop schrijft.
--
--  WAAR DE KOLOMMEN VANDAAN KOMEN — NIET VERZONNEN
--  Alles wat de app wegschrijft gaat door één poort: logToSheets() in
--  public/pidlane-auth.js. Die zet veertien velden altijd, en laat uit het
--  derde argument alleen door wat in AT_KOLOMMEN staat. De bugmelder
--  (submitBugReport) en de testrun (_liveSchrijf) gaan door diezelfde
--  poort. De lijst hieronder is de vereniging van die twee verzamelingen
--  en verder niets — geen kolom die niemand vult, geen kolom die de app
--  wel stuurt en hier ontbreekt.
--
--  DE NAMEN BLIJVEN GELIJK AAN WAT DE APP STUURT, en dat is met opzet.
--  Zou D1 snake_case gebruiken, dan komt er een vertaaltabel in de Worker
--  tussen — een tweede plek waar veldnamen staan, die uit de pas gaat
--  lopen zodra er één bijkomt. Dat is precies de vorm die in dit project
--  al drie keer een bug was. Bijkomend voordeel: de app hoeft niet mee te
--  veranderen, dus de payload die vandaag naar Airtable gaat past morgen
--  ongewijzigd op D1.
--
--  ÉÉN KOLOM IS NIEUW: `ontvangen`. `Timestamp` komt van de telefoon en
--  dus van de klok van de telefoon. Die kan verkeerd staan, en bij een
--  meetgat is juist de volgorde de vraag. `ontvangen` wordt door de
--  Worker gezet en is daarmee de enige tijd waarop je kunt sorteren
--  zonder aan te nemen dat het toestel gelijk liep.
--
--  PLAKKEN IN DE D1-CONSOLE? HAAL EERST HET COMMENTAAR ERUIT.
--  De console van het Cloudflare-dashboard struikelt over `--`-regels en
--  over meerdere statements met lege regels ertussen. Nagemeten op
--  22-09-2026: kaal plakken werkt, dit bestand ongewijzigd plakken niet.
--  De kale versie maken (levert exact hetzelfde schema op):
--
--    grep -v '^\s*--' schema.sql | tr -s ' \n' ' ' | tr ';' '\n'
--
--  Werkt ook dát niet, dan neemt die console maar één statement per keer:
--  regel voor regel plakken, in volgorde.
-- ══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS telemetry_logs;

CREATE TABLE IF NOT EXISTS logregels (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Door de Worker gezet, niet door het toestel. Zie de kop.
  ontvangen     TEXT    NOT NULL,

  -- ── de veertien die logToSheets() altijd zet ────────────────────
  Timestamp     TEXT,   -- ISO-tijd van het toestel
  Type          TEXT,   -- info | opvallend | error | bug | ok
  Message       TEXT,   -- afgekapt op 500 tekens door de app
  Merk          TEXT,
  Year          TEXT,
  VIN           TEXT,   -- pseudoniem, nooit ruw — zie §7 van PIDLANE.md
  Protocol      TEXT,
  ActivePIDs    TEXT,   -- spatiegescheiden lijst
  AppVersion    TEXT,
  User          TEXT,
  Role          TEXT,
  RecordType    TEXT,   -- testrun | meting | bug | ...
  SessionId     TEXT,   -- ritnummer; bindt conclusie aan bewijs (#256)
  Adapter       TEXT,

  -- ── de rest van AT_KOLOMMEN, alleen gevuld waar van toepassing ──
  SchemaVersion TEXT,
  UserId        TEXT,
  Model         TEXT,
  VinHash       TEXT,
  DTC           TEXT,
  PIDs          TEXT,
  AiQuery       TEXT,
  AiDiagnose    TEXT,
  Outcome       TEXT,   -- gesloten | bevinding | nog niet (#257)
  Feedback      TEXT,
  Demo          INTEGER,-- 0/1 — een demo-rit hoort herkenbaar te zijn
  Repro         TEXT,   -- draagt bij een opdracht de issuenummers
  Device        TEXT,

  -- ── vangnet ─────────────────────────────────────────────────────
  -- Komt er een veld binnen dat hierboven niet staat, dan gaat het
  -- hierheen in plaats van stilletjes verloren te raken. Leeg is het
  -- normale geval; staat hier iets in, dan mist er een kolom en is dat
  -- te zien in plaats van te raden.
  onbekend      TEXT
);

-- ── indexen ───────────────────────────────────────────────────────
-- Waar werkelijk op gezocht wordt: één rit terugvinden (#256), de
-- laatste regels bekijken, testrun-regels scheiden van gewone meldingen,
-- en zien welke issues een uitkomst kregen (#257).
CREATE INDEX IF NOT EXISTS idx_log_sessie     ON logregels (SessionId);
CREATE INDEX IF NOT EXISTS idx_log_ontvangen  ON logregels (ontvangen DESC);
CREATE INDEX IF NOT EXISTS idx_log_soort      ON logregels (RecordType);
CREATE INDEX IF NOT EXISTS idx_log_outcome    ON logregels (Outcome) WHERE Outcome IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════
--  DE MEETOPDRACHTEN (#241)
-- ──────────────────────────────────────────────────────────────────
--  Stond in dezelfde Airtable-base als de log, en lag daardoor op 22-09
--  óók stil: een volle base neemt geen nieuwe rijen meer aan, dus de rit
--  kon niets wegschrijven én de volgende rit kon geen opdracht krijgen.
--  Twee helften van één lus achter dezelfde limiet is één storing te veel.
--
--  De Worker kent de VORM van een opdracht niet en wil hem niet kennen —
--  `Opdracht` is tekst, en het keuren gebeurt in pidlane-opdracht.js met
--  de witte lijst. Dat blijft precies zo; alleen de bewaarplaats verandert.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS meetopdrachten (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  Naam      TEXT NOT NULL,
  Reden     TEXT,
  -- 1 = actief, 0 = uit maar kiesbaar in de meetkamer, -1 = afgerond
  -- (archief: niet in de lijst, dus geen oordeel en niets verzonden; sinds
  -- 24-09-2026). Meer dan één actieve rij is een fout van de schrijver; de
  -- route pakt dan de laatst gewijzigde en zegt hoeveel er stonden.
  --
  -- LET OP BIJ HET VULLEN — gemeten op 22-09-2026 bij de overzet uit
  -- Airtable: daar stonden alle negen rijen op actief én droegen er acht
  -- exact dezelfde `Gewijzigd`. Dan is "de laatst gewijzigde" een
  -- achtvoudig gelijkspel en bepaalt SQLite wie er wint. Hij gaf de
  -- oudste rij terug — precies degene die in zijn eigen notitie zei dat
  -- hij al beantwoord was. Geef elke rij dus een eigen tijdstempel.
  Actief    INTEGER NOT NULL DEFAULT 0,
  Gewijzigd TEXT NOT NULL,
  Opdracht  TEXT NOT NULL,
  -- De uitleg voor de mens die de rit rijdt: waarom deze opdracht bestaat,
  -- wat er al gemeten is, in welke volgorde je moet meten. De Worker leest
  -- dit veld niet en de app dus ook niet — het komt alleen in beheer.html
  -- langs, omdat de adminroute de hele rij teruggeeft.
  --
  -- Hij staat hier omdat de Airtable-tabel hem had en de teksten tot 2.126
  -- tekens droegen. Zonder deze kolom was dat bij de verhuizing stilletjes
  -- weggevallen, en dat is precies wat een migratie niet hoort te doen.
  Notitie   TEXT
);

-- BESTAAT DE TABEL AL? Dan doet CREATE TABLE IF NOT EXISTS hierboven niets
-- en komt de kolom er niet bij. Op zo'n database één keer met de hand:
--
--   ALTER TABLE meetopdrachten ADD COLUMN Notitie TEXT;
--
-- Dat is op 22-09-2026 al gedaan op pidlane_log_db; deze regel staat er
-- voor de volgende omgeving, niet voor die ene.
CREATE INDEX IF NOT EXISTS idx_opdracht_actief ON meetopdrachten (Actief, Gewijzigd DESC);

-- ══════════════════════════════════════════════════════════════════
--  WAT SQL HIER MOGELIJK MAAKT EN AIRTABLE NIET
-- ──────────────────────────────────────────────────────────────────
--  De wens was "één logregel voor een hele sessie". Bij Airtable zou dat
--  betekenen: die samenvatting ERBIJ schrijven, als extra rij. Dan staan
--  het totaal en de regels waaruit het volgt los van elkaar, en lopen ze
--  uit de pas zodra er een regel bijkomt of weggaat — dezelfde vorm die
--  §11 en PIDLANE-WERK.md de kop kostte.
--
--  In SQL hoeft dat niet: een samenvatting is een VRAAG, geen rij. De
--  views hieronder bewaren niets en kunnen dus per definitie niet uit de
--  pas lopen met de regels eronder. Ze zijn ook alleen-leesbaar, en dat
--  klopt: afgeleide cijfers hoor je niet met de hand te kunnen bijstellen.
-- ══════════════════════════════════════════════════════════════════

-- Eén regel per rit: wanneer, hoe lang, hoeveel, en wat eruit kwam.
--
--  DE ISSUES-KOLOM VRAAGT EEN SPLITSER, EN DAT IS GEEN NETHEID.
--  `Repro` draagt twee betekenissen, en dat is de fout eronder: bij een
--  losse proef staat er één issue ("#226"), bij de uitkomstregel van een
--  opdracht de hele lijst als één tekst ("#226 #64"). GROUP_CONCAT(DISTINCT)
--  ziet die twee als verschillende waarden, en dan staat er op het scherm
--  "#226,#64,#226 #64" — gemeten op 22-09-2026 op de rit van 14:55.
--
--  De recursieve CTE hieronder hakt elke Repro op spaties uiteen, ontdubbelt
--  en plakt hem weer aan elkaar. Daarmee leest de kolom goed voor oude én
--  nieuwe regels, zonder dat de app iets hoeft te veranderen.
--
--  DIT IS EEN PLEISTER EN GEEN GENEZING. De echte oplossing is dat `Repro`
--  één ding betekent; dat vraagt een wijziging in pidlane-testrun.js en
--  raakt de app. Zolang die er niet is, doet deze view het werk — maar het
--  blijft één kolom met twee betekenissen, en dat is in dit project al drie
--  keer een bug geweest.
DROP VIEW IF EXISTS sessies;
CREATE VIEW sessies AS
WITH RECURSIVE
  -- "#226 #64" wordt twee rijen. De spatie erachter is de stopvoorwaarde.
  splitsing(SessionId, rest, stuk) AS (
    SELECT SessionId, Repro || ' ', NULL
      FROM logregels
     WHERE SessionId IS NOT NULL AND SessionId <> ''
       AND Outcome   IS NOT NULL AND Outcome   <> ''
       AND Repro     IS NOT NULL AND Repro     <> ''
    UNION ALL
    SELECT SessionId,
           substr(rest, instr(rest, ' ') + 1),
           trim(substr(rest, 1, instr(rest, ' ') - 1))
      FROM splitsing
     WHERE rest <> ''
  ),
  perIssue AS (
    SELECT SessionId, GROUP_CONCAT(stuk, ' ') AS issues
      FROM (SELECT DISTINCT SessionId, stuk
              FROM splitsing
             WHERE stuk IS NOT NULL AND stuk <> ''
             ORDER BY SessionId, stuk)
     GROUP BY SessionId
  )
SELECT
  l.SessionId                                                  AS SessionId,
  MIN(l.ontvangen)                                             AS begonnen,
  MAX(l.ontvangen)                                             AS geeindigd,
  COUNT(*)                                                     AS regels,
  SUM(CASE WHEN l.Type = 'error'     THEN 1 ELSE 0 END)        AS fouten,
  SUM(CASE WHEN l.Type = 'opvallend' THEN 1 ELSE 0 END)        AS opvallend,
  SUM(CASE WHEN l.Outcome IS NOT NULL AND l.Outcome <> '' THEN 1 ELSE 0 END) AS uitkomsten,
  i.issues                                                     AS issues,
  MAX(l.RecordType)                                            AS RecordType,
  MAX(l.Merk)                                                  AS Merk,
  MAX(l.AppVersion)                                            AS AppVersion,
  MAX(l.Adapter)                                               AS Adapter,
  MAX(l.Demo)                                                  AS Demo
FROM logregels l
LEFT JOIN perIssue i ON i.SessionId = l.SessionId
WHERE l.SessionId IS NOT NULL AND l.SessionId <> ''
GROUP BY l.SessionId;

-- Wat er mis was, zonder de duizend regels eromheen. Dit is met de hand
-- het werk dat CLAUDE.md beschrijft: "haal er FOUT en LET OP met hun
-- blokkop uit, en plak dat". Nu is het een vraag in plaats van knipwerk.
DROP VIEW IF EXISTS bevindingen;
CREATE VIEW bevindingen AS
SELECT id, ontvangen, Timestamp, SessionId, RecordType, Type,
       Outcome, Repro, Message, Adapter, AppVersion
FROM logregels
WHERE Type IN ('error', 'opvallend', 'bug')
   OR (Outcome IS NOT NULL AND Outcome <> '');

-- ══════════════════════════════════════════════════════════════════
--  HET LOGARCHIEF (01-10-2026)
--  Eén rij per rit (of per dag voor regels zonder rit) met de samenvatting
--  van logregels die ouder zijn dan de bewaartermijn. logArchiveren() in
--  worker.js vult hem en wist de ruwe regels in dezelfde transactie; de
--  Worker maakt de tabel zelf aan bij de eerste aanroep. De tekst is gelijk
--  aan LOG_ARCHIEF_SCHEMA in worker.js, en test-logarchief.js eist dat.
--  soorten = {"testrun":120,…}; bevindingen = {"lijst":[[type,melding,n],…],"meer":n}.
--  Geen User, UserId, VIN of VinHash: het archief overleeft een gewiste klant.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS log_archief (sleutel TEXT PRIMARY KEY, SessionId TEXT, dag TEXT NOT NULL, begonnen TEXT NOT NULL, geeindigd TEXT NOT NULL, regels INTEGER NOT NULL DEFAULT 0, fouten INTEGER NOT NULL DEFAULT 0, opvallend INTEGER NOT NULL DEFAULT 0, bugs INTEGER NOT NULL DEFAULT 0, uitkomsten INTEGER NOT NULL DEFAULT 0, demo INTEGER, soorten TEXT, issues TEXT, merk TEXT, bouwjaar TEXT, versie TEXT, adapter TEXT, protocol TEXT, bevindingen TEXT, gearchiveerd TEXT NOT NULL);

-- ══════════════════════════════════════════════════════════════════
--  KLANTPLATFORM — "Mijn voertuigen" (27-09-2026)
--  De Worker voert deze statements zelf uit bij de eerste aanroep
--  (kpSchema in worker.js); hier staan ze om terug te kunnen lezen wat er
--  staat. De tekst is gelijk aan KP_SCHEMA in worker.js, en
--  test-klantplatform.js eist dat — één schema, niet twee.
--  kenteken_enc is AES-GCM-versleuteld (KENTEKEN_SLEUTEL), vin_pseudo is
--  het pseudoniem uit de app; een e-mailadres staat hier nergens.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS kp_akkoord (klant_id TEXT PRIMARY KEY, versie TEXT NOT NULL, op TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kp_voertuig (id TEXT PRIMARY KEY, klant_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'actief', naam TEXT, kenteken_enc TEXT, vin_pseudo TEXT, merk TEXT, model TEXT, bouwjaar INTEGER, brandstof TEXT, motor TEXT, cilinderinhoud INTEGER, vermogen_kw INTEGER, turbo TEXT, transmissie TEXT, rijprofiel TEXT, verbruik_opgegeven REAL, kmstand INTEGER, kmstand_op TEXT, apk_tot TEXT, onderhoud_km INTEGER, onderhoud_datum TEXT, notities TEXT, gezondheid TEXT, laatst_gezien TEXT, aangemaakt TEXT NOT NULL, bijgewerkt TEXT NOT NULL, gearchiveerd_op TEXT);
CREATE INDEX IF NOT EXISTS idx_kp_voertuig_klant ON kp_voertuig (klant_id, status);
CREATE TABLE IF NOT EXISTS kp_rapport (id TEXT PRIMARY KEY, klant_id TEXT NOT NULL, voertuig_id TEXT NOT NULL, soort TEXT NOT NULL, titel TEXT, tekst TEXT NOT NULL, aangemaakt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_kp_rapport_vt ON kp_rapport (voertuig_id, aangemaakt DESC);
CREATE TABLE IF NOT EXISTS kp_rit (id TEXT PRIMARY KEY, klant_id TEXT NOT NULL, voertuig_id TEXT NOT NULL, start TEXT NOT NULL, eind TEXT, duur_s INTEGER, km REAL, gem_kmh REAL, max_kmh REAL, verbruik_l100 REAL, liters REAL, max_koelwater REAL, min_accu REAL, stationair_pct REAL, codes TEXT, bevindingen TEXT, extra TEXT, aangemaakt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_kp_rit_vt ON kp_rit (voertuig_id, start DESC);
CREATE TABLE IF NOT EXISTS kp_issue (id TEXT PRIMARY KEY, klant_id TEXT NOT NULL, voertuig_id TEXT NOT NULL, sleutel TEXT NOT NULL, soort TEXT NOT NULL, titel TEXT, ernst TEXT, status TEXT NOT NULL DEFAULT 'open', eerst_gezien TEXT NOT NULL, laatst_gezien TEXT NOT NULL, aantal INTEGER NOT NULL DEFAULT 1, gesloten_op TEXT, notitie TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kp_issue_sleutel ON kp_issue (voertuig_id, sleutel);
CREATE TABLE IF NOT EXISTS kp_voorkeur (klant_id TEXT PRIMARY KEY, data TEXT NOT NULL, bijgewerkt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kp_pid_bib (id TEXT PRIMARY KEY, merk TEXT NOT NULL, model TEXT NOT NULL DEFAULT '', code TEXT NOT NULL, ecu TEXT NOT NULL DEFAULT '', naam TEXT NOT NULL, formule TEXT NOT NULL, eenheid TEXT, bron TEXT NOT NULL, url TEXT, aangemaakt TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kp_pid_bib_code ON kp_pid_bib (merk, model, code, ecu);
CREATE TABLE IF NOT EXISTS kp_pid_stem (bib_id TEXT NOT NULL, klant_id TEXT NOT NULL, uitkomst TEXT NOT NULL, op TEXT NOT NULL, PRIMARY KEY (bib_id, klant_id));
-- Later bijgekomen kolommen (KP_MIGRATIES in worker.js). De Worker voert ze
-- zelf uit; "duplicate column" betekent dat ze er al staan.
ALTER TABLE kp_voertuig ADD COLUMN onderhoud_laatst TEXT;
ALTER TABLE kp_voertuig ADD COLUMN distributie TEXT;
ALTER TABLE kp_voertuig ADD COLUMN pid_selectie TEXT;
ALTER TABLE kp_voertuig ADD COLUMN versnellingen INTEGER;
ALTER TABLE kp_voertuig ADD COLUMN gear_model TEXT;
ALTER TABLE kp_rit ADD COLUMN label TEXT;
ALTER TABLE kp_voertuig ADD COLUMN tankinhoud INTEGER;
ALTER TABLE kp_voertuig ADD COLUMN brandstofprijs REAL;
ALTER TABLE kp_voertuig ADD COLUMN carrosserie TEXT;
ALTER TABLE kp_voertuig ADD COLUMN kleur TEXT;
UPDATE kp_voertuig SET carrosserie = NULL, kleur = NULL WHERE carrosserie IS NOT NULL OR kleur IS NOT NULL;
ALTER TABLE kp_voertuig ADD COLUMN eigen_pids TEXT;
