import { dbClient } from "../db/client.js";
import { InvoiceItemModel, InvoiceItemType, InvoiceModel, InvoiceStatus } from "../models/invoice.model.js";
import { centsToMoney } from "../utils/money.js";

const invoiceSelect = `
  SELECT i.*, r.codigo_reserva, s.habitacion,
         c.nombre || CASE WHEN c.apellido IS NULL OR c.apellido = '' THEN '' ELSE ' ' || c.apellido END AS customer_name,
         c.documento AS customer_document,
         u.full_name AS issued_by_name
  FROM invoices i
  JOIN reservations r ON r.id = i.reservation_id
  JOIN stays s ON s.id = i.stay_id
  JOIN customers c ON c.id = i.customer_id
  LEFT JOIN users u ON u.id = i.issued_by`;

function mapItem(row: Record<string, unknown>): InvoiceItemModel {
  return {
    id: Number(row.id),
    invoiceId: Number(row.invoice_id),
    serviceType: row.service_type as InvoiceItemType,
    sourceId: Number(row.source_id),
    description: String(row.description),
    quantity: Number(row.quantity),
    unitPrice: centsToMoney(Number(row.unit_price_cents)),
    subtotal: centsToMoney(Number(row.subtotal_cents)),
    tax: centsToMoney(Number(row.tax_cents)),
    total: centsToMoney(Number(row.total_cents)),
    createdAt: String(row.created_at),
  };
}

function mapInvoice(row: Record<string, unknown>, items: InvoiceItemModel[] = []): InvoiceModel {
  return {
    id: Number(row.id),
    invoiceNumber: String(row.invoice_number),
    customerId: Number(row.customer_id),
    customerName: String(row.customer_name),
    customerDocument: String(row.customer_document),
    reservationId: Number(row.reservation_id),
    reservationCode: String(row.codigo_reserva),
    stayId: Number(row.stay_id),
    room: String(row.habitacion),
    subtotal: centsToMoney(Number(row.subtotal_cents)),
    tax: centsToMoney(Number(row.tax_cents)),
    discount: centsToMoney(Number(row.discount_cents)),
    total: centsToMoney(Number(row.total_cents)),
    paidAmount: centsToMoney(Number(row.paid_amount_cents)),
    balance: centsToMoney(Number(row.balance_cents)),
    status: row.status as InvoiceStatus,
    issuedAt: row.issued_at ? String(row.issued_at) : undefined,
    issuedBy: row.issued_by ? String(row.issued_by) : undefined,
    issuedByName: row.issued_by_name ? String(row.issued_by_name) : undefined,
    voidedAt: row.voided_at ? String(row.voided_at) : undefined,
    voidedBy: row.voided_by ? String(row.voided_by) : undefined,
    voidReason: row.void_reason ? String(row.void_reason) : undefined,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    items,
  };
}

