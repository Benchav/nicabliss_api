import {
  CreateReservationDto,
  UpdateReservationDto,
} from "../dtos/reservation.dto.js";
import { CustomerModel } from "../models/customer.model.js";
import { DepositType, ReservationModel, ReservationStatus } from "../models/reservation.model.js";
import { CustomerRepository, normalizeDocument } from "../repositories/customer.repository.js";
import { ReservationRepository } from "../repositories/reservation.repository.js";
import { RoomRepository } from "../repositories/room.repository.js";
import { assertIsoDate } from "../utils/date.js";
import { parseMoneyToCents } from "../utils/money.js";

const statusTransitions: Record<ReservationStatus, readonly ReservationStatus[]> = {
  Pendiente: ["Confirmada", "Cancelada", "NoShow"],
  Confirmada: ["Cancelada", "NoShow"],
  Cancelada: [],
  CheckIn: [],
  Finalizada: [],
  NoShow: [],
};

function calculateDeposit(
  totalCents: number,
  type: DepositType,
  value: number | string
): { storedValue: number; requiredCents: number } {
  if (type === "PERCENTAGE") {
    const percentage = Number(value);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El porcentaje de anticipo debe estar entre 0 y 100" };
    }
    const basisPoints = Math.round(percentage * 100);
    return { storedValue: basisPoints, requiredCents: Math.round(totalCents * basisPoints / 10000) };
  }
  const requiredCents = parseMoneyToCents(value, "depositValue");
  if (requiredCents > totalCents) {
    throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El anticipo requerido no puede superar el total" };
  }
  return { storedValue: requiredCents, requiredCents };
}

