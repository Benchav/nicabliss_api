import { EstadoPedido } from "../models/food-order.model.js";

export interface CreateFoodOrderDto {
  stayId?: number;
  huesped?: string;
  habitacion?: string;
  productos: string;
  total: number;
}

export interface UpdateFoodOrderDto {
  huesped?: string;
  habitacion?: string;
  productos?: string;
  total?: number;
  estado?: EstadoPedido;
}

export interface UpdateOrderStatusDto {
  estado: EstadoPedido;
}
