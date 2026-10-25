import { Router } from "express";
import { GuestController } from "../controllers/guest.controller.js";
import { GuestService } from "../services/guest.service.js";
import { GuestRepository } from "../repositories/guest.repository.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";
import { legacyReadOnly } from "../middlewares/legacy-read-only.middleware.js";

export const guestRepository = new GuestRepository();
export const guestService = new GuestService(guestRepository);
export const guestController = new GuestController(guestService);

export const guestRouter = Router();
guestRouter.use(authMiddleware);
guestRouter.use(requireRole("ADMIN", "RECEPTIONIST"));
guestRouter.get("/", guestController.getAll);
guestRouter.get("/:id", guestController.getById);
guestRouter.post("/", legacyReadOnly);
guestRouter.put("/:id", legacyReadOnly);
guestRouter.patch("/:id/status", legacyReadOnly);
guestRouter.delete("/:id", legacyReadOnly);
