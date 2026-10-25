-- Endurecimiento operativo aditivo. No elimina ni reinterpreta datos heredados.

ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE legacy_migration_map ADD COLUMN resolution TEXT
  CHECK(resolution IN ('ACCEPTED_UNLINKED'));
ALTER TABLE legacy_migration_map ADD COLUMN resolved_by TEXT;
ALTER TABLE legacy_migration_map ADD COLUMN resolved_at TEXT;

CREATE INDEX IF NOT EXISTS idx_legacy_migration_resolution
ON legacy_migration_map(resolution, resolved_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  limiter_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK(attempts >= 0),
  window_started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
ON auth_rate_limits(updated_at);
