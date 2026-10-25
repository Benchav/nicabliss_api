import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dbClient } from "./client.js";
import { config } from "../config/env.js";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main(): Promise<void> {
  const migrationsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
  const expectedMigrations = fs
    .readdirSync(migrationsPath)
    .filter((file) => /^\d{3,}_[a-z0-9_-]+\.sql$/i.test(file))
    .sort()
    .map((file) => {
      const separator = file.indexOf("_");
      const sql = fs.readFileSync(path.join(migrationsPath, file), "utf8").trim();
      return {
        version: file.slice(0, separator),
        name: file.slice(separator + 1, -4),
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });

  try {
    const integrityResult = await dbClient.execute("PRAGMA integrity_check;");
    const foreignKeyResult = await dbClient.execute("PRAGMA foreign_key_check;");
    const appliedResult = await dbClient.execute(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version;"
    );
    const appliedMigrations = appliedResult.rows.map((row) => ({
      version: String(row.version),
      name: String(row.name),
      checksum: String(row.checksum),
    }));
    const tablesResult = await dbClient.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    );
    const tableCounts: Record<string, number> = {};
    for (const row of tablesResult.rows) {
      const table = String(row.name);
      const result = await dbClient.execute(
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)};`
      );
      tableCounts[table] = Number(result.rows[0].count);
    }

    const integrity = String(integrityResult.rows[0]?.integrity_check ?? "unknown");
    const checksumsMatch = JSON.stringify(expectedMigrations) === JSON.stringify(appliedMigrations);
    const report = {
      database: config.turso.url.startsWith("file:") ? config.turso.url : "remote-libsql",
      integrity,
      foreignKeyViolations: foreignKeyResult.rows.length,
      expectedMigrations: expectedMigrations.length,
      appliedMigrations: appliedMigrations.length,
      checksumsMatch,
      tableCounts,
    };
    console.log(JSON.stringify(report, null, 2));

    if (integrity !== "ok" || foreignKeyResult.rows.length > 0 || !checksumsMatch) {
      throw new Error("La base de datos no superó la verificación de integridad");
    }
  } finally {
    dbClient.close();
  }
}

main().catch((error: unknown) => {
  console.error("Falló la verificación de la base de datos:", error);
  process.exit(1);
});
