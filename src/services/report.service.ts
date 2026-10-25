import { PaymentMethod } from "../models/payment.model.js";
import {
  AutomaticMovementRow,
  CashReportFilters,
  PaymentReconciliationRow,
  ReportRepository,
} from "../repositories/report.repository.js";
import { centsToMoney } from "../utils/money.js";
import { config } from "../config/env.js";
import { businessDateRange, businessMonthRanges } from "../utils/business-time.js";

export type ReconciliationIssue =
  | "MISSING_MOVEMENT"
  | "MOVEMENT_WRONG_SESSION"
  | "AMOUNT_MISMATCH"
  | "DIRECTION_MISMATCH"
  | "METHOD_MISMATCH"
  | "USER_MISMATCH";

export interface CashReconciliationItem {
  paymentId: number;
  paymentNumber: string;
  kind: "PAYMENT" | "REVERSAL";
  status: "POSTED" | "REVERSED";
  method: PaymentMethod;
  paymentDate: string;
  userId: string;
  userName: string;
  expectedAmount: number;
  movementId?: number;
  movementAmount: number;
  difference: number;
  issues: ReconciliationIssue[];
}

export interface CashReconciliationReport {
  session: {
    id: number;
    responsable: string;
    apertura: string;
    cierre?: string;
    isClosed: boolean;
    fondoInicial: number;
  };
  filters: { method?: PaymentMethod; userId?: string };
  totals: {
    paymentCount: number;
    payments: number;
    reversals: number;
    netPayments: number;
    automaticMovementCount: number;
    movementIncome: number;
    movementReversals: number;
    netMovements: number;
    difference: number;
    manualIncome: number;
    manualOutput: number;
  };
  sessionIntegrity: {
    storedCashIncome: number;
    computedCashIncome: number;
    cashIncomeDifference: number;
    storedDigitalIncome: number;
    computedDigitalIncome: number;
    digitalIncomeDifference: number;
    storedCashOutput: number;
    computedCashOutput: number;
    cashOutputDifference: number;
    storedExpectedCash: number;
    computedExpectedCash: number;
    expectedCashDifference: number;
    balanced: boolean;
  };
  mismatchCount: number;
  missingMovementCount: number;
  orphanMovementCount: number;
  balanced: boolean;
  items: CashReconciliationItem[];
  orphanMovements: Array<{
    movementId: number;
    paymentId?: number;
    paymentNumber?: string;
    method: PaymentMethod;
    userId?: string;
    userName?: string;
    amount: number;
    source: "PAYMENT" | "REVERSAL";
  }>;
}

const paymentMethods: PaymentMethod[] = ["Efectivo", "Tarjeta", "Transferencia"];

function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

function signedPayment(row: PaymentReconciliationRow): number {
  return row.kind === "REVERSAL" ? -row.amountCents : row.amountCents;
}

function signedMovement(row: AutomaticMovementRow): number {
  return row.movementType === "Salida" ? -row.amountCents : row.amountCents;
}

export class ReportService {
  public constructor(private readonly repository: ReportRepository) {}

