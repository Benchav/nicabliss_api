import { dbClient } from "../db/client.js";
import { InvoiceStatus } from "../models/invoice.model.js";
import { PaymentKind, PaymentMethod, PaymentStatus } from "../models/payment.model.js";
import { ReservationAccountInvoiceModel, ReservationAccountModel } from "../models/reservation-account.model.js";
import { ReservationStatus } from "../models/reservation.model.js";
import { StayPaymentModel } from "../models/stay-account.model.js";
import { StayStatus } from "../models/stay.model.js";
import { centsToMoney } from "../utils/money.js";
import { ServiceRepository } from "./service.repository.js";

const accountSelect = `
  SELECT r.id AS reservation_id, r.codigo_reserva, r.estado AS reservation_status,
         r.customer_id, r.room_id, r.habitacion, r.fecha_entrada, r.fecha_salida,
         r.total_reserva_cents, r.room_price_cents, r.nights, r.lodging_total_cents,
         r.check_in_at AS reservation_check_in_at, r.check_out_at AS reservation_check_out_at,
         rm.category AS room_category,
         s.id AS stay_id, s.check_in_at AS stay_check_in_at, s.check_out_at AS stay_check_out_at,
         s.estado AS stay_status,
         c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
         c.documento AS customer_document,
         COALESCE((
           SELECT SUM(sc.subtotal_cents) FROM service_consumptions sc
           WHERE sc.stay_id = s.id AND sc.estado IN ('Entregado', 'Consumido')
         ), 0) AS services_cents,
         COALESCE((
           SELECT SUM(sc.subtotal_cents) FROM service_consumptions sc
           WHERE sc.stay_id = s.id AND sc.estado IN ('Registrado', 'EnProceso')
         ), 0) AS pending_services_cents,
         COALESCE((
           SELECT SUM(CASE WHEN p.kind = 'REVERSAL' THEN -pa.amount_cents ELSE pa.amount_cents END)
           FROM payment_allocations pa
           JOIN payments p ON p.id = pa.payment_id
           WHERE pa.reservation_id = r.id
         ), 0) AS paid_cents,
         (SELECT COUNT(*) FROM service_consumptions sc
          WHERE sc.stay_id = s.id AND sc.estado IN ('Entregado', 'Consumido')) AS billable_service_count,
         (SELECT COUNT(*) FROM service_consumptions sc
          WHERE sc.stay_id = s.id AND sc.estado IN ('Registrado', 'EnProceso')) AS pending_service_count
  FROM reservations r
  JOIN customers c ON c.id = r.customer_id
  JOIN rooms rm ON rm.id = r.room_id
  LEFT JOIN stays s ON s.reservation_id = r.id`;

function mapPayment(row: Record<string, unknown>): StayPaymentModel {
  return {
    id: Number(row.id),
    paymentNumber: String(row.payment_number),
    amount: centsToMoney(Number(row.amount_cents)),
    paymentMethod: row.payment_method as PaymentMethod,
    reference: row.reference ? String(row.reference) : undefined,
    kind: row.kind as PaymentKind,
    status: row.status as PaymentStatus,
    paymentDate: String(row.payment_date),
    invoiceId: row.invoice_id ? Number(row.invoice_id) : undefined,
    receivedByName: String(row.received_by_name),
  };
}

function mapInvoice(row: Record<string, unknown>): ReservationAccountInvoiceModel {
  return {
    id: Number(row.id),
    invoiceNumber: String(row.invoice_number),
    status: row.status as InvoiceStatus,
    total: centsToMoney(Number(row.total_cents)),
    paidAmount: centsToMoney(Number(row.paid_amount_cents)),
    balance: centsToMoney(Number(row.balance_cents)),
  };
}

