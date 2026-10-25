import { Router } from "express";
import { ServiceController } from "../controllers/service.controller.js";
import { StayController } from "../controllers/stay.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { ServiceRepository } from "../repositories/service.repository.js";
import { StayRepository } from "../repositories/stay.repository.js";
import { ServiceService } from "../services/service.service.js";
import { StayService } from "../services/stay.service.js";
import { createCatalogSchema, createConsumptionSchema, updateCatalogSchema, updateConsumptionStatusSchema } from "../validators/service.validator.js";

export const stayRepository = new StayRepository();
export const serviceRepository = new ServiceRepository();
const stayService = new StayService(stayRepository, serviceRepository);
const serviceService = new ServiceService(serviceRepository);
export const stayController = new StayController(stayService);
const serviceController = new ServiceController(serviceService);

export const stayRouter = Router();
stayRouter.use(authMiddleware, requireRole("ADMIN", "RECEPTIONIST", "STAFF"));
stayRouter.get("/", stayController.getAll);
stayRouter.get("/:id/services", serviceController.getByStay);
stayRouter.post("/:id/services", validateBody(createConsumptionSchema), serviceController.createConsumption);
stayRouter.post("/:id/check-out", requireRole("ADMIN", "RECEPTIONIST"), stayController.checkOut);
stayRouter.get("/:id", stayController.getById);

export const serviceCatalogRouter = Router();
serviceCatalogRouter.use(authMiddleware);
serviceCatalogRouter.get("/", requireRole("ADMIN", "RECEPTIONIST", "STAFF"), serviceController.getCatalog);
serviceCatalogRouter.post("/", requireRole("ADMIN"), validateBody(createCatalogSchema), serviceController.createCatalog);
serviceCatalogRouter.put("/:id", requireRole("ADMIN"), validateBody(updateCatalogSchema), serviceController.updateCatalog);

export const serviceConsumptionRouter = Router();
serviceConsumptionRouter.use(authMiddleware, requireRole("ADMIN", "RECEPTIONIST", "STAFF"));
serviceConsumptionRouter.patch("/:id/status", validateBody(updateConsumptionStatusSchema), serviceController.updateStatus);
