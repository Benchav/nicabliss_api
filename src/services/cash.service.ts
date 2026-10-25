import { CashRepository } from "../repositories/cash.repository.js";
import { OpenCashDto, AddMovementDto, CloseCashDto } from "../dtos/cash.dto.js";
import { CashSessionModel, CashMovementModel } from "../models/cash.model.js";
import { ReportRepository } from "../repositories/report.repository.js";
import { ReportService } from "./report.service.js";

export class CashService {
  constructor(
    private cashRepo: CashRepository,
    private reportService: ReportService = new ReportService(new ReportRepository())
  ) {}

  public async getCurrentSession(): Promise<CashSessionModel | null> {
    return this.cashRepo.getCurrentSession();
  }

  public async openSession(dto: OpenCashDto): Promise<CashSessionModel> {
    const current = await this.cashRepo.getCurrentSession();
    if (current && !current.isClosed) {
      throw { statusCode: 409, code: "CONFLICT", message: `Ya existe un turno de caja abierto por ${current.responsable}` };
    }

    const fondo = Number(dto.fondoInicial) || 0;
    if (fondo < 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El fondo inicial no puede ser negativo" };
    }

    const session: CashSessionModel = {
      id: Date.now(),
      responsable: dto.responsable.trim(),
      apertura: new Date().toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" }),
      fondoInicial: fondo,
      ingresosEfectivo: 0,
      ingresosDigitales: 0,
      salidasEfectivo: 0,
      efectivoEsperado: fondo,
      observaciones: "",
      isClosed: false,
      movimientos: [],
    };

    await this.cashRepo.saveCurrentSession(session);
    return session;
  }

  public async addMovement(dto: AddMovementDto, userId?: string): Promise<CashSessionModel> {
    const session = await this.cashRepo.getCurrentSession();
    if (!session || session.isClosed) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "No hay un turno de caja abierto para registrar movimientos" };
    }

    const monto = Number(dto.monto);
    if (monto <= 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El monto debe ser mayor que cero" };
    }

    if (dto.tipo === "Salida" && dto.metodo === "Efectivo" && monto > session.efectivoEsperado) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: `La salida ($${monto}) supera el efectivo en caja ($${session.efectivoEsperado})` };
    }

    const movimiento: CashMovementModel = {
      id: Date.now(),
      fecha: new Date().toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" }),
      tipo: dto.tipo,
      concepto: dto.concepto,
      descripcion: dto.descripcion?.trim() || "",
      metodo: dto.metodo,
      monto,
      createdBy: userId,
      source: "MANUAL",
    };

    session.movimientos.unshift(movimiento);

    // Recalcular totales
    session.ingresosEfectivo = session.movimientos
      .filter(m => m.tipo === "Ingreso" && m.metodo === "Efectivo")
      .reduce((sum, m) => sum + m.monto, 0);

    session.ingresosDigitales = session.movimientos
      .filter(m => m.tipo === "Ingreso" && m.metodo !== "Efectivo")
      .reduce((sum, m) => sum + m.monto, 0);

    session.salidasEfectivo = session.movimientos
      .filter(m => m.tipo === "Salida" && m.metodo === "Efectivo")
      .reduce((sum, m) => sum + m.monto, 0);

    session.efectivoEsperado = Number((session.fondoInicial + session.ingresosEfectivo - session.salidasEfectivo).toFixed(2));

    await this.cashRepo.saveCurrentSession(session);
    return session;
  }

  public async closeSession(dto: CloseCashDto, userId?: string, ipAddress?: string): Promise<CashSessionModel> {
    const session = await this.cashRepo.getCurrentSession();
    if (!session || session.isClosed) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "No hay un turno de caja abierto para cerrar" };
    }

    const contado = Number(dto.efectivoContado);
    if (isNaN(contado) || contado < 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El efectivo contado debe ser un número válido mayor o igual a 0" };
    }

    const reconciliation = await this.reportService.getCashReconciliation({ sessionId: session.id });
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

    session.efectivoContado = contado;
    session.diferencia = Number((contado - session.efectivoEsperado).toFixed(2));
    session.observaciones = dto.observaciones?.trim() || "";
    session.cierre = new Date().toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" });
    session.isClosed = true;

    await this.cashRepo.closeWithAudit(session, userId, ipAddress);
    return session;
  }

  public async getHistory(): Promise<CashSessionModel[]> {
    return this.cashRepo.getHistory();
  }
}
