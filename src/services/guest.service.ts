import { GuestRepository } from "../repositories/guest.repository.js";
import { CreateGuestDto, UpdateGuestDto, UpdateGuestStatusDto } from "../dtos/guest.dto.js";
import { GuestModel } from "../models/guest.model.js";

export class GuestService {
  constructor(private guestRepo: GuestRepository) {}

  public async getAll(search?: string): Promise<GuestModel[]> {
    return this.guestRepo.findAll(search);
  }

  public async getById(id: number): Promise<GuestModel> {
    const guest = await this.guestRepo.findById(id);
    if (!guest) throw { statusCode: 404, code: "NOT_FOUND", message: `Huésped con id '${id}' no encontrado` };
    return guest;
  }

  public async create(dto: CreateGuestDto): Promise<GuestModel> {
    if (!dto.nombre?.trim() || !dto.documento?.trim() || !dto.habitacion?.trim()) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Nombre, documento y habitación son requeridos" };
    }
    if (dto.salida < dto.entrada) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La fecha de salida no puede ser anterior a la de entrada" };
    }

    const newGuest: GuestModel = {
      id: Date.now(),
      nombre: dto.nombre.trim(),
      documento: dto.documento.trim(),
      habitacion: dto.habitacion.trim(),
      entrada: dto.entrada,
      salida: dto.salida,
      estado: dto.estado || "Activo",
      createdAt: new Date().toISOString(),
    };

    await this.guestRepo.save(newGuest);
    return newGuest;
  }

  public async update(id: number, dto: UpdateGuestDto): Promise<GuestModel> {
    const guest = await this.getById(id);

    const entrada = dto.entrada ?? guest.entrada;
    const salida = dto.salida ?? guest.salida;

    if (salida < entrada) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La fecha de salida no puede ser anterior a la de entrada" };
    }

    if (dto.nombre !== undefined) guest.nombre = dto.nombre.trim();
    if (dto.documento !== undefined) guest.documento = dto.documento.trim();
    if (dto.habitacion !== undefined) guest.habitacion = dto.habitacion.trim();
    if (dto.entrada !== undefined) guest.entrada = dto.entrada;
    if (dto.salida !== undefined) guest.salida = dto.salida;
    if (dto.estado !== undefined) guest.estado = dto.estado;

    await this.guestRepo.save(guest);
    return guest;
  }

  public async updateStatus(id: number, dto: UpdateGuestStatusDto): Promise<GuestModel> {
    const guest = await this.getById(id);
    guest.estado = dto.estado;
    await this.guestRepo.save(guest);
    return guest;
  }

  public async delete(id: number): Promise<void> {
    await this.getById(id);
    const deleted = await this.guestRepo.delete(id);
    if (!deleted) {
      throw { statusCode: 500, code: "INTERNAL_ERROR", message: "No se pudo eliminar el huésped" };
    }
  }
}
