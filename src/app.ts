import express, { Application, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/env.js";
import { requestLogger } from "./middlewares/logger.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { apiRouter } from "./routes/index.js";

export function createApp(): Application {
  const app = express();

  // Seguridad HTTP y CORS
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.cors.origin.includes(origin) || config.cors.origin.includes("*")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  // Body parsers y log de peticiones
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(requestLogger);

  // Health check público
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      system: "Nicabliss Hotel Management API",
      environment: config.nodeEnv,
      timestamp: new Date().toISOString(),
    });
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