  public async getCashReconciliation(input: CashReportFilters = {}): Promise<CashReconciliationReport> {
    const filters = this.validateFilters(input);
    const session = await this.repository.findCashSession(filters.sessionId);
    if (!session) throw { statusCode: 404, code: "CASH_SESSION_NOT_FOUND", message: "No existe una sesión de caja para conciliar" };

    const scopedFilters = { ...filters, sessionId: session.id };
    const [payments, movements, movementTotals] = await Promise.all([
      this.repository.getPayments(scopedFilters),
      this.repository.getAutomaticMovements(scopedFilters),
      this.repository.getMovementTotals(session.id),
    ]);

    const items = payments.map((payment) => this.mapItem(payment, session.id));
    const paymentIds = new Set(payments.map((payment) => payment.paymentId));
    const orphanMovements = movements
      .filter((movement) => !movement.paymentId || movement.paymentSessionId !== session.id || !paymentIds.has(movement.paymentId))
      .map((movement) => ({
        movementId: movement.movementId,
        paymentId: movement.paymentId,
        paymentNumber: movement.paymentNumber,
        method: movement.method,
        userId: movement.createdBy,
        userName: movement.createdByName,
        amount: centsToMoney(signedMovement(movement)),
        source: movement.source,
      }));

    const paymentIncomeCents = payments.filter((payment) => payment.kind === "PAYMENT")
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const paymentReversalCents = payments.filter((payment) => payment.kind === "REVERSAL")
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const movementIncomeCents = movements.filter((movement) => movement.movementType === "Ingreso")
      .reduce((sum, movement) => sum + movement.amountCents, 0);
    const movementReversalCents = movements.filter((movement) => movement.movementType === "Salida")
      .reduce((sum, movement) => sum + movement.amountCents, 0);
    const netPaymentsCents = paymentIncomeCents - paymentReversalCents;
    const netMovementsCents = movementIncomeCents - movementReversalCents;

    const storedCashIncomeCents = moneyToCents(session.ingresosEfectivo);
    const storedDigitalIncomeCents = moneyToCents(session.ingresosDigitales);
    const storedCashOutputCents = moneyToCents(session.salidasEfectivo);
    const computedExpectedCashCents = moneyToCents(session.fondoInicial)
      + movementTotals.cashIncomeCents - movementTotals.cashOutputCents;
    const storedExpectedCashCents = moneyToCents(session.efectivoEsperado);
    const sessionIntegrityBalanced = storedCashIncomeCents === movementTotals.cashIncomeCents
      && storedDigitalIncomeCents === movementTotals.digitalIncomeCents
      && storedCashOutputCents === movementTotals.cashOutputCents
      && storedExpectedCashCents === computedExpectedCashCents;
    const mismatchCount = items.filter((item) => item.issues.length > 0).length;
    const missingMovementCount = items.filter((item) => item.issues.includes("MISSING_MOVEMENT")).length;

    return {
      session: {
        id: session.id,
        responsable: session.responsable,
        apertura: session.apertura,
        cierre: session.cierre,
        isClosed: session.isClosed,
        fondoInicial: session.fondoInicial,
      },
      filters: { method: filters.method, userId: filters.userId },
      totals: {
        paymentCount: payments.length,
        payments: centsToMoney(paymentIncomeCents),
        reversals: centsToMoney(paymentReversalCents),
        netPayments: centsToMoney(netPaymentsCents),
        automaticMovementCount: movements.length,
        movementIncome: centsToMoney(movementIncomeCents),
        movementReversals: centsToMoney(movementReversalCents),
        netMovements: centsToMoney(netMovementsCents),
        difference: centsToMoney(netPaymentsCents - netMovementsCents),
        manualIncome: centsToMoney(movementTotals.manualIncomeCents),
        manualOutput: centsToMoney(movementTotals.manualOutputCents),
      },
      sessionIntegrity: {
        storedCashIncome: session.ingresosEfectivo,
        computedCashIncome: centsToMoney(movementTotals.cashIncomeCents),
        cashIncomeDifference: centsToMoney(storedCashIncomeCents - movementTotals.cashIncomeCents),
        storedDigitalIncome: session.ingresosDigitales,
        computedDigitalIncome: centsToMoney(movementTotals.digitalIncomeCents),
        digitalIncomeDifference: centsToMoney(storedDigitalIncomeCents - movementTotals.digitalIncomeCents),
        storedCashOutput: session.salidasEfectivo,
        computedCashOutput: centsToMoney(movementTotals.cashOutputCents),
        cashOutputDifference: centsToMoney(storedCashOutputCents - movementTotals.cashOutputCents),
        storedExpectedCash: session.efectivoEsperado,
        computedExpectedCash: centsToMoney(computedExpectedCashCents),
        expectedCashDifference: centsToMoney(storedExpectedCashCents - computedExpectedCashCents),
        balanced: sessionIntegrityBalanced,
      },
      mismatchCount,
      missingMovementCount,
      orphanMovementCount: orphanMovements.length,
      balanced: netPaymentsCents === netMovementsCents
        && mismatchCount === 0
        && orphanMovements.length === 0
        && sessionIntegrityBalanced,
      items,
      orphanMovements,
    };
  }

  public async getCashByMethod(input: CashReportFilters = {}) {
    const filters = this.validateFilters(input);
    const session = await this.repository.findCashSession(filters.sessionId);
    if (!session) throw { statusCode: 404, code: "CASH_SESSION_NOT_FOUND", message: "No existe una sesión de caja para consultar" };
    const rows = await Promise.all(paymentMethods.map(async (method) => {
      const report = await this.getCashReconciliation({ sessionId: session.id, method, userId: filters.userId });
      return { method, ...report.totals, mismatchCount: report.mismatchCount, orphanMovementCount: report.orphanMovementCount,
        balanced: report.totals.difference === 0 && report.mismatchCount === 0 && report.orphanMovementCount === 0 };
    }));
    return { sessionId: session.id, userId: filters.userId, rows };
  }

