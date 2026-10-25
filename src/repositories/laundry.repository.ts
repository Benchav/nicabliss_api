import { LaundryModel, EstadoLavanderia, PrendaItem } from "../models/laundry.model.js";
import { dbClient } from "../db/client.js";

function mapRowToLaundry(row: any): LaundryModel {
  let prendas: PrendaItem[] = [];
  try {
    prendas = typeof row.prendas === "string" ? JSON.parse(row.prendas) : row.prendas;
  } catch {
    prendas = [];
  }

  return {
    id: Number(row.id),
    huesped: String(row.huesped),
    habitacion: String(row.habitacion),
    prendas,
    totalPrendas: Number(row.total_prendas),
    total: Number(row.total),
    estado: row.estado as EstadoLavanderia,
    fecha: String(row.fecha),
    observaciones: String(row.observaciones || ""),
    customerId: row.customer_id ? Number(row.customer_id) : undefined,
    stayId: row.stay_id ? Number(row.stay_id) : undefined,
    serviceConsumptionId: row.service_consumption_id ? Number(row.service_consumption_id) : undefined,
    createdBy: row.created_by ? String(row.created_by) : undefined,
  };
}

export class LaundryRepository {
  public async findAll(search?: string): Promise<LaundryModel[]> {
    if (search && search.trim().length > 0) {
      const term = `%${search.toLowerCase().trim()}%`;
      const result = await dbClient.execute({
        sql: `SELECT * FROM laundry_orders
              WHERE LOWER(huesped) LIKE ?
                 OR LOWER(habitacion) LIKE ?
                 OR LOWER(observaciones) LIKE ?
              ORDER BY id DESC;`,
        args: [term, term, term],
      });
      return result.rows.map(mapRowToLaundry);
    }

    const result = await dbClient.execute(`SELECT * FROM laundry_orders ORDER BY id DESC;`);
    return result.rows.map(mapRowToLaundry);
  }

  public async findById(id: number): Promise<LaundryModel | null> {
    const result = await dbClient.execute({
      sql: `SELECT * FROM laundry_orders WHERE id = ? LIMIT 1;`,
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return mapRowToLaundry(result.rows[0]);
  }

  public async save(order: LaundryModel): Promise<void> {
    const prendasJson = JSON.stringify(order.prendas || []);
    const transaction = await dbClient.transaction("write");
    try {
      await transaction.execute({
        sql: `INSERT INTO laundry_orders (id, huesped, habitacion, prendas, total_prendas, total, estado, fecha, observaciones,
                customer_id, stay_id, service_consumption_id, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                huesped = excluded.huesped,
                habitacion = excluded.habitacion,
                prendas = excluded.prendas,
                total_prendas = excluded.total_prendas,
                total = excluded.total,
                estado = excluded.estado,
                fecha = excluded.fecha,
                observaciones = excluded.observaciones,
                customer_id = excluded.customer_id,
                stay_id = excluded.stay_id,
                service_consumption_id = excluded.service_consumption_id,
                created_by = excluded.created_by;`,
        args: [
          order.id,
          order.huesped,
          order.habitacion,
          prendasJson,
          order.totalPrendas,
          order.total,
          order.estado,
          order.fecha,
          order.observaciones,
          order.customerId ?? null,
          order.stayId ?? null,
          order.serviceConsumptionId ?? null,
          order.createdBy ?? null,
        ],
      });

      if (order.serviceConsumptionId) {
        const status = order.estado === "Cancelado" ? "Cancelado"
          : order.estado === "Pendiente" ? "Registrado"
            : order.estado === "En proceso" ? "EnProceso" : "Entregado";
        await transaction.execute({
          sql: `UPDATE service_consumptions SET estado = ?, cantidad = ?, precio_unitario_cents = 50,
                  subtotal_cents = ?, observaciones = ?, updated_at = ? WHERE id = ?;`,
          args: [status, order.totalPrendas, Math.round(order.total * 100), order.observaciones, new Date().toISOString(), order.serviceConsumptionId],
        });
      }
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }

  public async saveWithConsumption(order: LaundryModel): Promise<void> {
    if (!order.stayId || !order.customerId || !order.createdBy) {
      await this.save(order);
      return;
    }
    const transaction = await dbClient.transaction("write");
    const now = new Date().toISOString();
    try {
      await transaction.execute({
        sql: `INSERT INTO laundry_orders (id, huesped, habitacion, prendas, total_prendas, total, estado, fecha,
                observaciones, customer_id, stay_id, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [order.id, order.huesped, order.habitacion, JSON.stringify(order.prendas), order.totalPrendas,
          order.total, order.estado, order.fecha, order.observaciones, order.customerId, order.stayId, order.createdBy],
      });
      const consumption = await transaction.execute({
        sql: `INSERT INTO service_consumptions (
                stay_id, customer_id, service_id, cantidad, precio_unitario_cents, subtotal_cents,
                estado, observaciones, source_type, source_id, consumed_at, created_by, created_at, updated_at
              ) VALUES (?, ?, 2, ?, 50, ?, 'Registrado', ?, 'LAUNDRY_ORDER', ?, ?, ?, ?, ?);`,
        args: [order.stayId, order.customerId, order.totalPrendas, Math.round(order.total * 100), order.observaciones,
          order.id, now, order.createdBy, now, now],
      });
      order.serviceConsumptionId = Number(consumption.lastInsertRowid);
      await transaction.execute({ sql: "UPDATE laundry_orders SET service_consumption_id = ? WHERE id = ?;", args: [order.serviceConsumptionId, order.id] });
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; }
    finally { transaction.close(); }
  }

  public async countPending(): Promise<number> {
    const result = await dbClient.execute(`
      SELECT COUNT(*) as count FROM laundry_orders
      WHERE estado IN ('Pendiente', 'En proceso');
    `);
    return Number(result.rows[0].count);
  }

  public async delete(id: number): Promise<boolean> {
    const linked = await dbClient.execute({
      sql: "SELECT service_consumption_id FROM laundry_orders WHERE id = ? LIMIT 1;",
      args: [id],
    });
    if (linked.rows[0]?.service_consumption_id) {
      throw {
        statusCode: 409,
        code: "LINKED_CONSUMPTION",
        message: "Una solicitud ligada a una estancia no puede eliminarse; debe cancelarse",
      };
    }
    const result = await dbClient.execute({
      sql: `DELETE FROM laundry_orders WHERE id = ?;`,
      args: [id],
    });
    return result.rowsAffected > 0;
  }
}
