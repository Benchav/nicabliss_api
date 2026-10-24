import { CashSessionModel, CashMovementModel, MetodoPago, TipoMovimiento, ConceptoMovimiento } from "../models/cash.model.js";
import { dbClient } from "../db/client.js";

function mapRowToMovement(row: any): CashMovementModel {
  return {
    id: Number(row.id),
    fecha: String(row.fecha),
    tipo: row.tipo as TipoMovimiento,
    concepto: row.concepto as ConceptoMovimiento,
    descripcion: String(row.descripcion || ""),
    metodo: row.metodo as MetodoPago,
    monto: Number(row.monto),
  };
}

function mapRowToSession(row: any, movimientos: CashMovementModel[] = []): CashSessionModel {
  return {
    id: Number(row.id),
    responsable: String(row.responsable),
    apertura: String(row.apertura),
    cierre: row.cierre ? String(row.cierre) : undefined,
    fondoInicial: Number(row.fondo_inicial),
    ingresosEfectivo: Number(row.ingresos_efectivo),
    ingresosDigitales: Number(row.ingresos_digitales),
    salidasEfectivo: Number(row.salidas_efectivo),
    efectivoEsperado: Number(row.efectivo_esperado),
    efectivoContado: row.efectivo_contado !== null && row.efectivo_contado !== undefined ? Number(row.efectivo_contado) : undefined,
    diferencia: row.diferencia !== null && row.diferencia !== undefined ? Number(row.diferencia) : undefined,
    observaciones: String(row.observaciones || ""),
    isClosed: Number(row.is_closed) === 1,
    movimientos,
  };
}

export class CashRepository {
  public async getCurrentSession(): Promise<CashSessionModel | null> {
    const result = await dbClient.execute(`SELECT * FROM cash_sessions WHERE is_closed = 0 LIMIT 1;`);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const movementsResult = await dbClient.execute({
      sql: `SELECT * FROM cash_movements WHERE session_id = ? ORDER BY id DESC;`,
      args: [row.id],
    });
    const movimientos = movementsResult.rows.map(mapRowToMovement);
    return mapRowToSession(row, movimientos);
  }

  public async saveCurrentSession(session: CashSessionModel | null): Promise<void> {
    if (!session) return;

    const statements: any[] = [
      {
        sql: `INSERT INTO cash_sessions (
          id, responsable, apertura, cierre, fondo_inicial, ingresos_efectivo,
          ingresos_digitales, salidas_efectivo, efectivo_esperado, efectivo_contado,
          diferencia, observaciones, is_closed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          responsable = excluded.responsable,
          apertura = excluded.apertura,
          cierre = excluded.cierre,
          fondo_inicial = excluded.fondo_inicial,
          ingresos_efectivo = excluded.ingresos_efectivo,
          ingresos_digitales = excluded.ingresos_digitales,
          salidas_efectivo = excluded.salidas_efectivo,
          efectivo_esperado = excluded.efectivo_esperado,
          efectivo_contado = excluded.efectivo_contado,
          diferencia = excluded.diferencia,
          observaciones = excluded.observaciones,
          is_closed = excluded.is_closed;`,
        args: [
          session.id,
          session.responsable,
          session.apertura,
          session.cierre ?? null,
          session.fondoInicial,
          session.ingresosEfectivo,
          session.ingresosDigitales,
          session.salidasEfectivo,
          session.efectivoEsperado,
          session.efectivoContado ?? null,
          session.diferencia ?? null,
          session.observaciones,
          session.isClosed ? 1 : 0,
        ],
      },
    ];

    for (const m of session.movimientos) {
      statements.push({
        sql: `INSERT INTO cash_movements (id, session_id, fecha, tipo, concepto, descripcion, metodo, monto)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                fecha = excluded.fecha,
                tipo = excluded.tipo,
                concepto = excluded.concepto,
                descripcion = excluded.descripcion,
                metodo = excluded.metodo,
                monto = excluded.monto;`,
        args: [m.id, session.id, m.fecha, m.tipo, m.concepto, m.descripcion, m.metodo, m.monto],
      });
    }

    await dbClient.batch(statements, "write");
  }

  public async addHistory(session: CashSessionModel): Promise<void> {
    await this.saveCurrentSession({ ...session, isClosed: true });
  }

  public async getHistory(): Promise<CashSessionModel[]> {
    const result = await dbClient.execute(`SELECT * FROM cash_sessions WHERE is_closed = 1 ORDER BY id DESC;`);
    const history: CashSessionModel[] = [];

    for (const row of result.rows) {
      const movementsResult = await dbClient.execute({
        sql: `SELECT * FROM cash_movements WHERE session_id = ? ORDER BY id DESC;`,
        args: [row.id],
      });
      const movimientos = movementsResult.rows.map(mapRowToMovement);
      history.push(mapRowToSession(row, movimientos));
    }

    return history;
  }

  public async reset(): Promise<void> {
    const now = new Date().toISOString();
    await dbClient.batch([
      {
        sql: `DELETE FROM cash_movements
              WHERE session_id IN (SELECT id FROM cash_sessions WHERE is_closed = 0)
                AND payment_id IS NULL;`,
        args: [],
      },
      {
        sql: `DELETE FROM cash_sessions
              WHERE is_closed = 0
                AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.cash_session_id = cash_sessions.id);`,
        args: [],
      },
      {
        sql: `UPDATE cash_sessions
              SET is_closed = 1,
                  cierre = COALESCE(cierre, ?),
                  efectivo_contado = COALESCE(efectivo_contado, efectivo_esperado),
                  diferencia = COALESCE(diferencia, 0),
                  observaciones = CASE
                    WHEN observaciones = '' THEN 'Cierre automático de aislamiento de pruebas'
                    ELSE observaciones END
              WHERE is_closed = 0;`,
        args: [now],
      },
    ], "write");
  }
}
