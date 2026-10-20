import { Request, Response, NextFunction } from "express";
import { Logger } from "../utils/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on("finish", () => {
    const duration = Date.now() - start;
    Logger.info(`${method} ${originalUrl} -> ${res.statusCode} (${duration}ms)`, "HTTP");
  });

  next();
}
