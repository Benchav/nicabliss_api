import { NextFunction, Request, Response } from "express";
import { PaymentMethod } from "../models/payment.model.js";
import { ReportService } from "../services/report.service.js";
import { ReportExportRequest, ReportExportService } from "../services/report-export.service.js";

export class ReportController {
  public constructor(
    private readonly service: ReportService,
    private readonly exportService: ReportExportService
  ) {}

  public exportWorkbook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.exportService.createWorkbook({
        period: String(req.query.period ?? ""),
        date: req.query.date === undefined ? undefined : String(req.query.date),
        month: req.query.month === undefined ? undefined : String(req.query.month),
        method: req.query.method === undefined ? undefined : String(req.query.method),
        category: req.query.category === undefined ? undefined : String(req.query.category),
      } satisfies ReportExportRequest);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
      res.setHeader("Content-Length", String(result.buffer.length));
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.status(200).send(result.buffer);
    } catch (error) { next(error); }
  };

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
      const data = await this.service.getRevenueCategories(
        String(req.query.from ?? ""),
        String(req.query.to ?? ""),
        req.query.category as string | undefined
      );
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
