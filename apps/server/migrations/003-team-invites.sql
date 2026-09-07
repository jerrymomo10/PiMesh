BEGIN;
CREATE TABLE IF NOT EXISTS team_invites (
  invite_id uuid PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES teams(team_id),
  code_hash text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  used_at timestamptz,
  used_by text REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS team_invites_team ON team_invites(team_id, created_at);
CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id, status);
INSERT INTO schema_migrations(version) VALUES ('003-team-invites') ON CONFLICT DO NOTHING;
COMMIT;
