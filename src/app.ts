import express, { Application, Request, Response } from "express";
import cors, { CorsOptions } from "cors";
import * as helmetModule from "helmet";
import { config } from "./config/env.js";
import { requestLogger } from "./middlewares/logger.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { apiRouter } from "./routes/index.js";
import { dbClient } from "./db/client.js";
import { REQUIRED_SCHEMA_VERSION } from "./db/schema.js";
import { Logger } from "./utils/logger.js";

export function createApp(): Application {
  const app = express();
  app.set("trust proxy", config.trustProxy ? 1 : false);
  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        config.cors.origin.includes(origin) ||
        config.cors.origin.includes("*")
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  };

  // Seguridad HTTP y CORS
  app.use(helmetModule.default());
  app.use(cors(corsOptions));

  // Manejo explícito de preflight OPTIONS
  app.options("*", cors(corsOptions));

  // Body parsers y log de peticiones
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(requestLogger);

  // Endpoint raíz informativo
  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      name: "Nicabliss Hotel Management API",
      environment: config.nodeEnv,
      version: "1.0.0",
      endpoints: {
        health: "/health",
        readiness: "/ready",
        api: "/api/v1",
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Health check público
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      system: "Nicabliss Hotel Management API",
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness: confirma conectividad y versión mínima del esquema sin exponer secretos.
  app.get("/ready", async (_req: Request, res: Response) => {
    try {
      await dbClient.execute("SELECT 1 AS ok;");
      const migration = await dbClient.execute({
        sql: "SELECT version FROM schema_migrations WHERE version = ? LIMIT 1;",
        args: [REQUIRED_SCHEMA_VERSION],
      });
      if (!migration.rows[0]) {
        return res.status(503).json({
          status: "not_ready",
          error: { code: "SCHEMA_OUTDATED", message: "La base de datos requiere migraciones" },
          timestamp: new Date().toISOString(),
        });
      }
      return res.status(200).json({
        status: "ready",
        database: "connected",
        schemaVersion: REQUIRED_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      Logger.error("Falló la comprobación de readiness:", error);
      return res.status(503).json({
        status: "not_ready",
        error: { code: "DATABASE_UNAVAILABLE", message: "La base de datos no está disponible" },
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Montar todas las rutas bajo /api/v1
  app.use("/api/v1", apiRouter);

  // Manejo de ruta no encontrada 404
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "La ruta solicitada no existe en la API" }
    });
  });

  // Manejador central de errores
  app.use(errorMiddleware);

  return app;
}

const app = createApp();

export default app;
