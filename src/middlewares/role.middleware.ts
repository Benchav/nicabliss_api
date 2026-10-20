import { Request, Response, NextFunction } from "express";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: `Acceso denegado. Se requiere rol: ${allowedRoles.join(", ")}` }
      });
      return;
    }

    next();
  };
}
