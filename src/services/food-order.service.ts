import { FoodOrderRepository } from "../repositories/food-order.repository.js";
import { CreateFoodOrderDto, UpdateFoodOrderDto, UpdateOrderStatusDto } from "../dtos/food-order.dto.js";
import { FoodOrderModel } from "../models/food-order.model.js";

export class FoodOrderService {
  constructor(private orderRepo: FoodOrderRepository) {}

  public async getAll(search?: string): Promise<FoodOrderModel[]> {
    return this.orderRepo.findAll(search);
  }

  public async getById(id: number): Promise<FoodOrderModel> {
    const order = await this.orderRepo.findById(id);
    if (!order) throw { statusCode: 404, code: "NOT_FOUND", message: "Pedido de alimentos no encontrado" };
    return order;
  }

  public async create(dto: CreateFoodOrderDto): Promise<FoodOrderModel> {
    if (!dto.huesped?.trim() || !dto.habitacion?.trim() || !dto.productos?.trim()) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Huésped, habitación y productos son obligatorios" };
    }

    const newOrder: FoodOrderModel = {
      id: Date.now(),
      orderCode: "#PED-" + Math.floor(100 + Math.random() * 900),
      huesped: dto.huesped.trim(),
      habitacion: dto.habitacion.trim(),
      productos: dto.productos.trim(),
      total: Number(dto.total) || 0,
      estado: "Pendiente",
      fecha: new Date().toLocaleDateString("es-NI"),
    };

    await this.orderRepo.save(newOrder);
    return newOrder;
  }

  public async update(id: number, dto: UpdateFoodOrderDto): Promise<FoodOrderModel> {
    const order = await this.getById(id);

    if (dto.huesped !== undefined) order.huesped = dto.huesped.trim();
    if (dto.habitacion !== undefined) order.habitacion = dto.habitacion.trim();
    if (dto.productos !== undefined) order.productos = dto.productos.trim();
    if (dto.total !== undefined) {
      const newTotal = Number(dto.total);
      if (newTotal < 0) {
        throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El total del pedido no puede ser negativo" };
      }
      order.total = newTotal;
    }
    if (dto.estado !== undefined) order.estado = dto.estado;

    await this.orderRepo.save(order);
    return order;
  }

  public async updateStatus(id: number, dto: UpdateOrderStatusDto): Promise<FoodOrderModel> {
    const order = await this.getById(id);
    order.estado = dto.estado;
    await this.orderRepo.save(order);
    return order;
  }

  public async delete(id: number): Promise<void> {
    await this.getById(id);
    const deleted = await this.orderRepo.delete(id);
    if (!deleted) {
      throw { statusCode: 500, code: "INTERNAL_ERROR", message: "No se pudo eliminar el pedido de alimentos" };
    }
  }
}
