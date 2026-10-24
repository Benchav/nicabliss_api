import { AuditLogModel } from "../models/audit.model.js";
import { AuditRepository } from "../repositories/audit.repository.js";

export class AuditService {
  public constructor(private readonly auditRepository: AuditRepository) {}

  public async record(
    entry: Omit<AuditLogModel, "id" | "createdAt">
  ): Promise<number> {
    return this.auditRepository.create({
      ...entry,
      createdAt: new Date().toISOString(),
    });
  }
}
