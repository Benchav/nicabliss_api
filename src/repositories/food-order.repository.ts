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
              ORDER BY id DESC;`,
        args: [term, term, term, term],
      });
      return result.rows.map(mapRowToFoodOrder);
    }

    const result = await dbClient.execute(`SELECT * FROM food_orders ORDER BY id DESC;`);
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
      sql: `INSERT INTO food_orders (id, order_code, huesped, habitacion, productos, total, estado, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              order_code = excluded.order_code,
              huesped = excluded.huesped,
              habitacion = excluded.habitacion,
              productos = excluded.productos,
              total = excluded.total,
              estado = excluded.estado,
              fecha = excluded.fecha;`,
      args: [
        order.id,
        order.orderCode,
        order.huesped,
        order.habitacion,
        order.productos,
        order.total,
        order.estado,
        order.fecha,
      ],
    });
  }

  public async countPending(): Promise<number> {
    const result = await dbClient.execute(`
      SELECT COUNT(*) as count FROM food_orders
      WHERE estado IN ('Pendiente', 'En preparación');
    `);
    return Number(result.rows[0].count);
  }
}
