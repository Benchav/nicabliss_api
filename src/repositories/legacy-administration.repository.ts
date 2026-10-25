import { dbClient } from "../db/client.js";
import { HistoricalAccountModel, LegacyReviewModel } from "../models/legacy-administration.model.js";
import { centsToMoney } from "../utils/money.js";

function mapHistorical(row: Record<string, unknown>): HistoricalAccountModel {
  return {
    id: Number(row.id),
    sourceTable: String(row.source_table),
    sourceId: String(row.source_id),
    customerId: row.customer_id == null ? undefined : Number(row.customer_id),
    reservationId: row.reservation_id == null ? undefined : Number(row.reservation_id),
    stayId: row.stay_id == null ? undefined : Number(row.stay_id),
    guestName: String(row.guest_name),
    roomName: String(row.room_name),
    concept: String(row.concept),
    total: centsToMoney(Number(row.total_cents)),
    paid: centsToMoney(Number(row.paid_cents)),
    balance: centsToMoney(Number(row.balance_cents)),
    legacyStatus: String(row.legacy_status),
    legacyDate: String(row.legacy_date),
    historicalPaymentMethod: row.historical_payment_method ? String(row.historical_payment_method) : undefined,
    historicalPaymentRecordedAt: row.historical_payment_recorded_at ? String(row.historical_payment_recorded_at) : undefined,
    paymentDateBasis: row.payment_date_basis ? String(row.payment_date_basis) : undefined,
    needsReview: Number(row.needs_review) === 1,
    reviewNotes: row.review_notes ? String(row.review_notes) : undefined,
    migratedAt: String(row.migrated_at),
  };
}

const sourceQueries: Record<string, string> = {
  guests: "SELECT id, nombre, documento, habitacion, entrada, salida, estado, created_at FROM guests WHERE id = ? LIMIT 1;",
  billing_accounts: "SELECT id, guest_id, huesped, habitacion, concepto, total, pagado, saldo, estado, fecha FROM billing_accounts WHERE id = ? LIMIT 1;",
  food_orders: "SELECT id, order_code, guest_id, huesped, habitacion, productos, total, estado, fecha FROM food_orders WHERE id = ? LIMIT 1;",
  laundry_orders: "SELECT id, guest_id, huesped, habitacion, prendas, total_prendas, total, estado, fecha, observaciones FROM laundry_orders WHERE id = ? LIMIT 1;",
};

function mapReview(row: Record<string, unknown>, sourceData?: Record<string, unknown>): LegacyReviewModel {
  return {
    id: Number(row.id),
    sourceTable: String(row.source_table),
    sourceId: String(row.source_id),
    targetTable: row.target_table ? String(row.target_table) : undefined,
    targetId: row.target_id ? String(row.target_id) : undefined,
    status: row.status as LegacyReviewModel["status"],
    notes: row.notes ? String(row.notes) : undefined,
    resolution: row.resolution ? "ACCEPTED_UNLINKED" : undefined,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    sourceData,
  };
}

