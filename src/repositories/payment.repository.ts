import { dbClient } from "../db/client.js";
import { PaymentKind, PaymentMethod, PaymentModel, PaymentStatus } from "../models/payment.model.js";
import { centsToMoney } from "../utils/money.js";

const paymentSelect = `
  SELECT p.*, u.full_name AS received_by_name
  FROM payments p
  JOIN users u ON u.id = p.received_by`;

function mapPayment(row: Record<string, unknown>): PaymentModel {
  return {
    id: Number(row.id),
    paymentNumber: String(row.payment_number),
    customerId: Number(row.customer_id),
    reservationId: row.reservation_id ? Number(row.reservation_id) : undefined,
    invoiceId: row.invoice_id ? Number(row.invoice_id) : undefined,
    amount: centsToMoney(Number(row.amount_cents)),
    paymentMethod: row.payment_method as PaymentMethod,
    reference: row.reference ? String(row.reference) : undefined,
    kind: row.kind as PaymentKind,
    status: row.status as PaymentStatus,
    reversesPaymentId: row.reverses_payment_id ? Number(row.reverses_payment_id) : undefined,
    paymentDate: String(row.payment_date),
    receivedBy: String(row.received_by),
    receivedByName: String(row.received_by_name),
    cashSessionId: Number(row.cash_session_id),
    voidedAt: row.voided_at ? String(row.voided_at) : undefined,
    voidedBy: row.voided_by ? String(row.voided_by) : undefined,
    voidReason: row.void_reason ? String(row.void_reason) : undefined,
    createdAt: String(row.created_at),
  };
}

export interface NewPaymentRecord {
  reservationId: number;
  invoiceId?: number;
  amountCents: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  receivedBy: string;
  idempotencyKey: string;
  ipAddress?: string;
  now: string;
}

