import { Request, Response, NextFunction } from "express";
import { Logger } from "../utils/logger.js";

export function errorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Error interno del servidor";
  const code = err.code || "INTERNAL_ERROR";

  if (statusCode === 500) {
    Logger.error("Excepción interna capturada:", err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: err.details,
    },
    timestamp: new Date().toISOString(),
  });
}
