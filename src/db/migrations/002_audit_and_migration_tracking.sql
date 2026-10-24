CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
ON audit_logs(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
ON audit_logs(entity, entity_id);

CREATE TABLE IF NOT EXISTS legacy_migration_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'MIGRATED', 'REVIEW', 'SKIPPED')),
  notes TEXT,
  migrated_at TEXT,
  UNIQUE(source_table, source_id, target_table)
);

CREATE INDEX IF NOT EXISTS idx_legacy_migration_status
ON legacy_migration_map(status, source_table);
