import { dbClient } from "./client.js";
import { config } from "../config/env.js";
import { PasswordHasher } from "../utils/hasher.js";

async function main(): Promise<void> {
  if (!config.turso.url.startsWith("libsql://")) {
    throw new Error("La rotación solo está habilitada para la base Turso remota");
  }
  if (
    process.env.ALLOW_ADMIN_PASSWORD_ROTATION !== "true" ||
    process.env.ADMIN_PASSWORD_ROTATION_CONFIRMATION !== "ROTATE_REMOTE_ADMIN"
  ) {
    throw new Error(
      "Rotación bloqueada: requiere ALLOW_ADMIN_PASSWORD_ROTATION=true y ADMIN_PASSWORD_ROTATION_CONFIRMATION=ROTATE_REMOTE_ADMIN"
    );
  }
  const password = process.env.ADMIN_NEW_PASSWORD;
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error("ADMIN_NEW_PASSWORD debe tener entre 12 y 128 caracteres");
  }

  try {
    const admin = await dbClient.execute("SELECT id FROM users WHERE username = 'admin' LIMIT 1;");
    if (!admin.rows[0]) throw new Error("No existe el administrador principal");
    const adminId = String(admin.rows[0].id);
    const now = new Date().toISOString();
    const transaction = await dbClient.transaction("write");
    try {
      await transaction.execute({
        sql: "UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?;",
        args: [await PasswordHasher.hash(password), adminId],
      });
      await transaction.execute({
        sql: `INSERT INTO audit_logs (user_id, action, entity, entity_id, new_values, created_at)
              VALUES (?, 'ROTATE_PASSWORD', 'user', ?, ?, ?);`,
        args: [adminId, adminId, JSON.stringify({ rotated: true }), now],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
    console.log(JSON.stringify({ rotated: true, username: "admin", rotatedAt: now }, null, 2));
  } finally {
    dbClient.close();
  }
}

main().catch((error: unknown) => {
  console.error("No se pudo rotar la contraseña administrativa:", error);
  process.exit(1);
});
