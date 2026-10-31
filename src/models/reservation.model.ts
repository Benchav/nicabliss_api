import type { RoomModel } from "./room.model.js";

export type ReservationStatus =
  | "Pendiente"
  | "Confirmada"
  | "Cancelada"
  | "CheckIn"
  | "Finalizada"
  | "NoShow";

export type DepositType = "PERCENTAGE" | "FIXED";

export type { RoomModel };

export interface ReservationModel {
  id: number;
  codigoReserva: string;
  customerId: number;
  customerName: string;
  customerDocument: string;
  roomId: number;
  habitacion: string;
  roomCategory?: string;
  fechaEntrada: string;
  fechaSalida: string;
  nights: number;
  roomPricePerNight: number;
  lodgingTotal: number;
  totalReserva: number;
  depositType: DepositType;
  depositValue: number;
  depositoRequerido: number;
  abonado: number;
  saldo: number;
  estado: ReservationStatus;
  checkInAt?: string;
  checkOutAt?: string;
  observaciones?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
