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
    await dbClient.execute({
      sql: `INSERT INTO laundry_orders (id, huesped, habitacion, prendas, total_prendas, total, estado, fecha, observaciones)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              huesped = excluded.huesped,
              habitacion = excluded.habitacion,
              prendas = excluded.prendas,
              total_prendas = excluded.total_prendas,
              total = excluded.total,
              estado = excluded.estado,
              fecha = excluded.fecha,
              observaciones = excluded.observaciones;`,
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
      ],
    });
  }

  public async countPending(): Promise<number> {
    const result = await dbClient.execute(`
      SELECT COUNT(*) as count FROM laundry_orders
      WHERE estado IN ('Pendiente', 'En proceso');
    `);
    return Number(result.rows[0].count);
  }
}
