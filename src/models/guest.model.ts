export type EstadoEstancia = "Activo" | "Finalizado" | "Reservado";

export interface GuestModel {
  id: number;
  nombre: string;
  documento: string;
  habitacion: string;
  entrada: string;
  salida: string;
  estado: EstadoEstancia;
  createdAt?: string;
}
