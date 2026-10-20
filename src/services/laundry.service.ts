import { LaundryRepository } from "../repositories/laundry.repository.js";
import { CreateLaundryOrderDto, UpdateLaundryStatusDto } from "../dtos/laundry.dto.js";
import { LaundryModel } from "../models/laundry.model.js";

export class LaundryService {
  private static readonly PRECIO_POR_PRENDA = 0.5;

  constructor(private laundryRepo: LaundryRepository) {}

  public async getAll(search?: string): Promise<LaundryModel[]> {
    return this.laundryRepo.findAll(search);
  }

  public async getById(id: number): Promise<LaundryModel> {
    const order = await this.laundryRepo.findById(id);
    if (!order) throw { statusCode: 404, code: "NOT_FOUND", message: "Solicitud de lavandería no encontrada" };
    return order;
  }

  public async create(dto: CreateLaundryOrderDto): Promise<LaundryModel> {
    if (!dto.huesped?.trim() || !dto.habitacion?.trim()) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Huésped y habitación son obligatorios" };
    }
    if (!dto.prendas || dto.prendas.length === 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Debe incluir al menos una prenda" };
    }

    const totalPrendas = dto.prendas.reduce((sum, p) => sum + (Number(p.cantidad) || 0), 0);
    const total = Number((totalPrendas * LaundryService.PRECIO_POR_PRENDA).toFixed(2));

    const newOrder: LaundryModel = {
      id: Date.now(),
      huesped: dto.huesped.trim(),
      habitacion: dto.habitacion.trim(),
      prendas: dto.prendas,
      totalPrendas,
      total,
      estado: "Pendiente",
      fecha: new Date().toLocaleDateString("es-NI"),
      observaciones: dto.observaciones?.trim() || "Sin observaciones especiales",
    };

    await this.laundryRepo.save(newOrder);
    return newOrder;
  }

  public async updateStatus(id: number, dto: UpdateLaundryStatusDto): Promise<LaundryModel> {
    const order = await this.getById(id);
    order.estado = dto.estado;
    await this.laundryRepo.save(order);
    return order;
  }
}
