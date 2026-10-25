import { NextFunction, Request, Response } from "express";
import { PaymentMethod } from "../models/payment.model.js";
import { ReportService } from "../services/report.service.js";

export class ReportController {
  public constructor(private readonly service: ReportService) {}

  public cashReconciliation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getCashReconciliation(this.getFilters(req));
      res.json({ success: true, data, message: "Conciliación de caja consultada" });
    } catch (error) { next(error); }
  };

  public cashByMethod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getCashByMethod(this.getFilters(req));
      res.json({ success: true, data, message: "Caja agrupada por método" });
    } catch (error) { next(error); }
  };

  public cashByUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getCashByUser(this.getFilters(req));
      res.json({ success: true, data, message: "Caja agrupada por usuario" });
    } catch (error) { next(error); }
  };

  private getFilters(req: Request) {
    return {
      sessionId: req.query.sessionId === undefined ? undefined : Number(req.query.sessionId),
      method: req.query.method as PaymentMethod | undefined,
      userId: req.query.userId as string | undefined,
    };
  }
}
