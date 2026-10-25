import { EstadoLavanderia, PrendaItem } from "../models/laundry.model.js";

export interface CreateLaundryOrderDto {
  stayId?: number;
  huesped?: string;
  habitacion?: string;
  prendas: PrendaItem[];
  observaciones?: string;
}

export interface UpdateLaundryOrderDto {
  huesped?: string;
  habitacion?: string;
  prendas?: PrendaItem[];
  observaciones?: string;
  estado?: EstadoLavanderia;
}

export interface UpdateLaundryStatusDto {
  estado: EstadoLavanderia;
}