export class LegacyAdministrationRepository {
  public async findHistoricalAccounts(search?: string, openOnly = false): Promise<HistoricalAccountModel[]> {
    const conditions: string[] = [];
    const args: Array<string | number> = [];
    if (openOnly) conditions.push("balance_cents > 0");
    if (search?.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push("(LOWER(guest_name) LIKE ? OR LOWER(room_name) LIKE ? OR LOWER(concept) LIKE ? OR LOWER(source_id) LIKE ?)");
      args.push(term, term, term, term);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const result = await dbClient.execute({
      sql: `SELECT * FROM historical_accounts${where} ORDER BY legacy_date DESC, id DESC;`,
      args,
    });
    return result.rows.map((row) => mapHistorical(row as Record<string, unknown>));
  }

  public async getHistoricalSummary() {
    const result = await dbClient.execute(
      `SELECT COUNT(*) AS account_count,
              SUM(CASE WHEN balance_cents > 0 THEN 1 ELSE 0 END) AS open_count,
              COALESCE(SUM(total_cents), 0) AS total_cents,
              COALESCE(SUM(paid_cents), 0) AS paid_cents,
              COALESCE(SUM(balance_cents), 0) AS balance_cents
       FROM historical_accounts;`
    );
    const row = result.rows[0];
    return {
      accountCount: Number(row.account_count),
      openCount: Number(row.open_count),
      total: centsToMoney(Number(row.total_cents)),
      paid: centsToMoney(Number(row.paid_cents)),
      balance: centsToMoney(Number(row.balance_cents)),
    };
  }

  public async findReviews(includeResolved = false): Promise<LegacyReviewModel[]> {
    const result = await dbClient.execute(
      `SELECT MIN(id) AS id, source_table, source_id,
              GROUP_CONCAT(DISTINCT target_table) AS target_table,
              NULL AS target_id, status,
              GROUP_CONCAT(DISTINCT notes) AS notes,
              resolution, resolved_by, resolved_at
       FROM legacy_migration_map
       WHERE status = 'REVIEW'${includeResolved ? " OR resolution = 'ACCEPTED_UNLINKED'" : ""}
       GROUP BY source_table, source_id, status, resolution, resolved_by, resolved_at
       ORDER BY CASE status WHEN 'REVIEW' THEN 0 ELSE 1 END, source_table, CAST(source_id AS INTEGER), id;`
    );
    return Promise.all(result.rows.map(async (row) => {
      const record = row as Record<string, unknown>;
      const query = sourceQueries[String(record.source_table)];
      let sourceData: Record<string, unknown> | undefined;
      if (query) {
        const source = await dbClient.execute({ sql: query, args: [String(record.source_id)] });
        if (source.rows[0]) sourceData = { ...source.rows[0] } as Record<string, unknown>;
      }
      return mapReview(record, sourceData);
    }));
  }

  public async acceptUnlinked(id: number, reason: string, userId: string, ipAddress?: string): Promise<LegacyReviewModel> {
    const transaction = await dbClient.transaction("write");
    const now = new Date().toISOString();
    try {
      const current = await transaction.execute({
        sql: "SELECT * FROM legacy_migration_map WHERE id = ? LIMIT 1;",
        args: [id],
      });
      if (!current.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Revisión heredada no encontrada" };
      if (current.rows[0].status !== "REVIEW") {
        throw { statusCode: 409, code: "ALREADY_RESOLVED", message: "La revisión heredada ya fue resuelta" };
      }
      const sourceTable = String(current.rows[0].source_table);
      const sourceId = String(current.rows[0].source_id);
      const pending = await transaction.execute({
        sql: "SELECT id, target_table, notes FROM legacy_migration_map WHERE source_table = ? AND source_id = ? AND status = 'REVIEW' ORDER BY id;",
        args: [sourceTable, sourceId],
      });
      await transaction.execute({
        sql: `UPDATE legacy_migration_map
              SET status = 'SKIPPED', resolution = 'ACCEPTED_UNLINKED', resolved_by = ?, resolved_at = ?
              WHERE source_table = ? AND source_id = ? AND status = 'REVIEW';`,
        args: [userId, now, sourceTable, sourceId],
      });
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at)
              VALUES (?, 'ACCEPT_LEGACY_UNLINKED', 'legacy_migration_map', ?, ?, ?, ?, ?);`,
        args: [
          userId,
          String(id),
          JSON.stringify({ status: "REVIEW", mappings: pending.rows }),
          JSON.stringify({ status: "SKIPPED", resolution: "ACCEPTED_UNLINKED", reason, affectedMappings: pending.rows.length }),
          ipAddress ?? null,
          now,
        ],
      });
      await transaction.commit();
      return mapReview({ ...current.rows[0], status: "SKIPPED", resolution: "ACCEPTED_UNLINKED", resolved_by: userId, resolved_at: now } as Record<string, unknown>);
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }
}
