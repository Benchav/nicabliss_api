import { CreateCustomerDto, UpdateCustomerDto } from "../dtos/customer.dto.js";
import { CustomerModel } from "../models/customer.model.js";
import { AuditRepository } from "../repositories/audit.repository.js";
import { CustomerRepository, normalizeDocument } from "../repositories/customer.repository.js";
import { AuditService } from "./audit.service.js";

export class CustomerService {
  private readonly auditService = new AuditService(new AuditRepository());

  public constructor(private readonly customerRepository: CustomerRepository) {}

  public async getAll(search?: string): Promise<CustomerModel[]> {
    return this.customerRepository.findAll(search);
  }

  public async getById(id: number): Promise<CustomerModel> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) throw { statusCode: 404, code: "NOT_FOUND", message: "Cliente no encontrado" };
    return customer;
  }

  public async create(dto: CreateCustomerDto, userId: string, ipAddress?: string): Promise<CustomerModel> {
    if (!normalizeDocument(dto.documento)) {
      throw { statusCode: 400, code: "VALIDATION_ERROR", message: "El documento no es válido" };
    }
    const duplicate = await this.customerRepository.findByNormalizedDocument(dto.documento);
    if (duplicate) {
      throw {
        statusCode: 409,
        code: "CUSTOMER_DOCUMENT_EXISTS",
        message: `Ya existe un cliente con el documento ${dto.documento}`,
      };
    }
    const now = new Date().toISOString();
    let customer: CustomerModel;
    try {
      customer = await this.customerRepository.create({
        nombre: dto.nombre.trim(),
        apellido: dto.apellido?.trim() || undefined,
        documento: dto.documento.trim(),
        telefono: dto.telefono?.trim() || undefined,
        correo: dto.correo?.trim().toLowerCase() || undefined,
        direccion: dto.direccion?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      this.rethrowDocumentConflict(error);
      throw error;
    }
    await this.auditService.record({
      userId,
      action: "CREATE",
      entity: "customer",
      entityId: String(customer.id),
      newValues: customer,
      ipAddress,
    });
    return customer;
  }

  public async update(id: number, dto: UpdateCustomerDto, userId: string, ipAddress?: string): Promise<CustomerModel> {
    const current = await this.getById(id);
    if (dto.documento && normalizeDocument(dto.documento) !== normalizeDocument(current.documento)) {
      const duplicate = await this.customerRepository.findByNormalizedDocument(dto.documento);
      if (duplicate && duplicate.id !== id) {
        throw { statusCode: 409, code: "CUSTOMER_DOCUMENT_EXISTS", message: "El documento pertenece a otro cliente" };
      }
    }
    let updated: CustomerModel;
    try {
      updated = await this.customerRepository.update({
        ...current,
        nombre: dto.nombre?.trim() || current.nombre,
        apellido: dto.apellido !== undefined ? dto.apellido.trim() || undefined : current.apellido,
        documento: dto.documento?.trim() || current.documento,
        telefono: dto.telefono !== undefined ? dto.telefono.trim() || undefined : current.telefono,
        correo: dto.correo !== undefined ? dto.correo.trim().toLowerCase() || undefined : current.correo,
        direccion: dto.direccion !== undefined ? dto.direccion.trim() || undefined : current.direccion,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.rethrowDocumentConflict(error);
      throw error;
    }
    await this.auditService.record({
      userId,
      action: "UPDATE",
      entity: "customer",
      entityId: String(id),
      oldValues: current,
      newValues: updated,
      ipAddress,
    });
    return updated;
  }

  private rethrowDocumentConflict(error: unknown): void {
    const candidate = error as { code?: string; message?: string };
    if (
      candidate.code?.includes("CONSTRAINT") ||
      candidate.message?.includes("customers.documento_normalizado")
    ) {
      throw {
        statusCode: 409,
        code: "CUSTOMER_DOCUMENT_EXISTS",
        message: "Ya existe un cliente con ese documento",
      };
    }
  }
}
