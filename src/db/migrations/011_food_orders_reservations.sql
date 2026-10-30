-- Permite preparar pedidos de alimentos para una reserva antes del check-in.
-- La migración es aditiva y conserva los pedidos históricos sin reserva.

ALTER TABLE food_orders ADD COLUMN reservation_id INTEGER REFERENCES reservations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_food_orders_reservation_stay
ON food_orders(reservation_id, stay_id);
