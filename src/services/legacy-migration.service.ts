import { dbClient } from "../db/client.js";
import { normalizeDocument } from "../repositories/customer.repository.js";

type LegacyRow = Record<string, unknown>;
type MigrationStatus = "PENDING" | "MIGRATED" | "REVIEW" | "SKIPPED";
type LegacyTransaction = Awaited<ReturnType<typeof dbClient.transaction>>;

export interface LegacyMigrationIssue {
  sourceTable: string;
  sourceId: string;
  targetTable: string;
  reason: string;
}

export interface LegacyMigrationReport {
  mode: "PREVIEW" | "EXECUTE";
  generatedAt: string;
  sources: Record<string, { total: number; migrated: number; review: number; skipped: number; pending: number }>;
  issues: LegacyMigrationIssue[];
}

const mapSql = `INSERT INTO legacy_migration_map (
  source_table, source_id, target_table, target_id, status, notes, migrated_at
) VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(source_table, source_id, target_table) DO UPDATE SET
  target_id = excluded.target_id,
  status = excluded.status,
  notes = excluded.notes,
  migrated_at = excluded.migrated_at;`;

function cents(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100);
}

function normalizeLegacyDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const latin = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  const date = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : latin ? `${latin[3]}-${latin[2]}-${latin[1]}` : null;
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function legacyTimestamp(date: string): string {
  return `${date}T00:00:00.000-06:00`;
}

function reservationStatus(status: string): "Pendiente" | "CheckIn" | "Finalizada" {
  if (status === "Activo") return "CheckIn";
  if (status === "Finalizado") return "Finalizada";
  return "Pendiente";
}

function consumptionStatus(source: "food_orders" | "laundry_orders", status: string) {
  if (status === "Cancelado") return "Cancelado";
  if (status === "Entregado") return "Entregado";
  if (status === "Pendiente") return "Registrado";
  if (source === "food_orders" && status === "En camino") return "EnProceso";
  return "EnProceso";
}

export class LegacyMigrationService {
  public async preview(): Promise<LegacyMigrationReport> {
    const generatedAt = new Date().toISOString();
    const issues: LegacyMigrationIssue[] = [];
    const guests = await this.rows("guests");
    const accounts = await this.rows("billing_accounts");
    const food = await this.rows("food_orders");
    const laundry = await this.rows("laundry_orders");

    for (const guest of guests) {
      const assessment = await this.assessGuest(guest);
      if (assessment.reason) issues.push({ sourceTable: "guests", sourceId: String(guest.id), targetTable: "reservation", reason: assessment.reason });
    }
    for (const row of [...food.map((item) => ({ table: "food_orders", item })), ...laundry.map((item) => ({ table: "laundry_orders", item }))]) {
      if (row.item.service_consumption_id) continue;
      const link = await this.resolveLegacyGuest(row.item);
      if (!link.guest) issues.push({ sourceTable: row.table, sourceId: String(row.item.id), targetTable: "service_consumptions", reason: link.reason });
    }
    for (const account of accounts) {
      const link = await this.resolveLegacyGuest(account);
      if (!link.guest) issues.push({ sourceTable: "billing_accounts", sourceId: String(account.id), targetTable: "historical_accounts", reason: link.reason });
    }

    return {
      mode: "PREVIEW",
      generatedAt,
      sources: {
        guests: this.previewStats(guests.length, issues, "guests"),
        billing_accounts: this.previewStats(accounts.length, issues, "billing_accounts"),
        food_orders: this.previewStats(food.length, issues, "food_orders"),
        laundry_orders: this.previewStats(laundry.length, issues, "laundry_orders"),
      },
      issues,
    };
  }

