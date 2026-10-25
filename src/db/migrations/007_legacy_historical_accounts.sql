CREATE TABLE IF NOT EXISTS historical_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  reservation_id INTEGER REFERENCES reservations(id) ON DELETE RESTRICT,
  stay_id INTEGER REFERENCES stays(id) ON DELETE RESTRICT,
  guest_name TEXT NOT NULL,
  room_name TEXT NOT NULL,
  concept TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  paid_cents INTEGER NOT NULL CHECK(paid_cents >= 0),
  balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0),
  legacy_status TEXT NOT NULL,
  legacy_date TEXT NOT NULL,
  historical_payment_method TEXT,
  historical_payment_recorded_at TEXT,
  payment_date_basis TEXT CHECK(payment_date_basis IN ('MIGRATION_DATE')),
  needs_review INTEGER NOT NULL DEFAULT 0 CHECK(needs_review IN (0, 1)),
  review_notes TEXT,
  source_payload TEXT NOT NULL,
  migrated_at TEXT NOT NULL,
  UNIQUE(source_table, source_id),
  CHECK(paid_cents <= total_cents),
  CHECK(
    (paid_cents = 0 AND historical_payment_method IS NULL AND historical_payment_recorded_at IS NULL AND payment_date_basis IS NULL)
    OR
    (paid_cents > 0 AND historical_payment_method = 'Desconocido' AND historical_payment_recorded_at IS NOT NULL AND payment_date_basis = 'MIGRATION_DATE')
  )
);

CREATE INDEX IF NOT EXISTS idx_historical_accounts_customer
ON historical_accounts(customer_id, legacy_date);

CREATE INDEX IF NOT EXISTS idx_historical_accounts_review
ON historical_accounts(needs_review, migrated_at);
