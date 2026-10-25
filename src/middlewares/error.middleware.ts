import { Request, Response, NextFunction } from "express";
import { Logger } from "../utils/logger.js";

export function errorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction): void {
  const candidateStatus = Number(err?.statusCode);
  const statusCode = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599
    ? candidateStatus
    : 500;
  const isInternal = statusCode >= 500;
  const message = isInternal ? "Error interno del servidor" : (err?.message || "La solicitud no pudo procesarse");
  const code = isInternal ? "INTERNAL_ERROR" : (err?.code || "REQUEST_ERROR");

  if (isInternal) {
    Logger.error("Excepción interna capturada:", err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: isInternal ? undefined : err?.details,
    },
    timestamp: new Date().toISOString(),
  });
}
