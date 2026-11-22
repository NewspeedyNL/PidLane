-- De oogst (22-11-2026): wat de ritten sinds een datum opleverden, per meetopdracht.
-- Eén query, geen plakwerk per issue. Claude draait hem via de D1-koppeling; met de hand:
-- Cloudflare → D1 → pidlane_log_db → Console. Zet de datum op de laatste oogst.
--
-- 1. Per actieve opdracht: de laatste uitkomst, of waarom hij niet af kwam.
WITH sinds AS (SELECT '2026-11-16' AS d),
uit AS (
  SELECT OpdrachtId, Staat, Reden, Gezet,
         ROW_NUMBER() OVER (PARTITION BY OpdrachtId ORDER BY Gezet DESC) AS nr,
         COUNT(*) OVER (PARTITION BY OpdrachtId) AS n,
         SUM(Staat = 'gesloten') OVER (PARTITION BY OpdrachtId) AS dicht
  FROM opdracht_uitkomsten WHERE Gezet >= (SELECT d FROM sinds)
)
SELECT m.id, m.Naam,
       COALESCE(u.Staat, 'geen uitkomst') AS laatste, u.n AS ritten, u.dicht AS gesloten,
       substr(COALESCE(u.Reden, ''), 1, 160) AS reden, substr(u.Gezet, 1, 16) AS op
FROM meetopdrachten m LEFT JOIN uit u ON u.OpdrachtId = m.id AND u.nr = 1
WHERE m.Actief >= 0
ORDER BY (u.Staat = 'gesloten'), m.id;

-- 2. Waarom proeven niet af kwamen: het ritverslag van de meetcoach (sinds 22-11-2026).
-- Message draagt de kop en open=[…] (hoogstens 500 tekens, 90 per proef).
SELECT substr(ontvangen, 1, 16) AS op, SessionId, Message
FROM logregels
WHERE Type = 'meetcoach' AND ontvangen >= '2026-11-16'
ORDER BY id DESC LIMIT 30;
