CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  stay_id INTEGER NOT NULL REFERENCES stays(id) ON DELETE RESTRICT,
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK(tax_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents >= 0),
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  paid_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(paid_amount_cents >= 0),
  balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0),
  status TEXT NOT NULL CHECK(status IN ('Borrador', 'Emitida', 'Parcial', 'Pagada', 'Anulada')) DEFAULT 'Borrador',
  issued_at TEXT,
  issued_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  voided_at TEXT,
  voided_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  void_reason TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(total_cents = subtotal_cents + tax_cents - discount_cents),
  CHECK(paid_amount_cents <= total_cents),
  CHECK(balance_cents = total_cents - paid_amount_cents),
  CHECK(discount_cents <= subtotal_cents + tax_cents)
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_created
ON invoices(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_invoices_reservation_status
ON invoices(reservation_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_stay_status
ON invoices(stay_id, status);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  service_type TEXT NOT NULL CHECK(service_type IN ('LODGING', 'SERVICE')),
  source_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK(tax_cents >= 0),
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(invoice_id, service_type, source_id),
  CHECK(total_cents = subtotal_cents + tax_cents)
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
ON invoice_items(invoice_id, id);

ALTER TABLE payments ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE payment_allocations ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE cash_movements ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_payments_invoice
ON payments(invoice_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice
ON payment_allocations(invoice_id);

CREATE INDEX IF NOT EXISTS idx_cash_movements_invoice
ON cash_movements(invoice_id);

INSERT OR IGNORE INTO document_sequences (document_type, current_value)
VALUES ('INVOICE', 0);
