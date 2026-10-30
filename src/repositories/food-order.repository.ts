import { FoodOrderModel, EstadoPedido } from "../models/food-order.model.js";
import { dbClient } from "../db/client.js";
import { toConsumptionStatus } from "../utils/food-order-status.js";

const foodOrderSelect = `
  SELECT fo.*, r.codigo_reserva AS reservation_code
  FROM food_orders fo
  LEFT JOIN reservations r ON r.id = fo.reservation_id`;

function mapRowToFoodOrder(row: any): FoodOrderModel {
  return {
    id: Number(row.id),
    orderCode: String(row.order_code),
    huesped: String(row.huesped),
    habitacion: String(row.habitacion),
    productos: String(row.productos),
    total: Number(row.total),
    estado: row.estado as EstadoPedido,
    fecha: String(row.fecha),
    customerId: row.customer_id ? Number(row.customer_id) : undefined,
    reservationId: row.reservation_id ? Number(row.reservation_id) : undefined,
    reservationCode: row.reservation_code ? String(row.reservation_code) : undefined,
    stayId: row.stay_id ? Number(row.stay_id) : undefined,
    serviceConsumptionId: row.service_consumption_id ? Number(row.service_consumption_id) : undefined,
    createdBy: row.created_by ? String(row.created_by) : undefined,
  };
}

export class FoodOrderRepository {
  public async findAll(search?: string): Promise<FoodOrderModel[]> {
    if (search && search.trim().length > 0) {
      const term = `%${search.toLowerCase().trim()}%`;
      const result = await dbClient.execute({
        sql: `${foodOrderSelect}
              WHERE LOWER(fo.order_code) LIKE ?
                 OR LOWER(fo.huesped) LIKE ?
                 OR LOWER(fo.habitacion) LIKE ?
                 OR LOWER(fo.productos) LIKE ?
                 OR LOWER(COALESCE(r.codigo_reserva, '')) LIKE ?
              ORDER BY fo.id ASC;`,
        args: [term, term, term, term, term],
      });
      return result.rows.map(mapRowToFoodOrder);
    }

    const result = await dbClient.execute(`${foodOrderSelect} ORDER BY fo.id ASC;`);
    return result.rows.map(mapRowToFoodOrder);
  }

  public async findById(id: number): Promise<FoodOrderModel | null> {
    const result = await dbClient.execute({
      sql: `${foodOrderSelect} WHERE fo.id = ? LIMIT 1;`,
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return mapRowToFoodOrder(result.rows[0]);
  }

  public async create(order: Omit<FoodOrderModel, "id">): Promise<FoodOrderModel> {
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
      }

      const inserted = await transaction.execute({
        sql: `INSERT INTO food_orders (
                order_code, huesped, habitacion, productos, total, estado, fecha,
                customer_id, reservation_id, stay_id, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [
          order.orderCode,
          order.huesped,
          order.habitacion,
          order.productos,
          order.total,
          order.estado,
          order.fecha,
          customerId ?? null,
          order.reservationId ?? null,
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
                ) VALUES (?, ?, 1, 1, ?, ?, ?, ?, 'FOOD_ORDER', ?, ?, ?, ?, ?);`,
          args: [
            order.stayId,
            customerId,
            Math.round(order.total * 100),
            Math.round(order.total * 100),
            toConsumptionStatus(order.estado),
            order.productos,
            orderId,
            now,
            order.createdBy,
            now,
            now,
          ],
        });
        const consumptionId = Number(consumption.lastInsertRowid);
        await transaction.execute({
          sql: "UPDATE food_orders SET service_consumption_id = ? WHERE id = ?;",
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

  public async save(order: FoodOrderModel): Promise<void> {
    const transaction = await dbClient.transaction("write");
    try {
      const updated = await transaction.execute({
        sql: `UPDATE food_orders SET
                order_code = ?, huesped = ?, habitacion = ?, productos = ?, total = ?, estado = ?, fecha = ?,
                customer_id = ?, reservation_id = ?, stay_id = ?, service_consumption_id = ?, created_by = ?
              WHERE id = ?;`,
        args: [
          order.orderCode,
          order.huesped,
          order.habitacion,
          order.productos,
          order.total,
          order.estado,
          order.fecha,
          order.customerId ?? null,
          order.reservationId ?? null,
          order.stayId ?? null,
          order.serviceConsumptionId ?? null,
          order.createdBy ?? null,
          order.id,
        ],
      });
      if (updated.rowsAffected === 0) {
        throw { statusCode: 404, code: "NOT_FOUND", message: "Pedido de alimentos no encontrado" };
      }

      if (order.serviceConsumptionId) {
        await transaction.execute({
          sql: `UPDATE service_consumptions SET estado = ?, precio_unitario_cents = ?, subtotal_cents = ?,
                  observaciones = ?, updated_at = ? WHERE id = ?;`,
          args: [
            toConsumptionStatus(order.estado),
            Math.round(order.total * 100),
            Math.round(order.total * 100),
            order.productos,
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

  public async hasIssuedInvoiceForStay(stayId: number): Promise<boolean> {
    const result = await dbClient.execute({
      sql: `SELECT 1 FROM invoices
            WHERE stay_id = ? AND status IN ('Emitida', 'Parcial', 'Pagada')
            LIMIT 1;`,
      args: [stayId],
    });
    return result.rows.length > 0;
  }

  public async countPending(): Promise<number> {
    const result = await dbClient.execute(`
      SELECT COUNT(*) as count FROM food_orders
      WHERE estado IN ('Pendiente', 'En preparación');
    `);
    return Number(result.rows[0].count);
  }

  public async delete(id: number): Promise<boolean> {
    const linked = await dbClient.execute({
      sql: "SELECT service_consumption_id FROM food_orders WHERE id = ? LIMIT 1;",
      args: [id],
    });
    if (linked.rows[0]?.service_consumption_id) {
      throw {
        statusCode: 409,
        code: "LINKED_CONSUMPTION",
        message: "Un pedido ligado a una estancia no puede eliminarse; debe cancelarse",
      };
    }
    const result = await dbClient.execute({
      sql: `DELETE FROM food_orders WHERE id = ?;`,
      args: [id],
    });
    return result.rowsAffected > 0;
  }
}
