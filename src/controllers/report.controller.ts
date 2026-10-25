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

  public dashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getDailyDashboard(
        String(req.query.date ?? ""),
        req.query.method as PaymentMethod | undefined,
        req.query.category as string | undefined
      );
      res.json({ success: true, data, message: "Dashboard diario consultado" });
    } catch (error) { next(error); }
  };

  public services = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getServices(
        String(req.query.from ?? ""), String(req.query.to ?? ""), req.query.category as string | undefined
      );
      res.json({ success: true, data, message: "Reporte de servicios consultado" });
    } catch (error) { next(error); }
  };

  public monthlyRevenue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getMonthlyRevenue(Number(req.query.year));
      res.json({ success: true, data, message: "Ingresos mensuales consultados" });
    } catch (error) { next(error); }
  };

  public receivables = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getReceivables();
      res.json({ success: true, data, message: "Cuentas por cobrar consultadas" });
    } catch (error) { next(error); }
  };

  public revenueCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getRevenueCategories(String(req.query.from ?? ""), String(req.query.to ?? ""));
      res.json({ success: true, data, message: "Ingresos por categoría consultados" });
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
