import { Router } from "express";
import { ReportController } from "../controllers/report.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { ReportRepository } from "../repositories/report.repository.js";
import { ReportService } from "../services/report.service.js";

export const reportRepository = new ReportRepository();
export const reportService = new ReportService(reportRepository);
export const reportController = new ReportController(reportService);

export const reportRouter = Router();
reportRouter.use(authMiddleware);
reportRouter.get("/dashboard", requireRole("ADMIN", "RECEPTIONIST"), reportController.dashboard);
reportRouter.use(requireRole("ADMIN", "RECEPTIONIST"));
reportRouter.get("/cash/reconciliation", reportController.cashReconciliation);
reportRouter.get("/cash/by-method", reportController.cashByMethod);
reportRouter.get("/cash/by-user", reportController.cashByUser);
reportRouter.get("/services", reportController.services);
reportRouter.get("/revenue/monthly", reportController.monthlyRevenue);
reportRouter.get("/receivables", reportController.receivables);
reportRouter.get("/revenue/categories", reportController.revenueCategories);
