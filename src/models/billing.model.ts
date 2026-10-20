export type EstadoCobro = "Pagado" | "Pendiente" | "Parcial";

export interface BillingModel {
  id: number;
  huesped: string;
  habitacion: string;
  concepto: string;
  total: number;
  pagado: number;
  saldo: number;
  estado: EstadoCobro;
  fecha: string;
}
