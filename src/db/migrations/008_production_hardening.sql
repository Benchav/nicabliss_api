-- Evita documentos duplicados incluso ante solicitudes concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_document_unique
ON customers(documento_normalizado);
