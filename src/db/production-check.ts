import { dbClient } from "./client.js";
import { config } from "../config/env.js";
import { REQUIRED_SCHEMA_VERSION } from "./schema.js";
import { PasswordHasher } from "../utils/hasher.js";

async function main(): Promise<void> {
  const configurationBlockers: string[] = [];
  if (config.nodeEnv !== "production") configurationBlockers.push("NODE_ENV debe ser production");
  if (!config.turso.url.startsWith("libsql://")) configurationBlockers.push("TURSO_DATABASE_URL debe ser una base Turso libsql:// remota");
  if (!config.turso.authToken) configurationBlockers.push("TURSO_AUTH_TOKEN es obligatorio");
  if (config.jwt.secret.length < 32 || config.jwt.secret === "nicabliss_jwt_secret_key_2026") {
    configurationBlockers.push("JWT_SECRET debe ser aleatorio y tener al menos 32 caracteres");
  }
  if (config.cors.origin.some((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(parsed.hostname);
    } catch { return true; }
  })) configurationBlockers.push("CORS_ORIGIN debe contener únicamente dominios HTTPS remotos");
  if (!config.trustProxy) configurationBlockers.push("TRUST_PROXY debe estar habilitado");
  if (config.database.autoMigrate) configurationBlockers.push("AUTO_MIGRATE debe estar deshabilitado");
  if (config.database.allowDemoSeed) configurationBlockers.push("ALLOW_DEMO_SEED debe estar deshabilitado");

  if (!config.turso.url.startsWith("libsql://")) {
    console.log(JSON.stringify({ ready: false, schemaVersion: REQUIRED_SCHEMA_VERSION, blockers: configurationBlockers }, null, 2));
    throw new Error("La configuración aún tiene bloqueadores para producción");
  }

  try {
    const [integrity, foreignKeys, migration, duplicates, admin, review, openCash] = await Promise.all([
      dbClient.execute("PRAGMA integrity_check;"),
      dbClient.execute("PRAGMA foreign_key_check;"),
      dbClient.execute({
        sql: "SELECT version FROM schema_migrations WHERE version = ? LIMIT 1;",
        args: [REQUIRED_SCHEMA_VERSION],
      }),
      dbClient.execute(
        "SELECT COUNT(*) AS count FROM (SELECT documento_normalizado FROM customers GROUP BY documento_normalizado HAVING COUNT(*) > 1);"
      ),
      dbClient.execute("SELECT id, password_hash FROM users WHERE username = 'admin' LIMIT 1;"),
      dbClient.execute(
        "SELECT source_table, COUNT(DISTINCT source_id) AS count FROM legacy_migration_map WHERE status = 'REVIEW' GROUP BY source_table ORDER BY source_table;"
      ),
      dbClient.execute("SELECT COUNT(*) AS count FROM cash_sessions WHERE is_closed = 0;"),
    ]);

    const blockers: string[] = [...configurationBlockers];
    if (String(integrity.rows[0]?.integrity_check) !== "ok") blockers.push("integrity_check no devolvió ok");
    if (foreignKeys.rows.length > 0) blockers.push(`${foreignKeys.rows.length} violaciones de claves foráneas`);
    if (!migration.rows[0]) blockers.push(`falta la migración ${REQUIRED_SCHEMA_VERSION}`);
    if (Number(duplicates.rows[0].count) > 0) blockers.push("hay documentos de clientes duplicados");
    if (!admin.rows[0]) blockers.push("no existe el administrador principal");
    if (admin.rows[0] && await PasswordHasher.compare("12345", String(admin.rows[0].password_hash))) {
      blockers.push("el administrador principal conserva la contraseña de demostración");
    }

    const report = {
      ready: blockers.length === 0,
      schemaVersion: REQUIRED_SCHEMA_VERSION,
      integrity: String(integrity.rows[0]?.integrity_check),
      foreignKeyViolations: foreignKeys.rows.length,
      duplicateCustomerDocuments: Number(duplicates.rows[0].count),
      openCashSessions: Number(openCash.rows[0].count),
      legacyReview: review.rows.map((row) => ({
        sourceTable: String(row.source_table),
        count: Number(row.count),
      })),
      blockers,
    };
    console.log(JSON.stringify(report, null, 2));
    if (blockers.length > 0) throw new Error("La base aún tiene bloqueadores para producción");
  } finally {
    dbClient.close();
  }
}

main().catch((error: unknown) => {
  console.error("Comprobación de producción fallida:", error);
  process.exit(1);
});
