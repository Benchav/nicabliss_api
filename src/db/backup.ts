import "dotenv/config";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { createClient, type InValue } from "@libsql/client";

type SchemaObject = {
  type: "table" | "index" | "trigger" | "view";
  name: string;
  sql: string;
};

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main(): Promise<void> {
  const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!remoteUrl?.startsWith("libsql://") || !authToken) {
    throw new Error("db:backup requiere TURSO_DATABASE_URL remota y TURSO_AUTH_TOKEN en .env");
  }

  const backupDirectory = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const backupPath = path.join(backupDirectory, `nicabliss-pre-migration-${timestamp}.db`);

  const remote = createClient({ url: remoteUrl, authToken });
  const local = createClient({ url: `file:${backupPath}` });

  try {
    const schemaResult = await remote.execute(
      `SELECT type, name, sql FROM sqlite_master
       WHERE type IN ('table', 'index', 'trigger', 'view')
         AND name NOT LIKE 'sqlite_%'
         AND sql IS NOT NULL
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END, name;`
    );
    const schema = schemaResult.rows.map((row) => ({
      type: String(row.type) as SchemaObject["type"],
      name: String(row.name),
      sql: String(row.sql),
    }));

    await local.execute("PRAGMA foreign_keys = OFF;");
    for (const object of schema.filter((item) => item.type === "table")) {
      await local.execute(object.sql);
    }

    for (const table of schema.filter((item) => item.type === "table")) {
      const columnsResult = await remote.execute(`PRAGMA table_info(${quoteIdentifier(table.name)});`);
      const columns = columnsResult.rows.map((row) => String(row.name));
      if (columns.length === 0) continue;
      const rows = await remote.execute(`SELECT * FROM ${quoteIdentifier(table.name)};`);
      if (rows.rows.length === 0) continue;
      const sql = `INSERT INTO ${quoteIdentifier(table.name)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")});`;
      const statements = rows.rows.map((row) => ({
        sql,
        args: columns.map((column) => row[column] as InValue),
      }));
      await local.batch(statements, "write");
    }

    for (const object of schema.filter((item) => item.type !== "table")) {
      await local.execute(object.sql);
    }
    await local.execute("PRAGMA foreign_keys = ON;");
    const integrity = await local.execute("PRAGMA integrity_check;");
    if (String(integrity.rows[0]?.integrity_check) !== "ok") {
      throw new Error(`El respaldo no superó integrity_check: ${JSON.stringify(integrity.rows)}`);
    }
    const foreignKeys = await local.execute("PRAGMA foreign_key_check;");
    if (foreignKeys.rows.length > 0) {
      throw new Error(`El respaldo contiene ${foreignKeys.rows.length} violaciones de claves foráneas`);
    }

    for (const table of schema.filter((item) => item.type === "table")) {
      const [remoteCount, localCount] = await Promise.all([
        remote.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)};`),
        local.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)};`),
      ]);
      if (Number(remoteCount.rows[0].count) !== Number(localCount.rows[0].count)) {
        throw new Error(`El respaldo no conserva el conteo de ${table.name}`);
      }
    }
  } finally {
    remote.close();
    local.close();
  }

  const checksum = createHash("sha256").update(fs.readFileSync(backupPath)).digest("hex");
  console.log(JSON.stringify({
    backupPath,
    checksumAlgorithm: "SHA-256",
    checksum,
    integrity: "ok",
    foreignKeyViolations: 0,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error("No se pudo crear el respaldo remoto:", error);
  process.exit(1);
});
