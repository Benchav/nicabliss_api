import { Router } from "express";
import { CashController } from "../controllers/cash.controller.js";
import { CashService } from "../services/cash.service.js";
import { CashRepository } from "../repositories/cash.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

export const cashRepository = new CashRepository();
export const cashService = new CashService(cashRepository);
export const cashController = new CashController(cashService);

export const cashRouter = Router();
cashRouter.use(authMiddleware);
cashRouter.use(requireRole("ADMIN", "RECEPTIONIST"));
cashRouter.get("/current", cashController.getCurrent);
cashRouter.post("/open", cashController.openSession);
cashRouter.post("/movements", cashController.addMovement);
cashRouter.post("/close", cashController.closeSession);
cashRouter.get("/history", cashController.getHistory);
