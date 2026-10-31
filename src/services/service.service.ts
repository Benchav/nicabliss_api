import {
  CreateCatalogServiceDto,
  CreateConsumptionDto,
  UpdateCatalogServiceDto,
  UpdateConsumptionDto,
} from "../dtos/service.dto.js";
import { ConsumptionStatus, ServiceCatalogModel } from "../models/service.model.js";
import { ServiceRepository } from "../repositories/service.repository.js";
import { centsToMoney, parseMoneyToCents } from "../utils/money.js";

const transitions: Record<ConsumptionStatus, readonly ConsumptionStatus[]> = {
  Registrado: ["EnProceso", "Entregado", "Consumido", "Cancelado"],
  EnProceso: ["Entregado", "Consumido", "Cancelado"],
  Entregado: ["Consumido", "Cancelado"],
  Consumido: [],
  Cancelado: [],
};

export class ServiceService {
  public constructor(private readonly repository: ServiceRepository) {}

  public async getCatalog(includeInactive = false): Promise<ServiceCatalogModel[]> {
    return this.repository.getCatalog(includeInactive);
  }

  public async createCatalog(dto: CreateCatalogServiceDto): Promise<ServiceCatalogModel> {
    const now = new Date().toISOString();
    return this.repository.createCatalog({
      nombre: dto.nombre.trim(), categoria: dto.categoria,
      descripcion: dto.descripcion?.trim() || undefined,
      precio: centsToMoney(parseMoneyToCents(dto.precio, "precio")),
      impuesto: dto.impuesto ?? 0, activo: dto.activo ?? true, createdAt: now, updatedAt: now,
    });
  }

  public async updateCatalog(id: number, dto: UpdateCatalogServiceDto): Promise<ServiceCatalogModel> {
    const current = await this.repository.findCatalogById(id);
    if (!current) throw { statusCode: 404, code: "NOT_FOUND", message: "Servicio no encontrado" };
    return this.repository.updateCatalog({
      ...current,
      nombre: dto.nombre?.trim() || current.nombre,
      categoria: dto.categoria ?? current.categoria,
      descripcion: dto.descripcion !== undefined ? dto.descripcion.trim() || undefined : current.descripcion,
      precio: dto.precio === undefined ? current.precio : centsToMoney(parseMoneyToCents(dto.precio, "precio")),
      impuesto: dto.impuesto ?? current.impuesto,
      activo: dto.activo ?? current.activo,
      updatedAt: new Date().toISOString(),
    });
  }

  public async getByStay(stayId: number) {
    return this.repository.getByStay(stayId);
  }

  public async createConsumption(stayId: number, dto: CreateConsumptionDto, userId: string, role: string) {
    const catalog = await this.repository.findCatalogById(Number(dto.serviceId));
    if (!catalog || !catalog.activo) throw { statusCode: 404, code: "NOT_FOUND", message: "Servicio no disponible" };
    const quantity = Number(dto.cantidad);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La cantidad debe ser un entero mayor que cero" };
    }
    if (dto.precioUnitario !== undefined && role !== "ADMIN") {
      throw { statusCode: 403, code: "FORBIDDEN", message: "Solo administración puede modificar el precio unitario" };
    }
    const unitPriceCents = dto.precioUnitario === undefined
      ? parseMoneyToCents(catalog.precio, "precio")
      : parseMoneyToCents(dto.precioUnitario, "precioUnitario");
    return this.repository.createConsumption({
      stayId, serviceId: catalog.id, quantity, unitPriceCents,
      status: dto.estado ?? "Registrado", observations: dto.observaciones?.trim() || undefined,
      userId, now: new Date().toISOString(),
    });
  }

  public async updateStatus(id: number, next: ConsumptionStatus, userId: string) {
    const current = await this.repository.findConsumptionById(id);
    if (!current) throw { statusCode: 404, code: "NOT_FOUND", message: "Consumo no encontrado" };
    if (!this.isTransitionAllowed(current.estado, next)) {
      throw { statusCode: 409, code: "INVALID_STATUS_TRANSITION", message: `No se puede cambiar de ${current.estado} a ${next}` };
    }
    if (current.estado === next) return current;
    return this.repository.updateConsumptionStatus(id, next, userId);
  }

  public async updateConsumption(id: number, dto: UpdateConsumptionDto, userId: string, role: string) {
    const current = await this.repository.findConsumptionById(id);
    if (!current) throw { statusCode: 404, code: "NOT_FOUND", message: "Consumo no encontrado" };
    if (current.sourceType !== "DIRECT") {
      throw {
        statusCode: 409,
        code: "SOURCE_MANAGED",
        message: "Los cargos de pedidos y lavandería se modifican desde su módulo de origen",
      };
    }
    const quantity = dto.cantidad === undefined ? current.cantidad : Number(dto.cantidad);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "La cantidad debe ser un entero mayor que cero" };
    }
    if (dto.precioUnitario !== undefined && role !== "ADMIN") {
      throw { statusCode: 403, code: "FORBIDDEN", message: "Solo administración puede modificar el precio unitario" };
    }
    const unitPriceCents = dto.precioUnitario === undefined
      ? parseMoneyToCents(current.precioUnitario, "precioUnitario")
      : parseMoneyToCents(dto.precioUnitario, "precioUnitario");
    return this.repository.updateConsumption({
      id,
      quantity,
      unitPriceCents,
      observations: dto.observaciones !== undefined ? dto.observaciones.trim() || undefined : current.observaciones,
      userId,
      now: new Date().toISOString(),
    });
  }

  public isTransitionAllowed(current: ConsumptionStatus, next: ConsumptionStatus): boolean {
    return current === next || transitions[current].includes(next);
  }
}
