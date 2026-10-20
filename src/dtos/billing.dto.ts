export interface CreateBillingAccountDto {
  huesped: string;
  habitacion: string;
  concepto: string;
  total: number;
}

export interface RecordPaymentDto {
  monto: number;
}
