import { CashRepository } from "../repositories/cash.repository.js";
import { OpenCashDto, AddMovementDto, CloseCashDto } from "../dtos/cash.dto.js";
import { CashSessionModel, CashMovementModel } from "../models/cash.model.js";
import { ReportRepository } from "../repositories/report.repository.js";
import { ReportService } from "./report.service.js";
import { config } from "../config/env.js";
import { formatBusinessDateTime } from "../utils/business-time.js";
import { dbClient } from "../db/client.js";
import { centsToMoney, parseMoneyToCents } from "../utils/money.js";

export class CashService {
  constructor(
    private cashRepo: CashRepository,
    private reportService: ReportService = new ReportService(new ReportRepository())
  ) {}

  public async getCurrentSession(): Promise<CashSessionModel | null> {
    return this.cashRepo.getCurrentSession();
  }

  public async openSession(
    dto: OpenCashDto,
    userId: string,
    userFullName: string,
    ipAddress?: string
  ): Promise<CashSessionModel> {
    const current = await this.cashRepo.getCurrentSession();
    if (current && !current.isClosed) {
      throw {
        statusCode: 409,
        code: "CASH_SESSION_ALREADY_OPEN",
        message: `Ya existe un turno de caja abierto${current.responsable ? ` por ${current.responsable}` : ""}`,
      };
    }

    const fondoCents = parseMoneyToCents(dto.fondoInicial, "fondoInicial");
    const fondo = centsToMoney(fondoCents);

    const session: Omit<CashSessionModel, "id" | "movimientos" | "openedBy"> & { openedBy: string } = {
      responsable: userFullName.trim(),
      openedBy: userId,
      openedByName: userFullName.trim(),
      apertura: formatBusinessDateTime(new Date(), config.businessTimezone),
      fondoInicial: fondo,
      ingresosEfectivo: 0,
      ingresosDigitales: 0,
      salidasEfectivo: 0,
      efectivoEsperado: fondo,
      observaciones: "",
      isClosed: false,
    };

    return this.cashRepo.openSession(session, ipAddress);
  }

  public async addMovement(
    dto: AddMovementDto,
    userId: string,
    ipAddress?: string,
    idempotencyKey?: string
  ): Promise<CashSessionModel> {
    const session = await this.cashRepo.getCurrentSession();
    if (!session || session.isClosed) {
      throw { statusCode: 409, code: "CASH_SESSION_REQUIRED", message: "No hay una caja abierta para registrar movimientos" };
    }
    if (session.openedBy !== userId) {
      throw {
        statusCode: 403,
        code: "CASH_SESSION_OWNER_REQUIRED",
        message: `Solo ${session.responsable} puede registrar movimientos en esta caja`,
      };
    }

    const amountCents = parseMoneyToCents(dto.monto, "monto");
    const monto = centsToMoney(amountCents);
    if (amountCents <= 0) throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El monto debe ser mayor que cero" };
    const requestKey = idempotencyKey?.trim() || undefined;
    if (requestKey && requestKey.length > 200) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La clave de idempotencia no puede superar 200 caracteres" };
    }

    if (dto.tipo === "Salida" && dto.metodo === "Efectivo" && monto > session.efectivoEsperado) {
      throw { statusCode: 409, code: "INSUFFICIENT_CASH", message: `La salida ($${monto}) supera el efectivo en caja ($${session.efectivoEsperado})` };
    }

    const movimiento: Omit<CashMovementModel, "id"> = {
      fecha: formatBusinessDateTime(new Date(), config.businessTimezone),
      tipo: dto.tipo,
      concepto: dto.concepto,
      descripcion: dto.descripcion?.trim() || "",
      metodo: dto.metodo,
      monto,
      createdBy: userId,
      source: "MANUAL",
    };

    return this.cashRepo.addManualMovement(session.id, movimiento, userId, ipAddress, requestKey);
  }

  public async closeSession(
    dto: CloseCashDto,
    userId: string,
    role: string,
    ipAddress?: string
  ): Promise<CashSessionModel> {
    const transaction = await dbClient.transaction("write");
    try {
      const session = await this.cashRepo.getCurrentSession(transaction);
      if (!session || session.isClosed) {
        throw { statusCode: 409, code: "CASH_SESSION_REQUIRED", message: "No hay una caja abierta para cerrar" };
      }

      const adminOverride = session.openedBy !== userId;
      if (adminOverride && role !== "ADMIN") {
        throw {
          statusCode: 403,
          code: "CASH_SESSION_OWNER_REQUIRED",
          message: `Solo ${session.responsable} o un administrador puede cerrar esta caja`,
        };
      }
      if (adminOverride && !dto.observaciones?.trim()) {
        throw {
          statusCode: 400,
          code: "ADMIN_CLOSE_REASON_REQUIRED",
          message: "El cierre administrativo requiere indicar el motivo en las observaciones",
        };
      }

      const contadoCents = parseMoneyToCents(dto.efectivoContado, "efectivoContado");
      const reconciliation = await this.reportService.getCashReconciliation({ sessionId: session.id }, transaction);
      if (!reconciliation.balanced) {
        throw {
          statusCode: 409,
          code: "CASH_RECONCILIATION_MISMATCH",
          message: "La caja no puede cerrarse porque existen descuadres entre pagos y movimientos automáticos",
          details: {
            difference: reconciliation.totals.difference,
            mismatchCount: reconciliation.mismatchCount,
            missingMovementCount: reconciliation.missingMovementCount,
            orphanMovementCount: reconciliation.orphanMovementCount,
            sessionIntegrity: reconciliation.sessionIntegrity,
          },
        };
      }

      session.efectivoContado = centsToMoney(contadoCents);
      session.diferencia = centsToMoney(contadoCents - parseMoneyToCents(session.efectivoEsperado));
      session.observaciones = dto.observaciones?.trim() || "";
      session.cierre = formatBusinessDateTime(new Date(), config.businessTimezone);
      session.closedBy = userId;
      session.isClosed = true;

      await this.cashRepo.closeWithAudit(session, userId, ipAddress, transaction, adminOverride);
      await transaction.commit();
      return (await this.cashRepo.getSessionById(session.id)) ?? session;
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }

  public async getHistory(): Promise<CashSessionModel[]> {
    return this.cashRepo.getHistory();
  }
}
