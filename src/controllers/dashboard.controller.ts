import { Request, Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboard.service.js";

export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  public getMetrics = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.dashboardService.getMetrics();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  };
}
