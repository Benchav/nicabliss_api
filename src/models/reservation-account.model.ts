import type { InvoiceStatus } from "./invoice.model.js";
import type { ReservationStatus } from "./reservation.model.js";
import type { ServiceConsumptionModel } from "./service.model.js";
import type { StayPaymentModel } from "./stay-account.model.js";
import type { StayStatus } from "./stay.model.js";

export interface ReservationAccountInvoiceModel {
  id: number;
  invoiceNumber: string;
  status: InvoiceStatus;
  total: number;
  paidAmount: number;
  balance: number;
}

/**
 * Cuenta operativa de una reserva. Funciona antes del check-in (solo hospedaje
 * y anticipos) y después del check-in (hospedaje + consumos + pagos).
 * Mantiene la misma forma contable que StayAccountModel para no romper clientes.
 */
export interface ReservationAccountModel {
  stayId?: number;
  reservationId: number;
  reservationCode: string;
  reservationStatus: ReservationStatus;
  customerId: number;
  customerName: string;
  customerDocument: string;
  roomId: number;
  habitacion: string;
  roomCategory?: string;
  fechaEntrada: string;
  fechaSalida: string;
  nights: number;
  roomPricePerNight: number;
  checkInAt?: string;
  checkOutAt?: string;
  status: StayStatus | ReservationStatus;
  lodging: number;
  services: number;
  pendingServicesAmount: number;
  total: number;
  paid: number;
  balance: number;
  billableServiceCount: number;
  pendingServiceCount: number;
  consumptions: ServiceConsumptionModel[];
  payments: StayPaymentModel[];
  invoice?: ReservationAccountInvoiceModel;
}
