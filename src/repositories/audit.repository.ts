import { dbClient } from "../db/client.js";
import { AuditLogModel } from "../models/audit.model.js";

export class AuditRepository {
  public async create(entry: AuditLogModel): Promise<number> {
    const result = await dbClient.execute({
      sql: `INSERT INTO audit_logs (
              user_id, action, entity, entity_id, old_values,
              new_values, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [
        entry.userId ?? null,
        entry.action,
        entry.entity,
        entry.entityId ?? null,
        entry.oldValues === undefined ? null : JSON.stringify(entry.oldValues),
        entry.newValues === undefined ? null : JSON.stringify(entry.newValues),
        entry.ipAddress ?? null,
        entry.createdAt,
      ],
    });

    return Number(result.lastInsertRowid);
  }
}
