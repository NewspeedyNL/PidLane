-- Wat de app verzamelt voor de grenzen van aandrijfUitRdw (#695). Alleen lezen.
-- Plakken in Cloudflare → D1 → pidlane_log_db → Console, of via de D1-tool.
-- Een regel per model per toestel (`aandrijf`, antwoord '-') en per antwoord
-- van een mens op "Kan deze auto elektrisch wegrijden?" (ja / nee).
--
-- Wat te zoeken:
--   mild-grens   AANDRIJF_MILD_KW = 15: de hoogste kwE met antwoord 'nee' en de
--                laagste met 'ja'. Ligt er een 'ja' onder 15 of een 'nee' erboven,
--                dan klopt de grens niet.
--   serieel      AANDRIJF_SERIEEL_FACTOR = 1,05: kwE / kwM per merk naast de vorm.
SELECT
  Merk,
  Message,
  COUNT(*) AS n,
  MIN(Timestamp) AS eerst
FROM logregels
WHERE Type = 'aandrijf'
GROUP BY Message
ORDER BY Merk, Message;
