import { FoodOrderModel, EstadoPedido } from "../models/food-order.model.js";
import { dbClient } from "../db/client.js";

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
        sql: `SELECT * FROM food_orders
              WHERE LOWER(order_code) LIKE ?
                 OR LOWER(huesped) LIKE ?
                 OR LOWER(habitacion) LIKE ?
                 OR LOWER(productos) LIKE ?
              ORDER BY id ASC;`,
        args: [term, term, term, term],
      });
      return result.rows.map(mapRowToFoodOrder);
    }

    const result = await dbClient.execute(`SELECT * FROM food_orders ORDER BY id ASC;`);
    return result.rows.map(mapRowToFoodOrder);
  }

  public async findById(id: number): Promise<FoodOrderModel | null> {
    const result = await dbClient.execute({
      sql: `SELECT * FROM food_orders WHERE id = ? LIMIT 1;`,
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return mapRowToFoodOrder(result.rows[0]);
  }

  public async save(order: FoodOrderModel): Promise<void> {
    await dbClient.execute({
      sql: `INSERT INTO food_orders (id, order_code, huesped, habitacion, productos, total, estado, fecha,
              customer_id, stay_id, service_consumption_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              order_code = excluded.order_code,
              huesped = excluded.huesped,
              habitacion = excluded.habitacion,
              productos = excluded.productos,
              total = excluded.total,
              estado = excluded.estado,
              fecha = excluded.fecha,
              customer_id = excluded.customer_id,
              stay_id = excluded.stay_id,
              service_consumption_id = excluded.service_consumption_id,
              created_by = excluded.created_by;`,
      args: [
        order.id,
        order.orderCode,
        order.huesped,
        order.habitacion,
        order.productos,
        order.total,
        order.estado,
        order.fecha,
        order.customerId ?? null,
        order.stayId ?? null,
        order.serviceConsumptionId ?? null,
        order.createdBy ?? null,
      ],
    });

    if (order.serviceConsumptionId) {
      const status = order.estado === "Cancelado"
        ? "Cancelado"
        : order.estado === "Pendiente"
          ? "Registrado"
          : order.estado === "En preparación"
            ? "EnProceso"
            : "Entregado";
      await dbClient.execute({
        sql: `UPDATE service_consumptions SET estado = ?, precio_unitario_cents = ?, subtotal_cents = ?,
                observaciones = ?, updated_at = ? WHERE id = ?;`,
        args: [status, Math.round(order.total * 100), Math.round(order.total * 100), order.productos, new Date().toISOString(), order.serviceConsumptionId],
      });
    }
  }

  public async saveWithConsumption(order: FoodOrderModel): Promise<void> {
    if (!order.stayId || !order.customerId || !order.createdBy) {
      await this.save(order);
      return;
    }
    const transaction = await dbClient.transaction("write");
    const now = new Date().toISOString();
    try {
      await transaction.execute({
        sql: `INSERT INTO food_orders (id, order_code, huesped, habitacion, productos, total, estado, fecha,
                customer_id, stay_id, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [order.id, order.orderCode, order.huesped, order.habitacion, order.productos, order.total,
          order.estado, order.fecha, order.customerId, order.stayId, order.createdBy],
      });
      const consumption = await transaction.execute({
        sql: `INSERT INTO service_consumptions (
                stay_id, customer_id, service_id, cantidad, precio_unitario_cents, subtotal_cents,
                estado, observaciones, source_type, source_id, consumed_at, created_by, created_at, updated_at
              ) VALUES (?, ?, 1, 1, ?, ?, 'Registrado', ?, 'FOOD_ORDER', ?, ?, ?, ?, ?);`,
        args: [order.stayId, order.customerId, Math.round(order.total * 100), Math.round(order.total * 100),
          order.productos, order.id, now, order.createdBy, now, now],
      });
      order.serviceConsumptionId = Number(consumption.lastInsertRowid);
      await transaction.execute({
        sql: "UPDATE food_orders SET service_consumption_id = ? WHERE id = ?;",
        args: [order.serviceConsumptionId, order.id],
      });
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; }
    finally { transaction.close(); }
  }

  public async countPending(): Promise<number> {
    const result = await dbClient.execute(`
      SELECT COUNT(*) as count FROM food_orders
      WHERE estado IN ('Pendiente', 'En preparación');
    `);
    return Number(result.rows[0].count);
  }

  public async delete(id: number): Promise<boolean> {
    const result = await dbClient.execute({
      sql: `DELETE FROM food_orders WHERE id = ?;`,
      args: [id],
    });
    return result.rowsAffected > 0;
  }
}
