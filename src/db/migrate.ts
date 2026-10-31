import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import type { Transaction } from "@libsql/client";
import { dbClient } from "./client.js";
import { Logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const addColumnPattern =
  /^[ \t]*ALTER[ \t]+TABLE[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]+ADD[ \t]+COLUMN[ \t]+([A-Za-z_][A-Za-z0-9_]*)[^\r\n]*$/gim;

/**
 * Omite las sentencias `ALTER TABLE ... ADD COLUMN` cuya columna ya existe.
 * SQLite no soporta `ADD COLUMN IF NOT EXISTS`; este filtro permite reintentar
 * una migración sobre una base con desviación manual sin perder atomicidad.
 * El checksum guardado sigue calculándose sobre el SQL original.
 */
export function omitExistingColumns(
  sql: string,
  existingColumns: ReadonlyMap<string, ReadonlySet<string>>
): string {
  return sql.replace(addColumnPattern, (statement, table: string, column: string) => {
    const columns = existingColumns.get(table.toLowerCase());
    return columns?.has(column.toLowerCase())
      ? `-- [idempotente] ${table}.${column} ya existe; ALTER TABLE omitido`
      : statement;
  });
}

function hasExecutableSql(sql: string): boolean {
  return sql
    .split(/\r?\n/)
    .some((line) => line.trim().length > 0 && !line.trim().startsWith("--"));
}

async function loadExistingColumns(
  sql: string,
  transaction: Transaction
): Promise<Map<string, Set<string>>> {
  const tables = new Set<string>();
  for (const match of sql.matchAll(/ALTER[ \t]+TABLE[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]+ADD[ \t]+COLUMN/gi)) {
    tables.add(match[1].toLowerCase());
  }

  const existingColumns = new Map<string, Set<string>>();
  for (const table of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) continue;
    const info = await transaction.execute(`PRAGMA table_info(${table});`);
    existingColumns.set(
      table,
      new Set(info.rows.map((row) => String(row.name).toLowerCase()))
    );
  }
  return existingColumns;
}

export async function runMigrations(): Promise<void> {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrationFiles = fs
    .readdirSync(migrationsPath)
    .filter((file) => /^\d{3,}_[a-z0-9_-]+\.sql$/i.test(file))
    .sort((left, right) => left.localeCompare(right));

  Logger.info("Verificando migraciones versionadas...", "MIGRATION");

  try {
    await dbClient.execute("PRAGMA foreign_keys = ON;");
    await dbClient.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const appliedResult = await dbClient.execute(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;"
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [
        String(row.version),
        { name: String(row.name), checksum: String(row.checksum) },
      ])
    );

    for (const file of migrationFiles) {
      const separatorIndex = file.indexOf("_");
      const version = file.slice(0, separatorIndex);
      const name = file.slice(separatorIndex + 1, -4);
      const sql = fs.readFileSync(path.join(migrationsPath, file), "utf-8").trim();
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.get(version);

      if (previous) {
        if (previous.name !== name || previous.checksum !== checksum) {
          throw new Error(
            `La migración ${version} ya fue aplicada pero su nombre o contenido cambió`
          );
        }
        continue;
      }

      const transaction = await dbClient.transaction("write");
      try {
        const existingColumns = await loadExistingColumns(sql, transaction);
        const executableSql = omitExistingColumns(sql, existingColumns);
        if (hasExecutableSql(executableSql)) {
          await transaction.executeMultiple(executableSql);
        }
        await transaction.execute({
          sql: `INSERT INTO schema_migrations (version, name, checksum, applied_at)
                VALUES (?, ?, ?, ?);`,
          args: [version, name, checksum, new Date().toISOString()],
        });
        await transaction.commit();
        Logger.info(`Migración aplicada: ${version}_${name}`, "MIGRATION");
      } catch (error) {
        await transaction.rollback();
        throw error;
      } finally {
        transaction.close();
      }
    }

    Logger.info("Base de datos al día.", "MIGRATION");
  } catch (error) {
    Logger.error("Error al ejecutar migraciones en Turso:", error);
    throw error;
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
