import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { Logger } from "./utils/logger.js";

const app = createApp();

const server = app.listen(config.port, () => {
  Logger.info(`Nicabliss API lista en el puerto ${config.port} [${config.nodeEnv}]`, "SERVER");
  Logger.info(`Health check: http://localhost:${config.port}/health`, "SERVER");
  Logger.info(`Rutas API:   http://localhost:${config.port}/api/v1`, "SERVER");
});

const shutdown = (signal: string) => {
  Logger.info(`Señal ${signal} recibida. Cerrando servidor...`, "SERVER");
  server.close(() => {
    Logger.info("Servidor HTTP cerrado.", "SERVER");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