export function calculateNights(fechaEntrada: string, fechaSalida: string): number {
  const start = Date.parse(`${fechaEntrada}T00:00:00.000Z`);
  const end = Date.parse(`${fechaSalida}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export class ReservationService {
  public constructor(
    private readonly reservationRepository: ReservationRepository,
    private readonly customerRepository: CustomerRepository = new CustomerRepository(),
    private readonly roomRepository: RoomRepository = new RoomRepository()
  ) {}

  public async getAll(search?: string, status?: ReservationStatus): Promise<ReservationModel[]> {
    return this.reservationRepository.findAll(search, status);
  }

  public async getById(id: number): Promise<ReservationModel> {
    const reservation = await this.reservationRepository.findById(id);
    if (!reservation) throw { statusCode: 404, code: "NOT_FOUND", message: "Reserva no encontrada" };
    return reservation;
  }

  public async getRooms(from?: string, to?: string) {
    if ((from && !to) || (!from && to)) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "Debe proporcionar ambas fechas" };
    }
    if (from && to) {
      assertIsoDate(from, "from");
      assertIsoDate(to, "to");
      if (to <= from) throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La salida debe ser posterior a la entrada" };
    }
    return this.roomRepository.getAvailability(from, to);
  }

  public async create(
    dto: CreateReservationDto,
    userId: string,
    ipAddress?: string
  ): Promise<ReservationModel> {
    assertIsoDate(dto.fechaEntrada, "fechaEntrada");
    assertIsoDate(dto.fechaSalida, "fechaSalida");
    if (dto.fechaSalida <= dto.fechaEntrada) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La salida debe ser posterior a la entrada" };
    }
    const nights = calculateNights(dto.fechaEntrada, dto.fechaSalida);
    if (nights < 1) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La reserva debe cubrir al menos una noche" };
    }

    const room = await this.roomRepository.findById(Number(dto.roomId));
    if (!room || !room.active) {
      throw { statusCode: 404, code: "NOT_FOUND", message: "Habitación no encontrada o inactiva" };
    }
    const pricing = this.resolvePricing(dto.totalReserva, room.pricePerNight, nights);
    const customerId = await this.resolveCustomer(dto, userId, ipAddress);
    const depositType = dto.depositType || "PERCENTAGE";
    const deposit = calculateDeposit(pricing.lodgingCents, depositType, dto.depositValue ?? 50);

    return this.reservationRepository.create({
      customerId,
      roomId: room.id,
      fechaEntrada: dto.fechaEntrada,
      fechaSalida: dto.fechaSalida,
      totalCents: pricing.lodgingCents,
      roomPriceCents: pricing.roomPriceCents,
      nights,
      lodgingTotalCents: pricing.lodgingCents,
      depositType,
      depositValue: deposit.storedValue,
      depositRequiredCents: deposit.requiredCents,
      observaciones: dto.observaciones?.trim() || undefined,
      createdBy: userId,
      now: new Date().toISOString(),
    });
  }

  public async update(id: number, dto: UpdateReservationDto, userId: string): Promise<ReservationModel> {
    const current = await this.getById(id);
    const fechaEntrada = dto.fechaEntrada ?? current.fechaEntrada;
    const fechaSalida = dto.fechaSalida ?? current.fechaSalida;
    assertIsoDate(fechaEntrada, "fechaEntrada");
    assertIsoDate(fechaSalida, "fechaSalida");
    if (fechaSalida <= fechaEntrada) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La salida debe ser posterior a la entrada" };
    }
    const nights = calculateNights(fechaEntrada, fechaSalida);
    const roomId = dto.roomId ?? current.roomId;
    const room = await this.roomRepository.findById(roomId);
    if (!room || !room.active) {
      throw { statusCode: 404, code: "NOT_FOUND", message: "Habitación no encontrada o inactiva" };
    }

    const pricing = this.resolvePricing(
      dto.totalReserva,
      dto.roomId !== undefined || dto.fechaEntrada !== undefined || dto.fechaSalida !== undefined
        ? (room.pricePerNight > 0 ? room.pricePerNight : current.roomPricePerNight)
        : current.roomPricePerNight,
      nights
    );
    if (pricing.lodgingCents < Math.round(current.abonado * 100)) {
      throw { statusCode: 400, code: "TOTAL_BELOW_PAID", message: "El total no puede ser inferior a lo abonado" };
    }
    const deposit = calculateDeposit(pricing.lodgingCents, current.depositType, current.depositValue);
    return this.reservationRepository.update({
      id,
      roomId,
      fechaEntrada,
      fechaSalida,
      totalCents: pricing.lodgingCents,
      roomPriceCents: pricing.roomPriceCents,
      nights,
      lodgingTotalCents: pricing.lodgingCents,
      depositRequiredCents: deposit.requiredCents,
      observaciones: dto.observaciones !== undefined ? dto.observaciones.trim() || undefined : current.observaciones,
      updatedBy: userId,
      now: new Date().toISOString(),
    });
  }

  public async updateStatus(id: number, next: ReservationStatus, userId: string): Promise<ReservationModel> {
    const current = await this.getById(id);
    if (current.estado === next) return current;
    if (!statusTransitions[current.estado].includes(next)) {
      throw {
        statusCode: 409,
        code: "INVALID_STATUS_TRANSITION",
        message: `No se puede cambiar una reserva de ${current.estado} a ${next}`,
      };
    }
    if (next === "Confirmada" && current.abonado < current.depositoRequerido) {
      throw { statusCode: 409, code: "DEPOSIT_REQUIRED", message: "La reserva aún no cumple el anticipo requerido" };
    }
    return this.reservationRepository.updateStatus(id, next, userId);
  }

  /**
   * Resuelve el cliente de la reserva. Si llega `customerId` se usa el existente;
   * si llega el objeto `customer` se busca por documento y, de no existir, se registra.
   */
  private async resolveCustomer(
    dto: CreateReservationDto,
    userId: string,
    ipAddress?: string
  ): Promise<number> {
    if (dto.customerId) {
      const existing = await this.customerRepository.findById(Number(dto.customerId));
      if (!existing) throw { statusCode: 404, code: "NOT_FOUND", message: "Cliente no encontrado" };
      return existing.id;
    }
    const input = dto.customer;
    if (!input?.nombre?.trim() || !input?.documento?.trim()) {
      throw {
        statusCode: 400,
        code: "CUSTOMER_REQUIRED",
        message: "Debe seleccionar un cliente o registrar los datos del nuevo huésped",
      };
    }
    const document = input.documento.trim();
    const found = await this.customerRepository.findByNormalizedDocument(document);
    if (found) return found.id;

    const now = new Date().toISOString();
    const record: Omit<CustomerModel, "id"> = {
      nombre: input.nombre.trim(),
      apellido: input.apellido?.trim() || undefined,
      documento: document,
      telefono: input.telefono?.trim() || undefined,
      correo: input.correo?.trim().toLowerCase() || undefined,
      direccion: input.direccion?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const created = await this.customerRepository.create(record);
      return created.id;
    } catch (error) {
      // Concurrencia: otro request pudo registrar el mismo documento.
      const raced = await this.customerRepository.findByNormalizedDocument(document);
      if (raced) return raced.id;
      if (normalizeDocument(document) === "") {
        throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El documento no es válido" };
      }
      void userId;
      void ipAddress;
      throw error;
    }
  }

  private resolvePricing(
    totalReserva: number | string | undefined,
    roomPrice: number,
    nights: number
  ): { lodgingCents: number; roomPriceCents: number } {
    if (totalReserva !== undefined && totalReserva !== "") {
      const lodgingCents = parseMoneyToCents(totalReserva, "totalReserva");
      if (lodgingCents <= 0) {
        throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El total de la reserva debe ser mayor que cero" };
      }
      return { lodgingCents, roomPriceCents: Math.max(0, Math.round(lodgingCents / Math.max(nights, 1))) };
    }
    const roomPriceCents = parseMoneyToCents(roomPrice, "pricePerNight");
    if (roomPriceCents <= 0) {
      throw {
        statusCode: 400,
        code: "ROOM_PRICE_REQUIRED",
        message: "La habitación no tiene precio configurado. Configúralo en el panel de habitaciones",
      };
    }
    return { lodgingCents: roomPriceCents * nights, roomPriceCents };
  }
}