  public async execute(): Promise<LegacyMigrationReport> {
    const generatedAt = new Date().toISOString();
    const actorId = await this.getMigrationActor();
    const issues: LegacyMigrationIssue[] = [];

    for (const guest of await this.rows("guests")) await this.migrateGuest(guest, actorId, generatedAt, issues);
    for (const account of await this.rows("billing_accounts")) await this.migrateHistoricalAccount(account, generatedAt, issues);
    for (const order of await this.rows("food_orders")) await this.migrateOrder("food_orders", order, actorId, generatedAt, issues);
    for (const order of await this.rows("laundry_orders")) await this.migrateOrder("laundry_orders", order, actorId, generatedAt, issues);

    await dbClient.execute({
      sql: `INSERT INTO audit_logs (user_id, action, entity, new_values, created_at)
            VALUES (?, 'LEGACY_MIGRATION', 'migration', ?, ?);`,
      args: [actorId, JSON.stringify({ generatedAt, issueCount: issues.length }), generatedAt],
    });

    return {
      mode: "EXECUTE",
      generatedAt,
      sources: await this.mapStats(),
      issues,
    };
  }

  private async rows(table: "guests" | "billing_accounts" | "food_orders" | "laundry_orders"): Promise<LegacyRow[]> {
    const result = await dbClient.execute(`SELECT * FROM ${table} ORDER BY id;`);
    return result.rows.map((row) => row as LegacyRow);
  }

  private previewStats(total: number, issues: LegacyMigrationIssue[], sourceTable: string) {
    const review = issues.filter((issue) => issue.sourceTable === sourceTable).length;
    return { total, migrated: 0, review, skipped: 0, pending: Math.max(0, total - review) };
  }

  private async getMigrationActor(): Promise<string> {
    const result = await dbClient.execute("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY CASE WHEN id = 'usr_admin_001' THEN 0 ELSE 1 END, created_at LIMIT 1;");
    if (!result.rows[0]) throw new Error("La migración heredada requiere al menos un usuario ADMIN para trazabilidad");
    return String(result.rows[0].id);
  }

  private async getMap(sourceTable: string, sourceId: string, targetTable: string) {
    const result = await dbClient.execute({
      sql: `SELECT target_id, status, notes FROM legacy_migration_map
            WHERE source_table = ? AND source_id = ? AND target_table = ? LIMIT 1;`,
      args: [sourceTable, sourceId, targetTable],
    });
    return result.rows[0] as LegacyRow | undefined;
  }

  private async putMap(
    transaction: LegacyTransaction,
    sourceTable: string,
    sourceId: string,
    targetTable: string,
    targetId: string | null,
    status: MigrationStatus,
    notes: string,
    migratedAt: string
  ) {
    await transaction.execute({ sql: mapSql, args: [sourceTable, sourceId, targetTable, targetId, status, notes, migratedAt] });
  }

  private async assessGuest(guest: LegacyRow): Promise<{ roomId?: number; totalCents?: number; reason?: string }> {
    const entrada = normalizeLegacyDate(guest.entrada);
    const salida = normalizeLegacyDate(guest.salida);
    if (!entrada || !salida || salida <= entrada) return { reason: "Fechas de estancia inválidas o incompletas" };
    if (!normalizeDocument(String(guest.documento ?? ""))) return { reason: "Documento vacío o inválido" };

    const rooms = await dbClient.execute({ sql: "SELECT id FROM rooms WHERE LOWER(name) = LOWER(?) AND active = 1;", args: [String(guest.habitacion)] });
    if (rooms.rows.length !== 1) return { reason: "La habitación heredada no coincide de forma única con el catálogo" };

    const lodging = await dbClient.execute({
      sql: `SELECT id, total FROM billing_accounts
            WHERE LOWER(TRIM(concepto)) IN ('hospedaje', 'alojamiento')
              AND (guest_id = ? OR (guest_id IS NULL AND LOWER(TRIM(huesped)) = LOWER(TRIM(?)) AND LOWER(TRIM(habitacion)) = LOWER(TRIM(?))));`,
      args: [Number(guest.id), String(guest.nombre), String(guest.habitacion)],
    });
    if (lodging.rows.length !== 1 || cents(lodging.rows[0].total) <= 0) {
      return { roomId: Number(rooms.rows[0].id), reason: "No existe un único cargo explícito de hospedaje para determinar el total sin inventarlo" };
    }
    return { roomId: Number(rooms.rows[0].id), totalCents: cents(lodging.rows[0].total) };
  }

