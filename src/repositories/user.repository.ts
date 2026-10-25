import { UserModel, UserRole } from "../models/user.model.js";
import { dbClient } from "../db/client.js";

function mapRowToUser(row: any): UserModel {
  return {
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: row.role as UserRole,
    fullName: String(row.full_name),
    createdAt: String(row.created_at),
  };
}

export class UserRepository {
  public async findByUsername(username: string): Promise<UserModel | null> {
    const normalized = username.toLowerCase().trim();
    const result = await dbClient.execute({
      sql: `SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1;`,
      args: [normalized],
    });
    if (result.rows.length === 0) return null;
    return mapRowToUser(result.rows[0]);
  }

  public async findByEmail(email: string): Promise<UserModel | null> {
    const normalized = email.toLowerCase().trim();
    const result = await dbClient.execute({
      sql: `SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1;`,
      args: [normalized],
    });
    if (result.rows.length === 0) return null;
    return mapRowToUser(result.rows[0]);
  }

  public async findById(id: string): Promise<UserModel | null> {
    const result = await dbClient.execute({
      sql: `SELECT * FROM users WHERE id = ? LIMIT 1;`,
      args: [id],
    });
    if (result.rows.length === 0) return null;
    return mapRowToUser(result.rows[0]);
  }

  public async save(user: UserModel): Promise<void> {
    await dbClient.execute({
      sql: `INSERT INTO users (id, username, email, password_hash, role, full_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              username = excluded.username,
              email = excluded.email,
              password_hash = excluded.password_hash,
              role = excluded.role,
              full_name = excluded.full_name;`,
      args: [
        user.id,
        user.username,
        user.email,
        user.passwordHash,
        user.role,
        user.fullName,
        user.createdAt || new Date().toISOString(),
      ],
    });
  }

  public async saveWithRoleAudit(
    user: UserModel,
    previousRole: UserRole,
    changedBy?: string,
    ipAddress?: string
  ): Promise<void> {
    const createdAt = new Date().toISOString();
    await dbClient.batch([
      {
        sql: `INSERT INTO users (id, username, email, password_hash, role, full_name, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                email = excluded.email,
                password_hash = excluded.password_hash,
                role = excluded.role,
                full_name = excluded.full_name;`,
        args: [user.id, user.username, user.email, user.passwordHash, user.role, user.fullName, user.createdAt],
      },
      {
        sql: `INSERT INTO audit_logs (
                user_id, action, entity, entity_id, old_values, new_values, ip_address, created_at
              ) VALUES (?, 'ROLE_CHANGE', 'user', ?, ?, ?, ?, ?);`,
        args: [
          changedBy ?? null,
          user.id,
          JSON.stringify({ role: previousRole }),
          JSON.stringify({ role: user.role }),
          ipAddress ?? null,
          createdAt,
        ],
      },
    ], "write");
  }

  public async findAll(): Promise<UserModel[]> {
    const result = await dbClient.execute(`SELECT * FROM users ORDER BY created_at DESC;`);
    return result.rows.map(mapRowToUser);
  }

  public async delete(id: string): Promise<boolean> {
    const result = await dbClient.execute({
      sql: `DELETE FROM users WHERE id = ?;`,
      args: [id],
    });
    return result.rowsAffected > 0;
  }

  public async reset(): Promise<void> {
    await dbClient.batch([
      { sql: `DELETE FROM attendance_records
              WHERE user_id IN (SELECT id FROM users WHERE username != 'admin')
                 OR registered_by IN (SELECT id FROM users WHERE username != 'admin');`, args: [] },
      { sql: `DELETE FROM staff_schedules
              WHERE user_id IN (SELECT id FROM users WHERE username != 'admin');`, args: [] },
      { sql: `DELETE FROM users WHERE username != 'admin';`, args: [] },
    ], "write");
  }
}
