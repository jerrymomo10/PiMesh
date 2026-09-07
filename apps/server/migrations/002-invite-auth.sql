BEGIN;
-- Keep existing IDs and foreign keys intact; new registrations use UUID strings.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_check;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci ON users (lower(email));
CREATE TABLE IF NOT EXISTS registration_invites (
  invite_id uuid PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  used_at timestamptz,
  used_by text REFERENCES users(user_id)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions (expires_at);
INSERT INTO schema_migrations(version) VALUES ('002-invite-auth') ON CONFLICT DO NOTHING;
COMMIT;
