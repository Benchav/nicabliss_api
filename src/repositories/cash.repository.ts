import type { Client, Transaction } from "@libsql/client";
import { CashSessionModel, CashMovementModel, MetodoPago, TipoMovimiento, ConceptoMovimiento } from "../models/cash.model.js";
import { dbClient } from "../db/client.js";
import { assertTestDatabase } from "../db/test-database-guard.js";
import { centsToMoney, parseMoneyToCents } from "../utils/money.js";

type DbExecutor = Client | Transaction;

function mapRowToMovement(row: any): CashMovementModel {
  return {
    id: Number(row.id),
    fecha: String(row.fecha),
    tipo: row.tipo as TipoMovimiento,
    concepto: row.concepto as ConceptoMovimiento,
    descripcion: String(row.descripcion || ""),
    metodo: row.metodo as MetodoPago,
    monto: Number(row.monto),
    paymentId: row.payment_id ? Number(row.payment_id) : undefined,
    customerId: row.customer_id ? Number(row.customer_id) : undefined,
    reservationId: row.reservation_id ? Number(row.reservation_id) : undefined,
    invoiceId: row.invoice_id ? Number(row.invoice_id) : undefined,
    createdBy: row.created_by ? String(row.created_by) : undefined,
    createdByName: row.created_by_name ? String(row.created_by_name) : undefined,
    source: row.source ? String(row.source) as CashMovementModel["source"] : undefined,
  };
}

