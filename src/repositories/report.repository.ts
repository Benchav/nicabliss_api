import type { Client, Transaction } from "@libsql/client";
import { dbClient } from "../db/client.js";
import { PaymentMethod } from "../models/payment.model.js";
import type { UtcRange } from "../utils/business-time.js";

export interface CashReportFilters {
  sessionId?: number;
  method?: PaymentMethod;
  userId?: string;
}

export interface CashSessionReportRow {
  id: number;
  responsable: string;
  apertura: string;
  cierre?: string;
  fondoInicial: number;
  ingresosEfectivo: number;
  ingresosDigitales: number;
  salidasEfectivo: number;
  efectivoEsperado: number;
  efectivoContado?: number;
  diferencia?: number;
  isClosed: boolean;
}

export interface PaymentReconciliationRow {
  paymentId: number;
  paymentNumber: string;
  kind: "PAYMENT" | "REVERSAL";
  status: "POSTED" | "REVERSED";
  amountCents: number;
  method: PaymentMethod;
  paymentDate: string;
  receivedBy: string;
  receivedByName: string;
  paymentSessionId: number;
  movementId?: number;
  movementSessionId?: number;
  movementType?: "Ingreso" | "Salida";
  movementMethod?: PaymentMethod;
  movementAmountCents?: number;
  movementCreatedBy?: string;
  movementCreatedByName?: string;
}

export interface AutomaticMovementRow {
  movementId: number;
  paymentId?: number;
  paymentNumber?: string;
  paymentSessionId?: number;
  movementType: "Ingreso" | "Salida";
  method: PaymentMethod;
  amountCents: number;
  source: "PAYMENT" | "REVERSAL";
  createdBy?: string;
  createdByName?: string;
}

export interface CashUserRow {
  userId: string;
  userName: string;
}

export interface CashMovementTotalsRow {
  cashIncomeCents: number;
  digitalIncomeCents: number;
  cashOutputCents: number;
  manualIncomeCents: number;
  manualOutputCents: number;
}

type DbExecutor = Client | Transaction;

function mapSession(row: Record<string, unknown>): CashSessionReportRow {
  return {
    id: Number(row.id),
    responsable: String(row.responsable),
    apertura: String(row.apertura),
    cierre: row.cierre ? String(row.cierre) : undefined,
    fondoInicial: Number(row.fondo_inicial),
    ingresosEfectivo: Number(row.ingresos_efectivo),
    ingresosDigitales: Number(row.ingresos_digitales),
    salidasEfectivo: Number(row.salidas_efectivo),
    efectivoEsperado: Number(row.efectivo_esperado),
    efectivoContado: row.efectivo_contado === null || row.efectivo_contado === undefined
      ? undefined : Number(row.efectivo_contado),
    diferencia: row.diferencia === null || row.diferencia === undefined ? undefined : Number(row.diferencia),
    isClosed: Number(row.is_closed) === 1,
  };
}

