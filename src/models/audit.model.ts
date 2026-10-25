export interface AuditLogModel {
  id?: number;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
  createdAt: string;
}
