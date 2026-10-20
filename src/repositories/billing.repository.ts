import { BillingModel, EstadoCobro } from "../models/billing.model.js";
import { dbClient } from "../db/client.js";

function mapRowToBilling(row: any): BillingModel {
  return {
    id: Number(row.id),
    huesped: String(row.huesped),
    habitacion: String(row.habitacion),
    concepto: String(row.concepto),
    total: Number(row.total),
    pagado: Number(row.pagado),
    saldo: Number(row.saldo),
    estado: row.estado as EstadoCobro,
    fecha: String(row.fecha),
  };
}

export class BillingRepository {
  public async findAll(search?: string): Promise<BillingModel[]> {
    if (search && search.trim().length > 0) {
      const term = `%${search.toLowerCase().trim()}%`;
      const result = await dbClient.execute({
        sql: `SELECT * FROM billing_accounts
              WHERE LOWER(huesped) LIKE ?
                 OR LOWER(habitacion) LIKE ?
                 OR LOWER(concepto) LIKE ?
              ORDER BY id ASC;`,
        args: [term, term, term],
      });
      return result.rows.map(mapRowToBilling);
    }

    const result = await dbClient.execute(`SELECT * FROM billing_accounts ORDER BY id ASC;`);
    return result.rows.map(mapRowToBilling);
  }

  public async findById(id: number): Promise<BillingModel | null> {
    const result = await dbClient.execute({
      sql: `SELECT * FROM billing_accounts WHERE id = ? LIMIT 1;`,
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return mapRowToBilling(result.rows[0]);
  }

  public async save(account: BillingModel): Promise<void> {
    await dbClient.execute({
      sql: `INSERT INTO billing_accounts (id, huesped, habitacion, concepto, total, pagado, saldo, estado, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              huesped = excluded.huesped,
              habitacion = excluded.habitacion,
              concepto = excluded.concepto,
              total = excluded.total,
              pagado = excluded.pagado,
              saldo = excluded.saldo,
              estado = excluded.estado,
              fecha = excluded.fecha;`,
      args: [
        account.id,
        account.huesped,
        account.habitacion,
        account.concepto,
        account.total,
        account.pagado,
        account.saldo,
        account.estado,
        account.fecha,
      ],
    });
  }

  public async getTotals(): Promise<{ totalFacturado: number; totalCobrado: number; saldoPendiente: number }> {
    const result = await dbClient.execute(`
      SELECT 
        COALESCE(SUM(total), 0) as facturado,
        COALESCE(SUM(pagado), 0) as cobrado
      FROM billing_accounts;
    `);

    const facturado = Number(result.rows[0].facturado);
    const cobrado = Number(result.rows[0].cobrado);

    return {
      totalFacturado: Number(facturado.toFixed(2)),
      totalCobrado: Number(cobrado.toFixed(2)),
      saldoPendiente: Number((facturado - cobrado).toFixed(2)),
    };
  }

  public async delete(id: number): Promise<boolean> {
    const result = await dbClient.execute({
      sql: `DELETE FROM billing_accounts WHERE id = ?;`,
      args: [id],
    });
    return result.rowsAffected > 0;
  }

  public async reset(): Promise<void> {
    await dbClient.execute(`DELETE FROM billing_accounts WHERE id NOT IN (1001, 1002, 1003);`);
    await dbClient.execute(`
      UPDATE billing_accounts 
      SET total = 40, pagado = 40, saldo = 0, estado = 'Pagado' 
      WHERE id = 1001;
    `);
    await dbClient.execute(`
      UPDATE billing_accounts 
      SET total = 12.5, pagado = 0, saldo = 12.5, estado = 'Pendiente' 
      WHERE id = 1002;
    `);
  }
}
