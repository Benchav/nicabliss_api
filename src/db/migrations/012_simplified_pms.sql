-- Simplificación operativa del PMS (aditiva y retrocompatible).
-- 1) Cada habitación administra su categoría, descripción y precio por noche.
-- 2) Cada reserva congela el precio de la habitación y calcula sus noches.
-- 3) La reserva registra las horas reales de entrada y salida de la estancia.
-- No se elimina ni reinterpreta información histórica.

ALTER TABLE rooms ADD COLUMN category TEXT;
ALTER TABLE rooms ADD COLUMN price_per_night_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN description TEXT;
ALTER TABLE rooms ADD COLUMN created_at TEXT;
ALTER TABLE rooms ADD COLUMN updated_at TEXT;

UPDATE rooms SET category = 'Estándar' WHERE category IS NULL;
UPDATE rooms SET created_at = COALESCE(created_at, '2026-10-24T00:00:00.000Z') WHERE created_at IS NULL;
UPDATE rooms SET updated_at = COALESCE(updated_at, created_at) WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_active_category
ON rooms(active, category);

ALTER TABLE reservations ADD COLUMN room_price_cents INTEGER;
ALTER TABLE reservations ADD COLUMN nights INTEGER;
ALTER TABLE reservations ADD COLUMN lodging_total_cents INTEGER;
ALTER TABLE reservations ADD COLUMN check_in_at TEXT;
ALTER TABLE reservations ADD COLUMN check_out_at TEXT;

UPDATE reservations
SET nights = MAX(1, CAST(ROUND(julianday(fecha_salida) - julianday(fecha_entrada)) AS INTEGER))
WHERE nights IS NULL;

UPDATE reservations
SET lodging_total_cents = total_reserva_cents
WHERE lodging_total_cents IS NULL;

UPDATE reservations
SET room_price_cents = CASE
      WHEN nights IS NULL OR nights <= 0 THEN total_reserva_cents
      ELSE CAST(ROUND(1.0 * total_reserva_cents / nights) AS INTEGER)
    END
WHERE room_price_cents IS NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_customer_active
ON reservations(customer_id, estado, created_at);
