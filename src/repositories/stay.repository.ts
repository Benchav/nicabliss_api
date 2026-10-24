import { dbClient } from "../db/client.js";
import { StayModel, StayStatus } from "../models/stay.model.js";

const selectStay = `
  SELECT s.*, r.codigo_reserva,
         c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
         c.documento AS customer_document
  FROM stays s
  JOIN reservations r ON r.id = s.reservation_id
  JOIN customers c ON c.id = s.customer_id`;

function mapStay(row: Record<string, unknown>): StayModel {
  return {
    id: Number(row.id),
    reservationId: Number(row.reservation_id),
    reservationCode: String(row.codigo_reserva),
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name),
    customerDocument: String(row.customer_document),
    roomId: Number(row.room_id),
    habitacion: String(row.habitacion),
    checkInAt: String(row.check_in_at),
    checkOutAt: row.check_out_at ? String(row.check_out_at) : undefined,
    estado: row.estado as StayStatus,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class StayRepository {
  public async findAll(status?: StayStatus): Promise<StayModel[]> {
    const result = status
      ? await dbClient.execute({ sql: `${selectStay} WHERE s.estado = ? ORDER BY s.check_in_at DESC;`, args: [status] })
      : await dbClient.execute(`${selectStay} ORDER BY s.check_in_at DESC;`);
    return result.rows.map((row) => mapStay(row as Record<string, unknown>));
  }

  public async findById(id: number): Promise<StayModel | null> {
    const result = await dbClient.execute({ sql: `${selectStay} WHERE s.id = ? LIMIT 1;`, args: [id] });
    return result.rows[0] ? mapStay(result.rows[0] as Record<string, unknown>) : null;
  }

  public async checkIn(reservationId: number, userId: string, ipAddress?: string): Promise<StayModel> {
    const transaction = await dbClient.transaction("write");
    let stayId = 0;
    const now = new Date().toISOString();
    try {
      const existing = await transaction.execute({
        sql: "SELECT id FROM stays WHERE reservation_id = ? LIMIT 1;",
        args: [reservationId],
      });
      if (existing.rows[0]) {
        stayId = Number(existing.rows[0].id);
        await transaction.rollback();
        return (await this.findById(stayId))!;
      }
      const reservation = await transaction.execute({
        sql: "SELECT * FROM reservations WHERE id = ? LIMIT 1;",
        args: [reservationId],
      });
      if (!reservation.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Reserva no encontrada" };
      const row = reservation.rows[0];
      if (row.estado !== "Confirmada") {
        throw { statusCode: 409, code: "INVALID_STATUS", message: "Solo una reserva confirmada puede hacer check-in" };
      }
      const occupied = await transaction.execute({
        sql: "SELECT id FROM stays WHERE room_id = ? AND estado = 'Activa' LIMIT 1;",
        args: [row.room_id],
      });
      if (occupied.rows[0]) {
        throw { statusCode: 409, code: "ROOM_OCCUPIED", message: "La habitación tiene otra estancia activa" };
      }
      const inserted = await transaction.execute({
        sql: `INSERT INTO stays (
                reservation_id, customer_id, room_id, habitacion, check_in_at,
                estado, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 'Activa', ?, ?, ?);`,
        args: [reservationId, row.customer_id, row.room_id, row.habitacion, now, userId, now, now],
      });
      stayId = Number(inserted.lastInsertRowid);
      await transaction.execute({
        sql: "UPDATE reservations SET estado = 'CheckIn', updated_at = ? WHERE id = ?;",
        args: [now, reservationId],
      });
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_values, ip_address, created_at)
              VALUES (?, 'CHECK_IN', 'stay', ?, ?, ?, ?);`,
        args: [userId, String(stayId), JSON.stringify({ reservationId }), ipAddress ?? null, now],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally { transaction.close(); }
    return (await this.findById(stayId))!;
  }

  public async checkOut(stayId: number, userId: string, ipAddress?: string): Promise<StayModel> {
    const transaction = await dbClient.transaction("write");
    const now = new Date().toISOString();
    try {
      const stay = await transaction.execute({ sql: "SELECT * FROM stays WHERE id = ? LIMIT 1;", args: [stayId] });
      if (!stay.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Estancia no encontrada" };
      if (stay.rows[0].estado === "Finalizada") {
        await transaction.rollback();
        return (await this.findById(stayId))!;
      }
      if (stay.rows[0].estado !== "Activa") {
        throw { statusCode: 409, code: "INVALID_STATUS", message: "La estancia no puede finalizarse" };
      }
      await transaction.execute({
        sql: "UPDATE stays SET estado = 'Finalizada', check_out_at = ?, updated_at = ? WHERE id = ?;",
        args: [now, now, stayId],
      });
      await transaction.execute({
        sql: "UPDATE reservations SET estado = 'Finalizada', updated_at = ? WHERE id = ?;",
        args: [now, stay.rows[0].reservation_id],
      });
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_values, ip_address, created_at)
              VALUES (?, 'CHECK_OUT', 'stay', ?, ?, ?, ?);`,
        args: [userId, String(stayId), JSON.stringify({ checkOutAt: now }), ipAddress ?? null, now],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally { transaction.close(); }
    return (await this.findById(stayId))!;
  }
}