export class ReportRepository {
  public async findCashSession(sessionId?: number, executor: DbExecutor = dbClient): Promise<CashSessionReportRow | null> {
    const result = sessionId
      ? await executor.execute({ sql: "SELECT * FROM cash_sessions WHERE id = ? LIMIT 1;", args: [sessionId] })
      : await executor.execute({
          sql: "SELECT * FROM cash_sessions ORDER BY is_closed ASC, id DESC LIMIT 1;",
          args: [],
        });
    return result.rows[0] ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  public async getPayments(
    filters: Required<Pick<CashReportFilters, "sessionId">> & CashReportFilters,
    executor: DbExecutor = dbClient
  ): Promise<PaymentReconciliationRow[]> {
    const conditions = ["p.cash_session_id = ?"];
    const args: Array<string | number> = [filters.sessionId];
    if (filters.method) {
      conditions.push("p.payment_method = ?");
      args.push(filters.method);
    }
    if (filters.userId) {
      conditions.push("p.received_by = ?");
      args.push(filters.userId);
    }
    const result = await executor.execute({
      sql: `SELECT p.id AS payment_id, p.payment_number, p.kind, p.status, p.amount_cents,
                   p.payment_method, p.payment_date, p.received_by, pu.full_name AS received_by_name,
                   p.cash_session_id AS payment_session_id,
                   cm.id AS movement_id, cm.session_id AS movement_session_id, cm.tipo AS movement_type,
                   cm.metodo AS movement_method, ROUND(cm.monto * 100) AS movement_amount_cents,
                   cm.created_by AS movement_created_by, mu.full_name AS movement_created_by_name
            FROM payments p
            JOIN users pu ON pu.id = p.received_by
            LEFT JOIN cash_movements cm ON cm.payment_id = p.id
            LEFT JOIN users mu ON mu.id = cm.created_by
            WHERE ${conditions.join(" AND ")}
            ORDER BY p.payment_date DESC, p.id DESC;`,
      args,
    });
    return result.rows.map((row) => ({
      paymentId: Number(row.payment_id),
      paymentNumber: String(row.payment_number),
      kind: row.kind as "PAYMENT" | "REVERSAL",
      status: row.status as "POSTED" | "REVERSED",
      amountCents: Number(row.amount_cents),
      method: row.payment_method as PaymentMethod,
      paymentDate: String(row.payment_date),
      receivedBy: String(row.received_by),
      receivedByName: String(row.received_by_name),
      paymentSessionId: Number(row.payment_session_id),
      movementId: row.movement_id === null || row.movement_id === undefined ? undefined : Number(row.movement_id),
      movementSessionId: row.movement_session_id === null || row.movement_session_id === undefined ? undefined : Number(row.movement_session_id),
      movementType: row.movement_type as "Ingreso" | "Salida" | undefined,
      movementMethod: row.movement_method as PaymentMethod | undefined,
      movementAmountCents: row.movement_amount_cents === null || row.movement_amount_cents === undefined
        ? undefined : Number(row.movement_amount_cents),
      movementCreatedBy: row.movement_created_by ? String(row.movement_created_by) : undefined,
      movementCreatedByName: row.movement_created_by_name ? String(row.movement_created_by_name) : undefined,
    }));
  }

  public async getAutomaticMovements(
    filters: Required<Pick<CashReportFilters, "sessionId">> & CashReportFilters,
    executor: DbExecutor = dbClient
  ): Promise<AutomaticMovementRow[]> {
    const conditions = ["cm.session_id = ?", "cm.source IN ('PAYMENT', 'REVERSAL')"];
    const args: Array<string | number> = [filters.sessionId];
    if (filters.method) {
      conditions.push("cm.metodo = ?");
      args.push(filters.method);
    }
    if (filters.userId) {
      conditions.push("cm.created_by = ?");
      args.push(filters.userId);
    }
    const result = await executor.execute({
      sql: `SELECT cm.id AS movement_id, cm.payment_id, cm.tipo AS movement_type,
                   cm.metodo, ROUND(cm.monto * 100) AS amount_cents, cm.source,
                   cm.created_by, u.full_name AS created_by_name,
                   p.payment_number, p.cash_session_id AS payment_session_id
            FROM cash_movements cm
            LEFT JOIN payments p ON p.id = cm.payment_id
            LEFT JOIN users u ON u.id = cm.created_by
            WHERE ${conditions.join(" AND ")}
            ORDER BY cm.id DESC;`,
      args,
    });
    return result.rows.map((row) => ({
      movementId: Number(row.movement_id),
      paymentId: row.payment_id === null || row.payment_id === undefined ? undefined : Number(row.payment_id),
      paymentNumber: row.payment_number ? String(row.payment_number) : undefined,
      paymentSessionId: row.payment_session_id === null || row.payment_session_id === undefined
        ? undefined : Number(row.payment_session_id),
      movementType: row.movement_type as "Ingreso" | "Salida",
      method: row.metodo as PaymentMethod,
      amountCents: Number(row.amount_cents),
      source: row.source as "PAYMENT" | "REVERSAL",
      createdBy: row.created_by ? String(row.created_by) : undefined,
      createdByName: row.created_by_name ? String(row.created_by_name) : undefined,
    }));
  }

  public async getMovementTotals(sessionId: number, executor: DbExecutor = dbClient): Promise<CashMovementTotalsRow> {
    const result = await executor.execute({
      sql: `SELECT
              COALESCE(SUM(CASE WHEN tipo = 'Ingreso' AND metodo = 'Efectivo' THEN ROUND(monto * 100) ELSE 0 END), 0) AS cash_income_cents,
              COALESCE(SUM(CASE WHEN tipo = 'Ingreso' AND metodo <> 'Efectivo' THEN ROUND(monto * 100) ELSE 0 END), 0) AS digital_income_cents,
              COALESCE(SUM(CASE WHEN tipo = 'Salida' AND metodo = 'Efectivo' THEN ROUND(monto * 100) ELSE 0 END), 0) AS cash_output_cents,
              COALESCE(SUM(CASE WHEN source = 'MANUAL' AND tipo = 'Ingreso' THEN ROUND(monto * 100) ELSE 0 END), 0) AS manual_income_cents,
              COALESCE(SUM(CASE WHEN source = 'MANUAL' AND tipo = 'Salida' THEN ROUND(monto * 100) ELSE 0 END), 0) AS manual_output_cents
            FROM cash_movements WHERE session_id = ?;`,
      args: [sessionId],
    });
    const row = result.rows[0];
    return {
      cashIncomeCents: Number(row.cash_income_cents),
      digitalIncomeCents: Number(row.digital_income_cents),
      cashOutputCents: Number(row.cash_output_cents),
      manualIncomeCents: Number(row.manual_income_cents),
      manualOutputCents: Number(row.manual_output_cents),
    };
  }

  public async getCashUsers(sessionId: number, method?: PaymentMethod): Promise<CashUserRow[]> {
    const methodCondition = method ? " AND payment_method = ?" : "";
    const movementMethodCondition = method ? " AND metodo = ?" : "";
    const args: Array<string | number> = method ? [sessionId, method, sessionId, method] : [sessionId, sessionId];
    const result = await dbClient.execute({
      sql: `SELECT user_id, MAX(user_name) AS user_name FROM (
              SELECT p.received_by AS user_id, u.full_name AS user_name
              FROM payments p JOIN users u ON u.id = p.received_by
              WHERE p.cash_session_id = ?${methodCondition}
              UNION ALL
              SELECT cm.created_by AS user_id, u.full_name AS user_name
              FROM cash_movements cm JOIN users u ON u.id = cm.created_by
              WHERE cm.session_id = ? AND cm.source IN ('PAYMENT', 'REVERSAL')${movementMethodCondition}
            ) users_in_cash
            WHERE user_id IS NOT NULL
            GROUP BY user_id ORDER BY user_name;`,
      args,
    });
    return result.rows.map((row) => ({ userId: String(row.user_id), userName: String(row.user_name) }));
  }

  public async getDailyDashboard(date: string, range: UtcRange, method?: PaymentMethod, category?: string) {
    const paymentMethodCondition = method ? " AND p.payment_method = ?" : "";
    const paymentArgs: Array<string> = method
      ? [range.startUtc, range.endUtc, method]
      : [range.startUtc, range.endUtc];
    const categoryCondition = category
      ? " AND (CASE WHEN ii.service_type = 'LODGING' THEN 'Hospedaje' ELSE COALESCE(cat.categoria, 'Otro') END) = ?"
      : "";
    const invoiceArgs: Array<string> = category
      ? [range.startUtc, range.endUtc, category]
      : [range.startUtc, range.endUtc];
    const invoicedSql = category
      ? `SELECT COALESCE(SUM(ii.total_cents), 0) AS total_cents
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         LEFT JOIN service_consumptions sc ON ii.service_type = 'SERVICE' AND sc.id = ii.source_id
         LEFT JOIN service_catalog cat ON cat.id = sc.service_id
         WHERE i.status <> 'Anulada' AND i.issued_at >= ? AND i.issued_at < ?${categoryCondition};`
      : `SELECT COALESCE(SUM(i.total_cents), 0) AS total_cents
         FROM invoices i WHERE i.status <> 'Anulada' AND i.issued_at >= ? AND i.issued_at < ?;`;

    const [payments, methods, invoiced, advances, categories, activeCustomers, reservations, receivables, cash, recent] = await dbClient.batch([
      {
        sql: `SELECT COALESCE(SUM(CASE WHEN p.kind = 'REVERSAL' THEN -p.amount_cents ELSE p.amount_cents END), 0) AS total_cents
              FROM payments p
              WHERE p.payment_date >= ? AND p.payment_date < ?${paymentMethodCondition};`,
        args: paymentArgs,
      },
      {
        sql: `SELECT p.payment_method,
                     COALESCE(SUM(CASE WHEN p.kind = 'REVERSAL' THEN -p.amount_cents ELSE p.amount_cents END), 0) AS total_cents,
                     COUNT(*) AS operation_count
               FROM payments p WHERE p.payment_date >= ? AND p.payment_date < ?${paymentMethodCondition}
                GROUP BY p.payment_method ORDER BY p.payment_method;`,
        args: paymentArgs,
      },
      {
        sql: invoicedSql,
        args: category ? invoiceArgs : [range.startUtc, range.endUtc],
      },
      {
        sql: `SELECT COALESCE(SUM(CASE WHEN p.kind = 'REVERSAL' THEN -p.amount_cents ELSE p.amount_cents END), 0) AS total_cents
              FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
               WHERE p.payment_date >= ? AND p.payment_date < ?
                 AND (i.issued_at IS NULL OR p.payment_date < i.issued_at)${paymentMethodCondition};`,
        args: paymentArgs,
      },
      {
        sql: `SELECT CASE WHEN ii.service_type = 'LODGING' THEN 'Hospedaje' ELSE COALESCE(cat.categoria, 'Otro') END AS category,
                     COALESCE(SUM(ii.total_cents), 0) AS total_cents
               FROM invoice_items ii
               JOIN invoices i ON i.id = ii.invoice_id
               LEFT JOIN service_consumptions sc ON ii.service_type = 'SERVICE' AND sc.id = ii.source_id
               LEFT JOIN service_catalog cat ON cat.id = sc.service_id
                WHERE i.status <> 'Anulada' AND i.issued_at >= ? AND i.issued_at < ?${categoryCondition}
                GROUP BY category ORDER BY total_cents DESC;`,
        args: invoiceArgs,
      },
      {
        sql: `SELECT COUNT(DISTINCT customer_id) AS count FROM stays
               WHERE check_in_at < ? AND (check_out_at IS NULL OR check_out_at > ?)
                 AND estado <> 'Cancelada';`,
        args: [range.endUtc, range.startUtc],
      },
      {
        sql: `SELECT
                SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS created_count,
                SUM(CASE WHEN fecha_entrada = ? AND estado <> 'Cancelada' THEN 1 ELSE 0 END) AS arrival_count,
                SUM(CASE WHEN fecha_salida = ? AND estado <> 'Cancelada' THEN 1 ELSE 0 END) AS departure_count
              FROM reservations;`,
        args: [range.startUtc, range.endUtc, date, date],
      },
      {
        sql: `SELECT COALESCE(SUM(balance_cents), 0) AS total_cents, COUNT(*) AS count
              FROM invoices
               WHERE status IN ('Emitida', 'Parcial') AND issued_at < ?;`,
        args: [range.endUtc],
      },
      { sql: "SELECT id, responsable, apertura FROM cash_sessions WHERE is_closed = 0 ORDER BY id DESC LIMIT 1;", args: [] },
      {
        sql: `SELECT p.payment_number, p.amount_cents, p.payment_method, p.kind, p.payment_date,
                     c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
                     r.codigo_reserva
              FROM payments p
              JOIN customers c ON c.id = p.customer_id
              LEFT JOIN reservations r ON r.id = p.reservation_id
               WHERE p.payment_date >= ? AND p.payment_date < ?${paymentMethodCondition}
               ORDER BY p.payment_date DESC, p.id DESC LIMIT 8;`,
        args: paymentArgs,
      },
    ], "read");

    return {
      collectedCents: Number(payments.rows[0].total_cents),
      invoicedCents: Number(invoiced.rows[0].total_cents),
      advanceCents: Number(advances.rows[0].total_cents),
      methods: methods.rows,
      categories: categories.rows,
      activeCustomers: Number(activeCustomers.rows[0].count),
      reservations: reservations.rows[0],
      receivableCents: Number(receivables.rows[0].total_cents),
      receivableCount: Number(receivables.rows[0].count),
      cash: cash.rows[0],
      recent: recent.rows,
    };
  }

  public async getServicesReport(range: UtcRange, category?: string) {
    const conditions = ["sc.consumed_at >= ? AND sc.consumed_at < ?", "sc.estado IN ('Entregado', 'Consumido')"];
    const args: string[] = [range.startUtc, range.endUtc];
    if (category) {
      conditions.push("cat.categoria = ?");
      args.push(category);
    }
    const result = await dbClient.execute({
      sql: `SELECT cat.categoria, cat.nombre AS service_name,
                   COUNT(*) AS consumption_count, COALESCE(SUM(sc.cantidad), 0) AS quantity,
                   COALESCE(SUM(sc.subtotal_cents), 0) AS total_cents
            FROM service_consumptions sc JOIN service_catalog cat ON cat.id = sc.service_id
            WHERE ${conditions.join(" AND ")}
            GROUP BY cat.categoria, cat.nombre
            ORDER BY total_cents DESC, cat.nombre;`,
      args,
    });
    return result.rows;
  }

  public async getMonthlyRevenue(ranges: Array<UtcRange & { month: number }>) {
    const results = await dbClient.batch(ranges.flatMap((range) => [
      {
        sql: `SELECT COALESCE(SUM(total_cents), 0) AS invoiced_cents,
                     COALESCE(SUM(balance_cents), 0) AS pending_cents
              FROM invoices
              WHERE status <> 'Anulada' AND issued_at >= ? AND issued_at < ?;`,
        args: [range.startUtc, range.endUtc],
      },
      {
        sql: `SELECT COALESCE(SUM(CASE WHEN kind = 'REVERSAL' THEN -amount_cents ELSE amount_cents END), 0) AS collected_cents
              FROM payments WHERE payment_date >= ? AND payment_date < ?;`,
        args: [range.startUtc, range.endUtc],
      },
    ]), "read");
    return {
      invoiced: ranges.map((range, index) => ({
        month: range.month,
        invoiced_cents: Number(results[index * 2].rows[0]?.invoiced_cents ?? 0),
        pending_cents: Number(results[index * 2].rows[0]?.pending_cents ?? 0),
      })),
      collected: ranges.map((range, index) => ({
        month: range.month,
        collected_cents: Number(results[index * 2 + 1].rows[0]?.collected_cents ?? 0),
      })),
    };
  }

  public async getReceivables() {
    const result = await dbClient.execute(
      `SELECT i.id, i.invoice_number, i.total_cents, i.paid_amount_cents, i.balance_cents,
              i.status, i.issued_at, c.id AS customer_id, c.documento AS customer_document,
              c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
              r.codigo_reserva, s.habitacion
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       JOIN reservations r ON r.id = i.reservation_id
       JOIN stays s ON s.id = i.stay_id
       WHERE i.status IN ('Emitida', 'Parcial') AND i.balance_cents > 0
       ORDER BY i.issued_at ASC, i.id ASC;`
    );
    return result.rows;
  }

  public async getRevenueCategories(range: UtcRange, category?: string) {
    const categoryCondition = category
      ? " AND (CASE WHEN ii.service_type = 'LODGING' THEN 'Hospedaje' ELSE COALESCE(cat.categoria, 'Otro') END) = ?"
      : "";
    const result = await dbClient.execute({
      sql: `SELECT CASE WHEN ii.service_type = 'LODGING' THEN 'Hospedaje' ELSE COALESCE(cat.categoria, 'Otro') END AS category,
                   COUNT(*) AS line_count, COALESCE(SUM(ii.total_cents), 0) AS total_cents
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
            LEFT JOIN service_consumptions sc ON ii.service_type = 'SERVICE' AND sc.id = ii.source_id
            LEFT JOIN service_catalog cat ON cat.id = sc.service_id
             WHERE i.status <> 'Anulada' AND i.issued_at >= ? AND i.issued_at < ?${categoryCondition}
            GROUP BY category ORDER BY total_cents DESC;`,
      args: category ? [range.startUtc, range.endUtc, category] : [range.startUtc, range.endUtc],
    });
    return result.rows;
  }

  public async getFinancialExportData(
    range: UtcRange,
    filters: { method?: PaymentMethod; category?: string },
    businessFrom: string,
    businessTo: string
  ) {
    const invoiceCategoryCondition = filters.category
      ? " AND (CASE WHEN ii.service_type = 'LODGING' THEN 'Hospedaje' ELSE COALESCE(cat.categoria, 'Otro') END) = ?"
      : "";
    const paymentMethodCondition = filters.method ? " AND p.payment_method = ?" : "";
    const invoiceArgs: Array<string> = filters.category
      ? [range.startUtc, range.endUtc, filters.category]
      : [range.startUtc, range.endUtc];
    const paymentArgs: Array<string> = filters.method
      ? [range.startUtc, range.endUtc, filters.method]
      : [range.startUtc, range.endUtc];
    const movementArgs: Array<string> = [range.startUtc, range.endUtc, businessFrom, businessTo];
    const invoiceTotalSql = filters.category
      ? `SELECT COALESCE(SUM(ii.total_cents), 0) AS total_cents
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         LEFT JOIN service_consumptions sc ON ii.service_type = 'SERVICE' AND sc.id = ii.source_id
         LEFT JOIN service_catalog cat ON cat.id = sc.service_id
         WHERE i.status <> 'Anulada' AND i.issued_at >= ? AND i.issued_at < ?${invoiceCategoryCondition};`
      : `SELECT COALESCE(SUM(i.total_cents), 0) AS total_cents
         FROM invoices i
         WHERE i.status <> 'Anulada' AND i.issued_at >= ? AND i.issued_at < ?;`;

    const results = await dbClient.batch([
      { sql: invoiceTotalSql, args: invoiceArgs },
      {
        sql: `SELECT
                COALESCE(SUM(CASE WHEN p.kind = 'REVERSAL' THEN -p.amount_cents ELSE p.amount_cents END), 0) AS collected_cents,
                COALESCE(SUM(CASE WHEN i.issued_at IS NULL OR p.payment_date < i.issued_at
                  THEN CASE WHEN p.kind = 'REVERSAL' THEN -p.amount_cents ELSE p.amount_cents END ELSE 0 END), 0) AS advances_cents
              FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id
              WHERE p.payment_date >= ? AND p.payment_date < ?${paymentMethodCondition};`,
        args: paymentArgs,
      },
      {
        sql: `SELECT p.payment_method,
                     COALESCE(SUM(CASE WHEN p.kind = 'REVERSAL' THEN -p.amount_cents ELSE p.amount_cents END), 0) AS total_cents,
                     COUNT(*) AS operation_count
              FROM payments p
              WHERE p.payment_date >= ? AND p.payment_date < ?${paymentMethodCondition}
              GROUP BY p.payment_method ORDER BY p.payment_method;`,
        args: paymentArgs,
      },
      {
        sql: `SELECT CASE WHEN ii.service_type = 'LODGING' THEN 'Hospedaje' ELSE COALESCE(cat.categoria, 'Otro') END AS category,
                     COUNT(*) AS line_count, COALESCE(SUM(ii.total_cents), 0) AS total_cents
              FROM invoice_items ii
              JOIN invoices i ON i.id = ii.invoice_id
              LEFT JOIN service_consumptions sc ON ii.service_type = 'SERVICE' AND sc.id = ii.source_id
              LEFT JOIN service_catalog cat ON cat.id = sc.service_id
              WHERE i.status <> 'Anulada' AND i.issued_at >= ? AND i.issued_at < ?${invoiceCategoryCondition}
              GROUP BY category ORDER BY total_cents DESC;`,
        args: invoiceArgs,
      },
      {
        sql: `SELECT i.invoice_number, i.issued_at, i.status, i.subtotal_cents, i.tax_cents,
                     i.discount_cents, i.total_cents, i.paid_amount_cents, i.balance_cents,
                     c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
                     c.documento AS customer_document, r.codigo_reserva, r.habitacion,
                     issuer.full_name AS issued_by_name
              FROM invoices i
              JOIN customers c ON c.id = i.customer_id
              JOIN reservations r ON r.id = i.reservation_id
              LEFT JOIN users issuer ON issuer.id = i.issued_by
              WHERE i.issued_at >= ? AND i.issued_at < ?
                AND (? IS NULL OR EXISTS (
                  SELECT 1 FROM invoice_items ii
                  LEFT JOIN service_consumptions sc ON ii.service_type = 'SERVICE' AND sc.id = ii.source_id
                  LEFT JOIN service_catalog cat ON cat.id = sc.service_id
                  WHERE ii.invoice_id = i.id
                    AND (CASE WHEN ii.service_type = 'LODGING' THEN 'Hospedaje' ELSE COALESCE(cat.categoria, 'Otro') END) = ?
                ))
              ORDER BY i.issued_at, i.invoice_number;`,
        args: [range.startUtc, range.endUtc, filters.category ?? null, filters.category ?? null],
      },
      {
        sql: `SELECT i.invoice_number, i.issued_at, i.status, c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
                     r.codigo_reserva, CASE WHEN ii.service_type = 'LODGING' THEN 'Hospedaje' ELSE COALESCE(cat.categoria, 'Otro') END AS category,
                     ii.service_type, ii.description, ii.quantity, ii.unit_price_cents, ii.subtotal_cents, ii.tax_cents, ii.total_cents
              FROM invoice_items ii
              JOIN invoices i ON i.id = ii.invoice_id
              JOIN customers c ON c.id = i.customer_id
              JOIN reservations r ON r.id = i.reservation_id
              LEFT JOIN service_consumptions sc ON ii.service_type = 'SERVICE' AND sc.id = ii.source_id
              LEFT JOIN service_catalog cat ON cat.id = sc.service_id
              WHERE i.issued_at >= ? AND i.issued_at < ?${invoiceCategoryCondition}
              ORDER BY i.issued_at, i.invoice_number, ii.id;`,
        args: invoiceArgs,
      },
      {
        sql: `SELECT p.payment_number, p.kind, p.status, p.payment_date, p.amount_cents,
                     p.payment_method, p.reference, p.void_reason,
                     original.payment_number AS reverses_payment_number,
                     c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
                     c.documento AS customer_document, r.codigo_reserva, i.invoice_number,
                     receiver.full_name AS received_by_name,
                     CASE WHEN i.issued_at IS NULL OR p.payment_date < i.issued_at THEN 1 ELSE 0 END AS is_advance
              FROM payments p
              JOIN customers c ON c.id = p.customer_id
              LEFT JOIN reservations r ON r.id = p.reservation_id
              LEFT JOIN invoices i ON i.id = p.invoice_id
              LEFT JOIN payments original ON original.id = p.reverses_payment_id
              JOIN users receiver ON receiver.id = p.received_by
              WHERE p.payment_date >= ? AND p.payment_date < ?${paymentMethodCondition}
              ORDER BY p.payment_date, p.id;`,
        args: paymentArgs,
      },
      {
        sql: `SELECT i.invoice_number, i.issued_at, i.status, i.total_cents, i.paid_amount_cents, i.balance_cents,
                     c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
                     c.documento AS customer_document, r.codigo_reserva, s.habitacion
              FROM invoices i
              JOIN customers c ON c.id = i.customer_id
              JOIN reservations r ON r.id = i.reservation_id
              JOIN stays s ON s.id = i.stay_id
              WHERE i.status IN ('Emitida', 'Parcial') AND i.balance_cents > 0
              ORDER BY i.issued_at, i.invoice_number;`,
        args: [],
      },
      {
        sql: `SELECT cm.id, cm.fecha, cm.tipo, cm.concepto, cm.descripcion, cm.metodo, ROUND(cm.monto * 100) AS amount_cents,
                     cm.source, cm.payment_id, p.payment_number, cm.session_id,
                     cs.responsable AS cash_responsible,
                     c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
                     created_by.full_name AS created_by_name
              FROM cash_movements cm
              JOIN cash_sessions cs ON cs.id = cm.session_id
              LEFT JOIN payments p ON p.id = cm.payment_id
              LEFT JOIN customers c ON c.id = cm.customer_id
              LEFT JOIN users created_by ON created_by.id = cm.created_by
              WHERE (
                (cm.source IN ('PAYMENT', 'REVERSAL') AND p.payment_date >= ? AND p.payment_date < ?)
                OR (
                  cm.source NOT IN ('PAYMENT', 'REVERSAL')
                  AND CASE
                    WHEN cm.fecha LIKE '__/__/____,%' THEN substr(cm.fecha, 7, 4) || '-' || substr(cm.fecha, 4, 2) || '-' || substr(cm.fecha, 1, 2)
                    ELSE substr(cm.fecha, 1, 10)
                  END BETWEEN ? AND ?
                )
              )
              ORDER BY cm.fecha, cm.id;`,
        args: movementArgs,
      },
      {
        sql: `SELECT sc.consumed_at, sc.estado, sc.cantidad, sc.precio_unitario_cents, sc.subtotal_cents,
                     sc.observaciones, sc.source_type, cat.categoria, cat.nombre AS service_name,
                     c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
                     r.codigo_reserva, s.habitacion, creator.full_name AS created_by_name
              FROM service_consumptions sc
              JOIN service_catalog cat ON cat.id = sc.service_id
              JOIN customers c ON c.id = sc.customer_id
              JOIN stays s ON s.id = sc.stay_id
              JOIN reservations r ON r.id = s.reservation_id
              JOIN users creator ON creator.id = sc.created_by
              WHERE sc.consumed_at >= ? AND sc.consumed_at < ?
                AND sc.estado IN ('Entregado', 'Consumido')${filters.category ? " AND cat.categoria = ?" : ""}
              ORDER BY sc.consumed_at, sc.id;`,
        args: filters.category
          ? [range.startUtc, range.endUtc, filters.category]
          : [range.startUtc, range.endUtc],
      },
    ], "read");

    return {
      invoicedCents: Number(results[0].rows[0]?.total_cents ?? 0),
      collectedCents: Number(results[1].rows[0]?.collected_cents ?? 0),
      advancesCents: Number(results[1].rows[0]?.advances_cents ?? 0),
      byMethod: results[2].rows,
      byCategory: results[3].rows,
      invoices: results[4].rows,
      invoiceLines: results[5].rows,
      payments: results[6].rows,
      receivables: results[7].rows,
      cashMovements: results[8].rows,
      services: results[9].rows,
    };
  }
}
