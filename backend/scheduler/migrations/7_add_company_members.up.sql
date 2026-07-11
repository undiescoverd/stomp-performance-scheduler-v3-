CREATE TABLE IF NOT EXISTS company_members (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  eligible_roles JSONB NOT NULL DEFAULT '[]',
  gender        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  date_added    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_archived TIMESTAMPTZ,
  "order"       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_company_members_status ON company_members(status);
