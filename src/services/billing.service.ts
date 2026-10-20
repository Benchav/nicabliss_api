import { BillingRepository } from "../repositories/billing.repository.js";
import { CreateBillingAccountDto, RecordPaymentDto } from "../dtos/billing.dto.js";
import { BillingModel } from "../models/billing.model.js";

export class BillingService {
  constructor(private billingRepo: BillingRepository) {}

  public async getAll(search?: string) {
    const cuentas = await this.billingRepo.findAll(search);
    const resumen = await this.billingRepo.getTotals();
    return { cuentas, resumen };
  }

  public async getById(id: number): Promise<BillingModel> {
    const account = await this.billingRepo.findById(id);
    if (!account) throw { statusCode: 404, code: "NOT_FOUND", message: "Cuenta de cobro no encontrada" };
    return account;
  }

  public async create(dto: CreateBillingAccountDto): Promise<BillingModel> {
    if (!dto.huesped?.trim() || !dto.habitacion?.trim() || !dto.concepto?.trim()) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Huésped, habitación y concepto son obligatorios" };
    }
    if (dto.total <= 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El total debe ser mayor a 0" };
    }

    const newAccount: BillingModel = {
      id: Date.now(),
      huesped: dto.huesped.trim(),
      habitacion: dto.habitacion.trim(),
      concepto: dto.concepto.trim(),
      total: Number(dto.total),
      pagado: 0,
      saldo: Number(dto.total),
      estado: "Pendiente",
      fecha: new Date().toISOString().split("T")[0],
    };

    await this.billingRepo.save(newAccount);
    return newAccount;
  }

  public async recordPayment(id: number, dto: RecordPaymentDto): Promise<BillingModel> {
    const account = await this.getById(id);
    const amount = Number(dto.monto);

    if (amount <= 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El monto a abonar debe ser mayor que 0" };
    }
    if (amount > account.saldo) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: `El monto ($${amount}) supera el saldo pendiente ($${account.saldo})` };
    }

    account.pagado = Number((account.pagado + amount).toFixed(2));
    account.saldo = Number((account.total - account.pagado).toFixed(2));
    account.estado = account.saldo === 0 ? "Pagado" : "Parcial";

    await this.billingRepo.save(account);
    return account;
  }
}
