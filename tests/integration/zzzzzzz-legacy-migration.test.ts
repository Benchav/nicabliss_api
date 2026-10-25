import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { dbClient } from "../../src/db/client.js";
import { LegacyMigrationService } from "../../src/services/legacy-migration.service.js";

describe("Progressive legacy data migration", () => {
  const service = new LegacyMigrationService();
  let countsBeforeExecute: Record<string, number>;

  async function count(table: string): Promise<number> {
    const result = await dbClient.execute(`SELECT COUNT(*) AS count FROM ${table};`);
    return Number(result.rows[0].count);
  }

  before(async () => {
    await dbClient.batch([
      {
        sql: `INSERT INTO guests (id, nombre, documento, habitacion, entrada, salida, estado, created_at)
              VALUES (80001, 'Migración Verificable', 'LEGACY-DOC-80001', 'Habitación 12', '2040-01-01', '2040-01-05', 'Activo', '2040-01-01T00:00:00.000Z');`,
        args: [],
      },
      {
        sql: `INSERT INTO billing_accounts (id, guest_id, huesped, habitacion, concepto, total, pagado, saldo, estado, fecha)
              VALUES (88001, 80001, 'Migración Verificable', 'Habitación 12', 'Hospedaje', 200, 50, 150, 'Parcial', '2040-01-02');`,
        args: [],
      },
      {
        sql: `INSERT INTO food_orders (id, order_code, guest_id, huesped, habitacion, productos, total, estado, fecha)
              VALUES (88002, '#LEG-88002', 80001, 'Migración Verificable', 'Habitación 12', 'Cena heredada', 15, 'Entregado', '2040-01-02');`,
        args: [],
      },
      {
        sql: `INSERT INTO laundry_orders (id, guest_id, huesped, habitacion, prendas, total_prendas, total, estado, fecha, observaciones)
              VALUES (88003, 80001, 'Migración Verificable', 'Habitación 12', '[{"tipo":"Camisa","cantidad":4}]', 4, 2, 'Entregado', '02/01/2040', 'Conservar registro original');`,
        args: [],
      },
      {
        sql: `INSERT INTO guests (id, nombre, documento, habitacion, entrada, salida, estado, created_at)
              VALUES (80002, 'Nombre Duplicado', 'LEGACY-DOC-80002', 'Habitación 13', '2040-02-01', '2040-02-05', 'Activo', '2040-02-01T00:00:00.000Z');`,
        args: [],
      },
      {
        sql: `INSERT INTO guests (id, nombre, documento, habitacion, entrada, salida, estado, created_at)
              VALUES (80003, 'Nombre Duplicado', 'LEGACY-DOC-80003', 'Habitación 13', '2040-02-01', '2040-02-05', 'Activo', '2040-02-01T00:00:00.000Z');`,
        args: [],
      },
      {
        sql: `INSERT INTO food_orders (id, order_code, huesped, habitacion, productos, total, estado, fecha)
              VALUES (88004, '#LEG-88004', 'Nombre Duplicado', 'Habitación 13', 'No debe asociarse por nombre', 8, 'Entregado', '2040-02-02');`,
        args: [],
      },
    ], "write");
  });

  it("previews without writing and identifies ambiguous associations", async () => {
    const before = {
      customers: await count("customers"),
      maps: await count("legacy_migration_map"),
      historical: await count("historical_accounts"),
    };
    const preview = await service.preview();
    assert.equal(preview.mode, "PREVIEW");
    assert.ok(preview.sources.guests.total >= 7);
    assert.ok(preview.issues.some((issue) => issue.sourceTable === "food_orders" && issue.sourceId === "88004" && issue.reason.includes("ambigua")));
    assert.deepEqual({
      customers: await count("customers"),
      maps: await count("legacy_migration_map"),
      historical: await count("historical_accounts"),
    }, before);
  });

  it("migrates traceable records while preserving unknown payment metadata honestly", async () => {
    const report = await service.execute();
    assert.equal(report.mode, "EXECUTE");

    const maps = await dbClient.execute(
      `SELECT target_table, target_id, status, notes FROM legacy_migration_map
       WHERE source_table = 'guests' AND source_id = '80001' ORDER BY target_table;`
    );
    assert.equal(maps.rows.length, 3);
    assert.ok(maps.rows.every((row) => row.status === "MIGRATED"));

    const reservation = await dbClient.execute("SELECT * FROM reservations WHERE codigo_reserva = 'LEG-GUEST-80001';");
    assert.equal(reservation.rows.length, 1);
    assert.equal(Number(reservation.rows[0].total_reserva_cents), 20000);
    assert.equal(reservation.rows[0].estado, "CheckIn");
    assert.equal(Number(reservation.rows[0].deposito_requerido_cents), 0);

    const stay = await dbClient.execute({ sql: "SELECT * FROM stays WHERE reservation_id = ?;", args: [reservation.rows[0].id] });
    assert.equal(stay.rows.length, 1);
    assert.equal(stay.rows[0].estado, "Activa");

    const historical = await dbClient.execute("SELECT * FROM historical_accounts WHERE source_table = 'billing_accounts' AND source_id = '88001';");
    assert.equal(historical.rows.length, 1);
    assert.equal(Number(historical.rows[0].total_cents), 20000);
    assert.equal(Number(historical.rows[0].paid_cents), 5000);
    assert.equal(Number(historical.rows[0].balance_cents), 15000);
    assert.equal(historical.rows[0].historical_payment_method, "Desconocido");
    assert.equal(historical.rows[0].payment_date_basis, "MIGRATION_DATE");
    assert.ok(historical.rows[0].historical_payment_recorded_at);

    const services = await dbClient.execute(
      `SELECT source_type, source_id, estado, subtotal_cents FROM service_consumptions
       WHERE (source_type = 'FOOD_ORDER' AND source_id = 88002)
          OR (source_type = 'LAUNDRY_ORDER' AND source_id = 88003)
       ORDER BY source_type;`
    );
    assert.equal(services.rows.length, 2);
    assert.ok(services.rows.every((row) => row.estado === "Entregado"));

    const legacyStillExists = await dbClient.execute("SELECT COUNT(*) AS count FROM guests WHERE id = 80001;");
    assert.equal(Number(legacyStillExists.rows[0].count), 1, "La migración no debe eliminar datos heredados");

    countsBeforeExecute = {
      customers: await count("customers"),
      reservations: await count("reservations"),
      stays: await count("stays"),
      consumptions: await count("service_consumptions"),
      historical: await count("historical_accounts"),
    };
  });

  it("is idempotent and leaves ambiguous records marked for review", async () => {
    await service.execute();
    assert.deepEqual({
      customers: await count("customers"),
      reservations: await count("reservations"),
      stays: await count("stays"),
      consumptions: await count("service_consumptions"),
      historical: await count("historical_accounts"),
    }, countsBeforeExecute);

    const ambiguous = await dbClient.execute(
      `SELECT status, target_id, notes FROM legacy_migration_map
       WHERE source_table = 'food_orders' AND source_id = '88004' AND target_table = 'service_consumptions';`
    );
    assert.equal(ambiguous.rows.length, 1);
    assert.equal(ambiguous.rows[0].status, "REVIEW");
    assert.equal(ambiguous.rows[0].target_id, null);
    assert.match(String(ambiguous.rows[0].notes), /ambigua/);

    const linked = await dbClient.execute("SELECT customer_id, stay_id, service_consumption_id FROM food_orders WHERE id = 88004;");
    assert.equal(linked.rows[0].customer_id, null);
    assert.equal(linked.rows[0].stay_id, null);
    assert.equal(linked.rows[0].service_consumption_id, null);
  });
});
