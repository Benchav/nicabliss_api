import type { Transaction } from "@libsql/client";
import { LaundryModel, EstadoLavanderia, PrendaItem } from "../models/laundry.model.js";
import { ConsumptionStatus } from "../models/service.model.js";
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

function toConsumptionStatus(estado: EstadoLavanderia): ConsumptionStatus {
  if (estado === "Cancelado") return "Cancelado";
  if (estado === "Pendiente") return "Registrado";
  if (estado === "En proceso") return "EnProceso";
  return "Entregado";
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

  private async assertNoIssuedInvoice(transaction: Transaction, stayId: number): Promise<void> {
    const result = await transaction.execute({
      sql: `SELECT 1 FROM invoices
            WHERE stay_id = ? AND status IN ('Emitida', 'Parcial', 'Pagada')
            LIMIT 1;`,
      args: [stayId],
    });
    if (result.rows[0]) {
      throw {
        statusCode: 409,
        code: "INVOICE_ISSUED",
        message: "La estancia tiene una factura emitida; anúlala antes de modificar sus cargos",
      };
    }
  }

  public async create(order: Omit<LaundryModel, "id">): Promise<LaundryModel> {
    const transaction = await dbClient.transaction("write");
    const now = new Date().toISOString();
    let orderId = 0;
    try {
      let customerId = order.customerId;
      if (order.stayId) {
        const stay = await transaction.execute({
          sql: "SELECT customer_id, estado FROM stays WHERE id = ? LIMIT 1;",
          args: [order.stayId],
        });
        if (!stay.rows[0]) {
          throw { statusCode: 404, code: "NOT_FOUND", message: "Estancia no encontrada" };
        }
        if (String(stay.rows[0].estado) !== "Activa") {
          throw { statusCode: 409, code: "STAY_NOT_ACTIVE", message: "La estancia no está activa" };
        }
        customerId = Number(stay.rows[0].customer_id);
        await this.assertNoIssuedInvoice(transaction, order.stayId);
      }

      const inserted = await transaction.execute({
        sql: `INSERT INTO laundry_orders (
                huesped, habitacion, prendas, total_prendas, total, estado, fecha,
                observaciones, customer_id, stay_id, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          order.huesped,
          order.habitacion,
          JSON.stringify(order.prendas),
          order.totalPrendas,
          order.total,
          order.estado,
          order.fecha,
          order.observaciones,
          customerId ?? null,
          order.stayId ?? null,
          order.createdBy ?? null,
        ],
      });
      orderId = Number(inserted.lastInsertRowid);

      if (order.stayId && customerId && order.createdBy) {
        const consumption = await transaction.execute({
          sql: `INSERT INTO service_consumptions (
                  stay_id, customer_id, service_id, cantidad, precio_unitario_cents, subtotal_cents,
                  estado, observaciones, source_type, source_id, consumed_at, created_by, created_at, updated_at
                ) VALUES (?, ?, 2, ?, 50, ?, ?, ?, 'LAUNDRY_ORDER', ?, ?, ?, ?, ?);`,
          args: [
            order.stayId,
            customerId,
            order.totalPrendas,
            Math.round(order.total * 100),
            toConsumptionStatus(order.estado),
            order.observaciones,
            orderId,
            now,
            order.createdBy,
            now,
            now,
          ],
        });
        const consumptionId = Number(consumption.lastInsertRowid);
        await transaction.execute({
          sql: "UPDATE laundry_orders SET service_consumption_id = ? WHERE id = ?;",
          args: [consumptionId, orderId],
        });
      }
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return (await this.findById(orderId))!;
  }

  public async save(order: LaundryModel): Promise<void> {
    const prendasJson = JSON.stringify(order.prendas || []);
    const transaction = await dbClient.transaction("write");
    try {
      if (order.stayId) await this.assertNoIssuedInvoice(transaction, order.stayId);
      const updated = await transaction.execute({
        sql: `UPDATE laundry_orders SET
                huesped = ?, habitacion = ?, prendas = ?, total_prendas = ?, total = ?, estado = ?, fecha = ?,
                observaciones = ?, customer_id = ?, stay_id = ?, service_consumption_id = ?, created_by = ?
              WHERE id = ?;`,
        args: [
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
          order.id,
        ],
      });
      if (updated.rowsAffected === 0) {
        throw { statusCode: 404, code: "NOT_FOUND", message: "Solicitud de lavandería no encontrada" };
      }

      if (order.serviceConsumptionId) {
        await transaction.execute({
          sql: `UPDATE service_consumptions SET estado = ?, cantidad = ?, precio_unitario_cents = 50,
                  subtotal_cents = ?, observaciones = ?, updated_at = ? WHERE id = ?;`,
          args: [
            toConsumptionStatus(order.estado),
            order.totalPrendas,
            Math.round(order.total * 100),
            order.observaciones,
            new Date().toISOString(),
            order.serviceConsumptionId,
          ],
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
