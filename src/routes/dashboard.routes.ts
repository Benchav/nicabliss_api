import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.js";
import { DashboardService } from "../services/dashboard.service.js";
import { billingRepository } from "./billing.routes.js";
import { foodOrderRepository } from "./food-order.routes.js";
import { laundryRepository } from "./laundry.routes.js";
import { guestRepository } from "./guest.routes.js";
import { cashRepository } from "./cash.routes.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

export const dashboardService = new DashboardService(
  billingRepository,
  foodOrderRepository,
  laundryRepository,
  guestRepository,
  cashRepository
);
export const dashboardController = new DashboardController(dashboardService);

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware);
dashboardRouter.use(requireRole("ADMIN", "RECEPTIONIST"));
dashboardRouter.get("/metrics", dashboardController.getMetrics);
