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
