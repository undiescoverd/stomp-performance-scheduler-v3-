-- Durable one-time marker for company roster seeding, replacing the
-- COUNT(*)==0 check: a count-based check re-seeds the 12 defaults whenever
-- company_members is empty, which resurrects a roster a user intentionally
-- deleted down to zero. A singleton marker row, written only after every
-- default insert succeeds, seeds exactly once and never re-triggers —
-- while still healing a partial seed (crash mid-insert leaves no marker,
-- so the next call retries; ON CONFLICT DO NOTHING on company_members makes
-- that safe).
CREATE TABLE IF NOT EXISTS company_seed_marker (
  id INTEGER PRIMARY KEY,
  seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
