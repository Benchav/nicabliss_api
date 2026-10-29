export type MetodoPago = "Efectivo" | "Transferencia" | "Tarjeta";
export type TipoMovimiento = "Ingreso" | "Salida";
export type ConceptoMovimiento =
  | "Hospedaje"
  | "Alimentos"
  | "Lavandería"
  | "Otro ingreso"
  | "Gasto operativo"
  | "Retiro de efectivo";

export interface CashMovementModel {
  id: number;
  fecha: string;
  tipo: TipoMovimiento;
  concepto: ConceptoMovimiento;
  descripcion: string;
  metodo: MetodoPago;
  monto: number;
  paymentId?: number;
  customerId?: number;
  reservationId?: number;
  invoiceId?: number;
  createdBy?: string;
  createdByName?: string;
  source?: "MANUAL" | "PAYMENT" | "REVERSAL" | "MIGRATION";
}

export interface CashSessionModel {
  id: number;
  responsable: string;
  openedBy?: string;
  openedByName?: string;
  closedBy?: string;
  closedByName?: string;
  apertura: string;
  cierre?: string;
  fondoInicial: number;
  ingresosEfectivo: number;
  ingresosDigitales: number;
  salidasEfectivo: number;
  efectivoEsperado: number;
  efectivoContado?: number;
  diferencia?: number;
  observaciones: string;
  isClosed: boolean;
  movimientos: CashMovementModel[];
}
