export type PaymentMethod = "Efectivo" | "Tarjeta" | "Transferencia";
export type PaymentKind = "PAYMENT" | "REVERSAL";
export type PaymentStatus = "POSTED" | "REVERSED";

export interface PaymentModel {
  id: number;
  paymentNumber: string;
  customerId: number;
  reservationId?: number;
  invoiceId?: number;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  kind: PaymentKind;
  status: PaymentStatus;
  reversesPaymentId?: number;
  paymentDate: string;
  receivedBy: string;
  receivedByName: string;
  cashSessionId: number;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  createdAt: string;
}
