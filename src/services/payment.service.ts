import { CreatePaymentDto } from "../dtos/payment.dto.js";
import { PaymentModel } from "../models/payment.model.js";
import { PaymentRepository } from "../repositories/payment.repository.js";
import { ReservationRepository } from "../repositories/reservation.repository.js";
import { InvoiceRepository } from "../repositories/invoice.repository.js";
import { parseMoneyToCents } from "../utils/money.js";

export class PaymentService {
  public constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly reservationRepository: ReservationRepository,
    private readonly invoiceRepository: InvoiceRepository = new InvoiceRepository()
  ) {}

  public async create(
    reservationId: number,
    dto: CreatePaymentDto,
    userId: string,
    idempotencyKey: string | undefined,
    ipAddress?: string,
    invoiceId?: number
  ): Promise<PaymentModel> {
    if (!idempotencyKey?.trim()) {
      throw {
        statusCode: 400,
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "La cabecera Idempotency-Key es obligatoria para registrar pagos",
      };
    }
    const reservation = await this.reservationRepository.findById(reservationId);
    if (!reservation) throw { statusCode: 404, code: "NOT_FOUND", message: "Reserva no encontrada" };
    if (dto.paymentMethod !== "Efectivo" && !dto.reference?.trim()) {
      throw { statusCode: 400, code: "REFERENCE_REQUIRED", message: "La referencia es obligatoria para pagos digitales" };
    }
    return this.paymentRepository.create({
      reservationId,
      invoiceId,
      amountCents: parseMoneyToCents(dto.amount, "amount"),
      paymentMethod: dto.paymentMethod,
      reference: dto.reference?.trim() || undefined,
      receivedBy: userId,
      idempotencyKey: idempotencyKey.trim(),
      ipAddress,
      now: new Date().toISOString(),
    });
  }

  public async createForInvoice(
    invoiceId: number,
    dto: CreatePaymentDto,
    userId: string,
    idempotencyKey: string | undefined,
    ipAddress?: string
  ): Promise<PaymentModel> {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice) throw { statusCode: 404, code: "NOT_FOUND", message: "Factura no encontrada" };
    if (!["Emitida", "Parcial"].includes(invoice.status)) {
      throw { statusCode: 409, code: "INVALID_STATUS", message: "La factura no admite pagos en su estado actual" };
    }
    return this.create(invoice.reservationId, dto, userId, idempotencyKey, ipAddress, invoiceId);
  }

  public async getByReservation(reservationId: number): Promise<PaymentModel[]> {
    const reservation = await this.reservationRepository.findById(reservationId);
    if (!reservation) throw { statusCode: 404, code: "NOT_FOUND", message: "Reserva no encontrada" };
    return this.paymentRepository.findByReservation(reservationId);
  }

  public async void(id: number, reason: string, userId: string, ipAddress?: string): Promise<PaymentModel> {
    return this.paymentRepository.void(id, reason.trim(), userId, ipAddress);
  }

  public async getReceipt(id: number): Promise<Record<string, unknown>> {
    const receipt = await this.paymentRepository.getReceipt(id);
    if (!receipt) throw { statusCode: 404, code: "NOT_FOUND", message: "Pago no encontrado" };
    return receipt;
  }
}
