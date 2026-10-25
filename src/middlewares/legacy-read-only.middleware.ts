import { Request, Response } from "express";

export function legacyReadOnly(_req: Request, res: Response): void {
  res.status(405).json({
    success: false,
    error: {
      code: "LEGACY_READ_ONLY",
      message: "Este recurso heredado es de solo lectura. Use los módulos operativos actuales.",
    },
  });
}
