CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);

INSERT OR IGNORE INTO rooms (code, name) VALUES
  ('01', 'Habitación 01'),
  ('02', 'Habitación 02'),
  ('03', 'Habitación 03'),
  ('04', 'Habitación 04'),
  ('05', 'Habitación 05'),
  ('06', 'Habitación 06'),
  ('07', 'Habitación 07'),
  ('08', 'Habitación 08'),
  ('09', 'Habitación 09'),
  ('10', 'Habitación 10'),
  ('11', 'Habitación 11'),
  ('12', 'Habitación 12'),
  ('13', 'Habitación 13'),
  ('14', 'Habitación 14');

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT,
  documento TEXT NOT NULL,
  documento_normalizado TEXT NOT NULL,
  telefono TEXT,
  correo TEXT,
  direccion TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_document
ON customers(documento_normalizado);

CREATE INDEX IF NOT EXISTS idx_customers_name
ON customers(nombre, apellido);

CREATE TABLE IF NOT EXISTS document_sequences (
  document_type TEXT PRIMARY KEY,
  current_value INTEGER NOT NULL CHECK(current_value >= 0)
);

INSERT OR IGNORE INTO document_sequences (document_type, current_value)
VALUES ('RESERVATION', 0), ('PAYMENT', 0);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_reserva TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  habitacion TEXT NOT NULL,
  fecha_entrada TEXT NOT NULL,
  fecha_salida TEXT NOT NULL,
  total_reserva_cents INTEGER NOT NULL CHECK(total_reserva_cents > 0),
  deposit_type TEXT NOT NULL CHECK(deposit_type IN ('PERCENTAGE', 'FIXED')),
  deposit_value INTEGER NOT NULL CHECK(deposit_value >= 0),
  deposito_requerido_cents INTEGER NOT NULL CHECK(deposito_requerido_cents >= 0),
  estado TEXT NOT NULL CHECK(estado IN ('Pendiente', 'Confirmada', 'Cancelada', 'CheckIn', 'Finalizada', 'NoShow')) DEFAULT 'Pendiente',
  observaciones TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(fecha_salida > fecha_entrada)
);

CREATE INDEX IF NOT EXISTS idx_reservations_customer
ON reservations(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reservations_room_dates
ON reservations(room_id, fecha_entrada, fecha_salida, estado);

CREATE INDEX IF NOT EXISTS idx_reservations_code
ON reservations(codigo_reserva);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  reservation_id INTEGER REFERENCES reservations(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('Efectivo', 'Tarjeta', 'Transferencia')),
  reference TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('PAYMENT', 'REVERSAL')) DEFAULT 'PAYMENT',
  status TEXT NOT NULL CHECK(status IN ('POSTED', 'REVERSED')) DEFAULT 'POSTED',
  reverses_payment_id INTEGER UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  payment_date TEXT NOT NULL,
  received_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cash_session_id INTEGER NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  idempotency_key TEXT UNIQUE,
  voided_at TEXT,
  voided_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  void_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_reservation
ON payments(reservation_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_payments_customer
ON payments(customer_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_payments_cash_session
ON payments(cash_session_id, payment_date);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  created_at TEXT NOT NULL,
  UNIQUE(payment_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_reservation
ON payment_allocations(reservation_id);

ALTER TABLE cash_movements ADD COLUMN payment_id INTEGER REFERENCES payments(id) ON DELETE RESTRICT;
ALTER TABLE cash_movements ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE cash_movements ADD COLUMN reservation_id INTEGER REFERENCES reservations(id) ON DELETE RESTRICT;
ALTER TABLE cash_movements ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE cash_movements ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('MANUAL', 'PAYMENT', 'REVERSAL', 'MIGRATION'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_payment
ON cash_movements(payment_id)
WHERE payment_id IS NOT NULL;
