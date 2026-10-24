export type EstadoPedido = "Pendiente" | "En preparación" | "En camino" | "Entregado" | "Cancelado";

export interface FoodOrderModel {
  id: number;
  orderCode: string;
  huesped: string;
  habitacion: string;
  productos: string;
  total: number;
  estado: EstadoPedido;
  fecha: string;
  customerId?: number;
  stayId?: number;
  serviceConsumptionId?: number;
  createdBy?: string;
}
