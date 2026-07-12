-- Allow OAuth (Google) users who have no local password
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- OAuth linkage + profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Uniqueness of a provider identity, only for rows that have one
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity
  ON users (provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;
