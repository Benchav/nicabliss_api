export type EstadoLavanderia = "Pendiente" | "En proceso" | "Listo" | "Entregado" | "Cancelado";

export interface PrendaItem {
  tipo: string;
  cantidad: number;
}

export interface LaundryModel {
  id: number;
  huesped: string;
  habitacion: string;
  prendas: PrendaItem[];
  totalPrendas: number;
  total: number;
  estado: EstadoLavanderia;
  fecha: string;
  observaciones: string;
  customerId?: number;
  stayId?: number;
  serviceConsumptionId?: number;
  createdBy?: string;
}
