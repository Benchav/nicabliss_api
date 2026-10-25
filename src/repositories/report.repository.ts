import { dbClient } from "../db/client.js";
import { PaymentMethod } from "../models/payment.model.js";

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
  public async findCashSession(sessionId?: number): Promise<CashSessionReportRow | null> {
    const result = sessionId
      ? await dbClient.execute({ sql: "SELECT * FROM cash_sessions WHERE id = ? LIMIT 1;", args: [sessionId] })
      : await dbClient.execute(
          "SELECT * FROM cash_sessions ORDER BY is_closed ASC, id DESC LIMIT 1;"
        );
    return result.rows[0] ? mapSession(result.rows[0] as Record<string, unknown>) : null;
  }

  public async getPayments(filters: Required<Pick<CashReportFilters, "sessionId">> & CashReportFilters): Promise<PaymentReconciliationRow[]> {
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
    const result = await dbClient.execute({
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

  public async getAutomaticMovements(filters: Required<Pick<CashReportFilters, "sessionId">> & CashReportFilters): Promise<AutomaticMovementRow[]> {
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
    const result = await dbClient.execute({
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

  public async getMovementTotals(sessionId: number): Promise<CashMovementTotalsRow> {
    const result = await dbClient.execute({
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
}
