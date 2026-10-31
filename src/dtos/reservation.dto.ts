import { DepositType } from "../models/reservation.model.js";

export interface ReservationCustomerDto {
  nombre: string;
  apellido?: string;
  documento: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
}

export interface CreateReservationDto {
  customerId?: number;
  customer?: ReservationCustomerDto;
  roomId: number;
  fechaEntrada: string;
  fechaSalida: string;
  totalReserva?: number | string;
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
