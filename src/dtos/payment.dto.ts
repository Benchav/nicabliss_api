import { PaymentMethod } from "../models/payment.model.js";

export interface CreatePaymentDto {
  amount: number | string;
  paymentMethod: PaymentMethod;
  reference?: string;
}

export interface VoidPaymentDto {
  reason: string;
}
