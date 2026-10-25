-- Baseline aditivo del esquema existente. Esta migración nunca elimina datos.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'RECEPTIONIST', 'STAFF')),
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  documento TEXT NOT NULL,
  habitacion TEXT NOT NULL,
  entrada TEXT NOT NULL,
  salida TEXT NOT NULL,
  estado TEXT NOT NULL CHECK(estado IN ('Activo', 'Finalizado', 'Reservado')) DEFAULT 'Activo',
  created_at TEXT NOT NULL,
  CHECK(salida >= entrada)
);

CREATE INDEX IF NOT EXISTS idx_guests_search ON guests(nombre, documento, habitacion);
CREATE INDEX IF NOT EXISTS idx_guests_estado ON guests(estado);

CREATE TABLE IF NOT EXISTS billing_accounts (
  id INTEGER PRIMARY KEY,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  huesped TEXT NOT NULL,
  habitacion TEXT NOT NULL,
  concepto TEXT NOT NULL,
  total REAL NOT NULL CHECK(total > 0),
  pagado REAL NOT NULL DEFAULT 0.0 CHECK(pagado >= 0),
  saldo REAL NOT NULL CHECK(saldo >= 0),
  estado TEXT NOT NULL CHECK(estado IN ('Pendiente', 'Parcial', 'Pagado')) DEFAULT 'Pendiente',
  fecha TEXT NOT NULL,
  CHECK(pagado <= total)
);

CREATE INDEX IF NOT EXISTS idx_billing_estado ON billing_accounts(estado);
CREATE INDEX IF NOT EXISTS idx_billing_fecha ON billing_accounts(fecha);

CREATE TABLE IF NOT EXISTS food_orders (
  id INTEGER PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  huesped TEXT NOT NULL,
  habitacion TEXT NOT NULL,
  productos TEXT NOT NULL,
  total REAL NOT NULL CHECK(total >= 0),
  estado TEXT NOT NULL CHECK(estado IN ('Pendiente', 'En preparación', 'En camino', 'Entregado', 'Cancelado')) DEFAULT 'Pendiente',
  fecha TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_food_orders_estado ON food_orders(estado);
CREATE INDEX IF NOT EXISTS idx_food_orders_code ON food_orders(order_code);

CREATE TABLE IF NOT EXISTS laundry_orders (
  id INTEGER PRIMARY KEY,
  guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
  huesped TEXT NOT NULL,
  habitacion TEXT NOT NULL,
  prendas TEXT NOT NULL,
  total_prendas INTEGER NOT NULL CHECK(total_prendas > 0),
  total REAL NOT NULL CHECK(total >= 0),
  estado TEXT NOT NULL CHECK(estado IN ('Pendiente', 'En proceso', 'Listo', 'Entregado', 'Cancelado')) DEFAULT 'Pendiente',
  fecha TEXT NOT NULL,
  observaciones TEXT NOT NULL DEFAULT 'Sin observaciones especiales'
);

CREATE INDEX IF NOT EXISTS idx_laundry_orders_estado ON laundry_orders(estado);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id INTEGER PRIMARY KEY,
  responsable TEXT NOT NULL,
  apertura TEXT NOT NULL,
  cierre TEXT,
  fondo_inicial REAL NOT NULL CHECK(fondo_inicial >= 0),
  ingresos_efectivo REAL NOT NULL DEFAULT 0.0 CHECK(ingresos_efectivo >= 0),
  ingresos_digitales REAL NOT NULL DEFAULT 0.0 CHECK(ingresos_digitales >= 0),
  salidas_efectivo REAL NOT NULL DEFAULT 0.0 CHECK(salidas_efectivo >= 0),
  efectivo_esperado REAL NOT NULL,
  efectivo_contado REAL,
  diferencia REAL,
  observaciones TEXT NOT NULL DEFAULT '',
  is_closed INTEGER NOT NULL DEFAULT 0 CHECK(is_closed IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_is_closed ON cash_sessions(is_closed);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_cash_session
ON cash_sessions(is_closed)
WHERE is_closed = 0;

CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('Ingreso', 'Salida')),
  concepto TEXT NOT NULL CHECK(concepto IN ('Hospedaje', 'Alimentos', 'Lavandería', 'Otro ingreso', 'Gasto operativo', 'Retiro de efectivo')),
  descripcion TEXT NOT NULL DEFAULT '',
  metodo TEXT NOT NULL CHECK(metodo IN ('Efectivo', 'Transferencia', 'Tarjeta')),
  monto REAL NOT NULL CHECK(monto > 0)
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_tipo_metodo ON cash_movements(tipo, metodo);