export class PaymentRepository {
  public async findById(id: number): Promise<PaymentModel | null> {
    const result = await dbClient.execute({
      sql: `${paymentSelect} WHERE p.id = ? LIMIT 1;`,
      args: [id],
    });
    return result.rows[0] ? mapPayment(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findByIdempotencyKey(key: string): Promise<PaymentModel | null> {
    const result = await dbClient.execute({
      sql: `${paymentSelect} WHERE p.idempotency_key = ? LIMIT 1;`,
      args: [key],
    });
    return result.rows[0] ? mapPayment(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findByReservation(reservationId: number): Promise<PaymentModel[]> {
    const result = await dbClient.execute({
      sql: `${paymentSelect}
            WHERE p.reservation_id = ?
            ORDER BY p.payment_date DESC, p.id DESC;`,
      args: [reservationId],
    });
    return result.rows.map((row) => mapPayment(row as Record<string, unknown>));
  }

  public async create(record: NewPaymentRecord): Promise<PaymentModel> {
    const transaction = await dbClient.transaction("write");
    let paymentId = 0;
    try {
      const duplicate = await transaction.execute({
        sql: "SELECT id, reservation_id, invoice_id, amount_cents, payment_method, received_by FROM payments WHERE idempotency_key = ? LIMIT 1;",
        args: [record.idempotencyKey],
      });
      if (duplicate.rows[0]) {
        const sameRequest =
          Number(duplicate.rows[0].reservation_id) === record.reservationId &&
          (record.invoiceId === undefined || Number(duplicate.rows[0].invoice_id) === record.invoiceId) &&
          Number(duplicate.rows[0].amount_cents) === record.amountCents &&
          String(duplicate.rows[0].payment_method) === record.paymentMethod &&
          String(duplicate.rows[0].received_by) === record.receivedBy;
        if (!sameRequest) {
          throw {
            statusCode: 409,
            code: "IDEMPOTENCY_CONFLICT",
            message: "La clave de idempotencia ya fue utilizada con otros datos",
          };
        }
        paymentId = Number(duplicate.rows[0].id);
        await transaction.rollback();
        return (await this.findById(paymentId))!;
      }

      const reservation = await transaction.execute({
        sql: `SELECT r.*,
                     COALESCE((
                       SELECT SUM(CASE WHEN p.kind = 'REVERSAL' THEN -pa.amount_cents ELSE pa.amount_cents END)
                       FROM payment_allocations pa
                       JOIN payments p ON p.id = pa.payment_id
                       WHERE pa.reservation_id = r.id
                     ), 0) AS paid_cents
              FROM reservations r WHERE r.id = ? LIMIT 1;`,
        args: [record.reservationId],
      });
      if (!reservation.rows[0]) {
        throw { statusCode: 404, code: "NOT_FOUND", message: "Reserva no encontrada" };
      }
      const reservationRow = reservation.rows[0];
      let invoiceId = record.invoiceId;
      if (!invoiceId) {
        const activeInvoice = await transaction.execute({
          sql: `SELECT id FROM invoices
                WHERE reservation_id = ? AND status IN ('Emitida', 'Parcial')
                ORDER BY id DESC LIMIT 1;`,
          args: [record.reservationId],
        });
        invoiceId = activeInvoice.rows[0] ? Number(activeInvoice.rows[0].id) : undefined;
      }

      let balanceCents: number;
      if (invoiceId) {
        const invoice = await transaction.execute({
          sql: "SELECT reservation_id, balance_cents, status FROM invoices WHERE id = ? LIMIT 1;",
          args: [invoiceId],
        });
        if (!invoice.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Factura no encontrada" };
        if (Number(invoice.rows[0].reservation_id) !== record.reservationId) {
          throw { statusCode: 409, code: "INVOICE_RESERVATION_MISMATCH", message: "La factura no pertenece a la reserva" };
        }
        if (!["Emitida", "Parcial"].includes(String(invoice.rows[0].status))) {
          throw { statusCode: 409, code: "INVALID_STATUS", message: "La factura no admite pagos en su estado actual" };
        }
        balanceCents = Number(invoice.rows[0].balance_cents);
      } else if (["CheckIn", "Finalizada"].includes(String(reservationRow.estado))) {
        const stay = await transaction.execute({
          sql: `SELECT s.id, r.total_reserva_cents,
                       COALESCE((
                         SELECT SUM(sc.subtotal_cents)
                         FROM service_consumptions sc
                         WHERE sc.stay_id = s.id AND sc.estado IN ('Entregado', 'Consumido')
                       ), 0) AS services_cents
                FROM stays s
                JOIN reservations r ON r.id = s.reservation_id
                WHERE s.reservation_id = ? LIMIT 1;`,
          args: [record.reservationId],
        });
        if (!stay.rows[0]) {
          throw {
            statusCode: 409,
            code: "STAY_NOT_FOUND",
            message: "La reserva en curso no tiene una estancia asociada para calcular el saldo",
          };
        }
        const accountTotal = Number(stay.rows[0].total_reserva_cents) + Number(stay.rows[0].services_cents);
        balanceCents = accountTotal - Number(reservationRow.paid_cents);
      } else {
        if (!["Pendiente", "Confirmada"].includes(String(reservationRow.estado))) {
          throw { statusCode: 409, code: "INVALID_STATUS", message: "La reserva no admite pagos en su estado actual" };
        }
        balanceCents = Number(reservationRow.total_reserva_cents) - Number(reservationRow.paid_cents);
      }
      balanceCents = Math.max(0, balanceCents);
      if (record.amountCents > balanceCents) {
        throw {
          statusCode: 400,
          code: "PAYMENT_EXCEEDS_BALANCE",
          message: `El monto no puede superar el saldo de $${centsToMoney(balanceCents).toFixed(2)}`,
        };
      }

      const cashSession = await transaction.execute({
        sql: `SELECT cs.id, cs.opened_by, opener.full_name AS opened_by_name
              FROM cash_sessions cs
              LEFT JOIN users opener ON opener.id = cs.opened_by
              WHERE cs.is_closed = 0 LIMIT 1;`,
        args: [],
      });
      if (!cashSession.rows[0]) {
        throw { statusCode: 409, code: "CASH_SESSION_REQUIRED", message: "Debe existir una caja abierta para registrar el pago" };
      }
      if (String(cashSession.rows[0].opened_by ?? "") !== record.receivedBy) {
        throw {
          statusCode: 403,
          code: "CASH_SESSION_OWNER_REQUIRED",
          message: `La caja abierta pertenece a ${String(cashSession.rows[0].opened_by_name || "otro usuario")}; solo su responsable puede registrar pagos`,
        };
      }
      const cashSessionId = Number(cashSession.rows[0].id);

      await transaction.execute("UPDATE document_sequences SET current_value = current_value + 1 WHERE document_type = 'PAYMENT';");
      const sequence = await transaction.execute("SELECT current_value FROM document_sequences WHERE document_type = 'PAYMENT';");
      const paymentNumber = `PAY-${record.now.slice(0, 4)}-${String(sequence.rows[0].current_value).padStart(7, "0")}`;
      const inserted = await transaction.execute({
        sql: `INSERT INTO payments (
                payment_number, customer_id, reservation_id, invoice_id, amount_cents,
                payment_method, reference, kind, status, payment_date,
                received_by, cash_session_id, idempotency_key, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PAYMENT', 'POSTED', ?, ?, ?, ?, ?);`,
        args: [
          paymentNumber,
          reservationRow.customer_id,
          record.reservationId,
          invoiceId ?? null,
          record.amountCents,
          record.paymentMethod,
          record.reference ?? null,
          record.now,
          record.receivedBy,
          cashSessionId,
          record.idempotencyKey,
          record.now,
        ],
      });
      paymentId = Number(inserted.lastInsertRowid);
      await transaction.execute({
        sql: `INSERT INTO payment_allocations (payment_id, reservation_id, invoice_id, amount_cents, created_at)
              VALUES (?, ?, ?, ?, ?);`,
        args: [paymentId, record.reservationId, invoiceId ?? null, record.amountCents, record.now],
      });
      await transaction.execute({
        sql: `INSERT INTO cash_movements (
                session_id, fecha, tipo, concepto, descripcion, metodo, monto,
                payment_id, customer_id, reservation_id, invoice_id, created_by, source
              ) VALUES (?, ?, 'Ingreso', 'Hospedaje', ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT');`,
        args: [
          cashSessionId,
          record.now,
          `Pago ${paymentNumber} de reserva ${reservationRow.codigo_reserva}`,
          record.paymentMethod,
          centsToMoney(record.amountCents),
          paymentId,
          reservationRow.customer_id,
          record.reservationId,
          invoiceId ?? null,
          record.receivedBy,
        ],
      });

      if (record.paymentMethod === "Efectivo") {
        await transaction.execute({
          sql: `UPDATE cash_sessions SET
                  ingresos_efectivo = ingresos_efectivo + ?,
                  efectivo_esperado = efectivo_esperado + ?
                WHERE id = ?;`,
          args: [centsToMoney(record.amountCents), centsToMoney(record.amountCents), cashSessionId],
        });
      } else {
        await transaction.execute({
          sql: "UPDATE cash_sessions SET ingresos_digitales = ingresos_digitales + ? WHERE id = ?;",
          args: [centsToMoney(record.amountCents), cashSessionId],
        });
      }

      const paidAfter = Number(reservationRow.paid_cents) + record.amountCents;
      if (reservationRow.estado === "Pendiente" && paidAfter >= Number(reservationRow.deposito_requerido_cents)) {
        await transaction.execute({
          sql: "UPDATE reservations SET estado = 'Confirmada', updated_at = ? WHERE id = ?;",
          args: [record.now, record.reservationId],
        });
      }

      if (invoiceId) {
        await transaction.execute({
          sql: `UPDATE invoices SET
                  paid_amount_cents = paid_amount_cents + ?,
                  balance_cents = balance_cents - ?,
                  status = CASE WHEN balance_cents - ? = 0 THEN 'Pagada' ELSE 'Parcial' END,
                  updated_at = ?
                WHERE id = ?;`,
          args: [record.amountCents, record.amountCents, record.amountCents, record.now, invoiceId],
        });
      }

      await transaction.execute({
        sql: `INSERT INTO audit_logs (
                user_id, action, entity, entity_id, new_values, ip_address, created_at
              ) VALUES (?, 'PAYMENT_POSTED', 'payment', ?, ?, ?, ?);`,
        args: [
          record.receivedBy,
          String(paymentId),
          JSON.stringify({ paymentNumber, reservationId: record.reservationId, invoiceId, amountCents: record.amountCents }),
          record.ipAddress ?? null,
          record.now,
        ],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return (await this.findById(paymentId))!;
  }

  public async void(paymentId: number, reason: string, userId: string, ipAddress?: string): Promise<PaymentModel> {
    const transaction = await dbClient.transaction("write");
    let reversalId = 0;
    const now = new Date().toISOString();
    try {
      const original = await transaction.execute({
        sql: `SELECT p.*, pa.amount_cents AS allocated_cents, pa.invoice_id AS allocated_invoice_id
              FROM payments p
              JOIN payment_allocations pa ON pa.payment_id = p.id
              WHERE p.id = ? LIMIT 1;`,
        args: [paymentId],
      });
      if (!original.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Pago no encontrado" };
      const originalRow = original.rows[0];

      const cashSession = await transaction.execute({
        sql: `SELECT cs.id, cs.efectivo_esperado, cs.opened_by, opener.full_name AS opened_by_name
              FROM cash_sessions cs
              LEFT JOIN users opener ON opener.id = cs.opened_by
              WHERE cs.is_closed = 0 LIMIT 1;`,
        args: [],
      });
      if (!cashSession.rows[0]) {
        throw { statusCode: 409, code: "CASH_SESSION_REQUIRED", message: "Debe existir una caja abierta para anular el pago" };
      }
      if (String(cashSession.rows[0].opened_by ?? "") !== userId) {
        throw {
          statusCode: 403,
          code: "CASH_SESSION_OWNER_REQUIRED",
          message: `La caja abierta pertenece a ${String(cashSession.rows[0].opened_by_name || "otro usuario")}; solo su responsable puede registrar reversiones`,
        };
      }

      const existingReversal = await transaction.execute({
        sql: "SELECT id FROM payments WHERE reverses_payment_id = ? LIMIT 1;",
        args: [paymentId],
      });
      if (existingReversal.rows[0]) {
        reversalId = Number(existingReversal.rows[0].id);
        await transaction.rollback();
        return (await this.findById(reversalId))!;
      }

      if (originalRow.kind !== "PAYMENT" || originalRow.status !== "POSTED") {
        throw { statusCode: 409, code: "INVALID_STATUS", message: "El pago no puede anularse" };
      }

      const cashSessionId = Number(cashSession.rows[0].id);
      const amountCents = Number(originalRow.amount_cents);
      if (originalRow.payment_method === "Efectivo" && centsToMoney(amountCents) > Number(cashSession.rows[0].efectivo_esperado)) {
        throw { statusCode: 409, code: "INSUFFICIENT_CASH", message: "No hay efectivo suficiente en caja para realizar la reversión" };
      }

      await transaction.execute("UPDATE document_sequences SET current_value = current_value + 1 WHERE document_type = 'PAYMENT';");
      const sequence = await transaction.execute("SELECT current_value FROM document_sequences WHERE document_type = 'PAYMENT';");
      const paymentNumber = `REV-${now.slice(0, 4)}-${String(sequence.rows[0].current_value).padStart(7, "0")}`;
      const inserted = await transaction.execute({
        sql: `INSERT INTO payments (
                payment_number, customer_id, reservation_id, invoice_id, amount_cents,
                payment_method, reference, kind, status, reverses_payment_id,
                payment_date, received_by, cash_session_id, idempotency_key, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'REVERSAL', 'POSTED', ?, ?, ?, ?, ?, ?);`,
        args: [
          paymentNumber,
          originalRow.customer_id,
          originalRow.reservation_id,
          originalRow.allocated_invoice_id ?? null,
          amountCents,
          originalRow.payment_method,
          `Reversión de ${originalRow.payment_number}`,
          paymentId,
          now,
          userId,
          cashSessionId,
          `void-payment-${paymentId}`,
          now,
        ],
      });
      reversalId = Number(inserted.lastInsertRowid);
      await transaction.execute({
        sql: `INSERT INTO payment_allocations (payment_id, reservation_id, invoice_id, amount_cents, created_at)
              VALUES (?, ?, ?, ?, ?);`,
        args: [reversalId, originalRow.reservation_id, originalRow.allocated_invoice_id ?? null, originalRow.allocated_cents, now],
      });
      await transaction.execute({
        sql: `UPDATE payments SET status = 'REVERSED', voided_at = ?, voided_by = ?, void_reason = ?
              WHERE id = ?;`,
        args: [now, userId, reason, paymentId],
      });
      await transaction.execute({
        sql: `INSERT INTO cash_movements (
                session_id, fecha, tipo, concepto, descripcion, metodo, monto,
                payment_id, customer_id, reservation_id, invoice_id, created_by, source
              ) VALUES (?, ?, 'Salida', 'Hospedaje', ?, ?, ?, ?, ?, ?, ?, ?, 'REVERSAL');`,
        args: [
          cashSessionId,
          now,
          `Reversión ${paymentNumber} del pago ${originalRow.payment_number}`,
          originalRow.payment_method,
          centsToMoney(amountCents),
          reversalId,
          originalRow.customer_id,
          originalRow.reservation_id,
          originalRow.allocated_invoice_id ?? null,
          userId,
        ],
      });
      if (originalRow.payment_method === "Efectivo") {
        await transaction.execute({
          sql: `UPDATE cash_sessions SET
                  salidas_efectivo = salidas_efectivo + ?,
                  efectivo_esperado = efectivo_esperado - ?
                WHERE id = ?;`,
          args: [centsToMoney(amountCents), centsToMoney(amountCents), cashSessionId],
        });
      }
      await transaction.execute({
        sql: `UPDATE reservations SET estado = CASE
                WHEN estado = 'Confirmada' AND (
                  SELECT COALESCE(SUM(CASE WHEN p.kind = 'REVERSAL' THEN -pa.amount_cents ELSE pa.amount_cents END), 0)
                  FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
                  WHERE pa.reservation_id = reservations.id
                ) < deposito_requerido_cents THEN 'Pendiente'
                ELSE estado END,
                updated_at = ?
              WHERE id = ?;`,
        args: [now, originalRow.reservation_id],
      });
      if (originalRow.allocated_invoice_id) {
        await transaction.execute({
          sql: `UPDATE invoices SET
                  paid_amount_cents = paid_amount_cents - ?,
                  balance_cents = balance_cents + ?,
                  status = CASE WHEN paid_amount_cents - ? = 0 THEN 'Emitida' ELSE 'Parcial' END,
                  updated_at = ?
                WHERE id = ? AND status <> 'Anulada';`,
          args: [amountCents, amountCents, amountCents, now, originalRow.allocated_invoice_id],
        });
      }
      await transaction.execute({
        sql: `INSERT INTO audit_logs (
                user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at
              ) VALUES (?, 'PAYMENT_REVERSED', 'payment', ?, ?, ?, ?, ?);`,
        args: [
          userId,
          String(paymentId),
          JSON.stringify({ status: "POSTED" }),
          JSON.stringify({ status: "REVERSED", reversalId, reason }),
          ipAddress ?? null,
          now,
        ],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return (await this.findById(reversalId))!;
  }

  public async getReceipt(paymentId: number): Promise<Record<string, unknown> | null> {
    const result = await dbClient.execute({
      sql: `SELECT p.payment_number, p.amount_cents, p.payment_method, p.reference,
                   p.payment_date, p.kind, p.status, u.full_name AS received_by_name,
                   r.codigo_reserva, r.habitacion, c.nombre, c.apellido, c.documento
            FROM payments p
            JOIN users u ON u.id = p.received_by
            JOIN reservations r ON r.id = p.reservation_id
            JOIN customers c ON c.id = p.customer_id
            WHERE p.id = ? LIMIT 1;`,
      args: [paymentId],
    });
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      paymentNumber: String(row.payment_number),
      amount: centsToMoney(Number(row.amount_cents)),
      paymentMethod: String(row.payment_method),
      reference: row.reference ? String(row.reference) : undefined,
      paymentDate: String(row.payment_date),
      kind: String(row.kind),
      status: String(row.status),
      receivedByName: String(row.received_by_name),
      reservationCode: String(row.codigo_reserva),
      room: String(row.habitacion),
      customerName: `${String(row.nombre)}${row.apellido ? ` ${String(row.apellido)}` : ""}`,
      customerDocument: String(row.documento),
    };
  }
}
