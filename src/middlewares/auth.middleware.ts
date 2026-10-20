import { Request, Response, NextFunction } from "express";
import { JwtProvider, JwtPayload } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Token no proporcionado en cabecera Authorization" }
    });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const payload = JwtProvider.verify(token);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "Token de autenticación expirado o inválido" }
    });
  }
}
