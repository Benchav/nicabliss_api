import { CreateRoomDto, UpdateRoomDto } from "../dtos/room.dto.js";
import { RoomModel, RoomWithAvailabilityModel } from "../models/room.model.js";
import { RoomRepository } from "../repositories/room.repository.js";
import { parseMoneyToCents } from "../utils/money.js";

export class RoomService {
  public constructor(private readonly repository: RoomRepository) {}

  public async getAll(includeInactive = true): Promise<RoomWithAvailabilityModel[]> {
    return this.repository.findAll(includeInactive);
  }

  public async getById(id: number): Promise<RoomModel> {
    const room = await this.repository.findById(id);
    if (!room) throw { statusCode: 404, code: "NOT_FOUND", message: "Habitación no encontrada" };
    return room;
  }

  public async getAvailability(
    from?: string,
    to?: string,
    excludeReservationId?: number
  ): Promise<RoomWithAvailabilityModel[]> {
    return this.repository.getAvailability(from, to, excludeReservationId);
  }

  public async create(dto: CreateRoomDto, userId: string, ipAddress?: string): Promise<RoomModel> {
    const existing = await this.repository.findByCode(dto.code.trim());
    if (existing) {
      throw { statusCode: 409, code: "ROOM_CODE_EXISTS", message: `Ya existe una habitación con el código ${dto.code.trim()}` };
    }
    return this.repository.create(this.toRecord(dto), { userId, ipAddress });
  }

  public async update(id: number, dto: UpdateRoomDto, userId: string, ipAddress?: string): Promise<RoomModel> {
    const current = await this.getById(id);
    const code = dto.code?.trim() || current.code;
    if (code !== current.code) {
      const duplicate = await this.repository.findByCode(code);
      if (duplicate && duplicate.id !== id) {
        throw { statusCode: 409, code: "ROOM_CODE_EXISTS", message: `Ya existe una habitación con el código ${code}` };
      }
    }
    const merged: CreateRoomDto = {
      code,
      name: dto.name?.trim() || current.name,
      category: dto.category !== undefined ? dto.category.trim() || undefined : current.category,
      description: dto.description !== undefined ? dto.description.trim() || undefined : current.description,
      pricePerNight: dto.pricePerNight === undefined ? current.pricePerNight : dto.pricePerNight,
      active: dto.active ?? current.active,
    };
    return this.repository.update({ ...this.toRecord(merged), id }, { userId, ipAddress });
  }

  public async deactivate(id: number, userId: string, ipAddress?: string): Promise<RoomModel> {
    return this.repository.deactivate(id, { userId, ipAddress }, new Date().toISOString());
  }

  private toRecord(dto: CreateRoomDto) {
    const pricePerNightCents = parseMoneyToCents(dto.pricePerNight ?? 0, "pricePerNight");
    if (!Number.isSafeInteger(pricePerNightCents) || pricePerNightCents < 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El precio por noche debe ser un importe válido" };
    }
    return {
      code: dto.code.trim(),
      name: dto.name.trim(),
      category: dto.category?.trim() || undefined,
      description: dto.description?.trim() || undefined,
      pricePerNightCents,
      active: dto.active ?? true,
      now: new Date().toISOString(),
    };
  }
}
