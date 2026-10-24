export type ServiceCategory = "Alimentos" | "Lavandería" | "Hospedaje" | "Minibar" | "Transporte" | "Otro";
export type ConsumptionStatus = "Registrado" | "EnProceso" | "Entregado" | "Consumido" | "Cancelado";

export interface ServiceCatalogModel {
  id: number;
  nombre: string;
  categoria: ServiceCategory;
  descripcion?: string;
  precio: number;
  impuesto: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceConsumptionModel {
  id: number;
  stayId: number;
  customerId: number;
  serviceId: number;
  serviceName: string;
  categoria: ServiceCategory;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  estado: ConsumptionStatus;
  observaciones?: string;
  sourceType: "DIRECT" | "FOOD_ORDER" | "LAUNDRY_ORDER";
  sourceId?: number;
  consumedAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
