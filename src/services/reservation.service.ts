import {
  CreateReservationDto,
  UpdateReservationDto,
} from "../dtos/reservation.dto.js";
import { DepositType, ReservationModel, ReservationStatus } from "../models/reservation.model.js";
import { ReservationRepository } from "../repositories/reservation.repository.js";
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

export class ReservationService {
  public constructor(private readonly reservationRepository: ReservationRepository) {}

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
    return this.reservationRepository.getRooms(from, to);
  }

  public async create(dto: CreateReservationDto, userId: string): Promise<ReservationModel> {
    assertIsoDate(dto.fechaEntrada, "fechaEntrada");
    assertIsoDate(dto.fechaSalida, "fechaSalida");
    if (dto.fechaSalida <= dto.fechaEntrada) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La salida debe ser posterior a la entrada" };
    }
    const totalCents = parseMoneyToCents(dto.totalReserva, "totalReserva");
    const depositType = dto.depositType || "PERCENTAGE";
    const deposit = calculateDeposit(totalCents, depositType, dto.depositValue ?? 50);
    return this.reservationRepository.create({
      customerId: Number(dto.customerId),
      roomId: Number(dto.roomId),
      fechaEntrada: dto.fechaEntrada,
      fechaSalida: dto.fechaSalida,
      totalCents,
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
    const totalCents = dto.totalReserva === undefined
      ? parseMoneyToCents(current.totalReserva, "totalReserva")
      : parseMoneyToCents(dto.totalReserva, "totalReserva");
    const deposit = calculateDeposit(totalCents, current.depositType, current.depositValue);
    return this.reservationRepository.update({
      id,
      roomId: dto.roomId ?? current.roomId,
      fechaEntrada,
      fechaSalida,
      totalCents,
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
}
