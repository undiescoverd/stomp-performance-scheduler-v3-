-- Reusable, owner-scoped week templates. A template stores a Monday-relative
-- day pattern (TemplateSlot[]) that both the standalone New Schedule modal and
-- the tour wizard replay onto a chosen week-start. Owner-scoped exactly like
-- schedules: every read filters on user_id.
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slots JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_user_id ON templates(user_id);

-- Record which template a schedule was created from, enabling the in-place
-- "Update template" branch in the editor. Nullable and unconstrained: a
-- schedule created from "Blank week" leaves it NULL, and a dangling reference
-- (the template was later deleted) is harmless — the editor checks existence
-- before offering "Update template".
ALTER TABLE schedules ADD COLUMN template_id TEXT;
