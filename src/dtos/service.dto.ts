import { ConsumptionStatus, ServiceCategory } from "../models/service.model.js";

export interface CreateCatalogServiceDto {
  nombre: string;
  categoria: ServiceCategory;
  descripcion?: string;
  precio: number | string;
  impuesto?: number;
  activo?: boolean;
}

export type UpdateCatalogServiceDto = Partial<CreateCatalogServiceDto>;

export interface CreateConsumptionDto {
  serviceId: number;
  cantidad: number;
  precioUnitario?: number | string;
  observaciones?: string;
  estado?: ConsumptionStatus;
}

export interface UpdateConsumptionDto {
  cantidad?: number;
  precioUnitario?: number | string;
  observaciones?: string;
}
