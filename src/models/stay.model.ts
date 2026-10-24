export type StayStatus = "Activa" | "Finalizada" | "Cancelada";

export interface StayModel {
  id: number;
  reservationId: number;
  reservationCode: string;
  customerId: number;
  customerName: string;
  customerDocument: string;
  roomId: number;
  habitacion: string;
  checkInAt: string;
  checkOutAt?: string;
  estado: StayStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
