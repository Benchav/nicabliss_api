import fs from "fs";
import path from "path";

async function bootstrapE2e(): Promise<void> {
  if (process.env.NODE_ENV !== "test" || process.env.TEST_DATABASE_URL !== "file:test.db") {
    throw new Error("El servidor E2E solo puede usar NODE_ENV=test y TEST_DATABASE_URL=file:test.db");
  }

  const databasePath = path.resolve(process.cwd(), "test.db");
  for (const suffix of ["", "-shm", "-wal"]) {
    const candidate = `${databasePath}${suffix}`;
    if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
  }

  const [{ config }, { runMigrations }, { runSeeds }, { createApp }, { Logger }] = await Promise.all([
    import("./config/env.js"),
    import("./db/migrate.js"),
    import("./db/seed.js"),
    import("./app.js"),
    import("./utils/logger.js"),
  ]);
  await runMigrations();
  await runSeeds();

  const server = createApp().listen(config.port, "127.0.0.1", () => {
    Logger.info(`Servidor E2E listo en http://127.0.0.1:${config.port} con file:test.db`, "E2E");
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrapE2e().catch((error: unknown) => {
  console.error("No se pudo iniciar el servidor E2E:", error);
  process.exit(1);
});
