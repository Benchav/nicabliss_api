import { dbClient } from "../db/client.js";
import { ConsumptionStatus, ServiceCatalogModel, ServiceCategory, ServiceConsumptionModel } from "../models/service.model.js";
import { centsToMoney } from "../utils/money.js";

function mapCatalog(row: Record<string, unknown>): ServiceCatalogModel {
  return {
    id: Number(row.id), nombre: String(row.nombre), categoria: row.categoria as ServiceCategory,
    descripcion: row.descripcion ? String(row.descripcion) : undefined,
    precio: centsToMoney(Number(row.precio_cents)), impuesto: Number(row.tax_basis_points) / 100,
    activo: Number(row.activo) === 1, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapConsumption(row: Record<string, unknown>): ServiceConsumptionModel {
  return {
    id: Number(row.id), stayId: Number(row.stay_id), customerId: Number(row.customer_id),
    serviceId: Number(row.service_id), serviceName: String(row.service_name), categoria: row.categoria as ServiceCategory,
    cantidad: Number(row.cantidad), precioUnitario: centsToMoney(Number(row.precio_unitario_cents)),
    subtotal: centsToMoney(Number(row.subtotal_cents)), estado: row.estado as ConsumptionStatus,
    observaciones: row.observaciones ? String(row.observaciones) : undefined,
    sourceType: row.source_type as ServiceConsumptionModel["sourceType"],
    sourceId: row.source_id ? Number(row.source_id) : undefined, consumedAt: String(row.consumed_at),
    createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

const consumptionSelect = `SELECT sc.*, cat.nombre AS service_name, cat.categoria
  FROM service_consumptions sc JOIN service_catalog cat ON cat.id = sc.service_id`;

export class ServiceRepository {
  public async getCatalog(includeInactive = false): Promise<ServiceCatalogModel[]> {
    const result = await dbClient.execute(`SELECT * FROM service_catalog ${includeInactive ? "" : "WHERE activo = 1"} ORDER BY categoria, nombre;`);
    return result.rows.map((row) => mapCatalog(row as Record<string, unknown>));
  }

  public async findCatalogById(id: number): Promise<ServiceCatalogModel | null> {
    const result = await dbClient.execute({ sql: "SELECT * FROM service_catalog WHERE id = ? LIMIT 1;", args: [id] });
    return result.rows[0] ? mapCatalog(result.rows[0] as Record<string, unknown>) : null;
  }

  public async createCatalog(input: Omit<ServiceCatalogModel, "id">): Promise<ServiceCatalogModel> {
    const result = await dbClient.execute({
      sql: `INSERT INTO service_catalog (nombre, categoria, descripcion, precio_cents, tax_basis_points, activo, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [input.nombre, input.categoria, input.descripcion ?? null, Math.round(input.precio * 100), Math.round(input.impuesto * 100), input.activo ? 1 : 0, input.createdAt, input.updatedAt],
    });
    return (await this.findCatalogById(Number(result.lastInsertRowid)))!;
  }

  public async updateCatalog(input: ServiceCatalogModel): Promise<ServiceCatalogModel> {
    await dbClient.execute({
      sql: `UPDATE service_catalog SET nombre = ?, categoria = ?, descripcion = ?, precio_cents = ?,
              tax_basis_points = ?, activo = ?, updated_at = ? WHERE id = ?;`,
      args: [input.nombre, input.categoria, input.descripcion ?? null, Math.round(input.precio * 100), Math.round(input.impuesto * 100), input.activo ? 1 : 0, input.updatedAt, input.id],
    });
    return (await this.findCatalogById(input.id))!;
  }

  public async getByStay(stayId: number): Promise<ServiceConsumptionModel[]> {
    const result = await dbClient.execute({
      sql: `${consumptionSelect} WHERE sc.stay_id = ? ORDER BY sc.consumed_at DESC, sc.id DESC;`, args: [stayId],
    });
    return result.rows.map((row) => mapConsumption(row as Record<string, unknown>));
  }

  public async findConsumptionById(id: number): Promise<ServiceConsumptionModel | null> {
    const result = await dbClient.execute({ sql: `${consumptionSelect} WHERE sc.id = ? LIMIT 1;`, args: [id] });
    return result.rows[0] ? mapConsumption(result.rows[0] as Record<string, unknown>) : null;
  }

  public async createConsumption(input: {
    stayId: number; serviceId: number; quantity: number; unitPriceCents: number;
    status: ConsumptionStatus; observations?: string; userId: string; now: string;
  }): Promise<ServiceConsumptionModel> {
    const transaction = await dbClient.transaction("write");
    let id = 0;
    try {
      const stay = await transaction.execute({ sql: "SELECT customer_id, estado FROM stays WHERE id = ? LIMIT 1;", args: [input.stayId] });
      if (!stay.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Estancia no encontrada" };
      if (stay.rows[0].estado !== "Activa") throw { statusCode: 409, code: "STAY_NOT_ACTIVE", message: "La estancia no está activa" };
      const catalog = await transaction.execute({ sql: "SELECT id, activo FROM service_catalog WHERE id = ? LIMIT 1;", args: [input.serviceId] });
      if (!catalog.rows[0] || Number(catalog.rows[0].activo) !== 1) throw { statusCode: 404, code: "NOT_FOUND", message: "Servicio no disponible" };
      const inserted = await transaction.execute({
        sql: `INSERT INTO service_consumptions (
                stay_id, customer_id, service_id, cantidad, precio_unitario_cents,
                subtotal_cents, estado, observaciones, source_type, consumed_at,
                created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DIRECT', ?, ?, ?, ?);`,
        args: [input.stayId, stay.rows[0].customer_id, input.serviceId, input.quantity, input.unitPriceCents,
          input.quantity * input.unitPriceCents, input.status, input.observations ?? null, input.now, input.userId, input.now, input.now],
      });
      id = Number(inserted.lastInsertRowid);
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_values, created_at)
              VALUES (?, 'CREATE', 'service_consumption', ?, ?, ?);`,
        args: [input.userId, String(id), JSON.stringify({ stayId: input.stayId, serviceId: input.serviceId }), input.now],
      });
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; }
    finally { transaction.close(); }
    const result = await dbClient.execute({ sql: `${consumptionSelect} WHERE sc.id = ?;`, args: [id] });
    return mapConsumption(result.rows[0] as Record<string, unknown>);
  }

  public async updateConsumptionStatus(id: number, status: ConsumptionStatus, userId: string): Promise<ServiceConsumptionModel> {
    const now = new Date().toISOString();
    const current = await dbClient.execute({ sql: "SELECT estado FROM service_consumptions WHERE id = ?;", args: [id] });
    if (!current.rows[0]) throw { statusCode: 404, code: "NOT_FOUND", message: "Consumo no encontrado" };
    await dbClient.batch([
      { sql: "UPDATE service_consumptions SET estado = ?, updated_at = ? WHERE id = ?;", args: [status, now, id] },
      { sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, created_at)
              VALUES (?, 'STATUS_CHANGE', 'service_consumption', ?, ?, ?, ?);`,
        args: [userId, String(id), JSON.stringify({ estado: current.rows[0].estado }), JSON.stringify({ estado: status }), now] },
    ], "write");
    const result = await dbClient.execute({ sql: `${consumptionSelect} WHERE sc.id = ?;`, args: [id] });
    return mapConsumption(result.rows[0] as Record<string, unknown>);
  }
}
