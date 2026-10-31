import { dbClient } from "../db/client.js";
import { RoomModel, RoomWithAvailabilityModel } from "../models/room.model.js";
import { centsToMoney } from "../utils/money.js";

function mapRoom(row: Record<string, unknown>): RoomModel {
  const active = Number(row.active) === 1;
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    category: row.category ? String(row.category) : undefined,
    description: row.description ? String(row.description) : undefined,
    pricePerNight: centsToMoney(Number(row.price_per_night_cents ?? 0)),
    active,
    available: row.available === undefined ? undefined : Number(row.available) === 1 && active,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export interface NewRoomRecord {
  code: string;
  name: string;
  category?: string;
  description?: string;
  pricePerNightCents: number;
  active: boolean;
  now: string;
}

export interface UpdateRoomRecord extends NewRoomRecord {
  id: number;
}

export interface RoomAuditActor {
  userId: string;
  ipAddress?: string;
}

function auditValues(row: Record<string, unknown>): Record<string, unknown> {
  return {
    code: String(row.code),
    name: String(row.name),
    category: row.category == null ? undefined : String(row.category),
    description: row.description == null ? undefined : String(row.description),
    pricePerNightCents: Number(row.price_per_night_cents ?? 0),
    active: Number(row.active) === 1,
  };
}

function isRoomCodeConflict(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed:\s*rooms\.code/i.test(error.message);
}

export class RoomRepository {
  public async findAll(includeInactive = true): Promise<RoomWithAvailabilityModel[]> {
    const result = await dbClient.execute({
      sql: `SELECT rm.*,
                   CASE WHEN EXISTS (
                     SELECT 1 FROM stays s
                     WHERE s.room_id = rm.id AND s.estado = 'Activa'
                   ) THEN 0 ELSE 1 END AS available
            FROM rooms rm
            ${includeInactive ? "" : "WHERE rm.active = 1"}
            ORDER BY rm.code;`,
    });
    return result.rows.map((row) => mapRoom(row as Record<string, unknown>) as RoomWithAvailabilityModel);
  }

  public async findById(id: number): Promise<RoomModel | null> {
    const result = await dbClient.execute({
      sql: "SELECT * FROM rooms WHERE id = ? LIMIT 1;",
      args: [id],
    });
    return result.rows[0] ? mapRoom(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findByCode(code: string): Promise<RoomModel | null> {
    const result = await dbClient.execute({
      sql: "SELECT * FROM rooms WHERE LOWER(code) = LOWER(?) LIMIT 1;",
      args: [code],
    });
    return result.rows[0] ? mapRoom(result.rows[0] as Record<string, unknown>) : null;
  }

  public async getAvailability(
    from?: string,
    to?: string,
    excludeReservationId?: number
  ): Promise<RoomWithAvailabilityModel[]> {
    const result = from && to
      ? await dbClient.execute({
          sql: `SELECT rm.*,
                       CASE WHEN NOT EXISTS (
                         SELECT 1 FROM reservations r
                         WHERE r.room_id = rm.id
                           AND r.estado IN ('Pendiente', 'Confirmada', 'CheckIn')
                           AND r.fecha_entrada < ?
                           AND r.fecha_salida > ?
                           AND (? IS NULL OR r.id <> ?)
                       ) THEN 1 ELSE 0 END AS available
                FROM rooms rm WHERE rm.active = 1 ORDER BY rm.code;`,
          args: [to, from, excludeReservationId ?? null, excludeReservationId ?? null],
        })
      : await dbClient.execute({
          sql: `SELECT rm.*,
                       CASE WHEN EXISTS (
                         SELECT 1 FROM stays s
                         WHERE s.room_id = rm.id AND s.estado = 'Activa'
                       ) THEN 0 ELSE 1 END AS available
                FROM rooms rm WHERE rm.active = 1 ORDER BY rm.code;`,
        });
    return result.rows.map((row) => mapRoom(row as Record<string, unknown>) as RoomWithAvailabilityModel);
  }

  public async create(record: NewRoomRecord, actor: RoomAuditActor): Promise<RoomModel> {
    const transaction = await dbClient.transaction("write");
    try {
      const result = await transaction.execute({
        sql: `INSERT INTO rooms (
                code, name, category, description, price_per_night_cents, active, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          record.code,
          record.name,
          record.category ?? null,
          record.description ?? null,
          record.pricePerNightCents,
          record.active ? 1 : 0,
          record.now,
          record.now,
        ],
      });
      const id = Number(result.lastInsertRowid);
      const inserted = await transaction.execute({ sql: "SELECT * FROM rooms WHERE id = ? LIMIT 1;", args: [id] });
      const row = inserted.rows[0] as Record<string, unknown>;
      await transaction.execute({
        sql: `INSERT INTO audit_logs (
                user_id, action, entity, entity_id, new_values, ip_address, created_at
              ) VALUES (?, 'CREATE', 'room', ?, ?, ?, ?);`,
        args: [actor.userId, String(id), JSON.stringify(auditValues(row)), actor.ipAddress ?? null, record.now],
      });
      await transaction.commit();
      return mapRoom(row);
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      if (isRoomCodeConflict(error)) {
        throw { statusCode: 409, code: "ROOM_CODE_EXISTS", message: `Ya existe una habitación con el código ${record.code}` };
      }
      throw error;
    } finally {
      transaction.close();
    }
  }

  public async update(record: UpdateRoomRecord, actor: RoomAuditActor): Promise<RoomModel> {
    const transaction = await dbClient.transaction("write");
    try {
      const current = await transaction.execute({ sql: "SELECT * FROM rooms WHERE id = ? LIMIT 1;", args: [record.id] });
      if (!current.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Habitación no encontrada" };
      const oldRow = current.rows[0] as Record<string, unknown>;
      if (Number(oldRow.active) === 1 && !record.active) {
        const occupied = await transaction.execute({
          sql: "SELECT 1 FROM stays WHERE room_id = ? AND estado = 'Activa' LIMIT 1;",
          args: [record.id],
        });
        if (occupied.rows[0]) {
          throw { statusCode: 409, code: "ROOM_OCCUPIED", message: "No se puede desactivar una habitación con una estancia activa" };
        }
      }
      await transaction.execute({
        sql: `UPDATE rooms SET
                code = ?, name = ?, category = ?, description = ?,
                price_per_night_cents = ?, active = ?, updated_at = ?
              WHERE id = ?;`,
        args: [
          record.code,
          record.name,
          record.category ?? null,
          record.description ?? null,
          record.pricePerNightCents,
          record.active ? 1 : 0,
          record.now,
          record.id,
        ],
      });
      const updated = await transaction.execute({ sql: "SELECT * FROM rooms WHERE id = ? LIMIT 1;", args: [record.id] });
      const newRow = updated.rows[0] as Record<string, unknown>;
      const oldValues = auditValues(oldRow);
      const newValues = auditValues(newRow);
      if (JSON.stringify(oldValues) !== JSON.stringify(newValues)) {
        await transaction.execute({
          sql: `INSERT INTO audit_logs (
                  user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at
                ) VALUES (?, 'UPDATE', 'room', ?, ?, ?, ?, ?);`,
          args: [actor.userId, String(record.id), JSON.stringify(oldValues), JSON.stringify(newValues), actor.ipAddress ?? null, record.now],
        });
      }
      await transaction.commit();
      return mapRoom(newRow);
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      if (isRoomCodeConflict(error)) {
        throw { statusCode: 409, code: "ROOM_CODE_EXISTS", message: `Ya existe una habitación con el código ${record.code}` };
      }
      throw error;
    } finally {
      transaction.close();
    }
  }

  public async deactivate(id: number, actor: RoomAuditActor, now: string): Promise<RoomModel> {
    const transaction = await dbClient.transaction("write");
    try {
      const current = await transaction.execute({ sql: "SELECT * FROM rooms WHERE id = ? LIMIT 1;", args: [id] });
      if (!current.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Habitación no encontrada" };
      const oldRow = current.rows[0] as Record<string, unknown>;
      if (Number(oldRow.active) === 0) {
        await transaction.rollback();
        return mapRoom(oldRow);
      }
      const occupied = await transaction.execute({
        sql: "SELECT 1 FROM stays WHERE room_id = ? AND estado = 'Activa' LIMIT 1;",
        args: [id],
      });
      if (occupied.rows[0]) {
        throw { statusCode: 409, code: "ROOM_OCCUPIED", message: "No se puede desactivar una habitación con una estancia activa" };
      }
      await transaction.execute({ sql: "UPDATE rooms SET active = 0, updated_at = ? WHERE id = ?;", args: [now, id] });
      const updated = await transaction.execute({ sql: "SELECT * FROM rooms WHERE id = ? LIMIT 1;", args: [id] });
      const newRow = updated.rows[0] as Record<string, unknown>;
      await transaction.execute({
        sql: `INSERT INTO audit_logs (
                user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at
              ) VALUES (?, 'DEACTIVATE', 'room', ?, ?, ?, ?, ?);`,
        args: [actor.userId, String(id), JSON.stringify(auditValues(oldRow)), JSON.stringify(auditValues(newRow)), actor.ipAddress ?? null, now],
      });
      await transaction.commit();
      return mapRoom(newRow);
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }
}
