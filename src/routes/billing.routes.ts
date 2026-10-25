import { Router } from "express";
import { BillingController } from "../controllers/billing.controller.js";
import { BillingService } from "../services/billing.service.js";
import { BillingRepository } from "../repositories/billing.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { legacyReadOnly } from "../middlewares/legacy-read-only.middleware.js";

export const billingRepository = new BillingRepository();
export const billingService = new BillingService(billingRepository);
export const billingController = new BillingController(billingService);

export const billingRouter = Router();
billingRouter.use(authMiddleware);
billingRouter.use(requireRole("ADMIN", "RECEPTIONIST"));
billingRouter.get("/", billingController.getAll);
billingRouter.get("/:id", billingController.getById);
billingRouter.post("/", legacyReadOnly);
billingRouter.put("/:id", legacyReadOnly);
billingRouter.post("/:id/payments", legacyReadOnly);
billingRouter.delete("/:id", legacyReadOnly);
