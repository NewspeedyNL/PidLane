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
  -- 0/1. Meer dan één actieve rij is een fout van de schrijver; de route
  -- pakt dan de laatst gewijzigde en zegt hoeveel er stonden.
  Actief    INTEGER NOT NULL DEFAULT 0,
  Gewijzigd TEXT NOT NULL,
  Opdracht  TEXT NOT NULL
);
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
DROP VIEW IF EXISTS sessies;
CREATE VIEW sessies AS
SELECT
  SessionId                                                    AS SessionId,
  MIN(ontvangen)                                               AS begonnen,
  MAX(ontvangen)                                               AS geeindigd,
  COUNT(*)                                                     AS regels,
  SUM(CASE WHEN Type = 'error'     THEN 1 ELSE 0 END)          AS fouten,
  SUM(CASE WHEN Type = 'opvallend' THEN 1 ELSE 0 END)          AS opvallend,
  SUM(CASE WHEN Outcome IS NOT NULL AND Outcome <> '' THEN 1 ELSE 0 END) AS uitkomsten,
  -- Welke issues deze rit een antwoord kregen. Repro draagt bij een
  -- opdracht de issuenummers; dit is de vraag van #257 in één kolom.
  GROUP_CONCAT(DISTINCT CASE WHEN Outcome IS NOT NULL AND Outcome <> ''
                             THEN Repro END)                   AS issues,
  MAX(RecordType)                                              AS RecordType,
  MAX(Merk)                                                    AS Merk,
  MAX(AppVersion)                                              AS AppVersion,
  MAX(Adapter)                                                 AS Adapter,
  MAX(Demo)                                                    AS Demo
FROM logregels
WHERE SessionId IS NOT NULL AND SessionId <> ''
GROUP BY SessionId;

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
