import { EstadoPedido } from "../models/food-order.model.js";

export interface CreateFoodOrderDto {
  huesped: string;
  habitacion: string;
  productos: string;
  total: number;
}

export interface UpdateOrderStatusDto {
  estado: EstadoPedido;
}