export class InvoiceRepository {
  public async findAll(search?: string, status?: InvoiceStatus): Promise<InvoiceModel[]> {
    const conditions: string[] = [];
    const args: string[] = [];
    if (search?.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push("(LOWER(i.invoice_number) LIKE ? OR LOWER(r.codigo_reserva) LIKE ? OR LOWER(c.nombre || ' ' || COALESCE(c.apellido, '')) LIKE ? OR LOWER(c.documento) LIKE ?)");
      args.push(term, term, term, term);
    }
    if (status) {
      conditions.push("i.status = ?");
      args.push(status);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const result = await dbClient.execute({
      sql: `${invoiceSelect}${where} ORDER BY i.created_at DESC, i.id DESC;`,
      args,
    });
    return result.rows.map((row) => mapInvoice(row as Record<string, unknown>));
  }

  public async findById(id: number): Promise<InvoiceModel | null> {
    const [invoiceResult, itemResult] = await Promise.all([
      dbClient.execute({ sql: `${invoiceSelect} WHERE i.id = ? LIMIT 1;`, args: [id] }),
      dbClient.execute({ sql: "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id;", args: [id] }),
    ]);
    if (!invoiceResult.rows[0]) return null;
    return mapInvoice(
      invoiceResult.rows[0] as Record<string, unknown>,
      itemResult.rows.map((row) => mapItem(row as Record<string, unknown>))
    );
  }

  public async create(stayId: number, userId: string): Promise<InvoiceModel> {
    const transaction = await dbClient.transaction("write");
    let invoiceId = 0;
    const now = new Date().toISOString();
    try {
      const existing = await transaction.execute({
        sql: "SELECT id FROM invoices WHERE stay_id = ? AND status <> 'Anulada' ORDER BY id DESC LIMIT 1;",
        args: [stayId],
      });
      if (existing.rows[0]) {
        invoiceId = Number(existing.rows[0].id);
        await transaction.rollback();
        return (await this.findById(invoiceId))!;
      }

      const stay = await transaction.execute({
        sql: `SELECT s.id, s.customer_id, s.reservation_id, r.codigo_reserva, r.total_reserva_cents
              FROM stays s JOIN reservations r ON r.id = s.reservation_id
              WHERE s.id = ? LIMIT 1;`,
        args: [stayId],
      });
      if (!stay.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Estancia no encontrada" };
      if (stay.rows[0].estado === "Cancelada") {
        throw { statusCode: 409, code: "INVALID_STATUS", message: "No se puede facturar una estancia cancelada" };
      }

      const services = await transaction.execute({
        sql: `SELECT sc.id, sc.cantidad, sc.precio_unitario_cents, sc.subtotal_cents,
                     cat.nombre, cat.categoria
              FROM service_consumptions sc
              JOIN service_catalog cat ON cat.id = sc.service_id
              WHERE sc.stay_id = ? AND sc.estado IN ('Entregado', 'Consumido')
              ORDER BY sc.consumed_at, sc.id;`,
        args: [stayId],
      });
      const lodgingCents = Number(stay.rows[0].total_reserva_cents);
      const serviceCents = services.rows.reduce((sum, row) => sum + Number(row.subtotal_cents), 0);
      const subtotalCents = lodgingCents + serviceCents;

      await transaction.execute("UPDATE document_sequences SET current_value = current_value + 1 WHERE document_type = 'INVOICE';");
      const sequence = await transaction.execute("SELECT current_value FROM document_sequences WHERE document_type = 'INVOICE';");
      const invoiceNumber = `INV-${now.slice(0, 4)}-${String(sequence.rows[0].current_value).padStart(7, "0")}`;
      const inserted = await transaction.execute({
        sql: `INSERT INTO invoices (
                invoice_number, customer_id, reservation_id, stay_id, subtotal_cents,
                tax_cents, discount_cents, total_cents, paid_amount_cents, balance_cents,
                status, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, ?, 'Borrador', ?, ?, ?);`,
        args: [invoiceNumber, stay.rows[0].customer_id, stay.rows[0].reservation_id, stayId,
          subtotalCents, subtotalCents, subtotalCents, userId, now, now],
      });
      invoiceId = Number(inserted.lastInsertRowid);
      await transaction.execute({
        sql: `INSERT INTO invoice_items (
                invoice_id, service_type, source_id, description, quantity, unit_price_cents,
                subtotal_cents, tax_cents, total_cents, created_at
              ) VALUES (?, 'LODGING', ?, ?, 1, ?, ?, 0, ?, ?);`,
        args: [invoiceId, stay.rows[0].reservation_id, `Hospedaje · Reserva ${stay.rows[0].codigo_reserva}`,
          lodgingCents, lodgingCents, lodgingCents, now],
      });
      for (const service of services.rows) {
        await transaction.execute({
          sql: `INSERT INTO invoice_items (
                  invoice_id, service_type, source_id, description, quantity, unit_price_cents,
                  subtotal_cents, tax_cents, total_cents, created_at
                ) VALUES (?, 'SERVICE', ?, ?, ?, ?, ?, 0, ?, ?);`,
          args: [invoiceId, service.id, `${service.categoria} · ${service.nombre}`, service.cantidad,
            service.precio_unitario_cents, service.subtotal_cents, service.subtotal_cents, now],
        });
      }
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_values, created_at)
              VALUES (?, 'CREATE', 'invoice', ?, ?, ?);`,
        args: [userId, String(invoiceId), JSON.stringify({ invoiceNumber, stayId, totalCents: subtotalCents }), now],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return (await this.findById(invoiceId))!;
  }

  public async issue(id: number, userId: string, ipAddress?: string): Promise<InvoiceModel> {
    const transaction = await dbClient.transaction("write");
    const now = new Date().toISOString();
    try {
      const invoice = await transaction.execute({ sql: "SELECT * FROM invoices WHERE id = ? LIMIT 1;", args: [id] });
      if (!invoice.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Factura no encontrada" };
      const row = invoice.rows[0];
      if (row.status !== "Borrador") {
        await transaction.rollback();
        return (await this.findById(id))!;
      }

      const pending = await transaction.execute({
        sql: "SELECT COUNT(*) AS count FROM service_consumptions WHERE stay_id = ? AND estado IN ('Registrado', 'EnProceso');",
        args: [row.stay_id],
      });
      if (Number(pending.rows[0].count) > 0) {
        throw { statusCode: 409, code: "PENDING_SERVICES", message: "Hay servicios pendientes de completar o cancelar" };
      }

      const reservation = await transaction.execute({
        sql: "SELECT codigo_reserva, total_reserva_cents FROM reservations WHERE id = ? LIMIT 1;",
        args: [row.reservation_id],
      });
      const services = await transaction.execute({
        sql: `SELECT sc.id, sc.cantidad, sc.precio_unitario_cents, sc.subtotal_cents,
                     cat.nombre, cat.categoria
              FROM service_consumptions sc
              JOIN service_catalog cat ON cat.id = sc.service_id
              WHERE sc.stay_id = ? AND sc.estado IN ('Entregado', 'Consumido')
              ORDER BY sc.consumed_at, sc.id;`,
        args: [row.stay_id],
      });
      const lodgingCents = Number(reservation.rows[0].total_reserva_cents);
      const serviceCents = services.rows.reduce((sum, service) => sum + Number(service.subtotal_cents), 0);
      const totalCents = lodgingCents + serviceCents;

      await transaction.execute({ sql: "DELETE FROM invoice_items WHERE invoice_id = ?;", args: [id] });
      await transaction.execute({
        sql: `INSERT INTO invoice_items (
                invoice_id, service_type, source_id, description, quantity, unit_price_cents,
                subtotal_cents, tax_cents, total_cents, created_at
              ) VALUES (?, 'LODGING', ?, ?, 1, ?, ?, 0, ?, ?);`,
        args: [id, row.reservation_id, `Hospedaje · Reserva ${reservation.rows[0].codigo_reserva}`,
          lodgingCents, lodgingCents, lodgingCents, now],
      });
      for (const service of services.rows) {
        await transaction.execute({
          sql: `INSERT INTO invoice_items (
                  invoice_id, service_type, source_id, description, quantity, unit_price_cents,
                  subtotal_cents, tax_cents, total_cents, created_at
                ) VALUES (?, 'SERVICE', ?, ?, ?, ?, ?, 0, ?, ?);`,
          args: [id, service.id, `${service.categoria} · ${service.nombre}`, service.cantidad,
            service.precio_unitario_cents, service.subtotal_cents, service.subtotal_cents, now],
        });
      }

      await transaction.execute({
        sql: "UPDATE payment_allocations SET invoice_id = ? WHERE reservation_id = ? AND invoice_id IS NULL;",
        args: [id, row.reservation_id],
      });
      await transaction.execute({
        sql: "UPDATE payments SET invoice_id = ? WHERE reservation_id = ? AND invoice_id IS NULL;",
        args: [id, row.reservation_id],
      });
      await transaction.execute({
        sql: "UPDATE cash_movements SET invoice_id = ? WHERE reservation_id = ? AND invoice_id IS NULL;",
        args: [id, row.reservation_id],
      });
      const paid = await transaction.execute({
        sql: `SELECT COALESCE(SUM(CASE WHEN p.kind = 'REVERSAL' THEN -pa.amount_cents ELSE pa.amount_cents END), 0) AS paid_cents
              FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
              WHERE pa.invoice_id = ?;`,
        args: [id],
      });
      const paidCents = Math.max(0, Number(paid.rows[0].paid_cents));
      if (paidCents > totalCents) {
        throw { statusCode: 409, code: "INVOICE_OVERPAID", message: "Los pagos aplicados superan el total de la factura" };
      }
      const status: InvoiceStatus = paidCents >= totalCents ? "Pagada" : paidCents > 0 ? "Parcial" : "Emitida";
      await transaction.execute({
        sql: `UPDATE invoices SET subtotal_cents = ?, tax_cents = 0, discount_cents = 0,
                total_cents = ?, paid_amount_cents = ?, balance_cents = ?, status = ?,
                issued_at = ?, issued_by = ?, updated_at = ? WHERE id = ?;`,
        args: [totalCents, totalCents, paidCents, totalCents - paidCents, status, now, userId, now, id],
      });
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at)
              VALUES (?, 'ISSUE', 'invoice', ?, ?, ?, ?, ?);`,
        args: [userId, String(id), JSON.stringify({ status: "Borrador" }),
          JSON.stringify({ status, totalCents, paidCents }), ipAddress ?? null, now],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return (await this.findById(id))!;
  }

  public async void(id: number, reason: string, userId: string, ipAddress?: string): Promise<InvoiceModel> {
    const transaction = await dbClient.transaction("write");
    const now = new Date().toISOString();
    try {
      const invoice = await transaction.execute({ sql: "SELECT * FROM invoices WHERE id = ? LIMIT 1;", args: [id] });
      if (!invoice.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Factura no encontrada" };
      if (invoice.rows[0].status === "Anulada") {
        await transaction.rollback();
        return (await this.findById(id))!;
      }
      await transaction.execute({
        sql: `UPDATE invoices SET status = 'Anulada', voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?
              WHERE id = ?;`,
        args: [now, userId, reason, now, id],
      });
      await transaction.execute({ sql: "UPDATE payment_allocations SET invoice_id = NULL WHERE invoice_id = ?;", args: [id] });
      await transaction.execute({ sql: "UPDATE payments SET invoice_id = NULL WHERE invoice_id = ?;", args: [id] });
      await transaction.execute({ sql: "UPDATE cash_movements SET invoice_id = NULL WHERE invoice_id = ?;", args: [id] });
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at)
              VALUES (?, 'VOID', 'invoice', ?, ?, ?, ?, ?);`,
        args: [userId, String(id), JSON.stringify({ status: invoice.rows[0].status }),
          JSON.stringify({ status: "Anulada", reason }), ipAddress ?? null, now],
      });
      await transaction.commit();
    } catch (error) {
      if (!transaction.closed) await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    return (await this.findById(id))!;
  }
}
