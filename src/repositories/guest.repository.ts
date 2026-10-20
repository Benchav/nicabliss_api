import { GuestModel, EstadoEstancia } from "../models/guest.model.js";
import { dbClient } from "../db/client.js";

function mapRowToGuest(row: any): GuestModel {
  return {
    id: Number(row.id),
    nombre: String(row.nombre),
    documento: String(row.documento),
    habitacion: String(row.habitacion),
    entrada: String(row.entrada),
    salida: String(row.salida),
    estado: row.estado as EstadoEstancia,
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

export class GuestRepository {
  public async findAll(search?: string): Promise<GuestModel[]> {
    if (search && search.trim().length > 0) {
      const term = `%${search.toLowerCase().trim()}%`;
      const result = await dbClient.execute({
        sql: `SELECT * FROM guests
              WHERE LOWER(nombre) LIKE ?
                 OR LOWER(documento) LIKE ?
                 OR LOWER(habitacion) LIKE ?
              ORDER BY id ASC;`,
        args: [term, term, term],
      });
      return result.rows.map(mapRowToGuest);
    }

    const result = await dbClient.execute(`SELECT * FROM guests ORDER BY id ASC;`);
    return result.rows.map(mapRowToGuest);
  }

  public async findById(id: number): Promise<GuestModel | null> {
    const result = await dbClient.execute({
      sql: `SELECT * FROM guests WHERE id = ? LIMIT 1;`,
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return mapRowToGuest(result.rows[0]);
  }

  public async save(guest: GuestModel): Promise<void> {
    await dbClient.execute({
      sql: `INSERT INTO guests (id, nombre, documento, habitacion, entrada, salida, estado, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              nombre = excluded.nombre,
              documento = excluded.documento,
              habitacion = excluded.habitacion,
              entrada = excluded.entrada,
              salida = excluded.salida,
              estado = excluded.estado;`,
      args: [
        guest.id,
        guest.nombre,
        guest.documento,
        guest.habitacion,
        guest.entrada,
        guest.salida,
        guest.estado,
        guest.createdAt || new Date().toISOString(),
      ],
    });
  }

  public async delete(id: number): Promise<boolean> {
    const result = await dbClient.execute({
      sql: `DELETE FROM guests WHERE id = ?;`,
      args: [id],
    });
    return result.rowsAffected > 0;
  }
}