function calculateNightsFallback(fechaEntrada: string, fechaSalida: string): number {
  const start = Date.parse(`${fechaEntrada}T00:00:00.000Z`);
  const end = Date.parse(`${fechaSalida}T00:00:00.000Z`);
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function mapAccount(row: Record<string, unknown>): ReservationAccountModel {
  const stayId = row.stay_id === null || row.stay_id === undefined ? undefined : Number(row.stay_id);
  const fechaEntrada = String(row.fecha_entrada);
  const fechaSalida = String(row.fecha_salida);
  const nights = row.nights === null || row.nights === undefined
    ? calculateNightsFallback(fechaEntrada, fechaSalida)
    : Math.max(1, Number(row.nights));
  const lodgingCents = Number(row.lodging_total_cents ?? row.total_reserva_cents);
  const roomPriceCents = Number(row.room_price_cents ?? Math.round(lodgingCents / nights));
  const servicesCents = Number(row.services_cents || 0);
  const paidCents = Number(row.paid_cents || 0);
  const totalCents = lodgingCents + servicesCents;
  const stayStatus = row.stay_status ? (row.stay_status as StayStatus) : undefined;

  return {
    stayId,
    reservationId: Number(row.reservation_id),
    reservationCode: String(row.codigo_reserva),
    reservationStatus: row.reservation_status as ReservationStatus,
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name),
    customerDocument: String(row.customer_document),
    roomId: Number(row.room_id),
    habitacion: String(row.habitacion),
    roomCategory: row.room_category ? String(row.room_category) : undefined,
    fechaEntrada,
    fechaSalida,
    nights,
    roomPricePerNight: centsToMoney(roomPriceCents),
    checkInAt: row.stay_check_in_at
      ? String(row.stay_check_in_at)
      : row.reservation_check_in_at
        ? String(row.reservation_check_in_at)
        : undefined,
    checkOutAt: row.stay_check_out_at
      ? String(row.stay_check_out_at)
      : row.reservation_check_out_at
        ? String(row.reservation_check_out_at)
        : undefined,
    status: stayStatus ?? (row.reservation_status as ReservationStatus),
    lodging: centsToMoney(lodgingCents),
    services: centsToMoney(servicesCents),
    pendingServicesAmount: centsToMoney(Number(row.pending_services_cents || 0)),
    total: centsToMoney(totalCents),
    paid: centsToMoney(paidCents),
    balance: centsToMoney(Math.max(totalCents - paidCents, 0)),
    billableServiceCount: Number(row.billable_service_count || 0),
    pendingServiceCount: Number(row.pending_service_count || 0),
    consumptions: [],
    payments: [],
  };
}

export class ReservationAccountRepository {
  public constructor(
    private readonly serviceRepository: ServiceRepository = new ServiceRepository()
  ) {}

  public async findByReservationId(reservationId: number): Promise<ReservationAccountModel | null> {
    const result = await dbClient.execute({
      sql: `${accountSelect} WHERE r.id = ? LIMIT 1;`,
      args: [reservationId],
    });
    if (!result.rows[0]) return null;

    const account = mapAccount(result.rows[0] as Record<string, unknown>);
    const [payments, invoice, consumptions] = await Promise.all([
      this.findPayments(reservationId),
      this.findLatestInvoice(reservationId),
      account.stayId ? this.serviceRepository.getByStay(account.stayId) : Promise.resolve([]),
    ]);

    account.payments = payments;
    account.consumptions = consumptions;
    account.invoice = invoice ?? undefined;
    return account;
  }

  private async findPayments(reservationId: number): Promise<StayPaymentModel[]> {
    const result = await dbClient.execute({
      sql: `SELECT p.*, u.full_name AS received_by_name
            FROM payments p
            JOIN users u ON u.id = p.received_by
            WHERE p.reservation_id = ?
            ORDER BY p.payment_date DESC, p.id DESC;`,
      args: [reservationId],
    });
    return result.rows.map((row) => mapPayment(row as Record<string, unknown>));
  }

  private async findLatestInvoice(reservationId: number): Promise<ReservationAccountInvoiceModel | null> {
    const result = await dbClient.execute({
      sql: `SELECT id, invoice_number, status, total_cents, paid_amount_cents, balance_cents
            FROM invoices
            WHERE reservation_id = ?
            ORDER BY CASE WHEN status = 'Anulada' THEN 1 ELSE 0 END, id DESC
            LIMIT 1;`,
      args: [reservationId],
    });
    return result.rows[0] ? mapInvoice(result.rows[0] as Record<string, unknown>) : null;
  }
}
