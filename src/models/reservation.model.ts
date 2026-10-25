export type ReservationStatus =
  | "Pendiente"
  | "Confirmada"
  | "Cancelada"
  | "CheckIn"
  | "Finalizada"
  | "NoShow";

export type DepositType = "PERCENTAGE" | "FIXED";

export interface RoomModel {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export interface ReservationModel {
  id: number;
  codigoReserva: string;
  customerId: number;
  customerName: string;
  customerDocument: string;
  roomId: number;
  habitacion: string;
  fechaEntrada: string;
  fechaSalida: string;
  totalReserva: number;
  depositType: DepositType;
  depositValue: number;
  depositoRequerido: number;
  abonado: number;
  saldo: number;
  estado: ReservationStatus;
  observaciones?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
