import { dbClient } from "../db/client.js";
import { PaymentKind, PaymentMethod, PaymentStatus } from "../models/payment.model.js";
import { StayAccountModel, StayPaymentModel } from "../models/stay-account.model.js";
import { ReservationStatus } from "../models/reservation.model.js";
import { StayStatus } from "../models/stay.model.js";
import { centsToMoney } from "../utils/money.js";

const accountSelect = `
  SELECT s.id AS stay_id, s.reservation_id, r.codigo_reserva, r.estado AS reservation_status,
         s.customer_id, s.room_id, s.habitacion, s.check_in_at, s.check_out_at, s.estado AS stay_status,
         c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
         c.documento AS customer_document, r.total_reserva_cents,
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
           WHERE pa.reservation_id = s.reservation_id
         ), 0) AS paid_cents,
         (SELECT COUNT(*) FROM service_consumptions sc
          WHERE sc.stay_id = s.id AND sc.estado IN ('Entregado', 'Consumido')) AS billable_service_count,
         (SELECT COUNT(*) FROM service_consumptions sc
          WHERE sc.stay_id = s.id AND sc.estado IN ('Registrado', 'EnProceso')) AS pending_service_count
  FROM stays s
  JOIN reservations r ON r.id = s.reservation_id
  JOIN customers c ON c.id = s.customer_id`;

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

function mapAccount(row: Record<string, unknown>): StayAccountModel {
  const lodgingCents = Number(row.total_reserva_cents);
  const servicesCents = Number(row.services_cents || 0);
  const paidCents = Number(row.paid_cents || 0);
  const totalCents = lodgingCents + servicesCents;

  return {
    stayId: Number(row.stay_id),
    reservationId: Number(row.reservation_id),
    reservationCode: String(row.codigo_reserva),
    reservationStatus: row.reservation_status as ReservationStatus,
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name),
    customerDocument: String(row.customer_document),
    roomId: Number(row.room_id),
    habitacion: String(row.habitacion),
    checkInAt: String(row.check_in_at),
    checkOutAt: row.check_out_at ? String(row.check_out_at) : undefined,
    status: row.stay_status as StayStatus,
    lodging: centsToMoney(lodgingCents),
    services: centsToMoney(servicesCents),
    pendingServicesAmount: centsToMoney(Number(row.pending_services_cents || 0)),
    total: centsToMoney(totalCents),
    paid: centsToMoney(paidCents),
    balance: centsToMoney(Math.max(totalCents - paidCents, 0)),
    billableServiceCount: Number(row.billable_service_count || 0),
    pendingServiceCount: Number(row.pending_service_count || 0),
    payments: [],
  };
}

export class StayAccountRepository {
  public async findByStayId(stayId: number): Promise<StayAccountModel | null> {
    const result = await dbClient.execute({
      sql: `${accountSelect} WHERE s.id = ? LIMIT 1;`,
      args: [stayId],
    });
    if (!result.rows[0]) return null;
    const account = mapAccount(result.rows[0] as Record<string, unknown>);
    const payments = await this.findPayments("reservation_id", account.reservationId);
    account.payments = payments.get(account.reservationId) ?? [];
    return account;
  }

  public async findByCustomerId(customerId: number): Promise<StayAccountModel[]> {
    const result = await dbClient.execute({
      sql: `${accountSelect}
            WHERE s.customer_id = ?
            ORDER BY CASE WHEN s.estado = 'Activa' THEN 0 ELSE 1 END, s.check_in_at DESC, s.id DESC;`,
      args: [customerId],
    });
    const accounts = result.rows.map((row) => mapAccount(row as Record<string, unknown>));
    const payments = await this.findPayments("customer_id", customerId);
    for (const account of accounts) {
      account.payments = payments.get(account.reservationId) ?? [];
    }
    return accounts;
  }

  private async findPayments(
    field: "reservation_id" | "customer_id",
    value: number
  ): Promise<Map<number, StayPaymentModel[]>> {
    const result = await dbClient.execute({
      sql: `SELECT p.*, u.full_name AS received_by_name
            FROM payments p
            JOIN users u ON u.id = p.received_by
            WHERE p.${field} = ?
            ORDER BY p.payment_date DESC, p.id DESC;`,
      args: [value],
    });
    const grouped = new Map<number, StayPaymentModel[]>();
    for (const row of result.rows) {
      const reservationId = Number(row.reservation_id);
      const list = grouped.get(reservationId) ?? [];
      list.push(mapPayment(row as Record<string, unknown>));
      grouped.set(reservationId, list);
    }
    return grouped;
  }
}
