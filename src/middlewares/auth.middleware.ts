import { Request, Response, NextFunction } from "express";
import { JwtProvider, JwtPayload } from "../utils/jwt.js";
import { UserRepository } from "../repositories/user.repository.js";

const userRepository = new UserRepository();

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Token no proporcionado en cabecera Authorization" }
    });
    return;
  }

  const token = authHeader.substring(7).trim();

  let payload: JwtPayload;
  try {
    payload = JwtProvider.verify(token);
  } catch {
    res.status(401).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "Token de autenticación expirado o inválido" }
    });
    return;
  }

  try {
    const currentUser = await userRepository.findById(payload.sub);
    if (!currentUser) {
      res.status(401).json({
        success: false,
        error: { code: "SESSION_REVOKED", message: "La cuenta asociada a la sesión ya no está disponible" },
      });
      return;
    }
    if (payload.version !== currentUser.tokenVersion) {
      res.status(401).json({
        success: false,
        error: { code: "SESSION_REVOKED", message: "La sesión fue invalidada por un cambio de seguridad" },
      });
      return;
    }
    req.user = {
      ...payload,
      username: currentUser.username,
      email: currentUser.email,
      role: currentUser.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
