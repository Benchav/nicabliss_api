CREATE TABLE IF NOT EXISTS stays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE RESTRICT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  habitacion TEXT NOT NULL,
  check_in_at TEXT NOT NULL,
  check_out_at TEXT,
  estado TEXT NOT NULL CHECK(estado IN ('Activa', 'Finalizada', 'Cancelada')) DEFAULT 'Activa',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stays_customer_status
ON stays(customer_id, estado);

CREATE INDEX IF NOT EXISTS idx_stays_room_status
ON stays(room_id, estado);

CREATE TABLE IF NOT EXISTS service_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK(categoria IN ('Alimentos', 'Lavandería', 'Hospedaje', 'Minibar', 'Transporte', 'Otro')),
  descripcion TEXT,
  precio_cents INTEGER NOT NULL CHECK(precio_cents >= 0),
  tax_basis_points INTEGER NOT NULL DEFAULT 0 CHECK(tax_basis_points >= 0),
  activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_catalog_category_active
ON service_catalog(categoria, activo);

INSERT OR IGNORE INTO service_catalog (
  id, nombre, categoria, descripcion, precio_cents, tax_basis_points, activo, created_at, updated_at
) VALUES
  (1, 'Pedido de alimentos', 'Alimentos', 'Cargo consolidado de restaurante o room service', 0, 0, 1, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z'),
  (2, 'Servicio de lavandería', 'Lavandería', 'Cargo consolidado de prendas procesadas', 50, 0, 1, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS service_consumptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stay_id INTEGER NOT NULL REFERENCES stays(id) ON DELETE RESTRICT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  service_id INTEGER NOT NULL REFERENCES service_catalog(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL CHECK(cantidad > 0),
  precio_unitario_cents INTEGER NOT NULL CHECK(precio_unitario_cents >= 0),
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0),
  estado TEXT NOT NULL CHECK(estado IN ('Registrado', 'EnProceso', 'Entregado', 'Consumido', 'Cancelado')) DEFAULT 'Registrado',
  observaciones TEXT,
  source_type TEXT NOT NULL CHECK(source_type IN ('DIRECT', 'FOOD_ORDER', 'LAUNDRY_ORDER')) DEFAULT 'DIRECT',
  source_id INTEGER,
  consumed_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_consumptions_stay_status
ON service_consumptions(stay_id, estado, consumed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_consumptions_source
ON service_consumptions(source_type, source_id)
WHERE source_id IS NOT NULL;

ALTER TABLE food_orders ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE food_orders ADD COLUMN stay_id INTEGER REFERENCES stays(id) ON DELETE RESTRICT;
ALTER TABLE food_orders ADD COLUMN service_consumption_id INTEGER REFERENCES service_consumptions(id) ON DELETE RESTRICT;
ALTER TABLE food_orders ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE laundry_orders ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE laundry_orders ADD COLUMN stay_id INTEGER REFERENCES stays(id) ON DELETE RESTRICT;
ALTER TABLE laundry_orders ADD COLUMN service_consumption_id INTEGER REFERENCES service_consumptions(id) ON DELETE RESTRICT;
ALTER TABLE laundry_orders ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE RESTRICT;
