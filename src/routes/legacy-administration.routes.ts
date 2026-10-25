import { Router } from "express";
import { LegacyAdministrationController } from "../controllers/legacy-administration.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { LegacyAdministrationRepository } from "../repositories/legacy-administration.repository.js";
import { LegacyAdministrationService } from "../services/legacy-administration.service.js";
import { acceptLegacyUnlinkedSchema } from "../validators/legacy-administration.validator.js";

const repository = new LegacyAdministrationRepository();
const service = new LegacyAdministrationService(repository);
const controller = new LegacyAdministrationController(service);

export const legacyAdministrationRouter = Router();
legacyAdministrationRouter.use(authMiddleware, requireRole("ADMIN"));
legacyAdministrationRouter.get("/historical-accounts", controller.historicalAccounts);
legacyAdministrationRouter.get("/reviews", controller.reviews);
legacyAdministrationRouter.patch("/reviews/:id/accept-unlinked", validateBody(acceptLegacyUnlinkedSchema), controller.acceptUnlinked);
