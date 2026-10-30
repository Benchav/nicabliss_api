import { FoodOrderRepository } from "../repositories/food-order.repository.js";
import { CreateFoodOrderDto, UpdateFoodOrderDto, UpdateOrderStatusDto } from "../dtos/food-order.dto.js";
import { FoodOrderModel } from "../models/food-order.model.js";
import { ReservationModel } from "../models/reservation.model.js";
import { StayModel } from "../models/stay.model.js";
import { ReservationRepository } from "../repositories/reservation.repository.js";
import { StayRepository } from "../repositories/stay.repository.js";
import { parseMoneyToCents } from "../utils/money.js";
import { foodOrderTransitions } from "../utils/food-order-status.js";
import { randomUUID } from "crypto";

export class FoodOrderService {
  constructor(
    private orderRepo: FoodOrderRepository,
    private stayRepo: StayRepository = new StayRepository(),
    private reservationRepo: ReservationRepository = new ReservationRepository()
  ) {}

  public async getAll(search?: string): Promise<FoodOrderModel[]> {
    return this.orderRepo.findAll(search);
  }

  public async getById(id: number): Promise<FoodOrderModel> {
    const order = await this.orderRepo.findById(id);
    if (!order) throw { statusCode: 404, code: "NOT_FOUND", message: "Pedido de alimentos no encontrado" };
    return order;
  }

  public async create(dto: CreateFoodOrderDto, userId?: string): Promise<FoodOrderModel> {
    const stayId = dto.stayId ? Number(dto.stayId) : undefined;
    const reservationId = dto.reservationId ? Number(dto.reservationId) : undefined;
    if (stayId && reservationId) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Selecciona una estancia o una reserva, no ambas" };
    }
    if (!dto.productos?.trim()) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Los productos son obligatorios" };
    }
    const totalCents = parseMoneyToCents(dto.total, "total");
    if (totalCents <= 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El total del pedido debe ser mayor que cero" };
    }

    let stay: StayModel | null = null;
    let reservation: ReservationModel | null = null;

    if (stayId) {
      stay = await this.stayRepo.findById(stayId);
      if (!stay || stay.estado !== "Activa") {
        throw { statusCode: 409, code: "STAY_NOT_ACTIVE", message: "Debe seleccionar una estancia activa" };
      }
      if (!userId) throw { statusCode: 401, code: "UNAUTHORIZED", message: "Usuario no autenticado" };
    }

    if (reservationId) {
      reservation = await this.reservationRepo.findById(reservationId);
      if (!reservation) {
        throw { statusCode: 404, code: "NOT_FOUND", message: "Reserva no encontrada" };
      }
      if (!["Confirmada", "CheckIn"].includes(reservation.estado)) {
        throw {
          statusCode: 409,
          code: "RESERVATION_NOT_AVAILABLE",
          message: `La reserva está ${reservation.estado.toLowerCase()} y no admite pedidos`,
        };
      }
      stay = await this.stayRepo.findByReservationId(reservation.id);
      if (stay && stay.estado !== "Activa") {
        throw { statusCode: 409, code: "STAY_NOT_ACTIVE", message: "La reserva ya no tiene una estancia activa" };
      }
      if (reservation.estado === "CheckIn" && !stay) {
        throw { statusCode: 409, code: "STAY_NOT_ACTIVE", message: "La reserva no tiene una estancia activa" };
      }
      if (stay && !userId) throw { statusCode: 401, code: "UNAUTHORIZED", message: "Usuario no autenticado" };
    }

    if (!stay && !reservation && (!dto.huesped?.trim() || !dto.habitacion?.trim())) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Huésped y habitación son obligatorios" };
    }
    if (stay && await this.orderRepo.hasIssuedInvoiceForStay(stay.id)) {
      throw {
        statusCode: 409,
        code: "INVOICE_ISSUED",
        message: "La estancia tiene una factura emitida; anúlala o emite una nueva antes de agregar cargos",
      };
    }

    const newOrder: Omit<FoodOrderModel, "id"> = {
      orderCode: `#PED-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      huesped: stay?.customerName || reservation?.customerName || dto.huesped!.trim(),
      habitacion: stay?.habitacion || reservation?.habitacion || dto.habitacion!.trim(),
      productos: dto.productos.trim(),
      total: totalCents / 100,
      estado: "Pendiente",
      fecha: new Date().toISOString(),
      customerId: stay?.customerId ?? reservation?.customerId,
      reservationId: stay?.reservationId ?? reservation?.id,
      reservationCode: stay?.reservationCode ?? reservation?.codigoReserva,
      stayId: stay?.id,
      createdBy: userId,
    };

    return this.orderRepo.create(newOrder);
  }

  public async update(id: number, dto: UpdateFoodOrderDto): Promise<FoodOrderModel> {
    const order = await this.getById(id);
    await this.assertNotInvoiced(order);

    if (dto.estado !== undefined) {
      this.assertTransition(order.estado, dto.estado);
      order.estado = dto.estado;
    }
    if (dto.huesped !== undefined) order.huesped = dto.huesped.trim();
    if (dto.habitacion !== undefined) order.habitacion = dto.habitacion.trim();
    if (dto.productos !== undefined) order.productos = dto.productos.trim();
    if (dto.total !== undefined) {
      const totalCents = parseMoneyToCents(dto.total, "total");
      if (totalCents <= 0) {
        throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El total del pedido debe ser mayor que cero" };
      }
      order.total = totalCents / 100;
    }

    await this.orderRepo.save(order);
    return (await this.getById(id));
  }

  public async updateStatus(id: number, dto: UpdateOrderStatusDto): Promise<FoodOrderModel> {
    const order = await this.getById(id);
    await this.assertNotInvoiced(order);
    if (order.estado === dto.estado) return order;
    this.assertTransition(order.estado, dto.estado);
    order.estado = dto.estado;
    await this.orderRepo.save(order);
    return (await this.getById(id));
  }

  public async delete(id: number): Promise<void> {
    const order = await this.getById(id);
    await this.assertNotInvoiced(order);
    const deleted = await this.orderRepo.delete(id);
    if (!deleted) {
      throw { statusCode: 500, code: "INTERNAL_ERROR", message: "No se pudo eliminar el pedido de alimentos" };
    }
  }

  private async assertNotInvoiced(order: FoodOrderModel): Promise<void> {
    if (order.stayId && await this.orderRepo.hasIssuedInvoiceForStay(order.stayId)) {
      throw {
        statusCode: 409,
        code: "INVOICE_ISSUED",
        message: "El pedido ya fue incluido en una factura emitida y no puede modificarse",
      };
    }
  }

  private assertTransition(current: FoodOrderModel["estado"], next: FoodOrderModel["estado"]): void {
    if (current === next) return;
    if (!foodOrderTransitions[current].includes(next)) {
      throw {
        statusCode: 409,
        code: "INVALID_STATUS_TRANSITION",
        message: `No se puede cambiar un pedido de ${current} a ${next}`,
      };
    }
  }
}