  public async getCashByUser(input: CashReportFilters = {}) {
    const filters = this.validateFilters(input);
    const session = await this.repository.findCashSession(filters.sessionId);
    if (!session) throw { statusCode: 404, code: "CASH_SESSION_NOT_FOUND", message: "No existe una sesión de caja para consultar" };
    const users = await this.repository.getCashUsers(session.id, filters.method);
    const rows = await Promise.all(users.map(async (user) => {
      const report = await this.getCashReconciliation({ sessionId: session.id, method: filters.method, userId: user.userId });
      return { ...user, ...report.totals, mismatchCount: report.mismatchCount,
        orphanMovementCount: report.orphanMovementCount,
        balanced: report.totals.difference === 0 && report.mismatchCount === 0 && report.orphanMovementCount === 0 };
    }));
    return { sessionId: session.id, method: filters.method, rows };
  }

  public async getDailyDashboard(date: string, method?: PaymentMethod, category?: string) {
    this.validateDate(date, "date");
    const validatedMethod = this.validateFilters({ method }).method;
    const range = businessDateRange(date, date, config.businessTimezone);
    const data = await this.repository.getDailyDashboard(date, range, validatedMethod, category?.trim() || undefined);
    const methodMap = new Map(data.methods.map((row) => [String(row.payment_method), {
      method: String(row.payment_method) as PaymentMethod,
      amount: centsToMoney(Number(row.total_cents)),
      operationCount: Number(row.operation_count),
    }]));
    const methods = paymentMethods.map((paymentMethod) => methodMap.get(paymentMethod) ?? {
      method: paymentMethod, amount: 0, operationCount: 0,
    });
    const reservations = data.reservations;
    return {
      date,
      filters: { method: validatedMethod, category: category?.trim() || undefined },
      income: {
        collected: centsToMoney(data.collectedCents),
        invoiced: centsToMoney(data.invoicedCents),
        pending: centsToMoney(data.receivableCents),
        advances: centsToMoney(data.advanceCents),
      },
      byMethod: methods,
      byCategory: data.categories.map((row) => ({
        category: String(row.category), amount: centsToMoney(Number(row.total_cents)),
      })),
      activeCustomers: data.activeCustomers,
      reservations: {
        created: Number(reservations.created_count ?? 0),
        arrivals: Number(reservations.arrival_count ?? 0),
        departures: Number(reservations.departure_count ?? 0),
      },
      receivables: { count: data.receivableCount, amount: centsToMoney(data.receivableCents) },
      cash: data.cash ? {
        open: true,
        sessionId: Number(data.cash.id),
        responsible: String(data.cash.responsable),
        openedAt: String(data.cash.apertura),
      } : { open: false },
      recentPayments: data.recent.map((row) => ({
        paymentNumber: String(row.payment_number),
        customerName: String(row.customer_name),
        reservationCode: row.codigo_reserva ? String(row.codigo_reserva) : undefined,
        method: row.payment_method as PaymentMethod,
        kind: row.kind as "PAYMENT" | "REVERSAL",
        amount: centsToMoney((row.kind === "REVERSAL" ? -1 : 1) * Number(row.amount_cents)),
        paymentDate: String(row.payment_date),
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  public async getServices(from: string, to: string, category?: string) {
    this.validateRange(from, to);
    const rows = await this.repository.getServicesReport(
      businessDateRange(from, to, config.businessTimezone),
      category?.trim() || undefined
    );
    const items = rows.map((row) => ({
      category: String(row.categoria),
      serviceName: String(row.service_name),
      consumptionCount: Number(row.consumption_count),
      quantity: Number(row.quantity),
      revenue: centsToMoney(Number(row.total_cents)),
    }));
    return {
      from, to, category: category?.trim() || undefined,
      totals: {
        consumptionCount: items.reduce((sum, item) => sum + item.consumptionCount, 0),
        quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        revenue: Number(items.reduce((sum, item) => sum + item.revenue, 0).toFixed(2)),
      },
      items,
    };
  }

  public async getMonthlyRevenue(yearInput: number) {
    const year = Number(yearInput);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "year debe estar entre 2000 y 2100" };
    }
    const data = await this.repository.getMonthlyRevenue(businessMonthRanges(year, config.businessTimezone));
    const invoiced = new Map(data.invoiced.map((row) => [Number(row.month), row]));
    const collected = new Map(data.collected.map((row) => [Number(row.month), row]));
    const months = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const invoiceRow = invoiced.get(month);
      const paymentRow = collected.get(month);
      return {
        month,
        invoiced: centsToMoney(Number(invoiceRow?.invoiced_cents ?? 0)),
        collected: centsToMoney(Number(paymentRow?.collected_cents ?? 0)),
        pending: centsToMoney(Number(invoiceRow?.pending_cents ?? 0)),
      };
    });
    return {
      year,
      totals: {
        invoiced: Number(months.reduce((sum, row) => sum + row.invoiced, 0).toFixed(2)),
        collected: Number(months.reduce((sum, row) => sum + row.collected, 0).toFixed(2)),
        pending: Number(months.reduce((sum, row) => sum + row.pending, 0).toFixed(2)),
      },
      months,
    };
  }

  public async getReceivables() {
    const rows = await this.repository.getReceivables();
    const now = Date.now();
    const items = rows.map((row) => {
      const issuedAt = String(row.issued_at);
      return {
        invoiceId: Number(row.id),
        invoiceNumber: String(row.invoice_number),
        customerId: Number(row.customer_id),
        customerName: String(row.customer_name),
        customerDocument: String(row.customer_document),
        reservationCode: String(row.codigo_reserva),
        room: String(row.habitacion),
        total: centsToMoney(Number(row.total_cents)),
        paid: centsToMoney(Number(row.paid_amount_cents)),
        balance: centsToMoney(Number(row.balance_cents)),
        status: String(row.status),
        issuedAt,
        ageDays: Math.max(0, Math.floor((now - new Date(issuedAt).getTime()) / 86_400_000)),
      };
    });
    return {
      totals: {
        count: items.length,
        balance: Number(items.reduce((sum, item) => sum + item.balance, 0).toFixed(2)),
      },
      items,
    };
  }

  public async getRevenueCategories(from: string, to: string) {
    this.validateRange(from, to);
    const rows = await this.repository.getRevenueCategories(
      businessDateRange(from, to, config.businessTimezone)
    );
    const items = rows.map((row) => ({
      category: String(row.category),
      lineCount: Number(row.line_count),
      invoiced: centsToMoney(Number(row.total_cents)),
    }));
    return {
      from, to,
      total: Number(items.reduce((sum, item) => sum + item.invoiced, 0).toFixed(2)),
      items,
    };
  }

  private mapItem(payment: PaymentReconciliationRow, sessionId: number): CashReconciliationItem {
    const issues: ReconciliationIssue[] = [];
    const expectedCents = signedPayment(payment);
    const movementInSession = payment.movementId !== undefined && payment.movementSessionId === sessionId;
    if (payment.movementId === undefined) issues.push("MISSING_MOVEMENT");
    else if (!movementInSession) issues.push("MOVEMENT_WRONG_SESSION");
    if (movementInSession) {
      if (payment.amountCents !== payment.movementAmountCents) issues.push("AMOUNT_MISMATCH");
      const expectedDirection = payment.kind === "REVERSAL" ? "Salida" : "Ingreso";
      if (payment.movementType !== expectedDirection) issues.push("DIRECTION_MISMATCH");
      if (payment.movementMethod !== payment.method) issues.push("METHOD_MISMATCH");
      if (payment.movementCreatedBy !== payment.receivedBy) issues.push("USER_MISMATCH");
    }
    const movementCents = movementInSession
      ? (payment.movementType === "Salida" ? -(payment.movementAmountCents ?? 0) : payment.movementAmountCents ?? 0)
      : 0;
    return {
      paymentId: payment.paymentId,
      paymentNumber: payment.paymentNumber,
      kind: payment.kind,
      status: payment.status,
      method: payment.method,
      paymentDate: payment.paymentDate,
      userId: payment.receivedBy,
      userName: payment.receivedByName,
      expectedAmount: centsToMoney(expectedCents),
      movementId: movementInSession ? payment.movementId : undefined,
      movementAmount: centsToMoney(movementCents),
      difference: centsToMoney(expectedCents - movementCents),
      issues,
    };
  }

  private validateFilters(input: CashReportFilters): CashReportFilters {
    const sessionId = input.sessionId === undefined ? undefined : Number(input.sessionId);
    if (sessionId !== undefined && (!Number.isInteger(sessionId) || sessionId <= 0)) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "sessionId debe ser un entero positivo" };
    }
    if (input.method && !paymentMethods.includes(input.method)) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Método de pago inválido" };
    }
    return { sessionId, method: input.method, userId: input.userId?.trim() || undefined };
  }

  private validateRange(from: string, to: string): void {
    this.validateDate(from, "from");
    this.validateDate(to, "to");
    if (to < from) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "to no puede ser anterior a from" };
    }
  }

  private validateDate(value: string, field: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: `${field} debe usar formato YYYY-MM-DD` };
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: `${field} no es una fecha válida` };
    }
  }
}
