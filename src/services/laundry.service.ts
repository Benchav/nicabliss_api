import { LaundryRepository } from "../repositories/laundry.repository.js";
import { CreateLaundryOrderDto, UpdateLaundryOrderDto, UpdateLaundryStatusDto } from "../dtos/laundry.dto.js";
import { LaundryModel } from "../models/laundry.model.js";
import { StayRepository } from "../repositories/stay.repository.js";

export class LaundryService {
  private static readonly PRECIO_POR_PRENDA = 0.5;

  constructor(
    private laundryRepo: LaundryRepository,
    private stayRepo: StayRepository = new StayRepository()
  ) {}

  public async getAll(search?: string): Promise<LaundryModel[]> {
    return this.laundryRepo.findAll(search);
  }

  public async getById(id: number): Promise<LaundryModel> {
    const order = await this.laundryRepo.findById(id);
    if (!order) throw { statusCode: 404, code: "NOT_FOUND", message: "Solicitud de lavandería no encontrada" };
    return order;
  }

  public async create(dto: CreateLaundryOrderDto, userId?: string): Promise<LaundryModel> {
    const stay = dto.stayId ? await this.stayRepo.findById(Number(dto.stayId)) : null;
    if (dto.stayId && (!stay || stay.estado !== "Activa")) {
      throw { statusCode: 409, code: "STAY_NOT_ACTIVE", message: "Debe seleccionar una estancia activa" };
    }
    if (!stay && (!dto.huesped?.trim() || !dto.habitacion?.trim())) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Huésped y habitación son obligatorios" };
    }
    if (!dto.prendas || dto.prendas.length === 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Debe incluir al menos una prenda" };
    }

    const totalPrendas = dto.prendas.reduce((sum, p) => sum + (Number(p.cantidad) || 0), 0);
    const total = Number((totalPrendas * LaundryService.PRECIO_POR_PRENDA).toFixed(2));

    const newOrder: LaundryModel = {
      id: Date.now(),
      huesped: stay?.customerName || dto.huesped!.trim(),
      habitacion: stay?.habitacion || dto.habitacion!.trim(),
      prendas: dto.prendas,
      totalPrendas,
      total,
      estado: "Pendiente",
      fecha: new Date().toISOString(),
      observaciones: dto.observaciones?.trim() || "Sin observaciones especiales",
      customerId: stay?.customerId,
      stayId: stay?.id,
      createdBy: stay ? userId : undefined,
    };

    if (stay && !userId) throw { statusCode: 401, code: "UNAUTHORIZED", message: "Usuario no autenticado" };
    await this.laundryRepo.saveWithConsumption(newOrder);
    return newOrder;
  }

  public async update(id: number, dto: UpdateLaundryOrderDto): Promise<LaundryModel> {
    const order = await this.getById(id);

    if (dto.prendas !== undefined) {
      if (dto.prendas.length === 0) {
        throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Debe incluir al menos una prenda" };
      }
      const totalPrendas = dto.prendas.reduce((sum, p) => sum + (Number(p.cantidad) || 0), 0);
      order.prendas = dto.prendas;
      order.totalPrendas = totalPrendas;
      order.total = Number((totalPrendas * LaundryService.PRECIO_POR_PRENDA).toFixed(2));
    }

    if (dto.huesped !== undefined) order.huesped = dto.huesped.trim();
    if (dto.habitacion !== undefined) order.habitacion = dto.habitacion.trim();
    if (dto.observaciones !== undefined) order.observaciones = dto.observaciones.trim();
    if (dto.estado !== undefined) order.estado = dto.estado;

    await this.laundryRepo.save(order);
    return order;
  }

  public async updateStatus(id: number, dto: UpdateLaundryStatusDto): Promise<LaundryModel> {
    const order = await this.getById(id);
    order.estado = dto.estado;
    await this.laundryRepo.save(order);
    return order;
  }

  public async delete(id: number): Promise<void> {
    await this.getById(id);
    const deleted = await this.laundryRepo.delete(id);
    if (!deleted) {
      throw { statusCode: 500, code: "INTERNAL_ERROR", message: "No se pudo eliminar la orden de lavandería" };
    }
  }
}
