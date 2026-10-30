import { dbClient } from "../db/client.js";
import {
  DepositType,
  ReservationModel,
  ReservationStatus,
  RoomModel,
} from "../models/reservation.model.js";
import { centsToMoney } from "../utils/money.js";

const reservationSelect = `
  SELECT r.*, rm.code AS room_code,
         c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
         c.documento AS customer_document,
         COALESCE((
           SELECT SUM(CASE WHEN p.kind = 'REVERSAL' THEN -pa.amount_cents ELSE pa.amount_cents END)
           FROM payment_allocations pa
           JOIN payments p ON p.id = pa.payment_id
           WHERE pa.reservation_id = r.id
         ), 0) AS paid_cents
  FROM reservations r
  JOIN customers c ON c.id = r.customer_id
  JOIN rooms rm ON rm.id = r.room_id`;

function mapReservation(row: Record<string, unknown>): ReservationModel {
  const totalCents = Number(row.total_reserva_cents);
  const paidCents = Number(row.paid_cents || 0);
  const depositType = row.deposit_type as DepositType;
  const storedDepositValue = Number(row.deposit_value);
  return {
    id: Number(row.id),
    codigoReserva: String(row.codigo_reserva),
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name),
    customerDocument: String(row.customer_document),
    roomId: Number(row.room_id),
    habitacion: String(row.habitacion),
    fechaEntrada: String(row.fecha_entrada),
    fechaSalida: String(row.fecha_salida),
    totalReserva: centsToMoney(totalCents),
    depositType,
    depositValue: depositType === "PERCENTAGE" ? storedDepositValue / 100 : centsToMoney(storedDepositValue),
    depositoRequerido: centsToMoney(Number(row.deposito_requerido_cents)),
    abonado: centsToMoney(paidCents),
    saldo: centsToMoney(Math.max(totalCents - paidCents, 0)),
    estado: row.estado as ReservationStatus,
    observaciones: row.observaciones ? String(row.observaciones) : undefined,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface NewReservationRecord {
  customerId: number;
  roomId: number;
  fechaEntrada: string;
  fechaSalida: string;
  totalCents: number;
  depositType: DepositType;
  depositValue: number;
  depositRequiredCents: number;
  observaciones?: string;
  createdBy: string;
  now: string;
}

export interface UpdateReservationRecord {
  id: number;
  roomId: number;
  fechaEntrada: string;
  fechaSalida: string;
  totalCents: number;
  depositRequiredCents: number;
  observaciones?: string;
  updatedBy: string;
  now: string;
}

export class ReservationRepository {
  public async findAll(search?: string, status?: ReservationStatus): Promise<ReservationModel[]> {
    const conditions: string[] = [];
    const args: (string | number)[] = [];
    if (search?.trim()) {
      conditions.push(`(LOWER(r.codigo_reserva) LIKE ? OR LOWER(c.nombre || ' ' || COALESCE(c.apellido, '')) LIKE ? OR LOWER(c.documento) LIKE ?)`);
      const term = `%${search.trim().toLowerCase()}%`;
      args.push(term, term, term);
    }
    if (status) {
      conditions.push("r.estado = ?");
      args.push(status);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    const result = await dbClient.execute({
      sql: `${reservationSelect}${where} ORDER BY r.created_at DESC, r.id DESC;`,
      args,
    });
    return result.rows.map((row) => mapReservation(row as Record<string, unknown>));
  }

  public async findById(id: number): Promise<ReservationModel | null> {
    const result = await dbClient.execute({
      sql: `${reservationSelect} WHERE r.id = ? LIMIT 1;`,
      args: [id],
    });
    return result.rows[0] ? mapReservation(result.rows[0] as Record<string, unknown>) : null;
  }

  public async getRooms(
    from?: string,
    to?: string,
    excludeReservationId?: number
  ): Promise<Array<RoomModel & { available: boolean }>> {
    const result = from && to
      ? await dbClient.execute({
          sql: `SELECT rm.*,
                       NOT EXISTS (
                         SELECT 1 FROM reservations r
                         WHERE r.room_id = rm.id
                           AND r.estado IN ('Pendiente', 'Confirmada', 'CheckIn')
                           AND r.fecha_entrada < ?
                           AND r.fecha_salida > ?
                           AND (? IS NULL OR r.id <> ?)
                       ) AS available
                FROM rooms rm WHERE rm.active = 1 ORDER BY rm.code;`,
          args: [to, from, excludeReservationId ?? null, excludeReservationId ?? null],
        })
      : await dbClient.execute("SELECT *, 1 AS available FROM rooms WHERE active = 1 ORDER BY code;");

    return result.rows.map((row) => ({
      id: Number(row.id),
      code: String(row.code),
      name: String(row.name),
      active: Number(row.active) === 1,
      available: Number(row.available) === 1,
    }));
  }

  public async create(record: NewReservationRecord): Promise<ReservationModel> {
    const transaction = await dbClient.transaction("write");
    let reservationId: number;
    try {
      const customer = await transaction.execute({
        sql: "SELECT id FROM customers WHERE id = ? LIMIT 1;",
        args: [record.customerId],
      });
      if (!customer.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Cliente no encontrado" };

      const room = await transaction.execute({
        sql: "SELECT id, name FROM rooms WHERE id = ? AND active = 1 LIMIT 1;",
        args: [record.roomId],
      });
      if (!room.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Habitación no encontrada o inactiva" };

      const overlap = await transaction.execute({
        sql: `SELECT id FROM reservations
              WHERE room_id = ?
                AND estado IN ('Pendiente', 'Confirmada', 'CheckIn')
                AND fecha_entrada < ? AND fecha_salida > ?
              LIMIT 1;`,
        args: [record.roomId, record.fechaSalida, record.fechaEntrada],
      });
      if (overlap.rows[0]) {
        throw { statusCode: 409, code: "ROOM_UNAVAILABLE", message: "La habitación ya está reservada en ese rango" };
      }

      await transaction.execute("UPDATE document_sequences SET current_value = current_value + 1 WHERE document_type = 'RESERVATION';");
      const sequence = await transaction.execute("SELECT current_value FROM document_sequences WHERE document_type = 'RESERVATION';");
      const code = `RES-${record.now.slice(0, 4)}-${String(sequence.rows[0].current_value).padStart(6, "0")}`;
      const inserted = await transaction.execute({
        sql: `INSERT INTO reservations (
                codigo_reserva, customer_id, room_id, habitacion, fecha_entrada,
                fecha_salida, total_reserva_cents, deposit_type, deposit_value,
                deposito_requerido_cents, estado, observaciones, created_by,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?, ?, ?, ?);`,
        args: [
          code,
          record.customerId,
          record.roomId,
          room.rows[0].name,
          record.fechaEntrada,
          record.fechaSalida,
          record.totalCents,
          record.depositType,
          record.depositValue,
          record.depositRequiredCents,
          record.observaciones ?? null,
          record.createdBy,
          record.now,
          record.now,
        ],
      });
      reservationId = Number(inserted.lastInsertRowid);
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_values, created_at)
              VALUES (?, 'CREATE', 'reservation', ?, ?, ?);`,
        args: [record.createdBy, String(reservationId), JSON.stringify({ code, customerId: record.customerId }), record.now],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return (await this.findById(reservationId!))!;
  }

  public async update(record: UpdateReservationRecord): Promise<ReservationModel> {
    const transaction = await dbClient.transaction("write");
    try {
      const current = await transaction.execute({
        sql: `SELECT r.*,
                     COALESCE((
                       SELECT SUM(CASE WHEN p.kind = 'REVERSAL' THEN -pa.amount_cents ELSE pa.amount_cents END)
                       FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
                       WHERE pa.reservation_id = r.id
                     ), 0) AS paid_cents
              FROM reservations r WHERE r.id = ? LIMIT 1;`,
        args: [record.id],
      });
      if (!current.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Reserva no encontrada" };
      if (!["Pendiente", "Confirmada"].includes(String(current.rows[0].estado))) {
        throw { statusCode: 409, code: "INVALID_STATUS", message: "Solo pueden editarse reservas pendientes o confirmadas" };
      }
      if (record.totalCents < Number(current.rows[0].paid_cents)) {
        throw { statusCode: 400, code: "TOTAL_BELOW_PAID", message: "El total no puede ser inferior a lo abonado" };
      }

      const room = await transaction.execute({
        sql: "SELECT id, name FROM rooms WHERE id = ? AND active = 1 LIMIT 1;",
        args: [record.roomId],
      });
      if (!room.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Habitación no encontrada o inactiva" };
      const overlap = await transaction.execute({
        sql: `SELECT id FROM reservations
              WHERE room_id = ? AND id <> ?
                AND estado IN ('Pendiente', 'Confirmada', 'CheckIn')
                AND fecha_entrada < ? AND fecha_salida > ? LIMIT 1;`,
        args: [record.roomId, record.id, record.fechaSalida, record.fechaEntrada],
      });
      if (overlap.rows[0]) {
        throw { statusCode: 409, code: "ROOM_UNAVAILABLE", message: "La habitación ya está reservada en ese rango" };
      }

      await transaction.execute({
        sql: `UPDATE reservations SET room_id = ?, habitacion = ?, fecha_entrada = ?,
                fecha_salida = ?, total_reserva_cents = ?, deposito_requerido_cents = ?,
                observaciones = ?, updated_at = ? WHERE id = ?;`,
        args: [
          record.roomId,
          room.rows[0].name,
          record.fechaEntrada,
          record.fechaSalida,
          record.totalCents,
          record.depositRequiredCents,
          record.observaciones ?? null,
          record.now,
          record.id,
        ],
      });
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, created_at)
              VALUES (?, 'UPDATE', 'reservation', ?, ?, ?, ?);`,
        args: [
          record.updatedBy,
          String(record.id),
          JSON.stringify(current.rows[0]),
          JSON.stringify({ roomId: record.roomId, totalCents: record.totalCents }),
          record.now,
        ],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return (await this.findById(record.id))!;
  }

  public async updateStatus(id: number, status: ReservationStatus, userId: string): Promise<ReservationModel> {
    const now = new Date().toISOString();
    const statements = [
      {
        sql: "UPDATE reservations SET estado = ?, updated_at = ? WHERE id = ?;",
        args: [status, now, id],
      },
      {
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_values, created_at)
              VALUES (?, 'STATUS_CHANGE', 'reservation', ?, ?, ?);`,
        args: [userId, String(id), JSON.stringify({ estado: status }), now],
      },
    ];
    if (status === "Cancelada" || status === "NoShow") {
      statements.push({
        sql: `UPDATE food_orders SET estado = 'Cancelado'
              WHERE reservation_id = ? AND stay_id IS NULL AND estado <> 'Cancelado';`,
        args: [id],
      });
    }
    await dbClient.batch(statements, "write");
    return (await this.findById(id))!;
  }
}
