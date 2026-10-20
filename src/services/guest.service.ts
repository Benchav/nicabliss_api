import { GuestRepository } from "../repositories/guest.repository.js";
import { CreateGuestDto, UpdateGuestStatusDto } from "../dtos/guest.dto.js";
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

  public async updateStatus(id: number, dto: UpdateGuestStatusDto): Promise<GuestModel> {
    const guest = await this.getById(id);
    guest.estado = dto.estado;
    await this.guestRepo.save(guest);
    return guest;
  }
}
