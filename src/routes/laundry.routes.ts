import { Router } from "express";
import { LaundryController } from "../controllers/laundry.controller.js";
import { LaundryService } from "../services/laundry.service.js";
import { LaundryRepository } from "../repositories/laundry.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

export const laundryRepository = new LaundryRepository();
export const laundryService = new LaundryService(laundryRepository);
export const laundryController = new LaundryController(laundryService);

export const laundryRouter = Router();
laundryRouter.use(authMiddleware);
laundryRouter.use(requireRole("ADMIN", "RECEPTIONIST", "STAFF"));
laundryRouter.get("/", laundryController.getAll);
laundryRouter.get("/:id", laundryController.getById);
laundryRouter.post("/", laundryController.create);
laundryRouter.put("/:id", laundryController.update);
laundryRouter.patch("/:id/status", laundryController.updateStatus);
laundryRouter.delete("/:id", laundryController.delete);
