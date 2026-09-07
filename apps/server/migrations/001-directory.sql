BEGIN;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  user_id text PRIMARY KEY CHECK (length(user_id) BETWEEN 1 AND 128),
  email text NOT NULL UNIQUE CHECK (split_part(email, '@', 1) = user_id AND position('@' IN email) > 1),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS teams (
  team_id uuid PRIMARY KEY,
  name text NOT NULL,
  created_by text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
  team_id uuid NOT NULL REFERENCES teams(team_id),
  user_id text NOT NULL REFERENCES users(user_id),
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE TABLE IF NOT EXISTS devices (
  device_id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(user_id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS projects (
  project_id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(team_id),
  name text NOT NULL,
  slug text NOT NULL,
  owner_id text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (team_id, slug)
);
INSERT INTO schema_migrations(version) VALUES ('001-directory') ON CONFLICT DO NOTHING;
COMMIT;