  private async migrateGuest(guest: LegacyRow, actorId: string, migratedAt: string, issues: LegacyMigrationIssue[]) {
    const sourceId = String(guest.id);
    const customerMap = await this.getMap("guests", sourceId, "customers");
    let customerId = customerMap?.status === "MIGRATED" && customerMap.target_id ? Number(customerMap.target_id) : 0;
    if (!customerId) {
      const normalized = normalizeDocument(String(guest.documento ?? ""));
      const matches = normalized ? await dbClient.execute({ sql: "SELECT id FROM customers WHERE documento_normalizado = ?;", args: [normalized] }) : { rows: [] as LegacyRow[] };
      if (matches.rows.length > 1 || !normalized) {
        const reason = !normalized ? "Documento vacío o inválido" : "Más de un cliente coincide con el documento heredado";
        const transaction = await dbClient.transaction("write");
        try { await this.putMap(transaction, "guests", sourceId, "customers", null, "REVIEW", reason, migratedAt); await transaction.commit(); }
        catch (error) { await transaction.rollback(); throw error; } finally { transaction.close(); }
        issues.push({ sourceTable: "guests", sourceId, targetTable: "customers", reason });
        return;
      }
      const transaction = await dbClient.transaction("write");
      try {
        let notes = "Cliente existente enlazado por documento normalizado";
        if (matches.rows.length === 1) customerId = Number(matches.rows[0].id);
        else {
          const now = String(guest.created_at || migratedAt);
          const inserted = await transaction.execute({
            sql: `INSERT INTO customers (nombre, apellido, documento, documento_normalizado, created_at, updated_at)
                  VALUES (?, NULL, ?, ?, ?, ?);`,
            args: [String(guest.nombre), String(guest.documento), normalized, now, migratedAt],
          });
          customerId = Number(inserted.lastInsertRowid);
          notes = "Cliente creado desde huésped heredado usando su documento normalizado";
        }
        await this.putMap(transaction, "guests", sourceId, "customers", String(customerId), "MIGRATED", notes, migratedAt);
        await transaction.commit();
      }
      catch (error) { await transaction.rollback(); throw error; } finally { transaction.close(); }
    }

    const existingReservationMap = await this.getMap("guests", sourceId, "reservations");
    if (existingReservationMap?.status === "MIGRATED") return;
    const assessment = await this.assessGuest(guest);
    if (assessment.reason || !assessment.roomId || !assessment.totalCents) {
      const reason = assessment.reason ?? "No fue posible preparar la reserva";
      const transaction = await dbClient.transaction("write");
      try {
        await this.putMap(transaction, "guests", sourceId, "reservations", null, "REVIEW", reason, migratedAt);
        await this.putMap(transaction, "guests", sourceId, "stays", null, "REVIEW", reason, migratedAt);
        await transaction.commit();
      } catch (error) { await transaction.rollback(); throw error; } finally { transaction.close(); }
      issues.push({ sourceTable: "guests", sourceId, targetTable: "reservations", reason });
      return;
    }

    const entrada = normalizeLegacyDate(guest.entrada)!;
    const salida = normalizeLegacyDate(guest.salida)!;
    const status = reservationStatus(String(guest.estado));
    const transaction = await dbClient.transaction("write");
    try {
      const conflicts = await transaction.execute({
        sql: `SELECT id FROM reservations WHERE room_id = ? AND estado IN ('Pendiente', 'Confirmada', 'CheckIn')
              AND fecha_entrada < ? AND fecha_salida > ?;`,
        args: [assessment.roomId, salida, entrada],
      });
      if (conflicts.rows.length > 0) throw { review: true, message: "Existe una reserva incompatible para la misma habitación y fechas" };
      const inserted = await transaction.execute({
        sql: `INSERT INTO reservations (
                codigo_reserva, customer_id, room_id, habitacion, fecha_entrada, fecha_salida,
                total_reserva_cents, deposit_type, deposit_value, deposito_requerido_cents,
                estado, observaciones, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'FIXED', 0, 0, ?, ?, ?, ?, ?);`,
        args: [`LEG-GUEST-${sourceId}`, customerId, assessment.roomId, String(guest.habitacion), entrada, salida,
          assessment.totalCents, status, "Migración heredada: anticipo y horas exactas no disponibles", actorId,
          String(guest.created_at || migratedAt), migratedAt],
      });
      const reservationId = Number(inserted.lastInsertRowid);
      await this.putMap(transaction, "guests", sourceId, "reservations", String(reservationId), "MIGRATED", "Total tomado de un único cargo explícito de hospedaje", migratedAt);

      if (String(guest.estado) === "Reservado") {
        await this.putMap(transaction, "guests", sourceId, "stays", null, "SKIPPED", "Una reserva futura no genera estancia hasta el check-in", migratedAt);
      } else {
        const stay = await transaction.execute({
          sql: `INSERT INTO stays (
                  reservation_id, customer_id, room_id, habitacion, check_in_at, check_out_at,
                  estado, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          args: [reservationId, customerId, assessment.roomId, String(guest.habitacion), legacyTimestamp(entrada),
            String(guest.estado) === "Finalizado" ? legacyTimestamp(salida) : null,
            String(guest.estado) === "Finalizado" ? "Finalizada" : "Activa", actorId,
            String(guest.created_at || migratedAt), migratedAt],
        });
        await this.putMap(transaction, "guests", sourceId, "stays", String(stay.lastInsertRowid), "MIGRATED", "Hora desconocida representada por medianoche convencional de Managua", migratedAt);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      if ((error as { review?: boolean }).review) {
        const reason = String((error as { message?: string }).message);
        const reviewTransaction = await dbClient.transaction("write");
        try {
          await this.putMap(reviewTransaction, "guests", sourceId, "reservations", null, "REVIEW", reason, migratedAt);
          await this.putMap(reviewTransaction, "guests", sourceId, "stays", null, "REVIEW", reason, migratedAt);
          await reviewTransaction.commit();
        } catch (reviewError) { await reviewTransaction.rollback(); throw reviewError; } finally { reviewTransaction.close(); }
        issues.push({ sourceTable: "guests", sourceId, targetTable: "reservations", reason });
        return;
      }
      throw error;
    } finally { transaction.close(); }
  }

  private async resolveLegacyGuest(row: LegacyRow): Promise<{ guest?: LegacyRow; reason: string }> {
    if (row.guest_id) {
      const result = await dbClient.execute({ sql: "SELECT * FROM guests WHERE id = ? LIMIT 1;", args: [Number(row.guest_id)] });
      return result.rows[0] ? { guest: result.rows[0] as LegacyRow, reason: "Enlace por guest_id" } : { reason: "guest_id no existe en guests" };
    }
    const candidates = await dbClient.execute({
      sql: `SELECT * FROM guests WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) AND LOWER(TRIM(habitacion)) = LOWER(TRIM(?));`,
      args: [String(row.huesped ?? ""), String(row.habitacion ?? "")],
    });
    const date = normalizeLegacyDate(row.fecha);
    const filtered = date ? candidates.rows.filter((candidate) => String(candidate.entrada) <= date && String(candidate.salida) >= date) : candidates.rows;
    if (filtered.length === 1) return { guest: filtered[0] as LegacyRow, reason: "Enlace único por nombre, habitación y fecha" };
    if (filtered.length > 1) return { reason: "Asociación ambigua: varios huéspedes coinciden; no se enlazó solo por nombre" };
    return { reason: "No existe una estancia heredada coincidente por nombre, habitación y fecha" };
  }

  private async mappedTarget(sourceTable: string, sourceId: string, targetTable: string): Promise<number | undefined> {
    const mapping = await this.getMap(sourceTable, sourceId, targetTable);
    return mapping?.status === "MIGRATED" && mapping.target_id ? Number(mapping.target_id) : undefined;
  }

  private async migrateHistoricalAccount(account: LegacyRow, migratedAt: string, issues: LegacyMigrationIssue[]) {
    const sourceId = String(account.id);
    const existing = await dbClient.execute({ sql: "SELECT id FROM historical_accounts WHERE source_table = 'billing_accounts' AND source_id = ? LIMIT 1;", args: [sourceId] });
    if (existing.rows[0]) return;
    const link = await this.resolveLegacyGuest(account);
    let customerId: number | undefined;
    let reservationId: number | undefined;
    let stayId: number | undefined;
    if (link.guest) {
      const guestId = String(link.guest.id);
      customerId = await this.mappedTarget("guests", guestId, "customers");
      reservationId = await this.mappedTarget("guests", guestId, "reservations");
      stayId = await this.mappedTarget("guests", guestId, "stays");
    }
    const totalCents = cents(account.total);
    const paidCents = cents(account.pagado);
    const balanceCents = cents(account.saldo);
    const arithmeticMismatch = balanceCents !== totalCents - paidCents;
    const notes = [!link.guest ? link.reason : "", arithmeticMismatch ? "El saldo heredado no coincide con total menos pagado" : ""].filter(Boolean).join("; ");
    const needsReview = !link.guest || !customerId || arithmeticMismatch;
    const transaction = await dbClient.transaction("write");
    try {
      const inserted = await transaction.execute({
        sql: `INSERT INTO historical_accounts (
                source_table, source_id, customer_id, reservation_id, stay_id, guest_name, room_name,
                concept, total_cents, paid_cents, balance_cents, legacy_status, legacy_date,
                historical_payment_method, historical_payment_recorded_at, payment_date_basis,
                needs_review, review_notes, source_payload, migrated_at
              ) VALUES ('billing_accounts', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [sourceId, customerId ?? null, reservationId ?? null, stayId ?? null, String(account.huesped),
          String(account.habitacion), String(account.concepto), totalCents, paidCents, balanceCents,
          String(account.estado), String(account.fecha), paidCents > 0 ? "Desconocido" : null,
          paidCents > 0 ? migratedAt : null, paidCents > 0 ? "MIGRATION_DATE" : null,
          needsReview ? 1 : 0, notes || null, JSON.stringify(account), migratedAt],
      });
      await this.putMap(transaction, "billing_accounts", sourceId, "historical_accounts", String(inserted.lastInsertRowid), needsReview ? "REVIEW" : "MIGRATED", notes || "Cuenta histórica preservada sin inventar método ni fecha del abono", migratedAt);
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; } finally { transaction.close(); }
    if (needsReview) issues.push({ sourceTable: "billing_accounts", sourceId, targetTable: "historical_accounts", reason: notes });
  }

  private async migrateOrder(sourceTable: "food_orders" | "laundry_orders", order: LegacyRow, actorId: string, migratedAt: string, issues: LegacyMigrationIssue[]) {
    const sourceId = String(order.id);
    const existingMap = await this.getMap(sourceTable, sourceId, "service_consumptions");
    if (existingMap?.status === "MIGRATED") return;
    if (order.service_consumption_id) {
      const transaction = await dbClient.transaction("write");
      try { await this.putMap(transaction, sourceTable, sourceId, "service_consumptions", String(order.service_consumption_id), "MIGRATED", "El registro ya estaba vinculado", migratedAt); await transaction.commit(); }
      catch (error) { await transaction.rollback(); throw error; } finally { transaction.close(); }
      return;
    }
    const link = await this.resolveLegacyGuest(order);
    const date = normalizeLegacyDate(order.fecha);
    let customerId: number | undefined;
    let stayId: number | undefined;
    if (link.guest) {
      const guestId = String(link.guest.id);
      customerId = await this.mappedTarget("guests", guestId, "customers");
      stayId = await this.mappedTarget("guests", guestId, "stays");
    }
    if (!link.guest || !customerId || !stayId || !date) {
      const reason = !date ? "Fecha heredada inválida" : !link.guest ? link.reason : "El huésped no tiene una estancia migrada apta para asociar el servicio";
      const transaction = await dbClient.transaction("write");
      try { await this.putMap(transaction, sourceTable, sourceId, "service_consumptions", null, "REVIEW", reason, migratedAt); await transaction.commit(); }
      catch (error) { await transaction.rollback(); throw error; } finally { transaction.close(); }
      issues.push({ sourceTable, sourceId, targetTable: "service_consumptions", reason });
      return;
    }

    const quantity = sourceTable === "laundry_orders" ? Number(order.total_prendas) : 1;
    const subtotalCents = cents(order.total);
    const unitCents = quantity > 0 ? Math.round(subtotalCents / quantity) : subtotalCents;
    const transaction = await dbClient.transaction("write");
    try {
      const consumption = await transaction.execute({
        sql: `INSERT INTO service_consumptions (
                stay_id, customer_id, service_id, cantidad, precio_unitario_cents, subtotal_cents,
                estado, observaciones, source_type, source_id, consumed_at, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [stayId, customerId, sourceTable === "food_orders" ? 1 : 2, quantity, unitCents, subtotalCents,
          consumptionStatus(sourceTable, String(order.estado)),
          sourceTable === "food_orders" ? String(order.productos) : String(order.observaciones || ""),
          sourceTable === "food_orders" ? "FOOD_ORDER" : "LAUNDRY_ORDER", Number(order.id),
          legacyTimestamp(date), actorId, migratedAt, migratedAt],
      });
      const consumptionId = Number(consumption.lastInsertRowid);
      await transaction.execute({
        sql: `UPDATE ${sourceTable} SET customer_id = ?, stay_id = ?, service_consumption_id = ?, created_by = ? WHERE id = ?;`,
        args: [customerId, stayId, consumptionId, actorId, Number(order.id)],
      });
      await this.putMap(transaction, sourceTable, sourceId, "service_consumptions", String(consumptionId), "MIGRATED", "Asociación única por huésped, habitación y fecha", migratedAt);
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; } finally { transaction.close(); }
  }

  private async mapStats() {
    const sources = ["guests", "billing_accounts", "food_orders", "laundry_orders"];
    const output: LegacyMigrationReport["sources"] = {};
    for (const source of sources) {
      const totalResult = await dbClient.execute(`SELECT COUNT(*) AS count FROM ${source};`);
      const statusResult = await dbClient.execute({
        sql: `SELECT effective_status AS status, COUNT(*) AS count FROM (
                SELECT source_id,
                       CASE
                         WHEN SUM(CASE WHEN status = 'REVIEW' THEN 1 ELSE 0 END) > 0 THEN 'REVIEW'
                         WHEN SUM(CASE WHEN status = 'MIGRATED' THEN 1 ELSE 0 END) > 0 THEN 'MIGRATED'
                         WHEN SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) > 0 THEN 'SKIPPED'
                         ELSE 'PENDING'
                       END AS effective_status
                FROM legacy_migration_map WHERE source_table = ? GROUP BY source_id
              ) GROUP BY effective_status;`,
        args: [source],
      });
      const counts = new Map(statusResult.rows.map((row) => [String(row.status), Number(row.count)]));
      const total = Number(totalResult.rows[0].count);
      const migrated = counts.get("MIGRATED") ?? 0;
      const review = counts.get("REVIEW") ?? 0;
      const skipped = counts.get("SKIPPED") ?? 0;
      output[source] = { total, migrated, review, skipped, pending: Math.max(0, total - migrated - review - skipped) };
    }
    return output;
  }
}