function mapRowToSession(row: any, movimientos: CashMovementModel[] = []): CashSessionModel {
  return {
    id: Number(row.id),
    responsable: String(row.responsable),
    openedBy: row.opened_by ? String(row.opened_by) : undefined,
    openedByName: row.opened_by_name ? String(row.opened_by_name) : undefined,
    closedBy: row.closed_by ? String(row.closed_by) : undefined,
    closedByName: row.closed_by_name ? String(row.closed_by_name) : undefined,
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
  private readonly sessionSelect = `
    SELECT cs.*, opener.full_name AS opened_by_name, closer.full_name AS closed_by_name
    FROM cash_sessions cs
    LEFT JOIN users opener ON opener.id = cs.opened_by
    LEFT JOIN users closer ON closer.id = cs.closed_by`;

  public async getCurrentSession(executor: DbExecutor = dbClient): Promise<CashSessionModel | null> {
    const result = await executor.execute({
      sql: `${this.sessionSelect} WHERE cs.is_closed = 0 LIMIT 1;`,
      args: [],
    });
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const movementsResult = await executor.execute({
      sql: `SELECT cm.*, u.full_name AS created_by_name
            FROM cash_movements cm
            LEFT JOIN users u ON u.id = cm.created_by
            WHERE cm.session_id = ? ORDER BY cm.id DESC;`,
      args: [row.id],
    });
    const movimientos = movementsResult.rows.map(mapRowToMovement);
    return mapRowToSession(row, movimientos);
  }

  public async getSessionById(id: number, executor: DbExecutor = dbClient): Promise<CashSessionModel | null> {
    const result = await executor.execute({
      sql: `${this.sessionSelect} WHERE cs.id = ? LIMIT 1;`,
      args: [id],
    });
    if (!result.rows[0]) return null;
    const movementsResult = await executor.execute({
      sql: `SELECT cm.*, u.full_name AS created_by_name
            FROM cash_movements cm
            LEFT JOIN users u ON u.id = cm.created_by
            WHERE cm.session_id = ? ORDER BY cm.id DESC;`,
      args: [id],
    });
    return mapRowToSession(result.rows[0], movementsResult.rows.map(mapRowToMovement));
  }

  public async openSession(
    session: Omit<CashSessionModel, "id" | "movimientos" | "openedBy"> & { openedBy: string },
    ipAddress?: string
  ): Promise<CashSessionModel> {
    const transaction = await dbClient.transaction("write");
    let sessionId = 0;
    try {
      const inserted = await transaction.execute({
        sql: `INSERT INTO cash_sessions (
                responsable, apertura, fondo_inicial, ingresos_efectivo, ingresos_digitales,
                salidas_efectivo, efectivo_esperado, observaciones, is_closed, opened_by
              ) VALUES (?, ?, ?, 0, 0, 0, ?, '', 0, ?);`,
        args: [session.responsable, session.apertura, session.fondoInicial, session.efectivoEsperado, session.openedBy],
      });
      sessionId = Number(inserted.lastInsertRowid);
      await transaction.execute({
        sql: `INSERT INTO audit_logs (
                user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at
              ) VALUES (?, 'OPEN', 'cash_session', ?, NULL, ?, ?, ?);`,
        args: [
          session.openedBy,
          String(sessionId),
          JSON.stringify({ openedBy: session.openedBy, responsable: session.responsable, fondoInicial: session.fondoInicial }),
          ipAddress ?? null,
          new Date().toISOString(),
        ],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      if (String(error).includes("idx_unique_active_cash_session") || String(error).includes("cash_sessions.is_closed")) {
        throw { statusCode: 409, code: "CASH_SESSION_ALREADY_OPEN", message: "Ya existe una caja abierta. Actualiza la pantalla para consultar al responsable." };
      }
      throw error;
    } finally {
      transaction.close();
    }
    const opened = await this.getSessionById(sessionId);
    if (!opened) throw new Error("No se pudo recuperar la sesión de caja recién abierta");
    return opened;
  }

  public async addManualMovement(
    sessionId: number,
    movement: Omit<CashMovementModel, "id">,
    userId: string,
    ipAddress?: string,
    idempotencyKey?: string
  ): Promise<CashSessionModel> {
    const transaction = await dbClient.transaction("write");
    try {
      if (idempotencyKey) {
        const duplicate = await transaction.execute({
          sql: "SELECT * FROM cash_movements WHERE idempotency_key = ? LIMIT 1;",
          args: [idempotencyKey],
        });
        if (duplicate.rows[0]) {
          const existing = duplicate.rows[0];
          const sameRequest = Number(existing.session_id) === sessionId
            && String(existing.created_by) === userId
            && String(existing.tipo) === movement.tipo
            && String(existing.concepto) === movement.concepto
            && String(existing.descripcion) === movement.descripcion
            && String(existing.metodo) === movement.metodo
            && parseMoneyToCents(Number(existing.monto)) === parseMoneyToCents(movement.monto);
          if (!sameRequest) {
            throw { statusCode: 409, code: "IDEMPOTENCY_CONFLICT", message: "La clave de idempotencia ya fue utilizada con otros datos" };
          }
          await transaction.rollback();
          const priorSession = await this.getSessionById(Number(existing.session_id));
          if (!priorSession) throw new Error("No se pudo recuperar el movimiento previamente registrado");
          return priorSession;
        }
      }

      const current = await transaction.execute({
        sql: "SELECT opened_by, efectivo_esperado FROM cash_sessions WHERE id = ? AND is_closed = 0 LIMIT 1;",
        args: [sessionId],
      });
      if (!current.rows[0]) {
        throw { statusCode: 409, code: "CASH_SESSION_REQUIRED", message: "No hay una caja abierta para registrar movimientos" };
      }
      if (String(current.rows[0].opened_by ?? "") !== userId) {
        throw { statusCode: 403, code: "CASH_SESSION_OWNER_REQUIRED", message: "Solo el responsable de la caja abierta puede registrar movimientos" };
      }

      const amountCents = parseMoneyToCents(movement.monto);
      const expectedCashCents = parseMoneyToCents(Number(current.rows[0].efectivo_esperado));
      if (movement.tipo === "Salida" && movement.metodo === "Efectivo" && amountCents > expectedCashCents) {
        throw { statusCode: 409, code: "INSUFFICIENT_CASH", message: "La salida supera el efectivo disponible en caja" };
      }

      const inserted = await transaction.execute({
        sql: `INSERT INTO cash_movements (
                session_id, fecha, tipo, concepto, descripcion, metodo, monto,
                created_by, source, idempotency_key
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?);`,
        args: [
          sessionId,
          movement.fecha,
          movement.tipo,
          movement.concepto,
          movement.descripcion,
          movement.metodo,
          centsToMoney(amountCents),
          userId,
          idempotencyKey ?? null,
        ],
      });

      if (movement.tipo === "Ingreso" && movement.metodo === "Efectivo") {
        await transaction.execute({
          sql: `UPDATE cash_sessions SET ingresos_efectivo = ingresos_efectivo + ?,
                  efectivo_esperado = efectivo_esperado + ? WHERE id = ? AND is_closed = 0;`,
          args: [centsToMoney(amountCents), centsToMoney(amountCents), sessionId],
        });
      } else if (movement.tipo === "Ingreso") {
        await transaction.execute({
          sql: "UPDATE cash_sessions SET ingresos_digitales = ingresos_digitales + ? WHERE id = ? AND is_closed = 0;",
          args: [centsToMoney(amountCents), sessionId],
        });
      } else if (movement.metodo === "Efectivo") {
        await transaction.execute({
          sql: `UPDATE cash_sessions SET salidas_efectivo = salidas_efectivo + ?,
                  efectivo_esperado = efectivo_esperado - ? WHERE id = ? AND is_closed = 0;`,
          args: [centsToMoney(amountCents), centsToMoney(amountCents), sessionId],
        });
      }

      await transaction.execute({
        sql: `INSERT INTO audit_logs (
                user_id, action, entity, entity_id, new_values, ip_address, created_at
              ) VALUES (?, 'CREATE', 'cash_movement', ?, ?, ?, ?);`,
        args: [
          userId,
          String(inserted.lastInsertRowid),
          JSON.stringify({ sessionId, ...movement, monto: centsToMoney(amountCents) }),
          ipAddress ?? null,
          new Date().toISOString(),
        ],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }

    const updated = await this.getSessionById(sessionId);
    if (!updated) throw new Error("No se pudo recuperar la sesión de caja actualizada");
    return updated;
  }

  public async closeWithAudit(
    session: CashSessionModel,
    userId: string,
    ipAddress: string | undefined,
    transaction: Transaction,
    adminOverride: boolean
  ): Promise<void> {
    const createdAt = new Date().toISOString();
    const updated = await transaction.execute({
      sql: `UPDATE cash_sessions SET
              cierre = ?, efectivo_contado = ?, diferencia = ?, observaciones = ?,
              closed_by = ?, is_closed = 1
            WHERE id = ? AND is_closed = 0;`,
      args: [session.cierre ?? null, session.efectivoContado ?? null, session.diferencia ?? null,
        session.observaciones, userId, session.id],
    });
    if (updated.rowsAffected !== 1) {
      throw { statusCode: 409, code: "CASH_SESSION_CHANGED", message: "La caja ya fue cerrada o cambió durante la operación" };
    }
    await transaction.execute({
      sql: `INSERT INTO audit_logs (
              user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at
            ) VALUES (?, ?, 'cash_session', ?, ?, ?, ?, ?);`,
      args: [
        userId,
        adminOverride ? "CLOSE_ADMIN_OVERRIDE" : "CLOSE",
        String(session.id),
        JSON.stringify({ isClosed: false, openedBy: session.openedBy }),
        JSON.stringify({
          isClosed: true,
          closedBy: userId,
          efectivoEsperado: session.efectivoEsperado,
          efectivoContado: session.efectivoContado,
          diferencia: session.diferencia,
          observaciones: session.observaciones,
        }),
        ipAddress ?? null,
        createdAt,
      ],
    });
  }

  public async getHistory(): Promise<CashSessionModel[]> {
    const result = await dbClient.execute({
      sql: `${this.sessionSelect} WHERE cs.is_closed = 1 ORDER BY cs.id DESC;`,
      args: [],
    });
    const history: CashSessionModel[] = [];

    for (const row of result.rows) {
      const movementsResult = await dbClient.execute({
        sql: `SELECT cm.*, u.full_name AS created_by_name
              FROM cash_movements cm
              LEFT JOIN users u ON u.id = cm.created_by
              WHERE cm.session_id = ? ORDER BY cm.id DESC;`,
        args: [row.id],
      });
      const movimientos = movementsResult.rows.map(mapRowToMovement);
      history.push(mapRowToSession(row, movimientos));
    }

    return history;
  }

  public async reset(): Promise<void> {
    assertTestDatabase("CashRepository.reset");
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
