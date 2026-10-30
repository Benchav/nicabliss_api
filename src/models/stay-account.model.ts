import type { PaymentKind, PaymentMethod, PaymentStatus } from "./payment.model.js";
import type { ReservationStatus } from "./reservation.model.js";
import type { StayStatus } from "./stay.model.js";

export interface StayPaymentModel {
  id: number;
  paymentNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  kind: PaymentKind;
  status: PaymentStatus;
  paymentDate: string;
  invoiceId?: number;
  receivedByName: string;
}

export interface StayAccountModel {
  stayId: number;
  reservationId: number;
  reservationCode: string;
  reservationStatus: ReservationStatus;
  customerId: number;
  customerName: string;
  customerDocument: string;
  roomId: number;
  habitacion: string;
  checkInAt: string;
  checkOutAt?: string;
  status: StayStatus;
  lodging: number;
  services: number;
  pendingServicesAmount: number;
  total: number;
  paid: number;
  balance: number;
  billableServiceCount: number;
  pendingServiceCount: number;
  payments: StayPaymentModel[];
}
