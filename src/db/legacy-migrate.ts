import { config } from "../config/env.js";
import { Logger } from "../utils/logger.js";
import { LegacyMigrationService } from "../services/legacy-migration.service.js";

function assertExecutionAllowed(): void {
  const remote = /^(libsql|https?):\/\//i.test(config.turso.url);
  if (!remote) return;
  if (
    process.env.ALLOW_LEGACY_MIGRATION !== "true" ||
    process.env.LEGACY_MIGRATION_CONFIRMATION !== "BACKUP_VERIFIED"
  ) {
    throw new Error(
      "Migración remota bloqueada: requiere ALLOW_LEGACY_MIGRATION=true y LEGACY_MIGRATION_CONFIRMATION=BACKUP_VERIFIED después de respaldo y ensayo"
    );
  }
}

async function main() {
  const execute = process.argv.includes("--execute");
  const service = new LegacyMigrationService();
  if (execute) assertExecutionAllowed();
  const report = execute ? await service.execute() : await service.preview();
  console.log(JSON.stringify(report, null, 2));
  if (!execute) Logger.info("Previsualización completada sin escribir datos. Use --execute solo sobre una copia ensayada.", "LEGACY_MIGRATION");
}

main().then(() => process.exit(0)).catch((error) => {
  Logger.error("Falló la migración heredada:", error);
  process.exit(1);
});
