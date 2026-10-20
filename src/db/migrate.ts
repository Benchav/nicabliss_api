import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dbClient } from "./client.js";
import { Logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");

  Logger.info("Iniciando ejecución de migraciones DDL en Turso...", "MIGRATION");

  try {
    // executeMultiple ejecuta todo el script con múltiples DDLs
    if (typeof dbClient.executeMultiple === "function") {
      await dbClient.executeMultiple(sql);
    } else {
      // Fallback: dividir por sentencias no vacías
      const statements = sql
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0);
      for (const statement of statements) {
        await dbClient.execute(statement);
      }
    }
    Logger.info("Migraciones completadas exitosamente en Turso.", "MIGRATION");
  } catch (error) {
    Logger.error("Error al ejecutar migraciones en Turso:", error);
    throw error;
  }
}

// Si se ejecuta directamente desde la CLI
if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
