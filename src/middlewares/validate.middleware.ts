import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Los datos enviados no son válidos",
        details: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    req.body = result.data;
    next();
  };
}
