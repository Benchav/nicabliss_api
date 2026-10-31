import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dbClient } from "../../src/db/client.js";
import { omitExistingColumns, runMigrations } from "../../src/db/migrate.js";

const sql = `-- Migración de prueba
ALTER TABLE rooms ADD COLUMN category TEXT;
  ALTER TABLE rooms ADD COLUMN price_per_night_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN nights INTEGER;
UPDATE rooms SET category = 'Estándar' WHERE category IS NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_category ON rooms(category);
`;

describe("Migraciones idempotentes", () => {
  it("omite solo los ALTER TABLE ADD COLUMN cuyas columnas ya existen", () => {
    const result = omitExistingColumns(
      sql,
      new Map([["rooms", new Set(["category"])]])
    );

    assert.match(result, /-- \[idempotente\] rooms\.category ya existe; ALTER TABLE omitido/);
    assert.match(result, /ALTER TABLE rooms ADD COLUMN price_per_night_cents/);
    assert.match(result, /ALTER TABLE reservations ADD COLUMN nights/);
    assert.match(result, /UPDATE rooms SET category = 'Estándar'/);
    assert.match(result, /CREATE INDEX IF NOT EXISTS idx_rooms_category/);
    assert.equal(result.includes("ALTER TABLE rooms ADD COLUMN category TEXT;"), false);
  });

  it("compara tabla y columna sin distinguir mayúsculas ni espacios", () => {
    const result = omitExistingColumns(
      "\tALTER   TABLE Rooms   Add   Column Category TEXT;",
      new Map([["rooms", new Set(["category"])]])
    );

    assert.match(result, /^-- \[idempotente\] Rooms\.Category ya existe/);
  });

  it("devuelve el SQL intacto cuando no hay columnas registradas", () => {
    assert.equal(omitExistingColumns(sql, new Map()), sql);
  });

  it("permite reintentar la migración aplicada si falta su marcador de versión", async () => {
    await dbClient.execute("DELETE FROM schema_migrations WHERE version = '012';");

    await runMigrations();

    const applied = await dbClient.execute({
      sql: "SELECT checksum FROM schema_migrations WHERE version = '012' LIMIT 1;",
    });
    assert.equal(applied.rows.length, 1);
    const rooms = await dbClient.execute("PRAGMA table_info(rooms);");
    assert.ok(rooms.rows.some((column) => column.name === "price_per_night_cents"));
    const reservations = await dbClient.execute("PRAGMA table_info(reservations);");
    assert.ok(reservations.rows.some((column) => column.name === "check_out_at"));
  });
});
