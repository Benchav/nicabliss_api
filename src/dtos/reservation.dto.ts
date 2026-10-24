import { DepositType, ReservationStatus } from "../models/reservation.model.js";

export interface CreateReservationDto {
  customerId: number;
  roomId: number;
  fechaEntrada: string;
  fechaSalida: string;
  totalReserva: number | string;
  depositType?: DepositType;
  depositValue?: number | string;
  observaciones?: string;
}

export interface UpdateReservationDto {
  roomId?: number;
  fechaEntrada?: string;
  fechaSalida?: string;
  totalReserva?: number | string;
  observaciones?: string;
}

export interface UpdateReservationStatusDto {
  estado: ReservationStatus;
}
