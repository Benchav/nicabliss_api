import { PaymentMethod } from "../models/payment.model.js";
import {
  AutomaticMovementRow,
  CashReportFilters,
  PaymentReconciliationRow,
  ReportRepository,
} from "../repositories/report.repository.js";
import { centsToMoney } from "../utils/money.js";

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
}
