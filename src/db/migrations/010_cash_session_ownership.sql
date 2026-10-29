-- Asocia cada turno nuevo al usuario autenticado que lo abre.
-- Los campos son nullable para conservar sesiones históricas sin atribución fiable.
ALTER TABLE cash_sessions ADD COLUMN opened_by TEXT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE cash_sessions ADD COLUMN closed_by TEXT REFERENCES users(id) ON DELETE RESTRICT;

-- Recupera el responsable solo cuando el texto coincide exactamente con un único usuario.
UPDATE cash_sessions
SET opened_by = (
  SELECT u.id
  FROM users u
  WHERE LOWER(TRIM(u.full_name)) = LOWER(TRIM(cash_sessions.responsable))
     OR LOWER(TRIM(u.username)) = LOWER(TRIM(cash_sessions.responsable))
  LIMIT 1
)
WHERE is_closed = 0
  AND (
    SELECT COUNT(*)
    FROM users u
    WHERE LOWER(TRIM(u.full_name)) = LOWER(TRIM(cash_sessions.responsable))
       OR LOWER(TRIM(u.username)) = LOWER(TRIM(cash_sessions.responsable))
  ) = 1;

-- Los cierres previos ya auditados conservan su autoría sin inferencias.
UPDATE cash_sessions
SET closed_by = (
  SELECT al.user_id
  FROM audit_logs al
  WHERE al.entity = 'cash_session'
    AND al.entity_id = CAST(cash_sessions.id AS TEXT)
    AND al.action = 'CLOSE'
    AND al.user_id IS NOT NULL
  ORDER BY al.created_at DESC
  LIMIT 1
)
WHERE is_closed = 1
  AND EXISTS (
    SELECT 1
    FROM audit_logs al
    WHERE al.entity = 'cash_session'
      AND al.entity_id = CAST(cash_sessions.id AS TEXT)
      AND al.action = 'CLOSE'
      AND al.user_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_by
ON cash_sessions(opened_by, is_closed);

-- Claves opcionales para hacer idempotentes los reintentos de movimientos manuales.
ALTER TABLE cash_movements ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_idempotency_key
ON cash_movements(idempotency_key)
WHERE idempotency_key IS NOT NULL;
