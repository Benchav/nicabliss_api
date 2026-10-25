import { dbClient } from "../db/client.js";
import { CustomerModel } from "../models/customer.model.js";

function mapCustomer(row: Record<string, unknown>): CustomerModel {
  return {
    id: Number(row.id),
    nombre: String(row.nombre),
    apellido: row.apellido ? String(row.apellido) : undefined,
    documento: String(row.documento),
    telefono: row.telefono ? String(row.telefono) : undefined,
    correo: row.correo ? String(row.correo) : undefined,
    direccion: row.direccion ? String(row.direccion) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function normalizeDocument(document: string): string {
  return document.normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export class CustomerRepository {
  public async findAll(search?: string): Promise<CustomerModel[]> {
    const normalizedSearch = search?.trim().toLowerCase();
    const result = normalizedSearch
      ? await dbClient.execute({
          sql: `SELECT * FROM customers
                WHERE LOWER(nombre || ' ' || COALESCE(apellido, '')) LIKE ?
                   OR LOWER(documento) LIKE ?
                   OR LOWER(COALESCE(telefono, '')) LIKE ?
                   OR LOWER(COALESCE(correo, '')) LIKE ?
                ORDER BY updated_at DESC, id DESC;`,
          args: Array(4).fill(`%${normalizedSearch}%`),
        })
      : await dbClient.execute("SELECT * FROM customers ORDER BY updated_at DESC, id DESC;");
    return result.rows.map((row) => mapCustomer(row as Record<string, unknown>));
  }

  public async findById(id: number): Promise<CustomerModel | null> {
    const result = await dbClient.execute({
      sql: "SELECT * FROM customers WHERE id = ? LIMIT 1;",
      args: [id],
    });
    return result.rows[0] ? mapCustomer(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findByNormalizedDocument(document: string): Promise<CustomerModel | null> {
    const result = await dbClient.execute({
      sql: "SELECT * FROM customers WHERE documento_normalizado = ? ORDER BY id LIMIT 1;",
      args: [normalizeDocument(document)],
    });
    return result.rows[0] ? mapCustomer(result.rows[0] as Record<string, unknown>) : null;
  }

  public async create(customer: Omit<CustomerModel, "id">): Promise<CustomerModel> {
    const result = await dbClient.execute({
      sql: `INSERT INTO customers (
              nombre, apellido, documento, documento_normalizado, telefono,
              correo, direccion, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [
        customer.nombre,
        customer.apellido ?? null,
        customer.documento,
        normalizeDocument(customer.documento),
        customer.telefono ?? null,
        customer.correo ?? null,
        customer.direccion ?? null,
        customer.createdAt,
        customer.updatedAt,
      ],
    });
    return (await this.findById(Number(result.lastInsertRowid)))!;
  }

  public async update(customer: CustomerModel): Promise<CustomerModel> {
    await dbClient.execute({
      sql: `UPDATE customers SET
              nombre = ?, apellido = ?, documento = ?, documento_normalizado = ?,
              telefono = ?, correo = ?, direccion = ?, updated_at = ?
            WHERE id = ?;`,
      args: [
        customer.nombre,
        customer.apellido ?? null,
        customer.documento,
        normalizeDocument(customer.documento),
        customer.telefono ?? null,
        customer.correo ?? null,
        customer.direccion ?? null,
        customer.updatedAt,
        customer.id,
      ],
    });
    return (await this.findById(customer.id))!;
  }
}
