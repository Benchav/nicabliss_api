import { EstadoLavanderia, PrendaItem } from "../models/laundry.model.js";

export interface CreateLaundryOrderDto {
  huesped: string;
  habitacion: string;
  prendas: PrendaItem[];
  observaciones?: string;
}

export interface UpdateLaundryStatusDto {
  estado: EstadoLavanderia;
}
