import { BillingRepository } from "../repositories/billing.repository.js";
import { CreateBillingAccountDto, UpdateBillingAccountDto, RecordPaymentDto } from "../dtos/billing.dto.js";
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

  public async update(id: number, dto: UpdateBillingAccountDto): Promise<BillingModel> {
    const account = await this.getById(id);

    if (dto.total !== undefined) {
      const newTotal = Number(dto.total);
      if (newTotal <= 0) {
        throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El total debe ser mayor a 0" };
      }
      if (newTotal < account.pagado) {
        throw {
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: `El nuevo total ($${newTotal}) no puede ser menor a lo ya pagado ($${account.pagado})`,
        };
      }
      account.total = newTotal;
      account.saldo = Number((newTotal - account.pagado).toFixed(2));
      account.estado = account.saldo === 0 ? "Pagado" : (account.pagado > 0 ? "Parcial" : "Pendiente");
    }

    if (dto.huesped !== undefined) account.huesped = dto.huesped.trim();
    if (dto.habitacion !== undefined) account.habitacion = dto.habitacion.trim();
    if (dto.concepto !== undefined) account.concepto = dto.concepto.trim();

    await this.billingRepo.save(account);
    return account;
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

  public async delete(id: number): Promise<void> {
    const account = await this.getById(id);
    if (account.pagado > 0) {
      throw {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: `No se puede eliminar la cuenta #${id} porque tiene abonos registrados ($${account.pagado}). Debe anularse contablemente.`,
      };
    }
    const deleted = await this.billingRepo.delete(id);
    if (!deleted) {
      throw { statusCode: 500, code: "INTERNAL_ERROR", message: "No se pudo eliminar la cuenta de cobro" };
    }
  }
}
