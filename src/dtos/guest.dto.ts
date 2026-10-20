import { EstadoEstancia } from "../models/guest.model.js";

export interface CreateGuestDto {
  nombre: string;
  documento: string;
  habitacion: string;
  entrada: string;
  salida: string;
  estado?: EstadoEstancia;
}

export interface UpdateGuestStatusDto {
  estado: EstadoEstancia;
}
