BEGIN;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE TABLE IF NOT EXISTS device_sessions (
  token_hash text PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES devices(device_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS device_sessions_device ON device_sessions(device_id);
CREATE INDEX IF NOT EXISTS devices_user ON devices(user_id);
INSERT INTO schema_migrations(version) VALUES ('004-device-sessions') ON CONFLICT DO NOTHING;
COMMIT;
