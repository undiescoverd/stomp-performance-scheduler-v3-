-- Backfill isCompanyRedDay onto the earliest 'dayoff' show in each schedule's
-- shows_data. Before this release the algorithm treated ANY day off as
-- everyone's RED day, always the earliest by date when a week held more than
-- one. This makes that choice explicit and opt-in going forward (a scheduler
-- now nominates the day), while keeping every existing schedule's computed
-- behavior identical to what it was before the flag existed.
--
-- shows_data is written as JSON.stringify(shows) bound to a jsonb column
-- (create.ts/update.ts), which every row in production stores as a jsonb
-- STRING scalar holding JSON text, not a native jsonb array — read back with
-- JSON.parse(row.shows_data) on the application side. A migration operating
-- on the raw column directly must therefore unwrap that string to get the
-- real array, and re-wrap the result the same way, or it either crashes
-- (jsonb_array_elements on a scalar) or silently changes a row's on-disk
-- shape to one the app's JSON.parse-based read path can no longer parse.
-- `valid` does the one-time unwrap; `rebuilt` re-wraps per each row's
-- original_type, so every row leaves in the exact shape it arrived in.
--
-- Only schedules that actually contain a 'dayoff' element are touched: the
-- join against earliest_dayoff excludes everything else, so a schedule with
-- an empty or all-show shows_data is never rewritten.
WITH normalized AS (
  SELECT
    s.id,
    jsonb_typeof(s.shows_data) AS original_type,
    CASE jsonb_typeof(s.shows_data)
      WHEN 'array' THEN s.shows_data
      WHEN 'string' THEN (s.shows_data #>> '{}')::jsonb
      ELSE NULL
    END AS shows_arr
  FROM schedules s
),
valid AS (
  SELECT * FROM normalized WHERE shows_arr IS NOT NULL AND jsonb_typeof(shows_arr) = 'array'
),
earliest_dayoff AS (
  SELECT
    v.id AS schedule_id,
    (array_agg(elem.ordinality ORDER BY elem.value ->> 'date' ASC))[1] AS ordinality
  FROM valid v
       CROSS JOIN LATERAL jsonb_array_elements(v.shows_arr) WITH ORDINALITY AS elem(value, ordinality)
  WHERE elem.value ->> 'status' = 'dayoff'
  GROUP BY v.id
),
rebuilt AS (
  SELECT
    v.id AS schedule_id,
    v.original_type,
    jsonb_agg(
      CASE
        WHEN elem.ordinality = ed.ordinality
          THEN jsonb_set(elem.value, '{isCompanyRedDay}', 'true')
        ELSE elem.value
      END
      ORDER BY elem.ordinality
    ) AS new_arr
  FROM valid v
  JOIN earliest_dayoff ed ON ed.schedule_id = v.id
       CROSS JOIN LATERAL jsonb_array_elements(v.shows_arr) WITH ORDINALITY AS elem(value, ordinality)
  GROUP BY v.id, v.original_type
)
UPDATE schedules
SET shows_data = CASE rebuilt.original_type
  WHEN 'string' THEN to_jsonb(rebuilt.new_arr::text)
  ELSE rebuilt.new_arr
END
FROM rebuilt
WHERE schedules.id = rebuilt.schedule_id;
